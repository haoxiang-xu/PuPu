---
name: release-close-sprint
description: "Use when the project owner wraps or closes a PuPu version/release — \"关 0.1.10\", \"close the release\", \"版本收尾\". Verifies a Size=Release parent issue and its direct sub-issues in GitHub Project, records close evidence there, and hands it to release certification."
---

# Release: Close

Administrative wrap-up, not deep QA or a substitute for release certification.
The only scope is one Size=Release parent and its direct sub-issues in PUPU
Project. Do not read or update a sprint document.

**Plumbing:** follow the [shared board rules](../release-open-sprint/references/board-api.md). All
decisions, test evidence, waivers, and growth baseline live in GitHub comments
on the Release parent or relevant child issue.

## Acts

**Act 1 — resolve and roll-call.** Resolve the explicit open Release parent;
zero or multiple matches requires the project owner's choice. Keep it In Progress
while you paginate its direct sub-issues. For each child, verify both GitHub
issue state=closed and Project Status=Done. A ticket labelled new feature also
needs a fresh release-feature-audit:v2 comment naming this parent, Overall=PASS,
and a Candidate digest equal to its delivered candidate; a waiver instead needs
the full release-audit-waiver:v2 record on both child and parent. Do not accept free-text
comments as evidence. A child without a work-type label blocks the roll-call
until the project owner classifies it. Do not deep-review implementation here.

For any open child, the project owner chooses one disposition:

- Must ship: keep it attached; the Release cannot close.
- Defer: comment ticket, reason, destination, and project owner decision on the
  parent first; then remove it or attach it to a named future Release.
- Cancel: record the project owner's decision, remove the child from this Release,
  and, if requested, close it as not planned. Never use Project Status=Done to
  represent canceled work.

Never close a parent while it still owns an open child.
Only after required scope is complete may the parent move to In Review. A
must-ship child or a new must-fix child keeps or returns the parent to In
Progress before any scope change.

**Act 2 — smoke via real app.** Follow the [PuPu Test API reference](../issue-feature-audit/references/pupu-test-api.md) with a real LLM
(convention: openai:gpt-4.1, never local ollama). Cover chat lifecycle, message
send, model/toolkit switch, and one probe through every affected area. Delete
probe sessions. If Python changed, restart the sidecar before testing.

**Act 3 — Playwright on new features.** Drive the key user path once for every
child labelled new feature. Assert reachability and core interaction, not pixel
perfection.

**Act 4 — red lights.** Post every failure, repro, and disposition in a close
record comment on the parent. A must-fix bug becomes a direct child and blocks
closure; first return the parent to In Progress. A deferred or accepted-risk
bug is created as unparented backlog or a child of a named future Release only
after the project owner decides. This skill does not adjudicate GO/NO-GO.

**Act 5 — growth baseline.** Use the installed community-growth-analyst skill for a full collection into
.claude/archive/growth and post stars, previous-release downloads, 14-day
uniques, snapshot date, and links to the snapshot on the Release parent. This
is the next Release's before-picture.

**Act 6 — certification handoff and close.** Post one structured close record
on the parent: direct-child roll-call, audit/waiver decisions, smoke and
Playwright evidence, red lights, growth baseline, and certification link. The
parent remains In Review until it has this structured certification comment:

~~~
<!-- release-certification:v1 -->
Candidate digest: sha256:<64 hex>
Evidence: certification report or run link
Verdict: GO | NO-GO | INCOMPLETE | EXCEPTION
Authority: project owner or COO
Approved at: YYYY-MM-DD
~~~

Only GO, or an EXCEPTION with project owner/COO authority, permits closure. NO-GO,
INCOMPLETE, missing candidate/evidence, or an unapproved exception keeps the
parent In Review. On a passing record, close the parent GitHub issue and set
Project Status=Done; read back both states before declaring the release closed.

**Act 7 — post-publication branch handoff.** Once the release is public and all
release steps/follow-ups are complete or explicitly excepted by the owner,
follow [Final handoff in release-run-pipeline](../release-run-pipeline/SKILL.md#final-handoff--dev--main-prs-in-both-repositories):
create or reuse one `dev` → `main` PR in each of `haoxiang-xu/PuPu` and
`haoxiang-xu/unchain`. This step runs after publication, not during the
pre-publication certification handoff. Record both PR URLs, observed branch
SHAs, and pending checks/conflicts on the Release parent; record an explicit
no-diff result for a repository that needs no PR. If already administratively
closed, append the handoff evidence without rerunning Acts 1–6 or reopening
scope. Missing PRs remain an outstanding release follow-up. Do not auto-merge
or claim the branches are synchronized just because the PRs exist.

## Common mistakes

- Inferring version scope from Iterations, title, label, or a document instead
  of direct sub-issues.
- Treating any audit comment as PASS.
- Detaching an unfinished child without recording the project owner's decision.
- Closing a Release parent with open children because GitHub permits it.
- Treating a red light as a GO/NO-GO decision owned by certification.
- Using Done to hide canceled or deferred work.
