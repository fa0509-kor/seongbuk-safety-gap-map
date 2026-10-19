"""사진 1장 -> 결함 유형·신뢰도·다른 후보·사유 JSON 분류 (Vision LLM 1회 호출).

실행:
  python poc/test_vision.py 사진.jpg
  python poc/test_vision.py https://.../photo.jpg
  python poc/test_vision.py --mock            (키 없이 Mock 응답)
키 선택: OPENAI_API_KEY 있으면 OpenAI, 없고 ANTHROPIC_API_KEY 있으면 Anthropic, 둘 다 없으면 Mock.
모델은 환경변수로 교체: OPENAI_VISION_MODEL (기본 gpt-4o-mini), ANTHROPIC_VISION_MODEL (기본 claude-sonnet-5-5)
"""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import sys
from pathlib import Path

CATEGORIES = ["콘크리트 균열", "박리", "백태/누수", "철근 노출", "기타"]

PROMPT = f"""너는 지자체 시설물 안전 점검 보조 분류기다. 사진 한 장을 보고 아래 규칙대로만 답한다.

결함 유형은 다음 5개 중 정확히 하나: {CATEGORIES}
  콘크리트 균열 = 콘크리트·옹벽 표면의 갈라짐
  박리 = 표면이 떨어져 나간 상태
  백태/누수 = 흰 가루 또는 물 번짐·젖음 흔적
  철근 노출 = 속 철근이 드러난 상태
  기타 = 위 4개에 해당하지 않거나 시설물이 보이지 않는 경우(정상 포함)
confidence는 0~100 정수. 확신이 낮으면 낮게 적는다.
alternatives는 다른 후보 유형 최대 2개와 각 confidence.
reason은 사진에서 보이는 것만 근거로 한국어 한 문장.
긴급도나 위험 등급은 판단하지 않는다.

출력은 JSON 한 개뿐이다. 설명, 마크다운, 코드블록 금지.
{{"category": "...", "confidence": 0, "alternatives": [{{"category": "...", "confidence": 0}}], "reason": "..."}}"""


def load_image(src: str) -> tuple[str, str]:
    """(kind, value): kind='url'이면 URL, 'b64'면 'mime;base64데이터'."""
    if src.startswith(("http://", "https://")):
        return "url", src
    p = Path(src)
    mime = mimetypes.guess_type(p.name)[0] or "image/jpeg"
    return "b64", f"{mime};{base64.b64encode(p.read_bytes()).decode()}"


def _conf(v) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def parse_result(text: str) -> dict:
    """모델 응답에서 JSON을 꺼내 허용값으로 보정. 보정하면 _fixed에 기록."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError(f"JSON 없음: {text[:200]!r}")
    data = json.loads(m.group(0))
    fixed = []
    cat = data.get("category")
    if cat not in CATEGORIES:
        fixed.append(f"category {cat!r} -> 기타")
        cat = "기타"
    alts = []
    for a in (data.get("alternatives") or [])[:2]:
        if (isinstance(a, dict) and a.get("category") in CATEGORIES and a["category"] != cat
                and a["category"] not in [x["category"] for x in alts]):
            alts.append({"category": a["category"], "confidence": _conf(a.get("confidence"))})
    out = {"category": cat, "confidence": _conf(data.get("confidence")),
           "alternatives": alts, "reason": str(data.get("reason", ""))}
    if fixed:
        out["_fixed"] = fixed
    return out


def call_openai(kind: str, val: str) -> str:
    from openai import OpenAI
    url = val if kind == "url" else "data:" + val.replace(";", ";base64,", 1)
    resp = OpenAI().chat.completions.create(
        model=os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini"),
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": url}}]}],
    )
    return resp.choices[0].message.content


def call_anthropic(kind: str, val: str) -> str:
    import anthropic
    if kind == "url":
        source = {"type": "url", "url": val}
    else:
        mime, data = val.split(";", 1)
        source = {"type": "base64", "media_type": mime, "data": data}
    resp = anthropic.Anthropic().messages.create(
        model=os.getenv("ANTHROPIC_VISION_MODEL", "claude-sonnet-5-5"),
        max_tokens=300,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": source},
            {"type": "text", "text": PROMPT}]}],
    )
    return resp.content[0].text


def call_mock(_kind: str, _val: str) -> str:
    return json.dumps({"category": "콘크리트 균열", "confidence": 80,
                       "alternatives": [{"category": "박리", "confidence": 12},
                                        {"category": "백태/누수", "confidence": 5}],
                       "reason": "[MOCK] 옹벽 표면에 세로 방향 균열이 보임"}, ensure_ascii=False)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--mock"]
    force_mock = "--mock" in sys.argv[1:]

    if force_mock or not (os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")):
        provider, fn = "mock", call_mock
    elif os.getenv("OPENAI_API_KEY"):
        provider, fn = "openai", call_openai
    else:
        provider, fn = "anthropic", call_anthropic

    if provider != "mock" and not args:
        sys.exit("사진 경로 또는 URL이 필요함")
    kind, val = load_image(args[0]) if args else ("none", "")

    print(f"provider={provider}", file=sys.stderr)
    result = parse_result(fn(kind, val))
    if provider == "mock":
        result["_mock"] = True
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
