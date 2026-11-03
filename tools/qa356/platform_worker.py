"""Provider-free durable Workflow with the native package's real Python."""
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
import zipfile

from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence import SQLiteContextV2Store
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
from unchain.skeleton import FileCodeSourceResolver, PythonEnvironmentProfile, SkeletonCodeRuntime, prepare_workflow
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore


def execute_packaged_worker():
    out = Path(os.environ["QA_OUT"])
    package = json.loads((out / "package.json").read_text())
    worker = Path(os.environ["PUPU_BUNDLED_PYTHON"])
    assert worker.is_file() and worker.resolve() != Path(sys.executable).resolve()
    assert sha256(worker.read_bytes()).hexdigest() == package["python_sha256"]
    source = out / "smoke/source"
    source.mkdir()
    (source / "main.py").write_text("import json,sys\ndef main(input,context):\n return {'answer':json.dumps({'executable':sys.executable,'version':list(sys.version_info[:3]),'value':input['text']},sort_keys=True)}\n")
    document = {"schema_version": 1, "kind": "workflow", "id": "platform-code", "name": "Native Code smoke", "nodes": [
        {"id": "start", "type": "start", "config": {"execution": {"outputs": [{"name": "text", "source": {"kind": "result", "path": ["text"]}}]}}},
        {"id": "code", "type": "code", "config": {"code": {"source": {"kind": "file", "path": "main.py"},
            "environment_profile_id": "builtin", "timeout_ms": 10000, "max_result_bytes": 10000, "max_log_bytes": 10000,
            "result_schema": {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"], "additionalProperties": False}},
            "execution": {"inputs": [{"name": "text", "value": {"kind": "ref", "node_id": "start", "path": ["text"]}, "missing": "error"}],
                "outputs": [{"name": "answer", "source": {"kind": "result", "path": ["answer"]}}]}}},
        {"id": "end", "type": "end", "config": {"execution": {"inputs": [{"name": "answer", "value": {"kind": "ref", "node_id": "code", "path": ["answer"]}, "missing": "error"}],
            "outputs": [{"name": "answer", "source": {"kind": "input", "path": ["answer"]}}]}}},
    ], "edges": [{"id": str(index), "kind": "flow", "source_node_id": a, "source_port_id": "out", "target_node_id": b, "target_port_id": "in"}
        for index, (a, b) in enumerate((("start", "code"), ("code", "end")))]}
    plan = prepare_workflow(document)
    journal = SQLiteContextV2Store(database_path=out / "smoke/worker.sqlite3", object_directory=out / "smoke/worker-objects").bind_execution("platform-worker")
    store = WorkflowExecutionStore(journal, plan, graph_id="native-smoke", attempt=AttemptRef(GenerationRef("platform-worker", "generation"), "root"))
    profile = PythonEnvironmentProfile.bundled("builtin", (str(worker),))
    runtime = SkeletonCodeRuntime(plan, source_resolver=FileCodeSourceResolver(source),
        profile_resolver=lambda name: profile if name == "builtin" else None, staging_root=out / "smoke/staging", poll_interval_s=.01)
    runner = DurableWorkflowRunner(store, {"code": runtime})
    runner.create({"text": "native-package-canonical-wheel"})
    result = runner.run()
    assert result.status == "completed", result.error
    witness = json.loads(result.outputs["answer"])
    assert Path(witness["executable"]).resolve() == worker.resolve()
    assert witness["version"][:2] == [3, 12] and witness["value"] == "native-package-canonical-wheel"
    state = store.load().state
    row = next(row for row in state["completed"] if row["node_id"] == "code")
    receipt = store.read_json(row["result_ref"])["_skeleton_code"]
    assert receipt["result"] == result.outputs
    wheel = Path(os.environ["QA_WHEEL"])
    assert sha256(wheel.read_bytes()).hexdigest() == package["wheel_sha256"]
    manifest = runtime_protocol_manifest()["manifest_digest"]
    assert manifest == package["manifest"]
    modules = []
    with zipfile.ZipFile(wheel) as archive:
        for name, module in list(sys.modules.items()):
            if not (name == "unchain" or name.startswith("unchain.")): continue
            filename = getattr(module, "__file__", None)
            if not filename: continue
            actual = Path(filename).resolve()
            member = str(actual.relative_to(Path(os.environ["QA_SITE"]).resolve())).replace("\\", "/")
            assert actual.read_bytes() == archive.read(member), name
            modules.append({"module": name, "file": str(actual), "sha256": sha256(actual.read_bytes()).hexdigest()})
    (out / "worker.json").write_text(json.dumps({"verdict": "PACKAGED_WORKER_ACCEPTED", "worker": witness,
        "worker_sha256": package["python_sha256"], "driver": sys.executable, "receipt": receipt,
        "wheel_sha256": package["wheel_sha256"], "manifest": manifest, "imported_modules": modules,
        "real_provider_calls": 0}, indent=2) + "\n")


if __name__ == "__main__":
    execute_packaged_worker()
