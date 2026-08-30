"""One-shot, framed worker for approved Vault sink execution.

The Electron main process starts this file directly (never through a shell),
sends exactly one length-prefixed JSON intent, and discards the process after
one length-prefixed JSON response.  Secret plaintext is accepted only in the
``plaintext_bindings`` field and is never logged or returned.
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import math
import os
import re
import signal
import struct
import subprocess
import sys
import threading
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, BinaryIO, Callable

from secret_redaction import (
    REDACTION_MARKER,
    Redactor as _Redactor,
    _percent_case_pattern,
    _secret_encodings,
)


PROTOCOL_VERSION = 1
MAX_FRAME_BYTES = 1024 * 1024
MAX_BINDINGS = 32
MAX_PLAINTEXT_BYTES = 64 * 1024
MAX_AUDIT_BYTES = 64 * 1024
MAX_OUTPUT_BYTES = 32 * 1024
DEFAULT_SHELL_TIMEOUT_MS = 120_000
MAX_SHELL_TIMEOUT_MS = 600_000
DEFAULT_SHELL_OUTPUT_CHARS = 10_000
MAX_SHELL_OUTPUT_CHARS = 12 * 1024
MAX_MCP_REDACTION_VALUES = 128
MAX_MCP_REDACTION_BYTES = 512 * 1024

_SINK_KINDS = frozenset(
    {
        "computer_input",
        "shell_secret_env",
        "shell_secret_stdin",
        "mcp_schema_secret",
    }
)
_HANDLE_RE = re.compile(r"pvh1_[0-9a-f]{64}")
_ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
_MCP_TOOLKIT_RE = re.compile(r"^mcp\.[A-Za-z0-9._:-]{1,250}$")
_FINGERPRINT_RE = re.compile(r"^[0-9a-f]{64}$")
_FIELD_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,512}$")
_SAFE_ERROR_RE = re.compile(r"^vault_[a-z0-9_]{1,80}$")
_ALLOWED_INPUT_KEYS = frozenset(
    {
        "version",
        "sink_kind",
        "plaintext_bindings",
        "audit_arguments",
        "toolkit_metadata",
    }
)
_MCP_METADATA_KEYS = frozenset(
    {
        "toolkit_id",
        "tool_name",
        "secret_fields",
        "schema_fingerprint",
    }
)
_SAFE_CHILD_ENV_KEYS = frozenset(
    {
        "COMSPEC",
        "HOME",
        "LANG",
        "LC_ALL",
        "LOGNAME",
        "PATH",
        "PATHEXT",
        "SHELL",
        "SYSTEMROOT",
        "TEMP",
        "TERM",
        "TMP",
        "TMPDIR",
        "USER",
        "WINDIR",
    }
)


class VaultSinkWorkerError(RuntimeError):
    """Static error code safe to cross the worker protocol."""

    def __init__(self, code: str) -> None:
        normalized = str(code or "vault_worker_failed").strip()
        if _SAFE_ERROR_RE.fullmatch(normalized) is None:
            normalized = "vault_worker_failed"
        super().__init__(normalized)
        self.code = normalized


def _canonical_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise VaultSinkWorkerError("vault_invalid_request") from exc


def _validated_field(value: Any) -> str:
    if not isinstance(value, str) or _FIELD_RE.fullmatch(value) is None:
        raise VaultSinkWorkerError("vault_invalid_request")
    return value


def _contains_secret_reference(value: Any, *, _depth: int = 0) -> bool:
    if _depth > 20:
        return True
    if isinstance(value, str):
        return bool(
            _HANDLE_RE.search(value)
            or "<secret-handle" in value.lower()
        )
    if isinstance(value, Mapping):
        return any(
            _contains_secret_reference(key, _depth=_depth + 1)
            or _contains_secret_reference(item, _depth=_depth + 1)
            for key, item in value.items()
        )
    if isinstance(value, Sequence) and not isinstance(
        value,
        (bytes, bytearray, memoryview, str),
    ):
        return any(
            _contains_secret_reference(item, _depth=_depth + 1)
            for item in value
        )
    return False


def _validate_intent(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != _ALLOWED_INPUT_KEYS:
        raise VaultSinkWorkerError("vault_invalid_request")
    if (
        not isinstance(payload["version"], int)
        or isinstance(payload["version"], bool)
        or payload["version"] != PROTOCOL_VERSION
    ):
        raise VaultSinkWorkerError("vault_invalid_request")
    sink_kind = payload["sink_kind"]
    if not isinstance(sink_kind, str) or sink_kind not in _SINK_KINDS:
        raise VaultSinkWorkerError("vault_sink_not_allowed")

    raw_bindings = payload["plaintext_bindings"]
    if (
        not isinstance(raw_bindings, list)
        or not 1 <= len(raw_bindings) <= MAX_BINDINGS
    ):
        raise VaultSinkWorkerError("vault_invalid_request")
    fields: set[str] = set()
    bindings = []
    for raw_binding in raw_bindings:
        if not isinstance(raw_binding, dict) or set(raw_binding) != {
            "field",
            "plaintext",
        }:
            raise VaultSinkWorkerError("vault_invalid_request")
        field = _validated_field(raw_binding.get("field"))
        plaintext = raw_binding.get("plaintext")
        if not isinstance(plaintext, str) or not plaintext:
            raise VaultSinkWorkerError("vault_invalid_request")
        if len(plaintext.encode("utf-8")) > MAX_PLAINTEXT_BYTES:
            raise VaultSinkWorkerError("vault_invalid_request")
        if field in fields:
            raise VaultSinkWorkerError("vault_invalid_request")
        fields.add(field)
        bindings.append((field, plaintext))

    audit_arguments = payload["audit_arguments"]
    toolkit_metadata = payload["toolkit_metadata"]
    if not isinstance(audit_arguments, dict) or not isinstance(
        toolkit_metadata,
        dict,
    ):
        raise VaultSinkWorkerError("vault_invalid_request")
    if sink_kind == "mcp_schema_secret":
        if set(toolkit_metadata) != _MCP_METADATA_KEYS:
            raise VaultSinkWorkerError("vault_invalid_request")
    elif toolkit_metadata:
        raise VaultSinkWorkerError("vault_invalid_request")
    if len(_canonical_bytes(audit_arguments)) > MAX_AUDIT_BYTES:
        raise VaultSinkWorkerError("vault_invalid_request")
    if len(_canonical_bytes(toolkit_metadata)) > MAX_AUDIT_BYTES:
        raise VaultSinkWorkerError("vault_invalid_request")
    redactor = _Redactor([plaintext for _field, plaintext in bindings])
    if redactor.contains_secret(audit_arguments) or redactor.contains_secret(
        toolkit_metadata
    ):
        raise VaultSinkWorkerError("vault_audit_contains_plaintext")
    if _contains_secret_reference(audit_arguments) or _contains_secret_reference(
        toolkit_metadata
    ):
        if sink_kind in {"shell_secret_env", "shell_secret_stdin"} and (
            _contains_secret_reference(audit_arguments.get("command"))
        ):
            raise VaultSinkWorkerError(
                "vault_command_contains_secret_reference"
            )
        raise VaultSinkWorkerError("vault_audit_contains_handle")
    return {
        "sink_kind": sink_kind,
        "bindings": tuple(bindings),
        "audit_arguments": json.loads(_canonical_bytes(audit_arguments)),
        "toolkit_metadata": json.loads(_canonical_bytes(toolkit_metadata)),
        "redactor": redactor,
    }


class _BoundedPipeCollector(threading.Thread):
    def __init__(self, stream: BinaryIO, limit: int) -> None:
        super().__init__(daemon=True)
        self._stream = stream
        self._limit = max(1, int(limit))
        self.data = bytearray()
        self.total_bytes = 0

    @property
    def truncated(self) -> bool:
        return self.total_bytes > len(self.data)

    def run(self) -> None:
        try:
            while True:
                chunk = self._stream.read(8192)
                if not chunk:
                    return
                raw = bytes(chunk)
                self.total_bytes += len(raw)
                remaining = self._limit - len(self.data)
                if remaining > 0:
                    self.data.extend(raw[:remaining])
        except BaseException:
            return


class _PipeWriter(threading.Thread):
    """Write stdin without delaying the command timeout clock."""

    def __init__(self, stream: BinaryIO, payload: bytes) -> None:
        super().__init__(daemon=True)
        self._stream = stream
        self._payload = payload

    def run(self) -> None:
        try:
            remaining = memoryview(self._payload)
            while remaining:
                written = self._stream.write(remaining)
                if not isinstance(written, int) or written <= 0:
                    return
                remaining = remaining[written:]
            self._stream.flush()
        except BaseException:
            return
        finally:
            try:
                self._stream.close()
            except BaseException:
                pass


def _bounded_integer(
    value: Any,
    *,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool):
        return default
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, normalized))


def _safe_child_environment() -> dict[str, str]:
    return {
        key: value
        for key, value in os.environ.items()
        if key in _SAFE_CHILD_ENV_KEYS or key.startswith("LC_")
    }


def _shell_executable() -> str | None:
    if os.name == "nt":
        return None
    if sys.platform == "darwin" and Path("/bin/zsh").is_file():
        return "/bin/zsh"
    if Path("/bin/bash").is_file():
        return "/bin/bash"
    return "/bin/sh"


def _terminate_process(process: subprocess.Popen[Any]) -> None:
    try:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=5.0,
            )
    except BaseException:
        try:
            process.kill()
        except BaseException:
            pass


def _execute_shell(
    intent: Mapping[str, Any],
    *,
    popen_factory: Callable[..., subprocess.Popen[Any]] = subprocess.Popen,
) -> dict[str, Any]:
    # Windows process groups do not provide kill-on-close containment. Until
    # the launcher owns a Job Object, refuse to resolve plaintext into a shell
    # there instead of allowing detached descendants to retain it.
    if os.name == "nt":
        raise VaultSinkWorkerError("vault_shell_containment_unavailable")
    sink_kind = intent["sink_kind"]
    audit = intent["audit_arguments"]
    bindings = intent["bindings"]
    redactor: _Redactor = intent["redactor"]
    if intent["toolkit_metadata"]:
        raise VaultSinkWorkerError("vault_invalid_request")
    if str(audit.get("action") or "").strip().lower() != "run":
        raise VaultSinkWorkerError("vault_sink_not_allowed")
    background = audit.get("run_in_background")
    if background is not None and background is not False:
        raise VaultSinkWorkerError("vault_sink_not_allowed")
    command = audit.get("command")
    if (
        not isinstance(command, str)
        or not command.strip()
        or len(command.encode("utf-8")) > 64 * 1024
        or "\x00" in command
    ):
        raise VaultSinkWorkerError("vault_invalid_request")
    if (
        _HANDLE_RE.search(command)
        or "<secret-handle" in command.lower()
        or redactor.contains_secret(command)
    ):
        raise VaultSinkWorkerError("vault_command_contains_secret_reference")

    audit_fields = audit.get("secret_fields")
    if not isinstance(audit_fields, list):
        raise VaultSinkWorkerError("vault_invalid_request")
    try:
        normalized_audit_fields = tuple(
            sorted(_validated_field(item) for item in audit_fields)
        )
    except VaultSinkWorkerError:
        raise VaultSinkWorkerError("vault_invalid_request") from None
    binding_fields = tuple(sorted(field for field, _plaintext in bindings))
    if normalized_audit_fields != binding_fields:
        raise VaultSinkWorkerError("vault_invalid_request")

    child_env = _safe_child_environment()
    stdin_payload = b""
    if sink_kind == "shell_secret_env":
        for field, plaintext in bindings:
            if _ENV_NAME_RE.fullmatch(field) is None:
                raise VaultSinkWorkerError("vault_invalid_request")
            child_env[field] = plaintext
    elif sink_kind == "shell_secret_stdin":
        if len(bindings) != 1 or bindings[0][0] != "stdin":
            raise VaultSinkWorkerError("vault_invalid_request")
        stdin_payload = bindings[0][1].encode("utf-8")
    else:
        raise VaultSinkWorkerError("vault_sink_not_allowed")

    cwd = audit.get("cwd")
    if cwd is None or cwd == "":
        cwd = None
    elif not isinstance(cwd, str) or "\x00" in cwd:
        raise VaultSinkWorkerError("vault_invalid_request")
    timeout_ms = _bounded_integer(
        audit.get("timeout_ms"),
        default=DEFAULT_SHELL_TIMEOUT_MS,
        minimum=1_000,
        maximum=MAX_SHELL_TIMEOUT_MS,
    )
    output_chars = _bounded_integer(
        audit.get("max_output_chars"),
        default=DEFAULT_SHELL_OUTPUT_CHARS,
        minimum=1,
        maximum=MAX_SHELL_OUTPUT_CHARS,
    )
    popen_kwargs: dict[str, Any] = {
        "args": command,
        "shell": True,
        "cwd": cwd,
        "env": child_env,
        "stdin": subprocess.PIPE,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": False,
        "close_fds": True,
    }
    executable = _shell_executable()
    if executable:
        popen_kwargs["executable"] = executable
    if os.name == "nt":
        popen_kwargs["creationflags"] = getattr(
            subprocess,
            "CREATE_NEW_PROCESS_GROUP",
            0,
        )
    else:
        popen_kwargs["start_new_session"] = True
    try:
        process = popen_factory(**popen_kwargs)
    except BaseException as exc:
        del exc
        raise VaultSinkWorkerError("vault_shell_spawn_failed") from None

    assert process.stdout is not None
    assert process.stderr is not None
    redaction_overlap = redactor.max_variant_bytes
    stdout_collector = _BoundedPipeCollector(
        process.stdout,
        output_chars + redaction_overlap,
    )
    stderr_collector = _BoundedPipeCollector(
        process.stderr,
        output_chars + redaction_overlap,
    )
    stdout_collector.start()
    stderr_collector.start()
    stdin_writer = None
    if process.stdin is not None:
        stdin_writer = _PipeWriter(process.stdin, stdin_payload)
        stdin_writer.start()
    timed_out = False
    returncode = None
    try:
        try:
            returncode = process.wait(timeout=timeout_ms / 1000.0)
        except subprocess.TimeoutExpired:
            timed_out = True
    finally:
        # Kill the process group even after a normal/non-zero shell exit. A
        # shell can otherwise leave `cmd &` descendants alive with a copy of
        # the one-shot secret environment.
        _terminate_process(process)
        try:
            if returncode is None:
                returncode = process.wait(timeout=5.0)
        except BaseException:
            returncode = None
        if stdin_writer is not None:
            stdin_writer.join(timeout=5.0)
        stdout_collector.join(timeout=5.0)
        stderr_collector.join(timeout=5.0)
        for stream in (process.stdout, process.stderr):
            try:
                stream.close()
            except BaseException:
                pass

    stdout_text = redactor.redact_text(
        bytes(stdout_collector.data).decode("utf-8", errors="replace")
    )
    stderr_text = redactor.redact_text(
        bytes(stderr_collector.data).decode("utf-8", errors="replace")
    )
    stdout_was_truncated = (
        stdout_collector.total_bytes > output_chars
        or len(stdout_text) > output_chars
    )
    stderr_was_truncated = (
        stderr_collector.total_bytes > output_chars
        or len(stderr_text) > output_chars
    )
    stdout_text = stdout_text[:output_chars]
    stderr_text = stderr_text[:output_chars]
    exit_category = (
        "timeout"
        if timed_out
        else "success"
        if returncode == 0
        else "nonzero"
    )
    return {
        "version": PROTOCOL_VERSION,
        "ok": True,
        "sink_kind": sink_kind,
        "result": {
            "exit_category": exit_category,
            "returncode": returncode,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "stdout_truncated": stdout_was_truncated,
            "stderr_truncated": stderr_was_truncated,
        },
    }


class _MacOSAXAPI:
    """Small ctypes bridge for the packaged worker (no PyObjC dependency)."""

    _APPLICATION_SERVICES = (
        "/System/Library/Frameworks/ApplicationServices.framework/"
        "ApplicationServices"
    )
    _CORE_FOUNDATION = (
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )
    _UTF8_ENCODING = 0x08000100

    def __init__(self) -> None:
        application_services = ctypes.CDLL(self._APPLICATION_SERVICES)
        core_foundation = ctypes.CDLL(self._CORE_FOUNDATION)
        self._create_system = application_services.AXUIElementCreateSystemWide
        self._create_system.argtypes = []
        self._create_system.restype = ctypes.c_void_p
        self._copy_attribute = (
            application_services.AXUIElementCopyAttributeValue
        )
        self._copy_attribute.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
        ]
        self._copy_attribute.restype = ctypes.c_int32
        self._is_settable = (
            application_services.AXUIElementIsAttributeSettable
        )
        self._is_settable.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_ubyte),
        ]
        self._is_settable.restype = ctypes.c_int32
        self._set_attribute = (
            application_services.AXUIElementSetAttributeValue
        )
        self._set_attribute.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
        ]
        self._set_attribute.restype = ctypes.c_int32
        self._equal = core_foundation.CFEqual
        self._equal.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self._equal.restype = ctypes.c_ubyte
        self._create_string = core_foundation.CFStringCreateWithBytes
        self._create_string.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_long,
            ctypes.c_uint32,
            ctypes.c_ubyte,
        ]
        self._create_string.restype = ctypes.c_void_p
        self._release = core_foundation.CFRelease
        self._release.argtypes = [ctypes.c_void_p]
        self._release.restype = None
        # AX constants are CFSTR macros and are not exported dynamic symbols
        # on current macOS. Construct their documented string values instead
        # of relying on PyObjC or dlsym.
        self._constant_values = []
        try:
            self.focused_attribute = self._owned_constant(
                "AXFocusedUIElement"
            )
            self.role_attribute = self._owned_constant("AXRole")
            self.subrole_attribute = self._owned_constant("AXSubrole")
            self.value_attribute = self._owned_constant("AXValue")
            self.text_field_role = self._owned_constant("AXTextField")
            self.secure_text_field_subrole = self._owned_constant(
                "AXSecureTextField"
            )
        except BaseException:
            self.close()
            raise

    def _owned_constant(self, value: str) -> int:
        constant = self.create_string(value)
        if not constant:
            raise VaultSinkWorkerError("vault_secure_field_required")
        self._constant_values.append(constant)
        return constant

    def create_system(self) -> int:
        return int(self._create_system() or 0)

    def copy_attribute(self, element: int, attribute: int) -> tuple[int, int]:
        output = ctypes.c_void_p()
        error = self._copy_attribute(element, attribute, ctypes.byref(output))
        return int(error), int(output.value or 0)

    def is_settable(self, element: int, attribute: int) -> tuple[int, bool]:
        output = ctypes.c_ubyte(0)
        error = self._is_settable(element, attribute, ctypes.byref(output))
        return int(error), bool(output.value)

    def set_attribute(self, element: int, attribute: int, value: int) -> int:
        return int(self._set_attribute(element, attribute, value))

    def equal(self, left: int, right: int) -> bool:
        return bool(self._equal(left, right))

    def create_string(self, plaintext: str) -> int:
        raw = plaintext.encode("utf-8")
        buffer = ctypes.create_string_buffer(raw)
        value = self._create_string(
            None,
            ctypes.cast(buffer, ctypes.c_void_p),
            len(raw),
            self._UTF8_ENCODING,
            0,
        )
        return int(value or 0)

    def release(self, value: int) -> None:
        if value:
            self._release(value)

    def close(self) -> None:
        while self._constant_values:
            self.release(self._constant_values.pop())


def _ax_copied_attribute(api: Any, element: int, attribute: int) -> int:
    error, value = api.copy_attribute(element, attribute)
    if error != 0 or not value:
        if value:
            try:
                api.release(value)
            except BaseException:
                pass
        raise VaultSinkWorkerError("vault_secure_field_required")
    return value


def _write_macos_secure_field(
    plaintext: str,
    *,
    api_loader: Callable[[], Any] = _MacOSAXAPI,
) -> None:
    api = None
    owned_values = []
    try:
        api = api_loader()
        system = api.create_system()
        if not system:
            raise VaultSinkWorkerError("vault_secure_field_required")
        owned_values.append(system)
        focused = _ax_copied_attribute(api, system, api.focused_attribute)
        owned_values.append(focused)
        role = _ax_copied_attribute(api, focused, api.role_attribute)
        owned_values.append(role)
        subrole = _ax_copied_attribute(api, focused, api.subrole_attribute)
        owned_values.append(subrole)
        if not api.equal(role, api.text_field_role) or not api.equal(
            subrole,
            api.secure_text_field_subrole,
        ):
            raise VaultSinkWorkerError("vault_secure_field_required")
        error, settable = api.is_settable(focused, api.value_attribute)
        if error != 0 or settable is not True:
            raise VaultSinkWorkerError("vault_secure_field_required")
        text_value = api.create_string(plaintext)
        if not text_value:
            raise VaultSinkWorkerError("vault_secure_field_required")
        owned_values.append(text_value)
        if api.set_attribute(focused, api.value_attribute, text_value) != 0:
            raise VaultSinkWorkerError("vault_secure_field_required")
    except VaultSinkWorkerError:
        raise
    except BaseException as exc:
        del exc
        raise VaultSinkWorkerError("vault_secure_field_required") from None
    finally:
        for value in reversed(owned_values):
            try:
                if api is not None:
                    api.release(value)
            except BaseException:
                pass
        try:
            close = getattr(api, "close", None)
            if callable(close):
                close()
        except BaseException:
            pass


def _execute_computer(
    intent: Mapping[str, Any],
    *,
    platform: str,
    ax_writer: Callable[[str], None],
) -> dict[str, Any]:
    if platform != "darwin":
        raise VaultSinkWorkerError("vault_secure_field_required")
    if intent["toolkit_metadata"]:
        raise VaultSinkWorkerError("vault_invalid_request")
    bindings = intent["bindings"]
    audit = intent["audit_arguments"]
    if (
        len(bindings) != 1
        or bindings[0][0] != "text"
        or audit.get("target") != "focused_secure_field"
        or audit.get("action") != "type"
    ):
        raise VaultSinkWorkerError("vault_secure_field_required")
    try:
        ax_writer(bindings[0][1])
    except VaultSinkWorkerError:
        raise
    except BaseException as exc:
        del exc
        raise VaultSinkWorkerError("vault_secure_field_required") from None
    return {
        "version": PROTOCOL_VERSION,
        "ok": True,
        "sink_kind": "computer_input",
        "result": {"status": "secure_field_updated"},
    }


def _binary_payload(value: Any) -> bytes:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)
    if not isinstance(value, str):
        return _canonical_bytes(value)
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        return value.encode("utf-8", errors="replace")


def _binary_metadata(
    value: Any,
    *,
    media_type: str = "",
    redactor: _Redactor | None = None,
) -> dict[str, Any]:
    raw = _binary_payload(value)
    result = {
        "type": "binary_redacted",
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    normalized_media_type = str(media_type or "").strip()
    if normalized_media_type:
        if redactor is not None:
            normalized_media_type = redactor.redact_text(normalized_media_type)
        result["media_type"] = normalized_media_type[:255]
    return result


def _sanitize_mcp_result(
    value: Any,
    redactor: _Redactor,
    *,
    _depth: int = 0,
    _budget: list[int] | None = None,
) -> Any:
    budget = _budget if _budget is not None else [20_000]
    budget[0] -= 1
    if budget[0] < 0 or _depth > 20:
        return {"type": "result_limited"}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return _binary_metadata(value, redactor=redactor)
    if isinstance(value, str):
        return redactor.redact_text(value)
    if isinstance(value, BaseException):
        return redactor.redact_text(str(value))
    if isinstance(value, Mapping):
        block_type = str(value.get("type") or "").strip().lower()
        media_type = str(
            value.get("media_type") or value.get("mimeType") or ""
        ).strip()
        binary_key = next(
            (
                key
                for key in ("data_b64", "data_base64", "blob")
                if key in value
            ),
            "",
        )
        if not binary_key and block_type in {"image", "audio", "binary"}:
            binary_key = "data" if "data" in value else ""
        if (
            block_type in {"image", "audio", "binary", "blob"}
            or media_type.lower().startswith(("image/", "audio/"))
            or binary_key
        ):
            return _binary_metadata(
                value.get(binary_key, b""),
                media_type=media_type,
                redactor=redactor,
            )
        return {
            redactor.redact_text(str(key)): _sanitize_mcp_result(
                item,
                redactor,
                _depth=_depth + 1,
                _budget=budget,
            )
            for key, item in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, str):
        return [
            _sanitize_mcp_result(
                item,
                redactor,
                _depth=_depth + 1,
                _budget=budget,
            )
            for item in value
        ]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redactor.redact_text(str(value))


def _default_mcp_builder(toolkit_id: str, data_dir: Path) -> Any:
    server_root = Path(__file__).resolve().parent
    repo_root = server_root.parent.parent
    if str(server_root) not in sys.path:
        sys.path.insert(0, str(server_root))
    # Source checkouts keep Unchain as a sibling repository.  Packaged builds
    # already provide the module, so this fixed, non-input-derived fallback is
    # used only when the sibling source tree actually exists.
    sibling_unchain = repo_root.parent / "unchain" / "src"
    if sibling_unchain.is_dir() and str(sibling_unchain) not in sys.path:
        sys.path.insert(0, str(sibling_unchain))
    from mcp_toolkits import build_mcp_runtime_toolkit

    return build_mcp_runtime_toolkit(
        toolkit_id,
        data_dir=data_dir,
        vault_worker_mode=True,
    )


def _execute_mcp(
    intent: Mapping[str, Any],
    *,
    mcp_builder: Callable[[str, Path], Any],
    environ: Mapping[str, str],
) -> dict[str, Any]:
    metadata = intent["toolkit_metadata"]
    if set(metadata) != _MCP_METADATA_KEYS:
        raise VaultSinkWorkerError("vault_invalid_request")
    toolkit_id = metadata.get("toolkit_id")
    tool_name = metadata.get("tool_name")
    fingerprint = metadata.get("schema_fingerprint")
    raw_secret_fields = metadata.get("secret_fields")
    if (
        not isinstance(toolkit_id, str)
        or _MCP_TOOLKIT_RE.fullmatch(toolkit_id) is None
        or not isinstance(tool_name, str)
        or not tool_name
        or len(tool_name) > 512
        or "\x00" in tool_name
        or not isinstance(fingerprint, str)
        or _FINGERPRINT_RE.fullmatch(fingerprint) is None
        or not isinstance(raw_secret_fields, list)
    ):
        raise VaultSinkWorkerError("vault_invalid_request")
    secret_fields = tuple(sorted(_validated_field(item) for item in raw_secret_fields))
    if len(set(secret_fields)) != len(secret_fields) or not secret_fields:
        raise VaultSinkWorkerError("vault_invalid_request")
    binding_fields = tuple(sorted(field for field, _plaintext in intent["bindings"]))
    if binding_fields != secret_fields:
        raise VaultSinkWorkerError("vault_mcp_schema_mismatch")

    audit = dict(intent["audit_arguments"])
    if audit.get("toolkit_id") != toolkit_id:
        raise VaultSinkWorkerError("vault_mcp_toolkit_mismatch")
    if audit.get("tool_name") != tool_name:
        raise VaultSinkWorkerError("vault_mcp_tool_mismatch")
    audit_fields = audit.get("secret_fields")
    if not isinstance(audit_fields, list):
        raise VaultSinkWorkerError("vault_mcp_schema_mismatch")
    try:
        normalized_audit_fields = tuple(
            sorted(_validated_field(item) for item in audit_fields)
        )
    except VaultSinkWorkerError:
        raise VaultSinkWorkerError("vault_mcp_schema_mismatch") from None
    if normalized_audit_fields != secret_fields:
        raise VaultSinkWorkerError("vault_mcp_schema_mismatch")
    for metadata_key in ("toolkit_id", "tool_name", "secret_fields"):
        audit.pop(metadata_key, None)
    if any(field in audit for field in secret_fields):
        raise VaultSinkWorkerError("vault_mcp_schema_mismatch")

    raw_data_dir = str(environ.get("UNCHAIN_DATA_DIR") or "").strip()
    if not raw_data_dir or "\x00" in raw_data_dir:
        raise VaultSinkWorkerError("vault_mcp_unavailable")
    toolkit = None
    try:
        toolkit = mcp_builder(toolkit_id, Path(raw_data_dir))
        raw_credential_values = getattr(
            toolkit,
            "_pupu_vault_redaction_values",
            None,
        )
        if not isinstance(raw_credential_values, (tuple, list)):
            raise VaultSinkWorkerError("vault_mcp_unavailable")
        credential_values = []
        credential_bytes = 0
        for raw_value in raw_credential_values:
            if not isinstance(raw_value, str) or not raw_value:
                raise VaultSinkWorkerError("vault_mcp_unavailable")
            encoded_value = raw_value.encode("utf-8")
            credential_bytes += len(encoded_value)
            if (
                len(encoded_value) > MAX_PLAINTEXT_BYTES
                or credential_bytes > MAX_MCP_REDACTION_BYTES
                or len(credential_values) >= MAX_MCP_REDACTION_VALUES
            ):
                raise VaultSinkWorkerError("vault_mcp_unavailable")
            credential_values.append(raw_value)
        execution_redactor = _Redactor(
            [
                *(plaintext for _field, plaintext in intent["bindings"]),
                *credential_values,
            ]
        )
        tools = getattr(toolkit, "tools", None)
        if not isinstance(tools, Mapping) or tool_name not in tools:
            raise VaultSinkWorkerError("vault_mcp_tool_mismatch")
        tool = tools[tool_name]
        current_fields = tuple(
            sorted(
                str(field)
                for field in (
                    getattr(tool, "_pupu_vault_secret_fields", ()) or ()
                )
            )
        )
        current_fingerprint = str(
            getattr(tool, "_pupu_vault_schema_fingerprint", "") or ""
        )
        current_toolkit_id = str(
            getattr(tool, "_pupu_vault_mcp_toolkit_id", "") or ""
        )
        if current_toolkit_id != toolkit_id:
            raise VaultSinkWorkerError("vault_mcp_toolkit_mismatch")
        if current_fields != secret_fields or current_fingerprint != fingerprint:
            raise VaultSinkWorkerError("vault_mcp_schema_mismatch")
        arguments = dict(audit)
        for field, plaintext in intent["bindings"]:
            arguments[field] = plaintext
        execute = getattr(toolkit, "execute", None)
        if not callable(execute):
            raise VaultSinkWorkerError("vault_mcp_unavailable")
        raw_result = execute(tool_name, arguments)
        if isinstance(raw_result, Mapping) and "error" in raw_result:
            raise VaultSinkWorkerError("vault_mcp_execution_failed")
        safe_result = _sanitize_mcp_result(raw_result, execution_redactor)
        encoded = _canonical_bytes(safe_result)
        if len(encoded) > MAX_OUTPUT_BYTES:
            safe_result = {
                "type": "oversize_result_redacted",
                "bytes": len(encoded),
                "sha256": hashlib.sha256(encoded).hexdigest(),
            }
        return {
            "version": PROTOCOL_VERSION,
            "ok": True,
            "sink_kind": "mcp_schema_secret",
            "result": safe_result,
        }
    except VaultSinkWorkerError:
        raise
    except BaseException as exc:
        del exc
        raise VaultSinkWorkerError("vault_mcp_execution_failed") from None
    finally:
        disconnect = getattr(toolkit, "disconnect", None)
        if callable(disconnect):
            try:
                disconnect()
            except BaseException:
                pass


def execute_intent(
    payload: Any,
    *,
    mcp_builder: Callable[[str, Path], Any] = _default_mcp_builder,
    environ: Mapping[str, str] | None = None,
    platform: str | None = None,
    ax_writer: Callable[[str], None] = _write_macos_secure_field,
    popen_factory: Callable[..., subprocess.Popen[Any]] = subprocess.Popen,
) -> dict[str, Any]:
    intent = _validate_intent(payload)
    sink_kind = intent["sink_kind"]
    if sink_kind in {"shell_secret_env", "shell_secret_stdin"}:
        return _execute_shell(intent, popen_factory=popen_factory)
    if sink_kind == "computer_input":
        return _execute_computer(
            intent,
            platform=sys.platform if platform is None else platform,
            ax_writer=ax_writer,
        )
    if sink_kind == "mcp_schema_secret":
        return _execute_mcp(
            intent,
            mcp_builder=mcp_builder,
            environ=os.environ if environ is None else environ,
        )
    raise VaultSinkWorkerError("vault_sink_not_allowed")


def _read_exact(stream: BinaryIO, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            raise VaultSinkWorkerError("vault_worker_protocol_error")
        chunks.extend(chunk)
    return bytes(chunks)


def _safe_error_payload(error: BaseException) -> dict[str, Any]:
    code = (
        error.code
        if isinstance(error, VaultSinkWorkerError)
        else "vault_worker_failed"
    )
    if _SAFE_ERROR_RE.fullmatch(str(code or "")) is None:
        code = "vault_worker_failed"
    return {
        "version": PROTOCOL_VERSION,
        "ok": False,
        "error": {"code": code},
    }


def _validate_response(payload: Any) -> dict[str, Any]:
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("version"), int)
        or isinstance(payload.get("version"), bool)
        or payload["version"] != PROTOCOL_VERSION
    ):
        raise VaultSinkWorkerError("vault_worker_failed")
    if payload.get("ok") is True:
        if set(payload) != {"version", "ok", "sink_kind", "result"}:
            raise VaultSinkWorkerError("vault_worker_failed")
        if payload["sink_kind"] not in _SINK_KINDS:
            raise VaultSinkWorkerError("vault_worker_failed")
    elif payload.get("ok") is False:
        if set(payload) != {"version", "ok", "error"}:
            raise VaultSinkWorkerError("vault_worker_failed")
        error = payload["error"]
        if (
            not isinstance(error, dict)
            or set(error) != {"code"}
            or _SAFE_ERROR_RE.fullmatch(str(error["code"] or "")) is None
        ):
            raise VaultSinkWorkerError("vault_worker_failed")
    else:
        raise VaultSinkWorkerError("vault_worker_failed")
    return payload


def process_one_frame(
    input_stream: BinaryIO,
    output_stream: BinaryIO,
    *,
    executor: Callable[[Any], dict[str, Any]] = execute_intent,
) -> int:
    try:
        header = _read_exact(input_stream, 4)
        frame_size = struct.unpack(">I", header)[0]
        if not 1 <= frame_size <= MAX_FRAME_BYTES:
            raise VaultSinkWorkerError("vault_worker_protocol_error")
        raw_payload = _read_exact(input_stream, frame_size)
        if input_stream.read(1):
            raise VaultSinkWorkerError("vault_worker_protocol_error")
        try:
            payload = json.loads(raw_payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise VaultSinkWorkerError("vault_worker_protocol_error") from None
        result = _validate_response(executor(payload))
        response = _canonical_bytes(result)
        if len(response) > MAX_OUTPUT_BYTES:
            raise VaultSinkWorkerError("vault_worker_output_too_large")
    except BaseException as exc:
        response = _canonical_bytes(_safe_error_payload(exc))
    try:
        output_stream.write(struct.pack(">I", len(response)))
        output_stream.write(response)
        output_stream.flush()
        return 0
    except BaseException:
        return 1


def main() -> int:
    protocol_output: BinaryIO | None = None
    try:
        protocol_output = os.fdopen(os.dup(sys.stdout.fileno()), "wb")
        with open(os.devnull, "wb", buffering=0) as null_output:
            os.dup2(null_output.fileno(), sys.stdout.fileno())
            os.dup2(null_output.fileno(), sys.stderr.fileno())
        return process_one_frame(sys.stdin.buffer, protocol_output)
    except BaseException:
        return 1
    finally:
        if protocol_output is not None:
            try:
                protocol_output.close()
            except BaseException:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
