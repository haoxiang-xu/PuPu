import json
import math
import threading
import time
from typing import Any, Dict, Iterable, List

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from miso_adapter import (
    cancel_tool_confirmations,
    get_capability_catalog,
    get_embedding_provider_catalog,
    get_default_model_capabilities,
    get_model_capability_catalog,
    get_model_name,
    get_runtime_config,
    get_toolkit_catalog,
    submit_tool_confirmation,
    stream_chat,
    stream_chat_events,
)

api_blueprint = Blueprint("miso_api", __name__)
_ATTACHMENT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}
_MEMORY_PROJECTION_MAX_POINTS = 10000
_MEMORY_PROJECTION_PAGE_SIZE = 512


def _sse_event(event_name: str, payload: Dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


_TRACE_STAGE_BY_EVENT_TYPE = {
    "run_started": "agent",
    "iteration_started": "agent",
    "iteration_completed": "agent",
    "run_completed": "agent",
    "run_max_iterations": "agent",
    "reasoning": "agent",
    "observation": "agent",
    "token_delta": "model",
    "final_message": "model",
    "tool_call": "tool",
    "tool_confirmation_request": "tool",
    "tool_confirmed": "tool",
    "tool_denied": "tool",
    "tool_result": "tool",
    "error": "stream",
    "done": "stream",
}


def _sanitize_trace_level(raw_trace_level: object) -> str:
    if not isinstance(raw_trace_level, str):
        return "minimal"
    normalized = raw_trace_level.strip().lower()
    return "full" if normalized == "full" else "minimal"


def _trace_stage(event_type: str) -> str:
    return _TRACE_STAGE_BY_EVENT_TYPE.get(event_type, "agent")


def _sanitize_trace_value(value: object, trace_level: str, depth: int = 0):
    if trace_level == "full":
        return value

    if depth >= 5:
        return "[truncated]"

    if isinstance(value, str):
        return value if len(value) <= 800 else f"{value[:800]}... [truncated]"

    if isinstance(value, list):
        limited_items = value[:20]
        sanitized = [
            _sanitize_trace_value(item, trace_level, depth + 1)
            for item in limited_items
        ]
        if len(value) > 20:
            sanitized.append("[truncated]")
        return sanitized

    if isinstance(value, dict):
        sanitized: Dict[str, object] = {}
        for idx, (key, inner_value) in enumerate(value.items()):
            if idx >= 30:
                sanitized["__truncated__"] = True
                break
            sanitized[str(key)] = _sanitize_trace_value(
                inner_value,
                trace_level,
                depth + 1,
            )
        return sanitized

    return value


def _normalize_stream_error(stream_error: Exception) -> tuple[str, str]:
    message = str(stream_error)
    code = "stream_failed"
    if isinstance(message, str):
        normalized = message.strip()
        if normalized.startswith("memory_unavailable"):
            code = "memory_unavailable"
            if ":" in normalized:
                tail = normalized.split(":", 1)[1].strip()
                if tail:
                    message = tail
    return code, message


def _build_trace_frame(
    *,
    seq: int,
    thread_id: str,
    event_type: str,
    payload: Dict[str, object],
    run_id: str = "",
    iteration: int = 0,
    timestamp_ms: int | None = None,
) -> Dict[str, object]:
    return {
        "seq": seq,
        "ts": timestamp_ms if isinstance(timestamp_ms, int) else int(time.time() * 1000),
        "thread_id": thread_id,
        "run_id": run_id,
        "iteration": iteration,
        "stage": _trace_stage(event_type),
        "type": event_type,
        "payload": payload,
    }


def _is_authorized() -> bool:
    expected_token = current_app.config.get("MISO_AUTH_TOKEN", "")
    if not expected_token:
        return True
    provided_token = request.headers.get("x-miso-auth", "")
    return provided_token == expected_token


def _normalize_attachment_modality(raw_modality: object) -> str:
    if not isinstance(raw_modality, str):
        return ""
    modality = raw_modality.strip().lower()
    modality = _ATTACHMENT_MODALITY_ALIAS_MAP.get(modality, modality)
    return modality if modality in {"image", "pdf"} else ""


def _sanitize_attachment_block(raw_block: object) -> Dict[str, object] | None:
    if not isinstance(raw_block, dict):
        return None

    modality = _normalize_attachment_modality(raw_block.get("type"))
    if not modality:
        return None

    source = raw_block.get("source")
    if not isinstance(source, dict):
        return None

    source_type = str(source.get("type", "")).strip().lower()
    if source_type == "url":
        url = str(source.get("url", "")).strip()
        if not url:
            return None
        normalized_source: Dict[str, object] = {"type": "url", "url": url}
        media_type = source.get("media_type")
        if isinstance(media_type, str) and media_type.strip():
            normalized_source["media_type"] = media_type.strip()
        return {"type": modality, "source": normalized_source}

    if source_type == "base64":
        data = str(source.get("data", "")).strip()
        if not data:
            return None

        media_type = str(source.get("media_type", "")).strip().lower()
        if modality == "image":
            if not media_type.startswith("image/"):
                return None
        else:
            if not media_type:
                media_type = "application/pdf"
            if media_type != "application/pdf":
                return None

        normalized_source = {
            "type": "base64",
            "media_type": media_type,
            "data": data,
        }
        if modality == "pdf":
            filename = source.get("filename")
            if isinstance(filename, str) and filename.strip():
                normalized_source["filename"] = filename.strip()
        return {"type": modality, "source": normalized_source}

    if modality == "pdf" and source_type == "file_id":
        file_id = str(source.get("file_id", "")).strip()
        if not file_id:
            return None
        return {
            "type": "pdf",
            "source": {
                "type": "file_id",
                "file_id": file_id,
            },
        }

    return None


def _sanitize_history_content(content: object) -> str | List[Dict[str, object]] | None:
    if isinstance(content, str):
        trimmed = content.strip()
        return trimmed if trimmed else None

    if not isinstance(content, list):
        return None

    normalized_blocks: List[Dict[str, object]] = []
    for block in content:
        if not isinstance(block, dict):
            continue

        block_type = str(block.get("type", "")).strip().lower()
        if block_type in {"text", "input_text"}:
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                normalized_blocks.append(
                    {
                        "type": "text",
                        "text": text,
                    }
                )
            continue

        attachment_block = _sanitize_attachment_block(block)
        if attachment_block:
            normalized_blocks.append(attachment_block)

    if not normalized_blocks:
        return None
    return normalized_blocks


def _sanitize_history(payload_history: object) -> List[Dict[str, Any]]:
    if not isinstance(payload_history, list):
        return []

    history: List[Dict[str, Any]] = []
    for item in payload_history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip()
        content = _sanitize_history_content(item.get("content"))
        if role in {"user", "assistant", "system"} and content is not None:
            history.append({"role": role, "content": content})
    return history


def _sanitize_attachments(payload_attachments: object) -> List[Dict[str, object]]:
    if not isinstance(payload_attachments, list):
        return []

    attachments: List[Dict[str, object]] = []
    for item in payload_attachments:
        sanitized = _sanitize_attachment_block(item)
        if sanitized:
            attachments.append(sanitized)
    return attachments


def _coerce_memory_text(value: object, *, _depth: int = 0) -> str:
    if _depth >= 8:
        return ""

    if isinstance(value, str):
        return value.strip()

    if value is None:
        return ""

    if isinstance(value, list):
        lines: List[str] = []
        for item in value:
            rendered = _coerce_memory_text(item, _depth=_depth + 1)
            if rendered:
                lines.append(rendered)
        return "\n".join(lines).strip()

    if isinstance(value, dict):
        role = str(value.get("role", "")).strip().lower()
        if role:
            content = _coerce_memory_text(value.get("content"), _depth=_depth + 1)
            if content:
                return f"{role}: {content}"

        text_value = value.get("text")
        if isinstance(text_value, str) and text_value.strip():
            return text_value.strip()

        for key in ("content", "conversation", "messages", "summary", "thinking"):
            nested = _coerce_memory_text(value.get(key), _depth=_depth + 1)
            if nested:
                return nested

        try:
            dumped = json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            dumped = str(value)
        return dumped.strip()

    return str(value).strip()


def _extract_projection_text(payload: Dict[str, object]) -> str:
    for key in ("text", "conversation", "messages", "content", "summary"):
        rendered = _coerce_memory_text(payload.get(key))
        if rendered:
            if len(rendered) > 12000:
                return f"{rendered[:12000]}â€¦"
            return rendered
    return ""


def _empty_projection_payload() -> Dict[str, object]:
    return {"points": [], "variance": [0.0, 0.0]}


def _profile_preview(document: object, *, limit: int = 220) -> str:
    if not isinstance(document, dict) or not document:
        return ""
    try:
        rendered = json.dumps(document, ensure_ascii=False)
    except Exception:
        return ""
    if len(rendered) <= limit:
        return rendered
    return f"{rendered[: limit - 3]}..."


def _load_long_term_profiles_payload(data_dir: str) -> Dict[str, object]:
    from pathlib import Path

    profiles_dir = Path(data_dir) / "memory" / "long_term_profiles"
    if not profiles_dir.exists():
        return {
            "profiles": [],
            "profile_count": 0,
            "profile_total_bytes": 0,
        }

    profiles: List[Dict[str, object]] = []
    total_bytes = 0

    for profile_path in sorted(
        profiles_dir.glob("*.json"),
        key=lambda item: item.name.lower(),
    ):
        try:
            size_bytes = profile_path.stat().st_size
        except Exception:
            size_bytes = 0
        total_bytes += size_bytes

        try:
            raw_document = json.loads(profile_path.read_text(encoding="utf-8"))
        except Exception:
            raw_document = {}

        document = raw_document if isinstance(raw_document, dict) else {}
        profiles.append(
            {
                "id": profile_path.name,
                "storage_key": profile_path.stem,
                "size_bytes": size_bytes,
                "entry_count": len(document),
                "preview": _profile_preview(document),
                "document": document,
            }
        )

    return {
        "profiles": profiles,
        "profile_count": len(profiles),
        "profile_total_bytes": total_bytes,
    }


def _projection_collection_prefix(tag: object) -> str:
    clean_tag = "".join(
        c if c.isalnum() or c == "_" else "_"
        for c in str(tag or "").strip()
    )
    return f"chat_{clean_tag}" if clean_tag else "chat"


def _projection_session_collection_name(
    *,
    session_id: object,
    collection_prefix: str,
) -> str:
    safe_session_id = "".join(
        c if c.isalnum() or c == "_" else "_"
        for c in str(session_id or "")
    )
    return f"{collection_prefix}_{safe_session_id}"


def _normalize_projection_vector(
    raw_vector: object,
    *,
    expected_dims: int = 0,
) -> List[float] | None:
    vector_candidate: Any = raw_vector
    if isinstance(raw_vector, dict):
        vector_candidate = next(
            (
                value
                for value in raw_vector.values()
                if isinstance(value, (list, tuple)) and value
            ),
            None,
        )

    if not isinstance(vector_candidate, (list, tuple)) or not vector_candidate:
        return None

    try:
        vector = [float(item) for item in vector_candidate]
    except Exception:
        return None

    if not vector or any(not math.isfinite(item) for item in vector):
        return None

    if expected_dims > 0 and len(vector) != expected_dims:
        return None

    return vector


def _is_projection_collection_missing_error(error: Exception) -> bool:
    normalized = str(error or "").strip().lower()
    if "collection" not in normalized:
        return False
    return (
        "not found" in normalized
        or "does not exist" in normalized
        or "doesn't exist" in normalized
    )


def _scroll_projection_points(client: Any, collection_name: str) -> List[Any]:
    all_points: List[Any] = []
    next_offset: Any = None

    while len(all_points) < _MEMORY_PROJECTION_MAX_POINTS:
        remaining = _MEMORY_PROJECTION_MAX_POINTS - len(all_points)
        limit = min(_MEMORY_PROJECTION_PAGE_SIZE, remaining)
        request_kwargs: Dict[str, Any] = {
            "collection_name": collection_name,
            "with_payload": True,
            "with_vectors": True,
            "limit": limit,
        }
        if next_offset is not None:
            request_kwargs["offset"] = next_offset

        try:
            page_points, new_offset = client.scroll(**request_kwargs)
        except TypeError:
            # Fallback for older clients; degrade to a single-page fetch.
            if "offset" in request_kwargs:
                break
            request_kwargs.pop("offset", None)
            page_points, new_offset = client.scroll(**request_kwargs)
            all_points.extend(page_points or [])
            break

        if not page_points:
            break

        all_points.extend(page_points)
        if new_offset is None:
            break
        next_offset = new_offset

    return all_points


def _kmeans_2d_numpy(coords_2d: "Any") -> List[int]:
    """K-means++ clustering on 2D PCA coordinates (numpy only).
    Auto-selects k = max(2, min(6, round(sqrt(n)))).
    Fixed seed=42 for reproducibility.
    """
    import numpy as _np
    arr = _np.asarray(coords_2d, dtype=_np.float64)
    n = len(arr)
    if n <= 1:
        return [0] * n
    k = max(2, min(6, round(n ** 0.5)))
    k = min(k, n)
    if k == 1:
        return [0] * n

    rng = _np.random.default_rng(42)
    # K-means++ init: first centroid random, rest proportional to DÂ²
    centroid_indices: List[int] = [int(rng.integers(0, n))]
    for _ in range(k - 1):
        c = arr[centroid_indices]
        diff = arr[:, None, :] - c[None]          # (n, m, 2)
        min_sq_d = _np.min(_np.sum(diff ** 2, axis=2), axis=1)  # (n,)
        total = float(min_sq_d.sum())
        if total <= 0.0:
            break
        probs = min_sq_d / total
        centroid_indices.append(int(rng.choice(n, p=probs)))

    centroids = arr[centroid_indices].copy()
    labels = _np.zeros(n, dtype=int)
    for _ in range(150):
        diff = arr[:, None, :] - centroids[None]      # (n, k, 2)
        new_labels = _np.sum(diff ** 2, axis=2).argmin(axis=1)
        if _np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for ki in range(len(centroids)):
            mask = labels == ki
            if mask.any():
                centroids[ki] = arr[mask].mean(axis=0)

    return labels.tolist()


def _normalize_cluster_labels(raw_labels: object, point_count: int) -> List[int]:
    if point_count <= 0:
        return []

    candidate = raw_labels
    if hasattr(candidate, "tolist"):
        try:
            candidate = candidate.tolist()
        except Exception:
            candidate = []

    normalized: List[int] = []
    if isinstance(candidate, list):
        for item in candidate:
            try:
                normalized.append(max(0, int(item)))
            except Exception:
                normalized.append(0)

    if len(normalized) < point_count:
        normalized.extend([0] * (point_count - len(normalized)))

    return normalized[:point_count]


@api_blueprint.get("/health")
def health() -> Response:
    return jsonify(
        {
            "status": "ok",
            "version": current_app.config.get("MISO_VERSION", "0.1.0-dev"),
            "model": get_model_name(),
            "threaded": True,
        }
    )


@api_blueprint.get("/models/catalog")
def models_catalog() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    runtime = get_runtime_config()
    provider_catalog = get_capability_catalog()
    embedding_provider_catalog = get_embedding_provider_catalog()
    model_capabilities = get_model_capability_catalog()
    active_provider = str(runtime.get("provider", "ollama")).strip().lower() or "ollama"
    active_model = str(runtime.get("model", "")).strip()
    active_model_id = f"{active_provider}:{active_model}"
    active_capabilities = model_capabilities.get(active_model_id) or get_default_model_capabilities()

    return jsonify(
        {
            "active": {
                "provider": active_provider,
                "model": active_model,
                "model_id": active_model_id,
                "capabilities": active_capabilities,
            },
            "providers": {
                "openai": provider_catalog.get("openai", []),
                "anthropic": provider_catalog.get("anthropic", []),
                "ollama": provider_catalog.get("ollama", []),
            },
            "embedding_providers": {
                "openai": embedding_provider_catalog.get("openai", []),
            },
            "model_capabilities": model_capabilities,
        }
    )


@api_blueprint.get("/toolkits/catalog")
def toolkits_catalog() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    return jsonify(get_toolkit_catalog())


@api_blueprint.post("/chat/tool/confirmation")
def chat_tool_confirmation() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    confirmation_id_raw = payload.get("confirmation_id")
    confirmation_id = (
        confirmation_id_raw.strip()
        if isinstance(confirmation_id_raw, str)
        else ""
    )
    if not confirmation_id:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "confirmation_id is required",
                }
            }
        ), 400

    approved = bool(payload.get("approved", False))
    reason_raw = payload.get("reason", "")
    reason = reason_raw if isinstance(reason_raw, str) else str(reason_raw or "")

    modified_arguments = payload.get("modified_arguments")
    if modified_arguments is not None and not isinstance(modified_arguments, dict):
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "modified_arguments must be an object when provided",
                }
            }
        ), 400

    found = submit_tool_confirmation(
        confirmation_id=confirmation_id,
        approved=approved,
        reason=reason,
        modified_arguments=modified_arguments,
    )
    if not found:
        return jsonify(
            {
                "error": {
                    "code": "not_found",
                    "message": "No pending confirmation found for this ID",
                }
            }
        ), 404

    return jsonify({"status": "ok"})


@api_blueprint.post("/chat/stream")
def chat_stream() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "message or attachments is required",
                }
            }
        ), 400

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    history = _sanitize_history(payload.get("history"))
    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}

    def stream_events() -> Iterable[str]:
        started_at = int(time.time() * 1000)

        try:
            yield _sse_event(
                "meta",
                {
                    "thread_id": thread_id,
                    "model": get_model_name(options),
                    "started_at": started_at,
                },
            )

            for delta in stream_chat(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
            ):
                normalized_delta = str(delta)
                yield _sse_event("token", {"delta": normalized_delta})

            yield _sse_event(
                "done",
                {
                    "thread_id": thread_id,
                    "finished_at": int(time.time() * 1000),
                },
            )
        except GeneratorExit:  # pragma: no cover
            return
        except Exception as stream_error:
            code, normalized_message = _normalize_stream_error(stream_error)
            yield _sse_event(
                "error",
                {
                    "code": code,
                    "message": normalized_message,
                },
            )

    return Response(
        stream_with_context(stream_events()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@api_blueprint.get("/memory/projection")
def memory_projection() -> Response:
    session_id = request.args.get("session_id", "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    if not _is_authorized():
        return jsonify({"error": {"code": "unauthorized", "message": "Unauthorized"}}), 401

    try:
        import memory_factory
        import json as _json
        import numpy as np
        from pathlib import Path

        _data_dir = memory_factory._data_dir
        _normalize_data_dir = memory_factory._normalize_data_dir
        _get_or_create_qdrant_client = memory_factory._get_or_create_qdrant_client
        vector_collection_prefix = getattr(
            memory_factory,
            "_vector_collection_prefix",
            _projection_collection_prefix,
        )
        session_collection_name = getattr(
            memory_factory,
            "_session_collection_name",
            _projection_session_collection_name,
        )

        data_dir = _normalize_data_dir(_data_dir())
        if not data_dir:
            return jsonify({"error": "MISO_DATA_DIR not configured"}), 503

        # Resolve the actual Qdrant collection name.
        #
        # New sessions store a random hex `vector_collection_tag` in the session
        # JSON â†’ collection = chat_{tag}_{safe_session_id}
        #
        # Legacy sessions (tag absent) fall through to `_vector_collection_prefix("")`
        # which returns "chat", giving collection = chat_{safe_session_id}
        # â€” matching the legacy naming that was used before the tag system.
        session_file = Path(data_dir) / "memory" / "sessions" / f"{session_id}.json"
        try:
            with open(session_file, "r", encoding="utf-8") as _f:
                _state = _json.load(_f)
        except Exception:
            _state = {}

        tag = str(_state.get("vector_collection_tag") or "").strip()
        collection = session_collection_name(
            session_id=session_id,
            collection_prefix=vector_collection_prefix(tag),
        )
        client = _get_or_create_qdrant_client(data_dir)

        scroll_result = _scroll_projection_points(client, collection)

        if not scroll_result:
            return jsonify(_empty_projection_payload())

        vector_rows: List[List[float]] = []
        vector_points: List[Any] = []
        expected_dims = 0

        for point in scroll_result:
            vector = _normalize_projection_vector(
                getattr(point, "vector", None),
                expected_dims=expected_dims,
            )
            if vector is None:
                continue

            if expected_dims <= 0:
                expected_dims = len(vector)

            vector_rows.append(vector)
            vector_points.append(point)

        if not vector_rows:
            return jsonify(_empty_projection_payload())

        vectors = np.array(vector_rows, dtype=np.float64)

        # PCA via numpy thin SVD â€” center, project onto top-5 right singular vectors
        try:
            X = vectors - vectors.mean(axis=0)
            _, s, Vt = np.linalg.svd(X, full_matrices=False)
        except Exception:
            return jsonify(_empty_projection_payload())
        n_pcs = min(5, len(s))
        coords = X @ Vt[:n_pcs].T  # (n, n_pcs)
        coords_shape = getattr(coords, "shape", ())
        point_count = min(
            len(vector_points),
            int(coords_shape[0]) if len(coords_shape) >= 1 else 0,
        )
        if point_count <= 0:
            return jsonify(_empty_projection_payload())
        total_var = float((s ** 2).sum())
        variance = (
            [float(s[i] ** 2 / total_var) if i < len(s) else 0.0 for i in range(5)]
            if total_var > 0
            else [0.0] * 5
        )
        try:
            cluster_labels = _normalize_cluster_labels(
                _kmeans_2d_numpy(coords[:point_count, :2]),
                point_count,
            )
        except Exception:
            cluster_labels = [0] * point_count

        points = []
        for i, p in enumerate(vector_points[:point_count]):
            payload = p.payload if isinstance(p.payload, dict) else {}
            full_text = _extract_projection_text(payload)
            turn_start = payload.get("turn_start_index")
            turn_end   = payload.get("turn_end_index")

            # label: first non-empty user line, capped at 52 chars  (used by scatter tooltip title)
            label = ""
            for line in full_text.splitlines():
                stripped = line.strip()
                if stripped:
                    # strip "user:" / "assistant:" role prefix for the label
                    for prefix in ("user:", "assistant:", "user :", "assistant :"):
                        if stripped.lower().startswith(prefix):
                            stripped = stripped[len(prefix):].strip()
                            break
                    label = stripped[:52] + ("â€¦" if len(stripped) > 52 else "")
                    break

            # content: full text for the tooltip body, capped at 300 chars
            content = full_text[:300] + ("â€¦" if len(full_text) > 300 else "")

            pc_vals = [
                float(coords[i, j]) if len(coords_shape) >= 2 and j < coords_shape[1] else 0.0
                for j in range(5)
            ]
            points.append({
                "id":               str(p.id),
                "x":                pc_vals[0],
                "y":                pc_vals[1],
                "pc1":              pc_vals[0],
                "pc2":              pc_vals[1],
                "pc3":              pc_vals[2],
                "pc4":              pc_vals[3],
                "pc5":              pc_vals[4],
                "group":            f"Cluster {cluster_labels[i] + 1}",
                "text":             full_text,
                "label":            label,
                "content":          content,
                "turn_start_index": turn_start,
                "turn_end_index":   turn_end,
            })

        return jsonify({"points": points, "variance": variance})

    except Exception as exc:
        if _is_projection_collection_missing_error(exc):
            return jsonify(_empty_projection_payload())
        return jsonify({"error": str(exc)}), 500


@api_blueprint.get("/memory/long-term/projection")
def long_term_memory_projection() -> Response:
    """PCA scatter projection over ALL long-term memory collections."""
    if not _is_authorized():
        return jsonify({"error": {"code": "unauthorized", "message": "Unauthorized"}}), 401

    try:
        from memory_factory import (
            _data_dir,
            _normalize_data_dir,
            _get_or_create_qdrant_client,
        )
        import numpy as np

        data_dir = _normalize_data_dir(_data_dir())
        if not data_dir:
            return jsonify({"error": "MISO_DATA_DIR not configured"}), 503

        client = _get_or_create_qdrant_client(data_dir)
        profile_payload = _load_long_term_profiles_payload(data_dir)

        # Discover all collections whose name starts with "long_term"
        all_collections = client.get_collections().collections
        lt_names = [
            c.name for c in all_collections if c.name.startswith("long_term")
        ]

        if not lt_names:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)

        # Scroll every long-term collection and merge
        all_scroll: List[Any] = []
        for col_name in lt_names:
            all_scroll.extend(_scroll_projection_points(client, col_name))

        if not all_scroll:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)

        vector_rows: List[List[float]] = []
        vector_points: List[Any] = []
        expected_dims = 0

        for point in all_scroll:
            vector = _normalize_projection_vector(
                getattr(point, "vector", None),
                expected_dims=expected_dims,
            )
            if vector is None:
                continue

            if expected_dims <= 0:
                expected_dims = len(vector)

            vector_rows.append(vector)
            vector_points.append(point)

        if not vector_rows:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)

        vectors = np.array(vector_rows, dtype=np.float64)

        try:
            X = vectors - vectors.mean(axis=0)
            _, s, Vt = np.linalg.svd(X, full_matrices=False)
        except Exception:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)
        n_pcs = min(5, len(s))
        coords = X @ Vt[:n_pcs].T
        coords_shape = getattr(coords, "shape", ())
        point_count = min(
            len(vector_points),
            int(coords_shape[0]) if len(coords_shape) >= 1 else 0,
        )
        if point_count <= 0:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)
        total_var = float((s ** 2).sum())
        variance = (
            [float(s[i] ** 2 / total_var) if i < len(s) else 0.0 for i in range(5)]
            if total_var > 0
            else [0.0] * 5
        )
        try:
            cluster_labels = _normalize_cluster_labels(
                _kmeans_2d_numpy(coords[:point_count, :2]),
                point_count,
            )
        except Exception:
            cluster_labels = [0] * point_count

        points = []
        for i, p in enumerate(vector_points[:point_count]):
            payload = p.payload if isinstance(p.payload, dict) else {}
            full_text = _extract_projection_text(payload)

            label = ""
            for line in full_text.splitlines():
                stripped = line.strip()
                if stripped:
                    for prefix in ("user:", "assistant:", "user :", "assistant :"):
                        if stripped.lower().startswith(prefix):
                            stripped = stripped[len(prefix):].strip()
                            break
                    label = stripped[:52] + ("â€¦" if len(stripped) > 52 else "")
                    break

            content = full_text[:300] + ("â€¦" if len(full_text) > 300 else "")

            pc_vals = [
                float(coords[i, j]) if len(coords_shape) >= 2 and j < coords_shape[1] else 0.0
                for j in range(5)
            ]
            points.append({
                "id":      str(p.id),
                "x":       pc_vals[0],
                "y":       pc_vals[1],
                "pc1":     pc_vals[0],
                "pc2":     pc_vals[1],
                "pc3":     pc_vals[2],
                "pc4":     pc_vals[3],
                "pc5":     pc_vals[4],
                "group":   f"Cluster {cluster_labels[i] + 1}",
                "text":    full_text,
                "label":   label,
                "content": content,
            })

        return jsonify(
            {
                "points": points,
                "variance": variance,
                **profile_payload,
            }
        )

    except Exception as exc:
        if _is_projection_collection_missing_error(exc):
            return jsonify(_empty_projection_payload())
        return jsonify({"error": str(exc)}), 500


@api_blueprint.post("/memory/session/replace")
def replace_memory_session() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    session_id_raw = payload.get("session_id") or payload.get("sessionId")
    session_id = str(session_id_raw or "").strip()
    if not session_id:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "session_id is required",
                }
            }
        ), 400

    raw_messages = payload.get("messages")
    if not isinstance(raw_messages, list):
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "messages must be an array",
                }
            }
        ), 400

    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}

    try:
        import memory_factory

        result = memory_factory.replace_short_term_session_memory(
            session_id=session_id,
            messages=raw_messages,
            options=options,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": str(exc),
                }
            }
        ), 400
    except Exception as exc:
        return jsonify(
            {
                "error": {
                    "code": "memory_replace_failed",
                    "message": str(exc),
                }
            }
        ), 500


@api_blueprint.post("/chat/stream/v2")
def chat_stream_v2() -> Response:
    if not _is_authorized():
        return jsonify(
            {
                "error": {
                    "code": "unauthorized",
                    "message": "Invalid auth token",
                }
            }
        ), 401

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    attachments = _sanitize_attachments(payload.get("attachments"))
    if not message and not attachments:
        return jsonify(
            {
                "error": {
                    "code": "invalid_request",
                    "message": "message or attachments is required",
                }
            }
        ), 400

    incoming_thread_id = payload.get("threadId") or payload.get("thread_id")
    thread_id = str(incoming_thread_id).strip() if incoming_thread_id else ""
    if not thread_id:
        thread_id = f"thread-{int(time.time() * 1000)}"

    history = _sanitize_history(payload.get("history"))
    options = payload.get("options", {}) if isinstance(payload.get("options"), dict) else {}
    trace_level = _sanitize_trace_level(
        payload.get("trace_level")
        or options.get("trace_level")
        or "minimal"
    )

    def stream_events() -> Iterable[str]:
        seq = 0
        started_at = int(time.time() * 1000)
        final_bundle: Dict[str, object] | None = None
        confirmation_cancel_event = threading.Event()

        def cancel_pending_confirmations() -> None:
            confirmation_cancel_event.set()
            cancel_tool_confirmations(confirmation_cancel_event)

        try:
            seq += 1
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="stream_started",
                    payload={
                        "model": get_model_name(options),
                        "started_at": started_at,
                        "trace_level": trace_level,
                    },
                    iteration=0,
                    timestamp_ms=started_at,
                ),
            )

            for raw_event in stream_chat_events(
                message=message,
                history=history,
                attachments=attachments,
                options=options,
                session_id=thread_id,
                cancel_event=confirmation_cancel_event,
            ):
                event_type = str(raw_event.get("type", "event")).strip() or "event"

                if event_type == "stream_summary":
                    bundle = raw_event.get("bundle")
                    if isinstance(bundle, dict) and bundle:
                        final_bundle = bundle
                    continue

                payload_data = {
                    key: value
                    for key, value in raw_event.items()
                    if key not in {"type", "run_id", "iteration", "timestamp"}
                }
                # Skip trace sanitization for display-critical events whose
                # content must arrive intact (final_message carries the full
                # reply text and token_delta carries incremental chunks).
                if event_type in ("final_message", "token_delta", "request_messages"):
                    sanitized_payload = payload_data
                else:
                    sanitized_payload = _sanitize_trace_value(payload_data, trace_level)

                run_id = raw_event.get("run_id")
                normalized_run_id = run_id if isinstance(run_id, str) else ""
                iteration = raw_event.get("iteration")
                normalized_iteration = iteration if isinstance(iteration, int) else 0
                raw_ts = raw_event.get("timestamp")
                if isinstance(raw_ts, (int, float)):
                    event_ts_ms = int(float(raw_ts) * 1000)
                else:
                    event_ts_ms = int(time.time() * 1000)

                seq += 1
                yield _sse_event(
                    "frame",
                    _build_trace_frame(
                        seq=seq,
                        thread_id=thread_id,
                        event_type=event_type,
                        payload=sanitized_payload,
                        run_id=normalized_run_id,
                        iteration=normalized_iteration,
                        timestamp_ms=event_ts_ms,
                    ),
                )

            seq += 1
            finished_at = int(time.time() * 1000)
            done_payload: Dict[str, object] = {
                "finished_at": finished_at,
            }
            if isinstance(final_bundle, dict) and final_bundle:
                done_payload["bundle"] = final_bundle
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="done",
                    payload=done_payload,
                    iteration=0,
                    timestamp_ms=finished_at,
                ),
            )
        except GeneratorExit:  # pragma: no cover
            cancel_pending_confirmations()
            return
        except Exception as stream_error:
            cancel_pending_confirmations()
            code, normalized_message = _normalize_stream_error(stream_error)
            seq += 1
            error_ts = int(time.time() * 1000)
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    thread_id=thread_id,
                    event_type="error",
                    payload={
                        "code": code,
                        "message": normalized_message,
                    },
                    iteration=0,
                    timestamp_ms=error_ts,
                ),
            )
        finally:
            cancel_pending_confirmations()

    return Response(
        stream_with_context(stream_events()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
