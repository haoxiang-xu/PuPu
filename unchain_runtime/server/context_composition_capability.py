"""Availability-only admission for Context Composition.

Unlike the Context/Memory V2 protocol gate, this module never decides whether
an ordinary chat request may run.  It only answers whether the actually
imported Unchain runtime exposes the two composition features and the official
bootstrap module required to attach private, content-free source facts.
"""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


_REQUIRED_FEATURES = {
    "context_memory": (1, "context_contribution_manifest_v1"),
    "run_bundle": (1, "context_composition_ref_v1"),
}


@dataclass(frozen=True, slots=True)
class ContextCompositionCapabilityVerdict:
    ready: bool
    reason: str
    bootstrap_module: Any = field(default=None, repr=False, compare=False)


def _unavailable() -> ContextCompositionCapabilityVerdict:
    return ContextCompositionCapabilityVerdict(
        ready=False,
        reason="capability_unavailable",
    )


def verify_context_composition_capability(
    *,
    manifest: object,
    bootstrap_module: Any,
) -> ContextCompositionCapabilityVerdict:
    """Validate one imported manifest without extending any global gate."""

    if bootstrap_module is None or not callable(
        getattr(bootstrap_module, "from_private_hint", None)
    ):
        return _unavailable()
    try:
        from unchain.runtime.runtime_protocol import RuntimeProtocolManifest

        normalized = RuntimeProtocolManifest.from_dict(manifest)
    except (ImportError, TypeError, ValueError, AttributeError):
        return _unavailable()
    protocols = {
        protocol.id: protocol
        for protocol in tuple(getattr(normalized, "protocols", ()) or ())
    }
    for protocol_id, (major, feature) in _REQUIRED_FEATURES.items():
        protocol = protocols.get(protocol_id)
        if (
            protocol is None
            or protocol.major != major
            or feature not in set(protocol.features)
        ):
            return _unavailable()
    return ContextCompositionCapabilityVerdict(
        ready=True,
        reason="available",
        bootstrap_module=bootstrap_module,
    )


def resolve_context_composition_capability() -> ContextCompositionCapabilityVerdict:
    """Resolve availability from the modules imported by this process."""

    try:
        protocol_module = importlib.import_module("unchain.runtime.runtime_protocol")
        producer = getattr(protocol_module, "runtime_protocol_manifest", None)
        if not callable(producer):
            return _unavailable()
        manifest = producer()
        agent_module = importlib.import_module("unchain.agent")
        bootstrap_module = getattr(
            agent_module,
            "ContextCompositionBootstrapModule",
            None,
        )
    except Exception:
        return _unavailable()
    if not isinstance(manifest, Mapping):
        return _unavailable()
    return verify_context_composition_capability(
        manifest=manifest,
        bootstrap_module=bootstrap_module,
    )


__all__ = (
    "ContextCompositionCapabilityVerdict",
    "resolve_context_composition_capability",
    "verify_context_composition_capability",
)
