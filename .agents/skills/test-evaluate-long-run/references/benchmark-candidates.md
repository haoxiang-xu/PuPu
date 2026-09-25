# Professional case-library shortlist

Researched 2026-09-25. **BFCL selected by the maintainer on 2026-09-25.**
This records the choice and proposed pilot, **not installed suites, imported
tasks, completed adapter work or benchmark results**. Versions change;
pin the chosen dataset, harness and verifier revisions before implementation.

## Selected scope: BFCL multi-turn pilot

Use BFCL's multi-turn categories, introduced in V3; this does not mean using an
unverified old release or assuming V3 is the latest full benchmark. Pin the
actual upstream code/data/evaluator revision when implementing the adapter.

Proposed first batch: eight cases, two per category:

- Base multi-turn: chain tools and preserve state across user turns.
- Missing parameters: ask for missing information instead of fabricating it.
- Missing functions: recognize unavailable capabilities, then handle the
  case-defined tool availability change on a later turn.
- Long context: retain relevant state amid distracting information.

These categories come from the [official multi-turn methodology](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html).
Eight is a small adapter pilot, not a capability certification threshold.
Actual task IDs, licenses and pinned revisions remain to be resolved before
import. Keep simulated booking/trading/messages inside the benchmark sandbox;
never map them to real accounts or services.

Implementation order:

1. Pin upstream inputs, check licenses, select case IDs and record their hashes.
2. Connect case tools/state and turn scheduling to the real PuPu/Unchain path;
   preserve tool availability and clarification semantics, without replacing
   the agent with direct provider calls or prescribing the answer's tool plan.
3. Preserve upstream state/response evaluation requirements at that revision.
   Codex/Claude adds an evidence-based review; it does not replace the verifier.
4. Validate known-good, known-bad and incomplete traces without paid calls;
   then propose a bounded cloud-model run with explicit cost authorization.

Keep the existing fixed-plan long-run tests. BFCL adds capability evidence;
it does not replace app lifecycle/reload/approval reliability coverage. Do not
add Terminal-Bench or other suites to this pilot without a new scope decision.

## Alternatives retained for reference (not selected)

| Candidate and primary source | What it supplies | PuPu fit / integration judgment |
| --- | --- | --- |
| [BFCL multi-turn](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html) | Tool-call cases including missing parameters/functions and long-context interactions | First pilot: tool selection, argument correctness and clarification. Needs an adapter into PuPu tools and preservation of upstream evaluator semantics. Function-call success alone is not MCP transport/interoperability proof. |
| [Terminal-Bench + Harbor](https://www.tbench.ai/news/announcement-2-0) / [official runner guide](https://github.com/harbor-framework/harbor/blob/main/docs/content/docs/tutorials/running-terminal-bench.mdx) | Terminal tasks, isolated environments and task verification; Harbor is the runner, Terminal-Bench the task suite | Second pilot: real multi-step file/code tasks. Requires a PuPu/Unchain agent adapter and isolated compute; running Claude Code instead would test a different agent. Not suitable for installation into the shipped app. |
| [τ-bench / tau2-bench repository](https://github.com/sierra-research/tau2-bench) | Simulated users, domain policies, tools and tasks for stateful conversations | Useful next for clarification and durable state. Costs include user simulation as well as agent calls. Pin a text-domain version; the repository now also contains newer voice/knowledge work. This is not a ready-made PuPu MCP suite. |
| [SWE-bench Verified](https://www.swebench.com/SWE-bench/) | Real repository issue-to-patch tasks and Docker evaluation | Later coding depth: more setup/resource cost than small tool tests. Use actual patch/test outcomes, not just agent self-report. |
| [BrowserGym ecosystem](https://github.com/ServiceNow/BrowserGym) | Browser-task framework integrating suites such as WebArena and WorkArena | Later, if evaluating browser interaction. Browser control tasks are not a drop-in replacement for PuPu's current web_fetch tests; need compatible tools and suite-specific environments. |

The fit assessments above are project recommendations, not claims made by the
benchmark authors. BFCL is the selected suite; the other entries preserve the
research for possible future scope decisions, not an automatic expansion plan.

## Framework versus case package

[Inspect AI scorers](https://inspect.aisi.org.uk/scorers.html) support both
deterministic and model-graded scoring;
[Inspect Evals](https://github.com/UKGovernmentBEIS/inspect_evals) is a task
collection for that framework. Consider it when automating evaluation later,
not as a requirement for the current Codex/Claude review skill. An external
framework calling a raw model API measures that model/solver, not PuPu's real
runtime unless explicitly connected to it.

Keep evaluation dependencies in a separate pinned test environment/CI job,
not PuPu production dependencies. Do not provision heavy containers or local
model inference on the developer's machine as a side effect of review.

## Keep two complementary lanes

- **Reliability:** retain the current PuPu fixed-plan soak for single-root
  duration, child lineage, FYI, approval, reload/replay and cleanup.
- **Capability:** add real tasks with end-state verifiers and observable task
  traces; Codex/Claude reviews quality, grounding and failure explanations.

Do not force every benchmark task to wait 20 minutes or claim that doing so
preserves the official protocol. Native fixtures remain necessary for PuPu's
app lifecycle and persistence boundaries.

## Admission contract for a future adapter

Before importing or running a task, record:

- Original source, task ID/split, dataset/harness/verifier commit or digest,
  and task/code/data licenses separately. Check redistribution and attribution
  terms at the chosen revision; public GitHub access is not a blanket license.
- Goal, initial state, expected artifacts/state, allowed tools/network/mutations,
  forbidden actions, timeout/token/cost limits and stop/cancel behavior.
- Target under test: actual PuPu runtime + Unchain artifact identity, model,
  recipe/tool mapping; keep benchmark-only model runs separately labelled.
- Oracle and its isolation: don't expose answers, hidden tests or evaluation
  credentials to the tested agent; run untrusted task code in a dedicated sandbox.
- Sanitized final answer, observable tool trajectory, artifacts, verifier output,
  duration/token/cost and provenance needed by the review rubric. Capture only
  necessary evidence; no provider credentials or hidden chain-of-thought.
- Trials, fixed selection and baseline before execution. Report failures and
  exclusions; do not cherry-pick successful reruns. A small pilot is not a
  statistically reliable estimate of the whole suite.

Validate an adapter with known success, known failure, missing evidence, and
forbidden action cases before paying for broad model runs. A changed prompt,
tool set, task subset or oracle must be labelled **PuPu-adapted**; do not claim
an official leaderboard score unless the upstream protocol is followed.

Implementing a runtime/benchmark bridge crosses a process/provider boundary:
follow the repository's current cross-boundary contract rule, document relevant
BC/SEQ/AC in its implementation plan or Release issue, and validate the exact
artifact pair. This shortlist alone does not authorize that integration or
make it a required Release QA job.
