"""The HTTP error contract must not expose exception details to the renderer."""

from flask import Flask

from route_chat import _durable_host_error_response


def test_durable_error_preserves_control_fields_without_exception_details():
    error = RuntimeError("private-token /private/database.sqlite traceback details")
    error.code = "interaction_conflict"
    error.status_code = 409
    error.retryable = True
    with Flask(__name__).app_context():
        response, status = _durable_host_error_response(error)
    assert status == 409
    assert response.get_json() == {"error": {
        "code": "interaction_conflict",
        "message": "Unable to complete this conversation action.",
        "retryable": True,
    }}


def test_generic_durable_error_uses_safe_defaults():
    with Flask(__name__).app_context():
        response, status = _durable_host_error_response(RuntimeError("private details"))
    assert status == 409
    assert response.get_json() == {"error": {
        "code": "durable_interaction_failed",
        "message": "Unable to complete this conversation action.",
        "retryable": False,
    }}
