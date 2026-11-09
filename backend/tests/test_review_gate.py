"""담당자 확인 전(접수) 제보는 지도·사진에서 빠지고 숫자로만 보인다. 조치 완료 결과는 새 표에 저장된다."""
from fastapi.testclient import TestClient

from backend.app.main import app

from .test_aftercare import finish
from .test_priority import admin_item, make

client = TestClient(app)


def set_status(public_id: str, **body):
    rid = admin_item(public_id)["id"]
    return client.patch(f"/api/admin/reports/{rid}", json=body)


def map_ids() -> set[str]:
    return {f["properties"]["public_id"] for f in client.get("/api/reports/map").json()["features"]}


def test_received_reports_are_not_on_the_map_until_reviewed():
    r = make(37.3100, 127.3100)
    pid = r["public_id"]
    assert pid not in map_ids()                                           # 접수: 지도에 없음
    assert set_status(pid, status="review").status_code == 200
    assert pid in map_ids()                                               # 담당자가 확인(검토)하면 지도에 나옴


def test_summary_counts_pending_as_number_only_and_lists_reviewed_recent():
    before = client.get("/api/reports/summary").json()
    a = make(37.3200, 127.3200)           # 접수만
    b = make(37.3210, 127.3210)           # 검토
    c = make(37.3220, 127.3220, facility_type="retaining_wall")   # 완료
    d = make(37.3230, 127.3230, is_demo=True)                    # 체험: 세지 않음
    set_status(b["public_id"], status="review")
    finish(c["public_id"])
    s = client.get("/api/reports/summary").json()
    assert s["pending"] == before["pending"] + 1
    assert s["review"] == before["review"] + 1 and s["done"] == before["done"] + 1
    ids = [x["public_id"] for x in s["recent"]]
    assert a["public_id"] not in ids and d["public_id"] not in ids          # 접수·체험은 목록에 없음
    assert len(s["recent"]) <= 5 and set(s["recent"][0]) >= {"public_id", "category", "facility_label", "status", "result_label"}
    assert client.get("/api/reports/summary", params={"limit": 0}).status_code == 422


def test_done_result_is_saved_validated_and_shown():
    r = make(37.3300, 127.3300, facility_type="retaining_wall")
    pid = r["public_id"]
    bad = set_status(pid, status="review", result="repaired")             # 완료가 아닌 상태에서는 결과를 못 고름
    assert bad.status_code == 400
    assert set_status(pid, status="done", result="없는결과").status_code == 400
    ok = set_status(pid, status="done", result="repaired")
    assert ok.status_code == 200 and ok.json()["result"] == "repaired" and ok.json()["result_label"] == "보수 완료"
    pub = client.get(f"/api/reports/{pid}").json()
    assert pub["result_label"] == "보수 완료"
    recent = client.get("/api/reports/summary", params={"limit": 10}).json()["recent"]
    assert next(x for x in recent if x["public_id"] == pid)["result_label"] == "보수 완료"
    assert set_status(pid, result="no_issue").json()["result_label"] == "이상 없음"     # 바꿀 수 있음
    assert set_status(pid, result="").json()["result"] is None                         # 지울 수 있음
