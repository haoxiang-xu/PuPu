# Character Spec

> Data model for AI character personas, avatars, schedules, and memory profiles.

**Source of truth:** the spec dataclass is `CharacterIdentitySpec` in unchain core
(`unchain/character/decision.py`). PuPu coerces, persists, and serves it via
`character_store.py` / `character_service.py` / `character_registry.py`,
with avatar shaping in `character_avatars.py` and defaults/seeds in
`character_defaults.py`. This doc reflects those files; if they disagree, the
code wins.

---

## Character Spec (`CharacterIdentitySpec`)

The core identity definition. Spec is **coerced** through `CharacterIdentitySpec.coerce()`
on every save, so unknown keys are dropped and out-of-range values are clamped.
The JSON/wire form is shown below (the dataclass stores `speaking_style` and
`schedule.blocks` as tuples, but `to_dict()` serializes them as arrays).

```javascript
{
  id: string,              // Required. Sanitized key. If missing/blank, derived from `name`.
  name: string,            // Required. If missing/blank, defaults to "Character".

  gender: string,          // Optional, default "" (empty string, not null)
  role: string,            // Optional, default ""
  persona: string,         // Optional, default "" — free-text personality/description

  speaking_style: string[],// Optional, default []. A TAG ARRAY (not a sentence).
                           //   Each entry trimmed; empty/non-string entries dropped.

  // Behavior dials — float in [0.0, 1.0], clamped, default 0.5 each
  talkativeness: number,   // default 0.5
  politeness:    number,   // default 0.5
  autonomy:      number,   // default 0.5

  avatar_ref: string | null, // default null. Relative path to the avatar file
                             //   (set by the backend on save; not user-supplied art data).

  timezone: string,        // IANA tz name, default "UTC". Coerced from schedule.timezone.

  schedule: Schedule,      // default: empty CharacterSchedule (see below)
  metadata: object,        // Free-form dict, default {}. Backend reads metadata.default_model.
}
```

Notes:
- **`id` length:** sanitized character keys are capped at **120 chars**
  (`sanitize_character_key_component`), not 200.
- There is **no** `description`, `personality`, `background`, or `greeting`
  field. Free-text persona lives in `persona`; tone lives in `speaking_style[]`.
- `self_profile` / `relationship_profile` are **NOT** inline spec fields — they
  are separate files / memory namespaces (see [Memory Profiles](#memory-profiles)).

---

## Schedule (`CharacterSchedule`)

Time-based behavior. Defaults are applied per `status` via a lookup table during coercion.

```javascript
{
  timezone: string,                       // IANA tz, default "UTC"
  blocks: ScheduleBlock[],                // default [] (see below)
  default_status: string,                 // default "free"
  default_availability: string,           // default "available"
  default_interruption_tolerance: number, // float [0,1], default 0.7
  default_reply_mode: string,             // default "auto"
  default_courtesy_message: string,       // default ""
}
```

### Schedule Block (`CharacterScheduleBlock`)

```javascript
{
  days: string[],                  // default ["daily"] — e.g. "mon","tue",... / "daily" / "weekday"
  start_time: string,              // "HH:MM", default "00:00" (normalized/clamped)
  end_time: string,                // "HH:MM", default "23:59"
  status: string,                  // default "free" (drives availability/tolerance defaults)
  label: string,                   // default ""
  availability: string,            // default "" (filled from status defaults if blank)
  interruption_tolerance: number | null, // float [0,1] or null, default null
  reply_mode: string,              // default "auto"
  courtesy_message: string,        // default ""
  metadata: object,                // default {}
}
```

> The legacy shape (`time_blocks[].{start, end, personality_shift, activity}`) does
> NOT exist. Blocks carry `days`/`start_time`/`end_time`/`status`/availability dials,
> not personality shifts.

---

## Character Record (Backend persistence)

`save_character` stores the coerced spec plus bookkeeping fields. `_record_to_public`
spreads the spec at the top level and attaches the rest:

```javascript
{
  spec: CharacterIdentitySpec,   // coerced spec.to_dict()
  avatar: {                      // backend-stored avatar metadata, or null
    file_name: string,
    relative_path: string,       // path relative to data_dir; written into spec.avatar_ref
    absolute_path: string,
    mime_type: string,
    size_bytes: number,
    sha256: string,
  } | null,
  created_at: number,            // ms timestamp
  updated_at: number,            // ms timestamp
  known_human_ids: string[],     // associated human ids (default ["local_user"])
  owned_session_ids: string[],   // associated memory session ids
}
```

The public/list form returned to the frontend (`_record_to_public`) is the spec
fields **flattened** to the top level, plus `avatar`, `created_at`, `updated_at`,
`known_human_ids`, `owned_session_ids`.

---

## Character Avatar — two layers

Avatars exist in **two distinct shapes**. Do not conflate them; the mapping lives
in `character_avatars.py` (write side) and `character_service.get_character_avatar_asset`
(read/serve side).

### Backend stored metadata (`record.avatar`)

Written by `_write_avatar_file`. Source-of-truth on disk:

```javascript
{
  file_name: string,
  relative_path: string,   // copied into spec.avatar_ref
  absolute_path: string,
  mime_type: string,
  size_bytes: number,
  sha256: string,
}
```

When serving the asset, `get_character_avatar_asset` returns the minimal
`{ path, mime_type }` pair (resolving absolute → relative → seed fallback).

### Frontend consumed shape (on the chat session)

What the renderer reads. Any subset of these may be present:

```javascript
{
  url?: string,            // Remote URL. SEE WARNING BELOW.
  absolute_path?: string,  // Local absolute path
  relative_path?: string,  // Path relative to data_dir
  data_url?: string,       // Base64 data URL (e.g. data:image/png;base64,...)
  mime_type?: string,
  sha256?: string,
}
```

> ⚠️ **`url` is not a trusted/secure source.** It is a remote URL with **no scheme
> validation**. This is the current accepted state of finding **SEC-001** (accepted,
> not fixed). Do not document `url` as a safe/validated input, and re-evaluate if you
> touch avatar resolution.

### Avatar input on save

On `POST /characters`, the avatar is supplied as a **base64 data URL** (via
`avatar` / `avatar_data_url` / `avatarDataUrl`, or `avatar: {data_url|dataUrl|value}`),
validated against `_DATA_URL_PATTERN`. Sending `avatar: null` or `remove_avatar: true`
deletes the avatar file and clears `spec.avatar_ref`.

### Avatar MIME Types

| Extension | MIME |
|-----------|------|
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |

---

## Memory Profiles (separate files, not inline)

`self_profile` and `relationship_profile` are **independent JSON files**, not spec
fields. For builtin/seed characters they ship as `self_profile.json` and
`relationship_profile.json` inside each seed folder (`character_defaults._load_seeds`).
At runtime they are long-term memory namespaces:

- **Self namespace:** `make_character_self_namespace(id)`
- **Relationship namespace:** `make_character_relationship_namespace(id, human_id)`

These accumulate over conversations and are loaded by `build_character_agent_config`
via `memory_factory._load_long_term_profile`. Deleting a character tears down both
the owned sessions and these namespaces (`delete_character`).

---

## Character Chat Session

When `kind === "character"`, the chat session includes:

```javascript
{
  kind: "character",
  characterId: "...",             // sanitized id (id cap is 120 chars)
  characterName: "...",
  characterAvatar: { ... },       // frontend avatar shape above
  threadId: "main",               // default thread

  // Forced overrides — character chats are isolated
  selectedToolkits: [],           // always empty
  selectedWorkspaceIds: [],       // always empty
  agentOrchestration: { mode: "default" },
  systemPromptOverrides: {},
}
```

Memory session ID format: `character_{normalizedId}__dm__{normalizedThread}`

---

## Builtin Character Seeding

`character_seeding.py` + `character_defaults.py` provide default characters bundled
with the app. Each seed folder under `character_seeds/{id}/` holds `spec.json`
(required), optional `self_profile.json`, optional `relationship_profile.json`, and
optional `avatar.png`. Seeds are listed via `GET /characters/seeds` and their avatars
via `GET /characters/seeds/{id}/avatar`. `DEFAULT_CHARACTER_SEED_VERSION` gates
re-seeding.

---

## Import/Export Format

Characters can be exported as `.character` archives:

```
manifest.json     # { format: "character", version: 1 }
spec.json         # CharacterIdentitySpec
self_profile.json # Optional
assets/           # Avatar files
```

Allowed entries are whitelisted:

```python
ARCHIVE_ALLOWED_ENTRIES  = {"manifest.json", "spec.json", "self_profile.json"}
ARCHIVE_ALLOWED_PREFIXES = ("assets/",)
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /characters/seeds` | GET | List builtin characters |
| `GET /characters/seeds/{id}/avatar` | GET | Seed character avatar |
| `GET /characters` | GET | List user characters |
| `GET /characters/{id}` | GET | Get character |
| `GET /characters/{id}/avatar` | GET | Character avatar |
| `POST /characters` | POST | Save/create character (also "follow" from Discover) |
| `DELETE /characters/{id}` | DELETE | Delete character (also "unfollow") |
| `POST /characters/preview` | POST | Preview character decision |
| `POST /characters/build` | POST | Build agent config |
| `POST /characters/{id}/export` | POST | Export archive |
| `POST /characters/import` | POST | Import archive |

---

## Key Files

| File | Role |
|------|------|
| `unchain/character/decision.py` (unchain core) | `CharacterIdentitySpec` + `CharacterSchedule(Block)` — source of truth |
| `unchain_runtime/server/character_store.py` | Persistence facade (re-exports submodules) |
| `unchain_runtime/server/character_service.py` | Business logic (save/get/delete/build) |
| `unchain_runtime/server/character_registry.py` | Registry I/O + `_record_to_public` |
| `unchain_runtime/server/character_seeding.py` | Builtin character seeding |
| `unchain_runtime/server/character_defaults.py` | Seed loading / default values |
| `unchain_runtime/server/character_avatars.py` | Avatar coerce/write/remove |
| `unchain_runtime/server/character_import_export.py` | Archive handling |
| `src/COMPONENTs/agents/pages/characters_page.js` | Character UI (Discover/Following) |
