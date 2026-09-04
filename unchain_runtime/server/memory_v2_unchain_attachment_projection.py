"""Decode PuPu's durable remote-attachment descriptor for Unchain model input."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

from unchain.context import HostResolvedAttachment


PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE = (
    "application/vnd.pupu.attachment-descriptor+json"
)
PUPU_ATTACHMENT_DESCRIPTOR_SCHEMA = (
    "pupu.memory-v2-shadow-attachment-descriptor.v1"
)


class PupuAttachmentProjectionError(RuntimeError):
    """A persisted PuPu remote descriptor failed exact decoding."""


def _canonical_json(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        dict(value),
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _exact_fields(
    value: Mapping[str, Any],
    *,
    required: frozenset[str],
    optional: frozenset[str] = frozenset(),
) -> None:
    fields = frozenset(value)
    if not required.issubset(fields) or not fields.issubset(required | optional):
        raise PupuAttachmentProjectionError(
            "remote attachment descriptor fields are invalid"
        )


def _text(value: object, *, field_name: str, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value) > maximum
    ):
        raise PupuAttachmentProjectionError(
            f"remote attachment {field_name} is invalid"
        )
    return value


def decode_pupu_attachment_source(
    attachment: HostResolvedAttachment,
    content: bytes,
) -> Mapping[str, Any]:
    """Return one exact provider-neutral URL/file-id source descriptor."""

    if not isinstance(attachment, HostResolvedAttachment):
        raise TypeError("attachment must be a HostResolvedAttachment")
    if attachment.media_type != PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE:
        raise PupuAttachmentProjectionError(
            "remote attachment media type is unsupported"
        )
    if not isinstance(content, bytes):
        raise TypeError("remote attachment content must be bytes")
    try:
        decoded = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PupuAttachmentProjectionError(
            "remote attachment descriptor is not UTF-8 JSON"
        ) from error
    if not isinstance(decoded, Mapping) or _canonical_json(decoded) != content:
        raise PupuAttachmentProjectionError(
            "remote attachment descriptor is not canonical JSON"
        )
    _exact_fields(
        decoded,
        required=frozenset({"schema", "kind", "source"}),
    )
    if decoded.get("schema") != PUPU_ATTACHMENT_DESCRIPTOR_SCHEMA:
        raise PupuAttachmentProjectionError(
            "remote attachment descriptor schema is unsupported"
        )
    kind = _text(decoded.get("kind"), field_name="kind", maximum=64).casefold()
    if kind not in {"image", "pdf"} or kind != attachment.kind.casefold():
        raise PupuAttachmentProjectionError(
            "remote attachment kind changed from its durable envelope"
        )
    source = decoded.get("source")
    if not isinstance(source, Mapping):
        raise PupuAttachmentProjectionError(
            "remote attachment source is invalid"
        )
    source_type = _text(
        source.get("type"),
        field_name="source type",
        maximum=64,
    ).casefold()
    if source_type == "url":
        _exact_fields(
            source,
            required=frozenset({"type", "url"}),
            optional=frozenset({"declared_media_type"}),
        )
        url = _text(source.get("url"), field_name="URL", maximum=8192)
        split = urlsplit(url)
        if split.scheme.casefold() not in {"http", "https"} or not split.netloc:
            raise PupuAttachmentProjectionError(
                "remote attachment URL is invalid"
            )
        result = {"type": "url", "url": url}
        declared_media_type = source.get("declared_media_type")
        if declared_media_type is not None:
            media_type = _text(
                declared_media_type,
                field_name="declared media type",
                maximum=255,
            ).casefold()
            if (kind == "image" and not media_type.startswith("image/")) or (
                kind == "pdf" and media_type != "application/pdf"
            ):
                raise PupuAttachmentProjectionError(
                    "remote attachment declared media type changed modality"
                )
            result["media_type"] = media_type
        return result
    if source_type == "file_id":
        _exact_fields(
            source,
            required=frozenset({"type", "file_id"}),
        )
        if kind != "pdf":
            raise PupuAttachmentProjectionError(
                "remote attachment file_id is only valid for PDF"
            )
        return {
            "type": "file_id",
            "file_id": _text(
                source.get("file_id"),
                field_name="file_id",
                maximum=4096,
            ),
        }
    raise PupuAttachmentProjectionError(
        "remote attachment source type is unsupported"
    )


__all__ = [
    "PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE",
    "PUPU_ATTACHMENT_DESCRIPTOR_SCHEMA",
    "PupuAttachmentProjectionError",
    "decode_pupu_attachment_source",
]
