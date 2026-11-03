"""Record the exact failing native QA rule; no product or network probe runs."""
import base64
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import uuid


def diagnose_windows_guard():
    assert sys.platform == "win32"
    out = Path("test-results/windows-guard.json")
    out.parent.mkdir(exist_ok=True)
    evidence = {"product_started": False, "external_probes": 0, "commands": []}
    names = []

    def record_powershell(source):
        encoded = base64.b64encode(source.encode("utf-16le")).decode()
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive",
            "-EncodedCommand", encoded], capture_output=True, text=True, timeout=35)
        row = {"source": source, "exit": result.returncode,
               "stdout": result.stdout, "stderr": result.stderr}
        evidence["commands"].append(row)
        out.write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps(row))
        return result

    try:
        record_powershell("$ErrorActionPreference='Stop';Get-Service MpsSvc,BFE | Select-Object Name,Status | ConvertTo-Json;"
            "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())"
            ".IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
        quoted = str(Path(sys.executable).resolve()).replace("'", "''")
        addresses_reply = record_powershell("$ErrorActionPreference='Stop';Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.AddressState -eq 'Preferred' -and $_.IPAddress -notlike '127.*'} | Select-Object -ExpandProperty IPAddress | ConvertTo-Json")
        local_addresses = json.loads(addresses_reply.stdout)
        if isinstance(local_addresses, str):
            local_addresses = [local_addresses]
        assert local_addresses, 'no_non_loopback_local_address'
        record_powershell("Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json")
        cases = ["@('0.0.0.0-127.0.0.0')", "@('127.0.0.2-255.255.255.255')",
                 "@('::/0')", "@('0.0.0.0/1','128.0.0.0/1')", "@('::/1','8000::/1')", "@('Any')"]
        for addresses in cases:
            name = "qa356-" + uuid.uuid4().hex
            names.append(name)
            result = record_powershell("$ErrorActionPreference='Stop';New-NetFirewallRule -DisplayName '" + name
                + "' -Direction Outbound -Action Block -Program '" + quoted
                + "' -Profile Any -Enabled True -RemoteAddress " + addresses + " | Select-Object Name,Enabled | ConvertTo-Json")
            if result.returncode == 0 and addresses == "@('Any')":
                evidence["loopback_under_block_any"] = []
                for address in ("127.0.0.1", "127.0.0.2", *local_addresses):
                    listener = socket.socket()
                    listener.bind((address, 0)); listener.listen(); listener.settimeout(4)
                    port = listener.getsockname()[1]
                    received = []
                    def serve():
                        try:
                            connection, _ = listener.accept()
                            received.append(True); connection.sendall(b"ok"); connection.close()
                        except OSError:
                            pass
                    thread = threading.Thread(target=serve); thread.start()
                    code = ("import socket\ntry:\n s=socket.create_connection((" + repr(address) + ","
                        + str(port) + "),timeout=2);print(s.recv(2).decode());s.close()\nexcept OSError:\n print('blocked')")
                    child = subprocess.run([sys.executable, "-I", "-B", "-c", code],
                        capture_output=True, text=True, timeout=8)
                    listener.close(); thread.join(timeout=5)
                    evidence["loopback_under_block_any"].append({"address": address, "exit": child.returncode,
                        "stdout": child.stdout, "stderr": child.stderr, "fixture_received": bool(received)})
            record_powershell("$ErrorActionPreference='Stop';Remove-NetFirewallRule -DisplayName '" + name + "' -ErrorAction SilentlyContinue")
    finally:
        for name in names:
            record_powershell("$ErrorActionPreference='Stop';Get-NetFirewallRule -DisplayName '" + name
                + "' -ErrorAction SilentlyContinue | Remove-NetFirewallRule")
        out.write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    diagnose_windows_guard()
