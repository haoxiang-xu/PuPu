# Character Spec

> Data model for AI character personas, avatars, schedules, and memory profiles.

---

## Character Record (Backend)

Stored by `character_store.py`:

```python
{
    "spec": CharacterSpec,               # Identity and behavior
    "avatar": {
        "path": str,                     # File path to avatar
        "mime_type": str,                # MIME type
    } | None,
    "created_at": int,                   # ms timestamp
    "updated_at": int,                   # ms timestamp
    "known_human_ids": [str],            # Associated users
    "owned_session_ids": [str],          # Associated chat sessions
}
```

---

## Character Spec

The core identity definition:

```python
{
    "id": str,                           # Unique identifier
    "name": str,                         # Display name
    "description": str,                  # Short description
    "personality": str,                  # Personality traits
    "background": str,                   # Backstory
    "speaking_style": str,               # How the character communicates
    "greeting": str,                     # Initial message

    # Optional
    "schedule": Schedule | None,         # Time-based behavior
    "self_profile": SelfProfile | None,  # Character's self-knowledge
    "relationship_profile": RelationshipProfile | None, # Knowledge of user
}
```

---

## Character Avatar (Frontend)

Stored on the chat session:

```javascript
{
  url?: string,              // Remote URL
  absolute_path?: string,    // Local absolute path
  relative_path?: string,    // Relative path
  data_url?: string,         // Base64 data URL
  mime_type?: string,        // MIME type
  sha256?: string,           // Content hash
}
```

### Avatar MIME Types

| Extension | MIME |
|-----------|------|
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |

---

## Schedule System

Characters can have time-based behavior shifts:

```python
{
    "time_blocks": [
        {
            "start": "HH:MM",       # Start time
            "end": "HH:MM",         # End time
            "personality_shift": str, # How personality changes
            "activity": str,         # What the character is doing
        },
    ],
}
```

---

## Memory Profiles

### Self Profile

The character's self-knowledge, built over conversations:

```python
{
    "memories": [str],           # Self-related memories
    "traits": [str],             # Discovered traits
    "preferences": [str],        # Discovered preferences
}
```

### Relationship Profile

The character's knowledge about the user:

```python
{
    "memories": [str],           # User-related memories
    "observations": [str],       # Observations about the user
}
```

---

## Character Chat Session

When `kind === "character"`, the chat session includes:

```javascript
{
  kind: "character",
  characterId: "...",             // max 200 chars
  characterName: "...",           // max 120 chars
  characterAvatar: { ... },
  threadId: "main",               // default thread

  // Forced overrides
  selectedToolkits: [],           // always empty
  selectedWorkspaceIds: [],       // always empty
  agentOrchestration: { mode: "default" },
  systemPromptOverrides: {},
}
```

Memory session ID format: `character_{normalizedId}__dm__{normalizedThread}`

---

## Builtin Character Seeding

`character_seeding.py` provides default characters bundled with the app. They are listed via `GET /characters/seeds` and their avatars via `GET /characters/seeds/{id}/avatar`.

---

## Import/Export Format

Characters can be exported as `.character` archives:

### Archive Structure

```
manifest.json    # Format metadata
spec.json        # CharacterSpec
self_profile.json # Optional
assets/          # Avatar files
```

### Allowed Entries

```python
ARCHIVE_ALLOWED_ENTRIES = {"manifest.json", "spec.json", "self_profile.json"}
ARCHIVE_ALLOWED_PREFIXES = ("assets/",)
```

### Manifest

```python
{
    "format": "character",
    "version": 1,
}
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
| `POST /characters` | POST | Save/create character |
| `DELETE /characters/{id}` | DELETE | Delete character |
| `POST /characters/preview` | POST | Preview character decision |
| `POST /characters/build` | POST | Build agent config |
| `POST /characters/{id}/export` | POST | Export archive |
| `POST /characters/import` | POST | Import archive |

---

## Key Files

| File | Role |
|------|------|
| `unchain_runtime/server/character_store.py` | Persistence layer |
| `unchain_runtime/server/character_service.py` | Business logic |
| `unchain_runtime/server/character_registry.py` | Registration |
| `unchain_runtime/server/character_seeding.py` | Builtin characters |
| `unchain_runtime/server/character_defaults.py` | Default values |
| `unchain_runtime/server/character_avatars.py` | Avatar management |
| `unchain_runtime/server/character_import_export.py` | Archive handling |
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | Frontend sanitization |
