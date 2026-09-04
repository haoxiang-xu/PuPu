"""Mount the canonical Unchain Context V2 owner for an active PuPu run.

The bridge exists only at the product-host boundary.  It resolves sanitized
current input and exact run identity before Agent construction, then exposes
the official ContextModule.  Runtime events and tool outcomes are persisted by
that module itself; unlike the shadow bridge, this adapter never mirrors
legacy callbacks into the journal.
"""

from __future__ import annotations

import copy
import os
import sqlite3
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    configured_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionError,
    validate_pupu_unchain_admission_row,
)
from memory_v2_unchain_atomic_bootstrap import (
    PupuUnchainAtomicBootstrap,
    prepare_pupu_unchain_atomic_bootstrap,
)
from memory_v2_unchain_host_event_boundary import (
    HOST_EVENT_LANE_SEMANTIC,
    PupuUnchainBoundHostEvent,
    PupuUnchainBoundInteractionResolution,
    PupuUnchainHostEventBoundaryError,
    validate_pupu_unchain_bound_host_event,
    validate_pupu_unchain_bound_interaction_resolution,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2TextInputDraft,
    PupuMemoryV2ShadowHostPreparation,
    _sanitize_artifact,
    _sanitize_event_payload,
    build_active_host_factory,
)
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from memory_v2_unchain_runtime_factory import PupuUnchainAttemptRuntime
from unchain.context import (
    ArtifactService,
    ContextInputIngress,
    HostResolvedInteractionInput,
)
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.journal import AttemptRef, DurableEventSink
from unchain.journal.models import _required_text
from unchain.persistence.sqlite_generation_lifecycle_v2 import (
    SQLiteHostGenerationLifecycleV2,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


class PupuUnchainActiveBridgeError(RuntimeError):
    """An active run could not bind the canonical Unchain context owner."""


def _cold_context_paths() -> tuple[Path, Path]:
    if configured_context_v2_store_owner() != STORE_OWNER_UNCHAIN:
        raise PupuUnchainActiveBridgeError(
            "cold interaction ingress requires the Unchain store owner"
        )
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise PupuUnchainActiveBridgeError(
            "cold interaction ingress requires UNCHAIN_DATA_DIR"
        )
    root_dir = Path(raw_data_dir).expanduser().resolve() / "memory_v2"
    return root_dir / "context_v2.sqlite3", root_dir / "objects"


def _cold_context_store() -> SQLiteContextV2Store:
    database_path, object_directory = _cold_context_paths()
    return SQLiteContextV2Store(
        database_path=database_path,
        object_directory=object_directory,
    )


def _read_existing_active_admission(owner_chat_id: str) -> dict[str, Any] | None:
    """Read PuPu-owned sticky metadata without initializing an absent store."""

    owner = _required_text(owner_chat_id, "owner_chat_id", identifier=True)
    database_path, _object_directory = _cold_context_paths()
    if not database_path.is_file():
        return None
    try:
        connection = sqlite3.connect(
            f"file:{database_path.as_posix()}?mode=ro",
            uri=True,
            timeout=5.0,
        )
        connection.row_factory = sqlite3.Row
        try:
            row = connection.execute(
                "SELECT * FROM pupu_context_v2_admissions WHERE owner_chat_id=?",
                (owner,),
            ).fetchone()
        finally:
            connection.close()
    except sqlite3.OperationalError as exc:
        if "no such table" in str(exc).casefold():
            return None
        raise PupuUnchainActiveBridgeError(
            "cold interaction admission metadata is unavailable"
        ) from exc
    if row is None:
        return None
    try:
        return validate_pupu_unchain_admission_row(
            row,
            owner_chat_id=owner,
            sticky=True,
        )
    except PupuUnchainAdmissionError as exc:
        raise PupuUnchainActiveBridgeError(
            "cold interaction admission metadata is corrupt"
        ) from exc


def _read_existing_active_session_admissions(
    session_id: str,
) -> tuple[dict[str, Any], ...]:
    """Read active rows for exact-session owner-conflict detection."""

    session = _required_text(session_id, "session_id", identifier=True)
    database_path, _object_directory = _cold_context_paths()
    if not database_path.is_file():
        return ()
    try:
        connection = sqlite3.connect(
            f"file:{database_path.as_posix()}?mode=ro",
            uri=True,
            timeout=5.0,
        )
        connection.row_factory = sqlite3.Row
        try:
            rows = tuple(
                connection.execute(
                    "SELECT * FROM pupu_context_v2_admissions "
                    "WHERE first_session_id=? AND effective_mode='active'",
                    (session,),
                ).fetchall()
            )
        finally:
            connection.close()
    except sqlite3.OperationalError as exc:
        if "no such table" in str(exc).casefold():
            return ()
        raise PupuUnchainActiveBridgeError(
            "cold interaction admission metadata is unavailable"
        ) from exc
    validated: list[dict[str, Any]] = []
    for row in rows:
        try:
            validated.append(
                validate_pupu_unchain_admission_row(
                    row,
                    owner_chat_id=str(row["owner_chat_id"]),
                    sticky=True,
                )
            )
        except PupuUnchainAdmissionError as exc:
            raise PupuUnchainActiveBridgeError(
                "cold interaction admission metadata is corrupt"
            ) from exc
    return tuple(validated)


def pupu_unchain_cold_active_admission(
    *,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
) -> bool:
    """Return whether one exact chat has a completed sticky active admission."""

    owner = _required_text(owner_chat_id, "owner_chat_id", identifier=True)
    session = _required_text(session_id, "session_id", identifier=True)
    execution = _required_text(execution_id, "execution_id", identifier=True)
    if session != execution:
        raise PupuUnchainActiveBridgeError(
            "cold interaction session must equal its Context execution"
        )
    admission = _read_existing_active_admission(owner)
    if admission is None or admission.get("effective_mode") != "active":
        session_active = _read_existing_active_session_admissions(session)
        if session_active:
            raise PupuUnchainActiveBridgeError(
                "sticky active admission belongs to a different chat owner"
            )
        return False
    if (
        admission.get("first_session_id") != session
        or admission.get("bootstrap_status") != "complete"
        or admission.get("v2_bootstrapped") is not True
    ):
        raise PupuUnchainActiveBridgeError(
            "sticky active admission is not completely bootstrapped"
        )
    from memory_v2_unchain_generation_api import (
        MemoryV2UnchainGenerationAPIError,
        open_pupu_unchain_generation_api,
    )

    database_path, _object_directory = _cold_context_paths()
    try:
        generation_api = open_pupu_unchain_generation_api(
            root_dir=database_path.parent,
            owner_chat_id=owner,
        )
    except MemoryV2UnchainGenerationAPIError as exc:
        raise PupuUnchainActiveBridgeError(
            "sticky active admission provenance is not canonical"
        ) from exc
    if (
        generation_api.owner_chat_id != owner
        or generation_api.session_id != session
        or generation_api.execution_id != execution
        or generation_api.get_session_head(
            owner_chat_id=owner,
            session_id=session,
        ).get("mutation_ready")
        is not True
    ):
        raise PupuUnchainActiveBridgeError(
            "sticky active admission does not match its generation scope"
        )
    return True


def pupu_unchain_cold_context_interaction_exists(
    *,
    session_id: str,
    execution_id: str,
    source_attempt_id: str,
) -> bool:
    """Detect exact canonical interaction ownership without guessing chat owner."""

    session = _required_text(session_id, "session_id", identifier=True)
    execution = _required_text(execution_id, "execution_id", identifier=True)
    source_attempt = _required_text(
        source_attempt_id,
        "source_attempt_id",
        identifier=True,
    )
    if session != execution:
        raise PupuUnchainActiveBridgeError(
            "cold interaction session must equal its Context execution"
        )
    database_path, _object_directory = _cold_context_paths()
    if not database_path.is_file():
        return False
    snapshot = _cold_context_store().bind_execution(execution).capture_snapshot()
    return any(
        event.event_type == "interaction.requested"
        and event.attempt.generation.execution_id == execution
        and event.attempt.attempt_id == source_attempt
        for event in snapshot.events
    )


def pupu_unchain_cold_context_request_exists(
    *,
    session_id: str,
    execution_id: str,
    source_attempt_id: str,
    interaction_id: str,
) -> bool:
    """Return whether one exact canonical request exists for cold repair."""

    session = _required_text(session_id, "session_id", identifier=True)
    execution = _required_text(execution_id, "execution_id", identifier=True)
    source_attempt = _required_text(
        source_attempt_id,
        "source_attempt_id",
        identifier=True,
    )
    interaction = _required_text(
        interaction_id,
        "interaction_id",
        identifier=True,
    )
    if session != execution:
        raise PupuUnchainActiveBridgeError(
            "cold interaction session must equal its Context execution"
        )
    database_path, _object_directory = _cold_context_paths()
    if not database_path.is_file():
        return False
    matches = tuple(
        event
        for event in _cold_context_store()
        .bind_execution(execution)
        .capture_snapshot()
        .events
        if event.event_type == "interaction.requested"
        and event.attempt.generation.execution_id == execution
        and event.attempt.attempt_id == source_attempt
        and str(event.payload.get("interaction_id") or "").strip()
        == interaction
    )
    if len(matches) > 1:
        raise PupuUnchainActiveBridgeError(
            "cold interaction request identity is ambiguous"
        )
    return bool(matches)


def persist_pupu_unchain_cold_interaction_resolution(
    *,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
    source_attempt_id: str,
    durable_receipt: Any,
) -> Any:
    """Project an already-applied durable response into its exact old attempt.

    This opens only official Context components.  It never starts or resumes
    the suspended agent and never mirrors a raw journal event.
    """

    from durable_interaction_host import DurableInteractionReceiptHandoff

    if not isinstance(durable_receipt, DurableInteractionReceiptHandoff):
        raise PupuUnchainActiveBridgeError(
            "cold interaction ingress requires a persisted receipt handoff"
        )
    owner = _required_text(owner_chat_id, "owner_chat_id", identifier=True)
    session = _required_text(session_id, "session_id", identifier=True)
    execution = _required_text(execution_id, "execution_id", identifier=True)
    source_attempt = _required_text(
        source_attempt_id,
        "source_attempt_id",
        identifier=True,
    )
    if session != execution or durable_receipt.session_id != session:
        raise PupuUnchainActiveBridgeError(
            "cold interaction receipt does not match its Context execution"
        )
    if not pupu_unchain_cold_active_admission(
        owner_chat_id=owner,
        session_id=session,
        execution_id=execution,
    ):
        raise PupuUnchainActiveBridgeError(
            "cold interaction ingress requires sticky active admission"
        )

    store = _cold_context_store()
    journal = store.bind_execution(execution)
    snapshot = journal.capture_snapshot()
    requests = tuple(
        event
        for event in snapshot.events
        if event.event_type == "interaction.requested"
        and event.attempt.generation.execution_id == execution
        and event.attempt.attempt_id == source_attempt
        and str(event.payload.get("interaction_id") or "").strip()
        == durable_receipt.interaction_id
    )
    if len(requests) != 1:
        raise PupuUnchainActiveBridgeError(
            "cold interaction has no unique canonical request"
        )
    request_event = requests[0]
    nested_request = request_event.payload.get("interaction_request")
    if (
        not isinstance(nested_request, Mapping)
        or str(nested_request.get("interaction_id") or "").strip()
        != durable_receipt.interaction_id
    ):
        raise PupuUnchainActiveBridgeError(
            "cold interaction request identity is corrupt"
        )
    attempt = request_event.attempt
    lifecycle = SQLiteHostGenerationLifecycleV2(store)
    attempt_binding = lifecycle.attempt_binding(
        owner_chat_id=owner,
        execution_id=execution,
        session_id=session,
        attempt_id=source_attempt,
    )
    generation = lifecycle.generation(
        owner_chat_id=owner,
        execution_id=execution,
        session_id=session,
        generation_id=attempt.generation.generation_id,
    )
    if (
        attempt_binding is None
        or generation is None
        or attempt_binding.generation_id != attempt.generation.generation_id
        or attempt_binding.attempt_id != attempt.attempt_id
        or attempt.generation.execution_id != execution
    ):
        raise PupuUnchainActiveBridgeError(
            "cold interaction attempt binding does not match canonical authority"
        )

    artifacts = ArtifactService(journal, sanitizer=_sanitize_artifact)
    projector = CanonicalSemanticEventProjector(
        attempt=AttemptRef(attempt.generation, attempt.attempt_id),
        artifacts=artifacts,
        payload_sanitizer=_sanitize_event_payload,
    )
    sink = DurableEventSink(journal, attempt, projector)
    ingress = ContextInputIngress(
        attempt=attempt,
        projector=projector,
        sink=sink,
    )
    result = ingress.persist(
        HostResolvedInteractionInput(
            attempt=attempt,
            interaction_id=durable_receipt.interaction_id,
            response=durable_receipt.response,
            submitted_by=durable_receipt.submitted_by,
        )
    )
    if (
        result.event.attempt != attempt
        or result.event.event_type != "interaction.resolved"
        or result.event.payload.get("interaction_id")
        != durable_receipt.interaction_id
    ):
        raise PupuUnchainActiveBridgeError(
            "cold interaction ingress returned a foreign resolution"
        )
    return result


@dataclass(frozen=True, slots=True)
class PupuUnchainActiveHostPreflight:
    """A fully constructed host scope that may authorize active admission."""

    preparation: PupuMemoryV2ShadowHostPreparation
    atomic_bootstrap: PupuUnchainAtomicBootstrap
    execution_id: str

    def __post_init__(self) -> None:
        if not isinstance(self.preparation, PupuMemoryV2ShadowHostPreparation):
            raise TypeError("preparation must be a PuPu Unchain host preparation")
        if not isinstance(self.atomic_bootstrap, PupuUnchainAtomicBootstrap):
            raise TypeError("atomic_bootstrap must be a verified bootstrap receipt")
        execution_id = _required_text(
            self.execution_id,
            "execution_id",
            identifier=True,
        )
        object.__setattr__(self, "execution_id", execution_id)
        if self.preparation.binding.execution_id != execution_id:
            raise ValueError("active preflight execution does not match its binding")
        binding = self.preparation.binding
        factory = self.preparation.host_factory
        bootstrap = self.atomic_bootstrap
        if (
            bootstrap.owner_chat_id != binding.owner_chat_id
            or bootstrap.session_id != binding.session_id
            or bootstrap.execution_id != binding.execution_id
            or bootstrap.database_path != factory.database_path
            or bootstrap.object_directory != factory.object_directory
            or binding.generation_id
            != bootstrap.current_head.current_generation_id
            or binding.head_revision != bootstrap.current_head.revision
        ):
            raise ValueError("active preflight does not match its atomic bootstrap")


@dataclass(frozen=True, slots=True)
class PupuUnchainActiveBridge:
    preparation: PupuMemoryV2ShadowHostPreparation
    execution_id: str

    def __post_init__(self) -> None:
        if not isinstance(self.preparation, PupuMemoryV2ShadowHostPreparation):
            raise TypeError("preparation must be a PuPu Unchain host preparation")
        object.__setattr__(
            self,
            "execution_id",
            _required_text(self.execution_id, "execution_id", identifier=True),
        )
        if self.preparation.binding.execution_id != self.execution_id:
            raise ValueError("active bridge execution does not match its root binding")

    @property
    def modules(self) -> tuple[Any, ...]:
        return self.preparation.host_factory.modules_for_active()

    def attempt_for_run(self, run_id: str) -> PupuUnchainAttemptRuntime:
        return self.preparation.host_factory.attempt(
            execution_id=self.execution_id,
            attempt_id=_required_text(run_id, "run_id", identifier=True),
        )

    def persist_bound_host_event(
        self,
        bound_event: PupuUnchainBoundHostEvent,
    ) -> None:
        """Persist one admitted PuPu semantic event under its exact attempt."""

        if not isinstance(bound_event, PupuUnchainBoundHostEvent):
            raise TypeError("bound_event must be a PuPu bound host event")
        if bound_event.lane != HOST_EVENT_LANE_SEMANTIC:
            raise PupuUnchainHostEventBoundaryError(
                "presentation host events must never enter the durable sink"
            )
        validate_pupu_unchain_bound_host_event(bound_event)
        authority = bound_event.authority
        if authority.execution_id != self.execution_id:
            raise PupuUnchainHostEventBoundaryError(
                "bound host event execution does not match active bridge"
            )
        event_run_id = _required_text(
            bound_event.event.get("run_id"),
            "bound_event.event.run_id",
            identifier=True,
        )
        if event_run_id != authority.attempt_id:
            raise PupuUnchainHostEventBoundaryError(
                "bound host event run does not match attempt authority"
            )
        self.preparation.host_factory.context_module.runtime.persist_event(
            copy.deepcopy(bound_event.event)
        )

    def persist_bound_interaction_resolution(
        self,
        resolution: PupuUnchainBoundInteractionResolution,
    ) -> Any:
        """Persist one live response through Context V2's official ingress."""

        if not isinstance(resolution, PupuUnchainBoundInteractionResolution):
            raise TypeError("resolution must be a bound interaction resolution")
        validate_pupu_unchain_bound_interaction_resolution(resolution)
        authority = resolution.authority
        if authority.execution_id != self.execution_id:
            raise PupuUnchainHostEventBoundaryError(
                "bound interaction execution does not match active bridge"
            )
        attempt_runtime = self.attempt_for_run(authority.attempt_id)
        result = attempt_runtime.bundle.ingress.persist(
            HostResolvedInteractionInput(
                attempt=attempt_runtime.bundle.attempt,
                interaction_id=authority.interaction_id,
                response=resolution.response,
                submitted_by=resolution.submitted_by,
            )
        )
        if (
            result.event.attempt != attempt_runtime.bundle.attempt
            or result.event.event_type != "interaction.resolved"
            or result.event.payload.get("interaction_id")
            != authority.interaction_id
        ):
            raise PupuUnchainHostEventBoundaryError(
                "Context V2 ingress returned a foreign interaction resolution"
            )
        return result


def preflight_pupu_unchain_active_host(
    *,
    owner_chat_id: str,
    run: PupuUnchainShadowRunDraft | None,
    bootstrap_history: Sequence[Mapping[str, Any]],
    no_unfinished_durable_checkpoint: bool,
    no_pending_interaction: bool,
    model_window_fallback: Callable[[str, str], int],
    partial_attempt_sink: Callable[[object, Exception], None],
    memory_agent_enabled: bool = False,
    memory_agent_model_invoker_factory: Any | None = None,
) -> PupuUnchainActiveHostPreflight | None:
    if run is None:
        return None
    if not isinstance(run, PupuUnchainShadowRunDraft):
        raise TypeError("run must be a PupuUnchainShadowRunDraft")
    if configured_context_v2_store_owner() != STORE_OWNER_UNCHAIN:
        raise PupuUnchainActiveBridgeError(
            "active Context V2 requires the Unchain store owner"
        )
    owner_chat_id = _required_text(
        owner_chat_id,
        "owner_chat_id",
        identifier=True,
    )
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise PupuUnchainActiveBridgeError(
            "Unchain-owned active storage requires UNCHAIN_DATA_DIR"
        )
    root_dir = Path(raw_data_dir).expanduser().resolve() / "memory_v2"
    atomic_bootstrap = prepare_pupu_unchain_atomic_bootstrap(
        root_dir=root_dir,
        owner_chat_id=owner_chat_id,
        session_id=run.session_id,
        execution_id=run.execution_id,
        history=bootstrap_history,
        no_unfinished_durable_checkpoint=(
            no_unfinished_durable_checkpoint
        ),
        no_pending_interaction=no_pending_interaction,
    )
    from durable_interaction_host import (
        reconcile_cancelled_interactions_before_active_run,
    )

    reconcile_cancelled_interactions_before_active_run(
        owner_chat_id=owner_chat_id,
        session_id=run.session_id,
    )
    current_input_draft = run.current_input_draft
    if run.attachment_blocks:
        if isinstance(current_input_draft, PupuMemoryV2InteractionInputDraft):
            raise PupuUnchainActiveBridgeError(
                "interaction input cannot also contain attachment blocks"
            )
        if (
            isinstance(current_input_draft, PupuMemoryV2TextInputDraft)
            and current_input_draft.attachments
        ):
            raise PupuUnchainActiveBridgeError(
                "active input attachments were already resolved"
            )
        from memory_v2_unchain_shadow_input import (
            persist_shadow_input_attachments,
        )

        resolved_attachments = persist_shadow_input_attachments(
            owner_chat_id=owner_chat_id,
            execution_id=run.execution_id,
            attachment_blocks=run.attachment_blocks,
            database_path=root_dir / "context_v2.sqlite3",
            object_directory=root_dir / "objects",
        )
        current_input_draft = PupuMemoryV2TextInputDraft(
            content=(
                current_input_draft.content
                if isinstance(current_input_draft, PupuMemoryV2TextInputDraft)
                else ""
            ),
            message_index=(
                current_input_draft.message_index
                if isinstance(current_input_draft, PupuMemoryV2TextInputDraft)
                else 0
            ),
            attachments=tuple(copy.deepcopy(resolved_attachments)),
        )
    preparation = build_active_host_factory(
        atomic_bootstrap=atomic_bootstrap,
        owner_chat_id=owner_chat_id,
        session_id=run.session_id,
        identity=run.identity,
        grant=run.grant,
        current_input_draft=current_input_draft,
        database_path=root_dir / "context_v2.sqlite3",
        object_directory=root_dir / "objects",
        model_window_fallback=model_window_fallback,
        partial_attempt_sink=partial_attempt_sink,
        memory_agent_enabled=memory_agent_enabled,
        memory_agent_model_invoker_factory=(
            memory_agent_model_invoker_factory
        ),
    )
    return PupuUnchainActiveHostPreflight(
        preparation=preparation,
        atomic_bootstrap=atomic_bootstrap,
        execution_id=run.execution_id,
    )


def bind_pupu_unchain_active_bridge(
    *,
    admission: Any,
    preflight: PupuUnchainActiveHostPreflight | None,
) -> PupuUnchainActiveBridge | None:
    if preflight is None or not bool(getattr(admission, "is_active", False)):
        return None
    if not isinstance(preflight, PupuUnchainActiveHostPreflight):
        raise TypeError("preflight must be a PupuUnchainActiveHostPreflight")
    binding = preflight.preparation.binding
    supplied_scope = (
        _required_text(
            getattr(admission, "owner_chat_id", None),
            "owner_chat_id",
            identifier=True,
        ),
        _required_text(
            getattr(admission, "session_id", None),
            "session_id",
            identifier=True,
        ),
        _required_text(
            getattr(admission, "attempt_id", None),
            "attempt_id",
            identifier=True,
        ),
    )
    expected_scope = (
        binding.owner_chat_id,
        binding.session_id,
        binding.attempt_id,
    )
    if supplied_scope != expected_scope:
        raise PupuUnchainActiveBridgeError(
            "active admission does not match the preflight host scope"
        )
    return PupuUnchainActiveBridge(
        preparation=preflight.preparation,
        execution_id=preflight.execution_id,
    )


def prepare_pupu_unchain_active_bridge(
    *,
    admission: Any,
    run: PupuUnchainShadowRunDraft | None,
    bootstrap_history: Sequence[Mapping[str, Any]],
    no_unfinished_durable_checkpoint: bool,
    no_pending_interaction: bool,
    model_window_fallback: Callable[[str, str], int],
    partial_attempt_sink: Callable[[object, Exception], None],
    memory_agent_enabled: bool = False,
    memory_agent_model_invoker_factory: Any | None = None,
) -> PupuUnchainActiveBridge | None:
    if run is None or not bool(getattr(admission, "is_active", False)):
        return None
    preflight = preflight_pupu_unchain_active_host(
        owner_chat_id=getattr(admission, "owner_chat_id", None),
        run=run,
        bootstrap_history=bootstrap_history,
        no_unfinished_durable_checkpoint=(
            no_unfinished_durable_checkpoint
        ),
        no_pending_interaction=no_pending_interaction,
        model_window_fallback=model_window_fallback,
        partial_attempt_sink=partial_attempt_sink,
        memory_agent_enabled=memory_agent_enabled,
        memory_agent_model_invoker_factory=(
            memory_agent_model_invoker_factory
        ),
    )
    return bind_pupu_unchain_active_bridge(
        admission=admission,
        preflight=preflight,
    )


__all__ = [
    "PupuUnchainActiveBridge",
    "PupuUnchainActiveBridgeError",
    "PupuUnchainActiveHostPreflight",
    "bind_pupu_unchain_active_bridge",
    "persist_pupu_unchain_cold_interaction_resolution",
    "preflight_pupu_unchain_active_host",
    "prepare_pupu_unchain_active_bridge",
    "pupu_unchain_cold_active_admission",
    "pupu_unchain_cold_context_interaction_exists",
    "pupu_unchain_cold_context_request_exists",
]
