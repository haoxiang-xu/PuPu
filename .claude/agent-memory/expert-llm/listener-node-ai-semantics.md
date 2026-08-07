---
name: listener-node-ai-semantics
description: 收口阶段定的 listener node AI 语义:统一事件 envelope + cheap-gate 位置 + 各 listener 对记忆/打扰的不同要求
metadata:
  type: project
---

2026-06-20 CEO 愿景会收口,定向"让 USER 也能 build 伪常驻 agent = 多类型 listener node"。我从 AI/trigger 语义给的设计。关联 [[a2a-channel-direction]]、[[ref-proactivity-calibration]]、[[ref-durable-execution-c2]]、[[memory-governance-hooks]]。

**统一事件 envelope:** 所有 listener(on-user-message / on-file-change / on-email / on-schedule / on-webhook)喂进流程的事件归一成 `{source, payload, timestamp, salience_hint}`。

**cheap-gate 位置决策:挂在 listener 之后、流程之内,不在 listener 之内。**
- Why: listener 只负责"有事发生";"值不值得唤醒/打扰"是流程的判定器,这样三场景(甲隔夜调研/乙盯梢代办/丙跨周追踪)共用一个判定器,不在每个 listener 里重写逻辑。
- 级联三层(FrugalGPT/RouteLLM 思路,降本数字需复核):L1 零成本规则闸(无新事件 return)→ L2 小模型粗筛(高召回低精度)→ L3 大模型期望效用判定(Horvitz: E[帮助]>E[中断] 才打扰)。

**各 listener 的差异(How to apply):**
- 记忆要求: on-file-change/on-schedule 高频低信息→强 dedup 否则污染长期库;on-email/on-webhook 信息密度高→该进 episodes。
- 打扰门槛: on-user-message 用户在场→门槛低;on-schedule/on-webhook 用户不在场→门槛顶高。
- 工具副作用: replay 时副作用工具(发邮件/写文件)结果记 journal、跳过重执行;tool schema 标 `side_effect:true/false`(与 mcp-store-curator 交界)。验证:崩溃重启后副作用工具真实执行次数 exactly 1。

**我的红线(会上要 CEO 裁):打扰判定器(石头C)过影子模式~50任务、disrupted率达标(提议≤5%)前不接真打扰。** 证据 PROBE 端到端40% / 离线AUROC0.94上线-26pp。与架构师/CTO 可能分歧两点:记忆先读侧vs早动wheel;判定器要不要早上线。
