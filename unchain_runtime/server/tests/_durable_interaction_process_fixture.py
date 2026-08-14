"""Isolated real-process sidecar used by the D3 crash-recovery test.

Only the model and the side-effecting tool are deterministic test doubles.
The HTTP server, routes, durable session store, interaction journal, receipt,
and resume path are the production implementations.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


import unchain_adapter  # noqa: E402  - configures the sibling Unchain source path
from unchain.agent import Agent, MemoryModule, ToolsModule  # noqa: E402
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime  # noqa: E402
from unchain.providers import OpenAIModelIO  # noqa: E402
from unchain.tools import Toolkit  # noqa: E402


_PHASE = os.environ.get("PUPU_D3_PHASE", "").strip().lower()
_DATA_DIR = Path(os.environ["UNCHAIN_DATA_DIR"]).resolve()
_EFFECT_LOG = Path(os.environ["PUPU_D3_EFFECT_LOG"]).resolve()
_MODEL_LOG = Path(os.environ["PUPU_D3_MODEL_LOG"]).resolve()


def _append_json_line(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, default=str))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


class _OpenAIStream:
    def __init__(self, events: list[Any]) -> None:
        self._events = list(events)

    def __enter__(self) -> "_OpenAIStream":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False

    def __iter__(self):
        return iter(self._events)


class _DeterministicOpenAITransport:
    """Offline Responses transport behind the exact built-in OpenAIModelIO."""

    def __init__(self, phase: str) -> None:
        self.phase = phase
        self.call_count = 0

    def client_factory(self, **_kwargs: Any) -> Any:
        transport = self

        class _Responses:
            def create(self, **request_kwargs: Any) -> _OpenAIStream:
                return transport.create_stream(request_kwargs)

        return SimpleNamespace(responses=_Responses())

    def create_stream(self, request_kwargs: dict[str, Any]) -> _OpenAIStream:
        self.call_count += 1
        tools = request_kwargs.get("tools")
        tool_names = [
            tool["name"]
            for tool in tools
            if isinstance(tool, dict) and isinstance(tool.get("name"), str)
        ] if isinstance(tools, list) else []
        _append_json_line(
            _MODEL_LOG,
            {
                "phase": self.phase,
                "call_count": self.call_count,
                "messages": request_kwargs.get("input", []),
                "tool_names": tool_names,
            },
        )

        if self.phase == "initial" and self.call_count == 1:
            safe_arguments = {"value": "safe-before-crash"}
            durable_arguments = {"value": "d3-effect"}
            output = [
                {
                    "type": "function_call",
                    "call_id": "d3-safe-tool-call",
                    "name": "record_safe_effect",
                    "arguments": json.dumps(safe_arguments),
                },
                {
                    "type": "function_call",
                    "call_id": "d3-tool-call",
                    "name": "durable_write_once",
                    "arguments": json.dumps(durable_arguments),
                },
            ]
            response_id = "d3-initial-response"

        elif self.phase == "resume" and self.call_count == 1:
            output = [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": "d3-resumed"}
                    ],
                }
            ]
            response_id = "d3-resume-response"

        else:
            raise AssertionError(
                f"unexpected D3 model request: phase={self.phase!r}, "
                f"call_count={self.call_count}"
            )

        completed = SimpleNamespace(
            id=response_id,
            output=output,
            usage={
                "input_tokens": 1,
                "output_tokens": 1,
                "total_tokens": 2,
            },
        )
        return _OpenAIStream(
            [
                SimpleNamespace(
                    type="response.completed",
                    response=completed,
                )
            ]
        )


def _create_d3_agent(
    _options: dict[str, Any],
    *,
    session_id: str = "",
    fyi_channel: Any = None,
    memory_v2_shadow_run: Any = None,
) -> Agent:
    del session_id, fyi_channel, memory_v2_shadow_run

    store = JsonFileSessionStore(
        base_dir=_DATA_DIR / "memory" / "sessions"
    )
    memory_runtime = KernelMemoryRuntime.from_config(store=store)
    toolkit = Toolkit()

    def append_effect(value: str) -> dict[str, str]:
        _EFFECT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with _EFFECT_LOG.open("a", encoding="utf-8") as handle:
            handle.write(f"{value}\n")
            handle.flush()
            os.fsync(handle.fileno())
        return {"written": value}

    toolkit.register(
        append_effect,
        name="record_safe_effect",
        description="Record one safe D3 side effect before approval.",
    )
    toolkit.register(
        append_effect,
        name="durable_write_once",
        description="Append one durable D3 side effect after approval.",
        requires_confirmation=True,
    )
    model_transport = _DeterministicOpenAITransport(_PHASE)
    model_io = OpenAIModelIO(
        model="gpt-5",
        api_key="d3-offline-test-key",
        client_factory=model_transport.client_factory,
        default_payloads={},
        model_capabilities={},
    )
    agent = Agent(
        name="d3-process-recovery",
        provider=model_io.provider,
        model=model_io.model,
        modules=(
            MemoryModule(memory=memory_runtime),
            ToolsModule(tools=(toolkit,)),
        ),
        model_io_factory=lambda _spec, _context: model_io,
    )

    # PuPu's adapter records these host-facing fields on production agents.
    # The underlying Agent still owns the real Unchain memory/runtime objects.
    agent._memory_runtime = {
        "requested": True,
        "available": True,
        "reason": "",
    }
    agent._max_iterations = 3
    agent._max_context_window_tokens = 8_192
    agent._toolkits = [toolkit]
    agent._display_model = "openai:gpt-5"
    agent._selected_model = "openai:gpt-5"
    agent._developer_model_id = "openai:gpt-5"
    agent._general_model_id = "openai:gpt-5"
    return agent


if _PHASE not in {"initial", "resume"}:
    raise RuntimeError("PUPU_D3_PHASE must be 'initial' or 'resume'")

unchain_adapter._create_agent = _create_d3_agent


from main import main  # noqa: E402  - import routes only after installing the seam


if __name__ == "__main__":
    raise SystemExit(main())
