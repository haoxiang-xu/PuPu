from __future__ import annotations

import copy
import os
from typing import Any


def _root():
    import character_store as root_module

    return root_module


def list_characters() -> dict[str, Any]:
    root = _root()
    data_dir = root._ensure_data_dir()
    registry = root._load_seeded_registry(data_dir)
    characters = [
        root._record_to_public(record)
        for record in registry["characters_by_id"].values()
        if isinstance(record, dict)
    ]
    characters.sort(key=lambda item: int(item.get("updated_at") or 0), reverse=True)
    return {"characters": characters, "count": len(characters)}


def get_character(character_id: str) -> dict[str, Any] | None:
    root = _root()
    data_dir = root._ensure_data_dir()
    registry = root._load_seeded_registry(data_dir)
    safe_id = root._character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_id)
    if not isinstance(record, dict):
        return None
    return root._record_to_public(record)


def get_character_avatar_asset(character_id: str) -> dict[str, str] | None:
    root = _root()
    data_dir = root._ensure_data_dir()
    registry = root._load_seeded_registry(data_dir)
    safe_id = root._character_api()["sanitize_character_key_component"](
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
                mime_type = root._AVATAR_MIME_BY_EXTENSION.get(ext, "application/octet-stream")
            return {"path": absolute_path, "mime_type": mime_type}

        relative_path = avatar_meta.get("relative_path")
        if isinstance(relative_path, str) and relative_path.strip():
            candidate = os.path.join(data_dir, relative_path)
            if os.path.isfile(candidate):
                mime_type = avatar_meta.get("mime_type")
                if not isinstance(mime_type, str) or not mime_type.strip():
                    ext = os.path.splitext(candidate)[1].lower()
                    mime_type = root._AVATAR_MIME_BY_EXTENSION.get(ext, "application/octet-stream")
                return {"path": candidate, "mime_type": mime_type}

    seed_avatar_path = root.character_defaults.get_seed_avatar_path(safe_id)
    if seed_avatar_path:
        return {"path": seed_avatar_path, "mime_type": "image/png"}

    return None


def save_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    root = _root()
    raw_payload = payload if isinstance(payload, dict) else {}
    data_dir = root._ensure_data_dir()
    registry = root._load_registry(data_dir)

    candidate_existing_id = raw_payload.get("id")
    existing_record = None
    if isinstance(candidate_existing_id, str) and candidate_existing_id.strip():
        normalized_existing_id = root._character_api()["sanitize_character_key_component"](
            candidate_existing_id,
            fallback="character",
        )
        maybe_record = registry["characters_by_id"].get(normalized_existing_id)
        if isinstance(maybe_record, dict):
            existing_record = maybe_record

    character_id = root._character_id_from_payload(raw_payload, existing_record)
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
    character_spec = root._character_api()["CharacterSpec"].coerce(merged_spec_payload)

    avatar_meta = (
        copy.deepcopy(existing_record.get("avatar"))
        if isinstance(existing_record, dict) and isinstance(existing_record.get("avatar"), dict)
        else None
    )
    remove_avatar = raw_payload.get("remove_avatar") is True or (
        "avatar" in raw_payload and raw_payload.get("avatar") is None
    )
    avatar_payload = None if remove_avatar else root._coerce_avatar_payload(raw_payload)

    if remove_avatar:
        root._remove_avatar_file(data_dir, avatar_meta)
        avatar_meta = None
        character_spec.avatar_ref = None
    elif avatar_payload is not None:
        mime_type, decoded_latin1 = avatar_payload
        avatar_meta = root._write_avatar_file(
            data_dir,
            character_id=character_id,
            mime_type=mime_type,
            decoded_latin1=decoded_latin1,
            existing_avatar=avatar_meta,
        )
        character_spec.avatar_ref = avatar_meta["relative_path"]
    elif avatar_meta is not None and isinstance(avatar_meta.get("relative_path"), str):
        character_spec.avatar_ref = avatar_meta["relative_path"]

    created_at = existing_record.get("created_at") if isinstance(existing_record, dict) else root._now_ms()
    self_namespace = root._character_api()["make_character_self_namespace"](character_spec.id)
    owned_session_ids = root._dedupe_strings(
        [
            self_namespace,
            *(
                existing_record.get("owned_session_ids", [])
                if isinstance(existing_record, dict) and isinstance(existing_record.get("owned_session_ids"), list)
                else []
            ),
        ]
    )
    known_human_ids = root._dedupe_strings(
        [
            root._DEFAULT_HUMAN_ID,
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
        "created_at": int(created_at or root._now_ms()),
        "updated_at": root._now_ms(),
        "known_human_ids": known_human_ids,
        "owned_session_ids": owned_session_ids,
    }
    registry["characters_by_id"][character_spec.id] = record
    root._save_registry(data_dir, registry)
    return root._record_to_public(record)


def preview_character_decision(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    root = _root()
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")
    character = get_character(character_id)
    if character is None:
        raise KeyError("character_not_found")

    spec = root._character_api()["CharacterSpec"].coerce(character)
    evaluation = root._character_api()["evaluate_character"](
        spec,
        now=raw_payload.get("now"),
        obligations=raw_payload.get("obligations"),
    )
    decision = root._character_api()["decide_character_response"](spec, evaluation=evaluation)
    return {
        "character": spec.to_dict(),
        "evaluation": evaluation.to_dict(),
        "decision": decision.to_dict(),
    }


def build_character_agent_config(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    root = _root()
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")

    data_dir = root._ensure_data_dir()
    registry = root._load_seeded_registry(data_dir)
    safe_character_id = root._character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_character_id)
    if not isinstance(record, dict):
        raise KeyError("character_not_found")

    thread_id = raw_payload.get("thread_id") or raw_payload.get("threadId") or "default"
    human_id = raw_payload.get("human_id") or raw_payload.get("humanId") or root._DEFAULT_HUMAN_ID
    spec = root._character_api()["CharacterSpec"].coerce(record.get("spec"))
    config = root._character_api()["build_character_agent_config"](
        character=spec,
        thread_id=str(thread_id),
        human_id=str(human_id),
        profile_loader=lambda namespace: root.memory_factory._load_long_term_profile(data_dir, namespace),
        now=raw_payload.get("now"),
        obligations=raw_payload.get("obligations"),
    )
    metadata = spec.to_dict().get("metadata")
    if isinstance(metadata, dict):
        default_model = metadata.get("default_model")
        if isinstance(default_model, str) and default_model.strip():
            config["default_model"] = default_model.strip()

    record["updated_at"] = root._now_ms()
    record["known_human_ids"] = root._dedupe_strings(
        [
            *(record.get("known_human_ids", []) if isinstance(record.get("known_human_ids"), list) else []),
            str(human_id),
        ]
    )
    record["owned_session_ids"] = root._dedupe_strings(
        [
            *(record.get("owned_session_ids", []) if isinstance(record.get("owned_session_ids"), list) else []),
            config["session_id"],
        ]
    )
    registry["characters_by_id"][safe_character_id] = record
    root._save_registry(data_dir, registry)
    return config


def delete_character(character_id: str) -> dict[str, Any]:
    root = _root()
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")

    data_dir = root._ensure_data_dir()
    registry = root._load_registry(data_dir)
    safe_character_id = root._character_api()["sanitize_character_key_component"](
        character_id,
        fallback="character",
    )
    record = registry["characters_by_id"].get(safe_character_id)
    if not isinstance(record, dict):
        raise KeyError("character_not_found")

    spec = root._character_api()["CharacterSpec"].coerce(record.get("spec"))
    self_namespace = root._character_api()["make_character_self_namespace"](spec.id)
    known_human_ids = root._dedupe_strings(
        [
            root._DEFAULT_HUMAN_ID,
            *(record.get("known_human_ids", []) if isinstance(record.get("known_human_ids"), list) else []),
        ]
    )
    relationship_namespaces = [
        root._character_api()["make_character_relationship_namespace"](spec.id, human_id)
        for human_id in known_human_ids
    ]
    owned_session_ids = root._dedupe_strings(
        [
            self_namespace,
            *(record.get("owned_session_ids", []) if isinstance(record.get("owned_session_ids"), list) else []),
        ]
    )

    deleted_sessions = [
        root.memory_factory.delete_short_term_session_memory(session_id=session_id)
        for session_id in owned_session_ids
    ]
    deleted_namespaces = [
        root.memory_factory.delete_long_term_memory_namespace(namespace=namespace)
        for namespace in [self_namespace, *relationship_namespaces]
    ]
    root._remove_avatar_file(data_dir, record.get("avatar"))

    del registry["characters_by_id"][safe_character_id]
    root._save_registry(data_dir, registry)

    return {
        "ok": True,
        "character_id": safe_character_id,
        "deleted_sessions": deleted_sessions,
        "deleted_namespaces": deleted_namespaces,
    }
