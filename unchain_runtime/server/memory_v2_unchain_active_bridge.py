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
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    configured_context_v2_store_owner,
)
from memory_v2_unchain_atomic_bootstrap import (
    PupuUnchainAtomicBootstrap,
    prepare_pupu_unchain_atomic_bootstrap,
)
from memory_v2_unchain_run_binding import (
    PupuMemoryV2InteractionInputDraft,
    PupuMemoryV2TextInputDraft,
    PupuMemoryV2ShadowHostPreparation,
    build_active_host_factory,
)
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from memory_v2_unchain_runtime_factory import PupuUnchainAttemptRuntime
from unchain.journal.models import _required_text


class PupuUnchainActiveBridgeError(RuntimeError):
    """An active run could not bind the canonical Unchain context owner."""


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

    def persist_host_event(self, event: dict[str, Any]) -> None:
        """Persist an event synthesized by PuPu rather than the Agent loop."""

        self.preparation.host_factory.context_module.runtime.persist_event(event)


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
    "preflight_pupu_unchain_active_host",
    "prepare_pupu_unchain_active_bridge",
]
