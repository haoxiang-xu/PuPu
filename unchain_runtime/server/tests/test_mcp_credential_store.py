"""Exercise real AEAD/files; substitute only the native credential service."""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import mcp_credential_store as store
from mcp_secrets import delete_mcp_secret_values, get_mcp_secret_value, save_mcp_secret_values

CANARY = "synthetic-only-secret-密钥-\n with whitespace "


@pytest.mark.parametrize("filename,collection", store.STORES.items())
def test_legacy_migration_and_reopen(tmp_path, filename, collection):
    path = tmp_path / filename
    legacy = {"version": 1, collection: {"fixture": {"secret": CANARY}}}
    path.write_text(json.dumps(legacy))
    assert store.read_credential_store(path) == legacy
    first = path.read_bytes()
    assert CANARY.encode() not in first
    assert b"synthetic-only-secret" not in first
    assert json.loads(first)["version"] == 2
    assert store.read_credential_store(path) == legacy
    assert path.read_bytes() == first  # Reads do not rewrite an encrypted file.
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600
    assert not list(tmp_path.glob("*.tmp"))


def test_first_second_save_delete_and_cold_process(tmp_path, mcp_test_keyring):
    save_mcp_secret_values("first", {"TOKEN": CANARY}, data_dir=tmp_path)
    save_mcp_secret_values("second", {"TOKEN": "second-canary"}, data_dir=tmp_path)
    assert get_mcp_secret_value("first", "TOKEN", data_dir=tmp_path) == CANARY
    # A fresh interpreter has no module/thread cache. Pass a synthetic test key
    # through stdin, never command arguments or production configuration.
    child = """
import json, sys
import mcp_credential_store as store
from mcp_secrets import get_mcp_secret_value
key = sys.stdin.read()
class TestKeyring:
    def get_password(self, service, account): return key
store._native_keyring = TestKeyring
assert get_mcp_secret_value('first', 'TOKEN', data_dir=sys.argv[1]) == json.loads(sys.argv[2])
"""
    result = subprocess.run([sys.executable, "-c", child, str(tmp_path), json.dumps(CANARY)],
                            input=next(iter(mcp_test_keyring.values.values())), text=True,
                            env={**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)},
                            capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr
    delete_mcp_secret_values("first", data_dir=tmp_path)
    delete_mcp_secret_values("first", data_dir=tmp_path)
    assert get_mcp_secret_value("first", "TOKEN", data_dir=tmp_path) == ""
    assert get_mcp_secret_value("second", "TOKEN", data_dir=tmp_path) == "second-canary"
    for path in tmp_path.iterdir():
        assert b"second-canary" not in path.read_bytes()


@pytest.mark.parametrize("bad", ["null", "[]", "{", '{"version":1,"version":1,"toolkits":{}}',
    '{"version":true,"toolkits":{}}', '{"version":3,"toolkits":{}}',
    '{"version":1,"toolkits":{},"extra":0}', '{"version":1,"toolkits":{"x":null}}',
    '{"version":1,"toolkits":{"x":{"TOKEN":123}}}'])
def test_invalid_legacy_never_clobbered(tmp_path, bad, mcp_test_keyring):
    path = tmp_path / "mcp_secrets.json"
    path.write_text(bad)
    with pytest.raises(store.McpCredentialStoreError):
        save_mcp_secret_values("new", {"TOKEN": "new"}, data_dir=tmp_path)
    assert path.read_text() == bad
    assert not mcp_test_keyring.values


@pytest.mark.parametrize("damage", ["ciphertext", "nonce", "profile", "store", "extra", "key", "missing"])
def test_corruption_and_missing_key_fail_closed(tmp_path, damage, mcp_test_keyring):
    path = tmp_path / "mcp_secrets.json"
    save_mcp_secret_values("first", {"TOKEN": CANARY}, data_dir=tmp_path)
    envelope = json.loads(path.read_text())
    if damage == "missing":
        mcp_test_keyring.values.clear()
    elif damage == "key":
        mcp_test_keyring.values = {k: base64.b64encode(b"x" * 32).decode() for k in mcp_test_keyring.values}
    elif damage == "extra":
        envelope["extra"] = "untrusted"
    else:
        envelope[damage] = "untrusted"
    path.write_text(json.dumps(envelope))
    before = path.read_bytes()
    keys_before = dict(mcp_test_keyring.values)
    with pytest.raises(store.McpCredentialStoreError):
        save_mcp_secret_values("new", {"TOKEN": "new"}, data_dir=tmp_path)
    assert path.read_bytes() == before
    assert mcp_test_keyring.values == keys_before
    if damage == "missing":
        with pytest.raises(store.McpCredentialStoreError):
            store.write_credential_store(tmp_path / "mcp_oauth_tokens.json",
                {"version": 1, "toolkits": {"new": {"access_token": "new"}}})
        assert not (tmp_path / "mcp_oauth_tokens.json").exists()
        assert not mcp_test_keyring.values


def test_identity_bound_to_store_and_profile(tmp_path):
    source = tmp_path / "mcp_secrets.json"
    save_mcp_secret_values("first", {"TOKEN": CANARY}, data_dir=tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    for target in (tmp_path / "mcp_oauth_tokens.json", other / source.name):
        target.write_bytes(source.read_bytes())
        with pytest.raises(store.McpCredentialStoreError):
            store.read_credential_store(target)


def test_unavailable_keychain_preserves_legacy_and_allows_credential_free(tmp_path, monkeypatch):
    def unavailable():
        raise RuntimeError(CANARY)
    monkeypatch.setattr(store, "_native_keyring", unavailable)
    assert get_mcp_secret_value("none", "TOKEN", data_dir=tmp_path) == ""
    delete_mcp_secret_values("none", data_dir=tmp_path)
    path = tmp_path / "mcp_secrets.json"
    assert not path.exists()
    legacy = json.dumps({"version": 1, "toolkits": {"old": {"TOKEN": CANARY}}})
    path.write_text(legacy)
    with pytest.raises(store.McpCredentialStoreError) as error:
        store.migrate_mcp_credentials(tmp_path)
    assert CANARY not in str(error.value)
    assert path.read_text() == legacy


def test_migration_replace_failure_retry_never_writes_plaintext_temp(tmp_path, monkeypatch):
    path = tmp_path / "mcp_secrets.json"
    legacy = json.dumps({"version": 1, "toolkits": {"old": {"TOKEN": CANARY}}})
    path.write_text(legacy)
    replace = store.os.replace
    def fail(source, target):
        assert b"synthetic-only-secret" not in Path(source).read_bytes()
        raise OSError("synthetic failure")
    monkeypatch.setattr(store.os, "replace", fail)
    with pytest.raises(store.McpCredentialStoreError):
        store.read_credential_store(path)
    assert path.read_text() == legacy
    assert not list(tmp_path.glob("*.tmp"))
    monkeypatch.setattr(store.os, "replace", replace)
    assert store.read_credential_store(path) == json.loads(legacy)
    assert b"synthetic-only-secret" not in path.read_bytes()


def test_parallel_process_first_writers_preserve_one_key_and_records(tmp_path):
    # A file-backed test double makes native-key persistence visible to spawned
    # processes. It lives outside the profile and is never a production backend.
    profile = tmp_path / "profile"
    keyfile = tmp_path / "fake-native-service"
    child = """
import sys, time
from pathlib import Path
import mcp_credential_store as store
from mcp_secrets import save_mcp_secret_values
path = Path(sys.argv[2])
class TestKeyring:
    def get_password(self, service, account):
        return path.read_text() if path.exists() else None
    def set_password(self, service, account, value):
        time.sleep(.1)
        path.write_text(value)
store._native_keyring = TestKeyring
save_mcp_secret_values(sys.argv[3], {'TOKEN': sys.argv[3]}, data_dir=sys.argv[1])
"""
    workers = [subprocess.Popen([sys.executable, "-c", child, str(profile), str(keyfile), name],
        env={**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)},
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for name in ("first", "second")]
    for worker in workers:
        _, stderr = worker.communicate(timeout=30)
        assert worker.returncode == 0, stderr
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    path = profile / "mcp_secrets.json"
    envelope = json.loads(path.read_text())
    decrypted = AESGCM(base64.b64decode(keyfile.read_text())).decrypt(
        base64.b64decode(envelope["nonce"]), base64.b64decode(envelope["ciphertext"]), store._aad(path))
    assert json.loads(decrypted)["toolkits"] == {name: {"TOKEN": name} for name in ("first", "second")}


def test_uninstall_keeps_record_when_oauth_key_is_missing(tmp_path, mcp_test_keyring):
    from mcp_oauth import save_mcp_oauth_token
    from mcp_toolkits import delete_mcp_toolkit
    toolkit = "mcp.productivity.notion-remote"
    metadata = tmp_path / "mcp_toolkits.json"
    metadata.write_text(json.dumps({"version": 1, "toolkits": [{"toolkit_id": toolkit}]}))
    before = metadata.read_bytes()
    save_mcp_oauth_token(toolkit, {"access_token": "synthetic-delete-test"}, data_dir=tmp_path)
    keys = dict(mcp_test_keyring.values)
    mcp_test_keyring.values.clear()
    with pytest.raises(store.McpCredentialStoreError):
        delete_mcp_toolkit(toolkit, data_dir=tmp_path)
    assert metadata.read_bytes() == before
    mcp_test_keyring.values.update(keys)
    assert delete_mcp_toolkit(toolkit, data_dir=tmp_path)["ok"]
    assert json.loads(metadata.read_text())["toolkits"] == []
    assert store.read_credential_store(tmp_path / "mcp_oauth_tokens.json")["toolkits"] == {}


def test_startup_migrates_all_existing_stores(tmp_path):
    for filename, collection in store.STORES.items():
        (tmp_path / filename).write_text(json.dumps({"version": 1, collection: {"old": {"secret": CANARY}}}))
    store.migrate_mcp_credentials(tmp_path)
    for filename in store.STORES:
        raw = (tmp_path / filename).read_bytes()
        assert json.loads(raw)["version"] == 2
        assert b"synthetic-only-secret" not in raw
