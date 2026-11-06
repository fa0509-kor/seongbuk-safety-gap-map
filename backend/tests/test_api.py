import io
from datetime import datetime

from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import app

client = TestClient(app)


def jpeg(w=3000, h=2000) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), (120, 120, 120)).save(b, "JPEG")
    return b.getvalue()


def upload(**params):
    r = client.post("/api/photos", params=params, files={"file": ("a.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_and_meta():
    h = client.get("/api/health").json()
    assert h["ok"] and h["db_ok"] and h["vision_provider"] == "mock" and h["db"] == "sqlite"
    assert "gap_items.json" in h["data_files"]  # 배포에서도 backend/data 가 같이 올라갔는지 확인용
    m = client.get("/api/meta").json()
    assert m["statuses"]["received"] == "접수" and "철근 노출" in m["categories"]


def test_map_endpoints_return_geojson():
    for path in ("/api/facilities", "/api/gaps", "/api/admin/integrated", "/api/reports/map"):
        assert client.get(path).json()["type"] == "FeatureCollection"


def test_photo_is_resized_and_classified():
    p = upload()
    assert max(p["width"], p["height"]) == 1600
    assert p["ai"]["mock"] is True and p["ai"]["category"] == "콘크리트 균열"
    img = client.get(p["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert upload(classify="false")["ai"] is None


def test_rejects_non_image():
    r = client.post("/api/photos", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_demo_flow_resident_to_admin_and_back():
    """시연 흐름: 주민 제보 → 관리자 목록 → 상세에서 조치 완료 → 주민 내 제보에 새 소식"""
    p = upload()
    rep = client.post("/api/reports", json={"photo_key": p["key"], "lat": 37.589, "lon": 127.016,
                                            "memo": "옹벽 금"}).json()
    pid, first_news = rep["public_id"], rep["news_at"]
    assert rep["status"] == "received" and rep["ai"]["category"] == "콘크리트 균열"
    assert rep["news_at"].endswith(("Z", "+00:00")), "시간대 없는 시각은 브라우저가 한국 시간으로 잘못 읽음"

    lst = client.get("/api/admin/reports", params={"source": "resident"}).json()
    item = next(x for x in lst if x["public_id"] == pid)

    after = upload(classify="false")
    d = client.patch(f"/api/admin/reports/{item['id']}",
                     json={"status": "done", "note": "보수 완료", "after_photo_key": after["key"],
                           "dept_note": "도로과 보수"}).json()
    assert d["status_label"] == "완료" and [h["to_status"] for h in d["history"]] == ["received", "done"]

    mine = client.get("/api/reports", params={"ids": pid}).json()[0]
    assert mine["after_photo_url"] and mine["dept_note"] == "도로과 보수"
    t = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))  # noqa: E731  (3.10 호환)
    assert t(mine["news_at"]) > t(first_news)

    feats = client.get("/api/reports/map").json()["features"]
    assert any(f["properties"]["public_id"] == pid for f in feats)


def test_bad_inputs():
    assert client.post("/api/reports", json={"photo_key": "없음.jpg"}).status_code == 400
    assert client.patch("/api/admin/reports/99999", json={"status": "done"}).status_code == 404
    p = upload()
    rid = client.post("/api/admin/reports", json={"photo_key": p["key"], "source": "cctv"}).json()["id"]
    assert client.patch(f"/api/admin/reports/{rid}", json={"status": "끝"}).status_code == 400
    assert client.get("/api/photos/..%2F..%2Fetc%2Fpasswd").status_code in (400, 404)


def test_nearby_reports_and_not_target_flag():
    """같은 곳 근처 제보만 나오고(체험·오탐 제외), 처리 대상 아님은 내 제보에서 구분된다."""
    from .test_priority import make
    base = (37.5900, 127.0200)
    a = make(*base)
    far = make(base[0] + 0.01, base[1])  # 약 1.1km 떨어짐
    demo = make(*base, is_demo=True)
    near = client.get("/api/reports/nearby", params={"lat": base[0], "lon": base[1] + 0.0002}).json()
    ids = [x["public_id"] for x in near]
    assert a["public_id"] in ids and far["public_id"] not in ids and demo["public_id"] not in ids
    assert {"public_id", "category", "status", "status_label", "distance_m", "confirm_count"} <= set(near[0])
    assert "memo" not in near[0] and "photo_url" not in near[0]
    # 분류가 다르면 거른다
    assert client.get("/api/reports/nearby", params={"lat": base[0], "lon": base[1], "category": "없는분류"}).json() == []
    # 처리 대상 아님: 주민 내 제보에서는 구분돼 보이고, 근처 목록에서는 빠진다
    rid = next(x["id"] for x in client.get("/api/admin/reports").json() if x["public_id"] == a["public_id"])
    client.patch(f"/api/admin/reports/{rid}", json={"false_positive": True, "dept_note": "공사 중인 구간이라 대상이 아닙니다"})
    mine = client.get("/api/reports", params={"ids": a["public_id"]}).json()[0]
    assert mine["not_target"] is True and "공사" in mine["dept_note"]
    assert a["public_id"] not in [x["public_id"] for x in client.get("/api/reports/nearby", params={"lat": base[0], "lon": base[1]}).json()]


def test_report_with_extra_photos_memo_and_taken_at():
    """사진 여러 장(대표 + 추가), 사진별 메모, 촬영 일시가 저장·응답되고 엑셀 대장에도 나온다."""
    from io import BytesIO
    from zipfile import ZipFile
    main, extra1, extra2 = upload(), upload(), upload()
    body = {"photo_key": main["key"], "lat": 37.59, "lon": 127.02, "taken_at": "2026-11-06T05:03:00Z", "photo_memo": "대표 사진 메모", "client_key": "extra-photo-key-0001",
            "extra_photos": [{"photo_key": extra1["key"], "memo": "균열 가까이", "taken_at": "2026-11-06T05:04:00Z"},
                             {"photo_key": extra2["key"]}, {"photo_key": main["key"]}]}  # 대표와 같은 키는 무시
    r = client.post("/api/reports", json=body).json()
    assert [p["position"] for p in r["photos"]] == [0, 1, 2]
    assert r["photos"][0]["memo"] == "대표 사진 메모" and r["photos"][0]["taken_at"].startswith("2026-11-06T05:03")
    assert r["photos"][1]["memo"] == "균열 가까이" and r["photos"][2]["memo"] is None
    mine = client.get("/api/reports", params={"ids": r["public_id"], "client_key": "extra-photo-key-0001"}).json()[0]  # 완료 전 사진은 제보한 브라우저에게만
    assert len(mine["photos"]) == 3
    # 4장을 넘기면 거절
    too_many = {**body, "extra_photos": [{"photo_key": upload()["key"]} for _ in range(4)]}
    assert client.post("/api/reports", json=too_many).status_code == 422
    # 없는 사진 키는 거절
    assert client.post("/api/reports", json={**body, "extra_photos": [{"photo_key": "nope.jpg"}]}).status_code == 400
    # 예전 방식(사진 한 장만)도 그대로 되고, 응답에는 대표 사진 한 장이 들어 있음
    old = client.post("/api/reports", json={"photo_key": upload()["key"]}).json()
    assert len(old["photos"]) == 1 and old["photos"][0]["taken_at"] is None
    # 엑셀 대장에 촬영 일시와 사진 수
    xlsx = client.get("/api/admin/ledger.xlsx").content
    sheet = ZipFile(BytesIO(xlsx)).read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "촬영 일시" in sheet and "사진 수" in sheet and "2026-11-06 14:03" in sheet


def test_corrections_export_only_reviewed_and_no_personal_data():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    from .test_priority import make, admin_item
    c = TestClient(app)
    a = make(37.7000, 127.2000, client_key="device-priv9999")
    b = make(37.7010, 127.2010)
    c0 = make(37.7020, 127.2020)
    ia, ib = admin_item(a["public_id"])["id"], admin_item(b["public_id"])["id"]
    assert c.patch(f"/api/admin/reports/{ia}", json={"true_category": "박리"}).status_code == 200
    assert c.patch(f"/api/admin/reports/{ib}", json={"false_positive": True}).status_code == 200
    import csv as _csv
    import io as _io
    body = c.get("/api/admin/corrections.csv").content.decode("utf-8-sig")
    table = list(_csv.reader(_io.StringIO(body)))
    assert table[0][0] == "접수번호"
    by_id = {int(r[0]): r for r in table[1:]}                              # 다른 테스트가 남긴 수정 건과 섞여도 내 제보 번호로만 확인
    assert ia in by_id and ib in by_id and admin_item(c0["public_id"])["id"] not in by_id  # 수정하지 않은 제보는 빠짐
    assert by_id[ia][4] == "박리" and by_id[ia][6] in ("예", "아니오") and by_id[ib][5] == "예"
    assert "device-priv9999" not in body and "37.7000" not in body and "127.2000" not in body  # 식별값·위치는 내보내지 않음
    s = c.get("/api/admin/corrections/summary").json()
    assert s["total"] >= 1 and any(p["true"] == "박리" for p in s["pairs"])
