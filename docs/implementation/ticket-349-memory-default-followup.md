# Memory V2 standard capability follow-up

User-approved scope (2026-09-27): remove the renderer/build experiment flag;
enable the standard desktop path by default; retain internal off/shadow/canary
and read-only recovery controls. No Unchain changes or automatic rollout to an
installed app. The prior audit applies only to its recorded candidate.

## Steps

1. Remove the flag definition and renderer gates. Ignore stale persisted flags.
   Always send the existing memory request fields and protect drafts; decide
   message mutations using the canonical session head.
2. Default Electron and Python process rollout configuration to all. Preserve
   explicit internal controls, snapshot verification, Windows capability checks,
   runtime manifest checks and ownership fences.
3. Emit flag-free build snapshots and versioned release profiles. Update release
   consumers and tests without changing historical evidence.
4. Test default/old flag/internal override paths, renderer send/resume/mutation,
   exact-wheel sidecar behavior, and build-producer/consumer compatibility.

## Boundary contracts

- BC-350: snapshot producer -> packaged Electron -> Python sidecar environment.
  VERSIONED profile v2 has exact keys schema/feature_flags/sidecar_environment;
  feature_flags is empty. Legacy v1 profile input remains accepted and projected
  into a flag-free snapshot. The existing release v1 metadata, environment keys
  and rollout fingerprint representation remain unchanged. Packaged snapshots
  must verify; invalid protocol/owner/schema remains rejected. No model or SQL
  representation changes. AC-350: empty/false legacy build flag yields all;
  explicit off/shadow/canary/read-only remains effective; unknown profile keys,
  wrong schema and tampered snapshot fail; JS producer and Python fingerprints
  agree against the installed wheel from Unchain 93e97c0 (SHA-256
  d6cbdeb02c1b75cf711631b09e5b6a417077c4636b46658136ccd893565a5bf0).
- BC-351: renderer -> IPC -> sidecar uses the existing request shape, including
  memory_v2_requested=true and the closed four-field memory_agent_config. Normal
  sends include bootstrap history; durable resumes do not. Existing internal
  request-mode compatibility is retained. AC-351: default and stale flag values
  yield identical payloads; resume, graph/character routing, and canonical rebase
  continue to enforce identity and pending-mutation fences.
- SEQ-350: fresh profile -> first/second send -> interaction/resume -> process
  restart preserves canonical history and explicit internal rollout controls.
  Old false preferences cannot bypass draft protection or canonical message
  mutation. Retry/rebase continues using existing durable receipts (BC-351).
  AC-352: renderer payload/mutation/draft suites, sidecar memory/context suites,
  and configuration rereads across a fresh process. Windows platform degradation
  is retained and tested separately. Installed application rollout is NOT_RUN
  until a new exact candidate package is rebuilt and verified.

## Impact

Repository: /Users/red/Desktop/GITRepo/pupu-349, indexed at 06c32657.
GitNexus reports CRITICAL on rollout/snapshot configuration (build scripts,
startup service and platform constraints), HIGH on draft protection, LOW on
settings and session-hook entry points. Unresolved graph lookups for the large
stream hook and Python rollout helpers were corroborated through their imports
and call sites; they are not treated as unused. No changes in the original
checkout or Unchain repository.

## Verification (local development, 2026-09-27)

- Renderer/chat/Electron broad run: 70 suites, 1,235 passed, 5 skipped, 65
  failures from six legacy/off-only fixture suites. Those fixtures now declare
  internal off or a server-confirmed absent session explicitly. All six suites
  then passed (179 tests). Final startup/default/settings rerun: 84 passed.
- Exact installed-wheel PuPu server full run: 2,601 passed, 17 skipped, 3,590
  subtests, one failure in the shadow graph fixture. It mocked shadow admission
  without configuring shadow intent; adding explicit internal shadow fixes it
  (the real graph integration rerun passed). One known serializer warning.
- JS producer -> fresh Python consumer contract: 6 tests and 7 subtests passed,
  including default, blank, off, shadow, canary, ceiling, and read-only overrides.
- Release tooling broad run: 392 passed, 5 skipped, three stale profile-path
  assertions failed. Updated the three to v2; all seven tests in those suites
  passed. Final profile contract run: 7 passed, 1 platform skip, including new
  strict v2 negative cases. Historical 0.1.10 producer coverage still passes.
- Real v2 profile generation was rejected before parser support and succeeded
  after it. Old v1 profiles remain only for compatibility/historical fixtures.
- Runtime wheel is unchanged from the final repair. No new latency claim, signed
  package, installed-app update or live provider call is claimed here. Restart
  the Python sidecar when deploying these host changes. A new candidate audit is
  required before treating the previous ticket PASS as current.
