---
name: boot-gate-chat-core-contract
description: Boot gate is two-gate (chatFirstScreen AND backend) since 2026-08-04 — what my two call sites in chat.js may and may not assume, and why chat now runs live under an indefinite overlay
metadata:
  type: project
---

The boot gate became an **AND of two gates** on 2026-08-04 (pupu-dev-electron, reviewed by me). `bootProgress.signalReady()` no longer means "the user is in" — it satisfies only `chatFirstScreen`; `backend` (unchain sidecar + MCP env, driven from main) must also open before `ready` flips.

**Why:** gating only on "chat painted its first screen" handed the user a working-looking composer whose every send died at the sidecar boundary. The whole rework exists to make that impossible — hence the standing invariant that *no clock may open the backend gate in any code path*.

**How to apply — the three constraints this puts on my lane:**

1. **`chat.js` `signalReady()` must stay a bare fire-and-forget.** It has no post-condition: after it returns, `ready` may still be false for 90s or forever. Never add "and then …" logic behind it, never poll it, never treat it as "the app is usable now". Same for `bootProgress.set(80)` — it is a forward-only milestone; `set()` is monotonic now and silently swallows any regression (a ChatInterface remount re-running `set(80)` after the backend pushed 88/96 is the case that made it monotonic).

2. **ChatInterface now mounts and runs live underneath the overlay for an unbounded time.** The overlay is a fixed sibling, so layout/measurement/rAF/observers all read true values — that part is safe. What is *not* safe is assuming a human is present: entrance animations, typewriters, "first impression" timing, and anything that burns a one-shot effect will run invisibly and be over before the user arrives. Design first-screen work to be idempotent or deferred, not time-of-mount.

3. **The overlay is a modal barrier that owns focus and Escape.** It traps focus (a `focusin` capture guard, not `inert` — BUILTIN Modal portals to `document.body`, outside any sibling subtree) and swallows Escape at window-capture. That is exhaustive *today* only because every global key listener that can be live at boot (`modal.js`, `explorer.js`, `tooltip.js`) handles Escape and nothing else. **If I ever add a focus-independent global hotkey in my lane — a command palette is the plausible one, see [[pupu-plugins-skills-command-system]] — it becomes reachable during the boot window and must be excluded explicitly.**

Related: [[contract-bubble-streaming]] (my other cross-surface contract; untouched by this).
