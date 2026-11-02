"""Bounded oracle controls using unchanged records from the actual failed App."""
import base64
import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("oracle", Path(__file__).with_name("app_projection_oracle.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
CAPTURE = json.loads(Path(__file__).with_name("app_projection_capture.json").read_text())


class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="qa357-projection-")
        self.addCleanup(self.temp.cleanup)
        self.allowed = Path(self.temp.name)
        self.root = self.allowed / "pupu-357-user-data-unit"
        self.directory = self.root / "memory_v2"
        self.objects = self.directory / "objects"
        self.objects.mkdir(parents=True)
        self.db = self.directory / "context_v2.sqlite3"
        self.data = copy.deepcopy(CAPTURE)
        self.execution = self.data["events"][0]["execution_id"]
        self.locator = self.allowed / "locator.json"
        self.locator.write_text(json.dumps({"schema": "qa357.app-store-locator.v1",
                                           "user_data": str(self.root), "execution_id": self.execution}))
        with sqlite3.connect(self.db) as connection:
            for table in ["events", "artifacts"]:
                keys = list(self.data[table][0])
                connection.execute(f"create table {table} (" + ",".join(f'"{key}"' for key in keys) + ")")
                for row in self.data[table]:
                    connection.execute(f"insert into {table} values (" + ",".join("?" for _ in keys) + ")", [row[k] for k in keys])
        for name, value in self.data["objects_base64"].items():
            (self.objects / name).write_bytes(base64.b64decode(value))
        self.value = oracle.AppProjectionOracle(self.data["scenario"], self.locator, self.allowed)
        self.value.inspect(self.data["requests"][0], 0)

    def refuse(self, reason, body=None):
        with self.assertRaises(oracle.ProjectionRefusal) as raised:
            self.value.inspect(body or self.data["requests"][1], 1)
        self.assertEqual(str(raised.exception), reason)

    def event(self, seq, change, rehash=True):
        with sqlite3.connect(self.db) as c:
            raw = c.execute("select event_json from events where store_seq=?", (seq,)).fetchone()[0]
            value = json.loads(raw)
            change(value)
            encoded = oracle.canonical(value).decode()
            if rehash:
                c.execute("update events set event_json=?,event_sha256=? where store_seq=?",
                          (encoded, oracle.digest(encoded.encode()), seq))
            else:
                c.execute("update events set event_json=? where store_seq=?", (encoded, seq))

    def test_real_deployed_projection_matches_prior_native_wire(self):
        expected = self.data["requests"][1]["input"][-1]["output"]
        self.assertEqual(self.value.inspect(self.data["requests"][1], 1), expected)
        self.assertNotEqual(expected, self.data["scenario"]["function"]["expected_output"])

    def test_changed_incoming_output_is_not_adopted(self):
        body = copy.deepcopy(self.data["requests"][1])
        body["input"][-1]["output"] = "wrong-output"
        self.refuse("app_wire_request_mismatch", body)

    def test_other_incoming_call_is_not_adopted(self):
        body = copy.deepcopy(self.data["requests"][1])
        body["input"][-1]["call_id"] = "wrong-call"
        self.refuse("app_wire_request_mismatch", body)

    def test_corrupt_event_digest_is_rejected(self):
        self.event(43, lambda e: e["payload"].update(tool_name="wrong"), rehash=False)
        self.refuse("app_event_digest")

    def test_wrong_tool_is_rejected_even_with_rehashed_event(self):
        self.event(43, lambda e: e["payload"].update(tool_name="wrong"))
        self.refuse("app_tool_result_owner")

    def test_wrong_call_is_rejected_even_with_rehashed_event(self):
        self.event(43, lambda e: e["payload"].update(call_id="wrong"))
        self.refuse("app_tool_result_owner")

    def test_wrong_generation_is_rejected(self):
        self.event(43, lambda e: e["attempt"]["generation"].update(generation_id="another-generation"))
        self.refuse("app_tool_result_owner")

    def test_wrong_node_is_rejected(self):
        self.event(43, lambda e: e["attempt"].update(attempt_id="another-node"))
        self.refuse("app_tool_result_owner")

    def test_unapproved_result_is_rejected(self):
        self.event(43, lambda e: e["payload"]["execution_subject"].update(approval_state="denied"))
        self.refuse("app_tool_result_identity")

    def test_wrong_intent_arguments_are_rejected(self):
        self.event(24, lambda e: e["payload"].update(arguments='{"path":"wrong"}'))
        self.refuse("app_tool_intent_identity")

    def test_foreign_result_ref_is_rejected(self):
        self.event(43, lambda e: e["payload"]["full_output_ref"].update(id="artifact-" + "f" * 64))
        self.refuse("app_artifact_owner")

    def test_corrupt_physical_content_is_rejected(self):
        row = next(x for x in self.data["events"] if x["store_seq"] == 43)
        sha = json.loads(row["event_json"])["payload"]["result_sha256"]
        target = self.objects / sha
        content = target.read_bytes()
        target.write_bytes(bytes([content[0] ^ 1]) + content[1:])
        self.refuse("app_artifact_bytes")

    def test_changed_preview_is_rejected(self):
        self.event(43, lambda e: e["payload"]["model_projection"]["result"].update(preview="wrong-preview"))
        self.refuse("app_tool_projection_value")

    def test_changed_projection_source_ref_is_rejected(self):
        self.event(43, lambda e: e["payload"]["model_projection"]["result"]["full_output_ref"].update(id="artifact-" + "a" * 64))
        self.refuse("app_tool_projection_value")

    def test_changed_projection_digest_is_rejected(self):
        self.event(43, lambda e: e["payload"]["model_projection"]["result"].update(content_sha256="0" * 64))
        self.refuse("app_tool_projection_value")

    def test_changed_projection_metadata_is_rejected(self):
        self.event(43, lambda e: e["payload"]["model_projection"]["metadata"].update(source_ref_sha256="0" * 64))
        self.refuse("app_tool_projection_metadata")

    def test_other_chat_has_no_matching_native_source(self):
        value = json.loads(self.locator.read_text())
        value["execution_id"] = "chat-another"
        self.locator.write_text(json.dumps(value))
        self.refuse("app_wire_owner")

    def test_store_outside_allowed_root_is_rejected(self):
        value = json.loads(self.locator.read_text())
        value["user_data"] = str(self.allowed.parent)
        self.locator.write_text(json.dumps(value))
        self.refuse("app_store_path")

    def test_locator_unknown_field_is_rejected(self):
        value = json.loads(self.locator.read_text())
        value["extra"] = "not-authority"
        self.locator.write_text(json.dumps(value))
        self.refuse("app_store_locator")

    def test_actual_fixture_sequence_refuses_changed_output_then_accepts_exact_projection_once(self):
        spec = importlib.util.spec_from_file_location("app_fixture", Path(__file__).with_name("app_tool_fixture.py"))
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        (self.allowed / "actual-app-store.json").write_bytes(self.locator.read_bytes())
        with patch.dict("os.environ", {"QA_OUT": str(self.allowed), "QA_TMP": str(self.allowed)}):
            sequence = fixture.AppToolSequence(self.data["scenario"])
        first = sequence.accept(self.data["requests"][0])
        self.assertEqual(first["output"][0]["call_id"], self.data["scenario"]["function"]["call_id"])
        changed = copy.deepcopy(self.data["requests"][1])
        changed["input"][-1]["output"] = "wrong-output"
        with self.assertRaises(fixture.base.FixtureRefusal) as raised:
            sequence.accept(changed)
        self.assertEqual(str(raised.exception), "app_wire_request_mismatch")
        self.assertEqual(sequence.phase, "awaiting_output")
        final = sequence.accept(self.data["requests"][1])
        self.assertEqual(final["output"][0]["content"][0]["text"], self.data["scenario"]["response_text"])
        self.assertEqual(sequence.phase, "completed")
        with self.assertRaises(fixture.base.FixtureRefusal) as raised:
            sequence.accept(self.data["requests"][1])
        self.assertEqual(str(raised.exception), "tool_exchange_completed")

    def test_wrong_initial_request_cannot_bind_or_advance_fixture(self):
        spec = importlib.util.spec_from_file_location("app_fixture", Path(__file__).with_name("app_tool_fixture.py"))
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        (self.allowed / "actual-app-store.json").write_bytes(self.locator.read_bytes())
        with patch.dict("os.environ", {"QA_OUT": str(self.allowed), "QA_TMP": str(self.allowed)}):
            sequence = fixture.AppToolSequence(self.data["scenario"])
        changed = copy.deepcopy(self.data["requests"][0])
        changed["model"] = "wrong-model"
        with self.assertRaises(fixture.base.FixtureRefusal) as raised:
            sequence.accept(changed)
        self.assertEqual(str(raised.exception), "app_wire_request_mismatch")
        self.assertEqual(sequence.phase, "initial")
        self.assertIsNone(sequence.oracle.owner)
        sequence.accept(self.data["requests"][0])
        self.assertEqual(sequence.phase, "awaiting_output")


if __name__ == "__main__":
    unittest.main(verbosity=2)
