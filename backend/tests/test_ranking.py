"""안전왕 순위: 담당자가 확인을 시작한 제보만 센다. 접수만·체험·오탐은 제외, 식별값은 응답에 없다."""
from fastapi.testclient import TestClient

from backend.app.main import app

from .test_aftercare import finish
from .test_priority import admin_item, make

client = TestClient(app)
A, B, C, D = "rank-key-aaaa0001", "rank-key-bbbb0002", "rank-key-cccc0003", "rank-key-dddd0004"


def set_status(public_id: str, **body):
    rid = admin_item(public_id)["id"]
    assert client.patch(f"/api/admin/reports/{rid}", json=body).status_code == 200


def test_ranking_counts_only_checked_reports_and_hides_keys():
    before = client.get("/api/ranking", params={"limit": 100}).json()
    base_players = before["total_players"]
    # A: 확인 2건(검토, 완료) + 접수만 1건 → 2건
    a1 = make(37.4000, 127.4000, client_key=A, client_nickname="푸른다람쥐0001")
    a2 = make(37.4010, 127.4010, client_key=A, client_nickname="푸른다람쥐0001")
    make(37.4020, 127.4020, client_key=A, client_nickname="푸른다람쥐0001")
    set_status(a1["public_id"], status="review")
    finish(a2["public_id"])
    # B: 확인 1건. C: 접수만 → 순위 없음. D: 체험(제외) + 오탐(제외)
    b1 = make(37.4100, 127.4100, client_key=B, client_nickname="조용한고래0002")
    set_status(b1["public_id"], status="action")
    make(37.4200, 127.4200, client_key=C)
    d1 = make(37.4300, 127.4300, client_key=D, is_demo=True)
    d2 = make(37.4310, 127.4310, client_key=D)
    set_status(d1["public_id"], status="review")
    set_status(d2["public_id"], status="review", false_positive=True)

    r = client.get("/api/ranking", params={"limit": 100, "client_key": B}).json()
    assert r["total_players"] == base_players + 2                                  # A, B만 새로 올라옴
    names = [x["nickname"] for x in r["top"]]
    assert names.index("푸른다람쥐0001") < names.index("조용한고래0002")
    a = next(x for x in r["top"] if x["nickname"] == "푸른다람쥐0001")
    b = next(x for x in r["top"] if x["nickname"] == "조용한고래0002")
    assert a["count"] == 2 and a["points"] == 20 and b["count"] == 1 and b["points"] == 10
    assert a["rank"] < b["rank"] and a["is_me"] is False and b["is_me"] is True
    assert r["me"]["nickname"] == "조용한고래0002" and r["me"]["points"] == 10
    assert r["points_per_report"] == 10
    text = client.get("/api/ranking", params={"limit": 100}).text
    for key in (A, B, C, D):
        assert key not in text                                                      # 식별값은 내보내지 않음


def test_ranking_limit_title_and_no_rank_without_checked_reports():
    r = client.get("/api/ranking", params={"limit": 1}).json()
    assert len(r["top"]) == 1 and r["top"][0]["rank"] == 1 and r["top"][0]["title"] == "안전왕"
    assert all(x["title"] is None for x in client.get("/api/ranking", params={"limit": 100}).json()["top"][1:] if x["rank"] > 1)
    me = client.get("/api/ranking", params={"client_key": "rank-key-nobody001"}).json()["me"]
    assert me is None
    assert client.get("/api/ranking", params={"limit": 0}).status_code == 422
    assert client.get("/api/ranking", params={"client_key": "짧음"}).status_code == 422
