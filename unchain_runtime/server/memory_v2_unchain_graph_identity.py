"""Resolve PuPu graph orchestration identity before any Context V2 host opens.

The product host supplies an explicit runtime context.  This adapter verifies
that context against the concrete graph execution and builds one exact run
draft without deriving identity or authority from transport options.
"""

from __future__ import annotations

import copy
from collections.abc import Mapping, Sequence
from typing import Any

from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.journal.models import _required_text
from unchain.memory import MEMORY_V2_MODULE_KEY
from unchain.runtime import AgentRuntimeContext


class PupuUnchainGraphIdentityError(RuntimeError):
    """Graph runtime context does not identify one exact orchestration run."""


def build_pupu_unchain_graph_run_draft(
    *,
    options: Mapping[str, Any],
    runtime_context: AgentRuntimeContext,
    execution_id: str,
    workflow_run_id: str,
    message: str,
    attachment_blocks: Sequence[Mapping[str, Any]] = (),
) -> PupuUnchainShadowRunDraft:
    """Build the shared shadow/active graph orchestration identity."""

    if not isinstance(options, Mapping):
        raise TypeError("options must be an object")
    if not isinstance(runtime_context, AgentRuntimeContext):
        raise TypeError("runtime_context must be an AgentRuntimeContext")
    execution = _required_text(
        execution_id,
        "execution_id",
        identifier=True,
    )
    workflow = _required_text(
        workflow_run_id,
        "workflow_run_id",
        identifier=True,
    )
    if not isinstance(message, str):
        raise TypeError("message must be text")
    if isinstance(attachment_blocks, (str, bytes, bytearray)) or not isinstance(
        attachment_blocks,
        Sequence,
    ):
        raise TypeError("attachment_blocks must be a sequence of objects")
    attachments = tuple(
        copy.deepcopy(dict(block))
        for block in attachment_blocks
        if isinstance(block, Mapping)
    )
    if len(attachments) != len(attachment_blocks):
        raise TypeError("attachment_blocks must contain only objects")

    identity = runtime_context.identity
    if identity.execution_id != execution:
        raise PupuUnchainGraphIdentityError(
            "graph runtime context changed its execution identity"
        )
    if identity.attempt_id != workflow or identity.run_id != workflow:
        raise PupuUnchainGraphIdentityError(
            "graph runtime context changed its workflow identity"
        )
    grant = runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
    if grant is None:
        raise PupuUnchainGraphIdentityError(
            "graph runtime context has no Memory V2 grant"
        )

    if identity.parent_run_id is None:
        current_input = (
            PupuMemoryV2TextInputDraft(content=message)
            if message.strip()
            else None
        )
    else:
        if attachments:
            raise PupuUnchainGraphIdentityError(
                "nested graph cannot own current input attachments"
            )
        current_input = None

    return PupuUnchainShadowRunDraft(
        session_id=execution,
        identity=identity,
        grant=grant,
        current_input_draft=current_input,
        attachment_blocks=attachments,
    )


__all__ = [
    "PupuUnchainGraphIdentityError",
    "build_pupu_unchain_graph_run_draft",
]
