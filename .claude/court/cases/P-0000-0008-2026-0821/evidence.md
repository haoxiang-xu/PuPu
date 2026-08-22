# W0 baseline evidence

All evidence below is content-free. It records code locations, hashes, command
outcomes and public repository-policy metadata; it contains no Vault plaintext,
token, credential or mutable release artifact.

## E-0001 | Current candidate source baseline

- **source type**: repository self-evidence
- **locator**: PuPu revision `002fb8adf71d37d06c0195ae14733936d6609c71`; the four red-target files listed below.
- **acquisition**: read-only repository inspection on 2026-08-21T17:25:00-07:00.
- **supports/refutes**: supports AC-006 and the W0-DRAFT scope in PS-001; it does not establish a packaged or installed candidate.
- **decision link**: P-0000-0008-2026-0821#PS-001, AC-006
- **stable slices**:
  - ES-001 | `scripts/build-web.cjs` | SHA-256 `1c0aa2bbac1ec4a3b4439deb5fe2809735e0197d9aeff3830c80eb0df520384d` | missing snapshot returns `normalizeFeatureFlags({})`.
  - ES-002 | `scripts/release-qa/package-sidecar-smoke.mjs` | SHA-256 `080c051e49da42b76ddfe597ad9d632082749a0feb5c33cbadc7bc3f413655df` | smoke injects `all` / `unchain` directly.
  - ES-003 | `e2e/fixtures/pupu_app.js` | SHA-256 `8e4a79f5ac6cdc3da371eeb89719160e1521f6ac9e3cef466b88a853a1ce8008` | source Electron launch from `REPO_ROOT`.
  - ES-004 | `.github/workflows/release-qa.yml` | SHA-256 `29b781623cf3beaa0463a1f8ffe84df453c0ccf48817e23d0cddf622388414b8` | final enforcement directly reads deterministic job result.
- **limitations**: source evidence is not installed-candidate evidence and cannot qualify Windows Active.
- **challenge history**: none
- **verification history**: E-0002 and E-0003 reproduce the corresponding facts.

## E-0002 | Repeatable red detector

- **source type**: repository test
- **locator**: `scripts/release-qa/windows-memory-v2-w0-red-evidence.test.mjs`, SHA-256 `06034c7f6e3f7c0763a01fcabe91e43b7fe6d09577eec0040159c8abbfac59c5`.
- **acquisition**: `node --test scripts/release-qa/windows-memory-v2-w0-red-evidence.test.mjs` at 2026-08-21T17:30:00-07:00.
- **supports/refutes**: supports AC-006 by detecting the pre-fix baseline. A passing detector means the red condition is present, not that the future qualification is green.
- **decision link**: P-0000-0008-2026-0821#PS-001, AC-006
- **observed result**: 5/5 predicates detected, exit 0.
- **stable slices**:
  - ES-001 | clean build silently falls back to default feature flags.
  - ES-002 | package smoke hard-codes Active-like `all`/`unchain` inputs without snapshot identity.
  - ES-003 | Vault decrypt occurs before the executor can reject Windows containment.
  - ES-004 | Playwright launches source Electron rather than an installed candidate.
  - ES-005 | final release enforcement directly checks only deterministic job state.
- **limitations**: static baseline detector intentionally must be replaced by positive qualification tests in an approved implementation; it neither spawns Windows children nor creates a candidate.
- **challenge history**: none
- **verification history**: included in `npm run test:release-qa:unit`, 37/37 tests passed.

## E-0003 | Existing Windows safety guards

- **source type**: repository test
- **locator**: `electron/tests/main/memory_v2_startup_readiness.test.cjs` and `electron/tests/main/memory_vault_sink_executor.test.cjs`.
- **acquisition**: exact-path Jest run at 2026-08-21T17:31:00-07:00:

  ```text
  node node_modules/.bin/jest ... --runTestsByPath \
    electron/tests/main/memory_v2_startup_readiness.test.cjs \
    electron/tests/main/memory_vault_sink_executor.test.cjs \
    --testNamePattern='Windows caps active rollout to shadow ...|fails closed on Windows before spawning ...'
  ```

- **supports/refutes**: supports the current Shadow/off rollout block and AC-007. It does not refute E-0002/ES-003: the Vault service presently decrypts before it invokes the Windows-rejecting executor.
- **decision link**: P-0000-0008-2026-0821#PS-001, AC-001, AC-006, AC-007
- **observed result**: 2 suites passed; 2 named tests passed; 34 other tests skipped by name filter.
- **stable slices**:
  - ES-001 | `memory_v2_startup_readiness` proves a Windows `all` release mode is capped to `shadow` and reports `platformActiveBlocked: true`.
  - ES-002 | `memory_vault_sink_executor` proves Windows rejects `vault_worker_containment_unavailable` and mock `spawn` has not been called.
- **limitations**: no Job Object exists and no installed candidate was exercised.
- **challenge history**: none
- **verification history**: test output is recorded above; source order in `memory_vault/service.js:1640-1647` remains the E-0002 red predicate.

## E-0004 | Live repository-gate red baseline

- **source type**: GitHub API self-evidence
- **locator**: `haoxiang-xu/PuPu` ruleset `11921569` (`main protection rule`).
- **acquisition**: `gh api repos/haoxiang-xu/PuPu/rulesets/11921569 --jq ...` at 2026-08-21T17:25:00-07:00; authentication had scopes `repo`, `workflow`, and `project`.
- **supports/refutes**: supports AC-005/AC-006: the active ruleset has no `required_status_checks` rule and includes a RepositoryRole `always` bypass. No ruleset was modified.
- **decision link**: P-0000-0008-2026-0821#PS-001, BC-003, AC-005, AC-006
- **stable slice**:

  ```json
  {
    "id": 11921569,
    "name": "main protection rule",
    "target": "branch",
    "enforcement": "active",
    "bypass_actors": [
      {"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}
    ],
    "rules": [
      {"type": "non_fast_forward"},
      {"type": "deletion"},
      {"type": "pull_request"},
      {"type": "copilot_code_review"}
    ]
  }
  ```

- **limitations**: live configuration is mutable; this is an observation, not a permanent attestation. It does not authorize a GitHub configuration change.
- **challenge history**: none
- **verification history**: `gh auth status` confirmed the active account before the read-only request.

## E-0005 | Local candidate inventory

- **source type**: local filesystem inspection
- **locator**: `unchain_runtime/dist/windows/unchain-server.exe` and `dist/**/*.exe`.
- **acquisition**: read-only `test -f` and `find` on 2026-08-21T17:25:00-07:00.
- **supports/refutes**: refutes any suggestion that this local checkout itself supplied Windows installed-candidate proof.
- **decision link**: P-0000-0008-2026-0821#PS-001, BC-002, AC-004
- **observed result**: `unchain_runtime/dist/windows/unchain-server.exe` absent; no local `dist/*.exe` inventory was found.
- **limitations**: expected for an unbuilt local checkout; this is not a release failure by itself.
- **challenge history**: none
- **verification history**: none

## E-0006 | Draft gate status

- **source type**: case procedure gate
- **locator**: `P-0000-0008-2026-0821/proposal.md`, PS-001.
- **acquisition**: `python3 -B .claude/skills/case/boundary_lint.py .claude/court/cases/P-0000-0008-2026-0821 --phase ruling` at 2026-08-21T17:33:00-07:00.
- **supports/refutes**: refutes any claim that W0-DRAFT authorizes action. The gate correctly returned 16 issues: missing exact revision pair, pending Electron/devtools handoff confirmations, and absent canonical RS.
- **decision link**: P-0000-0008-2026-0821#PS-001
- **stable slices**:
  - ES-001 | PS-001 content hash recomputed to `sha256:8d01059b9000f9dd99baa42ffffd27be65772a0a287777e2d02d1a121bb4dea8`.
  - ES-002 | PS-001 boundary object hash recomputed to `sha256:a60b1371a6387dea0829f3a6d92b55c10a0c0c4c115307b361f55affecfbde4f`.
  - ES-003 | `boundary_revision_set` and material owner confirmations are intentionally `PENDING_OWNER_INTEGRATION` / `PENDING_HANDOFF`.
- **limitations**: expected while drafting. It is a hard block on PLAN_RULING, not a reason to invent confirmation or an artifact pair.
- **challenge history**: none
- **verification history**: `git diff --check` was clean for all W0 files at capture time.
