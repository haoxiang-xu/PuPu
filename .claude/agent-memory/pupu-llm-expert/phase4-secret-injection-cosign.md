---
name: phase4-secret-injection-cosign
description: 2026-07-25 我 CO-SIGN Phase 4 provider-secret 注入迁移(renderer→main)的字节等价;口径=字段集+值 key-order 无关;保留值短路是模型可见行为的必需项
metadata:
  type: project
---

Phase 4 把 provider secret 注入从 renderer 移到主进程；我（LLM 专家，持"模型可见行为不得变"veto）**CO-SIGN 放行**。

**Why:** CTO ADR 规定 S6 字节等价须由我会签才放行；我的口径 = Flask 收到的 `body.options` 中 provider/模型可见的字段名/字段集/值逐条等价，**JSON key 排列顺序不作差异**（provider SDK 与 Flask 按字段名读，不按位置）。字面 string compare 物理不可能（描述符注入字段落 options 末尾、双 secret 源自单 list）。

**How to apply:**
- 迁移后 renderer 只发**非敏感描述符列表** `options.__pupu_secret_injection=[{kind,id,channel}]`；main 在 POST 前按固定 (id,channel)→字段集表解密注入并**剥除描述符**。单一注入决策源=renderer，main 哑执行。
- **非常关键的裁定（我 lane 内直接下结论）**：renderer 保留了今日基于值的 `hasAnyApiKey` 值短路（与新增的 list 同 id 查重并存，非替换）。这是**正确且必需**的——值短路捕获 caller-explicit key，list 查重捕获 embedding→model 塌缩。若删掉值短路，"稳态+调用方显式 key"会被 main 用 SQL 密钥**覆盖调用方显式 key**，**这会改变模型可见行为**。任何未来"简化"此处、想删值短路的改动，我必须 VETO。
- 固定字段集表（main `resolveProviderSecretFieldNames` = 今日 renderer legacy fallback 逐字）：`(openai,model)`=4字段(openaiApiKey/openai_api_key/apiKey/api_key)、`(openai,embedding)`=2字段、`(anthropic,model)`=2字段、`(custom_provider,custom.*,model)`=custom_provider_api_key/customProviderApiKey 专用双通道**绝不 api_key**。
- 两条出站 seam（都必须跑 strip+inject helper）：`startMisoStream`(V1/V2/V4 单 choke) + `replaceMisoSessionMemory`。renderer 仅 4 处 inject 函数发描述符，只映射到这两 seam；无第三泄漏路。
- 记忆检索参数（embedding model/top_k/min_score）不被 secret 改动触碰，RAG 侧无变。

**放行后非阻断项（交 controller）**：① 建议一轮真机稳态冒烟（真 safeStorage，四组合各发一条，确认 Flask body 字段集同今日）——两跳 join 未跨进程端到端；② 两 characterization 文件靠逐字常量同步闭合，建议抽共享 fixture 消除人肉同步风险；③ 描述符形状=单向门，未来新增 channel 需双端同步 + 重跑本会签（main 对未知 channel 已 fail-closed）。

契约见 [[finality-ownership-contract]] 同类签字模式；工具进模型链路见 [[tool-injection-path]]。会签文档：scratchpad/phase4-llm-cosign.md。
