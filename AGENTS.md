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
- Do NOT `git commit` — leave the dirty tree for the CEO to commit.

**Mode B pilot (Codex-primary writing):** Mode B is opt-in only for `code-owner-runtime` work inside `unchain_runtime/server/`. The owner must review the diff and rerun the relevant tests before acceptance. Model-visible behavior, security-sensitive code, cross-repository Unchain core changes, `code-owner-chat-core`, and `code-owner-electron` are outside the pilot. Expert findings require explicit Chief Judge participation approval and a mandatory response, but are not vetoes. Canonical policy: `.claude/codex/hybrid-execution-policy.md`.

**Cross-boundary work:** Any change crossing a repository, process, provider, serialization, persistence, or durable-state boundary must follow `.claude/rules/cross-boundary-contract-gate.md`. A proposal must declare its `BC-###` boundary contracts and applicable `SEQ-###` state sequences, map both to `AC-###`, and test the exact deployed revision pair before active rollout.
