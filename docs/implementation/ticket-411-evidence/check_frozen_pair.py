"""Development smoke of the fixed wheel frozen into PuPu's real sidecar entry."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
pair = json.loads((EVIDENCE / "pair.json").read_text())
binary = ROOT / ".release-qa/ticket-411/frozen/unchain-411-dev"
assert hashlib.sha256(Path(pair["wheel"]["path"]).read_bytes()).hexdigest() == pair["wheel"]["sha256"]
boots = []
with tempfile.TemporaryDirectory(prefix="pupu-411-frozen-") as data:
    for ordinal in (1, 2):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        token = uuid.uuid4().hex
        environment = {key: value for key, value in os.environ.items() if not key.endswith("API_KEY")}
        environment.update(
            UNCHAIN_SOURCE_PATH="", PYTHONPATH="", UNCHAIN_HOST="127.0.0.1",
            UNCHAIN_PORT=str(port), UNCHAIN_AUTH_TOKEN=token, UNCHAIN_DATA_DIR=data,
            PUPU_FEATURE_MEMORY_V2="all", PUPU_MEMORY_V2_MODE="all",
        )
        log = Path(data) / f"boot-{ordinal}.log"
        with log.open("w") as output:
            child = subprocess.Popen([str(binary)], cwd=data, env=environment, stdout=output, stderr=subprocess.STDOUT)
            try:
                def fetch(path):
                    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers={"x-unchain-auth": token})
                    with urllib.request.urlopen(request, timeout=10) as response:
                        return json.load(response)

                deadline = time.monotonic() + 40
                while True:
                    if child.poll() is not None:
                        raise RuntimeError(log.read_text()[-6000:])
                    try:
                        health = fetch("/health")
                        break
                    except Exception:
                        if time.monotonic() > deadline:
                            raise RuntimeError(log.read_text()[-6000:])
                        time.sleep(0.2)
                capability = health["context_memory_v2"]
                assert capability["runtime_protocol_ready"], capability
                assert capability["runtime_protocol_manifest"] == pair["runtime_manifest"]
                assert "/src/unchain/" not in capability["unchain_runtime_source"]
                catalog = fetch("/models/catalog")
                assert "gemini-4-argon" in catalog["providers"]["gemini"]
                cap = catalog["model_capabilities"]["gemini:gemini-4-argon"]
                assert cap["reasoning_efforts"] == ["low", "medium", "high"]
                assert cap["default_reasoning_effort"] == "medium"
                assert cap["max_context_window_tokens"] == 1_048_576
                boots.append({
                    "cold_boot": ordinal, "catalog_present": True,
                    "runtime_manifest_digest": capability["runtime_protocol_manifest"]["manifest_digest"],
                    "runtime_import": capability["unchain_runtime_source"],
                })
            finally:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
report = {
    "schema": "pupu.ticket411.frozen-development-smoke.v1",
    "wheel_sha256": pair["wheel"]["sha256"],
    "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
    "cold_boots": boots,
    "qualification": "development smoke; signed Electron app and live provider not run",
}
(EVIDENCE / "frozen-smoke.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
