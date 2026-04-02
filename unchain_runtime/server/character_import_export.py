from __future__ import annotations

import copy
import datetime
import json
import os
import zipfile
from typing import Any


def _root():
    import character_store as root_module

    return root_module


def export_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    root = _root()
    raw_payload = payload if isinstance(payload, dict) else {}
    character_id = raw_payload.get("character_id") or raw_payload.get("characterId")
    file_path = raw_payload.get("file_path") or raw_payload.get("filePath")
    if not isinstance(character_id, str) or not character_id.strip():
        raise ValueError("character_id is required")
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")
    file_path = file_path.strip()

    api = root._character_api()
    data_dir = root._ensure_data_dir()
    registry = root._load_seeded_registry(data_dir)
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
    loaded_profile = root.memory_factory._load_long_term_profile(data_dir, self_namespace)
    if isinstance(loaded_profile, dict) and loaded_profile:
        has_self_profile = True
        self_profile = loaded_profile

    manifest = {
        "format": root._CHARACTER_FORMAT,
        "version": root._CHARACTER_FORMAT_VERSION,
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

    with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
        archive.writestr("spec.json", json.dumps(spec_dict, indent=2, ensure_ascii=False))
        if has_self_profile:
            archive.writestr(
                "self_profile.json",
                json.dumps(self_profile, indent=2, ensure_ascii=False),
            )
        if has_avatar:
            archive.write(avatar_abs_path, f"assets/avatar{avatar_ext}")

    return {"ok": True, "character_id": spec.id, "file_path": file_path}


def _validate_archive_entries(names: list[str]) -> None:
    root = _root()
    for name in names:
        parts = name.replace("\\", "/").split("/")
        if ".." in parts or name.startswith("/") or "\\" in name:
            raise ValueError(f"Archive contains unsafe path: {name}")
        if name not in root._ARCHIVE_ALLOWED_ENTRIES and not any(
            name.startswith(prefix) for prefix in root._ARCHIVE_ALLOWED_PREFIXES
        ):
            raise ValueError(f"Archive contains unexpected entry: {name}")


def import_character(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    root = _root()
    raw_payload = payload if isinstance(payload, dict) else {}
    file_path = raw_payload.get("file_path") or raw_payload.get("filePath")
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")
    file_path = file_path.strip()

    if not os.path.isfile(file_path):
        raise ValueError("File does not exist")
    if not zipfile.is_zipfile(file_path):
        raise ValueError("File is not a valid .character archive")

    api = root._character_api()

    with zipfile.ZipFile(file_path, "r") as archive:
        names = archive.namelist()
        _validate_archive_entries(names)

        if "manifest.json" not in names:
            raise ValueError("Archive is missing manifest.json")
        manifest = json.loads(archive.read("manifest.json"))
        if not isinstance(manifest, dict):
            raise ValueError("Invalid manifest format")
        if manifest.get("format") != root._CHARACTER_FORMAT:
            raise ValueError(f"Unsupported archive format: {manifest.get('format')}")
        if manifest.get("version") != root._CHARACTER_FORMAT_VERSION:
            raise ValueError(f"Unsupported archive version: {manifest.get('version')}")

        if "spec.json" not in names:
            raise ValueError("Archive is missing spec.json")
        raw_spec = json.loads(archive.read("spec.json"))
        character_spec = api["CharacterSpec"].coerce(raw_spec)

        data_dir = root._ensure_data_dir()
        registry = root._load_registry(data_dir)

        original_id = character_spec.id
        resolved_id = api["sanitize_character_key_component"](original_id, fallback="character")
        if resolved_id in registry["characters_by_id"]:
            resolved_id = api["generate_character_id"](character_spec.name or "character")

        character_spec = api["CharacterSpec"].coerce({**raw_spec, "id": resolved_id})

        avatar_meta = None
        if manifest.get("has_avatar"):
            avatar_entries = [name for name in names if name.startswith("assets/avatar")]
            if avatar_entries:
                avatar_entry = avatar_entries[0]
                avatar_data = archive.read(avatar_entry)
                ext = os.path.splitext(avatar_entry)[1].lower()
                mime = root._AVATAR_MIME_BY_EXTENSION.get(ext)
                if mime and avatar_data:
                    avatar_meta = root._write_avatar_file(
                        data_dir,
                        character_id=resolved_id,
                        mime_type=mime,
                        decoded_latin1=avatar_data.decode("latin1"),
                        existing_avatar=None,
                    )
                    character_spec.avatar_ref = avatar_meta["relative_path"]

        if manifest.get("has_self_profile") and "self_profile.json" in names:
            self_profile = json.loads(archive.read("self_profile.json"))
            if isinstance(self_profile, dict) and self_profile:
                self_namespace = api["make_character_self_namespace"](resolved_id)
                from unchain.memory.manager import JsonFileLongTermProfileStore

                store = JsonFileLongTermProfileStore(
                    base_dir=root.memory_factory._long_term_profiles_dir(data_dir),
                )
                store.save(self_namespace, copy.deepcopy(self_profile))

    now = root._now_ms()
    self_namespace = api["make_character_self_namespace"](resolved_id)
    record = {
        "spec": character_spec.to_dict(),
        "avatar": avatar_meta,
        "created_at": now,
        "updated_at": now,
        "known_human_ids": [root._DEFAULT_HUMAN_ID],
        "owned_session_ids": [self_namespace],
    }
    registry["characters_by_id"][resolved_id] = record
    root._save_registry(data_dir, registry)

    return {
        "ok": True,
        "character": root._record_to_public(record),
        "imported_id": resolved_id,
        "original_id": original_id,
    }
