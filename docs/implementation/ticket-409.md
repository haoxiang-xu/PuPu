# Ticket 409: restore Windows in-app updates

## Delivery identity

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/409
- Workspace: `/Users/red/Desktop/GITRepo/pupu-409`
- Branch: `codex/ticket-409-windows-in-app-update`
- Base: `dev@57d2c75ab310e936c588ab2abf4a0950d64abb93`
- Goal: make the exact signed Windows release installer contain the production
  updater configuration and make release qualification reject any candidate that
  loses or changes it.

## Investigation and decision

PuPu's packaged Windows runtime already enables `electron-updater`. The failure
is in artifact production: the Windows candidate is built with Electron Builder's
`dir` target, which omits `resources/app-update.yml`; the later
`--prepackaged` NSIS build preserves the incomplete payload. The existing
restart-update qualification injects a loopback-only config into N-1, so it tests
update mechanics while missing this production packaging defect.

The fix will keep the qualification fixture contract separate. A new production
helper will derive and enforce a closed GitHub config from `package.json`.
Production packaging will materialize it before signing. Installed-package and
restart-update qualification will validate the exact config in the final N
installation.

Strict acceptance found and repaired a metadata mismatch: the package's actual
name is `PuPu`, while the initial helper and handwritten fixture used `pupu`.
Tests now consume the real project metadata and actual Electron Builder and
NsisUpdater implementations. The cache name remains `pupu-updater`, matching
Electron Builder's normalization.

No report schema change is required: updater validation is an admission
precondition to the existing signed-artifact receipts. Failures must include the
file path and exact contract mismatch in the job log, while successful jobs
remain bound to the existing immutable candidate run, tag, commit, installer
hashes, and runtime identities.

## Scope and non-goals

Allowed edits:

- Windows release packaging/signing workflow and composite action.
- Release-QA helpers, Windows-specific calls, tests, and release documentation.
- This implementation plan.

Non-goals:

- Linux update support.
- Updater UI or runtime fallback behavior.
- Changing release manifest or qualification report schemas.
- Repairing already-installed Windows versions whose updater config is absent.

## Graph evidence and risk

- `inspectResources`: MEDIUM upstream impact, 10 known impacted symbols and the
  installed-package/restart qualification processes. Its callable-value boundary
  makes the graph a lower bound. Text search confirms all direct call sites in
  release-QA tests and installers.
- `runRestartUpdateQualification`: LOW upstream impact, one direct file caller
  plus the Windows diagnostic wrapper.
- `validateInstalledPackageQualificationReport`: LOW upstream impact, used by
  release qualification receipt builders and the runner.

Decision: do not change the shared `inspectResources` return shape or report
schemas. Apply production updater validation only at Windows call sites.

## Contracts

### BC-409-01 — production updater configuration

The producer writes `resources/app-update.yml` before signing. The consumer is
`electron-updater`. The closed schema is exactly:

```yaml
owner: haoxiang-xu
repo: PuPu
provider: github
releaseType: release
updaterCacheDirName: pupu-updater
```

Values are derived from the first `build.publish` entry and the package name,
then compared to the explicit PuPu production identity. Missing or mismatched
content fails closed. Existing mismatched content is never overwritten.

The signing action's release-candidate evidence schema requires the production
updater profile. Selecting the qualification-fixture profile with release
evidence must fail before either NSIS invocation (AC-409-03). Qualification
evidence may use production for signing checks or the loopback fixture profile
for N-1 restart tests. These are the only permitted combinations.

### BC-409-02 — final installed artifact

The producer is the signed prepackaged NSIS installer. Consumers are
installed-package qualification and restart-update qualification. Both read the
installed `resources/app-update.yml` and validate BC-409-01 while the existing
manifest and identity checks bind the artifact to the exact candidate.

### SEQ-409-01

Build unpacked N → materialize and validate production config → sign/seal payload
→ build and sign NSIS → install exact N and validate → install signed N-1 fixture
→ update through controlled loopback feed → restart as N → validate N identities
and production config → allow stage/publish.

## Ordered implementation

### Slice 1 — closed production helper

Add `production-app-update.mjs` and tests.

- Parse repository `package.json`.
- Require one GitHub publisher with the expected owner/repo/release type.
- Generate the exact Electron Builder-equivalent config and cache name.
- Write only with create-if-absent semantics.
- Validate exact keys and values on initial creation and retries.
- Print path and SHA-256 evidence without credentials.

Tests:

`node --test scripts/release-qa/production-app-update.test.mjs`

Expected: valid create/validate/retry cases pass; missing, wrong, extra-key, and
pre-existing mismatch cases fail.

### Slice 2 — production pipeline integration

Call the helper after the Windows unpacked payload is isolated and before signing.
Revalidate it inside `windows-artifact-signing` before sealing/signing and before
the prepackaged installer build.

Tests:

- Static workflow tests verify ordering and production helper invocation.
- Existing signing action tests remain green.
- Both Windows packaging entrypoints run the real-metadata producer/consumer and
  installed-admission tests before any build. A native PowerShell negative test
  rejects release evidence paired with the fixture profile before packaging.

### Slice 3 — final installer and restart gates

Validate BC-409-01 after silently installing the exact Windows candidate. In the
restart qualification, validate expected N before starting N-1 and validate the
updated/relaunched N after identity checks. Keep the N-1 loopback validator
unchanged.

Tests:

- Affected installed-package and restart qualification unit tests.
- Actual installed/restart orchestrators use the real file validator for valid,
  missing, malformed, duplicate/extra/missing-field, and wrong-identity configs.
  Failure must block launch or final receipt and retain cleanup/diagnostics.
- `npm run test:release-qa:unit`.
- Windows candidate run: exact signed installer fresh-install qualification.
- Windows candidate run: one signed N-1 → N update/relaunch qualification.

## Acceptance checkpoints

1. Contract helper tests demonstrate red-before-green behavior and closed-schema
   enforcement.
2. Static pipeline tests prove creation occurs before signing and validation
   occurs on the signed/prepackaged payload.
3. Release-QA regression suite passes without weakening the loopback fixture,
   signing, sidecar, settings, or process lifecycle assertions.
4. Windows CI is the deployment-combination gate: the exact signed EXE installs,
   launches, upgrades from signed N-1, relaunches, and retains the production
   config.

## Model suitability

**Not suitable for weaker-model delegation.** The change crosses workflow,
packaging, signing, installation, runtime configuration, and update/restart
boundaries. A superficially correct helper could recreate the existing false
positive by checking the test fixture rather than the exact production artifact.
The strong agent will implement and review the whole change.

## Known limitation

Any already-installed Windows release without `app-update.yml` cannot discover
this repair. Users need one manual installation of the first fixed release.
After that bootstrap, later fixed releases can use the in-app updater.
