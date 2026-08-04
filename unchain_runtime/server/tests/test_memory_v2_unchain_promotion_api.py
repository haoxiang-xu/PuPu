from __future__ import annotations

from pathlib import Path

import pytest

from memory_v2_unchain_promotion_api import (
    PUPU_LONG_TERM_NAMESPACE,
    PupuUnchainPromotionApi,
    PupuUnchainPromotionApiError,
)
from unchain.journal import ResourceRef
from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
from unchain.memory.workspace.ports import (
    BoundWorkspaceReferenceAuthorizer,
    RepositoryConflictError,
    RepositoryScopeError,
)
from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store


OWNER = "chat-official-promotion"
SPACE_ID = "space-official-promotion"
EVENT_REF = ResourceRef("context_event", "event-official-promotion", 1)


class _References(BoundWorkspaceReferenceAuthorizer):
    def __init__(self, binding_id: str, allowed: set[ResourceRef]) -> None:
        super().__init__(binding_id)
        self.allowed = allowed

    def authorize(self, *, ref: ResourceRef) -> ResourceRef:
        if ref not in self.allowed:
            raise RepositoryScopeError("reference is outside the bound chat")
        return ref


def _stack(root: Path):
    memory = SQLiteMemoryV2Store(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )
    source_repository = memory.bind_workspace(
        space=MemorySpace(
            SPACE_ID,
            "chat",
            "Official promotion source",
            "Owner-bound PuPu chat memory",
            1,
        ),
        owner_chat_id=OWNER,
    )
    references = _References("binding-official-promotion", {EVENT_REF})
    workspace = MemoryWorkspaceService(
        repository=source_repository,
        mutations=source_repository,
        content=source_repository,
        history=source_repository,
        links=source_repository,
        references=references,
    )
    source = workspace.write_markdown(
        path="/preferences/provider.md",
        description="A chat-owned provider preference",
        content="Prefer the local provider.\n",
        expected_space_revision=1,
        source_refs=(EVENT_REF,),
        operation_id="seed-official-promotion-source",
    )
    references.allowed.add(
        ResourceRef("memory", source.entry_id, source.revision, source.space_id)
    )
    repository = SQLitePromotionV2Store(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    ).bind(
        source_space=source_repository.space,
        source_owner_chat_id=OWNER,
        target_namespace=PUPU_LONG_TERM_NAMESPACE,
    )
    api = PupuUnchainPromotionApi(
        owner_chat_id=OWNER,
        source_repository=source_repository,
        references=references,
        repository=repository,
    )
    return memory, workspace, source, references, repository, api


def _propose(api, source, *, operation_id="official-promotion-propose", **overrides):
    arguments = {
        "owner_chat_id": OWNER,
        "source_space_id": source.space_id,
        "source_entry_id": source.entry_id,
        "source_entry_revision": source.revision,
        "target_namespace": PUPU_LONG_TERM_NAMESPACE,
        "target_path": "/preferences/provider.md",
        "operation_id": operation_id,
    }
    arguments.update(overrides)
    return api.propose_promotion(**arguments)


def test_proposal_is_pending_with_complete_provenance_and_no_long_term_write(
    tmp_path: Path,
) -> None:
    _, workspace, source, _, repository, api = _stack(tmp_path)

    proposal = _propose(api, source)

    assert proposal["target_namespace"] == "user:local"
    assert proposal["status"] == "pending"
    assert proposal["revision"] == 1
    assert proposal["requires_user_confirmation"] is True
    assert proposal["decision_reason_supported"] is False
    assert proposal["decision_reason_persistence"] == "unsupported"
    assert EVENT_REF.to_dict() in proposal["source_refs"]
    assert ResourceRef(
        "memory",
        source.entry_id,
        source.revision,
        source.space_id,
    ).to_dict() in proposal["source_refs"]
    assert repository.validate_target_baseline(
        target_path=proposal["target_path"],
        target_entry_ref=None,
    ) is None
    assert workspace.read(
        ResourceRef("memory", source.entry_id, source.revision, source.space_id)
    ).data == b"Prefer the local provider.\n"


def test_list_is_scope_bound_filtered_limited_and_restart_safe(tmp_path: Path) -> None:
    _, _, source, references, repository, api = _stack(tmp_path)
    first = _propose(
        api,
        source,
        operation_id="official-promotion-list-first",
        target_path="/preferences/first.md",
    )
    second = _propose(
        api,
        source,
        operation_id="official-promotion-list-second",
        target_path="/preferences/second.md",
    )
    rejected = api.decide_promotion(
        owner_chat_id=OWNER,
        promotion_id=second["promotion_id"],
        decision="reject",
        expected_revision=second["revision"],
        operation_id="official-promotion-list-reject",
    )
    reopened_memory = SQLiteMemoryV2Store(
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
    )
    reopened_source = reopened_memory.bind_workspace(
        space=repository.source_space,
        owner_chat_id=OWNER,
    )
    reopened_repository = SQLitePromotionV2Store(
        database_path=tmp_path / "context_v2.sqlite3",
        object_directory=tmp_path / "objects",
    ).bind(
        source_space=reopened_source.space,
        source_owner_chat_id=OWNER,
        target_namespace=PUPU_LONG_TERM_NAMESPACE,
        target_space_id=repository.target_space_id,
    )
    reopened = PupuUnchainPromotionApi(
        owner_chat_id=OWNER,
        source_repository=reopened_source,
        references=references,
        repository=reopened_repository,
    )

    assert reopened.list_promotions(
        owner_chat_id=OWNER,
        status="pending",
        limit=1,
    )["promotions"] == [first]
    assert reopened.list_promotions(
        owner_chat_id=OWNER,
        status="rejected",
        limit=100,
    )["promotions"] == [rejected]
    with pytest.raises(RepositoryScopeError):
        reopened.list_promotions(owner_chat_id="another-chat")
    with pytest.raises(PupuUnchainPromotionApiError, match="status"):
        reopened.list_promotions(owner_chat_id=OWNER, status="unknown")


def test_user_apply_is_cas_idempotent_derives_target_and_preserves_source(
    tmp_path: Path,
) -> None:
    _, workspace, source, _, repository, api = _stack(tmp_path)
    pending = _propose(api, source)
    arguments = {
        "owner_chat_id": OWNER,
        "promotion_id": pending["promotion_id"],
        "decision": "apply",
        "expected_revision": pending["revision"],
        "operation_id": "official-promotion-user-apply",
    }

    applied = api.decide_promotion(**arguments)

    assert api.decide_promotion(**arguments) == applied
    assert applied["status"] == "applied"
    assert applied["revision"] == 2
    assert applied["requires_user_confirmation"] is False
    target_ref = ResourceRef(
        "memory",
        applied["applied_entry_id"],
        applied["applied_entry_revision"],
        repository.target_space_id,
    )
    assert repository.read_target(ref=target_ref).source_refs
    assert workspace.read(
        ResourceRef("memory", source.entry_id, source.revision, source.space_id)
    ).data == b"Prefer the local provider.\n"


def test_reject_writes_no_target_and_decision_reason_is_explicitly_unsupported(
    tmp_path: Path,
) -> None:
    _, _, source, _, repository, api = _stack(tmp_path)
    pending = _propose(api, source)

    with pytest.raises(
        PupuUnchainPromotionApiError,
        match="not durably supported",
    ) as unsupported:
        api.decide_promotion(
            owner_chat_id=OWNER,
            promotion_id=pending["promotion_id"],
            decision="reject",
            expected_revision=pending["revision"],
            operation_id="official-promotion-reject-with-reason",
            decision_reason="Do not retain this",
        )
    assert unsupported.value.code == (
        "context_v2_promotion_decision_reason_unsupported"
    )
    assert repository.list_current()[0].status.value == "pending"

    rejected = api.decide_promotion(
        owner_chat_id=OWNER,
        promotion_id=pending["promotion_id"],
        decision="reject",
        expected_revision=pending["revision"],
        operation_id="official-promotion-user-reject",
    )

    assert rejected["status"] == "rejected"
    assert rejected["decision_reason"] == ""
    assert rejected["decision_reason_persistence"] == "unsupported"
    assert repository.validate_target_baseline(
        target_path=pending["target_path"],
        target_entry_ref=None,
    ) is None


def test_source_owner_namespace_baseline_and_operation_id_are_exactly_bound(
    tmp_path: Path,
) -> None:
    _, _, source, _, _, api = _stack(tmp_path)
    with pytest.raises(RepositoryScopeError):
        _propose(api, source, owner_chat_id="another-chat")
    with pytest.raises(RepositoryScopeError):
        _propose(api, source, source_space_id="another-space")
    with pytest.raises(RepositoryScopeError):
        _propose(api, source, target_namespace="user:another")
    with pytest.raises(PupuUnchainPromotionApiError, match="supplied together"):
        _propose(api, source, target_entry_id="target-without-revision")

    baseline = _propose(
        api,
        source,
        operation_id="official-promotion-operation-binding",
    )
    assert _propose(
        api,
        source,
        operation_id="official-promotion-operation-binding",
    ) == baseline
    with pytest.raises(RepositoryConflictError, match="operation"):
        _propose(
            api,
            source,
            operation_id="official-promotion-operation-binding",
            target_path="/preferences/different.md",
        )
