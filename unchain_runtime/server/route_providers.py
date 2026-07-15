"""Custom Model Provider routes — test-connection endpoint (design §7.6).

``POST /models/custom-providers/test`` takes ``{custom_provider, api_key}`` (the
api_key is one-shot and NEVER persisted), builds a client with the same factory
the chat path uses, sends the smallest possible request, and returns a structured
result. Every error message is passed through the redactor before leaving the
process.
"""

from flask import Response, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.post("/models/custom-providers/test")
def test_custom_provider_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    # Import lazily so a missing unchain install does not break blueprint import.
    from custom_provider import redact_text, test_custom_provider

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "Request body must be a JSON object", 400)

    custom_provider = payload.get("custom_provider")
    api_key = payload.get("api_key")
    if not isinstance(custom_provider, dict):
        return root._json_error("invalid_request", "custom_provider is required", 400)

    try:
        result = test_custom_provider(custom_provider, api_key if isinstance(api_key, str) else "")
    except Exception as exc:  # noqa: BLE001 - never surface a raw (unredacted) trace
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "provider_bad_response",
                        "message": redact_text(str(exc)),
                    },
                }
            ),
            200,
        )

    # 200 for both success and structured failure — the body's ``ok`` field is the
    # signal (matches the frontend testCustomProvider facade expectation).
    return jsonify(result)
