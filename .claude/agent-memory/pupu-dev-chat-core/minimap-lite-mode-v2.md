---
name: minimap-lite-mode-v2
description: Chat minimap streaming perf — why it stays mounted but must do ZERO React work during streaming (lite mode v2), and how
metadata:
  type: project
---

The chat message minimap (`src/COMPONENTs/chat-messages/components/message_minimap.js` + `hooks/use_message_minimap.js`) has cycled through three designs on the same streaming-perf tradeoff. Know the history before touching it.

- **d874f7f (2026-06-07):** minimap DISABLED during streaming — it caused jank.
- **81cd098:** kept it mounted during streaming (lite mode) for 在场感/navigation, but the mitigation wasn't cheap enough → streaming went laggy again.
- **lite mode v2 (2026-07-03, this work):** keep mounted AND make it truly **zero React participation during streaming**. Disabling is off the table — presence is a product goal.

**Why:** during streaming, three costs each caused a React re-init storm: (1) every trace-frame append changed `messages` identity → new `measure`/`segments` → the big `useLayoutEffect` fully re-initialized (re-add listeners + full recalcGeometry); (2) the 400ms lite timer's `measure()` bumped `version` → re-render → segments rebuild → effect re-init; (3) per-scroll `update()` ran synchronously, forcing reflow after the streaming store's DOM writes.

**How to apply (the invariants — do not regress):**
- `measure` must keep **stable identity** (deps `[messageNodeRefs]` only; reads latest messages from a ref). Changing its deps back to `[messages]` reintroduces the effect-reinit storm.
- During streaming, `measure` writes the height cache **only** — it must NOT `setVersion`/calibrate (guarded by `isStreamingRef.current && !forceConverge`). The single convergence is the **falling-edge effect** (`isStreaming` true→false) calling `measure({ forceConverge: true })`.
- `segments` identity is frozen during streaming via a **structure signature** (`length | firstId | lastId`), not `messages` identity. Trace-frame append keeps the signature stable → segments ref stable → downstream effect deps unchanged → no re-init. A NEW message changes the signature and correctly rebuilds.
- Geometry accuracy during streaming is imperative, not React: `effectiveHeight(i)` overrides frozen segment heights with the rendered node's real `offsetHeight` inside `recalcGeometry`/`applyLayout`/`computeContentGeom`. segments stay frozen; box/tick/counts don't drift.
- per-scroll `update()` is **rAF-coalesced** (`scheduleUpdate`); direct `update()` stays for mount/timer/endDrag.

**Residual per-frame work during streaming (audited, acceptable):** MessageMinimap is not `React.memo`'d, so a parent re-render still runs its function body (cheap reconcile of the tick divs — segments ref is stable but `.map` makes new element objects). No effect re-init, no DOM measure, no setState from the minimap. Memoizing MessageMinimap could skip even that reconcile but was out of scope (and `safeVisibleStart` can change mid-stream). All heavy geometry lives in the imperative 400ms timer + rAF paths.

Tests: `hooks/use_message_minimap.test.js` (identity stability, lite measure no-bump, falling-edge convergence), `components/message_minimap.test.js` (rAF coalescing, real-height override), `minimap_streaming.integration.test.js` (effect not re-initialized on trace append). Run: `CI=true npx react-scripts test --watchAll=false src/COMPONENTs/chat-messages`.
