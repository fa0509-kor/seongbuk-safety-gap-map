"""주민 화면용 제보 API. 로그인이 없으므로 '내 제보'는 브라우저에 저장한 public_id 목록으로 찾는다."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import departments, serialize
from ..constants import KST, STATUSES
from ..db import get_db
from ..models import Photo, Report, StatusHistory
from ..schemas import PublicStats, ReportCreate, ReportOut

router = APIRouter(tags=["reports"])


def create_report(body: ReportCreate, db: Session, source: str) -> Report:
    if body.facility_type is not None and body.facility_type not in departments.FACILITY_TYPES:
        raise HTTPException(400, f"facility_type은 {list(departments.FACILITY_TYPES)} 중 하나")
    photo = db.get(Photo, body.photo_key)
    if not photo:
        raise HTTPException(400, "photo_key에 해당하는 사진이 없음. 먼저 POST /api/photos")
    ai = photo.ai or {}
    r = Report(source=source, lat=body.lat, lon=body.lon, address=body.address, memo=body.memo,
               is_demo=body.is_demo, photo_key=photo.key,
               ai_category=ai.get("category"), ai_confidence=ai.get("confidence"),
               facility_type=body.facility_type or "unknown",
               dept=departments.assign(source, body.facility_type))
    r.history.append(StatusHistory(from_status=None, to_status="received", note=f"제보 접수 · {r.dept}에 1차 배정"))
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def _q():
    return select(Report).options(selectinload(Report.history), selectinload(Report.photo))


@router.post("/api/reports", response_model=ReportOut)
def post_report(body: ReportCreate, db: Session = Depends(get_db)):
    """제보 보내기. 응답의 public_id를 브라우저(localStorage)에 저장해 두면 '내 제보'에서 다시 찾는다."""
    return serialize.report(create_report(body, db, "resident"))


@router.get("/api/reports", response_model=list[ReportOut])
def my_reports(ids: str = Query(..., description="public_id를 쉼표로 이어 붙인 값"), db: Session = Depends(get_db)):
    wanted = [i for i in ids.split(",") if i][:50]
    rows = db.scalars(_q().where(Report.public_id.in_(wanted)).order_by(Report.created_at.desc())).all()
    return [serialize.report(r) for r in rows]


@router.get("/api/reports/map")
def reports_map(include_demo: bool = False, db: Session = Depends(get_db)) -> dict:
    """주민 지도의 '주민 제보 / 조치 완료' 점. 메모·사진은 넣지 않는다 (하단 시트에서 개별 조회).
    공백 탐지 항목(source=gap)은 /api/gaps 레이어로 따로 나가므로 여기서는 주민 제보만."""
    q = select(Report).where(Report.source == "resident", Report.lat.is_not(None), Report.lon.is_not(None),
                             Report.false_positive.is_(False))
    if not include_demo:
        q = q.where(Report.is_demo.is_(False))
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
              "properties": {"public_id": r.public_id, "source": r.source, "status": r.status,
                             "status_label": STATUSES.get(r.status, r.status), "category": r.ai_category,
                             "facility_label": departments.facility_label(r.facility_type),
                             "confirm_count": r.confirm_count or 0,
                             "created_at": serialize.utc(r.created_at).isoformat()}}
             for r in db.scalars(q)]
    return {"type": "FeatureCollection", "features": feats}


@router.get("/api/stats", response_model=PublicStats)
def public_stats(db: Session = Depends(get_db)):
    """주민 첫 화면의 '이번 주 제보·조치 완료' 건수. 주는 월요일 0시(한국 시간)부터."""
    now = datetime.now(KST)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.scalars(_q().where(Report.source == "resident", Report.is_demo.is_(False),
                                 Report.false_positive.is_(False))).all()
    week = lambda dt: serialize.utc(dt) >= start  # noqa: E731
    return {"week_reports": sum(1 for r in rows if week(r.created_at)),
            "week_done": sum(1 for r in rows if r.status == "done"
                             and any(h.to_status == "done" and week(h.created_at) for h in r.history))}


@router.post("/api/reports/{public_id}/confirm", response_model=ReportOut)
def confirm(public_id: str, db: Session = Depends(get_db)):
    """나도 봤어요(+1). 같은 곳 확인 인원이 우선순위 점수에 반영된다 (1명당 +5, 최대 +20).
    로그인이 없어 중복 방지는 브라우저(localStorage)에서만 한다 — 시연용 범위."""
    r = db.scalars(_q().where(Report.public_id == public_id)).first()
    if not r or r.source == "gap":
        raise HTTPException(404, "제보 없음")
    r.confirm_count = (r.confirm_count or 0) + 1
    db.commit()
    db.refresh(r)
    return serialize.report(r)


@router.get("/api/reports/{public_id}", response_model=ReportOut)
def get_report(public_id: str, db: Session = Depends(get_db)):
    r = db.scalars(_q().where(Report.public_id == public_id)).first()
    if not r:
        raise HTTPException(404, "제보 없음")
    return serialize.report(r)
