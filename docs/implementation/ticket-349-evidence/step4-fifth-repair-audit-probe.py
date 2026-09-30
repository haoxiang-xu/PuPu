"""Checkpoint-overhead boundary probe, with production compiler/coordinator."""
import runpy
from dataclasses import replace

f = runpy.run_path('/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/test_context_compile_coordinator.py')
base = f['_request'](pressured=True)

for retained_chars in (19000, 19250, 19500, 19750, 20000, 20250):
    request = replace(
        base,
        source_messages=(
            {'role': 'user', 'content': 'x' * 30000},
            {'role': 'assistant', 'content': 'Done.'},
            {'role': 'user', 'content': 'y' * retained_chars},
            {'role': 'assistant', 'content': 'Done.'},
            {'role': 'user', 'content': 'current'},
        ),
        source_event_ids=tuple(f'event-{i}' for i in range(1, 6)),
        source_event_store_seqs=tuple(range(1, 6)),
    )
    checkpoints = f['RecordingCheckpointRepository']()
    try:
        result = f['_coordinator'](request=request, checkpoints=checkpoints).compile(request)
        print(retained_chars, 'OK', result.diagnostics['omitted_source_indexes'],
              'final_tokens:', result.diagnostics['after_estimated_tokens'])
    except Exception as error:
        print(retained_chars, type(error).__name__, str(error),
              'prepared:', len(checkpoints.calls), 'committed:', len(checkpoints.commit_calls))
    if retained_chars == 19500:
        # Same source state: prove that covering both old turns fits 8192.
        alternative = f['RecordingCheckpointRepository']()
        smaller = replace(request, budget=f['resolve_context_budget'](context_window_tokens=4096))
        f['_coordinator'](request=smaller, checkpoints=alternative).compile(smaller)
        result = f['_coordinator'](request=request, checkpoints=alternative).compile(request)
        print('same 19500 source, larger covering checkpoint: OK',
              result.diagnostics['omitted_source_indexes'],
              'final_tokens:', result.diagnostics['after_estimated_tokens'])
