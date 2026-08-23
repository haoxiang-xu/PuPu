from __future__ import annotations

import importlib
import sqlite3

import pytest

from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
)
from memory_v2_store import MemoryV2Error, MemoryV2Store, SCHEMA_VERSION
from memory_v2_workspace_adapter import bind_pupu_memory_workspace_service
from unchain.journal import OperationRef, ResourceRef
from unchain.memory.workspace import MemorySpace, PromotionStatus
from unchain.memory.workspace.ports import (
    BoundPromotionConfirmationAuthorizer,
    BoundPromotionDecisionRepository,
    BoundPromotionRepository,
    RepositoryConflictError,
    RepositoryNotFoundError,
    WorkspaceRepositoryError,
)
from unchain.memory.workspace.promotions import PromotionService
from unchain.memory.workspace.promotions import PromotionConfirmationService


SHA_A = "a" * 64


def _operation(identifier: str) -> OperationRef:
    return OperationRef(identifier, SHA_A)


def _build_workspace(store: MemoryV2Store):
    bootstrapped = store.bootstrap_current_request(
        owner_chat_id="chat-promotion",
        session_id="session-promotion",
        attempt_id="attempt-promotion",
        message={"content": "Build the promotion adapter"},
        operation_id="promotion-bootstrap",
    )
    source_event = store.append_semantic_event(
        owner_chat_id="chat-promotion",
        session_id="session-promotion",
        attempt_id="attempt-promotion",
        event={
            "event_id": "promotion-source-event",
            "type": "message.user",
            "payload": {"message": {"content": "Remember the provider preference"}},
        },
        operation_id="promotion-source-event-operation",
    )
    host = PupuContextMemoryV2Repository(store)
    execution = host.bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-promotion",
            session_id="session-promotion",
            generation_id=bootstrapped["generation_id"],
            attempt_id="attempt-promotion",
        )
    )
    repository = host.ensure_chat_workspace(
        owner_chat_id="chat-promotion",
        name="Promotion Chat Memory",
        description="Bound source workspace",
        operation=_operation("promotion-chat-space"),
    )
    workspace = bind_pupu_memory_workspace_service(
        repository,
        binding_id="promotion-binding",
        execution=execution,
    )
    source = workspace.service.write_markdown(
        path="/provider.md",
        description="Provider preference",
        content="Prefer the local provider.",
        expected_space_revision=repository.space.revision,
        source_refs=(ResourceRef("context_event", source_event["event_id"], 1),),
        operation_id="promotion-source-entry",
    )
    target = store.ensure_space(
        scope_kind="long_term",
        scope_key="user:promotion",
        namespace="user:promotion",
        name="Long-term Memory",
        description="Promotion target",
        operation_id="promotion-target-space",
    )
    return workspace, source, MemorySpace(
        target["space_id"],
        target["namespace"],
        target["name"],
        target["description"],
        target["revision"],
    )


@pytest.fixture()
def promotion_stack(tmp_path):
    root = tmp_path / "memory-v2"
    store = MemoryV2Store(root)
    workspace, source, target_space = _build_workspace(store)
    try:
        yield root, store, workspace, source, target_space
    finally:
        store.close()


def test_adapter_module_exposes_bound_promotion_capabilities():
    adapter = importlib.import_module("memory_v2_promotion_adapter")

    assert issubclass(adapter.PupuPromotionRepository, BoundPromotionRepository)
    assert issubclass(
        adapter.PupuPromotionDecisionRepository,
        BoundPromotionDecisionRepository,
    )
    assert issubclass(
        adapter.PupuPromotionConfirmationAuthorizer,
        BoundPromotionConfirmationAuthorizer,
    )


def test_proposal_round_trips_exactly_across_replay_and_restart(promotion_stack):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    root, store, workspace, source, target_space = promotion_stack
    repository = adapter.PupuPromotionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    service = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    )
    arguments = {
        "source_ref": ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ),
        "target_path": "/provider.md",
        "reason": "Confirmed provider preference",
        "source_refs": (
            ResourceRef("context_event", "promotion-source-event", 1),
        ),
        "operation_id": "promotion-proposal",
    }

    proposal = service.propose(**arguments)

    assert proposal.status is PromotionStatus.PENDING
    assert service.propose(**arguments) == proposal
    assert repository.read(
        ref=ResourceRef(
            "promotion",
            proposal.proposal_id,
            proposal.revision,
            proposal.target_namespace,
        )
    ) == proposal
    assert store.status()["schema_version"] == SCHEMA_VERSION == 4

    store.close()
    reopened = MemoryV2Store(root)
    try:
        restarted_repository = adapter.PupuPromotionRepository(
            reopened,
            owner_chat_id="chat-promotion",
            source_space=workspace.repository.space,
            target_space=target_space,
        )
        assert restarted_repository.read(
            ref=ResourceRef(
                "promotion",
                proposal.proposal_id,
                proposal.revision,
                proposal.target_namespace,
            )
        ) == proposal
        assert reopened.status()["schema_version"] == 4
    finally:
        reopened.close()


def test_confirmed_decision_is_one_use_atomic_and_restart_replayable(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    root, store, workspace, source, target_space = promotion_stack
    repository = adapter.PupuPromotionDecisionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    proposals = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    )
    proposal = proposals.propose(
        source_ref=ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ),
        target_path="/provider.md",
        reason="Confirmed provider preference",
        source_refs=(ResourceRef("context_event", "promotion-source-event", 1),),
        operation_id="promotion-for-decision",
    )
    proposal_ref = ResourceRef(
        "promotion",
        proposal.proposal_id,
        proposal.revision,
        proposal.target_namespace,
    )
    confirmations = adapter.PupuPromotionConfirmationAuthorizer(
        proposal.target_namespace,
        owner_chat_id="chat-promotion",
    )
    receipt = confirmations.issue(
        proposal_ref=proposal_ref,
        approved=True,
        decision_reason="User explicitly approved",
        operation_id="promotion-decision",
    )
    decisions = PromotionConfirmationService(
        repository,
        confirmations=confirmations,
    )
    arguments = {
        "ref": proposal_ref,
        "expected_revision": proposal.revision,
        "confirmation": receipt,
        "operation_id": "promotion-decision",
    }

    applied = decisions.decide(**arguments)

    assert applied.status is PromotionStatus.APPLIED
    assert applied.revision == proposal.revision + 1
    assert applied.applied_entry_ref is not None
    assert repository.read_target(ref=applied.applied_entry_ref).path == "/provider.md"
    assert decisions.decide(**arguments) == applied
    assert confirmations.consume_count == 1
    assert repository.read(ref=proposal_ref) == proposal
    assert repository.read(
        ref=ResourceRef(
            "promotion",
            applied.proposal_id,
            applied.revision,
            applied.target_namespace,
        )
    ) == applied

    store.close()
    reopened = MemoryV2Store(root)
    try:
        restarted = adapter.PupuPromotionDecisionRepository(
            reopened,
            owner_chat_id="chat-promotion",
            source_space=workspace.repository.space,
            target_space=target_space,
        )
        decision_operation = OperationRef(
            "promotion-decision",
            next(
                receipt_payload["operation_payload_hash"]
                for receipt_payload in reopened.list_promotions(
                    owner_chat_id="chat-promotion",
                    promotion_id=proposal.proposal_id,
                    include_compatibility=True,
                )["promotions"][0]["compatibility_receipts"]
                if receipt_payload["compatibility_payload"]["kind"] == "decision"
            ),
        )
        assert restarted.replay_decision(operation=decision_operation) == applied
        assert restarted.read(ref=proposal_ref) == proposal
    finally:
        reopened.close()


def test_strict_decision_never_falls_back_to_a_same_path_different_target(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, source, target_space = promotion_stack
    original = store.create_entry(
        owner_chat_id="chat-promotion",
        space_id=target_space.space_id,
        entry_id="long-term-original",
        path="/provider.md",
        kind="file",
        description="Original target",
        mime_type="text/markdown",
        content=b"Original long-term value",
        source_event_id="promotion-source-event",
        expected_space_revision=target_space.revision,
        operation_id="promotion-original-target",
        allow_long_term=True,
        namespace=target_space.namespace,
    )
    repository = adapter.PupuPromotionDecisionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    proposals = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    )
    proposal = proposals.propose(
        source_ref=ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ),
        target_path="/provider.md",
        target_entry_ref=ResourceRef(
            "memory",
            original["entry_id"],
            original["revision"],
            target_space.space_id,
        ),
        reason="Replace the exact approved baseline",
        source_refs=(ResourceRef("context_event", "promotion-source-event", 1),),
        operation_id="promotion-exact-baseline",
    )
    removed = store.delete_entry(
        owner_chat_id="chat-promotion",
        space_id=target_space.space_id,
        entry_id=original["entry_id"],
        expected_revision=original["revision"],
        expected_space_revision=original["space_revision"],
        operation_id="promotion-remove-original",
        allow_long_term=True,
        namespace=target_space.namespace,
    )
    replacement = store.create_entry(
        owner_chat_id="chat-promotion",
        space_id=target_space.space_id,
        entry_id="long-term-replacement",
        path="/provider.md",
        kind="file",
        description="Unrelated replacement",
        mime_type="text/markdown",
        content=b"Do not overwrite this entry",
        source_event_id="promotion-source-event",
        expected_space_revision=removed["space_revision"],
        operation_id="promotion-create-replacement",
        allow_long_term=True,
        namespace=target_space.namespace,
    )
    ref = ResourceRef(
        "promotion",
        proposal.proposal_id,
        proposal.revision,
        proposal.target_namespace,
    )
    confirmations = adapter.PupuPromotionConfirmationAuthorizer(
        proposal.target_namespace,
        owner_chat_id="chat-promotion",
    )
    receipt = confirmations.issue(
        proposal_ref=ref,
        approved=True,
        decision_reason="Approve only the reviewed baseline",
        operation_id="promotion-stale-target-decision",
    )

    with pytest.raises(RepositoryConflictError, match="baseline"):
        PromotionConfirmationService(
            repository,
            confirmations=confirmations,
        ).decide(
            ref=ref,
            expected_revision=proposal.revision,
            confirmation=receipt,
            operation_id="promotion-stale-target-decision",
        )

    untouched = store.get_entry(
        owner_chat_id="chat-promotion",
        space_id=target_space.space_id,
        entry_id=replacement["entry_id"],
        allow_long_term=True,
        namespace=target_space.namespace,
    )
    assert untouched["revision"] == 1
    assert untouched["description"] == "Unrelated replacement"


def test_compatibility_payload_redaction_fails_before_row_or_receipt(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, source, target_space = promotion_stack
    repository = adapter.PupuPromotionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    service = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    )

    with pytest.raises(WorkspaceRepositoryError):
        service.propose(
            source_ref=ResourceRef(
                "memory",
                source.entry_id,
                source.revision,
                source.space_id,
            ),
            target_path="/provider.md",
            reason="password=sk-secret-must-not-persist",
            source_refs=(
                ResourceRef("context_event", "promotion-source-event", 1),
            ),
            operation_id="promotion-sensitive-compatibility",
        )

    with sqlite3.connect(store.db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM promotions").fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM operations WHERE operation_id LIKE 'promotion-propose:%'"
        ).fetchone()[0] == 0


def test_legacy_schema_v4_proposal_remains_readable_with_explicit_provenance(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, source, target_space = promotion_stack
    legacy = store.propose_promotion(
        owner_chat_id="chat-promotion",
        source_space_id=source.space_id,
        source_entry_id=source.entry_id,
        source_entry_revision=source.revision,
        target_namespace=target_space.namespace,
        target_path="/legacy-provider.md",
        operation_id="legacy-promotion-proposal",
    )
    repository = adapter.PupuPromotionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )

    proposal = repository.read(
        ref=ResourceRef(
            "promotion",
            legacy["promotion_id"],
            legacy["revision"],
            target_space.namespace,
        )
    )

    assert proposal.status is PromotionStatus.PENDING
    assert proposal.source_entry_ref == ResourceRef(
        "memory",
        source.entry_id,
        source.revision,
        source.space_id,
    )
    assert proposal.source_refs[-1] == ResourceRef(
        "legacy_v1",
        legacy["promotion_id"],
        legacy["revision"],
        "schema_v4",
    )
    assert proposal.diff["op"] == "derive"


def test_confirmation_authorizer_rejects_unbound_identifiers_and_exact_mismatch():
    adapter = importlib.import_module("memory_v2_promotion_adapter")

    with pytest.raises(ValueError, match="owner_chat_id"):
        adapter.PupuPromotionConfirmationAuthorizer(
            "user:promotion",
            owner_chat_id="../foreign-chat",
        )

    authorizer = adapter.PupuPromotionConfirmationAuthorizer(
        "user:promotion",
        owner_chat_id="chat-promotion",
    )
    proposal_ref = ResourceRef(
        "promotion",
        "promotion-confirmation-bound",
        1,
        "user:promotion",
    )
    with pytest.raises(ValueError, match="operation_id"):
        authorizer.issue(
            proposal_ref=proposal_ref,
            approved=True,
            decision_reason="Explicit approval",
            operation_id="../../forged-operation",
        )

    receipt = authorizer.issue(
        proposal_ref=proposal_ref,
        approved=True,
        decision_reason="Explicit approval",
        operation_id="bound-confirmation-operation",
    )
    assert authorizer.issue(
        proposal_ref=proposal_ref,
        approved=True,
        decision_reason="Explicit approval",
        operation_id="bound-confirmation-operation",
    ) == receipt
    with pytest.raises(PermissionError, match="binding"):
        authorizer.consume(
            confirmation_id=receipt.confirmation_id,
            proposal_ref=proposal_ref,
            approved=False,
        )
    assert authorizer.consume_count == 0


def test_store_rejects_a_divergent_strict_compatibility_receipt_before_write(
    promotion_stack,
):
    _adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, _workspace, source, target_space = promotion_stack
    operation = OperationRef("divergent-proposal-operation", SHA_A)
    proposal_id = "promotion-divergent-receipt"
    proposal = {
        "schema": "unchain.promotion_proposal.v1",
        "proposal_id": proposal_id,
        "source_entry_ref": ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ).to_dict(),
        "target_namespace": target_space.namespace,
        "target_path": "/another-path.md",
        "diff": {
            "op": "derive",
            "source_entry_ref": ResourceRef(
                "memory",
                source.entry_id,
                source.revision,
                source.space_id,
            ).to_dict(),
            "target_path": "/another-path.md",
        },
        "reason": "Divergent target",
        "status": "pending",
        "revision": 1,
        "source_refs": [],
        "target_entry_ref": None,
        "applied_entry_ref": None,
    }

    with pytest.raises(MemoryV2Error) as failure:
        store.propose_promotion(
            owner_chat_id="chat-promotion",
            source_space_id=source.space_id,
            source_entry_id=source.entry_id,
            source_entry_revision=source.revision,
            target_namespace=target_space.namespace,
            target_path="/provider.md",
            operation_id="promotion-propose:divergent-receipt",
            promotion_id=proposal_id,
            target_space_id=target_space.space_id,
            operation_payload_hash=operation.payload_sha256,
            compatibility_payload={
                "schema": "pupu.promotion_compatibility.v1",
                "kind": "proposal",
                "operation": operation.to_dict(),
                "proposal": proposal,
            },
            strict_target_binding=True,
        )
    assert getattr(failure.value, "code", "") == "context_v2_invalid_request"
    with sqlite3.connect(store.db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM promotions").fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM operations WHERE operation_id=?",
            ("promotion-propose:divergent-receipt",),
        ).fetchone()[0] == 0


def test_store_rejects_a_divergent_strict_decision_receipt_before_effect(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, source, target_space = promotion_stack
    repository = adapter.PupuPromotionDecisionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    proposal = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    ).propose(
        source_ref=ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ),
        target_path="/provider.md",
        reason="Decision receipt binding",
        source_refs=(ResourceRef("context_event", "promotion-source-event", 1),),
        operation_id="promotion-before-divergent-decision",
    )
    decision_operation = OperationRef("divergent-decision-operation", SHA_A)
    tampered = proposal.to_dict()
    tampered["target_path"] = "/different-target.md"

    with pytest.raises(MemoryV2Error) as failure:
        store.decide_promotion(
            owner_chat_id="chat-promotion",
            promotion_id=proposal.proposal_id,
            decision="apply",
            expected_revision=proposal.revision,
            operation_id="promotion-decide:divergent-decision-operation",
            target_space_id=target_space.space_id,
            confirmation_id="confirmation-divergent-decision",
            operation_payload_hash=decision_operation.payload_sha256,
            compatibility_payload={
                "schema": "pupu.promotion_compatibility.v1",
                "kind": "decision",
                "operation": decision_operation.to_dict(),
                "proposal": tampered,
            },
            strict_target_binding=True,
        )
    assert failure.value.code == "context_v2_invalid_request"
    durable = store.list_promotions(
        owner_chat_id="chat-promotion",
        promotion_id=proposal.proposal_id,
    )["promotions"][0]
    assert durable["status"] == "pending"
    assert store.list_entries(
        owner_chat_id="chat-promotion",
        space_id=target_space.space_id,
        allow_long_term=True,
        namespace=target_space.namespace,
    )["entries"] == []


def test_external_operation_id_cannot_cross_promotion_operation_kinds(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, source, target_space = promotion_stack
    repository = adapter.PupuPromotionDecisionRepository(
        store,
        owner_chat_id="chat-promotion",
        source_space=workspace.repository.space,
        target_space=target_space,
    )
    proposal = PromotionService(
        source_repository=workspace.repository,
        proposals=repository,
        references=workspace.references,
    ).propose(
        source_ref=ResourceRef(
            "memory",
            source.entry_id,
            source.revision,
            source.space_id,
        ),
        target_path="/provider.md",
        reason="Operation kind binding",
        source_refs=(ResourceRef("context_event", "promotion-source-event", 1),),
        operation_id="promotion-shared-operation",
    )
    proposal_receipt = next(
        receipt
        for receipt in store.list_promotions(
            owner_chat_id="chat-promotion",
            promotion_id=proposal.proposal_id,
            include_compatibility=True,
        )["promotions"][0]["compatibility_receipts"]
        if receipt["compatibility_payload"]["kind"] == "proposal"
    )

    with pytest.raises(RepositoryConflictError, match="operation"):
        repository.replay_decision(
            operation=OperationRef(
                "promotion-shared-operation",
                proposal_receipt["operation_payload_hash"],
            )
        )


def test_repository_constructor_verifies_exact_source_and_target_store_scope(
    promotion_stack,
):
    adapter = importlib.import_module("memory_v2_promotion_adapter")
    _root, store, workspace, _source, target_space = promotion_stack

    with pytest.raises(RepositoryNotFoundError):
        adapter.PupuPromotionRepository(
            store,
            owner_chat_id="chat-foreign",
            source_space=workspace.repository.space,
            target_space=target_space,
        )
    with pytest.raises(RepositoryNotFoundError):
        adapter.PupuPromotionRepository(
            store,
            owner_chat_id="chat-promotion",
            source_space=workspace.repository.space,
            target_space=MemorySpace(
                "missing-long-term-space",
                target_space.namespace,
                target_space.name,
                target_space.description,
                target_space.revision,
            ),
        )
