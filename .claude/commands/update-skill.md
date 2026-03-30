# Update Skill Documentation

Update an existing skill doc in `.github/skills/` to reflect current code.

## Arguments
- $ARGUMENTS: Skill name or topic (e.g. "system-prompt-v2", "toolkit-catalog", "character-system")

## Steps

1. Find the matching skill doc in `.github/skills/`:
   ```
   backend-api-facade.md
   character-system.md
   chat-runtime-memory-and-trace.md
   chat-storage-reference.md
   chat-tree-side-menu.md
   create-a-new-setting-page.md
   electron-ipc-runtime-boundary.md
   miso-server-endpoints.md
   modal-standard.md
   model-providers-and-ollama-library.md
   project-conventions-and-build.md
   system-prompt-v2.md
   toolkit-and-tool-catalog.md
   workspace-runtime-and-selection.md
   ```

2. Read the current skill doc
3. Read the actual source code that the doc describes
4. Identify discrepancies:
   - Function signatures that changed
   - New features not documented
   - Removed features still documented
   - File paths that moved
   - New conventions not captured

5. Update the skill doc to reflect the current state
6. Keep the same structure and writing style as the original
7. Show a summary of what changed
