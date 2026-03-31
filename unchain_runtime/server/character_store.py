from __future__ import annotations

import base64
import copy
import datetime
import hashlib
import json
import os
import re
import time
import zipfile
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
_AVATAR_MIME_BY_EXTENSION = {ext: mime for mime, ext in _AVATAR_EXTENSION_BY_MIME.items()}

_CHARACTER_FORMAT = "character"
_CHARACTER_FORMAT_VERSION = 1
_ARCHIVE_ALLOWED_ENTRIES = {"manifest.json", "spec.json", "self_profile.json"}
_ARCHIVE_ALLOWED_PREFIXES = ("assets/",)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _character_api():
    from unchain.character import (
        CharacterIdentitySpec,
        evaluate_character,
        decide_character_response,
        generate_character_id,
        make_character_relationship_namespace,
        make_character_self_namespace,
        sanitize_character_key_component,
        build_character_agent_config,
    )

    return {
        "CharacterSpec": CharacterIdentitySpec,
        "evaluate_character": evaluate_character,
        "decide_character_response": decide_character_response,
        "generate_character_id": generate_character_id,
        "make_character_relationship_namespace": make_character_relationship_namespace,
        "make_character_self_namespace": make_character_self_namespace,
        "sanitize_character_key_component": sanitize_character_key_component,
        "build_character_agent_config": build_character_agent_config,
    }


def _ensure_data_dir() -> str:
    data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
    if not data_dir:
        raise RuntimeError("UNCHAIN_DATA_DIR not configured")
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

    from unchain.memory.manager import JsonFileLongTermProfileStore

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

            # Backfill seed avatar if record has no avatar
            if not isinstance(existing_record.get("avatar"), dict):
                seed_avatar_path = os.path.join(
                    character_defaults._SEEDS_DIR, character_spec.id, "avatar.png"
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
                existing_record["updated_at"] = _now_ms()

        _seed_builtin_character_profiles_if_missing(
            data_dir,
            character_id=character_spec.id,
        )
        return changed

    created_at = _now_ms()
    self_namespace = _character_api()["make_character_self_namespace"](character_spec.id)

    # Resolve avatar from seed directory if available
    seed_avatar = None
    seed_avatar_path = os.path.join(
        character_defaults._SEEDS_DIR, character_spec.id, "avatar.png"
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

    changed = False
    builtin_payloads = character_defaults.list_builtin_characters()
    if current_seed_version >= target_seed_version:
        # Once the registry is current, only backfill builtin records that still
        # exist locally. This repairs missing seed assets such as avatar.png
        # without recreating builtin characters the user explicitly deleted.
        for payload in builtin_payloads:
            safe_id = _character_api()["CharacterSpec"].coerce(payload).id
            if safe_id not in registry["characters_by_id"]:
                continue
            if _seed_builtin_character_record(data_dir, registry, payload):
                changed = True
        if changed:
            _save_registry(data_dir, registry)
        return registry

    for payload in builtin_payloads:
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


def get_character_avatar_asset(character_id: str) -> dict[str, str] | None:
    data_dir = _ensure_data_dir()
    registry = _load_seeded_registry(data_dir)
    safe_id = _character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_id)
    if not isinstance(record, dict):
        return None

    avatar_meta = record.get("avatar")
    if isinstance(avatar_meta, dict):
        absolute_path = avatar_meta.get("absolute_path")
        if isinstance(absolute_path, str) and absolute_path.strip() and os.path.isfile(absolute_path):
            mime_type = avatar_meta.get("mime_type")
            if not isinstance(mime_type, str) or not mime_type.strip():
                ext = os.path.splitext(absolute_path)[1].lower()
                mime_type = _AVATAR_MIME_BY_EXTENSION.get(ext, "application/octet-stream")
            return {"path": absolute_path, "mime_type": mime_type}

        relative_path = avatar_meta.get("relative_path")
        if isinstance(relative_path, str) and relative_path.strip():
            candidate = os.path.join(data_dir, relative_path)
            if os.path.isfile(candidate):
                mime_type = avatar_meta.get("mime_type")
                if not isinstance(mime_type, str) or not mime_type.strip():
                    ext = os.path.splitext(candidate)[1].lower()
                    mime_type = _AVATAR_MIME_BY_EXTENSION.get(ext, "application/octet-stream")
                return {"path": candidate, "mime_type": mime_type}

    seed_avatar_path = character_defaults.get_seed_avatar_path(safe_id)
    if seed_avatar_path:
        return {"path": seed_avatar_path, "mime_type": "image/png"}

    return None


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
    config = _character_api()["build_character_agent_config"](
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


def export_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    file_path = raw_payload.get("file_path") or raw_payload.get("filePath")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")
    file_path = file_path.strip()

    api = _character_api()
    data_dir = _ensure_data_dir()
    registry = _load_seeded_registry(data_dir)
    safe_id = api["sanitize_character_key_component"](character_id, fallback="character")
    record = registry["characters_by_id"].get(safe_id)
    if not isinstance(record, dict):
        raise KeyError("character_not_found")

    spec = api["CharacterSpec"].coerce(record.get("spec"))
    spec_dict = spec.to_dict()

    has_avatar = False
    avatar_abs_path = ""
    avatar_ext = ""
    avatar_meta = record.get("avatar")
    if isinstance(avatar_meta, dict):
        rel_path = avatar_meta.get("relative_path")
        if isinstance(rel_path, str) and rel_path.strip():
            candidate = os.path.join(data_dir, rel_path)
            if os.path.isfile(candidate):
                has_avatar = True
                avatar_abs_path = candidate
                avatar_ext = os.path.splitext(candidate)[1] or ".png"

    has_self_profile = False
    self_profile: dict[str, Any] = {}
    self_namespace = api["make_character_self_namespace"](spec.id)
    loaded_profile = memory_factory._load_long_term_profile(data_dir, self_namespace)
    if isinstance(loaded_profile, dict) and loaded_profile:
        has_self_profile = True
        self_profile = loaded_profile

    manifest = {
        "format": _CHARACTER_FORMAT,
        "version": _CHARACTER_FORMAT_VERSION,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "generator": "pupu",
        "character_id": spec.id,
        "character_name": spec.name or spec.id,
        "has_avatar": has_avatar,
        "has_self_profile": has_self_profile,
    }

    parent_dir = os.path.dirname(file_path)
    if parent_dir and not os.path.isdir(parent_dir):
        os.makedirs(parent_dir, exist_ok=True)

    with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        zf.writestr("spec.json", json.dumps(spec_dict, indent=2, ensure_ascii=False))
        if has_self_profile:
            zf.writestr("self_profile.json", json.dumps(self_profile, indent=2, ensure_ascii=False))
        if has_avatar:
            zf.write(avatar_abs_path, f"assets/avatar{avatar_ext}")

    return {
        "ok": True,
        "character_id": spec.id,
        "file_path": file_path,
    }


def _validate_archive_entries(names: list[str]) -> None:
    for name in names:
        parts = name.replace("\\", "/").split("/")
        if ".." in parts or name.startswith("/") or "\\" in name:
            raise ValueError(f"Archive contains unsafe path: {name}")
        if name not in _ARCHIVE_ALLOWED_ENTRIES and not any(
            name.startswith(prefix) for prefix in _ARCHIVE_ALLOWED_PREFIXES
        ):
            raise ValueError(f"Archive contains unexpected entry: {name}")


def import_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_payload = payload if isinstance(payload, dict) else {}
    file_path = raw_payload.get("file_path") or raw_payload.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")
    file_path = file_path.strip()

    if not os.path.isfile(file_path):
        raise ValueError("File does not exist")
    if not zipfile.is_zipfile(file_path):
        raise ValueError("File is not a valid .character archive")

    api = _character_api()

    with zipfile.ZipFile(file_path, "r") as zf:
        names = zf.namelist()
        _validate_archive_entries(names)

        if "manifest.json" not in names:
            raise ValueError("Archive is missing manifest.json")
        manifest = json.loads(zf.read("manifest.json"))
        if not isinstance(manifest, dict):
            raise ValueError("Invalid manifest format")
        if manifest.get("format") != _CHARACTER_FORMAT:
            raise ValueError(
                f"Unsupported archive format: {manifest.get('format')}"
            )
        if manifest.get("version") != _CHARACTER_FORMAT_VERSION:
            raise ValueError(
                f"Unsupported archive version: {manifest.get('version')}"
            )

        if "spec.json" not in names:
            raise ValueError("Archive is missing spec.json")
        raw_spec = json.loads(zf.read("spec.json"))
        character_spec = api["CharacterSpec"].coerce(raw_spec)

        data_dir = _ensure_data_dir()
        registry = _load_registry(data_dir)

        original_id = character_spec.id
        resolved_id = api["sanitize_character_key_component"](
            original_id, fallback="character"
        )
        if resolved_id in registry["characters_by_id"]:
            resolved_id = api["generate_character_id"](character_spec.name or "character")

        character_spec = api["CharacterSpec"].coerce({
            **raw_spec,
            "id": resolved_id,
        })

        avatar_meta = None
        if manifest.get("has_avatar"):
            avatar_entries = [n for n in names if n.startswith("assets/avatar")]
            if avatar_entries:
                avatar_entry = avatar_entries[0]
                avatar_data = zf.read(avatar_entry)
                ext = os.path.splitext(avatar_entry)[1].lower()
                mime = _AVATAR_MIME_BY_EXTENSION.get(ext)
                if mime and avatar_data:
                    avatar_meta = _write_avatar_file(
                        data_dir,
                        character_id=resolved_id,
                        mime_type=mime,
                        decoded_latin1=avatar_data.decode("latin1"),
                        existing_avatar=None,
                    )
                    character_spec.avatar_ref = avatar_meta["relative_path"]

        if manifest.get("has_self_profile") and "self_profile.json" in names:
            self_profile = json.loads(zf.read("self_profile.json"))
            if isinstance(self_profile, dict) and self_profile:
                self_namespace = api["make_character_self_namespace"](resolved_id)
                from unchain.memory.manager import JsonFileLongTermProfileStore
                store = JsonFileLongTermProfileStore(
                    base_dir=memory_factory._long_term_profiles_dir(data_dir),
                )
                store.save(self_namespace, copy.deepcopy(self_profile))

    now = _now_ms()
    self_namespace = api["make_character_self_namespace"](resolved_id)
    record = {
        "spec": character_spec.to_dict(),
        "avatar": avatar_meta,
        "created_at": now,
        "updated_at": now,
        "known_human_ids": [_DEFAULT_HUMAN_ID],
        "owned_session_ids": [self_namespace],
    }
    registry["characters_by_id"][resolved_id] = record
    _save_registry(data_dir, registry)

    return {
        "ok": True,
        "character": _record_to_public(record),
        "imported_id": resolved_id,
        "original_id": original_id,
    }
