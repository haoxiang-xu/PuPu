---
name: release-refine-ticket
description: "Use when a PuPu release sub-issue needs a researched, zero-context implementation brief — \"refine #123\" or when an implementation agent wants to expand a [DRAFT]. Optional support, not a gate: the agent implementing the ticket may refine its body directly."
---

# Release: Refine Ticket

Upgrade a draft into a brief a zero-context developer can execute. A separate
refinement handoff is optional, not a prerequisite for assignment or
implementation: `[DRAFT]` marks initial intent, not a delivery gate. Release
work must be a direct child of an open Size=Release parent in PUPU Project; do
not use a sprint document.

**Method:** apply the create-issue skill methodology to the existing issue:
read .claude/skills/create-issue/SKILL.md and follow its investigation workflow
and body structure. GitNexus query, context, and impact are required. If the
task crosses a repository, process, provider, serialization, persistence, or
durable-state boundary, also follow .claude/rules/cross-boundary-contract-gate.md.
For an existing direct Release child, use that method only for investigation and
body structure. Its confirmation-before-issue-creation steps govern creating a
new issue; they do not apply to a scope-preserving body edit by the active
implementing agent.
**Plumbing:** .claude/skills/release-open-sprint/board-api.md.

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

This is body-only authority. It does not permit changing the intended user
result, non-goals, required capability, title, labels, Size, Project Status,
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
4. Prepare the English body with the create-issue structure: What & Why; Read
   this first; Architecture at a glance; Relevant files; Suggested development
   path; How to verify done; Impact/risk. Remove the [DRAFT] marker.
5. Re-check Size from the evidence, but do not change it yourself. If you are
   actively implementing the ticket and the body preserves scope, edit the body
   directly. Otherwise show the complete proposed body and any Size concern to
   the project owner, then wait for an explicit instruction before editing.
6. Do not change the Project item or assignee as part of refinement. Assignment
   and implementation may proceed while `[DRAFT]` remains; update Status only
   through the normal workflow after a factual state change or project owner
   decision.
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
- Changing Project fields or issue relationships while refining a description.
- Treating Ready for Pickup or Assigned as proof of release membership.
- Writing a doc row instead of updating the GitHub issue and Project item.
