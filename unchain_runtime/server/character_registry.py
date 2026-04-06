from __future__ import annotations

import copy
import json
import os
from typing import Any


def _root():
    import character_store as root_module

    return root_module


def _registry_path(data_dir: str) -> str:
    return _root().memory_factory._character_registry_path(data_dir)


def _avatars_dir(data_dir: str) -> str:
    return _root().memory_factory._character_avatars_dir(data_dir)


def _default_registry() -> dict[str, Any]:
    root = _root()
    return {
        "version": root._REGISTRY_VERSION,
        "seed_version": 0,
        "updated_at": 0,
        "characters_by_id": {},
    }


def _load_registry(data_dir: str) -> dict[str, Any]:
    root = _root()
    registry_path = _registry_path(data_dir)
    if not os.path.exists(registry_path):
        return _default_registry()
    try:
        with open(registry_path, "r", encoding="utf-8") as handle:
            registry = json.load(handle)
    except Exception:
        registry = {}
    if not isinstance(registry, dict):
        return _default_registry()
    characters_by_id = registry.get("characters_by_id")
    if not isinstance(characters_by_id, dict):
        characters_by_id = {}
    return {
        "version": registry.get("version") or root._REGISTRY_VERSION,
        "seed_version": int(registry.get("seed_version") or 0),
        "updated_at": registry.get("updated_at") or 0,
        "characters_by_id": copy.deepcopy(characters_by_id),
    }


def _save_registry(data_dir: str, registry: dict[str, Any]) -> None:
    root = _root()
    payload = _default_registry()
    payload["seed_version"] = int(registry.get("seed_version") or 0)
    payload["updated_at"] = root._now_ms()
    payload["characters_by_id"] = copy.deepcopy(
        registry.get("characters_by_id", {})
        if isinstance(registry, dict)
        else {}
    )
    root.memory_factory._atomic_write_json(_registry_path(data_dir), payload)


def _record_to_public(record: dict[str, Any]) -> dict[str, Any]:
    root = _root()
    spec = copy.deepcopy(record.get("spec", {})) if isinstance(record.get("spec"), dict) else {}
    return {
        **spec,
        "avatar": copy.deepcopy(record.get("avatar")) if isinstance(record.get("avatar"), dict) else None,
        "created_at": record.get("created_at") or 0,
        "updated_at": record.get("updated_at") or 0,
        "known_human_ids": list(record.get("known_human_ids", []))
        if isinstance(record.get("known_human_ids"), list)
        else [root._DEFAULT_HUMAN_ID],
        "owned_session_ids": list(record.get("owned_session_ids", []))
        if isinstance(record.get("owned_session_ids"), list)
        else [],
    }


def _character_id_from_payload(payload: dict[str, Any], existing_record: dict[str, Any] | None) -> str:
    root = _root()
    api = root._character_api()
    raw_id = payload.get("id")
    if existing_record and isinstance(existing_record.get("spec"), dict):
        existing_id = existing_record["spec"].get("id")
        if isinstance(existing_id, str) and existing_id.strip():
            return api["sanitize_character_key_component"](existing_id, fallback="character")
    if isinstance(raw_id, str) and raw_id.strip():
        return api["sanitize_character_key_component"](raw_id, fallback="character")
    return api["generate_character_id"](payload.get("name") or "character")


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        candidate = value.strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        result.append(candidate)
    return result
