"""Cold reconstruction of official memory capabilities; no foreground factory."""
from __future__ import annotations

import copy
import hashlib
from contextlib import contextmanager
from pathlib import Path
import uuid


@contextmanager
def memory_background_source_guard(*, database_path, owner_chat_id):
    """Serialize rebase with local memory tools; ordinary chat never takes it."""
    from session_execution_guard import _exclusive_file_lock
    root = Path(database_path).resolve().parent / "background_source_guards"
    root.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(owner_chat_id.encode("utf-8")).hexdigest()
    with _exclusive_file_lock(root / (key + ".lock")):
        yield


def build_background_memory_host(*, database_path, owner_chat_id, invoker_factory, stopped):
    # Reuse the exact URI codec/reference implementation without retaining a
    # request's host factory, current input resolver or runtime bundle.
    from memory_v2_unchain_runtime_factory import (
        _assert_chat_active, _stable_id, _PupuUnchainWorkspaceReferences,
        _PupuUnchainReferenceCodec, _PupuUnchainContextCapability,
    )
    from memory_v2_store_boundary import admit_context_v2_store_owner, STORE_OWNER_UNCHAIN
    from memory_v2_unchain_ownership_adapter import list_pupu_unchain_ownership_lifecycles
    from memory_v2_unchain_run_binding import _sanitize_workspace_draft
    from unchain.memory.curator.host import MemoryAgentHostAdapter, MemoryAgentHostConfig
    from unchain.memory.workspace import MemorySpace, MemoryWorkspaceService
    from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
    from unchain.persistence.sqlite_memory_v2 import SQLiteMemoryV2Store
    from unchain.persistence.sqlite_context_compiler_v2 import SQLiteContextCompilerV2Store
    from unchain.persistence.sqlite_read_v2 import SQLiteContextV2ReadService, ContextV2ReadScope
    from unchain.persistence.sqlite_curator_v2 import SQLiteCuratorV2Store
    from unchain.persistence.sqlite_memory_host_v2 import SQLiteConsolidationCapabilityFactory

    database = Path(database_path).resolve()
    objects = database.parent / "objects"
    _assert_chat_active(database_path=database, owner_chat_id=owner_chat_id)
    admit_context_v2_store_owner(root_dir=database.parent, requested_owner=STORE_OWNER_UNCHAIN)
    lifecycles = list_pupu_unchain_ownership_lifecycles(
        database_path=database, owner_chat_id=owner_chat_id, limit=10000)
    binding_id = _stable_id("binding-chat", owner_chat_id)
    space_id = _stable_id("space-chat", owner_chat_id)
    if not lifecycles or len(lifecycles) >= 10000 or any(
        item.binding_id != binding_id or item.chat_space_id != space_id for item in lifecycles
    ):
        raise ValueError("memory_background_lifecycle_invalid")
    context_store = SQLiteContextV2Store(database_path=database, object_directory=objects)
    memory_store = SQLiteMemoryV2Store(database_path=database, object_directory=objects)
    compiler_store = SQLiteContextCompilerV2Store(context_store=context_store)
    reader = SQLiteContextV2ReadService(context_store=context_store, memory_store=memory_store,
                                      compiler_store=compiler_store).bind(ContextV2ReadScope(
        owner_chat_id=owner_chat_id, execution_ids=tuple(sorted({item.execution_id for item in lifecycles})),
        space_id=space_id))
    def read_context():
        _assert_chat_active(database_path=database, owner_chat_id=owner_chat_id)
        return reader
    repository = memory_store.bind_workspace(space=MemorySpace(
        space_id=space_id, namespace="chat", name="Chat memory",
        description="PuPu chat Memory V2 workspace", revision=1), owner_chat_id=owner_chat_id)
    references = _PupuUnchainWorkspaceReferences(
        binding_id=binding_id, workspace_repository=repository, chat_space_id=space_id,
        context_reader_resolver=read_context)
    workspace = MemoryWorkspaceService(
        repository=repository, mutations=repository, content=repository, history=repository,
        links=repository, references=references, content_redactor=_sanitize_workspace_draft)
    codec = _PupuUnchainReferenceCodec(binding_id)
    context = _PupuUnchainContextCapability(binding_id=binding_id, context_reader_resolver=read_context)
    curation = SQLiteCuratorV2Store(database_path=database, object_directory=objects).bind_curation(
        binding_id=binding_id, owner_chat_id=owner_chat_id, target_space_id=space_id)
    capabilities = SQLiteConsolidationCapabilityFactory(
        binding_id=binding_id, database_path=database, repository=curation,
        workspace=workspace, references=codec, context=context)
    invoker = _CurrentSourceInvoker(invoker_factory(codec), database, owner_chat_id,
                                    context_store, lifecycles, stopped)
    return MemoryAgentHostAdapter(curation, capability_factory=capabilities, model_invoker=invoker,
                                 config=MemoryAgentHostConfig(enabled=True, lease_ms=600000,
                                     worker_id="memory-background-" + uuid.uuid4().hex))


class _CurrentSourceInvoker:
    """Recheck source authority around tools, never lock across model I/O."""
    def __init__(self, inner, database, owner, context_store, lifecycles, stopped):
        self.inner, self.database, self.owner = inner, database, owner
        self.context_store, self.lifecycles, self.stopped = context_store, lifecycles, stopped

    def run(self, request, *, toolkit, binding):
        from unchain.memory.curator import CuratorRunnerFailure, FailureRetryability
        from unchain.persistence.sqlite_generation_rebase_v2 import SQLiteGenerationRebaseV2Service
        from memory_v2_unchain_runtime_factory import _assert_chat_active
        from session_execution_guard import SessionExecutionGuardError
        trigger = request.job.trigger
        matches = [item for item in self.lifecycles if item.execution_id == trigger.session_id
                   and item.attempt_id == trigger.attempt_id and item.attempt_id == trigger.run_id]
        if len(matches) != 1:
            raise CuratorRunnerFailure("memory_background_source_scope_invalid")
        source = matches[0]
        service = SQLiteGenerationRebaseV2Service(self.context_store)
        def assert_current():
            if self.stopped.is_set():
                raise CuratorRunnerFailure("memory_background_stopping",
                    retryability=FailureRetryability.RETRYABLE, retry_delay_ms=60000)
            _assert_chat_active(database_path=self.database, owner_chat_id=self.owner)
            head = service.current(owner_chat_id=self.owner, execution_id=source.execution_id,
                                   session_id=source.session_id)
            if head is None or head.current_generation_id != source.generation_id:
                raise CuratorRunnerFailure("memory_background_source_superseded")
        assert_current()
        failure = []
        def wrap(function):
            def guarded(*args, **kwargs):
                try:
                    # Rebase shares this narrow lock. Ordinary foreground runs
                    # do not, so even simultaneous tool use cannot reject chat.
                    with memory_background_source_guard(database_path=self.database,
                                                        owner_chat_id=self.owner):
                        assert_current()
                        return function(*args, **kwargs)
                except SessionExecutionGuardError as error:
                    retry = CuratorRunnerFailure("memory_background_source_busy",
                        retryability=FailureRetryability.RETRYABLE, retry_delay_ms=60000)
                    failure.append(retry)
                    raise retry from error
                except CuratorRunnerFailure as error:
                    failure.append(error)
                    raise
            return guarded
        guarded_toolkit = copy.copy(toolkit)
        guarded_toolkit.tools = {}
        callables = {}
        for name, tool in toolkit.tools.items():
            clone = copy.copy(tool)
            clone.func = wrap(tool.func)
            guarded_toolkit.tools[name] = clone
            callables[name] = clone.func
        guarded_toolkit._unchain_memory_v2_callables = callables
        try:
            result = self.inner.run(request, toolkit=guarded_toolkit, binding=binding)
        except Exception:
            if failure:
                raise failure[0]
            raise
        if failure:
            raise failure[0]
        assert_current()
        return result
