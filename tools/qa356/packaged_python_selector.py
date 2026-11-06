"""Select the exact pinned packaged MCP interpreter without executing it."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys

PINS_SHA256 = '44568588d471ba3552aceff8db34974593dd51a15a8d16e2ccf7ad344974da2b'


def select_packaged_python(resources: Path, pins_path: Path) -> Path:
    resources = resources.resolve(strict=True)
    runtime = resources / 'mcp_runtime'
    rows = []
    for path in sorted(resources.rglob('python3.12')):
        mode = path.lstat().st_mode
        kind = 'symlink' if stat.S_ISLNK(mode) else 'file' if stat.S_ISREG(mode) else 'directory' if stat.S_ISDIR(mode) else 'special'
        rows.append({'path': path.relative_to(resources).as_posix(), 'type': kind,
                     'contained': path.resolve().is_relative_to(runtime.resolve())})
    diagnostics = json.dumps(rows[:32], sort_keys=True)
    def require(condition, reason):
        if not condition:
            raise ValueError(reason + ':candidates=' + diagnostics)
    require(len(rows) <= 32, 'too_many_packaged_python_candidates')
    require(runtime.is_dir() and not runtime.is_symlink() and runtime.resolve() == runtime, 'runtime_root_not_canonical')
    pins_raw = pins_path.read_bytes()
    require(hashlib.sha256(pins_raw).hexdigest() == PINS_SHA256, 'packaged_python_pins_hash_mismatch')
    pins = json.loads(pins_raw)
    manifest = json.loads((runtime / 'manifest.json').read_text())
    require(pins['schema_version'] == 1 and manifest.get('schema_version') == 1 and
            manifest.get('target') == 'linux-x64' and manifest.get('pins_sha256') == PINS_SHA256,
            'packaged_python_manifest_identity_mismatch')
    pinned = pins['runtimes']['python']; target = pinned['targets']['linux-x64']
    actual = manifest.get('runtimes', {}).get('python', {})
    require(actual.get('version') == pinned['version'] and actual.get('command') == target['command'] and
            actual.get('archive_sha256') == target['sha256'] and target['command'] == 'python/bin/python3',
            'packaged_python_command_or_version_mismatch')
    command = PurePosixPath(actual['command'])
    require(not command.is_absolute() and '..' not in command.parts, 'packaged_python_command_unsafe')
    try:
        executable = runtime.joinpath(*command.parts).resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise ValueError('packaged_python_command_unresolvable:candidates=' + diagnostics) from error
    require(executable.is_relative_to(runtime) and executable.is_relative_to(resources), 'packaged_python_outside_runtime')
    require(stat.S_ISREG(executable.lstat().st_mode) and not executable.is_symlink() and
            os.access(executable, os.X_OK), 'packaged_python_not_regular_executable')
    require(all(row['type'] in ('directory', 'file') and row['contained'] for row in rows), 'packaged_python_candidate_type_or_containment')
    files = [resources / row['path'] for row in rows if row['type'] == 'file']
    require(len(files) == 1 and files[0].resolve(strict=True) == executable,
            'nonunique_packaged_python_file')
    print('packaged_python_candidates=' + diagnostics, file=sys.stderr)
    return executable
