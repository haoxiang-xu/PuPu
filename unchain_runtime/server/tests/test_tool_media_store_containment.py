"""The tool-media store must never address a directory outside its own root.

`_sweep_dir` deletes every file older than the TTL in the directory it is
given, and `sweep_session` is called at stream start and end. A session id that
resolved to the data directory would therefore reclaim chats.db and
settings.db, so the containment of `_session_dir` is a data-safety property,
not only an information-disclosure one.
"""

from __future__ import annotations

import importlib
import time

import pytest


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    module = importlib.import_module("tool_media_store")
    importlib.reload(module)
    return module


@pytest.mark.parametrize(
    "session_id",
    ["..", ".", "  ..  ", "...", "../", "..\\", "a/../..", "", "   "],
)
def test_session_dir_stays_inside_the_media_root(store, session_id):
    root = store._media_root().resolve()
    resolved = store._session_dir(session_id).resolve()
    assert resolved == root or root in resolved.parents


def test_traversing_session_id_cannot_sweep_the_data_directory(store, tmp_path):
    # A file that predates the TTL, sitting where the real databases live.
    database = tmp_path / "chats.db"
    database.write_bytes(b"user data")
    stale = time.time() - (store._ttl_seconds() + 3600)
    import os

    os.utime(database, (stale, stale))

    store.sweep_session("..")

    assert database.exists(), "sweeping a '..' session must not reach the data dir"


def test_normal_session_media_still_round_trips(store):
    import base64

    payload = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode("ascii")
    media_id = store.store_media("chat-123", payload, "image/png")
    assert media_id

    resolved = store.resolve_media(media_id, "chat-123")
    assert resolved is not None
    data, media_type = resolved
    assert media_type == "image/png"
    assert data.startswith(b"\x89PNG")


def test_traversing_session_id_writes_inside_the_root(store):
    import base64

    payload = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode("ascii")
    media_id = store.store_media("..", payload, "image/png")
    if media_id is None:
        return  # refusing the write outright is also containment
    root = store._media_root().resolve()
    written = [p for p in root.rglob(f"{media_id}.*")]
    assert written, "media written for a '..' session must land under the root"
    for path in written:
        assert root in path.resolve().parents
