from __future__ import annotations

import json
import os
import re
from typing import Any


def _root():
    import memory_factory as root_module

    return root_module


def _load_session_state(data_dir: str, session_id: str) -> dict[str, Any]:
    root = _root()
    from unchain.memory.qdrant import JsonFileSessionStore

    store = JsonFileSessionStore(base_dir=root._sessions_dir(data_dir))
    try:
        state = store.load(str(session_id or ""))
    except Exception:
        state = {}
    return state if isinstance(state, dict) else {}


def _load_long_term_profile(data_dir: str, namespace: str) -> dict[str, Any]:
    root = _root()
    from unchain.memory.manager import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(base_dir=root._long_term_profiles_dir(data_dir))
    try:
        profile = store.load(str(namespace or ""))
    except Exception:
        profile = {}
    return profile if isinstance(profile, dict) else {}


def _safe_long_term_namespace(namespace: str) -> str:
    return "".join(
        char if char.isalnum() or char == "_" else "_"
        for char in str(namespace or "")
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
    root = _root()
    directory = os.path.dirname(path)
    temp_path = os.path.join(directory, f".{os.path.basename(path)}.{root.uuid.uuid4().hex}.tmp")
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)
