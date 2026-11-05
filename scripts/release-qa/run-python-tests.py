#!/usr/bin/env python3
"""Run pytest in a child process with a GIL-held, observable timeout dump."""

from __future__ import annotations

import json
import math
import os
import selectors
import signal
import subprocess
import sys
import time


DIAGNOSTIC_SECONDS = 60.0
EXECUTION_LIMIT_SECONDS = 3000.0
TEST_HARD_LIMIT_ENV = "PUPU_PYTEST_SELFTEST_TIMEOUT_SECONDS"
TEST_MODE_ENV = "PUPU_PYTEST_SELFTEST"


CHILD_BOOTSTRAP = r'''
import faulthandler, json, math, os, runpy, sys, threading, time

fd = int(os.environ.pop("PUPU_PYTEST_DIAGNOSTIC_FD"))
os.set_inheritable(fd, False)
original_dump = faulthandler.dump_traceback
generation = 0
state_lock = threading.Lock()
active = None
timer_threads = []

def emit(event, **fields):
    row = {"event": event, "pid": os.getpid(), "monotonic_ns": time.monotonic_ns(), **fields}
    payload = (json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n").encode()
    try:
        view = memoryview(payload)
        while view:
            view = view[os.write(fd, view):]
    except OSError as exc:
        raise RuntimeError("pytest diagnostic control pipe write failed") from exc

def cancel_dump_traceback_later():
    global active
    requested_ns = time.monotonic_ns()
    with state_lock:
        current = active
        if current is None:
            return
        active = None
        current["cancel"].set()
    # Joining outside state_lock avoids deadlock with the timer's finalizer.
    if current["thread"] is not threading.current_thread():
        current["thread"].join()
    emit("cancel", generation=current["generation"], cancel_requested_ns=requested_ns)

def dump_traceback_later(timeout, repeat=False, file=None, exit=False):
    global active, generation
    if repeat is not False or exit is not False:
        emit("unsupported", repeat=bool(repeat), exit=bool(exit))
        raise ValueError("CI diagnostics support only repeat=False and exit=False")
    try:
        seconds = float(timeout)
    except (TypeError, ValueError):
        raise ValueError("timeout must be a finite positive number")
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("timeout must be a finite positive number")
    cancel_dump_traceback_later()
    target = sys.stderr if file is None else file
    try:
        target_fd = target if isinstance(target, int) else target.fileno()
        dup_fd = os.dup(target_fd)
        os.set_inheritable(dup_fd, False)
        stream = os.fdopen(dup_fd, "wb", buffering=0)
    except Exception as exc:
        emit("error", operation="duplicate-output-fd", error=type(exc).__name__)
        raise RuntimeError("cannot duplicate pytest diagnostic output descriptor") from exc
    with state_lock:
        generation += 1
        current = {"generation": generation, "cancel": threading.Event(), "stream": stream}
        active = current
        def timer_body():
            global active
            try:
                if current["cancel"].wait(seconds):
                    return
                with state_lock:
                    if active is not current or current["cancel"].is_set():
                        return
                emit("dump_start", generation=current["generation"])
                original_dump(file=stream, all_threads=True)
                stream.flush()
                emit("dump_complete", generation=current["generation"])
            except BaseException as exc:
                emit("error", operation="synchronous-dump", generation=current["generation"], error=type(exc).__name__)
            finally:
                with state_lock:
                    if active is current:
                        active = None
                try:
                    stream.close()
                except OSError:
                    pass
        current["thread"] = threading.Thread(target=timer_body, name="pupu-pytest-diagnostic", daemon=True)
        emit("arm", generation=generation, timeout_seconds=seconds, deadline_ns=time.monotonic_ns() + int(seconds * 1e9))
        try:
            timer_threads.append(current["thread"])
            current["thread"].start()
        except BaseException as exc:
            active = None
            stream.close()
            emit("error", operation="start-timer", generation=generation, error=type(exc).__name__)
            raise

faulthandler.dump_traceback_later = dump_traceback_later
faulthandler.cancel_dump_traceback_later = cancel_dump_traceback_later
cwd = os.getcwd()
if sys.path:
    sys.path[0] = cwd
else:
    sys.path.insert(0, cwd)
sys.argv = ["pytest", *json.loads(os.environ.pop("PUPU_PYTEST_ARGV_JSON"))]
try:
    runpy.run_module("pytest", run_name="__main__")
finally:
    cancel_dump_traceback_later()
    for timer_thread in timer_threads:
        if timer_thread.ident is not None:
            timer_thread.join()
    emit("child_finalized")
'''


def _signal_exit_code(returncode: int) -> int:
    return 128 + -returncode if returncode < 0 else returncode


def _proc_witness(pid: int) -> dict:
    status = {}
    path = f"/proc/{pid}/status"
    try:
        with open(path, "r", encoding="ascii", errors="replace") as stream:
            for line in stream:
                key, sep, value = line.partition(":")
                if sep and key in {"Name", "State", "Pid", "PPid", "Threads"}:
                    status[key] = value.strip()
    except OSError:
        return {"pid": pid, "available": False, "reason": "proc-status-unavailable"}
    count = 0
    truncated = False
    try:
        with os.scandir(f"/proc/{pid}/task") as entries:
            for _ in entries:
                count += 1
                if count >= 65536:
                    truncated = True
                    break
    except OSError:
        return {"pid": pid, "available": False, "status": status, "reason": "proc-task-list-unavailable"}
    return {"pid": pid, "available": True, "status": status, "task_count": count, "task_count_truncated": truncated}


def _hard_limit_from_env() -> float:
    value = os.environ.get(TEST_HARD_LIMIT_ENV)
    if value is None:
        return EXECUTION_LIMIT_SECONDS
    if os.environ.get(TEST_MODE_ENV) != "1":
        raise SystemExit(f"{TEST_HARD_LIMIT_ENV} is test-only")
    try:
        seconds = float(value)
    except ValueError as exc:
        raise SystemExit(f"invalid {TEST_HARD_LIMIT_ENV}") from exc
    if not math.isfinite(seconds) or seconds <= 0 or seconds >= EXECUTION_LIMIT_SECONDS:
        raise SystemExit(f"invalid {TEST_HARD_LIMIT_ENV}")
    return seconds


def _process_group_alive(pgid: int) -> bool:
    # Unknown process state is conservative; only known zombies/absence are dead.
    if sys.platform.startswith("linux"):
        unknown = False
        try:
            with os.scandir("/proc") as entries:
                for entry in entries:
                    if not entry.name.isdigit():
                        continue
                    try:
                        with open(f"{entry.path}/stat", encoding="ascii") as stream:
                            fields = stream.read().rsplit(")", 1)[1].split()
                        if int(fields[2]) == pgid and fields[0] != "Z":
                            return True
                    except (FileNotFoundError, ProcessLookupError):
                        continue
                    except (OSError, ValueError, IndexError):
                        unknown = True
            if not unknown:
                return False
        except OSError:
            pass
    else:
        try:
            result = subprocess.run(["ps", "-axo", "pgid=,stat="], capture_output=True, text=True, timeout=2)
            if result.returncode == 0:
                return any(int(parts[0]) == pgid and not parts[1].startswith("Z")
                           for line in result.stdout.splitlines()
                           if len(parts := line.split()) >= 2)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _terminate_owned_process_group(
    proc: subprocess.Popen,
    grace: float = 2.0,
    initial_signal: int = signal.SIGTERM,
) -> None:
    try:
        os.killpg(proc.pid, initial_signal)
    except ProcessLookupError:
        if proc.poll() is None:
            proc.send_signal(initial_signal)
            try:
                proc.wait(timeout=grace)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        return
    deadline = time.monotonic() + max(0.0, grace)
    while _process_group_alive(proc.pid) and time.monotonic() < deadline:
        if proc.poll() is None:
            try:
                proc.wait(timeout=min(0.05, max(0.0, deadline - time.monotonic())))
            except subprocess.TimeoutExpired:
                pass
        else:
            # The leader may exit before a TERM-ignoring descendant.
            time.sleep(min(0.05, max(0.0, deadline - time.monotonic())))
    if not _process_group_alive(proc.pid):
        if proc.poll() is None:
            proc.wait()
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    if proc.poll() is None:
        proc.wait()
    deadline = time.monotonic() + 2.0
    while _process_group_alive(proc.pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    if _process_group_alive(proc.pid):
        raise RuntimeError("owned pytest process group did not drain after SIGKILL")


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: run-python-tests.py <pytest arguments...>", file=sys.stderr)
        return 2
    hard_limit = _hard_limit_from_env()
    read_fd, write_fd = os.pipe()
    os.set_inheritable(read_fd, False)
    env = os.environ.copy()
    env["PUPU_PYTEST_DIAGNOSTIC_FD"] = str(write_fd)
    env["PUPU_PYTEST_ARGV_JSON"] = json.dumps(argv)
    print("[pupu-pytest-runner] " + json.dumps({"event": "runner-start", "backend": "gil_safe", "diagnostic_seconds": DIAGNOSTIC_SECONDS, "execution_hard_limit_seconds": EXECUTION_LIMIT_SECONDS}), file=sys.stderr, flush=True)
    proc = subprocess.Popen(
        [sys.executable, "-c", CHILD_BOOTSTRAP],
        cwd=os.getcwd(), env=env, pass_fds=(write_fd,), close_fds=True,
        start_new_session=True,
    )
    os.close(write_fd)
    os.set_blocking(read_fd, False)
    selector = selectors.DefaultSelector()
    selector.register(read_fd, selectors.EVENT_READ)
    started_ns = time.monotonic_ns()
    hard_deadline_ns = started_ns + int(hard_limit * 1e9)
    buffer = b""
    active = {}
    diagnostic_error = False
    hard_limit_hit = False
    received_signal = None
    eof = False
    child_finalized = False

    def record_signal(signum, _frame):
        nonlocal received_signal
        received_signal = signum

    previous_sigterm = signal.signal(signal.SIGTERM, record_signal)
    previous_sigint = signal.signal(signal.SIGINT, record_signal)

    def consume(raw: bytes) -> None:
        nonlocal buffer, diagnostic_error, child_finalized
        buffer += raw
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            if not line:
                continue
            try:
                event = json.loads(line)
            except (UnicodeDecodeError, json.JSONDecodeError):
                diagnostic_error = True
                print("[pupu-pytest-runner] diagnostic control message malformed", file=sys.stderr, flush=True)
                continue
            kind = event.get("event")
            generation = event.get("generation")
            if kind in {"dump_start", "dump_complete", "error", "unsupported"}:
                print("[pupu-pytest-runner] " + json.dumps(event, sort_keys=True), file=sys.stderr, flush=True)
            if kind == "child_finalized":
                child_finalized = True
            elif kind == "arm":
                active[generation] = {"deadline_ns": event.get("deadline_ns"), "dump_started": False, "dump_ended": False, "witnessed": False}
            elif kind == "cancel":
                state = active.pop(generation, None)
                request_ns = event.get("cancel_requested_ns", event.get("monotonic_ns", 0))
                if state and request_ns >= state["deadline_ns"] and not state["dump_ended"]:
                    diagnostic_error = True
                    print("[pupu-pytest-runner] " + json.dumps({"event": "required-diagnostic-finalization-missing", "generation": generation, "reason": "cancel-after-deadline-without-complete"}, sort_keys=True), file=sys.stderr, flush=True)
            elif kind == "dump_start" and generation in active:
                active[generation]["dump_started"] = True
            elif kind == "dump_complete" and generation in active:
                active[generation]["dump_ended"] = True
            elif kind == "error":
                diagnostic_error = True
            elif kind == "unsupported":
                diagnostic_error = True

    def drain_control() -> None:
        nonlocal eof, diagnostic_error
        if eof:
            return
        for key, _ in selector.select(timeout=0):
            try:
                raw = os.read(key.fd, 65536)
            except BlockingIOError:
                continue
            if raw:
                consume(raw)
            else:
                eof = True
                selector.unregister(key.fd)


    try:
        while True:
            # Consume already-queued dump completion before deciding that a
            # generation missed its deadline.
            drain_control()
            if received_signal is not None and proc.poll() is None:
                diagnostic_error = True
                print("[pupu-pytest-runner] " + json.dumps({"event": "parent-signal-forward", "signal": received_signal, "pid": proc.pid}), file=sys.stderr, flush=True)
                _terminate_owned_process_group(proc, initial_signal=received_signal)
            now_ns = time.monotonic_ns()
            for generation, state in list(active.items()):
                deadline_ns = state.get("deadline_ns")
                if deadline_ns is not None and now_ns >= deadline_ns and not state["witnessed"]:
                    state["witnessed"] = True
                    witness = _proc_witness(proc.pid)
                    print("[pupu-pytest-runner] " + json.dumps({"event": "deadline_witness", "generation": generation, "pid": proc.pid, "monotonic_ns": now_ns, "dump_started": state["dump_started"], "dump_completed": state["dump_ended"], "process": witness}, sort_keys=True), file=sys.stderr, flush=True)
            if not hard_limit_hit and now_ns >= hard_deadline_ns and proc.poll() is None:
                hard_limit_hit = True
                diagnostic_error = True
                witness = _proc_witness(proc.pid)
                print("[pupu-pytest-runner] " + json.dumps({"event": "execution-hard-limit", "pid": proc.pid, "process": witness}, sort_keys=True), file=sys.stderr, flush=True)
                _terminate_owned_process_group(proc)
            selector.select(timeout=0.1)
            returncode = proc.poll()
            if returncode is not None and eof:
                break
            if returncode is not None and not eof:
                # Drain final child control events before judging finalization.
                try:
                    raw = os.read(read_fd, 65536)
                    if raw:
                        consume(raw)
                    else:
                        eof = True
                        selector.unregister(read_fd)
                except BlockingIOError:
                    pass
    finally:
        if proc.poll() is None:
            _terminate_owned_process_group(proc)
        else:
            # A direct child can exit while a test-owned descendant remains.
            _terminate_owned_process_group(proc)
        selector.close()
        os.close(read_fd)
        signal.signal(signal.SIGTERM, previous_sigterm)
        signal.signal(signal.SIGINT, previous_sigint)
    if buffer.strip():
        diagnostic_error = True
    unfinished = [g for g, s in active.items() if not s["dump_ended"]]
    if unfinished:
        diagnostic_error = True
        print("[pupu-pytest-runner] " + json.dumps({"event": "required-diagnostic-finalization-missing", "generations": unfinished}), file=sys.stderr, flush=True)
    if hard_limit_hit:
        return 124
    if received_signal is not None:
        return _signal_exit_code(-received_signal)
    code = _signal_exit_code(proc.returncode or 0)
    if code == 0 and not child_finalized:
        diagnostic_error = True
        print('[pupu-pytest-runner] {"event":"child_finalization_missing"}', file=sys.stderr, flush=True)
    if diagnostic_error and code == 0:
        return 1
    return code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
