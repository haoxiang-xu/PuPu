from __future__ import annotations

from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from memory_v2_unchain_promotion_api import (
    PUPU_LONG_TERM_NAMESPACE,
    PupuUnchainPromotionApiError,
    open_pupu_unchain_promotion_api,
)
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
)
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import BoundWorkspaceReferenceAuthorizer
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


OWNER = "chat-promotion-cold-open"
SPACE_ID = "space-promotion-cold-open"
BINDING_ID = "binding-promotion-cold-open"
EXECUTION_ID = "execution-promotion-cold-open"
EVENT_REF = ResourceRef("context_event", "event-promotion-cold-open", 1)


class _SeedReferences(BoundWorkspaceReferenceAuthorizer):
    def __init__(self) -> None:
        super().__init__(BINDING_ID)

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if ref != EVENT_REF:
            raise PermissionError("seed reference is outside the fixture")
        return ref


def _append_user_event(context: SQLiteContextV2Store, execution_id: str) -> None:
    context.bind_execution(execution_id).append(
        request=JournalAppendRequest(
            event_id=EVENT_REF.resource_id,
            event_type="message.user",
            attempt=AttemptRef(
                GenerationRef(execution_id, "generation-promotion-cold-open"),
                "attempt-promotion-cold-open",
            ),
            operation=OperationRef(
                "event-operation-promotion-cold-open",
                "a" * 64,
            ),
            payload={"content": "Remember the durable provider preference."},
        )
    )


def _seed(root: Path):
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    object_directory = admission.root_dir / "objects"
    context = SQLiteContextV2Store(
        database_path=admission.database_path,
        object_directory=object_directory,
    )
    memory = SQLiteMemoryV2Store(
        database_path=admission.database_path,
        object_directory=object_directory,
    )
    SQLiteContextCompilerV2Store(context_store=context)
    SQLitePromotionV2Store(
        database_path=admission.database_path,
        object_directory=object_directory,
    )
    _initialize_lifecycle_schema(admission.database_path)
    _append_user_event(context, EXECUTION_ID)
    source_repository = memory.bind_workspace(
        space=MemorySpace(
            SPACE_ID,
            "chat",
            "Cold-open promotion source",
            "Chat memory used by the cold-open promotion adapter",
            1,
        ),
        owner_chat_id=OWNER,
    )
    seed_references = _SeedReferences()
    workspace = MemoryWorkspaceService(
        repository=source_repository,
        mutations=source_repository,
        content=source_repository,
        history=source_repository,
        links=source_repository,
        references=seed_references,
    )
    source = workspace.write_markdown(
        path="/preferences/provider.md",
        description="The durable provider preference captured in this chat.",
        content="Prefer the local provider.\n",
        expected_space_revision=1,
        source_refs=(EVENT_REF,),
        operation_id="seed-promotion-cold-open-source",
    )
    lifecycle = PupuUnchainMemoryV2Lifecycle(
        owner_chat_id=OWNER,
        execution_id=EXECUTION_ID,
        generation_id="generation-promotion-cold-open",
        attempt_id="attempt-promotion-cold-open",
        root_run_id="root-run-promotion-cold-open",
        binding_id=BINDING_ID,
        chat_space_id=SPACE_ID,
    )
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=lifecycle,
        operation_id="persist-promotion-cold-open-lifecycle",
        expected_revision=0,
    )
    return admission, context, workspace, source


def test_open_factory_is_route_usable_and_restart_safe(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _, _, workspace, source = _seed(root)

    pending = open_pupu_unchain_promotion_api(
        root_dir=root,
        owner_chat_id=OWNER,
    ).propose_promotion(
        owner_chat_id=OWNER,
        source_space_id=SPACE_ID,
        source_entry_id=source.entry_id,
        source_entry_revision=source.revision,
        target_namespace=PUPU_LONG_TERM_NAMESPACE,
        target_path="/preferences/provider.md",
        operation_id="promotion-cold-open-propose",
    )

    reopened = open_pupu_unchain_promotion_api(
        root_dir=root,
        owner_chat_id=OWNER,
    )
    assert reopened.list_promotions(
        owner_chat_id=OWNER,
        status="pending",
        limit=10,
    )["promotions"] == [pending]
    assert EVENT_REF.to_dict() in pending["source_refs"]
    applied = reopened.decide_promotion(
        owner_chat_id=OWNER,
        promotion_id=pending["promotion_id"],
        decision="apply",
        expected_revision=pending["revision"],
        operation_id="promotion-cold-open-apply",
    )
    assert applied["status"] == "applied"
    assert open_pupu_unchain_promotion_api(
        root_dir=root,
        owner_chat_id=OWNER,
    ).list_promotions(
        owner_chat_id=OWNER,
        status="applied",
        limit=10,
    )["promotions"] == [applied]
    assert workspace.read(
        ResourceRef("memory", source.entry_id, source.revision, source.space_id)
    ).data == b"Prefer the local provider.\n"


def test_open_factory_fails_closed_for_owner_without_lifecycle(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    _seed(root)

    with pytest.raises(PupuUnchainPromotionApiError) as unavailable:
        open_pupu_unchain_promotion_api(
            root_dir=root,
            owner_chat_id="another-chat",
        )

    assert unavailable.value.code == (
        "context_v2_promotion_lifecycle_unavailable"
    )
    assert unavailable.value.status_code == 409


def test_open_factory_rejects_ambiguous_lifecycle_binding(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    admission, context, _, _ = _seed(root)
    context.bind_execution("execution-promotion-cold-open-second")
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=PupuUnchainMemoryV2Lifecycle(
            owner_chat_id=OWNER,
            execution_id="execution-promotion-cold-open-second",
            generation_id="generation-promotion-cold-open-second",
            attempt_id="attempt-promotion-cold-open-second",
            root_run_id="root-run-promotion-cold-open-second",
            binding_id="binding-promotion-cold-open-second",
            chat_space_id=SPACE_ID,
        ),
        operation_id="persist-promotion-cold-open-second-lifecycle",
        expected_revision=0,
    )

    with pytest.raises(PupuUnchainPromotionApiError) as ambiguous:
        open_pupu_unchain_promotion_api(
            root_dir=root,
            owner_chat_id=OWNER,
        )

    assert ambiguous.value.code == "context_v2_promotion_lifecycle_ambiguous"
    assert ambiguous.value.status_code == 409
