"""사진 저장소. STORAGE=local(기본)이면 backend/var/uploads/, supabase면 Supabase Storage.

쓰는 쪽은 save()와 url()만 알면 된다. 사진은 저장 전에 긴 변을 줄이고 EXIF(촬영 위치 등)를 지운다.
"""
from __future__ import annotations

import io
import uuid

import httpx
from PIL import Image, ImageOps

from . import config


class PhotoError(ValueError):
    pass


def normalize(data: bytes) -> tuple[bytes, int, int]:
    """이미지인지 확인 → 회전 보정 → 긴 변 축소 → EXIF 없이 JPEG로 다시 저장."""
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise PhotoError(f"사진이 {config.MAX_UPLOAD_MB:g}MB보다 큼")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
    except Exception as e:  # noqa: BLE001
        raise PhotoError("이미지 파일이 아님") from e
    img = img.convert("RGB")
    img.thumbnail((config.PHOTO_MAX_SIDE, config.PHOTO_MAX_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue(), img.width, img.height


def new_key() -> str:
    return f"{uuid.uuid4().hex}.jpg"


def save(key: str, data: bytes) -> None:
    if config.STORAGE == "supabase":
        _supabase_put(key, data)
    else:
        config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (config.UPLOAD_DIR / key).write_bytes(data)


def url(key: str) -> str:
    """브라우저가 사진을 여는 주소. 로컬은 백엔드가 직접 내보내고, supabase는 1시간짜리 서명 주소."""
    if config.STORAGE == "supabase":
        return _supabase_signed_url(key)
    return f"/api/photos/{key}"


def local_path(key: str):
    p = (config.UPLOAD_DIR / key).resolve()
    if config.UPLOAD_DIR.resolve() not in p.parents:  # ../ 같은 경로 차단
        raise PhotoError("잘못된 사진 키")
    return p


# --- Supabase Storage (REST). 계정 연결 후 확인 필요: docs/handoff.md 참고 ---

def _headers() -> dict:
    if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_KEY):
        raise RuntimeError("STORAGE=supabase 인데 SUPABASE_URL / SUPABASE_SERVICE_KEY 가 없음")
    return {"Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}", "apikey": config.SUPABASE_SERVICE_KEY}


def _supabase_put(key: str, data: bytes) -> None:
    r = httpx.post(f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{key}",
                   headers={**_headers(), "Content-Type": "image/jpeg"}, content=data, timeout=30)
    r.raise_for_status()


def _supabase_signed_url(key: str) -> str:
    r = httpx.post(f"{config.SUPABASE_URL}/storage/v1/object/sign/{config.SUPABASE_BUCKET}/{key}",
                   headers=_headers(), json={"expiresIn": 3600}, timeout=15)
    r.raise_for_status()
    signed = r.json().get("signedURL") or r.json().get("signedUrl")
    return f"{config.SUPABASE_URL}/storage/v1{signed}"
