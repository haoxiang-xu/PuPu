---
name: release-operator
description: Operate PuPu's protected GitHub Actions release chain when the project owner asks to build, qualify, stage, publish, resume, or inspect a release candidate. Use for exact run orchestration; do not use for release scope decisions or feature audits.
---

# PuPu Release Operator

Operate the existing release workflows through the deterministic repository CLI. This skill is an operator, not a release authority.

## Authority boundary

- Read-only `plan`, `status`, and `wait` may run without extra approval.
- Immediately before every `dispatch`, state the exact phase, tag, commit/run inputs, and external effect, then obtain a fresh instruction from the project owner. Never carry approval from an earlier phase.
- Never approve a GitHub Environment, move or create a tag, close an issue, change Project state, decide GO, or select a fuzzy latest run.
- Stage creates or updates a Draft Release after protected approval. Publish makes that Draft public after a separate protected approval. Treat them as distinct mutations.
- If the Release still has code to land, stop before Stage even when candidate and qualification are green.

## Canonical CLI

Use only:

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

### Stage

Use only after release work is complete and the exact candidate/qualification pair is accepted for staging. It requires candidate and qualification run IDs plus confirmation `STAGE_DRAFT`. Stop at the GitHub Environment approval and leave that decision to the project owner.

### Publish

First inspect the Draft Release and complete the repository's release certification/close workflow. Dispatch only after a fresh publication instruction and confirmation `PUBLISH_RELEASE`. The workflow receives its own closed `PUBLISH` input and still pauses at `release-publish` approval.

## Observation and handoff

Always observe by exact phase, run ID, tag, and full tag commit:

```text
node scripts/release-qa/release-operator.mjs status --phase candidate --repo haoxiang-xu/PuPu --tag vX.Y.Z --commit <40-char-sha> --run-id <id>
```

Report:

- workflow/run URL and exact identity;
- queued, running, approval-required, passed, failed, or incomplete disposition;
- failed job names and blocking reasons;
- artifact names, IDs, sizes, and expiry state;
- candidate/qualification IDs that must be passed to the next phase.

Do not turn missing evidence into prose. Artifact checksums, candidate digest, Unchain wheel SHA-256, runtime manifest digest, and download links come from retained deterministic reports/receipts or the verified Draft Release. Optional AI may rewrite release-note prose only after those facts exist.

## Relationship to release administration

This skill does not replace `release-close-sprint`. That workflow owns direct-child roll-call, feature-audit/waiver evidence, real-app smoke, growth baseline, certification handoff, and Release issue closure. A green Actions chain is evidence, not a GO decision.

