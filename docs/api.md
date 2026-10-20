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
| GET | `/api/health` | `{ok, db: sqlite/postgres, storage: local/supabase, vision_provider: mock/openai/anthropic}` |
| GET | `/api/meta` | 위 고정값 + `facility_types`(시설 종류 코드→이름), `departments`(재배정용 부서 목록) |

## 지도
| 메서드 | 주소 | 응답 |
| --- | --- | --- |
| GET | `/api/facilities` | GeoJSON. `properties: {kind: 소방용수/무더위쉼터/AED/어린이보호구역, name, address}` |
| GET | `/api/gaps` | 주민 지도 '점검 필요(규칙)': 소방용수 사용불가 + 거리 기준 초과 의심. GeoJSON `properties: {rule, reason, address, kinds[]}`. **AI가 아니라 규칙 결과** → 화면에 "규칙"으로 표시 |
| GET | `/api/admin/integrated` | 관리자용 통합 점검 후보(같은 주소에 안전시설 2종 이상). 형식은 위와 같음. 공백이 아님 |
| GET | `/api/reports/map?include_demo=false` | **주민 제보만**. GeoJSON `properties: {public_id, source, status, status_label, category, facility_label, confirm_count, created_at}`. 오탐 제외 |

`/api/facilities`, `/api/gaps`, `/api/admin/integrated` 는 `backend/data/*.geojson` 을 그대로 내보낸다 (`python backend/scripts/build_geojson.py` 로 생성).

## 집계
| 메서드 | 주소 | 설명 |
| --- | --- | --- |
| GET | `/api/stats` | 주민 첫 화면 `{week_reports, week_done}`. 이번 주(월요일 0시, 한국 시간)·주민 제보만·체험/오탐 제외 |
| GET | `/api/admin/summary` | 대시보드 `{today_new, overdue_open, done_this_month, avg_days_to_done, open_by_status, screening}`. 공백 후보는 '오늘 신규'·기한에서 제외. `screening` = 데이터 사전 점검 `{facilities_total, facilities, targets, targets_done, ratio_pct, by_rule}` (`docs/benchmark.md`) |

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
| POST | `/api/reports` | 제보 보내기. 본문 `{photo_key, lat?, lon?, address?, memo?(200자), is_demo?, facility_type?}`. 시설 종류로 담당 부서 1차 배정 (`docs/departments.md`) |
| POST | `/api/reports/{public_id}/confirm` | 나도 봤어요(+1). `confirm_count` +1 → 우선순위 1명당 +5(최대 +20). 중복 방지는 브라우저에서만 |
| GET | `/api/reports?ids=a,b,c` | 내 제보 목록 (최대 50개). `ids`는 브라우저에 저장한 `public_id` |
| GET | `/api/reports/{public_id}` | 제보 1건 |

제보 응답 (`ReportOut`):
```json
{
  "public_id": "670fef51dae4",
  "created_at": "...", "status": "done", "status_label": "완료",
  "news_at": "...",
  "lat": 37.589, "lon": 127.016, "address": null, "memo": "옹벽에 금",
  "photo_url": "/api/photos/....jpg", "after_photo_url": "/api/photos/....jpg",
  "ai": { ... 위와 같음 ... },
  "facility_type": "stairs", "facility_label": "계단", "dept": "도로과 도로시설팀", "confirm_count": 0,
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
| POST | `/api/admin/reports` | CCTV 프레임 등 직접 등록. `{photo_key, source: "cctv"/"gap", lat?, lon?, ...}` |
| GET | `/api/admin/reports/{id}` | 상세 |
| PATCH | `/api/admin/reports/{id}` | 보낸 항목만 변경: `status, note, after_photo_key, dept, dept_note, dispatch, false_positive`. 부서를 바꾸면 이력에 '담당 부서 변경' |
| GET | `/api/admin/report?start=YYYY-MM-DD&end=YYYY-MM-DD` | 기간별 보고서 (한국 날짜, 기본 이번 달). `summary_lines`(고정 양식 문장), `counts`, `by_dept`, `top_open`. 체험 제보 제외 |

- 관리자 응답(`AdminReportOut`) = 주민 응답 + `id, updated_at, source, source_label, dispatch, false_positive, is_demo, gap_rule, gap_reason, priority`.
- `priority` = 규칙 점수 (`backend/app/scoring.py`, 값은 docs/decisions.md):
```json
{"total": 50, "urgent": false, "due_at": "2026-10-26T14:20:56Z", "overdue": false,
 "items": [{"label": "유형 기본: 콘크리트 균열", "points": 20, "note": "AI가 고른 유형"},
           {"label": "관리목록 밖", "points": 0, "note": "데이터 대기 (해빙기 점검 326개소 목록)"},
           {"label": "어린이보호구역 인접", "points": 30, "note": "성북어린이집 137m (반경 300m)"}]}
```
- 공백 탐지 항목(`source=gap`, 97건: 사용불가 45 + 좌표 이상 19 + 거리 기준 33)은 서버가 켜질 때 `backend/data/gap_items.json`에서 한 번 적재된다. 사진·AI 결과가 없고 `gap_rule`, `gap_reason`이 있다. 기한(`due_at`) 없음
- PATCH에서 상태가 바뀌거나 `note`/`after_photo_key`가 있으면 처리 이력(`history`)에 한 줄 추가.

## 아직 없는 API (docs/handoff.md 참고)
- 학습 모델 분류 (`vision.py`에 provider `model` 추가 예정)
