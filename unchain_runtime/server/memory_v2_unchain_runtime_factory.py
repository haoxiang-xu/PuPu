"""PuPu host factory for the Unchain-owned Context/Memory V2 data plane.

This is an additive, default-closed production seam.  It builds the official
factory-mode ContextModule and attempt-scoped ContextExecutionBundle objects,
while keeping the Memory Agent host disabled until the separate rollout gate
is opened.  No PuPu legacy Context/Memory repository is used.
"""

from __future__ import annotations

import hashlib
import re
import threading
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2OwnershipAttachment,
    prepare_pupu_unchain_ownership_attachment,
)
from memory_v2_unchain_root_completion import (
    build_pupu_memory_v2_root_completion_resolver,
)
from memory_v2_unchain_worker import (
    PupuMemoryAgentWorkerModule,
    build_pupu_unchain_memory_agent_worker,
    build_pupu_unchain_memory_agent_worker_module,
)
from unchain.agent.modules import ContextModule, ContextShadowModule
from unchain.agent.modules.memory_v2 import MemoryV2AgentModule
from unchain.agent.modules.task_state_bootstrap import (
    PinnedTaskStateBootstrapModule,
)
from unchain.context import (
    ArtifactService,
    BoundContextTaskStateReader,
    ContextCompileCoordinator,
    ContextExecutionBundle,
    ContextInputIngress,
    ContextRuntime,
    ContextTaskStateReadOutcome,
    DurableContextRuntimeFactory,
    DurableHandoffRecorder,
    DurableToolBoundary,
    HandoffService,
    HostResolvedCurrentInput,
    HostResolvedInteractionInput,
    JournalContextRequestFactory,
)
from unchain.context.task_state_bootstrap import (
    PinnedTaskStateBootstrapBinding,
)
from unchain.context.task_state_runtime import TaskStateContextRuntime
from unchain.context.host_adapter import HostHandoffReceipt
from unchain.context.projector import (
    CanonicalSemanticEventProjector,
    SemanticEventProjectionMode,
    ShadowObservedToolEventAdapter,
)
from unchain.journal import (
    AttemptRef,
    DurableEventSink,
    EventRange,
    ResourceRef,
)
from unchain.journal.models import _required_text
from unchain.kernel.harness import HarnessContext
from unchain.memory.curator.host import (
    MemoryAgentHostAdapter,
    MemoryAgentHostConfig,
    MemoryAgentModelInvoker,
)
from unchain.memory.toolkit.models import MemoryToolContentPage, ReferencePurpose
from unchain.memory.workspace import (
    MemorySpace,
    MemoryWorkspaceService,
    TaskStateService,
    WorkspaceWriteDraft,
)
from unchain.memory.workspace.ports import (
    BoundWorkspaceReferenceAuthorizer,
    RepositoryNotFoundError,
    RepositoryScopeError,
)
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
from unchain.persistence.sqlite_memory_host_v2 import (
    SQLiteConsolidationCapabilityFactory,
    SQLiteMemoryV2AgentAttachmentFactory,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_read_v2 import (
    BoundSQLiteContextV2ReadService,
    ContextV2ReadScope,
    SQLiteContextV2ReadError,
    SQLiteContextV2ReadScopeError,
    SQLiteContextV2ReadService,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.subagents.types import SubagentResult
from unchain.tools.runtime import ToolRuntimeOutcome


_ARTIFACT_URI = re.compile(
    r"^pupu://artifact/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_MEMORY_URI = re.compile(
    r"^pupu://memory/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_CANDIDATE_URI = re.compile(
    r"^pupu://memory/candidate/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_REVIEW_URI = re.compile(
    r"^pupu://memory/review/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})/"
    r"([A-Za-z0-9][A-Za-z0-9._:-]{0,511})@([1-9][0-9]*)$"
)
_EVENT_URI = re.compile(
    r"^pupu://context/event/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})" r"(?:/(content))?$"
)
_CHECKPOINT_URI = re.compile(
    r"^pupu://context/checkpoint/([A-Za-z0-9][A-Za-z0-9._:-]{0,511})"
    r"(?:/event/([1-9][0-9]*))?$"
)


class PupuUnchainHostFactoryError(RuntimeError):
    """The server could not prepare an exact Unchain-owned host graph."""


def _stable_id(prefix: str, owner_chat_id: str) -> str:
    digest = hashlib.sha256(owner_chat_id.encode("utf-8")).hexdigest()
    return f"{prefix}-{digest[:40]}"


def _assert_chat_active(*, database_path: Path, owner_chat_id: str) -> None:
    """Read the deletion tombstone before any store constructor may write."""

    try:
        deleted = is_chat_deleted(
            database_path=database_path,
            owner_chat_id=owner_chat_id,
        )
    except ChatDeletionError as error:
        raise PupuUnchainHostFactoryError(
            "chat deletion state is unavailable; host preparation failed closed"
        ) from error
    if deleted:
        raise PupuUnchainHostFactoryError(
            "durably deleted chat cannot create an Unchain host"
        )


class _PupuUnchainReferenceCodec:
    """Product URI presentation over provider-neutral ResourceRef values."""

    def __init__(self, binding_id: str) -> None:
        self.binding_id = _required_text(
            binding_id,
            "binding_id",
            maximum=512,
            identifier=True,
        )

    def encode(self, ref: ResourceRef) -> str:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind == "artifact" and not ref.fragment:
            return f"pupu://artifact/{ref.resource_id}@{ref.revision}"
        if ref.kind == "memory" and ref.fragment:
            return f"pupu://memory/{ref.fragment}/{ref.resource_id}@{ref.revision}"
        if ref.kind == "context_event" and ref.revision == 1:
            suffix = "/content" if ref.fragment == "content" else ""
            if ref.fragment in {"", "content"}:
                return f"pupu://context/event/{ref.resource_id}{suffix}"
        if ref.kind == "checkpoint" and ref.revision == 1:
            suffix = f"/{ref.fragment}" if ref.fragment else ""
            if not ref.fragment or re.fullmatch(r"event/[1-9][0-9]*", ref.fragment):
                return f"pupu://context/checkpoint/{ref.resource_id}{suffix}"
        if ref.kind == "memory_candidate" and not ref.fragment:
            return f"pupu://memory/candidate/{ref.resource_id}@{ref.revision}"
        if ref.kind == "memory_review" and ref.fragment:
            return (
                f"pupu://memory/review/{ref.fragment}/"
                f"{ref.resource_id}@{ref.revision}"
            )
        raise ValueError("reference cannot be represented as a PuPu URI")

    def decode(self, value: str, *, purpose: ReferencePurpose) -> ResourceRef:
        del purpose
        if not isinstance(value, str) or value != value.strip() or "%" in value:
            raise ValueError("PuPu reference is not canonical")
        match = _ARTIFACT_URI.fullmatch(value)
        if match is not None:
            return ResourceRef("artifact", match.group(1), int(match.group(2)))
        match = _CANDIDATE_URI.fullmatch(value)
        if match is not None:
            return ResourceRef(
                "memory_candidate",
                match.group(1),
                int(match.group(2)),
            )
        match = _REVIEW_URI.fullmatch(value)
        if match is not None:
            return ResourceRef(
                "memory_review",
                match.group(2),
                int(match.group(3)),
                match.group(1),
            )
        match = _MEMORY_URI.fullmatch(value)
        if match is not None:
            return ResourceRef(
                "memory",
                match.group(2),
                int(match.group(3)),
                match.group(1),
            )
        match = _EVENT_URI.fullmatch(value)
        if match is not None:
            return ResourceRef(
                "context_event",
                match.group(1),
                1,
                match.group(2) or "",
            )
        match = _CHECKPOINT_URI.fullmatch(value)
        if match is not None:
            fragment = f"event/{match.group(2)}" if match.group(2) else ""
            return ResourceRef("checkpoint", match.group(1), 1, fragment)
        raise ValueError("PuPu reference is invalid or unsupported")


class _PupuUnchainWorkspaceReferences(BoundWorkspaceReferenceAuthorizer):
    """Authorize workspace provenance against one durable chat lineage."""

    def __init__(
        self,
        *,
        binding_id: str,
        workspace_repository: Any,
        chat_space_id: str,
        context_reader_resolver: Callable[[], BoundSQLiteContextV2ReadService],
    ) -> None:
        super().__init__(binding_id)
        self._workspace_repository = workspace_repository
        self._chat_space_id = chat_space_id
        if not callable(context_reader_resolver):
            raise TypeError("context_reader_resolver must be callable")
        self._context_reader_resolver = context_reader_resolver

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if not isinstance(ref, ResourceRef):
            raise TypeError("ref must be a ResourceRef")
        if ref.kind == "memory":
            if ref.fragment != self._chat_space_id:
                raise RepositoryScopeError("memory ref is outside the chat workspace")
            entry = self._workspace_repository.read_entry(ref=ref)
            if entry.entry_id != ref.resource_id or entry.revision != ref.revision:
                raise RepositoryScopeError("memory ref resolved divergently")
            return ref
        if ref.kind not in {"artifact", "checkpoint", "context_event"}:
            raise RepositoryScopeError("reference kind is outside the chat lineage")
        try:
            authorized = self._context_reader_resolver().authorize_context_ref(
                ref=ref
            )
        except (SQLiteContextV2ReadError, ValueError, TypeError) as error:
            raise RepositoryNotFoundError(
                "durable context reference is unavailable"
            ) from error
        if authorized != ref:
            raise RepositoryNotFoundError(
                "durable context reference is outside the chat lineage"
            )
        return ref


class _PupuUnchainContextCapability:
    """Default-closed context capability used by the Memory V2 attachment."""

    def __init__(
        self,
        *,
        binding_id: str,
        context_reader_resolver: Callable[[], BoundSQLiteContextV2ReadService],
    ) -> None:
        self.binding_id = _required_text(
            binding_id,
            "binding_id",
            maximum=512,
            identifier=True,
        )
        if not callable(context_reader_resolver):
            raise TypeError("context_reader_resolver must be callable")
        self._context_reader_resolver = context_reader_resolver

    def _reader(self) -> BoundSQLiteContextV2ReadService:
        reader = self._context_reader_resolver()
        if not isinstance(reader, BoundSQLiteContextV2ReadService):
            raise PupuUnchainHostFactoryError(
                "Context V2 reader resolver returned an invalid capability"
            )
        return reader

    def authorize(self, *, ref: ResourceRef, purpose: ReferencePurpose) -> ResourceRef:
        del purpose
        return self._reader().authorize_context_ref(ref=ref)

    def read_content(
        self,
        *,
        ref: ResourceRef,
        offset: int,
        limit: int,
    ) -> MemoryToolContentPage:
        return self._reader().read_content(
            ref=ref,
            offset=offset,
            limit=limit,
        )

    def read_checkpoint_events(
        self,
        *,
        ref: ResourceRef,
        after_position: int,
        limit: int,
    ) -> Mapping[str, Any]:
        return self._reader().read_checkpoint_events(
            ref=ref,
            after_position=after_position,
            limit=limit,
        )


class _PupuUnchainTaskStateReader(BoundContextTaskStateReader):
    """Compiler-facing view of the exact chat-bound task-state service."""

    def __init__(self, *, binding_id: str, service: TaskStateService) -> None:
        super().__init__(binding_id)
        if not isinstance(service, TaskStateService):
            raise TypeError("service must be a TaskStateService")
        if service.binding_id != self.binding_id:
            raise PupuUnchainHostFactoryError(
                "task-state reader and service have different bindings"
            )
        self._service = service

    def read_for_context(self) -> ContextTaskStateReadOutcome:
        return ContextTaskStateReadOutcome.from_state(self._service.get())


@dataclass(frozen=True, slots=True)
class PupuUnchainAttemptRuntime:
    """One attempt-scoped bundle plus its durable ownership attachment."""

    bundle: ContextExecutionBundle
    bound_context_module: ContextModule
    ownership: PupuUnchainMemoryV2OwnershipAttachment

    def __post_init__(self) -> None:
        if type(self.bundle) is not ContextExecutionBundle:
            raise TypeError("bundle must be an official ContextExecutionBundle")
        if type(self.bound_context_module) is not ContextModule:
            raise TypeError("bound_context_module must be an official ContextModule")
        if not isinstance(
            self.ownership,
            PupuUnchainMemoryV2OwnershipAttachment,
        ):
            raise TypeError("ownership must be a PuPu Unchain ownership attachment")

    def persist_tool_outcome_then_notify(
        self,
        outcome: ToolRuntimeOutcome,
        *,
        operation_id: object,
        notify: Callable[[Any], Any],
    ) -> Any:
        if not callable(notify):
            raise TypeError("notify must be callable")
        artifactization = self.ownership.artifact_handoff.persist_tool_outcome(
            outcome,
            operation_id=operation_id,
        )
        return notify(artifactization)

    def record_subagent_result_then_notify(
        self,
        result: SubagentResult,
        *,
        child_attempt: AttemptRef,
        source_event_range: EventRange,
        artifact_refs: Sequence[ResourceRef] = (),
        operation_id: object,
        notify: Callable[[HostHandoffReceipt], Any],
    ) -> Any:
        if not callable(notify):
            raise TypeError("notify must be callable")
        receipt = self.ownership.artifact_handoff.record_subagent_result(
            result,
            child_attempt=child_attempt,
            source_event_range=source_event_range,
            artifact_refs=artifact_refs,
            operation_id=operation_id,
        )
        return notify(receipt)


class PupuUnchainContextMemoryV2HostFactory:
    """Build official Unchain-owned bundles for one server-bound PuPu chat."""

    def __init__(
        self,
        *,
        owner_chat_id: str,
        root_run_id: str,
        database_path: str | Path,
        object_directory: str | Path,
        generation_resolver: Callable[..., str],
        current_input_resolver: Callable[..., Any],
        artifact_sanitizer: Callable[[bytes, str], bytes],
        event_payload_sanitizer: Callable[[str, Mapping[str, Any]], Mapping[str, Any]],
        model_window_fallback: Callable[[str, str], int],
        partial_attempt_sink: Callable[[object, Exception], None],
        projection_mode: SemanticEventProjectionMode = (
            SemanticEventProjectionMode.CANONICAL
        ),
        production_enabled: bool = False,
        memory_agent_enabled: bool = False,
        memory_agent_model_invoker: MemoryAgentModelInvoker | None = None,
        memory_agent_model_invoker_factory: Callable[[Any], MemoryAgentModelInvoker]
        | None = None,
        workspace_content_redactor: Callable[[WorkspaceWriteDraft], WorkspaceWriteDraft]
        | None = None,
        user_message_artifact_sanitizer: Callable[[bytes, str], bytes]
        | None = None,
    ) -> None:
        self.owner_chat_id = _required_text(
            owner_chat_id,
            "owner_chat_id",
            maximum=512,
            identifier=True,
        )
        self.root_run_id = _required_text(
            root_run_id,
            "root_run_id",
            maximum=512,
            identifier=True,
        )
        self.database_path = Path(database_path).expanduser().resolve()
        self.object_directory = Path(object_directory).expanduser().resolve()
        if self.database_path.name != "context_v2.sqlite3":
            raise PupuUnchainHostFactoryError(
                "host database must be context_v2.sqlite3"
            )
        expected_objects = self.database_path.parent / "objects"
        if self.object_directory != expected_objects:
            raise PupuUnchainHostFactoryError(
                "host objects must use the shared memory_v2/objects directory"
            )
        for label, callback in (
            ("generation_resolver", generation_resolver),
            ("current_input_resolver", current_input_resolver),
            ("artifact_sanitizer", artifact_sanitizer),
            ("event_payload_sanitizer", event_payload_sanitizer),
            ("model_window_fallback", model_window_fallback),
            ("partial_attempt_sink", partial_attempt_sink),
        ):
            if not callable(callback):
                raise TypeError(f"{label} must be callable")
        if workspace_content_redactor is not None and not callable(
            workspace_content_redactor
        ):
            raise TypeError("workspace_content_redactor must be callable")
        if user_message_artifact_sanitizer is not None and not callable(
            user_message_artifact_sanitizer
        ):
            raise TypeError("user_message_artifact_sanitizer must be callable")
        if not isinstance(projection_mode, SemanticEventProjectionMode):
            raise TypeError("projection_mode must be a SemanticEventProjectionMode")
        if type(production_enabled) is not bool:
            raise TypeError("production_enabled must be an exact boolean")
        if type(memory_agent_enabled) is not bool:
            raise TypeError("memory_agent_enabled must be an exact boolean")
        if memory_agent_model_invoker is not None and not callable(
            getattr(memory_agent_model_invoker, "run", None)
        ):
            raise TypeError(
                "memory_agent_model_invoker must provide run(request, toolkit, binding)"
            )
        if memory_agent_model_invoker_factory is not None and not callable(
            memory_agent_model_invoker_factory
        ):
            raise TypeError("memory_agent_model_invoker_factory must be callable")
        if (
            memory_agent_model_invoker is not None
            and memory_agent_model_invoker_factory is not None
        ):
            raise PupuUnchainHostFactoryError(
                "Memory Agent invoker and invoker factory are mutually exclusive"
            )
        if memory_agent_enabled and not production_enabled:
            raise PupuUnchainHostFactoryError(
                "Memory V2 Agent toolkit requires the Context V2 production gate"
            )
        if memory_agent_enabled and all(
            value is None
            for value in (
                memory_agent_model_invoker,
                memory_agent_model_invoker_factory,
            )
        ):
            raise PupuUnchainHostFactoryError(
                "enabled Memory V2 Agent toolkit requires an official "
                "memory_agent_model_invoker"
            )

        _assert_chat_active(
            database_path=self.database_path,
            owner_chat_id=self.owner_chat_id,
        )
        admission = admit_context_v2_store_owner(
            root_dir=self.database_path.parent,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if admission.database_path.resolve() != self.database_path:
            raise PupuUnchainHostFactoryError(
                "single-store admission returned a different database"
            )

        self.binding_id = _stable_id("binding-chat", self.owner_chat_id)
        self.chat_space_id = _stable_id("space-chat", self.owner_chat_id)
        self._artifact_sanitizer = artifact_sanitizer
        self._user_message_artifact_sanitizer = (
            artifact_sanitizer
            if user_message_artifact_sanitizer is None
            else user_message_artifact_sanitizer
        )
        self._event_payload_sanitizer = event_payload_sanitizer
        self._model_window_fallback = model_window_fallback
        self._partial_attempt_sink = partial_attempt_sink
        self._current_input_resolver = current_input_resolver
        self.projection_mode = projection_mode
        self._production_enabled = production_enabled
        self._memory_agent_enabled = memory_agent_enabled
        self._attempt_lock = threading.RLock()
        self._attempts: dict[tuple[str, str], PupuUnchainAttemptRuntime] = {}

        self.context_store = SQLiteContextV2Store(
            database_path=self.database_path,
            object_directory=self.object_directory,
        )
        self.compiler_store = SQLiteContextCompilerV2Store(
            context_store=self.context_store,
        )
        self.memory_store = SQLiteMemoryV2Store(
            database_path=self.database_path,
            object_directory=self.object_directory,
        )
        self.context_read_service = SQLiteContextV2ReadService(
            context_store=self.context_store,
            memory_store=self.memory_store,
            compiler_store=self.compiler_store,
        )
        space = MemorySpace(
            space_id=self.chat_space_id,
            namespace="chat",
            name="Chat memory",
            description="PuPu chat Memory V2 workspace",
            revision=1,
        )
        workspace_repository = self.memory_store.bind_workspace(
            space=space,
            owner_chat_id=self.owner_chat_id,
        )
        self.references = _PupuUnchainWorkspaceReferences(
            binding_id=self.binding_id,
            workspace_repository=workspace_repository,
            chat_space_id=self.chat_space_id,
            context_reader_resolver=self._bound_context_reader,
        )
        self.workspace = MemoryWorkspaceService(
            repository=workspace_repository,
            mutations=workspace_repository,
            content=workspace_repository,
            history=workspace_repository,
            links=workspace_repository,
            references=self.references,
            content_redactor=workspace_content_redactor,
        )
        self.task_state_repository = self.memory_store.bind_task_state(
            binding_id=self.binding_id,
        )
        self.task_state = TaskStateService(
            repository=self.task_state_repository,
            references=self.references,
        )
        self.task_state_reader = _PupuUnchainTaskStateReader(
            binding_id=self.binding_id,
            service=self.task_state,
        )
        self.reference_codec = _PupuUnchainReferenceCodec(self.binding_id)
        if memory_agent_model_invoker_factory is not None:
            try:
                memory_agent_model_invoker = memory_agent_model_invoker_factory(
                    self.reference_codec
                )
            except Exception as error:
                raise PupuUnchainHostFactoryError(
                    "Memory Agent invoker factory failed closed"
                ) from error
            if not callable(getattr(memory_agent_model_invoker, "run", None)):
                raise PupuUnchainHostFactoryError(
                    "Memory Agent invoker factory returned an invalid invoker"
                )
        self.context_capability = _PupuUnchainContextCapability(
            binding_id=self.binding_id,
            context_reader_resolver=self._bound_context_reader,
        )
        self.curator_store = SQLiteCuratorV2Store(
            database_path=self.database_path,
            object_directory=self.object_directory,
        )
        self.curation_repository = self.curator_store.bind_curation(
            binding_id=self.binding_id,
            owner_chat_id=self.owner_chat_id,
            target_space_id=self.chat_space_id,
        )
        self.consolidation_factory = SQLiteConsolidationCapabilityFactory(
            binding_id=self.binding_id,
            database_path=self.database_path,
            repository=self.curation_repository,
            workspace=self.workspace,
            references=self.reference_codec,
            context=self.context_capability,
        )
        self.normal_attachment_factory = SQLiteMemoryV2AgentAttachmentFactory(
            binding_id=self.binding_id,
            repository=self.curation_repository,
            workspace=self.workspace,
            references=self.reference_codec,
            context=self.context_capability,
            completion_factory_resolver=(
                build_pupu_memory_v2_root_completion_resolver(
                    capture_journal=self._capture_root_completion_journal,
                )
            ),
        )
        self.memory_host = MemoryAgentHostAdapter(
            self.curation_repository,
            capability_factory=self.consolidation_factory,
            model_invoker=memory_agent_model_invoker,
            config=MemoryAgentHostConfig(enabled=memory_agent_enabled),
        )
        self.memory_module = MemoryV2AgentModule(
            host=self.memory_host,
            attachment_factory=self.normal_attachment_factory,
        )
        self.memory_worker = build_pupu_unchain_memory_agent_worker(
            self.memory_host
        )
        self.memory_worker_module = build_pupu_unchain_memory_agent_worker_module(
            memory_module=self.memory_module,
            worker=self.memory_worker,
            owner_chat_id=self.owner_chat_id,
        )

        execution_factory = DurableContextRuntimeFactory(
            bundle_builder=self._build_bundle,
            generation_resolver=generation_resolver,
            current_input_resolver=current_input_resolver,
            projection_mode=self.projection_mode,
        )
        context_runtime = (
            TaskStateContextRuntime.from_factory(
                owner_id=_stable_id("pupu-context-v2", self.owner_chat_id),
                execution_factory=execution_factory,
                task_state_reader_resolver=self._resolve_task_state_reader,
            )
            if self.production_enabled
            and self.projection_mode is SemanticEventProjectionMode.CANONICAL
            else ContextRuntime.from_factory(
                owner_id=_stable_id("pupu-context-v2", self.owner_chat_id),
                execution_factory=execution_factory,
            )
        )
        self.context_module = ContextModule(
            runtime=context_runtime
        )
        self.task_state_bootstrap_module = (
            PinnedTaskStateBootstrapModule(
                runtime=context_runtime,
                binding_resolver=self.resolve_pinned_task_state_bootstrap,
            )
            if isinstance(context_runtime, TaskStateContextRuntime)
            else None
        )

    @property
    def production_enabled(self) -> bool:
        return self._production_enabled

    @property
    def memory_agent_enabled(self) -> bool:
        return self._memory_agent_enabled

    def modules_for_active(
        self,
    ) -> tuple[
        ContextModule
        | PinnedTaskStateBootstrapModule
        | MemoryV2AgentModule
        | PupuMemoryAgentWorkerModule,
        ...,
    ]:
        """Return active official modules behind independent explicit gates."""

        if not self.production_enabled:
            raise PupuUnchainHostFactoryError(
                "Context V2 production gate is closed"
            )
        if self.projection_mode is not SemanticEventProjectionMode.CANONICAL:
            raise PupuUnchainHostFactoryError(
                "active Context V2 requires canonical projection mode"
            )
        if self.task_state_bootstrap_module is None:
            raise PupuUnchainHostFactoryError(
                "active Context V2 requires Pinned Task State bootstrap"
            )
        modules: list[
            ContextModule
            | PinnedTaskStateBootstrapModule
            | MemoryV2AgentModule
            | PupuMemoryAgentWorkerModule
        ] = [
            self.context_module,
            self.task_state_bootstrap_module,
        ]
        if self.memory_agent_enabled:
            modules.extend((self.memory_module, self.memory_worker_module))
        return tuple(modules)

    def modules_for_shadow(self) -> tuple[ContextShadowModule]:
        """Return the official observer-only module for PuPu shadow runs."""

        return (
            ContextShadowModule(
                runtime=self.context_module.runtime,
                enabled=True,
            ),
        )

    def _resolve_task_state_reader(
        self,
        bundle: ContextExecutionBundle,
    ) -> BoundContextTaskStateReader:
        if type(bundle) is not ContextExecutionBundle:
            raise TypeError("bundle must be an official ContextExecutionBundle")
        key = (
            bundle.attempt.generation.execution_id,
            bundle.attempt.attempt_id,
        )
        with self._attempt_lock:
            prepared = self._attempts.get(key)
        if prepared is None or prepared.bundle is not bundle:
            raise PupuUnchainHostFactoryError(
                "task-state reader requires the exact bound attempt"
            )
        return self.task_state_reader

    def resolve_pinned_task_state_bootstrap(
        self,
        context: HarnessContext,
    ) -> PinnedTaskStateBootstrapBinding:
        """Bind first-task bootstrap to the input just persisted by Context V2."""

        if not isinstance(context, HarnessContext):
            raise TypeError("context must be a HarnessContext")
        execution_id = str(
            context.state.session_state.session_id or ""
        ).strip()
        attempt_id = str(context.event.get("run_id") or "").strip()
        prepared = self.attempt(
            execution_id=execution_id,
            attempt_id=attempt_id,
        )
        current_input = self._current_input_resolver(
            context,
            prepared.bundle.attempt,
        )
        if isinstance(current_input, HostResolvedInteractionInput):
            return PinnedTaskStateBootstrapBinding(
                task_state=self.task_state,
                objective="",
                current_input_event_ref_resolver=lambda: (_ for _ in ()).throw(
                    PupuUnchainHostFactoryError(
                        "interaction resume has no task-state bootstrap source"
                    )
                ),
                input_kind="interaction_resume",
            )
        if current_input is None:
            return PinnedTaskStateBootstrapBinding(
                task_state=self.task_state,
                objective="",
                current_input_event_ref_resolver=lambda: (_ for _ in ()).throw(
                    PupuUnchainHostFactoryError(
                        "attempt has no task-state bootstrap source"
                    )
                ),
                input_kind="interaction_resume",
            )
        if not isinstance(current_input, HostResolvedCurrentInput):
            raise PupuUnchainHostFactoryError(
                "task-state bootstrap input has an unsupported type"
            )

        def current_input_event_ref() -> ResourceRef:
            candidates = tuple(
                event
                for event in prepared.bundle.journal.capture_snapshot().events
                if event.attempt == prepared.bundle.attempt
                and event.event_type == "message.user"
            )
            if not candidates:
                raise PupuUnchainHostFactoryError(
                    "current input event was not durably persisted"
                )
            event = candidates[-1]
            return ResourceRef("context_event", event.event_id, 1)

        objective = current_input.content
        if not objective.strip() and current_input.attachments:
            objective = "Process the attached user input."
        return PinnedTaskStateBootstrapBinding(
            task_state=self.task_state,
            objective=objective,
            current_input_event_ref_resolver=current_input_event_ref,
            input_kind="user_message",
        )

    def _bound_context_reader(self) -> BoundSQLiteContextV2ReadService:
        with self._attempt_lock:
            execution_ids = tuple(
                sorted({execution_id for execution_id, _ in self._attempts})
            )
        if not execution_ids:
            raise PupuUnchainHostFactoryError(
                "Context V2 read capability requires a bound execution"
            )
        try:
            return self.context_read_service.bind(
                ContextV2ReadScope(
                    owner_chat_id=self.owner_chat_id,
                    execution_ids=execution_ids,
                    space_id=self.chat_space_id,
                )
            )
        except (SQLiteContextV2ReadError, SQLiteContextV2ReadScopeError) as error:
            raise PupuUnchainHostFactoryError(
                "Context V2 read capability is unavailable"
            ) from error

    def _capture_root_completion_journal(self, request):
        session_id = str(getattr(request, "session_id", "") or "").strip()
        attempt_id = str(getattr(request, "attempt_id", "") or "").strip()
        run_id = str(getattr(request, "run_id", "") or "").strip()
        if not session_id or not attempt_id or run_id != attempt_id:
            return None
        with self._attempt_lock:
            prepared = self._attempts.get((session_id, attempt_id))
        if prepared is None:
            return None
        attempt = prepared.bundle.attempt
        if (
            attempt.generation.execution_id != session_id
            or attempt.attempt_id != attempt_id
        ):
            return None
        return prepared.bundle.journal.capture_snapshot()

    def _build_bundle(self, attempt: AttemptRef) -> ContextExecutionBundle:
        _assert_chat_active(
            database_path=self.database_path,
            owner_chat_id=self.owner_chat_id,
        )
        execution_id = attempt.generation.execution_id
        journal = self.context_store.bind_execution(execution_id)
        artifacts = ArtifactService(
            journal,
            sanitizer=self._artifact_sanitizer,
            user_message_sanitizer=self._user_message_artifact_sanitizer,
        )
        compiler_capabilities = self.compiler_store.bind_execution(
            execution_id,
            artifacts=artifacts,
        )
        observed_tool_adapter = (
            ShadowObservedToolEventAdapter(
                attempt=attempt,
                journal=journal,
                artifacts=artifacts,
                payload_sanitizer=self._event_payload_sanitizer,
            )
            if self.projection_mode
            is SemanticEventProjectionMode.SHADOW_OBSERVED
            else None
        )
        projector = CanonicalSemanticEventProjector(
            attempt=attempt,
            artifacts=artifacts,
            payload_sanitizer=self._event_payload_sanitizer,
            observed_tool_adapter=observed_tool_adapter,
        )
        sink = DurableEventSink(journal, attempt, projector)
        coordinator = ContextCompileCoordinator(
            journal=journal,
            checkpoint_repository=compiler_capabilities.checkpoints,
            build_repository=compiler_capabilities.context_builds,
            partial_attempt_sink=self._partial_attempt_sink,
        )
        handoffs = HandoffService(artifacts)
        request_factory = JournalContextRequestFactory(
            attempt=attempt,
            journal=journal,
            model_window_fallback=self._model_window_fallback,
        )
        bundle = ContextExecutionBundle(
            attempt=attempt,
            journal=journal,
            projector=projector,
            durable_event_sink=sink,
            coordinator=coordinator,
            artifacts=artifacts,
            handoffs=handoffs,
            ingress=ContextInputIngress(
                attempt=attempt,
                projector=projector,
                sink=sink,
            ),
            request_factory=request_factory,
            tool_boundary=DurableToolBoundary(
                attempt=attempt,
                projector=projector,
                sink=sink,
            ),
            handoff_recorder=DurableHandoffRecorder(
                attempt=attempt,
                handoffs=handoffs,
                projector=projector,
                sink=sink,
            ),
            partial_attempt_sink=self._partial_attempt_sink,
        )
        bound_context_module = ContextModule(
            runtime=ContextRuntime(
                owner_id=_stable_id("pupu-context-v2-bound", attempt.attempt_id),
                request_factory=request_factory,
                durable_event_sink=sink,
                partial_attempt_sink=self._partial_attempt_sink,
                compiler=coordinator,
            )
        )
        operation_id = (
            "ownership-bind-"
            + hashlib.sha256(
                (
                    self.owner_chat_id
                    + "\0"
                    + execution_id
                    + "\0"
                    + attempt.generation.generation_id
                    + "\0"
                    + attempt.attempt_id
                ).encode("utf-8")
            ).hexdigest()
        )
        ownership = prepare_pupu_unchain_ownership_attachment(
            owner_chat_id=self.owner_chat_id,
            execution_id=execution_id,
            generation_id=attempt.generation.generation_id,
            attempt_id=attempt.attempt_id,
            root_run_id=self.root_run_id,
            binding_id=self.binding_id,
            chat_space_id=self.chat_space_id,
            operation_id=operation_id,
            expected_revision=0,
            database_path=self.database_path,
            context_module=bound_context_module,
            event_projector=projector,
            handoff_recorder=bundle.handoff_recorder,
            curation_repository=self.curation_repository,
            workspace=self.workspace,
            references=self.reference_codec,
            context=self.context_capability,
        )
        prepared = PupuUnchainAttemptRuntime(
            bundle=bundle,
            bound_context_module=bound_context_module,
            ownership=ownership,
        )
        key = (execution_id, attempt.attempt_id)
        with self._attempt_lock:
            previous = self._attempts.get(key)
            if previous is not None and previous.bundle.attempt != attempt:
                raise PupuUnchainHostFactoryError(
                    "attempt key changed its generation binding"
                )
            self._attempts[key] = previous or prepared
            return self._attempts[key].bundle

    def attempt(
        self,
        *,
        execution_id: str,
        attempt_id: str,
    ) -> PupuUnchainAttemptRuntime:
        execution = _required_text(
            execution_id,
            "execution_id",
            identifier=True,
        )
        attempt = _required_text(
            attempt_id,
            "attempt_id",
            identifier=True,
        )
        with self._attempt_lock:
            prepared = self._attempts.get((execution, attempt))
        if prepared is None:
            raise PupuUnchainHostFactoryError(
                "attempt has not completed Context V2 bootstrap binding"
            )
        return prepared


__all__ = [
    "PupuUnchainAttemptRuntime",
    "PupuUnchainContextMemoryV2HostFactory",
    "PupuUnchainHostFactoryError",
]
