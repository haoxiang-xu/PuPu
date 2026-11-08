"""Versioned explicit upgrade API; no automatic migration or file access."""
from contextlib import closing
from hashlib import sha256
import json
import re
import sqlite3

from flask import jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from route_blueprint import api_blueprint
from route_skeleton_resources import _authorized, _run
from skeleton_legacy_upgrade import inspect_legacy_upgrade
from skeleton_legacy_upgrade_choices import parse_upgrade_choices
from skeleton_legacy_upgrade_save import _resource
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore, _json_text
from skeleton_runtime_capability import require_skeleton_runtime, SkeletonRuntimeCompatibilityError


REQUEST_SCHEMA = "pupu.skeleton-legacy-upgrade.request.v1"
RESPONSE_SCHEMA = "pupu.skeleton-legacy-upgrade.response.v1"
REQUEST_BYTES = 4 * 1024 * 1024
RESPONSE_BYTES = 16 * 1024 * 1024  # Canonical payload UTF-8 bytes, not JS reserialization.
HTTP_RESPONSE_BYTES = 64 * 1024 * 1024  # Existing Main raw HTTP bound.


def _fail(code, path, message, status=400):
    raise SkeletonResourceError(code, path, message, status=status)


def _manifest():
    try:
        return require_skeleton_runtime()
    except SkeletonRuntimeCompatibilityError as exc:
        raise SkeletonResourceError(exc.code, ("runtime_manifest",), str(exc), status=409) from exc


def _query(capability=False):
    expected = {"contract"} if capability else set()
    if set(request.args) != expected or any(len(request.args.getlist(k)) != 1 for k in request.args):
        _fail("invalid_shape", ("query",), "Upgrade query must contain only unique declared fields")
    if capability and request.args["contract"] != "legacy_upgrade_v1":
        _fail("unsupported_version", ("query", "contract"), "Unsupported legacy upgrade contract")


def _body(operation):
    request.max_content_length = REQUEST_BYTES
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                _fail("duplicate_name", ("body", key), "Duplicate JSON field")
            result[key] = value
        return result
    try:
        raw = request.get_data(cache=False)
        body = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
            parse_constant=lambda _: _fail("invalid_json", ("body",), "Non-finite JSON number"))
    except RequestEntityTooLarge as exc:
        raise SkeletonResourceError("limit_bytes", ("body",), "Upgrade request is too large", status=413) from exc
    except (UnicodeError, ValueError, RecursionError) as exc:
        if isinstance(exc, SkeletonResourceError):
            raise
        raise SkeletonResourceError("invalid_json", ("body",), "Upgrade request must be UTF-8 JSON") from exc
    if type(body) is not dict:
        _fail("invalid_type", ("body",), "Upgrade request must be an object")
    fields = {"schema", "expected_edit_token", "expected_runtime_manifest_digest"}
    if operation != "inventory": fields.add("choices")
    if operation == "apply": fields.add("expected_projection_digest")
    unknown = set(body) - fields
    if unknown:
        _fail("unknown_field", ("body", sorted(unknown)[0]), "Unknown upgrade field")
    missing = fields - set(body)
    if missing:
        _fail("missing_field", ("body", sorted(missing)[0]), "Required upgrade field is missing")
    if body["schema"] != REQUEST_SCHEMA:
        _fail("unsupported_version", ("body", "schema"), "Unsupported upgrade request version")
    token = body["expected_edit_token"]
    if type(token) is not str or not token or token != token.strip():
        _fail("invalid_value", ("body", "expected_edit_token"), "Expected the exact draft edit token")
    digest = body["expected_runtime_manifest_digest"]
    if type(digest) is not str or re.fullmatch(r"sha256:[0-9a-f]{64}", digest) is None:
        _fail("invalid_value", ("body", "expected_runtime_manifest_digest"), "Expected the negotiated runtime manifest")
    if operation != "inventory": body["choices"] = parse_upgrade_choices(body["choices"])
    if operation == "apply" and (type(body["expected_projection_digest"]) is not str
            or re.fullmatch(r"[0-9a-f]{64}", body["expected_projection_digest"]) is None):
        _fail("invalid_value", ("body", "expected_projection_digest"), "Expected the exact preview digest")
    _payload_bytes(body)  # Escaped lone surrogates are not valid UTF-8 data.
    return body


def _payload_bytes(value):
    try:
        return _json_text(value).encode("utf-8")
    except UnicodeError as exc:
        raise SkeletonResourceError("invalid_unicode", ("payload",), "Upgrade data is not valid UTF-8") from exc


def _response(operation, resource_id, token, manifest, value, projection_digest=None):
    raw = _payload_bytes(value)
    if len(raw) > RESPONSE_BYTES:
        _fail("limit_bytes", ("payload",), "Upgrade response exceeds the canonical payload limit", 413)
    return {"schema": RESPONSE_SCHEMA, "operation": operation, "resource_id": resource_id,
        "expected_edit_token": token, "runtime_manifest_digest": manifest["manifest_digest"],
        "projection_digest": projection_digest, "payload_json": raw.decode("utf-8"),
        "payload_sha256": sha256(raw).hexdigest()}


def _inventory(store, identity, token):
    try:
        with closing(store._connect()) as connection:
            connection.execute("BEGIN")
            try:
                row, document, _ = _resource(store, connection, identity, token)
                return inspect_legacy_upgrade(document, edit_token=row["edit_token"], source_identity=row["source_identity"])
            finally:
                connection.rollback()
    except sqlite3.Error as exc:
        raise SkeletonResourceError("upgrade_store_error", ("resource_id",), "Upgrade inventory could not read the Store", status=409) from exc


def _serve(operation, *, prepared=False):
    denied = _authorized()
    if denied is not None:
        return denied
    if not prepared:
        return _run(operation)
    try:
        return operation()
    except Exception as error:
        # Keep the existing refusal/error policy, without putting the prepared
        # success Response through a second post-commit jsonify.
        def refused():
            raise error
        return _run(refused)


@api_blueprint.get("/skeleton_resources/legacy_upgrade/capabilities")
def legacy_upgrade_capabilities():
    def operation():
        _query(capability=True)
        return {"schema": "pupu.skeleton-legacy-upgrade.capabilities.v1", "contract": "legacy_upgrade_v1",
            "request_schema": REQUEST_SCHEMA, "response_schema": RESPONSE_SCHEMA,
            "choices_schema": "pupu.skeleton-legacy-upgrade.choices.v1", "request_bytes": REQUEST_BYTES,
            "response_bytes": RESPONSE_BYTES, "scope": "one-existing-agent", "apply_policy": "explicit-cas-preview",
            "runtime_manifest": _manifest()}
    return _serve(operation)


def _operate(kind, resource_id):
    def operation():
        _query()
        body = _body(kind)
        manifest = _manifest()
        if body["expected_runtime_manifest_digest"] != manifest["manifest_digest"]:
            _fail("upgrade_manifest_stale", ("expected_runtime_manifest_digest",),
                  "Runtime changed; obtain capabilities and preview again", 409)
        store = SkeletonResourceStore()
        token = body["expected_edit_token"]
        if kind == "inventory":
            value = _inventory(store, resource_id, token)
            digest = None
        else:
            preview = store.preview_legacy_upgrade(resource_id, expected_edit_token=token, choices=body["choices"])
            value, digest = preview, preview["projection_digest"]
            if kind == "apply":
                # Conservative pre-write budget: the saved summary can duplicate
                # document name/description, while preview also contains closure.
                # Reject large previews before the atomic Store apply starts.
                if 2 * len(_payload_bytes(preview)) + 65536 > RESPONSE_BYTES:
                    _fail("limit_bytes", ("payload",), "Preview is too large for an atomic HTTP upgrade", 413)
                prepared_response = None
                def check_result(result):
                    nonlocal prepared_response
                    envelope = _response(kind, resource_id, token, manifest, result,
                                         body["expected_projection_digest"])
                    response = jsonify(envelope)
                    if len(response.get_data()) > HTTP_RESPONSE_BYTES:
                        _fail("limit_bytes", ("payload",), "Upgrade HTTP response exceeds the byte limit", 413)
                    prepared_response = response
                value = store.apply_legacy_upgrade(resource_id, expected_edit_token=token,
                    expected_projection_digest=body["expected_projection_digest"], choices=body["choices"],
                    result_check=check_result)
                return prepared_response
        return _response(kind, resource_id, token, manifest, value, digest)
    return _serve(operation, prepared=kind == "apply")


@api_blueprint.post("/skeleton_resources/<resource_id>/legacy_upgrade/inventory")
def legacy_upgrade_inventory(resource_id):
    return _operate("inventory", resource_id)


@api_blueprint.post("/skeleton_resources/<resource_id>/legacy_upgrade/preview")
def legacy_upgrade_preview(resource_id):
    return _operate("preview", resource_id)


@api_blueprint.post("/skeleton_resources/<resource_id>/legacy_upgrade/apply")
def legacy_upgrade_apply(resource_id):
    return _operate("apply", resource_id)
