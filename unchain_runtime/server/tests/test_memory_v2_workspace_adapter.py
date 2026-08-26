from __future__ import annotations

import inspect
import sqlite3

import pytest

import memory_v2_workspace_adapter as workspace_adapter
from context_memory_v2_repository import (
    PupuContextMemoryV2Repository,
    PupuExecutionCapabilities,
    PupuExecutionScope,
)
from memory_v2_store import MemoryV2Error, MemoryV2Store, SCHEMA_VERSION
from unchain.journal import OperationRef, ResourceRef
from unchain.memory.workspace import MemoryEntry, MemoryEntryKind
from unchain.memory.workspace.ports import (
    BoundWorkspaceContentRepository,
    BoundWorkspaceHistoryRepository,
    BoundWorkspaceMutationRepository,
    BoundWorkspaceReferenceAuthorizer,
    RepositoryConflictError,
    RepositoryNotFoundError,
    RepositoryScopeError,
    WorkspaceMutationRequest,
    WorkspaceRepositoryError,
)


SHA_A = "a" * 64


def _operation(identifier: str) -> OperationRef:
    return OperationRef(identifier, SHA_A)


def _append_event(
    store: MemoryV2Store,
    *,
    owner_chat_id: str,
    session_id: str,
    attempt_id: str,
    event_id: str,
    operation_id: str,
):
    return store.append_semantic_event(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        attempt_id=attempt_id,
        event={
            "event_id": event_id,
            "type": "message.user",
            "data": {"content": event_id},
        },
        operation_id=operation_id,
    )


@pytest.fixture()
def bound_workspace(tmp_path):
    store = MemoryV2Store(tmp_path / "memory_v2")
    seed = _append_event(
        store,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        event_id="event-seed",
        operation_id="seed-event",
    )
    host = PupuContextMemoryV2Repository(store)
    execution = host.bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-a",
            session_id="session-a",
            generation_id=seed["generation_id"],
            attempt_id="attempt-a",
        )
    )
    repository = host.ensure_chat_workspace(
        owner_chat_id="chat-a",
        name="Chat Memory",
        description="Bound chat workspace",
        operation=_operation("ensure-chat-workspace"),
    )
    binding = workspace_adapter.bind_pupu_memory_workspace_service(
        repository,
        binding_id="run-binding-a",
        execution=execution,
    )
    try:
        yield workspace_adapter, store, execution, repository, binding
    finally:
        store.close()


def _entry_ref(entry: MemoryEntry) -> ResourceRef:
    return ResourceRef("memory", entry.entry_id, entry.revision, entry.space_id)


def _operation_count(store: MemoryV2Store, operation_id: str) -> int:
    with sqlite3.connect(store.db_path) as connection:
        return int(
            connection.execute(
                "SELECT COUNT(*) FROM operations WHERE operation_id=?",
                (operation_id,),
            ).fetchone()[0]
        )


def _workspace_revisions(
    store: MemoryV2Store,
    *,
    space_id: str,
    entry_id: str = "",
) -> tuple[int, int, int]:
    with sqlite3.connect(store.db_path) as connection:
        space_revision = int(
            connection.execute(
                "SELECT revision FROM spaces WHERE space_id=?",
                (space_id,),
            ).fetchone()[0]
        )
        if not entry_id:
            return space_revision, 0, 0
        row = connection.execute(
            "SELECT revision FROM entries WHERE entry_id=? AND space_id=?",
            (entry_id, space_id),
        ).fetchone()
        revision_count = int(
            connection.execute(
                "SELECT COUNT(*) FROM entry_revisions WHERE entry_id=?",
                (entry_id,),
            ).fetchone()[0]
        )
        return space_revision, int(row[0]) if row is not None else 0, revision_count


def _workspace_object_state(store: MemoryV2Store) -> tuple[object, ...]:
    with sqlite3.connect(store.db_path) as connection:
        staged_count = int(
            connection.execute(
                "SELECT COUNT(*) FROM object_staging WHERE state='staged'"
            ).fetchone()[0]
        )
        objects = tuple(
            connection.execute(
                "SELECT object_id, byte_size, state FROM objects ORDER BY object_id"
            ).fetchall()
        )
    temporary_files = tuple(
        sorted(path.name for path in store.tmp_dir.iterdir() if path.is_file())
    )
    published_files = tuple(
        sorted(
            str(path.relative_to(store.objects_dir))
            for path in store.objects_dir.rglob("*")
            if path.is_file()
        )
    )
    return staged_count, objects, temporary_files, published_files


def _rebase_bound_execution(
    store: MemoryV2Store,
    execution: PupuExecutionCapabilities,
    *,
    suffix: str,
) -> dict[str, object]:
    scope = execution.scope
    store.seal_task(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id=scope.attempt_id,
        outcome="completed",
        operation_id=f"seal-{suffix}",
    )
    head = store.get_session_head(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
    )
    return store.rebase_session(
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        replacement_history=[{"role": "user", "content": f"rebase {suffix}"}],
        source_generation_id=scope.generation_id,
        expected_session_revision=head["session_revision"],
        operation_id=f"rebase-{suffix}",
        reason="edit",
    )


def test_binding_constructs_the_unchain_workspace_vertical_slice(bound_workspace):
    adapter, _store, _execution, repository, binding = bound_workspace

    assert binding.repository is repository
    assert isinstance(binding.mutations, BoundWorkspaceMutationRepository)
    assert isinstance(binding.content, BoundWorkspaceContentRepository)
    assert isinstance(binding.history, BoundWorkspaceHistoryRepository)
    assert isinstance(binding.references, BoundWorkspaceReferenceAuthorizer)
    assert binding.service.repository is repository
    assert binding.references.binding_id == "run-binding-a"
    assert binding.service.binding_id == "run-binding-a"
    assert binding.relation_links_available is False
    assert adapter.SCHEMA_V4_MAX_ENTRY_SOURCE_REFS == 1


def test_binding_rejects_an_untyped_host_run_scope(bound_workspace):
    adapter, _store, _execution, repository, _binding = bound_workspace

    with pytest.raises(TypeError, match="PupuExecutionCapabilities"):
        adapter.bind_pupu_memory_workspace_service(
            repository,
            binding_id="run-binding-untyped",
            execution=object(),
        )


def test_mutation_capability_rejects_a_foreign_reference_authorizer(bound_workspace):
    adapter, store, _execution, repository, _binding = bound_workspace
    foreign_seed = _append_event(
        store,
        owner_chat_id="chat-b",
        session_id="session-b",
        attempt_id="attempt-b",
        event_id="event-chat-b-binding",
        operation_id="seed-chat-b-binding",
    )
    foreign_repository = PupuContextMemoryV2Repository(store).ensure_chat_workspace(
        owner_chat_id="chat-b",
        name="Foreign Chat Memory",
        description="Foreign reference authorizer workspace",
        operation=_operation("ensure-foreign-binding-workspace"),
    )
    foreign_execution = PupuContextMemoryV2Repository(store).bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-b",
            session_id="session-b",
            generation_id=foreign_seed["generation_id"],
            attempt_id="attempt-b",
        )
    )
    foreign_references = adapter.PupuWorkspaceReferenceAuthorizer(
        foreign_repository,
        binding_id="run-binding-b",
        execution=foreign_execution,
    )

    with pytest.raises(RepositoryScopeError, match="different workspace"):
        adapter.PupuWorkspaceMutationRepository(
            repository,
            references=foreign_references,
            execution=_execution,
        )


def test_service_writes_reads_replays_and_lists_revision_history(bound_workspace):
    _adapter, _store, _execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)

    folder = binding.service.create_folder(
        path="/notes",
        description="Notes retained for this chat",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-create-folder",
    )
    assert folder.updated_seq == 2
    assert folder.source_refs == (source,)
    assert repository.space.revision == 2

    note = binding.service.write_markdown(
        path="/notes/brief.md",
        description="Current project brief and decisions",
        content="# Brief\n\nFirst version.\n",
        expected_space_revision=2,
        source_refs=(source,),
        operation_id="workspace-create-note",
    )
    assert note.revision == 1
    assert note.updated_seq == 3
    assert note.content_ref == _entry_ref(note)
    assert binding.service.read(_entry_ref(note)).data == b"# Brief\n\nFirst version.\n"

    updated = binding.service.write_markdown(
        entry_ref=_entry_ref(note),
        path="/notes/brief.md",
        description="Current project brief and decisions",
        content="# Brief\n\nSecond version.\n",
        expected_space_revision=3,
        source_refs=(source,),
        operation_id="workspace-update-note",
    )
    replay = binding.service.write_markdown(
        entry_ref=_entry_ref(note),
        path="/notes/brief.md",
        description="Current project brief and decisions",
        content="# Brief\n\nSecond version.\n",
        expected_space_revision=3,
        source_refs=(source,),
        operation_id="workspace-update-note",
    )
    assert replay == updated
    assert repository.space.revision == 4
    assert (
        binding.service.read(_entry_ref(updated), offset=9, limit=6).data
        == b"Second"
    )
    assert [item.revision for item in binding.service.history(_entry_ref(updated))] == [
        2,
        1,
    ]
    assert binding.service.read(note.content_ref).data == b"# Brief\n\nFirst version.\n"


def test_unchain_service_owns_history_domain_bounds(bound_workspace):
    _adapter, _store, _execution, _repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.write_markdown(
        path="/history-policy.md",
        description="History domain policy belongs to Unchain",
        content="first revision",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-history-policy",
    )
    ref = _entry_ref(note)

    with pytest.raises(ValueError, match="limit"):
        binding.service.history(ref, limit=51)
    with pytest.raises(ValueError, match="before_revision"):
        binding.service.history(ref, before_revision=0)

    assert binding.history.list_revisions(ref=ref, limit=51) == (note,)
    assert binding.history.list_revisions(
        ref=ref,
        before_revision=0,
        limit=51,
    ) == ()


def test_schema_v4_rejects_multi_or_non_event_provenance_before_mutation(
    bound_workspace,
):
    adapter, store, execution, repository, binding = bound_workspace
    _append_event(
        store,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        event_id="event-second",
        operation_id="seed-second-event",
    )
    first = ResourceRef("context_event", "event-seed", 1)
    second = ResourceRef("context_event", "event-second", 1)
    artifact = execution.artifacts.put(
        content=b"artifact provenance",
        media_type="text/plain",
        operation=_operation("workspace-source-artifact"),
    )

    assert binding.references.authorize(ref=first) == first
    assert binding.references.authorize(ref=artifact.ref) == artifact.ref
    before = store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )
    for operation_id, source_refs in (
        ("workspace-multiple-sources", (first, second)),
        ("workspace-artifact-source", (artifact.ref,)),
    ):
        with pytest.raises(
            adapter.SchemaV4WorkspaceCapabilityError,
            match="one canonical context event",
        ):
            binding.service.create_folder(
                path=f"/{operation_id}",
                description="Must fail without a partial durable write",
                expected_space_revision=1,
                source_refs=source_refs,
                operation_id=operation_id,
            )
    after = store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )
    assert before == after
    assert repository.space.revision == 1


def test_schema_v4_archive_fails_closed_before_losing_fresh_provenance(
    bound_workspace,
):
    adapter, store, _execution, repository, binding = bound_workspace
    _append_event(
        store,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        event_id="event-archive",
        operation_id="seed-archive-event",
    )
    created = binding.service.create_folder(
        path="/archive-me",
        description="Folder whose archive needs provenance",
        expected_space_revision=1,
        source_refs=(ResourceRef("context_event", "event-seed", 1),),
        operation_id="workspace-create-archive-target",
    )
    with pytest.raises(
        adapter.SchemaV4WorkspaceCapabilityError,
        match="archive provenance",
    ):
        binding.service.archive(
            ref=_entry_ref(created),
            expected_space_revision=2,
            source_refs=(ResourceRef("context_event", "event-archive", 1),),
            operation_id="workspace-archive-target",
        )
    current = repository.read_current_entry(entry_id=created.entry_id)
    assert current == created
    assert repository.space.revision == 2


def test_reference_authorizer_is_owner_bound_and_rejects_ambiguous_events(
    bound_workspace,
):
    _adapter, store, _execution, _repository, binding = bound_workspace
    foreign = ResourceRef("context_event", "event-foreign", 1)
    _append_event(
        store,
        owner_chat_id="chat-b",
        session_id="session-b",
        attempt_id="attempt-b",
        event_id=foreign.resource_id,
        operation_id="seed-foreign-event",
    )
    with pytest.raises(RepositoryNotFoundError):
        binding.references.authorize(ref=foreign)

    ambiguous = ResourceRef("context_event", "event-ambiguous", 1)
    for suffix in ("one", "two"):
        _append_event(
            store,
            owner_chat_id="chat-a",
            session_id="session-a",
            attempt_id=f"attempt-ambiguous-{suffix}",
            event_id=ambiguous.resource_id,
            operation_id=f"seed-ambiguous-{suffix}",
        )
    with pytest.raises(RepositoryNotFoundError):
        binding.references.authorize(ref=ambiguous)
    with pytest.raises(RepositoryScopeError):
        binding.references.authorize(
            ref=ResourceRef("context_event", "event-seed", 1, "content")
        )


def test_content_and_history_capabilities_hide_foreign_workspace_refs(
    bound_workspace,
):
    adapter, store, _execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.write_markdown(
        path="/private.md",
        description="Owner scoped private note",
        content="private",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-private-note",
    )
    _append_event(
        store,
        owner_chat_id="chat-b",
        session_id="session-b",
        attempt_id="attempt-b",
        event_id="event-chat-b",
        operation_id="seed-chat-b",
    )
    foreign_repository = PupuContextMemoryV2Repository(store).ensure_chat_workspace(
        owner_chat_id="chat-b",
        name="Other Chat Memory",
        description="Foreign bound workspace",
        operation=_operation("ensure-chat-b-workspace"),
    )
    foreign_head = store.get_session_head(
        owner_chat_id="chat-b",
        session_id="session-b",
    )
    foreign_execution = PupuContextMemoryV2Repository(store).bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-b",
            session_id="session-b",
            generation_id=foreign_head["current_generation_id"],
            attempt_id="attempt-b",
        )
    )
    foreign_binding = adapter.bind_pupu_memory_workspace_service(
        foreign_repository,
        binding_id="run-binding-b",
        execution=foreign_execution,
    )

    with pytest.raises(RepositoryScopeError):
        foreign_binding.content.read_content(ref=note.content_ref)
    with pytest.raises(RepositoryScopeError):
        foreign_binding.history.list_revisions(ref=_entry_ref(note))
    assert repository.read_entry(ref=_entry_ref(note)) == note


def test_relation_links_and_file_move_are_explicitly_unavailable_in_this_slice(
    bound_workspace,
):
    adapter, _store, _execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.write_markdown(
        path="/move-me.md",
        description="File whose content reference must remain exact",
        content="body",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-create-move-target",
    )
    with pytest.raises(
        adapter.SchemaV4WorkspaceCapabilityError,
        match="content reference",
    ):
        binding.service.move(
            ref=_entry_ref(note),
            new_path="/moved.md",
            expected_space_revision=2,
            source_refs=(source,),
            operation_id="workspace-move-file",
        )
    assert repository.read_current_entry(entry_id=note.entry_id) == note

    folder = binding.service.create_folder(
        path="/relation-source",
        description="Relation source folder",
        expected_space_revision=2,
        source_refs=(source,),
        operation_id="workspace-link-source",
    )
    with pytest.raises(
        adapter.SchemaV4WorkspaceCapabilityError,
        match="relation links",
    ):
        binding.service.link(
            source_ref=_entry_ref(folder),
            target_ref=_entry_ref(note),
            relation="related_to",
            expected_space_revision=3,
            source_refs=(source,),
            operation_id="workspace-relation-link",
        )
    assert binding.relation_links_available is False


def test_adapter_preserves_schema_v4_layout(bound_workspace):
    _adapter, store, _execution, _repository, binding = bound_workspace
    with sqlite3.connect(store.db_path) as connection:
        before = tuple(
            connection.execute(
                "SELECT type, name, tbl_name, COALESCE(sql, '') FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            ).fetchall()
        )
        before_version = connection.execute("PRAGMA user_version").fetchone()[0]
    binding.service.create_folder(
        path="/schema-check",
        description="Schema preserving adapter write",
        expected_space_revision=1,
        source_refs=(ResourceRef("context_event", "event-seed", 1),),
        operation_id="workspace-schema-check",
    )
    with sqlite3.connect(store.db_path) as connection:
        after = tuple(
            connection.execute(
                "SELECT type, name, tbl_name, COALESCE(sql, '') FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            ).fetchall()
        )
        after_version = connection.execute("PRAGMA user_version").fetchone()[0]
    assert before == after
    assert before_version == after_version == SCHEMA_VERSION == 4


def test_direct_mutation_rejects_divergent_sequence_before_store_write(bound_workspace):
    _adapter, store, _execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    entry = MemoryEntry(
        entry_id="memory-direct-sequence",
        space_id=repository.space.space_id,
        path="/sequence.md",
        name="sequence.md",
        description="Divergent sequence must not persist",
        kind=MemoryEntryKind.MARKDOWN,
        revision=1,
        updated_seq=9,
        source_refs=(source,),
        media_type="text/markdown",
    )
    request = WorkspaceMutationRequest(
        entry=entry,
        expected_revision=None,
        expected_space_revision=1,
        operation=_operation("workspace-divergent-sequence"),
        content=b"body",
    )
    with pytest.raises(WorkspaceRepositoryError, match="updated sequence"):
        binding.mutations.apply(request=request)
    assert store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )["entries"] == []


def test_event_provenance_must_belong_to_the_exact_bound_attempt(bound_workspace):
    _adapter, store, _execution, _repository, binding = bound_workspace
    _append_event(
        store,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-sibling",
        event_id="event-sibling-attempt",
        operation_id="seed-sibling-attempt",
    )

    with pytest.raises(RepositoryNotFoundError, match="bound attempt"):
        binding.references.authorize(
            ref=ResourceRef("context_event", "event-sibling-attempt", 1)
        )


def test_binding_rejects_a_nonexistent_attempt(bound_workspace):
    adapter, store, _execution, repository, _binding = bound_workspace
    head = store.get_session_head(owner_chat_id="chat-a", session_id="session-a")
    nonexistent = PupuContextMemoryV2Repository(store).bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-a",
            session_id="session-a",
            generation_id=head["current_generation_id"],
            attempt_id="attempt-does-not-exist",
        )
    )

    with pytest.raises(RepositoryScopeError, match="attempt"):
        adapter.bind_pupu_memory_workspace_service(
            repository,
            binding_id="run-binding-missing-attempt",
            execution=nonexistent,
        )


def test_binding_rejects_a_stale_generation(bound_workspace):
    adapter, store, execution, repository, _binding = bound_workspace
    store.seal_task(
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        outcome="completed",
        operation_id="seal-before-workspace-rebase",
    )
    head = store.get_session_head(owner_chat_id="chat-a", session_id="session-a")
    store.rebase_session(
        owner_chat_id="chat-a",
        session_id="session-a",
        replacement_history=[{"role": "user", "content": "Replacement task"}],
        source_generation_id=head["current_generation_id"],
        expected_session_revision=head["session_revision"],
        operation_id="rebase-before-workspace-binding",
        reason="edit",
    )

    with pytest.raises(RepositoryScopeError, match="generation"):
        adapter.bind_pupu_memory_workspace_service(
            repository,
            binding_id="run-binding-stale-generation",
            execution=execution,
        )


def test_tags_fail_closed_without_a_schema_v4_write(bound_workspace):
    adapter, store, _execution, repository, binding = bound_workspace

    with pytest.raises(
        adapter.SchemaV4WorkspaceCapabilityError,
        match="tags",
    ):
        binding.service.create_folder(
            path="/tagged-notes",
            description="Tagged notes require lossless tag persistence",
            expected_space_revision=1,
            source_refs=(ResourceRef("context_event", "event-seed", 1),),
            operation_id="workspace-tagged-folder",
            tags=("project",),
        )
    assert store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )["entries"] == []


def test_content_adapter_preserves_the_exact_pupu_uri_bytes(
    bound_workspace,
    monkeypatch,
):
    _adapter, store, _execution, _repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.write_markdown(
        path="/uri-byte-check.md",
        description="Exact public URI byte preservation check",
        content="uri bytes",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-uri-byte-check",
    )
    expected_uri = (
        f"pupu://memory/{note.space_id}/{note.entry_id}@{note.revision}"
    )
    original = store.read_scoped_content
    observed = []

    def capture_ref(**kwargs):
        observed.append(kwargs["ref"])
        return original(**kwargs)

    monkeypatch.setattr(store, "read_scoped_content", capture_ref)
    page = binding.content.read_content(ref=note.content_ref)

    assert observed == [expected_uri]
    assert page.ref == note.content_ref
    assert page.data == b"uri bytes"


def test_workspace_redaction_happens_before_the_durable_mutation(bound_workspace):
    _adapter, store, _execution, repository, binding = bound_workspace
    secret = "sk-proj-abcdefghijk"
    before = store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )

    entry = binding.service.write_markdown(
        path="/redaction-atomicity.md",
        description=f"api_key={secret}",
        content=f"api_key={secret}",
        expected_space_revision=1,
        source_refs=(ResourceRef("context_event", "event-seed", 1),),
        operation_id="workspace-redaction-atomicity",
    )

    after = store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )
    content = binding.service.read(_entry_ref(entry)).data

    assert len(after["entries"]) == len(before["entries"]) + 1
    assert repository.read_current_entry(entry_id=entry.entry_id) == entry
    assert secret not in entry.description
    assert secret.encode("utf-8") not in content
    assert b"[REDACTED]" in content


def test_workspace_redaction_failure_leaves_no_durable_partial_entry(
    bound_workspace,
    monkeypatch,
):
    adapter, store, _execution, repository, binding = bound_workspace
    before = store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    )

    def fail_redaction(*_args, **_kwargs):
        raise RuntimeError("synthetic sanitizer failure")

    monkeypatch.setattr(adapter, "sanitize_for_storage", fail_redaction)
    with pytest.raises(WorkspaceRepositoryError, match="content redaction failed"):
        binding.service.write_markdown(
            path="/redaction-failure.md",
            description="Must fail before the mutation transaction",
            content="plain text",
            expected_space_revision=1,
            source_refs=(ResourceRef("context_event", "event-seed", 1),),
            operation_id="workspace-redaction-failure",
        )

    assert store.list_entries(
        owner_chat_id="chat-a",
        space_id=repository.space.space_id,
    ) == before


def test_mutation_capability_captures_the_exact_execution_binding(
    bound_workspace,
) -> None:
    adapter, store, execution, repository, binding = bound_workspace

    assert binding.mutations._execution is execution
    with pytest.raises(TypeError, match="PupuExecutionCapabilities"):
        adapter.PupuWorkspaceMutationRepository(
            repository,
            references=binding.references,
            execution=object(),
        )
    equivalent_but_distinct = PupuExecutionCapabilities(
        journal=execution.journal,
        artifacts=execution.artifacts,
        checkpoints=execution.checkpoints,
        context_builds=execution.context_builds,
    )
    with pytest.raises(RepositoryScopeError, match="exact execution capability"):
        adapter.PupuWorkspaceMutationRepository(
            repository,
            references=binding.references,
            execution=equivalent_but_distinct,
        )

    sibling = _append_event(
        store,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-sibling-capability",
        event_id="event-sibling-capability",
        operation_id="seed-sibling-capability",
    )
    sibling_execution = PupuContextMemoryV2Repository(store).bind_execution(
        PupuExecutionScope(
            owner_chat_id="chat-a",
            session_id="session-a",
            generation_id=sibling["generation_id"],
            attempt_id="attempt-sibling-capability",
        )
    )
    with pytest.raises(RepositoryScopeError, match="execution"):
        adapter.PupuWorkspaceMutationRepository(
            repository,
            references=binding.references,
            execution=sibling_execution,
        )


def test_adapter_passes_the_exact_execution_scope_to_the_store(
    bound_workspace,
    monkeypatch,
) -> None:
    _adapter, store, execution, repository, binding = bound_workspace
    captured = {}
    original = store.create_entry

    def capture_scope(**kwargs):
        captured.update(
            {
                "session_id": kwargs.get("expected_session_id"),
                "generation_id": kwargs.get("expected_generation_id"),
                "attempt_id": kwargs.get("expected_attempt_id"),
            }
        )
        return original(**kwargs)

    monkeypatch.setattr(store, "create_entry", capture_scope)
    binding.service.create_folder(
        path="/scope-forwarding",
        description="The immutable execution scope reaches the store fence",
        expected_space_revision=1,
        source_refs=(ResourceRef("context_event", "event-seed", 1),),
        operation_id="workspace-scope-forwarding",
    )

    assert captured == {
        "session_id": execution.scope.session_id,
        "generation_id": execution.scope.generation_id,
        "attempt_id": execution.scope.attempt_id,
    }
    assert repository.space.revision == 2


def test_create_rebase_between_authorization_and_write_is_atomic(
    bound_workspace,
    monkeypatch,
) -> None:
    _adapter, store, execution, repository, binding = bound_workspace
    original = store.create_entry

    def rebase_then_create(**kwargs):
        _rebase_bound_execution(store, execution, suffix="workspace-create-race")
        return original(**kwargs)

    monkeypatch.setattr(store, "create_entry", rebase_then_create)
    operation_id = "workspace-create-after-rebase"
    before_objects = _workspace_object_state(store)

    with pytest.raises(RepositoryConflictError, match="execution binding"):
        binding.service.write_markdown(
            path="/stale-create.md",
            description="Must not cross a generation rebase",
            content="must not remain staged or become published",
            expected_space_revision=1,
            source_refs=(ResourceRef("context_event", "event-seed", 1),),
            operation_id=operation_id,
        )

    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
    ) == (1, 0, 0)
    assert _operation_count(store, operation_id) == 0
    assert _workspace_object_state(store) == before_objects


def test_update_rebase_between_authorization_and_write_is_atomic(
    bound_workspace,
    monkeypatch,
) -> None:
    _adapter, store, execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.write_markdown(
        path="/stale-update.md",
        description="Initial durable revision",
        content="before",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-update-race-seed",
    )
    before = _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=note.entry_id,
    )
    original = store.update_entry

    def rebase_then_update(**kwargs):
        _rebase_bound_execution(store, execution, suffix="workspace-update-race")
        return original(**kwargs)

    monkeypatch.setattr(store, "update_entry", rebase_then_update)
    operation_id = "workspace-update-after-rebase"
    before_objects = _workspace_object_state(store)

    with pytest.raises(RepositoryConflictError, match="execution binding"):
        binding.service.write_markdown(
            entry_ref=_entry_ref(note),
            path=note.path,
            description="Must remain at the original revision",
            content="after",
            expected_space_revision=note.updated_seq,
            source_refs=(source,),
            operation_id=operation_id,
        )

    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=note.entry_id,
    ) == before
    assert _operation_count(store, operation_id) == 0
    assert _workspace_object_state(store) == before_objects


@pytest.mark.parametrize(
    "execution_kwargs",
    (
        {"expected_session_id": "session-a"},
        {
            "expected_session_id": "session-a",
            "expected_generation_id": "generation-placeholder",
        },
        {"expected_attempt_id": "attempt-a"},
    ),
)
def test_create_execution_fence_arguments_are_all_or_none(
    bound_workspace,
    execution_kwargs,
) -> None:
    _adapter, store, _execution, repository, _binding = bound_workspace
    operation_id = "workspace-partial-create-" + "-".join(execution_kwargs)

    with pytest.raises(MemoryV2Error) as raised:
        store.create_entry(
            owner_chat_id="chat-a",
            space_id=repository.space.space_id,
            path=f"/{operation_id}",
            kind="folder",
            expected_space_revision=1,
            operation_id=operation_id,
            source_event_id="event-seed",
            **execution_kwargs,
        )

    assert raised.value.code == "context_v2_invalid_request"
    assert _operation_count(store, operation_id) == 0


@pytest.mark.parametrize(
    "execution_kwargs",
    (
        {"expected_session_id": "session-a"},
        {
            "expected_generation_id": "generation-placeholder",
            "expected_attempt_id": "attempt-a",
        },
        {"expected_attempt_id": "attempt-a"},
    ),
)
def test_update_execution_fence_arguments_are_all_or_none(
    bound_workspace,
    execution_kwargs,
) -> None:
    _adapter, store, _execution, repository, binding = bound_workspace
    source = ResourceRef("context_event", "event-seed", 1)
    note = binding.service.create_folder(
        path="/partial-update",
        description="Seed for partial execution arguments",
        expected_space_revision=1,
        source_refs=(source,),
        operation_id="workspace-partial-update-seed",
    )
    before = _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=note.entry_id,
    )
    operation_id = "workspace-partial-update-" + "-".join(execution_kwargs)

    with pytest.raises(MemoryV2Error) as raised:
        store.update_entry(
            owner_chat_id="chat-a",
            space_id=repository.space.space_id,
            entry_id=note.entry_id,
            expected_revision=note.revision,
            expected_space_revision=note.updated_seq,
            operation_id=operation_id,
            description="must not persist",
            source_event_id="event-seed",
            **execution_kwargs,
        )

    assert raised.value.code == "context_v2_invalid_request"
    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=note.entry_id,
    ) == before
    assert _operation_count(store, operation_id) == 0


def test_workspace_execution_fence_runs_inside_write_transaction_before_replay(
    bound_workspace,
    monkeypatch,
) -> None:
    _adapter, store, execution, repository, _binding = bound_workspace
    original_fence = getattr(
        type(store),
        "_require_workspace_execution_fence",
        None,
    )
    assert original_fence is not None, "store execution fence is missing"
    original_replay = store._receipt_replay
    observed = []

    def observe_fence(connection, **kwargs):
        observed.append(("fence", connection.in_transaction))
        return original_fence(connection, **kwargs)

    def observe_replay(connection, *args, **kwargs):
        observed.append(("replay", connection.in_transaction))
        return original_replay(connection, *args, **kwargs)

    monkeypatch.setattr(store, "_require_workspace_execution_fence", observe_fence)
    monkeypatch.setattr(store, "_receipt_replay", observe_replay)
    scope = execution.scope
    store.create_entry(
        owner_chat_id=scope.owner_chat_id,
        space_id=repository.space.space_id,
        path="/transaction-fence",
        kind="folder",
        expected_space_revision=1,
        operation_id="workspace-transaction-fence",
        source_event_id="event-seed",
        expected_session_id=scope.session_id,
        expected_generation_id=scope.generation_id,
        expected_attempt_id=scope.attempt_id,
    )

    assert observed[:2] == [("fence", True), ("replay", True)]


def test_stale_workspace_receipt_does_not_replay_after_rebase(
    bound_workspace,
) -> None:
    _adapter, store, execution, repository, _binding = bound_workspace
    scope = execution.scope
    arguments = {
        "owner_chat_id": scope.owner_chat_id,
        "space_id": repository.space.space_id,
        "path": "/stale-receipt",
        "kind": "folder",
        "expected_space_revision": 1,
        "operation_id": "workspace-stale-receipt",
        "source_event_id": "event-seed",
        "expected_session_id": scope.session_id,
        "expected_generation_id": scope.generation_id,
        "expected_attempt_id": scope.attempt_id,
    }
    created = store.create_entry(**arguments)
    before = _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=created["entry_id"],
    )
    _rebase_bound_execution(store, execution, suffix="workspace-stale-receipt")

    with pytest.raises(MemoryV2Error) as raised:
        store.create_entry(**arguments)

    assert raised.value.code == "context_v2_attempt_generation_conflict"
    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=created["entry_id"],
    ) == before
    assert _operation_count(store, arguments["operation_id"]) == 1


def test_workspace_execution_scope_participates_in_operation_intent(
    bound_workspace,
) -> None:
    _adapter, store, execution, repository, _binding = bound_workspace
    scope = execution.scope
    _append_event(
        store,
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id="attempt-same-event-sibling",
        event_id="event-seed",
        operation_id="seed-same-event-sibling",
    )
    arguments = {
        "owner_chat_id": scope.owner_chat_id,
        "space_id": repository.space.space_id,
        "path": "/scope-intent",
        "kind": "folder",
        "expected_space_revision": 1,
        "operation_id": "workspace-scope-intent",
        "source_event_id": "event-seed",
        "expected_session_id": scope.session_id,
        "expected_generation_id": scope.generation_id,
    }
    created = store.create_entry(
        **arguments,
        expected_attempt_id=scope.attempt_id,
    )

    with pytest.raises(MemoryV2Error) as raised:
        store.create_entry(
            **arguments,
            expected_attempt_id="attempt-same-event-sibling",
        )

    assert raised.value.code == "context_v2_operation_conflict"
    assert _operation_count(store, arguments["operation_id"]) == 1
    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
        entry_id=created["entry_id"],
    ) == (2, 1, 1)


def test_workspace_source_event_must_match_the_fenced_attempt(
    bound_workspace,
) -> None:
    _adapter, store, execution, repository, _binding = bound_workspace
    scope = execution.scope
    _append_event(
        store,
        owner_chat_id=scope.owner_chat_id,
        session_id=scope.session_id,
        attempt_id="attempt-source-sibling",
        event_id="event-source-sibling",
        operation_id="seed-source-sibling",
    )
    operation_id = "workspace-source-sibling"

    with pytest.raises(MemoryV2Error) as raised:
        store.create_entry(
            owner_chat_id=scope.owner_chat_id,
            space_id=repository.space.space_id,
            path="/sibling-source",
            kind="folder",
            expected_space_revision=1,
            operation_id=operation_id,
            source_event_id="event-source-sibling",
            expected_session_id=scope.session_id,
            expected_generation_id=scope.generation_id,
            expected_attempt_id=scope.attempt_id,
        )

    assert raised.value.code == "context_v2_invalid_source"
    assert _workspace_revisions(
        store,
        space_id=repository.space.space_id,
    ) == (1, 0, 0)
    assert _operation_count(store, operation_id) == 0


def test_delete_validates_visible_owner_scope_before_receipt_replay(
    bound_workspace,
) -> None:
    _adapter, store, _execution, repository, binding = bound_workspace
    created = binding.service.create_folder(
        path="/delete-scope",
        description="Host UI delete scope target",
        expected_space_revision=1,
        source_refs=(ResourceRef("context_event", "event-seed", 1),),
        operation_id="workspace-delete-scope-seed",
    )
    arguments = {
        "owner_chat_id": "chat-a",
        "space_id": repository.space.space_id,
        "entry_id": created.entry_id,
        "expected_revision": created.revision,
        "expected_space_revision": created.updated_seq,
        "operation_id": "workspace-delete-scope",
    }
    store.delete_entry(**arguments)
    with sqlite3.connect(store.db_path) as connection:
        connection.execute(
            "UPDATE spaces SET owner_chat_id='chat-foreign' WHERE space_id=?",
            (repository.space.space_id,),
        )

    with pytest.raises(MemoryV2Error) as raised:
        store.delete_entry(**arguments)

    assert raised.value.code == "context_v2_not_found"
    assert _operation_count(store, arguments["operation_id"]) == 1


def test_delete_entry_remains_host_ui_scoped_not_an_execution_mutation() -> None:
    parameters = inspect.signature(MemoryV2Store.delete_entry).parameters
    assert {
        "expected_session_id",
        "expected_generation_id",
        "expected_attempt_id",
    }.isdisjoint(parameters)
    assert "host/UI-scoped" in (MemoryV2Store.delete_entry.__doc__ or "")
