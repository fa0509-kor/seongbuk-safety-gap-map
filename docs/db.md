# DB 구조

- 정의: `backend/app/models.py`. 서버가 켜질 때 표가 없으면 만든다 (마이그레이션 도구 없음).
- 로컬은 `backend/var/app.db`(SQLite), 배포는 `DATABASE_URL`(Supabase Postgres). 같은 코드로 동작.
- 열을 추가·변경하면: 로컬은 `backend/var/app.db`를 지우고 다시 켠다. (10/19 공백 항목·확인 인원 열 추가 → 그 전에 만든 로컬 DB는 지우고 다시 켤 것) 배포 DB는 Supabase SQL 편집기에서 `ALTER TABLE` (팀에 공유).

## photos — 올라온 사진 1장
| 열 | 형식 | 설명 |
| --- | --- | --- |
| key | 문자 PK | 저장소 파일 이름 (`uuid.jpg`) |
| created_at | 시각(UTC) | |
| width, height | 정수 | 줄인 뒤 크기 (긴 변 1600) |
| ai | JSON | 분류 결과 (`docs/api.md` 사진 응답의 `ai`) |
| ai_provider | 문자 | mock / openai / anthropic (학습 모델 연결 시 model) |

제보 사진, 조치 후 사진, CCTV 프레임이 모두 여기에 들어간다. 저장 전에 EXIF(촬영 위치 등)를 지운다.

## reports — 제보 1건
| 열 | 형식 | 설명 |
| --- | --- | --- |
| id | 정수 PK | 관리자 화면 번호 (#12) |
| public_id | 문자 12자, 고유 | 주민 "내 제보"용. 순번이 아니라 남의 제보를 짐작하기 어렵게 |
| created_at, updated_at | 시각 | |
| news_at | 시각 | 주민에게 보이는 변화가 마지막으로 생긴 시각 (빨간 점) |
| source | 문자 | resident / gap / cctv |
| status | 문자 | received / review / action / done |
| lat, lon | 실수 | WGS84. 위치 못 받으면 비어 있음 |
| address | 문자 | (주소 검색 기능 생기면 채움) |
| memo | 문자 200 | 주민 한 줄 메모 |
| photo_key | → photos.key | 제보 사진 |
| ai_category, ai_confidence | | 필터·정렬용으로 photos.ai에서 복사 |
| dept | 문자 | 담당 부서 (규칙 배정 미구현) |
| dept_note | 글 | 주민에게 보이는 담당 부서 메모 |
| dispatch | 참/거짓 | 현장 출동 |
| false_positive | 참/거짓 | AI 오탐 표시. 지도에서 숨김 |
| is_demo | 참/거짓 | 체험용 사진으로 만든 제보 |
| confirm_count | 정수 | 같은 곳 확인 인원 (우선순위 +5/명, 최대 +20) |
| gap_key | 문자, 고유 | 공백 항목 중복 적재 방지 (예: `hydrant_unusable:4655`) |
| gap_rule_code, gap_rule | 문자 | 공백 규칙 코드·화면 이름 (`hydrant_unusable` 사용불가 표시, `hydrant_coord` 좌표 누락·이상, `hydrant_distance_140`·`hydrant_distance_100` 거리 기준 초과 의심) |
| gap_reason | 문자 200 | 규칙이 잡은 이유 |

우선순위 점수·기한은 DB에 저장하지 않고 응답할 때 계산한다 (`backend/app/scoring.py`). 값을 바꾸면 바로 반영됨.

## status_history — 처리 이력
| 열 | 형식 | 설명 |
| --- | --- | --- |
| id | 정수 PK | |
| report_id | → reports.id | |
| created_at | 시각 | |
| from_status, to_status | 문자 | 상태가 안 바뀐 메모는 둘이 같음 |
| note | 글 | 처리 메모 |
| photo_key | → photos.key | 조치 후 사진 |
