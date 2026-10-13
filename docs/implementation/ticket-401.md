# Ticket #401 — restore Memory V3 learning and record completion decisions

Ticket: https://github.com/haoxiang-xu/PuPu/issues/401

## Delivery context

- PuPu clone: `/Users/red/Desktop/GITRepo/pupu-401`
- Unchain clone: `/Users/red/Desktop/GITRepo/unchain-401`
- Branch in both repositories: `codex/ticket-401-memory-v3-curator`
- PuPu base: `01baffd6104088d897f82f25438eca53445d7370`
- Unchain base: `358b96d723daa0d2882158985c8245c7f8c7fb23`
- Goal: make an eligible completed root conversation reliably evaluate the existing proposal policy before its final answer, enqueue the existing curator when a candidate is proposed, and durably record the enqueue or skip disposition.
- Non-goals: no new Memory UI; no transcript rewriting; no foreground curator model; no automatic cross-conversation promotion; no change to the existing confirmation boundary for `user:local` long-term memory; no change to subagent, workflow, or hook completion authority.

## Reproduction and root cause

The project-owner profile contains 168 completed root runs but zero memory entries, candidates, or consolidation jobs. All 32 background hosts are idle and the journal contains no `memory.curator.*` events.

The active path is:

1. `MemoryV2Module.configure` mounts `memory_propose` and a root completion hook.
2. The normal model may call `memory_propose`; this is the only producer of a candidate.
3. On a completed root run, the hook builds a `RootRunCompletion` and calls `MemoryAgentHostAdapter.enqueue_root_completion`.
4. `CuratorCoordinator.enqueue` creates a job only when a pending candidate exists; otherwise it returns `NO_OP/no_pending_candidates` without invoking a model.

The proposal policy is currently only descriptive tool guidance. It says when the tool may be called but does not require the root agent to evaluate the policy before finalizing. In the observed profile the model never proposed a candidate, so every completion followed the model-free no-candidate path. The official Unchain module then discards the enqueue receipt, so even that deliberate no-op has no durable journal record. The job and background worker are therefore healthy but receive no work, while the skip reason is invisible.

The tool optimizer is not the cause: `memory_propose` is registered with `always_load=True`, and Context V2 retains system/developer instructions. Existing tests also prove that the active normal toolkit contains `memory_propose`.

## Design decisions

1. Add a root-only Memory learning harness in Unchain. It appears only when one run has both candidate-proposal capability and root-completion authority, and only while `memory_propose` remains in the provider-visible toolkit. Before every model call it requires a terminal learning-policy evaluation: propose one qualifying, auditable candidate before the final answer; do not propose when the policy fails; do not repeat a successful proposal.
2. Keep the existing strict policy, secret exclusion, candidate schema, and model-free no-candidate path. The harness makes evaluation mandatory; it does not weaken eligibility or manufacture a candidate from the transcript.
3. Preserve the host-specific durable audit boundary. After `enqueue_root_completion`, Unchain calls an optional recorder on the completion factory with the exact completion and receipt. PuPu's completion factory records one content-bound, replay-safe `memory.curator.enqueued`, `memory.curator.noop`, `memory.curator.isolated`, or `memory.curator.failed` journal event on the same attempt. It records identifiers, disposition, reason, candidate count and job ID only; no message, reasoning, tool argument, tool result, candidate body, or secret is copied.
4. Reuse the current curator and background worker. A qualifying proposal produces the same frozen candidate/job and existing apply-or-review outcome. Conversation-scoped durable entries remain readable by Context V2. Cross-conversation `user:local` promotion stays separately user-confirmed and is part of #364's selected controls rather than this bug fix.

## Cross-boundary contracts

### BC-401-01 — provider request learning instruction

Producer: Unchain `MemoryV2Module` root-only harness. Consumer: the normal provider model request assembled after tool exposure and Context V2 compilation.

- The instruction exists only with `memory.candidate.propose` plus authoritative `memory.execution.complete`.
- It is removed when `memory_propose` is unavailable after allowed-tool or exposure filtering.
- It requires policy evaluation before final response, preserves secret/novelty/durability rules, and forbids duplicate proposals.

### BC-401-02 — completion receipt audit

Producer: `MemoryAgentHostAdapter.enqueue_root_completion`. Consumer: the optional host completion recorder and PuPu canonical journal.

- The recorder receives the exact immutable `RootRunCompletion` and `MemoryAgentEnqueueReceipt` returned by the enqueue call.
- The event identity is deterministic from attempt, trigger, disposition, reason, candidate identities/job identity.
- Replay returns the same event; a changed payload under the same operation fails closed.
- The payload is content-free and bounded.

### BC-401-03 — candidate to Context V2 memory

Producer: existing `memory_propose` capability and curator job. Consumer: existing background worker, workspace store and Context V2 list/search/read surfaces.

- No new candidate, job, entry, review or promotion schema is introduced.
- No-candidate completion remains model-free.
- Existing apply/review/promotion authorization is unchanged.

## Sequence

### SEQ-401-01 — qualifying completed root conversation

1. Root model receives `memory_propose`, the existing proposal policy, and the root learning-evaluation instruction.
2. Before final response it evaluates the policy and, when eligible, calls `memory_propose` once.
3. The final message and terminal run event are committed unchanged.
4. The completion hook captures the exact terminal journal, enqueues the frozen candidate, and obtains an `ENQUEUED` or replay receipt.
5. PuPu appends the deterministic `memory.curator.enqueued` audit event.
6. The existing background worker processes the job and produces the existing applied/review outcome; the resulting authorized memory remains readable through Context V2.

### SEQ-401-02 — deliberately unlearned conversation

1. The root model evaluates the policy and finds no eligible durable fact.
2. It returns the answer without calling `memory_propose`.
3. The completion hook receives `NO_OP/no_pending_candidates`; no curator model runs.
4. PuPu appends one deterministic `memory.curator.noop` event with candidate count zero.

### SEQ-401-03 — replay and non-root paths

1. Replayed completion returns the existing job or no-op result and reuses the same audit event identity.
2. Subagents and graph steps without completion authority retain their granted memory tools but do not receive the root learning harness or emit root completion audits.
3. Failed, cancelled, partial or unavailable capture keeps existing isolation behavior and records its disposition.

## Acceptance checks

- **AC-401-01:** A root builder with both capabilities and `memory_propose` exposes exactly one root learning block to the provider; a descendant, read-only grant, completion-only grant, or allowed-tool filter does not.
- **AC-401-02:** A deterministic fake-provider root run whose user supplies a stable, non-secret preference sees the instruction, calls `memory_propose`, completes, and produces one curator job without modifying the message/tool records.
- **AC-401-03:** A deterministic no-learning run invokes no curator model and persists one `memory.curator.noop` event with reason `no_pending_candidates` and candidate count zero.
- **AC-401-04:** Candidate/job replay is idempotent and audit replay neither duplicates nor changes the event.
- **AC-401-05:** Existing background application plus Context V2 list/search/read tests pass with the exact newly built Unchain wheel installed into the PuPu sidecar.
- **AC-401-06:** Failed/cancelled/partial/unavailable, subagent, graph, resume, allowed-tool and tool-optimizer regressions remain green.
- **AC-401-07:** Existing conversation messages, reasoning, tool calls and tool results are byte-equivalent before and after the additional audit event.

## Files and symbols

Unchain:

- `src/unchain/memory/toolkit/policy.py` — root learning block and harness.
- `src/unchain/memory/module.py` — attach the root-only harness and forward the enqueue receipt to an optional recorder.
- `tests/memory_v2/test_memory_v2_agent_module.py` — grant/filter/root/descendant/prompt and receipt forwarding regressions.

PuPu:

- `unchain_runtime/server/memory_v2_unchain_root_completion.py` — host callback contract on the completion factory/resolver.
- `unchain_runtime/server/memory_v2_unchain_runtime_factory.py` — append the deterministic content-free audit event to the exact attempt journal.
- `unchain_runtime/server/tests/test_memory_v2_unchain_root_completion.py` and runtime-factory/integration tests — callback validation, no-op/enqueued replay and transcript-integrity evidence.

## Impact and risk

GitNexus reports **HIGH** upstream risk for `MemoryV2Module.configure`: 24 directly resolved tests plus three unresolved receiver calls, and the index is a lower bound. This requires full module, SQLite attachment, resume/graph, optimizer, and PuPu active-host regression coverage. The PuPu completion factory and resolver are MEDIUM risk (52 and 10 impacted symbols). The PuPu host-factory constructor is UNKNOWN because constructor receiver edges were dropped; source search confirms production construction in `memory_v2_unchain_run_binding.py` and test factories, so those callers are included explicitly in verification. No HIGH/CRITICAL warning is waived.

## Implementation ownership and checkpoints

Weaker-model assessment: **not suitable**. The change crosses repositories, provider-visible prompting, authoritative root/descendant grants, post-terminal durable journaling and exact artifact pairing. The root cause and design are settled, but a small error can leak instructions to descendants, duplicate journal events, or modify terminal history. The strong agent will implement both bounded slices.

Checkpoints:

1. Unchain prompt/receipt contract: targeted module tests must prove root-only exposure, allowed-tool removal and exact receipt forwarding.
2. PuPu durable audit adapter: targeted root-completion and runtime-factory tests must prove content-free idempotent events after canonical terminal proof.
3. Exact artifact integration: build one Unchain wheel, install it into the PuPu sidecar environment, restart the sidecar, run the paired completion/background/read matrix, then run full applicable suites and GitNexus `detect-changes` in both repositories.

Stop if the implementation would require a new memory/job schema, an automatic `user:local` promotion, foreground model work, weakened secret rules, or any change to existing message/tool records; those are architecture or product changes outside this ticket.

## Post-acceptance repair — 2026-10-12

Real-provider acceptance disproved AC-401-02 and exposed a separate Agent Builder completion-path omission. The root model called `memory_propose` three times, but the provider contract allowed it to invent an unsupported `kind`, omit `source_refs`, and finally pass a raw event identifier where the runtime required an encoded authorized context-event reference. All calls failed, the model still claimed success, and the live profile contained zero candidates, jobs, entries, or `memory.curator.*` audit events. The earlier audit is therefore stale.

The repair changes the normal proposal boundary without changing the durable candidate schema:

- the provider-visible `memory_propose` contract creates a markdown candidate and no longer exposes internal `kind`, binary/link, or `source_refs` arguments;
- the host supplies bounded current-run provenance through the attachment factory at tool execution time, and Unchain validates and authorizes those structured references before proposing the candidate;
- a successful proposal is defined only by a returned non-empty `candidate_ref`; tool errors never justify a saved/proposed claim;
- Agent Builder graph completion forwards the exact enqueue receipt through the same completion-factory recorder used by single-agent runs.

### BC-401-04 — runtime-owned proposal provenance

Producer: PuPu's attempt-bound canonical journal resolver. Consumer: Unchain's normal Memory toolkit candidate proposal.

- The model supplies candidate content and metadata only; it cannot construct or override internal event references or candidate kind.
- The resolver returns only structured, bare `context_event` references from the exact attached attempt, bounded to the current user/interaction input and completed tool results available before the proposal.
- Unchain rejects an empty, foreign, fragmented, duplicated, or unauthorized runtime-owned source set before any candidate mutation.
- The persisted candidate keeps the existing `FrozenCandidateSnapshot` and source-reference schema.

### BC-401-05 — post-terminal curator audit classification

Producer: PuPu's root-completion recorder. Consumer: Unchain's generation-rebase quiescence check.

- The recorder may append only the closed `memory.curator.enqueued`, `memory.curator.noop`, `memory.curator.isolated`, or `memory.curator.failed` audit family after a canonical run terminal.
- Those content-free events describe the completed run's enqueue disposition and do not reopen provider or tool execution.
- Any other event after the terminal remains incompatible and blocks rebase; duplicate or ambiguous terminals remain rejected.

### SEQ-401-04 — real provider proposal and graph completion

1. The provider receives a schema requiring path, description, and markdown content, with no internal provenance parameter.
2. On `memory_propose`, PuPu resolves exact-attempt evidence from the canonical journal; Unchain validates and authorizes it, then returns a candidate result containing `candidate_ref`.
3. The model may report that a candidate was proposed only after that result; formal-memory wording remains forbidden until curator application is proven.
4. Agent Builder root completion enqueues the frozen candidate and passes the same receipt to the attached completion recorder before waking the background worker.
5. PuPu appends one replay-safe `memory.curator.enqueued` or `memory.curator.noop` event, and the existing worker/apply path continues unchanged.

### Additional acceptance checks

- **AC-401-08:** The exact provider schema for OpenAI, Anthropic, Gemini, Ollama, and default routes exposes a markdown-only proposal with no `kind` or `source_refs`; a deterministic model call that supplies only path, description, and content persists a candidate with host-owned current-run provenance and returns `candidate_ref`.
- **AC-401-09:** Agent Builder graph completion records exactly one content-free curator decision for enqueue, no-op, replay, and isolated background-notification paths without changing final output, terminal ordering, job identity, or worker scheduling.
- **AC-401-10:** Generation rebase accepts the closed curator-audit family after a canonical terminal for ordinary and graph-root attempts, while continuing to reject every other post-terminal continuation.

## Repair verification evidence

- Unchain repair commit: `41d66884933258ac459ff406c8512f7501aacf63` (the accepted #401 repair plus the already reviewed #383 timeline-policy runtime required by PuPu's current `dev` contract).
- Exact wheel: `unchain-0.2.0-py3-none-any.whl`, SHA-256 `cdf213ebf3d121e6234f0fa3097e6245405b6000292514ace6fcb03e2911b694`.
- Runtime manifest: `sha256:b80cde70e35f93c21ed069990f26817d353e4fd1c9d3ff109cfda933f5295672`.
- Unchain's complete source suite passes: `4212 passed, 16 skipped, 5 xfailed`. PuPu's complete Python sidecar suite passes against the exact installed wheel: `2705 passed, 17 skipped, 3605 subtests passed`; the focused proposal, graph-root, replay and audit matrix passes `35 passed`.
- Real-provider acceptance with Gemini produced one durable chat-memory entry, one candidate/job lineage, and exactly one `memory.curator.enqueued` event for the tested chat. The final compatibility repair additionally binds that audit event to the canonical semantic operation receipt; the exact-wheel second-turn replay regression passes after this correction.
- Both repositories completed full-scope GitNexus change analysis without partial or truncated output: Unchain reports medium aggregate risk with the `Memory_propose` flow affected; PuPu reports low aggregate risk and no affected indexed execution process. The pre-edit HIGH risk on PuPu graph-root completion remains covered by graph, replay, rebase and background-worker tests above.
- All provider behavior in the tests is deterministic fake-provider behavior; no local model inference was run.
