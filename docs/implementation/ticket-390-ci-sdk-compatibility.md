# PR #48 Anthropic SDK compatibility — 2026-10-02

The first Unchain PR #48 CI run failed two new actual-SDK transport tests:
[run 37094548555](https://github.com/haoxiang-xu/unchain/actions/runs/37094548555).
It installed Anthropic 1.11.0, which requires `httpx2.Client`; the fixtures
supplied `httpx.Client`. These are different Python types even when both HTTP
packages are installed. This failure was independently reproduced in a new
isolated environment using the CI dependency installation command.

Fixing the mock transport exposed two production compatibility defects: the
adapter's `httpx.Timeout` was also rejected by the new SDK, and its tool response
DTO fills an omitted `toolset_name` with null, poisoning the next Messages
request under the strict input contract. The repair is committed in Unchain
`361c674a451c59ec0f61d34024938135e44f0717`.

## Changes and strict boundaries

- Real SDK tests select the HTTP transport from the actual SDK client's base
  class and construct the SDK's public `DefaultHttpxClient`. Existing wire,
  parallel-tool and continuation assertions remain intact.
- The production adapter converts timeout values to the installed SDK's public
  `Timeout` type. Anthropic read=120 and Hyperspace read=600 are asserted; connect,
  write and pool values remain 10/30/10. Injected clients can still run without
  the optional SDK installed. Ordinary and exact durable calls use this same
  instance value; durable SDK automatic retries remain disabled.
- New response captures strip only the known null `caller` and `toolset_name`
  defaults before semantic/replay fan-out. Non-null or unknown metadata is
  retained for the existing closed validator. A named unsupported toolset is
  rejected before the second send; signed thinking and tool effects remain
  covered. No blanket allowlist expansion or generic field stripping is used.
- No SDK downgrade, test skip, credential/profile change or live-instance
  replacement is involved. Historical frames already captured by SDK 1.11.0
  with `toolset_name: null` remain unsupported; no migration claim is made.
  The owner's accepted instance remains on the prior wheel and SDK 0.83.0.

Contracts and sequence: BC-390-12/13, SEQ-390-10 and AC-390-S01/S02 in
`ticket-390.md`. This repair does not reconcile the parallel #386 schemas.

## RED and GREEN evidence

Evidence root: `/Users/red/Desktop/GITRepo/unchain-390/.release-qa/ticket-390/ci-48-sdk-refresh`.

- Original transport RED: `/tmp/ticket390-ci-48-red.txt`, two failures matching CI.
- SDK-native timeout RED: `/tmp/ticket390-ci-48-native-timeout-red.txt`, three
  failures at real Anthropic/Hyperspace client construction.
- Known-default RED: `/tmp/ticket390-ci-48-toolset-red.txt`, null continuation
  failed while the unsupported named-toolset guard passed.
- Focused compatibility tests: **53 passed with SDK 0.83.0 and 53 passed with
  SDK 1.11.0**. Independent old-SDK review: **92 passed**, including Kimi native
  replay, exact transports and Hyperspace. No concrete regression found.
- Full latest-SDK installed-wheel Unchain: **4,036 passed, 16 skipped, 5 xfailed**,
  two expected warnings for deliberately unknown Gemini finish reasons.
  The four older OpenAI sampling failures do not occur with the CI SDK set;
  the earlier r2 report remains a historical record of that older environment.
- Full PuPu sidecar against the same installed wheel: **2,661 passed, 17 skipped,
  3,597 subtests passed**. Two pre-existing warnings remain: SDK serialization
  and a test teardown thread missing `UNCHAIN_DATA_DIR`.

CI-equivalent versions: Anthropic 1.11.0, httpx 0.28.1, httpx2 2.13.1,
OpenAI 3.24.0, google-genai 2.28.0, pytest 9.1.1, pydantic 2.13.5.
PuPu sidecar verification retains its existing 0.83.0/1.68.0/2.7.1 SDK environment.
These are explicit environment results, not a promise of arbitrary future SDK
compatibility.

GitHub CI independently passed on the repaired revision:
[run 37096205913 / Python 3.12 full suite](https://github.com/haoxiang-xu/unchain/actions/runs/37096205913/job/111126549276).
The actual CI result is **4,036 passed, 16 skipped, 5 xfailed**. Its complete log
is preserved as `github-ci-green.txt` in the evidence root.

## Exact artifact pair and delivery

- Once-built wheel: `wheels/unchain-0.2.0-py3-none-any.whl` under the evidence root.
- SHA-256: `95d9a731c119a70a0df749e13b8b6e0bef1200b7acd48ff493e245406f109b7a`.
- Actual imported manifest: `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.
- All **345 packaged files / 334 Python files** match source and installation
  byte for byte. Both full suites import that installation, not mutable sibling
  source. Artifact identity and dependency versions are saved as JSON.
- PuPu executable candidate: `2bb40b1ef4308801b527241124a35b27c17c7071`.
  Subsequent companion delivery changes are documentation only.
- Complete pre-commit Unchain GitNexus analysis: **13 changed symbols / 3 files,
  LOW**, no partial/truncated/error result. Its zero indexed affected flows is
  not evidence of no callers: upstream class analysis was MEDIUM and the real
  transport/host tests verify the dynamic paths.

AC-390-S01/S02 development and exact-wheel host verification pass. This new wheel
supersedes r2 only for the current source head's development evidence. It has not
replaced the accepted live r2 instance or inherited its manual acceptance.
Package/frozen-sidecar smoke and reconciled #386 integration acceptance remain
outstanding. Both delivery PRs remain Draft; there is no merge, closure or active
rollout approval in this result.
