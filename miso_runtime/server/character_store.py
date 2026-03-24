from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import character_defaults
import memory_factory

_REGISTRY_VERSION = 1
_DEFAULT_HUMAN_ID = "local_user"
_DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+);base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
_AVATAR_EXTENSION_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _character_api():
    from miso.characters import (
        CharacterAgent,
        CharacterSpec,
        decide_character_response,
        evaluate_character,
        generate_character_id,
        make_character_relationship_namespace,
        make_character_self_namespace,
        sanitize_character_key_component,
    )

    return {
        "CharacterAgent": CharacterAgent,
        "CharacterSpec": CharacterSpec,
        "decide_character_response": decide_character_response,
        "evaluate_character": evaluate_character,
        "generate_character_id": generate_character_id,
        "make_character_relationship_namespace": make_character_relationship_namespace,
        "make_character_self_namespace": make_character_self_namespace,
        "sanitize_character_key_component": sanitize_character_key_component,
    }


def _ensure_data_dir() -> str:
    data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
    if not data_dir:
        raise RuntimeError("MISO_DATA_DIR not configured")
    return data_dir


def _registry_path(data_dir: str) -> str:
    return memory_factory._character_registry_path(data_dir)


def _avatars_dir(data_dir: str) -> str:
    return memory_factory._character_avatars_dir(data_dir)


def _default_registry() -> dict[str, Any]:
    return {
        "version": _REGISTRY_VERSION,
        "seed_version": 0,
        "updated_at": 0,
        "characters_by_id": {},
    }


def _load_registry(data_dir: str) -> dict[str, Any]:
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
        "version": registry.get("version") or _REGISTRY_VERSION,
        "seed_version": int(registry.get("seed_version") or 0),
        "updated_at": registry.get("updated_at") or 0,
        "characters_by_id": copy.deepcopy(characters_by_id),
    }


def _save_registry(data_dir: str, registry: dict[str, Any]) -> None:
    payload = _default_registry()
    payload["seed_version"] = int(registry.get("seed_version") or 0)
    payload["updated_at"] = _now_ms()
    payload["characters_by_id"] = copy.deepcopy(
        registry.get("characters_by_id", {})
        if isinstance(registry, dict)
        else {}
    )
    memory_factory._atomic_write_json(_registry_path(data_dir), payload)


def _record_to_public(record: dict[str, Any]) -> dict[str, Any]:
    spec = copy.deepcopy(record.get("spec", {})) if isinstance(record.get("spec"), dict) else {}
    public_record = {
        **spec,
        "avatar": copy.deepcopy(record.get("avatar")) if isinstance(record.get("avatar"), dict) else None,
        "created_at": record.get("created_at") or 0,
        "updated_at": record.get("updated_at") or 0,
        "known_human_ids": list(record.get("known_human_ids", []))
        if isinstance(record.get("known_human_ids"), list)
        else [_DEFAULT_HUMAN_ID],
        "owned_session_ids": list(record.get("owned_session_ids", []))
        if isinstance(record.get("owned_session_ids"), list)
        else [],
    }
    return public_record


def _coerce_avatar_payload(payload: dict[str, Any]) -> tuple[str, str] | None:
    raw_avatar = payload.get("avatar")
    if raw_avatar is None:
        candidate = payload.get("avatar_data_url") or payload.get("avatarDataUrl")
    elif isinstance(raw_avatar, str):
        candidate = raw_avatar
    elif isinstance(raw_avatar, dict):
        candidate = (
            raw_avatar.get("data_url")
            or raw_avatar.get("dataUrl")
            or raw_avatar.get("value")
        )
    else:
        candidate = None

    if not isinstance(candidate, str) or not candidate.strip():
        return None

    match = _DATA_URL_PATTERN.fullmatch(candidate.strip())
    if not match:
        raise ValueError("avatar must be a valid base64 data URL")

    mime_type = match.group("mime").strip().lower()
    if mime_type not in _AVATAR_EXTENSION_BY_MIME:
        raise ValueError(f"unsupported avatar mime type: {mime_type}")

    try:
        decoded = base64.b64decode(match.group("data"), validate=True)
    except Exception as exc:
        raise ValueError("avatar contains invalid base64 data") from exc

    return mime_type, decoded.decode("latin1")


def _write_avatar_file(
    data_dir: str,
    *,
    character_id: str,
    mime_type: str,
    decoded_latin1: str,
    existing_avatar: dict[str, Any] | None,
) -> dict[str, Any]:
    binary_data = decoded_latin1.encode("latin1")
    extension = _AVATAR_EXTENSION_BY_MIME[mime_type]
    avatar_dir = _avatars_dir(data_dir)
    next_path = os.path.join(avatar_dir, f"{character_id}{extension}")

    if isinstance(existing_avatar, dict):
        previous_relative_path = existing_avatar.get("relative_path")
        if isinstance(previous_relative_path, str) and previous_relative_path.strip():
            previous_path = os.path.join(data_dir, previous_relative_path)
            if previous_path != next_path and os.path.exists(previous_path):
                try:
                    os.remove(previous_path)
                except Exception:
                    pass

    with open(next_path, "wb") as handle:
        handle.write(binary_data)

    return {
        "file_name": os.path.basename(next_path),
        "relative_path": os.path.relpath(next_path, data_dir),
        "absolute_path": next_path,
        "mime_type": mime_type,
        "size_bytes": len(binary_data),
        "sha256": hashlib.sha256(binary_data).hexdigest(),
    }


def _remove_avatar_file(data_dir: str, avatar: dict[str, Any] | None) -> None:
    if not isinstance(avatar, dict):
        return
    relative_path = avatar.get("relative_path")
    if not isinstance(relative_path, str) or not relative_path.strip():
        return
    target_path = os.path.join(data_dir, relative_path)
    if os.path.exists(target_path):
        try:
            os.remove(target_path)
        except Exception:
            pass


def _character_id_from_payload(payload: dict[str, Any], existing_record: dict[str, Any] | None) -> str:
    api = _character_api()
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


def _seed_long_term_profile_if_missing(
    data_dir: str,
    *,
    namespace: str,
    profile: dict[str, Any],
) -> None:
    profile_path = memory_factory._long_term_profile_path(data_dir, namespace)
    if os.path.exists(profile_path):
        return

    from miso.memory.manager import JsonFileLongTermProfileStore

    store = JsonFileLongTermProfileStore(
        base_dir=memory_factory._long_term_profiles_dir(data_dir),
    )
    store.save(namespace, copy.deepcopy(profile))


def _seed_builtin_character_profiles_if_missing(
    data_dir: str,
    *,
    character_id: str,
) -> None:
    seed_profiles = character_defaults.get_builtin_character_profile_seeds(character_id)
    if not isinstance(seed_profiles, dict):
        return

    self_namespace = _character_api()["make_character_self_namespace"](character_id)
    relationship_namespace = _character_api()["make_character_relationship_namespace"](
        character_id,
        _DEFAULT_HUMAN_ID,
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
    character_spec = _character_api()["CharacterSpec"].coerce(payload)
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

            if changed:
                existing_record["spec"] = existing_spec
                existing_record["updated_at"] = _now_ms()

        _seed_builtin_character_profiles_if_missing(
            data_dir,
            character_id=character_spec.id,
        )
        return changed

    created_at = _now_ms()
    self_namespace = _character_api()["make_character_self_namespace"](character_spec.id)
    registry["characters_by_id"][character_spec.id] = {
        "spec": character_spec.to_dict(),
        "avatar": None,
        "created_at": created_at,
        "updated_at": created_at,
        "known_human_ids": [_DEFAULT_HUMAN_ID],
        "owned_session_ids": [self_namespace],
    }
    _seed_builtin_character_profiles_if_missing(
        data_dir,
        character_id=character_spec.id,
    )
    return True


def _ensure_default_characters(data_dir: str, registry: dict[str, Any]) -> dict[str, Any]:
    current_seed_version = int(registry.get("seed_version") or 0)
    target_seed_version = character_defaults.DEFAULT_CHARACTER_SEED_VERSION
    if current_seed_version >= target_seed_version:
        return registry

    changed = False
    for payload in character_defaults.list_builtin_characters():
        if _seed_builtin_character_record(data_dir, registry, payload):
            changed = True

    registry["seed_version"] = target_seed_version
    if changed or current_seed_version != target_seed_version:
        _save_registry(data_dir, registry)
    return registry


def _load_seeded_registry(data_dir: str) -> dict[str, Any]:
    return _ensure_default_characters(data_dir, _load_registry(data_dir))


def list_characters() -> dict[str, Any]:
    data_dir = _ensure_data_dir()
    registry = _load_seeded_registry(data_dir)
    characters = [
        _record_to_public(record)
        for record in registry["characters_by_id"].values()
        if isinstance(record, dict)
    ]
    characters.sort(
        key=lambda item: int(item.get("updated_at") or 0),
        reverse=True,
    )
    return {"characters": characters, "count": len(characters)}


def get_character(character_id: str) -> dict[str, Any] | None:
    data_dir = _ensure_data_dir()
    registry = _load_seeded_registry(data_dir)
    safe_id = _character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_id)
    if not isinstance(record, dict):
        return None
    return _record_to_public(record)


def save_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_payload = payload if isinstance(payload, dict) else {}
    data_dir = _ensure_data_dir()
    registry = _load_registry(data_dir)

    candidate_existing_id = raw_payload.get("id")
    existing_record = None
    if isinstance(candidate_existing_id, str) and candidate_existing_id.strip():
        normalized_existing_id = _character_api()["sanitize_character_key_component"](
            candidate_existing_id,
            fallback="character",
        )
        maybe_record = registry["characters_by_id"].get(normalized_existing_id)
        if isinstance(maybe_record, dict):
            existing_record = maybe_record

    character_id = _character_id_from_payload(raw_payload, existing_record)
    existing_record = registry["characters_by_id"].get(character_id)
    existing_spec = (
        copy.deepcopy(existing_record.get("spec", {}))
        if isinstance(existing_record, dict) and isinstance(existing_record.get("spec"), dict)
        else {}
    )
    merged_spec_payload = {
        **existing_spec,
        **{
            key: value
            for key, value in raw_payload.items()
            if key not in {"avatar", "avatar_data_url", "avatarDataUrl", "remove_avatar"}
        },
        "id": character_id,
    }
    character_spec = _character_api()["CharacterSpec"].coerce(merged_spec_payload)

    avatar_meta = (
        copy.deepcopy(existing_record.get("avatar"))
        if isinstance(existing_record, dict) and isinstance(existing_record.get("avatar"), dict)
        else None
    )
    remove_avatar = raw_payload.get("remove_avatar") is True or (
        "avatar" in raw_payload and raw_payload.get("avatar") is None
    )
    avatar_payload = None if remove_avatar else _coerce_avatar_payload(raw_payload)

    if remove_avatar:
        _remove_avatar_file(data_dir, avatar_meta)
        avatar_meta = None
        character_spec.avatar_ref = None
    elif avatar_payload is not None:
        mime_type, decoded_latin1 = avatar_payload
        avatar_meta = _write_avatar_file(
            data_dir,
            character_id=character_id,
            mime_type=mime_type,
            decoded_latin1=decoded_latin1,
            existing_avatar=avatar_meta,
        )
        character_spec.avatar_ref = avatar_meta["relative_path"]
    elif avatar_meta is not None and isinstance(avatar_meta.get("relative_path"), str):
        character_spec.avatar_ref = avatar_meta["relative_path"]

    created_at = (
        existing_record.get("created_at")
        if isinstance(existing_record, dict)
        else _now_ms()
    )
    self_namespace = _character_api()["make_character_self_namespace"](character_spec.id)
    owned_session_ids = _dedupe_strings(
        [
            self_namespace,
            *(
                existing_record.get("owned_session_ids", [])
                if isinstance(existing_record, dict) and isinstance(existing_record.get("owned_session_ids"), list)
                else []
            ),
        ]
    )
    known_human_ids = _dedupe_strings(
        [
            _DEFAULT_HUMAN_ID,
            *(
                existing_record.get("known_human_ids", [])
                if isinstance(existing_record, dict) and isinstance(existing_record.get("known_human_ids"), list)
                else []
            ),
        ]
    )

    record = {
        "spec": character_spec.to_dict(),
        "avatar": avatar_meta,
        "created_at": int(created_at or _now_ms()),
        "updated_at": _now_ms(),
        "known_human_ids": known_human_ids,
        "owned_session_ids": owned_session_ids,
    }
    registry["characters_by_id"][character_spec.id] = record
    _save_registry(data_dir, registry)
    return _record_to_public(record)


def preview_character_decision(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")
    character = get_character(character_id)
    if character is None:
        raise KeyError("character_not_found")

    spec = _character_api()["CharacterSpec"].coerce(character)
    evaluation = _character_api()["evaluate_character"](
        spec,
        now=raw_payload.get("now"),
        obligations=raw_payload.get("obligations"),
    )
    decision = _character_api()["decide_character_response"](
        spec,
        evaluation=evaluation,
    )
    return {
        "character": spec.to_dict(),
        "evaluation": evaluation.to_dict(),
        "decision": decision.to_dict(),
    }


def build_character_agent_config(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")

    data_dir = _ensure_data_dir()
    registry = _load_seeded_registry(data_dir)
    safe_character_id = _character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_character_id)
    if not isinstance(record, dict):
        raise KeyError("character_not_found")

    thread_id = raw_payload.get("thread_id") or raw_payload.get("threadId") or "default"
    human_id = raw_payload.get("human_id") or raw_payload.get("humanId") or _DEFAULT_HUMAN_ID
    spec = _character_api()["CharacterSpec"].coerce(record.get("spec"))
    config = _character_api()["CharacterAgent"].build_config(
        character=spec,
        thread_id=str(thread_id),
        human_id=str(human_id),
        profile_loader=lambda namespace: memory_factory._load_long_term_profile(
            data_dir,
            namespace,
        ),
        now=raw_payload.get("now"),
        obligations=raw_payload.get("obligations"),
    )
    metadata = spec.to_dict().get("metadata")
    if isinstance(metadata, dict):
        default_model = metadata.get("default_model")
        if isinstance(default_model, str) and default_model.strip():
            config["default_model"] = default_model.strip()

    record["updated_at"] = _now_ms()
    record["known_human_ids"] = _dedupe_strings(
        [
            *(
                record.get("known_human_ids", [])
                if isinstance(record.get("known_human_ids"), list)
                else []
            ),
            str(human_id),
        ]
    )
    record["owned_session_ids"] = _dedupe_strings(
        [
            *(
                record.get("owned_session_ids", [])
                if isinstance(record.get("owned_session_ids"), list)
                else []
            ),
            config["session_id"],
        ]
    )
    registry["characters_by_id"][safe_character_id] = record
    _save_registry(data_dir, registry)

    return config


def delete_character(character_id: str) -> dict[str, Any]:
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")

    data_dir = _ensure_data_dir()
    registry = _load_registry(data_dir)
    safe_character_id = _character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_character_id)
    if not isinstance(record, dict):
        raise KeyError("character_not_found")

    spec = _character_api()["CharacterSpec"].coerce(record.get("spec"))
    self_namespace = _character_api()["make_character_self_namespace"](spec.id)
    known_human_ids = _dedupe_strings(
        [
            _DEFAULT_HUMAN_ID,
            *(
                record.get("known_human_ids", [])
                if isinstance(record.get("known_human_ids"), list)
                else []
            ),
        ]
    )
    relationship_namespaces = [
        _character_api()["make_character_relationship_namespace"](spec.id, human_id)
        for human_id in known_human_ids
    ]
    owned_session_ids = _dedupe_strings(
        [
            self_namespace,
            *(
                record.get("owned_session_ids", [])
                if isinstance(record.get("owned_session_ids"), list)
                else []
            ),
        ]
    )

    deleted_sessions = [
        memory_factory.delete_short_term_session_memory(session_id=session_id)
        for session_id in owned_session_ids
    ]
    deleted_namespaces = [
        memory_factory.delete_long_term_memory_namespace(namespace=namespace)
        for namespace in [self_namespace, *relationship_namespaces]
    ]
    _remove_avatar_file(data_dir, record.get("avatar"))

    del registry["characters_by_id"][safe_character_id]
    _save_registry(data_dir, registry)

    return {
        "ok": True,
        "character_id": safe_character_id,
        "deleted_sessions": deleted_sessions,
        "deleted_namespaces": deleted_namespaces,
    }
