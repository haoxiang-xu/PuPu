"""Installed SDK qualification, confined to a disposable Linux network namespace."""
import errno
import hashlib
import importlib.util
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys

import httpx
from openai import BadRequestError, OpenAI

spec = importlib.util.spec_from_file_location("qa357_fixture", Path(__file__).with_name("execution_fixture.py"))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
SENTINEL = fixture.SENTINEL
validate_scenario = fixture.validate_scenario


def qualify():
    assert sys.platform == "linux" and os.environ.get("QA357_NETNS") == "1"
    assert {name for _, name in socket.if_nameindex()} == {"lo"}
    assert importlib.metadata.version("openai") == "2.7.1"
    scenario = validate_scenario(json.loads(Path(os.environ["QA_SCENARIO"]).read_text()))
    base = "https://api.openai.com/v1"
    params = {"model": scenario["model"], "input": scenario["marker"],
              "max_output_tokens": scenario["max_output_tokens"]}
    controls = []
    with OpenAI(api_key=SENTINEL, base_url=base, max_retries=0, timeout=5) as client:
        response = client.responses.create(**params)
        assert response.status == "completed" and response.output_text == scenario["response_text"]
        assert response.model == scenario["model"]
        controls.append({"case": "real_sdk_json", "response_id": response.id, "passed": True})
        with client.responses.stream(**params) as stream:
            events = list(stream)
            final = stream.get_final_response()
        assert final.status == "completed" and final.output_text == scenario["response_text"]
        assert final.id != response.id
        assert events[-1].type == "response.completed" and events[-1].response.id == final.id
        controls.append({"case": "real_sdk_sse", "response_id": final.id,
                         "events": [event.type for event in events], "passed": True})
        try:
            client.responses.create(**{**params, "model": "wrong-model"})
        except BadRequestError as error:
            assert error.status_code == 400 and error.code == "model"
            controls.append({"case": "wrong_model", "reason": error.code, "passed": True})
        else:
            raise AssertionError("wrong model was accepted")
    with OpenAI(api_key="wrong-sentinel", base_url=base, max_retries=0, timeout=5) as wrong:
        try:
            wrong.responses.create(**params)
        except BadRequestError as error:
            assert error.status_code == 400 and error.code == "credential"
            controls.append({"case": "wrong_credential", "reason": error.code, "passed": True})
        else:
            raise AssertionError("wrong credential was accepted")
    with httpx.Client(timeout=5) as wire:
        response = wire.post(base + "/not-responses", json=params,
                             headers={"Authorization": "Bearer " + SENTINEL})
        assert response.status_code == 400 and response.json()["error"]["code"] == "path"
        controls.append({"case": "wrong_path", "reason": "path", "passed": True})
        try:
            wire.get("https://127.0.0.1/v1/responses")
        except httpx.ConnectError as error:
            reasons = []
            current = error
            while current is not None:
                reasons.append(str(current))
                current = current.__cause__
            assert any("CERTIFICATE_VERIFY_FAILED" in value for value in reasons), reasons
            controls.append({"case": "wrong_tls_hostname", "reason": "certificate verification", "passed": True})
        else:
            raise AssertionError("wrong TLS hostname was accepted")
    with socket.socket() as sock:
        sock.settimeout(1)
        code = sock.connect_ex(("192.0.2.1", 443))
        assert code in {errno.ENETUNREACH, errno.EHOSTUNREACH}, code
        controls.append({"case": "no_external_route", "errno": code, "passed": True})
    imported = []
    for name, module in sorted(sys.modules.items()):
        filename = getattr(module, "__file__", None)
        if (name == "openai" or name.startswith("openai.")) and filename and filename.endswith(".py"):
            path = Path(filename).resolve()
            assert "site-packages" in path.parts
            imported.append({"module": name, "path": str(path),
                             "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    result = {"schema": "qa357.sdk-protocol-qualification.v1", "controls": controls,
              "openai_version": importlib.metadata.version("openai"), "imported_modules": imported,
              "scope": "real SDK and local protocol fixture only; no App/Agent execution"}
    with (Path(os.environ["QA_OUT"]) / "sdk-qualification.json").open("x") as target:
        json.dump(result, target, indent=2)


if __name__ == "__main__":
    qualify()
