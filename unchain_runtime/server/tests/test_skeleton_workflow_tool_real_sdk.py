"""Real SDK serialization/parsing, with HTTP replaced before any socket exists.

The request endpoint and wire are retained at the HTTPX transport seam. This is
not a real-provider test, sidecar-binary test or packaged App test.
"""
from copy import deepcopy
import json

import httpx
import openai

from test_skeleton_workflow_tool_execution import _fixture, _tool_turn
from test_skeleton_agent_runtime import _final_response
from unchain.execution import ExecutionRuntime


def test_fixed_workflow_tool_round_trip_uses_real_responses_sdk_without_network(tmp_path, monkeypatch):
    bridge, client, sessions, writes, build = _fixture(tmp_path, monkeypatch)
    replies = [_tool_turn(), _final_response("real SDK parent")]
    wire = []
    def respond(request):
        assert request.url.scheme == "https" and request.url.host == "api.openai.com"
        assert request.url.path == "/v1/responses"
        assert request.headers["authorization"] == "Bearer offline-sdk-sentinel"
        body = json.loads(request.content)
        wire.append(deepcopy(body))
        assert body["stream"] is True and len(replies) > 0
        output = replies.pop(0)
        response = {"id": output.id, "object": "response", "created_at": 1,
            "status": "completed", "model": body["model"], "output": output.output,
            "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}}
        event = {"type": "response.completed", "response": response}
        return httpx.Response(200, headers={"content-type": "text/event-stream"},
            content=("event: response.completed\ndata: " + json.dumps(event) + "\n\n").encode())
    # This is the actual installed OpenAI class and HTTP client. Only the last
    # transport hop is replaced; no API key lookup or network call is possible.
    with openai.OpenAI(api_key="offline-sdk-sentinel", base_url="https://api.openai.com/v1",
            max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(respond))) as sdk:
        client.responses = sdk.responses
        with ExecutionRuntime(sessions).scope(bridge.execution_id) as guard:
            execution = build(guard)
            execution.create({})
            result, receipt = execution.run(original_task="call the selected Workflow")
    assert result.status == "completed", result.error
    assert result.root_committed and receipt is not None and writes == []
    assert len(wire) == 2 and replies == []
    tool = next(item for item in wire[0]["tools"] if item["name"] == "workflow_echo")
    assert tool["parameters"]["required"] == ["inputs"]
    assert tool["parameters"]["properties"]["inputs"]["type"] == "object"
    assert "committed-workflow-End-output" not in json.dumps(wire[0])
    assert "committed-workflow-End-output" in json.dumps(wire[1]["input"])
    assert "child-only-input" in json.dumps(wire[1]["input"])
