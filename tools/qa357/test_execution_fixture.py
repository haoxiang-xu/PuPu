"""Small pure controls. No socket, server, Electron, provider or external I/O."""
import copy
import json
import unittest

from execution_fixture import (
    FixtureRefusal, SCHEMA, SENTINEL, completed_response,
    response_events, validate_request, validate_scenario,
)


class FixtureControls(unittest.TestCase):
    def setUp(self):
        self.scenario = {
            "schema": SCHEMA, "model": "gpt-6-luna", "max_output_tokens": 32,
            "marker": "QA357-QUALIFIER", "response_text": '{"message":"qualified"}',
        }
        self.headers = {"Host": "api.openai.com", "Authorization": "Bearer " + SENTINEL}
        self.body = {"model": "gpt-6-luna", "max_output_tokens": 32,
                     "input": "QA357-QUALIFIER", "stream": False}

    def wire(self, body=None):
        return json.dumps(self.body if body is None else body, separators=(",", ":")).encode()

    def request(self, **changes):
        params = {"method": "POST", "path": "/v1/responses", "headers": self.headers,
                  "raw": self.wire(), "scenario": self.scenario}
        params.update(changes)
        return validate_request(**params)

    def test_scenario_is_closed_and_does_not_alias(self):
        result = validate_scenario(self.scenario)
        self.assertEqual(result, self.scenario)
        self.assertIsNot(result, self.scenario)
        for key, value, reason in [("unknown", 1, "scenario_shape"),
                                   ("schema", "future", "scenario_version"),
                                   ("max_output_tokens", True, "scenario_value"),
                                   ("marker", "", "scenario_value")]:
            with self.subTest(key=key), self.assertRaisesRegex(FixtureRefusal, "^" + reason + "$"):
                validate_scenario({**self.scenario, key: value})

    def test_real_request_identity_and_opaque_extension_are_preserved(self):
        body = {**self.body, "future_sdk_extension": {"opaque": [1, None, True]}}
        original = copy.deepcopy(body)
        result = self.request(raw=self.wire(body))
        self.assertEqual(result, original)
        self.assertEqual(body, original)

    def test_header_case_and_explicit_default_port_are_equivalent(self):
        result = self.request(headers={"host": "api.openai.com:443", "authorization": "Bearer " + SENTINEL})
        self.assertEqual(result, self.body)

    def test_wrong_identity_is_refused_for_the_exact_reason(self):
        cases = [
            ({"method": "GET"}, "method"),
            ({"path": "/v1/chat/completions"}, "path"),
            ({"headers": {**self.headers, "Host": "other.invalid"}}, "authority"),
            ({"headers": {**self.headers, "Authorization": "Bearer wrong"}}, "credential"),
            ({"headers": {**self.headers, "Authorization": "Bearer \u0085"}}, "credential"),
            ({"raw": self.wire({**self.body, "model": "other"})}, "model"),
            ({"raw": self.wire({**self.body, "max_output_tokens": True})}, "output_budget"),
            ({"raw": self.wire({**self.body, "max_output_tokens": 33})}, "output_budget"),
            ({"raw": self.wire({**self.body, "input": "unrelated"})}, "marker"),
            ({"raw": self.wire({**self.body, "input": {"QA357-QUALIFIER": "unrelated"}})}, "marker"),
            ({"raw": self.wire({**self.body, "stream": "true"})}, "stream"),
        ]
        for changes, reason in cases:
            with self.subTest(reason=reason), self.assertRaisesRegex(FixtureRefusal, "^" + reason + "$"):
                self.request(**changes)

    def test_malformed_or_duplicate_header_authority_is_not_an_untyped_error(self):
        for headers in [[], {7: "value"}, {**self.headers, "host": "other.invalid"}]:
            with self.subTest(headers=headers), self.assertRaisesRegex(FixtureRefusal, "^headers$"):
                self.request(headers=headers)

    def test_malformed_and_ambiguous_json_never_reaches_identity_checks(self):
        for raw in [b"{", b"[]", b"null", b"\xff", b'{"model":NaN}',
                    b'{"model":"a","model":"b"}', b" " * (2 * 1024 * 1024 + 1)]:
            with self.subTest(prefix=raw[:20]), self.assertRaisesRegex(FixtureRefusal, "^json$"):
                self.request(raw=raw)

    def test_response_and_stream_retain_the_same_exact_result(self):
        response = completed_response(self.scenario, 7)
        self.assertEqual(response["output"][0]["content"][0]["text"], self.scenario["response_text"])
        self.assertEqual(response["model"], self.scenario["model"])
        self.assertEqual(response["status"], "completed")
        before = copy.deepcopy(response)
        events = response_events(response)
        self.assertEqual(response, before)
        self.assertEqual([e["sequence_number"] for e in events], list(range(len(events))))
        self.assertEqual(events[0]["type"], "response.created")
        self.assertEqual(events[-1]["type"], "response.completed")
        self.assertEqual(events[-1]["response"], response)
        deltas = [e["delta"] for e in events if e["type"] == "response.output_text.delta"]
        self.assertEqual("".join(deltas), self.scenario["response_text"])
        item_id = response["output"][0]["id"]
        self.assertTrue(all(e.get("item_id", item_id) == item_id for e in events))


if __name__ == "__main__":
    unittest.main(verbosity=2)
