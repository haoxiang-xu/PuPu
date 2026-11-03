"""QA-only (#356 B1 measurement): a pytest plugin, loaded with -p, that records
wall/CPU time per phase and the life of every Core execution heartbeat thread,
with the guard that owns it. It changes nothing in the product or the test.

Heartbeat threads are those Core names `unchain-execution-heartbeat-<token>`
(unchain/execution.py `_start_heartbeat_locked`). While such a thread runs,
its `_target` is the owning guard's bound `_heartbeat_loop`, so the guard is
`_target.__self__`; its `_state`, `_heartbeat_stop` and `_lease` are read as
they are. A watcher polls every 50 ms so start and exit are observed even for
threads that live inside one phase.
"""
import gc
import hashlib
import json
import os
import resource
import sys
import threading
import time
import zipfile

OUT = os.environ["QA356_B1_OUT"]
PREFIX = "unchain-execution-heartbeat-"
_lock = threading.Lock()
_seen = {}
_events = []
_phase = {"name": "collect", "item": None}
_stop = threading.Event()


def _now():
    return time.monotonic()


def _guard_facts(thread):
    target = getattr(thread, "_target", None)
    guard = getattr(target, "__self__", None)
    if guard is None:
        return {"guard": None}
    lease = getattr(guard, "_lease", None)
    stop = getattr(guard, "_heartbeat_stop", None)
    return {
        "guard": f"{type(guard).__module__}.{type(guard).__name__}@{id(guard):x}",
        "guard_state": getattr(guard, "_state", None),
        "heartbeat_stop_set": stop.is_set() if stop is not None else None,
        "guard_thread_is_this": getattr(guard, "_heartbeat_thread", None) is thread,
        "execution_id": getattr(lease, "execution_id", None),
        "owner_id": getattr(lease, "owner_id", None),
        "fencing_token": getattr(lease, "fencing_token", None),
        "heartbeat_interval_ms": getattr(getattr(getattr(guard, "_runtime", None), "config", None), "heartbeat_interval_ms", None),
    }


def _scan(reason):
    alive = {}
    for thread in threading.enumerate():
        if not thread.name.startswith(PREFIX):
            continue
        alive[thread.ident] = thread
        with _lock:
            if thread.ident not in _seen:
                _seen[thread.ident] = {
                    "ident": thread.ident,
                    "native_id": thread.native_id,
                    "name": thread.name,
                    "first_seen": _now(),
                    "first_phase": dict(_phase),
                    "facts_at_start": _guard_facts(thread),
                }
            _seen[thread.ident]["last_seen"] = _now()
            _seen[thread.ident]["facts_last"] = _guard_facts(thread)
    with _lock:
        for ident, record in _seen.items():
            if ident not in alive and "exited" not in record:
                record["exited"] = _now()
                record["exit_phase"] = dict(_phase)
    return alive


def _snapshot(label):
    alive = _scan(label)
    _events.append({
        "t": _now(),
        "label": label,
        "phase": dict(_phase),
        "threads_total": threading.active_count(),
        "heartbeat_alive": [
            {"ident": ident, "name": t.name, **_guard_facts(t)} for ident, t in alive.items()
        ],
    })


def _watch():
    while not _stop.wait(0.05):
        _scan("watch")


def _usage():
    self_ = resource.getrusage(resource.RUSAGE_SELF)
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {
        "wall": _now(),
        "process_time": time.process_time(),
        "self_user": self_.ru_utime,
        "self_sys": self_.ru_stime,
        "children_user": children.ru_utime,
        "children_sys": children.ru_stime,
        "max_rss_kib": self_.ru_maxrss,
    }


def _delta(a, b):
    return {k: round(b[k] - a[k], 4) for k in a if k != "max_rss_kib"} | {"max_rss_kib": b["max_rss_kib"]}


_phases = {}


def pytest_sessionstart(session):
    _snapshot("session-start")
    threading.Thread(target=_watch, name="qa356-b1-watch", daemon=True).start()


def _run_phase(item, name):
    _phase.update(name=name, item=item.nodeid)
    _snapshot(f"before-{name}")
    start = _usage()
    outcome = yield
    end = _usage()
    _snapshot(f"after-{name}")
    _phases.setdefault(item.nodeid, {})[name] = _delta(start, end)
    return outcome


import pytest  # noqa: E402


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_setup(item):
    yield from _run_phase(item, "setup")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item):
    yield from _run_phase(item, "call")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item, nextitem):
    yield from _run_phase(item, "teardown")
    _phase.update(name="after-teardown", item=item.nodeid)
    gc.collect()
    _snapshot("after-teardown+gc")
    time.sleep(2.0)
    _snapshot("after-teardown+2s")


def _imported_runtime():
    if "unchain" not in sys.modules:
        try:
            import unchain  # noqa: F401
        except Exception as exc:  # recorded, never hidden
            return {"error": repr(exc), "executable": sys.executable}
    modules = []
    for name, module in sorted(sys.modules.items()):
        if name != "unchain" and not name.startswith("unchain."):
            continue
        path = getattr(module, "__file__", None)
        if not path:
            continue
        with open(path, "rb") as handle:
            modules.append({"module": name, "file": path, "sha256": hashlib.sha256(handle.read()).hexdigest()})
    wheel = os.environ.get("QA356_B1_WHEEL")
    match = {"checked": 0, "match": 0, "diff": [], "absent": []}
    if wheel:
        archive = zipfile.ZipFile(wheel)
        names = set(archive.namelist())
        for row in modules:
            rel = row["file"].split("site-packages/", 1)[-1]
            match["checked"] += 1
            if rel not in names:
                match["absent"].append(rel)
            elif hashlib.sha256(archive.read(rel)).hexdigest() == row["sha256"]:
                match["match"] += 1
            else:
                match["diff"].append(rel)
    return {"executable": sys.executable, "version": sys.version, "unchain_file": sys.modules["unchain"].__file__,
            "modules": modules, "wheel": wheel, "wheel_match": match}


def _safe_runtime():
    try:
        return _imported_runtime()
    except Exception as exc:  # recorded, never hidden
        return {"error": repr(exc), "executable": sys.executable}


def pytest_sessionfinish(session, exitstatus):
    _phase.update(name="session-finish", item=None)
    _snapshot("session-finish")
    _stop.set()
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump({
            "exitstatus": int(exitstatus),
            "phases": _phases,
            "heartbeat_threads": list(_seen.values()),
            "snapshots": _events,
            "imported_runtime": _safe_runtime(),
        }, handle, indent=1, default=str)
