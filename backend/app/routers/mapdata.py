"""지도용 공공데이터. scripts/build_geojson.py 가 만든 backend/data/*.geojson 을 그대로 내보낸다."""
from __future__ import annotations

import json
from functools import lru_cache

from fastapi import APIRouter

from .. import config

router = APIRouter(tags=["map"])
EMPTY = {"type": "FeatureCollection", "features": [], "note": "아직 생성 전: python backend/scripts/build_geojson.py"}


@lru_cache(maxsize=4)
def _load(name: str) -> dict:
    p = config.PROCESSED_DIR / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else EMPTY


@router.get("/api/facilities")
def facilities() -> dict:
    """안전시설 위치 (소방용수, 무더위쉼터, AED, 어린이보호구역). properties.kind 로 구분."""
    return _load("facilities.geojson")


@router.get("/api/gaps")
def gaps() -> dict:
    """주민 지도 '점검 필요(규칙)' 레이어. AI가 아니라 규칙 결과이므로 화면에 '규칙'으로 표시."""
    return _load("gaps.geojson")


@router.get("/api/admin/integrated")
def integrated() -> dict:
    """관리자용 통합 점검 후보: 같은 주소에 서로 다른 안전시설 2종 이상 (공백이 아님)."""
    return _load("integrated.geojson")


@router.get("/api/zones")
def zones() -> dict:
    """보호구역 경계 (경찰청 API). 경계가 있으면 MultiPolygon, 없으면 Point. 주민 지도에 얇은 선으로 그린다."""
    return _load("zones.geojson")
