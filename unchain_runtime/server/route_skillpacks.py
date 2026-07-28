from flask import Response, jsonify, request

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


def _skillpack_error_response(root, exc):
    code = getattr(exc, "code", "skill_pack_request_failed")
    status = int(getattr(exc, "status", 500) or 500)
    message = str(exc) or "Skill pack request failed"
    return root._json_error(code, message, status)


@api_blueprint.get("/skillpacks")
def list_skill_packs_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    packs = root.list_installed_skill_packs()
    return jsonify({"toolkits": packs, "count": len(packs)})


@api_blueprint.post("/skillpacks/install")
def install_skill_pack_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    payload = request.get_json(silent=True) or {}
    raw_pack = payload.get("pack")
    pack = raw_pack if isinstance(raw_pack, dict) else None

    try:
        result = root.install_skill_pack(pack)
        return jsonify(result)
    except Exception as exc:
        return _skillpack_error_response(root, exc)


@api_blueprint.delete("/skillpacks/<path:toolkit_id>")
def delete_skill_pack_route(toolkit_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    try:
        result = root.delete_skill_pack(toolkit_id)
        return jsonify(result)
    except Exception as exc:
        return _skillpack_error_response(root, exc)
