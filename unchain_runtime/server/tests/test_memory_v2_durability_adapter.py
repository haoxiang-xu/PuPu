from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


import memory_factory  # noqa: E402
import unchain_adapter as ua  # noqa: E402
from unchain.run_bundle import RunBundleReducer, RunLifecycle  # noqa: E402


def _admission(*, mode: str = "active") -> SimpleNamespace:
    return SimpleNamespace(
        is_active=mode == "active",
        mode=mode,
        owner_chat_id="chat-durable",
        session_id="session-durable",
        attempt_id="attempt-durable",
        source_attempt_id="",
        provider="ollama",
        model="test",
        real_context_window_tokens=100_000,
        runtime=object(),
        handoff_messages=[],
        diagnostics=lambda: {
            "schema_version": "memory_v2.context.v1",
            "requested_mode": mode,
            "mode": mode,
        },
    )


def _graph_recipe():
    from recipe import parse_recipe_json

    return parse_recipe_json(
        {
            "name": "Durable graph",
            "description": "",
            "model": "ollama:test",
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": ""},
            "toolkits": [],
            "subagent_pool": [],
            "nodes": [
                {
                    "id": "start",
                    "type": "start",
                    "outputs": [{"name": "text", "type": "string"}],
                },
                {
                    "id": "agent-1",
                    "type": "agent",
                    "override": {"prompt": "work {{#start.text#}}"},
                    "outputs": [{"name": "output", "type": "string"}],
                },
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "kind": "flow",
                    "source_node_id": "start",
                    "source_port_id": "out",
                    "target_node_id": "agent-1",
                    "target_port_id": "in",
                },
                {
                    "id": "edge-2",
                    "kind": "flow",
                    "source_node_id": "agent-1",
                    "source_port_id": "out",
                    "target_node_id": "end",
                    "target_port_id": "in",
                },
            ],
        }
    )


class MemoryV2DurabilityAdapterTests(unittest.TestCase):
    def test_active_resolution_forces_durability_without_qdrant_or_embeddings(self):
        admission = _admission()
        with tempfile.TemporaryDirectory() as data_dir, \
            mock.patch.dict(
                os.environ,
                {"UNCHAIN_DATA_DIR": data_dir},
                clear=False,
            ), \
            mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", False), \
            mock.patch.object(
                memory_factory,
                "_get_or_create_qdrant_client",
                side_effect=AssertionError("qdrant must not be initialized"),
            ) as qdrant, \
            mock.patch.object(
                memory_factory,
                "resolve_embedding_config",
                side_effect=AssertionError("embedding must not be resolved"),
            ) as resolve_embedding, \
            mock.patch.object(
                memory_factory,
                "_build_embed_runtime",
                side_effect=AssertionError("embedding runtime must not be built"),
            ) as build_embedding, \
            mock.patch.object(
                memory_factory,
                "create_memory_manager_with_diagnostics",
                side_effect=AssertionError("legacy memory must not be created"),
            ) as legacy_factory:
            status, runtime = ua._resolve_memory_runtime(
                {"memory_enabled": False},
                session_id="session-durable",
                memory_v2_admission=admission,
            )

        self.assertIsNotNone(runtime)
        self.assertEqual(
            status,
            {
                "kind": "v2_durability",
                "requested": True,
                "required": True,
                "available": True,
                "reason": "",
                "durability_available": True,
                "durability_reason": "",
                "legacy_context_available": False,
                "legacy_context_reason": "",
            },
        )
        qdrant.assert_not_called()
        resolve_embedding.assert_not_called()
        build_embedding.assert_not_called()
        legacy_factory.assert_not_called()

    def test_shadow_and_off_keep_legacy_factory_contract(self):
        legacy_manager = object()
        for mode in ("shadow", "off"):
            with self.subTest(mode=mode), mock.patch.object(
                memory_factory,
                "create_memory_manager_with_diagnostics",
                return_value=(legacy_manager, ""),
            ) as legacy_factory, mock.patch.object(
                memory_factory,
                "create_durable_kernel_runtime_with_diagnostics",
                side_effect=AssertionError("durability factory is active-only"),
            ) as durable_factory:
                status, manager = ua._resolve_memory_runtime(
                    {"memory_enabled": True},
                    session_id="session-legacy",
                    memory_v2_admission=_admission(mode=mode),
                )

            self.assertIs(manager, legacy_manager)
            self.assertEqual(
                status,
                {
                    "kind": "legacy_context",
                    "requested": True,
                    "required": False,
                    "available": True,
                    "reason": "",
                    "durability_available": True,
                    "durability_reason": "",
                    "legacy_context_available": True,
                    "legacy_context_reason": "",
                },
            )
            legacy_factory.assert_called_once_with(
                {"memory_enabled": True},
                session_id="session-legacy",
            )
            durable_factory.assert_not_called()

    def test_fake_active_normal_and_resume_fail_before_durability_mount(self):
        for lifecycle_options in (
            {},
            {"_memory_v2_source_attempt_id": "attempt-source"},
        ):
            with self.subTest(lifecycle_options=lifecycle_options), \
                mock.patch.object(ua, "_UnchainAgent", object), \
                mock.patch.object(ua, "parse_custom_provider", return_value=None), \
                mock.patch.object(ua, "_load_recipe_from_options", return_value=None), \
                mock.patch.object(
                    ua,
                    "get_runtime_config",
                    return_value={"provider": "ollama", "model": "test"},
                ), \
                mock.patch.object(ua, "_resolve_agent_api_key", return_value=""), \
                mock.patch.object(
                    ua,
                    "get_max_context_window_tokens",
                    return_value=100_000,
                ), \
                mock.patch.object(
                    ua,
                    "_resolve_memory_v2_admission",
                    return_value=_admission(),
                ), \
                mock.patch.object(
                    ua,
                    "_resolve_memory_runtime",
                    side_effect=AssertionError(
                        "durability must not mount without official preflight"
                    ),
                ) as resolve_runtime, \
                mock.patch.object(
                    ua,
                    "_build_developer_agent",
                    side_effect=AssertionError(
                        "agent must not build without official preflight"
                    ),
                ) as build_agent:
                with self.assertRaisesRegex(
                    RuntimeError,
                    "official Unchain run preflight",
                ):
                    ua._create_agent(
                        {
                            "modelId": "ollama:test",
                            "memory_enabled": False,
                            **lifecycle_options,
                        },
                        session_id="session-durable",
                    )

            resolve_runtime.assert_not_called()
            build_agent.assert_not_called()

    def test_fake_active_graph_and_subagent_fail_before_durability_mount(self):
        recipe = _graph_recipe()
        for recipe_subagent_run in (False, True):
            with self.subTest(recipe_subagent_run=recipe_subagent_run), \
                mock.patch.object(ua, "_UnchainAgent", object), \
                mock.patch.object(
                    ua,
                    "_resolve_memory_v2_admission",
                    return_value=_admission(),
                ), \
                mock.patch.object(
                    ua,
                    "_resolve_memory_runtime",
                    side_effect=AssertionError(
                        "durability must not mount without official preflight"
                    ),
                ) as resolve_runtime, \
                mock.patch.object(
                    ua,
                    "_build_developer_agent",
                    side_effect=AssertionError(
                        "graph agent must not build without official preflight"
                    ),
                ) as build_agent:
                with self.assertRaisesRegex(
                    RuntimeError,
                    "official Unchain run preflight",
                ):
                    list(ua._stream_recipe_graph_events(
                        recipe=recipe,
                        message="hello",
                        history=[],
                        attachments=[],
                        options={
                            "modelId": "ollama:test",
                            "memory_enabled": False,
                            "_recipe_subagent_run": recipe_subagent_run,
                        },
                        session_id="session-durable",
                    ))

            resolve_runtime.assert_not_called()
            build_agent.assert_not_called()

    def test_active_graph_with_history_fails_closed_when_durability_is_unavailable(self):
        recipe = _graph_recipe()
        admission = _admission()
        run_calls = []

        class GraphAgent:
            def run(self, **kwargs):
                run_calls.append(kwargs)
                callback = kwargs.get("callback")
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": kwargs.get("run_id", ""),
                            "iteration": 1,
                            "content": "must not run",
                        }
                    )
                return SimpleNamespace(
                    status="completed",
                    messages=[
                        {"role": "assistant", "content": "must not run"}
                    ],
                )

        options = {
            "modelId": "ollama:test",
            "memory_enabled": False,
            "_memory_v2_requested": True,
            "_memory_v2_owner_chat_id": "chat-durable",
            "_memory_v2_attempt_id": "attempt-durable",
        }
        unavailable = {
            "kind": "v2_durability",
            "requested": True,
            "required": True,
            "available": False,
            "reason": "durable_runtime_unavailable",
        }
        with mock.patch.object(ua, "_UnchainAgent", object), \
            mock.patch.object(
                ua,
                "_inspect_memory_v2_rollout_intent",
                return_value={"target_mode": "active"},
            ), \
            mock.patch(
                "memory_v2_store_boundary.configured_context_v2_store_owner",
                return_value="unchain",
            ), \
            mock.patch.object(
                ua,
                "get_pending_interaction",
                return_value={"status": "none"},
            ), \
            mock.patch(
                "memory_v2_unchain_agent_selection.select_pupu_memory_agent_invoker",
                return_value=SimpleNamespace(
                    host_invoker_factory=lambda: None,
                ),
            ), \
            mock.patch(
                "memory_v2_unchain_active_bridge.preflight_pupu_unchain_active_host",
                return_value=object(),
            ) as preflight, \
            mock.patch.object(
                ua,
                "_resolve_memory_v2_admission",
                return_value=admission,
            ), \
            mock.patch.object(
                ua,
                "_resolve_memory_runtime",
                return_value=(unavailable, None),
            ) as resolve_runtime, \
            mock.patch.object(
                ua,
                "_build_developer_agent",
                return_value=GraphAgent(),
            ) as build_agent, \
            mock.patch.object(
                ua,
                "_build_requested_toolkits",
                return_value=[],
            ), \
            mock.patch.object(ua, "get_durable_jobs_runtime", return_value=None), \
            mock.patch.object(ua, "_memory_v2_bind_recalled_refs"), \
            mock.patch.object(ua, "_import_memory_v2_history"), \
            mock.patch.object(
                ua,
                "_bootstrap_memory_v2_current_request",
                return_value={},
            ), \
            mock.patch.object(ua, "_prepare_memory_v2_first_message_recall"), \
            mock.patch.object(ua, "_persist_memory_v2_run_started"), \
            mock.patch.object(ua, "_persist_memory_v2_semantic_event"), \
            mock.patch.object(
                ua,
                "_build_memory_v2_tool_runtime_config",
                return_value={},
            ), \
            mock.patch.object(ua, "_build_bundle_from_result", return_value={}), \
            mock.patch.object(ua, "_finalize_memory_v2_curator"):
            events = list(
                ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="new user",
                    history=[
                        {"role": "user", "content": "old user"},
                        {"role": "assistant", "content": "old assistant"},
                    ],
                    attachments=[],
                    options=options,
                    session_id="session-durable",
                    run_id_override="attempt-durable",
                    runtime_context=ua._memory_v2_root_runtime_context(
                        options=options,
                        execution_id="session-durable",
                        run_id="attempt-durable",
                    ),
                )
            )

        resolve_runtime.assert_called_once()
        runtime_options = resolve_runtime.call_args.args[0]
        self.assertEqual(
            {key: runtime_options.get(key) for key in options},
            options,
        )
        self.assertIs(runtime_options.get("_memory_v2_unchain_active_preflight"), True)
        self.assertEqual(
            resolve_runtime.call_args.kwargs,
            {
                "session_id": "session-durable",
                "memory_v2_admission": admission,
            },
        )
        preflight.assert_called_once()
        self.assertEqual(
            [event.get("type") for event in events],
            ["memory_prepare", "error"],
        )
        self.assertEqual(events[0].get("fallback_reason"), "durable_runtime_unavailable")
        self.assertEqual(events[1].get("code"), ua._MEMORY_UNAVAILABLE_CODE)
        build_agent.assert_not_called()
        self.assertEqual(run_calls, [])

    def test_raw_workflow_subagent_scope_cannot_forge_active_durability(self):
        recipe = _graph_recipe()
        observed_admission_options = []

        def resolve_admission(resolved_options, **_kwargs):
            observed_admission_options.append(dict(resolved_options))
            return _admission()

        agent = ua._WorkflowRecipeSubagentAgent(
            recipe=recipe,
            options={"modelId": "ollama:test", "memory_enabled": False},
            name="Nested workflow",
        )
        with mock.patch.object(ua, "_UnchainAgent", object), \
            mock.patch.object(
                ua,
                "_resolve_memory_v2_admission",
                side_effect=resolve_admission,
            ), \
            mock.patch.object(
                ua,
                "_resolve_memory_runtime",
                side_effect=AssertionError(
                    "raw scope must not mount active durability"
                ),
            ) as resolve_runtime, \
            mock.patch.object(
                ua,
                "_build_developer_agent",
                side_effect=AssertionError(
                    "raw scope must not build an active child"
                ),
            ) as build_agent:
            result = agent.run(
                [{"role": "user", "content": "inspect the graph"}],
                session_id="session-durable",
                run_id="child-run-durable",
                tool_runtime_config={
                    "memory_v2_context": {
                        "owner_chat_id": "chat-durable",
                        "attempt_id": "attempt-durable",
                        "source_attempt_id": "attempt-parent",
                    }
                },
            )

        self.assertEqual(result.status, "failed")
        self.assertIn(
            "official Unchain run preflight",
            result.messages[-1]["content"],
        )
        self.assertEqual(len(observed_admission_options), 1)
        observed = observed_admission_options[0]
        self.assertIs(observed.get("_recipe_subagent_run"), True)
        self.assertEqual(observed.get("_memory_v2_owner_chat_id"), "chat-durable")
        self.assertEqual(observed.get("_memory_v2_attempt_id"), "attempt-durable")
        self.assertEqual(
            observed.get("_memory_v2_source_attempt_id"),
            "attempt-parent",
        )
        resolve_runtime.assert_not_called()
        build_agent.assert_not_called()

    def test_fake_active_graph_never_enters_legacy_host_lease_path(self):
        recipe = _graph_recipe()

        with mock.patch.object(ua, "_UnchainAgent", object), \
            mock.patch.object(
                ua,
                "_resolve_memory_v2_admission",
                return_value=_admission(),
            ), \
            mock.patch.object(
                ua,
                "_resolve_memory_runtime",
                side_effect=AssertionError(
                    "legacy host lease path must remain unreachable"
                ),
            ) as resolve_runtime:
            with self.assertRaisesRegex(
                RuntimeError,
                "official Unchain run preflight",
            ):
                list(ua._stream_recipe_graph_events(
                    recipe=recipe,
                    message="hello",
                    history=[],
                    attachments=[],
                    options={
                        "modelId": "ollama:test",
                        "memory_enabled": False,
                    },
                    session_id="session-durable",
                    run_id_override="attempt-durable",
                ))

        resolve_runtime.assert_not_called()

    def test_shadow_and_off_graph_history_keep_legacy_prepare_commit_contract(self):
        recipe = _graph_recipe()

        class LegacyManager:
            def __init__(self):
                self.prepared = []
                self.committed = []
                self.last_prepare_info = {"session_revision": 3}
                self.last_commit_info = {}

            def prepare_messages(self, **kwargs):
                self.prepared.append(kwargs)
                return list(kwargs["incoming"])

            def commit_messages(self, **kwargs):
                self.committed.append(kwargs)

        class GraphAgent:
            def run(self, **kwargs):
                callback = kwargs.get("callback")
                if callable(callback):
                    callback(
                        {
                            "type": "final_message",
                            "run_id": kwargs.get("run_id", ""),
                            "iteration": 1,
                            "content": "done",
                        }
                    )
                bundle = RunBundleReducer.reduce(
                    identity=kwargs["_run_bundle_identity"],
                    lifecycle=RunLifecycle(
                        status="completed",
                        started_at="2026-08-14T00:00:00.000000000Z",
                        completed_at="2026-08-14T00:00:01.000000000Z",
                    ),
                    receipts=(),
                )
                return SimpleNamespace(
                    status="completed",
                    messages=[{"role": "assistant", "content": "done"}],
                    run_bundle=bundle.to_dict(),
                )

        history = [
            {"role": "user", "content": "old user"},
            {"role": "assistant", "content": "old assistant"},
        ]
        for mode in ("shadow", "off"):
            manager = LegacyManager()
            built_memory = []

            def build_agent(**kwargs):
                built_memory.append(kwargs.get("memory_manager"))
                return GraphAgent()

            options = {
                "modelId": "ollama:test",
                "memory_enabled": True,
            }
            with self.subTest(mode=mode), \
                tempfile.TemporaryDirectory() as data_dir, \
                mock.patch.dict(
                    os.environ,
                    {"UNCHAIN_DATA_DIR": data_dir},
                    clear=False,
                ), \
                mock.patch.object(ua, "_UnchainAgent", object), \
                mock.patch.object(
                    ua,
                    "_resolve_memory_v2_admission",
                    return_value=_admission(mode=mode),
                ), \
                mock.patch.object(
                    ua,
                    "_build_developer_agent",
                    side_effect=build_agent,
                ), \
                mock.patch.object(ua, "_build_requested_toolkits", return_value=[]), \
                mock.patch.object(ua, "get_durable_jobs_runtime", return_value=None), \
                mock.patch.object(ua, "_persist_memory_v2_run_started"), \
                mock.patch.object(ua, "_persist_memory_v2_semantic_event"), \
                mock.patch.object(
                    ua,
                    "_build_memory_v2_tool_runtime_config",
                    return_value={},
                ), \
                mock.patch.object(ua, "_finalize_memory_v2_curator"), \
                mock.patch.object(ua, "_build_bundle_from_result", return_value={}), \
                mock.patch.object(
                    memory_factory,
                    "create_memory_manager_with_diagnostics",
                    return_value=(manager, ""),
                ) as legacy_factory, \
                mock.patch.object(
                    memory_factory,
                    "create_durable_kernel_runtime_with_diagnostics",
                    side_effect=AssertionError("durability is active-only"),
                ) as durable_factory:
                events = list(
                    ua._stream_recipe_graph_events(
                        recipe=recipe,
                        message="new user",
                        history=history,
                        attachments=[],
                        options=options,
                        session_id="session-legacy",
                    )
                )

            self.assertTrue(
                any(event.get("type") == "final_message" for event in events)
            )
            legacy_factory.assert_called_once_with(
                options,
                session_id="session-legacy",
            )
            durable_factory.assert_not_called()
            self.assertEqual(built_memory, [None])
            self.assertEqual(
                manager.prepared[0]["incoming"],
                [
                    *history,
                    {"role": "user", "content": "new user"},
                ],
            )
            self.assertEqual(
                manager.committed[0]["full_conversation"],
                [
                    *history,
                    {"role": "user", "content": "new user"},
                    {"role": "assistant", "content": "done"},
                ],
            )


if __name__ == "__main__":
    unittest.main()
