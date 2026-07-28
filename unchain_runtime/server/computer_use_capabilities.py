"""Provider/model routing for the unified Computer toolkit.

This leaf module is the single backend authority for choosing a Computer wire
protocol.  It never falls back between providers: an unsupported or disabled
route is returned as unsupported and the toolkit is not mounted.
"""

from __future__ import annotations

import os
from typing import Any, Dict

from computer_use_flag import (
    COMPUTER_USE_MODEL_PREFIXES,
    is_local_beta_enabled,
)

ANTHROPIC_PROTOCOL = "anthropic.computer_20251124"
OPENAI_PROTOCOL = "openai.responses.computer.v1"
LOCAL_PROTOCOL = "pupu.local.click3.v1"

OPENAI_COMPUTER_MODEL_PREFIXES = ("gpt-5.6",)
LOCAL_COMPUTER_MODEL_PREFIXES = (
    "qwen3.5:4b",
    "llama3.2-vision:11b",
)

_PROVIDER_KILL_SWITCHES = {
    "anthropic": "PUPU_COMPUTER_USE_ANTHROPIC",
    "openai": "PUPU_COMPUTER_USE_OPENAI",
    "ollama": "PUPU_COMPUTER_USE_LOCAL",
}
_FALSE_VALUES = {"0", "false", "no", "off", "disabled"}


def _provider_enabled(provider: str) -> bool:
    env_name = _PROVIDER_KILL_SWITCHES.get(provider)
    if not env_name:
        return False
    return os.environ.get(env_name, "").strip().lower() not in _FALSE_VALUES


def _matches_prefix(model: str, prefixes: tuple[str, ...]) -> bool:
    normalized = str(model or "").strip().lower()
    return any(normalized.startswith(prefix) for prefix in prefixes)


def _unsupported(reason: str = "unsupported_model") -> Dict[str, Any]:
    return {
        "supported": False,
        "mode": "unsupported",
        "protocol": "",
        "stability": "stable",
        "reason": reason,
    }


def resolve_computer_use_capability(provider: str, model: str) -> Dict[str, Any]:
    """Return the strict Computer route for one provider/model pair."""
    normalized_provider = str(provider or "").strip().lower()
    normalized_model = str(model or "").strip().lower()
    if not _provider_enabled(normalized_provider):
        return _unsupported("provider_disabled")

    if normalized_provider == "anthropic":
        if not _matches_prefix(normalized_model, COMPUTER_USE_MODEL_PREFIXES):
            return _unsupported()
        return {
            "supported": True,
            "mode": "native",
            "protocol": ANTHROPIC_PROTOCOL,
            "stability": "stable",
            "reason": "",
        }

    if normalized_provider == "openai":
        if not _matches_prefix(normalized_model, OPENAI_COMPUTER_MODEL_PREFIXES):
            return _unsupported()
        return {
            "supported": True,
            "mode": "native",
            "protocol": OPENAI_PROTOCOL,
            "stability": "stable",
            "reason": "",
        }

    if normalized_provider == "ollama":
        if not _matches_prefix(normalized_model, LOCAL_COMPUTER_MODEL_PREFIXES):
            return _unsupported()
        candidate = {
            "supported": False,
            "mode": "local_beta",
            "protocol": LOCAL_PROTOCOL,
            "stability": "beta",
            "reason": "local_beta_disabled",
        }
        if not is_local_beta_enabled():
            return candidate
        try:
            from computer_use_probe import get_cached_probe

            probe = get_cached_probe(normalized_model)
        except Exception:
            probe = None
        if not probe or probe.get("supported") is not True:
            candidate["reason"] = (
                str((probe or {}).get("reason") or "probe_required")
            )
            return candidate
        candidate["supported"] = True
        candidate["reason"] = ""
        candidate["probe"] = {
            key: probe.get(key)
            for key in ("model", "digest", "checked_at", "expires_at")
            if probe.get(key) is not None
        }
        return candidate

    return _unsupported("unsupported_provider")


def model_supports_computer_use(provider: str, model: str) -> bool:
    return resolve_computer_use_capability(provider, model)["supported"] is True

