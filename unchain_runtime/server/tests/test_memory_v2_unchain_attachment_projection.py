from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from memory_v2_unchain_attachment_projection import (
    PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE,
    PUPU_ATTACHMENT_DESCRIPTOR_SCHEMA,
    PupuAttachmentProjectionError,
    decode_pupu_attachment_source,
)
from memory_v2_unchain_shadow_input import persist_shadow_input_attachments
from unchain.context import (
    ArtifactService,
    ContextModelProjectionError,
    HostResolvedAttachment,
    ModelContextProjection,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _artifacts(root: Path) -> ArtifactService:
    return ArtifactService(
        SQLiteContextV2Store(
            database_path=root / "context_v2.sqlite3",
            object_directory=root / "objects",
        ).bind_execution("execution-a"),
        sanitizer=lambda content, media_type: content,
    )


def _persist(root: Path, *blocks: dict) -> tuple[HostResolvedAttachment, ...]:
    return persist_shadow_input_attachments(
        owner_chat_id="chat-a",
        execution_id="execution-a",
        attachment_blocks=blocks,
        database_path=root / "context_v2.sqlite3",
        object_directory=root / "objects",
    )


def test_pupu_base64_image_and_pdf_become_canonical_model_blocks(
    tmp_path: Path,
) -> None:
    image_bytes = b"\x89PNG\r\n\x1a\nimage"
    pdf_bytes = b"%PDF-1.7\nreport"
    attachments = _persist(
        tmp_path,
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.b64encode(image_bytes).decode("ascii"),
            },
        },
        {
            "type": "pdf",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.b64encode(pdf_bytes).decode("ascii"),
                "filename": "report.pdf",
            },
        },
    )

    result = ModelContextProjection(
        _artifacts(tmp_path),
        remote_source_decoder=decode_pupu_attachment_source,
    ).project(
        [
            {
                "role": "user",
                "content": "inspect both",
                "attachments": [item.to_dict() for item in attachments],
            }
        ],
        provider="openai",
    )

    assert result == (
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "inspect both"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": base64.b64encode(image_bytes).decode("ascii"),
                    },
                },
                {
                    "type": "pdf",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": base64.b64encode(pdf_bytes).decode("ascii"),
                        "filename": "attachment-2.pdf",
                    },
                },
            ],
        },
    )


@pytest.mark.parametrize(
    ("block", "expected"),
    (
        (
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": "https://example.test/photo.png",
                    "media_type": "image/png",
                },
            },
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": "https://example.test/photo.png",
                    "media_type": "image/png",
                },
            },
        ),
        (
            {
                "type": "pdf",
                "source": {"type": "file_id", "file_id": "file-123"},
            },
            {
                "type": "pdf",
                "source": {"type": "file_id", "file_id": "file-123"},
            },
        ),
    ),
)
def test_pupu_remote_descriptor_roundtrips_through_verified_artifact(
    tmp_path: Path,
    block: dict,
    expected: dict,
) -> None:
    attachments = _persist(tmp_path, block)

    result = ModelContextProjection(
        _artifacts(tmp_path),
        remote_source_decoder=decode_pupu_attachment_source,
    ).project(
        [
            {
                "role": "user",
                "content": "",
                "attachments": [attachments[0].to_dict()],
            }
        ],
        provider="anthropic",
    )

    assert result[0]["content"] == [expected]
    assert "attachments" not in result[0]


def test_ollama_remote_attachment_fails_closed_before_provider_transport(
    tmp_path: Path,
) -> None:
    attachments = _persist(
        tmp_path,
        {
            "type": "image",
            "source": {
                "type": "url",
                "url": "https://example.test/photo.png",
            },
        },
    )

    with pytest.raises(ContextModelProjectionError) as raised:
        ModelContextProjection(
            _artifacts(tmp_path),
            remote_source_decoder=decode_pupu_attachment_source,
        ).project(
            [
                {
                    "role": "user",
                    "content": "inspect",
                    "attachments": [attachments[0].to_dict()],
                }
            ],
            provider="ollama",
        )

    assert raised.value.reason == "provider_attachment_unsupported"
    assert raised.value.boundary == "model_context_projection"


def test_pupu_descriptor_decoder_rejects_noncanonical_or_drifted_payloads() -> None:
    descriptor = {
        "schema": PUPU_ATTACHMENT_DESCRIPTOR_SCHEMA,
        "kind": "image",
        "source": {
            "type": "url",
            "url": "https://example.test/photo.png",
        },
    }
    encoded = json.dumps(
        descriptor,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    from unchain.journal import ArtifactRef, ResourceRef

    attachment = HostResolvedAttachment(
        artifact=ArtifactRef(
            ref=ResourceRef("artifact", "descriptor-a", 1),
            media_type=PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE,
            byte_length=len(encoded),
            sha256="0" * 64,
        ),
        kind="pdf",
        name="remote.json",
        media_type=PUPU_ATTACHMENT_DESCRIPTOR_MEDIA_TYPE,
    )

    with pytest.raises(PupuAttachmentProjectionError, match="kind changed"):
        decode_pupu_attachment_source(attachment, encoded)
    with pytest.raises(PupuAttachmentProjectionError, match="canonical JSON"):
        decode_pupu_attachment_source(attachment, encoded + b"\n")
