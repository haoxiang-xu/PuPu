# Character System

> AI character personas with identity, schedules, memory profiles, and import/export.

---

## Overview

The character system allows users to create and interact with AI personas. Each character has an identity spec, optional avatar, time-based behavior schedules, and long-term memory profiles.

Character chats are isolated: they disable toolkits, workspaces, agent orchestration, and system prompt overrides.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Frontend                                              │
│   src/COMPONENTs/settings/ (character management UI) │
│   src/SERVICEs/api.unchain.js (API facade)           │
│   src/SERVICEs/chat_storage.js (session persistence) │
├──────────────────────────────────────────────────────┤
│ Electron IPC                                          │
│   9 character channels in UNCHAIN group              │
├──────────────────────────────────────────────────────┤
│ Flask Backend                                         │
│   character_store.py    (persistence)                │
│   character_service.py  (business logic)             │
│   character_registry.py (registration)               │
│   character_seeding.py  (builtin characters)         │
│   character_defaults.py (default values)             │
│   character_avatars.py  (avatar management)          │
│   character_import_export.py (archive handling)      │
└──────────────────────────────────────────────────────┘
```

---

## Data Model

See [Character Spec](../data-models/character-spec.md) for the complete data model.

---

## Workflows

### Creating a Character

1. User fills character form (name, personality, background, etc.)
2. Frontend calls `api.unchain.saveCharacter(payload)`
3. Backend creates record in `character_store.py`
4. Avatar saved to `{userData}/characters/{id}/avatar.*`

### Opening a Character Chat

1. User selects character → `openCharacterChat(characterId, name, avatar)`
2. If existing chat with `kind=character` and same `characterId` exists, reopen it
3. Otherwise create new chat session with `kind: "character"`
4. Toolkits, workspaces, orchestration all forced to defaults

### Character Decision Preview

1. Frontend calls `api.unchain.previewCharacterDecision(payload)`
2. Backend evaluates the character's personality against the message
3. Returns `{ character, evaluation, decision }` — useful for testing character behavior

### Building Agent Config

1. Frontend calls `api.unchain.buildCharacterAgentConfig(payload)`
2. Backend generates a complete agent configuration for the character
3. Used internally when starting a character chat stream

---

## Schedule System

Characters can define time-based behavior shifts:

```javascript
{
  time_blocks: [
    {
      start: "09:00",
      end: "17:00",
      personality_shift: "Focused and professional",
      activity: "Working at the office",
    },
    {
      start: "20:00",
      end: "23:00",
      personality_shift: "Relaxed and playful",
      activity: "Watching movies at home",
    },
  ],
}
```

The backend evaluates the current time against the schedule to adjust the character's persona.

---

## Memory Profiles

### Self Profile

The character accumulates self-knowledge:
- **Memories**: things the character remembers about itself
- **Traits**: personality traits discovered through conversation
- **Preferences**: preferences expressed over time

### Relationship Profile

The character builds knowledge about each user:
- **Memories**: things observed about the user
- **Observations**: patterns and preferences noted

Memory session ID: `character_{normalizedId}__dm__{normalizedThread}`

---

## Import/Export

Characters can be exported as `.character` archives (ZIP-based):

```
manifest.json    → { format: "character", version: 1 }
spec.json        → Full character spec
self_profile.json → Optional self profile
assets/          → Avatar files
```

Allowed entries are whitelisted for security.

---

## Builtin Characters (Seeding)

`character_seeding.py` provides default characters bundled with the app. Seeds are read-only and served via:
- `GET /characters/seeds` — list
- `GET /characters/seeds/{id}/avatar` — avatar asset

Users can duplicate seeds into their own collection.

---

## Storage on Disk

```
{userData}/
  characters/
    {characterId}/
      avatar.*           # Avatar image
  memory/
    sessions/            # Per-session vectors
    long_term_profiles/  # Long-term memory
```

---

## Key Files

| File | Role |
|------|------|
| `unchain_runtime/server/character_store.py` | CRUD operations |
| `unchain_runtime/server/character_service.py` | Business logic |
| `unchain_runtime/server/character_seeding.py` | Builtin characters |
| `unchain_runtime/server/character_import_export.py` | Archive I/O |
| `src/SERVICEs/api.unchain.js` | Frontend API facade |
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | Session sanitization |
