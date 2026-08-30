from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PROBE_PATH = ROOT / "scripts" / "release-qa" / (
    "windows-vault-supervisor-native-probe.py"
)
SPEC = importlib.util.spec_from_file_location(
    "windows_vault_supervisor_native_probe",
    PROBE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = probe
SPEC.loader.exec_module(probe)


class _FakeHandle:
    def __init__(self, value, events, name):
        self.value = value
        self._events = events
        self._name = name
        self._closed = False

    def close(self):
        if self._closed:
            return False
        self._closed = True
        self._events.append(("close", self._name))
        return True

    def __enter__(self):
        return self

    def __exit__(self, _type, _value, _traceback):
        self.close()


class _FakeChild:
    def __init__(self, events):
        self._events = events
        self._handle = 0x7000
        self.returncode = None

    def poll(self):
        return self.returncode

    def wait(self, timeout):
        self._events.append(("wait", timeout))
        self.returncode = 1
        return self.returncode

    def terminate(self):
        raise AssertionError("kill-on-close should terminate the probe child")

    def kill(self):
        raise AssertionError("kill-on-close should terminate the probe child")


class _FakeApi:
    def __init__(self, events):
        self.events = events

    def open_live_process(self, pid_text):
        self.events.append(("open-current", pid_text))
        return _FakeHandle(0x6000, self.events, "current")

    def process_is_in_job(self, process_handle, job):
        job_name = None if job is None else job._name
        self.events.append(("attest", process_handle, job_name))
        return True

    def create_job(self):
        self.events.append(("create", "outer"))
        return _FakeHandle(0x8000, self.events, "outer")

    def create_kill_on_close_job(self):
        self.events.append(("create", "inner"))
        return _FakeHandle(0x9000, self.events, "inner")

    def assign_existing_process_for_probe(self, process_handle, job):
        self.events.append(("assign", process_handle, job._name))


def test_nested_probe_attests_outer_then_inner_and_observes_job_close(monkeypatch):
    events = []
    child = _FakeChild(events)
    monkeypatch.setattr(probe.subprocess, "CREATE_NO_WINDOW", 0, raising=False)
    monkeypatch.setattr(
        probe.subprocess,
        "Popen",
        lambda *_args, **_kwargs: child,
    )

    runner_has_outer_job = probe._probe_nested_job_membership_and_kill(
        _FakeApi(events)
    )

    assert runner_has_outer_job is True
    assert ("assign", child._handle, "outer") in events
    assert ("attest", child._handle, "outer") in events
    assert ("assign", child._handle, "inner") in events
    assert ("attest", child._handle, "inner") in events
    assert events.index(("close", "inner")) < events.index(("wait", 10))
    assert events.count(("close", "inner")) == 1
    assert events.count(("close", "outer")) == 1


def test_non_windows_main_skips_without_publishing_evidence(monkeypatch, tmp_path):
    evidence_path = tmp_path / "must-not-exist.json"
    monkeypatch.setattr(probe.sys, "platform", "darwin")
    monkeypatch.setenv(
        "VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH",
        str(evidence_path),
    )

    probe.main()

    assert not evidence_path.exists()
