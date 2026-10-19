"""FastAPI 앱. 실행: uvicorn backend.app.main:app --reload  (저장소 루트에서)

- /api/...  : API (목록은 /docs)
- 그 밖의 주소: frontend/dist (npm run build 결과)가 있으면 React 화면을 내보낸다.
  개발 중에는 프론트를 npm run dev 로 따로 켜고, Vite가 /api 를 이 서버로 넘긴다.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from . import config
from .db import init_db
from .seed import seed_gap_items
from .routers import admin, mapdata, photos, reports, system

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="성북 안전 공백 지도 API", version="0.1.0")
init_db()
seed_gap_items()

for r in (system.router, mapdata.router, photos.router, reports.router, admin.router):
    app.include_router(r)


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    """React 빌드본 내보내기. 파일이 있으면 그 파일, 없으면 index.html (화면 이동은 React가 처리)."""
    if path.startswith("api/"):
        raise HTTPException(404, "없는 API")
    dist = config.FRONTEND_DIST
    if not (dist / "index.html").exists():
        return {"message": "프론트 빌드본 없음. 개발 중이면 frontend 에서 npm run dev, 배포용이면 npm run build"}
    f = (dist / path).resolve()
    if path and f.is_file() and dist.resolve() in f.parents:
        return FileResponse(f)
    return FileResponse(dist / "index.html")
