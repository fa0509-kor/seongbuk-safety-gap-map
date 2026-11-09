"""화면·API·DB가 같이 쓰는 고정값. 값을 바꿀 때는 docs/api.md도 같이 고친다."""
from __future__ import annotations

from datetime import timedelta, timezone

# '오늘'·'이번 주' 계산용 한국 시간 (서머타임 없음. Windows에서 tzdata 없이 동작하도록 고정 오프셋)
KST = timezone(timedelta(hours=9), "KST")

# 처리 상태 (와이어프레임: 접수 → 검토 → 조치 → 완료)
STATUSES = {"received": "접수", "review": "검토", "action": "조치", "done": "완료"}
STATUS_ORDER = list(STATUSES)

# '나도 봤어요'가 이 인원 이상이면 '주민 교차확인' 표시 (AI 생성 사진·허위 제보를 걸러내는 보조 장치).
# 로그인이 없어 브라우저(localStorage) 기준이라 한 사람이 여러 브라우저로 누르면 늘 수 있음. 시연·설계 단계의 한계로 문서에 남김.
CROSS_CHECK_MIN = 3

# 조치 완료 결과 (담당자가 완료로 바꿀 때 고른다). 주민 화면 문구는 "시설 + 결함 + 결과" (예: 옹벽 표면 벗겨짐 · 보수 완료)
RESULTS = {"repaired": "보수 완료", "owner_notified": "소유자 안내", "no_issue": "이상 없음"}

# 안전왕 순위(홈). 담당자가 확인을 시작한 제보(검토 이후, 체험·오탐 제외) 1건당 점수. 접수만으로는 점수를 주지 않는다(가짜 제보로 쌓는 것을 막으려는 팀 가정).
POINTS_PER_REPORT = 10
RANK_TOP_TITLE = "안전왕"     # 1등(공동 1등 포함)에게 붙는 이름

# 조치 완료 이후(사후 관리). 아래 숫자는 모두 팀 가정이다. 근거 자료가 없고 파일럿에서 담당 부서와 정한다.
AFTERCARE_RADIUS_M = 50       # '같은 곳'으로 보는 기본 반경(m). 폰이 위치 정확도를 알려 주면 그에 맞춰 넓힘
AFTERCARE_RADIUS_MIN_M = 30   # 건물 사이 GPS 오차를 감안한 최소 반경
AFTERCARE_RADIUS_MAX_M = 200
RECENT_DONE_DAYS = 14         # 완료 후 이 기간 안에 같은 곳 제보가 오면 새 제보 대신 '아직 그대로예요'로 연결
RECUR_LOOKBACK_DAYS = 180     # 완료 후 이 기간 안에 같은 곳에서 다시 제보되면 '재발'로 기록
RECHECK_DAYS = 30             # 완료 후 이 기간이 지나도 '고쳐졌어요' 확인이 없으면 재점검 대상
NOT_FIXED_MIN = 2             # '아직 그대로예요'가 이 인원 이상(그리고 고쳐졌어요보다 많음)이면 우선순위 가산
REOPEN_POINTS = 15            # 조치 후에도 그대로라는 주민 재확인 가산점
RECUR_POINTS = 10             # 재발 가산점

# 사진 신뢰 확인과 계절 표시. 이 값도 팀 가정이다 (근거 자료 없음, 담당 부서와 정함).
STALE_PHOTO_DAYS = 3          # 촬영일이 접수일보다 이 일수 넘게 앞서면 '오래된 사진'으로 표시 (옛 사진 재사용 확인용, 점수에는 반영하지 않음)
SEASONS = {2: "해빙기", 3: "해빙기", 5: "우기", 6: "우기", 11: "동절기", 12: "동절기"}  # 접수 달(한국 시간) → 계절 점검 시기


def radius_for(accuracy_m: float | None) -> int:
    """같은 곳 판정 반경(m). 위치 정확도(m)를 모르면 기본값, 알면 1.5배를 최소~최대 범위로 자른다."""
    if not accuracy_m or accuracy_m <= 0:
        return AFTERCARE_RADIUS_M
    return int(min(AFTERCARE_RADIUS_MAX_M, max(AFTERCARE_RADIUS_MIN_M, round(accuracy_m * 1.5))))


# 제보 출처 (관리자 목록 필터)
SOURCES = {"resident": "주민", "gap": "공백 탐지", "cctv": "CCTV"}

# AI 결함 유형 (CLAUDE.md 2. 사진 분류). 허용값 밖은 '기타'로 보정한다.
CATEGORIES = ["콘크리트 균열", "박리", "백태/누수", "철근 노출", "기타"]
