from html import escape

from flask import Response, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


def _mcp_error_response(root, exc):
    code = getattr(exc, "code", "mcp_request_failed")
    status = int(getattr(exc, "status", 500) or 500)
    message = str(exc) or "MCP request failed"
    diagnostics = getattr(exc, "diagnostics", [])
    if diagnostics:
        return jsonify({"error": {"code": code, "message": message, "diagnostics": diagnostics}}), status
    return root._json_error(code, message, status)


@api_blueprint.get("/mcp/toolkits")
def list_mcp_toolkits() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    toolkits = root.list_installed_mcp_toolkits()
    return jsonify({"toolkits": toolkits, "count": len(toolkits)})


@api_blueprint.post("/mcp/toolkits/install")
def install_mcp_toolkit_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    entry_id = str(payload.get("entry_id") or payload.get("entryId") or "").strip()
    workspace_root = str(
        payload.get("workspaceRoot") or payload.get("workspace_root") or ""
    ).strip()
    raw_secrets = payload.get("secrets")
    secrets = raw_secrets if isinstance(raw_secrets, dict) else {}
    raw_custom_recipe = payload.get("customRecipe") or payload.get("custom_recipe")
    custom_recipe = raw_custom_recipe if isinstance(raw_custom_recipe, dict) else None

    try:
        result = root.install_mcp_toolkit(
            entry_id,
            workspace_root=workspace_root,
            secrets=secrets,
            custom_recipe=custom_recipe,
        )
        return jsonify(result)
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.delete("/mcp/toolkits/<toolkit_id>")
def delete_mcp_toolkit_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.delete_mcp_toolkit(toolkit_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/toolkits/reload")
def reload_mcp_toolkits_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    workspace_root = str(
        payload.get("workspaceRoot") or payload.get("workspace_root") or ""
    ).strip()

    try:
        return jsonify(root.reload_mcp_toolkits(workspace_root=workspace_root))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/toolkits/<toolkit_id>/health")
def check_mcp_toolkit_health_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    workspace_root = str(
        payload.get("workspaceRoot") or payload.get("workspace_root") or ""
    ).strip()

    try:
        return jsonify(
            root.check_mcp_toolkit_health(
                toolkit_id,
                workspace_root=workspace_root,
            )
        )
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/toolkits/<toolkit_id>/configure")
def configure_mcp_toolkit_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    workspace_root = str(
        payload.get("workspaceRoot") or payload.get("workspace_root") or ""
    ).strip()
    raw_secrets = payload.get("secrets")
    secrets = raw_secrets if isinstance(raw_secrets, dict) else {}

    try:
        return jsonify(
            root.configure_mcp_toolkit(
                toolkit_id,
                workspace_root=workspace_root,
                secrets=secrets,
            )
        )
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/oauth/start")
def start_mcp_oauth_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    entry_id = str(payload.get("entry_id") or payload.get("entryId") or "").strip()

    try:
        return jsonify(
            root.start_mcp_oauth(
                entry_id,
                callback_base_url=request.host_url.rstrip("/"),
            )
        )
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.get("/mcp/oauth/callback")
def mcp_oauth_callback_route() -> Response:
    root = _root()
    code = str(request.args.get("code") or "").strip()
    state = str(request.args.get("state") or "").strip()
    error = str(request.args.get("error") or "").strip()
    error_description = str(request.args.get("error_description") or "").strip()

    try:
        if error or error_description:
            root.handle_mcp_oauth_callback(
                code,
                state,
                error=error,
                error_description=error_description,
            )
        else:
            root.handle_mcp_oauth_callback(code, state)
        return Response(
            "<!doctype html><title>PuPu MCP</title><h1>MCP connected</h1>"
            "<p>You can close this browser tab and return to PuPu.</p>",
            status=200,
            mimetype="text/html",
        )
    except Exception as exc:
        status = int(getattr(exc, "status", 400) or 400)
        message = escape(str(exc) or "OAuth callback failed")
        return Response(
            "<!doctype html><title>PuPu MCP</title><h1>MCP connection failed</h1>"
            f"<p>{message}</p>",
            status=status,
            mimetype="text/html",
        )


@api_blueprint.get("/mcp/oauth/status")
def mcp_oauth_status_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    entry_id = str(
        request.args.get("entry_id")
        or request.args.get("entryId")
        or request.args.get("toolkit_id")
        or request.args.get("toolkitId")
        or ""
    ).strip()
    try:
        return jsonify(root.get_mcp_oauth_status(entry_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.get("/mcp/oauth/apps")
def list_mcp_oauth_apps_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.list_mcp_oauth_apps())
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/oauth/apps/configure")
def configure_mcp_oauth_app_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(root.configure_mcp_oauth_app(payload))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.delete("/mcp/oauth/apps/<toolkit_id>")
def delete_mcp_oauth_app_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.delete_mcp_oauth_app(toolkit_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.delete("/mcp/oauth/<toolkit_id>")
def disconnect_mcp_oauth_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.disconnect_mcp_oauth(toolkit_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.get("/mcp/store/metadata")
def list_mcp_store_metadata_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.list_mcp_store_metadata())
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/store/metadata/reload")
def reload_mcp_store_metadata_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    entry_id = str(payload.get("entry_id") or payload.get("entryId") or "").strip()
    try:
        return jsonify(root.reload_mcp_store_metadata(entry_id=entry_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.get("/mcp/store/entries")
def list_mcp_store_entries_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.list_mcp_store_entries())
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/store/entries/<entry_id>/approve")
def approve_mcp_store_entry_route(entry_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    registry_id = str(payload.get("registry_id") or payload.get("registryId") or "").strip()
    acknowledged_risk = bool(
        payload.get("acknowledgedRisk") or payload.get("acknowledged_risk")
    )
    try:
        return jsonify(
            root.approve_mcp_store_entry(
                entry_id,
                registry_id=registry_id,
                acknowledged_risk=acknowledged_risk,
            )
        )
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.delete("/mcp/store/entries/<entry_id>/approval")
def revoke_mcp_store_entry_approval_route(entry_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    registry_id = str(payload.get("registry_id") or payload.get("registryId") or "").strip()
    try:
        return jsonify(root.revoke_mcp_store_entry_approval(entry_id, registry_id=registry_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.get("/mcp/store/registries")
def list_mcp_store_registries_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.list_mcp_store_registries())
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/store/registries/import")
def import_mcp_store_registry_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(root.import_mcp_store_registry(payload))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/store/registries/validate")
def validate_mcp_store_registry_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(root.validate_mcp_store_registry(payload))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.post("/mcp/store/registries/<registry_id>/refresh")
def refresh_mcp_store_registry_route(registry_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.refresh_mcp_store_registry(registry_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)


@api_blueprint.delete("/mcp/store/registries/<registry_id>")
def delete_mcp_store_registry_route(registry_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        return jsonify(root.delete_mcp_store_registry(registry_id))
    except Exception as exc:
        return _mcp_error_response(root, exc)
