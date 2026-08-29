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

## Current collaboration workflow

- The former title **CEO** is renamed to **project owner**. Legacy references to CEO identify the same person; always address them as the project owner.
- Code-owner routing, owner confirmations, Quorum/court roles, cases, hearings, proposals, rulings, and related handoff/acceptance records are retired and prohibited for new work. Historical files under `.claude/court/`, `.claude/codex/`, and `.claude/agents/` are read-only history and never authorize or block implementation.
- Never invoke `.claude/skills/case` or create a new directory under `.claude/court/cases/`. Use the Release issue, the smallest matching release skill, a direct implementation plan when needed, and test evidence.

## Release-ticket authority

- A direct Release child opens with a `[DRAFT]` description. The agent actively implementing that ticket may refine its GitHub issue body before or during implementation without a separate refiner or per-edit project owner approval. Responsibility follows the current implementation task, not an owner role or GitHub assignee.
- This standing authorization is body-only: preserve the project owner's intended outcome and release scope. Title, labels, Size, Project Status, Iteration, assignee, parent/child relation, release membership, defer/cancel, and closure remain project-owner decisions.
- Prefer `release-open-sprint`, `release-draft-ticket`, `release-refine-ticket`, `release-feature-audit`, and `release-close-sprint` for their matching release stages. If one is unavailable, perform the equivalent direct workflow; never return to a retired mechanism.
