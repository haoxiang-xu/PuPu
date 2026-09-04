"""Strict consumer for packaged Windows Vault supervisor evidence."""

from __future__ import annotations

import json
import hashlib
import re
import sys
from pathlib import Path
from typing import Any


_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_EXACT_KEYS = frozenset(
    {
        "schema",
        "executed_tests",
        "platform",
        "artifact_sha256",
        "runtime_manifest_digest",
        "sidecar_sha256",
        "packaged_same_exe_ready",
        "strict_worker_protocol_error",
        "supervisor_job_tree_drained",
    }
)


def _closed_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate evidence key")
        value[key] = item
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _artifact_identity(path: Path) -> tuple[str, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        artifact_sha = value["artifact"]["sha256"]
        manifest_digest = value["runtime_manifest"]["manifest_digest"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("invalid immutable Unchain artifact evidence") from error
    if not all(isinstance(item, str) and _SHA256.fullmatch(item) for item in (artifact_sha, manifest_digest)):
        raise ValueError("invalid immutable Unchain artifact identity")
    return artifact_sha, manifest_digest


def validate_evidence_bytes(
    raw: bytes,
    *,
    expected_identity: tuple[str, str, str] | None = None,
) -> int:
    if not 1 <= len(raw) <= 4096:
        raise ValueError("invalid evidence size")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_closed_object)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid evidence encoding") from error
    if not isinstance(value, dict) or set(value) != _EXACT_KEYS:
        raise ValueError("invalid evidence keys")
    if value["schema"] != "pupu.windows-packaged-vault-supervisor-probe.v1":
        raise ValueError("invalid evidence schema")
    if value["executed_tests"] != 3 or type(value["executed_tests"]) is not int:
        raise ValueError("invalid executed test count")
    if value["platform"] != "win32-x64":
        raise ValueError("invalid platform")
    for field in ("artifact_sha256", "runtime_manifest_digest", "sidecar_sha256"):
        if not isinstance(value[field], str) or _SHA256.fullmatch(value[field]) is None:
            raise ValueError("invalid artifact identity")
    for field in ("packaged_same_exe_ready", "strict_worker_protocol_error", "supervisor_job_tree_drained"):
        if value[field] is not True:
            raise ValueError("missing packaged containment attestation")
    if expected_identity is not None and (
        value["artifact_sha256"],
        value["runtime_manifest_digest"],
        value["sidecar_sha256"],
    ) != expected_identity:
        raise ValueError("packaged evidence identity mismatch")
    canonical = (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
    if raw != canonical:
        raise ValueError("non-canonical evidence bytes")
    return 3


def main(argv: list[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("evidence")
    parser.add_argument("--sidecar", required=True)
    parser.add_argument("--artifact-evidence", required=True)
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    try:
        artifact_sha, manifest_digest = _artifact_identity(Path(args.artifact_evidence))
        count = validate_evidence_bytes(
            Path(args.evidence).read_bytes(),
            expected_identity=(artifact_sha, manifest_digest, _sha256(Path(args.sidecar))),
        )
    except (OSError, ValueError):
        raise SystemExit("invalid packaged Windows Vault supervisor evidence") from None
    print(count)


if __name__ == "__main__":
    main()
