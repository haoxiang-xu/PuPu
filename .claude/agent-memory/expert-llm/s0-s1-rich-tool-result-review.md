---
name: s0-s1-rich-tool-result-review
description: 2026-07-13 unchain S0/S1 模型可见面评审 — 有条件同意；budget 毁截图是 veto 条件；OpenAI 官方已支持 image-in-function_call_output（裁决 M3 走 in-band 数组）；两个决策点裁决记录
metadata:
  type: project
---

2026-07-13 对 unchain `feat/rich-tool-result`（S0 content_blocks + S1 provider_native_specs/required_betas，基线 dev@7ef372f）的模型可见面评审。**verdict：有条件同意 → 155363a 修复全部四条后复核通过，放行合入 dev**（budget 修法比我的最小改法更优：只对 text 记账、image 块经 `rich_preserved_blocks` 原样保留重建；顺带修了任何块数组压缩成裸 dict 的潜在 400。全量测试 883 passed/1 skipped 零回归）。

**Why:** computer use M2 前置；我持模型可见行为 veto。

**How to apply:** dev 修完条件项后复核只看条件项；M3 OpenAI 放开时按下面 DP1 裁决实施。

## 合入条件（当时列给 dev 的；155363a 已全部修复并复核）
1. **[blocking] result_budget 毁截图**：`budget_messages` 在 coalesce 前作用于当轮 result_messages（execution.py:624）；块数组 content 被 `_normalize_payload` 当 native payload，base64 超 4000 chars 必触发 compaction → content 被换成 `{"compacted":...}` 纯 dict（对 Anthropic 是非法 payload，400）。修法：`_collect_result_records` 跳过含 image block 的 list content（或只 budget 文本部分），加 >4000 chars base64 回归测试。
2. **[blocking] MCP text+image 丢文本**：`mcp.py` 只把 image 收进 content_blocks，text 留在 `parsed["result"]` 业务字段 → blocks-only 契约下模型只见图。修法：有 image 时把 text block 也按序收进 content_blocks。
3. [minor] anthropic.py `extra_headers["anthropic-beta"]` 直接覆盖 payload 里已有值 → 应 merge+dedupe。
4. [minor] OpenAI 占位文案 `[image: ...]` 改成与 Ollama 一致的 `[image omitted: ...]`（防模型假装看到了图）。

## 两个决策点的裁决
- **DP1 OpenAI image 回流**：任务前提已过时——OpenAI 官方 function calling 指南明确 "For functions that return images or files, you can pass an array of image or file objects instead of a string"；形态 `output: [{"type":"input_image","image_url":"data:image/png;base64,...","detail":...}]`（社区帖确认，API reference 页过大未直接核）。裁决：M2 维持占位；**M3 走 in-band 数组输出**（改 OpenAIMessageBuilder），不用"独立 user message"方案；实施前需核 API reference 确认 output 数组能否混 text part + 建小 eval（社区有 base64 被当字符串的报告）+ budget 同步支持数组形态。
- **DP2 业务字段 vs blocks**：维持架构契约——blocks 存在时只有 blocks 进模型视图，builder 层**不做**业务字段文本前缀合并（防双重渲染、保单一事实源）。义务：MCP adapter 自己要守约（条件 2）；工具作者约定写进文档："content_blocks 存在时模型只见 blocks；要给模型看的摘要放 text block，text 在前 image 在后"。

## 核过的一手事实（易变，用时重查）
- Anthropic computer use（platform.claude.com 文档，2026-07-13 取）：tool 定义 `{"type":"computer_20251124","name":"computer","display_width_px","display_height_px","display_number"}`；beta header `computer-use-2025-11-24`（Sonnet 5/Opus 4.8/4.7/4.6/Sonnet 4.6/Opus 4.5），旧模型（Sonnet 4.5/Haiku 4.5/Opus 4.1）用 `computer-use-2025-01-24`；截图回流 = tool_result content 数组内 `{"type":"image","source":{"type":"base64","media_type","data"}}`；文档建议保留最近 3 张截图、每 ~25 轮批量剪枝（cache 友好）。
- Gemini：REST `FunctionResponse` 已有原生 `parts` 字段（FunctionResponsePart+inlineData，Gemini 3 多模态 function response）；S0 的 sibling inline_data part 是老 workaround、可用但非正道 → Gemini 3 时代应迁 FunctionResponse.parts。
- S1 replay/exposure 均验证不丢 native spec：manifest 用 `schema.get("name")` 兜底无 function 键的 spec；beta header 每次 fetch_turn 从 toolkit 现算、不入 frame。
- PuPu 侧 M2 义务（非 unchain 代码）：模型 gating（computer_20251124 别发给不支持的模型）；computer tool 必须 always_load=True（否则 exposure 可能 defer 掉手）。
