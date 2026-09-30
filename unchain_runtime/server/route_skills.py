"""Skill inventory route (ticket #291, BC-005).

`GET /skills/inventory?workspace_root=<path>&include_user_dirs=<bool>&toolkits=<id,id>` returns
the backend-authoritative `pupu.skill_inventory.v1` projection the renderer
uses for its command menu; the same resolver backs the per-send stale check
in `route_chat` (`options.skill_inventory_revision`).
"""
from __future__ import annotations

from flask import Response, jsonify, request

from route_blueprint import api_blueprint
from skills_inventory import inventory_payload, resolve_skill_inventory


def _root():
    import routes as routes_module

    return routes_module


def _parse_bool(raw: str | None, default: bool) -> bool | None:
    if raw is None or raw == "":
        return default
    lowered = raw.strip().lower()
    if lowered in {"true", "1", "yes", "on"}:
        return True
    if lowered in {"false", "0", "no", "off"}:
        return False
    return None


def resolve_inventory_for_request(
    *,
    workspace_root: str | None,
    include_user_dirs: bool,
    selected_toolkit_ids: list[str] | tuple[str, ...] = (),
):
    """Resolve the effective inventory for a workspace + toolkit selection."""

    resolved_root: str | None = None
    if workspace_root:
        roots = _root()._resolve_workspace_roots([workspace_root])
        resolved_root = roots[0] if roots else None
    return resolve_skill_inventory(
        workspace_root=resolved_root,
        include_user_dirs=include_user_dirs,
        selected_toolkit_ids=tuple(selected_toolkit_ids),
    )


@api_blueprint.get("/skills/inventory")
def skill_inventory_route() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Invalid auth token", 401)

    workspace_root = str(request.args.get("workspace_root") or "").strip() or None
    include_user_dirs = _parse_bool(request.args.get("include_user_dirs"), True)
    if include_user_dirs is None:
        return root._json_error(
            "invalid_request", "include_user_dirs must be a boolean", 400
        )
    raw_toolkits = str(request.args.get("toolkits") or "")
    selected_toolkit_ids = [item.strip() for item in raw_toolkits.split(",") if item.strip()]
    inventory = resolve_inventory_for_request(
        workspace_root=workspace_root,
        include_user_dirs=include_user_dirs,
        selected_toolkit_ids=selected_toolkit_ids,
    )
    return jsonify(inventory_payload(inventory))
