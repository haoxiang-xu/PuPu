"""Actual Flask route producer, real private Store, fixed installed Core."""
from copy import deepcopy
from hashlib import sha256
import json
import sys

import pytest

from app import create_app
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_legacy_upgrade_save import migrate, recipe, tables

REQUEST = "pupu.skeleton-legacy-upgrade.request.v1"
CAP = "/skeleton_resources/legacy_upgrade/capabilities"
MANIFEST = "sha256:c172bc02718aee771ddd4d247904f13cdaf003d3794148fd3ecd4d4e9a419e6b"


@pytest.fixture
def context(tmp_path, monkeypatch):
    store = SkeletonResourceStore(tmp_path / "resources")
    resource, choices = migrate(store, recipe())
    module = sys.modules.get("route_skeleton_legacy_upgrade")
    if module is not None:
        monkeypatch.setattr(module, "SkeletonResourceStore", lambda: store)
    app = create_app(); app.config["UNCHAIN_AUTH_TOKEN"] = "offline-test-only"
    return store, resource, choices, app.test_client()


def request_body(resource, choices, operation):
    body = {"schema": REQUEST, "expected_edit_token": resource["edit_token"],
            "expected_runtime_manifest_digest": MANIFEST}
    if operation != "inventory": body["choices"] = choices
    return body


def post(client, resource, operation, body, **kwargs):
    return client.post(f"/skeleton_resources/{resource['id']}/legacy_upgrade/{operation}",
                       headers={"x-unchain-auth": "offline-test-only"}, json=body, **kwargs)


def payload(response, operation, resource):
    assert response.status_code == 200, response.get_json()
    value = response.get_json()
    assert set(value) == {"schema", "operation", "resource_id", "expected_edit_token", "projection_digest",
                          "runtime_manifest_digest", "payload_json", "payload_sha256"}
    assert value["schema"] == "pupu.skeleton-legacy-upgrade.response.v1"
    assert value["operation"] == operation and value["resource_id"] == resource["id"]
    assert value["expected_edit_token"] == resource["edit_token"]
    assert sha256(value["payload_json"].encode()).hexdigest() == value["payload_sha256"]
    assert value["runtime_manifest_digest"].startswith("sha256:c172bc02")
    return json.loads(value["payload_json"]), value


@pytest.mark.parametrize("operation", ["inventory", "preview", "apply", "capabilities"])
def test_unauthorized_upgrade_operations_do_not_write(context, operation):
    store, resource, choices, client = context
    before = tables(store)
    if operation == "capabilities": response = client.get(CAP + "?contract=legacy_upgrade_v1")
    else: response = client.post(f"/skeleton_resources/{resource['id']}/legacy_upgrade/{operation}", json={})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"
    assert tables(store) == before


def test_actual_manifest_capability_is_closed_and_requires_exact_negotiation(context):
    store, _, _, client = context
    before = tables(store)
    response = client.get(CAP + "?contract=legacy_upgrade_v1", headers={"x-unchain-auth": "offline-test-only"})
    assert response.status_code == 200
    value = response.get_json()
    assert set(value) == {"schema", "contract", "request_schema", "response_schema", "choices_schema",
        "request_bytes", "response_bytes", "scope", "apply_policy", "runtime_manifest"}
    assert value["request_schema"] == REQUEST
    assert value["contract"] == "legacy_upgrade_v1"
    assert value["runtime_manifest"]["manifest_digest"].startswith("sha256:c172bc02")
    for query, code in [("", "invalid_shape"), ("?contract=future", "unsupported_version"),
                        ("?contract=legacy_upgrade_v1&contract=legacy_upgrade_v1", "invalid_shape"),
                        ("?contract=legacy_upgrade_v1&extra=true", "invalid_shape")]:
        reply = client.get(CAP + query, headers={"x-unchain-auth": "offline-test-only"})
        assert reply.status_code == 400 and reply.get_json()["error"]["code"] == code
    assert tables(store) == before


def test_inventory_preview_apply_and_repeat_bind_the_actual_store_result(context):
    store, resource, choices, client = context
    before = tables(store)
    inv, wire = payload(post(client, resource, "inventory", request_body(resource, choices, "inventory")), "inventory", resource)
    assert inv["edit_token"] == resource["edit_token"] and inv["state"] == "needs_upgrade"
    assert wire["projection_digest"] is None and tables(store) == before
    body = request_body(resource, choices, "preview")
    preview, wire = payload(post(client, resource, "preview", body), "preview", resource)
    assert wire["projection_digest"] == preview["projection_digest"] and tables(store) == before
    assert payload(post(client, resource, "preview", body), "preview", resource)[0] == preview
    body["expected_projection_digest"] = preview["projection_digest"]
    saved, applied = payload(post(client, resource, "apply", body), "apply", resource)
    assert saved == store.get_resource(resource["id"])
    assert saved["document"] == preview["document"] and saved["edit_token"] != resource["edit_token"]
    assert applied["projection_digest"] == preview["projection_digest"]
    assert tables(store)["legacy_aliases"] == before["legacy_aliases"]
    after = tables(store)
    response = post(client, resource, "apply", body)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "edit_conflict"
    assert tables(store) == after


@pytest.mark.parametrize("change,code", [
    (lambda b: b.update(extra=1), "unknown_field"),
    (lambda b: b.update(schema="future"), "unsupported_version"),
    (lambda b: b.pop("expected_edit_token"), "missing_field"),
    (lambda b: b.update(expected_edit_token=False), "invalid_value"),
    (lambda b: b.update(choices={}), "missing_field"),
])
def test_closed_invalid_preview_never_changes_any_table(context, change, code):
    store, resource, choices, client = context
    body = request_body(resource, choices, "preview"); change(body)
    before = tables(store)
    response = post(client, resource, "preview", body)
    assert response.status_code == 400 and response.get_json()["error"]["code"] == code
    assert tables(store) == before


@pytest.mark.parametrize("raw,code", [
    ('{"schema":"old","schema":"pupu.skeleton-legacy-upgrade.request.v1"}', "duplicate_name"),
    ('{"schema":"pupu.skeleton-legacy-upgrade.request.v1","choices":{"kernels":[],"kernels":[]}}', "duplicate_name"),
    ('{"schema":NaN}', "invalid_json"), ('[1,2]', "invalid_type"), ('{broken', "invalid_json"),
])
def test_raw_json_duplicates_and_non_json_values_are_not_silently_normalized(context, raw, code):
    store, resource, _, client = context
    before = tables(store)
    response = client.post(f"/skeleton_resources/{resource['id']}/legacy_upgrade/preview", data=raw,
        content_type="application/json", headers={"x-unchain-auth": "offline-test-only"})
    assert response.status_code == 400 and response.get_json()["error"]["code"] == code
    assert tables(store) == before


def test_extra_query_stale_token_and_forged_digest_are_typed_zero_write_refusals(context):
    store, resource, choices, client = context
    before = tables(store)
    body = request_body(resource, choices, "preview")
    response = post(client, resource, "preview", body, query_string={"extra": "x"})
    assert response.status_code == 400 and response.get_json()["error"]["code"] == "invalid_shape"
    stale = deepcopy(body); stale["expected_edit_token"] = "edit-old"
    response = post(client, resource, "preview", stale)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "edit_conflict"
    body["expected_projection_digest"] = "0" * 64
    response = post(client, resource, "apply", body)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "upgrade_preview_stale"
    assert tables(store) == before


def test_oversized_body_and_incompatible_loaded_runtime_are_refused(context, monkeypatch):
    store, resource, _, client = context
    before = tables(store)
    response = client.post(f"/skeleton_resources/{resource['id']}/legacy_upgrade/inventory", data=b" " * (4194304 + 1),
        content_type="application/json", headers={"x-unchain-auth": "offline-test-only"})
    assert response.status_code == 413 and response.get_json()["error"]["code"] == "limit_bytes"
    import unchain.runtime.runtime_protocol as protocol
    monkeypatch.setattr(protocol, "runtime_protocol_manifest", lambda: {})
    response = client.get(CAP + "?contract=legacy_upgrade_v1", headers={"x-unchain-auth": "offline-test-only"})
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "runtime_protocol_manifest_invalid"
    assert tables(store) == before


def test_wrong_negotiated_manifest_and_escaped_invalid_unicode_are_zero_write(context):
    store, resource, choices, client = context
    before = tables(store)
    body = request_body(resource, choices, "preview")
    body["expected_runtime_manifest_digest"] = "sha256:" + "0" * 64
    reply = post(client, resource, "preview", body)
    assert reply.status_code == 409 and reply.get_json()["error"]["code"] == "upgrade_manifest_stale"
    body = request_body(resource, choices, "inventory"); body["expected_edit_token"] = "\ud800"
    reply = post(client, resource, "inventory", body)
    assert reply.status_code == 400 and reply.get_json()["error"]["code"] == "invalid_unicode"
    assert tables(store) == before


def test_real_producer_preserves_authored_names_and_labels(context):
    store, resource, choices, client = context
    document = deepcopy(resource["document"])
    document["name"] = "  Legacy é  "; document["nodes"][1]["label"] = "  Label é  "
    resource = store.save_draft(document, expected_edit_token=resource["edit_token"])
    body = request_body(resource, choices, "preview")
    preview, _ = payload(post(client, resource, "preview", body), "preview", resource)
    body["expected_projection_digest"] = preview["projection_digest"]
    saved, _ = payload(post(client, resource, "apply", body), "apply", resource)
    assert saved["name"] == saved["document"]["name"] == "  Legacy é  "
    assert saved["document"]["nodes"][1]["label"] == "  Label é  "


def test_response_budget_is_checked_before_atomic_apply(context, monkeypatch):
    import route_skeleton_legacy_upgrade as module
    store, resource, choices, client = context
    body = request_body(resource, choices, "preview")
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices)
    body["expected_projection_digest"] = preview["projection_digest"]
    before = tables(store)
    monkeypatch.setattr(module, "RESPONSE_BYTES", 65536)
    reply = post(client, resource, "apply", body)
    assert reply.status_code == 413 and reply.get_json()["error"]["code"] == "limit_bytes"
    assert tables(store) == before
