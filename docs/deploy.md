# 배포 (Vercel + Supabase, 무료)

구조: 한 Vercel 프로젝트 안에 서비스 2개 (`vercel.json`)
- `web`: `frontend/` (Vite 빌드, 모든 주소 → index.html)
- `api`: `backend/` (FastAPI `app.main:app`), `/api/...` 요청만
- DB·사진: Supabase (Postgres Transaction pooler + Storage 비공개 버킷 `reports`)
- 서버가 읽는 가공 데이터는 `backend/data/` (배포 때 `backend/`만 서버로 올라가므로)

Vercel Services는 베타 기능 (공식 문서 "Services (Beta) are available on all plans").

## 1. Supabase (한 번만)
1. 새 프로젝트: 조직 Free, 이름 `seongbuk-safety`, 비밀번호 Generate(특수문자 없는 것), **지역 Northeast Asia (Seoul)**, **Data API 끔**, GitHub 연결 안 함
2. Storage → New bucket `reports`: Public 끔, 파일 크기 5MB 제한, MIME `image/jpeg`
3. 값 3개 (채팅·문서에 붙이지 않음)
   - Project URL: Project Settings → General → Project ID → `https://(ID).supabase.co`
   - Secret key: Project Settings → API Keys → Secret keys (`sb_secret_…`) — publishable/anon 아님
   - DB 주소: Connect → Connection String → URI · **Transaction pooler**(포트 6543), `[YOUR-PASSWORD]` 교체

## 2. (선택) 내 PC에서 Supabase 먼저 붙여보기
`.env`에 아래를 넣고 백엔드를 켠다 → `http://localhost:8000/api/health`가 `"db":"postgres","storage":"supabase"`
```
DATABASE_URL=postgresql://postgres.(ID):(비밀번호)@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
STORAGE=supabase
SUPABASE_URL=https://(ID).supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
SUPABASE_BUCKET=reports
```
`/docs`에서 `POST /api/photos`로 사진 하나 올려 Supabase Storage에 생기는지 확인. 확인 후 로컬 개발로 돌아가려면 위 줄 앞에 `#`.

## 3. Vercel
레포 주인이 다른 GitHub 계정이라 Git 자동 연결 대신 **CLI로 배포**한다 (레포 주인 도움 불필요).
1. vercel.com → Sign Up → Hobby → Continue with GitHub
2. 레포 폴더에서 (설치 없이 npx 사용)
   ```bash
   npx vercel@latest login
   npx vercel@latest link     # Set up? Y → 개인 계정 → 기존 프로젝트 연결? N → 이름 seongbuk-safety → 폴더 ./
   ```
3. Vercel 웹 → 프로젝트 → Settings
   - **Build and Deployment → Framework Preset: Services** (자동으로 안 잡혔으면)
   - **Environment Variables**: 아래 값을 Production·Preview 모두에
     `DATABASE_URL`, `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET=reports`, `ANTHROPIC_API_KEY`, `VISION_PROVIDER=anthropic` (없으면 Mock)
   - **Functions → Function Region: Seoul (icn1)** (Supabase와 같은 지역)
4. 미리보기 배포 → 확인 → 정식 배포
   ```bash
   npx vercel@latest          # 미리보기 주소가 나옴
   npx vercel@latest --prod   # main 최신 상태에서 정식 배포
   ```

## 4. 확인
- `(주소)/api/health` → `"db":"postgres"`, `"storage":"supabase"`, `vision_provider`
- 폰 **모바일 데이터**로 주소 열기 → 위치 권한 팝업 → 제보 → Supabase Storage `reports`에 사진, Table Editor `reports`에 행
- 관리자 `/admin` → 공백 항목 97건이 목록에 있는지 (첫 실행 때 자동 적재)
- 주소로 QR 만들기

## 5. 다시 배포할 때
main에 머지된 뒤: `git switch main && git pull && npx vercel@latest --prod`
11/6 동결 후에는 치명적 오류 수정만 배포.

## 문제가 생기면
- **먼저 `(주소)/api/health`를 본다.** `db_ok`, `db_error`(원인 첫 줄), `db_url_check`(DB 주소 모양: `at_count`는 1, `port`는 6543), `data_files`(서버에 올라간 데이터 파일)를 보여준다. 키·비밀번호는 나오지 않음
- `failed to resolve host '@aws-…'` → DB 주소에 `@`가 2개. 비밀번호에 `@`가 있거나 예전 주소를 넣은 것. 비밀번호는 영문·숫자로만 재설정
- Vercel에 DB 주소를 넣을 때는 손으로 복사하지 말고 `.env`에서 바로 복사: `grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\n' | pbcopy` → `npx vercel@latest env add DATABASE_URL production`에서 붙여넣기
- 환경변수를 바꾸면 다시 배포해야 반영됨
- 빌드 실패: Vercel 프로젝트 → Deployments → 실패한 배포 → Build Logs (키가 찍혀 있지 않은지 확인 후 공유)
- `/api/health`가 500: Functions 로그. DB 주소의 비밀번호·포트(6543) 확인
- 사진 업로드 실패: 버킷 이름 `reports`, Secret key가 publishable이 아닌지
- Supabase 무료는 1주 안 쓰면 일시정지 → 대시보드에서 Restore. 발표 전날 접속 확인

## 코드 쪽 배포 대응 (참고)
- `backend/app/db.py`: Postgres는 NullPool + `prepare_threshold=None` (Supabase transaction pooler 권장)
- `backend/app/storage.py`: `sb_secret_` 키는 `apikey` 헤더만 (새 키는 JWT가 아님)
- `backend/app/config.py`: Vercel에서 DB 주소가 없으면 `/tmp` 사용
- 서버가 동시에 여러 개 켜져도 표 생성·공백 항목 적재가 겹치지 않게 처리 (`db.init_db`, `seed.py`)
- 2026-10-20: 로컬 Postgres 16에서 백엔드 테스트 전체 통과. Vercel 미리보기 배포에서 Supabase 연결(`db_ok: true`) 확인
- 서버가 시작할 때 DB 준비에 실패해도 꺼지지 않고, `/api/health`가 원인을 보여주며 다시 시도함 (`db.prepare`)
- 서버 경로는 `backend/` 폴더 기준 (배포에는 backend/만 올라감)
