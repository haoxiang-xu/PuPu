---
name: memory-v2-adapter-consult-position
description: 2026-08-04 Memory V2 三方会诊我的立场:两段式保留但须双供给、propose 触发指导是 flag-on 硬条件(条件性 veto)、curator 无能力下限风险、主 agent 默认 Enabled/长期记忆用户确认
metadata:
  type: project
---

2026-08-04 CEO 召集 architect/cto/我 三方会诊 Memory V2(Memory Adapter 改名 + 三拆 + codex 解耦提案)。我的立场书核心裁决(证据 file:line 见当日会诊输出):

1. **两段式(propose→curator)保留,但必须双供给。** 结构性事实:candidate 只能来自模型在运行中调 memory_propose(toolkit.py memory_propose 是 CandidateProposalRequest 唯一构造点;coordinator.py `no_pending_candidates` 直接跳过 job),无 transcript 自动抽取,无任何 prompt/描述触发指导 → 覆盖率结构性趋零。修法:consolidation job 已冻结 source_refs(≤20k context_event),让 Curator 获得"从 journal 源提出补充 candidate"能力,写边界不变。业界无人发 propose-only 无兜底抽取的产品(ChatGPT=工具+后台抽取双轨,Claude.ai=后台生成)。

2. **条件性 VETO(工具面):** memory_propose 描述只讲机制不讲何时用(contracts.py:31-34),且 system prompt 全程无 memory 指导(grep 证实)。当代模型对记忆类工具保守触发,provider 文档明确"prescriptive when-to-call 描述有可测提升"。**flag-on 前置硬条件:propose 触发条件写入 dialect 描述(with_overrides 机制已支持,改动便宜)。** 其余工具面(snake_case 命名/CAS/candidate-bound/hidden_result_fields/contract_id 版本化)质量高,不否决。flag: memory_promote 动词与"仅创建 proposal"行为不符,result 需显式 status。

3. **Curator 无能力下限:** select_curator_model(memory_v2_curator.py:219)fallback 链最终落到 chat model——可能是本地小模型,扛不住 CAS/分页/严格 ref 的工具契约,后台静默烧 lease。建议默认 per-provider 小型 frontier 模型(Anthropic=claude-haiku-4-5,$1/$5,skill 2026-06-24 验证;质量敏感升 sonnet 档),加 job 失败率遥测。触发时机:PuPu 里 root completion=每 assistant turn(非会话末),粒度没问题;真问题是 cancelled/failed 不 enqueue(curator/models.py:633-635)且 PuPu 用户常按 Stop → candidate 搁浅,需 lazy sweep 政策。

4. **默认体验:** 主 agent 默认 Enabled、subagent 默认 Inherit、长期 promotion 保持用户确认(现设计已如此),配可见指示+一键查删。Enabled 但不可用 fail closed 我背书。未知新协作关系:第二轮我被 architect 的单向门论证说服,从"只读继承"改为**出厂 fail-closed**(放宽向后兼容、收紧破坏行为;只读继承留作日后放宽目标)。

5. **战略校验:** 架构重治理轻质量。moat 活在三件还不存在的工件里:propose 触发 spec、curator prompt/策略 spec(去重/冲突/衰减)、recall 排序 spec(现状:首消息 reference-only ≤5 refs,MAX_RECALLED_LONG_TERM_REFS)。flag-on 门:30-50 场景跨会话 E2E eval(coverage/consolidation faithfulness/recall@5/答案增益盲评)+ 二阶注入红队(chat→candidate→curator 链,candidate 内容攻击者可控)+ per-job 成本遥测。关联 [[memory-governance-hooks]] 的 eval 框架、[[context-memory-v2-durability-core-approval]]。

**Why:** 公司押注"记忆质量"为最深护城河(pupu-strategy-synthesis),而当前实现把全部投资放在写入安全管线,质量决定环节(供给/整理/召回)接近零投资;不设门就开 flag 会得到一个"安全地记不住东西"的系统。

**How to apply:** codex 后续交付 Memory Adapter 重构时,按上面 5 条验收;我的 veto 只挂在"propose 触发指导缺失"一条上,其余为强建议。行号会漂,以语义为准。

**第二轮交叉质询补充(同日):** (a) events_v4 词表(unchain events/types.py)是 frozen Literal 严格校验,有 run.completed/run.failed **无 run.cancelled** → curator 事件化触发天然表达不了 cancel 搁浅,清扫必须走事件之外的 lazy sweep(或在 spec 冻结窗口加词);(b) architect 砍 capability 字符串语言我接受,但换成约束:per-(relation,mode)→工具名集合必须有冻结 fixture 测试(模型可见面,表示法无关);(c) CTO 切片 S0-S4 零质量规格工作,我要求 flag-on 门 = 三方清单并集,propose dialect 指导(小时级)搭 S1/S3 车;(d) "Curator 从 journal 补提 candidate"双供给案两方均未接,已升 CEO 拍板。
