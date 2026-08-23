"""Single source of truth for Memory V2 process rollout configuration."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any, Mapping


FEATURE_ENV = "PUPU_FEATURE_MEMORY_V2"
MODE_ENV = "PUPU_MEMORY_V2_MODE"
CANARY_PERCENT_ENV = "PUPU_MEMORY_V2_CANARY_PERCENT"
READ_ONLY_DEGRADED_ENV = "PUPU_MEMORY_V2_READ_ONLY_DEGRADED"
ROLLOUT_SCHEMA_VERSION = "memory_v2.rollout.v1"
ROLLOUT_RANK = {"off": 0, "shadow": 1, "canary": 2, "all": 3}
_TRUE_VALUES = frozenset({"1", "true", "yes", "on", "enabled"})
_FALSE_VALUES = frozenset({"0", "false", "no", "off", "disabled"})


@dataclass(frozen=True)
class MemoryV2RolloutConfig:
    feature_ceiling: str
    configured_mode: str
    rollout_mode: str
    canary_percent: int
    read_only_degraded: bool
    valid: bool
    error_code: str
    fingerprint: str

    def status(self) -> dict[str, Any]:
        return {
            "feature_ceiling": self.feature_ceiling,
            "configured_mode": self.configured_mode,
            "rollout_mode": self.rollout_mode,
            "canary_percent": self.canary_percent,
            "read_only_degraded": self.read_only_degraded,
            "rollout_config_valid": self.valid,
            "rollout_config_error_code": self.error_code,
            "rollout_fingerprint": self.fingerprint,
        }


def normalize_rollout_mode(value: Any, default: str = "off") -> str:
    if isinstance(value, bool):
        return "all" if value else "off"
    normalized = str(value or "").strip().lower()
    if normalized == "active":
        return "all"
    if normalized in ROLLOUT_RANK:
        return normalized
    if normalized in _TRUE_VALUES:
        return "all"
    if normalized in _FALSE_VALUES:
        return "off"
    return default


def _mode_value(
    environment: Mapping[str, Any],
    key: str,
) -> tuple[str, bool]:
    raw = environment.get(key)
    if raw is None or str(raw).strip() == "":
        return "off", True
    normalized = normalize_rollout_mode(raw, "")
    return (normalized or "off"), bool(normalized)


def _canary_value(environment: Mapping[str, Any]) -> tuple[int, bool]:
    raw = environment.get(CANARY_PERCENT_ENV)
    if raw is None or str(raw).strip() == "":
        return 5, True
    try:
        parsed = int(raw)
    except (TypeError, ValueError, OverflowError):
        return 5, False
    if parsed < 0 or parsed > 100:
        return min(100, max(0, parsed)), False
    return parsed, True


def _boolean_value(
    environment: Mapping[str, Any],
    key: str,
) -> tuple[bool, bool]:
    raw = environment.get(key)
    if raw is None or str(raw).strip() == "":
        return False, True
    if isinstance(raw, bool):
        return raw, True
    normalized = str(raw).strip().lower()
    if normalized in _TRUE_VALUES:
        return True, True
    if normalized in _FALSE_VALUES:
        return False, True
    return False, False


def _fingerprint(
    *,
    feature_ceiling: str,
    configured_mode: str,
    rollout_mode: str,
    canary_percent: int,
    read_only_degraded: bool,
) -> str:
    payload = {
        "canary_percent": canary_percent,
        "configured_mode": configured_mode,
        "feature_ceiling": feature_ceiling,
        "read_only_degraded": read_only_degraded,
        "rollout_mode": rollout_mode,
        "schema_version": ROLLOUT_SCHEMA_VERSION,
    }
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def resolve_memory_v2_rollout(
    environment: Mapping[str, Any] | None = None,
) -> MemoryV2RolloutConfig:
    source = os.environ if environment is None else environment
    feature_ceiling, feature_valid = _mode_value(source, FEATURE_ENV)
    configured_mode, mode_valid = _mode_value(source, MODE_ENV)
    canary_percent, canary_valid = _canary_value(source)
    read_only_degraded, read_only_valid = _boolean_value(
        source,
        READ_ONLY_DEGRADED_ENV,
    )
    effective_rank = min(
        ROLLOUT_RANK[feature_ceiling],
        ROLLOUT_RANK[configured_mode],
    )
    rollout_mode = next(
        mode for mode, rank in ROLLOUT_RANK.items() if rank == effective_rank
    )
    valid = feature_valid and mode_valid and canary_valid and read_only_valid
    error_code = "" if valid else "memory_v2_rollout_config_invalid"
    if not valid:
        rollout_mode = "off"
    return MemoryV2RolloutConfig(
        feature_ceiling=feature_ceiling,
        configured_mode=configured_mode,
        rollout_mode=rollout_mode,
        canary_percent=canary_percent,
        read_only_degraded=read_only_degraded,
        valid=valid,
        error_code=error_code,
        fingerprint=_fingerprint(
            feature_ceiling=feature_ceiling,
            configured_mode=configured_mode,
            rollout_mode=rollout_mode,
            canary_percent=canary_percent,
            read_only_degraded=read_only_degraded,
        ),
    )


__all__ = [
    "CANARY_PERCENT_ENV",
    "FEATURE_ENV",
    "MODE_ENV",
    "READ_ONLY_DEGRADED_ENV",
    "ROLLOUT_RANK",
    "ROLLOUT_SCHEMA_VERSION",
    "MemoryV2RolloutConfig",
    "normalize_rollout_mode",
    "resolve_memory_v2_rollout",
]
