---
name: context-memory-v2-boundary-review
description: 2026-08-02 架构边界评审 unchain context/memory v2 迁移 12-task plan;边界大体正确但 curator prompt 画错、workspace 命名债、Task1 fixture 把 PuPu 行为写成 unchain 永久规格;前置条件未满足须硬拦截
metadata:
  type: project
---

对 `docs/superpowers/plans/2026-08-01-unchain-context-memory-v2-core-migration.md` 的边界/归属评审(我出边界视角,CTO 出交付视角)。

**结论:边界方向正确,四处画错。**

- **Curator prompt 画错。** PuPu `memory_v2_curator.py:41` 的 `LOCKED_CORE_PROMPT` 字面以 `You are PuPu's isolated Memory Curator.` 开头。plan 的三条约束互斥:冻结 model-visible bytes + unchain 拥有 prompt + unchain 不得含 PuPu 标识符。让位的必须是"unchain 拥有 prompt"。**Codex 实现已经这么做了**(unchain curator 零 prompt),所以是改 plan 对齐代码,不是改代码对齐 plan。unchain 拥有的是 enforcement(recursion guard / permission set / capability 让 long-term write 物理不可能),不是劝告性文本。
- **两个 workspace = 命名债,不是分层。** unchain 已有 tracked `src/unchain/workspace/pins.py`(真实 host 路径,且已 import `..memory.revision`),plan 再加 `unchain.memory.workspace`(虚拟 POSIX 路径、必须拒绝 host 路径)。plan 自己写了"不要复用 unchain.workspace.pins"这条警告 —— 需要写警告本身就是名字会混淆的证据,且拿错是安全 bug 不是风格问题。改新的那个(旧的是公开 API),窗口只到 C1 被记录为止。
- **Task 1 是最严重的 PuPu 偷渡口(我不同意 Codex 判的 Task 3)。** unchain 里已实际存在 `tests/context_v2/fixtures/pupu_p0/` 和 `compiler_p0/pupu_host_partition.json` —— 路径级违反 exit gate。fixture 只能当迁移兼容测试,不能当 unchain 规范契约。
- **真正的单向门是 canary 5%,不是 Task 10。** 实测 `shadow_write_skipped: admission.is_shadow` → shadow 确实不写。但 `chat_admissions` 是持久 SQLite 表 + live owner_chat_id 唯一索引 → admission 落库即粘住。canary 5% 是第一个写数据的阶段,也是每个 chat 的不可逆点。`read_only_degraded` 阻止挂载 ContextModule = 让已 admit 的 chat 只读,是降级不是救援。

**前置条件未满足,必须在 Task 1 前硬拦截。** PuPu `dev` 209 个 dirty entry、整个 Memory V2 子系统全部 untracked、unchain 侧也只活在未提交 worktree。一个安全叙事全靠"immutable SHA C1"的迁移,两边都没有任何 immutable revision。

**Why:** 边界一旦随 C1 锁死就进入公开契约,改名/改归属从免费变成跨仓破坏性变更。
**How to apply:** 复议这条线时先查 [[unchain-team-ruling]] 和 [[harness-replacement-adjudication]];prompt 归属这条已定案,不要因为 plan 文本又倒回去。
