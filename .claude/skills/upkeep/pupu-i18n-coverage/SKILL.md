---
name: pupu-i18n-coverage
description: Use when checking PuPu's translation coverage after adding or changing UI strings, or when asked "are translations complete / 漏翻了吗 / 检查 i18n". Audits all 11 locales in src/locales against en.json (source of truth), auto-fills missing keys by translating them, and reports orphan keys, placeholder mismatches, dead keys, and t() references missing from en.json. Additions auto-apply; deletions/edits are report-only and need confirmation. Never commits.
---

# pupu-i18n-coverage

Detects and fixes i18n drift in PuPu. `en.json` is the source of truth; the runtime silently
falls back to English, so missing translations are invisible without this check.

## When to run
After a feature or change that touched UI strings, or on request. Full-scan every time.

## Mechanism (Claude does only translation; scripts do all file mutation)

### Step 1 — Audit
```bash
node .claude/skills/upkeep/pupu-i18n-coverage/audit.mjs --root <repo-root> > /tmp/i18n-report.json
```
Add `--strict` to also flag suspected-untranslated values (off by default — noisy).
Read the JSON. It contains, per locale: `missing`, `orphan`, `placeholderMismatch`; and a
`code` section: `missingInEn`, `deadKeys`, `dynamicCount`, `note`.

### Step 2 — Auto-fill missing keys (the only auto-apply action)
For each locale with a non-empty `missing` list:
1. Look up each missing key's English value in `src/locales/en.json`.
2. Translate each value into that locale's language. **Preserve every `{placeholder}` token
   verbatim** — do not translate or reorder the token names.
3. Write a flat JSON map `{ "key.path": "translated value", ... }` to a temp file.
4. Apply it:
   ```bash
   node .claude/skills/upkeep/pupu-i18n-coverage/apply.mjs --root <repo-root> --locale <name> --translations /tmp/<name>.json
   ```
`apply.mjs` inserts each key in en order and never overwrites existing values.

### Step 3 — Report (do NOT act without confirmation)
Summarize for the owner:
- **Auto-filled:** per locale, which keys were added and their translations (he reviews the diff).
- **Needs confirmation — deletions:** `orphan` keys (per locale) and `deadKeys` (project-wide).
  List them; delete only if he says so.
- **Needs confirmation — edits:** `placeholderMismatch` (the translation broke/changed a `{token}`).
- **Bugs to flag:** `missingInEn` — code calls `t("x")` but en.json lacks it (UI shows the raw key).
- **Blind spot:** state `dynamicCount` — that many `t(variable)` calls can't be statically
  resolved, so dead-key/missing-in-en results exclude dynamically-composed keys.

### Step 4 — Stop
Leave the working tree dirty. **Never run `git commit`** — the owner reviews and commits himself.

## Safety rules
- Additions only are automatic. Deletions (orphan/dead) and edits (placeholder) require explicit OK.
- Dead-key detection is conservative (a key counts as live if its string appears anywhere in code).
- Never overwrite an existing translation via the auto-fill path.
