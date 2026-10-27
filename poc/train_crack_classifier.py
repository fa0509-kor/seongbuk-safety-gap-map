"""AI-Hub 균열 조각으로 5종 분류 모델을 학습하고 ONNX로 내보낸다. 이 PC의 CPU에서만 돌린다.

팀 결정(docs/decisions.md 'AI 학습 방향'): 사전학습된 작은 이미지 분류 모델을 미세조정 -> ONNX.
- 모델: torchvision MobileNetV3-Small (ImageNet 사전학습 가중치는 처음 한 번 인터넷에서 받음. 우리 데이터는 어디로도 나가지 않음)
- 입력: poc/make_crack_patches.py 가 만든 조각 (data/raw/aihub/patches_v1/, manifest.csv)
- 학습 train, 고르기 val(클래스별 재현율 평균이 가장 높은 회차), 마지막에 test로 한 번만 평가
- 약관: AI-Hub 파일을 해외 서버·해외 AI API에 올리지 않는다. 조각·모델 파일은 data/raw/aihub/ 아래(.gitignore 대상)에만 저장하고,
  올려도 되는 것은 숫자만 적은 data/ai_eval.md 뿐이다.

실행: python poc/train_crack_classifier.py --smoke          (몇 분 안에 끝나는 동작 확인)
      python poc/train_crack_classifier.py --epochs 6       (본 학습, 이 PC에서 수십 분)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

ROOT = Path(__file__).resolve().parent.parent
PATCHES = ROOT / "data" / "raw" / "aihub" / "patches_v1"
MODEL_DIR = ROOT / "data" / "raw" / "aihub" / "model_v1"
EVAL_MD = ROOT / "data" / "ai_eval.md"

CLASSES = ["crack", "spalling", "efflorescence_leak", "rebar", "normal"]
KO = {"crack": "균열", "spalling": "박리", "efflorescence_leak": "백태·누수", "rebar": "철근 노출", "normal": "정상"}
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]


class Patches(Dataset):
    def __init__(self, split: str, tf, limit: int | None = None, seed: int = 0):
        rows = [r for r in csv.DictReader(open(PATCHES / "manifest.csv", encoding="utf-8-sig")) if r["split"] == split]
        if limit:
            rng = np.random.default_rng(seed)
            rows = [rows[i] for i in rng.permutation(len(rows))[:limit]]
        self.rows, self.tf = rows, tf

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        img = Image.open(PATCHES / r["path"]).convert("RGB")
        return self.tf(img), CLASSES.index(r["class"])

    def labels(self):
        return [CLASSES.index(r["class"]) for r in self.rows]


def build_model() -> nn.Module:
    m = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    m.classifier[3] = nn.Linear(m.classifier[3].in_features, len(CLASSES))
    return m


@torch.no_grad()
def predict(model, loader):
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        ps += model(x).argmax(1).tolist()
        ys += y.tolist()
    return np.array(ys), np.array(ps)


def macro_recall(y, p) -> float:
    rec = [(p[y == c] == c).mean() for c in range(len(CLASSES)) if (y == c).any()]
    return float(np.mean(rec))


def export_onnx(model: nn.Module, loader) -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    out = MODEL_DIR / "crack_cls.onnx"
    model.eval()
    dummy = torch.zeros(1, 3, 224, 224)
    try:
        torch.onnx.export(model, dummy, out, input_names=["image"], output_names=["logits"],
                          dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}}, opset_version=17, dynamo=False)
    except Exception as e:  # 새 내보내기 방식으로 한 번 더
        print("기본 방식 실패, 새 방식으로 재시도:", repr(e)[:120])
        torch.onnx.export(model, dummy, out, input_names=["image"], output_names=["logits"], dynamo=True)
    (MODEL_DIR / "labels.json").write_text(json.dumps({"classes": CLASSES, "ko": KO, "mean": MEAN, "std": STD, "size": 224},
                                                      ensure_ascii=False, indent=1), encoding="utf-8")
    # 내보낸 모델이 원래 모델과 같은 답을 내는지 확인
    import onnxruntime as ort
    sess = ort.InferenceSession(str(out), providers=["CPUExecutionProvider"])
    x, _ = next(iter(loader))
    with torch.no_grad():
        ref = model(x).numpy()
    got = sess.run(None, {"image": x.numpy()})[0]
    return {"path": str(out), "size_mb": out.stat().st_size / 1e6, "max_abs_diff": float(np.abs(ref - got).max()),
            "same_top1": float((ref.argmax(1) == got.argmax(1)).mean())}


def write_eval(y, p, history, args, onnx_info, n_train) -> None:
    rep = classification_report(y, p, labels=range(len(CLASSES)), target_names=[KO[c] for c in CLASSES], digits=3, output_dict=True, zero_division=0)
    cm = confusion_matrix(y, p, labels=range(len(CLASSES)))
    L = ["# AI 분류 모델 평가 (시험 세트)", "",
         "`poc/train_crack_classifier.py` 결과. 숫자만 적은 문서이며 이미지·모델 파일은 올리지 않는다 (AI-Hub 약관).", "",
         f"- 모델: MobileNetV3-Small(ImageNet 사전학습) 미세조정, 입력 224x224, CPU 학습. 학습 조각 {n_train:,}개, 회차 {args.epochs}, 무작위 시드 {args.seed}",
         f"- 시험 조각 {len(y):,}개 (학습에 쓰지 않았고, 회차 고르기에도 쓰지 않음). 같은 시설물의 조각은 학습과 섞이지 않음",
         f"- 전체 정확도 {rep['accuracy']:.1%}, 클래스별 재현율 평균 {rep['macro avg']['recall']:.1%}, F1 평균 {rep['macro avg']['f1-score']:.3f}", "",
         "| 클래스 | 정밀도 | 재현율 | F1 | 시험 조각 수 |", "| --- | ---: | ---: | ---: | ---: |"]
    for c in CLASSES:
        r = rep[KO[c]]
        L.append(f"| {KO[c]} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1-score']:.3f} | {int(r['support']):,} |")
    L += ["", "혼동행렬 (행 = 실제, 열 = 예측)", "", "| 실제＼예측 | " + " | ".join(KO[c] for c in CLASSES) + " |", "| --- | " + " | ".join("---:" for _ in CLASSES) + " |"]
    for i, c in enumerate(CLASSES):
        L.append(f"| {KO[c]} | " + " | ".join(str(int(v)) for v in cm[i]) + " |")
    L += ["", "회차별 (학습 손실 / 검증 재현율 평균 / 걸린 시간)", ""]
    L += [f"- {h['epoch']}회차: {h['loss']:.3f} / {h['val_recall']:.3f} / {h['sec']:.0f}초" for h in history]
    if onnx_info:
        L += ["", f"ONNX 내보내기: {onnx_info['size_mb']:.1f}MB, 원래 모델과 로짓 최대 차이 {onnx_info['max_abs_diff']:.2e}, 1순위 일치율 {onnx_info['same_top1']:.0%}"]
    L += ["", "## 읽을 때 주의", "",
          "- 이 숫자는 AI-Hub 조각(드론 촬영이 많음) 안에서 잰 것이다. 주민이 스마트폰으로 찍은 성북구 사진에서는 낮아질 수 있어 직접 찍은 사진으로 따로 시험해야 한다",
          f"- 철근 노출은 시험 조각이 {int((y == CLASSES.index('rebar')).sum())}개뿐이라 재현율의 오차가 크다",
          "- 정상 조각은 라벨이 없는 영역에서 무작위로 잘랐으므로 라벨에 빠진 손상이 섞여 있을 수 있다"]
    EVAL_MD.write_text("\n".join(L) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--seed", type=int, default=20261025)
    ap.add_argument("--smoke", action="store_true", help="조각 일부로 1회차만 돌려 동작 확인 (결과 문서는 만들지 않음)")
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(os.cpu_count() or 4)

    train_tf = transforms.Compose([transforms.RandomResizedCrop(224, scale=(0.7, 1.0)), transforms.RandomHorizontalFlip(),
                                   transforms.RandomVerticalFlip(), transforms.ColorJitter(0.25, 0.25, 0.2),
                                   transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
    eval_tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
    lim = (384, 128, 128) if args.smoke else (None, None, None)
    if args.smoke:
        args.epochs = 1
    tr, va, te = Patches("train", train_tf, lim[0], args.seed), Patches("val", eval_tf, lim[1], args.seed), Patches("test", eval_tf, lim[2], args.seed)
    tl = DataLoader(tr, batch_size=args.batch, shuffle=True, num_workers=args.workers)
    vl = DataLoader(va, batch_size=128, num_workers=args.workers)
    el = DataLoader(te, batch_size=128, num_workers=args.workers)
    print(f"조각 train {len(tr):,} / val {len(va):,} / test {len(te):,}", flush=True)

    # 드문 클래스(철근 노출)를 더 크게 세는 가중치: 개수의 제곱근에 반비례
    cnt = np.bincount(tr.labels(), minlength=len(CLASSES)).clip(1)
    w = torch.tensor((cnt.max() / cnt) ** 0.5, dtype=torch.float32)
    print("클래스별 학습 조각 수", dict(zip([KO[c] for c in CLASSES], cnt.tolist())), "손실 가중치", [round(float(x), 2) for x in w], flush=True)

    model = build_model()
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.epochs * len(tl))
    loss_fn = nn.CrossEntropyLoss(weight=w)
    best, best_state, history = -1.0, None, []
    for ep in range(1, args.epochs + 1):
        t0, tot, n = time.time(), 0.0, 0
        model.train()
        for i, (x, y) in enumerate(tl):
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item() * len(y)
            n += len(y)
            if i % 20 == 0:
                print(f"  ep{ep} {i}/{len(tl)} loss {loss.item():.3f} ({time.time() - t0:.0f}초)", flush=True)
        yv, pv = predict(model, vl)
        mr = macro_recall(yv, pv)
        history.append({"epoch": ep, "loss": tot / n, "val_recall": mr, "sec": time.time() - t0})
        print(f"[{ep}/{args.epochs}] 손실 {tot / n:.3f} 검증 재현율 평균 {mr:.3f} ({time.time() - t0:.0f}초)", flush=True)
        if mr > best:
            best, best_state = mr, {k: v.clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    yt, pt = predict(model, el)
    print(f"시험 정확도 {(yt == pt).mean():.3f}, 재현율 평균 {macro_recall(yt, pt):.3f}", flush=True)
    info = export_onnx(model, el)
    print("ONNX:", info, flush=True)
    if not args.smoke:
        torch.save(best_state, MODEL_DIR / "crack_cls.pt")
        write_eval(yt, pt, history, args, info, len(tr))
        print("저장:", EVAL_MD, flush=True)


if __name__ == "__main__":
    main()
