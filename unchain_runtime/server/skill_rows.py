"""skill_rows — normalize [[skills]] declarations into catalog rows.

Shared by the builtin toolkit.toml path (unchain_adapter) and the MCP
store-entry path (mcp_registry / mcp_toolkits). Tolerant by design: the
catalog must keep serving, so invalid rows are dropped, never raised —
strict validation lives in unchain's manifest parser instead.

P-D6 migration (ticket #291): each row's `name` is now the *canonical*
slug (see `canonical_skill_name`); a raw spelling that differs from its
canonical form is preserved in `aliases` so a `/name` token typed the old
way keeps resolving. Policy flags (`model_invocable`/`user_invocable`)
and a JSON-safe `metadata` bag are parsed tolerantly too: an unparseable
explicit flag never turns permissive — it falls back to the *restrictive*
value and is recorded in `degraded` instead of silently guessing.
`normalize_skill_rows` is idempotent: feeding it its own output (rows
that already carry `aliases` / `model_invocable` / `user_invocable` /
`degraded`) round-trips unchanged.
"""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional

_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_SKILL_PHASES = {"composer", "streaming", "always"}

# canonical_skill_name: lowercase, then anything outside [a-z0-9-] (incl. "_")
# collapses to "-"; runs of "-" collapse to one; leading/trailing "-" strip;
# truncate to 64 chars; strip a "-" left dangling right at the cut.
_CANON_INVALID_RE = re.compile(r"[^a-z0-9-]+")
_CANON_COLLAPSE_RE = re.compile(r"-{2,}")
_CANON_MAX_LENGTH = 64

_TRUE_STRINGS = {"true", "yes", "on", "1"}
_FALSE_STRINGS = {"false", "no", "off", "0"}


def _clean_str(value: Any) -> str:
    """Strings pass through stripped; every other type yields "" (dropped
    or defaulted by the caller) — repr-coercing a dict/int into a prompt
    body would leak garbage into the catalog."""
    return value.strip() if isinstance(value, str) else ""


def canonical_skill_name(name: str) -> str:
    """Slugify a skill name into its canonical `/command` form.

    Rules (mirrored exactly by the JS twin `canonicalSkillName` in
    skill_pack_import.js): lowercase; `_` and any character outside
    `[a-z0-9-]` -> `-`; collapse runs of `-`; strip leading/trailing `-`;
    truncate to 64 characters; strip a trailing `-` left dangling by that
    truncation. Idempotent — canonicalizing an already-canonical name is
    a no-op, which is what makes `normalize_skill_rows` idempotent too.
    """
    text = (name or "").lower()
    text = _CANON_INVALID_RE.sub("-", text)
    text = _CANON_COLLAPSE_RE.sub("-", text)
    text = text.strip("-")
    text = text[:_CANON_MAX_LENGTH]
    text = text.rstrip("-")
    return text


def _row_bool(value: Any, default: Optional[bool]) -> Optional[bool]:
    """Tolerant boolean coercion for a frontmatter/TOML-style policy flag.

    - `None` -> `default` (callers that can tell a *present* `null` from an
      absent key pass `default=None` so it surfaces as invalid)
    - a Python `bool` -> itself (this is also how a round-tripped,
      already-normalized row's `model_invocable`/`user_invocable` value
      gets read back, since that field is stored as a real bool)
    - one of the case-insensitive strings true/false/yes/no/on/off/1/0 ->
      the matching bool
    - anything else explicit (wrong type, or an unrecognized string) ->
      `None`, signalling "invalid" — the caller must never treat that as
      permissive.
    """
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _TRUE_STRINGS:
            return True
        if text in _FALSE_STRINGS:
            return False
        return None
    return None


def _is_json_safe(value: Any) -> bool:
    if value is None or isinstance(value, (str, int, float, bool)):
        return True
    if isinstance(value, list):
        return all(_is_json_safe(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_safe(val) for key, val in value.items())
    return False


def _clean_metadata(value: Any) -> Dict[str, Any]:
    """The raw item's `metadata` dict, deep-copied, iff every key is a str
    and every value is JSON-safe (str/num/bool/None/list/dict thereof) —
    an unsafe or malformed value drops the whole bag rather than leaking
    a partially-sanitized shape into the catalog."""
    if not isinstance(value, dict):
        return {}
    if not all(isinstance(key, str) and _is_json_safe(val) for key, val in value.items()):
        return {}
    return copy.deepcopy(value)


def _clean_aliases(canonical: str, raw_aliases: Any, seed: List[str]) -> List[str]:
    """`seed` (the raw spelling, when it differs from `canonical`) first,
    then any explicit string aliases from the raw item — cleaned,
    deduplicated, and never equal to `canonical` itself."""
    aliases: List[str] = list(seed)
    seen = set(aliases)
    if isinstance(raw_aliases, list):
        for candidate in raw_aliases:
            if not isinstance(candidate, str):
                continue
            cleaned = candidate.strip()
            if not cleaned or cleaned == canonical or cleaned in seen:
                continue
            aliases.append(cleaned)
            seen.add(cleaned)
    return aliases


_MODEL_POSITIVE_KEYS = ("model_invocable", "modelInvocable")
_MODEL_NEGATIVE_KEYS = ("disable-model-invocation", "disable_model_invocation", "disableModelInvocation")
_USER_POSITIVE_KEYS = ("user_invocable", "userInvocable", "user-invocable")


def _resolve_policy_flag(
    item: Dict[str, Any],
    *,
    positive_keys: tuple,
    negative_keys: tuple,
    canonical_key: str,
    degraded: List[str],
) -> bool:
    """Resolve one policy flag from every supported spelling (audit P3).

    Every spelling that is *present* is evaluated; an invalid explicit value in
    any of them (wrong type, unknown string) is a diagnostic and forces the
    restrictive result. Valid spellings combine restrictively too: the flag
    is permissive only when no present spelling denies it. Absent everywhere
    -> permissive default. Absent-vs-present-invalid is never confused.
    """
    permitted = True
    invalid = False
    # A key that is *present* is always evaluated — including an explicit
    # `null`, which is not "absent" but an invalid value (restrictive).
    for key in positive_keys:
        if key in item:
            parsed = _row_bool(item.get(key), None)
            if parsed is None:
                invalid = True
            elif parsed is False:
                permitted = False
    for key in negative_keys:
        if key in item:
            parsed = _row_bool(item.get(key), None)
            if parsed is None:
                invalid = True
            elif parsed is True:
                permitted = False
    if invalid:
        note = f"invalid_flag:{canonical_key}"
        if note not in degraded:
            degraded.append(note)
        return False
    return permitted


def _unique_canonical(base: str, taken: set) -> str:
    """`base`, or `base-2`, `base-3`, ... (within 64 chars) not in `taken`."""
    if base not in taken:
        return base
    suffix = 2
    while True:
        tail = f"-{suffix}"
        candidate = base[: _CANON_MAX_LENGTH - len(tail)].rstrip("-") + tail
        if candidate not in taken:
            return candidate
        suffix += 1


def normalize_skill_rows(raw: Any) -> List[Dict[str, object]]:
    if not isinstance(raw, list):
        return []

    # Pass 1: validate and canonicalise every usable row, keeping order.
    prepared: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = _clean_str(item.get("name"))
        body = _clean_str(item.get("body"))
        if not name or not body or not _SKILL_NAME_RE.match(name):
            continue
        canonical = canonical_skill_name(name)
        if not canonical:
            continue
        prepared.append({"item": item, "raw_name": name, "canonical": canonical})

    # Pass 2 (audit P2): resolve canonical-name collisions without losing a row.
    # The spelling that already *is* the canonical form owns it; otherwise the
    # first occurrence does. Every other member keeps its content under a
    # deterministic, unique `<canonical>-N` name with its raw spelling as an
    # alias, and both sides carry a visible `name_collision:` note. Re-running
    # on the output is a no-op (idempotent), because the suffixed names no
    # longer collide.
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for entry in prepared:
        groups.setdefault(entry["canonical"], []).append(entry)
    taken: set = set(groups)
    for canonical, members in groups.items():
        if len(members) == 1:
            members[0]["final"] = canonical
            members[0]["collisions"] = []
            continue
        exact = [m for m in members if m["raw_name"] == canonical]
        winner = exact[0] if exact else members[0]
        for member in members:
            if member is winner:
                member["final"] = canonical
            else:
                member["final"] = _unique_canonical(canonical, taken)
                taken.add(member["final"])
        for member in members:
            member["collisions"] = [
                f"name_collision:{other['raw_name']}" for other in members if other is not member
            ]

    rows: List[Dict[str, object]] = []
    for entry in prepared:
        item = entry["item"]
        name = entry["raw_name"]
        canonical = entry["final"]
        body = _clean_str(item.get("body"))

        phase = _clean_str(item.get("phase")) or "composer"
        if phase not in _SKILL_PHASES:
            phase = "composer"

        raw_tools = item.get("tools")
        tools = [
            tool.strip()
            for tool in (raw_tools if isinstance(raw_tools, list) else [])
            if isinstance(tool, str) and tool.strip()
        ]

        # Carry forward any degraded notes the row already had (round-trip
        # idempotency) — new notes discovered below are appended on top.
        degraded: List[str] = []
        existing_degraded = item.get("degraded")
        if isinstance(existing_degraded, list):
            degraded.extend(entry_note for entry_note in existing_degraded if isinstance(entry_note, str))
        for note in entry["collisions"]:
            if note not in degraded:
                degraded.append(note)

        alias_seed = [name] if canonical != name else []
        aliases = _clean_aliases(canonical, item.get("aliases"), alias_seed)

        model_invocable = _resolve_policy_flag(
            item,
            positive_keys=_MODEL_POSITIVE_KEYS,
            negative_keys=_MODEL_NEGATIVE_KEYS,
            canonical_key="disable-model-invocation",
            degraded=degraded,
        )
        user_invocable = _resolve_policy_flag(
            item,
            positive_keys=_USER_POSITIVE_KEYS,
            negative_keys=(),
            canonical_key="user-invocable",
            degraded=degraded,
        )

        metadata = _clean_metadata(item.get("metadata"))

        rows.append({
            "name": canonical,
            "aliases": aliases,
            "title": _clean_str(item.get("title")) or canonical,
            "description": _clean_str(item.get("description")),
            "body": body,
            "tools": tools,
            "phase": phase,
            "model_invocable": model_invocable,
            "user_invocable": user_invocable,
            "metadata": metadata,
            "degraded": degraded,
        })
    return rows

