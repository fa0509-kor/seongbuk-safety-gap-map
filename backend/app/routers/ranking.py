"""안전왕 순위. 로그인이 없어서 제보를 보낸 브라우저(client_key)별로 묶고, 별명은 가장 최근 제보에 적힌 것을 쓴다.
식별값(client_key)은 응답에 넣지 않는다. 새 표 없이 기존 report_clients와 reports로 계산한다."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import POINTS_PER_REPORT, RANK_TOP_TITLE
from ..db import get_db
from ..models import Report, ReportClient
from ..schemas import RankingOut, RankRow

router = APIRouter(tags=["ranking"])
ANONYMOUS = "이름 없는 주민"


def build_board(db: Session) -> list[dict]:
    """순위표 전체. 점수가 높은 순, 같으면 먼저 확인된 사람이 앞. 같은 점수는 같은 순위."""
    rows = db.execute(
        select(ReportClient.client_key, ReportClient.nickname, Report.created_at)
        .join(Report, Report.id == ReportClient.report_id)
        .where(Report.source == "resident", Report.is_demo.is_(False), Report.false_positive.is_(False),
               Report.status != "received")
        .order_by(Report.created_at)).all()
    people: dict[str, dict] = {}
    for key, nick, created in rows:
        p = people.setdefault(key, {"key": key, "count": 0, "nickname": None, "first": created})
        p["count"] += 1
        if nick and nick.strip():
            p["nickname"] = nick.strip()        # 오래된 제보부터 읽으므로 마지막 값이 가장 최근 별명
    board = sorted(people.values(), key=lambda p: (-p["count"], p["first"], p["key"]))
    counts = [p["count"] for p in board]
    for p in board:
        p["rank"] = 1 + sum(1 for c in counts if c > p["count"])
    return board


def _row(p: dict, is_me: bool) -> RankRow:
    return RankRow(rank=p["rank"], nickname=p["nickname"] or ANONYMOUS, count=p["count"], points=p["count"] * POINTS_PER_REPORT,
                   title=RANK_TOP_TITLE if p["rank"] == 1 else None, is_me=is_me)


@router.get("/api/ranking", response_model=RankingOut)
def ranking(limit: int = Query(5, ge=1, le=100, description="보여 줄 상위 인원. 전체 보기는 100"),
            client_key: str | None = Query(None, min_length=8, max_length=40, description="내 브라우저 식별값. 보내면 me에 내 순위가 나옴"),
            db: Session = Depends(get_db)):
    board = build_board(db)
    mine = next((p for p in board if client_key and p["key"] == client_key), None)
    return RankingOut(points_per_report=POINTS_PER_REPORT, total_players=len(board),
                      top=[_row(p, p is mine) for p in board[:limit]],
                      me=_row(mine, True) if mine else None)
