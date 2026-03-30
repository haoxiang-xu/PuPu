from __future__ import annotations

import copy
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_CHARACTER_SEED_VERSION = 4

_SEEDS_DIR = os.path.join(os.path.dirname(__file__), "character_seeds")

_cache: dict[str, Any] | None = None


def _load_seeds() -> dict[str, Any]:
    """Scan character_seeds/ and load all seed definitions.

    Each subfolder is a character id containing:
      - spec.json              (required)
      - self_profile.json      (optional)
      - relationship_profile.json (optional)

    Returns ``{ character_id: { spec, self_profile, relationship_profile } }``.
    Results are cached after first call.
    """
    global _cache
    if _cache is not None:
        return _cache

    seeds: dict[str, Any] = {}

    if not os.path.isdir(_SEEDS_DIR):
        logger.warning("character_seeds directory not found: %s", _SEEDS_DIR)
        _cache = seeds
        return seeds

    for entry in sorted(os.listdir(_SEEDS_DIR)):
        entry_path = os.path.join(_SEEDS_DIR, entry)
        if not os.path.isdir(entry_path):
            continue

        spec_path = os.path.join(entry_path, "spec.json")
        if not os.path.isfile(spec_path):
            logger.warning("Skipping seed %r: missing spec.json", entry)
            continue

        try:
            with open(spec_path, "r", encoding="utf-8") as f:
                spec = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Skipping seed %r: failed to read spec.json: %s", entry, exc)
            continue

        record: dict[str, Any] = {"spec": spec}

        self_profile_path = os.path.join(entry_path, "self_profile.json")
        if os.path.isfile(self_profile_path):
            try:
                with open(self_profile_path, "r", encoding="utf-8") as f:
                    record["self_profile"] = json.load(f)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Seed %r: failed to read self_profile.json: %s", entry, exc)

        rel_profile_path = os.path.join(entry_path, "relationship_profile.json")
        if os.path.isfile(rel_profile_path):
            try:
                with open(rel_profile_path, "r", encoding="utf-8") as f:
                    record["relationship_profile"] = json.load(f)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Seed %r: failed to read relationship_profile.json: %s", entry, exc)

        seeds[entry] = record

    _cache = seeds
    return seeds


def list_builtin_characters() -> list[dict[str, Any]]:
    """Return a list of all builtin character spec dicts."""
    seeds = _load_seeds()
    return [copy.deepcopy(record["spec"]) for record in seeds.values()]


def get_seed_avatar_path(character_id: str) -> str | None:
    normalized = str(character_id or "").strip().lower()
    if not normalized:
        return None
    avatar_path = os.path.join(_SEEDS_DIR, normalized, "avatar.png")
    return avatar_path if os.path.isfile(avatar_path) else None


def list_seed_characters() -> dict[str, Any]:
    """Return seed characters with avatar paths resolved for the Find UI."""
    seeds = _load_seeds()
    characters = []
    for character_id, record in seeds.items():
        spec = copy.deepcopy(record["spec"])
        avatar_path = get_seed_avatar_path(character_id)
        if avatar_path:
            spec["avatar"] = {"absolute_path": avatar_path}
        else:
            spec["avatar"] = None
        characters.append(spec)
    return {"characters": characters, "count": len(characters)}


def get_builtin_character_profile_seeds(character_id: str) -> dict[str, dict[str, Any]] | None:
    """Return self + relationship profile seeds for a builtin character, or None."""
    normalized = str(character_id or "").strip().lower()
    seeds = _load_seeds()
    record = seeds.get(normalized)
    if record is None:
        return None

    result: dict[str, dict[str, Any]] = {}
    if "self_profile" in record:
        result["self_profile"] = copy.deepcopy(record["self_profile"])
    if "relationship_profile" in record:
        result["relationship_profile"] = copy.deepcopy(record["relationship_profile"])

    return result if result else None
