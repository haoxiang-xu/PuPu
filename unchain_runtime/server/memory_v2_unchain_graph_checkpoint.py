"""Thin PuPu host binding for Unchain's canonical graph checkpoints.

PuPu resolves product-owned graph descriptors and run identity.  Unchain owns
the execution plan CAS, durable predecessor handoff, step checkpoints,
restart recovery, output artifacts, and Agent bootstrap ordering.

This module is additive infrastructure only.  Importing or constructing it
does not open the active graph production gate.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from memory_v2_unchain_active_bridge import PupuUnchainActiveBridge
from memory_v2_unchain_run_binding import (
    PupuMemoryV2RunBinding,
)
from unchain.agent.modules.graph_checkpoint import (
    GraphStepBootstrapModule,
    GraphStepResumeModule,
)
from unchain.context.derived_handoff import DerivedHandoffInputIngress
from unchain.context.graph_checkpoint import (
    GraphCheckpointService,
    GraphExecutionPlan,
    GraphRecovery,
    GraphStepBinding,
    GraphStepCompletion,
    JournalGraphCheckpointRepository,
)
from unchain.context.graph_harness import GraphStepBootstrapBinding
from unchain.context.graph_harness import GraphStepResumeBinding
from unchain.context.ingress import HostResolvedInteractionInput
from unchain.context.task_state_bootstrap import PinnedTaskStateBootstrapHarness
from unchain.journal import AttemptRef, EventCursor
from unchain.journal.models import (
    _freeze_json,
    _required_text,
    _thaw_json,
)
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainGraphCheckpointHostError(RuntimeError):
    """PuPu could not bind one graph to the official Unchain checkpoint core."""


def bootstrap_pupu_unchain_recipe_graph_input(
    *,
    bridge: Any,
    prepared_subagent_input: Any,
) -> Any:
    """Persist the parent-prepared recipe task into its coordinator attempt."""

    from memory_v2_unchain_shadow_bridge import PupuUnchainShadowEventBridge
    from unchain.context.subagent_input import (
        PreparedSubagentInput,
    )

    if not isinstance(
        bridge,
        (PupuUnchainActiveBridge, PupuUnchainShadowEventBridge),
    ):
        raise TypeError("bridge must be an official active or shadow bridge")
    binding = bridge.preparation.binding
    if binding.role is not MemoryV2RunRole.SUBAGENT:
        raise PupuUnchainGraphCheckpointHostError(
            "prepared recipe graph input requires a subagent coordinator"
        )
    state = RunState()
    state.session_state.session_id = binding.execution_id
    context = HarnessContext(
        state=state,
        phase="bootstrap",
        event={"run_id": binding.run_id},
    )
    factory = bridge.preparation.host_factory
    execution_factory = factory.context_module.runtime.execution_factory
    if execution_factory is None:
        raise PupuUnchainGraphCheckpointHostError(
            "recipe-ref graph has no Context V2 execution factory"
        )
    runtime = factory.context_module.runtime
    if prepared_subagent_input is not None:
        if type(prepared_subagent_input) is not PreparedSubagentInput:
            raise PupuUnchainGraphCheckpointHostError(
                "recipe-ref graph requires one exact prepared subagent input"
            )
        runtime.bind_prepared_subagent_input(
            prepared_subagent_input.child_run_id,
            prepared=prepared_subagent_input,
        )
    else:
        execution_factory.bind(context)
    coordinator = factory.attempt(
        execution_id=binding.execution_id,
        attempt_id=binding.attempt_id,
    )
    if prepared_subagent_input is None:
        inputs = tuple(
            event
            for event in coordinator.bundle.journal.capture_snapshot().events
            if event.attempt == coordinator.bundle.attempt
            and event.event_type == "message.user"
        )
        if len(inputs) != 1:
            raise PupuUnchainGraphCheckpointHostError(
                "recipe-ref graph requires one exact durable input"
            )
        message = _thaw_json(inputs[0].payload.get("message"))
        try:
            descriptor = json.loads(str(message.get("content") or ""))
        except (AttributeError, TypeError, json.JSONDecodeError) as error:
            raise PupuUnchainGraphCheckpointHostError(
                "recipe-ref graph durable input is invalid"
            ) from error
        expected_source = AttemptRef(
            coordinator.bundle.attempt.generation,
            binding.source_attempt_id,
        )
        if (
            descriptor.get("schema") != "unchain.derived_handoff_input.v1"
            or descriptor.get("consumer_attempt")
            != coordinator.bundle.attempt.to_dict()
            or descriptor.get("source_attempt") != expected_source.to_dict()
        ):
            raise PupuUnchainGraphCheckpointHostError(
                "recipe-ref graph durable input changed its lineage"
            )
        return coordinator
    if (
        prepared_subagent_input.child_attempt != coordinator.bundle.attempt
        or prepared_subagent_input.parent_attempt.attempt_id
        != binding.source_attempt_id
        or prepared_subagent_input.parent_attempt.generation
        != coordinator.bundle.attempt.generation
    ):
        raise PupuUnchainGraphCheckpointHostError(
            "prepared recipe graph input changed its durable lineage"
        )
    return coordinator


def _canonical_json_bytes(value: Any) -> bytes:
    try:
        canonical = _thaw_json(_freeze_json(value, path="graph_host"))
        return json.dumps(
            canonical,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainGraphCheckpointHostError(
            "graph descriptor is not canonical JSON"
        ) from error


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


@dataclass(frozen=True, slots=True)
class PupuUnchainGraphStepDescriptor:
    """Host-resolved provider and prompt identity for one graph node."""

    index: int
    node_id: str
    attempt_id: str
    provider: str
    model: str
    prompt: str
    configuration: Mapping[str, Any]

    def __post_init__(self) -> None:
        if (
            isinstance(self.index, bool)
            or not isinstance(self.index, int)
            or self.index < 0
        ):
            raise ValueError("graph step index must be a non-negative integer")
        for field_name in ("node_id", "attempt_id"):
            object.__setattr__(
                self,
                field_name,
                _required_text(
                    getattr(self, field_name),
                    field_name,
                    identifier=True,
                ),
            )
        object.__setattr__(
            self,
            "provider",
            _required_text(self.provider, "provider", maximum=128).casefold(),
        )
        object.__setattr__(
            self,
            "model",
            _required_text(self.model, "model", maximum=512),
        )
        if not isinstance(self.prompt, str):
            raise TypeError("graph step prompt must be text")
        if not isinstance(self.configuration, Mapping):
            raise TypeError("graph step configuration must be an object")
        frozen = _freeze_json(dict(self.configuration), path="configuration")
        if not isinstance(frozen, Mapping):
            raise TypeError("graph step configuration must remain an object")
        object.__setattr__(self, "configuration", frozen)

    def canonical_value(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "node_id": self.node_id,
            "attempt_id": self.attempt_id,
            "prompt": self.prompt,
            "provider": self.provider,
            "model": self.model,
            "configuration": _thaw_json(self.configuration),
        }

    @property
    def configuration_sha256(self) -> str:
        return _sha256(
            {
                "schema": "pupu.unchain_graph_step_configuration.v1",
                **self.canonical_value(),
            }
        )


class PupuUnchainGraphCheckpointHost:
    """Product-host facade over one admitted Unchain graph execution plan."""

    def __init__(
        self,
        *,
        active_bridge: Any,
        steps: Sequence[PupuUnchainGraphStepDescriptor],
        prepared_subagent_input: Any = None,
    ) -> None:
        from memory_v2_unchain_shadow_bridge import PupuUnchainShadowEventBridge

        if not isinstance(
            active_bridge,
            (PupuUnchainActiveBridge, PupuUnchainShadowEventBridge),
        ):
            raise TypeError(
                "active_bridge must be an official active or shadow bridge"
            )
        if isinstance(steps, (str, bytes, bytearray)) or not isinstance(
            steps,
            Sequence,
        ):
            raise TypeError("steps must be a sequence")
        normalized_steps = tuple(steps)
        if not normalized_steps or any(
            type(step) is not PupuUnchainGraphStepDescriptor
            for step in normalized_steps
        ):
            raise TypeError("steps must contain graph step descriptors")
        if tuple(step.index for step in normalized_steps) != tuple(
            range(len(normalized_steps))
        ):
            raise ValueError("graph step descriptors must be ordered and contiguous")
        coordinator_binding = active_bridge.preparation.binding
        if coordinator_binding.role not in {
            MemoryV2RunRole.ROOT,
            MemoryV2RunRole.SUBAGENT,
        }:
            raise PupuUnchainGraphCheckpointHostError(
                "graph coordinator must be a root or recipe-ref subagent"
            )

        self.bridge = active_bridge
        # Compatibility for existing host-focused tests and callers.  The
        # object may be the observation-only bridge while shadow dry-runs use
        # the same canonical graph checkpoint data plane.
        self.active_bridge = active_bridge
        self.descriptors = normalized_steps
        self._bootstrap_coordinator(prepared_subagent_input)
        coordinator = self._attempt_for_run(
            active_bridge.preparation.binding.attempt_id
        )
        binding = active_bridge.preparation.binding
        if coordinator.bundle.attempt.attempt_id != binding.attempt_id:
            raise PupuUnchainGraphCheckpointHostError(
                "coordinator runtime changed its exact attempt binding"
            )
        self.coordinator = coordinator
        initial_cursor = self._initial_input_cursor()

        graph_steps: list[GraphStepBinding] = []
        predecessor = coordinator.bundle.attempt
        for descriptor in self.descriptors:
            attempt = AttemptRef(
                coordinator.bundle.attempt.generation,
                descriptor.attempt_id,
            )
            graph_steps.append(
                GraphStepBinding(
                    index=descriptor.index,
                    node_id=descriptor.node_id,
                    attempt=attempt,
                    source_attempt=predecessor,
                    provider=descriptor.provider,
                    model=descriptor.model,
                    configuration_sha256=descriptor.configuration_sha256,
                )
            )
            predecessor = attempt

        topology_sha256 = _sha256(
            {
                "schema": "pupu.unchain_graph_topology.v1",
                "coordinator": coordinator.bundle.attempt.to_dict(),
                "steps": [
                    descriptor.canonical_value()
                    for descriptor in self.descriptors
                ],
            }
        )
        self.plan = GraphExecutionPlan(
            orchestration_attempt=coordinator.bundle.attempt,
            topology_sha256=topology_sha256,
            initial_input_cursor=initial_cursor,
            steps=tuple(graph_steps),
        )

        self.service = GraphCheckpointService(
            repository=JournalGraphCheckpointRepository(
                coordinator.bundle.journal
            ),
            artifacts=coordinator.bundle.artifacts,
            derived_ingress_resolver=self._resolve_derived_ingress,
        )
        self.service.admit(self.plan)

    def _bootstrap_context(self) -> HarnessContext:
        binding = self.bridge.preparation.binding
        state = RunState()
        state.session_state.session_id = binding.execution_id
        return HarnessContext(
            state=state,
            phase="bootstrap",
            event={"run_id": binding.run_id},
        )

    def _bootstrap_coordinator(self, prepared_subagent_input: Any) -> None:
        factory = self.bridge.preparation.host_factory
        context = self._bootstrap_context()
        runtime = factory.context_module.runtime
        binding = self.active_bridge.preparation.binding
        if binding.role is MemoryV2RunRole.SUBAGENT:
            bootstrap_pupu_unchain_recipe_graph_input(
                bridge=self.active_bridge,
                prepared_subagent_input=prepared_subagent_input,
            )
        else:
            if prepared_subagent_input is not None:
                raise PupuUnchainGraphCheckpointHostError(
                    "root graph cannot consume a prepared subagent input"
                )
            runtime.bind_context(context)
        PinnedTaskStateBootstrapHarness(
            binding_resolver=factory.resolve_pinned_task_state_bootstrap,
        ).build_delta(context)

    def _attempt_for_run(self, run_id: str) -> PupuUnchainAttemptRuntime:
        return self.bridge.preparation.host_factory.attempt(
            execution_id=self.bridge.execution_id,
            attempt_id=_required_text(run_id, "run_id", identifier=True),
        )

    def _prepare_attempt_bundle(self, run_id: str) -> PupuUnchainAttemptRuntime:
        """Create one exact durable bundle without bootstrapping model input."""

        normalized_run_id = _required_text(
            run_id,
            "run_id",
            identifier=True,
        )
        runtime = self.bridge.preparation.host_factory.context_module.runtime
        execution_factory = runtime.execution_factory
        if execution_factory is None:
            raise PupuUnchainGraphCheckpointHostError(
                "graph step has no Context V2 execution factory"
            )
        state = RunState()
        state.session_state.session_id = self.bridge.execution_id
        execution_factory.bind(
            HarnessContext(
                state=state,
                phase="bootstrap",
                event={"run_id": normalized_run_id},
            )
        )
        return self._attempt_for_run(normalized_run_id)

    def _initial_input_cursor(self) -> EventCursor:
        attempt = self.coordinator.bundle.attempt
        candidates = tuple(
            event
            for event in self.coordinator.bundle.journal.capture_snapshot().events
            if event.attempt == attempt
            and event.event_type in {"message.user", "interaction.resolved"}
        )
        if len(candidates) != 1:
            raise PupuUnchainGraphCheckpointHostError(
                "graph coordinator requires one exact durable initial input"
            )
        event = candidates[0]
        return EventCursor(event.store_seq, event.event_id)

    def _resolve_derived_ingress(
        self,
        consumer_attempt: AttemptRef,
        source_attempt: AttemptRef,
    ) -> DerivedHandoffInputIngress:
        prepared = self._attempt_for_run(consumer_attempt.attempt_id)
        bundle = prepared.bundle
        if bundle.attempt != consumer_attempt:
            raise PupuUnchainGraphCheckpointHostError(
                "graph consumer runtime changed its exact attempt binding"
            )
        if source_attempt.generation != consumer_attempt.generation:
            raise PupuUnchainGraphCheckpointHostError(
                "graph source and consumer escaped their generation"
            )
        return DerivedHandoffInputIngress(
            consumer_attempt=consumer_attempt,
            source_attempt=source_attempt,
            handoff_recorder=bundle.handoff_recorder,
            input_ingress=bundle.ingress,
        )

    def _step(self, index: int) -> GraphStepBinding:
        if (
            isinstance(index, bool)
            or not isinstance(index, int)
            or not 0 <= index < len(self.plan.steps)
        ):
            raise ValueError("step index is outside the graph plan")
        return self.plan.steps[index]

    @property
    def canonical_build_fingerprint(self) -> str:
        return _sha256(
            {
                "schema": "pupu.unchain_graph_resume_build.v1",
                "plan": self.plan.to_dict(),
                "descriptors": [
                    descriptor.canonical_value()
                    for descriptor in self.descriptors
                ],
            }
        )

    @property
    def coordinator_binding_snapshot(self) -> dict[str, Any]:
        return self.bridge.preparation.binding.canonical_value()

    def validate_resume_context(self, value: Mapping[str, Any]) -> int:
        """Validate one durable locator against the rebuilt canonical plan."""

        if not isinstance(value, Mapping):
            raise TypeError("graph resume context must be an object")
        raw_index = value.get("step_index")
        step = self._step(raw_index)
        binding = self.bridge.preparation.binding
        expected = {
            "resume_kind": "graph_step",
            "owner_chat_id": binding.owner_chat_id,
            "graph_execution_id": binding.execution_id,
            "coordinator_attempt_id": self.plan.orchestration_attempt.attempt_id,
            "graph_plan_id": self.plan.plan_id,
            "graph_scope_id": self.plan.scope_id,
            "topology_sha256": self.plan.topology_sha256,
            "step_index": step.index,
            "node_id": step.node_id,
            "step_attempt_id": step.attempt.attempt_id,
            "predecessor_attempt_id": step.source_attempt.attempt_id,
            "provider": step.provider,
            "model": step.model,
            "configuration_sha256": step.configuration_sha256,
            "canonical_build_fingerprint": self.canonical_build_fingerprint,
        }
        if any(value.get(key) != expected_value for key, expected_value in expected.items()):
            raise PupuUnchainGraphCheckpointHostError(
                "graph resume metadata changed its canonical execution plan"
            )
        snapshot = value.get("coordinator_binding_snapshot")
        current = self.coordinator_binding_snapshot
        identity_fields = (
            "owner_chat_id",
            "execution_id",
            "session_id",
            "generation_id",
            "head_revision",
            "attempt_id",
            "run_id",
            "root_run_id",
            "role",
            "source_attempt_id",
        )
        if not isinstance(snapshot, Mapping) or any(
            snapshot.get(key) != current.get(key) for key in identity_fields
        ):
            raise PupuUnchainGraphCheckpointHostError(
                "graph resume metadata changed its coordinator binding"
            )
        return step.index

    def register_step(self, index: int) -> PupuMemoryV2RunBinding:
        """Durably bind one actual provider-backed node as GRAPH_STEP."""

        step = self._step(index)
        root = self.bridge.preparation.binding
        return self.bridge.preparation.registry.register_attempt(
            owner_chat_id=root.owner_chat_id,
            execution_id=root.execution_id,
            session_id=root.session_id,
            attempt_id=step.attempt.attempt_id,
            run_id=step.attempt.attempt_id,
            root_run_id=root.root_run_id,
            role=MemoryV2RunRole.GRAPH_STEP,
            source_attempt_id=step.source_attempt.attempt_id,
            current_input_draft=None,
        )

    def step_modules(self, index: int) -> tuple[Any, ...]:
        """Mount official active modules plus exact graph step admission."""

        step = self._step(index)
        self.register_step(index)
        runtime = self.bridge.preparation.host_factory.context_module.runtime

        def resolve(context: HarnessContext) -> GraphStepBootstrapBinding:
            if context.event.get("run_id") != step.attempt.attempt_id:
                raise PupuUnchainGraphCheckpointHostError(
                    "graph module context changed its step run identity"
                )
            return GraphStepBootstrapBinding(
                service=self.service,
                plan=self.plan,
                step_index=index,
            )

        return (
            *self.bridge.modules,
            GraphStepBootstrapModule(
                runtime=runtime,
                binding_resolver=resolve,
            ),
        )

    def resume_step_modules(
        self,
        index: int,
        *,
        interaction_id: str,
        response: Any,
        submitted_by: str = "user",
    ) -> tuple[Any, ...]:
        """Persist one exact resolution and mount resume-only admission."""

        step = self._step(index)
        self.register_step(index)
        prepared = self._prepare_attempt_bundle(step.attempt.attempt_id)
        receipt = prepared.bundle.ingress.persist(
            HostResolvedInteractionInput(
                attempt=step.attempt,
                interaction_id=interaction_id,
                response=response,
                submitted_by=submitted_by,
            )
        )
        evidence = self.service.resolved_interaction_for_step(
            self.plan,
            index,
            interaction_id=interaction_id,
        )
        if (
            evidence.step != step
            or evidence.graph_plan_id != self.plan.plan_id
            or evidence.graph_scope_id != self.plan.scope_id
            or receipt.cursor != evidence.resolution_cursor
        ):
            raise PupuUnchainGraphCheckpointHostError(
                "graph resume evidence changed after interaction persistence"
            )
        runtime = self.bridge.preparation.host_factory.context_module.runtime

        def resolve(context: HarnessContext) -> GraphStepResumeBinding:
            if context.event.get("run_id") != step.attempt.attempt_id:
                raise PupuUnchainGraphCheckpointHostError(
                    "graph resume context changed its step run identity"
                )
            return GraphStepResumeBinding(
                service=self.service,
                plan=self.plan,
                step_index=index,
                interaction_id=evidence.interaction_id,
                request_cursor=evidence.request_cursor,
                resolution_cursor=evidence.resolution_cursor,
            )

        return (
            *self.bridge.modules,
            GraphStepResumeModule(
                runtime=runtime,
                binding_resolver=resolve,
            ),
        )

    def recover(self) -> GraphRecovery:
        return self.service.recover(self.plan)

    def should_skip(self, index: int) -> bool:
        step = self._step(index)
        recovery = self.recover()
        return any(completion.step == step for completion in recovery.completed_steps)

    def read_completed_output(self, index: int) -> Any:
        self._step(index)
        return self.service.read_completed_output(self.plan, index)

    def complete_step(
        self,
        index: int,
        *,
        full_output: Any,
    ) -> GraphStepCompletion:
        self._step(index)
        return self.service.complete_step(
            self.plan,
            index,
            full_output=full_output,
        )

    def finalize(self) -> GraphRecovery:
        return self.service.finalize(self.plan)


def prepare_pupu_unchain_graph_checkpoint_host(
    *,
    active_bridge: PupuUnchainActiveBridge,
    steps: Sequence[PupuUnchainGraphStepDescriptor],
    prepared_subagent_input: Any = None,
) -> PupuUnchainGraphCheckpointHost:
    return PupuUnchainGraphCheckpointHost(
        active_bridge=active_bridge,
        steps=steps,
        prepared_subagent_input=prepared_subagent_input,
    )


__all__ = [
    "PupuUnchainGraphCheckpointHost",
    "PupuUnchainGraphCheckpointHostError",
    "PupuUnchainGraphStepDescriptor",
    "bootstrap_pupu_unchain_recipe_graph_input",
    "prepare_pupu_unchain_graph_checkpoint_host",
]
