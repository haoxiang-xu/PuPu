# PuPu trace-chain architecture — grounding evidence (scratch, delete after)

PuPu = React 19 + Electron 40 desktop AI client, JS-only, inline styles, custom mini_router.
A Flask sidecar (`unchain_runtime`) drives an `unchain` agent and emits SSE runtime events.
The "trace chain" = the reasoning/tool-call/response chain rendered inside a chat message bubble.

## The layer stack (frame source -> render), with ownership

1. BACKEND frame source (owner: pupu-dev-backend; frame SEMANTICS owned by pupu-llm-expert)
   - Flask `/chat/stream/v4` emits SSE `event: runtime_event` frames.
   - Core truth source: `unchain/src/unchain/events_v4/types.py`, `RUNTIME_EVENT_TYPES_V4` = 13 typed events:
     session.started, run.started/completed/failed, turn.started/completed,
     step.started/delta/completed (replaces old model.*),
     interaction.requested/resolved (replaces old input.*),
     artifact.created/updated (v4-new).
   - Each RuntimeEvent has: schema_version:"v4", event_id (dedupe key), seq (sort key),
     type, optional links{} (only tool_call_id + interaction_id actually read; channel_id/team_id/
     plan_id are dead scaffolding), optional payload{} (core does NOT constrain payload internals;
     payload schema is STILL unsigned between renderer and core — runtime-events-v4.md section 7).

2. ELECTRON relay (owner: pupu-dev-electron, IPC artery co-owned w/ CTO)
   - All stream versions (V1/V2/V3/V4) share ONE return IPC channel STREAM_EVENT.
   - Envelope shape fixed: { requestId, event, data }. Version demux happens in preload/renderer.
   - V4 preload listener DIRECTLY DELEGATES to the V3 listener. V4 reuses V3 transport entirely.

3. RENDERER SERVICE LAYER (owner: pupu-dev-chat-core)
   - Stream path chosen by priority V4 > V3 > V2 in use_chat_stream.js (V4 hardcoded on).
   - `src/SERVICEs/runtime_events/` (V3) and `src/SERVICEs/runtime_events_v4/` (V4):
     - event_store.js: validate schema_version, dedupe by event_id, sort by seq, diagnostics.
     - activity_tree.js: reduceActivityTree(prev, snapshot) -> ActivityTree state holding
       run/turn/tool/model/input state. CRITICAL: it ALSO "degrades" typed step.*/interaction.*
       events back into LEGACY v2-style "frame effects" (e.g. interaction.requested ->
       a tool_call frame named ask_user_question via links.tool_call_id/interaction_id).
     - trace_chain_adapter.js: adaptActivityTreeToTraceChain(state) -> FLATTENS the tree into the
       LEGACY flat TraceChain props.
   - V4 adds: renderer-side batching (batchRuntimeEvents:true, ~64ms flush) + artifact summary.
     Otherwise V4 == V3 structurally; V4 reuses V3's whole render pipeline by down-degrading.

4. LEGACY TRACECHAIN PROPS CONTRACT (the seam everything collapses to). The renderer still consumes:
     { frames, status, streamingContent, subagentFrames, subagentMetaByRunId,
       toolConfirmationUiStateById, bundle, error }
   - `frames` is a FLAT ARRAY of v2-shaped frames with types:
     reasoning, observation, tool_call, tool_result, final_message, error, stream_started, done.
   - The typed run/turn TREE structure is collapsed to a flat list. Root frames -> `frames`;
     child-run frames -> `subagentFrames[runId]`. (Even subagent routing relies on a documented
     compatibility heuristic when backend doesn't emit explicit links.parent_run_id.)

5. RENDER COMPONENT (owner: pupu-dev-chat-bubble): `src/COMPONENTs/chat-bubble/trace_chain.js` (1743 lines).
   - Re-DERIVES structure from the flat `frames` array via post-hoc heuristics.
   - DISPLAY_FRAME_TYPES = {reasoning, observation, tool_call, tool_result, final_message, error}.
   - It must decide which final_message frames go in the timeline vs. which is THE final answer
     rendered by the separate AssistantMessageBody bubble.

## Bug #155 root (no-tool-call first turn rendered as BOTH "tool call" AND "final response")
trace_chain.js intermediateFinalMessageSeqs (lines 687-743):
  - If !bubbleOwnsFinalMessage -> all final_messages go to timeline.
  - Else: const hasToolCall = frames.some(f => f.type === "tool_call"); if (!hasToolCall) return empty;
  - So a SINGLE tool_call frame ANYWHERE flips every final_message (incl. the pure first-turn answer)
    into "intermediate" -> rendered in the timeline AS WELL AS the bubble.
  - There's a SECOND de-dupe heuristic at final_message render (lines 1487-1499):
    skip if isStreaming && normalizedLiveText.startsWith(content.trim()).
  - Multiple overlapping, fragile post-hoc heuristics try to reconstruct "is this the final answer".
  - The orchestration NEVER tells the renderer explicitly: "this turn has no tool call; its text IS
    the final response." The renderer guesses, and guesses wrong on the no-tool-call case.

## Bug #66 root (pause/stop loses already-generated content)
On stopStream -> cancelCurrentStreamAndSettleMessages (use_chat_stream.js 599-649):
  - it calls materializeStreamingMessages then settleStreamingAssistantMessages, then clearChat()
    on the streaming store (line 639).
settleStreamingAssistantMessages (chat_turn_utils.js 6-40):
  - const content = getStreamingMessageText(message); if (!content) continue;  <-- message DROPPED.
getStreamingMessageText (streaming_message_chunks.js 53-59):
  - reads ONLY message.streamingChunks (a chunked text buffer).
  - If the live content lives in trace frames / the streaming store and NOT yet folded into
    streamingChunks, content is "" -> the streaming assistant message is skipped entirely on cancel.
  - State ownership is split: live content lives in (a) the streaming message store, (b) the flat
    frames array (reasoning/tool_call/partial final_message), and (c) message.streamingChunks.
    The settle path only reads (c). So a paused turn whose output is in (a)/(b) is lost.

## ADDITIONAL grounding (corroborated by second deeper read)
- ActivityTree state (reduceActivityTree) holds a REAL typed tree: session, status, rootRunId,
  runsById{runId->{agentId,parentRunId,status,mode,template,lineage,...}}, toolCallsById,
  inputRequestsById{resolved,decision,response}, modelTextByRunId{runId->accumulated text},
  frames[], framesByRunId{childRunId->frames}, artifactSummariesByTurnId, effects[], completionBundle.
  -> The tree HAS the structure. adaptActivityTreeToTraceChain THEN flattens it to legacy props.
- activity_tree ALSO does v3-degradation INSIDE the reducer (stepEventToProjected,
  interactionRequestedToProjected): step.* -> model.*, interaction.requested -> tool_call frame.
  So there are TWO degradations: v4->v3-projected events, then tree->flat frames.
- #155 is WORSE than render-only: use_chat_stream.js onFrame tool_call handler (~2787-2864) INJECTS a
  SYNTHETIC final_message frame (seq = frame.seq - 0.5) built from the live streaming buffer whenever a
  tool_call frame arrives and the buffered text wasn't "alreadyCaptured", THEN clears the streaming buffer.
  So the duplicate-render is partly MANUFACTURED by chat-core, not just mis-segmented by the renderer.
  Plus activity_tree may emit a tool_call frame on a legacy/human-input path even with no real tool call.
  => #155 has THREE contributing sites: activity_tree (maybe-bogus tool_call), chat-core (synthetic
     final_message injection), trace_chain.js (no dedup between the two + hasToolCall heuristic).
- #66 is a CONTRADICTION-STATE problem, not just data-loss: settle preserves traceFrames but flips status
  to "cancelled"; the preserved frames reference INCOMPLETE ops (pending tool_call w/ no result, running
  iteration). AND if streamingChunks is empty the whole message is dropped (chat_turn_utils 25-27).
  => On cancel there is no single "freeze the current state into a coherent finished snapshot" operation;
     three stores (streaming store, traceFrames on message, streamingChunks) settle independently and
     inconsistently.

## Structural diagnosis (architect's read)
- The defining tension: a TYPED, TREE-shaped, versioned event model (v4 step.*/interaction.*/artifact.*)
  is round-tripped DOWN into a flat, legacy, v2-era frame array, and the renderer re-derives the
  structure the events already carried. This lossy down-degrade is why V4 could "reuse V3 rendering",
  but it's also the source of both bugs: information the events HAD (turn boundaries, "this step is the
  final model output with no tool call", which text is canonical) is thrown away at the adapter, then
  guessed back at render time.
- State ownership for "what was generated so far" is split across 3 stores with no single source of truth,
  which is why cancel/pause can't reliably preserve it (#66).
- payload schema is still UNSIGNED between renderer and core (v4 doc section 7), so the contract the renderer
  depends on isn't even pinned down.
- The two big files (trace_chain.js 1743 lines, use_chat_stream.js 3704 lines) concentrate this complexity.

## Constraints (load-bearing, non-negotiable)
- JS only, no TS, no PropTypes. Inline styles only. Custom mini_router.
- React code never touches ipcRenderer; all system access via window.* bridges.
- STREAM_EVENT envelope {requestId,event,data} is a cross-surface IPC contract (CTO impact analysis to change).
- V2 and V3 must remain as fallback paths (do not delete; V4>V3>V2).
- Ownership is split across 4 dev agents: chat-bubble (render), chat-core (orchestration+service layer),
  backend (frame source impl), llm-expert (frame semantics + payload schema, has veto on model-visible behavior).
  The architect designs + slices; the CTO dispatches; no direct dev command.
- The "many future features" the CEO wants this to carry includes: artifacts/workspace
  change tracking, subagents/A2A (channel/team/plan links reserved), human-in-the-loop interactions,
  permission/sandbox gating — all already hinted in the reserved-but-unused link fields.
