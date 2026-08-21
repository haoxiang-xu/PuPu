---
name: release-feature-audit
description: "Use when a new PuPu feature finishes implementation and needs its consistency audit before its ticket is marked done — \"audit #123\", \"审计这个功能\", \"这个 feature 过一遍检查\" — or when release-close-sprint roll-call finds a new feature that was never audited. Also covers standalone i18n checks (\"漏翻了吗\", \"检查 i18n\"), which used to be the i18n-coverage skill."
---

# Release: Feature Audit

Five consistency checks against one completed feature. Run before the ticket is marked done; close-sprint roll-call treats an unaudited new feature as not-done-yet. **Scope = the feature's diff and its blast radius, not the whole repo** — except i18n, which is always a full scan (cheap, script-driven).

Findings are report-first: list violations with file:line, propose the fix, let the founder/implementer decide. Only i18n missing-key auto-fill applies changes directly (rule inherited from the old i18n-coverage skill).

## Check 1 — i18n coverage (full scan, scripts in this directory)

`en.json` is the source of truth; runtime silently falls back to English, so gaps are invisible without this.

1. `node .claude/skills/release-feature-audit/audit.mjs --root <repo-root> > /tmp/i18n-report.json` (add `--strict` only on request — noisy). Report contains per-locale `missing/orphan/placeholderMismatch` + `code.missingInEn/deadKeys/dynamicCount`.
2. Auto-fill `missing` (the ONLY auto-apply): translate each missing key's en value (preserve `{placeholder}` tokens verbatim), write flat JSON map, then `node .claude/skills/release-feature-audit/apply.mjs --root <repo-root> --locale <name> --translations /tmp/<name>.json`. Never overwrites existing values.
3. Report for confirmation: orphan/dead-key deletions, placeholder-mismatch edits, `missingInEn` bugs (raw key shows in UI), and the `dynamicCount` blind spot. Deletions/edits need explicit OK. Never commit.

## Check 2 — UI consistency (new UI only)

- **Reuse**: every new interactive element must come from `src/BUILTIN_COMPONENTs/` when a primitive exists (buttons ALWAYS builtin default form — no bare `<button>`, no transparent text-link buttons; anchored popovers use the Tooltip engine, never hand-rolled positioning). Flag hand-rolled widgets that duplicate a primitive; the original behavior source is the `mini_ui` repo if fidelity is in question.
- **Theme**: every color must survive a whole-theme switch — `isDark` from ConfigContext with BOTH branches present (a color defined for one theme only is a violation); shell/background layers use `var(--pupu-background|--pupu-sidebar|--pupu-surface)`, never bare hex (`shell_background_guard` enforces); no colors invented outside the component's palette pattern. Grep the diff for hex literals and single-branch ternaries.

## Check 3 — model features × agent builder (model-related features only)

A feature touching models/providers/effort/model-selection must be checked against the agent builder surfaces (`src/COMPONENTs/agents/` — recipe graph, node detail panel, character model bindings, subagent picker):

- Does the new capability appear where builder picks models, or is it correctly absent by design?
- Does an existing recipe/character referencing an old model value still load and run (no schema break)?
- Run `impact` upstream on the shared symbols the feature modified; if agent-builder files are in the blast radius, walk each hit.
State the verdict explicitly: `compatible / conflict found / N/A (not model-related)`.

## Check 4 — ironclad-rules static scan (feature diff only)

Grep the feature's changed files for the rules that have silent failure modes:

`<base>` = the feature's branch point (`git merge-base HEAD dev`), or — in a dirty main tree with unrelated changes — the explicit file list from the ticket/PR. Never audit unrelated dirty files.

```bash
git diff --name-only <base>  # scope
grep -n "ipcRenderer" <changed src/ files>              # renderer must use window.*API bridges
grep -n "localStorage\." <changed component files>       # only SERVICEs helpers may write
grep -n "react-router-dom\|createContext" <changed>      # mini_router only; no new providers without ConfigContext check
```

Plus: if `electron/tests/**` changed, verify the `.js`/`.cjs` twin changed too (the repo's only silently-failing test form — a missing twin means the test never runs in one harness).

## Check 5 — hollow-shell check (any feature whose value crosses the renderer boundary — consuming OR producing: panels, selectors sent with requests, persisted settings)

A rendered panel is not evidence the pipeline works — PuPu has shipped a panel whose producer emitted zero records ever, with every try/except silent. So: drive the feature once in the real running app via the `test-api` skill (real LLM, `openai:gpt-4.1`; delete probe sessions) and verify **real data reaches the UI end-to-end** — not mocks, not "the component renders". If the feature has a producer side (extension/event/log), grep persisted output for at least one real record produced by your probe. `UI renders + producer silent = FAIL`, and it's the most important failure this audit can catch.

## Output

One verdict block per check: `PASS / FAIL (violations listed) / N/A (reason)`. If invoked for a ticket, append one 变更记录 line to the sprint doc (`.claude/archive/sprints/v{X.Y.Z}.md`; skip silently if none exists): `#N audited — <5 verdicts>`. No commits, tree stays dirty. Auto-filled i18n translations are listed in the report for the founder to review in the diff.

## Common mistakes

- Auditing the whole repo for checks 2–5 — scope is the feature's diff; repo-wide sweeps drown the signal.
- Marking check 5 PASS because the UI renders with mock/dev data — only a real-app probe with real output counts.
- Treating check 3 as N/A because "it's just a provider preset" — presets surface in builder pickers; verify, then say N/A.
- Auto-applying anything beyond i18n missing-key fills.
- Running i18n scripts from the old `.claude/skills/cto/...` or `.claude/skills/i18n-coverage/...` paths — they live HERE now.
