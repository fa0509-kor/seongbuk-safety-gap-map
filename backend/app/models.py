"""DB 표 정의. 표 설명은 docs/db.md."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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

    facility_type: Mapped[str | None] = mapped_column(String(20))         # 시설 종류 코드 (departments.FACILITY_TYPES)
    dept: Mapped[str | None] = mapped_column(String(50))                  # 담당 부서. 접수 때 규칙으로 1차 배정, 담당자가 수정 가능
    dept_note: Mapped[str | None] = mapped_column(Text)                   # 주민에게 보이는 담당 부서 메모
    dispatch: Mapped[bool] = mapped_column(Boolean, default=False)        # 현장 출동 여부
    false_positive: Mapped[bool] = mapped_column(Boolean, default=False)  # AI 오탐 표시
    true_category: Mapped[str | None] = mapped_column(String(20))         # 담당자가 고른 실제 유형 (AI 분류와 다를 때). 재학습·프롬프트 예시용
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)         # 체험용 사진으로 만든 제보
    confirm_count: Mapped[int] = mapped_column(Integer, default=0)        # 같은 곳 확인(나도 봤어요) 인원, 우선순위 3 기능

    # 공백 탐지 항목(source=gap)만 쓰는 열. backend/data/gap_items.json 에서 적재 (seed.py)
    gap_key: Mapped[str | None] = mapped_column(String(80), unique=True)  # 중복 적재 방지용 (예: hydrant_unusable:4655)
    gap_rule_code: Mapped[str | None] = mapped_column(String(40))         # hydrant_unusable / hydrant_coord
    gap_rule: Mapped[str | None] = mapped_column(String(50))              # 화면 이름
    gap_reason: Mapped[str | None] = mapped_column(String(200))

    photo: Mapped[Photo | None] = relationship(foreign_keys=[photo_key])
    history: Mapped[list[StatusHistory]] = relationship(
        back_populates="report", order_by="StatusHistory.created_at", cascade="all, delete-orphan")
    photos: Mapped[list[ReportPhoto]] = relationship(
        back_populates="report", order_by="ReportPhoto.position", cascade="all, delete-orphan")
    feedback: Mapped[list[ReportFeedback]] = relationship(back_populates="report", cascade="all, delete-orphan")
    recurrence_link: Mapped[ReportLink | None] = relationship(
        foreign_keys="ReportLink.report_id", back_populates="report", uselist=False, cascade="all, delete-orphan")
    client: Mapped[ReportClient | None] = relationship(back_populates="report", uselist=False, cascade="all, delete-orphan")
    result_row: Mapped[ReportResult | None] = relationship(back_populates="report", uselist=False, cascade="all, delete-orphan")


class ReportPhoto(Base):
    """제보에 붙은 사진(최대 4장)과 사진별 메모·촬영 일시. position 0이 대표 사진(reports.photo_key와 같음).
    이 표가 없던 때의 제보는 행이 없고, 그때는 reports.photo_key 한 장만 있는 것으로 본다."""
    __tablename__ = "report_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    photo_key: Mapped[str] = mapped_column(ForeignKey("photos.key"))
    memo: Mapped[str | None] = mapped_column(String(200))             # 사진별 메모
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # 사진 촬영 일시 (사진 속 위치 정보는 지우지만 일시는 남김)

    report: Mapped[Report] = relationship(back_populates="photos")


class ReportFeedback(Base):
    """조치 완료 뒤 주민 확인: '고쳐졌어요(fixed)' / '아직 그대로예요(not_fixed)'. 로그인이 없어 브라우저가 만든 client_key로
    한 브라우저당 한 표만 받는다(바꿀 수는 있음). 한 사람이 여러 브라우저를 쓰면 늘 수 있어 담당자 확인이 필요하다."""
    __tablename__ = "report_feedback"
    __table_args__ = (UniqueConstraint("report_id", "client_key", name="uq_feedback_report_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))                     # fixed / not_fixed
    client_key: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    report: Mapped[Report] = relationship(back_populates="feedback")


class ReportClient(Base):
    """제보를 보낸 브라우저의 식별값. 로그인이 없어 브라우저가 만든 무작위 값(client_key)으로 '같은 브라우저에서 올라온 제보'를 담당자가
    확인한다. 사람을 특정하지 않고, 브라우저 데이터를 지우거나 다른 브라우저·폰을 쓰면 다른 값이 된다. 식별값 자체는 어떤 응답에도 내보내지 않는다."""
    __tablename__ = "report_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), unique=True, index=True)
    client_key: Mapped[str] = mapped_column(String(40), index=True)
    nickname: Mapped[str | None] = mapped_column(String(20))   # 주민이 정한 별명(선택). 실명·연락처를 쓰지 않도록 화면에서 안내
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    report: Mapped[Report] = relationship(back_populates="client")


class ReportResult(Base):
    """조치 완료 결과 한 건(보수 완료 / 소유자 안내 / 이상 없음). 새 표라서 서버가 켜질 때 자동으로 만들어진다(기존 표 변경 없음)."""
    __tablename__ = "report_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(20))                       # constants.RESULTS
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    report: Mapped[Report] = relationship(back_populates="result_row")


class ReportLink(Base):
    """같은 곳에서 조치 완료 뒤 다시 들어온 제보를 이전 제보와 잇는 기록(재발). 새 제보 하나에 이전 제보 하나."""
    __tablename__ = "report_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), unique=True, index=True)   # 새로 들어온 제보
    related_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)               # 이전(조치 완료) 제보
    kind: Mapped[str] = mapped_column(String(12), default="recurrence")
    days_after_done: Mapped[int] = mapped_column(Integer, default=0)
    distance_m: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    report: Mapped[Report] = relationship(foreign_keys=[report_id], back_populates="recurrence_link")
    related: Mapped[Report] = relationship(foreign_keys=[related_id])


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
