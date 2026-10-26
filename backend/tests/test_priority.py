"""우선순위 점수 v1, 공백 항목 적재, 집계 API."""
import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app import config, scoring
from backend.app.db import SessionLocal
from backend.app.main import app
from backend.app.models import Report
from backend.app.seed import seed_gap_items

from .test_api import upload

client = TestClient(app)
FAR = (37.0, 127.5)  # 성북구 밖, 어떤 보호구역과도 멂


def make(lat, lon, **extra):
    p = upload()
    return client.post("/api/reports", json={"photo_key": p["key"], "lat": lat, "lon": lon, **extra}).json()


def admin_item(public_id):
    return next(x for x in client.get("/api/admin/reports").json() if x["public_id"] == public_id)


def test_gap_items_seeded_once():
    gaps = client.get("/api/admin/reports", params={"source": "gap"}).json()
    items = json.loads((config.PROCESSED_DIR / "gap_items.json").read_text(encoding="utf-8"))
    assert len(gaps) == len(items)
    assert {g["gap_rule"] for g in gaps} == {"소방용수 사용불가 표시", "소방용수 좌표 누락·이상", "소방용수 거리 기준 초과 의심"}
    far = [g for g in gaps if g["gap_rule"] == "소방용수 거리 기준 초과 의심"]
    assert all(g["priority"]["total"] in (15, 25) for g in far)
    assert seed_gap_items() == 0  # 다시 불러도 중복 없음
    unusable = next(g for g in gaps if g["gap_rule"] == "소방용수 사용불가 표시")
    assert unusable["priority"]["total"] == scoring.GAP_POINTS["hydrant_unusable"]  # 보호구역 가산 없음
    assert unusable["priority"]["due_at"] is None  # 공백 후보는 기한 없음


def test_school_zone_bonus_and_breakdown():
    lat, lon, _ = scoring.school_zones()[0]
    near = admin_item(make(lat + 0.0005, lon)["public_id"])  # 약 55m
    far = admin_item(make(*FAR)["public_id"])
    base = scoring.TYPE_POINTS["콘크리트 균열"]  # Mock 분류 결과
    assert far["priority"]["total"] == base
    assert near["priority"]["total"] == base + scoring.SCHOOL_ZONE_POINTS
    labels = [i["label"] for i in near["priority"]["items"]]
    assert "어린이보호구역 인접" in labels and "관리목록 밖" in labels


def test_resident_report_outranks_gap_candidates():
    """시연: 새 주민 제보(균열 20점)가 공백 후보(최대 25점) 아래로 묻히지 않아야 함 — 보호구역 근처면 50점"""
    lat, lon, _ = scoring.school_zones()[0]
    pid = make(lat, lon)["public_id"]
    top = client.get("/api/admin/reports", params={"status": "received"}).json()[0]
    assert top["public_id"] == pid or top["priority"]["total"] >= 50


def test_priority_sort_and_false_positive():
    rows = client.get("/api/admin/reports").json()
    totals = [r["priority"]["total"] for r in rows]
    assert totals == sorted(totals, reverse=True)
    item = admin_item(make(*FAR)["public_id"])
    d = client.patch(f"/api/admin/reports/{item['id']}", json={"false_positive": True}).json()
    assert d["priority"]["total"] == 0 and d["priority"]["overdue"] is False


def test_overdue_and_summary():
    item = admin_item(make(*FAR)["public_id"])
    with SessionLocal() as db:  # 접수 10일 전으로 돌려 기한(7일) 초과 만들기
        r = db.get(Report, item["id"])
        r.created_at = datetime.now(timezone.utc) - timedelta(days=10)
        db.commit()
    assert admin_item(item["public_id"])["priority"]["overdue"] is True

    done = admin_item(make(*FAR)["public_id"])
    client.patch(f"/api/admin/reports/{done['id']}", json={"status": "done"})
    s = client.get("/api/admin/summary").json()
    assert s["overdue_open"] >= 1 and s["done_this_month"] >= 1 and s["avg_days_to_done"] is not None
    assert s["today_new"] >= 1 and s["open_by_status"]["received"] >= 64  # 공백 항목 포함

    st = client.get("/api/stats").json()
    assert st["week_reports"] >= 1 and st["week_done"] >= 1


# --- 보호구역 경계 판단 (경계가 있는 곳은 경계 안, 없는 곳만 반경 300m) ---
SQUARE = [[127.000, 37.600], [127.001, 37.600], [127.001, 37.601], [127.000, 37.601], [127.000, 37.600]]  # 약 88m x 111m
HOLE = [[127.0004, 37.6004], [127.0006, 37.6004], [127.0006, 37.6006], [127.0004, 37.6006], [127.0004, 37.6004]]
NO_BOUNDARY_POINT = (37.700, 127.100)


def fake_zones(monkeypatch):
    monkeypatch.setattr(scoring, "zone_shapes", lambda: [
        {"name": "경계있는곳", "polys": [[SQUARE, HOLE]], "point": (37.6000, 127.0000)},
        {"name": "경계없는곳", "polys": [], "point": NO_BOUNDARY_POINT},
    ])


def test_zone_hit_boundary_vs_radius(monkeypatch):
    fake_zones(monkeypatch)
    inside = scoring.zone_hit(37.6008, 127.0008)
    assert inside["name"] == "경계있는곳" and inside["how"] == "boundary"
    hole = scoring.zone_hit(37.6005, 127.0005)                  # 구멍 가운데: 경계 밖이지만 구멍 가장자리에서 30m 안
    assert hole["how"] == "near" and hole["dist"] < scoring.ZONE_BUFFER_M
    # 경계 있는 곳은 시설 위치에서 300m 안이어도 경계 밖이면 해당 없음 (예전 방식과 다른 점)
    assert scoring.zone_hit(37.6000, 127.0030) is None          # 시설 위치에서 약 265m, 경계 밖
    near = scoring.zone_hit(NO_BOUNDARY_POINT[0] + 0.002, NO_BOUNDARY_POINT[1])  # 약 220m
    assert near["name"] == "경계없는곳" and near["how"] == "radius"
    assert scoring.zone_hit(NO_BOUNDARY_POINT[0] + 0.005, NO_BOUNDARY_POINT[1]) is None  # 약 550m
    assert scoring.zone_hit(None, None) is None


def test_zone_bonus_uses_boundary(monkeypatch):
    fake_zones(monkeypatch)
    base = scoring.TYPE_POINTS["콘크리트 균열"]
    inside = admin_item(make(37.6008, 127.0008)["public_id"])
    outside = admin_item(make(37.6000, 127.0030)["public_id"])
    assert inside["priority"]["total"] == base + scoring.SCHOOL_ZONE_POINTS
    assert any("경계 안" in (i["note"] or "") for i in inside["priority"]["items"])
    assert outside["priority"]["total"] == base


def test_real_zone_file_loads():
    zs = scoring.zone_shapes()
    assert zs, "backend/data/zones.geojson 이 없음: python backend/scripts/build_zones.py"
    with_boundary = [z for z in zs if z["polys"]]
    assert with_boundary and len(with_boundary) < len(zs)         # 경계 있는 곳과 없는 곳이 모두 있음
    z = with_boundary[0]
    ring = z["polys"][0][0]
    # 경계 위의 꼭짓점들이 서로 다른 값이고 고리가 닫혀 있음
    assert ring[0] == ring[-1] and len(set(map(tuple, ring))) >= 3


def test_zones_api():
    body = client.get("/api/zones").json()
    assert body["type"] == "FeatureCollection" and body["features"]
    kinds = {f["properties"]["kind"] for f in body["features"]}
    assert "어린이" in kinds


def test_zone_buffer_30m(monkeypatch):
    fake_zones(monkeypatch)
    # SQUARE 동쪽 변(경도 127.001)에서 바깥으로: 0.0002도 ≈ 17.6m, 0.0005도 ≈ 44m
    near = scoring.zone_hit(37.6005, 127.0012)
    assert near["how"] == "near" and 15 < near["dist"] < 20
    assert scoring.zone_hit(37.6005, 127.0015) is None
    base = scoring.TYPE_POINTS["콘크리트 균열"]
    item = admin_item(make(37.6005, 127.0012)["public_id"])
    assert item["priority"]["total"] == base + scoring.SCHOOL_ZONE_POINTS
    assert any("경계에서" in (i["note"] or "") and "30m 이내" in (i["note"] or "") for i in item["priority"]["items"])
