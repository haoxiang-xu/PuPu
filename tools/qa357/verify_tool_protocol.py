"""Independent wire checks: intentionally never imports the protocol fixture."""
import base64
import hashlib
import json
from pathlib import Path
import sys


def verify_tools(root):
    root = Path(root)
    read = lambda name: json.loads((root / name).read_text())
    scenario = read("scenario.json")
    sdk = read("tool-sdk-qualification.json")
    controls = sdk["controls"]
    assert len(controls) == 9 and all(item["passed"] is True for item in controls)
    assert [item["case"] for item in controls] == [
        "real_sdk_function_sse", "missing_output", "wrong_call_id", "wrong_output",
        "wrong_tool_offer", "real_sdk_result_json", "completed_exchange_replay",
        "wrong_tls_hostname", "no_external_route"]
    rows = [json.loads(line) for line in (root / "provider-requests.jsonl").read_text().splitlines()]
    assert len(rows) == 7
    assert [row["refusal"] for row in rows] == [
        None, "tool_output_required", "tool_call_identity", "tool_output_value", "tool_offer", None, "tool_exchange_completed"]
    accepted = refused = 0
    for row in rows:
        assert row["peer"] == "127.0.0.1" and row["method"] == "POST" and row["path"] == "/v1/responses"
        raw = base64.b64decode(row["request_base64"], validate=True)
        assert hashlib.sha256(raw).hexdigest() == row["request_sha256"]
        body = json.loads(raw)
        assert body["model"] == scenario["model"] and body["max_output_tokens"] == scenario["max_output_tokens"]
        response_raw = base64.b64decode(row["response_base64"], validate=True)
        assert hashlib.sha256(response_raw).hexdigest() == row["response_sha256"]
        if row["refusal"]:
            refused += 1
            assert row["status"] == 400 and row["phase_after"] == row["phase_before"]
            assert json.loads(response_raw)["error"]["code"] == row["refusal"]
        else:
            accepted += 1
            assert row["status"] == 200
        assert row["counts"] == {"accepted": accepted, "refused": refused}
    assert (accepted, refused) == (2, 5)
    start, end = rows[0], rows[5]
    assert (start["phase_before"], start["phase_after"], end["phase_before"], end["phase_after"]) == (
        "initial", "awaiting_output", "awaiting_output", "completed")
    frames = base64.b64decode(start["response_base64"]).decode().split("\n\n")
    events = []
    for frame in frames:
        if not frame:
            continue
        event_line, data_line = frame.splitlines()
        assert event_line.startswith("event: ") and data_line.startswith("data: ")
        event = json.loads(data_line[6:])
        assert event_line[7:] == event["type"]
        events.append(event)
    assert len(events) == 6 and [item["sequence_number"] for item in events] == list(range(6))
    assert events[-1]["response"] == start["response"]
    # SDK models may add optional fields with defaults. Every field actually
    # emitted on the wire must survive; SDK-only defaults are not wire fields.
    def same_emitted(wire, decoded):
        if isinstance(wire, dict):
            assert isinstance(decoded, dict) and set(wire) <= set(decoded)
            for key, value in wire.items():
                same_emitted(value, decoded[key])
        elif isinstance(wire, list):
            assert isinstance(decoded, list) and len(wire) == len(decoded)
            for left, right in zip(wire, decoded):
                same_emitted(left, right)
        else:
            assert type(wire) is type(decoded) and wire == decoded
    same_emitted(events, controls[0]["events"])
    call = events[-1]["response"]["output"][0]
    assert call["type"] == "function_call"
    same_emitted(call, controls[0]["call"])
    for key in ["name", "call_id", "arguments"]:
        assert call[key] == scenario["function"][key]
    assert events[2]["delta"] == events[3]["arguments"] == call["arguments"]
    assert events[2]["item_id"] == events[3]["item_id"] == call["id"]
    final_body = json.loads(base64.b64decode(end["request_base64"]))
    output = [item for item in final_body["input"] if item.get("type") == "function_call_output"]
    assert output == [{"type": "function_call_output", "call_id": call["call_id"], "output": scenario["function"]["expected_output"]}]
    final = json.loads(base64.b64decode(end["response_base64"]))
    assert final == end["response"]
    same_emitted(final, controls[5]["final"])
    assert final["id"] == controls[5]["response_id"] != controls[0]["response_id"] == start["response"]["id"]
    assert final["status"] == "completed" and final["output"][0]["content"][0]["text"] == scenario["response_text"]
    assert {item["ifname"] for item in read("offline-interfaces.json")} == {"lo"}
    assert read("offline-routes.json") == []
    write, cold, basic = [read("credential-" + mode + ".json") for mode in ["write", "read", "basic"]]
    assert write["pid"] != cold["pid"] and write["profile"] == cold["profile"]
    assert write["backend"] == cold["backend"] == "gnome_libsecret"
    assert write["exact_round_trip"] is cold["exact_round_trip"] is True
    assert not write["bootstrap_contains_sentinel"] and not cold["database_contains_sentinel"]
    assert basic["rejected_code"] == "secret_storage_unavailable" and basic["provider_rows"] == 0
    assert read("keyring-control.json")["private_secret_service_round_trip"] is True
    result = {"schema": "qa357.tool-protocol-verification.v1", "verdict": "PASS_BOUNDED",
              "sdk_controls": 9, "accepted_calls": accepted, "refused_calls": refused,
              "raw_request_and_response_hashes": len(rows), "app_execution": "NOT_RUN"}
    return result


if __name__ == "__main__":
    result = verify_tools(sys.argv[1])
    with (Path(sys.argv[1]) / "tool-protocol-verification.json").open("x") as target:
        json.dump(result, target, indent=2)
    print(json.dumps(result))
