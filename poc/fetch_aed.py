"""성북구 AED 목록을 공공데이터포털 API에서 받아 CSV로 저장.

실행: python poc/fetch_aed.py
키: 프로젝트 루트의 .env 의 DATA_GO_KR_AED_KEY (또는 같은 이름의 환경변수). .env는 git에 올리지 않는다.
API: 국립중앙의료원 전국 자동심장충격기(AED) 정보 조회 서비스 /getEgytAedManageInfoInqire (시도 Q0, 시군구 Q1)
"""
from __future__ import annotations

import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "AED_성북구.csv"
URL = "https://apis.data.go.kr/B552657/AEDInfoInqireService/getEgytAedManageInfoInqire"


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


def fetch_page(key: str, page: int, rows: int = 100) -> tuple[list[dict], int, str]:
    q = urllib.parse.urlencode({"serviceKey": key, "Q0": "서울특별시", "Q1": "성북구",
                                "pageNo": page, "numOfRows": rows})
    with urllib.request.urlopen(f"{URL}?{q}", timeout=30) as r:
        body = r.read().decode("utf-8")
    root = ET.fromstring(body)
    code = root.findtext(".//resultCode") or ""
    msg = root.findtext(".//resultMsg") or ""
    total = int(root.findtext(".//totalCount") or 0)
    items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
    return items, total, f"{code} {msg}".strip()


def main() -> None:
    key = load_key()
    rows: list[dict] = []
    page = 1
    while True:
        items, total, status = fetch_page(key, page)
        if page == 1:
            print("응답 상태:", status, "/ totalCount:", total)
        rows += items
        if not items or len(rows) >= total:
            break
        page += 1
    if not rows:
        sys.exit("받은 행이 없음. 상태: " + status)
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False, encoding="utf-8-sig")
    print(f"저장: {OUT} ({len(df)}행) 열: {list(df.columns)}")


if __name__ == "__main__":
    main()
