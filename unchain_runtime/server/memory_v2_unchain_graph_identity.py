"""Resolve PuPu graph orchestration identity before any Context V2 host opens.

The product host owns transport options and recipe-ref nesting.  Unchain owns
the durable run roles.  This adapter converts the former into one exact run
draft without treating a nested graph task as fresh root user input.
"""

from __future__ import annotations

import copy
from collections.abc import Mapping, Sequence
from typing import Any

from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.journal.models import _required_text
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainGraphIdentityError(RuntimeError):
    """Graph transport options do not identify one exact orchestration run."""


def _optional_identifier(value: object, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    return _required_text(normalized, field_name, identifier=True)


def _run_role(options: Mapping[str, Any]) -> MemoryV2RunRole:
    raw_role = str(options.get("_memory_v2_run_role") or "").strip()
    if not raw_role:
        return MemoryV2RunRole.ROOT
    try:
        role = MemoryV2RunRole(raw_role)
    except ValueError as error:
        raise PupuUnchainGraphIdentityError(
            "graph orchestration run role is invalid"
        ) from error
    if role not in {MemoryV2RunRole.ROOT, MemoryV2RunRole.SUBAGENT}:
        raise PupuUnchainGraphIdentityError(
            "graph orchestration must be a root or recipe-ref subagent"
        )
    return role


def build_pupu_unchain_graph_run_draft(
    *,
    options: Mapping[str, Any],
    execution_id: str,
    workflow_run_id: str,
    message: str,
    attachment_blocks: Sequence[Mapping[str, Any]] = (),
) -> PupuUnchainShadowRunDraft:
    """Build the shared shadow/active graph orchestration identity."""

    if not isinstance(options, Mapping):
        raise TypeError("options must be an object")
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

    role = _run_role(options)
    supplied_root = _optional_identifier(
        options.get("_memory_v2_root_run_id"),
        "root_run_id",
    )
    source_attempt_id = _optional_identifier(
        options.get("_memory_v2_source_attempt_id"),
        "source_attempt_id",
    )
    if role is MemoryV2RunRole.ROOT:
        root_run_id = supplied_root or workflow
        if root_run_id != workflow:
            raise PupuUnchainGraphIdentityError(
                "root graph workflow_run_id must equal root_run_id"
            )
        if source_attempt_id:
            raise PupuUnchainGraphIdentityError(
                "root graph cannot name a source attempt"
            )
        current_input = (
            PupuMemoryV2TextInputDraft(content=message)
            if message.strip()
            else None
        )
    else:
        root_run_id = supplied_root
        if not root_run_id or not source_attempt_id:
            raise PupuUnchainGraphIdentityError(
                "recipe-ref graph requires root and source attempt identity"
            )
        if workflow in {root_run_id, source_attempt_id}:
            raise PupuUnchainGraphIdentityError(
                "recipe-ref graph attempt must differ from root and source"
            )
        if attachments:
            raise PupuUnchainGraphIdentityError(
                "recipe-ref graph cannot own root input attachments"
            )
        current_input = None

    return PupuUnchainShadowRunDraft(
        execution_id=execution,
        session_id=execution,
        attempt_id=workflow,
        run_id=workflow,
        root_run_id=root_run_id,
        role=role,
        source_attempt_id=source_attempt_id,
        current_input_draft=current_input,
        attachment_blocks=attachments,
    )


__all__ = [
    "PupuUnchainGraphIdentityError",
    "build_pupu_unchain_graph_run_draft",
]
