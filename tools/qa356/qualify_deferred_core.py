"""QA-only exact deferred bundled-interpreter predicate; no product imports."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import zipfile
import xml.etree.ElementTree as ET

NODE = 'tests/test_skeleton_code_runtime.py::test_real_pupu_bundled_python_runs_the_same_protocol_when_supplied'
REASON = 'set PUPU_BUNDLED_PYTHON to the retained PuPu bundled interpreter'
CLASS, NAME = 'tests.test_skeleton_code_runtime', NODE.split('::')[1]


def read(path):
    return json.loads(Path(path).read_text())


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def cases(path, mode):
    root = ET.parse(path).getroot()
    rows = root.findall('.//testcase')
    require(bool(rows), 'empty_suite')
    require(not root.findall('.//failure') and not root.findall('.//error'), 'failed_or_errored_suite')
    skipped = [(row, row.find('skipped')) for row in rows if row.find('skipped') is not None]
    if mode == 'core':
        require(len(skipped) == 1, 'expected_exactly_one_deferred_core_case')
        row, skip = skipped[0]
        require(row.get('classname') == CLASS and row.get('name') == NAME, 'unregistered_skip_node')
        require(row.get('file', NODE.split('::')[0]) == NODE.split('::')[0], 'unregistered_skip_path')
        require(skip.get('type') == 'pytest.skip' and skip.get('message') == REASON, 'unregistered_skip_reason')
    else:
        require(not skipped, 'skip_not_allowed')
    if mode == 'bundled-core':
        require(len(rows) == 1 and rows[0].get('classname') == CLASS and rows[0].get('name') == NAME, 'wrong_deferred_positive_node')
        require(rows[0].get('file', NODE.split('::')[0]) == NODE.split('::')[0], 'wrong_deferred_positive_path')
    return len(rows)


def imported(path, env):
    proof = read(path)
    require(proof['pytest_exit_before_probe'] == 0 and type(proof['pytest_exit_before_probe']) is int, 'pytest_not_successful')
    require(proof['modules'] and not proof['errors'], 'missing_or_bad_module_proof')
    require(proof['manifest'] == env['QA_MANIFEST'] and proof['wheel_sha256'] == env['QA_WHEEL_SHA'], 'runtime_identity_mismatch')
    site = Path(env['QA_SITE']).resolve() / 'unchain'
    require(all(Path(row['file']).resolve().is_relative_to(site) and (row['module'] == 'unchain' or row['module'].startswith('unchain.')) and len(row['sha256']) == 64 for row in proof['modules']), 'module_outside_installed_wheel')
    wheel = Path(env['QA_WHEEL'])
    require(hashlib.sha256(wheel.read_bytes()).hexdigest() == env['QA_WHEEL_SHA'], 'wheel_bytes_changed')
    with zipfile.ZipFile(wheel) as archive:
        for row in proof['modules']:
            path = Path(row['file']).resolve()
            raw = path.read_bytes()
            member = path.relative_to(Path(env['QA_SITE']).resolve()).as_posix()
            require(raw == archive.read(member) and hashlib.sha256(raw).hexdigest() == row['sha256'], 'imported_module_bytes_changed')
    return len(proof['modules'])


def installed(root, env):
    result = {}
    for mode in ('core', 'source'):
        folder = root / 'test-results' / mode
        count = cases(folder / 'acceptance.xml', mode)
        files = (folder / 'test-files.txt').read_text().splitlines()
        require(files and all(Path(name).name.startswith('test_skeleton_') for name in files), 'invalid_test_files')
        modules = imported(folder / 'imported-runtime.json', env)
        result[mode] = {'status': 'DEFERRED' if mode == 'core' else 'PASS', 'cases': count,
                        'test_files': len(files), 'imported_modules': modules, 'manifest': env['QA_MANIFEST']}
    result['deferred_node'] = NODE
    result['qualification_status'] = 'DEFERRED'
    path = root / 'test-results/pair/installed-cells-summary.json'
    path.write_text(json.dumps(result, indent=2) + '\n')
    return result


def sealed(root, env):
    package = read(root / 'test-results/platform/package.json')
    for field, key in [('candidate', 'QA_HOST_SHA'), ('candidate_tree', 'QA_HOST_TREE'), ('core', 'QA_CORE_SHA'),
                       ('core_tree', 'QA_CORE_TREE'), ('wheel_sha256', 'QA_WHEEL_SHA'), ('manifest', 'QA_MANIFEST')]:
        require(package[field] == env[key], 'package_identity_mismatch:' + field)
    require(package['platform'] == 'linux' and package['target'] == 'linux-x64', 'wrong_package_platform')
    resources = Path(package['resources']).resolve()
    app = (root / 'candidate/dist/linux-unpacked').resolve()
    require(resources == app / 'resources', 'resources_outside_sealed_app')
    executable = Path(package['python']).resolve()
    require(executable.is_relative_to(resources), 'interpreter_outside_sealed_resources')
    pythons = list(resources.rglob('python3.12'))
    require(len(pythons) == 1 and pythons[0].resolve() == executable, 'nonunique_packaged_interpreter')
    require(executable.is_file() and os.access(executable, os.X_OK), 'packaged_interpreter_not_executable')
    actual_hash = hashlib.sha256(executable.read_bytes()).hexdigest()
    require(actual_hash == package['python_sha256'], 'packaged_interpreter_hash_changed')
    inventory = read(root / 'reusable/linux-app-file-inventory.json')
    expected = {name: row for name, row in inventory.items() if name == 'resources' or name.startswith('resources/')}
    require(bool(expected), 'sealed_resource_inventory_missing')
    actual = {}
    for path in [resources, *resources.rglob('*')]:
        name = path.relative_to(app).as_posix()
        if path.is_symlink():
            target = os.readlink(path)
            require(path.resolve().is_relative_to(app), 'outgoing_resource_symlink')
            raw = target.encode()
            actual[name] = {'type': 'symlink', 'target': target, 'sha256': hashlib.sha256(raw).hexdigest(), 'size': len(raw)}
        elif path.is_file():
            raw = path.read_bytes()
            actual[name] = {'type': 'file', 'sha256': hashlib.sha256(raw).hexdigest(), 'size': len(raw)}
        elif path.is_dir():
            actual[name] = {'type': 'directory'}
        else:
            raise ValueError('unsupported_resource_entry')
    require(actual == expected, 'sealed_resources_changed')
    return {'python': str(executable), 'python_sha256': actual_hash, 'wheel_sha256': env['QA_WHEEL_SHA'],
            'manifest': env['QA_MANIFEST'], 'resource_inventory_sha256': hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'candidate': env['QA_HOST_SHA'], 'core': env['QA_CORE_SHA']}


def late(root, env, *, write=True):
    folder = root / 'test-results/bundled-core'
    before = read(folder / 'sealed-before.json')
    after = sealed(root, env)
    require(before == after, 'resource_or_interpreter_changed_after_test')
    require(env['PUPU_BUNDLED_PYTHON'] == after['python'], 'worker_interpreter_not_exact_package')
    require(cases(folder / 'acceptance.xml', 'bundled-core') == 1, 'deferred_case_not_passed')
    require((folder / 'test-files.txt').read_text().splitlines() == [NODE], 'deferred_selector_changed')
    modules = imported(folder / 'imported-runtime.json', env)
    initial = read(root / 'test-results/pair/installed-cells-summary.json')
    require(initial['core']['status'] == 'DEFERRED' and initial['source']['status'] == 'PASS' and initial['deferred_node'] == NODE, 'initial_core_not_exact_deferred')
    result = {'status': 'PASS', 'node': NODE, 'passed': 1, 'skipped': 0, 'failed': 0, 'errors': 0,
              'imported_modules': modules, 'package': after}
    if write:
        (folder / 'sealed-after.json').write_text(json.dumps(after, indent=2) + '\n')
        (folder / 'qualification-result.json').write_text(json.dumps(result, indent=2) + '\n')
        joined = {'core': {'status': 'PASS', 'initial_passed': initial['core']['cases'] - 1, 'deferred_passed': 1,
                           'total_cases': initial['core']['cases']}, 'source': initial['source'], 'deferred_node': NODE}
        (root / 'test-results/pair/installed-cells-final-summary.json').write_text(json.dumps(joined, indent=2) + '\n')
    return result


def final(root, env):
    result = read(root / 'test-results/bundled-core/qualification-result.json')
    require(result['status'] == 'PASS' and result['node'] == NODE, 'deferred_positive_not_run')
    result2 = late(root, env, write=False)
    require(result == result2, 'deferred_positive_changed')
    return result


if __name__ == '__main__':
    mode = sys.argv[1]
    root = Path.cwd()
    if mode == 'installed':
        print(json.dumps(installed(root, os.environ)))
    elif mode == 'before':
        proof = sealed(root, os.environ)
        folder = root / 'test-results/bundled-core'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'sealed-before.json').write_text(json.dumps(proof, indent=2) + '\n')
        print(proof['python'])
    elif mode == 'late':
        print(json.dumps(late(root, os.environ)))
    elif mode == 'final':
        # The final writer has no PUPU env; recover only the already-verified
        # sealed path, then revalidate it against the current package/inventory.
        env = dict(os.environ)
        env['PUPU_BUNDLED_PYTHON'] = read(root / 'test-results/bundled-core/sealed-before.json')['python']
        final(root, env)
    else:
        raise SystemExit('unknown qualification mode')
