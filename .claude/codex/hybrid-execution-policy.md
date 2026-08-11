# 混合执行政策 Hybrid Claude/Codex Execution Policy

> 法典条文（程序性）。[法典索引](README.md) · 收录理由与本仓适配见 [`adaptations.md` A-007](adaptations.md#a-007--混合执行政策收入法典)。
>
> **状态**：试点期。2026-06-19 立，2026-08-07 随组织改制重写角色分配表，2026-08-10 与最小主 owner / 串行 handoff 程序对齐。

"用 Codex" 不是一件事，是 **四种风险截然不同的模式**。按角色刻意选模式，不要揉成一团。

本政策约束的是 **谁可以把执行委派给谁、委派后谁对结果负责、报告必须披露什么**。它不改变任何裁定权 —— 依[宪法第一条](constitution.md)，一切裁决权归 `chief-judge`；委派执行不委派问责。

## 四种模式

- **Mode A · Codex 只读参谋，Claude 执行。**
  Codex（只读 profile）做异构推理或代码级追踪；Claude 应用改动并守住本仓约定。价值：跨模型交叉检验 + 深度推理。**风险 LOW**。

- **Mode C · Codex 跑测试、写测试。**
  测试自带通过/失败，Codex 没什么偷工的余地。测试策略与 `.js`/`.cjs` 对等仍归本仓角色。**风险 MEDIUM**。

- **Mode R · Codex 自主只读调查，产出是报告。**
  Codex 自己读代码、追流程、把 OSS 仓库 clone 进 scratch、跑只读命令，返回一份证伪驱动的报告。**任何 repo of record 都不落代码**。因为不写入任何真实仓库，即便 Codex 是自主的，风险仍 LOW。价值：一个零共享先验的异构调查者。**风险 LOW**。
  → 本仓以 [`ai-investigation` skill](../skills/ai-investigation/SKILL.md) 承载，**任何角色都可调用**，不再是某一个 agent 的专属。

- **Mode B · Codex 主写功能代码。**
  Codex 用 workspace-write profile 直接编辑。在体量大、约定约束少的代码上价值最高，风险也最高。**四条护栏强制，缺一不可**：
  1. 本仓约定经 repo 根 `AGENTS.md` 喂入（JS-only、内联样式、IPC 边界、渲染进程不碰 `ipcRenderer`、localStorage 只走 SERVICEs helper、`.js`/`.cjs` 测试对等）
  2. 代码情报证据（impact / context）喂进 Codex 的 prompt
  3. **落地前由 Claude 审 Codex 的 diff** —— 少了这条，你只是换了个执行者，交叉检验没了
  4. 改到模型可见行为 → 该任务立即失去 Mode B 资格，退回 Claude 主写；只有当前主 owner 已记录一个会改变方案的真实模型专业缺口时，才可为 `expert-llm` 提交一次最小范围、有限期限与单一交付的 `RP-###`。获 `Chief Judge` 批准后才出鉴定；不得据此预建候选名单或扩大合作 owner 集合

## 角色分配（2026-08-07 改制后）

| 角色 | 模式 | 谁写码 | 谁对结果负责 |
|---|---|---|---|
| `expert-architecture` | **none** | 不写码 | 自己。**2026-08-07 CEO 撤销 2026-07-13 的 Fable 5 强制**：不再写死模型，派遣方在派遣时选当时可用最强模型；**仍不走 `codex exec -p architect` 转手**，架构推理留在被派遣的模型本体内；证据采集照常 |
| `expert-security` | A | 不写码（出鉴定与整改契约） | 自己持有 severity 定级 |
| `expert-llm` | A | 不写码 | 自己；模型事实一律查当前文档，不用 Codex 的记忆。**2026-08-08 CEO 撤销 Fable 5 强制**（扩自 `expert-architecture` 先例，起因 `0000-0008-2026-0808` quorum 卡点）：不再写死模型，派遣方选当时可用最强模型 |
| `expert-qa` | C | Codex 写测试 | `expert-qa` 定策略，Claude 审 |
| `expert-ux` · `expert-business` | none | 不写码 | 自己 |
| `code-owner-runtime` | **B（唯一试点）** | Codex 主写 | 该 owner 审 diff；模型可见行为使任务退出 Mode B。仅当它作为主 owner 记录真实专业缺口后，才可请求 `expert-llm` 的有限 RP |
| `code-owner-chat-core` | A（仅设计与追踪） | Claude | **永不 Mode B** —— `use_chat_stream.js` 是承重件 |
| `code-owner-electron` | A（仅追踪） | Claude | **永不 Mode B** —— IPC / preload channel 对等 |
| `code-owner-unchain` | none | Claude | 跨仓核心库，Mode B 初期明确排除 |
| 其余 code owner<br>（`chat-bubble` `settings` `toolkit` `agents` `ui-primitives` `shared-arteries` `devtools`） | none | Claude | — |
| `knowledge-owner-*` · `task-owner-*` | none | 不写码 | — |
| `dimension-owner-*` | none | 不写码 | 尺子必须是自己的，委派测量等于没测 |
| `court/` 五角色 | none | 不写码 | 程序与合法性判断不可委派 |

**任何角色都可以调 `ai-investigation`（Mode R）** —— 它不写码，不落任何真实仓库，与上表的模式分配正交。

## 专业缺口与有限 RP

混合执行模式本身不构成传唤理由。新方案仍只从一个主 owner 开始；不能因为某项工作“可能涉及”LLM、安全、QA 或架构，就预先列 Expert 候选、建立 roster 或批量申请 RP。

只有主 owner 在完成自己边界内的方案后发现一个 **真实且会改变当前方案或验收结论的专业缺口**，才可请求持续专业参与。请求必须一次只覆盖解决该缺口所需的最小角色，并写明：

1. 具体缺口及其指向的当前 `PS-###` 块；
2. 现有 owner 为什么不能在自身边界内回答；
3. 不回答会改变的方案选择、风险处置或 `AC-###`；
4. 请求 Expert 的最小读取范围、单一交付、截止点与退出条件。

该请求使用 `RP-###`，只在 `Chief Judge` 逐项批准后生效。获批 Expert 只取得该缺口的有限专业权限，不成为合作 owner、不进入 `RS-###` 的 `N` 或 Full（众议庭）程序投票，也不得自行再召集其他角色。若一个 owner handoff 足以补全边界外方案块，应使用串行 `HS-###`，不得用 RP 绕过 handoff。

## 透明度要求（强制）

Claude / Fable 角色调用 Codex 或任何其他 CLI 时，最终报告 **必须** 含一段透明块：

- **规划/审阅模型**：scope 或 review 这项工作的角色
- **执行模型/profile**：用的 Codex profile 或其他 CLI profile
- **工作目录**：仓库路径或 scratch 路径
- **命令形状**：足以审计路由的部分，**secrets 与 token 必须 redacted**
- **结果**：测试或验证的 PASS / FAIL / NOT RUN，加上重要的 stdout/stderr 摘要

**绝不粘贴 API key、OAuth token、cookie 或带鉴权的完整命令。** 透明是关于路由与证据，不是泄露凭据。

## 默认混合交接序列

对适合混合执行的实施任务：

1. **Claude / Fable 规划。** 主 owner 读相关文档与代码情报，按 **已裁定的方案** 确认范围、风险与完成定义；边界外必要空白必须先通过现行串行 handoff 补全，不由执行者猜测或代写
2. **Codex 实施。** 收到方案、约束、取证与所需测试，只在获准范围内写码
3. **Claude / Fable 审。** owner 对照获准方案的验收标准与本仓约定审 diff
4. **Codex 修。** 审出具体问题就发一份 **有界的** 修复 prompt，不允许大范围重写
5. **owner 验证。** 重跑或复核所需测试，**跳过的检查要显式说出来**

**这一步之后才是验收** —— `acceptance-inspector` 只按已裁定方案里的 `AC-###` 检查，与谁写的码无关。

## 推广规则

Mode B 保持 **单点试点（`code-owner-runtime`）**，过下面三项指标才扩：C 铺开到 `expert-qa`，A 铺开到 security / LLM。

**永不把 Mode B 扩到 `code-owner-chat-core` 或 `code-owner-electron`。**

### Mode B 合格任务（opt-in，全满足才用）

- 范围在 `unchain_runtime/server` 内，有明确 spec + 可验证测试
- **不改模型可见行为**（改了 → 回 Claude 主写；仅在主 owner 记录真实专业缺口后提交 `expert-llm` 的有限 RP，获批后鉴定）
- **不碰安全敏感面**（MCP OAuth / secret → 退出 Mode B；仅在主 owner 记录真实专业缺口后提交 `expert-security` 的有限 RP，获批后定级）
- **不跨仓动 unchain core**（初期排除）

### 试点指标（报 `chief-judge` 决定扩或停）

1. Codex 引入的约定违反数（目标 0）
2. 是否真省时（定性 + 粗略）
3. 每任务的 token + 延迟成本是否可接受

**任一指标不达标，停止试点，退回 A / C。**

## 提交纪律

主树 **不自行 commit**，留 dirty tree 给 `chief-judge`。常设例外（2026-07-13 CEO 立）：**隔离 worktree 里的切片允许自己 commit，但不 push**；主树铁律不变。
