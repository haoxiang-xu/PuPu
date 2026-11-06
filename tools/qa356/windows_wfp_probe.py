"""QA-only Windows WFP qualification; owned-local endpoints only."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import uuid

PORT = 15879
DENY_PORT = 15880
CASES = [("127.0.0.1", PORT, False), ("127.0.0.1", DENY_PORT, False),
         ("127.0.0.2", PORT, False), ("::1", PORT, False),
         (None, PORT, False), ("127.0.0.1", PORT, True)]


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical(path):
    return str(Path(path).resolve(strict=True))


def live_receiver(address, port, udp):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    receiver = socket.socket(family, socket.SOCK_DGRAM if udp else socket.SOCK_STREAM)
    receiver.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    receiver.bind((address, port))
    if not udp:
        receiver.listen(8)
    bound = receiver.getsockname()
    receiver.settimeout(0.2)
    ready = threading.Event()
    stop = threading.Event()
    received = []
    errors = []

    def serve():
        ready.set()
        while not stop.is_set():
            try:
                if udp:
                    data, _ = receiver.recvfrom(256)
                    received.append(data.decode("ascii", "replace"))
                else:
                    conn, _ = receiver.accept()
                    with conn:
                        conn.settimeout(1.5)
                        conn.sendall(b"local-fixture")
                        received.append(conn.recv(256).decode("ascii", "replace"))
            except socket.timeout:
                continue
            except OSError as error:
                if not stop.is_set():
                    errors.append(repr(error))
                break
        receiver.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    if not ready.wait(2):
        stop.set()
        raise RuntimeError("owned receiver did not signal ready")
    return {"socket": receiver, "thread": thread, "ready": ready, "stop": stop,
            "received": received, "errors": errors, "bound": list(bound),
            "started_monotonic": time.monotonic()}


def stop_receiver(receiver, observe_seconds=0.35):
    time.sleep(observe_seconds)
    receiver["stop"].set()
    receiver["thread"].join(timeout=2)
    if receiver["thread"].is_alive():
        receiver["socket"].close()
        receiver["thread"].join(timeout=1)
    return {"ready": receiver["ready"].is_set(), "bound": receiver["bound"],
            "errors": list(receiver["errors"]), "received": list(receiver["received"]),
            "stopped": not receiver["thread"].is_alive(),
            "lifetime_seconds": round(time.monotonic() - receiver["started_monotonic"], 3)}


def child_command(interpreter, address, port, udp):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    sock_type = socket.SOCK_DGRAM if udp else socket.SOCK_STREAM
    return ("import socket\n"
            f"s=socket.socket({family},{sock_type})\n"
            "s.settimeout(2)\n"
            "try:\n"
            + (f" s.sendto(b'probe',{(address, port)!r}); print('sent')\n" if udp else
               f" s.connect(({address!r},{port})); s.sendall(b'probe'); print(s.recv(256).decode()); s.close()\n")
            + "except OSError as e: print('blocked:'+str(getattr(e,'winerror',None) or e.errno))\n"
            + "finally: s.close()\n")


def validate_receipt(path, images, root_image):
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data.get("schema") == "qa356.wfp-guard-receipt.v2" and data.get("complete") is True, data
    assert data["setup_error"] == 0 and data["cleanup_error"] == 0, data
    assert data["policy"] == {"permit": {"protocol": "TCP", "remote_ipv4": "127.0.0.1", "remote_port": PORT},
                              "deny": ["all-other-IPv4-connect", "all-IPv6-connect"]}
    assert data["policy_committed"] and data["job_assigned"] and data["target_created_suspended"] and data["target_resumed"]
    assert data["family_drained"] and data["engine_close_called"] and data["engine_close_status"] == 0
    assert [row["path"].casefold() for row in data["images"]] == [p.casefold() for p in images]
    assert data["program_count"] == 3 and data["child_exit"] == 0 and data["child_pid"] > 0
    assert any(row["path"].casefold() == root_image.casefold() for row in data["images"])
    assert len(data["filter_ids"]) == 9 and len(set(data["filter_ids"])) == 9
    assert len(data["filter_readbacks"]) == 9
    assert {r["id"] for r in data["filter_readbacks"]} == set(data["filter_ids"])
    assert data["child_pid"] > 0
    roles = {(r["image_index"], r["role"]) for r in data["filter_readbacks"]}
    assert roles == {(i, role) for i in range(3) for role in ("permit", "deny_v4", "deny_v6")}
    for row in data["filter_readbacks"]:
        image = data["images"][row["image_index"]]
        assert row["app_id_hex"] == image["app_id_hex"] and row["id"] in data["filter_ids"]
        if row["role"] == "permit":
            assert row["layer"] == "ALE_AUTH_CONNECT_V4" and row["action"] == "permit"
            assert row["weight"] == 10 and row["protocol"] == 6
            assert row["remote_ipv4_host_order"] == 0x7F000001 and row["remote_port"] == PORT
        else:
            assert row["action"] == "block" and row["weight"] == 1
            assert row["layer"] == ("ALE_AUTH_CONNECT_V4" if row["role"] == "deny_v4" else "ALE_AUTH_CONNECT_V6")
    return data


def run_case(interpreter, address, port, udp, guarded, guard_exe, images,
             result_dir, image_role, case_index):
    receiver = live_receiver(address, port, udp)
    assert receiver["ready"], "fixture readiness was not established before connect"
    mode = "udp" if udp else "tcp"
    command = child_command(interpreter, address, port, udp)
    receipt_path = result_dir / f"matrix-{image_role}-{case_index:02d}.json"
    child_args = [interpreter, "-I", "-B", "-c", command]
    args = child_args
    if guarded:
        args = [guard_exe, str(receipt_path), "3", *images, interpreter,
                subprocess.list2cmdline(child_args)]
    try:
        run = subprocess.run(args, capture_output=True, text=True,
                             timeout=15 if not guarded else None)
        evidence = stop_receiver(receiver)
    except BaseException:
        stop_receiver(receiver)
        raise
    unrestricted_expected = "sent" if udp else "local-fixture"
    allowed = (not udp and address == "127.0.0.1" and port == PORT)
    expected = (("local-fixture" if allowed else ("not-delivered" if udp else "blocked"))
                if guarded else unrestricted_expected)
    row = {"image_role": image_role, "image": canonical(interpreter), "mode": mode,
           "address": address, "port": port, "guarded": guarded, "expected": expected,
           "exit": run.returncode, "stdout": run.stdout.strip(), "stderr": run.stderr,
           "receiver": evidence, "receipt_path": str(receipt_path) if guarded else None}
    assert evidence["ready"] and evidence["stopped"] and not evidence["errors"], row
    assert evidence["bound"][0] == address and evidence["bound"][1] == port, row
    assert run.returncode == 0, row
    if expected == "blocked":
        assert run.stdout.startswith("blocked:") and not evidence["received"], row
    elif expected == "not-delivered":
        # sendto may succeed locally even when WFP drops the datagram.
        assert not evidence["received"], row
    else:
        assert run.stdout.strip() == expected and evidence["received"] == ["probe"], row
    if guarded:
        row["receipt"] = validate_receipt(receipt_path, images, canonical(interpreter))
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--guard", required=True)
    parser.add_argument("--packaged-python", required=True)
    parser.add_argument("--packaged-python-sha256", required=True)
    parser.add_argument("--sidecar", required=True)
    parser.add_argument("--sidecar-sha256", required=True)
    parser.add_argument("--nic-ipv4", required=True, help="concrete same-host NIC IPv4")
    parser.add_argument("--results", default="test-results/windows-wfp")
    args = parser.parse_args()
    if sys.platform != "win32":
        raise SystemExit("NOT_RUN: Windows-only qualification")

    base = Path(args.results).resolve()
    base.mkdir(parents=True, exist_ok=True)
    result_dir = base / ("run-" + uuid.uuid4().hex)
    result_dir.mkdir(exist_ok=False)
    evidence = {"schema": "qa356.windows-wfp-qualification.v2", "verdict": "NOT_RUN",
                "images": [], "matrix": [], "family_control": None,
                "invalid_image_control": None, "product_started": False,
                "external_endpoint_count": 0}
    try:
        guard = canonical(args.guard)
        system_python = canonical(sys.executable)
        packaged_python = canonical(args.packaged_python)
        sidecar = canonical(args.sidecar)
        images = [system_python, packaged_python, sidecar]
        if len({p.casefold() for p in images}) != 3:
            raise RuntimeError("system Python, packaged Python and sidecar must be distinct images")
        nic = ipaddress.IPv4Address(args.nic_ipv4)
        if nic.is_loopback or nic.is_unspecified or nic.is_multicast or nic.is_reserved:
            raise RuntimeError("--nic-ipv4 must be a concrete unicast same-host NIC address")
        expected = {packaged_python: args.packaged_python_sha256.lower(),
                    sidecar: args.sidecar_sha256.lower()}
        hashes = {p: digest(p) for p in images}
        for path, wanted in expected.items():
            if len(wanted) != 64 or hashes[path] != wanted:
                raise RuntimeError(f"immutable image SHA256 mismatch: {path}")
        evidence["run_directory"] = str(result_dir)
        evidence["nic_ipv4"] = str(nic)
        evidence["images"] = [{"role": role, "path": path, "sha256_before": hashes[path]}
                               for role, path in zip(("system_python", "packaged_python", "sidecar"), images)]
        matrix_receipts = []
        for role, interpreter in (("system_python", system_python), ("packaged_python", packaged_python)):
            for index, (address, port, udp) in enumerate(CASES):
                if address is None:
                    address = str(nic)
                row = run_case(interpreter, address, port, udp, False, guard, images,
                               result_dir, role, index)
                row["phase"] = "baseline"
                evidence["matrix"].append(row)
                guarded = run_case(interpreter, address, port, udp, True, guard, images,
                                   result_dir, role, index)
                guarded["phase"] = "guarded"
                evidence["matrix"].append(guarded)
                matrix_receipts.append(guarded["receipt_path"])
            post = run_case(interpreter, "127.0.0.1", DENY_PORT, False, False, guard,
                            images, result_dir, role, 99)
            post["phase"] = "post-close"
            evidence["matrix"].append(post)
        if len(matrix_receipts) != 12 or len(set(matrix_receipts)) != 12:
            raise RuntimeError("current matrix must have exactly twelve unique guarded receipts")
        if set(Path(p) for p in matrix_receipts) != set(result_dir.glob("matrix-*.json")):
            raise RuntimeError("stale or missing matrix receipt inventory")
        guarded_rows = [row for row in evidence["matrix"] if row["phase"] == "guarded"]
        for row in guarded_rows:
            if len(row["receipt"]["filter_readbacks"]) != 9:
                raise RuntimeError("guard receipt missing exact per-image filter readbacks")
        # The sidecar is never run as a Python CLI; its exact AppID and committed
        # filter readbacks are verified from all twelve current receipts.
        sidecar_ids = {r["app_id_hex"] for row in guarded_rows
                       for r in row["receipt"]["filter_readbacks"] if r["image_index"] == 2}
        if len(sidecar_ids) != 1 or not next(iter(sidecar_ids)):
            raise RuntimeError("sidecar AppID missing or inconsistent")

        # Fresh argv-bound markers prove this run's same-image child was ready
        # and alive after root exit; Job accounting then proves drain.
        ready = result_dir / "child-ready.pid"
        audit = result_dir / "family-audit.json"
        child_code = "import os,sys,time; open(sys.argv[1],'w').write(str(os.getpid())); time.sleep(120)"
        root_code = ("import json,os,subprocess,sys,time; p=subprocess.Popen([sys.executable,'-I','-B','-c'," +
                     repr(child_code) + ",sys.argv[1]]); deadline=time.time()+10; "
                     "exec('while not os.path.exists(sys.argv[1]) and time.time()<deadline: time.sleep(.05)'); "
                     "child=int(open(sys.argv[1]).read()); assert child==p.pid; "
                     "open(sys.argv[2],'w').write(json.dumps({'root_pid':os.getpid(),'child_pid':p.pid,'ready_pid':child})); sys.exit(0)")
        family_receipt = result_dir / "family-drain.json"
        family_args = [guard, str(family_receipt), "3", *images, system_python,
                       subprocess.list2cmdline([system_python, "-I", "-B", "-c", root_code,
                                                str(ready), str(audit)])]
        family_run = subprocess.run(family_args, capture_output=True, text=True)
        family_receipt_text = (family_receipt.read_text(encoding="utf-8", errors="replace")
                               if family_receipt.exists() else None)
        evidence["family_control_attempt"] = {
            "argv": family_args,
            "root_source": root_code,
            "child_source": child_code,
            "guard_exit": family_run.returncode,
            "stdout": family_run.stdout,
            "stderr": family_run.stderr,
            "receipt_path": str(family_receipt),
            "receipt_exists": family_receipt.exists(),
            "receipt_text": family_receipt_text,
            "child_ready_marker_exists": ready.exists(),
            "family_audit_exists": audit.exists(),
        }
        family = validate_receipt(family_receipt, images, system_python)
        audit_data = json.loads(audit.read_text(encoding="utf-8"))
        if (family_run.returncode != 0 or audit_data["child_pid"] != audit_data["ready_pid"] or
                audit_data["root_pid"] == audit_data["child_pid"] or family["active_before_terminate"] < 1 or
                not family["terminate_called"] or family["terminate_status"] != 0):
            raise RuntimeError("child-family drain control did not prove live child and successful termination")
        if not (family["committed_tick_ms"] <= family["resumed_tick_ms"] <= family["root_exited_tick_ms"] <=
                family["terminate_tick_ms"] <= family["drained_tick_ms"]):
            raise RuntimeError("family lifecycle timestamps out of order")
        evidence["family_control"] = {"receipt": family, "audit": audit_data,
                                       "guard_exit": family_run.returncode}

        marker = result_dir / "invalid-image-must-not-start"
        invalid_receipt = result_dir / "invalid-image.json"
        bad_code = "import sys; open(sys.argv[1],'w').write('started')"
        bad_command = subprocess.list2cmdline([system_python, "-I", "-B", "-c", bad_code, str(marker)])
        bad = subprocess.run([guard, str(invalid_receipt), "3", images[0],
                              str(result_dir / "missing-image.exe"), images[2], system_python,
                              bad_command], capture_output=True, text=True)
        invalid = json.loads(invalid_receipt.read_text(encoding="utf-8"))
        if (bad.returncode == 0 or invalid.get("complete") is not True or invalid["policy_committed"] or
                invalid["target_created_suspended"] or marker.exists()):
            raise RuntimeError("invalid-image setup started target or lacks a complete nonpass receipt")
        evidence["invalid_image_control"] = {"receipt": invalid, "guard_exit": bad.returncode,
                                             "target_marker_absent": True}
        for path, old in hashes.items():
            if digest(path) != old:
                raise RuntimeError(f"image changed during qualification: {path}")
        evidence["images"] = [{**row, "sha256_after": digest(row["path"])} for row in evidence["images"]]
        evidence["verdict"] = "WFP_GUARD_QUALIFIED"
    except Exception as error:
        evidence["verdict"] = "FAIL"
        evidence["failure"] = repr(error)
        raise
    finally:
        (result_dir / "qualification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
