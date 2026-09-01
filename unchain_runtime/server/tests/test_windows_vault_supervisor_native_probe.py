from __future__ import annotations

import importlib.util
import json
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


class _FakeReadyPair:
    def __init__(self, events, prefix, supervisor_value, child_value):
        self.supervisor = _FakeHandle(
            supervisor_value,
            events,
            f"{prefix}-supervisor",
        )
        self.child = _FakeHandle(child_value, events, f"{prefix}-child")

    def close(self):
        self.child.close()
        self.supervisor.close()


class _FakeWorker:
    def __init__(self, events):
        self.process = _FakeHandle(0xB000, events, "atomic-process")
        self.ready_event = _FakeHandle(0xB001, events, "atomic-ready")

    def close(self):
        self.ready_event.close()
        self.process.close()


class _AtomicFakeApi:
    def __init__(self, events):
        self.events = events
        self.job = None
        self.command = None
        self.environment = None

    def _capture_protocol_handles(self):
        self.events.append(("capture-protocol",))
        return _FakeHandle(0x9000, self.events, "protocol")

    def create_kill_on_close_job(self):
        self.events.append(("create", "atomic-job"))
        self.job = _FakeHandle(0x9001, self.events, "atomic-job")
        return self.job

    def _create_ready_event(self):
        self.events.append(("create", "decoy"))
        return _FakeReadyPair(self.events, "decoy", 0xA000, 0xA001)

    def _spawn_contained_command(
        self,
        protocol,
        job,
        *,
        command,
        environment,
    ):
        assert protocol.value == 0x9000
        assert job is self.job
        self.command = command
        self.environment = environment
        self.events.append(("atomic-spawn", command.arguments))
        return _FakeWorker(self.events)

    def process_is_in_job(self, process_handle, job):
        self.events.append(("atomic-attest", process_handle, job._name))
        return True

    def wait_for_handle_for_probe(self, handle, timeout_ms):
        self.events.append(("wait-handle", handle, timeout_ms))
        if handle == 0xB001:
            return probe.supervisor.WAIT_OBJECT_0
        if handle == 0xA000:
            return probe.supervisor.WAIT_TIMEOUT
        if handle == 0xB000:
            return (
                probe.supervisor.WAIT_OBJECT_0
                if self.job._closed
                else probe.supervisor.WAIT_TIMEOUT
            )
        raise AssertionError(f"unexpected handle {handle}")


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


def test_atomic_probe_uses_job_list_excludes_decoy_and_denies_breakaway():
    events = []
    api = _AtomicFakeApi(events)

    evidence = probe._probe_atomic_job_list_spawn(api)

    assert evidence == {
        "atomic_job_list_spawn_attested": True,
        "exact_handle_list_attested": True,
        "breakaway_denied": True,
        "job_handle_non_inheritable": True,
        "supervisor_event_non_inheritable": True,
        "child_inherited_handle_count": 4,
        "atomic_kill_on_close_observed": True,
    }
    assert api.command.application == sys.executable
    assert api.command.arguments[:2] == (sys.executable, "-c")
    assert "CREATE_BREAKAWAY_FROM_JOB" in api.command.arguments[2]
    assert "secret" not in api.command.command_line.casefold()
    assert api.environment is probe.os.environ
    assert events.index(("close", "atomic-job")) < events.index(
        ("wait-handle", 0xB000, 10000)
    )
    assert events.count(("close", "atomic-job")) == 1
    assert events.count(("close", "decoy-child")) == 1
    assert events.count(("close", "decoy-supervisor")) == 1


def test_main_publishes_the_exact_v2_closed_evidence(monkeypatch, tmp_path):
    evidence_path = tmp_path / "native-v2.json"
    fake_api = object()
    monkeypatch.setattr(probe.sys, "platform", "win32")
    monkeypatch.setenv(
        "VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH",
        str(evidence_path),
    )
    monkeypatch.setattr(probe.supervisor, "_Win32Api", lambda: fake_api)
    monkeypatch.setattr(probe, "_probe_empty_kill_on_close_job", lambda api: None)
    monkeypatch.setattr(probe, "_probe_dev_parent_chain", lambda api: "dev")
    monkeypatch.setattr(
        probe,
        "_probe_nested_job_membership_and_kill",
        lambda api: True,
    )
    monkeypatch.setattr(
        probe,
        "_probe_atomic_job_list_spawn",
        lambda api: {
            "atomic_job_list_spawn_attested": True,
            "exact_handle_list_attested": True,
            "breakaway_denied": True,
            "job_handle_non_inheritable": True,
            "supervisor_event_non_inheritable": True,
            "child_inherited_handle_count": 4,
            "atomic_kill_on_close_observed": True,
        },
    )

    probe.main()

    assert json.loads(evidence_path.read_text(encoding="utf-8")) == {
        "schema": "pupu.windows-vault-supervisor-native-probe.v2",
        "executed_tests": 4,
        "platform": "win32-x64",
        "kernel32_loaded": True,
        "parent_chain_mode": "dev",
        "runner_outer_job": True,
        "nested_job_membership_attested": True,
        "kill_on_close_observed": True,
        "atomic_job_list_spawn_attested": True,
        "exact_handle_list_attested": True,
        "breakaway_denied": True,
        "job_handle_non_inheritable": True,
        "supervisor_event_non_inheritable": True,
        "child_inherited_handle_count": 4,
        "atomic_kill_on_close_observed": True,
    }


def test_non_windows_main_skips_without_publishing_evidence(monkeypatch, tmp_path):
    evidence_path = tmp_path / "must-not-exist.json"
    monkeypatch.setattr(probe.sys, "platform", "darwin")
    monkeypatch.setenv(
        "VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH",
        str(evidence_path),
    )

    probe.main()

    assert not evidence_path.exists()
