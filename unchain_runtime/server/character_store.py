from __future__ import annotations

import re
import time

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
        build_character_agent_config,
        decide_character_response,
        evaluate_character,
        generate_character_id,
        make_character_relationship_namespace,
        make_character_self_namespace,
        sanitize_character_key_component,
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


from character_registry import (  # noqa: E402
    _avatars_dir,
    _character_id_from_payload,
    _dedupe_strings,
    _default_registry,
    _load_registry,
    _record_to_public,
    _registry_path,
    _save_registry,
)
from character_avatars import (  # noqa: E402
    _coerce_avatar_payload,
    _remove_avatar_file,
    _write_avatar_file,
)
from character_seeding import (  # noqa: E402
    _ensure_default_characters,
    _load_seeded_registry,
    _seed_builtin_character_profiles_if_missing,
    _seed_builtin_character_record,
    _seed_long_term_profile_if_missing,
)
from character_import_export import (  # noqa: E402
    _validate_archive_entries,
    export_character,
    import_character,
)
from character_service import (  # noqa: E402
    build_character_agent_config,
    delete_character,
    get_character,
    get_character_avatar_asset,
    list_characters,
    preview_character_decision,
    save_character,
)

__all__ = [
    "_AVATAR_MIME_BY_EXTENSION",
    "_AVATAR_EXTENSION_BY_MIME",
    "_ARCHIVE_ALLOWED_ENTRIES",
    "_ARCHIVE_ALLOWED_PREFIXES",
    "_CHARACTER_FORMAT",
    "_CHARACTER_FORMAT_VERSION",
    "_DATA_URL_PATTERN",
    "_DEFAULT_HUMAN_ID",
    "_REGISTRY_VERSION",
    "_avatars_dir",
    "_character_api",
    "_character_id_from_payload",
    "_coerce_avatar_payload",
    "_dedupe_strings",
    "_default_registry",
    "_ensure_data_dir",
    "_ensure_default_characters",
    "_load_registry",
    "_load_seeded_registry",
    "_now_ms",
    "_record_to_public",
    "_registry_path",
    "_remove_avatar_file",
    "_save_registry",
    "_seed_builtin_character_profiles_if_missing",
    "_seed_builtin_character_record",
    "_seed_long_term_profile_if_missing",
    "_validate_archive_entries",
    "_write_avatar_file",
    "build_character_agent_config",
    "delete_character",
    "export_character",
    "get_character",
    "get_character_avatar_asset",
    "import_character",
    "list_characters",
    "preview_character_decision",
    "save_character",
]
