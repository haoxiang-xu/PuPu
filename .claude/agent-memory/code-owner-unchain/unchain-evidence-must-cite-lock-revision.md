---
name: unchain-evidence-must-cite-lock-revision
description: "SUPERSEDED 2026-08-14 — Historical Git-SHA lock evidence policy; do not use. Current authority is imported runtime protocol manifest plus single-wheel artifact continuity."
metadata:
  type: feedback
---

> **SUPERSEDED（2026-08-14）：** 这是旧 Git-SHA lock 证据政策的历史记录，不再是现行规则。Git revision/source 只能作为遥测；runtime compatibility 只认实际 import runtime 的 protocol manifest，release continuity 只认同一个 wheel 的 SHA-256 + manifest digest。下文保留用于考古。

给 PuPu 的庭审出 unchain 侧证据时，**必须同时核对 `pupu:unchain_runtime/unchain-core.lock.json` 记录的 revision**，不能只读 `/Users/red/Desktop/GITRepo/unchain` 的本地工作树；发言里要写明读的是哪一份。

**Why:** 2026-08-07 case `0000-0003-2026-0807`，`code-owner-runtime` 就 unchain 的一个类型作了事实主张，自己标注「读的是本地工作树、不是 lock 记的 revision，须 code-owner-unchain 复核」，本庭因此专门把我传唤回去补这半边。当天两者恰好相等（lock 与 unchain `dev` HEAD 同为 `a4e69f41...`，工作树干净），**但这是巧合，不是机制** —— PuPu 装的是 lock 钉的那一版，unchain `dev` 会继续往前走，任何一侧推进都会打破它。我 charter 里「本地领先 GitHub main，以本地工作树为准」这条讲的是 **相对 GitHub main 的考古**，不能拿来当「相对 lock 也以工作树为准」。

**How to apply:** 出证前跑 `git -C <unchain> rev-parse HEAD`、`git -C <unchain> status --porcelain`，与 lock 的 `revision` 三方对照。不一致就用 **只读** 手法取 lock 那一版：`git show <rev>:<path>`、`git diff <rev> -- <path>`。**绝不 checkout、绝不切分支** —— 两个主树都常被并发进程占用（见 PuPu 侧 `concurrent-worktree-hazard` 记忆）。取不到就按「未核实」交，不推测。

**上面那层「至今没人核过」的已于 2026-08-08 核实并闭合** —— 结论见 [[unchain-import-bootstrap-trap]]：运行时确实解析到本机 checkout，且那条记忆同时给出了 **在庭审 harness 里实跑 unchain 分支的唯一正确方法**。凡要对 `store_owner=unchain` 出证，先读它。

相关：[[unchain-crossrepo-impact-duty]] · [[unchain-import-bootstrap-trap]]
