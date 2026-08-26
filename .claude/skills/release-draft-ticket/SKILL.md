---
name: release-draft-ticket
description: "Use when the project owner dictates new PuPu work that should become a GitHub Project release sub-issue — during release-open-sprint or mid-release \"开个票\", \"draft a ticket for X\", \"把这个记到 board 上\". Opens a draft direction; the implementing agent may later refine the same issue."
---

# Release: Draft Ticket

Turn one sentence from the project owner into one outline-level GitHub issue. A draft
is a placeholder for direction, not a spec. For release work, it must become a
direct sub-issue of one open Size=Release parent in PUPU Project. Do not write a
sprint document.

**Plumbing:** follow .claude/skills/release-open-sprint/board-api.md for
preflight, dynamic IDs, labels, Project fields, and sub-issue operations.

## Target release

Resolve the target Release parent before drafting. When exactly one open parent
is in scope, use it; when none or several exist, ask the project owner. Do not add
scope to a parent in In Review unless the project owner explicitly reopens it and
returns it to In Progress.

## What a draft IS

The English issue body has exactly this shape:

~~~
> [DRAFT — intent only. The agent responsible for implementation may refine this ticket directly.]

**What & Why** — {2-4 sentences: the direction and the user value. The project owner's intent, not a solution.}

**Acceptance (outline)**
- {≤3 outcome-level bullets — what must be observably true when done}
~~~

A draft is deliberately editable. The agent actively implementing the ticket
may refine this same issue's body before or during
implementation; it does not need a separate refiner or per-edit project owner
approval while it preserves the stated outcome and release scope. GitHub
assignee alone does not establish that responsibility. See
release-refine-ticket for the recommended investigation and body shape.

The title is English. Classify the work correctly: every new user-facing
capability must carry the new feature label; bugs carry bug; other work uses
the nearest existing type label. An area label such as UI or MISO may accompany
the type label. Estimate Size as XS through XL and set Project Status=Planning.
Never use Size=Release for a delivery issue. Iterations is optional schedule
metadata and is not copied or inferred from the parent.

## Flow

1. Resolve the release parent, then frame title and body from the project owner's
   words. Ambiguous intent permits one question at most.
2. Show title, body, label, Size, and parent inline. Standalone use files after
   the project owner nods. Inside open-release Act 4, the project owner's specific scope
   call authorizes immediate filing; batch-review at the act's end.
3. Create the issue, add it to PUPU Project, set Size and Status, attach it as
   the parent's direct sub-issue, then read back both the Project item and
   parent relation.
4. Each GitHub call is non-transactional. If any step fails, STOP and report
   the exact remote state; do not claim all-or-none, create a document mirror,
   or silently reparent an existing child.

## What a draft is NOT

Do not open the codebase, run GitNexus, verify feasibility, name files, or
sketch implementation. If acceptance cannot be stated without research, write
the project owner's intent as acceptance and move on.

## Common mistakes

- Investigating code to write better acceptance; that is refine scope creep.
- Inventing a label; use the closed set or regular.
- Treating Iterations as proof that an issue belongs to a Release.
- Filing a delivery ticket without a direct Release parent.
- Polishing past four What & Why sentences or three acceptance bullets.
- Treating the initial DRAFT body as immutable or requiring a different agent
  to refine an issue that the implementation agent owns.
