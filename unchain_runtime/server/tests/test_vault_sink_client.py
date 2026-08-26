from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import urllib.error

import pytest

from vault_sink_client import (
    BROKER_FD_ENV,
    BROKER_URL_ENV,
    VaultSinkClient,
    VaultSinkClientError,
    _reset_process_vault_sink_client_for_tests,
    get_process_vault_sink_client,
    initialize_process_vault_sink_client,
)


class _Response:
    def __init__(self, payload, *, status=200):
        self.status = status
        self._raw = (
            payload
            if isinstance(payload, bytes)
            else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        )

    def read(self, _limit=-1):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def _client(urlopen):
    return VaultSinkClient(
        base_url="http://127.0.0.1:43123",
        key=bytes.fromhex("11" * 32),
        _urlopen=urlopen,
        _clock_ms=lambda: 1_735_689_600_123,
        _nonce_factory=lambda: "22" * 16,
    )


def test_prepare_signs_the_exact_raw_body_and_fixed_path():
    captured = {}

    def urlopen(request, *, timeout):
        captured.update(
            request=request,
            timeout=timeout,
            body=request.data,
            headers=dict(request.header_items()),
        )
        return _Response({"ok": True, "intent_id": "pvi1_test"})

    payload = {"version": 1, "owner_chat_id": "chat-a", "handles": []}
    result = _client(urlopen).prepare_intent(payload)

    assert result["intent_id"] == "pvi1_test"
    assert captured["request"].full_url == (
        "http://127.0.0.1:43123/v1/intents/prepare"
    )
    assert captured["request"].method == "POST"
    assert captured["body"] == json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    body_hash = hashlib.sha256(captured["body"]).hexdigest()
    canonical = (
        "v1\nPOST\n/v1/intents/prepare\n1735689600123\n"
        + "22" * 16
        + "\n"
        + body_hash
    ).encode("utf-8")
    assert captured["headers"]["X-pupu-vault-signature"] == hmac.new(
        bytes.fromhex("11" * 32),
        canonical,
        hashlib.sha256,
    ).hexdigest()
    assert captured["timeout"] == 5.0


def test_status_is_a_signed_bodyless_get():
    captured = {}

    def urlopen(request, *, timeout):
        del timeout
        captured["request"] = request
        return _Response({"ok": True, "available": True})

    result = _client(urlopen).status()

    assert result["available"] is True
    assert captured["request"].method == "GET"
    assert captured["request"].data is None
    assert captured["request"].full_url.endswith("/v1/status")


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:1234",
        "http://localhost:1234",
        "http://0.0.0.0:1234",
        "http://127.0.0.1:1234/v1",
        "http://user@127.0.0.1:1234",
        "http://127.0.0.1:1234?key=x",
    ],
)
def test_base_url_rejects_every_non_exact_loopback_form(url):
    with pytest.raises(VaultSinkClientError) as captured:
        VaultSinkClient(base_url=url, key=b"k" * 32)
    assert captured.value.code == "vault_broker_unavailable"


def test_from_env_is_optional_only_when_both_values_are_absent():
    assert VaultSinkClient.from_env(environ={}) is None
    with pytest.raises(VaultSinkClientError):
        VaultSinkClient.from_env(environ={"PUPU_VAULT_BROKER_URL": "x"})
    client = VaultSinkClient.from_env(
        environ={
            "PUPU_VAULT_BROKER_URL": "http://127.0.0.1:31111",
            "PUPU_VAULT_BROKER_FD": "3",
        },
        _key_reader=lambda fd: "aa" * 32 if fd == 3 else "",
    )
    assert client is not None
    assert client.base_url == "http://127.0.0.1:31111"


def test_real_key_fd_is_consumed_and_closed_once():
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, ("ab" * 32 + "\n").encode("ascii"))
    finally:
        os.close(write_fd)
    client = VaultSinkClient.from_env(
        environ={
            BROKER_URL_ENV: "http://127.0.0.1:31111",
            BROKER_FD_ENV: str(read_fd),
        }
    )
    assert client is not None
    assert client.key == bytes.fromhex("ab" * 32)
    with pytest.raises(OSError):
        os.read(read_fd, 1)


def test_process_initializer_scrubs_transport_environment(monkeypatch):
    _reset_process_vault_sink_client_for_tests()
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, ("cd" * 32 + "\n").encode("ascii"))
    finally:
        os.close(write_fd)
    monkeypatch.setenv(BROKER_URL_ENV, "http://127.0.0.1:31111")
    monkeypatch.setenv(BROKER_FD_ENV, str(read_fd))

    client = initialize_process_vault_sink_client(required=True)

    assert client is get_process_vault_sink_client()
    assert BROKER_URL_ENV not in os.environ
    assert BROKER_FD_ENV not in os.environ
    assert initialize_process_vault_sink_client(required=True) is client
    _reset_process_vault_sink_client_for_tests()


def test_coded_http_error_never_surfaces_broker_text():
    def urlopen(_request, *, timeout):
        del timeout
        body = io.BytesIO(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": "vault_binding_mismatch",
                        "message": "do-not-project-this-value",
                    },
                }
            ).encode("utf-8")
        )
        raise urllib.error.HTTPError("x", 409, "unsafe", {}, body)

    with pytest.raises(VaultSinkClientError) as captured:
        _client(urlopen).execute_intent({"version": 1})
    assert captured.value.code == "vault_binding_mismatch"
    assert "do-not-project" not in str(captured.value)


def test_uncoded_transport_failure_is_static_and_retryable():
    def urlopen(_request, *, timeout):
        del timeout
        raise urllib.error.URLError("could contain a sensitive URL")

    with pytest.raises(VaultSinkClientError) as captured:
        _client(urlopen).cancel_intent({"version": 1})
    assert captured.value.code == "vault_broker_unavailable"
    assert captured.value.retryable is True
    assert "sensitive" not in str(captured.value)


def test_oversized_or_non_json_payload_is_rejected_before_transport():
    called = False

    def urlopen(_request, *, timeout):
        nonlocal called
        del timeout
        called = True
        return _Response({"ok": True})

    with pytest.raises(VaultSinkClientError) as captured:
        _client(urlopen).prepare_intent({"payload": "x" * (64 * 1024)})
    assert captured.value.code == "vault_invalid_request"
    assert called is False
