"""데이터 사전 점검 지표: 공공데이터 안전시설 전체 중 규칙으로 먼저 확인할 곳(공백 탐지 항목)이 몇 곳인지.
벤치마크(Bureau Veritas: 검사원이 전부 방문) 대비 '데이터가 먼저 본다'를 숫자로 보여주는 용도 (docs/benchmark.md).
주의: 나머지 시설이 안전하다는 뜻이 아니다. 규칙에 걸린 곳을 '먼저' 확인한다는 뜻."""
from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache

from . import config


@lru_cache(maxsize=1)
def facility_counts() -> dict[str, int]:
    """backend/data/summary.json 의 시설 종류별 개수 (build_geojson.py가 만듦). 파일이 없으면 빈 dict."""
    try:
        data = json.loads((config.PROCESSED_DIR / "summary.json").read_text(encoding="utf-8"))
        return {k: int(v) for k, v in data.get("facilities", {}).items()}
    except (OSError, ValueError, AttributeError):
        return {}


def screening(rows) -> dict:
    """rows: Report 목록 (체험용 제외는 호출하는 쪽에서)."""
    fac = facility_counts()
    total = sum(fac.values())
    gaps = [r for r in rows if r.source == "gap"]
    return {
        "facilities_total": total,
        "facilities": fac,
        "targets": len(gaps),
        "targets_done": sum(1 for r in gaps if r.status == "done"),
        "ratio_pct": round(len(gaps) / total * 100, 1) if total else None,
        "by_rule": dict(Counter(r.gap_rule or "-" for r in gaps).most_common()),
    }
