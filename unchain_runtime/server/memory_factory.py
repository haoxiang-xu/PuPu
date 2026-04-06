"""Factory for MemoryManager with Qdrant vector storage.

Embedding provider resolution order:
  1. Explicit memory_embedding_provider in options ("openai" | "ollama")
  2. Current chat model's provider, if it supports embeddings
  3. OpenAI fallback if api key is present
  4. Ollama fallback if server is reachable
  5. None â€” memory is skipped for this request
"""
from __future__ import annotations

import copy
import hashlib
import inspect
import importlib.util
import json
import os
import re
import sys
import threading
import uuid
from types import MethodType, SimpleNamespace
from typing import Any, Callable

_QDRANT_AVAILABLE = importlib.util.find_spec("qdrant_client") is not None

# Default embedding models and vector size hints
_EMBEDDING_DEFAULTS: dict[str, tuple[str, int]] = {
    "openai": ("text-embedding-3-small", 0),  # resolved dynamically from model config
    "ollama": ("nomic-embed-text", 768),
}

# Providers that have no embedding API
_NO_EMBED_PROVIDERS = {"anthropic"}

# Module-level singletons â€” one Qdrant client reused across all requests
_qdrant_clients: dict[str, "QdrantClient"] = {}
_qdrant_clients_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _data_dir() -> str:
    return os.environ.get("UNCHAIN_DATA_DIR", "").strip()


def _normalize_data_dir(data_dir: str) -> str:
    if not isinstance(data_dir, str):
        return ""
    cleaned = data_dir.strip()
    if not cleaned:
        return ""
    return os.path.realpath(os.path.abspath(cleaned))


def _qdrant_path(data_dir: str) -> str:
    from pathlib import Path
    p = Path(data_dir) / "memory" / "qdrant"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _sessions_dir(data_dir: str) -> str:
    from pathlib import Path
    p = Path(data_dir) / "memory" / "sessions"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _long_term_profiles_dir(data_dir: str) -> str:
    from pathlib import Path
    p = Path(data_dir) / "memory" / "long_term_profiles"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _characters_dir(data_dir: str) -> str:
    from pathlib import Path
    p = Path(data_dir) / "characters"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _character_avatars_dir(data_dir: str) -> str:
    from pathlib import Path
    p = Path(_characters_dir(data_dir)) / "avatars"
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


def _character_registry_path(data_dir: str) -> str:
    return os.path.join(_characters_dir(data_dir), "registry.json")


def _qdrant_meta_path(data_dir: str) -> str:
    return os.path.join(_qdrant_path(data_dir), "meta.json")


def _session_store_path(data_dir: str, session_id: str) -> str:
    from unchain.memory.qdrant import JsonFileSessionStore

    store = JsonFileSessionStore(base_dir=_sessions_dir(data_dir))
    path_getter = getattr(store, "_path", None)
    if not callable(path_getter):
        raise RuntimeError("JsonFileSessionStore path helper is unavailable")
    return str(path_getter(str(session_id or "")))


def _long_term_profile_path(data_dir: str, namespace: str) -> str:
    from unchain.memory.manager import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(base_dir=_long_term_profiles_dir(data_dir))
    path_getter = getattr(store, "_path", None)
    if not callable(path_getter):
        raise RuntimeError("JsonFileLongTermProfileStore path helper is unavailable")
    return str(path_getter(str(namespace or "")))


def _load_session_state(data_dir: str, session_id: str) -> dict[str, Any]:
    from unchain.memory.qdrant import JsonFileSessionStore

    store = JsonFileSessionStore(base_dir=_sessions_dir(data_dir))
    try:
        state = store.load(str(session_id or ""))
    except Exception:
        state = {}
    return state if isinstance(state, dict) else {}


def _load_long_term_profile(data_dir: str, namespace: str) -> dict[str, Any]:
    from unchain.memory.manager import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(base_dir=_long_term_profiles_dir(data_dir))
    try:
        profile = store.load(str(namespace or ""))
    except Exception:
        profile = {}
    return profile if isinstance(profile, dict) else {}


def _safe_long_term_namespace(namespace: str) -> str:
    return "".join(
        c if c.isalnum() or c == "_" else "_"
        for c in str(namespace or "")
    )


def _list_long_term_collection_names_for_namespace(
    client: Any,
    namespace: str,
) -> list[str]:
    safe_namespace = _safe_long_term_namespace(namespace)
    if not safe_namespace:
        return []

    pattern = re.compile(
        rf"^long_term(?:_[a-f0-9]{{12}})?_{re.escape(safe_namespace)}$"
    )
    try:
        collections = getattr(client.get_collections(), "collections", [])
    except Exception:
        collections = []

    matches: list[str] = []
    for item in collections:
        name = getattr(item, "name", "")
        if isinstance(name, str) and pattern.fullmatch(name):
            matches.append(name)
    return matches


def _atomic_write_json(path: str, payload: Any) -> None:
    directory = os.path.dirname(path)
    temp_path = os.path.join(directory, f".{os.path.basename(path)}.{uuid.uuid4().hex}.tmp")
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)


def _repair_qdrant_local_meta(data_dir: str) -> bool:
    meta_path = _qdrant_meta_path(data_dir)
    if not os.path.exists(meta_path):
        return False

    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Invalid Qdrant meta.json at {meta_path}: {exc.msg}",
        ) from exc

    if not isinstance(meta, dict):
        raise RuntimeError(f"Invalid Qdrant meta.json at {meta_path}: expected object")

    collections = meta.get("collections")
    if not isinstance(collections, dict) or not collections:
        return False

    from qdrant_client.http.models import CreateCollection

    field_map = getattr(CreateCollection, "model_fields", None) or getattr(
        CreateCollection,
        "__fields__",
        None,
    )
    allowed_fields = set(field_map.keys()) if isinstance(field_map, dict) else set()
    if not allowed_fields:
        return False

    changed = False
    for collection_name, config in list(collections.items()):
        if not isinstance(config, dict):
            continue
        sanitized_config = {
            key: value for key, value in config.items() if key in allowed_fields
        }
        if sanitized_config != config:
            collections[collection_name] = sanitized_config
            changed = True

    if not changed:
        return False

    # Strip unsupported persisted config keys before the embedded client reloads
    # the local collection metadata.
    _atomic_write_json(meta_path, meta)
    return True


def _get_or_create_qdrant_client(data_dir: str) -> "QdrantClient":
    normalized_data_dir = _normalize_data_dir(data_dir)
    if normalized_data_dir in _qdrant_clients:
        return _qdrant_clients[normalized_data_dir]

    with _qdrant_clients_lock:
        existing_client = _qdrant_clients.get(normalized_data_dir)
        if existing_client is not None:
            return existing_client

        from qdrant_client import QdrantClient

        _repair_qdrant_local_meta(normalized_data_dir)
        created_client = QdrantClient(path=_qdrant_path(normalized_data_dir))
        _qdrant_clients[normalized_data_dir] = created_client
        return created_client


def _provider_from_model_id(model_id: str) -> str:
    if not isinstance(model_id, str) or ":" not in model_id:
        return ""
    return model_id.split(":", 1)[0].strip().lower()


def _normalize_embedding_model_name(raw_model: object, provider: str) -> str:
    model = str(raw_model or "").strip()
    if model:
        return model
    return _EMBEDDING_DEFAULTS.get(provider, ("", 0))[0]


def _api_key_from_options(options: dict[str, Any]) -> str:
    # Only read OpenAI-specific keys. Generic apiKey/api_key may belong to a
    # different provider (for example anthropic) and should not be reused for
    # embedding requests.
    for key in ("openaiApiKey", "openai_api_key"):
        val = options.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _ollama_base_url(options: dict[str, Any]) -> str:
    val = options.get("ollama_base_url")
    if isinstance(val, str) and val.strip():
        return val.strip().rstrip("/")
    return os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")


def _ollama_reachable(base_url: str) -> bool:
    try:
        import httpx
        resp = httpx.get(f"{base_url}/api/tags", timeout=2.0)
        return resp.status_code == 200
    except Exception:
        return False


def _vector_embedding_signature(config: dict[str, Any], vector_size: int) -> str:
    provider = str(config.get("provider", "") or "").strip().lower()
    model = str(config.get("model", "") or "").strip()
    return f"{provider}:{model}:{int(vector_size)}"


def _vector_collection_prefix(tag: str) -> str:
    clean_tag = "".join(c if c.isalnum() or c == "_" else "_" for c in str(tag or "").strip())
    return f"chat_{clean_tag}" if clean_tag else "chat"


def _long_term_collection_prefix(embedding_signature: str) -> str:
    normalized = str(embedding_signature or "").strip()
    if not normalized:
        return "long_term"
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
    return f"long_term_{digest}"


def _session_collection_name(*, session_id: str, collection_prefix: str) -> str:
    safe = "".join(c if c.isalnum() or c == "_" else "_" for c in str(session_id or ""))
    return f"{collection_prefix}_{safe}"


def _delete_collection_best_effort(client: Any, collection_name: str) -> None:
    delete_collection = getattr(client, "delete_collection", None)
    if not callable(delete_collection) or not collection_name:
        return

    try:
        delete_collection(collection_name=collection_name)
    except TypeError:
        try:
            delete_collection(collection_name)
        except Exception:
            return
    except Exception:
        return


def _delete_collection_best_effort_with_warning(
    client: Any,
    collection_name: str,
) -> str:
    delete_collection = getattr(client, "delete_collection", None)
    if not callable(delete_collection) or not collection_name:
        return ""

    try:
        delete_collection(collection_name=collection_name)
        return ""
    except TypeError:
        try:
            delete_collection(collection_name)
            return ""
        except Exception as exc:
            return str(exc)
    except Exception as exc:
        return str(exc)


def _fresh_vector_collection_tag() -> str:
    return uuid.uuid4().hex[:12]


def _prepare_vector_collection_tag(
    *,
    store: Any,
    client: Any,
    session_id: str,
    embedding_signature: str,
) -> str:
    if not session_id:
        return ""

    try:
        state = store.load(session_id)
    except Exception:
        state = {}
    if not isinstance(state, dict):
        state = {}

    previous_signature = str(state.get("vector_embedding_signature", "") or "").strip()
    previous_tag = str(state.get("vector_collection_tag", "") or "").strip()
    if previous_signature == embedding_signature and previous_tag:
        return previous_tag

    new_tag = uuid.uuid4().hex[:12]
    state["vector_embedding_signature"] = embedding_signature
    state["vector_collection_tag"] = new_tag

    if previous_signature and previous_signature != embedding_signature:
        existing_messages = _deepcopy_messages(state.get("messages"))
        state["vector_indexed_until"] = len(existing_messages)
        if previous_tag:
            old_collection = _session_collection_name(
                session_id=session_id,
                collection_prefix=_vector_collection_prefix(previous_tag),
            )
            _delete_collection_best_effort(client, old_collection)

    try:
        store.save(session_id, state)
    except Exception:
        pass

    return new_tag


# ---------------------------------------------------------------------------
# Public: embedding config resolution
# ---------------------------------------------------------------------------

def resolve_embedding_config(options: dict[str, Any]) -> dict[str, Any] | None:
    """Return an embedding config dict, or None if no provider is available.

    Config keys:
        provider    "openai" | "ollama"
        model       embedding model name
        vector_size int
        api_key     (openai only)
        base_url    (ollama only)
    """
    # 1. Explicit setting from the Memory settings page
    explicit = str(options.get("memory_embedding_provider", "") or "").strip().lower()
    if explicit and explicit != "auto":
        if explicit == "openai":
            api_key = _api_key_from_options(options)
            model = _normalize_embedding_model_name(
                options.get("memory_embedding_model"),
                "openai",
            )
            return {
                "provider": "openai",
                "model": model,
                "api_key": api_key,
            }
        if explicit == "ollama":
            base_url = _ollama_base_url(options)
            model = _normalize_embedding_model_name(
                options.get("memory_embedding_model"),
                "ollama",
            )
            return {
                "provider": "ollama",
                "model": model,
                "vector_size": _EMBEDDING_DEFAULTS["ollama"][1],
                "base_url": base_url,
            }
        return None  # unknown explicit provider

    # 2. Auto-detect from the chat model's provider
    model_id = str(options.get("modelId") or options.get("model_id") or "")
    current_provider = _provider_from_model_id(model_id)

    if current_provider and current_provider not in _NO_EMBED_PROVIDERS:
        if current_provider == "openai":
            api_key = _api_key_from_options(options)
            if api_key:
                model = _normalize_embedding_model_name(
                    options.get("memory_embedding_model"),
                    "openai",
                )
                return {
                    "provider": "openai",
                    "model": model,
                    "api_key": api_key,
                }
        if current_provider == "ollama":
            base_url = _ollama_base_url(options)
            return {
                "provider": "ollama",
                "model": _EMBEDDING_DEFAULTS["ollama"][0],
                "vector_size": _EMBEDDING_DEFAULTS["ollama"][1],
                "base_url": base_url,
            }

    # 3. Fallback: OpenAI if api key is present
    api_key = _api_key_from_options(options)
    if api_key:
        model = _normalize_embedding_model_name(
            options.get("memory_embedding_model"),
            "openai",
        )
        return {
            "provider": "openai",
            "model": model,
            "api_key": api_key,
        }

    # 4. Fallback: Ollama if reachable
    base_url = _ollama_base_url(options)
    if _ollama_reachable(base_url):
        return {
            "provider": "ollama",
            "model": _EMBEDDING_DEFAULTS["ollama"][0],
            "vector_size": _EMBEDDING_DEFAULTS["ollama"][1],
            "base_url": base_url,
        }

    return None


def _build_embed_runtime(config: dict[str, Any]) -> tuple[Callable[[list[str]], list[list[float]]], int]:
    provider = config["provider"]

    if provider == "openai":
        from unchain.memory.qdrant import build_openai_embed_fn

        broth_instance = SimpleNamespace(api_key=str(config.get("api_key", "") or "").strip())
        return build_openai_embed_fn(
            model=str(config.get("model", "") or "").strip(),
            broth_instance=broth_instance,
        )

    if provider == "ollama":
        import httpx
        base_url = config["base_url"]
        model = config["model"]

        def ollama_embed(texts: list[str]) -> list[list[float]]:
            vecs: list[list[float]] = []
            for text in texts:
                resp = httpx.post(
                    f"{base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                    timeout=30.0,
                )
                resp.raise_for_status()
                vecs.append(resp.json()["embedding"])
            return vecs

        vector_size = int(config.get("vector_size") or _EMBEDDING_DEFAULTS["ollama"][1])
        return ollama_embed, vector_size

    raise ValueError(f"Unsupported embedding provider: {provider}")


def _deepcopy_messages(messages: object) -> list[dict[str, Any]]:
    if not isinstance(messages, list):
        return []
    return [copy.deepcopy(item) for item in messages if isinstance(item, dict)]


_DIALOG_ROLES = {"system", "user", "assistant"}
_TOOL_BLOCK_TYPES = {
    "tool_use",
    "tool_result",
    "tool_call",
    "tool_args",
    "function_call",
    "function_call_output",
}


def _sanitize_dialog_content(content: object) -> object | None:
    if isinstance(content, str):
        return content if content.strip() else None

    if isinstance(content, list):
        sanitized_blocks: list[dict[str, Any]] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("type", "")).strip().lower()
            if block_type in _TOOL_BLOCK_TYPES:
                continue
            if block_type in {"text", "input_text", "output_text"}:
                text = block.get("text")
                if isinstance(text, str) and text.strip():
                    sanitized_blocks.append(copy.deepcopy(block))
                continue
            sanitized_blocks.append(copy.deepcopy(block))

        return sanitized_blocks if sanitized_blocks else None

    if isinstance(content, dict):
        block_type = str(content.get("type", "")).strip().lower()
        if block_type in _TOOL_BLOCK_TYPES:
            return None
        return copy.deepcopy(content)

    return None


def _normalize_dialog_role(role: object) -> str:
    if not isinstance(role, str):
        return ""
    normalized = role.strip().lower()
    return normalized if normalized in _DIALOG_ROLES else ""


def _collapse_consecutive_assistant_messages(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    collapsed: list[dict[str, Any]] = []

    for message in messages:
        if (
            message.get("role") == "assistant"
            and collapsed
            and collapsed[-1].get("role") == "assistant"
        ):
            collapsed[-1] = message
            continue
        collapsed.append(message)

    return collapsed


def _merge_system_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    system_messages = [message for message in messages if message.get("role") == "system"]
    if len(system_messages) <= 1:
        return messages

    if not all(isinstance(message.get("content"), str) for message in system_messages):
        return messages

    merged_content_parts = [
        str(message.get("content", "")).strip()
        for message in system_messages
        if str(message.get("content", "")).strip()
    ]
    if not merged_content_parts:
        return [message for message in messages if message.get("role") != "system"]

    merged_system_message = {
        "role": "system",
        "content": "\n\n".join(merged_content_parts),
    }
    non_system_messages = [
        message for message in messages if message.get("role") != "system"
    ]
    return [merged_system_message, *non_system_messages]


def _sanitize_dialog_messages(messages: object) -> list[dict[str, Any]]:
    sanitized_messages: list[dict[str, Any]] = []

    for message in _deepcopy_messages(messages):
        role = _normalize_dialog_role(message.get("role"))
        if not role:
            continue

        sanitized_content = _sanitize_dialog_content(message.get("content"))
        if sanitized_content is None:
            continue

        next_message = copy.deepcopy(message)
        next_message["role"] = role
        next_message["content"] = sanitized_content
        sanitized_messages.append(next_message)

    collapsed = _collapse_consecutive_assistant_messages(sanitized_messages)
    return _merge_system_messages(collapsed)


def _split_system_and_non_system(
    messages: object,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    systems: list[dict[str, Any]] = []
    non_system: list[dict[str, Any]] = []
    for message in _deepcopy_messages(messages):
        if message.get("role") == "system":
            systems.append(message)
        else:
            non_system.append(message)
    return systems, non_system


def _max_suffix_prefix_overlap(
    earlier: list[dict[str, Any]],
    later: list[dict[str, Any]],
) -> int:
    max_overlap = min(len(earlier), len(later))
    for overlap in range(max_overlap, 0, -1):
        if earlier[-overlap:] == later[:overlap]:
            return overlap
    return 0


def _merge_messages_with_overlap(
    existing_messages: object,
    latest_messages: object,
) -> list[dict[str, Any]]:
    sanitized_existing = _sanitize_dialog_messages(existing_messages)
    sanitized_latest = _sanitize_dialog_messages(latest_messages)

    latest_systems, latest_non_system = _split_system_and_non_system(sanitized_latest)
    if not latest_systems and sanitized_existing:
        existing_systems, _ = _split_system_and_non_system(sanitized_existing)
        latest_systems = existing_systems

    _, existing_non_system = _split_system_and_non_system(sanitized_existing)
    if not existing_non_system:
        return latest_systems + latest_non_system
    if not latest_non_system:
        return latest_systems + existing_non_system

    overlap = _max_suffix_prefix_overlap(existing_non_system, latest_non_system)
    merged_non_system = existing_non_system + latest_non_system[overlap:]
    return latest_systems + merged_non_system


def _content_to_text_for_log(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("type", "")).strip().lower()
            if block_type in {"text", "input_text", "output_text"}:
                text = block.get("text")
                if isinstance(text, str) and text.strip():
                    text_parts.append(text.strip())
                continue
            if block_type in {"image", "input_image"}:
                text_parts.append("[image]")
                continue
            if block_type in {"pdf", "document", "input_file"}:
                text_parts.append("[pdf]")
                continue
        return " ".join(part for part in text_parts if part).strip()
    return ""


def _latest_user_query_for_log(messages: object) -> str:
    if not isinstance(messages, list):
        return ""
    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        if message.get("role") != "user":
            continue
        text = _content_to_text_for_log(message.get("content")).strip()
        if text:
            return text
    return ""


def _extract_recall_items(messages: object) -> list[str]:
    if not isinstance(messages, list):
        return []
    for message in messages:
        if not isinstance(message, dict):
            continue
        if message.get("role") != "system":
            continue
        content = message.get("content")
        if not isinstance(content, str):
            continue
        if not content.startswith("[MEMORY RECALL]"):
            continue

        recalled: list[str] = []
        for line in content.splitlines()[1:]:
            stripped = line.strip()
            if not stripped.startswith("- "):
                continue
            item = stripped[2:].strip()
            if item:
                recalled.append(item)
        return recalled
    return []


def _clip_for_log(text: str, limit: int = 160) -> str:
    raw = text.strip()
    if len(raw) <= limit:
        return raw
    return f"{raw[:limit - 3]}..."


def _safe_console_print(message: str) -> None:
    try:
        print(message, flush=True)
        return
    except UnicodeEncodeError:
        pass
    except Exception:
        return

    stream = getattr(sys, "stdout", None)
    if stream is None:
        return

    encoding = getattr(stream, "encoding", None) or "utf-8"
    try:
        safe_message = message.encode(
            encoding,
            errors="backslashreplace",
        ).decode(encoding, errors="replace")
    except Exception:
        safe_message = message.encode(
            "ascii",
            errors="backslashreplace",
        ).decode("ascii")

    try:
        stream.write(f"{safe_message}\n")
        stream.flush()
    except Exception:
        pass


def _log_memory_recall_debug(
    *,
    session_id: str,
    vector_top_k: int,
    vector_min_score: float | None,
    vector_recall_status: str,
    vector_recall_count: int,
    vector_fallback_reason: str,
    query_text: str,
    recalled_items: list[str],
) -> None:
    try:
        safe_query = _clip_for_log(query_text, 120) if query_text else ""
        safe_recalled = [_clip_for_log(item, 120) for item in recalled_items[:5]]
        _safe_console_print(
            "[unchain:memory] recall "
            f"session_id={session_id!r} "
            f"top_k={vector_top_k} "
            f"min_score={vector_min_score!r} "
            f"status={vector_recall_status!r} "
            f"count={vector_recall_count} "
            f"query={safe_query!r} "
            f"results={safe_recalled!r} "
            f"fallback_reason={vector_fallback_reason!r}",
        )
    except Exception:
        # Diagnostics should never interfere with memory preparation.
        return


def _extract_qdrant_hits(results: object) -> list[object]:
    if isinstance(results, list):
        return list(results)
    if isinstance(results, dict):
        points = results.get("points")
        if isinstance(points, list):
            return list(points)
        result = results.get("result")
        if isinstance(result, list):
            return list(result)
        if isinstance(result, dict):
            nested_points = result.get("points")
            if isinstance(nested_points, list):
                return list(nested_points)
    points_attr = getattr(results, "points", None)
    if isinstance(points_attr, list):
        return list(points_attr)
    result_attr = getattr(results, "result", None)
    if isinstance(result_attr, list):
        return list(result_attr)
    if isinstance(result_attr, dict):
        nested_points = result_attr.get("points")
        if isinstance(nested_points, list):
            return list(nested_points)
    return []


def _extract_qdrant_payload(hit: object) -> dict[str, Any]:
    if isinstance(hit, dict):
        payload = hit.get("payload")
        return payload if isinstance(payload, dict) else {}
    payload = getattr(hit, "payload", None)
    return payload if isinstance(payload, dict) else {}


def _extract_qdrant_score(hit: object) -> float | None:
    score = hit.get("score") if isinstance(hit, dict) else getattr(hit, "score", None)
    if isinstance(score, (int, float)):
        return float(score)
    return None


def _normalize_optional_threshold(value: object) -> float | None:
    try:
        numeric = float(value)
    except Exception:
        return None
    if numeric <= 0:
        return None
    if numeric > 1:
        numeric = 1.0
    if numeric < 0:
        numeric = 0.0
    return round(numeric, 4)


def _filter_supported_constructor_kwargs(cls: Any, values: dict[str, Any]) -> dict[str, Any]:
    try:
        parameters = inspect.signature(cls).parameters
    except Exception:
        return dict(values)

    if any(
        parameter.kind == inspect.Parameter.VAR_KEYWORD
        for parameter in parameters.values()
    ):
        return dict(values)

    allowed_keys = set(parameters.keys())
    return {
        key: value
        for key, value in values.items()
        if key in allowed_keys
    }


def _patch_qdrant_similarity_search_compat(vector_adapter: Any) -> Any:
    similarity_search = getattr(vector_adapter, "similarity_search", None)
    if not callable(similarity_search):
        return vector_adapter
    if getattr(vector_adapter, "_pupu_qdrant_search_compat_patch", False):
        return vector_adapter

    client = getattr(vector_adapter, "_client", None)
    if client is None:
        return vector_adapter

    has_search = callable(getattr(client, "search", None))
    has_query_points = callable(getattr(client, "query_points", None))
    has_query = callable(getattr(client, "query", None))
    if has_search or (not has_query_points and not has_query):
        return vector_adapter

    def _patched_similarity_search(
        self,
        *,
        session_id: str,
        query: str,
        k: int,
        min_score: float | None = None,
    ) -> list[dict[str, Any]]:
        collection = self._collection_name(session_id)
        self._ensure_collection(collection)
        query_vec = self._embed_fn([query])[0]

        query_points_fn = getattr(self._client, "query_points", None)
        query_fn = getattr(self._client, "query", None)
        search_results: object

        if callable(query_points_fn):
            try:
                search_results = query_points_fn(
                    collection_name=collection,
                    query=query_vec,
                    limit=k,
                    with_payload=True,
                )
            except TypeError:
                search_results = query_points_fn(
                    collection_name=collection,
                    query_vector=query_vec,
                    limit=k,
                    with_payload=True,
                )
        elif callable(query_fn):
            try:
                search_results = query_fn(
                    collection_name=collection,
                    query=query_vec,
                    limit=k,
                    with_payload=True,
                )
            except TypeError:
                search_results = query_fn(
                    collection_name=collection,
                    query_vector=query_vec,
                    limit=k,
                    with_payload=True,
                )
        else:  # pragma: no cover - guarded above
            raise AttributeError(
                "Qdrant client has neither search nor query_points/query methods"
            )

        hits = _extract_qdrant_hits(search_results)
        recalled: list[dict[str, Any]] = []
        for hit in hits:
            payload = _extract_qdrant_payload(hit)
            score = _extract_qdrant_score(hit)
            if min_score is not None:
                if score is None or score < float(min_score):
                    continue

            item: dict[str, Any] = {}
            messages = payload.get("messages")
            if isinstance(messages, list):
                item["messages"] = copy.deepcopy(messages)
            text = payload.get("text")
            if isinstance(text, str) and text.strip():
                item["text"] = text
            role = payload.get("role")
            if isinstance(role, str) and role.strip():
                item["role"] = role.strip().lower()
            index = payload.get("index")
            if isinstance(index, int):
                item["index"] = index
            if score is not None:
                item["score"] = score
            if item:
                recalled.append(item)
        return recalled

    setattr(
        vector_adapter,
        "similarity_search",
        MethodType(_patched_similarity_search, vector_adapter),
    )
    setattr(vector_adapter, "_pupu_qdrant_search_compat_patch", True)
    return vector_adapter


def _patch_memory_commit_with_overlap(manager: Any) -> Any:
    commit_method = getattr(manager, "commit_messages", None)
    if not callable(commit_method):
        return manager
    if getattr(manager, "_pupu_commit_overlap_patch", False):
        return manager

    original_commit = commit_method
    try:
        commit_params = inspect.signature(original_commit).parameters
    except Exception:
        commit_params = {}

    def _patched_commit_messages(
        self,
        session_id: str,
        full_conversation: list[dict[str, Any]],
        *,
        memory_namespace: str | None = None,
        model: str | None = None,
        long_term_extractor: Callable[..., Any] | None = None,
    ) -> None:
        existing_state = self.store.load(session_id) if session_id else {}
        existing_messages = (
            existing_state.get("messages", [])
            if isinstance(existing_state, dict)
            else []
        )
        merged_conversation = _merge_messages_with_overlap(
            existing_messages,
            full_conversation,
        )
        commit_kwargs = {
            "session_id": session_id,
            "full_conversation": merged_conversation,
        }
        if "memory_namespace" in commit_params:
            commit_kwargs["memory_namespace"] = memory_namespace
        if "model" in commit_params:
            commit_kwargs["model"] = model
        if "long_term_extractor" in commit_params:
            commit_kwargs["long_term_extractor"] = long_term_extractor
        return original_commit(**commit_kwargs)

    setattr(manager, "commit_messages", MethodType(_patched_commit_messages, manager))
    setattr(manager, "_pupu_commit_overlap_patch", True)
    return manager


def _patch_memory_prepare_with_diagnostics(manager: Any) -> Any:
    prepare_method = getattr(manager, "prepare_messages", None)
    if not callable(prepare_method):
        return manager
    if getattr(manager, "_pupu_prepare_diagnostics_patch", False):
        return manager

    original_prepare = prepare_method
    try:
        prepare_params = inspect.signature(original_prepare).parameters
    except Exception:
        prepare_params = {}

    def _patched_prepare_messages(
        self,
        session_id: str,
        incoming: list[dict[str, Any]],
        *,
        max_context_window_tokens: int,
        model: str,
        summary_generator: Callable[..., str] | None = None,
        memory_namespace: str | None = None,
        provider: str | None = None,
        tool_resolver: Callable[..., Any] | None = None,
        supports_tools: bool | None = None,
    ) -> list[dict[str, Any]]:
        clean_incoming = _sanitize_dialog_messages(incoming)

        store = getattr(self, "store", None)
        if (
            session_id
            and store is not None
            and callable(getattr(store, "load", None))
            and callable(getattr(store, "save", None))
        ):
            try:
                state = store.load(session_id)
                if isinstance(state, dict):
                    existing_messages = state.get("messages")
                    clean_existing_messages = _sanitize_dialog_messages(existing_messages)
                    if clean_existing_messages != _deepcopy_messages(existing_messages):
                        next_state = dict(state)
                        next_state["messages"] = clean_existing_messages
                        store.save(session_id, next_state)
            except Exception:
                pass

        prepare_kwargs = {
            "session_id": session_id,
            "incoming": clean_incoming,
            "max_context_window_tokens": max_context_window_tokens,
            "model": model,
        }
        if "summary_generator" in prepare_params:
            prepare_kwargs["summary_generator"] = summary_generator
        if "memory_namespace" in prepare_params:
            prepare_kwargs["memory_namespace"] = memory_namespace
        if "provider" in prepare_params:
            prepare_kwargs["provider"] = provider
        if "tool_resolver" in prepare_params:
            prepare_kwargs["tool_resolver"] = tool_resolver
        if "supports_tools" in prepare_params:
            prepare_kwargs["supports_tools"] = supports_tools

        prepared = original_prepare(**prepare_kwargs)
        prepared = _sanitize_dialog_messages(prepared)

        try:
            raw_info = getattr(self, "_last_prepare_info", {})
            info = dict(raw_info) if isinstance(raw_info, dict) else {}
        except Exception:
            info = {}

        vector_top_k = 0
        vector_min_score = None
        vector_adapter_enabled = False
        try:
            vector_top_k = max(0, int(getattr(self.config, "vector_top_k", 0) or 0))
            vector_min_score = _normalize_optional_threshold(
                getattr(self.config, "vector_min_score", None)
            )
            vector_adapter_enabled = getattr(self.config, "vector_adapter", None) is not None
        except Exception:
            pass

        vector_recall_count_raw = info.get("vector_recall_count")
        if isinstance(vector_recall_count_raw, int):
            vector_recall_count = max(0, vector_recall_count_raw)
        else:
            vector_recall_count = 0

        if vector_recall_count > 0:
            vector_recall_status = "recalled"
        elif not vector_adapter_enabled:
            vector_recall_status = "adapter_disabled"
        elif vector_top_k <= 0:
            vector_recall_status = "top_k_disabled"
        elif isinstance(info.get("vector_fallback_reason"), str) and info.get("vector_fallback_reason"):
            vector_recall_status = "search_failed"
        else:
            vector_recall_status = "no_match"

        vector_fallback_reason = (
            str(info.get("vector_fallback_reason") or "").strip()
            if isinstance(info.get("vector_fallback_reason"), str)
            else ""
        )
        query_text = _latest_user_query_for_log(clean_incoming)
        recalled_items = _extract_recall_items(prepared)
        if recalled_items and vector_recall_count <= 0:
            vector_recall_count = len(recalled_items)

        info["vector_top_k"] = vector_top_k
        info["vector_min_score"] = vector_min_score
        info["vector_adapter_enabled"] = vector_adapter_enabled
        info["vector_recall_count"] = vector_recall_count
        info["vector_recall_status"] = vector_recall_status
        if recalled_items:
            info["vector_recall_preview"] = recalled_items[:5]

        try:
            setattr(self, "_last_prepare_info", info)
        except Exception:
            pass

        _log_memory_recall_debug(
            session_id=session_id,
            vector_top_k=vector_top_k,
            vector_min_score=vector_min_score,
            vector_recall_status=vector_recall_status,
            vector_recall_count=vector_recall_count,
            vector_fallback_reason=vector_fallback_reason,
            query_text=query_text,
            recalled_items=recalled_items,
        )

        return prepared

    setattr(manager, "prepare_messages", MethodType(_patched_prepare_messages, manager))
    setattr(manager, "_pupu_prepare_diagnostics_patch", True)
    return manager


# ---------------------------------------------------------------------------
# Public: MemoryManager factory
# ---------------------------------------------------------------------------

def create_memory_manager_with_diagnostics(
    options: dict[str, Any],
    *,
    session_id: str = "",
):
    """Build a MemoryManager for this request, or return None.

    Returns:
        (manager, reason)

    where manager is None when:
    - qdrant-client is not installed
    - UNCHAIN_DATA_DIR env var is not set
    - memory_enabled is falsy in options
    - no embedding provider can be resolved
    - any import / construction error occurs
    """
    if not _QDRANT_AVAILABLE:
        return None, "qdrant_client_unavailable"

    data_dir = _normalize_data_dir(_data_dir())
    if not data_dir:
        return None, "missing_data_dir"

    if not options.get("memory_enabled"):
        return None, "memory_disabled"

    embed_config = resolve_embedding_config(options)
    if embed_config is None:
        return None, "embedding_provider_unavailable"

    try:
        from unchain.memory import LongTermMemoryConfig, MemoryConfig, MemoryManager
        from unchain.memory.qdrant import (
            JsonFileSessionStore,
            QdrantLongTermVectorAdapter,
            QdrantVectorAdapter,
        )

        qdrant_client = _get_or_create_qdrant_client(data_dir)
        embed_fn, vector_size = _build_embed_runtime(embed_config)
        embedding_signature = _vector_embedding_signature(embed_config, vector_size)

        store = JsonFileSessionStore(base_dir=_sessions_dir(data_dir))
        collection_tag = _prepare_vector_collection_tag(
            store=store,
            client=qdrant_client,
            session_id=session_id,
            embedding_signature=embedding_signature,
        )

        vector_adapter = QdrantVectorAdapter(
            client=qdrant_client,
            embed_fn=embed_fn,
            vector_size=vector_size,
            collection_prefix=_vector_collection_prefix(collection_tag),
        )
        vector_adapter = _patch_qdrant_similarity_search_compat(vector_adapter)
        long_term_enabled = bool(options.get("memory_long_term_enabled"))
        long_term_config = None
        if long_term_enabled:
            long_term_kwargs = _filter_supported_constructor_kwargs(
                LongTermMemoryConfig,
                {
                    "vector_adapter": QdrantLongTermVectorAdapter(
                        client=qdrant_client,
                        embed_fn=embed_fn,
                        vector_size=vector_size,
                        collection_prefix=_long_term_collection_prefix(
                            embedding_signature
                        ),
                    ),
                    "profile_base_dir": _long_term_profiles_dir(data_dir),
                    "vector_top_k": max(
                        0,
                        int(options.get("memory_long_term_vector_top_k") or 4),
                    ),
                    "vector_min_score": _normalize_optional_threshold(
                        options.get("memory_long_term_vector_min_score")
                    ),
                    "episode_top_k": max(
                        0,
                        int(options.get("memory_long_term_episode_top_k") or 2),
                    ),
                    "episode_min_score": _normalize_optional_threshold(
                        options.get("memory_long_term_episode_min_score")
                    ),
                    "playbook_top_k": max(
                        0,
                        int(options.get("memory_long_term_playbook_top_k") or 2),
                    ),
                    "playbook_min_score": _normalize_optional_threshold(
                        options.get("memory_long_term_playbook_min_score")
                    ),
                    "max_fact_items": max(
                        0,
                        int(options.get("memory_long_term_max_fact_items") or 6),
                    ),
                    "max_episode_items": max(
                        0,
                        int(options.get("memory_long_term_max_episode_items") or 3),
                    ),
                    "max_playbook_items": max(
                        0,
                        int(options.get("memory_long_term_max_playbook_items") or 2),
                    ),
                    "extract_every_n_turns": max(
                        1,
                        int(options.get("memory_long_term_extract_every_n_turns") or 6),
                    ),
                    "embedding_model": str(embed_config.get("model", "") or ""),
                },
            )
            long_term_config = LongTermMemoryConfig(**long_term_kwargs)

        last_n = max(1, int(options.get("memory_last_n_turns") or 8))
        top_k = max(0, int(options.get("memory_vector_top_k") or 4))
        short_term_min_score = _normalize_optional_threshold(
            options.get("memory_vector_min_score")
        )

        memory_config_kwargs = _filter_supported_constructor_kwargs(
            MemoryConfig,
            {
                "last_n_turns": last_n,
                "vector_top_k": top_k,
                "vector_min_score": short_term_min_score,
                "vector_adapter": vector_adapter,
                "long_term": long_term_config,
                "deferred_tool_compaction_keep_completed_turns": 0,
            },
        )

        manager = MemoryManager(
            config=MemoryConfig(**memory_config_kwargs),
            store=store,
        )
        manager = _patch_memory_prepare_with_diagnostics(manager)
        manager = _patch_memory_commit_with_overlap(manager)
        return manager, ""
    except Exception as exc:
        return None, f"memory_manager_init_failed: {exc}"


def create_memory_manager(options: dict[str, Any]):
    manager, _reason = create_memory_manager_with_diagnostics(options)
    return manager


def replace_short_term_session_memory(
    *,
    session_id: str,
    messages: object,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        raise ValueError("session_id is required")

    data_dir = _normalize_data_dir(_data_dir())
    if not data_dir:
        raise RuntimeError("UNCHAIN_DATA_DIR not configured")

    from unchain.memory.manager import _collect_complete_turns_for_vector_index
    from unchain.memory.qdrant import JsonFileSessionStore, QdrantVectorAdapter

    store = JsonFileSessionStore(base_dir=_sessions_dir(data_dir))
    raw_options = options if isinstance(options, dict) else {}
    retained_messages = _sanitize_dialog_messages(messages)

    try:
        previous_state = store.load(normalized_session_id)
    except Exception:
        previous_state = {}
    if not isinstance(previous_state, dict):
        previous_state = {}

    old_tag = str(previous_state.get("vector_collection_tag", "") or "").strip()
    old_collection_name = _session_collection_name(
        session_id=normalized_session_id,
        collection_prefix=_vector_collection_prefix(old_tag),
    )

    new_tag = _fresh_vector_collection_tag()
    new_collection_prefix = _vector_collection_prefix(new_tag)
    new_collection_name = _session_collection_name(
        session_id=normalized_session_id,
        collection_prefix=new_collection_prefix,
    )

    vector_applied = False
    vector_indexed_count = 0
    vector_indexed_until = 0
    vector_fallback_reason = ""
    vector_signature = ""
    cleanup_warning = ""
    qdrant_client = None

    if not retained_messages:
        vector_applied = True
    elif not _QDRANT_AVAILABLE:
        vector_fallback_reason = "qdrant_client_unavailable"
    else:
        embed_config = resolve_embedding_config(raw_options)
        if embed_config is None:
            vector_fallback_reason = "embedding_provider_unavailable"
        else:
            try:
                qdrant_client = _get_or_create_qdrant_client(data_dir)
                embed_fn, vector_size = _build_embed_runtime(embed_config)
                vector_signature = _vector_embedding_signature(
                    embed_config,
                    vector_size,
                )
                texts, metadatas, next_indexed_until, _indexed_turn_count = (
                    _collect_complete_turns_for_vector_index(
                        retained_messages,
                        start_index=0,
                    )
                )
                vector_adapter = QdrantVectorAdapter(
                    client=qdrant_client,
                    embed_fn=embed_fn,
                    vector_size=vector_size,
                    collection_prefix=new_collection_prefix,
                )
                if texts:
                    vector_adapter.add_texts(
                        session_id=normalized_session_id,
                        texts=texts,
                        metadatas=metadatas,
                    )
                vector_applied = True
                vector_indexed_count = len(texts)
                vector_indexed_until = next_indexed_until
            except Exception as exc:
                vector_fallback_reason = f"vector_rebuild_failed: {exc}"
                if qdrant_client is not None:
                    _delete_collection_best_effort(qdrant_client, new_collection_name)

    next_state = dict(previous_state)
    next_state["messages"] = retained_messages
    next_state.pop("summary", None)
    next_state["vector_indexed_until"] = vector_indexed_until
    next_state["vector_collection_tag"] = new_tag
    next_state["vector_embedding_signature"] = vector_signature
    store.save(normalized_session_id, next_state)

    if qdrant_client is None and _QDRANT_AVAILABLE:
        try:
            qdrant_client = _get_or_create_qdrant_client(data_dir)
        except Exception:
            qdrant_client = None

    if qdrant_client is not None and old_collection_name != new_collection_name:
        cleanup_warning = _delete_collection_best_effort_with_warning(
            qdrant_client,
            old_collection_name,
        )

    response = {
        "applied": True,
        "session_id": normalized_session_id,
        "stored_message_count": len(retained_messages),
        "vector_applied": vector_applied,
        "vector_indexed_count": vector_indexed_count,
        "vector_indexed_until": vector_indexed_until,
        "vector_fallback_reason": vector_fallback_reason,
    }
    if cleanup_warning:
        response["cleanup_warning"] = cleanup_warning
    return response


def delete_short_term_session_memory(
    *,
    session_id: str,
) -> dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        raise ValueError("session_id is required")

    data_dir = _normalize_data_dir(_data_dir())
    if not data_dir:
        raise RuntimeError("UNCHAIN_DATA_DIR not configured")

    previous_state = _load_session_state(data_dir, normalized_session_id)
    old_tag = str(previous_state.get("vector_collection_tag", "") or "").strip()
    collection_names = {
        _session_collection_name(
            session_id=normalized_session_id,
            collection_prefix=_vector_collection_prefix(old_tag),
        ),
        _session_collection_name(
            session_id=normalized_session_id,
            collection_prefix=_vector_collection_prefix(""),
        ),
    }

    deleted_collections: list[str] = []
    warnings: list[str] = []
    client = None
    if _QDRANT_AVAILABLE:
        try:
            client = _get_or_create_qdrant_client(data_dir)
        except Exception as exc:
            warnings.append(str(exc))
            client = None

    if client is not None:
        for collection_name in sorted(collection_names):
            if not collection_name:
                continue
            warning = _delete_collection_best_effort_with_warning(client, collection_name)
            if warning:
                warnings.append(f"{collection_name}: {warning}")
            else:
                deleted_collections.append(collection_name)

    session_path = _session_store_path(data_dir, normalized_session_id)
    session_deleted = False
    if os.path.exists(session_path):
        try:
            os.remove(session_path)
            session_deleted = True
        except Exception as exc:
            warnings.append(str(exc))

    return {
        "session_id": normalized_session_id,
        "session_deleted": session_deleted,
        "deleted_collections": deleted_collections,
        "warnings": warnings,
    }


def delete_long_term_memory_namespace(
    *,
    namespace: str,
) -> dict[str, Any]:
    normalized_namespace = str(namespace or "").strip()
    if not normalized_namespace:
        raise ValueError("namespace is required")

    data_dir = _normalize_data_dir(_data_dir())
    if not data_dir:
        raise RuntimeError("UNCHAIN_DATA_DIR not configured")

    profile_path = _long_term_profile_path(data_dir, normalized_namespace)
    profile_deleted = False
    warnings: list[str] = []
    if os.path.exists(profile_path):
        try:
            os.remove(profile_path)
            profile_deleted = True
        except Exception as exc:
            warnings.append(str(exc))

    deleted_collections: list[str] = []
    client = None
    if _QDRANT_AVAILABLE:
        try:
            client = _get_or_create_qdrant_client(data_dir)
        except Exception as exc:
            warnings.append(str(exc))
            client = None

    if client is not None:
        for collection_name in _list_long_term_collection_names_for_namespace(
            client,
            normalized_namespace,
        ):
            warning = _delete_collection_best_effort_with_warning(client, collection_name)
            if warning:
                warnings.append(f"{collection_name}: {warning}")
            else:
                deleted_collections.append(collection_name)

    return {
        "namespace": normalized_namespace,
        "profile_deleted": profile_deleted,
        "deleted_collections": deleted_collections,
        "warnings": warnings,
    }


from memory_paths import (  # noqa: E402
    _character_avatars_dir,
    _character_registry_path,
    _characters_dir,
    _data_dir,
    _long_term_profile_path,
    _long_term_profiles_dir,
    _normalize_data_dir,
    _qdrant_meta_path,
    _qdrant_path,
    _session_store_path,
    _sessions_dir,
)
from memory_storage import (  # noqa: E402
    _atomic_write_json,
    _list_long_term_collection_names_for_namespace,
    _load_long_term_profile,
    _load_session_state,
    _safe_long_term_namespace,
)
from memory_qdrant import (  # noqa: E402
    _delete_collection_best_effort,
    _delete_collection_best_effort_with_warning,
    _get_or_create_qdrant_client,
    _repair_qdrant_local_meta,
)
from memory_embeddings import (  # noqa: E402
    _api_key_from_options,
    _build_embed_runtime,
    _fresh_vector_collection_tag,
    _long_term_collection_prefix,
    _normalize_embedding_model_name,
    _ollama_base_url,
    _ollama_reachable,
    _prepare_vector_collection_tag,
    _provider_from_model_id,
    _session_collection_name,
    _vector_collection_prefix,
    _vector_embedding_signature,
    resolve_embedding_config,
)
