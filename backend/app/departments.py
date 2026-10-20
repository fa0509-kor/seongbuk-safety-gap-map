"""부서 자동 배정 규칙 (규칙, AI 아님). 표의 근거는 docs/departments.md (성북구청 조직도, 2026-10-20 확인).

- 부서는 결함 유형이 아니라 시설 종류로 갈린다 → 제보할 때 주민이 시설 종류를 고른다 (모르면 '모름')
- 옹벽·축대는 조직도에 담당 팀이 적혀 있지 않아 안전점검 총괄(도시안전과 안전지원팀)에 1차 배정하고 담당자가 재배정한다
- 담당자는 관리자 상세에서 부서를 바꿀 수 있다 (PATCH dept)
"""
from __future__ import annotations

DEFAULT_DEPT = "도시안전과 안전지원팀"

# 코드: (화면 이름, 1차 배정 부서)
FACILITY_TYPES: dict[str, tuple[str, str]] = {
    "retaining_wall": ("옹벽·축대", DEFAULT_DEPT),          # 조직도에 명시된 팀 없음 → 총괄에 1차 배정
    "stairs": ("계단", "도로과 도로시설팀"),                  # 노후계단 정비
    "sidewalk": ("보도·도로", "도로과 보도관리팀"),           # 보도 유지관리 (차도 파손은 담당자가 도로시설팀으로 재배정)
    "park": ("공원·놀이시설", "공원녹지과 공원관리팀"),       # 어린이놀이시설 안전관리
    "building": ("건물 외벽·담장", "건축과 건축안전팀"),      # 민간 안전취약시설물
    "river": ("하천·하수", "치수과 치수팀"),                  # 하천시설물
    "unknown": ("모름", DEFAULT_DEPT),
}

# 공백 탐지 규칙 → 담당 (소방용수는 구청이 아니라 소방서)
GAP_DEPTS = {
    "hydrant_unusable": "성북소방서",
    "hydrant_coord": "성북소방서",
    "hydrant_distance_140": "성북소방서",
    "hydrant_distance_100": "성북소방서",
}


# 관리자 상세에서 재배정할 때 고르는 목록 (docs/departments.md 표)
DEPARTMENTS = [
    "도시안전과 안전지원팀", "도로과 도로시설팀", "도로과 보도관리팀", "도로과 도로조명팀", "도로과 도로굴착팀",
    "건축과 건축안전팀", "주택정책과 공동주택관리2팀", "공원녹지과 공원관리팀", "공원녹지과 자연생태팀",
    "치수과 치수팀", "치수과 하수팀", "교통행정과 교통개선팀", "교통행정과 교통시설팀", "성북소방서",
]


def facility_label(code: str | None) -> str | None:
    return FACILITY_TYPES[code][0] if code in FACILITY_TYPES else None


def assign(source: str, facility_type: str | None = None, gap_rule_code: str | None = None) -> str:
    if source == "gap":
        return GAP_DEPTS.get(gap_rule_code or "", DEFAULT_DEPT)
    return FACILITY_TYPES.get(facility_type or "unknown", FACILITY_TYPES["unknown"])[1]
