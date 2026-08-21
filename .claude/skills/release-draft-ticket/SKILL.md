---
name: release-draft-ticket
description: "Use when the founder dictates new work that needs to become a PuPu board ticket fast — during release-open-sprint act 4, or mid-sprint \"开个票\", \"draft a ticket for X\", \"把这个记到 board 上\". NOT for writing implementation detail or investigating feasibility — that is release-refine-ticket."
---

# Release: Draft Ticket

Turn one sentence from the founder into one outline-level ticket on the PuPu board. **A draft is a placeholder for a direction, not a spec.** Target: under 5 minutes per ticket.

**Plumbing:** follow `.claude/skills/release-open-sprint/board-api.md` (preflight, IDs, labels, doc contract).

## What a draft IS

English issue body, exactly this shape:

```
> [DRAFT — not refined. Do not pick up for implementation without release-refine-ticket.]

**What & Why** — {2-4 sentences: the direction and the user value. The founder's intent, not a solution.}

**Acceptance (outline)**
- {≤3 outcome-level bullets — what must be observably true when done}
```

Title in English too. Then: one label from the closed set in board-api.md · Size gut-call (XS≈hours / S≈a day / M≈days / L≈a week+) · Sprint = current sprint · board Status left untouched (default) · one row appended to the sprint doc 计划 table (来源: 新开; row schema = `.claude/archive/sprints/TEMPLATE.md`).

## What a draft is NOT

Do not open the codebase, run GitNexus, verify feasibility, name files, or sketch implementation. Feasibility is unknown by design — discovering "this is impossible" is refine's or the implementer's job, not yours. If you can't state the acceptance without research, write the founder's intent as acceptance and move on.

## Flow

1. Frame title + body from the founder's words. Ambiguous intent → ask ONE question max, then write.
2. Show the draft inline (title, body, label, size). Standalone use: file after the founder nods. Inside open-sprint act 4: file immediately, batch-review at the end of the act.
3. File: `gh issue create` → add to board → set Sprint + Size → append doc row. All four or none — if a step fails, finish the remaining steps before reporting.
4. No sprint doc for the current version → STOP and tell the founder open-sprint hasn't run; only file with explicit go-ahead (then log the doc row to the newest existing doc's 变更记录).

## Common mistakes

- Investigating code "just to write better acceptance" — that's refine scope creep; a draft with naive acceptance is correct.
- Inventing a new label — the label set is closed; nearest fit or `regular`.
- Filing without the doc row — board and doc must move together.
- Polishing: >4 sentences of What & Why or >3 acceptance bullets means you're refining. Cut.
