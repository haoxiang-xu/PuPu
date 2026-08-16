from __future__ import annotations

import copy
import hashlib
import inspect
import json
import os
import re
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from context_composition_host import (
    AVAILABILITY_OPTION as _CONTEXT_COMPOSITION_AVAILABILITY_OPTION,
    PRIVATE_HINT_OPTION as _CONTEXT_COMPOSITION_PRIVATE_OPTION,
    canonical_private_context_composition_hint_bytes as _context_composition_private_bytes,
    context_composition_availability as _context_composition_availability,
    normalize_context_composition_availability as _normalize_context_composition_availability,
    normalize_private_context_composition_hint as _normalize_context_composition_private_hint,
)


_CONTEXT_SCHEMA_VERSION = 2
_CONTEXT_DIRECTORY = "durable_interactions"
_GRAPH_STEP_CONTEXT_SCHEMA_VERSION = 1
_GRAPH_STEP_CONTEXT_REVISION = 1
_GRAPH_STEP_CONTEXT_DIRECTORY = "durable_graph_step_resumes"
_ATTEMPT_BINDING_SCHEMA_VERSION = 1
_ATTEMPT_BINDING_DIRECTORY = "execution_attempt_bindings"

_GRAPH_STEP_CONTEXT_RECORD_KEYS = frozenset(
    {
        "schema_version",
        "resume_kind",
        "revision",
        "operation_id",
        "payload_sha256",
        "created_at_ms",
        "session_id",
        "owner_chat_id",
        "graph_execution_id",
        "coordinator_attempt_id",
        "graph_plan_id",
        "graph_scope_id",
        "topology_sha256",
        "step_index",
        "node_id",
        "step_attempt_id",
        "predecessor_attempt_id",
        "provider",
        "model",
        "configuration_sha256",
        "recipe_identity",
        "canonical_build_fingerprint",
        "coordinator_binding_snapshot",
        "options",
    }
)
_GRAPH_COORDINATOR_BINDING_KEYS = frozenset(
    {
        "schema",
        "owner_chat_id",
        "session_id",
        "generation_id",
        "head_revision",
        "identity",
        "grant",
        "current_input_draft",
    }
)
_GRAPH_COORDINATOR_IDENTITY_KEYS = frozenset(
    {
        "execution_id",
        "attempt_id",
        "run_id",
        "root_run_id",
        "parent_run_id",
        "run_lineage",
    }
)
_GRAPH_COORDINATOR_GRANT_KEYS = frozenset(
    {
        "module_key",
        "capabilities",
        "delegable_capabilities",
        "authority",
    }
)
_GRAPH_COORDINATOR_BINDING_SCHEMA = "pupu.memory-v2-run-binding.v2"
_MEMORY_V2_MODULE_KEY = "memory_v2"
_MEMORY_EXECUTION_COMPLETE = "memory.execution.complete"
_GRAPH_RECIPE_IDENTITY_KEYS = frozenset(
    {"name", "source", "revision", "version", "sha256"}
)
_GRAPH_SECRET_HANDLE_MARKER_RE = re.compile(
    r'<secret-handle label="(?P<label>[^"\r\n]{1,512})" '
    r'handle="(?P<handle>pvh1_[0-9a-f]{64})"/>'
)

# Resume state is deliberately an allowlist.  The route accepts arbitrary JSON
# options, so trying to identify secrets by name is not a safe persistence
# boundary.  Only values that are required to rebuild the same PuPu agent are
# eligible for disk storage; credentials are supplied again by the renderer.
_STABLE_RESUME_OPTION_KEYS = frozenset(
    {
        "agentInstructions",
        "agentOrchestrationMode",
        "agent_instructions",
        "agent_orchestration",
        "agent_orchestration_mode",
        "contextOptimizer",
        "context_optimizer",
        "_context_composition_hint_v1",
        # Custom-provider definition (design §7). Safe to persist: the def
        # carries NO api key (the key rides the specialised custom_provider_api_key
        # field and is re-supplied by the renderer via _FRESH_SECRET_OPTION_KEYS).
        # Without this a durable resume of a custom-provider session lost the cfg
        # and rebuilt a BUILT-IN agent pointed at the official endpoint (defect
        # C6): ollama twin → localhost:11434, openai twin → api.openai.com,
        # hyperspace twin → whitelist fallback to env keys.
        "custom_provider",
        "disableWorkspaceRoot",
        "disable_workspace_root",
        "durable_interactions_required",
        "enableTools",
        "enable_tools",
        "maxIterations",
        "maxTokens",
        "max_iterations",
        "memory_embedding_model",
        "memory_embedding_provider",
        "memory_enabled",
        "memory_last_n_turns",
        "memory_long_term_enabled",
        "memory_long_term_episode_min_score",
        "memory_long_term_episode_top_k",
        "memory_long_term_extract_every_n_turns",
        "memory_long_term_max_episode_items",
        "memory_long_term_max_fact_items",
        "memory_long_term_max_playbook_items",
        "memory_long_term_min_score",
        "memory_long_term_playbook_min_score",
        "memory_long_term_playbook_top_k",
        "memory_long_term_top_k",
        "memory_long_term_vector_min_score",
        "memory_long_term_vector_top_k",
        "memory_namespace",
        "memory_vector_min_score",
        "memory_vector_top_k",
        "model",
        "modelId",
        "model_id",
        "_memory_v2_owner_chat_id",
        "optimizer",
        "provider",
        "recipe_name",
        "systemPromptV2",
        "system_prompt_v2",
        "temperature",
        "toolkits",
        "trace_level",
        "workspaceRoot",
        "workspace_root",
        "workspace_roots",
    }
)

# These are the only credential fields consumed by the PuPu Unchain adapter.
# Keeping the overlay exact (rather than recursive/suffix based) prevents an
# arbitrary option such as ``github_token`` or ``database_url`` from becoming
# a persistence or replay channel.
_FRESH_SECRET_OPTION_KEYS = frozenset(
    {
        "anthropicApiKey",
        "anthropic_api_key",
        "apiKey",
        "api_key",
        # Custom-provider key (decision A8). Like every other credential it is
        # NEVER written to disk — the renderer re-supplies it on resume and this
        # overlay re-injects it so the rebuilt custom agent can authenticate to
        # the user's endpoint (defect C6).
        "customProviderApiKey",
        "custom_provider_api_key",
        "openaiApiKey",
        "openai_api_key",
        "unchainApiKey",
        "unchain_api_key",
    }
)


class DurableInteractionHostError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 409,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = str(code or "durable_interaction_failed")
        self.status_code = int(status_code)
        self.retryable = bool(retryable)


@dataclass(frozen=True, slots=True)
class DurableInteractionReceiptHandoff:
    """Internal, digest-validated handoff for one persisted UI response.

    The public confirmation route deliberately returns only receipt identity.
    Live callbacks receive this separate value so Context V2 can project the
    exact response that won the durable receipt CAS without trusting the HTTP
    request a second time.
    """

    session_id: str
    receipt_json: str = field(repr=False)

    def __post_init__(self) -> None:
        normalized_session_id = _required_identifier(
            self.session_id,
            field_name="session_id",
        )
        if not isinstance(self.receipt_json, str) or not self.receipt_json:
            raise TypeError("receipt_json must be non-empty text")
        self._load_receipt()
        object.__setattr__(self, "session_id", normalized_session_id)

    @classmethod
    def from_persisted_receipt(
        cls,
        *,
        session_id: str,
        receipt: Any,
    ) -> "DurableInteractionReceiptHandoff":
        from unchain.interaction.durable import InteractionReceipt

        bound_receipt = InteractionReceipt.from_dict(receipt)
        return cls(
            session_id=session_id,
            receipt_json=json.dumps(
                bound_receipt.to_dict(),
                ensure_ascii=False,
                allow_nan=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
        )

    def _load_receipt(self):
        from unchain.interaction.durable import InteractionReceipt

        try:
            raw_receipt = json.loads(self.receipt_json)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise DurableInteractionHostError(
                "interaction_receipt_integrity_error",
                "Durable interaction receipt handoff is invalid",
                status_code=500,
            ) from exc
        try:
            return InteractionReceipt.from_dict(raw_receipt)
        except Exception as exc:
            raise DurableInteractionHostError(
                "interaction_receipt_integrity_error",
                "Durable interaction receipt handoff failed integrity validation",
                status_code=500,
            ) from exc

    @property
    def receipt_id(self) -> str:
        return self._load_receipt().receipt_id

    @property
    def interaction_id(self) -> str:
        return self._load_receipt().interaction_id

    @property
    def submitted_by(self) -> str:
        return self._load_receipt().submitted_by

    @property
    def response(self) -> Any:
        return copy.deepcopy(self._load_receipt().response)


class DurableInteractionReceiptResult(dict):
    """Public receipt metadata plus an out-of-band internal handoff."""

    def __init__(
        self,
        public_result: dict[str, Any],
        *,
        handoff: DurableInteractionReceiptHandoff,
    ) -> None:
        if not isinstance(public_result, dict):
            raise TypeError("public_result must be a dict")
        if not isinstance(handoff, DurableInteractionReceiptHandoff):
            raise TypeError("handoff must be a durable interaction receipt handoff")
        if (
            str(public_result.get("session_id") or "").strip()
            != handoff.session_id
            or str(public_result.get("interaction_id") or "").strip()
            != handoff.interaction_id
            or str(public_result.get("receipt_id") or "").strip()
            != handoff.receipt_id
        ):
            raise DurableInteractionHostError(
                "interaction_receipt_integrity_error",
                "Public receipt metadata does not match its internal handoff",
                status_code=500,
            )
        super().__init__(copy.deepcopy(public_result))
        self._handoff = handoff

    @property
    def handoff(self) -> DurableInteractionReceiptHandoff:
        return self._handoff


def interaction_receipt_handoff(
    value: Any,
) -> DurableInteractionReceiptHandoff | None:
    """Return the non-serializable handoff carried by a local receipt result."""

    if not isinstance(value, DurableInteractionReceiptResult):
        return None
    return value.handoff


def _normalized_data_dir() -> Path:
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw:
        raise DurableInteractionHostError(
            "durable_store_unavailable",
            "UNCHAIN_DATA_DIR is not configured",
            status_code=503,
        )
    return Path(raw).expanduser().resolve()


def _required_identifier(value: str, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise DurableInteractionHostError(
            f"invalid_{field_name}",
            f"{field_name} is required",
            status_code=400,
        )
    return normalized


def _identifier_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _context_path(
    session_id: str,
    run_id: str,
    *,
    create_directory: bool = False,
) -> Path:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_run_id = _required_identifier(run_id, field_name="run_id")
    root = _normalized_data_dir() / _CONTEXT_DIRECTORY
    directory = root / _identifier_digest(normalized_session_id)[:32]
    if create_directory:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            os.chmod(root, 0o700)
            os.chmod(directory, 0o700)
    return directory / f"{_identifier_digest(normalized_run_id)}.json"


def _graph_step_context_path(
    session_id: str,
    step_attempt_id: str,
    *,
    create_directory: bool = False,
) -> Path:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_step_attempt_id = _required_identifier(
        step_attempt_id,
        field_name="step_attempt_id",
    )
    root = _normalized_data_dir() / _GRAPH_STEP_CONTEXT_DIRECTORY
    directory = root / _identifier_digest(normalized_session_id)[:32]
    if create_directory:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            os.chmod(root, 0o700)
            os.chmod(directory, 0o700)
    return directory / f"{_identifier_digest(normalized_step_attempt_id)}.json"


def _attempt_binding_path(
    session_id: str,
    attempt_id: str,
    *,
    create_directory: bool = False,
) -> Path:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_attempt_id = _required_identifier(
        attempt_id,
        field_name="attempt_id",
    )
    root = _normalized_data_dir() / _ATTEMPT_BINDING_DIRECTORY
    directory = root / _identifier_digest(normalized_session_id)[:32]
    if create_directory:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            os.chmod(root, 0o700)
            os.chmod(directory, 0o700)
    return directory / f"{_identifier_digest(normalized_attempt_id)}.json"


@contextmanager
def _exclusive_file_lock(path: Path) -> Iterator[None]:
    file_descriptor = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if os.name != "nt":
            os.chmod(path, 0o600)
        if os.name == "nt":  # pragma: no cover - Windows deployment guard
            import msvcrt

            if os.fstat(file_descriptor).st_size == 0:
                os.write(file_descriptor, b"\0")
                os.fsync(file_descriptor)
            os.lseek(file_descriptor, 0, os.SEEK_SET)
            msvcrt.locking(file_descriptor, msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                os.lseek(file_descriptor, 0, os.SEEK_SET)
                msvcrt.locking(file_descriptor, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(file_descriptor, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(file_descriptor, fcntl.LOCK_UN)
    finally:
        os.close(file_descriptor)


def _write_json_atomically(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    try:
        file_descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
            directory_descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _json_safe(inner)
            for key, inner in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if value is None or isinstance(value, (bool, int, float, str)):
        return copy.deepcopy(value)
    return str(value)


def _stable_resume_options(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    stable: dict[str, Any] = {}
    for key in _STABLE_RESUME_OPTION_KEYS:
        if key not in value:
            continue
        if key == _CONTEXT_COMPOSITION_PRIVATE_OPTION:
            try:
                stable[key] = _normalize_context_composition_private_hint(
                    value[key]
                )
            except ValueError:
                # Composition is optional.  An invalid private value is never
                # made durable, but it cannot block the base resume record.
                continue
        else:
            stable[key] = _json_safe(value[key])
    return stable


def _resolve_context_composition_resume_authority(
    *,
    stable_options: dict[str, Any],
    fresh_options: dict[str, Any] | None,
) -> dict[str, Any]:
    resolved = copy.deepcopy(stable_options)
    fresh = fresh_options if isinstance(fresh_options, dict) else {}
    incoming_availability = _normalize_context_composition_availability(
        fresh.get(_CONTEXT_COMPOSITION_AVAILABILITY_OPTION)
    )
    if incoming_availability is not None:
        resolved[_CONTEXT_COMPOSITION_AVAILABILITY_OPTION] = (
            incoming_availability
        )
        return resolved

    baseline_present = _CONTEXT_COMPOSITION_PRIVATE_OPTION in stable_options
    declaration_present = _CONTEXT_COMPOSITION_PRIVATE_OPTION in fresh
    baseline = None
    if baseline_present:
        try:
            baseline = _normalize_context_composition_private_hint(
                stable_options[_CONTEXT_COMPOSITION_PRIVATE_OPTION]
            )
        except ValueError:
            resolved.pop(_CONTEXT_COMPOSITION_PRIVATE_OPTION, None)
            resolved[_CONTEXT_COMPOSITION_AVAILABILITY_OPTION] = (
                _context_composition_availability("resume_hint_invalid")
            )
            return resolved
    if not declaration_present:
        if baseline is not None:
            resolved[_CONTEXT_COMPOSITION_PRIVATE_OPTION] = baseline
        return resolved
    try:
        declaration = _normalize_context_composition_private_hint(
            fresh[_CONTEXT_COMPOSITION_PRIVATE_OPTION]
        )
    except ValueError:
        resolved[_CONTEXT_COMPOSITION_AVAILABILITY_OPTION] = (
            _context_composition_availability("resume_hint_invalid")
        )
        return resolved
    if baseline is None:
        resolved.pop(_CONTEXT_COMPOSITION_PRIVATE_OPTION, None)
        resolved[_CONTEXT_COMPOSITION_AVAILABILITY_OPTION] = (
            _context_composition_availability("resume_hint_no_baseline")
        )
        return resolved
    if _context_composition_private_bytes(
        baseline
    ) != _context_composition_private_bytes(declaration):
        resolved[_CONTEXT_COMPOSITION_AVAILABILITY_OPTION] = (
            _context_composition_availability("resume_hint_mismatch")
        )
        return resolved
    resolved[_CONTEXT_COMPOSITION_PRIVATE_OPTION] = baseline
    return resolved


def _fresh_secret_overlay(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    overlay: dict[str, Any] = {}
    for key in _FRESH_SECRET_OPTION_KEYS:
        secret = value.get(key)
        if isinstance(secret, str) and secret.strip():
            overlay[key] = secret
    return overlay


def _required_graph_sha256(value: Any, *, field_name: str) -> str:
    normalized = str(value or "").strip().lower()
    if len(normalized) != 64 or any(
        character not in "0123456789abcdef" for character in normalized
    ):
        raise DurableInteractionHostError(
            f"invalid_{field_name}",
            f"{field_name} must be a lowercase sha256 hex digest",
            status_code=400,
        )
    return normalized


def _sanitize_graph_storage_value(
    value: Any,
    *,
    preserve_vault_handles: bool = False,
) -> Any:
    try:
        from memory_v2_sanitizer import sanitize_text, sanitize_value
    except ImportError as exc:  # pragma: no cover - packaged-runtime guard
        raise DurableInteractionHostError(
            "durable_graph_resume_sanitizer_unavailable",
            "Graph-step resume metadata sanitizer is unavailable",
            status_code=503,
        ) from exc
    try:
        storage_value = _json_safe(value)
        if not preserve_vault_handles:
            return sanitize_value(storage_value)

        replacements: dict[str, str] = {}
        placeholder_prefix = f"__PUPU_GRAPH_OPAQUE_REF_{uuid.uuid4().hex}_"

        def protect(inner: Any) -> Any:
            if isinstance(inner, dict):
                return {
                    key: protect(child)
                    for key, child in inner.items()
                }
            if isinstance(inner, list):
                return [protect(child) for child in inner]
            if not isinstance(inner, str):
                return inner

            def replace(match: re.Match[str]) -> str:
                placeholder = f"{placeholder_prefix}{len(replacements)}__"
                replacements[placeholder] = (
                    '<secret-handle label="'
                    + sanitize_text(match.group("label"))
                    + '" handle="'
                    + match.group("handle")
                    + '"/>'
                )
                return placeholder

            return _GRAPH_SECRET_HANDLE_MARKER_RE.sub(replace, inner)

        def restore(inner: Any) -> Any:
            if isinstance(inner, dict):
                return {
                    key: restore(child)
                    for key, child in inner.items()
                }
            if isinstance(inner, list):
                return [restore(child) for child in inner]
            if not isinstance(inner, str):
                return inner
            restored = inner
            for placeholder, marker in replacements.items():
                restored = restored.replace(placeholder, marker)
            return restored

        return restore(sanitize_value(protect(storage_value)))
    except Exception as exc:
        raise DurableInteractionHostError(
            "durable_graph_resume_sanitization_failed",
            "Graph-step resume metadata could not be sanitized",
        ) from exc


def _canonical_graph_json_bytes(
    value: Any,
    *,
    error_code: str,
    message: str,
) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as exc:
        raise DurableInteractionHostError(error_code, message) from exc


def _normalize_graph_recipe_identity(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        raw = {"name": value}
    elif isinstance(value, dict):
        raw = copy.deepcopy(value)
    else:
        raise DurableInteractionHostError(
            "invalid_recipe_identity",
            "recipe_identity must be text or an object",
            status_code=400,
        )
    if "name" not in raw or not set(raw).issubset(
        _GRAPH_RECIPE_IDENTITY_KEYS
    ):
        raise DurableInteractionHostError(
            "invalid_recipe_identity",
            "recipe_identity has unsupported fields",
            status_code=400,
        )
    normalized: dict[str, Any] = {}
    for key, item in raw.items():
        if key == "sha256":
            normalized[key] = _required_graph_sha256(
                item,
                field_name="recipe_identity_sha256",
            )
            continue
        if isinstance(item, bool) or not isinstance(item, (str, int)):
            raise DurableInteractionHostError(
                "invalid_recipe_identity",
                "recipe_identity fields must be text or integers",
                status_code=400,
            )
        normalized[key] = item
    normalized["name"] = _required_identifier(
        normalized.get("name"),
        field_name="recipe_identity_name",
    )
    sanitized = _sanitize_graph_storage_value(normalized)
    if not isinstance(sanitized, dict) or set(sanitized) != set(normalized):
        raise DurableInteractionHostError(
            "invalid_recipe_identity",
            "recipe_identity changed shape during sanitization",
            status_code=400,
        )
    return sanitized


def _normalize_graph_current_input_draft(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "root graph coordinator requires a current input draft",
            status_code=400,
        )
    kind = str(value.get("kind") or "").strip()
    if kind == "text":
        allowed = {"kind", "content", "message_index", "attachments"}
        required = {"kind", "content", "message_index"}
        if not required.issubset(value) or not set(value).issubset(allowed):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "text coordinator input has unsupported fields",
                status_code=400,
            )
        if not isinstance(value.get("content"), str):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "text coordinator input content must be text",
                status_code=400,
            )
        raw_content = value["content"]
        message_index = value.get("message_index")
        if (
            isinstance(message_index, bool)
            or not isinstance(message_index, int)
            or message_index < 0
        ):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "text coordinator input message_index is invalid",
                status_code=400,
            )
        attachments = value.get("attachments", [])
        if not isinstance(attachments, list) or len(attachments) > 32 or any(
            not isinstance(item, dict) for item in attachments
        ):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "text coordinator input attachments are invalid",
                status_code=400,
            )
    elif kind == "interaction":
        if set(value) != {
            "kind",
            "interaction_id",
            "response",
            "submitted_by",
        }:
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "interaction coordinator input has unsupported fields",
                status_code=400,
            )
        _required_identifier(
            value.get("interaction_id"),
            field_name="coordinator_interaction_id",
        )
        _required_identifier(
            value.get("submitted_by"),
            field_name="coordinator_submitted_by",
        )
    else:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator current input kind is invalid",
            status_code=400,
        )
    storage_value = copy.deepcopy(value)
    if kind == "text":
        # A canonical Vault marker is the durable, non-secret identity of the
        # input. Preserve it so a cold resume rebuilds the same attempt
        # operation ID; bare handles and all surrounding text are still
        # processed by the normal storage sanitizer.
        storage_value["content"] = ""
    sanitized = _sanitize_graph_storage_value(storage_value)
    if kind == "text":
        sanitized["content"] = _sanitize_graph_storage_value(
            raw_content,
            preserve_vault_handles=True,
        )
    if not isinstance(sanitized, dict) or set(sanitized) != set(value):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator current input changed shape during sanitization",
            status_code=400,
        )
    return sanitized


def _normalize_graph_coordinator_binding_snapshot(
    value: Any,
    *,
    owner_chat_id: str,
    graph_execution_id: str,
    session_id: str,
    coordinator_attempt_id: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator_binding_snapshot must be an object",
            status_code=400,
        )
    legacy_fields = {
        "execution_id",
        "attempt_id",
        "run_id",
        "root_run_id",
        "role",
        "source_attempt_id",
    }
    if set(value).intersection(legacy_fields):
        raise DurableInteractionHostError(
            "legacy_coordinator_binding_snapshot",
            "role-based coordinator binding snapshots cannot be resumed",
            status_code=409,
        )
    if set(value) != _GRAPH_COORDINATOR_BINDING_KEYS:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator_binding_snapshot has unsupported fields",
            status_code=400,
        )
    current_input_draft = copy.deepcopy(value["current_input_draft"])
    storage_value = copy.deepcopy(value)
    storage_value["current_input_draft"] = None
    normalized = _sanitize_graph_storage_value(storage_value)
    if not isinstance(normalized, dict) or set(normalized) != set(value):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator binding changed shape during sanitization",
            status_code=400,
        )
    if normalized.get("schema") != _GRAPH_COORDINATOR_BINDING_SCHEMA:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator binding schema is unsupported",
            status_code=400,
        )
    binding_fields = (
        "owner_chat_id",
        "session_id",
        "generation_id",
    )
    for field_name in binding_fields:
        if not isinstance(normalized.get(field_name), str):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                f"coordinator {field_name} must be text",
                status_code=400,
            )
        normalized[field_name] = _required_identifier(
            normalized.get(field_name),
            field_name=f"coordinator_{field_name}",
        )
    head_revision = normalized.get("head_revision")
    if (
        isinstance(head_revision, bool)
        or not isinstance(head_revision, int)
        or head_revision < 1
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator head_revision must be a positive integer",
            status_code=400,
        )

    identity = normalized.get("identity")
    if not isinstance(identity, dict) or set(identity) != (
        _GRAPH_COORDINATOR_IDENTITY_KEYS
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator identity has unsupported fields",
            status_code=400,
        )
    for field_name in (
        "execution_id",
        "attempt_id",
        "run_id",
        "root_run_id",
    ):
        if not isinstance(identity.get(field_name), str):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                f"coordinator identity {field_name} must be text",
                status_code=400,
            )
        identity[field_name] = _required_identifier(
            identity.get(field_name),
            field_name=f"coordinator_identity_{field_name}",
        )
    parent_run_id = identity.get("parent_run_id")
    if parent_run_id is not None:
        if not isinstance(parent_run_id, str):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "coordinator identity parent_run_id must be text or null",
                status_code=400,
            )
        identity["parent_run_id"] = _required_identifier(
            parent_run_id,
            field_name="coordinator_identity_parent_run_id",
        )
    lineage = identity.get("run_lineage")
    if (
        not isinstance(lineage, list)
        or not lineage
        or any(not isinstance(item, str) or not item.strip() for item in lineage)
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator identity run_lineage must contain run IDs",
            status_code=400,
        )
    normalized_lineage = [item.strip() for item in lineage]
    if len(normalized_lineage) != len(set(normalized_lineage)):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator identity run_lineage contains duplicate run IDs",
            status_code=400,
        )
    expected_parent_run_id = (
        normalized_lineage[-2] if len(normalized_lineage) > 1 else None
    )
    if (
        identity["attempt_id"] != identity["run_id"]
        or normalized_lineage[0] != identity["root_run_id"]
        or normalized_lineage[-1] != identity["run_id"]
        or identity["parent_run_id"] != expected_parent_run_id
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator identity lineage is inconsistent",
            status_code=400,
        )
    identity["run_lineage"] = normalized_lineage

    grant = normalized.get("grant")
    if not isinstance(grant, dict) or set(grant) != _GRAPH_COORDINATOR_GRANT_KEYS:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator grant has unsupported fields",
            status_code=400,
        )
    if not isinstance(grant.get("module_key"), str):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator grant module_key must be text",
            status_code=400,
        )
    grant["module_key"] = _required_identifier(
        grant.get("module_key"),
        field_name="coordinator_grant_module_key",
    )
    if grant["module_key"] != _MEMORY_V2_MODULE_KEY:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator grant belongs to another module",
            status_code=400,
        )
    for field_name in ("capabilities", "delegable_capabilities"):
        values = grant.get(field_name)
        if (
            not isinstance(values, list)
            or any(
                not isinstance(item, str) or not item.strip()
                for item in values
            )
        ):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                f"coordinator grant {field_name} must contain capabilities",
                status_code=400,
            )
        normalized_values = [item.strip() for item in values]
        if len(normalized_values) != len(set(normalized_values)):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                f"coordinator grant {field_name} contains duplicates",
                status_code=400,
            )
        grant[field_name] = sorted(normalized_values)
    if not set(grant["delegable_capabilities"]).issubset(
        grant["capabilities"]
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator delegable capabilities exceed its grant",
            status_code=400,
        )
    authority = grant.get("authority")
    if authority is not None:
        if not isinstance(authority, str):
            raise DurableInteractionHostError(
                "invalid_coordinator_binding_snapshot",
                "coordinator grant authority must be text or null",
                status_code=400,
            )
        grant["authority"] = _required_identifier(
            authority,
            field_name="coordinator_grant_authority",
        )
    completion_authorized = (
        _MEMORY_EXECUTION_COMPLETE in grant["capabilities"]
        and grant["authority"] is not None
    )
    if (
        _MEMORY_EXECUTION_COMPLETE in grant["capabilities"]
        and not completion_authorized
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator completion capability requires an authority",
            status_code=400,
        )

    expected_scope = (
        owner_chat_id,
        graph_execution_id,
        session_id,
        coordinator_attempt_id,
        coordinator_attempt_id,
    )
    actual_scope = (
        normalized["owner_chat_id"],
        identity["execution_id"],
        normalized["session_id"],
        identity["attempt_id"],
        identity["run_id"],
    )
    if actual_scope != expected_scope:
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "coordinator binding does not match the graph resume scope",
            status_code=400,
        )
    if current_input_draft is not None:
        normalized["current_input_draft"] = (
            _normalize_graph_current_input_draft(
                current_input_draft
            )
        )
    if (
        identity["parent_run_id"] is not None
        and current_input_draft is not None
        and not completion_authorized
    ):
        raise DurableInteractionHostError(
            "invalid_coordinator_binding_snapshot",
            "a nested coordinator requires authority to own current input",
            status_code=400,
        )
    return normalized


def _normalize_graph_stable_options(value: Any) -> dict[str, Any]:
    stable = _stable_resume_options(value)
    sanitized = _sanitize_graph_storage_value(stable)
    if not isinstance(sanitized, dict) or not set(sanitized).issubset(
        _STABLE_RESUME_OPTION_KEYS
    ):
        raise DurableInteractionHostError(
            "invalid_graph_resume_options",
            "graph resume options changed shape during sanitization",
            status_code=400,
        )
    _canonical_graph_json_bytes(
        sanitized,
        error_code="invalid_graph_resume_options",
        message="Graph resume options are not canonical JSON",
    )
    return sanitized


def save_resume_context(
    *,
    session_id: str,
    run_id: str,
    options: dict[str, Any],
    provider: str,
    model: str,
) -> dict[str, Any]:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_run_id = _required_identifier(run_id, field_name="run_id")
    path = _context_path(
        normalized_session_id,
        normalized_run_id,
        create_directory=True,
    )
    payload = {
        "schema_version": _CONTEXT_SCHEMA_VERSION,
        "session_id": normalized_session_id,
        "run_id": normalized_run_id,
        "provider": str(provider or "").strip(),
        "model": str(model or "").strip(),
        "options": _stable_resume_options(options),
        "updated_at_ms": int(time.time() * 1000),
    }
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        file_descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
        )
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
            directory_descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            # The atomic replace is the durability boundary.  Failure to
            # remove a leftover temp file must not mask the original write
            # result (or replace a more useful write exception).
            pass
    return copy.deepcopy(payload)


def load_resume_context(session_id: str, run_id: str) -> dict[str, Any] | None:
    path = _context_path(session_id, run_id)
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DurableInteractionHostError(
            "durable_resume_context_corrupt",
            f"Durable resume context is corrupt: {exc}",
        ) from exc
    if not isinstance(raw, dict) or raw.get("schema_version") != _CONTEXT_SCHEMA_VERSION:
        raise DurableInteractionHostError(
            "durable_resume_context_incompatible",
            "Durable resume context has an unsupported schema",
        )
    normalized_session_id = str(session_id or "").strip()
    if raw.get("session_id") != normalized_session_id:
        raise DurableInteractionHostError(
            "durable_resume_context_mismatch",
            "Durable resume context belongs to another session",
        )
    normalized_run_id = str(run_id or "").strip()
    if raw.get("run_id") != normalized_run_id:
        raise DurableInteractionHostError(
            "durable_resume_context_mismatch",
            "Durable resume context belongs to another run",
        )
    options = raw.get("options")
    if not isinstance(options, dict):
        raise DurableInteractionHostError(
            "durable_resume_context_corrupt",
            "Durable resume context options must be an object",
        )
    return copy.deepcopy(raw)


def clear_resume_context(session_id: str, run_id: str) -> bool:
    try:
        path = _context_path(session_id, run_id)
        existed = path.exists()
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()
        except OSError:
            pass
        return existed
    except (DurableInteractionHostError, OSError):
        return False


def _graph_step_context_semantic_payload(
    *,
    session_id: str,
    step_attempt_id: str,
    operation_id: str,
    owner_chat_id: str,
    graph_execution_id: str,
    coordinator_attempt_id: str,
    graph_plan_id: str,
    graph_scope_id: str,
    topology_sha256: str,
    step_index: int,
    node_id: str,
    predecessor_attempt_id: str,
    provider: str,
    model: str,
    configuration_sha256: str,
    recipe_identity: Any,
    canonical_build_fingerprint: str,
    coordinator_binding_snapshot: Any,
    options: Any,
) -> dict[str, Any]:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_graph_execution_id = _required_identifier(
        graph_execution_id,
        field_name="graph_execution_id",
    )
    if normalized_graph_execution_id != normalized_session_id:
        raise DurableInteractionHostError(
            "invalid_graph_execution_id",
            "graph_execution_id must equal the durable interaction session_id",
            status_code=400,
        )
    normalized_owner_chat_id = _required_identifier(
        owner_chat_id,
        field_name="owner_chat_id",
    )
    normalized_coordinator_attempt_id = _required_identifier(
        coordinator_attempt_id,
        field_name="coordinator_attempt_id",
    )
    normalized_step_attempt_id = _required_identifier(
        step_attempt_id,
        field_name="step_attempt_id",
    )
    if normalized_step_attempt_id == normalized_coordinator_attempt_id:
        raise DurableInteractionHostError(
            "invalid_step_attempt_id",
            "graph step attempt must differ from its coordinator",
            status_code=400,
        )
    if (
        isinstance(step_index, bool)
        or not isinstance(step_index, int)
        or step_index < 0
    ):
        raise DurableInteractionHostError(
            "invalid_step_index",
            "step_index must be a non-negative integer",
            status_code=400,
        )
    normalized_provider = _required_identifier(
        provider,
        field_name="provider",
    ).casefold()
    normalized_model = _required_identifier(model, field_name="model")
    normalized_binding = _normalize_graph_coordinator_binding_snapshot(
        coordinator_binding_snapshot,
        owner_chat_id=normalized_owner_chat_id,
        graph_execution_id=normalized_graph_execution_id,
        session_id=normalized_session_id,
        coordinator_attempt_id=normalized_coordinator_attempt_id,
    )
    payload = {
        "schema_version": _GRAPH_STEP_CONTEXT_SCHEMA_VERSION,
        "resume_kind": "graph_step",
        "revision": _GRAPH_STEP_CONTEXT_REVISION,
        "operation_id": _required_identifier(
            operation_id,
            field_name="operation_id",
        ),
        "session_id": normalized_session_id,
        "owner_chat_id": normalized_owner_chat_id,
        "graph_execution_id": normalized_graph_execution_id,
        "coordinator_attempt_id": normalized_coordinator_attempt_id,
        "graph_plan_id": _required_identifier(
            graph_plan_id,
            field_name="graph_plan_id",
        ),
        "graph_scope_id": _required_identifier(
            graph_scope_id,
            field_name="graph_scope_id",
        ),
        "topology_sha256": _required_graph_sha256(
            topology_sha256,
            field_name="topology_sha256",
        ),
        "step_index": step_index,
        "node_id": _required_identifier(node_id, field_name="node_id"),
        "step_attempt_id": normalized_step_attempt_id,
        "predecessor_attempt_id": _required_identifier(
            predecessor_attempt_id,
            field_name="predecessor_attempt_id",
        ),
        "provider": normalized_provider,
        "model": normalized_model,
        "configuration_sha256": _required_graph_sha256(
            configuration_sha256,
            field_name="configuration_sha256",
        ),
        "recipe_identity": _normalize_graph_recipe_identity(recipe_identity),
        "canonical_build_fingerprint": _required_graph_sha256(
            canonical_build_fingerprint,
            field_name="canonical_build_fingerprint",
        ),
        "coordinator_binding_snapshot": normalized_binding,
        "options": _normalize_graph_stable_options(options),
    }
    _canonical_graph_json_bytes(
        payload,
        error_code="invalid_graph_resume_context",
        message="Graph-step resume metadata is not canonical JSON",
    )
    return payload


def _graph_step_context_payload_sha256(payload: dict[str, Any]) -> str:
    return hashlib.sha256(
        _canonical_graph_json_bytes(
            payload,
            error_code="durable_graph_resume_context_corrupt",
            message="Graph-step resume metadata is not canonical JSON",
        )
    ).hexdigest()


def _validate_graph_step_context_record(
    raw: Any,
    *,
    expected_session_id: str,
    expected_step_attempt_id: str,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata must be an object",
        )
    if raw.get("schema_version") != _GRAPH_STEP_CONTEXT_SCHEMA_VERSION:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_incompatible",
            "Graph-step resume metadata has an unsupported schema",
        )
    if set(raw) != _GRAPH_STEP_CONTEXT_RECORD_KEYS:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata has unexpected fields",
        )
    created_at_ms = raw.get("created_at_ms")
    if (
        isinstance(created_at_ms, bool)
        or not isinstance(created_at_ms, int)
        or created_at_ms < 1
    ):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata has an invalid creation time",
        )
    try:
        semantic = _graph_step_context_semantic_payload(
            session_id=raw.get("session_id"),
            step_attempt_id=raw.get("step_attempt_id"),
            operation_id=raw.get("operation_id"),
            owner_chat_id=raw.get("owner_chat_id"),
            graph_execution_id=raw.get("graph_execution_id"),
            coordinator_attempt_id=raw.get("coordinator_attempt_id"),
            graph_plan_id=raw.get("graph_plan_id"),
            graph_scope_id=raw.get("graph_scope_id"),
            topology_sha256=raw.get("topology_sha256"),
            step_index=raw.get("step_index"),
            node_id=raw.get("node_id"),
            predecessor_attempt_id=raw.get("predecessor_attempt_id"),
            provider=raw.get("provider"),
            model=raw.get("model"),
            configuration_sha256=raw.get("configuration_sha256"),
            recipe_identity=raw.get("recipe_identity"),
            canonical_build_fingerprint=raw.get(
                "canonical_build_fingerprint"
            ),
            coordinator_binding_snapshot=raw.get(
                "coordinator_binding_snapshot"
            ),
            options=raw.get("options"),
        )
    except DurableInteractionHostError as exc:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata failed structural validation",
        ) from exc
    persisted_semantic = {
        key: copy.deepcopy(value)
        for key, value in raw.items()
        if key not in {"payload_sha256", "created_at_ms"}
    }
    if semantic != persisted_semantic:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata changed after normalization",
        )
    try:
        payload_sha256 = _required_graph_sha256(
            raw.get("payload_sha256"),
            field_name="payload_sha256",
        )
    except DurableInteractionHostError as exc:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata has an invalid payload hash",
        ) from exc
    if payload_sha256 != _graph_step_context_payload_sha256(semantic):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume metadata payload hash does not match",
        )
    if (
        semantic["session_id"] != expected_session_id
        or semantic["graph_execution_id"] != expected_session_id
        or semantic["step_attempt_id"] != expected_step_attempt_id
    ):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_mismatch",
            "Graph-step resume metadata belongs to another execution or step",
        )
    return copy.deepcopy(raw)


def _read_graph_step_context_path(
    path: Path,
    *,
    expected_session_id: str,
    expected_step_attempt_id: str,
) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            f"Graph-step resume metadata is corrupt: {exc}",
        ) from exc
    return _validate_graph_step_context_record(
        raw,
        expected_session_id=expected_session_id,
        expected_step_attempt_id=expected_step_attempt_id,
    )


def save_graph_step_resume_context(
    *,
    session_id: str,
    step_attempt_id: str,
    operation_id: str,
    owner_chat_id: str,
    graph_execution_id: str,
    coordinator_attempt_id: str,
    graph_plan_id: str,
    graph_scope_id: str,
    topology_sha256: str,
    step_index: int,
    node_id: str,
    predecessor_attempt_id: str,
    provider: str,
    model: str,
    configuration_sha256: str,
    recipe_identity: Any,
    canonical_build_fingerprint: str,
    coordinator_binding_snapshot: Any,
    options: dict[str, Any],
    expected_revision: int = 0,
) -> dict[str, Any]:
    """Create one immutable graph-step resume locator with CAS semantics."""

    if expected_revision != 0 or isinstance(expected_revision, bool):
        raise DurableInteractionHostError(
            "durable_graph_resume_revision_conflict",
            "Immutable graph-step resume metadata requires expected_revision=0",
        )
    semantic = _graph_step_context_semantic_payload(
        session_id=session_id,
        step_attempt_id=step_attempt_id,
        operation_id=operation_id,
        owner_chat_id=owner_chat_id,
        graph_execution_id=graph_execution_id,
        coordinator_attempt_id=coordinator_attempt_id,
        graph_plan_id=graph_plan_id,
        graph_scope_id=graph_scope_id,
        topology_sha256=topology_sha256,
        step_index=step_index,
        node_id=node_id,
        predecessor_attempt_id=predecessor_attempt_id,
        provider=provider,
        model=model,
        configuration_sha256=configuration_sha256,
        recipe_identity=recipe_identity,
        canonical_build_fingerprint=canonical_build_fingerprint,
        coordinator_binding_snapshot=coordinator_binding_snapshot,
        options=options,
    )
    normalized_session_id = semantic["session_id"]
    normalized_step_attempt_id = semantic["step_attempt_id"]
    payload_sha256 = _graph_step_context_payload_sha256(semantic)
    path = _graph_step_context_path(
        normalized_session_id,
        normalized_step_attempt_id,
        create_directory=True,
    )
    lock_path = path.with_name(f".{path.name}.lock")
    with _exclusive_file_lock(lock_path):
        existing = _read_graph_step_context_path(
            path,
            expected_session_id=normalized_session_id,
            expected_step_attempt_id=normalized_step_attempt_id,
        )
        if existing is not None:
            existing_semantic = {
                key: copy.deepcopy(value)
                for key, value in existing.items()
                if key not in {"payload_sha256", "created_at_ms"}
            }
            if (
                existing.get("payload_sha256") == payload_sha256
                and existing_semantic == semantic
            ):
                return copy.deepcopy(existing)
            raise DurableInteractionHostError(
                "durable_graph_resume_context_conflict",
                "Graph-step resume metadata is already bound to another payload",
            )
        record = {
            **semantic,
            "payload_sha256": payload_sha256,
            "created_at_ms": int(time.time() * 1000),
        }
        _write_json_atomically(path, record)
        verified = _read_graph_step_context_path(
            path,
            expected_session_id=normalized_session_id,
            expected_step_attempt_id=normalized_step_attempt_id,
        )
        if verified is None or verified.get("payload_sha256") != payload_sha256:
            raise DurableInteractionHostError(
                "durable_graph_resume_context_write_failed",
                "Graph-step resume metadata write verification failed",
            )
        return verified


def load_graph_step_resume_context(
    session_id: str,
    step_attempt_id: str,
    *,
    expected_owner_chat_id: str,
    expected_provider: str,
    expected_model: str,
) -> dict[str, Any] | None:
    """Load one graph-step locator only for its exact host/model subject."""

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_step_attempt_id = _required_identifier(
        step_attempt_id,
        field_name="step_attempt_id",
    )
    normalized_owner_chat_id = _required_identifier(
        expected_owner_chat_id,
        field_name="expected_owner_chat_id",
    )
    normalized_provider = _required_identifier(
        expected_provider,
        field_name="expected_provider",
    ).casefold()
    normalized_model = _required_identifier(
        expected_model,
        field_name="expected_model",
    )
    record = _read_graph_step_context_path(
        _graph_step_context_path(
            normalized_session_id,
            normalized_step_attempt_id,
        ),
        expected_session_id=normalized_session_id,
        expected_step_attempt_id=normalized_step_attempt_id,
    )
    if record is None:
        return None
    if (
        record.get("owner_chat_id") != normalized_owner_chat_id
        or record.get("provider") != normalized_provider
        or record.get("model") != normalized_model
    ):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_subject_mismatch",
            "Graph-step resume metadata does not match its owner/provider/model",
        )
    return record


def clear_graph_step_resume_context(
    session_id: str,
    step_attempt_id: str,
    *,
    expected_payload_sha256: str,
) -> bool:
    """CAS-delete one immutable graph-step locator after terminal completion."""

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_step_attempt_id = _required_identifier(
        step_attempt_id,
        field_name="step_attempt_id",
    )
    normalized_payload_sha256 = _required_graph_sha256(
        expected_payload_sha256,
        field_name="expected_payload_sha256",
    )
    path = _graph_step_context_path(
        normalized_session_id,
        normalized_step_attempt_id,
    )
    if not path.exists():
        return False
    lock_path = path.with_name(f".{path.name}.lock")
    with _exclusive_file_lock(lock_path):
        current = _read_graph_step_context_path(
            path,
            expected_session_id=normalized_session_id,
            expected_step_attempt_id=normalized_step_attempt_id,
        )
        if current is None:
            return False
        if current.get("payload_sha256") != normalized_payload_sha256:
            raise DurableInteractionHostError(
                "durable_graph_resume_context_conflict",
                "Graph-step resume metadata changed before deletion",
            )
        try:
            path.unlink()
            if os.name != "nt":
                directory_descriptor = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_descriptor)
                finally:
                    os.close(directory_descriptor)
        except OSError as exc:
            raise DurableInteractionHostError(
                "durable_graph_resume_context_delete_failed",
                f"Graph-step resume metadata could not be deleted: {exc}",
            ) from exc
    return True


def _read_attempt_binding_path(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DurableInteractionHostError(
            "execution_attempt_binding_corrupt",
            f"Execution attempt binding is corrupt: {exc}",
        ) from exc
    if (
        not isinstance(raw, dict)
        or raw.get("schema_version") != _ATTEMPT_BINDING_SCHEMA_VERSION
    ):
        raise DurableInteractionHostError(
            "execution_attempt_binding_incompatible",
            "Execution attempt binding has an unsupported schema",
        )
    for field_name in ("session_id", "attempt_id", "source_attempt_id"):
        if not isinstance(raw.get(field_name), str) or not raw[field_name].strip():
            raise DurableInteractionHostError(
                "execution_attempt_binding_corrupt",
                f"Execution attempt binding has no valid {field_name}",
            )
    return raw


def bind_execution_attempt(
    *,
    session_id: str,
    attempt_id: str,
    source_attempt_id: str,
) -> dict[str, Any]:
    """Persist the exact resume-attempt -> checkpoint-owner relationship.

    The record is immutable.  Concurrent callers may repeat the same binding,
    but a later attempt to point the same execution at another checkpoint fails
    closed instead of cancelling unrelated work.
    """

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_attempt_id = _required_identifier(
        attempt_id,
        field_name="attempt_id",
    )
    normalized_source_attempt_id = _required_identifier(
        source_attempt_id,
        field_name="source_attempt_id",
    )
    path = _attempt_binding_path(
        normalized_session_id,
        normalized_attempt_id,
        create_directory=True,
    )
    lock_path = path.with_name(f".{path.name}.lock")
    with _exclusive_file_lock(lock_path):
        current = _read_attempt_binding_path(path)
        if current is not None:
            if (
                current.get("session_id") != normalized_session_id
                or current.get("attempt_id") != normalized_attempt_id
            ):
                raise DurableInteractionHostError(
                    "execution_attempt_binding_mismatch",
                    "Execution attempt binding identity does not match its path",
                )
            if current.get("source_attempt_id") != normalized_source_attempt_id:
                raise DurableInteractionHostError(
                    "execution_attempt_binding_conflict",
                    "Execution attempt is already bound to another checkpoint owner",
                    status_code=409,
                )
            result = copy.deepcopy(current)
        else:
            payload = {
                "schema_version": _ATTEMPT_BINDING_SCHEMA_VERSION,
                "session_id": normalized_session_id,
                "attempt_id": normalized_attempt_id,
                "source_attempt_id": normalized_source_attempt_id,
                "created_at_ms": int(time.time() * 1000),
            }
            _write_json_atomically(path, payload)
            result = copy.deepcopy(payload)

    # Close cancel-before-bind and cancel-vs-bind races.  The binding itself is
    # the durable hand-off point; once visible, a previously persisted cancel
    # must be replayed against the parent checkpoint even after process restart.
    if (
        _execution_control_status(
            normalized_session_id,
            normalized_attempt_id,
        )
        == "cancelled"
        or _load_execution_cancellation(
            normalized_session_id,
            normalized_attempt_id,
        )
        is not None
    ):
        _reconcile_cancelled_attempt(
            session_id=normalized_session_id,
            attempt_id=normalized_attempt_id,
            source_attempt_id=normalized_source_attempt_id,
            reason="reconciled cancellation after attempt binding",
        )
    return result


def load_execution_attempt_binding(
    session_id: str,
    attempt_id: str,
) -> dict[str, Any] | None:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_attempt_id = _required_identifier(
        attempt_id,
        field_name="attempt_id",
    )
    path = _attempt_binding_path(normalized_session_id, normalized_attempt_id)
    binding = _read_attempt_binding_path(path)
    if binding is None:
        return None
    if (
        binding.get("session_id") != normalized_session_id
        or binding.get("attempt_id") != normalized_attempt_id
    ):
        raise DurableInteractionHostError(
            "execution_attempt_binding_mismatch",
            "Execution attempt binding identity does not match its path",
        )
    return copy.deepcopy(binding)


def _bindings_for_source_attempt(
    session_id: str,
    source_attempt_id: str,
) -> tuple[dict[str, Any], ...]:
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_source_attempt_id = _required_identifier(
        source_attempt_id,
        field_name="source_attempt_id",
    )
    directory = _attempt_binding_path(
        normalized_session_id,
        "directory-probe",
    ).parent
    if not directory.exists():
        return ()
    matches: list[dict[str, Any]] = []
    for path in directory.glob("*.json"):
        binding = _read_attempt_binding_path(path)
        if binding is None:
            continue
        if binding.get("session_id") != normalized_session_id:
            raise DurableInteractionHostError(
                "execution_attempt_binding_mismatch",
                "Execution attempt binding belongs to another session",
            )
        if binding.get("source_attempt_id") == normalized_source_attempt_id:
            matches.append(copy.deepcopy(binding))
    return tuple(matches)


def clear_execution_attempt_binding(session_id: str, attempt_id: str) -> bool:
    try:
        path = _attempt_binding_path(session_id, attempt_id)
        existed = path.exists()
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()
        except OSError:
            pass
        return existed
    except (DurableInteractionHostError, OSError):
        return False


def resolve_resume_options(
    *,
    session_id: str,
    run_id: str,
    fresh_options: dict[str, Any] | None,
    expected_provider: str = "",
    expected_model: str = "",
) -> dict[str, Any]:
    context = load_resume_context(session_id, run_id)
    if context is None:
        raise DurableInteractionHostError(
            "durable_resume_context_missing",
            "No durable resume context was recorded for this session",
        )
    stable_options = context.get("options")
    if not isinstance(stable_options, dict):
        raise DurableInteractionHostError(
            "durable_resume_context_corrupt",
            "Durable resume context options must be an object",
        )
    context_provider = str(context.get("provider") or "").strip()
    context_model = str(context.get("model") or "").strip()
    if (
        expected_provider
        and context_provider != str(expected_provider).strip()
    ) or (expected_model and context_model != str(expected_model).strip()):
        raise DurableInteractionHostError(
            "durable_resume_context_subject_mismatch",
            "Durable resume context provider/model does not match the request",
        )
    resolved = _resolve_context_composition_resume_authority(
        stable_options=stable_options,
        fresh_options=fresh_options,
    )
    resolved.update(_fresh_secret_overlay(fresh_options or {}))
    # C6: for a custom-provider resume, keep the original ``custom.<slug>:<model>``
    # addressing intact. The persisted context provider/model are the twin
    # (e.g. "openai" / "hyperspace"), and forcing modelId to the twin form here
    # would strip the custom prefix — the adapter would then rebuild a built-in
    # agent instead of resolving the custom cfg. When the stable options carry a
    # custom_provider def AND a custom modelId, the adapter's custom override
    # path (_custom_override_from_model_id) reconstructs the twin from the cfg,
    # so we must NOT clobber it.
    stable_model_id = resolved.get("modelId")
    is_custom_resume = (
        isinstance(resolved.get("custom_provider"), dict)
        and isinstance(stable_model_id, str)
        and stable_model_id.strip().startswith("custom.")
    )
    if context_provider and context_model and not is_custom_resume:
        resolved.update(
            {
                "modelId": f"{context_provider}:{context_model}",
                "provider": context_provider,
                "model": context_model,
            }
        )
    return resolved


def resolve_graph_step_resume_options(
    *,
    session_id: str,
    step_attempt_id: str,
    owner_chat_id: str,
    fresh_options: dict[str, Any] | None,
    expected_provider: str,
    expected_model: str,
) -> dict[str, Any]:
    """Rebuild one graph step from immutable metadata plus fresh credentials."""

    context = load_graph_step_resume_context(
        session_id,
        step_attempt_id,
        expected_owner_chat_id=owner_chat_id,
        expected_provider=expected_provider,
        expected_model=expected_model,
    )
    if context is None:
        raise DurableInteractionHostError(
            "durable_graph_resume_context_missing",
            "No graph-step resume metadata was recorded for this interaction",
        )
    stable_options = context.get("options")
    if not isinstance(stable_options, dict):
        raise DurableInteractionHostError(
            "durable_graph_resume_context_corrupt",
            "Graph-step resume options must be an object",
        )
    resolved = _resolve_context_composition_resume_authority(
        stable_options=stable_options,
        fresh_options=fresh_options,
    )
    resolved.update(_fresh_secret_overlay(fresh_options or {}))
    # The locator subject identifies the suspended step, while these options
    # rebuild the whole recipe graph.  Preserve the graph's original base
    # model; forcing modelId to the step model would change every node that
    # inherits the recipe default and make a legitimate cold resume drift.
    return resolved


def _session_store():
    try:
        from memory_factory import _build_session_store
        return _build_session_store(str(_normalized_data_dir()))
    except ImportError as exc:  # pragma: no cover - deployment compatibility guard
        raise DurableInteractionHostError(
            "durable_runtime_unavailable",
            "Installed Unchain does not provide durable session storage",
            status_code=503,
        ) from exc


def _interaction_runtime():
    try:
        from unchain.interaction.runtime import DurableInteractionRuntime
        from unchain.memory import KernelMemoryRuntime
    except ImportError as exc:  # pragma: no cover - deployment compatibility guard
        raise DurableInteractionHostError(
            "durable_runtime_unavailable",
            "Installed Unchain does not provide durable interaction APIs",
            status_code=503,
        ) from exc
    return DurableInteractionRuntime(
        KernelMemoryRuntime.from_config(store=_session_store())
    )


def _execution_runtime():
    try:
        from unchain.execution import ExecutionRuntime
    except ImportError as exc:  # pragma: no cover - deployment compatibility guard
        raise DurableInteractionHostError(
            "execution_cancellation_unavailable",
            "Installed Unchain does not provide execution cancellation",
            status_code=503,
            retryable=True,
        ) from exc
    return ExecutionRuntime(_session_store())


def _load_execution_cancellation(
    session_id: str,
    attempt_id: str,
) -> Any | None:
    try:
        runtime = _execution_runtime()
        load_cancellation = getattr(runtime, "load_cancellation", None)
        if not callable(load_cancellation):
            return None
        return load_cancellation(session_id, attempt_id)
    except (DurableInteractionHostError, TypeError):
        return None


def _execution_control_cancel(
    session_id: str,
    attempt_id: str,
    *,
    reason: str,
) -> Any | None:
    try:
        import execution_control
    except ImportError:
        return None
    request_cancel = getattr(execution_control, "request_cancel", None)
    if not callable(request_cancel):
        return None
    return request_cancel(session_id, attempt_id, reason=reason)


def _execution_control_snapshot(session_id: str, attempt_id: str) -> Any | None:
    try:
        import execution_control
    except ImportError:
        return None
    snapshot = getattr(execution_control, "snapshot", None)
    if not callable(snapshot):
        return None
    return snapshot(session_id, attempt_id)


def _execution_control_status(session_id: str, attempt_id: str) -> str:
    try:
        snapshot = _execution_control_snapshot(session_id, attempt_id)
    except Exception:
        return ""
    return str(getattr(snapshot, "status", "") or "").strip().lower()


def _cancel_pending_source_attempt_result(
    session_id: str,
    source_attempt_id: str,
    *,
    expected_interaction_id: str = "",
    reason: str,
) -> tuple[bool, Any | None]:
    interaction_runtime = _interaction_runtime()
    normalized_expected_interaction_id = str(
        expected_interaction_id or ""
    ).strip()
    cancel_pending = getattr(interaction_runtime, "cancel_pending", None)
    if not callable(cancel_pending):
        raise DurableInteractionHostError(
            "execution_cancellation_unavailable",
            "Installed Unchain does not support durable interaction cancellation",
            status_code=503,
            retryable=True,
        )
    try:
        parameters = inspect.signature(cancel_pending).parameters
        accepts_var_keyword = any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD
            for parameter in parameters.values()
        )
        if (
            normalized_expected_interaction_id
            and "expected_interaction_id" not in parameters
            and not accepts_var_keyword
        ):
            raise TypeError(
                "cancel_pending has no exact-interaction parameter"
            )
        interaction_kwargs = (
            {"expected_interaction_id": normalized_expected_interaction_id}
            if normalized_expected_interaction_id
            else {}
        )
        if "source_run_id" in parameters:
            cancelled_interaction = cancel_pending(
                session_id,
                source_run_id=source_attempt_id,
                reason=reason,
                **interaction_kwargs,
            )
        elif "attempt_id" in parameters:  # pragma: no cover - compatibility
            cancelled_interaction = cancel_pending(
                session_id,
                attempt_id=source_attempt_id,
                reason=reason,
                **interaction_kwargs,
            )
        elif accepts_var_keyword:
            cancelled_interaction = cancel_pending(
                session_id,
                source_run_id=source_attempt_id,
                reason=reason,
                **interaction_kwargs,
            )
        else:  # pragma: no cover - fail closed for incompatible runtime
            raise TypeError("cancel_pending has no exact-attempt parameter")
        if (
            normalized_expected_interaction_id
            and cancelled_interaction is not None
        ):
            cancelled_request = getattr(cancelled_interaction, "request", None)
            cancelled_checkpoint_id = str(
                getattr(cancelled_interaction, "checkpoint_id", "") or ""
            ).strip()
            cancelled_application = getattr(
                cancelled_interaction,
                "application",
                None,
            )
            if (
                cancelled_request is None
                or str(
                    getattr(cancelled_request, "interaction_id", "") or ""
                ).strip()
                != normalized_expected_interaction_id
                or str(
                    getattr(cancelled_request, "source_run_id", "") or ""
                ).strip()
                != source_attempt_id
                or not cancelled_checkpoint_id
                or not isinstance(cancelled_application, dict)
                or cancelled_application.get("applied_checkpoint_id")
                != f"cancelled:{cancelled_checkpoint_id}"
            ):
                raise DurableInteractionHostError(
                    "interaction_cancel_claim_invalid",
                    "Durable interaction runtime returned a foreign cancel claim",
                    status_code=409,
                    retryable=True,
                )
        return cancelled_interaction is not None, cancelled_interaction
    except Exception as exc:
        try:
            from unchain.interaction import InteractionNotPendingError
        except ImportError:  # pragma: no cover
            InteractionNotPendingError = ()  # type: ignore
        if isinstance(exc, InteractionNotPendingError):
            return False, None
        try:
            from unchain.interaction import InteractionIntegrityError
        except ImportError:  # pragma: no cover
            InteractionIntegrityError = ()  # type: ignore
        if (
            isinstance(exc, InteractionIntegrityError)
            and not normalized_expected_interaction_id
        ):
            repaired = _reconcile_orphaned_cancelled_interaction(
                session_id,
                expected_source_run_id=source_attempt_id,
                reason=reason,
                cancel_if_needed=False,
            )
            if repaired:
                return True, None
        if isinstance(exc, TypeError):
            raise DurableInteractionHostError(
                "execution_cancellation_unavailable",
                "Installed Unchain has an incompatible durable cancellation API",
                status_code=503,
                retryable=True,
            ) from exc
        raise


def _cancel_pending_source_attempt(
    session_id: str,
    source_attempt_id: str,
    *,
    reason: str,
) -> bool:
    cancelled, _snapshot = _cancel_pending_source_attempt_result(
        session_id,
        source_attempt_id,
        reason=reason,
    )
    return cancelled


def _ensure_execution_tombstone(
    session_id: str,
    attempt_id: str,
    *,
    reason: str,
) -> Any:
    existing = _load_execution_cancellation(session_id, attempt_id)
    if existing is not None:
        return existing
    runtime = _execution_runtime()
    request_cancel = getattr(runtime, "request_cancel", None)
    if not callable(request_cancel):
        raise DurableInteractionHostError(
            "execution_cancellation_unavailable",
            "Installed Unchain does not support execution cancellation",
            status_code=503,
            retryable=True,
        )
    return request_cancel(session_id, attempt_id, reason=reason)


def _reconcile_orphaned_cancelled_interaction(
    session_id: str,
    *,
    expected_source_run_id: str = "",
    reason: str = "execution_cancelled",
    cancel_if_needed: bool = False,
) -> bool:
    """Repair legacy state whose active interaction lost its checkpoint.

    The repair is intentionally narrow: the active journal entry and any
    dangling checkpoint domain must agree on the exact session, checkpoint,
    and source owner.  That owner must also have a durable cancellation
    tombstone (or this explicit abandon path creates one) before the journal is
    terminalized with a revision CAS.
    """

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_expected_source = str(expected_source_run_id or "").strip()
    normalized_reason = str(reason or "execution_cancelled").strip()
    store = _session_store()

    try:
        from unchain.interaction.durable import (
            INTERACTION_JOURNAL_KEY,
            build_interaction_receipt,
            mark_interaction_applied,
            record_interaction_receipt,
            validate_interaction_journal,
            validate_interaction_request,
        )
        from memory_factory import (
            _load_session_snapshot_compat,
            _save_session_snapshot_compat,
        )
    except ImportError as exc:  # pragma: no cover - deployment compatibility guard
        raise DurableInteractionHostError(
            "durable_runtime_unavailable",
            "Installed Unchain does not provide durable interaction repair APIs",
            status_code=503,
        ) from exc

    last_conflict: Exception | None = None
    for _ in range(16):
        snapshot = _load_session_snapshot_compat(store, normalized_session_id)
        state = copy.deepcopy(snapshot.state)
        if "execution_checkpoint" in state:
            return False

        try:
            journal = validate_interaction_journal(
                state.get(INTERACTION_JOURNAL_KEY)
            )
        except Exception as exc:
            raise DurableInteractionHostError(
                "interaction_integrity_error",
                f"Invalid durable interaction journal: {exc}",
                status_code=409,
            ) from exc

        active_id = journal.get("active_id")
        domain = state.get("execution_checkpoint_domain")
        # The historical PuPu bug always left the checkpoint domain behind.
        # Without that exact owner/checkpoint binding there is not enough proof
        # to mutate a journal-only state, so leave it fail-closed.
        if domain is None:
            return False
        if (
            isinstance(snapshot.revision, bool)
            or not isinstance(snapshot.revision, int)
        ):
            raise DurableInteractionHostError(
                "durable_store_unavailable",
                "Orphaned interaction repair requires revisioned session storage",
                status_code=503,
            )

        source_run_id = ""
        checkpoint_id = ""
        entry = None
        request = None
        if active_id:
            entry = journal["entries"].get(active_id)
            if not isinstance(entry, dict):
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    "Active durable interaction is missing from its journal",
                    status_code=409,
                )
            try:
                request = validate_interaction_request(entry.get("request"))
            except Exception as exc:
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    f"Active durable interaction request is invalid: {exc}",
                    status_code=409,
                ) from exc
            if request.session_id != normalized_session_id:
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    "Orphaned durable interaction belongs to another session",
                    status_code=409,
                )
            source_run_id = str(request.source_run_id or "").strip()
            checkpoint_id = str(entry.get("checkpoint_id") or "").strip()

        if domain is not None:
            if not isinstance(domain, dict):
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    "Execution checkpoint domain must be an object",
                    status_code=409,
                )
            domain_execution_id = str(domain.get("execution_id") or "").strip()
            domain_owner_id = str(domain.get("owner_id") or "").strip()
            domain_checkpoint_id = str(domain.get("checkpoint_id") or "").strip()
            domain_fencing_token = domain.get("fencing_token")
            if (
                domain.get("schema_version") != 1
                or domain_execution_id != normalized_session_id
                or not domain_owner_id
                or not domain_checkpoint_id
                or isinstance(domain_fencing_token, bool)
                or not isinstance(domain_fencing_token, int)
                or domain_fencing_token <= 0
            ):
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    "Dangling execution checkpoint domain is invalid",
                    status_code=409,
                )
            if source_run_id and (
                source_run_id != domain_owner_id
                or checkpoint_id != domain_checkpoint_id
            ):
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    "Orphaned interaction does not match its checkpoint domain",
                    status_code=409,
                )
            source_run_id = source_run_id or domain_owner_id
            checkpoint_id = checkpoint_id or domain_checkpoint_id

        if not source_run_id or not checkpoint_id:
            raise DurableInteractionHostError(
                "interaction_integrity_error",
                "Orphaned durable state has no exact checkpoint owner",
                status_code=409,
            )
        if (
            normalized_expected_source
            and source_run_id != normalized_expected_source
        ):
            return False

        cancellation = _load_execution_cancellation(
            normalized_session_id,
            source_run_id,
        )
        if cancellation is None and cancel_if_needed:
            _execution_control_cancel(
                normalized_session_id,
                source_run_id,
                reason=normalized_reason,
            )
            cancellation = _ensure_execution_tombstone(
                normalized_session_id,
                source_run_id,
                reason=normalized_reason,
            )
        if cancellation is None:
            raise DurableInteractionHostError(
                "orphaned_interaction_recovery_required",
                "Active durable interaction has no execution checkpoint and its "
                "owner is not cancelled",
                status_code=409,
            )
        if domain is not None and (
            getattr(cancellation, "fencing_token", None)
            != domain.get("fencing_token")
        ):
            raise DurableInteractionHostError(
                "interaction_integrity_error",
                "Orphaned interaction cancellation does not match its checkpoint fence",
                status_code=409,
            )

        if request is not None and entry is not None:
            receipt = entry.get("receipt")
            if receipt is None:
                try:
                    cancellation_receipt = build_interaction_receipt(
                        request,
                        {
                            "cancelled": True,
                            "reason": str(
                                getattr(cancellation, "reason", "")
                                or normalized_reason
                            ),
                        },
                        submitted_by="runtime:orphaned_interaction_repair",
                        submitted_at_ms=int(
                            getattr(cancellation, "requested_at_ms", 0)
                            or time.time() * 1000
                        ),
                    )
                    journal = record_interaction_receipt(
                        journal,
                        cancellation_receipt,
                    )
                    receipt = journal["entries"][active_id]["receipt"]
                except Exception as exc:
                    raise DurableInteractionHostError(
                        "interaction_integrity_error",
                        f"Failed to record orphan cancellation receipt: {exc}",
                        status_code=409,
                    ) from exc
            try:
                journal = mark_interaction_applied(
                    journal,
                    interaction_id=active_id,
                    receipt_id=str(receipt.get("receipt_id") or ""),
                    applied_checkpoint_id=f"cancelled:{checkpoint_id}",
                )
            except Exception as exc:
                raise DurableInteractionHostError(
                    "interaction_integrity_error",
                    f"Failed to terminalize orphaned interaction: {exc}",
                    status_code=409,
                ) from exc
            state[INTERACTION_JOURNAL_KEY] = journal

        state.pop("execution_checkpoint_domain", None)
        try:
            _save_session_snapshot_compat(
                store,
                normalized_session_id,
                state,
                expected_revision=snapshot.revision,
            )
            return True
        except Exception as exc:
            if getattr(exc, "code", "") == "session_revision_conflict":
                last_conflict = exc
                continue
            raise

    if last_conflict is not None:
        raise last_conflict
    raise DurableInteractionHostError(
        "orphaned_interaction_repair_failed",
        "Orphaned durable interaction repair did not converge",
        status_code=409,
        retryable=True,
    )


def prepare_session_memory_replacement(
    session_id: str,
    *,
    expected_cancel_attempt_id: str | None = None,
) -> dict[str, bool]:
    """Abandon any exact pending execution before rewriting session history."""

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    if expected_cancel_attempt_id is not None and not isinstance(
        expected_cancel_attempt_id,
        str,
    ):
        raise ValueError("expected_cancel_attempt_id must be a string")
    expected_cancel_attempt = (
        str(expected_cancel_attempt_id or "").strip()
        if expected_cancel_attempt_id is not None
        else None
    )

    from memory_factory import (
        _active_memory_replace_source_run_id,
        _load_session_snapshot_compat,
    )

    preflight = _load_session_snapshot_compat(
        _session_store(),
        normalized_session_id,
    )
    active, active_source_run_id = _active_memory_replace_source_run_id(
        preflight.state
    )
    if expected_cancel_attempt is not None and active and (
        not expected_cancel_attempt
        or active_source_run_id != expected_cancel_attempt
    ):
        raise DurableInteractionHostError(
            "session_memory_replace_conflict",
            "Active durable execution does not match the expected cancellation attempt",
            status_code=409,
            retryable=True,
        )
    if not active:
        return {
            "execution_checkpoint_cleared": False,
            "orphaned_interaction_repaired": False,
        }

    repaired_orphan = _reconcile_orphaned_cancelled_interaction(
        normalized_session_id,
        expected_source_run_id=expected_cancel_attempt or "",
        reason="session memory replaced",
        cancel_if_needed=(
            expected_cancel_attempt is None or bool(expected_cancel_attempt)
        ),
    )
    if repaired_orphan:
        return {
            "execution_checkpoint_cleared": True,
            "orphaned_interaction_repaired": True,
        }

    preflight = _load_session_snapshot_compat(
        _session_store(),
        normalized_session_id,
    )
    if preflight.state.get("execution_checkpoint") is None:
        return {
            "execution_checkpoint_cleared": False,
            "orphaned_interaction_repaired": False,
        }

    interaction_runtime = _interaction_runtime()
    memory_runtime = interaction_runtime.memory_runtime
    snapshot = memory_runtime.load_session_snapshot(normalized_session_id)
    checkpoint_raw = snapshot.state.get("execution_checkpoint")
    if checkpoint_raw is None:
        return {
            "execution_checkpoint_cleared": False,
            "orphaned_interaction_repaired": False,
        }

    try:
        from unchain.memory.checkpoint_state import validate_execution_checkpoint

        checkpoint = validate_execution_checkpoint(checkpoint_raw)
    except Exception as exc:
        raise DurableInteractionHostError(
            str(getattr(exc, "code", "execution_checkpoint_integrity_error") or ""),
            str(exc),
            status_code=409,
        ) from exc

    source_run_id = str(checkpoint.get("source_run_id") or "").strip()
    if checkpoint.get("session_id") != normalized_session_id or not source_run_id:
        raise DurableInteractionHostError(
            "execution_checkpoint_compatibility_error",
            "Execution checkpoint does not match the session memory replacement",
            status_code=409,
        )
    if (
        expected_cancel_attempt is not None
        and source_run_id != expected_cancel_attempt
    ):
        raise DurableInteractionHostError(
            "session_memory_replace_conflict",
            "Execution checkpoint does not match the expected cancellation attempt",
            status_code=409,
            retryable=True,
        )

    _execution_control_cancel(
        normalized_session_id,
        source_run_id,
        reason="session memory replaced",
    )
    _ensure_execution_tombstone(
        normalized_session_id,
        source_run_id,
        reason="session memory replaced",
    )

    try:
        memory_runtime.reconcile_cancelled_execution_checkpoint(
            normalized_session_id
        )
        current = memory_runtime.load_session_snapshot(normalized_session_id)
        if "execution_checkpoint" in current.state:
            if isinstance(checkpoint.get("interaction_ref"), dict):
                cancelled = _cancel_pending_source_attempt(
                    normalized_session_id,
                    source_run_id,
                    reason="session memory replaced",
                )
                if not cancelled:
                    memory_runtime.clear_execution_checkpoint_snapshot(
                        normalized_session_id,
                        expected_checkpoint_id=str(
                            checkpoint.get("checkpoint_id") or ""
                        ),
                    )
            else:
                memory_runtime.clear_execution_checkpoint_snapshot(
                    normalized_session_id,
                    expected_checkpoint_id=str(checkpoint.get("checkpoint_id") or ""),
                )
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        raise DurableInteractionHostError(
            str(getattr(exc, "code", "session_memory_replace_conflict") or ""),
            str(exc),
            status_code=409,
            retryable=(
                str(getattr(exc, "code", "") or "")
                == "session_revision_conflict"
            ),
        ) from exc

    _reconcile_orphaned_cancelled_interaction(
        normalized_session_id,
        expected_source_run_id=source_run_id,
        reason="session memory replaced",
        cancel_if_needed=False,
    )
    final_snapshot = memory_runtime.load_session_snapshot(normalized_session_id)
    final_state = final_snapshot.state
    final_journal = final_state.get("interaction_journal")
    if (
        "execution_checkpoint" in final_state
        or "execution_checkpoint_domain" in final_state
        or (
            isinstance(final_journal, dict)
            and bool(final_journal.get("active_id"))
        )
    ):
        raise DurableInteractionHostError(
            "session_memory_replace_conflict",
            "Durable execution could not be terminalized before memory replacement",
            status_code=409,
            retryable=True,
        )
    return {
        "execution_checkpoint_cleared": True,
        "orphaned_interaction_repaired": False,
    }


def _reconcile_cancelled_attempt(
    *,
    session_id: str,
    attempt_id: str,
    source_attempt_id: str,
    reason: str,
) -> bool:
    """Finish a cancellation split across PuPu registry and Unchain storage."""

    _ensure_execution_tombstone(
        session_id,
        attempt_id,
        reason=reason,
    )
    durable_cancelled = _cancel_pending_source_attempt(
        session_id,
        source_attempt_id,
        reason=reason,
    )
    clear_resume_context(session_id, attempt_id)
    if durable_cancelled or attempt_id == source_attempt_id:
        clear_resume_context(session_id, source_attempt_id)
    if attempt_id == source_attempt_id:
        for binding in _bindings_for_source_attempt(
            session_id,
            source_attempt_id,
        ):
            child_attempt_id = str(binding.get("attempt_id") or "").strip()
            if child_attempt_id:
                clear_resume_context(session_id, child_attempt_id)
                clear_execution_attempt_binding(session_id, child_attempt_id)
    clear_execution_attempt_binding(session_id, attempt_id)
    return durable_cancelled


def _cancel_bound_resume_attempts(
    session_id: str,
    source_attempt_id: str,
    *,
    reason: str,
) -> tuple[str, ...]:
    """Revoke active resume owners before clearing their parent checkpoint."""

    cancelled: list[str] = []
    for binding in _bindings_for_source_attempt(session_id, source_attempt_id):
        attempt_id = str(binding.get("attempt_id") or "").strip()
        if not attempt_id or attempt_id == source_attempt_id:
            continue
        status = _execution_control_status(session_id, attempt_id)
        if status in {"completed", "failed"}:
            clear_execution_attempt_binding(session_id, attempt_id)
            continue
        registry_result = _execution_control_cancel(
            session_id,
            attempt_id,
            reason=reason,
        )
        result_payload = (
            registry_result.to_dict()
            if callable(getattr(registry_result, "to_dict", None))
            else {}
        )
        result_execution = result_payload.get("execution")
        result_status = str(
            (result_execution or {}).get("status")
            if isinstance(result_execution, dict)
            else ""
        ).strip().lower()
        if result_status in {"completed", "failed"}:
            clear_execution_attempt_binding(session_id, attempt_id)
            continue
        _ensure_execution_tombstone(
            session_id,
            attempt_id,
            reason=reason,
        )
        cancelled.append(attempt_id)
    return tuple(cancelled)


def _presentation_for_request(request: Any) -> dict[str, Any]:
    try:
        from unchain.interaction import (
            INTERACTION_KIND_HUMAN_INPUT,
            INTERACTION_KIND_MAX_BUDGET,
            INTERACTION_KIND_TOOL_APPROVAL,
        )
    except ImportError as exc:  # pragma: no cover
        raise DurableInteractionHostError(
            "durable_runtime_unavailable",
            "Installed Unchain does not provide interaction kinds",
            status_code=503,
        ) from exc

    payload = request.payload if isinstance(request.payload, dict) else {}
    interaction_id = str(request.interaction_id or "")
    if request.kind == INTERACTION_KIND_TOOL_APPROVAL:
        call_id = str(payload.get("call_id") or interaction_id)
        tool_name = str(payload.get("tool_name") or "")
        toolkit_id = str(payload.get("toolkit_id") or "")
        toolkit_name = str(payload.get("toolkit_name") or "")
        # Unchain's production ToolConfirmationRequest intentionally carries
        # tool identity but not host toolkit metadata. Recover PuPu's canonical
        # built-in identity so restart/recovery keeps the same confirmation
        # policy as the live event path. Explicit identities always win.
        if not toolkit_id and tool_name == "computer":
            toolkit_id = "builtin.computer"
            toolkit_name = toolkit_name or "Computer"
        presentation_arguments = copy.deepcopy(payload.get("arguments") or {})
        if tool_name == "computer":
            from computer_control.protocol import redact_sensitive_arguments

            presentation_arguments = redact_sensitive_arguments(
                presentation_arguments
            )
        tool_payload = {
            "tool_name": tool_name,
            "tool_display_name": str(payload.get("tool_display_name") or ""),
            "toolkit_id": toolkit_id,
            "toolkit_name": toolkit_name,
            "call_id": call_id,
            "arguments": presentation_arguments,
            "description": str(payload.get("description") or ""),
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "interact_type": str(payload.get("interact_type") or "confirmation"),
            "interact_config": copy.deepcopy(payload.get("interact_config") or {}),
        }
    elif request.kind == INTERACTION_KIND_HUMAN_INPUT:
        selection_mode = str(payload.get("selection_mode") or "single")
        interact_type = (
            "text_input"
            if selection_mode == "text_input"
            else "single"
            if selection_mode == "single"
            else "multi"
        )
        call_id = str(payload.get("request_id") or interaction_id)
        tool_payload = {
            "tool_name": "ask_user_question",
            "tool_display_name": "Ask User",
            "toolkit_id": "core",
            "toolkit_name": "Core",
            "call_id": call_id,
            "arguments": copy.deepcopy(payload),
            "description": str(payload.get("question") or ""),
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "interact_type": interact_type,
            "interact_config": copy.deepcopy(payload),
        }
    elif request.kind == INTERACTION_KIND_MAX_BUDGET:
        call_id = f"continuation-{interaction_id}"
        tool_payload = {
            "tool_name": "__continuation__",
            "tool_display_name": "Continue?",
            "call_id": call_id,
            "arguments": {},
            "description": "Agent reached its iteration limit without a final response.",
            "confirmation_id": interaction_id,
            "requires_confirmation": True,
            "interact_type": "confirmation",
            "interact_config": {
                "effective_max": payload.get("effective_max"),
                "suggested_extra_iterations": payload.get(
                    "suggested_extra_iterations"
                ),
            },
        }
    else:
        raise DurableInteractionHostError(
            "durable_interaction_kind_unsupported",
            f"Unsupported durable interaction kind: {request.kind!r}",
            status_code=422,
        )

    return {
        "trace_frame": {
            "seq": 0,
            "ts": int(time.time() * 1000),
            "type": "tool_call",
            "run_id": str(request.source_run_id or ""),
            "stage": "durable_recovery",
            "payload": tool_payload,
        },
        "tool_call": copy.deepcopy(tool_payload),
    }


def get_pending_interaction(session_id: str) -> dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    _reconcile_orphaned_cancelled_interaction(
        normalized_session_id,
        reason="reconciled cancelled orphaned interaction",
        cancel_if_needed=False,
    )
    runtime = _interaction_runtime()
    try:
        snapshot = runtime.load_active(normalized_session_id)
    except Exception as exc:
        try:
            from unchain.interaction import InteractionNotPendingError
        except ImportError:  # pragma: no cover
            InteractionNotPendingError = ()  # type: ignore
        if isinstance(exc, InteractionNotPendingError):
            return {"status": "none", "session_id": normalized_session_id}
        raise

    request = snapshot.request
    source_run_id = str(request.source_run_id or "").strip()
    if source_run_id:
        source_registry = _execution_control_snapshot(
            normalized_session_id,
            source_run_id,
        )
        source_registry_status = str(
            getattr(source_registry, "status", "") or ""
        ).strip().lower()
        source_core_cancelled = _load_execution_cancellation(
            normalized_session_id,
            source_run_id,
        ) is not None
        if source_registry_status == "cancelled" or source_core_cancelled:
            _cancel_bound_resume_attempts(
                normalized_session_id,
                source_run_id,
                reason="parent execution cancelled",
            )
            _reconcile_cancelled_attempt(
                session_id=normalized_session_id,
                attempt_id=source_run_id,
                source_attempt_id=source_run_id,
                reason=str(
                    getattr(source_registry, "reason", "reconciled cancellation")
                    or "reconciled cancellation"
                ),
            )
            return {"status": "none", "session_id": normalized_session_id}

        for binding in _bindings_for_source_attempt(
            normalized_session_id,
            source_run_id,
        ):
            bound_attempt_id = str(binding.get("attempt_id") or "").strip()
            if not bound_attempt_id:
                continue
            bound_registry = _execution_control_snapshot(
                normalized_session_id,
                bound_attempt_id,
            )
            bound_registry_status = str(
                getattr(bound_registry, "status", "") or ""
            ).strip().lower()
            if bound_registry_status in {"completed", "failed"}:
                clear_execution_attempt_binding(
                    normalized_session_id,
                    bound_attempt_id,
                )
                continue
            bound_core_cancelled = _load_execution_cancellation(
                normalized_session_id,
                bound_attempt_id,
            ) is not None
            if bound_registry_status == "cancelled" or bound_core_cancelled:
                _reconcile_cancelled_attempt(
                    session_id=normalized_session_id,
                    attempt_id=bound_attempt_id,
                    source_attempt_id=source_run_id,
                    reason=str(
                        getattr(
                            bound_registry,
                            "reason",
                            "reconciled cancellation",
                        )
                        or "reconciled cancellation"
                    ),
                )
                return {"status": "none", "session_id": normalized_session_id}

    context: dict[str, Any] | None = None
    context_unavailable_reason = ""
    try:
        context = load_resume_context(normalized_session_id, source_run_id)
    except DurableInteractionHostError as exc:
        context_unavailable_reason = exc.code

    subject = request.subject if isinstance(request.subject, dict) else {}
    subject_provider = str(subject.get("provider") or "").strip()
    subject_model = str(subject.get("model") or "").strip()
    if context is not None and (
        str(context.get("provider") or "").strip() != subject_provider
        or str(context.get("model") or "").strip() != subject_model
    ):
        context = None
        context_unavailable_reason = "durable_resume_context_subject_mismatch"

    graph_context: dict[str, Any] | None = None
    if context is None and source_run_id:
        try:
            candidate = _read_graph_step_context_path(
                _graph_step_context_path(
                    normalized_session_id,
                    source_run_id,
                ),
                expected_session_id=normalized_session_id,
                expected_step_attempt_id=source_run_id,
            )
            if candidate is not None:
                graph_context = load_graph_step_resume_context(
                    normalized_session_id,
                    source_run_id,
                    expected_owner_chat_id=str(
                        candidate.get("owner_chat_id") or ""
                    ),
                    expected_provider=subject_provider,
                    expected_model=subject_model,
                )
        except DurableInteractionHostError as exc:
            context_unavailable_reason = exc.code

    result: dict[str, Any] = {
        "status": (
            "receipt_recorded"
            if snapshot.receipt is not None
            else "awaiting_response"
        ),
        "session_id": normalized_session_id,
        "interaction_id": request.interaction_id,
        "source_run_id": source_run_id,
        "active_attempt_id": source_run_id,
        "kind": request.kind,
        "provider": subject_provider,
        "model": subject_model,
        "presentation": _presentation_for_request(request),
        "resume_available": context is not None or graph_context is not None,
        "resume_options": (
            copy.deepcopy(
                (context or graph_context or {}).get("options") or {}
            )
            if isinstance(context or graph_context, dict)
            else {}
        ),
    }
    if graph_context is not None:
        result.update(
            {
                "resume_kind": "graph_step",
                "graph_step_attempt_id": source_run_id,
                "graph_coordinator_attempt_id": str(
                    graph_context.get("coordinator_attempt_id") or ""
                ),
            }
        )
    if context is None and graph_context is None:
        result["resume_unavailable_reason"] = (
            context_unavailable_reason or "resume_context_missing"
        )
    if snapshot.receipt is not None:
        response = copy.deepcopy(snapshot.receipt.response)
        approved = response.get("approved") if isinstance(response, dict) else None
        result.update(
            {
                "receipt_id": snapshot.receipt.receipt_id,
                "resolution": {
                    "outcome": (
                        "approved"
                        if approved is True
                        else "denied"
                        if approved is False
                        else "submitted"
                    ),
                    "response": response,
                },
            }
        )
    return result


def _durable_response(
    *,
    request: Any,
    approved: bool,
    reason: str,
    modified_arguments: dict[str, Any] | None,
) -> dict[str, Any]:
    from unchain.interaction import (
        INTERACTION_KIND_HUMAN_INPUT,
        INTERACTION_KIND_MAX_BUDGET,
    )

    if request.kind == INTERACTION_KIND_HUMAN_INPUT:
        if not approved:
            raise DurableInteractionHostError(
                "human_input_denial_unsupported",
                "Human-input interactions require a submitted answer",
                status_code=422,
            )
        user_response = (modified_arguments or {}).get("user_response")
        if not isinstance(user_response, dict):
            raise DurableInteractionHostError(
                "invalid_human_input_response",
                "modified_arguments.user_response must be an object",
                status_code=422,
            )
        selected_values = (
            user_response.get("selected_values")
            or user_response.get("values")
            or (
                [user_response.get("value")]
                if user_response.get("value") is not None
                else []
            )
        )
        if isinstance(selected_values, str):
            selected_values = [selected_values]
        request_payload = request.payload if isinstance(request.payload, dict) else {}
        return {
            "request_id": str(request_payload.get("request_id") or ""),
            "selected_values": list(selected_values or []),
            "other_text": user_response.get("other_text"),
        }
    if request.kind == INTERACTION_KIND_MAX_BUDGET:
        return {"approved": bool(approved)}
    return {
        "approved": bool(approved),
        "reason": reason if isinstance(reason, str) else str(reason or ""),
        "modified_arguments": (
            copy.deepcopy(modified_arguments)
            if isinstance(modified_arguments, dict)
            else None
        ),
    }


def record_interaction_receipt(
    *,
    session_id: str,
    interaction_id: str,
    approved: bool,
    reason: str = "",
    modified_arguments: dict[str, Any] | None = None,
    submitted_by: str = "ui:pupu",
) -> dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    normalized_interaction_id = str(interaction_id or "").strip()
    if not normalized_interaction_id:
        raise DurableInteractionHostError(
            "invalid_interaction_id",
            "interaction_id is required",
            status_code=400,
        )
    runtime = _interaction_runtime()
    try:
        current = runtime.load(
            normalized_session_id,
            interaction_id=normalized_interaction_id,
            require_active=False,
        )
        source_run_id = str(current.request.source_run_id or "").strip()
        if source_run_id:
            cancelled_owner_id = ""
            if (
                _execution_control_status(normalized_session_id, source_run_id)
                == "cancelled"
                or _load_execution_cancellation(
                    normalized_session_id,
                    source_run_id,
                )
                is not None
            ):
                _cancel_bound_resume_attempts(
                    normalized_session_id,
                    source_run_id,
                    reason="parent execution cancelled",
                )
                cancelled_owner_id = source_run_id
            else:
                for binding in _bindings_for_source_attempt(
                    normalized_session_id,
                    source_run_id,
                ):
                    bound_attempt_id = str(
                        binding.get("attempt_id") or ""
                    ).strip()
                    if not bound_attempt_id:
                        continue
                    if (
                        _execution_control_status(
                            normalized_session_id,
                            bound_attempt_id,
                        )
                        == "cancelled"
                        or _load_execution_cancellation(
                            normalized_session_id,
                            bound_attempt_id,
                        )
                        is not None
                    ):
                        cancelled_owner_id = bound_attempt_id
                        break
            if cancelled_owner_id:
                _reconcile_cancelled_attempt(
                    session_id=normalized_session_id,
                    attempt_id=cancelled_owner_id,
                    source_attempt_id=source_run_id,
                    reason="execution cancelled before interaction receipt",
                )
                raise DurableInteractionHostError(
                    "execution_cancelled",
                    "The execution for this interaction was cancelled",
                    status_code=409,
                )
        response = _durable_response(
            request=current.request,
            approved=approved,
            reason=reason,
            modified_arguments=modified_arguments,
        )
        persisted = runtime.record_receipt(
            normalized_session_id,
            interaction_id=normalized_interaction_id,
            response=response,
            submitted_by=submitted_by,
            expected_revision=current.session_snapshot.revision,
        )
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        from unchain.interaction import (
            InteractionAlreadyAppliedError,
            InteractionNotPendingError,
            InteractionReceiptConflictError,
        )

        if isinstance(exc, InteractionNotPendingError):
            raise DurableInteractionHostError(
                "interaction_not_found",
                "No durable interaction found for this session and ID",
                status_code=404,
            ) from exc
        if isinstance(
            exc,
            (InteractionAlreadyAppliedError, InteractionReceiptConflictError),
        ):
            raise DurableInteractionHostError(
                "interaction_receipt_conflict",
                str(exc),
                status_code=409,
            ) from exc
        original_code = str(getattr(exc, "code", "") or "").strip()
        if original_code == "session_revision_conflict":
            raise DurableInteractionHostError(
                "interaction_receipt_conflict",
                str(exc),
                status_code=409,
            ) from exc
        if original_code in {
            "active_execution_lease",
            "execution_lease_conflict",
            "execution_lease_expired",
            "execution_lease_not_owned",
            "stale_execution_lease",
        }:
            raise DurableInteractionHostError(
                original_code,
                str(exc),
                status_code=409,
                retryable=True,
            ) from exc
        raise

    if persisted.receipt is None:
        raise DurableInteractionHostError(
            "interaction_receipt_missing",
            "Durable interaction receipt was not persisted",
        )
    public_result = {
        "status": "ok",
        "disposition": "receipt_recorded",
        "session_id": normalized_session_id,
        "interaction_id": normalized_interaction_id,
        "receipt_id": persisted.receipt.receipt_id,
    }
    return DurableInteractionReceiptResult(
        public_result,
        handoff=DurableInteractionReceiptHandoff.from_persisted_receipt(
            session_id=normalized_session_id,
            receipt=persisted.receipt,
        ),
    )


def _cold_interaction_owner_chat_id(
    session_id: str,
    source_attempt_id: str,
    *,
    explicit_owner_chat_id: str = "",
) -> str:
    candidates: list[str] = []
    explicit = str(explicit_owner_chat_id or "").strip()
    if explicit:
        candidates.append(
            _required_identifier(explicit, field_name="owner_chat_id")
        )
    graph_record = _read_graph_step_context_path(
        _graph_step_context_path(session_id, source_attempt_id),
        expected_session_id=session_id,
        expected_step_attempt_id=source_attempt_id,
    )
    if graph_record is not None:
        candidates.append(
            _required_identifier(
                graph_record.get("owner_chat_id"),
                field_name="graph_owner_chat_id",
            )
        )
    resume_record = load_resume_context(session_id, source_attempt_id)
    if resume_record is not None:
        options = resume_record.get("options")
        resume_owner = (
            str(options.get("_memory_v2_owner_chat_id") or "").strip()
            if isinstance(options, dict)
            else ""
        )
        if resume_owner:
            candidates.append(
                _required_identifier(
                    resume_owner,
                    field_name="resume_owner_chat_id",
                )
            )
    if len(set(candidates)) > 1:
        raise DurableInteractionHostError(
            "cold_interaction_owner_conflict",
            "Durable interaction owner authorities disagree",
            status_code=409,
        )
    if candidates:
        return candidates[0]

    from memory_v2_store_boundary import (
        STORE_OWNER_UNCHAIN,
        configured_context_v2_store_owner,
    )

    if configured_context_v2_store_owner() == STORE_OWNER_UNCHAIN:
        from memory_v2_unchain_active_bridge import (
            pupu_unchain_cold_context_interaction_exists,
        )

        if pupu_unchain_cold_context_interaction_exists(
            session_id=session_id,
            execution_id=session_id,
            source_attempt_id=source_attempt_id,
        ):
            raise DurableInteractionHostError(
                "cold_interaction_owner_required",
                "Canonical active interaction has no exact chat owner authority",
                status_code=409,
                retryable=True,
            )
    return ""


def _cold_active_interaction_required(
    *,
    owner_chat_id: str,
    session_id: str,
) -> bool:
    from memory_v2_store_boundary import (
        STORE_OWNER_UNCHAIN,
        configured_context_v2_store_owner,
    )

    if configured_context_v2_store_owner() != STORE_OWNER_UNCHAIN:
        return False
    if not str(owner_chat_id or "").strip():
        return False
    from memory_v2_unchain_active_bridge import (
        pupu_unchain_cold_active_admission,
    )

    return pupu_unchain_cold_active_admission(
        owner_chat_id=owner_chat_id,
        session_id=session_id,
        execution_id=session_id,
    )


def _interaction_journal_entries_for_source(
    session_id: str,
    source_attempt_id: str,
) -> tuple[tuple[Any, dict[str, Any], bool], ...]:
    from unchain.interaction import InteractionRequest
    from unchain.interaction.durable import validate_interaction_journal

    runtime = _interaction_runtime()
    snapshot = runtime.memory_runtime.load_session_snapshot(session_id)
    journal = validate_interaction_journal(
        snapshot.state.get("interaction_journal")
    )
    active_id = str(journal.get("active_id") or "").strip()
    entries: list[tuple[Any, dict[str, Any], bool]] = []
    for interaction_id in journal.get("order") or ():
        entry = (journal.get("entries") or {}).get(interaction_id)
        if not isinstance(entry, dict):
            continue
        request = InteractionRequest.from_dict(entry.get("request"))
        if request.source_run_id != source_attempt_id:
            continue
        entries.append(
            (
                request,
                copy.deepcopy(entry),
                request.interaction_id == active_id,
            )
        )
    return tuple(entries)


@dataclass(frozen=True)
class _InteractionCancelTarget:
    request: Any
    entry: dict[str, Any]
    is_active: bool
    is_cancelled_applied: bool


def _interaction_cancel_target(
    session_id: str,
    expected_interaction_id: str,
) -> _InteractionCancelTarget | None:
    """Resolve one exact durable target without consulting ambient latest state."""

    from unchain.interaction import InteractionRequest
    from unchain.interaction.durable import validate_interaction_journal

    runtime = _interaction_runtime()
    snapshot = runtime.memory_runtime.load_session_snapshot(session_id)
    journal = validate_interaction_journal(
        snapshot.state.get("interaction_journal")
    )
    entry = (journal.get("entries") or {}).get(expected_interaction_id)
    if entry is None:
        return None
    if not isinstance(entry, dict):
        raise DurableInteractionHostError(
            "interaction_cancel_target_corrupt",
            "Durable interaction target is corrupt",
            status_code=409,
        )
    request = InteractionRequest.from_dict(entry.get("request"))
    if request.interaction_id != expected_interaction_id:
        raise DurableInteractionHostError(
            "interaction_cancel_target_corrupt",
            "Durable interaction target identity changed",
            status_code=409,
        )
    checkpoint_id = str(entry.get("checkpoint_id") or "").strip()
    application = entry.get("application")
    return _InteractionCancelTarget(
        request=request,
        entry=copy.deepcopy(entry),
        is_active=str(journal.get("active_id") or "").strip()
        == expected_interaction_id,
        is_cancelled_applied=(
            isinstance(application, dict)
            and bool(checkpoint_id)
            and application.get("applied_checkpoint_id")
            == f"cancelled:{checkpoint_id}"
        ),
    )


def _active_interaction_id(session_id: str) -> str:
    from unchain.interaction.durable import validate_interaction_journal

    runtime = _interaction_runtime()
    snapshot = runtime.memory_runtime.load_session_snapshot(session_id)
    journal = validate_interaction_journal(
        snapshot.state.get("interaction_journal")
    )
    return str(journal.get("active_id") or "").strip()


def _cold_interaction_reconciliation_required(
    session_id: str,
    source_attempt_id: str,
) -> bool:
    """Return whether this exact source owns unresolved cold Context work."""

    for _request, entry, is_active in _interaction_journal_entries_for_source(
        session_id,
        source_attempt_id,
    ):
        if is_active:
            return True
        application = entry.get("application")
        checkpoint_id = str(entry.get("checkpoint_id") or "").strip()
        if (
            isinstance(application, dict)
            and checkpoint_id
            and application.get("applied_checkpoint_id")
            == f"cancelled:{checkpoint_id}"
        ):
            return True
    return False


def _cancelled_interaction_receipt_handoffs(
    session_id: str,
    source_attempt_id: str,
    *,
    expected_interaction_id: str = "",
) -> tuple[DurableInteractionReceiptHandoff, ...]:
    from unchain.interaction import InteractionReceipt

    candidates: list[DurableInteractionReceiptHandoff] = []
    for request, entry, _is_active in _interaction_journal_entries_for_source(
        session_id,
        source_attempt_id,
    ):
        if (
            expected_interaction_id
            and request.interaction_id != expected_interaction_id
        ):
            continue
        receipt_raw = entry.get("receipt")
        application = entry.get("application")
        checkpoint_id = str(entry.get("checkpoint_id") or "").strip()
        if receipt_raw is None or not isinstance(application, dict):
            continue
        if application.get("applied_checkpoint_id") != f"cancelled:{checkpoint_id}":
            continue
        receipt = InteractionReceipt.from_dict(receipt_raw, request=request)
        candidates.append(
            DurableInteractionReceiptHandoff.from_persisted_receipt(
                session_id=session_id,
                receipt=receipt,
            )
        )
    return tuple(candidates)


def _cancelled_snapshot_receipt_handoff(
    *,
    session_id: str,
    source_attempt_id: str,
    expected_interaction_id: str = "",
    cancellation_snapshot: Any | None,
) -> DurableInteractionReceiptHandoff | None:
    if cancellation_snapshot is None:
        return None
    request = getattr(cancellation_snapshot, "request", None)
    receipt = getattr(cancellation_snapshot, "receipt", None)
    application = getattr(cancellation_snapshot, "application", None)
    checkpoint_id = str(
        getattr(cancellation_snapshot, "checkpoint_id", "") or ""
    ).strip()
    if (
        request is None
        or receipt is None
        or not isinstance(application, dict)
        or not checkpoint_id
        or str(getattr(request, "source_run_id", "") or "").strip()
        != source_attempt_id
        or str(getattr(receipt, "interaction_id", "") or "").strip()
        != str(getattr(request, "interaction_id", "") or "").strip()
        or (
            expected_interaction_id
            and str(getattr(request, "interaction_id", "") or "").strip()
            != expected_interaction_id
        )
        or application.get("applied_checkpoint_id")
        != f"cancelled:{checkpoint_id}"
    ):
        raise DurableInteractionHostError(
            "cold_interaction_receipt_integrity_error",
            "Cancelled interaction snapshot does not match its exact source",
            status_code=409,
            retryable=True,
        )
    return DurableInteractionReceiptHandoff.from_persisted_receipt(
        session_id=session_id,
        receipt=receipt,
    )


def _reconcile_cancelled_interaction_to_context(
    *,
    owner_chat_id: str,
    session_id: str,
    source_attempt_id: str,
    expected_interaction_id: str = "",
    cancellation_applied: bool,
    cancellation_snapshot: Any | None = None,
) -> bool:
    direct_handoff = _cancelled_snapshot_receipt_handoff(
        session_id=session_id,
        source_attempt_id=source_attempt_id,
        expected_interaction_id=expected_interaction_id,
        cancellation_snapshot=cancellation_snapshot,
    )
    candidates = (
        (direct_handoff,)
        if direct_handoff is not None
        else _cancelled_interaction_receipt_handoffs(
            session_id,
            source_attempt_id,
            expected_interaction_id=expected_interaction_id,
        )
    )
    if not candidates and not cancellation_applied:
        return False
    if len(candidates) != 1:
        raise DurableInteractionHostError(
            "cold_interaction_receipt_ambiguous",
            "Cancelled active interaction has no unique durable receipt",
            status_code=409,
            retryable=True,
        )
    from memory_v2_unchain_active_bridge import (
        persist_pupu_unchain_cold_interaction_resolution,
    )

    try:
        persist_pupu_unchain_cold_interaction_resolution(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            execution_id=session_id,
            source_attempt_id=source_attempt_id,
            durable_receipt=candidates[0],
        )
    except DurableInteractionHostError:
        raise
    except Exception as exc:
        raise DurableInteractionHostError(
            "cold_interaction_context_ingress_failed",
            str(exc),
            status_code=409,
            retryable=True,
        ) from exc
    return True


def reconcile_cancelled_interactions_before_active_run(
    *,
    owner_chat_id: str,
    session_id: str,
) -> int:
    """Repair exact cancelled receipts before a fresh active compile.

    Historical/off entries without a canonical Context request are ignored.
    Exact request intersections are projected only through official ingress.
    """

    normalized_owner_chat_id = _required_identifier(
        owner_chat_id,
        field_name="owner_chat_id",
    )
    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    if not _cold_active_interaction_required(
        owner_chat_id=normalized_owner_chat_id,
        session_id=normalized_session_id,
    ):
        return 0
    from memory_v2_unchain_active_bridge import (
        pupu_unchain_cold_context_request_exists,
    )

    repaired = 0
    seen_interactions: set[str] = set()
    runtime = _interaction_runtime()
    from unchain.interaction import InteractionRequest
    from unchain.interaction.durable import validate_interaction_journal

    snapshot = runtime.memory_runtime.load_session_snapshot(
        normalized_session_id
    )
    journal = validate_interaction_journal(
        snapshot.state.get("interaction_journal")
    )
    for interaction_id in journal.get("order") or ():
        raw_entry = (journal.get("entries") or {}).get(interaction_id)
        if not isinstance(raw_entry, dict):
            continue
        request = InteractionRequest.from_dict(raw_entry.get("request"))
        checkpoint_id = str(raw_entry.get("checkpoint_id") or "").strip()
        application = raw_entry.get("application")
        if (
            request.interaction_id in seen_interactions
            or not checkpoint_id
            or not isinstance(application, dict)
            or application.get("applied_checkpoint_id")
            != f"cancelled:{checkpoint_id}"
        ):
            continue
        seen_interactions.add(request.interaction_id)
        if not pupu_unchain_cold_context_request_exists(
            session_id=normalized_session_id,
            execution_id=normalized_session_id,
            source_attempt_id=request.source_run_id,
            interaction_id=request.interaction_id,
        ):
            continue
        if not _reconcile_cancelled_interaction_to_context(
            owner_chat_id=normalized_owner_chat_id,
            session_id=normalized_session_id,
            source_attempt_id=request.source_run_id,
            expected_interaction_id=request.interaction_id,
            cancellation_applied=True,
        ):
            raise DurableInteractionHostError(
                "cold_interaction_repair_incomplete",
                "Cancelled interaction repair did not persist canonical input",
                status_code=409,
                retryable=True,
            )
        repaired += 1
    return repaired


def cancel_chat_execution(
    *,
    session_id: str,
    attempt_id: str,
    source_attempt_id: str = "",
    owner_chat_id: str = "",
    expected_interaction_id: str = "",
    reason: str = "user_stop",
) -> dict[str, Any]:
    """Idempotently cancel one exact PuPu/Unchain execution attempt."""

    normalized_session_id = _required_identifier(
        session_id,
        field_name="session_id",
    )
    normalized_attempt_id = _required_identifier(
        attempt_id,
        field_name="attempt_id",
    )
    normalized_reason = str(reason or "user_stop").strip() or "user_stop"
    normalized_expected_interaction_id = str(
        expected_interaction_id or ""
    ).strip()
    if normalized_expected_interaction_id:
        normalized_expected_interaction_id = _required_identifier(
            normalized_expected_interaction_id,
            field_name="expected_interaction_id",
        )
    normalized_source_attempt_id = str(source_attempt_id or "").strip()
    if normalized_source_attempt_id:
        binding = bind_execution_attempt(
            session_id=normalized_session_id,
            attempt_id=normalized_attempt_id,
            source_attempt_id=normalized_source_attempt_id,
        )
    else:
        binding = load_execution_attempt_binding(
            normalized_session_id,
            normalized_attempt_id,
        )
    pending_source_attempt_id = str(
        (binding or {}).get("source_attempt_id")
        or normalized_attempt_id
    ).strip()
    exact_target = (
        _interaction_cancel_target(
            normalized_session_id,
            normalized_expected_interaction_id,
        )
        if normalized_expected_interaction_id
        else None
    )
    if normalized_expected_interaction_id and exact_target is None:
        raise DurableInteractionHostError(
            "interaction_cancel_target_missing",
            "Durable interaction cancel target does not exist",
            status_code=409,
        )
    if exact_target is not None:
        pending_source_attempt_id = _required_identifier(
            exact_target.request.source_run_id,
            field_name="interaction_source_attempt_id",
        )
        if not exact_target.is_active and not exact_target.is_cancelled_applied:
            raise DurableInteractionHostError(
                "interaction_cancel_target_not_pending",
                "Durable interaction cancel target is no longer pending",
                status_code=409,
            )
    elif _active_interaction_id(normalized_session_id):
        raise DurableInteractionHostError(
            "interaction_cancel_target_required",
            "Durable interaction cancellation requires interaction_id",
            status_code=409,
            retryable=True,
        )

    cold_reconciliation_required = False
    cold_reconciliation_owners: set[str] = set()
    for candidate_source_attempt_id in dict.fromkeys(
        (
            (pending_source_attempt_id,)
            if exact_target is not None
            else (pending_source_attempt_id, normalized_attempt_id)
        )
    ):
        candidate_owner_chat_id = _cold_interaction_owner_chat_id(
            normalized_session_id,
            candidate_source_attempt_id,
            explicit_owner_chat_id=owner_chat_id,
        )
        candidate_active = _cold_active_interaction_required(
            owner_chat_id=candidate_owner_chat_id,
            session_id=normalized_session_id,
        )
        candidate_work = _cold_interaction_reconciliation_required(
            normalized_session_id,
            candidate_source_attempt_id,
        )
        if candidate_active and candidate_work:
            cold_reconciliation_required = True
            cold_reconciliation_owners.add(candidate_owner_chat_id)
    if len(cold_reconciliation_owners) > 1:
        raise DurableInteractionHostError(
            "cold_interaction_owner_conflict",
            "Cold interaction source authorities disagree",
            status_code=409,
        )
    durable_interaction_cancelled = False
    cancelled_interaction_snapshot = None
    if exact_target is not None and exact_target.is_cancelled_applied:
        active_interaction_id = _active_interaction_id(normalized_session_id)
        foreign_active_interaction = bool(
            active_interaction_id
            and active_interaction_id != normalized_expected_interaction_id
        )
        resolved_owner_chat_id = (
            next(iter(cold_reconciliation_owners))
            if cold_reconciliation_owners
            else _cold_interaction_owner_chat_id(
                normalized_session_id,
                pending_source_attempt_id,
                explicit_owner_chat_id=owner_chat_id,
            )
        )
        if foreign_active_interaction:
            context_interaction_reconciled = False
            if cold_reconciliation_required:
                context_interaction_reconciled = (
                    _reconcile_cancelled_interaction_to_context(
                        owner_chat_id=resolved_owner_chat_id,
                        session_id=normalized_session_id,
                        source_attempt_id=pending_source_attempt_id,
                        expected_interaction_id=(
                            normalized_expected_interaction_id
                        ),
                        cancellation_applied=True,
                    )
                )
            return {
                "status": "ok",
                "execution_id": normalized_session_id,
                "attempt_id": normalized_attempt_id,
                "source_attempt_id": pending_source_attempt_id,
                "interaction_id": normalized_expected_interaction_id,
                "disposition": "unchanged",
                "state": _execution_control_status(
                    normalized_session_id,
                    normalized_attempt_id,
                )
                or "running",
                "execution": {},
                "cancellation": None,
                "durable_interaction_cancelled": False,
                "context_interaction_reconciled": (
                    context_interaction_reconciled
                ),
            }
        durable_interaction_cancelled = True
    elif exact_target is not None:
        (
            durable_interaction_cancelled,
            cancelled_interaction_snapshot,
        ) = _cancel_pending_source_attempt_result(
            normalized_session_id,
            pending_source_attempt_id,
            expected_interaction_id=normalized_expected_interaction_id,
            reason=normalized_reason,
        )
        if not durable_interaction_cancelled:
            raise DurableInteractionHostError(
                "interaction_cancel_target_changed",
                "Durable interaction cancel target changed before atomic apply",
                status_code=409,
                retryable=True,
            )

    try:
        registry_result = _execution_control_cancel(
            normalized_session_id,
            normalized_attempt_id,
            reason=normalized_reason,
        )
    except Exception as exc:
        raise DurableInteractionHostError(
            str(getattr(exc, "code", "execution_control_failed") or ""),
            str(exc),
            status_code=int(getattr(exc, "status_code", 500) or 500),
            retryable=bool(getattr(exc, "retryable", True)),
        ) from exc

    registry_payload = (
        registry_result.to_dict()
        if callable(getattr(registry_result, "to_dict", None))
        else {}
    )
    registry_execution = registry_payload.get("execution")
    registry_execution = (
        registry_execution if isinstance(registry_execution, dict) else {}
    )
    disposition = str(registry_payload.get("disposition") or "applied")
    state = str(registry_execution.get("status") or "")
    if state in {"completed", "failed"} and not cold_reconciliation_required:
        if durable_interaction_cancelled:
            clear_resume_context(
                normalized_session_id,
                pending_source_attempt_id,
            )
        clear_resume_context(
            normalized_session_id,
            normalized_attempt_id,
        )
        clear_execution_attempt_binding(
            normalized_session_id,
            normalized_attempt_id,
        )
        return {
            "status": "ok",
            "execution_id": normalized_session_id,
            "attempt_id": normalized_attempt_id,
            "source_attempt_id": pending_source_attempt_id,
            "disposition": disposition,
            "state": state,
            "execution": copy.deepcopy(registry_execution),
            "cancellation": None,
            "durable_interaction_cancelled": durable_interaction_cancelled,
        }

    try:
        cancellation = _ensure_execution_tombstone(
            normalized_session_id,
            normalized_attempt_id,
            reason=normalized_reason,
        )
    except TypeError as exc:
        raise DurableInteractionHostError(
            "execution_cancellation_unavailable",
            "Installed Unchain has an incompatible cancellation API",
            status_code=503,
            retryable=True,
        ) from exc

    if pending_source_attempt_id == normalized_attempt_id:
        _cancel_bound_resume_attempts(
            normalized_session_id,
            normalized_attempt_id,
            reason=normalized_reason,
        )

    if not normalized_expected_interaction_id:
        (
            durable_interaction_cancelled,
            cancelled_interaction_snapshot,
        ) = _cancel_pending_source_attempt_result(
            normalized_session_id,
            pending_source_attempt_id,
            reason=normalized_reason,
        )
    if (
        not normalized_expected_interaction_id
        and
        not durable_interaction_cancelled
        and pending_source_attempt_id == normalized_attempt_id
    ):
        late_binding = load_execution_attempt_binding(
            normalized_session_id,
            normalized_attempt_id,
        )
        late_source_attempt_id = str(
            (late_binding or {}).get("source_attempt_id") or ""
        ).strip()
        if late_source_attempt_id and late_source_attempt_id != normalized_attempt_id:
            pending_source_attempt_id = late_source_attempt_id
            (
                durable_interaction_cancelled,
                cancelled_interaction_snapshot,
            ) = _cancel_pending_source_attempt_result(
                normalized_session_id,
                pending_source_attempt_id,
                reason=normalized_reason,
            )
    if (
        not normalized_expected_interaction_id
        and
        not durable_interaction_cancelled
        and pending_source_attempt_id != normalized_attempt_id
    ):
        # Once resume attempt B consumes checkpoint A, a later checkpoint is
        # owned by B itself.  Exact-B fallback cancels that successor without
        # ever touching an unrelated newer owner.
        (
            fallback_cancelled,
            fallback_cancelled_snapshot,
        ) = _cancel_pending_source_attempt_result(
            normalized_session_id,
            normalized_attempt_id,
            reason=normalized_reason,
        )
        if fallback_cancelled:
            pending_source_attempt_id = normalized_attempt_id
            durable_interaction_cancelled = True
            cancelled_interaction_snapshot = fallback_cancelled_snapshot

    if normalized_expected_interaction_id and not durable_interaction_cancelled:
        raise DurableInteractionHostError(
            "interaction_cancel_target_changed",
            "Durable interaction cancel target changed before atomic apply",
            status_code=409,
            retryable=True,
        )

    resolved_owner_chat_id = _cold_interaction_owner_chat_id(
        normalized_session_id,
        pending_source_attempt_id,
        explicit_owner_chat_id=owner_chat_id,
    )
    cold_active_required = _cold_active_interaction_required(
        owner_chat_id=resolved_owner_chat_id,
        session_id=normalized_session_id,
    )

    context_interaction_reconciled = False
    if cold_active_required:
        context_interaction_reconciled = (
            _reconcile_cancelled_interaction_to_context(
                owner_chat_id=resolved_owner_chat_id,
                session_id=normalized_session_id,
                source_attempt_id=pending_source_attempt_id,
                expected_interaction_id=normalized_expected_interaction_id,
                cancellation_applied=durable_interaction_cancelled,
                cancellation_snapshot=cancelled_interaction_snapshot,
            )
        )

    clear_resume_context(normalized_session_id, normalized_attempt_id)
    if durable_interaction_cancelled:
        clear_resume_context(normalized_session_id, pending_source_attempt_id)
    if pending_source_attempt_id == normalized_attempt_id:
        for child_binding in _bindings_for_source_attempt(
            normalized_session_id,
            normalized_attempt_id,
        ):
            child_attempt_id = str(
                child_binding.get("attempt_id") or ""
            ).strip()
            if child_attempt_id:
                clear_resume_context(normalized_session_id, child_attempt_id)
                clear_execution_attempt_binding(
                    normalized_session_id,
                    child_attempt_id,
                )
    clear_execution_attempt_binding(normalized_session_id, normalized_attempt_id)

    state = state or "cancelled"
    return {
        "status": "ok",
        "execution_id": normalized_session_id,
        "attempt_id": normalized_attempt_id,
        "source_attempt_id": pending_source_attempt_id,
        "disposition": disposition,
        "state": state,
        "execution": copy.deepcopy(registry_execution),
        "cancellation": {
            "requested_at_ms": getattr(cancellation, "requested_at_ms", None),
            "fencing_token": getattr(cancellation, "fencing_token", None),
            "reason": str(getattr(cancellation, "reason", normalized_reason) or ""),
        },
        "durable_interaction_cancelled": durable_interaction_cancelled,
        "context_interaction_reconciled": context_interaction_reconciled,
    }


class DurableInteractionIdTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_key: dict[tuple[str, str], str] = {}
        self._latest_by_kind: dict[str, str] = {}
        self._owner_by_key: dict[tuple[str, str], dict[str, str]] = {}
        self._owner_by_thread_key: dict[
            tuple[str, str, int], dict[str, str]
        ] = {}
        self._latest_owner_by_kind: dict[str, dict[str, str]] = {}

    def observe(self, event: object) -> None:
        if not isinstance(event, dict):
            return
        request_raw = event.get("interaction_request")
        if isinstance(request_raw, dict):
            interaction_id = str(
                request_raw.get("interaction_id") or ""
            ).strip()
            kind = str(request_raw.get("kind") or "").strip()
            payload = request_raw.get("payload")
            session_id = str(request_raw.get("session_id") or "").strip()
            source_run_id = str(
                request_raw.get("source_run_id") or ""
            ).strip()
        elif str(event.get("type") or "").strip() == "tool_call":
            # Non-durable tool approval has no interaction_request. Retain its
            # run ownership so a descendant callback can still fail closed.
            interaction_id = ""
            kind = "tool_approval"
            payload = event
            session_id = str(event.get("session_id") or "").strip()
            source_run_id = str(event.get("run_id") or "").strip()
        else:
            return
        if not kind or not isinstance(payload, dict):
            return
        call_id = str(
            payload.get("call_id") or payload.get("request_id") or ""
        ).strip()
        event_run_id = str(event.get("run_id") or "").strip()
        owner = {
            "interaction_id": interaction_id,
            "session_id": session_id,
            "source_run_id": source_run_id,
            "event_run_id": event_run_id,
        }
        thread_id = threading.get_ident()
        with self._lock:
            if interaction_id:
                self._latest_by_kind[kind] = interaction_id
            self._latest_owner_by_kind[kind] = owner
            if call_id:
                if interaction_id:
                    self._by_key[(kind, call_id)] = interaction_id
                self._owner_by_key[(kind, call_id)] = owner
                self._owner_by_thread_key[(kind, call_id, thread_id)] = owner

    def resolve_owner(
        self,
        kind: str,
        call_id: str = "",
        *,
        allow_latest: bool = False,
    ) -> dict[str, str]:
        normalized_kind = str(kind or "").strip()
        normalized_call_id = str(call_id or "").strip()
        thread_id = threading.get_ident()
        with self._lock:
            owner = None
            if normalized_call_id:
                owner = self._owner_by_thread_key.get(
                    (normalized_kind, normalized_call_id, thread_id)
                )
                if owner is None:
                    owner = self._owner_by_key.get(
                        (normalized_kind, normalized_call_id)
                    )
            elif allow_latest:
                owner = self._latest_owner_by_kind.get(normalized_kind)
            return copy.deepcopy(owner) if isinstance(owner, dict) else {}

    def resolve(
        self,
        kind: str,
        call_id: str = "",
        *,
        allow_latest: bool = False,
    ) -> str:
        owner = self.resolve_owner(
            kind,
            call_id,
            allow_latest=allow_latest,
        )
        return str(owner.get("interaction_id") or "").strip()


__all__ = [
    "DurableInteractionHostError",
    "DurableInteractionIdTracker",
    "DurableInteractionReceiptHandoff",
    "DurableInteractionReceiptResult",
    "clear_graph_step_resume_context",
    "clear_resume_context",
    "get_pending_interaction",
    "load_graph_step_resume_context",
    "load_resume_context",
    "interaction_receipt_handoff",
    "record_interaction_receipt",
    "reconcile_cancelled_interactions_before_active_run",
    "resolve_graph_step_resume_options",
    "resolve_resume_options",
    "save_graph_step_resume_context",
    "save_resume_context",
]
