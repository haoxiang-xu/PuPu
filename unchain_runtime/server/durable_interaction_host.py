from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any


_CONTEXT_SCHEMA_VERSION = 2
_CONTEXT_DIRECTORY = "durable_interactions"

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
    return {
        key: _json_safe(value[key])
        for key in _STABLE_RESUME_OPTION_KEYS
        if key in value
    }


def _fresh_secret_overlay(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    overlay: dict[str, Any] = {}
    for key in _FRESH_SECRET_OPTION_KEYS:
        secret = value.get(key)
        if isinstance(secret, str) and secret.strip():
            overlay[key] = secret
    return overlay


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
    resolved = copy.deepcopy(stable_options)
    resolved.update(_fresh_secret_overlay(fresh_options or {}))
    if context_provider and context_model:
        resolved.update(
            {
                "modelId": f"{context_provider}:{context_model}",
                "provider": context_provider,
                "model": context_model,
            }
        )
    return resolved


def _session_store():
    try:
        from unchain.memory import JsonFileSessionStore
    except ImportError as exc:  # pragma: no cover - deployment compatibility guard
        raise DurableInteractionHostError(
            "durable_runtime_unavailable",
            "Installed Unchain does not provide durable session storage",
            status_code=503,
        ) from exc
    sessions_directory = _normalized_data_dir() / "memory" / "sessions"
    return JsonFileSessionStore(base_dir=sessions_directory)


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
        tool_payload = {
            "tool_name": str(payload.get("tool_name") or ""),
            "tool_display_name": str(payload.get("tool_display_name") or ""),
            "toolkit_id": str(payload.get("toolkit_id") or ""),
            "toolkit_name": str(payload.get("toolkit_name") or ""),
            "call_id": call_id,
            "arguments": copy.deepcopy(payload.get("arguments") or {}),
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

    result: dict[str, Any] = {
        "status": (
            "receipt_recorded"
            if snapshot.receipt is not None
            else "awaiting_response"
        ),
        "session_id": normalized_session_id,
        "interaction_id": request.interaction_id,
        "source_run_id": source_run_id,
        "kind": request.kind,
        "provider": subject_provider,
        "model": subject_model,
        "presentation": _presentation_for_request(request),
        "resume_available": context is not None,
        "resume_options": (
            copy.deepcopy(context.get("options") or {})
            if isinstance(context, dict)
            else {}
        ),
    }
    if context is None:
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
    return {
        "status": "ok",
        "disposition": "receipt_recorded",
        "session_id": normalized_session_id,
        "interaction_id": normalized_interaction_id,
        "receipt_id": persisted.receipt.receipt_id,
    }


class DurableInteractionIdTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_key: dict[tuple[str, str], str] = {}
        self._latest_by_kind: dict[str, str] = {}

    def observe(self, event: object) -> None:
        if not isinstance(event, dict):
            return
        request_raw = event.get("interaction_request")
        if not isinstance(request_raw, dict):
            return
        interaction_id = str(request_raw.get("interaction_id") or "").strip()
        kind = str(request_raw.get("kind") or "").strip()
        payload = request_raw.get("payload")
        if not interaction_id or not kind or not isinstance(payload, dict):
            return
        call_id = str(
            payload.get("call_id") or payload.get("request_id") or ""
        ).strip()
        with self._lock:
            self._latest_by_kind[kind] = interaction_id
            if call_id:
                self._by_key[(kind, call_id)] = interaction_id

    def resolve(
        self,
        kind: str,
        call_id: str = "",
        *,
        allow_latest: bool = False,
    ) -> str:
        normalized_kind = str(kind or "").strip()
        normalized_call_id = str(call_id or "").strip()
        with self._lock:
            if normalized_call_id:
                exact = self._by_key.get((normalized_kind, normalized_call_id))
                if exact:
                    return exact
                return ""
            if allow_latest:
                return self._latest_by_kind.get(normalized_kind, "")
            return ""


__all__ = [
    "DurableInteractionHostError",
    "DurableInteractionIdTracker",
    "clear_resume_context",
    "get_pending_interaction",
    "load_resume_context",
    "record_interaction_receipt",
    "resolve_resume_options",
    "save_resume_context",
]
