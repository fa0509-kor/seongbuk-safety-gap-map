from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from .. import config, db
from ..constants import CATEGORIES, SOURCES, STATUSES
from ..departments import DEPARTMENTS, FACILITY_TYPES

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health() -> dict:
    """서버가 켜져 있는지, 지금 어떤 DB·저장소·AI로 도는지 (키 값은 내보내지 않음).
    db_ok=false면 db_error에 원인 첫 줄. 시작 준비가 실패했었으면 여기서 다시 시도한다."""
    if db.STARTUP_ERROR:
        db.prepare()
    db_ok, db_error = True, db.STARTUP_ERROR
    try:
        with db.engine.connect() as conn:
            conn.execute(text("select 1"))
    except Exception as e:  # noqa: BLE001
        db_ok, db_error = False, db.short_error(e)
    return {"ok": db_ok,
            "db": "sqlite" if config.DATABASE_URL.startswith("sqlite") else "postgres",
            "db_ok": db_ok, "db_error": db_error,
            "storage": config.STORAGE,
            "vision_provider": config.vision_provider(),
            "data_files": sorted(p.name for p in config.PROCESSED_DIR.glob("*")) if config.PROCESSED_DIR.exists() else []}


@router.get("/api/meta")
def meta() -> dict:
    """화면에서 쓰는 고정값 (상태·출처·결함 유형 이름)."""
    return {"statuses": STATUSES, "sources": SOURCES, "categories": CATEGORIES,
            "facility_types": {k: v[0] for k, v in FACILITY_TYPES.items()}, "departments": DEPARTMENTS}
