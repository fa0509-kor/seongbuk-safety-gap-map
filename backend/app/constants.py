"""화면·API·DB가 같이 쓰는 고정값. 값을 바꿀 때는 docs/api.md도 같이 고친다."""
from __future__ import annotations

from datetime import timedelta, timezone

# '오늘'·'이번 주' 계산용 한국 시간 (서머타임 없음. Windows에서 tzdata 없이 동작하도록 고정 오프셋)
KST = timezone(timedelta(hours=9), "KST")

# 처리 상태 (와이어프레임: 접수 → 검토 → 조치 → 완료)
STATUSES = {"received": "접수", "review": "검토", "action": "조치", "done": "완료"}
STATUS_ORDER = list(STATUSES)

# 제보 출처 (관리자 목록 필터)
SOURCES = {"resident": "주민", "gap": "공백 탐지", "cctv": "CCTV"}

# AI 결함 유형 (CLAUDE.md 2. 사진 분류). 허용값 밖은 '기타'로 보정한다.
CATEGORIES = ["콘크리트 균열", "박리", "백태/누수", "철근 노출", "기타"]
