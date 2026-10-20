from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from .. import config, db
from ..constants import CATEGORIES, SOURCES, STATUSES
from ..departments import DEPARTMENTS, FACILITY_TYPES

router = APIRouter(tags=["system"])


def _db_url_shape() -> dict | None:
    """DB 주소 모양만 점검 (비밀번호는 내보내지 않음). '@'는 1개여야 하고 포트는 6543(Transaction pooler)."""
    url = config.DATABASE_URL
    if url.startswith("sqlite"):
        return None
    tail = url.rsplit("@", 1)[-1]
    host_port = tail.split("/", 1)[0]
    return {"at_count": url.count("@"), "host": host_port.rsplit(":", 1)[0],
            "port": host_port.rsplit(":", 1)[-1] if ":" in host_port else None,
            "ok_shape": url.count("@") == 1 and host_port.endswith(":6543")}


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
            "db_url_check": _db_url_shape(),
            "data_files": sorted(p.name for p in config.PROCESSED_DIR.glob("*")) if config.PROCESSED_DIR.exists() else []}


@router.get("/api/meta")
def meta() -> dict:
    """화면에서 쓰는 고정값 (상태·출처·결함 유형 이름)."""
    return {"statuses": STATUSES, "sources": SOURCES, "categories": CATEGORIES,
            "facility_types": {k: v[0] for k, v in FACILITY_TYPES.items()}, "departments": DEPARTMENTS}
