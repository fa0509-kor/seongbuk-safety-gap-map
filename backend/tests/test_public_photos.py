"""지도에서 조치 완료 전 제보의 사진 공개: 담당자가 확인(검토 이후)했고 AI 검수에 걸리지 않은 것만 공개한다. 접수 상태·걸린 사진은 공개하지 않는다(설명 글도 사진과 같이)."""
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import config
from backend.app.db import SessionLocal
from backend.app.main import app
from backend.app.models import Photo, Report

from .test_aftercare import finish
from .test_priority import admin_item, make

client = TestClient(app)
A = "pubphoto-key-aaaa01"


def moderate(public_id: str, ok: bool | None):
    """제보 대표 사진의 공개 검수 결과를 직접 적는다. ok=None이면 검수를 못 한 상태(AI 키 없음·호출 실패)."""
    with SessionLocal() as db:
        r = db.scalars(select(Report).where(Report.public_id == public_id)).one()
        photo = db.get(Photo, r.photo_key)
        mod = {"checked": ok is not None, "ok": ok, "flags": [] if ok is not False else ["person"], "reason": "시험", "version": "moderation_v1"}
        photo.ai = {**(photo.ai or {}), "moderation": mod}
        db.commit()


def review(public_id: str, status: str = "review"):
    """담당자가 확인을 시작한 상태로 바꾼다(접수 상태는 사진·설명을 공개하지 않는다)."""
    rid = admin_item(public_id)["id"]
    assert client.patch(f"/api/admin/reports/{rid}", json={"status": status}).status_code == 200


def seen(public_id: str) -> dict:
    return client.get("/api/reports", params={"ids": public_id}).json()[0]   # 번호만 아는 사람


def test_default_is_on_and_only_passed_photos_are_public(monkeypatch):
    assert config.PUBLIC_PHOTOS_AFTER_AI_CHECK is True                     # 기본값: 공개 (11/9 결정)
    ok = make(37.6100, 127.6100, client_key=A, memo="옹벽 균열이 있어요")
    bad = make(37.6110, 127.6110, client_key=A, memo="앞 사람 얼굴이 나왔어요")
    none = make(37.6120, 127.6120, client_key=A, memo="검수 못 한 사진")
    moderate(ok["public_id"], True); moderate(bad["public_id"], False); moderate(none["public_id"], None)
    assert seen(ok["public_id"])["photo_url"] is None                               # 접수 상태는 검수를 통과해도 미공개
    for r in (ok, bad, none):
        review(r["public_id"])
    a, b, c = seen(ok["public_id"]), seen(bad["public_id"]), seen(none["public_id"])
    assert a["photo_url"] and a["photos"] and a["memo"] == "옹벽 균열이 있어요"      # 통과: 사진과 설명 공개
    assert b["photo_url"] is None and b["photos"] == [] and b["memo"] is None       # 걸림: 미공개
    assert c["photo_url"] and c["photos"] and c["memo"] == "검수 못 한 사진"          # 검수 못 함: 담당자가 확인(검토)했으니 공개
    mine = client.get("/api/reports", params={"ids": bad["public_id"], "client_key": A}).json()[0]
    assert mine["photo_url"] and mine["memo"]                                       # 걸린 사진도 본인에게는 보임


def test_flagged_photo_stays_hidden_after_done_and_switch_off_hides_before_done(monkeypatch):
    bad = make(37.6200, 127.6200, client_key=A, memo="번호판이 나왔어요")
    moderate(bad["public_id"], False)
    finish(bad["public_id"])
    done = seen(bad["public_id"])
    assert done["photo_url"] is None and done["memo"] is None                       # 조치 완료여도 걸린 사진은 미공개
    ok = make(37.6210, 127.6210, client_key=A)
    moderate(ok["public_id"], True)
    review(ok["public_id"])
    assert seen(ok["public_id"])["photo_url"]
    monkeypatch.setattr(config, "PUBLIC_PHOTOS_AFTER_AI_CHECK", False)              # 스위치를 끄면 조치 완료 전에는 모두 미공개
    assert seen(ok["public_id"])["photo_url"] is None
