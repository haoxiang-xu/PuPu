# Ticket 383 final independent verification

## Immutable inputs

Source candidate: `0eb843fe2312f0e5e4ba6edd98cb8056e9bfe40e`, tree
`4c093d73604a550e3e95ab08fd6c0686fb41336d`. The delivery checkpoint changes only
this engineering record and evidence; production, tests and imported fixtures
remain byte-identical. Their SHA256s are in `final-independent-evidence.json`.
The final reviewer binds its verdict to the resulting delivery SHA after save.

GPT-6.1 Sol planned the scoped existing-behavior fix, another GPT-6.1 Sol reviewed
the plan, GPT-6 Luna implemented it, and exactly two GPT-5.6 Sol intermediate
reviews returned CONTINUE. The one final GPT-6.1 Sol acceptance found and
independently rechecked two bounded corrections in the same acceptance stage:
- Stable-member-key expansion in the existing nested Timeline after a late
  earlier-call truncation row shifts indices; exact regression RED before/GREEN after
- Explicit `frames` and `timelineExpansionScope` grouping memo dependencies,
  removing a warning that CRA would reject under CI=true

Production scope remains only `trace_chain.js` and `trace_tool_grouping.js`.
No source correctness/scope blocker remained after independent checks.

## Independent checks

- Focused consumers: 17 suites / 152 tests PASS, exit 0 (`final-focused.log`)
- Actual pinned producer/probes: 5 suites / 19 tests PASS, exit 0, including V2/V4,
  wrong version/identity controls and the formerly failing expansion scenario
  (`final-producer-probes.log`)
- Full command: `CI=true npm run test:frontend -- --runInBand`
  - 445/447 suites passed, 5,375 tests passed, 38 failed, 5 skipped / 5,418 total
  - Exit 1 is retained, never described as all-green
  - The exact 38 failed assertion names match the independent immutable
    original-dev `0047d58d0369d5c245a3fd8021d4d97c3e3f9a35` baseline rerun
  - Only two unchanged Electron memory-vault suites fail: 37 assertions explicitly
    report secret_storage_unavailable, one expects encryptString once but gets zero
  - See `final-frontend-summary.json` and `phase2-original-dev-vault-baseline.txt`

## Build evidence

The standard-version default build child was SIGKILL, produced no artifact, and
its existing wrapper returned 0. Cause was not proven OOM; it is not a pass.
`final-default-build-child.jsonl` and `final-default-build-artifacts.json` retain it.
No build script, package version or infrastructure was changed.

Successful final command in this Linux cloud runner:

```sh
CI=true PUPU_BUILD_VERSION=0.1.12 \
PUPU_ACCEPTANCE_CHILD_LOG=/tmp/pupu-383-final-ci-build-child.jsonl \
NODE_OPTIONS='--require=/tmp/pupu-383-final-build-child-probe.cjs --max-old-space-size=1536' \
GENERATE_SOURCEMAP=false taskset -c 0 npm run build:web
```

The diagnostic preload is preserved as `final-build-child-probe.cjs`; it records
and returns the actual child result without changing build behavior. CPU/heap/
source-map flags only bound resources. Result: Compiled successfully, actual child
status 0 / signal null, wrapper 0, 34.962 seconds, index.html + 72 JS assets +
feature snapshot present. The new lint warning is gone; only existing age,
deprecation and bundle-size notices remain. See `final-ci-build.log`,
`final-ci-build-child.jsonl` and `final-ci-build-artifacts.json` for hashes.

## Pinned runtime and limits

The source revision, wheel SHA256 and manifest digest are preserved in the plan.
The final reviewer verified all 344 installed package files match the exact wheel.
Its binary is excluded from this delivery tree; a separate no-alternates clone
fetched historical remote commit `918212672dd7202f9a918325cc6458378ecd2b12` and
recovered the exact bytes/checksum. No rebuild or Unchain source change.

- The original user's intermittent session was not captured; actual legacy V2
  emitted frames establish one real failure path, while V4 controls already grouped
- Fake ModelIO, in-memory tools and captured-route source seam leave full Agent,
  live provider HTTP and production ownership integration NOT_RUN/mocked
- Browser QA NOT_RUN: cloud localhost returned ERR_BLOCKED_BY_CLIENT
- Graph FTS is unavailable; TraceChain/JSX impact remains UNKNOWN with source
  corroboration, integration HIGH inferred flows remain a warning, not all-clear
- No release qualification, feature-audit PASS, merge or deployment is implied
