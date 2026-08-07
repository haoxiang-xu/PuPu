# 法典 · Codex

本目录是 PuPu 组织的 **法典库**，归 [`codex`](roles/codex.md) 所有，是其唯一维护入口。

## 来源与版本

宪章正文迁自上游 Quorum 规范：

| 项 | 值 |
|---|---|
| 上游 | `https://github.com/haoxiang-xu/quorum.git` · `docs/quorum/` |
| 迁入版本 | `dee5a4b` (2026-08-07) |
| 本地副本 | 本目录，含 [`adaptations.md`](adaptations.md) 记录的因地制宜修改 |

上游是宪章的规范性来源；本副本是 **本仓的生效版本**。二者出现差异时，以本副本为本仓效力所在，但 `codex` 负有对账义务：上游更新时复核差异，将非本仓适配的改动同步进来，并在 `adaptations.md` 记录。

## 阅读顺序

1. [宪法](constitution.md) —— 最高准则，一切角色规则与流程不得与之抵触
2. [Case Lifecycle 议案生命周期](lifecycle/README.md)
   - [庭审发言协议](lifecycle/speech-protocol.md)
   - [Track 分档](lifecycle/tracks.md)
   - [传唤机制](lifecycle/summons.md)
   - [法定人数 quorum](lifecycle/quorum.md) —— 本仓自有条文，与传唤机制配套
   - [Side Case 分叉](lifecycle/side-cases.md)
3. [Roles 角色定义](roles/README.md) —— 13 份角色规范
4. [Court Records 庭审档案](court-records/README.md) —— 格式、编号、canonical source、模板
5. [Department 部门](department.md)
6. [Archive 数据总库](archive.md)

## 本仓专有条文

- [`adaptations.md`](adaptations.md) —— 因地制宜修改台账，每条载明理由与依据
- [`lifecycle/quorum.md`](lifecycle/quorum.md) —— 法定人数
- [`hybrid-execution-policy.md`](hybrid-execution-policy.md) —— Claude/Codex 混合执行政策（A / B / C / R 四模式与角色分配）
- [`precedents/`](precedents/) —— 判例库

## 角色定义与角色 instance 的区别

本目录存放 **角色定义**（`Code Owner` 这类角色是什么、有什么职责、边界取何种形式）。

具体的 **角色 instance**（`code-owner-chat-core` 拥有哪些路径、它验证过什么方法）存放在 `.claude/agents/<department>/<instance>.md`。

改角色定义 = 改法典，走 `codex` 的法典维护条款。改某个 instance 的边界 = 改该 instance 的 charter，走 case lifecycle 或边界自愈。
