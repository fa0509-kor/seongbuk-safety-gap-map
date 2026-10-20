"""DB 연결. SQLite(로컬)와 Postgres(Supabase) 모두 같은 코드로 동작한다."""
from __future__ import annotations

import logging
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from . import config

if config.DATABASE_URL.startswith("sqlite"):
    config.VAR_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine(config.DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Supabase Transaction pooler(포트 6543) 기준. 서버리스(Vercel)는 요청마다 새 연결을 쓰고 pooler가 재사용을 맡는다.
    # - NullPool: Supabase 문서 'Using SQLAlchemy with Supabase'의 transaction 모드 권장 설정
    # - prepare_threshold=None: transaction 모드 pooler는 prepared statement를 유지하지 못해 psycopg 자동 준비를 끔
    url = config.DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(url, poolclass=NullPool, connect_args={"prepare_threshold": None})

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


STARTUP_ERROR: str | None = None  # 시작 준비(표 생성·공백 적재) 실패 사유. /api/health 에서 보여줌


def short_error(e: Exception) -> str:
    """에러 첫 줄만 (DB 주소·비밀번호는 psycopg 메시지에 들어가지 않음)."""
    return f"{type(e).__name__}: {str(e).strip().splitlines()[0][:200] if str(e).strip() else ''}"


def prepare() -> bool:
    """표 생성 + 공백 항목 적재. 실패해도 서버는 켜두고(헬스 체크로 원인 확인), 다음 호출 때 다시 시도한다."""
    global STARTUP_ERROR
    from .seed import seed_gap_items
    try:
        init_db()
        seed_gap_items()
        STARTUP_ERROR = None
        return True
    except Exception as e:  # noqa: BLE001
        STARTUP_ERROR = short_error(e)
        logging.getLogger(__name__).exception("시작 준비 실패")
        return False


def init_db() -> None:
    """표가 없으면 만든다. 배포에서는 서버가 동시에 여러 개 켜질 수 있어, 다른 쪽이 먼저 만들었으면 넘어간다."""
    from sqlalchemy.exc import IntegrityError, ProgrammingError

    from . import models  # noqa: F401  (표 정의를 등록)
    try:
        Base.metadata.create_all(engine)
    except (IntegrityError, ProgrammingError):
        logging.getLogger(__name__).warning("표 생성이 겹쳐 건너뜀 (다른 인스턴스가 먼저 만듦)")
