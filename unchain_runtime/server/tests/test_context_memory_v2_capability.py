from __future__ import annotations

import json
import sys
from types import SimpleNamespace

import pytest

import context_memory_v2_capability as capability_gate

from context_memory_v2_capability import (
    ContextMemoryV2CapabilityError,
    load_unchain_core_lock,
    verify_context_memory_v2_capability,
)


REVISION = "a" * 40
EXACT_CAPABILITY = {
    "schema": "unchain.context_memory_capability.v1",
    "revision": REVISION,
    "context_memory_contract": 1,
    "components": [
        "canonical_journal",
        "context_compiler",
        "artifact_handoff",
        "memory_workspace",
        "memory_toolkit",
        "memory_curator",
        "long_term_promotion",
    ],
}


def _lock(revision=REVISION):
    return {
        "repository": "unchain",
        "revision": revision,
        "context_memory_contract": 1,
    }


def test_off_mode_keeps_legacy_available_without_a_new_capability() -> None:
    verdict = verify_context_memory_v2_capability(
        capability=None,
        lock=_lock(),
        requested_mode="off",
    )

    assert verdict.ready is True
    assert verdict.reason == "memory_v2_disabled"
    assert verdict.verification == "not_required"


@pytest.mark.parametrize("requested_mode", ("shadow", "canary", "all", "active"))
def test_v2_modes_require_the_exact_contract_and_locked_revision(requested_mode) -> None:
    verdict = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(),
        requested_mode=requested_mode,
    )

    assert verdict.ready is True
    assert verdict.reason == "unchain_context_memory_ready"
    assert verdict.verification == "exact_sha"
    assert verdict.immutable is True
    assert verdict.unchain_revision == REVISION


@pytest.mark.parametrize(
    "capability,reason",
    (
        (None, "unchain_context_memory_capability_missing"),
        (
            {**EXACT_CAPABILITY, "context_memory_contract": 2},
            "unchain_context_memory_contract_mismatch",
        ),
        (
            {**EXACT_CAPABILITY, "revision": "b" * 40},
            "unchain_revision_mismatch",
        ),
    ),
)
def test_v2_modes_fail_closed_with_stable_reasons(capability, reason) -> None:
    verdict = verify_context_memory_v2_capability(
        capability=capability,
        lock=_lock(),
        requested_mode="shadow",
    )

    assert verdict.ready is False
    assert verdict.reason == reason


def test_null_lock_requires_explicit_non_release_dev_bypass() -> None:
    blocked = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="all",
    )
    allowed = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="all",
        dev_bypass=True,
    )
    release = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="all",
        dev_bypass=True,
        release=True,
    )

    assert blocked.reason == "unchain_lock_revision_missing"
    assert allowed.ready is True
    assert allowed.verification == "dev_bypass"
    assert allowed.immutable is False
    assert release.ready is False
    assert release.reason == "unchain_dev_bypass_forbidden"


def test_dev_bypass_never_bypasses_the_contract_probe() -> None:
    verdict = verify_context_memory_v2_capability(
        capability={**EXACT_CAPABILITY, "context_memory_contract": 2},
        lock=_lock(None),
        requested_mode="all",
        dev_bypass=True,
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_context_memory_contract_mismatch"


def test_dirty_active_dev_gate_never_bypasses_the_contract_probe() -> None:
    verdict = verify_context_memory_v2_capability(
        capability={**EXACT_CAPABILITY, "components": ["context_compiler"]},
        lock=_lock(None),
        requested_mode="all",
        dirty_active_dev=True,
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_context_memory_capability_invalid"


def test_dirty_active_dev_gate_is_non_release_all_only() -> None:
    allowed = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="all",
        dirty_active_dev=True,
        release=False,
    )
    shadow = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="shadow",
        dirty_active_dev=True,
        release=False,
    )
    release = verify_context_memory_v2_capability(
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
        requested_mode="all",
        dirty_active_dev=True,
        release=True,
    )

    assert allowed.ready is True
    assert allowed.verification == "dirty_dev_checkout"
    assert allowed.immutable is False
    assert shadow.ready is False
    assert shadow.reason == "unchain_dirty_active_dev_forbidden"
    assert release.ready is False
    assert release.reason == "unchain_dirty_active_dev_forbidden"


@pytest.mark.parametrize(
    "capability",
    (
        {**EXACT_CAPABILITY, "unexpected": True},
        {**EXACT_CAPABILITY, "components": ["context_compiler"]},
        {**EXACT_CAPABILITY, "revision": "main"},
    ),
)
def test_capability_probe_rejects_ambiguous_or_floating_records(capability) -> None:
    verdict = verify_context_memory_v2_capability(
        capability=capability,
        lock=_lock(None),
        requested_mode="all",
        dev_bypass=True,
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_context_memory_capability_invalid"


def test_lock_manifest_loader_rejects_ambiguous_or_floating_values(tmp_path) -> None:
    path = tmp_path / "unchain-core.lock.json"
    path.write_text(json.dumps(_lock()), encoding="utf-8")
    assert load_unchain_core_lock(path) == _lock()

    path.write_text(json.dumps({**_lock(), "repository": "fork"}), encoding="utf-8")
    with pytest.raises(ContextMemoryV2CapabilityError, match="repository"):
        load_unchain_core_lock(path)

    path.write_text(json.dumps(_lock("main")), encoding="utf-8")
    with pytest.raises(ContextMemoryV2CapabilityError, match="revision"):
        load_unchain_core_lock(path)


def test_host_gate_allows_only_explicit_development_shadow_bypass() -> None:
    environment = {"PUPU_MEMORY_V2_UNCHAIN_DEV_BYPASS": "1"}

    shadow = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="shadow",
        environment=environment,
        release=False,
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
    )
    canary = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="canary",
        environment=environment,
        release=False,
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
    )
    production_shadow = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="shadow",
        environment=environment,
        release=True,
        capability=EXACT_CAPABILITY,
        lock=_lock(None),
    )

    assert shadow.ready is True
    assert shadow.verification == "dev_bypass"
    assert canary.ready is False
    assert canary.reason == "unchain_lock_revision_missing"
    assert production_shadow.ready is False
    assert production_shadow.reason == "unchain_lock_revision_missing"


def test_host_gate_projects_one_auditable_status_shape() -> None:
    verdict = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={},
        release=True,
        capability=EXACT_CAPABILITY,
        lock=_lock(),
    )

    assert capability_gate.context_memory_v2_capability_status(verdict) == {
        "context_memory_capability_ready": True,
        "context_memory_capability_reason": "unchain_context_memory_ready",
        "context_memory_capability_verification": "exact_sha",
        "context_memory_capability_immutable": True,
        "unchain_revision": REVISION,
        "context_memory_contract": 1,
    }


def test_host_gate_probes_the_live_unchain_contract_when_not_injected(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_packaged_context_memory_capability",
        lambda: None,
    )
    monkeypatch.setattr(
        capability_gate,
        "_development_unchain_revision",
        lambda _environment: (REVISION, False),
    )

    development = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={},
        release=False,
        lock=_lock(),
    )
    production = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={},
        release=True,
        lock=_lock(),
    )

    assert development.ready is True
    assert development.verification == "exact_sha"
    assert production.ready is False
    assert production.reason == "unchain_context_memory_capability_missing"


def test_dirty_development_checkout_requires_the_mode_specific_explicit_gate(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_runtime_context_memory_capability",
        lambda **_kwargs: (EXACT_CAPABILITY, True),
    )
    environment = {"PUPU_MEMORY_V2_UNCHAIN_DEV_BYPASS": "true"}

    shadow = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="shadow",
        environment=environment,
        release=False,
        lock=_lock(),
    )
    canary = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="canary",
        environment=environment,
        release=False,
        lock=_lock(),
    )
    active_without_gate = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment=environment,
        release=False,
        lock=_lock(),
    )
    active_with_truthy_alias = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={
            "PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV": "true",
        },
        release=False,
        lock=_lock(),
    )
    active = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={
            "PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV": "1",
        },
        release=False,
        lock=_lock(),
    )
    packaged = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all",
        environment={
            "PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV": "1",
        },
        release=True,
        lock=_lock(),
    )

    assert shadow.ready is True
    assert shadow.verification == "dev_bypass"
    assert shadow.immutable is False
    assert canary.ready is False
    assert canary.reason == "unchain_checkout_dirty"
    assert active_without_gate.ready is False
    assert active_without_gate.reason == "unchain_checkout_dirty"
    assert active_with_truthy_alias.ready is False
    assert active_with_truthy_alias.reason == "unchain_checkout_dirty"
    assert active.ready is True
    assert active.verification == "dirty_dev_checkout"
    assert active.immutable is False
    assert packaged.ready is False
    assert packaged.reason == "unchain_checkout_dirty"


def test_packaged_probe_treats_an_uninspectable_runtime_package_as_missing(
    monkeypatch,
) -> None:
    monkeypatch.setitem(
        sys.modules,
        "unchain.runtime.resources",
        SimpleNamespace(),
    )

    assert capability_gate._load_packaged_context_memory_capability() is None
