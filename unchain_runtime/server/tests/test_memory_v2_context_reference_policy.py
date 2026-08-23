from __future__ import annotations

import hashlib
from types import SimpleNamespace

import pytest

import memory_v2_context_reference_policy as reference_policy
from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionScope,
)
from memory_v2_context import MemoryV2Admission
from memory_v2_context_adapter import (
    PupuContextHostBindingError,
    bind_pupu_context_module,
)
from memory_v2_context_reference_policy import PupuContextReferencePolicyError
from memory_v2_store import MemoryV2Store
from memory_v2_workspace_adapter import (
    PupuWorkspaceReferenceAuthorizer,
    bind_pupu_memory_workspace_service,
)
from unchain.journal import (
    AttemptRef,
    GenerationRef,
    JournalAppendRequest,
    OperationRef,
    ResourceRef,
    SemanticEventDraft,
)
from unchain.journal.ports import JournalScopeError
from unchain.memory.workspace.ports import WorkspaceRepositoryError


def _operation(identifier: str) -> OperationRef:
    return OperationRef(
        identifier,
        hashlib.sha256(identifier.encode("utf-8")).hexdigest(),
    )


def _admission(scope: PupuExecutionScope) -> MemoryV2Admission:
    return MemoryV2Admission(
        requested_mode="all",
        effective_rollout_mode="all",
        mode="active",
        reason="test",
        provider="openai",
        model="gpt-test",
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        source_attempt_id=scope.attempt_id,
        real_context_window_tokens=16_384,
        output_reserve_tokens=2_048,
        transport_margin_tokens=512,
        available_input_tokens=13_824,
        compression_threshold_tokens=12_441,
        declared_context_window_tokens=16_384,
        context_window_source="provider_capability",
    )


def _seed_host(store: MemoryV2Store, suffix: str) -> SimpleNamespace:
    owner_chat_id = f"chat-{suffix}"
    session_id = f"session-{suffix}"
    attempt_id = f"attempt-{suffix}"
    seed = store.bootstrap_current_request(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        attempt_id=attempt_id,
        message={"role": "user", "content": f"objective {suffix}"},
        operation_id=f"seed-{suffix}",
    )
    scope = PupuExecutionScope(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        generation_id=seed["generation_id"],
        attempt_id=attempt_id,
    )
    host = PupuContextMemoryV2Repository(store)
    execution = host.bind_execution(scope)
    workspace = host.ensure_chat_workspace(
        owner_chat_id=owner_chat_id,
        name=f"Chat {suffix}",
        description=f"Reference authority for {suffix}",
        operation=_operation(f"ensure-workspace-{suffix}"),
    )
    workspace_binding = bind_pupu_memory_workspace_service(
        workspace,
        binding_id=f"workspace-binding-{suffix}",
        execution=execution,
    )
    seed_event = execution.journal.read(limit=1).events[0]
    return SimpleNamespace(
        store=store,
        scope=scope,
        execution=execution,
        workspace=workspace,
        workspace_binding=workspace_binding,
        references=workspace_binding.references,
        seed_ref=ResourceRef("context_event", seed_event.event_id, 1),
    )


def _projector(scope: PupuExecutionScope):
    attempt = AttemptRef(
        GenerationRef(scope.session_id, scope.generation_id),
        scope.attempt_id,
    )

    def project(event):
        return SemanticEventDraft(
            event_id=event["event_id"],
            event_type=event["type"],
            attempt=attempt,
            operation_id=event["operation_id"],
            payload=event.get("payload", {}),
            resource_refs=event.get("resource_refs", ()),
        )

    return project


def _bind_context(
    host: SimpleNamespace,
    partials: list[tuple[str, object, Exception]],
    *,
    references: PupuWorkspaceReferenceAuthorizer | None = None,
):
    return bind_pupu_context_module(
        admission=_admission(host.scope),
        execution=host.execution,
        reference_authorizer=references or host.references,
        task_state_binding_id=f"context-{host.scope.owner_chat_id}",
        event_projector=_projector(host.scope),
        partial_attempt_sink=lambda boundary, source, error: partials.append(
            (boundary, source, error)
        ),
    )


def _event_count(store: MemoryV2Store, owner_chat_id: str) -> int:
    with store._read() as connection:
        return int(
            connection.execute(
                "SELECT COUNT(*) AS count FROM events WHERE owner_chat_id=?",
                (owner_chat_id,),
            ).fetchone()["count"]
        )


def _context_build_count(store: MemoryV2Store, owner_chat_id: str) -> int:
    with store._read() as connection:
        return int(
            connection.execute(
                "SELECT COUNT(*) AS count FROM context_builds WHERE owner_chat_id=?",
                (owner_chat_id,),
            ).fetchone()["count"]
        )


def _nested_ref_descriptor(
    ref: ResourceRef,
    *,
    depth: int,
    redundant_identities: bool = False,
):
    value = ref.to_dict()
    uri = f"pupu://artifact/{ref.resource_id}@{ref.revision}"
    for _ in range(depth):
        value = (
            {
                "ref": value,
                "uri": uri,
                "kind": ref.kind,
                "id": ref.resource_id,
                "revision": ref.revision,
            }
            if redundant_identities
            else {"ref": value}
        )
    return value


def _tool_result_event(
    ref_value,
    *,
    event_id: str,
    resource_refs: tuple[ResourceRef, ...],
) -> dict[str, object]:
    content = b'{"answer":42}'
    return {
        "type": "tool_result",
        "event_id": event_id,
        "operation_id": f"operation-{event_id}",
        "payload": {
            "call_id": f"call-{event_id}",
            "tool_name": "lookup",
            "result": {"answer": 42},
            "result_bytes": len(content),
            "result_sha256": hashlib.sha256(content).hexdigest(),
            "full_output_ref": ref_value,
        },
        "resource_refs": resource_refs,
    }


def test_nested_reference_depth_is_contract_invalid_before_append(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "descriptor-depth")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-descriptor-depth"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(PupuContextReferencePolicyError) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    _nested_ref_descriptor(artifact.ref, depth=17),
                    event_id="event-descriptor-depth",
                    resource_refs=(artifact.ref,),
                )
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_reference_identity_node_limit_is_contract_invalid(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "descriptor-nodes")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-descriptor-nodes"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(PupuContextReferencePolicyError) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    _nested_ref_descriptor(
                        artifact.ref,
                        depth=12,
                        redundant_identities=True,
                    ),
                    event_id="event-descriptor-nodes",
                    resource_refs=(artifact.ref,),
                )
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_extreme_reference_nesting_never_leaks_recursion_error() -> None:
    ref = ResourceRef("artifact", "extreme-depth", 1)
    descriptor = _nested_ref_descriptor(ref, depth=2_000)

    with pytest.raises(PupuContextReferencePolicyError) as raised:
        reference_policy._decode_ref(descriptor, path=("full_output_ref",))

    assert raised.value.code == "contract_invalid"


def test_unbound_journal_rejects_nonempty_resource_refs_before_append(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "unbound")
        forged = ResourceRef("artifact", "forged-artifact", 1)
        before = _event_count(store, host.scope.owner_chat_id)
        request = JournalAppendRequest(
            event_id="event-unbound-forged",
            event_type="business.event",
            attempt=AttemptRef(
                GenerationRef(host.scope.session_id, host.scope.generation_id),
                host.scope.attempt_id,
            ),
            operation=_operation("operation-unbound-forged"),
            payload={"note": "ordinary event"},
            resource_refs=(forged,),
        )

        with pytest.raises(JournalScopeError, match="reference policy"):
            host.execution.journal.append(request=request)

        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_must_ref_must_be_declared_by_the_same_event(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "same-event")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-same-event"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="declared by the same event",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    artifact.ref.to_dict(),
                    event_id="event-missing-declaration",
                    resource_refs=(),
                )
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_malformed_must_ref_fails_closed_before_append(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "malformed")
        binding = _bind_context(host, [])
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="malformed",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    "not-a-resource-reference",
                    event_id="event-malformed-ref",
                    resource_refs=(),
                )
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_cross_chat_memory_ref_is_rejected_before_append(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        target = _seed_host(store, "target")
        foreign = _seed_host(store, "foreign")
        note = foreign.workspace_binding.service.write_markdown(
            path="/private.md",
            description="Foreign private memory",
            content="private",
            expected_space_revision=1,
            source_refs=(foreign.seed_ref,),
            operation_id="foreign-private-note",
        )
        assert note.content_ref is not None
        binding = _bind_context(target, [])
        before = _event_count(store, target.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="authorized",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                {
                    "type": "interaction_requested",
                    "event_id": "event-cross-chat-memory",
                    "operation_id": "operation-cross-chat-memory",
                    "payload": {
                        "interaction_request": {
                            "interaction_id": "interaction-cross-chat",
                            "question": "Continue?",
                        },
                        "content_ref": note.content_ref.to_dict(),
                    },
                    "resource_refs": (note.content_ref,),
                }
            )

        assert raised.value.code == "unauthorized"
        assert _event_count(store, target.scope.owner_chat_id) == before
    finally:
        store.close()


def test_missing_artifact_ref_is_rejected_before_append(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "missing")
        binding = _bind_context(host, [])
        missing = ResourceRef("artifact", "missing-artifact", 1)
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="authorized",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    missing.to_dict(),
                    event_id="event-missing-artifact",
                    resource_refs=(missing,),
                )
            )

        assert raised.value.code == "unauthorized"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_free_text_ref_literals_roundtrip_without_reference_semantics(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "literal")
        binding = _bind_context(host, [])
        literal = {
            "full_output_ref": ResourceRef(
                "artifact",
                "literal-not-present",
                1,
            ).to_dict(),
            "uri": "pupu://artifact/literal-not-present@1",
        }

        binding.runtime.compose_event_callback(None)(
            {
                "type": "message.user",
                "event_id": "event-free-text-literal",
                "operation_id": "operation-free-text-literal",
                "payload": {"message": {"role": "user", "content": literal}},
            }
        )

        event = next(
            item
            for item in host.execution.journal.read(limit=100).events
            if item.event_id == "event-free-text-literal"
        )
        assert event.payload["message"]["content"] == literal
        assert event.resource_refs == ()

        request = binding.runtime.request_factory(
            SimpleNamespace(
                state=SimpleNamespace(
                    provider_state=SimpleNamespace(
                        provider="openai",
                        model="gpt-test",
                        max_context_window_tokens=16_384,
                    ),
                    iteration=0,
                ),
                event={"run_id": host.scope.attempt_id},
                latest_messages=lambda: (
                    {"role": "user", "content": "continue"},
                ),
            )
        )
        projected = next(
            item
            for item in request.semantic_events
            if item["event_id"] == "event-free-text-literal"
        )
        assert projected["message"]["content"] == literal
    finally:
        store.close()


def test_authorized_artifact_ref_roundtrips_through_the_bound_journal(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "roundtrip")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-roundtrip"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        binding.runtime.compose_event_callback(None)(
            _tool_result_event(
                artifact.ref.to_dict(),
                event_id="event-authorized-roundtrip",
                resource_refs=(artifact.ref,),
            )
        )

        event = next(
            item
            for item in host.execution.journal.read(limit=100).events
            if item.event_id == "event-authorized-roundtrip"
        )
        assert ResourceRef.from_dict(event.payload["full_output_ref"]) == artifact.ref
        assert event.resource_refs == (artifact.ref,)
    finally:
        store.close()


def test_authorizer_must_return_the_exact_requested_reference(
    tmp_path,
    monkeypatch,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "divergent")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-divergent"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        divergent = ResourceRef("artifact", "different-artifact", 1)
        monkeypatch.setattr(
            host.references,
            "authorize",
            lambda *, ref: divergent,
        )
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="changed reference",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    artifact.ref.to_dict(),
                    event_id="event-divergent-authorizer",
                    resource_refs=(artifact.ref,),
                )
            )

        assert raised.value.code == "unauthorized"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_context_binding_rejects_nonexact_or_foreign_authorizers(tmp_path) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        target = _seed_host(store, "binding-target")
        foreign = _seed_host(store, "binding-foreign")

        class DerivedAuthorizer(PupuWorkspaceReferenceAuthorizer):
            pass

        derived = DerivedAuthorizer(
            target.workspace,
            binding_id="derived-authorizer",
            execution=target.execution,
        )
        with pytest.raises(TypeError, match="exact PupuWorkspaceReferenceAuthorizer"):
            _bind_context(target, [], references=derived)
        with pytest.raises(PupuContextHostBindingError, match="authorizer.*execution"):
            _bind_context(target, [], references=foreign.references)
    finally:
        store.close()


@pytest.mark.parametrize("identity_container", ("uri", "ref"))
def test_descriptor_identity_mismatch_is_contract_invalid_before_append(
    tmp_path,
    identity_container: str,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, f"descriptor-{identity_container}")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation(f"artifact-descriptor-{identity_container}"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        descriptor = {
            identity_container: (
                f"pupu://artifact/{artifact.ref.resource_id}@1"
                if identity_container == "uri"
                else artifact.ref.to_dict()
            ),
            "kind": "artifact",
            "id": "different-artifact",
            "revision": 1,
        }
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="identit",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    descriptor,
                    event_id=f"event-descriptor-{identity_container}",
                    resource_refs=(artifact.ref,),
                )
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_unused_declared_ref_is_authorized_before_strict_contract_rejection(
    tmp_path,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "unused-declaration")
        binding = _bind_context(host, [])
        missing = ResourceRef("artifact", "unused-missing", 1)
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="authorized",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                {
                    "type": "business.event",
                    "event_id": "event-unused-declaration",
                    "operation_id": "operation-unused-declaration",
                    "payload": {"note": "does not use the declaration"},
                    "resource_refs": (missing,),
                }
            )

        assert raised.value.code == "unauthorized"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_authorized_declared_ref_without_semantic_slot_is_contract_invalid(
    tmp_path,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "authorized-unused-declaration")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-authorized-unused-declaration"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        before = _event_count(store, host.scope.owner_chat_id)

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="no semantic slot",
        ) as raised:
            binding.runtime.compose_event_callback(None)(
                {
                    "type": "business.event",
                    "event_id": "event-authorized-unused-declaration",
                    "operation_id": "operation-authorized-unused-declaration",
                    "payload": {"note": "does not use the declaration"},
                    "resource_refs": (artifact.ref,),
                }
            )

        assert raised.value.code == "contract_invalid"
        assert _event_count(store, host.scope.owner_chat_id) == before
    finally:
        store.close()


def test_authorizer_failure_has_stable_unavailable_taxonomy(
    tmp_path,
    monkeypatch,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "authorizer-unavailable")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-authorizer-unavailable"),
            preview="answer",
        )
        binding = _bind_context(host, [])
        monkeypatch.setattr(
            host.references,
            "authorize",
            lambda *, ref: (_ for _ in ()).throw(
                WorkspaceRepositoryError("reference backend unavailable")
            ),
        )

        with pytest.raises(PupuContextReferencePolicyError) as raised:
            binding.runtime.compose_event_callback(None)(
                _tool_result_event(
                    artifact.ref.to_dict(),
                    event_id="event-authorizer-unavailable",
                    resource_refs=(artifact.ref,),
                )
            )

        assert raised.value.code == "authorizer_unavailable"
    finally:
        store.close()


def test_poisoned_direct_store_event_marks_context_reference_partial_on_read(
    tmp_path,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "poisoned")
        partials: list[tuple[str, object, Exception]] = []
        binding = _bind_context(host, partials)
        missing = ResourceRef("artifact", "poisoned-missing", 1)
        store.append_semantic_event(
            owner_chat_id=host.scope.owner_chat_id,
            session_id=host.scope.session_id,
            attempt_id=host.scope.attempt_id,
            operation_id="direct-poisoned-event",
            expected_generation_id=host.scope.generation_id,
            event={
                "schema_version": "unchain.journal_event.v1",
                "event_id": "event-direct-poisoned",
                "type": "tool_result",
                "session_id": host.scope.session_id,
                "run_id": host.scope.attempt_id,
                "payload": _tool_result_event(
                    missing.to_dict(),
                    event_id="ignored-wrapper",
                    resource_refs=(missing,),
                )["payload"],
                "links": {
                    "resource_refs": [
                        f"pupu://artifact/{missing.resource_id}@{missing.revision}"
                    ]
                },
            },
        )

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="authorized",
        ) as raised:
            binding.runtime.request_factory(
                SimpleNamespace(
                    state=SimpleNamespace(
                        provider_state=SimpleNamespace(
                            provider="openai",
                            model="gpt-test",
                            max_context_window_tokens=16_384,
                        ),
                        iteration=0,
                    ),
                    event={"run_id": host.scope.attempt_id},
                    latest_messages=lambda: (
                        {"role": "user", "content": "continue"},
                    ),
                )
            )
        assert raised.value.code == "unauthorized"

        with pytest.raises(
            PupuContextReferencePolicyError,
            match="authorized",
        ) as repeated:
            host.execution.journal.read(limit=100)
        assert repeated.value.code == "unauthorized"

        assert len(partials) == 1
        boundary, source, error = partials[0]
        assert boundary == "context_reference"
        assert source.event_id == "event-direct-poisoned"
        assert error.args
        diagnostics = binding.admission.diagnostics()
        assert diagnostics["journal_status"] == "partial"
        assert diagnostics["context_build_status"] == "partial"
        assert diagnostics["persistence_boundary"] == "context_reference"
        assert diagnostics["persistence_error_code"] == "unauthorized"
    finally:
        store.close()


def test_over_limit_poisoned_read_marks_partial_once_and_blocks_context_build(
    tmp_path,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "poisoned-depth")
        artifact = host.execution.artifacts.put(
            content=b'{"answer":42}',
            media_type="application/json",
            operation=_operation("artifact-poisoned-depth"),
            preview="answer",
        )
        partials: list[tuple[str, object, Exception]] = []
        binding = _bind_context(host, partials)
        store.append_semantic_event(
            owner_chat_id=host.scope.owner_chat_id,
            session_id=host.scope.session_id,
            attempt_id=host.scope.attempt_id,
            operation_id="direct-poisoned-depth-event",
            expected_generation_id=host.scope.generation_id,
            event={
                "schema_version": "unchain.journal_event.v1",
                "event_id": "event-direct-poisoned-depth",
                "type": "tool_result",
                "session_id": host.scope.session_id,
                "run_id": host.scope.attempt_id,
                "payload": _tool_result_event(
                    _nested_ref_descriptor(artifact.ref, depth=17),
                    event_id="ignored-wrapper",
                    resource_refs=(artifact.ref,),
                )["payload"],
                "links": {
                    "resource_refs": [
                        f"pupu://artifact/{artifact.ref.resource_id}"
                        f"@{artifact.ref.revision}"
                    ]
                },
            },
        )
        builds_before = _context_build_count(store, host.scope.owner_chat_id)

        with pytest.raises(PupuContextReferencePolicyError) as raised:
            binding.runtime.request_factory(
                SimpleNamespace(
                    state=SimpleNamespace(
                        provider_state=SimpleNamespace(
                            provider="openai",
                            model="gpt-test",
                            max_context_window_tokens=16_384,
                        ),
                        iteration=0,
                    ),
                    event={"run_id": host.scope.attempt_id},
                    latest_messages=lambda: (
                        {"role": "user", "content": "continue"},
                    ),
                )
            )
        assert raised.value.code == "contract_invalid"

        with pytest.raises(PupuContextReferencePolicyError) as repeated:
            host.execution.journal.read(limit=100)
        assert repeated.value.code == "contract_invalid"
        assert _context_build_count(store, host.scope.owner_chat_id) == builds_before
        assert len(partials) == 1
        boundary, source, error = partials[0]
        assert boundary == "context_reference"
        assert source.event_id == "event-direct-poisoned-depth"
        assert getattr(error, "code", "") == "contract_invalid"
        diagnostics = binding.admission.diagnostics()
        assert diagnostics["journal_status"] == "partial"
        assert diagnostics["context_build_status"] == "partial"
        assert diagnostics["persistence_boundary"] == "context_reference"
        assert diagnostics["persistence_error_code"] == "contract_invalid"
    finally:
        store.close()


def test_bound_malformed_stored_declaration_keeps_contract_invalid_taxonomy(
    tmp_path,
) -> None:
    store = MemoryV2Store(tmp_path / "memory_v2")
    try:
        host = _seed_host(store, "poisoned-declaration")
        partials: list[tuple[str, object, Exception]] = []
        _bind_context(host, partials)
        store.append_semantic_event(
            owner_chat_id=host.scope.owner_chat_id,
            session_id=host.scope.session_id,
            attempt_id=host.scope.attempt_id,
            operation_id="direct-poisoned-declaration",
            expected_generation_id=host.scope.generation_id,
            event={
                "schema_version": "unchain.journal_event.v1",
                "event_id": "event-direct-poisoned-declaration",
                "type": "business.event",
                "session_id": host.scope.session_id,
                "run_id": host.scope.attempt_id,
                "payload": {"note": "poisoned declaration"},
                "links": {"resource_refs": ["not-a-canonical-reference"]},
            },
        )

        with pytest.raises(PupuContextReferencePolicyError) as raised:
            host.execution.journal.read(limit=100)
        assert raised.value.code == "contract_invalid"

        with pytest.raises(PupuContextReferencePolicyError) as repeated:
            host.execution.journal.read(limit=100)
        assert repeated.value.code == "contract_invalid"
        assert len(partials) == 1
        boundary, source, error = partials[0]
        assert boundary == "context_reference"
        assert source.event_id == "event-direct-poisoned-declaration"
        assert getattr(error, "code", "") == "contract_invalid"
    finally:
        store.close()
