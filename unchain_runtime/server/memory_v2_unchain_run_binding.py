"""Explicit PuPu run identity for the Unchain-owned Context/Memory V2 host.

The product host registers exact run identities before Unchain bootstrap.  The
registry persists every attempt against the host-authoritative current
generation and exposes resolvers that only consult that registration.  It
never derives identity or current input from mode, transcript, or provider
messages.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from memory_v2_sanitizer import (
    StorageTrust,
    sanitize_for_storage,
    sanitize_text,
    sanitize_value,
)
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_atomic_bootstrap import (
    PupuUnchainAtomicBootstrap,
    verify_pupu_unchain_atomic_bootstrap,
)
from memory_v2_unchain_runtime_factory import (
    PupuUnchainContextMemoryV2HostFactory,
)
from unchain.context import (
    HostResolvedAttachment,
    HostResolvedCurrentInput,
    HostResolvedInteractionInput,
    SemanticEventProjectionMode,
)
from unchain.context.attachments import normalize_host_resolved_attachments
from unchain.journal import AttemptRef
from unchain.journal.models import (
    ModelValidationError,
    _freeze_json,
    _required_text,
    _thaw_json,
)
from unchain.kernel.harness import HarnessContext
from unchain.memory.curator.host import MemoryAgentModelInvoker
from unchain.memory import MEMORY_EXECUTION_COMPLETE, MEMORY_V2_MODULE_KEY
from unchain.memory.workspace import WorkspaceWriteDraft
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_generation_lifecycle_v2 import (
    HostGenerationAttemptBindingIntent,
    HostGenerationAttemptBindingRequest,
    HostGenerationConflict,
    HostGenerationTransition,
    HostGenerationTransitionKind,
    HostGenerationTransitionRequest,
    SQLiteHostGenerationLifecycleV2,
    build_host_generation_attempt_binding_operation,
    build_host_generation_transition_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.runtime import ExecutionIdentity, ModuleGrant


class PupuMemoryV2RunBindingError(RuntimeError):
    """PuPu could not prove one exact durable Memory V2 run binding."""


def _identifier(value: object, field_name: str) -> str:
    return _required_text(value, field_name, identifier=True)


def _optional_identifier(value: object, field_name: str) -> str:
    if value in (None, ""):
        return ""
    return _identifier(value, field_name)


def _positive_revision(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("head_revision must be a positive integer")
    return value


def _canonical_json(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuMemoryV2RunBindingError(
            "run binding payload is not canonical JSON"
        ) from error


def _stable_id(prefix: str, payload: Mapping[str, Any]) -> str:
    return f"{prefix}-{hashlib.sha256(_canonical_json(payload)).hexdigest()}"


@dataclass(frozen=True, slots=True)
class PupuMemoryV2TextInputDraft:
    """Host-selected text input for one exact root attempt."""

    content: str
    message_index: int = 0
    attachments: tuple[HostResolvedAttachment, ...] = ()

    def __post_init__(self) -> None:
        attachments = normalize_host_resolved_attachments(self.attachments)
        object.__setattr__(self, "attachments", attachments)
        if not isinstance(self.content, str):
            raise TypeError("current user input content must be text")
        if not self.content.strip() and not attachments:
            raise ValueError(
                "current user input requires non-empty text or one attachment"
            )
        if (
            isinstance(self.message_index, bool)
            or not isinstance(self.message_index, int)
            or self.message_index < 0
        ):
            raise ValueError("message_index must be a non-negative integer")

    def canonical_value(self) -> dict[str, Any]:
        canonical = {
            "kind": "text",
            "content": self.content,
            "message_index": self.message_index,
        }
        if self.attachments:
            canonical["attachments"] = [
                attachment.to_dict() for attachment in self.attachments
            ]
        return canonical


@dataclass(frozen=True, slots=True)
class PupuMemoryV2InteractionInputDraft:
    """Host-selected interaction response for one exact root attempt."""

    interaction_id: str
    response: Any
    submitted_by: str = "user"

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "interaction_id",
            _identifier(self.interaction_id, "interaction_id"),
        )
        object.__setattr__(
            self,
            "submitted_by",
            _identifier(self.submitted_by, "submitted_by"),
        )
        object.__setattr__(
            self,
            "response",
            _freeze_json(self.response, path="interaction_response"),
        )

    def canonical_value(self) -> dict[str, Any]:
        return {
            "kind": "interaction",
            "interaction_id": self.interaction_id,
            "response": _thaw_json(self.response),
            "submitted_by": self.submitted_by,
        }


PupuMemoryV2CurrentInputDraft = (
    PupuMemoryV2TextInputDraft | PupuMemoryV2InteractionInputDraft
)


_SECRET_HANDLE_MARKER_RE = re.compile(
    r'<secret-handle label="(?P<label>[^"\r\n]{1,512})" '
    r'handle="(?P<handle>pvh1_[0-9a-f]{64})"/>'
)


def _sanitize_user_input_text(value: str) -> str:
    """Keep only canonical opaque handles while scrubbing all other text."""

    if not isinstance(value, str):
        raise TypeError("user input must be text")
    parts: list[str] = []
    cursor = 0
    for match in _SECRET_HANDLE_MARKER_RE.finditer(value):
        parts.append(sanitize_text(value[cursor : match.start()]))
        parts.append(
            '<secret-handle label="'
            + sanitize_text(match.group("label"))
            + '" handle="'
            + match.group("handle")
            + '"/>'
        )
        cursor = match.end()
    parts.append(sanitize_text(value[cursor:]))
    return "".join(parts)


def _sanitize_current_input_draft(
    draft: PupuMemoryV2CurrentInputDraft | None,
) -> PupuMemoryV2CurrentInputDraft | None:
    if draft is None:
        return None
    if isinstance(draft, PupuMemoryV2TextInputDraft):
        return PupuMemoryV2TextInputDraft(
            content=_sanitize_user_input_text(draft.content),
            message_index=draft.message_index,
            attachments=draft.attachments,
        )
    if isinstance(draft, PupuMemoryV2InteractionInputDraft):
        return PupuMemoryV2InteractionInputDraft(
            interaction_id=draft.interaction_id,
            response=sanitize_value(_thaw_json(draft.response)),
            submitted_by=draft.submitted_by,
        )
    raise TypeError("current_input_draft has an unsupported type")


@dataclass(frozen=True, slots=True)
class PupuMemoryV2RunBinding:
    """Immutable host identity for one generation-bound agent attempt."""

    owner_chat_id: str
    session_id: str
    generation_id: str
    head_revision: int
    identity: ExecutionIdentity
    grant: ModuleGrant
    current_input_draft: PupuMemoryV2CurrentInputDraft | None

    def __post_init__(self) -> None:
        for field_name in (
            "owner_chat_id",
            "session_id",
            "generation_id",
        ):
            object.__setattr__(
                self,
                field_name,
                _identifier(getattr(self, field_name), field_name),
            )
        object.__setattr__(
            self,
            "head_revision",
            _positive_revision(self.head_revision),
        )
        if not isinstance(self.identity, ExecutionIdentity):
            raise TypeError("identity must be an ExecutionIdentity")
        if not isinstance(self.grant, ModuleGrant):
            raise TypeError("grant must be a ModuleGrant")
        if self.grant.module_key != MEMORY_V2_MODULE_KEY:
            raise ValueError("grant belongs to another module")
        completion_authorized = self.grant.allows(
            MEMORY_EXECUTION_COMPLETE
        ) and bool(self.grant.authority)
        if (
            self.grant.allows(MEMORY_EXECUTION_COMPLETE)
            and not completion_authorized
        ):
            raise ValueError(
                "execution completion capability requires an authority"
            )
        if self.attempt_id != self.run_id:
            raise ValueError(
                "Context V2 attempt_id and kernel run_id must be identical"
            )
        if (
            self.parent_run_id is not None
            and self.current_input_draft is not None
            and not completion_authorized
        ):
            raise ValueError(
                "a nested run requires explicit authority to own current input"
            )
        if self.current_input_draft is not None and not isinstance(
            self.current_input_draft,
            (PupuMemoryV2TextInputDraft, PupuMemoryV2InteractionInputDraft),
        ):
            raise TypeError("current_input_draft has an unsupported type")

    @property
    def execution_id(self) -> str:
        return self.identity.execution_id

    @property
    def attempt_id(self) -> str:
        return self.identity.attempt_id

    @property
    def run_id(self) -> str:
        return self.identity.run_id

    @property
    def root_run_id(self) -> str:
        return self.identity.root_run_id

    @property
    def parent_run_id(self) -> str | None:
        return self.identity.parent_run_id

    @property
    def source_attempt_id(self) -> str:
        """Compatibility alias for callers migrating to ``parent_run_id``."""

        return self.parent_run_id or ""

    def canonical_value(self) -> dict[str, Any]:
        draft = self.current_input_draft
        return {
            "schema": "pupu.memory-v2-run-binding.v2",
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "generation_id": self.generation_id,
            "head_revision": self.head_revision,
            "identity": {
                "execution_id": self.execution_id,
                "attempt_id": self.attempt_id,
                "run_id": self.run_id,
                "root_run_id": self.root_run_id,
                "parent_run_id": self.parent_run_id,
                "run_lineage": list(self.identity.run_lineage),
            },
            "grant": {
                "module_key": self.grant.module_key,
                "capabilities": sorted(self.grant.capabilities),
                "delegable_capabilities": sorted(
                    self.grant.delegable_capabilities
                ),
                "authority": self.grant.authority,
            },
            "current_input_draft": (None if draft is None else draft.canonical_value()),
        }


def _legacy_canonical_values(
    binding: PupuMemoryV2RunBinding,
) -> tuple[dict[str, Any], ...]:
    """Reconstruct pre-V2 canonical values only to read durable old receipts."""

    draft = binding.current_input_draft
    common = {
        "owner_chat_id": binding.owner_chat_id,
        "execution_id": binding.execution_id,
        "session_id": binding.session_id,
        "generation_id": binding.generation_id,
        "head_revision": binding.head_revision,
        "attempt_id": binding.attempt_id,
        "run_id": binding.run_id,
        "root_run_id": binding.root_run_id,
        "source_attempt_id": binding.source_attempt_id,
        "current_input_draft": (
            None if draft is None else draft.canonical_value()
        ),
    }
    legacy_relationships = (
        ("root",)
        if binding.parent_run_id is None
        else ("subagent", "graph_step")
    )
    return tuple(
        {**common, "role": relationship}
        for relationship in legacy_relationships
    )


class PupuMemoryV2RunBindingRegistry:
    """Register exact attempts against one immutable current generation head."""

    def __init__(
        self,
        *,
        store: SQLiteContextV2Store,
        owner_chat_id: str,
        execution_id: str,
        session_id: str,
        root_run_id: str,
    ) -> None:
        if not isinstance(store, SQLiteContextV2Store):
            raise TypeError("store must be a SQLiteContextV2Store")
        self._store = store
        self.owner_chat_id = _identifier(owner_chat_id, "owner_chat_id")
        self.execution_id = _identifier(execution_id, "execution_id")
        self.session_id = _identifier(session_id, "session_id")
        self.root_run_id = _identifier(root_run_id, "root_run_id")
        self._lock = threading.RLock()
        self._bindings: dict[str, PupuMemoryV2RunBinding] = {}
        self._assert_not_deleted()
        self._lifecycle = SQLiteHostGenerationLifecycleV2(store)
        self._generation_id, self._head_revision = self._ensure_current_head()

    @property
    def generation_id(self) -> str:
        return self._generation_id

    @property
    def head_revision(self) -> int:
        return self._head_revision

    def _assert_not_deleted(self) -> None:
        try:
            deleted = is_chat_deleted(
                database_path=self._store.database_path,
                owner_chat_id=self.owner_chat_id,
            )
        except ChatDeletionError as error:
            raise PupuMemoryV2RunBindingError(
                "chat deletion state is unavailable; run binding failed closed"
            ) from error
        if deleted:
            raise PupuMemoryV2RunBindingError(
                "durably deleted chat cannot create or bind a generation"
            )

    def _ensure_current_head(self) -> tuple[str, int]:
        self._assert_not_deleted()
        try:
            head = self._lifecycle.current(
                owner_chat_id=self.owner_chat_id,
                execution_id=self.execution_id,
                session_id=self.session_id,
            )
            if head is None:
                generation_id = _stable_id(
                    "generation",
                    {
                        "schema": "pupu.memory-v2-initial-generation.v1",
                        "owner_chat_id": self.owner_chat_id,
                        "execution_id": self.execution_id,
                        "session_id": self.session_id,
                    },
                )
                transition = HostGenerationTransition(
                    owner_chat_id=self.owner_chat_id,
                    execution_id=self.execution_id,
                    session_id=self.session_id,
                    generation_id=generation_id,
                    kind=HostGenerationTransitionKind.INITIAL,
                    previous_generation_id="",
                    expected_revision=0,
                )
                operation_id = _stable_id(
                    "initial-generation",
                    transition.to_dict(),
                )
                request = HostGenerationTransitionRequest(
                    transition=transition,
                    operation=build_host_generation_transition_operation(
                        operation_id=operation_id,
                        transition=transition,
                    ),
                )
                self._assert_not_deleted()
                head = self._lifecycle.advance(request).head
            return head.current_generation_id, head.revision
        except HostGenerationConflict as error:
            raise PupuMemoryV2RunBindingError(
                "current generation identity conflicts with durable state"
            ) from error

    def _require_registry_scope(
        self,
        *,
        owner_chat_id: str,
        execution_id: str,
        session_id: str,
        root_run_id: str,
    ) -> None:
        supplied = (
            _identifier(owner_chat_id, "owner_chat_id"),
            _identifier(execution_id, "execution_id"),
            _identifier(session_id, "session_id"),
            _identifier(root_run_id, "root_run_id"),
        )
        expected = (
            self.owner_chat_id,
            self.execution_id,
            self.session_id,
            self.root_run_id,
        )
        if supplied != expected:
            raise PupuMemoryV2RunBindingError(
                "run registration is outside the bound chat/root scope"
            )

    def _verify_current_head(self) -> None:
        self._assert_not_deleted()
        try:
            head = self._lifecycle.current(
                owner_chat_id=self.owner_chat_id,
                execution_id=self.execution_id,
                session_id=self.session_id,
            )
        except HostGenerationConflict as error:
            raise PupuMemoryV2RunBindingError(
                "current generation scope conflicts with durable state"
            ) from error
        if head is None or (
            head.current_generation_id,
            head.revision,
        ) != (self._generation_id, self._head_revision):
            raise PupuMemoryV2RunBindingError(
                "registered attempt no longer names the current generation"
            )

    @staticmethod
    def _attempt_operation_id(binding: PupuMemoryV2RunBinding) -> str:
        return _stable_id("bind-current-attempt", binding.canonical_value())

    @staticmethod
    def _legacy_attempt_operation_ids(
        binding: PupuMemoryV2RunBinding,
    ) -> frozenset[str]:
        return frozenset(
            _stable_id("bind-current-attempt", value)
            for value in _legacy_canonical_values(binding)
        )

    def _ensure_durable_binding(
        self,
        binding: PupuMemoryV2RunBinding,
    ) -> None:
        self._verify_current_head()
        operation_id = self._attempt_operation_id(binding)
        readable_operation_ids = {
            operation_id,
            *self._legacy_attempt_operation_ids(binding),
        }
        try:
            existing = self._lifecycle.attempt_binding(
                owner_chat_id=binding.owner_chat_id,
                execution_id=binding.execution_id,
                session_id=binding.session_id,
                attempt_id=binding.attempt_id,
            )
            if existing is not None:
                if (
                    existing.generation_id != binding.generation_id
                    or existing.head_revision != binding.head_revision
                    or existing.operation.operation_id
                    not in readable_operation_ids
                ):
                    raise PupuMemoryV2RunBindingError(
                        "attempt registration identity drifted from durable state"
                    )
                return
            intent = HostGenerationAttemptBindingIntent(
                owner_chat_id=binding.owner_chat_id,
                execution_id=binding.execution_id,
                session_id=binding.session_id,
                generation_id=binding.generation_id,
                attempt_id=binding.attempt_id,
                expected_revision=binding.head_revision,
            )
            request = HostGenerationAttemptBindingRequest(
                intent=intent,
                operation=build_host_generation_attempt_binding_operation(
                    operation_id=operation_id,
                    intent=intent,
                ),
            )
            self._assert_not_deleted()
            receipt = self._lifecycle.bind_current_attempt(request)
            persisted = receipt.binding
            if (
                persisted.generation_id != binding.generation_id
                or persisted.head_revision != binding.head_revision
                or persisted.operation.operation_id != operation_id
            ):
                raise PupuMemoryV2RunBindingError(
                    "durable attempt receipt changed the registered identity"
                )
        except PupuMemoryV2RunBindingError:
            raise
        except HostGenerationConflict as error:
            raise PupuMemoryV2RunBindingError(
                "attempt registration identity conflicts with durable state"
            ) from error

    def _ensure_generation_only_binding(self, attempt_id: str) -> None:
        """Bind an unregistered bootstrap attempt without inventing run role."""

        self._verify_current_head()
        attempt = _identifier(attempt_id, "attempt_id")
        intent = HostGenerationAttemptBindingIntent(
            owner_chat_id=self.owner_chat_id,
            execution_id=self.execution_id,
            session_id=self.session_id,
            generation_id=self._generation_id,
            attempt_id=attempt,
            expected_revision=self._head_revision,
        )
        operation_id = _stable_id(
            "bind-current-attempt",
            {
                "schema": "pupu.memory-v2-generation-only-binding.v1",
                **intent.to_dict(),
            },
        )
        try:
            existing = self._lifecycle.attempt_binding(
                owner_chat_id=self.owner_chat_id,
                execution_id=self.execution_id,
                session_id=self.session_id,
                attempt_id=attempt,
            )
            if existing is not None:
                if (
                    existing.generation_id != self._generation_id
                    or existing.head_revision != self._head_revision
                ):
                    raise PupuMemoryV2RunBindingError(
                        "bootstrap attempt no longer names the current generation"
                    )
                return
            request = HostGenerationAttemptBindingRequest(
                intent=intent,
                operation=build_host_generation_attempt_binding_operation(
                    operation_id=operation_id,
                    intent=intent,
                ),
            )
            self._assert_not_deleted()
            receipt = self._lifecycle.bind_current_attempt(request)
            if (
                receipt.binding.generation_id != self._generation_id
                or receipt.binding.head_revision != self._head_revision
            ):
                raise PupuMemoryV2RunBindingError(
                    "bootstrap attempt receipt changed the current generation"
                )
        except PupuMemoryV2RunBindingError:
            raise
        except HostGenerationConflict as error:
            raise PupuMemoryV2RunBindingError(
                "bootstrap attempt conflicts with durable generation state"
            ) from error

    def register_attempt(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        identity: ExecutionIdentity,
        grant: ModuleGrant,
        current_input_draft: PupuMemoryV2CurrentInputDraft | None,
    ) -> PupuMemoryV2RunBinding:
        """Register and durably bind one explicitly identified attempt."""

        if not isinstance(identity, ExecutionIdentity):
            raise TypeError("identity must be an ExecutionIdentity")
        self._require_registry_scope(
            owner_chat_id=owner_chat_id,
            execution_id=identity.execution_id,
            session_id=session_id,
            root_run_id=identity.root_run_id,
        )
        candidate = PupuMemoryV2RunBinding(
            owner_chat_id=self.owner_chat_id,
            session_id=self.session_id,
            generation_id=self._generation_id,
            head_revision=self._head_revision,
            identity=identity,
            grant=grant,
            current_input_draft=_sanitize_current_input_draft(current_input_draft),
        )
        with self._lock:
            previous = self._bindings.get(candidate.attempt_id)
            if previous is not None and previous != candidate:
                raise PupuMemoryV2RunBindingError(
                    "attempt registration identity drifted in this process"
                )
            self._ensure_durable_binding(candidate)
            self._bindings[candidate.attempt_id] = previous or candidate
            return self._bindings[candidate.attempt_id]

    def generation_resolver(
        self,
        context: HarnessContext,
        execution_id: str,
    ) -> str:
        """Resolve only an exact registered bootstrap run after durable bind."""

        if not isinstance(context, HarnessContext):
            raise TypeError("context must be a HarnessContext")
        if context.phase != "bootstrap":
            raise PupuMemoryV2RunBindingError(
                "generation resolution is only valid during bootstrap"
            )
        resolved_execution = _identifier(execution_id, "execution_id")
        run_id = _identifier(context.event.get("run_id"), "run_id")
        with self._lock:
            binding = self._bindings.get(run_id)
            if binding is None:
                if resolved_execution != self.execution_id:
                    raise PupuMemoryV2RunBindingError(
                        "bootstrap execution is outside the bound chat scope"
                    )
                self._ensure_generation_only_binding(run_id)
                return self._generation_id
            if binding.execution_id != resolved_execution:
                raise PupuMemoryV2RunBindingError(
                    "bootstrap execution changed the registered run identity"
                )
            self._ensure_durable_binding(binding)
            return binding.generation_id

    def current_input_resolver(
        self,
        context: HarnessContext,
        attempt: AttemptRef,
    ) -> HostResolvedCurrentInput | HostResolvedInteractionInput | None:
        """Return current input only for the exact registered root attempt."""

        if not isinstance(context, HarnessContext):
            raise TypeError("context must be a HarnessContext")
        if not isinstance(attempt, AttemptRef):
            attempt = AttemptRef.from_dict(attempt)
        with self._lock:
            binding = self._bindings.get(attempt.attempt_id)
            if binding is None:
                return None
            event_run_id = _identifier(context.event.get("run_id"), "run_id")
            if event_run_id != binding.run_id:
                raise PupuMemoryV2RunBindingError(
                    "current input context changed the registered run identity"
                )
            if (
                attempt.generation.execution_id != binding.execution_id
                or attempt.generation.generation_id != binding.generation_id
            ):
                raise PupuMemoryV2RunBindingError(
                    "current input attempt changed the registered generation"
                )
            self._ensure_durable_binding(binding)
            if (
                binding.parent_run_id is not None
                and not (
                    binding.grant.allows(MEMORY_EXECUTION_COMPLETE)
                    and binding.grant.authority
                )
            ):
                return None
            draft = binding.current_input_draft
            if draft is None:
                return None
            if isinstance(draft, PupuMemoryV2TextInputDraft):
                return HostResolvedCurrentInput(
                    attempt=attempt,
                    content=draft.content,
                    message_index=draft.message_index,
                    attachments=draft.attachments,
                )
            return HostResolvedInteractionInput(
                attempt=attempt,
                interaction_id=draft.interaction_id,
                response=_thaw_json(draft.response),
                submitted_by=draft.submitted_by,
            )


@dataclass(frozen=True, slots=True)
class PupuMemoryV2ShadowHostPreparation:
    """Prepared observer-only Unchain host plus its exact root binding."""

    host_factory: PupuUnchainContextMemoryV2HostFactory
    binding: PupuMemoryV2RunBinding
    registry: PupuMemoryV2RunBindingRegistry


def _sanitize_artifact(content: bytes, media_type: str) -> bytes:
    return sanitize_for_storage(
        content,
        declared_mime=media_type,
        trust=StorageTrust.JOURNAL,
    ).data


def _sanitize_user_message_artifact(content: bytes, media_type: str) -> bytes:
    normalized_media_type = str(media_type or "").split(";", 1)[0].strip().casefold()
    if normalized_media_type != "application/json":
        return _sanitize_artifact(content, media_type)
    try:
        value = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _sanitize_artifact(content, media_type)
    if (
        not isinstance(value, Mapping)
        or set(value) not in (
            {"role", "content"},
            {"role", "content", "attachments"},
        )
        or value.get("role") != "user"
        or not isinstance(value.get("content"), str)
    ):
        return _sanitize_artifact(content, media_type)
    sanitized = sanitize_value(value)
    if not isinstance(sanitized, Mapping):
        raise ModelValidationError(
            "sanitized user-message artifact must remain an object"
        )
    canonical = dict(sanitized)
    canonical["content"] = _sanitize_user_input_text(value["content"])
    return _canonical_json(canonical)


def _sanitize_event_payload(
    event_type: str,
    payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    sanitized = sanitize_value(payload)
    if not isinstance(sanitized, Mapping):
        raise ModelValidationError("sanitized event payload must remain an object")
    if event_type != "message.user":
        return sanitized
    raw_message = payload.get("message")
    sanitized_message = sanitized.get("message")
    if (
        not isinstance(raw_message, Mapping)
        or raw_message.get("role") != "user"
        or not isinstance(raw_message.get("content"), str)
        or not isinstance(sanitized_message, Mapping)
    ):
        return sanitized
    result = dict(sanitized)
    result_message = dict(sanitized_message)
    result_message["content"] = _sanitize_user_input_text(raw_message["content"])
    result["message"] = result_message
    return result


def _sanitize_workspace_draft(draft: WorkspaceWriteDraft) -> WorkspaceWriteDraft:
    if not isinstance(draft, WorkspaceWriteDraft):
        raise TypeError("draft must be a WorkspaceWriteDraft")
    content = draft.content
    return WorkspaceWriteDraft(
        path=draft.path,
        description=sanitize_text(draft.description),
        kind=draft.kind,
        content=(
            None
            if content is None
            else sanitize_for_storage(
                content,
                declared_mime=draft.media_type,
                trust=StorageTrust.JOURNAL,
            ).data
        ),
        media_type=draft.media_type,
        link_url=sanitize_text(draft.link_url),
        tags=tuple(sanitize_text(tag) for tag in draft.tags),
    )


def build_shadow_host_factory(
    *,
    owner_chat_id: str,
    session_id: str,
    identity: ExecutionIdentity,
    grant: ModuleGrant,
    current_input_draft: PupuMemoryV2CurrentInputDraft | None,
    database_path: str | Path,
    object_directory: str | Path,
    model_window_fallback,
    partial_attempt_sink,
    _projection_mode: SemanticEventProjectionMode = (
        SemanticEventProjectionMode.SHADOW_OBSERVED
    ),
    _production_enabled: bool = False,
    _memory_agent_enabled: bool = False,
    _memory_agent_model_invoker: MemoryAgentModelInvoker | None = None,
    _memory_agent_model_invoker_factory: Any | None = None,
) -> PupuMemoryV2ShadowHostPreparation:
    """Prepare the official shadow host without consulting Legacy memory."""

    owner = _identifier(owner_chat_id, "owner_chat_id")
    if not isinstance(identity, ExecutionIdentity):
        raise TypeError("identity must be an ExecutionIdentity")
    if not isinstance(grant, ModuleGrant):
        raise TypeError("grant must be a ModuleGrant")
    database = Path(database_path).expanduser().resolve()
    objects = Path(object_directory).expanduser().resolve()
    if database.name != "context_v2.sqlite3":
        raise ValueError("database_path must end with context_v2.sqlite3")
    if objects != database.parent / "objects":
        raise ValueError("object_directory must be the sibling objects directory")
    if not callable(model_window_fallback):
        raise TypeError("model_window_fallback must be callable")
    if not callable(partial_attempt_sink):
        raise TypeError("partial_attempt_sink must be callable")
    if not isinstance(_projection_mode, SemanticEventProjectionMode):
        raise TypeError("_projection_mode must be a SemanticEventProjectionMode")
    if type(_production_enabled) is not bool:
        raise TypeError("_production_enabled must be an exact boolean")
    if type(_memory_agent_enabled) is not bool:
        raise TypeError("_memory_agent_enabled must be an exact boolean")
    if _memory_agent_model_invoker is not None and not callable(
        getattr(_memory_agent_model_invoker, "run", None)
    ):
        raise TypeError(
            "_memory_agent_model_invoker must provide "
            "run(request, toolkit, binding)"
        )
    if (
        _memory_agent_model_invoker_factory is not None
        and not callable(_memory_agent_model_invoker_factory)
    ):
        raise TypeError("_memory_agent_model_invoker_factory must be callable")
    if (
        _memory_agent_model_invoker is not None
        and _memory_agent_model_invoker_factory is not None
    ):
        raise PupuMemoryV2RunBindingError(
            "Memory Agent invoker and invoker factory are mutually exclusive"
        )
    if _memory_agent_enabled and not _production_enabled:
        raise PupuMemoryV2RunBindingError(
            "Memory V2 Agent toolkit requires the Context V2 production gate"
        )
    if _memory_agent_enabled and all(
        value is None
        for value in (
            _memory_agent_model_invoker,
            _memory_agent_model_invoker_factory,
        )
    ):
        raise PupuMemoryV2RunBindingError(
            "enabled Memory V2 Agent toolkit requires an official "
            "memory_agent_model_invoker"
        )

    try:
        deleted = is_chat_deleted(
            database_path=database,
            owner_chat_id=owner,
        )
    except ChatDeletionError as error:
        raise PupuMemoryV2RunBindingError(
            "chat deletion state is unavailable; host preparation failed closed"
        ) from error
    if deleted:
        raise PupuMemoryV2RunBindingError(
            "durably deleted chat cannot create a generation lifecycle"
        )

    admission = admit_context_v2_store_owner(
        root_dir=database.parent,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    if admission.database_path != database:
        raise PupuMemoryV2RunBindingError(
            "store ownership admission returned a different database"
        )
    store = SQLiteContextV2Store(
        database_path=database,
        object_directory=objects,
    )
    registry = PupuMemoryV2RunBindingRegistry(
        store=store,
        owner_chat_id=owner,
        execution_id=identity.execution_id,
        session_id=session_id,
        root_run_id=identity.root_run_id,
    )
    binding = registry.register_attempt(
        owner_chat_id=owner,
        session_id=session_id,
        identity=identity,
        grant=grant,
        current_input_draft=current_input_draft,
    )
    host_factory = PupuUnchainContextMemoryV2HostFactory(
        owner_chat_id=owner,
        root_run_id=identity.root_run_id,
        database_path=database,
        object_directory=objects,
        generation_resolver=registry.generation_resolver,
        current_input_resolver=registry.current_input_resolver,
        artifact_sanitizer=_sanitize_artifact,
        user_message_artifact_sanitizer=_sanitize_user_message_artifact,
        event_payload_sanitizer=_sanitize_event_payload,
        model_window_fallback=model_window_fallback,
        partial_attempt_sink=partial_attempt_sink,
        projection_mode=_projection_mode,
        production_enabled=_production_enabled,
        memory_agent_enabled=_memory_agent_enabled,
        memory_agent_model_invoker=_memory_agent_model_invoker,
        memory_agent_model_invoker_factory=(
            _memory_agent_model_invoker_factory
        ),
        workspace_content_redactor=_sanitize_workspace_draft,
    )
    return PupuMemoryV2ShadowHostPreparation(
        host_factory=host_factory,
        binding=binding,
        registry=registry,
    )


def build_active_host_factory(
    *,
    atomic_bootstrap: PupuUnchainAtomicBootstrap,
    owner_chat_id: str,
    session_id: str,
    identity: ExecutionIdentity,
    grant: ModuleGrant,
    current_input_draft: PupuMemoryV2CurrentInputDraft | None,
    database_path: str | Path,
    object_directory: str | Path,
    model_window_fallback,
    partial_attempt_sink,
    memory_agent_enabled: bool = False,
    memory_agent_model_invoker: MemoryAgentModelInvoker | None = None,
    memory_agent_model_invoker_factory: Any | None = None,
) -> PupuMemoryV2ShadowHostPreparation:
    """Prepare a canonical host behind the explicit production gate."""

    verified_head = verify_pupu_unchain_atomic_bootstrap(
        bootstrap=atomic_bootstrap,
        database_path=database_path,
        object_directory=object_directory,
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        execution_id=identity.execution_id,
    )
    preparation = build_shadow_host_factory(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        identity=identity,
        grant=grant,
        current_input_draft=current_input_draft,
        database_path=database_path,
        object_directory=object_directory,
        model_window_fallback=model_window_fallback,
        partial_attempt_sink=partial_attempt_sink,
        _projection_mode=SemanticEventProjectionMode.CANONICAL,
        _production_enabled=True,
        _memory_agent_enabled=memory_agent_enabled,
        _memory_agent_model_invoker=memory_agent_model_invoker,
        _memory_agent_model_invoker_factory=(
            memory_agent_model_invoker_factory
        ),
    )
    binding = preparation.binding
    if (
        binding.generation_id != verified_head.current_generation_id
        or binding.head_revision != verified_head.revision
    ):
        raise PupuMemoryV2RunBindingError(
            "active run binding does not name the verified current generation"
        )
    return preparation


__all__ = [
    "PupuMemoryV2InteractionInputDraft",
    "PupuMemoryV2RunBinding",
    "PupuMemoryV2RunBindingError",
    "PupuMemoryV2RunBindingRegistry",
    "PupuMemoryV2ShadowHostPreparation",
    "PupuMemoryV2TextInputDraft",
    "build_active_host_factory",
    "build_shadow_host_factory",
]
