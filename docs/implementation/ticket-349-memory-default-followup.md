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

## PR CI repair (2026-09-27)

The c999b721 candidate failed Release QA: nine ChatInterface tests still assumed
that the removed feature flag bypassed canonical session admission. Their fixture
now declares a server-confirmed absent canonical session, as required by the real
legacy replacement path; production admission remains unchanged. The complete
ChatInterface suite passed (165 tests).

CodeQL also traced changed durable-ID sinks to three shared Math.random sources,
a nullable outbound TLS cache return, and exception details in a durable HTTP
error. Durable IDs now use 128 bits from Web Crypto; no predictable fallback is
permitted. The TLS accessor fails closed if resolution supplies no context. HTTP
errors retain code/status/retryable, with a fixed public message. The older jsdom
test environment now uses Node's real Web Crypto, matching Chromium's capability.

- BC-353: renderer ID producers -> existing chat storage/outbox -> existing IPC
  and sidecar consumers. OPEN opaque string identity; prefixes and timestamps
  are preserved, with a 32-hex cryptographic suffix. No schema/version change;
  existing persisted IDs are not rewritten. Crypto failure aborts creation.
  AC-353: fixed 128-bit input is fully represented in chat/node/operation IDs;
  entropy failure cannot fall back; legacy node IDs are preserved; full renderer
  mutation/outbox tests verify retry/reload against existing IDs.
- SEQ-353: existing legacy ID -> reload -> create new ID -> persist/retry/resume
  keeps the stored operation identity. New random generation is only for new
  identity allocation and node-collision recovery. Reset/rollback can read both
  string formats; no migration or Unchain representation change (BC-353).
- BC-354: Flask durable-host error producer -> HTTP JSON -> renderer consumer.
  CLOSED error envelope and error keys code/message/retryable are unchanged;
  internal exception text is removed from message. HTTP status and retryability
  are preserved. AC-354: real Flask response exact-key assertions check custom
  and default errors and reject private exception text; existing route and
  interaction suites cover the same installed runtime artifact.
- BC-355: TLS factory -> httpx/urllib clients. The consumer receives a verifying
  SSLContext or an exception, never None/False. Trust-source priority and cache
  behavior remain unchanged. AC-355: missing resolver context fails closed;
  existing trust-strategy, verification and consumer-wiring tests remain green.
  No protocol or artifact identity change. Installed-app rollout remains NOT_RUN.

GitNexus was refreshed in this clone at c999b721 (43,014 nodes / 180,309 edges).
The edited helper lookups returned UNKNOWN; imports and call sites corroborated
chat/tree allocation, durable mutation operations, outbound HTTP clients and
five route error-handler callers. UNKNOWN is not evidence of unused code.

Local CI-repair results: full renderer/Electron run passed 435 suites / 5,296
tests (5 skipped). Full exact-wheel server run passed 2,606 tests and 3,597
subtests (17 skipped), with the serializer warning and one background test-thread
teardown warning after its temporary UNCHAIN_DATA_DIR was removed. The first full
renderer attempt was stopped: exposing unrelated Web Crypto APIs in global test
setup caused async migration work to stall; setup now supplies only the real
getRandomValues method needed by the new ID generator.

The 96e143c2 CodeQL rerun removed the exception disclosure and most insecure-ID
findings, but still traced one assistant-message ID source and the nullable TLS
cache to six request sites. The assistant-message fallback now uses the same
secure generator (BC-353). TLS cache absence is now represented by an empty
container; only a validated SSLContext can be stored and returned (BC-355).
Trust order and verification are unchanged. After these refinements, all 35 chat
hook suites / 499 tests and the 39 TLS/error tests plus 11 subtests passed.
Current-head CI must still certify the pushed repair before closure.
