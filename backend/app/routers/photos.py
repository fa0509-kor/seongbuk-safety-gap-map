from __future__ import annotations

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import config, storage, vision
from ..db import get_db
from ..models import Photo
from ..schemas import PhotoOut

router = APIRouter(tags=["photos"])


@router.post("/api/photos", response_model=PhotoOut)
async def upload_photo(file: UploadFile = File(...), classify: bool = True, db: Session = Depends(get_db)):
    """사진 1장 저장 + AI 분류. 제보 2단계(사진)에서 부르고, 응답의 key로 POST /api/reports 를 보낸다.
    조치 후 사진처럼 분류가 필요 없으면 ?classify=false."""
    raw = await file.read()
    try:
        jpeg, w, h = storage.normalize(raw)
    except storage.PhotoError as e:
        raise HTTPException(400, str(e)) from e
    key = storage.new_key()
    storage.save(key, jpeg)
    # AI 호출은 몇 초 걸리는 동기 함수라, 그대로 부르면 서버가 그동안 다른 요청을 못 받는다(사진 여러 장이 줄을 선다). 스레드에서 돌린다.
    ai, provider = await run_in_threadpool(vision.classify, jpeg) if classify else (None, None)
    photo = Photo(key=key, width=w, height=h, ai=ai, ai_provider=provider)
    db.add(photo)
    db.commit()
    return {"key": key, "url": storage.url(key), "width": w, "height": h, "ai": ai, "ai_provider": provider}


@router.get("/api/photos/{key}")
def get_photo(key: str):
    if config.STORAGE == "supabase":
        return RedirectResponse(storage.url(key))
    try:
        p = storage.local_path(key)
    except storage.PhotoError as e:
        raise HTTPException(400, str(e)) from e
    if not p.exists():
        raise HTTPException(404, "사진 없음")
    return FileResponse(p, media_type="image/jpeg")
