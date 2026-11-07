"""관리자(담당자) 화면용 API. 로그인은 만들지 않는다 (CLAUDE.md 만들지 않는 것)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import corrections, ledger, review_time, scoring, screening, serialize
from ..constants import AFTERCARE_RADIUS_M, CATEGORIES, KST, RECHECK_DAYS, STATUSES
from ..db import get_db
from ..models import Photo, Report, ReportLink, StatusHistory, now
from ..schemas import AdminReportCreate, AdminReportOut, AdminSummary, PlaceHistoryItem, ReportUpdate
from .reports import _meters, create_report

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/reports", response_model=list[AdminReportOut])
def list_reports(source: str | None = None, status: str | None = None, category: str | None = None,
                 include_demo: bool = True, sort: str = "priority", season: str | None = None, search: str = "", db: Session = Depends(get_db)):
    """관리자 목록. 필터: source(resident/gap/cctv), status, category, season(해빙기/우기/동절기).
    sort: priority(기본, 점수 높은 순 → 같으면 최신) / new / old. 오탐은 점수 0이라 뒤로 감."""
    return _filtered(db, source, status, category, include_demo, sort, season, search)


def _filtered(db: Session, source, status, category, include_demo, sort, season=None, search="") -> list[dict]:
    q = select(Report).options(selectinload(Report.history), selectinload(Report.photo), selectinload(Report.photos),
                               selectinload(Report.feedback), selectinload(Report.recurrence_link), selectinload(Report.client))
    if source:
        q = q.where(Report.source == source)
    if status:
        q = q.where(Report.status == status)
    if category:
        q = q.where(Report.ai_category == category)
    if not include_demo:
        q = q.where(Report.is_demo.is_(False))
    q = q.order_by(Report.created_at.asc() if sort == "old" else Report.created_at.desc())
    rows = [serialize.report(r, admin=True) for r in db.scalars(q)]
    if season:
        rows = [x for x in rows if x["season"] == season]
    term = search.strip().casefold().removeprefix("#")
    if term:
        rows = [x for x in rows if any(term in str(value or "").casefold() for value in (
            x["id"], x.get("gap_rule"), (x.get("ai") or {}).get("category"), x.get("address"),
        ))]
    if sort == "priority":
        rows.sort(key=lambda x: x["priority"]["total"], reverse=True)
    return rows


@router.get("/ledger.xlsx")
def ledger_xlsx(source: str | None = None, status: str | None = None, category: str | None = None,
                include_demo: bool = False, sort: str = "priority", season: str | None = None, search: str = "", db: Session = Depends(get_db)):
    """점검 대장 엑셀. 목록과 같은 필터를 쓴다. 체험용(is_demo) 제보는 기본으로 뺀다. 사진·개인 정보는 넣지 않는다."""
    rows = ledger.rows_from(_filtered(db, source, status, category, include_demo, sort, season, search))
    stamp = datetime.now(KST).strftime("%Y%m%d")
    return Response(ledger.to_xlsx(rows), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename=ledger_{stamp}.xlsx; filename*=UTF-8''%EC%A0%90%EA%B2%80%EB%8C%80%EC%9E%A5_{stamp}.xlsx"})


@router.get("/corrections.csv")
def corrections_csv(db: Session = Depends(get_db)):
    """담당자가 고친 AI 분류(실제 유형, 오탐)를 CSV로 내려받는다. AI 분류 개선용 평가 세트·프롬프트 예시 후보. 사진은 넣지 않고 사진 키만 적는다."""
    stamp = datetime.now(KST).strftime("%Y%m%d")
    return Response(corrections.to_csv(db), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=ai_corrections_{stamp}.csv"})


@router.get("/corrections/summary")
def corrections_summary(db: Session = Depends(get_db)):
    """AI가 어떤 유형을 담당자가 고른 어떤 유형으로 자주 틀렸는지 쌍별 건수. 수정된 건이 없으면 빈 목록."""
    conf = corrections.confusion(db)
    return {"total": sum(conf.values()), "pairs": [{"ai": a, "true": t, "count": n, "match": a == t} for (a, t), n in conf.most_common()]}


@router.get("/summary", response_model=AdminSummary)
def summary(db: Session = Depends(get_db)):
    """대시보드 숫자. '오늘'·'이번 달'은 한국 시간 기준."""
    now = datetime.now(KST)
    rows = db.scalars(select(Report).options(selectinload(Report.history), selectinload(Report.feedback),
                                             selectinload(Report.recurrence_link))).all()
    reports = [r for r in rows if r.source != "gap"]
    today_new = sum(1 for r in reports if serialize.utc(r.created_at).astimezone(KST).date() == now.date())
    overdue = sum(1 for r in reports if scoring.score(r)["overdue"])
    done_month, durations = 0, []
    for r in reports:
        done = next((h for h in r.history if h.to_status == "done"), None)
        if r.status == "done" and done:
            t = serialize.utc(done.created_at)
            durations.append((t - serialize.utc(r.created_at)).total_seconds() / 86400)
            if t.astimezone(KST).strftime("%Y-%m") == now.strftime("%Y-%m"):
                done_month += 1
    open_by_status = {k: sum(1 for r in rows if r.status == k) for k in STATUSES if k != "done"}
    # 조치 완료 이후 사후 관리 건수 (체험·오탐 제외)
    t = datetime.now(timezone.utc)
    reopened = recheck_due = 0
    live = [r for r in reports if not r.is_demo and not r.false_positive]
    for r in live:
        if r.status != "done":
            continue
        nf, fx = scoring.feedback_counts(r)
        reopened += nf >= 1 and nf > fx
        done = scoring.done_at(r)
        recheck_due += bool(done and t >= done + timedelta(days=RECHECK_DAYS) and fx == 0)
    aftercare = {"reopened": reopened, "recurred": sum(1 for r in live if r.recurrence_link is not None), "recheck_due": recheck_due}
    return {"today_new": today_new, "overdue_open": overdue, "done_this_month": done_month,
            "avg_days_to_done": round(sum(durations) / len(durations), 1) if durations else None,
            "open_by_status": open_by_status,
            "on_time": scoring.on_time(rows),
            "screening": screening.screening([r for r in rows if not r.is_demo]),
            "aftercare": aftercare,
            "first_review": review_time.stats(live)}


@router.get("/reports/{rid}/place-history", response_model=list[PlaceHistoryItem])
def place_history(rid: int, radius_m: int | None = None, db: Session = Depends(get_db)):
    """같은 곳(반경 안, 같은 AI 유형)과 재발로 이어진 제보를 시간순으로. 조치 전후 사진과 '아직 그대로예요' 수를 함께 보여 준다."""
    opts = (selectinload(Report.history), selectinload(Report.feedback), selectinload(Report.recurrence_link))
    me = db.scalars(select(Report).options(*opts).where(Report.id == rid)).first()
    if not me:
        raise HTTPException(404, "제보 없음")
    if me.lat is None or me.lon is None:
        return [serialize.place_item(me, "self", 0)]
    radius = radius_m or AFTERCARE_RADIUS_M
    linked = {l.related_id for l in [me.recurrence_link] if l} | set(
        db.scalars(select(ReportLink.report_id).where(ReportLink.related_id == me.id)))
    q = select(Report).options(*opts).where(Report.source == "resident", Report.is_demo.is_(False),
                                            Report.false_positive.is_(False), Report.lat.is_not(None), Report.lon.is_not(None))
    items = []
    for r in db.scalars(q):
        d = _meters(me.lat, me.lon, r.lat, r.lon)
        if r.id == me.id:
            rel = "self"
        elif r.id in linked:
            rel = "prior" if r.created_at < me.created_at else "later"
        elif d <= radius and r.ai_category == me.ai_category:
            rel = "prior" if r.created_at < me.created_at else "later"
        else:
            continue
        items.append(serialize.place_item(r, rel, round(d)))
    return sorted(items, key=lambda x: x["created_at"])


@router.post("/reports", response_model=AdminReportOut)
def create(body: AdminReportCreate, db: Session = Depends(get_db)):
    """CCTV 프레임 업로드 등 관리자가 직접 만드는 항목. 사진은 먼저 POST /api/photos."""
    if body.source not in ("cctv", "gap"):
        raise HTTPException(400, "source는 cctv 또는 gap")
    return serialize.report(create_report(body, db, body.source), admin=True)


@router.get("/reports/{report_id}", response_model=AdminReportOut)
def detail(report_id: int, db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "제보 없음")
    return serialize.report(r, admin=True)


@router.patch("/reports/{report_id}", response_model=AdminReportOut)
def update(report_id: int, body: ReportUpdate, db: Session = Depends(get_db)):
    """상태 변경·메모·조치 후 사진·오탐 표시. 상태가 바뀌거나 메모/사진이 있으면 처리 이력에 한 줄 남는다."""
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "제보 없음")
    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(400, f"status는 {list(STATUSES)} 중 하나")
    if body.after_photo_key and not db.get(Photo, body.after_photo_key):
        raise HTTPException(400, "after_photo_key에 해당하는 사진이 없음")

    if body.true_category is not None:
        if body.true_category and body.true_category not in CATEGORIES:
            raise HTTPException(400, f"true_category는 {CATEGORIES} 중 하나")
        r.true_category = body.true_category or None

    dept_changed = body.dept is not None and body.dept != r.dept
    if dept_changed:  # 재배정은 처리 이력에 남긴다
        r.history.append(StatusHistory(from_status=r.status, to_status=r.status,
                                       note=f"담당 부서 변경: {r.dept or '-'} → {body.dept}"))
    for field in ("dept", "dept_note", "dispatch", "false_positive"):
        v = getattr(body, field)
        if v is not None:
            setattr(r, field, v)

    changed = body.status is not None and body.status != r.status
    if changed or body.note or body.after_photo_key:
        r.history.append(StatusHistory(from_status=r.status, to_status=body.status or r.status,
                                       note=body.note, photo_key=body.after_photo_key))
    if changed:
        r.status = body.status
    # 주민에게 보이는 변화(상태, 메모, 조치 후 사진, 담당 부서 메모)가 있으면 빨간 점 시각을 갱신
    if changed or body.note or body.after_photo_key or body.dept_note is not None or dept_changed:
        r.news_at = now()
    db.commit()
    db.refresh(r)
    return serialize.report(r, admin=True)

