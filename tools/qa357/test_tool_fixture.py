"""Pure protocol controls: no SDK, socket, App, filesystem or provider."""
import copy
import json
import unittest

from tool_fixture import FixtureRefusal, ToolSequence, tool_events, validate_tool_scenario


class ToolControls(unittest.TestCase):
    def setUp(self):
        self.scenario = {
            "schema": "qa357.tool-fixture.v1", "model": "gpt-6-luna",
            "max_output_tokens": 32, "marker": "QA357-TOOL-QUALIFIER",
            "response_text": '{"message":"tool-qualified"}',
            "function": {"name": "qa357_read", "call_id": "call_qa357_read_1",
                         "arguments": '{"path":"fixture.txt"}',
                         "expected_output": "QA357-READ-RESULT"},
        }
        self.initial = {
            "model": "gpt-6-luna", "max_output_tokens": 32,
            "input": [{"role": "user", "content": "QA357-TOOL-QUALIFIER"}],
            "stream": True,
            "tools": [{"type": "function", "name": "qa357_read",
                       "parameters": {"type": "object", "properties": {"path": {"type": "string"}},
                                      "required": ["path"], "additionalProperties": False}}],
            "future_extension": {"opaque": [None, 7]},
        }

    def followup(self, response):
        return {**copy.deepcopy(self.initial), "input": self.initial["input"] + response["output"] + [
            {"type": "function_call_output", "call_id": "call_qa357_read_1", "output": "QA357-READ-RESULT"}]}

    def refused(self, reason, operation):
        with self.assertRaisesRegex(FixtureRefusal, "^" + reason + "$"):
            operation()

    def test_closed_scenario_and_nested_function_do_not_alias(self):
        saved = copy.deepcopy(self.scenario)
        result = validate_tool_scenario(self.scenario)
        result["function"]["name"] = "changed"
        self.assertEqual(self.scenario, saved)
        self.refused("tool_scenario_shape", lambda: validate_tool_scenario({**self.scenario, "extra": 1}))
        self.refused("tool_scenario_version", lambda: validate_tool_scenario({**self.scenario, "schema": "future"}))
        self.refused("tool_function_shape", lambda: validate_tool_scenario({**self.scenario, "function": {**saved["function"], "extra": 1}}))
        for value in [None, [], "[]", '{"path":NaN}', '{"path":1,"path":2}']:
            self.refused("tool_function_arguments", lambda value=value: validate_tool_scenario({**self.scenario, "function": {**saved["function"], "arguments": value}}))

    def test_real_offer_then_exact_result_produces_one_final(self):
        sequence = ToolSequence(self.scenario)
        original = copy.deepcopy(self.initial)
        response = sequence.accept(self.initial)
        self.assertEqual(self.initial, original)
        self.assertEqual(response["status"], "completed")
        call = response["output"][0]
        self.assertEqual(call["type"], "function_call")
        self.assertEqual(call["name"], "qa357_read")
        self.assertEqual(call["call_id"], "call_qa357_read_1")
        self.assertEqual(json.loads(call["arguments"]), {"path": "fixture.txt"})
        final = sequence.accept(self.followup(response))
        self.assertEqual(final["output"][0]["content"][0]["text"], self.scenario["response_text"])
        self.assertNotEqual(response["id"], final["id"])
        self.assertEqual(sequence.phase, "completed")
        self.refused("tool_exchange_completed", lambda: sequence.accept(self.followup(response)))

    def test_wrong_or_ambiguous_offer_does_not_consume_initial_state(self):
        sequence = ToolSequence(self.scenario)
        for tools in [[], [{"type": "function", "name": "other"}], self.initial["tools"] * 2,
                      [{"type": "custom", "name": "qa357_read"}]]:
            self.refused("tool_offer", lambda tools=tools: sequence.accept({**self.initial, "tools": tools}))
        premature = {**self.initial, "input": [{"type": "function_call_output", "call_id": "call_qa357_read_1", "output": "QA357-READ-RESULT"}]}
        self.refused("tool_output_before_call", lambda: sequence.accept(premature))
        self.assertEqual(sequence.phase, "initial")
        self.assertEqual(sequence.accept(self.initial)["output"][0]["type"], "function_call")

    def test_wrong_missing_or_duplicate_result_never_advances_waiting_state(self):
        sequence = ToolSequence(self.scenario)
        response = sequence.accept(self.initial)
        valid = self.followup(response)
        self.refused("tool_output_required", lambda: sequence.accept(self.initial))
        for field, value, reason in [("call_id", "wrong", "tool_call_identity"),
                                     ("output", "wrong", "tool_output_value")]:
            wrong = copy.deepcopy(valid)
            wrong["input"][-1][field] = value
            self.refused(reason, lambda: sequence.accept(wrong))
        duplicate = copy.deepcopy(valid)
        duplicate["input"].append(copy.deepcopy(valid["input"][-1]))
        self.refused("tool_output_ambiguous", lambda: sequence.accept(duplicate))
        wrong = copy.deepcopy(valid)
        wrong["input"][-2]["name"] = "other"
        self.refused("tool_call_echo", lambda: sequence.accept(wrong))
        self.assertEqual(sequence.phase, "awaiting_output")
        self.assertEqual(sequence.accept(valid)["status"], "completed")

    def test_function_call_stream_round_trip_has_consistent_item_and_argument_identity(self):
        response = ToolSequence(self.scenario).accept(self.initial)
        before = copy.deepcopy(response)
        events = tool_events(response)
        self.assertEqual(response, before)
        self.assertEqual([event["sequence_number"] for event in events], list(range(6)))
        self.assertEqual([event["type"] for event in events], [
            "response.created", "response.output_item.added", "response.function_call_arguments.delta",
            "response.function_call_arguments.done", "response.output_item.done", "response.completed"])
        self.assertEqual(events[-1]["response"], response)
        self.assertEqual(events[1]["item"]["arguments"], "")
        self.assertEqual(events[2]["delta"], self.scenario["function"]["arguments"])
        self.assertEqual(events[3]["arguments"], self.scenario["function"]["arguments"])
        self.assertEqual(events[2]["item_id"], response["output"][0]["id"])
        self.assertEqual(events[4]["item"], response["output"][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
