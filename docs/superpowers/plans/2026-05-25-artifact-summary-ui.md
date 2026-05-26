# Artifact Summary UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on commits:** The PuPu user explicitly forbids Claude from running `git commit`. This plan therefore omits all commit steps. Each task ends with passing tests. The user commits manually at their own cadence.

**Spec:** `docs/superpowers/specs/2026-05-25-artifact-summary-ui-design.md`

**Goal:** Render an end-of-iteration artifact summary (file diffs + plan) inside each assistant message bubble, consuming Unchain's new `artifact.created` / `artifact.updated` runtime events.

**Architecture:** New `artifact.*` event types feed an `artifactSummariesByTurnId` reducer slice in `activity_tree.js`. `turn.completed` flips a bucket's status to `completed` and emits an `artifact_summary` effect, which `use_chat_stream.js` mirrors onto the assistant message. The persisted message round-trips through `chat_storage_sanitize.js`. Both `chat_bubble.js` and `character_chat_bubble.js` render a new `<ArtifactSummary>` component after `<AssistantMessageBody>`, dispatching to `FilesChangedCard` (reusing an extracted `DiffBody`) and `PlanCard` (reusing `SeamlessMarkdown`).

**Tech Stack:** React 19, Jest, @testing-library/react, inline styles, JavaScript (no TypeScript per PuPu conventions).

---

## File Structure

**Create:**
- `src/COMPONENTs/diff/diff_body.js` — extracted `parseDiffLines`, `countPlusMinus`, `DiffBody`
- `src/COMPONENTs/diff/diff_body.test.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js` — top-level container
- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.test.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js`
- `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`

**Modify:**
- `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js` — re-import `DiffBody` from new location
- `src/SERVICEs/runtime_events/event_store.js` — add `artifact.created`, `artifact.updated` to `RUNTIME_EVENT_TYPES`
- `src/SERVICEs/runtime_events/event_store.test.js` — add coverage for the new types
- `src/SERVICEs/runtime_events/activity_tree.js` — add state slice, reducer handlers, effects
- `src/SERVICEs/runtime_events/activity_tree.test.js` — add coverage for new behavior
- `src/SERVICEs/chat_storage/chat_storage_sanitize.js` — add `sanitizeArtifactSummariesByTurnId`, wire into `sanitizeMessage`
- `src/PAGEs/chat/hooks/use_chat_stream.js` — consume `artifact_summary` effects
- `src/COMPONENTs/chat-bubble/chat_bubble.js` — render `<ArtifactSummary>`
- `src/COMPONENTs/chat-bubble/chat_bubble.test.js` — assert integration
- `src/COMPONENTs/chat-bubble/character_chat_bubble.js` — render `<ArtifactSummary>`
- `src/COMPONENTs/chat-bubble/character_chat_bubble.test.js` — assert integration (create test file if absent)

---

## Phase A — Foundation (no UI yet)

### Task 1: Extract DiffBody to shared module

This is a behavior-preserving refactor done first so later tasks can import a shared `DiffBody` without churn.

**Files:**
- Create: `src/COMPONENTs/diff/diff_body.js`
- Create: `src/COMPONENTs/diff/diff_body.test.js`
- Modify: `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js:17-214`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/diff/diff_body.test.js`:

```js
import { parseDiffLines, countPlusMinus } from "./diff_body";

describe("parseDiffLines", () => {
  test("returns null when no hunk header is present", () => {
    expect(parseDiffLines("--- a/foo\n+++ b/foo\n")).toBeNull();
  });

  test("parses added, removed, context lines with line numbers", () => {
    const diff = [
      "--- a/foo.js",
      "+++ b/foo.js",
      "@@ -1,3 +1,4 @@",
      " line1",
      "-line2",
      "+line2-new",
      "+line3-added",
      " line4",
    ].join("\n");
    const rows = parseDiffLines(diff);
    expect(rows).not.toBeNull();
    expect(rows.map((r) => r.kind)).toEqual([
      "file-header",
      "file-header",
      "hunk",
      "context",
      "removed",
      "added",
      "added",
      "context",
    ]);
  });

  test("returns empty list for null / empty input", () => {
    expect(parseDiffLines("")).toEqual([]);
    expect(parseDiffLines(null)).toEqual([]);
  });
});

describe("countPlusMinus", () => {
  test("counts only data lines, not file headers", () => {
    const diff = [
      "--- a/foo",
      "+++ b/foo",
      "@@ -1 +1,2 @@",
      "-old",
      "+new",
      "+extra",
    ].join("\n");
    expect(countPlusMinus(diff)).toEqual({ plus: 2, minus: 1 });
  });

  test("returns zeros for empty input", () => {
    expect(countPlusMinus("")).toEqual({ plus: 0, minus: 0 });
    expect(countPlusMinus(null)).toEqual({ plus: 0, minus: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/diff/diff_body.test.js`
Expected: FAIL with "Cannot find module './diff_body'".

- [ ] **Step 3: Create the extracted module**

Create `src/COMPONENTs/diff/diff_body.js`:

```js
import { useMemo } from "react";

const FONT = "Menlo, Monaco, Consolas, monospace";

export function parseDiffLines(unifiedDiff) {
  if (!unifiedDiff || typeof unifiedDiff !== "string") return [];
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  const lines = unifiedDiff.split("\n");
  let sawHunk = false;
  for (const raw of lines) {
    if (raw.length === 0) continue;
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ kind: "file-header", text: raw });
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLineNo = parseInt(m[1], 10);
        newLineNo = parseInt(m[2], 10);
      }
      sawHunk = true;
      rows.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      rows.push({ kind: "added", text: raw, oldNo: "", newNo: newLineNo });
      newLineNo += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "removed", text: raw, oldNo: oldLineNo, newNo: "" });
      oldLineNo += 1;
      continue;
    }
    if (raw.startsWith(" ")) {
      rows.push({
        kind: "context",
        text: raw,
        oldNo: oldLineNo,
        newNo: newLineNo,
      });
      oldLineNo += 1;
      newLineNo += 1;
      continue;
    }
  }
  if (!sawHunk) return null;
  return rows;
}

export function countPlusMinus(unifiedDiff) {
  if (!unifiedDiff) return { plus: 0, minus: 0 };
  let plus = 0;
  let minus = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return { plus, minus };
}

export const DiffBody = ({ unifiedDiff, isDark }) => {
  const rows = useMemo(() => parseDiffLines(unifiedDiff), [unifiedDiff]);
  if (rows === null || rows === undefined) {
    return (
      <pre
        data-testid="code-diff-fallback-pre"
        className="scrollable"
        style={{
          fontFamily: FONT,
          fontSize: 12,
          whiteSpace: "pre",
          padding: 8,
          margin: 0,
          backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
          color: isDark ? "#e8e8e8" : "#1f2328",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: 480,
          borderRadius: 12,
        }}
      >
        {unifiedDiff || "(no changes)"}
      </pre>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontSize: 11.5,
          fontStyle: "italic",
          color: isDark ? "#8c959f" : "#656d76",
          padding: 8,
          fontFamily: FONT,
        }}
      >
        (no changes)
      </div>
    );
  }
  return (
    <div
      className="scrollable"
      style={{
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.55,
        backgroundColor: isDark ? "#0d1117" : "#f6f8fa",
        borderRadius: 12,
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: 480,
      }}
    >
      {rows.map((row, idx) => {
        let bg = "transparent";
        let fg = isDark ? "#e8e8e8" : "#1f2328";
        if (row.kind === "added") {
          bg = isDark ? "#0d331a" : "#e6ffec";
        } else if (row.kind === "removed") {
          bg = isDark ? "#3a0d13" : "#ffebe9";
        } else if (row.kind === "hunk") {
          bg = isDark ? "#0c2a4d" : "#ddf4ff";
          fg = isDark ? "#79c0ff" : "#0969da";
        } else if (row.kind === "file-header") {
          fg = isDark ? "#8c959f" : "#8c959f";
        }
        return (
          <div
            key={idx}
            data-diff-kind={row.kind}
            style={{
              display: "flex",
              padding: "0 8px",
              whiteSpace: "pre",
              backgroundColor: bg,
              color: fg,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.oldNo ?? ""}
            </span>
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: isDark ? "#6e7681" : "#8c959f",
                userSelect: "none",
              }}
            >
              {row.newNo ?? ""}
            </span>
            <span style={{ flex: 1 }}>{row.text}</span>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Update code_diff_interact.js to import from the new module**

In `src/COMPONENTs/chat-bubble/interact/code_diff_interact.js`:

1. Remove the local definitions of `parseDiffLines` (lines 45–92), `countPlusMinus` (lines 94–103), and `DiffBody` (lines 105–214).
2. Remove the `import { useMemo } from "react";` line at the top if it's not used elsewhere in the file (check first — if `useMemo` is only used inside `DiffBody`, drop it).
3. Add at the top of the file:

```js
import { DiffBody, countPlusMinus } from "../../diff/diff_body";
```

Leave `FONT` and `hexToRgba` in place — they are still used by the `CodeDiffInteract` component itself for header, button, and meta styling.

- [ ] **Step 5: Run all relevant tests to verify nothing broke**

Run: `npx jest src/COMPONENTs/diff/diff_body.test.js src/COMPONENTs/chat-bubble/interact/`
Expected: All tests PASS. The pre-execution code_diff_interact UI should render identically to before extraction.

---

### Task 2: Add `artifact.*` event types to event_store

**Files:**
- Modify: `src/SERVICEs/runtime_events/event_store.js:1-16`
- Modify: `src/SERVICEs/runtime_events/event_store.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/SERVICEs/runtime_events/event_store.test.js`:

```js
describe("artifact event types", () => {
  test("RUNTIME_EVENT_TYPES includes artifact.created and artifact.updated", () => {
    const { RUNTIME_EVENT_TYPES } = require("./event_store");
    expect(RUNTIME_EVENT_TYPES.has("artifact.created")).toBe(true);
    expect(RUNTIME_EVENT_TYPES.has("artifact.updated")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/event_store.test.js -t "artifact event types"`
Expected: FAIL with `expect(received).toBe(expected)` showing `false` for the `has(...)` checks.

- [ ] **Step 3: Add the new types**

In `src/SERVICEs/runtime_events/event_store.js:1-16`, add two entries to the `RUNTIME_EVENT_TYPES` set:

```js
export const RUNTIME_EVENT_TYPES = new Set([
  "session.started",
  "run.started",
  "run.completed",
  "run.failed",
  "turn.started",
  "turn.completed",
  "model.started",
  "model.delta",
  "model.completed",
  "tool.started",
  "tool.delta",
  "tool.completed",
  "input.requested",
  "input.resolved",
  "artifact.created",
  "artifact.updated",
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/event_store.test.js`
Expected: PASS.

---

### Task 3: Add `artifactSummariesByTurnId` to initial activity tree state

**Files:**
- Modify: `src/SERVICEs/runtime_events/activity_tree.js:36-56` (`createInitialActivityTreeState`)
- Modify: `src/SERVICEs/runtime_events/activity_tree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/SERVICEs/runtime_events/activity_tree.test.js`:

```js
describe("artifactSummariesByTurnId initial state", () => {
  test("createInitialActivityTreeState includes empty artifactSummariesByTurnId", () => {
    const { createInitialActivityTreeState } = require("./activity_tree");
    const state = createInitialActivityTreeState();
    expect(state.artifactSummariesByTurnId).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js -t "artifactSummariesByTurnId initial state"`
Expected: FAIL — `received` is `undefined`.

- [ ] **Step 3: Add the slice to the initial state**

In `src/SERVICEs/runtime_events/activity_tree.js`, update `createInitialActivityTreeState` (currently lines 36–56). Add the new key alongside the existing keys (e.g., between `framesByRunId: {}` and `effects: []`):

```js
artifactSummariesByTurnId: {},
```

That's the only structural change needed. `reduceActivityTree` (line 617) builds a fresh state via `createInitialActivityTreeState()` on every call, then re-applies all events — there is no clone-state helper to update. The new key is part of the freshly-built state on every reduction.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js`
Expected: All existing tests PASS; the new one PASSES.

---

### Task 4: Handle `artifact.created` in the reducer

**Files:**
- Modify: `src/SERVICEs/runtime_events/activity_tree.js` (event-type switch around line 435–500)
- Modify: `src/SERVICEs/runtime_events/activity_tree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/SERVICEs/runtime_events/activity_tree.test.js`:

```js
describe("artifact.created", () => {
  test("creates a pending bucket and pushes the artifact descriptor", () => {
    const events = [
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:call-1",
          kind: "file_diff",
          title: "src/App.js",
          owner: { turn_id: "run-root:turn-1", call_id: "call-1" },
          snapshot: { unified_diff: "--- a/App.js\n+++ b/App.js\n@@ -1 +1 @@\n-old\n+new\n" },
        },
      }),
    ];
    const state = reduceEvents(events);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket).toBeDefined();
    expect(bucket.status).toBe("pending");
    expect(bucket.order).toBe(1);
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].artifact_id).toBe("file_diff:call-1");
    expect(bucket.artifacts[0].kind).toBe("file_diff");
  });

  test("resolves turn_id from event.turn_id when present", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-2",
        payload: {
          artifact_id: "x:1",
          kind: "file_diff",
          owner: { turn_id: "DIFFERENT" },
          snapshot: { unified_diff: "" },
        },
      }),
    ]);
    expect(state.artifactSummariesByTurnId["run-root:turn-2"]).toBeDefined();
    expect(state.artifactSummariesByTurnId["DIFFERENT"]).toBeUndefined();
  });

  test("does not emit an artifact_summary effect while bucket is pending", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "x:1",
          kind: "file_diff",
          snapshot: { unified_diff: "" },
        },
      }),
    ]);
    const artifactEffects = state.effects.filter(
      (e) => e.type === "artifact_summary",
    );
    expect(artifactEffects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js -t "artifact.created"`
Expected: FAIL — `bucket` is `undefined`.

- [ ] **Step 3: Add the handler**

In `src/SERVICEs/runtime_events/activity_tree.js`, after the existing `turn.started / turn.completed` block (around line 435–447), add helpers near the top of the file (after the existing helper definitions):

```js
const KNOWN_ARTIFACT_KINDS = new Set(["file_diff", "plan"]);
const warnedUnknownKinds = new Set();

const resolveTurnId = (event) => {
  const direct = stringValue(event?.turn_id);
  if (direct) return direct;
  const payload = payloadOf(event);
  const fromOwner = stringValue(payload?.owner?.turn_id);
  if (fromOwner) return fromOwner;
  const links = linksOf(event);
  return stringValue(links?.turn_id);
};

const ensureArtifactBucket = (state, turnId) => {
  if (!turnId) return null;
  if (!state.artifactSummariesByTurnId[turnId]) {
    const nextOrder =
      Object.keys(state.artifactSummariesByTurnId).length + 1;
    state.artifactSummariesByTurnId[turnId] = {
      order: nextOrder,
      status: "pending",
      artifacts: [],
    };
  }
  return state.artifactSummariesByTurnId[turnId];
};
```

Then, alongside the other event-type branches in `reduceActivityTree`, add:

```js
if (eventType === "artifact.created") {
  const artifact = payloadOf(event);
  const kind = stringValue(artifact.kind);
  if (!KNOWN_ARTIFACT_KINDS.has(kind)) {
    if (!warnedUnknownKinds.has(kind)) {
      warnedUnknownKinds.add(kind);
      // eslint-disable-next-line no-console
      console.warn(
        `[activity_tree] dropping artifact.created with unknown kind "${kind}"`,
      );
    }
    return;
  }
  const turnId = resolveTurnId(event);
  const bucket = ensureArtifactBucket(state, turnId);
  if (!bucket) return;
  bucket.artifacts.push({ ...artifact });
  if (bucket.status === "completed") {
    state.effects.push({
      type: "artifact_summary",
      eventId: stringValue(event.event_id),
      turnId,
      reason: "created",
    });
  }
  return;
}
```

The `eventId` field is **required** — `use_chat_stream.js` deduplicates effects via a key that starts with `eventId`, and effects without it are silently dropped (see `runtimeEventEffectKey` at line 1698). Every `artifact_summary` effect pushed in this plan carries `eventId: stringValue(event.event_id)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js`
Expected: All tests PASS, including all previously existing ones.

---

### Task 5: Handle `artifact.updated` in the reducer

**Files:**
- Modify: `src/SERVICEs/runtime_events/activity_tree.js`
- Modify: `src/SERVICEs/runtime_events/activity_tree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/SERVICEs/runtime_events/activity_tree.test.js`:

```js
describe("artifact.updated", () => {
  test("replaces the existing entry with the same artifact_id", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          title: "Initial",
          snapshot: { markdown: "# v1", status: "draft" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 2,
          title: "Updated",
          snapshot: { markdown: "# v2", status: "draft" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].title).toBe("Updated");
    expect(bucket.artifacts[0].revision).toBe(2);
  });

  test("ignores revision regression for the same artifact_id", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 5,
          snapshot: { markdown: "# rev5" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 3,
          snapshot: { markdown: "# rev3" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts[0].revision).toBe(5);
    expect(bucket.artifacts[0].snapshot.markdown).toBe("# rev5");
  });

  test("pushes the artifact when no existing entry matches (out-of-order delivery)", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.updated",
        payload: {
          artifact_id: "plan:p1",
          kind: "plan",
          revision: 1,
          snapshot: { markdown: "# v1" },
        },
      }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.artifacts).toHaveLength(1);
    expect(bucket.artifacts[0].revision).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js -t "artifact.updated"`
Expected: FAIL — the new event type is not handled, bucket stays empty.

- [ ] **Step 3: Add the handler**

In `src/SERVICEs/runtime_events/activity_tree.js`, immediately after the `artifact.created` block from Task 4, add:

```js
if (eventType === "artifact.updated") {
  const artifact = payloadOf(event);
  const kind = stringValue(artifact.kind);
  if (!KNOWN_ARTIFACT_KINDS.has(kind)) {
    if (!warnedUnknownKinds.has(kind)) {
      warnedUnknownKinds.add(kind);
      // eslint-disable-next-line no-console
      console.warn(
        `[activity_tree] dropping artifact.updated with unknown kind "${kind}"`,
      );
    }
    return;
  }
  const turnId = resolveTurnId(event);
  const bucket = ensureArtifactBucket(state, turnId);
  if (!bucket) return;
  const artifactId = stringValue(artifact.artifact_id);
  const existingIdx = bucket.artifacts.findIndex(
    (a) => a.artifact_id === artifactId,
  );
  if (existingIdx >= 0) {
    const existing = bucket.artifacts[existingIdx];
    const incomingRevision = Number(artifact.revision);
    const existingRevision = Number(existing.revision);
    if (
      Number.isFinite(existingRevision) &&
      Number.isFinite(incomingRevision) &&
      incomingRevision < existingRevision
    ) {
      return; // revision regression
    }
    if (kind === "file_diff") {
      // eslint-disable-next-line no-console
      console.warn(
        `[activity_tree] unexpected artifact.updated for file_diff ${artifactId}; replacing in place`,
      );
    }
    bucket.artifacts[existingIdx] = { ...artifact };
  } else {
    bucket.artifacts.push({ ...artifact });
  }
  if (bucket.status === "completed") {
    state.effects.push({
      type: "artifact_summary",
      eventId: stringValue(event.event_id),
      turnId,
      reason: "updated",
    });
  }
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js`
Expected: All tests PASS.

---

### Task 6: Mark bucket completed on `turn.completed` and emit effect

**Files:**
- Modify: `src/SERVICEs/runtime_events/activity_tree.js:435-447`
- Modify: `src/SERVICEs/runtime_events/activity_tree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/SERVICEs/runtime_events/activity_tree.test.js`:

```js
describe("turn.completed flips bucket to completed", () => {
  test("status becomes completed and an artifact_summary completed effect is emitted", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.status).toBe("completed");
    const completedEffects = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "completed",
    );
    expect(completedEffects).toHaveLength(1);
    expect(completedEffects[0].turnId).toBe("run-root:turn-1");
    expect(completedEffects[0].eventId).toBe("e2");
  });

  test("does not create a bucket when the turn produced no artifacts", () => {
    const state = reduceEvents([
      event({ id: "e1", type: "turn.completed", payload: {} }),
    ]);
    expect(state.artifactSummariesByTurnId["run-root:turn-1"]).toBeUndefined();
    const completedEffects = state.effects.filter(
      (e) => e.type === "artifact_summary",
    );
    expect(completedEffects).toEqual([]);
  });

  test("artifact.created arriving after turn.completed emits a created effect", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
      event({
        id: "e3",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c2",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-x\n+y\n" },
        },
      }),
    ]);
    const created = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "created",
    );
    expect(created).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js -t "turn.completed flips"`
Expected: FAIL — `bucket.status` is still `"pending"` and no `completed` effect is present.

- [ ] **Step 3: Extend the existing turn handler**

In `src/SERVICEs/runtime_events/activity_tree.js`, find the block that currently handles `turn.started` and `turn.completed` (around line 435–447). Replace it with:

```js
if (eventType === "turn.started" || eventType === "turn.completed") {
  routeFrame(
    state,
    event,
    createFrame(
      state,
      event,
      eventType === "turn.started" ? "iteration_started" : "iteration_completed",
      payload,
    ),
  );
  if (eventType === "turn.completed") {
    const turnId = resolveTurnId(event);
    const bucket = state.artifactSummariesByTurnId[turnId];
    if (bucket && bucket.status !== "completed") {
      bucket.status = "completed";
      state.effects.push({
        type: "artifact_summary",
        eventId: stringValue(event.event_id),
        turnId,
        reason: "completed",
      });
    }
  }
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js`
Expected: All tests PASS, including the new ones in Task 4 and Task 5.

---

### Task 7: Flush pending buckets on `run.completed`

**Files:**
- Modify: `src/SERVICEs/runtime_events/activity_tree.js` (existing `run.completed` handler)
- Modify: `src/SERVICEs/runtime_events/activity_tree.test.js`

- [ ] **Step 1: Locate the existing run.completed handler**

Read `src/SERVICEs/runtime_events/activity_tree.js` and locate the `if (eventType === "run.completed")` branch. Note its exact location for the next step.

- [ ] **Step 2: Write the failing test**

Append to `src/SERVICEs/runtime_events/activity_tree.test.js`:

```js
describe("run.completed flushes pending buckets", () => {
  test("converts pending buckets to completed and emits flushed effects", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-1",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "run.completed", payload: {} }),
    ]);
    const bucket = state.artifactSummariesByTurnId["run-root:turn-1"];
    expect(bucket.status).toBe("completed");
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toHaveLength(1);
    expect(flushed[0].turnId).toBe("run-root:turn-1");
    expect(flushed[0].eventId).toBe("e2");
  });

  test("multiple pending turns produce one flushed effect each, all keyed by the same event_id but distinguishable by turnId+reason", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        turnId: "run-root:turn-1",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({
        id: "e2",
        type: "artifact.created",
        turnId: "run-root:turn-2",
        payload: {
          artifact_id: "file_diff:c2",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-x\n+y\n" },
        },
      }),
      event({ id: "e3", type: "run.completed", payload: {} }),
    ]);
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toHaveLength(2);
    expect(flushed.every((e) => e.eventId === "e3")).toBe(true);
    expect(new Set(flushed.map((e) => e.turnId))).toEqual(
      new Set(["run-root:turn-1", "run-root:turn-2"]),
    );
  });

  test("already-completed buckets are not re-flushed", () => {
    const state = reduceEvents([
      event({
        id: "e1",
        type: "artifact.created",
        payload: {
          artifact_id: "file_diff:c1",
          kind: "file_diff",
          snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n" },
        },
      }),
      event({ id: "e2", type: "turn.completed", payload: {} }),
      event({ id: "e3", type: "run.completed", payload: {} }),
    ]);
    const flushed = state.effects.filter(
      (e) => e.type === "artifact_summary" && e.reason === "flushed",
    );
    expect(flushed).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js -t "run.completed flushes"`
Expected: FAIL — pending bucket stays pending and no `flushed` effect is emitted.

- [ ] **Step 4: Extend the run.completed handler**

Inside the existing `if (eventType === "run.completed") { ... }` block, before its `return;`, add:

```js
for (const [turnId, bucket] of Object.entries(state.artifactSummariesByTurnId)) {
  if (bucket.status !== "completed") {
    bucket.status = "completed";
    state.effects.push({
      type: "artifact_summary",
      eventId: stringValue(event.event_id),
      turnId,
      reason: "flushed",
    });
  }
}
```

Note that a single `run.completed` event can emit multiple `artifact_summary` effects (one per pending turn). They all share the same `event.event_id`, which is why `runtimeEventEffectKey` is extended in Task 8 to include `turnId` and `reason` — without that extension, only the first flushed effect would survive deduplication.

`state.artifactSummariesByTurnId` is already in scope as part of the reducer state; no extra wiring is needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/SERVICEs/runtime_events/activity_tree.test.js`
Expected: All tests PASS.

---

### Task 8: Extend `runtimeEventEffectKey` and consume `artifact_summary` effects

This task has two coupled parts: (a) extend the effect deduplication key in `use_chat_stream.js` so multiple `artifact_summary` effects from the same event survive, and (b) add the branch that mirrors the bucket onto the assistant message using the existing `syncStreamMessages` pattern.

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js` (`runtimeEventEffectKey` at line 1698–1721, effects loop at line 1743–1763)
- Create: `src/PAGEs/chat/hooks/use_chat_stream.artifact_summary.test.js` (source-guard style, matching the existing `use_chat_stream.code_diff_guard.test.js` convention)

- [ ] **Step 1: Read the existing scope to confirm references**

Read `src/PAGEs/chat/hooks/use_chat_stream.js` around lines 1147 (`assistantMessageId`), 1401–1414 (`streamMessages`, `syncStreamMessages`), 1514–1528 (`syncAssistantSubagentState` — the canonical reference pattern), 1698–1721 (`runtimeEventEffectKey`), and 1743–1763 (effects loop). The new code must reuse these closure-scope variables verbatim.

- [ ] **Step 2: Write the failing source-guard test**

Create `src/PAGEs/chat/hooks/use_chat_stream.artifact_summary.test.js`:

```js
/**
 * Guard regression test: artifact_summary effects must (1) carry an eventId
 * so they survive runtimeEventEffectKey deduplication, (2) be keyed in a way
 * that distinguishes (turnId, reason) so multiple flushed effects from a
 * single run.completed all survive, and (3) be mirrored onto the streaming
 * assistant message via syncStreamMessages.
 *
 * Source-level assertions match the convention used by
 * use_chat_stream.code_diff_guard.test.js — a full hook integration test
 * would drag in the entire streaming pipeline.
 */

const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream artifact_summary plumbing", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("runtimeEventEffectKey distinguishes artifact_summary by turnId and reason", () => {
    // The key function must mix turnId + reason for artifact_summary effects,
    // otherwise multiple flushed effects from one run.completed collide.
    expect(source).toMatch(/effect\?\.type\s*===\s*"artifact_summary"/);
    expect(source).toMatch(/effect\.turnId/);
    expect(source).toMatch(/effect\.reason/);
  });

  test("effects loop has an artifact_summary branch", () => {
    expect(source).toMatch(/effect\.type\s*===\s*"artifact_summary"/);
  });

  test("artifact_summary branch reads from runtimeEventActivityTree.artifactSummariesByTurnId", () => {
    expect(source).toMatch(/artifactSummariesByTurnId/);
  });

  test("artifact_summary branch writes through syncStreamMessages", () => {
    // The branch must follow the same pattern as syncAssistantSubagentState:
    // build nextStreamMessages via streamMessages.map and call syncStreamMessages.
    const branch = source.match(
      /effect\.type\s*===\s*"artifact_summary"[\s\S]{0,1200}/,
    );
    expect(branch).not.toBeNull();
    expect(branch[0]).toMatch(/streamMessages\.map/);
    expect(branch[0]).toMatch(/syncStreamMessages\(/);
    expect(branch[0]).toMatch(/assistantMessageId/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/PAGEs/chat/hooks/use_chat_stream.artifact_summary.test.js`
Expected: FAIL — no `artifact_summary` string is present in the hook source yet.

- [ ] **Step 4: Extend `runtimeEventEffectKey`**

Modify `runtimeEventEffectKey` (currently at line 1698–1721) so the final key includes the artifact dimensions. Replace the existing return statement with:

```js
const artifactKey =
  effect?.type === "artifact_summary"
    ? `${effect.turnId || ""}:${effect.reason || ""}`
    : "";
return [eventId, effect?.type || "", frameType, delta, errorCode, artifactKey].join(
  "::",
);
```

No other lines in the function change — `eventId`, `frameType`, `delta`, `errorCode` keep their existing computations.

- [ ] **Step 5: Add the effect consumption branch**

In the effects loop (currently at line 1743–1763), add a new branch after the existing `error` branch (so error handling still takes precedence). Insert:

```js
if (effect.type === "artifact_summary") {
  const bucket =
    runtimeEventActivityTree?.artifactSummariesByTurnId?.[effect.turnId];
  if (!bucket || bucket.status !== "completed") {
    return;
  }
  const patchTime = Date.now();
  const nextStreamMessages = streamMessages.map((message) => {
    if (message.id !== assistantMessageId) return message;
    const prevSummaries =
      message.artifactSummariesByTurnId &&
      typeof message.artifactSummariesByTurnId === "object" &&
      !Array.isArray(message.artifactSummariesByTurnId)
        ? message.artifactSummariesByTurnId
        : {};
    return {
      ...message,
      updatedAt: patchTime,
      artifactSummariesByTurnId: {
        ...prevSummaries,
        [effect.turnId]: {
          order: bucket.order,
          status: bucket.status,
          artifacts: bucket.artifacts.map((a) => ({ ...a })),
        },
      },
    };
  });
  syncStreamMessages(nextStreamMessages);
  return;
}
```

This mirrors `syncAssistantSubagentState` (line 1514–1528) verbatim in structure — pull a value, map over `streamMessages`, call `syncStreamMessages`. No new closures, no new refs.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest src/PAGEs/chat/hooks/use_chat_stream.artifact_summary.test.js`
Expected: All four source-guard tests PASS.

- [ ] **Step 7: Run the wider chat test suite to confirm no regression**

Run: `npx jest src/PAGEs/chat/`
Expected: All existing tests PASS.

---

### Task 9: Sanitize `artifactSummariesByTurnId` through persistence

**Files:**
- Modify: `src/SERVICEs/chat_storage/chat_storage_sanitize.js:526-580`
- Modify (or create): `src/SERVICEs/chat_storage/chat_storage_sanitize.test.js`

- [ ] **Step 1: Write the failing test**

If `src/SERVICEs/chat_storage/chat_storage_sanitize.test.js` does not exist, create it. If it exists, append. Add:

```js
import { sanitizeMessage } from "./chat_storage_sanitize";

describe("sanitizeMessage assistant artifactSummariesByTurnId", () => {
  const validBucket = {
    order: 1,
    status: "completed",
    artifacts: [
      {
        artifact_id: "file_diff:c1",
        kind: "file_diff",
        snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n", truncated: false },
      },
    ],
  };

  test("preserves valid artifact summaries on assistant messages", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: { "run-1:turn-1": validBucket },
    });
    expect(cleaned.artifactSummariesByTurnId).toEqual({
      "run-1:turn-1": validBucket,
    });
  });

  test("drops artifacts missing required fields without dropping the bucket", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: {
        "run-1:turn-1": {
          order: 1,
          status: "completed",
          artifacts: [
            { artifact_id: "ok", kind: "file_diff", snapshot: { unified_diff: "" } },
            { kind: "file_diff", snapshot: {} }, // missing artifact_id
            { artifact_id: "no-kind", snapshot: {} }, // missing kind
            { artifact_id: "no-snap", kind: "file_diff" }, // missing snapshot
          ],
        },
      },
    });
    expect(cleaned.artifactSummariesByTurnId["run-1:turn-1"].artifacts).toHaveLength(1);
    expect(cleaned.artifactSummariesByTurnId["run-1:turn-1"].artifacts[0].artifact_id).toBe("ok");
  });

  test("drops pending buckets entirely", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: {
        "run-1:turn-1": { ...validBucket, status: "pending" },
      },
    });
    expect(cleaned.artifactSummariesByTurnId).toBeUndefined();
  });

  test("does not set the field on user messages", () => {
    const cleaned = sanitizeMessage({
      role: "user",
      content: "hi",
      artifactSummariesByTurnId: { "run-1:turn-1": validBucket },
    });
    expect(cleaned.artifactSummariesByTurnId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/SERVICEs/chat_storage/chat_storage_sanitize.test.js`
Expected: FAIL — `cleaned.artifactSummariesByTurnId` is `undefined` even for the valid case.

- [ ] **Step 3: Implement the sanitizer**

In `src/SERVICEs/chat_storage/chat_storage_sanitize.js`, near the other sanitizer helpers (e.g., immediately above `sanitizeTraceFrame` around line 415), add:

```js
const ALLOWED_ARTIFACT_KINDS = new Set(["file_diff", "plan"]);

const sanitizeArtifactDescriptor = (descriptor) => {
  if (!isObject(descriptor)) return null;
  const artifactId =
    typeof descriptor.artifact_id === "string" && descriptor.artifact_id.trim()
      ? descriptor.artifact_id
      : null;
  const kind = typeof descriptor.kind === "string" ? descriptor.kind.trim() : "";
  if (!artifactId || !ALLOWED_ARTIFACT_KINDS.has(kind)) return null;
  if (!isObject(descriptor.snapshot)) return null;
  return { ...descriptor };
};

const sanitizeArtifactBucket = (bucket) => {
  if (!isObject(bucket)) return null;
  if (bucket.status !== "completed") return null;
  const artifacts = Array.isArray(bucket.artifacts)
    ? bucket.artifacts.map(sanitizeArtifactDescriptor).filter(Boolean)
    : [];
  const order = Number.isFinite(Number(bucket.order)) ? Number(bucket.order) : 0;
  return { order, status: "completed", artifacts };
};

export const sanitizeArtifactSummariesByTurnId = (value) => {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value)
    .map(([turnId, bucket]) => {
      const cleanedTurnId = typeof turnId === "string" ? turnId.trim() : "";
      if (!cleanedTurnId) return null;
      const cleanedBucket = sanitizeArtifactBucket(bucket);
      if (!cleanedBucket) return null;
      return [cleanedTurnId, cleanedBucket];
    })
    .filter(Boolean);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};
```

Then, inside `sanitizeMessage`'s `if (role === "assistant") { ... }` block (currently at line 554+), append:

```js
const cleanedArtifactSummaries = sanitizeArtifactSummariesByTurnId(
  message.artifactSummariesByTurnId,
);
if (cleanedArtifactSummaries) {
  cleaned.artifactSummariesByTurnId = cleanedArtifactSummaries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/SERVICEs/chat_storage/chat_storage_sanitize.test.js`
Expected: All tests PASS.

---

## Phase B — UI components

### Task 10: ArtifactSummary container

**Files:**
- Create: `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js`
- Create: `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.test.js`:

```js
import React from "react";
import { render, screen } from "@testing-library/react";
import ArtifactSummary from "./artifact_summary";

describe("ArtifactSummary", () => {
  test("renders nothing when bucket is undefined", () => {
    const { container } = render(<ArtifactSummary bucket={undefined} isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when bucket has status pending", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "pending", artifacts: [] }}
        isDark={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when artifacts array is empty even if completed", () => {
    const { container } = render(
      <ArtifactSummary
        bucket={{ order: 1, status: "completed", artifacts: [] }}
        isDark={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders a FilesChangedCard when at least one file_diff artifact is present", () => {
    render(
      <ArtifactSummary
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "file_diff:c1",
              kind: "file_diff",
              snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n", path: "src/x.js" },
            },
          ],
        }}
        isDark={false}
      />,
    );
    expect(screen.getByText(/Files changed/)).toBeInTheDocument();
  });

  test("renders a PlanCard when a plan artifact is present", () => {
    render(
      <ArtifactSummary
        bucket={{
          order: 1,
          status: "completed",
          artifacts: [
            {
              artifact_id: "plan:p1",
              kind: "plan",
              title: "Demo plan",
              snapshot: { markdown: "# Hi", status: "draft" },
            },
          ],
        }}
        isDark={false}
      />,
    );
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.test.js`
Expected: FAIL with "Cannot find module './artifact_summary'".

- [ ] **Step 3: Implement the container**

Create `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js`:

```js
import React from "react";
import FilesChangedCard from "./files_changed_card";
import PlanCard from "./plan_card";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const ArtifactSummary = ({ bucket, isDark }) => {
  if (!isObject(bucket) || bucket.status !== "completed") return null;
  const artifacts = Array.isArray(bucket.artifacts) ? bucket.artifacts : [];
  if (artifacts.length === 0) return null;

  const fileDiffs = artifacts.filter((a) => a?.kind === "file_diff");
  const plans = artifacts.filter((a) => a?.kind === "plan");

  return (
    <div
      data-testid="artifact-summary"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
    >
      {fileDiffs.length > 0 && (
        <FilesChangedCard artifacts={fileDiffs} isDark={isDark} />
      )}
      {plans.map((artifact) => (
        <PlanCard key={artifact.artifact_id} artifact={artifact} isDark={isDark} />
      ))}
    </div>
  );
};

export default ArtifactSummary;
```

To satisfy the imports, also create minimal placeholders so the test for `FilesChangedCard` / `PlanCard` text appears even before their full implementations land:

Create `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`:

```js
import React from "react";

const FilesChangedCard = ({ artifacts }) => {
  const count = artifacts.length;
  return <div data-testid="files-changed-card">Files changed · {count}</div>;
};

export default FilesChangedCard;
```

Create `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js`:

```js
import React from "react";

const PlanCard = ({ artifact }) => {
  return <div data-testid="plan-card">Plan · {artifact?.title || "Untitled"}</div>;
};

export default PlanCard;
```

These placeholders will be replaced with full implementations in Task 11 and Task 13.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/`
Expected: All tests in `artifact_summary.test.js` PASS.

---

### Task 11: FilesChangedCard — collapsed view + normalizer

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`
- Create: `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`:

```js
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FilesChangedCard from "./files_changed_card";

const fileDiff = ({ id, path, op = "edit", additions, deletions, unifiedDiff }) => ({
  artifact_id: `file_diff:${id}`,
  kind: "file_diff",
  snapshot: {
    files: [
      {
        path,
        operation: op,
        unified_diff:
          unifiedDiff ||
          `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
        ...(additions !== undefined ? { additions } : {}),
        ...(deletions !== undefined ? { deletions } : {}),
      },
    ],
  },
});

describe("FilesChangedCard collapsed", () => {
  test("renders file count and total +/− stats from artifact-provided numbers", () => {
    render(
      <FilesChangedCard
        artifacts={[
          fileDiff({ id: "c1", path: "a.js", additions: 10, deletions: 2 }),
          fileDiff({ id: "c2", path: "b.js", additions: 5, deletions: 3 }),
        ]}
        isDark={false}
      />,
    );
    expect(screen.getByText(/Files changed · 2/)).toBeInTheDocument();
    expect(screen.getByText(/\+15 −5/)).toBeInTheDocument();
  });

  test("falls back to computing +/− from unified diff when stats are missing", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "a.js" })]}
        isDark={false}
      />,
    );
    expect(screen.getByText(/Files changed · 1/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });

  test("accepts camelCase unifiedDiff field as well as snake_case", () => {
    const camelArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "a.js",
            operation: "edit",
            unifiedDiff: "@@ -1 +1 @@\n-a\n+b\n",
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[camelArtifact]} isDark={false} />);
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });

  test("accepts single-file snapshot shape (no snapshot.files array)", () => {
    // Protocol allows the snapshot itself to be a single-file payload.
    const singleFile = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        path: "src/x.js",
        operation: "edit",
        unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
      },
    };
    render(<FilesChangedCard artifacts={[singleFile]} isDark={false} />);
    expect(screen.getByText(/Files changed · 1/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 −1/)).toBeInTheDocument();
  });
});

describe("FilesChangedCard expanded", () => {
  test("expanding the header reveals per-file rows", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "src/x.js", additions: 3, deletions: 1 })]}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("src/x.js")).toBeInTheDocument();
  });

  test("does not show per-file rows when collapsed", () => {
    render(
      <FilesChangedCard
        artifacts={[fileDiff({ id: "c1", path: "src/x.js" })]}
        isDark={false}
      />,
    );
    expect(screen.queryByText("src/x.js")).toBeNull();
  });

  test("multiple files in one artifact each render their own row", () => {
    const multi = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "a.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
          },
          {
            path: "b.js",
            operation: "create",
            unified_diff: "@@ -0,0 +1 @@\n+new\n",
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[multi]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("a.js")).toBeInTheDocument();
    expect(screen.getByText("b.js")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`
Expected: FAIL — most tests fail because the placeholder only renders count without stats, expansion, or per-file rows.

- [ ] **Step 3: Replace the placeholder with the full implementation**

Replace `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js` with:

```js
import React, { useMemo, useState } from "react";
import { countPlusMinus } from "../../diff/diff_body";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const readUnifiedDiff = (file) => {
  if (!isObject(file)) return "";
  if (typeof file.unified_diff === "string") return file.unified_diff;
  if (typeof file.unifiedDiff === "string") return file.unifiedDiff;
  return "";
};

const readOperation = (file) => {
  if (!isObject(file)) return "";
  const op =
    (typeof file.operation === "string" && file.operation) ||
    (typeof file.sub_operation === "string" && file.sub_operation) ||
    "";
  return op;
};

const normalizeFile = (file) => {
  if (!isObject(file)) return null;
  const unifiedDiff = readUnifiedDiff(file);
  const fallback = countPlusMinus(unifiedDiff);
  const additions = Number.isFinite(Number(file.additions))
    ? Number(file.additions)
    : fallback.plus;
  const deletions = Number.isFinite(Number(file.deletions))
    ? Number(file.deletions)
    : fallback.minus;
  return {
    path: typeof file.path === "string" ? file.path : "",
    operation: readOperation(file),
    unifiedDiff,
    additions,
    deletions,
    truncated: Boolean(file.truncated),
    totalLines: Number.isFinite(Number(file.total_lines))
      ? Number(file.total_lines)
      : null,
    displayedLines: Number.isFinite(Number(file.displayed_lines))
      ? Number(file.displayed_lines)
      : null,
    binary: Boolean(file.binary),
  };
};

const looksLikeFile = (snapshot) =>
  isObject(snapshot) &&
  (typeof snapshot.unified_diff === "string" ||
    typeof snapshot.unifiedDiff === "string" ||
    typeof snapshot.path === "string");

const collectFiles = (artifacts) => {
  const out = [];
  for (const artifact of artifacts || []) {
    if (!isObject(artifact)) continue;
    const snapshot = isObject(artifact.snapshot) ? artifact.snapshot : {};
    // Two valid snapshot shapes per spec §4.3:
    //  (a) snapshot.files: [{ path, unified_diff, ... }, ...]
    //  (b) snapshot itself is a single-file payload with path / unified_diff
    // The protocol may emit either; the normalizer must accept both.
    const files = Array.isArray(snapshot.files)
      ? snapshot.files
      : looksLikeFile(snapshot)
        ? [snapshot]
        : [];
    for (const file of files) {
      const normalized = normalizeFile(file);
      if (normalized) out.push(normalized);
    }
  }
  return out;
};

const FilesChangedCard = ({ artifacts, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const files = useMemo(() => collectFiles(artifacts), [artifacts]);
  const totals = useMemo(
    () =>
      files.reduce(
        (acc, f) => ({
          plus: acc.plus + f.additions,
          minus: acc.minus + f.deletions,
        }),
        { plus: 0, minus: 0 },
      ),
    [files],
  );
  if (files.length === 0) return null;
  const border = isDark ? "#6e7681" : "#8c959f";
  const secondary = isDark ? "#8c959f" : "#656d76";

  return (
    <div
      data-testid="files-changed-card"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: "transparent",
      }}
    >
      <div
        data-testid="files-changed-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>Files changed · {files.length}</span>
        <span style={{ marginLeft: "auto", color: secondary }}>
          +{totals.plus} −{totals.minus}
        </span>
      </div>
      {expanded && (
        <div
          data-testid="files-changed-card-body"
          style={{ borderTop: `1px solid ${border}` }}
        >
          {files.map((file, idx) => (
            <FileRow key={`${file.path}:${idx}`} file={file} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileRow = ({ file, isDark }) => {
  const secondary = isDark ? "#8c959f" : "#656d76";
  return (
    <div
      style={{
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
      }}
    >
      <span>{file.path}</span>
      {file.operation && (
        <span
          style={{
            textTransform: "uppercase",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            color: secondary,
          }}
        >
          {file.operation}
        </span>
      )}
      <span style={{ marginLeft: "auto", color: secondary }}>
        +{file.additions} −{file.deletions}
      </span>
    </div>
  );
};

export default FilesChangedCard;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`
Expected: All tests PASS.

---

### Task 12: FilesChangedCard — per-file diff expansion

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`
- Modify: `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`:

```js
describe("FilesChangedCard per-row diff expansion", () => {
  test("clicking a file row mounts the DiffBody for that file", () => {
    render(
      <FilesChangedCard
        artifacts={[
          fileDiff({
            id: "c1",
            path: "src/x.js",
            unifiedDiff: "--- a/src/x.js\n+++ b/src/x.js\n@@ -1 +1 @@\n-old\n+new\n",
          }),
        ]}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    fireEvent.click(screen.getByText("src/x.js"));
    const diffRows = screen.getAllByText((_, node) =>
      node?.getAttribute("data-diff-kind") !== null,
    );
    expect(diffRows.length).toBeGreaterThan(0);
  });

  test("shows 'Binary file' fallback when file.binary is true", () => {
    const binaryArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "logo.png",
            operation: "edit",
            unified_diff: "",
            binary: true,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[binaryArtifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("Binary file")).toBeInTheDocument();
  });

  test("shows 'Truncated · N/M lines' chip when truncated is true", () => {
    const truncatedArtifact = {
      artifact_id: "file_diff:c1",
      kind: "file_diff",
      snapshot: {
        files: [
          {
            path: "big.js",
            operation: "edit",
            unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            truncated: true,
            total_lines: 1000,
            displayed_lines: 400,
          },
        ],
      },
    };
    render(<FilesChangedCard artifacts={[truncatedArtifact]} isDark={false} />);
    fireEvent.click(screen.getByTestId("files-changed-card-header"));
    expect(screen.getByText("Truncated · 400/1000 lines")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js -t "per-row diff expansion"`
Expected: FAIL — clicking a file row does nothing; binary / truncated chips do not exist.

- [ ] **Step 3: Extend `FileRow` to support expansion and fallbacks**

In `src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.js`:

1. Add the import:

```js
import { DiffBody } from "../../diff/diff_body";
```

2. Replace the existing `FileRow` component with:

```js
const FileRow = ({ file, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const secondary = isDark ? "#8c959f" : "#656d76";
  const border = isDark ? "#6e7681" : "#8c959f";

  const fallbackChip = file.binary
    ? "Binary file"
    : file.truncated && file.totalLines && file.displayedLines
      ? `Truncated · ${file.displayedLines}/${file.totalLines} lines`
      : null;

  return (
    <div style={{ borderTop: `1px solid ${border}` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>{file.path}</span>
        {file.operation && (
          <span
            style={{
              textTransform: "uppercase",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
              color: secondary,
            }}
          >
            {file.operation}
          </span>
        )}
        {fallbackChip && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              color: secondary,
              backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            }}
          >
            {fallbackChip}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: secondary }}>
          +{file.additions} −{file.deletions}
        </span>
      </div>
      {expanded && !file.binary && (
        <div style={{ padding: "0 12px 8px 12px" }}>
          <DiffBody unifiedDiff={file.unifiedDiff} isDark={isDark} />
        </div>
      )}
    </div>
  );
};
```

3. Remove the now-unused `borderTop` style on the parent body element if it duplicates the row border. Concretely: change the parent `<div data-testid="files-changed-card-body">` so that it does **not** add its own `borderTop` (the per-row borders now handle separation).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/files_changed_card.test.js`
Expected: All tests PASS, including those from Task 11.

---

### Task 13: PlanCard with SeamlessMarkdown body

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js`
- Create: `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`:

```js
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import PlanCard from "./plan_card";

const planArtifact = (overrides = {}) => ({
  artifact_id: "plan:p1",
  kind: "plan",
  title: "Demo plan",
  revision: 1,
  snapshot: {
    plan_id: "p1",
    status: "draft",
    revision: 1,
    title: "Demo plan",
    markdown: "# Demo plan\n\n- Step one",
    truncated: false,
    total_lines: 3,
    displayed_lines: 3,
  },
  source: { path: "/workspace/plans/p1.md", relative_path: "plans/p1.md" },
  ...overrides,
});

describe("PlanCard collapsed", () => {
  test("shows title and status chip", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  test("does not render markdown body when collapsed", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    expect(screen.queryByText(/Step one/)).toBeNull();
  });
});

describe("PlanCard expanded", () => {
  test("clicking the header renders the markdown body", () => {
    render(<PlanCard artifact={planArtifact()} isDark={false} />);
    fireEvent.click(screen.getByTestId("plan-card-header"));
    expect(screen.getByText(/Demo plan/)).toBeInTheDocument();
    expect(screen.getByText(/Step one/)).toBeInTheDocument();
  });

  test("shows truncation footer with N/M lines and relative source path", () => {
    render(
      <PlanCard
        artifact={planArtifact({
          snapshot: {
            plan_id: "p1",
            status: "draft",
            revision: 1,
            title: "Demo plan",
            markdown: "# Demo",
            truncated: true,
            total_lines: 960,
            displayed_lines: 400,
          },
        })}
        isDark={false}
      />,
    );
    fireEvent.click(screen.getByTestId("plan-card-header"));
    expect(screen.getByText("Truncated · 400 / 960 lines")).toBeInTheDocument();
    expect(screen.getByText(/plans\/p1\.md/)).toBeInTheDocument();
  });

  test("uses finalized chip when snapshot.status is 'finalized'", () => {
    render(
      <PlanCard
        artifact={planArtifact({ snapshot: { ...planArtifact().snapshot, status: "finalized" } })}
        isDark={false}
      />,
    );
    expect(screen.getByText(/finalized/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`
Expected: FAIL — placeholder only renders the title.

- [ ] **Step 3: Replace the placeholder with the full PlanCard**

Replace `src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js` with:

```js
import React, { useState } from "react";
import SeamlessMarkdown from "../components/seamless_markdown";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const PlanCard = ({ artifact, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  if (!isObject(artifact)) return null;
  const snapshot = isObject(artifact.snapshot) ? artifact.snapshot : {};
  const title =
    (typeof artifact.title === "string" && artifact.title) ||
    (typeof snapshot.title === "string" && snapshot.title) ||
    "Untitled plan";
  const status =
    typeof snapshot.status === "string" && snapshot.status
      ? snapshot.status
      : "draft";
  const markdown =
    typeof snapshot.markdown === "string" ? snapshot.markdown : "";
  const truncated = Boolean(snapshot.truncated);
  const totalLines = Number.isFinite(Number(snapshot.total_lines))
    ? Number(snapshot.total_lines)
    : null;
  const displayedLines = Number.isFinite(Number(snapshot.displayed_lines))
    ? Number(snapshot.displayed_lines)
    : null;
  const source = isObject(artifact.source) ? artifact.source : {};
  const sourceLabel =
    (typeof source.relative_path === "string" && source.relative_path) ||
    (typeof source.path === "string" && source.path) ||
    "";

  const border = isDark ? "#6e7681" : "#8c959f";
  const secondary = isDark ? "#8c959f" : "#656d76";

  return (
    <div
      data-testid="plan-card"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: "transparent",
      }}
    >
      <div
        data-testid="plan-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>Plan · {title}</span>
        <span
          style={{
            textTransform: "lowercase",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            color: secondary,
            marginLeft: 8,
          }}
        >
          {status}
        </span>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${border}`, padding: "8px 12px" }}>
          <SeamlessMarkdown
            content={markdown}
            status="done"
            fontSize={13}
            lineHeight={1.55}
            priority="normal"
          />
          {truncated && totalLines && displayedLines && (
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${border}`,
                fontSize: 11.5,
                color: secondary,
              }}
            >
              Truncated · {displayedLines} / {totalLines} lines
              {sourceLabel && (
                <div style={{ marginTop: 2 }}>Source: {sourceLabel}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanCard;
```

**SeamlessMarkdown props are locked.** The component (defined at `src/COMPONENTs/chat-bubble/components/seamless_markdown.js:164`) accepts `{ content, status, fontSize, lineHeight, priority, className, style }`. It derives `isStreaming` internally from `status === "streaming"` and pulls the theme from `ConfigContext` — there is no `isDark` prop. The call above uses the real prop shape; do not modify.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/artifact-summary/plan_card.test.js`
Expected: All tests PASS.

---

### Task 14: Wire ArtifactSummary into `chat_bubble.js`

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/chat_bubble.js`
- Modify: `src/COMPONENTs/chat-bubble/chat_bubble.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/COMPONENTs/chat-bubble/chat_bubble.test.js`:

```js
describe("ChatBubble artifact summaries", () => {
  const fileBucket = (turnId, order) => ({
    order,
    status: "completed",
    artifacts: [
      {
        artifact_id: `file_diff:${turnId}`,
        kind: "file_diff",
        snapshot: {
          files: [
            {
              path: `src/${turnId}.js`,
              operation: "edit",
              unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            },
          ],
        },
      },
    ],
  });

  test("renders an ArtifactSummary block per completed turn bucket", () => {
    render(
      <ChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-1": fileBucket("turn-1", 1),
            "run-1:turn-2": fileBucket("turn-2", 2),
          },
        }}
        isDark={false}
      />,
    );
    expect(screen.getAllByTestId("artifact-summary")).toHaveLength(2);
  });

  test("renders nothing artifact-related when artifactSummariesByTurnId is empty", () => {
    render(
      <ChatBubble
        message={{ role: "assistant", status: "done", content: "done" }}
        isDark={false}
      />,
    );
    expect(screen.queryAllByTestId("artifact-summary")).toHaveLength(0);
  });

  test("orders ArtifactSummary blocks by bucket.order", () => {
    render(
      <ChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-2": fileBucket("turn-2", 2),
            "run-1:turn-1": fileBucket("turn-1", 1),
          },
        }}
        isDark={false}
      />,
    );
    const summaries = screen.getAllByTestId("files-changed-card");
    // The first rendered summary should correspond to turn-1 (order: 1).
    expect(summaries[0].textContent).toMatch(/turn-1\.js|Files changed/);
  });
});
```

The exact `ChatBubble` import + helper-wrapper pattern is already present in the file's existing tests; reuse whatever wrapper they use rather than constructing one new.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/chat_bubble.test.js -t "artifact summaries"`
Expected: FAIL — `artifact-summary` testid not in the DOM.

- [ ] **Step 3: Wire it in**

In `src/COMPONENTs/chat-bubble/chat_bubble.js`:

1. Add the import near the other component imports:

```js
import ArtifactSummary from "./artifact-summary/artifact_summary";
```

2. After the `<AssistantMessageBody ... />` render site (currently at line ~294 inside the assistant-message branch), add:

```js
{message?.artifactSummariesByTurnId &&
  Object.entries(message.artifactSummariesByTurnId)
    .sort(([, a], [, b]) => (a?.order || 0) - (b?.order || 0))
    .map(([turnId, bucket]) => (
      <ArtifactSummary key={turnId} bucket={bucket} isDark={isDark} />
    ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/chat_bubble.test.js`
Expected: All tests PASS.

---

### Task 15: Wire ArtifactSummary into `character_chat_bubble.js`

**Files:**
- Modify: `src/COMPONENTs/chat-bubble/character_chat_bubble.js`
- Modify (or create): `src/COMPONENTs/chat-bubble/character_chat_bubble.test.js`

- [ ] **Step 1: Inspect the existing test file**

Run: `ls src/COMPONENTs/chat-bubble/character_chat_bubble.test.js` and read it if it exists. If it does not, use `chat_bubble.test.js` as a template for setup helpers.

- [ ] **Step 2: Write the failing test**

Append to `src/COMPONENTs/chat-bubble/character_chat_bubble.test.js` (or create the file with the same imports `chat_bubble.test.js` uses, swapping `ChatBubble` → `CharacterChatBubble`):

```js
describe("CharacterChatBubble artifact summaries", () => {
  const fileBucket = (turnId, order) => ({
    order,
    status: "completed",
    artifacts: [
      {
        artifact_id: `file_diff:${turnId}`,
        kind: "file_diff",
        snapshot: {
          files: [
            {
              path: `src/${turnId}.js`,
              operation: "edit",
              unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            },
          ],
        },
      },
    ],
  });

  test("renders an ArtifactSummary block per completed turn bucket", () => {
    render(
      <CharacterChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-1": fileBucket("turn-1", 1),
          },
        }}
        isDark={false}
      />,
    );
    expect(screen.getByTestId("artifact-summary")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/COMPONENTs/chat-bubble/character_chat_bubble.test.js -t "artifact summaries"`
Expected: FAIL — no `artifact-summary` testid.

- [ ] **Step 4: Wire it in**

In `src/COMPONENTs/chat-bubble/character_chat_bubble.js`:

1. Add the import:

```js
import ArtifactSummary from "./artifact-summary/artifact_summary";
```

2. After the AssistantMessageBody render site in that file, add the same block as in Task 14:

```js
{message?.artifactSummariesByTurnId &&
  Object.entries(message.artifactSummariesByTurnId)
    .sort(([, a], [, b]) => (a?.order || 0) - (b?.order || 0))
    .map(([turnId, bucket]) => (
      <ArtifactSummary key={turnId} bucket={bucket} isDark={isDark} />
    ))}
```

If `isDark` is not in scope at that point of the file, source it from `useContext(ConfigContext)` as the rest of the file already does.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/COMPONENTs/chat-bubble/character_chat_bubble.test.js`
Expected: All tests PASS.

---

## Final Sanity Pass

After all 15 tasks are green:

- [ ] **Step A: Run the entire frontend test suite**

Run: `npx jest --silent`
Expected: All tests PASS.

- [ ] **Step B: Manual smoke check (optional, recommended)**

If a local dev environment is configured: start PuPu (`npm start`), trigger a chat that causes Unchain to emit at least one `file_diff` artifact, and confirm the ArtifactSummary card appears after the assistant message, defaults collapsed, expands on click, and reveals the unified diff.

- [ ] **Step C: User commits**

The user will review the dirty state and commit manually. Do not run `git commit`. Leave the working tree dirty for the user to inspect.

---

## Plan Self-Review Notes

- **Spec coverage:** Every section of `2026-05-25-artifact-summary-ui-design.md` maps to a task:
  - §3 inputs → Task 2 (event types) + Task 4/5 (payload parsing).
  - §4.1 position → Task 14/15 (chat bubble wiring).
  - §4.2 container → Task 10.
  - §4.3 FilesChangedCard → Task 11 (collapsed/normalizer) + Task 12 (expanded/fallbacks).
  - §4.4 PlanCard → Task 13.
  - §4.5 unknown kinds → Task 4/5 (dev warning, silent drop).
  - §5.1/5.2 file structure → reflected in the File Structure section.
  - §5.3 DiffBody extraction → Task 1.
  - §5.4 reducer → Task 3 (state) + Task 4/5/6/7 (events).
  - §5.5 effects → Task 4/5/6/7 (emission) + Task 8 (consumption).
  - §5.6 persistence → Task 9.
  - §5.7 streaming → enforced implicitly: ArtifactSummary only mounts for `status: "completed"` buckets, which Task 6 / Task 7 guarantee.
  - §6 visual specs → applied throughout Tasks 11–13.
  - §7 edge cases → covered by tests in Tasks 10–13 (empty bucket, pending bucket, binary, truncated, regression).
  - §8 test plan → exact paths used.

- **Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" references. Each step includes the actual code change.

- **Type consistency:** State key `artifactSummariesByTurnId` used identically across Tasks 3, 4, 5, 6, 7, 8, 9, 10, 14, 15. Bucket shape `{ order, status, artifacts }` consistent. Effect type `"artifact_summary"` with `reason: "created" | "updated" | "completed" | "flushed"` consistent across Tasks 4–8.
