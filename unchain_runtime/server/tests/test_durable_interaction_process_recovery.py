from __future__ import annotations

import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import Any, TextIO
from urllib.parse import quote


SERVER_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SERVER_ROOT.parents[1]
UNCHAIN_ROOT = PROJECT_ROOT.parent / "unchain"
UNCHAIN_SOURCE_ROOT = UNCHAIN_ROOT / "src"
if str(UNCHAIN_SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(UNCHAIN_SOURCE_ROOT))

from unchain.memory import JsonFileSessionStore  # noqa: E402


FIXTURE = Path(__file__).with_name(
    "_durable_interaction_process_fixture.py"
)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _http_request(
    *,
    port: int,
    auth_token: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    timeout: float = 10.0,
) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection(
        "127.0.0.1",
        port,
        timeout=timeout,
    )
    body = None
    headers = {
        "Accept": "application/json, text/event-stream",
        "x-unchain-auth": auth_token,
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(body))
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def _json_request(**kwargs: Any) -> dict[str, Any]:
    status, body = _http_request(**kwargs)
    if status != 200:
        raise AssertionError(
            f"unexpected HTTP {status}: {body.decode('utf-8', errors='replace')}"
        )
    return json.loads(body.decode("utf-8"))


def _parse_sse(body: bytes) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    for raw_block in body.decode("utf-8").split("\n\n"):
        event_name = ""
        data_lines: list[str] = []
        for line in raw_block.splitlines():
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if event_name and data_lines:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return ""


class DurableInteractionProcessRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.data_dir = self.root / "data"
        self.home_dir = self.root / "home"
        self.effect_log = self.root / "effects.log"
        self.model_log = self.root / "model_requests.jsonl"
        self.sidecar_log_dir = self.root / "sidecar-logs"
        self.processes: list[subprocess.Popen[str]] = []
        self.process_logs: list[str] = []
        self.process_log_files: dict[
            int,
            tuple[TextIO, Path],
        ] = {}
        self.addCleanup(self._stop_all_processes)

    def _start_sidecar(
        self,
        *,
        phase: str,
        auth_token: str,
    ) -> tuple[subprocess.Popen[str], int]:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.home_dir.mkdir(parents=True, exist_ok=True)
        self.sidecar_log_dir.mkdir(parents=True, exist_ok=True)
        last_error: AssertionError | None = None
        for attempt in range(3):
            port = _free_port()
            env = os.environ.copy()
            env.update(
                {
                    "HOME": str(self.home_dir),
                    "USERPROFILE": str(self.home_dir),
                    "UNCHAIN_HOST": "127.0.0.1",
                    "UNCHAIN_PORT": str(port),
                    "UNCHAIN_AUTH_TOKEN": auth_token,
                    "UNCHAIN_VERSION": "d3-test",
                    "UNCHAIN_DATA_DIR": str(self.data_dir),
                    "UNCHAIN_PARENT_PID": str(os.getpid()),
                    "UNCHAIN_SOURCE_PATH": str(UNCHAIN_ROOT),
                    "UNCHAIN_PROVIDER": "openai",
                    "UNCHAIN_MODEL": "gpt-5",
                    "PUPU_D3_PHASE": phase,
                    "PUPU_D3_EFFECT_LOG": str(self.effect_log),
                    "PUPU_D3_MODEL_LOG": str(self.model_log),
                    "PYTHONIOENCODING": "utf-8",
                    "PYTHONUTF8": "1",
                    "PYTHONUNBUFFERED": "1",
                }
            )
            log_path = self.sidecar_log_dir / f"{phase}-{attempt}-{port}.log"
            log_handle = log_path.open("w+", encoding="utf-8")
            process = subprocess.Popen(
                [sys.executable, str(FIXTURE)],
                cwd=SERVER_ROOT,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                text=True,
            )
            self.processes.append(process)
            self.process_log_files[process.pid] = (log_handle, log_path)
            try:
                self._wait_until_ready(
                    process=process,
                    port=port,
                    auth_token=auth_token,
                )
                return process, port
            except AssertionError as exc:
                last_error = exc
                self._stop_process(process, crash=True)
                if "address already in use" not in str(exc).lower():
                    raise
        raise AssertionError(
            f"D3 sidecar could not claim a free port after retries: {last_error}"
        )

    def _process_log(self, process: subprocess.Popen[str]) -> str:
        record = self.process_log_files.get(process.pid)
        if record is None:
            return ""
        handle, path = record
        if not handle.closed:
            handle.flush()
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return ""

    def _wait_until_ready(
        self,
        *,
        process: subprocess.Popen[str],
        port: int,
        auth_token: str,
    ) -> None:
        deadline = time.monotonic() + 15.0
        last_error: BaseException | None = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                logs = self._process_log(process)
                raise AssertionError(
                    f"D3 sidecar exited during startup ({process.returncode}):\n{logs}"
                )
            try:
                health = _json_request(
                    port=port,
                    auth_token=auth_token,
                    method="GET",
                    path="/health",
                    timeout=1.0,
                )
                if health.get("status") == "ok":
                    return
            except (OSError, http.client.HTTPException, AssertionError) as exc:
                last_error = exc
            time.sleep(0.05)
        raise AssertionError(
            "D3 sidecar did not become ready: "
            f"{last_error}\n{self._process_log(process)}"
        )

    def _wait_for_pending(
        self,
        *,
        port: int,
        auth_token: str,
        session_id: str,
        expected_status: str,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + 15.0
        last_payload: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            last_payload = _json_request(
                port=port,
                auth_token=auth_token,
                method="GET",
                path=(
                    "/chat/interactions/pending?session_id="
                    + quote(session_id, safe="")
                ),
                timeout=2.0,
            )
            if last_payload.get("status") == expected_status:
                return last_payload
            time.sleep(0.05)
        raise AssertionError(
            f"pending interaction did not reach {expected_status!r}: "
            f"{last_payload!r}"
        )

    def _session_store(self) -> JsonFileSessionStore:
        return JsonFileSessionStore(
            base_dir=self.data_dir / "memory" / "sessions"
        )

    def _load_session_state(self, session_id: str) -> dict[str, Any]:
        return self._session_store().load(session_id)

    def _wait_for_released_lease(self, session_id: str) -> None:
        store = self._session_store()
        session_path = store._path(session_id)
        lease_path = store._lease_path(session_path)
        deadline = time.monotonic() + 15.0
        last_record: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            if lease_path.exists():
                try:
                    last_record = json.loads(
                        lease_path.read_text(encoding="utf-8")
                    )
                except (OSError, json.JSONDecodeError):
                    time.sleep(0.02)
                    continue
                if last_record.get("active") is None:
                    return
            time.sleep(0.02)
        raise AssertionError(
            "execution lease was not released at the interaction wait boundary: "
            f"{last_record!r}"
        )

    def _stop_process(
        self,
        process: subprocess.Popen[str],
        *,
        crash: bool,
    ) -> None:
        if process.poll() is None:
            if crash:
                process.kill()
            else:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        record = self.process_log_files.pop(process.pid, None)
        if record is not None:
            handle, path = record
            if not handle.closed:
                handle.flush()
                handle.close()
            try:
                self.process_logs.append(path.read_text(encoding="utf-8"))
            except OSError:
                self.process_logs.append("")

    def _stop_all_processes(self) -> None:
        for process in reversed(self.processes):
            self._stop_process(process, crash=False)

    def test_crash_restart_receipt_and_cold_resume_execute_once(self) -> None:
        session_id = "d3-crash-resume"
        original_message = "D3 original request"
        first_token = "d3-first-token"
        first_process, first_port = self._start_sidecar(
            phase="initial",
            auth_token=first_token,
        )

        stream_outcome: dict[str, Any] = {}

        def hold_initial_stream() -> None:
            try:
                stream_outcome["response"] = _http_request(
                    port=first_port,
                    auth_token=first_token,
                    method="POST",
                    path="/chat/stream/v4",
                    payload={
                        "message": original_message,
                        "attempt_id": "d3-initial-attempt",
                        "history": [],
                        "threadId": session_id,
                        "options": {
                            "modelId": "openai:gpt-5",
                            "memory_enabled": True,
                            "durable_interactions_required": True,
                            "maxIterations": 3,
                        },
                    },
                    timeout=30.0,
                )
            except BaseException as exc:  # noqa: BLE001 - crash is intentional
                stream_outcome["error"] = exc

        stream_thread = threading.Thread(
            target=hold_initial_stream,
            name="d3-initial-sse",
            daemon=True,
        )
        stream_thread.start()

        try:
            pending_before_crash = self._wait_for_pending(
                port=first_port,
                auth_token=first_token,
                session_id=session_id,
                expected_status="awaiting_response",
            )
        except AssertionError as pending_error:
            stream_thread.join(timeout=0.2)
            if not stream_thread.is_alive():
                response = stream_outcome.get("response")
                if isinstance(response, tuple) and len(response) == 2:
                    response = (
                        response[0],
                        response[1].decode("utf-8", errors="replace"),
                    )
                self.fail(
                    f"{pending_error}; initial stream ended early: "
                    f"{response or stream_outcome.get('error')!r}"
                )
            raise
        self.assertTrue(
            stream_thread.is_alive(),
            "initial SSE should still be waiting for the live confirmation",
        )
        self.assertTrue(pending_before_crash["resume_available"])
        interaction_id = pending_before_crash["interaction_id"]
        self._wait_for_released_lease(session_id)
        self.assertEqual(
            self.effect_log.read_text(encoding="utf-8").splitlines(),
            ["safe-before-crash"],
        )

        crash_state = self._load_session_state(session_id)
        crash_checkpoint = crash_state["execution_checkpoint"]
        checkpoint_id = crash_checkpoint["checkpoint_id"]
        self.assertEqual(crash_checkpoint["status"], "awaiting_interaction")
        self.assertEqual(
            crash_checkpoint["interaction_ref"]["interaction_id"],
            interaction_id,
        )
        crash_journal = crash_state["interaction_journal"]
        crash_entry = crash_journal["entries"][interaction_id]
        self.assertEqual(crash_journal["active_id"], interaction_id)
        self.assertEqual(crash_entry["checkpoint_id"], checkpoint_id)
        self.assertEqual(
            crash_entry["request"]["request_digest"],
            crash_checkpoint["interaction_ref"]["request_digest"],
        )
        self.assertIsNone(crash_entry["receipt"])
        self.assertIsNone(crash_entry["application"])

        # This is an abrupt process death: main.py's SIGTERM shutdown handler
        # and the live confirmation waiter's cleanup path do not run.
        self._stop_process(first_process, crash=True)
        stream_thread.join(timeout=5)
        self.assertFalse(stream_thread.is_alive())
        self.assertIsNotNone(first_process.returncode)

        second_token = "d3-second-token"
        _second_process, second_port = self._start_sidecar(
            phase="resume",
            auth_token=second_token,
        )

        pending_after_restart = self._wait_for_pending(
            port=second_port,
            auth_token=second_token,
            session_id=session_id,
            expected_status="awaiting_response",
        )
        self.assertEqual(
            pending_after_restart["interaction_id"],
            interaction_id,
        )
        self.assertTrue(pending_after_restart["resume_available"])

        receipt = _json_request(
            port=second_port,
            auth_token=second_token,
            method="POST",
            path="/chat/tool/confirmation",
            payload={
                "session_id": session_id,
                "confirmation_id": interaction_id,
                "approved": True,
                "reason": "D3 approval after restart",
            },
        )
        self.assertTrue(receipt["durable"])
        self.assertEqual(receipt["disposition"], "receipt_recorded")
        self.assertEqual(
            self.effect_log.read_text(encoding="utf-8").splitlines(),
            ["safe-before-crash"],
        )

        recorded = self._wait_for_pending(
            port=second_port,
            auth_token=second_token,
            session_id=session_id,
            expected_status="receipt_recorded",
        )
        self.assertEqual(recorded["interaction_id"], interaction_id)
        self.assertEqual(recorded["resolution"]["outcome"], "approved")

        receipt_state = self._load_session_state(session_id)
        receipt_checkpoint = receipt_state["execution_checkpoint"]
        receipt_journal = receipt_state["interaction_journal"]
        receipt_entry = receipt_journal["entries"][interaction_id]
        self.assertEqual(receipt_checkpoint["checkpoint_id"], checkpoint_id)
        self.assertEqual(receipt_journal["active_id"], interaction_id)
        self.assertEqual(
            receipt_entry["receipt"]["receipt_id"],
            receipt["receipt_id"],
        )
        self.assertIs(receipt_entry["receipt"]["response"]["approved"], True)
        self.assertIsNone(receipt_entry["application"])

        resume_status, resume_body = _http_request(
            port=second_port,
            auth_token=second_token,
            method="POST",
            path="/chat/stream/v4",
            payload={
                "mode": "resume_interaction",
                "attempt_id": "d3-resume-attempt",
                "source_attempt_id": recorded["source_run_id"],
                "threadId": session_id,
                "interaction_id": interaction_id,
                "options": {"modelId": "openai:gpt-5"},
            },
            timeout=15.0,
        )
        self.assertEqual(resume_status, 200)
        resume_events = _parse_sse(resume_body)
        runtime_events = [
            payload
            for event_name, payload in resume_events
            if event_name == "runtime_event"
        ]
        self.assertFalse(
            any(event.get("type") == "run.failed" for event in runtime_events)
        )
        self.assertEqual(
            sum(event.get("type") == "run.completed" for event in runtime_events),
            1,
        )
        self.assertEqual(
            sum(
                event.get("type") == "step.completed"
                and event.get("payload", {}).get("final_text") == "d3-resumed"
                for event in runtime_events
            ),
            1,
        )
        self.assertEqual(
            sum(event_name == "done" for event_name, _payload in resume_events),
            1,
        )
        done_payload = next(
            payload
            for event_name, payload in resume_events
            if event_name == "done"
        )
        self.assertNotIn("error", done_payload)

        final_pending = self._wait_for_pending(
            port=second_port,
            auth_token=second_token,
            session_id=session_id,
            expected_status="none",
        )
        self.assertEqual(
            final_pending,
            {"status": "none", "session_id": session_id},
        )
        self.assertEqual(
            self.effect_log.read_text(encoding="utf-8").splitlines(),
            ["safe-before-crash", "d3-effect"],
        )

        model_requests = [
            json.loads(line)
            for line in self.model_log.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [(item["phase"], item["call_count"]) for item in model_requests],
            [("initial", 1), ("resume", 1)],
        )
        resumed_user_messages = [
            message
            for message in model_requests[1]["messages"]
            if message.get("role") == "user"
            and _message_text(message) == original_message
        ]
        self.assertEqual(len(resumed_user_messages), 1)

        session_state = self._load_session_state(session_id)
        user_messages = [
            message
            for message in session_state.get("messages", [])
            if message.get("role") == "user"
            and _message_text(message) == original_message
        ]
        final_messages = [
            message
            for message in session_state.get("messages", [])
            if message.get("role") == "assistant"
            and _message_text(message) == "d3-resumed"
        ]
        self.assertEqual(len(user_messages), 1)
        self.assertEqual(len(final_messages), 1)
        self.assertNotIn("execution_checkpoint", session_state)

        final_journal = session_state["interaction_journal"]
        final_entry = final_journal["entries"][interaction_id]
        self.assertIsNone(final_journal["active_id"])
        self.assertIn(interaction_id, final_journal["order"])
        self.assertEqual(
            final_entry["receipt"]["receipt_id"],
            receipt["receipt_id"],
        )
        self.assertEqual(
            final_entry["application"],
            {
                "schema_version": 1,
                "receipt_id": receipt["receipt_id"],
                "applied_checkpoint_id": checkpoint_id,
            },
        )

        before_stale_effects = self.effect_log.read_bytes()
        before_stale_models = self.model_log.read_bytes()
        before_stale_session = self._load_session_state(session_id)
        stale_status, stale_body = _http_request(
            port=second_port,
            auth_token=second_token,
            method="POST",
            path="/chat/stream/v4",
            payload={
                "mode": "resume_interaction",
                "attempt_id": "d3-stale-resume-attempt",
                "source_attempt_id": recorded["source_run_id"],
                "threadId": session_id,
                "interaction_id": interaction_id,
                "options": {"modelId": "openai:gpt-5"},
            },
            timeout=15.0,
        )
        self.assertEqual(stale_status, 200)
        stale_events = _parse_sse(stale_body)
        stale_runtime_events = [
            payload
            for event_name, payload in stale_events
            if event_name == "runtime_event"
        ]
        stale_failures = [
            event
            for event in stale_runtime_events
            if event.get("type") == "run.failed"
        ]
        self.assertEqual(len(stale_failures), 1)
        self.assertEqual(
            stale_failures[0]["payload"]["error"]["code"],
            "interaction_not_found",
        )
        self.assertFalse(
            any(
                event.get("type") in {"run.completed", "step.completed"}
                for event in stale_runtime_events
            )
        )
        stale_done = [
            payload
            for event_name, payload in stale_events
            if event_name == "done"
        ]
        self.assertEqual(len(stale_done), 1)
        self.assertEqual(
            stale_done[0]["error"]["code"],
            "interaction_not_found",
        )
        self.assertEqual(self.effect_log.read_bytes(), before_stale_effects)
        self.assertEqual(self.model_log.read_bytes(), before_stale_models)
        self.assertEqual(
            self._load_session_state(session_id),
            before_stale_session,
        )


if __name__ == "__main__":
    unittest.main()
