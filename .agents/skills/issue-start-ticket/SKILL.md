---
name: issue-start-ticket
description: "Run PuPu tickets from start through user-requested close: refine, formal ticket planning, user-picked UI designs, assess weaker-model implementation and strong-model checkpoints, then implement in independent clones from dev with progress comments. Use for 开始动工、接一下、开工 with ticket URLs, formal ticket, or close for started tickets. Only on close create PRs to dev, invoke issue-feature-audit and clean up clones; version closure belongs to release-close-sprint."
---

# Issue: Start Ticket

The user supplies one or more PuPu ticket URLs. Own implementation, with GitHub
comments recording every meaningful update. Complete implementation and necessary
tests, then wait for the user's `close` instruction. This skill coordinates
delivery; it does not independently pronounce acceptance. Invoke
`issue-feature-audit` only on `close` or an explicit audit request.

Lifecycle: read → clone/research → refine if needed → **formal ticket** →
implementation with any planned checkpoints → implementation-ready → wait for
`close` → PR to dev → feature audit → safe cleanup.

## Shared contracts

- Read [board-api.md](../release-open-sprint/references/board-api.md) before
  Project operations. Discover IDs, verify membership and the direct Release
  parent, and read back mutations. A view, assignee or iteration is not membership.
- Read the clone's applicable `AGENTS.md`, `CLAUDE.md` and rules. Use GitNexus
  query/context to investigate and upstream impact before symbol edits. Report
  callers, processes and risk; warn before HIGH/CRITICAL edits and corroborate
  UNKNOWN with other evidence. Index this clone, not the original checkout.
- Apply the repository's cross-boundary contract gate where relevant, including
  both repositories' impact and BC/SEQ/AC evidence in the issue or direct plan.
  Do not revive retired court or owner-confirmation workflows.
- Start authorizes scope-preserving refinement, implementation, progress comments
  and factual Project Status updates. It does not authorize changing title,
  labels, Size, assignee, release membership or outcome-level scope.
- `close` authorizes commits and push necessary for the requested PR, the audit
  and safe removal of this workflow's clone. This is the user's specific exception
  to the generic no-commit convention, limited to these delivery changes in the
  isolated clone. Do not commit during start or alter the original checkout to
  make the PR. Never auto-merge or bypass branch protection.

## Start

1. Resolve URLs to canonical repository and issue numbers. Support ordinary
   issue URLs and Project pane URLs: decode `issue=owner|repo|N`; `itemId` is not
   the issue number. Deduplicate. Read full bodies, comments, dependencies,
   existing PRs, issue states, Project items and direct parents. Do not implicitly
   reopen closed tickets or implement a Size=Release parent as a child.
2. Post a start comment on each ticket accepted for implementation. Record scope,
   refinement assessment, dependencies and intended workspace/branch. Default to
   **one clone, branch and PR per ticket**, with dependency ordering explicit.
   Do not silently bundle tickets or assume unmerged sibling work exists on dev.
   If a dependency prevents work from dev, report it and continue independent work.
3. Create a regular independent clone of the verified `haoxiang-xu/PuPu` remote
   at `/Users/red/Desktop/GITRepo/pupu-<number>`, based on remote **dev**. Do not
   use a worktree or copy the original PuPu checkout's dirty files. Record the
   resolved base SHA and create `codex/ticket-<number>-<short-slug>` from it.
   Discover a collision-free branch name instead of overwriting a branch. If dev
   is missing, report it rather than falling back to main.
4. If the directory exists, inspect its real path, repository, branch, dirty state
   and ticket comments. Resume only if it is demonstrably this ticket's earlier
   workspace. Never overwrite, reset or delete an unrelated directory; ask for a
   destination decision if identity is ambiguous. Read instructions and prepare
   dependencies/GitNexus in the clone. Keep edits and test processes rooted there.
5. Assess refinement by substance, not just absence of `[DRAFT]`: preserved What
   & Why, researched code context, implementation path, testable acceptance,
   verification, risks and applicable boundary contracts. If missing or stale,
   load [issue-refine-ticket](../issue-refine-ticket/SKILL.md) and its required
   references; investigate, update the body within scope, and post a refinement
   comment **before implementation**. Do not redo sufficient refinement. Cloning
   and investigation may precede refinement; product edits may not. For a ticket
   without a direct Release parent, follow that skill's ordinary-issue/backlog
   decision rather than inventing membership. After saving and verifying a
   completed brief, apply the shared refinement completion rule: an eligible
   Planning delivery issue moves to Ready for Pickup; preserve any assigned or
   later Status. Apply this check even when existing refinement is sufficient.
6. Complete **formal ticket** before product implementation, following
   [references/formal-ticket.md](references/formal-ticket.md). The strong planning
   agent investigates and settles the bug fix or feature design, inventories UI
   components when applicable and obtains the user's requested design choices.
   Assess weaker-model suitability with evidence. If suitable, prepare a concrete
   implementation handoff file and checkpoint plan; otherwise retain strong-model
   implementation. Post the plan and assessment on the ticket. Refinement is the
   researched brief; formal ticket is the implementation decision and execution
   plan. Reuse good research without skipping this assessment.
7. Move a verified delivery Project item to In Progress when implementation
   begins. Implement the acceptance criteria with required impact analysis and
   boundary evidence. When delegating, enforce the handoff's bounded slices and
   strong-model checkpoints; do not give a weaker worker the entire unresolved
   ticket. Run necessary targeted tests and record failures honestly.
   Restart the sidecar after Python changes before runtime verification and note
   this in the evidence.
8. Post progress and an implementation-ready comment with resulting behavior,
   verification, remaining limitations and next step. Keep the issue open and
   In Progress. Tell the user `close` will create the PR, invoke audit and clean
   up after success. Passing development tests must not automatically trigger
   feature audit, Done, a PR or clone removal. Normal development tests remain
   required; the acceptance trigger is what waits for the user.

## Comments and resumption

Keep the durable `release-start-ticket:v1` marker unchanged; the renamed skill must resume existing ticket records.

Each meaningful update gets a new comment on its own ticket: start, completed
refinement, formal plan and delegation assessment, UI options/user choices,
implementation milestone, checkpoint result, changed plan, blocker, test result,
PR, audit result and cleanup. Do not comment on every command or unchanged poll.
Include concrete changes, evidence and next action; use English for GitHub
records and the user's language in conversation. Never include credentials.

Use a durable marker and the relevant fields; do not create a second sprint log:

~~~
<!-- release-start-ticket:v1 -->
Stage: started | refined | formal-planned | design-pending | formal-ready | checkpoint | progress | blocked | implementation-ready | pr-created | cleanup-complete
Ticket: <canonical URL>
Workspace: /Users/red/Desktop/GITRepo/pupu-<number>
Branch: codex/ticket-<number>-<slug>
Base: dev @ <SHA>
Update: <changes, evidence, remaining work and next action>
PR: <URL, when available>
~~~

Before retrying a remote mutation, read back remote state; avoid duplicate start
comments and PRs. Follow shared board failure handling if a mutation fails:
report completed/remaining steps and retain local work. An attempted call is not
success. Record progress when remote writes become possible again.

## Close — only when requested

A bare `close` applies to tickets explicitly started in this task; an explicit
subset applies only to that subset. If context cannot identify the set, ask which
tickets. Never sweep unrelated folders or open issues.

1. Re-read ticket state, comments and any existing PR. Verify the recorded clone,
   branch and changes. Finish incomplete authorized implementation/tests first,
   or report the concrete blocker. Fetch remote dev, inspect the intended diff
   and resolve relevant integration conflicts without resetting user work.
   Re-test if integration changes code.
2. Run GitNexus `detect_changes` before every delivery commit. Partial/truncated
   results must be rerun. Review only ticket changes, exclude secrets and local
   generated state, commit and push the branch, then verify the remote head SHA.
   This authorization does not cover commits in the original checkout.
3. Create a PR with **base dev** and the verified ticket branch, or reuse/update
   its existing PR. Describe the problem, resulting behavior, ticket link, tests
   and material limitations. Use a body file for multiline GitHub text. Read back
   base/head/state and post the PR URL and delivered revision on the ticket.
   Do not claim the ticket is closed merely because a PR exists.
4. Now load and invoke
   [issue-feature-audit](../issue-feature-audit/SKILL.md) on this clone's
   actual delivered diff/candidate. Follow its checks, artifact requirements,
   structured issue comment and Project transitions. Do not invent an audit PASS.
   On incomplete/failed audit, retain the clone, record findings and report what
   remains. Do not automatically waive findings or repeatedly run acceptance.
5. If audit auto-filled translations or explicitly authorized fixes changed
   candidate inputs, review them, run affected tests and graph change analysis,
   commit/push, and update PR/evidence. Obtain fresh audit evidence for the new
   candidate within this close request. A stale PASS cannot authorize cleanup.
6. After fresh PASS (or an explicitly approved waiver recorded under the audit
   skill), verify all deliverables are recoverable remotely: pushed commits, PR,
   issue comments, companion-repository changes and required audit artifacts.
   Preserve reports/artifacts outside the clone or at durable evidence links and
   verify access. A local-only path inside the clone is not preserved evidence.
7. Check that no uncommitted tracked changes, unique untracked files, unpushed
   commits or unpreserved nested-repository work remain. Known reproducible
   dependencies, caches and test temp files may be discarded; unknown user files
   may not. Confirm the real directory is exactly the recorded
   `/Users/red/Desktop/GITRepo/pupu-<number>`, is not a symlink or the original
   PuPu checkout, and belongs to this workflow. Stop only this clone's task-started
   processes, switch the shell working directory outside it, then remove the
   clone. No wildcard deletion; do not delete the remote PR branch.
8. Verify deletion, then post cleanup-complete with PR, audit and preserved
   evidence links. Report the PR and clone removal. If cleanup/final commenting
   fails, report the precise partial state without repeating destructive work.

## Ticket state after close

This requested flow ends with a PR to dev, delegated audit and clone cleanup.
It does not authorize merging or marking undelivered work Done. An open audited
PR leaves the issue open and Project Status In Review. Do not assume `Closes #N`
will close the issue when the PR merges into dev; default-branch behavior differs.

If the user later asks to finalize after merge, verify the linked PR merged into
dev and the delivered candidate has the required fresh audit/waiver, then close
the child and set Done; read both states back. Do not implicitly schedule a
monitor. Release-parent closure belongs to `release-close-sprint`.
