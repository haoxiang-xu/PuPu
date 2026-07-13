# Hybrid Claude/Codex Execution Policy (PuPu agents)

**Status:** pilot phase. Last updated 2026-06-19.

"Codex participation" is NOT one thing. It is three modes with very different risk. Pick the mode per role deliberately; do not blur them.

## The three modes

- **Mode A - Codex as read-only advisor; Claude executes.**
  Codex (read-only profile, e.g. `codex exec -p architect`) does heterogeneous reasoning or code-level trace; Claude applies any change and enforces PuPu conventions. Value: cross-model check + deep reasoning. Risk: LOW.

- **Mode C - Codex runs/writes tests and verifies.**
  Tests carry their own pass/fail, so Codex has little room to cut corners. Claude/QA still owns test strategy and the `.js`/`.cjs` parity. Risk: MEDIUM.

- **Mode R - Codex-autonomous read-only investigation; output is a report.**
  Codex (the `researcher` profile) investigates a target on its own - reads code, traces flows, clones OSS repos into a scratch dir, runs read-only commands - and returns an evidence-driven, falsification-refined report. No code lands in any repo of record; the Claude shell only writes the charter and relays. Because nothing is written to a repo of record, risk is LOW even though Codex is autonomous. Cross-model value: a heterogeneous investigator with zero shared priors. Risk: LOW.

- **Mode B - Codex-primary writes feature code.**
  Codex edits with a workspace-write profile. Highest value on large or less-convention-bound code, highest risk. Guardrails are MANDATORY:
  1. PuPu conventions fed via `AGENTS.md` (JS-only, inline-style, IPC boundary, no ipcRenderer in renderer, localStorage only through SERVICEs helpers, `.js`/`.cjs` test parity).
  2. GitNexus grounding fed into the Codex prompt (impact/context).
  3. **Claude reviews Codex's diff before it lands** - this preserves the cross-model check; without it you only swapped the executor.
  4. LLM-visible behavior is vetoed by `pupu-llm-expert`.

## Role assignments (pilot phase)

| Role | Mode | Who writes code | Review / sign-off |
|------|------|-----------------|-------------------|
| pupu-architect | A | Claude (CTO dispatches devs) | architect |
| pupu-ai-researcher | **R** | none (report only, no code) | dispatcher (pupu-llm-expert) consolidates |
| pupu-security-expert | A | Claude | security expert holds severity + sign-off |
| pupu-llm-expert | A | Claude | llm-expert; model facts from docs, not Codex memory |
| pupu-qa-tester | C | Codex (tests) | QA owns strategy; Claude reviews |
| pupu-dev-backend | **B (PILOT ONLY)** | Codex-primary | Claude reviews diff; llm-expert veto on model-visible behavior |
| pupu-cto | none | - | CTO does delivery/dispatch/conventions/CEO liaison, not Codex reasoning (that moved to pupu-architect) |
| pupu-dev-chat-core | A for design/trace only | Claude | NOT Codex-primary - use_chat_stream.js is load-bearing |
| pupu-dev-electron | A for trace only | Claude | NOT Codex-primary - IPC/preload channel parity |
| all other roles | none yet | Claude | - |

## Transparent orchestration

When a Claude/Fable agent calls Codex or another CLI, the final report MUST include a short transparency block:

- **Planner/reviewer model:** the Claude/Fable agent that scoped or reviewed the work.
- **Executor model/profile:** the Codex profile or other CLI profile used.
- **Working directory:** repo path or scratch path.
- **Command shape:** enough of the command to audit routing, with secrets and tokens redacted.
- **Result:** PASS/FAIL/NOT RUN for tests or verification, plus the important stdout/stderr summary.

Do not paste API keys, OAuth tokens, cookies, or full auth-bearing commands. Transparency is about routing and evidence, not leaking credentials.

## Default mixed-model handoff

For implementation tasks that are eligible for mixed execution, use this sequence:

1. **Claude/Fable plans.** The owning agent reads the relevant docs/GitNexus context, defines scope, risks, and a Definition of Done.
2. **Codex implements.** Codex receives the plan, constraints, impact/context evidence, and required tests. It writes code only inside the approved scope.
3. **Claude/Fable reviews.** The owning agent reviews the Codex diff against the Definition of Done and PuPu conventions.
4. **Codex fixes.** If review finds concrete issues, send Codex a bounded fix prompt rather than allowing a broad rewrite.
5. **Owner verifies.** The owning agent reruns or reviews the required tests and reports any skipped checks explicitly.

This handoff can be used as a **Codex implementation assistant** for most dev roles, but only `pupu-dev-backend` is approved for Mode B Codex-primary writes. For load-bearing surfaces such as chat-core and Electron, Codex may propose patches and run tests, but Claude/Fable remains the accountable writer/reviewer.

## Rollout rule

Mode B stays a **single pilot (pupu-dev-backend)** until it passes the metrics below. Only then extend Mode C to QA broadly and Mode A to security/LLM expert. **Never extend Mode B to chat-core or electron.**

## Pilot metrics (pupu-dev-backend, Mode B)

1. Convention violations introduced by Codex (target: 0).
2. Real time saved vs Claude-only (qualitative + rough).
3. Token + latency cost per task (acceptable?).

If any metric fails, stop the pilot and stay on A/C.
