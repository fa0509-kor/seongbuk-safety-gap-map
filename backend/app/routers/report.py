"""기간별 점검 보고서. 고정 양식에 DB 집계값만 채운다 (CLAUDE.md 4. 보고서 — 자유 생성 금지).
문장은 아래 TEMPLATE의 빈칸만 채우며, 양식에 없는 숫자·사실은 만들지 않는다.
LLM으로 문장을 다듬는 기능은 넣지 않았다 (필요하면 '숫자는 바꾸지 말 것' 검증과 함께 추가)."""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import departments, scoring, screening, serialize
from ..constants import KST, SOURCES, STATUSES
from ..db import get_db
from ..models import Report

router = APIRouter(prefix="/api/admin", tags=["admin"])

TEMPLATE = [
    "{start} ~ {end} 기간 동안 접수된 점검 항목은 {received}건입니다 (주민 제보 {resident}건, CCTV {cctv}건, 공백 탐지 {gap}건).",
    "같은 기간 조치 완료된 항목은 {done}건이며, 접수부터 완료까지 평균 {avg_days}이 걸렸습니다.",
    "기한이 지났는데 완료되지 않은 항목은 현재 {overdue}건입니다.",
    "이 기간 접수 항목 중 기한 판단 대상 {due_total}건에서 기한 안에 조치를 마친 비율은 {on_time_rate}입니다.",
    "AI가 판별한 결함 유형(많은 순): {categories}. AI 판별은 담당자가 확인한 결과가 아닙니다.",
    "AI 오탐으로 표시된 항목은 {false_positive}건입니다.",
    "공공데이터 안전시설 {facilities_total}곳 중 규칙으로 먼저 확인할 곳은 {targets}곳이며, 현재 {targets_done}곳 확인을 마쳤습니다. 나머지 시설이 안전하다는 뜻은 아닙니다.",
]


def _parse(d: str | None, default: date) -> date:
    if not d:
        return default
    try:
        return date.fromisoformat(d)
    except ValueError as e:
        raise HTTPException(400, "날짜는 YYYY-MM-DD") from e


def _duration_text(days: float | None) -> str:
    if days is None:
        return "(완료 건 없음)"
    if days >= 1:
        return f"{days:.1f}일"
    return "1시간 미만" if days * 24 < 1 else f"{days * 24:.1f}시간"


def _kst_date(dt: datetime) -> date:
    return serialize.utc(dt).astimezone(KST).date()


@router.get("/report")
def period_report(start: str | None = None, end: str | None = None, db: Session = Depends(get_db)) -> dict:
    """기간별 점검 보고서. start·end는 한국 날짜(포함). 기본은 이번 달 1일 ~ 오늘."""
    today = datetime.now(KST).date()
    s, e = _parse(start, today.replace(day=1)), _parse(end, today)
    if s > e:
        raise HTTPException(400, "start가 end보다 늦음")

    rows = db.scalars(select(Report).options(selectinload(Report.history), selectinload(Report.photo))).all()
    in_period = [r for r in rows if s <= _kst_date(r.created_at) <= e and not r.is_demo]

    done_rows, durations = [], []
    for r in rows:
        if r.is_demo or r.status != "done":
            continue
        h = next((h for h in r.history if h.to_status == "done"), None)
        if h and s <= _kst_date(h.created_at) <= e:
            done_rows.append(r)
            durations.append((serialize.utc(h.created_at) - serialize.utc(r.created_at)).total_seconds() / 86400)

    by_source = Counter(r.source for r in in_period)
    by_category = Counter(r.ai_category for r in in_period if r.ai_category)
    by_facility = Counter(departments.facility_label(r.facility_type) for r in in_period if r.source != "gap")
    by_gap_rule = Counter(r.gap_rule for r in in_period if r.source == "gap")
    by_dept_received = Counter(r.dept or "미배정" for r in in_period)
    by_dept_done = Counter(r.dept or "미배정" for r in done_rows)
    open_rows = [r for r in rows if r.status != "done" and not r.is_demo and not r.false_positive]
    overdue = [r for r in open_rows if scoring.score(r)["overdue"]]
    top_open = sorted(open_rows, key=lambda r: scoring.score(r)["total"], reverse=True)[:5]

    avg = round(sum(durations) / len(durations), 1) if durations else None
    scr = screening.screening([r for r in rows if not r.is_demo])
    ot = scoring.on_time(in_period)
    values = {
        "start": s.isoformat(), "end": e.isoformat(), "received": len(in_period),
        "resident": by_source.get("resident", 0), "cctv": by_source.get("cctv", 0), "gap": by_source.get("gap", 0),
        "done": len(done_rows), "avg_days": _duration_text(avg),
        "overdue": len(overdue),
        "categories": ", ".join(f"{k} {v}건" for k, v in by_category.most_common(3)) or "(판별 결과 없음)",
        "false_positive": sum(1 for r in in_period if r.false_positive),
        "due_total": ot["due_total"],
        "on_time_rate": f"{ot['rate_pct']}% ({ot['on_time']}건)" if ot["rate_pct"] is not None else "(판단할 항목 없음)",
        "facilities_total": f"{scr['facilities_total']:,}", "targets": scr["targets"], "targets_done": scr["targets_done"],
    }
    return {
        "period": {"start": values["start"], "end": values["end"]},
        "generated_at": datetime.now(KST).isoformat(timespec="minutes"),
        "summary_lines": [t.format(**values) for t in TEMPLATE],
        "counts": {
            "received": len(in_period), "by_source": {SOURCES.get(k, k): v for k, v in by_source.items()},
            "by_category": dict(by_category.most_common()), "by_facility": dict(by_facility.most_common()),
            "by_gap_rule": dict(by_gap_rule.most_common()),
            "done": len(done_rows), "avg_days_to_done": avg, "overdue_open": len(overdue),
            "on_time": ot,
            "status_now": {STATUSES[k]: sum(1 for r in rows if r.status == k and not r.is_demo) for k in STATUSES},
        },
        "screening": scr,
        "by_dept": [{"dept": d, "received": by_dept_received.get(d, 0), "done": by_dept_done.get(d, 0)}
                    for d in sorted(set(by_dept_received) | set(by_dept_done))],
        "top_open": [{"id": r.id, "label": r.gap_rule or r.ai_category or "-", "dept": r.dept,
                      "status": STATUSES.get(r.status, r.status), "score": scoring.score(r)["total"],
                      "overdue": bool(scoring.score(r)["overdue"]), "address": r.address} for r in top_open],
        "note": "체험용 제보는 제외. 숫자는 모두 DB 집계값이며, 문장은 고정 양식의 빈칸만 채운 것",
    }
