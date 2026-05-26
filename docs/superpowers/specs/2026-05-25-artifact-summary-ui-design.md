# Artifact Summary UI — PuPu Frontend Design

**Status:** Draft
**Date:** 2026-05-25
**Scope:** PuPu frontend only. Unchain artifact generation, normalization, and event emission are owned by the companion Unchain plan and out of scope here.

---

## 1. Goal

When an agent iteration completes, PuPu should render a compact, semantic summary of what the agent produced — file changes, plan revisions, and future artifact kinds (markdown, table, kv, log, link) — anchored to the assistant message that produced them.

The TraceChain timeline above the assistant message remains the inline view of the *process*. The new ArtifactSummary is the view of the *product*. Together they cover the two questions the user is asking after each iteration: "what did the agent do" and "what did it produce".

## 2. Non-Goals

- Generating, normalizing, or persisting artifact descriptors in Unchain (owned by Unchain plan).
- Restore / revert from snapshots. V1 is read-only.
- Custom toolkit-supplied HTML/CSS renderers. V1 renders semantic snapshots only.
- Side panels, floating drawers, or any layout outside the assistant message bubble.
- Cross-turn aggregation (e.g., a single rolled-up summary for an entire user message). Each turn gets its own summary.

## 3. Inputs from Unchain (consumed only)

PuPu consumes the runtime events defined in the Unchain artifact plan. Reproduced here for clarity:

- New runtime event types: `artifact.created`, `artifact.updated`
- Canonical descriptor `unchain.artifact.v1`:
  - `artifact_id`, `kind`, `title`, `summary`, `revision`, `status`
  - `owner`: `run_id`, `turn_id`, `tool_name`, `call_id`
  - `snapshot`: immutable rendered content, `sha256`, truncation metadata
  - `source`: optional live path/url (provenance only)
  - `presentation`: `surface: "iteration_summary"`, `group`, `collapsed`
- Turn boundary events: `turn.started`, `turn.completed`, `run.completed`

PuPu treats `snapshot` as the only render source. `source.path` is provenance.

## 4. Visual Design

### 4.1 Position

Each ArtifactSummary lives inside its owning assistant message bubble, positioned **after** the final answer markdown.

```
[assistant message bubble]
  ├─ TraceChain                  (existing, process view)
  ├─ AssistantMessageBody        (existing, final answer markdown)
  └─ ArtifactSummary             (new, product view)
```

Multiple turns under one user message produce multiple ArtifactSummary blocks in order, one per `turn_id`. There is no umbrella "iteration N" header — turns are visually delimited by the cards themselves and by any new TraceChain frames that follow.

### 4.2 Container

ArtifactSummary is not a card. It is a vertical stack of independent cards, one per artifact kind present in the turn:

```
ArtifactSummary
  ├─ FilesChangedCard
  ├─ PlanCard
  ├─ MarkdownCard         (future kinds, same layout idiom)
  ├─ TableCard
  ├─ KvCard
  ├─ LogCard
  └─ LinkCard
```

Each card has its own collapsed/expanded state and defaults to **collapsed** on first appearance. The user's most recent expand/collapse choice is not persisted across reloads in v1; reloaded summaries open collapsed. There is no global "expand all" affordance.

If a turn produces zero artifacts, ArtifactSummary renders nothing — no placeholder, no "Done" chip, no container.

### 4.3 FilesChangedCard

Aggregates **all** `file_diff` artifacts emitted in the turn. Each artifact stays distinct internally (Codex contract: file_diff artifacts are append-only per tool call and never merged at the protocol level), but the UI groups them under one card to keep the summary readable.

**Collapsed:**

```
┌──────────────────────────────────────┐
│  ▸  Files changed · 3   +42 −8       │
└──────────────────────────────────────┘
```

- N = total number of `file_diff` artifacts in the turn (same path written twice counts twice).
- +N −M = sum of `additions` and `deletions` across all file_diff snapshots in the turn.

**Expanded:**

```
┌──────────────────────────────────────┐
│  ▾  Files changed · 3   +42 −8       │
│  ──────────────────────────────────  │
│  ▸  src/auth.js          edit  +20 −3│
│  ▸  src/router.js        edit  +15 −2│
│  ▸  src/auth.test.js     new   +7 −3 │
└──────────────────────────────────────┘
```

- Rows render in chronological order of artifact emission (so a file written twice appears twice, in execution order).
- Each row toggles independently to render the unified diff inline via the extracted `DiffBody` component (see §5).
- Row metadata: `path`, `operation` (whatever string Unchain emits — `edit`, `create`, `delete`, etc. — rendered uppercase as an operation badge matching the existing `code_diff_interact` styling), `+N −M`.
- Fallback chips for special cases (right-aligned in the row): `Binary file`, `Truncated · X/Y lines`.

**Snapshot field normalizer.** Backend field names may drift slightly across protocol revisions (`operation` vs `sub_operation`, `unified_diff` vs `unifiedDiff`). FilesChangedCard reads through a small normalizer that:

- Accepts either snake_case or camelCase for `unified_diff` and `operation`.
- Computes `additions` / `deletions` by counting `^+` / `^-` lines in the unified diff when the descriptor omits the stats.
- Treats a descriptor with no unified diff and no `binary` flag as "Empty diff" (still rendered as a row, but expansion shows a one-line "Empty diff" placeholder).

This isolates downstream UI from minor schema drift without papering over genuinely malformed payloads.

### 4.4 PlanCard

A turn shows one PlanCard per distinct `plan_id` present in that turn (typically one). Multiple plan_update events for the same `plan_id` replace the displayed revision — only the latest revision is shown. Historical revisions remain inspectable through the underlying runtime event log but are not surfaced in v1 UI.

**Collapsed:**

```
┌──────────────────────────────────────┐
│  ▸  Plan · Auth refactor · draft     │
└──────────────────────────────────────┘
```

- `title` from `artifact.title`.
- Status chip: `draft` | `finalized` (sourced from `snapshot.status`; v1 does not infer status from markdown).

**Expanded:**

```
┌──────────────────────────────────────┐
│  ▾  Plan · Auth refactor · draft     │
│  ──────────────────────────────────  │
│  # Auth refactor                     │
│  ## Goals                            │
│  - Remove session-token storage      │
│  - Add OIDC adapter                  │
│  ...                                  │
│  ──────────────────────────────────  │
│  Truncated · 400 / 960 lines         │
│  Open source file ↗                  │
└──────────────────────────────────────┘
```

- Body renders `snapshot.markdown` by importing the existing `SeamlessMarkdown` component directly from `src/COMPONENTs/chat-bubble/components/seamless_markdown.js`. Do not wrap the snapshot in a fake assistant message and route it through `AssistantMessageBody` — that path is purpose-built for live message rendering and reusing it here would couple PlanCard to streaming concerns it doesn't have.
- When `snapshot.truncated` is true, render a footer band:
  - Primary text: `Truncated · {displayed_lines} / {total_lines} lines`
  - Below it (v1 fallback, see below): a non-interactive secondary line showing `Source: {source.relative_path || source.path}`.

**"Open source file" deferred to v2.** v1 does **not** ship a click-to-open affordance. PuPu has no existing renderer-safe IPC for opening arbitrary workspace paths in the host editor; spec-ing one for this single button would expand scope into Electron bridge territory unrelated to the summary feature. v1 surfaces the path as text only. If a future workspace-open IPC lands (e.g., as part of the web browser feature or a dedicated bridge), PlanCard upgrades the path text to a clickable affordance with the warning tooltip: "Opens the current file. Content may differ from the snapshot above."

### 4.5 Metadata-driven generic fallback

Artifact card chrome is driven by Unchain toolkit/catalog metadata, not by fields embedded in runtime artifact events:

- `artifact.title` remains the content title.
- `artifactKinds[].displayName` is the kind/card label.
- `artifactKinds[].icon` is a PuPu builtin icon id or an installed toolkit/plugin static icon payload materialized by catalog.
- `artifactKinds[].fallbackRenderer` selects one semantic renderer: `markdown`, `text`, `table`, `kv`, `log`, `link`, or `json`.

Artifact runtime events must not carry raw SVG, HTML, CSS, React renderer code, or `presentation.icon` hints. PuPu owns rendering and only reads immutable `snapshot` data plus catalog metadata.

V1 keeps specialized `FilesChangedCard` and `PlanCard` for `file_diff` and `plan`. All other structurally valid artifact kinds render through `GenericArtifactCard`, using the registry metadata when available and a safe `information` icon / JSON fallback when unavailable. Future kind-specific cards can replace the generic path without changing the artifact event schema.

## 5. Component Architecture

### 5.1 New files

- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js` — top-level container, takes `artifacts: Artifact[]` for one turn, dispatches to per-kind cards.
- `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/generic_artifact_card.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_icon.js`
- `src/COMPONENTs/diff/diff_body.js` — extracted from `code_diff_interact.js` (see §5.3).

### 5.2 Modified files

- `src/COMPONENTs/chat-bubble/chat_bubble.js` — render `<ArtifactSummary>` after `<AssistantMessageBody>` for each completed turn bucket.
- `src/COMPONENTs/chat-bubble/character_chat_bubble.js` — render the same `<ArtifactSummary>` after its `<AssistantMessageBody>`. CharacterChatBubble is the dedicated rendering path for character chats and currently mirrors the structure of chat_bubble.js; without this change, character-chat agents that emit artifacts would have their summaries silently dropped on screen.
- `src/SERVICEs/runtime_events/event_store.js` — add `artifact.created` and `artifact.updated` to `RUNTIME_EVENT_TYPES`.
- `src/SERVICEs/runtime_events/activity_tree.js` — add `artifactSummariesByTurnId` reducer state and emit `artifact_summary` effects (see §5.4 and §5.5).
- `src/PAGEs/chat/hooks/use_chat_stream.js` — consume `artifact_summary` effects and surface `artifactSummariesByTurnId` on the assistant message.
- `src/SERVICEs/chat_storage/chat_storage_sanitize.js` — add `sanitizeArtifactSummariesByTurnId`; preserve it through the assistant branch of `sanitizeMessage` (see §5.6).
- `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js` — import `DiffBody` from the new shared location; remove the local copy.

### 5.3 DiffBody extraction

Move `parseDiffLines` and `DiffBody` from `code_diff_interact.js` into `src/COMPONENTs/diff/diff_body.js`. Both call sites (pre-execution confirmation and post-execution FilesChangedCard) import from the new location.

Extraction is conservative: the public API stays `{ unifiedDiff, isDark }`. Internal color tokens may be parameterized later if the two consumers diverge visually, but v1 keeps them identical.

### 5.4 Reducer behavior

`activity_tree.js` adds:

```js
state.artifactSummariesByTurnId: Record<turnId, {
  order: number,           // monotonically increasing per turn arrival
  status: "pending" | "completed",
  artifacts: Artifact[],
}>
```

The wrapper carries `status` and `order` because the UI must wait for `turn.completed` to mount a summary, must render multiple turns in execution order, and must survive history serialization. Storing only the raw artifact list (the v1 draft of this spec) is not enough.

**Event-to-state mapping.** Unchain's canonical `unchain.artifact.v1` descriptor lives directly in `event.payload` — there is no `event.payload.artifact` wrapper. Resolve `turn_id` in this order:

```js
event.turn_id ?? event.payload?.owner?.turn_id ?? event.links?.turn_id
```

Resolve `artifact_id` from `event.payload.artifact_id`.

- `artifact.created`: lazy-create the turn bucket with `status: "pending"` and a fresh `order`; push the descriptor into `artifacts`.
- `artifact.updated`: find the existing entry by `artifact_id` and replace in place. If absent (out-of-order delivery), push it; this also keeps `plan:{plan_id}` updates working when only the update is observed.
- For `file_diff` artifacts, each `artifact.created` appends a new entry — Unchain guarantees a fresh `artifact_id` per tool call, so the reducer never coalesces them. UI-side aggregation under one FilesChangedCard happens in the component layer.
- If an unexpected `artifact.updated` for `file_diff` arrives, log a dev-mode warning and replace in place. Do not crash.
- `turn.completed`: mark the corresponding turn bucket `status: "completed"`. If no bucket exists yet (turn produced zero artifacts), do not create one.
- `run.completed`: flush any remaining buckets with `status: "pending"` to `status: "completed"`. This backstops degenerate runs that never emit explicit `turn.completed`.
- No cross-turn aggregation. No archival beyond assistant message persistence.

### 5.5 UI effects

`use_chat_stream.js` already consumes a stream of effects emitted by `activity_tree.js` (e.g., `state.effects.push({ type: ... })` at multiple sites). To keep this consistent, the reducer emits a new effect type:

```js
state.effects.push({
  type: "artifact_summary",
  turnId,
  reason: "created" | "updated" | "completed" | "flushed",
});
```

- `artifact.created` / `artifact.updated` emit an effect only when the turn bucket is already `completed` (so the UI knows to re-render an already-mounted summary).
- `turn.completed` always emits a `completed` effect — this is the trigger for first mount.
- `run.completed` emits one `flushed` effect per pending turn it flushes.

`use_chat_stream.js` translates these effects into store updates on the assistant message, mirroring how it already handles other runtime effects.

### 5.6 Persistence

Artifact summaries ride along with the assistant message into chat history. The serialized assistant message shape gains an `artifactSummariesByTurnId` field with the exact shape from §5.4.

Concretely:

- `src/SERVICEs/chat_storage/chat_storage_sanitize.js` adds a `sanitizeArtifactSummariesByTurnId` helper, mirroring the existing `sanitizeSubagentFramesByRunId` / `sanitizeTraceFrames` pattern.
- The assistant branch of `sanitizeMessage` (currently at `chat_storage_sanitize.js:554`) preserves `artifactSummariesByTurnId` through serialization.
- On reload, the rehydrated buckets are already `status: "completed"` (only completed buckets are persisted — pending buckets at write time were flushed by `run.completed`); ArtifactSummary mounts directly from the persisted snapshots without any Unchain round-trip.

The sanitizer must preserve unknown but structurally valid artifact kinds. It only drops descriptors missing required fields (`artifact_id`, `kind`, `snapshot`) or malformed buckets. This keeps persisted history compatible with future toolkit-defined artifact kinds.

### 5.7 Streaming behavior

ArtifactSummary does **not** render in the streaming state. It first appears when the turn bucket transitions to `status: "completed"`, which happens on `turn.completed` (or `run.completed` as a backstop for the final turn).

Rationale: inline TraceChain already provides live feedback during the iteration. Showing a half-finalized summary parallel to it creates two competing live views. Waiting for `status: "completed"` keeps the contract simple — ArtifactSummary always renders finalized snapshots.

## 6. Visual Specifications

- Card border: `1px solid {secondary}` (matches the existing `#8c959f` light / `#6e7681` dark). **No background fill** — adheres to the project's mini_ui minimalism preference.
- Status chip and operation badge: the only places allowed to use a low-opacity background fill (`hexToRgba(accent, 0.14)`), matching the existing pattern in `assistant_message_body.js` error chip and `code_diff_interact.js` operation badge.
- Expand/collapse indicator: `▸ / ▾` characters in the row header. No animated background highlight, no rotation transition beyond what `▸→▾` swap already provides.
- Inter-card spacing: same vertical rhythm as TraceChain frames (likely 8px gap). Match by reading the existing chat_bubble margin scale; do not introduce new spacing tokens.
- Typography: same as TraceChain frame headers for card titles; same as `AssistantMessageBody` for plan markdown body.
- Dark mode: derived from `isDark` prop already threaded through the chat bubble. No separate theme tokens.

## 7. Edge Cases

- **Zero artifacts in turn:** ArtifactSummary renders nothing. No empty container.
- **Only artifacts, no final answer text:** ArtifactSummary still renders. Visual position is simply "after the (empty) final answer area".
- **Multiple turns in one user message:** ArtifactSummary blocks stack chronologically by turn order. No global merge.
- **artifact.updated arriving after turn.completed:** treat as part of the same turn, update in place. Re-render the affected card. Unchain's design ensures updates are still bounded by the run.
- **Same file written twice in one turn:** two `file_diff` artifacts, two rows in FilesChangedCard, in execution order. Header count reflects both.
- **Plan artifact with `revision` regression (lower revision arriving later):** ignore — higher revision wins. Defensive against out-of-order events.
- **Binary or unparseable diff:** `DiffBody` shows the fallback chip from §4.3. Does not attempt to render bytes.
- **Snapshot truncated to zero lines:** still render the card with collapsed header; on expand show the truncation footer only.
- **Unknown artifact kind:** preserve and render through `GenericArtifactCard`. If catalog metadata is unavailable, use a safe `information` icon, a humanized kind label, and JSON fallback rendering. See §4.5.

## 8. Test Plan

Tests are colocated next to their subject (`<file>.test.js`), matching the existing PuPu convention.

- **Reducer** — `src/SERVICEs/runtime_events/activity_tree.test.js`
  - `artifact.created` populates `artifactSummariesByTurnId[turn_id]` with `status: "pending"` and a fresh `order`.
  - `artifact.updated` for a `plan:{plan_id}` replaces the existing entry; revision regression is ignored.
  - Two `file_diff` artifacts in one turn append two entries in execution order.
  - `turn.completed` flips status to `"completed"` and emits an `artifact_summary` effect with `reason: "completed"`.
  - `run.completed` flushes pending buckets and emits one `flushed` effect per turn flushed.
  - Cross-turn isolation: artifacts in turn A do not leak into turn B's bucket.
  - Unknown kinds are dropped, with a single warn per kind.
  - `turn_id` is resolved via the documented `event.turn_id ?? event.payload?.owner?.turn_id ?? event.links?.turn_id` order.

- **Components**
  - `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.test.js`: renders nothing for empty input; renders nothing for `pending` buckets; renders cards for `completed` buckets.
  - `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`: collapsed header file count and `+N −M` stats; row expansion mounts `DiffBody`; binary/truncated fallbacks; normalizer accepts both `unified_diff` and `unifiedDiff` and computes missing stats.
  - `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`: collapsed header title and status chip; expanded body renders via `SeamlessMarkdown`; truncated footer with provenance path; dark/light styling correctness.

- **ChatBubble integration**
  - `src/COMPONENTs/chat-bubble/chat_bubble.test.js`: completed turn buckets render `<ArtifactSummary>` after `<AssistantMessageBody>`; multiple completed turns produce multiple summaries in `order`.
  - `src/COMPONENTs/chat-bubble/character_chat_bubble.test.js`: same behavior on the character chat path.

- **Persistence** — `src/SERVICEs/chat_storage/chat_storage_sanitize.test.js` (extend existing file or add)
  - Assistant message round-tripped through `sanitizeMessage` preserves `artifactSummariesByTurnId` exactly for valid descriptors.
  - Descriptors missing `artifact_id`, `kind`, or `snapshot` are dropped without dropping the rest of the bucket.
  - Reload-from-storage test: rehydrated buckets render identically to the original even when the underlying source file has changed (mock a different file content and assert the snapshot still renders).

- **DiffBody extraction regression** — `src/COMPONENTs/diff/diff_body.test.js`
  - `parseDiffLines` returns identical output to the pre-extraction implementation for a set of representative diffs (added, removed, mixed, hunk-only, binary fallback).
  - Visual snapshot test for the rendered output ensures the pre-execution `code_diff_interact` UI does not regress.

## 9. Open Questions

- **Inter-card spacing token:** existing chat-bubble vertical rhythm is implicit. Decide during implementation whether to expose a numeric constant in a shared module or inline `8px`. Lean: inline for v1, factor out later only if other consumers need it.
- **Multi-card "expand all":** explicitly out of scope for v1. Revisit if user feedback says individual disclosures get tedious.
- **Effect debouncing:** if many `artifact.updated` events arrive in quick succession for the same already-completed turn (e.g., plan updates across a long iteration), the reducer currently emits one effect per event. Decide during implementation whether this is fine or whether to coalesce to one effect per microtask. Lean: leave it un-debounced for v1; revisit only if profiling shows it as a hot path.

## 10. Out of Scope (Future Work)

- Restore / revert flows from a `file_diff` snapshot (must be hash-guarded against current file state; depends on Unchain implementing the matching producer-side commitment).
- Cross-turn artifact aggregation views (e.g., "show me all files changed in this conversation").
- Diff search / filtering within FilesChangedCard.
- Custom renderer plugin slot (third-party toolkit renderers).
- Inline file open via PuPu's web browser feature — possible v2, but v1 only opens via OS file association on `source.path`.

---

## Appendix A — File Touch Summary

| File | Action |
|------|--------|
| `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js` | create |
| `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js` | create |
| `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js` | create |
| `src/COMPONENTs/diff/diff_body.js` | create (extracted) |
| `src/COMPONENTs/chat-bubble/chat_bubble.js` | edit |
| `src/COMPONENTs/chat-bubble/character_chat_bubble.js` | edit (parallel integration) |
| `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js` | edit (re-import DiffBody) |
| `src/SERVICEs/runtime_events/event_store.js` | edit |
| `src/SERVICEs/runtime_events/activity_tree.js` | edit |
| `src/SERVICEs/chat_storage/chat_storage_sanitize.js` | edit |
| `src/PAGEs/chat/hooks/use_chat_stream.js` | edit |

## Appendix B — Vocabulary

- **Artifact** — a semantic, immutable snapshot of agent output, owned by Unchain.
- **Turn** — one model iteration: model call + tool batch.
- **Run** — the full agent activation, possibly spanning multiple turns.
- **Snapshot** — the rendered content captured at artifact emission time. Never re-read from disk.
- **Provenance** — the live source location (path/url) recorded for context only.
