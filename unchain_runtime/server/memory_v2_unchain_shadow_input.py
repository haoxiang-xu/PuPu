"""Durable host preparation for PuPu's sanitized shadow input attachments.

The route owns syntax sanitization.  This adapter accepts only those bounded
image/PDF block shapes, persists their bytes (or a neutral remote descriptor)
through Unchain's official ArtifactService, and returns exact
HostResolvedAttachment values for the run-binding draft.  It never fetches a
URL and never accepts a host filesystem path.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from memory_v2_sanitizer import StorageTrust, sanitize_for_storage
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from unchain.context import (
    MAX_CURRENT_INPUT_ATTACHMENTS,
    ArtifactService,
    HostResolvedAttachment,
)
from unchain.journal.models import _required_text
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


_DESCRIPTOR_MEDIA_TYPE = "application/vnd.pupu.attachment-descriptor+json"
_DESCRIPTOR_SCHEMA = "pupu.memory-v2-shadow-attachment-descriptor.v1"
_ALLOWED_KINDS = frozenset({"image", "pdf"})


class PupuMemoryV2ShadowInputError(RuntimeError):
    """A sanitized route attachment could not cross the durable boundary."""


@dataclass(frozen=True, slots=True)
class _PreparedAttachment:
    content: bytes
    media_type: str
    kind: str
    name: str
    operation_id: str


def _canonical_json(value: Mapping[str, Any]) -> bytes:
    try:
        return json.dumps(
            dict(value),
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuMemoryV2ShadowInputError(
            "attachment descriptor is not canonical JSON"
        ) from error


def _bounded_text(value: object, field_name: str, *, maximum: int) -> str:
    try:
        return _required_text(value, field_name, maximum=maximum)
    except (TypeError, ValueError) as error:
        raise PupuMemoryV2ShadowInputError(
            f"attachment {field_name} is invalid"
        ) from error


def _exact_keys(
    value: Mapping[str, Any],
    *,
    required: frozenset[str],
    optional: frozenset[str] = frozenset(),
    label: str,
) -> None:
    keys = frozenset(value)
    if not required.issubset(keys) or not keys.issubset(required | optional):
        raise PupuMemoryV2ShadowInputError(
            f"attachment {label} is not a sanitized route shape"
        )


def _operation_id(
    *,
    execution_id: str,
    ordinal: int,
    kind: str,
    source_type: str,
    media_type: str,
    content: bytes,
) -> str:
    binding = _canonical_json(
        {
            "schema": "pupu.memory-v2-shadow-attachment-operation.v1",
            "execution_id": execution_id,
            "ordinal": ordinal,
            "kind": kind,
            "source_type": source_type,
            "media_type": media_type,
            "content_sha256": hashlib.sha256(content).hexdigest(),
            "content_bytes": len(content),
        }
    )
    return "shadow-input-attachment-" + hashlib.sha256(binding).hexdigest()


def _extension(media_type: str, kind: str) -> str:
    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }.get(media_type, kind)


def _prepare_base64(
    *,
    source: Mapping[str, Any],
    kind: str,
    execution_id: str,
    ordinal: int,
) -> _PreparedAttachment:
    _exact_keys(
        source,
        required=frozenset({"type", "media_type", "data"}),
        optional=frozenset({"filename"}),
        label="base64 source",
    )
    data = _bounded_text(source.get("data"), "base64 data", maximum=48 * 1024 * 1024)
    if data != data.strip() or any(character.isspace() for character in data):
        raise PupuMemoryV2ShadowInputError("attachment base64 data is not canonical")
    try:
        content = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as error:
        raise PupuMemoryV2ShadowInputError(
            "attachment base64 data is invalid"
        ) from error
    if not content:
        raise PupuMemoryV2ShadowInputError("attachment base64 data is empty")
    media_type = _bounded_text(
        source.get("media_type"),
        "media_type",
        maximum=255,
    ).casefold()
    if (kind == "image" and not media_type.startswith("image/")) or (
        kind == "pdf" and media_type != "application/pdf"
    ):
        raise PupuMemoryV2ShadowInputError(
            "attachment base64 media_type does not match its modality"
        )
    return _PreparedAttachment(
        content=content,
        media_type=media_type,
        kind=kind,
        name=f"attachment-{ordinal + 1}.{_extension(media_type, kind)}",
        operation_id=_operation_id(
            execution_id=execution_id,
            ordinal=ordinal,
            kind=kind,
            source_type="base64",
            media_type=media_type,
            content=content,
        ),
    )


def _prepare_url(
    *,
    source: Mapping[str, Any],
    kind: str,
    execution_id: str,
    ordinal: int,
) -> _PreparedAttachment:
    _exact_keys(
        source,
        required=frozenset({"type", "url"}),
        optional=frozenset({"media_type"}),
        label="URL source",
    )
    url = _bounded_text(source.get("url"), "URL", maximum=8192)
    split = urlsplit(url)
    if split.scheme.casefold() not in {"http", "https"} or not split.netloc:
        raise PupuMemoryV2ShadowInputError(
            "attachment URL must be an absolute http or https URL"
        )
    descriptor_source: dict[str, str] = {"type": "url", "url": url}
    declared_media_type = source.get("media_type")
    if declared_media_type not in (None, ""):
        media_type = _bounded_text(
            declared_media_type,
            "media_type",
            maximum=255,
        ).casefold()
        if (kind == "image" and not media_type.startswith("image/")) or (
            kind == "pdf" and media_type != "application/pdf"
        ):
            raise PupuMemoryV2ShadowInputError(
                "attachment URL media_type does not match its modality"
            )
        descriptor_source["declared_media_type"] = media_type
    content = _canonical_json(
        {
            "schema": _DESCRIPTOR_SCHEMA,
            "kind": kind,
            "source": descriptor_source,
        }
    )
    return _PreparedAttachment(
        content=content,
        media_type=_DESCRIPTOR_MEDIA_TYPE,
        kind=kind,
        name=f"remote-{kind}-{ordinal + 1}.json",
        operation_id=_operation_id(
            execution_id=execution_id,
            ordinal=ordinal,
            kind=kind,
            source_type="url",
            media_type=_DESCRIPTOR_MEDIA_TYPE,
            content=content,
        ),
    )


def _prepare_file_id(
    *,
    source: Mapping[str, Any],
    kind: str,
    execution_id: str,
    ordinal: int,
) -> _PreparedAttachment:
    _exact_keys(
        source,
        required=frozenset({"type", "file_id"}),
        label="file_id source",
    )
    if kind != "pdf":
        raise PupuMemoryV2ShadowInputError(
            "attachment file_id is only valid for PDF input"
        )
    file_id = _bounded_text(source.get("file_id"), "file_id", maximum=4096)
    content = _canonical_json(
        {
            "schema": _DESCRIPTOR_SCHEMA,
            "kind": kind,
            "source": {"type": "file_id", "file_id": file_id},
        }
    )
    return _PreparedAttachment(
        content=content,
        media_type=_DESCRIPTOR_MEDIA_TYPE,
        kind=kind,
        name=f"remote-pdf-{ordinal + 1}.json",
        operation_id=_operation_id(
            execution_id=execution_id,
            ordinal=ordinal,
            kind=kind,
            source_type="file_id",
            media_type=_DESCRIPTOR_MEDIA_TYPE,
            content=content,
        ),
    )


def _prepare_blocks(
    *,
    execution_id: str,
    attachment_blocks: Sequence[Mapping[str, Any]],
) -> tuple[_PreparedAttachment, ...]:
    if not isinstance(attachment_blocks, Sequence) or isinstance(
        attachment_blocks,
        (str, bytes, bytearray),
    ):
        raise PupuMemoryV2ShadowInputError("attachment blocks must be an array")
    if len(attachment_blocks) > MAX_CURRENT_INPUT_ATTACHMENTS:
        raise PupuMemoryV2ShadowInputError(
            f"attachment blocks exceed the {MAX_CURRENT_INPUT_ATTACHMENTS}-item limit"
        )
    prepared: list[_PreparedAttachment] = []
    for ordinal, block in enumerate(attachment_blocks):
        if not isinstance(block, Mapping):
            raise PupuMemoryV2ShadowInputError("attachment block must be an object")
        _exact_keys(
            block,
            required=frozenset({"type", "source"}),
            label="block",
        )
        kind = _bounded_text(block.get("type"), "type", maximum=64).casefold()
        if kind not in _ALLOWED_KINDS:
            raise PupuMemoryV2ShadowInputError("attachment type must be image or pdf")
        source = block.get("source")
        if not isinstance(source, Mapping):
            raise PupuMemoryV2ShadowInputError("attachment source must be an object")
        source_type = _bounded_text(
            source.get("type"),
            "source type",
            maximum=64,
        ).casefold()
        preparer = {
            "base64": _prepare_base64,
            "url": _prepare_url,
            "file_id": _prepare_file_id,
        }.get(source_type)
        if preparer is None:
            raise PupuMemoryV2ShadowInputError("attachment source type is unsupported")
        prepared.append(
            preparer(
                source=source,
                kind=kind,
                execution_id=execution_id,
                ordinal=ordinal,
            )
        )
    return tuple(prepared)


def _sanitize_artifact(content: bytes, media_type: str) -> bytes:
    return sanitize_for_storage(
        content,
        declared_mime=media_type,
        trust=StorageTrust.JOURNAL,
    ).data


def persist_shadow_input_attachments(
    *,
    owner_chat_id: str,
    execution_id: str,
    attachment_blocks: Sequence[Mapping[str, Any]],
    database_path: str | Path,
    object_directory: str | Path,
) -> tuple[HostResolvedAttachment, ...]:
    """Persist sanitized route blocks before binding one shadow current input."""

    owner = _bounded_text(owner_chat_id, "owner_chat_id", maximum=512)
    execution = _bounded_text(execution_id, "execution_id", maximum=512)
    prepared = _prepare_blocks(
        execution_id=execution,
        attachment_blocks=attachment_blocks,
    )
    if not prepared:
        return ()

    database = Path(database_path).expanduser().resolve()
    objects = Path(object_directory).expanduser().resolve()
    if database.name != "context_v2.sqlite3":
        raise PupuMemoryV2ShadowInputError(
            "attachment database_path must end with context_v2.sqlite3"
        )
    if objects != database.parent / "objects":
        raise PupuMemoryV2ShadowInputError(
            "attachment object_directory must be the sibling objects directory"
        )
    try:
        if is_chat_deleted(database_path=database, owner_chat_id=owner):
            raise PupuMemoryV2ShadowInputError(
                "durably deleted chat cannot persist input attachments"
            )
    except ChatDeletionError as error:
        raise PupuMemoryV2ShadowInputError(
            "chat deletion state is unavailable; attachment persistence failed closed"
        ) from error

    admission = admit_context_v2_store_owner(
        root_dir=database.parent,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    if admission.database_path != database:
        raise PupuMemoryV2ShadowInputError(
            "store ownership admission returned a different database"
        )
    store = SQLiteContextV2Store(
        database_path=database,
        object_directory=objects,
    )
    artifacts = ArtifactService(
        store.bind_execution(execution),
        sanitizer=_sanitize_artifact,
    )
    resolved: list[HostResolvedAttachment] = []
    try:
        for item in prepared:
            artifact = artifacts.persist(
                item.content,
                media_type=item.media_type,
                operation_id=item.operation_id,
            )
            resolved.append(
                HostResolvedAttachment(
                    artifact=artifact,
                    kind=item.kind,
                    name=item.name,
                    media_type=item.media_type,
                )
            )
    except PupuMemoryV2ShadowInputError:
        raise
    except Exception as error:
        raise PupuMemoryV2ShadowInputError(
            "attachment could not be persisted through the official artifact store"
        ) from error
    return tuple(resolved)


__all__ = [
    "PupuMemoryV2ShadowInputError",
    "persist_shadow_input_attachments",
]
