#!/usr/bin/env python3
"""Run the P6 privacy-delete matrix against an isolated real sidecar process.

The harness installs one supplied Unchain wheel into a temporary target, starts
the PuPu sidecar from the supplied source entrypoint, and keeps all Context V2
state in temporary directories. It never sends a request to the user's running
sidecar or reads the user's chat database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
from typing import Any
import urllib.error
import urllib.request


REPORT_SCHEMA = "pupu.p6.runtime-delete-matrix.v1"
DELETE_RECEIPT_SCHEMA = "pupu.context_v2_chat_deletion.v1"
DELETE_RECEIPT_VERSION = 1


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", required=True)
    parser.add_argument("--wheel", required=True)
    parser.add_argument("--server-entry", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    return parser.parse_args()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _allocate_loopback_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _delete_request(
    *,
    port: int,
    token: str,
    owner_chat_id: str,
    operation_id: str,
    authorized: bool = True,
) -> tuple[int, dict[str, Any]]:
    headers = {"content-type": "application/json"}
    if authorized:
        headers["x-unchain-auth"] = token
    body = json.dumps(
        {"operation_id": operation_id},
        separators=(",", ":"),
    ).encode("utf-8")
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/context/v2/chat/{owner_chat_id}",
        data=body,
        headers=headers,
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def _start_sidecar(
    *,
    python: Path,
    server_entry: Path,
    wheel_target: Path,
    data_dir: Path,
    owner: str,
    timeout_seconds: float,
) -> tuple[subprocess.Popen[str], int, str]:
    port = _allocate_loopback_port()
    token = "p6-runtime-matrix-token"
    environment = os.environ.copy()
    environment.pop("UNCHAIN_SOURCE_PATH", None)
    environment.update(
        {
            "PYTHONPATH": str(wheel_target),
            "UNCHAIN_HOST": "127.0.0.1",
            "UNCHAIN_PORT": str(port),
            "UNCHAIN_AUTH_TOKEN": token,
            "UNCHAIN_DATA_DIR": str(data_dir),
            "PUPU_CONTEXT_V2_STORE_OWNER": owner,
            "PUPU_FEATURE_MEMORY_V2": "off",
            "PUPU_MEMORY_V2_MODE": "off",
            "PUPU_MEMORY_V2_READ_ONLY_DEGRADED": "1",
        }
    )
    process = subprocess.Popen(
        [str(python), str(server_entry)],
        cwd=server_entry.parent,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            raise RuntimeError(
                "sidecar exited before the auth probe: " + output[-4096:]
            )
        try:
            status, _payload = _delete_request(
                port=port,
                token=token,
                owner_chat_id="probe_chat",
                operation_id="runtime_probe_0001",
                authorized=False,
            )
            if status == 401:
                return process, port, token
        except Exception as error:  # pragma: no cover - startup polling race
            last_error = error
        time.sleep(0.1)
    _stop_sidecar(process)
    raise RuntimeError(f"sidecar startup timed out: {last_error}")


def _stop_sidecar(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _wheel_identity(
    *, python: Path, wheel_target: Path, working_directory: Path
) -> dict[str, Any]:
    environment = os.environ.copy()
    environment.pop("UNCHAIN_SOURCE_PATH", None)
    environment["PYTHONPATH"] = str(wheel_target)
    output = subprocess.check_output(
        [
            str(python),
            "-c",
            (
                "import json,unchain; "
                "from unchain.runtime.runtime_protocol import "
                "runtime_protocol_manifest; "
                "print(json.dumps({'origin':unchain.__file__,"
                "'manifest':runtime_protocol_manifest()},sort_keys=True))"
            ),
        ],
        cwd=working_directory,
        env=environment,
        text=True,
    )
    identity = json.loads(output)
    if not isinstance(identity, dict):
        raise AssertionError("wheel identity must be an object")
    return identity


def _expected_receipt(
    *, owner_chat_id: str, outcome: str, replayed: bool
) -> dict[str, Any]:
    return {
        "schema": DELETE_RECEIPT_SCHEMA,
        "version": DELETE_RECEIPT_VERSION,
        "outcome": outcome,
        "deleted": True,
        "owner_chat_id": owner_chat_id,
        "replayed": replayed,
    }


def run_matrix(
    *,
    python: Path,
    wheel: Path,
    server_entry: Path,
    timeout_seconds: float,
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="pupu-p6-runtime-matrix-") as raw_temp:
        temp_root = Path(raw_temp)
        wheel_target = temp_root / "wheel-site"
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--no-deps",
                "--disable-pip-version-check",
                "--target",
                str(wheel_target),
                str(wheel),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        identity = _wheel_identity(
            python=python,
            wheel_target=wheel_target,
            working_directory=temp_root,
        )
        origin = str(identity.get("origin", ""))
        if str(wheel_target) not in origin:
            raise AssertionError("Unchain was not imported from the wheel target")
        manifest = identity.get("manifest")
        if not isinstance(manifest, dict):
            raise AssertionError("runtime protocol manifest is missing")
        manifest_digest = manifest.get("manifest_digest")
        if not isinstance(manifest_digest, str) or not manifest_digest.startswith(
            "sha256:"
        ):
            raise AssertionError("runtime protocol manifest digest is invalid")

        off_data = temp_root / "off-data"
        off_data.mkdir()
        off_receipts: list[tuple[int, dict[str, Any]]] = []
        for _attempt in range(2):
            process, port, token = _start_sidecar(
                python=python,
                server_entry=server_entry,
                wheel_target=wheel_target,
                data_dir=off_data,
                owner="off",
                timeout_seconds=timeout_seconds,
            )
            try:
                off_receipts.append(
                    _delete_request(
                        port=port,
                        token=token,
                        owner_chat_id="off_chat",
                        operation_id="delete_off_runtime_0001",
                    )
                )
            finally:
                _stop_sidecar(process)
        expected_off = _expected_receipt(
            owner_chat_id="off_chat",
            outcome="not_present",
            replayed=False,
        )
        if off_receipts != [(200, expected_off), (200, expected_off)]:
            raise AssertionError(f"off receipts are invalid: {off_receipts}")
        if (off_data / "memory_v2").exists():
            raise AssertionError("off + absent privacy delete wrote memory_v2 state")

        unchain_data = temp_root / "unchain-data"
        unchain_data.mkdir()
        process, port, token = _start_sidecar(
            python=python,
            server_entry=server_entry,
            wheel_target=wheel_target,
            data_dir=unchain_data,
            owner="unchain",
            timeout_seconds=timeout_seconds,
        )
        try:
            unauthenticated = _delete_request(
                port=port,
                token=token,
                owner_chat_id="unchain_chat",
                operation_id="delete_unchain_runtime_0001",
                authorized=False,
            )
            first = _delete_request(
                port=port,
                token=token,
                owner_chat_id="unchain_chat",
                operation_id="delete_unchain_runtime_0001",
            )
            replay_hot = _delete_request(
                port=port,
                token=token,
                owner_chat_id="unchain_chat",
                operation_id="delete_unchain_runtime_0001",
            )
        finally:
            _stop_sidecar(process)
        process, port, token = _start_sidecar(
            python=python,
            server_entry=server_entry,
            wheel_target=wheel_target,
            data_dir=unchain_data,
            owner="unchain",
            timeout_seconds=timeout_seconds,
        )
        try:
            replay_cold = _delete_request(
                port=port,
                token=token,
                owner_chat_id="unchain_chat",
                operation_id="delete_unchain_runtime_0001",
            )
        finally:
            _stop_sidecar(process)

        if unauthenticated[0] != 401:
            raise AssertionError("unauthenticated privacy delete was not rejected")
        expected_first = _expected_receipt(
            owner_chat_id="unchain_chat", outcome="deleted", replayed=False
        )
        expected_replay = _expected_receipt(
            owner_chat_id="unchain_chat", outcome="deleted", replayed=True
        )
        if first != (200, expected_first):
            raise AssertionError(f"first Unchain receipt is invalid: {first}")
        if replay_hot != (200, expected_replay):
            raise AssertionError(f"hot replay receipt is invalid: {replay_hot}")
        if replay_cold != (200, expected_replay):
            raise AssertionError(f"cold replay receipt is invalid: {replay_cold}")

        root = unchain_data / "memory_v2"
        database = root / "context_v2.sqlite3"
        marker = root / "context_v2.owner.json"
        if not database.is_file() or not marker.is_file():
            raise AssertionError("canonical database or owner marker is missing")
        marker_payload = json.loads(marker.read_text(encoding="utf-8"))
        if marker_payload.get("owner") != "unchain":
            raise AssertionError("owner marker is not Unchain")
        with sqlite3.connect(database) as connection:
            tables = {
                str(row[0])
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            versions = [
                int(row[0])
                for row in connection.execute(
                    "SELECT version FROM context_v2_schema ORDER BY version"
                )
            ]
            tombstones = connection.execute(
                "SELECT owner_chat_id, first_operation_id "
                "FROM chat_deletion_tombstones WHERE owner_chat_id=?",
                ("unchain_chat",),
            ).fetchall()
            operations = connection.execute(
                "SELECT owner_chat_id, operation_id "
                "FROM chat_deletion_operations WHERE owner_chat_id=?",
                ("unchain_chat",),
            ).fetchall()
        required_tables = {
            "context_v2_schema",
            "executions",
            "events",
            "operations",
            "objects",
            "artifacts",
            "chat_deletion_tombstones",
            "chat_deletion_operations",
        }
        if not required_tables.issubset(tables) or versions != [1, 2]:
            raise AssertionError("canonical Unchain schema is incomplete")
        expected_identity = [("unchain_chat", "delete_unchain_runtime_0001")]
        if tombstones != expected_identity or operations != expected_identity:
            raise AssertionError("durable deletion identity is invalid")

        return {
            "schema": REPORT_SCHEMA,
            "executed_tests": 9,
            "wheel_sha256": _sha256(wheel),
            "runtime_manifest_digest": manifest_digest,
            "runtime_origin_is_wheel_target": True,
            "checks": {
                "off_absent_first": "pass",
                "off_absent_cold_restart": "pass",
                "off_absent_zero_write": "pass",
                "unauthenticated_delete_rejected": "pass",
                "unchain_absent_bootstrap": "pass",
                "unchain_hot_replay": "pass",
                "unchain_cold_replay": "pass",
                "canonical_schema": "pass",
                "tombstone_identity": "pass",
            },
        }


def main() -> int:
    args = _parse_args()
    # Preserve a virtualenv launcher symlink. Resolving it selects the base
    # interpreter and silently drops the virtualenv's installed dependencies.
    python = Path(args.python).expanduser().absolute()
    wheel = Path(args.wheel).expanduser().resolve()
    server_entry = Path(args.server_entry).expanduser().resolve()
    output = Path(args.out).expanduser().resolve()
    if not python.is_file() or not os.access(python, os.X_OK):
        raise SystemExit("--python must be an executable file")
    if not wheel.is_file() or wheel.suffix != ".whl":
        raise SystemExit("--wheel must be a wheel file")
    if not server_entry.is_file():
        raise SystemExit("--server-entry must be a file")
    report = run_matrix(
        python=python,
        wheel=wheel,
        server_entry=server_entry,
        timeout_seconds=args.timeout_seconds,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        "[release-qa] P6 runtime delete matrix passed "
        f"({report['executed_tests']} checks)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
