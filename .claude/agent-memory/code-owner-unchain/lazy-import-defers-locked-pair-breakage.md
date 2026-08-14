---
name: lazy-import-defers-locked-pair-breakage
description: PuPu sidecar imports unchain symbols lazily inside functions, so a PuPu commit depending on unreleased unchain symbols still boots clean against the locked revision and only explodes mid-chat - never treat successful boot as locked-pair compatibility evidence
metadata:
  type: project
---

**PuPu 侧「能 import / 能起服务」不构成 locked-pair 兼容证据。** `unchain_adapter.py` 对 `production_run_ownership` 是 **函数体内的懒 import**（本次观察到两处：约 `unchain_adapter.py:9066` 图路径、`:10669` 普通流式路径），所以一个依赖了 **lock 里还没有的 unchain 符号** 的 PuPu commit，`import unchain_adapter` / `import routes` 全部 OK，**只有真正跑到那条路径才炸**。

**Why:** 2026-08-14 案 `M-0000-0001-2026-0814` 实测：PuPu HEAD `93720ab1`（RunBundleLedger）配 committed lock `d0572979`，
`import unchain_adapter` → OK、`import routes` → OK，
但 `import production_run_ownership` → `ImportError: cannot import name 'official_provider_transport_target_sha256'`。
该符号只存在于 `38547bc`。同类还有 `persist_bundle`（`d0572979` 完全没有，`38547bc` 才有）。
即：**冒烟启动全绿，聊天路径必挂**。这正是 CTX-B06 要 fail closed 的形态，而 boot 冒烟对它完全失明。

**How to apply:**
- 判 locked-pair 兼容性时，**不要**用 `import unchain_adapter` 当判据。要么直接 import 所有懒加载模块（至少 `production_run_ownership`、`memory_v2_unchain_runtime_factory`），要么跑真实执行路径。
- 反向检查更快：拿 PuPu 侧新增/改动的 `from unchain...` import 清单，逐个 `git grep <symbol> <locked_rev> -- src` 验在不在 lock 那一版里。缺一个就是 NO-GO。
- PuPu HEAD 往前走却没同步 bump lock，是这类断裂的固定成因；`unchain-core.lock.json` 的 **未提交** 改动尤其危险（HEAD 与工作树各说一套，候选不成其为候选）。

相关：[[locked-revision-test-isolation-trap]] · [[unchain-evidence-must-cite-lock-revision]]
