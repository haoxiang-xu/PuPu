"""One fixed QA diagnostic; never a required-CI or release qualification result."""
import cProfile
import hashlib
import json
import os
from pathlib import Path
import platform
import pstats
import resource
import sys
import subprocess
import time
import xml.etree.ElementTree as ET

SELECTOR = 'tests/test_skeleton_agent_runtime.py::test_cold_recovery_scopes_terminal_child_to_its_own_serial_delegate'
WHEEL_SHA = '61e570bb1ef13564079adeb036ccd7fa9d5dd64bb56d0fb017408336beb04cdc'
MANIFEST = 'sha256:88d5f8d733e7f3dc94fb1cd20060fcc5f2611c0f94420e327bcb12664368bf2e'


def snapshot():
    paths = ['/proc/self/status', '/proc/cpuinfo', '/proc/pressure/cpu', '/proc/pressure/io']
    group = Path('/proc/self/cgroup').read_text()
    relative = next(line.split(':', 2)[2] for line in group.splitlines() if line.startswith('0::'))
    cgroup = Path('/sys/fs/cgroup') / relative.lstrip('/')
    paths += [str(cgroup / name) for name in ('cpu.max', 'cpu.stat', 'memory.max', 'memory.peak', 'memory.events')]
    return {'files': {p: Path(p).read_text() if Path(p).exists() else None for p in paths},
            'cgroup': group, 'network_namespace': os.readlink('/proc/self/ns/net'),
            'self_usage': list(resource.getrusage(resource.RUSAGE_SELF)),
            'children_usage': list(resource.getrusage(resource.RUSAGE_CHILDREN))}


def resource_profile_main():
    out = Path(os.environ['QA_OUT'])
    out.mkdir(parents=True, exist_ok=True)
    assert sys.version_info[:3] == (3, 12, 16), 'wrong_python'
    assert os.getuid() == int(os.environ['QA_EXPECT_UID']) != 0
    assert os.getgid() == int(os.environ['QA_EXPECT_GID'])
    assert os.getgroups() == [], 'supplementary_groups_present'
    before = snapshot()
    before_plugin_sha = hashlib.sha256((Path(__file__).parent / 'qa356_runtime_probe.py').read_bytes()).hexdigest()
    status = dict(line.split(':', 1) for line in before['files']['/proc/self/status'].splitlines() if ':' in line)
    assert status['NoNewPrivs'].strip() == '1'
    assert all(int(status[name].strip(), 16) == 0 for name in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
    assert os.environ['QA_WHEEL_SHA'] == WHEEL_SHA and os.environ['QA_MANIFEST'] == MANIFEST
    wheel = Path(os.environ['QA_WHEEL'])
    assert hashlib.sha256(wheel.read_bytes()).hexdigest() == WHEEL_SHA
    server = Path.cwd()
    inventory = {str(p.relative_to(server)): hashlib.sha256(p.read_bytes()).hexdigest() for p in server.rglob('*.py')}
    import pytest
    assert pytest.__version__ == '9.2.0'
    argv = [SELECTOR, '-vv', '--tb=short', '-p', 'no:cacheprovider', '-p', 'qa356_runtime_probe',
            '-o', 'faulthandler_timeout=60', '--basetemp=' + str(out / 'pytest-tmp'), '--junitxml=' + str(out / 'acceptance.xml')]
    (out / 'before.json').write_text(json.dumps({'resources': before, 'source_python_sha256': inventory,
        'plugin_sha256': before_plugin_sha, 'wheel_sha256': WHEEL_SHA, 'python': sys.version, 'pytest': pytest.__version__, 'platform': platform.platform(), 'argv': argv,
        'profiling_limitation': 'pytest sessionstart/sessionfinish hooks profile the worker calling thread only; runner startup and other threads are excluded; overhead changes timing; one case is not full-suite evidence',
        'source_ci_origin': {'run': 42160538615, 'status': 'FAILED'}, 'qualification': 'DIAGNOSTIC_ONLY'}, indent=2) + '\n')
    wall = time.monotonic(); cpu = time.process_time()
    runner = server.parents[1] / 'scripts/release-qa/run-python-tests.py'
    command = [sys.executable, str(runner), *argv, '-p', 'resource_profile_driver']
    code = subprocess.run(command, check=False).returncode
    try:
        stats = pstats.Stats(str(out / 'profile.prof'))
        rows = [{'file': key[0], 'line': key[1], 'function': key[2], 'primitive_calls': value[0],
                 'total_calls': value[1], 'self_seconds': value[2], 'cumulative_seconds': value[3]} for key, value in stats.stats.items()]
    except (OSError, EOFError, ValueError):
        rows = []
    names = ('walk', 'validate_json_resource', 'capture_snapshot', 'capture_journal_snapshot', 'load', '__instancecheck__', 'check_schema', 'validate_output_schema')
    result = {'qualification': 'DIAGNOSTIC_ONLY', 'status': 'DIAGNOSTIC_FAILED_OR_INCOMPLETE', 'pytest_exit': code,
        'wall_seconds': time.monotonic() - wall, 'outer_driver_cpu_seconds': time.process_time() - cpu,
        'after_resources': snapshot(), 'top_self': sorted(rows, key=lambda r: r['self_seconds'], reverse=True)[:50],
        'top_cumulative': sorted(rows, key=lambda r: r['cumulative_seconds'], reverse=True)[:50],
        'named_rows': [r for r in rows if any(name in r['function'] for name in names)],
        'interpretation': 'Names and counts alone do not establish schema cache bypass.'}
    after = {str(p.relative_to(server)): hashlib.sha256(p.read_bytes()).hexdigest() for p in server.rglob('*.py')}
    child_before = before['children_usage']
    child_after = result['after_resources']['children_usage']
    result['child_cpu_seconds'] = {'user': child_after[0] - child_before[0],
        'system': child_after[1] - child_before[1],
        'total': child_after[0] + child_after[1] - child_before[0] - child_before[1],
        'scope': 'runner and pytest descendants, not main-thread CPU'}
    result['source_python_unchanged'] = inventory == after
    result['wheel_sha256_after'] = hashlib.sha256(wheel.read_bytes()).hexdigest()
    result['plugin_sha256_after'] = hashlib.sha256((Path(__file__).parent / 'qa356_runtime_probe.py').read_bytes()).hexdigest()
    try:
        suite = ET.parse(out / 'acceptance.xml').getroot()
        cases = list(suite.iter('testcase'))
        imports = json.loads((out / 'imported-runtime.json').read_text())
        valid = (code == 0 and len(cases) == 1 and not any(list(c) for c in cases)
            and imports['errors'] == [] and imports['modules'] and imports['pytest_exit_before_probe'] == 0
            and imports['wheel_sha256'] == WHEEL_SHA and imports['manifest'] == MANIFEST and inventory == after and bool(rows) and result['wheel_sha256_after'] == WHEEL_SHA
            and result['plugin_sha256_after'] == before_plugin_sha)
        result['status'] = 'DIAGNOSTIC_COMPLETE' if valid else 'DIAGNOSTIC_FAILED_OR_INCOMPLETE'
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        result['receipt_error_type'] = type(error).__name__
    (out / 'profile-result.json').write_text(json.dumps(result, indent=2) + '\n')
    return 0 if result['status'] == 'DIAGNOSTIC_COMPLETE' else (code or 1)


_SESSION_PROFILE = None


def pytest_sessionstart(session):
    global _SESSION_PROFILE
    _SESSION_PROFILE = cProfile.Profile()
    _SESSION_PROFILE.enable()


def pytest_sessionfinish(session, exitstatus):
    if _SESSION_PROFILE is not None:
        _SESSION_PROFILE.disable()
        _SESSION_PROFILE.dump_stats(str(Path(os.environ['QA_OUT']) / 'profile.prof'))


if __name__ == '__main__':
    raise SystemExit(resource_profile_main())
