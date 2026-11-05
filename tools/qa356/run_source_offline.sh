#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--inside" ]]; then
  : "${RUNNER_TEMP:?RUNNER_TEMP is required}"
  : "${QA_CANDIDATE_ROOT:?QA_CANDIDATE_ROOT is required}"
  : "${QA_CORE_ROOT:?QA_CORE_ROOT is required}"
  : "${QA_SERVER:?QA_SERVER is required}"
  : "${QA_CONTROL:?QA_CONTROL is required}"
  : "${QA_OUT:?QA_OUT is required}"
  : "${QA_PYTHON:?QA_PYTHON is required}"
  : "${QA_SITE:?QA_SITE is required}"
  : "${QA_WHEEL:?QA_WHEEL is required}"
  : "${QA_WHEEL_SHA:?QA_WHEEL_SHA is required}"
  : "${QA_CANDIDATE_SHA:?QA_CANDIDATE_SHA is required}"
  : "${QA_CANDIDATE_TREE:?QA_CANDIDATE_TREE is required}"
  : "${QA_CORE_SHA:?QA_CORE_SHA is required}"
  : "${QA_CORE_TREE:?QA_CORE_TREE is required}"

  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_HOME="$RUNNER_TEMP/356-source-home" QA_TMP="$RUNNER_TEMP/356-source-tmp"
  mkdir -p "$QA_HOME" "$QA_TMP" "$QA_OUT"
  if sudo --preserve-env=PATH,QA_UID,QA_GID,QA_HOME,QA_TMP,QA_CANDIDATE_ROOT,QA_CORE_ROOT,QA_SERVER,QA_CONTROL,QA_OUT,QA_PYTHON,QA_SITE,QA_WHEEL,QA_WHEEL_SHA,QA_CANDIDATE_SHA,QA_CANDIDATE_TREE,QA_CORE_SHA,QA_CORE_TREE \
    unshare --net /bin/bash "$0" --inside > "$QA_OUT/isolation-setup.log" 2>&1; then
    printf 'exit=0\n' > "$QA_OUT/isolation-wrapper-exit.txt"
    exit 0
  else
    wrapper_status=$?
    printf 'exit=%s\n' "$wrapper_status" > "$QA_OUT/isolation-wrapper-exit.txt"
    exit "$wrapper_status"
  fi
fi

ip link set lo up
ip -j address show > "$QA_OUT/network-interfaces.json"
ip -j route show > "$QA_OUT/network-ipv4-routes.json"
ip -6 -j route show > "$QA_OUT/network-ipv6-routes.json"

run=(setpriv --reuid="$QA_UID" --regid="$QA_GID" --clear-groups
  --no-new-privs --bounding-set=-all --inh-caps=-all --ambient-caps=-all env -i
  PATH="$PATH" HOME="$QA_HOME" TMPDIR="$QA_TMP" LANG=C.UTF-8
  PYTHONDONTWRITEBYTECODE=1
  QA_CANDIDATE_ROOT="$QA_CANDIDATE_ROOT" QA_CORE_ROOT="$QA_CORE_ROOT"
  QA_SERVER="$QA_SERVER" QA_CONTROL="$QA_CONTROL" QA_OUT="$QA_OUT"
  QA_SITE="$QA_SITE" QA_WHEEL="$QA_WHEEL" QA_WHEEL_SHA="$QA_WHEEL_SHA"
  QA_CANDIDATE_SHA="$QA_CANDIDATE_SHA" QA_CANDIDATE_TREE="$QA_CANDIDATE_TREE"
  QA_CORE_SHA="$QA_CORE_SHA" QA_CORE_TREE="$QA_CORE_TREE")

status=0
"${run[@]}" "$QA_PYTHON" -I -B - <<'PY' > "$QA_OUT/pytest.log" 2>&1 || status=$?
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

out = Path(os.environ["QA_OUT"])
candidate = Path(os.environ["QA_CANDIDATE_ROOT"]).resolve()
core_root = Path(os.environ["QA_CORE_ROOT"]).resolve()
server = Path(os.environ["QA_SERVER"]).resolve()
control = Path(os.environ["QA_CONTROL"]).resolve()
wheel = Path(os.environ["QA_WHEEL"]).resolve()
wheel_sha = os.environ["QA_WHEEL_SHA"]
candidate_sha = os.environ["QA_CANDIDATE_SHA"]
candidate_tree = os.environ["QA_CANDIDATE_TREE"]
core_sha = os.environ["QA_CORE_SHA"]
core_tree = os.environ["QA_CORE_TREE"]

selectors = json.loads(r'''[
  "unchain_runtime/server/tests/test_skeleton_agent_runtime.py::test_native_delegate_forwards_child_model_events_without_changing_identity",
  "unchain_runtime/server/tests/test_skeleton_production_chat.py::test_stream_worker_preserves_only_typed_committed_child_end_final",
  "unchain_runtime/server/tests/test_skeleton_runtime_capability.py::test_actual_producer_is_admitted_by_independent_consumer_without_parser",
  "unchain_runtime/server/tests/test_skeleton_runtime_capability.py::test_native_observation_producer_rejections_happen_before_profile_effects",
  "unchain_runtime/server/tests/test_skeleton_launch_manifest.py::test_actual_old_launch_keeps_its_original_manifest_and_digest",
  "unchain_runtime/server/tests/test_skeleton_launch_manifest.py::test_current_launch_still_uses_the_actual_current_manifest",
  "unchain_runtime/server/tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_chat_stream_v4_projects_private_native_child_attribution_after_normalization"
]''')
assert len(selectors) == 7 and all(isinstance(selector, str) for selector in selectors)

def write_json(name, value):
    (out / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")

def git_value(root, ref):
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", ref], text=True).strip()

def proc_identity():
    raw = Path("/proc/self/stat").read_bytes()
    end = raw.rfind(b")")
    if end < 0:
        raise RuntimeError("proc_stat_unparseable")
    fields = raw[end + 2 :].split()
    status = {}
    for line in Path("/proc/self/status").read_text().splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        status[key] = value.strip()
    caps = {name: status.get(name, "") for name in
            ("CapEff", "CapPrm", "CapBnd", "CapInh", "CapAmb")}
    groups = status.get("Groups", "").split()
    return {
        "pid": os.getpid(),
        "uid": os.getuid(),
        "euid": os.geteuid(),
        "gid": os.getgid(),
        "start_ticks": int(fields[19]),
        "exe": os.readlink("/proc/self/exe"),
        "net_namespace": os.readlink("/proc/self/ns/net"),
        "no_new_privs": status.get("NoNewPrivs", ""),
        "supplementary_groups": groups,
        "capabilities": caps,
    }

def validate_privilege_fence(identity):
    assert identity["no_new_privs"] == "1", identity
    assert identity["supplementary_groups"] == [], identity
    assert all(value and int(value, 16) == 0
               for value in identity["capabilities"].values()), identity

def network_state():
    interfaces = json.loads(subprocess.check_output(["ip", "-j", "address", "show"], text=True))
    routes4 = json.loads(subprocess.check_output(["ip", "-j", "route", "show"], text=True))
    routes6 = json.loads(subprocess.check_output(["ip", "-6", "-j", "route", "show"], text=True))
    names = sorted(row["ifname"] for row in interfaces)
    assert names == ["lo"], {"unexpected_interfaces": names}
    routes = routes4 + routes6
    assert all(row.get("dev") in (None, "lo") for row in routes), routes
    assert not any(row.get("dst") == "default" for row in routes), routes
    return {"interfaces": interfaces, "ipv4_routes": routes4, "ipv6_routes": routes6,
            "loopback_only": True, "external_default_route": False}

def imported_source_modules():
    rows = []
    errors = []
    for name, module in sorted(sys.modules.copy().items()):
        if name != "unchain" and not name.startswith("unchain."):
            continue
        filename = getattr(module, "__file__", None)
        if not filename:
            errors.append({"module": name, "reason": "module_has_no_file"})
            continue
        path = Path(filename)
        if path.suffix == ".pyc":
            path = Path(importlib.util.source_from_cache(str(path)))
        path = path.resolve()
        if not path.is_relative_to(core_root):
            errors.append({"module": name, "reason": "outside_core_source", "file": str(path)})
            continue
        rows.append({"module": name, "file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return rows, errors

result = {
    "schema": "qa356.linux-source-qualification.v1",
    "candidate": {"commit": candidate_sha, "tree": candidate_tree},
    "core": {"commit": core_sha, "tree": core_tree},
    "dependency_wheel": {"sha256": wheel_sha, "role": "dependency_only_not_runtime_source"},
    "selectors": selectors,
    "status": "starting",
    "errors": [],
}
identity_start = None
identity_end = None
network_start = None
network_end = None
imported = []
import_errors = []
source_import_capture_started = False
pytest_started = False
pytest_status = None
junit_info = {"status": "NOT_RUN", "reason": "pytest_not_started"}
privilege_start_ok = False
privilege_end_ok = False
source_binding_ok = False
process_identity_verified = False
network_proof_verified = False
outcome_recorder = None

def write_not_run_junit(reason):
    message = ("harness-error/NOT_RUN: " + str(reason)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    (out / "acceptance.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<testsuite name="qa356-harness" tests="1" failures="0" errors="1" skipped="0">'
        '<testcase classname="qa356.harness" name="source-tests-not-run">'
        '<error message="harness-error/NOT_RUN">' + message + '</error>'
        '</testcase></testsuite>\n'
    )

def record_junit():
    global junit_info
    junit_path = out / "acceptance.xml"
    if not junit_path.is_file():
        junit_info = {"status": "HARNESS_ERROR/NOT_RUN", "reason": "pytest_did_not_emit_junit"}
        write_not_run_junit(junit_info["reason"])
        result["junit"] = junit_info
        return
    if not pytest_started:
        junit_info = {"status": "HARNESS_ERROR/NOT_RUN", "reason": "pytest_never_started"}
        write_not_run_junit(junit_info["reason"])
        result["junit"] = junit_info
        return
    try:
        import xml.etree.ElementTree as ET
        root = ET.parse(junit_path).getroot()
        cases = root.findall(".//testcase")
        skipped = sum(len(case.findall("skipped")) for case in cases)
        failures = sum(len(case.findall("failure")) for case in cases)
        errors = sum(len(case.findall("error")) for case in cases)
        junit_info = {"status": "captured", "cases": len(cases), "expected_cases": 9,
                      "skipped": skipped, "failures": failures, "errors": errors}
        result["junit"] = junit_info
        if len(cases) != 9 or skipped != 0 or failures != 0 or errors != 0:
            result["errors"].append({"type": "JUnitAcceptanceError", "details": junit_info})
    except BaseException as error:
        junit_info = {"status": "HARNESS_ERROR/INVALID_JUNIT", "reason": str(error)}
        result["errors"].append({"type": "JUnitParseError", "message": str(error)})
    result["junit"] = junit_info

try:
    assert re.fullmatch(r"[0-9a-f]{40}", candidate_sha)
    assert re.fullmatch(r"[0-9a-f]{40}", core_sha)
    assert git_value(candidate, "HEAD") == candidate_sha
    assert git_value(candidate, "HEAD^{tree}") == candidate_tree
    assert git_value(core_root.parent, "HEAD") == core_sha
    assert git_value(core_root.parent, "HEAD^{tree}") == core_tree
    assert hashlib.sha256(wheel.read_bytes()).hexdigest() == wheel_sha
    expected_credential_names = [name for name in os.environ
        if name.upper().endswith(("_API_KEY", "_TOKEN", "_SECRET"))]
    assert not expected_credential_names, expected_credential_names
    assert os.getuid() != 0, "pytest_must_not_run_as_root"
    identity_start = proc_identity()
    write_json("process-identity.json", {"status": "partial", "before": identity_start, "after": None})
    validate_privilege_fence(identity_start)
    privilege_start_ok = True
    network_start = network_state()
    write_json("external-network-proof.json", {"status": "partial", "before": network_start, "after": None})

    sys.path.insert(0, str(control))
    sys.path.insert(0, str(server))
    sys.path.insert(0, str(core_root))
    import unchain
    from unchain.runtime import runtime_protocol
    import unchain.skeleton.kernel_runtime as kernel_runtime
    import unchain.skeleton.subagent_runtime as subagent_runtime
    import unchain.subagents.plugin as subagent_plugin

    manifest = runtime_protocol.runtime_protocol_manifest()
    skeleton = next(row for row in manifest["protocols"] if row["id"] == "skeleton_execution")
    assert skeleton["major"] == 1 and skeleton["minor"] == 7, skeleton
    assert "subagent_native_observation_v1" in skeleton["features"], skeleton
    pinned_modules = [unchain, runtime_protocol, kernel_runtime, subagent_runtime, subagent_plugin]
    pinned_provenance = {}
    for module in pinned_modules:
        path = Path(module.__file__).resolve()
        assert path.is_relative_to(core_root), {"module": module.__name__, "file": str(path)}
        pinned_provenance[module.__name__] = {"file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    source_binding_ok = True

    import pytest
    class OutcomeRecorder:
        def __init__(self):
            self.reports = []

        def pytest_runtest_logreport(self, report):
            if report.when == "call" or report.skipped:
                self.reports.append({
                    "nodeid": report.nodeid,
                    "when": report.when,
                    "outcome": report.outcome,
                    "wasxfail": getattr(report, "wasxfail", None),
                })

    outcome_recorder = OutcomeRecorder()
    os.chdir(candidate)
    result["protocol"] = {"major": skeleton["major"], "minor": skeleton["minor"],
        "features": skeleton["features"], "manifest_digest": manifest["manifest_digest"]}
    result["pinned_core_modules"] = pinned_provenance
    result["pid"] = identity_start["pid"]
    pytest_started = True
    try:
        (out / "acceptance.xml").unlink()
    except FileNotFoundError:
        pass
    pytest_status = int(pytest.main([
        "-q", "-p", "no:cacheprovider", "--showlocals",
        "--basetemp", str(out / "pytest-data"),
        "--junitxml", str(out / "acceptance.xml"), *selectors,
    ], plugins=[outcome_recorder]))
    record_junit()
    source_import_capture_started = True
    imported, import_errors = imported_source_modules()
    identity_end = proc_identity()
    validate_privilege_fence(identity_end)
    privilege_end_ok = True
    network_end = network_state()
    assert identity_end == identity_start, {"before": identity_start, "after": identity_end}
    process_identity_verified = True
    assert network_start == network_end, "network_namespace_changed_during_test"
    network_proof_verified = True
    result["imported_unchain_modules"] = imported
    result["errors"].extend(import_errors)
    result["pytest_exit"] = pytest_status
    outcomes = outcome_recorder.reports if outcome_recorder is not None else []
    result["execution_outcomes"] = outcomes
    result["xfailed_or_xpassed"] = sum(row["wasxfail"] is not None for row in outcomes)
    result["skipped_reports"] = sum(row["outcome"] == "skipped" for row in outcomes)
    result["passed_call_reports"] = sum(row["when"] == "call" and row["outcome"] == "passed" and row["wasxfail"] is None for row in outcomes)
    result["process_identity"] = identity_end
    result["network"] = {"namespace": identity_end["net_namespace"], "before": network_start, "after": network_end}
    result["status"] = "passed"
    result["exit_code"] = 0
except BaseException as error:
    result["status"] = "failed"
    result["errors"].append({"type": type(error).__name__, "message": str(error)})
    result["exit_code"] = pytest_status if pytest_status not in (None, 0) else 3
finally:
    if not source_import_capture_started:
        try:
            imported, import_errors = imported_source_modules()
            source_import_capture_started = bool(imported or import_errors)
        except BaseException as error:
            import_errors = [{"reason": "capture_failed", "message": str(error)}]
    import_status = "verified" if source_import_capture_started and imported and not import_errors else (
        "partial" if source_import_capture_started or imported or import_errors else "unavailable")
    import_reason = None if import_status == "verified" else (
        "source_imports_contain_errors" if import_errors else "runtime_source_import_capture_not_completed")
    write_json("source-imports.json", {"schema": "qa356.source-imports.v1", "status": import_status,
        "reason": import_reason, "modules": imported, "errors": import_errors})
    identity_status = "verified" if process_identity_verified else (
        "partial" if identity_start is not None or identity_end is not None else "unavailable")
    write_json("process-identity.json", {"status": identity_status,
        "reason": None if identity_status == "verified" else "process_identity_start_or_end_unavailable",
        "before": identity_start, "after": identity_end,
        "privilege_fence_before": privilege_start_ok, "privilege_fence_after": privilege_end_ok})
    network_status = "verified" if network_proof_verified else (
        "partial" if network_start is not None or network_end is not None else "unavailable")
    write_json("external-network-proof.json", {"status": network_status,
        "reason": None if network_status == "verified" else "network_snapshot_start_or_end_unavailable",
        "namespace": (identity_end or identity_start or {}).get("net_namespace"),
        "before": network_start, "after": network_end})
    if pytest_status is None or "junit" not in result:
        junit_info = {"status": "HARNESS_ERROR/NOT_RUN", "reason": "pytest_not_completed_or_junit_unavailable"}
        write_not_run_junit(junit_info["reason"])
    result["junit"] = junit_info
    result["source_import_capture"] = {"status": import_status, "errors": import_errors}
    result["source_binding_verified"] = source_binding_ok
    result["process_identity_status"] = identity_status
    result["network_proof_status"] = network_status
    result["privilege_fence"] = {"before": privilege_start_ok, "after": privilege_end_ok}
    result["selectors_expected_cases"] = 9
    result["pass_criteria"] = {
        "pytest_exit_zero": pytest_status == 0,
        "exactly_seven_selectors": len(selectors) == 7,
        "exactly_nine_cases": junit_info.get("cases") == 9,
        "zero_skipped": junit_info.get("skipped") == 0 and result.get("skipped_reports") == 0,
        "zero_xfail": result.get("xfailed_or_xpassed") == 0,
        "zero_failures_or_errors": junit_info.get("failures") == 0 and junit_info.get("errors") == 0,
        "nine_actual_passes": result.get("passed_call_reports") == 9,
        "source_binding_verified": source_binding_ok,
        "all_loaded_unchain_modules_from_core_source": not import_errors and bool(imported),
        "process_identity_verified": identity_status == "verified",
        "loopback_only_verified": network_status == "verified",
        "privileges_dropped": privilege_start_ok and privilege_end_ok,
    }
    if result["status"] == "passed" and not all(result["pass_criteria"].values()):
        result["status"] = "failed"
        result["exit_code"] = pytest_status if pytest_status not in (None, 0) else 3
    write_json("qualification-result.json", result)

raise SystemExit(result.get("exit_code", 3))
PY

exit "$status"
