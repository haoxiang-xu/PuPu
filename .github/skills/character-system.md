# Skill: Character System

Use this guide when creating, modifying, or debugging characters — the AI companion persona system in PuPu.

Primary source files:

- Backend store: `miso_runtime/server/character_store.py`
- Builtin definitions: `miso_runtime/server/character_defaults.py`
- Flask routes: `miso_runtime/server/routes.py` (character endpoints)
- External library: `miso.characters` (CharacterSpec, CharacterAgent, evaluate_character, decide_character_response)
- Frontend store: `src/SERVICEs/chat_storage/chat_storage_store.js` (openCharacterChat)
- Frontend UI: `src/COMPONENTs/agents/pages/characters_page.js`
- Explorer integration: `src/SERVICEs/chat_storage/chat_storage_tree.js` (buildExplorerFromTree marks character chats)

---

## 1. Data model — CharacterSpec

A character is defined by a `CharacterSpec` (from `miso.characters`). The spec is stored as a plain dict inside the registry. Key fields:

```python
{
  "id": "nico",                          # unique, sanitized slug
  "name": "Nico",                        # display name
  "gender": "female",                    # optional
  "role": "22-year-old HR at an internet company",  # one-line role description
  "persona": "...",                      # multi-sentence personality description
  "speaking_style": ["casual", "playful", "empathetic"],  # list of style tags
  "talkativeness": 0.38,                # 0.0–1.0 float
  "politeness": 0.74,                   # 0.0–1.0 float
  "autonomy": 0.68,                     # 0.0–1.0 float
  "timezone": "Asia/Shanghai",          # IANA timezone for schedule evaluation
  "schedule": { ... },                  # see section 3
  "avatar_ref": "characters/avatars/nico.png",  # relative path to avatar file, or null
  "metadata": {                         # freeform metadata bucket
    "age": 22,
    "mbti": "INFP",
    "likes": ["cats"],
    "origin": "builtin_seed",
    "default_model": "openai:gpt-4.1",  # preferred model override
    "list_blurb": "...",                 # short description for UI list
    "list_tags": ["INFP", "HR", "猫控"],# tags shown in UI
    "primary_language": "zh-CN",         # primary display language
  },
}
```

`CharacterSpec.coerce(payload)` normalizes and validates any dict into a valid spec. Always pass user input through `.coerce()`.

---

## 2. Storage layout

Characters are stored on disk under `MISO_DATA_DIR`:

```
{MISO_DATA_DIR}/
├── characters/
│   ├── registry.json          # all character records
│   └── avatars/
│       └── nico.png           # avatar image files
└── long_term_profiles/
    ├── character__nico__self/  # character self-knowledge
    └── character__nico__rel__local_user/  # relationship with user
```

### Registry shape (`registry.json`)

```json
{
  "version": 1,
  "seed_version": 2,
  "updated_at": 1711234567890,
  "characters_by_id": {
    "nico": {
      "spec": { ... },
      "avatar": {
        "file_name": "nico.png",
        "relative_path": "characters/avatars/nico.png",
        "absolute_path": "/path/to/data/characters/avatars/nico.png",
        "mime_type": "image/png",
        "size_bytes": 12345,
        "sha256": "abc..."
      },
      "created_at": 1711234567890,
      "updated_at": 1711234567890,
      "known_human_ids": ["local_user"],
      "owned_session_ids": ["character__nico__self"]
    }
  }
}
```

### Avatar handling

- Avatars are passed to `save_character()` as base64 data URLs in the `avatar` field
- Supported formats: PNG, JPEG, WebP, GIF, SVG
- Stored as files in `{MISO_DATA_DIR}/characters/avatars/{character_id}.{ext}`
- To remove: set `remove_avatar: true` in the save payload
- Frontend resolves avatar paths via `resolveAvatarSrc()` which handles `file://` protocol conversion

---

## 3. Schedule system

Characters have time-block-based schedules that control their availability and response style.

### Schedule structure

```python
{
  "timezone": "Asia/Shanghai",    # IANA timezone — all times evaluated in this zone
  "default_status": "free",       # fallback when no block matches
  "blocks": [
    {
      "days": ["daily"],                # "daily", "weekday", "weekend", or specific days
      "start_time": "01:00",            # HH:MM in schedule timezone
      "end_time": "09:00",              # HH:MM in schedule timezone
      "status": "sleeping",             # descriptive status label
      "availability": "offline",        # "offline" | "limited" | "available"
      "interruption_tolerance": 0.0,    # 0.0–1.0, how willing to be interrupted
    },
    ...
  ]
}
```

### Day patterns

- `"daily"` — matches every day
- `"weekday"` — Monday through Friday
- `"weekend"` — Saturday and Sunday
- Specific days: `"monday"`, `"tuesday"`, etc.

### Evaluation flow

1. `evaluate_character(spec, now=None, obligations=None)` — evaluates the spec's schedule against current time, returns an evaluation object with the active block's status/availability/interruption_tolerance
2. `decide_character_response(spec, evaluation=evaluation)` — uses the evaluation to decide response behavior (response delay, verbosity adjustments, whether to respond at all)
3. `CharacterAgent.build_config(...)` — combines spec + evaluation + long-term memory profiles into a full agent config dict that the streaming runtime uses

The preview endpoint (`POST /characters/preview`) runs steps 1–2 and returns the evaluation + decision without starting a chat.

---

## 4. Long-term memory profiles

Each character has two long-term memory namespaces:

### Self profile (`character__{id}__self`)

The character's self-knowledge — personality traits, preferences, context about themselves.

```python
{
  "core_identity": "22岁，互联网公司 HR，INFP",
  "work_context": "白天被琐事打断...",
  "likes": ["cats", "观察人"],
  "public_social_style": "刚认识时短句、克制",
  "familiar_social_style": "熟了以后更会聊...",
  "tone_default": "默认简体中文，口语化",
}
```

### Relationship profile (`character__{id}__rel__{human_id}`)

The character's knowledge about their relationship with a specific human.

```python
{
  "familiarity_stage": "stranger",
  "current_warmth": "low",
  "initial_attitude": "对 user 没有特别感觉",
  "warmup_rule": "通过持续、自然、尊重边界的互动逐渐升温",
  "later_topics": ["情绪", "关系", "拉扯感"],
}
```

### Profile seeding

Builtin characters can have seed profiles defined in `character_defaults.py`. The function `get_builtin_character_profile_seeds(character_id)` returns `{ self_profile, relationship_profile }`.

Profiles are seeded once: `_seed_long_term_profile_if_missing()` only writes if the profile file does not already exist. This means user-modified profiles are never overwritten by seeds.

---

## 5. Builtin character seeding

Builtin characters are auto-seeded into the registry on first load via `_ensure_default_characters()`.

- `DEFAULT_CHARACTER_SEED_VERSION` in `character_defaults.py` controls when re-seeding happens
- When `seed_version` in registry < `DEFAULT_CHARACTER_SEED_VERSION`, all builtins are re-seeded
- Re-seeding merges: new spec fields and metadata keys are added, but existing user-modified fields are preserved
- `list_builtin_characters()` returns the full list of builtin character payloads

### Seed folder layout

Builtin character data lives in `miso_runtime/server/character_seeds/`, one subfolder per character:

```
miso_runtime/server/character_seeds/
└── nico/
    ├── spec.json                  # CharacterSpec dict (required)
    ├── self_profile.json          # self-knowledge seed (optional)
    └── relationship_profile.json  # default relationship seed (optional)
```

`character_defaults.py` scans this directory at import time. Each subfolder name is the character id. Only `spec.json` is required — the profile files are optional.

### To add a new builtin character:

1. Create a folder `miso_runtime/server/character_seeds/<character_id>/`
2. Add `spec.json` (follow `nico/spec.json` as template)
3. Optionally add `self_profile.json` and `relationship_profile.json`
4. Bump `DEFAULT_CHARACTER_SEED_VERSION` in `character_defaults.py`

No code changes to `character_defaults.py` are needed — new folders are picked up automatically.

---

## 6. API endpoints

All endpoints are in `miso_runtime/server/routes.py`, prefixed with the API blueprint.

### `GET /characters`

Lists all characters (seeded + user-created), sorted by `updated_at` desc.

Response: `{ characters: [...], count: number }`

### `GET /characters/<character_id>`

Returns a single character's public record, or 404.

### `POST /characters`

Creates or updates a character. Payload is a CharacterSpec dict + optional `avatar` (base64 data URL) + optional `remove_avatar: true`.

- If `id` matches an existing character, updates (merges)
- If `id` is new, creates
- Returns the public record

### `DELETE /characters/<character_id>`

Deletes a character and all associated data:
- Removes avatar file
- Deletes all owned short-term session memory
- Deletes self and relationship long-term memory namespaces
- Removes from registry

Returns: `{ ok: true, character_id, deleted_sessions, deleted_namespaces }`

### `POST /characters/preview`

Previews the schedule evaluation and response decision for a character without starting a chat.

Payload: `{ character_id, now?: number, obligations?: object }`

Returns: `{ character, evaluation, decision }`

### `POST /characters/build`

Builds the full agent config for a character chat session.

Payload: `{ character_id, thread_id?, human_id? }`

Returns a config dict containing: system prompt, memory namespaces, session id, evaluation, decision, and optionally `default_model`.

### `POST /characters/<character_id>/export`

Packs a character into a `.character` ZIP file on disk.

Payload: `{ file_path: string }` — absolute path where the archive will be written.

Returns: `{ ok: true, character_id, file_path }`

### `POST /characters/import`

Unpacks a `.character` ZIP file and creates the character in the registry.

Payload: `{ file_path: string }` — absolute path to the `.character` archive.

Returns: `{ ok: true, character: {...}, imported_id, original_id }`

If a character with the same id already exists, a new id is generated. The return includes both `imported_id` (new) and `original_id` (from archive) for UI feedback.

---

## 6.1. `.character` file format

Extension: `.character` (ZIP archive)

```
nico.character (ZIP)
├── manifest.json        # format version + metadata
├── spec.json            # CharacterSpec.to_dict()
├── self_profile.json    # character self-knowledge (optional)
└── assets/
    └── avatar.png       # original binary avatar (optional)
```

manifest.json:
```json
{
  "format": "character",
  "version": 1,
  "created_at": "2026-03-24T15:30:00+00:00",
  "generator": "pupu",
  "character_id": "nico",
  "character_name": "Nico",
  "has_avatar": true,
  "has_self_profile": true
}
```

What is NOT included:
- Relationship profiles (per-user)
- `known_human_ids` / `owned_session_ids` (per-instance)
- `avatar.absolute_path` (machine-specific)
- Short-term session memory

Frontend facade:
```js
api.miso.exportCharacter(characterId, filePath)
api.miso.importCharacter(filePath)
```

---

## 7. Frontend — opening a character chat

The renderer uses `openCharacterChat()` from `src/SERVICEs/chat_storage/chat_storage_store.js`.

```js
openCharacterChat(
  {
    character: { id, name, avatar, metadata },
    sourceModelId: "openai:gpt-4.1",  // optional, falls back to active chat's model
  },
  { source: "characters-page" }
);
```

### Behavior

1. If a chat already exists for this `characterId`, reopen it (update metadata, switch to it)
2. If no existing chat, create a new one with:
   - `kind: "character"` (distinguished from `"default"` chats)
   - `selectedToolkits: []` — toolkits are locked (empty)
   - `selectedWorkspaceIds: []` — workspace is locked (empty)
   - `threadId: "character"` (default thread id for character sessions)
   - Model resolved from: character's `metadata.default_model` → `sourceModelId` param → active chat's model
3. Returns `{ ok, error, chatId, nodeId, created, store }`
4. Error case: if no model can be resolved, returns `{ ok: false, error: "Select a model..." }`

### Character chat constraints

Character chats are intentionally restricted:
- Toolkits are always empty (no tool use)
- Workspace is always empty (no file access)
- System prompt is controlled by the character agent config (not user-editable)

---

## 8. Frontend — explorer integration

Character chats appear in the side menu explorer alongside normal chats.

- `buildExplorerFromTree()` in `chat_storage_tree.js` marks character chats with `chatKind: "character"` and `prefix_icon: undefined`
- `side_menu.js` renders character items with a custom `CharacterChatRow` component (avatar circle + name + postfix)
- Character items use `type: "file"` in the explorer data model — they are draggable and reorderable like normal chat items
- The explorer wrapper provides hover/active/pressed background states identical to normal items

---

## 9. Adding a new character — full checklist

### Backend-only (builtin)

1. Create folder `miso_runtime/server/character_seeds/<id>/`
2. Add `spec.json` (required), optionally `self_profile.json` and `relationship_profile.json`
3. Bump `DEFAULT_CHARACTER_SEED_VERSION` in `character_defaults.py`

### User-created (via API)

1. `POST /characters` with the spec payload + optional avatar data URL
2. The backend auto-generates an id from the name if not provided
3. Open the chat with `openCharacterChat({ character: savedCharacter })`

### Required spec fields

- `name` (string) — used as display name and id generation source
- `role` (string) — one-line character description
- `persona` (string) — detailed personality description for system prompt

### Recommended spec fields

- `speaking_style` — array of style descriptors
- `talkativeness` / `politeness` / `autonomy` — behavioral floats 0–1
- `timezone` + `schedule` — for time-aware availability
- `metadata.primary_language` — for UI display and language context
- `metadata.list_blurb` — short description shown in character list
- `metadata.list_tags` — tags shown in character list UI
- `metadata.default_model` — preferred model (e.g. `"openai:gpt-4.1"`)

---

## 10. Quick checks

```bash
rg -n "CharacterSpec|evaluate_character|decide_character_response|CharacterAgent" \
  miso_runtime/server/character_store.py
```

```bash
rg -n "openCharacterChat|CHARACTER_CHAT_KIND|findCharacterChatId" \
  src/SERVICEs/chat_storage/chat_storage_store.js
```

```bash
rg -n "chatKind.*character|characterAvatar|characterName" \
  src/SERVICEs/chat_storage/chat_storage_tree.js
```

```bash
rg -n "DEFAULT_CHARACTER_SEED_VERSION|list_builtin_characters|get_builtin_character_profile_seeds" \
  miso_runtime/server/character_defaults.py
```
