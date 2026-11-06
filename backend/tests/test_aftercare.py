"""조치 완료 이후 사후 관리: 주민 확인(고쳐졌어요/아직 그대로예요), 재발 연결, 근처 제보 상태와 정확도 반경, 장소 이력."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app import constants
from backend.app.db import SessionLocal
from backend.app.main import app
from backend.app.models import StatusHistory

from .test_priority import admin_item, make

client = TestClient(app)
KEY_A, KEY_B, KEY_C = "browser-aaaa1111", "browser-bbbb2222", "browser-cccc3333"


def finish(public_id: str, days_ago: int = 0) -> int:
    """완료 처리하고, 완료 시각을 days_ago일 전으로 돌린다. 관리자 번호를 돌려준다."""
    rid = admin_item(public_id)["id"]
    assert client.patch(f"/api/admin/reports/{rid}", json={"status": "done"}).status_code == 200
    if days_ago:
        with SessionLocal() as db:
            h = db.query(StatusHistory).filter(StatusHistory.report_id == rid, StatusHistory.to_status == "done").one()
            h.created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
            db.commit()
    return rid


def feedback(public_id: str, kind: str, key: str):
    return client.post(f"/api/reports/{public_id}/feedback", json={"kind": kind, "client_key": key})


def test_feedback_only_on_done_one_vote_per_browser_and_score():
    r = make(37.6100, 127.0500)
    pid = r["public_id"]
    assert feedback(pid, "not_fixed", KEY_A).status_code == 400  # 조치 완료 전에는 못 보냄
    finish(pid)
    assert client.post(f"/api/reports/{pid}/feedback", json={"kind": "not_fixed", "client_key": "짧음"}).status_code == 422
    assert client.post(f"/api/reports/{pid}/feedback", json={"kind": "그대로", "client_key": KEY_A}).status_code == 422
    out = feedback(pid, "not_fixed", KEY_A).json()
    assert out["aftercare"]["not_fixed"] == 1 and out["aftercare"]["fixed"] == 0
    out = feedback(pid, "fixed", KEY_A).json()  # 같은 브라우저는 한 표만, 바꿀 수 있음
    assert out["aftercare"]["not_fixed"] == 0 and out["aftercare"]["fixed"] == 1
    assert out["aftercare"]["recurrence"] is None

    # 가산은 '아직 그대로'가 NOT_FIXED_MIN명 이상이고 '고쳐졌어요'보다 많을 때만
    before = admin_item(pid)["priority"]["total"]
    feedback(pid, "not_fixed", KEY_B)
    feedback(pid, "not_fixed", KEY_C)  # 이제 아직 그대로 2, 고쳐졌어요 1 → 많음
    item = admin_item(pid)
    labels = {i["label"]: i["points"] for i in item["priority"]["items"]}
    assert labels["조치 후에도 그대로(주민 재확인)"] == constants.REOPEN_POINTS
    assert item["priority"]["total"] == before + constants.REOPEN_POINTS
    feedback(pid, "fixed", KEY_B)  # 2 대 2 → 많지 않으므로 가산 없음
    assert "조치 후에도 그대로(주민 재확인)" not in {i["label"] for i in admin_item(pid)["priority"]["items"]}

    # 지도에는 '재확인 필요' 표시 (아직 그대로가 더 많을 때)
    feedback(pid, "not_fixed", KEY_B)
    feats = client.get("/api/reports/map").json()["features"]
    assert next(f for f in feats if f["properties"]["public_id"] == pid)["properties"]["recheck"] is True


def test_recurrence_links_same_place_recent_done_only():
    p = (37.6200, 127.0600)
    a = make(*p)
    a_id = finish(a["public_id"], days_ago=40)  # 40일 전 완료
    b = make(p[0] + 0.0002, p[1])  # 약 22m
    ab = admin_item(b["public_id"])
    rec = ab["aftercare"]["recurrence"]
    assert rec["days_after_done"] in (39, 40) and rec["admin_id"] == a_id
    assert "public_id" not in b["aftercare"]["recurrence"]  # 주민 응답에는 이전 제보 번호를 내보내지 않음
    assert any(i["label"] == "재발(같은 곳에서 다시 제보)" and i["points"] == constants.RECUR_POINTS for i in ab["priority"]["items"])
    prior = client.get("/api/reports", params={"ids": a["public_id"]}).json()[0]
    assert any("다시 제보가 들어왔어요" in (h["note"] or "") for h in prior["history"])  # 이전 제보 이력에 한 줄
    assert admin_item(a["public_id"])["aftercare"]["recurrence"] is None

    far = make(p[0] + 0.0040, p[1])  # 약 440m: 같은 곳이 아님
    assert admin_item(far["public_id"])["aftercare"]["recurrence"] is None

    q = (37.6300, 127.0700)  # 완료한 지 200일: 재발로 보지 않음
    old = make(*q)
    finish(old["public_id"], days_ago=200)
    assert admin_item(make(q[0] + 0.0002, q[1])["public_id"])["aftercare"]["recurrence"] is None


def test_nearby_states_and_accuracy_radius():
    p = (37.6400, 127.0800)
    open_r = make(*p)
    recent = make(p[0] + 0.00005, p[1])
    finish(recent["public_id"], days_ago=3)
    old = make(p[0] + 0.00008, p[1])
    finish(old["public_id"], days_ago=40)
    got = {x["public_id"]: x for x in client.get("/api/reports/nearby", params={"lat": p[0], "lon": p[1]}).json()}
    assert got[open_r["public_id"]]["state"] == "open" and got[open_r["public_id"]]["done_days_ago"] is None
    assert got[recent["public_id"]]["state"] == "recent_done" and got[recent["public_id"]]["done_days_ago"] == 3
    assert got[old["public_id"]]["state"] == "old_done" and got[old["public_id"]]["done_days_ago"] == 40

    # 위치 정확도가 나쁘면 반경이 넓어진다 (기본 50m는 못 찾는 약 80m 거리)
    pid = make(p[0] + 0.0030, p[1])["public_id"]  # 약 330m 떨어진 곳에서
    near = lambda **kw: {x["public_id"] for x in client.get("/api/reports/nearby", params={"lat": p[0] + 0.0030 + 0.0007, "lon": p[1], **kw}).json()}
    assert pid not in near()                      # 약 78m: 기본 50m 밖
    assert pid in near(accuracy=60)               # 정확도 60m → 반경 90m
    assert constants.radius_for(None) == 50 and constants.radius_for(5) == 30 and constants.radius_for(500) == 200


def test_summary_aftercare_and_place_history():
    before = client.get("/api/admin/summary").json()["aftercare"]
    p = (37.6500, 127.0900)
    a = make(*p)
    a_id = finish(a["public_id"], days_ago=constants.RECHECK_DAYS + 5)  # 재점검 기간 지남
    s1 = client.get("/api/admin/summary").json()["aftercare"]
    assert s1["recheck_due"] == before["recheck_due"] + 1
    ad = admin_item(a["public_id"])["aftercare"]
    assert ad["recheck_due"] is True and ad["recheck_at"] is not None
    feedback(a["public_id"], "fixed", KEY_A)  # 고쳐졌어요 확인이 생기면 재점검 대상에서 빠짐
    assert client.get("/api/admin/summary").json()["aftercare"]["recheck_due"] == before["recheck_due"]

    b = make(p[0] + 0.0002, p[1])  # 재발
    s2 = client.get("/api/admin/summary").json()["aftercare"]
    assert s2["recurred"] == before["recurred"] + 1
    b_id = admin_item(b["public_id"])["id"]
    hist = client.get(f"/api/admin/reports/{b_id}/place-history").json()
    rel = {h["id"]: h["relation"] for h in hist}
    assert rel[a_id] == "prior" and rel[b_id] == "self"
    assert [h["created_at"] for h in hist] == sorted(h["created_at"] for h in hist)
    prior = next(h for h in hist if h["id"] == a_id)
    assert prior["status"] == "done" and prior["photo_url"] and prior["fixed"] == 1
    assert client.get("/api/admin/reports/99999/place-history").status_code == 404

    # 엑셀 대장에 재발과 주민 재확인 열
    import io
    import re
    import zipfile
    sheet = zipfile.ZipFile(io.BytesIO(client.get("/api/admin/ledger.xlsx").content)).read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "재발" in sheet and "주민 재확인" in sheet and re.search(r"조치 후 \d+일 만에 재발", sheet)


def test_stale_photo_and_season():
    from datetime import datetime, timedelta, timezone
    from backend.app.models import Report
    p = make(37.6600, 127.1000)
    item = admin_item(p["public_id"])
    assert item["stale_photo"] is False and item["photo_age_days"] in (None, 0)
    with SessionLocal() as db:
        r = db.query(Report).filter(Report.public_id == p["public_id"]).one()
        r.photos[0].taken_at = datetime.now(timezone.utc) - timedelta(days=constants.STALE_PHOTO_DAYS + 5)
        r.created_at = datetime(2026, 3, 10, 3, 0, tzinfo=timezone.utc)  # 해빙기
        r.photos[0].taken_at = r.created_at - timedelta(days=constants.STALE_PHOTO_DAYS + 5)
        db.commit()
    item = admin_item(p["public_id"])
    assert item["stale_photo"] is True and item["photo_age_days"] == constants.STALE_PHOTO_DAYS + 5
    assert item["season"] == "해빙기"
    got = client.get("/api/admin/reports", params={"season": "해빙기"}).json()
    assert p["public_id"] in {x["public_id"] for x in got} and all(x["season"] == "해빙기" for x in got)


def test_client_key_same_browser_count_and_never_exposed():
    A, B = "device-aaaa1111", "device-bbbb2222"
    r1 = make(37.6700, 127.1100, client_key=A)
    r2 = make(37.6710, 127.1110, client_key=A)
    r3 = make(37.6720, 127.1120, client_key=B)
    r4 = make(37.6730, 127.1130)  # 식별값 없음
    r5 = make(37.6750, 127.1150, client_key=A, client_nickname="  안암동 주민 ")
    i1, i2, i3, i4 = (admin_item(x["public_id"]) for x in (r1, r2, r3, r4))
    assert i1["same_client_reports"] == 3 and i2["same_client_reports"] == 3 and i2["same_client_24h"] == 3
    assert i3["same_client_reports"] == 1 and i3["client_nickname"] is None
    assert admin_item(r5["public_id"])["client_nickname"] == "안암동 주민" and admin_item(r5["public_id"])["same_client_reports"] == 3
    assert i4["same_client_reports"] is None and i4["same_client_24h"] is None
    # 식별값 자체는 주민·관리자 어느 응답에도 나가지 않는다
    assert i1["client_code"] == A[:8] and i4["client_code"] is None  # 담당자에게는 앞 8자리만
    assert A not in str(client.get("/api/admin/reports").json()) and A not in str(r1)  # 전체 값은 나가지 않음
    assert A not in str(client.get("/api/reports", params={"ids": r1["public_id"]}).json())
    # 너무 짧은 값은 거부
    p = make(37.6740, 127.1140)
    from .test_priority import upload
    bad = client.post("/api/reports", json={"photo_key": upload()["key"], "lat": 37.6, "lon": 127.1, "client_key": "짧음"})
    assert bad.status_code == 422


def test_cancel_only_own_browser_and_only_before_review():
    A, B = "device-cccc1111", "device-dddd2222"
    r = make(37.7100, 127.2100, client_key=A)
    pid = r["public_id"]
    assert client.post(f"/api/reports/{pid}/cancel", json={"client_key": B}).status_code == 403   # 다른 브라우저는 취소 못 함
    assert client.post(f"/api/reports/{pid}/cancel", json={"client_key": "짧음"}).status_code == 422
    assert client.post("/api/reports/없는번호/cancel", json={"client_key": A}).status_code == 404
    old = make(37.7110, 127.2110)  # 식별값 없는 제보
    assert client.post(f"/api/reports/{old['public_id']}/cancel", json={"client_key": A}).status_code == 403

    rid = admin_item(pid)["id"]
    ok = client.post(f"/api/reports/{pid}/cancel", json={"client_key": A})
    assert ok.status_code == 200
    assert client.get("/api/reports", params={"ids": pid}).json() == []
    assert all(x["public_id"] != pid for x in client.get("/api/admin/reports").json())
    assert all(f["properties"]["public_id"] != pid for f in client.get("/api/reports/map").json()["features"])
    assert client.post(f"/api/reports/{pid}/cancel", json={"client_key": A}).status_code == 404   # 이미 취소됨

    r2 = make(37.7120, 127.2120, client_key=A)  # 담당자가 확인을 시작하면 취소 불가
    id2 = admin_item(r2["public_id"])["id"]
    assert client.patch(f"/api/admin/reports/{id2}", json={"status": "review"}).status_code == 200
    bad = client.post(f"/api/reports/{r2['public_id']}/cancel", json={"client_key": A})
    assert bad.status_code == 400


def test_photos_hidden_until_done_except_for_owner():
    A, B = "photo-key-aaaa0001", "photo-key-bbbb0002"
    r = make(37.9700, 127.7000, client_key=A)
    pid = r["public_id"]
    assert r["photo_url"] and r["photos"]                                   # 제보한 사람의 응답에는 사진이 있음
    anyone = client.get("/api/reports", params={"ids": pid}).json()[0]       # 번호만 아는 사람
    assert anyone["photo_url"] is None and anyone["after_photo_url"] is None and anyone["photos"] == []
    assert client.get("/api/reports", params={"ids": pid, "client_key": B}).json()[0]["photo_url"] is None   # 다른 브라우저
    mine = client.get("/api/reports", params={"ids": pid, "client_key": A}).json()[0]
    assert mine["photo_url"] and mine["photos"]                             # 본인 브라우저는 완료 전에도 보임
    assert client.get(f"/api/reports/{pid}").json()["photo_url"] is None
    assert client.post(f"/api/reports/{pid}/confirm").json()["photo_url"] is None   # 나도 봤어요 응답에도 사진 없음
    # 식별값이 없던 옛 제보는 완료 전에 본인도 사진을 못 봄(본인 확인이 안 되므로)
    old = make(37.9710, 127.7010)
    assert client.get("/api/reports", params={"ids": old["public_id"], "client_key": A}).json()[0]["photo_url"] is None

    finish(pid)                                                             # 조치 완료 → 누구에게나 공개 (지도의 조치 전·후 보기)
    done = client.get("/api/reports", params={"ids": pid}).json()[0]
    assert done["photo_url"] and done["photos"]
    # 담당자 화면은 항상 사진이 보임
    assert admin_item(pid)["photo_url"]

    
def test_first_review_hours_and_summary():
    from datetime import datetime, timedelta, timezone
    from backend.app import review_time
    from backend.app.models import Report, StatusHistory
    r = make(37.9500, 127.6000)
    with SessionLocal() as db:
        row = db.query(Report).filter(Report.public_id == r["public_id"]).one()
        t0 = datetime.now(timezone.utc) - timedelta(hours=30)
        row.created_at = t0
        row.history[0].created_at = t0
        db.commit()
        waiting = review_time.stats([row])
        assert waiting["count"] == 0 and waiting["waiting"] == 1 and 29.9 <= waiting["oldest_waiting_hours"] <= 30.2   # 아직 접수 상태 = 확인 대기
        assert review_time.first_review_hours(row) is None
    # 메모만 남기면 확인이 아니고, 상태가 바뀌면 그 시각이 첫 확인
    rid = admin_item(r["public_id"])["id"]
    assert client.patch(f"/api/admin/reports/{rid}", json={"note": "메모만"}).status_code == 200
    with SessionLocal() as db:
        assert review_time.first_review_hours(db.get(Report, rid)) is None
    assert client.patch(f"/api/admin/reports/{rid}", json={"status": "review"}).status_code == 200
    with SessionLocal() as db:
        row = db.get(Report, rid)
        h = next(x for x in row.history if x.to_status == "review")
        h.created_at = row.created_at + timedelta(hours=3)
        db.commit()
        db.refresh(row)
        assert abs(review_time.first_review_hours(row) - 3.0) < 0.01
        one = review_time.stats([row])
        assert one["count"] == 1 and one["avg_hours"] == 3.0 and one["median_hours"] == 3.0 and one["within_24h_pct"] == 100 and one["waiting"] == 0
    fr = client.get("/api/admin/summary").json()["first_review"]
    assert fr["count"] >= 1 and fr["avg_hours"] is not None and set(fr) >= {"avg_hours", "median_hours", "within_24h_pct", "waiting", "oldest_waiting_hours"}
