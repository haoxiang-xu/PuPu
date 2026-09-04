---
name: harness-replacement-adjudication
description: 2026-07-28 CEO「换掉 unchain 用开源 harness?」裁决:保内核+建 PuPu-owned runtime contract+provider gateway;LangGraph 覆盖~73%/OpenAI SDK~55%;90% 依赖为深绑定;LangGraph pilot 押后为条件项
metadata:
  type: project
---

# unchain 替换裁决(2026-07-28)

**裁决:不换内核(现在)。立即建两样东西:PuPu-owned runtime contract(结构性终结 kwarg drift)+ 独立 provider gateway(根治新模型滞后)。LangGraph backend pilot 押后为条件触发项,不是现在授权项。**

## 取证事实(全部实测)
- unchain 核心 src/ = 48,655 行(88k 含 tests/examples),近 3 月 153 commits,高度活跃。
- PuPu import 面:29 个模块路径 / 12 子系统 / ~64 符号。但深度才是关键:PuPu 用 `_UnchainAgent` + 8 个 `agent.modules` **组装** agent(框架扩展级绑定);spawn 私有 `jobs._worker`;直接消费 `kernel.types`(ModelTurnResult/RunState);memory 37 处 import + monkey-patch commit/prepare(kwarg drift 病灶,commit 4a9fd9c6)。
- 最宽耦合面:`use_chat_stream.js` 消费 ~35 种事件类型 = unchain kernel 生命周期词汇表直接渲染进 React。
- Codex 加权评定:**90% 语义依赖为深绑定**;LangGraph 覆盖 ~73%,OpenAI Agents SDK ~55%。缺口 27% 恰好是产品差异化:live interject mailbox(LangGraph interrupt 是协作式、不能注入运行中的 step)、本地 jobs/worker、execution leases/fencing、memory prepare/commit 事务、35 事件前端协议、tool receipts/redaction、character profile 策略。

## 顶层 Claude 初判的修正(证伪结果)
- 「durable interaction 无 harness 提供」**部分错**:LangGraph interrupt()/Command(resume)+checkpointer 覆盖 durable clarify/resume;真正独有的只剩 live 非请求式 interject(BTW/FYI 注入运行中 step)。
- 「computer-use 无 harness 提供」**错**:OpenAI SDK 有 ComputerTool。
- 「kwarg drift 证明 unchain 抽象边界烂」**双向成立**:unchain 无 semver 纪律 + PuPu monkey-patch 内部方法,是生产者/消费者共同失败;换 harness 若继续 patch 内部照样复发。修复=接缝所有权归 PuPu,与后端无关。

## 我与 Codex 的分歧(Codex 建议立即授权 21-35 pw LangGraph strangler pilot;我否决)
1. 体量错配:80-140 person-weeks 全路径是按 3 人全职团队定价的;PuPu 是 solo founder + agent fleet,双内核运维成本被低估。
2. 证据顺序:CEO 三痛点中,稳定性→contract(slice 0)、provider lag→gateway(slice 1)就能解决;并行编排痛点**尚无测量证据**。pilot 应在 contract+gateway 落地且测到编排瓶颈后再议——contract 本身就把「以后换」变便宜、变可逆。

## 触发条件(何时重开 pilot)
- contract+gateway 落地后仍出现:测量到的编排吞吐瓶颈;或 unchain 维护负担在 CI 双版本门下仍持续产生 seam 缺陷;或 CEO 决定停止 unchain 开发(bus factor=1 兑现)。

## 单向门标注
- Runtime contract + gateway:**可逆**(纯增量,unchain 成为 contract 后第一个 backend)。
- 删除 unchain backend/快照兼容:**单向门**,不在本决议范围。
- contract 事件 envelope 与 [[listener-node-and-boulders]] 的 flow_event.v1 归一化方向同构,应合并设计,不要造两套信封。

## 沉没成本自检
48k 行已写代码计零权重。保留理由=差异化 27% 的前向重建成本 > 前向收益,且 contract 使未来替换成本大幅下降。若两侧前向成本相等,结论翻转为换(LangGraph 有 semver/LTS/社区维护)——证明结论非沉没成本驱动。
