# Shared GitHub Project contract (all release-* skills)

## One operational record

PUPU Project is the only operational source of truth. Do not create, read, or
mirror a sprint document.

- A version is one open GitHub issue in PUPU Project with Size = Release.
- A release's scope is exactly the direct sub-issues of that parent issue.
- Before attaching a child, confirm its work-type label. A new user-facing
  capability must carry new feature; a defect carries bug; other work uses the
  nearest existing type label. An unclassified child cannot enter a Release.
- Parent issue and Sub-issues progress are derived Project fields. Change the
  GitHub issue relationship, never those fields directly.
- Iterations is an optional time-planning field. It is not release membership
  and must never be called or treated as Sprint.
- Discover Project and field IDs for every run; do not write a board-ids cache.

## Issue bodies maintained by the implementing agent

A direct Release child intentionally opens with a draft description. The agent
actively implementing that child may update its
issue body directly before or during implementation, without a separate
refinement handoff or per-edit project owner confirmation. Active responsibility
comes from the implementation task, not from the GitHub assignee; review,
research, or audit participation alone is insufficient.

The implementing agent may turn the draft into a usable brief: preserve the
project owner's What & Why and outcome-level acceptance, then add architecture
context, relevant files, implementation path, verification, risks,
dependencies, BC/SEQ/AC evidence, and delivery links. It may make existing
acceptance testable and remove the `[DRAFT]` marker.

This delegation is body-only. It does not authorize a change to the intended
user result, release scope, non-goals, required capability, title, labels,
Size, Project Status, Iteration, assignee, parent/child relationship, Release
membership, defer/cancel decision, or closure. If a refinement reveals a need
for any of those, report evidence and options to the project owner and wait for
their decision.

## Preflight

~~~bash
gh auth status 2>&1 | grep -q "'project'"
~~~

If project scope is missing, tell the project owner to run
! gh auth refresh -s project, then STOP. Never proceed degraded.

## Discover PUPU Project and fields

Do not hard-code IDs or option IDs. Find the open PUPU Project, then read its
fields, including Status, Size, and Iterations.

~~~bash
gh project list --owner haoxiang-xu --limit 30 --format json
gh project field-list PROJECT_NUMBER --owner haoxiang-xu --format json
~~~

Field-list exposes single-select options but not the Iterations titles or IDs.
Only when the project owner explicitly wants an Iterations value, discover those
options from GraphQL and select the named iteration:

~~~bash
gh api graphql -f query='query($project:ID!){node(id:$project){...on ProjectV2{fields(first:100){nodes{...on ProjectV2IterationField{id name configuration{iterations{id title startDate duration}}}}}}}}' -f project="$PROJECT_ID"
~~~

PUPU currently uses these semantics:

- Size = Release identifies a release parent. Delivery issues use XS through XL.
- Status is Planning, Ready for Pickup, Assigned, In Progress, In Review, Done.
- Release parents use Planning, In Progress, In Review, and Done; never make a
  release parent available for pickup or Assigned.
- Delivery issues may use the full Status flow from Planning through Done.

## Item and relationship operations

Create an issue, add it to Project, and retain the two distinct IDs:

~~~bash
ISSUE_URL=$(gh issue create -R haoxiang-xu/PuPu --title "..." --body-file /tmp/body.md --label "...")
ISSUE_ID=$(gh issue view "$ISSUE_URL" -R haoxiang-xu/PuPu --json id --jq .id)
ITEM_ID=$(gh project item-add PROJECT_NUMBER --owner haoxiang-xu --url "$ISSUE_URL" --format json --jq .id)
~~~

ISSUE_ID is a GitHub issue node ID; ITEM_ID is a Project item ID. Do not mix
them. Set Project fields with the discovered IDs:

~~~bash
gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID"
gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$ITERATIONS_FIELD_ID" --iteration-id "$ITERATION_ID"
~~~

Attach a delivery issue to a release using the GitHub sub-issue API:

~~~bash
gh api graphql -f query='mutation($parent:ID!,$child:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id number} subIssue{id number}}}' -f parent="$PARENT_ISSUE_ID" -f child="$CHILD_ISSUE_ID"
~~~

If the child already has a parent, STOP. Use replaceParent: true only after the
project owner explicitly decided to move that issue. Record the old parent decision
first, then use the explicit reparent mutation and read it back:

~~~bash
gh api graphql -f query='mutation($parent:ID!,$child:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$child,replaceParent:true}){issue{id number} subIssue{id number}}}' -f parent="$NEW_PARENT_ISSUE_ID" -f child="$CHILD_ISSUE_ID"
~~~

To defer a child, record the decision on the release parent first, then remove
the relationship:

~~~bash
gh api graphql -f query='mutation($parent:ID!,$child:ID!){removeSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id number} subIssue{id number}}}' -f parent="$PARENT_ISSUE_ID" -f child="$CHILD_ISSUE_ID"
~~~

After every mutation, read back the Project item and the parent's direct
sub-issues. GitHub permits a parent to close while children remain open; the
release skills must enforce the gate themselves.

Read direct children with pagination; do not use the derived Project progress
field as a close gate:

~~~bash
gh api graphql --paginate -F owner=haoxiang-xu -F repo=PuPu -F number="$RELEASE_NUMBER" -f query='query($owner:String!,$repo:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$repo){issue(number:$number){id number title state subIssues(first:100,after:$endCursor){totalCount nodes{id number title state url parent{number}} pageInfo{hasNextPage endCursor}}}}}'
gh project item-list PROJECT_NUMBER --owner haoxiang-xu --limit 500 --format json
~~~

The first command is the authoritative direct-child list. In the Project item
list, match each child and verify Status=Done before a parent can close.

## Release close gate

Do not close a Release parent until every direct child is closed and its Project
Status is Done. Each new feature also needs a fresh feature-audit PASS bound to
its delivered candidate digest, or an explicit project owner waiver. The release parent stays In
Review until release certification records GO or an authorized exception.

For a feature audit, accept only a child comment carrying the exact
release-feature-audit:v2 marker, the same Release parent, Overall=PASS, and a
Candidate digest matching the delivered candidate. For a waiver, require
the release-audit-waiver:v2 marker plus the omitted gate, candidate digest, risk,
reason, project owner approver, and date on both child and parent. Never treat free
text as audit or waiver evidence.

Done means delivered work, never canceled or deferred work. Parent closure also
requires a structured release-certification comment with an immutable candidate
tag or SHA, evidence link, GO or EXCEPTION verdict, project owner/COO authority, and date.
Missing, NO-GO, or INCOMPLETE certification keeps the parent In Review.

## Repo labels

Use only this closed label set; never create a new label. Every label carries a
description in GitHub — read it there rather than guessing from the name.

**Work type** (required, mutually exclusive; the release gate reads this):
bug, new feature, improvement, refactor, documentation.
`new feature` is the one that requires a feature audit before its release can close.

**Blocker** (optional): needs-decision, blocked.
`needs-decision` means the ticket is waiting on the project owner, not on
engineering — apply it whenever a scope, design, or content choice is what stops
work from starting.

**Contributor navigation** (optional): good first issue, help wanted, UI.

**Other**: release (version parent), Unchain (also needs changes in the unchain
repository).

## Failure handling

GitHub mutations are not transactional. On a failed remote step, STOP, report
the exact issue, Project item, field, and parent relationship state, and repair
only with the project owner's direction. Never claim all-or-none and never use a
document as a second recovery log.

Deferring removes release membership only. The project owner must also choose the
child's destination state: backlog normally becomes Planning; a future Release
gets an explicit parent and Status; Iterations is cleared or changed only by
explicit decision.

Cancellation is a separate disposition: record it, remove the child from the
Release, and never mark the Project item Done merely to make a close gate pass.
