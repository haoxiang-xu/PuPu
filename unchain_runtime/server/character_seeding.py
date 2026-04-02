from __future__ import annotations

import copy
import os
from typing import Any


def _root():
    import character_store as root_module

    return root_module


def _seed_long_term_profile_if_missing(
    data_dir: str,
    *,
    namespace: str,
    profile: dict[str, Any],
) -> None:
    root = _root()
    profile_path = root.memory_factory._long_term_profile_path(data_dir, namespace)
    if os.path.exists(profile_path):
        return

    from unchain.memory.manager import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(
        base_dir=root.memory_factory._long_term_profiles_dir(data_dir),
    )
    store.save(namespace, copy.deepcopy(profile))


def _seed_builtin_character_profiles_if_missing(
    data_dir: str,
    *,
    character_id: str,
) -> None:
    root = _root()
    seed_profiles = root.character_defaults.get_builtin_character_profile_seeds(character_id)
    if not isinstance(seed_profiles, dict):
        return

    self_namespace = root._character_api()["make_character_self_namespace"](character_id)
    relationship_namespace = root._character_api()["make_character_relationship_namespace"](
        character_id,
        root._DEFAULT_HUMAN_ID,
    )
    _seed_long_term_profile_if_missing(
        data_dir,
        namespace=self_namespace,
        profile=seed_profiles.get("self_profile") or {},
    )
    _seed_long_term_profile_if_missing(
        data_dir,
        namespace=relationship_namespace,
        profile=seed_profiles.get("relationship_profile") or {},
    )


def _seed_builtin_character_record(
    data_dir: str,
    registry: dict[str, Any],
    payload: dict[str, Any],
) -> bool:
    root = _root()
    character_spec = root._character_api()["CharacterSpec"].coerce(payload)
    existing_record = registry["characters_by_id"].get(character_spec.id)
    if existing_record:
        changed = False
        if isinstance(existing_record, dict):
            existing_spec = (
                copy.deepcopy(existing_record.get("spec", {}))
                if isinstance(existing_record.get("spec"), dict)
                else {}
            )
            builtin_spec = character_spec.to_dict()
            existing_metadata = (
                copy.deepcopy(existing_spec.get("metadata", {}))
                if isinstance(existing_spec.get("metadata"), dict)
                else {}
            )
            builtin_metadata = (
                copy.deepcopy(builtin_spec.get("metadata", {}))
                if isinstance(builtin_spec.get("metadata"), dict)
                else {}
            )

            for key, value in builtin_spec.items():
                if key == "metadata":
                    continue
                if key not in existing_spec:
                    existing_spec[key] = copy.deepcopy(value)
                    changed = True

            for key, value in builtin_metadata.items():
                if key not in existing_metadata:
                    existing_metadata[key] = copy.deepcopy(value)
                    changed = True

            if builtin_metadata:
                existing_spec["metadata"] = existing_metadata

            if not isinstance(existing_record.get("avatar"), dict):
                seed_avatar_path = os.path.join(
                    root.character_defaults._SEEDS_DIR,
                    character_spec.id,
                    "avatar.png",
                )
                if os.path.isfile(seed_avatar_path):
                    existing_record["avatar"] = {
                        "file_name": "avatar.png",
                        "absolute_path": seed_avatar_path,
                        "mime_type": "image/png",
                    }
                    changed = True

            if changed:
                existing_record["spec"] = existing_spec
                existing_record["updated_at"] = root._now_ms()

        _seed_builtin_character_profiles_if_missing(
            data_dir,
            character_id=character_spec.id,
        )
        return changed

    created_at = root._now_ms()
    self_namespace = root._character_api()["make_character_self_namespace"](character_spec.id)
    seed_avatar = None
    seed_avatar_path = os.path.join(
        root.character_defaults._SEEDS_DIR,
        character_spec.id,
        "avatar.png",
    )
    if os.path.isfile(seed_avatar_path):
        seed_avatar = {
            "file_name": "avatar.png",
            "absolute_path": seed_avatar_path,
            "mime_type": "image/png",
        }

    registry["characters_by_id"][character_spec.id] = {
        "spec": character_spec.to_dict(),
        "avatar": seed_avatar,
        "created_at": created_at,
        "updated_at": created_at,
        "known_human_ids": [root._DEFAULT_HUMAN_ID],
        "owned_session_ids": [self_namespace],
    }
    _seed_builtin_character_profiles_if_missing(
        data_dir,
        character_id=character_spec.id,
    )
    return True


def _ensure_default_characters(data_dir: str, registry: dict[str, Any]) -> dict[str, Any]:
    root = _root()
    current_seed_version = int(registry.get("seed_version") or 0)
    target_seed_version = root.character_defaults.DEFAULT_CHARACTER_SEED_VERSION

    changed = False
    builtin_payloads = root.character_defaults.list_builtin_characters()
    if current_seed_version >= target_seed_version:
        for payload in builtin_payloads:
            safe_id = root._character_api()["CharacterSpec"].coerce(payload).id
            if safe_id not in registry["characters_by_id"]:
                continue
            if _seed_builtin_character_record(data_dir, registry, payload):
                changed = True
        if changed:
            root._save_registry(data_dir, registry)
        return registry

    for payload in builtin_payloads:
        if _seed_builtin_character_record(data_dir, registry, payload):
            changed = True

    registry["seed_version"] = target_seed_version
    if changed or current_seed_version != target_seed_version:
        root._save_registry(data_dir, registry)
    return registry


def _load_seeded_registry(data_dir: str) -> dict[str, Any]:
    root = _root()
    return _ensure_default_characters(data_dir, root._load_registry(data_dir))
