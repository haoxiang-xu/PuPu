"""Adopt the one reviewed, scanned #356 installed-cell and sidecar checkpoint."""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path, PurePosixPath
import shutil
import stat
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET


ROOT = Path.cwd()
MANIFEST_PATH = Path(__file__).with_name('pair-resume-checkpoint-manifest.json')
DEFERRED_CLASS = 'tests.test_skeleton_code_runtime'
DEFERRED_NAME = 'test_real_pupu_bundled_python_runs_the_same_protocol_when_supplied'
DEFERRED_REASON = 'set PUPU_BUNDLED_PYTHON to the retained PuPu bundled interpreter'
OLD_SHA = 'e0162fc116e3f2970c67bc6c5458d1a305e6404dbb11b6e22db25897cad77ff6'
NEW_SHA = 'cc9db519df2502130f4bc0bef0757d9c01e295e54989452d007701760919fdce'
WHEEL_SHA = '95cf58692442f3a3f709ccedd78568e5100309f439ec8785d96ee8e6b5db6ff5'
MANIFEST = 'sha256:88d5f8d733e7f3dc94fb1cd20060fcc5f2611c0f94420e327bcb12664368bf2e'


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def regular_file(path: Path) -> bool:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return False
    return stat.S_ISREG(mode) and not path.is_symlink()


def checked_relative(text: str) -> PurePosixPath:
    path = PurePosixPath(text)
    require(not path.is_absolute() and bool(path.parts) and all(part not in ('', '.', '..') for part in path.parts),
            'unsafe_manifest_path:' + text)
    return path


def exact_tree(root: Path, entries: list[dict]) -> dict[str, Path]:
    require(not root.is_symlink() and root.is_dir(), 'checkpoint_root_missing_or_symlink:' + str(root))
    expected = {str(checked_relative(row['path'])): row for row in entries}
    allowed_dirs = {'/'.join(PurePosixPath(name).parts[:depth]) for name in expected
                    for depth in range(1, len(PurePosixPath(name).parts))}
    actual_files: dict[str, Path] = {}
    for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
        here = Path(current)
        for name in list(dirs):
            path = here / name
            rel = path.relative_to(root).as_posix()
            require(not path.is_symlink() and rel in allowed_dirs, 'unexpected_or_symlink_directory:' + rel)
        for name in files:
            path = here / name
            rel = path.relative_to(root).as_posix()
            require(regular_file(path), 'checkpoint_file_not_regular:' + rel)
            require(rel in expected, 'unexpected_checkpoint_file:' + rel)
            row = expected[rel]
            raw_hash = digest(path)
            require(path.stat().st_size == row['size_bytes'] and raw_hash == row['sha256'],
                    'checkpoint_file_hash_or_size_mismatch:' + rel)
            actual_files[rel] = path
    require(set(actual_files) == set(expected),
            'checkpoint_file_set_mismatch:missing=' + ','.join(sorted(set(expected) - set(actual_files))))
    return actual_files


def json_file(path: Path) -> dict:
    value = json.loads(path.read_text(encoding='utf-8'))
    require(type(value) is dict, 'expected_json_object:' + str(path))
    return value


def scan_metadata(base: Path) -> dict:
    metadata = base / 'metadata'
    names = {'source-run.json', 'source-job.json', '13529017895.json', '13530035287.json'}
    require(metadata.is_dir() and not metadata.is_symlink(), 'checkpoint_metadata_root_missing_or_symlink')
    require({path.name for path in metadata.iterdir()} == names, 'checkpoint_metadata_file_set_mismatch')
    tokens = [os.environ[name].encode('utf-8') for name in ('GH_TOKEN', 'GITHUB_TOKEN') if os.environ.get(name)]
    credential = re.compile(
        rb'(?i)(?:x-unchain-auth|authorization|bearer|api[_-]?key|access[_-]?token|(?:gh|github)[_-]?token|password)["\s]*[:=]["\s]*(?:bearer[ \t]+)?[A-Za-z0-9._~+/-]{16,}'
    )
    token_shape = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})')
    sentinels = (b'sentinel-native-profile-smoke', b'sentinel-qa356-secret', b'sentinel-qa357-secret')
    rows = []
    for name in sorted(names):
        path = metadata / name
        require(regular_file(path), 'checkpoint_metadata_file_not_regular:' + name)
        raw = path.read_bytes()
        require(not any(token in raw for token in tokens) and not credential.search(raw) and
                not token_shape.search(raw) and not any(value in raw for value in sentinels),
                'credential_like_bytes_in_checkpoint_metadata:' + name)
        rows.append({'path': 'test-results/resume/metadata/' + name, 'size_bytes': len(raw),
                     'sha256': hashlib.sha256(raw).hexdigest()})
    return {'status': 'PASS', 'files': rows, 'actual_token_checked': bool(tokens)}


def check_api_evidence(base: Path, manifest: dict) -> dict:
    cp = manifest['checkpoint']
    run = json_file(base / 'metadata/source-run.json')
    job = json_file(base / 'metadata/source-job.json')
    require(run.get('id') == cp['run_id'] and run.get('head_sha') == cp['qa_head'] and
            run.get('head_branch') == 'codex/ticket-356-string-pair-qa' and
            run.get('status') == 'completed' and run.get('conclusion') == 'failure',
            'checkpoint_run_identity_or_status_mismatch')
    require(job.get('id') == cp['job_id'] and job.get('run_id') == cp['run_id'] and
            job.get('name') == 'pair' and job.get('status') == 'completed' and job.get('conclusion') == 'failure',
            'checkpoint_job_identity_or_status_mismatch')
    steps = job.get('steps')
    require(type(steps) is list, 'checkpoint_job_steps_missing')
    by_name = {row.get('name'): row for row in steps if type(row) is dict}
    for name in manifest['expected_job_steps']:
        require(name in by_name and by_name[name].get('status') == 'completed' and
                by_name[name].get('conclusion') == 'success', 'checkpoint_step_not_successful:' + name)
    failed = [row.get('name') for row in steps if row.get('conclusion') == 'failure']
    require(failed and failed[0] == cp['first_failure_step'], 'checkpoint_first_failure_mismatch')
    artifact_rows = []
    for expected in cp['artifacts']:
        path = base / 'metadata' / (str(expected['id']) + '.json')
        artifact = json_file(path)
        workflow = artifact.get('workflow_run') or {}
        require(artifact.get('id') == expected['id'] and artifact.get('name') == expected['name'] and
                artifact.get('expired') is False and artifact.get('digest') == 'sha256:' + expected['zip_sha256'] and
                workflow.get('id') == cp['run_id'] and workflow.get('head_sha') == cp['qa_head'],
                'checkpoint_artifact_identity_or_digest_mismatch:' + str(expected['id']))
        artifact_rows.append({'id': artifact['id'], 'name': artifact['name'], 'digest': artifact['digest'],
                              'workflow_run_id': workflow['id'], 'head_sha': workflow['head_sha']})
    return {'run': run, 'job': job, 'artifacts': artifact_rows}


def check_test_evidence(installed: dict[str, Path], manifest: dict) -> dict:
    identity = json.loads(installed['pair/pair-identity.json'].read_text())
    expected_id = manifest['identity']
    for key, expected in [('host_sha', 'host_sha'), ('host_tree', 'host_tree'), ('core_sha', 'core_sha'),
                          ('core_tree', 'core_tree'), ('wheel_sha256', 'wheel_sha256'), ('manifest', 'manifest'),
                          ('legacy_binary_sha256', 'legacy_binary_sha256')]:
        require(identity.get(key) == expected_id[expected], 'checkpoint_pair_identity_mismatch:' + key)
    require(identity.get('required_ci_run_id') == '42264231815' and
            identity.get('required_ci_run', {}).get('headSha') == expected_id['host_sha'] and
            identity.get('required_ci_run', {}).get('status') == 'in_progress',
            'historical_ci_observation_mismatch')
    summary = json.loads(installed['pair/installed-cells-summary.json'].read_text())
    require(summary.get('source', {}).get('status') == 'PASS' and
            summary['source'].get('cases') == manifest['installed']['source_cases'] and
            summary.get('core', {}).get('status') == 'DEFERRED' and
            summary['core'].get('cases') == manifest['installed']['core_cases'] and
            summary.get('core', {}).get('manifest') == MANIFEST and
            summary.get('source', {}).get('manifest') == MANIFEST and
            summary.get('deferred_node') == 'tests/test_skeleton_code_runtime.py::' + DEFERRED_NAME,
            'checkpoint_cell_summary_mismatch')
    scan = json.loads(installed['status/unit-evidence-scan.json'].read_text())
    require(scan.get('scan_status') == 'PASS' and scan.get('qualification_status') == 'UNVERIFIED_OR_FAILED' and
            scan.get('missing') == [] and len(scan.get('files', [])) == 13, 'checkpoint_unit_scan_not_valid')
    expected_scan = {'test-results/' + row['path']: (row['size_bytes'], row['sha256'])
                     for row in manifest['installed']['artifact_files']
                     if row['path'] != 'status/unit-evidence-scan.json'}
    actual_scan = {row.get('path'): (row.get('size'), row.get('sha256')) for row in scan['files']}
    require(actual_scan == expected_scan, 'checkpoint_unit_scan_file_binding_mismatch')
    result = {}
    for cell, expected_count in [('source', manifest['installed']['source_cases']),
                                 ('core', manifest['installed']['core_cases'])]:
        xml = ET.parse(installed[cell + '/acceptance.xml']).getroot()
        rows = xml.findall('.//testcase')
        require(len(rows) == expected_count and not xml.findall('.//failure') and not xml.findall('.//error'),
                'checkpoint_junit_failure_or_count_mismatch:' + cell)
        skipped = [(row, row.find('skipped')) for row in rows if row.find('skipped') is not None]
        if cell == 'source':
            require(not skipped, 'checkpoint_source_skip_not_allowed')
        else:
            require(len(skipped) == 1, 'checkpoint_core_skip_count_mismatch')
            row, skip = skipped[0]
            require(row.get('classname') == DEFERRED_CLASS and row.get('name') == DEFERRED_NAME and
                    skip.get('type') == 'pytest.skip' and skip.get('message') == DEFERRED_REASON,
                    'checkpoint_core_skip_identity_mismatch')
        proof = json.loads(installed[cell + '/imported-runtime.json'].read_text())
        require(proof.get('pytest_exit_before_probe') == 0 and not proof.get('errors') and
                proof.get('wheel_sha256') == WHEEL_SHA and proof.get('manifest') == MANIFEST,
                'checkpoint_import_proof_mismatch:' + cell)
        require(len(proof.get('modules', [])) == manifest['installed'][cell + '_imported_modules'],
                'checkpoint_import_module_count_mismatch:' + cell)
        result[cell] = {'cases': len(rows), 'skips': len(skipped), 'modules': len(proof['modules'])}
    return result


def check_sidecar(sidecar: dict[str, Path], manifest: dict) -> None:
    record = json.loads(sidecar['linux-sidecar-identity.json'].read_text())
    require(record.get('sha256') == NEW_SHA and record.get('wheel_sha256') == WHEEL_SHA,
            'checkpoint_sidecar_identity_mismatch')
    checksum = sidecar['linux-sidecar.sha256'].read_text().split()
    require(len(checksum) == 2 and checksum[0] == NEW_SHA, 'checkpoint_sidecar_checksum_mismatch')
    scan = json.loads(sidecar['linux-sidecar-evidence-scan.json'].read_text())
    require(scan.get('status') == 'PASS' and len(scan.get('files', [])) == 3,
            'checkpoint_sidecar_scan_not_valid')
    expected_scan = {'reusable/' + row['path']: (row['size_bytes'], row['sha256'])
                     for row in manifest['sidecar']['artifact_files']
                     if row['path'] != 'linux-sidecar-evidence-scan.json'}
    actual_scan = {row.get('path'): (row.get('size'), row.get('sha256')) for row in scan['files']}
    require(actual_scan == expected_scan, 'checkpoint_sidecar_scan_file_binding_mismatch')
    binary = sidecar['unchain-server']
    require(regular_file(binary) and digest(binary) == NEW_SHA and binary.stat().st_size == 78010872,
            'checkpoint_sidecar_binary_mismatch')
    with binary.open('rb') as stream:
        elf = stream.read(20)
    require(len(elf) == 20 and elf[:4] == b'\x7fELF' and elf[4] == 2 and elf[5] == 1 and
            struct.unpack('<H', elf[18:20])[0] == 62, 'checkpoint_sidecar_not_linux_x86_64_elf')


def copy_exact(source: Path, destination: Path) -> None:
    require(not destination.exists() and not destination.is_symlink(), 'refusing_to_overwrite:' + str(destination))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open('rb') as incoming, destination.open('xb') as outgoing:
        shutil.copyfileobj(incoming, outgoing, 1024 * 1024)


def stage_executable(source: Path, destination: Path, expected_sha: str, expected_size: int, label: str) -> dict:
    require(regular_file(source), 'binary_source_not_regular:' + label)
    require(source.stat().st_size == expected_size and digest(source) == expected_sha,
            'binary_source_sha_or_size_mismatch:' + label)
    source_parent = source.parent
    require(os.access(source_parent, os.X_OK | os.R_OK), 'binary_source_parent_not_accessible:' + label)
    before = {'source_path': str(source.resolve()), 'source_mode': oct(stat.S_IMODE(source.stat().st_mode)),
              'source_parent_accessible': True, 'source_sha256': expected_sha}
    copy_exact(source, destination)
    require(regular_file(destination) and digest(destination) == expected_sha,
            'staged_binary_sha_mismatch_before_chmod:' + label)
    with destination.open('rb') as stream:
        raw = stream.read(20)
    require(len(raw) == 20 and raw[:4] == b'\x7fELF' and raw[4] == 2 and raw[5] == 1 and
            struct.unpack('<H', raw[18:20])[0] == 62, 'staged_binary_not_linux_x86_64_elf:' + label)
    mode_before = oct(stat.S_IMODE(destination.stat().st_mode))
    os.chmod(destination, 0o755)
    require(stat.S_IMODE(destination.stat().st_mode) == 0o755 and digest(destination) == expected_sha,
            'staged_binary_mode_or_sha_after_chmod:' + label)
    require(os.access(destination.parent, os.X_OK | os.W_OK), 'staged_binary_parent_not_accessible:' + label)
    return {'label': label, **before, 'staged_path': str(destination.resolve()),
            'staged_mode_before': mode_before, 'staged_mode_after': oct(stat.S_IMODE(destination.stat().st_mode)),
            'staged_sha256_after': digest(destination), 'staged_parent_accessible': True}


def check_fresh_environment(installed: dict[str, Path], current: dict, freeze: bytes, ci: dict) -> dict:
    require(type(current) is dict and current.get('version') == [3, 12, 15], 'fresh_python_version_mismatch')
    for cell in ('core', 'source'):
        historical = json_file(installed[cell + '/imported-runtime.json'])
        require(current.get('executable') == historical.get('executable'), 'fresh_python_executable_mismatch:' + cell)
    require(freeze == installed['pair/dependencies-freeze.txt'].read_bytes(), 'fresh_dependency_freeze_mismatch')
    require(ci.get('databaseId') == 42264231815 and type(ci.get('databaseId')) is int and
            ci.get('headSha') == '56dd76fdd68956a5652ccbd085b99d95db9f5a28' and
            ci.get('status') == 'completed' and ci.get('conclusion') == 'success', 'current_required_ci_not_successful')
    return {'python': current, 'dependencies_sha256': hashlib.sha256(freeze).hexdigest(),
            'current_required_ci': ci, 'status': 'CURRENT_ENVIRONMENT_MATCHES_CHECKPOINT'}


def main() -> None:
    require(len(sys.argv) == 2 and sys.argv[1] == 'adopt-installed', 'usage: reuse_pair_checkpoint.py adopt-installed')
    require(os.environ.get('QA_HOST_SHA') == '56dd76fdd68956a5652ccbd085b99d95db9f5a28' and
            os.environ.get('QA_HOST_TREE') == '735607061eb127cc549e0ef76cc94ca6e6b9eb6e' and
            os.environ.get('QA_CORE_SHA') == '369d86cc9592704c6d45017147904bf6e103a37f' and
            os.environ.get('QA_CORE_TREE') == '18edaf62bb41ebade4457480f1edc89af4c6780b' and
            os.environ.get('QA_WHEEL_SHA') == WHEEL_SHA and os.environ.get('QA_MANIFEST') == MANIFEST,
            'current_pair_identity_not_approved')
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    require(manifest.get('schema') == 'qa356.pair-resume-checkpoint.v1', 'checkpoint_manifest_schema_mismatch')
    base = ROOT / 'test-results/resume'
    metadata_scan = scan_metadata(base)
    (base / 'metadata-scan.json').write_text(json.dumps(metadata_scan, indent=2) + '\n')
    api = check_api_evidence(base, manifest)
    installed_root = base / 'original/installed'
    sidecar_root = base / 'original/sidecar'
    installed = exact_tree(installed_root, manifest['installed']['artifact_files'])
    sidecar = exact_tree(sidecar_root, manifest['sidecar']['artifact_files'])
    cell_summary = check_test_evidence(installed, manifest)
    check_sidecar(sidecar, manifest)
    python = os.environ['QA_PYTHON']
    current = json.loads(subprocess.check_output([python, '-c',
        'import json,sys;print(json.dumps({"version":list(sys.version_info[:3]),"executable":sys.executable}))'], text=True, timeout=30))
    fresh_freeze = subprocess.check_output([python, '-m', 'pip', 'freeze', '--all'], timeout=60)
    require(fresh_freeze == (ROOT / 'test-results/pair/dependencies-freeze.txt').read_bytes(), 'fresh_dependency_capture_changed')
    environment = check_fresh_environment(installed, current, fresh_freeze,
                                          json_file(ROOT / 'test-results/pair/wheel-run.json'))

    # Keep every downloaded artifact intact; only these historical cell files are adopted.
    adopted = []
    for key, destination in [('core/acceptance.xml', ROOT / 'test-results/core/acceptance.xml'),
                             ('core/test-files.txt', ROOT / 'test-results/core/test-files.txt'),
                             ('core/imported-runtime.json', ROOT / 'test-results/core/imported-runtime.json'),
                             ('source/acceptance.xml', ROOT / 'test-results/source/acceptance.xml'),
                             ('source/test-files.txt', ROOT / 'test-results/source/test-files.txt'),
                             ('source/imported-runtime.json', ROOT / 'test-results/source/imported-runtime.json'),
                             ('pair/installed-cells-summary.json', ROOT / 'test-results/pair/installed-cells-summary.json')]:
        source = installed[key]
        copy_exact(source, destination)
        adopted.append({'source': str(source.relative_to(ROOT)), 'destination': str(destination.relative_to(ROOT)),
                        'sha256': digest(destination), 'size_bytes': destination.stat().st_size})

    old_source = Path(os.environ['QA_LEGACY_BINARY'])
    old_resolved = old_source.resolve(strict=True)
    legacy_root = (ROOT / 'legacy').resolve(strict=True)
    require(old_resolved.is_relative_to(legacy_root) and regular_file(old_source), 'old_binary_outside_download_or_symlink')
    old_stage = base / 'staged/legacy/unchain-server'
    old_record = stage_executable(old_source, old_stage, OLD_SHA,
                                  manifest['identity']['legacy_binary_size_bytes'], 'old-frozen')
    provenance = {'schema': 'qa356.reused-installed-cells.v1', 'status': 'REUSED_CHECKPOINT_NOT_EXECUTED_THIS_RUN',
                  'source_run_id': manifest['checkpoint']['run_id'], 'source_run_conclusion': 'failure',
                  'source_job_id': manifest['checkpoint']['job_id'], 'source_job_conclusion': 'failure',
                  'candidate': manifest['identity']['host_sha'], 'candidate_tree': manifest['identity']['host_tree'],
                  'core': manifest['identity']['core_sha'], 'core_tree': manifest['identity']['core_tree'],
                  'wheel_sha256': manifest['identity']['wheel_sha256'], 'manifest': manifest['identity']['manifest'],
                  'prior_required_ci_observation': manifest['checkpoint']['old_required_ci_observation'],
                  'current_environment': environment, 'historical_sidecar': {'status': 'VALIDATED_NOT_USED_THIS_RUN', 'sha256': NEW_SHA},
                  'historical_cells': cell_summary, 'adopted_files': adopted,
                  'artifact_api_provenance': api, 'source_checkpoint_directory': 'test-results/resume/original',
                  'later_bundled_case': 'NOT_RUN_PENDING_REAL_PACKAGED_INTERPRETER',
                  'first_failure': manifest['checkpoint']['failure_class']}
    (ROOT / 'test-results/pair/reused-cells-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    stage_report = {'schema': 'qa356.reused-binary-stage.v1', 'checkpoint_run_id': manifest['checkpoint']['run_id'],
                    'old_frozen': old_record, 'fresh_sidecar': 'PENDING_NORMAL_BUILD',
                    'binary_bytes_changed': False, 'only_staged_executables_chmodded': True}
    (base / 'staged/binary-stage.json').write_text(json.dumps(stage_report, indent=2) + '\n')
    env_path = os.environ.get('GITHUB_ENV')
    require(env_path, 'GITHUB_ENV_missing')
    with Path(env_path).open('a', encoding='utf-8') as output:
        output.write('QA_LEGACY_BINARY=' + str(old_stage.resolve()) + '\n')
    print(json.dumps({'status': 'CHECKPOINT_ADOPTED_PENDING_CURRENT_QUALIFICATION', 'cells': cell_summary,
                      'old_binary_sha256': OLD_SHA, 'fresh_sidecar': 'PENDING_NORMAL_BUILD'}))


if __name__ == '__main__':
    main()
