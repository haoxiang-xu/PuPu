from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

import unchain_adapter as adapter
from durable_interaction_host import DurableInteractionHostError


@pytest.mark.parametrize(
    ("rollout_target", "sticky_active", "expected"),
    (
        ("active", False, True),
        ("shadow", True, True),
        ("shadow", False, False),
        ("off", False, False),
    ),
)
def test_active_graph_candidate_uses_rollout_or_sticky_admission(
    tmp_path,
    monkeypatch,
    rollout_target,
    sticky_active,
    expected,
) -> None:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    with mock.patch.object(
        adapter,
        "_inspect_memory_v2_rollout_intent",
        return_value={"target_mode": rollout_target},
    ), mock.patch(
        "memory_v2_store_boundary.configured_context_v2_store_owner",
        return_value="unchain",
    ), mock.patch(
        "memory_v2_unchain_atomic_bootstrap."
        "pupu_unchain_sticky_active_required",
        return_value=sticky_active,
    ):
        assert adapter._memory_v2_active_graph_candidate(
            {
                "_memory_v2_requested": True,
                "_memory_v2_owner_chat_id": "chat-graph",
            }
        ) is expected


def test_public_durable_active_graph_routes_to_canonical_graph_runtime() -> None:
    recipe = object()
    expected_event = {"type": "probe", "run_id": "graph-root"}
    with mock.patch.object(
        adapter,
        "_load_recipe_from_options",
        return_value=recipe,
    ), mock.patch.object(
        adapter,
        "_recipe_has_graph",
        return_value=True,
    ), mock.patch.object(
        adapter,
        "_recipe_supports_durable_flat_projection",
        return_value=True,
    ), mock.patch.object(
        adapter,
        "_memory_v2_active_graph_candidate",
        return_value=True,
    ), mock.patch.object(
        adapter,
        "_stream_recipe_graph_events",
        return_value=iter((expected_event,)),
    ) as stream_graph:
        events = list(
            adapter.stream_chat_events(
                message="graph task",
                history=[],
                attachments=[],
                options={
                    "durable_interactions_required": True,
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": "chat-graph",
                },
            )
        )

    assert events == [expected_event]
    assert stream_graph.call_count == 1


def test_public_durable_shadow_graph_remains_closed() -> None:
    recipe = object()
    with mock.patch.object(
        adapter,
        "_load_recipe_from_options",
        return_value=recipe,
    ), mock.patch.object(
        adapter,
        "_recipe_has_graph",
        return_value=True,
    ), mock.patch.object(
        adapter,
        "_recipe_supports_durable_flat_projection",
        return_value=False,
    ), mock.patch.object(
        adapter,
        "_memory_v2_active_graph_candidate",
        return_value=False,
    ), pytest.raises(DurableInteractionHostError) as raised:
        list(
            adapter.stream_chat_events(
                message="graph task",
                history=[],
                attachments=[],
                options={
                    "durable_interactions_required": True,
                    "_memory_v2_requested": True,
                    "_memory_v2_owner_chat_id": "chat-graph",
                },
            )
        )

    assert raised.value.code == "durable_recipe_graph_unsupported"


def test_public_graph_wrapper_does_not_complete_a_suspended_attempt() -> None:
    recipe = object()
    control_calls: list[str] = []

    def execution_control(name, *args, **kwargs):
        control_calls.append(name)
        if name == "register":
            return SimpleNamespace(
                disposition="applied",
                snapshot=SimpleNamespace(status="registered"),
            )
        if name == "mark_running":
            return SimpleNamespace(
                disposition="applied",
                snapshot=SimpleNamespace(status="running"),
            )
        raise AssertionError(f"unexpected execution-control call: {name}")

    with mock.patch.object(
        adapter,
        "_execution_control_call",
        side_effect=execution_control,
    ), mock.patch.object(
        adapter,
        "_execution_cancellation_token",
        return_value=None,
    ), mock.patch.object(
        adapter,
        "_load_recipe_from_options",
        return_value=recipe,
    ), mock.patch.object(
        adapter,
        "_recipe_has_graph",
        return_value=True,
    ), mock.patch.object(
        adapter,
        "_recipe_supports_durable_flat_projection",
        return_value=False,
    ), mock.patch.object(
        adapter,
        "_stream_recipe_graph_events",
        return_value=iter(()),
    ):
        assert list(
            adapter.stream_chat_events(
                message="graph task",
                history=[],
                attachments=[],
                options={},
                session_id="session-graph",
                attempt_id="attempt-graph",
            )
        ) == []

    assert control_calls == ["register", "mark_running"]
