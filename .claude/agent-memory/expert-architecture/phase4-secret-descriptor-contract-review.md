---
name: phase4-secret-descriptor-contract-review
description: Phase 4 __pupu_secret_injection 描述符契约审查——REVISE(单描述符无法承载双secret);四条renderer secret注入路径;冻结形状=单向门
metadata:
  type: project
---

# Phase 4 `__pupu_secret_injection` 描述符契约审查（2026-07-25）

CEO 指定的冻结前检查点。裁决 **REVISE**（契约主干健全但不能按现形状冻结）。

**核心发现（load-bearing invariant）：renderer 侧读 secret 值的注入路径有 4 条，不是 3 条。** 契约/ADR 只枚举了 3 条：
- `api.unchain.js:149` `injectProviderApiKeyIntoPayload`（model key）
- `api.unchain.js:608` `injectCustomProviderIntoPayload`（custom key）
- `api.unchain.js:672` `mergeCustomProvidersIntoCatalog`（目录门控）
漏了第 4 条 **`api.unchain.js:279` `injectOpenAIEmbeddingKeyIfNeeded`**（openai embedding key），它在 `injectMemoryIntoPayload`(L358)→`normalizeUnchainV2Payload`(L703) 链上，V2/V4/replaceSessionMemory 全量走，热路径活代码。

**为什么阻断：** embedding 注入**独立于 chat model**。`model=anthropic + memory开 + embedding=openai` 在同一 payload 里同时要 anthropic model key + openai embedding key。冻结契约的单对象 `{kind,id}` 物理上无法表达两个同时注入。修正=改成带 `channel`("model"|"embedding") 的**列表**，main 按 `(id,channel)` 查固定字段集表。

**Why:** 冻结描述符形状是单向门（双端上线后改需双端+回归+守/llm会签）；单→列表事后改是最贵的那类变更，检查点全部价值即在此。
**How to apply:** 未来任何动 provider secret 注入的工作，先确认 4 条路径全覆盖；embedding key 与 model key 可同 payload 并存是承重约束，别退回单描述符假设。

**另两条必须补进契约文本（否则"唯一双端真源"名不副实）：**
- B2：`replaceMisoSessionMemory`(main L2202) 原样转发 options 给 Flask，须跑同一 strip+inject（否则描述符泄漏+记忆再抽取keyless）。不变量="任何转发 renderer-normalized options 的 main 出站路径都须先 strip+inject"。
- B3：`testMisoCustomProvider`(main L1400) 走顶层 api_key，源是编辑器**用户当前输入值**(custom_provider_editor.js:511 传 `secret` 本地 state)非存量读回→可明确排除契约外；但须写明 scope，且盯 caveat："编辑已存在 provider 若预填存量 secret 进 state 则须重评纳入"。

**byte-equivalence 陷阱（S6 会命中）：** openai 字段数依赖 memory 状态跨路径 interplay——`model=openai/无memory`=4字段(openaiApiKey,openai_api_key,apiKey,api_key)；`model=openai/openai embedding`=embedding先注2字段→`hasAnyApiKey`短路命中→只2字段。契约让 main 无条件写4字段会字节发散。且 `hasAnyApiKey` 短路今日按**值是否在options**判断，描述符模式值不落options→短路失效→须重表述为"该(id,channel)是否已在list中"。

**非阻断追踪项 N1：** `configuredCredentials` 是 boot 快照（settings_storage_bridge.js:160-163 有意语义，新key下次启动才authoritative）。N期(dual-keep)自洽（legacy-OR兜底）；N+1删legacy后"会话内新增key立即用"会回归(快照stale+无legacy fallback)。**硬前置挂 N+1 单向门：删legacy前 configuredCredentials 必须改成 live-refresh。**

**已复核健全：** id词汇表对齐干净(configuredCredentials=owner_id列表，≡描述符id，custom.前缀命名空间不相交)；三态回退N期正确(authoritative=available AND configured.includes；configured=SQL OR legacyHasSecret)；fail-closed读稳固(readDecryptedProviderSecret永不throw返null)；剥除单字段成功/失败都剥。

**v2 复核（2026-07-25，冻结签字轮）：** controller 按处方改 v2（单对象→带 channel 列表）。逐项核对：B1 形状/§2 (id,channel)→固定字段集表/第4条纳入、B2 strip+inject 不变量明列两处出站路、B3 out-of-scope+预填 caveat、N1 挂 N+1 单向门——**全部闭合**。**唯一残留（narrow REVISE）：§3 短路 dedup key 表述有误。** 我原报告的措辞"该 (id,channel) 是否已在 list 中"被 v2 忠实照抄，但它与自己的 worked example("list 内是否已有 openai 条目")矛盾，字面读会破坏 byte-equivalence——

**load-bearing invariant（dedup key，勿再relitigate）：短路是按 provider `id` 去重、不看 channel。** 注入顺序固定(embedding 在 injectMemoryIntoPayload 内先入、model 后到)；`model=openai + embedding=openai` 时 embedding 先 append `{openai,embedding}`，model 路见 **openai 已在 list**→**整条跳过（不追加、不合并字段集）**→最终 `[{openai,embedding}]`→main 写 2 字段=今日 hasAnyApiKey 命中即整段短路的 byte-equiv 行为。若误按 (id,channel) 对去重→model 见 `{openai,model}` 不在 list→追加→并 4 字段→**破坏 byte-equiv（S6 会红）**。**"first-id-wins / 后到同 id 整条跳过"** 是承重规则。（唯一同 id 双 channel 情形只有 openai model+embedding；anthropic/custom 只有 model 通道。）
**处置：** REVISE 但已**预授权**——§3 line 52 headline + line 64 "list 查重" 两处改成"同 provider id 已在 list 即整条跳过（不看 channel）"后即冻结，无需再过我。S4/S5 可对修正后的 §3 立即并行、不被 re-review 阻塞。

相关：[[license-agpl-switch-review]] 同为守/CTO 会签门模式；证据锚点 phase4-cto-adr.md / phase4-security-decision.md / phase4-descriptor-contract.md（均在本会话 scratchpad）。
