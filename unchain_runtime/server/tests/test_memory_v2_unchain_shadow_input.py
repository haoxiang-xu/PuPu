from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from memory_v2_unchain_shadow_input import (
    PupuMemoryV2ShadowInputError,
    persist_shadow_input_attachments,
)
from unchain.context import HostResolvedAttachment
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _persist(root: Path, blocks):
    return persist_shadow_input_attachments(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attachment_blocks=blocks,
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )


def _read(root: Path, attachment: HostResolvedAttachment) -> bytes:
    store = SQLiteContextV2Store(
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )
    return store.bind_execution("execution-a").read_full_verified(
        artifact=attachment.artifact
    )


def test_base64_image_persists_real_bytes_idempotently_across_restart(
    tmp_path: Path,
) -> None:
    blocks = (
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": "iVBORw0KGgoAAAANSUhEUg==",
            },
        },
    )

    first = _persist(tmp_path, blocks)
    reopened = _persist(tmp_path, blocks)

    assert reopened == first
    assert first[0].kind == "image"
    assert first[0].media_type == "image/png"
    assert _read(tmp_path, first[0]) == b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    connection = sqlite3.connect(tmp_path / "context_v2.sqlite3")
    try:
        assert connection.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0] == 1
    finally:
        connection.close()


@pytest.mark.parametrize(
    ("block", "source_type"),
    [
        (
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": "https://example.test/image.png",
                    "media_type": "image/png",
                },
            },
            "url",
        ),
        (
            {
                "type": "pdf",
                "source": {
                    "type": "file_id",
                    "file_id": "provider-file-a",
                },
            },
            "file_id",
        ),
    ],
)
def test_remote_sources_persist_neutral_readable_descriptor_without_fetching(
    tmp_path: Path,
    block,
    source_type: str,
) -> None:
    (attachment,) = _persist(tmp_path, (block,))

    descriptor = json.loads(_read(tmp_path, attachment))

    assert attachment.kind == block["type"]
    assert attachment.media_type == "application/vnd.pupu.attachment-descriptor+json"
    assert descriptor["schema"] == "pupu.memory-v2-shadow-attachment-descriptor.v1"
    assert descriptor["source"]["type"] == source_type
    assert "path" not in json.dumps(descriptor).casefold()


@pytest.mark.parametrize(
    "data",
    ["%%%", "a", "iVBORw0KGgoAAAANSUhEUg="],
)
def test_invalid_base64_fails_closed_before_any_artifact_write(
    tmp_path: Path,
    data: str,
) -> None:
    with pytest.raises(PupuMemoryV2ShadowInputError, match="base64"):
        _persist(
            tmp_path,
            (
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": data,
                    },
                },
            ),
        )

    database_path = tmp_path / "context_v2.sqlite3"
    if database_path.exists():
        connection = sqlite3.connect(database_path)
        try:
            assert (
                connection.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0] == 0
            )
        finally:
            connection.close()


def test_helper_rejects_host_file_url_without_creating_artifact(tmp_path: Path) -> None:
    with pytest.raises(PupuMemoryV2ShadowInputError, match="http"):
        _persist(
            tmp_path,
            (
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "file:///Users/red/secret.png",
                    },
                },
            ),
        )

    assert not (tmp_path / "context_v2.sqlite3").exists()
