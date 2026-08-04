"""Storage-bound sanitizer for Context/Memory V2 payload bytes."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping

from secret_scrub_registry import redact_registered_bytes, redact_registered_text


SANITIZER_VERSION: int = 1

MEDIA_CLASS_TEXT = "text"
MEDIA_CLASS_JSON = "json"
MEDIA_CLASS_BINARY = "binary"

_REDACTED = "[REDACTED]"
_VAULT_HANDLE = "[VAULT_HANDLE]"
_SANITIZED_PAYLOAD_TOKEN = object()

_SENSITIVE_KEY_RE = re.compile(
    r"(?:^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|cookie|"
    r"private[_-]?key|access[_-]?key)(?:$|[_-])",
    re.IGNORECASE,
)

_PNG_DATA_URI_RE = re.compile(
    r"data:image/png;base64,[A-Za-z0-9+/]+={0,2}",
    re.IGNORECASE,
)
_PEM_BLOCK_RE = re.compile(
    r"-----BEGIN [A-Z0-9][A-Z0-9 ._-]*-----[\s\S]*?"
    r"-----END [A-Z0-9][A-Z0-9 ._-]*-----"
)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_VAULT_HANDLE_RE = re.compile(r"\bpvh1_[0-9a-f]{64}\b")
_BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE)
_ASSIGNMENT_RE = re.compile(
    r"\b(password|passwd|secret|token|api_key|api-key|apikey|private_key|"
    r"access_key)\s*([:=])\s*([^\s,;]{4,})",
    re.IGNORECASE,
)
_TOKEN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_-]{6,}\b"),
    re.compile(r"\bsk-proj-[A-Za-z0-9_-]{6,}\b"),
    re.compile(r"\bsk_live_[A-Za-z0-9]{6,}\b"),
    re.compile(r"\bsk_test_[A-Za-z0-9]{6,}\b"),
    re.compile(r"\bpk_live_[A-Za-z0-9]{6,}\b"),
    re.compile(r"\bSG\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{35}\b"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(r"\bxox(?:b|a|p|r|s|e)-[A-Za-z0-9-]{6,}\b"),
    re.compile(r"\bglpat-[A-Za-z0-9_-]{6,}\b"),
    re.compile(r"\bdop_v1_[A-Za-z0-9_]{6,}\b"),
    re.compile(r"\bya29\.[A-Za-z0-9._-]{6,}\b"),
    re.compile(r"\bnpm_[A-Za-z0-9_]{6,}\b"),
    re.compile(r"\bhf_[A-Za-z0-9]{6,}\b"),
    re.compile(r"\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9_]{6,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{6,}\b"),
    re.compile(r"\bBasic\s+[A-Za-z0-9+/=]{8,}", re.IGNORECASE),
)


class SanitizerError(RuntimeError):
    """Storage sanitizer failure safe for callers to translate."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = str(code or "context_v2_sanitizer_failed")


class StorageTrust(str, Enum):
    SYSTEM = "system"
    JOURNAL = "journal"
    VAULT_TAINTED = "vault_tainted"


@dataclass(frozen=True)
class MediaVerdict:
    media_class: str
    detected_mime: str
    declared_mime: str
    mismatch: bool


@dataclass(frozen=True)
class SanitizedPayload:
    data: bytes
    media_class: str
    detected_mime: str
    declared_mime: str
    media_mismatch: bool
    indexable: bool
    preview: str
    trust: StorageTrust
    sanitizer_version: int
    token: object = field(default=None, repr=False, compare=False, kw_only=True)

    def __post_init__(self) -> None:
        if self.token is not _SANITIZED_PAYLOAD_TOKEN:
            raise SanitizerError(
                "context_v2_sanitizer_invariant",
                "sanitized payload must be created by the storage sanitizer",
            )


def _normalize_mime(value: str) -> str:
    return str(value or "").split(";", 1)[0].strip().lower()


def _declared_media_class(mime_type: str) -> str:
    normalized = _normalize_mime(mime_type)
    if not normalized:
        return ""
    if normalized == "application/json" or normalized.endswith("+json"):
        return MEDIA_CLASS_JSON
    if normalized.startswith("text/") or normalized in {
        "application/javascript",
        "application/x-javascript",
        "application/xml",
        "application/xhtml+xml",
        "application/yaml",
        "application/x-yaml",
        "application/toml",
    }:
        return MEDIA_CLASS_TEXT
    if normalized in {
        "application/octet-stream",
        "application/pdf",
        "application/zip",
        "application/gzip",
        "application/x-bzip2",
        "application/x-elf",
        "application/x-mach-binary",
        "application/vnd.sqlite3",
        "application/ogg",
    } or normalized.startswith(("image/", "audio/", "video/")):
        return MEDIA_CLASS_BINARY
    return ""


def _magic_binary_mime(raw: bytes) -> str:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(raw) >= 12 and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith(b"%PDF-"):
        return "application/pdf"
    if raw.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "application/zip"
    if raw.startswith(b"\x1f\x8b"):
        return "application/gzip"
    if raw.startswith(b"BZh"):
        return "application/x-bzip2"
    if raw.startswith(b"\x7fELF"):
        return "application/x-elf"
    if raw.startswith(
        (
            b"\xfe\xed\xfa\xce",
            b"\xce\xfa\xed\xfe",
            b"\xfe\xed\xfa\xcf",
            b"\xcf\xfa\xed\xfe",
            b"\xca\xfe\xba\xbe",
        )
    ):
        return "application/x-mach-binary"
    if raw.startswith(b"SQLite format 3\x00"):
        return "application/vnd.sqlite3"
    if raw.startswith(b"OggS"):
        return "application/ogg"
    return ""


def detect_media(raw: bytes, declared_mime: str = "") -> MediaVerdict:
    raw_bytes = bytes(raw)
    normalized_declared = _normalize_mime(declared_mime)
    magic_mime = _magic_binary_mime(raw_bytes)
    if magic_mime:
        detected_class = MEDIA_CLASS_BINARY
        detected_mime = magic_mime
    else:
        try:
            decoded = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            detected_class = MEDIA_CLASS_BINARY
            detected_mime = "application/octet-stream"
        else:
            sample = raw_bytes[: 64 * 1024]
            control_count = sum(
                1
                for byte in sample
                if byte < 32 and byte not in (9, 10, 13)
            )
            control_ratio = control_count / len(sample) if sample else 0
            if b"\x00" in raw_bytes or control_ratio > 0.003:
                detected_class = MEDIA_CLASS_BINARY
                detected_mime = "application/octet-stream"
            else:
                try:
                    json.loads(decoded)
                except json.JSONDecodeError:
                    detected_class = MEDIA_CLASS_TEXT
                    detected_mime = "text/plain"
                else:
                    detected_class = MEDIA_CLASS_JSON
                    detected_mime = "application/json"
    declared_class = _declared_media_class(normalized_declared)
    return MediaVerdict(
        media_class=detected_class,
        detected_mime=detected_mime,
        declared_mime=normalized_declared,
        mismatch=bool(declared_class and declared_class != detected_class),
    )


def _protect_png_data_uris(value: str) -> tuple[str, dict[str, str]]:
    protected: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        marker = f"__PUPU_SANITIZER_PNG_DATA_URI_{len(protected)}__"
        protected[marker] = match.group(0)
        return marker

    return _PNG_DATA_URI_RE.sub(replace, value), protected


def _restore_protected(value: str, protected: Mapping[str, str]) -> str:
    restored = value
    for marker, original in protected.items():
        restored = restored.replace(marker, original)
    return restored


def _redact_assignment(match: re.Match[str]) -> str:
    assigned = match.group(3)
    if assigned in {_REDACTED, _VAULT_HANDLE}:
        return match.group(0)
    return f"{match.group(1)}{match.group(2)}{_REDACTED}"


def _registered_text_redact(value: str) -> str:
    try:
        redacted = redact_registered_text(value)
    except Exception as exc:
        raise SanitizerError(
            "context_v2_sanitizer_failed",
            "exact-value sanitizer failed",
        ) from exc
    if not isinstance(redacted, str):
        raise SanitizerError(
            "context_v2_sanitizer_failed",
            "exact-value sanitizer failed",
        )
    return redacted


def _binary_contains_protected_material(value: bytes) -> bool:
    try:
        exact_redacted = redact_registered_bytes(value)
    except Exception as exc:
        raise SanitizerError(
            "context_v2_sanitizer_failed",
            "binary content could not be prepared for storage",
        ) from exc
    if not isinstance(exact_redacted, bytes):
        raise SanitizerError(
            "context_v2_sanitizer_failed",
            "binary content could not be prepared for storage",
        )
    if exact_redacted != value:
        return True
    ascii_view = value.decode("latin-1")
    return bool(
        _PEM_BLOCK_RE.search(ascii_view)
        or _JWT_RE.search(ascii_view)
        or _VAULT_HANDLE_RE.search(ascii_view)
        or _BEARER_RE.search(ascii_view)
        or _ASSIGNMENT_RE.search(ascii_view)
        or any(pattern.search(ascii_view) for pattern in _TOKEN_PATTERNS)
    )


def sanitize_text(value: str) -> str:
    if not isinstance(value, str):
        raise SanitizerError(
            "context_v2_sanitizer_invariant",
            "text sanitizer requires a string",
        )
    # Exact registered values must be removed before protecting benign image
    # data URIs; otherwise a credential made only of base64 characters can hide
    # inside the protected span and bypass the registry scrubber.
    redacted, protected = _protect_png_data_uris(
        _registered_text_redact(value)
    )
    redacted = _PEM_BLOCK_RE.sub(_REDACTED, redacted)
    redacted = _JWT_RE.sub(_REDACTED, redacted)
    redacted = _VAULT_HANDLE_RE.sub(_VAULT_HANDLE, redacted)
    for pattern in _TOKEN_PATTERNS:
        redacted = pattern.sub(_REDACTED, redacted)
    redacted = _BEARER_RE.sub("Bearer [REDACTED]", redacted)
    redacted = _ASSIGNMENT_RE.sub(_redact_assignment, redacted)
    return _restore_protected(redacted, protected)


def _key_is_sensitive(key: str) -> bool:
    return bool(_SENSITIVE_KEY_RE.search(key.casefold().replace(" ", "_")))


def sanitize_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        sanitized: dict[str, Any] = {}
        for raw_key, child in value.items():
            key = str(raw_key)
            sanitized_key = sanitize_text(key)
            if _key_is_sensitive(key):
                sanitized[sanitized_key] = _REDACTED
            else:
                sanitized[sanitized_key] = sanitize_value(child)
        return sanitized
    if isinstance(value, list):
        return [sanitize_value(child) for child in value]
    if isinstance(value, tuple):
        return [sanitize_value(child) for child in value]
    if isinstance(value, str):
        return sanitize_text(value)
    return copy.deepcopy(value)


def sanitize_json_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            sanitize_value(value),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise SanitizerError(
            "context_v2_sanitizer_failed",
            "json payload could not be sanitized",
        ) from exc


def _payload(
    *,
    data: bytes,
    verdict: MediaVerdict,
    indexable: bool,
    preview: str,
    trust: StorageTrust,
) -> SanitizedPayload:
    if trust == StorageTrust.VAULT_TAINTED:
        indexable = False
        preview = preview[:256]
    return SanitizedPayload(
        data=data,
        media_class=verdict.media_class,
        detected_mime=verdict.detected_mime,
        declared_mime=verdict.declared_mime,
        media_mismatch=verdict.mismatch,
        indexable=indexable,
        preview=preview,
        trust=trust,
        sanitizer_version=SANITIZER_VERSION,
        token=_SANITIZED_PAYLOAD_TOKEN,
    )


def sanitize_for_storage(
    raw: bytes | bytearray | memoryview,
    *,
    declared_mime: str = "",
    trust: StorageTrust,
) -> SanitizedPayload:
    if not isinstance(trust, StorageTrust):
        raise SanitizerError(
            "context_v2_sanitizer_invariant",
            "storage trust must be supplied by the runtime",
        )
    if not isinstance(raw, (bytes, bytearray, memoryview)):
        raise SanitizerError(
            "context_v2_sanitizer_invariant",
            "storage payload must be bytes",
        )
    raw_bytes = bytes(raw)
    verdict = detect_media(raw_bytes, declared_mime)
    if verdict.media_class == MEDIA_CLASS_BINARY:
        if _binary_contains_protected_material(raw_bytes):
            # Binary bytes cannot be safely rewritten without corrupting the
            # payload. Reject before staging instead of publishing a known
            # credential or replayable Vault handle unchanged.
            raise SanitizerError(
                "context_v2_sanitizer_failed",
                "binary content could not be prepared for storage",
            )
        return _payload(
            data=raw_bytes,
            verdict=verdict,
            indexable=False,
            preview="[BINARY_CONTENT]",
            trust=trust,
        )
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SanitizerError(
            "context_v2_sanitizer_invariant",
            "non-binary payload failed utf-8 decoding",
        ) from exc
    if verdict.media_class == MEDIA_CLASS_JSON:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SanitizerError(
                "context_v2_sanitizer_invariant",
                "json payload failed after media detection",
            ) from exc
        data = sanitize_json_bytes(parsed)
        return _payload(
            data=data,
            verdict=verdict,
            indexable=True,
            preview=data.decode("utf-8")[:4096],
            trust=trust,
        )
    if verdict.media_class == MEDIA_CLASS_TEXT:
        sanitized_text = sanitize_text(text)
        return _payload(
            data=sanitized_text.encode("utf-8"),
            verdict=verdict,
            indexable=True,
            preview=sanitized_text[:4096],
            trust=trust,
        )
    raise SanitizerError(
        "context_v2_sanitizer_invariant",
        "media detector returned an invalid class",
    )
