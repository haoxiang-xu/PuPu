from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = ROOT / "scripts" / "release-qa" / (
    "verify-windows-vault-supervisor-native-evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "verify_windows_vault_supervisor_native_evidence",
    VALIDATOR_PATH,
)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


def _evidence():
    return {
        "schema": "pupu.windows-vault-supervisor-native-probe.v3",
        "executed_tests": 4,
        "platform": "win32-x64",
        "kernel32_loaded": True,
        "parent_chain_mode": "dev",
        "runner_outer_job": True,
        "nested_job_membership_attested": True,
        "kill_on_close_observed": True,
        "atomic_job_list_spawn_attested": True,
        "exact_handle_list_attested": True,
        "breakaway_contained": True,
        "job_handle_non_inheritable": True,
        "supervisor_event_non_inheritable": True,
        "child_inherited_handle_count": 4,
        "atomic_kill_on_close_observed": True,
    }


def _canonical(value):
    return (
        json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode("utf-8")


def test_strict_validator_accepts_only_the_exact_v3_evidence():
    assert validator.validate_evidence_bytes(_canonical(_evidence())) == 4


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.pop("breakaway_contained"),
        lambda value: value.update({"extra": True}),
        lambda value: value.update(
            {"schema": "pupu.windows-vault-supervisor-native-probe.v1"}
        ),
        lambda value: value.update({"executed_tests": 3}),
        lambda value: value.update({"runner_outer_job": "true"}),
        lambda value: value.update({"atomic_job_list_spawn_attested": False}),
        lambda value: value.update({"child_inherited_handle_count": True}),
    ],
)
def test_strict_validator_rejects_shape_version_type_and_attestation_drift(mutate):
    value = _evidence()
    mutate(value)
    with pytest.raises(ValueError):
        validator.validate_evidence_bytes(_canonical(value))


def test_strict_validator_rejects_duplicate_and_noncanonical_json():
    canonical = _canonical(_evidence())
    duplicate = canonical.replace(
        b'{"atomic_job_list_spawn_attested":true,',
        b'{"atomic_job_list_spawn_attested":true,'
        b'"atomic_job_list_spawn_attested":true,',
        1,
    )
    with pytest.raises(ValueError):
        validator.validate_evidence_bytes(duplicate)

    with pytest.raises(ValueError):
        validator.validate_evidence_bytes(
            json.dumps(_evidence(), indent=2, sort_keys=True).encode("utf-8")
        )
