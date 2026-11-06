"""주민 화면용 제보 API. 로그인이 없으므로 '내 제보'는 브라우저에 저장한 public_id 목록으로 찾는다."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import departments, scoring, serialize
from ..constants import (CROSS_CHECK_MIN, KST, NOT_FIXED_MIN, RECENT_DONE_DAYS, RECUR_LOOKBACK_DAYS, STATUSES,
                         radius_for)
from ..db import get_db
from ..models import Photo, Report, ReportClient, ReportFeedback, ReportLink, ReportPhoto, StatusHistory, now
from ..schemas import CancelIn, FeedbackIn, NearbyReport, PublicStats, ReportCreate, ReportOut

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
    r.photos.append(ReportPhoto(position=0, photo_key=photo.key, memo=body.photo_memo, taken_at=body.taken_at))
    seen = {photo.key}
    for extra in body.extra_photos:
        if extra.photo_key in seen:
            continue
        if not db.get(Photo, extra.photo_key):
            raise HTTPException(400, "extra_photos의 photo_key에 해당하는 사진이 없음")
        seen.add(extra.photo_key)
        r.photos.append(ReportPhoto(position=len(r.photos), photo_key=extra.photo_key, memo=extra.memo, taken_at=extra.taken_at))
    if body.client_key:
        r.client = ReportClient(client_key=body.client_key, nickname=(body.client_nickname or "").strip() or None)
    db.add(r)
    db.commit()
    db.refresh(r)
    _link_recurrence(db, r, body.accuracy_m)
    return r


def _link_recurrence(db: Session, r: Report, accuracy_m: float | None) -> None:
    """같은 곳(반경 안)·같은 유형에서 조치 완료된 제보가 RECUR_LOOKBACK_DAYS 안에 있으면 이전 제보와 잇는다(재발).
    이전 제보의 처리 이력에도 한 줄 남기고, 처음 제보한 사람의 빨간 점이 켜지게 news_at을 갱신한다."""
    if r.source != "resident" or r.is_demo or r.lat is None or r.lon is None or not r.ai_category:
        return
    radius = radius_for(accuracy_m)
    t = datetime.now(timezone.utc)
    best = None
    q = _q().where(Report.source == "resident", Report.is_demo.is_(False), Report.false_positive.is_(False),
                   Report.status == "done", Report.id != r.id, Report.ai_category == r.ai_category,
                   Report.lat.is_not(None), Report.lon.is_not(None))
    for p in db.scalars(q):
        done = scoring.done_at(p)
        d = _meters(r.lat, r.lon, p.lat, p.lon)
        if done is None or d > radius or (t - done) > timedelta(days=RECUR_LOOKBACK_DAYS):
            continue
        if best is None or done > best[1]:
            best = (p, done, d)
    if best is None:
        return
    p, done, d = best
    days = max(0, (t - done).days)
    db.add(ReportLink(report_id=r.id, related_id=p.id, kind="recurrence", days_after_done=days, distance_m=round(d)))
    p.history.append(StatusHistory(from_status="done", to_status="done", note=f"같은 곳에서 조치 {days}일 만에 다시 제보가 들어왔어요 (재발)"))
    p.news_at = now()
    db.commit()
    db.refresh(r)


def _q():
    return select(Report).options(selectinload(Report.history), selectinload(Report.photo), selectinload(Report.photos),
                                  selectinload(Report.feedback), selectinload(Report.recurrence_link), selectinload(Report.client))


def _public(r: Report, client_key: str | None = None) -> dict:
    """주민·공개 화면용 제보. **조치 완료 전 제보의 사진은 제보를 보낸 브라우저(client_key가 같음)에게만** 내보낸다.
    제보 번호는 지도에 공개돼 있어서, 번호만 알아도 사진을 볼 수 있으면 사실상 모든 제보 사진이 공개되기 때문이다.
    조치 완료된 제보는 누구에게나 사진을 보여 준다(지도의 조치 전·후 보기). 식별값이 없던 옛 제보는 본인 확인이 안 되므로 완료 전에는 사진을 숨긴다."""
    out = serialize.report(r)
    owner = bool(client_key and r.client is not None and r.client.client_key == client_key)
    if r.status == "done" or owner:
        return out
    return out | {"photo_url": None, "after_photo_url": None, "photos": []}


@router.post("/api/reports", response_model=ReportOut)
def post_report(body: ReportCreate, db: Session = Depends(get_db)):
    """제보 보내기. 응답의 public_id를 브라우저(localStorage)에 저장해 두면 '내 제보'에서 다시 찾는다."""
    return serialize.report(create_report(body, db, "resident"))


@router.get("/api/reports", response_model=list[ReportOut])
def my_reports(ids: str = Query(..., description="public_id를 쉼표로 이어 붙인 값"),
               client_key: str | None = Query(None, min_length=8, max_length=40, description="내 브라우저 식별값. 같으면 조치 완료 전에도 내 제보 사진이 나옴"),
               db: Session = Depends(get_db)):
    wanted = [i for i in ids.split(",") if i][:50]
    rows = db.scalars(_q().where(Report.public_id.in_(wanted)).order_by(Report.created_at.desc())).all()
    return [_public(r, client_key) for r in rows]


@router.get("/api/reports/map")
def reports_map(include_demo: bool = False, db: Session = Depends(get_db)) -> dict:
    """주민 지도의 '주민 제보 / 조치 완료' 점. 메모·사진은 넣지 않는다 (하단 시트에서 개별 조회).
    공백 탐지 항목(source=gap)은 /api/gaps 레이어로 따로 나가므로 여기서는 주민 제보만."""
    q = select(Report).options(selectinload(Report.feedback)).where(
        Report.source == "resident", Report.lat.is_not(None), Report.lon.is_not(None), Report.false_positive.is_(False))
    if not include_demo:
        q = q.where(Report.is_demo.is_(False))
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r.lon, r.lat]},
              "properties": {"public_id": r.public_id, "source": r.source, "status": r.status,
                             "status_label": STATUSES.get(r.status, r.status), "category": r.ai_category,
                             "facility_label": departments.facility_label(r.facility_type),
                             "confirm_count": r.confirm_count or 0,
                             "cross_checked": (r.confirm_count or 0) >= CROSS_CHECK_MIN,
                             "recheck": r.status == "done" and scoring.feedback_counts(r)[0] >= 1
                             and scoring.feedback_counts(r)[0] > scoring.feedback_counts(r)[1],
                             "created_at": serialize.utc(r.created_at).isoformat()}}
             for r in db.scalars(q)]
    return {"type": "FeatureCollection", "features": feats}


def _meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 좌표 사이 거리(m). 하버사인."""
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * asin(sqrt(a))


@router.get("/api/reports/nearby", response_model=list[NearbyReport])
def nearby_reports(lat: float, lon: float, category: str | None = None, accuracy: float | None = Query(None, ge=0),
                   radius_m: int | None = Query(None, ge=10, le=200), db: Session = Depends(get_db)):
    """같은 곳에 이미 접수된 주민 제보(진행 상황 포함). 중복 제보를 줄이려고 제보 화면에서 보여 준다.
    체험·오탐·공백 항목은 뺀다. category를 주면 AI 분류가 같은 것만. 가까운 순 최대 5건. 사진·메모는 넣지 않음."""
    radius = radius_m or radius_for(accuracy)
    q = _q().where(Report.source == "resident", Report.is_demo.is_(False), Report.false_positive.is_(False),
                   Report.lat.is_not(None), Report.lon.is_not(None))
    if category:
        q = q.where(Report.ai_category == category)
    t = datetime.now(timezone.utc)
    out = []
    for d, r in sorted(((_meters(lat, lon, r.lat, r.lon), r) for r in db.scalars(q)), key=lambda x: x[0]):
        if d > radius:
            continue
        state, ago = "open", None
        if r.status == "done":
            done = scoring.done_at(r)
            if done is None:
                continue
            ago = max(0, (t - done).days)
            if ago > RECUR_LOOKBACK_DAYS:
                continue  # 너무 오래전에 조치된 곳은 같은 곳으로 보지 않는다
            state = "recent_done" if ago <= RECENT_DONE_DAYS else "old_done"
        nf, fx = scoring.feedback_counts(r)
        out.append({"public_id": r.public_id, "category": r.ai_category, "status": r.status,
                    "status_label": STATUSES.get(r.status, r.status), "created_at": serialize.utc(r.created_at),
                    "distance_m": round(d), "state": state, "done_days_ago": ago, "fixed": fx, "not_fixed": nf,
                    "confirm_count": r.confirm_count or 0, "dept": r.dept,
                    "facility_label": departments.facility_label(r.facility_type)})
    return out[:5]


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
    return _public(r)  # 누르는 사람이 제보한 사람인지 모르므로 조치 완료 전 사진은 숨긴다


@router.post("/api/reports/{public_id}/cancel")
def cancel_report(public_id: str, body: CancelIn, db: Session = Depends(get_db)):
    """주민이 자기 제보를 취소한다(삭제). 제보를 보낸 브라우저(식별값이 같음)만, 담당자가 아직 손대지 않은 접수 상태에서만 가능하다.
    지도에 제보 번호가 공개돼 있어서 번호만으로는 취소할 수 없게 식별값을 함께 확인한다. 식별값이 없던 옛 제보는 취소할 수 없다."""
    r = db.scalar(select(Report).where(Report.public_id == public_id, Report.source == "resident"))
    if r is None:
        raise HTTPException(404, "제보 없음")
    if r.client is None or r.client.client_key != body.client_key:
        raise HTTPException(403, "이 브라우저에서 보낸 제보만 취소할 수 있어요")
    if r.status != "received" or len(r.history) > 1:
        raise HTTPException(400, "담당자가 확인을 시작해서 취소할 수 없어요. 담당 부서에 문의해 주세요")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/api/reports/{public_id}/feedback", response_model=ReportOut)
def feedback(public_id: str, body: FeedbackIn, db: Session = Depends(get_db)):
    """조치 완료된 제보에 '고쳐졌어요(fixed)' / '아직 그대로예요(not_fixed)'. 한 브라우저(client_key)당 한 표이고 바꿀 수 있다.
    로그인이 없어 한 사람이 여러 브라우저로 늘릴 수 있으므로 우선순위 가산은 NOT_FIXED_MIN명 이상일 때만 하고 담당자가 확인한다."""
    r = db.scalars(_q().where(Report.public_id == public_id)).first()
    if not r or r.source == "gap":
        raise HTTPException(404, "제보 없음")
    if r.status != "done":
        raise HTTPException(400, "조치 완료된 제보에만 보낼 수 있음")
    mine = next((f for f in r.feedback if f.client_key == body.client_key), None)
    if mine:
        mine.kind = body.kind
    else:
        r.feedback.append(ReportFeedback(kind=body.kind, client_key=body.client_key))
    db.commit()
    db.refresh(r)
    return _public(r, body.client_key)


@router.get("/api/reports/{public_id}", response_model=ReportOut)
def get_report(public_id: str, db: Session = Depends(get_db)):
    r = db.scalars(_q().where(Report.public_id == public_id)).first()
    if not r:
        raise HTTPException(404, "제보 없음")
    return _public(r)
