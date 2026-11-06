"""첫 확인까지 걸린 시간 지표 (12주 실증에서 볼 지표의 하나: 접수한 제보를 담당자가 얼마나 빨리 보기 시작하는가).

- '첫 확인' = 제보가 '접수'에서 다른 상태(검토·조치·완료)로 처음 바뀐 시각. 메모만 남긴 것은 확인으로 세지 않는다.
- 대상: 주민·CCTV 제보 중 체험·오탐이 아닌 것 (대시보드의 기한 내 조치 시작률과 같은 범위).
- 아직 '접수' 상태인 제보는 확인 대기로 따로 센다(가장 오래 기다린 시간 포함).
"""
from __future__ import annotations

from datetime import datetime, timezone
from statistics import median

from .models import Report
from .serialize import utc


def first_review_hours(r: Report) -> float | None:
    """접수 후 첫 상태 변경까지 시간(시간 단위). 아직 접수 상태이면 None."""
    first = next((h for h in r.history if h.to_status != "received"), None)
    if first is None:
        return None
    return max(0.0, (utc(first.created_at) - utc(r.created_at)).total_seconds() / 3600)


def stats(reports: list[Report], now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    done_hours, waiting = [], []
    for r in reports:
        h = first_review_hours(r)
        if h is not None:
            done_hours.append(h)
        elif r.status == "received":
            waiting.append(max(0.0, (now - utc(r.created_at)).total_seconds() / 3600))
    n = len(done_hours)
    return {"count": n,
            "avg_hours": round(sum(done_hours) / n, 1) if n else None,
            "median_hours": round(median(done_hours), 1) if n else None,
            "within_24h_pct": round(100 * sum(1 for h in done_hours if h <= 24) / n) if n else None,
            "waiting": len(waiting),
            "oldest_waiting_hours": round(max(waiting), 1) if waiting else None}
