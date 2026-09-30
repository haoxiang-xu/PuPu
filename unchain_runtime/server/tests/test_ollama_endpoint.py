"""Ollama endpoint resolution is operator configuration, validated.

These endpoints receive the text being embedded, so the tests below pin two
things: a request can never choose the host, and a hostile OLLAMA_HOST cannot
turn the base URL into something that points somewhere else.
"""

from __future__ import annotations

import pytest

from ollama_endpoint import (
    DEFAULT_OLLAMA_BASE_URL,
    resolve_ollama_base_url,
    sanitize_ollama_base_url,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("http://localhost:11434", "http://localhost:11434"),
        ("http://127.0.0.1:11434/", "http://127.0.0.1:11434"),
        ("https://ollama.internal:443", "https://ollama.internal:443"),
        # A reverse-proxy prefix has to survive: Ollama's own paths are absolute.
        ("http://proxy.example/ollama/", "http://proxy.example/ollama"),
        ("http://[::1]:11434", "http://[::1]:11434"),
        ("HTTP://LocalHost:11434", "http://localhost:11434"),
    ],
)
def test_valid_endpoints_are_normalized(raw, expected):
    assert sanitize_ollama_base_url(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        None,
        "   ",
        # Credentials are the classic way to make a naive reader see one host
        # while the client connects to another.
        "http://ollama.internal@169.254.169.254/",
        "http://user:pass@10.0.0.5:11434",
        # Non-http schemes would let the "base URL" address something that is
        # not an HTTP service at all.
        "file:///etc/passwd",
        "gopher://127.0.0.1:11434",
        "ftp://example.com",
        # A query or fragment means the rest of the built URL stops being a path.
        "http://example.com?x=1",
        "http://example.com#frag",
        "http://example.com;params",
        # No host at all.
        "http:///api/tags",
        "not a url",
        # Invalid port: urlparse only raises on attribute access.
        "http://example.com:99999",
        123,
    ],
)
def test_hostile_or_empty_configuration_falls_back_to_the_local_default(raw):
    assert sanitize_ollama_base_url(raw) == DEFAULT_OLLAMA_BASE_URL


def test_built_url_keeps_the_sanitized_host():
    base = sanitize_ollama_base_url("http://ollama.internal@169.254.169.254/")
    assert f"{base}/api/embeddings" == f"{DEFAULT_OLLAMA_BASE_URL}/api/embeddings"


def test_resolve_reads_the_environment_and_defaults_when_unset():
    assert resolve_ollama_base_url({}) == DEFAULT_OLLAMA_BASE_URL
    assert (
        resolve_ollama_base_url({"OLLAMA_HOST": "http://box.lan:11434/"})
        == "http://box.lan:11434"
    )
    assert (
        resolve_ollama_base_url({"OLLAMA_HOST": "file:///etc/passwd"})
        == DEFAULT_OLLAMA_BASE_URL
    )


def test_request_options_cannot_choose_the_endpoint():
    import memory_embeddings

    hostile = {"ollama_base_url": "http://169.254.169.254:80"}
    assert memory_embeddings._ollama_base_url(hostile) == resolve_ollama_base_url()

    import memory_factory

    assert memory_factory._ollama_base_url(hostile) == resolve_ollama_base_url()
