# Windows development Memory V2

The owner requires `npm start` to support real API tests with Memory V2 Active.
Remove packaged identity as a development prerequisite, retaining production
artifact verification, the real Windows containment probe and runtime protocol
validation. No Python or installed payload changes are planned.

## Boundary and sequence

BC-205 (CLOSED, Electron main -> sealed capability receipt): the existing
validated absolute Python/main.py worker entrypoint is the development producer.
Provenance uses exact `{arch: "x64", schema: "pupu.windows-vault-development.v1"}`;
there are no invented wheel hashes or assertions of immutable source identity.
Only `app.isPackaged === false` selects this shape. Packaged provenance remains
the existing exact v1 shape; no fallback to development after a packaged failure.
The receipt consumer requires explicit development context, an actual successful
supervisor/worker probe and a matching nonempty broker capability. Unknown keys,
versions, invalid entrypoints and failed probes fail closed (AC-205/206).

BC-206 (existing HTTP boundary, Electron -> Python sidecar): both startup paths
still validate the manifest exported by the actually imported runtime. Only
packaged launches additionally pin its digest to artifact provenance. Development
does not use Git SHA, checkout cleanliness or a release wheel as admission.
Receipt state stays in the Electron process and is not a renderer/IPC option.
The installed candidate and frozen release evidence remain unchanged. Source
development evidence is explicitly not evidence for a new release artifact.

SEQ-205: stopped -> resolve entrypoint -> provenance -> containment probe ->
executor registry -> broker -> sealed receipt -> sidecar -> protocol-ready/all.
Failure at any prerequisite cannot enable Active. Application restart reconstructs
the receipt; sidecar restart repeats readiness. Existing structural-loss latch
semantics remain terminal until application restart. Chat persistence and wire
schemas are unchanged.

## Acceptance

- AC-205: real development provenance producer -> strict receipt consumer; exact
  shape, unsupported architecture, unknown fields/version, malformed/relative
  Python entrypoint and packaged fallback rejection. Preserve packaged tamper tests.
- AC-206: startup assembly requires successful probe/broker before sidecar, and
  development runtime protocol mismatch still blocks Active. Existing packaged
  manifest mismatch and containment-loss tests remain effective.
- AC-207: launch actual development Electron/Python with a private profile; ready/all,
  two messages in the same chat and application restart followed by another message
  through a local deterministic provider. Record the runtime-reported protocol digest.
- AC-208: reopen normal development entry for owner real API testing; do not log
  credentials. A provider rejection is separate from Vault startup capability.

Second interaction, graph/subagent execution, durable retry/resume and the full
installed sink lifecycle matrix are NOT_RUN in this targeted startup repair;
their previous release qualification status is unchanged. No CP2 completion is
claimed. Evidence/results will be appended below.

## Results (2026-09-07)

The new development producer/consumer suite failed on the original implementation
(6 failures, 7 passes), then passed after repair. The final targeted run passed
75 tests across 7 Electron suites, including development startup assembly,
strict protocol rejection, packaged rejection of a sealed development receipt,
packaged artifact tampering and the existing containment-loss behavior. Existing
`.js` test twins import their `.cjs` suite; the new suite has the same wrapper.

Actual development Electron with Python passed 4 local provider requests: first
and second messages in one chat, a separate chat, and a message in the original
chat after application restart. Both startups reported Windows capability ready
and Memory V2 ready/all. The initial harness attempt incorrectly selected only
file URLs (development uses an interim data URL before CRA); it timed out before
issuing requests. Correcting that harness selection produced the passing run.

The normal `npm start` entry was then launched successfully: CRA compiled, the
renderer loaded `http://localhost:2907/#`, and the real development main process
(`node_modules/electron/dist/electron.exe .`, PID 11644 at capture) reported
ready/all with no Windows platform block. Runtime-reported protocol digest:
`sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
No real paid-provider request was sent by this repair; owner real API testing is
available in the reopened development app. The previous provider 4xx root cause
is not claimed fixed by this startup change.

Evidence under `.release-qa/`: `windows-dev-vault-red.log`,
`windows-dev-vault-tests.log`, `development-chat-HJIt4r/development-chat-v2-evidence.json`,
`probe-development-chat-v2.mjs`, `windows-dev-daily-start.log`, and
`windows-dev-daily-status.json`. No installed artifacts were rebuilt or replaced.
Code is left uncommitted for the project owner.
