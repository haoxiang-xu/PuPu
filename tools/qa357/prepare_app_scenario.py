"""Capture a fixed wheel's real Core/read -> native OpenAI result message."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys


def prepare_app_scenario():
    if sys.platform != "linux" or os.environ.get("QA357_NETNS") != "1":
        raise SystemExit("refuse: hosted disposable Linux namespace required")
    assert {name for _, name in socket.if_nameindex()} == {"lo"}
    from unchain.kernel.types import ToolCall
    from unchain.toolkits import CoreToolkit
    from unchain.tools.messages import OpenAIMessageBuilder

    workspace = Path(os.environ["QA_WORKSPACE"]).resolve(strict=True)
    target = workspace / "qualification.txt"
    assert target.is_file() and target.read_text() == "QA357-APP READ RESULT\n"
    toolkit = CoreToolkit(workspace_root=workspace)
    tool = toolkit.get("read")
    schema = tool.to_provider_json("openai")
    assert schema["type"] == "function" and schema["name"] == "read"
    arguments = {"path": str(target)}
    result = tool.execute(arguments)
    assert result["content"] == "1\tQA357-APP READ RESULT" and "error" not in result
    call = ToolCall(call_id="call_qa357_app_read_1", name="read", arguments=arguments)
    messages = OpenAIMessageBuilder().build_tool_result_messages(tool_call=call, tool_result=result)
    assert len(messages) == 1 and messages[0]["type"] == "function_call_output"
    scenario = {
        "schema": "qa357.tool-fixture.v1", "model": "gpt-6-luna", "max_output_tokens": 512,
        "marker": "QA357-APP", "response_text": "QA357 APP DONE",
        "function": {"name": "read", "call_id": call.call_id,
                     "arguments": json.dumps(arguments), "expected_output": messages[0]["output"]},
    }
    output = Path(os.environ["QA_OUT"]).resolve()
    Path(os.environ["QA_SCENARIO"]).write_text(json.dumps(scenario))
    (output / "scenario.json").write_text(json.dumps(scenario))
    (output / "real-read-producer.json").write_text(json.dumps({
        "schema": schema, "arguments": arguments, "result": result, "messages": messages,
        "core_version": importlib.metadata.version("unchain"),
        "qualification_file_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "note": "Producer qualification read, separate from the later App's one Journal-bound read.",
    }, indent=2))
    toolkit.shutdown()


if __name__ == "__main__":
    prepare_app_scenario()
