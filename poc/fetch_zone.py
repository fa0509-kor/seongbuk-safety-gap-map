"""성북구 보호구역(어린이·노인·장애인) 경계를 경찰청 API에서 받아 저장.

실행: python poc/fetch_zone.py
키: 프로젝트 루트 .env 의 DATA_GO_KR_AED_KEY (공공데이터포털 일반 인증키, 같은 계정이면 같은 키)
API: 경찰청_전국 보호구역 현황 /1320000/safetyzonedtlinfo/getdtllist (sggCd=11290 성북구)
저장: data/raw/보호구역_성북구.json (응답 원본), 도형 좌표는 WKT 문자열이며 좌표계는 EPSG:5174로 보임
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "보호구역_성북구.json"
URL = "https://apis.data.go.kr/1320000/safetyzonedtlinfo/getdtllist"


def load_key() -> str:
    key = os.getenv("DATA_GO_KR_AED_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATA_GO_KR_AED_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("DATA_GO_KR_AED_KEY가 없음. .env에 넣거나 환경변수로 지정")
    return key


def main() -> None:
    key = load_key()
    items: list[dict] = []
    page, total = 1, None
    while True:
        q = urllib.parse.urlencode({"serviceKey": key, "sggCd": "11290", "numOfRows": 100, "pageNo": page})
        with urllib.request.urlopen(f"{URL}?{q}", timeout=60) as r:
            d = json.loads(r.read().decode("utf-8"))["response"]
        if d["header"]["resultCode"] != "00":
            sys.exit("API 오류: " + str(d["header"]))
        body = d["body"]
        total = body["totalCount"]
        got = body["items"]["item"] if body.get("items") else []
        items += got if isinstance(got, list) else [got]
        if len(items) >= total or not got:
            break
        page += 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    print(f"저장: {OUT} ({len(items)}건 / totalCount {total})")


if __name__ == "__main__":
    main()
