"""Never use a developer's real OS credential service in automated tests.

Only the native boundary is substituted: encryption, files, migration, locking
and the production MCP readers/writers still run normally.
"""
import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


@pytest.fixture(autouse=True)
def mcp_test_keyring(monkeypatch):
    import mcp_credential_store

    class MemoryKeyring:
        def __init__(self):
            self.values = {}

        def get_password(self, service, account):
            return self.values.get((service, account))

        def set_password(self, service, account, value):
            self.values[(service, account)] = value

    backend = MemoryKeyring()
    monkeypatch.setattr(mcp_credential_store, "_native_keyring", lambda: backend)
    return backend
