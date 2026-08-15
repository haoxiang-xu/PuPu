from __future__ import annotations

import copy
import hashlib
import json
from unittest import mock

import pytest

import app as miso_app
import context_memory_v2_capability as capability_gate
import routes as miso_routes


_DIGEST_DOMAIN = b"unchain.runtime_protocol_manifest.v1\\u0000"
_WRITE_CASES = (
    (
        "/chat/stream/v2",
        {"message": "hello", "threadId": "chat-protocol-v2"},
    ),
    (
        "/chat/stream/v4",
        {
            "message": "hello",
            "threadId": "chat-protocol-v4",
            "attempt_id": "attempt-protocol-v4",
            "memory_v2_requested": False,
        },
    ),
)


def _without_expected_interaction_cas() -> dict[str, object]:
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest

    manifest = copy.deepcopy(runtime_protocol_manifest())
    for protocol in manifest["protocols"]:
        if protocol["id"] == "durable_interaction":
            protocol["features"].remove("expected_interaction_id_cas")
    body = {
        "protocols": manifest["protocols"],
        "runtime": manifest["runtime"],
        "schema": manifest["schema"],
    }
    canonical = json.dumps(
        body,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    manifest["manifest_digest"] = "sha256:" + hashlib.sha256(
        _DIGEST_DOMAIN + canonical
    ).hexdigest()
    return manifest


@pytest.mark.parametrize(
    "path,payload",
    _WRITE_CASES,
)
def test_v2_and_v4_writes_fail_before_provider_or_run_bundle_effects(
    monkeypatch,
    path: str,
    payload: dict[str, object],
) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (None, "diagnostic", "/missing/runtime_protocol.py"),
    )
    client = miso_app.create_app().test_client()
    with mock.patch.object(
        miso_routes,
        "stream_chat_events",
        return_value=iter(()),
    ) as provider_stream:
        response = client.post(path, json=payload)
        response.get_data(as_text=True)

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == (
        "unchain_runtime_protocol_manifest_missing"
    )
    provider_stream.assert_not_called()


@pytest.mark.parametrize("path,payload", _WRITE_CASES)
def test_v2_and_v4_writes_reject_missing_incident_feature_before_effects(
    monkeypatch,
    path: str,
    payload: dict[str, object],
) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (
            _without_expected_interaction_cas(),
            "diagnostic",
            "/loaded/runtime_protocol.py",
        ),
    )
    client = miso_app.create_app().test_client()
    with mock.patch.object(
        miso_routes,
        "stream_chat_events",
        return_value=iter(()),
    ) as provider_stream:
        response = client.post(path, json=payload)
        response.get_data(as_text=True)

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == (
        "unchain_runtime_protocol_required_feature_missing"
    )
    provider_stream.assert_not_called()


def test_legacy_write_endpoint_stays_426_without_loading_protocol(monkeypatch) -> None:
    monkeypatch.setattr(
        capability_gate,
        "_load_imported_runtime_protocol",
        lambda: (_ for _ in ()).throw(
            AssertionError("legacy 426 endpoint must not load protocol")
        ),
    )
    client = miso_app.create_app().test_client()

    response = client.post("/chat/stream", json={"message": "legacy"})

    assert response.status_code == 426
    assert response.get_json()["error"]["code"] == "run_bundle_protocol_required"
