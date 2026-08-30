from __future__ import annotations

import base64
import io
import importlib.util
import json
import os
import shlex
import struct
import subprocess
import sys
import time
import types
import urllib.parse
from pathlib import Path
from unittest import mock

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKER_PATH = (
    REPO_ROOT
    / "unchain_runtime"
    / "server"
    / "vault_sink_worker.py"
)
SPEC = importlib.util.spec_from_file_location("vault_sink_worker", WORKER_PATH)
assert SPEC is not None and SPEC.loader is not None
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


SECRET = "s3cr3t +/✓"
MCP_CREDENTIAL = "existing-mcp-token"


def _payload(sink_kind, *, field, audit, metadata=None, plaintext=SECRET):
    return {
        "version": 1,
        "sink_kind": sink_kind,
        "plaintext_bindings": [
            {"field": field, "plaintext": plaintext},
        ],
        "audit_arguments": audit,
        "toolkit_metadata": metadata or {},
    }


def _secret_variants(secret=SECRET):
    raw = secret.encode("utf-8")
    quoted = urllib.parse.quote(secret, safe="")
    quoted_plus = urllib.parse.quote_plus(secret, safe="")
    fully_percent_encoded = "".join(f"%{byte:02X}" for byte in raw)
    mixed_percent_encoded = "".join(
        f"%{byte:02x}" if index % 2 else f"%{byte:02X}"
        for index, byte in enumerate(raw)
    )
    raw_hex = raw.hex()
    mixed_hex = "".join(
        character.upper() if index % 2 else character
        for index, character in enumerate(raw_hex)
    )
    return {
        secret,
        json.dumps(secret, ensure_ascii=False)[1:-1],
        json.dumps(secret, ensure_ascii=True)[1:-1],
        quoted,
        quoted_plus,
        fully_percent_encoded,
        fully_percent_encoded.lower(),
        mixed_percent_encoded,
        quoted.replace("%E2", "%e2").replace("%9C", "%9c"),
        quoted_plus.replace("%E2", "%e2").replace("%9C", "%9c"),
        base64.b64encode(raw).decode("ascii"),
        base64.urlsafe_b64encode(raw).decode("ascii"),
        raw.hex(),
        raw.hex().upper(),
        mixed_hex,
    }


def _assert_no_secret(value, secret=SECRET):
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True)
    for variant in _secret_variants(secret):
        assert variant not in serialized


def test_redactor_covers_strings_bytes_nested_values_and_exceptions():
    redactor = worker._Redactor([SECRET])
    variants = list(_secret_variants())
    value = {
        SECRET: [
            variants[1],
            SECRET.encode("utf-8"),
            RuntimeError("failure " + variants[2]),
        ]
    }

    redacted = redactor.redact_value(value)

    assert worker.REDACTION_MARKER in str(redacted)
    for variant in variants:
        assert variant not in str(redacted)

    mixed_percent_case = urllib.parse.quote(SECRET, safe="").replace(
        "%E2%9C%93",
        "%e2%9c%93",
    )
    assert redactor.redact_text(mixed_percent_case) == worker.REDACTION_MARKER
    assert redactor.redact_bytes(
        mixed_percent_case.encode("ascii")
    ) == worker.REDACTION_MARKER.encode("ascii")
    fully_percent_encoded = "".join(
        f"%{byte:02x}" if index % 2 else f"%{byte:02X}"
        for index, byte in enumerate(SECRET.encode("utf-8"))
    )
    assert redactor.redact_text(fully_percent_encoded) == worker.REDACTION_MARKER
    assert redactor.redact_bytes(
        fully_percent_encoded.encode("ascii")
    ) == worker.REDACTION_MARKER.encode("ascii")


def test_shell_env_executes_foreground_and_redacts_all_encodings():
    script = (
        "import base64,json,os,sys,urllib.parse;"
        "s=os.environ['VAULT_TEST_TOKEN'];"
        "values=[s,json.dumps(s,ensure_ascii=True)[1:-1],"
        "urllib.parse.quote(s,safe=''),urllib.parse.quote_plus(s,safe=''),"
        "''.join(f'%{b:02x}' for b in s.encode()),"
        "base64.b64encode(s.encode()).decode(),s.encode().hex(),"
        "''.join(c.upper() if i%2 else c for i,c in enumerate(s.encode().hex()))];"
        "sys.stdout.write('\\n'.join(values));"
        "sys.stderr.write('\\n'+s)"
    )
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"
    before = dict(os.environ)

    result = worker.execute_intent(
        _payload(
            "shell_secret_env",
            field="VAULT_TEST_TOKEN",
            audit={
                "action": "run",
                "command": command,
                "run_in_background": False,
                "timeout_ms": 5_000,
                "max_output_chars": 20_000,
                "secret_fields": ["VAULT_TEST_TOKEN"],
            },
        )
    )

    assert result["ok"] is True
    assert result["result"]["exit_category"] == "success"
    assert worker.REDACTION_MARKER in result["result"]["stdout"]
    assert worker.REDACTION_MARKER in result["result"]["stderr"]
    _assert_no_secret(result)
    assert dict(os.environ) == before


def test_shell_stdin_is_exact_output_is_bounded_and_secret_free():
    script = (
        "import sys;"
        "s=sys.stdin.buffer.read();"
        "sys.stdout.write(s.hex()+'x'*5000)"
    )
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"

    result = worker.execute_intent(
        _payload(
            "shell_secret_stdin",
            field="stdin",
            audit={
                "action": "run",
                "command": command,
                "run_in_background": False,
                "timeout_ms": 5_000,
                "max_output_chars": 64,
                "secret_fields": ["stdin"],
            },
        )
    )

    assert len(result["result"]["stdout"]) <= 64
    assert result["result"]["stdout_truncated"] is True
    _assert_no_secret(result)


def test_shell_redaction_keeps_overlap_before_truncating_long_secret():
    long_secret = "Z" * 200
    script = "import sys;sys.stdout.write(sys.stdin.read())"
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"

    result = worker.execute_intent(
        _payload(
            "shell_secret_stdin",
            field="stdin",
            plaintext=long_secret,
            audit={
                "action": "run",
                "command": command,
                "run_in_background": False,
                "max_output_chars": 32,
                "secret_fields": ["stdin"],
            },
        )
    )

    assert result["result"]["stdout"] == worker.REDACTION_MARKER
    assert result["result"]["stdout_truncated"] is True
    assert "Z" not in result["result"]["stdout"]


def test_shell_rejects_handle_or_marker_in_command_before_spawn():
    popen = mock.Mock()
    handle = "pvh1_" + "a" * 64

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(
            _payload(
                "shell_secret_env",
                field="TOKEN",
                audit={
                    "action": "run",
                    "command": f"echo {handle}",
                    "run_in_background": False,
                    "secret_fields": ["TOKEN"],
                },
            ),
            popen_factory=popen,
        )

    assert captured.value.code == "vault_command_contains_secret_reference"
    popen.assert_not_called()


def test_shell_rejects_background_and_reports_timeout_as_safe_terminal_result():
    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(
            _payload(
                "shell_secret_env",
                field="TOKEN",
                audit={
                    "action": "run",
                    "command": "true",
                    "run_in_background": True,
                    "secret_fields": ["TOKEN"],
                },
            )
        )
    assert captured.value.code == "vault_sink_not_allowed"

    script = "import time;time.sleep(5)"
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"
    result = worker.execute_intent(
        _payload(
            "shell_secret_stdin",
            field="stdin",
            audit={
                "action": "run",
                "command": command,
                "run_in_background": False,
                "timeout_ms": 1_000,
                "secret_fields": ["stdin"],
            },
        )
    )
    assert result["result"]["exit_category"] == "timeout"
    _assert_no_secret(result)


@pytest.mark.skipif(os.name == "nt", reason="Unix process-group containment")
@pytest.mark.parametrize(
    ("tail", "expected_category"),
    [
        ("true", "success"),
        ("exit 7", "nonzero"),
        ("sleep 30", "timeout"),
    ],
)
def test_shell_cleans_background_descendants_after_terminal_state(
    tail,
    expected_category,
):
    result = worker.execute_intent(
        _payload(
            "shell_secret_env",
            field="TOKEN",
            audit={
                "action": "run",
                "command": (
                    "sleep 30 >/dev/null 2>&1 & child=$!; "
                    f"echo $child; {tail}"
                ),
                "run_in_background": False,
                "timeout_ms": 1_000,
                "secret_fields": ["TOKEN"],
            },
        )
    )

    assert result["result"]["exit_category"] == expected_category
    child_pid = int(result["result"]["stdout"].strip())
    child_state = ""
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        status = subprocess.run(
            ["ps", "-p", str(child_pid), "-o", "stat="],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=2,
        )
        child_state = status.stdout.decode("ascii", errors="ignore").strip()
        if status.returncode != 0 or not child_state or child_state.startswith("Z"):
            break
        time.sleep(0.05)
    assert not child_state or child_state.startswith("Z")


@pytest.mark.skipif(os.name == "nt", reason="Unix shell sink")
def test_shell_timeout_starts_while_large_stdin_writer_is_blocked():
    plaintext = "S" * worker.MAX_PLAINTEXT_BYTES
    script = "import time;time.sleep(10)"
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"

    started = time.monotonic()
    result = worker.execute_intent(
        _payload(
            "shell_secret_stdin",
            field="stdin",
            plaintext=plaintext,
            audit={
                "action": "run",
                "command": command,
                "run_in_background": False,
                "timeout_ms": 1_000,
                "secret_fields": ["stdin"],
            },
        )
    )
    elapsed = time.monotonic() - started

    assert result["result"]["exit_category"] == "timeout"
    assert elapsed < 4.0
    assert plaintext not in json.dumps(result)


def test_computer_requires_darwin_and_verified_secure_ax_writer():
    payload = _payload(
        "computer_input",
        field="text",
        audit={"action": "type", "target": "focused_secure_field"},
    )
    writer = mock.Mock()

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(payload, platform="linux", ax_writer=writer)
    assert captured.value.code == "vault_secure_field_required"
    writer.assert_not_called()

    result = worker.execute_intent(
        payload,
        platform="darwin",
        ax_writer=writer,
    )
    writer.assert_called_once_with(SECRET)
    assert result == {
        "version": worker.PROTOCOL_VERSION,
        "ok": True,
        "sink_kind": "computer_input",
        "result": {"status": "secure_field_updated"},
    }
    _assert_no_secret(result)


def test_macos_ax_writer_checks_exact_secure_subrole_before_setting_value():
    class FakeAXAPI:
        focused_attribute = 101
        role_attribute = 102
        subrole_attribute = 103
        value_attribute = 104
        text_field_role = 201
        secure_text_field_subrole = 202

        def __init__(self):
            self.system = 301
            self.focused = 302
            self.role = self.text_field_role
            self.subrole = self.secure_text_field_subrole
            self.settable = True
            self.created_text = []
            self.set_values = []
            self.released = []
            self.closed = False

        def create_system(self):
            return self.system

        def copy_attribute(self, element, attribute):
            values = {
                (self.system, self.focused_attribute): self.focused,
                (self.focused, self.role_attribute): self.role,
                (self.focused, self.subrole_attribute): self.subrole,
            }
            return (0, values[(element, attribute)])

        def equal(self, left, right):
            return left == right

        def is_settable(self, element, attribute):
            assert (element, attribute) == (self.focused, self.value_attribute)
            return (0, self.settable)

        def create_string(self, plaintext):
            self.created_text.append(plaintext)
            return 401

        def set_attribute(self, element, attribute, value):
            self.set_values.append((element, attribute, value))
            return 0

        def release(self, value):
            self.released.append(value)

        def close(self):
            self.closed = True

    api = FakeAXAPI()
    worker._write_macos_secure_field(SECRET, api_loader=lambda: api)

    assert api.created_text == [SECRET]
    assert api.set_values == [(api.focused, api.value_attribute, 401)]
    assert api.released == [401, 202, 201, 302, 301]
    assert api.closed is True

    for unsafe_state in ("role", "subrole", "settable"):
        api = FakeAXAPI()
        if unsafe_state == "role":
            api.role = 999
        elif unsafe_state == "subrole":
            api.subrole = 999
        else:
            api.settable = False
        with pytest.raises(worker.VaultSinkWorkerError) as captured:
            worker._write_macos_secure_field(SECRET, api_loader=lambda: api)
        assert captured.value.code == "vault_secure_field_required"
        assert api.set_values == []
        assert api.closed is True


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS frameworks required")
def test_macos_ctypes_ax_bridge_loads_without_pyobjc():
    api = worker._MacOSAXAPI()
    try:
        assert api.focused_attribute
        assert api.text_field_role
        assert api.secure_text_field_subrole
    finally:
        api.close()


class _MCPTool:
    _pupu_vault_secret_fields = ("token",)
    _pupu_vault_schema_fingerprint = "f" * 64
    _pupu_vault_mcp_toolkit_id = "mcp.example.secure"


class _MCPToolkit:
    def __init__(self):
        self.tools = {"deliver": _MCPTool()}
        self.executed = []
        self.disconnected = False
        self._pupu_vault_redaction_values = (MCP_CREDENTIAL,)

    def execute(self, tool_name, arguments):
        self.executed.append((tool_name, arguments))
        secret = arguments["token"]
        fully_percent_encoded = "".join(
            f"%{byte:02x}" for byte in secret.encode("utf-8")
        )
        raw_hex = secret.encode("utf-8").hex()
        mixed_hex = "".join(
            character.upper() if index % 2 else character
            for index, character in enumerate(raw_hex)
        )
        return {
            "plain": secret,
            "url": urllib.parse.quote(secret, safe=""),
            "fully_percent_encoded": fully_percent_encoded,
            "base64": base64.b64encode(secret.encode("utf-8")).decode("ascii"),
            "hex": secret.encode("utf-8").hex(),
            "mixed_hex": mixed_hex,
            "stored_credential": MCP_CREDENTIAL,
            "stored_credential_b64": base64.b64encode(
                MCP_CREDENTIAL.encode("utf-8")
            ).decode("ascii"),
            "nested": [b"binary payload"],
            "content_blocks": [
                {
                    "type": "image",
                    "media_type": "image/png",
                    "data_b64": base64.b64encode(b"image bytes").decode("ascii"),
                }
            ],
        }

    def disconnect(self):
        self.disconnected = True


def _mcp_payload(*, fingerprint="f" * 64, fields=None):
    secret_fields = fields or ["token"]
    return _payload(
        "mcp_schema_secret",
        field="token",
        audit={
            "channel": "alerts",
            "toolkit_id": "mcp.example.secure",
            "tool_name": "deliver",
            "secret_fields": secret_fields,
        },
        metadata={
            "toolkit_id": "mcp.example.secure",
            "tool_name": "deliver",
            "secret_fields": secret_fields,
            "schema_fingerprint": fingerprint,
        },
    )


def test_mcp_rebuilds_from_data_dir_validates_metadata_and_sanitizes_result(tmp_path):
    toolkit = _MCPToolkit()
    calls = []

    def builder(toolkit_id, data_dir):
        calls.append((toolkit_id, data_dir))
        return toolkit

    result = worker.execute_intent(
        _mcp_payload(),
        mcp_builder=builder,
        environ={"UNCHAIN_DATA_DIR": str(tmp_path)},
    )

    assert calls == [("mcp.example.secure", tmp_path)]
    assert toolkit.executed == [
        (
            "deliver",
            {"channel": "alerts", "token": SECRET},
        )
    ]
    assert toolkit.disconnected is True
    assert result["result"]["nested"][0]["type"] == "binary_redacted"
    image = result["result"]["content_blocks"][0]
    assert image["type"] == "binary_redacted"
    assert image["media_type"] == "image/png"
    assert "data_b64" not in image
    _assert_no_secret(result)
    _assert_no_secret(result, MCP_CREDENTIAL)


def test_mcp_schema_mismatch_fails_closed_and_disconnects(tmp_path):
    toolkit = _MCPToolkit()

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(
            _mcp_payload(fingerprint="e" * 64),
            mcp_builder=lambda _toolkit_id, _data_dir: toolkit,
            environ={"UNCHAIN_DATA_DIR": str(tmp_path)},
        )

    assert captured.value.code == "vault_mcp_schema_mismatch"
    assert toolkit.executed == []
    assert toolkit.disconnected is True


def test_mcp_missing_worker_credential_manifest_fails_closed(tmp_path):
    toolkit = _MCPToolkit()
    del toolkit._pupu_vault_redaction_values

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(
            _mcp_payload(),
            mcp_builder=lambda _toolkit_id, _data_dir: toolkit,
            environ={"UNCHAIN_DATA_DIR": str(tmp_path)},
        )

    assert captured.value.code == "vault_mcp_unavailable"
    assert toolkit.executed == []
    assert toolkit.disconnected is True


def test_mcp_remote_error_is_static_and_disconnects_without_echo(tmp_path):
    toolkit = _MCPToolkit()
    toolkit.execute = mock.Mock(
        return_value={"error": "remote echoed " + SECRET},
    )

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker.execute_intent(
            _mcp_payload(),
            mcp_builder=lambda _toolkit_id, _data_dir: toolkit,
            environ={"UNCHAIN_DATA_DIR": str(tmp_path)},
        )

    assert captured.value.code == "vault_mcp_execution_failed"
    assert toolkit.disconnected is True


def test_default_mcp_builder_resolves_roots_after_worker_relocation(tmp_path):
    calls = []
    fake_module = types.ModuleType("mcp_toolkits")

    def build(toolkit_id, *, data_dir, vault_worker_mode):
        calls.append(
            (
                toolkit_id,
                data_dir,
                vault_worker_mode,
                str(WORKER_PATH.parent) in sys.path,
            )
        )
        return object()

    fake_module.build_mcp_runtime_toolkit = build
    original_path = list(sys.path)
    try:
        with mock.patch.dict(sys.modules, {"mcp_toolkits": fake_module}):
            result = worker._default_mcp_builder(
                "mcp.example.secure",
                tmp_path,
            )
    finally:
        sys.path[:] = original_path

    assert result is not None
    assert calls == [("mcp.example.secure", tmp_path, True, True)]
    assert WORKER_PATH.parent == REPO_ROOT / "unchain_runtime" / "server"
    assert WORKER_PATH.parent.parent.parent == REPO_ROOT


def test_worker_protocol_emits_one_static_framed_error_and_no_stderr():
    invalid = b"{not-json"
    process = subprocess.run(
        [sys.executable, str(WORKER_PATH)],
        input=struct.pack(">I", len(invalid)) + invalid,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )

    assert process.returncode == 0
    assert process.stderr == b""
    size = struct.unpack(">I", process.stdout[:4])[0]
    assert len(process.stdout) == size + 4
    payload = json.loads(process.stdout[4:].decode("utf-8"))
    assert payload == {
        "version": worker.PROTOCOL_VERSION,
        "ok": False,
        "error": {"code": "vault_worker_protocol_error"},
    }


@pytest.mark.skipif(os.name == "nt", reason="Unix shell sink")
def test_worker_protocol_executes_one_valid_intent_without_plaintext_output():
    script = "import os;print(os.environ['TOKEN'])"
    command = f"{shlex.quote(sys.executable)} -c {shlex.quote(script)}"
    request = _payload(
        "shell_secret_env",
        field="TOKEN",
        audit={
            "action": "run",
            "command": command,
            "run_in_background": False,
            "secret_fields": ["TOKEN"],
        },
    )
    raw_request = json.dumps(request).encode("utf-8")

    process = subprocess.run(
        [sys.executable, str(WORKER_PATH)],
        input=struct.pack(">I", len(raw_request)) + raw_request,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=10,
    )

    assert process.returncode == 0
    assert process.stderr == b""
    size = struct.unpack(">I", process.stdout[:4])[0]
    assert len(process.stdout) == size + 4
    response = json.loads(process.stdout[4:].decode("utf-8"))
    assert response["ok"] is True
    assert response["version"] == worker.PROTOCOL_VERSION
    assert response["result"]["stdout"].strip() == worker.REDACTION_MARKER
    _assert_no_secret(response)


def test_worker_protocol_never_serializes_raw_executor_exception():
    request = json.dumps({"request": "safe"}).encode("utf-8")
    framed = io.BytesIO(struct.pack(">I", len(request)) + request)
    output = io.BytesIO()

    def fail(_payload):
        raise RuntimeError("executor echoed " + SECRET)

    assert worker.process_one_frame(framed, output, executor=fail) == 0
    response = output.getvalue()
    size = struct.unpack(">I", response[:4])[0]
    payload = json.loads(response[4:4 + size].decode("utf-8"))
    assert payload == {
        "version": worker.PROTOCOL_VERSION,
        "ok": False,
        "error": {"code": "vault_worker_failed"},
    }
    _assert_no_secret(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.pop("version"),
        lambda value: value.pop("toolkit_metadata"),
        lambda value: value.__setitem__("unexpected", True),
    ],
    ids=["missing-version", "missing-toolkit-metadata", "unknown-key"],
)
def test_worker_request_requires_exact_top_level_v1_contract(mutate):
    request = _payload(
        "shell_secret_env",
        field="TOKEN",
        audit={"action": "run", "command": "true", "secret_fields": ["TOKEN"]},
    )
    mutate(request)

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker._validate_intent(request)

    assert captured.value.code == "vault_invalid_request"


def test_worker_request_requires_exact_mcp_toolkit_metadata_contract():
    request = _mcp_payload()
    del request["toolkit_metadata"]["schema_fingerprint"]

    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker._validate_intent(request)

    assert captured.value.code == "vault_invalid_request"


@pytest.mark.parametrize(
    "response",
    [
        {"version": 1, "ok": True, "sink_kind": "shell_secret_env"},
        {"version": 1, "ok": False, "error": {"code": "vault_worker_failed", "extra": True}},
        {"version": True, "ok": False, "error": {"code": "vault_worker_failed"}},
    ],
)
def test_worker_response_requires_exact_versioned_closed_union(response):
    with pytest.raises(worker.VaultSinkWorkerError) as captured:
        worker._validate_response(response)

    assert captured.value.code == "vault_worker_failed"


def test_worker_rejects_trailing_stdin_before_executor_call():
    request = json.dumps(
        _payload(
            "shell_secret_env",
            field="TOKEN",
            audit={"action": "run", "command": "true", "secret_fields": ["TOKEN"]},
        )
    ).encode("utf-8")
    input_stream = io.BytesIO(struct.pack(">I", len(request)) + request + b"x")
    output_stream = io.BytesIO()
    calls = []

    assert worker.process_one_frame(
        input_stream,
        output_stream,
        executor=lambda payload: calls.append(payload) or {"ok": True},
    ) == 0

    assert calls == []
    raw = output_stream.getvalue()
    size = struct.unpack(">I", raw[:4])[0]
    assert json.loads(raw[4:4 + size].decode("utf-8")) == {
        "version": worker.PROTOCOL_VERSION,
        "ok": False,
        "error": {"code": "vault_worker_protocol_error"},
    }
