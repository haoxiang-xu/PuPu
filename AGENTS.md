<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **PuPu** (34975 symbols, 121363 relationships, 1146 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/PuPu/context` | Codebase overview, check index freshness |
| `gitnexus://repo/PuPu/clusters` | All functional areas |
| `gitnexus://repo/PuPu/processes` | All execution flows |
| `gitnexus://repo/PuPu/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- The section below is hand-maintained. Keep it OUTSIDE the gitnexus block so `npx gitnexus analyze` does not overwrite it. -->

## PuPu Conventions (for Codex and any agent writing code here)

These are load-bearing — violating them breaks the build or the architecture. Canonical source: `CLAUDE.md` and `.claude/CLAUDE.md`.

**Frontend (`src/`, `electron/`):**
- JavaScript only — no TypeScript, no PropTypes. Never create `.ts` / `.tsx` files.
- Inline styles only — no CSS modules, no styled-components. Theme via `isDark` from ConfigContext.
- All function components — no class components.
- Custom router `BUILTIN_COMPONENTs/mini_react/mini_router.js` for internal routing — not react-router-dom.
- React never touches `ipcRenderer`. System access goes through preload bridges (`window.unchainAPI`, `ollamaAPI`, `themeAPI`, etc.). IPC channel constants in `electron/shared/` must match both ends.
- localStorage writes go only through helpers in `src/SERVICEs/`, never directly from components.
- Overlay `zIndex` comes from `Z` in `BUILTIN_COMPONENTs/layer/z_layers.js` — never a literal — for anything portalled to `document.body` or `position: fixed`. `z_layers_guard` enforces this, but only for literals ≥1000 (`CONTENT_RAISED: 10` and `SCROLL_OVERLAY: 500` are legitimately small), so sub-1000 literals and wrong-layer choices are review's job: `Z.MODAL` where `Z.POPOVER` belongs passes the guard and is still wrong.
- Electron tests have both `.js` and `.cjs` variants — keep them in sync.

**Backend (`unchain_runtime/server/`):**
- Python Flask sidecar. Key files: `routes.py` / `route_chat.py`, `unchain_adapter.py`, `memory_factory.py`, `character_store.py`. Tests in `unchain_runtime/server/tests/`.
- Run unchain tests with its own pytest (`run_tests.sh`) — do NOT use `npx jest`. Run PuPu/JS tests with `react-scripts test`.
- After changing unchain `.py`, the sidecar must be restarted to take effect — note this in your report.

**General:**
- Run GitNexus impact analysis before editing any symbol (see the GitNexus block above). Warn on HIGH / CRITICAL.
- Match the surrounding code's style and idiom. No unrelated refactoring.
- Do NOT `git commit` — leave the dirty tree for the project owner to commit.
- The agent currently implementing a direct Release child may refine that issue's GitHub body before or during implementation. `[DRAFT]` is initial intent, not a delivery gate; this body-only authority does not permit scope, title, label, Project-field, assignee, parent/child, release-membership, defer/cancel, or closure changes. GitHub assignee alone does not establish implementation responsibility.

**Retired mechanisms:** Do not use code-owner routing, owner confirmations, Quorum/court roles, cases, hearings, proposals, rulings, handoffs, or acceptance-trial records for new work. Never invoke `.claude/skills/case`, create a new directory under `.claude/court/cases/`, or treat legacy court/agent files as authorization or a delivery gate. They are read-only history only.

**Release workflow:** Prefer the smallest matching release skill: `release-open-sprint`, `release-draft-ticket`, `release-refine-ticket`, `release-feature-audit`, or `release-close-sprint`. These skills plus the Release issue, a direct implementation plan when needed, and evidence-backed tests are the project workflow. If a skill is unavailable, proceed with the equivalent direct workflow; never fall back to a retired mechanism.

**Cross-boundary work:** Any change crossing a repository, process, provider, serialization, persistence, or durable-state boundary must follow `.claude/rules/cross-boundary-contract-gate.md`. Record `BC-###`, applicable `SEQ-###`, and `AC-###` directly in the Release issue or implementation plan, then test the exact deployed artifact pair before active rollout. No owner field, confirmation, proposal, ruling, or court record is permitted or required.
