# Hybrid Claude/Codex Execution Policy (PuPu agents)

**Status:** pilot phase. Last updated 2026-06-19.

"Codex participation" is NOT one thing. It is three modes with very different risk. Pick the mode per role deliberately; do not blur them.

## The three modes

- **Mode A - Codex as read-only advisor; Claude executes.**
  Codex (read-only profile, e.g. `codex exec -p architect`) does heterogeneous reasoning or code-level trace; Claude applies any change and enforces PuPu conventions. Value: cross-model check + deep reasoning. Risk: LOW.

- **Mode C - Codex runs/writes tests and verifies.**
  Tests carry their own pass/fail, so Codex has little room to cut corners. Claude/QA still owns test strategy and the `.js`/`.cjs` parity. Risk: MEDIUM.

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
| pupu-security-expert | A | Claude | security expert holds severity + sign-off |
| pupu-llm-expert | A | Claude | llm-expert; model facts from docs, not Codex memory |
| pupu-qa-tester | C | Codex (tests) | QA owns strategy; Claude reviews |
| pupu-dev-backend | **B (PILOT ONLY)** | Codex-primary | Claude reviews diff; llm-expert veto on model-visible behavior |
| pupu-cto | none | - | CTO does delivery/dispatch/conventions/CEO liaison, not Codex reasoning (that moved to pupu-architect) |
| pupu-dev-chat-core | A for design/trace only | Claude | NOT Codex-primary - use_chat_stream.js is load-bearing |
| pupu-dev-electron | A for trace only | Claude | NOT Codex-primary - IPC/preload channel parity |
| all other roles | none yet | Claude | - |

## Rollout rule

Mode B stays a **single pilot (pupu-dev-backend)** until it passes the metrics below. Only then extend Mode C to QA broadly and Mode A to security/LLM expert. **Never extend Mode B to chat-core or electron.**

## Pilot metrics (pupu-dev-backend, Mode B)

1. Convention violations introduced by Codex (target: 0).
2. Real time saved vs Claude-only (qualitative + rough).
3. Token + latency cost per task (acceptable?).

If any metric fails, stop the pilot and stay on A/C.
