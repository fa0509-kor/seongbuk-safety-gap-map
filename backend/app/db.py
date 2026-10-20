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


def init_db() -> None:
    """표가 없으면 만든다. 배포에서는 서버가 동시에 여러 개 켜질 수 있어, 다른 쪽이 먼저 만들었으면 넘어간다."""
    from sqlalchemy.exc import IntegrityError, ProgrammingError

    from . import models  # noqa: F401  (표 정의를 등록)
    try:
        Base.metadata.create_all(engine)
    except (IntegrityError, ProgrammingError):
        logging.getLogger(__name__).warning("표 생성이 겹쳐 건너뜀 (다른 인스턴스가 먼저 만듦)")
