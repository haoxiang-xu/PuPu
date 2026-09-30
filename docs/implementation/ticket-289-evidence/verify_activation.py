"""Scripted #289 activation proof using PuPu assembly and the pinned Unchain wheel.

The caller supplies an isolated installed skill-pack store and the imported
body hash. ModelIO alone is scripted; no provider request or profile read occurs.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from unittest import mock

server_root = Path(sys.argv[1]).resolve()
store_dir = Path(sys.argv[2]).resolve()
body_sha = sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else "first"
transcript_path = Path(sys.argv[5]).resolve() if len(sys.argv) > 5 else store_dir / "activation-transcript.json"
sys.path.insert(0, str(server_root))

import skills_inventory  # noqa: E402
import unchain_adapter as adapter  # noqa: E402
from skill_packs import list_installed_skill_packs  # noqa: E402
from unchain.agent import Agent as UnchainAgent  # noqa: E402
from unchain.agent import MemoryModule, PoliciesModule, ToolsModule  # noqa: E402
from unchain.kernel.types import ModelTurnResult  # noqa: E402
from unchain.skills.rendering import (  # noqa: E402
    is_active_skills_message,
    is_skill_catalog_message,
    parse_active_skills_block,
)

PACK_ID = "skillpack.doc-coauthoring"
COMMAND = "doc-coauthoring"
IDENTITY = f"skillpack:{PACK_ID}:{COMMAND}"


class ScriptedModelIO:
    provider = "openai"

    def __init__(self, results):
        self.model = "gpt-scripted"
        self._results = list(results)
        self.requests = []

    def fetch_turn(self, request):
        self.requests.append(request)
        return self._results.pop(0)


def final(text):
    return ModelTurnResult(
        assistant_messages=[{"role": "assistant", "content": text}],
        tool_calls=[],
        final_text=text,
        response_id=f"resp-{len(text)}",
    )


def installed_packs(_data_dir=None):
    return list_installed_skill_packs(data_dir=store_dir)


def build_agent(model_io):
    with mock.patch.object(skills_inventory, "list_installed_skill_packs", side_effect=installed_packs):
        return adapter._build_developer_agent(
            UnchainAgent=UnchainAgent,
            ToolsModule=ToolsModule,
            MemoryModule=MemoryModule,
            PoliciesModule=PoliciesModule,
            provider="openai",
            model="gpt-scripted",
            api_key="",
            max_iterations=6,
            toolkits=[],
            memory_manager=None,
            options={"workspace_roots": [str(store_dir)], "skills": {"include_user_dirs": False}},
            enable_subagents=False,
            model_io_factory=lambda *args, **kwargs: model_io,
        )


def assert_projection(request, expected_user, body, expected_activation=None):
    messages = request.messages
    catalog = [item for item in messages if is_skill_catalog_message(item)]
    active = [item for item in messages if is_active_skills_message(item)]
    assert len(catalog) == 1 and len(active) == 1
    assert f"`{COMMAND}`" in catalog[0]["content"]
    entries = parse_active_skills_block(active[0]["content"])
    assert len(entries) == 1
    (entry,) = entries
    assert entry.identity.key == IDENTITY
    assert entry.identity.name == COMMAND
    assert entry.identity.source == "skillpack" and entry.identity.source_id == PACK_ID
    assert entry.body == body
    assert entry.activation.startswith("user:")
    if expected_activation is not None:
        assert entry.activation == expected_activation
    assert [item for item in messages if item.get("role") == "user"][-1]["content"] == expected_user
    assert sum(
        item.get("content", "").count(body)
        for item in messages if isinstance(item.get("content"), str)
    ) == 1
    return entry.activation


packs = installed_packs()
assert len(packs) == 1 and packs[0]["toolkitId"] == PACK_ID
assert len(packs[0]["skills"]) == 1
body = packs[0]["skills"][0]["body"]
assert hashlib.sha256(body.encode("utf-8")).hexdigest() == body_sha
inventory = skills_inventory.resolve_skill_inventory(
    workspace_root=None, include_user_dirs=False, selected_toolkit_ids=(),
    rows_by_toolkit={}, data_dir=store_dir,
)
assert [summary.identity.key for summary in inventory.skills] == [IDENTITY]

if mode == "first":
    model_io = ScriptedModelIO([final("draft acknowledged"), final("continued")])
    agent = build_agent(model_io)
    user_text = "  /doc-coauthoring Draft a short decision document.  "
    first = agent.run(user_text)
    assert first.status == "completed"
    activation = assert_projection(model_io.requests[0], user_text, body)

    second_text = "Continue the same document."
    second = agent.run([*first.messages, {"role": "user", "content": second_text}])
    assert second.status == "completed"
    assert_projection(model_io.requests[1], second_text, body, activation)
    transcript_path.write_text(
        json.dumps({"messages": second.messages, "activation": activation}), encoding="utf-8"
    )

    cold = subprocess.run(
        [sys.executable, __file__, str(server_root), str(store_dir), body_sha, "cold", str(transcript_path)],
        capture_output=True, text=True, check=True,
    )
    cold_result = json.loads(cold.stdout)
    assert cold_result["coldAgentRebuild"] == "PASS"
    print(json.dumps({
        "status": "PASS",
        "modelIO": "scripted-only",
        "identity": IDENTITY,
        "bodySha256": body_sha,
        "userTextVerbatim": "PASS",
        "bodyOnce": "PASS",
        "secondTurnRetained": "PASS",
        "coldAgentRebuild": "PASS",
        "activation": activation,
    }))
elif mode == "cold":
    prior = json.loads(transcript_path.read_text(encoding="utf-8"))
    model_io = ScriptedModelIO([final("cold continued")])
    agent = build_agent(model_io)
    cold_text = "Continue after rebuilding the agent."
    result = agent.run([*prior["messages"], {"role": "user", "content": cold_text}])
    assert result.status == "completed"
    assert_projection(model_io.requests[0], cold_text, body, prior["activation"])
    print(json.dumps({"coldAgentRebuild": "PASS"}))
else:
    raise ValueError(f"unknown mode: {mode}")
