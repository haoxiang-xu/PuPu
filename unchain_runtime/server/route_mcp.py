from flask import Response, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


def _mcp_error_response(root, exc):
    code = getattr(exc, "code", "mcp_request_failed")
    status = int(getattr(exc, "status", 500) or 500)
    message = str(exc) or "MCP request failed"
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

    try:
        result = root.install_mcp_toolkit(entry_id, workspace_root=workspace_root)
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
