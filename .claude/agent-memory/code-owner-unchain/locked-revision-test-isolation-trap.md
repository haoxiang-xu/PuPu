---
name: locked-revision-test-isolation-trap
description: "SUPERSEDED 2026-08-14 — Historical locked-revision isolation trap; do not use as current policy. Current authority is imported runtime protocol manifest plus single-wheel artifact continuity."
metadata:
  type: feedback
---

> **SUPERSEDED（2026-08-14）：** 这是旧 Git-SHA lock 取证机制的历史陷阱记录，不再是现行兼容或发布流程。当前 runtime admission 只验证实际 import runtime 导出的 protocol manifest；发布证据验证同一个已构建 wheel 的 SHA-256 + manifest digest。下文仅用于事故考古。

要对 **lock 钉的那一版** unchain 出测试证据时，光把该 revision `git worktree add` 出来、然后 `cd` 进去跑 pytest **是错的** —— 跑出来的仍是 sibling dev HEAD 的代码。

**Why:** `/Users/red/Desktop/GITRepo/unchain/.venv` 里装的是 **editable install**：
`site-packages/__editable__.unchain-0.2.0.pth` 内容就一行 `/Users/red/Desktop/GITRepo/unchain/src`。
无论 cwd 在哪，`import unchain` 都会解析到 **sibling 主树**。2026-08-14 案 `M-0000-0001-2026-0814` 里，如果不显式覆盖，整份"locked revision 全绿"的证据会是假的 —— 而这恰恰是 CTX-B06 明令禁止的「拿 sibling dev HEAD 冒充 locked-pair 证据」。

**How to apply:**
- 跑之前先覆盖并 **当场自证**：
  `PYTHONPATH=<worktree>/src <sibling>/.venv/bin/python -c "import unchain; print(unchain.__file__)"`
  输出必须落在 worktree 里，否则一切结果作废。
- PuPu sidecar 侧同理，还要加 `UNCHAIN_SOURCE_PATH=<worktree>`（`unchain_adapter._ensure_unchain_on_path()` 优先读它，否则回退 sibling）。`docs/architecture/memory-v2-claude-handoff-2026-08-07.md` §15.4 给的命令写死了 sibling `src`，**照抄即出假证**，必须改。
- 跑完 `git worktree remove --force` + `git worktree prune`；**绝不 checkout sibling 主树**。
- 出证前后各记一次 sibling `git status --porcelain`：两个主树常被并发进程占用（本次 sibling 在调查中途于 09:04:30 变脏），中途变脏会让"对照组"结果失去清洁性，必须在报告里标注而不是当作干净证据。

相关：[[unchain-evidence-must-cite-lock-revision]] · [[unchain-import-bootstrap-trap]] · [[lazy-import-defers-locked-pair-breakage]]
