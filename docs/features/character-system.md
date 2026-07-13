# Character System

> AI character personas with identity, schedules, memory profiles, and import/export.

---

## Overview

The character system lets users discover and interact with AI personas. Each
character has an identity spec, optional avatar, time-based behavior schedule, and
long-term memory profiles.

Character chats are isolated: they disable toolkits, workspaces, agent
orchestration, and system prompt overrides.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend                                                       │
│   src/COMPONENTs/agents/pages/characters_page.js               │
│       (character UI — Discover / Following swipe model)        │
│   src/COMPONENTs/agents/agents_modal.js / _content.js          │
│       (modal shell hosting the agents pages)                   │
│   src/SERVICEs/api.unchain.js     (API facade)                 │
│   src/SERVICEs/chat_storage.js    (session persistence)        │
├──────────────────────────────────────────────────────────────┤
│ Electron IPC                                                   │
│   character channels in the UNCHAIN group                      │
├──────────────────────────────────────────────────────────────┤
│ Flask Backend                                                  │
│   character_store.py    (persistence facade)                   │
│   character_service.py  (business logic)                       │
│   character_registry.py (registry I/O)                         │
│   character_seeding.py  (builtin characters)                   │
│   character_defaults.py (seed loading / defaults)              │
│   character_avatars.py  (avatar management)                    │
│   character_import_export.py (archive handling)                │
└──────────────────────────────────────────────────────────────┘
```

> The character UI lives under `src/COMPONENTs/agents/`, **not** `src/COMPONENTs/settings/`.
> The recipe / agent-orchestration editor lives alongside it under
> `src/COMPONENTs/agents/pages/recipes_page/`.

---

## Data Model

See [Character Spec](../data-models/character-spec.md) for the complete data model.

---

## Workflows

### "Creating" a character = Following (swipe model)

There is **no character creation form** in the current product. The flow is a
**Discover / Following follow-relationship model**, implemented in
`characters_page.js` via a `SwipeStack` (Tinder-style card stack):

1. On the **Discover** stack, swiping a card **right** (or the explicit add action)
   = **follow**. `handleAdd` calls `api.unchain.saveCharacter(character)`, persisting
   the (typically seed-derived) character into the user's collection.
2. Swiping **left** = dismiss / "nope" — no persistence.
3. On the **Following** ("Added") panel, the **Unfollow** action calls
   `handleRemove` → `api.unchain.deleteCharacter(id)`, which removes the record and
   tears down its memory sessions/namespaces and avatar file.

`saveCharacter` upserts: an existing id merges into the prior spec; a missing id is
derived from `name`. So "following" a seed materializes it into the user's registry.

> ⚠️ **`customize_page.js` is a DORMANT, un-wired surface.** It is a form-based
> character editor (avatar upload, name/gender, speaking style, persona/backstory)
> with an empty Save handler (`onClick={() => {}}`). It is **exported but imported
> nowhere** — not routed, not rendered. Do **not** describe it as the current creation
> flow. If a form-based create/edit path is ever shipped, it would be wired here.

### Opening a character chat

1. User selects a followed character → `openCharacterChat(characterId, name, avatar)`.
2. If an existing chat with `kind="character"` and the same `characterId` exists,
   reopen it.
3. Otherwise create a new session with `kind: "character"`.
4. Toolkits, workspaces, orchestration, and system-prompt overrides are forced to
   defaults (isolated chat).

### Character decision preview

1. Frontend calls `api.unchain.previewCharacterDecision(payload)`.
2. Backend evaluates the character (`evaluate_character` against schedule/now) and
   decides a response (`decide_character_response`).
3. Returns `{ character, evaluation, decision }` — useful for testing behavior.

### Building agent config

1. Frontend calls `api.unchain.buildCharacterAgentConfig(payload)`.
2. Backend generates a complete agent config (`build_character_agent_config`),
   loading long-term profiles via `memory_factory._load_long_term_profile` and
   honoring `metadata.default_model`.
3. Used internally when starting a character chat stream.

---

## Schedule System

Characters define time-based behavior via a schedule of blocks. See the
[Schedule](../data-models/character-spec.md#schedule-characterschedule) section for
the exact fields. In short:

```javascript
{
  timezone: "America/New_York",
  default_status: "free",
  default_availability: "available",
  default_interruption_tolerance: 0.7,
  default_reply_mode: "auto",
  blocks: [
    {
      days: ["weekday"],
      start_time: "09:00",
      end_time: "17:00",
      status: "busy",
      availability: "limited",
      interruption_tolerance: 0.3,
      reply_mode: "auto",
      label: "Working",
    },
  ],
}
```

Blocks carry availability/interruption dials keyed off `status`, **not** the legacy
`personality_shift`/`activity` fields. The backend evaluates the current time against
the schedule to adjust availability and reply behavior.

---

## Memory Profiles

`self_profile` and `relationship_profile` are **separate files / long-term memory
namespaces**, not inline spec fields.

### Self Profile (`make_character_self_namespace(id)`)

- **Memories**: things the character remembers about itself
- **Traits**: personality traits discovered through conversation
- **Preferences**: preferences expressed over time

### Relationship Profile (`make_character_relationship_namespace(id, human_id)`)

- **Memories**: things observed about the user
- **Observations**: patterns and preferences noted

Memory session ID: `character_{normalizedId}__dm__{normalizedThread}`

---

## Import/Export

Characters can be exported as `.character` archives (ZIP-based):

```
manifest.json     → { format: "character", version: 1 }
spec.json         → Full character spec
self_profile.json → Optional self profile
assets/           → Avatar files
```

Allowed entries are whitelisted for security.

---

## Builtin Characters (Seeding)

`character_seeding.py` (+ `character_defaults.py`) provide default characters bundled
with the app. Each seed folder under `character_seeds/{id}/` holds `spec.json`,
optional `self_profile.json` / `relationship_profile.json`, and optional `avatar.png`.
Seeds are read-only and served via:
- `GET /characters/seeds` — list (feeds the Discover stack)
- `GET /characters/seeds/{id}/avatar` — avatar asset

Following a seed (swipe-right) materializes it into the user's registry via
`saveCharacter`.

---

## Storage on Disk

```
{userData}/
  characters/
    {characterId}/
      avatar.*           # Avatar image
  memory/
    sessions/            # Per-session vectors
    long_term_profiles/  # Self / relationship profiles
```

---

## Key Files

| File | Role |
|------|------|
| `src/COMPONENTs/agents/pages/characters_page.js` | Character UI (Discover/Following swipe) |
| `src/COMPONENTs/agents/pages/customize_page.js` | DORMANT form editor — not wired up |
| `src/COMPONENTs/agents/agents_modal.js` / `agents_modal_content.js` | Agents modal shell |
| `src/COMPONENTs/agents/pages/recipes_page/` | Recipe / agent-orchestration editor |
| `unchain_runtime/server/character_store.py` | Persistence facade |
| `unchain_runtime/server/character_service.py` | Business logic |
| `unchain_runtime/server/character_seeding.py` | Builtin characters |
| `unchain_runtime/server/character_import_export.py` | Archive I/O |
| `src/SERVICEs/api.unchain.js` | Frontend API facade |
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | Session sanitization |
