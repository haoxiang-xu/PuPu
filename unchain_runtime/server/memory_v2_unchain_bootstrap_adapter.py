"""Thin PuPu host adapter for Unchain-owned lazy legacy bootstrap.

PuPu owns the legacy chat snapshot and its redaction boundary.  Unchain owns
the canonical journal transaction, manifest, replay detection, and receipt.
This adapter only validates the exact host hand-off and converts it to
Unchain's typed bootstrap records; it never writes a second PuPu journal.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from unchain.persistence.sqlite_legacy_bootstrap_v2 import (
    LegacyBootstrapError,
    LegacyBootstrapPayload,
    LegacyBootstrapPreflight,
    LegacyBootstrapReceipt,
    LegacyBootstrapRequest,
    LegacyGenerationDescriptor,
    LegacyMessage,
    LegacyRebaseKind,
    SQLiteLegacyBootstrapService,
    build_legacy_bootstrap_operation,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


class PupuUnchainLegacyBootstrapError(RuntimeError):
    """The PuPu snapshot cannot be safely handed to Unchain."""


_ATTACHMENT_FIELDS = frozenset({"type", "source"})
_ATTACHMENT_SOURCE_FIELDS = frozenset(
    {
        "type",
        "media_type",
        "filename",
        "file_id",
        "url_sha256",
        "content_sha256",
        "encoded_chars",
    }
)


def _canonical_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainLegacyBootstrapError(
            "legacy history must be canonical JSON"
        ) from error


def _required_text(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise PupuUnchainLegacyBootstrapError(f"{field_name} must be text")
    normalized = value.strip()
    if not normalized or "\x00" in normalized:
        raise PupuUnchainLegacyBootstrapError(f"{field_name} is invalid")
    return normalized


def _exact_bool(value: object, field_name: str) -> bool:
    if type(value) is not bool:
        raise PupuUnchainLegacyBootstrapError(
            f"legacy bootstrap preflight {field_name} must be a boolean"
        )
    return value


def _message_id(
    *,
    owner_chat_id: str,
    index: int,
    role: str,
    content: str,
    supplied: object,
) -> str:
    if supplied not in (None, ""):
        return _required_text(supplied, "legacy message id")
    digest = hashlib.sha256(
        _canonical_bytes(
            {
                "owner_chat_id": owner_chat_id,
                "index": index,
                "role": role,
                "content": content,
            }
        )
    ).hexdigest()
    return f"pupu-legacy-message-{digest}"


def _attachment_metadata_text(value: object) -> str:
    if value in (None, (), []):
        return ""
    if isinstance(value, (str, bytes, bytearray)) or not isinstance(value, Sequence):
        raise PupuUnchainLegacyBootstrapError(
            "legacy attachment metadata must be a sanitized sequence"
        )
    normalized: list[dict[str, Any]] = []
    for raw in value:
        if not isinstance(raw, Mapping) or not set(raw).issubset(_ATTACHMENT_FIELDS):
            raise PupuUnchainLegacyBootstrapError(
                "legacy attachment metadata is not host-sanitized"
            )
        source = raw.get("source")
        if not isinstance(source, Mapping) or not set(source).issubset(
            _ATTACHMENT_SOURCE_FIELDS
        ):
            raise PupuUnchainLegacyBootstrapError(
                "legacy attachment source metadata is not host-sanitized"
            )
        attachment_type = raw.get("type")
        source_type = source.get("type")
        if not isinstance(attachment_type, str) or not isinstance(source_type, str):
            raise PupuUnchainLegacyBootstrapError(
                "legacy attachment metadata types must be text"
            )
        normalized.append(
            {
                "type": attachment_type.strip(),
                "source": dict(source),
            }
        )
    encoded = _canonical_bytes(normalized)
    if len(encoded) > 128 * 1024:
        raise PupuUnchainLegacyBootstrapError(
            "legacy attachment metadata exceeds the bootstrap limit"
        )
    return "[PuPu legacy attachment metadata]\n" + encoded.decode("utf-8")


def derive_pupu_legacy_source_revision(
    *,
    owner_chat_id: str,
    history: Sequence[Mapping[str, Any]],
) -> str:
    """Derive the stable host snapshot revision when no DB revision is exposed."""

    owner = _required_text(owner_chat_id, "owner_chat_id")
    if isinstance(history, (str, bytes, bytearray)) or not isinstance(
        history, Sequence
    ):
        raise PupuUnchainLegacyBootstrapError(
            "legacy history must be a message sequence"
        )
    digest = hashlib.sha256(
        _canonical_bytes(
            {
                "owner_chat_id": owner,
                "history": [dict(item) for item in history],
            }
        )
    ).hexdigest()
    return f"pupu-chat-revision-{digest}"


def _legacy_messages(
    *,
    owner_chat_id: str,
    history: Sequence[Mapping[str, Any]],
) -> tuple[LegacyMessage, ...]:
    if isinstance(history, (str, bytes, bytearray)) or not isinstance(
        history, Sequence
    ):
        raise PupuUnchainLegacyBootstrapError(
            "legacy history must be a user/assistant message sequence"
        )
    messages: list[LegacyMessage] = []
    for index, raw in enumerate(history):
        if not isinstance(raw, Mapping):
            raise PupuUnchainLegacyBootstrapError(
                "legacy history must contain user/assistant message records"
            )
        role = raw.get("role")
        if role not in {"user", "assistant"}:
            raise PupuUnchainLegacyBootstrapError(
                "legacy history may contain only user/assistant messages"
            )
        content = raw.get("content")
        if not isinstance(content, str):
            raise PupuUnchainLegacyBootstrapError(
                "legacy message content must be sanitized text"
            )
        normalized_content = content.strip()
        attachment_text = _attachment_metadata_text(raw.get("attachments"))
        if "\x00" in normalized_content:
            raise PupuUnchainLegacyBootstrapError(
                "legacy message content must be sanitized text"
            )
        if attachment_text:
            normalized_content = (
                f"{normalized_content}\n\n{attachment_text}"
                if normalized_content
                else attachment_text
            )
        if not normalized_content:
            raise PupuUnchainLegacyBootstrapError(
                "legacy message content must be non-empty sanitized text"
            )
        try:
            messages.append(
                LegacyMessage(
                    message_id=_message_id(
                        owner_chat_id=owner_chat_id,
                        index=index,
                        role=role,
                        content=normalized_content,
                        supplied=raw.get("id", raw.get("message_id")),
                    ),
                    role=role,
                    content=normalized_content,
                )
            )
        except (TypeError, ValueError) as error:
            raise PupuUnchainLegacyBootstrapError(
                "legacy history message is invalid"
            ) from error
    if not messages:
        raise PupuUnchainLegacyBootstrapError(
            "legacy history must contain user/assistant messages"
        )
    return tuple(messages)


def normalize_pupu_legacy_history(
    *,
    owner_chat_id: str,
    history: Sequence[Mapping[str, Any]],
) -> tuple[LegacyMessage, ...]:
    """Freeze PuPu's already-sanitized chat snapshot into typed messages.

    The atomic generation bootstrap and the read-only Legacy adapter must use
    exactly the same attachment and message-id normalization.  Keeping the
    host normalization here prevents the two persistence paths from deriving
    different identities for the same chat snapshot.
    """

    return _legacy_messages(
        owner_chat_id=_required_text(owner_chat_id, "owner_chat_id"),
        history=history,
    )


def _open_service(
    *,
    database_path: Path | str,
    object_directory: Path | str,
    owner_chat_id: str,
) -> SQLiteLegacyBootstrapService:
    database = Path(database_path).expanduser().resolve()
    objects = Path(object_directory).expanduser().resolve()
    admission = admit_context_v2_store_owner(
        root_dir=database.parent,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    if admission.database_path != database:
        raise PupuUnchainLegacyBootstrapError(
            "single-store admission returned a different database path"
        )
    expected_objects = database.parent / "objects"
    if objects != expected_objects:
        raise PupuUnchainLegacyBootstrapError(
            "single-store admission returned a different object directory"
        )
    try:
        from unchain.persistence.sqlite_chat_deletion_v2 import is_chat_deleted

        if is_chat_deleted(
            database_path=database,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainLegacyBootstrapError(
                "durably deleted chat cannot be bootstrapped"
            )
        store = SQLiteContextV2Store(
            database_path=database,
            object_directory=objects,
        )
        return SQLiteLegacyBootstrapService(store)
    except PupuUnchainLegacyBootstrapError:
        raise
    except (OSError, RuntimeError, TypeError, ValueError) as error:
        raise PupuUnchainLegacyBootstrapError(
            "Unchain legacy bootstrap store is unavailable"
        ) from error


def _receipt_dict(receipt: LegacyBootstrapReceipt) -> dict[str, Any]:
    return {
        "owner_chat_id": receipt.owner_chat_id,
        "source_revision": receipt.source_revision,
        "session_id": receipt.session_id,
        "execution_id": receipt.execution_id,
        "generation_id": receipt.generation_id,
        "attempt_id": receipt.attempt_id,
        "capture_status": receipt.capture_status,
        "message_count": receipt.message_count,
        "ready_for_sticky_v2": receipt.ready_for_sticky_v2,
        "duplicate": receipt.duplicate,
        "manifest_sha256": receipt.manifest_sha256,
        "first_cursor": receipt.first_cursor.to_dict(),
        "last_cursor": receipt.last_cursor.to_dict(),
    }


def bootstrap_pupu_legacy_history_into_unchain(
    *,
    database_path: Path | str,
    object_directory: Path | str,
    owner_chat_id: str,
    session_id: str,
    execution_id: str,
    generation_id: str,
    attempt_id: str,
    source_revision: str,
    history: Sequence[Mapping[str, Any]],
    operation_id: str,
    preflight_proof_id: str,
    no_unfinished_durable_checkpoint: bool,
    no_pending_interaction: bool,
    host_snapshot_sanitized: bool,
    rebase_kind: str = "initial",
    previous_generation_id: str = "",
) -> dict[str, Any]:
    """Transactionally import one exact, host-sanitized PuPu history snapshot."""

    normalized_owner = _required_text(owner_chat_id, "owner_chat_id")
    preflight = LegacyBootstrapPreflight(
        proof_id=_required_text(preflight_proof_id, "preflight_proof_id"),
        no_unfinished_durable_checkpoint=_exact_bool(
            no_unfinished_durable_checkpoint,
            "no_unfinished_durable_checkpoint",
        ),
        no_pending_interaction=_exact_bool(
            no_pending_interaction,
            "no_pending_interaction",
        ),
        host_snapshot_sanitized=_exact_bool(
            host_snapshot_sanitized,
            "host_snapshot_sanitized",
        ),
    )
    if not preflight.permits_bootstrap:
        raise PupuUnchainLegacyBootstrapError(
            "legacy bootstrap preflight did not permit persistence"
        )
    try:
        kind = LegacyRebaseKind(rebase_kind)
        payload = LegacyBootstrapPayload(
            owner_chat_id=normalized_owner,
            source_revision=_required_text(source_revision, "source_revision"),
            messages=_legacy_messages(
                owner_chat_id=normalized_owner,
                history=history,
            ),
            generation=LegacyGenerationDescriptor(
                session_id=_required_text(session_id, "session_id"),
                execution_id=_required_text(execution_id, "execution_id"),
                generation_id=_required_text(generation_id, "generation_id"),
                attempt_id=_required_text(attempt_id, "attempt_id"),
                rebase_kind=kind,
                previous_generation_id=previous_generation_id,
            ),
            preflight=preflight,
        )
        request = LegacyBootstrapRequest(
            payload=payload,
            operation=build_legacy_bootstrap_operation(
                operation_id=_required_text(operation_id, "operation_id"),
                payload=payload,
            ),
        )
        receipt = _open_service(
            database_path=database_path,
            object_directory=object_directory,
            owner_chat_id=normalized_owner,
        ).bootstrap(request)
        return _receipt_dict(receipt)
    except PupuUnchainLegacyBootstrapError:
        raise
    except (LegacyBootstrapError, TypeError, ValueError) as error:
        raise PupuUnchainLegacyBootstrapError(
            "Unchain legacy bootstrap rejected the host snapshot"
        ) from error


def read_pupu_legacy_bootstrap_receipt(
    *,
    database_path: Path | str,
    object_directory: Path | str,
    owner_chat_id: str,
) -> dict[str, Any] | None:
    """Read and integrity-check the current receipt after a cold restart."""

    try:
        normalized_owner = _required_text(owner_chat_id, "owner_chat_id")
        receipt = _open_service(
            database_path=database_path,
            object_directory=object_directory,
            owner_chat_id=normalized_owner,
        ).current(normalized_owner)
    except PupuUnchainLegacyBootstrapError:
        raise
    except (LegacyBootstrapError, TypeError, ValueError) as error:
        raise PupuUnchainLegacyBootstrapError(
            "Unchain legacy bootstrap receipt is unavailable"
        ) from error
    return _receipt_dict(receipt) if receipt is not None else None


__all__ = [
    "PupuUnchainLegacyBootstrapError",
    "bootstrap_pupu_legacy_history_into_unchain",
    "derive_pupu_legacy_source_revision",
    "read_pupu_legacy_bootstrap_receipt",
]
