"""Use a fresh native cache location to observe the actual probe subprocess."""
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from skeleton_resource_store import SkeletonResourceStore


def test_python_probe_does_not_write_interpreter_cache(tmp_path, monkeypatch):
    cache = tmp_path / "fresh-python-cache"
    real_run = subprocess.run

    def with_empty_cache(command, **options):
        # Only relocate cache output; retain all product-selected interpreter
        # flags. This makes existing system cache files irrelevant to the test.
        return real_run([command[0], "-X", "pycache_prefix=" + str(cache), *command[1:]], **options)

    monkeypatch.setattr("skeleton_resource_store.subprocess.run", with_empty_cache)
    answer = SkeletonResourceStore._probe_runtime_profile(SimpleNamespace(command=(sys.executable,)))
    assert answer == {"ok": True, "version": ".".join(map(str, sys.version_info[:3])), "implementation": "cpython"}
    assert not list(cache.rglob("*.pyc"))
