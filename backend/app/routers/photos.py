from __future__ import annotations

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
    ai, provider = vision.classify(jpeg) if classify else (None, None)
    photo = Photo(key=key, width=w, height=h, ai=ai, ai_provider=provider)
    db.add(photo)
    db.commit()
    return {"key": key, "url": storage.url(key), "width": w, "height": h, "ai": ai, "ai_provider": provider}


@router.post("/api/photos/{key}/locate")
def locate_photo(key: str, db: Session = Depends(get_db)):
    """문제 위치 표시: AI가 사진에서 결함이 보이는 부분을 사각형(최대 2개)으로 추정한다. 사진마다 한 번만 부르고 결과를 사진 AI 결과에 저장한다.
    분류와 점수에는 영향이 없고 화면 표시용이다. 정확도는 검증하지 않았다. 키가 없으면 빈 목록과 mock=true."""
    photo = db.get(Photo, key)
    if photo is None:
        raise HTTPException(404, "사진 없음")
    if photo.ai and photo.ai.get("boxes") is not None:
        return {"boxes": photo.ai["boxes"], "mock": False}
    try:
        boxes, mock = vision.locate(storage.read(key))
    except storage.PhotoError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001  — 위치 표시가 안 돼도 제보는 계속되게
        raise HTTPException(502, f"AI 호출 실패: {type(e).__name__}") from e
    if not mock and photo.ai is not None:
        photo.ai = {**photo.ai, "boxes": boxes}
        db.commit()
    return {"boxes": boxes, "mock": mock}


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
