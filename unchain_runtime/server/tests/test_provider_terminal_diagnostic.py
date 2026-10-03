"""The host keeps the safe diagnostic emitted by the real runtime error."""

import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import route_chat
from unchain.context.tool_catalog import ToolCatalogEnvelope  # Initialize the runtime's context entry point.
from unchain.providers.durable_turn_runtime import DurableProviderTurnTerminalError
from unchain.providers.failure_diagnostic import ProviderFailureDiagnostic


def test_provider_parameter_rejection_reaches_host_error_message():
    error = DurableProviderTurnTerminalError(
        "non_retryable",
        ProviderFailureDiagnostic(400, "invalid_function_parameters", "tools[3].parameters"),
    )
    code, message = route_chat._normalize_stream_error(error)
    assert code == "durable_provider_turn_terminal_failed"
    assert message == (
        "durable_provider_turn_terminal_failed:non_retryable; "
        "Provider rejected the request (HTTP 400, code=invalid_function_parameters, "
        "parameter=tools[3].parameters)"
    )


def test_provider_authentication_rejection_uses_existing_settings_guidance():
    error = DurableProviderTurnTerminalError(
        "non_retryable", ProviderFailureDiagnostic(401, "invalid_api_key")
    )
    code, message = route_chat._normalize_stream_error(error)
    assert code == "invalid_api_key"
    assert message == "API key is invalid or has been revoked. Please update your API key in Settings."


def test_gemini_busy_terminal_failure_has_safe_actionable_message():
    error = DurableProviderTurnTerminalError(
        "transient", ProviderFailureDiagnostic(503)
    )
    code, message = route_chat._normalize_stream_error(error)
    assert code == "durable_provider_turn_terminal_failed"
    assert message == "Provider temporarily busy (HTTP 503). Please try again later."
    assert "private provider response" not in message


def test_explicit_gemini_finish_reason_reaches_host_without_fake_http_status():
    error = DurableProviderTurnTerminalError(
        'non_retryable', ProviderFailureDiagnostic(None, 'MALFORMED_FUNCTION_CALL')
    )
    code, message = route_chat._normalize_stream_error(error)
    assert code == 'durable_provider_turn_terminal_failed'
    assert message == ('durable_provider_turn_terminal_failed:non_retryable; '
                       'Gemini generation stopped (reason=MALFORMED_FUNCTION_CALL)')
    assert 'HTTP' not in message


def test_response_outcome_feature_is_required_before_active_admission():
    import hashlib
    import json
    import context_memory_v2_capability as gate
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest

    manifest = runtime_protocol_manifest()
    assert gate.verify_context_memory_v2_capability(manifest=manifest, requested_mode='all').ready
    ownership = next(p for p in manifest['protocols'] if p['id']=='provider_turn_ownership')
    assert 'provider_response_outcomes_v1' in ownership['features']
    ownership['features'].remove('provider_response_outcomes_v1')
    body = {k: v for k,v in manifest.items() if k!='manifest_digest'}
    encoded = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(',',':')).encode()
    manifest['manifest_digest'] = 'sha256:'+hashlib.sha256(b'unchain.runtime_protocol_manifest.v1\\u0000'+encoded).hexdigest()
    verdict = gate.verify_context_memory_v2_capability(manifest=manifest, requested_mode='all')
    assert not verdict.ready
    assert verdict.reason == 'unchain_runtime_protocol_required_feature_missing'
