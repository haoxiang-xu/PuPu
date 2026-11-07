"""Actual Branch-page documents through public Host execution, offline SDK only."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
from skeleton_production_state import load_launch
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_production_chat import Stream


DOCUMENTS = json.loads((Path(__file__).resolve().parents[3] /
                       "e2e/fixtures/skeleton_branch_documents.json").read_text())
SENTINEL = "qa-351-offline-no-real-credential"


@pytest.mark.parametrize("kind,reply,markers,final,outlet", [
    ("if", "yes please", ["router", "yes-branch"], "YES-BRANCH-REPLY", "true"),
    ("if", "no thanks", ["router"], "no thanks", "false"),
    ("switch", "x", ["router"], "x", "case-1"),
    ("switch", "zzz", ["router"], "zzz", "default"),
])
def test_actual_page_graph_executes_only_selected_branch_and_journals_skips(
        tmp_path, monkeypatch, kind, reply, markers, final, outlet):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    for name, value in {"UNCHAIN_DATA_DIR": str(tmp_path / "data"),
                        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain", "PUPU_FEATURE_MEMORY_V2": "all",
                        "PUPU_MEMORY_V2_MODE": "all", "PUPU_MEMORY_V2_CANARY_PERCENT": "100"}.items():
        monkeypatch.setenv(name, value)
    document = deepcopy(DOCUMENTS[kind])
    store = SkeletonResourceStore()
    saved = store.save_draft(document)
    assert saved["document"] == document and saved["diagnostics"] == []
    store.preflight(document["id"])
    calls = []
    import openai

    def client_factory(**kwargs):
        assert kwargs["api_key"] == SENTINEL
        assert kwargs["base_url"] == "https://api.openai.com/v1"
        assert kwargs["max_retries"] == 0

        def create(**wire):
            assert set(wire) in ({"input", "model", "stream", "max_output_tokens"},
                                 {"input", "model", "stream", "tools", "max_output_tokens"})
            assert wire["stream"] is True and wire["model"] == "gpt-6-luna"
            text = json.dumps(wire["input"])
            names = [name for name in ("router", "yes-branch") if f"[{name}]" in text]
            assert len(names) == 1, "only the frozen graph's declared Kernel may call the SDK"
            calls.append(names[0])
            return Stream(reply if names[0] == "router" else "YES-BRANCH-REPLY")

        return SimpleNamespace(responses=SimpleNamespace(create=create))

    monkeypatch.setattr(openai, "OpenAI", client_factory)
    options = {"skeleton_selection": {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource",
                                      "resource_id": document["id"]},
               "_memory_v2_requested": True, "_memory_v2_owner_chat_id": "qa-351-owner",
               "durable_interactions_required": True, "workspace_root": str(tmp_path),
               "skeleton_credentials": {"openai": {"provider": "openai", "endpoint": "https://api.openai.com/v1",
                                                   "api_key": SENTINEL}}}
    session_id, attempt_id = f"qa-351-{kind}-{outlet}", f"qa-351-{outlet}"
    events = list(adapter.stream_chat_events(message="route this", history=[], options=options,
                                            session_id=session_id, attempt_id=attempt_id))
    assert [event["content"] for event in events
            if event.get("type") == "final_message" and event.get("scope") == "root"] == [final]
    assert calls == markers
    launch = load_launch(session_id, attempt_id, expected_owner_chat_id="qa-351-owner")
    record = launch.store.load()
    assert record.state["status"] == "completed" and record.state["root_committed"] is True
    branch_id = "if" if kind == "if" else "switch"
    branch = next(row for row in record.state["completed"] if row["node_id"] == branch_id)
    outlets = [edge for edge in document["edges"] if edge["source_node_id"] == branch_id]
    selected = next(edge for edge in outlets if edge["source_port_id"] == outlet)
    assert branch["edge_id"] == selected["id"]
    assert launch.store.read_json(branch["result_ref"]) == {
        "schema": "unchain.skeleton.branch_selection.v1", "node_id": branch_id,
        "selected_edge_id": selected["id"],
        "skipped_edges": [{"edge_id": edge["id"], "status": "skipped"}
                          for edge in outlets if edge["id"] != selected["id"]],
    }
    assert [row["node_id"] for row in record.state["completed"]].count("end") == 1
    # A second read verifies the real immutable artifact through the Store.
    assert launch.store.load() == record
    assert SENTINEL not in json.dumps(launch.descriptor)
