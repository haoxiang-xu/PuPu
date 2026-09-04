from __future__ import annotations

import pytest

from memory_v2_unchain_graph_identity import (
    PupuUnchainGraphIdentityError,
    build_pupu_unchain_graph_run_draft,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from unchain.memory import (
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_CAPABILITIES,
    MEMORY_V2_MODULE_KEY,
)
from unchain.runtime import AgentRuntimeContext, ExecutionIdentity, ModuleGrant


def _root_grant() -> ModuleGrant:
    return ModuleGrant(
        module_key=MEMORY_V2_MODULE_KEY,
        capabilities=MEMORY_V2_CAPABILITIES,
        delegable_capabilities=(
            MEMORY_V2_CAPABILITIES - {MEMORY_EXECUTION_COMPLETE}
        ),
        authority="memory-root-authority",
    )


def _runtime_context(
    *,
    execution_id: str,
    run_id: str,
    run_lineage: tuple[str, ...] | None = None,
    grant: ModuleGrant | None = None,
) -> AgentRuntimeContext:
    return AgentRuntimeContext(
        identity=ExecutionIdentity(
            execution_id=execution_id,
            attempt_id=run_id,
            run_id=run_id,
            run_lineage=run_lineage or (run_id,),
        ),
        module_grants=((grant or _root_grant()),),
    )


def test_top_level_graph_owns_the_current_user_input() -> None:
    runtime_context = _runtime_context(
        execution_id="execution-root-graph",
        run_id="root-graph-run",
    )
    run = build_pupu_unchain_graph_run_draft(
        options={
            "_memory_v2_run_role": "graph_step",
            "_memory_v2_root_run_id": "untrusted-transport-value",
        },
        runtime_context=runtime_context,
        execution_id="execution-root-graph",
        workflow_run_id="root-graph-run",
        message="build the report",
        attachment_blocks=({"kind": "file", "name": "brief.md"},),
    )

    assert run.identity is runtime_context.identity
    assert run.grant is runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
    assert run.root_run_id == run.run_id == "root-graph-run"
    assert run.parent_run_id is None
    assert run.current_input_draft == PupuMemoryV2TextInputDraft(
        content="build the report"
    )
    assert run.attachment_blocks == ({"kind": "file", "name": "brief.md"},)


def test_nested_graph_preserves_lineage_without_claiming_input() -> None:
    runtime_context = _runtime_context(
        execution_id="execution-child-graph",
        run_id="recipe-child-run",
        run_lineage=("root-parent", "parent-attempt", "recipe-child-run"),
        grant=_root_grant().delegated(),
    )
    run = build_pupu_unchain_graph_run_draft(
        options={"_memory_v2_run_role": "root"},
        runtime_context=runtime_context,
        execution_id="execution-child-graph",
        workflow_run_id="recipe-child-run",
        message="durably derived child task",
    )

    assert run.identity is runtime_context.identity
    assert run.grant is runtime_context.grant_for(MEMORY_V2_MODULE_KEY)
    assert run.root_run_id == "root-parent"
    assert run.parent_run_id == "parent-attempt"
    assert run.current_input_draft is None
    assert run.attachment_blocks == ()


@pytest.mark.parametrize(
    "execution_id, workflow_run_id, match",
    (
        (
            "different-execution",
            "bound-run",
            "execution identity",
        ),
        (
            "bound-execution",
            "different-workflow",
            "workflow identity",
        ),
    ),
)
def test_graph_runtime_context_must_match_the_concrete_workflow(
    execution_id: str,
    workflow_run_id: str,
    match: str,
) -> None:
    with pytest.raises(PupuUnchainGraphIdentityError, match=match):
        build_pupu_unchain_graph_run_draft(
            options={},
            runtime_context=_runtime_context(
                execution_id="bound-execution",
                run_id="bound-run",
            ),
            execution_id=execution_id,
            workflow_run_id=workflow_run_id,
            message="task",
        )


def test_graph_runtime_context_requires_an_explicit_memory_grant() -> None:
    context = AgentRuntimeContext(
        identity=ExecutionIdentity(
            execution_id="execution-no-memory",
            attempt_id="run-no-memory",
            run_id="run-no-memory",
            run_lineage=("run-no-memory",),
        )
    )

    with pytest.raises(PupuUnchainGraphIdentityError, match="Memory V2 grant"):
        build_pupu_unchain_graph_run_draft(
            options={},
            runtime_context=context,
            execution_id="execution-no-memory",
            workflow_run_id="run-no-memory",
            message="task",
        )


def test_nested_graph_rejects_attachments_even_with_authority() -> None:
    with pytest.raises(PupuUnchainGraphIdentityError, match="attachments"):
        build_pupu_unchain_graph_run_draft(
            options={},
            runtime_context=_runtime_context(
                execution_id="execution-child-attachments",
                run_id="recipe-child-attachments",
                run_lineage=("root-parent", "recipe-child-attachments"),
            ),
            execution_id="execution-child-attachments",
            workflow_run_id="recipe-child-attachments",
            message="task",
            attachment_blocks=({"kind": "file"},),
        )
