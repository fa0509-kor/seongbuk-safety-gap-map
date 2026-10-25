"""경찰청 보호구역 경계 → 지도·점수용 GeoJSON (backend/data/zones.geojson).

실행 (저장소 루트에서): python backend/scripts/build_zones.py
필요: poc/requirements.txt (shapely, pyproj). 서버에는 shapely가 필요 없도록 결과 파일을 git에 올린다.
입력: data/raw/보호구역_성북구.json (poc/fetch_zone.py가 받음). 도형은 EPSG:5181(WKT)이라 WGS84로 바꾼다.

만드는 것: 보호구역 하나당 Feature 하나
- 경계(폴리곤)가 있으면 geometry = MultiPolygon, 없으면 geometry = Point(시설 위치)
- properties: name, kind(어린이 / 노인·장애인), has_boundary, point([경도, 위도] 시설 위치), address
"""
from __future__ import annotations

import json
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely import wkt
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "raw" / "보호구역_성북구.json"
OUT = ROOT / "backend" / "data" / "zones.geojson"
CRS = "EPSG:5181"


def polygons_of(g) -> list:
    """도형에서 폴리곤만 꺼냄. 잘못된 도형(꼬임)은 make_valid로 고친 뒤 폴리곤만 남김."""
    g = shapely.make_valid(g)
    parts = getattr(g, "geoms", [g])
    out = []
    for p in parts:
        if p.geom_type == "Polygon":
            out.append(p)
        elif p.geom_type == "MultiPolygon":
            out.extend(p.geoms)
        elif p.geom_type == "GeometryCollection":
            out.extend(polygons_of(p))
    return [p for p in out if not p.is_empty and p.area > 0]


def first_point(g):
    for s in getattr(g, "geoms", [g]):
        if s.geom_type == "Point":
            return s
        if s.geom_type == "MultiPoint":
            return s.geoms[0]
    return None


def main() -> None:
    zones = json.loads(SRC.read_text(encoding="utf-8"))
    to_ll = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True).transform
    feats = []
    for z in zones:
        g = wkt.loads(z["fturGeomVl"])
        pt = first_point(g)
        polys = polygons_of(g)
        props = {"name": z["trgtFcltNm"], "kind": "어린이" if str(z.get("fcltTypeCd")) == "1" else "노인·장애인",
                 "address": z.get("roadNmAddr", ""), "has_boundary": bool(polys)}
        if pt is not None:
            lon, lat = to_ll(pt.x, pt.y)
            props["point"] = [round(lon, 6), round(lat, 6)]
        if polys:
            # 폴리곤끼리 겹칠 수 있어 하나로 합치지 않고 그대로 담는다. 소수 6자리(약 10cm)로 줄여 파일 크기 감소
            def rings(poly):
                q = transform(to_ll, poly)
                return [[[round(x, 6), round(y, 6)] for x, y in r.coords] for r in [q.exterior, *q.interiors]]
            geometry = {"type": "MultiPolygon", "coordinates": [rings(poly) for poly in polys]}
        elif pt is not None:
            geometry = {"type": "Point", "coordinates": props["point"]}
        else:
            continue
        feats.append({"type": "Feature", "geometry": geometry, "properties": props})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kinds = {}
    for f in feats:
        k = (f["properties"]["kind"], f["properties"]["has_boundary"])
        kinds[k] = kinds.get(k, 0) + 1
    print(f"저장: {OUT} ({OUT.stat().st_size / 1024:.0f}KB)", {f"{a} 경계{'있음' if b else '없음'}": n for (a, b), n in kinds.items()})


if __name__ == "__main__":
    main()
