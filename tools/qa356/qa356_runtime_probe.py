"""QA-only provenance plugin; never imported by the product."""
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import sys
import zipfile

import pytest


def pytest_sessionstart(session):
    wheel = Path(os.environ['QA_WHEEL'])
    if sha256(wheel.read_bytes()).hexdigest() != os.environ['QA_WHEEL_SHA']:
        pytest.exit('qa357_wheel_sha_mismatch', returncode=3)
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    if runtime_protocol_manifest()['manifest_digest'] != os.environ['QA_MANIFEST']:
        pytest.exit('qa357_manifest_mismatch', returncode=3)


def pytest_sessionfinish(session, exitstatus):
    site = Path(os.environ['QA_SITE']).resolve()
    wheel = Path(os.environ['QA_WHEEL'])
    imported, errors = [], []
    with zipfile.ZipFile(wheel) as archive:
        members = set(archive.namelist())
        for name, module in sorted(sys.modules.copy().items()):
            if name != 'unchain' and not name.startswith('unchain.'):
                continue
            filename = getattr(module, '__file__', None)
            if not filename:
                errors.append({'module': name, 'reason': 'module_has_no_source'})
                continue
            path = Path(filename)
            if path.suffix == '.pyc':
                path = Path(importlib.util.source_from_cache(str(path)))
            path = path.resolve()
            if not path.is_relative_to(site / 'unchain'):
                errors.append({'module': name, 'reason': 'outside_installed_site', 'file': str(path)})
                continue
            member = str(path.relative_to(site))
            if member not in members or path.read_bytes() != archive.read(member):
                errors.append({'module': name, 'reason': 'source_differs_from_wheel', 'file': str(path)})
                continue
            imported.append({'module': name, 'file': str(path), 'sha256': sha256(path.read_bytes()).hexdigest()})
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    seen_manifest = runtime_protocol_manifest()['manifest_digest']
    if seen_manifest != os.environ['QA_MANIFEST']:
        errors.append({'reason': 'manifest_changed', 'seen': seen_manifest})
    if not imported:
        errors.append({'reason': 'no_imported_core_modules'})
    record = {'schema': 'qa357.import-provenance.v1', 'executable': sys.executable,
        'wheel_sha256': sha256(wheel.read_bytes()).hexdigest(), 'manifest': seen_manifest,
        'pytest_exit_before_probe': int(exitstatus), 'modules': imported, 'errors': errors}
    Path(os.environ['QA_OUT'], 'imported-runtime.json').write_text(json.dumps(record, indent=2) + '\n')
    if errors:
        session.exitstatus = 3
