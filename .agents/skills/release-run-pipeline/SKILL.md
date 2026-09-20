---
name: release-run-pipeline
description: Operate PuPu's protected GitHub Actions release chain when the project owner asks to build, qualify, stage, publish, resume, or inspect a release candidate. Use for exact run orchestration; do not use for release scope decisions or feature audits.
---

# PuPu Release Pipeline

Operate the existing release workflows through the deterministic repository CLI. This skill is an operator, not a release authority.

## Authority boundary

- Read-only `plan`, `status`, and `wait` may run without extra approval.
- Immediately before every `dispatch`, state the exact phase, tag, commit/run inputs, and external effect, then obtain a fresh instruction from the project owner. Never carry approval from an earlier phase.
- Never approve a GitHub Environment, move or create a tag, close an issue, change Project state, decide GO, or select a fuzzy latest run.
- Stage creates or updates a Draft Release after protected approval. Publish makes that Draft public after a separate protected approval. Treat them as distinct mutations.
- If the Release still has code to land, stop before Stage even when candidate and qualification are green.

## Canonical CLI

For pipeline plan/dispatch/status/wait, use only:

```text
node scripts/release-qa/release-operator.mjs <command> ...
```

Commands:

- `plan`: validate an exact phase/ref/input tuple without GitHub mutation.
- `dispatch`: start one confirmed workflow and return its exact run ID/URL.
- `status`: read one exact run ID and project its jobs/artifacts/blockers.
- `wait`: resume observation of one exact run ID for a bounded period; it never retries or dispatches.

The CLI defaults waits to three hours and polls every 20 seconds. Increase the timeout only when the project owner wants continued monitoring; never shorten it merely to make a long packaging job fail sooner.

## Phases

### Candidate

Plan with the immutable release tag and full 40-character Unchain revision. Dispatch only after confirmation `START_CANDIDATE`.

```text
node scripts/release-qa/release-operator.mjs plan --phase candidate --repo haoxiang-xu/PuPu --tag vX.Y.Z --unchain-ref <40-char-sha>
```

### Qualification

For ordinary releases, use `qualification` with the exact successful candidate run ID and lower stable `from-tag`. For the frozen v0.1.10 baseline only, use `bootstrap`. Confirm with `START_QUALIFICATION` or `START_BOOTSTRAP_QUALIFICATION` respectively.

When only qualification/promotion tools changed after a Candidate was sealed,
`qualification`, `stage`, and `publish` may use `--tools-tag vX.Y.Z-tools.N`.
The owner must explicitly authorize creation of that tag; this skill never
creates it implicitly. All three phases must execute the same tools tag/SHA.
Keep `--tag` equal to the original product tag and reuse the exact Candidate run.
The tools tag is internal, not a public version or a new Candidate; it is excluded
from automatic tag-push Release QA. Never use mutable `dev` as formal tools.
Formal qualification still requires four fresh-install targets and all three
restart-update targets (macOS arm64/x64 and Windows). Windows diagnostics cannot
substitute for any formal receipt. Changing tools again requires requalification.

### Stage

Use only after release work is complete and the exact candidate/qualification pair is accepted for staging. It requires candidate and qualification run IDs plus confirmation `STAGE_DRAFT`. Stop at the GitHub Environment approval and leave that decision to the project owner.

### Publish

First inspect the Draft Release and complete the repository's release certification/close workflow. Dispatch only after a fresh publication instruction and confirmation `PUBLISH_RELEASE`. The workflow receives its own closed `PUBLISH` input and still pauses at `release-publish` approval.

### Final handoff — dev → main PRs in both repositories

Every release ends with a branch-sync PR in **each** repository:
`haoxiang-xu/PuPu` and `haoxiang-xu/unchain`, always **head `dev`, base `main`**.
This is post-release housekeeping, not another Candidate or publication step.
When executing the owner's release-completion request, create these PRs after
all release steps and follow-ups are complete (or have an explicit recorded
owner exception). Verify the exact release is public, not a Draft; an overall
red Publish run can still have published successfully. Resolve remaining
follow-ups such as the README update into `dev` before taking the final branch
snapshot. A skill-edit-only request does not itself authorize opening live PRs.

Use GitHub read/create PR operations for this handoff, not pipeline dispatch:

1. Read both repositories' current `dev` and `main` SHAs and compare
   `main...dev`. Inspect commits and changed files; the current `dev` may contain
   work beyond the frozen PuPu candidate or delivered Unchain revision. Call out
   that difference in the PR body; never claim the entire branch was qualified
   merely because the release passed.
2. Look for an open PR with exactly head `dev` and base `main` in each repository.
   Reuse it instead of creating a duplicate. If there is no mergeable content
   difference, record “already synchronized / no PR needed”; do not invent a
   commit or force a branch change to manufacture a PR.
3. Otherwise create a PR titled `chore(release): sync dev to main after vX.Y.Z`.
   Include the public release and exact run/evidence links, the repository's
   observed head/base SHAs, and its diff summary. For Unchain, include the
   delivered runtime revision from the candidate evidence; do not assume its
   current `dev` equals that revision.
4. Read back both PRs' repository, head/base, state, and check/conflict status.
   Report both URLs (or the explicit no-diff result) in the final handoff and
   pass them to `release-close-sprint` for the Release parent close record.
   If one fails, retain the successful result and retry only the missing part
   after resolving its blocker; never rerun publication for this task.

Create/reuse PRs only: **do not merge, enable auto-merge, approve, bypass branch
protection, force-push, or move release tags**. Leave checks, conflicts, and
merge decisions visible to the project owner. PR creation is the handoff;
do not describe `main` as synchronized until a merge is actually verified.

## Observation and handoff

Always observe by exact phase, run ID, tag, and full tag commit:

```text
node scripts/release-qa/release-operator.mjs status --phase candidate --repo haoxiang-xu/PuPu --tag vX.Y.Z --commit <40-char-sha> --run-id <id>
```

For a separate-tools run, status/wait additionally require `--tools-tag` and
`--tools-commit`. `--tag` / `--commit` remain the product identity, not the tools
identity. State both identities in the fresh confirmation before dispatch.

Report:

- workflow/run URL and exact identity;
- queued, running, approval-required, passed, failed, or incomplete disposition;
- failed job names and blocking reasons;
- artifact names, IDs, sizes, and expiry state;
- candidate/qualification IDs that must be passed to the next phase.

Do not turn missing evidence into prose. Artifact checksums, candidate digest, Unchain wheel SHA-256, runtime manifest digest, and download links come from retained deterministic reports/receipts or the verified Draft Release. Optional AI may rewrite release-note prose only after those facts exist.

## Relationship to release administration

This skill does not replace `release-close-sprint`. That workflow owns direct-child roll-call, feature-audit/waiver evidence, real-app smoke, growth baseline, certification handoff, and Release issue closure. A green Actions chain is evidence, not a GO decision.
