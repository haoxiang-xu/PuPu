"""The host keeps the safe diagnostic emitted by the real runtime error."""

import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import route_chat
from unchain.context.tool_catalog import ToolCatalogEnvelope  # Initialize the runtime's context entry point.
from unchain.providers.durable_turn_runtime import (
    DurableProviderTurnTerminalError,
    DurableProviderTurnUncertainError,
)
from unchain.retry import RetriesExhaustedError
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


def test_gemini_not_found_suggestion_reaches_the_host_error_message():
    """BC-386-2: a v2 diagnostic's fixed text crosses the host boundary unchanged."""

    error = DurableProviderTurnTerminalError(
        "non_retryable",
        ProviderFailureDiagnostic(
            404, provider_status="NOT_FOUND", replacement_model="gemini-3.8-flash"
        ),
    )
    code, message = route_chat._normalize_stream_error(error)
    assert code == "durable_provider_turn_terminal_failed"
    assert message == (
        "durable_provider_turn_terminal_failed:non_retryable; "
        "Provider model or endpoint was not found "
        "(HTTP 404, status=NOT_FOUND; suggested model: gemini-3.8-flash)"
    )


def test_uncertain_and_exhausted_provider_failures_keep_their_status_text():
    uncertain = DurableProviderTurnUncertainError(
        ProviderFailureDiagnostic(500, provider_status="INTERNAL")
    )
    assert route_chat._normalize_stream_error(uncertain) == (
        "durable_provider_turn_uncertain",
        "durable_provider_turn_uncertain; Provider reported an internal error "
        "(HTTP 500, status=INTERNAL)",
    )
    bare = DurableProviderTurnUncertainError()
    assert route_chat._normalize_stream_error(bare) == (
        "durable_provider_turn_uncertain",
        "durable_provider_turn_uncertain",
    )
    exhausted = RetriesExhaustedError(
        RuntimeError("private"),
        2,
        "Provider service is unavailable or overloaded "
        "(HTTP 503, status=UNAVAILABLE) after 2 retries",
    )
    assert route_chat._normalize_stream_error(exhausted) == (
        "retries_exhausted",
        "retries_exhausted; Provider service is unavailable or overloaded "
        "(HTTP 503, status=UNAVAILABLE) after 2 retries",
    )


def test_uncertain_failure_without_http_status_keeps_its_fixed_reason():
    """#386: a connection lost mid-response reaches the UI with its fixed wording."""

    error = DurableProviderTurnUncertainError(
        detail=(
            "Provider connection closed before the response completed; "
            "the provider may still have processed it (RemoteProtocolError)"
        )
    )
    assert route_chat._normalize_stream_error(error) == (
        "durable_provider_turn_uncertain",
        "durable_provider_turn_uncertain; Provider connection closed before the "
        "response completed; the provider may still have processed it "
        "(RemoteProtocolError)",
    )

