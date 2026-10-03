"""Acceptance counterexamples using production wheel; mutations are temp-only."""
import json
import runpy
import tempfile
from dataclasses import replace
from pathlib import Path

import unchain.context.compiler as compiler
from unchain.context import ArtifactService
from unchain.journal import JournalAppendRequest
from unchain.persistence.sqlite_context_compiler_v2 import SQLiteContextCompilerV2Store
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store

f = runpy.run_path('/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/test_context_compile_coordinator.py')
print('compiler:', compiler.__file__)
base = f['_request'](pressured=False)
events = []

def add(kind, **payload):
    seq = len(events) + 1
    events.append(dict(type=kind, event_id=f'e-{seq}', store_seq=seq,
                       attempt_id='attempt-history', execution_id='execution-1',
                       generation_id='generation-1', run_id='attempt-history', **payload))

add('message.user', message={'role': 'user', 'content': 'Look up the invoice amount.'})
add('tool_call', call_id='lookup-1', tool_name='lookup', arguments={})
add('tool_result', call_id='lookup-1', tool_name='lookup',
    result={'preview': 'Invoice amount: USD 7319.42'},
    full_output_ref={'kind': 'artifact', 'id': 'invoice-artifact', 'revision': 1},
    result_bytes=27, result_sha256='a' * 64)
add('message.assistant', message={'role': 'assistant', 'content': 'Done.'})
add('message.user', message={'role': 'user', 'content': 'What is half that amount?'})
events[-1].update(attempt_id='attempt-1', run_id='attempt-1')
source = [e for e in events if e['type'].startswith('message.')]
request = replace(base, source_messages=tuple(e['message'] for e in source),
                  semantic_events=tuple(events),
                  source_event_ids=tuple(e['event_id'] for e in source),
                  source_event_store_seqs=tuple(e['store_seq'] for e in source))
result = f['_coordinator'](request=request).compile(request)
wire = json.dumps(result.messages, default=str)
print('followup:', json.dumps(dict(invoice_value_present='7319.42' in wire,
                                   checkpoint_count=len(result.envelope.checkpoint_refs),
                                   diagnostics=result.diagnostics), default=str))

base = f['_request'](pressured=True)
with tempfile.TemporaryDirectory() as directory:
    store = SQLiteContextV2Store(database_path=Path(directory) / 'context.sqlite',
                                object_directory=Path(directory) / 'objects')
    journal = store.bind_execution('execution-1')
    for event in f['_journal_for_request'](base).events:
        journal.append(request=JournalAppendRequest(event_id=event.event_id,
                       event_type=event.event_type, attempt=event.attempt,
                       operation=event.operation, payload=event.payload))
    artifacts = ArtifactService(journal, sanitizer=lambda content, media_type: content)
    ports = SQLiteContextCompilerV2Store(context_store=store).bind_execution(
        'execution-1', artifacts=artifacts)
    coordinator = f['_coordinator'](request=base, journal=journal, checkpoints=ports.checkpoints)
    coordinator.compile(base)
    coordinator.compile(base)
    objects = list(store.object_directory.iterdir())
    print('checkpoint object count:', len(objects))
    for path in objects:
        path.write_bytes(b'corrupted audit fixture')
    for name, subject in (
        ('warm', coordinator),
        ('cold', f['_coordinator'](request=base, journal=journal, checkpoints=ports.checkpoints)),
    ):
        try:
            compiled = subject.compile(base)
            print(name, 'after object corruption: ACCEPTED', len(compiled.envelope.checkpoint_refs))
        except Exception as error:
            print(name, 'after object corruption:', type(error).__name__, str(error))
