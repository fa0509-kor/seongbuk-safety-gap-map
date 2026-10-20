from __future__ import annotations

from fastapi import APIRouter

from .. import config
from ..constants import CATEGORIES, SOURCES, STATUSES
from ..departments import DEPARTMENTS, FACILITY_TYPES

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health() -> dict:
    """서버가 켜져 있는지, 지금 어떤 DB·저장소·AI로 도는지 (키 값은 내보내지 않음)."""
    return {"ok": True,
            "db": "sqlite" if config.DATABASE_URL.startswith("sqlite") else "postgres",
            "storage": config.STORAGE,
            "vision_provider": config.vision_provider()}


@router.get("/api/meta")
def meta() -> dict:
    """화면에서 쓰는 고정값 (상태·출처·결함 유형 이름)."""
    return {"statuses": STATUSES, "sources": SOURCES, "categories": CATEGORIES,
            "facility_types": {k: v[0] for k, v in FACILITY_TYPES.items()}, "departments": DEPARTMENTS}
