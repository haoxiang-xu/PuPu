# Live-model single-root long-run release tests

The live-model suite is an opt-in, paid release gate. It proves that one root
execution remains alive while it performs many sequential provider/tool turns,
waits for at least 20 minutes, runs multiple child agents, accepts an FYI,
survives renderer detach/replay, and pauses for live tool approval.

It does not qualify a collection of short attempts as a long run. Every passing
cell creates one chat, issues the mutating `POST /runs` exactly once without
retry, persists one root `attempt_id`, and measures the duration of that exact
attempt. After completion, it scans every assistant owner and stream start in
the chat to reject any second root attempt.

## Exact six-cell matrix

| Cell | Workload | Exact root model ID |
|---|---|---|
| `coding-openai` | coding | `openai:gpt-5.2-codex` |
| `coding-anthropic` | coding | `anthropic:claude-sonnet-4-6` |
| `mcp-openai` | MCP | `openai:gpt-5.2-codex` |
| `mcp-anthropic` | MCP | `anthropic:claude-sonnet-4-6` |
| `web-openai` | web | `openai:gpt-5.2-codex` |
| `web-anthropic` | web | `anthropic:claude-sonnet-4-6` |

The runner starts three isolated cells concurrently by default. Each cell has
its own HOME, Electron profile, workspace, React port, deterministic MCP
process, audit, Playwright artifacts, and JSON report. The six-cell full matrix
runs in two waves and normally takes a little over 40 minutes.

## What one root execution does

Every cell receives one fixed, pre-approved numbered plan:

- 19 sequential `soak_wait` calls, each with the canonical `65000 ms`
  parameter. Full qualification uses an unscaled wait, so the waits alone keep
  the same root alive for 1,235 seconds.
- Three monotonic `soak_checkpoint` calls.
- One two-child `spawn_worker_batch` using `live-observer-a` and
  `live-observer-b`.
- One `delegate_to_subagent` using `live-observer-c`.
- One `soak_gate` confirmation. The harness verifies the exact tool arguments,
  confirms that no durable interaction exists, and clicks `Allow once`.
- One FYI containing an attempt-derived nonce that was not present in the
  initial prompt.
- One renderer reload after all three children join but while the root is still
  running. Replay must retain every prior root and child runtime event exactly
  once.

The root may make only one tool call per provider response. The report requires
one `request_messages`, `response_received`, and `iteration_started` frame per
planned tool plus the final response. Every call ID must be unique, each call
must have exactly one later successful result, and the next call cannot start
before the previous result. The harness validates this exact ordered plan
prefix throughout the run and terminates the cell immediately if the model
adds, skips, reorders, or changes a tool call.

`/queue` is deliberately excluded because it creates a successor attempt.
`/btw` is also excluded because it invokes an out-of-band side model. Multi-agent
coverage comes only from children with an explicit lineage to the original
root attempt.

## Workload-specific evidence

- Coding uses an empty isolated workspace and exactly three `write` plus three
  `read` calls. Each write is manually approved only after its absolute path
  and full content match the fixed plan. The final workspace must contain only
  the three expected marker files.
- MCP adds three exact `soak_probe` calls.
- Web makes three manually approved `web_fetch` calls against fixed IANA,
  RFC Editor, and Example Domain URLs. Each matching tool result must contain
  the expected source evidence.

All cells use a fixed `Default.recipe` with
`merge_with_user_selected: false`. Coding exposes only `read` and `write` from
core; web exposes only `web_fetch`; MCP exposes no core tools. The deterministic
toolkit exposes only wait, gate, checkpoint, and harmless probe. Shell, edit,
fail-once, arbitrary network tools, and unplanned MCP tools are unavailable.

The child templates are also fixed:

- A and B are worker-only and parallel-safe.
- C is delegate-only and not parallel-safe.
- Children can see only the harmless `soak_probe` capability and are instructed
  to return one exact marker without calling it.

Every child must use the cell's exact provider/model, persist token usage,
finish with its own marker, and expose lifecycle frames whose
`root_run_id` equals the original root attempt. The current protocol exposes
one subagent-boundary start/completion pair and one child-model
start/completion pair; the harness requires each distinct signal exactly once,
with unique event IDs and strictly increasing sequence numbers.

## Credentials, transport, and cost gate

Provide credentials through dedicated variables:

```bash
export PUPU_LIVE_OPENAI_API_KEY='...'
export PUPU_LIVE_ANTHROPIC_API_KEY='...'
```

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are supported as fallbacks. A mode-0600
JSON file is also accepted:

```json
{
  "openai_api_key": "...",
  "anthropic_api_key": "..."
}
```

The matrix parent writes one selected credential to a mode-0600 one-shot file.
The Playwright module consumes and deletes that file before Electron starts, so
the provider key is not inherited through the process environment by Electron,
the sidecar, MCP, Python probes, the sleep guard, or tool subprocesses. The
runtime intentionally supplies the same credential in memory to the selected
root and child model clients. The runner builds every helper and cell
environment from a closed non-secret allowlist; provider endpoint overrides,
proxies, custom CA paths, process-injection variables, and ambient secrets are
not copied. After the root starts, the ephemeral renderer setting is cleared
before the reload.

Paid calls require an explicit acknowledgement:

```bash
npm run test:live-long-run:full -- --confirm-cost
```

For non-interactive release automation:

```bash
export PUPU_LIVE_ACKNOWLEDGE_COST=I_UNDERSTAND_LIVE_API_COST
```

The runner always passes `--retries=0`; Playwright never automatically repeats
a failed paid cell. This does not override transport retry behavior inside a
provider SDK. On a harness failure, the exact chat/attempt is cancelled before
MCP cleanup; runner-level interruption also signals the isolated Playwright,
Electron, and sidecar process group. Full macOS cells require the
sleep-prevention guard to start and remain healthy. A user-supplied report
directory must be new or empty; the runner refuses stale audits, workspaces, or
reports before launching any cell.

## Running

Run all six cells, three at a time:

```bash
npm run test:live-long-run:full -- --confirm-cost
```

Run a subset or reduce parallelism:

```bash
npm run test:live-long-run:full -- \
  --confirm-cost \
  --cell coding-openai \
  --cell web-anthropic \
  --parallel 2
```

Use a secure credentials file:

```bash
chmod 600 /secure/path/pupu-live-credentials.json
npm run test:live-long-run:full -- \
  --confirm-cost \
  --credentials-file /secure/path/pupu-live-credentials.json
```

Durations below 20 minutes require `--allow-short` and are reported as
`smoke-only`. Smoke runs still execute the complete single-root plan; the MCP
time scale has a floor so FYI and confirmation controls remain observable.

## Reports and qualification

Reports are written below `test-results/live-long-runs/<timestamp>/`:

- `matrix-report.json` contains the aggregate status and per-cell sleep guard.
- `<cell>/cell-report.json` contains bounded identity, duration, token, tool,
  child, control, and assertion evidence.
- `<cell>/mcp-audit.jsonl` proves exact deterministic calls and wall-clock
  scaling.
- `<cell>/isolated-workspace/` contains coding artifacts.
- `<cell>/playwright-artifacts/` contains failure diagnostics.

Raw provider messages, fetched pages, and full runtime frames are used only for
in-process assertions and are not copied into the JSON report.

A full cell qualifies only when the original root attempt itself lasts at least
20 minutes and all identity, sequence, tool, child, FYI, reload, approval,
model, token, audit, log-health, and cleanup assertions pass.

## Non-paid validation

```bash
node --test \
  scripts/test-api/live-long-run-lib.test.mjs \
  scripts/test-api/run-live-long-runs.test.mjs

npx playwright test e2e/pupu-live-long-run.spec.js --list
```
