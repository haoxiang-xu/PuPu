---
name: release-open-sprint
description: "Use when the founder opens a new PuPu version/sprint — \"开 0.1.11\", \"open the next sprint\", \"开新版本\", start-of-release planning. Runs the staged planning conversation and produces the sprint doc. Not for adding a single ticket mid-sprint (release-draft-ticket) or closing (release-close-sprint)."
---

# Release: Open Sprint (step 1)

A staged planning conversation. **Every scope call in every act belongs to the founder — you present, they decide, you execute and record.** Never batch-decide on their behalf; walk each item.

**Plumbing:** `board-api.md` in this directory (preflight first — no `project` scope, no sprint).

## Acts (in order, each ends with founder sign-off)

**Act 0 — data first.** Growth summary before any decision: run `growth-analyst` in light mode (reuse `.claude/archive/growth/` snapshots if <7 days old, else collect fresh). Report: last release's download rate and trend, stars/uniques delta, search-channel movement, notable new issues/discussions, and the current tags verdict from `topic-optimizer` history (PENDING if inside a window). One screen, business language.

**Act 1 — version number.** Propose previous +0.0.1 as default; founder confirms or overrides. This becomes the sprint value and the doc name.

**Act 2 — last sprint's unfinished.** List board items with sprint = previous version and state ≠ done (also cross-check the previous sprint doc's 收尾 section). Per item, founder picks one: 拖入本 sprint / close / 改到未来 sprint / 摘掉 sprint 值. Execute immediately, record in both docs (previous 收尾去向, new 计划 with 来源: 上版拖入).

**Act 3 — backlog sweep.** List board items with no sprint value or a postponed/backlog status. Per item: 进 (set sprint, add to 计划, 来源: 遗留) or 不进 (untouched). Don't editorialize beyond one line of context per item.

**Act 4 — keynote + new work.** Founder states the version's 基调 and dictates new items. Record the keynote verbatim-ish into the doc. For each new item invoke `release-draft-ticket` (immediate-file mode); batch-review all drafts at the act's end. Roadmap memories (e.g. prior 0.1.11 slicing decisions) may be OFFERED as reminders — never auto-imported as scope.

**Act 5 — freeze the doc.** Create `.claude/archive/sprints/v{X.Y.Z}.md` from `TEMPLATE.md`, fill 基调 + full 计划 table, read the final plan back to the founder in 5 lines or less. Done.

## Common mistakes

- Skipping Act 0 because "the founder already knows" — the point is deciding on today's numbers, not remembered ones.
- Deciding carryover dispositions yourself ("obviously continue") — present, wait, execute.
- Importing roadmap memory items into the plan without the founder saying so this session.
- Creating the doc at Act 1 — the doc freezes at Act 5, after scope is final; between acts, track state in the conversation only (no scratch files).
- Leaving Act 2 items half-executed (moved on board, not recorded in the old doc's 收尾去向).
