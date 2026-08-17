import os

from flask import Response, current_app, jsonify, request

from context_memory_v2_capability import (
    context_memory_v2_capability_status,
    resolve_context_memory_v2_capability,
)
from memory_v2_rollout import resolve_memory_v2_rollout
from route_blueprint import api_blueprint


_RUNTIME_CONTRACT_SCHEMA = "pupu.runtime-capabilities"
_RUNTIME_CONTRACT_VERSION = 1
_DURABLE_JOBS_VERSION = "D4.1"


def _root():
    import routes as routes_module

    return routes_module


def _has_route(path: str, method: str) -> bool:
    normalized_method = str(method or "").strip().upper()
    return any(
        rule.rule == path and normalized_method in (rule.methods or set())
        for rule in current_app.url_map.iter_rules()
    )


def _runtime_event_v4_available() -> tuple[bool, str]:
    try:
        import route_chat
    except Exception as exc:
        return False, f"runtime event route import failed: {exc}"
    if getattr(route_chat, "RuntimeEventBridge", None) is None:
        return False, "RuntimeEventBridge is unavailable"
    if not _has_route("/chat/stream/v4", "POST"):
        return False, "/chat/stream/v4 is not registered"
    return True, ""


def _durable_store():
    import durable_interaction_host

    store_factory = getattr(durable_interaction_host, "_session_store", None)
    if not callable(store_factory):
        raise RuntimeError("durable session store factory is unavailable")
    return store_factory()


def _execution_fencing_available() -> tuple[bool, str]:
    try:
        from unchain.execution import ExecutionRuntime, supports_execution_leases

        store = _durable_store()
        if not supports_execution_leases(store):
            return False, "durable session store does not support execution leases"
        ExecutionRuntime(store)
    except Exception as exc:
        return False, f"execution fencing unavailable: {exc}"
    return True, ""


def _durable_interactions_available() -> tuple[bool, str]:
    try:
        import durable_interaction_host

        runtime_factory = getattr(
            durable_interaction_host,
            "_interaction_runtime",
            None,
        )
        if not callable(runtime_factory):
            return False, "durable interaction runtime factory is unavailable"
        runtime_factory()
        root = _root()
        required_operations = (
            "get_pending_interaction",
            "record_interaction_receipt",
            "resume_chat_interaction_events",
        )
        missing = [
            name
            for name in required_operations
            if not callable(getattr(root, name, None))
        ]
        if missing:
            return False, (
                "missing durable interaction operations: " + ", ".join(missing)
            )
        if not _has_route("/chat/interactions/pending", "GET"):
            return False, "/chat/interactions/pending is not registered"
    except Exception as exc:
        return False, f"durable interactions unavailable: {exc}"
    return True, ""


def _exact_cancellation_available() -> tuple[bool, str]:
    try:
        import execution_control
        from unchain.execution import supports_execution_cancellation

        if not supports_execution_cancellation(_durable_store()):
            return False, "durable session store does not support exact cancellation"
        required_operations = (
            "cancellation_token",
            "request_cancel",
            "snapshot",
        )
        missing = [
            name
            for name in required_operations
            if not callable(getattr(execution_control, name, None))
        ]
        if missing:
            return False, "missing exact cancellation operations: " + ", ".join(missing)
        if not callable(getattr(_root(), "cancel_chat_execution", None)):
            return False, "cancel_chat_execution is unavailable"
        if not _has_route("/chat/executions/cancel", "POST"):
            return False, "/chat/executions/cancel is not registered"
    except Exception as exc:
        return False, f"exact cancellation unavailable: {exc}"
    return True, ""


def _durable_jobs_capability() -> dict[str, object]:
    try:
        from durable_job_runtime import get_durable_jobs_runtime

        runtime = get_durable_jobs_runtime()
    except Exception as exc:
        return {
            "version": _DURABLE_JOBS_VERSION,
            "available": False,
            "reason": f"durable jobs initialization failed: {exc}",
        }
    if runtime is None:
        return {
            "version": _DURABLE_JOBS_VERSION,
            "available": False,
            "reason": (
                "UNCHAIN_DATA_DIR is not configured"
                if not str(current_app.config.get("UNCHAIN_DATA_DIR", "") or "").strip()
                and not os.environ.get("UNCHAIN_DATA_DIR", "").strip()
                else "installed Unchain does not provide durable jobs D4.1"
            ),
        }
    return {
        "version": _DURABLE_JOBS_VERSION,
        "available": True,
        "reason": "",
    }


def _runtime_contract() -> dict[str, object]:
    runtime_events_v4, runtime_events_reason = _runtime_event_v4_available()
    execution_fencing, execution_fencing_reason = _execution_fencing_available()
    durable_interactions, durable_interactions_reason = (
        _durable_interactions_available()
    )
    exact_cancellation, exact_cancellation_reason = (
        _exact_cancellation_available()
    )
    reasons = {
        name: reason
        for name, available, reason in (
            ("runtime_events_v4", runtime_events_v4, runtime_events_reason),
            ("execution_fencing", execution_fencing, execution_fencing_reason),
            (
                "durable_interactions",
                durable_interactions,
                durable_interactions_reason,
            ),
            (
                "exact_cancellation",
                exact_cancellation,
                exact_cancellation_reason,
            ),
        )
        if not available and reason
    }
    return {
        "schema": _RUNTIME_CONTRACT_SCHEMA,
        "version": _RUNTIME_CONTRACT_VERSION,
        "capabilities": {
            "runtime_events_v4": runtime_events_v4,
            "execution_fencing": execution_fencing,
            "durable_interactions": durable_interactions,
            "exact_cancellation": exact_cancellation,
            "durable_jobs": _durable_jobs_capability(),
            "automatic_wake_resume": False,
        },
        "reasons": reasons,
    }


@api_blueprint.get("/health")
def health() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    rollout = resolve_memory_v2_rollout()
    memory_v2_capability = resolve_context_memory_v2_capability(
        requested_mode=rollout.rollout_mode,
    )
    try:
        from session_execution_guard import session_guard_migration_receipt

        session_guard_migration = session_guard_migration_receipt()
    except Exception:
        session_guard_migration = {
            "schema": "pupu.session-guard-migration",
            "version": 1,
            "status": "unavailable",
            "protocol_version": 1,
        }

    return jsonify(
        {
            "status": "ok",
            "version": current_app.config.get("UNCHAIN_VERSION", "0.1.0-dev"),
            "model": root.get_model_name(),
            "threaded": True,
            "contract": _runtime_contract(),
            "context_memory_v2": context_memory_v2_capability_status(
                memory_v2_capability
            ),
            "session_guard_migration": session_guard_migration,
        }
    )


@api_blueprint.get("/models/catalog")
def models_catalog() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    runtime = root.get_runtime_config()
    provider_catalog = root.get_capability_catalog()
    embedding_provider_catalog = root.get_embedding_provider_catalog()
    model_capabilities = root.get_model_capability_catalog()
    active_provider = str(runtime.get("provider", "ollama")).strip().lower() or "ollama"
    active_model = str(runtime.get("model", "")).strip()
    active_model_id = f"{active_provider}:{active_model}"
    active_capabilities = (
        model_capabilities.get(active_model_id)
        or root.get_default_model_capabilities()
    )

    return jsonify(
        {
            "active": {
                "provider": active_provider,
                "model": active_model,
                "model_id": active_model_id,
                "capabilities": active_capabilities,
            },
            "providers": {
                "openai": provider_catalog.get("openai", []),
                "anthropic": provider_catalog.get("anthropic", []),
                "ollama": provider_catalog.get("ollama", []),
            },
            "embedding_providers": {
                "openai": embedding_provider_catalog.get("openai", []),
            },
            "model_capabilities": model_capabilities,
        }
    )


@api_blueprint.get("/toolkits/catalog")
def toolkits_catalog() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    return jsonify(root.get_toolkit_catalog())


@api_blueprint.get("/toolkits/catalog/v2")
def toolkits_catalog_v2() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    return jsonify(root.get_toolkit_catalog_v2())


@api_blueprint.get("/toolkits/<toolkit_id>/metadata")
def toolkit_metadata(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    tool_name = request.args.get("tool_name", None)
    if isinstance(tool_name, str):
        tool_name = tool_name.strip() or None

    return jsonify(root.get_toolkit_metadata(toolkit_id, tool_name))
