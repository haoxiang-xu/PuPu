"""#210 QA-only: bind every recorded observation to the real Journal on a private copy.

For each observation the driver wrote (bridge_after.data.run), this reads the
same execution from a checkpointed copy of the App's Journal, validates the
launch descriptor, loads the frozen store state and compares: identity,
definition digest, manifest digests, per-node states, completion/cancel status,
and that observing added no events. Nothing here runs, resumes or writes.
"""
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import sqlite3

from skeleton_production_state import canonical, validate_launch_descriptor
from unchain.journal import ArtifactRef
from unchain.journal.models import _thaw_json
from unchain.persistence.sqlite_v2 import open_existing_execution_journal_readonly
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_store import WorkflowExecutionStore


def node_states_from_journal(state):
    out = {row["node_id"]: "succeeded" for row in state["completed"]}
    active = state.get("active")
    if active:
        if state["status"] in {"failed", "cancelled", "outcome_unknown"}:
            out[active["node_id"]] = state["status"]
        elif state.get("paused"):
            out[active["node_id"]] = "suspended"
        elif state["status"] == "waiting":
            out[active["node_id"]] = {"waiting", "waiting_approval"}
        else:
            out[active["node_id"]] = "running"
    return out


def main():
    out = Path(os.environ["QA_OUT"])
    read = lambda name: json.loads((out / name).read_text())
    assert read("functional-result.json")["verdict"] == "APP_210_OBSERVATION_RECORDED"
    assert read("errors.json") == []
    generations = read("process-generations.json")
    assert len(generations) == 2 and all(row["all_owned_dead"] is True for row in generations)
    for row in generations:
        sidecars = [p for p in row["processes_at_ready"] if Path(p["exe"]).name == "unchain-server"]
        assert sidecars, "sidecar_process_identity_missing"
        assert all(sha256(Path(p["exe"]).read_bytes()).hexdigest() == os.environ["QA_BINARY_SHA"] for p in sidecars), "sidecar_binary_mismatch"
    databases = list((out / "home").rglob("context_v2.sqlite3"))
    assert len(databases) == 1, "ambiguous_context_database"
    copied = out / "journal-verification-copy"
    shutil.copytree(databases[0].parent, copied)
    database = copied / databases[0].name
    with sqlite3.connect(database) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    seed = read("seed-v2-bridge.json")
    saved_b = read("saved-B.json")["resource"]["document"]
    results = []
    for obs in read("observations.json"):
        run = obs["bridge_after"]["data"]["run"]
        assert run is not None, obs["label"]
        assert obs["bridge_after"]["data"]["schema"] if "schema" in obs["bridge_after"]["data"] else True
        session = run["execution_id"]
        assert session == obs["scope"]["execution_id"] and run["owner_chat_id"] == obs["scope"]["owner_chat_id"]
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
        _, _, plan = validate_launch_descriptor(descriptor, session_id=session, root_run_id=event.attempt.attempt_id)
        assert run["definition_digest"] == execution_definition_digest(plan), f"{obs['label']}: digest differs from the frozen plan"
        assert run["resource_id"] == plan.document_id == obs["scope"]["resource_id"]
        root = run["graphs"][0]
        store = WorkflowExecutionStore(journal, plan, graph_id=descriptor["graph_id"], attempt=event.attempt)
        state = store.load().state
        assert root["graph_id"] == descriptor["graph_id"] and root["status"] == state["status"] and root["root_committed"] == state["root_committed"]
        expected = node_states_from_journal(state)
        observed = {node["node_id"]: node["state"] for node in root["nodes"]}
        for node_id, want in expected.items():
            got = observed[node_id]
            assert (got in want) if isinstance(want, set) else got == want, f"{obs['label']}: node {node_id} journal {want} vs observation {got}"
        for node_id, got in observed.items():
            if node_id not in expected:
                assert got == "pending", f"{obs['label']}: unseen node {node_id} shown as {got}"
        # the page drew exactly what the bridge returned
        page_nodes = {n["node_id"]: n for n in obs["page"]["nodes"]}
        for node in root["nodes"] if obs.get("page_second_graph") is None else []:
            if node["node_id"] in page_nodes:
                assert page_nodes[node["node_id"]]["aria"] is not None
        assert obs["page"]["caption_present"] is True and obs["page"]["error"] is None
        # observing the run added nothing to this execution's journal
        assert run["high_watermark"] == obs["bridge_before"]["data"]["run"]["high_watermark"] or obs["label"].startswith("turn2") or obs["label"] in {"approve-completed", "cancelled", "parent-child", "cold-parent-child"}, obs["label"]
        assert max(e.store_seq for e in events) >= run["high_watermark"]
        # A versus B: the waiting/completed observations of the approval chat are the seeded A, turn 2 is B
        selected = descriptor["selection"]["document"]
        if obs["label"] in {"approve-waiting", "approve-waiting-after-B-saved", "approve-completed"}:
            assert selected == seed["docs"]["qa210-approve-agent"]["resource"]["document"], f"{obs['label']}: executed document is not seeded A"
            assert selected != saved_b
        if obs["label"] == "turn2-uses-B":
            assert selected == saved_b, "turn 2 did not execute the saved B"
        if obs["label"] == "cancelled":
            assert state["status"] == "cancelled" and state["root_committed"] is False
        if obs["label"] in {"approve-completed", "turn2-uses-B", "parent-child", "cold-parent-child"}:
            assert state["status"] == "completed" and state["root_committed"] is True and not state["error"]
        if len(run["graphs"]) > 1:
            child = run["graphs"][1]
            assert child["parent_graph_id"] == root["graph_id"] and child["caller_node_id"] == "kernel"
        results.append({"label": obs["label"], "root_run_id": run["root_run_id"], "status": state["status"], "definition_digest": run["definition_digest"],
                        "graphs": len(run["graphs"]), "node_states": observed, "journal_events": len(events), "high_watermark": run["high_watermark"]})
    hot = next(r for r in results if r["label"] == "parent-child"); cold = next(r for r in results if r["label"] == "cold-parent-child")
    assert {k: v for k, v in hot.items() if k != "label"} == {k: v for k, v in cold.items() if k != "label"}, "cold read differs"
    (out / "raw-observation-verification.json").write_text(json.dumps({"verdict": "RAW_210_OBSERVATION_BOUND", "results": results,
        "wheel_sha256": os.environ["QA_WHEEL_SHA"], "manifest": os.environ["QA_MANIFEST"], "sidecar_sha256": os.environ["QA_BINARY_SHA"],
        "database_source": str(databases[0]), "verification_uses_private_checkpointed_copy": True}, indent=2) + "\n")


if __name__ == "__main__":
    main()
