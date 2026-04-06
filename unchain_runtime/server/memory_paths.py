from __future__ import annotations

import os


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

    path = Path(data_dir) / "memory" / "qdrant"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _sessions_dir(data_dir: str) -> str:
    from pathlib import Path

    path = Path(data_dir) / "memory" / "sessions"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _long_term_profiles_dir(data_dir: str) -> str:
    from pathlib import Path

    path = Path(data_dir) / "memory" / "long_term_profiles"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _characters_dir(data_dir: str) -> str:
    from pathlib import Path

    path = Path(data_dir) / "characters"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _character_avatars_dir(data_dir: str) -> str:
    from pathlib import Path

    path = Path(_characters_dir(data_dir)) / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


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
