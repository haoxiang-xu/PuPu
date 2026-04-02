from __future__ import annotations

import hashlib
import os
from types import SimpleNamespace
from typing import Any, Callable


def _root():
    import memory_factory as root_module

    return root_module


def _provider_from_model_id(model_id: str) -> str:
    if not isinstance(model_id, str) or ":" not in model_id:
        return ""
    return model_id.split(":", 1)[0].strip().lower()


def _normalize_embedding_model_name(raw_model: object, provider: str) -> str:
    root = _root()
    model = str(raw_model or "").strip()
    if model:
        return model
    return root._EMBEDDING_DEFAULTS.get(provider, ("", 0))[0]


def _api_key_from_options(options: dict[str, Any]) -> str:
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
    clean_tag = "".join(
        char if char.isalnum() or char == "_" else "_"
        for char in str(tag or "").strip()
    )
    return f"chat_{clean_tag}" if clean_tag else "chat"


def _long_term_collection_prefix(embedding_signature: str) -> str:
    normalized = str(embedding_signature or "").strip()
    if not normalized:
        return "long_term"
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
    return f"long_term_{digest}"


def _session_collection_name(*, session_id: str, collection_prefix: str) -> str:
    safe = "".join(
        char if char.isalnum() or char == "_" else "_"
        for char in str(session_id or "")
    )
    return f"{collection_prefix}_{safe}"


def _fresh_vector_collection_tag() -> str:
    return _root().uuid.uuid4().hex[:12]


def _prepare_vector_collection_tag(
    *,
    store: Any,
    client: Any,
    session_id: str,
    embedding_signature: str,
) -> str:
    root = _root()
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

    new_tag = root.uuid.uuid4().hex[:12]
    state["vector_embedding_signature"] = embedding_signature
    state["vector_collection_tag"] = new_tag

    if previous_signature and previous_signature != embedding_signature:
        existing_messages = root._deepcopy_messages(state.get("messages"))
        state["vector_indexed_until"] = len(existing_messages)
        if previous_tag:
            old_collection = _session_collection_name(
                session_id=session_id,
                collection_prefix=_vector_collection_prefix(previous_tag),
            )
            root._delete_collection_best_effort(client, old_collection)

    try:
        store.save(session_id, state)
    except Exception:
        pass

    return new_tag


def resolve_embedding_config(options: dict[str, Any]) -> dict[str, Any] | None:
    root = _root()
    explicit = str(options.get("memory_embedding_provider", "") or "").strip().lower()
    if explicit and explicit != "auto":
        if explicit == "openai":
            api_key = _api_key_from_options(options)
            model = _normalize_embedding_model_name(options.get("memory_embedding_model"), "openai")
            return {"provider": "openai", "model": model, "api_key": api_key}
        if explicit == "ollama":
            base_url = _ollama_base_url(options)
            model = _normalize_embedding_model_name(options.get("memory_embedding_model"), "ollama")
            return {
                "provider": "ollama",
                "model": model,
                "vector_size": root._EMBEDDING_DEFAULTS["ollama"][1],
                "base_url": base_url,
            }
        return None

    model_id = str(options.get("modelId") or options.get("model_id") or "")
    current_provider = _provider_from_model_id(model_id)
    if current_provider and current_provider not in root._NO_EMBED_PROVIDERS:
        if current_provider == "openai":
            api_key = _api_key_from_options(options)
            if api_key:
                model = _normalize_embedding_model_name(options.get("memory_embedding_model"), "openai")
                return {"provider": "openai", "model": model, "api_key": api_key}
        if current_provider == "ollama":
            base_url = _ollama_base_url(options)
            return {
                "provider": "ollama",
                "model": root._EMBEDDING_DEFAULTS["ollama"][0],
                "vector_size": root._EMBEDDING_DEFAULTS["ollama"][1],
                "base_url": base_url,
            }

    api_key = _api_key_from_options(options)
    if api_key:
        model = _normalize_embedding_model_name(options.get("memory_embedding_model"), "openai")
        return {"provider": "openai", "model": model, "api_key": api_key}

    base_url = _ollama_base_url(options)
    if _ollama_reachable(base_url):
        return {
            "provider": "ollama",
            "model": root._EMBEDDING_DEFAULTS["ollama"][0],
            "vector_size": root._EMBEDDING_DEFAULTS["ollama"][1],
            "base_url": base_url,
        }

    return None


def _build_embed_runtime(config: dict[str, Any]) -> tuple[Callable[[list[str]], list[list[float]]], int]:
    root = _root()
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
            vectors: list[list[float]] = []
            for text in texts:
                resp = httpx.post(
                    f"{base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                    timeout=30.0,
                )
                resp.raise_for_status()
                vectors.append(resp.json()["embedding"])
            return vectors

        vector_size = int(config.get("vector_size") or root._EMBEDDING_DEFAULTS["ollama"][1])
        return ollama_embed, vector_size

    raise ValueError(f"Unsupported embedding provider: {provider}")
