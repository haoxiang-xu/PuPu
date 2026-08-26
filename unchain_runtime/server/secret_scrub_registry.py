"""Process-local exact-value secret redaction for sidecar-visible credentials.

The registry is intentionally memory-only.  It never exposes registered values,
persists them, logs them, or includes them in status responses.  Callers register
only credentials that are already present in the sidecar process (provider and
in-process MCP credentials); Vault plaintext remains outside this process.
"""

from __future__ import annotations

import threading
from collections.abc import Iterable

from secret_redaction import Redactor


MIN_SECRET_CHARS = 12
_COMMON_VALUES = frozenset(
    {
        "administrator",
        "authentication",
        "configuration",
        "development",
        "examplepassword",
        "passwordpassword",
        "production",
        "secretsecret",
    }
)


def _eligible_secret(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = value.strip()
    if len(normalized) < MIN_SECRET_CHARS:
        return ""
    if normalized.isdecimal() or normalized.casefold() in _COMMON_VALUES:
        return ""
    return normalized


class SecretScrubRegistry:
    """Thread-safe exact-value registry with generation-cached redactors."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._values: set[str] = set()
        self._generation = 0
        self._cached_generation = -1
        self._cached_redactor = Redactor(())

    def register(self, values: Iterable[object], *, source: str) -> bool:
        # ``source`` is validated only to keep call sites intentional.  It is not
        # retained because even secret-adjacent metadata must stay out of status.
        if source not in {"provider", "mcp"}:
            raise ValueError("secret_scrub_registry_source_invalid")
        accepted = {_eligible_secret(value) for value in values}
        accepted.discard("")
        if not accepted:
            return False
        with self._lock:
            before = len(self._values)
            self._values.update(accepted)
            if len(self._values) == before:
                return False
            self._generation += 1
            return True

    def snapshot(self) -> Redactor:
        with self._lock:
            if self._cached_generation != self._generation:
                self._cached_redactor = Redactor(tuple(self._values))
                self._cached_generation = self._generation
            return self._cached_redactor

    def redact_text(self, value: str) -> str:
        return self.snapshot().redact_text(value)

    def redact_bytes(self, value: bytes) -> bytes:
        return self.snapshot().redact_bytes(value)

    def reset_for_tests(self) -> None:
        with self._lock:
            self._values.clear()
            self._generation += 1
            self._cached_generation = -1
            self._cached_redactor = Redactor(())


_registry = SecretScrubRegistry()


def register_secret_values(values: Iterable[object], *, source: str) -> bool:
    return _registry.register(values, source=source)


def redact_registered_text(value: str) -> str:
    return _registry.redact_text(value)


def redact_registered_bytes(value: bytes) -> bytes:
    return _registry.redact_bytes(value)


def get_secret_scrub_registry() -> SecretScrubRegistry:
    return _registry


__all__ = [
    "MIN_SECRET_CHARS",
    "SecretScrubRegistry",
    "get_secret_scrub_registry",
    "redact_registered_bytes",
    "redact_registered_text",
    "register_secret_values",
]
