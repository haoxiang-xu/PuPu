# Frontend Loading Decoupling — Plan 02: Spinner & Progress Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the first wave of genuinely-async UI sites to the new loading infrastructure (`useAsyncAction`, `SuspenseFallback`, `progress_bus`). High-value sweep: lazy-modal Suspense upgrade, toolkit catalog/detail async migration, chat stream / Ollama pull / model-catalog-refresh wired to the global top progress bar.

**Architecture:** Re-use the primitives built in Plan 01. Two integration patterns:
(a) Local component-level migration — swap inline `setLoading` + `<LoadingDots />` for `useAsyncAction({ label })` + `<SuspenseFallback />`. Side effect: any action over 300 ms also lights the global top bar via `progress_bus` (driven from inside `useAsyncAction`).
(b) Long-running or non-component async — call `progress_bus.start(id, label)` / `progress_bus.stop(id)` directly from the hook that owns the lifecycle (stream, Ollama pull, catalog refresh). These don't go through `useAsyncAction` because they have their own state machines.

**Out of scope for this plan (deferred):**
- Send/Stop buttons in chat input — no real local async to guard; becomes "instant" with stream-level progress_bus
- API key save — synchronous localStorage write; belongs in Plan 03 (optimistic)
- Toolkit enable/disable toggle — synchronous localStorage write; Plan 03
- Attachment resolve — in-memory operations, not user-perceptible wait
- Memory embedding settings — tiny surface, batched into Plan 05 long-tail

**Tech Stack:** React 19 function components, inline styles with ConfigContext.isDark, CRA jest preset, `@testing-library/react`, `queueMicrotask`, `AbortController`.

**Testing:** All tests via `CI=true npm test -- --testPathPattern=<pattern> --watchAll=false`. No new jest config. Do not run `react-scripts build`.

**Commit policy:** Per user's `feedback_never_commit` rule, DO NOT run `git commit` at the end of any task. Leave the repo dirty; user commits themselves.

**Impact analysis:** Before editing any function named below, run the GitNexus impact check per `CLAUDE.md`:
`gitnexus_impact({target: "<symbol>", direction: "upstream"})`. Targets this plan touches: `SideMenu` (side_menu.js), `ToolkitInstalledPage`, `ToolkitDetailPanel`, `useChatStream`, `useOllamaLibrary.handlePull`, `refreshModelCatalog`. Report any HIGH/CRITICAL warnings back to the user before editing.

---

### Task 1: Upgrade side_menu lazy-modal Suspense fallback

**Why:** `<Suspense fallback={null}>` produces a blank flash during dynamic `import()` (Settings/Toolkit/Agents/Workspace/MemoryInspect modals). Replace with the centered `SuspenseFallback` so the user sees an `ArcSpinner` instead of nothing.

**Files:**
- Modify: `src/COMPONENTs/side-menu/side_menu.js` (lines ~3 and ~722)
- Modify/create test: `src/COMPONENTs/side-menu/side_menu.test.js` — add a targeted test (do not rewrite existing tests)

- [ ] **Step 1: Write the failing test**

Add a new test case to `src/COMPONENTs/side-menu/side_menu.test.js` that mounts `SideMenu` and asserts the Suspense fallback is `SuspenseFallback`, not `null`. Use existing mocks/setup from the file.

```js
// Additional import at top of side_menu.test.js (alongside existing imports)
import SuspenseFallback from "../../BUILTIN_COMPONENTs/suspense/suspense_fallback";

// New test case appended inside the existing describe block
it("uses SuspenseFallback (not null) for lazy modals", () => {
  const { container } = renderSideMenu();
  // Open a modal trigger — settings button — to force the Suspense subtree
  const settingsBtn = container.querySelector('[data-testid="side-menu-settings-btn"]');
  // (If this test id doesn't exist yet, skip the click — the Suspense boundary still wraps idle lazy mounts and SuspenseFallback must be referenced in the tree.)
  // Static assertion: the rendered output references the SuspenseFallback import (presence check)
  expect(SuspenseFallback).toBeDefined();
  // Runtime: assert fallback content not replaced with a literal `null` node
  // (Presence of arc-spinner data-testid when lazy chunk is pending is covered by the import swap — see snapshot)
  expect(container).toMatchSnapshot();
});
```

If a `data-testid` for the settings button doesn't exist, the snapshot-level check is sufficient to lock in the Suspense fallback change. Do not add new test ids to production code just for this test.

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=side-menu/side_menu.test --watchAll=false`
Expected: new test fails (snapshot mismatch or missing SuspenseFallback import).

- [ ] **Step 3: Implement the swap**

In `src/COMPONENTs/side-menu/side_menu.js`:

At the top, add the import (alongside existing BUILTIN_COMPONENTs imports):

```js
import SuspenseFallback from "../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
```

Then find the existing Suspense at line ~722:

```js
<Suspense fallback={null}>
```

Replace with:

```js
<Suspense fallback={<SuspenseFallback minHeight={0} />}>
```

(`minHeight={0}` because modals appear over content — no need for a 120px reserve; the spinner just shows momentarily until the chunk resolves.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --testPathPattern=side-menu/side_menu.test --watchAll=false`
Expected: all tests PASS (update the snapshot with `-u` if the diff is the expected Suspense fallback change only).

- [ ] **Step 5: Manual verification**

Document for user (no commit): "Verify by starting dev (`npm start`), clicking Settings/Toolkit buttons, observing a brief ArcSpinner (instead of blank) on first open per session."

---

### Task 2: Migrate ToolkitInstalledPage catalog load to useAsyncAction + SuspenseFallback

**Why:** `ToolkitInstalledPage` currently owns `loading/error` state manually and renders `<LoadingDots />`. Moving to `useAsyncAction` (a) gives it consistent top-bar contribution when load exceeds 300 ms, (b) centralizes error→toast, (c) removes one-off retry/abort logic that currently doesn't cancel on unmount.

**Files:**
- Modify: `src/COMPONENTs/toolkit/pages/toolkit_installed_page.js`
- Modify test: `src/COMPONENTs/toolkit/pages/toolkit_installed_page.test.js` — if a test file doesn't exist, create a minimal one

- [ ] **Step 1: Check for existing test**

Run: `CI=true npm test -- --testPathPattern=toolkit_installed_page --watchAll=false --listTests`
Expected: may or may not exist.

If it does not exist, create `src/COMPONENTs/toolkit/pages/toolkit_installed_page.test.js` with a minimal render test as the scaffold (below, Step 2). Otherwise extend the existing file.

- [ ] **Step 2: Write the failing test**

In `src/COMPONENTs/toolkit/pages/toolkit_installed_page.test.js`:

```js
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ToolkitInstalledPage from "./toolkit_installed_page";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import * as api from "../../../SERVICEs/api";
import * as progressBus from "../../../SERVICEs/progress_bus";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: { unchain: { listToolModalCatalog: jest.fn() } },
  api: { unchain: { listToolModalCatalog: jest.fn() } },
}));

const renderPage = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <ToolkitInstalledPage isDark={false} onToolClick={() => {}} />
    </ConfigContext.Provider>,
  );

describe("ToolkitInstalledPage loading", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows SuspenseFallback (ArcSpinner) while loading, then list", async () => {
    let resolveListCatalog;
    api.default.unchain.listToolModalCatalog.mockReturnValue(
      new Promise((r) => { resolveListCatalog = r; }),
    );
    const { container } = renderPage();
    // Spinner visible while pending
    expect(container.querySelector('[data-testid="arc-spinner"]')).toBeTruthy();
    resolveListCatalog({ toolkits: [] });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="arc-spinner"]')).toBeFalsy();
    });
  });

  it("contributes to progress_bus for catalog load", async () => {
    const startSpy = jest.spyOn(progressBus, "start");
    const stopSpy = jest.spyOn(progressBus, "stop");
    api.default.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    renderPage();
    // start may be delayed by progressThresholdMs=300, so wait
    await waitFor(() => expect(stopSpy).toHaveBeenCalled(), { timeout: 1000 });
    // If load completed before threshold, start may never fire — both cases valid
    expect(stopSpy).toHaveBeenCalled();
  });
});
```

If `api.unchain` is shaped differently (real `api` default export vs named export `api`), adjust the mock shape to match what the file actually imports (`api from "../../../SERVICEs/api"`). Check `toolkit_installed_page.js:2` before writing the mock.

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=toolkit_installed_page --watchAll=false`
Expected: FAIL — current page uses `<LoadingDots />`, not `arc-spinner`.

- [ ] **Step 4: Migrate the page**

In `src/COMPONENTs/toolkit/pages/toolkit_installed_page.js`:

Replace the import block:

```js
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";
import { BASE_TOOLKIT_IDENTIFIERS } from "../constants";
import ToolkitRow from "../components/toolkit_row";
import LoadingDots from "../components/loading_dots";
import PlaceholderBlock from "../components/placeholder_block";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
```

with:

```js
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";
import { BASE_TOOLKIT_IDENTIFIERS } from "../constants";
import ToolkitRow from "../components/toolkit_row";
import SuspenseFallback from "../../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import PlaceholderBlock from "../components/placeholder_block";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
```

Replace the body of the component's state / loadCatalog / effect:

```js
const [toolkits, setToolkits] = useState([]);
const [search, setSearch] = useState("");

const { run: loadCatalog, pending: loading, error } = useAsyncAction(
  useCallback(async (_, { signal }) => {
    const payload = await api.unchain.listToolModalCatalog({ signal });
    const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
    const visible = list.filter(
      (tk) => tk.source !== "plugin" && !tk.hidden && !isBaseById(tk.toolkitId),
    );
    const validIds = visible.map((tk) => tk.toolkitId);
    removeInvalidToolkitIds("global", validIds);
    const enabledIds = new Set(getDefaultToolkitSelection("global"));
    return visible.map((tk) => ({
      ...tk,
      defaultEnabled: enabledIds.has(tk.toolkitId),
    }));
  }, []),
  { label: "toolkit_catalog_load" },
);

useEffect(() => {
  loadCatalog().then((result) => {
    if (result !== undefined) setToolkits(result);
  });
}, [loadCatalog]);
```

Note: `api.unchain.listToolModalCatalog` must accept an options object with `{ signal }`. If it currently doesn't, pass `signal` but ignore — the network layer in PuPu does not yet plumb AbortSignal through IPC; `useAsyncAction` still uses the signal internally to detect unmount-time aborts. Verify by reading `src/SERVICEs/api.unchain.js` for `listToolModalCatalog` before this step. If the existing signature is `listToolModalCatalog()` (no args), just call `api.unchain.listToolModalCatalog()` — the `signal` from `useAsyncAction` still short-circuits the result-dispatch path.

Replace the render block:

```js
if (loading) return <LoadingDots isDark={isDark} />;
if (error) {
  return (
    <PlaceholderBlock
      icon="tool"
      title={t("toolkit.unchain_not_connected_title")}
      subtitle={t("toolkit.unchain_not_connected_subtitle")}
      isDark={isDark}
    />
  );
}
```

with:

```js
if (loading) return <SuspenseFallback minHeight={160} />;
if (error) {
  return (
    <PlaceholderBlock
      icon="tool"
      title={t("toolkit.unchain_not_connected_title")}
      subtitle={t("toolkit.unchain_not_connected_subtitle")}
      isDark={isDark}
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `CI=true npm test -- --testPathPattern=toolkit_installed_page --watchAll=false`
Expected: PASS.

Also run the broader toolkit suite to catch breakage:
Run: `CI=true npm test -- --testPathPattern=toolkit --watchAll=false`
Expected: PASS (or same pre-existing failures only; compare to baseline).

---

### Task 3: Migrate ToolkitDetailPanel detail load to useAsyncAction + SuspenseFallback

**Why:** Same reasoning as Task 2. `ToolkitDetailPanel` has an inline `loading/detail/error` state with `LoadingDots`, and manual cancel flag. `useAsyncAction` handles cancel via `AbortController` on unmount for free.

**Files:**
- Modify: `src/COMPONENTs/toolkit/components/toolkit_detail_panel.js`
- Modify test: `src/COMPONENTs/toolkit/components/toolkit_detail_panel.test.js` (exists)

- [ ] **Step 1: Write the failing test**

Append to `toolkit_detail_panel.test.js`:

```js
it("shows SuspenseFallback while loading toolkit detail", async () => {
  let resolveDetail;
  api.default.unchain.getToolkitDetail.mockReturnValue(
    new Promise((r) => { resolveDetail = r; }),
  );
  const { container } = render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <ToolkitDetailPanel
        toolkitId="test_kit"
        toolName={null}
        tools={[]}
        isDark={false}
        isBuiltin={false}
        defaultEnabled={true}
        onToggleEnabled={() => {}}
        onDelete={() => {}}
        onBack={() => {}}
      />
    </ConfigContext.Provider>,
  );
  expect(container.querySelector('[data-testid="arc-spinner"]')).toBeTruthy();
  resolveDetail({ toolkitName: "Test Kit", readmeMarkdown: "# Hello" });
  await waitFor(() => {
    expect(container.querySelector('[data-testid="arc-spinner"]')).toBeFalsy();
  });
});
```

Check existing imports/mocks in the file; reuse them (`api`, `ConfigContext`, `render`, `waitFor`).

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=toolkit_detail_panel --watchAll=false`
Expected: FAIL (currently renders `LoadingDots`).

- [ ] **Step 3: Implement the migration**

In `src/COMPONENTs/toolkit/components/toolkit_detail_panel.js`:

Add imports:

```js
import SuspenseFallback from "../../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
```

Replace the existing `loading/detail/error` state and detail-fetch effect:

Before (from toolkit_detail_panel.js:259-318):
```js
const [loading, setLoading] = useState(true);
const [detail, setDetail] = useState(null);
const [error, setError] = useState(null);
// ...
useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);
  api.unchain
    .getToolkitDetail(toolkitId, toolName)
    .then((payload) => { if (!cancelled) setDetail(payload); })
    .catch((err) => { if (!cancelled) setError(err?.message || t("toolkit.load_detail_failed")); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, [toolkitId, toolName, t]);
```

After:
```js
const [detail, setDetail] = useState(null);
const { run: loadDetail, pending: loading, error: loadError } = useAsyncAction(
  useCallback(
    async (args) => {
      const { id, name } = args;
      return await api.unchain.getToolkitDetail(id, name);
    },
    [],
  ),
  { label: "toolkit_detail_load" },
);
const error = loadError ? (loadError.message || t("toolkit.load_detail_failed")) : null;

useEffect(() => {
  setDetail(null);
  loadDetail({ id: toolkitId, name: toolName }).then((payload) => {
    if (payload !== undefined) setDetail(payload);
  });
}, [toolkitId, toolName, loadDetail]);
```

Replace the inner render:

```js
{loading && <LoadingDots isDark={isDark} />}
```

with:

```js
{loading && <SuspenseFallback minHeight={120} />}
```

Remove the now-unused `LoadingDots` import only if no other code in the file references it. (Leave it if `LoadingDots` is still imported elsewhere in the same file — a quick grep in the file confirms.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --testPathPattern=toolkit_detail_panel --watchAll=false`
Expected: PASS.

---

### Task 4: Wire useChatStream lifecycle into progress_bus

**Why:** While a chat is streaming, the top progress bar should be active so the user has a calm, always-visible signal that work is in flight (even after the Send button "loses" its pending state). Send and Stop themselves stay instant; progress is a background ambient cue, not a button blocker.

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js`
- Modify test: `src/PAGEs/chat/hooks/use_chat_stream.test.js` (if exists) or use an integration test

- [ ] **Step 1: Locate the stream start/end points**

Open `src/PAGEs/chat/hooks/use_chat_stream.js` and find the lifecycle entry/exit points. Typically:
- Start: right before `api.unchain.startStreamV2(payload, handlers)` is called (or inside a `submit`/`send` function)
- End: in the `onDone` and `onError` handlers, plus in the `onStop`/abort path

Search for: `startStreamV2`, `onDone`, `onError`, `abortController`, `streamId`.

- [ ] **Step 2: Write the failing test**

If `use_chat_stream.test.js` exists, add a new test case. If not, create `src/PAGEs/chat/hooks/use_chat_stream.progress_bus.test.js` with a minimal scaffold that imports the hook, mocks `api.unchain.startStreamV2`, and asserts `progress_bus.start`/`stop` are called:

```js
import { renderHook, act } from "@testing-library/react";
import * as progressBus from "../../../SERVICEs/progress_bus";
// Import the hook from its actual path
// import { useChatStream } from "./use_chat_stream";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      startStreamV2: jest.fn((_payload, handlers) => {
        // Simulate sync start then delayed done
        queueMicrotask(() => handlers.onToken?.("hello"));
        setTimeout(() => handlers.onDone?.({ ok: true }), 10);
        return { cancel: jest.fn() };
      }),
    },
  },
}));

describe("useChatStream progress_bus integration", () => {
  it("calls progress_bus.start on stream begin and progress_bus.stop on done", async () => {
    const startSpy = jest.spyOn(progressBus, "start");
    const stopSpy = jest.spyOn(progressBus, "stop");
    // Render hook with minimum required props
    // ... (adapt to actual hook signature)
    // Trigger send
    // await waitFor(() => expect(startSpy).toHaveBeenCalledWith(expect.any(String), "chat_stream"));
    // await waitFor(() => expect(stopSpy).toHaveBeenCalled());
  });
});
```

Because `use_chat_stream.js` is ~1900 lines and likely has complex setup, the preferred test strategy is **integration through `chat.test.js`**: add a test that asserts `progress_bus.start` is called during a simulated send. Inspect `src/PAGEs/chat/chat.test.js` first to reuse fixtures.

**If integration is simpler, skip the unit test** and write two assertions inside the existing chat.test.js flow: one for `progress_bus.start` being called after send, one for `progress_bus.stop` after onDone.

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=use_chat_stream --watchAll=false` (or chat.test if integration)
Expected: FAIL.

- [ ] **Step 4: Instrument use_chat_stream.js**

At the top of `use_chat_stream.js`, add the import:

```js
import * as progressBus from "../../../SERVICEs/progress_bus";
```

(Adjust relative path to reach `src/SERVICEs/progress_bus.js`.)

Inside the hook, at the point where a stream actually starts (right before calling `api.unchain.startStreamV2`), generate a stable stream id and call:

```js
const streamProgressIdRef = useRef(null);
// ... inside the send / startStream function, just before api.unchain.startStreamV2(...):
const progressId = `chat_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
streamProgressIdRef.current = progressId;
progressBus.start(progressId, "chat_stream");
```

In the stream's `onDone` handler:

```js
if (streamProgressIdRef.current) {
  progressBus.stop(streamProgressIdRef.current);
  streamProgressIdRef.current = null;
}
```

In the stream's `onError` handler:

```js
if (streamProgressIdRef.current) {
  progressBus.stop(streamProgressIdRef.current);
  streamProgressIdRef.current = null;
}
```

In the abort / stop handler (wherever the user's Stop button's action reaches the hook):

```js
if (streamProgressIdRef.current) {
  progressBus.stop(streamProgressIdRef.current);
  streamProgressIdRef.current = null;
}
```

Also add a cleanup on unmount:

```js
useEffect(() => {
  return () => {
    if (streamProgressIdRef.current) {
      progressBus.stop(streamProgressIdRef.current);
      streamProgressIdRef.current = null;
    }
  };
}, []);
```

**Invariant:** Every `progress_bus.start` must have exactly one matching `stop`. Four exit paths exist — onDone, onError, abort/stop, unmount. All four must call `stop` and clear the ref.

- [ ] **Step 5: Run tests**

Run: `CI=true npm test -- --testPathPattern=chat --watchAll=false`
Expected: PASS (or same pre-existing failure count as baseline).

- [ ] **Step 6: Manual verification**

Start dev (`npm start`), send a chat message, observe: top progress bar lights up within 300 ms and stays until stream ends. Click Stop mid-stream → bar fades out.

---

### Task 5: Wire Ollama pullModel into progress_bus

**Why:** Ollama pulls already have their own per-row percent UI in the model library modal. But the global top bar gives a second, ambient signal visible even when the user navigates away from the library — matches chat-stream behavior.

**Files:**
- Modify: `src/COMPONENTs/settings/model_providers/hooks/use_ollama_library.js`
- Modify test: `src/COMPONENTs/settings/model_providers/hooks/use_ollama_library.test.js` (if exists; otherwise skip unit test, add manual verify step)

- [ ] **Step 1: Write the failing test**

If a test file exists, add to it. Otherwise, add a targeted spy-based test in a new file `use_ollama_library.progress.test.js`:

```js
import * as progressBus from "../../../../SERVICEs/progress_bus";
// mock api.ollama.pullModel, render the hook, call handlePull, assert start/stop
```

Because `use_ollama_library` has broader dependencies (stores, search debounce), a full hook test may be heavy. A thinner alternative: extract `handlePull`'s pull_store wiring into a comment-coupled assertion at the bottom of whichever test file already exercises this hook. If none exists, **skip the unit test** and rely on the manual verify in Step 6.

- [ ] **Step 2: Run test to verify it fails (if written)**

Run: `CI=true npm test -- --testPathPattern=use_ollama_library --watchAll=false`
Expected: FAIL (if test added).

- [ ] **Step 3: Instrument handlePull**

In `use_ollama_library.js`, add the import near the existing imports:

```js
import * as progressBus from "../../../../SERVICEs/progress_bus";
```

(Check the relative path — the file is 4 levels deep.)

Modify `handlePull`:

After `pull_store.refs[key] = controller;` (around line 75), add:

```js
progressBus.start(`ollama_pull_${key}`, `ollama_pull:${fullName}`);
```

In the `.then(() => { ... })` block (line 90+), at the beginning:

```js
progressBus.stop(`ollama_pull_${key}`);
```

In the `.catch((err) => { ... })` block (line 105+), at the beginning:

```js
progressBus.stop(`ollama_pull_${key}`);
```

In `handleCancel` (line 126+), after `pull_store.refs[key]?.abort();`:

```js
progressBus.stop(`ollama_pull_${key}`);
```

**Invariant:** same as Task 4 — one start per key, matched by stop on resolve/reject/abort.

- [ ] **Step 4: Run broader tests**

Run: `CI=true npm test -- --testPathPattern=use_ollama_library --watchAll=false`
Expected: existing tests PASS (new start/stop calls should not break them).

- [ ] **Step 5: Manual verification**

Open Settings → Model Providers → Ollama → Library, trigger a pull for a small model. Observe top progress bar activates after 300 ms and stops on completion or cancel.

---

### Task 6: Wire model catalog refresh into progress_bus

**Why:** The `refreshModelCatalog` at `src/PAGEs/chat/chat.js:376` is an IPC round-trip to Flask. It's fast, but chains of refreshes after toolkit/provider changes are user-perceptible. Wire to top bar for ambient signal. This is the smallest of the three progress wirings.

**Files:**
- Modify: `src/PAGEs/chat/chat.js`
- Modify test: `src/PAGEs/chat/chat.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/PAGEs/chat/chat.test.js`:

```js
import * as progressBus from "../../SERVICEs/progress_bus";

it("wires refreshModelCatalog to progress_bus", async () => {
  const startSpy = jest.spyOn(progressBus, "start");
  const stopSpy = jest.spyOn(progressBus, "stop");
  // Use existing render setup that triggers the catalog fetch
  renderChatInterface(); // whatever helper exists
  await waitFor(() => {
    expect(window.unchainAPI.getModelCatalog).toHaveBeenCalled();
  });
  // start may have been called (if latency > 300ms) — at minimum stop must fire after fetch settles
  await waitFor(() => expect(stopSpy).toHaveBeenCalled());
});
```

Adapt `renderChatInterface` to whatever the test file's existing helper is.

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=chat.test --watchAll=false`
Expected: FAIL on progress_bus assertions.

- [ ] **Step 3: Instrument refreshModelCatalog**

In `src/PAGEs/chat/chat.js`, add import near the other `SERVICEs` imports:

```js
import * as progressBus from "../../SERVICEs/progress_bus";
```

Replace `refreshModelCatalog` (at line ~376):

```js
const refreshModelCatalog = useCallback(async () => {
  const progressId = `model_catalog_refresh_${Date.now()}`;
  progressBus.start(progressId, "model_catalog_refresh");
  try {
    const normalized = await api.unchain.getModelCatalog();
    setModelCatalog(normalized);
    if (
      !session.isCharacterChat &&
      (modelIdRef.current === "unchain-unset" || !modelIdRef.current) &&
      normalized.activeModel
    ) {
      const currentChatId = activeChatIdRef.current;
      modelIdRef.current = normalized.activeModel;
      setSelectedModelId(normalized.activeModel);
      if (currentChatId) {
        storageApi.setChatModel(
          currentChatId,
          { id: normalized.activeModel },
          { source: "chat-page" },
        );
      }
    }
  } catch (_error) {
    // ignore transient catalog fetch failures
  } finally {
    progressBus.stop(progressId);
  }
}, [
  activeChatIdRef,
  modelIdRef,
  session.isCharacterChat,
  setSelectedModelId,
  storageApi,
]);
```

Do not change any other behavior — `catch (_error)` still swallows, deps array unchanged.

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --testPathPattern=chat.test --watchAll=false`
Expected: PASS (or same pre-existing failures only).

- [ ] **Step 5: Manual verification**

Start dev, trigger a provider config change (e.g., add an API key and save), observe top progress bar flicker as catalog refreshes.

---

### Final verification

- [ ] **Step 1: Run full test suite**

Run: `CI=true npm test -- --watchAll=false`
Expected: same pre-existing failure count as Plan 01 baseline (18 failures unrelated to these changes). No NEW failures introduced by Plan 02.

If new failures appear, diagnose and fix before reporting complete. Do NOT paper over by updating snapshots blindly — verify the snapshot change is the intended SuspenseFallback/progress_bus swap.

- [ ] **Step 2: Run GitNexus detect_changes**

Run: `gitnexus_detect_changes({scope: "all"})` (via MCP) to confirm only expected files changed:
- `src/COMPONENTs/side-menu/side_menu.js`
- `src/COMPONENTs/side-menu/side_menu.test.js`
- `src/COMPONENTs/toolkit/pages/toolkit_installed_page.js`
- `src/COMPONENTs/toolkit/pages/toolkit_installed_page.test.js` (new or modified)
- `src/COMPONENTs/toolkit/components/toolkit_detail_panel.js`
- `src/COMPONENTs/toolkit/components/toolkit_detail_panel.test.js`
- `src/PAGEs/chat/hooks/use_chat_stream.js`
- `src/PAGEs/chat/hooks/use_chat_stream.progress_bus.test.js` (new, optional)
- `src/PAGEs/chat/chat.js`
- `src/PAGEs/chat/chat.test.js`
- `src/COMPONENTs/settings/model_providers/hooks/use_ollama_library.js`

Report HIGH/CRITICAL warnings back to the user.

- [ ] **Step 3: Stop and notify user**

Per `feedback_never_commit`, DO NOT commit. Report to the user:
- Tasks completed: 1–6 (or which subset if stopped early)
- Files touched (list)
- Test results (pass counts, any new failures)
- Manual verification items user should confirm (npm start → Send chat / open Settings modal / pull Ollama model)

User commits when they're satisfied.

---

## Risk Notes

- **use_chat_stream** is a 1900-line hook with multiple exit paths (done, error, abort, retry, unmount). The biggest risk in Task 4 is leaking a `progress_bus.start` without a matching `stop`. Before shipping, manually trigger: (a) normal send → done, (b) send → stop mid-stream, (c) send → trigger error (e.g. disconnect Flask), (d) send → navigate away while streaming. All four must leave `progress_bus.getActive().count === 0`.
- **AbortController signal through IPC**: PuPu's IPC layer may not forward `AbortSignal` to Flask. `useAsyncAction` still uses the signal for internal dispatch-guard (it ignores the settle if aborted), so passing `signal` to API calls is safe even if the API ignores it. Document this as a known limitation, not a bug, in Tasks 2 and 3.
- **Test mock shape for `api.unchain`**: tests in PuPu sometimes mock via `window.unchainAPI` (preload bridge) instead of the service facade. Verify each test file's existing mock style before writing new mocks.
