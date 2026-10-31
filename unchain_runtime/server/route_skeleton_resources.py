"""Authenticated fixed-shape API for Skeleton Agent and Workflow resources."""

from __future__ import annotations

import logging

from flask import jsonify, request
from werkzeug.exceptions import BadRequest

from route_blueprint import api_blueprint
from route_chat import _sanitize_memory_agent_config
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore


_logger = logging.getLogger(__name__)


@api_blueprint.post("/skeleton_credentials/requirements")
def skeleton_credential_requirements():
    """Main-only discovery: target metadata, never credential values.

    Authentication is the same as the actual stream. The request contains only
    public selectors; the host resolves its own fixed graph or verified launch.
    """
    denied = _authorized()
    if denied is not None:
        return denied

    def operation():
        import re
        from durable_interaction_host import DurableInteractionHostError
        from skeleton_credential_requirements import requirements_for_start, requirements_for_resume
        fields = ("schema", "mode", "session_id", "owner_chat_id", "interaction_id",
                  "source_attempt_id", "selection", "recipe_name", "memory_agent_config")
        body = _payload(*fields)
        if set(body) != set(fields):
            raise SkeletonResourceError("invalid_shape", ("body",), "Credential query fields are required.")
        if body["schema"] != "pupu.skeleton_credential_query.v1":
            raise SkeletonResourceError("unsupported_version", ("body", "schema"), "Unsupported credential query version.")
        if body["mode"] not in ("start", "resume"):
            raise SkeletonResourceError("unknown_variant", ("body", "mode"), "Unknown credential query mode.")
        for field in ("session_id", "owner_chat_id", "interaction_id", "source_attempt_id"):
            value = body[field]
            optional = field in ("interaction_id", "source_attempt_id")
            if type(value) is not str or (not value and not optional) or (value and
                    re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,255}", value) is None):
                raise SkeletonResourceError("invalid_value", ("body", field), "Credential query identity is invalid.")
        if ((body["mode"] == "start" and (body["interaction_id"] or body["source_attempt_id"]))
                or (body["mode"] == "resume" and not body["interaction_id"])):
            raise SkeletonResourceError("invalid_value", ("body", "interaction_id"), "Credential query interaction is invalid.")
        if type(body["recipe_name"]) is not str:
            raise SkeletonResourceError("invalid_type", ("body", "recipe_name"), "Recipe name must be a string.")
        try:
            config = _sanitize_memory_agent_config(body["memory_agent_config"])
        except ValueError as error:
            raise SkeletonResourceError("invalid_value", ("body", "memory_agent_config"),
                "Memory Agent configuration is invalid.") from error
        try:
            if body["mode"] == "start":
                return requirements_for_start(body, memory_provider=config["provider"], store=SkeletonResourceStore())
            return requirements_for_resume(body, memory_provider=config["provider"])
        except DurableInteractionHostError as error:
            raise SkeletonResourceError(error.code, tuple(getattr(error, "path", ())),
                str(error), status=error.status_code) from error
    return _run(operation)


def _root():
    import routes as routes_module
    return routes_module


def _authorized():
    root = _root()
    if root._is_authorized():
        return None
    return jsonify({"error": {
        "code": "unauthorized", "path": [], "message": "Unauthorized",
    }}), 401


def _payload(*allowed_fields: str):
    try:
        value = request.get_json(force=True)
    except BadRequest as exc:
        raise SkeletonResourceError(
            "invalid_json", ("body",), "request body must be valid JSON",
        ) from exc
    if value is None:
        value = {}
    if type(value) is not dict:
        raise SkeletonResourceError("invalid_type", ("body",), "request body must be an object")
    unknown = set(value).difference(allowed_fields)
    if unknown:
        field = sorted(unknown)[0]
        raise SkeletonResourceError(
            "unknown_field", ("body", field), "request body contains an unknown field",
        )
    return value


def _error(error: SkeletonResourceError):
    return jsonify({"error": {"code": error.code, "path": list(error.path),
                              "message": str(error)}}), error.status


def _run(operation):
    try:
        return jsonify(operation())
    except SkeletonResourceError as exc:
        return _error(exc)
    except Exception:
        _logger.exception("[route_skeleton_resources] request failed")
        return jsonify({"error": {"code": "skeleton_store_failed", "path": [],
                                  "message": "Skeleton resource operation failed."}}), 500


@api_blueprint.get("/skeleton_resources")
def list_skeleton_resources():
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: {"resources": SkeletonResourceStore().list_resources(
        include_archived=request.args.get("include_archived", "true").lower() != "false")})


@api_blueprint.get("/skeleton_resources/<resource_id>")
def get_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().get_resource(resource_id))


@api_blueprint.post("/skeleton_resources")
def save_skeleton_resource():
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("document", "expected_edit_token")
        return SkeletonResourceStore().save_draft(
            body.get("document"), expected_edit_token=body.get("expected_edit_token"),
        )
    return _run(operation)


@api_blueprint.post("/skeleton_resources/diagnose")
def diagnose_skeleton_resource():
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: {"diagnostics": SkeletonResourceStore().diagnose(
        _payload("document").get("document"))})


@api_blueprint.post("/skeleton_resources/import")
def import_skeleton_resource():
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().import_resource(
        _payload("document").get("document")))


@api_blueprint.post("/skeleton_resources/<resource_id>/preflight")
def preflight_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().preflight(
        resource_id,
        legacy_kernel=_payload("legacy_kernel").get("legacy_kernel"),
    ))


@api_blueprint.post("/skeleton_resources/<resource_id>/convert_legacy_pools")
def convert_skeleton_legacy_pools(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("expected_edit_token", "legacy_kernel")
        return SkeletonResourceStore().convert_legacy_pools(
            resource_id,
            expected_edit_token=body.get("expected_edit_token"),
            legacy_kernel=body.get("legacy_kernel"),
        )
    return _run(operation)


@api_blueprint.post("/skeleton_resources/<resource_id>/publish")
def publish_skeleton_workflow(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().publish_workflow(
        resource_id,
        expected_edit_token=_payload("expected_edit_token").get("expected_edit_token"),
    ))


@api_blueprint.get("/skeleton_resources/<resource_id>/versions/<revision_id>")
def get_skeleton_workflow_version(resource_id: str, revision_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().get_workflow_version(resource_id, revision_id))


@api_blueprint.post("/skeleton_resources/<resource_id>/rename")
def rename_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("name", "expected_edit_token")
        return SkeletonResourceStore().rename(resource_id, body.get("name"),
            expected_edit_token=body.get("expected_edit_token"))
    return _run(operation)


@api_blueprint.post("/skeleton_resources/<resource_id>/duplicate")
def duplicate_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("new_id", "name")
        return SkeletonResourceStore().duplicate(resource_id, new_id=body.get("new_id"),
                                                  name=body.get("name"))
    return _run(operation)


def _archive_operation(resource_id: str, archived: bool):
    body = _payload("expected_edit_token"); store = SkeletonResourceStore()
    return (store.archive if archived else store.restore)(
        resource_id, expected_edit_token=body.get("expected_edit_token"))


@api_blueprint.post("/skeleton_resources/<resource_id>/archive")
def archive_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: _archive_operation(resource_id, True))


@api_blueprint.post("/skeleton_resources/<resource_id>/restore")
def restore_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: _archive_operation(resource_id, False))


@api_blueprint.delete("/skeleton_resources/<resource_id>")
def delete_skeleton_resource(resource_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        SkeletonResourceStore().delete(resource_id,
            expected_edit_token=_payload("expected_edit_token").get("expected_edit_token"))
        return {"ok": True}
    return _run(operation)


@api_blueprint.post("/skeleton_resources/migrate")
def migrate_skeleton_resource():
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload(
            "source_identity", "source_scope", "source_kind", "source",
            "stop_after_stage",
        )
        return SkeletonResourceStore().migrate_legacy(
            source_identity=body.get("source_identity"),
            source_scope=body.get("source_scope"), source_kind=body.get("source_kind"),
            source=body.get("source"), stop_after_stage=body.get("stop_after_stage"),
        )
    return _run(operation)


@api_blueprint.post("/skeleton_resources/resolve")
def resolve_skeleton_resource():
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload(
            "resource_id", "revision_id", "legacy_name", "source_scope",
            "default_if_unselected",
        )
        return SkeletonResourceStore().resolve(
            resource_id=body.get("resource_id"), revision_id=body.get("revision_id"),
            legacy_name=body.get("legacy_name"), source_scope=body.get("source_scope"),
            default_if_unselected=body.get("default_if_unselected") is True,
        )
    return _run(operation)


@api_blueprint.get("/skeleton_kernel_profiles")
def list_skeleton_kernel_profiles():
    """Candidate Kernel Loop profiles for the builder.

    Read-only and derived: nothing here is stored, and the answer is a
    function of the installed wheel's capability catalog plus this host's
    official endpoints. It carries both halves — what can be configured and
    why the rest cannot — because a model that is simply absent from a picker
    is indistinguishable from one PuPu forgot.
    """
    denied = _authorized()
    if denied is not None:
        return denied

    def operation():
        from skeleton_kernel_profiles import kernel_profiles

        return kernel_profiles()

    return _run(operation)


@api_blueprint.post("/skeleton_skills/preview")
def preview_skeleton_skill():
    """The body a Skill Read node naming this exact identity would read (#352).

    Read-only: the Skill Read panel's preview. See `skeleton_step_catalogs`
    for why it is the runtime's own read and which roots it searches.
    """
    denied = _authorized()
    if denied is not None:
        return denied
    from skeleton_step_catalogs import skill_preview
    return _run(lambda: skill_preview(_payload("skill", "include_user_dirs")))


@api_blueprint.get("/skeleton_tools/schemas")
def list_skeleton_tool_schemas():
    """The runtime's own argument schemas for one builtin toolkit (#352).

    Read-only: the Tool Call panel renders one argument row per property of
    the chosen tool. See `skeleton_step_catalogs` for why these and no others.
    """
    denied = _authorized()
    if denied is not None:
        return denied

    def operation():
        from skeleton_step_catalogs import tool_schemas

        return tool_schemas(request.args.get("toolkit"))

    return _run(operation)


@api_blueprint.get("/skeleton_python_profiles")
def list_skeleton_python_profiles():
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: {"profiles": SkeletonResourceStore().list_python_profiles()})


@api_blueprint.post("/skeleton_python_profiles")
def save_skeleton_python_profile():
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("profile_id", "executable", "expected_edit_token")
        return SkeletonResourceStore().save_python_profile(
            body.get("profile_id"), body.get("executable"),
            expected_edit_token=body.get("expected_edit_token"),
        )
    return _run(operation)


@api_blueprint.post("/skeleton_python_profiles/<profile_id>/probe")
def probe_skeleton_python_profile(profile_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    return _run(lambda: SkeletonResourceStore().probe_python_profile(profile_id))


@api_blueprint.delete("/skeleton_python_profiles/<profile_id>")
def delete_skeleton_python_profile(profile_id: str):
    denied = _authorized()
    if denied is not None:
        return denied
    def operation():
        body = _payload("expected_edit_token")
        SkeletonResourceStore().delete_python_profile(
            profile_id, expected_edit_token=body.get("expected_edit_token"),
        )
        return {"ok": True}
    return _run(operation)


__all__ = []
