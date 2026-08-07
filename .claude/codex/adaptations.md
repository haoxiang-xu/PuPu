# 因地制宜台账 Adaptations

[法典索引](README.md)

本文件记录本仓 (PuPu) 对上游 Quorum 宪章所做的全部修改。依 [`codex` 角色职责 · 三、法典维护](roles/codex.md#三法典维护)，每条须载明 **修改理由** 与 **因地制宜的具体依据**（本 repo 的何种特性使原条文不适用）。

**宪法条文不在可修改范围内。** 本台账中若出现对 [`constitution.md`](constitution.md) 的修改，即为越权，`Chief Judge` 应予推翻。以下 A-001 至 A-007 全部只触及程序性条文与路径。

---

## A-001 · 三大目录改挂 `.claude/`

| 上游 | 本仓 |
|---|---|
| `archive/` | `.claude/archive/` |
| `archive/codex/` | `.claude/codex/` |
| `court/` | `.claude/court/` |

**理由**: 本仓不是专用的组织仓库，而是 **产品仓库** —— 仓库根目录是 PuPu 这个桌面应用的源码树，对外发布、被用户 clone。把 `archive/`、`court/` 建在根目录会把组织治理数据混入产品源码，且会进入发布包的目录列表。

**依据**: 运行环境 (Claude Code) 已约定 `.claude/` 为本仓的 agent 配置区，既有 `.claude/agents/`、`.claude/skills/`、`.claude/agent-memory/` 均在其下。三大目录挂入同一区，组织数据与产品源码天然分离。

**注意**: `.claude/codex/` 不再是 `.claude/archive/` 的子目录，法典因而不落在默认 archive owner 的排除式边界内 —— 这与上游"法典特区"的效果一致（法典本就不适用默认收纳规则），但边界声明须写成两条互斥路径，不能靠父子关系推导。

---

## A-002 · skill 平铺，department 不持有 skill 子目录

**上游条文**: [`department.md`](department.md) —— department 可以拥有自己的 skills；department 的 skills 对该 department 内所有 agent 可用。

**本仓**: 全部 skill 平铺于 `.claude/skills/<skill-name>/SKILL.md`，对 **全体 agent** 可用。

**理由与依据 (实测)**: 运行环境只装载 `.claude/skills/<name>/SKILL.md` 一层；嵌套一层以上的目录不会被识别为 skill。2026-08-04 本仓曾按 department 把 skill 改为 `.claude/skills/<dept>/<name>/SKILL.md`，结果 **11 份 SKILL.md 全部失效**（2026-08-07 实测：调用 `gitnexus-guide` 返回 `Unknown skill`）。这是环境约束，不是设计选择。

**对宪章效果的影响**: 可用范围由"同 department 可用"放宽为"全体可用"，是放宽不是收窄；[`department.md`](department.md) 的透明性原则（agent 只感知 skill 本身，不感知来源 department）不受影响，反而更彻底。

---

## A-003 · `Codex` 角色扩充：合法性监督 + 法典修改权 + memory 硬预算

**上游条文**: [`roles/codex.md`](roles/codex.md) 原文 —— `Codex` 只承担法典保管、入库纪律与庭上引证。

**本仓扩充**: 见 [`roles/codex.md` · 本仓扩充条文](roles/codex.md#本仓扩充条文)。三项：

1. **合法性监督** —— 审查程序合法性，监督对象含 `Procedural Judge` 与 `Speaker of the House`；异议具中止效力，但受引条义务制约
2. **法典程序性条文的修改权** —— 各 repo 需因地制宜，不应每次都惊动完整 case lifecycle；界线是宪法不可改
3. **memory 硬预算** —— `MEMORY.md` 前 200 行或 25KB，超出部分自身亦读不到

**理由**: 上游宪章没有任何角色负责"程序本身是否被遵守"。`Procedural Judge` 是流程内的参与者，不能自审；`Speaker of the House` 不拥有记忆，无法积累先例。缺这一环，`Chief Judge` 需自行发现每一次程序瑕疵。

**依据**: 本条文由本仓 `Chief Judge` 于 2026-08-07 (commit `cd56dc0f`) 撰写并入库，先于本次迁入。迁入时保留原文，只做路径适配（`archive/codex/**` → `.claude/codex/**`）与标题层级归并。

---

## A-004 · department 与 agent 的物理形式

**上游条文**: [`department.md`](department.md) —— 一个 department 对应一个 folder，folder 下有 `agents/` 与 `skills/` 子目录。

**本仓**: department = `.claude/agents/<dept>/` 一个 folder；每个 agent 是该 folder 下的 **一个 `.md` 文件**，不是一个子目录；department 不含 `skills/`（见 A-002）。

**依据**: 运行环境按 `.claude/agents/**/*.md` 递归发现 agent，一个文件即一个 agent，支持任意深度嵌套（已实测：`.claude/agents/cto/direct/*.md` 可被正确装载）。

**对宪章效果的影响**: 无。department 的组织规则（每个 agent 属于且只属于一个 department、创建合并拆分归 `Chief Judge` 直接决定、透明性原则）全部保持。

---

## A-005 · 法定人数条文并入 `lifecycle/`

`lifecycle/quorum.md` 是 **本仓自有条文**，上游 `docs/quorum/` 中无对应文件（上游根目录的 `quorum.md` 只是兼容入口，不具规范性）。

**位置理由**: 该条文自述"传唤机制解决叫谁到场，quorum 解决到场多少才算数，二者是同一套机制的两半，不可分开引用"，故与 [`lifecycle/summons.md`](lifecycle/summons.md) 同章。放在法典根目录会与上游兼容入口重名。

**依据**: 由本仓 `Chief Judge` 于 2026-08-07 (commit `cd56dc0f`) 撰写并入库。

---

## A-006 · human 角色不落 agent 文件

[`chief-judge`](roles/chief-judge.md) 与 [`witness`](roles/witness.md) 是 human 角色，由本人担任。二者 **不在 `.claude/agents/` 下建立文件** —— 建了就会被运行环境当作可派发的 agent，构成对宪法第一条的直接违反（agent 僭越裁决权）。

其角色定义仍在法典 `roles/` 内，是规范性的；只是没有 instance 文件。

---

## A-007 · 混合执行政策收入法典

[`hybrid-execution-policy.md`](hybrid-execution-policy.md) 规定 Claude / Codex CLI 的四种协作模式（A 只读参谋 / B Codex 主写 / C Codex 跑测试 / R 自主只读调查）及其角色分配与透明度要求。

**理由**: 这是一条 **组织级程序规则**（谁可以把执行委派给谁、委派后谁对结果负责、报告须披露什么），不是某个项目的技术知识，符合法典"跨项目复用"的准入边界。原位置 `.claude/agents/HYBRID_CODEX_POLICY.md` 会被 agent 漂移检查误计为一个 agent。

**2026-08-07 同批重写**: 角色分配表已按新 instance 名重写，并做了三处实质更正 ——

1. `expert-architecture` 由 Mode A 改为 **none**：2026-07-13 `chief-judge` 已显式覆盖其 `codex exec -p architect` 转手机制，架构推理留在 Fable 5 本模型内。旧表未反映该覆盖，是一处 **已生效但未落盘** 的指令
2. Mode R 由 `pupu-ai-researcher` 这个 agent 承载，改为由 [`ai-investigation` skill](../skills/ai-investigation/SKILL.md) 承载，**任何角色可调**。理由：Mode R 不写码、不落任何 repo of record、也不进庭审，它是一种方法而不是一个可被机械传唤的角色 —— 没有可声明的所有权边界的东西不该是 agent
3. `expert-llm` 的 **veto** 改述为 **强制回应效力**，与[宪法](constitution.md)及 [`Expert` 角色定义](roles/expert.md)对齐：可被 `chief-judge` 推翻，但不可被静默跳过

---

## A-008 · co-located 测试随源文件归属

[`summons.md` 第一层](lifecycle/summons.md) 要求边界声明可机器判定。本仓的测试与源码同目录（`foo.js` 旁边是 `foo.test.js`、`foo.subject.test.js`），若逐条枚举，每个 owner 的 glob 清单要翻一倍。

**本仓通则**：一个文件被某 owner 的边界命中时，其 **同名 co-located 测试** 一并归该 owner，无需单独声明。

```
<owned>.js        命中 X   =>   <owned>.test.js  与  <owned>.<suffix>.test.js  也归 X
```

**依据**: 这是纯机械推导，不引入判断，传唤第一层照样是规则匹配。**实测**: 2026-08-07 改制后首次覆盖检验，`src/SERVICEs/` 下 45 个文件报为无主，全部是 co-located 测试；补上本通则后归零。

**边界情形**: 与源文件不同名的测试（`e2e/**`、`electron/tests/**`、`src/setupTests.js`）**不适用本通则**，各自另有明确 owner。

---

## A-009 · 显式无 owner 清单

依 [`summons.md` 第三层](lifecycle/summons.md)，庭审中出现而其 owner 缺席的实体会阻止闭庭。下列路径 **显式声明无 owner**，`speaker-of-the-house` 遇到它们不必补行传唤，也不必每次向 `chief-judge` 请示：

| 路径 | 理由 |
|---|---|
| `.claude/agents/**` · `.claude/skills/**` | 组织对自身的定义。只由书记员依 `chief-judge` 的裁定写入；若指派某个 agent 拥有它，即等于该 agent 可自行改写组织，违反宪法第一条 |
| `docs/**` | 开发者文档。**这是一条择一的显式豁免，不是遗漏** —— 设 owner 与显式豁免二者必居其一，不可留空。若文档持续腐化，那构成设 `knowledge-owner-docs` 的立案依据 |
| `README.md` · `CONTRIBUTING.md` · `LICENSE` · `NOTICE` · `AGENTS.md` · `CLAUDE.md` | 对外与元文件。授权协议相关的取舍由 `expert-business` 鉴定、`chief-judge` 裁定，不需要一个常驻 owner |
| `.gitignore` · `.gitattributes` · `.python-version` | 工具链元文件 |
| `.claude/worktrees/**` · `build/` · `dist/` · `coverage/` · `.gitnexus/` | 生成物与临时工作区，不是源 |

**豁免不是永久的。** 任一项反复出现在庭审中并造成实际信息缺口时，那就是它需要 owner 的证据 —— 走 case lifecycle 设立，同时从本清单删除。
