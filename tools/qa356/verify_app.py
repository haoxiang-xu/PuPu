"""Read actual App Journal/CAS on a private checkpointed copy after shutdown."""
from copy import deepcopy
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
from unchain.skeleton.durable_store import WorkflowExecutionStore


def verify_packaged_workflow_tool():
    out = Path(os.environ["QA_OUT"])
    read = lambda name: json.loads((out / name).read_text())
    assert read("functional-result.json")["verdict"] == "APP_ENTRY_ACCEPTED"
    assert read("errors.json") == []
    generations = read("process-generations.json")
    assert len(generations) == 2 and all(row["all_owned_dead"] is True for row in generations)
    assert int(generations[0]["stopped_ns"]) < int(generations[1]["started_ns"])
    assert generations[0]["main"]["pid"] != generations[1]["main"]["pid"]
    sidecars = []
    for row in generations:
        candidates = [identity for identity in row["processes_at_ready"]
            if Path(identity["exe"]).name == "unchain-server"]
        assert candidates, "sidecar_process_identity_missing"
        assert all(sha256(Path(identity["exe"]).read_bytes()).hexdigest() == os.environ["QA_BINARY_SHA"]
            for identity in candidates), "sidecar_binary_mismatch"
        sidecars.append({(identity["pid"], identity["start_ticks"]) for identity in candidates})
    assert sidecars[0].isdisjoint(sidecars[1])
    saved = read("ui-saved-agent.json")
    assert read("cold-read-agent.json") == saved
    seed = read("seed-v2-bridge.json")
    app_root = Path(os.environ["QA_APP"]).parent
    expected_files = json.loads((out.parent / "app-files.json").read_text())
    actual_files = {str(p.relative_to(app_root)): sha256(p.read_bytes()).hexdigest()
        for p in app_root.rglob("*") if p.is_file()}
    assert actual_files == expected_files, "packaged_app_changed_during_execution"
    expected_document = saved["resource"]["document"]
    tool = next(row for row in expected_document["nodes"] if row["id"] == "tools")["config"]["workflow_tools"][0]
    assert tool == {"id": "echo_run", "workflow": {"workflow_id": "desktop-wf356",
        "revision_id": seed["published"]["version"]["revision_id"]}}
    wires = read("provider-wires.json")
    ledger = read("ledger.json")
    assert len(wires) == 4
    for turn in (1, 2):
        enter = [row for row in ledger if row["action"] == "Enter" and row.get("turn") == turn]
        done = [row for row in ledger if row["action"] == "root reply visible" and row.get("turn") == turn]
        assert len(enter) == len(done) == 1
        assert int(enter[0]["at_ns"]) < int(wires[(turn - 1) * 2]["at_ns"])
        assert int(wires[turn * 2 - 1]["at_ns"]) < int(done[0]["at_ns"])
        assert f"Desktop Workflow Tool root reply {turn}" in (out / f"turn-{turn}-aria.txt").read_text()
    databases = list((out / "home").rglob("context_v2.sqlite3"))
    assert len(databases) == 1, "ambiguous_context_database"
    source = databases[0]
    copied = out / "journal-verification-copy"
    shutil.copytree(source.parent, copied)
    database = copied / source.name
    with sqlite3.connect(database) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        execution_ids = [row[0] for row in connection.execute(
            "SELECT DISTINCT execution_id FROM events WHERE event_type='pupu.skeleton.launch'")]
    assert len(execution_ids) == 1, "roots_not_in_the_same_chat"
    journal = open_existing_execution_journal_readonly(database_path=database,
        object_directory=copied / "objects", execution_id=execution_ids[0])
    events = journal.capture_snapshot().events
    (out / "canonical-journal.json").write_text(json.dumps([row.to_dict() for row in events], indent=2) + "\n")
    launches = [row for row in events if row.event_type == "pupu.skeleton.launch"]
    assert len(launches) == 2
    roots = []
    for turn, event in enumerate(launches, 1):
        artifact = ArtifactRef.from_dict(_thaw_json(event.payload["launch_ref"]))
        raw = journal.read_full_verified(artifact=artifact)
        assert sha256(raw).hexdigest() == event.payload["launch_sha256"]
        descriptor = json.loads(raw)
        assert canonical(descriptor) == raw
        assert descriptor["runtime_manifest"]["manifest_digest"] == os.environ["QA_MANIFEST"]
        assert descriptor["selection"]["document"] == expected_document, "executed_document_differs_from_ui_saved"
        assert descriptor["inputs"]["message"] == f"QA356 question {turn}"
        _, _, plan = validate_launch_descriptor(descriptor, session_id=execution_ids[0],
            root_run_id=event.attempt.attempt_id)
        store = WorkflowExecutionStore(journal, plan, graph_id=descriptor["graph_id"], attempt=event.attempt)
        record = store.load()
        state = record.state
        assert state["status"] == "completed" and state["root_committed"] is True
        assert not state["active"] and not state["error"]
        ends = [row for row in state["completed"] if row["node_id"] == "end"]
        assert len(ends) == 1
        result = store.read_json(ends[0]["output_ref"])
        assert result == {"message": f"Desktop Workflow Tool root reply {turn}"}
        final = [row for row in events if row.attempt == event.attempt and row.event_type == "final_message"]
        terminal = [row for row in events if row.attempt == event.attempt and row.event_type == "run_completed"]
        assert len(final) == len(terminal) == 1
        assert final[0].store_seq < terminal[0].store_seq
        assert final[0].payload["content"] == result["message"]
        assert not [row for row in events if row.attempt == event.attempt and row.event_type == "run_failed"]
        kernel = [row for row in state["completed"] if row["node_id"] == "kernel"]
        assert len(kernel) == 1
        settlements = [row for row in events if row.event_type == "skeleton.subagent_tool_settlement"
            and row.attempt.generation == event.attempt.generation
            and row.attempt.attempt_id == kernel[0]["node_attempt_id"]]
        assert len(settlements) == 1
        settlement = _thaw_json(settlements[0].payload)
        assert settlement["status"] == "completed" and settlement["call_id"] == f"workflow-call-{turn}"
        assert settlement["tool_name"] == "workflow_echo_run"
        ref = settlement["full_output_ref"]
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
            descriptors = connection.execute("SELECT artifact_json FROM artifacts WHERE execution_id=? AND artifact_id=? AND revision=?",
                (execution_ids[0], ref["id"], ref["revision"])).fetchall()
        assert len(descriptors) == 1
        child_artifact = ArtifactRef.from_dict(json.loads(descriptors[0][0]))
        child_bytes = journal.read_full_verified(artifact=child_artifact)
        assert sha256(child_bytes).hexdigest() == settlement["result_sha256"]
        assert len(child_bytes) == settlement["result_bytes"]
        completion = json.loads(child_bytes)
        assert completion["outputs"] == settlement["outputs"]
        assert completion["outputs"]["receipt"] == "committed-workflow-End-only"
        worker = Path(completion["outputs"]["interpreter"])
        relative_worker = worker.relative_to(app_root)
        assert str(relative_worker).startswith("resources/mcp_runtime/python/")
        assert sha256(worker.read_bytes()).hexdigest() == expected_files[str(relative_worker)]
        roots.append({"attempt": event.attempt.to_dict(), "final_seq": final[0].store_seq,
            "terminal_seq": terminal[0].store_seq, "state": deepcopy(state), "End": result,
            "child_completion": completion, "bundled_worker_sha256": expected_files[str(relative_worker)]})
    (out / "raw-verification.json").write_text(json.dumps({"verdict": "RAW_APP_ENTRY_ACCEPTED", "roots": roots,
        "wheel_sha256": os.environ["QA_WHEEL_SHA"], "manifest": os.environ["QA_MANIFEST"],
        "sidecar_sha256": os.environ["QA_BINARY_SHA"], "database_source": str(source),
        "verification_uses_private_checkpointed_copy": True}, indent=2) + "\n")


if __name__ == "__main__":
    verify_packaged_workflow_tool()
