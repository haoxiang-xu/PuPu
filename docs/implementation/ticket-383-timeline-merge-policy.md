# Ticket 383: per-tool timeline merge policy

## Provenance

- Unchain source starts from immutable base 1ec49ddfc28d3b42ba035debada5e3db759dad1b on codex/ticket-383-timeline-merge-policy.
- PuPu starts from spacing commit 901ba813 on codex/ticket-383-tool-call-grouping.
- The pre-existing pinned runtime remains at 1ec49dd; this change does not replace or restart it.
- The policy is display-only metadata. It does not enter provider tool schemas, confirmation requests, durable interaction payloads, receipts, or tool capability/configuration digests.

## BC-383-01: developer declaration to runtime presentation

Tool, Tool.from_callable, Tool.__call__, @tool (both forms), Toolkit.register, and Toolkit.tool accept timeline_merge_policy. Valid values are never, no_feedback, approved, and always; the default is approved. Invalid values raise ValueError in the Python API. The built-in ask_user_question tool declares never; a developer may explicitly override it through normal Tool registration.

The field is stored on the Tool object only. It is not serialized into provider JSON or hashed tool configuration. Runtime tool_call callbacks emit the scalar beside the original call identity and arguments.

## BC-383-02: Python event transport

Both the legacy execution harness and Context V2 tool-authority harness emit the scalar. The observed/shadow and canonical semantic projectors preserve a recognized value on their tool_call payloads. The runtime normalizer carries it to step.started and, when present on the source event, to interaction presentation outside the copied durable request. Unrecognized values are omitted by the normalizer. Older producers omit the optional field and retain the documented renderer fallback.

PuPu toolkit metadata carries a valid declaration for live enrichment. An already-present call scalar wins, so a changed live toolkit configuration cannot replace an explicitly recorded declaration. Cold interaction presentation reads the exact original tool_call event using the request subject cursor and matches both cursor fields, session/execution, source attempt, call ID, and tool name. The read uses the existing read-only Unchain journal path and exact active owner admission. Missing or ambiguous history leaves legacy fallback behavior; ask_user_question falls back to never. No current-tool lookup mutates or rebinds the durable interaction request.

## BC-383-03: renderer boundary

Frontend grouping consumes the optional scalar as presentation metadata. It does not change callbacks, approval decisions, interaction submission, execution authorization, or durable receipts. See the renderer implementation and tests in this branch.

## SEQ-383-01: ordinary approval

A call enters the timeline with its declared policy. Pending approval remains independently actionable under approved; after positive approval and execution completion, eligible same-identity calls may appear in the same visual group. The original call, interaction ID, decision handler, and result remain attached to the individual member.

## SEQ-383-02: explicit always

A developer declaration of always can group calls that have pending or resolved feedback. The feedback controls and member state remain visible in the group's member content; grouping does not invoke or coalesce individual callbacks.

## SEQ-383-03: restart and older traces

A restart reconstructs presentation policy only from the source call's exact scoped journal event. A request's hashed payload is not changed. Older traces with no policy value use their normal legacy behavior; reserved question rendering uses never.

## AC-383 evidence state

| Acceptance item | State | Evidence |
|---|---|---|
| API enum/default/override/schema invariant | Partial PASS | Focused Unchain API and provider-schema test: 10 passed. Tests cover direct construction, callable conversion, decorator forms, toolkit registration, invalid values, reserved question default/override, clone preservation, and unchanged provider schemas. |
| Normalizer/projector transport and request isolation | Partial PASS | Same focused Unchain test covers canonical tool-call projection, normalized step.started, malformed/absent values, and interaction metadata outside the durable request. |
| PuPu metadata and exact cold-call provenance | Partial PASS | Focused PuPu transport test: 2 passed, including explicit scalar precedence and exact cursor/attempt/call/name matching through the cold helper. |
| Full 4x5 policy behavior and per-call UI actions | NOT RUN HERE | Renderer and end-to-end verification remain with parent review. |
| Red-before-green original representative screenshot sequence | NOT RUN HERE | Private screenshots and raw trace evidence remain outside the repository. |
| Candidate wheel digest and exact pair verification | NOT RUN HERE | Parent will build one candidate wheel from the committed Unchain source and reuse those exact bytes. |
| Full relevant Python and JavaScript suites | NOT RUN HERE | Focused tests above only; broader suites remain to be run and baseline failures recorded separately. |
| Live window / rollout state matrix | NOT RUN HERE | Running pinned runtime and user session were intentionally left untouched. |
