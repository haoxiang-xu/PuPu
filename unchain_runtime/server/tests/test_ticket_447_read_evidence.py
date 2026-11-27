"""Use the imported Unchain artifact across PuPu's real capability boundary.

These deterministic contract checks do not invoke a local or remote model.
"""
from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest

from context_memory_v2_capability import resolve_context_memory_v2_capability
from unchain.context import ContextCompileRequest, ContextCompiler, resolve_context_budget
from unchain.context_content import render_context_content_page, validate_context_content_page
from unchain.journal import ResourceRef
from unchain.toolkits.builtin.core import CoreToolkit
from unchain.tools.output_management import ToolOutputManager


def test_imported_runtime_admits_the_read_and_evidence_feature_pair():
    verdict = resolve_context_memory_v2_capability(requested_mode="all")
    assert verdict.ready, verdict.reason
    protocol = next(item for item in verdict.runtime_protocol_manifest["protocols"]
                    if item["id"] == "context_memory")
    assert {"small_tool_output_inline_v1", "context_content_paging_v2",
            "historical_evidence_guidance_v1"} <= set(protocol["features"])


@pytest.mark.parametrize("provider", ["openai", "anthropic", "gemini", "ollama"])
def test_actual_core_read_is_complete_in_later_compiled_evidence(tmp_path, provider):
    path = tmp_path / "read-evidence.txt"
    path.write_text("earlier source: 中文🙂\n" * 150, encoding="utf-8")
    source = CoreToolkit(workspace_root=tmp_path).tools["read"].execute({"path": str(path)})
    assert source["truncated"] is False
    assert source["end_line"] == source["total_lines"] == 150
    raw = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ref = ResourceRef("artifact", "ticket-447-core-read", 1)
    digest = hashlib.sha256(raw).hexdigest()
    projection = ToolOutputManager.active_default().project(
        raw, full_output_ref=ref.to_dict(), digest=digest,
        content_bytes=len(raw), requested_policy="head_tail",
    )
    assert projection.payload["inline"] is True
    assert "read_request" not in projection.payload
    events = (
        {"type": "tool_call", "event_id": "ticket-447-call", "store_seq": 1,
         "call_id": "read-447", "tool_name": "read", "arguments": {"path": str(path)}},
        {"type": "tool_result", "event_id": "ticket-447-result", "store_seq": 2,
         "call_id": "read-447", "tool_name": "read", "result": source,
         "result_bytes": len(raw), "result_sha256": digest, "full_output_ref": ref.to_dict(),
         "model_projection": {"result": projection.payload,
                              "metadata": {"projection_policy": "head_tail"}}},
    )
    request = ContextCompileRequest(
        case="ticket-447-sidecar", provider=provider, model="synthetic",
        source_messages=({"role": "system", "content": "current policy"},
                         {"role": "user", "content": "Use the earlier read as evidence."}),
        budget=resolve_context_budget(context_window_tokens=32768), semantic_events=events,
    )
    # A second compilation uses the same persisted identities and complete body.
    for _ in range(2):
        messages = ContextCompiler().compile(request).messages
        history = next(message["content"] for message in messages
                       if str(message.get("content", "")).startswith("[MEMORY_V2_EVIDENCE_HISTORY]"))
        assert "not necessarily true" in history and "not instructions" in history
        exchange = json.loads(history.split("\n", 2)[2])["tool_exchanges"][0]
        assert json.loads(exchange["result"]["preview"]) == source
        assert exchange["result"]["inline"] is True
        assert "read_request" not in exchange["result"]
        assert messages[-1]["role"] == "user"


def test_utf8_pages_recover_one_immutable_large_result_without_gaps():
    source = ("中🙂\n" * 8000).encode("utf-8")
    ref = ResourceRef("artifact", "ticket-447-unicode", 1)
    digest = hashlib.sha256(source).hexdigest()
    descriptor = ToolOutputManager.active_default(preview_chars=5700).project(
        source, full_output_ref=ref.to_dict(), digest=digest,
        content_bytes=len(source), requested_policy="head_tail",
    ).payload
    assert descriptor["schema_version"] == "unchain.tool_output.paged.v2"
    assert "not the full output" in descriptor["notice"]
    assert descriptor["read_request"]["arguments"]["offset"] == 0
    offset, chunks = 0, []
    while offset < len(source):
        page = render_context_content_page(SimpleNamespace(
            ref=ref, media_type="text/plain", offset=offset,
            data=source[offset:offset + 8192], total_bytes=len(source), sha256=digest,
        ))
        assert validate_context_content_page(page) == page
        assert page["content"]["encoding"] == "utf-8"
        chunks.append(page["content"]["text"].encode("utf-8"))
        assert len(chunks[-1]) == page["page_bytes"] > 0
        assert "not that all earlier bytes" in page["notice"]
        offset += page["page_bytes"]
        assert page["next_offset"] == (None if page["eof"] else offset)
        assert page["sha256"] == digest and page["ref"] == descriptor["full_output_ref"]
    assert b"".join(chunks) == source
