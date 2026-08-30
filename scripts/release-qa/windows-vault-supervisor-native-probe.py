"""Exercise the Vault supervisor's real Win32 parent and Job primitives."""

from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = ROOT / "unchain_runtime" / "server"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import vault_sink_job_supervisor as supervisor  # noqa: E402


def _stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _probe_empty_kill_on_close_job(api: supervisor._Win32Api) -> None:
    with api.create_kill_on_close_job():
        pass


def _probe_dev_parent_chain(api: supervisor._Win32Api) -> str:
    parent_pid = os.getppid()
    with api.open_verified_parent_chain(
        str(parent_pid),
        direct_parent_pid=parent_pid,
        supervisor_pid=os.getpid(),
    ) as chain:
        if chain.mode != "dev":
            raise RuntimeError("real Win32 parent-chain probe did not use dev mode")
        return chain.mode


def _probe_nested_job_membership_and_kill(
    api: supervisor._Win32Api,
) -> bool:
    with api.open_live_process(str(os.getpid())) as current_process:
        runner_has_outer_job = api.process_is_in_job(current_process.value, None)

    child = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
        close_fds=True,
    )
    outer_probe_job: supervisor._OwnedHandle | None = None
    kill_job: supervisor._OwnedHandle | None = None
    try:
        outer_probe_job = api.create_job()
        api.assign_existing_process_for_probe(child._handle, outer_probe_job)
        if not api.process_is_in_job(child._handle, outer_probe_job):
            raise RuntimeError("probe child is not a member of its outer probe Job")

        kill_job = api.create_kill_on_close_job()
        api.assign_existing_process_for_probe(child._handle, kill_job)
        if not api.process_is_in_job(child._handle, kill_job):
            raise RuntimeError("probe child is not a member of its nested kill Job")
        kill_job.close()
        child.wait(timeout=10)
        if child.returncode is None:
            raise RuntimeError("probe child survived kill-on-close Job closure")
    finally:
        if kill_job is not None:
            kill_job.close()
        if outer_probe_job is not None:
            outer_probe_job.close()
        _stop(child)
    return runner_has_outer_job


def main() -> None:
    if sys.platform != "win32":
        print("SKIP: Windows Vault supervisor native probe requires win32-x64")
        return
    if ctypes.sizeof(ctypes.c_void_p) != 8:
        raise RuntimeError("Windows Vault supervisor native probe requires x64")

    evidence_path = Path(
        os.environ["VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH"]
    )
    api = supervisor._Win32Api()
    _probe_empty_kill_on_close_job(api)
    parent_chain_mode = _probe_dev_parent_chain(api)
    runner_has_outer_job = _probe_nested_job_membership_and_kill(api)

    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(
            {
                "schema": "pupu.windows-vault-supervisor-native-probe.v1",
                "executed_tests": 3,
                "platform": "win32-x64",
                "kernel32_loaded": True,
                "parent_chain_mode": parent_chain_mode,
                "runner_outer_job": runner_has_outer_job,
                "nested_job_membership_attested": True,
                "kill_on_close_observed": True,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
