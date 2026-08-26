"""PuPu policy for issuing generic Unchain runtime contexts.

Unchain transports identities and grants without knowing which optional module
consumes them.  PuPu owns the product default for its Memory V2 module: a root
execution receives the normal toolkit plus a non-delegable completion
authority, while child executions may receive only the declared delegable
capabilities through Unchain's generic delegation path.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Any

from unchain.journal.models import _required_text
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant


def _completion_authority(
    *,
    owner_chat_id: str,
    identity: ExecutionIdentity,
) -> str:
    owner = _required_text(
        owner_chat_id,
        "owner_chat_id",
        identifier=True,
    )
    payload = "\0".join(
        (
            "pupu.memory-v2-completion-authority.v1",
            owner,
            identity.execution_id,
            identity.attempt_id,
            identity.run_id,
            *identity.run_lineage,
        )
    )
    return "pupu-memory-completion-" + hashlib.sha256(
        payload.encode("utf-8")
    ).hexdigest()


def build_pupu_memory_v2_root_runtime_context(
    *,
    owner_chat_id: str,
    execution_id: str,
    attempt_id: str,
    run_id: str,
    run_lineage: tuple[str, ...] | None = None,
) -> AgentRuntimeContext:
    """Issue PuPu's explicit default grant for one root lifecycle run."""

    identity = ExecutionIdentity(
        execution_id=execution_id,
        attempt_id=attempt_id,
        run_id=run_id,
        run_lineage=run_lineage or (run_id,),
    )
    delegable = MEMORY_V2_CAPABILITIES.difference(
        {MEMORY_EXECUTION_COMPLETE}
    )
    return AgentRuntimeContext(
        identity=identity,
        module_grants=(
            ModuleGrant(
                module_key=MEMORY_V2_MODULE_KEY,
                capabilities=MEMORY_V2_CAPABILITIES,
                delegable_capabilities=delegable,
                authority=_completion_authority(
                    owner_chat_id=owner_chat_id,
                    identity=identity,
                ),
            ),
        ),
    )


def runtime_context_for_memory_binding(binding: object) -> AgentRuntimeContext:
    """Project one already-validated PuPu binding into Unchain's generic API."""

    identity = getattr(binding, "identity", None)
    grant = getattr(binding, "grant", None)
    if not isinstance(identity, ExecutionIdentity):
        raise TypeError("binding must expose an ExecutionIdentity")
    if not isinstance(grant, ModuleGrant):
        raise TypeError("binding must expose a ModuleGrant")
    if grant.module_key != MEMORY_V2_MODULE_KEY:
        raise ValueError("binding grant belongs to another module")
    return AgentRuntimeContext(identity=identity, module_grants=(grant,))


def runtime_context_from_memory_binding_snapshot(
    snapshot: Mapping[str, Any],
) -> AgentRuntimeContext:
    """Restore generic runtime facts from one canonical durable binding.

    The durable boundary stores neutral identity and capability data.  It does
    not recreate authority from a historical agent/graph role.
    """

    if not isinstance(snapshot, Mapping):
        raise TypeError("binding snapshot must be an object")
    if snapshot.get("schema") != "pupu.memory-v2-run-binding.v2":
        raise ValueError("binding snapshot schema is not canonical")
    if set(snapshot) != {
        "schema",
        "owner_chat_id",
        "session_id",
        "generation_id",
        "head_revision",
        "identity",
        "grant",
        "current_input_draft",
    }:
        raise ValueError("binding snapshot fields are not canonical")
    raw_identity = snapshot.get("identity")
    raw_grant = snapshot.get("grant")
    if not isinstance(raw_identity, Mapping):
        raise ValueError("binding snapshot identity is unavailable")
    if not isinstance(raw_grant, Mapping):
        raise ValueError("binding snapshot grant is unavailable")
    if set(raw_identity) != {
        "execution_id",
        "attempt_id",
        "run_id",
        "root_run_id",
        "parent_run_id",
        "run_lineage",
    }:
        raise ValueError("binding snapshot identity fields are not canonical")
    if set(raw_grant) != {
        "module_key",
        "capabilities",
        "delegable_capabilities",
        "authority",
    }:
        raise ValueError("binding snapshot grant fields are not canonical")
    raw_lineage = raw_identity.get("run_lineage")
    if isinstance(raw_lineage, (str, bytes, bytearray)) or not isinstance(
        raw_lineage,
        (list, tuple),
    ):
        raise ValueError("binding snapshot lineage is invalid")
    identity = ExecutionIdentity(
        execution_id=raw_identity.get("execution_id"),
        attempt_id=raw_identity.get("attempt_id"),
        run_id=raw_identity.get("run_id"),
        run_lineage=tuple(raw_lineage),
    )
    if raw_identity.get("root_run_id") != identity.root_run_id:
        raise ValueError("binding snapshot root lineage is inconsistent")
    if raw_identity.get("parent_run_id") != identity.parent_run_id:
        raise ValueError("binding snapshot parent lineage is inconsistent")
    raw_capabilities = raw_grant.get("capabilities")
    raw_delegable = raw_grant.get("delegable_capabilities")
    if isinstance(raw_capabilities, (str, bytes, bytearray)) or not isinstance(
        raw_capabilities,
        (list, tuple, set, frozenset),
    ):
        raise ValueError("binding snapshot capabilities are invalid")
    if isinstance(raw_delegable, (str, bytes, bytearray)) or not isinstance(
        raw_delegable,
        (list, tuple, set, frozenset),
    ):
        raise ValueError("binding snapshot delegable capabilities are invalid")
    grant = ModuleGrant(
        module_key=raw_grant.get("module_key"),
        capabilities=frozenset(raw_capabilities),
        delegable_capabilities=frozenset(raw_delegable),
        authority=raw_grant.get("authority"),
    )
    if grant.module_key != MEMORY_V2_MODULE_KEY:
        raise ValueError("binding snapshot grant belongs to another module")
    if grant.allows(MEMORY_EXECUTION_COMPLETE) and not grant.authority:
        raise ValueError(
            "binding snapshot completion capability requires an authority"
        )
    return AgentRuntimeContext(identity=identity, module_grants=(grant,))


__all__ = [
    "build_pupu_memory_v2_root_runtime_context",
    "runtime_context_from_memory_binding_snapshot",
    "runtime_context_for_memory_binding",
]
