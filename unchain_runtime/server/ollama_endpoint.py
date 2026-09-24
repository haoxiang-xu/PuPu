"""Canonical, request-independent Ollama endpoint resolution.

The sidecar fetches these endpoints itself, and the embedding call POSTs the
text being embedded to them. A per-request override would therefore let any
caller point the sidecar at an arbitrary host and receive memory content, so
the endpoint is operator configuration (``OLLAMA_HOST``) only and is validated
before a URL is built from it.

Invalid configuration falls back to the local default rather than failing the
run: a typo in an environment variable must not silently send memory content
somewhere unintended, but it also should not take local memory offline.
"""

from __future__ import annotations

import ipaddress
import os
import re
from typing import Mapping
from urllib.parse import urlparse, urlunparse

OLLAMA_HOST_ENV = "OLLAMA_HOST"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

_ALLOWED_SCHEMES = frozenset({"http", "https"})

# Deliberately flat (no nested quantifier, bounded length): a host is either an
# IP literal or DNS-shaped. urlparse leaves anything that is not a `:` port or
# an `@` userinfo inside the hostname, so `example.com;params` reaches here
# intact and must not be accepted as a host.
_DNS_HOST_PATTERN = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$")


def _is_valid_host(hostname: str) -> bool:
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return bool(_DNS_HOST_PATTERN.match(hostname))


def sanitize_ollama_base_url(value: object) -> str:
    """Return ``scheme://host[:port][/prefix]``, or the local default.

    A path prefix survives so an Ollama behind a reverse proxy keeps working;
    credentials, query and fragment do not, because Ollama never needs them and
    they are the usual shapes for smuggling a different target past a parser
    that only string-concatenates.
    """

    raw = str(value or "").strip()
    if not raw:
        return DEFAULT_OLLAMA_BASE_URL

    try:
        parsed = urlparse(raw)
    except ValueError:
        return DEFAULT_OLLAMA_BASE_URL

    if parsed.scheme not in _ALLOWED_SCHEMES:
        return DEFAULT_OLLAMA_BASE_URL
    if parsed.username or parsed.password:
        return DEFAULT_OLLAMA_BASE_URL
    if parsed.query or parsed.fragment or parsed.params:
        return DEFAULT_OLLAMA_BASE_URL

    try:
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        # urlparse defers port validation to attribute access.
        return DEFAULT_OLLAMA_BASE_URL
    if not hostname or not _is_valid_host(hostname):
        return DEFAULT_OLLAMA_BASE_URL

    # Rebuilt from the parsed parts, never from the raw netloc: that drops any
    # userinfo and normalizes the host casing.
    netloc = f"[{hostname}]" if ":" in hostname else hostname
    if port is not None:
        netloc = f"{netloc}:{port}"

    return urlunparse((parsed.scheme, netloc, parsed.path.rstrip("/"), "", "", ""))


def resolve_ollama_base_url(environ: Mapping[str, str] | None = None) -> str:
    """Resolve the configured Ollama endpoint from the environment."""

    source = os.environ if environ is None else environ
    return sanitize_ollama_base_url(source.get(OLLAMA_HOST_ENV, DEFAULT_OLLAMA_BASE_URL))


__all__ = [
    "DEFAULT_OLLAMA_BASE_URL",
    "OLLAMA_HOST_ENV",
    "resolve_ollama_base_url",
    "sanitize_ollama_base_url",
]
