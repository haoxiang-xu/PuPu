import json
import math
from pathlib import Path
from typing import Any, Dict, List

from flask import Response, jsonify, request

from route_blueprint import api_blueprint

_MEMORY_PROJECTION_MAX_POINTS = 10000
_MEMORY_PROJECTION_PAGE_SIZE = 512


def _root():
    import routes as routes_module

    return routes_module


def _coerce_memory_text(value: object, *, _depth: int = 0) -> str:
    if _depth >= 8:
        return ""
    if isinstance(value, str):
        return value.strip()
    if value is None:
        return ""
    if isinstance(value, (int, float, bool)):
        return str(value).strip()
    if isinstance(value, list):
        lines = [
            _coerce_memory_text(item, _depth=_depth + 1)
            for item in value
        ]
        return "\n".join(line for line in lines if line).strip()
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
                return f"{rendered[:12000]}..."
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
    profiles_dir = Path(data_dir) / "memory" / "long_term_profiles"
    if not profiles_dir.exists():
        return {
            "profiles": [],
            "profile_count": 0,
            "profile_total_bytes": 0,
        }

    profiles: List[Dict[str, object]] = []
    total_bytes = 0
    for path in sorted(profiles_dir.glob("*.json")):
        try:
            raw = path.read_text(encoding="utf-8")
            total_bytes += len(raw.encode("utf-8"))
            document = json.loads(raw)
        except Exception:
            continue
        profiles.append(
            {
                "storage_key": path.stem,
                "document": document,
                "preview": _profile_preview(document),
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
    import numpy as np

    arr = np.asarray(coords_2d, dtype=np.float64)
    n = len(arr)
    if n <= 1:
        return [0] * n
    k = max(2, min(6, round(n ** 0.5)))
    k = min(k, n)
    if k == 1:
        return [0] * n

    rng = np.random.default_rng(42)
    centroid_indices: List[int] = [int(rng.integers(0, n))]
    for _ in range(k - 1):
        c = arr[centroid_indices]
        diff = arr[:, None, :] - c[None]
        min_sq_d = np.min(np.sum(diff ** 2, axis=2), axis=1)
        total = float(min_sq_d.sum())
        if total <= 0.0:
            break
        probs = min_sq_d / total
        centroid_indices.append(int(rng.choice(n, p=probs)))

    centroids = arr[centroid_indices].copy()
    labels = np.zeros(n, dtype=int)
    for _ in range(150):
        diff = arr[:, None, :] - centroids[None]
        new_labels = np.sum(diff ** 2, axis=2).argmin(axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for index in range(len(centroids)):
            mask = labels == index
            if mask.any():
                centroids[index] = arr[mask].mean(axis=0)

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


def _compute_projection_points(vector_points: List[Any], coords: Any) -> List[Dict[str, object]]:
    root = _root()
    coords_shape = getattr(coords, "shape", ())
    point_count = min(
        len(vector_points),
        int(coords_shape[0]) if len(coords_shape) >= 1 else 0,
    )
    if point_count <= 0:
        return []

    try:
        cluster_labels = _normalize_cluster_labels(
            root._kmeans_2d_numpy(coords[:point_count, :2]),
            point_count,
        )
    except Exception:
        cluster_labels = [0] * point_count

    points: List[Dict[str, object]] = []
    for index, point in enumerate(vector_points[:point_count]):
        payload = point.payload if isinstance(point.payload, dict) else {}
        full_text = _extract_projection_text(payload)
        label = ""
        for line in full_text.splitlines():
            stripped = line.strip()
            if stripped:
                for prefix in ("user:", "assistant:", "user :", "assistant :"):
                    if stripped.lower().startswith(prefix):
                        stripped = stripped[len(prefix):].strip()
                        break
                label = stripped[:52] + ("..." if len(stripped) > 52 else "")
                break

        content = full_text[:300] + ("..." if len(full_text) > 300 else "")
        pc_vals = [
            float(coords[index, j]) if len(coords_shape) >= 2 and j < coords_shape[1] else 0.0
            for j in range(5)
        ]
        points.append(
            {
                "id": str(point.id),
                "x": pc_vals[0],
                "y": pc_vals[1],
                "pc1": pc_vals[0],
                "pc2": pc_vals[1],
                "pc3": pc_vals[2],
                "pc4": pc_vals[3],
                "pc5": pc_vals[4],
                "group": f"Cluster {cluster_labels[index] + 1}",
                "text": full_text,
                "label": label,
                "content": content,
                "turn_start_index": payload.get("turn_start_index"),
                "turn_end_index": payload.get("turn_end_index"),
            }
        )

    return points


def _project_vectors(vector_rows: List[List[float]]):
    import numpy as np

    if not vector_rows:
        return None, None

    vectors = np.array(vector_rows, dtype=np.float64)
    try:
        centered = vectors - vectors.mean(axis=0)
        _, singular_values, vt = np.linalg.svd(centered, full_matrices=False)
    except Exception:
        return None, None

    num_components = min(5, len(singular_values))
    coords = centered @ vt[:num_components].T
    total_variance = float((singular_values ** 2).sum())
    variance = (
        [
            float(singular_values[i] ** 2 / total_variance)
            if i < len(singular_values)
            else 0.0
            for i in range(5)
        ]
        if total_variance > 0
        else [0.0] * 5
    )
    return coords, variance


def _build_vector_payload(scroll_result: List[Any]) -> Dict[str, object]:
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
        return _empty_projection_payload()

    coords, variance = _project_vectors(vector_rows)
    if coords is None or variance is None:
        return _empty_projection_payload()

    points = _compute_projection_points(vector_points, coords)
    if not points:
        return _empty_projection_payload()

    return {"points": points, "variance": variance}


@api_blueprint.get("/memory/projection")
def memory_projection() -> Response:
    root = _root()
    session_id = request.args.get("session_id", "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        import memory_factory

        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        if not data_dir:
            return jsonify({"error": "UNCHAIN_DATA_DIR not configured"}), 503

        load_session_state = getattr(memory_factory, "_load_session_state", None)
        if callable(load_session_state):
            state = load_session_state(data_dir, session_id)
        else:
            state = {}

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

        tag = str(state.get("vector_collection_tag") or "").strip()
        collection_name = session_collection_name(
            session_id=session_id,
            collection_prefix=vector_collection_prefix(tag),
        )
        client = memory_factory._get_or_create_qdrant_client(data_dir)
        scroll_result = _scroll_projection_points(client, collection_name)
        if not scroll_result:
            return jsonify(_empty_projection_payload())
        return jsonify(_build_vector_payload(scroll_result))
    except Exception as exc:
        if _is_projection_collection_missing_error(exc):
            return jsonify(_empty_projection_payload())
        return jsonify({"error": str(exc)}), 500


@api_blueprint.get("/memory/long-term/projection")
def long_term_memory_projection() -> Response:
    root = _root()
    if not root._is_authorized():
        return root._json_error("unauthorized", "Unauthorized", 401)

    try:
        import memory_factory

        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        if not data_dir:
            return jsonify({"error": "UNCHAIN_DATA_DIR not configured"}), 503

        client = memory_factory._get_or_create_qdrant_client(data_dir)
        profile_payload = _load_long_term_profiles_payload(data_dir)
        all_collections = getattr(client.get_collections(), "collections", [])
        long_term_names = [
            collection.name
            for collection in all_collections
            if isinstance(getattr(collection, "name", None), str)
            and collection.name.startswith("long_term")
        ]

        if not long_term_names:
            payload = _empty_projection_payload()
            payload.update(profile_payload)
            return jsonify(payload)

        all_scroll: List[Any] = []
        for collection_name in long_term_names:
            all_scroll.extend(_scroll_projection_points(client, collection_name))

        payload = _build_vector_payload(all_scroll)
        payload.update(profile_payload)
        return jsonify(payload)
    except Exception as exc:
        if _is_projection_collection_missing_error(exc):
            payload = _empty_projection_payload()
            payload.update(_load_long_term_profiles_payload(""))
            return jsonify(payload)
        return jsonify({"error": str(exc)}), 500
