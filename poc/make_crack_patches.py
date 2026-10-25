"""AI-Hub 균열 데이터에서 분류용 조각(patch)을 만들고 학습·검증·시험으로 나눈다.

팀 결정(docs/decisions.md 'AI 학습 방향')을 그대로 따른다.
- AI-Hub 라벨은 선·영역 표시이므로 라벨 영역을 잘라낸 조각을 분류 데이터로 쓴다
- 클래스: 균열 / 박리 / 백태·누수 / 철근 노출 / 정상(라벨이 없는 영역)
- 70/15/15, 같은 시설물의 조각은 한 세트에만 (같은 원본 사진은 당연히 한 세트)
- 약관: 이 PC에서만 처리. 만든 조각은 data/raw/aihub/ 아래(.gitignore 대상)에만 저장하고 올리지 않는다

입력 (data/raw/aihub/)
  VS_wall/VS_지상시설물_옹벽.zip + VL_wall/VL_지상시설물_옹벽.zip   옹벽 원천 이미지 + 라벨
  crack_Sample.zip                                                  여러 시설물 샘플 (철근 노출 보충)
출력
  data/raw/aihub/patches_v1/{train,val,test}/{crack,spalling,efflorescence_leak,rebar,normal}/*.jpg
  data/raw/aihub/patches_v1/manifest.csv
  data/ai_patch_stats.md   (개수만. 올려도 됨)

실행: python poc/make_crack_patches.py            (약 몇 분)
      python poc/make_crack_patches.py --plan     (조각을 만들지 않고 계획과 분할 결과만 출력)
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import random
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
AIHUB = ROOT / "data" / "raw" / "aihub"
OUT = AIHUB / "patches_v1"
STATS = ROOT / "data" / "ai_patch_stats.md"

SEED = 20261025
PATCH = 224                 # 저장 크기(픽셀)
MIN_SIDE = 96               # 원본에서 자르는 한 변의 최소 크기
MARGIN = 1.3                # 라벨 상자보다 조금 넓게
MAX_PER_IMAGE_CLASS = 2     # 사진 한 장에서 같은 클래스는 최대 2조각
NORMAL_PER_IMAGE = 1
RATIO = {"train": 0.70, "val": 0.15, "test": 0.15}

# AI-Hub 라벨 이름 -> 클래스 (팀 결정). 나머지(damage, material separation, exhilaration)는 쓰지 않음
CLASS_OF = {
    "crack": "crack", "reticular crack": "crack",
    "spalling": "spalling", "detachment": "spalling",
    "efflorescence": "efflorescence_leak", "leak": "efflorescence_leak",
    "rebar": "rebar",
}
KOREAN = {"crack": "균열", "spalling": "박리", "efflorescence_leak": "백태·누수", "rebar": "철근 노출", "normal": "정상"}
CLASSES = list(KOREAN)


def facility_of(stem: str) -> str:
    return stem.split("_")[0]          # 예: GRW010_2023_01_00_001_131001 -> GRW010


def load_items() -> dict[str, dict]:
    """이미지 이름(확장자 제외) -> {zip, image_member, label, facility}. 같은 사진이 둘 다 있으면 옹벽 쪽을 씀."""
    items: dict[str, dict] = {}

    def add(label_zip: zipfile.ZipFile, image_zip: zipfile.ZipFile, source: str) -> None:
        images = {Path(n).stem: n for n in image_zip.namelist() if n.lower().endswith(".jpg")}
        for n in label_zip.namelist():
            if not n.endswith(".json"):
                continue
            stem = Path(n).stem
            if stem in items or stem not in images:
                continue
            d = json.loads(label_zip.read(n).decode("utf-8"))
            items[stem] = {"source": source, "image_zip": image_zip, "image_member": images[stem],
                           "image": d["image"], "facility": facility_of(stem)}

    vl = zipfile.ZipFile(AIHUB / "VL_wall" / "VL_지상시설물_옹벽.zip")
    vs = zipfile.ZipFile(AIHUB / "VS_wall" / "VS_지상시설물_옹벽.zip")
    add(vl, vs, "옹벽")
    sample = zipfile.ZipFile(AIHUB / "crack_Sample.zip")
    add(sample, sample, "샘플")
    return items


def bbox(points) -> tuple[float, float, float, float] | None:
    xs = [p[0] for p in points if len(p) >= 2]
    ys = [p[1] for p in points if len(p) >= 2]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def window(cx: float, cy: float, side: float, w: int, h: int) -> tuple[int, int, int, int]:
    side = int(max(MIN_SIDE, min(side, w, h)))
    x0 = int(min(max(cx - side / 2, 0), w - side))
    y0 = int(min(max(cy - side / 2, 0), h - side))
    return x0, y0, x0 + side, y0 + side


def plan_patches(items: dict[str, dict], rng: random.Random) -> list[dict]:
    plans: list[dict] = []
    for stem, it in sorted(items.items()):
        im = it["image"]
        w, h = int(im["width"]), int(im["height"])
        boxes, by_class = [], defaultdict(list)
        for a in im.get("annotations") or []:
            b = bbox(a.get("points") or [])
            if not b:
                continue
            boxes.append(b)
            c = CLASS_OF.get(a.get("label"))
            if c:
                by_class[c].append((a["label"], b))
        for c, lst in by_class.items():
            for label, b in rng.sample(lst, min(MAX_PER_IMAGE_CLASS, len(lst))):
                cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                win = window(cx, cy, max(b[2] - b[0], b[3] - b[1]) * MARGIN, w, h)
                plans.append({"stem": stem, "facility": it["facility"], "class": c, "raw_label": label, "win": win})
        # 정상: 어떤 라벨 상자와도 겹치지 않는 영역
        made = 0
        for _ in range(30):
            if made >= NORMAL_PER_IMAGE:
                break
            side = rng.randint(160, min(480, w, h))
            x0, y0 = rng.randint(0, w - side), rng.randint(0, h - side)
            win = (x0, y0, x0 + side, y0 + side)
            if all(win[2] < b[0] or win[0] > b[2] or win[3] < b[1] or win[1] > b[3] for b in boxes):
                plans.append({"stem": stem, "facility": it["facility"], "class": "normal", "raw_label": "", "win": win})
                made += 1
    return plans


def split_groups(plans: list[dict]) -> dict[str, str]:
    """시설물(그룹)을 통째로 한 세트에 배정. 클래스마다 70/15/15에 가깝게 되도록 탐욕적으로 고름."""
    per_group: dict[str, Counter] = defaultdict(Counter)
    for p in plans:
        per_group[p["facility"]][p["class"]] += 1
    total = Counter()
    for c in per_group.values():
        total.update(c)
    cur = {s: Counter() for s in RATIO}
    out: dict[str, str] = {}
    # 드문 클래스(철근 노출)를 가진 시설물부터 배정해야 골고루 퍼짐
    order = sorted(per_group, key=lambda g: (-per_group[g]["rebar"], -sum(per_group[g].values())))
    for g in order:
        best, best_cost = None, None
        for s, r in RATIO.items():
            # 이 시설물을 s에 넣었을 때 세 세트 모두의 목표 비율과의 차이를 합침
            cost = sum(((cur[t][c] + (per_group[g][c] if t == s else 0)) / total[c] - rt) ** 2
                       for t, rt in RATIO.items() for c in CLASSES if total[c])
            if best_cost is None or cost < best_cost:
                best, best_cost = s, cost
        out[g] = best
        cur[best].update(per_group[g])
    return out


def stats_text(plans, assign, items) -> str:
    tab = {s: Counter() for s in RATIO}
    for p in plans:
        tab[assign[p["facility"]]][p["class"]] += 1
    lines = ["# AI 학습 조각 통계", "",
             "`poc/make_crack_patches.py` 결과. 개수만 적은 문서이며 이미지·라벨은 포함하지 않는다 (AI-Hub 약관).", "",
             f"- 원본 사진 {len(items):,}장 (옹벽 {sum(1 for i in items.values() if i['source'] == '옹벽'):,}, 샘플 {sum(1 for i in items.values() if i['source'] == '샘플'):,})",
             f"- 시설물 {len(set(i['facility'] for i in items.values()))}곳, 조각 {len(plans):,}개, 저장 크기 {PATCH}x{PATCH}",
             f"- 사진 한 장에서 같은 클래스는 최대 {MAX_PER_IMAGE_CLASS}조각, 정상은 {NORMAL_PER_IMAGE}조각. 무작위 시드 {SEED}", "",
             "| 세트 | " + " | ".join(KOREAN[c] for c in CLASSES) + " | 합계 |",
             "| --- | " + " | ".join("---:" for _ in CLASSES) + " | ---: |"]
    for s in RATIO:
        row = [tab[s][c] for c in CLASSES]
        lines.append(f"| {s} | " + " | ".join(f"{v:,}" for v in row) + f" | {sum(row):,} |")
    tot = [sum(tab[s][c] for s in RATIO) for c in CLASSES]
    lines.append("| 합계 | " + " | ".join(f"{v:,}" for v in tot) + f" | {sum(tot):,} |")
    lines += ["", "세트별 비율 (클래스별 합계 대비)", "",
              "| 세트 | " + " | ".join(KOREAN[c] for c in CLASSES) + " |", "| --- | " + " | ".join("---:" for _ in CLASSES) + " |"]
    for s in RATIO:
        lines.append(f"| {s} | " + " | ".join(f"{tab[s][c] / sum(tab[x][c] for x in RATIO):.0%}" if sum(tab[x][c] for x in RATIO) else "-" for c in CLASSES) + " |")
    fac = defaultdict(list)
    for f, s in sorted(assign.items()):
        fac[s].append(f)
    lines += ["", "시설물 배정", ""] + [f"- {s}: {', '.join(fac[s])}" for s in RATIO]
    lines += ["", "## 알아둘 점", "",
              "- 라벨 이름 대응: crack·reticular crack → 균열, spalling·detachment → 박리, efflorescence·leak → 백태·누수, rebar → 철근 노출. damage, material separation, exhilaration은 쓰지 않음",
              "- 철근 노출은 옹벽에 7개뿐이라 샘플(여러 시설물) 조각이 대부분이다. 시설물 단위로 나누기 때문에 세트별 비율이 70/15/15와 어긋날 수 있다",
              f"- 철근 노출은 시설물 몇 곳에 몰려 있어 검증 {tab['val']['rebar']}개, 시험 {tab['test']['rebar']}개뿐이다. 이 클래스의 재현율은 표본이 작아 참고용으로만 말한다",
              "- 옹벽 이미지는 드론 촬영이다. 주민 스마트폰 사진과 촬영 조건이 달라 성능이 떨어질 수 있으며, 직접 찍은 성북구 사진으로 따로 시험해야 한다",
              "- 정상 조각은 라벨 상자와 겹치지 않는 영역에서 무작위로 잘랐다. 라벨에 빠진 손상이 섞여 있을 수 있다"]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true", help="조각을 저장하지 않고 계획과 분할만 출력")
    args = ap.parse_args()

    rng = random.Random(SEED)
    items = load_items()
    plans = plan_patches(items, rng)
    assign = split_groups(plans)
    for p in plans:
        p["split"] = assign[p["facility"]]

    text = stats_text(plans, assign, items)
    STATS.write_text(text, encoding="utf-8")
    print(text)
    if args.plan:
        return

    by_stem: dict[str, list[dict]] = defaultdict(list)
    for p in plans:
        by_stem[p["stem"]].append(p)
    for s in RATIO:
        for c in CLASSES:
            (OUT / s / c).mkdir(parents=True, exist_ok=True)
    rows = []
    for i, (stem, ps) in enumerate(sorted(by_stem.items()), 1):
        it = items[stem]
        img = Image.open(io.BytesIO(it["image_zip"].read(it["image_member"]))).convert("RGB")
        for k, p in enumerate(ps):
            patch = img.crop(p["win"]).resize((PATCH, PATCH), Image.BILINEAR)
            rel = Path(p["split"]) / p["class"] / f"{stem}_{k}.jpg"
            patch.save(OUT / rel, quality=90)
            rows.append({"path": rel.as_posix(), "split": p["split"], "class": p["class"],
                         "class_ko": KOREAN[p["class"]], "raw_label": p["raw_label"], "source_image": stem,
                         "facility": p["facility"], "source": it["source"],
                         "x0": p["win"][0], "y0": p["win"][1], "x1": p["win"][2], "y1": p["win"][3]})
        if i % 500 == 0:
            print(f"  {i}/{len(by_stem)}장 처리")
    with open(OUT / "manifest.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"저장: {OUT} (조각 {len(rows):,}개), 통계 {STATS}")


if __name__ == "__main__":
    main()
