"""Compare supported non-preview repositories against the exact-preview path.

Run in /tmp with PYTHONPATH set to the selected final7/final8 wheel. This uses
the production compiler/coordinator with recording persistence, not a desktop
or real-provider test. No user data is accessed.
"""
import copy
import runpy
from dataclasses import replace

import unchain.context.compiler

fixtures = runpy.run_path(
    '/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/'
    'test_context_compile_coordinator.py'
)


class NonPreviewRepository(fixtures['RecordingCheckpointRepository']):
    def checkpoint_ref_for(self, *, operation):
        raise NotImplementedError

    def prepare(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        operation = kwargs['operation']
        receipt = fixtures['PreparedCheckpoint'](
            preparation_id='preparation-' + operation.payload_sha256[:32],
            checkpoint_ref=fixtures['ResourceRef'](
                'checkpoint', 'checkpoint-' + operation.payload_sha256[:32], 1
            ),
            operation=operation,
        )
        self.receipts[operation.operation_id] = receipt
        return receipt


print('compiler:', unchain.context.compiler.__file__)
base = fixtures['_request'](pressured=True)
for current_chars in (18_900, 19_000, 19_050, 19_100):
    request = replace(
        base,
        source_messages=(
            *base.source_messages[:2],
            {'role': 'user', 'content': 'z' * current_chars},
        ),
    )
    for repository_type in (
        fixtures['RecordingCheckpointRepository'],
        NonPreviewRepository,
    ):
        checkpoints = repository_type()
        try:
            result = fixtures['_coordinator'](
                request=request, checkpoints=checkpoints
            ).compile(request)
            print(current_chars, repository_type.__name__, 'OK',
                  result.diagnostics['after_estimated_tokens'],
                  'prepares:', len(checkpoints.calls))
        except Exception as error:
            print(current_chars, repository_type.__name__, type(error).__name__,
                  str(error), 'prepares:', len(checkpoints.calls))
