"""Pytest guard: fail if any runtime module leaks in from a mutable checkout."""
from pathlib import Path
import hashlib
import os
import sys
import pytest


def pytest_sessionstart(session):
    wheel = Path(os.environ['CHECKPOINT_WHEEL']).resolve()
    expected = os.environ['CHECKPOINT_WHEEL_SHA256']
    assert hashlib.sha256(wheel.read_bytes()).hexdigest() == expected
    import unchain
    assert str(unchain.__file__).startswith(str(wheel) + '/'), unchain.__file__


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_teardown(item, nextitem):
    yield
    wheel = str(Path(os.environ['CHECKPOINT_WHEEL']).resolve()) + '/'
    foreign = []
    for name, module in tuple(sys.modules.items()):
        if name == 'unchain' or name.startswith('unchain.'):
            filename = getattr(module, '__file__', None)
            if filename and not str(filename).startswith(wheel):
                foreign.append((name, filename))
    assert not foreign, f'Runtime source escaped fixed wheel: {foreign}'
