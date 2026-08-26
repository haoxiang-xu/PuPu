from __future__ import annotations

import sys
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import context_composition_capability as capability  # noqa: E402
import context_memory_v2_capability as memory_capability  # noqa: E402
from unchain.runtime.runtime_protocol import (  # noqa: E402
    RuntimeProtocol,
    RuntimeProtocolManifest,
    build_runtime_protocol_manifest,
)


class _BootstrapModule:
    @classmethod
    def from_private_hint(cls, private_hint):
        return (cls, private_hint)


def _manifest_with_composition_features() -> dict:
    current = build_runtime_protocol_manifest()
    protocols = []
    for protocol in current.protocols:
        features = set(protocol.features)
        if protocol.id == "context_memory":
            features.add("context_contribution_manifest_v1")
        if protocol.id == "run_bundle":
            features.add("context_composition_ref_v1")
        protocols.append(
            RuntimeProtocol(
                id=protocol.id,
                major=protocol.major,
                minor=protocol.minor,
                features=tuple(sorted(features)),
            )
        )
    return RuntimeProtocolManifest.build(tuple(protocols)).to_dict()


def _manifest_without_run_bundle_composition_feature() -> dict:
    current = build_runtime_protocol_manifest()
    protocols = []
    for protocol in current.protocols:
        features = set(protocol.features)
        if protocol.id == "run_bundle":
            features.discard("context_composition_ref_v1")
        protocols.append(
            RuntimeProtocol(
                id=protocol.id,
                major=protocol.major,
                minor=protocol.minor,
                features=tuple(sorted(features)),
            )
        )
    return RuntimeProtocolManifest.build(tuple(protocols)).to_dict()


def _manifest_with_incompatible_context_major() -> dict:
    current = build_runtime_protocol_manifest()
    protocols = []
    for protocol in current.protocols:
        protocols.append(
            RuntimeProtocol(
                id=protocol.id,
                major=(2 if protocol.id == "context_memory" else protocol.major),
                minor=protocol.minor,
                features=protocol.features,
            )
        )
    return RuntimeProtocolManifest.build(tuple(protocols)).to_dict()


def test_availability_only_verifier_requires_both_exact_features() -> None:
    ready = capability.verify_context_composition_capability(
        manifest=_manifest_with_composition_features(),
        bootstrap_module=_BootstrapModule,
    )
    missing = capability.verify_context_composition_capability(
        manifest=_manifest_without_run_bundle_composition_feature(),
        bootstrap_module=_BootstrapModule,
    )

    assert ready.ready is True
    assert ready.bootstrap_module is _BootstrapModule
    assert missing.ready is False
    assert missing.reason == "capability_unavailable"


def test_invalid_manifest_or_missing_official_export_is_unavailable() -> None:
    invalid = _manifest_with_composition_features()
    invalid["manifest_digest"] = "sha256:" + ("0" * 64)

    assert (
        capability.verify_context_composition_capability(
            manifest=invalid,
            bootstrap_module=_BootstrapModule,
        ).ready
        is False
    )
    assert (
        capability.verify_context_composition_capability(
            manifest=_manifest_with_composition_features(),
            bootstrap_module=None,
        ).ready
        is False
    )
    assert (
        capability.verify_context_composition_capability(
            manifest=_manifest_with_incompatible_context_major(),
            bootstrap_module=_BootstrapModule,
        ).ready
        is False
    )


def test_composition_features_do_not_enter_global_context_v2_required_matrix() -> None:
    required = {
        (requirement.id, feature)
        for requirement in memory_capability._REQUIRED_PROTOCOLS
        for feature in requirement.features
    }

    assert (
        "context_memory",
        "context_contribution_manifest_v1",
    ) not in required
    assert ("run_bundle", "context_composition_ref_v1") not in required
