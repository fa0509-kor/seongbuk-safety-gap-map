"""API 요청·응답 모양. 서버를 켜고 /docs 에서 직접 눌러볼 수 있다. 설명은 docs/api.md."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Alternative(BaseModel):
    category: str
    confidence: int


class Moderation(BaseModel):
    """AI 공개 검수 결과. ok=None이면 검수하지 못한 것(키 없음, 호출 실패, 옛 사진)."""
    checked: bool = False
    ok: bool | None = None
    flags: list[str] = Field([], description="person(얼굴) / plate(번호판) / inappropriate / off_topic")
    reason: str = ""
    version: str | None = None


class AIResult(BaseModel):
    category: str
    confidence: int = Field(description="모델이 스스로 적은 값(0~100). 정확도가 아님")
    alternatives: list[Alternative] = []
    reason: str = ""
    mock: bool = False
    prompt_version: str | None = None
    fixed: list[str] | None = Field(None, description="허용값 밖이라 보정한 내용")
    error: str | None = Field(None, description="실제 AI 호출이 실패해 임시 결과를 쓴 경우")
    moderation: Moderation | None = Field(None, description="지도 공개 전 AI 검수(얼굴·번호판 등). 분류와는 별개")


class PhotoOut(BaseModel):
    key: str
    url: str
    width: int | None = None
    height: int | None = None
    ai: AIResult | None = None
    ai_provider: str | None = None


class PhotoIn(BaseModel):
    photo_key: str = Field(description="POST /api/photos?classify=false 응답의 key")
    memo: str | None = Field(None, max_length=200, description="사진별 메모")
    taken_at: datetime | None = Field(None, description="촬영 일시")


class ReportCreate(BaseModel):
    photo_key: str = Field(description="POST /api/photos 응답의 key (대표 사진, AI 분류 대상)")
    lat: float | None = None
    lon: float | None = None
    address: str | None = Field(None, max_length=200)
    memo: str | None = Field(None, max_length=200)
    is_demo: bool = False
    facility_type: str | None = Field(None, description="시설 종류 코드 (GET /api/meta 의 facility_types). 없으면 unknown")
    taken_at: datetime | None = Field(None, description="대표 사진 촬영 일시")
    photo_memo: str | None = Field(None, max_length=200, description="대표 사진 메모")
    accuracy_m: float | None = Field(None, description="폰이 알려 준 위치 정확도(m). '같은 곳' 판정 반경을 정하는 데 쓴다. 핀을 직접 옮겼으면 비움")
    extra_photos: list[PhotoIn] = Field(default_factory=list, max_length=3, description="대표 사진 말고 더 붙이는 사진 (최대 3장)")
    client_nickname: str | None = Field(None, max_length=20, description="주민이 정한 별명(선택, 20자). 담당자 화면에만 보임")
    client_key: str | None = Field(None, min_length=8, max_length=40, description="브라우저가 만든 무작위 값. 같은 브라우저에서 올라온 제보를 담당자가 확인하는 데 쓰며 응답에는 내보내지 않음")


class AdminReportCreate(ReportCreate):
    source: str = Field("cctv", description="cctv 또는 gap")


class HistoryOut(BaseModel):
    at: datetime
    from_status: str | None
    to_status: str
    to_status_label: str
    note: str | None = None
    photo_url: str | None = None


class ReportPhotoOut(BaseModel):
    position: int
    photo_url: str | None
    memo: str | None = None
    taken_at: datetime | None = None


class FeedbackIn(BaseModel):
    kind: Literal["fixed", "not_fixed"] = Field(description="fixed 고쳐졌어요 / not_fixed 아직 그대로예요")
    client_key: str = Field(min_length=8, max_length=40, description="브라우저가 만든 무작위 값. 한 브라우저당 한 표")


class CancelIn(BaseModel):
    client_key: str = Field(min_length=8, max_length=40, description="제보를 보낼 때 함께 보낸 브라우저 식별값. 같아야 취소할 수 있다")


class RecurrenceOut(BaseModel):
    days_after_done: int = Field(description="이전 제보가 완료된 뒤 며칠 만에 같은 곳에서 다시 제보됐는지")
    admin_id: int | None = Field(None, description="관리자 응답에만 있음")


class AftercareOut(BaseModel):
    """조치 완료 뒤 주민 확인과 재발 연결."""
    fixed: int = 0
    not_fixed: int = 0
    recurrence: RecurrenceOut | None = Field(None, description="이 제보가 이전 제보의 재발이면 이전 제보 정보")
    recheck_due: bool | None = Field(None, description="관리자 응답에만 있음. 완료 후 RECHECK_DAYS가 지났는데 '고쳐졌어요' 확인이 없음")
    recheck_at: datetime | None = Field(None, description="관리자 응답에만 있음. 재점검 예정일")


class ReportOut(BaseModel):
    """주민 화면용 (내 제보, 지도 하단 시트)."""
    public_id: str
    created_at: datetime
    status: str
    status_label: str
    result: str | None = Field(None, description="조치 완료 결과 코드 (repaired / owner_notified / no_issue)")
    result_label: str | None = Field(None, description="조치 완료 결과 이름 (보수 완료 / 소유자 안내 / 이상 없음)")
    news_at: datetime = Field(description="주민에게 보이는 변화가 마지막으로 생긴 시각. 브라우저에 저장한 확인 시각보다 늦으면 빨간 점")
    lat: float | None
    lon: float | None
    address: str | None
    memo: str | None
    photo_url: str | None
    after_photo_url: str | None = Field(None, description="가장 최근 조치 후 사진")
    ai: AIResult | None
    facility_type: str | None = None
    facility_label: str | None = None
    dept: str | None = Field(None, description="담당 부서 (규칙 1차 배정 → 담당자 수정 가능)")
    dept_note: str | None
    confirm_count: int = Field(0, description="같은 곳 확인(나도 봤어요) 인원")
    cross_checked: bool = Field(False, description="확인 인원이 CROSS_CHECK_MIN(3명) 이상이면 true. 로그인이 없어 브라우저 기준")
    photos: list[ReportPhotoOut] = Field(default_factory=list, description="붙은 사진 전체(대표 사진 포함, 최대 4장). 사진별 메모·촬영 일시")
    aftercare: AftercareOut = Field(default_factory=AftercareOut, description="조치 완료 뒤 주민 확인(고쳐졌어요/아직이에요)과 재발 연결")
    not_target: bool = Field(False, description="담당자가 '처리 대상 아님'(AI 오탐 표시)으로 닫았으면 true. 이유는 dept_note에 적는다")
    history: list[HistoryOut]


class NearbyReport(BaseModel):
    """제보 화면에서 '같은 곳에 이미 접수된 제보'로 보여 주는 요약. 사진·메모는 넣지 않는다."""
    public_id: str
    category: str | None
    status: str
    status_label: str
    created_at: datetime
    distance_m: int
    state: Literal["open", "recent_done", "old_done"] = Field("open", description="open 진행 중 / recent_done 완료 후 RECENT_DONE_DAYS 이내 / old_done 그보다 오래전 완료(재발 후보)")
    done_days_ago: int | None = Field(None, description="완료된 지 며칠 됐는지 (완료 건만)")
    fixed: int = 0
    not_fixed: int = 0
    confirm_count: int = 0
    dept: str | None = None
    facility_label: str | None = None


class PriorityItem(BaseModel):
    label: str
    points: int
    note: str | None = None


class Priority(BaseModel):
    """규칙이 매긴 점수 (backend/app/scoring.py). 상세 화면에 items를 그대로 펼쳐 보여 준다."""
    total: int
    items: list[PriorityItem]
    urgent: bool = Field(description="URGENT_THRESHOLD 이상이면 기한이 짧아짐")
    due_at: datetime | None = Field(None, description="조치 시작 기한. 공백 후보(source=gap)는 없음")
    overdue: bool | None = Field(None, description="기한이 지났는데 완료가 아님")
    needs_review: bool = Field(False, description="AI 신뢰도가 기준(50) 미만 → '담당자 확인 필요' 표시. 점수에는 영향 없음")


class AdminReportOut(ReportOut):
    """관리자 화면용. 주민용 필드 + 관리 필드."""
    id: int
    updated_at: datetime
    source: str
    source_label: str
    dispatch: bool
    false_positive: bool
    true_category: str | None = None
    is_demo: bool
    gap_rule: str | None = Field(None, description="공백 탐지 항목의 규칙 이름")
    gap_reason: str | None = None
    priority: Priority
    season: str | None = Field(None, description="접수 달 기준 계절 점검 시기(해빙기 2~3월, 우기 5~6월, 동절기 11~12월. 팀 가정)")
    photo_age_days: int | None = Field(None, description="대표 사진 촬영일이 접수일보다 며칠 앞서는지. 촬영일 정보가 없으면 null")
    same_client_reports: int | None = Field(None, description="같은 브라우저(client_key)에서 올라온 제보 수(이 제보 포함). 식별값이 없으면 null")
    client_nickname: str | None = Field(None, description="주민이 정한 별명(선택)")
    client_code: str | None = Field(None, description="식별값 앞 8자리. 주민이 '내 제보' 화면에서 보는 번호와 맞춰 볼 수 있게 함. 전체 값은 내보내지 않음")
    same_client_24h: int | None = Field(None, description="그중 이 제보 접수 전후 24시간 안에 올라온 수(이 제보 포함)")
    stale_photo: bool = Field(False, description="photo_age_days가 STALE_PHOTO_DAYS 초과(옛 사진 재사용 의심). 점수에는 반영하지 않음")


class Screening(BaseModel):
    facilities_total: int = Field(description="공공데이터 안전시설 전체 개수 (summary.json)")
    facilities: dict[str, int]
    targets: int = Field(description="규칙으로 먼저 확인할 곳 = 공백 탐지 항목 수")
    targets_done: int = Field(description="그중 조치 완료로 바뀐 곳")
    ratio_pct: float | None = Field(None, description="targets / facilities_total (%)")
    by_rule: dict[str, int]


class OnTime(BaseModel):
    on_time: int = Field(description="기한 안에 조치를 시작한 건")
    due_total: int = Field(description="기한이 지났거나 완료된 건 (판단 대상)")
    rate_pct: int | None = Field(None, description="on_time / due_total (%). 대상이 없으면 null")


class AftercareSummary(BaseModel):
    reopened: int = Field(description="조치 완료인데 주민이 '아직 그대로'라고 한 건(그대로가 고쳐짐보다 많음)")
    recurred: int = Field(description="같은 곳에서 조치 완료 뒤 다시 제보돼 이전 제보와 이어진 건")
    recheck_due: int = Field(description="완료 후 RECHECK_DAYS가 지났는데 '고쳐졌어요' 확인이 없는 건")


class PlaceHistoryItem(BaseModel):
    """같은 곳에서 있었던 제보 이력 한 줄 (관리자 상세의 장소 이력)."""
    id: int
    public_id: str
    created_at: datetime
    status: str
    status_label: str
    done_at: datetime | None = None
    category: str | None = None
    distance_m: int
    relation: Literal["self", "prior", "later", "nearby"] = "nearby"
    photo_url: str | None = None
    after_photo_url: str | None = None
    fixed: int = 0
    not_fixed: int = 0


class FirstReview(BaseModel):
    count: int = Field(0, description="접수에서 다른 상태로 처음 바뀐(=첫 확인이 있었던) 제보 수")
    avg_hours: float | None = Field(None, description="접수→첫 확인 평균 시간. 확인된 제보가 없으면 null")
    median_hours: float | None = None
    within_24h_pct: int | None = Field(None, description="첫 확인이 24시간 안에 이뤄진 비율(%)")
    waiting: int = Field(0, description="아직 접수 상태(확인 전)인 제보 수")
    oldest_waiting_hours: float | None = Field(None, description="확인 전 제보 중 가장 오래 기다린 시간")


class AdminSummary(BaseModel):
    today_new: int = Field(description="오늘(한국 시간) 들어온 주민·CCTV 제보 (공백 후보 제외)")
    overdue_open: int = Field(description="기한이 지났는데 완료가 아닌 건")
    done_this_month: int
    avg_days_to_done: float | None = Field(None, description="완료된 건의 접수→완료 평균 일수. 완료 건이 없으면 null")
    open_by_status: dict[str, int]
    on_time: OnTime = Field(description="기한 내 조치 시작률 (주민·CCTV 제보, 체험용·오탐 제외)")
    screening: Screening = Field(description="데이터 사전 점검 지표 (docs/benchmark.md)")
    aftercare: AftercareSummary = Field(description="조치 완료 이후 사후 관리 건수")
    first_review: FirstReview = Field(default_factory=FirstReview, description="접수 후 첫 확인까지 걸린 시간 (체험·오탐 제외)")


class PublicStats(BaseModel):
    week_reports: int = Field(description="이번 주(월요일 시작, 한국 시간) 주민 제보 수. 체험·오탐 제외")
    week_done: int = Field(description="이번 주 완료 처리된 주민 제보 수")


class RankRow(BaseModel):
    rank: int
    nickname: str = Field(description="주민이 정한 별명(실명 아님). 별명이 없으면 '이름 없는 주민'")
    count: int = Field(description="담당자가 확인을 시작한 제보 수")
    points: int
    title: str | None = Field(None, description="1등에게 붙는 이름(안전왕)")
    is_me: bool = Field(False, description="요청한 브라우저의 순위인가")


class RankingOut(BaseModel):
    points_per_report: int
    total_players: int
    top: list[RankRow]
    me: RankRow | None = Field(None, description="client_key를 보냈고 순위가 있을 때만")


class ReportUpdate(BaseModel):
    """관리자 상세에서 바꾸는 값. 보낸 항목만 바뀐다."""
    status: str | None = Field(None, description="received / review / action / done")
    note: str | None = Field(None, description="처리 이력에 남는 메모")
    after_photo_key: str | None = Field(None, description="조치 후 사진 (POST /api/photos 의 key)")
    dept: str | None = None
    dept_note: str | None = Field(None, description="주민 내 제보에 보이는 담당 부서 메모")
    dispatch: bool | None = None
    false_positive: bool | None = None
    true_category: str | None = Field(None, description="담당자가 확인한 실제 유형 (constants.CATEGORIES). 빈 문자열이면 지움")
    result: str | None = Field(None, description="조치 완료 결과 (constants.RESULTS: repaired / owner_notified / no_issue). 상태가 완료일 때만. 빈 문자열이면 지움")
