"""Factory for MemoryManager with Qdrant vector storage.

Embedding provider resolution order:
  1. Explicit memory_embedding_provider in options ("openai" | "ollama")
  2. Current chat model's provider, if it supports embeddings
  3. OpenAI fallback if api key is present
  4. Ollama fallback if server is reachable
  5. None — memory is skipped for this request
"""
from __future__ import annotations

import os
from typing import Any, Callable

_QDRANT_AVAILABLE = False
try:
    from qdrant_client import QdrantClient  # noqa: F401
    _QDRANT_AVAILABLE = True
except ImportError:
    pass

# Default embedding models and their output vector sizes
_EMBEDDING_DEFAULTS: dict[str, tuple[str, int]] = {
    "openai": ("text-embedding-3-small", 1536),
    "ollama": ("nomic-embed-text", 768),
}

# Providers that have no embedding API
_NO_EMBED_PROVIDERS = {"anthropic"}

# Module-level singletons — one Qdrant client reused across all requests
_qdrant_clients: dict[str, "QdrantClient"] = {}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _data_dir() -> str:
    return os.environ.get("MISO_DATA_DIR", "").strip()


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


def _get_or_create_qdrant_client(data_dir: str) -> "QdrantClient":
    if data_dir not in _qdrant_clients:
        from qdrant_client import QdrantClient
        _qdrant_clients[data_dir] = QdrantClient(path=_qdrant_path(data_dir))
    return _qdrant_clients[data_dir]


def _provider_from_model_id(model_id: str) -> str:
    if not isinstance(model_id, str) or ":" not in model_id:
        return ""
    return model_id.split(":", 1)[0].strip().lower()


def _api_key_from_options(options: dict[str, Any]) -> str:
    for key in ("openaiApiKey", "openai_api_key", "apiKey", "api_key"):
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
            model = str(options.get("memory_embedding_model") or _EMBEDDING_DEFAULTS["openai"][0])
            return {
                "provider": "openai",
                "model": model,
                "vector_size": _EMBEDDING_DEFAULTS["openai"][1],
                "api_key": api_key,
            }
        if explicit == "ollama":
            base_url = _ollama_base_url(options)
            model = str(options.get("memory_embedding_model") or _EMBEDDING_DEFAULTS["ollama"][0])
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
                return {
                    "provider": "openai",
                    "model": _EMBEDDING_DEFAULTS["openai"][0],
                    "vector_size": _EMBEDDING_DEFAULTS["openai"][1],
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
        return {
            "provider": "openai",
            "model": _EMBEDDING_DEFAULTS["openai"][0],
            "vector_size": _EMBEDDING_DEFAULTS["openai"][1],
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


def _build_embed_fn(config: dict[str, Any]) -> Callable[[list[str]], list[list[float]]]:
    provider = config["provider"]

    if provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=config["api_key"])
        model = config["model"]

        def openai_embed(texts: list[str]) -> list[list[float]]:
            resp = client.embeddings.create(input=texts, model=model)
            return [item.embedding for item in resp.data]

        return openai_embed

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

        return ollama_embed

    raise ValueError(f"Unsupported embedding provider: {provider}")


# ---------------------------------------------------------------------------
# Public: MemoryManager factory
# ---------------------------------------------------------------------------

def create_memory_manager(options: dict[str, Any]):
    """Build a MemoryManager for this request, or return None.

    Returns None when:
    - qdrant-client is not installed
    - MISO_DATA_DIR env var is not set
    - memory_enabled is falsy in options
    - no embedding provider can be resolved
    - any import / construction error occurs
    """
    if not _QDRANT_AVAILABLE:
        return None

    data_dir = _data_dir()
    if not data_dir:
        return None

    if not options.get("memory_enabled"):
        return None

    embed_config = resolve_embedding_config(options)
    if embed_config is None:
        return None

    try:
        from miso.memory import MemoryConfig, MemoryManager
        from miso.memory_qdrant import JsonFileSessionStore, QdrantVectorAdapter

        qdrant_client = _get_or_create_qdrant_client(data_dir)
        embed_fn = _build_embed_fn(embed_config)

        vector_adapter = QdrantVectorAdapter(
            client=qdrant_client,
            embed_fn=embed_fn,
            vector_size=embed_config["vector_size"],
        )
        store = JsonFileSessionStore(base_dir=_sessions_dir(data_dir))

        last_n = max(1, int(options.get("memory_last_n_turns") or 8))
        top_k = max(0, int(options.get("memory_vector_top_k") or 4))

        return MemoryManager(
            config=MemoryConfig(
                last_n_turns=last_n,
                vector_top_k=top_k,
                vector_adapter=vector_adapter,
            ),
            store=store,
        )
    except Exception:
        return None
