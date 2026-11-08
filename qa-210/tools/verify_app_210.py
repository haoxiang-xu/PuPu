"""#210 QA-only: bind every recorded observation to the real Journal on a private copy.

Per observation and per graph (root, Hook child, Workflow-tool child, subagent child):
the frozen plan is rebuilt from the launch descriptor only (selection + recursive
subagents + fixed Workflow versions + embedded Hook bodies), the frozen diagram and
definition digest must match, and every node state/phase is derived independently
from the Journal store record plus the chat's pending-interaction snapshot taken at
the same moment. No loose state sets, no blanket waivers. Nothing here runs,
resumes or writes.
"""
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sqlite3

from skeleton_embedded_hooks import embedded_hook_bodies
from skeleton_production_state import canonical, validate_launch_descriptor
from unchain.journal import ArtifactRef, AttemptRef
from unchain.journal.models import _thaw_json
from unchain.persistence.sqlite_v2 import open_existing_execution_journal_readonly
from unchain.skeleton import prepare_agent_graph, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_store import WorkflowExecutionStore

SCHEMA = "pupu.skeleton-run-observation.v1"
LABELS = {"pending": "Pending", "running": "Recorded running", "waiting": "Waiting", "waiting_approval": "Waiting for approval",
          "suspended": "Suspended", "succeeded": "Succeeded", "failed": "Failed", "cancelled": "Cancelled", "outcome_unknown": "Outcome unknown"}
PHASE_LABELS = {"receipt_recorded": "Receipt recorded · awaiting resume", "receipt_recorded_upstream": "Receipt recorded · awaiting parent",
                "waiting_for_child": "Waiting for child", "awaiting_input": "Waiting for input"}


def caption(state, phase):
    return PHASE_LABELS.get(phase) or LABELS.get(state, "State unavailable")


def frozen_plans(descriptor):
    documents, entries = [], [descriptor["selection"]]
    while entries:
        entry = entries.pop(); documents.append(entry["document"]); entries.extend(entry.get("subagents", []))
    documents.extend(row["document"] for row in descriptor["workflows"]["workflows"])
    documents.extend(body for document in tuple(documents) for _address, body in embedded_hook_bodies(document))
    plans = {}
    for document in documents:
        plan = prepare_agent_graph(document) if document["kind"] == "agent" else prepare_workflow(document)
        plans[(plan.document_id, execution_definition_digest(plan))] = plan
    return plans


def expected_nodes(store, state, pending, has_child_graph):
    """Independent derivation: Journal record + chat pending snapshot at observation time."""
    expected = {row["node_id"]: ("succeeded", "completed") for row in state["completed"]}
    active = state.get("active")
    if active:
        node_id = active["node_id"]
        if state["status"] in {"failed", "cancelled", "outcome_unknown"}:
            expected[node_id] = (state["status"], state["status"])
        elif state.get("paused"):
            expected[node_id] = ("suspended", "paused")
        elif state["status"] == "waiting":
            wait = active["wait"]
            if wait["kind"] == "child" or has_child_graph:
                expected[node_id] = ("waiting", "waiting_for_child")
            else:
                # wait = {id (interaction id), kind: "interaction", request_ref, receipt_ref}; the request artifact is
                # {schema: unchain.skeleton_tool_approval_wait.v1, interaction, expires_at_ms} for a tool approval,
                # or a plain InteractionRequest for human input.
                request = store.read_json(wait["request_ref"])
                interaction_id = wait["id"]
                inner = request.get("interaction") if isinstance(request.get("interaction"), dict) else request
                is_tool_approval = (request.get("schema") == "unchain.skeleton_tool_approval_wait.v1"
                                    or inner.get("kind") == "tool_approval")
                if wait.get("receipt_ref") is not None or pending["status"] != "awaiting_response" or pending.get("interaction_id") != interaction_id:
                    expected[node_id] = ("waiting", "receipt_recorded")
                elif is_tool_approval:
                    expected[node_id] = ("waiting_approval", "awaiting_approval")
                else:
                    expected[node_id] = ("waiting", "awaiting_input")
        else:
            expected[node_id] = ("running", state["status"])
    # Attach-only pools carry configuration, not execution: by design they have no badge (contract plan §8.11/§8.12).
    for node in store.plan.snapshot()["nodes"]:
        if node["type"] in {"toolkit_pool", "subagent_pool", "hooks_pool"}:
            continue
        expected.setdefault(node["id"], ("pending", "pending"))
    return expected


def main():
    out = Path(os.environ["QA_OUT"])
    read = lambda name: json.loads((out / name).read_text())
    assert read("functional-result.json")["verdict"] == "APP_210_OBSERVATION_RECORDED"
    assert read("errors.json") == []
    generations = read("process-generations.json")
    assert len(generations) == 2 and all(row["all_owned_dead"] is True for row in generations)
    for row in generations:
        table = row["processes_at_ready"]
        sidecars = [p for p in table if Path(p["exe"]).name == "unchain-server"]
        assert sidecars and row.get("sidecar_owned") is True, "sidecar_process_identity_missing"
        if os.environ.get("QA_LOCAL_REPLAY") != "1":  # local replay of a run's evidence cannot read the runner's binary
            assert all(sha256(Path(p["exe"]).read_bytes()).hexdigest() == os.environ["QA_BINARY_SHA"] for p in sidecars), "sidecar_binary_mismatch"
    databases = list((out / "home").rglob("context_v2.sqlite3"))
    if os.environ.get("QA_LOCAL_REPLAY") == "1" and not databases:
        databases = [out / "journal-verification-copy" / "context_v2.sqlite3"]
    assert len(databases) == 1, "ambiguous_context_database"
    copied = out / "journal-verification-copy"
    if copied.exists() and os.environ.get("QA_LOCAL_REPLAY") == "1":
        databases = [copied / "context_v2.sqlite3"]  # replaying a run's own checkpointed copy
    else:
        shutil.copytree(databases[0].parent, copied)
    database = copied / databases[0].name
    with sqlite3.connect(database) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    seed = read("seed-v2-bridge.json")
    seeded_a = seed["docs"]["qa210-approve-agent"]["resource"]["document"]
    saved_b = read("saved-B.json")["resource"]["document"]
    observations = read("observations.json")
    results, last_by_execution = [], {}
    for obs in observations:
        for key in ("bridge_before", "bridge_after"):
            assert obs[key]["schema"] == SCHEMA and obs[key]["run"] is not None, f"{obs['label']}: {key}"
        run = obs["bridge_after"]["run"]
        assert run["high_watermark"] == obs["bridge_before"]["run"]["high_watermark"], f"{obs['label']}: watermark moved while observing"
        session = run["execution_id"]
        assert session == obs["scope"]["execution_id"] and run["owner_chat_id"] == obs["scope"]["owner_chat_id"] and run["resource_id"] == obs["scope"]["resource_id"]
        journal = open_existing_execution_journal_readonly(database_path=database, object_directory=copied / "objects", execution_id=session)
        events = journal.capture_snapshot().events
        launches = [e for e in events if e.event_type == "pupu.skeleton.launch" and e.attempt.attempt_id == run["root_run_id"]]
        assert len(launches) == 1, f"{obs['label']}: launch for root {run['root_run_id']} not found"
        event = launches[0]
        payload = _thaw_json(event.payload)
        raw = journal.read_full_verified(artifact=ArtifactRef.from_dict(payload["launch_ref"]))
        assert sha256(raw).hexdigest() == payload["launch_sha256"]
        descriptor = json.loads(raw); assert canonical(descriptor) == raw
        assert descriptor["runtime_manifest"]["manifest_digest"] == os.environ["QA_MANIFEST"] == run["launch_manifest_digest"] == run["runtime_manifest_digest"]
        assert descriptor["owner_chat_id"] == run["owner_chat_id"] and descriptor["graph_id"] == run["graphs"][0]["graph_id"]
        _, _, root_plan = validate_launch_descriptor(descriptor, session_id=session, root_run_id=event.attempt.attempt_id)
        assert run["definition_digest"] == execution_definition_digest(root_plan) and run["resource_id"] == root_plan.document_id
        plans = frozen_plans(descriptor)
        generation = event.attempt.generation
        assert run["generation_id"] == generation.generation_id
        graph_ids = [g["graph_id"] for g in run["graphs"]]
        assert len(set(graph_ids)) == len(graph_ids)
        children_of = {}
        for g in run["graphs"]:
            if g["parent_graph_id"] is not None:
                children_of.setdefault(g["parent_graph_id"], []).append(g)
        graph_results = []
        for index, graph in enumerate(run["graphs"]):
            final = graph["call_stack"][-1]
            plan = plans.get((final["definition_id"], graph["definition_digest"]))
            assert plan is not None, f"{obs['label']}: graph {graph['graph_id']} has no frozen plan in the launch descriptor"
            assert graph["document"] == plan.snapshot(), f"{obs['label']}: graph {graph['graph_id']} diagram is not the frozen document"
            store = WorkflowExecutionStore(journal, plan, graph_id=graph["graph_id"], attempt=AttemptRef(generation, graph["attempt_id"]))
            # The record as it stood at THIS observation: the latest saved execution event of this graph at or below the
            # observation's high watermark (the final store state would be wrong for every historical observation).
            records = []
            for position, event in enumerate(events):
                if (event.event_type != "skeleton.workflow_execution.saved" or event.attempt.attempt_id != graph["attempt_id"]
                        or event.store_seq > run["high_watermark"]):
                    continue
                decoded = store._decode_event(event, position)
                if decoded.state["graph_id"] == graph["graph_id"]:
                    records.append(decoded)
            assert records, f"{obs['label']}: no saved execution event for graph {graph['graph_id']} at or below watermark {run['high_watermark']}"
            record = max(records, key=lambda item: item.event.store_seq)
            assert record.event.event_id == graph["event_id"] and record.event.store_seq == graph["store_seq"], f"{obs['label']}: graph {graph['graph_id']} is not the latest record at watermark {run['high_watermark']} (observation event {graph['event_id']}@{graph['store_seq']} vs journal {record.event.event_id}@{record.event.store_seq})"
            state = record.state
            assert graph["status"] == state["status"] and graph["paused"] == state["paused"] and graph["root_committed"] == state["root_committed"], f"{obs['label']}: graph {graph['graph_id']} status"
            assert graph["revision"] == record.revision, f"{obs['label']}: graph {graph['graph_id']} revision"
            assert graph["owner_liveness"] == "unknown" and graph["error"] == state["error"]
            if index == 0:
                assert graph["parent_graph_id"] is None and graph["caller_node_id"] is None
            else:
                assert graph["parent_graph_id"] in graph_ids[:index], f"{obs['label']}: child {graph['graph_id']} parent not listed earlier"
                assert graph["caller_node_id"] is not None
            expected = expected_nodes(store, state, obs["pending"], graph["graph_id"] in children_of)
            observed = {node["node_id"]: (node["state"], node["phase"]) for node in graph["nodes"]}
            assert observed == expected, f"{obs['label']}: graph {graph['graph_id']} nodes\n observed={observed}\n expected={expected}"
            page = obs["pages_by_graph_index"][index] if index < len(obs["pages_by_graph_index"]) else None
            if page is not None:
                assert page["error"] is None and page["caption_present"] is True
                page_nodes = {n["node_id"]: n for n in page["nodes"]}
                assert set(page_nodes) == set(observed), f"{obs['label']}: page drew {sorted(page_nodes)} vs bridge {sorted(observed)}"
                for node_id, (state_name, phase) in observed.items():
                    drawn = page_nodes[node_id]
                    assert drawn["run_state"] == state_name, f"{obs['label']}: page node {node_id} state {drawn['run_state']} vs {state_name}"
                    assert drawn["aria"] == caption(state_name, phase), f"{obs['label']}: page node {node_id} label {drawn['aria']!r} vs {caption(state_name, phase)!r}"
            graph_results.append({"graph_id": graph["graph_id"], "status": state["status"], "nodes": observed, "page_bound": page is not None})
        selected = descriptor["selection"]["document"]
        if obs["label"] in {"approve-waiting", "approve-waiting-after-B-saved", "approve-completed"}:
            assert selected == seeded_a and selected != saved_b, f"{obs['label']}: executed document is not the seeded A"
        if obs["label"] == "turn2-uses-B":
            assert selected == saved_b, "turn 2 did not execute the saved B"
        if obs["label"] == "cancelled":
            assert run["graphs"][0]["status"] == "cancelled" and run["graphs"][0]["root_committed"] is False
        if obs["label"] in {"approve-completed", "turn2-uses-B", "hook-completed", "parent-child", "cold-parent-child"}:
            assert run["graphs"][0]["status"] == "completed" and run["graphs"][0]["root_committed"] is True
        last_by_execution[session] = (obs["label"], run["high_watermark"], max(e.store_seq for e in events))
        results.append({"label": obs["label"], "root_run_id": run["root_run_id"], "definition_digest": run["definition_digest"],
                        "high_watermark": run["high_watermark"], "graphs": graph_results})
    for session, (label, watermark, journal_max) in last_by_execution.items():
        assert watermark == journal_max, f"last observation {label} watermark {watermark} != journal max {journal_max} for {session}"
    hot = next(r for r in results if r["label"] == "parent-child"); cold = next(r for r in results if r["label"] == "cold-parent-child")
    assert {k: v for k, v in hot.items() if k != "label"} == {k: v for k, v in cold.items() if k != "label"}, "cold read differs"
    (out / "raw-observation-verification.json").write_text(json.dumps({"verdict": "RAW_210_OBSERVATION_BOUND", "results": results,
        "wheel_sha256": os.environ["QA_WHEEL_SHA"], "manifest": os.environ["QA_MANIFEST"], "sidecar_sha256": os.environ["QA_BINARY_SHA"],
        "database_source": str(databases[0]), "verification_uses_private_checkpointed_copy": True}, indent=2) + "\n")


if __name__ == "__main__":
    main()
