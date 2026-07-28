---
name: live-gate-first-run-verdict
description: 2026-07-28 付费 6-cell live 门首次真实执行 0/6 的判定：unchain status 契约 bug 使矩阵结构性不可通过；codex 参数风格 vs Sonnet 字节级复现；我的 INCOMPLETE 随版发结论
metadata:
  type: project
---

2026-07-28 付费 live-model 矩阵（candidate PuPu 67f5f9e / unchain 7847da7）首次产出真实数据，0 passed / 6 failed，但 96/98 环境断言全绿。我判定为 **INCOMPLETE 随 0.1.9 发**（非阻断），CEO 委托判定。

失败分解为两类，**没有一类是管道故障**：

1. **`invalid tool result`（Anthropic ×3 实际命中，OpenAI 若活到 step 8 也必命中）= unchain 产品层元数据 bug，与模型无关**。
   根因：`unchain/src/unchain/events/normalizer.py:63-69` `_status_from_tool_result` 用 `error is not None` 判失败，而 `web_fetch`（web_fetch.py:521-540）与 `delegate_to_subagent`（subagents/types.py:206-232 `SubagentResult.to_dict` 恒带 `"error": ""`）成功时也带空串 error → frame status 恒为 "error"。**这些步骤对任何模型都不可能通过 validator（live-long-run-lib.cjs:549-557 要 status==="success"）→ 当前矩阵结构性不可通过**。同类隐患：lsp_runtime.py、shell_runtime.py 也发 `"error": ""`。反向 bug：`spawn_worker_batch`（plugin.py:2078-2089）顶层不带 error key → **全部子 agent 失败也显示 success**。修复点：normalizer 改 truthiness 判断（一处修全）；batch 聚合需补失败传播。修前必跑 gitnexus impact。
   注意：`expected_output` 在 unchain 只注入子 agent system prompt（agent.py:149-150），**从不校验**——delegate 结果无 output 强制。

2. **`arguments differ`（OpenAI gpt-5.3-codex ×3）= 模型参数风格 vs 字节级严判，非产品缺陷（推断，观测参数未留存）**。
   Sonnet-4-6 证明计划可字节级复现（web-anthropic confirmation-2 断言 expected==observed 逐字节通过；三个 cell root 步骤全部合规直到被 harness 判死）。codex 简单参数（soak_probe）字节精确、首个复杂参数步（write/web_fetch/spawn_worker_batch）3/3 偏离。gpt-5.3-codex 官方定位"optimized for agentic coding in Codex or similar environments"（developers.openai.com model 页）。
   诊断缺口：validateObservedRootPlanPrefix 失败信息不含 observed args，且 e2e user-data 目录 teardown 无条件删除（pupu_app.js:508）→ 无法事后取证。**修 harness 先记 observed args 再谈重跑**。

关键结构性事实：`validateObservedRootPlanPrefix` 与 `web_fetch` 只存在于付费 harness（非付费门从未验过 web_fetch 结果帧/该 validator 对真实产品帧）；deterministic 门的 delegate 走 audit 校验不查 frame status —— validator 编码的帧契约只被 fabricated-frame 单测验证过，属契约漂移。

我的标准建议：deterministic 门保字节级；live 门参数改语义等价（marker/path 等 payload 值精确、容忍缺省参数省略）+ 失败信息带 observed/expected diff。重跑付费矩阵需 CEO 授权（预估每 cell 个位数美元，报价前先查当日 pricing）。

相关：[[s0-s1-rich-tool-result-review]]（tool_result 契约前科）、user memory live-paid-matrix-blockers（两阻断已修：8e3a671 凭据、92899f7 venv python、67f5f9e 模型换代）。
