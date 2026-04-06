from flask import Response, current_app, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.get("/health")
def health() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    return jsonify(
        {
            "status": "ok",
            "version": current_app.config.get("UNCHAIN_VERSION", "0.1.0-dev"),
            "model": root.get_model_name(),
            "threaded": True,
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
