"""computer_use_flag — the single source of truth for computer-use gates.

``PUPU_FEATURE_COMPUTER_USE`` is the release/build ceiling. It is read only from
the process environment, defaults off, and cannot be bypassed by a renderer or
runtime override. ``PUPU_COMPUTER_USE`` remains the user-desired state and may
be changed at runtime so a consented Settings toggle does not need to restart
the sidecar.

Effective state is therefore ``release flag AND user desired state``. The local
Ollama Beta is additionally gated by that same release ceiling. All entry points
(tool mounting, catalog exposure, status, model probing, and transcript media
sanitization) consume this module so they cannot drift apart.
"""

from __future__ import annotations

import os

# Env var + truthy vocabulary — kept identical to the pre-Gate-B private copies
# so behavior is unchanged when no runtime override is set. Follows the PUPU_*
# env convention (cf. PUPU_MCP_REGISTRY_PATH).
_COMPUTER_USE_FEATURE_FLAG = "PUPU_FEATURE_COMPUTER_USE"
_COMPUTER_USE_FLAG = "PUPU_COMPUTER_USE"
_LOCAL_BETA_FLAG = "PUPU_COMPUTER_USE_LOCAL_BETA"
_FLAG_TRUE_VALUES = {"1", "true", "yes", "on", "enabled"}

# Anthropic models that support the computer_20251124 tool + the
# computer-use-2025-11-24 beta. Prefix match tolerates date/@ suffixes. Older
# Anthropic models (Sonnet 4.5, Haiku 4.5, Opus 4.1, ...) need the OLD tool type
# + beta and would 400 on ours, so we do NOT mount the computer tool for them
# (generic-schema fallback is untested M3 work — deliberately not opened here).
# List is pupu-llm-expert authored (model-visible authority). It lives here in the
# gate leaf module — beside is_enabled() — so the adapter mount decision and the
# status route (GET /computer-use/status) read the SAME source. The route stays
# on this light module and never imports the heavy adapter for the list.
COMPUTER_USE_MODEL_PREFIXES = (
    "claude-sonnet-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-opus-4-5",
)

# The user-writable expected state, pushed in via POST /computer-use/config. None
# means "unset" — defer to the env default. A fresh/restarted process resets to
# None (fail-closed off until the renderer re-pushes its expected state).
_runtime_override: bool | None = None
_local_beta_runtime_override: bool | None = None


def _env_flag_enabled(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in _FLAG_TRUE_VALUES


def is_feature_available() -> bool:
    """True only when the non-runtime release/build flag is enabled."""
    return _env_flag_enabled(_COMPUTER_USE_FEATURE_FLAG)


def _desired_enabled() -> bool:
    if _runtime_override is not None:
        return _runtime_override
    return _env_flag_enabled(_COMPUTER_USE_FLAG)


def is_enabled() -> bool:
    """True when the release ceiling and the user-desired state are both on."""
    return is_feature_available() and _desired_enabled()


def set_runtime_override(value: bool | None) -> None:
    """Set (or clear with None) the runtime override.

    Accepts only a strict ``bool`` or ``None`` — never a truthy string/int, so a
    malformed request body can't silently flip the gate. Callers must validate
    and coerce before reaching here; the route layer does exactly that.
    """
    global _runtime_override
    if value is not None and not isinstance(value, bool):
        raise TypeError("computer-use override must be a bool or None")
    _runtime_override = value


def get_runtime_override() -> bool | None:
    """Return the current override (None if unset). For diagnostics/tests."""
    return _runtime_override


def is_local_beta_enabled() -> bool:
    """True only when Computer Use and the separate local Beta gate are available."""
    if not is_feature_available():
        return False
    if _local_beta_runtime_override is not None:
        return _local_beta_runtime_override
    return _env_flag_enabled(_LOCAL_BETA_FLAG)


def set_local_beta_runtime_override(value: bool | None) -> None:
    global _local_beta_runtime_override
    if value is not None and not isinstance(value, bool):
        raise TypeError("computer-use local beta override must be a bool or None")
    _local_beta_runtime_override = value


def get_local_beta_runtime_override() -> bool | None:
    return _local_beta_runtime_override
