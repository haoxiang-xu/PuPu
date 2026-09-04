from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_long_term_recall import (
    PUPU_LONG_TERM_RECALL_NAMESPACE,
    PupuUnchainLongTermRecallError,
    open_pupu_unchain_long_term_recall,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    _initialize_lifecycle_schema,
    _persist_lifecycle,
)
from memory_v2_unchain_promotion_api import (
    PUPU_LONG_TERM_NAMESPACE,
    open_pupu_unchain_promotion_api,
)
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
)
from unchain.memory.long_term_recall_v2 import LongTermRecallDisposition
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import BoundWorkspaceReferenceAuthorizer
from unchain.persistence.sqlite_context_compiler_v2 import (
    SQLiteContextCompilerV2Store,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


class _OfflineVectorIndex:
    def supersede(self, *, entry_ref: ResourceRef, deleted: bool) -> None:
        return None

    def upsert(self, chunks) -> None:
        return None

    def search(self, query: str, *, limit: int):
        raise RuntimeError("vector service offline")


class _SeedReferences(BoundWorkspaceReferenceAuthorizer):
    def __init__(self, binding_id: str, allowed: set[ResourceRef]) -> None:
        super().__init__(binding_id)
        self.allowed = allowed

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if ref not in self.allowed:
            raise PermissionError("seed reference is outside the fixture")
        return ref


def _seed(
    root: Path,
    *,
    owner: str = "chat-long-term-recall",
    suffix: str = "alpha",
    entry_count: int = 1,
    semantic_conflict: bool = False,
):
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    objects = admission.root_dir / "objects"
    context = SQLiteContextV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    memory = SQLiteMemoryV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    SQLiteContextCompilerV2Store(context_store=context)
    SQLitePromotionV2Store(
        database_path=admission.database_path,
        object_directory=objects,
    )
    _initialize_lifecycle_schema(admission.database_path)
    execution_id = f"execution-long-term-{suffix}"
    generation_id = f"generation-long-term-{suffix}"
    attempt_id = f"attempt-long-term-{suffix}"
    event = ResourceRef("context_event", f"event-long-term-{suffix}", 1)
    context.bind_execution(execution_id).append(
        request=JournalAppendRequest(
            event_id=event.resource_id,
            event_type="message.user",
            attempt=AttemptRef(
                GenerationRef(execution_id, generation_id),
                attempt_id,
            ),
            operation=OperationRef(
                f"event-operation-long-term-{suffix}",
                ("a" if suffix == "alpha" else "b") * 64,
            ),
            payload={"content": "Remember the durable provider preference."},
        )
    )
    space_id = f"space-long-term-{suffix}"
    binding_id = f"binding-long-term-{suffix}"
    repository = memory.bind_workspace(
        space=MemorySpace(
            space_id,
            "chat",
            f"Long-term source {suffix}",
            "Chat workspace for long-term recall tests",
            1,
        ),
        owner_chat_id=owner,
    )
    references = _SeedReferences(binding_id, {event})
    workspace = MemoryWorkspaceService(
        repository=repository,
        mutations=repository,
        content=repository,
        history=repository,
        links=repository,
        references=references,
    )
    entries = []
    for index in range(entry_count):
        entry = workspace.write_markdown(
            path=f"/preferences/provider-{index}.md",
            description=f"Durable provider preference {index}",
            content=f"Prefer provider {index}.\n",
            expected_space_revision=index + 1,
            source_refs=(event,),
            operation_id=f"seed-long-term-entry-{suffix}-{index}",
            tags=(
                ("semantic:provider-choice",)
                if semantic_conflict
                else ()
            ),
        )
        references.allowed.add(
            ResourceRef("memory", entry.entry_id, entry.revision, entry.space_id)
        )
        entries.append(entry)
    _persist_lifecycle(
        database_path=admission.database_path,
        lifecycle=PupuUnchainMemoryV2Lifecycle(
            owner_chat_id=owner,
            execution_id=execution_id,
            generation_id=generation_id,
            attempt_id=attempt_id,
            root_run_id=f"root-run-long-term-{suffix}",
            binding_id=binding_id,
            chat_space_id=space_id,
        ),
        operation_id=f"persist-long-term-lifecycle-{suffix}",
        expected_revision=0,
    )
    return entries, binding_id, space_id


def _apply(root: Path, *, owner: str, space_id: str, entries) -> None:
    api = open_pupu_unchain_promotion_api(
        root_dir=root,
        owner_chat_id=owner,
    )
    for index, entry in enumerate(entries):
        pending = api.propose_promotion(
            owner_chat_id=owner,
            source_space_id=space_id,
            source_entry_id=entry.entry_id,
            source_entry_revision=entry.revision,
            target_namespace=PUPU_LONG_TERM_NAMESPACE,
            target_path=f"/preferences/provider-{index}.md",
            operation_id=f"long-term-recall-propose-{index}",
        )
        applied = api.decide_promotion(
            owner_chat_id=owner,
            promotion_id=pending["promotion_id"],
            decision="apply",
            expected_revision=pending["revision"],
            operation_id=f"long-term-recall-apply-{index}",
        )
        assert applied["status"] == "applied"


def test_absent_long_term_namespace_is_a_bounded_none_result(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _seed(root)

    recall = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
    )
    envelope = recall.recall_first_message(
        owner_chat_id="chat-long-term-recall",
        first_user_message="nothing retained yet",
    )

    assert recall.memory_available is False
    assert envelope.disposition is LongTermRecallDisposition.NONE
    assert envelope.namespace == "user:local"


def test_applied_promotion_is_recalled_across_cold_restart(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    entries, binding_id, space_id = _seed(root)
    _apply(
        root,
        owner="chat-long-term-recall",
        space_id=space_id,
        entries=entries,
    )

    first = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
    )
    first_envelope = first.recall_first_message(
        owner_chat_id="chat-long-term-recall",
        first_user_message="/preferences/provider-0.md",
    )
    reopened_envelope = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
    ).recall_first_message(
        owner_chat_id="chat-long-term-recall",
        first_user_message="/preferences/provider-0.md",
    )

    assert first.binding_id == binding_id
    assert first.memory_available is True
    assert first_envelope.to_dict() == reopened_envelope.to_dict()
    assert first_envelope.disposition is LongTermRecallDisposition.CONTEXT_REFERENCES
    assert first_envelope.references[0].provenance_refs


def test_conflicting_promotions_request_curator_without_running_one(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    entries, _, space_id = _seed(
        root,
        entry_count=2,
        semantic_conflict=True,
    )
    _apply(
        root,
        owner="chat-long-term-recall",
        space_id=space_id,
        entries=entries,
    )

    envelope = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
    ).recall_first_message(
        owner_chat_id="chat-long-term-recall",
        first_user_message="provider",
    )

    assert envelope.disposition is LongTermRecallDisposition.CURATOR_REQUIRED
    assert envelope.reason == "semantic_key_conflict"
    assert len(envelope.references) == 2


def test_owner_and_namespace_selection_are_host_bound(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    _seed(root)
    recall = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
    )

    with pytest.raises(PupuUnchainLongTermRecallError) as mismatch:
        recall.recall_first_message(
            owner_chat_id="another-chat",
            first_user_message="provider",
        )
    with pytest.raises(PupuUnchainLongTermRecallError) as missing:
        open_pupu_unchain_long_term_recall(
            root_dir=root,
            owner_chat_id="another-chat",
        )

    assert mismatch.value.code == "context_v2_long_term_recall_owner_mismatch"
    assert missing.value.code == (
        "context_v2_long_term_recall_lifecycle_unavailable"
    )
    assert PUPU_LONG_TERM_RECALL_NAMESPACE == PUPU_LONG_TERM_NAMESPACE
    assert "namespace" not in inspect.signature(
        open_pupu_unchain_long_term_recall
    ).parameters


def test_vector_outage_falls_back_to_official_durable_fts(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    entries, _, space_id = _seed(root)
    _apply(
        root,
        owner="chat-long-term-recall",
        space_id=space_id,
        entries=entries,
    )

    envelope = open_pupu_unchain_long_term_recall(
        root_dir=root,
        owner_chat_id="chat-long-term-recall",
        vector_index=_OfflineVectorIndex(),
    ).recall_first_message(
        owner_chat_id="chat-long-term-recall",
        first_user_message="provider",
    )

    assert envelope.disposition is LongTermRecallDisposition.CONTEXT_REFERENCES
    assert envelope.vector_unavailable is True
    assert "fts" in envelope.references[0].matched_by
