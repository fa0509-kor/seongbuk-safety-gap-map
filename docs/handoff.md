# 인계 현황

기능을 이어받을 때 이 파일부터 본다. PR을 올릴 때마다 해당 줄을 갱신한다.
상태: ✅ 동작 확인 / 🟡 동작하지만 화면은 임시 / ⬜ 미착수 / ⛔ 결정·데이터 대기

마지막 갱신: 2026-10-25 (보호구역 경계를 점수와 주민 지도에 반영, AI 학습 조각 생성).

## 1. 지금 되는 것

| 기능 | 상태 | 파일 | 확인 방법 |
| --- | --- | --- | --- |
| 백엔드 실행, 키 없이 로컬 동작 (SQLite·로컬 사진·Mock AI) | ✅ | `backend/app/` | `uvicorn backend.app.main:app --reload` → `/api/health` |
| 사진 업로드 → 줄이기·EXIF 제거 → AI 분류 | ✅ | `routers/photos.py`, `storage.py`, `vision.py` | `/docs`에서 `POST /api/photos` |
| AI 분류 공급자 전환 (OpenAI / Anthropic / Mock, 실패 시 Mock) | 🟡 | `vision.py`, 프롬프트 `prompts/vision_v1.txt` | 실제 키로는 아직 미확인 |
| 주민 제보 저장, 내 제보 조회, 빨간 점 | ✅ | `routers/reports.py`, `frontend/src/lib/myReports.js` | 아래 시연 흐름 |
| 관리자 목록·상세·상태 변경·메모·조치 후 사진·오탐·출동 | ✅ | `routers/admin.py` | 아래 시연 흐름 |
| CCTV 프레임 업로드 (주민 사진과 같은 분류) | ✅ | `AdminList.jsx` | 관리자 목록 오른쪽 위 버튼 |
| 주민 지도 '점검 필요(규칙)' 레이어 (사용불가 45 + 거리 기준 초과 의심 33) | ✅ | `backend/scripts/build_geojson.py`, `backend/data/gaps.geojson` | `/map` |
| 통합 점검 후보 234곳 지도·목록·필터 | ✅ | `pages/admin/AdminIntegrated.jsx`, `GET /api/admin/integrated` | `/admin/integrated` |
| 화면 7개 + 하단바 | 🟡 | `frontend/src/pages/` | 데이터 흐름은 동작. **모양은 와이어프레임 기준으로 다시 그려야 함** |
| 우선순위 점수 v1, 목록 우선순위 정렬(기본), 상세 '규칙이 매긴 점수' 항목별 표시, 조치 기한·기한 초과 | ✅ | `backend/app/scoring.py`, `components/PriorityCard.jsx` | 관리자 상세 가운데 칸 |
| 공백 항목 97건 관리자 목록 적재 (사용불가 45 + 좌표 누락·이상 19 + 거리 기준 33) | ✅ | `backend/app/seed.py`, `backend/data/gap_items.json` | 목록 출처 '공백 탐지' |
| 대시보드 집계(오늘 신규·기한 초과·이번 달 완료·평균 처리 기간), 첫 화면 이번 주 건수 | ✅ | `GET /api/admin/summary`, `GET /api/stats` | `/admin`, `/` |
| 부서 자동 배정 (제보 때 시설 종류 선택 → 부서), 관리자 재배정·이력 | ✅ | `backend/app/departments.py`, 부서 표 `docs/departments.md` | 제보 3단계 시설 종류 → 관리자 상세 '담당 부서' |
| 기간별 보고서 (고정 양식 + DB 집계, 인쇄·PDF) | ✅ | `routers/report.py`, `pages/admin/AdminReport.jsx` | `/admin/report` |
| 어린이보호구역 실제 경계: 점수 '경계 안이면 +30'(경계 없는 22곳은 반경 300m), 주민 지도에 경계선 | ✅ | `backend/app/scoring.py`(`zone_hit`), `backend/scripts/build_zones.py`, `GET /api/zones`, `MapPage.jsx` | `/map` 에서 얇은 경계선 확인, `python -m pytest backend/tests -q` |
| 나도 봤어요(+1) → 우선순위 점수 반영 | ✅ | `POST /api/reports/{id}/confirm`, `MapPage.jsx` | 주민 지도에서 남의 제보 누르기 |
| 제보 위치 핀 조정 (끌기·지도 누르기) | ✅ | `components/PinPicker.jsx` | `/report` 2단계. 위치 자동은 https에서만 |
| 백엔드 테스트 18개 (시연 흐름·점수·적재·집계·부서·보고서·+1) | ✅ | `backend/tests/` | `python -m pytest backend/tests -q` |

**시연 흐름 (60초)** — 2026-10-19 로컬에서 끝까지 확인
1. 폰 `/report` → 사진 → AI 결과 → 제보 보내기 → `/my`로 이동
2. PC `/admin/reports` → 새 제보 → 상세에서 상태 `완료` + 메모
3. 폰 하단바 "내 제보"에 빨간 점 (15초 안에) → 열면 완료 표시, 점 꺼짐

## 2. 다음에 할 일

| 순서 | 할 일 | 파트 | 메모 |
| --- | --- | --- | --- |
| 1 | 화면을 와이어프레임대로 다시 그리기 | 개발 | `pages/*.jsx`의 데이터 함수(api.js 호출)는 그대로 두고 JSX·스타일만 교체. 색은 `src/index.css`의 `@theme` |
| 2 | 체험용 사진 넣기 | 개발 | `frontend/public/demo/sample.jpg`. **직접 찍은 사진만** (AI-Hub 사진은 약관상 공개 레포에 넣으면 안 됨) |
| 3 | 실제 AI 키로 분류 확인 | 개발 | `.env`에 `OPENAI_API_KEY` → `/api/health`의 `vision_provider`가 openai인지 |
| 4 | 학습 모델 연결 | 개발 | `vision.py`의 `PROVIDERS`에 `model` 추가. ONNX로 내보내면 Vercel 함수 용량(파이썬 500MB) 안에 들어감 |
| 5 | AI 학습 데이터 만들기 (조각 자르기·분할) | 개발 | decisions.md 'AI 학습 방향'. 학습은 본인 PC에서 (국외 반출 금지) |
| 6 | 배포 (Vercel + Supabase) | PM | **마지막 단계** (구현·데이터 처리 후). 아래 4번 체크리스트. 레포 공개 완료 |

## 3. 결정이 필요한 것
10/19 결정 완료 → `docs/decisions.md` (규칙2 이름, 지도 범례, 제보 문구, 우선순위 v1, AI 학습 방향).
남은 것:
- [ ] 디자인 담당에게 범례·필터 이름 변경 전달 ("점검 공백/점검 기록 없음" → "점검 필요")
- [ ] 노션 기획안 v1에 위 결정 반영 (PM)
- [ ] (선택) 소방재난본부 문의 — 10/20 있는 데이터로 '기록 불일치' 근거를 찾아 필수 아님 (decisions.md 10/20)

## 4. 배포 체크리스트 (자세한 순서는 `docs/deploy.md`)
- [x] 레포 공개 전환 (10/19 완료). 공개 전 확인: `.env`·키·AED 담당자 정보·AI-Hub 파일이 커밋 기록에 없음
- [x] Supabase 프로젝트·버킷 생성 (10/20, PM)
- [x] Vercel 프로젝트·환경변수 6개·함수 지역 서울(icn1), 미리보기 배포에서 DB 연결 확인 (10/20, PM). CLI로 배포 (`docs/deploy.md`)
- [x] Vercel 설정 파일 `vercel.json` (Services: web=frontend, api=backend), 가공 데이터 `backend/data/`로 이동 (10/20)
- [ ] Supabase Storage 업로드·서명 주소 실제 확인 (`docs/deploy.md` 2·4번)
- [ ] 폰 데이터로 QR 접속, 위치 권한, 사진 올리기
- [ ] Supabase 무료는 1주 미사용 시 일시정지 → 발표 전날 접속 확인

## 5. 알려진 한계
- 로그인 없음: 관리자 화면은 주소만 알면 누구나 열 수 있음 (시연용 범위)
- 내 제보는 브라우저 저장소 기준이라 다른 폰·사생활 보호 모드에서는 안 보임
- DB 마이그레이션 도구 없음 (`docs/db.md`)
- 지도 배경(OSM 표준 타일)은 인터넷이 필요하고, OSM 서버 사정에 따라 느릴 수 있음 (보장 없음). 발표 전 브이월드 등으로 바꿀지 검토
