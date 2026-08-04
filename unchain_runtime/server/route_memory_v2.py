"""Token-gated, owner-scoped HTTP surface for Context/Memory V2."""

from __future__ import annotations

import base64
import binascii
import os
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Response, current_app, jsonify, request

from context_memory_v2_capability import (
    context_memory_v2_capability_status,
    resolve_context_memory_v2_capability,
)
from memory_v2_rollout import normalize_rollout_mode, resolve_memory_v2_rollout
from memory_v2_runtime import get_memory_v2_runtime
from memory_v2_store import MemoryV2Error
from memory_v2_store_boundary import (
    CONTEXT_V2_DATABASE_FILENAME,
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    configured_context_v2_store_owner,
)
from route_blueprint import api_blueprint


MAX_REQUEST_BYTES = 48 * 1024 * 1024


def _read_only_degraded() -> bool:
    return resolve_memory_v2_rollout().read_only_degraded


def _normalized_rollout_mode(value: Any, default: str = "off") -> str:
    return normalize_rollout_mode(value, default)


def _configured_rollout_status() -> dict[str, Any]:
    return resolve_memory_v2_rollout().status()


def _root():
    import routes as routes_module

    return routes_module


def _error_response(error: MemoryV2Error):
    payload: dict[str, Any] = {
        "code": error.code,
        "message": str(error),
        "retryable": error.retryable,
    }
    if error.expected_revision is not None:
        payload["expected_revision"] = error.expected_revision
    if error.actual_revision is not None:
        payload["actual_revision"] = error.actual_revision
    return jsonify({"error": payload}), error.status_code


def _endpoint(function: Callable[..., Any]):
    @wraps(function)
    def wrapped(*args: Any, **kwargs: Any):
        root = _root()
        if not root._is_authorized():
            return root._json_error("unauthorized", "Invalid auth token", 401)
        content_length = request.content_length
        if content_length is not None and content_length > MAX_REQUEST_BYTES:
            return root._json_error(
                "context_v2_request_too_large",
                "Context V2 request is too large",
                413,
            )
        is_privacy_delete = (
            request.method == "DELETE" and "/context/v2/chat/" in request.path
        )
        if (
            _read_only_degraded()
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and not is_privacy_delete
        ):
            return root._json_error(
                "context_v2_read_only_degraded",
                "Context V2 is temporarily read-only",
                503,
            )
        try:
            return function(*args, **kwargs)
        except MemoryV2Error as exc:
            return _error_response(exc)
        except Exception:
            current_app.logger.exception("Context V2 request failed")
            return root._json_error(
                "context_v2_failed",
                "Context V2 request failed",
                500,
            )

    return wrapped


def _runtime():
    return get_memory_v2_runtime(required=True)


def _read_runtime_for_store_owner(*, owner_chat_id: str):
    """Resolve one read backend without opening the non-owning data plane."""

    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
            retryable=True,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        return _runtime()

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_read_adapter import (
            PupuUnchainMemoryV2ReadError,
            open_pupu_unchain_memory_v2_reader,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_read_unavailable",
            "Unchain-owned Context V2 reads are unavailable",
            status_code=503,
            retryable=True,
        ) from error
    try:
        return open_pupu_unchain_memory_v2_reader(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2"),
            owner_chat_id=owner_chat_id,
        )
    except PupuUnchainMemoryV2ReadError as error:
        raise MemoryV2Error(
            "context_v2_unchain_read_unavailable",
            "Unchain-owned Context V2 read scope is unavailable",
            status_code=503,
            retryable=True,
        ) from error


def _workspace_mutation_for_store_owner(
    *,
    owner_chat_id: str,
    method_name: str,
    **arguments: Any,
) -> dict[str, Any]:
    """Dispatch one chat-workspace mutation to its configured data-plane owner."""

    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
            retryable=True,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        method = getattr(_runtime(), method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_workspace_api import (
            PupuUnchainWorkspaceAPIError,
            open_pupu_unchain_workspace_api,
        )
        from unchain.journal import ModelValidationError
        from unchain.memory.workspace.ports import (
            RepositoryConflictError,
            RepositoryNotFoundError,
            RepositoryScopeError,
            WorkspaceRepositoryError,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_workspace_unavailable",
            "Unchain-owned Memory V2 workspace is unavailable",
            status_code=503,
            retryable=True,
        ) from error

    try:
        workspace = open_pupu_unchain_workspace_api(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2"),
            owner_chat_id=owner_chat_id,
        )
        if method_name == "ensure_space":
            operation_id = arguments.get("operation_id")
            if not isinstance(operation_id, str) or not operation_id.strip():
                raise ValueError("operation_id is required")
            spaces = workspace.list_spaces(owner_chat_id=owner_chat_id).get(
                "spaces",
                [],
            )
            if len(spaces) != 1:
                raise WorkspaceRepositoryError(
                    "official chat workspace is unavailable"
                )
            return spaces[0]
        method = getattr(workspace, method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)
    except RepositoryConflictError as error:
        raise MemoryV2Error(
            "context_v2_revision_conflict",
            "Memory V2 workspace revision changed",
            status_code=409,
        ) from error
    except (RepositoryNotFoundError, RepositoryScopeError) as error:
        raise MemoryV2Error(
            "context_v2_not_found",
            "Memory V2 workspace resource was not found",
            status_code=404,
        ) from error
    except PupuUnchainWorkspaceAPIError as error:
        code = str(getattr(error, "code", "") or "")
        if code in {
            "unchain_workspace_chat_deleted",
            "unchain_workspace_lifecycle_unavailable",
        }:
            status_code = 404
            retryable = False
        elif code.startswith("workspace_"):
            status_code = 400
            retryable = False
        else:
            status_code = 503
            retryable = True
        raise MemoryV2Error(
            code or "context_v2_unchain_workspace_failed",
            "Unchain-owned Memory V2 workspace request failed",
            status_code=status_code,
            retryable=retryable,
        ) from error
    except (ModelValidationError, TypeError, ValueError) as error:
        raise MemoryV2Error(
            "context_v2_invalid_request",
            "Memory V2 workspace request is invalid",
            status_code=400,
        ) from error
    except WorkspaceRepositoryError as error:
        raise MemoryV2Error(
            "context_v2_unchain_workspace_failed",
            "Unchain-owned Memory V2 workspace is temporarily unavailable",
            status_code=503,
            retryable=True,
        ) from error


def _promotion_operation_for_store_owner(
    *,
    owner_chat_id: str,
    method_name: str,
    **arguments: Any,
) -> dict[str, Any]:
    """Dispatch one promotion operation to its configured data-plane owner."""

    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
            retryable=True,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        method = getattr(_runtime(), method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_promotion_api import (
            PupuUnchainPromotionApiError,
            open_pupu_unchain_promotion_api,
        )
        from unchain.journal import ModelValidationError
        from unchain.memory.workspace.ports import (
            RepositoryConflictError,
            RepositoryNotFoundError,
            RepositoryScopeError,
            WorkspaceRepositoryError,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_promotion_unavailable",
            "Unchain-owned Memory V2 promotions are unavailable",
            status_code=503,
            retryable=True,
        ) from error

    try:
        promotions = open_pupu_unchain_promotion_api(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2"),
            owner_chat_id=owner_chat_id,
        )
        method = getattr(promotions, method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)
    except RepositoryConflictError as error:
        raise MemoryV2Error(
            "context_v2_revision_conflict",
            "Memory V2 promotion revision changed",
            status_code=409,
        ) from error
    except (RepositoryNotFoundError, RepositoryScopeError) as error:
        raise MemoryV2Error(
            "context_v2_not_found",
            "Memory V2 promotion resource was not found",
            status_code=404,
        ) from error
    except PupuUnchainPromotionApiError as error:
        status_code = int(getattr(error, "status_code", 400))
        raise MemoryV2Error(
            str(getattr(error, "code", "") or "context_v2_promotion_failed"),
            "Unchain-owned Memory V2 promotion request failed",
            status_code=status_code,
            retryable=status_code >= 500,
        ) from error
    except (ModelValidationError, TypeError, ValueError) as error:
        raise MemoryV2Error(
            "context_v2_invalid_request",
            "Memory V2 promotion request is invalid",
            status_code=400,
        ) from error
    except WorkspaceRepositoryError as error:
        raise MemoryV2Error(
            "context_v2_unchain_promotion_failed",
            "Unchain-owned Memory V2 promotions are temporarily unavailable",
            status_code=503,
            retryable=True,
        ) from error


_UNCHAIN_CURATOR_QUERY_METHODS = frozenset(
    {
        "list_candidates",
        "list_candidate_reviews",
        "get_candidate_review",
        "list_consolidation_jobs",
    }
)


def _unchain_review_decision(
    *,
    owner_chat_id: str,
    **arguments: Any,
) -> dict[str, Any]:
    """Dispatch one user decision to Unchain's atomic review service."""

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_review_decision import (
            PupuUnchainReviewDecisionError,
            open_pupu_unchain_review_decision_api,
        )
        from unchain.persistence.sqlite_curator_review_decision_v2 import (
            SQLiteCuratorReviewDecisionV2Conflict,
            SQLiteCuratorReviewDecisionV2Error,
            SQLiteCuratorReviewDecisionV2IntegrityError,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_review_decision_unavailable",
            "The atomic Unchain review-decision capability is unavailable",
            status_code=503,
        ) from error

    try:
        api = open_pupu_unchain_review_decision_api(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2"),
            owner_chat_id=owner_chat_id,
        )
        return api.decide_candidate_review(
            owner_chat_id=owner_chat_id,
            **arguments,
        )
    except PupuUnchainReviewDecisionError as error:
        status_code = int(getattr(error, "status_code", 400))
        raise MemoryV2Error(
            str(
                getattr(error, "code", "")
                or "context_v2_review_decision_failed"
            ),
            "Unchain-owned review decision failed",
            status_code=status_code,
            retryable=status_code >= 500,
        ) from error
    except SQLiteCuratorReviewDecisionV2IntegrityError as error:
        raise MemoryV2Error(
            "context_v2_review_decision_integrity_unavailable",
            "The atomic review decision failed durable verification",
            status_code=503,
        ) from error
    except SQLiteCuratorReviewDecisionV2Conflict as error:
        source_code = str(getattr(error, "code", "") or "")
        if "operation" in source_code:
            code = "context_v2_operation_conflict"
        elif "already_decided" in source_code or "decided" in source_code:
            code = "context_v2_review_decided"
        elif "revision" in source_code or "stale" in source_code:
            code = "context_v2_revision_conflict"
        else:
            code = "context_v2_candidate_changed"
        raise MemoryV2Error(
            code,
            "The candidate review changed before the decision was applied",
            status_code=409,
            retryable=True,
            expected_revision=getattr(error, "expected_revision", None),
            actual_revision=getattr(error, "actual_revision", None),
        ) from error
    except SQLiteCuratorReviewDecisionV2Error as error:
        source_code = str(getattr(error, "code", "") or "")
        if "not_found" in source_code:
            code = "context_v2_not_found"
            status_code = 404
        elif "invalid" in source_code:
            code = "context_v2_invalid_request"
            status_code = 400
        else:
            code = "context_v2_review_decision_unavailable"
            status_code = 503
        raise MemoryV2Error(
            code,
            "The atomic review decision could not be completed",
            status_code=status_code,
            retryable=status_code >= 500,
        ) from error


def _curator_operation_for_store_owner(
    *,
    owner_chat_id: str,
    method_name: str,
    **arguments: Any,
) -> dict[str, Any]:
    """Dispatch Curator reads without opening the non-owning data plane."""

    if not isinstance(owner_chat_id, str) or not owner_chat_id.strip():
        raise MemoryV2Error(
            "context_v2_invalid_request",
            "owner_chat_id is required",
            status_code=400,
        )

    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
            retryable=True,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        method = getattr(_runtime(), method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)

    if method_name == "decide_candidate_review":
        return _unchain_review_decision(
            owner_chat_id=owner_chat_id,
            **arguments,
        )
    if method_name not in _UNCHAIN_CURATOR_QUERY_METHODS:
        raise MemoryV2Error(
            "context_v2_curator_internal_only",
            "This Curator mutation is owned by the internal Unchain toolkit",
            status_code=409,
        )

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_curator_query import (
            PupuUnchainCuratorQueryError,
            open_pupu_unchain_curator_query_api,
        )
        from unchain.persistence.sqlite_curator_query_v2 import (
            SQLiteCuratorQueryV2Error,
            SQLiteCuratorQueryV2IntegrityError,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_curator_unavailable",
            "Unchain-owned Curator reads are unavailable",
            status_code=503,
            retryable=True,
        ) from error

    try:
        curator = open_pupu_unchain_curator_query_api(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2"),
            owner_chat_id=owner_chat_id,
        )
        method = getattr(curator, method_name)
        return method(owner_chat_id=owner_chat_id, **arguments)
    except PupuUnchainCuratorQueryError as error:
        status_code = int(getattr(error, "status_code", 400))
        raise MemoryV2Error(
            str(getattr(error, "code", "") or "context_v2_curator_failed"),
            "Unchain-owned Curator request failed",
            status_code=status_code,
            retryable=status_code >= 500,
        ) from error
    except SQLiteCuratorQueryV2IntegrityError as error:
        raise MemoryV2Error(
            "context_v2_curator_integrity_unavailable",
            "Unchain-owned Curator state failed durable verification",
            status_code=503,
        ) from error
    except SQLiteCuratorQueryV2Error as error:
        code = str(error)
        not_found = code in {
            "memory_review_scope_mismatch",
            "memory_review_not_published",
        }
        raise MemoryV2Error(
            "context_v2_not_found" if not_found else "context_v2_curator_unavailable",
            (
                "The requested Curator record was not found"
                if not_found
                else "Unchain-owned Curator state is temporarily unavailable"
            ),
            status_code=404 if not_found else 503,
            retryable=not not_found,
        ) from error
    except (TypeError, ValueError) as error:
        raise MemoryV2Error(
            "context_v2_invalid_request",
            "Memory V2 Curator request is invalid",
            status_code=400,
        ) from error


def _status_for_store_owner() -> dict[str, Any]:
    """Return store-level health without fabricating a chat read scope."""

    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
            retryable=True,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        return _runtime().status()

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    try:
        from memory_v2_unchain_read_adapter import (
            PupuUnchainMemoryV2ReadError,
            read_pupu_unchain_memory_v2_store_status,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_read_unavailable",
            "Unchain-owned Context V2 status is unavailable",
            status_code=503,
            retryable=True,
        ) from error
    try:
        return read_pupu_unchain_memory_v2_store_status(
            root_dir=(Path(raw_data_dir).expanduser().resolve() / "memory_v2")
        )
    except PupuUnchainMemoryV2ReadError as error:
        raise MemoryV2Error(
            "context_v2_unchain_read_unavailable",
            "Unchain-owned Context V2 status is unavailable",
            status_code=503,
            retryable=True,
        ) from error


def _delete_chat_for_store_owner(
    *,
    owner_chat_id: str,
    operation_id: str,
) -> dict[str, Any]:
    try:
        store_owner = configured_context_v2_store_owner()
    except ContextV2StoreBoundaryError as error:
        raise MemoryV2Error(
            error.code,
            str(error),
            status_code=503,
        ) from error
    if store_owner != STORE_OWNER_UNCHAIN:
        return _runtime().delete_chat(
            owner_chat_id=owner_chat_id,
            operation_id=operation_id,
        )

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise MemoryV2Error(
            "context_v2_unavailable",
            "Context V2 storage is not configured",
            status_code=503,
            retryable=True,
        )
    database_path = (
        Path(raw_data_dir).expanduser().resolve()
        / "memory_v2"
        / CONTEXT_V2_DATABASE_FILENAME
    )
    try:
        from memory_v2_unchain_deletion_adapter import (
            PupuUnchainChatDeletionError,
            delete_pupu_unchain_chat,
        )
    except ImportError as error:
        raise MemoryV2Error(
            "context_v2_unchain_delete_unavailable",
            "Unchain-owned chat deletion is unavailable",
            status_code=503,
            retryable=True,
        ) from error
    try:
        return delete_pupu_unchain_chat(
            database_path=database_path,
            owner_chat_id=owner_chat_id,
            operation_id=operation_id,
        )
    except PupuUnchainChatDeletionError as error:
        raise MemoryV2Error(
            "context_v2_unchain_delete_failed",
            "Unchain-owned chat deletion is temporarily unavailable",
            status_code=503,
            retryable=True,
        ) from error


def _json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise MemoryV2Error(
            "context_v2_invalid_request",
            "JSON object body is required",
            status_code=400,
        )
    return payload


def _query_int(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise MemoryV2Error(
            "context_v2_invalid_request",
            f"{name} must be an integer",
            status_code=400,
        ) from exc


def _query_bool(name: str, default: bool) -> bool:
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    normalized = str(raw).strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise MemoryV2Error(
        "context_v2_invalid_request",
        f"{name} must be a boolean",
        status_code=400,
    )


def _content_bytes(payload: dict[str, Any]) -> bytes | None:
    has_text = "content" in payload
    has_base64 = "content_base64" in payload
    if has_text and has_base64:
        raise MemoryV2Error(
            "context_v2_invalid_content",
            "provide content or content_base64, not both",
            status_code=400,
        )
    if has_base64:
        encoded = payload.get("content_base64")
        if not isinstance(encoded, str):
            raise MemoryV2Error(
                "context_v2_invalid_content",
                "content_base64 must be a string",
                status_code=400,
            )
        try:
            return base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise MemoryV2Error(
                "context_v2_invalid_content",
                "content_base64 is invalid",
                status_code=400,
            ) from exc
    if has_text:
        text = payload.get("content")
        if not isinstance(text, str):
            raise MemoryV2Error(
                "context_v2_invalid_content",
                "content must be a string",
                status_code=400,
            )
        return text.encode("utf-8")
    return None


def _required_body_string(payload: dict[str, Any], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise MemoryV2Error(
            "context_v2_invalid_request",
            f"{name} is required",
            status_code=400,
        )
    return value.strip()


@api_blueprint.get("/context/v2/status")
@_endpoint
def context_v2_status() -> Response:
    status = _status_for_store_owner()
    rollout_status = _configured_rollout_status()
    memory_v2_capability = resolve_context_memory_v2_capability(
        requested_mode=rollout_status["rollout_mode"],
    )
    raw_vector_status = status.get("vector_status")
    if raw_vector_status in {"disabled", "warming", "ready", "degraded"}:
        vector_status = raw_vector_status
    else:
        vector_status = "degraded" if raw_vector_status else "disabled"
    return jsonify(
        {
            "available": bool(status["available"]),
            "schema_version": int(status["schema_version"]),
            "journal_mode": status["journal_mode"],
            "lexical_backend": status["lexical_backend"],
            "vector_status": vector_status,
            **rollout_status,
            **context_memory_v2_capability_status(memory_v2_capability),
        }
    )


@api_blueprint.get("/context/v2/events")
@_endpoint
def context_v2_events() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).load_events(
            owner_chat_id=owner_chat_id,
            after=_query_int("after", 0),
            limit=_query_int("limit", 100),
            session_id=request.args.get("session_id", ""),
            attempt_id=request.args.get("attempt_id", ""),
            include_payload=_query_bool("include_payload", True),
        )
    )


@api_blueprint.get("/context/v2/content/<path:ref>")
@_endpoint
def context_v2_content(ref: str) -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).read_scoped_content(
            owner_chat_id=owner_chat_id,
            ref=ref,
            offset=_query_int("offset", 0),
            limit=_query_int("limit", 32 * 1024),
        )
    )


@api_blueprint.post("/context/v2/session/rebase")
@_endpoint
def context_v2_session_rebase() -> Response:
    payload = _json_body()
    return jsonify(
        _runtime().rebase_session(
            owner_chat_id=payload.get("owner_chat_id", ""),
            session_id=payload.get("session_id", ""),
            replacement_history=payload.get("replacement_history"),
            source_generation_id=payload.get("source_generation_id", ""),
            expected_session_revision=payload.get("expected_session_revision"),
            operation_id=payload.get("operation_id", ""),
            reason=payload.get("reason", ""),
        )
    )


@api_blueprint.get("/context/v2/session/head")
@_endpoint
def context_v2_session_head() -> Response:
    return jsonify(
        _runtime().get_session_head(
            owner_chat_id=request.args.get("owner_chat_id", ""),
            session_id=request.args.get("session_id", ""),
        )
    )


@api_blueprint.delete("/context/v2/chat/<owner_chat_id>")
@_endpoint
def context_v2_delete_chat(owner_chat_id: str) -> Response:
    payload = _json_body()
    return jsonify(
        _delete_chat_for_store_owner(
            owner_chat_id=owner_chat_id,
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.get("/context/v2/memory/spaces")
@_endpoint
def context_v2_spaces_list() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).list_spaces(
            owner_chat_id=owner_chat_id,
        )
    )


@api_blueprint.post("/context/v2/memory/spaces")
@_endpoint
def context_v2_spaces_create() -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _workspace_mutation_for_store_owner(
            method_name="ensure_space",
            owner_chat_id=owner_chat_id,
            scope_kind="chat",
            scope_key=owner_chat_id,
            name=payload.get("name", ""),
            description=payload.get("description", ""),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.get("/context/v2/memory/spaces/<space_id>/tree")
@_endpoint
def context_v2_tree(space_id: str) -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).get_tree(
            owner_chat_id=owner_chat_id,
            space_id=space_id,
        )
    )


@api_blueprint.get("/context/v2/memory/spaces/<space_id>/entries")
@_endpoint
def context_v2_entries_list(space_id: str) -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).list_entries(
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            parent_path=request.args.get("parent_path", ""),
            include_descendants=_query_bool("include_descendants", True),
        )
    )


@api_blueprint.post("/context/v2/memory/spaces/<space_id>/entries")
@_endpoint
def context_v2_entries_create(space_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _workspace_mutation_for_store_owner(
            method_name="create_entry",
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            path=payload.get("path", ""),
            kind=payload.get("kind", ""),
            expected_space_revision=payload.get("expected_space_revision"),
            operation_id=payload.get("operation_id", ""),
            description=payload.get("description", ""),
            mime_type=payload.get("mime_type", "application/octet-stream"),
            content=_content_bytes(payload),
            link_url=payload.get("link_url", ""),
            source_event_id=payload.get("source_event_id", ""),
        )
    )


@api_blueprint.get("/context/v2/memory/spaces/<space_id>/entries/<entry_id>")
@_endpoint
def context_v2_entry_get(space_id: str, entry_id: str) -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    revision_raw = request.args.get("revision")
    revision = None if revision_raw in (None, "") else _query_int("revision", 0)
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).get_entry(
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            entry_id=entry_id,
            revision=revision,
        )
    )


@api_blueprint.patch("/context/v2/memory/spaces/<space_id>/entries/<entry_id>")
@_endpoint
def context_v2_entry_update(space_id: str, entry_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _workspace_mutation_for_store_owner(
            method_name="update_entry",
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            entry_id=entry_id,
            expected_revision=payload.get("expected_revision"),
            expected_space_revision=payload.get("expected_space_revision"),
            operation_id=payload.get("operation_id", ""),
            path=payload.get("path") if "path" in payload else None,
            description=(
                payload.get("description") if "description" in payload else None
            ),
            mime_type=payload.get("mime_type") if "mime_type" in payload else None,
            content=_content_bytes(payload),
            link_url=payload.get("link_url") if "link_url" in payload else None,
            source_event_id=(
                payload.get("source_event_id") if "source_event_id" in payload else None
            ),
        )
    )


@api_blueprint.delete("/context/v2/memory/spaces/<space_id>/entries/<entry_id>")
@_endpoint
def context_v2_entry_delete(space_id: str, entry_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _workspace_mutation_for_store_owner(
            method_name="delete_entry",
            owner_chat_id=owner_chat_id,
            space_id=space_id,
            entry_id=entry_id,
            expected_revision=payload.get("expected_revision"),
            expected_space_revision=payload.get("expected_space_revision"),
            operation_id=payload.get("operation_id", ""),
            recursive=payload.get("recursive", False),
        )
    )


@api_blueprint.get("/context/v2/memory/search")
@_endpoint
def context_v2_search() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _read_runtime_for_store_owner(owner_chat_id=owner_chat_id).search_entries(
            owner_chat_id=owner_chat_id,
            query=request.args.get("q", ""),
            space_id=request.args.get("space_id", ""),
            limit=_query_int("limit", 100),
        )
    )


@api_blueprint.get("/context/v2/memory/candidates")
@_endpoint
def context_v2_candidates_list() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="list_candidates",
            status=request.args.get("status", ""),
            limit=_query_int("limit", 100),
        )
    )


@api_blueprint.post("/context/v2/memory/candidates")
@_endpoint
def context_v2_candidates_create() -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="create_candidate",
            operation_id=payload.get("operation_id", ""),
            session_id=payload.get("session_id", ""),
            attempt_id=payload.get("attempt_id", ""),
            source_agent_run_id=payload.get("source_agent_run_id", ""),
            source_tool_call_id=payload.get("source_tool_call_id", ""),
            source_event_ids=payload.get("source_event_ids", ()),
            target_space_id=payload.get("target_space_id", ""),
            target_path=payload.get("target_path", ""),
            kind=payload.get("kind", "file"),
            description=payload.get("description", ""),
            mime_type=payload.get("mime_type", "text/markdown"),
            content=_content_bytes(payload),
            link_url=payload.get("link_url", ""),
            rationale=payload.get("rationale", ""),
            confidence=payload.get("confidence"),
            sensitivity=payload.get("sensitivity", "normal"),
        )
    )


@api_blueprint.post("/context/v2/memory/candidates/<candidate_id>/decision")
@_endpoint
def context_v2_candidate_decision(candidate_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="decide_candidate",
            candidate_id=candidate_id,
            decision=payload.get("decision", ""),
            expected_revision=payload.get("expected_revision"),
            operation_id=payload.get("operation_id", ""),
            decision_reason=payload.get("decision_reason", ""),
            expected_space_revision=payload.get("expected_space_revision"),
        )
    )


@api_blueprint.get("/context/v2/memory/reviews")
@_endpoint
def context_v2_candidate_reviews_list() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="list_candidate_reviews",
            status=request.args.get("status", ""),
            limit=_query_int("limit", 100),
        )
    )


@api_blueprint.get("/context/v2/memory/reviews/<review_id>")
@_endpoint
def context_v2_candidate_review_get(review_id: str) -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="get_candidate_review",
            review_id=review_id,
        )
    )


@api_blueprint.post("/context/v2/memory/reviews/<review_id>/decision")
@_endpoint
def context_v2_candidate_review_decision(review_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="decide_candidate_review",
            review_id=review_id,
            decision=payload.get("decision", ""),
            expected_review_revision=payload.get("expected_review_revision"),
            expected_candidate_revision=payload.get("expected_candidate_revision"),
            expected_target_revision=payload.get("expected_target_revision"),
            expected_space_revision=payload.get("expected_space_revision"),
            decision_reason=payload.get("decision_reason", ""),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.get("/context/v2/memory/jobs")
@_endpoint
def context_v2_jobs_list() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="list_consolidation_jobs",
            status=request.args.get("status", ""),
            limit=_query_int("limit", 100),
        )
    )


@api_blueprint.post("/context/v2/memory/jobs")
@_endpoint
def context_v2_jobs_create() -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="enqueue_consolidation_job",
            session_id=payload.get("session_id", ""),
            attempt_id=payload.get("attempt_id", ""),
            job_type=payload.get("job_type", ""),
            payload=payload.get("payload", {}),
            next_attempt_at_ms=payload.get("next_attempt_at_ms", 0),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.post("/context/v2/memory/jobs/claim")
@_endpoint
def context_v2_jobs_claim() -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _curator_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="claim_consolidation_job",
            worker_id=payload.get("worker_id", ""),
            lease_ms=payload.get("lease_ms", 30000),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.post("/context/v2/memory/jobs/<job_id>/heartbeat")
@_endpoint
def context_v2_job_heartbeat(job_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = _required_body_string(payload, "owner_chat_id")
    return jsonify(
        _curator_operation_for_store_owner(
            job_id=job_id,
            owner_chat_id=owner_chat_id,
            method_name="heartbeat_consolidation_job",
            worker_id=payload.get("worker_id", ""),
            lease_token=payload.get("lease_token", ""),
            expected_revision=payload.get("expected_revision"),
            operation_id=payload.get("operation_id", ""),
            lease_ms=payload.get("lease_ms", 30000),
        )
    )


@api_blueprint.post("/context/v2/memory/jobs/<job_id>/complete")
@_endpoint
def context_v2_job_complete(job_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = _required_body_string(payload, "owner_chat_id")
    return jsonify(
        _curator_operation_for_store_owner(
            job_id=job_id,
            owner_chat_id=owner_chat_id,
            method_name="complete_consolidation_job",
            worker_id=payload.get("worker_id", ""),
            lease_token=payload.get("lease_token", ""),
            expected_revision=payload.get("expected_revision"),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.post("/context/v2/memory/jobs/<job_id>/fail")
@_endpoint
def context_v2_job_fail(job_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = _required_body_string(payload, "owner_chat_id")
    return jsonify(
        _curator_operation_for_store_owner(
            job_id=job_id,
            owner_chat_id=owner_chat_id,
            method_name="fail_consolidation_job",
            worker_id=payload.get("worker_id", ""),
            lease_token=payload.get("lease_token", ""),
            expected_revision=payload.get("expected_revision"),
            operation_id=payload.get("operation_id", ""),
            error_code=payload.get("error_code", ""),
            retry_at_ms=payload.get("retry_at_ms", 0),
        )
    )


@api_blueprint.get("/context/v2/memory/promotions")
@_endpoint
def context_v2_promotions_list() -> Response:
    owner_chat_id = request.args.get("owner_chat_id", "")
    return jsonify(
        _promotion_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="list_promotions",
            status=request.args.get("status", ""),
            limit=_query_int("limit", 100),
        )
    )


@api_blueprint.post("/context/v2/memory/promotions")
@_endpoint
def context_v2_promotions_create() -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _promotion_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="propose_promotion",
            source_space_id=payload.get("source_space_id", ""),
            source_entry_id=payload.get("source_entry_id", ""),
            source_entry_revision=payload.get("source_entry_revision"),
            target_namespace="user:local",
            target_path=payload.get("target_path", ""),
            target_entry_id=payload.get("target_entry_id", ""),
            expected_target_revision=payload.get("expected_target_revision"),
            operation_id=payload.get("operation_id", ""),
        )
    )


@api_blueprint.post("/context/v2/memory/promotions/<promotion_id>/decision")
@_endpoint
def context_v2_promotion_decision(promotion_id: str) -> Response:
    payload = _json_body()
    owner_chat_id = payload.get("owner_chat_id", "")
    return jsonify(
        _promotion_operation_for_store_owner(
            owner_chat_id=owner_chat_id,
            method_name="decide_promotion",
            promotion_id=promotion_id,
            decision=payload.get("decision", ""),
            expected_revision=payload.get("expected_revision"),
            operation_id=payload.get("operation_id", ""),
            decision_reason=payload.get("decision_reason", ""),
        )
    )
