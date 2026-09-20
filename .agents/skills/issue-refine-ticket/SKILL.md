---
name: issue-refine-ticket
description: "Use when a PuPu release sub-issue needs a researched, zero-context implementation brief — \"refine #123\" or when an implementation agent wants to expand a [DRAFT]. Optional support, not a gate: the agent implementing the ticket may refine its body directly."
---

# Issue: Refine Ticket

Upgrade a draft into a brief a zero-context developer can execute. A separate
refinement handoff is optional, not a prerequisite for assignment or
implementation: `[DRAFT]` marks initial intent, not a delivery gate. Release
work must be a direct child of an open Size=Release parent in PUPU Project; do
not use a sprint document.

**Method:** apply the bundled [zero-context issue method](references/create-issue-method.md)
to the existing issue and follow its investigation workflow and body structure.
GitNexus query, context, and impact are required. If the task crosses a
repository, process, provider, serialization, persistence, or durable-state
boundary, also follow the repository's cross-boundary contract gate. For an
existing direct Release child, use that method only for investigation and body
structure. Issue creation belongs to issue-draft-ticket; this reference supplies research and body structure only.
**Plumbing:** read the [shared board rules](../release-open-sprint/references/board-api.md).

## Authority

An agent may directly edit the body of a direct Release child only while it is
actively responsible for implementing that ticket. This standing authorization
follows the implementation task, not the GitHub assignee; review, research, or
audit participation alone does not grant it.

The implementing agent may preserve the project owner's What & Why and
outcome-level scope while adding architecture context, relevant files,
implementation path, verification, risks, dependencies, BC/SEQ/AC evidence,
and delivery links. It may make the existing outline acceptance testable and
remove the `[DRAFT]` marker when the body is sufficient for the work.

Body refinement also authorizes the completion transition in step 6, without
another project owner confirmation. It does not permit changing the intended user
result, non-goals, required capability, title, labels, Size, other Project Status transitions,
Iteration, assignee, parent/child relationship, Release membership, or closure.
If evidence calls for any of those changes, report evidence and options to the
project owner and retain the current scope until they decide.

## Flow

1. Read the issue and resolve its direct Release parent. If it has no parent,
   do not present it as scheduled release work; ask the project owner whether to
   attach it, keep it as backlog, or use the ordinary issue workflow.
2. Extract the project owner's What & Why and outline acceptance. Expand that
   contract; do not reinterpret it.
3. Investigate with GitNexus flows, key symbols, upstream impact, and relevant
   docs. When the boundary gate applies, add the required BC, SEQ, and AC
   evidence to the proposed brief.
4. Prepare the English body with the zero-context brief structure: What & Why; Read
   this first; Architecture at a glance; Relevant files; Suggested development
   path; How to verify done; Impact/risk. Remove the [DRAFT] marker.
5. Re-check Size from the evidence, but do not change it yourself. If you are
   actively implementing the ticket and the body preserves scope, edit the body
   directly. Otherwise show the complete proposed body and any Size concern to
   the project owner, then wait for an explicit instruction before editing.
6. After the completed brief is saved and verified, automatically move an open
   delivery issue from Planning to Ready for Pickup when it is a direct child of
   an open Release and has no unresolved scope decision or dependency preventing
   pickup. This transition needs no separate confirmation. Read the current
   Status immediately before updating: leave Ready for Pickup unchanged and
   preserve Assigned, In Progress, In Review, or Done. If refinement is incomplete
   or pickup is blocked, retain the current Status and report the reason. Do not
   change the assignee or other Project fields. Assignment and implementation may
   still proceed while `[DRAFT]` remains; refinement is not a mandatory handoff gate.
7. Read back the edited issue, Project Status, Size, and parent relation.

## When investigation contradicts the draft

If the work is infeasible, already done, or much larger than assumed, report
evidence and options: descope, split, cancel, defer, or move to another named
Release. Do not silently reshape scope. Do not change Status, membership, or
the parent relationship while waiting; post a blocked decision comment only on
the project owner's direction. A split creates new direct children of the same
Release; dependencies express ordering, not nested release membership.

## Common mistakes

- Refining from memory or the draft alone.
- Reinterpreting project owner intent instead of expanding it.
- Requiring a separate refiner or project owner preview when the current
  implementing agent is making a scope-preserving body update.
- Leaving an eligible, completed Planning ticket out of Ready for Pickup.
- Regressing an assigned or started ticket to Ready for Pickup, or changing
  other Project fields or issue relationships during refinement.
- Treating Ready for Pickup or Assigned as proof of release membership.
- Writing a doc row instead of updating the GitHub issue and Project item.
