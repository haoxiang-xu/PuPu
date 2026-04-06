from flask import Response, jsonify, request, send_file

from route_blueprint import api_blueprint


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.get("/characters/seeds")
def list_seed_characters() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        return jsonify(root.character_defaults.list_seed_characters())
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "seed_character_list_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.get("/characters/seeds/<character_id>/avatar")
def get_seed_character_avatar(character_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    avatar_path = root.character_defaults.get_seed_avatar_path(character_id)
    if not avatar_path:
        return Response(status=404)

    response = send_file(
        avatar_path,
        mimetype="image/png",
        conditional=False,
        max_age=0,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@api_blueprint.get("/characters")
def list_characters() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        return jsonify(root.character_store.list_characters())
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_list_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.get("/characters/<character_id>/avatar")
def get_character_avatar(character_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    avatar_asset = root.character_store.get_character_avatar_asset(character_id)
    if not avatar_asset:
        return Response(status=404)

    response = send_file(
        avatar_asset["path"],
        mimetype=avatar_asset["mime_type"],
        conditional=False,
        max_age=0,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@api_blueprint.get("/characters/<character_id>")
def get_character(character_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        payload = root.character_store.get_character(character_id)
        if payload is None:
            return root._json_error("not_found", "Character not found", 404)
        return jsonify(payload)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_get_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/characters")
def save_character() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "payload must be an object", 400)

    try:
        return jsonify(root.character_store.save_character(payload))
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_save_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.delete("/characters/<character_id>")
def delete_character(character_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        return jsonify(root.character_store.delete_character(character_id))
    except KeyError:
        return root._json_error("not_found", "Character not found", 404)
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_delete_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/characters/preview")
def preview_character_decision() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "payload must be an object", 400)

    try:
        return jsonify(root.character_store.preview_character_decision(payload))
    except KeyError:
        return root._json_error("not_found", "Character not found", 404)
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_preview_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/characters/build")
def build_character_agent_config() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "payload must be an object", 400)

    try:
        return jsonify(root.character_store.build_character_agent_config(payload))
    except KeyError:
        return root._json_error("not_found", "Character not found", 404)
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_build_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/characters/<character_id>/export")
def export_character(character_id: str) -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "payload must be an object", 400)

    file_path = payload.get("file_path") or payload.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        return root._json_error("invalid_request", "file_path is required", 400)

    try:
        return jsonify(
            root.character_store.export_character(
                {
                    "character_id": character_id,
                    "file_path": file_path.strip(),
                }
            )
        )
    except KeyError:
        return root._json_error("not_found", "Character not found", 404)
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_export_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/characters/import")
def import_character() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return root._json_error("invalid_request", "payload must be an object", 400)

    file_path = payload.get("file_path") or payload.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        return root._json_error("invalid_request", "file_path is required", 400)

    try:
        return jsonify(root.character_store.import_character({"file_path": file_path.strip()}))
    except ValueError as exc:
        return root._json_error("invalid_request", str(exc), 400)
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "character_import_failed",
                    "message": str(exc),
                }
            }
        ), 500
