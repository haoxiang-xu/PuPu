"""Thin PuPu binding for Unchain's provider-neutral pinned task state."""

from __future__ import annotations

from dataclasses import dataclass

from context_memory_v2_repository import (
    PupuExecutionCapabilities,
    PupuPinnedTaskStateRepository,
)
from memory_v2_workspace_adapter import PupuMemoryWorkspaceServiceBinding
from unchain.memory.workspace import TaskStateService
from unchain.memory.workspace.ports import RepositoryScopeError


@dataclass(frozen=True)
class PupuTaskStateServiceBinding:
    repository: PupuPinnedTaskStateRepository
    workspace: PupuMemoryWorkspaceServiceBinding
    service: TaskStateService


def bind_pupu_task_state_service(
    workspace: PupuMemoryWorkspaceServiceBinding,
    *,
    execution: PupuExecutionCapabilities,
) -> PupuTaskStateServiceBinding:
    """Bind one task-state service to the same chat/run as its workspace."""

    if not isinstance(workspace, PupuMemoryWorkspaceServiceBinding):
        raise TypeError("workspace must be a PupuMemoryWorkspaceServiceBinding")
    if not isinstance(execution, PupuExecutionCapabilities):
        raise TypeError("execution must be PupuExecutionCapabilities")
    if not workspace.references.is_bound_to_execution(execution):
        raise RepositoryScopeError(
            "task state execution and workspace have different host bindings"
        )
    repository = PupuPinnedTaskStateRepository(
        execution,
        binding_id=workspace.references.binding_id,
    )
    service = TaskStateService(
        repository=repository,
        references=workspace.references,
        patch_redactor=repository.redact_patch_for_storage,
    )
    return PupuTaskStateServiceBinding(
        repository=repository,
        workspace=workspace,
        service=service,
    )


__all__ = [
    "PupuTaskStateServiceBinding",
    "bind_pupu_task_state_service",
]
