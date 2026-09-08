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
