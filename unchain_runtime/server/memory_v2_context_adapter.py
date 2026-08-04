"""Additive PuPu host binding for Unchain's Context V2 runtime.

This module deliberately does not participate in PuPu agent assembly yet.  It
binds one already-authorized schema-v4 execution to Unchain's compiler,
coordinator, durable sink, runtime, and ``ContextModule``.  Product admission,
provider-window lookup, event projection/redaction, and durable Partial marking
remain injected PuPu policies.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from context_memory_v2_repository import (
    PupuExecutionCapabilities,
    PupuPinnedTaskStateRepository,
)
from memory_v2_context_reference_policy import (
    PupuContextReferencePolicy,
    normalize_semantic_refs_for_context,
)
from memory_v2_workspace_adapter import PupuWorkspaceReferenceAuthorizer
from unchain.agent.modules import ContextModule
from unchain.context import (
    BoundContextTaskStateReader,
    ContextBuildEnvelope,
    ContextCompileCoordinator,
    ContextCompileRequest,
    ContextRuntime,
    ContextTaskStateReadOutcome,
    SourceMessageCursor,
    resolve_context_budget,
)
from unchain.journal import (
    AttemptRef,
    DurableEventSink,
    GenerationRef,
    JournalEvent,
    SemanticEventProjector,
    SemanticEventDraft,
    journal_event_to_semantic_event,
)
from unchain.journal.ports import JournalRepositoryError, JournalScopeError


_OWNER_ID = "pupu-context-v2"
_JOURNAL_PAGE_SIZE = 1_000
_MAX_JOURNAL_PAGES = 100_000
PartialAttemptSink = Callable[[str, object, Exception], None]
ProviderWindowResolver = Callable[[str, str], int]
FixedOverheadEstimator = Callable[[Any], int]


class PupuContextHostBindingError(RuntimeError):
    """The product host could not construct one exact Context V2 capability."""


def _is_compiler_owned_context_build_audit(event: JournalEvent) -> bool:
    if event.event_type != "context.build":
        return False
    payload = dict(event.payload)
    for field_name in (
        "run_id",
        "agent_id",
        "turn_id",
        "parent_run_id",
        "tool_call_id",
        "visibility",
        "timestamp",
        "workflow_node_id",
        "workflow_step_index",
        "workflow_step_count",
        "iteration",
    ):
        payload.pop(field_name, None)
    try:
        envelope = ContextBuildEnvelope.from_dict(payload)
    except (TypeError, ValueError):
        return False
    generation = event.attempt.generation
    operation_id = event.operation.operation_id
    trigger_digest = operation_id.removeprefix("context-build-trigger.")
    compiler_operation = (
        operation_id == f"context-build.{envelope.build_id}"
        or (
            operation_id.startswith("context-build-trigger.")
            and len(trigger_digest) == 64
            and all(character in "0123456789abcdef" for character in trigger_digest)
        )
    )
    return (
        envelope.execution_id == generation.execution_id
        and envelope.generation_id == generation.generation_id
        and envelope.attempt_id == event.attempt.attempt_id
        and compiler_operation
    )


def _positive_window(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError, OverflowError):
        return 0


def _admission_text(admission: object, field_name: str) -> str:
    value = str(getattr(admission, field_name, "") or "").strip()
    if not value:
        raise ValueError(f"admission {field_name} is required")
    return value


def _validate_admission_scope(
    admission: object,
    execution: PupuExecutionCapabilities,
) -> None:
    scope = execution.scope
    if (
        _admission_text(admission, "owner_chat_id") != scope.owner_chat_id
        or _admission_text(admission, "session_id") != scope.session_id
        or _admission_text(admission, "attempt_id") != scope.attempt_id
    ):
        raise ValueError("admission and execution scope do not match")
    if str(getattr(admission, "mode", "") or "").strip() != "active":
        raise ValueError("admission must be active before mounting ContextModule")
    if bool(getattr(admission, "read_only_degraded", False)):
        raise ValueError("read-only admission cannot mount ContextModule")
    try:
        current = execution.require_current_attempt()
    except (JournalScopeError, JournalRepositoryError) as exc:
        raise PupuContextHostBindingError(
            "execution is unavailable for ContextModule binding"
        ) from exc
    if current != scope:
        raise PupuContextHostBindingError(
            "execution changed while ContextModule was being bound"
        )


def _read_generation_events(
    execution: PupuExecutionCapabilities,
) -> tuple[JournalEvent, ...]:
    snapshot = execution.journal.capture_snapshot(
        max_events=_JOURNAL_PAGE_SIZE * _MAX_JOURNAL_PAGES,
        max_bytes=32 * 1024 * 1024,
    )
    expected_generation = GenerationRef(
        execution.scope.session_id,
        execution.scope.generation_id,
    )
    events: list[JournalEvent] = []
    for event in snapshot.events:
        if event.attempt.generation != expected_generation:
            raise PupuContextHostBindingError(
                "bound journal returned a foreign generation"
            )
        if _is_compiler_owned_context_build_audit(event):
            continue
        events.append(event)
    return tuple(events)


def _latest_input_receipt(
    events: Sequence[JournalEvent],
) -> JournalEvent | None:
    return next(
        (
            event
            for event in reversed(events)
            if event.event_type in {"message.user", "tool_result"}
        ),
        None,
    )


def _canonical_user_message(event: JournalEvent) -> dict[str, Any]:
    message = event.payload.get("message")
    if (
        event.event_type != "message.user"
        or not isinstance(message, Mapping)
        or str(message.get("role") or "").strip() != "user"
        or "content" not in message
    ):
        raise PupuContextHostBindingError(
            "current input receipt has no canonical user message"
        )
    return dict(message)


def _pending_tool_result(event: JournalEvent) -> dict[str, Any]:
    payload = event.payload
    raw_ref = payload.get("full_output_ref")
    if not isinstance(raw_ref, Mapping):
        raw_ref = (
            raw_ref.to_dict()
            if callable(getattr(raw_ref, "to_dict", None))
            else None
        )
    result = payload.get("result")
    result = result if isinstance(result, Mapping) else {}
    return {
        "event_id": event.event_id,
        "store_seq": event.store_seq,
        "type": "tool_result",
        "preview": str(payload.get("preview") or result.get("preview") or ""),
        "preview_truncated": bool(payload.get("preview_truncated")),
        "content_ref": raw_ref,
        "content_bytes": payload.get("result_bytes"),
        "content_sha256": payload.get("result_sha256"),
    }


def _exact_source_message_cursors(
    source_messages: Sequence[Mapping[str, Any]],
    events: Sequence[JournalEvent],
) -> tuple[SourceMessageCursor, ...]:
    """Bind only byte-equivalent journal message payloads, in journal order.

    Sparse cursors are intentional.  Unchain can retain unbound mandatory
    messages, while pressure that would omit an unproven message fails closed
    instead of fabricating provenance.
    """

    candidates: list[tuple[Mapping[str, Any], JournalEvent]] = []
    for event in events:
        if event.event_type not in {"message.user", "message.assistant"}:
            continue
        raw_message = event.payload.get("message")
        if not isinstance(raw_message, Mapping):
            continue
        expected_role = event.event_type.split(".", 1)[1]
        if str(raw_message.get("role") or "").strip() != expected_role:
            continue
        candidates.append((raw_message, event))

    selected: list[SourceMessageCursor] = []
    candidate_index = 0
    for message_index, message in enumerate(source_messages):
        if str(message.get("role") or "").strip() in {"system", "developer"}:
            continue
        matching_indexes = [
            next_index
            for next_index in range(candidate_index, len(candidates))
            if dict(candidates[next_index][0]) == dict(message)
        ]
        if len(matching_indexes) != 1:
            continue
        next_index = matching_indexes[0]
        event = candidates[next_index][1]
        selected.append(
            SourceMessageCursor(
                message_index=message_index,
                event_id=event.event_id,
                store_seq=event.store_seq,
            )
        )
        candidate_index = next_index + 1
    return tuple(selected)


def _canonical_sha256(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _decode_pupu_refs(event_type: str, value: Mapping[str, Any]) -> dict[str, Any]:
    """Translate only Unchain-declared semantic ref slots."""

    return normalize_semantic_refs_for_context(event_type, value)


class _PupuContextTaskStateReader(BoundContextTaskStateReader):
    def __init__(self, repository: PupuPinnedTaskStateRepository) -> None:
        if not isinstance(repository, PupuPinnedTaskStateRepository):
            raise TypeError("repository must be PupuPinnedTaskStateRepository")
        super().__init__(repository.binding_id)
        self._repository = repository

    def read_for_context(self) -> ContextTaskStateReadOutcome:
        return ContextTaskStateReadOutcome.from_state(self._repository.current())


class _PupuContextRequestFactory:
    def __init__(
        self,
        *,
        admission: object,
        execution: PupuExecutionCapabilities,
        task_state_reader: BoundContextTaskStateReader,
        durable_event_sink: DurableEventSink,
        provider_window_resolver: ProviderWindowResolver | None,
        fixed_overhead_estimator: FixedOverheadEstimator | None,
    ) -> None:
        self._admission = admission
        self._execution = execution
        self._task_state_reader = task_state_reader
        self._durable_event_sink = durable_event_sink
        self._provider_window_resolver = provider_window_resolver
        self._fixed_overhead_estimator = fixed_overhead_estimator

    @staticmethod
    def _current_user_message(
        source_messages: Sequence[Mapping[str, Any]],
    ) -> tuple[int, dict[str, Any]] | None:
        task_messages = tuple(
            (index, message)
            for index, message in enumerate(source_messages)
            if str(message.get("role") or "").strip().casefold()
            not in {"system", "developer"}
        )
        if not task_messages:
            return None
        message_index, message = task_messages[-1]
        if str(message.get("role") or "").strip().casefold() != "user":
            return None
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise PupuContextHostBindingError(
                "current Context V2 user input must be non-empty text"
            )
        return message_index, {"role": "user", "content": content}

    def _persist_current_user_message(
        self,
        *,
        message_index: int,
        message: Mapping[str, Any],
    ) -> JournalEvent:
        projector = self._durable_event_sink.projector
        project_user_message = getattr(projector, "project_user_message", None)
        if callable(project_user_message):
            draft = project_user_message(
                message,
                message_index=message_index,
            )
        else:
            scope = self._execution.scope
            identity = {
                "domain": "pupu.context.current_input.v1",
                "execution_id": scope.session_id,
                "generation_id": scope.generation_id,
                "attempt_id": scope.attempt_id,
                "message_index": message_index,
                "message": dict(message),
            }
            digest = _canonical_sha256(identity)
            draft = SemanticEventDraft(
                event_id=f"context-input-{digest}",
                event_type="message.user",
                attempt=AttemptRef(
                    GenerationRef(scope.session_id, scope.generation_id),
                    scope.attempt_id,
                ),
                operation_id=f"context-input.{digest}",
                payload={
                    "run_id": scope.attempt_id,
                    "message": dict(message),
                },
            )
        receipt = self._durable_event_sink.append_projected(draft)
        if receipt.event.event_type != "message.user":
            raise PupuContextHostBindingError(
                "current input append returned a different event type"
            )
        return receipt.event

    def _provider_and_model(self, context: Any) -> tuple[str, str]:
        provider_state = getattr(context.state, "provider_state", None)
        provider = str(
            getattr(provider_state, "provider", None)
            or getattr(self._admission, "provider", "")
            or ""
        ).strip().lower()
        model = str(
            getattr(provider_state, "model", None)
            or getattr(self._admission, "model", "")
            or ""
        ).strip()
        if not provider or not model:
            raise PupuContextHostBindingError(
                "provider and model are required for Context V2"
            )
        return provider, model

    def _context_window(self, context: Any, provider: str, model: str) -> int:
        provider_state = getattr(context.state, "provider_state", None)
        window = _positive_window(
            getattr(provider_state, "max_context_window_tokens", 0)
        )
        if window <= 0 and self._provider_window_resolver is not None:
            try:
                window = _positive_window(
                    self._provider_window_resolver(provider, model)
                )
            except Exception:
                window = 0
        if window <= 0:
            window = _positive_window(
                getattr(self._admission, "real_context_window_tokens", 0)
            )
        if window <= 0:
            raise PupuContextHostBindingError(
                "provider context window is unavailable"
            )
        return window

    def _budget(self, context: Any, provider: str, model: str):
        window = self._context_window(context, provider, model)
        admission_provider = str(
            getattr(self._admission, "provider", "") or ""
        ).strip().lower()
        admission_model = str(
            getattr(self._admission, "model", "") or ""
        ).strip()
        admission_window = _positive_window(
            getattr(self._admission, "real_context_window_tokens", 0)
        )
        same_snapshot = (
            provider == admission_provider
            and model == admission_model
            and window == admission_window
        )
        reserve = getattr(
            self._admission,
            "output_reserve_override_tokens",
            None,
        )
        margin = getattr(
            self._admission,
            "transport_margin_override_tokens",
            None,
        )
        if reserve is None and same_snapshot:
            reserve = getattr(self._admission, "output_reserve_tokens", None)
        if margin is None and same_snapshot:
            margin = getattr(self._admission, "transport_margin_tokens", None)
        return resolve_context_budget(
            context_window_tokens=window,
            output_reserve_tokens=reserve,
            transport_margin_tokens=margin,
        )

    def _fixed_overhead(self, context: Any) -> int:
        if self._fixed_overhead_estimator is None:
            return 0
        value = self._fixed_overhead_estimator(context)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise PupuContextHostBindingError(
                "fixed context overhead must be a non-negative integer"
            )
        return value

    def __call__(self, context: Any) -> ContextCompileRequest:
        scope = self._execution.require_current_attempt()
        host_messages = tuple(
            dict(message) for message in context.latest_messages()
        )
        journal_events = _read_generation_events(self._execution)
        latest_input = _latest_input_receipt(journal_events)
        current_user = self._current_user_message(host_messages)
        if current_user is not None:
            message_index, message = current_user
            same_current_receipt = (
                latest_input is not None
                and latest_input.attempt.attempt_id == scope.attempt_id
                and latest_input.event_type == "message.user"
                and _canonical_user_message(latest_input) == message
            )
            if not same_current_receipt:
                persisted = self._persist_current_user_message(
                    message_index=message_index,
                    message=message,
                )
                journal_events = _read_generation_events(self._execution)
                latest_input = next(
                    (
                        event
                        for event in reversed(journal_events)
                        if event.event_id == persisted.event_id
                    ),
                    None,
                )
        if (
            latest_input is None
            or latest_input.attempt.attempt_id != scope.attempt_id
        ):
            raise PupuContextHostBindingError(
                "current attempt has no durable input receipt"
            )

        source_messages_list = [
            message
            for message in host_messages
            if str(message.get("role") or "").strip().casefold()
            in {"system", "developer"}
        ]
        source_message_cursors: tuple[SourceMessageCursor, ...] = ()
        pending_task_inputs = None
        if latest_input.event_type == "message.user":
            source_messages_list.append(_canonical_user_message(latest_input))
            source_message_cursors = (
                SourceMessageCursor(
                    message_index=len(source_messages_list) - 1,
                    event_id=latest_input.event_id,
                    store_seq=latest_input.store_seq,
                ),
            )
        elif latest_input.event_type == "tool_result":
            pending_task_inputs = (_pending_tool_result(latest_input),)
        else:  # pragma: no cover - guarded by _latest_input_receipt
            raise PupuContextHostBindingError(
                "current attempt input receipt is unsupported"
            )
        source_messages = tuple(source_messages_list)
        semantic_events = tuple(
            _decode_pupu_refs(
                event.event_type,
                journal_event_to_semantic_event(event),
            )
            for event in journal_events
        )
        task_state_read = self._task_state_reader.read_for_context()
        task_state = task_state_read.state
        provider, model = self._provider_and_model(context)
        budget = self._budget(context, provider, model)
        fixed_overhead = self._fixed_overhead(context)
        event = context.event if isinstance(context.event, Mapping) else {}
        run_id = str(event.get("run_id") or scope.attempt_id).strip()
        iteration = getattr(context.state, "iteration", 0)
        identity_payload = {
            "execution_id": scope.session_id,
            "generation_id": scope.generation_id,
            "attempt_id": scope.attempt_id,
            "run_id": run_id,
            "execution_path": str(event.get("execution_path") or "normal"),
            "iteration": iteration,
            "provider": provider,
            "model": model,
            "budget": budget.to_dict(),
            "fixed_overhead_tokens": fixed_overhead,
            "source_messages": source_messages,
            "journal_tail": (
                {
                    "event_id": journal_events[-1].event_id,
                    "store_seq": journal_events[-1].store_seq,
                }
                if journal_events
                else None
            ),
            "task_state_read": {
                "capture_quality": task_state_read.capture_quality.value,
                "state_revision": task_state.revision if task_state else None,
                "unavailable": (
                    task_state_read.unavailable.to_dict()
                    if task_state_read.unavailable is not None
                    else None
                ),
            },
        }
        build_id = "ctxbuild-" + _canonical_sha256(identity_payload)
        return ContextCompileRequest(
            case="pupu-host-binding",
            source_messages=source_messages,
            current_generation=scope.generation_id,
            fixed_overhead_tokens=fixed_overhead,
            semantic_events=semantic_events,
            pending_task_inputs=pending_task_inputs,
            task_state=task_state.to_dict() if task_state is not None else None,
            task_state_unavailable=task_state_read.unavailable,
            capture_quality=task_state_read.capture_quality.value,
            budget=budget,
            source_message_cursors=source_message_cursors,
            provider=provider,
            model=model,
            build_id=build_id,
            execution_id=scope.session_id,
            generation_id=scope.generation_id,
            attempt_id=scope.attempt_id,
        )


@dataclass(frozen=True)
class PupuContextHostBinding:
    admission: object
    execution: PupuExecutionCapabilities
    reference_authorizer: PupuWorkspaceReferenceAuthorizer
    reference_policy: PupuContextReferencePolicy
    task_state_repository: PupuPinnedTaskStateRepository
    task_state_reader: BoundContextTaskStateReader
    event_projector: SemanticEventProjector
    durable_event_sink: DurableEventSink
    coordinator: ContextCompileCoordinator
    runtime: ContextRuntime
    module: ContextModule


def bind_pupu_context_module(
    *,
    admission: object,
    execution: PupuExecutionCapabilities,
    reference_authorizer: PupuWorkspaceReferenceAuthorizer,
    task_state_binding_id: str,
    event_projector: SemanticEventProjector,
    partial_attempt_sink: PartialAttemptSink,
    provider_window_resolver: ProviderWindowResolver | None = None,
    fixed_overhead_estimator: FixedOverheadEstimator | None = None,
    owner_id: str = _OWNER_ID,
) -> PupuContextHostBinding:
    """Construct one additive, scope-bound Unchain ContextModule.

    The returned module is not registered anywhere by this function.  PuPu's
    production assembly remains unchanged until the explicit cutover task.
    """

    if not isinstance(execution, PupuExecutionCapabilities):
        raise TypeError("execution must be PupuExecutionCapabilities")
    if type(reference_authorizer) is not PupuWorkspaceReferenceAuthorizer:
        raise TypeError(
            "reference_authorizer must be an exact "
            "PupuWorkspaceReferenceAuthorizer"
        )
    if not reference_authorizer.is_bound_to_execution(execution):
        raise PupuContextHostBindingError(
            "reference authorizer is not bound to the same execution"
        )
    if not callable(event_projector):
        raise TypeError("event_projector must be callable")
    if not callable(partial_attempt_sink):
        raise TypeError("partial_attempt_sink must be callable")
    if provider_window_resolver is not None and not callable(
        provider_window_resolver
    ):
        raise TypeError("provider_window_resolver must be callable")
    if fixed_overhead_estimator is not None and not callable(
        fixed_overhead_estimator
    ):
        raise TypeError("fixed_overhead_estimator must be callable")
    _validate_admission_scope(admission, execution)

    task_state_repository = PupuPinnedTaskStateRepository(
        execution,
        binding_id=task_state_binding_id,
    )
    task_state_reader = _PupuContextTaskStateReader(task_state_repository)
    attempt = AttemptRef(
        GenerationRef(
            execution.scope.session_id,
            execution.scope.generation_id,
        ),
        execution.scope.attempt_id,
    )

    def mark_partial(boundary: str, source: object, error: Exception) -> None:
        updater = getattr(admission, "update_diagnostics", None)
        if callable(updater):
            try:
                updater(
                    {
                        "journal_status": "partial",
                        "context_build_status": "partial",
                        "persistence_degraded": True,
                        "persistence_boundary": boundary,
                        "persistence_error_code": str(
                            getattr(error, "code", type(error).__name__)
                        )[:128],
                    }
                )
            except Exception:
                pass
        partial_attempt_sink(boundary, source, error)

    reference_policy = PupuContextReferencePolicy(
        execution=execution,
        authorizer=reference_authorizer,
        partial_attempt_sink=mark_partial,
    )
    execution.journal.bind_context_reference_policy(reference_policy)

    durable_event_sink = DurableEventSink(
        journal=execution.journal,
        attempt=attempt,
        projector=event_projector,
    )
    coordinator = ContextCompileCoordinator(
        journal=execution.journal,
        checkpoint_repository=execution.checkpoints,
        build_repository=execution.context_builds,
        partial_attempt_sink=lambda request, error: mark_partial(
            "context_build",
            request,
            error,
        ),
    )
    request_factory = _PupuContextRequestFactory(
        admission=admission,
        execution=execution,
        task_state_reader=task_state_reader,
        durable_event_sink=durable_event_sink,
        provider_window_resolver=provider_window_resolver,
        fixed_overhead_estimator=fixed_overhead_estimator,
    )
    runtime = ContextRuntime(
        owner_id=owner_id,
        request_factory=request_factory,
        durable_event_sink=durable_event_sink,
        partial_attempt_sink=lambda event, error: mark_partial(
            "journal",
            event,
            error,
        ),
        compiler=coordinator,
    )
    module = ContextModule(runtime=runtime)
    return PupuContextHostBinding(
        admission=admission,
        execution=execution,
        reference_authorizer=reference_authorizer,
        reference_policy=reference_policy,
        task_state_repository=task_state_repository,
        task_state_reader=task_state_reader,
        event_projector=event_projector,
        durable_event_sink=durable_event_sink,
        coordinator=coordinator,
        runtime=runtime,
        module=module,
    )


def prepare_pupu_unchain_ownership_attachment(**kwargs: Any):
    """Lazy PuPu seam for the default-closed Unchain ownership adapter."""

    from memory_v2_unchain_ownership_adapter import (
        prepare_pupu_unchain_ownership_attachment as prepare,
    )

    return prepare(**kwargs)


def list_pupu_unchain_ownership_lifecycles(**kwargs: Any):
    """Cold-read lifecycle bindings without importing them at server startup."""

    from memory_v2_unchain_ownership_adapter import (
        list_pupu_unchain_ownership_lifecycles as read,
    )

    return read(**kwargs)


def bootstrap_pupu_legacy_history_into_unchain(**kwargs: Any):
    """Lazy host hand-off to Unchain's transactional legacy bootstrap."""

    from memory_v2_unchain_bootstrap_adapter import (
        bootstrap_pupu_legacy_history_into_unchain as bootstrap,
    )

    return bootstrap(**kwargs)


def read_pupu_legacy_bootstrap_receipt(**kwargs: Any):
    """Cold-read the integrity-checked Unchain bootstrap receipt."""

    from memory_v2_unchain_bootstrap_adapter import (
        read_pupu_legacy_bootstrap_receipt as read,
    )

    return read(**kwargs)


def derive_pupu_legacy_source_revision(**kwargs: Any):
    """Derive an owner-bound revision for a sanitized legacy snapshot."""

    from memory_v2_unchain_bootstrap_adapter import (
        derive_pupu_legacy_source_revision as derive,
    )

    return derive(**kwargs)


__all__ = [
    "PupuContextHostBinding",
    "PupuContextHostBindingError",
    "bind_pupu_context_module",
    "bootstrap_pupu_legacy_history_into_unchain",
    "derive_pupu_legacy_source_revision",
    "list_pupu_unchain_ownership_lifecycles",
    "prepare_pupu_unchain_ownership_attachment",
    "read_pupu_legacy_bootstrap_receipt",
]
