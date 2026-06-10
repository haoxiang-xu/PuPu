---
name: adr-toolkitid-stability
description: ADR——toolkitId/tool_name 稳定性与迁移：全局稳定·发布即冻结·永不复用·namespace·软删·别名映射·迁移须带回归测试+回滚+staging 演练，单向门 CTO+curator 双签
metadata:
  type: project
---

# ADR：toolkitId / tool_name 稳定性与迁移

状态：**已通过**（2026-06-09 MCP 上线前影响面同步会，11 人达成高度共识）。
单向门，需 **CTO + curator 双签** 方可变更。相关：[[contract-toolkit-catalog-shared-id-space]]、[[contract-install-state-owner]]、[[dev-team-roster-plan]]、[[dev-team-and-prelaunch-review]]、[[meeting-mcp-launch-2026-06-09]]。

## Context（为什么必须现在定）

MCP 上线把 `toolkitId` 从"前端 catalog 的局部键"升级成**横跨多面、且会被持久化的外键**：
- chat_storage（会话级）以 toolkitId 数组持久化用户选中的工具。
- settings 只存 toolkitId 引用 + 用户开关，不冗余元数据。
- **recipe / agent builder 的 toolkit_pool 持久化 toolkitId + enabled_tools[]，无快照无版本**——这是延期功能里唯一的存量强耦合点，也是最脆弱的一环。
- chat-bubble 的确认帧 / trace 帧需要稳定的 toolkitId + tool_name 作为展示与串联依据。
- 模型侧（llm-expert）**不认 toolkitId**，只认 tool_name + JSON schema + description；tool_name 才是模型的引用锚。

一旦这些持久化引用写出去，事后改 ID 就是数据迁移问题，而非代码问题。若不锁定稳定性契约，任何一次"顺手改名/复用 ID"都会让老会话、老 recipe 的引用悬空甚至错绑到别的工具。这是一道**昂贵且难逆的门**，必须在上线前焊死。

## Decision

1. **toolkitId 全局稳定、发布即冻结、永不复用。** 它是纯逻辑标识，不承载展示信息。
2. **Namespace 形态：`mcp.<server>.<slug>`**（反写域名风格 + 稳定 slug，如 `mcp.github.filesystem`），与 transport / 凭据类型解耦。
3. **签发权归 curator（策展人）统一签发**，禁止条目自带 ID。schema 须与 adapter/toolkit 逐字段对齐（transport/command/args/env/credentialType）。
4. **卸载 / 改名走软删，不物理删除、不复用 ID。** 用 `deprecated` / `tombstone` 软标记保留 ID。改名只动 `displayName`，绝不动 ID。
5. **tool_name 用 `{server}__{tool}` 限定名**，server 段绑 toolkitId（而非显示名）。curator 须保证 tool_name **全局唯一、自解释**。重命名走**别名映射**，旧 tool_name 保留映射不失效。
6. **悬空引用一律降级、绝不崩。** recipe / chat_storage / settings 遇到 catalog 里已不存在的 toolkitId：保留引用、静默剔除出"可用集"但不删持久化数据、重装后恢复；UI 侧 inline 标「工具已卸载」/ 节点标红提示重选 / custom_mcp 给可恢复待迁移态。
7. **任何 ID 迁移必须带：migration map（old→new）+ 可回归迁移测试（纳入 CI，老会话/老 recipe 引用不丢）+ 幂等性 + 回滚预案 + staging 真实数据演练。** 无迁移测试不放行。迁移由 recipe 加载侧一次性重写 + 节点 UI 承接 tombstone 降级态。

## Consequences

- **本 release 不必为 ID 迁移改任何代码**——只要 toolkitId 永久稳定、tool_name 作为 key 也稳定，dev-agents/chat-core 的持久化引用即天然安全。这正是它们换取的保证。
- 代价：curator 成为 catalog 的**唯一写 owner + ID 签发单点**，schema 与 ID 改动 CTO-gated；条目不能再自带 ID，导入须过 schema 校验。
- tool_name 限定名让模型引用与 toolkitId 脱钩，重命名不破坏模型已学到的引用（靠别名映射兜底）。
- 单向门：ID 语义/namespace 形态/复用策略一旦上线即定，反悔需 CTO+curator 双签 + 全量迁移演练。**这是有意为之**——它防的是"持久化外键被静默改写导致老数据错绑"这一最难回滚的事故类别。
- 可逆部分（无需双签）：displayName 改名、新增条目、tombstone 标记、UI 降级文案——均不触碰 ID 语义。
