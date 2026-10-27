"""우선순위 점수 v1 (규칙). 값의 근거는 docs/decisions.md '우선순위 점수 v1' — 팀 가정값이며 시연 후 조정한다.

- AI는 유형만 낸다. 점수·기한은 이 파일의 규칙이 정한다 (CLAUDE.md 'AI와 규칙의 경계').
- 상세 화면에서 항목별로 펼쳐 보여 주므로, 항목을 추가할 때는 items에 label·points·note를 남긴다.
- 값을 바꾸면 docs/decisions.md에도 날짜와 함께 기록한다.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from . import config

# --- 점수 상수 (한곳에 모음) ---
TYPE_POINTS = {"철근 노출": 40, "박리": 30, "콘크리트 균열": 20, "백태/누수": 15, "기타": 5}
GAP_POINTS = {
    "hydrant_unusable": 25,        # 소방용수 사용불가 표시
    "hydrant_distance_140": 25,    # 어린이 시설·쉼터에서 사용 가능 소방용수 140m 초과 (어느 지역이든 기준 초과)
    "hydrant_distance_100": 15,    # 100~140m (주거·상업·공업지역이면 기준 초과)
    "hydrant_coord": 10,           # 소방용수 좌표 누락·이상
}
SCHOOL_ZONE_RADIUS_M = 300      # 보호구역 지정 기준(시설 주출입문 반경 300m). 경계가 없는 보호구역에만 쓴다 (경계가 있으면 경계 안인지로 판단)
SCHOOL_ZONE_POINTS = 30
ZONE_BUFFER_M = 30              # 경계 밖이어도 이 거리 안이면 해당. 폰 GPS 오차(약 20m) + 보호구역 도로 옆 옹벽·담장(약 10m). decisions.md 10/26
OUTSIDE_LIST_POINTS = 20        # 관리목록(해빙기 점검 326개소) 밖. 목록을 받기 전까지 계산하지 않음
OUTSIDE_LIST_READY = False
CONFIRM_POINTS_EACH = 5
CONFIRM_POINTS_MAX = 20

# --- 조치 기한 ---
URGENT_THRESHOLD = 60
DUE_DAYS_URGENT = 3
DUE_DAYS_NORMAL = 7


@lru_cache(maxsize=1)
def school_zones() -> list[tuple[float, float, str]]:
    """어린이보호구역 대상 시설 위치 (facilities.geojson). 파일이 없으면 빈 목록."""
    p = config.PROCESSED_DIR / "facilities.geojson"
    if not p.exists():
        return []
    feats = json.loads(p.read_text(encoding="utf-8"))["features"]
    return [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0], f["properties"].get("name") or "")
            for f in feats if f["properties"].get("kind") == "어린이보호구역"]


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_school(lat: float | None, lon: float | None) -> tuple[str, float] | None:
    if lat is None or lon is None:
        return None
    best = min(((name, distance_m(lat, lon, la, lo)) for la, lo, name in school_zones()), key=lambda x: x[1], default=None)
    return best if best and best[1] <= SCHOOL_ZONE_RADIUS_M else None


@lru_cache(maxsize=1)
def zone_shapes() -> list[dict]:
    """어린이보호구역의 경계와 시설 위치 (backend/data/zones.geojson, build_zones.py가 만듦). 파일이 없으면 빈 목록.
    [{name, polys: [[고리, ...], ...], point: (위도, 경도) | None}] — polys가 비어 있으면 경계 정보가 없는 곳."""
    p = config.PROCESSED_DIR / "zones.geojson"
    if not p.exists():
        return []
    out = []
    for f in json.loads(p.read_text(encoding="utf-8"))["features"]:
        pr, g = f["properties"], f["geometry"]
        if pr.get("kind") != "어린이":
            continue
        pt = pr.get("point")
        out.append({"name": pr["name"], "polys": g["coordinates"] if g["type"] == "MultiPolygon" else [],
                    "point": (pt[1], pt[0]) if pt else None})
    return out


def _in_ring(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """점이 고리 안에 있는지 (ray casting). 좌표는 [경도, 위도]."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_polygon(lat: float, lon: float, rings: list[list[list[float]]]) -> bool:
    """rings[0]은 바깥 고리, 나머지는 구멍."""
    return _in_ring(lat, lon, rings[0]) and not any(_in_ring(lat, lon, h) for h in rings[1:])


def _ring_distance_m(lat: float, lon: float, ring: list[list[float]]) -> float:
    """점에서 고리(선분 묶음)까지 가장 가까운 거리(m). 짧은 거리라 위도 기준 평면 근사로 계산."""
    kx, ky = 111_320 * math.cos(math.radians(lat)), 110_540
    best = math.inf
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        ax, ay = (x1 - lon) * kx, (y1 - lat) * ky
        bx, by = (x2 - lon) * kx, (y2 - lat) * ky
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def _near_bbox(lat: float, lon: float, rings: list[list[list[float]]], margin_m: float) -> bool:
    """버퍼를 더한 바깥 고리 사각형 안에 있는지 (거리 계산 전에 빠르게 거르기)."""
    xs = [p[0] for p in rings[0]]
    ys = [p[1] for p in rings[0]]
    mx, my = margin_m / (111_320 * math.cos(math.radians(lat))), margin_m / 110_540
    return min(xs) - mx <= lon <= max(xs) + mx and min(ys) - my <= lat <= max(ys) + my


def zone_hit(lat: float | None, lon: float | None) -> dict | None:
    """어린이보호구역에 해당하는지.
    - 경계가 있는 곳: 경계 안이면 'boundary', 경계 밖 ZONE_BUFFER_M(30m) 안이면 'near'
    - 경계가 없는 곳: 시설 반경 300m 안이면 'radius'
    경계 파일이 없으면 예전 방식(시설 위치 반경 300m)으로 판단. 해당 없으면 None."""
    if lat is None or lon is None:
        return None
    zs = zone_shapes()
    if not zs:
        s = nearest_school(lat, lon)
        return {"name": s[0], "how": "radius", "dist": s[1]} if s else None
    for z in zs:
        if any(in_polygon(lat, lon, rings) for rings in z["polys"]):
            return {"name": z["name"], "how": "boundary", "dist": None}
    near = None
    for z in zs:
        for rings in z["polys"]:
            if not _near_bbox(lat, lon, rings, ZONE_BUFFER_M):
                continue
            d = min(_ring_distance_m(lat, lon, r) for r in rings)
            if d <= ZONE_BUFFER_M and (near is None or d < near["dist"]):
                near = {"name": z["name"], "how": "near", "dist": d}
    if near:
        return near
    for z in zs:
        if not z["polys"] and z["point"]:
            d = distance_m(lat, lon, *z["point"])
            if d <= SCHOOL_ZONE_RADIUS_M:
                return {"name": z["name"], "how": "radius", "dist": d}
    return None


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def score(r) -> dict:
    """{total, items[{label, points, note}], urgent, due_at, overdue}. r는 models.Report."""
    items: list[dict] = []

    if r.source == "gap":
        pts = GAP_POINTS.get(r.gap_rule_code or "", 0)
        items.append({"label": f"공백 규칙: {r.gap_rule or r.gap_rule_code}", "points": pts, "note": None})
    else:
        cat = r.ai_category or "기타"
        items.append({"label": f"유형 기본: {cat}", "points": TYPE_POINTS.get(cat, TYPE_POINTS["기타"]), "note": "AI가 고른 유형"})
        if OUTSIDE_LIST_READY:
            pass  # 해빙기 점검 목록을 받으면 여기서 판단
        else:
            items.append({"label": "관리목록 밖", "points": 0, "note": "데이터 대기 (해빙기 점검 326개소 목록)"})

    # 보호구역 가산은 사진으로 확인된 결함(주민·CCTV)에만. 어린이 동선 위의 결함이라는 뜻이라
    # 소방용수 같은 공백 후보에는 붙이지 않는다 (붙이면 공백 후보가 목록 상단을 다 차지함, decisions.md)
    if r.source != "gap":
        hit = zone_hit(r.lat, r.lon)
        if hit:
            if hit["how"] == "boundary":
                note = f"{hit['name']} 보호구역 경계 안"
            elif hit["how"] == "near":
                note = f"{hit['name']} 보호구역 경계에서 {hit['dist']:.0f}m (GPS 오차·도로 옆 시설 감안 {ZONE_BUFFER_M}m 이내)"
            else:
                note = f"{hit['name']} {hit['dist']:.0f}m (경계 정보 없음, 반경 {SCHOOL_ZONE_RADIUS_M}m)"
            items.append({"label": "어린이보호구역 인접", "points": SCHOOL_ZONE_POINTS, "note": note})
        elif r.lat is None:
            items.append({"label": "어린이보호구역 인접", "points": 0, "note": "위치 없음"})

    if r.confirm_count:
        pts = min(r.confirm_count * CONFIRM_POINTS_EACH, CONFIRM_POINTS_MAX)
        items.append({"label": "같은 곳 확인", "points": pts, "note": f"{r.confirm_count}명"})

    total = sum(i["points"] for i in items)
    if r.false_positive:
        items.append({"label": "AI 오탐 표시", "points": -total, "note": "0점 처리"})
        total = 0

    urgent = total >= URGENT_THRESHOLD
    due_at = overdue = None
    if r.source != "gap":  # 공백 후보는 신고가 아니라 점검 후보라 기한을 두지 않음 (decisions.md)
        due_at = _aware(r.created_at) + timedelta(days=DUE_DAYS_URGENT if urgent else DUE_DAYS_NORMAL)
        overdue = r.status != "done" and not r.false_positive and datetime.now(timezone.utc) > due_at
    return {"total": total, "items": items, "urgent": urgent, "due_at": due_at, "overdue": overdue}


def done_at(r) -> datetime | None:
    """처음 '완료'로 바뀐 시각 (처리 이력 기준). r.history가 로드돼 있어야 한다."""
    h = next((h for h in r.history if h.to_status == "done"), None)
    return _aware(h.created_at) if h else None


def on_time(rows) -> dict:
    """기한 내 조치율 = 기한 안에 완료한 건 / 기한이 이미 지났거나 완료된 건.
    대상: 기한이 있는 제보(주민·CCTV)만. 공백 후보·체험용·오탐은 뺀다.
    기한 초과 미완료는 '못 지킨 건'으로 분모에 들어가고, 기한이 남은 미완료는 아직 판단하지 않는다."""
    now = datetime.now(timezone.utc)
    met = due = 0
    for r in rows:
        if r.source == "gap" or r.is_demo or r.false_positive:
            continue
        s = score(r)
        d = done_at(r) if r.status == "done" else None
        if d is not None:
            due += 1
            met += d <= s["due_at"]
        elif s["due_at"] and now > s["due_at"]:
            due += 1
    return {"on_time": met, "due_total": due, "rate_pct": round(met / due * 100) if due else None}
