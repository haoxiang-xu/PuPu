from __future__ import annotations

from types import SimpleNamespace

from memory_v2_unchain_runtime_context import (
    build_pupu_memory_v2_root_runtime_context,
    runtime_context_from_memory_binding_snapshot,
    runtime_context_for_memory_binding,
)
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant


def test_root_context_issues_explicit_non_delegable_completion_authority() -> None:
    context = build_pupu_memory_v2_root_runtime_context(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attempt_id="run-a",
        run_id="run-a",
    )

    grant = context.grant_for(MEMORY_V2_MODULE_KEY)
    assert context.identity.run_lineage == ("run-a",)
    assert grant.capabilities == MEMORY_V2_CAPABILITIES
    assert grant.allows(MEMORY_EXECUTION_COMPLETE)
    assert MEMORY_EXECUTION_COMPLETE not in grant.delegable_capabilities
    assert grant.authority.startswith("pupu-memory-completion-")


def test_authorized_resume_lineage_is_preserved_without_a_role() -> None:
    context = build_pupu_memory_v2_root_runtime_context(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attempt_id="resume-a",
        run_id="resume-a",
        run_lineage=("root-a", "resume-a"),
    )

    assert context.identity.root_run_id == "root-a"
    assert context.identity.parent_run_id == "root-a"
    assert context.grant_for(MEMORY_V2_MODULE_KEY).authority


def test_binding_projection_preserves_exact_identity_and_grant() -> None:
    identity = ExecutionIdentity(
        execution_id="execution-a",
        attempt_id="child-a",
        run_id="child-a",
        run_lineage=("root-a", "child-a"),
    )
    grant = ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=frozenset({"memory.context.read"}),
        delegable_capabilities=frozenset({"memory.context.read"}),
    )

    projected = runtime_context_for_memory_binding(
        SimpleNamespace(identity=identity, grant=grant)
    )

    assert isinstance(projected, AgentRuntimeContext)
    assert projected.identity is identity
    assert projected.module_grants == (grant,)


def test_canonical_binding_snapshot_restores_identity_and_grant() -> None:
    root = build_pupu_memory_v2_root_runtime_context(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attempt_id="resume-a",
        run_id="resume-a",
        run_lineage=("root-a", "resume-a"),
    )
    grant = root.grant_for(MEMORY_V2_MODULE_KEY)
    restored = runtime_context_from_memory_binding_snapshot(
        {
            "schema": "pupu.memory-v2-run-binding.v2",
            "owner_chat_id": "chat-a",
            "session_id": "execution-a",
            "generation_id": "generation-a",
            "head_revision": 1,
            "identity": {
                "execution_id": root.identity.execution_id,
                "attempt_id": root.identity.attempt_id,
                "run_id": root.identity.run_id,
                "root_run_id": root.identity.root_run_id,
                "parent_run_id": root.identity.parent_run_id,
                "run_lineage": list(root.identity.run_lineage),
            },
            "grant": {
                "module_key": grant.module_key,
                "capabilities": sorted(grant.capabilities),
                "delegable_capabilities": sorted(
                    grant.delegable_capabilities
                ),
                "authority": grant.authority,
            },
            "current_input_draft": None,
        }
    )

    assert restored == root


def test_binding_snapshot_never_recreates_authority_from_legacy_role() -> None:
    try:
        runtime_context_from_memory_binding_snapshot(
            {
                "schema": "pupu.memory-v2-run-binding.v1",
                "role": "root",
            }
        )
    except ValueError as error:
        assert "schema is not canonical" in str(error)
    else:
        raise AssertionError("legacy role snapshot must be rejected")
