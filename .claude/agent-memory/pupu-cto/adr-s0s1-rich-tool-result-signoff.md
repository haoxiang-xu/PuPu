---
name: adr-s0s1-rich-tool-result-signoff
description: 2026-07-13 CTO 签核 unchain S0/S1（rich tool result + provider_native_specs）；含合并时序裁决与 sidecar 运行时=主树 checkout 的关键事实
metadata:
  type: project
---

# ADR：unchain S0/S1 双签放行（computer use M2 治理门）

2026-07-13，智（模型可见面）+ CTO（工程/架构面）双签放行 `feat/rich-tool-result`（unchain，基线 dev@7ef372f，SHA b589291/eb21e09/155363a）。

**决定：**
- content_blocks 保留键契约成立：无键路径字节级不变（legacy json.dumps 原样），vocabulary append-only（text/image），未知块 Anthropic 侧静默丢弃（前向兼容）。
- 公共 API 向后兼容守住：`build_tool_result_message`（单数）经 `_ProviderMessageBuilderBase` 代理保留，剩余 4 处单数调用点全部是合成 error-dict / replay 路径，永不携带 content_blocks。Tool 新字段（provider_native_specs/required_betas）默认 {}，构造时 deepcopy 防共享可变态。
- 宿主钩子选型确认：`iter_result_image_blocks`/`redact_result_image_data` 是事件回调内就地改 blocks，零 kernel/loop 接口改动，claim 属实。
- 合并方式：临时 worktree checkout dev + `merge --no-ff`（保留被评审 SHA 155363a 不 squash fixup，merge commit 作双签审计锚，符合仓库 codex 线先例 9ad09a5/0c865dc）。dev 未被任何 worktree 占用，可立即合，不动被 Codex 占用的主树。

**Why:** 合入 dev 对运行时零即时影响——见 [[boundary-pupu-server-vs-unchain]] 的关键补充：**PuPu dev sidecar 通过 UNCHAIN_SOURCE_PATH → sibling 主树 `src/` 上 sys.path，unchain .venv editable 也指主树 src；所以「主树当前 checkout 的分支」= PuPu 实际运行的 unchain 版本**，合并 ref 不动 checkout 就不改运行时。C2 worktree 用 PYTHONPATH 吃 scratch worktree，同样不受影响。

**How to apply:** 以后裁决 unchain 合并时序时，先问「主树 checkout 在哪个分支」而非「dev 有没有新提交」；测试复跑必须 `PYTHONPATH=<worktree>/src`，否则 .venv 会静默吃主树代码（本次实测踩到）。测试收集数因环境可选依赖差异会浮动（856 vs 884），零失败才是签核判据。
