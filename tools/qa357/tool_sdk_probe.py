"""Real installed SDK function-call qualifier; hosted disposable Linux only."""
import errno
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys

import httpx
from openai import BadRequestError, OpenAI


def qualify_tools():
    assert sys.platform == "linux" and os.environ.get("QA357_NETNS") == "1"
    assert {name for _, name in socket.if_nameindex()} == {"lo"}
    assert importlib.metadata.version("openai") == "2.7.1"
    scenario = json.loads(Path(os.environ["QA_SCENARIO"]).read_text())
    function = scenario["function"]
    tools = [{"type": "function", "name": function["name"], "strict": True,
              "description": "Offline qualification only; never an external tool.",
              "parameters": {"type": "object", "properties": {"path": {"type": "string"}},
                             "required": ["path"], "additionalProperties": False}}]
    params = {"model": scenario["model"], "input": [{"role": "user", "content": scenario["marker"]}],
              "tools": tools, "max_output_tokens": scenario["max_output_tokens"]}
    controls = []
    base = "https://api.openai.com/v1"
    with OpenAI(api_key="qa357-offline-only-not-a-real-key", base_url=base, max_retries=0, timeout=5) as client:
        with client.responses.stream(**params) as stream:
            events = list(stream)
            response = stream.get_final_response()
        assert response.status == "completed" and len(response.output) == 1
        call = response.output[0]
        assert call.type == "function_call"
        assert call.name == function["name"] and call.call_id == function["call_id"]
        assert call.arguments == function["arguments"]
        assert json.loads(call.arguments) == {"path": "fixture.txt"}
        assert [event.type for event in events] == [
            "response.created", "response.output_item.added", "response.function_call_arguments.delta",
            "response.function_call_arguments.done", "response.output_item.done", "response.completed"]
        controls.append({"case": "real_sdk_function_sse", "passed": True, "response_id": response.id,
                         "call": call.model_dump(), "events": [event.model_dump() for event in events]})
        followup = {**params, "input": params["input"] + [call.model_dump(),
                    {"type": "function_call_output", "call_id": call.call_id, "output": function["expected_output"]}]}
        def refused(case, options, reason):
            try:
                client.responses.create(**options)
            except BadRequestError as error:
                assert error.status_code == 400 and error.code == reason, (case, error)
                controls.append({"case": case, "reason": reason, "passed": True})
            else:
                raise AssertionError(case + " was accepted")
        refused("missing_output", params, "tool_output_required")
        for field, value, reason in [("call_id", "call_wrong", "tool_call_identity"),
                                     ("output", "wrong-output", "tool_output_value")]:
            options = json.loads(json.dumps(followup))
            options["input"][-1][field] = value
            refused("wrong_" + field, options, reason)
        refused("wrong_tool_offer", {**followup, "tools": [{**tools[0], "name": "wrong"}]}, "tool_offer")
        final = client.responses.create(**followup)
        assert final.status == "completed" and final.output_text == scenario["response_text"]
        assert final.id != response.id and final.model == scenario["model"]
        controls.append({"case": "real_sdk_result_json", "passed": True,
                         "response_id": final.id, "final": final.model_dump()})
        refused("completed_exchange_replay", followup, "tool_exchange_completed")
    with httpx.Client(timeout=5) as wire:
        try:
            wire.get("https://127.0.0.1/v1/responses")
        except httpx.ConnectError as error:
            chain = []
            current = error
            while current is not None:
                chain.append(str(current))
                current = current.__cause__
            assert any("CERTIFICATE_VERIFY_FAILED" in item for item in chain), chain
            controls.append({"case": "wrong_tls_hostname", "passed": True})
        else:
            raise AssertionError("wrong TLS hostname accepted")
    with socket.socket() as sock:
        sock.settimeout(1)
        code = sock.connect_ex(("192.0.2.1", 443))
        assert code in {errno.ENETUNREACH, errno.EHOSTUNREACH}
        controls.append({"case": "no_external_route", "errno": code, "passed": True})
    imported = []
    for name, module in sorted(sys.modules.items()):
        filename = getattr(module, "__file__", None)
        if (name == "openai" or name.startswith("openai.")) and filename and filename.endswith(".py"):
            path = Path(filename).resolve()
            assert "site-packages" in path.parts
            imported.append({"module": name, "path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    with (Path(os.environ["QA_OUT"]) / "tool-sdk-qualification.json").open("x") as target:
        json.dump({"schema": "qa357.tool-sdk-qualification.v1", "controls": controls,
                   "openai_version": importlib.metadata.version("openai"), "imported_modules": imported,
                   "scope": "real SDK tool protocol only; App/Kernel/Code execution NOT_RUN"}, target, indent=2)


if __name__ == "__main__":
    qualify_tools()
