from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter as adapter  # noqa: E402
from context_composition_host import (  # noqa: E402
    build_context_composition_bootstrap_module,
)
from context_composition_capability import (  # noqa: E402
    resolve_context_composition_capability,
)


class _Module:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _Agent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.provider = kwargs["provider"]
        self.model = kwargs["model"]


PRIVATE = {
    "category": "skills",
    "subtype": "expanded_invocation",
    "surface": "messages",
    "utf8_bytes": 12,
    "source_count": 1,
}


def _build(options: dict):
    return adapter._build_developer_agent(
        UnchainAgent=_Agent,
        ToolsModule=_Module,
        MemoryModule=_Module,
        PoliciesModule=_Module,
        provider="openai",
        model="gpt-5",
        api_key="",
        max_iterations=4,
        toolkits=[],
        memory_manager=None,
        options=options,
        enable_subagents=False,
    )


def test_requested_agent_mounts_official_context_composition_module() -> None:
    official = object()
    with mock.patch(
        "context_composition_host.build_context_composition_bootstrap_module",
        return_value=official,
    ) as build:
        agent = _build(
            {
                "_context_composition_hint_v1": PRIVATE,
            }
        )

    assert official in agent.kwargs["modules"]
    build.assert_any_call(PRIVATE)


def test_unrequested_agent_keeps_existing_module_shape() -> None:
    with mock.patch(
        "context_composition_host.build_context_composition_bootstrap_module"
    ) as build:
        agent = _build({})

    build.assert_not_called()
    assert all(module is not None for module in agent.kwargs["modules"])


def test_resume_availability_suppresses_module_but_keeps_private_baseline() -> None:
    options = {
        "_context_composition_hint_v1": PRIVATE,
        "_context_composition_availability_v2": {
            "schema": "pupu.context_composition_availability.v2",
            "code": "resume_hint_mismatch",
        },
    }
    with mock.patch(
        "context_composition_host.build_context_composition_bootstrap_module"
    ) as build:
        agent = _build(options)

    build.assert_not_called()
    assert all(module is not None for module in agent.kwargs["modules"])
    assert options["_context_composition_hint_v1"] == PRIVATE


def test_exact_imported_runtime_builds_the_official_module() -> None:
    verdict = resolve_context_composition_capability()
    module = build_context_composition_bootstrap_module(PRIVATE)

    if not verdict.ready:
        assert module is None
        return
    assert isinstance(module, verdict.bootstrap_module)
    assert dict(module.private_hint) == PRIVATE
