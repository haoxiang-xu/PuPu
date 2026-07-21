"""route_computer_use — HTTP surface for the computer-use feature.

Loopback-only + token-gated like every ``/chat/*`` route:

  GET  /chat/tool-media/<media_id>   serve a redacted tool-result screenshot (C4)
  GET  /computer-use/status          capability + permission contract for C3 UI
  POST /computer-use/config          set the runtime enable override (Gate B)

The screenshot bytes themselves are stored/expired by ``tool_media_store``; the
capability structure comes from the pure ``computer_control`` module (C1); the
enable state lives in the shared ``computer_use_flag`` leaf. This file is only
the Flask glue.
"""

from __future__ import annotations

import logging

from flask import Response, jsonify, request

from route_blueprint import api_blueprint

import tool_media_store

_logger = logging.getLogger("pupu.computer_use")


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.get("/chat/tool-media/<media_id>")
def get_chat_tool_media(media_id: str):
    """Serve a stored tool-result media artifact by id.

    The bytes were stripped from the SSE stream / history at the redaction choke
    point and parked in a per-session temp dir with a TTL. Auth is the standard
    loopback + token gate; ``media_id`` (uuid4) is itself an unguessable
    capability token. An optional ``session_id`` query arg scopes the lookup to
    one session's directory.
    """
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    session_id = request.args.get("session_id", "")
    resolved = tool_media_store.resolve_media(media_id, session_id or None)
    if resolved is None:
        return root._json_error(
            "media_not_found",
            "No media for this id (missing or expired)",
            404,
        )

    data, media_type = resolved
    if not str(media_type or "").lower().startswith("image/"):
        # Typed Computer payloads share the private TTL store so sessions can
        # resume safely, but they must never become downloadable media.
        return root._json_error(
            "media_not_found",
            "No media for this id (missing or expired)",
            404,
        )
    response = Response(data, mimetype=media_type)
    # Ephemeral, sensitive (a screen capture) — never let a proxy/cache retain it.
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Content-Length"] = str(len(data))
    return response


@api_blueprint.get("/computer-use/status")
def get_computer_use_status():
    """Report whether computer-use is enabled and what the platform can do.

    Pure read: ``computer_control.get_capabilities()`` never captures a
    screenshot — its macOS permission probes are preflight checks
    (``CGPreflightScreenCaptureAccess`` / ``AXIsProcessTrusted``) that neither
    grab the screen nor raise a TCC prompt. So there is no expensive deep-probe
    path to gate behind a query param; the endpoint is cheap and side-effect free.

    Top-level ``feature_available`` is the non-bypassable release/build gate;
    ``enabled`` is the effective release-gate AND user-toggle state.
    """
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    from computer_use_capabilities import resolve_computer_use_capability
    from computer_use_flag import (
        COMPUTER_USE_MODEL_PREFIXES,
        is_enabled,
        is_feature_available,
        is_local_beta_enabled,
    )
    from computer_control import get_capabilities

    # Single-source model allow-list (pupu-llm-expert authored, held in the gate
    # module). The chat tool menu reads this to decide whether to surface the
    # "Computer" entry for the active model — the frontend must never keep its own
    # copy. Static + probe-independent, so it's present even on a probe failure.
    supported_model_prefixes = list(COMPUTER_USE_MODEL_PREFIXES)
    runtime = root.get_runtime_config()
    active_provider = str(runtime.get("provider") or "ollama").strip().lower()
    active_model = str(runtime.get("model") or "").strip()
    active_route = resolve_computer_use_capability(active_provider, active_model)

    feature_available = is_feature_available()
    reason = "" if feature_available else "feature_flag_disabled"

    try:
        capabilities = get_capabilities()
    except Exception as exc:  # never 500 on a status probe
        return jsonify(
            {
                "enabled": is_enabled(),
                "feature_available": feature_available,
                "local_beta_enabled": is_local_beta_enabled(),
                "capabilities": None,
                "active": {
                    "provider": active_provider,
                    "model": active_model,
                    "computer_use": active_route,
                },
                "supported_model_prefixes": supported_model_prefixes,
                "reason": reason,
                "error": f"capability_probe_failed: {exc}",
            }
        )

    return jsonify(
        {
            "enabled": is_enabled(),
            "feature_available": feature_available,
            "local_beta_enabled": is_local_beta_enabled(),
            "capabilities": capabilities,
            "active": {
                "provider": active_provider,
                "model": active_model,
                "computer_use": active_route,
            },
            "supported_model_prefixes": supported_model_prefixes,
            "reason": reason,
        }
    )


@api_blueprint.post("/computer-use/config")
def set_computer_use_config():
    """Set the runtime enable override for computer use (Gate B).

    The renderer's localStorage holds the authoritative expected state; delivery
    is this loopback + token-gated POST that flips the sidecar's in-process
    override without a restart. The override wins over the ``PUPU_COMPUTER_USE``
    env default and is captured on the next session-store construction, so the
    tool gate and screenshot sanitization move together.

    Body may independently include ``enabled`` and/or ``local_beta_enabled``;
    each supplied value must be a real JSON boolean. A truthy string/number or
    a body containing neither key is a 400, so malformed requests cannot
    silently flip either gate. Fail-closed by construction: a sidecar restart
    clears the overrides back to their env defaults until the renderer re-pushes.
    """
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    from computer_use_flag import (
        is_enabled,
        is_feature_available,
        is_local_beta_enabled,
        set_local_beta_runtime_override,
        set_runtime_override,
    )

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not {
        "enabled", "local_beta_enabled"
    }.intersection(payload):
        return root._json_error(
            "invalid_request",
            "body must include 'enabled' or 'local_beta_enabled'",
            400,
        )

    for key in ("enabled", "local_beta_enabled"):
        if key in payload and not isinstance(payload[key], bool):
            return root._json_error(
                "invalid_request", f"'{key}' must be a JSON boolean", 400
            )

    previous = is_enabled()
    previous_local = is_local_beta_enabled()
    if "enabled" in payload:
        set_runtime_override(payload["enabled"])
    if "local_beta_enabled" in payload:
        set_local_beta_runtime_override(payload["local_beta_enabled"])
    resolved = is_enabled()
    feature_available = is_feature_available()
    resolved_local = is_local_beta_enabled()
    _logger.info(
        "computer-use runtime config updated: enabled=%s->%s local_beta=%s->%s",
        previous,
        resolved,
        previous_local,
        resolved_local,
    )
    return jsonify(
        {
            "enabled": resolved,
            "feature_available": feature_available,
            "local_beta_enabled": resolved_local,
            "reason": "" if feature_available else "feature_flag_disabled",
        }
    )


@api_blueprint.post("/computer-use/probe")
def probe_computer_use_model():
    """Run the explicit, bounded Ollama local-Beta model probe."""
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    from computer_use_capabilities import LOCAL_COMPUTER_MODEL_PREFIXES
    from computer_use_flag import is_local_beta_enabled
    from computer_use_probe import probe_local_model

    if not is_local_beta_enabled():
        return root._json_error(
            "local_beta_disabled",
            "Enable the local Computer Beta before probing a model",
            409,
        )
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("model"), str):
        return root._json_error("invalid_request", "'model' must be a string", 400)
    model = payload["model"].strip().lower()
    if not model or not any(model.startswith(prefix) for prefix in LOCAL_COMPUTER_MODEL_PREFIXES):
        return root._json_error(
            "unsupported_model",
            "model is not in the local Computer Beta candidate list",
            400,
        )
    force = payload.get("force", False)
    if not isinstance(force, bool):
        return root._json_error("invalid_request", "'force' must be a boolean", 400)
    result = probe_local_model(model, force=force)
    # A failed capability check is a normal probe result, not a transport
    # failure; return 200 so Settings can display the precise fail-closed reason.
    return jsonify(result)
