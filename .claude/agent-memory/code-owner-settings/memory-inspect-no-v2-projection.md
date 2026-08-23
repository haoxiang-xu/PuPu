---
name: memory-inspect-no-v2-projection
description: Memory Inspector must never get a V2 scatter/projection — adjudicated twice; V2 uses a path tree instead, and the settings mount is deliberately excluded pending G9
metadata:
  type: project
---

**Memory V2 must never get a scatter/projection view in the Inspector.** Adjudicated in `0000-0003-2026-0807` and again in `0000-0008-2026-0808`. Implemented as a **tree view** instead (Fast Track `0000-0010-2026-0810`, worktree commit `5add015f` on `worktree-memory-v2-tree-view`, unpushed as of 2026-08-10).

**Why:** V2 retrieval is purely **lexical (FTS5)**. Any embedding computed to place points on a 2-D chart would have **zero causal relationship to what actually gets recalled** — it would look like an explanation of retrieval while explaining nothing. V2 already has a better self-view: the author-written `path` hierarchy is ground truth the store holds natively. The V1 vector scatter stays because V1 retrieval genuinely is embedding-based.

**How to apply:** if anyone proposes "unify the two views", "add a projection endpoint for V2", or "make the tree a graph", that is a re-litigation of a closed question — cite the two cases rather than re-arguing. Adding a `points`/`variance` shape to any V2 route is the tell.

**Two mount points, asymmetric on purpose.** `MemoryInspectModal` is mounted from `side-menu/side_menu.js` (`mode="session"`, passes `ownerChatId`) and from `settings/memory/index.js` (`mode="long_term"`, passes only `open`/`onClose`). The tree view is offered **only** at the session mount. The settings mount is gap **G9** of `0000-0008` — still undecided, deliberately out of scope, not an oversight. Two independent guards keep it that way (the switch is not rendered without an `ownerChatId`, and the loader independently returns `disabled(no_owner)` without touching the bridge); if you touch either, keep both.

**Backend gap worth remembering:** `get_tree` cannot distinguish "V2 off" from "owner never existed" — both are an absence, and it is not fixable from the renderer. The renderer works around it by **ordering**: `getStatus()` settles enabled-ness before `listSpaces`/`getTree` are called at all, so a later absence provably means "enabled and empty". Do not reorder those probes to save a round trip. See [[settings-schema-cto-gated]].
