"""API 요청·응답 모양. 서버를 켜고 /docs 에서 직접 눌러볼 수 있다. 설명은 docs/api.md."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Alternative(BaseModel):
    category: str
    confidence: int


class AIResult(BaseModel):
    category: str
    confidence: int = Field(description="모델이 스스로 적은 값(0~100). 정확도가 아님")
    alternatives: list[Alternative] = []
    reason: str = ""
    mock: bool = False
    prompt_version: str | None = None
    fixed: list[str] | None = Field(None, description="허용값 밖이라 보정한 내용")
    error: str | None = Field(None, description="실제 AI 호출이 실패해 임시 결과를 쓴 경우")


class PhotoOut(BaseModel):
    key: str
    url: str
    width: int | None = None
    height: int | None = None
    ai: AIResult | None = None
    ai_provider: str | None = None


class ReportCreate(BaseModel):
    photo_key: str = Field(description="POST /api/photos 응답의 key")
    lat: float | None = None
    lon: float | None = None
    address: str | None = Field(None, max_length=200)
    memo: str | None = Field(None, max_length=200)
    is_demo: bool = False


class AdminReportCreate(ReportCreate):
    source: str = Field("cctv", description="cctv 또는 gap")


class HistoryOut(BaseModel):
    at: datetime
    from_status: str | None
    to_status: str
    to_status_label: str
    note: str | None = None
    photo_url: str | None = None


class ReportOut(BaseModel):
    """주민 화면용 (내 제보, 지도 하단 시트)."""
    public_id: str
    created_at: datetime
    status: str
    status_label: str
    news_at: datetime = Field(description="주민에게 보이는 변화가 마지막으로 생긴 시각. 브라우저에 저장한 확인 시각보다 늦으면 빨간 점")
    lat: float | None
    lon: float | None
    address: str | None
    memo: str | None
    photo_url: str | None
    after_photo_url: str | None = Field(None, description="가장 최근 조치 후 사진")
    ai: AIResult | None
    dept_note: str | None
    history: list[HistoryOut]


class PriorityItem(BaseModel):
    label: str
    points: int
    note: str | None = None


class Priority(BaseModel):
    """규칙이 매긴 점수 (backend/app/scoring.py). 상세 화면에 items를 그대로 펼쳐 보여 준다."""
    total: int
    items: list[PriorityItem]
    urgent: bool = Field(description="URGENT_THRESHOLD 이상이면 기한이 짧아짐")
    due_at: datetime | None = Field(None, description="조치 기한. 공백 후보(source=gap)는 없음")
    overdue: bool | None = Field(None, description="기한이 지났는데 완료가 아님")


class AdminReportOut(ReportOut):
    """관리자 화면용. 주민용 필드 + 관리 필드."""
    id: int
    updated_at: datetime
    source: str
    source_label: str
    dept: str | None
    dispatch: bool
    false_positive: bool
    is_demo: bool
    confirm_count: int
    gap_rule: str | None = Field(None, description="공백 탐지 항목의 규칙 이름")
    gap_reason: str | None = None
    priority: Priority


class AdminSummary(BaseModel):
    today_new: int = Field(description="오늘(한국 시간) 들어온 주민·CCTV 제보 (공백 후보 제외)")
    overdue_open: int = Field(description="기한이 지났는데 완료가 아닌 건")
    done_this_month: int
    avg_days_to_done: float | None = Field(None, description="완료된 건의 접수→완료 평균 일수. 완료 건이 없으면 null")
    open_by_status: dict[str, int]


class PublicStats(BaseModel):
    week_reports: int = Field(description="이번 주(월요일 시작, 한국 시간) 주민 제보 수. 체험·오탐 제외")
    week_done: int = Field(description="이번 주 완료 처리된 주민 제보 수")


class ReportUpdate(BaseModel):
    """관리자 상세에서 바꾸는 값. 보낸 항목만 바뀐다."""
    status: str | None = Field(None, description="received / review / action / done")
    note: str | None = Field(None, description="처리 이력에 남는 메모")
    after_photo_key: str | None = Field(None, description="조치 후 사진 (POST /api/photos 의 key)")
    dept: str | None = None
    dept_note: str | None = Field(None, description="주민 내 제보에 보이는 담당 부서 메모")
    dispatch: bool | None = None
    false_positive: bool | None = None
