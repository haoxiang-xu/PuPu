# Live-model long-run release tests

The live-model suite is an opt-in, paid release gate. It is separate from the
deterministic soak: the deterministic suite proves fixed protocol behavior at
high iteration counts, while this suite proves that two exact production model
IDs can complete real tool workflows for an extended period.

## Exact matrix

The suite contains six independently reported cells. Model aliases and fallback
models are not accepted.

| Cell | Workload | Exact model ID |
|---|---|---|
| `coding-openai` | coding | `openai:gpt-5.2-codex` |
| `coding-anthropic` | coding | `anthropic:claude-sonnet-4-6` |
| `mcp-openai` | MCP | `openai:gpt-5.2-codex` |
| `mcp-anthropic` | MCP | `anthropic:claude-sonnet-4-6` |
| `web-openai` | web | `openai:gpt-5.2-codex` |
| `web-anthropic` | web | `anthropic:claude-sonnet-4-6` |

Each cell defaults to 20 minutes and 12 scheduled workload iterations. The
runner launches one isolated Playwright/Electron process per cell, so every
cell has its own home directory, browser profile, workspace, React port, MCP
audit, Playwright artifacts, and JSON report.

## What each workload proves

- Coding uses an isolated empty workspace. Every iteration must use core file
  tools, write one exact marker file, read it back, and leave all other files
  untouched. The control iteration also runs a real `sleep 8` shell command.
- MCP installs the closed-world deterministic MCP fixture but uses the selected
  real model to choose and call it. It covers a durable approval gate, a scaled
  65-second wait, FYI, durable queue replay, monotonic checkpoint calls, and a
  JSONL server audit.
- Web requires a real `core:web_fetch` call against rotating stable public
  sources. A passing iteration needs both the source URL in the final answer
  and the URL in persisted tool-call/result evidence.
- Coding and web run a two-child `spawn_worker_batch`, distributing real
  multi-agent coverage across four of the six cells.
- Every cell reloads Electron during an active attempt at regular intervals.
  The MCP approval is also reloaded while paused. Reports validate exact
  `chat_id`, `attempt_id`, `request_id`, and `execution_session_id` ownership.

Every attempt records duration, terminal status, bounded tool evidence,
sub-agent evidence, and the persisted input/output/consumed-token bundle.
Execution lease conflicts, unexpected attempt mismatches, uncaught page errors,
missing tool evidence, missing token evidence, or a model/catalog fallback fail
the owning cell.

## Credentials and cost gate

No key is accepted as a command-line value, written to a report, or printed by
the runner. Provide credentials through either environment variables:

```bash
export PUPU_LIVE_OPENAI_API_KEY='...'
export PUPU_LIVE_ANTHROPIC_API_KEY='...'
```

The standard `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` names are supported as
fallbacks. Alternatively, use a local JSON file:

```json
{
  "openai_api_key": "...",
  "anthropic_api_key": "..."
}
```

On macOS/Linux the file must be mode `0600`. The runner removes all provider
key aliases from the child environment and injects only the selected cell's key
under an internal generic name. The Playwright test then stores that key in its
ephemeral Electron profile. Missing credentials fail before any live process is
started.

Paid calls require a separate acknowledgement:

```bash
node scripts/test-api/run-live-long-runs.mjs --confirm-cost
```

For non-interactive release automation, set:

```bash
export PUPU_LIVE_ACKNOWLEDGE_COST=I_UNDERSTAND_LIVE_API_COST
```

## Running the matrix

Serial execution is the safest default and takes about two hours:

```bash
node scripts/test-api/run-live-long-runs.mjs --confirm-cost
```

Run at most three isolated cells concurrently (about 40 minutes for the full
matrix when each cell stays near its target):

```bash
node scripts/test-api/run-live-long-runs.mjs --confirm-cost --parallel 3
```

Run one or several independently addressable cells:

```bash
node scripts/test-api/run-live-long-runs.mjs \
  --confirm-cost \
  --cell coding-openai \
  --cell web-anthropic \
  --parallel 2
```

Use a credentials file without copying keys into shell history:

```bash
chmod 600 /secure/path/pupu-live-credentials.json
node scripts/test-api/run-live-long-runs.mjs \
  --confirm-cost \
  --credentials-file /secure/path/pupu-live-credentials.json
```

Durations shorter than 20 minutes require `--allow-short` and are explicitly
reported as `smoke-only`; they do not qualify as the release long-run gate.

## Reports

The default output root is
`test-results/live-long-runs/<timestamp>/`. It contains:

- `matrix-report.json`: aggregate status and links to all selected cells;
- `<cell>/cell-report.json`: exact identity, duration, assertions, errors,
  tokens, and bounded tool/sub-agent evidence for one matrix cell;
- `<cell>/mcp-audit.jsonl`: deterministic MCP server evidence for MCP cells;
- `<cell>/isolated-workspace/`: coding artifacts for coding cells;
- `<cell>/playwright-artifacts/`: failure screenshots/traces from Playwright.

A matrix passes only when every selected cell's Playwright process exits cleanly
and its cell report has status `passed`. A subset run remains a subset report;
it never claims that all six cells passed.

## Non-paid validation

These commands do not invoke a model API:

```bash
node --test \
  scripts/test-api/live-long-run-lib.test.mjs \
  scripts/test-api/run-live-long-runs.test.mjs

npx playwright test e2e/pupu-live-long-run.spec.js --list
```
