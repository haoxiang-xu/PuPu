"""computer_use_flag — the single source of truth for the computer-use gate.

Gate B (2026-07-18) makes the ``PUPU_COMPUTER_USE`` feature flag writable at
runtime so a user toggle can enable/disable computer use without restarting the
sidecar. Before this module three private copies of ``_computer_use_enabled``
read the env directly (``unchain_adapter``, ``memory_factory``, and the status
route via an adapter import). Those are collapsed into thin delegates here so a
runtime flip is observed everywhere at once — critically including the session
store's screenshot sanitization, which is captured per-construction in
``memory_factory._build_session_store``. If that path diverged from the tool
gate, a user could enable computer use while transcript screenshots kept landing
in memory un-redacted.

Precedence: an explicit runtime override wins; otherwise the ``PUPU_COMPUTER_USE``
env var is the default (dev/boot seed). All fail-closed: a fresh process starts
with no override, so ``is_enabled()`` falls back to env, and env-unset = off.
"""

from __future__ import annotations

import os

# Env var + truthy vocabulary — kept identical to the pre-Gate-B private copies
# so behavior is unchanged when no runtime override is set. Follows the PUPU_*
# env convention (cf. PUPU_MCP_REGISTRY_PATH).
_COMPUTER_USE_FLAG = "PUPU_COMPUTER_USE"
_FLAG_TRUE_VALUES = {"1", "true", "yes", "on", "enabled"}

# The user-writable expected state, pushed in via POST /computer-use/config. None
# means "unset" — defer to the env default. A fresh/restarted process resets to
# None (fail-closed off until the renderer re-pushes its expected state).
_runtime_override: bool | None = None


def _env_enabled() -> bool:
    return os.environ.get(_COMPUTER_USE_FLAG, "").strip().lower() in _FLAG_TRUE_VALUES


def is_enabled() -> bool:
    """True if computer use is enabled, override taking precedence over env."""
    if _runtime_override is not None:
        return _runtime_override
    return _env_enabled()


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
