"""공백 탐지 규칙 2개를 성북구 실데이터로 돌려 결과 CSV와 지도 HTML을 만든다.

규칙 1  소방용수시설 좌표 누락·이상 (좌표 없음, 0, 성북구 범위 밖)
규칙 2  같은 도로명주소에 서로 다른 종류의 안전시설이 겹침 (소방용수, 무더위쉼터, AED, 어린이보호구역)
규칙 3  보호구역 경계 밖은 경계(면) 데이터가 없어 이 스크립트에서 계산하지 않음
        (대신 보호구역 지정 범위인 시설 반경 300m를 우선순위 점수에 씀: backend/app/scoring.py)
규칙 5  소방용수 거리 기준: 어린이 시설·무더위쉼터에서 사용 가능한 소방용수까지 100m 초과
        (소방기본법 시행규칙 별표3: 주거·상업·공업지역 수평거리 100m 이하, 그 외 140m 이하)

실행: python poc/gap_rules.py   (data/raw 의 4개 파일이 필요)
출력: data/gap_candidates.csv, poc/gap_map.html
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from shapely import wkt

from common import filter_seongbuk, read_table

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CENTER = (37.5894, 127.0167)
BOX = (37.55, 37.64, 126.97, 127.08)  # 성북구를 넉넉히 감싸는 위경도 범위 (남, 북, 서, 동)

ADDR_RE = re.compile(r"성북구\s+(\S+)\s+(\d+(?:-\d+)?)")


def norm_addr(s: str) -> str | None:
    """'서울특별시 성북구 아리랑로 89 (돈암동, …)' -> '아리랑로 89'. 도로명주소가 아니면 None."""
    m = ADDR_RE.search(str(s))
    return f"{m.group(1)} {m.group(2)}" if m else None


def load() -> tuple[dict[str, pd.DataFrame], pd.DataFrame]:
    fw, _ = read_table(RAW / "서울시 소방용수시설 현황.csv")
    fw, _ = filter_seongbuk(fw)
    shelter, _ = read_table(RAW / "서울시 무더위쉼터.csv")
    shelter, _ = filter_seongbuk(shelter)
    zone, _ = read_table(RAW / "전국어린이보호구역표준데이터.csv")
    zone, _ = filter_seongbuk(zone)
    aed = pd.read_csv(RAW / "AED_성북구.csv")

    out = {}
    fw = fw.copy()
    fw["기준일"] = fw["데이터기준일자"].astype(str).str.strip()
    fw_raw = fw.copy()  # 갱신 정체 규칙은 기준일별 기록 전체가 필요
    fw = fw.sort_values("기준일").drop_duplicates("시설번호", keep="last")  # 같은 시설은 최신 기준일만
    out["소방용수"] = pd.DataFrame({"이름": fw["시설번호"], "주소": fw["소재지도로명주소"],
                                "lat": pd.to_numeric(fw["위도"], errors="coerce"),
                                "lon": pd.to_numeric(fw["경도"], errors="coerce")})
    out["무더위쉼터"] = pd.DataFrame({"이름": shelter["쉼터명칭"], "주소": shelter["도로명주소"],
                                  "lat": pd.to_numeric(shelter["위도"], errors="coerce"),
                                  "lon": pd.to_numeric(shelter["경도"], errors="coerce")})
    out["어린이보호구역"] = pd.DataFrame({"이름": zone["대상시설명"], "주소": zone["소재지도로명주소"],
                                    "lat": pd.to_numeric(zone["위도"], errors="coerce"),
                                    "lon": pd.to_numeric(zone["경도"], errors="coerce")})
    out["AED"] = pd.DataFrame({"이름": aed["org"], "주소": aed["buildAddress"],
                              "lat": pd.to_numeric(aed["wgs84Lat"], errors="coerce"),
                              "lon": pd.to_numeric(aed["wgs84Lon"], errors="coerce")})
    for k, d in out.items():
        d["종류"] = k
        d["주소키"] = d["주소"].map(norm_addr)
    return out, fw_raw


def rule1(fw: pd.DataFrame) -> pd.DataFrame:
    s, n, w, e = BOX
    bad = fw["lat"].isna() | fw["lon"].isna() | (fw["lat"] == 0) | (fw["lon"] == 0)
    out = ~bad & ((fw["lat"] < s) | (fw["lat"] > n) | (fw["lon"] < w) | (fw["lon"] > e))
    r = fw[bad | out].copy()
    r["규칙"] = "소방용수 좌표 누락·이상"
    r["사유"] = ["좌표 없음" if b else "성북구 범위 밖" for b in bad[bad | out]]
    return r


def rule2(all_: pd.DataFrame) -> pd.DataFrame:
    keyed = all_.dropna(subset=["주소키"])
    g = keyed.groupby("주소키")["종류"].nunique()
    multi = g[g >= 2].index
    r = keyed[keyed["주소키"].isin(multi)].copy()
    r["규칙"] = "같은 주소 안전시설 중복"
    r["사유"] = r["주소키"] + " 에 " + r.groupby("주소키")["종류"].transform(lambda x: "·".join(sorted(set(x)))) + " 겹침"
    return r


ZONE_FILE = RAW / "보호구역_성북구.json"
ZONE_CRS = "EPSG:5181"      # 경찰청 API 도형 좌표계. 같은 시설의 CSV 좌표와 비교해 중앙값 37m 차이로 확인
HYDRANT_LIMIT_M = 140       # 소방용수까지 거리 기준(m). 소방기본법 시행규칙 별표3: 주거·상업·공업지역 100m, 그 외 140m (docs/decisions.md). 이 규칙은 140m만 봄


def rule3(d: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """보호구역 안전시설 공백: 보호구역 경계(없으면 시설 점)에서 가장 가까운 소방용수까지 거리가 기준을 넘는 곳."""
    if not ZONE_FILE.exists():
        return pd.DataFrame(columns=["규칙", "종류", "이름", "주소", "lat", "lon", "사유", "거리"])
    zones = json.loads(ZONE_FILE.read_text(encoding="utf-8"))
    to_m = Transformer.from_crs("EPSG:4326", ZONE_CRS, always_xy=True)
    to_ll = Transformer.from_crs(ZONE_CRS, "EPSG:4326", always_xy=True)
    s, n, w, e = BOX
    h = d["소방용수"].dropna(subset=["lat", "lon"])
    h = h[(h.lat > s) & (h.lat < n) & (h.lon > w) & (h.lon < e)]
    hx, hy = to_m.transform(h["lon"].to_numpy(), h["lat"].to_numpy())
    pts = shapely.points(hx, hy)
    rows = []
    for z in zones:
        g = wkt.loads(z["fturGeomVl"])
        parts = list(getattr(g, "geoms", [g]))
        polys = [p for p in parts if p.geom_type == "Polygon"]
        use = polys if polys else parts  # 도형 하나하나와의 거리 중 최솟값 (합치기는 잘못된 도형에서 실패하므로 안 함)
        dist = float(min(np.min(shapely.distance(shapely.make_valid(g1), pts)) for g1 in use))
        c = shapely.make_valid(use[0]).representative_point()
        lon, lat = to_ll.transform(c.x, c.y)
        kind = "어린이보호구역" if str(z.get("fcltTypeCd")) == "1" else "노인·장애인보호구역"
        rows.append({"규칙": "보호구역 소방용수 거리 초과", "종류": kind, "이름": z["trgtFcltNm"],
                     "주소": z.get("roadNmAddr", ""), "lat": lat, "lon": lon, "거리": dist,
                     "사유": f"{'경계' if polys else '시설 위치'}에서 가장 가까운 소방용수까지 {dist:.0f}m"})
    out = pd.DataFrame(rows)
    out["경계있음"] = [any(p.geom_type == "Polygon" for p in getattr(wkt.loads(z["fturGeomVl"]), "geoms", [])) for z in zones]
    return out


def rule4(raw: pd.DataFrame) -> pd.DataFrame:
    """소방용수 갱신 정체: 시설번호별로 모든 기준일 기록을 보고 아래 셋 중 하나면 후보.
    - 사용불가 표시: 가장 최근에 적힌 사용가능여부가 N
    - 상태 기록 없음: 어느 기준일에도 사용가능여부가 비어 있음
    - 갱신 기록 없음: 사용가능여부는 있으나 가장 최신 기준일 파일에 시설이 없음"""
    raw = raw.copy()
    raw["상태"] = raw["사용가능여부"].astype(str).str.strip().replace({"nan": ""})
    raw["lat"] = pd.to_numeric(raw["위도"], errors="coerce")
    raw["lon"] = pd.to_numeric(raw["경도"], errors="coerce")
    newest = raw["기준일"].max()
    rows = []
    for sid, g in raw.sort_values("기준일").groupby("시설번호"):
        last = g.iloc[-1]
        known = g[g["상태"] != ""]
        status = known.iloc[-1]["상태"] if len(known) else ""
        if status == "N":
            kind, why = "사용불가 표시", f"사용가능여부 N (기준일 {known.iloc[-1]['기준일']})"
        elif status == "":
            kind, why = "상태 기록 없음", f"사용가능여부·설치연도 비어 있음 (기준일 {last['기준일']})"
        elif last["기준일"] < newest:
            kind, why = "갱신 기록 없음", f"기준일 {last['기준일']} 이후 기록 없음 (최신 파일 {newest}에 없음)"
        else:
            continue
        rows.append({"규칙": "소방용수 갱신 정체", "종류": "소방용수", "이름": sid,
                     "주소": last["소재지도로명주소"], "lat": last["lat"], "lon": last["lon"],
                     "사유": f"{kind}: {why}", "세부": kind})
    return pd.DataFrame(rows)


HYDRANT_DIST_URBAN_M = 100   # 소방기본법 시행규칙 별표3 1.가 (주거·상업·공업지역)
HYDRANT_DIST_OTHER_M = 140   # 같은 별표 1.나 (그 외 지역)
# 아파트 단지 추정 (이름·주소 글자로만 판단하므로 추정임)
APT_RE = re.compile(r"\(아\)|아파트|단지|뉴타운|\d+동\)|래미안|푸르지오|e편한세상|힐스테이트|아이파크|위브|자이|롯데캐슬|센트레빌")


def _haversine_m(lat, lon, lats, lons):
    import numpy as np
    p1, p2 = np.radians(lat), np.radians(lats)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lons - lon) / 2) ** 2
    return 2 * 6_371_000 * np.arcsin(np.sqrt(a))


def rule5(d: dict[str, pd.DataFrame], fw_raw: pd.DataFrame) -> pd.DataFrame:
    """어린이보호구역 대상 시설·무더위쉼터에서 가장 가까운 '사용 가능' 소방용수가 100m를 넘는 곳.
    - 사용 가능: 가장 최근 기록의 사용가능여부가 N이 아닌 것 (기록이 비어 있으면 사용 가능으로 봄 → 보수적으로 덜 잡힘)
    - 용도지역을 모르므로 100m 초과는 '기준 초과 의심', 140m 초과는 어느 지역이든 기준 초과로 구분
    - 시설 좌표는 건물 대표점이라 실제 건물 끝과의 거리와 다를 수 있음 → 점검 후보일 뿐
    - 아파트 단지 안 옥외소화전은 공공 소방용수 데이터에 없음 → 아파트 항목은 따로 표시"""
    import numpy as np
    raw = fw_raw.copy()
    raw["상태"] = raw["사용가능여부"].astype(str).str.strip().replace({"nan": ""})
    raw["lat"] = pd.to_numeric(raw["위도"], errors="coerce")
    raw["lon"] = pd.to_numeric(raw["경도"], errors="coerce")
    rows = []
    for sid, g in raw.sort_values("기준일").groupby("시설번호"):
        known = g[g["상태"] != ""]
        rows.append({"lat": g["lat"].iloc[-1], "lon": g["lon"].iloc[-1],
                     "상태": known["상태"].iloc[-1] if len(known) else ""})
    h = pd.DataFrame(rows)
    s, n, w, e = BOX
    h = h[(h["상태"] != "N") & h["lat"].between(s, n) & h["lon"].between(w, e)]
    hl, ho = h["lat"].to_numpy(), h["lon"].to_numpy()

    out = []
    for kind in ("어린이보호구역", "무더위쉼터"):
        for r in d[kind].itertuples():
            if not (r.lat == r.lat and r.lon == r.lon):
                continue
            dist = float(np.min(_haversine_m(r.lat, r.lon, hl, ho)))
            if dist > HYDRANT_DIST_URBAN_M:
                level = "140m 초과" if dist > HYDRANT_DIST_OTHER_M else "100~140m"
                # 아파트 단지 안 옥외소화전(건물 소방시설)은 공공 소방용수 데이터에 없어 실제로는 기준을 채울 수 있음
                apt = bool(APT_RE.search(f"{r.이름} {r.주소}"))
                note = " · 아파트 단지 안 옥외소화전은 이 데이터에 없음 (현장 확인)" if apt else ""
                out.append({"규칙": "소방용수 거리 기준 초과 의심", "종류": kind, "이름": r.이름, "주소": r.주소,
                            "lat": r.lat, "lon": r.lon, "거리": round(dist), "단계": level, "아파트": apt,
                            "사유": f"가장 가까운 사용 가능 소방용수 {dist:.0f}m (기준 100m, 주거·상업·공업지역 외 140m){note}"})
    return pd.DataFrame(out)


def build_html(points: list[dict], summary: str) -> str:
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>성북구 공백 탐지 결과</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body{{margin:0;height:100%;font-family:'Malgun Gothic',sans-serif}}
#side{{position:absolute;left:0;top:0;bottom:0;width:300px;overflow:auto;box-sizing:border-box;padding:12px;border-right:1px solid #999;background:#fff;font-size:13px}}
#map{{position:absolute;left:300px;right:0;top:0;bottom:0}} h1{{font-size:15px;margin:0 0 8px}} .n{{color:#555}}
.lg span{{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:6px}}</style></head><body>
<div id="side"><h1>성북구 공백 탐지 결과</h1><div class="n">실제 공공데이터 기준 (2026-10-19 내려받음)</div><pre style="white-space:pre-wrap">{summary}</pre>
<div class="lg"><div><span style="background:#6d28d9"></span>같은 주소에 안전시설 겹침</div><div><span style="background:#b91c1c"></span>소방용수 좌표 이상</div><div><span style="background:#c2410c"></span>소방용수 사용불가 표시</div><div><span style="background:#0f766e"></span>보호구역 소방용수 거리 초과</div></div></div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pts={json.dumps(points, ensure_ascii=False)};
const map=L.map('map').setView([{CENTER[0]},{CENTER[1]}],13);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}}).addTo(map);
pts.forEach(p=>L.circleMarker([p.lat,p.lon],{{radius:6,color:p.c,fillColor:p.c,fillOpacity:.75,weight:1}}).bindPopup(p.t).addTo(map));
</script></body></html>"""


def main() -> None:
    d, fw_raw = load()
    all_ = pd.concat(d.values(), ignore_index=True)
    print({k: len(v) for k, v in d.items()})

    r1 = rule1(d["소방용수"])
    r2 = rule2(all_)
    r4 = rule4(fw_raw)
    r3_all = rule3(d)
    r3 = r3_all[r3_all["거리"] > HYDRANT_LIMIT_M] if len(r3_all) else r3_all
    kinds4 = r4["세부"].value_counts()
    sites = r2.groupby("주소키")
    n_sites = sites.ngroups
    combo = sites["종류"].apply(lambda x: "·".join(sorted(set(x)))).value_counts()

    cols = ["규칙", "종류", "이름", "주소", "lat", "lon", "사유"]
    res = pd.concat([r1[cols], r2[cols], r4[cols]], ignore_index=True)  # 규칙 3은 백엔드 적재 형식을 건드리지 않도록 별도 파일로 저장
    if len(r3_all):
        r3_all.drop(columns=["규칙"]).to_csv(ROOT / "data" / "gap_zone_distance.csv", index=False, encoding="utf-8-sig")
    out = ROOT / "data" / "gap_candidates.csv"
    res.to_csv(out, index=False, encoding="utf-8-sig")

    summary = (f"규칙1 소방용수 좌표 누락·이상: {len(r1)}건 (소방용수 {len(d['소방용수']):,}개 중)\n"
               f"규칙2 같은 주소에 2종 이상 겹침: {n_sites}곳\n"
               + "\n".join(f"  {k}: {v}곳" for k, v in combo.items())
               + f"\n규칙4 소방용수 갱신 정체: {len(r4)}건 (시설번호 기준)\n"
               + "\n".join(f"  {k}: {v}건" for k, v in kinds4.items())
               + (f"\n규칙3 보호구역 {len(r3_all)}곳 중 소방용수까지 {HYDRANT_LIMIT_M}m 초과: {len(r3)}곳"
                  f" (경계 도형이 있는 곳 {int(r3_all['경계있음'].sum())}곳)" if len(r3_all) else "\n규칙3 보호구역 경계 데이터 없음"))
    print(summary)

    points = []
    for _, r in r2.dropna(subset=["lat", "lon"]).iterrows():
        points.append({"lat": r["lat"], "lon": r["lon"], "c": "#6d28d9", "t": f"{r['종류']} {r['이름']}<br>{r['사유']}"})
    for _, r in r4[r4["세부"] == "사용불가 표시"].dropna(subset=["lat", "lon"]).iterrows():
        points.append({"lat": r["lat"], "lon": r["lon"], "c": "#c2410c", "t": f"{r['이름']}<br>{r['사유']}"})
    for _, r in r3.dropna(subset=["lat", "lon"]).iterrows():
        points.append({"lat": r["lat"], "lon": r["lon"], "c": "#0f766e", "t": f"{r['이름']} ({r['종류']})<br>{r['사유']}"})
    for _, r in r1.dropna(subset=["lat", "lon"]).iterrows():
        points.append({"lat": r["lat"], "lon": r["lon"], "c": "#b91c1c", "t": f"{r['이름']}<br>{r['사유']}"})
    (ROOT / "poc" / "gap_map.html").write_text(build_html(points, summary), encoding="utf-8")
    print("저장:", out, "/ poc/gap_map.html (지도에 찍힌 점", len(points), "개)")
    print("좌표 이상 소방용수 목록(상위 5):")
    print(r1[["이름", "주소", "lat", "lon", "사유"]].head(5).to_string())


if __name__ == "__main__":
    main()
