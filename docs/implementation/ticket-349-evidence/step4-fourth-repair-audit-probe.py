"""Bounded multi-turn compaction probe, production wheel with recording stores."""
import runpy
from dataclasses import replace

f = runpy.run_path('/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/test_context_compile_coordinator.py')
base = f['_request'](pressured=False)

for old_turns in (1, 2, 3):
    events = []

    def add(kind, **payload):
        seq = len(events) + 1
        events.append(dict(type=kind, event_id=f'event-{seq}', store_seq=seq,
                           execution_id='execution-1', generation_id='generation-1',
                           attempt_id='attempt-history', run_id='attempt-history', **payload))

    for turn in range(old_turns):
        add('message.user', message={'role': 'user', 'content': f'old task {turn}'})
        for pair in range(20):
            call_id = f'call-{turn}-{pair}'
            add('tool_call', call_id=call_id, tool_name='lookup', arguments={})
            add('tool_result', call_id=call_id, tool_name='lookup',
                result={'preview': 'z' * 1200},
                full_output_ref={'kind': 'artifact', 'id': f'output-{call_id}', 'revision': 1},
                result_bytes=1200, result_sha256='a' * 64)
        add('message.assistant', message={'role': 'assistant', 'content': 'Done.'})
    add('message.user', message={'role': 'user', 'content': 'current'})
    events[-1].update(attempt_id='attempt-1', run_id='attempt-1')
    source = [event for event in events if event['type'].startswith('message.')]
    request = replace(base, source_messages=tuple(event['message'] for event in source),
                      source_event_ids=tuple(event['event_id'] for event in source),
                      source_event_store_seqs=tuple(event['store_seq'] for event in source),
                      semantic_events=tuple(events))
    checkpoints = f['RecordingCheckpointRepository']()
    try:
        result = f['_coordinator'](request=request, checkpoints=checkpoints).compile(request)
        print(old_turns, 'old turns: OK; checkpoints:', len(checkpoints.calls),
              'omitted:', result.diagnostics['omitted_source_indexes'])
    except Exception as error:
        print(old_turns, 'old turns:', type(error).__name__, str(error),
              'checkpoints:', len(checkpoints.calls))
