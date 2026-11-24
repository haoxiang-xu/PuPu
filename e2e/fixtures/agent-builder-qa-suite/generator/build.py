"""Produce the suite through the real PuPu host, export it, then replay the
import on an empty store exactly as a user's machine would see it."""
import json, os, shutil, sys
from copy import deepcopy
from hashlib import sha256

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import defs  # noqa: E402

from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError  # noqa: E402
from skeleton_code_admission import prepare_test_execution_material  # noqa: E402
from skeleton_builder_tests import fallback_kernel  # noqa: E402
from skeleton_source_transfer import import_managed_resource  # noqa: E402

OUT = sys.argv[1]
WORK = os.path.join(HERE, "work")
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK)
TEST_KERNEL = fallback_kernel(defs.PROFILE)


def extract_sources(document):
    """Strip author text from every owned Code node; return managed_sources."""
    rows = []
    stack = [(document, [])]
    while stack:
        body, prefix = stack.pop()
        for index, node in enumerate(body["nodes"]):
            path = prefix + ["nodes", index]
            config = node["config"]
            if node["type"] == "code":
                rows.append({"node_path": path, "text": config["code"].pop("__text")})
            elif node["type"] == "subagent_pool":
                for offset, entry in enumerate(config["subagents"]):
                    if entry["source"]["kind"] == "embedded":
                        stack.append((entry["source"]["document"], path + ["config", "subagents", offset, "source", "document"]))
            elif node["type"] == "hooks_pool":
                for offset, entry in enumerate(config["hooks"]):
                    if entry["workflow"].get("kind") == "embedded":
                        stack.append((entry["workflow"]["document"], path + ["config", "hooks", offset, "workflow", "document"]))
    return rows


def resolve_refs(value, revisions):
    if isinstance(value, dict):
        return {k: resolve_refs(v, revisions) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(v, revisions) for v in value]
    if isinstance(value, str) and value.startswith("__ref:"):
        return revisions[value[6:]]
    return value


def save(store, document):
    sources = extract_sources(document)
    return store.save_managed_draft({"schema": "pupu.skeleton-edit.v2", "document": document,
                                     "expected_edit_token": None, "managed_sources": sources})


def publish(store, resource_id, token):
    return store.publish_managed_workflow(resource_id, {"schema": "pupu.skeleton-publish.v2",
                                                        "expected_edit_token": token})


def admit(store, resource):
    selected, workflows = prepare_test_execution_material(
        resource["id"], resource["edit_token"], resource["kind"], store=store, draft_kernel=TEST_KERNEL)
    return selected


origin = SkeletonResourceStore(os.path.join(WORK, "origin"))
revisions, order, report = {}, [], []
for factory in defs.WORKFLOWS + defs.AGENTS:
    document = resolve_refs(factory(), revisions)
    saved = save(origin, document)
    resource = saved["resource"]
    diags = resource.get("diagnostics") or []
    assert not diags, (resource["id"], diags)
    if resource["kind"] == "workflow":
        version = publish(origin, resource["id"], resource["edit_token"])
        revisions[resource["id"]] = version["revision_id"] if "revision_id" in version else version["version"]["revision_id"]
    admit(origin, resource)
    order.append(resource["id"])

os.makedirs(OUT, exist_ok=True)
files = []
for position, resource_id in enumerate(order, 1):
    exported = origin.export_managed_resource(resource_id)
    name = f"{position:02d}-{resource_id}.json"
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as handle:
        handle.write(exported["source_json"])
    files.append((name, resource_id, exported["sha256"]))

# ---- replay: a fresh machine, the same file text, the UI's binding rule.
fresh = SkeletonResourceStore(os.path.join(WORK, "fresh"))
replayed = {}
for name, resource_id, digest in files:
    text = open(os.path.join(OUT, name), encoding="utf-8").read()
    assert sha256(text.encode()).hexdigest() == digest
    frame = json.loads(text)
    bindings = [{"node_path": e["node_path"], "environment_profile_id": "builtin"}
                for e in frame["sources_manifest"]["entries"]]
    result = fresh.import_managed_resource({"schema": "pupu.skeleton-import.v2", "source_json": text,
                                            "runtime_bindings": bindings})
    resource = result["resource"]
    if resource["kind"] == "workflow":
        version = publish(fresh, resource_id, resource["edit_token"])
        rev = version["revision_id"] if "revision_id" in version else version["version"]["revision_id"]
        assert rev == revisions[resource_id], (resource_id, rev, revisions[resource_id])
    admit(fresh, resource)
    # Idempotent re-import of the identical file must be accepted.
    fresh.import_managed_resource({"schema": "pupu.skeleton-import.v2", "source_json": text,
                                   "runtime_bindings": bindings})
    replayed[resource_id] = {"file": name, "kind": resource["kind"], "code_nodes": len(bindings),
                             "revision": revisions.get(resource_id)}

print(json.dumps({"revisions": revisions, "files": replayed}, ensure_ascii=False, indent=1))
