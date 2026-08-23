---
name: i18n-locale-workflow
description: How to audit/fill locale gaps for the toolkit surface; my i18n scope = toolkit.* + computer_use.* namespaces only
metadata:
  type: feedback
---

My i18n surface is the `toolkit.*` and `computer_use.*` namespaces in `src/locales/*.json`. Skills keys live UNDER `toolkit.*` (`import_skills_*`, `nav_skills`, `source_skillpack`) — there is no separate skills namespace. `chat` / `dev` / `local_storage` gaps belong to other modules — leave them.

**Audit method:** flatten `en.json` to dotted keys, diff each locale's key-set against it, group missing by top-level namespace. Baseline is always en.json.

**Why (parallel-translation lesson):** When fanning out per-locale translation to subagents, their self-reported key counts are UNRELIABLE (agents claimed 122–168 keys for the same 164-key job; zh-TW self-reported 122 but the file was actually complete). Never trust the count in the agent's reply.

**How to apply:** Always validate the actual output files programmatically before merging — assert each output's key-set EXACTLY equals the source key-set (no missing, no extra), and check placeholder parity (`{count}`/`{name}`/`{date}`/`{commands}` must match the English). Merge by appending missing keys in en.json order (minimal diff); add `computer_use` as a new top-level object mirroring en.json's position. Cognates identical to English (Version, Browser, Registry, Transport, Provider, Secrets, Communication) are legitimate, not laziness.

**Running tests in an isolated worktree:** no node_modules there — symlink the main repo's `node_modules` in, and run `npx react-scripts test` (NOT raw `npx jest` — raw jest skips Babel and every suite fails to parse). Remove the symlink before commit.

Plugin detail page Information rows (Provider/Version/Category/Stars/Docs) now use `toolkit.info_*` keys (was hardcoded English through 0.1.9). Note `plugin_detail_page.js` still matches `row.k === "Provider"` against `presentation.information` — that's catalog DATA from [[boundary-curator-vs-toolkit]], not a UI label, leave it.
