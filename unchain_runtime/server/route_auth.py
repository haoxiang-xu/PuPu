import hmac
import ipaddress

from flask import current_app, jsonify, request

from route_blueprint import api_blueprint


def _json_error(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message}}), status


def _is_authorized() -> bool:
    expected_token = current_app.config.get("UNCHAIN_AUTH_TOKEN", "")
    if not expected_token:
        return True

    provided_token = request.headers.get("x-unchain-auth", "")
    if not isinstance(provided_token, str) or not provided_token.strip():
        provided_token = request.args.get("unchain_auth", "")
    if not isinstance(provided_token, str) or not provided_token.strip():
        provided_token = request.args.get("miso_auth", "")
    if not isinstance(provided_token, str):
        return False

    normalized_token = provided_token.strip()
    if not normalized_token:
        return False

    return hmac.compare_digest(normalized_token, str(expected_token))


def _is_loopback_request() -> bool:
    remote_addr = getattr(request, "remote_addr", "")
    if not isinstance(remote_addr, str):
        return False

    normalized_remote_addr = remote_addr.strip()
    if normalized_remote_addr.startswith("::ffff:"):
        normalized_remote_addr = normalized_remote_addr.split("::ffff:", 1)[1]

    if normalized_remote_addr == "localhost":
        return True

    try:
        return ipaddress.ip_address(normalized_remote_addr).is_loopback
    except ValueError:
        return False


@api_blueprint.before_request
def reject_non_loopback_requests():
    if _is_loopback_request():
        return None

    return _json_error(
        "non_loopback_forbidden",
        "PuPu local runtime only accepts loopback requests",
        403,
    )
