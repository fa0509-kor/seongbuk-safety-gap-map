"""설정값. 모두 환경변수로 바꿀 수 있고, 없으면 로컬에서 바로 돌아가는 값으로 동작한다.

| 환경변수 | 없을 때 | 있을 때 |
| --- | --- | --- |
| DATABASE_URL | backend/var/app.db (SQLite) | 그 DB에 연결 (Supabase Postgres 등) |
| STORAGE | local: backend/var/uploads/ | supabase: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_BUCKET 필요 |
| VISION_PROVIDER | 키가 있으면 openai → anthropic 순, 없으면 mock | mock / openai / anthropic 고정 |

프로젝트 루트의 .env 파일도 읽는다 (이미 설정된 환경변수가 우선). .env는 git에 올리지 않는다.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # 저장소 루트
BACKEND_DIR = ROOT / "backend"
# 로컬 DB·사진 (git 제외). Vercel은 /tmp 밖에 쓸 수 없으므로 거기서는 /tmp 사용 (DATABASE_URL이 없을 때의 임시 대비)
VAR_DIR = Path(os.getenv("VAR_DIR") or ("/tmp/sbgap" if os.getenv("VERCEL") else BACKEND_DIR / "var"))
PROCESSED_DIR = BACKEND_DIR / "data"                 # 지도용 GeoJSON·공백 항목 (backend/scripts/build_geojson.py가 만듦)
# 배포(Vercel)는 backend/ 폴더만 서버로 올리므로 서버가 읽는 파일은 모두 backend/ 안에 둔다
FRONTEND_DIST = ROOT / "frontend" / "dist"           # npm run build 결과


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{(VAR_DIR / 'app.db').as_posix()}"

STORAGE = os.getenv("STORAGE", "local").lower()
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", VAR_DIR / "uploads"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "reports")


def vision_provider() -> str:
    forced = os.getenv("VISION_PROVIDER", "").lower()
    if forced in ("mock", "openai", "anthropic"):
        return forced
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    return "mock"


OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini")
ANTHROPIC_VISION_MODEL = os.getenv("ANTHROPIC_VISION_MODEL", "claude-sonnet-5-5")

# 사진 제한. Vercel 함수는 요청 본문이 4.5MB까지라 그보다 작게 둔다.
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "4"))
PHOTO_MAX_SIDE = int(os.getenv("PHOTO_MAX_SIDE", "1600"))  # 저장 전 긴 변을 이 크기로 줄임
