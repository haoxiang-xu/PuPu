#!/usr/bin/env python3
"""DRAFT: bounded direct Store/Core qualification. Does not install anything.

No Main, HTTP, provider, Agent or Code-body execution. Only public deterministic
Start→End run_workflow calls, plus the Store's real CPython profile probe.
Review before executing against the selected canonical wheel.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from copy import deepcopy
from dataclasses import asdict, is_dataclass
import hashlib
import json
from pathlib import Path
import re
import sys
import traceback
import zipfile


class QualificationFailure(RuntimeError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def json_value(value):
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, Path):
        return str(value)
    if type(value) is bytes:
        return {"sqlite_blob_hex": value.hex()}
    raise TypeError(f"Unrecordable actual response type: {type(value).__name__}")


class Recorder:
    def __init__(self, output):
        output.mkdir(parents=True, exist_ok=False)
        self.output = output
        self.stream = (output / "raw.jsonl").open("x", encoding="utf-8")
        self.sequence = 0
        self.checks = []
        self.cells = []
        self.network_attempts = []
        self.processes = []

    def emit(self, event, **data):
        self.sequence += 1
        self.stream.write(json.dumps({"sequence": self.sequence, "event": event, **data},
                                     ensure_ascii=False, allow_nan=False, default=json_value) + "\n")
        self.stream.flush()

    def check(self, condition, description):
        passed = bool(condition)
        self.emit("check", passed=passed, description=description)
        self.checks.append({"passed": passed, "description": description})
        if not passed:
            raise QualificationFailure(description)

    def call(self, name, request, operation):
        # Raw request and actual outcome are persisted before any verdict.
        self.emit("request", operation=name, request=request)
        try:
            value = operation()
        except Exception as error:
            detail = {"type": type(error).__name__, "module": type(error).__module__,
                      "code": getattr(error, "code", None), "path": list(getattr(error, "path", ())),
                      "status": getattr(error, "status", None), "message": str(error)}
            self.emit("response", operation=name, accepted=False, error=detail)
            return {"accepted": False, "error": detail}
        self.emit("response", operation=name, accepted=True, value=value)
        return {"accepted": True, "value": value}

    def accepted(self, outcome, description):
        self.check(outcome["accepted"], description)
        return outcome["value"]

    def refused(self, outcome, code, path, description):
        self.check(not outcome["accepted"], description + ": refused")
        self.check(outcome["error"]["code"] == code and outcome["error"]["path"] == path,
                   description + ": exact code/path")

    def cell(self, name, operation):
        self.emit("cell_begin", name=name)
        try:
            operation()
            result = {"name": name, "status": "PASS"}
        except Exception as error:
            result = {"name": name, "status": "FAIL", "type": type(error).__name__, "message": str(error)}
            self.emit("cell_exception", name=name, traceback=traceback.format_exc())
        self.emit("cell_end", **result)
        self.cells.append(result)


def workflow(identifier):
    return {"schema_version": 1, "kind": "workflow", "id": identifier, "name": "Pair control",
            "nodes": [
                {"id": "start", "type": "start", "config": {"execution": {"outputs": [
                    {"name": "value", "source": {"kind": "result", "path": ["value"]}}]}}},
                {"id": "end", "type": "end", "config": {"execution": {
                    "inputs": [{"name": "value", "value": {"kind": "ref", "node_id": "start", "path": ["value"]}, "missing": "error"}],
                    "outputs": [{"name": "value", "source": {"kind": "input", "path": ["value"]}}]}}}],
            "edges": [{"id": "edge", "kind": "flow", "source_node_id": "start", "source_port_id": "out",
                       "target_node_id": "end", "target_port_id": "in"}]}


def edit(document, token=None, sources=None):
    return {"schema": "pupu.skeleton-edit.v2", "document": deepcopy(document),
            "expected_edit_token": token, "managed_sources": deepcopy([] if sources is None else sources)}


def sqlite_value(value):
    return json_value(value) if type(value) is bytes else value


def database_state(store):
    # Logical SQLite contents, not a misleading DB/WAL file-byte comparison.
    with closing(store._connect()) as connection:
        connection.execute("BEGIN")
        schema = [dict(row) for row in connection.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name")]
        tables = {}
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            name = row["name"]
            quoted = '"' + name.replace('"', '""') + '"'
            cursor = connection.execute("SELECT * FROM " + quoted)
            columns = [item[0] for item in cursor.description]
            rows = [[sqlite_value(value) for value in item] for item in cursor.fetchall()]
            rows.sort(key=canonical)
            tables[name] = {"columns": columns, "rows": rows,
                            "sha256": digest({"columns": columns, "rows": rows})}
        value = {"schema": schema, "tables": tables}
        return {**value, "whole_logical_sha256": digest(value)}


def check_sources(rec, response, supplied):
    rec.check(response["schema"] == "pupu.skeleton-resource.v2", "actual response uses v2 resource envelope")
    entries = response["sources_manifest"]["entries"]
    actual = {tuple(row["node_path"]): row["sha256"] for row in entries}
    expected = {tuple(row["node_path"]): hashlib.sha256(row["text"].encode("utf-8")).hexdigest() for row in supplied}
    rec.check(actual == expected and len(entries) == len(supplied), "complete captured owned Code addresses/digests preserved")
    contents = {row["sha256"]: row["text"] for row in response["contents"]}
    rec.check(contents == {sha: row["text"] for row in supplied
                          for sha in [hashlib.sha256(row["text"].encode("utf-8")).hexdigest()]}, "exact owned Code text preserved")


def address(document, path):
    value = document
    for part in path:
        value = value[part]
    return value


def qualify(args, rec):
    installed = args.installed_root.resolve(strict=True)
    server = args.host_server.resolve(strict=True)
    wheel = args.wheel_path.resolve(strict=True)
    expected_manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    rec.emit("inputs", wheel=str(wheel), wheel_sha256=args.sha256, installed_root=str(installed),
             host_server=str(server), manifest_file=str(args.manifest.resolve()),
             manifest_file_sha256=hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
             producer_capture=str(args.producer_capture.resolve()),
             producer_capture_sha256=hashlib.sha256(args.producer_capture.read_bytes()).hexdigest(),
             python_executable=args.python_executable, profile_id=args.profile_id,
             claim_limit="direct v2 Store/public deterministic Workflow APIs; no HTTP/Main/App/Agent/Code body; prepared-snapshot isolation only")
    rec.check(bool(re.fullmatch("[a-f0-9]{64}", args.sha256)), "explicit canonical wheel SHA256 has exact syntax")
    rec.check(hashlib.sha256(wheel.read_bytes()).hexdigest() == args.sha256, "selected wheel bytes match explicit SHA256")
    rec.check(not any(name == "unchain" or name.startswith("unchain.") for name in sys.modules), "no Unchain module was preloaded")
    rec.check(Path(args.python_executable).is_absolute() and Path(args.python_executable).resolve() == Path(sys.executable).resolve(),
              "explicit profile executable is the current actual qualification Python")
    sys.dont_write_bytecode = True
    sys.path[:0] = [str(installed), str(server)]

    # Real registration probes CPython; no other child command is authorized.
    probe_script = ("import json,sys;print(json.dumps({'version':list(sys.version_info[:3]),"
                    "'implementation':sys.implementation.name},separators=(',',':')))")
    def audit(event, payload):
        if event.startswith("socket."):
            rec.network_attempts.append(event)
            rec.emit("denied_network", audit_event=event)
            raise PermissionError("qualification forbids network operations")
        if event == "subprocess.Popen":
            executable, argv, _cwd, _env = payload
            command = list(argv) if isinstance(argv, (tuple, list)) else [argv]
            allowed = (len(command) == 5 and command[1:4] == ["-I", "-B", "-c"] and command[4] == probe_script
                       and Path(executable).resolve() == Path(args.python_executable).resolve())
            rec.processes.append({"command": command, "allowed": allowed})
            rec.emit("subprocess", command=command, allowed=allowed)
            if not allowed:
                raise PermissionError("only the real Store CPython metadata probe is authorized")
    sys.addaudithook(audit)

    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    from unchain.skeleton import prepare_workflow, run_workflow
    from skeleton_resource_store import SkeletonResourceStore
    from skeleton_code_admission import _AdmissionStore
    from skeleton_code_sources import ManagedCodeSourceResolver
    from skeleton_runtime_capability import require_skeleton_runtime

    def imported_bytes(stage):
        rows = []
        with zipfile.ZipFile(wheel) as archive:
            for name, module in sorted(sys.modules.items()):
                if name != "unchain" and not name.startswith("unchain."):
                    continue
                filename = getattr(module, "__file__", None)
                if filename is None:
                    continue  # Namespace entries have no .py source to verify.
                path = Path(filename).resolve()
                rec.check(path.suffix == ".py" and path.is_relative_to(installed), f"{name} imports from selected installed wheel source")
                member = path.relative_to(installed).as_posix()
                actual = hashlib.sha256(path.read_bytes()).hexdigest()
                expected = hashlib.sha256(archive.read(member)).hexdigest()
                rec.emit("imported_module", stage=stage, module=name, path=str(path), wheel_member=member,
                         actual_sha256=actual, archive_sha256=expected)
                rec.check(actual == expected, f"{name} bytes equal selected wheel member")
                rows.append({"module": name, "path": str(path), "wheel_member": member, "sha256": actual})
        return rows

    manifest = runtime_protocol_manifest()
    rec.emit("actual_manifest", value=manifest)
    rec.check(manifest == expected_manifest, "actual imported manifest exactly equals explicit expected manifest file")
    rec.check(require_skeleton_runtime() == manifest, "Host independent validator admits actual imported manifest")
    skeleton = next((row for row in manifest["protocols"] if row["id"] == "skeleton_execution"), None)
    rec.check(skeleton is not None and skeleton["major"] == 1 and skeleton["minor"] >= 8
              and "node_display_label_v1" in skeleton["features"], "actual producer advertises compatible node label feature")
    imported_bytes("before_cells")
    fixture = json.loads(args.producer_capture.read_text(encoding="utf-8"))
    captured = deepcopy(fixture["edit"])
    rec.emit("captured_managed_edit", value=captured)
    rec.check(captured["schema"] == "pupu.skeleton-edit.v2" and captured["expected_edit_token"] is None,
              "selected actual producer capture is a create-edit v2 request")
    rec.check(bool(captured["managed_sources"]), "actual captured edit owns nonempty Code source aggregate")

    def save(store, request, name):
        return rec.accepted(rec.call(name, request, lambda: store.save_managed_draft(request)), name + " accepted")

    def cold_get(store, identifier, name):
        warm = rec.accepted(rec.call(name + ".same_store", {"resource_id": identifier},
            lambda: store.get_managed_resource(identifier)), name + " same Store read accepted")
        cold = rec.accepted(rec.call(name, {"resource_id": identifier},
            lambda: SkeletonResourceStore(store.root).get_managed_resource(identifier)), name + " accepted")
        rec.check(warm == cold, name + " same-instance and cold Store reads match exactly")
        return cold

    def preflight(store, identifier):
        # Exact direct Store adapter used by route_skeleton_code_sources.py:60-67.
        with closing(store._connect()) as connection, connection:
            connection.execute("BEGIN")
            return _AdmissionStore(store, connection).preflight(identifier)

    def draft_contract():
        store = SkeletonResourceStore(rec.output / "draft-contract-store")
        for case in ("missing_policy", "invalid_output_kind", "dynamic_missing_value", "valid_control"):
            document = workflow("probe-" + case)
            if case == "missing_policy":
                del document["nodes"][1]["config"]["execution"]["inputs"][0]["missing"]
            elif case == "invalid_output_kind":
                document["nodes"][1]["config"]["execution"]["outputs"][0]["source"]["kind"] = "outside"
            elif case == "dynamic_missing_value":
                document["nodes"][0]["config"]["execution"]["outputs"][0]["source"]["path"] = ["absent"]
            saved = save(store, edit(document), case + ".save")
            loaded = cold_get(store, document["id"], case + ".cold_get")
            rec.check(saved == loaded and saved["resource"]["document"] == document, case + " saved/read unchanged")
            checked = rec.call(case + ".preflight", {"resource_id": document["id"]}, lambda: preflight(store, document["id"]))
            request = {"schema": "pupu.skeleton-publish.v2", "expected_edit_token": saved["resource"]["edit_token"]}
            published = rec.call(case + ".publish", request, lambda: store.publish_managed_workflow(document["id"], request))
            diagnostics = saved["resource"]["diagnostics"]
            if case in ("missing_policy", "invalid_output_kind"):
                code = "missing_field" if case == "missing_policy" else "unknown_variant"
                path = ["document", "nodes", 1, "config", "execution"] + (["inputs", 0, "missing"] if case == "missing_policy" else ["outputs", 0, "source", "kind"])
                rec.check(any(row["code"] == code and row["path"] == path for row in diagnostics), case + " exact draft diagnostic")
                rec.refused(checked, code, path, case + " preflight")
                rec.refused(published, code, path, case + " publish")
            else:
                rec.check(diagnostics == [], case + " no static diagnostic")
                rec.accepted(checked, case + " preflight accepted")
                rec.accepted(published, case + " publish accepted")
                outcome = rec.call(case + ".public_run_workflow", {"inputs": {"value": "actual caller value"}, "handlers": {}},
                    lambda: run_workflow(prepare_workflow(document), {"value": "actual caller value"}, {}))
                if case == "dynamic_missing_value":
                    rec.refused(outcome, "missing_value", ["document", "nodes", 0, "config", "execution", "outputs", 0, "source", "path"], "dynamic absent value fails at evaluation")
                else:
                    result = rec.accepted(outcome, "positive Start/End Workflow really ran")
                    rec.check(result.outputs == {"value": "actual caller value"}
                              and result.completed_node_ids == ("start", "end") and result.selected_edge_ids == ("edge",), "positive control exact deterministic execution")

    def labels():
        store = SkeletonResourceStore(rec.output / "labels-store")
        for index, label in enumerate((None, "Name", "  审核 e\u0301\n", "\ufeff", "\u0085name\u0085")):
            document = workflow("label-valid-" + str(index))
            if label is not None:
                document["nodes"][0]["label"] = label
            saved = save(store, edit(document), f"label_valid_{index}.save")
            loaded = cold_get(store, document["id"], f"label_valid_{index}.cold_get")
            rec.check(saved == loaded and loaded["resource"]["document"] == document, "label raw text or absence survives real v2 and cold read")
        invalid = [("", "invalid_value"), (" \t\r\n", "invalid_value"), ("\u0085", "invalid_value"),
                   ("\u001c\u001d\u001e\u001f\u00a0\u1680\u2000\u2028\u2029\u202f\u205f\u3000", "invalid_value"),
                   (None, "invalid_type"), (True, "invalid_type"), (3, "invalid_type"), ([], "invalid_type"), ({}, "invalid_type")]
        for index, (label, code) in enumerate(invalid):
            document = workflow("label-invalid-" + str(index)); document["nodes"][0]["label"] = label
            before = database_state(store); rec.emit("database_before", cell="label_invalid", value=before)
            outcome = rec.call(f"label_invalid_{index}.save", edit(document), lambda: store.save_managed_draft(edit(document)))
            after = database_state(store); rec.emit("database_after", cell="label_invalid", value=after)
            rec.refused(outcome, code, ["document", "nodes", 0, "label"], "malformed label exact refusal")
            rec.check(before == after, "rejected label leaves every database table unchanged")
        document = workflow("label-unknown"); document["nodes"][0].update(label="Valid", display_name="Unknown")
        before = database_state(store); rec.emit("database_before", cell="label_unknown", value=before)
        outcome = rec.call("label_unknown.save", edit(document), lambda: store.save_managed_draft(edit(document)))
        after = database_state(store); rec.emit("database_after", cell="label_unknown", value=after)
        rec.refused(outcome, "unknown_field", ["document", "nodes", 0, "display_name"], "optional label does not open unknown metadata")
        rec.check(before == after, "unknown node key rejection leaves every database table unchanged")

    def stale_cas():
        store = SkeletonResourceStore(rec.output / "cas-store")
        request = deepcopy(captured); target = address(request["document"], request["managed_sources"][0]["node_path"])
        target["label"] = "A"
        first = save(store, request, "cas.A.save"); check_sources(rec, first, captured["managed_sources"])
        second_request = edit(first["resource"]["document"], first["resource"]["edit_token"], captured["managed_sources"])
        address(second_request["document"], captured["managed_sources"][0]["node_path"])["label"] = "B"
        second = save(store, second_request, "cas.B.save")
        stale = edit(first["resource"]["document"], first["resource"]["edit_token"], captured["managed_sources"])
        address(stale["document"], captured["managed_sources"][0]["node_path"])["label"] = "Stale valid rename"
        before = database_state(store); rec.emit("database_before", cell="stale_cas", value=before)
        rejected = rec.call("cas.stale.save", stale, lambda: store.save_managed_draft(stale))
        after = database_state(store); rec.emit("database_after", cell="stale_cas", value=after)
        rec.refused(rejected, "edit_conflict", ["expected_edit_token"], "stale valid rename CAS")
        rec.check(before == after, "stale valid rename leaves full schema/all table rows and digests unchanged")
        rec.check(cold_get(store, second["resource"]["id"], "cas.cold_get") == second, "cold Store retains B after stale rejection")
        check_sources(rec, second, captured["managed_sources"])

    def prepared_snapshot_only():
        store = SkeletonResourceStore(rec.output / "prepared-store")
        document = workflow("prepared-label"); document["nodes"][0]["label"] = "A"
        first = save(store, edit(document), "prepared.A.save")
        plan_a = rec.accepted(rec.call("prepared.A.prepare", first["resource"]["document"],
            lambda: prepare_workflow(first["resource"]["document"])), "prepare actual A")
        frozen_a = plan_a.snapshot(); rec.emit("prepared_snapshot", phase="A_before", value=frozen_a)
        changed = deepcopy(first["resource"]["document"]); changed["nodes"][0]["label"] = "B"
        second = save(store, edit(changed, first["resource"]["edit_token"]), "prepared.B.save")
        loaded = cold_get(store, document["id"], "prepared.B.cold_get")
        plan_b = rec.accepted(rec.call("prepared.B.prepare", loaded["resource"]["document"],
            lambda: prepare_workflow(loaded["resource"]["document"])), "prepare actual B")
        rec.emit("prepared_snapshot", phase="A_after_B_save", value=plan_a.snapshot())
        rec.emit("prepared_snapshot", phase="B", value=plan_b.snapshot())
        rec.check(plan_a.snapshot() == frozen_a and frozen_a["nodes"][0]["label"] == "A", "prepared A snapshot retains label A after Store B save")
        rec.check(plan_b.snapshot() == changed == second["resource"]["document"], "new prepared B snapshot has exact label B definition")
        one = rec.accepted(rec.call("prepared.A.public_run_workflow", {"inputs": {"value": "same caller input"}},
            lambda: run_workflow(plan_a, {"value": "same caller input"}, {})), "public A Start/End run")
        two = rec.accepted(rec.call("prepared.B.public_run_workflow", {"inputs": {"value": "same caller input"}},
            lambda: run_workflow(plan_b, {"value": "same caller input"}, {})), "public B Start/End run")
        rec.check(one == two and one.outputs == {"value": "same caller input"}, "label changes preserve exact public deterministic execution outcome")
        rec.emit("claim_limit", cell="prepared_snapshot_only", text="This is prepared-snapshot isolation, not an active/suspended lifecycle replay. Existing lifecycle evidence is inherited separately, not claimed as run here.")

    def transfer():
        origin = SkeletonResourceStore(rec.output / "export-origin-store")
        destination = SkeletonResourceStore(rec.output / "import-destination-store")
        request = deepcopy(captured)
        for index, node in enumerate(request["document"]["nodes"]):
            node["label"] = f"  导入 e\u0301 {index}\u0085 "
        saved = save(origin, request, "transfer.origin.save"); check_sources(rec, saved, captured["managed_sources"])
        before = database_state(origin); rec.emit("database_before", cell="export_origin", value=before)
        exported = rec.accepted(rec.call("transfer.public_export", {"resource_id": saved["resource"]["id"]},
            lambda: origin.export_managed_resource(saved["resource"]["id"])), "real public v2 export")
        rec.check(set(exported) == {"schema", "source_json", "sha256"} and exported["schema"] == "pupu.skeleton-export.v2", "actual export closed v2 shape")
        rec.check(hashlib.sha256(exported["source_json"].encode("utf-8")).hexdigest() == exported["sha256"], "actual exported UTF8 bytes match export digest")
        frame = json.loads(exported["source_json"])
        rec.emit("exported_parsed_source", value=frame)
        rec.check(frame["document"] == saved["resource"]["document"], "export labels and stable IDs match exact stored document")
        postExportState = database_state(origin)
        rec.emit("database_after", cell="export_origin", stage="post_export", value=postExportState)
        rec.check(postExportState == before, "export does not mutate any origin table")
        profile = rec.accepted(rec.call("transfer.register_actual_python", {"profile_id": args.profile_id, "executable": args.python_executable},
            lambda: destination.save_python_profile(args.profile_id, args.python_executable)), "real public Python profile registration")
        probe = rec.accepted(rec.call("transfer.probe_actual_python", {"profile_id": args.profile_id},
            lambda: destination.probe_python_profile(args.profile_id)), "real current Python metadata probe")
        rec.check(profile["available"] is True and profile["probe"]["ok"] is True and probe["ok"] is True, "registered actual CPython profile is available and probed")
        bindings = [{"node_path": deepcopy(row["node_path"]), "environment_profile_id": args.profile_id}
                    for row in frame["sources_manifest"]["entries"]]
        payload = {"schema": "pupu.skeleton-import.v2", "source_json": exported["source_json"], "runtime_bindings": bindings}
        imported = rec.accepted(rec.call("transfer.public_import", payload, lambda: destination.import_managed_resource(payload)), "real public v2 import into separate fresh Store")
        expected = deepcopy(frame["document"])
        for binding in bindings:
            address(expected, binding["node_path"])["config"]["code"]["environment_profile_id"] = args.profile_id
        rec.check(imported["resource"]["document"] == expected, "import changes only explicitly rebound Python profile; all labels/IDs/edges/other config preserved")
        rec.check(imported["sources_manifest"] == saved["sources_manifest"] and imported["contents"] == saved["contents"], "source ownership addresses, digests and exact bytes survive import")
        check_sources(rec, imported, captured["managed_sources"])
        resolver = ManagedCodeSourceResolver({"schema": "pupu.skeleton-code-snapshot.v1", "document": imported["resource"]["document"],
            **{key: imported[key] for key in ("sources_manifest", "contents", "content_digest")}})
        for row in captured["managed_sources"]:
            code = address(expected, row["node_path"])["config"]["code"]
            resolved = resolver(code["source"]["path"])
            rec.emit("resolved_owned_source", node_path=row["node_path"], sha256=resolved.sha256, utf8_hex=resolved.content.hex())
            rec.check(resolved.content == row["text"].encode("utf-8"), "actual source resolver returns exact captured bytes without executing Code")
        rec.check(cold_get(destination, expected["id"], "transfer.destination.cold_get") == imported, "cold destination Store preserves imported v2 resource")
        postImportState = database_state(origin)
        rec.emit("database_after", cell="export_origin", stage="post_import", value=postImportState)
        rec.check(postImportState == before, "registration/import leave all origin tables unchanged")

    for name, operation in (("draft_contract", draft_contract), ("labels_v2", labels), ("stale_valid_rename_cas", stale_cas),
                            ("prepared_snapshot_only", prepared_snapshot_only), ("owned_code_export_import", transfer)):
        rec.cell(name, operation)
    imports = imported_bytes("after_all_cells")
    rec.check(not rec.network_attempts, "no attempted network operation")
    rec.check(all(item["allowed"] for item in rec.processes), "only actual CPython metadata probes were launched")
    return {"wheel_sha256": args.sha256, "runtime_manifest": manifest, "verified_imported_modules": imports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wheel-path", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--installed-root", required=True, type=Path, help="Already installed selected wheel's site-packages directory; no install performed")
    parser.add_argument("--host-server", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path, help="Independent expected full manifest JSON for selected canonical wheel")
    parser.add_argument("--producer-capture", required=True, type=Path)
    parser.add_argument("--python-executable", required=True, help="Current actual qualification venv Python; real Store probe, not Code execution")
    parser.add_argument("--profile-id", required=True, help="New non-builtin profile id in fresh destination Store")
    parser.add_argument("--output", required=True, type=Path, help="New directory; refuses to overwrite existing evidence")
    args = parser.parse_args()
    rec = Recorder(args.output)
    details = {}
    fatal = None
    try:
        details = qualify(args, rec)
    except Exception as error:
        fatal = {"type": type(error).__name__, "message": str(error)}
        rec.emit("fatal", error=fatal, traceback=traceback.format_exc())
    passed = fatal is None and len(rec.cells) == 5 and all(row["status"] == "PASS" for row in rec.cells)
    rec.emit("qualification_end", status="PASS" if passed else "NOT_QUALIFIED")
    rec.stream.close()
    # Raw results are closed before summary; failed/partial runs remain inspectable.
    summary = {"status": "PASS" if passed else "NOT_QUALIFIED", "scope": "direct installed-wheel/Host Store qualification, not HTTP/Main/App",
               "cells": rec.cells, "checks": rec.checks, "fatal": fatal, **details,
               "raw_sha256": hashlib.sha256((args.output / "raw.jsonl").read_bytes()).hexdigest(),
               "profile_probe_subprocesses": rec.processes, "network_attempts": rec.network_attempts,
               "not_claimed": ["Agent/provider/SDK execution", "Code body execution", "active/suspended lifecycle rerun", "HTTP/Main/App coverage"]}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": summary["status"], "output": str(args.output), "cells": rec.cells}, ensure_ascii=False))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
