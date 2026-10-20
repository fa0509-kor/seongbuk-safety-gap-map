"""공백 탐지 항목을 관리자 목록(source=gap)에 한 번만 적재한다. 서버 시작 시 main.py가 부른다.
원본: data/processed/gap_items.json (backend/scripts/build_geojson.py 가 만듦). 이미 있는 gap_key는 건너뛴다."""
from __future__ import annotations

import json
import logging

from sqlalchemy import select

from . import config, departments
from .db import SessionLocal
from .models import Report, StatusHistory

log = logging.getLogger(__name__)


def seed_gap_items() -> int:
    p = config.PROCESSED_DIR / "gap_items.json"
    if not p.exists():
        return 0
    items = json.loads(p.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        have = set(db.scalars(select(Report.gap_key).where(Report.gap_key.is_not(None))))
        new = [i for i in items if i["key"] not in have]
        for i in new:
            r = Report(source="gap", gap_key=i["key"], gap_rule_code=i["rule_code"], gap_rule=i["rule"],
                       gap_reason=i["reason"][:200], address=i.get("address"), lat=i.get("lat"), lon=i.get("lon"),
                       memo=(i.get("name") if i["rule_code"].startswith("hydrant_distance")
                             else f"시설번호 {i['name']}" if i.get("name") else None),
                       dept=departments.assign("gap", gap_rule_code=i["rule_code"]))
            r.history.append(StatusHistory(from_status=None, to_status="received", note=f"공백 탐지 규칙으로 등록 · {r.dept}"))
            db.add(r)
        db.commit()
    if new:
        log.info("공백 항목 %d건 적재", len(new))
    return len(new)
