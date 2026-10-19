# 성북 안전 공백 지도

성북구 대학연합 AI 기반 지역문제 해결 해커톤 1조(안전제일조) 시연용 웹 서비스 저장소.
작업 규칙과 범위는 `CLAUDE.md`, 날짜별 계획은 `개발_일정.md`.

## 폴더
- `poc/` 사전 검증 스크립트와 결과 (데이터 읽기, 공백 탐지 규칙, 사진 분류 호출 시험)
- `data/` 데이터 설명(`README.md`)과 규칙 결과(`gap_candidates.csv`). 원본(`data/raw/`)은 올리지 않음
- `backend/`, `frontend/` 본 개발 폴더 (아직 비어 있음)

## 원본 데이터는 직접 받기
`data/raw/`는 저장소에 없음. 출처와 받는 법은 `data/README.md`.
- AI-Hub 데이터는 약관상 파일을 다른 사람에게 줄 수 없음. 쓰는 사람이 각자 신청
- AED는 공공데이터포털 인증키가 필요. 프로젝트 루트에 `.env`를 만들고 `DATA_GO_KR_AED_KEY=발급받은키` 한 줄을 넣음. `.env`는 올리지 않음

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
