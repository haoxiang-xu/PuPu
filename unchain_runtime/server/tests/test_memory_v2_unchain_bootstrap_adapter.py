from __future__ import annotations

from pathlib import Path

import pytest

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_bootstrap_adapter import (
    PupuUnchainLegacyBootstrapError,
    bootstrap_pupu_legacy_history_into_unchain,
    derive_pupu_legacy_source_revision,
    read_pupu_legacy_bootstrap_receipt,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _paths(tmp_path: Path) -> tuple[Path, Path]:
    return tmp_path / "context_v2.sqlite3", tmp_path / "objects"


def _request(tmp_path: Path) -> dict[str, object]:
    database_path, object_directory = _paths(tmp_path)
    return {
        "database_path": database_path,
        "object_directory": object_directory,
        "owner_chat_id": "chat-a",
        "session_id": "session-a",
        "execution_id": "session-a",
        "generation_id": "generation-a",
        "attempt_id": "attempt-a",
        "source_revision": "chat-revision-7",
        "history": (
            {"id": "message-1", "role": "user", "content": "Remember alpha"},
            {"id": "message-2", "role": "assistant", "content": "Alpha saved"},
        ),
        "operation_id": "legacy-bootstrap-chat-a-generation-a",
        "preflight_proof_id": "legacy-preflight-chat-a-generation-a",
        "no_unfinished_durable_checkpoint": True,
        "no_pending_interaction": True,
        "host_snapshot_sanitized": True,
    }


def test_host_adapter_imports_sanitized_history_into_official_unchain_journal(
    tmp_path: Path,
) -> None:
    request = _request(tmp_path)

    receipt = bootstrap_pupu_legacy_history_into_unchain(**request)

    assert receipt == {
        "owner_chat_id": "chat-a",
        "source_revision": "chat-revision-7",
        "session_id": "session-a",
        "execution_id": "session-a",
        "generation_id": "generation-a",
        "attempt_id": "attempt-a",
        "capture_status": "legacy_partial",
        "message_count": 2,
        "ready_for_sticky_v2": True,
        "duplicate": False,
        "manifest_sha256": receipt["manifest_sha256"],
        "first_cursor": receipt["first_cursor"],
        "last_cursor": receipt["last_cursor"],
    }
    store = SQLiteContextV2Store(
        database_path=request["database_path"],
        object_directory=request["object_directory"],
    )
    events = store.bind_execution("session-a").capture_snapshot().events
    assert [event.event_type for event in events] == [
        "message.user",
        "message.assistant",
    ]
    assert [event.payload["message"]["content"] for event in events] == [
        "Remember alpha",
        "Alpha saved",
    ]


def test_host_adapter_replays_after_restart_without_duplicate_events(
    tmp_path: Path,
) -> None:
    request = _request(tmp_path)
    first = bootstrap_pupu_legacy_history_into_unchain(**request)

    replay = bootstrap_pupu_legacy_history_into_unchain(
        **{**request, "operation_id": "legacy-bootstrap-chat-a-replay"}
    )
    reopened = read_pupu_legacy_bootstrap_receipt(
        database_path=request["database_path"],
        object_directory=request["object_directory"],
        owner_chat_id="chat-a",
    )

    assert first["duplicate"] is False
    assert replay["duplicate"] is True
    assert reopened == {**first, "duplicate": False}
    store = SQLiteContextV2Store(
        database_path=request["database_path"],
        object_directory=request["object_directory"],
    )
    assert len(store.bind_execution("session-a").capture_snapshot().events) == 2


def test_host_adapter_derives_stable_message_ids_without_accepting_tool_history(
    tmp_path: Path,
) -> None:
    request = _request(tmp_path)
    request["history"] = (
        {"role": "user", "content": "same"},
        {"role": "assistant", "content": "same"},
    )
    first = bootstrap_pupu_legacy_history_into_unchain(**request)
    second = bootstrap_pupu_legacy_history_into_unchain(
        **{**request, "operation_id": "legacy-bootstrap-derived-id-replay"}
    )

    assert first["manifest_sha256"] == second["manifest_sha256"]
    assert second["duplicate"] is True

    invalid = _request(tmp_path / "invalid")
    invalid["history"] = ({"role": "tool", "content": "must not forge a tool result"},)
    with pytest.raises(PupuUnchainLegacyBootstrapError, match="user/assistant"):
        bootstrap_pupu_legacy_history_into_unchain(**invalid)


@pytest.mark.parametrize(
    "preflight_field",
    (
        "no_unfinished_durable_checkpoint",
        "no_pending_interaction",
        "host_snapshot_sanitized",
    ),
)
def test_host_adapter_fails_closed_before_writing_when_preflight_fails(
    tmp_path: Path,
    preflight_field: str,
) -> None:
    request = _request(tmp_path)
    request[preflight_field] = False

    with pytest.raises(PupuUnchainLegacyBootstrapError, match="preflight"):
        bootstrap_pupu_legacy_history_into_unchain(**request)

    database_path, _ = _paths(tmp_path)
    if database_path.exists():
        store = SQLiteContextV2Store(
            database_path=database_path,
            object_directory=request["object_directory"],
        )
        assert store.bind_execution("session-a").capture_snapshot().events == ()


def test_host_adapter_requires_the_single_unchain_owned_database(
    tmp_path: Path,
) -> None:
    request = _request(tmp_path)
    database_path, _ = _paths(tmp_path)
    admission = admit_context_v2_store_owner(
        root_dir=tmp_path,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    assert admission.database_path == database_path

    foreign_path = tmp_path / "other.sqlite3"
    request["database_path"] = foreign_path
    with pytest.raises(PupuUnchainLegacyBootstrapError, match="database path"):
        bootstrap_pupu_legacy_history_into_unchain(**request)


def test_host_adapter_rejects_unsanitized_or_structured_content(tmp_path: Path) -> None:
    request = _request(tmp_path)
    request["history"] = ({"role": "user", "content": {"password": "plaintext"}},)

    with pytest.raises(PupuUnchainLegacyBootstrapError, match="text"):
        bootstrap_pupu_legacy_history_into_unchain(**request)


def test_host_adapter_preserves_sanitized_attachment_metadata_as_legacy_text(
    tmp_path: Path,
) -> None:
    request = _request(tmp_path)
    request["history"] = (
        {
            "role": "user",
            "content": "",
            "attachments": (
                {
                    "type": "file",
                    "source": {
                        "type": "base64",
                        "filename": "notes.txt",
                        "content_sha256": "a" * 64,
                        "encoded_chars": 120,
                    },
                },
            ),
        },
    )
    request["source_revision"] = derive_pupu_legacy_source_revision(
        owner_chat_id="chat-a",
        history=request["history"],
    )

    receipt = bootstrap_pupu_legacy_history_into_unchain(**request)

    store = SQLiteContextV2Store(
        database_path=request["database_path"],
        object_directory=request["object_directory"],
    )
    event = store.bind_execution("session-a").capture_snapshot().events[0]
    content = event.payload["message"]["content"]
    assert receipt["source_revision"].startswith("pupu-chat-revision-")
    assert "PuPu legacy attachment metadata" in content
    assert "notes.txt" in content
    assert "a" * 64 in content


def test_source_revision_is_stable_and_owner_bound() -> None:
    history = (
        {"role": "user", "content": "alpha"},
        {"role": "assistant", "content": "beta"},
    )

    first = derive_pupu_legacy_source_revision(
        owner_chat_id="chat-a",
        history=history,
    )
    same = derive_pupu_legacy_source_revision(
        owner_chat_id="chat-a",
        history=history,
    )
    other_owner = derive_pupu_legacy_source_revision(
        owner_chat_id="chat-b",
        history=history,
    )

    assert first == same
    assert first != other_owner


def test_host_adapter_rejects_a_durably_deleted_chat_before_bootstrap(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from unchain.persistence import sqlite_chat_deletion_v2

    monkeypatch.setattr(
        sqlite_chat_deletion_v2,
        "is_chat_deleted",
        lambda **kwargs: kwargs["owner_chat_id"] == "chat-a",
    )

    with pytest.raises(PupuUnchainLegacyBootstrapError, match="deleted"):
        bootstrap_pupu_legacy_history_into_unchain(**_request(tmp_path))
