from __future__ import annotations

import copy
import hashlib
import json
import os
import sys
import threading
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter as adapter
import durable_interaction_host as durable_host
from durable_interaction_host import (
    DurableInteractionHostError,
    DurableInteractionReceiptHandoff,
)
from memory_v2_unchain_active_bridge import (
    PupuUnchainActiveBridge,
    PupuUnchainActiveBridgeError,
    prepare_pupu_unchain_active_bridge,
)
from memory_v2_unchain_admission_adapter import (
    open_pupu_unchain_admission_authority,
)
from memory_v2_unchain_host_event_boundary import (
    HOST_EVENT_LANE_PRESENTATION,
    HOST_EVENT_LANE_SEMANTIC,
    PupuUnchainBoundHostEvent,
    PupuUnchainHostEventAuthority,
    PupuUnchainHostEventBoundary,
    PupuUnchainHostEventBoundaryError,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2TextInputDraft,
)
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.context.derived_handoff import DerivedHandoffInputIngress
from unchain.context.ports import ContextConflictError
from unchain.context.graph_checkpoint import (
    GraphCheckpointError,
    GraphCheckpointService,
    GraphExecutionPlan,
    GraphStepBinding,
    JournalGraphCheckpointRepository,
)
from unchain.journal import EventCursor
from unchain.interaction import (
    build_interaction_receipt,
    build_interaction_request,
)
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import ExecutionIdentity, ModuleGrant


OWNER_CHAT_ID = "chat-active-host-event-boundary"
EXECUTION_ID = "execution-active-host-event-boundary"
ROOT_ATTEMPT_ID = "root-active-host-event-boundary"
PAUSED_ATTEMPT_ID = "paused-active-host-event-boundary"
RESUME_ATTEMPT_ID = "resume-active-host-event-boundary"
FRESH_ATTEMPT_ID = "fresh-active-host-event-boundary"


def _grant() -> ModuleGrant:
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=MEMORY_V2_CAPABILITIES,
        delegable_capabilities=MEMORY_V2_CAPABILITIES.difference(
            {MEMORY_EXECUTION_COMPLETE}
        ),
        authority=f"memory-completion:{EXECUTION_ID}",
    )


def _run(
    *,
    attempt_id: str,
    current_input_draft,
    run_lineage: tuple[str, ...] | None = None,
) -> PupuUnchainShadowRunDraft:
    lineage = run_lineage or (attempt_id,)
    return PupuUnchainShadowRunDraft(
        session_id=EXECUTION_ID,
        identity=ExecutionIdentity(
            execution_id=EXECUTION_ID,
            attempt_id=attempt_id,
            run_id=attempt_id,
            run_lineage=lineage,
        ),
        grant=_grant(),
        current_input_draft=current_input_draft,
    )


def _prepare_bridge(
    tmp_path,
    monkeypatch,
    *,
    attempt_id: str = ROOT_ATTEMPT_ID,
    current_input_draft=None,
    run_lineage: tuple[str, ...] | None = None,
) -> PupuUnchainActiveBridge:
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    draft = current_input_draft
    if draft is None:
        draft = PupuMemoryV2TextInputDraft(content="current objective")
    bridge = prepare_pupu_unchain_active_bridge(
        admission=SimpleNamespace(
            is_active=True,
            owner_chat_id=OWNER_CHAT_ID,
            session_id=EXECUTION_ID,
            attempt_id=attempt_id,
        ),
        run=_run(
            attempt_id=attempt_id,
            current_input_draft=draft,
            run_lineage=run_lineage,
        ),
        bootstrap_history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda provider, model: 16_384,
        partial_attempt_sink=lambda value, error: None,
    )
    assert type(bridge) is PupuUnchainActiveBridge
    return bridge


def _bind_attempt(bridge: PupuUnchainActiveBridge, attempt_id: str) -> None:
    state = RunState()
    state.session_state.session_id = EXECUTION_ID
    bridge.modules[0].runtime.bind_context(
        HarnessContext(
            state=state,
            phase="bootstrap",
            event={"run_id": attempt_id},
        )
    )


def _mark_sticky_active() -> None:
    from memory_v2_unchain_atomic_bootstrap import (
        prepare_pupu_unchain_atomic_bootstrap,
    )

    bootstrap = prepare_pupu_unchain_atomic_bootstrap(
        root_dir=Path(os.environ["UNCHAIN_DATA_DIR"]) / "memory_v2",
        owner_chat_id=OWNER_CHAT_ID,
        session_id=EXECUTION_ID,
        execution_id=EXECUTION_ID,
        history=(),
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
    )
    authority = open_pupu_unchain_admission_authority(
        owner_chat_id=OWNER_CHAT_ID,
        preflight_complete=True,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id=OWNER_CHAT_ID,
        session_id=EXECUTION_ID,
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="cold-interaction-test",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=1,
        hash_strategy="sha256_owner_v1",
        provenance={"source": "cold-interaction-test"},
        operation_id="admit-cold-interaction-test",
    )
    authority.mark_chat_bootstrap(
        owner_chat_id=OWNER_CHAT_ID,
        admission_id=admission["admission_id"],
        expected_revision=admission["revision"],
        succeeded=True,
        provenance=bootstrap.provenance(runtime_attempt_id=ROOT_ATTEMPT_ID),
        error_code="",
        operation_id="bootstrap-cold-interaction-test",
    )


def _seed_durable_cold_interaction(
    *,
    response: dict | None,
    source_attempt_id: str = ROOT_ATTEMPT_ID,
):
    from unchain.interaction import (
        INTERACTION_KIND_HUMAN_INPUT,
        build_interaction_request,
    )
    from unchain.interaction.runtime import response_contract_for_kind
    from unchain.kernel import RunState
    from unchain.memory import KernelMemoryRuntime
    from unchain.memory.checkpoint_state import build_execution_checkpoint

    memory = KernelMemoryRuntime.from_config(store=durable_host._session_store())
    state = RunState()
    state.seed_messages([{"role": "user", "content": "confirm cold action"}])
    state.session_state.session_id = EXECUTION_ID
    state.provider_state.provider = "openai"
    state.provider_state.model = "gpt-host-event-test"
    state.memory_state["session_revision"] = 0
    state.iteration = 1
    state.last_continuation = {
        "type": "durable_interaction",
        "occurrence": "cold-ask-user",
    }
    request = build_interaction_request(
        session_id=EXECUTION_ID,
        kind=INTERACTION_KIND_HUMAN_INPUT,
        source_run_id=source_attempt_id,
        occurrence="cold-ask-user",
        payload={
            "request_id": "cold-ask-user",
            "kind": "selector",
            "title": "Choose framework",
            "question": "Which framework?",
            "selection_mode": "single",
            "options": [
                {"label": "React", "value": "react", "description": ""},
            ],
            "allow_other": False,
            "other_label": "Other",
            "other_placeholder": "",
            "min_selected": 1,
            "max_selected": 1,
        },
        response_contract=response_contract_for_kind(
            INTERACTION_KIND_HUMAN_INPUT
        ),
        created_revision=0,
        subject={"provider": "openai", "model": "gpt-host-event-test"},
    )
    state.suspend_state.payload = {"interaction_request": request.to_dict()}
    checkpoint = build_execution_checkpoint(
        state,
        status="awaiting_interaction",
        run_id=source_attempt_id,
    )
    memory.save_execution_checkpoint_snapshot(
        EXECUTION_ID,
        checkpoint,
        interaction_request=request.to_dict(),
        expected_revision=0,
    )
    durable_host.save_resume_context(
        session_id=EXECUTION_ID,
        run_id=source_attempt_id,
        options={
            "modelId": "openai:gpt-host-event-test",
            "memory_enabled": True,
            "_memory_v2_owner_chat_id": OWNER_CHAT_ID,
        },
        provider="openai",
        model="gpt-host-event-test",
    )
    if response is not None:
        durable_host._interaction_runtime().record_receipt(
            EXECUTION_ID,
            interaction_id=request.interaction_id,
            response=response,
            submitted_by="ui:test",
        )
    return request


def _replace_with_second_durable_interaction(first_request):
    from unchain.interaction import (
        INTERACTION_JOURNAL_KEY,
        INTERACTION_KIND_HUMAN_INPUT,
        build_interaction_request,
    )
    from unchain.interaction.durable import mark_interaction_applied
    from unchain.interaction.runtime import response_contract_for_kind
    from unchain.memory import KernelMemoryRuntime
    from unchain.memory.checkpoint_state import (
        EXECUTION_CHECKPOINT_DOMAIN_KEY,
        EXECUTION_CHECKPOINT_KEY,
        build_execution_checkpoint,
    )

    memory = KernelMemoryRuntime.from_config(store=durable_host._session_store())
    current = memory.load_session_snapshot(EXECUTION_ID)
    state = copy.deepcopy(current.state)
    first_entry = state[INTERACTION_JOURNAL_KEY]["entries"][
        first_request.interaction_id
    ]
    state[INTERACTION_JOURNAL_KEY] = mark_interaction_applied(
        state[INTERACTION_JOURNAL_KEY],
        interaction_id=first_request.interaction_id,
        receipt_id=first_entry["receipt"]["receipt_id"],
        applied_checkpoint_id="continued:first-interaction",
    )
    state.pop(EXECUTION_CHECKPOINT_KEY, None)
    state.pop(EXECUTION_CHECKPOINT_DOMAIN_KEY, None)
    applied = memory.save_session_state(
        EXECUTION_ID,
        state,
        expected_revision=current.revision,
    )
    next_state = RunState()
    next_state.seed_messages([{"role": "user", "content": "ask again"}])
    next_state.session_state.session_id = EXECUTION_ID
    next_state.provider_state.provider = "openai"
    next_state.provider_state.model = "gpt-host-event-test"
    next_state.memory_state["session_revision"] = applied.revision
    next_state.iteration = 2
    next_state.last_continuation = {
        "type": "durable_interaction",
        "occurrence": "cold-ask-user-second",
    }
    second = build_interaction_request(
        session_id=EXECUTION_ID,
        kind=INTERACTION_KIND_HUMAN_INPUT,
        source_run_id=ROOT_ATTEMPT_ID,
        occurrence="cold-ask-user-second",
        payload={
            "request_id": "cold-ask-user-second",
            "kind": "selector",
            "title": "Choose again",
            "question": "Which framework now?",
            "selection_mode": "single",
            "options": [
                {"label": "Vue", "value": "vue", "description": ""},
            ],
            "allow_other": False,
            "other_label": "Other",
            "other_placeholder": "",
            "min_selected": 1,
            "max_selected": 1,
        },
        response_contract=response_contract_for_kind(
            INTERACTION_KIND_HUMAN_INPUT
        ),
        created_revision=int(applied.revision or 0),
        subject={"provider": "openai", "model": "gpt-host-event-test"},
    )
    next_state.suspend_state.payload = {"interaction_request": second.to_dict()}
    checkpoint = build_execution_checkpoint(
        next_state,
        status="awaiting_interaction",
        run_id=ROOT_ATTEMPT_ID,
    )
    memory.save_execution_checkpoint_snapshot(
        EXECUTION_ID,
        checkpoint,
        interaction_request=second.to_dict(),
        expected_revision=applied.revision,
    )
    return second


def _save_graph_owner_record(
    *,
    step_attempt_id: str,
    owner_chat_id: str,
) -> dict:
    coordinator_attempt_id = "graph-coordinator-cold-interaction"
    coordinator_binding = {
        "schema": "pupu.memory-v2-run-binding.v2",
        "owner_chat_id": owner_chat_id,
        "session_id": EXECUTION_ID,
        "generation_id": "generation-cold-interaction",
        "head_revision": 1,
        "identity": {
            "execution_id": EXECUTION_ID,
            "attempt_id": coordinator_attempt_id,
            "run_id": coordinator_attempt_id,
            "root_run_id": coordinator_attempt_id,
            "parent_run_id": None,
            "run_lineage": [coordinator_attempt_id],
        },
        "grant": {
            "module_key": "memory_v2",
            "capabilities": [
                "memory.candidate.propose",
                "memory.context.read",
                "memory.execution.complete",
                "memory.workspace.read",
            ],
            "delegable_capabilities": [
                "memory.candidate.propose",
                "memory.context.read",
                "memory.workspace.read",
            ],
            "authority": "graph-cold-interaction-authority",
        },
        "current_input_draft": None,
    }
    return durable_host.save_graph_step_resume_context(
        session_id=EXECUTION_ID,
        step_attempt_id=step_attempt_id,
        operation_id=f"graph-cold-interaction-{step_attempt_id}",
        owner_chat_id=owner_chat_id,
        graph_execution_id=EXECUTION_ID,
        coordinator_attempt_id=coordinator_attempt_id,
        graph_plan_id="graph-plan-cold-interaction",
        graph_scope_id="graph-scope-cold-interaction",
        topology_sha256="a" * 64,
        step_index=1,
        node_id="ask-user",
        predecessor_attempt_id="graph-predecessor-cold-interaction",
        provider="openai",
        model="gpt-host-event-test",
        configuration_sha256="b" * 64,
        recipe_identity={
            "name": "Cold Interaction Recipe",
            "revision": 1,
            "sha256": "c" * 64,
        },
        canonical_build_fingerprint="d" * 64,
        coordinator_binding_snapshot=coordinator_binding,
        options={
            "modelId": "openai:gpt-host-event-test",
            "memory_enabled": True,
        },
    )


def _snapshot(bridge: PupuUnchainActiveBridge, attempt_id: str):
    return bridge.attempt_for_run(attempt_id).bundle.journal.capture_snapshot()


def _event_types(bridge: PupuUnchainActiveBridge, attempt_id: str) -> list[str]:
    return [event.event_type for event in _snapshot(bridge, attempt_id).events]


def _receipt_handoff(
    *,
    kind: str,
    occurrence: str,
    response: dict,
    session_id: str = EXECUTION_ID,
    source_run_id: str = ROOT_ATTEMPT_ID,
) -> tuple[str, DurableInteractionReceiptHandoff]:
    request = build_interaction_request(
        session_id=session_id,
        kind=kind,
        source_run_id=source_run_id,
        occurrence=occurrence,
        payload={"call_id": occurrence, "request_id": occurrence},
        response_contract={"type": "object"},
        created_revision=1,
    )
    receipt = build_interaction_receipt(
        request,
        response,
        submitted_by="ui:test",
        submitted_at_ms=1,
    )
    return request.interaction_id, DurableInteractionReceiptHandoff.from_persisted_receipt(
        session_id=session_id,
        receipt=receipt,
    )


def _compile_active_context(
    bridge: PupuUnchainActiveBridge,
    attempt_id: str,
):
    state = RunState()
    state.session_state.session_id = EXECUTION_ID
    state.provider_state.provider = "openai"
    state.provider_state.model = "gpt-host-event-test"
    state.provider_state.max_context_window_tokens = 16_384
    return bridge.modules[0].runtime.compile_context(
        HarnessContext(
            state=state,
            phase="before_model",
            event={"run_id": attempt_id},
        )
    )


def _single_step_graph_service(
    bridge: PupuUnchainActiveBridge,
    *,
    step_attempt_id: str,
) -> tuple[GraphCheckpointService, GraphExecutionPlan]:
    root = bridge.attempt_for_run(ROOT_ATTEMPT_ID).bundle
    step = bridge.attempt_for_run(step_attempt_id).bundle
    bundles = {root.attempt: root, step.attempt: step}
    seed = next(
        event
        for event in root.journal.capture_snapshot().events
        if event.event_type == "message.user"
    )
    service = GraphCheckpointService(
        repository=JournalGraphCheckpointRepository(root.journal),
        artifacts=root.artifacts,
        derived_ingress_resolver=lambda consumer, source: (
            DerivedHandoffInputIngress(
                consumer_attempt=consumer,
                source_attempt=source,
                handoff_recorder=bundles[consumer].handoff_recorder,
                input_ingress=bundles[consumer].ingress,
            )
        ),
    )
    plan = GraphExecutionPlan(
        orchestration_attempt=root.attempt,
        topology_sha256=hashlib.sha256(b"active-host-event-topology").hexdigest(),
        initial_input_cursor=EventCursor(
            store_seq=seed.store_seq,
            event_id=seed.event_id,
        ),
        steps=(
            GraphStepBinding(
                index=0,
                node_id="active-host-event-node",
                attempt=step.attempt,
                source_attempt=root.attempt,
                provider="openai",
                model="gpt-host-event-test",
                configuration_sha256=hashlib.sha256(
                    b"active-host-event-config"
                ).hexdigest(),
            ),
        ),
    )
    service.admit(plan)
    service.start_step(plan, 0)
    return service, plan


def _authority(
    *,
    attempt_id: str,
    origin: str,
    interaction_id: str = "interaction-boundary",
    source_attempt_id: str | None = None,
    interaction_kind: str = "",
) -> PupuUnchainHostEventAuthority:
    resolved_kind = interaction_kind or {
        "tool_approval": "tool_approval",
        "human_input": "human_input",
        "max_budget": "max_budget",
        "interaction_resolution": "human_input",
    }.get(origin, "")
    return PupuUnchainHostEventAuthority(
        execution_id=EXECUTION_ID,
        attempt_id=attempt_id,
        source_attempt_id=(
            attempt_id if source_attempt_id is None else source_attempt_id
        ),
        interaction_id=interaction_id,
        origin=origin,
        interaction_kind=resolved_kind,
    )


def _presentation_event(origin: str, interaction_id: str) -> dict:
    if origin == "tool_approval":
        return {
            "type": "tool_call",
            "tool_name": "delete_file",
            "call_id": "call-delete",
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "arguments": {"path": "notes.txt"},
        }
    if origin == "human_input":
        return {
            "type": "tool_call",
            "tool_name": "ask_user_question",
            "call_id": "ask-framework",
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "interact_type": "single",
            "interact_config": {
                "question": "Which framework?",
                "options": [{"label": "React", "value": "react"}],
            },
            "arguments": {"question": "Which framework?"},
        }
    if origin == "max_budget":
        return {
            "type": "tool_call",
            "tool_name": "__continuation__",
            "call_id": f"continuation-{interaction_id}",
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "interact_type": "confirmation",
            "interact_config": {},
            "arguments": {},
        }
    raise AssertionError(f"unsupported presentation origin: {origin}")


def _seed_interaction_request(
    bridge: PupuUnchainActiveBridge,
    *,
    attempt_id: str,
    interaction_id: str,
    kind: str,
    call_id: str,
) -> dict:
    event = {
        "type": "interaction_requested",
        "run_id": attempt_id,
        "iteration": 1,
        "interaction_request": {
            "interaction_id": interaction_id,
            "session_id": EXECUTION_ID,
            "source_run_id": attempt_id,
            "kind": kind,
            "payload": {"call_id": call_id, "request_id": call_id},
        },
    }
    bridge.modules[0].runtime.persist_event(event)
    return event


@pytest.mark.parametrize(
    ("path_kind", "attempt_id"),
    (
        pytest.param("normal", ROOT_ATTEMPT_ID, id="active-normal"),
        pytest.param(
            "graph",
            "graph-step-active-host-event-boundary",
            id="active-graph-step",
        ),
        pytest.param("resume", RESUME_ATTEMPT_ID, id="active-resume"),
    ),
)
@pytest.mark.parametrize(
    "origin",
    (
        pytest.param("human_input", id="ask-user"),
        pytest.param("tool_approval", id="tool-confirm"),
        pytest.param("max_budget", id="max-budget"),
    ),
)
def test_active_presentation_matrix_enqueues_without_a_second_journal_write(
    tmp_path,
    monkeypatch,
    path_kind: str,
    attempt_id: str,
    origin: str,
) -> None:
    del path_kind
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, attempt_id)
    before = _snapshot(bridge, attempt_id)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=attempt_id,
        enqueue=lambda event: queued.append(copy.deepcopy(event)),
    )
    interaction_id = f"interaction-{origin}-{attempt_id}"
    event = _presentation_event(origin, interaction_id)

    bound = boundary.bind_presentation(
        event,
        authority=_authority(
            attempt_id=attempt_id,
            origin=origin,
            interaction_id=interaction_id,
        ),
    )
    boundary.deliver(bound)

    assert type(bound) is PupuUnchainBoundHostEvent
    assert bound.lane == HOST_EVENT_LANE_PRESENTATION
    assert queued == [bound.event]
    assert queued[0]["run_id"] == attempt_id
    after = _snapshot(bridge, attempt_id)
    assert after.events == before.events


@pytest.mark.parametrize(
    "attempt_id",
    (
        pytest.param(ROOT_ATTEMPT_ID, id="active-normal"),
        pytest.param(
            "graph-step-active-callback-boundary",
            id="active-graph-step",
        ),
        pytest.param(RESUME_ATTEMPT_ID, id="active-resume"),
    ),
)
@pytest.mark.parametrize(
    ("origin", "interaction_kind"),
    (
        pytest.param("human_input", "human_input", id="ask-user"),
        pytest.param("tool_approval", "tool_approval", id="tool-confirm"),
        pytest.param("max_budget", "max_budget", id="max-budget"),
    ),
)
def test_active_callbacks_use_the_typed_boundary_for_request_and_resolution(
    tmp_path,
    monkeypatch,
    attempt_id: str,
    origin: str,
    interaction_kind: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, attempt_id)
    call_id = f"call-callback-{origin}-{attempt_id}"
    if origin == "human_input":
        persisted_response = {
            "request_id": call_id,
            "selected_values": ["react"],
            "other_text": None,
        }
    elif origin == "tool_approval":
        persisted_response = {
            "approved": True,
            "reason": "",
            "modified_arguments": None,
        }
    else:
        persisted_response = {"approved": True}
    interaction_id, receipt_handoff = _receipt_handoff(
        kind=interaction_kind,
        occurrence=call_id,
        response=persisted_response,
        source_run_id=attempt_id,
    )
    canonical_request = _seed_interaction_request(
        bridge,
        attempt_id=attempt_id,
        interaction_id=interaction_id,
        kind=interaction_kind,
        call_id=call_id,
    )
    tracker = adapter.DurableInteractionIdTracker()
    tracker.observe(canonical_request)
    before = _snapshot(bridge, attempt_id)
    presentation_ready = threading.Event()
    queued: list[dict] = []

    def enqueue(event: dict) -> None:
        queued.append(copy.deepcopy(event))
        presentation_ready.set()

    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=attempt_id,
        enqueue=enqueue,
    )
    cancel_signal = threading.Event()

    def forbidden_raw_emit(_event: dict) -> None:
        raise AssertionError("active callback bypassed the typed host-event boundary")

    if origin == "tool_approval":
        callback = adapter._make_tool_confirm_callback(
            forbidden_raw_emit,
            cancel_event=cancel_signal,
            interaction_id_tracker=tracker,
            require_durable_interaction_id=True,
            root_session_id=EXECUTION_ID,
            root_run_id=attempt_id,
            active_host_event_boundary=boundary,
        )
        invoke = lambda: callback(
            {
                "tool_name": "delete_file",
                "call_id": call_id,
                "arguments": {"path": "notes.txt"},
            }
        )
        modified_arguments = None
    elif origin == "human_input":
        callback = adapter._make_human_input_callback(
            forbidden_raw_emit,
            cancel_event=cancel_signal,
            interaction_id_tracker=tracker,
            require_durable_interaction_id=True,
            root_session_id=EXECUTION_ID,
            root_run_id=attempt_id,
            active_host_event_boundary=boundary,
        )
        request = SimpleNamespace(
            request_id=call_id,
            question="Which framework?",
            selection_mode="single",
            to_dict=lambda: {
                "request_id": call_id,
                "question": "Which framework?",
                "selection_mode": "single",
                "options": [{"label": "React", "value": "react"}],
            },
        )
        invoke = lambda: callback(request)
        modified_arguments = {
            "user_response": {"selected_values": ["forged-http-value"]}
        }
    else:
        callback = adapter._make_continuation_callback(
            forbidden_raw_emit,
            cancel_event=cancel_signal,
            interaction_id_tracker=tracker,
            require_durable_interaction_id=True,
            root_session_id=EXECUTION_ID,
            root_run_id=attempt_id,
            active_host_event_boundary=boundary,
        )
        invoke = lambda: callback({"iteration": 6})
        modified_arguments = None

    outcome: dict[str, object] = {}

    def run_callback() -> None:
        try:
            outcome["value"] = invoke()
        except BaseException as error:  # noqa: BLE001 - asserted below
            outcome["error"] = error

    worker = threading.Thread(target=run_callback, daemon=True)
    worker.start()
    try:
        assert presentation_ready.wait(timeout=2)
        assert len(queued) == 1
        assert queued[0]["run_id"] == attempt_id
        assert queued[0]["confirmation_id"] == interaction_id
        assert _snapshot(bridge, attempt_id).events == before.events

        submitted = adapter.submit_tool_confirmation(
            confirmation_id=interaction_id,
            approved=True,
            modified_arguments=modified_arguments,
            durable_receipt=receipt_handoff,
        )
        assert submitted is True
        worker.join(timeout=2)
        assert not worker.is_alive()
        assert "error" not in outcome
        if origin == "human_input":
            assert outcome["value"] == {
                "request_id": call_id,
                "selected_values": ["react"],
                "other_text": None,
            }
        assert _event_types(bridge, attempt_id).count(
            "interaction.resolved"
        ) == 1
    finally:
        if worker.is_alive():
            cancel_signal.set()
            adapter.cancel_tool_confirmations(cancel_signal)
            worker.join(timeout=2)


@pytest.mark.parametrize(
    ("approved", "modified_arguments", "runtime_event_type"),
    (
        pytest.param(False, None, "tool_denied", id="denied"),
        pytest.param(
            True,
            {"path": "safe-notes.txt"},
            "tool_confirmed",
            id="approved-with-modified-arguments",
        ),
    ),
)
def test_active_graph_tool_outcome_is_the_single_resolution_authority(
    tmp_path,
    monkeypatch,
    approved: bool,
    modified_arguments: dict | None,
    runtime_event_type: str,
) -> None:
    step_attempt_id = "graph-step-active-tool-resolution"
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _bind_attempt(bridge, step_attempt_id)
    service, plan = _single_step_graph_service(
        bridge,
        step_attempt_id=step_attempt_id,
    )
    call_id = f"call-{runtime_event_type}"
    persisted_response = {
        "approved": approved,
        "reason": "user denied" if not approved else "",
        "modified_arguments": copy.deepcopy(modified_arguments),
    }
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="tool_approval",
        occurrence=call_id,
        response=persisted_response,
        source_run_id=step_attempt_id,
    )
    canonical_request = _seed_interaction_request(
        bridge,
        attempt_id=step_attempt_id,
        interaction_id=interaction_id,
        kind="tool_approval",
        call_id=call_id,
    )
    tracker = adapter.DurableInteractionIdTracker()
    tracker.observe(canonical_request)
    queued: list[dict] = []
    presentation_ready = threading.Event()

    def enqueue(event: dict) -> None:
        queued.append(copy.deepcopy(event))
        presentation_ready.set()

    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=step_attempt_id,
        enqueue=enqueue,
    )
    cancel_signal = threading.Event()
    callback = adapter._make_tool_confirm_callback(
        lambda _event: (_ for _ in ()).throw(
            AssertionError("active graph callback bypassed the typed boundary")
        ),
        cancel_event=cancel_signal,
        interaction_id_tracker=tracker,
        require_durable_interaction_id=True,
        root_session_id=EXECUTION_ID,
        root_run_id=step_attempt_id,
        active_host_event_boundary=boundary,
    )
    outcome: dict[str, object] = {}

    def invoke_callback() -> None:
        try:
            outcome["value"] = callback(
                {
                    "tool_name": "delete_file",
                    "call_id": call_id,
                    "arguments": {"path": "notes.txt"},
                }
            )
        except BaseException as error:  # noqa: BLE001 - asserted below
            outcome["error"] = error

    worker = threading.Thread(target=invoke_callback, daemon=True)
    worker.start()
    try:
        assert presentation_ready.wait(timeout=2)
        assert adapter.submit_tool_confirmation(
            confirmation_id=interaction_id,
            approved=approved,
            modified_arguments=modified_arguments,
            durable_receipt=receipt_handoff,
        ) is True
        worker.join(timeout=2)
        assert not worker.is_alive()
        assert "error" not in outcome
        assert _event_types(bridge, step_attempt_id).count(
            "interaction.resolved"
        ) == 0

        runtime_event = {
            "type": runtime_event_type,
            "run_id": step_attempt_id,
            "iteration": 1,
            "tool_name": "delete_file",
            "call_id": call_id,
        }
        if runtime_event_type == "tool_denied":
            runtime_event["reason"] = "user denied"
        bridge.modules[0].runtime.persist_event(runtime_event)

        # The live outcome stays the single resolution record and closes the
        # interaction cycle in place: the attempt kept running, so it never
        # takes a resume admission and must not park as resume-ready.
        recovery = service.recover(plan)
        assert recovery.resume_ready_step_index is None
        assert recovery.suspended_step_index is None
        assert recovery.uncertain_step_index == 0
        with pytest.raises(
            GraphCheckpointError,
            match="no resolved resumable interaction",
        ):
            service.resolved_interaction_for_step(
                plan,
                0,
                interaction_id=interaction_id,
            )

        # A later prompt in the same still-running attempt must be admitted
        # instead of rejected as an unresumed-interaction overrun.
        follow_up_id = f"{interaction_id}-follow-up"
        bridge.modules[0].runtime.persist_event(
            {
                "type": "interaction_requested",
                "run_id": step_attempt_id,
                "iteration": 2,
                "interaction_id": follow_up_id,
                "interaction_request": {
                    "interaction_id": follow_up_id,
                    "kind": "human_input",
                    "question": "Continue?",
                },
            }
        )
        assert service.recover(plan).suspended_step_index == 0
    finally:
        if worker.is_alive():
            cancel_signal.set()
            adapter.cancel_tool_confirmations(cancel_signal)
            worker.join(timeout=2)


@pytest.mark.parametrize(
    ("kind", "outcome", "response"),
    (
        pytest.param(
            "human_input",
            "submitted",
            {"selected_values": ["react"]},
            id="human-input",
        ),
        pytest.param(
            "tool_approval",
            "approved",
            {"approved": True, "reason": "", "modified_arguments": None},
            id="plain-tool-approval",
        ),
        pytest.param(
            "max_budget",
            "approved",
            {"approved": True},
            id="max-budget",
        ),
    ),
)
def test_active_graph_host_resolution_is_counted_once_from_official_ingress(
    tmp_path,
    monkeypatch,
    kind: str,
    outcome: str,
    response: dict,
) -> None:
    step_attempt_id = f"graph-step-host-{kind}"
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _bind_attempt(bridge, step_attempt_id)
    service, plan = _single_step_graph_service(
        bridge,
        step_attempt_id=step_attempt_id,
    )
    call_id = f"call-host-{kind}"
    interaction_id, receipt_handoff = _receipt_handoff(
        kind=kind,
        occurrence=call_id,
        response=response,
        source_run_id=step_attempt_id,
    )
    _seed_interaction_request(
        bridge,
        attempt_id=step_attempt_id,
        interaction_id=interaction_id,
        kind=kind,
        call_id=call_id,
    )
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=step_attempt_id,
        enqueue=lambda event: queued.append(copy.deepcopy(event)),
    )
    authority = _authority(
        attempt_id=step_attempt_id,
        origin="interaction_resolution",
        interaction_id=interaction_id,
        interaction_kind=kind,
    )
    event = adapter._interaction_resolution_event(
        interaction_id=interaction_id,
        kind=kind,
        outcome=outcome,
        receipt_id=receipt_handoff.receipt_id,
        session_id=EXECUTION_ID,
        source_run_id=step_attempt_id,
        event_run_id=step_attempt_id,
    )

    boundary.deliver_interaction_resolution(
        boundary.bind_interaction_resolution(
            event,
            authority=authority,
            durable_receipt=receipt_handoff,
        )
    )

    evidence = service.resolved_interaction_for_step(
        plan,
        0,
        interaction_id=interaction_id,
    )
    assert evidence.interaction_id == interaction_id
    resolved_event = next(
        event
        for event in _snapshot(bridge, step_attempt_id).events
        if event.event_id == evidence.resolution_cursor.event_id
    )
    assert resolved_event.event_type == "interaction.resolved"
    assert service.recover(plan).resume_ready_step_index == 0
    assert _event_types(bridge, step_attempt_id).count("interaction.resolved") == 1
    assert queued == [event]


@pytest.mark.parametrize(
    "attempt_id",
    (
        pytest.param(ROOT_ATTEMPT_ID, id="active-normal"),
        pytest.param(
            "graph-step-active-live-resolution",
            id="active-graph-step",
        ),
        pytest.param(RESUME_ATTEMPT_ID, id="active-resume"),
    ),
)
def test_active_live_resolution_persists_before_enqueue_and_is_idempotent(
    tmp_path,
    monkeypatch,
    attempt_id: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, attempt_id)
    call_id = f"ask-{attempt_id}"
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={
            "request_id": call_id,
            "selected_values": ["react"],
            "other_text": None,
        },
        source_run_id=attempt_id,
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "interaction_requested",
            "run_id": attempt_id,
            "iteration": 1,
            "interaction_request": {
                "interaction_id": interaction_id,
                "kind": "human_input",
                "payload": {"request_id": call_id},
            },
        }
    )
    observed_at_enqueue: list[list[str]] = []
    queued: list[dict] = []

    def enqueue(event: dict) -> None:
        observed_at_enqueue.append(_event_types(bridge, attempt_id))
        queued.append(copy.deepcopy(event))

    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=attempt_id,
        enqueue=enqueue,
    )
    event = {
        "type": "interaction_resolved",
        "event_id": f"resolved-{interaction_id}",
        "run_id": attempt_id,
        "interaction_id": interaction_id,
        "kind": "human_input",
        "outcome": "submitted",
        "receipt_id": receipt_handoff.receipt_id,
        "source_refs": {
            "session_id": EXECUTION_ID,
            "source_run_id": attempt_id,
        },
    }
    bound = boundary.bind_interaction_resolution(
        event,
        authority=_authority(
            attempt_id=attempt_id,
            origin="interaction_resolution",
            interaction_id=interaction_id,
        ),
        durable_receipt=receipt_handoff,
    )

    boundary.deliver_interaction_resolution(bound)
    boundary.deliver_interaction_resolution(bound)

    assert len(queued) == 1
    assert all("interaction.resolved" in types for types in observed_at_enqueue)
    assert _event_types(bridge, attempt_id).count("interaction.resolved") == 1


def test_active_human_resolution_supplies_the_real_compiler_descriptor(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    call_id = "ask-real-compiler"
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={
            "request_id": call_id,
            "selected_values": ["react"],
            "other_text": None,
        },
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "tool_call",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "tool_name": "ask_user_question",
            "call_id": call_id,
            "arguments": {"question": "Which framework?"},
        }
    )
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=interaction_id,
        kind="human_input",
        call_id=call_id,
    )
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=lambda _event: None,
    )
    writer = adapter._make_interaction_resolution_writer(
        lambda _event: None,
        interaction_id=interaction_id,
        kind="human_input",
        session_id=EXECUTION_ID,
        source_run_id=ROOT_ATTEMPT_ID,
        require_durable_receipt=True,
        active_host_event_boundary=boundary,
    )

    writer(
        outcome="approved",
        durable_receipt=receipt_handoff,
        modified_arguments={
            "user_response": {"selected_values": ["react"]},
        },
    )

    compiled = _compile_active_context(bridge, ROOT_ATTEMPT_ID)
    assert receipt_handoff.receipt_id not in str(compiled.to_dict())
    resolution = next(
        event
        for event in _snapshot(bridge, ROOT_ATTEMPT_ID).events
        if event.event_type == "interaction.resolved"
    )
    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("interaction.resolved") == 1
    assert resolution.payload["content_ref"]["kind"] == "artifact"
    assert resolution.payload["content_bytes"] > 0
    assert len(resolution.payload["content_sha256"]) == 64
    assert isinstance(resolution.payload["preview"], str)


def test_same_persisted_receipt_is_exact_once_under_concurrent_live_delivery(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    call_id = "ask-concurrent-receipt"
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={
            "request_id": call_id,
            "selected_values": ["react"],
            "other_text": None,
        },
    )
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=lambda event: queued.append(copy.deepcopy(event)),
    )
    event = adapter._interaction_resolution_event(
        interaction_id=interaction_id,
        kind="human_input",
        outcome="submitted",
        receipt_id=receipt_handoff.receipt_id,
        session_id=EXECUTION_ID,
        source_run_id=ROOT_ATTEMPT_ID,
        event_run_id=ROOT_ATTEMPT_ID,
    )
    bound = boundary.bind_interaction_resolution(
        event,
        authority=_authority(
            attempt_id=ROOT_ATTEMPT_ID,
            origin="interaction_resolution",
            interaction_id=interaction_id,
        ),
        durable_receipt=receipt_handoff,
    )
    barrier = threading.Barrier(2)
    failures: list[BaseException] = []

    def deliver() -> None:
        try:
            barrier.wait(timeout=2)
            boundary.deliver_interaction_resolution(bound)
        except BaseException as error:  # noqa: BLE001 - asserted below
            failures.append(error)

    workers = [threading.Thread(target=deliver) for _ in range(2)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=2)

    assert not failures
    assert all(not worker.is_alive() for worker in workers)
    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("interaction.resolved") == 1
    assert len(queued) == 1


def test_duplicate_live_post_after_waiter_pop_keeps_one_delivery_claim(
    tmp_path,
    monkeypatch,
) -> None:
    del tmp_path, monkeypatch
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-duplicate-live-post",
        response={"selected_values": ["react"]},
    )
    cancel_signal = threading.Event()

    class CountingEvent(threading.Event):
        def __init__(self) -> None:
            super().__init__()
            self.set_count = 0

        def set(self) -> None:
            self.set_count += 1
            super().set()

    waiter_event = CountingEvent()
    writer = mock.Mock(
        return_value=SimpleNamespace(
            callback_response={
                "approved": True,
                "reason": "",
                "modified_arguments": {
                    "user_response": {"selected_values": ["react"]},
                },
            }
        )
    )
    with adapter._pending_confirmations_lock:
        adapter._pending_confirmations[interaction_id] = {
            "event": waiter_event,
            "response": None,
            "cancel_event": cancel_signal,
            "resolution_writer": writer,
        }
    try:
        assert adapter.submit_tool_confirmation(
            confirmation_id=interaction_id,
            approved=True,
            durable_receipt=receipt_handoff,
        ) is True
        with adapter._pending_confirmations_lock:
            adapter._pending_confirmations.pop(interaction_id, None)

        assert adapter.submit_tool_confirmation(
            confirmation_id=interaction_id,
            approved=True,
            durable_receipt=receipt_handoff,
        ) is True
        assert writer.call_count == 1
        assert waiter_event.set_count == 1

        adapter.cancel_tool_confirmations(cancel_signal)
        assert adapter.submit_tool_confirmation(
            confirmation_id=interaction_id,
            approved=True,
            durable_receipt=receipt_handoff,
        ) is False
    finally:
        with adapter._pending_confirmations_lock:
            adapter._pending_confirmations.pop(interaction_id, None)
        adapter.cancel_tool_confirmations(cancel_signal)


def test_live_receipt_claim_rejects_foreign_handoff_before_writer_or_send() -> None:
    interaction_id, owner_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-live-claim-owner",
        response={"selected_values": ["react"]},
    )
    assert owner_handoff.interaction_id == interaction_id
    _foreign_interaction_id, foreign_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-live-claim-foreign",
        response={"selected_values": ["vue"]},
    )
    waiter_event = threading.Event()
    writer = mock.Mock()
    with adapter._pending_confirmations_lock:
        adapter._pending_confirmations[interaction_id] = {
            "event": waiter_event,
            "response": None,
            "cancel_event": threading.Event(),
            "resolution_writer": writer,
        }
    try:
        with pytest.raises(
            DurableInteractionHostError,
            match="does not match the live waiter",
        ):
            adapter.submit_tool_confirmation(
                confirmation_id=interaction_id,
                approved=True,
                durable_receipt=foreign_handoff,
            )
        assert writer.call_count == 0
        assert not waiter_event.is_set()
    finally:
        with adapter._pending_confirmations_lock:
            adapter._pending_confirmations.pop(interaction_id, None)


def test_live_receipt_claim_capacity_fails_closed_without_evicting_live_claim(
    monkeypatch,
) -> None:
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-live-claim-capacity",
        response={"selected_values": ["react"]},
    )
    existing_signal = threading.Event()
    waiter_event = threading.Event()
    writer = mock.Mock()
    with adapter._pending_confirmations_lock:
        saved_claims = dict(adapter._live_confirmation_receipt_claims)
        adapter._live_confirmation_receipt_claims.clear()
        adapter._live_confirmation_receipt_claims[
            ("another-session", "another-interaction")
        ] = {
            "receipt_id": "another-receipt",
            "cancel_event": existing_signal,
        }
        adapter._pending_confirmations[interaction_id] = {
            "event": waiter_event,
            "response": None,
            "cancel_event": threading.Event(),
            "resolution_writer": writer,
        }
    monkeypatch.setattr(adapter, "_LIVE_CONFIRMATION_RECEIPT_CLAIM_LIMIT", 1)
    try:
        with pytest.raises(
            DurableInteractionHostError,
            match="capacity is exhausted",
        ):
            adapter.submit_tool_confirmation(
                confirmation_id=interaction_id,
                approved=True,
                durable_receipt=receipt_handoff,
            )
        assert writer.call_count == 0
        assert not waiter_event.is_set()
        assert ("another-session", "another-interaction") in (
            adapter._live_confirmation_receipt_claims
        )
    finally:
        with adapter._pending_confirmations_lock:
            adapter._pending_confirmations.pop(interaction_id, None)
            adapter._live_confirmation_receipt_claims.clear()
            adapter._live_confirmation_receipt_claims.update(saved_claims)


def test_interaction_enqueue_failure_can_retry_without_a_second_journal_write(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    call_id = "ask-retry-interaction-enqueue"
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={"selected_values": ["react"]},
    )
    queued: list[dict] = []
    attempts = 0

    def enqueue(event: dict) -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("queue unavailable")
        queued.append(copy.deepcopy(event))

    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=enqueue,
    )
    bound = boundary.bind_interaction_resolution(
        adapter._interaction_resolution_event(
            interaction_id=interaction_id,
            kind="human_input",
            outcome="submitted",
            receipt_id=receipt_handoff.receipt_id,
            session_id=EXECUTION_ID,
            source_run_id=ROOT_ATTEMPT_ID,
            event_run_id=ROOT_ATTEMPT_ID,
        ),
        authority=_authority(
            attempt_id=ROOT_ATTEMPT_ID,
            origin="interaction_resolution",
            interaction_id=interaction_id,
        ),
        durable_receipt=receipt_handoff,
    )

    with pytest.raises(RuntimeError, match="queue unavailable"):
        boundary.deliver_interaction_resolution(bound)
    boundary.deliver_interaction_resolution(bound)

    assert attempts == 2
    assert queued == [bound.event]
    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("interaction.resolved") == 1


def test_conflicting_receipt_response_fails_closed_without_a_second_event(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    call_id = "ask-conflicting-receipt"
    interaction_id, first_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={"selected_values": ["react"]},
    )
    second_interaction_id, second_handoff = _receipt_handoff(
        kind="human_input",
        occurrence=call_id,
        response={"selected_values": ["vue"]},
    )
    assert second_interaction_id == interaction_id
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=lambda event: queued.append(copy.deepcopy(event)),
    )
    authority = _authority(
        attempt_id=ROOT_ATTEMPT_ID,
        origin="interaction_resolution",
        interaction_id=interaction_id,
    )

    def bound_for(handoff: DurableInteractionReceiptHandoff):
        return boundary.bind_interaction_resolution(
            adapter._interaction_resolution_event(
                interaction_id=interaction_id,
                kind="human_input",
                outcome="submitted",
                receipt_id=handoff.receipt_id,
                session_id=EXECUTION_ID,
                source_run_id=ROOT_ATTEMPT_ID,
                event_run_id=ROOT_ATTEMPT_ID,
            ),
            authority=authority,
            durable_receipt=handoff,
        )

    boundary.deliver_interaction_resolution(bound_for(first_handoff))
    with pytest.raises(ContextConflictError, match="changed|replay"):
        boundary.deliver_interaction_resolution(bound_for(second_handoff))

    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("interaction.resolved") == 1
    assert len(queued) == 1


def test_semantic_persist_failure_never_enqueues(tmp_path, monkeypatch) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    event = {
        "type": "final_message",
        "run_id": ROOT_ATTEMPT_ID,
        "iteration": 1,
        "content": "done",
    }
    bound = boundary.bind_semantic(
        event,
        authority=_authority(
            attempt_id=ROOT_ATTEMPT_ID,
            origin="fallback_final",
            interaction_id="",
            source_attempt_id="",
        ),
    )

    with mock.patch.object(
        PupuUnchainActiveBridge,
        "persist_bound_host_event",
        autospec=True,
        side_effect=RuntimeError("journal unavailable"),
    ), pytest.raises(RuntimeError, match="journal unavailable"):
        boundary.deliver(bound)

    assert queued == []
    assert "final_message" not in _event_types(bridge, ROOT_ATTEMPT_ID)


def test_generic_semantic_lane_rejects_a_complete_interaction_resolution(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    before = _snapshot(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-generic-lane-rejected"

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_semantic(
            {
                "type": "interaction_resolved",
                "event_id": "resolved-generic-lane-rejected",
                "run_id": ROOT_ATTEMPT_ID,
                "interaction_id": interaction_id,
                "kind": "human_input",
                "outcome": "submitted",
                "receipt_id": "receipt-generic-lane-rejected",
                "source_refs": {
                    "session_id": EXECUTION_ID,
                    "source_run_id": ROOT_ATTEMPT_ID,
                },
            },
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="interaction_resolution",
                interaction_id=interaction_id,
            ),
        )

    assert queued == []
    assert _snapshot(bridge, ROOT_ATTEMPT_ID).events == before.events


def test_enqueue_failure_leaves_semantic_event_recoverable_without_double_write(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    event = {
        "type": "final_message",
        "run_id": ROOT_ATTEMPT_ID,
        "iteration": 2,
        "content": "recoverable final",
    }
    authority = _authority(
        attempt_id=ROOT_ATTEMPT_ID,
        origin="fallback_final",
        interaction_id="",
        source_attempt_id="",
    )
    failing = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=lambda _event: (_ for _ in ()).throw(
            RuntimeError("queue unavailable")
        ),
    )
    bound = failing.bind_semantic(event, authority=authority)

    with pytest.raises(RuntimeError, match="queue unavailable"):
        failing.deliver(bound)

    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("final_message") == 1

    recovered: list[dict] = []
    retry = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=lambda value: recovered.append(copy.deepcopy(value)),
    )
    retry.deliver(retry.bind_semantic(event, authority=authority))

    assert recovered == [event]
    assert _event_types(bridge, ROOT_ATTEMPT_ID).count("final_message") == 1


@pytest.mark.parametrize(
    ("authority_execution_id", "authority_attempt_id"),
    (
        pytest.param(
            "another-execution",
            ROOT_ATTEMPT_ID,
            id="cross-execution",
        ),
        pytest.param(
            EXECUTION_ID,
            "sibling-graph-step",
            id="cross-attempt",
        ),
    ),
)
def test_presentation_authority_mismatch_fails_closed_before_enqueue(
    tmp_path,
    monkeypatch,
    authority_execution_id: str,
    authority_attempt_id: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    before = _snapshot(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-cross-scope"
    authority = PupuUnchainHostEventAuthority(
        execution_id=authority_execution_id,
        attempt_id=authority_attempt_id,
        source_attempt_id=authority_attempt_id,
        interaction_id=interaction_id,
        origin="human_input",
        interaction_kind="human_input",
    )

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_presentation(
            _presentation_event("human_input", interaction_id),
            authority=authority,
        )

    assert queued == []
    after = _snapshot(bridge, ROOT_ATTEMPT_ID)
    assert after.events == before.events


@pytest.mark.parametrize(
    ("field", "value"),
    (
        pytest.param("run_id", "sibling-graph-step", id="event-run-id"),
        pytest.param("attempt_id", "sibling-graph-step", id="event-attempt-id"),
        pytest.param("execution_id", "another-execution", id="event-execution-id"),
        pytest.param("session_id", "another-execution", id="event-session-id"),
    ),
)
def test_explicit_event_identity_cannot_override_boundary_authority(
    tmp_path,
    monkeypatch,
    field: str,
    value: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-event-identity"
    event = _presentation_event("tool_approval", interaction_id)
    event[field] = value

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_presentation(
            event,
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="tool_approval",
                interaction_id=interaction_id,
            ),
        )

    assert queued == []


@pytest.mark.parametrize(
    "mutation",
    (
        pytest.param("missing-confirmation", id="missing-confirmation-id"),
        pytest.param("wrong-subtype", id="wrong-origin-subtype"),
        pytest.param("not-confirmable", id="requires-confirmation-false"),
        pytest.param("missing-call", id="missing-call-id"),
    ),
)
def test_presentation_identity_and_origin_shape_are_closed(
    tmp_path,
    monkeypatch,
    mutation: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-closed-presentation"
    event = _presentation_event("human_input", interaction_id)
    if mutation == "missing-confirmation":
        event.pop("confirmation_id")
    elif mutation == "wrong-subtype":
        event["tool_name"] = "delete_file"
    elif mutation == "not-confirmable":
        event["requires_confirmation"] = False
    elif mutation == "missing-call":
        event.pop("call_id")

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_presentation(
            event,
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="human_input",
                interaction_id=interaction_id,
            ),
        )

    assert queued == []


@pytest.mark.parametrize(
    "mutation",
    (
        pytest.param("missing-interaction", id="missing-interaction-id"),
        pytest.param("missing-source", id="missing-source-refs"),
        pytest.param("partial-source", id="partial-source-refs"),
        pytest.param("extra-source", id="extra-source-ref-key"),
        pytest.param("wrong-kind", id="wrong-interaction-kind"),
        pytest.param("wrong-outcome", id="wrong-interaction-outcome"),
        pytest.param("missing-receipt", id="missing-receipt-id"),
        pytest.param("missing-event", id="missing-event-id"),
    ),
)
def test_semantic_interaction_identity_shape_is_closed(
    tmp_path,
    monkeypatch,
    mutation: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-closed-semantic"
    event = {
        "type": "interaction_resolved",
        "event_id": "interaction-resolved-closed-semantic",
        "run_id": ROOT_ATTEMPT_ID,
        "interaction_id": interaction_id,
        "kind": "human_input",
        "outcome": "submitted",
        "receipt_id": "receipt-closed-semantic",
        "source_refs": {
            "session_id": EXECUTION_ID,
            "source_run_id": ROOT_ATTEMPT_ID,
        },
    }
    if mutation == "missing-interaction":
        event.pop("interaction_id")
    elif mutation == "missing-source":
        event.pop("source_refs")
    elif mutation == "partial-source":
        event["source_refs"].pop("source_run_id")
    elif mutation == "extra-source":
        event["source_refs"]["unexpected"] = "value"
    elif mutation == "wrong-kind":
        event["kind"] = "tool_approval"
    elif mutation == "wrong-outcome":
        event["outcome"] = "approved"
    elif mutation == "missing-receipt":
        event.pop("receipt_id")
    elif mutation == "missing-event":
        event.pop("event_id")

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_semantic(
            event,
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="interaction_resolution",
                interaction_id=interaction_id,
                interaction_kind="human_input",
            ),
        )

    assert queued == []


@pytest.mark.parametrize(
    "field",
    ("interaction_id", "source_refs", "receipt_id", "event_id"),
)
def test_bound_semantic_identity_removal_is_rejected_at_delivery(
    tmp_path,
    monkeypatch,
    field: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-remove-semantic-identity",
        response={"selected_values": ["react"]},
    )
    bound = boundary.bind_interaction_resolution(
        {
            "type": "interaction_resolved",
            "event_id": "interaction-resolved-remove-identity",
            "run_id": ROOT_ATTEMPT_ID,
            "interaction_id": interaction_id,
            "kind": "human_input",
            "outcome": "submitted",
            "receipt_id": receipt_handoff.receipt_id,
            "source_refs": {
                "session_id": EXECUTION_ID,
                "source_run_id": ROOT_ATTEMPT_ID,
            },
        },
        authority=_authority(
            attempt_id=ROOT_ATTEMPT_ID,
            origin="interaction_resolution",
            interaction_id=interaction_id,
            interaction_kind="human_input",
        ),
        durable_receipt=receipt_handoff,
    )
    bound.event.pop(field)

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.deliver_interaction_resolution(bound)

    assert queued == []


@pytest.mark.parametrize(
    "mutation",
    (
        pytest.param("type", id="event-type"),
        pytest.param("interaction", id="interaction-id"),
        pytest.param("source", id="source-run-id"),
        pytest.param("run", id="run-id"),
    ),
)
def test_bound_event_payload_mutation_is_rejected_again_at_delivery(
    tmp_path,
    monkeypatch,
    mutation: str,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    before = _snapshot(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )
    interaction_id = "interaction-post-bind-mutation"
    bound = boundary.bind_presentation(
        _presentation_event("tool_approval", interaction_id),
        authority=_authority(
            attempt_id=ROOT_ATTEMPT_ID,
            origin="tool_approval",
            interaction_id=interaction_id,
        ),
    )

    if mutation == "type":
        bound.event["type"] = "final_message"
    elif mutation == "interaction":
        bound.event["interaction_id"] = "another-interaction"
    elif mutation == "source":
        bound.event["source_refs"] = {
            "session_id": EXECUTION_ID,
            "source_run_id": "another-attempt",
        }
    elif mutation == "run":
        bound.event["run_id"] = "another-attempt"
    else:  # pragma: no cover - the parameter set is closed above
        raise AssertionError(f"unknown mutation: {mutation}")

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.deliver(bound)

    assert queued == []
    assert _snapshot(bridge, ROOT_ATTEMPT_ID).events == before.events


def test_live_resolution_cannot_rebind_to_an_old_causal_attempt(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, RESUME_ATTEMPT_ID)
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=RESUME_ATTEMPT_ID,
        enqueue=lambda event: None,
    )
    interaction_id, receipt_handoff = _receipt_handoff(
        kind="human_input",
        occurrence="ask-resume-source",
        response={"selected_values": ["react"]},
        source_run_id=RESUME_ATTEMPT_ID,
    )
    with pytest.raises(PupuUnchainHostEventBoundaryError):
        _authority(
            attempt_id=RESUME_ATTEMPT_ID,
            source_attempt_id=PAUSED_ATTEMPT_ID,
            origin="interaction_resolution",
            interaction_id=interaction_id,
        )

    authority = _authority(
        attempt_id=RESUME_ATTEMPT_ID,
        source_attempt_id=RESUME_ATTEMPT_ID,
        origin="interaction_resolution",
        interaction_id=interaction_id,
    )
    base_event = {
        "type": "interaction_resolved",
        "event_id": "interaction-resolved-resume-source",
        "run_id": RESUME_ATTEMPT_ID,
        "interaction_id": interaction_id,
        "kind": "human_input",
        "outcome": "submitted",
        "receipt_id": receipt_handoff.receipt_id,
        "source_refs": {
            "session_id": EXECUTION_ID,
            "source_run_id": RESUME_ATTEMPT_ID,
        },
    }

    bound = boundary.bind_interaction_resolution(
        base_event,
        authority=authority,
        durable_receipt=receipt_handoff,
    )
    assert bound.authority.attempt_id == RESUME_ATTEMPT_ID
    assert bound.authority.source_attempt_id == RESUME_ATTEMPT_ID

    for drift in (
        {"run_id": PAUSED_ATTEMPT_ID},
        {
            "source_refs": {
                "session_id": EXECUTION_ID,
                "source_run_id": "another-paused-attempt",
            }
        },
    ):
        event = copy.deepcopy(base_event)
        event.update(drift)
        with pytest.raises(PupuUnchainHostEventBoundaryError):
            boundary.bind_interaction_resolution(
                event,
                authority=authority,
                durable_receipt=receipt_handoff,
            )


def test_cold_resume_bootstrap_persists_one_typed_resolution_without_host_rewrite(
    tmp_path,
    monkeypatch,
) -> None:
    paused_bridge = _prepare_bridge(
        tmp_path,
        monkeypatch,
        attempt_id=PAUSED_ATTEMPT_ID,
        current_input_draft=PupuMemoryV2TextInputDraft(content="Choose a framework"),
    )
    _bind_attempt(paused_bridge, PAUSED_ATTEMPT_ID)
    interaction_id = "interaction-cold-resume"
    paused_bridge.modules[0].runtime.persist_event(
        {
            "type": "interaction_requested",
            "run_id": PAUSED_ATTEMPT_ID,
            "iteration": 1,
            "interaction_request": {
                "interaction_id": interaction_id,
                "kind": "human_input",
                "payload": {"request_id": "ask-cold-resume"},
            },
        }
    )
    assert _event_types(paused_bridge, PAUSED_ATTEMPT_ID).count(
        "interaction.resolved"
    ) == 0

    resume_input = PupuMemoryV2InteractionInputDraft(
        interaction_id=interaction_id,
        response={"selected_values": ["react"]},
        submitted_by="ui:test",
    )
    resume_bridge = _prepare_bridge(
        tmp_path,
        monkeypatch,
        attempt_id=RESUME_ATTEMPT_ID,
        current_input_draft=resume_input,
        run_lineage=(PAUSED_ATTEMPT_ID, RESUME_ATTEMPT_ID),
    )
    _bind_attempt(resume_bridge, RESUME_ATTEMPT_ID)
    first = _snapshot(resume_bridge, RESUME_ATTEMPT_ID)
    resolved = [
        event
        for event in first.events
        if event.event_type == "interaction.resolved"
    ]
    assert len(resolved) == 1
    assert resolved[0].attempt.attempt_id == RESUME_ATTEMPT_ID
    assert resolved[0].payload["interaction_id"] == interaction_id

    cold_bridge = _prepare_bridge(
        tmp_path,
        monkeypatch,
        attempt_id=RESUME_ATTEMPT_ID,
        current_input_draft=resume_input,
        run_lineage=(PAUSED_ATTEMPT_ID, RESUME_ATTEMPT_ID),
    )
    _bind_attempt(cold_bridge, RESUME_ATTEMPT_ID)
    cold = _snapshot(cold_bridge, RESUME_ATTEMPT_ID)

    assert cold.events == first.events
    assert [event.event_type for event in cold.events].count(
        "interaction.resolved"
    ) == 1


@pytest.mark.parametrize(
    ("persisted_response", "registry_state", "expected_response"),
    (
        pytest.param(
            {
                "request_id": "cold-ask-user",
                "selected_values": ["react"],
                "other_text": None,
            },
            "completed",
            {
                "request_id": "cold-ask-user",
                "selected_values": ["react"],
                "other_text": None,
            },
            id="answered-terminal-completed",
        ),
        pytest.param(
            None,
            "failed",
            {
                "cancelled": True,
                "reason": "interaction_abandoned_for_new_message",
            },
            id="awaiting-terminal-failed",
        ),
    ),
)
def test_cold_cancel_projects_authoritative_receipt_without_resuming_old_run(
    tmp_path,
    monkeypatch,
    persisted_response: dict | None,
    registry_state: str,
    expected_response: dict,
) -> None:
    import execution_control

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(response=persisted_response)
    bridge.modules[0].runtime.persist_event(
        {
            "type": "tool_call",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "tool_name": "ask_user_question",
            "call_id": "cold-ask-user",
            "arguments": {"question": "Which framework?"},
        }
    )
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    if registry_state == "completed":
        execution_control.mark_completed(EXECUTION_ID, ROOT_ATTEMPT_ID)
    else:
        execution_control.mark_failed(
            EXECUTION_ID,
            ROOT_ATTEMPT_ID,
            reason="provider transport failed after interaction",
        )

    first = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="interaction_abandoned_for_new_message",
    )
    retry = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="interaction_abandoned_for_new_message",
    )

    assert first["state"] == registry_state
    assert first["durable_interaction_cancelled"] is True
    assert first["context_interaction_reconciled"] is True
    assert retry["context_interaction_reconciled"] is True
    resolutions = [
        event
        for event in _snapshot(bridge, ROOT_ATTEMPT_ID).events
        if event.event_type == "interaction.resolved"
        and event.payload.get("interaction_id") == request.interaction_id
    ]
    assert len(resolutions) == 1
    artifact_value = json.loads(resolutions[0].payload["preview"])
    assert artifact_value["response"] == expected_response
    compiled = _compile_active_context(bridge, ROOT_ATTEMPT_ID)
    assert compiled.envelope.status.value == "complete"
    assert compiled.diagnostics["atomic_call_ids"] == ()
    assert "pending_interaction" not in compiled.to_dict()
    fresh_bridge = _prepare_bridge(
        tmp_path,
        monkeypatch,
        attempt_id=FRESH_ATTEMPT_ID,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content="Start a clean task without resuming the old run",
            message_index=1,
        ),
        run_lineage=(ROOT_ATTEMPT_ID, FRESH_ATTEMPT_ID),
    )
    _bind_attempt(fresh_bridge, FRESH_ATTEMPT_ID)
    after_fresh_text = _compile_active_context(
        fresh_bridge,
        FRESH_ATTEMPT_ID,
    )
    assert after_fresh_text.diagnostics["atomic_call_ids"] == ()
    assert "Start a clean task without resuming the old run" in str(
        after_fresh_text.messages
    )
    assert (
        "react" in str(after_fresh_text.messages)
        if persisted_response is not None
        else "cancelled" in str(after_fresh_text.messages)
    )
    assert durable_host.get_pending_interaction(EXECUTION_ID) == {
        "status": "none",
        "session_id": EXECUTION_ID,
    }


def test_cold_cancel_supersedes_historical_malformed_generic_resolution(
    tmp_path,
    monkeypatch,
) -> None:
    import execution_control

    response = {
        "request_id": "cold-ask-user",
        "selected_values": ["react"],
        "other_text": None,
    }
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(response=response)
    bridge.modules[0].runtime.persist_event(
        {
            "type": "tool_call",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "tool_name": "ask_user_question",
            "call_id": "cold-ask-user",
            "arguments": {"question": "Which framework?"},
        }
    )
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "interaction_resolved",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "interaction_id": request.interaction_id,
            "kind": "human_input",
            "outcome": "submitted",
        }
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_failed(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
        reason="historical generic resolution failed compilation",
    )

    result = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="interaction_abandoned_for_new_message",
    )

    assert result["context_interaction_reconciled"] is True
    event_types = _event_types(bridge, ROOT_ATTEMPT_ID)
    assert event_types.count("interaction_resolved") == 1
    assert event_types.count("interaction.resolved") == 1
    compiled = _compile_active_context(bridge, ROOT_ATTEMPT_ID)
    assert compiled.envelope.status.value == "complete"
    assert compiled.diagnostics["atomic_call_ids"] == ()


def test_stale_cancel_for_applied_interaction_cannot_consume_new_same_run_wait(
    tmp_path,
    monkeypatch,
) -> None:
    import execution_control
    from unchain.interaction import (
        INTERACTION_JOURNAL_KEY,
        INTERACTION_KIND_HUMAN_INPUT,
        build_interaction_request,
    )
    from unchain.interaction.durable import mark_interaction_applied
    from unchain.interaction.runtime import response_contract_for_kind
    from unchain.memory import KernelMemoryRuntime
    from unchain.memory.checkpoint_state import (
        EXECUTION_CHECKPOINT_DOMAIN_KEY,
        EXECUTION_CHECKPOINT_KEY,
        build_execution_checkpoint,
    )

    _prepare_bridge(tmp_path, monkeypatch)
    _mark_sticky_active()
    first = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        }
    )
    memory = KernelMemoryRuntime.from_config(store=durable_host._session_store())
    current = memory.load_session_snapshot(EXECUTION_ID)
    state = copy.deepcopy(current.state)
    first_entry = state[INTERACTION_JOURNAL_KEY]["entries"][
        first.interaction_id
    ]
    state[INTERACTION_JOURNAL_KEY] = mark_interaction_applied(
        state[INTERACTION_JOURNAL_KEY],
        interaction_id=first.interaction_id,
        receipt_id=first_entry["receipt"]["receipt_id"],
        applied_checkpoint_id="continued:first-interaction",
    )
    state.pop(EXECUTION_CHECKPOINT_KEY, None)
    state.pop(EXECUTION_CHECKPOINT_DOMAIN_KEY, None)
    applied = memory.save_session_state(
        EXECUTION_ID,
        state,
        expected_revision=current.revision,
    )

    second_state = RunState()
    second_state.seed_messages([{"role": "user", "content": "ask again"}])
    second_state.session_state.session_id = EXECUTION_ID
    second_state.provider_state.provider = "openai"
    second_state.provider_state.model = "gpt-host-event-test"
    second_state.memory_state["session_revision"] = applied.revision
    second_state.iteration = 2
    second_state.last_continuation = {
        "type": "durable_interaction",
        "occurrence": "cold-ask-user-second",
    }
    second = build_interaction_request(
        session_id=EXECUTION_ID,
        kind=INTERACTION_KIND_HUMAN_INPUT,
        source_run_id=ROOT_ATTEMPT_ID,
        occurrence="cold-ask-user-second",
        payload={
            "request_id": "cold-ask-user-second",
            "kind": "selector",
            "title": "Choose again",
            "question": "Which framework now?",
            "selection_mode": "single",
            "options": [
                {"label": "Vue", "value": "vue", "description": ""},
            ],
            "allow_other": False,
            "other_label": "Other",
            "other_placeholder": "",
            "min_selected": 1,
            "max_selected": 1,
        },
        response_contract=response_contract_for_kind(
            INTERACTION_KIND_HUMAN_INPUT
        ),
        created_revision=int(applied.revision or 0),
        subject={"provider": "openai", "model": "gpt-host-event-test"},
    )
    second_state.suspend_state.payload = {
        "interaction_request": second.to_dict()
    }
    second_checkpoint = build_execution_checkpoint(
        second_state,
        status="awaiting_interaction",
        run_id=ROOT_ATTEMPT_ID,
    )
    memory.save_execution_checkpoint_snapshot(
        EXECUTION_ID,
        second_checkpoint,
        interaction_request=second.to_dict(),
        expected_revision=applied.revision,
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)

    with pytest.raises(
        DurableInteractionHostError,
        match="no longer pending",
    ) as caught:
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=ROOT_ATTEMPT_ID,
            owner_chat_id=OWNER_CHAT_ID,
            expected_interaction_id=first.interaction_id,
            reason="late_first_interaction_stop",
        )

    assert caught.value.code == "interaction_cancel_target_not_pending"
    assert durable_host._execution_control_status(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) == "running"
    pending = durable_host.get_pending_interaction(EXECUTION_ID)
    assert pending["status"] == "awaiting_response"
    assert pending["interaction_id"] == second.interaction_id


def test_exact_cancel_cas_closes_preflight_to_new_interaction_race(
    tmp_path,
    monkeypatch,
) -> None:
    import execution_control

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    first = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        }
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    before_events = tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events)
    original_cancel = durable_host._cancel_pending_source_attempt_result
    switched: dict[str, object] = {}

    def race_cancel(
        session_id,
        source_attempt_id,
        *,
        expected_interaction_id="",
        reason,
    ):
        switched["second"] = _replace_with_second_durable_interaction(first)
        return original_cancel(
            session_id,
            source_attempt_id,
            expected_interaction_id=expected_interaction_id,
            reason=reason,
        )

    monkeypatch.setattr(
        durable_host,
        "_cancel_pending_source_attempt_result",
        race_cancel,
    )
    with pytest.raises(
        DurableInteractionHostError,
        match="changed before atomic apply",
    ) as caught:
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=ROOT_ATTEMPT_ID,
            owner_chat_id=OWNER_CHAT_ID,
            expected_interaction_id=first.interaction_id,
            reason="late_first_interaction_stop",
        )

    second = switched["second"]
    assert caught.value.code == "interaction_cancel_target_changed"
    assert durable_host._execution_control_status(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) == "running"
    assert durable_host._load_execution_cancellation(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is None
    assert durable_host.load_resume_context(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is not None
    pending = durable_host.get_pending_interaction(EXECUTION_ID)
    assert pending["interaction_id"] == second.interaction_id
    target = durable_host._interaction_cancel_target(
        EXECUTION_ID,
        second.interaction_id,
    )
    assert target is not None and target.is_active
    assert target.entry["receipt"] is None
    assert target.entry["application"] is None
    assert tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events) == before_events


def test_exact_cancel_rejects_normal_application_winner_before_registry_revoke(
    tmp_path,
    monkeypatch,
) -> None:
    import execution_control
    from unchain.memory import KernelMemoryRuntime

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    first = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        }
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    before_events = tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events)
    original_save = KernelMemoryRuntime.save_interaction_session_state
    switched: dict[str, object] = {}

    def save_after_normal_winner(self, *args, **kwargs):
        if "second" not in switched:
            switched["second"] = _replace_with_second_durable_interaction(
                first
            )
        return original_save(self, *args, **kwargs)

    monkeypatch.setattr(
        KernelMemoryRuntime,
        "save_interaction_session_state",
        save_after_normal_winner,
    )
    with pytest.raises(
        DurableInteractionHostError,
        match="changed before atomic apply",
    ) as caught:
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=ROOT_ATTEMPT_ID,
            owner_chat_id=OWNER_CHAT_ID,
            expected_interaction_id=first.interaction_id,
            reason="late_first_interaction_stop",
        )

    second = switched["second"]
    assert caught.value.code == "interaction_cancel_target_changed"
    assert durable_host._execution_control_status(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) == "running"
    assert durable_host._load_execution_cancellation(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is None
    assert durable_host.load_resume_context(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is not None
    pending = durable_host.get_pending_interaction(EXECUTION_ID)
    assert pending["interaction_id"] == second.interaction_id
    target = durable_host._interaction_cancel_target(
        EXECUTION_ID,
        second.interaction_id,
    )
    assert target is not None and target.is_active
    assert target.entry["receipt"] is None
    assert target.entry["application"] is None
    assert tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events) == before_events


def test_shadow_durable_cancel_requires_exact_id_without_context_projection(
    tmp_path,
    monkeypatch,
) -> None:
    import execution_control

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    authority = open_pupu_unchain_admission_authority(
        owner_chat_id=OWNER_CHAT_ID,
        preflight_complete=True,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id=OWNER_CHAT_ID,
        session_id=EXECUTION_ID,
        requested_rollout_mode="canary",
        effective_rollout_mode="canary",
        cohort="shadow_control",
        target_mode="active",
        decision_reason="shadow-cancel-test",
        canary_selected=False,
        canary_percent=0,
        canary_bucket=1,
        hash_strategy="sha256_owner_v1",
        provenance={"source": "shadow-cancel-test"},
        operation_id="admit-shadow-cancel-test",
    )
    assert admission["effective_mode"] == "shadow"
    request = _seed_durable_cold_interaction(response=None)
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)

    with pytest.raises(
        DurableInteractionHostError,
        match="requires interaction_id",
    ) as missing:
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=ROOT_ATTEMPT_ID,
            owner_chat_id=OWNER_CHAT_ID,
            reason="user_stop",
        )
    assert missing.value.code == "interaction_cancel_target_required"
    assert durable_host._execution_control_status(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) == "running"

    result = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="user_stop",
    )

    assert result["durable_interaction_cancelled"] is True
    assert result["context_interaction_reconciled"] is False
    assert durable_host.get_pending_interaction(EXECUTION_ID) == {
        "status": "none",
        "session_id": EXECUTION_ID,
    }
    assert [
        event
        for event in _snapshot(bridge, ROOT_ATTEMPT_ID).events
        if event.event_type == "interaction.resolved"
    ] == []


@pytest.mark.parametrize("terminal_state", ("completed", "failed"))
def test_terminal_shadow_exact_cancel_closes_durable_without_context_projection(
    tmp_path,
    monkeypatch,
    terminal_state: str,
) -> None:
    import execution_control

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    authority = open_pupu_unchain_admission_authority(
        owner_chat_id=OWNER_CHAT_ID,
        preflight_complete=True,
    )
    admission = authority.resolve_chat_admission(
        owner_chat_id=OWNER_CHAT_ID,
        session_id=EXECUTION_ID,
        requested_rollout_mode="canary",
        effective_rollout_mode="canary",
        cohort="shadow_control",
        target_mode="active",
        decision_reason="terminal-shadow-cancel-test",
        canary_selected=False,
        canary_percent=0,
        canary_bucket=1,
        hash_strategy="sha256_owner_v1",
        provenance={"source": "terminal-shadow-cancel-test"},
        operation_id="admit-terminal-shadow-cancel-test",
    )
    assert admission["effective_mode"] == "shadow"
    request = _seed_durable_cold_interaction(response=None)
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    if terminal_state == "completed":
        execution_control.mark_completed(EXECUTION_ID, ROOT_ATTEMPT_ID)
    else:
        execution_control.mark_failed(
            EXECUTION_ID,
            ROOT_ATTEMPT_ID,
            reason="provider_failed_after_wait",
        )
    before_events = tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events)

    result = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="user_stop",
    )

    assert result["state"] == terminal_state
    assert result["durable_interaction_cancelled"] is True
    assert durable_host.get_pending_interaction(EXECUTION_ID) == {
        "status": "none",
        "session_id": EXECUTION_ID,
    }
    assert durable_host.load_resume_context(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is None
    assert durable_host._load_execution_cancellation(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is None
    assert tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events) == before_events


@pytest.mark.parametrize(
    ("set_clause", "value"),
    (
        pytest.param("scope_sha256=?", "0" * 64, id="scope-hash"),
        pytest.param(
            "bootstrap_provenance_json=?",
            "{}",
            id="bootstrap-provenance",
        ),
        pytest.param("owner_chat_id=?", "foreign-owner", id="owner-scope"),
        pytest.param(
            "bootstrap_status='pending', v2_bootstrapped=?",
            0,
            id="active-pending-conflict",
        ),
    ),
)
def test_cold_cancel_rejects_tampered_active_admission_before_any_mutation(
    tmp_path,
    monkeypatch,
    set_clause: str,
    value: object,
) -> None:
    import execution_control
    import sqlite3

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(response=None)
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    execution_control.register(EXECUTION_ID, ROOT_ATTEMPT_ID)
    execution_control.mark_running(EXECUTION_ID, ROOT_ATTEMPT_ID)
    database_path = (
        Path(os.environ["UNCHAIN_DATA_DIR"])
        / "memory_v2"
        / "context_v2.sqlite3"
    )
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            f"UPDATE pupu_context_v2_admissions SET {set_clause} "
            "WHERE owner_chat_id=?",
            (value, OWNER_CHAT_ID),
        )
        connection.commit()
    before_events = tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events)

    with pytest.raises(PupuUnchainActiveBridgeError):
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=ROOT_ATTEMPT_ID,
            owner_chat_id=OWNER_CHAT_ID,
            expected_interaction_id=request.interaction_id,
            reason="user_stop",
        )

    assert durable_host._execution_control_status(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) == "running"
    assert durable_host._load_execution_cancellation(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is None
    target = durable_host._interaction_cancel_target(
        EXECUTION_ID,
        request.interaction_id,
    )
    assert target is not None and target.is_active
    assert target.entry["receipt"] is None
    assert target.entry["application"] is None
    assert durable_host.load_resume_context(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    ) is not None
    assert tuple(_snapshot(bridge, ROOT_ATTEMPT_ID).events) == before_events


def test_fresh_active_preflight_repairs_cancelled_poison_without_resume(
    tmp_path,
    monkeypatch,
) -> None:
    import sqlite3

    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        }
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "tool_call",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "tool_name": "ask_user_question",
            "call_id": "cold-ask-user",
            "arguments": {"question": "Which framework?"},
        }
    )
    _seed_interaction_request(
        bridge,
        attempt_id=ROOT_ATTEMPT_ID,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "interaction_resolved",
            "run_id": ROOT_ATTEMPT_ID,
            "iteration": 1,
            "interaction_id": request.interaction_id,
            "kind": "human_input",
            "outcome": "submitted",
        }
    )
    durable_host._interaction_runtime().cancel_pending(
        EXECUTION_ID,
        source_run_id=ROOT_ATTEMPT_ID,
        expected_interaction_id=request.interaction_id,
        reason="interaction_abandoned_for_new_message",
    )
    durable_host.clear_execution_attempt_binding(
        EXECUTION_ID,
        ROOT_ATTEMPT_ID,
    )
    graph_locator = _save_graph_owner_record(
        step_attempt_id=ROOT_ATTEMPT_ID,
        owner_chat_id=OWNER_CHAT_ID,
    )
    assert graph_locator["owner_chat_id"] == OWNER_CHAT_ID
    assert durable_host.get_pending_interaction(EXECUTION_ID) == {
        "status": "none",
        "session_id": EXECUTION_ID,
    }
    assert _event_types(bridge, ROOT_ATTEMPT_ID).count(
        "interaction.resolved"
    ) == 0

    def provider_authority_counts() -> tuple[int, int]:
        database_path = (
            Path(os.environ["UNCHAIN_DATA_DIR"])
            / "memory_v2"
            / "context_v2.sqlite3"
        )
        with sqlite3.connect(database_path) as connection:
            return (
                connection.execute(
                    "SELECT COUNT(*) FROM provider_request_lease_revisions"
                ).fetchone()[0],
                connection.execute(
                    "SELECT COUNT(*) FROM provider_turn_result_receipts"
                ).fetchone()[0],
            )

    before_provider_authorities = provider_authority_counts()

    with mock.patch.object(
        durable_host,
        "_execution_control_cancel",
    ) as execution_cancel, mock.patch.object(
        adapter,
        "resume_chat_interaction_events",
    ) as resume_interaction:
        fresh_bridge = _prepare_bridge(
            tmp_path,
            monkeypatch,
            attempt_id=FRESH_ATTEMPT_ID,
            current_input_draft=PupuMemoryV2TextInputDraft(
                content="Start fresh after the failed interaction",
                message_index=1,
            ),
            run_lineage=(ROOT_ATTEMPT_ID, FRESH_ATTEMPT_ID),
        )

    execution_cancel.assert_not_called()
    resume_interaction.assert_not_called()
    assert provider_authority_counts() == before_provider_authorities
    _bind_attempt(fresh_bridge, FRESH_ATTEMPT_ID)
    repaired = [
        event
        for event in _snapshot(fresh_bridge, FRESH_ATTEMPT_ID).events
        if event.event_type == "interaction.resolved"
        and event.payload.get("interaction_id") == request.interaction_id
    ]
    assert len(repaired) == 1
    compiled = _compile_active_context(fresh_bridge, FRESH_ATTEMPT_ID)
    assert compiled.envelope.status.value == "complete"
    assert compiled.diagnostics["atomic_call_ids"] == ()
    assert "Start fresh after the failed interaction" in str(
        compiled.messages
    )
    assert "react" in str(compiled.messages)


def test_fresh_active_preflight_ignores_cancelled_legacy_entry_without_request(
    tmp_path,
    monkeypatch,
) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        }
    )
    durable_host._interaction_runtime().cancel_pending(
        EXECUTION_ID,
        source_run_id=ROOT_ATTEMPT_ID,
        expected_interaction_id=request.interaction_id,
        reason="legacy_interaction_cancelled_before_context_v2",
    )

    fresh_bridge = _prepare_bridge(
        tmp_path,
        monkeypatch,
        attempt_id=FRESH_ATTEMPT_ID,
        current_input_draft=PupuMemoryV2TextInputDraft(
            content="Fresh input after a legacy-only cancellation",
            message_index=1,
        ),
        run_lineage=(ROOT_ATTEMPT_ID, FRESH_ATTEMPT_ID),
    )
    _bind_attempt(fresh_bridge, FRESH_ATTEMPT_ID)

    assert [
        event
        for event in _snapshot(fresh_bridge, FRESH_ATTEMPT_ID).events
        if event.event_type == "interaction.resolved"
    ] == []
    compiled = _compile_active_context(fresh_bridge, FRESH_ATTEMPT_ID)
    assert compiled.envelope.status.value == "complete"
    assert "Fresh input after a legacy-only cancellation" in str(
        compiled.messages
    )


@pytest.mark.parametrize(
    "failure_stage",
    (
        pytest.param("before-context-ingress", id="apply-then-ingress-crash"),
        pytest.param("before-clear", id="ingress-then-clear-crash"),
    ),
)
def test_cross_attempt_cancel_retry_recovers_exact_applied_source(
    tmp_path,
    monkeypatch,
    failure_stage: str,
) -> None:
    import execution_control
    import memory_v2_unchain_active_bridge as active_bridge_module

    current_attempt_id = RESUME_ATTEMPT_ID
    source_attempt_id = ROOT_ATTEMPT_ID
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, source_attempt_id)
    _mark_sticky_active()
    request = _seed_durable_cold_interaction(
        response={
            "request_id": "cold-ask-user",
            "selected_values": ["react"],
            "other_text": None,
        },
        source_attempt_id=source_attempt_id,
    )
    bridge.modules[0].runtime.persist_event(
        {
            "type": "tool_call",
            "run_id": source_attempt_id,
            "iteration": 1,
            "tool_name": "ask_user_question",
            "call_id": "cold-ask-user",
            "arguments": {"question": "Which framework?"},
        }
    )
    _seed_interaction_request(
        bridge,
        attempt_id=source_attempt_id,
        interaction_id=request.interaction_id,
        kind="human_input",
        call_id="cold-ask-user",
    )
    durable_host.bind_execution_attempt(
        session_id=EXECUTION_ID,
        attempt_id=current_attempt_id,
        source_attempt_id=source_attempt_id,
    )
    execution_control.register(EXECUTION_ID, current_attempt_id)
    execution_control.mark_running(EXECUTION_ID, current_attempt_id)
    execution_control.mark_failed(
        EXECUTION_ID,
        current_attempt_id,
        reason="failed after waiting for source interaction",
    )

    if failure_stage == "before-context-ingress":
        original_ingress = (
            active_bridge_module.persist_pupu_unchain_cold_interaction_resolution
        )
        ingress_calls = 0

        def fail_ingress_once(**kwargs):
            nonlocal ingress_calls
            ingress_calls += 1
            if ingress_calls == 1:
                raise RuntimeError("injected ingress crash")
            return original_ingress(**kwargs)

        monkeypatch.setattr(
            active_bridge_module,
            "persist_pupu_unchain_cold_interaction_resolution",
            fail_ingress_once,
        )
    else:
        original_clear = durable_host.clear_resume_context
        clear_calls = 0

        def fail_clear_once(session_id, run_id):
            nonlocal clear_calls
            clear_calls += 1
            if clear_calls == 1:
                raise RuntimeError("injected clear crash")
            return original_clear(session_id, run_id)

        monkeypatch.setattr(
            durable_host,
            "clear_resume_context",
            fail_clear_once,
        )

    with pytest.raises(Exception, match="injected"):
        durable_host.cancel_chat_execution(
            session_id=EXECUTION_ID,
            attempt_id=current_attempt_id,
            owner_chat_id=OWNER_CHAT_ID,
            expected_interaction_id=request.interaction_id,
            reason="interaction_abandoned_for_new_message",
        )

    retry = durable_host.cancel_chat_execution(
        session_id=EXECUTION_ID,
        attempt_id=current_attempt_id,
        owner_chat_id=OWNER_CHAT_ID,
        expected_interaction_id=request.interaction_id,
        reason="interaction_abandoned_for_new_message",
    )

    assert retry["source_attempt_id"] == source_attempt_id
    assert retry["context_interaction_reconciled"] is True
    resolutions = [
        event
        for event in _snapshot(bridge, source_attempt_id).events
        if event.event_type == "interaction.resolved"
        and event.payload.get("interaction_id") == request.interaction_id
    ]
    assert len(resolutions) == 1
    assert durable_host.load_execution_attempt_binding(
        EXECUTION_ID,
        current_attempt_id,
    ) is None
    assert durable_host.get_pending_interaction(EXECUTION_ID) == {
        "status": "none",
        "session_id": EXECUTION_ID,
    }


def test_lane_origin_pairs_are_closed_before_delivery(tmp_path, monkeypatch) -> None:
    bridge = _prepare_bridge(tmp_path, monkeypatch)
    _bind_attempt(bridge, ROOT_ATTEMPT_ID)
    queued: list[dict] = []
    boundary = PupuUnchainHostEventBoundary(
        active_bridge=bridge,
        execution_id=EXECUTION_ID,
        attempt_id=ROOT_ATTEMPT_ID,
        enqueue=queued.append,
    )

    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_presentation(
            _presentation_event("human_input", "interaction-wrong-lane"),
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="interaction_resolution",
                interaction_id="interaction-wrong-lane",
            ),
        )
    with pytest.raises(PupuUnchainHostEventBoundaryError):
        boundary.bind_semantic(
            {
                "type": "final_message",
                "run_id": ROOT_ATTEMPT_ID,
                "iteration": 1,
                "content": "wrong origin",
            },
            authority=_authority(
                attempt_id=ROOT_ATTEMPT_ID,
                origin="human_input",
                interaction_id="interaction-wrong-lane",
            ),
        )

    assert queued == []
