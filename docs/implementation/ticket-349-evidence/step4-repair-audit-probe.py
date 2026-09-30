"""Read-only Step 4 counterexamples; all database writes use temporary stores.

Run with PYTHONPATH pointing at the retained wheel or candidate Unchain src.
"""
import runpy
import tempfile
from dataclasses import replace
from pathlib import Path

from unchain.context import ArtifactService
from unchain.journal import JournalAppendRequest
from unchain.persistence.sqlite_context_compiler_v2 import SQLiteContextCompilerV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


fixtures = runpy.run_path(
    '/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/test_context_compile_coordinator.py'
)
base = fixtures['_request'](pressured=True)

with tempfile.TemporaryDirectory() as directory:
    store = SQLiteContextV2Store(
        database_path=Path(directory) / 'context.sqlite',
        object_directory=Path(directory) / 'objects',
    )
    journal = store.bind_execution('execution-1')
    for event in fixtures['_journal_for_request'](base).events:
        journal.append(request=JournalAppendRequest(
            event_id=event.event_id, event_type=event.event_type,
            attempt=event.attempt, operation=event.operation, payload=event.payload,
        ))
    artifacts = ArtifactService(journal, sanitizer=lambda content, media_type: content)
    capabilities = SQLiteContextCompilerV2Store(context_store=store).bind_execution(
        'execution-1', artifacts=artifacts,
    )
    first = fixtures['_coordinator'](
        request=base, journal=journal, checkpoints=capabilities.checkpoints,
    ).compile(base)
    print('sqlite first checkpoint refs:', len(first.envelope.checkpoint_refs))
    try:
        fixtures['_coordinator'](
            request=base, journal=journal, checkpoints=capabilities.checkpoints,
        ).compile(base)
        print('sqlite repeat: OK')
    except Exception as error:
        print('sqlite repeat:', type(error).__name__, str(error))

messages = (
    {'role': 'user', 'content': 'old1 ' + 'x' * 30000},
    {'role': 'assistant', 'content': 'answer1'},
    {'role': 'user', 'content': 'old2 ' + 'y' * 30000},
    {'role': 'assistant', 'content': 'answer2'},
    {'role': 'user', 'content': 'current'},
)
request = replace(
    base, source_messages=messages,
    source_event_ids=tuple(f'event-{i}' for i in range(1, 6)),
    source_event_store_seqs=tuple(range(1, 6)),
)
checkpoints = fixtures['RecordingCheckpointRepository']()
first = fixtures['_coordinator'](request=request, checkpoints=checkpoints).compile(request)
print('two-turn checkpoint omitted:', first.diagnostics['omitted_source_indexes'])
larger = replace(request, budget=fixtures['resolve_context_budget'](context_window_tokens=131072))
try:
    fixtures['_coordinator'](request=larger, checkpoints=checkpoints).compile(larger)
    print('larger-window reuse: OK')
except Exception as error:
    print('larger-window reuse:', type(error).__name__, str(error))

checkpoints = fixtures['RecordingCheckpointRepository']()
fixtures['_coordinator'](request=base, checkpoints=checkpoints).compile(base)
growing = replace(
    base,
    source_messages=(
        *base.source_messages[:2],
        {'role': 'user', 'content': 'new large ' + 'z' * 30000},
        {'role': 'assistant', 'content': 'answer'},
        {'role': 'user', 'content': 'new'},
    ),
    source_event_ids=tuple(f'event-{i}' for i in range(1, 6)),
    source_event_store_seqs=tuple(range(1, 6)),
)
try:
    fixtures['_coordinator'](request=growing, checkpoints=checkpoints).compile(growing)
    print('growing suffix: OK')
except Exception as error:
    print('growing suffix:', type(error).__name__, str(error))
