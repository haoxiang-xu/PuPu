"""route_computer_use — HTTP surface for the computer-use feature.

Two read endpoints, both loopback-only + token-gated like every ``/chat/*`` route:

  GET /chat/tool-media/<media_id>   serve a redacted tool-result screenshot (C4)
  GET /computer-use/status          capability + permission contract for C3 UI

The screenshot bytes themselves are stored/expired by ``tool_media_store``; the
capability structure comes from the pure ``computer_control`` module (C1). This
file is only the Flask glue.
"""

from __future__ import annotations

from flask import Response, jsonify, request

from route_blueprint import api_blueprint

import tool_media_store


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

    Top-level ``enabled`` is the ``PUPU_COMPUTER_USE`` feature-flag state so the
    C3 UI can tell "feature turned on" from "platform can do it" in one round trip.
    """
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    from unchain_adapter import _computer_use_enabled
    from computer_control import get_capabilities

    try:
        capabilities = get_capabilities()
    except Exception as exc:  # never 500 on a status probe
        return jsonify(
            {
                "enabled": _computer_use_enabled(),
                "capabilities": None,
                "error": f"capability_probe_failed: {exc}",
            }
        )

    return jsonify(
        {
            "enabled": _computer_use_enabled(),
            "capabilities": capabilities,
        }
    )
