import contextlib
import io
import json
import unittest
from unittest.mock import patch

from chat_latency_diagnostics import ChatLatencyTrace, emit_latency_phase


class ChatLatencyDiagnosticsTests(unittest.TestCase):
    def test_request_log_is_bounded_content_free_and_emitted_once(self):
        stderr = io.StringIO()
        ticks = iter([1_000_000_000, 1_002_000_000, 1_010_000_000,
                      1_014_000_000, 1_020_000_000, 1_023_000_000,
                      1_030_000_000, 1_040_000_000])
        with contextlib.redirect_stderr(stderr), patch(
            "chat_latency_diagnostics.time.perf_counter_ns",
            side_effect=lambda: next(ticks),
        ), patch("chat_latency_diagnostics.time.time_ns", return_value=7_000_000_000):
            trace = ChatLatencyTrace(
                session_id="private-chat-id",
                attempt_id="private-attempt-id",
                route="chat_stream_v4",
            )
            trace.observe({
                "type": "request_messages", "iteration": 0,
                "messages": [{"content": "private prompt"}],
            })
            trace.observe({"type": "token_delta", "iteration": 0,
                           "delta": "private answer"})
            trace.observe({"type": "tool_result", "iteration": 0,
                           "result": "private tool output"})
            trace.observe({"type": "request_messages", "iteration": 1})
            trace.observe({"type": "response_received", "iteration": 1})
            trace.observe({"type": "final_message", "iteration": 1,
                           "content": "private final answer"})
            trace.finish("completed")
            trace.finish("failed")

        lines = stderr.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("[chat-latency] "))
        self.assertNotIn("private", lines[0])
        record = json.loads(lines[0].split(" ", 1)[1])
        self.assertEqual(record["schema"], "pupu.chat_latency.v1")
        self.assertEqual(record["kind"], "request")
        self.assertEqual(record["outcome"], "completed")
        self.assertEqual(record["provider_request_count"], 2)
        self.assertEqual(record["model_turns"], [
            {"iteration": 0, "request_ready_ms": 2,
             "first_token_ms": 10, "tool_result_ms": 14},
            {"iteration": 1, "request_ready_ms": 20,
             "response_received_ms": 23, "final_message_ms": 30},
        ])
        self.assertEqual(record["elapsed_ms"], 40)

    def test_phase_log_contains_only_approved_phase_and_hashed_ids(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr), patch(
            "chat_latency_diagnostics.time.perf_counter_ns",
            return_value=1_250_000_000,
        ):
            emit_latency_phase(
                "graph_active_preflight",
                started_ns=1_000_000_000,
                session_id="private-chat-id",
                attempt_id="private-attempt-id",
            )
            emit_latency_phase(
                "graph_user_toolkits",
                started_ns=1_000_000_000,
                session_id="private-chat-id",
                attempt_id="private-attempt-id",
            )
            emit_latency_phase(
                "private arbitrary phase",
                started_ns=1_000_000_000,
                session_id="private-chat-id",
                attempt_id="private-attempt-id",
            )
        lines = stderr.getvalue().splitlines()
        self.assertEqual(len(lines), 2)
        for line, phase in zip(
            lines, ("graph_active_preflight", "graph_user_toolkits")
        ):
            self.assertNotIn("private", line)
            record = json.loads(line.split(" ", 1)[1])
            self.assertEqual(record["phase"], phase)
            self.assertEqual(record["elapsed_ms"], 250)

    def test_malformed_event_and_logging_failure_do_not_raise(self):
        class BrokenEvent(dict):
            def get(self, _key, _default=None):
                raise ValueError("diagnostic input is unusable")

        trace = ChatLatencyTrace(
            session_id="chat\ud800",
            attempt_id="attempt",
            route="chat_stream_v4",
        )
        trace.observe(BrokenEvent())
        trace.observe({"type": ["unhashable"]})
        with patch("chat_latency_diagnostics._write", side_effect=OSError):
            trace.finish("completed")
            emit_latency_phase(
                "graph_setup", started_ns=0,
                session_id="chat\ud800", attempt_id="attempt",
            )


if __name__ == "__main__":
    unittest.main()
