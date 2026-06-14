"""Synthetic MCP registry entries owned by the backend test suite.

Why this exists
---------------
The generic MCP *mechanism* tests (install / secret injection / reload / delete /
configure) only need *an* entry of a given shape — they do not care which product
it is. Historically they borrowed a real catalog entry (``productivity.slack``)
as that fixture, which coupled them to the production seed
``src/SERVICEs/mcp_toolkit_registry.json``. When the curator hard-removed the
stdio Slack entry, those unrelated mechanism tests collaterally broke.

This module decouples them: it injects stable, test-owned synthetic entries into
the shared ``mcp_registry.INSTALLABLE_MCP_REGISTRY`` dict (which ``mcp_toolkits``
references *by identity*, see ``mcp_toolkits.py``), so catalog curation can no
longer knock these tests over. Injection is additive — product-specific recipe
tests (github-remote, slack-remote, filesystem, …) intentionally keep using real
entries, because those tests *should* fail if a real recipe regresses.

The synthetic ids live under the reserved ``test.*`` / ``mcp.test.*`` namespace
and never collide with the real catalog.
"""

from __future__ import annotations

import mcp_registry

# Canonical stdio + two-required-secret fixture for the mechanism tests.
FIXTURE_STDIO_SECRET_ENTRY_ID = "test.stdio-secret"
FIXTURE_STDIO_SECRET_TOOLKIT_ID = "mcp.test.stdio-secret"
FIXTURE_SECRET_KEY_A = "FIXTURE_TOKEN_A"
FIXTURE_SECRET_KEY_B = "FIXTURE_TOKEN_B"
FIXTURE_TOOL_NAME = "fixture_tool"

_FIXTURE_PAYLOAD = {
    "version": 1,
    "categories": ["workspace"],
    "entries": [
        {
            "id": FIXTURE_STDIO_SECRET_ENTRY_ID,
            "toolkitId": FIXTURE_STDIO_SECRET_TOOLKIT_ID,
            "name": "Fixture Stdio Secret",
            "description": "Synthetic stdio entry owned by the test suite.",
            "category": "workspace",
            "installable": True,
            "secrets": [
                {"key": FIXTURE_SECRET_KEY_A, "label": "Fixture token A"},
                {"key": FIXTURE_SECRET_KEY_B, "label": "Fixture token B"},
            ],
            "tools": [{"name": FIXTURE_TOOL_NAME, "title": "Fixture tool"}],
            "mcp": {
                "transport": "stdio",
                "command": "uvx",
                "args": ["fixture-mcp-server"],
            },
        }
    ],
}


def _normalized_fixture_entries() -> dict:
    """Run the synthetic payload through the real normalizer so injected entries
    are byte-for-byte the same shape the production loader produces."""
    return mcp_registry.normalize_registry_payload(_FIXTURE_PAYLOAD)["entries_by_id"]


def install_fixture_registry_entries() -> None:
    """Inject the synthetic entries into the shared registry dict (idempotent)."""
    for entry_id, entry in _normalized_fixture_entries().items():
        mcp_registry.INSTALLABLE_MCP_REGISTRY[entry_id] = entry


def remove_fixture_registry_entries() -> None:
    """Remove the synthetic entries, restoring the registry to the real catalog."""
    for entry_id in _normalized_fixture_entries():
        mcp_registry.INSTALLABLE_MCP_REGISTRY.pop(entry_id, None)
