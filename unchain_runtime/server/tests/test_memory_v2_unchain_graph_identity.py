from __future__ import annotations

import pytest

from memory_v2_unchain_graph_identity import (
    PupuUnchainGraphIdentityError,
    build_pupu_unchain_graph_run_draft,
)
from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
from unchain.run_identity import MemoryV2RunRole


def test_top_level_graph_owns_the_current_user_input() -> None:
    run = build_pupu_unchain_graph_run_draft(
        options={},
        execution_id="execution-root-graph",
        workflow_run_id="root-graph-run",
        message="build the report",
        attachment_blocks=({"kind": "file", "name": "brief.md"},),
    )

    assert run.role is MemoryV2RunRole.ROOT
    assert run.root_run_id == run.run_id == "root-graph-run"
    assert run.source_attempt_id == ""
    assert run.current_input_draft == PupuMemoryV2TextInputDraft(
        content="build the report"
    )
    assert run.attachment_blocks == ({"kind": "file", "name": "brief.md"},)


def test_recipe_ref_graph_preserves_parent_lineage_without_claiming_input() -> None:
    run = build_pupu_unchain_graph_run_draft(
        options={
            "_memory_v2_run_role": "subagent",
            "_memory_v2_root_run_id": "root-parent",
            "_memory_v2_source_attempt_id": "parent-attempt",
        },
        execution_id="execution-child-graph",
        workflow_run_id="recipe-child-run",
        message="durably derived child task",
    )

    assert run.role is MemoryV2RunRole.SUBAGENT
    assert run.root_run_id == "root-parent"
    assert run.source_attempt_id == "parent-attempt"
    assert run.current_input_draft is None
    assert run.attachment_blocks == ()


@pytest.mark.parametrize(
    "options, workflow_run_id, match",
    (
        (
            {"_memory_v2_run_role": "graph_step"},
            "nested-step",
            "root or recipe-ref",
        ),
        (
            {"_memory_v2_run_role": "subagent"},
            "child-missing-lineage",
            "requires root and source",
        ),
        (
            {
                "_memory_v2_run_role": "subagent",
                "_memory_v2_root_run_id": "same-run",
                "_memory_v2_source_attempt_id": "parent",
            },
            "same-run",
            "must differ",
        ),
        (
            {
                "_memory_v2_root_run_id": "different-root",
            },
            "root-run",
            "must equal",
        ),
    ),
)
def test_invalid_graph_lineage_fails_closed(
    options: dict,
    workflow_run_id: str,
    match: str,
) -> None:
    with pytest.raises(PupuUnchainGraphIdentityError, match=match):
        build_pupu_unchain_graph_run_draft(
            options=options,
            execution_id="execution-invalid",
            workflow_run_id=workflow_run_id,
            message="task",
        )


def test_recipe_ref_graph_cannot_take_root_attachments() -> None:
    with pytest.raises(PupuUnchainGraphIdentityError, match="attachments"):
        build_pupu_unchain_graph_run_draft(
            options={
                "_memory_v2_run_role": "subagent",
                "_memory_v2_root_run_id": "root-parent",
                "_memory_v2_source_attempt_id": "parent-attempt",
            },
            execution_id="execution-child-attachments",
            workflow_run_id="recipe-child-attachments",
            message="task",
            attachment_blocks=({"kind": "file"},),
        )
