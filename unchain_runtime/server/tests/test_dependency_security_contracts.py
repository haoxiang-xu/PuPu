"""Exercise security boundaries supplied by the installed dependency versions."""
import asyncio
import io
import urllib.request

import pytest


def test_mcp_result_schema_blocks_external_references_before_io(monkeypatch):
    from mcp import ClientSession, types

    reads = []

    def forbidden_read(*args, **kwargs):
        reads.append(args)
        raise AssertionError("MCP result validation must not fetch remote schemas")

    monkeypatch.setattr(urllib.request, "urlopen", forbidden_read)

    async def validate(schema, payload):
        session = ClientSession(None, None)
        session._tool_output_schemas["checked"] = schema

        async def response(*args, **kwargs):
            return types.CallToolResult(content=[], structuredContent=payload)

        monkeypatch.setattr(session, "send_request", response)
        return await session.call_tool("checked", {})

    for reference in ["https://example.invalid/private-schema", "file:///private/secret.json"]:
        with pytest.raises(RuntimeError, match="Invalid schema"):
            asyncio.run(validate({"$ref": reference}, {"answer": 42}))
    assert reads == []

    schema = {
        "$defs": {"answer": {"type": "integer"}},
        "type": "object",
        "properties": {"answer": {"$ref": "#/$defs/answer"}},
        "required": ["answer"],
        "additionalProperties": False,
    }
    assert asyncio.run(validate(schema, {"answer": 42})).structuredContent == {"answer": 42}
    with pytest.raises(RuntimeError, match="Invalid structured content"):
        asyncio.run(validate(schema, {"answer": "wrong"}))


def test_screenshot_rgb_resize_and_png_survive_pillow_upgrade():
    from PIL import Image
    from computer_control.screenshot import _encode_png

    class Capture:
        width = 4
        height = 4
        rgb = bytes([255, 0, 0]) * 16

    png = _encode_png(Capture(), 2, 2)
    with Image.open(io.BytesIO(png)) as image:
        assert image.format == "PNG"
        assert image.mode == "RGB"
        assert image.size == (2, 2)
        assert image.getpixel((0, 0)) == (255, 0, 0)


def test_dependency_policy_override_is_closed_and_matches_execution():
    import mcp_registry

    base = {
        "id": "test.boundary", "toolkitId": "mcp.test.boundary",
        "name": "Bounded", "description": "Bounded install",
        "mcp": {"transport": "stdio", "command": "uvx", "args": [
            "--exclude-newer=2026-10-22T00:00:00Z", "--from", "mcp==1.30.0", "mcp",
        ]},
    }
    payload = {"entries": [{**base, "dependencyPolicy": {"cutoff": "2026-10-22T00:00:00Z"}}]}
    mcp_registry.normalize_registry_payload(payload)
    for policy in [
        {"cutoff": "2026-02-30T00:00:00Z"},
        {"cutoff": "2026-10-22"},
        {"cutoff": "2026-10-22T00:00:00Z", "allowUnpinned": True},
        {"cutoff": "2026-10-21T00:00:00Z"},
        {}, None,
    ]:
        with pytest.raises(mcp_registry.McpRegistryValidationError):
            mcp_registry.normalize_registry_payload({"entries": [{**base, "dependencyPolicy": policy}]})
    duplicate = {**base, "dependencyPolicy": {"cutoff": "2026-10-22T00:00:00Z"},
                 "mcp": {**base["mcp"], "args": [*base["mcp"]["args"], "--exclude-newer=2030-01-01T00:00:00Z"]}}
    with pytest.raises(mcp_registry.McpRegistryValidationError):
        mcp_registry.normalize_registry_payload({"entries": [duplicate]})


def test_dependency_policy_rejects_malformed_execution_shapes():
    import mcp_registry

    for mcp in [
        {"command": {}, "args": []},
        {"command": "uvx", "args": 1},
        {"command": "uvx", "args": [None]},
    ]:
        with pytest.raises(mcp_registry.McpRegistryValidationError):
            mcp_registry.normalize_registry_payload({"entries": [{
                "id": "test.boundary", "toolkitId": "mcp.test.boundary",
                "dependencyPolicy": {"cutoff": "2026-10-22T00:00:00Z"}, "mcp": mcp,
            }]})
