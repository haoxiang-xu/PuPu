from __future__ import annotations

import copy
import hashlib
import inspect
import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


_CONTEXT_SCHEMA_VERSION = 2
_CONTEXT_DIRECTORY = "durable_interactions"
_ATTEMPT_BINDING_SCHEMA_VERSION = 1
_ATTEMPT_BINDING_DIRECTORY = "execution_attempt_bindings"

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
    resolved = copy.deepcopy(stable_options)
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


def _cancel_pending_source_attempt(
    session_id: str,
    source_attempt_id: str,
    *,
    reason: str,
) -> bool:
    interaction_runtime = _interaction_runtime()
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
        if "source_run_id" in parameters:
            cancelled_interaction = cancel_pending(
                session_id,
                source_run_id=source_attempt_id,
                reason=reason,
            )
        elif "attempt_id" in parameters:  # pragma: no cover - compatibility
            cancelled_interaction = cancel_pending(
                session_id,
                attempt_id=source_attempt_id,
                reason=reason,
            )
        elif accepts_var_keyword:
            cancelled_interaction = cancel_pending(
                session_id,
                source_run_id=source_attempt_id,
                reason=reason,
            )
        else:  # pragma: no cover - fail closed for incompatible runtime
            raise TypeError("cancel_pending has no exact-attempt parameter")
        return cancelled_interaction is not None
    except Exception as exc:
        try:
            from unchain.interaction import InteractionNotPendingError
        except ImportError:  # pragma: no cover
            InteractionNotPendingError = ()  # type: ignore
        if isinstance(exc, InteractionNotPendingError):
            return False
        try:
            from unchain.interaction import InteractionIntegrityError
        except ImportError:  # pragma: no cover
            InteractionIntegrityError = ()  # type: ignore
        if isinstance(exc, InteractionIntegrityError):
            repaired = _reconcile_orphaned_cancelled_interaction(
                session_id,
                expected_source_run_id=source_attempt_id,
                reason=reason,
                cancel_if_needed=False,
            )
            if repaired:
                return True
        if isinstance(exc, TypeError):
            raise DurableInteractionHostError(
                "execution_cancellation_unavailable",
                "Installed Unchain has an incompatible durable cancellation API",
                status_code=503,
                retryable=True,
            ) from exc
        raise


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
    return {
        "status": "ok",
        "disposition": "receipt_recorded",
        "session_id": normalized_session_id,
        "interaction_id": normalized_interaction_id,
        "receipt_id": persisted.receipt.receipt_id,
    }


def cancel_chat_execution(
    *,
    session_id: str,
    attempt_id: str,
    source_attempt_id: str = "",
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
    if state in {"completed", "failed"}:
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
            "durable_interaction_cancelled": False,
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

    durable_interaction_cancelled = _cancel_pending_source_attempt(
        normalized_session_id,
        pending_source_attempt_id,
        reason=normalized_reason,
    )
    if (
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
            durable_interaction_cancelled = _cancel_pending_source_attempt(
                normalized_session_id,
                pending_source_attempt_id,
                reason=normalized_reason,
            )
    if (
        not durable_interaction_cancelled
        and pending_source_attempt_id != normalized_attempt_id
    ):
        # Once resume attempt B consumes checkpoint A, a later checkpoint is
        # owned by B itself.  Exact-B fallback cancels that successor without
        # ever touching an unrelated newer owner.
        durable_interaction_cancelled = _cancel_pending_source_attempt(
            normalized_session_id,
            normalized_attempt_id,
            reason=normalized_reason,
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
    "clear_resume_context",
    "get_pending_interaction",
    "load_resume_context",
    "record_interaction_receipt",
    "resolve_resume_options",
    "save_resume_context",
]
