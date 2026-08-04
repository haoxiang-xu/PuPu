"""Persist Unchain-owned shadow events before PuPu observes them.

The bridge is intentionally small: ContextShadowModule performs bootstrap and
dry-run compilation, while this host adapter routes each non-provider-mutating
runtime callback to the exact attempt bundle selected by Unchain.  It does not
translate run identities, infer child roles, or fall back to the legacy Memory
V2 repository.
"""

from __future__ import annotations

import os
import copy
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
import threading
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    configured_context_v2_store_owner,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2CurrentInputDraft,
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2ShadowHostPreparation,
    PupuMemoryV2TextInputDraft,
    build_shadow_host_factory,
)
from memory_v2_unchain_runtime_factory import PupuUnchainAttemptRuntime
from unchain.journal.models import _required_text
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainShadowBridgeError(RuntimeError):
    """A runtime event could not be routed to its exact shadow attempt."""


@dataclass(frozen=True, slots=True)
class PupuUnchainShadowRunDraft:
    """Explicit host identity supplied before an agent is constructed."""

    execution_id: str
    session_id: str
    attempt_id: str
    run_id: str
    root_run_id: str
    role: MemoryV2RunRole
    source_attempt_id: str = ""
    current_input_draft: PupuMemoryV2CurrentInputDraft | None = None
    attachment_blocks: tuple[Mapping[str, Any], ...] = ()

    def __post_init__(self) -> None:
        for field_name in (
            "execution_id",
            "session_id",
            "attempt_id",
            "run_id",
            "root_run_id",
        ):
            object.__setattr__(
                self,
                field_name,
                _required_text(
                    getattr(self, field_name),
                    field_name,
                    identifier=True,
                ),
            )
        source = str(self.source_attempt_id or "").strip()
        if source:
            source = _required_text(
                source,
                "source_attempt_id",
                identifier=True,
            )
        object.__setattr__(self, "source_attempt_id", source)
        if not isinstance(self.role, MemoryV2RunRole):
            raise TypeError("role must be a MemoryV2RunRole")
        if not isinstance(self.attachment_blocks, tuple) or any(
            not isinstance(block, Mapping) for block in self.attachment_blocks
        ):
            raise TypeError("attachment_blocks must be a tuple of objects")
        object.__setattr__(
            self,
            "attachment_blocks",
            tuple(copy.deepcopy(dict(block)) for block in self.attachment_blocks),
        )
        if self.attachment_blocks and self.role is not MemoryV2RunRole.ROOT:
            raise ValueError("only a root run can own current input attachments")


def prepare_pupu_unchain_shadow_bridge(
    *,
    admission: Any,
    run: PupuUnchainShadowRunDraft | None,
    model_window_fallback: Callable[[str, str], int],
    partial_attempt_sink: Callable[[object, Exception], None],
) -> PupuUnchainShadowEventBridge | None:
    """Create the official observer only for an admitted Unchain-owned chat."""

    if run is None or not bool(getattr(admission, "is_shadow", False)):
        return None
    if not isinstance(run, PupuUnchainShadowRunDraft):
        raise TypeError("run must be a PupuUnchainShadowRunDraft")
    if configured_context_v2_store_owner() != STORE_OWNER_UNCHAIN:
        return None
    owner_chat_id = _required_text(
        getattr(admission, "owner_chat_id", None),
        "owner_chat_id",
        identifier=True,
    )
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise PupuUnchainShadowBridgeError(
            "Unchain-owned shadow storage requires UNCHAIN_DATA_DIR"
        )
    root_dir = Path(raw_data_dir).expanduser().resolve() / "memory_v2"
    current_input_draft = run.current_input_draft
    if run.attachment_blocks:
        if isinstance(current_input_draft, PupuMemoryV2InteractionInputDraft):
            raise PupuUnchainShadowBridgeError(
                "interaction input cannot also contain attachment blocks"
            )
        if (
            isinstance(current_input_draft, PupuMemoryV2TextInputDraft)
            and current_input_draft.attachments
        ):
            raise PupuUnchainShadowBridgeError(
                "shadow input attachments were already resolved"
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
            attachments=resolved_attachments,
        )
    preparation = build_shadow_host_factory(
        owner_chat_id=owner_chat_id,
        execution_id=run.execution_id,
        session_id=run.session_id,
        attempt_id=run.attempt_id,
        run_id=run.run_id,
        root_run_id=run.root_run_id,
        role=run.role,
        source_attempt_id=run.source_attempt_id,
        current_input_draft=current_input_draft,
        database_path=root_dir / "context_v2.sqlite3",
        object_directory=root_dir / "objects",
        model_window_fallback=model_window_fallback,
        partial_attempt_sink=partial_attempt_sink,
    )
    return PupuUnchainShadowEventBridge(
        preparation=preparation,
        execution_id=run.execution_id,
    )


@dataclass(frozen=True, slots=True)
class PupuUnchainShadowEventBridge:
    """Synchronous journal-before-notify boundary for one execution tree."""

    preparation: PupuMemoryV2ShadowHostPreparation
    execution_id: str
    _forwarded_attempts: set[str] = field(
        default_factory=set,
        init=False,
        repr=False,
        compare=False,
    )
    _forwarded_attempts_lock: threading.RLock = field(
        default_factory=threading.RLock,
        init=False,
        repr=False,
        compare=False,
    )

    def __post_init__(self) -> None:
        if not isinstance(
            self.preparation,
            PupuMemoryV2ShadowHostPreparation,
        ):
            raise TypeError(
                "preparation must be a PupuMemoryV2ShadowHostPreparation"
            )
        object.__setattr__(
            self,
            "execution_id",
            _required_text(
                self.execution_id,
                "execution_id",
                identifier=True,
            ),
        )
        if self.preparation.binding.execution_id != self.execution_id:
            raise ValueError(
                "shadow bridge execution does not match its root binding"
            )

    @property
    def modules(self) -> tuple[Any, ...]:
        return self.preparation.host_factory.modules_for_shadow()

    def attempt_for_event(
        self,
        event: Mapping[str, Any],
    ) -> PupuUnchainAttemptRuntime:
        if not isinstance(event, Mapping):
            raise TypeError("shadow runtime event must be an object")
        try:
            run_id = _required_text(
                event.get("run_id"),
                "run_id",
                identifier=True,
            )
            return self.preparation.host_factory.attempt(
                execution_id=self.execution_id,
                attempt_id=run_id,
            )
        except (TypeError, ValueError, RuntimeError) as error:
            raise PupuUnchainShadowBridgeError(
                "shadow event is not bound to an exact bootstrapped attempt"
            ) from error

    def persist(self, event: Mapping[str, Any]):
        """Synchronously append a semantic callback to the official journal."""

        self.attempt_for_event(event)
        if not isinstance(event, dict):
            event = dict(event)
        return self.preparation.host_factory.context_module.runtime.compose_event_callback(
            None
        )(event)

    def _is_official_forwarded_attempt(self, event: Mapping[str, Any]) -> bool:
        """Accept a nested event only after its sibling host owns the attempt."""

        try:
            run_id = _required_text(
                event.get("run_id"),
                "run_id",
                identifier=True,
            )
        except (TypeError, ValueError):
            return False
        with self._forwarded_attempts_lock:
            if run_id in self._forwarded_attempts:
                return True
        binding = self.preparation.binding
        from memory_v2_unchain_ownership_adapter import (
            read_pupu_unchain_ownership_lifecycle,
        )

        lifecycle = read_pupu_unchain_ownership_lifecycle(
            database_path=self.preparation.host_factory.database_path,
            owner_chat_id=binding.owner_chat_id,
            execution_id=binding.execution_id,
            generation_id=binding.generation_id,
            attempt_id=run_id,
        )
        if lifecycle is None:
            return False
        expected_scope = (
            binding.owner_chat_id,
            binding.execution_id,
            binding.generation_id,
            binding.root_run_id,
            self.preparation.host_factory.binding_id,
            self.preparation.host_factory.chat_space_id,
        )
        actual_scope = (
            lifecycle.owner_chat_id,
            lifecycle.execution_id,
            lifecycle.generation_id,
            lifecycle.root_run_id,
            lifecycle.binding_id,
            lifecycle.chat_space_id,
        )
        if actual_scope != expected_scope:
            return False
        with self._forwarded_attempts_lock:
            self._forwarded_attempts.add(run_id)
        return True

    def compose_event_callback(
        self,
        host_callback: Callable[[dict[str, Any]], Any] | None,
    ) -> Callable[[dict[str, Any]], Any]:
        """Use Unchain's re-entrant durable-before-host callback composer."""

        if host_callback is not None and not callable(host_callback):
            raise TypeError("host_callback must be callable or None")
        persist_local = (
            self.preparation.host_factory.context_module.runtime.compose_event_callback(
                host_callback
            )
        )

        def persist_or_forward(event: dict[str, Any]) -> Any:
            try:
                self.attempt_for_event(event)
            except PupuUnchainShadowBridgeError:
                if not self._is_official_forwarded_attempt(event):
                    raise
                if host_callback is None:
                    return None
                return host_callback(event)
            return persist_local(event)

        return persist_or_forward

    def persist_then_notify(
        self,
        event: Mapping[str, Any],
        notify: Callable[[Mapping[str, Any]], Any],
    ) -> Any:
        """Persist first; invoke the PuPu callback only after success."""

        if not callable(notify):
            raise TypeError("notify must be callable")
        self.attempt_for_event(event)
        if not isinstance(event, dict):
            event = dict(event)
        return self.compose_event_callback(notify)(event)


__all__ = [
    "PupuUnchainShadowBridgeError",
    "PupuUnchainShadowEventBridge",
    "PupuUnchainShadowRunDraft",
    "prepare_pupu_unchain_shadow_bridge",
]
