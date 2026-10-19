"""관리자(담당자) 화면용 API. 로그인은 만들지 않는다 (CLAUDE.md 만들지 않는 것)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import scoring, serialize
from ..constants import KST, STATUSES
from ..db import get_db
from ..models import Photo, Report, StatusHistory, now
from ..schemas import AdminReportCreate, AdminReportOut, AdminSummary, ReportUpdate
from .reports import create_report

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/reports", response_model=list[AdminReportOut])
def list_reports(source: str | None = None, status: str | None = None, category: str | None = None,
                 include_demo: bool = True, sort: str = "priority", db: Session = Depends(get_db)):
    """관리자 목록. 필터: source(resident/gap/cctv), status, category.
    sort: priority(기본, 점수 높은 순 → 같으면 최신) / new / old. 오탐은 점수 0이라 뒤로 감."""
    q = select(Report).options(selectinload(Report.history), selectinload(Report.photo))
    if source:
        q = q.where(Report.source == source)
    if status:
        q = q.where(Report.status == status)
    if category:
        q = q.where(Report.ai_category == category)
    if not include_demo:
        q = q.where(Report.is_demo.is_(False))
    q = q.order_by(Report.created_at.asc() if sort == "old" else Report.created_at.desc())
    rows = [serialize.report(r, admin=True) for r in db.scalars(q)]
    if sort == "priority":
        rows.sort(key=lambda x: x["priority"]["total"], reverse=True)  # 안정 정렬이라 같은 점수는 최신순 유지
    return rows


@router.get("/summary", response_model=AdminSummary)
def summary(db: Session = Depends(get_db)):
    """대시보드 숫자. '오늘'·'이번 달'은 한국 시간 기준."""
    now = datetime.now(KST)
    rows = db.scalars(select(Report).options(selectinload(Report.history))).all()
    reports = [r for r in rows if r.source != "gap"]
    today_new = sum(1 for r in reports if serialize.utc(r.created_at).astimezone(KST).date() == now.date())
    overdue = sum(1 for r in reports if scoring.score(r)["overdue"])
    done_month, durations = 0, []
    for r in reports:
        done = next((h for h in r.history if h.to_status == "done"), None)
        if r.status == "done" and done:
            t = serialize.utc(done.created_at)
            durations.append((t - serialize.utc(r.created_at)).total_seconds() / 86400)
            if t.astimezone(KST).strftime("%Y-%m") == now.strftime("%Y-%m"):
                done_month += 1
    open_by_status = {k: sum(1 for r in rows if r.status == k) for k in STATUSES if k != "done"}
    return {"today_new": today_new, "overdue_open": overdue, "done_this_month": done_month,
            "avg_days_to_done": round(sum(durations) / len(durations), 1) if durations else None,
            "open_by_status": open_by_status}


@router.post("/reports", response_model=AdminReportOut)
def create(body: AdminReportCreate, db: Session = Depends(get_db)):
    """CCTV 프레임 업로드 등 관리자가 직접 만드는 항목. 사진은 먼저 POST /api/photos."""
    if body.source not in ("cctv", "gap"):
        raise HTTPException(400, "source는 cctv 또는 gap")
    return serialize.report(create_report(body, db, body.source), admin=True)


@router.get("/reports/{report_id}", response_model=AdminReportOut)
def detail(report_id: int, db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "제보 없음")
    return serialize.report(r, admin=True)


@router.patch("/reports/{report_id}", response_model=AdminReportOut)
def update(report_id: int, body: ReportUpdate, db: Session = Depends(get_db)):
    """상태 변경·메모·조치 후 사진·오탐 표시. 상태가 바뀌거나 메모/사진이 있으면 처리 이력에 한 줄 남는다."""
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "제보 없음")
    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(400, f"status는 {list(STATUSES)} 중 하나")
    if body.after_photo_key and not db.get(Photo, body.after_photo_key):
        raise HTTPException(400, "after_photo_key에 해당하는 사진이 없음")

    for field in ("dept", "dept_note", "dispatch", "false_positive"):
        v = getattr(body, field)
        if v is not None:
            setattr(r, field, v)

    changed = body.status is not None and body.status != r.status
    if changed or body.note or body.after_photo_key:
        r.history.append(StatusHistory(from_status=r.status, to_status=body.status or r.status,
                                       note=body.note, photo_key=body.after_photo_key))
    if changed:
        r.status = body.status
    # 주민에게 보이는 변화(상태, 메모, 조치 후 사진, 담당 부서 메모)가 있으면 빨간 점 시각을 갱신
    if changed or body.note or body.after_photo_key or body.dept_note is not None:
        r.news_at = now()
    db.commit()
    db.refresh(r)
    return serialize.report(r, admin=True)

