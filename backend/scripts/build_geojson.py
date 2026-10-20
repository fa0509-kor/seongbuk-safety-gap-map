"""공공데이터 원본 → 지도용 GeoJSON (backend/data/). 서버는 이 파일을 읽기만 한다.

실행 (저장소 루트에서): python backend/scripts/build_geojson.py
필요: poc/requirements.txt (pandas, pyproj). 배포 서버에는 pandas가 필요 없도록 결과 파일을 git에 올린다.
규칙 정의는 poc/gap_rules.py 를 그대로 쓴다 (규칙을 고치면 이 스크립트를 다시 실행).

만드는 파일
- facilities.geojson : 안전시설 위치. properties: kind, name, address
- gaps.geojson       : 주민 지도 '점검 필요(규칙)' 레이어. 소방용수 사용불가 표시 + 소방용수 거리 기준 초과 의심.
                       properties: rule, reason, address, kinds
                       (좌표가 없는 소방용수 16건은 지도에 못 찍으므로 summary에만 센다)
- integrated.geojson : 관리자용 '통합 점검 후보' (같은 주소에 서로 다른 안전시설 2종 이상). 공백이 아니라
                       여러 부서가 같은 곳을 따로 점검하는 지점 → 묶어서 점검할 후보 (docs/decisions.md 10/19)
- gap_items.json     : 관리자 목록에 넣을 공백 항목 (사용불가 + 좌표 누락·이상 + 거리 기준 초과 의심). 좌표 없는 것도 포함.
                       서버가 시작할 때 source=gap 제보로 한 번만 적재한다 (backend/app/seed.py)
- summary.json       : 규칙별 건수와 기준 (PPT 수치 전달용)
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "poc"))
import gap_rules as G  # noqa: E402

OUT = ROOT / "backend" / "data"  # 서버가 읽는 위치 (배포 때 backend/ 만 올라감)
S, N, W, E = G.BOX


def point(lat, lon, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(float(lon), 6), round(float(lat), 6)]},
            "properties": props}


def inside(lat, lon) -> bool:
    return lat == lat and lon == lon and S <= lat <= N and W <= lon <= E  # NaN 제외 + 성북구 범위


def clean(v):
    return None if v != v else str(v).strip()  # NaN → None


def main() -> None:
    d, fw_raw = G.load()
    all_ = G.pd.concat(d.values(), ignore_index=True)

    fac = [point(r.lat, r.lon, {"kind": r.종류, "name": clean(r.이름), "address": clean(r.주소)})
           for r in all_.itertuples() if inside(r.lat, r.lon)]

    gaps = []
    items = []  # 관리자 목록용 (좌표 없는 것 포함)
    r1 = G.rule1(d["소방용수"])
    for r in r1.itertuples():
        ok = inside(r.lat, r.lon)
        items.append({"key": f"hydrant_coord:{r.이름}", "rule_code": "hydrant_coord", "rule": "소방용수 좌표 누락·이상",
                      "name": clean(r.이름), "address": clean(r.주소),
                      "lat": float(r.lat) if ok else None, "lon": float(r.lon) if ok else None,
                      "reason": r.사유 if r.사유 == "좌표 없음" else f"{r.사유} (위도 {r.lat}, 경도 {r.lon})"})
    for r in r1.itertuples():
        if inside(r.lat, r.lon):
            gaps.append(point(r.lat, r.lon, {"rule": "소방용수 좌표 누락·이상", "reason": r.사유, "address": clean(r.주소), "kinds": ["소방용수"]}))

    integrated = []
    r2 = G.rule2(all_)
    for key, g in r2.groupby("주소키"):
        g = g[[inside(a, b) for a, b in zip(g.lat, g.lon)]]
        if g.empty:
            continue
        kinds = sorted(set(g.종류))
        integrated.append(point(g.lat.mean(), g.lon.mean(), {
            "rule": "통합 점검 후보", "reason": f"{key} 에 {'·'.join(kinds)}가 함께 있음 (같은 출입문이라는 뜻은 아님, 현장 확인 필요)",
            "address": key, "kinds": kinds}))

    r4 = G.rule4(fw_raw)
    unusable = r4[r4["세부"] == "사용불가 표시"]
    for r in unusable.itertuples():
        ok = inside(r.lat, r.lon)
        items.append({"key": f"hydrant_unusable:{r.이름}", "rule_code": "hydrant_unusable", "rule": "소방용수 사용불가 표시",
                      "name": clean(r.이름), "address": clean(r.주소),
                      "lat": float(r.lat) if ok else None, "lon": float(r.lon) if ok else None, "reason": r.사유})
        if ok:
            gaps.append(point(r.lat, r.lon, {"rule": "소방용수 사용불가 표시", "reason": r.사유, "address": clean(r.주소), "kinds": ["소방용수"]}))

    r5 = G.rule5(d, fw_raw)
    for r in r5.itertuples():
        code = "hydrant_distance_140" if r.단계 == "140m 초과" else "hydrant_distance_100"
        props = {"rule": "소방용수 거리 기준 초과 의심", "reason": f"{r.종류} {r.이름}: {r.사유}",
                 "address": clean(r.주소), "kinds": [r.종류, "소방용수"]}
        gaps.append(point(r.lat, r.lon, props))
        items.append({"key": f"{code}:{r.종류}:{r.이름}", "rule_code": code, "rule": "소방용수 거리 기준 초과 의심",
                      "name": f"{r.종류} {r.이름}", "address": clean(r.주소), "lat": float(r.lat), "lon": float(r.lon),
                      "reason": f"{r.사유} · {r.단계}"})

    summary = {
        "generated": date.today().isoformat(),
        "source": "data/README.md 의 공공데이터 4종 (2026-10-19 내려받음)",
        "facilities": {k: len(v) for k, v in d.items()},
        "facilities_note": "소방용수는 시설번호 중복(기준일 2개)을 최신 기준일만 남긴 수",
        "rule1_coord_missing_or_outside": {"total": len(r1), "no_coords": int((r1["사유"] == "좌표 없음").sum()),
                                           "outside": int((r1["사유"] == "성북구 범위 밖").sum())},
        "rule2_integrated_candidates": int(r2["주소키"].nunique()),
        "rule2_note": "같은 주소에 서로 다른 안전시설 2종 이상. 공백이 아니라 통합 점검 후보로 씀 (주민센터·아파트·학교에 몰림)",
        "rule4_unusable_hydrants": len(unusable),
        "rule4_note": "갱신 정체의 나머지(상태 기록 없음·갱신 기록 없음)는 파일 구조 때문일 수 있어 제외",
        "rule3_school_zone_boundary": "경계 데이터 대신 보호구역 지정 범위(시설 주출입문 반경 300m)를 우선순위 점수에 사용",
        "rule5_hydrant_distance": {"total": len(r5), "over_140m": int((r5["단계"] == "140m 초과").sum()) if len(r5) else 0,
                                   "by_kind": r5["종류"].value_counts().to_dict() if len(r5) else {},
                                   "non_apartment": int((~r5["아파트"]).sum()) if len(r5) else 0,
                                   "non_apartment_over_140m": int(((~r5["아파트"]) & (r5["단계"] == "140m 초과")).sum()) if len(r5) else 0,
                                   "targets": {"어린이보호구역": len(d["어린이보호구역"]), "무더위쉼터": len(d["무더위쉼터"])},
                                   "basis": "소방기본법 시행규칙 별표3 (주거·상업·공업지역 100m, 그 외 140m)"},
        "mapped_gap_points": len(gaps),
        "mapped_integrated_points": len(integrated),
        "admin_gap_items": len(items),
    }

    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")  # noqa: E731
    dump("facilities.geojson", {"type": "FeatureCollection", "features": fac})
    dump("gaps.geojson", {"type": "FeatureCollection", "features": gaps})
    dump("integrated.geojson", {"type": "FeatureCollection", "features": integrated})
    (OUT / "gap_items.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
