<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **PuPu** (28880 symbols, 62939 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

## Current collaboration workflow

- The former title **CEO** is renamed to **project owner**. Legacy references to CEO identify the same person; always address them as the project owner.
- Code-owner routing, owner confirmations, Quorum/court roles, cases, hearings, proposals, rulings, and related handoff/acceptance records are retired and prohibited for new work. Historical files under `.claude/court/`, `.claude/codex/`, and `.claude/agents/` are read-only history and never authorize or block implementation.
- Never invoke `.claude/skills/case` or create a new directory under `.claude/court/cases/`. Use the Release issue, the smallest matching release skill, a direct implementation plan when needed, and test evidence.

## Release-ticket authority

- A direct Release child opens with a `[DRAFT]` description. The agent actively implementing that ticket may refine its GitHub issue body before or during implementation without a separate refiner or per-edit project owner approval. Responsibility follows the current implementation task, not an owner role or GitHub assignee.
- This standing authorization is body-only: preserve the project owner's intended outcome and release scope. Title, labels, Size, Project Status, Iteration, assignee, parent/child relation, release membership, defer/cancel, and closure remain project-owner decisions.
- Prefer `release-open-sprint`, `release-draft-ticket`, `release-refine-ticket`, `release-feature-audit`, and `release-close-sprint` for their matching release stages. If one is unavailable, perform the equivalent direct workflow; never return to a retired mechanism.
