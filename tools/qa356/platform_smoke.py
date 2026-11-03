"""Native unsigned-package/bundled-worker smoke, with qualified process egress controls.

No Main, GUI, model, tool or real-provider operation is started. Build/setup
networking precedes these controls; the product probes are loopback only.
"""
from contextlib import contextmanager
from hashlib import sha256
import base64
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid


def run_supported_platform_smoke():
    out = Path("test-results/platform").resolve()
    package = json.loads((out / "package.json").read_text())
    binary, bundled = Path(package["binary"]), Path(package["python"])
    assert sha256(binary.read_bytes()).hexdigest() == package["binary_sha256"]
    assert sha256(bundled.read_bytes()).hexdigest() == package["python_sha256"]
    assert package["wheel_sha256"] == os.environ["QA_WHEEL_SHA"]
    resources = Path(package["resources"]) / "mcp_runtime"
    before = {str(p.relative_to(resources)): sha256(p.read_bytes()).hexdigest()
        for p in resources.rglob("*") if p.is_file()}
    work = out / "smoke"
    work.mkdir()
    (work / "home").mkdir(); (work / "tmp").mkdir()
    port = 15879
    guard_results = []
    requests = []
    rules = []
    policy = work / "network.sb"
    if sys.platform == "darwin":
        policy.write_text('(version 1)\n(allow default)\n(deny network*)\n(deny file-write*)\n'
            '(allow file-write* (subpath ' + json.dumps(str(out)) + ') (literal "/dev/null"))\n'
            '(allow network-bind network-inbound (local ip "localhost:15879"))\n'
            '(allow network-outbound (remote ip "localhost:15879"))\n')

    def powershell(source):
        encoded = base64.b64encode(source.encode("utf-16le")).decode()
        return subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
            check=True, capture_output=True, text=True, timeout=30)

    def guarded(argv):
        return ["/usr/bin/sandbox-exec", "-f", str(policy), *argv] if sys.platform == "darwin" else argv

    env = {key: value for key, value in os.environ.items() if key in {
        "PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "SYSTEMDRIVE"}}
    env.update(HOME=str(work / "home"), USERPROFILE=str(work / "home"),
        TMPDIR=str(work / "tmp"), TEMP=str(work / "tmp"), TMP=str(work / "tmp"),
        UNCHAIN_DATA_DIR=str(work / "home/data"), UNCHAIN_HOST="127.0.0.1", UNCHAIN_PORT=str(port),
        UNCHAIN_AUTH_TOKEN="sentinel-native-profile-smoke", PYTHONDONTWRITEBYTECODE="1",
        PUPU_MCP_RUNTIME_DIR=str(resources))
    child = None
    try:
        if sys.platform == "win32":
            for program in sorted({str(Path(sys.executable).resolve()), str(bundled.resolve()), str(binary.resolve())}):
                name = "qa356-" + uuid.uuid4().hex
                quoted = program.replace("'", "''")
                powershell("$ErrorActionPreference='Stop';New-NetFirewallRule -DisplayName '" + name
                    + "' -Direction Outbound -Action Block -Program '" + quoted
                    + "' -Profile Any -Enabled True -RemoteAddress @('0.0.0.0-127.0.0.0','127.0.0.2-255.255.255.255','::/0') | ConvertTo-Json -Depth 3")
                rules.append(name)
            (out / "firewall-rules.json").write_text(powershell(
                "Get-NetFirewallRule | Where-Object {$_.DisplayName -like 'qa356-*'} | ConvertTo-Json -Depth 3").stdout)
        elif sys.platform != "darwin":
            raise AssertionError("undeclared native platform")

        # Qualify on controlled loopback listeners only, before product launch.
        # A broken guard can reach only this fixture, never an external service.
        for address, listen_port, expected in [("127.0.0.1", port, "allowed"),
                ("127.0.0.2" if sys.platform == "win32" else "127.0.0.1", port + 1, "blocked")]:
            listener = socket.socket()
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((address, listen_port)); listener.listen(); listener.settimeout(4)
            observed = []
            def serve():
                try:
                    connection, _ = listener.accept()
                    observed.append(True)
                    connection.sendall(b"ok"); connection.close()
                except OSError:
                    pass
            thread = threading.Thread(target=serve); thread.start()
            code = ("import socket;\ntry:\n s=socket.create_connection((" + repr(address) + ","
                + str(listen_port) + "),timeout=2);print(s.recv(2).decode());s.close()\nexcept OSError:\n print('blocked')")
            result = subprocess.run(guarded([sys.executable, "-I", "-B", "-c", code]),
                env=env, capture_output=True, text=True, timeout=8)
            listener.close(); thread.join(timeout=5)
            assert result.returncode == 0
            assert result.stdout.strip() == ("ok" if expected == "allowed" else "blocked")
            assert bool(observed) == (expected == "allowed")
            guard_results.append({"address": address, "port": listen_port, "expected": expected,
                "stdout": result.stdout, "fixture_received_connection": bool(observed)})
        (out / "network-controls.json").write_text(json.dumps(guard_results, indent=2) + "\n")

        for mode in ("bundled", "missing"):
            local_env = {**env, "PUPU_MCP_RUNTIME_DIR": str(resources if mode == "bundled" else work / "absent-runtime")}
            with (out / ("sidecar-" + mode + ".log")).open("wb") as log:
                child = subprocess.Popen(guarded([str(binary)]), cwd=work, env=local_env,
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=sys.platform != "win32")
                try:
                    def request(method, route, authenticated=True):
                        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                        headers = {"x-unchain-auth": env["UNCHAIN_AUTH_TOKEN"]} if authenticated else {}
                        connection.request(method, route, "{}" if method == "POST" else None, headers)
                        response = connection.getresponse(); raw = response.read(); connection.close()
                        value = json.loads(raw)
                        requests.append({"mode": mode, "method": method, "path": route,
                            "authenticated": authenticated, "status": response.status, "body": value,
                            "body_sha256": sha256(raw).hexdigest()})
                        return response.status, value
                    deadline = time.monotonic() + 60
                    while True:
                        assert child.poll() is None, (mode, child.returncode)
                        try:
                            status, health = request("GET", "/health")
                            break
                        except (OSError, http.client.HTTPException):
                            if time.monotonic() >= deadline: raise
                            time.sleep(.2)
                    assert status == 200
                    assert health["context_memory_v2"]["runtime_protocol_manifest"]["manifest_digest"] == os.environ["QA_MANIFEST"]
                    assert request("GET", "/skeleton_python_profiles", False)[0] == 401
                    status, profiles = request("GET", "/skeleton_python_profiles")
                    assert status == 200
                    builtin = next(row for row in profiles["profiles"] if row["id"] == "builtin")
                    status, probe = request("POST", "/skeleton_python_profiles/builtin/probe")
                    if mode == "bundled":
                        assert builtin["available"] is True and builtin["kind"] == "bundled"
                        assert Path(builtin["executable"]).resolve() == bundled.resolve()
                        assert status == 200, probe
                    else:
                        assert builtin["available"] is False and builtin["executable"] is None
                        assert status == 409 and probe["error"]["code"] == "profile_unavailable"
                finally:
                    if child.poll() is None:
                        if sys.platform == "win32":
                            subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], capture_output=True, timeout=10)
                        else: os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=15); child = None

        # The real public Code runtime uses the physically packaged interpreter.
        worker_env = {**env, "PYTHONPATH": str(Path(__file__).resolve().parent),
            "QA_OUT": str(out), "PUPU_BUNDLED_PYTHON": str(bundled),
            "QA_WHEEL": os.environ["QA_WHEEL"], "QA_SITE": os.environ["QA_SITE"]}
        result = subprocess.run(guarded([sys.executable, "-B", str(Path(__file__).with_name("platform_worker.py"))]),
            cwd=work, env=worker_env, capture_output=True, text=True, timeout=45)
        (out / "worker.log").write_text(result.stdout + result.stderr)
        assert result.returncode == 0, result.stderr
        after = {str(p.relative_to(resources)): sha256(p.read_bytes()).hexdigest()
            for p in resources.rglob("*") if p.is_file()}
        assert before == after, "packaged_runtime_was_modified"
        (out / "result.json").write_text(json.dumps({"verdict": "NATIVE_PACKAGE_SMOKE_ACCEPTED", "package": package,
            "runtime_resource_files": len(before), "runtime_resources_unchanged": True,
            "network_controls": guard_results, "requests": requests, "real_provider_calls": 0,
            "Main_started": False, "GUI": "NOT_RUN", "signing_installation_rollout": "NOT_RUN"}, indent=2) + "\n")
    finally:
        (out / "requests.json").write_text(json.dumps(requests, indent=2) + "\n")
        if child is not None and child.poll() is None:
            if sys.platform == "win32": subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], capture_output=True, timeout=10)
            else: os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=10)
        for name in rules:
            powershell("Remove-NetFirewallRule -DisplayName '" + name + "'")


if __name__ == "__main__":
    run_supported_platform_smoke()
