"""DB 행 → 응답 dict."""
from __future__ import annotations

from datetime import datetime, timezone

from . import scoring, storage
from .constants import SOURCES, STATUSES
from .models import Report


def utc(dt: datetime | None) -> datetime | None:
    """SQLite는 시간대 정보를 버리고 돌려준다. 저장값은 모두 UTC이므로 UTC로 붙여서 내보낸다.
    (안 붙이면 브라우저가 한국 시간으로 읽어 9시간 어긋나고 빨간 점 판단이 틀어짐)"""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _url(key: str | None) -> str | None:
    return storage.url(key) if key else None


def report(r: Report, admin: bool = False) -> dict:
    history = [{"at": utc(h.created_at), "from_status": h.from_status, "to_status": h.to_status,
                "to_status_label": STATUSES.get(h.to_status, h.to_status), "note": h.note,
                "photo_url": _url(h.photo_key)} for h in r.history]
    after = next((h.photo_key for h in reversed(r.history) if h.photo_key), None)
    out = {
        "public_id": r.public_id, "created_at": utc(r.created_at), "status": r.status,
        "status_label": STATUSES.get(r.status, r.status), "news_at": utc(r.news_at),
        "lat": r.lat, "lon": r.lon, "address": r.address, "memo": r.memo,
        "photo_url": _url(r.photo_key), "after_photo_url": _url(after),
        "ai": r.photo.ai if r.photo else None, "dept_note": r.dept_note, "history": history,
    }
    if admin:
        out |= {"id": r.id, "updated_at": utc(r.updated_at), "source": r.source,
                "source_label": SOURCES.get(r.source, r.source), "dept": r.dept,
                "dispatch": r.dispatch, "false_positive": r.false_positive, "is_demo": r.is_demo,
                "confirm_count": r.confirm_count or 0, "gap_rule": r.gap_rule, "gap_reason": r.gap_reason,
                "priority": scoring.score(r)}
    return out
