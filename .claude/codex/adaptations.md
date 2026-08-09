# 因地制宜台账 Adaptations

[法典索引](README.md)

本文件记录本仓 (PuPu) 对上游 Quorum 宪章所做的全部修改。依 [`codex` 角色职责 · 三、法典维护](roles/codex.md#三法典维护)，每条须载明 **修改理由** 与 **因地制宜的具体依据**（本 repo 的何种特性使原条文不适用）。

**宪法条文不在可修改范围内。** 本台账中若出现对 [`constitution.md`](constitution.md) 的修改，即为越权，`Chief Judge` 应予推翻。A-001 起的全部条目只触及程序性条文与路径。

**本文件不记录上游同步。** 上游 Quorum 自身的演进另记于文末「[上游同步记录](#上游同步记录)」—— 二者性质不同：因地制宜是 **本仓偏离上游**，上游同步是 **本仓跟上上游**。混在一起，日后无法回答"哪些是我们自己改的"。

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

1. `expert-architecture` 由 Mode A 改为 **none**：2026-07-13 `chief-judge` 已显式覆盖其 `codex exec -p architect` 转手机制，架构推理留在本模型内。旧表未反映该覆盖，是一处 **已生效但未落盘** 的指令。**2026-08-07 追加**：`chief-judge` 撤销了同一指令中"跑 Fable 5"这一半——起因是 `0000-0003-2026-0807` 议案庭审中 `expert-architecture` 连续三次派遣因 Fable 5 硬配额耗尽零产出，闭庭卡在法定人数。撤销后不再写死模型，派遣方须在派遣时显式选当时可用最强模型；"不走 codex 转手、推理留在本模型内"这一半不受影响，继续有效
2. Mode R 由 `pupu-ai-researcher` 这个 agent 承载，改为由 [`ai-investigation` skill](../skills/ai-investigation/SKILL.md) 承载，**任何角色可调**。理由：Mode R 不写码、不落任何 repo of record、也不进庭审，它是一种方法而不是一个可被机械传唤的角色 —— 没有可声明的所有权边界的东西不该是 agent
3. `expert-llm` 的 **veto** 改述为 **强制回应效力**，与[宪法](constitution.md)及 [`Expert` 角色定义](roles/expert.md)对齐：可被 `chief-judge` 推翻，但不可被静默跳过

**2026-08-08 追加**：`chief-judge` 将 1 中对 `expert-architecture` 的 Fable 5 撤销**明确扩展到 `expert-llm`**——起因是 `0000-0008-2026-0808` 议案庭审中 `expert-llm` 派遣同样因 Fable 5 硬配额耗尽零产出，quorum 卡在 8/9 无法闭庭；`speaker-of-the-house` 与 `procedural-judge` 均无权自行把该撤销的射程从 `expert-architecture` 扩至其他角色，故升报 `chief-judge` 逐个裁定。**这仍是逐角色扩展，不是部门级豁免**——`expert-security`、`expert-qa` 是否解绑未经裁定，遇到时须再次升报，不得援引本条自行推断。

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

---

## A-010 · 边界声明的可解析格式

[`summons.md` 第一层](lifecycle/summons.md) 要求边界 **可机器判定**，但没有规定它长什么样。"可判定的内容"配上"不可解析的排版"，机械匹配照样漏人。

**本仓格式**：每份 charter 的边界写在标题为 `## 所有权边界声明` 的段落内，**该段内第一个 fenced code block 即是边界正文**，一行一条。围栏之前可以有说明性散文，解析器 **必须取第一个围栏，不得要求它紧邻标题**。

```markdown
## 所有权边界声明（触发条件，传唤第一层依据）

议案出现下列任一性质的内容时，本领域必到：   <- 可有可无的散文

```
第一行边界
第二行边界
```
```

**依据 (实测)**: 2026-08-07 第一次真实传唤中，一个要求围栏紧邻标题的解析器 **静默丢掉了 6 个 `Expert` 中的 5 个** —— 只有 `expert-business` 恰好没写那行散文。丢失是无声的：名单照常产出，只是少了五个人。

**这条的教训比条文本身重要**：传唤第一层的可靠性等于 **最脆弱的那个解析假设**，而不是等于边界内容写得多好。任何对 charter 排版做隐含假设的工具，都必须在真实议案上验证过命中数，不能只看它没报错。

**同案第二次同类缺陷**：另一个实体抽取器只收含 `/` 的字符串，把议案依据中以 **裸文件名** 出现的 `memory_inspect_modal.js`、`side_menu_context_menu_items.js` 静默丢弃，导致 `code-owner-settings` 未进必到名单 —— 而它正是待裁问题 Q2 的直接 owner。由传唤第二层捞回。**归档时须区分「边界写窄」与「抽取写窄」，二者处方相反**：前者改 charter，后者改工具；混为一谈会让人去改一份本来正确的 charter。

### 2026-08-07 · 缺陷已修，工具落盘

case `0000-0002-2026-0807` 立案时 **同一裸文件名缺陷第三次发作**，`code-owner-settings` 第二次被漏（Q9 逐字点名 `memory_agent_settings.js`，而该 owner 的 charter 逐字声明同一行）。主持人逐份读完 31 份 charter 手工补正，必到名单由 5 人改为 9 人 —— 其中包括 **Q1 最中心实体的 owner**：`memory_v2_trace_presenter.js` 实际位于 `src/SERVICEs/runtime_events/`，归 `code-owner-shared-arteries`。

`speaker-of-the-house` 就此提出的指控成立：**A-010 只记录了缺陷，没有修它。** 记录一个每次立案都会重犯的缺陷，而不修它，等于把成本从"一次性修工具"改成"每案重复漏人"。

抽取器已实现并落盘为 [`.claude/skills/case/summon.py`](../skills/case/summon.py)，修复三类漏人（围栏紧邻假设、裸文件名、概念名），并做了回归检验：**独立复现出主持人手工补正的全部 4 名 owner**。工具头部注释载明三类缺陷各自的真实发案记录，改动前须先读。

**遗留（本工具结构上看不见，非缺陷而是边界）**：概念名只能产出候选供人工确认；**仓外实体一律不可见** —— 运行时数据目录、外部系统在现行边界体系中没有 owner（全部 `Code Owner` 边界均为仓内路径 glob，A-009 豁免清单亦未覆盖）。这类实体今后每次都会卡住第三层门禁，属 `codex` 待处置项，与本条并列的还有主持人提出的两项：概念名漏人应否单列第三桶「**议案写窄**」，以及一个不读 transcript 的在途 instance 存活探针。

---

## A-011 · 裁定记录类型增加 `TERMINATION`

[`chief-judge` 角色职责](roles/chief-judge.md) 授予其"在任何阶段中止或终止一个 case"的权力，[`case-format.md`](court-records/case-format.md) 的 `status` 枚举也有 `terminated`，但 [`templates.md`](court-records/templates.md) 的 **`记录类型` 六个值里没有任何一个能承载中止**。

于是一次合法的中止 **无处归档**：写成 `PROCEDURAL_RULING` 是伪装（那是 `Procedural Judge` 的授权事项），不写则 `status: terminated` 没有裁定依据，违反[宪法第二条](constitution.md)的留痕要求。

**本仓补充**: `记录类型` 增加 `TERMINATION`，只允许 `Chief Judge` 使用，字段约束见 templates.md。

**依据 (实测)**: 2026-08-07 case `0000-0001-2026-0807` 被 `chief-judge` 中止时发现。**这是一个纯粹的枚举遗漏** —— 权力在宪法里、状态在 `case.md` 格式里，唯独中间的记录形式缺失。这类缺口只会在第一次真正行使该权力时暴露。

---

## A-012 · 运行时故障不得记为阻塞记录

[`quorum.md` 第三节](lifecycle/quorum.md) 规定：法定必到者确实无法参与时庭审挂起等待，并归档一条 **阻塞记录**，且明言"阻塞记录是组织过载的唯一客观证据"。

该条文设想的情形是 **owner 正忙于别处的写入参与** —— 一个组织现象。它没有预料到 **owner 的 instance 在运行时直接死亡**。

**本仓补充**: 法定必到者因 **运行时故障** 未能出庭的，归档为 **运行时故障记录**，与阻塞记录 **分开计**。二者对闭庭的效力相同（法定必到者缺席，不得闭庭），但证明的东西完全不同：

| | 阻塞记录 | 运行时故障记录 |
|---|---|---|
| 成因 | owner 边界过宽，被并发 case 争用 | 扇出宽度超出运行时容量 |
| 是什么的证据 | **组织过载** —— 构成拆分该 owner 的立案依据 | **容量不足** —— 构成收窄扇出的依据，与该 owner 的边界无关 |
| 处方 | 拆 owner | 收窄单次传唤的并发宽度 |

**混计的后果是把容量问题误读成组织问题**，据此去拆一个本来健康的 owner。

**依据 (实测)**: 2026-08-07 case `0000-0001-2026-0807` 的议案庭审中，14 名法定必到者并行出庭，**9 个 instance 以完全相同的签名死亡**（"600 秒无进展，watchdog 未恢复"），含 `expert-qa`、`expert-llm`、`code-owner-electron`、`code-owner-shared-arteries`、`code-owner-unchain`、`code-owner-agents`、`code-owner-devtools` 七名必到者及两个勘察子 instance。失败与各自任务内容无关，只与并发度相关；`code-owner-runtime`（首个出庭）与 `code-owner-chat-core` 完整交付。

**由此得出的两条操作约束**（未写入宪章，作为传唤实践）：单次传唤的并发宽度须受限，必到角色多时 **分小批串行**；必到角色 **不得再派生自己的勘察子 instance** —— 三个 `Explore` 子 instance 的死亡说明那正是触发点。取证不足的部分按「未核实」交，强于再挂一次。

---

# 上游同步记录

上游 Quorum 自身的演进。**这些不是本仓偏离，是本仓跟上上游** —— 与上面 A-0xx 的性质相反，不可混计。

## 2026-08-07 · 质疑机制与证据规则

**上游**: `github.com/haoxiang-xu/quorum` · `docs/quorum/`

**动因（本仓实测）**: case `0000-0002-2026-0807` 闭庭门禁第 6 项载明 —— 全程 **`OBJECTION` 动作零次提交**，而 **实质异议大量存在**（E-0039 反驳 S-0006 · E-0045 反驳 S-0007 · S-0020 反驳 S-0010 · E-0004 反驳前案 S-0005），全部以 `ASSESSMENT` / `ANSWER` 内的具名反驳形式出现。同案 `evidence-examiner` **全程未参与**，77 条证据中仅 9 条「已验证」（全由 `speaker-of-the-house` 自行取得），其余为提交人在自己边界内取得、未经独立复核 —— 而该案 **有两名 owner 基于他人证据改票**（`code-owner-runtime` 与 `code-owner-chat-core` 均由 (c) 改 (a)）。

根因是 **上游自身的条文冲突**，不是本仓适配问题：

| 出处 | 原措辞 | 效力 |
|---|---|---|
| `lifecycle/README.md` | **所有** 庭审 **都由** `Evidence Examiner` 验证 | 无条件强制 |
| `constitution.md` 第五条 | `Speaker` **有权**…交由 `Evidence Examiner` 审查 | 裁量 |
| `roles/speaker-of-the-house.md` | **如果** 来源不可靠或存在争议，**有权** 要求… | 附条件裁量 |

主持人依其 charter 行事（裁量），因而合规地违反了 lifecycle 那条无条件规定。**质疑通道存在而使用为零，是因为提出 `OBJECTION` 不产生任何后果** —— 走正式通道与在自己发言里骂一句效果相同。缺的不是质疑权（[第三条](constitution.md)发言平等本已给予），是 **质疑的后果**。

**同步内容（七处）**:

1. **宪法第五条重写** —— 质证权由 `Speaker` 专属扩及 **全体 agent**；符合形式要件的质疑 **强制触发** 审查，主持人无裁量权；**补强被质疑证据的责任归于提出该证据的一方**
2. **宪法第七条加边界句** —— 实体不动，只声明它约束的是 **观点与主张** 的反驳，证据真伪与来源依第五条。二者是两种不同的举证责任
3. **新增 `lifecycle/evidence-rules.md`** —— 两种举证责任的分野 · 质疑的形式要件三条 · 四类证据（自证 / 须查 / 传闻 / 证言）及默认处置 · 保管链只影响证明力 · 审查范围限于三问
4. `lifecycle/README.md` —— 删去造成冲突的无条件句，改为按证据类型与质疑触发
5. `lifecycle/speech-protocol.md` —— `OBJECTION` 针对 `E-####` 且类型 `SOURCE`/`UNSUPPORTED` 时的强制效力；**闭庭门禁增第 9、10 项**
6. `roles/speaker-of-the-house.md` —— 证据审查由裁量权改为 **义务**，并增形式审查职责（只看形式，不得以理由不成立驳回）
7. `roles/evidence-examiner.md` —— 增出庭场景四类与 **审查范围限制**（不得重开实体争点、不得因立场调整结论）

**修宪主体（须记录，防止形成错误判例）**: 第五、七条系 **`chief-judge` 直接修改**，非 `codex` 修改。[`codex` 的法典维护权](roles/codex.md#三法典维护)明文排除宪法 —— 该限制约束的是 `codex`（监督者不得自定监督标准），**不约束 `chief-judge`**，其权力源于[第一条](constitution.md)。日后援引本次修宪时，不得据以推出"`codex` 可以改宪法"。

**同批第二轮（同日，`chief-judge` 指示）**:

8. **承重证据复核** —— 新增 `evidence-rules.md` 第六节。**承重证据由编号机械导出**：`SUMMARY` 在 分歧 / 强制回应事项 / 候选方案 / 风险 四项中点名的发言，其 `依据` 列出的全部 `E-####`，一跳、不做传递闭包。**自证类的免检在本关失效** —— 免检是对大批量证据的分流手段，其前提"任何角色可独立复现"依赖复现时点，而一次庭审可长达数小时（case `0000-0002-2026-0807` 实测约 4 小时，其间另有并发会话在同一仓库作业），早期定位到闭庭时未必仍成立。复核因此同时是 **时效性复核**。复核未通过者，依赖它的发言丧失该项证明力、受影响项须重排、不得闭庭，且复核结果 **必须显式呈给 `chief-judge`**，不得以"其他证据仍能支持同一结论"略去。闭庭门禁增第 11 项
9. **取消 `Speaker of the House` 的一切相关裁量权** —— 首轮修改后仍残留一句「此外 **有权** 要求提供更多的证据或进行进一步的调查」，`chief-judge` 指出这正是使原机制失效的同一种句式。现已删除，并写明：本角色 **不持有质证权**、对"是否启动审查" **不持裁量权**，职责限于 **分类与路由**。理由载入条文：写成"主持人有权要求审查"读起来像保障，实际是把审查的有无系于一个 **无人复核的主观状态**，一旦未行使，程序上不留任何痕迹表明它本该被行使。质证权归 **出庭角色**（当事人），主持人只作形式审查 —— 裁判不质疑证据

**穷举性声明**: 审查的触发条件现已穷举为四类（被质疑 / 须查类 / 证言类 / 承重）。无人质疑、非须查类、亦不承重的证据不获审查，**这是刻意的** —— 按定义它没有压在裁定上，查与不查不改变结果。

**本仓适配**: 无。九处修改在本仓与上游 **逐字一致**；`lifecycle/README.md` 与 `roles/speaker-of-the-house.md` 各保留其原有的 A-005 / A-001 适配，除此之外与上游无差异。**每次同步后须机械核验此项**（`diff` 差异行应恰为 1 与 2）。
