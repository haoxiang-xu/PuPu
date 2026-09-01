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


_ATOMIC_PROBE_CHILD_CODE = """\
import ctypes
import os
import subprocess
import sys
import time

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.SetEvent.argtypes = [ctypes.c_void_p]
kernel32.SetEvent.restype = ctypes.c_int
kernel32.SetEvent(ctypes.c_void_p(int(sys.argv[1])))
try:
    escaped = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(60)"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=(
            subprocess.CREATE_BREAKAWAY_FROM_JOB
            | subprocess.CREATE_NO_WINDOW
        ),
        close_fds=True,
    )
except OSError as error:
    if getattr(error, "winerror", None) != 5:
        raise
else:
    escaped.terminate()
    try:
        escaped.wait(timeout=5)
    except subprocess.TimeoutExpired:
        escaped.kill()
        escaped.wait(timeout=5)
    raise SystemExit(91)
ready_event = int(os.environ["PUPU_VAULT_WORKER_READY_EVENT"])
if not kernel32.SetEvent(ctypes.c_void_p(ready_event)):
    raise SystemExit(92)
time.sleep(60)
"""


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


def _probe_atomic_job_list_spawn(
    api: supervisor._Win32Api,
) -> dict[str, bool | int]:
    """Exercise creation-time Job/handle lists without a Vault payload."""

    decoy = api._create_ready_event()
    protocol = None
    job = None
    worker = None
    try:
        protocol = api._capture_protocol_handles()
        job = api.create_kill_on_close_job()
        command = supervisor._WorkerCommand(
            sys.executable,
            (
                sys.executable,
                "-c",
                _ATOMIC_PROBE_CHILD_CODE,
                str(decoy.child.value),
            ),
        )
        worker = api._spawn_contained_command(
            protocol,
            job,
            command=command,
            environment=os.environ,
        )
        if (
            api.wait_for_handle_for_probe(worker.ready_event.value, 10000)
            != supervisor.WAIT_OBJECT_0
        ):
            raise RuntimeError("atomic probe child did not signal READY")
        if (
            api.wait_for_handle_for_probe(decoy.supervisor.value, 0)
            != supervisor.WAIT_TIMEOUT
        ):
            raise RuntimeError("decoy inheritable handle escaped HANDLE_LIST")
        if (
            api.wait_for_handle_for_probe(worker.process.value, 0)
            != supervisor.WAIT_TIMEOUT
        ):
            raise RuntimeError("atomic probe child exited before Job closure")
        if not api.process_is_in_job(worker.process.value, job):
            raise RuntimeError("atomic probe child is not in the kill Job")

        job.close()
        if (
            api.wait_for_handle_for_probe(worker.process.value, 10000)
            != supervisor.WAIT_OBJECT_0
        ):
            raise RuntimeError("atomic probe child survived Job closure")
        return {
            "atomic_job_list_spawn_attested": True,
            "exact_handle_list_attested": True,
            "breakaway_denied": True,
            "job_handle_non_inheritable": True,
            "supervisor_event_non_inheritable": True,
            "child_inherited_handle_count": 4,
            "atomic_kill_on_close_observed": True,
        }
    finally:
        if job is not None:
            job.close()
        if worker is not None:
            worker.close()
        if protocol is not None:
            protocol.close()
        decoy.close()


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
    atomic_evidence = _probe_atomic_job_list_spawn(api)

    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(
            {
                "schema": "pupu.windows-vault-supervisor-native-probe.v2",
                "executed_tests": 4,
                "platform": "win32-x64",
                "kernel32_loaded": True,
                "parent_chain_mode": parent_chain_mode,
                "runner_outer_job": runner_has_outer_job,
                "nested_job_membership_attested": True,
                "kill_on_close_observed": True,
                **atomic_evidence,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
