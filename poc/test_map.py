"""공공데이터 인코딩·좌표계 확인 후 Leaflet 단독 HTML 생성.

실행: python poc/test_map.py [데이터파일.csv]
- 파일을 안 주면 프로젝트·해커톤 폴더의 CSV/Excel을 스캔
- 하나도 없으면 성북구 가상 샘플 20건 생성 (sample_facilities.csv, cp949)
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pandas as pd

from common import (POC_DIR, SAMPLE_FILE, detect_crs, filter_seongbuk, find_columns,
                    find_data_files, read_table, to_wgs84)

CENTER = (37.5894, 127.0167)
OUT_HTML = POC_DIR / "map_test.html"


def make_sample() -> Path:
    """성북구 대략 범위의 가상 소방용수 샘플. 실제 시설이 아님."""
    rnd = random.Random(7)
    rows = []
    for i in range(1, 26):
        lat = round(rnd.uniform(37.572, 37.618), 6)
        lon = round(rnd.uniform(126.995, 127.047), 6)
        if i in (6, 13, 19, 22, 25):  # 좌표 누락 5건
            lat = lon = None
        rows.append({"시설명": f"샘플 소방용수 {i:02d}", "구분": "소방용수(샘플)",
                     "위도": lat, "경도": lon})
    pd.DataFrame(rows).to_csv(SAMPLE_FILE, index=False, encoding="cp949")
    return SAMPLE_FILE


def build_html(ok: pd.DataFrame, missing: pd.DataFrame, title: str, note: str) -> str:
    points = [{"name": str(r["_name"]), "lat": round(r["_lat"], 6), "lon": round(r["_lon"], 6)}
              for _, r in ok.iterrows()]
    miss = [str(n) for n in missing["_name"]]
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body{{margin:0;height:100%;font-family:'Malgun Gothic',sans-serif;color:#111}}
#map{{position:absolute;left:280px;right:0;top:0;bottom:0}}
#side{{position:absolute;left:0;top:0;bottom:0;width:280px;overflow:auto;box-sizing:border-box;
padding:12px;border-right:1px solid #999;background:#fff;font-size:13px}}
h1{{font-size:15px;margin:0 0 8px}} li{{margin:2px 0}} .note{{color:#555}}
</style></head><body>
<div id="side"><h1>{title}</h1>
<div class="note">{note}</div>
<p>지도 표출 {len(points)}건 / 좌표 누락 {len(miss)}건</p>
<b>좌표 누락 목록</b><ul>{''.join(f'<li>{m}</li>' for m in miss) or '<li>없음</li>'}</ul></div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pts = {json.dumps(points, ensure_ascii=False)};
const map = L.map('map').setView([{CENTER[0]}, {CENTER[1]}], 14);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',
  {{maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}}).addTo(map);
pts.forEach(p => L.circleMarker([p.lat, p.lon],
  {{radius: 8, color: '#b00020', fillColor: '#d32f2f', fillOpacity: 0.9, weight: 1}})
  .bindPopup(p.name).addTo(map));
</script></body></html>"""


def main() -> None:
    if len(sys.argv) > 1:
        files = [Path(sys.argv[1])]
        print("지정 파일:", files[0])
    else:
        files = find_data_files()
        print(f"스캔 결과: CSV/Excel {len(files)}개")
        for f in files:
            print("  -", f)

    if files:
        path, is_sample = files[0], False
    else:
        print("공공데이터 없음 -> 가상 샘플 생성")
        path, is_sample = make_sample(), True

    df, enc = read_table(path)
    print(f"[{path.name}] 인코딩={enc}, 행={len(df)}, 열={list(df.columns)}")
    df, note_gu = filter_seongbuk(df)
    if note_gu:
        print(note_gu)
    cols = find_columns(df)
    print("좌표 열 추정:", cols)
    if not cols["lat"] or not cols["lon"]:
        sys.exit("위도/경도 열을 찾지 못함. common.py의 LAT_NAMES/LON_NAMES에 열 이름을 추가")

    crs = detect_crs(pd.to_numeric(df[cols["lat"]], errors="coerce"),
                     pd.to_numeric(df[cols["lon"]], errors="coerce"))
    print("좌표계 추정:", crs)
    df = to_wgs84(df, cols["lat"], cols["lon"], crs)
    df["_name"] = df[cols["name"]] if cols["name"] else [f"행 {i + 1}" for i in range(len(df))]

    has = df["_lat"].notna() & df["_lon"].notna()
    ok, missing = df[has].head(20), df[~has]
    print(f"정상 좌표 {int(has.sum())}건 중 상위 {len(ok)}건 표출, 누락 {len(missing)}건")

    note = f"원본: {path.name} / 인코딩 {enc} / 좌표계 {crs}"
    title = "성북구 지도 PoC"
    if is_sample:
        title += " (가상 샘플)"
        note = "실제 시설이 아닌 가상 샘플. " + note
    OUT_HTML.write_text(build_html(ok, missing, title, note), encoding="utf-8")
    print("생성:", OUT_HTML)


if __name__ == "__main__":
    main()
