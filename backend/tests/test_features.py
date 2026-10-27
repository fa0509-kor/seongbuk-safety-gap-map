"""부서 자동 배정, 나도 봤어요(+1), 기간별 보고서."""
from fastapi.testclient import TestClient

from backend.app import departments, scoring
from backend.app.main import app

from .test_api import upload

client = TestClient(app)


def report(**body):
    p = upload()
    r = client.post("/api/reports", json={"photo_key": p["key"], "lat": 37.0, "lon": 127.5, **body})
    assert r.status_code == 200, r.text
    return r.json()


def admin(public_id):
    return next(x for x in client.get("/api/admin/reports").json() if x["public_id"] == public_id)


def test_meta_has_facility_types():
    ft = client.get("/api/meta").json()["facility_types"]
    assert ft["retaining_wall"] == "옹벽·축대" and "unknown" in ft


def test_department_assigned_by_facility_type():
    r = report(facility_type="stairs")
    assert r["dept"] == "도로과 도로시설팀" and r["facility_label"] == "계단"
    assert "1차 배정" in r["history"][0]["note"]
    assert report()["dept"] == departments.DEFAULT_DEPT  # 모름 → 안전점검 총괄
    assert report(facility_type="retaining_wall")["dept"] == departments.DEFAULT_DEPT
    p = upload()
    bad = client.post("/api/reports", json={"photo_key": p["key"], "facility_type": "우주선"})
    assert bad.status_code == 400


def test_gap_items_go_to_fire_station():
    gaps = client.get("/api/admin/reports", params={"source": "gap"}).json()
    assert gaps and all(g["dept"] == "성북소방서" for g in gaps)


def test_reassign_is_recorded():
    item = admin(report(facility_type="sidewalk")["public_id"])
    d = client.patch(f"/api/admin/reports/{item['id']}", json={"dept": "도로과 도로시설팀"}).json()
    assert d["dept"] == "도로과 도로시설팀"
    assert any("담당 부서 변경" in (h["note"] or "") for h in d["history"])


def test_resident_map_has_only_resident_reports():
    feats = client.get("/api/reports/map").json()["features"]
    assert feats and all(f["properties"]["source"] == "resident" for f in feats)


def test_confirm_adds_points():
    r = report()
    before = admin(r["public_id"])["priority"]["total"]
    for _ in range(5):
        client.post(f"/api/reports/{r['public_id']}/confirm")
    after = admin(r["public_id"])
    assert after["confirm_count"] == 5
    assert after["priority"]["total"] == before + scoring.CONFIRM_POINTS_MAX  # 5명이어도 최대 +20
    gap_id = client.get("/api/admin/reports", params={"source": "gap"}).json()[0]["public_id"]
    assert client.post(f"/api/reports/{gap_id}/confirm").status_code == 404


def test_period_report():
    item = admin(report(facility_type="park")["public_id"])
    client.patch(f"/api/admin/reports/{item['id']}", json={"status": "done"})
    rep = client.get("/api/admin/report").json()
    assert rep["counts"]["received"] >= 1 and rep["counts"]["done"] >= 1
    assert rep["counts"]["by_facility"].get("공원·놀이시설", 0) >= 1
    assert any(d["dept"] == "공원녹지과 공원관리팀" and d["done"] >= 1 for d in rep["by_dept"])
    assert len(rep["summary_lines"]) == 7 and "{" not in "".join(rep["summary_lines"])
    assert client.get("/api/admin/report", params={"start": "2026-12-01", "end": "2026-11-01"}).status_code == 400


def test_supabase_headers_for_new_and_legacy_keys(monkeypatch):
    from backend.app import config, storage
    monkeypatch.setattr(config, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_KEY", "sb_secret_abc")
    assert storage._headers() == {"apikey": "sb_secret_abc"}  # 새 키는 JWT가 아니라 apikey만
    monkeypatch.setattr(config, "SUPABASE_SERVICE_KEY", "eyJhbGciOi.legacy.jwt")
    assert storage._headers()["Authorization"].startswith("Bearer ")


def test_dotenv_value_cleaning():
    from backend.app.config import _clean_value
    assert _clean_value("reports         # 비공개 버킷") == "reports"
    assert _clean_value("sb_secret_x   # service_role 키") == "sb_secret_x"
    assert _clean_value("pa#ss") == "pa#ss"            # 공백 없이 붙은 #은 값
    assert _clean_value('"has # inside"') == "has # inside"


def test_screening_in_summary_and_report():
    s = client.get("/api/admin/summary").json()["screening"]
    assert s["facilities_total"] > 5000 and s["targets"] == 97
    assert 0 < s["ratio_pct"] < 5 and sum(s["by_rule"].values()) == 97
    gap = client.get("/api/admin/reports", params={"source": "gap"}).json()[0]
    client.patch(f"/api/admin/reports/{gap['id']}", json={"status": "done"})
    assert client.get("/api/admin/summary").json()["screening"]["targets_done"] >= 1
    rep = client.get("/api/admin/report").json()
    assert rep["screening"]["targets"] == 97
    assert any("먼저 확인할 곳은 97곳" in line for line in rep["summary_lines"])


def test_on_time_rate():
    from datetime import timedelta

    from backend.app.db import SessionLocal
    from backend.app.models import Report

    before = client.get("/api/admin/summary").json()["on_time"]
    fast = admin(report()["public_id"])  # 바로 완료 → 기한 안
    client.patch(f"/api/admin/reports/{fast['id']}", json={"status": "done"})
    late = admin(report()["public_id"])  # 10일 전 접수, 미완료 → 기한 초과
    with SessionLocal() as db:
        r = db.get(Report, late["id"])
        r.created_at = r.created_at - timedelta(days=10)
        db.commit()
    after = client.get("/api/admin/summary").json()["on_time"]
    assert after["on_time"] == before["on_time"] + 1
    assert after["due_total"] == before["due_total"] + 2
    assert after["rate_pct"] == round(after["on_time"] / after["due_total"] * 100)
    lines = client.get("/api/admin/report").json()["summary_lines"]
    assert any("기한 안에 조치를 마친 비율" in line for line in lines)


def test_vision_parse_tolerates_extra_text():
    import json as _json

    import pytest

    from backend.app.vision import parse_result
    body = '{"category": "박리", "confidence": 70, "alternatives": [{"category": "콘크리트 균열", "confidence": 20}], "reason": "표면이 떨어져 나감"}'
    assert parse_result("```json\n" + body + "\n```")["category"] == "박리"
    assert parse_result(body + "\n참고: {추가 설명}")["category"] == "박리"  # 뒤에 중괄호 문장이 붙어도
    with pytest.raises(_json.JSONDecodeError):
        parse_result(body[:-30])  # 잘린 응답은 실패 → classify가 mock으로 대체
