"""사진 → 결함 유형·신뢰도·다른 후보·사유 (poc/test_vision.py를 서버용으로 옮긴 것).

- 공급자: config.vision_provider() — 키가 없으면 mock
- 프롬프트 원문: prompts/vision_v1.txt (발표 PDF 부록에 출처와 함께 싣기 위해 파일로 보관)
- 신뢰도는 모델이 스스로 적은 값이다. 정확도(재현율·정밀도)와 섞어 말하지 않는다.
- 학습한 모델을 붙일 때는 classify() 안에 provider 하나('model')를 추가하면 된다.
"""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

from . import config
from .constants import CATEGORIES

log = logging.getLogger(__name__)
PROMPT_VERSION = "vision_v1"
PROMPT = (Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.txt").read_text(encoding="utf-8")


def _conf(v) -> int:
    try:
        return max(0, min(100, int(round(float(v)))))
    except (TypeError, ValueError):
        return 0


def parse_result(text: str) -> dict:
    """모델 응답에서 JSON을 꺼내 허용값으로 보정. 보정했으면 fixed에 남기고 로그를 쓴다."""
    start = text.find("{")
    if start < 0:
        raise ValueError(f"JSON 없음: {text[:200]!r}")
    try:
        # 첫 번째 JSON 객체만 읽는다 (뒤에 설명 문장이 붙어도 무시)
        data, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError:
        log.warning("vision 응답 JSON 해석 실패 (잘렸거나 형식 오류): %r", text[:400])
        raise
    fixed = []
    cat = data.get("category")
    if cat not in CATEGORIES:
        fixed.append(f"category {cat!r} -> 기타")
        cat = "기타"
    alts: list[dict] = []
    for a in (data.get("alternatives") or [])[:2]:
        if (isinstance(a, dict) and a.get("category") in CATEGORIES and a["category"] != cat
                and a["category"] not in [x["category"] for x in alts]):
            alts.append({"category": a["category"], "confidence": _conf(a.get("confidence"))})
    out = {"category": cat, "confidence": _conf(data.get("confidence")),
           "alternatives": alts, "reason": str(data.get("reason", ""))}
    if fixed:
        out["fixed"] = fixed
        log.warning("vision 응답 보정: %s", fixed)
    return out


def _openai(jpeg: bytes) -> str:
    from openai import OpenAI
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    resp = OpenAI().chat.completions.create(
        model=config.OPENAI_VISION_MODEL, temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": url}}]}],
    )
    return resp.choices[0].message.content


def _anthropic(jpeg: bytes) -> str:
    import anthropic
    resp = anthropic.Anthropic().messages.create(
        model=config.ANTHROPIC_VISION_MODEL, max_tokens=1024,  # 한국어 사유가 길면 300에서 잘려 JSON이 깨질 수 있음 (10/26)
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.b64encode(jpeg).decode()}},
            {"type": "text", "text": PROMPT}]}],
    )
    # 응답 앞쪽에 text가 아닌 블록(예: thinking)이 올 수 있어 text 블록만 골라 합친다
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    if not text:
        raise ValueError(f"text 블록 없음: {[getattr(b, 'type', '?') for b in resp.content]}")
    if resp.stop_reason == "max_tokens":
        log.warning("vision 응답이 max_tokens에서 잘림")
    return text


def _mock(_jpeg: bytes) -> str:
    return json.dumps({"category": "콘크리트 균열", "confidence": 80,
                       "alternatives": [{"category": "박리", "confidence": 12},
                                        {"category": "백태/누수", "confidence": 5}],
                       "reason": "[MOCK] 키가 없어 고정 응답을 돌려줌"}, ensure_ascii=False)


PROVIDERS = {"openai": _openai, "anthropic": _anthropic, "mock": _mock}


def classify(jpeg: bytes) -> tuple[dict, str]:
    """(결과, 실제 사용한 공급자). 실제 호출이 실패하면 mock으로 대신하고 결과에 표시한다."""
    provider = config.vision_provider()
    try:
        result = parse_result(PROVIDERS[provider](jpeg))
    except Exception as e:  # noqa: BLE001  — 시연 중 화면이 멈추지 않게
        if provider == "mock":
            raise
        log.exception("vision 호출 실패, mock으로 대체")
        result, provider = parse_result(_mock(jpeg)), "mock"
        result["error"] = f"{type(e).__name__}: AI 호출 실패로 임시 결과"
    result["mock"] = provider == "mock"
    result["prompt_version"] = PROMPT_VERSION
    return result, provider
