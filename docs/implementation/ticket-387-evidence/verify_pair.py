"""Qualify two cold Flask hosts against one installed wheel; never call providers."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
WHEEL = Path(sys.argv[1]).resolve()
MODELS = {
    "openai": ["gpt-6.1-sol", "gpt-6.1-terra"],
    "anthropic": ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"],
}

child = r'''
import json, sys
from pathlib import Path
import unchain
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
from unchain.runtime.payloads import load_model_capabilities, load_default_payloads
sys.path.insert(0, sys.argv[1])
from context_memory_v2_capability import _normalized_runtime_protocol_manifest
from app import create_app
from werkzeug.serving import make_server
manifest = runtime_protocol_manifest()
assert _normalized_runtime_protocol_manifest(manifest) == manifest
server = make_server("127.0.0.1", 0, create_app())
print(json.dumps({"port": server.server_port, "runtime_module": unchain.__file__,
                  "manifest": manifest, "capabilities": load_model_capabilities(),
                  "defaults": load_default_payloads()}), flush=True)
server.serve_forever()
'''

rounds = []
with tempfile.TemporaryDirectory(prefix="ticket-387-host-") as state_dir:
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    env.update({"UNCHAIN_SOURCE_PATH": str(ROOT / ".venv/lib/python3.12/site-packages"),
                "UNCHAIN_PROVIDER": "openai", "UNCHAIN_MODEL": "gpt-6.1-sol",
                "UNCHAIN_DATA_DIR": state_dir, "PUPU_FEATURE_COMPUTER_USE": "1",
                "PUPU_COMPUTER_USE": "1"})
    for restart in range(2):
        with (EVIDENCE / f"cold-host-{restart}.log").open("w") as log:
            process = subprocess.Popen(
                [sys.executable, "-u", "-c", child, str(ROOT / "unchain_runtime/server")],
                cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=log, text=True,
            )
            try:
                identity = json.loads(process.stdout.readline())
                assert "site-packages/unchain/" in identity["runtime_module"]
                with urllib.request.urlopen(f"http://127.0.0.1:{identity['port']}/models/catalog", timeout=15) as response:
                    catalog = json.load(response)
                assert set(catalog) == {"active", "providers", "embedding_providers", "model_capabilities"}
                for provider, models in MODELS.items():
                    for model in models:
                        assert model in catalog["providers"][provider]
                        cap = catalog["model_capabilities"][f"{provider}:{model}"]
                        assert cap["computer_use"]["supported"] is False
                        assert cap["reasoning_efforts"] == identity["capabilities"][model]["reasoning_efforts"]
                # Verify the actual installed resources exactly equal the candidate source;
                # an editable or wrong wheel cannot pass merely by reporting its version.
                companion = ROOT.parent / "unchain-387/src/unchain/runtime/resources"
                for key, filename in (("capabilities", "model_capabilities.json"),
                                      ("defaults", "model_default_payloads.json")):
                    assert identity[key] == json.loads((companion / filename).read_text())
                identity.pop("port")
                identity.pop("capabilities")
                identity.pop("defaults")
                identity["catalog_sha256"] = hashlib.sha256(json.dumps(catalog, sort_keys=True).encode()).hexdigest()
                rounds.append(identity)
            finally:
                process.terminate()
                process.wait(timeout=15)
assert rounds[0] == rounds[1]
result = {
    "wheel_path": str(WHEEL), "wheel_sha256": hashlib.sha256(WHEEL.read_bytes()).hexdigest(),
    "cold_hosts": rounds, "provider_calls": 0,
    "result": "PASS", "scope": "installed resources, real host HTTP catalog and strict imported runtime manifest",
}
(EVIDENCE / "pair-identity.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps({"result": "PASS", "wheel_sha256": result["wheel_sha256"],
                  "manifest_digest": rounds[0]["manifest"]["manifest_digest"], "cold_hosts": len(rounds)}))
