from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = ROOT / "scripts" / "release-qa" / (
    "verify-windows-packaged-vault-supervisor-evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "verify_windows_packaged_vault_supervisor_evidence", VALIDATOR_PATH
)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def _evidence() -> dict[str, object]:
    return {
        "schema": "pupu.windows-packaged-vault-supervisor-probe.v1",
        "executed_tests": 3,
        "platform": "win32-x64",
        "artifact_sha256": "a" * 64,
        "runtime_manifest_digest": "b" * 64,
        "sidecar_sha256": "c" * 64,
        "packaged_same_exe_ready": True,
        "strict_worker_protocol_error": True,
        "supervisor_job_tree_drained": True,
    }


def _canonical(value: dict[str, object]) -> bytes:
    return (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")


def test_accepts_only_the_closed_canonical_packaged_supervisor_evidence():
    assert validator.validate_evidence_bytes(_canonical(_evidence())) == 3


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.pop("sidecar_sha256"),
        lambda value: value.update({"executed_tests": 0}),
        lambda value: value.update({"packaged_same_exe_ready": False}),
        lambda value: value.update({"sidecar_sha256": "not-a-sha"}),
    ],
)
def test_rejects_missing_or_non_attested_packaged_supervisor_evidence(mutate):
    value = _evidence()
    mutate(value)
    with pytest.raises(ValueError):
        validator.validate_evidence_bytes(_canonical(value))
