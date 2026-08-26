"""Secret redaction helpers shared by vault-backed sinks."""

from __future__ import annotations

import base64
import json
import math
import re
import urllib.parse
from typing import Any, Mapping, Sequence


REDACTION_MARKER = "[REDACTED]"


def _secret_encodings(plaintext: str) -> tuple[str, ...]:
    raw = plaintext.encode("utf-8")
    quoted = urllib.parse.quote(plaintext, safe="")
    quoted_plus = urllib.parse.quote_plus(plaintext, safe="")
    fully_percent_encoded = "".join(f"%{byte:02X}" for byte in raw)
    variants = {
        plaintext,
        json.dumps(plaintext, ensure_ascii=False)[1:-1],
        json.dumps(plaintext, ensure_ascii=True)[1:-1],
        quoted,
        quoted_plus,
        fully_percent_encoded,
        fully_percent_encoded.lower(),
        re.sub(
            r"%[0-9A-Fa-f]{2}",
            lambda match: match.group(0).lower(),
            quoted,
        ),
        re.sub(
            r"%[0-9A-Fa-f]{2}",
            lambda match: match.group(0).lower(),
            quoted_plus,
        ),
        base64.b64encode(raw).decode("ascii"),
        base64.urlsafe_b64encode(raw).decode("ascii"),
        raw.hex(),
        raw.hex().upper(),
    }
    for encoded in tuple(variants):
        if encoded.endswith("="):
            variants.add(encoded.rstrip("="))
    return tuple(sorted((item for item in variants if item), key=len, reverse=True))


def _percent_case_pattern(encoded: str) -> str:
    parts = []
    index = 0
    while index < len(encoded):
        if (
            encoded[index] == "%"
            and index + 2 < len(encoded)
            and all(
                character in "0123456789abcdefABCDEF"
                for character in encoded[index + 1:index + 3]
            )
        ):
            escaped = ["%"]
            for character in encoded[index + 1:index + 3]:
                if character.isalpha():
                    escaped.append(
                        f"[{character.lower()}{character.upper()}]"
                    )
                else:
                    escaped.append(character)
            parts.append("".join(escaped))
            index += 3
            continue
        parts.append(re.escape(encoded[index]))
        index += 1
    return "".join(parts)


class Redactor:
    def __init__(self, plaintexts: Sequence[str]) -> None:
        text_variants: set[str] = set()
        url_patterns: set[str] = set()
        hex_patterns: set[str] = set()
        for plaintext in plaintexts:
            text_variants.update(_secret_encodings(plaintext))
            hex_patterns.add(re.escape(plaintext.encode("utf-8").hex()))
            url_patterns.add(
                _percent_case_pattern(urllib.parse.quote(plaintext, safe=""))
            )
            url_patterns.add(
                _percent_case_pattern(urllib.parse.quote_plus(plaintext, safe=""))
            )
            url_patterns.add(
                _percent_case_pattern(
                    "".join(
                        f"%{byte:02X}"
                        for byte in plaintext.encode("utf-8")
                    )
                )
            )
        self._text_variants = tuple(
            sorted(text_variants, key=len, reverse=True)
        )
        self._byte_variants = tuple(
            value.encode("utf-8") for value in self._text_variants
        )
        self._text_url_patterns = tuple(
            re.compile(pattern)
            for pattern in sorted(url_patterns, key=len, reverse=True)
            if pattern
        )
        self._byte_url_patterns = tuple(
            re.compile(pattern.encode("ascii"))
            for pattern in sorted(url_patterns, key=len, reverse=True)
            if pattern
        )
        self._text_hex_patterns = tuple(
            re.compile(pattern, re.IGNORECASE)
            for pattern in sorted(hex_patterns, key=len, reverse=True)
            if pattern
        )
        self._byte_hex_patterns = tuple(
            re.compile(pattern.encode("ascii"), re.IGNORECASE)
            for pattern in sorted(hex_patterns, key=len, reverse=True)
            if pattern
        )
        self.max_variant_bytes = max(
            (len(value) for value in self._byte_variants),
            default=0,
        )

    def redact_text(self, value: str) -> str:
        redacted = value
        for pattern in self._text_url_patterns:
            redacted = pattern.sub(REDACTION_MARKER, redacted)
        for pattern in self._text_hex_patterns:
            redacted = pattern.sub(REDACTION_MARKER, redacted)
        for variant in self._text_variants:
            redacted = redacted.replace(variant, REDACTION_MARKER)
        return redacted

    def redact_bytes(self, value: bytes) -> bytes:
        redacted = value
        marker = REDACTION_MARKER.encode("utf-8")
        for pattern in self._byte_url_patterns:
            redacted = pattern.sub(marker, redacted)
        for pattern in self._byte_hex_patterns:
            redacted = pattern.sub(marker, redacted)
        for variant in self._byte_variants:
            redacted = redacted.replace(variant, marker)
        return redacted

    def contains_secret(self, value: Any, *, _depth: int = 0) -> bool:
        if _depth > 20:
            return True
        if isinstance(value, str):
            return self.redact_text(value) != value
        if isinstance(value, (bytes, bytearray, memoryview)):
            raw = bytes(value)
            return self.redact_bytes(raw) != raw
        if isinstance(value, Mapping):
            return any(
                self.contains_secret(key, _depth=_depth + 1)
                or self.contains_secret(item, _depth=_depth + 1)
                for key, item in value.items()
            )
        if isinstance(value, Sequence) and not isinstance(value, str):
            return any(
                self.contains_secret(item, _depth=_depth + 1)
                for item in value
            )
        if isinstance(value, BaseException):
            return self.contains_secret(str(value), _depth=_depth + 1)
        return False

    def redact_value(self, value: Any, *, _depth: int = 0) -> Any:
        if _depth > 20:
            return {"type": "depth_limited"}
        if isinstance(value, str):
            return self.redact_text(value)
        if isinstance(value, (bytes, bytearray, memoryview)):
            return self.redact_bytes(bytes(value))
        if isinstance(value, BaseException):
            return self.redact_text(str(value))
        if isinstance(value, Mapping):
            return {
                self.redact_text(str(key)): self.redact_value(
                    item,
                    _depth=_depth + 1,
                )
                for key, item in value.items()
            }
        if isinstance(value, Sequence) and not isinstance(value, str):
            return [
                self.redact_value(item, _depth=_depth + 1)
                for item in value
            ]
        if isinstance(value, float) and not math.isfinite(value):
            return None
        if value is None or isinstance(value, (bool, int, float)):
            return value
        return self.redact_text(str(value))


_Redactor = Redactor
