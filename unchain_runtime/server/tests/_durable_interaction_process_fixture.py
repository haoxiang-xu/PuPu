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
from typing import Any


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


import unchain_adapter  # noqa: E402  - configures the sibling Unchain source path
from unchain.agent import Agent, MemoryModule, ToolsModule  # noqa: E402
from unchain.kernel import ModelTurnResult  # noqa: E402
from unchain.kernel.types import ToolCall  # noqa: E402
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime  # noqa: E402
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


class _DeterministicModelIO:
    provider = "openai"
    model = "gpt-5"

    def __init__(self, phase: str) -> None:
        self.phase = phase
        self.call_count = 0

    def fetch_turn(self, request: Any) -> ModelTurnResult:
        self.call_count += 1
        _append_json_line(
            _MODEL_LOG,
            {
                "phase": self.phase,
                "call_count": self.call_count,
                "messages": request.copied_messages(),
                "tool_names": list(request.toolkit.tools),
            },
        )

        if self.phase == "initial" and self.call_count == 1:
            safe_arguments = {"value": "safe-before-crash"}
            durable_arguments = {"value": "d3-effect"}
            return ModelTurnResult(
                assistant_messages=[
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
                    }
                ],
                tool_calls=[
                    ToolCall(
                        call_id="d3-safe-tool-call",
                        name="record_safe_effect",
                        arguments=safe_arguments,
                    ),
                    ToolCall(
                        call_id="d3-tool-call",
                        name="durable_write_once",
                        arguments=durable_arguments,
                    )
                ],
                response_id="d3-initial-response",
            )

        if self.phase == "resume" and self.call_count == 1:
            return ModelTurnResult(
                assistant_messages=[
                    {"role": "assistant", "content": "d3-resumed"}
                ],
                tool_calls=[],
                final_text="d3-resumed",
                response_id="d3-resume-response",
            )

        raise AssertionError(
            f"unexpected D3 model request: phase={self.phase!r}, "
            f"call_count={self.call_count}"
        )


def _create_d3_agent(
    _options: dict[str, Any],
    *,
    session_id: str = "",
    fyi_channel: Any = None,
) -> Agent:
    del session_id, fyi_channel

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
    model_io = _DeterministicModelIO(_PHASE)
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
