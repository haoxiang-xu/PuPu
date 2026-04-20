# Frontend Loading Decoupling — Plan 03: Optimistic Audit & Harden

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining A-class gaps identified during Plan 02 execution. Most of the originally-planned "optimistic migration" sites turned out to already be optimistic — leaving three concrete high-value fixes:

1. Character-chat `Send` currently awaits `buildCharacterRunConfig` **before** pushing the user message; make it optimistic
2. Attachment remove silently swallows `deleteAttachmentPayload` failures; surface them via toast
3. Settings save feedback (API key / memory / feature flags) is inconsistent — some use local "just saved" state, some show nothing. Unify through `toast.success`.

**Architecture:** No new infrastructure. Re-use `useOptimisticUpdate` (from Plan 01) for the character-chat send fix, and `toast` for settings feedback. All three tasks are surgical edits, not migrations.

**Out of scope for this plan:**
- Regular (non-character) Send — already optimistic (verified at `use_chat_stream.js:1087`)
- Toolkit enable/disable toggle — already sync localStorage
- Chat session switch — already optimized via `feedback_pupu_perf_store_coalesce`
- Anything requiring Flask backend changes

**Tech Stack:** React 19 function components, inline styles with ConfigContext.isDark, CRA jest preset, `@testing-library/react`.

**Testing:** `CI=true npm test -- --testPathPattern=<pattern> --watchAll=false`. Do not run `react-scripts build`.

**Commit policy:** Per `feedback_never_commit`, DO NOT run `git commit` at end of any task. Leave the repo dirty.

**Impact analysis:** Before editing, run `gitnexus_impact` on: `buildCharacterRunConfig`, `removeDraftAttachment`, `APIKeyInput.handleSave`. Flag HIGH/CRITICAL risk to user before proceeding.

---

### Task 1: Make character-chat Send optimistic

**Why:** In `use_chat_stream.js`, regular (non-character) chats push `userMessage + assistantPlaceholder` into the messages state **before** any network call — Send feels instant. Character chats take a different path: they `await buildCharacterRunConfig()` at ~line 965 **first**, which is a network round-trip to Flask. During this await, the user sees:
- Input text still in the textarea
- No user bubble, no assistant placeholder
- No feedback beyond top progress bar (Plan 02 wired that)

Fix: reorder the character-chat flow so the optimistic `setMessages` happens first, then `buildCharacterRunConfig` runs after. On config failure, roll back (remove the optimistic messages) and surface the error. This matches the non-character code path's ergonomics.

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_stream.js`

**Risk:** Medium. `use_chat_stream.js` is 1900 lines and the character-chat branch has subtle decision logic (`ignore`/`defer` actions that short-circuit without streaming). Reordering must preserve:
- `ignore` / `defer` paths still work
- `effectiveThreadId` / `effectiveMemoryNamespace` / `effectiveModelId` / `forceMemoryEnabled` get set **before** stream starts
- On rollback, `streamingChatIdsRef` etc. are cleaned up

- [ ] **Step 1: Read the relevant code block**

Open `src/PAGEs/chat/hooks/use_chat_stream.js` and study the function starting around the `sendMessage` / `submitMessage` definition (search for `startStreamV2` usage, around line 1381; walk backwards). Find the block that:
1. Builds `userMessage` and `assistantPlaceholder`
2. Awaits `buildCharacterRunConfig` if `isCharacterChat`
3. Applies character-specific overrides
4. Handles `ignore` / `defer` decisions
5. Calls `setMessages(nextMessages)` and starts the stream

Understand the full control flow before editing. Do NOT skip this step.

- [ ] **Step 2: Write the failing test**

Find `src/PAGEs/chat/hooks/use_chat_stream.test.js` (if it exists). If not, use an integration test — add to `src/PAGEs/chat/chat.test.js`:

```js
it("character chat: user message appears immediately, before buildCharacterRunConfig resolves", async () => {
  let resolveConfig;
  window.unchainAPI.buildCharacterRunConfig.mockImplementation(
    () => new Promise((r) => { resolveConfig = r; })
  );
  // render chat with a character chat id selected
  const { user, renderResult } = renderCharacterChatInterface();
  await user.type(screen.getByRole("textbox"), "hello");
  await user.click(screen.getByRole("button", { name: /send/i }));
  // User message should render BEFORE buildCharacterRunConfig resolves
  expect(screen.getByText("hello")).toBeInTheDocument();
  // Now let config resolve
  resolveConfig({ session_id: "char-session-1" });
});
```

Adapt `renderCharacterChatInterface` to whatever helper exists in `chat.test.js`. If no such helper, construct the minimum mock: `window.unchainAPI.buildCharacterRunConfig`, `window.unchainAPI.startStreamV2`, and a selected character chat id.

If setting up a full integration test is too heavy, write a **focused unit test** around the send-message function by extracting its dependencies as props or by using `renderHook` on `useChatStream` with minimum mocks.

**Fallback:** if a clean test can't be written without major refactor, document that in the plan and rely on manual verification only. Skip the unit test in that case.

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=chat.test --watchAll=false`
Expected: FAIL — user message doesn't appear until config resolves.

- [ ] **Step 4: Reorder the character-chat branch**

In `use_chat_stream.js`, identify the character-chat `await buildCharacterRunConfig()` block (around line 962-971). The current structure is:

```
buildUserMessage + assistantPlaceholder     // ok, happens early
normalizedBaseMessages                       // ok
if (isCharacterChat) {
  await buildCharacterRunConfig()            // ← blocks here
  // then overrides effective* vars
  // then decision branch (ignore/defer/normal)
}
// nextMessages = [...base, userMessage, assistantPlaceholder]
setMessages(nextMessages)                    // ← optimistic, but only after await above
setStreamingChatIds(...)                     // mark as streaming
startStreamV2(...)                           // network
```

Change to:

```
buildUserMessage + assistantPlaceholder
normalizedBaseMessages
nextMessages = [...base, userMessage, assistantPlaceholder]
setMessages(nextMessages)                    // ← OPTIMISTIC: happens FIRST
if (clearComposer) {
  setInputValue(""); setDraftAttachments([]);
}
setStreamError("")
setStreamingChatIds((prev) => new Set(prev).add(targetChatId))
streamingChatIdsRef.current.add(targetChatId)
activeStreamsRef.current.set(targetChatId, { messages: nextMessages })

if (isCharacterChat) {
  try {
    resolvedCharacterConfig = await buildCharacterRunConfig()
  } catch (error) {
    // ROLLBACK
    setMessages(normalizedBaseMessages)
    streamingChatIdsRef.current.delete(targetChatId)
    setStreamingChatIds((prev) => { const n = new Set(prev); n.delete(targetChatId); return n })
    activeStreamsRef.current.delete(targetChatId)
    setStreamError(error?.message || "Failed to prepare this character chat.")
    return false
  }
  // then overrides effective* vars as before
  // then decision branch (ignore/defer handled below)
}
// ... continue with startStreamV2 using effective* vars
```

Notes:
- Keep the `ignore` / `defer` decision branches — they still work because they run **after** `setMessages`, and they explicitly `setMessages(immediateMessages)` anyway which overwrites the optimistic placeholder.
- The `ignore`/`defer` short-circuit still cleans up `streamingChatIdsRef` etc. as it does today. No change needed there.
- On rollback (build config failure), restore `messages` to `normalizedBaseMessages` (no user bubble, no placeholder) and clear streaming state.
- `setInputValue("")` / `setDraftAttachments([])` happen **before** the await, so on rollback the user's text is already gone. Consider preserving it: capture `previousInput = inputValue` before clearing and restore on rollback. User preference: this is a nicer UX (don't lose typed text). Add that.

**Concrete edit:**

Find the `if (isCharacterChat) { ... }` block around line 962 and restructure carefully. Extract:

- The `setMessages` / `setStreamingChatIds` block (currently around line 1087-1097)
- The `await buildCharacterRunConfig()` block (currently around line 962-971)

Move the `setMessages` / streaming-state block **before** the `await`. Wrap the await in try/catch with rollback.

Because this is a ~1900-line function, **make the change minimally**:

```js
// Before the character-chat block, capture these for potential rollback:
const previousInput = inputValue;
const previousDraftAttachments = [...draftAttachments];

// Push optimistic state (moved up from ~line 1087):
const nextMessages = [
  ...normalizedBaseMessages,
  userMessage,
  assistantPlaceholder,
];
setMessages(nextMessages);
if (clearComposer) {
  setInputValue("");
  setDraftAttachments([]);
}
setStreamError("");
setStreamingChatIds((prev) => new Set(prev).add(targetChatId));
streamingChatIdsRef.current.add(targetChatId);
activeStreamsRef.current.set(targetChatId, { messages: nextMessages });

// Now do the character build (was originally before setMessages):
let resolvedCharacterConfig = characterAgentConfig;
if (isCharacterChat) {
  if (!resolvedCharacterConfig) {
    try {
      resolvedCharacterConfig = await buildCharacterRunConfig();
    } catch (error) {
      // Rollback optimistic UI
      setMessages(normalizedBaseMessages);
      setStreamingChatIds((prev) => {
        const next = new Set(prev);
        next.delete(targetChatId);
        return next;
      });
      streamingChatIdsRef.current.delete(targetChatId);
      activeStreamsRef.current.delete(targetChatId);
      if (clearComposer) {
        setInputValue(previousInput);
        setDraftAttachments(previousDraftAttachments);
      }
      setStreamError(
        error?.message || "Failed to prepare this character chat.",
      );
      return false;
    }
  }
  // (rest of character block unchanged: session_id check, effective* overrides, decision branch)
}

// Remove the second setMessages / streaming-state block that originally lived after the character block.
```

**Important:** The original code has a second `setMessages(nextMessages)` at ~line 1087 that runs AFTER the character block. After this refactor, that block is moved UP — so the original block at line 1087 must be REMOVED (or left if the variable has been reassigned — double-check `nextMessages` isn't redefined after the character block).

Read the file carefully around line 1081-1097 before editing. If `nextMessages` is redefined after character decisions, the original `setMessages` call may still be needed with the updated value. In that case, keep it but skip its companion `setStreamingChatIds` / `activeStreamsRef` block (moved up).

- [ ] **Step 5: Run tests**

Run: `CI=true npm test -- --testPathPattern=chat --watchAll=false`
Expected: same pre-existing failure count (6 chat-bubble / trace_chain) — no new failures. New integration test (if added) passes.

- [ ] **Step 6: Manual verification**

Start dev, open a character chat, type a message, click Send. Observe:
- User bubble and assistant placeholder appear IMMEDIATELY (not after config network round-trip)
- Input clears immediately
- Top progress bar lights up as streaming begins
- If `buildCharacterRunConfig` fails (e.g., kill Flask), message rolls back and error banner appears

---

### Task 2: Attachment remove — surface payload-delete failures

**Why:** `use_chat_attachments.js:516` silently swallows errors from `deleteAttachmentPayload`:

```js
deleteAttachmentPayload(normalizedAttachmentId).catch(() => {});
```

If the underlying IndexedDB / localStorage delete fails, the user sees the attachment disappear from the UI (optimistic state), but the payload lingers in storage — this can cause ghost attachments or storage-quota issues. Surface failures via `toast.error` but keep the optimistic UI — a failed payload-delete should not re-appear the chip, since the chip is the user's intent. Just notify them.

**Files:**
- Modify: `src/PAGEs/chat/hooks/use_chat_attachments.js`

- [ ] **Step 1: Write the failing test**

Check if `use_chat_attachments.test.js` exists:

```
CI=true npm test -- --testPathPattern=use_chat_attachments --watchAll=false --listTests
```

If it does, append a test. If not, add a targeted spy test:

```js
// src/PAGEs/chat/hooks/use_chat_attachments.remove_error.test.js
import { renderHook, act } from "@testing-library/react";
import { useChatAttachments } from "./use_chat_attachments";
import * as toast from "../../../SERVICEs/toast";
import * as storage from "../../../SERVICEs/attachment_storage";

jest.mock("../../../SERVICEs/attachment_storage", () => ({
  __esModule: true,
  deleteAttachmentPayload: jest.fn(),
  loadAttachmentPayload: jest.fn(),
  saveAttachmentPayload: jest.fn(),
}));

describe("useChatAttachments.removeDraftAttachment error surfacing", () => {
  it("emits toast.error when deleteAttachmentPayload rejects", async () => {
    const errorSpy = jest.spyOn(toast.toast, "error");
    storage.deleteAttachmentPayload.mockRejectedValueOnce(
      new Error("quota exceeded"),
    );
    const { result } = renderHook(() =>
      useChatAttachments({
        chatId: "c1",
        initialDraftAttachments: [{ id: "att-1", name: "x.png" }],
        attachmentsEnabled: true,
        attachmentsDisabledReason: "",
        supportsImageAttachments: true,
        supportsPdfAttachments: true,
        setStreamError: () => {},
        maxAttachmentBytes: 10_000_000,
        maxAttachmentCount: 5,
      }),
    );
    await act(async () => {
      result.current.removeDraftAttachment("att-1");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("quota exceeded"),
    );
    // Optimistic UI should still show the attachment removed
    expect(result.current.draftAttachments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=use_chat_attachments.remove_error --watchAll=false`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/PAGEs/chat/hooks/use_chat_attachments.js`, add import at top:

```js
import { toast } from "../../../SERVICEs/toast";
```

Replace:

```js
deleteAttachmentPayload(normalizedAttachmentId).catch(() => {});
```

with:

```js
deleteAttachmentPayload(normalizedAttachmentId).catch((err) => {
  toast.error(
    `Failed to clean up attachment storage: ${err?.message || "unknown error"}`,
  );
});
```

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --testPathPattern=use_chat_attachments --watchAll=false`
Expected: PASS.

---

### Task 3: Unify settings-save feedback via toast.success

**Why:** Three settings surfaces have inconsistent save feedback:

- **API key save** (`api_key_input.js:82`): button label temporarily becomes "Saved" + a small "✓ Saved" text appears to the right (local `justSaved` state). Works but requires user to look at specific spot.
- **Memory settings** (`COMPONENTs/settings/memory/index.js`): writes on every change, no success feedback
- **Feature flags** (`feature_flags.js` consumers): writes on toggle, no feedback

Unify: any user-initiated settings save emits `toast.success("Saved")` for ambient global feedback. Keep the existing local "Saved" state on API key as secondary affirmation — don't remove it, just supplement.

**Scope for this task:** API key save only. Memory and feature flags have different UX patterns (auto-save on change, rapid-fire toggles) that would spam toast. Save those for a future plan if needed.

**Files:**
- Modify: `src/COMPONENTs/settings/model_providers/components/api_key_input.js`

- [ ] **Step 1: Write the failing test**

Check for an existing test file:

```
CI=true npm test -- --testPathPattern=api_key_input --watchAll=false --listTests
```

If it exists, append. If not, create `src/COMPONENTs/settings/model_providers/components/api_key_input.test.js`:

```js
import { render, fireEvent } from "@testing-library/react";
import APIKeyInput from "./api_key_input";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import * as toast from "../../../../SERVICEs/toast";

jest.mock("../storage", () => ({
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(),
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  emitModelCatalogRefresh: jest.fn(),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

describe("APIKeyInput save feedback", () => {
  it("fires toast.success on Save click with non-empty value", () => {
    const successSpy = jest.spyOn(toast.toast, "success");
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <APIKeyInput storage_key="openai_api_key" label="OpenAI" placeholder="sk-..." />
      </ConfigContext.Provider>,
    );
    const input = container.querySelector('input[type="password"]');
    fireEvent.change(input, { target: { value: "sk-test-123" } });
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("model_providers.save"),
    );
    fireEvent.click(saveBtn);
    expect(successSpy).toHaveBeenCalled();
  });
});
```

If the button label text comes via `t(...)` and the test mock for `useTranslation` just echoes keys, the button will have text `"model_providers.save"` — the test handles that.

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --testPathPattern=api_key_input --watchAll=false`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/COMPONENTs/settings/model_providers/components/api_key_input.js`, add import:

```js
import { toast } from "../../../../SERVICEs/toast";
```

Modify `handleSave`:

```js
const handleSave = useCallback(() => {
  const trimmed = value.trim();
  writeModelProviders({ [storage_key]: trimmed });
  emitModelCatalogRefresh();
  setValue(trimmed);
  setSaved(!!trimmed);
  setJustSaved(true);
  if (trimmed) {
    toast.success(`${label} saved`, { dedupeKey: `api_key_save_${storage_key}` });
  }
}, [value, storage_key, label]);
```

Note: use `dedupeKey` (per `toast_host.js` 2s dedupe window) so rapid repeat saves don't stack.

- [ ] **Step 4: Run tests**

Run: `CI=true npm test -- --testPathPattern=api_key_input --watchAll=false`
Expected: PASS.

Also run broader settings tests to check for regressions:
Run: `CI=true npm test -- --testPathPattern=model_providers --watchAll=false`

---

### Final verification

- [ ] **Step 1: Run full test suite**

Run: `CI=true npm test -- --watchAll=false`
Expected: 18 pre-existing failures only (same as Plan 02 baseline). No NEW failures.

- [ ] **Step 2: Stop and report to user**

Per `feedback_never_commit`: DO NOT commit. Report what changed, what was skipped, and what the user should manually verify.

---

## Risk Notes

- **Task 1** is the riskiest — reordering a flow inside a 1900-line hook. Key invariants: streaming state cleanup on rollback, `ignore`/`defer` paths still work, `effectiveThreadId`/`effectiveModelId` still get set before stream start. Manual test all four paths: (a) normal character chat send + success, (b) build config fails, (c) decision=ignore, (d) decision=defer with courtesy_message.
- **Task 2** is trivial.
- **Task 3** scope is intentionally narrow (API key only). Memory / feature flags toasts are deferred — would spam on auto-save unless debounced.
- If Task 1 proves too risky to get right without refactoring, **stop and consult user** before plowing through. A broken character-chat send is worse than no optimistic fix.
