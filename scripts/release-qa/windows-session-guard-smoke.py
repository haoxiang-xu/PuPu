"""Exercise the exact Windows session-guard startup path used by the sidecar."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> None:
    data_dir = Path(os.environ["UNCHAIN_DATA_DIR"])
    server_root = Path(__file__).resolve().parents[2] / "unchain_runtime" / "server"
    if str(server_root) not in sys.path:
        sys.path.insert(0, str(server_root))
    from session_execution_guard import (
        SessionExecutionGuardRegistry,
        session_guard_migration_receipt,
    )

    expected_receipt = {
        "schema": "pupu.session-guard-migration",
        "version": 1,
        "status": "ready",
        "protocol_version": 1,
    }
    if session_guard_migration_receipt() != expected_receipt:
        raise RuntimeError("session guard migration receipt is not ready")
    marker = data_dir / "session_execution_guards" / "protocol.json"
    expected = {
        "schema": "pupu.session-execution-guard.protocol.v1",
        "protocol_version": 1,
        "compatibility": "exact",
    }
    if json.loads(marker.read_text(encoding="utf-8")) != expected:
        raise RuntimeError("session guard protocol marker is invalid")
    restarted = SessionExecutionGuardRegistry(data_dir)
    restarted.initialize_protocol()
    evidence_path = os.environ.get("SESSION_GUARD_SMOKE_EVIDENCE_PATH", "").strip()
    if evidence_path:
        path = Path(evidence_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "schema": "pupu.session-guard-startup-smoke.v1",
                    "executed_tests": 1,
                    "protocol_version": 1,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
