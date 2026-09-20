# Release qualification tooling provenance — investigation and decision

Status: **option 1 implemented locally; hosted qualification NOT_RUN**. Preserve
all three restart targets. No release tag, Environment policy or public Release
change is authorized by this implementation step.

## Verified identities

- Product: `v0.1.11`, commit `f6b654a6d87857cfc54a2712ae7f7bb1796c683a`.
- Retained Candidate: Actions run `35299965095`.
- Candidate manifest digest:
  `sha256:1ce8c288f921008a43d3ebebc19ec06746440df22bf5337d01fcd5b746594656`.
- Successful Windows diagnostic: Actions run `35385904293`, tools from
  `20fa9b4489a30ff7bb1a6b4d80a92f83f6931c9e`.
- Its report is explicitly `diagnostic_only: true`; it is not a promotion receipt.
- Working branch: `codex/qualification-tools-provenance`, based on that tools SHA.

## Two independent blockers established before this patch

### 1. Product and release tools are currently coupled

`release-qualification.yml` checks out `inputs.release_tag` and requires its
workflow SHA to equal the product commit. The retained product tag therefore does
not pick up the diagnostic's fixes. Merely checking out `dev` in qualification
would not solve promotion: `release-stage.yml` and `release-publish.yml` also
require their dispatch and the qualification run to match the product tag/SHA.

Implemented solution: freeze a separate, release-specific tools
tag, such as `v0.1.11-tools.1`, and run Qualification, Stage and Publish from the
same tools SHA. Product tag, Candidate run, manifest and installer bytes stay
unchanged. This tag is not a new public product version or a GitHub Release.

Existing `release-signing` permits `v*` tags and retains required review;
`release-stage` and `release-publish` retain required review. No Environment or
Azure permission changes are proposed. Tool tag creation still needs explicit
instruction. This patch excludes `v*-tools.*` from automatic tag-push Release QA.

### 2. The formal receipt requires reports no job produces

- `RESTART_UPDATE_TARGET_IDS` in `restart-update-qualification.mjs` requires
  `macos-arm64`, `macos-x64`, and `windows-x64`.
- `buildReleaseUpdateQualificationReceipt` rejects any missing target.
- `release-qualification.yml` calls a Windows restart-update job only.
- Its four-target matrix runs fresh installation tests, not restart-upgrade
  tests, and uploads only `installed-package-qualification.json`.
- No macOS restart-update reusable workflow is currently present.

Thus even successful Windows upgrade plus all four fresh-install targets cannot
produce the current complete formal receipt. This is a deterministic missing
producer, not a timeout or transient external-service problem. Do not rerun the
same chain expecting it to fix itself.

## Required decision

1. **Preserve the current acceptance contract (recommended):** implement actual
   macOS arm64/x64 restart-update producer jobs, then qualify all required targets.
   This adds real implementation and hosted signing/test work, not only a retry.
2. **Explicitly change this release's acceptance scope:** four fresh-install
   targets plus Windows restart-upgrade; record macOS restart-upgrade as not
   verified and deferred. This requires an explicit scope decision and a
   versioned, accurately named receipt consumed by Stage and Publish. Never
   delete macOS targets from the existing contract or relabel fresh installs as
   upgrade tests merely to turn the pipeline green.

The user selected option 1. No new ticket or release membership change is needed.

## Implementation contract after the decision

### BC-001 — operator to Actions execution identity (CLOSED)

Producer: release-operator plan/dispatch. Consumer: workflow preflight and shared
qualification jobs. Transport: workflow ref, inputs and GitHub execution context.
Separate the product `{tag, commit, candidate_run_id}` from tools `{tag, commit}`.
Tools tag must belong to the exact stable product version and resolve to the
actual executing full SHA. Reject branches, cross-version tags, malformed refs,
unknown operator fields and mismatched checkout SHA. Legacy product-tag execution
may remain supported, with equal product/tools SHA. No mutable `dev` fallback.

AC-001: closed positive/negative operator projection and dispatch tests, including
wrong version, wrong phase and tampered saved plan. AC-002: workflow checkout and
runtime identity guards, including bootstrap/RC legacy compatibility.

### BC-002 — reports to formal receipt (VERSIONED)

Producers: fresh-install and real restart-upgrade jobs in one formal run.
Consumer: strict receipt builder/validator. Transport: retained Actions artifacts.
Introduce an explicit versioned tools identity if product/tools SHA differ;
retain candidate run, digest, exact fixture source and approved target sets.
Closed fields and fail-closed unknown schema/identity/target behavior are required.
Diagnostic reports must never be admitted as formal reports by renaming them.
The target set remains all four fresh-install targets and all three restart
targets, including both macOS architectures.

AC-003: real builder output through strict consumer; reject missing reports,
unknown fields, unsupported versions, wrong candidate digest, wrong tools SHA,
wrong fixture source, duplicate targets and diagnostic-only evidence. Keep
red-before-green evidence for the new schema and execution-ref behavior.

### BC-003 — receipt and Actions metadata to promotion (VERSIONED)

Producers: formal receipt and GitHub Actions run API. Consumers: Stage and Publish.
The expected tools identity comes from the independently selected executing
workflow, not solely from self-reported receipt fields. Verify qualification
run ID, successful completion, workflow path, event, tools tag and SHA against
that identity. Candidate provenance remains bound to product tag/SHA. Existing
legacy receipts remain exact-product-bound; no fallback from a failed new schema.
Stage still uploads only verified candidate bytes; Publish re-downloads and
re-verifies them and retains separate protected approval.

AC-004: positive producer-to-promotion contract and negative moved-tag,
wrong-run/workflow/SHA, diagnostic, legacy-downgrade and missing-target tests.
AC-005: retain signing evidence, QA evidence, candidate manifest, installer and
bundled Unchain hashes. Validate downstream README verifier compatibility too.

### SEQ-001 — preserved Candidate through retry and promotion

Identity: exact Candidate run + product commit + manifest digest + tools tag/SHA.
Start with retained immutable Candidate; freeze reviewed tools; dispatch formal
Qualification; independently inspect complete evidence; separately approve Stage;
inspect Draft; separately approve Publish. A tools change invalidates the old
qualification/tools pairing and requires qualification again, not an automatic
Candidate rebuild. A product change invalidates the Candidate pairing and does
require a new Candidate. No run is selected by fuzzy latest. No diagnostic report
is upgraded in place. Persistence: Actions artifacts, receipt and Draft assets.
Maps to BC-001..003 and AC-001..005.

Exact hosted producer/consumer execution is **NOT_RUN / INCOMPLETE** until the
selected implementation is merged and its tools tag is explicitly created.
Local tests must not launch PuPu, installers, local models, or provider calls.
Chat/interaction/graph state matrices are N/A: this change concerns release
orchestration only; bundled runtime identity stays immutable and is verified.

## Investigation evidence

GitNexus bound to `/Users/red/Desktop/GITRepo/PuPu`, rebuilt for `20fa9b4`.
`validateReleaseUpdateQualificationReceipt`: 8 upstream nodes, direct consumers
are `buildReleaseUpdateQualificationReceipt` and `validateQualificationReceipt`;
graph reports LOW. Builder: one top-level CLI consumer, graph reports LOW.
Workflow cross-process consumers were additionally inspected in source; zero
reported graph processes is not evidence of no Actions impact.

The existing receipt tests pass and explicitly reject missing restart reports.
Read-only YAML inspection confirms only one restart producer (Windows), versus
three required restart targets. These checks establish the blocker; they are not
release acceptance or evidence that the proposed fix has been implemented.

### BC-004 — macOS N-1 fixture producer to native restart runner (CLOSED)

Use the immutable `from_tag` / `from_commit` source and its published manifest's
immutable Unchain revision, on the matching native architecture. Reproduce the
N-1 release snapshot. Build a separately signed and notarized fixture whose only
configuration deviation is the loopback `app-update.yml`. The N Candidate is
downloaded, hash-verified and never rebuilt. Fixture signing evidence has its own
schema (not release-candidate or dev-only signing qualification evidence), with
exact N-1 version, source SHA, architecture, certificate, DMG/ZIP hashes,
codesign, hardened runtime, notarization and Gatekeeper checks. Runtime consumes
the sealed fixture hash and emits the existing strict restart report.

AC-006: both macOS architecture/runner pairs are wired to actual restart jobs;
the receipt depends on both; failures preserve diagnostics and cannot pass.
AC-007: signing evidence rejects wrong source tag/version/architecture/schema;
fixture updater binding and snapshot are checked before the app is launched.
Native hosted proof remains NOT_RUN until merged and explicitly dispatched.

SEQ-002: build N-1 once on each isolated runner, verify/sign/seal, install N-1,
serve exact retained N bytes over runner loopback, request update once plus the
existing duplicate-install probe, observe old exit and N relaunch, verify exact
N hashes and retained settings, clean owned processes. Never rewrite a signed
fixture or run a local model. Failed attempts produce no passing receipt.
Relates to BC-002/004 and AC-003/006/007.

## Implementation and local acceptance — 2026-09-18

- Added `_shared-release-macos-restart-update.yml`, called for native arm64 and
  x64 runners. It builds only the immutable N-1 fixture, signs/notarizes it,
  verifies its snapshot and updater configuration, seals its DMG identity, and
  calls the real restart lifecycle runner against retained Candidate N bytes.
- Added distinct `pupu.macos-restart-fixture-signing.v1` evidence and a strict
  fixture sealing helper. Fixture signing cannot substitute for release signing.
- Added closed tools-tag/SHA validation and optional `--tools-tag` to the
  Qualification, Stage and Publish operator phases. Shared qualification jobs
  check out the frozen execution SHA; Candidate provenance still uses product
  tag/SHA/run/digest. Both macOS restart jobs are required by the receipt job.
- Added `pupu.release-update-qualification.v2`, preserving every existing target
  requirement and binding independent tools identity. Legacy v1/bootstrap
  receipts remain bound to product-tag execution. Diagnostics are not promotable.
- Stage and Publish verify the Qualification run's tools tag/SHA independently
  from Candidate provenance. README rendering checks out the same frozen tools
  separately from its `main` editing checkout and limits the resulting PR to
  `README.md`.
- Updated the canonical release-run-pipeline skill with the two-identity
  dispatch/status procedure. No new implicit tag, approval or publish authority.

Local verification:

- Red-before-green tests reproduced the missing macOS producer and absent tools
  identity support before implementation (`/tmp/pupu-toolchain-red.log`).
- Consolidated release/qualification/signing/feed/artifact regression:
  **239 tests, 236 passed, 3 platform skips, 0 failures**. Windows-only native
  tests are skipped on this Mac, not counted as native qualification.
  Log: `/tmp/pupu-tools-final-regression.log`.
- All 8 affected workflow YAML documents parsed with unique keys; 64 shell
  blocks passed syntax checks. `git diff --check` passed.
- GitNexus index refreshed with index-only analysis (no embedding/local model).
  Graph changes cover tracked and new files via a temporary Git index, without
  staging the user's work. Graph process counts do not model Actions transport;
  workflow contracts and all downstream consumers were reviewed separately.
- A read-only operator plan preserves Candidate `35299965095` and product
  `v0.1.11` while selecting example tools tag `v0.1.11-tools.1`.

This is implementation acceptance only. No PuPu process, installer, local model,
native updater or signing-provider call was launched locally. No source commit,
push, PR, tag, workflow dispatch, approval, Draft staging or publication has been
performed by this implementation step. Existing Candidate bytes and product tag
remain unchanged.

## Next execution sequence (separate owner instructions required)

1. Review/commit this patch, create its PR and merge the reviewed tools into
   `dev`. Recheck graph changes before committing if anything changes.
2. Resolve the merged full tools SHA and verify the retained Candidate and N-1
   identities/artifact availability again. With explicit authorization, create
   the unused internal tag `v0.1.11-tools.1` at that exact SHA; do not move the
   product tag or create a public Release for the tools tag.
3. Produce a fresh operator plan for formal Qualification using product
   `v0.1.11`, Candidate `35299965095`, N-1 `v0.1.10`, and the frozen tools tag.
   After `START_QUALIFICATION`, dispatch once and leave protected approvals to
   the owner. Do not rebuild Candidate or rerun Release QA solely for tooling.
4. Require all four fresh-install targets and all three real restart targets;
   inspect their exact-identity reports and the v2 receipt. Native macOS signing,
   notarization and updater behavior remain unverified until this completes.
5. Only after successful formal evidence, separately plan/confirm Stage and
   Publish using the same tools tag/SHA and the exact Qualification run ID.
   Any subsequent tools change requires new qualification; it must not reuse
   a receipt from different tools. Artifact expiry also requires a new decision.
