"""Replay a retained checkpoint with Python 3.12; never rebuild its wheel.

Example: python run_cache_checkpoint.py --checkpoint .local/ticket-349-cache-checkpoint --suite core
Run benchmarks alone, without concurrent test/build processes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile


PUPU_TESTS = [
    'test_memory_v2_store_boundary.py', 'test_memory_v2_unchain_runtime_factory.py',
    'test_memory_v2_unchain_runtime_context.py', 'test_memory_v2_unchain_worker.py',
    'test_memory_v2_unchain_read_adapter.py', 'test_memory_v2_unchain_active_host_event_boundary.py',
    'test_memory_v2_unchain_active_graph_gate.py', 'test_memory_v2_unchain_active_graph_restart.py',
    'test_memory_v2_unchain_active_graph_interaction_resume.py', 'test_context_memory_v2_runtime_protocol.py',
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--suite', choices=['core', 'pupu', 'benchmark'], required=True)
    args = parser.parse_args()
    base = args.checkpoint.resolve()
    evidence = Path(__file__).resolve().parent
    wheel = base / 'wheels/unchain-0.2.0-py3-none-any.whl'
    identity = json.loads((base / 'artifact-identity.json').read_text())
    assert hashlib.sha256(wheel.read_bytes()).hexdigest() == identity['wheel_sha256']
    assert sys.version_info[:2] == (3, 12), 'Use the recorded Python 3.12 environment'
    # One source-inventory test and one subprocess test require this layout.
    # It must contain the exact wheel bytes, never a sibling checkout copy.
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            if name.startswith('unchain/') and not name.endswith('/'):
                assert (base / 'unchain-tests/src' / name).read_bytes() == archive.read(name)
    server = base / 'pupu/unchain_runtime/server'
    paths = [wheel, evidence, base / 'unchain-tests']
    if args.suite == 'pupu':
        paths.extend([base / 'extra312', server, server / 'tests'])
    env = dict(os.environ, PYTHONPATH=os.pathsep.join(map(str, paths)),
               CHECKPOINT_WHEEL=str(wheel), CHECKPOINT_WHEEL_SHA256=identity['wheel_sha256'])
    if args.suite == 'benchmark':
        command = [sys.executable, str(evidence / 'cache_checkpoint_benchmark.py'),
                   '--samples', '100', '--warmups', '10', '--output', str(base / 'benchmark-replay.json')]
    else:
        command = [sys.executable, '-m', 'pytest', '-p', 'checkpoint_artifact_guard', '-q', '--tb=short']
        if args.suite == 'core':
            command.extend([str(base / 'unchain-tests/tests/context_v2'),
                            str(evidence / 'test_cache_checkpoint_differential.py')])
        else:
            command.extend(str(server / 'tests' / name) for name in PUPU_TESTS)
            command.extend(str(p) for p in sorted(evidence.glob('test_tool_cache_*.py')))
    log = base / (args.suite + '-guarded.log')
    with log.open('w') as output:
        output.write(json.dumps({'command': command, 'wheel_sha256': identity['wheel_sha256'],
                                 'python': sys.version, 'manifest_digest': identity['manifest']['manifest_digest']}) + '\n')
        output.flush()
        result = subprocess.run(command, env=env, stdout=output, stderr=subprocess.STDOUT)
    print(log)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
