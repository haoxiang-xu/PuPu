"""Real Store/Flask transaction boundary; injected faults are labelled as such."""
from copy import deepcopy
import json

import pytest

from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_legacy_upgrade_http import context, post, request_body, payload
from test_skeleton_legacy_upgrade_save import migrate, recipe, tables


def apply_body(store, resource, choices):
    preview = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices)
    return {**request_body(resource, choices, "apply"), "expected_projection_digest": preview["projection_digest"]}


def test_http_apply_budget_rolls_back_with_full_diagnostics(context, monkeypatch):
    import route_skeleton_legacy_upgrade as route
    store, resource, choices, client = context
    body = apply_body(store, resource, choices)
    before = tables(store)
    # Fault injection: not a claim that a normal valid graph generates this diagnostic.
    monkeypatch.setattr(store, "diagnose", lambda _doc: [{"code": "injected", "path": [],
        "message": "x" * (route.RESPONSE_BYTES + 1)}])
    response = post(client, resource, "apply", body)
    assert response.status_code == 413 and response.get_json()["error"]["code"] == "limit_bytes"
    assert tables(store) == before


def test_http_serializer_failure_rolls_back_resource_archive_and_receipt(context, monkeypatch):
    store, resource, choices, client = context
    body = apply_body(store, resource, choices)
    before = tables(store)
    original = client.application.json.dumps
    def failing_encoder(value, **kwargs):
        if isinstance(value, dict) and value.get("schema") == "pupu.skeleton-legacy-upgrade.response.v1":
            raise RuntimeError("injected response encoder failure")
        return original(value, **kwargs)
    monkeypatch.setattr(client.application.json, "dumps", failing_encoder)
    response = post(client, resource, "apply", body)
    assert response.status_code == 500 and response.get_json()["error"]["code"] == "skeleton_store_failed"
    assert tables(store) == before


def test_success_http_bytes_are_prepared_before_commit_and_not_encoded_again(context, monkeypatch):
    store, resource, choices, client = context
    body = apply_body(store, resource, choices)
    original = client.application.json.dumps
    observed = []
    def encode_only_before_commit(value, **kwargs):
        if isinstance(value, dict) and value.get("schema") == "pupu.skeleton-legacy-upgrade.response.v1":
            # A separate real connection sees only the committed row.
            with store._connect() as conn:
                token = conn.execute("SELECT edit_token FROM resources WHERE resource_id=?", (resource["id"],)).fetchone()[0]
            observed.append(token)
            if token != resource["edit_token"]:
                raise RuntimeError("success re-encoded after commit")
        return original(value, **kwargs)
    monkeypatch.setattr(client.application.json, "dumps", encode_only_before_commit)
    reply = post(client, resource, "apply", body)
    saved, _ = payload(reply, "apply", resource)
    assert observed == [resource["edit_token"]]
    assert saved == store.get_resource(resource["id"])


def test_full_http_byte_limit_refuses_before_commit(context, monkeypatch):
    import route_skeleton_legacy_upgrade as route
    store, resource, choices, client = context
    body = apply_body(store, resource, choices)
    before = tables(store)
    # Fault-injected narrow wire budget; production remains the existing 64 MiB Main bound.
    monkeypatch.setattr(route, "HTTP_RESPONSE_BYTES", 1024, raising=False)
    reply = post(client, resource, "apply", body)
    assert reply.status_code == 413 and reply.get_json()["error"]["code"] == "limit_bytes"
    assert tables(store) == before


def test_unicode_success_and_exact_full_http_budget(context, monkeypatch, tmp_path):
    import route_skeleton_legacy_upgrade as route
    _, _, _, client = context
    source = recipe(name="  é中文🙂  ", description="é中文🙂" * 128)
    def run_case(name, bound=None):
        store = SkeletonResourceStore(tmp_path / name)
        resource, choices = migrate(store, source)
        monkeypatch.setattr(route, "SkeletonResourceStore", lambda: store)
        if bound is not None: monkeypatch.setattr(route, "HTTP_RESPONSE_BYTES", bound, raising=False)
        before = tables(store)
        response = post(client, resource, "apply", apply_body(store, resource, choices))
        return store, resource, response, before
    store, resource, first, _ = run_case("first")
    saved, wire = payload(first, "apply", resource)
    assert saved["name"] == "  é中文🙂  " and saved["document"]["description"] == source["description"]
    assert len(first.data) > len(wire["payload_json"].encode("utf-8"))
    limit = len(first.data)
    second_store, second_resource, second, _ = run_case("exact", limit)
    assert payload(second, "apply", second_resource)[0] == saved
    third_store, _, third, before = run_case("one-too-small", limit - 1)
    assert third.status_code == 413
    assert tables(third_store) == before


def test_direct_store_result_check_is_detached_and_return_is_ignored(context):
    store, resource, choices, _ = context
    body = apply_body(store, resource, choices)
    expected = store.preview_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices)["document"]
    checked = []
    def check_result(value):
        checked.append(deepcopy(value))
        value["document"]["name"] = "callback only"
        return {"not": "a replacement result"}
    saved = store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"],
        expected_projection_digest=body["expected_projection_digest"], choices=choices, result_check=check_result)
    assert len(checked) == 1 and checked[0]["document"] == expected
    assert saved["document"] == expected and saved == store.get_resource(resource["id"])


def test_direct_store_result_check_failure_rolls_back(context):
    store, resource, choices, _ = context
    body = apply_body(store, resource, choices)
    before = tables(store)
    def refuse(_value): raise RuntimeError("injected precommit check failure")
    with pytest.raises(RuntimeError, match="injected precommit check failure"):
        store.apply_legacy_upgrade(resource["id"], expected_edit_token=resource["edit_token"], choices=choices,
            expected_projection_digest=body["expected_projection_digest"], result_check=refuse)
    assert tables(store) == before


def test_result_check_cannot_be_supplied_over_http(context):
    store, resource, choices, client = context
    body = apply_body(store, resource, choices); body["result_check"] = "not a callback surface"
    before = tables(store)
    response = post(client, resource, "apply", body)
    assert response.status_code == 400 and response.get_json()["error"]["code"] == "unknown_field"
    assert tables(store) == before
