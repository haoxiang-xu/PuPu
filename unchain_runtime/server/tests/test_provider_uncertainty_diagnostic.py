"""Public uncertain outcomes keep their safe cause without changing retry policy."""

import hashlib
import json
from pathlib import Path
from unittest import mock

import app as miso_app
import context_memory_v2_capability as capability_gate
import route_chat
import routes as miso_routes


def test_uncertain_error_keeps_safe_reason_in_host_message():
    from unchain.providers.durable_turn_runtime import DurableProviderTurnUncertainError
    from unchain.providers.uncertainty_diagnostic import ProviderUncertaintyDiagnostic

    diagnostic = ProviderUncertaintyDiagnostic("stream_incomplete", "reading_response")
    error = DurableProviderTurnUncertainError(diagnostic)
    code, message = route_chat._normalize_stream_error(error)

    assert code == "durable_provider_turn_uncertain"
    assert message == str(error)
    assert message.startswith("Provider request outcome is uncertain: ")
    assert "reason=stream_incomplete" in message
    assert "phase=reading_response" in message
    assert message != code


def test_uncertain_http_response_keeps_known_status_without_promoting_retry():
    from unchain.providers.durable_turn_runtime import DurableProviderTurnUncertainError
    from unchain.providers.uncertainty_diagnostic import ProviderUncertaintyDiagnostic

    diagnostic = ProviderUncertaintyDiagnostic(
        "provider_stream_error", "reading_response", 200, "UNAVAILABLE"
    )
    error = DurableProviderTurnUncertainError(diagnostic)
    code, message = route_chat._normalize_stream_error(error)

    assert code == "durable_provider_turn_uncertain"
    assert "HTTP 200" in message
    assert "code=UNAVAILABLE" in message
    assert "reason=provider_stream_error" in message
    assert "retrying" not in message.lower()


def test_old_uncertain_error_explains_that_original_cause_was_not_recorded():
    from unchain.providers.durable_turn_runtime import DurableProviderTurnUncertainError

    error = DurableProviderTurnUncertainError()
    code, message = route_chat._normalize_stream_error(error)

    assert code == "durable_provider_turn_uncertain"
    assert "reason=unrecorded_outcome" in message
    assert "phase=recovery" in message
    assert "original cause was not recorded" in message


def test_real_v4_error_projection_preserves_diagnostic_in_failed_event_and_done():
    from unchain.providers.durable_turn_runtime import DurableProviderTurnUncertainError
    from unchain.providers.uncertainty_diagnostic import ProviderUncertaintyDiagnostic

    error = DurableProviderTurnUncertainError(
        ProviderUncertaintyDiagnostic("stream_incomplete", "reading_response")
    )

    def failing_stream(**_kwargs):
        yield {"type": "run_started", "run_id": "run-uncertain", "iteration": 1}
        try:
            raise RuntimeError("PRIVATE provider body / key / signed response")
        except RuntimeError as original:
            raise error from original

    with mock.patch.object(miso_routes, "stream_chat_events", side_effect=failing_stream):
        response = miso_app.create_app().test_client().post(
            "/chat/stream/v4",
            json={
                "message": "hello",
                "threadId": "thread-uncertain",
                "attempt_id": "attempt-uncertain",
            },
        )
        body = response.get_data(as_text=True)

    events = []
    for block in body.split("\n\n"):
        data = next((line[6:] for line in block.splitlines() if line.startswith("data: ")), None)
        name = next((line[7:] for line in block.splitlines() if line.startswith("event: ")), None)
        if data is not None and name is not None:
            events.append((name, json.loads(data)))
    failed = next(payload for name, payload in events
                  if name == "runtime_event" and payload["type"] == "run.failed")
    done = next(payload for name, payload in events if name == "done")
    expected = {"code": "durable_provider_turn_uncertain", "message": str(error)}

    assert response.status_code == 200
    assert set(failed["payload"]["error"]) == {"code", "message"}
    assert failed["payload"]["error"] == expected
    assert set(done["error"]) == {"code", "message"}
    assert done["error"] == expected
    assert "PRIVATE" not in body


def test_uncertainty_diagnostic_feature_is_required_for_active_admission():
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest

    manifest = runtime_protocol_manifest()
    assert capability_gate.verify_context_memory_v2_capability(
        manifest=manifest, requested_mode="all"
    ).ready
    ownership = next(item for item in manifest["protocols"]
                     if item["id"] == "provider_turn_ownership")
    assert "provider_uncertainty_diagnostics_v1" in ownership["features"]
    ownership["features"].remove("provider_uncertainty_diagnostics_v1")
    body = {key: value for key, value in manifest.items() if key != "manifest_digest"}
    encoded = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    manifest["manifest_digest"] = "sha256:" + hashlib.sha256(
        b"unchain.runtime_protocol_manifest.v1\\u0000" + encoded
    ).hexdigest()

    verdict = capability_gate.verify_context_memory_v2_capability(
        manifest=manifest, requested_mode="all"
    )
    assert not verdict.ready
    assert verdict.reason == "unchain_runtime_protocol_required_feature_missing"


def test_windows_contract_requires_uncertainty_diagnostics_feature():
    contract_path = Path(__file__).resolve().parents[3] / "docs/contracts/memory-v2/windows-required-protocol-and-sink-contract.v1.json"
    contract = json.loads(contract_path.read_text())
    ownership = next(item for item in contract["runtime_protocol"]["required_protocols"]
                     if item["id"] == "provider_turn_ownership")

    assert "provider_uncertainty_diagnostics_v1" in ownership["features"]
    assert ownership["features"] == sorted(set(ownership["features"]))
