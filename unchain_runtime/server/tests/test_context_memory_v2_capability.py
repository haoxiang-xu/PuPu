from __future__ import annotations

import inspect

import context_memory_v2_capability as capability_gate


def test_runtime_admission_surface_has_no_sha_lock_or_dev_bypass_inputs() -> None:
    resolve_parameters = set(
        inspect.signature(
            capability_gate.resolve_context_memory_v2_capability
        ).parameters
    )
    verify_parameters = set(
        inspect.signature(
            capability_gate.verify_context_memory_v2_capability
        ).parameters
    )

    assert resolve_parameters == {"requested_mode"}
    assert verify_parameters == {
        "manifest",
        "requested_mode",
        "unchain_revision",
        "unchain_runtime_source",
    }
    for legacy_name in (
        "DEV_BYPASS_ENV",
        "DIRTY_ACTIVE_DEV_ENV",
        "load_unchain_core_lock",
        "_development_unchain_revision",
        "_load_packaged_context_memory_capability",
    ):
        assert not hasattr(capability_gate, legacy_name)


def test_runtime_loader_failure_is_a_stable_fail_closed_verdict(monkeypatch) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (None, "diagnostic-only", "/loaded/runtime_protocol.py"),
    )

    verdict = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all"
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_manifest_missing"
    assert verdict.verification == "failed"
    assert verdict.unchain_revision == "diagnostic-only"
    assert verdict.unchain_runtime_source == "/loaded/runtime_protocol.py"


def test_runtime_producer_exception_is_contained_as_missing(monkeypatch) -> None:
    class BrokenProducer:
        __file__ = "/broken/runtime_protocol.py"

        @staticmethod
        def runtime_protocol_manifest():
            raise RuntimeError("broken runtime producer")

    real_import = capability_gate.importlib.import_module
    monkeypatch.setattr(
        capability_gate.importlib,
        "import_module",
        lambda name: BrokenProducer()
        if name == "unchain.runtime.runtime_protocol"
        else real_import(name),
    )

    verdict = capability_gate.resolve_context_memory_v2_capability(
        requested_mode="all"
    )

    assert verdict.ready is False
    assert verdict.reason == "unchain_runtime_protocol_manifest_missing"


def test_verdict_keeps_a_digest_bound_snapshot_not_the_callers_mutable_dict() -> None:
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest

    manifest = runtime_protocol_manifest()
    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest,
        requested_mode="all",
    )
    original_digest = verdict.runtime_protocol_manifest["manifest_digest"]

    manifest["manifest_digest"] = "changed-after-verification"
    projected = capability_gate.context_memory_v2_capability_status(verdict)
    projected["runtime_protocol_manifest"]["manifest_digest"] = "caller-mutation"

    assert verdict.runtime_protocol_manifest["manifest_digest"] == original_digest


def test_invalid_requested_mode_is_rejected_before_loading_runtime(monkeypatch) -> None:
    def unexpected_load():
        raise AssertionError("invalid mode must not load a protocol")

    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        unexpected_load,
    )

    try:
        capability_gate.resolve_context_memory_v2_capability(
            requested_mode="floating"
        )
    except ValueError as exc:
        assert str(exc) == "requested_mode is invalid"
    else:  # pragma: no cover
        raise AssertionError("invalid mode was accepted")
