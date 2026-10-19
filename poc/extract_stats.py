"""PPT 4장(문제 수치), 14장(기대효과)용 수치 계산 -> poc/ppt_stats.md

실행: python poc/extract_stats.py
- 4장 수치는 실제 CSV/Excel에서만 계산. 파일이 없으면 "측정 불가"로 적고 가짜 수치를 만들지 않음
- 14장 수치는 기획안 가정값(326개소, 상위 20%, 건당 30분/10초)으로 계산
"""
from __future__ import annotations

import math
from datetime import date

import pandas as pd

from common import POC_DIR, detect_crs, filter_seongbuk, find_columns, find_data_files, read_table, to_wgs84

OUT = POC_DIR / "ppt_stats.md"
CLOSED_WORDS = ("폐쇄", "폐업", "폐지", "철거", "해제", "말소")

# 기획안 가정값
TOTAL_SITES = 326
TARGET_RATIO = 0.20
MANUAL_MIN_PER_REPORT = 30
LLM_SEC_PER_REPORT = 10


def analyze(path) -> dict:
    df, enc = read_table(path)
    total_rows = len(df)
    df, note_gu = filter_seongbuk(df)
    cols = find_columns(df)
    res = {"file": path.name, "enc": enc, "rows": len(df), "total_rows": total_rows,
           "note": note_gu, "crs": "-", "missing": None,
           "dup": int((df.duplicated()).sum()), "closed": None, "closed_col": None}
    if cols["lat"] and cols["lon"]:
        lat = pd.to_numeric(df[cols["lat"]], errors="coerce")
        lon = pd.to_numeric(df[cols["lon"]], errors="coerce")
        res["missing"] = int((lat.isna() | lon.isna() | (lat == 0) | (lon == 0)).sum())
        res["crs"] = detect_crs(lat, lon)
    for c in df.columns:
        if "상태" in str(c) or "구분" in str(c) or "폐" in str(c):
            hit = df[c].astype(str).str.contains("|".join(CLOSED_WORDS), na=False)
            if hit.any():
                res["closed"], res["closed_col"] = int(hit.sum()), str(c)
                break
    else:
        res["closed"] = 0
    return res


def section_problem(results: list[dict]) -> str:
    if not results:
        return ("분석할 CSV/Excel 파일이 폴더에 없음. **측정 불가**.\n\n"
                "- 공공데이터포털 원본을 `data/` 폴더에 넣고 다시 실행\n"
                "- 팀 자료의 '소방용수 좌표 누락 756건'은 이 스크립트로 재계산하기 전까지 출처 확인용 수치\n")
    lines = ["| 파일 | 인코딩 | 전체 행 | 좌표계 | 좌표 누락 | 완전 중복 행 | 폐쇄·폐지 표기 |",
             "| --- | --- | ---: | --- | ---: | ---: | --- |"]
    for r in results:
        closed = "-" if r["closed_col"] is None and r["closed"] == 0 else f'{r["closed"]}건 ({r["closed_col"]})'
        miss = "열 없음" if r["missing"] is None else f'{r["missing"]}건'
        lines.append(f'| {r["file"]} | {r["enc"]} | {r["rows"]:,} | {r["crs"]} | {miss} | {r["dup"]}건 | {closed} |')
    return "\n".join(lines) + "\n"


def section_notion_refs() -> str:
    """팀 노션(10/17~10/18 열람)에 적힌 수치. 이 스크립트로 재계산한 값이 아님."""
    spot = round(756 / 3057 * 100, 1)
    return f"""| 수치 | 값 | 출처 | 상태 |
| --- | --- | --- | --- |
| 해빙기 점검 관리대상 | 326개소 (빈집 228, 급경사지 49, 안전취약시설물 C·D급 24, 국가유산 등 14, 건설공사장 11) | 노션 신준호 1차 자료조사, 헤럴드K 2026.2.25 | 원문 확인 완료로 표기됨 |
| 점검 참여 부서 | 8개 | 위와 동일 | 위와 동일 |
| 성북구 소방용수시설 행 수 | 3,057행 | 노션 김규민 2차 조사 | 파일 기준 집계 |
| 소방용수 좌표 누락 | 756건 | 팀 자료 | **재계산 전** |
| 위 두 값으로 나눈 비율 | {spot}% | 756 / 3,057 | 두 값이 같은 파일 기준인지 확인 전 |
| 성북구 건축물대장 행 수 | 33,443행 | 노션 김규민 2차 조사 | 파일 기준 집계 |
| 같은 정규화 주소의 안전시설 후보 | 132개 | 노션 김규민 2차 조사 | 같은 출입문이라는 뜻은 아님, 현장 검증 필요 |
| 위험 시설물 중 주민 미공지 | 231곳 | 노션 신준호 (염태영 의원 자료, 2026.10.12) | **전국 기준으로 보임, 성북구 수치 아님. 원문 확인 필요** |

- 4장 "조치 단절" 문구에 231곳을 쓸 때 범위(전국/성북구)를 원문에서 확인하고 표기
- 소방용수 756건은 실제 CSV를 `data/`에 넣고 `python poc/extract_stats.py`로 다시 세어 일치하는지 확인
"""


def section_effect() -> str:
    target = round(TOTAL_SITES * TARGET_RATIO)          # 65
    saved_sites = TOTAL_SITES - target                    # 261
    saved_ratio = saved_sites / TOTAL_SITES * 100         # 80.0

    manual_h = TOTAL_SITES * MANUAL_MIN_PER_REPORT / 60   # 163
    llm_min = TOTAL_SITES * LLM_SEC_PER_REPORT / 60       # 54.3
    cut_ratio = (1 - (llm_min / 60) / manual_h) * 100

    manual_target_h = target * MANUAL_MIN_PER_REPORT / 60
    llm_target_min = target * LLM_SEC_PER_REPORT / 60
    return f"""### A. 점검 범위 압축

| 항목 | 값 | 계산 |
| --- | ---: | --- |
| 전수 점검 대상 | {TOTAL_SITES}개소 | 해빙기 점검 관리대상 (팀 자료) |
| 우선 파견 대상 | {target}개소 | {TOTAL_SITES} x {TARGET_RATIO:.0%} = {TOTAL_SITES * TARGET_RATIO:.1f}, 반올림 |
| 생략되는 현장 방문 | {saved_sites}개소 | {TOTAL_SITES} - {target} |
| 방문 절감 비율 | {saved_ratio:.1f}% | {saved_sites} / {TOTAL_SITES} |

- 시간·비용 절감 비율은 **현장 1곳당 시간과 비용이 같다는 가정**에서 방문 횟수 절감 비율과 동일 ({saved_ratio:.0f}%)
- 1곳당 이동·점검 시간, 인건비는 구청 자료가 없어 절대 금액·시간으로는 환산하지 않음
- 상위 20%는 기획안 가정. 상위 20%에 실제 위험 지점이 얼마나 들어가는지(재현율)는 검증 전
- 나머지 {saved_sites}개소도 제외가 아니라 후순위 정기 점검 대상

### B. 보고서 작성 시간 단축

| 항목 | 기존 수기 | LLM 자동 생성 |
| --- | ---: | ---: |
| 건당 시간 | {MANUAL_MIN_PER_REPORT}분 | {LLM_SEC_PER_REPORT}초 |
| {TOTAL_SITES}개소 전체 | {manual_h:.0f}시간 | {llm_min:.1f}분 |
| 우선 {target}개소만 | {manual_target_h:.1f}시간 | {llm_target_min:.1f}분 |
| 단축률 (전체 기준) | | {cut_ratio:.1f}% |

- 건당 30분은 기획안 가정값, 10초는 목표치. 시연에서 실측해 교체
- LLM은 고정 템플릿에 DB 집계값을 채우는 용도. 점검 담당자의 현장 확인·검토 시간은 포함하지 않음
- 합산 효과: 방문 {saved_ratio:.0f}% 절감 + 보고서 시간 {cut_ratio:.0f}% 단축은 서로 다른 항목이므로 곱하거나 더해서 하나의 숫자로 쓰지 않음
"""


def main() -> None:
    files = find_data_files()
    results = []
    for f in files:
        try:
            results.append(analyze(f))
        except Exception as e:  # 한 파일 실패가 전체를 막지 않도록
            print(f"건너뜀 {f.name}: {e}")
    md = f"""# PPT 수치 정리

생성: {date.today()} / `poc/extract_stats.py`
분석 파일: {len(results)}개

## 4장. 문제 수치 (실데이터 기준)

{section_problem(results)}
### 팀 노션에 적힌 수치 (재계산 전)

{section_notion_refs()}
## 14장. 기대효과 추정 (가정값 기준)

{section_effect()}"""
    OUT.write_text(md, encoding="utf-8")
    print(md)
    print("저장:", OUT)


if __name__ == "__main__":
    main()
