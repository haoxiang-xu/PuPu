"""PuPu-only runtime routing for opaque Vault handles.

The model and Unchain kernel see opaque handles only.  A supported handle-
bearing call is intercepted before the original tool function, durably bound
to a one-use Electron intent, and executed by the Electron-owned sink broker.
Unsupported or malformed handle use is terminally rejected rather than passed
through to a generic tool.
"""

from __future__ import annotations

import copy
import functools
import hashlib
import json
import re
import threading
from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any, Mapping, Sequence

from vault_sink_client import VaultSinkClient, VaultSinkClientError

try:
    from unchain.kernel.types import ToolCall
    from unchain.tools.confirmation import prepare_tool_confirmation
    from unchain.tools.models import (
        ToolConfirmationResponse,
        ToolExecutionContext,
        ToolParameter,
    )
    from unchain.tools.runtime import ToolRuntimeOutcome
    from unchain.tools.tool import Tool
    from unchain.tools.toolkit import Toolkit
except ImportError:  # pragma: no cover - production requires Unchain
    ToolCall = Any  # type: ignore[misc,assignment]
    ToolConfirmationResponse = None  # type: ignore[assignment]
    ToolExecutionContext = None  # type: ignore[assignment]
    ToolParameter = None  # type: ignore[assignment]
    ToolRuntimeOutcome = None  # type: ignore[assignment]
    Tool = None  # type: ignore[assignment]
    Toolkit = None  # type: ignore[assignment]
    prepare_tool_confirmation = None  # type: ignore[assignment]


SCHEMA_VERSION = 1
SYNTHETIC_TOOL_NAME = "vault_sink_use"
MAX_HANDLES_PER_CALL = 32
MAX_AUDIT_ARGUMENT_BYTES = 32 * 1024
VAULT_SUBAGENT_BOUNDARY_ERROR = "vault_handle_cannot_cross_subagent_boundary"

_SUBAGENT_BOUNDARY_TOOL_NAMES = frozenset(
    {
        "delegate_to_subagent",
        "handoff_to_subagent",
        "spawn_worker_batch",
        "spawn_agent_thread",
        "send_agent_message",
        "wait_agent_messages",
        "close_agent_thread",
        "write_agent_board",
        "read_agent_board",
        "return_handoff_to_subagent",
        "return_to_parent",
    }
)

_HANDLE_RE = re.compile(r"^pvh1_[0-9a-f]{64}$")
_INTENT_RE = re.compile(r"^pvi1_[A-Za-z0-9._-]{16,120}$")
_RECEIPT_RE = re.compile(r"^pvr1_[A-Za-z0-9._-]{8,120}$")
_ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
_MARKER_RE = re.compile(
    r'^<secret-handle\s+label="[^"\r\n]{1,512}"\s+'
    r'handle="(pvh1_[0-9a-f]{64})"\s*/>$'
)


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
        raise ValueError("vault_invalid_request") from exc


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _required_identifier(value: Any, field_name: str, maximum: int = 255) -> str:
    normalized = str(value or "").strip()
    if (
        not normalized
        or len(normalized) > maximum
        or "\x00" in normalized
        or normalized in {".", "..", "__proto__"}
    ):
        raise ValueError(f"{field_name}_invalid")
    return normalized


def _extract_exact_handle(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = value.strip()
    if _HANDLE_RE.fullmatch(normalized):
        return normalized
    match = _MARKER_RE.fullmatch(normalized)
    return match.group(1) if match is not None else ""


def _find_handles(value: Any, *, _depth: int = 0) -> tuple[str, ...]:
    if _depth > 12:
        return ()
    found: list[str] = []
    if isinstance(value, str):
        found.extend(re.findall(r"pvh1_[0-9a-f]{64}", value))
    elif isinstance(value, Mapping):
        for key, item in value.items():
            found.extend(_find_handles(key, _depth=_depth + 1))
            found.extend(_find_handles(item, _depth=_depth + 1))
    elif isinstance(value, Sequence) and not isinstance(
        value,
        (bytes, bytearray, str),
    ):
        for item in value:
            found.extend(_find_handles(item, _depth=_depth + 1))
    return tuple(dict.fromkeys(found))


def _bounded_audit_arguments(value: Mapping[str, Any]) -> dict[str, Any]:
    copied = copy.deepcopy(dict(value))
    if len(_canonical_bytes(copied)) > MAX_AUDIT_ARGUMENT_BYTES:
        raise ValueError("vault_invalid_request")
    if _find_handles(copied):
        raise ValueError("vault_audit_contains_handle")
    return copied


@dataclass(frozen=True)
class VaultSinkClassification:
    matched: bool
    supported: bool
    sink_kind: str = ""
    handles: tuple[tuple[str, str], ...] = ()
    audit_arguments: dict[str, Any] = field(default_factory=dict)
    target_hash: str = ""
    schema_fingerprint: str = ""
    target: str = ""
    error_code: str = "vault_sink_not_allowed"

    def handle_payload(self) -> list[dict[str, str]]:
        return [
            {"field": field_name, "handle": handle}
            for field_name, handle in self.handles
        ]


def _shell_classification(arguments: Mapping[str, Any]) -> VaultSinkClassification:
    secret_env = arguments.get("secret_env")
    secret_stdin = arguments.get("secret_stdin")
    has_secret_fields = secret_env is not None or secret_stdin is not None
    found_anywhere = _find_handles(arguments)
    if not has_secret_fields and not found_anywhere:
        return VaultSinkClassification(matched=False, supported=False)
    if str(arguments.get("action") or "").strip().lower() != "run":
        return VaultSinkClassification(matched=True, supported=False)
    if bool(arguments.get("run_in_background")):
        return VaultSinkClassification(matched=True, supported=False)
    if secret_env is not None and secret_stdin is not None:
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code="vault_multiple_sink_kinds",
        )

    handles: list[tuple[str, str]] = []
    sink_kind = ""
    secret_fields: list[str] = []
    if secret_env is not None:
        if not isinstance(secret_env, Mapping) or not 1 <= len(secret_env) <= 32:
            return VaultSinkClassification(matched=True, supported=False)
        sink_kind = "shell_secret_env"
        for field_name, raw_handle in secret_env.items():
            if not isinstance(field_name, str) or _ENV_NAME_RE.fullmatch(field_name) is None:
                return VaultSinkClassification(matched=True, supported=False)
            handle = _extract_exact_handle(raw_handle)
            if not handle:
                return VaultSinkClassification(matched=True, supported=False)
            handles.append((field_name, handle))
            secret_fields.append(field_name)
    elif secret_stdin is not None:
        handle = _extract_exact_handle(secret_stdin)
        if not handle:
            return VaultSinkClassification(matched=True, supported=False)
        sink_kind = "shell_secret_stdin"
        handles.append(("stdin", handle))
        secret_fields.append("stdin")
    else:
        return VaultSinkClassification(matched=True, supported=False)

    public_arguments = {
        key: copy.deepcopy(value)
        for key, value in arguments.items()
        if key not in {"secret_env", "secret_stdin"}
    }
    if _find_handles(public_arguments):
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code="vault_handle_in_public_argument",
        )
    public_arguments["secret_fields"] = sorted(secret_fields)
    try:
        audit = _bounded_audit_arguments(public_arguments)
    except ValueError as exc:
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code=str(exc),
        )
    target = f"shell:{str(arguments.get('cwd') or 'workspace')}"
    return VaultSinkClassification(
        matched=True,
        supported=True,
        sink_kind=sink_kind,
        handles=tuple(handles),
        audit_arguments=audit,
        target_hash=_digest(
            {
                "command": str(arguments.get("command") or ""),
                "cwd": str(arguments.get("cwd") or ""),
                "secret_fields": sorted(secret_fields),
            }
        ),
        target=target,
    )


def _computer_classification(arguments: Mapping[str, Any]) -> VaultSinkClassification:
    found = _find_handles(arguments)
    if not found:
        return VaultSinkClassification(matched=False, supported=False)
    action = str(arguments.get("action") or "").strip().lower()
    action_payload: Mapping[str, Any] = arguments
    if isinstance(arguments.get("actions"), list):
        actions = arguments.get("actions") or []
        if len(actions) != 1 or not isinstance(actions[0], Mapping):
            return VaultSinkClassification(matched=True, supported=False)
        action_payload = actions[0]
        action = str(action_payload.get("type") or action_payload.get("action") or "").strip().lower()
    if action not in {"type", "type_text"}:
        return VaultSinkClassification(matched=True, supported=False)
    handle = _extract_exact_handle(action_payload.get("text"))
    if not handle or tuple(found) != (handle,):
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code="vault_computer_single_handle_required",
        )
    audit = {
        "action": "type",
        "character_count": None,
        "target": "focused_secure_field",
    }
    return VaultSinkClassification(
        matched=True,
        supported=True,
        sink_kind="computer_input",
        handles=(("text", handle),),
        audit_arguments=audit,
        target_hash=_digest(audit),
        target="focused secure input field",
    )


def _mcp_classification(
    arguments: Mapping[str, Any],
    tool_obj: Any,
    *,
    requested_tool_name: str,
) -> VaultSinkClassification:
    found = _find_handles(arguments)
    secret_fields = tuple(
        str(item)
        for item in (getattr(tool_obj, "_pupu_vault_secret_fields", ()) or ())
        if str(item)
    )
    if not found and not any(field in arguments for field in secret_fields):
        return VaultSinkClassification(matched=False, supported=False)
    if not secret_fields:
        return VaultSinkClassification(matched=bool(found), supported=False)
    resolved_tool_name = str(getattr(tool_obj, "name", "") or "").strip()
    if not resolved_tool_name or resolved_tool_name != requested_tool_name:
        return VaultSinkClassification(
            matched=bool(found) or any(field in arguments for field in secret_fields),
            supported=False,
            error_code="vault_mcp_tool_binding_mismatch",
        )
    handles: list[tuple[str, str]] = []
    public_arguments = copy.deepcopy(dict(arguments))
    for field_name in secret_fields:
        if field_name not in arguments:
            continue
        handle = _extract_exact_handle(arguments.get(field_name))
        if not handle:
            if _find_handles(arguments.get(field_name)):
                return VaultSinkClassification(matched=True, supported=False)
            continue
        handles.append((field_name, handle))
        public_arguments.pop(field_name, None)
    if not handles:
        return VaultSinkClassification(matched=bool(found), supported=False)
    if set(_find_handles(arguments)) != {handle for _field, handle in handles}:
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code="vault_handle_in_public_argument",
        )
    if _find_handles(public_arguments):
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code="vault_handle_in_public_argument",
        )
    toolkit_id = str(getattr(tool_obj, "_pupu_vault_mcp_toolkit_id", "") or "")
    schema_fingerprint = str(
        getattr(tool_obj, "_pupu_vault_schema_fingerprint", "") or ""
    )
    if not toolkit_id or not re.fullmatch(r"mcp\.[A-Za-z0-9._:-]{1,250}", toolkit_id):
        return VaultSinkClassification(matched=True, supported=False)
    if not re.fullmatch(r"[0-9a-f]{64}", schema_fingerprint):
        return VaultSinkClassification(matched=True, supported=False)
    public_arguments["secret_fields"] = sorted(field for field, _handle in handles)
    public_arguments["toolkit_id"] = toolkit_id
    # Electron needs the exact tool route to execute the approved MCP sink.
    # Bind only the name that was resolved from the current runtime toolkit;
    # never trust a model-supplied name independently of ``tool_obj``.
    public_arguments["tool_name"] = resolved_tool_name
    try:
        audit = _bounded_audit_arguments(public_arguments)
    except ValueError as exc:
        return VaultSinkClassification(
            matched=True,
            supported=False,
            error_code=str(exc),
        )
    target = f"{toolkit_id}:{resolved_tool_name}"
    return VaultSinkClassification(
        matched=True,
        supported=True,
        sink_kind="mcp_schema_secret",
        handles=tuple(handles),
        audit_arguments=audit,
        target_hash=_digest(
            {
                "toolkit_id": toolkit_id,
                "tool_name": resolved_tool_name,
                "secret_fields": sorted(field for field, _handle in handles),
                "public_arguments": public_arguments,
            }
        ),
        schema_fingerprint=schema_fingerprint,
        target=target,
    )


def classify_vault_tool_call(
    *,
    tool_name: str,
    arguments: Any,
    tool_obj: Any = None,
) -> VaultSinkClassification:
    normalized_name = str(tool_name or "").strip()
    safe_arguments = arguments if isinstance(arguments, Mapping) else {}
    if normalized_name == "shell":
        return _shell_classification(safe_arguments)
    if normalized_name == "computer":
        return _computer_classification(safe_arguments)
    mcp = _mcp_classification(
        safe_arguments,
        tool_obj,
        requested_tool_name=normalized_name,
    )
    if mcp.matched:
        return mcp
    if _find_handles(arguments):
        return VaultSinkClassification(matched=True, supported=False)
    return VaultSinkClassification(matched=False, supported=False)


def _context_tool(context: Any, tool_name: str) -> Any:
    toolkit = getattr(context, "toolkit", None)
    get_tool = getattr(toolkit, "get", None)
    return get_tool(tool_name) if callable(get_tool) else None


def _interaction_id(context: Any) -> str:
    raw_event = getattr(context, "raw_event", {})
    request = raw_event.get("interaction_request") if isinstance(raw_event, dict) else None
    if not isinstance(request, Mapping):
        return ""
    for key in ("interaction_id", "confirmation_id", "id"):
        value = request.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _response_from_context(context: Any) -> Any:
    raw_event = getattr(context, "raw_event", {})
    if isinstance(raw_event, dict) and "interaction_response" in raw_event:
        return raw_event.get("interaction_response")
    return None


def _contains_value(value: Any, key: str, expected: str, *, _depth: int = 0) -> bool:
    if _depth > 12:
        return False
    if isinstance(value, Mapping):
        if value.get(key) == expected:
            return True
        return any(
            _contains_value(item, key, expected, _depth=_depth + 1)
            for item in value.values()
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(
            _contains_value(item, key, expected, _depth=_depth + 1)
            for item in value
        )
    return False


@dataclass
class VaultSinkRuntimePlugin:
    client: VaultSinkClient
    owner_chat_id: str
    session_id: str
    attempt_id: str
    root_run_only: bool = True
    _prepared: dict[str, dict[str, Any]] = field(default_factory=dict, init=False, repr=False)
    _bound_toolkit_ids: tuple[int, ...] = field(default_factory=tuple, init=False, repr=False)
    _mounted: bool = field(default=False, init=False, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, init=False, repr=False)

    def __post_init__(self) -> None:
        self.owner_chat_id = _required_identifier(self.owner_chat_id, "owner_chat_id")
        self.session_id = _required_identifier(self.session_id, "session_id")
        self.attempt_id = _required_identifier(self.attempt_id, "attempt_id")

    def _classification(self, tool_call: Any, context: Any) -> VaultSinkClassification:
        name = str(getattr(tool_call, "name", "") or "")
        if name == SYNTHETIC_TOOL_NAME:
            return VaultSinkClassification(matched=True, supported=False)
        classification = classify_vault_tool_call(
            tool_name=name,
            arguments=getattr(tool_call, "arguments", None),
            tool_obj=_context_tool(context, name),
        )
        if name in _SUBAGENT_BOUNDARY_TOOL_NAMES and classification.matched:
            return VaultSinkClassification(
                matched=True,
                supported=False,
                error_code=VAULT_SUBAGENT_BOUNDARY_ERROR,
            )
        return classification

    @property
    def is_mounted(self) -> bool:
        with self._lock:
            return self._mounted

    def bind_augmented_toolkits(self, toolkits: Sequence[Any]) -> None:
        toolkit_ids = tuple(id(toolkit) for toolkit in toolkits or ())
        if not toolkit_ids:
            raise ValueError("vault_augmented_toolkits_required")
        with self._lock:
            if self._mounted and self._bound_toolkit_ids == toolkit_ids:
                return
            if self._mounted:
                raise ValueError("vault_plugin_already_mounted")
            if self._bound_toolkit_ids and self._bound_toolkit_ids != toolkit_ids:
                raise ValueError("vault_plugin_toolkit_binding_mismatch")
            self._bound_toolkit_ids = toolkit_ids

    def mark_mounted(self) -> None:
        with self._lock:
            if not self._bound_toolkit_ids:
                raise ValueError("vault_plugin_toolkit_binding_required")
            self._mounted = True

    def can_handle(self, *, tool_call: Any, context: Any) -> bool:
        name = str(getattr(tool_call, "name", "") or "")
        if name == SYNTHETIC_TOOL_NAME:
            return True
        return self._classification(tool_call, context).matched

    def _identity(
        self,
        tool_call: Any,
        context: Any,
        classification: VaultSinkClassification,
    ) -> dict[str, Any]:
        context_session = str(getattr(context, "session_id", "") or "").strip()
        if context_session != self.session_id:
            raise ValueError("vault_binding_mismatch")
        run_id = _required_identifier(getattr(context, "run_id", ""), "run_id")
        call_id = _required_identifier(getattr(tool_call, "call_id", ""), "call_id")
        payload = {
            "version": SCHEMA_VERSION,
            "owner_chat_id": self.owner_chat_id,
            "session_id": self.session_id,
            "attempt_id": self.attempt_id,
            "run_id": run_id,
            "call_id": call_id,
            "sink_kind": classification.sink_kind,
            "handles": classification.handle_payload(),
            "audit_arguments": _bounded_audit_arguments(
                classification.audit_arguments
            ),
            "target_hash": classification.target_hash,
            "schema_fingerprint": classification.schema_fingerprint,
        }
        operation_seed = _digest(payload)
        payload["operation_id"] = f"vault_prepare_{operation_seed}"
        return payload

    @staticmethod
    def _cache_key(identity: Mapping[str, Any]) -> str:
        return _digest(identity)

    def _prepare(
        self,
        tool_call: Any,
        context: Any,
        classification: VaultSinkClassification,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        identity = self._identity(tool_call, context, classification)
        key = self._cache_key(identity)
        with self._lock:
            cached = self._prepared.get(key)
        if cached is not None:
            return identity, copy.deepcopy(cached)
        receipt = self.client.prepare_intent(identity)
        intent_id = str(receipt.get("intent_id") or "").strip()
        status = str(receipt.get("status") or "").strip().lower()
        descriptor = receipt.get("descriptor")
        if (
            _INTENT_RE.fullmatch(intent_id) is None
            or status not in {"pending_confirmation", "approved"}
            or not isinstance(descriptor, Mapping)
        ):
            raise VaultSinkClientError("vault_broker_invalid_response")
        safe_receipt = {
            "intent_id": intent_id,
            "status": status,
            "descriptor": {
                "label": str(descriptor.get("label") or "Secret"),
                "sink_kind": str(descriptor.get("sink_kind") or classification.sink_kind),
                "target": str(descriptor.get("target") or classification.target),
            },
            "expires_at": receipt.get("expires_at"),
        }
        with self._lock:
            while len(self._prepared) >= 256:
                self._prepared.pop(next(iter(self._prepared)))
            self._prepared[key] = copy.deepcopy(safe_receipt)
        return identity, safe_receipt

    def prepare_durable_confirmation(
        self,
        *,
        tool_call: Any,
        context: Any,
    ) -> dict[str, Any] | None:
        classification = self._classification(tool_call, context)
        if not classification.supported:
            return None
        try:
            identity, receipt = self._prepare(tool_call, context, classification)
        except (VaultSinkClientError, ValueError):
            return None
        if Tool is None or Toolkit is None or prepare_tool_confirmation is None:
            return None
        descriptor = receipt["descriptor"]
        vault_use_binding = {
            "intent_id": receipt["intent_id"],
            "operation_id": identity["operation_id"],
            "owner_chat_id": identity["owner_chat_id"],
            "session_id": identity["session_id"],
            "attempt_id": identity["attempt_id"],
            "run_id": identity["run_id"],
            "call_id": identity["call_id"],
        }

        def _unreachable(**_kwargs: Any) -> dict[str, Any]:
            return {"error": "vault_runtime_plugin_required"}

        synthetic_tool = Tool(
            name=SYNTHETIC_TOOL_NAME,
            description=(
                "Allow one use of an encrypted secret in the selected controlled sink."
            ),
            func=_unreachable,
            parameters=[
                ToolParameter(
                    name="vault_intent_id",
                    description="Opaque one-use Vault intent.",
                    type_="string",
                    required=True,
                )
            ],
            requires_confirmation=True,
            confirmation_resolver=lambda _arguments, _execution_context: {
                "requires_confirmation": True,
                "description": (
                    f"Use {descriptor['label']} once with "
                    f"{descriptor['sink_kind']} for {descriptor['target']}."
                ),
                "interact_config": {
                    "vault_intent_id": receipt["intent_id"],
                    "vault_sink_kind": classification.sink_kind,
                    "vault_use": copy.deepcopy(vault_use_binding),
                },
            },
        )
        toolkit = Toolkit()
        toolkit.register(synthetic_tool)
        synthetic_call = ToolCall(
            call_id=str(getattr(tool_call, "call_id", "") or ""),
            name=SYNTHETIC_TOOL_NAME,
            arguments={
                "vault_intent_id": receipt["intent_id"],
                "sink_kind": classification.sink_kind,
                "target": descriptor["target"],
                "vault_use": copy.deepcopy(vault_use_binding),
            },
        )
        execution_context = ToolExecutionContext(
            session_id=self.session_id,
            run_id=str(getattr(context, "run_id", "") or ""),
            provider=str(getattr(context, "provider", "") or ""),
            model=str(getattr(context, "model", "") or ""),
            iteration=int(getattr(context, "iteration", 0) or 0),
            memory_namespace=str(getattr(context, "memory_namespace", "") or ""),
            tool_name=SYNTHETIC_TOOL_NAME,
            call_id=synthetic_call.call_id,
            turn_id=(
                f"{getattr(context, 'run_id', '')}:turn-"
                f"{int(getattr(context, 'iteration', 0) or 0)}"
            ),
        )
        preparation = prepare_tool_confirmation(
            toolkit=toolkit,
            tool_call=synthetic_call,
            execution_context=execution_context,
            execution_guard=getattr(context, "execution_guard", None),
        )
        return {
            "tool_call": synthetic_call,
            "toolkit": toolkit,
            "preparation": preparation,
            "runtime_context": context,
            "extra_subject": {
                "vault_intent_id": receipt["intent_id"],
                "vault_binding_hash": _digest(identity),
                "outer_tool_name": str(getattr(tool_call, "name", "") or ""),
                "outer_call_id": synthetic_call.call_id,
            },
        }

    def durable_runtime_manifest(
        self,
        *,
        tool_call: Any,
        context: Any,
    ) -> dict[str, Any]:
        name = str(getattr(tool_call, "name", "") or "")
        if name == SYNTHETIC_TOOL_NAME:
            arguments = getattr(tool_call, "arguments", {})
            intent_id = (
                str(arguments.get("vault_intent_id") or "")
                if isinstance(arguments, Mapping)
                else ""
            )
            return {
                "handler": "pupu_vault_sink",
                "protocol_version": SCHEMA_VERSION,
                "terminal_handler": True,
                "intent_id": intent_id,
            }
        classification = self._classification(tool_call, context)
        manifest = {
            "handler": "pupu_vault_sink",
            "protocol_version": SCHEMA_VERSION,
            "terminal_handler": True,
            "supported": classification.supported,
            "sink_kind": classification.sink_kind,
            "binding_digest": _digest(
                {
                    "owner_chat_id": self.owner_chat_id,
                    "session_id": self.session_id,
                    "attempt_id": self.attempt_id,
                    "run_id": str(getattr(context, "run_id", "") or ""),
                    "call_id": str(getattr(tool_call, "call_id", "") or ""),
                    "tool_name": name,
                    "arguments": getattr(tool_call, "arguments", {}),
                }
            ),
        }
        return manifest

    def execute(self, *, tool_call: Any, context: Any) -> Any:
        if ToolRuntimeOutcome is None:
            raise RuntimeError("vault runtime requires Unchain")
        classification = self._classification(tool_call, context)
        if not classification.supported:
            if classification.error_code == VAULT_SUBAGENT_BOUNDARY_ERROR:
                return _vault_boundary_rejection()
            return ToolRuntimeOutcome(
                handled=True,
                tool_result={
                    "ok": False,
                    "error": classification.error_code or "vault_sink_not_allowed",
                    "tool": str(getattr(tool_call, "name", "") or ""),
                },
                should_observe=False,
            )
        try:
            identity, receipt = self._prepare(tool_call, context, classification)
            intent_id = receipt["intent_id"]
            interaction_id = _interaction_id(context)
            response_raw = _response_from_context(context)
            raw_request = getattr(context, "raw_event", {}).get("interaction_request")
            if (
                not interaction_id
                or response_raw is None
                or not _contains_value(raw_request, "vault_intent_id", intent_id)
            ):
                raise VaultSinkClientError("vault_confirmation_required")
            response = ToolConfirmationResponse.from_raw(response_raw)
            if response.modified_arguments is not None:
                raise VaultSinkClientError("vault_modified_arguments_rejected")
            if not response.approved:
                cancel_payload = {
                    "version": SCHEMA_VERSION,
                    "operation_id": "vault_cancel_" + _digest(
                        {
                            "intent_id": intent_id,
                            "interaction_id": interaction_id,
                            "reason": "user_denied",
                        }
                    ),
                    "intent_id": intent_id,
                    "owner_chat_id": identity["owner_chat_id"],
                    "session_id": identity["session_id"],
                    "attempt_id": identity["attempt_id"],
                    "run_id": identity["run_id"],
                    "call_id": identity["call_id"],
                    "interaction_id": interaction_id,
                    "reason_code": "user_denied",
                }
                try:
                    self.client.cancel_intent(cancel_payload)
                except VaultSinkClientError:
                    pass
                return ToolRuntimeOutcome(
                    handled=True,
                    tool_result={
                        "ok": False,
                        "denied": True,
                        "error": "vault_use_denied",
                        "tool": str(getattr(tool_call, "name", "") or ""),
                    },
                    should_observe=False,
                )
            execute_payload = {
                **identity,
                "operation_id": "vault_execute_" + _digest(
                    {
                        "intent_id": intent_id,
                        "interaction_id": interaction_id,
                        "binding": identity,
                    }
                ),
                "intent_id": intent_id,
                "interaction_id": interaction_id,
            }
            result = self.client.execute_intent(execute_payload)
            status = str(result.get("status") or "").strip().lower()
            receipt_id = str(result.get("receipt_id") or "").strip()
            if status != "complete" or _RECEIPT_RE.fullmatch(receipt_id) is None:
                raise VaultSinkClientError("vault_broker_invalid_response")
            safe_result = result.get("result")
            if safe_result is not None and not isinstance(safe_result, Mapping):
                raise VaultSinkClientError("vault_broker_invalid_response")
            if _find_handles(safe_result):
                raise VaultSinkClientError("vault_result_redacted")
            return ToolRuntimeOutcome(
                handled=True,
                tool_result={
                    "ok": True,
                    "status": "complete",
                    "vault_intent_id": intent_id,
                    "receipt_id": receipt_id,
                    "sink_kind": classification.sink_kind,
                    "result": copy.deepcopy(dict(safe_result or {})),
                    "replayed": result.get("replayed") is True,
                },
                should_observe=False,
            )
        except (VaultSinkClientError, ValueError) as exc:
            code = str(getattr(exc, "code", "") or str(exc) or "vault_execution_failed")
            if not re.fullmatch(r"vault_[a-z0-9_]{1,80}", code):
                code = "vault_execution_failed"
            return ToolRuntimeOutcome(
                handled=True,
                tool_result={
                    "ok": False,
                    "error": code,
                    "tool": str(getattr(tool_call, "name", "") or ""),
                },
                should_observe=False,
            )


@dataclass(frozen=True)
class VaultSinkAgentModule:
    plugin: VaultSinkRuntimePlugin
    name: str = field(default="pupu_vault_sink", init=False)

    def configure(self, builder: Any) -> None:
        builder.add_tool_runtime_plugin(self.plugin)
        self.plugin.mark_mounted()


def clone_toolkits_for_vault(toolkits: Sequence[Any]) -> list[Any]:
    """Clone only the root tool exposure surface for one Vault-enabled run.

    Toolkits used to materialize subagents remain untouched.  Functions and
    immutable metadata keep their identity, while every tools mapping, Tool,
    parameter list, and parameter object that Vault augmentation mutates is
    independent from the baseline surface.
    """

    cloned_toolkits: list[Any] = []
    for toolkit in toolkits or ():
        cloned_toolkit = copy.copy(toolkit)
        tools = getattr(toolkit, "tools", None)
        if not isinstance(tools, Mapping):
            cloned_toolkits.append(cloned_toolkit)
            continue
        cloned_tools: dict[str, Any] = {}
        for tool_key, tool_obj in tools.items():
            cloned_tool = copy.copy(tool_obj)
            if hasattr(tool_obj, "parameters"):
                cloned_tool.parameters = copy.deepcopy(
                    list(getattr(tool_obj, "parameters", ()) or ())
                )
            cloned_tools[str(tool_key)] = cloned_tool
        cloned_toolkit.tools = cloned_tools
        cloned_toolkits.append(cloned_toolkit)
    return cloned_toolkits


class _VaultSubagentBoundaryViolation(RuntimeError):
    pass


def _find_boundary_handles(
    value: Any,
    *,
    _depth: int = 0,
    _seen: set[int] | None = None,
) -> tuple[str, ...]:
    """Recursively find handles in child-bound or child-originated payloads."""

    if _depth > 16:
        return ()
    seen = _seen if _seen is not None else set()
    if isinstance(value, str):
        return tuple(dict.fromkeys(re.findall(r"pvh1_[0-9a-f]{64}", value)))
    if isinstance(value, (bytes, bytearray)):
        return tuple(
            match.decode("ascii")
            for match in dict.fromkeys(
                re.findall(rb"pvh1_[0-9a-f]{64}", bytes(value))
            )
        )
    if value is None or isinstance(value, (bool, int, float)):
        return ()
    identity = id(value)
    if identity in seen:
        return ()
    seen.add(identity)
    found: list[str] = []
    if isinstance(value, Mapping):
        for key, item in value.items():
            found.extend(
                _find_boundary_handles(key, _depth=_depth + 1, _seen=seen)
            )
            found.extend(
                _find_boundary_handles(item, _depth=_depth + 1, _seen=seen)
            )
    elif isinstance(value, Sequence):
        for item in value:
            found.extend(
                _find_boundary_handles(item, _depth=_depth + 1, _seen=seen)
            )
    elif is_dataclass(value) and not isinstance(value, type):
        for data_field in fields(value):
            found.extend(
                _find_boundary_handles(
                    getattr(value, data_field.name, None),
                    _depth=_depth + 1,
                    _seen=seen,
                )
            )
    else:
        attributes = getattr(value, "__dict__", None)
        if isinstance(attributes, Mapping):
            found.extend(
                _find_boundary_handles(
                    attributes,
                    _depth=_depth + 1,
                    _seen=seen,
                )
            )
        slots = getattr(type(value), "__slots__", ())
        if isinstance(slots, str):
            slots = (slots,)
        for slot in slots if isinstance(slots, Sequence) else ():
            if not isinstance(slot, str) or slot.startswith("__"):
                continue
            found.extend(
                _find_boundary_handles(
                    getattr(value, slot, None),
                    _depth=_depth + 1,
                    _seen=seen,
                )
            )
    return tuple(dict.fromkeys(found))


def _vault_boundary_rejection() -> Any:
    if ToolRuntimeOutcome is None:
        raise RuntimeError("vault runtime requires Unchain")
    return ToolRuntimeOutcome(
        handled=True,
        tool_result={
            "ok": False,
            "error": VAULT_SUBAGENT_BOUNDARY_ERROR,
        },
        result_messages=[],
        state_updates={},
        should_observe=False,
    )


class _VaultGuardedContext:
    def __init__(self, context: Any, guarded_callback: Any) -> None:
        self._context = context
        self._guarded_callback = guarded_callback

    @property
    def callback(self) -> Any:
        return self._guarded_callback

    def latest_messages(self) -> Any:
        return self._context.latest_messages()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._context, name)


@dataclass(frozen=True)
class VaultGuardedSubagentRuntimePlugin:
    inner_plugin: Any

    def can_handle(self, *, tool_call: Any, context: Any) -> bool:
        can_handle = getattr(self.inner_plugin, "can_handle", None)
        return bool(
            callable(can_handle)
            and can_handle(tool_call=tool_call, context=context)
        )

    @staticmethod
    def _handoff_carries_context(tool_call: Any) -> bool:
        name = str(getattr(tool_call, "name", "") or "")
        if name not in {
            "handoff_to_subagent",
            "return_handoff_to_subagent",
        }:
            return False
        arguments = getattr(tool_call, "arguments", {})
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except (TypeError, ValueError):
                arguments = {}
        return not isinstance(arguments, Mapping) or bool(
            arguments.get("carry_context", True)
        )

    def execute(self, *, tool_call: Any, context: Any) -> Any:
        if _find_boundary_handles(getattr(tool_call, "arguments", None)):
            return _vault_boundary_rejection()
        if self._handoff_carries_context(tool_call):
            try:
                carried_messages = context.latest_messages()
            except Exception:
                return _vault_boundary_rejection()
            if _find_boundary_handles(carried_messages):
                return _vault_boundary_rejection()

        boundary_blocked = False
        original_callback = getattr(context, "callback", None)

        def guarded_callback(event: Any) -> Any:
            nonlocal boundary_blocked
            if _find_boundary_handles(event):
                boundary_blocked = True
                raise _VaultSubagentBoundaryViolation(
                    VAULT_SUBAGENT_BOUNDARY_ERROR
                )
            if callable(original_callback):
                return original_callback(event)
            return None

        guarded_context = _VaultGuardedContext(context, guarded_callback)
        execute = getattr(self.inner_plugin, "execute", None)
        if not callable(execute):
            return _vault_boundary_rejection()
        try:
            outcome = execute(tool_call=tool_call, context=guarded_context)
        except _VaultSubagentBoundaryViolation:
            return _vault_boundary_rejection()
        if boundary_blocked or _find_boundary_handles(
            {
                "tool_result": getattr(outcome, "tool_result", None),
                "result_messages": getattr(outcome, "result_messages", None),
                "state_updates": getattr(outcome, "state_updates", None),
                "suspend_override": getattr(outcome, "suspend_override", None),
            }
        ):
            return _vault_boundary_rejection()
        return outcome


class _VaultSubagentBuilderProxy:
    def __init__(self, builder: Any) -> None:
        self._builder = builder

    def add_tool_runtime_plugin(self, plugin: Any) -> None:
        self._builder.add_tool_runtime_plugin(
            VaultGuardedSubagentRuntimePlugin(plugin)
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._builder, name)


@dataclass(frozen=True)
class VaultGuardedSubagentModule:
    inner_module: Any
    name: str = field(default="subagents", init=False)

    def configure(self, builder: Any) -> None:
        self.inner_module.configure(_VaultSubagentBuilderProxy(builder))


def augment_toolkits_for_vault(
    toolkits: Sequence[Any],
    plugin: VaultSinkRuntimePlugin,
) -> list[Any]:
    """Add handle-only schema affordances and divert their base confirmation.

    This mutates only the per-run toolkit instances that are about to be
    flattened into the root agent.  Calls without handles retain their exact
    original schema and confirmation resolver behavior.
    """

    if ToolParameter is None:
        raise RuntimeError("vault runtime requires Unchain")
    plugin.bind_augmented_toolkits(toolkits)
    for toolkit in toolkits or ():
        tools = getattr(toolkit, "tools", None)
        if not isinstance(tools, Mapping):
            continue
        for tool_obj in tools.values():
            bound_plugin = getattr(tool_obj, "_pupu_vault_plugin", None)
            if bound_plugin is not None and bound_plugin is not plugin:
                raise ValueError("vault_tool_already_bound_to_another_plugin")
    for toolkit in toolkits or ():
        tools = getattr(toolkit, "tools", None)
        if not isinstance(tools, Mapping):
            continue
        for tool_obj in tools.values():
            name = str(getattr(tool_obj, "name", "") or "")
            original_func = getattr(tool_obj, "func", None)
            if (
                callable(original_func)
                and not getattr(tool_obj, "_pupu_vault_func_guarded", False)
            ):

                @functools.wraps(original_func)
                def guarded_func(
                    *args: Any,
                    _original_func=original_func,
                    **kwargs: Any,
                ) -> Any:
                    if _find_handles(args) or _find_handles(kwargs):
                        return {
                            "ok": False,
                            "error": "vault_subagent_or_runtime_plugin_required",
                        }
                    return _original_func(*args, **kwargs)

                bound_owner = getattr(original_func, "__self__", None)
                if bound_owner is not None:
                    guarded_func.__self__ = bound_owner
                tool_obj.func = guarded_func
                tool_obj._pupu_vault_func_guarded = True
            if name == "shell":
                parameter_names = {
                    str(getattr(parameter, "name", "") or "")
                    for parameter in (getattr(tool_obj, "parameters", ()) or ())
                }
                if "secret_env" not in parameter_names:
                    tool_obj.parameters.append(
                        ToolParameter(
                            name="secret_env",
                            description=(
                                "Optional mapping of environment-variable name to "
                                "opaque <secret-handle>; never put a handle in command."
                            ),
                            type_="object",
                            required=False,
                        )
                    )
                if "secret_stdin" not in parameter_names:
                    tool_obj.parameters.append(
                        ToolParameter(
                            name="secret_stdin",
                            description=(
                                "Optional opaque <secret-handle> written once to stdin."
                            ),
                            type_="string",
                            required=False,
                        )
                    )

            original_resolver = getattr(tool_obj, "confirmation_resolver", None)
            if getattr(tool_obj, "_pupu_vault_resolver_wrapped", False):
                continue

            def resolver(
                arguments: dict[str, Any],
                execution_context: Any,
                *,
                _tool=tool_obj,
                _name=name,
                _original=original_resolver,
            ) -> Any:
                classification = classify_vault_tool_call(
                    tool_name=_name,
                    arguments=arguments,
                    tool_obj=_tool,
                )
                if (
                    classification.matched
                    and classification.supported
                    and plugin.is_mounted
                ):
                    # Suppress the original confirmation only so the runtime
                    # plugin can create the stronger intent-bound confirmation.
                    # The plugin remains the terminal handler even if broker
                    # preparation fails, so no original effect can run.
                    return {"requires_confirmation": False}
                if callable(_original):
                    return _original(arguments, execution_context)
                return None

            tool_obj.confirmation_resolver = resolver
            tool_obj._pupu_vault_resolver_wrapped = True
            tool_obj._pupu_vault_plugin = plugin
    return list(toolkits or ())


__all__ = [
    "VaultSinkAgentModule",
    "VaultSinkClassification",
    "VaultGuardedSubagentModule",
    "VaultGuardedSubagentRuntimePlugin",
    "VaultSinkRuntimePlugin",
    "VAULT_SUBAGENT_BOUNDARY_ERROR",
    "augment_toolkits_for_vault",
    "classify_vault_tool_call",
    "clone_toolkits_for_vault",
]
