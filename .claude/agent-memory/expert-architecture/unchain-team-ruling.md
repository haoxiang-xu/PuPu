---
name: unchain-team-ruling
description: 2026-07-28 unchain 专属团队三问裁决——三簇 ownership(否决CTO两簇)、我统管双repo架构(90天可逆)、跨仓签核改role-based、Mission 0=正名public API
metadata:
  type: project
---

# unchain 专属团队架构裁决（2026-07-28，应 CTO 组队策划案请求）

**Why:** CEO 指令为 unchain（独立 repo，48.6K 行/23 模块，CEO 单人 07 月 95 commits）组建专属团队；CTO 出策划案→HR 审→CEO 拍板。我按契约给出三项架构裁决，走了标准 Codex 管线（两轮 codex exec -p architect，grounding 见实地 import-graph 复核）。

**关键实地证据（推翻 CTO 初步假设的部分）：**
- kernel/tools/agent/runtime/interaction/memory 是**强连通执行事务体**（kernel/tools 大量 import interaction.durable/effects；memory↔interaction、memory↔kernel 双向）。interaction 在引擎正中间，不是"记忆侧卫星"。
- jobs 是纯叶子：unchain 内部零消费者，唯一消费者是 PuPu sidecar，且 PuPu `main.py` import 私有 `unchain.jobs._worker`（契约渗漏坐实）。
- events/（bridge.py+normalizer.py）承载 events_v4 跨仓契约，内部只有 memory import 它。
- 包根 `__init__.py` 只正式导出 `Agent`；PuPu 实际消费 ~10 个模块面，无任何 stability policy。

## Q1 裁决：三簇，不是两簇（可逆——charter 边界非包拆分）
- **Cluster 1 耐久运行时核心** (~29K)：kernel/tools/agent/runtime/interaction/memory/execution/optimizers/artifacts/retry/schemas/capabilities/workspace/workspace_changes/input
- **Cluster 2 扩展** (~13K)：toolkits/providers/subagents/character（单向依赖核心，无事务状态所有权）
- **Cluster 3 宿主集成** (~5.5K)：jobs/events/render/cli（PuPu-facing 契约面）
- CTO 的 A/B 切法把 interaction/memory 切到 kernel/tools 对面，正好切在最密的双向缝上——否决。
- subagents→Cluster 2（消费者非事务所有者）；jobs→Cluster 3（host-facing 叶子）。
- **最危险缝 = Cluster 1↔3 宿主契约面**（events_v4/Agent facade/memory 暴露面/job lifecycle），行为性兼容非语法性；jobs._worker 渗漏证明已被击穿。内部最繁忙缝 = tools↔toolkits（Tool/Toolkit 契约）。
- 编制映射（我的补判，供 HR）：起步 2 个 dev（core owner + extensions owner），Cluster 3 契约面由 core owner 与 PuPu 适配层 owner（擎）双侧作证、我裁决，不设第三个 dev。

## Q2 裁决：不设 unchain 专属 architect，我统管双 repo（可逆，90 天复评）
- 决定性理由：unchain 最重的架构决策全部表达在 PuPu 边界上（events_v4/Agent facade/memory 语义/durable interaction/jobs 进程），第二个 architect 会把权威缝设在接口风险最高处。
- 我的工作方式扩展（强制）：边界裁决必须基于**双 repo decision packet**——双方 SHA+GitNexus 索引新鲜度、unchain 侧 impact、PuPu 侧 impact、PuPu 消费面直接扫描（含私有 import）、契约测试变更、迁移/回滚、双侧 owner 作证、异议及处置。维护三档接口台账：stable public / adapter-supported / internal（CI 拒新私有 import）。
- 诚实容量条件：我的风险模式是 stale grounding/路由失败而非疲劳。CTO 派发流程必须**自动**把边界提案路由给我，不能靠人记得"这个 unchain-only 改动其实影响 PuPu"。不触及声明边界的内部改动**不需要**我预批——保 CEO 速度（95 commits/月）。
- 复评触发条件（任一即设 subordinate unchain domain architect，不是 peer）：并发架构级 workstream >3 持续两个派发周期；决策队列 >5 或连续两次错过派发周期；出现第二个独立消费 unchain 的产品；一次可归因于 grounding 缺失的跨仓事故；>2 个大型兼容迁移并行；角色从有界裁决膨胀为持续 roadmap 监督。

## Q3 裁决：role-based 规则替换"擎+CTO 双签"（规则可逆；需 CEO 在策划案里批准）
> 跨仓接口改动 = **架构师一个技术决定** + unchain 契约 owner 与 PuPu 适配 owner 的**双侧事实作证** + 任一 owner 可打 model-visible `BLOCKED` veto（必须原文呈给我，未处置前 CTO 不得派发）+ CTO 只做派发/时序/发布运营门（不是技术 co-signer）。CEO 保留显式 override（须记录）。
- 不是三签。擎不再持有对所有 unchain 接口的 person-specific veto，只在自己拥有的面（PuPu 适配层）作证。
- 触发范围：接口台账内符号/import 路径、event/payload/持久化/checkpoint/receipt/job schema、进程/CLI 调用方式、PuPu 可观测的 ordering/error/retry/cancel/replay/resume 语义、跨版本存储格式、当前被 PuPu 消费的私有路径。不触及者不需过门。

## Mission 0：正名 public API 面（新团队第一使命，是）
验收：PuPu 每个 import 记录进台账并分档；生产代码零 `unchain.*._*` import；`jobs._worker` 换成受支持的 worker 入口（迁移期留 shim）；events_v4 有 producer/consumer golden contract tests；Agent/durable interaction/memory-checkpoint/job lifecycle 有双边兼容测试；CI 拦新私有 import；有 deprecation/versioning policy。
- 阶段一（盘点/分档/shim/测试）= **可逆**；阶段二（对独立第三方宣布 stable surface）= **单向门**，需单独架构决定。只围绕真实宿主契约收窄，不把现有 10 个消费面追认成 general public API。

相关：[[onboarding-contract]] [[hybrid-codex-policy]]。unchain GitNexus 索引当日为 07-16 旧于 HEAD，本裁决基于实时 grep，不受影响；后续 impact 前须重建索引。
