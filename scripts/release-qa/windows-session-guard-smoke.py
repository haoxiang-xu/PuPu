"""Exercise the real sidecar startup path that publishes the guard receipt."""

from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


_STARTUP_TIMEOUT_SECONDS = 60
_EXPECTED_RECEIPT = {
    "schema": "pupu.session-guard-migration",
    "version": 1,
    "status": "ready",
    "protocol_version": 1,
}
_EXPECTED_MARKER = {
    "schema": "pupu.session-execution-guard.protocol.v1",
    "protocol_version": 1,
    "compatibility": "exact",
}


def _available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _wait_for_ready_health(
    process: subprocess.Popen[bytes],
    *,
    port: int,
    auth_token: str,
) -> None:
    deadline = time.monotonic() + _STARTUP_TIMEOUT_SECONDS
    last_receipt_status = "unreachable"
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/health",
        headers={"x-unchain-auth": auth_token},
    )
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("sidecar exited before authenticated health became ready")
        try:
            with urllib.request.urlopen(request, timeout=1) as response:
                if response.status != 200:
                    last_receipt_status = f"http_{response.status}"
                    time.sleep(0.1)
                    continue
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("status") != "ok":
                last_receipt_status = "health_not_ready"
            else:
                receipt = payload.get("session_guard_migration")
                if isinstance(receipt, dict):
                    last_receipt_status = str(receipt.get("status") or "invalid")
                else:
                    last_receipt_status = "invalid"
                if receipt == _EXPECTED_RECEIPT:
                    return
        except (OSError, ValueError, urllib.error.URLError):
            last_receipt_status = "unreachable"
        time.sleep(0.1)
    raise RuntimeError(
        "sidecar authenticated health did not become ready "
        f"(last_receipt_status={last_receipt_status})"
    )


def _stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> None:
    data_dir = Path(os.environ["UNCHAIN_DATA_DIR"])
    server_root = Path(__file__).resolve().parents[2] / "unchain_runtime" / "server"
    port = _available_port()
    auth_token = secrets.token_urlsafe(32)
    environment = os.environ.copy()
    environment.update(
        {
            "UNCHAIN_HOST": "127.0.0.1",
            "UNCHAIN_PORT": str(port),
            "UNCHAIN_AUTH_TOKEN": auth_token,
            "UNCHAIN_DATA_DIR": str(data_dir),
            "UNCHAIN_PARENT_PID": str(os.getpid()),
            "UNCHAIN_VERSION": "session-guard-smoke",
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }
    )
    process = subprocess.Popen(
        [sys.executable, str(server_root / "main.py")],
        cwd=server_root,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_ready_health(process, port=port, auth_token=auth_token)
    finally:
        _stop(process)

    marker = data_dir / "session_execution_guards" / "protocol.json"
    if json.loads(marker.read_text(encoding="utf-8")) != _EXPECTED_MARKER:
        raise RuntimeError("session guard protocol marker is invalid")

    if str(server_root) not in sys.path:
        sys.path.insert(0, str(server_root))
    from session_execution_guard import SessionExecutionGuardRegistry

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
                    "startup_entrypoint": "main.py",
                },
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
