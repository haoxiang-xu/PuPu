from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import replace
from pathlib import Path

import pytest

import context_memory_v2_capability as capability_gate


DIGEST_DOMAIN = b"unchain.runtime_protocol_manifest.v1\\u0000"


def _producer_manifest() -> dict[str, object]:
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest

    return runtime_protocol_manifest()


def _resign(value: dict[str, object]) -> dict[str, object]:
    resigned = copy.deepcopy(value)
    body = {
        "protocols": resigned["protocols"],
        "runtime": resigned["runtime"],
        "schema": resigned["schema"],
    }
    canonical = json.dumps(
        body,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    resigned["manifest_digest"] = "sha256:" + hashlib.sha256(
        DIGEST_DOMAIN + canonical
    ).hexdigest()
    return resigned


def _protocol(value: dict[str, object], protocol_id: str) -> dict[str, object]:
    return next(
        item for item in value["protocols"] if item["id"] == protocol_id
    )


class _StickyActiveAdmissionRuntime:
    _COMPLETE_RUNTIME_METHODS = frozenset(
        {
            "append_semantic_event",
            "load_events",
            "get_task_state",
            "list_pending_task_inputs",
            "mark_attempt_outcome",
            "record_checkpoint",
            "record_context_build",
            "record_artifact",
            "record_handoff",
            "create_candidate",
        }
    )

    def __init__(self, *, owner_chat_id: str, session_id: str) -> None:
        self.record = {
            "admission_id": "admission_sticky_active",
            "owner_chat_id": owner_chat_id,
            "first_session_id": session_id,
            "requested_rollout_mode": "all",
            "effective_rollout_mode": "all",
            "cohort": "rollout_all",
            "target_mode": "active",
            "effective_mode": "active",
            "decision_reason": "",
            "canary_selected": True,
            "canary_percent": 100,
            "canary_bucket": 0,
            "hash_strategy": "sha256_owner_v1",
            "bootstrap_status": "complete",
            "v2_bootstrapped": True,
            "bootstrap_error_code": "",
            "admission_provenance": {"source": "test"},
            "bootstrap_provenance": {"source": "test"},
            "revision": 2,
            "admitted_at_ms": 1,
            "bootstrapped_at_ms": 2,
            "sticky": True,
            "replayed": True,
        }

    def get_chat_admission(self, *, owner_chat_id: str):
        assert owner_chat_id == self.record["owner_chat_id"]
        return dict(self.record)

    def resolve_chat_admission(self, **_kwargs):
        raise AssertionError("global off must only read sticky admission")

    def mark_chat_bootstrap(self, **_kwargs):
        raise AssertionError("sticky admission must not bootstrap again")

    def __getattr__(self, name: str):
        if name in self._COMPLETE_RUNTIME_METHODS:
            return lambda **_kwargs: None
        raise AttributeError(name)


def test_v2_modes_accept_the_actual_loaded_runtime_protocol() -> None:
    manifest = _producer_manifest()

    for requested_mode in ("shadow", "canary", "all", "active"):
        verdict = capability_gate.verify_context_memory_v2_capability(
            manifest=manifest,
            requested_mode=requested_mode,
            unchain_revision="diagnostic-revision-a",
            unchain_runtime_source="/diagnostic/source-a/runtime_protocol.py",
        )

        assert verdict.ready is True
        assert verdict.reason == "unchain_runtime_protocol_compatible"
        assert verdict.verification == "runtime_protocol"
        assert verdict.immutable is True
        assert verdict.unchain_revision == "diagnostic-revision-a"
        assert verdict.unchain_runtime_source.endswith("runtime_protocol.py")
        status = capability_gate.context_memory_v2_capability_status(verdict)
        assert status["runtime_protocol_manifest"] == manifest
        assert status["runtime_protocol_ready"] is True


def test_revision_and_source_are_telemetry_only() -> None:
    manifest = _producer_manifest()

    first = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
        unchain_revision="revision-a",
        unchain_runtime_source="/checkout/a/runtime_protocol.py",
    )
    second = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
        unchain_revision="dirty floating ref with no fixed format",
        unchain_runtime_source="zip:/artifact-b/unchain/runtime_protocol.py",
    )

    assert (first.ready, first.reason, first.verification) == (
        second.ready,
        second.reason,
        second.verification,
    )
    assert first.unchain_revision != second.unchain_revision
    assert first.unchain_runtime_source != second.unchain_runtime_source


def test_off_mode_does_not_import_or_require_a_runtime_protocol(monkeypatch) -> None:
    def unexpected_load():
        raise AssertionError("off mode must not load the V2 runtime protocol")

    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        unexpected_load,
    )

    verdict = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="off"
    )

    assert capability_gate.context_memory_v2_capability_status(verdict) == {
        "runtime_protocol_ready": True,
        "runtime_protocol_reason": "protocol_not_required",
        "runtime_protocol_verification": "not_required",
        "runtime_protocol_immutable": False,
        "runtime_protocol_manifest": None,
        "unchain_revision": "",
        "unchain_runtime_source": "",
    }


@pytest.mark.parametrize(
    "manifest,reason",
    (
        (None, "unchain_runtime_protocol_manifest_missing"),
        ({}, "unchain_runtime_protocol_manifest_invalid"),
        (
            {**_producer_manifest(), "unexpected": True},
            "unchain_runtime_protocol_manifest_invalid",
        ),
        (
            {**_producer_manifest(), "manifest_digest": "sha256:" + "0" * 64},
            "unchain_runtime_protocol_manifest_invalid",
        ),
    ),
)
def test_missing_malformed_or_bad_digest_manifest_fails_closed(manifest, reason) -> None:
    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == reason
    assert verdict.verification == "failed"
    assert verdict.runtime_protocol_manifest is None


def test_non_object_producer_result_is_invalid_not_missing() -> None:
    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=[],
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_manifest_invalid"


def test_cross_language_unsafe_version_integer_is_invalid_even_when_resigned() -> None:
    manifest = _producer_manifest()
    _protocol(manifest, "run_bundle")["minor"] = 1 << 53
    manifest = _resign(manifest)

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_manifest_invalid"


@pytest.mark.parametrize("location", ("optional_protocol", "optional_feature"))
def test_lone_surrogate_is_a_manifest_invalid_verdict(location: str) -> None:
    manifest = _producer_manifest()
    if location == "optional_protocol":
        manifest["protocols"].append(
            {"features": [], "id": "\ud800", "major": 1, "minor": 0}
        )
    else:
        manifest["protocols"][0]["features"].append("\ud800")

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_manifest_invalid"
    assert verdict.runtime_protocol_manifest is None


def test_whitespace_bearing_nfc_optional_protocol_and_feature_are_preserved() -> None:
    manifest = _producer_manifest()
    manifest["protocols"].insert(
        0,
        {
            "features": [" optional_feature "],
            "id": " optional_protocol ",
            "major": 1,
            "minor": 0,
        },
    )
    manifest = _resign(manifest)

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is True
    assert verdict.runtime_protocol_manifest == manifest


def test_missing_protocol_wrong_major_low_minor_and_missing_feature_fail_closed(
    monkeypatch,
) -> None:
    manifest = _producer_manifest()

    missing_protocol = copy.deepcopy(manifest)
    missing_protocol["protocols"] = [
        item
        for item in missing_protocol["protocols"]
        if item["id"] != "run_bundle"
    ]
    missing_protocol = _resign(missing_protocol)

    wrong_major = copy.deepcopy(manifest)
    _protocol(wrong_major, "run_bundle")["major"] = 2
    wrong_major = _resign(wrong_major)

    missing_feature = copy.deepcopy(manifest)
    _protocol(missing_feature, "context_memory")["features"].remove(
        "interaction_resolution_compat"
    )
    missing_feature = _resign(missing_feature)

    requirements = tuple(capability_gate._REQUIRED_PROTOCOLS)
    monkeypatch.setattr(
        capability_gate,
        "_REQUIRED_PROTOCOLS",
        tuple(
            replace(item, minimum_minor=1)
            if item.id == "run_bundle"
            else item
            for item in requirements
        ),
    )
    low_minor = _producer_manifest()

    cases = (
        (missing_protocol, "unchain_runtime_protocol_required_protocol_missing"),
        (wrong_major, "unchain_runtime_protocol_major_mismatch"),
        (low_minor, "unchain_runtime_protocol_minor_too_low"),
        (missing_feature, "unchain_runtime_protocol_required_feature_missing"),
    )
    for candidate, reason in cases:
        verdict = capability_gate.verify_context_memory_v2_capability(
            manifest=candidate,
            requested_mode="all",
        )
        assert verdict.ready is False
        assert verdict.reason == reason


def test_required_incident_features_cannot_be_replaced_by_extra_features() -> None:
    manifest = _producer_manifest()
    context_memory = _protocol(manifest, "context_memory")
    context_memory["features"].remove("interaction_resolution_compat")
    context_memory["features"].append("zz_interaction_resolution_lookalike")
    durable = _protocol(manifest, "durable_interaction")
    durable["features"].remove("expected_interaction_id_cas")
    durable["features"].append("zz_expected_interaction_id_cas_v2")
    manifest = _resign(manifest)

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_required_feature_missing"


def test_chat_deletion_sqlite_scope_closure_feature_is_required() -> None:
    manifest = _producer_manifest()
    context_memory = _protocol(manifest, "context_memory")
    if "chat_deletion_sqlite_scope_closure" not in context_memory["features"]:
        context_memory["features"].append("chat_deletion_sqlite_scope_closure")
        context_memory["features"].sort(key=lambda item: item.encode("utf-8"))
    manifest = _resign(manifest)

    compatible = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )
    assert compatible.ready is True

    context_memory = _protocol(manifest, "context_memory")
    context_memory["features"].remove("chat_deletion_sqlite_scope_closure")
    manifest = _resign(manifest)
    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_required_feature_missing"


def test_higher_minor_extra_feature_and_extra_protocol_are_compatible() -> None:
    manifest = _producer_manifest()
    context_memory = _protocol(manifest, "context_memory")
    context_memory["minor"] = 7
    context_memory["features"].append("zz_optional_feature")
    manifest["protocols"].append(
        {
            "features": ["optional_feature"],
            "id": "zz_optional_protocol",
            "major": 3,
            "minor": 5,
        }
    )
    manifest = _resign(manifest)

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )

    assert verdict.ready is True
    assert verdict.reason == "unchain_runtime_protocol_compatible"


def test_resolver_reads_the_actual_imported_runtime_protocol_module() -> None:
    from unchain.runtime import runtime_protocol as producer

    verdict = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all"
    )

    assert verdict.ready is True
    assert verdict.runtime_protocol_manifest == producer.runtime_protocol_manifest()
    assert Path(verdict.unchain_runtime_source).resolve() == Path(
        producer.__file__
    ).resolve()


def test_incompatible_runtime_is_rejected_before_memory_v2_admission_effects(
    monkeypatch,
) -> None:
    import memory_v2_context

    monkeypatch.setenv("PUPU_FEATURE_MEMORY_V2", "all")
    monkeypatch.setenv("PUPU_MEMORY_V2_MODE", "all")
    monkeypatch.setenv("PUPU_MEMORY_V2_CANARY_PERCENT", "100")
    manifest = _producer_manifest()
    _protocol(manifest, "durable_interaction")["features"].remove(
        "expected_interaction_id_cas"
    )
    manifest = _resign(manifest)
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (manifest, "diagnostic", "/runtime_protocol.py"),
    )
    monkeypatch.setattr(
        memory_v2_context,
        "resolve_context_memory_v2_capability",
        capability_gate.resolve_context_memory_v2_capability,
    )
    monkeypatch.setattr(
        memory_v2_context,
        "_load_runtime",
        lambda _options: (_ for _ in ()).throw(
            AssertionError("runtime must not open before protocol admission")
        ),
    )

    with pytest.raises(
        memory_v2_context.MemoryV2ContextError,
        match="unchain_runtime_protocol_required_feature_missing",
    ):
        memory_v2_context.resolve_memory_v2_admission(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat_protocol_blocked",
                "_memory_v2_attempt_id": "attempt_protocol_blocked",
                "_memory_v2_runtime": object(),
            },
            provider="openai",
            model="gpt-test",
            real_context_window_tokens=200_000,
            session_id="session_protocol_blocked",
        )


def test_off_legacy_admission_remains_usable_without_loading_protocol(
    monkeypatch,
) -> None:
    import memory_v2_context

    monkeypatch.setenv("PUPU_FEATURE_MEMORY_V2", "off")
    monkeypatch.setenv("PUPU_MEMORY_V2_MODE", "off")
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (_ for _ in ()).throw(
            AssertionError("off admission must not load the V2 protocol")
        ),
    )
    monkeypatch.setattr(
        memory_v2_context,
        "resolve_context_memory_v2_capability",
        capability_gate.resolve_context_memory_v2_capability,
    )

    admission = memory_v2_context.resolve_memory_v2_admission(
        {},
        provider="openai",
        model="gpt-test",
        real_context_window_tokens=200_000,
        session_id="legacy_session",
    )

    assert admission.target_mode == "off"
    assert admission.runtime is None


@pytest.mark.parametrize("failure_kind", ("missing", "incident_feature_missing"))
def test_global_off_cannot_bypass_protocol_for_a_sticky_active_chat(
    monkeypatch,
    failure_kind: str,
) -> None:
    import memory_v2_context

    monkeypatch.setenv("PUPU_FEATURE_MEMORY_V2", "off")
    monkeypatch.setenv("PUPU_MEMORY_V2_MODE", "off")
    owner_chat_id = "chat_sticky_protocol_gate"
    session_id = "session_sticky_protocol_gate"
    runtime = _StickyActiveAdmissionRuntime(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
    )
    manifest = None
    if failure_kind == "incident_feature_missing":
        manifest = _producer_manifest()
        _protocol(manifest, "context_memory")["features"].remove(
            "interaction_resolution_compat"
        )
        manifest = _resign(manifest)
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (manifest, "diagnostic", "/runtime_protocol.py"),
    )
    monkeypatch.setattr(
        memory_v2_context,
        "resolve_context_memory_v2_capability",
        capability_gate.resolve_context_memory_v2_capability,
    )

    with pytest.raises(
        memory_v2_context.MemoryV2ContextError,
        match="unchain_runtime_protocol_",
    ):
        memory_v2_context.resolve_memory_v2_admission(
            {
                "_memory_v2_owner_chat_id": owner_chat_id,
                "_memory_v2_attempt_id": "attempt_sticky_protocol_gate",
                "_memory_v2_runtime": runtime,
            },
            provider="openai",
            model="gpt-test",
            real_context_window_tokens=200_000,
            session_id=session_id,
        )
