---
name: release-open-sprint
description: "Use when the project owner opens a new PuPu version/release — \"开 0.1.11\", \"open the next release\", \"开新版本\". Creates and scopes one Size=Release parent issue in PUPU Project; all version work is its direct sub-issues. Not for adding one item mid-release (release-draft-ticket) or closing a release (release-close-sprint)."
---

# Release: Open

GitHub Project is the only operational record. A version is one open parent
issue whose Project Size is Release; its direct sub-issues are the whole release
scope. Iterations is optional scheduling, never version membership. Do not
create or maintain a sprint document.

**Plumbing:** read board-api.md in this directory first. Without project scope,
do not mutate the Project.

## Acts

Every scope call belongs to the project owner: present one item, wait for the decision,
then execute and record it on the affected GitHub issue.

**Act 0 — data first.** Run growth-analyst in light mode, reusing
.claude/archive/growth snapshots younger than seven days. Report the previous
release's download trend, stars/uniques delta, search movement, notable new
issues/discussions, and the topic-optimizer verdict. One screen, business
language.

**Act 1 — open the Release parent.** Propose the previous version +0.0.1, or
use the project owner's version. Find open Size=Release parents first; zero or several
matches requires an explicit project owner choice. For a new release, create
Release vX.Y.Z with label release, add it to PUPU Project, set Size=Release and
Status=Planning. The project owner dictates the version intent and release conditions;
write their words in the parent body without inventing a keynote. Set Iterations
only if the project owner explicitly chooses a time cadence.

**Act 2 — carryover.** List the previous Release parent's open direct
sub-issues and unparented backlog items. For each, the project owner chooses: attach
to this Release, keep backlog, close, or move to a named future Release. Before
removing or reparenting, comment the decision, reason, and destination on the
old parent; after attaching, note it on the new parent. Never infer membership
from an Iterations value, title, or label. Before attaching any legacy item,
confirm its work-type label with the project owner; a new user-facing capability must
carry new feature, and an unclassified item stays out of the Release.

**Act 3 — backlog sweep.** Present unparented open Project items one at a time.
Only items the project owner accepts become direct sub-issues of this Release.
Confirm or add the correct work-type label before attaching. Iterations may be
set separately as a scheduling choice.

**Act 4 — new work.** The project owner dictates new items. Invoke
release-draft-ticket with this Release parent as the target; it creates each
item as a direct sub-issue. Roadmap memories may be offered as reminders, never
imported as scope.

**Act 5 — freeze scope.** Read back the parent and its direct children in five
lines or fewer. After project owner confirmation, post one scope-frozen comment on
the parent and set its Project Status to In Progress. Later scope changes need
an explicit project owner decision comment and return the parent to In Progress
if it was already In Review. The implementing agent may later refine a direct
child's issue body within this frozen scope; body detail is not a scope change.

## Common mistakes

- Treating Iterations as release membership.
- Adding a child to a Release already In Review without explicitly reopening scope.
- Moving a child between parents without the project owner's decision and a comment.
- Creating a second plan in docs/sprints or mirroring Project fields elsewhere.
