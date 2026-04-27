"""Flask routes for Agent Recipes.

Registered onto the shared `api_blueprint`. Follows the auth + error-handling
pattern from route_characters.py.
"""
from __future__ import annotations

import json
import logging

from flask import jsonify, request

from route_blueprint import api_blueprint

_logger = logging.getLogger(__name__)


def _root():
    import routes as routes_module

    return routes_module


@api_blueprint.get("/agent_recipes")
def list_agent_recipes():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import list_recipes
        recipes = list_recipes()
        return jsonify({"recipes": recipes, "count": len(recipes)})
    except Exception as exc:
        _logger.exception("[route_recipes] list failed")
        return jsonify({"error": {"code": "recipe_list_failed", "message": str(exc)}}), 500


@api_blueprint.get("/agent_recipes/subagent_refs")
def list_agent_recipe_subagent_refs():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import list_subagent_refs
        refs = list_subagent_refs()
        return jsonify({"refs": refs, "count": len(refs)})
    except Exception as exc:
        _logger.exception("[route_recipes] subagent_refs failed")
        return jsonify({"error": {"code": "subagent_refs_failed", "message": str(exc)}}), 500


@api_blueprint.get("/agent_recipes/<name>")
def get_agent_recipe(name: str):
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import load_recipe, recipes_dir
        recipe = load_recipe(name)
        if recipe is None:
            return root._json_error("not_found", "Recipe not found", 404)
        path = recipes_dir() / f"{name}.recipe"
        return jsonify(json.loads(path.read_text(encoding="utf-8")))
    except Exception as exc:
        _logger.exception("[route_recipes] get failed")
        return jsonify({"error": {"code": "recipe_get_failed", "message": str(exc)}}), 500


@api_blueprint.post("/agent_recipes")
def save_agent_recipe():
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        payload = request.get_json(force=True) or {}
        from recipe_loader import save_recipe
        save_recipe(payload)
        return jsonify({"ok": True, "name": payload.get("name")})
    except ValueError as exc:
        return jsonify({"error": {"code": "recipe_invalid", "message": str(exc)}}), 400
    except Exception as exc:
        _logger.exception("[route_recipes] save failed")
        return jsonify({"error": {"code": "recipe_save_failed", "message": str(exc)}}), 500


@api_blueprint.delete("/agent_recipes/<name>")
def delete_agent_recipe(name: str):
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)
    try:
        from recipe_loader import delete_recipe
        delete_recipe(name)
        return jsonify({"ok": True})
    except ValueError as exc:
        return jsonify({"error": {"code": "recipe_delete_refused", "message": str(exc)}}), 400
    except Exception as exc:
        _logger.exception("[route_recipes] delete failed")
        return jsonify({"error": {"code": "recipe_delete_failed", "message": str(exc)}}), 500
