# Pre-release Full-Test Runbook

This runbook defines PuPu's complete release-candidate test. It combines the
existing deterministic release gate, a non-paid fixed-response 20-minute agent
long run, the opt-in paid six-cell live-model matrix, platform/manual evidence,
and specialist sign-offs.

The dedicated operator is `pupu-release-full-test`「检」under the COO line.
It executes the protocol and protects the evidence. `pupu-coo` retains the
release go/no-go decision, and the CEO retains the authority to publish.

## Why this is separate from ordinary QA

`pupu-qa-tester` validates a changed feature and its end-to-end plumbing.
The full-test operator validates one frozen release candidate across every
required layer. It must not change test scope opportunistically, patch product
code during certification, combine evidence from different commits, or spend
on live models without explicit approval.

## Qualification levels

| Level | Purpose | Paid | Can support release GO? |
| --- | --- | --- | --- |
| PR/lite CI | Fast regression on every PR | No | No |
| Deterministic release | Full normal suites, build, Playwright, fixed harness tests | No | Necessary, not sufficient |
| Agent long-run | Three real app root attempts, fixed fake LLM, at least 20 minutes each | No | Necessary, not sufficient |
| MCP store acceptance | Real handshake, discovery, auth, and safe call for every user-visible available entry | External accounts may be needed | Necessary, not sufficient |
| Live-model full | Six real-provider cells, at least 20 minutes each | Yes | Necessary for full qualification |
| Platform/manual | Installer, signing, local provider, real workspace checks | Depends | Necessary where applicable |

A shortened live run is always `smoke-only`. A missing paid authorization,
credential, platform, or manual check produces `INCOMPLETE`, never an implied
pass.

## CI policy

- Pull-request CI is non-paid. It must not call
  `test:live-long-run:full`, receive live provider credentials, or set
  `PUPU_LIVE_ACKNOWLEDGE_COST`.
- `test:agent-long-run:full` is deterministic but takes at least 20 minutes;
  keep it in a manual pre-release or scheduled/nightly lane rather than the PR
  critical path.
- The paid six-cell matrix belongs only to an explicitly triggered, protected
  release workflow or a local release run with separate cost authorization.
- Forked or untrusted PRs must never receive provider credentials, even when a
  maintainer asks for extra test coverage.

## Fixed ownership

| Role | Responsibility |
| --- | --- |
| `pupu-release-full-test` | Freeze candidate, execute full protocol, preserve evidence, recommend |
| `pupu-coo` | Decide release GO/NO-GO from the evidence |
| `pupu-qa-tester` | Feature-level regression and end-to-end test strategy |
| `pupu-security-expert` | Security blocker list and sign-off |
| `pupu-llm-expert` | Model-visible behavior/eval sign-off |
| `mcp-store-curator` | MCP store entry and connectivity validation |
| Dev owners | Diagnose and fix failures; provide fresh targeted evidence |
| CEO | Authorize paid testing and any public release action |

## Candidate identity

One run certifies one immutable tuple:

```text
PuPu commit + PuPu worktree fingerprint + PuPu version
+ unchain commit + unchain worktree state
+ dependency lockfiles + test configuration
```

At the start, record for both repositories:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

The deterministic local gate records PuPu's full worktree fingerprint and
checks that it remains stable. A dirty candidate may be exercised before a
commit, but the final result is `INCOMPLETE` for release until the exact tested
contents are reproducibly committed/pinned. If either repository changes while
the protocol is running, discard the qualification and start again.

Before testing, inspect the release delta with GitNexus. HIGH or CRITICAL
impact requires an explicit warning and the relevant owner/sign-off before
execution continues.

Create one immutable evidence root before Phase 1:

```text
test-results/release-full-test/<timestamp>-<pupu-sha-or-fingerprint>/
```

Record the candidate manifest there. The current deterministic and AI-review
commands write to the fixed `.release-qa/local/` directory, so copy/snapshot
that directory into the candidate evidence root immediately after each phase
and before any rerun. Never overwrite the first failure.

## Phase 1 — non-paid deterministic release gate

Run:

```bash
npm run qa:release:deterministic
```

This currently covers:

- whitespace integrity;
- frontend Jest;
- Electron main/preload/Test API Jest;
- Python sidecar pytest;
- MCP registry validation;
- production web build and version generation;
- release-QA script tests;
- long-run harness unit tests;
- third-party notice tests;
- ordinary Playwright Electron release smoke;
- start/end PuPu worktree fingerprint equality.

Evidence is written under `.release-qa/local/`.

Stop immediately on a nonzero result and triage it. A failed assertion, build,
or verified product regression is `NO-GO`. Missing tooling/authentication,
unavailable infrastructure/platform, operator cancellation, or otherwise
missing evidence is `INCOMPLETE`. Neither may continue into paid testing.

## Phase 2 — non-paid fixed-response agent long run

Run:

```bash
npm run test:agent-long-run:full
```

This is not a long conversation made from many short runs. It launches three
chats in parallel; each chat starts exactly one root attempt and keeps that
same attempt alive for at least 20 minutes over many fixed model/tool cycles.

The full profile verifies:

- many sequential tool calls with exact parameters;
- multiple worker and delegated subagents;
- live tool-confirmation pause/resume;
- FYI and BTW control paths;
- renderer detach/reload/replay;
- simulated renderer sleep while the backend root keeps running;
- one root attempt per chat, stable run/chat lineage, ordered frames;
- clean termination and no forbidden log findings.

Reports are written under
`test-results/single-agent-long-run/<timestamp>-full/`, including:

- `agent-long-run-report.json`;
- `runner-report.json`;
- `fake-llm-audit.jsonl`;
- `mcp-audit.jsonl`.

This phase is deterministic and costs no model API money. It belongs in a
nightly/manual release gate, not the ordinary PR critical path.

## Phase 3 — independent release-delta review

After fresh deterministic evidence exists, run:

```bash
npm run qa:release:ai
```

This asks the locally authenticated Codex and Claude CLIs for independent,
read-only release reviews. Both must return `GO` for the strict review command
to pass. This is change-aware risk review, not a substitute for tests and not
evidence that the live providers were exercised.

Snapshot `.release-qa/local/` again after this command so the deterministic
report and both reviewer outputs cannot be erased by a later rerun.

## Phase 4 — real MCP store acceptance

`npm run validate:mcp` proves catalog structure and fail-closed status rules.
The paid `mcp-*` long-run cells use a deterministic fixture. Neither proves
that a user can connect to every MCP shown as available in the store.

For every registry entry whose status is `available`, obtain a current
`mcp-store-curator` report covering:

- install or remote launch;
- MCP initialize/handshake;
- `tools/list` discovery matching the advertised capabilities;
- one safe representative invocation with expected evidence;
- for OAuth entries, the real authorization start, callback, token handoff,
  and connected state;
- for credential entries, the real flow using a controlled release test
  account/credential;
- failure UI that remains actionable and does not expose a guaranteed-broken
  Connect experience.

An entry without test access or fresh evidence must be hidden or marked
non-available before release. Missing access/evidence is `INCOMPLETE`; a
user-visible launch, OAuth, handshake, discovery, or representative-call
failure is `NO-GO`. This gate applies to all `available` entries on every full
release, including Figma if and only if it is marked available.

## Phase 5 — explicit paid authorization

Do not infer authorization from available API keys, a release deadline, or a
generic “run full tests” request. The user/CEO must explicitly approve the paid
live-model matrix for the frozen candidate.

Before asking for or consuming that approval, state:

- six paid cells;
- exact models and workloads;
- at least 20 minutes per cell;
- concurrency of three, normally two waves and a little over 40 minutes;
- no automatic Playwright retries;
- failed cells are not rerun without a new, cell-specific authorization.

Accepted credential paths:

```bash
export PUPU_LIVE_OPENAI_API_KEY='...'
export PUPU_LIVE_ANTHROPIC_API_KEY='...'
```

or a mode-0600 JSON credentials file. Standard provider environment variables
are supported as fallbacks, but dedicated variables are preferred. Never paste
credentials into an agent prompt, command report, issue, or release artifact.

## Phase 6 — paid six-cell live-model matrix

Run exactly once:

```bash
npm run test:live-long-run:full -- --confirm-cost
```

| Cell | Workload | Exact model |
| --- | --- | --- |
| `coding-openai` | coding | `openai:gpt-5.2-codex` |
| `coding-anthropic` | coding | `anthropic:claude-sonnet-4-6` |
| `mcp-openai` | MCP | `openai:gpt-5.2-codex` |
| `mcp-anthropic` | MCP | `anthropic:claude-sonnet-4-6` |
| `web-openai` | web | `openai:gpt-5.2-codex` |
| `web-anthropic` | web | `anthropic:claude-sonnet-4-6` |

The default runner executes three isolated cells concurrently. It passes
`--retries=0`, requires a new/empty report directory, isolates HOME/profile/
workspace/ports/MCP per cell, and requires the macOS sleep guard to remain
healthy.

Every qualifying cell proves that one original root attempt lasts at least 20
minutes while completing the fixed tool plan, multiple child-agent paths,
approval pause, FYI, renderer reload/replay, identity/sequence checks, log
health, and cleanup. Workload-specific evidence additionally verifies exact
coding files, deterministic MCP calls, or approved web sources.

Evidence is written under `test-results/live-long-runs/<timestamp>/`:

- `matrix-report.json`;
- `<cell>/cell-report.json`;
- `<cell>/mcp-audit.jsonl`;
- `<cell>/isolated-workspace/` for coding;
- `<cell>/playwright-artifacts/` for diagnostics.

Do not trust top-level `status: passed` by itself: a deliberately selected
single-cell run can pass. Full release evidence must assert:

- `selected_cell_count === 6`;
- `full_matrix_cell_count === 6`;
- the observed cell-ID set exactly equals the six rows above;
- every chosen cell has full-duration qualification and passes;
- each report belongs to the same frozen candidate/configuration.

### Paid failure and rerun rule

Never automatically rerun. Preserve the failed directory and diagnose it
first. A rerun requires renewed authorization naming the exact cell(s):

```bash
npm run test:live-long-run:full -- \
  --confirm-cost \
  --cell coding-openai
```

Record that the evidence is a rerun. For the same unchanged candidate, a subset
rerun may fill only a verified transient infrastructure/provider interruption;
the final manifest must retain the original failure and the COO must explicitly
accept the composite six-cell evidence. A product/harness defect, unexplained
flake, or any code/config change requires a fresh complete six-cell matrix.

## Phase 7 — platform and specialist evidence

The current manual release checklist is:

- macOS Gatekeeper/notarization;
- Windows installer launch;
- Linux AppImage/deb install;
- Ollama real local-model path;
- API-key provider smoke not already satisfied by the scoped live matrix;
- workspace attach with real folders.

Conditional specialist gates:

- Trust-boundary, credential, MCP install, update, signing, or notarization
  changes require `pupu-security-expert`.
- Model, prompt, agent policy, tool-use semantics, or provider behavior changes
  require `pupu-llm-expert`.
- MCP registry/store changes require `mcp-store-curator`.
- Backend Python changes require backend tests and a sidecar restart before
  manual validation.
- Feature-level changes require fresh `pupu-qa-tester` evidence for the changed
  flow.

## Decision rules

`pupu-release-full-test` returns a recommendation; the COO makes the decision.

### GO-RECOMMENDED

Allowed only when:

- the candidate is committed/pinned, reproducible, and unchanged;
- every required non-paid check passed;
- every user-visible `available` MCP entry passed real launch/auth/handshake/
  discovery/representative-call validation;
- all six full-duration paid cells passed;
- required manual/platform checks passed;
- all triggered specialist sign-offs are present;
- there are no lease conflicts, second root attempts, credential/log findings,
  unapproved tools, stale artifacts, or cleanup failures.

### NO-GO

Required when a mandatory assertion/build/product check fails, a paid cell
reaches the product assertions and fails them, a release artifact is invalid,
a security blocker remains open, or evidence identifies a product regression.

### INCOMPLETE

Required when evidence is missing or stale: paid approval/credentials absent,
a required CLI is logged out, a platform/test account is unavailable, a manual
check is skipped, an available MCP cannot be exercised, a specialist sign-off
is missing, the candidate is dirty/unpinned, the worktree changed, or only
smoke-duration live tests ran.

## Required handoff report

```text
Release candidate
- PuPu: branch, SHA, version, clean/dirty, fingerprint
- unchain: branch, SHA, clean/dirty
- immutable evidence root and deterministic/AI snapshot paths

Automated evidence
- command → PASS/FAIL/SKIPPED/CANCELLED
- report/artifact path

Paid live matrix
- authorization scope
- each of six cells: status, duration, model, report path
- reruns, if separately authorized
- exact cell-set/count assertion and composite-evidence approval, if any

MCP store acceptance
- every available entry: launch/auth/handshake/discovery/safe-call status
- unavailable/hidden entries and reason

Manual and specialist evidence
- item/sign-off → status + source

Failures
- severity, evidence, likely owner, required next action

Recommendation
- GO-RECOMMENDED / NO-GO / INCOMPLETE
- one-paragraph rationale
```

Do not include API keys, cookies, raw provider messages, or a guessed dollar
cost in the report.
