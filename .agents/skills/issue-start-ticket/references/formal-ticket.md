# Formal ticket: decide the work before implementation

Load for every started ticket after research/refinement and before product code
edits. This stage is led by the stronger planning agent. It makes the important
decisions explicit so an implementation worker does not have to rediscover them.
It is not feature acceptance and must not trigger `issue-feature-audit`.

Use the ticket's actual work, not labels alone. A bug with new UI needs both the
bug and UI paths; a feature with a bug fix needs both plans. Preserve scope and
reuse existing sufficient research. Scale the plan to the work, not a template's
length. No separate user approval is needed for routine technical decisions;
the UI choices below are explicit user decisions and must wait for their answer.

## Bug and feature planning

For a **bug**, establish the reproduction, expected/actual behavior, root cause
and causal execution path. Inspect the implementation and GitNexus flows/impact,
then choose the repair, compatibility constraints and a regression test that
would fail before the fix. Resolve substantive alternatives before delegation.

For a **feature**, map the user's action through the complete functional flow:
entry/reachability, state and data changes, producer/consumer boundaries, output
and failure/retry behavior where relevant. Choose the design and implementation
sequence, reuse points, contracts, acceptance tests and non-goals. An instruction
such as “implement this feature” is not an implementation plan.

For either path, document exact files/symbols, surrounding patterns to follow,
relevant invariants and risks from code evidence. Record applicable BC/SEQ/AC in
the issue or direct plan under the cross-boundary gate. Unknowns that can alter
the architecture, schema, durable behavior or user result stay with the strong
agent; do not disguise them as small worker TODOs.

## UI design choices before UI implementation

1. Map the feature's functional flow first, then inventory possible UI components.
   For each, show its role in that flow, existing builtin to reuse/extend or why a
   new component is needed, important states and interactions, and decisions that
   need visual exploration. Include error/empty/loading/disabled states when
   reachable. Do not infer that every inventory entry needs a new primitive.
2. Ask the user **which components should receive multiple design options**.
   Make the inventory concrete enough to choose from; do not silently select for
   them. If the user already specified the components, use that answer. Continue
   independent nonvisual investigation while waiting, but do not implement a
   pending design or take elapsed time as consent.
3. For the selected components, work **one component at a time**. Present a small
   set of meaningfully different designs (default 2–3) with actual viewable
   previews/mockups and brief interaction tradeoffs. Use a relevant visual skill
   or tool for the requested format. Keep alternatives within PuPu's builtin,
   theme, typography and layer conventions. A list of prose ideas alone is not
   enough for a visual pick. These are design artifacts, not final product edits.
4. Let the user inspect and pick that component's design before proceeding to
   the next selected component. Revise if none is picked; never treat the first
   or recommended option as selected by default. Record the choice, artifact and
   any requested changes in the ticket comment and implementation plan.
5. Components the user did not select for alternatives follow existing patterns.
   After all required picks, fold the chosen interactions and state behavior into
   the same bug/feature plan and delegation assessment below. UI decisions do not
   replace planning of the feature's remaining functional flow.

## Can a weaker model implement this?

Always record one evidence-backed outcome: **suitable**, **partially suitable**
or **not suitable**, with reasons and the exact slices concerned. “Bug” or “short
diff” is not evidence of suitability; a long task can be suitable when decisions
are settled and slices have observable completion criteria.

Assess whether the inspected code, settled design and available tests make each
slice executable without substantial new judgment:

- Root cause or desired functional behavior is established; relevant files and
  existing patterns are identified.
- Interface shapes, state transitions, compatibility and UI choices are settled.
- Tests provide an observable correctness signal, including relevant negative
  cases, rather than merely matching the proposed implementation.
- Dependencies and edit scope are bounded; architectural or product uncertainty
  will not be pushed onto the worker.

For partial suitability, the strong agent handles the unresolved/high-judgment
slices and delegates only the bounded remainder. If unsuitable, the strong agent
implements; do not delegate merely to satisfy a cost goal. If research can settle
an uncertainty, do that research before deciding instead of reflexively declining.

The user authorizes weaker-model delegation for suitable implementation in this
workflow. Use the user's model choice if provided; otherwise select an actually
available less-capable/lower-cost implementation model appropriate to the slice
and record the selection and reason. Use agent tools for subtasks, not a new
user-owned Codex task. Follow tool rules for model overrides and context transfer.
The strong parent remains responsible for planning, review and integration.
Do not claim a model was used unless it was actually dispatched. If no suitable
worker or strong reviewer is available, report the limitation and retain the
required decisions/reviews rather than simulating a two-model workflow.

## Implementation handoff file

Before delegating, create a concrete technical handoff in the ticket clone,
normally `docs/implementation/ticket-<number>.md`; reuse an appropriate existing
direct plan instead of making competing plans. Link its path and post the plan,
assessment and checkpoint summary on the issue. Update this same file as choices
change and preserve it with delivery. This is an implementation plan, not a sprint
mirror or retired role/authorization record.

Include the information the worker needs without the planner's conversation:

- Ticket URL, clone/branch/base SHA, goal, non-goals and current investigation.
- Bug reproduction/root cause or feature functional flow; selected UI designs.
- Decisions already made, concrete files/symbols and reference patterns, impact
  evidence and constraints. Explicitly state decisions the worker must not make.
- Ordered bounded slices: intended behavior/change, permitted edit scope,
  dependencies, exact test commands and expected observable results.
- Applicable BC/SEQ/AC, fixtures/artifacts and environment prerequisites; no
  credentials. Required documentation changes and known limitations.
- Worker model, strong reviewer, checkpoint locations/evidence, stop conditions
  and the next slice it is authorized to implement. These are execution details,
  not ownership/confirmation gates.

Worker must read applicable repo instructions, perform required impact before
edits, keep work in this clone and respect the start phase's no-commit/no-push
boundary. New architecture decisions, missing interfaces, unexpected regression,
scope expansion or contradictions with the plan require a report to the strong
agent before dependent edits. Do not ask the weak worker to guess a workaround.

## Strong-model checkpoints for delegated implementation

For a short bounded task, strong-agent review at its end may suffice. For a long
or multi-stage ticket, define **several intermediate checkpoints before dispatch**,
placed where errors would propagate, not at arbitrary elapsed-time intervals.
Typical checkpoints are after the first meaningful slice validates the approach,
after a core contract/state change and before dependent UI/integration work, and
after integration/regression evidence. Adapt these to the actual plan; do not
invent unnecessary phases for a small change.

Dispatch only up to the next checkpoint. At that boundary the worker stops and
returns its actual diff, test results, deviations and open questions; it cannot
authorize its own continuation. While it implements, the strong agent may prepare
independent verification or inspect downstream behavior without editing the same
files. Do not dispatch an unbounded whole-ticket worker and promise to review it
occasionally.

The strong agent inspects the code and evidence against the original goal, chosen
UI, settled decisions and contracts, and checks whether the work is still on the
intended path. Run targeted verification when needed; a worker's green-test claim
alone does not establish alignment. Post each checkpoint's result and evidence on
the ticket: **continue**, **correct before continuing** or **strong-agent takeover**.

On drift, stop dependent work, resolve the cause, update the plan and require the
correction before releasing the next slice. Escalate product/scope or changed UI
choices to the user; ordinary technical corrections stay with the strong agent.
Persistent inability to follow a settled plan calls for strong-agent takeover,
not repeated blind retries. Reassess suitability when new evidence changes it.

Checkpoint review and final implementation review are development supervision,
not the feature audit or ticket acceptance. After implementation-ready, still
wait for the user's `close` before the existing PR/audit/cleanup sequence.
