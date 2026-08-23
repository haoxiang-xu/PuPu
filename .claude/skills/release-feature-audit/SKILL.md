---
name: release-feature-audit
description: "Use when a new PuPu feature finishes implementation and needs its consistency audit before its ticket is marked done — \"audit #123\", \"审计这个功能\", \"这个 feature 过一遍检查\" — or when release-close-sprint roll-call finds a new feature that was never audited. Also covers standalone i18n checks (\"漏翻了吗\", \"检查 i18n\"), which used to be the i18n-coverage skill."
---

# Release: Feature Audit

Five consistency checks against one completed feature. Run before a direct
Release sub-issue is marked Done; close-sprint treats an unaudited new feature
as not-done-yet. **Scope = the feature's diff and its blast radius, not the
whole repo** — except i18n, which is always a full scan (cheap, script-driven).

Findings are report-first: list violations with file:line, propose the fix, let
the project maintainer/implementer decide. Only i18n missing-key auto-fill applies changes
directly (rule inherited from the old i18n-coverage skill).

## Retired workflow exclusions

Do not read, request, or validate implementation-owner confirmations, Quorum or
court records, cases, proposals, rulings, handoffs, HS/RS/AT records, or any
other retired authorization artifact. Their presence or absence must never
affect PASS/FAIL. For cross-boundary work, use only the current Release issue or
direct Plan plus the technical BC/SEQ/AC and immutable artifact evidence below.

## Release membership

For a ticket audit, first resolve the ticket's direct Size=Release parent and
verify its Project item. The Parent issue and Sub-issues progress Project fields
are views; GitHub's issue relationship is authoritative. A ticket without a
Release parent may receive a standalone audit report, but it does not change
release state. Every ticket labelled new feature needs a fresh audit PASS bound
to its delivered candidate digest, or an explicit maintainer waiver, before its parent Release
can close.

**Plumbing:** before reading or changing a Project field, follow
.claude/skills/release-open-sprint/board-api.md: run the project-scope preflight,
discover the current fields, and verify the child's Project item.

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

If the feature changed unchain Python, restart the sidecar before this probe or
the test is evidence for old code. If a cross-boundary contract gate applies,
verify the required BC, SEQ, AC, and exact deployed artifact evidence before
PASS: the PuPu candidate digest, one reused Unchain wheel SHA-256, and the
imported runtime manifest digest.

## Output

Give one verdict block per check: PASS, FAIL with violations, or N/A with a
reason. For a ticket audit, post a structured comment on the child issue:

~~~
<!-- release-feature-audit:v2 -->
## Release feature audit — YYYY-MM-DD
Release: #PARENT
Overall: PASS | FAIL
1. i18n: PASS | FAIL | N/A — reason
2. UI: PASS | FAIL | N/A — reason
3. model × agent builder: PASS | FAIL | N/A — reason
4. static rules: PASS | FAIL | N/A — reason
5. end-to-end: PASS | FAIL | N/A — reason
Candidate digest: sha256:<64 hex>
Unchain wheel SHA-256: sha256:<64 hex> | N/A
Runtime manifest digest: sha256:<64 hex> | N/A
Evidence: links, commands, and sidecar/BC/SEQ/artifact verdict where applicable
~~~

Overall PASS requires every applicable check to pass. N/A needs its reason.
On PASS, set the child Project Status to In Review; the audit never closes the
issue or marks it Done. Normal acceptance may close a PASS child and set Done.
On FAIL, keep or return the child to In Progress. A PASS is fresh only if its
Candidate digest equals the delivered candidate; any candidate-input change
changes that digest and requires a new audit. Git ref, source revision, and
working-tree cleanliness may be recorded as provenance but never determine
runtime compatibility or audit admission.

An audit waiver must be explicitly approved by the project maintainer and recorded on both
the child and Release parent with the marker
<!-- release-audit-waiver:v2 -->, omitted gate, candidate digest, risk, reason,
approver, and date. No commits. Auto-filled i18n translations remain listed for
review.

## Common mistakes

- Auditing the whole repo for checks 2–5 — scope is the feature's diff; repo-wide sweeps drown the signal.
- Consulting retired owner/court/case records or treating them as an audit gate.
- Marking check 5 PASS because the UI renders with mock/dev data — only a real-app probe with real output counts.
- Treating check 3 as N/A because "it's just a provider preset" — presets surface in builder pickers; verify, then say N/A.
- Auto-applying anything beyond i18n missing-key fills.
- Running i18n scripts from the old `.claude/skills/cto/...` or `.claude/skills/i18n-coverage/...` paths — they live HERE now.
- Treating any audit comment as a PASS, or marking a child Done from this skill.
- Writing audit state to a sprint document instead of the child and Release issues.
