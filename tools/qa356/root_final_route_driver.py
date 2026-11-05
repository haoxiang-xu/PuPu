#!/usr/bin/env python3
"""Run the #356 root/child final-event assertion against baseline and candidate."""
import json
import os
import signal
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET


OUT = Path(os.environ["QA_OUT"])
SITE = Path(os.environ["UNCHAIN_SOURCE_PATH"]).resolve()
TARGET = os.environ["QA_PYTEST_TARGET"]
CONTROL = Path(os.environ["QA_CONTROL"]).resolve()
PYTHON = os.environ["QA_VENV_PYTHON"]
WHEEL = Path(os.environ["QA_WHEEL"])
WHEEL_SHA = os.environ["QA_WHEEL_SHA"]
MANIFEST = os.environ["QA_MANIFEST"]


def proc_identity(pid):
    base = Path("/proc") / str(pid)
    status = {}
    try:
        status_lines = (base / "status").read_text().splitlines()
        stat = (base / "stat").read_text()
        exe = str((base / "exe").resolve())
    except FileNotFoundError:
        return {"pid": pid, "unavailable": "process_exited_before_identity_capture"}
    for line in status_lines:
        if ":" in line:
            key, value = line.split(":", 1)
            if key in {"Uid", "Gid", "Groups", "NoNewPrivs", "CapEff", "CapPrm", "CapBnd", "CapInh", "CapAmb"}:
                status[key] = value.strip()
    start_ticks = int(stat[stat.rfind(")") + 2:].split()[19])
    return {"pid": pid, "exe": exe, "start_ticks": start_ticks, "status": status}


def junit_counts(path):
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    return {key: sum(int(suite.attrib.get(key, "0")) for suite in suites)
            for key in ("tests", "failures", "errors", "skipped")}


def run_checkout(label, checkout, expect_pass):
    out = OUT / label
    out.mkdir(parents=True, exist_ok=True)
    junit = out / "junit.xml"
    log = out / "pytest.log"
    env = {
        "PATH": f"{Path(PYTHON).parent}:/usr/bin:/bin",
        "HOME": os.environ["HOME"],
        "TMPDIR": os.environ["TMPDIR"],
        "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONNOUSERSITE": "1",
        "PYTHONPATH": f"{CONTROL}:{SITE}",
        "UNCHAIN_SOURCE_PATH": str(SITE),
        "QA_OUT": str(out),
        "QA_SITE": str(SITE),
        "QA_WHEEL": str(WHEEL),
        "QA_WHEEL_SHA": WHEEL_SHA,
        "QA_MANIFEST": MANIFEST,
    }
    argv = [PYTHON, "-B", "-m", "pytest", "-p", "no:cacheprovider",
            "-p", "qa356_runtime_probe",
            "--junitxml", str(junit), TARGET]
    timed_out = False
    with log.open("wb") as stream:
        child = subprocess.Popen(argv, cwd=Path(checkout) / "unchain_runtime/server",
                                 env=env, stdout=stream, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        identity_before = proc_identity(child.pid)
        try:
            exit_code = child.wait(timeout=300)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            time.sleep(2)
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            exit_code = child.wait(timeout=10)
    identity_after = {"pid": child.pid, "state": "exited", "proc_entry_present": (Path("/proc") / str(child.pid)).exists(), "returncode": exit_code}
    uid = os.environ["QA_EXPECT_UID"]
    gid = os.environ["QA_EXPECT_GID"]
    status = identity_before.get("status", {})
    identity_ok = (status.get("Uid", "").split() == [uid] * 4
                   and status.get("Gid", "").split() == [gid] * 4
                   and status.get("Groups", "") == ""
                   and status.get("NoNewPrivs") == "1"
                   and all(status.get(key) == "0000000000000000" for key in
                           ("CapEff", "CapPrm", "CapBnd", "CapInh", "CapAmb")))
    junit_error = None
    try:
        counts = junit_counts(junit)
    except (OSError, ET.ParseError) as exc:
        counts = {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
        junit_error = f"{type(exc).__name__}: {exc}"
    imports_path = out / "imported-runtime.json"
    imports = json.loads(imports_path.read_text()) if imports_path.exists() else None
    imports_ok = bool(imports and imports.get("wheel_sha256") == WHEEL_SHA
                      and imports.get("manifest") == MANIFEST
                      and imports.get("modules") and not imports.get("errors"))
    expected = ((exit_code == 1 and counts == {"tests": 1, "failures": 1, "errors": 0, "skipped": 0})
                if not expect_pass else
                (exit_code == 0 and counts == {"tests": 1, "failures": 0, "errors": 0, "skipped": 0}))
    cases = []
    failure = None
    content = ""
    if junit_error is None:
        root = ET.parse(junit).getroot()
        cases = [case for case in root.iter("testcase")
                 if case.attrib.get("name") == "test_public_child_request_keeps_original_session_and_source"
                 and case.attrib.get("classname", "").endswith("test_skeleton_production_routes")]
        failure = cases[0].find("failure") if len(cases) == 1 else None
        content = log.read_text(errors="replace")
    exact_testcase = len(cases) == 1
    if expect_pass:
        expected = expected and exact_testcase and failure is None
    elif junit_error is None:
        failure_text = (failure.text or "") if failure is not None else ""
        expected = (expected and "assert 2 == 1" in content
                    and "len(_finals(resumed))" in content
                    and failure is not None
                    and "assert 2 == 1" in failure_text
                    and "len(_finals(resumed))" in failure_text)
    record = {"label": label, "checkout": str(checkout), "exit_code": exit_code,
              "expected_result": "pass" if expect_pass else "single_assertion_failure",
              "counts": counts, "identity_before": identity_before,
              "identity_after": identity_after, "identity_accepted": identity_ok,
              "imports_receipt": imports, "imports_accepted": imports_ok,
              "timed_out": timed_out, "junit_error": junit_error,
              "matched_testcase_count": len(cases),
              "accepted": bool(expected and not timed_out and identity_ok and imports_ok and not identity_after["proc_entry_present"])}
    (out / "process-identity.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


def main():
    records = [
        run_checkout("baseline", os.environ["QA_BASELINE"], False),
        run_checkout("candidate", os.environ["QA_CANDIDATE"], True),
    ]
    result = {"schema": "qa356.root-final-one-selector.v1", "classification": "DIAGNOSTIC_ONLY_NOT_RELEASE_QUALIFICATION",
              "status": "PASS" if all(r["accepted"] for r in records) else "FAIL",
              "selector": TARGET, "wheel_sha256": WHEEL_SHA, "manifest": MANIFEST,
              "baseline_sha": os.environ["QA_BASELINE_SHA"], "candidate_sha": os.environ["QA_CANDIDATE_SHA"],
              "runs": records}
    (OUT / "qualification-result.json").write_text(json.dumps(result, indent=2) + "\n")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
