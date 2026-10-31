"""Non-delivery CI control: exact observed versions/wheel, offline test subprocesses."""
from pathlib import Path
import hashlib
import importlib.metadata
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import zipfile

assert sys.version_info[:3] == (3, 12, 15), sys.version
assert os.geteuid() != 0, 'network namespace must drop back to the runner uid'
repo = Path(__file__).resolve().parents[2]
out = Path(os.environ['QA_DIAGNOSTIC_OUT']).resolve()
out.mkdir(parents=True)
wheel = Path(os.environ['QA_DIAGNOSTIC_WHEEL']).resolve()
assert hashlib.sha256(wheel.read_bytes()).hexdigest() == '8d537a57b56a2ece6fb69d3b1eabd690581037486030e70eb7766475ecdb780b'
addresses = json.loads(subprocess.check_output(['/usr/sbin/ip', '-j', 'address'], text=True))
assert {a['ifname'] for a in addresses} <= {'lo'}, addresses
assert not json.loads(subprocess.check_output(['/usr/sbin/ip', '-j', 'route'], text=True))
try:
    socket.create_connection(('198.51.100.1', 443), timeout=1)
except OSError as error:
    network_error = {'type': type(error).__name__, 'errno': error.errno}
else:
    raise AssertionError('no external route is allowed')

import unchain
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
site = Path(unchain.__file__).resolve().parent.parent
with zipfile.ZipFile(wheel) as archive:
    members = [n for n in archive.namelist() if n.startswith('unchain/') and n.endswith('.py')]
    assert len(members) == 377
    for member in members:
        assert archive.read(member) == (site / member).read_bytes(), member
manifest = runtime_protocol_manifest()
assert manifest['manifest_digest'] == 'sha256:ec8741b2425ef3d07578fff9508bd3be6dfd5804210068597ddd673e287b6330'
identity = {'python': sys.version, 'wheel_sha256': hashlib.sha256(wheel.read_bytes()).hexdigest(),
            'module_count': len(members), 'Core_module': unchain.__file__, 'manifest': manifest,
            'network_namespace': addresses, 'external_route_probe': network_error,
            'versions': {d.metadata['Name']: d.version for d in importlib.metadata.distributions()},
            'source_base': '1b609680ca862ccccac6eeae48b596dc5cf3f809',
            'test_file_sha256': hashlib.sha256((repo / 'unchain_runtime/server/tests/test_skeleton_hook_approval_regressions.py').read_bytes()).hexdigest()}
(out / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
selector = 'tests/test_skeleton_hook_approval_regressions.py::test_published_hook_projects_each_distinct_child_approval[1-2-1]'
results = []
for label, seconds in [('no-dump-before', 0), ('forced-dump', 1), ('original-dump', 60), ('no-dump-after', 0)]:
    trial = out / label
    trial.mkdir()
    home, temporary = trial / 'home', trial / 'tmp'
    home.mkdir()
    temporary.mkdir()
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'TMPDIR': str(temporary),
           'PYTHONDONTWRITEBYTECODE': '1', 'UNCHAIN_SOURCE_PATH': str(site),
           'PYTHONPATH': str(repo / 'unchain_runtime/server')}
    command = [sys.executable, '-B', '-m', 'pytest', selector, '-q', '-vv', '--tb=short',
               '--durations=5', '-o', f'faulthandler_timeout={seconds}', '--basetemp', str(temporary / 'pytest')]
    start = time.monotonic()
    peak = 0
    stopped = None
    with (trial / 'output.log').open('wb') as log:
        child = subprocess.Popen(command, cwd=repo / 'unchain_runtime/server', env=env,
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        while child.poll() is None:
            rows = subprocess.check_output(['/bin/ps', '-axo', 'pid=,ppid=,rss='], text=True).splitlines()
            table = {int(p): (int(parent), int(rss)) for p, parent, rss in (row.split() for row in rows)}
            family = {child.pid}
            while True:
                more = {p for p, (parent, _) in table.items() if parent in family}
                if more <= family:
                    break
                family |= more
            peak = max(peak, sum(table[p][1] for p in family if p in table))
            if peak > 4 * 1024 * 1024 or time.monotonic() - start > 150:
                stopped = 'memory' if peak > 4 * 1024 * 1024 else 'timeout'
                os.killpg(child.pid, signal.SIGTERM)
                break
            time.sleep(.25)
        try:
            code = child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            code = child.wait(timeout=5)
    raw = (trial / 'output.log').read_bytes()
    record = {'label': label, 'command': command, 'exit': code, 'seconds': time.monotonic() - start,
              'max_family_RSS_KiB': peak, 'stopped_by_limit': stopped,
              'dump_observed': b'Timeout (' in raw, 'one_test_passed': bool(re.search(rb'\b1 passed\b', raw)),
              'log_sha256': hashlib.sha256(raw).hexdigest()}
    results.append(record)
    (out / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(record), flush=True)
assert all(row['exit'] == 0 and row['one_test_passed'] for row in results), 'diagnostic includes non-passing subprocesses; inspect raw evidence'
