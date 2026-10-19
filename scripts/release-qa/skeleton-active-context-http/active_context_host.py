#!/usr/bin/env python3
"""External offline preparation of the real active Context V2 host.

Default --preflight imports the real app and freezes a real saved Agent, but
does not construct an HTTP server, native SDK client or model execution.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import traceback
import zipfile


EXPECTED_WHEEL = "4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b"
EXPECTED_MANIFEST = "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101"
SOURCE_FILES = (
    "electron/preload/stream/unchain_stream_client.js",
    "electron/main/services/unchain/service.js",
    "electron/main/services/unchain/skeleton_credentials.js",
    "electron/main/services/unchain/memory_v2_rollout.js",
    "electron/shared/channels.js",
    "unchain_runtime/server/route_chat.py",
    "unchain_runtime/server/skeleton_production_chat.py",
    "unchain_runtime/server/skeleton_production_state.py",
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def interpreter_receipt():
    return {"executable": sys.executable, "version": sys.version,
        "isolated": bool(sys.flags.isolated), "dont_write_bytecode": sys.dont_write_bytecode,
        "pycache_prefix": sys.pycache_prefix}


def write_new(root, name, value):
    with (root / name).open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def repository_head(host):
    """Read source identity without launching a subprocess under the guard."""
    git = host / ".git"
    if not git.is_dir():
        raise ValueError("source checkout requires an in-tree Git directory")
    value = (git / "HEAD").read_text().strip()
    if value.startswith("ref: "):
        reference = value[5:]
        if not reference.startswith("refs/heads/") or ".." in reference:
            raise ValueError("source HEAD reference is invalid")
        loose = git / reference
        if loose.is_file():
            value = loose.read_text().strip()
        else:
            values = [row.split(" ", 1)[0] for row in (git / "packed-refs").read_text().splitlines()
                      if row.endswith(" " + reference)]
            if len(values) != 1:
                raise ValueError("source HEAD is not uniquely recorded")
            value = values[0]
    if re.fullmatch(r"[0-9a-f]{40}", value) is None:
        raise ValueError("source HEAD digest is invalid")
    return value


def fixture_document(resource_id, profile):
    def output(name, kind, path):
        return {"name": name, "source": {"kind": kind, "path": path}}
    def inputs(node):
        return [{"name": "message", "value": {"kind": "ref", "node_id": node,
                  "path": ["message"]}, "missing": "error"}]
    kernel = {"schema_version": 1, "profile": deepcopy(profile),
        "prompt": "Answer the user's message briefly.", "max_iterations": 3,
        "output_tokens": min(512, profile["output_limit"]), "history": "root",
        "overflow": "error", "json_schema": None}
    return {"schema_version": 1, "id": resource_id, "kind": "agent",
        "name": "Offline active Context HTTP fixture",
        "nodes": [
            {"id": "start", "type": "start", "config": {"execution": {
                "outputs": [output("message", "result", ["message"])]}}},
            {"id": "kernel", "type": "agent", "config": {"kernel": kernel,
                "execution": {"inputs": inputs("start"),
                    "outputs": [output("message", "result", ["message"])]}}},
            {"id": "end", "type": "end", "config": {"execution": {
                "inputs": inputs("kernel"), "outputs": [output("message", "input", ["message"])]}}}],
        "edges": [{"id": str(index), "kind": "flow", "source_node_id": source,
            "source_port_id": "out", "target_node_id": target, "target_port_id": "in"}
            for index, (source, target) in enumerate((("start", "kernel"), ("kernel", "end")))]}


def installed_identity(site, wheel):
    import unchain
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    if digest(wheel.read_bytes()) != EXPECTED_WHEEL:
        raise ValueError("fixed wheel digest mismatch")
    manifest = runtime_protocol_manifest()
    if manifest["manifest_digest"] != EXPECTED_MANIFEST:
        raise ValueError("runtime manifest digest mismatch")
    with zipfile.ZipFile(wheel) as archive:
        members = [name for name in archive.namelist()
                   if name.startswith("unchain/") and name.endswith(".py")]
        for name in members:
            if (site / name).read_bytes() != archive.read(name):
                raise ValueError("installed runtime differs from the fixed wheel")
    origins = {}
    for name, module in tuple(sys.modules.items()):
        if name == "unchain" or name.startswith("unchain."):
            origin = Path(module.__file__).resolve()
            if not origin.is_relative_to(site):
                raise ValueError("runtime source shadow detected")
            origins[name] = str(origin)
    if "unchain" not in origins:
        raise ValueError("runtime origin was not captured")
    return manifest, origins, len(members)


def preflight(args, safety):
    host, pair = args.host, args.pair
    site = pair / "install-venv/lib/python3.12/site-packages"
    wheel = pair / "wheel/unchain-0.2.0-py3-none-any.whl"
    os.environ.update(UNCHAIN_SOURCE_PATH=str(site), PUPU_CONTEXT_V2_STORE_OWNER="unchain",
        PUPU_FEATURE_MEMORY_V2="all", PUPU_MEMORY_V2_MODE="all",
        PUPU_MEMORY_V2_CANARY_PERCENT="100", PUPU_MEMORY_V2_READ_ONLY_DEGRADED="false")
    manifest, _, module_count = installed_identity(site, wheel)
    sys.path.insert(0, str(host / "unchain_runtime/server"))
    # The accident guard is already active. Do not replace routes, the active
    # admission, compiler, bindings, journal or End with test return values.
    from app import create_app
    import routes
    app = create_app()
    from skeleton_kernel_profiles import kernel_profiles
    from skeleton_resource_store import SkeletonResourceStore
    from skeleton_chat_selection import prepare_skeleton_chat_selection
    from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies
    from skeleton_credential_requirements import requirements_for_start
    from route_chat import _sanitize_memory_agent_config
    from skeleton_runtime_capability import require_skeleton_runtime
    if require_skeleton_runtime() != manifest:
        raise ValueError("host runtime manifest consumer mismatch")
    catalog = kernel_profiles()
    candidates = sorted((profile for profile in catalog["profiles"]
        if profile["provider"] == "openai" and profile["credential_ref"] == "openai"
        and profile["endpoint"] == "https://api.openai.com/v1"
        and profile["protocol"] == "openai-responses"), key=lambda profile: profile["id"])
    if not candidates:
        raise ValueError("the actual profile catalog offers no official OpenAI target")
    profile = candidates[0]
    document = fixture_document(args.agent_id, profile)
    store = SkeletonResourceStore()
    if not store.root.resolve().is_relative_to(safety.sandbox_root):
        raise ValueError("resource store escaped the disposable root")
    saved = store.save_draft(document)
    reloaded = store.get_resource(args.agent_id)
    if reloaded["document"] != document:
        raise ValueError("saved fixture differs on readback")
    selection_value = {"schema": "pupu.skeleton_chat_selection.v1", "kind": "resource",
                       "resource_id": args.agent_id}
    selected = prepare_skeleton_chat_selection({"skeleton_selection": selection_value}, store=store)
    workflows = freeze_skeleton_workflow_dependencies(selected, store=store)
    memory = _sanitize_memory_agent_config({"displayName": "Memory Agent", "additionalInstructions": "",
        "provider": profile["provider"], "modelId": profile["model"]})
    query = {"schema": "pupu.skeleton_credential_query.v1", "mode": "start",
        "session_id": args.run_id, "owner_chat_id": args.run_id,
        "interaction_id": "", "source_attempt_id": "", "selection": selection_value,
        "recipe_name": "", "memory_agent_config": memory}
    issued = requirements_for_start(query, memory_provider=memory["provider"], store=store)
    if issued["kind"] != "skeleton" or issued["scope"]["selection_digest"] != selected.snapshot_digest:
        raise ValueError("requirements do not identify the actual saved fixture")
    server_root = host / "unchain_runtime/server"
    for name in ("routes", "unchain_adapter", "skeleton_production_chat", "skeleton_production_state"):
        if name not in sys.modules:
            # Importing these definitions is inert, and makes the future
            # runtime boundary explicit without invoking execution.
            __import__(name)
    # Capture after the last host import, so late persistence/runtime helpers
    # cannot be absent from the origin evidence.
    manifest, origins, _ = installed_identity(site, wheel)
    host_origins = {}
    for name, module in tuple(sys.modules.items()):
        value = getattr(module, "__file__", None)
        if value and Path(value).resolve().is_relative_to(server_root):
            host_origins[name] = str(Path(value).resolve())
    for name in ("routes", "unchain_adapter", "skeleton_production_chat", "skeleton_production_state"):
        if name not in host_origins:
            raise ValueError("required host module origin is not the selected source")
    identity = {"host_head": repository_head(host),
        "host_source_hashes": {name: digest((host / name).read_bytes()) for name in SOURCE_FILES},
        "wheel_sha256": EXPECTED_WHEEL, "runtime_manifest": manifest,
        "loaded_unchain_origins": origins, "loaded_host_origins": host_origins,
        "HOME_environment_changed": os.environ.get("HOME") != args.original_home,
        "data_root": str(safety.data_dir), "resource_root": str(store.root),
        "app_factory": "app.create_app", "SDK_behavior_substitutions": []}
    receipt = {"schema": "qa.active-context-http-preflight.v1", "phase": "offline-preflight",
        "result": "PASS", "interpreter": interpreter_receipt(),
        "identity": identity, "fixture_id": args.agent_id,
        "fixture_edit_token": saved["edit_token"], "definition_digest": selected.definition_digest,
        "selection_digest": selected.snapshot_digest, "workflows_digest": workflows.snapshot_digest,
        "catalog_offered": len(catalog["profiles"]), "catalog_unavailable": len(catalog["unavailable"]),
        "fixed_wheel_python_module_count": module_count, "memory_agent_config": memory,
        "bytecode_lookup_prefix": sys.pycache_prefix,
        "bytecode_writes_disabled": sys.dont_write_bytecode,
        "SDK_calls": 0, "HTTP_server_constructed": False, "HTTP_requests": 0,
        "model_executions": 0, "serve_mode": "NOT_IMPLEMENTED_NOT_EXECUTED"}
    write_new(safety.sandbox_root, "fixture.json", document)
    write_new(safety.sandbox_root, "memory-agent-config.json", memory)
    write_new(safety.sandbox_root, "requirements.json", {"query": query, "response": issued})
    write_new(safety.sandbox_root, "identity.json", identity)
    write_new(safety.sandbox_root, "guard.json", safety.receipt())
    write_new(safety.sandbox_root, "preflight.json", receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--serve", action="store_true")
    parser.add_argument("--host", type=Path, required=True)
    parser.add_argument("--pair", type=Path, required=True)
    parser.add_argument("--guard-module", type=Path,
                        default=Path(__file__).with_name("runtime_safety_guard.py"))
    parser.add_argument("--sandbox", type=Path, required=True)
    parser.add_argument("--agent-id", default="active-context-http-agent")
    parser.add_argument("--run-id", default="active-context-http-preflight")
    args = parser.parse_args()
    if args.serve:
        parser.error("serve/observer are NOT_IMPLEMENTED_NOT_EXECUTED in this preparation slice")
    if not sys.flags.isolated:
        parser.error("the fixed interpreter must run with -I")
    for name in ("host", "pair", "sandbox", "guard_module"):
        if not getattr(args, name).is_absolute():
            parser.error("all filesystem arguments must be explicit absolute paths")
    lexical_host, lexical_pair, lexical_sandbox = args.host, args.pair, args.sandbox
    args.host, args.pair = args.host.resolve(), args.pair.resolve()
    args.sandbox, args.guard_module = args.sandbox.resolve(), args.guard_module.resolve()
    if any(lexical_sandbox.is_relative_to(root) for root in (lexical_host, lexical_pair)) or any(
            args.sandbox.is_relative_to(root) for root in (args.host, args.pair)):
        parser.error("--sandbox must be outside the product checkout and fixed pair")
    required_source = (*SOURCE_FILES, "unchain_runtime/server/app.py", "unchain_runtime/server/routes.py")
    if not (args.host / ".git").is_dir() or not all((args.host / name).is_file() for name in required_source):
        parser.error("--host requires the selected source checkout and required app/routes files")
    if not args.guard_module.is_file():
        parser.error("--guard-module must name an existing safety source file")
    site = args.pair / "install-venv/lib/python3.12/site-packages"
    if not args.pair.is_dir() or not site.is_dir() or not (
            args.pair / "wheel/unchain-0.2.0-py3-none-any.whl").is_file():
        parser.error("--pair requires the installed site and fixed wheel file")
    if Path(sys.executable).absolute() != args.pair / "install-venv/bin/python":
        parser.error("use the exact fixed-pair install-venv interpreter")
    args.original_home = os.environ.get("HOME")
    # -B forbids writes, but does not forbid an old pyc read. This nonexistent
    # per-run prefix prevents source/bytecode mismatches without deleting cache.
    sys.pycache_prefix = str(args.sandbox / "pycache")
    sys.dont_write_bytecode = True
    for value in (args.agent_id, args.run_id):
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,199}", value) is None:
            parser.error("fixture and run identifiers must be canonical")
    spec = importlib.util.spec_from_file_location("runtime_safety_guard", args.guard_module)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        safety = module.RuntimeSafetyGuard(sandbox_root=args.sandbox,
            read_roots=(args.host, site, Path(__file__).resolve().parent, args.guard_module.parent,
                        args.pair / "wheel/unchain-0.2.0-py3-none-any.whl"))
    except module.GuardViolation:
        parser.error("the safety policy refused the sandbox before allocation")
    try:
        # Reserve only after both CLI boundaries and protected-path policy
        # passed, before the guard's idempotent directory setup.
        args.sandbox.mkdir(exist_ok=False)
    except FileExistsError:
        parser.error("--sandbox must be a new disposable path; old evidence is immutable")
    except OSError:
        parser.error("--sandbox requires a writable, already existing external parent")
    try:
        with safety:
            receipt = preflight(args, safety)
    except Exception as error:
        # The rejection is part of preparation evidence, not a reason to
        # disable the guard or replace a production gate with a test result.
        receipt = {"schema": "qa.active-context-http-preflight.v1", "phase": "offline-preflight",
            "result": "BLOCKED", "interpreter": interpreter_receipt(),
            "exception_type": type(error).__name__,
            "guard": safety.receipt(), "stack": [{"file": frame.filename, "line": frame.lineno,
                "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)],
            "SDK_calls": 0, "HTTP_server_constructed": False, "HTTP_requests": 0,
            "model_executions": 0, "serve_mode": "NOT_IMPLEMENTED_NOT_EXECUTED"}
        receipt["bytecode_lookup_prefix"] = sys.pycache_prefix
        receipt["bytecode_writes_disabled"] = sys.dont_write_bytecode
        write_new(safety.sandbox_root, "preflight-blocked.json", receipt)
        print(json.dumps({"result": "BLOCKED", "guard_refusals": safety.refusals,
            "receipt": str(safety.sandbox_root / "preflight-blocked.json")}))
        return 2
    print(json.dumps({"result": receipt["result"], "fixture_id": receipt["fixture_id"],
        "profile": receipt["memory_agent_config"]["provider"] + ":" + receipt["memory_agent_config"]["modelId"],
        "receipt": str(safety.sandbox_root / "preflight.json"), "HTTP": "NOT_RUN", "SDK": "NOT_RUN"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
