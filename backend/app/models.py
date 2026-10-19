"""DB 표 정의. 표 설명은 docs/db.md."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_public_id() -> str:
    return uuid.uuid4().hex[:12]


class Photo(Base):
    """올라온 사진 1장과 그 사진의 AI 분류 결과. 제보·조치 후 사진·CCTV 프레임이 모두 여기에 들어간다."""
    __tablename__ = "photos"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)    # 저장소 안 파일 이름
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    ai: Mapped[dict | None] = mapped_column(JSON)                     # vision.classify 결과
    ai_provider: Mapped[str | None] = mapped_column(String(20))       # mock / openai / anthropic


class Report(Base):
    """제보 1건 (주민 사진, 공백 탐지 항목, CCTV 프레임)."""
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)         # 관리자 화면용 번호
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True, default=new_public_id)  # 주민 '내 제보'용
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    news_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)  # 주민에게 새 소식이 생긴 시각 (빨간 점)

    source: Mapped[str] = mapped_column(String(16), default="resident")   # constants.SOURCES
    status: Mapped[str] = mapped_column(String(16), default="received")   # constants.STATUSES
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    address: Mapped[str | None] = mapped_column(String(200))
    memo: Mapped[str | None] = mapped_column(String(200))                 # 주민 한 줄 메모

    photo_key: Mapped[str | None] = mapped_column(ForeignKey("photos.key"))
    ai_category: Mapped[str | None] = mapped_column(String(20))
    ai_confidence: Mapped[int | None] = mapped_column(Integer)

    dept: Mapped[str | None] = mapped_column(String(50))                  # 담당 부서 (규칙 배정, 미구현)
    dept_note: Mapped[str | None] = mapped_column(Text)                   # 주민에게 보이는 담당 부서 메모
    dispatch: Mapped[bool] = mapped_column(Boolean, default=False)        # 현장 출동 여부
    false_positive: Mapped[bool] = mapped_column(Boolean, default=False)  # AI 오탐 표시
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)         # 체험용 사진으로 만든 제보
    confirm_count: Mapped[int] = mapped_column(Integer, default=0)        # 같은 곳 확인(나도 봤어요) 인원, 우선순위 3 기능

    # 공백 탐지 항목(source=gap)만 쓰는 열. data/processed/gap_items.json 에서 적재 (seed.py)
    gap_key: Mapped[str | None] = mapped_column(String(80), unique=True)  # 중복 적재 방지용 (예: hydrant_unusable:4655)
    gap_rule_code: Mapped[str | None] = mapped_column(String(40))         # hydrant_unusable / hydrant_coord
    gap_rule: Mapped[str | None] = mapped_column(String(50))              # 화면 이름
    gap_reason: Mapped[str | None] = mapped_column(String(200))

    photo: Mapped[Photo | None] = relationship(foreign_keys=[photo_key])
    history: Mapped[list[StatusHistory]] = relationship(
        back_populates="report", order_by="StatusHistory.created_at", cascade="all, delete-orphan")


class StatusHistory(Base):
    """상태 변경·메모 기록 (관리자 상세의 처리 이력, 주민 내 제보의 진행 표시)."""
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(Text)
    photo_key: Mapped[str | None] = mapped_column(ForeignKey("photos.key"))  # 조치 후 사진

    report: Mapped[Report] = relationship(back_populates="history")
