# DB 구조

- 정의: `backend/app/models.py`. 서버가 켜질 때 표가 없으면 만든다 (마이그레이션 도구 없음).
- 로컬은 `backend/var/app.db`(SQLite), 배포는 `DATABASE_URL`(Supabase Postgres). 같은 코드로 동작.
- 열을 추가·변경하면: 로컬은 `backend/var/app.db`를 지우고 다시 켠다. (10/19 공백 항목·확인 인원 열, 10/20 시설 종류 열 추가 → 그 전에 만든 로컬 DB는 지우고 다시 켤 것) 배포 DB는 Supabase SQL 편집기에서 `ALTER TABLE` (팀에 공유).

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
| facility_type | 문자 | 시설 종류 코드 (`backend/app/departments.py` FACILITY_TYPES). 주민이 제보할 때 고름, 기본 unknown |
| dept | 문자 | 담당 부서. 접수 때 규칙으로 1차 배정(시설 종류 / 공백 항목은 성북소방서), 담당자가 수정 |
| dept_note | 글 | 주민에게 보이는 담당 부서 메모 |
| dispatch | 참/거짓 | 현장 출동 |
| false_positive | 참/거짓 | AI 오탐 표시. 지도에서 숨김 |
| true_category | 문자 | 담당자가 고른 실제 유형. AI 분류가 틀렸을 때 정답으로 모음 (재학습·프롬프트 예시용) |
| is_demo | 참/거짓 | 체험용 사진으로 만든 제보 |
| confirm_count | 정수 | 같은 곳 확인 인원 (우선순위 +5/명, 최대 +20) |
| gap_key | 문자, 고유 | 공백 항목 중복 적재 방지 (예: `hydrant_unusable:4655`) |
| gap_rule_code, gap_rule | 문자 | 공백 규칙 코드·화면 이름 (`hydrant_unusable` 사용불가 표시, `hydrant_coord` 좌표 누락·이상, `hydrant_distance_140`·`hydrant_distance_100` 거리 기준 초과 의심) |
| gap_reason | 문자 200 | 규칙이 잡은 이유 |

우선순위 점수·기한은 DB에 저장하지 않고 응답할 때 계산한다 (`backend/app/scoring.py`). 값을 바꾸면 바로 반영됨.

## report_photos — 제보에 붙은 사진 (최대 4장)

| 열 | 종류 | 설명 |
| --- | --- | --- |
| id | 정수 | 기본 키 |
| report_id | → reports.id | 어느 제보의 사진인지 |
| position | 정수 | 0이 대표 사진 (reports.photo_key와 같음), 1~3이 추가 사진 |
| photo_key | → photos.key | 사진 |
| memo | 문자 200 | 사진별 메모 |
| taken_at | 시각 | 촬영 일시 (브라우저가 EXIF에서 읽어 보냄, 없으면 파일 수정 시각) |

새 표라서 서버가 켜질 때 `create_all`이 자동으로 만든다 (배포 DB에 SQL을 따로 실행할 필요 없음). 이 표가 생기기 전의 제보는 행이 없고, 그때는 `reports.photo_key` 한 장만 있는 것으로 본다.

## report_feedback — 조치 완료 뒤 주민 확인
`report_id`, `client_key`(브라우저 무작위 값, 제보당 한 표), `kind`(fixed｜not_fixed), `created_at`. 새 표라서 서버가 켜질 때 자동으로 만들어짐(ALTER 없음).

## report_links — 재발 연결
`report_id`(새 제보), `prior_report_id`(이전에 완료된 제보), `days_after_done`, `created_at`. 새 표, 자동 생성.

## report_clients — 제보를 보낸 브라우저 식별값
`report_id`(제보당 하나), `client_key`(브라우저가 만든 무작위 값), `nickname`(주민이 정한 별명, 선택, 20자), `created_at`. 같은 브라우저에서 올라온 제보를 담당자가 확인하는 용도다. 사람을 특정하지 못하고(브라우저 데이터 삭제·시크릿 모드·다른 기기면 다른 값), 식별값 자체는 어떤 응답에도 내보내지 않는다. 새 표라서 서버가 켜질 때 자동 생성(ALTER 없음).

## status_history — 처리 이력
| 열 | 형식 | 설명 |
| --- | --- | --- |
| id | 정수 PK | |
| report_id | → reports.id | |
| created_at | 시각 | |
| from_status, to_status | 문자 | 상태가 안 바뀐 메모는 둘이 같음 |
| note | 글 | 처리 메모 |
| photo_key | → photos.key | 조치 후 사진 |
