# 성북 안전 공백 지도

성북구 대학연합 AI 기반 지역문제 해결 해커톤 1조(안전제일조) 시연용 웹 서비스 저장소.
작업 규칙과 범위는 `CLAUDE.md`, 날짜별 계획은 `개발_일정.md`, **이어받을 일은 `docs/handoff.md`**.

## 폴더
- `poc/` 사전 검증 스크립트와 결과 (데이터 읽기, 공백 탐지 규칙, 사진 분류 호출 시험)
- `data/` 데이터 설명(`README.md`)과 규칙 결과(`gap_candidates.csv`). 공공데이터 원본(`data/raw/`, AI-Hub 파일 제외)
- `backend/` FastAPI 서버 (`app/`), 테스트(`tests/`), 지도 데이터 생성 스크립트(`scripts/`)
- `frontend/` React + Vite + Tailwind 화면 (주민 모바일, 관리자 `/admin`)
- `docs/` 규격 문서: `api.md`(API), `db.md`(DB 표), `handoff.md`(인계 현황·다음 할 일)

## 데이터
- `data/raw/`의 공공데이터 CSV 4개는 저장소에 들어 있음 (소방용수, 무더위쉼터, 어린이보호구역, AED). 출처와 이용조건은 `data/README.md`
- AED의 담당자 이름·전화번호 열은 저장하지 않음 (`poc/fetch_aed.py`가 지우고 저장)
- AED를 새로 받으려면 공공데이터포털 인증키가 필요. 프로젝트 루트에 `.env`를 만들고 `DATA_GO_KR_AED_KEY=발급받은키` 한 줄을 넣음. `.env`는 올리지 않음
- **AI-Hub 데이터(`data/raw/aihub/`)는 저장소에 없음.** 파일이 1GB가 넘어 GitHub 한도(파일당 100MB)를 넘고, 약관상 승인받지 않은 사람에게 파일을 줄 수 없음. 쓰는 사람이 각자 신청
  - aihub.or.kr에서 "건물 균열 탐지 이미지 (고도화)- SOC 시설물 균열패턴 이미지 데이터" 검색 → 다운로드 버튼으로 활용 신청 (신청 목적: 인공지능 경진대회 참가)
  - 승인 후 파일 목록 탭에서 옹벽 파일 `VS_지상시설물_옹벽.zip`(1.14GB)과 `VL_지상시설물_옹벽.zip`(1.82MB)을 받음. 샘플(경량) 데이터 버튼은 617MB
  - 내려받은 파일은 `data/raw/aihub/`에 두면 됨 (`.gitignore`에 들어 있음)

## 실행 (본 개발)
키·계정 없이 바로 돌아간다 (로컬 SQLite + 로컬 사진 폴더 + Mock AI). 키를 넣으려면 `.env.example`을 `.env`로 복사.
필요: Python 3.10 이상, Node 20.19 또는 22.12 이상.
```
# 백엔드 (저장소 루트에서)
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload         # http://localhost:8000/docs 에서 API 확인

# 프론트 (다른 터미널)
cd frontend
npm install
npm run dev                                   # http://localhost:5173 , /api 는 8000으로 넘어감

# 테스트
python -m pytest backend/tests -q

# 공공데이터 → 지도 파일 다시 만들기 (규칙을 고쳤을 때만, poc/requirements.txt 필요)
python backend/scripts/build_geojson.py
```
- 같은 와이파이의 폰에서 `http://<노트북 IP>:5173` 으로 열 수 있음. 위치 권한은 https(배포 주소)에서만 동작
- `cd frontend && npm run build` 후 백엔드만 켜도 `http://localhost:8000` 에서 화면까지 열림

## Git 작업 방식
- `main` = 배포되는 버전, 항상 돌아가는 상태. 직접 커밋하지 않고 브랜치 → PR → squash merge
- 브랜치 하나에 기능 하나, 1~2일 안에 합치기: `feat/…`, `fix/…`, `data/…`, `docs/…`
- 폴더 담당: `frontend/` 규민, `backend/`·`data/`·`poc/` 준호·재영. 공용 파일(`CLAUDE.md`, `docs/api.md`, `requirements.txt`, `package.json`)을 바꾸면 단톡에 한 줄
- PR 올릴 때 `docs/handoff.md` 해당 줄 갱신 (PR 템플릿에 체크 항목 있음)
- 11/6 저녁 `v1.0-final` 태그 후에는 치명적 오류 수정만 합침

## 실행 (poc)
```
pip install -r poc/requirements.txt
python poc/gap_rules.py      # 공백 규칙 실행, data/gap_candidates.csv와 poc/gap_map.html 생성
poc/지도_열기.bat             # 지도를 로컬 서버로 열기 (파일을 더블클릭하면 지도 배경이 안 뜸)
```
Windows에서 한글이 깨지면 `PYTHONIOENCODING=utf-8`.

## 지키기
- 키, 개인정보(AED 담당자 이름·전화), AI-Hub 원본 파일은 올리지 않는다.
- 데이터 수치는 출처와 확인 여부를 함께 적는다. 확인 전 숫자는 발표에 확정 수치로 쓰지 않는다.
