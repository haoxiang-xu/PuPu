"""Exercise the packaged Vault supervisor through its same-exe worker path.

This intentionally imports no sidecar source modules.  It is a Windows-only
release-QA producer: the provided onefile executable must create its own
``--vault-sink-worker`` child, emit the closed READY frame, reject a malformed
worker request, and drain its Job before exiting successfully.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import queue
import re
import struct
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, BinaryIO


_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_READY_BODY = b'{"containment":"win32_job_list_v1","kind":"ready","protocol":1}'
_WORKER_ERROR = {
    "error": {"code": "vault_worker_protocol_error"},
    "ok": False,
    "version": 1,
}
_MAX_FRAME_BYTES = 1024 * 1024
_TIMEOUT_SECONDS = 15


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_artifact_identity(path: Path) -> tuple[str, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        artifact_sha = value["artifact"]["sha256"]
        manifest_digest = value["runtime_manifest"]["manifest_digest"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("invalid immutable Unchain artifact evidence") from error
    if not all(isinstance(item, str) and _SHA256.fullmatch(item) for item in (artifact_sha, manifest_digest)):
        raise ValueError("invalid immutable Unchain artifact identity")
    return artifact_sha, manifest_digest


def _read_frame(stream: BinaryIO, timeout_seconds: int) -> bytes:
    result: queue.Queue[bytes | BaseException] = queue.Queue(maxsize=1)

    def read() -> None:
        try:
            header = stream.read(4)
            if len(header) != 4:
                raise ValueError("truncated framed response")
            size = struct.unpack(">I", header)[0]
            if not 1 <= size <= _MAX_FRAME_BYTES:
                raise ValueError("invalid framed response size")
            body = stream.read(size)
            if len(body) != size:
                raise ValueError("truncated framed response body")
            result.put(body)
        except BaseException as error:  # surfaced as a closed QA failure
            result.put(error)

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    try:
        value = result.get(timeout=timeout_seconds)
    except queue.Empty as error:
        raise ValueError("timed out waiting for framed supervisor output") from error
    if isinstance(value, BaseException):
        raise ValueError("invalid framed supervisor output") from value
    return value


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def run_probe(*, sidecar: Path, artifact_evidence: Path) -> dict[str, Any]:
    if os.name != "nt" or sys.platform != "win32":
        raise RuntimeError("packaged Vault supervisor probe requires win32-x64")
    if not sidecar.is_file() or sidecar.suffix.lower() != ".exe":
        raise ValueError("packaged Vault supervisor sidecar must be an .exe file")
    artifact_sha, manifest_digest = _read_artifact_identity(artifact_evidence)
    environment = dict(os.environ)
    environment.update(
        {
            "PUPU_VAULT_ELECTRON_PID": str(os.getpid()),
            "PYTHONPATH": "",
            "UNCHAIN_SOURCE_PATH": "",
        }
    )
    child = subprocess.Popen(
        [str(sidecar), "--vault-sink-supervisor"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    try:
        if child.stdin is None or child.stdout is None:
            raise RuntimeError("packaged Vault supervisor has no protocol pipes")
        ready = _read_frame(child.stdout, _TIMEOUT_SECONDS)
        if ready != _READY_BODY:
            raise ValueError("packaged Vault supervisor did not emit the closed READY frame")
        child.stdin.write(b"\0\0\0\0")
        child.stdin.flush()
        child.stdin.close()
        response = _read_frame(child.stdout, _TIMEOUT_SECONDS)
        if response != _canonical_bytes(_WORKER_ERROR):
            raise ValueError("packaged same-exe worker did not emit the closed protocol error")
        if child.wait(timeout=_TIMEOUT_SECONDS) != 0:
            raise RuntimeError("packaged Vault supervisor did not drain its Job successfully")
    except BaseException:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=_TIMEOUT_SECONDS)
        raise
    finally:
        if child.stderr is not None:
            child.stderr.close()
        if child.stdout is not None:
            child.stdout.close()
    return {
        "schema": "pupu.windows-packaged-vault-supervisor-probe.v1",
        "executed_tests": 3,
        "platform": "win32-x64",
        "artifact_sha256": artifact_sha,
        "runtime_manifest_digest": manifest_digest,
        "sidecar_sha256": _sha256(sidecar),
        "packaged_same_exe_ready": True,
        "strict_worker_protocol_error": True,
        "supervisor_job_tree_drained": True,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sidecar", required=True)
    parser.add_argument("--artifact-evidence", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    evidence = run_probe(
        sidecar=Path(args.sidecar).resolve(),
        artifact_evidence=Path(args.artifact_evidence).resolve(),
    )
    Path(args.out).write_bytes(_canonical_bytes(evidence) + b"\n")


if __name__ == "__main__":
    main()
