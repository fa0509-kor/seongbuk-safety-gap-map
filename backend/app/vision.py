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
MODERATION_VERSION = "moderation_v1"
MODERATION_PROMPT = (Path(__file__).parent / "prompts" / f"{MODERATION_VERSION}.txt").read_text(encoding="utf-8")


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


# ---- 같은 사진은 AI를 다시 부르지 않는다 -------------------------------------------------
# 체험용 사진처럼 같은 파일이 반복해서 올라오면 매번 몇 초씩 기다릴 필요가 없다. 서버 프로세스 안에서만 기억하고(재시작하면 비워짐),
# 실제 AI 결과만 저장한다(mock·실패로 대체된 결과는 저장하지 않는다). 공급자와 프롬프트 버전이 바뀌면 키가 달라져 새로 판별한다.
import hashlib
import threading
from collections import OrderedDict
from copy import deepcopy

_CACHE_MAX = 256
_cache: OrderedDict = OrderedDict()
_cache_lock = threading.Lock()


def classify_cached(jpeg: bytes) -> tuple[dict, str]:
    key = (config.vision_provider(), PROMPT_VERSION, hashlib.sha256(jpeg).hexdigest())
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
            return deepcopy(hit)
    result, provider = classify(jpeg)
    if not result.get("mock") and not result.get("error"):
        with _cache_lock:
            _cache[key] = deepcopy((result, provider))
            while len(_cache) > _CACHE_MAX:
                _cache.popitem(last=False)
    return result, provider

# ---- 공개 검수: 얼굴·번호판·부적절한 내용·점검과 상관없는 사진을 걸러낸다 -------------------------------
# 분류 프롬프트(vision_v1)는 건드리지 않고 별도 호출로 한다 (프롬프트를 바꾸면 분류 결과가 달라질 수 있음).
# AI가 놓칠 수 있어서 '모두 막는다'는 보장이 아니다. 판단하지 못하면(키 없음·호출 실패) ok=None으로 두고 공개 여부는 호출한 쪽이 정한다.
FLAG_LABELS = {"person": "사람 얼굴", "plate": "차량 번호판", "inappropriate": "부적절한 내용", "off_topic": "점검과 상관없는 사진"}


def parse_moderation(text: str) -> dict:
    start = text.find("{")
    if start < 0:
        raise ValueError(f"JSON 없음: {text[:200]!r}")
    data, _ = json.JSONDecoder().raw_decode(text[start:])
    flags = [k for k in FLAG_LABELS if data.get(k) is True]
    return {"checked": True, "ok": not flags, "flags": flags, "reason": str(data.get("reason", ""))[:200],
            "version": MODERATION_VERSION}


def _moderate_openai(jpeg: bytes) -> str:
    from openai import OpenAI
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    resp = OpenAI().chat.completions.create(
        model=config.OPENAI_VISION_MODEL, temperature=0, response_format={"type": "json_object"},
        messages=[{"role": "user", "content": [{"type": "text", "text": MODERATION_PROMPT},
                                               {"type": "image_url", "image_url": {"url": url}}]}])
    return resp.choices[0].message.content


def _moderate_anthropic(jpeg: bytes) -> str:
    import anthropic
    resp = anthropic.Anthropic().messages.create(
        model=config.ANTHROPIC_MODERATION_MODEL, max_tokens=300,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
            {"type": "text", "text": MODERATION_PROMPT}]}])
    return "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")


_MODERATORS = {"openai": _moderate_openai, "anthropic": _moderate_anthropic}
_mod_cache: OrderedDict = OrderedDict()


def moderate(jpeg: bytes) -> dict:
    """공개해도 되는 사진인지 AI로 확인. 항상 dict를 돌려준다 (예외를 던지지 않는다)."""
    provider = config.vision_provider()
    if provider not in _MODERATORS:
        return {"checked": False, "ok": None, "flags": [], "reason": "AI 키가 없어 검수하지 않음", "version": MODERATION_VERSION}
    key = (provider, MODERATION_VERSION, hashlib.sha256(jpeg).hexdigest())
    with _cache_lock:
        hit = _mod_cache.get(key)
        if hit is not None:
            _mod_cache.move_to_end(key)
            return deepcopy(hit)
    try:
        result = parse_moderation(_MODERATORS[provider](jpeg))
    except Exception:  # noqa: BLE001  — 검수가 실패해도 업로드는 막지 않는다
        log.exception("공개 검수 호출 실패")
        return {"checked": False, "ok": None, "flags": [], "reason": "검수 호출 실패", "version": MODERATION_VERSION}
    with _cache_lock:
        _mod_cache[key] = deepcopy(result)
        while len(_mod_cache) > _CACHE_MAX:
            _mod_cache.popitem(last=False)
    return result
