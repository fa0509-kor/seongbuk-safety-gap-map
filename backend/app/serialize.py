"""DB 행 → 응답 dict."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import object_session

from . import departments, scoring, storage
from .constants import CROSS_CHECK_MIN, KST, RECHECK_DAYS, SEASONS, SOURCES, STALE_PHOTO_DAYS, STATUSES
from .models import Report, ReportClient


def utc(dt: datetime | None) -> datetime | None:
    """SQLite는 시간대 정보를 버리고 돌려준다. 저장값은 모두 UTC이므로 UTC로 붙여서 내보낸다.
    (안 붙이면 브라우저가 한국 시간으로 읽어 9시간 어긋나고 빨간 점 판단이 틀어짐)"""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _url(key: str | None) -> str | None:
    return storage.url(key) if key else None


def aftercare(r: Report, admin: bool = False) -> dict:
    """조치 완료 뒤 주민 확인(고쳐졌어요/아직 그대로예요)과 재발 연결. 이전 제보의 public_id는 내보내지 않는다."""
    nf, fx = scoring.feedback_counts(r)
    link = r.recurrence_link
    out: dict = {"fixed": fx, "not_fixed": nf,
                 "recurrence": ({"days_after_done": link.days_after_done, "admin_id": link.related_id if admin else None}
                                if link is not None else None)}
    if admin:
        done = scoring.done_at(r) if r.status == "done" else None
        due = done + timedelta(days=RECHECK_DAYS) if done else None
        out["recheck_at"] = utc(due)
        out["recheck_due"] = bool(due and datetime.now(timezone.utc) >= due and fx == 0)
    return out


def place_item(r: Report, relation: str, distance_m: int) -> dict:
    """관리자 상세의 '장소 이력' 한 줄."""
    nf, fx = scoring.feedback_counts(r)
    done = scoring.done_at(r) if r.status == "done" else None
    after = next((h.photo_key for h in reversed(r.history) if h.photo_key), None)
    return {"id": r.id, "public_id": r.public_id, "created_at": utc(r.created_at), "status": r.status,
            "status_label": STATUSES.get(r.status, r.status), "done_at": utc(done), "category": r.ai_category,
            "distance_m": distance_m, "relation": relation, "photo_url": _url(r.photo_key), "after_photo_url": _url(after),
            "fixed": fx, "not_fixed": nf}


def photo_check(r: Report) -> dict:
    """대표 사진 촬영일과 접수일의 차이. 촬영일이 없으면 판단하지 않는다(None). 점수에는 쓰지 않고 담당자가 참고만 한다."""
    first = next((p for p in r.photos if p.position == 0), None)
    taken = utc(first.taken_at) if first and first.taken_at else None
    if taken is None:
        return {"photo_age_days": None, "stale_photo": False}
    days = (utc(r.created_at) - taken).days
    return {"photo_age_days": max(days, 0), "stale_photo": days > STALE_PHOTO_DAYS}


def client_counts(r: Report) -> dict:
    """같은 브라우저(client_key)에서 올라온 제보 수. 식별값이 없으면 둘 다 None. 제보마다 조회하므로 파일럿 규모(수백 건)까지만 가정한다."""
    db = object_session(r)
    if r.client is None or db is None:
        return {"same_client_reports": None, "same_client_24h": None, "client_code": None, "client_nickname": None}
    times = [utc(t) for t in db.scalars(select(ReportClient.created_at).where(ReportClient.client_key == r.client.client_key))]
    at = utc(r.client.created_at)
    total = len(times)
    recent = sum(1 for t in times if abs((t - at).total_seconds()) <= 24 * 3600)
    return {"same_client_reports": total, "same_client_24h": recent, "client_code": r.client.client_key[:8], "client_nickname": r.client.nickname}


def report(r: Report, admin: bool = False) -> dict:
    history = [{"at": utc(h.created_at), "from_status": h.from_status, "to_status": h.to_status,
                "to_status_label": STATUSES.get(h.to_status, h.to_status), "note": h.note,
                "photo_url": _url(h.photo_key)} for h in r.history]
    after = next((h.photo_key for h in reversed(r.history) if h.photo_key), None)
    if r.photos:
        photos = [{"position": p.position, "photo_url": _url(p.photo_key), "memo": p.memo, "taken_at": utc(p.taken_at)} for p in r.photos]
    else:  # 사진 표가 생기기 전의 제보: 대표 사진 한 장
        photos = [{"position": 0, "photo_url": _url(r.photo_key), "memo": None, "taken_at": None}] if r.photo_key else []
    out = {
        "public_id": r.public_id, "created_at": utc(r.created_at), "status": r.status,
        "status_label": STATUSES.get(r.status, r.status), "news_at": utc(r.news_at),
        "lat": r.lat, "lon": r.lon, "address": r.address, "memo": r.memo,
        "photo_url": _url(r.photo_key), "after_photo_url": _url(after),
        "ai": r.photo.ai if r.photo else None, "facility_type": r.facility_type,
        "facility_label": departments.facility_label(r.facility_type), "dept": r.dept,
        "dept_note": r.dept_note, "confirm_count": r.confirm_count or 0,
        "cross_checked": (r.confirm_count or 0) >= CROSS_CHECK_MIN,
        "not_target": bool(r.false_positive), "photos": photos, "history": history,
        "aftercare": aftercare(r, admin),
    }
    if admin:
        out |= {"id": r.id, "updated_at": utc(r.updated_at), "source": r.source,
                "source_label": SOURCES.get(r.source, r.source),
                "dispatch": r.dispatch, "false_positive": r.false_positive, "true_category": r.true_category, "is_demo": r.is_demo,
                "gap_rule": r.gap_rule, "gap_reason": r.gap_reason,
                "priority": scoring.score(r), "season": SEASONS.get(utc(r.created_at).astimezone(KST).month),
                **photo_check(r), **client_counts(r)}
    return out
