"""공공데이터 읽기 공통 함수: 파일 스캔, 인코딩 판별, 좌표 열 찾기, WGS84 변환."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
from pyproj import Transformer

POC_DIR = Path(__file__).resolve().parent
ROOT = POC_DIR.parent
SAMPLE_FILE = POC_DIR / "sample_facilities.csv"

ENCODINGS = ("utf-8-sig", "cp949", "euc-kr")
SKIP_DIRS = {"node_modules", ".git", "venv", ".venv", "__pycache__"}

LAT_NAMES = ("위도", "lat", "latitude", "y좌표", "좌표y", "ycrd", "y")
LON_NAMES = ("경도", "lon", "lng", "longitude", "x좌표", "좌표x", "xcrd", "x")
NAME_NAMES = ("시설명", "명칭", "이름", "name", "시설물명", "소방용수명")


def find_data_files() -> list[Path]:
    """프로젝트 폴더와 상위(해커톤) 폴더의 CSV/Excel. 샘플 파일은 제외."""
    found: list[Path] = []
    for base in (ROOT, ROOT.parent):
        for p in base.rglob("*"):
            if p.suffix.lower() not in (".csv", ".xlsx", ".xls"):
                continue
            if SKIP_DIRS & set(p.parts) or p == SAMPLE_FILE or p.name == "gap_candidates.csv":  # 우리가 만든 결과 파일은 원본이 아님
                continue
            if p not in found:
                found.append(p)
    return found


def read_table(path: Path) -> tuple[pd.DataFrame, str]:
    """(표, 사용한 인코딩) 반환. 깨진 글자(U+FFFD)가 없는 첫 인코딩을 채택.
    전부 실패하면 cp949로 읽되 해석 못 하는 바이트만 대체하고 인코딩 이름에 표시."""
    if path.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(path), "excel"
    last_err: Exception | None = None
    for enc in ENCODINGS:
        try:
            df = pd.read_csv(path, encoding=enc, low_memory=False)
        except (UnicodeDecodeError, pd.errors.ParserError) as e:
            last_err = e
            continue
        if not any("�" in str(c) for c in df.columns):
            return df, enc
    try:  # 공공데이터에는 cp949로 못 읽는 바이트가 몇 개 섞인 파일이 있음
        df = pd.read_csv(path, encoding="cp949", encoding_errors="replace", low_memory=False)
    except Exception as e:
        raise ValueError(f"{path.name}: 인코딩 판별 실패 ({last_err}; {e})")
    return df, "cp949(깨진 바이트 일부 대체)"


SEONGBUK = "성북"
GU_COLS = ("시군구명", "자치구", "구명", "시군구")
ADDR_COLS = ("소재지도로명주소", "도로명주소", "주소", "소재지지번주소", "지번주소")


def filter_seongbuk(df: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    """구 이름 열이 있고 '성북' 행이 있으면 그 행만. (표, 설명) 반환."""
    for name in GU_COLS:
        for c in df.columns:
            if str(c).strip() == name:
                hit = df[c].astype(str).str.contains(SEONGBUK, na=False)
                if hit.any():
                    return df[hit].reset_index(drop=True), f"{c} 열 기준 성북구 {int(hit.sum()):,}행만 사용 (전체 {len(df):,}행)"
    for name in ADDR_COLS:  # 구 이름 열이 없으면 주소 열에서 '성북구' 찾기
        for c in df.columns:
            if str(c).strip() == name:
                hit = df[c].astype(str).str.contains("성북구", na=False)
                if hit.any():
                    return df[hit].reset_index(drop=True), f"{c} 열에 '성북구'가 들어간 {int(hit.sum()):,}행만 사용 (전체 {len(df):,}행)"
    return df, ""


def _pick(columns, names) -> str | None:
    lowered = {str(c).strip().lower().replace(" ", ""): c for c in columns}
    for n in names:
        if n in lowered:
            return lowered[n]
    for key, col in lowered.items():
        if any(n in key for n in names if len(n) > 1):
            return col
    return None


def find_columns(df: pd.DataFrame) -> dict[str, str | None]:
    return {
        "lat": _pick(df.columns, LAT_NAMES),
        "lon": _pick(df.columns, LON_NAMES),
        "name": _pick(df.columns, NAME_NAMES),
    }


def detect_crs(lat: pd.Series, lon: pd.Series) -> str:
    """값 범위로 좌표계 추정. WGS84 / EPSG:5179 / EPSG:5186 / EPSG:5174 / unknown."""
    a, b = lat.dropna(), lon.dropna()
    if a.empty or b.empty:
        return "unknown"
    ymed, xmed = a.median(), b.median()
    if 33 <= ymed <= 39 and 124 <= xmed <= 132:
        return "WGS84"
    if 1_000_000 < ymed < 2_500_000 and 700_000 < xmed < 1_500_000:
        return "EPSG:5179"
    if 400_000 < ymed < 700_000 and 100_000 < xmed < 300_000:
        return "EPSG:5186"  # 5174(구 중부원점)도 같은 범위지만 값이 수백 m 어긋남. 확인 필요
    return "unknown"


def to_wgs84(df: pd.DataFrame, lat_col: str, lon_col: str, crs: str) -> pd.DataFrame:
    """lat/lon 열(WGS84)을 추가해 반환. 숫자가 아닌 값과 0은 결측 처리."""
    out = df.copy()
    y = pd.to_numeric(out[lat_col], errors="coerce").replace(0, pd.NA)
    x = pd.to_numeric(out[lon_col], errors="coerce").replace(0, pd.NA)
    y, x = y.astype("float64"), x.astype("float64")
    if crs == "WGS84":
        out["_lat"], out["_lon"] = y, x
    elif crs.startswith("EPSG:"):
        ok = y.notna() & x.notna()
        t = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        lon_o, lat_o = t.transform(x[ok].to_numpy(), y[ok].to_numpy())
        out["_lat"], out["_lon"] = float("nan"), float("nan")
        out.loc[ok, "_lat"], out.loc[ok, "_lon"] = lat_o, lon_o
    else:
        raise ValueError(f"좌표계를 알 수 없음: {crs}")
    return out
