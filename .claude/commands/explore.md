# Explore Architecture

Explore and explain a specific part of the PuPu architecture.

## Arguments
- $ARGUMENTS: Area to explore (e.g. "streaming", "memory", "toolkit", "characters", "settings", "electron", "side-menu")

## Steps

1. Based on $ARGUMENTS, read the relevant skill doc and source files:

   | Area | Skill Doc | Key Source Files |
   |------|-----------|-----------------|
   | streaming | `chat-runtime-memory-and-trace.md` | `use_chat_stream.js`, `api.unchain.js`, `unchain_stream_client.js` |
   | memory | `chat-runtime-memory-and-trace.md` | `api.unchain.js` (injectMemoryIntoPayload), `unchain_adapter.py`, `memory_factory.py` |
   | toolkit | `toolkit-and-tool-catalog.md` | `src/COMPONENTs/toolkit/`, `unchain_adapter.py` |
   | characters | `character-system.md` | `src/SERVICEs/api.characters.test.js`, `character_store.py` |
   | settings | `create-a-new-setting-page.md` | `src/COMPONENTs/settings/` |
   | electron | `electron-ipc-runtime-boundary.md` | `electron/main/`, `electron/preload/` |
   | side-menu | `chat-tree-side-menu.md` | `src/COMPONENTs/side-menu/` |
   | system-prompt | `system-prompt-v2.md` | `api.unchain.js`, `system_prompt_sections.js` |
   | workspace | `workspace-runtime-and-selection.md` | `src/COMPONENTs/workspace/`, `unchain_adapter.py` |
   | models | `model-providers-and-ollama-library.md` | `src/COMPONENTs/settings/model_providers/` |
   | storage | `chat-storage-reference.md` | `src/SERVICEs/chat_storage.js`, `chat_storage/` |
   | api | `backend-api-facade.md` | `src/SERVICEs/api*.js` |
   | modal | `modal-standard.md` | `src/BUILTIN_COMPONENTs/modal/` |

2. Read the skill doc first for context
3. Read the key source files
4. Explain with:
   - Data flow diagram
   - Key components/functions and their responsibilities
   - How the feature connects to other parts of the system
   - Extension points for new development
