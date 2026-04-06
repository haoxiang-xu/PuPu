from flask import Response, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.post("/memory/session/replace")
def replace_memory_session() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    session_id_raw = payload.get("session_id") or payload.get("sessionId")
    session_id = str(session_id_raw or "").strip()
    if not session_id:
        return root._json_error("invalid_request", "session_id is required", 400)

    raw_messages = payload.get("messages")
    if not isinstance(raw_messages, list):
        return root._json_error("invalid_request", "messages must be an array", 400)

    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}

    try:
        import memory_factory

        result = memory_factory.replace_short_term_session_memory(
            session_id=session_id,
            messages=raw_messages,
            options=options,
        )
        return jsonify(result)
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "memory_replace_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.get("/memory/session/export")
def export_memory_session() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    session_id = str(request.args.get("session_id", "")).strip()
    if not session_id:
        return root._json_error("invalid_request", "session_id is required", 400)

    import memory_factory

    data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
    if not data_dir:
        return jsonify({"messages": []})

    state = memory_factory._load_session_state(data_dir, session_id)
    messages = state.get("messages", [])
    if not isinstance(messages, list):
        messages = []

    return jsonify({"session_id": session_id, "messages": messages})
