"""Exercise oversized-read recovery through the deployed host/provider boundary."""
import json
from types import SimpleNamespace

import pytest

from test_memory_v2_unchain_runtime_factory import (
    _factory, _NeverRunOfficialMemoryAgent, _runtime_context,
    _OpenAIResponseStream, OpenAIModelIO, AgentBuilder, AgentCallContext,
    AgentSpec, AgentState, ModelIOFactoryRegistry, ExecutionRuntime,
    InMemorySessionStore, HostResolvedCurrentInput, Toolkit, Tool,
)


@pytest.mark.parametrize("bad_limit", [20000, 50000])
def test_live_oversize_read_recovers_in_next_native_provider_turn(tmp_path, bad_limit):
    host = _factory(
        tmp_path, production_enabled=True, memory_agent_enabled=True,
        memory_agent_model_invoker=_NeverRunOfficialMemoryAgent(),
        generation_resolver=lambda _context, _execution_id: "generation-a",
        current_input_resolver=lambda _context, attempt: HostResolvedCurrentInput(
            attempt=attempt, content="search",
        ),
    )
    requests = []
    pages = []
    source = {"models": "live-models-sentinel-" + "x" * 12000}

    def find_request(value):
        if isinstance(value, dict):
            if value.get("tool") == "context_content_read" and "arguments" in value:
                return value["arguments"]
            for item in value.values():
                found = find_request(item)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for item in value:
                found = find_request(item)
                if found is not None:
                    return found
        elif isinstance(value, str) and value.lstrip().startswith(("{", "[")):
            try:
                return find_request(json.loads(value))
            except json.JSONDecodeError:
                return None
        return None

    class Responses:
        def create(self, **kwargs):
            requests.append(kwargs)
            turn = len(requests)
            if turn == 1:
                reader = next(tool for tool in kwargs["tools"] if tool.get("name") == "context_content_read")
                assert reader["parameters"]["properties"]["limit"]["maximum"] == 8192
                name, arguments = "large_search", {}
            elif turn == 2:
                arguments = find_request(kwargs["input"])
                assert arguments is not None
                self.ref = arguments["ref"]
                arguments = {**arguments, "limit": bad_limit}
                name = "context_content_read"
            else:
                outputs = [json.loads(item["output"]) for item in kwargs["input"] if item.get("type") == "function_call_output"]
                response = outputs[-1]
                if turn == 3:
                    assert response == {"schema_version": "unchain.context_content_error.v1", "trust": "UNTRUSTED_DATA", "code": "CONTEXT_READ_LIMIT_INVALID_USE_INTEGER_1_TO_8192"}
                    arguments = {"ref": self.ref, "offset": 0, "limit": 8192}
                else:
                    pages.append(response)
                    assert response["schema_version"] == "unchain.context_content_page.v1"
                    if response["eof"]:
                        output = [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "recovered"}]}]
                        return _OpenAIResponseStream(SimpleNamespace(id=f"recovery-{turn}", output=output, usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}))
                    arguments = response["next_read"]["arguments"]
                name = "context_content_read"
            output = [{"type": "function_call", "name": name, "call_id": f"recovery-{turn}", "arguments": json.dumps(arguments)}]
            return _OpenAIResponseStream(SimpleNamespace(id=f"recovery-{turn}", output=output, usage={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}))

    responses = Responses()
    builder = AgentBuilder(
        agent=SimpleNamespace(name="normal-agent"),
        spec=AgentSpec(name="normal-agent", provider="openai", model="gpt-test"),
        state=AgentState(), model_io_registry=ModelIOFactoryRegistry(),
        toolkit=Toolkit({"large_search": Tool(name="large_search", description="search", func=lambda: source, output_policy="head_tail")}),
        call_context=AgentCallContext(
            mode="run", input_messages=[{"role": "user", "content": "search"}],
            session_id="execution-a", run_id="attempt-a", max_iterations=6,
            max_context_window_tokens=16384,
            execution_guard=ExecutionRuntime(InMemorySessionStore()).acquire("execution-a"),
            runtime_context=_runtime_context(execution_id="execution-a", attempt_id="attempt-a", run_id="attempt-a"),
        ),
    )
    builder.set_model_io(OpenAIModelIO(model="gpt-test", api_key="test-key", client_factory=lambda **_kwargs: SimpleNamespace(responses=responses), default_payloads={}, model_capabilities={}))
    for module in host.modules_for_active():
        module.configure(builder)
    result = builder.build().run()
    assert result.status == "completed"
    assert len(requests) == 5
    assert len(pages) == 2
    assert json.loads("".join(page["content"]["text"] for page in pages)) == source
