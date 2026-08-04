"""Exact-revision compatibility policy for the Context/Memory V2 core.

This module is additive and deliberately has no route or startup side effects.
The product host will mount it only after the final Unchain revision is locked.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any


CONTEXT_MEMORY_CONTRACT_VERSION = 1
DEV_BYPASS_ENV = "PUPU_MEMORY_V2_UNCHAIN_DEV_BYPASS"
_CAPABILITY_SCHEMA = "unchain.context_memory_capability.v1"
_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
_V2_MODES = frozenset({"shadow", "canary", "all", "active"})
_COMPONENTS = (
    "canonical_journal",
    "context_compiler",
    "artifact_handoff",
    "memory_workspace",
    "memory_toolkit",
    "memory_curator",
    "long_term_promotion",
)
_TRUE_VALUES = frozenset({"1", "true", "yes", "on", "enabled"})


class ContextMemoryV2CapabilityError(ValueError):
    """A trusted lock manifest is malformed or ambiguous."""


@dataclass(frozen=True, slots=True)
class ContextMemoryV2CapabilityVerdict:
    ready: bool
    reason: str
    verification: str
    immutable: bool
    unchain_revision: str = ""
    context_memory_contract: int = CONTEXT_MEMORY_CONTRACT_VERSION


def _is_revision(value: object) -> bool:
    return isinstance(value, str) and _REVISION_RE.fullmatch(value) is not None


def _validated_lock(value: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ContextMemoryV2CapabilityError("lock manifest must be an object")
    if set(value) != {"repository", "revision", "context_memory_contract"}:
        raise ContextMemoryV2CapabilityError("lock manifest fields are invalid")
    if value.get("repository") != "unchain":
        raise ContextMemoryV2CapabilityError("lock repository must be unchain")
    contract = value.get("context_memory_contract")
    if isinstance(contract, bool) or contract != CONTEXT_MEMORY_CONTRACT_VERSION:
        raise ContextMemoryV2CapabilityError("lock contract version is unsupported")
    revision = value.get("revision")
    if revision is not None and not _is_revision(revision):
        raise ContextMemoryV2CapabilityError(
            "lock revision must be null or a lowercase immutable commit SHA"
        )
    return {
        "repository": "unchain",
        "revision": revision,
        "context_memory_contract": CONTEXT_MEMORY_CONTRACT_VERSION,
    }


def load_unchain_core_lock(path: str | Path) -> dict[str, Any]:
    lock_path = Path(path)
    try:
        raw = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ContextMemoryV2CapabilityError("lock manifest is unreadable") from exc
    return _validated_lock(raw)


def _capability_error(capability: object) -> str | None:
    if not isinstance(capability, Mapping):
        return "unchain_context_memory_capability_missing"
    if set(capability) != {
        "schema",
        "revision",
        "context_memory_contract",
        "components",
    }:
        return "unchain_context_memory_capability_invalid"
    if capability.get("schema") != _CAPABILITY_SCHEMA:
        return "unchain_context_memory_capability_invalid"
    contract = capability.get("context_memory_contract")
    if isinstance(contract, bool) or contract != CONTEXT_MEMORY_CONTRACT_VERSION:
        return "unchain_context_memory_contract_mismatch"
    revision = capability.get("revision")
    if not _is_revision(revision):
        return "unchain_context_memory_capability_invalid"
    components = capability.get("components")
    if isinstance(components, (str, bytes, bytearray)) or not isinstance(
        components,
        Sequence,
    ):
        return "unchain_context_memory_capability_invalid"
    if tuple(components) != _COMPONENTS:
        return "unchain_context_memory_capability_invalid"
    return None


def verify_context_memory_v2_capability(
    *,
    capability: Mapping[str, Any] | None,
    lock: Mapping[str, Any],
    requested_mode: str,
    dev_bypass: bool = False,
    release: bool = False,
) -> ContextMemoryV2CapabilityVerdict:
    if requested_mode == "off":
        return ContextMemoryV2CapabilityVerdict(
            ready=True,
            reason="memory_v2_disabled",
            verification="not_required",
            immutable=False,
        )
    if requested_mode not in _V2_MODES:
        raise ValueError("requested_mode is invalid")
    if not isinstance(dev_bypass, bool) or not isinstance(release, bool):
        raise TypeError("dev_bypass and release must be booleans")
    normalized_lock = _validated_lock(lock)
    capability_error = _capability_error(capability)
    if capability_error is not None:
        return ContextMemoryV2CapabilityVerdict(
            ready=False,
            reason=capability_error,
            verification="failed",
            immutable=False,
        )

    revision = str(capability["revision"])
    locked_revision = normalized_lock["revision"]
    if locked_revision is None:
        if dev_bypass and release:
            return ContextMemoryV2CapabilityVerdict(
                ready=False,
                reason="unchain_dev_bypass_forbidden",
                verification="failed",
                immutable=False,
                unchain_revision=revision,
            )
        if not dev_bypass:
            return ContextMemoryV2CapabilityVerdict(
                ready=False,
                reason="unchain_lock_revision_missing",
                verification="failed",
                immutable=False,
                unchain_revision=revision,
            )
        return ContextMemoryV2CapabilityVerdict(
            ready=True,
            reason="unchain_context_memory_ready",
            verification="dev_bypass",
            immutable=False,
            unchain_revision=revision,
        )
    if revision != locked_revision:
        return ContextMemoryV2CapabilityVerdict(
            ready=False,
            reason="unchain_revision_mismatch",
            verification="failed",
            immutable=False,
            unchain_revision=revision,
        )
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_context_memory_ready",
        verification="exact_sha",
        immutable=True,
        unchain_revision=revision,
    )


def _default_lock_path() -> Path:
    frozen_root = getattr(sys, "_MEIPASS", "")
    if isinstance(frozen_root, str) and frozen_root:
        packaged = Path(frozen_root) / "resources" / "unchain-core.lock.json"
        if packaged.is_file():
            return packaged
    return Path(__file__).resolve().parents[1] / "unchain-core.lock.json"


def _dev_bypass_requested(environment: Mapping[str, Any]) -> bool:
    raw = environment.get(DEV_BYPASS_ENV)
    return str(raw or "").strip().lower() in _TRUE_VALUES


def _normalized_runtime_capability(value: object) -> dict[str, Any] | None:
    try:
        from unchain.runtime.context_memory_contract import ContextMemoryCapability

        if not isinstance(value, Mapping):
            return None
        return ContextMemoryCapability.from_dict(value).to_dict()
    except (ImportError, AttributeError, TypeError, ValueError):
        return None


def _load_packaged_context_memory_capability() -> dict[str, Any] | None:
    try:
        resource_package = __import__(
            "unchain.runtime.resources",
            fromlist=["__name__"],
        )
        resource = resources.files(resource_package).joinpath(
            "context_memory_capability.json"
        )
        raw = json.loads(resource.read_text(encoding="utf-8"))
    except (
        AttributeError,
        ImportError,
        ModuleNotFoundError,
        OSError,
        TypeError,
        json.JSONDecodeError,
    ):
        return None
    return _normalized_runtime_capability(raw)


def _development_unchain_revision(
    environment: Mapping[str, Any],
) -> tuple[str, bool]:
    source = str(environment.get("UNCHAIN_SOURCE_PATH") or "").strip()
    roots: list[Path] = []
    if source:
        candidate = Path(source).expanduser()
        roots.append(candidate.parent if candidate.name == "src" else candidate)
    try:
        import unchain

        module_path = Path(unchain.__file__).resolve()
        roots.extend(module_path.parents)
    except (ImportError, AttributeError, OSError, TypeError):
        pass
    seen: set[Path] = set()
    for root in roots:
        try:
            resolved = root.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if not (resolved / "src" / "unchain" / "__init__.py").is_file():
            continue
        try:
            completed = subprocess.run(
                ["git", "-C", str(resolved), "rev-parse", "--verify", "HEAD"],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        revision = str(completed.stdout or "").strip()
        if completed.returncode != 0 or not _is_revision(revision):
            continue
        try:
            dirty_probe = subprocess.run(
                [
                    "git",
                    "-C",
                    str(resolved),
                    "status",
                    "--porcelain",
                    "--untracked-files=normal",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=2,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if dirty_probe.returncode != 0:
            continue
        return revision, bool(str(dirty_probe.stdout or "").strip())
    return "", False


def _load_runtime_context_memory_capability(
    *,
    environment: Mapping[str, Any],
    release: bool,
) -> tuple[dict[str, Any] | None, bool]:
    packaged = _load_packaged_context_memory_capability()
    if packaged is not None or release:
        return packaged, False
    revision, checkout_dirty = _development_unchain_revision(environment)
    if not revision:
        return None, False
    try:
        from unchain.runtime.context_memory_contract import ContextMemoryCapability

        return ContextMemoryCapability(revision=revision).to_dict(), checkout_dirty
    except (ImportError, AttributeError, TypeError, ValueError):
        return None, False


def resolve_context_memory_v2_capability(
    *,
    requested_mode: str,
    environment: Mapping[str, Any] | None = None,
    release: bool | None = None,
    capability: Mapping[str, Any] | None = None,
    lock: Mapping[str, Any] | None = None,
    lock_path: str | Path | None = None,
) -> ContextMemoryV2CapabilityVerdict:
    """Resolve the host gate without allowing ambient production bypasses."""

    source = os.environ if environment is None else environment
    is_release = bool(getattr(sys, "frozen", False)) if release is None else release
    if not isinstance(is_release, bool):
        raise TypeError("release must be a boolean")
    try:
        resolved_lock = (
            _validated_lock(lock)
            if lock is not None
            else load_unchain_core_lock(lock_path or _default_lock_path())
        )
    except ContextMemoryV2CapabilityError:
        return ContextMemoryV2CapabilityVerdict(
            ready=False,
            reason="unchain_lock_unreadable",
            verification="failed",
            immutable=False,
        )
    dev_bypass = (
        requested_mode == "shadow"
        and not is_release
        and _dev_bypass_requested(source)
    )
    if capability is not None:
        resolved_capability = capability
        checkout_dirty = False
    else:
        resolved_capability, checkout_dirty = _load_runtime_context_memory_capability(
            environment=source,
            release=is_release,
        )
    if checkout_dirty and requested_mode != "off":
        revision = (
            str(resolved_capability.get("revision") or "")
            if isinstance(resolved_capability, Mapping)
            else ""
        )
        if not dev_bypass:
            return ContextMemoryV2CapabilityVerdict(
                ready=False,
                reason="unchain_checkout_dirty",
                verification="failed",
                immutable=False,
                unchain_revision=revision if _is_revision(revision) else "",
            )
        resolved_lock = {
            **resolved_lock,
            "revision": None,
        }
    return verify_context_memory_v2_capability(
        capability=resolved_capability,
        lock=resolved_lock,
        requested_mode=requested_mode,
        dev_bypass=dev_bypass,
        release=is_release,
    )


def context_memory_v2_capability_status(
    verdict: ContextMemoryV2CapabilityVerdict,
) -> dict[str, Any]:
    return {
        "context_memory_capability_ready": verdict.ready,
        "context_memory_capability_reason": verdict.reason,
        "context_memory_capability_verification": verdict.verification,
        "context_memory_capability_immutable": verdict.immutable,
        "unchain_revision": verdict.unchain_revision,
        "context_memory_contract": verdict.context_memory_contract,
    }


__all__ = (
    "CONTEXT_MEMORY_CONTRACT_VERSION",
    "DEV_BYPASS_ENV",
    "ContextMemoryV2CapabilityError",
    "ContextMemoryV2CapabilityVerdict",
    "context_memory_v2_capability_status",
    "load_unchain_core_lock",
    "resolve_context_memory_v2_capability",
    "verify_context_memory_v2_capability",
)
