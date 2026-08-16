from __future__ import annotations

import copy
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import context_composition_capability as capability  # noqa: E402
import durable_interaction_host as durable  # noqa: E402
import routes as miso_routes  # noqa: E402
import unchain_adapter as adapter  # noqa: E402
from context_composition_host import (  # noqa: E402
    canonical_private_context_composition_hint_bytes,
)


PRIVATE = {
    "category": "skills",
    "subtype": "expanded_invocation",
    "surface": "messages",
    "utf8_bytes": 12,
    "source_count": 1,
}


class _BootstrapModule:
    @classmethod
    def from_private_hint(cls, private_hint):
        return (cls, private_hint)


class _ResumeAgent:
    provider = "openai"
    model = "gpt-5"
    _display_model = "openai:gpt-5"
    _orchestration_role = "developer"
    _orchestration_next_mode = "default"
    _toolkits = []
    _memory_runtime = {
        "kind": "legacy_context",
        "requested": True,
        "required": True,
        "available": True,
        "reason": "",
        "durability_available": True,
        "durability_reason": "",
        "legacy_context_available": True,
        "legacy_context_reason": "",
    }

    def __init__(self) -> None:
        self.resume_called = False

    def resume_interaction(self, **kwargs):
        self.resume_called = True
        callback = kwargs.get("callback")
        if callable(callback):
            callback(
                {
                    "type": "final_message",
                    "run_id": kwargs.get("run_id"),
                    "iteration": 1,
                    "timestamp": time.time(),
                    "content": "resumed",
                }
            )
        return SimpleNamespace(
            messages=[{"role": "assistant", "content": "resumed"}],
            consumed_tokens=3,
            input_tokens=2,
            output_tokens=1,
            status="completed",
            iteration=1,
            previous_response_id=None,
        )


class _FailingResumeAgent(_ResumeAgent):
    def resume_interaction(self, **_kwargs):
        self.resume_called = True
        raise RuntimeError("provider resume failed")


def _ready() -> capability.ContextCompositionCapabilityVerdict:
    return capability.ContextCompositionCapabilityVerdict(
        ready=True,
        reason="available",
        bootstrap_module=_BootstrapModule,
    )


def _done_payload(payload_text: str) -> dict:
    for block in payload_text.split("\n\n"):
        lines = block.splitlines()
        if lines and lines[0] == "event: done":
            data = next(line[6:] for line in lines if line.startswith("data: "))
            return json.loads(data)
    raise AssertionError("done event was not emitted")


def test_real_v4_private_resume_mutations_keep_exact_closed_reason_and_baseline() -> (
    None
):
    cases = (
        (
            "resume_hint_invalid",
            dict(PRIVATE, source_count=2),
            True,
        ),
        (
            "resume_hint_mismatch",
            dict(PRIVATE, utf8_bytes=13),
            True,
        ),
        (
            "resume_hint_no_baseline",
            dict(PRIVATE),
            False,
        ),
    )

    for index, (expected_code, declaration, has_baseline) in enumerate(cases):
        with tempfile.TemporaryDirectory() as temporary:
            with mock.patch.dict(
                os.environ,
                {"UNCHAIN_DATA_DIR": temporary},
                clear=False,
            ):
                session_id = f"chat-private-resume-{index}"
                source_run_id = f"run-private-resume-{index}"
                source_options = {"modelId": "openai:gpt-5"}
                if has_baseline:
                    source_options["_context_composition_hint_v1"] = dict(PRIVATE)
                durable.save_resume_context(
                    session_id=session_id,
                    run_id=source_run_id,
                    options=source_options,
                    provider="openai",
                    model="gpt-5",
                )
                baseline_before = durable.load_resume_context(
                    session_id,
                    source_run_id,
                )
                pending = {
                    "status": "receipt_recorded",
                    "session_id": session_id,
                    "interaction_id": f"interaction-private-resume-{index}",
                    "source_run_id": source_run_id,
                    "provider": "openai",
                    "model": "gpt-5",
                    "resume_available": True,
                    "resolution": {
                        "outcome": "approved",
                        "response": {},
                    },
                }
                observed_agent_options = []
                observed_saves = []
                agent = _ResumeAgent()
                real_save_resume_context = durable.save_resume_context

                def create_agent(options, **_kwargs):
                    observed_agent_options.append(copy.deepcopy(options))
                    return agent

                def save_resume_context(**kwargs):
                    observed_saves.append(copy.deepcopy(kwargs))
                    return real_save_resume_context(**kwargs)

                def resume_without_execution_control(**kwargs):
                    forwarded = dict(kwargs)
                    forwarded["attempt_id"] = ""
                    forwarded["source_attempt_id"] = ""
                    return adapter.resume_chat_interaction_events(**forwarded)

                with mock.patch(
                    "context_composition_host.resolve_context_composition_capability",
                    return_value=_ready(),
                ), mock.patch.object(
                    miso_routes,
                    "resume_chat_interaction_events",
                    side_effect=resume_without_execution_control,
                ), mock.patch.object(
                    adapter,
                    "get_pending_interaction",
                    return_value=pending,
                ), mock.patch.object(
                    adapter,
                    "_create_agent",
                    side_effect=create_agent,
                ), mock.patch.object(
                    adapter,
                    "save_resume_context",
                    side_effect=save_resume_context,
                ):
                    response = (
                        miso_app.create_app()
                        .test_client()
                        .post(
                            "/chat/stream/v4",
                            json={
                                "mode": "resume_interaction",
                                "threadId": session_id,
                                "attempt_id": f"attempt-private-resume-{index}",
                                "source_attempt_id": source_run_id,
                                "interaction_id": pending["interaction_id"],
                                "options": {
                                    "_context_composition_hint_v1": declaration,
                                },
                            },
                        )
                    )
                    payload_text = response.get_data(as_text=True)
                    done = _done_payload(payload_text)

                assert response.status_code == 200
                assert done.get("error") is None
                assert done["context_composition_availability"] == {
                    "schema": "pupu.context_composition_availability.v2",
                    "code": expected_code,
                }
                assert agent.resume_called is True
                assert "_context_composition_hint_v1" not in payload_text
                assert len(observed_agent_options) == 1
                assert (
                    observed_agent_options[0]["_context_composition_availability_v2"][
                        "code"
                    ]
                    == expected_code
                )
                assert len(observed_saves) == 1

                saved_options = observed_saves[0]["options"]
                baseline_after = durable.load_resume_context(
                    session_id,
                    source_run_id,
                )
                if has_baseline:
                    expected_bytes = canonical_private_context_composition_hint_bytes(
                        PRIVATE
                    )
                    assert (
                        canonical_private_context_composition_hint_bytes(
                            observed_agent_options[0]["_context_composition_hint_v1"]
                        )
                        == expected_bytes
                    )
                    assert (
                        canonical_private_context_composition_hint_bytes(
                            saved_options["_context_composition_hint_v1"]
                        )
                        == expected_bytes
                    )
                    assert (
                        canonical_private_context_composition_hint_bytes(
                            baseline_before["options"]["_context_composition_hint_v1"]
                        )
                        == expected_bytes
                    )
                    assert (
                        canonical_private_context_composition_hint_bytes(
                            baseline_after["options"]["_context_composition_hint_v1"]
                        )
                        == expected_bytes
                    )
                else:
                    assert "_context_composition_hint_v1" not in (
                        observed_agent_options[0]
                    )
                    assert "_context_composition_hint_v1" not in saved_options
                    assert "_context_composition_hint_v1" not in (
                        baseline_after["options"]
                    )


def test_graph_resume_projects_closed_authority_with_and_without_summary() -> None:
    availability = {
        "schema": "pupu.context_composition_availability.v2",
        "code": "resume_hint_mismatch",
    }
    pending = {
        "status": "receipt_recorded",
        "session_id": "graph-composition-chat",
        "interaction_id": "graph-composition-interaction",
        "source_run_id": "graph-composition-source",
        "provider": "openai",
        "model": "gpt-5",
        "resume_kind": "graph_step",
        "resume_available": True,
        "resolution": {"outcome": "approved", "response": {}},
    }
    graph_context = {
        "coordinator_binding_snapshot": {"execution_id": "graph-execution"},
    }
    resolved_options = {
        "modelId": "openai:gpt-5",
        "_context_composition_hint_v1": dict(PRIVATE),
        "_context_composition_availability_v2": dict(availability),
    }
    graph_summary = {
        "type": "stream_summary",
        "run_id": "graph-composition-source",
        "iteration": 2,
        "bundle": {"schema_version": "unchain.run_bundle.v2"},
    }

    for graph_events, expect_bundle in (
        (iter([copy.deepcopy(graph_summary)]), True),
        (iter([{"type": "final_message", "content": "resumed"}]), False),
    ):
        with mock.patch.object(
            adapter,
            "get_pending_interaction",
            return_value=pending,
        ), mock.patch.object(
            adapter,
            "load_graph_step_resume_context",
            return_value=graph_context,
        ), mock.patch.object(
            adapter,
            "resolve_graph_step_resume_options",
            return_value=resolved_options,
        ), mock.patch.object(
            adapter,
            "_load_recipe_from_options",
            return_value=object(),
        ), mock.patch.object(
            adapter,
            "_recipe_has_graph",
            return_value=True,
        ), mock.patch.object(
            adapter,
            "_stream_recipe_graph_events",
            return_value=graph_events,
        ), mock.patch(
            "memory_v2_unchain_runtime_context.runtime_context_from_memory_binding_snapshot",
            return_value=object(),
        ):
            events = list(
                adapter.resume_chat_interaction_events(
                    session_id=pending["session_id"],
                    interaction_id=pending["interaction_id"],
                    options={"_memory_v2_owner_chat_id": "owner-chat"},
                )
            )

        summaries = [event for event in events if event.get("type") == "stream_summary"]
        assert len(summaries) == 1
        assert summaries[0]["context_composition_availability"] == availability
        assert ("bundle" in summaries[0]) is expect_bundle
        assert "_context_composition_hint_v1" not in json.dumps(summaries[0])


def test_flat_resume_failure_emits_closed_authority_before_error() -> None:
    availability = {
        "schema": "pupu.context_composition_availability.v2",
        "code": "resume_hint_invalid",
    }
    pending = {
        "status": "receipt_recorded",
        "session_id": "flat-composition-failure-chat",
        "interaction_id": "flat-composition-failure-interaction",
        "source_run_id": "flat-composition-failure-source",
        "provider": "openai",
        "model": "gpt-5",
        "resume_available": True,
        "resolution": {"outcome": "approved", "response": {}},
    }
    resolved_options = {
        "modelId": "openai:gpt-5",
        "_context_composition_hint_v1": dict(PRIVATE),
        "_context_composition_availability_v2": dict(availability),
    }
    agent = _FailingResumeAgent()

    with mock.patch.object(
        adapter,
        "get_pending_interaction",
        return_value=pending,
    ), mock.patch.object(
        adapter,
        "resolve_resume_options",
        return_value=resolved_options,
    ), mock.patch.object(
        adapter,
        "_load_recipe_from_options",
        return_value=None,
    ), mock.patch.object(
        adapter,
        "_create_agent",
        return_value=agent,
    ), mock.patch.object(
        adapter,
        "save_resume_context",
    ), mock.patch.object(
        adapter,
        "clear_resume_context",
    ):
        stream = adapter.resume_chat_interaction_events(
            session_id=pending["session_id"],
            interaction_id=pending["interaction_id"],
        )
        events = []
        with pytest.raises(RuntimeError, match="provider resume failed"):
            while True:
                events.append(next(stream))

    summaries = [event for event in events if event.get("type") == "stream_summary"]
    assert len(summaries) == 1
    assert summaries[0]["context_composition_availability"] == availability
    assert "_context_composition_hint_v1" not in json.dumps(summaries[0])
    assert agent.resume_called is True
