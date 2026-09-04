from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter as adapter  # noqa: E402
from production_run_ownership import (  # noqa: E402
    PupuProductionProviderTurnOwnershipFactory,
    STORE_DIRECTORY,
    production_ownership_factory_for_agent,
)
from recipe import parse_recipe_json  # noqa: E402
from run_bundle_ledger import ledger_from_environment  # noqa: E402
from unchain.agent import Agent  # noqa: E402
from unchain.providers import OllamaModelIO  # noqa: E402
from unchain.providers.turn_ownership import (  # noqa: E402
    ProviderTurnOwnershipFactory,
)
from unchain.run_bundle import (  # noqa: E402
    RunBundleReducer,
    RunDescriptor,
    RunIdentity,
    RunLifecycle,
)
from unchain.run_bundle_v2 import CompactRunBundle  # noqa: E402


class _Result:
    messages = [{"role": "assistant", "content": "done"}]
    status = "completed"
    consumed_tokens = 0
    input_tokens = 0
    output_tokens = 0
    iteration = 0
    previous_response_id = None


class _CapturingAgent:
    provider = "openai"
    model = "gpt-test"
    _display_model = "openai:gpt-test"
    _toolkits = []
    _max_iterations = 1
    _max_context_window_tokens = 8_192

    def __init__(self, *, active=False, shadow=False) -> None:
        self.run_kwargs = None
        if active:
            self._memory_v2_unchain_active_bridge = SimpleNamespace(
                execution_id="execution-wiring",
            )
        if shadow:
            self._memory_v2_unchain_shadow_bridge = SimpleNamespace(
                compose_event_callback=lambda callback: callback,
            )

    def run(self, **kwargs):
        self.run_kwargs = kwargs
        callback = kwargs.get("callback")
        if callable(callback):
            callback(
                {
                    "type": "final_message",
                    "run_id": kwargs.get("run_id") or "run",
                    "iteration": 0,
                    "content": "done",
                }
            )
        return _Result()


def _plain_events(agent):
    with mock.patch.object(
        adapter,
        "_load_recipe_from_options",
        return_value=None,
    ), mock.patch.object(
        adapter,
        "_create_agent",
        return_value=agent,
    ), mock.patch.object(
        adapter,
        "_build_bundle_from_result",
        return_value=None,
    ):
        return list(
            adapter.stream_chat_events(
                message="hello",
                history=[],
                attachments=[],
                options={"modelId": "openai:gpt-test"},
                session_id="execution-wiring",
            )
        )


def test_memory_off_root_receives_the_generic_production_factory():
    agent = _CapturingAgent()

    _plain_events(agent)

    factory = agent.run_kwargs.get("_provider_turn_ownership_factory")
    assert factory is production_ownership_factory_for_agent()
    assert isinstance(factory, ProviderTurnOwnershipFactory)


def test_shadow_root_receives_generic_factory_but_active_omits_it():
    shadow = _CapturingAgent(shadow=True)
    active = _CapturingAgent(active=True)

    _plain_events(shadow)
    _plain_events(active)

    assert (
        shadow.run_kwargs.get("_provider_turn_ownership_factory")
        is production_ownership_factory_for_agent()
    )
    assert "_provider_turn_ownership_factory" not in active.run_kwargs


def _two_step_recipe():
    return parse_recipe_json(
        {
            "name": "Ownership graph",
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
                    "id": "first",
                    "type": "agent",
                    "override": {"prompt": "first {{#start.text#}}"},
                    "outputs": [{"name": "output", "type": "string"}],
                },
                {
                    "id": "second",
                    "type": "agent",
                    "override": {"prompt": "{{#first.output#}} second"},
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
                    "target_node_id": "first",
                    "target_port_id": "in",
                },
                {
                    "id": "edge-2",
                    "kind": "flow",
                    "source_node_id": "first",
                    "source_port_id": "out",
                    "target_node_id": "second",
                    "target_port_id": "in",
                },
                {
                    "id": "edge-3",
                    "kind": "flow",
                    "source_node_id": "second",
                    "source_port_id": "out",
                    "target_node_id": "end",
                    "target_port_id": "in",
                },
            ],
        }
    )


def test_memory_off_graph_uses_one_ledger_for_cold_continuation_and_diagnostics(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    captured = []
    send_calls = []

    class _OllamaResponse:
        status_code = 200

        def __init__(self, text):
            self.text = text

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_lines(self):
            yield json.dumps(
                {
                    "message": {"content": self.text},
                    "done": True,
                    "prompt_eval_count": 2,
                    "eval_count": 1,
                }
            )

        def read(self):
            return b""

    def build_agent(**kwargs):
        instructions = kwargs["recipe"].agent.prompt

        def stream_factory(method, url, **request_kwargs):
            send_calls.append(
                {
                    "method": method,
                    "url": url,
                    **copy.deepcopy(request_kwargs),
                }
            )
            return _OllamaResponse(instructions)

        model_io = OllamaModelIO(
            model=kwargs["model"],
            stream_factory=stream_factory,
        )
        agent = Agent(
            name="memory-off-graph-step",
            instructions=instructions,
            provider=kwargs["provider"],
            model=kwargs["model"],
            model_io_factory=lambda _spec, _context: model_io,
        )
        original_run = agent.run

        def recording_run(**run_kwargs):
            captured.append(copy.copy(run_kwargs))
            return original_run(**run_kwargs)

        agent.run = recording_run
        return agent

    with mock.patch.object(
        adapter,
        "_UnchainAgent",
        object,
    ), mock.patch.object(
        adapter,
        "_build_developer_agent",
        side_effect=build_agent,
    ), mock.patch.object(
        adapter,
        "_build_requested_toolkits",
        return_value=[],
    ), mock.patch.object(
        adapter,
        "get_durable_jobs_runtime",
        return_value=None,
    ):
        events = list(
            adapter._stream_recipe_graph_events(
                recipe=_two_step_recipe(),
                message="hello",
                history=[],
                attachments=[],
                options={"modelId": "ollama:test"},
                session_id="execution-graph-wiring",
                run_id_override="graph-root-wiring",
            )
        )
        suspended_identity = RunIdentity(
            execution_id="execution-graph-wiring",
            attempt_id="graph-suspended",
            root_run_id="graph-suspended",
            run_id="graph-suspended",
            parent_run_id=None,
            relation="root",
        )
        suspended_owner = production_ownership_factory_for_agent().bind(
            identity=suspended_identity
        )
        suspended_owner.ledger.persist_bundle(
            RunBundleReducer.reduce(
                identity=suspended_identity,
                lifecycle=RunLifecycle(
                    status="suspended",
                    started_at="2026-08-14T00:00:00.000000000Z",
                    completed_at="2026-08-14T00:00:01.000000000Z",
                ),
                receipts=(),
            )
        )
        continued_events = list(
            adapter._stream_recipe_graph_events(
                recipe=_two_step_recipe(),
                message="continue",
                history=[],
                attachments=[],
                options={
                    "modelId": "ollama:test",
                    "_run_bundle_continued_from_run_id": (
                        "graph-suspended"
                    ),
                },
                session_id="execution-graph-wiring",
                run_id_override="graph-root-continued",
            )
        )

    assert len(captured) == 4
    factories = [
        item.get("_provider_turn_ownership_factory") for item in captured
    ]
    assert factories == [production_ownership_factory_for_agent()] * 4
    identities = [item.get("_run_bundle_identity") for item in captured]
    assert all(type(identity) is RunIdentity for identity in identities)
    assert len({identity.attempt_id for identity in identities}) == 4
    assert identities[0].root_run_id == identities[1].root_run_id
    assert identities[2].root_run_id == identities[3].root_run_id
    owners = [
        factory.bind(identity=identity)
        for factory, identity in zip(factories, identities, strict=True)
    ]
    assert all(owner.identity == identity for owner, identity in zip(
        owners,
        identities,
        strict=True,
    ))
    assert all(owner.service.store is owner.ledger for owner in owners)
    assert len(send_calls) == 4

    summary = next(
        event for event in events if event.get("type") == "stream_summary"
    )
    bundle = summary["bundle"]
    assert bundle["identity"]["execution_id"] == "execution-graph-wiring"
    assert bundle["identity"]["run_id"] == "graph-root-wiring"
    assert len(bundle["provider_calls"]) == 2
    assert bundle["aggregation"]["direct_call_ids"] == []
    assert set(bundle["aggregation"]["descendant_call_ids"]) == {
        receipt["provider_call_id"] for receipt in bundle["provider_calls"]
    }

    cold_factory = PupuProductionProviderTurnOwnershipFactory(
        root_directory=tmp_path / STORE_DIRECTORY,
    )
    cold_root = cold_factory.bind(
        identity=RunIdentity.from_dict(bundle["identity"])
    )
    durable = cold_root.ledger.list_bundles(
        root_run_id=bundle["identity"]["root_run_id"],
        run_id=bundle["identity"]["run_id"],
        attempt_id=bundle["identity"]["attempt_id"],
    )
    assert len(durable) == 1
    assert durable[0].to_dict() == bundle

    continued_summary = next(
        event
        for event in continued_events
        if event.get("type") == "stream_summary"
    )
    continued_bundle = continued_summary["bundle"]
    assert continued_bundle["identity"]["run_id"] == (
        "graph-root-continued"
    )
    assert continued_bundle["lifecycle"]["continued_from_run_id"] == (
        "graph-suspended"
    )
    assert continued_summary["completion_diagnostics"]["schema"] == (
        "pupu.completion_diagnostics.v1"
    )
    assert (
        "pupu.run/completion_diagnostics_ref_v1"
        in continued_bundle["extensions"]
    )
    cold_continued = cold_factory.bind(
        identity=RunIdentity.from_dict(continued_bundle["identity"])
    )
    durable_continued = cold_continued.ledger.list_bundles(
        root_run_id=continued_bundle["identity"]["root_run_id"],
        run_id=continued_bundle["identity"]["run_id"],
        attempt_id=continued_bundle["identity"]["attempt_id"],
    )
    assert len(durable_continued) == 1
    assert durable_continued[0].to_dict() == continued_bundle
    assert ledger_from_environment().list_root(
        execution_id=bundle["identity"]["execution_id"],
        root_run_id=bundle["identity"]["root_run_id"],
    ) == ()
    assert ledger_from_environment().list_root(
        execution_id=continued_bundle["identity"]["execution_id"],
        root_run_id=continued_bundle["identity"]["root_run_id"],
    ) == ()


def _ollama_graph_agent_builder(captured, send_calls):
    """Build the fake Ollama-backed agent the graph adapter asks for.

    Same shape as the inline builder in
    ``test_memory_off_graph_uses_one_ledger_for_cold_continuation_and_diagnostics``:
    every provider send is recorded in ``send_calls`` and every ``agent.run``
    call is recorded in ``captured``.
    """

    class _OllamaResponse:
        status_code = 200

        def __init__(self, text):
            self.text = text

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_lines(self):
            yield json.dumps(
                {
                    "message": {"content": self.text},
                    "done": True,
                    "prompt_eval_count": 2,
                    "eval_count": 1,
                }
            )

        def read(self):
            return b""

    def build_agent(**kwargs):
        instructions = kwargs["recipe"].agent.prompt

        def stream_factory(method, url, **request_kwargs):
            send_calls.append(
                {
                    "method": method,
                    "url": url,
                    **copy.deepcopy(request_kwargs),
                }
            )
            return _OllamaResponse(instructions)

        model_io = OllamaModelIO(
            model=kwargs["model"],
            stream_factory=stream_factory,
        )
        agent = Agent(
            name="memory-off-graph-step",
            instructions=instructions,
            provider=kwargs["provider"],
            model=kwargs["model"],
            model_io_factory=lambda _spec, _context: model_io,
        )
        original_run = agent.run

        def recording_run(**run_kwargs):
            captured.append(copy.copy(run_kwargs))
            return original_run(**run_kwargs)

        agent.run = recording_run
        return agent

    return build_agent


def test_memory_off_graph_claims_compact_v2_predecessor_on_cold_continuation(
    tmp_path,
    monkeypatch,
):
    """A compact v2 predecessor is claimable exactly once by a fresh graph run.

    The predecessor is persisted through the same production ledger the
    adapter uses, the continued run's bundle records ``continued_from_run_id``,
    survives a cold reopen, and a second claim by the same successor is
    idempotent instead of minting a second lineage.
    """
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    captured = []
    send_calls = []
    predecessor_identity = RunIdentity(
        execution_id="execution-graph-v2-continuation",
        attempt_id="graph-suspended-v2",
        root_run_id="graph-suspended-v2",
        run_id="graph-suspended-v2",
        parent_run_id=None,
        relation="root",
    )
    predecessor, details = CompactRunBundle.from_facts(
        identity=predecessor_identity,
        lifecycle=RunLifecycle(
            status="cancelled",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
        ),
        descriptor=RunDescriptor(),
        revision=1,
        receipts=(),
        metric_events=(),
        children=(),
    )
    production_ownership_factory_for_agent().bind(
        identity=predecessor_identity
    ).ledger.persist_compact_bundle_with_details(
        bundle=predecessor,
        details=details,
    )

    with mock.patch.object(
        adapter,
        "_UnchainAgent",
        object,
    ), mock.patch.object(
        adapter,
        "_build_developer_agent",
        side_effect=_ollama_graph_agent_builder(captured, send_calls),
    ), mock.patch.object(
        adapter,
        "_build_requested_toolkits",
        return_value=[],
    ), mock.patch.object(
        adapter,
        "get_durable_jobs_runtime",
        return_value=None,
    ):
        continued_events = list(
            adapter._stream_recipe_graph_events(
                recipe=_two_step_recipe(),
                message="continue",
                history=[],
                attachments=[],
                options={
                    "modelId": "ollama:test",
                    "_run_bundle_continued_from_run_id": "graph-suspended-v2",
                },
                session_id="execution-graph-v2-continuation",
                run_id_override="graph-root-continued-v2",
            )
        )

    assert len(send_calls) == 2
    continued_summary = next(
        event
        for event in continued_events
        if event.get("type") == "stream_summary"
    )
    continued_bundle = continued_summary["bundle"]
    assert continued_bundle["identity"]["run_id"] == "graph-root-continued-v2"
    assert continued_bundle["lifecycle"]["continued_from_run_id"] == (
        "graph-suspended-v2"
    )

    cold_factory = PupuProductionProviderTurnOwnershipFactory(
        root_directory=tmp_path / STORE_DIRECTORY,
    )
    successor_identity = RunIdentity.from_dict(continued_bundle["identity"])
    cold_continued = cold_factory.bind(identity=successor_identity)
    durable = cold_continued.ledger.list_bundles(
        root_run_id=continued_bundle["identity"]["root_run_id"],
        run_id=continued_bundle["identity"]["run_id"],
        attempt_id=continued_bundle["identity"]["attempt_id"],
    )
    assert len(durable) == 1
    assert durable[0].to_dict() == continued_bundle
    assert cold_continued.ledger.claim_continuation(
        successor=successor_identity,
        requested_run_id="graph-suspended-v2",
    ) == predecessor
