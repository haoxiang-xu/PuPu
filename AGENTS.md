<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **PuPu** (27098 symbols, 59146 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/PuPu/context` | Codebase overview, check index freshness |
| `gitnexus://repo/PuPu/clusters` | All functional areas |
| `gitnexus://repo/PuPu/processes` | All execution flows |
| `gitnexus://repo/PuPu/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

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
