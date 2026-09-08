"""Strict consumer for retained Windows Vault supervisor native evidence."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


SCHEMA = "pupu.windows-vault-supervisor-native-probe.v3"
EXECUTED_TESTS = 4
MAX_EVIDENCE_BYTES = 4096
_EXACT_KEYS = frozenset(
    {
        "schema",
        "executed_tests",
        "platform",
        "kernel32_loaded",
        "parent_chain_mode",
        "runner_outer_job",
        "nested_job_membership_attested",
        "kill_on_close_observed",
        "atomic_job_list_spawn_attested",
        "exact_handle_list_attested",
        "breakaway_contained",
        "job_handle_non_inheritable",
        "supervisor_event_non_inheritable",
        "child_inherited_handle_count",
        "atomic_kill_on_close_observed",
    }
)
_TRUE_FIELDS = frozenset(
    {
        "kernel32_loaded",
        "nested_job_membership_attested",
        "kill_on_close_observed",
        "atomic_job_list_spawn_attested",
        "exact_handle_list_attested",
        "breakaway_contained",
        "job_handle_non_inheritable",
        "supervisor_event_non_inheritable",
        "atomic_kill_on_close_observed",
    }
)


def _closed_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate evidence key")
        value[key] = item
    return value


def validate_evidence(value: Any) -> int:
    if not isinstance(value, dict) or set(value) != _EXACT_KEYS:
        raise ValueError("invalid evidence keys")
    if value["schema"] != SCHEMA:
        raise ValueError("invalid evidence schema")
    if type(value["executed_tests"]) is not int or value["executed_tests"] != 4:
        raise ValueError("invalid executed test count")
    if value["platform"] != "win32-x64":
        raise ValueError("invalid evidence platform")
    if value["parent_chain_mode"] != "dev":
        raise ValueError("invalid parent-chain mode")
    if type(value["runner_outer_job"]) is not bool:
        raise ValueError("invalid outer Job attestation")
    for field in _TRUE_FIELDS:
        if value[field] is not True:
            raise ValueError("invalid Boolean attestation")
    if (
        type(value["child_inherited_handle_count"]) is not int
        or value["child_inherited_handle_count"] != 4
    ):
        raise ValueError("invalid inherited handle count")
    return EXECUTED_TESTS


def validate_evidence_bytes(raw: bytes) -> int:
    if not 1 <= len(raw) <= MAX_EVIDENCE_BYTES:
        raise ValueError("invalid evidence size")
    try:
        text = raw.decode("utf-8")
        value = json.loads(text, object_pairs_hook=_closed_object)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid evidence encoding") from error
    count = validate_evidence(value)
    canonical = (
        json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode("utf-8")
    if raw != canonical:
        raise ValueError("non-canonical evidence bytes")
    return count


def main(argv: list[str] | None = None) -> None:
    arguments = sys.argv[1:] if argv is None else argv
    if len(arguments) != 1:
        raise SystemExit(
            "usage: verify-windows-vault-supervisor-native-evidence.py EVIDENCE"
        )
    try:
        raw = Path(arguments[0]).read_bytes()
        count = validate_evidence_bytes(raw)
    except (OSError, ValueError):
        raise SystemExit("invalid Windows Vault supervisor native evidence") from None
    print(count)


if __name__ == "__main__":
    main()
