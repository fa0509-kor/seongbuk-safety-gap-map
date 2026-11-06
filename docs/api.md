# API 규격

- 서버를 켜고 `http://localhost:8000/docs` 에서 모든 API를 직접 눌러볼 수 있다 (이 문서보다 정확함).
- 화면 코드는 `frontend/src/lib/api.js` 의 함수만 쓴다. 주소를 바꾸면 이 문서와 api.js를 같이 고친다.
- 시각은 모두 UTC, ISO 형식(`2026-10-19T13:59:54Z`). 화면에서 `new Date()`로 읽으면 한국 시간으로 표시됨.
- 오류는 `{"detail": "한국어 사유"}` + 400/404.

## 고정값 (`GET /api/meta`)
| 구분 | 코드 → 화면 이름 |
| --- | --- |
| 상태 `status` | `received` 접수 / `review` 검토 / `action` 조치 / `done` 완료 |
| 출처 `source` | `resident` 주민 / `gap` 공백 탐지 / `cctv` CCTV |
| 결함 유형 `category` | 콘크리트 균열 / 박리 / 백태/누수 / 철근 노출 / 기타 |

## 시스템
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | `{ok, db: sqlite/postgres, storage: local/supabase, vision_provider: mock/openai/anthropic, vision_check, db_url_check, data_files}`. `vision_check` = `{VISION_PROVIDER, anthropic_key_set, anthropic_key_prefix_ok, openai_key_set}` — 키 값은 내보내지 않고 있는지·형식만 (10/26 Vercel 키 붙여넣기 오류 진단용) |
| GET | `/api/meta` | 위 고정값 + `facility_types`(시설 종류 코드→이름), `departments`(재배정용 부서 목록) |

## 지도
| 메서드 | 주소 | 응답 |
| --- | --- | --- |
| GET | `/api/facilities` | GeoJSON. `properties: {kind: 소방용수/무더위쉼터/AED/어린이보호구역, name, address}` |
| GET | `/api/gaps` | (11/2부터 주민 지도에서는 쓰지 않음, 관리자 목록과 통합 점검에만 남김) 소방용수 '점검 필요(규칙)': 소방용수 사용불가 + 거리 기준 초과 의심. GeoJSON `properties: {rule, reason, address, kinds[]}`. **AI가 아니라 규칙 결과** → 화면에 "규칙"으로 표시 |
| GET | `/api/zones` | 보호구역 경계 (경찰청 API). GeoJSON. 경계가 있으면 `MultiPolygon`, 없으면 `Point`(시설 위치). `properties: {name, kind: 어린이/노인·장애인, has_boundary, point:[경도,위도], address}`. 주민 지도에 얇은 선으로 그림 |
| GET | `/api/admin/integrated` | 관리자용 통합 점검 후보(같은 주소에 안전시설 2종 이상). 형식은 위와 같음. 공백이 아님 |
| GET | `/api/reports/map?include_demo=false` | **주민 제보만**. GeoJSON `properties: {public_id, source, status, status_label, category, facility_label, confirm_count, cross_checked, created_at}`. 오탐 제외 |

`/api/facilities`, `/api/gaps`, `/api/admin/integrated` 는 `backend/data/*.geojson` 을 그대로 내보낸다 (`python backend/scripts/build_geojson.py` 로 생성). `/api/zones`는 `backend/data/zones.geojson` (`python backend/scripts/build_zones.py` 로 생성, 원본은 `data/raw/보호구역_성북구.json`).

## 집계
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| GET | `/api/stats` | 주민 첫 화면 `{week_reports, week_done}`. 이번 주(월요일 0시, 한국 시간)·주민 제보만·체험/오탐 제외 |
| GET | `/api/admin/summary` | 대시보드 `{today_new, overdue_open, done_this_month, avg_days_to_done, open_by_status, on_time, screening}`. `on_time` = 기한 내 조치 시작률 `{on_time, due_total, rate_pct}` (주민·CCTV 제보 중 기한이 지났거나 조치를 시작한 건 대비 기한 안에 조치 시작, 체험용·오탐 제외. 조치 시작 = 상태가 '조치' 또는 '완료'로 처음 바뀜). 공백 후보는 '오늘 신규'·기한에서 제외. `screening` = 데이터 사전 점검 `{facilities_total, facilities, targets, targets_done, ratio_pct, by_rule}` (`docs/benchmark.md`) |

## 사진
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| POST | `/api/photos?classify=true` | `multipart/form-data`, 필드 `file`. 저장 + AI 분류. 4MB 이하 (화면에서 1600px로 줄여서 보냄) |
| GET | `/api/photos/{key}` | 사진 파일 (Supabase면 서명 주소로 이동) |

응답:
```json
{
  "key": "3ebcf6d0....jpg",
  "url": "/api/photos/3ebcf6d0....jpg",
  "width": 1600, "height": 1200,
  "ai": {
    "category": "콘크리트 균열", "confidence": 80,
    "alternatives": [{"category": "박리", "confidence": 12}],
    "reason": "…", "mock": false, "prompt_version": "vision_v1",
    "fixed": null, "error": null
  },
  "ai_provider": "openai"
}
```
- `confidence`는 모델이 스스로 적은 값. "정확도"라고 표시하지 않는다.
- `mock: true`면 임시 결과 (키 없음 또는 호출 실패 → `error`에 사유).
- 조치 후 사진처럼 분류가 필요 없으면 `classify=false` → `ai: null`.

## 주민 제보
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| POST | `/api/reports` | 제보 보내기. 본문 `{photo_key, lat?, lon?, address?, memo?(200자), is_demo?, facility_type?, taken_at?, photo_memo?(200자), extra_photos?[{photo_key, memo?, taken_at?}](최대 3장)}`. `photo_key`는 대표 사진(AI 분류 대상), 추가 사진도 화면에서는 `POST /api/photos`(AI 분류 켬)로 올려 사진 메모 초안을 채우지만, 제보의 AI 분류·우선순위는 대표 사진만 쓴다. 시설 종류로 담당 부서 1차 배정 (`docs/departments.md`) |
| POST | `/api/reports/{public_id}/confirm` | 나도 봤어요(+1). `confirm_count` +1 → 우선순위 1명당 +5(최대 +20). 응답에 `cross_checked`(3명 이상이면 true, `constants.CROSS_CHECK_MIN`). 로그인이 없어 중복 방지는 브라우저에서만 → 한 사람이 여러 브라우저로 누르면 늘 수 있음 |
| POST | `/api/reports/{public_id}/feedback` | 조치 완료 뒤 주민 확인. 본문 `{kind: fixed｜not_fixed, client_key}`(8자 이상, 브라우저 무작위 값). 조치 완료 전에는 400. 한 브라우저당 한 표, 다시 보내면 바뀜. 응답은 ReportOut(`aftercare.fixed/not_fixed/recurrence`). 이전 제보 번호는 주민에게 내보내지 않음 |
| GET | `/api/reports?ids=a,b,c` | 내 제보 목록 (최대 50개). `ids`는 브라우저에 저장한 `public_id` |
| GET | `/api/reports/nearby?lat&lon&category?&accuracy?&radius_m?` | 같은 곳(기본 50m, 최대 200m)에 이미 접수된 주민 제보 요약. 제보 화면에서 중복 제보를 줄이려고 씀. 체험·오탐·공백 항목 제외, `category`를 주면 AI 분류가 같은 것만, 가까운 순 최대 5건. `{public_id, category, status, status_label, created_at, distance_m, confirm_count, dept, facility_label}` (사진·메모 없음) |
| GET | `/api/reports/{public_id}` | 제보 1건 |

`ReportOut.photos` = 붙은 사진 전체(대표 포함, 최대 4장) `[{position, photo_url, memo, taken_at}]`. 사진 표가 생기기 전의 제보는 대표 사진 한 장(`taken_at` 없음)으로 나온다. 촬영 일시는 사진 속 위치 정보(EXIF GPS)와 달리 남긴다. 점검 대장 엑셀에 `촬영 일시`, `사진 수` 열이 추가됨.

`ReportOut.not_target` = 담당자가 '처리 대상 아님'(AI 오탐 표시)으로 닫은 제보. 이유는 `dept_note`에 적는다. 주민 '내 제보'에서 "처리 대상 아님"과 이유로 보인다.

제보 응답 (`ReportOut`):
```json
{
  "public_id": "670fef51dae4",
  "created_at": "...", "status": "done", "status_label": "완료",
  "news_at": "...",
  "lat": 37.589, "lon": 127.016, "address": null, "memo": "옹벽에 금",
  "photo_url": "/api/photos/....jpg", "after_photo_url": "/api/photos/....jpg",
  "ai": { ... 위와 같음 ... },
  "facility_type": "stairs", "facility_label": "계단", "dept": "도로과 도로시설팀", "confirm_count": 0, "cross_checked": false,
  "dept_note": "도로과 보수 완료",
  "history": [{"at": "...", "from_status": null, "to_status": "received", "to_status_label": "접수", "note": "제보 접수", "photo_url": null}]
}
```
- 로그인이 없으므로 `POST /api/reports` 응답의 `public_id`를 브라우저에 저장한다 (`frontend/src/lib/myReports.js`).
- **빨간 점**: `news_at`이 브라우저에 저장한 "내 제보 확인 시각"보다 늦으면 표시. `news_at`은 상태 변경, 처리 메모, 조치 후 사진, 담당 부서 메모가 생길 때 바뀐다.

## 관리자
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| GET | `/api/admin/reports` | 목록. 쿼리: `source`, `status`, `category`, `include_demo`(기본 true), `sort=priority`(기본)/`new`/`old` |
| GET | `/api/admin/ledger.xlsx` | **점검 대장 엑셀**. 목록과 같은 쿼리(`source`, `status`, `category`, `sort`) + `include_demo`(기본 false). 사진·주민 메모는 넣지 않음. 열: 접수번호, 접수일시, 출처, 유형·규칙, AI 신뢰도, 담당 부서, 위치, 위도·경도, 우선순위 점수, 처리 상태, 조치 시작 기한, 기한 초과, 완료일시, 담당자 메모, 주민 확인, 교차확인, 오탐 |
| POST | `/api/admin/reports` | CCTV 프레임 등 직접 등록. `{photo_key, source: "cctv"/"gap", lat?, lon?, ...}` |
| GET | `/api/admin/reports/{id}` | 상세 |
| PATCH | `/api/admin/reports/{id}` | 보낸 항목만 변경: `status, note, after_photo_key, dept, dept_note, dispatch, false_positive, true_category`(실제 유형, 빈 문자열이면 지움). 부서를 바꾸면 이력에 '담당 부서 변경' |
| GET | `/api/admin/report?start=YYYY-MM-DD&end=YYYY-MM-DD` | 기간별 보고서 (한국 날짜, 기본 이번 달). `summary_lines`(고정 양식 문장), `counts`, `by_dept`, `top_open`. 체험 제보 제외 |

- 관리자 응답(`AdminReportOut`) = 주민 응답 + `id, updated_at, source, source_label, dispatch, false_positive, true_category, is_demo, gap_rule, gap_reason, priority`.
- `priority` = 규칙 점수 (`backend/app/scoring.py`, 값은 docs/decisions.md):
```json
{"total": 50, "urgent": false, "due_at": "2026-10-26T14:20:56Z", "overdue": false, "needs_review": false,
 "items": [{"label": "유형 기본: 콘크리트 균열", "points": 20, "note": "AI가 고른 유형"},
           {"label": "관리목록 밖", "points": 0, "note": "데이터 대기 (해빙기 점검 326개소 목록)"},
           {"label": "어린이보호구역 인접", "points": 30, "note": "성북어린이집 137m (반경 300m)"}]}
```
- `needs_review`: AI 신뢰도가 50 미만이면 true → 화면에 "AI 불확실 · 담당자 확인 필요" 표시. 점수에는 영향 없음 (items에 0점 항목 한 줄 추가)
- 공백 탐지 항목(`source=gap`, 97건: 사용불가 45 + 좌표 이상 19 + 거리 기준 33)은 서버가 켜질 때 `backend/data/gap_items.json`에서 한 번 적재된다. 사진·AI 결과가 없고 `gap_rule`, `gap_reason`이 있다. 기한(`due_at`) 없음
- PATCH에서 상태가 바뀌거나 `note`/`after_photo_key`가 있으면 처리 이력(`history`)에 한 줄 추가.

## 아직 없는 API (docs/handoff.md 참고)
- 학습 모델 분류 (`vision.py`에 provider `model` 추가 예정)

### 조치 후 관리 (사후 관리)
- `GET /api/reports/nearby`: 각 항목에 `state`(open｜recent_done｜old_done), `done_days_ago`, `fixed`, `not_fixed` 추가. `accuracy`(폰 위치 정확도 m)를 주면 반경 = 정확도의 1.5배(30~200m).
- `GET /api/reports/map`: 속성 `recheck`(조치 완료인데 '아직 그대로'가 더 많음).
- `POST /api/reports` 본문에 `accuracy_m` 추가. 같은 곳(반경 안) 180일 이내에 완료된 제보가 있으면 재발로 연결.
- `GET /api/admin/summary`: `aftercare{reopened, recurred, recheck_due}`.
- `GET /api/admin/reports/{id}/place-history`: 같은 곳 이력(`relation`: self｜prior｜later｜nearby, 조치 전후 사진, 주민 확인 수).
- 관리자 제보 응답 `aftercare`에 `recurrence{days_after_done, admin_id}`, `recheck_due`, `recheck_at`. 엑셀 대장에 '재발', '주민 재확인' 열.
- 관리자 제보 응답에 `season`(해빙기·우기·동절기, 접수 달 기준), `photo_age_days`, `stale_photo`(대표 사진 촬영일이 접수일보다 `STALE_PHOTO_DAYS`일 넘게 앞섬). `GET /api/admin/reports`와 `ledger.xlsx`에 `season` 필터. 점수에는 반영하지 않음.
- `GET /api/admin/corrections.csv` 담당자가 고친 AI 분류(실제 유형, 오탐)를 CSV로 내려받는다(엑셀용 UTF-8). 열: 접수번호, 접수일시, AI 유형, AI 신뢰도, 담당자가 고른 실제 유형, AI 오탐, AI와 일치, 사진 키. 체험 제보·수정하지 않은 제보는 빠지고, 이름·식별값·위치·메모는 넣지 않는다. AI 분류 개선용 평가 세트·프롬프트 예시 후보.
- `GET /api/admin/corrections/summary` AI 유형 → 담당자가 고른 유형 쌍별 건수(`total`, `pairs[{ai, true, count, match}]`).
- `POST /api/reports` 본문에 `client_key?`(8~40자, 브라우저 무작위 값) 추가. 응답에는 나가지 않는다. 관리자 제보 응답에 `same_client_reports`(같은 브라우저 제보 수, 이 제보 포함), `same_client_24h`(그중 이 제보 전후 24시간 안). 식별값이 없으면 null.
- 식별번호·별명: `POST /api/reports` 본문에 `client_nickname?`(20자) 추가. 관리자 제보 응답에 `client_code`(식별값 앞 8자리, 주민이 '내 제보' 화면에서 보는 번호와 같음), `client_nickname`. 식별값 전체는 어느 응답에도 나가지 않는다.
- 사진 공개 범위: `GET /api/reports?ids=`는 선택 인자 `client_key`(내 브라우저 식별값)를 받는다. **조치 완료 전 제보의 `photo_url`·`after_photo_url`·`photos`는 `client_key`가 제보를 보낸 브라우저와 같을 때만** 채워지고, 아니면 null/빈 목록이다. 조치 완료된 제보는 누구에게나 보인다. `GET /api/reports/{번호}`, `POST .../confirm`도 같은 규칙(식별값 없이 부르므로 완료 전 사진 없음).
- `GET /api/admin/summary`에 `first_review{count, avg_hours, median_hours, within_24h_pct, waiting, oldest_waiting_hours}` 추가. 접수에서 다른 상태(검토·조치·완료)로 처음 바뀐 시점까지 걸린 시간(메모만 남긴 것은 확인으로 세지 않음). 아직 접수 상태인 제보는 `waiting`으로 센다. 체험·오탐 제외.
