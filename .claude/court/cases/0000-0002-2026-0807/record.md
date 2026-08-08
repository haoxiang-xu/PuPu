---
case_id: 0000-0002-2026-0807
updated_at: 2026-08-07T17:55:00-07:00
---

# 发言记录

追加式。已归档发言不得原地改写；内容有误以 `WITHDRAWAL` 撤回后另提替代发言。

本 case 的 `S-####` / `E-####` 为 **本地序列**，与 `0000-0001-2026-0807` 独立。援引前案一律写作 `0000-0001-2026-0807#S-####` / `#E-####`。

## 议案庭审

#### S-0001 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 议案庭审开庭
- **依据**: 0000-0001-2026-0807#R-0001
- **不确定性**: 无
- **请求/下一步**: 进入议题框定
- **通知类型**: OPENING
- **生效时间**: 2026-08-07T17:55:00-07:00
- **影响范围**: case `0000-0002-2026-0807` 全部出庭角色。本次庭审只收 **意见和建议**，不收完整实施方案（方案庭审为 Full track 第 4 步，另行召开）。本庭同时是 [A-012](../../../codex/adaptations.md#a-012--运行时故障不得记为阻塞记录) 收窄实践的 **第一次验证**

#### S-0002 | FRAMING | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 本次议案庭审框定如下。待裁问题、范围、已知事实、已知缺口、必到名单与交付以本条为准。**必到名单经传唤第一层重跑后由 5 人补正为 8 人**，依据与分类见下
- **依据**: E-0001, E-0002, E-0003, E-0004, 0000-0001-2026-0807#S-0005, 0000-0001-2026-0807#S-0006, 0000-0001-2026-0807#R-0001
- **不确定性**: E-0001 虽已入库可按 SHA 固定，但 `docs/**` 依 [A-009](../../../codex/adaptations.md#a-009--显式无-owner-清单) 显式无 owner，其内容主张 **无 owner 背书**；引用它的具证明力主张须自行核对到代码、命令或 DB。另：本庭的传唤第二层（认领期）以缩减形式执行，见 S-0003
- **请求/下一步**: 8 名法定必到角色按各自输出契约提交 `ASSESSMENT`，依 A-012 **每批 2 人、串行四批**
- **待裁问题**:

  - **Q1** Memory V2 在 trace chain 中体现什么。已归档的两项发现须先处置：
    - 后端另产一条与 presenter 四态（Complete / Partial / Legacy / Unavailable）**正交** 的轴 —— Curator 的 `status: "Isolated"` + `reason` + `worker_status`。`Isolated` 有渲染落点（`src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:130`），但 **`worker_status` 在 `src/` 中零引用，产出即丢弃**（`0000-0001-2026-0807#S-0005`，本庭以 E-0004 独立复核成立）
    - 「本轮 V2 编译是否完整」与「本轮产生的记忆有没有被整理」是两件事，现被拍平在同一条 trace 上。缺的不是状态种类，是 **分层**
  - **Q1-前段** 流是否承载 V2 帧。`0000-0001-2026-0807#S-0006`（`code-owner-chat-core`）主张：presenter 能体现什么取决于 `streaming_message_store` / `runtime_events_v4` 承不承载 V2 帧，让 schema 承载新数据是 **跨面契约变更**。**该发言要求本问与 presenter 议题绑定裁决，不得拆开**
  - **Q9** 命名债务（`memory_agent_settings.js`、`memory_v2_unchain_agent_factory.py`、"Memory Agent" 文案）是否清理、何时。**约束：清理不得重新引入 Builder 卡片或 recipe 节点**
  - **Q10** 旧实现何时删除。**前提已被更正**：`memory_v2_toolkit.py` / `memory_v2_curator.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` **不是不可达 fallback，而是 `pupu_legacy` 数据平面的唯一实现**；删除是 **弃用一个 store owner**，不是清理死代码（`0000-0001-2026-0807#S-0005`）

  **本案的核心问题（不得被逐问表态淹没）**：Q1 与 Q10 同案的唯一理由是 —— **Q1 若基于当前 trace 词汇立规格，规格会挂在 Q10 要删的代码上**（`Isolated` 的 6 个产点中 4 个在 `memory_v2_curator.py`）。因此闭庭产出必须对下列三选一给出直接回应，不得只给逐问意见：

  > **(a) 先定 trace 词汇再删** · **(b) 先删再定词汇** · **(c) 二者必须在同一份方案里同时落**

- **范围**:
  - **在范围内**: Q1 / Q1-前段 / Q9 / Q10，以及各出庭角色 **在自己边界内看到、而本 `FRAMING` 未列出** 的本案范围内未决项。本轮收 **意见和建议**（缺什么、该定成什么样、约束是什么、风险在哪），不收完整实施方案
  - **不在范围内**: (a)「要不要做 Memory V2」本身；(b) `0000-0001-2026-0807` 议案依据 §3 列为 **已锁定架构共识** 的原则（五层共享一个数据平面、Memory 不是 Builder 里的 Agent、权限不用角色枚举、长期记忆永远需要用户确认、同进程无 capability 隔离）—— 要推翻须另行立案；(c) 完整实施方案的步骤、可逆性与验收标准 —— 属方案庭审；(d) 发版动作与发布认证
  - **不在本案、已分给兄弟 case 的**（出庭角色如在这些方向上有意见，请标注为 **参考** 并指名承接 case，不在本案展开）：`0000-0003-2026-0807`（Q2 / Q3 / Q5 / Q7 / Q8 与 turn-mutation 反馈、vault 生命周期）· `0000-0004-2026-0807`（Q6 只读 task-state 契约、Q4-C flag-off 记录完整性）
  - **约束（议案自带，出庭角色须遵守）**: Q9 的命名清理 **不得重新引入 Builder 卡片或 recipe 节点**；该约束今天由 `src/COMPONENTs/agents/pages/recipes_page/workflow_list.test.js:121-144` 的活测试强制（E-0003）

- **已知事实**:
  - 议案依据 `docs/architecture/memory-v2-claude-handoff-2026-08-07.md` **已于 `8d7fbd1d` 入库**，blob `bc9c2d9d`（E-0001）。这更正了 `0000-0001-2026-0807#E-0001`「untracked、无法以 SHA 固定」一句；**但 `docs/**` 仍无 owner，其内容真实性仍无人背书**
  - PuPu HEAD `8d7fbd1d`，unchain HEAD `a4e69f41`，lock revision `a4e69f41` / `context_memory_contract: 1`，握手一致；`14ca3ccc..HEAD` 在 `src/` `electron/` `unchain_runtime/` 三个产品目录的变更文件数为 **0**（E-0002）。**故前案 `#S-0005` / `#S-0006` 引用的全部 `file:line` 锚点在本庭仍然有效 —— 不必重新取证**
  - `worker_status` 在 `src/` 全域 **零命中**（E-0004），独立佐证 `0000-0001-2026-0807#S-0005`
  - `memory_agent` 系列标识符在 `src/` 有 **58 处、8 个文件、横跨四名 owner**；而 **`src/locales/` 零命中**（E-0004）。`0000-0001-2026-0807#S-0005` 建议的「用户可见文案属 `src/locales/**`，现在就能改」在 renderer 侧 **没有对应目标**，该建议须先由某个 owner 指出用户可见的 "Memory Agent" 字样渲染在何处
  - Curator 的 `Isolated` 在 renderer 侧的唯一落点是 `src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:25/:130/:426`（E-0003）
  - trace presenter 的物理位置是 `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js` —— **不在 `chat-bubble` 下**（E-0003）。这直接决定了必到名单的第一处补正

- **已知缺口**:
  - **议案依据无 owner 背书。** 已入库可固定引用，但 `docs/**` 依 A-009 显式无 owner
  - **跨会话闭环未证明。** 前案实测 `entries=0`、`candidates=0`、`consolidation_jobs=0`、`promotion_proposals=0`（`0000-0001-2026-0807#E-0002`）。任何关于「用户在 trace 上会看到什么」的判断目前无真实数据支撑，据此提出的形态主张须标注为 **基于空态推演**
  - **`pupu_legacy` 存量安装无法证否。** 只能证明当前代码不再新产生，**无法证明历史版本没产生过**（`0000-0001-2026-0807#S-0005` 的不确定性声明 (b)）。Q10 的删除时序直接依赖这一条
  - **前案候选证据 CE-1…CE-8 未经验证、未分配编号。** 它们随 `0000-0001-2026-0807#S-0006` 提交，**未经 `evidence-examiner` 验证**；引用者自行承担举证责任
  - **前案 `#S-0005` 自陈的三条不确定性不得当作已证事实**：(a) `get_session_head` 在 `session_id` 为空时的行为未实测；(b) `pupu_legacy` 存量安装无法证否；(c) Trace 侧渲染取舍越出其边界
  - **传唤第二层（认领期）以缩减形式执行**，见 S-0003。这是一条程序缺口，须进闭庭产出

- **必到角色与交付**:

  **传唤第一层重跑结果。** `case.md` 立案时记载必到 5 人。`speaker-of-the-house` 依职责以议案文本及其涉及的实体，对 `.claude/agents/` 下 **全部 31 份 charter 的「所有权边界声明」段逐条重跑机械匹配**（读取 charter 与文件系统，**未派生任何子 instance**），得 **8 人**。依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，新增三人为法定必到者。

  | 角色 | 边界命中依据（议案实体 → 该角色边界声明条目） | 落位 | 来源 |
  |---|---|---|---|
  | `code-owner-runtime` | `unchain_adapter.py:938-945`、`memory_v2_curator.py:450/479/504/919`、`memory_v2_toolkit.py`、`memory_v2_workspace_adapter.py`、`memory_v2_context_adapter.py`、`memory_v2_unchain_agent_factory.py` → `pupu:unchain_runtime/**` | Q1 产帧端 · Q9 后端半 · Q10 全部待删文件 | `case.md` |
  | `code-owner-chat-bubble` | `memory_v2_journal_reload.js:25/:130/:426`、`trace_chain.js` → `pupu:src/COMPONENTs/chat-bubble/**` | Q1 渲染端 · `Isolated` 的唯一渲染落点 | `case.md` |
  | `code-owner-chat-core` | `streaming_message_store.js`、`use_chat_stream.js:6483` → `pupu:src/SERVICEs/streaming_message_store.js`、`pupu:src/PAGEs/chat/**` | Q1-前段（流是否承载 V2 帧）· Q9 的 payload key 发出端 | `case.md` |
  | `expert-llm` | 「流式帧语义（帧类型、顺序、终态）」+「prompt 组装与 system prompt 结构」（`PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT`，`0000-0001-2026-0807#S-0005` 明确划出交本领域） | Q1 帧语义 · Q9 的 prompt 常量 | `case.md` |
  | `expert-architecture` | 「跨两个及以上 code-owner 边界」（本案跨 6 名）+「触及跨仓库接口」+「共享原语或公共动脉的结构变更」（`runtime_events/**`） | Q1 与 Q10 的结构耦合 · 弃用一个数据平面 | `case.md` |
  | **`code-owner-shared-arteries`** | **`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`、`trace_chain_adapter.js` → `pupu:src/SERVICEs/runtime_events/**`**（该 charter 边界声明第 3 条）；`src/SERVICEs/chat_storage/**` → 同 charter 第 4 条；`src/locales/**` → 同 charter | **Q1 的 presenter 本体 · Q1-前段的 `runtime_events_v4` · Q9 的四分之一** | **本庭补正** |
  | **`code-owner-settings`** | **`src/SERVICEs/memory_agent_settings.js` → `pupu:src/SERVICEs/memory_agent_settings.js`**（该 charter 边界声明的 **逐字一行**，而 Q9 原文 **逐字点名该文件**） | **Q9 的 durable localStorage namespace（`MEMORY_AGENT_NAMESPACE = "memory_agent_v2"`）** | **本庭补正** |
  | **`code-owner-agents`** | **「Builder 卡片」「recipe 节点」→ `pupu:src/COMPONENTs/agents/**`**；该约束今天由 `pages/recipes_page/workflow_list.test.js:121-144` 的活测试强制（E-0003） | **Q9 自带约束的强制点** | **本庭补正** |

  **未命中，不进必到名单**（理由登记，供第三层门禁复核）：

  - `code-owner-electron` —— 本案不含 IPC channel 或 preload 的增删改（Q6 已分给 `0000-0004-2026-0807`）
  - `code-owner-unchain` —— 本案不含 unchain 侧改动请求（Q6 已分给 `0000-0004-2026-0807`）。**注意**：Q10 删除的是 PuPu 侧 `pupu_legacy` 平面，不触及 `unchain:**`
  - `code-owner-devtools`、`code-owner-toolkit`、`code-owner-ui-primitives` —— 各自路径 glob 均未命中
  - `expert-security` —— 触发条件五项均未命中（本案不含 IPC/bridge 面增删改、不含网络请求、不含凭据存储迁移、不含第三方代码执行、不含更新签名）
  - `expert-ux` —— **边缘判定，登记备查**：Q1 的「分层」若最终落成一个可见的呈现形态，会命中「布局与视觉层级」。本庭判定 **不进必到名单**，理由是本案裁的是 **trace 词汇与数据分层**，呈现形态归 `0000-0003-2026-0807`（`expert-ux` 在该案已是法定必到）。**若庭审中出现具体呈现形态主张，第三层门禁须重新判定**
  - `expert-qa` —— **边缘判定，登记备查**：Q10 的删除会产生回归面。本庭判定 **不进必到名单**，理由是本轮不收实施方案，回归面判定属方案庭审。**若庭审中出现具体删除清单与验收主张，第三层门禁须重新判定**
  - `expert-business` —— 触发条件五项均未命中
  - `dimension-owner-*` ×4 —— 评估对象是「组织变更议案」，本案不是组织变更
  - `task-owner-release-certification` —— task 名 `release-certification` 未在议案中出现
  - `knowledge-owner-*` ×4、`codex` —— 各自知识库路径均未命中

  **边界自愈信号（三条，依传唤机制「边界自愈」归档；分类不同则处方相反）**：

  | 号 | 捞回对象 | 分类 | 处方 |
  |---|---|---|---|
  | **1** | `code-owner-shared-arteries` | **抽取写窄**，非边界写窄。该 charter 第 3 条 `pupu:src/SERVICEs/runtime_events/**` **正确覆盖** `memory_v2_trace_presenter.js`。缺陷在立案时把 "presenter" 当成概念名处理，未把它解析成文件路径，遂默认归给 trace 的 **渲染方**（chat-bubble）。这是 [A-010](../../../codex/adaptations.md#a-010--边界声明的可解析格式) 第二类缺陷的 **第三次复发** | 改立案环节的实体抽取，**不要改这份 charter** |
  | **2** | `code-owner-settings` | **抽取写窄**，非边界写窄。Q9 原文 **逐字写出** `memory_agent_settings.js`，该 charter 也 **逐字声明** 同一路径。裸文件名再一次被丢弃 —— 与 `0000-0001-2026-0807#S-0004` 捞回同一名 owner 的成因 **完全相同**，且发生在该缺陷已被写入 A-010 之后 | 改立案环节的实体抽取。**同一缺陷第二次捞回同一名 owner，构成「A-010 只记录了缺陷、没有修复它」的证据** |
  | **3** | `code-owner-agents` | **两分法不适用。** charter 是路径 glob（`pupu:src/COMPONENTs/agents/**`），议案给的是概念名（「Builder 卡片」「recipe 节点」）。路径匹配器 **结构上不可能** 命中一个概念名。既不是 charter 写窄，也不单纯是抽取器写窄 —— 是 **议案以概念表述约束，未指向强制该约束的产物** | 建议 `codex` 考虑 A-010 的二分类是否需要第三桶（**议案写窄**）。本庭不自行裁定该分类，只归档事实 |

  **每名必到角色本轮须交付**（在 `ASSESSMENT` 的角色输出契约字段内完成，不另开动作）：

  1. **Q1 / Q1-前段 / Q9 / Q10 中哪几条落在本角色边界或领域内**，逐条给出意见；不落在自己身上的编号明确写「不落在我这里」
  2. **对本 `FRAMING` 核心问题 (a)/(b)/(c) 的直接选择**，并给理由
  3. **本角色看到、而本 `FRAMING` 未列出的、属于本案范围的未决项**
  4. 每项具证明力的主张给 **出处**（`file:line` / 可复现命令 / DB 查询）；**核实不了写「未核实」，不得再挂一次**
  5. 越出本角色边界或领域的看法，**标注为参考**，不计入本角色结论

#### S-0003 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 本庭对传唤第二层（认领期）与传唤第一层的执行方式作两项程序判定，并归档以备 `codex` 审查
- **依据**: 0000-0001-2026-0807#R-0001, E-0003, S-0002
- **不确定性**: 判定一的缩减形式 **可能漏掉** 一名本可自请出庭的 agent。缩减执行覆盖了「边界声明已正确写出、但立案抽取漏掉」的情形（这是本案实际发生的三次全部成因），**未覆盖** 「边界声明本身写窄、agent 看到具体议案才认得出」的情形 —— 该情形依赖 agent 本人阅读议案，缩减形式做不到
- **请求/下一步**: `codex` 若认为任一判定不合法，可提出合法性异议（依异议的中止效力，本庭审暂停待 `chief-judge` 裁定）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T17:55:00-07:00
- **影响范围**: 本案全部传唤

**判定一 · 传唤第二层以缩减形式执行。**

[传唤机制第二层](../../../codex/lifecycle/summons.md) 要求向 **全体 `Expert` 及同 department 内的全部 agent** 广播议案标题与一句话摘要。在本运行环境中，「广播」的唯一物理实现是 **同时唤起 26 个以上 instance**。[A-012](../../../codex/adaptations.md#a-012--运行时故障不得记为阻塞记录) 的实测依据表明，14 路并发已导致 9 个 instance 以同一签名死亡；执行完整广播将确定性地触发同一故障，且会 **先于必到者的实体发言** 耗尽运行时容量。

本庭以 [quorum 第六节](../../../codex/lifecycle/quorum.md) 的判定权，改以 **等效但不并发** 的方式执行：`speaker-of-the-house` **亲自逐份读取全部 31 份 charter 的「所有权边界声明」段**，对议案实体重跑机械匹配（见 S-0002 的重跑结果表，含 8 名必到与 15 名未命中者的逐条理由）。该操作 **不派生任何子 instance**，成本为 31 次文件读取。

**这不是等价替换，两者覆盖面不同**（见本条 **不确定性**）。故本项作为 **已知缺口** 进入闭庭产出。

**判定二 · 必到名单由 5 人补正为 8 人。**

依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，三名新增者为 **法定必到者**，计入 quorum，对已完成部分保留完整发言权。`case.md` 的必到角色字段随之更新（`case.md` 是该项的 canonical source）。

**判定三 · 本庭的传唤批次（A-012 收窄实践的第一次验证）。**

| 批次 | 角色 | 编组理由 |
|---|---|---|
| 1 | `code-owner-runtime` · `code-owner-chat-bubble` | Q1 的产帧端与渲染端，先让两端对上 |
| 2 | `code-owner-chat-core` · `code-owner-shared-arteries` | Q1-前段的两半：流的驱动方与 `runtime_events` / presenter 的 owner |
| 3 | `expert-llm` · `code-owner-settings` | 帧语义与 prompt 常量 · Q9 的 durable namespace |
| 4 | `expert-architecture` · `code-owner-agents` | 前者须读到前三批结论才能评估结构；后者只验 Q9 约束的强制点，与批次顺序无关 |

**每批最多 2 名，一批返回后再发下一批。** 每份传唤书均明令：**被传唤角色不得派生自己的勘察子 instance**；取证不足按「未核实」交，强于再挂一次。任一角色失败则 **串行重试一次**；二次仍失败，依 A-012 归档 **运行时故障记录**（不是阻塞记录），并在 `SUMMARY` 中标注该维度未被覆盖。

#### S-0004 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 必到名单第 **4** 处补正 —— `code-owner-electron` 为事后认定的法定必到者。必到人数由 8 增至 **9**，传唤批次由四批调整为 **五批**
- **依据**: E-0005, E-0006, S-0002, S-0003
- **不确定性**: E-0006 **只证明** Electron 侧存在按 `data.type` 的帧分派，**未证明** 该分派是白名单式（会丢弃未知帧类型）还是透传式。这一区分本身就是要该 owner 回答的事，本庭不代答，也不得据此预判 Q1-前段的答案
- **请求/下一步**: `code-owner-electron` 于第 4 批出庭，交 `ASSESSMENT`
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T18:10:00-07:00
- **影响范围**: 本案必到名单与传唤批次

**命中依据（机械匹配，非判断）**

Q1-前段 的原文实体是「`streaming_message_store` / `runtime_events_v4` 承不承载 V2 帧」。本庭对 `runtime_events_v4` 这个标识符做全仓解析，PuPu 全部 `.js` 中 **只有两处**（E-0006）：

| 实体出现处 | 边界声明条目 | owner |
|---|---|---|
| `electron/main/services/unchain/service.js:930` | `pupu:electron/**` | **`code-owner-electron`** |
| `src/PAGEs/chat/hooks/use_chat_stream.runtime_event_batching.test.js:24` | 依 [A-008](../../../codex/adaptations.md#a-008--co-located-测试随源文件归属) 随 `use_chat_stream.js` | `code-owner-chat-core`（已在名单内） |

后者是一条 **负向断言**：渲染层源码 **不得** 出现 `runtime_events_v4` 字面量。因此「流承不承载 V2 帧」这一问的判据 **结构上落在 Electron 侧**，而渲染层被测试明令不得知晓该词汇。缺该 owner 在场，Q1-前段 无法被回答。

**边界自愈信号 · 第 4 号（分类）**：**抽取写窄**，非边界写窄。`code-owner-electron` 的边界声明是 `pupu:electron/**`（整目录，2026-08-05 已因同类问题修正过一次），**覆盖正确**。缺陷同样在立案环节：`runtime_events_v4` 被当作概念名（"v4 事件流"）而非可解析标识符处理。**这是本案第三次同一成因的漏人**（前两次为 `code-owner-shared-arteries` 与 `code-owner-settings`），与 [A-010](../../../codex/adaptations.md#a-010--边界声明的可解析格式) 记录的第二类缺陷同源。

**调整后的传唤批次**

| 批次 | 角色 | 状态 |
|---|---|---|
| 1 | `code-owner-runtime` · `code-owner-chat-bubble` | 已发出 |
| 2 | `code-owner-chat-core` · `code-owner-shared-arteries` | 待发 |
| 3 | `expert-llm` · `code-owner-settings` | 待发 |
| 4 | `code-owner-electron` · `code-owner-agents` | 待发 |
| 5 | `expert-architecture` | 待发，**单独一批置于最后** —— 其鉴定须读到前四批的全部结论 |

**并案登记（供第三层门禁复核）**：`electron/preload/stream/unchain_stream_client.js` 与 `electron/main/services/unchain/service.js` 自本条起为已出现于庭审的实体，其 owner 已在名单内。

#### S-0005 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 登记 E-0007。本庭在 **证据审查职责** 内取得一项 Q10 直接相关的实测事实：`0000-0001-2026-0807#S-0005` 声明为「无法证否」的存量 `pupu_legacy` store，**在本机真实存在且非空**（473 MB，`operations` 表 1,387,400 行，`freelist_count = 0`）。本条 **不含任何实体立场**，取舍留给 owner
- **依据**: E-0007
- **不确定性**: E-0007 的四条完整性限制全部实质，逐条转录于本条正文。其中最要紧的是 **n = 1 且为 dev 机器** —— 本条 **不支持** 任何关于用户安装比例的推论，正反两个方向都不支持
- **请求/下一步**: 本条不作裁定。`code-owner-runtime`（Q10 的 owner）须在其 `ASSESSMENT` 中处置；若其 `ASSESSMENT` 已提交，由 `speaker-of-the-house` 于定向质询阶段以 `QUESTION` 追问
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T18:20:00-07:00
- **影响范围**: Q10 的已知缺口状态；S-0002 已知缺口第三条

**为什么由 `speaker-of-the-house` 取得这条**：它不落在任何 owner 的 **代码** 边界内 —— 它是一个 **运行时数据目录** 的观察，只能在本机取得，而各 owner 的取证都指向 repository。前案将其登记为「无法证否」的已知缺口后，**没有任何机制会去看一眼磁盘**。依 [`speaker-of-the-house` 角色职责 · 证据审查](../../../codex/roles/speaker-of-the-house.md)，本庭有权要求提供更多证据或进行进一步调查，本条即依该职责取得。

**本条把已知缺口从「无法证否」改写为「已在 n=1 上证实，外推性未知」**，两者对 Q10 的时序含义完全不同：前者允许「假定不存在，直接删」；后者不允许。

**三项事实转录**（正文与限制见 E-0007，此处不复制）：

1. 本机存在 `memory_v2.pupu-legacy-v4.20260805T005004Z/`，含 473 MB 的 `context_v2.sqlite3`，**无 owner json**；`meta.schema_version = 4`
2. 该 store 的 **全部内容表为 0 行，唯独 `operations` 为 1,387,400 行**；`freelist_count = 0` 证明这 473 MB 是 **实存数据**，不是删除后未 VACUUM 的空洞
3. 两个 store 的表集合 **不存在整体重合**，佐证「删除是弃用一个数据平面」的定性

**三条本庭明确不主张的**（防止本条被当成比它更强的东西引用）：

- **不**主张该 store 可以删除，也不主张不可以
- **不**主张用户安装中有多少比例存在同类 store —— n = 1
- **不**主张那 139 万行 `operations` 有价值或无价值；本庭 **未读取任何一行内容**

**并案登记（供第三层门禁）**：`~/Library/Application Support/PuPu/memory_v2/**` 与 `~/Library/Application Support/PuPu/memory_v2.pupu-legacy-v4.*/` 自本条起为已出现于庭审的实体。**这是一个运行时数据目录，不是 repo 路径，[A-009](../../../codex/adaptations.md#a-009--显式无-owner-清单) 的显式无 owner 清单未覆盖它。** 本庭 **不自行判定其归属**，将该问题作为 **边界自愈信号 · 第 5 号** 归档：产品运行时写出的持久化数据，其 owner 在现行边界体系中 **没有定义** —— 全部 `Code Owner` 的边界形式都是 repo 内的文件路径 glob。这一类实体今后每次出现都会重复卡住第三层门禁。**处方不在本案**，交 `codex` 与 `chief-judge`。本案内，写出与读取该目录的代码分属 `code-owner-runtime` 与 `code-owner-electron`，二者均在必到名单内，故 **本案不因此阻塞闭庭**。

**跨案转介（不在本案裁，登记以免灭失）**：current store 实测 `task_state_heads = 1`、`task_state_revisions = 1` —— 即 **unchain 平面上今天确实存在 pinned task state 数据**。`0000-0001-2026-0807#S-0005` 就 Q6 主张「`sqlite_read_v2` 没有 task-state 只读面」，那是 **读投影** 的缺失，与 **数据存在与否** 是两件事，二者不冲突。该观察交 `0000-0004-2026-0807`（Q6 的承接 case），**本案不予评价**。

#### S-0006 | ASSESSMENT | code-owner-chat-bubble → case
- **阶段**: 议案庭审
- **结论**: **本案的同案理由在渲染端不成立。** `Isolated` 在渲染端的词汇锚点 **一个都不在 Q10 的删除清单里** —— 事件类型词表的 canonical 定义在 `memory_v2_context.py:190-196`，active 平面的 `Isolated` 产点在 `unchain_adapter.py:938` 与 `:1132-1139`，三者均不在清单。**删掉那四个文件，渲染端一个词都不会失效。** 故选 **(a)**。另：Q1 的病不是「缺分层」—— 分层已是 **四个 status 面**；病是 **三个面共用同一套词**，且 **trace 行上根本不存在「失败」这个视觉**（`Isolated` 与 `Completed` 是同一个点、同一种颜色）
- **依据**: E-0008 ~ E-0015；跨案 `0000-0001-2026-0807#S-0005`、`#S-0006`；本案 E-0003, E-0004
- **不确定性**: (a) `unchain_adapter.py:1086` 的 `final_status` 取自 `worker_result.get("status")`，其值域是否真含 `"Isolated"` **未实测**，只证明 `:1132-1139` 的映射表为它保留条目，值域判定属 `code-owner-runtime`；(b) presenter 四态里 `Legacy` 二次复核仍不可达，但 **撤回** 此前「`Unavailable` 亦不可达」的判断，改为 **未核实**；(c) 本轮全为静态读取 + 单元测试，**没有在运行中的应用里看过任何一个 Memory V2 trace 行**，本机 `entries=0`，一切形态主张 **基于空态推演**；(d) **越界读了** `unchain_runtime/**` 六个 `.py` 用于交叉核对，那些结论不作主张，最终以 `code-owner-runtime` 为准
- **请求/下一步**: 请把 **「journal reload 投影管线迁出 chat-bubble」** 单列为 `code-owner-shared-arteries` 与本端之间的切片。它是 **Q1 立规格的前置条件** —— 不迁，任何词汇规格都会有两个实现点，其中一个的 owner 从未声称拥有词汇
- **评估结论**: 见下（形态建议部分已就地标注 OPINION）
- **边界命中依据**: `pupu:src/COMPONENTs/chat-bubble/**`。取证落在 `trace_chain.js:28/31-33/545/1747/1928-1990/1941/1949/1950/1961-1963/1969/1980` · `memory_v2_journal_reload.js:10-30/123-132/134-168/272/309/319/366/377/389/404/412-432/434-498/513-549/568-572` · `memory_v2_trace_audit.js:267-361/378-421` · `memory_v2_pending_reviews.js:519/529/947-954/1046-1050` · `chat_bubble.js:107-110` · `lazy_trace_chain.js`。co-located 测试依 A-008 归本端。**子目录零命中**：`interact/`、`artifact-summary/`、`hooks/` 内 `memory` 零引用 —— 本案在本端 **只触及 trace chain 一条线**。

  **边界更正 —— 确认，不反驳。** `memory_v2_trace_presenter.js` 不在本端边界内，归 `code-owner-shared-arteries`；本端与它的关系只是 `trace_chain.js:28` 的一行 `import`，**从未编辑过它**。S-0002 的自愈信号 1 分类正确。**但要加一句该信号没写到的**：真正的问题不是它被归错了人，而是 **它的职责今天有一半在本端边界里重复实现**（见分界线第 3 节）。

- **受影响对象**: **Q1 / Q1-前段 / Q9 落在本端；Q10 不落在本端（但本端是它的下游证人）**

  | 编号 | 落位 | 本端对象 |
  |---|---|---|
  | **Q1** | 落在本端（呈现半） | `trace_chain.js:1928-1990` 两行构造；`memory_v2_trace_audit.js` 全部 KV 行；`memory_v2_journal_reload.js` 的第二条投影管线与其自有状态轴 |
  | **Q1-前段** | 落在本端（作为消费方，非裁定方） | 本端 **不驱动流**，只回答「今天承不承载」：**不承载，零帧**（E-0011） |
  | **Q9** | 落在本端，且本端是 **用户可见文案的主要落点** | `trace_chain.js:1969`、`memory_v2_pending_reviews.js:519/529/949` 四处硬编码字面量 + 5 条活测试断言 |
  | **Q10** | **不落在本端** | 四个待删文件全在 `unchain_runtime/**`。本端只作「删除后 trace 上会发生什么」的第一手证人 |

  需新增（Q1，全在本端，无跨 owner 依赖）：`Isolated` / `Failed` 的失败点渲染（复用 `trace_chain.js:545` 的 `ErrorPoint`）；两个 status 面的词汇去重。需迁出（跨 owner）：`loadCanonicalMemoryV2Journal` + `mergeMemoryV2AuditWithJournal` → `src/SERVICEs/runtime_events/`。需产帧端配合：`(status, worker_status)` 二元组的语义归一；`candidate_count` 的透出。

- **约束**:
  1. **单向契约不变。** 只读 `message.meta.bundle` 与 `contextV2Bridge`，永不反向驱动流。**同意 `0000-0001-2026-0807#S-0006`**，请裁定写明，否则本端会被要求渲染拿不到的数据
  2. **加词不是零成本 —— 必须进裁定。** `memory_v2_journal_reload.js:424-432` 的 `runStatusRank` 是硬编码小写终态闭集 `["completed","complete","failed","isolated","noop"]`，未知词返回 `0`，而 `pending` 是 `1`；`mergeRuns`（`:434-481`）用它判 journal 是否比 bundle 新。**后端任何新增终态词，若不同步改这张表，journal 的新终态会输给 bundle 的旧 `Pending`，那条 run 永远卡在 Pending**（E-0010）
  3. **删词是零告警的。** `CURATOR_EVENT_TYPES`（`:22-30`）是闭集；后端停发某类事件 → `projectCanonicalEvent` 返回 false → `agentRuns` 空 → `Memory Agent` 整行 **不渲染**。不崩、不报错，**且测试不会红** —— `trace_chain.memory_v2.test.js:28-43` 把 `context_v2_bridge` 整个 mock 掉，21 条全部喂合成 fixture（E-0013）。**任何拿「测试全绿」当删除安全性证据的方案，本端预先反对**
  4. **不得为 Q1 去改 `BUILTIN_COMPONENTs/timeline/**`。** Timeline 契约只有 `done|active|pending`（`timeline.js:742`），本面既有失败约定是自定义 `point`（`ErrorPoint`）。走这条路 `code-owner-ui-primitives` 的未命中判定继续成立；走加第四态那条路，它会被拖进来
  5. **渲染层不自造语义词汇。** 本端今天有两处违反：`trace_chain.js:1962-1963` 的活跃词表、`memory_v2_journal_reload.js:123-132` 的事件类型→状态映射。修正方向是收回产帧端 / presenter
  6. **本轮只读，未改任何产品代码，未 commit。** 唯一写入是 `.claude/agent-memory/code-owner-chat-bubble/` 两份记忆文件（该目录 git 已跟踪，工作树会带这两处变更，特此披露）

- **建议处置**:

  **一 · 核心问题：(a) 先定 trace 词汇，再删旧实现**

  理由不是「先定词汇更稳妥」，是 **本庭的同案前提在渲染端经不起核对**。`0000-0001-2026-0807#S-0005` 的 **产点计数正确，推论不成立**（E-0008）：

  1. 事件类型词表的 canonical 定义在 `memory_v2_context.py:190-196`，与本端 `memory_v2_journal_reload.js:22-30` 的 7 条 **逐字一致**。该文件 **不在删除清单**（清单里是 `memory_v2_context_adapter.py`，实测为两个不同文件，175339 B vs 29112 B）
  2. active 平面的 `Isolated` 产点在 `unchain_adapter.py`：`:938` 的 capture-not-complete 分支 **位于 `from memory_v2_curator import ...`（`:960`）之前**，不依赖该模块；`:1132-1139` 的 `final_status → event_type` 映射表同样在 `unchain_adapter.py`。两处 **均不在清单**
  3. `memory_v2_curator.py:450/479/504/919` 四处 **只贡献 `"status": "Isolated"` 字符串字面量**，不定义词表、不定义映射。它们消失只让该词的 **观测值域收窄**，不让任何渲染分支失效

  - **(c) 同案同落 —— 反对。** Q10 自带一个依本案 `FRAMING` 已知缺口 **无法证否** 的前置。把一个成本在本端、完全可做的渲染词汇修复捆进去，等于让它继承一个不可闭合的前提。**这不是审慎，是把便宜的事挂在贵的事后面**
  - **(b) 先删再定词 —— 反对，且比 (c) 更差。** 删除会移走 `memory_v2_curator.py:450/479/504/919` 四处 `reason` 的产生场景。立规格时需要知道 `reason` 的 **实际取值分布**（今天渲染在 `memory_v2_trace_audit.js:408`，是 `Isolated` 唯一携带的解释）。**先删就是先把样本删掉再去设计怎么呈现样本**
  - **(a) 采纳，附一条硬条件**：**规格必须写在 `memory_v2_context.py:190-196`（事件类型）与 `unchain_adapter.py:1132-1139`（状态→事件映射）之上，不得读 `memory_v2_curator.py` 写。** 若规格是照着 curator.py 写的，(a) 立刻变成错的。**请把这句写进裁定 —— 它是 (a) 成立的全部条件**

  **二 · Q1 实体回答：不够。但缺的不是「分层」——分层已经有四层。**

  **部分修正** `#S-0005` 的「现被拍平在同一条 trace 上」：在渲染端不是拍平，是 **四个并列的 status 面**（E-0009）——

  | 面 | 落点 | 词汇 | 回答什么 |
  |---|---|---|---|
  | presenter 轴 | `trace_chain.js:1941`、`memory_v2_trace_audit.js:317` | Complete / Partial / Legacy / Unavailable | trace bundle 完不完整 |
  | **journal reload 轴** | `memory_v2_journal_reload.js:568-572`（源 `:272/309/366/377/389/404`） | **Complete / Partial / Unavailable** / Loading | 渲染层自己那次 journal 重读跑没跑完 |
  | curator 轴 | `trace_chain.js:1969`、`memory_v2_trace_audit.js:393` | Completed / Failed / **Isolated** / NoOp / Running / Pending | 整理任务的结局 |
  | 决策面 | `memory_v2_pending_reviews.js:947-954` | N to decide / N awaiting Memory Agent / 空态 | 有几条在等你拍板 |

  **病 1 · 词汇碰撞（最严重，完全在本端）。** 第 1 与第 2 个面 **共用 `Complete` / `Partial` / `Unavailable` 三个词，指两件完全不同的事，并且同时渲染在同一个展开面板里**（`memory_v2_trace_audit.js:317` 与 `:354` 相隔 37 行）。**用户展开一次会读到两个 "Partial"。** 不是缺分层，是分层做了、词没分。佐证：`Unavailable` 在 presenter 轴上可能不可达（未核实），在 journal reload 轴上 **确定可达**（`:516-530`）—— 同一个词，一个轴上是死分支，另一个轴上是活路径。

  **病 2 · trace 行上不存在「失败」这个视觉。**（E-0010）`timeline.js:742` 的 item 契约只有 `"done"|"active"|"pending"`，`resolveLineColor`/`resolvePointColor`（`:34-48`）也只分三支 —— **原语层没有失败态**；`trace_chain.js:1962-1963` 的活跃词表是 `["Pending","Running","Leased"]`，**`Isolated` 与 `Failed` 都不在里面**，于是 `:1980` 判成 `"done"`。**净效果：`Memory Agent · Isolated`、`· Failed`、`· Completed` 三行是同一个点、同一种颜色、同一条线。**

  > 这把 `0000-0001-2026-0807#S-0006` 的 Q4-C 落到了像素上：**不是「没有界面」，是有界面而且它长得像成功。** 这条比 Q1 的态数问题靠前 —— **加再多状态种类，只要它们都渲染成绿点，就没有增加任何信息。** 修法在本端，不需要动 ui-primitives：`trace_chain.js:545` 的 `ErrorPoint` 就是本面既有失败约定（`:1747` 的 error 帧在用）

  **病 3 · 没有任何一层回答「我的记忆存下来了吗」。** `Memory V2 · Complete` 的语义是「trace bundle 完整」（`resolveTraceStatus:162-196`：active 且无 error 即 Complete，**哪怕一条 entry 都没写**）；`Memory Agent · Completed` 是「整理任务跑完了」，也不是「有东西被记住」。缺的是 **结果层**。**而结果层的数据后端已经在产并已进 bundle：`candidate_count`**（`unchain_adapter.py:641-647` 出到 trace summary，`:1107` 赋值，随 `:956/:1149` 进 bundle），**`src/` 全域零命中**（E-0015）。**这是继 `worker_status` 之后第二个产出即丢弃的字段，且比 `worker_status` 更接近用户的问题。** 同批被丢的还有 `proposal_count` / `enqueue_status` / `input_refs` / `model_source`。

  **噪音判断（OPINION）**：`Legacy` 是确定的噪音，规格里应直接删掉这个词 —— 二次复核仍不可达（E-0014）；`Undo metadata` 行（`memory_v2_trace_audit.js:416`）是一坨 `JSON.stringify` 塞进 KV 行，给开发者看的。**更大的一句标为参考**：整个展开面板（sha256、原始 `pupu://` ref、error code、JSON diff）读起来是 **审计面**，不是用户面 —— 「审计面该不该长在用户可见的 trace 上」**归 `0000-0003-2026-0807`**，本案不展开。

  **三 · `worker_status`：本端不要它，但后端不该停止产出。**

  它承载的区分有价值，形状没有。后端产的是一对二元组（`:1086-1092` 与 `:1109-1115`），值域重叠但不相等（都可能是 `"Pending"`）。`status="Pending" + worker_status="NotScheduled"`（排了队但什么都没跑）与 `+ "Pending"`（真在跑）是两件事，**今天都渲染成 `Memory Agent · Pending`**。区分是真的，值得表达；但把第二张重叠词表并排渲染，是在病 1 上再加一层，而且「worker 有没有被调度」不是用户的问题。

  **处置（提议，非要求）**：请 `code-owner-runtime` 在 `_memory_v2_curator_trace_summary`（`unchain_adapter.py:588-666`）内 **把 `(status, worker_status)` 归一成单一终态词**，让 `NotScheduled` 成为一等状态词，而不是让渲染端解释元组。**同时明确：后端不要删掉 `worker_status` 字段本身** —— 它已被 `_memory_v2_persist_audit_event`（`:947/:1140`）写进 durable 审计事件，那是审计事实。**它该消失的位置是 trace summary 的投影，不是 journal。**

  **丢弃点有两个，一个在本端、一个不在**（E-0015）：`memory_v2_trace_presenter.js:301-348` 的 `presentAgentRun`（`code-owner-shared-arteries`）与 `memory_v2_journal_reload.js:134-168` 的 `curatorRunFrom`（本端）。**两处都要改才叫「接上」，只改一处会造成 bundle 路径与 journal 路径显示不一致。请裁定带上这一句。**

  **四 · Q1-前段：流今天不承载 V2 帧，零帧。**（E-0011）

  `grep -n "memory" src/SERVICEs/streaming_message_store.js` → **0**；`src/SERVICEs/runtime_events/*.js`（排除 presenter 自身与 `.test.js`）grep `memory_v2|memoryV2|memory\.` → **0**（`activity_tree` / `event_store` / `trace_chain_adapter` / `stream_replay_projector` / `runtime_event_stream_gate` 全部零命中）。

  V2 数据到本端 **只有两条路，都不是流**：(1) `message.meta.bundle.memory_v2` —— **终局帧独家**，挂载门 `chat_bubble.js:107-110`，故 Memory V2 节点是 **回合结束后凭空出现的审计块，不是过程信号**；(2) `contextV2Bridge.listEvents` —— renderer 主动拉取（`memory_v2_journal_reload.js:319`），且 **只在用户展开 Memory V2 行时才跑**（`trace_chain.js:1950` 的 `unmountDetailsWhenClosed: true`，全仓唯一使用者）。

  **结论与请求**：**支持** 把 Q1-前段与 presenter 议题绑定裁决。但请裁定 **把问题问对** —— 不是「流该不该承载」，而是：**Memory V2 的整理结果是一个「回合内的过程信号」还是一个「回合后的审计块」？** 今天的实现已经选了后者。**若产品要的是前者，才需要流承载新帧，才是跨面契约变更，才强制 Full track；若要的是后者，Q1 一帧都不用加，全部工作在本端与 presenter 两个文件里。这个岔路目前没人问过，而它决定 Q1 的成本差一个数量级。**

  **五 · Q9：用户可见文案的落点在本端 —— 认领，并更正 `FRAMING` 已知事实第 4 条。**

  `FRAMING` 记载「`src/locales/` 命中为零…须先由某个 owner 指出用户可见的 "Memory Agent" 字样渲染在何处」。**本端就是那个 owner。目标存在，四处，三处在本端边界内**（E-0012）：`trace_chain.js:1969`（`Memory Agent · {status}` trace 行标题）· `memory_v2_pending_reviews.js:519`（`Awaiting Memory Agent` 卡片标题）· `:529`（`The Memory Agent curates this proposal before anyone can decide it.` 整句用户面说明）· `:949`（`${n} awaiting Memory Agent` 计数标签）。第五处 `src/SERVICEs/memory_agent_settings.js:24` 的 `DEFAULT_MEMORY_AGENT_DISPLAY_NAME = "Memory Agent"` 在 `code-owner-settings` 边界内，本端只定位、不主张。

  **故 `#S-0005` 的 Q9 建议第一项要作两处更正**：(1) **归属错了** —— 用户可见文案不在 `src/locales/**`，而是 **硬编码英文字面量在 `chat-bubble` 里**；`src/locales/` 零命中是真的，但结论相反 —— **不是「没有目标」，是「目标没走 i18n」**；(2) **不是零风险，是零外部风险** —— **5 条活测试断言钉住这些字面量**（`trace_chain.memory_v2.test.js:140/268/275/279/844`），依 A-008 全在本端边界内，改名当天必须同步改。

  **意见：Q9 文案部分判「可以做，本端成本明确」，但不要现在做** —— 理由不是成本，是它会撞上议案自带约束（见 U-5）。

  **Q9 识别符部分**：本端只有 4 个（`key: "__memory_agent_audit__"`、三个 `data-testid`），**三个 testid 在 `chat-bubble` 之外零消费者**（E-0013，含 `e2e/`），故本端识别符改名 **是纯局部的**，与 `#S-0005` 判「不做」的后端四类契约 **不是同一件事，不该被同一个「不做」覆盖**。**不反对** 后端判「不做」，只要求裁定别把两侧写成一条。

  **六 · Q10：不落在本端 —— 但给它一条只有本端能给的证词。**

  **删掉那四个文件，trace 上会发生什么：什么都不会发生。** 不崩、不报错、行不消失（`Isolated` 仍由 `unchain_adapter.py:938` 在 active 平面产出）、测试全绿。**这正是问题所在** —— Q10 的删除在渲染端 **回归面为零可观测**。**任何以「跑一遍 trace 相关测试确认没坏」为验收的方案，在本端验的是空气。** 若方案庭审要本端给验收标准，现在就说：**只有在运行中的应用里、在一个真实产生过 curator 事件的会话上，人眼看过一次 trace，才算验过。单元测试在这条路径上不具备证明力。**

  **七 · 分界线：presenter 拥有什么，渲染拥有什么**（第三层集合差可直接引用）

  **1 · 线画在 `presentMemoryV2Audit()` 的返回对象上。** `src/SERVICEs/runtime_events/` 拥有 **从原始 bundle 到那个对象的一切**：哪些 key 允许通过（`TOP_LEVEL_KEYS:9-69`）、脱敏（`BLOCKED_KEY_PATTERN:6-7`、`sanitizeNode:94-122`）、深度与长度封顶、ref 的 URI 词汇与正则（`REF_PATTERNS:71-78`），**以及全部语义归一**（`resolveTraceStatus:162-196`、`agentRunSources:280-299`、`presentAgentRun:301-348`）。**词汇表是它的。** `chat-bubble` 拥有 **拿到那个对象之后的一切**：分成几行、行标题文案与措辞、点/颜色/`done|active|pending`、展开与卸载策略、KV 行标签与顺序、空态文案、`RefReader` 分页读取交互、以及这些行与工具行的相对位置。

  > **一句话版本**：**`presentMemoryV2Audit()` 返回对象的字段名与取值是 presenter 的，字段怎么变成像素是 `chat-bubble` 的。**

  **2 · 按这条线，今天有两处判定放错了位置（在本端，本端认）**：`trace_chain.js:1962-1963` 的活跃词表（应由 presenter 给 `run.isTerminal` / `run.isFailure` 布尔）；`:1949` 的 `status === "Unavailable" ? "pending" : "done"`。

  **3 · 最重要的一处：`memory_v2_journal_reload.js` 是一条完整的第二投影管线，长在本端边界里。** 它做了 **本该属于 presenter 的全部事情**：事件类型词表（`:22-30`）、状态归一（`:123-132`）、run 字段集归一（`:134-168`）、ref 正则（`:10-21`，**与 presenter 的 `REF_PATTERNS:71-78` 逐条重复定义**）、终态排名（`:424-432`）、与 presenter 结果合并（`:483-498`）。**后果具体：同一套词汇在两个 owner 的两个文件里各写一遍，任何后端词汇变更必须同时改两处，而只有一处的 owner 声称拥有词汇。`worker_status` 被丢两次、`candidate_count` 被丢两次，都是这个结构的直接产物。** 建议整体迁到 `src/SERVICEs/runtime_events/`，`chat-bubble` 只留展示组件。

  **八 · 本案范围内、`case.md` 与 `FRAMING` 未列出的未决项（U-1…U-8）**

  - **U-1** 「trace 上不存在失败态」比「Q1 缺几个状态」靠前。完全在本端、无跨 owner 依赖，是本案 **收益成本比最高** 的一项
  - **U-2** 词汇在两个 owner 的两个文件里重复定义 —— **Q1 的前置条件**，`FRAMING` 未列
  - **U-3** `runStatusRank` 的未知词降级是 **静默 finality bug**，把「Q1 加个状态词」从零成本变成有成本且有静默失败模式，必须写进裁定约束
  - **U-4** 「Memory Agent」用户可见文案的落点已找到，归属与风险都与 `#S-0005` 记载不同 —— **闭合了 `FRAMING` 已知事实第 4 条留下的公开问题**
  - **U-5**（**跨界提示，标注为参考，不计入本端结论**）**Q9 的改名会让议案自带约束在改名当天变成空断言。** `workflow_list.test.js:144` 断言 `queryByText("Memory Agent")` 不在 agents 面上 —— 这是 Q9 自带约束今天唯一的强制点（本案 E-0003）。**若 Q9 把本端四处文案改成新词，该测试仍只断言旧词的缺席，约束当天失效。** 处置属 `code-owner-agents`。**这条 `FRAMING` 与三条边界自愈信号都没看到**
  - **U-6** `worker_status` 不是孤例。`candidate_count` / `proposal_count` / `enqueue_status` / `input_refs` / `model_source` 在 `src/` **均零命中**。`_memory_v2_curator_trace_summary` 产 14 个字段，渲染端消费约一半。**Q1 该裁的不是「要不要 `worker_status`」，是「这张投影表的字段集由谁定、按什么标准定」—— 今天没有任何一方在做这件事，字段是各自加的**
  - **U-7** **展开一行会改变另一行的标题。** journal 合并只在用户展开 Memory V2 行之后发生（`trace_chain.js:1950` + `memory_v2_journal_reload.js:513-549`），而合并结果喂给 `Memory Agent` 行标题（`:1928-1935` → `:1969`）。**同一条消息的 `Memory Agent · X` 会在用户展开另一行之后变成 `· Y`。** 在本端边界内，**没有设计过**。`Isolated` 本身不受影响（两条路径都带）；受影响的是只进 journal、不进 bundle 的 curator 事件 —— 哪些属这一类是 `code-owner-runtime` 的判定，本端未穷举
  - **U-8** `Legacy` 应从 presenter 词汇里删除（E-0014）。这是 Q1「哪些是噪音」唯一一条有实证的答案

  **九 · 越界内容清单（不计入本角色结论）**：审计面板是否该长在用户可见 trace 上 → `0000-0003-2026-0807`（`expert-ux`）· `workflow_list.test.js:144` 断言词同步 → `code-owner-agents` · `_memory_v2_curator_trace_summary` 字段集与二元组归一 → `code-owner-runtime` · `presentAgentRun`/`presentMemoryV2Audit` 任何改动 → `code-owner-shared-arteries` · `runtime_events_v4`/`streaming_message_store` 是否新增 V2 帧 → `code-owner-chat-core` 与 `code-owner-shared-arteries`

#### S-0007 | ASSESSMENT | code-owner-runtime → case
- **阶段**: 议案庭审
- **结论**: 本轮取证 **推翻了 Q1 的一个隐含前提**。Curator 的 `Isolated` 轴 **不是「后端另产的一条正交轴」，而是「后端在另一条数据平面上产的唯一一条轴」** —— 整条轴（`memory_agent_runs` / `memory_curator` / `Isolated` / `worker_status` / `memory.curator.*` 审计事件）被三个 fail-closed 门锁死在 **active bridge 缺席** 的那一侧，即 Q10 要弃用的 `pupu_legacy` 平面。**发布配置（V2 active）下这条轴产出为零。** 故核心问题答案是 **(c)**，理由比 `FRAMING` 给的强得多：不是「规格会挂在待删代码上」，是 **删完之后这条轴没有产出者了，规格无处可挂**
- **依据**: E-0016 ~ E-0023（含一个可复现探针脚本）；跨案 `0000-0001-2026-0807#S-0005`、`#E-0002`；本案 E-0002, E-0004
- **不确定性**: 前案 `#S-0005` 三条不确定性中 **(b) `pupu_legacy` 存量安装无法证否本轮仍未证否**，Q10 时序仍直接依赖它；(a) 本轮未再测（不在本案范围）；(c) 渲染取舍仍越出本端边界。**本轮新增一条自我更正**：`#S-0005` 说「6 个 `Isolated` 产点」，**数错了，是 5 个** —— 字面量 `"status": "Isolated"` 赋值全后端 5 处，4 处在 `memory_v2_curator.py`；第 6 处是把 `unchain_adapter.py:1135` 的 status→event_type **映射表** 当成了产点，它是路由不是产出。**更正后比例是 4/5 而非 4/6，对本案论点是加强不是削弱**。另：`memory_v2_unchain_worker.py` 不写 diagnostics / 审计事件 一条是 **负向 grep**（覆盖 `update_diagnostics` / `persist_audit` / `append_event` / `journal` 四个 token），若 active 平面经未搜到的第五条路径产遥测，该结论要打折
- **请求/下一步**: 请把 **E-0016（Curator 门链）交 `expert-architecture` 与 `code-owner-shared-arteries` 对质**。它决定 Q1 到底是「呈现问题」还是「**active 平面缺一个产出点**」—— 本端认为是后者，而那是一个 **交付物**，本案至今没有任何一问指向它
- **评估结论**: 见下逐问
- **边界命中依据**: `pupu:unchain_runtime/**`。取证落点：`unchain_adapter.py`（`:271-282` · `:623-666` · `:902-958` · `:960-1151` · `:1132-1139` · `:1154-1166` · `:7425/7528-7555/7565-7590/7605/7729` · `:9645/10433/11177`）· `memory_v2_curator.py`（`:418-508` · `:32/167/1140` · `:793/910/1090/1181/1216`）· `memory_v2_context.py`（`:190-196` · `:4298-4300` · `:4774-4779`）· `memory_v2_context_adapter.py`（`:26` · `:665-682`）· `memory_v2_workspace_adapter.py` · `memory_v2_context_reference_policy.py:21` · `memory_v2_task_state_adapter.py:11` · `memory_v2_store_boundary.py:96` · `memory_v2_unchain_agent_factory.py`（`:36/43/53/73-75/135/242/274`）· `memory_v2_unchain_ownership_adapter.py:1-11` · `memory_v2_unchain_worker.py` · `memory_v2_unchain_active_bridge.py` · `tests/export_memory_v2_contract_fixtures.py:41-51/517-533`。

  **越界读取，仅用于「本端产的东西到不到得了对面」的落差核算**（结论标 **参考**，不计入本端定论）：`memory_v2_trace_presenter.js`（shared-arteries）· `memory_v2_journal_reload.js` / `trace_chain.js` / `memory_v2_pending_reviews.js`（chat-bubble）· `memory_agent_settings.js`（settings）· `electron/main/services/unchain/memory_v2_rollout.js:150`（electron）

- **受影响对象**:

  | 问 | 落位 |
  |---|---|
  | **Q1** | **产帧端全部落在本端**，且本轮结论是产帧端有一个 **结构性缺口**，不是词汇缺口 |
  | **Q1-前段** | **不落在本端**。但出一条对该问有决定性的服务端事实：**帧上已经承载了，而且承载的比对面收的多**（E-0017） |
  | **Q9** | **后端半落在本端**；renderer 半不落在本端。本庭 §8 的挑战 **接受并撤回原建议** |
  | **Q10** | **全部落在本端** |

  **Q1 — 产帧端实况（本案最重要的一条）。** `FRAMING` 的表述「后端另产一条与 presenter 四态正交的轴」**预设了两条轴同时在产。实测不是。**

  Curator 轴的 **三个调用点全部带同一个门**（E-0016）：`unchain_adapter.py:9645`（`if graph_active_bridge is None and not output_holder.get("suspended")`）· `:10433`（`if active_context_bridge is None`）· `:11177`（同）→ `_finalize_memory_v2_curator(...)`。而 active 侧由 **三处 fail-closed raise** 保证 bridge 必非 None：`:7551-7554`（preflight 为 None → raise）· `:7565-7568`（is_active 但无 shadow run → raise）· `:7587-7590`（bind 回 None → raise）。`:7729` 挂上 agent，`:10127-10131` / `:10835-10839` 读回。

  **推论（可复现）**：`memory_agent_runs` 全后端 **只有两个产点**，`unchain_adapter.py:956` 与 `:1149`，两个都在 `_finalize_memory_v2_curator` 体内；`memory.curator.isolated` 审计事件同理（`:947`、`:1140`）。

  > **即：V2 active 配置下，trace 的 Memory Agent 那一行拿到的是空数组，`memory_v2_journal_reload.js:130` 的 `Isolated` 映射永不触发。** active 平面自己的 memory agent 走 `memory_v2_unchain_worker.py`（由 `memory_v2_unchain_runtime_factory.py:30` 与 `memory_v2_unchain_graph_root_completion.py:17` 装配，`unchain_adapter.py:7546-7549` 传 `memory_agent_enabled=True` + invoker factory）—— **该文件不写 diagnostics、不写审计事件**（E-0018，负向 grep）。

  **这把 Q1 从「呈现该怎么分层」改写成一个更前面的问题**：active 平面有一个真的在跑、真的花 token、真的可能失败的 Memory Agent，**它今天不向 trace 说一个字**。`Isolated` / `worker_status` 是 `pupu_legacy` 平面的遗物。**「缺的是分层」这个判断维持**，但要加一句：**分层的下面那一层，在发布配置里今天是空的。先定分层再补产出者，等于先画表格再问数据从哪来。**

  **次级发现 —— `Isolated` 本身就是一次拍平**（E-0019）。`memory_v2_curator.py:430-508` 的产点对应四种 reason：`not_root_run`（这是 subagent run，**本来就不整理 —— 正常，不是失败**）· `root_run_cancelled`（用户按了 Stop）· `root_run_failed`（真失败）· `capture_<X>` / `capture_unavailable`（`:484-508`，另 `unchain_adapter.py:936-946` 同形早退，真失败）。**`not_root_run` 和 `root_run_failed` 今天是同一个 status。** 唯一区分器是 `reason`，而 `reason` 恰好能到 renderer（E-0017 探针实测 `agentRuns[0].reason === "capture_partial"` 存活）。**故这一层不需要新契约，需要的是别再把 `reason` 当自由文本** —— 若 Q1 要立词汇，`reason` 取值集合应固化并入契约，**这一条落本端，本端接**。

  **Q1-前段 —— 不裁落位，但出一条决定性事实：帧上已经承载了，问题在收端。** `memory_v2_bundle_payload`（`memory_v2_context.py:4774-4779`）**原样返回 `admission.diagnostics()`，不过滤不改名**。故 `_memory_v2_merge_diagnostics` 写进去的每个 kwarg 就是帧里 `bundle["memory_v2"]` 的顶层键。本端共产 **7 个顶层键，presenter 的 60 项冻结白名单 `TOP_LEVEL_KEYS` 只收其中 1 个**（E-0017，node 探针实测）：

  | 本端产的键 | 产点 | 探针结果 |
  |---|---|---|
  | `memory_agent_runs` | `:956` `:1149` | **保留** |
  | `memory_curator` | `:955` `:1148` | 丢弃 |
  | `long_term_recall` | `:449` `:572` | 丢弃 |
  | `unchain_context_status` / `_error_code` | `:7458-7459` `:8411-8412` | 丢弃 |
  | `unchain_shadow_status` / `_error_code` | `:7467-7468` `:8558-8565` | 丢弃 |

  **同一个探针还测出一件更该被裁的事**：喂一个「root run 正常完成、但整理被 `Isolated`」的真实 bundle，**presenter 顶层 `status` 解析为 `Complete`，`reason` 为空串，而 `agentRuns[0].status` 是 `"Isolated"`**。两条轴不只是并存 —— **它们在同一屏上互相矛盾，而说话大声的那条说「一切正常」**。因为 `resolveTraceStatus`（presenter `:162-196`）的显式分支只认 `complete/completed/partial/failed/error/legacy/unavailable`，**`Isolated` 一个都不匹配**，遂掉到启发式，最后命中 `:195` 的 `mode === "active" → "Complete"`。

  > **参考（越界，不计入本端结论）**：这不是「presenter 状态种类不够」，是 **两侧各维护一份键表、无共享来源、无测试比对**。`unchain_runtime` 加键默认到不了 UI。**Q1 若只在 presenter 侧加状态，下一次仍会漂。** 真正的裁点是「memory_v2 帧的顶层键表由谁持有」—— 该问题目前无人提出，建议交 `expert-architecture`

  **Q9 — 后端半。** 前案四类契约分类 **维持**（payload key / durable namespace / 错误码词汇表 / prompt 常量），体量 12 个非测试文件、620 处命中亦维持（本案 E-0002 证明 `unchain_runtime/` 自 `14ca3ccc` 零变更，计数仍有效）。**新增两条实测**：

  - **Q9-新1 · 产品今天就有两个名字，一边一个**（E-0020）。renderer 默认 `src/SERVICEs/memory_agent_settings.js:24` `DEFAULT_MEMORY_AGENT_DISPLAY_NAME = "Memory Agent"`；**后端默认** `memory_v2_curator.py:1140` `display_name=sanitized_config.get("displayName", "Memory Curator")`。线上路径：`memory_agent_settings.js:40` → `use_chat_stream.js` 的 `memory_agent_config.displayName` → `memory_v2_curator.py:32`（四键白名单）→ `:167`（长度上限）→ `:1140` → `memory_v2_unchain_agent_factory.py:53/73-75/135/242`。**即：renderer 送了就叫「Memory Agent」，没送就叫「Memory Curator」，而这是一个会显示给用户的 display name。** 这条 **比命名债务更该修 —— 它是行为不一致不是可读性**
  - **Q9-新2 · `Isolated` 在本端有两个不相干的含义**（E-0021）。Curator 状态 `"Isolated"`（`memory_v2_curator.py:450/479/504/919`）＝「这一轮的候选被隔离、没整理」；`PupuRawIsolatedMemoryAgent`（`memory_v2_unchain_agent_factory.py:43/136/237/274`，docstring `:44`，另 `:36` "could not create an isolated Memory Agent"）＝「一个不挂工具面的裸 Agent」。两者都在 Memory V2 子系统内，**其中一个是用户可见的 trace 状态词**。Q1 若要固化 trace 词汇，**必须同时处置这个同词异义**，否则词汇表刚立就有歧义。**这是两问之外的第三处耦合，`FRAMING` 未列**

  议案自带约束：`unchain_runtime/**` 不产 Builder 卡片、不产 recipe 节点，本端任何清理都不可能触发该约束。维持前案判断。

  **Q10 — 全部落在本端。前案三条更正全部复核成立，第三条要加重。**

  - **更正 1 维持**：`memory_v2_store_boundary.py:96` 环境变量缺失时返回 `pupu_legacy`；Electron 只发二值 `off | unchain`（`memory_v2_rollout.js:150`）
  - **更正 2 维持并加强**：分流点 `unchain_adapter.py:7605`
  - **更正 3 维持并加重**：`memory_v2_workspace_adapter.py` 的非测试引用者仍是三个，**只有一个在清单内** —— `memory_v2_context_reference_policy.py:21`（不在清单）· `memory_v2_context_adapter.py:26`（在清单）· `memory_v2_task_state_adapter.py:11`（不在清单）。`tests/export_memory_v2_contract_fixtures.py` 的破坏面 **比前案所述更大**：`:41` `from memory_v2_curator import MemoryV2Curator`（**硬 import 清单内文件**）· `:47` / `:51` / `:521` 三处路径写死。**按清单删会让 contract fixture 导出在 import 阶段就崩，不是运行时崩**
  - **Q10-新1 ·「删除 = 弃用一个 store owner」这个更正还不够，要再更正一次。** `memory_v2_curator.py` **不只是 pupu_legacy 平面的实现，它是当前全产品唯一的 memory-agent trace 产出源**。删它的后果不是「pupu_legacy 用户没了 Curator」，是 **trace 上的 Memory Agent 那条轴从「只有 legacy 有」变成「谁都没有」**。**这是本案至今没人说出口的那一半**
  - **Q10-新2 · 四态里的 `Partial` 也有一个产点在待删文件里。** `memory_v2_context_adapter.py:665-682` 的 `mark_partial` 产 `journal_status: "partial"` + `persistence_degraded` + `persistence_error_code`，**三个键都在 presenter 白名单内**，是四态里 `Partial` 真正走得通的路；另一个产点在 `memory_v2_context.py:4298-4300`（**不在清单内**）。**故：删 `memory_v2_context_adapter.py` 不会让 `Partial` 消失，但会拿掉它两个产点里的一个。耦合不止在 `Isolated` 轴上，四态本身也被待删清单碰到了 —— `FRAMING` 只说了 `Isolated`**
  - **六步意见维持前案**，唯一改动：第 1 步「等 canary」前案判「过度保守」，**现改判「理由不对，但结论要留」** —— 不该因为 canary 而等，但应该因为 **active 平面的 memory-agent 遥测产出者尚不存在** 而等。**这是一个真前置，且是一个交付物**

- **约束**: 前案 `#S-0005` 七条 **逐条维持**（`.py` 改完须重启 sidecar / 不得把写能力仓储塞进读路由 / lock 同步 / `ResourceRef` 不越界 / prompt 常量属 `expert-llm` / 删前先 rebuild GitNexus / 后端 focused 基线 `49 passed, 3 subtests passed`）。基线仍有效，本案 E-0002 证明 `unchain_runtime/` 零变更，**无需重跑**。**新增四条**：

  1. **任何「后端已经在产 X」的主张，必须同时说明是哪条平面。** 默认答案是 `pupu_legacy`。Curator 轴、`Isolated`、`worker_status`、`memory.curator.*` **全部只在非 active 侧产**。**这条应写进裁定正文**，否则后续每一轮都会重犯同一个误读
  2. **不得在不同步改 presenter 白名单的前提下，往 `_memory_v2_merge_diagnostics` 加新顶层键。** 今天加了也到不了 UI（7 个键丢 6 个）。本端单方面加键 ＝ 制造下一个 `worker_status`
  3. **Q1 若固化 trace 词汇，`Isolated` 的同词异义必须一并处置**
  4. **删除 `memory_v2_curator.py` 之前，active 平面必须先有一个 memory-agent 遥测产出者。** 否则删除动作本身就是一次 **用户可见能力的净减少**，而不是清理

- **建议处置**:

  **核心问题：选 (c) —— 二者必须在同一份方案里同时落。理由不是 `FRAMING` 给的那条。**

  `FRAMING` 的论证（4/6 产点在待删文件里）**成立，但太弱** —— 只能推出「要小心」，推不出「必须同一份方案」。按它的力度，(a) 是可行的。真正排除 (a) 和 (b) 的是 E-0016：

  - **排除 (a)「先定词汇再删」**：今天能观察到的这套词汇（`Isolated` + `reason` + `worker_status`）**只在正在死去的那条平面上产生**。基于它立规格 ＝ 把规格建在一个下个版本就没有产出者的观测面上。**规格落地那天会发现没有实现方**：active 平面不产这些字段，pupu_legacy 平面已经删了
  - **排除 (b)「先删再定词汇」**：删完之后 trace 的 memory-agent 轴 **归零**（`memory_agent_runs` 两个产点都在待删函数里）。定词汇时既没有参考实现，也没有活数据 —— 而本案已知缺口已记载跨会话闭环未证明、`entries=0`。**在一个空态上删掉最后一个非空来源，再去凭空定词汇，是本案能选的最差路径**
  - **(c) 成立，且比「同时裁」更强**：这份方案必须包含一个 **两问都没点名的交付物 —— active 平面的 memory-agent 遥测产出点**。它是把 Q1 的词汇和 Q10 的删除粘在一起的那块料。**没有它，(c) 也只是把两份规格订在一起，不解决问题**

  **建议裁定写成三段而不是一句「同时落」**：① **先补产出者** —— active 平面出 memory-agent 运行遥测（状态 + reason + 是否消耗 token）。**这是唯一的真前置，`pupu_legacy` 删不删都该做**；② **在新产出者上定词汇** —— 分层、固化 `reason` 取值集合、处置 `Isolated` 同词异义、同步 presenter 白名单；③ **然后才删** —— 删除的验收标准里必须含「trace 的 memory-agent 轴在 active 平面非空」

  | 问 | 建议处置 |
  |---|---|
  | **Q1** | 判「**分层成立，但先补产出者**」。裁定必须写明：分层的下层在发布配置里今天是空的，先定形状会定成一张空表。`reason` 取值集合固化落本端，本端接 |
  | **Q1-前段** | 不裁落位，但请把 E-0017 并入该问依据：**帧已承载，收端白名单丢 6/7**。该问真正裁点应扩为「memory_v2 帧的顶层键表由谁持有、怎么防漂」，否则裁完还会漂 |
  | **Q9** | 前案「拆开裁」维持，**但第一项撤回重写**。新增：判 **`displayName` 双默认值为必修**，且它 **不属于命名债务，属行为不一致**，不受「以后再说」处置。识别符/wire key/storage namespace/错误码仍判 **「不做」** 而非「以后做」。prompt 常量明确划出本案范围 |
  | **Q10** | **清单先补全再谈时序**（三个漏项 + fixture 四处，全部复核成立）。时序改判：**真前置不是 canary，是 active 平面的遥测产出者**。清单补全与存量 `pupu_legacy` DB 实证仍是只读调查，现在就能做 |

  **对本庭 §8 挑战的处置 —— 撤回前案 Q9 建议处置第一项。** 前案写「用户可见文案 → 可以现在改，零风险，属 shared-arteries 的 `src/locales/**`」。**本庭 E-0004 的反驳成立，本端撤回该项。** 实测（E-0022）用户可见的 "Memory Agent" 字样 **确实存在**，但一处都不在 `src/locales/`，全是硬编码英文字面量：`memory_v2_pending_reviews.js:519/529/949` · `trace_chain.js:1969` · `memory_agent_settings.js:24`。**原建议三处都错**：错在位置（不在 locales）、错在 owner（是 `code-owner-chat-bubble` 与 `code-owner-settings`，不是 shared-arteries）、错在风险评估（`memory_agent_settings.js:24` 不是文案，是 **会跨线、会落 durable namespace、后端还有一个不同默认值的 display name**，改它不是零风险）。**正确的替代主张**：这条不是「文案清理」，是 **「Memory V2 这块界面根本没接 i18n」**（5 处用户可见英文全部硬编码），是一个 **独立于 Q9 的缺陷**，建议裁定 **把它从 Q9 里摘出去**，指名交 `code-owner-chat-bubble`（4 处）与 `code-owner-settings`（1 处，且要连着后端默认值一起处置）。**混在命名债务里会让它跟着「判不做」一起被埋掉。**

  **两条前案遗留**：**Q4-E 仍成立，措辞更正一处** —— `memory_v2_unchain_ownership_adapter.py:6-7` docstring 原文未变；新证据：该模块被 **至少 10 个非测试模块** 导入（含 `memory_v2_unchain_read_adapter.py:21`、`memory_v2_unchain_runtime_factory.py:23`、`memory_v2_unchain_curator_query.py:21`、`memory_v2_unchain_long_term_recall.py:19`、`memory_v2_unchain_promotion_api.py:22`、`memory_v2_unchain_review_decision.py:19`、`memory_v2_unchain_deletion_adapter.py:13`），**它是整条 active 平面的接缝**。**更正**：前案说「production gate 已经开了」，严格说 **未直接核实**（gate 状态取决于用户 rollout 配置）；能直接核实的是 docstring 后半句「no model/tool surface」**为假** —— `unchain_adapter.py:7546-7549` 经这条接缝传 `memory_agent_enabled=True` 与 model invoker factory。**结论不变：单列必修，不并进 Q9。** **Q10 清单三个漏项仍成立**，fixture 破坏面比前案所述更大。

  **本案范围内、`case.md` 与 `FRAMING` 未列的未决项（四条）**：

  - **U-R1 · active 平面缺 memory-agent 遥测产出点。** 本轮最大的发现，也是唯一能让 (c) 落地的交付物。**属本端，本端接。** 它 **同时是 Q1 的前置和 Q10 的前置 —— 正是这一点让两问必须同案**
  - **U-R2 · `memory_v2` 帧的顶层键表由谁持有。** 两侧各写一份、无共享来源、无比对测试，已实测漂到 7 丢 6。**裁 Q1-前段而不裁这条，等于修完一次还会再漂。** 建议交 `expert-architecture` 与 `code-owner-shared-arteries`
  - **U-R3 · `Isolated` 同词异义。** 压在 Q1 与 Q9 交界处，两问都没列
  - **U-R4 · `displayName` 的双默认值。** 用户看到哪个取决于 renderer 有没有送 config。**行为不一致，不是命名债务**

  **（参考，指名承接 case）** 前案 Q4-B / Q4-C / Q4-D 不在本案范围。**Q4-C 的性质经本轮更正** —— 它描述的失败面 **只在 pupu_legacy 平面存在**，active 平面是「什么都不显示」而不是「显示了 Isolated 但没重试入口」。请 `0000-0003-2026-0807` / `0000-0004-2026-0807` 承接时按此更正。

#### S-0008 | ASSESSMENT | code-owner-chat-bubble → E-0005
- **阶段**: 议案庭审
- **结论**: 对 E-0005 的采信与三条推论。**S-0006 第 1 节划的那条线，由 E-0005 从「应该这么划」升格为「事实上已经是这么划的，只是没写下来」**
- **依据**: E-0005（本庭取得，提交人未复核，直接采信）；S-0006
- **不确定性**: 推论 2 关于 `sanitizeNode` 的判断 **由提交人凭已读印象作出，本轮未重新核对到行**，请 `code-owner-shared-arteries` 本人于批次 2 确认或反驳
- **请求/下一步**: 请 `code-owner-shared-arteries` 确认推论 2；请裁定采纳推论 3
- **评估结论**: 见下三条推论
- **边界命中依据**: 同 S-0006（`pupu:src/COMPONENTs/chat-bubble/**`）
- **受影响对象**: `presentMemoryV2Audit()` 的字段集契约；`TOP_LEVEL_KEYS`；`chat_storage_sanitize.js` 的持久化形状
- **约束**: 同 S-0006 六条
- **建议处置**:

  1. **`presentMemoryV2Audit` 的字段集事实上是本端与 `code-owner-shared-arteries` 的双边契约，没有第三方。** 改它不会波及别人 —— **这让 Q1 的词汇修复成本比看上去低得多**
  2. **`sanitizeMemoryV2TraceBundle` 有第二消费者，看似意味着「透出 `worker_status` / `candidate_count` 会波及 `chat_storage`」—— 但该风险不存在。** `sanitizeNode:94-122` 对 **子对象是通用递归、不按白名单过滤**，白名单 `TOP_LEVEL_KEYS` 只作用于 bundle **顶层**；而 `worker_status` 与 `candidate_count` 都在 `memory_agent_runs` **子对象** 内，`worker_status` 也不匹配 `BLOCKED_KEY_PATTERN`。**结论：这两个字段今天就已经通过了 sanitize，透出它们不需要动 `TOP_LEVEL_KEYS`，`chat_storage` 的持久化形状不变。** 请批次 2 让 `code-owner-shared-arteries` 本人确认
  3. **「presenter 够不够」不该由 `code-owner-shared-arteries` 单方面回答，也不该由本端单方面回答。** 它的输出只喂本端，所以 **「够不够」的判据是本端的**；它的形状与安全封顶是它的。**建议裁定把 Q1 的 presenter 部分明确为双边共同交付，而不是指派给其中一方**

  **另补一条对 `worker_status` 与 `Isolated` 关系的明确表态**（S-0006 未写）：**两者没有关系，正交且不同层。** `Isolated` 是「整理任务的结局」，`worker_status` 是「worker 有没有被调度」。**今天它们被同一个 run 对象承载 —— 这本身就是问题的一部分。**

- **程序披露**: 未派生任何子 instance；未改任何产品代码，未 commit。唯一写入是 `.claude/agent-memory/code-owner-chat-bubble/` 下两份记忆文件与 `MEMORY.md` 索引一行（该目录 git 已跟踪，工作树会带这三处变更）。**`SendMessage` 投递失败**（`No agent named 'speaker-of-the-house' is reachable`），故以返回输出交付 —— 该失败已由 `speaker-of-the-house` 归档为运行时观察，见 S-0009

#### S-0009 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **休庭，非闭庭。** 批次 1（`code-owner-runtime` · `code-owner-chat-bubble`）已完整交付并归档；批次 2–5 的 **7 名法定必到者尚未出庭**。依 [quorum 第二节](../../../codex/lifecycle/quorum.md)「法定必到者缺席不得闭庭」，**本庭不得宣布闭庭，不得提交 `SUMMARY`**
- **依据**: S-0006, S-0007, S-0008, E-0005 ~ E-0023
- **不确定性**: 已归档的两份 `ASSESSMENT` 在核心问题上 **结论相反**（S-0006 选 (a)，S-0007 选 (c)），且二者依据的事实 **互相加强而非互相反驳**。该分歧 **不得在本次休庭中被压平**，须原样带入闭庭产出
- **请求/下一步**: 恢复庭审，依 S-0004 的批次表续发批次 2–5
- **通知类型**: RECESS
- **生效时间**: 2026-08-07T19:40:00-07:00
- **影响范围**: 本案全部未出庭必到角色

**一 · quorum 状态**

| 批次 | 角色 | 状态 |
|---|---|---|
| 1 | `code-owner-runtime` · `code-owner-chat-bubble` | **已交付**（S-0007 / S-0006 + S-0008） |
| 2 | `code-owner-chat-core` · `code-owner-shared-arteries` | 未发出 |
| 3 | `expert-llm` · `code-owner-settings` | 未发出 |
| 4 | `code-owner-electron` · `code-owner-agents` | 未发出 |
| 5 | `expert-architecture` | 未发出 |

**2 / 9 到庭。quorum 未满。**

**二 · A-012 收窄实践的第一次验证结果（本庭的第二项交付）**

| 指标 | `0000-0001-2026-0807`（对照） | 本庭批次 1 |
|---|---|---|
| 单次并发宽度 | 14 | **2** |
| instance 死亡数 | **9**（含 3 个勘察子 instance） | **0** |
| 完整交付数 | 2 / 14 | **2 / 2** |
| 单批耗时 | —（未完成即中止） | 约 **50–55 分钟**（3.01×10⁶ ms / 3.23×10⁶ ms） |
| 子 instance 派生 | 3（全部死亡） | **0**（两名 owner 均明确自陈遵守） |

**结论：A-012 的收窄实践在死亡率这个维度上有效，且效果是决定性的 —— 从 9/14 死亡降到 0/2。** 「不得派生勘察子 instance」一条同样被两名 owner 遵守并主动披露。

**但该实践引入了一个 A-012 未预见的新成本，须一并归档**：**串行化把庭审的墙钟时长从「一次并发」变成「批次数 × 单批时长」。** 本案 5 批 × 约 50 分钟 ≈ **4 小时**，而 `0000-0001-2026-0807` 的失败发生在约 10 分钟内。**A-012 用时间换存活率，换率大约是 1:1 与 5:1 之间**（取决于批次数，而批次数由必到名单规模决定）。这不否定该实践 —— 一次 4 小时的完整庭审优于一次 10 分钟的中止 —— 但它意味着 **必到名单规模不再只是 quorum 问题，也是排期问题**，而 `0000-0004-2026-0807` 的必到名单是 7 人（4 批）。**该 case 自己的 `case.md` 已预写「若 A-012 尚未被验证有效，本案应最后开庭」—— 本条即为该判断提供了数据。**

**两条附带的运行时观察**（不是阻塞记录，也不是运行时故障记录，二者均不适用 —— 无 instance 死亡）：

1. **被传唤角色无法用 `SendMessage` 回到 `speaker-of-the-house`**（S-0008 程序披露：`No agent named 'speaker-of-the-house' is reachable`）。庭审的返回通道 **只有一条**：agent 的最终输出。这意味着 **中途无法向 Speaker 补交证据或提问**，只能一次性交付。该约束对「定向质询」阶段（发言协议第 3 阶段）有直接影响 —— **本庭的质询只能以「重新唤起该 agent」实现，不能以对话实现**
2. **`speaker-of-the-house` 侧无法安全观测在途 agent 的进度。** 任务 transcript 文件即全量 JSONL，读取会淹没 Speaker 自身的上下文；文件大小与 mtime 是仅有的可用信号，而二者在 agent 长时间单次工具调用期间 **与「已死亡」不可区分**。本庭一度据此误判批次 1 已停止，实际两者均存活。**这构成一条对 `codex` 的建议：庭审需要一个不读 transcript 的存活探针**

**三 · 已归档产出的处置**

`record.md` 的 S-0001…S-0009 与 `evidence.md` 的 E-0001…E-0023 **全部有效**。恢复庭审后，批次 2–5 的角色 **对已归档部分保留完整发言权**，且应先读 S-0006 / S-0007 / S-0008 —— 其中数条明确要求由后续批次的 owner 确认或反驳：

| 待确认事项 | 由谁确认 | 出处 |
|---|---|---|
| `sanitizeNode` 对子对象不按白名单过滤，故透出 `worker_status` / `candidate_count` 不需动 `TOP_LEVEL_KEYS` | `code-owner-shared-arteries` | S-0008 推论 2 |
| 「7 键丢 6」与「两条轴在同一屏互相矛盾」 | `code-owner-shared-arteries` | E-0017 |
| Curator 门链（active 平面零产出） | `expert-architecture` · `code-owner-shared-arteries` | S-0007 请求 · E-0016 |
| renderer 不送 `memory_agent_config` 的路径是否可达（决定双默认值是必修还是不可达） | `code-owner-settings` | E-0020 |
| `electron/preload` 层是否承载 V2 帧（E-0011 明确未覆盖） | `code-owner-electron` | E-0011 完整性限制 |
| Q9 改名后 `workflow_list.test.js:144` 断言失效的处置 | `code-owner-agents` | S-0006 U-5 |
| `reason` 取值集合固化、`Isolated` 同词异义、prompt 常量 | `expert-llm` | S-0007 约束 3 · Q9 |

**四 · 本庭在休庭时点已可确认的两项**（不构成 `SUMMARY`，`SUMMARY` 只能在闭庭时提交）

- **共识（两名已出庭 owner 一致）**：删除 Q10 那四个文件 **在渲染端不产生任何可观测回归** —— 但二者对这一事实的解读相反（S-0006 据此认为删除安全、可先定词汇；S-0007 据此认为该轴在发布配置下本就零产出、删完连产出者都没有）
- **分歧（进强制回应清单的候选，最终清单在闭庭时定）**：**核心问题 (a) ↔ (c)**，S-0006 ↔ S-0007。二者 **不是同一事实的两种解读，而是两个不同层级的观察**：S-0006 观察渲染端（词汇锚点不在删除清单里），S-0007 观察产帧端（整条轴被 fail-closed 门锁在待删平面上）。**本庭不判定孰是孰非**，但登记一条：**S-0007 的 E-0016 若成立，S-0006 的 (a) 选择所依赖的「规格可写在 `memory_v2_context.py:190-196` 与 `unchain_adapter.py:1132-1139` 之上」这一硬条件仍然成立** —— 两者可能并非不可调和，而这需要 `expert-architecture` 在批次 5 判断

#### S-0010 | NOTICE | speaker-of-the-house → S-0007
- **阶段**: 议案庭审
- **结论**: 登记 E-0024。应 `code-owner-runtime` 在 S-0007 末尾的请求，本庭代为执行其提出的两条单命令验证法，**闭合其未核实清单第 1、2 项与 U-6**。两项结果均为决定性：**(1) `pupu_legacy` store 的隔离改名不是代码路径，是人手做的；(2) 那 1,387,400 行 `operations` 全部是 `memory_v2_deletion:` 前缀，一条 curator 操作都没有 —— 这反驳了 S-0007 自己的结构性推断**
- **依据**: E-0024, E-0007, S-0007
- **不确定性**: E-0024 的两条完整性限制。(a) 未覆盖 unchain 仓与已删除的历史版本，故「从来没有过该逻辑」**不成立**，只成立「当前代码里没有」；(b) 只做前缀聚合，**未读取任何一行内容**，故「这些删除操作意味着什么、能不能丢」**本庭不表态**
- **请求/下一步**: `code-owner-runtime` 于恢复庭审后据此更新其 Q10 时序建议；`chief-judge` 注意 —— 本条把 S-0007 的一条 **建议性前置** 升格为 **已证实的必要条件**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T19:50:00-07:00
- **影响范围**: Q10 的时序与前置条件；S-0007 的未核实清单第 1、2 项

**为什么由 `speaker-of-the-house` 执行**：S-0007 在交付后明确提出「若本庭愿意再给一次极短的取证窗口，我可以在方案庭审前把 U-6 补成已核实」，并给出两条 **单命令、只读、在其边界内** 的验证法。本庭依 **证据审查职责** 代为执行，理由是：(i) 两条命令合计成本远低于重新唤起一个 instance，且 [A-012](../../../codex/adaptations.md) 的收窄实践要求避免不必要的 instance 唤起；(ii) 二者均为 **机械观察**，不含任何取舍判断；(iii) 其中一条的观察对象是 **运行时数据目录**，本就不落在任何 owner 的代码边界内（见 S-0005 的边界自愈信号第 5 号）。**本庭不因此代替该 owner 作任何实体判断** —— 事实归档，解读归它。

**两项结果对 Q10 的净效果，以原编号陈述，不作合并**：

| 项 | S-0007 原主张 | E-0024 的效果 |
|---|---|---|
| 隔离改名的性质 | 「是代码路径还是人手，**未核实**；两种情况方案完全不同；这是 Q10 时序的真正决定项」 | **已核实：人手。** 落在 S-0007 自述的更差一支 —— 产品无存量处置机制 |
| 473 MB 的处置 | 「新增前置：删代码之前必须先裁这堆盘上数据怎么办」（建议） | **升格为已证实的必要条件** |
| `operations` 的内容 | 结构性推断：「一百多万次没成功的整理」，自标「须验证后才可采信」 | **不采信。** 100% 为 `memory_v2_deletion:` 前缀，`memory_curator_*` 零命中 |
| E-0007 对 Q10 时序的方向 | S-0007 判「往更早、更独立改，不是往更晚改」 | **本庭不评价该判断** —— 它是实体取舍，属该 owner |

**并案登记（供第三层门禁）**：`unchain_runtime/server/memory_v2_deletion.py` · `memory_v2_deletion_runner.py` · `main.py` · `mcp_managed_runtime.py` 自本条起为已出现于庭审的实体，**其 owner `code-owner-runtime` 已在必到名单内且已出庭**，不构成新的传唤义务。

#### S-0011 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 恢复庭审。依 `chief-judge` 裁定「先修传唤抽取，再续庭」，抽取器缺陷已修复并回归通过，续发批次 2–5
- **依据**: S-0003, S-0004, S-0009
- **不确定性**: 无
- **请求/下一步**: 批次 2–5 依 S-0004 批次表串行出庭
- **通知类型**: RESUMPTION
- **生效时间**: 2026-08-07T20:05:00-07:00
- **影响范围**: 本案 7 名未出庭法定必到者

**一 · 传唤抽取缺陷已修复（本庭 S-0002 / S-0004 四条自愈信号的处置结果）**

`chief-judge` 裁定确认本庭「A-010 只记录了缺陷、没修它」的指控成立。抽取器已实现并落盘为 `.claude/skills/case/summon.py`，修复三类漏人：**围栏紧邻假设** / **裸文件名** / **概念名**。

**回归检验结果**：该工具 **独立复现出本庭手工读完 31 份 charter 才补正的全部 4 名 owner** —— `code-owner-shared-arteries`(6 处) · `code-owner-electron`(18 处) · `code-owner-settings`(2 处，含两次被丢的 `memory_agent_settings.js`) · `code-owner-agents`(1 处)。

**本案 9 人必到名单不变。** 该修复只作用于后续 case。**S-0002 的自愈信号 1、2 与 S-0004 的信号 4 至此处置完毕（分类「抽取写窄」正确，处方「改工具不改 charter」已执行）。**

**三项转 `codex` 待处置，不阻塞本庭**：概念名漏人应否单列第三桶「议案写窄」（本庭 S-0002 信号 3）· 不读 transcript 的在途 instance 存活探针（S-0009）· **运行时数据目录在现行边界体系中无 owner**（S-0005 信号 5）—— 第三项已写入 A-010 遗留段，注明它今后每次都会卡第三层门禁。

**二 · 归档方式的调整（协议内，须记录）**

批次 2–5 的 `ASSESSMENT` 由发言人 **自行写入 `.inbox/S-00XX.md`**，`speaker-of-the-house` 预先分配编号、闭庭时校验格式并拼接进本文件。

**依据**：发言协议明令「格式不合规的发言须退回原 speaker 重排，`speaker-of-the-house` **不得自行改写后代为提交**」。由发言人执笔原文、Speaker 只做编号与归档，**比 Speaker 转录更贴合该条** —— 转录本身就带改写风险。Speaker 的编号责任、格式校验责任与退回权 **不受影响**。

**编号预分配**（一经分配不可变更、不可复用）：

| 批次 | 角色 | 发言编号 | 证据编号块 |
|---|---|---|---|
| 2 | `code-owner-chat-core` | `S-0012` | `E-0025`…`E-0032` |
| 2 | `code-owner-shared-arteries` | `S-0013` | `E-0033`…`E-0040` |
| 3 | `expert-llm` | `S-0014` | `E-0041`…`E-0046` |
| 3 | `code-owner-settings` | `S-0015` | `E-0047`…`E-0052` |
| 4 | `code-owner-electron` | `S-0016` | `E-0053`…`E-0058` |
| 4 | `code-owner-agents` | `S-0017` | `E-0059`…`E-0062` |
| 5 | `expert-architecture` | `S-0018` | `E-0063`…`E-0068` |

**三 · `chief-judge` 指定本庭特别处置的两件事**

1. **E-0024 推翻了 S-0007 的一处结构性推断**（138 万行全为 `memory_v2_deletion:` 前缀、curator 操作零条；S-0007 推测那是「一百多万次没成功的整理」并自标须验证）。依[宪法第七条](../../../codex/constitution.md)，`code-owner-runtime` **不负自证其非的义务**；但该推断既已被证据推翻，**本庭将在闭庭产出中明确标注其失效**，不使其以未标注状态进入裁定材料。本条即为该标注的第一处。
2. **核心问题分歧（S-0006 (a) ↔ S-0007 (c)）不得压平。** `expert-architecture` 于批次 5 出具的是 **鉴定意见，不是裁定**：若其结论为 **不成立**，进强制回应清单；**即便其给出倾向，S-0006 与 S-0007 的分歧仍须与之并列呈给 `chief-judge`**。

#### S-0012 | ASSESSMENT | code-owner-chat-core → case
- **阶段**: 议案庭审
- **结论**: **Q1-前段 问错了 —— 它点名的两个实体都不是承载体，而其中一个是本端在前案亲手点错的。** `streaming_message_store` 是按 `(chatId, messageId)` 键控的助手文本环形缓冲，值形状只有 `{version, textLength, chunks: string[], updatedAt}`，**结构上不可能承载任何帧**（E-0025）；`runtime_events_v4` 是 capability 名（E-0006 已自陈）。**Memory V2 今天走 `done` 信封**：`unchain_adapter.py:7884` 写进 bundle → `:11191` 以 `stream_summary` 抛出 → `route_chat.py:1086` **明确地把它从 runtime event 归一化管线里摘走（`continue`）** → 经 13 键 allowlist 挂到 `done_payload["bundle"]` → preload 信封级透传 → `use_chat_stream.js:7538-7565` 写进 `message.meta.bundle`（E-0026）。**故 E-0011 与 E-0017 都是对的**：runtime event 总线上确实零帧承载，而 `done` 载荷上确实已经承载、且承载的比 presenter 收的多。**`code-owner-runtime` 在 S-0007 里的重述（过程信号 vs 审计块）成立，其「成本差一个数量级」的量级判断经本端实测核对属实**（审计块跨 2 名 owner、2 个文件；过程信号跨 5 名 owner、含 1 个跨仓协议与 2 道静默丢弃门）。**核心问题选 (c)**，但排除 (a) 的理由既不是 `FRAMING` 的、也不完全是 S-0007 的：是 **在一个有多道静默丢弃门、且诊断缓冲零消费者的拓扑里，一份没有产出者的词汇规格无法被验收** —— 而无法验收的规格在本条链路上等于没写
- **依据**: E-0025 ~ E-0032（本轮提交，其中 E-0029 / E-0030 已验证）；本案 E-0004, E-0006, E-0011, E-0016, E-0017, E-0020, E-0024；S-0002, S-0004, S-0006, S-0007, S-0008, S-0009；跨案 `0000-0001-2026-0807#S-0005`、`#S-0006`
- **不确定性**:
  - **(a) 本端本轮全部为静态取证 + 单元测试，未在运行中的应用里看过任何一条 Memory V2 的 wire 载荷。** E-0026 的端到端链路由源码控制流推出，**未抓包**。若后端存在本端未搜到的第二条 bundle 注入路径，该链路要打折
  - **(b) 本端 **撤回** `0000-0001-2026-0807#S-0006` 中「Memory V2 在 trace 里能体现什么，取决于 `streaming_message_store` / `runtime_events_v4` 承不承载 V2 帧 …… 让 schema 承载新数据是契约变更，强制 Full track」这一整句。** 该句点错了承载体，并据此把成本判成一律的「跨面契约变更」。正确的表述见本条**评估结论 · 二**。**Q1-前段 这一整问是由该错误表述引出的**，本庭若愿，可据此重写该问
  - **(c) 越界读取披露。** 为核算「本端在 wire 上收到什么」，本轮读了 `unchain_runtime/server/{unchain_adapter,route_chat,memory_v2_curator}.py`、`electron/preload/stream/unchain_stream_client.js`、`src/SERVICEs/runtime_events/**`、`src/SERVICEs/chat_storage/chat_storage_sanitize.js`、`src/SERVICEs/memory_agent_settings.js` 与 unchain 仓 `src/unchain/events/normalizer.py`。**这些结论一律不作主张**，最终以各自 owner 为准
  - **(d) E-0031 只证明 build 默认值，不证明任何一台用户机器上 `enable_memory_v2` 的实际取值。** 该 flag 有运行时覆盖机制
  - **(e) E-0028 只覆盖 preload，未读 `electron/main/services/unchain/service.js` 的中继段** —— Electron 侧是否有类型过滤，那一段仍是公开问题，归批次 4
  - **(f) `#S-0005` 自陈的三条不确定性、以及本端前案的 CE-1…CE-8，本轮均未作为已证事实使用**
- **请求/下一步**:
  1. **请把 E-0026 与 E-0027 交同批的 `code-owner-shared-arteries`（S-0013）确认或反驳。** 它是 `event_store.js` / `activity_tree.js` / `memory_v2_trace_presenter.js` 三者的 owner，本案两道静默丢弃门与 presenter 白名单全在它一个人身上 —— **本案对 Q1-前段 的判据实际上落在它那里，不落在 Electron 那里**（E-0028 更正 S-0004）
  2. **请裁定把 Q1-前段 重写。** 现措辞「流是否承载 V2 帧」用两个非承载体提问，无法被回答。建议改为：**「Memory V2 的整理结果是回合内的过程信号还是回合后的审计块？若为前者，它走 runtime event 总线还是继续搭 `done.bundle`？」** —— 这是 S-0007 已经提出、本端核实并支持的重述
  3. **若形态裁向「过程信号」且走新增 runtime event 类型，请第三层门禁重新判定 `code-owner-unchain` 的必到资格。** S-0002 以「本案不含 unchain 侧改动请求」把它排除在必到名单外，该前提在这一支上不再成立（`unchain/src/unchain/events/{types,normalizer}.py` 是词汇表的上游）
  4. `E-0028` 的 `service.js` 中继段留给 `code-owner-electron`（批次 4）补完
  5. **本端不请求任何属于自己的切片。** 两条路线在 `code-owner-chat-core` 边界内的改动量都是 **0 行**（E-0029 / E-0032）

- **评估结论**:

  **一 · 四问落位**

  | 问 | 落位 | 理由 |
  |---|---|---|
  | **Q1**（trace 中体现什么） | **不落在我这里** | 产帧端在 `unchain_runtime/**`，呈现端在 `chat-bubble` 与 `runtime_events/**`。本端既不产也不渲染 |
  | **Q1-前段**（流是否承载） | **落在我这里，且本端是唯一能裁的一方** | 本端是流的驱动方：选 V4、驱动 batcher、把 `done.bundle` 写进 `message.meta`、驱动重放。见下 |
  | **Q9** | **只有 wire key 一半落在我这里** | `use_chat_stream.js:6483` 是 `memory_agent_config` 在全仓的 **唯一生产者**（E-0030）。命名本身、durable namespace、后端契约、用户可见文案 —— 都不落在我这里 |
  | **Q10** | **不落在我这里** | 四个待删文件全在 `unchain_runtime/**`。本端只出一条与之相关的配置事实（E-0031） |

  **二 · Q1-前段 的实体回答（本端的核心交付）**

  **① 今天 V2 数据怎么到 renderer 的：走 `done` 信封，不走 runtime event 流。两条路各承载什么，见下表。**

  | 通道 | 载体 | 今天承载什么 | 谁写进 `message.meta.bundle` |
  |---|---|---|---|
  | **A · `done` 信封** | SSE `done` → preload `onDone(data)` → `use_chat_stream.js:7538-7541` | **`bundle.memory_v2` 全部内容**（后端 13 键 allowlist 保留、只脱敏，`route_chat.py:55-79`） | `:7563-7565` |
  | **B · runtime event 总线** | `run.completed.payload.usage` → `activity_tree.js:491` `completionBundle` | **unchain kernel 自己的 token bundle，不含 `memory_v2`**（它不经 `_build_bundle_from_result`） | `:5766-5771`，**仅当 A 缺席时兜底** |
  | **C · 重放** | `stream_replay_projector.js:143-146` → `applyLatestProjection` | 同 B（复用同一 store / reducer / adapter） | `:9438-9443` → `:9487-9491` |

  > **这解释了本庭最大的一处表面矛盾。** E-0011（chat-bubble）grep `src/SERVICEs/runtime_events/*.js` 找 `memory` 得 0 —— 真的，通道 B 上一个字都没有。E-0017（runtime）实测 bundle 里有 7 个 memory_v2 顶层键 —— 也真的，那是通道 A。**两条证据不冲突，是同一条链路的两端。** 分歧的根源是 `FRAMING` 沿用了本端前案那句点错承载体的话。

  **② 「让 `streaming_message_store` / `runtime_events` 承载新的 V2 帧」是不是跨面契约变更、成本量级多少 —— 分两支，差一个数量级，本端实测核对如下**

  | 层 | owner | **路线 A · 审计块**（往 `bundle.memory_v2` 加键） | **路线 B · 过程信号**（新增 runtime event 类型） |
  |---|---|---|---|
  | unchain `events/{types,normalizer}.py` | `code-owner-unchain`（**不在本案必到名单**） | 零 | **必改，跨仓协议** |
  | `unchain_adapter.py` 产点 | `code-owner-runtime` | 加键 | 新 emit 点 |
  | `route_chat.py` | `code-owner-runtime` | **零** —— `memory_v2` 已在 13 键 allowlist 内（`:73`） | 必改（`bridge.normalize` 分支） |
  | `electron/main/.../service.js` 中继 | `code-owner-electron` | 未核实 | 未核实 |
  | `electron/preload/.../unchain_stream_client.js` | `code-owner-electron` | 零 | **零** —— V4 监听器信封级透传，全程不读 `data.type`（E-0028） |
  | `runtime_events/event_store.js` | `code-owner-shared-arteries` | 零 | **必改**，`RUNTIME_EVENT_TYPES` 是 14 项闭集，不改 = **静默丢进零消费者的 `unknownEvents`** |
  | `runtime_events/activity_tree.js` | `code-owner-shared-arteries` | 零 | **必改**，reducer 17 个平铺 `if`、**无 default、无 diagnostic**，不改 = **完全无声消失** |
  | `memory_v2_trace_presenter.js` | `code-owner-shared-arteries` | **必改**（`TOP_LEVEL_KEYS`） | 视方案 |
  | `chat_storage_sanitize.js` | `code-owner-shared-arteries` | 零 | **零** —— frame `type` 无白名单，只 64 字符截断（E-0032） |
  | `stream_replay_projector.js` | `code-owner-shared-arteries` | 零 | 复用同两道门，**开了就免费**；但其返回值是 11 字段固定表，信号不落 `trace.frames` 则要加字段 |
  | **`use_chat_stream.js`（本端）** | **`code-owner-chat-core`** | **0 行** | **0 行**（`onRuntimeEvent` 全程不读 `type`，E-0029）。唯一成本是 **64 ms 批窗的频率预算** |
  | `chat-bubble` | `code-owner-chat-bubble` | 渲染 | 渲染 |

  **结论**：
  - **路线 A 不是跨面契约变更。** 它跨 2 名 owner、2 个文件（后端产点 + presenter 白名单），**Electron 零、chat-core 零、unchain 零、持久化零**。本端 **撤回** 前案「强制 Full track」的判断 —— 在这一支上不成立。
  - **路线 B 是跨面契约变更，而且是跨仓的。** 它跨 5 名 owner，含一个 **不在本案必到名单** 的 owner 与一个 **跨仓库接口**（依组织规则归 `expert-architecture` 裁），并要开 **两道静默丢弃门**。
  - **且存在一条本案没人提过的中间路（E-0032）**：不新增事件类型，改让后端那个 `route_chat.py:1086` 的 `continue` 放行、或让 admission diagnostics 搭既有事件类型的 payload。**这条在传输层是通的**（本端已核实到行），且 **两道静默门一道都不用开**。本端 **不主张** 它可行 —— 取舍在 `code-owner-runtime` 与 `code-owner-shared-arteries`，本端只出「路是通的」这一条事实。

  **③ `code-owner-runtime` 的重述对不对：对，本端支持，并给它补上量化依据。**

  S-0007 说：「Memory V2 的整理结果是一个『回合内的过程信号』还是一个『回合后的审计块』？今天的实现已经选了后者。若要前者才需要流承载新帧、才是跨面契约变更、才强制 Full track；若要后者，Q1 一帧都不用加。」

  **逐句核对**：
  - 「今天的实现已经选了后者」—— **成立**。`route_chat.py:1086` 的那个 `continue` 就是那次选择，写在代码里，不是默认发生的（E-0026）
  - 「若要前者才是跨面契约变更、才强制 Full track」—— **成立**，且比它说的更重：**前者还会把一个不在本案 quorum 内的 owner 拉进来**
  - 「若要后者，Q1 一帧都不用加」—— **成立**，且可以说得更强：**后者连一行都不用加在传输层** —— `memory_v2` 已经在后端 allowlist 里、已经在 wire 上、已经在 `message.meta.bundle` 里。全部工作是 presenter 的 `TOP_LEVEL_KEYS` 与渲染
  - 「这个岔路目前没人问过，而它决定 Q1 的成本差一个数量级」—— **成立**。本端实测的跨度是 **2 名 owner / 2 个文件 ↔ 5 名 owner / 含跨仓协议 + 2 道静默门**，量级判断属实

  **④ Q9：本端是发出端 —— 该分支不可达。**

  `code-owner-runtime` 实测的双默认值（renderer `"Memory Agent"` / 后端 `"Memory Curator"`，E-0020）**属实**，但「renderer 不送 config」这条路 **从 PuPu 出不来**（E-0030，已验证，含实跑）：

  1. `memory_agent_config` 在 `src/` + `electron/` 全域 **只有一个生产者**：`use_chat_stream.js:6483`。**Electron 零命中，不注入、不改写**
  2. 它与 `memory_v2_requested` 由 **同一个 IIFE** 产出（`:6478-6491`），一起展开进 **两个** payload 分支（`:6497` durable resume / `:6502` 普通发送）。**要么两个键都在，要么都不在**
  3. 后端只在 `_memory_v2_requested is True` 时进 V2（`unchain_adapter.py:8089` / `:8131`）。故「进了 V2 但没有 config」这个组合，从 renderer 出不来
  4. `displayName` 恒非空：`memory_agent_settings.js:38-39` 的 `displayName || DEFAULT_MEMORY_AGENT_DISPLAY_NAME`；而后端 `memory_v2_curator.py:171-173` 是「键在就保留」，故 `:1140` 的 `.get(..., "Memory Curator")` 拿不到默认值
  5. **今天被一条活测试钉住**：`use_chat_stream.memory_v2_payload.test.js:299` 断言清空 localStorage 后 payload 恒为 `{displayName:"Memory Agent", additionalInstructions:"", provider:"", modelId:""}`；`:266`/`:455` 断言 flag off 时两分支均无该键。**本轮实跑 2 suites / 9 tests 全绿**

  **故本端建议把 E-0020 改判**：不是「用户今天会遇到的行为不一致」，是 **契约隐患** —— 同一个用户可见 display name 有两个独立默认值，**两侧各有测试，但没有任何测试断言两者相等**。触发条件是「出现一个不经 `use_chat_stream` 的 V2 调用方」，而 **路线 B 正好会造出这样的调用方**。处置归 `code-owner-runtime` 与 `code-owner-settings`；本端只出发出端事实。

- **边界命中依据**: `pupu:src/PAGEs/chat/**`（`use_chat_stream.js` 与其 co-located 测试依 [A-008](../../../codex/adaptations.md#a-008--co-located-测试随源文件归属)）· `pupu:src/SERVICEs/streaming_message_store.js` · `streaming_message_chunks.js`。取证落点：`use_chat_stream.js:3904 / 5705-5738 / 5766-5771 / 5850-5875 / 6455-6510 / 6690 / 7538-7565 / 9408-9493 / 9518-9522 / 9596 / 9612 / 9772-9784` · `use_chat_stream.runtime_event_batching.test.js:18-32` · `use_chat_stream.memory_v2_payload.test.js:135-140/266/299/455/476/482` · `streaming_message_store.js` 全文 · `feature_flags.js:45-70`。

  **子目录负向核对**：`side-menu/` · `chat-header/` · `chat-messages/` · `chat-input/` 对 Memory V2 零感知，维持 `0000-0001-2026-0807#S-0006` 的 CE-7（本案 E-0002 证明三个产品目录自 `14ca3ccc` 零变更，锚点仍有效）。**本案在本端只触及 use_chat_stream 一条线。**

- **受影响对象**:

  | 对象 | 本案对它的净影响 |
  |---|---|
  | `use_chat_stream.js` 的 runtime event 入口（`:5718-5738`） | **零** —— 类型不可知。任何新事件类型免改 |
  | `use_chat_stream.js` 的 bundle 入口（三条：`:7538` / `:5766` / `:9438`） | **零** —— `bundle` 整体透传进 `message.meta`，不读子键 |
  | `use_chat_stream.js:6483` `memory_agent_config` | **wire key，任何改名都是契约变更**。本端判「不做」（见约束 6） |
  | `RUNTIME_EVENT_BATCH_FLUSH_MS = 64` 的批窗 | **仅路线 B 受影响**，需要事件频率上界 |
  | `streaming_message_store.js` | **零，且应从裁定文本里移除** —— 它不是承载体 |
  | 下游受影响但不归本端 | `runtime_events/event_store.js` · `activity_tree.js` · `memory_v2_trace_presenter.js` · `stream_replay_projector.js`（全部 `code-owner-shared-arteries`）；`route_chat.py` · `unchain_adapter.py`（`code-owner-runtime`）；`unchain/src/unchain/events/**`（`code-owner-unchain`，**不在必到名单**） |

- **约束**:

  1. **单向契约不变，且请写进裁定。** 本端产生并驱动流，`chat-bubble` 只消费它来渲染，方向不可逆。**与 S-0006 约束 1 完全一致，两名 owner 独立提出同一条。**
  2. **裁定文本不得再用 `streaming_message_store` 或 `runtime_events_v4` 指代 V2 帧的承载体。** 前者是文本环形缓冲（E-0025），后者是 capability 名（E-0006 自陈）。承载体是 `done` 信封的 `bundle`（通道 A）与 runtime event 总线（通道 B，今天不含 memory_v2）。**这条约束的起因是本端前案的错误表述，本端承担。**
  3. **不得在不同步改 `event_store.js:1-16` 与 `activity_tree.js:398-849` 的前提下新增 runtime event 类型。** 两道门都是静默丢弃，其中 reducer 那道 **连计数都没有**，而 `event_store` 那道记进的 `diagnostics.unknownEvents` 在 `src/` **零消费者**（E-0027）。**后端加一个事件类型今天会得到零反馈 —— 不崩、不报错、不打点、测试不红。**
  4. **任何「过程信号」方案必须给出事件频率上界。** 本端 batcher 窗口 64 ms，全部 runtime event 走同一路 reduce（`:5705-5709`）。这是 `use_chat_stream` 的既有性能形态，本端不反对承接，但要求预算。
  5. **`memory_agent_config` 是线上 wire key，本端判「不做」改名。** 它同时被 renderer 端一条活测试与后端四键白名单钉住；改名要两侧同一次落地，收益是可读性，风险是一次静默不匹配。**本端不反对后端对其它标识符的「不做」判断，只要求裁定别把 wire key 与用户可见文案写成一条。**
  6. **拿「测试全绿」当证据在这条链路上无效 —— 本端与 `code-owner-chat-bubble` 独立得出同一条。** 本端补一条它没说的理由：`use_chat_stream.memory_v2_payload.test.js` 断言的是 **payload 出去的形状**，`trace_chain.memory_v2.test.js` 断言的是 **喂进去的 fixture**，**中间那一整段 wire（三道白名单 + 两道静默门）没有任何一条测试跨越它**。
  7. **本轮只读，未改任何产品代码，未 commit，未派生任何子 instance。** 写入仅两处：本案 `.inbox/` 下的 `S-0012.md` 与 `E-0025…E-0032.md`，以及 `.claude/agent-memory/code-owner-chat-core/` 下的记忆文件与索引一行（该目录 git 已跟踪，工作树会带这些变更，特此披露）。

- **建议处置**:

  **一 · 核心问题：(c) —— 二者必须在同一份方案里同时落。理由是第三条，不是 `FRAMING` 的，也不完全是 S-0007 的。**

  先把两位已出庭 owner 的论证各自核对一遍，两边都有一半站得住：

  - **`code-owner-chat-bubble` 的 (a) 对了一半。** 它证明的是「**词汇的锚点** 不在删除清单里」。本端独立核对后 **扩大** 这个结论：不只是它举的 `memory_v2_context.py:190-196` 与 `unchain_adapter.py:1132-1139`，**两条路线的全部词汇制品都不在删除清单里** —— 路线 A 的 `memory_v2_trace_presenter.js`、路线 B 的 `event_store.js` / `activity_tree.js` / unchain `events/types.py`，一个都不在。**删掉那四个文件，任何一条词汇表都不会失效。这一点 chat-bubble 是对的，而且比它自己说的更强。**
  - **`code-owner-runtime` 的 (c) 也对了一半。** 它证明的是「**词汇的产出者** 全在删除清单里」（`memory_agent_runs` 两个产点都在 `_finalize_memory_v2_curator` 体内）。本端对该控制流不越界复核，但接受其 E-0016 的形式。
  - **两条不冲突：规格的锚点活着，规格的说话者死了。**

  **那么，一份「有锚点、无实例」的词汇规格，能不能先写？本端的答案是不能，理由来自本端刚测出来的门禁拓扑，与前两位的理由都不同：**

  > **这条链路上有 三道白名单 + 两道静默丢弃门，而唯一的诊断出口零消费者。** 三道白名单：`route_chat.py:60-74`（13 键）· `memory_v2_trace_presenter.js` `TOP_LEVEL_KEYS`（实测 7 丢 6）· `chat_storage_sanitize` 的 64 字符截断。两道静默门：`event_store.js:189`（记进没人读的缓冲）· `activity_tree.js` reducer fall-through（**什么都不记**）。
  >
  > **在这样的拓扑里，唯一可靠的验收方式是「一个真值端到端走完、有人眼看见」** —— 这正是 `code-owner-chat-bubble` 自己在 Q10 证词里给出的验收标准（「单元测试在这条路径上不具备证明力」）。**先删产出者、或先对着一个即将被删的产出者立规格，都会让规格失去唯一可用的验收手段。** 一份验收不了的规格，在这条链路上等于没写 —— 本案已经有四个字段（`worker_status` / `candidate_count` / `proposal_count` / `enqueue_status`）就是这么产出即丢弃的。

  **逐项表态**：
  - **(a) 反对** —— 不是因为它的论证错（它的论证本端还帮它加强了），是因为它成立的那个结论（「删了不失效」）**不足以支撑「可以先定」**。不失效 ≠ 可验收。
  - **(b) 反对** —— 与两位一致，且本端加一条：`enable_memory_v2` 默认 `false`、全仓无 build 级覆盖（E-0031），**Q10 今天没有任何用户可见的紧迫性**。先删换不来任何东西。
  - **(c) 采纳，附一条 S-0007 的三段式里缺的第 0 段。**

  **二 · 对 S-0007 三段式方案的一处修正：形态裁定必须排在「补产出者」之前。**

  S-0007 建议裁定写成三段：① 先补产出者 → ② 在新产出者上定词汇 → ③ 然后才删。**本端同意 ②③ 的次序，但主张 ① 之前还缺一段，而且是最便宜、最吃力的一段**：

  > **第 0 段 · 裁定形态：Memory V2 的整理结果是回合内的过程信号，还是回合后的审计块。**
  >
  > **理由是「产出者」在两条路线上不是同一个交付物**：路线 A 的产出者是「往 `bundle.memory_v2` 里多写几个键」，落 `code-owner-runtime` 一个人，presenter 配合；路线 B 的产出者是「一个新的 runtime event 类型」，落 **5 名 owner，含一个跨仓协议、一个不在本案 quorum 内的 owner、两道必须同时开的静默门**。**你没法在不知道是哪一个的情况下去 spec「补一个产出者」。** S-0007 的 U-R1 说得对 ——「它是唯一能让 (c) 落地的交付物」；本端补的是：**它是两个不同的交付物，先得选一个。**

  **本端对形态的推荐（成本判断属本端，产品取舍标 OPINION）**：

  - **成本事实（本端结论）**：路线 A 在传输层的增量成本是 **零**。`memory_v2` 已经在后端 allowlist 里、已经在 wire 上、已经在 `message.meta.bundle` 里、已经在持久化里。全部工作是 presenter 白名单 + 渲染，跨 2 名 owner。
  - **OPINION（越出本端边界，标为参考）**：**选审计块。** 三条理由 —— (i) 它是 wire 今天已经做的事，改的是「收端丢了」而不是「送端没送」；(ii) 路线 B 要开的那两道门是本案已经反复出现的失败类（产出即丢弃）的 **源头形态**，在把已有的 7 丢 6 修好之前先开一道新的静默门，是把最贵的预算花在最前面；(iii) `code-owner-chat-bubble` 已经证明 trace 行上 **根本不存在「失败」这个视觉**（`Isolated` / `Failed` / `Completed` 同一个点同一种颜色）—— **在一个把失败画成绿点的面上增加实时过程信号，不增加任何信息。** 呈现形态的最终取舍归 `expert-ux` 与 `0000-0003-2026-0807`，本端不裁。

  **三 · 建议裁定写成四段（在 S-0007 三段基础上加第 0 段）**

  | 段 | 内容 | 落谁 |
  |---|---|---|
  | **0** | **裁定形态**：过程信号 or 审计块。**这是本案最便宜、最吃力的一项，且是纯产品/结构决策，不含代码** | `chief-judge`，`expert-architecture` 出鉴定（批次 5） |
  | 1 | 按第 0 段的结论补 active 平面的 memory-agent 遥测产出者（S-0007 U-R1） | `code-owner-runtime`（+ 若为路线 B，则加 `code-owner-unchain` 与 `code-owner-shared-arteries`） |
  | 2 | 在新产出者上定词汇：分层、固化 `reason` 取值集、处置 `Isolated` 同词异义、**三道白名单同步** | `code-owner-runtime` · `code-owner-shared-arteries` · `code-owner-chat-bubble` |
  | 3 | 然后才删。验收标准含「trace 的 memory-agent 轴在 active 平面非空，且人眼在运行中的应用里看过一次」 | `code-owner-runtime` |

  **加一条与删除并行、但不被它阻塞的**：E-0024 已证实 **产品没有任何机制处理存量 `pupu_legacy` store**。那 473 MB 是 flag 曾被打开过的产物，**它不会因为 flag 现在关着就消失，也不会因为代码不删就变得无害**。本端建议裁定把「存量数据处置」**从 Q10 里摘出去单列**，理由是它 **既不因删代码而起、也不因不删而免**（E-0031）。

  **四 · 逐问建议处置**

  | 问 | 建议 |
  |---|---|
  | **Q1** | 不落在本端。**唯一请求**：无论定成什么，规格必须同时覆盖 **三道白名单**（后端 13 键 / presenter `TOP_LEVEL_KEYS` / journal reload 那条第二投影管线），否则修完还会漂 —— S-0007 U-R2 说的是两侧，实测是 **三侧**（E-0026） |
  | **Q1-前段** | **请把问法改掉**（见请求 2）。实体答案：**今天走 `done` 信封不走 runtime event 流；两条路线的成本差 2 名 owner ↔ 5 名 owner 含跨仓；本端在两条路线上的改动量都是 0 行** |
  | **Q9** | **wire key `memory_agent_config` 判「不做」**。**双默认值改判为「契约隐患，renderer 侧不可达」**，处置是「后端删掉那个默认值或改成同一个词，二选一，并加一条跨侧断言」，归 `code-owner-runtime` + `code-owner-settings`。**请裁定别把 wire key 与用户可见文案写成一条** —— 后者归 chat-bubble 与 settings，且如 S-0007 所言那其实是「Memory V2 这块界面没接 i18n」，独立于 Q9 |
  | **Q10** | 不落在本端。出两条证词：**(i)** `enable_memory_v2` 默认 false、无 build 级覆盖（E-0031）→ **今天无用户可见紧迫性**，S-0007 的「用户可见能力净减少」在默认安装上不成立；**(ii)** 存量数据处置应从 Q10 摘出单列 |

  **五 · 本端看到、而 `case.md` 与 `FRAMING` 未列出的未决项（U-C1 … U-C7）**

  - **U-C1 · Q1-前段 的两个原文实体都不是承载体，其中一个是本端前案点错的。** 本条已在 **不确定性 (b)** 正式撤回。**处置属本庭**（改问法），本端已提请求 2
  - **U-C2 · runtime event 词汇表是封闭 14 项 + 两道静默丢弃门 + 一个零消费者的诊断缓冲**（E-0027）。这是 S-0007 U-R2 描述的失败类 **在上游一层的同形，且更糟**：presenter 至少有一张能读的白名单，reducer 那道 **什么都不记**。**这是 Q1-前段 真正的判据所在，`FRAMING` 与已归档发言均未列。属 `code-owner-shared-arteries`**
  - **U-C3 · `enable_memory_v2` 的 build 默认值是 `false`，全仓无覆盖**（E-0031）。S-0007 的「发布配置（V2 active）」这个前提要改读法：发布配置是 **V2 整体关闭**，两条平面都零产出。**这条改变的是 Q10 的紧迫性，不改变 (c) 的结论**
  - **U-C4 · 若形态裁向「过程信号」且走新增事件类型，本案 quorum 不完整。** `code-owner-unchain` 被 S-0002 以「本案不含 unchain 侧改动请求」排除，该前提在这一支上不再成立。**这是一条程序未决项，属第三层门禁**
  - **U-C5 · `memory_v2` 帧的顶层键表有三个持有者，不是两个。** S-0007 U-R2 说「两侧各维护一份键表」，实测第三份在 `route_chat.py:60-74`（13 键 allowlist，`memory_v2` 在内）。**裁 U-R2 时若只裁两侧，第三道门会在下一次成为漂移点**
  - **U-C6 · `bundle` 同名不同源，是本案第四处同词异义。** PuPu 的 `_build_bundle_from_result` 产的 bundle（含 `memory_v2`）走 `done` 信封；unchain kernel 的 `run.completed.payload.usage` 也叫 bundle（不含 `memory_v2`），是本端 `:5766-5771` 的兜底源。**两者在 `message.meta.bundle` 这一个字段上竞争写入。** 今天无害（后者永远不含 memory_v2），但任何「让 runtime event 承载 memory_v2」的方案会让两者内容交叠，**而本端的兜底逻辑是「A 缺席才用 B」而不是合并**
  - **U-C7 · 存在一条不必开 `RUNTIME_EVENT_TYPES` 的「过程信号」路。**（E-0032）改 `route_chat.py:1086` 那个 `continue` 放行，或让 admission diagnostics 搭既有事件类型的 payload。**在传输层是通的，本端已核实到行。** 本端 **不主张其可行** —— 取舍归 `code-owner-runtime` 与 `code-owner-shared-arteries`。**列出来是因为：如果第 0 段裁向「过程信号」，这条路可能让成本回到路线 A 的量级，而本案至今没人提过它**

  **六 · 越界内容清单（标为参考，不计入本端结论）**

  形态的产品取舍（过程信号 vs 审计块的用户价值）→ `expert-ux` 与 `0000-0003-2026-0807` · `route_chat.py` 的 13 键 allowlist 与那个 `continue` → `code-owner-runtime` · `event_store.js` / `activity_tree.js` / `memory_v2_trace_presenter.js` 三者的取舍 → `code-owner-shared-arteries`（本批同僚，S-0013）· `service.js` 中继段 → `code-owner-electron`（批次 4）· unchain `events/{types,normalizer}.py` → `code-owner-unchain`（**不在必到名单**）· `memory_agent_settings.js:24` 的默认值 → `code-owner-settings`（批次 3）· `Isolated` 同词异义与 `reason` 取值集固化 → `code-owner-runtime` 与 `expert-llm`。

  **前案遗留（不在本案，指名承接）**：本端在 `0000-0001-2026-0807#S-0006` 提的 Q4-A / Q4-B / Q4-D → `0000-0003-2026-0807`；Q4-C（flag-off 分叉）→ `0000-0004-2026-0807`，且请承接方带上 S-0007 对其性质的更正与本条 E-0031 的 flag 默认值事实。

#### S-0013 | ASSESSMENT | code-owner-shared-arteries → case
- **阶段**: 议案庭审
- **结论**: **选 (c)** —— 但 (a) 不是被 (c) 的论证击败的，是被 **它自己声明的成立条件** 击败的：S-0006 称「规格写在 `memory_v2_context.py:190-196` 与 `unchain_adapter.py:1132-1139` 之上」是 (a) 成立的 **全部条件**，实测该两个锚点 **一个落在被 fail-closed 门关掉的 `_finalize_memory_v2_curator`（902–1153）体内、一个只是准入清单不是产出者**（E-0039）。同时本轮在 presenter 内量到一项 **与 Q1 词汇、与 Q10 删除都无关、发布配置下今天就在发生** 的正确性缺陷 —— **active 面自己的降级信号被本 owner 的白名单整个丢掉，trace 于是在一个真实降级过的回合上报 `Complete`**（E-0034）—— 该项 **必须切出 (c) 之外立即单独处置，不得随 (c) 排队**
- **依据**: E-0033 ~ E-0040（八条均由本 owner 取证，其中 E-0033 / E-0034 含逐字节复制件 sha256 与可复现 `node` 探针）；本案 E-0004 · E-0005 · E-0011 · E-0013 · E-0015 · E-0016 · E-0017 · E-0022 · S-0006 · S-0007 · S-0008；跨案 `0000-0001-2026-0807#S-0005` · `#S-0006`
- **不确定性**:
  1. **一切关于「用户会看到什么」的判断基于空态推演。** 全部探针 bundle 由本 owner **按产点形状构造**，非真实 SSE 抓取；本机 `entries=0`（`0000-0001-2026-0807#E-0002`），**本 owner 没有在运行中的应用里看过任何一个 Memory V2 trace 行**
  2. **E-0039 是源码控制流复核，未跑运行时。** 只核实了门与产点的 **位置关系**，未核实 `active_context_bridge` / `graph_active_bridge` 在每条路径上恒等于 `memory_v2_active_bridge`（`:10127` / `:10835` 为 `getattr` 读回）
  3. **E-0037 的「后端全域不出现」未覆盖 unchain 仓**（`/Users/red/Desktop/GITRepo/unchain`）。若某死键由 unchain 侧经透明代理产出并进 bundle，对该键的判定要打折
  4. **E-0034 只证明「一旦 `mark_host_partial` 的 `is_active` 分支被触发，presenter 会报 Complete」**，未证明触发频率；触发条件属 `code-owner-runtime`
  5. **越界读取声明**：为核算落差读了 `unchain_runtime/server/{unchain_adapter,memory_v2_context,memory_v2_curator}.py` 与 `chat-bubble/memory_v2_journal_reload.js`。**那些结论标注为参考，最终以各自 owner 为准**
  6. **迁移成本为静态估算**，未实际执行迁移、未跑迁移后测试
  7. **未派生任何子 instance；本轮只读，未改任何产品代码，未 commit。** 本 owner 的 `.claude/agent-memory/code-owner-shared-arteries/` 此前为空，本轮 **未写入**（无 2+ 次验证的沉淀物）
- **请求/下一步**:
  1. **请把 E-0034 从本案的两问里摘出来，单列为可立即执行的切片。** 它不属于 Q1（不是词汇问题）、不属于 Q10（不碰待删清单）、不需要等 active 面的遥测产出者。**它是本 owner 边界内一处发布配置下的正确性缺陷，本 owner 接。** 若裁定把它捆进 (c)，一个今天就在误报的面会跟着一个有不可闭合前置的议题一起排队
  2. **请裁定写明 `TOP_LEVEL_KEYS` 是三件事的共用判据** —— 渲染投影 · **SQLite 持久化形状** · **Memory V2 节点挂不挂载**（E-0036 之三）。**动它同时是一次持久化 schema 变更**，而这一点 `code-owner-chat-bubble` 既看不见也不承担后果
  3. **请就「`memory_v2_journal_reload.js` 的数据层迁入 `src/SERVICEs/runtime_events/`」出裁定。本 owner 收**，附四条条件（见建议处置六）
  4. **请把 Q9 的 i18n 部分从本案摘出，并重新定范围** —— 不是「Memory V2 没接 i18n」，是「`chat-bubble` 整面从来没接过」（0/9 文件用 `t()`），且 `src/locales/` 自身已欠 **49 键 × 9 语言且无门禁**（E-0040）
- **评估结论**: 见「建议处置」。**对本轮六项定向质询的逐条表态先列于此，以便与已归档发言直接对齐**：

  | # | 质询 | 本 owner 表态 |
  |---|---|---|
  | 1 | E-0017：7 键丢 6；顶层 `Complete` 与 `agentRuns[0]="Isolated"` 同屏矛盾 | **确认，并两处加重、一处精确化** |
  | 2 | S-0008 推论 2：`sanitizeNode` 子对象通用递归，故透出两字段不需动 `TOP_LEVEL_KEYS` | **确认结论，更正其推理的一处遗漏** |
  | 3 | E-0005 / S-0008 推论 3：双边契约、Q1 成本更低、应裁为双边共同交付 | **部分确认** —— 处置接受，**定性反驳**（不是双边，是三方，第三方是本 owner 自己） |
  | 4 | S-0006 §7 分界线与两处判定放错位置 | **确认，并接受回收**；附一条该节没写的反向事实 |
  | 5 | S-0006 §7.3：journal reload 整体迁入 `runtime_events/` | **收，条件收**；**反驳其一处因果**，**并反驳「Q1 前置条件」这一定位** |
  | 6 | Q9：确认 runtime 的撤回；「未接 i18n」是否属实、该不该在本案处置 | **确认撤回；「未接 i18n」属实但范围应放大；反对在本案处置** |

- **边界命中依据**: 本案在本 owner 四条边界声明上命中：

  | 边界条目 | 命中对象 |
  |---|---|
  | `pupu:src/SERVICEs/runtime_events/**` | **`memory_v2_trace_presenter.js`（415 行）—— 本案在本 owner 边界内唯一相关的文件。** 实测 `trace_chain_adapter.js` 的 `memory` 命中为 **0**，`runtime_events/` 其余 6 个非测试文件 `memory_v2\|memoryV2\|memory_agent` 命中亦为 **0**（E-0036）。co-located `memory_v2_trace_presenter.test.js` 依 A-008 归本 owner |
  | `pupu:src/SERVICEs/chat_storage/**` | `chat_storage_sanitize.js:21`（import）与 `:739`（唯一调用点）；co-located `chat_storage_memory_v2_trace.test.js`（本案争点的现成活证据，E-0035 之二） |
  | `pupu:src/SERVICEs/bridges/**` | **`context_v2_bridge.js`** —— 本案第二条数据通路（journal reload）的来源。`FRAMING` 与两份已归档 `ASSESSMENT` **均未把它记为本 owner 的命中点** |
  | `pupu:src/locales/**` | Q9（E-0040） |

  **边界更正 —— 确认 S-0002 自愈信号 1 的分类正确，不反驳。** 本 owner 边界第 3 条确实正确覆盖 `memory_v2_trace_presenter.js`；处方「改立案抽取、不改这份 charter」正确，S-0011 已回归验证。**但补一条该信号与后续四条自愈信号都没写到的**：立案与两份已归档 `ASSESSMENT` 都只把本 owner 认成「presenter 的 owner」。实际上 **本案两条数据通路的起点都在本 owner 边界内** —— bundle 路径经 `memory_v2_trace_presenter.js`，journal 路径经 `bridges/context_v2_bridge.js`。**漏的不是一个文件，是一条完整通路的入口。**

- **受影响对象**:

  | 编号 | 落位 | 本 owner 的对象 |
  |---|---|---|
  | **Q1** | **落在本 owner（词汇归一的实现方）** | `resolveTraceStatus:162-196` · `presentAgentRun:301-348` · `agentRunSources:280-299` · `TOP_LEVEL_KEYS:9-69` · `REF_PATTERNS:71-78` |
  | **Q1-前段** | **落在本 owner，作为收端** | `TOP_LEVEL_KEYS` 是 memory_v2 帧顶层键的 **收端权威**。**本 owner 认领 U-R2 的收端一半** |
  | **Q9** | **部分落在本 owner**（`src/locales/**`）。识别符 / wire key / storage namespace / 错误码 / prompt 常量 **不落在本 owner** | `src/locales/` 11 个 JSON · `boot_locale_parity.test.js` |
  | **Q10** | **不落在本 owner** —— 四个待删文件全在 `unchain_runtime/**` | 但本 owner 的白名单是「删除后收端还剩什么」的判据，故出证词（E-0039 之二） |

  **需在本 owner 边界内改动的（按可独立性排序）**：① `TOP_LEVEL_KEYS` 补 4 个 active 面降级键 + `resolveTraceStatus` 两条 clause（**零跨 owner 依赖，E-0034**）；② `resolveTraceStatus` 的 fail-open 默认改为 fail-closed（**零跨 owner 依赖，E-0033 之 P6**）；③ 清 7 个死顶层键 + 7 个死 agent-run 源键（**依赖 Q10 结果**）；④ `presentAgentRun` 透出 `worker_status` / `candidate_count`（**依赖产帧端二元组归一**）；⑤ 接收 journal reload 数据层（**依赖裁定 + chat-bubble 配合**）。

- **约束**:

  1. **`TOP_LEVEL_KEYS` 的每一次改动都是一次持久化 schema 变更。** 它同时决定渲染投影、`chat_storage` 写进 SQLite 的形状、以及 `isMemoryV2TraceBundle` 的挂载门（E-0036 之三，探针实测：只含非白名单键的 bundle → 挂载门 `false`）。**任何把它当成「渲染字段表」来讨论的方案，本 owner 预先反对。**
  2. **`resolveTraceStatus` 的默认值必须先于词表处置。** 今天 `Isolated` / `NoOp` / `Running` / `Pending` / `Leased` / `Cancelled` **六个词全部落到 `mode === "active" → "Complete"`**（E-0033 之 P6）。**这是 fail-open。任何「把缺的词加进去」型规格只修好已经想到的词，下一个后端发明的词仍然渲染成 Complete。** 裁定必须把「未知状态词不得解析为 Complete」写成 **约束**，而不是把某个具体词表写成 **清单**。
  3. **本 owner 的测试同样不接生产形状 —— 「跑一遍 presenter 测试」不是验收。** `memory_v2_trace_presenter.test.js` 的主 fixture 用 `curator_run` 挂 agent run，而该键 **在后端全域一次都不出现**（E-0037）。**本 owner 在这一点上与 `code-owner-chat-bubble` 作同一份证词**（其 E-0013 证明 21 条测试把 `context_v2_bridge` 整体 mock）：**两个 owner 的单元测试在这条路径上都不具备证明力。** 验收必须是在运行中的应用里、一个真实产生过对应事件的会话上人眼看过一次。
  4. **不得在不同步收端的前提下，把「后端加了键」当成「UI 拿得到」。** 这条是 `code-owner-runtime` 约束 2 的镜像，本 owner 认领另一半：**收端白名单的维护责任在本 owner，但本 owner 今天没有任何机制知道产端加了键。** 见 U-A4。
  5. **本轮只读，未改任何产品代码，未 commit，未派生子 instance。** 唯一写入是本案 `.inbox/` 下的 `S-0013.md` 与 `E-0033`…`E-0040`。**本 owner 的 memory 目录本轮未写入** —— 本案结论尚未被验证两次，按记忆纪律不沉淀。
  6. **若裁定采纳迁移，它必须是「移动」不是「重写」**，并与词汇变更 **分成两个切片**。合在一起会让一次行为变更藏在一次搬家里，而 E-0038 已证明这两个文件的同名函数 **已经漂了**（`titleCase` 一侧多剥一个点号）—— 合并时任选一侧都在改行为。

- **建议处置**:

  **一 · 核心问题：(c)，理由与 S-0007 不同**

  **(a) 不成立，且不是因为 (c) 更好，是因为 (a) 的提出者自己把成立条件说死了而那个条件不成立。** S-0006 的观察本身对：删掉那四个文件，渲染端一个词都不会失效 —— **本 owner 不反驳**。但它接着写「**规格必须写在 `memory_v2_context.py:190-196` 与 `unchain_adapter.py:1132-1139` 之上……请把这句写进裁定 —— 它是 (a) 成立的全部条件**」。实测两个锚点（E-0039 之三）：

  - `unchain_adapter.py:1132-1139` —— 落在 **1132–1139**，而 `_finalize_memory_v2_curator` 的函数体是 **902–1153**。**它在被那三个门（`:9645` / `:10433` / `:11177`）关掉的函数体里面。** 它不在删除清单里，所以删除后文件还在 —— 但它 **照样不执行**
  - `memory_v2_context.py:185-197` —— 是一个可持久化语义事件类型的 `frozenset` **准入清单**。它 **校验**，不 **产出**

  **即：S-0006 为 (a) 选定的两个「安全锚点」，一个在死轴上，一个不是产出者。按它自己声明的标准，(a) 不成立。**

  **(b) 最差，本 owner 从收端再加一条独立理由。** 删除后 `memory_agent_runs` 归零，而本 owner 的 `agentRunSources` 读的另外 7 个入口 **后端全域从不产出**（E-0037）；本 owner 唯一的 co-located 测试用的正是其中一个死键。**删完之后，收端既没有活输入，也没有一条有生产效力的测试 —— 那时写的任何词汇规格都是不可证伪的。**

  **(c) 成立。** 本 owner 同意 S-0007 的三段式（① 先补 active 面遥测产出者 → ② 在新产出者上定词汇 → ③ 然后才删），并 **接下第 ② 段的收端一半**：词汇归一的实现落在 `resolveTraceStatus` / `presentAgentRun` / `agentRunSources`，本 owner 接。

  **但请把 (c) 的表述从「二者必须在同一份方案里同时落」改成「三段有序，且第一段是一个交付物不是一次讨论」** —— 「同时落」会被读成「一次性发一个大 PR」，而这三段的可逆性差了两个数量级：补产出者是加法（可逆），定词汇是收端改动（可逆），删除一个数据平面是不可逆的（且依 E-0024 还欠一个存量 store 的处置机制）。

  **二 · 必须切出 (c) 之外的一项：active 面降级信号被丢（E-0034）**

  这是本轮最要紧的发现，庭上无人提出过。后端 `mark_host_partial` **显式按 `admission.is_active` 分支**：active 面产 `unchain_context_status="partial"` + `unchain_context_error_code`；shadow 面产对应的两个。**本 owner 的 `TOP_LEVEL_KEYS` 四个键一个都不收。** 探针实测：

  ```
  后端产出 unchain_context_status="partial" + error_code   → presented.status = "Complete", errorCode = ""
  对照组：同一失败改用白名单内的 persistence_degraded      → presented.status = "Partial",  errorCode = "context_v2_persistence_failed"
  ```

  **对照组排除了「语义微妙」这个解释 —— 就是一次纯粹的丢键。** 与 `Isolated` 无关、与 `pupu_legacy` 无关、与删除清单无关：**在发布配置下，Context V2 持久化失败的回合，trace 上写着 `Memory V2 · Complete`。**

  **这把 `0000-0001-2026-0807#S-0006` 的 Q4-C 与 S-0006 的病 2 推进了一层**：S-0006 说「有界面而且它长得像成功」，指的是 legacy 面的 `Isolated` 渲染成绿点。**本条说的是 active 面 —— 那里连一个可以长得像成功的行都没有，它直接在顶层写了 `Complete`。**

  **修复完全在本 owner 边界内、无跨 owner 依赖、不依赖本案任何一问的裁定结果**：`TOP_LEVEL_KEYS` 补四个键 + `resolveTraceStatus` 补两条 clause（复用既有的 `persistence_degraded` 分支形状）。**本 owner 接，请授权它先走。**

  **三 · Q1 的实体回答：presenter 不够，但缺的既不是「分层」也不是「状态种类」**

  **部分修正 S-0006 与 `#S-0005` 两侧。** 从本 owner 这一端看，presenter 有三个各自独立的病：

  | 病 | 实证 | 是否依赖 Q10 |
  |---|---|---|
  | **P-1 · 状态归一是 fail-open** | 六个词全落 `Complete`（E-0033 P6）；且顶层直接写 `status:"Isolated"` 也照样 `Complete`（P3） | **否** |
  | **P-2 · 白名单丢掉 active 面的降级信号** | E-0034 | **否** |
  | **P-3 · 词汇表里 7 个顶层键 + 7 个 agent-run 源键是死的**，其中 `trace_status` 还占着 `resolveTraceStatus` 的首选输入位 | E-0037 | **是** |

  **P-1 与 P-2 今天就该修，且与 (a)/(b)/(c) 的裁定结果无关。P-3 必须等 Q10。** 这个切分才是 Q1 在本 owner 边界内的真实形状 —— **它不是一个「要不要加状态」的问题，两件最要紧的事都是减法和改默认值。**

  **对 S-0006 病 1（词汇碰撞）的表态**：成立，且本 owner 承认碰撞的一半来自自己 —— presenter 轴的 `Complete/Partial/Unavailable` 与 journal reload 轴的同三个词，后者的实现在 `chat-bubble` 里但 **schema 是本 owner 的返回对象**（`mergeMemoryV2AuditWithJournal` 直接往里加 `journalReload` 字段，E-0038 之四）。**去重的实现点应在本 owner，见第六节。**

  **四 · Q1-前段：本 owner 认领「收端键表由谁持有」这一半（U-R2）**

  `code-owner-runtime` 请求把这条交 `expert-architecture` 与本 owner。**本 owner 接收端一半，并给出一个具体的形状**：

  - **产端**（`_memory_v2_merge_diagnostics` 的 kwarg 集合）属 `code-owner-runtime`；**收端**（`TOP_LEVEL_KEYS`）属本 owner。这一分工今天已经是事实，问题不在归属不清，在于 **两侧之间没有任何东西**
  - **今天的漂移量已经量到**：7 个合并键活 1 个（E-0033 P1）；59 个白名单项里 7 项后端全域不存在（E-0037）。**两个方向都在漂**
  - **本 owner 的建议不是「把表合并到一处」** —— 收端必须保留独立的安全封顶权（这是白名单存在的理由，见约束 1）。**建议是加一个双向的对账断言**：一条测试，读产端的 kwarg 集合与收端的 `TOP_LEVEL_KEYS`，对 **差集两侧** 各自要求一个显式的「知情豁免」清单。产端加键而收端没登记 → 红；收端留着一个产端已经不产的键 → 红。**本 owner 接这条测试的收端一半，产端一半属 `code-owner-runtime`**
  - **对 Q1-前段 本问的直接回答**：`runtime_events/` 一侧 **零帧**（复核 E-0011 在本 owner 边界内的部分成立，E-0036 之二）。**但本 owner 反对把这一问收敛成「流承不承载」** —— 支持 S-0006 的改写：真正的岔路是「Memory V2 的整理结果是回合内的过程信号，还是回合后的审计块」。**今天的实现已经选了后者，而这个选择从来没有被人当成一个选择做过。**

  **五 · Q9：确认撤回；「没接 i18n」属实但范围要放大；反对在本案处置**

  - **确认 `code-owner-runtime` 的撤回。** 作为 `src/locales/**` 的 owner 出证：`en.json` 638 个叶子键、18 个 section，**没有任何 Memory V2 / Memory Agent / curator / trace section**（E-0040）。`0000-0001-2026-0807#S-0005` 的「用户可见文案属 `src/locales/**`、可现在改、零风险」**三处全错**，撤回正确
  - **一条须写进裁定的陷阱**：`src/locales/` **有** 一个叫 `memory` 的命名空间（21 键），但它属于 **V1 chat memory**（embedding model / recall top-K / long-term threshold）。**把 Memory V2 的词塞进 `memory.*` 会造成本案的第二处同词异义**（第一处是 `code-owner-runtime` 的 U-R3）
  - **「未接 i18n」属实，但不是 Memory V2 的缺陷。** 实测 `chat-bubble` **9 个非测试文件，`t()` 命中 0**。整个消息渲染面从来没接过。Memory V2 那 4 处硬编码是这个既有状况的 4 个实例
  - **反对在本案处置，理由不是成本，是它会把一个大得多的债务拖进一个关于 trace 词汇的 case。** 且 **`src/locales/` 本身不是一个免费落点**：9 个语言各缺 **49** 键（`dev` 20 · `local_storage` 26 · `chat` 3），zh-CN 缺 3，**且全仓唯一引用 `locales` 的测试是本 owner 的 `boot_locale_parity.test.js`，只覆盖 boot gate 的失败码**。boot 之外无门禁
  - **本 owner 的承诺**：若裁定要求，**本 owner 接一个覆盖全 section 的对等性门禁**（把 `boot_locale_parity.test.js` 的做法推广）。**但请把它当作「往 `src/locales/` 新增任何东西的前置」来裁，而不是 Q9 的一部分** —— 否则「接 i18n」的实际效果是「把英文字面量搬进 JSON，然后在 10 种语言里继续显示英文」

  **六 · 分界线与迁移：确认分界线，条件接收迁移，反驳两处**

  **确认 S-0006 第 7 节第 1 点的分界线**：线画在 `presentMemoryV2Audit()` 的返回对象上；**词汇表是本 owner 的**；返回对象怎么变成像素是 `chat-bubble` 的。**本 owner 接受这条线，并接受第 2 点的回收** —— `trace_chain.js:1962-1963` 的活跃词表与 `:1949` 的 `Unavailable` 三元判断应由本 owner 以 `run.isTerminal` / `run.isFailure` 布尔提供。**本 owner 追加一条同类的**：顶层也需要一个 `isDegraded` 布尔，否则 E-0034 修好之后 `chat-bubble` 仍要靠字符串比对来决定画不画 `ErrorPoint`。

  **但要补一条该节没写的反向事实**：这条线 **今天已经被反向越过了**。`mergeMemoryV2AuditWithJournal`（`:483-498`）返回 `{...audit, refs, agentRuns, journalReload}` —— **`chat-bubble` 在给本 owner 的返回对象加字段**。若裁定确认这条线，这次写入也落在本 owner 一侧。

  **迁移：收，四条条件。** 成本核算（E-0038 之五）比 S-0006 描述的低，**因为文件已经是分好的**：583 行里 `:1-498` 是纯数据层（无 React），`:500-583` 是 84 行的 React 组件；全部 import 只有两个，其中 `context_v2_bridge` **已在本 owner 边界内**；外部消费者两处，其中一处只需改一行 import 路径。**即：在 `:498` 处切一刀，上半段移入 `runtime_events/`，组件留在 `chat-bubble`。**

  重复是真的且已量到：`BUNDLE_REF_PATTERNS` 与本 owner 的 `REF_PATTERNS` **6 条逐字节相同、顺序相同**；`curatorRunFrom:134-168` 产出的是 **本 owner `presentAgentRun` 的同一个 17 键 schema**。**而且它已经漂了** —— 两侧 `titleCase` 一个剥 `[_-]`、一个剥 `[_.-]`。**`context_v2_bridge.js` 自己的文件头早就写下了适用的原则：「a second, drifting copy of the rules here would be worse than none」。这是本 owner 边界内既有的成文约束，不是本轮为支持结论新提的主张。**

  **四条条件**：① **移动不是重写** —— 同名函数、同行为、只改 import 路径，co-located 测试随源文件走（A-008）；② React 组件留在 `chat-bubble`；③ **自成一个切片，有独立的 before/after**，不与词汇变更合并（约束 6）；④ **本 owner 不接受把它定位成「Q1 立规格的前置条件」**。

  **反驳两处**：
  - **因果反驳**：S-0006 称「`worker_status` / `candidate_count` 被丢两次，都是这个结构的直接产物」。**不成立。** 两次丢弃机制不同 —— presenter 丢在 `presentAgentRun` 的显式 17 键构造，journal 丢在 `curatorRunFrom` 的显式 18 键构造，**两处各自都是「逐字段显式列举」，不是「因为有两份所以漏」**。合并文件只消掉第二次，第一次原样保留。**这个区分要紧：否则裁定会以为做完迁移这两个字段就自动出来了。**
  - **定位反驳**：迁移不是 Q1 的前置，是 **(c) 第 ② 段（在新产出者上定词汇）的前置**，且 **可与 ① 段（补产出者）并行**。把它写成 Q1 的前置会让一件纯结构整理挂在一件有不可闭合前提的事后面。

  **七 · Q10：不落在本 owner，但出一条收端证词**

  **删除后本 owner 这一端会发生什么：`presentMemoryV2Audit(...).agentRuns` 从「发布配置下恒为 `[]`」变成「任何配置下恒为 `[]`」。** 前半句今天已经成立（E-0039 之二，探针实测 `agentRuns.length : 0`）。**即：从收端看，Q10 的删除不是「拿掉一个能力」，是「拿掉一个在发布配置下已经拿不到的能力的最后一个非发布配置产出者」。** 这与 `code-owner-runtime` 的 Q10-新1 一致，但角度不同：它说「trace 的 memory agent 轴从只有 legacy 有变成谁都没有」，本 owner 说 **「收端今天在发布配置下已经是谁都没有了」**。**两条合起来才是完整的：删除不改变发布配置下的用户体验，因为发布配置下这条轴本来就是空的。**

  **八 · 本 owner 看到、`case.md` 与 `FRAMING` 未列出的未决项（U-A1…U-A5）**

  - **U-A1 · active 面降级信号被收端丢弃**（E-0034）。**本轮最重要的一条，且是唯一一条不需要等任何裁定就能修的。** `FRAMING` 全文只讨论 `Isolated`，而 `Isolated` 依 E-0016 只在 legacy 面产出 —— **本案至今讨论的所有「trace 报 Complete」都发生在一条发布配置下不跑的平面上，而发布配置下真正在跑的那条也在报 Complete，原因完全不同**
  - **U-A2 · `resolveTraceStatus` 是 fail-open，不是缺词**（E-0033 P6）。**这决定 Q1 的规格该长什么样**：写约束（未知词不得为 Complete），不是写清单
  - **U-A3 · `TOP_LEVEL_KEYS` 同时是持久化 schema 与挂载门**（E-0036 之三）。**今天没有任何一方把改它当成 schema 变更对待**，包括本 owner 自己
  - **U-A4 · 本 owner 没有任何机制知道产端加了键。** 这是 U-R2 的收端表述。`code-owner-runtime` 的约束 2 要求「不得在不同步收端的前提下加键」—— **但那条约束今天没有执行者。** 本 owner 提议的双向对账测试（第四节）是让它有执行者的最小做法
  - **U-A5 · `src/locales/` 的对等性无门禁**（E-0040）：49 键 × 9 语言，唯一的 parity 测试只覆盖 boot。**这是本 owner 边界内一条与本案无关但被本案照出来的既有缺陷，登记以免灭失**

  **九 · 越界内容清单（标注为参考，不计入本 owner 结论）**

  `mark_host_partial` / `mark_graph_active_partial` 的触发条件与是否该继续用这两个键名 → `code-owner-runtime` · `_finalize_memory_v2_curator` 门链的运行时行为 → `code-owner-runtime` · `(status, worker_status)` 二元组归一 → `code-owner-runtime` · `memory_v2_journal_reload.js` 的最终处置 → `code-owner-chat-bubble` 与本 owner 共同 · `ErrorPoint` / 颜色 / 行标题措辞 → `code-owner-chat-bubble` · `use_translation.js` 机制本体 → `code-owner-ui-primitives` · 「审计面该不该长在用户可见 trace 上」→ `0000-0003-2026-0807`（`expert-ux`）· 帧顶层键表的跨层归属裁点 → `expert-architecture`

#### S-0014 | ASSESSMENT | expert-llm → case
- **阶段**: 议案庭审
- **结论**: **本案在帧语义上问错了一层：不存在「要定义一套 trace 词汇」这件事 —— 一套闭集、typed、构造时校验的终态词汇已经存在于 `unchain.memory.curator.models`，而 PuPu 的 active 面已经在四个模块里消费它（E-0044）；同时 active 面的 memory-agent 遥测产出者也已经存在、已 typed、已自陈 content-free，只是被产出者自己那一行丢掉（E-0045，`unchain_adapter.py:9471` 写入后零读取，`last_receipt` / `last_failure_code` 两个 property 全仓零消费者）。** 故本领域选 **(a)**，但 (a) 的锚点不是 `code-owner-chat-bubble` 提名的那两个（S-0013 已证其不成立），而是 **上游 typed 枚举** —— 它不在删除清单、不在任何 fail-closed 门内侧、不在 PuPu 仓，是本案唯一满足 S-0006 自陈标准的锚点。**并且：任何词汇规格必须与「终态解析改为 fail-closed」同一份落地，否则等于没写** —— 因为终态今天不由状态决定：顶层由 **自由文本 `reason` 的子串匹配** 决定，run 轴 **根本没有词表**，是 `titleCase(任意字符串)`（E-0043，实跑）
- **依据**: E-0041 ~ E-0046（六条均由本人取证，其中 E-0043 含逐字节复制件 sha256 与可复现 `node` 探针）；本案 E-0002 · E-0004 · E-0015 · E-0016 · E-0017 · E-0018 · E-0019 · E-0020 · E-0021 · E-0030 · E-0031 · E-0033 · E-0034 · E-0035 · E-0037 · E-0039；S-0002 · S-0006 · S-0007 · S-0008 · S-0011 · S-0012 · S-0013；跨案 `0000-0001-2026-0807#S-0005`
- **不确定性**:

  **一 · 模型替代是否实质影响本次结论：不影响。逐项声明如下，本领域不请求任何一项列为已知缺口。**

  本次全部结论由三类可机械复核的东西支撑：(i) 引用到 `file:line` 的静态读取；(ii) 一个逐字节复制件 + sha256 + 可复现 `node` 探针（E-0043）；(iii) 负向 grep 并附命令原文。**没有任何一项结论依赖模型层的推理深度或世界知识。** 唯一属于判断而非观察的是「采纳上游枚举、按轴分离、fail-closed」这条处方 —— 但它的每一步都由上列证据推出，且本条已同时写出被它排除的替代方案（见专业理由一），任何评审者可按同一批证据独立复核。**故本领域不主张「某项因模型替代而不作结论」，也不接受把本条任何结论按「未经 charter 指定模型层」折价。** 若本庭仍要求登记一条缺口，正确的登记方式是「S-0014 以 `opus` 出具，其结论均可由所附证据机械复核」，而不是标注某一项失效。

  **二 · 有条件成立的全部必要条件（缺任一条，本领域的「成立」不再有效）**

  1. **词汇必须是采纳，不是发明。** trace 的 memory-agent 终态词汇必须取自 `unchain/src/unchain/memory/curator/models.py` 的八个 `StrEnum` + `curator/host.py:51-55` 的 `MemoryAgentWorkerDisposition` + `memory_v2_unchain_worker.py:400-415` 已算好的四个稳定失败码（E-0044 / E-0045）。**PuPu 侧不得再自行铸造状态词。** 具体禁止项：不得照 `memory_v2_curator.py` 写、不得照 `memory_v2_context.py:185-197` 的 7 个事件名写（那是第三套互不对齐的词汇）、不得把 `titleCase(后端字符串)` 保留为呈现词的来源
  2. **fail-closed 与词汇同一份落地，且 fail-closed 排在前面。** 必须删除 `memory_v2_trace_presenter.js:191` 的 `reason` 子串分支（终态不得由自由文本拼写决定）；必须把 `:328` 的 `titleCase(run.status)` 换成 **闭映射 + 一个显式的未知态**；`:195` 的兜底必须从 `Complete` 改为降级态。**只加词不改默认值，等于把「未知 → Complete」这条 bug 写进一份看起来像契约的文档里 —— 那比现状更坏**
  3. **`reason` 取值集合不得按 S-0007 提议的形式固化。** 见专业理由一之(3)。若本庭仍要固化，本领域的「成立」撤回
  4. **删除 `memory_v2_toolkit.py` 之前，须核对两个 `memory_propose` 的参数 schema 兼容性。** E-0046 只核对了工具名集合与描述结构，**未核对入参名/类型/必填性/返回形状**。这一项是 Q10 在本领域的唯一未闭合前置，成本是一次静态比对
  5. **`PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT` 与 `LOCKED_CORE_PROMPT` 明确划出 Q9 的命名清理范围**，理由见专业理由二

  **三 · 本轮的取证限制**

  - **未在运行中的应用里看过任何一条 Memory V2 trace 行；未起 sidecar；未抓过一次真实 SSE。** E-0043 的探针 bundle 由本人按产点形状构造。与 S-0006 / S-0013 同一条限制，本领域不例外
  - **E-0045 的「零消费者」是静态 grep 结论**，已覆盖字面量与 `getattr` 字符串两种形式，**未覆盖** `vars()` / `__dict__` / 反射遍历
  - **E-0044 中「三条轴 → `Isolated` 四个 reason」的对应关系是本人依语义作出的映射，不是代码里已有的映射**，未实测；裁定方是 `code-owner-runtime`
  - **越界读取声明**：为核算模型可见性与词汇来源，读了 `unchain_runtime/server/{memory_v2_unchain_agent_factory,memory_v2_unchain_model_invoker,memory_v2_unchain_worker,memory_v2_unchain_graph_root_completion,memory_v2_unchain_root_completion,memory_v2_curator,memory_v2_toolkit,memory_v2_context,route_chat,unchain_adapter}.py`、`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`、`src/SERVICEs/memory_agent_settings.js`、`src/PAGEs/chat/hooks/use_chat_stream.js`，以及 unchain 仓 `src/unchain/memory/{curator/models.py,curator/host.py,module.py,toolkit/policy.py,toolkit/toolkit.py}`、`src/unchain/agent/agent.py`。**这些文件的处置一律以各自 owner 为准，本条只作帧语义、prompt 装配与 tool schema 三项核算**
  - **`claude-api` skill 未调用，理由已核实**：本条不主张任何模型事实（无 model id / 定价 / 上下文窗口 / 速率限制 / 能力断言）。另按该 skill 自带的 SKIP 判据实跑 `grep -rlE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'`，本项目命中 **41 个文件**，SKIP 条件成立
  - **未派生任何子 instance。本轮只读，未改任何产品代码，未 commit。** 写入仅两处：本案 `.inbox/` 下的 `S-0014.md` 与 `E-0041`…`E-0046.md`；以及 `.claude/agent-memory/expert-llm/` 下的记忆文件与索引一行（该目录 git 已跟踪，工作树会带这些变更，特此披露）

- **请求/下一步**:
  1. **请把 E-0045 交 `code-owner-runtime` 定向质询。** 它直接冲击已归档的 S-0007 U-R1（「active 平面缺 memory-agent 遥测产出者，那是一个交付物」），而 S-0007 / S-0012 / S-0013 三份 (c) 论证共用这一个事实前提。S-0007 自陈「若 active 平面经未搜到的第五条路径产遥测，该结论要打折」—— **本条即为那条路径**。**该 owner 不负自证其非的义务，但本庭不应让一个已被证据冲击的前提以未标注状态进入裁定材料**
  2. **请裁定把「终态解析改为 fail-closed」与 S-0013 请求 1（E-0034 的 active 面降级信号被丢）**合并为同一个可立即执行的切片，收 `code-owner-shared-arteries`。**两者是同一个缺陷的两半**：一半是白名单丢键，一半是丢键之后兜底判成 `Complete`。只修白名单，下一个没想到的键仍然报 Complete
  3. **请裁定明写：`PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT` 与 `LOCKED_CORE_PROMPT` 不在本案（含 Q9）的命名清理范围内。**
  4. **请把 display name 从本领域的清单里划掉** —— 已实测它不进模型可见材料（E-0041），故它 **不落在 `expert-llm`**。其处置归 `code-owner-settings` 与 `code-owner-runtime`
  5. **请把 U-L4（`additionalInstructions` 在发布配置下无效）单列**，它压在 Q9 与 Q10 交界处，两问都没列
- **评估结论**: **有条件成立**（全部必要条件见「不确定性」第二节，共 5 条）
- **专业适用范围**:

  | 触发条件 | 命中 | 落位 |
  |---|---|---|
  | 流式帧语义（帧类型、顺序、终态） | **命中** | Q1 的终态词汇与解析规则；Q1-前段 的「过程信号 vs 审计块」这一岔路 |
  | prompt 组装与 system prompt 结构 | **命中** | Q9 的 prompt 常量；两条平面相反的 prompt 完整性姿态；`additionalInstructions` |
  | tool schema 的形状与措辞 | **命中，但只命中 Q10 的一角** | `memory_propose` 与 legacy toolkit 的 model-visible 描述随文件一起被删。**Q1 不命中本项** |
  | 检索参数 / 模型与 provider 选择 / eval | 不命中 | 本案不含 |

  **四问落位**

  | 问 | 落位 |
  |---|---|
  | **Q1** | **落在我这里（终态语义那一半）。** 终态词汇集合的来源、解析规则的 fail 方向、轴的切分方式 —— 判据是我的。**行标题措辞、颜色、点形、分几行 —— 不落在我这里**（`code-owner-chat-bubble` / `expert-ux`） |
  | **Q1-前段** | **部分落在我这里。**「Memory V2 的整理结果是回合内的过程信号还是回合后的审计块」是帧语义问题（帧的时序位置与终态归属），我出判据，见专业理由三。**承载体归属、`RUNTIME_EVENT_TYPES` 与 `TOP_LEVEL_KEYS` 的持有权 —— 不落在我这里** |
  | **Q9** | **只有 prompt 常量落在我这里。** display name **实测不落在我这里**（E-0041）。识别符 / wire key / durable namespace / 错误码 / i18n —— 都不落在我这里 |
  | **Q10** | **部分落在我这里。** 删除动作 **删掉一份 model-visible 的 tool 描述**（E-0046），这一项落在我这里。**数据平面弃用、存量 store 处置、删除时序本身 —— 不落在我这里** |

- **专业理由**:

  **一 · 对四项定向质询的逐条鉴定**

  **(1) `Isolated` 拍平了四种语义 —— 拆法不对，而且方向反了。**

  `code-owner-runtime` 的观察成立（E-0019），但它据此提出的处方是 **把压平写进契约**。实测（E-0044）：那四个 `reason` 不是一个状态的四种口味，而是 **三条各自已经 typed 的轴** 被压进一个词 + 一个自由文本字段 ——

  | legacy 的 `reason` | 它真正属于的轴 | 上游已有的 typed 值 |
  |---|---|---|
  | `not_root_run` | **enqueue 轴** | `EnqueueDisposition.NO_OP` |
  | `root_run_cancelled` / `root_run_failed` | **源 run 轴** | `SourceRunStatus.CANCELLED` / `.FAILED` |
  | `capture_partial` / `capture_unavailable` | **capture 轴** | `RunCaptureStatus.PARTIAL` / `.UNAVAILABLE` |
  | （真正的候选隔离） | 候选轴 | `CandidateOutcome.ISOLATED` / `EnqueueDisposition.ISOLATED` |

  **只有最后一行才配叫 `Isolated`。** 前三行今天被叫成 `Isolated` 是一次分类错误，不是一次信息压缩。

  - **终态词汇集合该长什么样**：**不该由本案发明。** 采纳上游八个 `StrEnum` + `MemoryAgentWorkerDisposition`（E-0044），它们是 `StrEnum`、闭集、并在 `models.py:108-112` 的 `_enum()` 处 **构造时校验非法值**。PuPu 的 active 面已经在四个非测试模块里消费它们。**Q1 该做的是把已有的四条轴投影出来，不是把四条轴压成一个词再给那个词编一张表。**
  - **`not_root_run` 该不该是终态：不该，而且它连「态」都不是。** 它的意思是 **没有任何 run 被创建**（subagent run 不入队）。把「本来就没有要做的事」和「做失败了」放进同一个词空间，是范畴错误。正确形状：`enqueue_disposition == NO_OP` 时，**memory-agent run 轴上不该出现任何一行**，而不是出现一行写着 `Isolated`。
  - **`reason` 固化：不成立，理由是它在构造上就不是闭集。** `memory_v2_curator.py:484` 是 `reason = f"capture_{normalized_capture or 'unavailable'}"` —— **字符串插值**。集合由上游一个自由值决定，PuPu 侧列一张表并不能让它闭合，只能让表和现实分叉。**正确处置是让 `reason` 退回它该待的位置：一个可选的、纯人读的补充说明，永远不参与任何机器判定。** 机器判定只看 typed 轴。

  **(2) fail-open 还是 fail-closed —— 必须 fail-closed，而且实况比「fail-open」更糟两级。**

  这是本领域最硬的一条，也是唯一一条我不接受任何折中的：**终态解析必须 fail-closed。** 判据只有一句 —— **一个终态词的价值全部来自「它为假时用户能知道」。一个把未知一律解析成成功的解析器，它输出的 `Complete` 不携带任何信息**，因为 `Complete` 与「我不认识后端说的话」是同一个符号。在这种解析器上加状态种类，是在给一个恒为真的谓词增加参数。

  S-0013 的定性（fail-open 而非缺词）**成立，本领域确认**。但实跑（E-0043）测出两条它没测到的机制，两条都使「把缺的词加进去」这类处方彻底失效：

  - **机制 A · 顶层终态由自由文本的子串决定。** `resolveTraceStatus:191` 对 `raw.reason` 做 `.includes("unavailable")`。而顶层 `reason` 是 admission 的降级原因（`memory_v2_context.py:553` / `:1286-1300`）。实跑：`real_context_window_unavailable` → `Unavailable`；**`owner_chat_id_required` → `Complete`**；`attempt_id_required` → `Complete`。**同一类降级，五个兄弟 reason 分裂成两个不同的用户可见终态，判据是拼写。** 同理 `capture_unavailable` → `Unavailable` 而 `capture_partial` / `root_run_failed` → `Complete`。**这不是词表缺口，是终态根本不由状态决定。**
  - **机制 B · run 轴没有词表。** `presentAgentRun:328` 是 `titleCase(run.status) || "Unknown"`。实跑：后端发 `"not_a_real_state"`，UI 渲染 `Not a real state`；发 `"wat"` 渲染 `Wat`。**呈现词汇 = `titleCase(Σ*)`，一个无界集合。** E-0033 量的是顶层 fail-open（六个词落 `Complete`）；run 轴比那更彻底 —— **那里从来没有过一张表可以往里加词。**
  - **机制 C · 唯一看起来 fail-closed 的分支也是闭表且有洞。** `:175` 的 `["error","failed","cancelled","partial"]` 漏 `aborted` / `timeout`，两者均落 `Complete`。**全链路上没有一处是按「未知 → 降级」构造的。**

  **故裁定必须写成约束而不是清单**（S-0013 约束 2 的方向正确，本领域加强其力度并给出三条具体禁令）：① 未知状态词不得解析为 `Complete`，必须解析为一个显式的、用户可见的未知/降级态；② 终态不得由任何自由文本字段的子串、前缀或正则决定；③ 呈现词汇必须来自一个闭映射，`titleCase(后端字符串)` 不是词汇表。

  **(3) `Isolated` 同词异义 —— 真实，但不对称，且不需要与 Q1 同批交付。**

  `code-owner-runtime` 约束 3 主张「Q1 若固化 trace 词汇，必须一并处置」。**本领域反驳这个「一并」**：两侧的地位完全不同 ——

  - `CandidateOutcome.ISOLATED` / `EnqueueDisposition.ISOLATED` 是 **跨仓契约 token**，typed、构造时校验、PuPu 无权改名
  - `PupuRawIsolatedMemoryAgent`（`memory_v2_unchain_agent_factory.py:43`）是 **PuPu 本地类名**，实测 **不进模型可见材料、不进用户可见材料**（E-0041：agent `name` 是字面量 `"pupu_memory_agent"`，`instructions` 是常量，类名一次都没出现在两者里）

  **故结论由不对称性直接决定，不需要讨论：契约 token 保留，PuPu 本地类名改。** 这是一行裁定，爆炸半径限于 PuPu 后端内部符号，**不是模型可见行为变更，因此也不落在我这里**。把它写成 Q1 的同批交付物，只是给 Q1 挂一个与它无关的挂件。

  **(4) Q9 的 prompt 常量 —— 同意划出本案范围，但理由要换一个更硬的；display name 实测不属于我。**

  - **同意「裁定明写 prompt 常量不在本案范围内」。** 但 `0000-0001-2026-0807#S-0005` 给的理由（「否则将来会有人顺手改」）太软，**真正的理由是它被一道 byte-equality 门钉死**：`memory_v2_unchain_agent_factory.py:149-152` —— `if system_prompt != PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT: raise`。**一次「顺手改」不是一次文案变更，是一次 fail-closed 的运行时中断**（active 面的 Memory Agent 直接构造失败）。这条门是好设计，本领域明确支持保留；但它同时意味着 **任何命名清理批次都必须把这两个常量显式排除在外**，否则清理动作本身就是一次可靠性事故。
  - **另一处更正**：传票与 `#S-0005` 记的定义点 `memory_v2_unchain_agent_factory.py:17` 是 **import 行**；定义在 `memory_v2_unchain_model_invoker.py:32-49`（E-0041）。**按记载的位置去做排除，会漏掉真正的定义点。**
  - **display name：实测不进模型可见材料，故不落在我这里（E-0041）。** 两个平面都是：active 面 `display_name="Memory Agent"` 在 `memory_v2_unchain_model_invoker.py:271` **硬编码**，factory 只把它存到 `PupuRawIsolatedMemoryAgent.display_name`，`agent_kwargs` 里 `name` 是字面量 `"pupu_memory_agent"`、`instructions` 是常量；legacy 面同形（`unchain_adapter.py:827-828` 的 `"pupu_memory_curator"`）。`unchain:src/unchain/agent/agent.py:85` 证明只有 `instructions` 变成 system message，`self.name`（`:364-365`）只在该 Agent 被暴露为 delegate 工具时才进模型 —— Memory Agent 走 `.run()` 直跑，不经该路径。**故改 display name 不是模型可见行为变更。**
  - **顺带闭合 E-0020 的后端一半**：`route_chat.py:419-457` 的 sanitizer **恒产出 `displayName`**（`:424` 无 config → `"Memory Agent"`；`:443` 空值 → `"Memory Agent"`）。这与 S-0012 的 E-0030（renderer 恒送）**是两重独立保证**。故 `"Memory Curator"` 的三处默认值（`memory_v2_curator.py:1140` · `unchain_adapter.py:690` · `:856`，比 E-0020 记的多两处）经 HTTP 路径 **均不可达**。**S-0012 把它改判为「契约隐患而非行为不一致」正确，本领域从后端侧确认。**

  **(5) `worker_status` 二元组归一 —— 作为「合成一个词」不成立；作为「一个声明过的归约函数」成立。**

  `code-owner-runtime` 的提法是「把 `(status, worker_status)` 归一成单一终态词」。**这个形式不成立**，理由是它会重复本案正在诊断的那个错误：`status` 与 `worker_status` 回答两个不同问题却共用词空间（两者都可能是 `"Pending"`），把它们合成一个词，恰恰是又一次「把多条轴压平进一个词 + 靠自由文本区分」。**那正是 `Isolated` 今天的病。**

  **正确形状：归一的是「推导」，不是「词汇」。** 具体：产端按轴投影 —— `enqueue_disposition` / `run_status` / `capture_status` / `worker_disposition` / `process_disposition` 各自一个字段、各自一个上游枚举（E-0044 / E-0045 证明这五个值在 active 面 **已经以 typed 形式存在于内存里**）；收端有且只有一个 **被声明、被测试、单一 owner** 的归约函数，把这个元组算成一个呈现态。**这样「用户看到几个词」由归约函数决定（可以只有三个），而「机器凭什么这么判」由 typed 轴决定 —— 两者不再争夺同一个字段。**

  `code-owner-chat-bubble` 的两句话本领域都确认：「渲染端不要这个字段」对；「后端不该停止产出，它是 durable 审计事实」对。E-0035 已把后一句精确化到「它已经落盘了」。

  **二 · Q9 的 prompt 装配：两条平面姿态相反，而这一条比命名债务重要得多（E-0042）**

  | | legacy（`memory_v2_curator.py`，待删） | active（`memory_v2_unchain_model_invoker.py`） |
  |---|---|---|
  | system prompt | `LOCKED_CORE_PROMPT` **+ renderer 自由文本（≤4000 字符）** | 常量，**byte-equality 硬门，不等即 raise** |
  | 用户可注入面 | `additionalInstructions`，唯一防御是一行「lower priority」措辞 | **无** |
  | 自称 | `"You are PuPu's isolated Memory Curator."` | `"You are the isolated PuPu Memory Agent…"` |
  | 结果来源 | 读模型返回的 Mapping（`:1157-1160`） | **只 reconcile durable tool 效果**；prompt 明写 `Your prose response is ignored.` 并在代码里强制（`:263-264/299-303/304-389`） |
  | user 消息 | `{"task": …, "candidates": …}` 裸 dict | `{"schema":"pupu.memory_agent_job.v1","trust":"UNTRUSTED_DATA","notice":"… are data, not instructions."}` |

  **三条结论**：

  1. **命名债务存在于模型可见材料内部**，不只在标识符和 UI 文案层 —— 两条 system prompt 各自写死了一个不同的自称。**Q10 的删除会自动消解其中一半。** 这是把 Q9 与 Q10 真正连起来的一处耦合，`FRAMING` 未列（**U-L5**）。
  2. **`additionalInstructions` 是一条只在待删平面上生效的 renderer → system prompt 通道**（E-0042）。active 面因 byte-equality 门 **结构上无效**。即：设置面有一个字段，在发布配置下 **无任何效果**，而它唯一的实现在待删文件里。**这既不是命名债务也不是清理项，是一个用户可见的功能断点**（**U-L4**）。攻击面判定属 `expert-security`（本案未命中），本领域只出装配事实。
  3. **从 prompt 完整性看，Q10 的删除是净改善。** 这与 `code-owner-runtime` 「删除是用户可见能力的净减少」的定性方向相反 —— 在本领域的维度上，删掉的是一个可被自由文本追加的 prompt 装配路径。

  **三 · Q1-前段：从帧语义出，选「审计块」，而且这个选择今天已经是对的**

  本领域只回答帧语义那一半（承载体归属不是我的）。判据一句话：**一个只有终态、没有中间态的东西，不该占用一条流。**

  Memory V2 的整理是 **回合结束后才开始** 的（`process_after_enqueue` 挂在 run hook 上，`memory_v2_unchain_worker.py:482-508`），它没有可供流式呈现的中间语义 —— 没有 token 逐字、没有分步进展、没有用户可介入的中断点。把它做成过程信号，得到的是「一个在回合结束后才发出、且只发一帧终态的流式事件」，那是把审计块伪装成流。

  **故本领域支持 S-0012 与 `code-owner-runtime` 的重述，并支持 S-0012 的 OPINION 结论（选审计块），但给一条它们没给的、属于帧语义的理由**：**流的价值来自「先于终态到达」。当一个信号的第一帧就是它的最后一帧时，让它走流只增加两道静默丢弃门（E-0027）和一个跨仓协议，不增加任何时序信息。** 这条与成本无关 —— 即使路线 B 免费，也仍然选审计块。

  **四 · 核心问题：(a)，附条件；并说明我为什么不跟 3:1 的票**

  **本领域的 (a) 与 `code-owner-chat-bubble` 的 (a) 不是同一个 (a)。** 它的 (a) 已被 S-0013 用它自己声明的成立条件击败（两个锚点一个在死轴上、一个不是产出者，E-0039），**本领域确认该击败成立，不为它辩护**。

  但三份 (c) 论证共用一个事实前提，而 **那个前提被 E-0045 证否**：

  | 发言 | 依赖的前提 | E-0045 的效果 |
  |---|---|---|
  | S-0007 U-R1 | 「active 平面缺 memory-agent 遥测产出者，那是一个 **交付物**」 | **产出者存在**：`PupuMemoryAgentWorkerReceipt`（typed，13 字段）+ 四个已算好的稳定失败码 + 两个公开 property；graph 侧另有一个自陈 **content-free** 的 `PupuUnchainGraphRootMemoryReceipt` |
  | S-0012 | 「一份没有产出者的词汇规格无法被验收」 | 同上；缺的是 **投影**（`unchain_adapter.py:9471` 写入 `output_holder["graph_root_completion"]` 后 **全文件零读取**；`last_receipt` / `last_failure_code` 全仓零消费者） |
  | S-0013 | (c) 三段式的第 ① 段「先补 active 面遥测产出者」 | 第 ① 段从「建一个交付物」缩小为「把已有的 typed 回执接进 diagnostics」 |

  E-0018 的负向 grep **本领域独立复核成立** —— 那个文件确实不写 diagnostics、不写审计事件、不发 `memory.curator.*`。**但它 `return` 一个 typed 回执。** S-0007 自己写下了这条打折条件（「若经未搜到的第五条路径产遥测」），本条即是那条路径。

  **于是四问全部解耦，(c) 的强制性消失**：

  | 交付物 | 依赖 Q10 的删除吗 |
  |---|---|
  | 采纳上游 typed 枚举作为词汇 | **否** —— 锚点在 unchain 仓，不在删除清单，不在 fail-closed 门内侧 |
  | 终态解析改 fail-closed（三条禁令） | **否** —— 纯 presenter 改动，S-0013 已认领 |
  | 把已存在的 typed 回执投影进 diagnostics + 白名单 | **否** —— 产端与收端都不碰待删文件 |
  | 删除四个文件 | 依赖存量 store 处置（E-0024）与 `memory_propose` 参数 schema 比对（条件 4），**不依赖词汇规格** |

  **故选 (a)：先定（采纳）词汇 + 先改 fail-closed，再删。** 顺序理由不是「稳妥」，是 **可证伪性**：改成 fail-closed 之后，legacy 面残留的、不属于上游枚举的字符串会 **立刻以显式未知态暴露出来**，这恰好给 Q10 的删除提供了一个今天不存在的验收信号 —— 删除前后 trace 上不该再出现任何未知态。**先删则永远拿不到这个信号。**

  **对 (b) 的表态**：反对，与四位一致。本领域加一条独有理由：删除会同时移走一份 model-visible tool 描述（E-0046）。在没有比对过两个 `memory_propose` 参数 schema 之前删，是在未核对的情况下改变模型可见的工具面。

  **对 (c) 的表态**：**不是错，是过度耦合。** 若本庭仍裁 (c)，本领域的五条必要条件全部照旧适用，(a)/(c) 之差不影响本领域的「有条件成立」—— **但请不要把 U-R1 作为 (c) 的理由写进裁定正文**，那一条已被 E-0045 冲击。

  **五 · 怎么验（本领域不接受「感觉更好」，故同时给出验收）**

  三级，全部可机械执行，今天的基线可测且为 **0**：

  1. **词汇满射测试（单元，<1s，无模型调用）**：对上游九个枚举的全部成员（约 40 个值）逐一喂进 presenter，断言输出落在一个 **声明过的闭集** 内；再喂 200 个随机字符串（含 `"wat"` / `"not_a_real_state"` / `"aborted"` / 含 `"unavailable"` 子串的伪造值），断言 **无一** 解析为 `Complete`。**这是让「fail-closed」从主张变成事实的唯一机械手段**，也是 E-0043 三条机制的直接回归
  2. **双向对账测试**：产端 `_memory_v2_merge_diagnostics` 的 kwarg 集合 ↔ 收端 `TOP_LEVEL_KEYS`，差集两侧各要一份显式豁免清单（S-0013 第四节已提出该形状，本领域支持并补一句：**投影出的 typed 字段也要进同一张对账表**，否则 E-0045 的回执会成为第六个产出即丢弃）
  3. **一次性活体验收（指标明确、基线为 0）**：V2 active + 一次真实 root run，断言 `presentMemoryV2Audit(...).agentRuns.length ≥ 1` 且 `agentRuns[0].status ∈ 闭集`。**今天的基线是 `agentRuns.length = 0`（E-0034 之 Q4 / E-0039 之二实测）**，故这是一个从 0 到 ≥1 的无歧义台阶。这同时满足 `code-owner-chat-bubble` 与 `code-owner-shared-arteries` 都要求的「人眼在运行中的应用里看过一次」，并把它变成可断言的

  **六 · 本领域看到、`case.md` 与 `FRAMING` 未列出的未决项（U-L1 … U-L7）**

  - **U-L1 · active 面的 typed 遥测被产出者自己丢弃。** `unchain_adapter.py:9471` 写入后零读取；`last_receipt` / `last_failure_code` 全仓零消费者。**这是本案第五个「产出即丢弃」，且是被断言为「不存在」的那一个** —— 前四个丢在收端白名单，这一个丢在产端那一行
  - **U-L2 · 终态由自由文本子串决定**（presenter `:191`）。**这不是 fail-open 的一个实例，是一类更根本的缺陷**：判定输入不是状态
  - **U-L3 · run 轴没有词表**，是 `titleCase(Σ*)`（presenter `:328`）。**「往词表里加词」在这条轴上没有着力点**
  - **U-L4 · `additionalInstructions` 在发布配置下无任何效果**，唯一实现在待删文件里。Q9/Q10 交界，两问都没列
  - **U-L5 · 命名债务在模型可见材料内部** —— 两条 system prompt 各写死一个不同自称。Q10 的删除会自动消解一半
  - **U-L6 · `memory_propose` 在两个平面上的 model-visible 措辞结构不同**（一行 vs 5 段 `ToolPromptSpec` + `unchain.memory.proposal_policy.v1` 版本号）。**删除方向是升级不是回退，但参数 schema 至今无人比对过**（必要条件 4）
  - **U-L7 · 本案现在有四套互不对齐的词汇**：presenter 四态 · run 轴的 `titleCase(Σ*)` · `memory_v2_context.py:185-197` 的 7 个 `memory.curator.*` 事件名 · 上游九个 typed 枚举。**只有第四套是闭集且构造时校验。** 裁定若只处理前两套，第三套会成为下一个漂移点

  **七 · 越界内容清单（标注为参考，不计入本领域结论）**

  呈现形态（几行、什么颜色、失败点画不画）→ `code-owner-chat-bubble` 与 `expert-ux`（`0000-0003-2026-0807`）· `TOP_LEVEL_KEYS` / `resolveTraceStatus` 的具体改法与持久化后果 → `code-owner-shared-arteries` · 投影哪些字段、`mark_*_partial` 的触发条件、四个待删文件的时序与存量 store 处置 → `code-owner-runtime` · `additionalInstructions` 拼接的可利用性 → `expert-security`（本案未命中，若裁定触及请第三层门禁重判）· 承载体归属与 `RUNTIME_EVENT_TYPES` → `code-owner-chat-core` 与 `code-owner-shared-arteries` · `unchain:src/unchain/memory/**` 的任何改动 → `code-owner-unchain`（**不在必到名单**；本领域的处方 **不请求任何 unchain 侧改动**，采纳既有枚举是 PuPu 侧的纯读取行为。若裁定要求上游新增或改名枚举成员，S-0012 的 U-C4 即触发，quorum 须重判）· 帧顶层键表的跨层归属 → `expert-architecture`

- **支撑证据**: E-0041（prompt 常量定义点更正 · byte-equality 门 · display name 不进模型可见材料 · E-0020 后端侧更正）· E-0042（两条平面相反的 prompt 完整性姿态 · `additionalInstructions` 全链路）· E-0043（**实跑**：终态由子串决定 · run 轴无词表 · 闭表有洞）· E-0044（上游九个 typed 枚举已存在且 PuPu active 面已消费 · `Isolated` 是三条轴的压平）· E-0045（**active 面遥测产出者存在且零消费者**）· E-0046（两个平面的 tool 名集合相同、措辞结构不同）。援引本案 E-0002 · E-0004 · E-0015 ~ E-0021 · E-0030 · E-0031 · E-0033 ~ E-0035 · E-0037 · E-0039；S-0006 · S-0007 · S-0008 · S-0012 · S-0013；跨案 `0000-0001-2026-0807#S-0005`

#### S-0015 | ASSESSMENT | code-owner-settings → case
- **阶段**: 议案庭审
- **结论**: **Q9 在本 owner 这一半的事实前提是错的，而更正后的事实比原主张更重。** `memory_agent_v2` 这个 durable namespace **只有读者，没有写者** —— 唯一非测试消费者是 `use_chat_stream.js:6480` 的一次只读（E-0048）；本机 `settings.db` 无该行、legacy 迁移已 `complete`（E-0049）。故 `0000-0001-2026-0807#S-0005` 所称「改名即静默丢弃用户已保存的 Curator 模型选择」**不成立**：那份选择不存在，也不可能存在，改名迁移成本是 **零行数据**。**但原因不是疏忽，是一次未走完的搬迁** —— 写入者是 Agent Builder 的 Memory Agent 系统卡片，与设置模块 **同日引入（`0dc333dc`）、同日删除（`eaf5a296`，2026-08-04）**，删除者在同一 commit 里把错误暴露职责显式记账给「**a future settings surface**」（`memory_agent_settings.js:13-14` 原文），**而那个界面至今不存在**。于是每一次 V2 回合上行的 `memory_agent_config` 四个字段恒为编译期常量。**从存储端复核 E-0020：与 `code-owner-chat-core`（S-0012 ④）结论一致，不反驳 —— 该分支不可达**，且本 owner 能把它证到更强的形式（`normalizeMemoryAgentSettings` 是全函数，设置持久化的每一种失败模式都降级到同一条恒返回默认值的读路径，E-0047）。**核心问题选 (c)**，理由是第四条，与已出庭三位都不同
- **依据**: E-0047 ~ E-0052（六条均由本 owner 取证，其中 E-0047 含实跑 `65 passed`，E-0048/E-0049/E-0051 含可复现的 git 与 sqlite 命令）；本案 E-0002 · E-0003 · E-0004 · E-0012 · E-0020 · E-0022 · E-0024 · E-0031（引自 S-0012）· S-0002 · S-0006 · S-0007 · S-0012 · S-0013；跨案 `0000-0001-2026-0807#S-0004`（对本 owner 的第一次补传）· `#S-0005`
- **不确定性**:
  1. **本 owner 没有在运行中的应用里看过任何一次真实的 V2 payload 或 trace 行。** 全部为静态读取 + 单元测试 + 只读 DB 查询。与 S-0006 / S-0013 同一条限制
  2. **E-0049 的现场核对 n = 1 且为 dev 机器。** 但本条结论 **不依赖 n** —— E-0048 已在代码与全部 git 历史上证明不存在写入者，E-0049 只是现场核对
  3. **E-0047 有一条极窄路径未实测**：`settings_repository.js:553-556` 的 `jsonClone` 未包 try/catch。它 **不产生**「送了 V2 但没送 config」，而是让整次发送失败，故不影响结论，但本身未跑
  4. **E-0050 未在打包后的应用里实测 `NODE_ENV`。** `react-scripts build` 注入 `production` 是构建工具的既有行为，核实属 `code-owner-devtools`
  5. **E-0051 不能证明任何一次已发布 release 的 flag 取值** —— 快照文件不受版本控制、无历史，且发布构建可能不在本机
  6. **越界读取披露**：为核算落差读了 `use_chat_stream.js:6455-6510`（chat-core）· `scripts/build-web.cjs`（devtools）· `electron/main/services/unchain/memory_v2_rollout.js:120-172`（electron）· `src/COMPONENTs/agents/pages/recipes_page/` 的 git 历史（agents）。**这些结论一律不作主张，最终以各自 owner 为准**
  7. **未派生任何子 instance；本轮只读，未改任何产品代码，未 commit。** 写入仅两处：本案 `.inbox/` 下的 `S-0015.md` 与 `E-0047`…`E-0052.md`，以及 `.claude/agent-memory/code-owner-settings/` 下的记忆文件与索引一行（该目录 git 已跟踪，工作树会带这些变更，特此披露）
- **请求/下一步**:
  1. **请把「Memory Agent 的配置界面归属」当成一个待裁问题列出来（U-S1）。** 它今天既不在 Builder（被已锁定架构共识与 `workflow_list.test.js:121-144` 禁止），也不在 Settings（从未建），而 payload 契约、后端四键白名单、两侧活测试全都按「它存在」建成。**Q1 与 Q9 都从它旁边绕过去了**
  2. **请把 E-0020 的处置写成一句可验收的话**：本 owner 与 `code-owner-runtime` 二选一删掉一个默认值，并加一条跨侧断言。**本 owner 接 renderer 一半，且不需要等本案任何裁定** —— 零数据、零迁移、零用户影响（E-0048 / E-0049）
  3. **请裁定文本不要再写「`memory_agent_settings.js:24` 是用户可见文案」。** 它不被任何 renderer 组件渲染，只被序列化上行（E-0052 之二）。**同意 `code-owner-runtime` 的定性，反对把它并进 i18n 议题**
  4. **请把 E-0051 交 `code-owner-devtools` 与 `pupu-coo` 的发布口径复核。** 「今天 V2 是关的」这句话在 repo 上不可核实，且与本机构建快照的当前状态（`enable_memory_v2: true`）相反。第三层门禁可据此判定 `code-owner-devtools` 是否需要出庭 —— **本 owner 不主张传唤，只登记事实**
- **评估结论**:

  **一 · 对本轮四项定向质询的逐条表态**

  | # | 质询 | 本 owner 表态 |
  |---|---|---|
  | 1 | E-0020 双默认值：renderer 不送 config 的路径是否可达 | **不可达 —— 与 `code-owner-chat-core` 一致，不反驳，并从存储端把它证到更强的形式** |
  | 2 | Q9 durable namespace：「不做」还是「以后做」 | **判「不做」，但理由与 `#S-0005` 相反 —— 不是因为迁移贵，是因为迁移不存在。改名成本 ≈ 0，收益也 ≈ 0** |
  | 3 | `memory_agent_settings.js:24` 的处置 | **确认 `code-owner-runtime` 的定性：不是文案。反对纳入 i18n 议题。同意「连着后端默认值一起处置」，且本 owner 接 renderer 一半** |
  | 4 | Q10 对本 owner 边界的影响 | **不落在我这里**（E-0052 之一，零命中）。但出一条 Q10 相关的证词，见下 |

  **二 · 质询 1 · 双默认值：从存储端复核，chat-core 是对的，且能证得更强**

  `code-owner-chat-core`（S-0012 ④）从发出端证明「V2 requested 但无 config」这个组合从 PuPu 出不来。**本 owner 从存储端独立核对，结论一致**，并补上它没有的那一半 —— 它证的是「两个键同生共死」，本 owner 证的是「就算 config 送出来了，`displayName` 也不可能是空」（E-0047）：

  1. `settings_storage_bridge.js:351-365` 的 `bootstrap()` **文件内契约与实现都写明 never throws** —— bridge 缺失、preload 抛错，两条都返回 `unavailableSnapshot`
  2. `readNamespace` 的 fallback 分支走 `readLocalRoot()`，`JSON.parse` 包在 try/catch 内、失败返回 `{}`
  3. `normalizeMemoryAgentSettings`（`:36-45`）是 **全函数**：`null` / `undefined` / 字符串 / 数组 / 缺键 / 类型错误，一律落到 `displayName || DEFAULT_MEMORY_AGENT_DISPLAY_NAME`

  > **即：首次运行、localStorage 被清空、SQL 后端不可用、degraded、迁移失败、配额写失败、记录损坏 —— 七种失败模式全部降级到同一条读路径，而那条读路径恒返回非空 `displayName`。** 这不是「碰巧没触发」，是结构上不可达。

  **但本 owner 要把这条结论再推一步，因为它今天比 chat-core 说的还要更不可达**：`memory_agent_v2` **根本没有写入者**（E-0048）。所以 `displayName` 不只是「非空」，它 **恒等于常量 `"Memory Agent"`**。后端 `memory_v2_curator.py:1140` 的 `"Memory Curator"` 默认值今天是 **死代码**。

  **本 owner 因此同意 S-0012 把 E-0020 改判为「契约隐患」，但要给它一个更准的名字：这不是两个默认值在竞争，是两个 product name 各自硬编码在两侧，而其中一侧从来没有被喂过别的值。** 处置代价因此是 **一行**，不涉任何用户数据。**本 owner 明确表态：这一条不需要等 (a)/(b)/(c) 的任何结果，现在就能关掉。**

  **三 · 质询 2 · Q9 的 durable namespace：判「不做」，但把 `#S-0005` 的理由整个换掉**

  `0000-0001-2026-0807#S-0005` 的原话是「**改名即静默丢弃用户已保存的 Curator 模型选择，除非写迁移**」，并据此把识别符 / wire key / storage namespace / 错误码一起判「不做」，理由是「成本是一次协议变更 + 一次 durable 迁移 + 一批错误码作废」。

  **storage namespace 这一项的事实前提不成立**（E-0048 / E-0049）：

  | `#S-0005` 的主张 | 实测 |
  |---|---|
  | 存在「用户已保存的 Curator 模型选择」 | **不存在。** `provider` / `modelId` 只有读者没有写者，恒为 `""` |
  | 改名须写一次 durable 迁移 | **不须。** `settings.db` 的 `settings` 表 9 个 namespace 无此行；legacy 迁移已 `complete`，而迁移是整根导入的全或无事务 —— 若它曾在 localStorage 里，今天必然是一行 |
  | 成本高，故判「不做」 | **成本 ≈ 0。** 改一个常量，无数据迁移，无兼容窗口 |

  **本 owner 的结论仍然是「不做」，但理由必须换成正确的那个**：改名的 **收益** 是零 —— 它是一个用户看不见、只有一个消费者、且那个消费者是同仓同人写的模块的内部键。**「因为贵所以不做」与「因为不值所以不做」在这里结论相同，但在下一次评审里会导致相反的行为**：前者会让人以为「等便宜了就做」，于是每次评审重新核算一遍迁移成本；后者一次性关掉这个话题。**请裁定采用后者的措辞。**

  **同时请把这条与 wire key 分开。** `code-owner-chat-core`（约束 5）判 `memory_agent_config` 这个 wire key「不做」，理由是两侧同一次落地的静默不匹配风险 —— **那个理由是真的，本 owner 不反对，但它不适用于 storage namespace**。`#S-0005` 把四类捆在一句「不做」里，其中两类的理由已经不一样了。

  **四 · 质询 3 · `memory_agent_settings.js:24`：确认不是文案，反对纳入 i18n 议题**

  - **确认 `code-owner-runtime` 撤回其前案建议是正确的**，并确认它对本处的定性：**不是零风险的文案**。理由本 owner 独立核实（E-0052 之二）：这是本 owner 边界内唯一的 `"Memory Agent"` 字面量，**且不被任何 renderer 组件渲染** —— 它的唯一去向是上行进 payload。**一个被序列化送进 Python 进程、在那边成为 agent 身份的值，`t()` 处理不了它。** 它不在 i18n 的对象集合里
  - **同意「连着后端默认值一起处置」**，处置见请求 2
  - **反对 `code-owner-shared-arteries`（S-0013 五）把本处并进「chat-bubble 整面 0/9 未接 i18n」这个更大的债务** —— 不是反对它的债务判断（那条本 owner 无意见），是反对把本处 **归类** 进去。本处不是「一个没走 `t()` 的界面字符串」
  - **但本 owner 要为 S-0013「反对在本案处置 i18n」补一条它没有的、写在代码里的理由**（E-0052 之三）：本 owner 边界内另有两条用户可见的 Memory V2 英文硬编码（`settings/memory/index.js:23` 与 `:25`），**上方注释原文写着** —— *"Memory V2 copy is intentionally untranslated for now … adding keys would churn all 12 locale files **before the Memory V2 wording is frozen**"*。**这两条被 E-0004 / E-0012 / E-0022 全部漏掉了，因为三次 grep 搜的都是 `"Memory Agent"` 而不是 `"Memory V2"`。**
  > **这条注释是一条既有的、成文的工程判断，而且它正好指向本案**：Memory V2 的措辞 **就是 Q1 要冻结的东西**。**先接 i18n 再定词汇，等于先把没冻结的词翻成 12 种语言。** 故 i18n 不是「本案顺手做掉」的事，也不是「跟 Q9 一起判不做」的事，是 **Q1 的下游**。请裁定按这个次序写。

  **五 · 质询 4 · Q10：不落在本 owner，但出一条只有本 owner 能给的证词**

  待删四文件与 `pupu_legacy` 数据平面在本 owner **全部边界路径内零命中**（E-0052 之一）。本 owner 与该平面的唯一关系是间接的、且是一个开关：`enable_memory_v2` 在 `feature_flags.js`，是本 owner 边界的逐字一行。**据此出两条证词，其中第二条与 `code-owner-chat-core` 的证词方向相反**：

  - **证词一（加强 S-0012）**：`enable_memory_v2` 的 `defaultValue` 确为 `false`。**且比 chat-core 说的更强 —— 在 production build 里这个 flag 用户根本改不动。** `readFeatureFlags()`（`feature_flags.js:94-104`）在 `NODE_ENV === "production"` 时 **直接返回 build defaults，完全忽略持久化的 `feature_flags` namespace**；而 `writeFeatureFlags()` 照写照通知，于是 Settings 的 Dev 开关在打包应用里 **写得进去、读不回来**（E-0050）。**推论：本案全程「没人在真实应用里看过一个 Memory V2 trace 行」这件事，不是取证不努力 —— 在一个 shipped build 里那是构建时决定的，看不看得到不由使用者决定。**
  - **证词二（部分反驳 S-0012 的 E-0031 外推）**：**「全仓无 build 级覆盖」在 repo 内属实，但 build 级覆盖机制存在、已被配置，只是它不在 repo 里。** `scripts/build-web.cjs:12-16` 从 `.local/build_feature_flags.snapshot.json` 读构建期 flag，`.gitignore:20` 把 `/.local/` 整个排除（E-0051）。**本机那份快照（2026-08-04）写着 `"enable_memory_v2": true`** —— 即这台机器上下一次构建产出的应用，Memory V2 是开的。上一次实际构建的 `build/build_feature_flags.json` 则是 `false`。
  > **净效果**：「今天 V2 是关的，所以 Q10 没有紧迫性」这个前提 **在 repository 上不可核实**，且与本机构建配置的当前状态相反。**本 owner 不主张 V2 该开或该关**，只主张：**任何以 flag 状态为前提的时序判断，必须先指明它读的是哪一份不在 repo 里的快照。** 这一条对 Q10 是 **两个方向都可能** 的 —— 若下一个 build 真开着 V2 发出去，那么「active 平面没有 memory-agent 遥测产出者」就不再是纸面问题。

- **边界命中依据**: 本案在本 owner 三处边界声明上命中（第 4 处为负向核对）：

  | 边界条目 | 命中对象 |
  |---|---|
  | `pupu:src/SERVICEs/memory_agent_settings.js` | **Q9 逐字点名的文件，也是本 charter 逐字声明的一行。** 全文 75 行，本案在本 owner 边界内的主对象：`:22` namespace 常量 · `:24` `DEFAULT_MEMORY_AGENT_DISPLAY_NAME` · `:36-45` 归一化 · `:47-48` 读 · `:55-61` 写（**零非测试调用者**）· `:67-75` 订阅（**零非测试调用者**）。co-located `memory_agent_settings.test.js` 依 [A-008](../../../codex/adaptations.md#a-008--co-located-测试随源文件归属) 归本 owner |
  | `pupu:src/SERVICEs/settings_repository.js` | `memory_agent_v2` 的实际持久化实现：`:803-813` `readNamespace` · `:876-950` `updateNamespace` · `:498-559` `ensureInit` 与 legacy 迁移 · `:62-63` 存储键与迁移标记。**`FRAMING` 与四份已归档 `ASSESSMENT` 均未把它记为命中点** —— Q9 说的「durable localStorage namespace」今天已经 **不是 localStorage 了**，是 `settings.db` 的一行 |
  | `pupu:src/SERVICEs/feature_flags.js` | `enable_memory_v2` 的定义与读取语义（`:52-56` · `:94-104`）。**同样未被 `FRAMING` 记为命中点**，而本案有两份 `ASSESSMENT`（S-0007 / S-0012）的关键推论建立在这个 flag 的取值上 |
  | `pupu:src/COMPONENTs/{settings,memory-inspect,init-setup,workspace,diff}/**` | **负向核对**：待删四文件与 `pupu_legacy` 零命中；`"Memory Agent"` 零命中；`memory_v2` 只命中 `settings/memory/index.js` 一处（两条刻意不翻译的说明文）。**本案在本 owner 的组件面上只触及 Memory 设置页的两行文案** |

  **边界更正 —— 确认 S-0002 自愈信号 2 的分类正确，不反驳，不修改本 owner 的边界声明。** 本 charter 逐字写出 `pupu:src/SERVICEs/memory_agent_settings.js`，Q9 原文逐字点名同一路径，覆盖正确；缺陷在立案抽取，处方「改工具不改 charter」正确，S-0011 已回归验证（该工具独立复现出本 owner 的 2 处命中）。**但补一条该信号没写到的**：本轮实际命中是 **4 条边界条目而不是 1 条**，其中 `settings_repository.js` 与 `feature_flags.js` 两条 **抽取器与手工重跑都没抽到** —— 因为议案文本里没有出现这两个文件名，只出现了它们承载的概念（「durable localStorage namespace」「发布配置」）。**这与 S-0002 信号 3（`code-owner-agents`，议案以概念表述约束）是同一类缺陷，且它证明该类缺陷不止影响 `code-owner-agents` 一人。**

- **受影响对象**:

  | 编号 | 落位 | 本 owner 的对象 |
  |---|---|---|
  | **Q1** | **不落在我这里**（呈现与产帧两端都不在本 owner），但有一个 **前置** 落在我这里 —— 见 U-S1 | 无直接对象 |
  | **Q1-前段** | **不落在我这里** | 无。本 owner 不产、不驱动、不消费流 |
  | **Q9** | **落在我这里，且是 `FRAMING` 逐字点名的那一半** | `memory_agent_settings.js:22` namespace · `:24` display name 默认值 · 二者的持久化实现 `settings_repository.js` |
  | **Q10** | **不落在我这里** | 零命中（E-0052 之一）。间接关系仅 `feature_flags.js` 的 `enable_memory_v2` |

  **需在本 owner 边界内改动的（按可独立性排序）**：① `displayName` 双默认值的 renderer 一半（**零跨 owner 依赖、零数据、可立即执行**）；② `memory_agent_v2` 的四个字段要么获得一个 Settings 配置界面、要么从 wire 上摘掉（**U-S1，须先裁定**）；③ namespace 改名（**判不做**）；④ Memory V2 设置页文案接 i18n（**Q1 的下游，不在本案**）。

- **约束**:
  1. **`settings` schema 是公共动脉，不归本 owner。** `memory_agent_v2` 是它下面的一个 namespace；任何对它的增删改名 **都是一次跨面 schema 变更**，须经 `code-owner-shared-arteries` 与 `expert-architecture`。**本 owner 是它最重的读写方，不是它的 owner** —— 请裁定不要把 namespace 处置直接指派给本 owner 独立完成
  2. **不得把 `memory_agent_config` 的字段集当成「settings 的一个子集」来扩。** 该 payload 的四个字段是 **在发出端逐字段显式挑出的**（`use_chat_stream.js:6483-6489`），不是整包 spread —— 这是一条既有的安全约束（防止本 namespace 将来多存的任何字段、凭据类尤甚，顺着上行）。**任何「给 Memory Agent 加配置项」的方案必须同时说明新字段上不上行，且不得以整包 spread 实现**
  3. **凡涉及凭据的方案，本 owner 不单独判。** 若 U-S1 的配置界面最终要让用户为 Memory Agent 选一个 **自定义 provider**，那会牵到 provider 凭据链路（`provider_credential_persistence.js` / `settings_secret_adapter.js`），**触发 `expert-security` 的传唤条件**。今天的四个字段里 `provider` / `modelId` 只是标识符、不含密钥，**所以今天没触发** —— 但请裁定别在方案庭审里越过这条线
  4. **「跑一遍设置测试」不是验收 —— 本 owner 与 `code-owner-chat-bubble`、`code-owner-shared-arteries` 作同一份证词。** 本 owner 本轮实跑 65 tests 全绿（E-0047），而这 65 条 **全部** 断言的是模块自己的输入输出；`memory_agent_v2` 有零个写入者这件事，65 条里没有一条会红。**一个「有读者、无写者、测试全绿」的持久化模块，正是本案反复出现的失败类的镜像。**
  5. **本轮只读，未改任何产品代码，未 commit，未派生子 instance。** 写入见不确定性 7

- **建议处置**:

  **一 · 核心问题：(c)，理由是第四条**

  先说清楚一件事：**本 owner 的边界不强制任何一个选项。** Q9 在本 owner 这一半（namespace）判「不做」，Q10 不落在本 owner，Q1 与 Q1-前段都不落在本 owner。若只按「我的边界受什么影响」回答，诚实的答案是「三个选项对我一样」。**所以本 owner 的选择必须靠一条独立理由撑住，而它确实有一条：**

  > **(c)，因为 Q1 与 Q10 共用一个 **既不是词汇、也不是删除** 的未决前置 —— Memory Agent 到底有没有一个用户可及的配置面。**
  >
  > 今天的状态是（E-0048）：四个被声明为「user-tunable」的字段（`displayName` / `additionalInstructions` / `provider` / `modelId`）在每一次 V2 回合上行，取值恒为编译期常量；它们唯一的写入界面在 2026-08-04 被删除；删除者在同一 commit 里把职责记账给「a future settings surface」；那个界面至今不存在；而 Q9 自带的约束（**不得重新引入 Builder 卡片或 recipe 节点**）恰好禁掉了它原来的家，**并且没有指定新家**。
  >
  > **Q1 问的是「trace 上体现什么」—— 而 trace 上那一行叫 `Memory Agent · {status}`，它命名的是一个用户既不能改名、也不能选模型的 agent。Q10 问的是「产出那些行的实现要不要删」。两问都从这个前置旁边绕过去了：一个假设配置面存在（不然 `displayName` 上行没有意义），一个假设它不重要（删掉产出者就不必谈配置）。**
  >
  > **分开裁，这个问题会第三次掉进缝里** —— 它第一次掉在 Builder 与 Settings 之间（`eaf5a296`），第二次掉在 Q1 与 Q9 之间（本案 `FRAMING`）。

  **逐项表态**：

  - **(a) 反对，但不是因为已出庭三位给的理由，也不是因为它们错。** `code-owner-chat-bubble` 的观察（删了四个文件渲染端一个词都不失效）本 owner 无从复核也不反驳；`code-owner-shared-arteries` 对它自陈成立条件的核对（S-0013 一）在本 owner 看来是本案最锋利的一处论证。**本 owner 反对 (a) 的理由是第四条**：(a) 的隐含承诺是「词汇定完就可以发」，而按 E-0051，**下一个 build 在本机配置下 Memory V2 是开的** —— 那意味着一份只定了词汇、没有产出者、也没有配置面的 trace 会真的发到用户面前。**(a) 的风险不在规格写错，在规格写对了却没人实现，而 flag 已经开着。**
  - **(b) 反对，且与三位一致。** 本 owner 补一条 **本 owner 独有的**：`memory_agent_settings.js` 今天已经是「删了一半」的产物 —— 写入者删了，读者与 wire 契约留着。**(b) 是把同一个操作再做一遍：删掉产出者，留下四个恒为常量的上行字段和一个没有实现方的词汇表。本案已经有一个这样的模块了，它就是本 owner 手上这个。**
  - **(c) 采纳。** 本 owner 同意 `code-owner-chat-core`（S-0012 二）的四段式，并同意 `code-owner-shared-arteries`（S-0013 一）把措辞从「同时落」改成「**三段有序，第一段是一个交付物不是一次讨论**」—— 本 owner 补充：**第 0 段（裁定形态）里必须多问一句「这个 agent 由谁配置」**。理由是它决定第 1 段（补产出者）的形状：一个用户配不了的内部 worker，和一个用户能选模型、能给附加指令的 agent，**在 trace 上该说的话完全不同**，而后者今天已经在 wire 上、在后端白名单里、在两侧的活测试里了。

  **二 · 逐问建议处置**

  | 问 | 建议 |
  |---|---|
  | **Q1** | 不落在本 owner。**唯一请求**：裁定 Q1 之前先答 U-S1（Memory Agent 有没有用户可及的配置面）。若答「没有，它是内部 worker」，则 `memory_agent_config` 四字段应从 wire 上摘掉，trace 行不该给它一个可配置的名字；若答「有」，则配置面归本 owner，本 owner 接 |
  | **Q1-前段** | **不落在我这里** |
  | **Q9** | **拆成三条分别裁，不要一句「不做」覆盖**：① **storage namespace `memory_agent_v2` 判「不做」**，理由换成「收益为零」而不是「迁移昂贵」（后者事实不成立，E-0048/E-0049）；② **`displayName` 双默认值判「立即处置」**，与后端二选一删掉一个 + 一条跨侧断言，**本 owner 接 renderer 一半，不需要等本案任何裁定**；③ **`memory_agent_settings.js:24` 从 i18n 议题里摘出去** —— 它不是界面字符串。**另**：本 owner 边界内真正的 i18n 项是 `settings/memory/index.js:23/25` 两条，**它们的既有注释已经写明「等 Memory V2 措辞冻结后再翻」，而冻结措辞正是 Q1** —— 故 i18n 是 Q1 的下游，不是 Q9 的一部分 |
  | **Q10** | **不落在我这里**（零命中）。出两条证词：**(i)** production build 里 `enable_memory_v2` 用户改不动（E-0050），故本案全程的空态取证是构建配置的结果、不是取证不力；**(ii)** 「今天 flag 是关的」在 repo 上 **不可核实**，本机构建快照当前是 `true`（E-0051）。**请裁定不要把「无紧迫性」写成已证事实** |

  **三 · 本 owner 看到、而 `case.md` 与 `FRAMING` 未列出的未决项（U-S1 … U-S4）**

  - **U-S1 · Memory Agent 的配置面没有归属，而 wire 契约按它存在建成。** 本轮最重要的一条。四个 user-tunable 字段恒为常量、唯一写入界面已删、删除者把职责记给 Settings、Q9 的自带约束禁掉了旧家却没指定新家（E-0048）。**这是一个「输入侧的产出即丢弃」** —— 本案已经点名四个输出侧的死字段（`worker_status` / `candidate_count` / `proposal_count` / `enqueue_status`），这是同一个病的镜像：**一个被完整铺设、两端有测试、每回合都在传的输入通道，源头没有人**。**归属：本 owner 接配置面的实现，但「要不要有」不是本 owner 能裁的**
  - **U-S2 · 「durable localStorage namespace」这个说法本身已经过期。** `memory_agent_v2` 今天存在 `settings.db` 的 `settings` 表里，legacy 迁移状态 `complete`（E-0049）。**`0000-0001-2026-0807#S-0005` 与本案 `FRAMING`、`case.md`、S-0002 的命中理由栏都还写着 localStorage。** 这不影响任何结论，但会影响成本核算的口径 —— 迁移的对手方已经从「一个 JSON 根」变成「一张 SQL 表 + 一次全或无导入事务」
  - **U-S3 · 发布态的 feature flag 值不受版本控制，庭上两份 `ASSESSMENT` 的关键推论建立在它上面。** S-0007 说「发布配置（V2 active）」，S-0012 说「发布配置是 V2 整体关闭」，**两者对同一件事的判断相反，而这件事在 repo 上根本查不到**（E-0051）。**这不是谁错了，是这个问题没有可核实的答案。** 归属：`code-owner-devtools`（`scripts/build-web.cjs` 与 `.gitignore`）+ 发布口径归 `pupu-coo`
  - **U-S4 · `displayName` 到底有没有到达用户，庭上无人证明过。** 本 owner 能证的是它 **在 renderer 侧不被渲染**（E-0052 之二）；而用户在 trace 上读到的 `Memory Agent · {status}` 是 `trace_chain.js:1969` 的 **硬编码字面量**（E-0012 / E-0022），**不是这个 `displayName`**。**即：设置里的 display name 与 trace 上显示的名字之间，今天没有任何一条连线。** 若后端也不渲染它，那么 E-0020 的「双默认值」连用户可见性都不成立，严重度还要再降一档；若后端渲染，则 Q1 必须处理「trace 行的名字由谁定」。**归属：`code-owner-runtime` + `expert-llm` 答后端一半，`code-owner-chat-bubble` 答 trace 行一半。本 owner 只出 renderer 存储侧这一半**

  **四 · 越界内容清单（标注为参考，不计入本 owner 结论）**

  `use_chat_stream.js:6483` 的 wire key 与四字段挑取 → `code-owner-chat-core`（已表态，本 owner 不反对其「不做」）· `memory_v2_curator.py:32/167/1140` 的后端默认值与四键白名单 → `code-owner-runtime` · `memory_v2_unchain_agent_factory.py` 里 `display_name` 的实际用途 → `code-owner-runtime` 与 `expert-llm` · `scripts/build-web.cjs` 与 `.gitignore:20` 的构建期 flag 快照 → `code-owner-devtools` · `electron/main/services/unchain/memory_v2_rollout.js:150`（`storeOwner = mode === "off" ? "off" : "unchain"`，即 Electron 从不发 `pupu_legacy`，而 `off` 与「环境变量缺失」是两回事）→ `code-owner-electron`（批次 4）与 `code-owner-runtime` · `trace_chain.js:1969` 的硬编码行标题 → `code-owner-chat-bubble` · `settings` schema 本身的任何变更 → `code-owner-shared-arteries` 与 `expert-architecture` · `workflow_list.test.js:121-144` 的守卫在 Q9 改名后是否失效 → `code-owner-agents`（批次 4，本 owner 支持 S-0006 的 U-5）

  **五 · 指名承接（不在本案）**

  `src/COMPONENTs/memory-inspect/**` 在本 owner 边界内，Q2 / Q5 / Q8 已分给 `0000-0003-2026-0807`，**本案不展开**。**但请该 case 承接时带上本条的 U-S1** —— Inspector 的形态与「Memory Agent 有没有配置面」是同一个用户面上的两半，若 Inspector 定成一个只读审计面而配置面仍然缺席，用户就得到一个「能看不能调」的记忆系统。本 owner 在该 case 已是法定必到，届时展开。

#### S-0016 | ASSESSMENT | code-owner-electron → case
- **阶段**: 议案庭审
- **结论**: **本层对 Q1 与 Q10 的时序没有任何约束 —— 两条路线、两种顺序，改动量都是 0 行；但本层持有一个两问共用、庭上无人命名的阻塞前置，而正是它让 (c) 成立。** 传输面上：main 中继对 SSE **一道过滤都没有**（`streamMisoSseToRenderer:5087-5095` 无条件转发任意 `event:` 名与任意 `data.type`），preload V4 **不读 `data.type`**（E-0053 / E-0054）；`bundle` 这个词在 `electron/preload/` 命中 **0**、在 `service.js` 命中 **2 且全是打包 runtime 的注释** —— **本层不知道 `done.bundle` 存在，因此结构上不可能裁剪它**。共用前置是：本层在「产出第一条 memory_v2 载荷」之前排了 **九道 fail-closed 相等门**，其中三道是相等门不是下限门，一道在 win32 上结构性不可通过；**四名已出庭 owner 一致认定的唯一有效验收方式（人眼在运行中的应用里看一次真实 trace 行）今天要穿过这九道门，而它们全在本层边界内、且从未被一次性验证全绿过**（E-0057）。故选 **(c)**，理由与已出庭四位都不同。另出两条只有本层能出的证词：**(i)** 本层对存量 `pupu_legacy` store **没有任何认得或处理的代码**，唯一的反应是一条相等门把整个 Memory V2 面判 `degraded` 并让下游硬失败 —— **E-0024 的「留下无主目录」说轻了**（E-0056）；**(ii)** 本层存在本案 **第 6 道、也是最早的一道静默丢弃门**（未知 `envelope.event` 名，零计数零日志），且它与庭上已记录的五道不同类 —— 那五道过滤内容，这一道过滤信封（E-0053）
- **依据**: E-0053 ~ E-0058（六条均由本 owner 在其边界内取证，其中 E-0058 含实跑基线 `45 suites / 751 tests`，E-0053~E-0057 为逐行静态读取 + 全域负向 grep 并附命令原文）；本案 E-0002 · E-0004 · E-0005 · E-0006 · E-0007 · E-0011 · E-0016 · E-0017 · E-0024 · E-0026 · E-0027 · E-0028 · E-0029 · E-0031 · E-0034 · E-0039 · E-0044 · E-0045；S-0002 · S-0003 · S-0004 · S-0005 · S-0006 · S-0007 · S-0008 · S-0009 · S-0010 · S-0011 · S-0012 · S-0013 · S-0014 · S-0015；跨案 `0000-0001-2026-0807#S-0005` · `#S-0006`
- **不确定性**:
  1. **本 owner 没有在运行中的应用里看过任何一条真实 SSE 载荷，也没有起过一次 sidecar。** 全部为静态读取 + 全域负向 grep + 单元测试实跑。**与 S-0006 / S-0013 / S-0014 / S-0015 同一条限制，本层不例外。** 特别是：E-0053 的「未知 `envelope.event` 静默丢弃」与 E-0057 的「degraded → 三道下游硬失败」两条链路 **均未构造运行时复现**，由控制流推出（listener 是一串 `if` + `return`、无 else，读到函数末尾即可确定；下游三道门是显式 `throw` / `return`）
  2. **磁盘上那 473 MB（E-0007）会不会真的让 sidecar 报 `store_owner = "pupu_legacy"`，本层未核实。** 那取决于 `memory_v2_store_boundary.py:96` 与 sidecar 的启动环境，属 `code-owner-runtime`。**本层只能证明 Electron 从不请求它、并且拒绝它**，不能证明它今天在任何一台机器上真的被报出来过
  3. **E-0055 对 unchain 仓的负向 grep 只覆盖 `/Users/red/Desktop/GITRepo/unchain/src` 的 `*.py`**，未覆盖该仓其它目录与已删除的历史版本。若 `runtime_events_v4` 经未搜到的路径与 unchain 侧耦合，「不是跨仓握手」这条判定要打折
  4. **E-0054 的两条静默失败模式（结构化克隆失败、`JSON.stringify` 抛错）今天不可达**，由 Electron `webContents.send` 的既知语义与两处裸 `catch` 推出，**未构造复现**。列出它们是因为「让 Electron 参与构造载荷」的方案会打开这条路，不是因为它们今天在咬人
  5. **E-0057 的门 0（打包态 `build_feature_flags.json` 双指纹）未在打包后的应用里实测** —— 与 S-0015 不确定性 4 同一条限制，核实属 `code-owner-devtools`
  6. **E-0058 未读 `.github/workflows`**，故「本仓是否另有第三条 runner 覆盖 Electron 测试」是公开问题，属 `code-owner-devtools`
  7. **越界读取披露**：为核算「本层收到什么、发出什么」，读了 `unchain_runtime/server/route_catalog.py`、`unchain_runtime/unchain-core.lock.json`，并对 `/Users/red/Desktop/GITRepo/unchain/src` 跑了一条负向 grep。**这些结论一律不作主张，最终以 `code-owner-runtime` 与 `code-owner-unchain` 为准。** 本层 **未** 越界读取 `src/**` 的任何文件 —— 关于 renderer 侧的一切，本条全部引用已归档的 E-0011 / E-0026 ~ E-0032 / E-0033 ~ E-0040，不自行取证
  8. **未派生任何子 instance。本轮只读，未改任何产品代码，未 commit。** 写入仅两处：本案 `.inbox/` 下的 `S-0016.md` 与 `E-0053`…`E-0058.md`；以及 `.claude/agent-memory/code-owner-electron/` 下的记忆文件与索引一行（该目录 git 已跟踪，工作树会带这些变更，特此披露）
- **请求/下一步**:
  1. **请把 E-0057 的九道门列为本案的一条 已证实的必要前置，与 E-0024 的存量数据处置并列，且不要把它并进 Q1 或 Q10 任何一问。** 它不是词汇问题、不碰待删清单、不依赖 active 面遥测产出者 —— 它是「四名 owner 一致要求的那一次人眼验收，今天物理上要穿过什么」的答案。**本 owner 认领这九道门的说明与打通责任**，但打通的判定项里有六项的实际取值属 `code-owner-runtime`
  2. **请裁定明写：`electron/main/services/unchain/service.js:930` 的 `runtime_events_v4` 是 capability 名，不是帧信封名，且其产端在 `unchain_runtime/server/route_catalog.py:158/169/188` —— 它不是跨仓握手。** E-0006 的完整性限制已写对，但 S-0004 的命中依据段与 `FRAMING` 的 Q1-前段 原文仍在把这个词当承载体的证据用。**这与 S-0012 约束 2 是同一条要求，本层从产端一侧独立确认**
  3. **请把 E-0053 的「未知 `envelope.event` 静默丢弃」加进本案的静默门清单，编为第 6 道，并标注它是最早的一道。** 已记录的五道全部过滤 **内容**，只有这一道过滤 **信封** —— 后端若为 Memory V2 发明一个新的 SSE `event:` 名，它连 `event_store.js:189` 那个「至少记进 `unknownEvents`」的机会都拿不到。**本 owner 接这一道门的处置**（加一条 default 分支 + 计数），**且它不依赖本案任何一问的裁定结果**
  4. **请把 E-0056 交 `code-owner-runtime` 定向质询一次**：磁盘上存在 v4 legacy store 的机器，sidecar 今天会不会真的报 `store_owner = "pupu_legacy"`。**这一问的答案决定 E-0024 的存量处置是「整洁问题」还是「用户今天就会遇到的 degraded」**，而本层只能答一半
  5. **请把 E-0055 的 `context_memory_contract` 双份手写副本并入 S-0007 U-R2 / S-0012 U-C5 的处置范围。** 它是同一失败类的第四份副本，落在 readiness 门上而不是投影层，**本 owner 认领 Electron 一半**
  6. **本 owner 不请求任何属于自己的切片进入 (c) 的主方案。** 两条路线在本层的改动量分别是 0 行与 0 行（唯一例外见「受影响对象」的路线 B′）
- **评估结论**:

  **一 · 对本轮四项定向质询的逐条回答**

  | # | 质询 | 本 owner 的回答 |
  |---|---|---|
  | **A** | 白名单式还是透传式？未知 `data.type` 会被丢弃还是到达 `onFrame`？丢弃有无计数/日志？ | **两个粒度，答案相反。频道粒度是白名单，帧粒度是透传。** 未知 `data.type` **不会被丢弃**，但也 **不会到达 `onFrame`** —— V4 监听器根本没有 `onFrame`，它到达 `handlers.onRuntimeEvent`。**真正被静默丢弃的是未知 `envelope.event` 名，零计数、零日志、零 diagnostic** |
  | **B** | `done` 的 payload 做不做裁剪/封顶/改形？有没有大小上限会截断 bundle？ | **一律没有。** `bundle` 在 `electron/preload/` 命中 **0**、在 `service.js` 命中 **2 且全是打包 runtime 的注释**。preload `:227` 是 `onDone(data)` 整体传。**唯一的两个上限（32 MB / 100,000 事件）只作用在 replay buffer 上，从 head 逐出，不截断 live 路径的 `done`** |
  | **C** | 若要求流承载新的 V2 帧类型，改动量多少？必须动 `service.js:930` 吗？lock 要不要动？ | **路线 A 与路线 B 均为 0 行；只有「新增一个 SSE `event:` 名」这一支（B′）要改 preload 一处。`service.js:930` 不必动 —— 加 capability 门是选择不是要求。`unchain-core.lock.json` 不必动，且本层零消费者** |
  | **D** | `runtime_events_v4` 是 capability 名不是帧信封名 —— 确认或反驳？ | **确认。** `service.js:921-945` 是对 `/health` 返回的 `contract.capabilities` 里四个 **布尔字段名** 的存在性检查，`!== true` 即 `fail()`。帧信封名是 `envelope.event`（`runtime_event`/`error`/`done`）。**并补一条 E-0006 未及的：它的产端在 PuPu 自己的 sidecar（`route_catalog.py`），unchain 仓零命中 —— 它不是跨仓握手** |

  **二 · A 问的完整回答：本层的过滤在「频道」粒度，不在「帧」粒度**（E-0053 / E-0054）

  | 粒度 | 机制 | 未知者的命运 | 有无计数/日志 |
  |---|---|---|---|
  | **IPC 频道** | `electron/preload/channels.js:150-159` 的 `PRELOAD_EVENT_CHANNELS` 冻结 8 项数组 | **白名单。** 所有流帧只从 `UNCHAIN.STREAM_EVENT` 一个洞过 | 不适用 |
  | **SSE `event:` → `envelope.event`** | main `:5090` **不判、直接转发**；preload V4 `:195/:207/:218` 三分支、V2 `:77/:126/:137` 三分支 | **main 全部放行；preload 静默丢弃** —— 落到 `:230` 函数末尾就没了，**无 else、无 default** | **零。零计数、零日志、零 diagnostic** |
  | **`data.type`** | **V4 一次都不读**；V2 `:78` 读，但 `:81-83` 已 **无条件先调** `onFrame(data)` | **不丢弃。** V4 原样进 `onRuntimeEvent`，V2 原样进 `onFrame` | 不适用 |

  **对 E-0028 的处置：主结论确认，一处实质补充。** `code-owner-chat-core` 说「V4 路径是透传的」—— 对，且本层实读全文确认。**但它把透传写成了无条件的**，遗漏了透传有一个边界：**对 `data.type` 透传，对新的 `envelope.event` 名不透传。** 这不是措辞问题 —— 它决定 S-0012 成本表里「preload 在路线 B 上为零」这一格是否成立：**只有「新帧类型仍包在既有 `runtime_event` 信封里」时才为零。**

  **同时补完 E-0028 明确留给本批次的那一段（`service.js` 中继）：没有类型过滤，一处都没有。**`streamMisoSseToRenderer:5086-5095` 对每个 SSE 块只做「解析 → `JSON.parse` → 无条件 `emitMisoStreamEvent`」三步。唯一读 `payload?.type` 的地方是 `:5100-5101` / `:5133-5134` 的 **终止判定** —— 它决定什么时候停止读 SSE，不决定要不要转发；被判为终止的那一帧 **已经在 `:5090` 转发出去了**。**且 V2 与 V4 共用这一段**（`:5501-5505` 只差一个 endpoint）。

  **三 · B 问：本层在 `done` 这条路上是一根不透明的管子 —— 它连管子里是什么都不知道**

  这一条是可机械复核的，不需要读代码逻辑：

  ```
  grep -rn "bundle" electron/preload/                              → 0
  grep -n  "bundle" electron/main/services/unchain/service.js      → 2 （:1535 · :4781，均为注释）
  ```

  两处注释原文都是 "Packaged sidecars must use PuPu's bundled, read-only runtime payload" —— **说的是打包 sidecar 的 runtime payload，与流载荷无关**。

  **故 E-0026 的链路图在 Electron 这一段可以从「未核实」改为「已核实且为恒等映射」**：`route_chat.py:1101` 的 `done_payload` → SSE `event: done` → main `:5090` 原样 emit → `emitMisoStreamEvent:4463-4476` 包成 `{requestId, event, data, streamSeq}` → `webContents.send` → preload `:218-227` `handlers.onDone(data)` → `use_chat_stream.js:7538`。**全程零裁剪。**

  **两条今天不可达、但方案可能打开的静默失败模式**（E-0054 第四节，**登记而非主张**）：`sendMisoStreamEnvelope:4363` 的裸 `catch` 会在结构化克隆失败时 **丢弃整条 `done` 信封并把 renderer 标为脱离**，零反馈；`measureMisoStreamReplayEnvelope:4281` 对 `JSON.stringify` 抛错的处理是「立刻逐出 replay」，同样静默。**今天来的是 `JSON.parse` 的产物，天然可克隆，故不可达。** 本层据此提约束 3。

  **四 · C 问：逐支的改动量**

  | 支 | 后端形态 | main | preload | `service.js:930` | lock |
  |---|---|---|---|---|---|
  | **A · 审计块** | 往 `bundle.memory_v2` 加键 | **0** | **0** | 不动 | 不动 |
  | **B · 过程信号（既有信封）** | 新 `data.type`，仍包在 `runtime_event` 里 | **0** | **0** | 不动 | 不动 |
  | **B′ · 过程信号（新信封）** | 新的 SSE `event:` 名 | **0** | **必改一处** | 不动 | 不动 |
  | 附加 · 若裁定要加能力门 | 新 capability 键 | 0 | 0 | **必改，且须与 `route_catalog.py` 同一次落地** | 不动 |

  **两条要写进裁定的判断**：

  - **加 capability 门是一个选择，不是一个要求。** 新帧类型本身不需要新 capability，现有的 `runtime_events_v4` 已覆盖「这个 sidecar 会说 v4」。**若选择加，代价是一道不可回滚的相等门** —— `:935` 是 `!== true → fail()`，旧 sidecar 配新 Electron 会 **整个启动失败**，不是降级
  - **`unchain-core.lock.json` 与本层无关**（`grep -rn "unchain-core.lock" electron/` → **0**），**但 `memory_v2_rollout.js:421` 硬编码着 lock 里那个 `context_memory_contract: 1` 的第二份手写副本，无共享来源、无比对测试**。这是 S-0007 U-R2 / S-0012 U-C5 描述的失败类的第四份副本，**落在 readiness 门上**（见请求 5）

  **五 · Q10 的证词（本庭定向质询）：本层没有任何代码认得或处理存量 `pupu_legacy` 目录 —— 但这比「没有」更糟**

  **先答问题本身：没有。** 三条全域负向 grep（E-0056，命令原文已给）：

  ```
  grep -rn "pupu_legacy|pupu-legacy|legacy-v4|legacy_v4" electron/     → 2，全部在 .cjs 测试里，全部是负向断言；生产代码 0
  grep -rn "context_v2.sqlite3|context_v2.owner" electron/             → 1，是错误文本 fixture；生产代码 0
  grep -rn "renameSync|rmSync|unlinkSync|rmdirSync" electron/main/services/unchain/*.js → 0
  ```

  **本层不读、不迁、不清、不改名、连那个目录的路径都不知道。** 这与 E-0024 在 `unchain_runtime/server/*.py` 一侧的同形结论 **在两侧闭合** —— **两个进程都没有任何机制处理它。**

  **但本层唯一"认得"它的那一样东西，把结论从「没有」推到了更远的地方。** `memory_v2_rollout.js:5-9` 的注释逐字写着：

  > `Must track Unchain's SQLiteContextV2Store schema exactly. This is an EQUALITY gate, not a floor. PuPu's retired prototype also used the public Context V2 status shape but ended at schema v4, so readiness must verify the canonical store owner as well as Unchain schema v2 before enabling traffic.`

  **E-0007 实测那个 store 的 `meta.schema_version` 正是 4。这段注释就是为它写的。** 配套判定 `validateMemoryV2Status:409-411`：`storeOwner !== "unchain"` → `context_v2_store_owner_incompatible`；`schemaVersion !== 2`（**相等门，不是下限**）→ `context_v2_schema_incompatible`。两条今天由两条活的 `.cjs` 测试钉住，**第二条的测试名逐字是** `legacy PuPu store ownership degrades only Context V2 and blocks its methods`。

  **净效果，两个方向都要写进裁定，因为它同时削弱和加重了两边的论证**：

  - **削弱 S-0007 的「删除 `memory_v2_curator.py` 是一次用户可见能力的净减少」** —— 在本层的门下，对一台 sidecar 报 `pupu_legacy` 的机器，那条能力 **今天就已经是零**：readiness 判 `degraded`（`service.js:1874-1878`）→ 每一次 Context V2 调用抛 `context_v2_readiness_failed`（`:1897-1906`，**掐死的正是 journal reload 那条通路**）→ 每一次 `memory_v2_requested` 的回合直接发 `error` 帧、**SSE 请求根本不发出**（`:5312-5322`）。**「弃用一个 store owner」这件事，在本层的门上已经做完了；`unchain_runtime/` 那四个文件是一条本层已经封死的路上的实现**
  - **加重 E-0024 的必要前置** —— 存量处置不是「删代码之后留下一个没人管的目录」这么温和。**是留下一个会让整个 Memory V2 面 degraded 的目录，而产品既没有代码认得它、也没有任何界面告诉用户为什么 degraded。** E-0024 把它从建议升格为必要条件是对的，**本条把它的严重度再升一级**

  **六 · 一条 (a)/(c) 之外、但对本案验收有决定性的事实：九道门**（E-0057）

  四名已出庭 owner 独立收敛到同一条验收标准 —— 「单元测试在这条路径上不具备证明力，必须在运行中的应用里、一个真实产生过对应事件的会话上人眼看过一次」（S-0006 §6 · S-0012 约束 6 · S-0013 约束 3 · S-0014 取证限制）。**四人都没有说那一次要穿过什么。答案在本层：**

  **门 0**（`resolveMemoryV2ReleaseConfig:210-309`）：打包态下 `build_feature_flags.json` 必须在、schema 必须对、`snapshot_fingerprint` 与 `rollout_fingerprint` **两个 sha256 都要重算相等**；**加平台门**（`:311-342`）：win32 上 `canary`/`all` 被强制压回 `shadow`。

  **门 1**（`validateMemoryV2Status:405-450`）九项短路判定：`available` · `storeOwner === "unchain"` · `schemaVersion === 2`（**相等门**）· `journalMode === "wal"` · `lexicalBackend ∈ {fts5, degraded}` · `contextMemoryCapabilityReady` · `reason === "unchain_context_memory_ready" && contextMemoryContract === 1 && /^[0-9a-f]{40}$/.test(unchainRevision) && verification ∈ {exact_sha, dev_bypass, dirty_dev_checkout}` 及三条 verification × mode × immutable 交叉约束 · `rolloutConfigValid` · 六项 rollout 字段逐项相等 **加 `rolloutFingerprint` 相等**。

  **门 2 / 门 3**：degraded 之后不是降级，是硬失败（上一节已述）。

  > **这不是「测试写得不够」，是「可观测配置本身是一个尚未完成的交付物」，而它整个落在本层边界内。** 与 E-0031（`enable_memory_v2` build 默认 `false`）合起来读：**默认安装上，这九道门里第一道就是关的。**
  >
  > **本层据此给出一条对两个选项都成立的硬要求：无论裁向 (a) 还是 (c)，一份不含「让这九道门在某台机器上一次性全绿并留证」的方案，在本层是不可验收的。**

- **边界命中依据**: `pupu:electron/**`（整目录，2026-08-05 已因同类问题由四个子目录修正为整目录）。**确认 S-0004 的边界自愈信号第 4 号分类正确：抽取写窄，非边界写窄，处方「改工具不改 charter」正确，S-0011 已回归验证（该工具在本层边界内命中 18 处）。本 owner 不反驳，也不请求任何 charter 变更。**

  取证落点：`electron/main/services/unchain/service.js`（`:26-36` · `:131-133` · `:892-974` · `:1029-1093` · `:1535` · `:1599` · `:1644-1661` · `:1864-1886` · `:1892-1940` · `:1958-1969` · `:1988-2009` · `:2011-2030` · `:4265-4330` · `:4332-4373` · `:4450-4486` · `:4646-4650` · `:4781` · `:4995-5005` · `:5007-5052` · `:5054-5152` · `:5296-5346` · `:5380-5505` · `:5581-5680` · `:5802-5806` · `:5872-5920`）· `electron/main/services/unchain/memory_v2_rollout.js`（全文 466 行）· `electron/preload/stream/unchain_stream_client.js`（全文 510 行）· `electron/preload/bridges/context_v2_bridge.js`（`:11-34` · `:44-60`）· `electron/preload/channels.js`（`:140-166`）· `electron/shared/channels.js`（`:100-175`）· `electron/main/ipc/register_handlers.js`（`:24-41` · `:141` · `:155` · `:633-645` · `:694-695`）· `electron/tests/main/{memory_v2_rollout,memory_v2_startup_readiness,boot_readiness_service}.test.cjs` · `electron/tests/preload/api_contract.test.cjs:504` · `src/electron/tests/**`（36 份 shim 的清单与 3 份抽查）。

  **子目录负向核对**：`memory_v2|memoryV2|memory_agent|memoryAgent` 在 `electron/` 非测试生产代码的命中 **全部落在 `service.js` 与 `memory_v2_rollout.js` 两个文件** —— `electron/main/window/**` · `electron/main/index.js` · 其余 12 个 preload bridge · `electron/main/services/{miso,ollama,update,test-api,boot_readiness,...}` 对 Memory V2 **零感知**。**本案在本层只触及 unchain service 与 stream client 一条线。**

- **受影响对象**:

  | 问 | 落位 | 本层的对象 |
  |---|---|---|
  | **Q1**（trace 中体现什么） | **不落在我这里** | 本层既不产帧也不渲染，也不持有任何状态词。`electron/` 生产代码里 `Isolated` / `worker_status` / `candidate_count` / `memory_agent_runs` **一处都没有** |
  | **Q1-前段**（流是否承载 V2 帧） | **落在我这里，但只作为传输事实的出具方，不作为裁定方** | `service.js:5054-5152`（中继）· `unchain_stream_client.js:161-236`（V4 监听器）· `:68-159`（V2 监听器）· `preload/channels.js:150-159`（频道白名单）。**判据不在本层** —— E-0028 已把重心移到 `code-owner-shared-arteries` 的 `event_store.js` / `activity_tree.js`，本层实读后 **确认该移位** |
  | **Q9** | **不落在我这里** | `memory_agent_config` 在 `electron/` **零命中**（E-0030 已证），本层不注入、不改写、不改名。用户可见文案、durable namespace、后端契约 **一处都不在本层** |
  | **Q10** | **不落在我这里**（四个待删文件全在 `unchain_runtime/**`）**—— 但本层是它最重要的下游门禁，且出两条决定性证词** | `memory_v2_rollout.js:150`（只发 `off\|unchain`）· `:5-9` + `:9`（相等门与它的成文理由）· `:405-450`（拒绝逻辑）· `service.js:1897-1906` / `:5312-5322`（degraded 之后的两道硬失败） |

  **需在本层边界内改动的（按可独立性排序）**：① `unchain_stream_client.js` 的 V4 监听器补一条 default 分支 + 计数（**零跨 owner 依赖，不依赖本案任何裁定，E-0053**）；② `memory_v2_rollout.js:421` 的 `contextMemoryContract` 与 lock 之间加一条比对（**零跨 owner 依赖，E-0055**）；③ 九道门的一次性全绿演练与留证（**依赖 `code-owner-runtime`，六项判定值属其边界，E-0057**）；④ 路线 B′ 若被选中，V4 监听器加一个信封分支（**依赖形态裁定**）。**①②③ 全部不进 (c) 的主方案，也不请求进。**

- **约束**:

  1. **裁定文本不得再把 `runtime_events_v4` 当作 V2 帧的承载体或跨仓握手。** 它是 `/health` 返回的 `contract.capabilities` 里的一个布尔字段名（`service.js:929-945`），产端在 `unchain_runtime/server/route_catalog.py:158/169/188`，**unchain 仓零命中**。**与 S-0012 约束 2 同向，本层从产端一侧独立确认。**
  2. **不得在不同步改 `unchain_stream_client.js` 的 V4 监听器的前提下，为 Memory V2 新增一个 SSE `event:` 名。** 那是本案第 6 道、也是最早的一道静默丢弃门，**零计数、零日志、零 diagnostic**，且它比 `event_store.js:189` 更早 —— 被它吃掉的帧连 `unknownEvents` 都进不去。**在既有 `runtime_event` 信封内加 `data.type` 不受此约束**（本层完全透传）。
  3. **Electron 侧不得成为 memory_v2 载荷的构造方，只做管子。** 本层在 `webContents.send` 与 `JSON.stringify` 两处各有一个裸 `catch`（`service.js:4363` / `:4281`），失败一律静默。今天来的是 `JSON.parse` 的产物、天然可克隆，故不可达；**任何让主进程参与拼装载荷的方案会直接打开这条路。**
  4. **存量 `pupu_legacy` store 的处置（E-0024 的必要前置）不得以「给 renderer 加一个清理 channel」实现。** `electron/shared/channels.js:120-145` 有一段成文硬边界：无通用 method/path/url/fetch channel；**删除 chat 不是 renderer 能力**（"needs a fresh security review, not a one-line edit"）。走那条路会同时撞上第一条与最后一条。正确落点是 main 进程侧的一次性动作，renderer 至多被告知结果。
  5. **Q10 的验收方案必须显式列出 Electron 侧的 runner，否则本层回归面为零覆盖。** 本层的测试是 `.cjs`，`react-scripts test` 只能经 `src/electron/tests/**` 的 shim 命中；**任何收窄到 `src/COMPONENTs/` 或 `src/PAGEs/` 的 `--testPathPattern` 都不会跑到钉住 `pupu_legacy` 拒绝行为的那两条负向断言**（E-0058）。本层基线：`45 suites / 751 tests`，全绿，命令见 E-0058。
  6. **capability 数组只能加不可回滚的能力，不能加可选特性。** `service.js:935` 是 `!== true → fail()` —— 加一项就意味着旧 sidecar 配新 Electron **整个启动失败**，不是降级。
  7. **本轮只读，未改任何产品代码，未 commit，未派生任何子 instance。** 写入披露见「不确定性」第 8 条。

- **建议处置**:

  **一 · 核心问题：(c) —— 二者必须在同一份方案里同时落。理由是第五条，与已出庭四位都不同。**

  **先把话说在前面：本层的传输面 不支持 (c)，它支持任何顺序。** 路线 A 与路线 B 在本层的改动量都是 0 行，两种顺序也都是 0 行。**`FRAMING` 的同案理由（产点耦合）与 S-0007 的同案理由（轴被 fail-closed 门锁死）在本层都不成立** —— 本层不持有任何词汇，也不因为哪个 `.py` 文件消失而失效。**若只看传输，本层会说这两问可以拆。**

  **让本层改判的是另一件事，而它是本层独有的观察：**

  > **Q1 与 Q10 各自的可验收性，共用同一个尚未交付的前置 —— 九道 fail-closed 相等门的一次性全绿与留证，而它整个在本层边界内，且从未发生过。**
  >
  > - **Q1 需要它**：四名 owner 一致认定词汇规格的唯一验收方式是人眼看一次真实 trace 行（S-0006 §6 · S-0012 约束 6 · S-0013 约束 3 · S-0014）。那一次要穿过这九道门
  > - **Q10 也需要它**：删除的验收标准（S-0007 建议的「trace 的 memory-agent 轴在 active 平面非空」）同样要穿过这九道门
  >
  > **一个共用的、未交付的、贵的前置，如果被拆进两份方案，会被付两次或者被推迟两次。** 这正是本案已经反复出现的那个失败模式 —— `worker_status` / `candidate_count` / `proposal_count` / `enqueue_status` 四个字段产出即丢弃，不是因为谁做错了一步，是因为 **没有任何一方在为"两端对得上"这件事负责**。**把它拆开，第五个产出即丢弃的东西就会是这九道门本身。**

  **逐项表态**：

  - **(a) 反对，但理由不是它的论证错。** `code-owner-chat-bubble` 的观察本层不反驳（本层也是「删了不失效」的一个例证：删那四个文件，本层一行都不会变）；`code-owner-shared-arteries` 对它自陈成立条件的证否本层不越界复核；`expert-llm` 提名的上游 typed 枚举锚点，本层核实到 **它确实不在本层的任何一道门内侧**（`electron/` 对 `unchain/src` 的词汇零依赖），故 **该锚点在本层这一侧成立**。**本层反对 (a) 的唯一理由是：(a) 把删除放在词汇之后，就意味着 E-0024 的存量处置会以「后续项」的身份离开这份方案的视野 —— 而那恰好是本层门后最坏的那个状态**（用户机器上一个会让整个 Memory V2 面 degraded、却无任何代码认得、无任何界面解释的目录）。**(c) 是三个选项里唯一强制把它留在框内的**
  - **(b) 反对。** 与四位一致，本层加一条独立理由：删除之后，本层那两条钉住 `pupu_legacy` 拒绝行为的负向断言（E-0056）会变成 **断言一个再也不会出现的输入**。它们不会红、也不会被删 —— **本层会留下两条永远绿、永远无意义的测试，而它们今天是产品对存量 store 的唯一成文记录**
  - **(c) 采纳，且同意 `code-owner-shared-arteries` 的措辞修正**：写成「**三段（或 S-0012 的四段）有序，且第一段是一个交付物不是一次讨论**」，不要写成「同时落」。**本层再加一条它没说的**：这三段的 **可观测性** 也差两个数量级 —— 第 0 段（形态裁定）零可观测、第 1 段（补产出者）要穿九道门才可观测、第 3 段（删除）在本层 **回归面为零可观测**（与 S-0006 §6 的证词同形，在本层同样成立）

  **二 · 对 S-0012 四段式的一条补充：第 0 段与第 1 段之间还缺一个「让它可被看见」的动作**

  S-0012 建议的四段（0 裁形态 → 1 补产出者 → 2 定词汇 → 3 删）本层同意，**但第 1 段的完成判据必须写成「产出者产的东西被人眼看见过一次」，不能写成「产出者已实现」**。理由是本层的九道门：**一个已实现但从未穿过这九道门的产出者，与一个不存在的产出者，在验收上没有区别** —— 而本案已经有四个字段用这种方式活着。

  **本层认领这一项，且它可以与第 0 段并行、不被形态裁定阻塞**：九道门里有三道是本层自己的配置（门 0 的双指纹、平台门、rollout 六项相等），六道的实际取值属 `code-owner-runtime`。**把它单列，成本是一次演练，收益是本案后续每一条「人眼看过一次」的验收标准从此有一条可执行的路径。**

  **三 · 逐问建议处置**

  | 问 | 建议 |
  |---|---|
  | **Q1** | **不落在我这里。** 唯一请求：无论定成什么，**裁定文本不得再用 `runtime_events_v4` 指代承载体**（约束 1），且若形态裁向「过程信号 + 新 SSE `event:` 名」，**必须把 preload 那道门写进同一份方案**（约束 2） |
  | **Q1-前段** | **落在我这里，但只出传输事实：`done` 信封在本层是恒等映射（零裁剪、零封顶、零改形，本层不知道 `bundle` 存在）；runtime event 在本层对 `data.type` 完全透明；唯一被静默丢弃的是未知 `envelope.event` 名。** 支持 S-0012 请求 2 把这一问 **重写**，并支持它把判据落点定在 `code-owner-shared-arteries` —— **本层实读后确认 E-0028 的移位判断成立** |
  | **Q9** | **不落在我这里。** `memory_agent_config` 在 `electron/` 零命中，本层不注入不改写。对 S-0012 ④ 与 S-0015 关于双默认值不可达的结论 **不反驳、不加意见** |
  | **Q10** | **不落在我这里。** 出两条证词：**(i)** 本层没有任何代码认得或处理存量 `pupu_legacy` 目录 —— 唯一"认得"它的是一条把它判 degraded 的相等门，**故 E-0024 的严重度要升一级，且 S-0007 的「用户可见能力净减少」在本层的门下要打折**；**(ii)** 验收方案必须显式列 Electron runner，否则本层回归面零覆盖（约束 5）。**并支持把「存量数据处置」按 S-0012 的建议从 Q10 摘出单列** —— 本层的门让它 **既不因删代码而起、也不因不删而免**，且危害比不删代码更早发生 |

  **四 · 本层看到、而 `case.md` 与 `FRAMING` 未列出的、属于本案范围的未决项（U-E1 … U-E5）**

  - **U-E1 · 本案的静默门是六道不是五道，且最早的一道在本层、过滤的是信封不是内容。** 已记录五道（`route_chat.py` 13 键 · presenter `TOP_LEVEL_KEYS` · `chat_storage_sanitize` 64 字符 · `event_store.js:189` · `activity_tree.js` fall-through）全部过滤 **内容**；`unchain_stream_client.js` 的 V4 监听器过滤 **信封**，且被它吃掉的帧 **连 `unknownEvents` 都进不去**。**本 owner 接这一道门的处置，且它不依赖本案任何裁定**（E-0053）
  - **U-E2 · 九道 fail-closed 相等门是本案「人眼看一次」验收标准的物理前置，四名 owner 都要求了那一次、没有一个人说它要穿过什么。** 三道是相等门不是下限门，一道在 win32 上结构性不可通过，默认安装上第一道就是关的（E-0031 + E-0057）。**这是本轮最重要的一条，且它同时是 Q1 和 Q10 的前置 —— 正是它让本层投 (c)**
  - **U-E3 · `context_memory_contract` 的第二份手写副本在 readiness 门上。** `memory_v2_rollout.js:421` 硬编码 `!== 1`，与 `unchain-core.lock.json` 的 `context_memory_contract: 1` 无共享来源、无比对测试。**这是 S-0007 U-R2 / S-0012 U-C5 描述的失败类的第四份副本，且它的失败模式更隐蔽 —— 升到 2 那天 Electron 会静默把 Memory V2 判 degraded，而 lock 文件是绿的**（E-0055）
  - **U-E4 · CONTEXT_V2 通路（journal reload 的来源）在本层是「入参两道白名单 / 出参完全透传」的不对称结构，`FRAMING` 与全部已归档发言均未记载。** 直接含义：`memory_v2_journal_reload.js` 今天丢的字段 **一个都不是本层丢的**；**「journal 数据层迁入 `runtime_events/`」在本层改动量为 0 行，本层不构成阻碍**。附两个量化边界：`limit` 上限 **500** 条/页、content 单次 **128 KB**（`service.js:131-133`）—— **若 Q1 的规格要求「一次展开读齐某轮全部 curator 事件」，500 这个数需要被明确核算**（E-0057）
  - **U-E5 ·（**标为参考，不计入本层结论，且不属本案范围**）`npm run test:electron` 的 `testMatch` 是裸 `**/electron/tests/**/*.test.cjs`，在本机会连同 `.claude/worktrees/` 下其它工作树一起跑（**332 suites** 而非 **45**）。** 即 **该命令的实际覆盖面取决于本机有多少工作树，不是一个确定的数**。这是构建配置缺陷，**落 `code-owner-devtools`**，本层只登记；但它直接影响「本案 Electron 侧基线是多少」的可复核性，故与基线同条归档（E-0058）

  **五 · 越界内容清单（标为参考，不计入本层结论）**

  形态的产品取舍 → `expert-ux` 与 `0000-0003-2026-0807` · `route_catalog.py` 的 capability 产端与 `_runtime_event_v4_available()` 的判定逻辑 → `code-owner-runtime` · `unchain-core.lock.json` 的语义与维护 → `code-owner-runtime` · 磁盘 v4 store 是否真会让 sidecar 报 `pupu_legacy` → `code-owner-runtime`（本层请求 4 已提请质询）· `event_store.js` / `activity_tree.js` / `memory_v2_trace_presenter.js` 三者的取舍 → `code-owner-shared-arteries` · unchain `events/{types,normalizer}.py` → `code-owner-unchain`（**不在必到名单；若形态裁向路线 B，S-0012 请求 3 的重新判定请求本层支持**）· `npm run test:electron` 的 testMatch 与 CI 工作流 → `code-owner-devtools`（**本层不主张传唤，只登记事实，与 S-0015 请求 4 同形**）· 存量 473 MB 的可弃性 → `code-owner-runtime` 与 `chief-judge`。

#### S-0017 | ASSESSMENT | code-owner-agents → case
- **阶段**: 议案庭审
- **结论**: **U-5 成立，且比其自述更重；但它对该测试内容的描述要更正一处，而更正之后结论更强。** 该守卫不止一条断言（六条），其中两条与词无关的结构断言 `:147-148` **对历史形态无效** —— 历史卡片自带 **第二个 `Explorer` 实例且渲染在主实例之前**，`mockExplorerProps.at(-1)` 取不到它（E-0059）。故约束今天真正的活强制点只剩两条 **字面量** 断言，而 `:144` 匹配的 `"Memory Agent"` **从来不是本 owner 边界内的字面量** —— 它是 `memoryAgentSettings.displayName` 的默认值，定义在 `code-owner-settings` 的 `memory_agent_settings.js:24`，**而该 owner 已在 S-0015 声明会改动 `displayName` 默认值且「不需要等本案任何裁定」**。**即：本案唯一的自带约束，可以在没有任何 case、没有任何测试变红、没有任何人经手本 owner 边界的情况下自行失效。** 另出一条庭上无人出具的事实：**约束的「recipe 节点」半边今天零强制**（画布与详情面在该测试里被整体 mock，节点类型集合无任何穷举断言，E-0062）。**本 owner 的 charter 不需要修改，约束原文也不需要修改 —— 需要修改的是它的表达介质：把它从「屏幕上没有某个词」改写成「源码里没有某族标识符」。** 核心问题选 **(c)，但这是一张窄票且附明确翻转条件**
- **依据**: E-0059 · E-0060 · E-0061 · E-0062（四条均由本 owner 在其边界内取证，含可复现的 grep、`git show` 与一次实跑 `20 passed`）；本案 E-0002（HEAD `8d7fbd1d` 复核一致，产品目录零变更）· E-0003（本 owner 的命中依据）· E-0048（`code-owner-settings` 出具的历史，本轮在本边界内逐条复核）；S-0002（`FRAMING`）· S-0006（U-5）· S-0007 · S-0015；跨案 `0000-0001-2026-0807#S-0005`
- **不确定性**:
  1. **本 owner 没有在运行中的应用里看过 Agent Builder 的任何 Memory V2 相关状态。** 全部为静态读取 + git 历史 + 单元测试。与 S-0006 / S-0013 / S-0015 同一条限制
  2. **「结构断言被渲染顺序击穿」只对历史形态成立。** 若未来的重新引入把自己的 `Explorer` 渲染在主 `Explorer` **之后**，`:147-148` 会变红。本条主张的是「该断言的有效性取决于 JSX 顺序」，**不是**「该断言恒无效」（E-0059 完整性限制 a）
  3. **未实证空断言。** 本轮只读，未改测试。`queryByText` 对不匹配字符串返回 `null` 故 `not.toBeInTheDocument()` 通过，是 Testing Library 的既定语义，本 owner **按定义推导，未做实验**
  4. **`recipe_migration.js:47` 的 `override.memory` 后端语义未追到底。** 本 owner 判定它是 legacy character 的遗留字段透传（后端 recipe schema 只定义 `subagent_profile.memory_policy`），**该判断越出本边界的部分标为参考，以 `code-owner-runtime` 为准**
  5. **E-0061 未核对 `0dc333dc` 与 `eaf5a296` 之间是否另有第三次改动**（两者同日、相隔 9 小时 26 分）
  6. **「零强制」只就本 owner 边界内的测试而言**，未穷举全仓测试，不排除边界外存在别的守卫
  7. **越界读取披露**：为核算落差读了 `src/SERVICEs/memory_agent_settings.js`（settings，仅确认 `:24` 的存在与 `MEMORY_AGENT_SYSTEM_NODE_ID` 已删）· `unchain_runtime/server/recipe.py` 与 `subagent_loader.py`（runtime，仅确认 `memory_policy` 语义）· `src/BUILTIN_COMPONENTs/flow_editor/`（ui-primitives，仅确认消费者数）。**这些结论一律不作主张**
  8. **未派生任何子 instance；本轮只读，未改任何产品代码，未 commit。** 写入仅两处：本案 `.inbox/` 下的 `S-0017.md` 与 `E-0059`…`E-0062.md`，以及 `.claude/agent-memory/code-owner-agents/` 下的记忆文件与索引（该目录 git 已跟踪，工作树会带这些变更，特此披露）
- **请求/下一步**:
  1. **请裁定不要单独重述本案的自带约束。** 它必须与 `S-0015` 的 **U-S1**（Memory Agent 有没有用户可及的配置面）成对出现。单独重述一条禁令而不指定替代，**正是 `eaf5a296` 已经做过一次的事，其结果就是本案 S-0015 出具的「四个 user-tunable 字段恒为编译期常量」**（E-0048 / E-0061）
  2. **请把「约束的表达介质更换」列为一个可验收的交付物，指名本 owner，并注明它 `零跨 owner 依赖`、`不改产品代码`、`与 (a)/(b)/(c) 正交`。** 本 owner 接。但它是一次代码变更，依宪法第二条须经裁定，**故本 owner 不自行执行，等裁定**
  3. **请把「约束的『recipe 节点』半边今天零强制」（U-A1）并入本案已知事实。** `E-0003` 与 `S-0002` 把 `workflow_list.test.js:121-144` 记为整条约束的强制点，**该记载对约束的一半不成立**
  4. **请把本条第一节的时序风险转达 `code-owner-settings`**：其 S-0015 请求 2 声明的 `displayName` 双默认值处置「不需要等本案任何裁定」—— 若被处置的是 **renderer 那一半**，本 owner 的 `:144` 当天静默失效。本 owner **不反对该处置**（E-0061 四已说明本 owner 不要那张卡片回来），只请求 **两件事绑在同一次变更里落**
- **评估结论**:

  **一 · 对本庭三项质询的逐条回答**

  | # | 质询 | 本 owner 结论 |
  |---|---|---|
  | 1 | U-5：约束会在 Q9 改名当天变成空断言 | **确认，并加重；同时更正其对测试内容的一处描述** |
  | 2 | `eaf5a296` 的历史是否准确 / 写入代码是哪一段 / 二者并置意味着什么 | **历史逐条准确，与本庭独立复核无出入；写入点已定位到行；并置的含义见第四节 —— 两个读法都真，但本庭给的是一个错形状的二选一** |
  | 3 | 另外三个含 `memory` 的文件 | **全部同名无关**（E-0062 二） |

  **二 · 质询 1 · U-5 确认，附一处更正与两处加重**

  **更正（使 U-5 更强，不是更弱）**：U-5 说「该测试仍 **只** 断言旧词缺席」。测试实际有 **六条** 断言，其中 `:147` `:148` 是对 Explorer `root` 与 `data` 键集的 **穷举 `toEqual`**，与显示词无关。若它们有效，U-5 就不成立。

  **但它们对历史形态无效**（E-0059 二，可复现）：历史卡片 **不进主 `Explorer` 的 data map**，而是自带第二个 `Explorer` 实例（源码注释原文 *"The system node lives in its OWN non-draggable Explorer instance"*），且该实例在 `recipe_list.js@0dc333dc:778`，主实例在 `:804` —— **渲染在前**。而 `:146` 取的是 `mockExplorerProps.at(-1)`，即 **最后一个**。把那张卡片原样放回去，`:147` 与 `:148` **照常通过**。

  > **一个有效性取决于 JSX 书写顺序的断言，不是守卫。**

  **加重一 · `:144` 匹配的字符串不在本 owner 边界内。** 历史节点的可见标签是 `memoryAgentSettings.displayName`（`recipe_list.js@0dc333dc:204/:225`），一个 **运行时值**。`:144` 之所以能匹配 `"Memory Agent"`，唯一原因是该值的默认值恒等于 `memory_agent_settings.js:24` 的常量 —— **`code-owner-settings` 的边界**。U-5 预测该守卫在 Q9 改名当天失效，**方向正确，但引信更短**：`S-0015` 请求 2 已声明 `displayName` 双默认值处置「不需要等本案任何裁定」。**若那一半是 renderer 的，守卫今天就可以失效，不经过本案、不经过本 owner、不产生一个红灯。**

  **加重二 · 只有 `:145` 的 `"System Agents"` 曾是本 owner 的字面量**（`recipe_list.js@0dc333dc:776`），是两条里较耐久的一条 —— 但它只拦复用同一分组标题的重新引入，换个标题即绕过。

  **三 · 本 owner 认为正确的约束表达方式（本庭直接问的）**

  病根一句话：**约束今天被表达成「屏幕上没有某个词」，而它要禁的是「代码里存在某个东西」。** 负向的字符串断言结构上无法越过一次改名 —— 这不是这条测试写得差，是这个介质选错了。

  正确的表达按价值排序三层，**三层都在本 owner 边界内，零跨 owner 依赖，且都不改产品代码**：

  - **L1（最高价值，最便宜，同时覆盖约束的两个半边）· 源码级负向断言，不是渲染断言。** 断言本 owner 的 **产品源码** 中不出现 Memory V2 标识符族（`memory_v2|memoryV2|memory_agent|memoryAgent|memory-agent` 一类），排除测试文件自身。今天该命题已为真且可由一条命令复现（E-0060(a)：全边界 3 行命中，全在测试文件内）。它 **免疫改名**（匹配的是标识符族不是显示串）、**免疫渲染顺序**、**免疫 mock**，并且在 **有人 `import memory_agent_settings` 的那一刻** 就红 —— 那才是约束真正要禁的动作，远早于任何东西到达屏幕。
    > **本仓已有同形先例，且已在本案台账上**：`use_chat_stream.runtime_event_batching.test.js:24` 的 `expect(source).not.toMatch(/runtime_events_v4/)`（本案 E-0006）—— 一条对 **源码文本** 的负向断言。本 owner 主张的是同一件事的同一种做法。
    > **诚实的限制**：它是 **词法绊线，不是证明**，可被换名或间接引用绕过。它拦得住重复一次 `0dc333dc`，拦不住一个刻意规避的人。

  - **L2 · 把结构断言改成与顺序无关。** 不取 `mockExplorerProps.at(-1)`，改为对该次渲染中 **全部** `Explorer` 实例的 `data` 键取并集后断言等于 recipe 集合。这直接堵上第二节那个洞，且与显示词无关，**完整越过 Q9**。

  - **L3 · 若仍要保留渲染断言，锚点换成身份，不要用显示名。** 该节点的身份是 `MEMORY_AGENT_SYSTEM_NODE_ID = "system:memory-agent"`（今日全仓零命中，E-0060(d)）。**Q9 在本案已被两名 owner 判为不动标识符**（`S-0007` 判识别符 / wire key / storage namespace / 错误码「不做」；`S-0015` 判 storage namespace「不做」，理由换成收益为零）。
    > **这是本 owner 对约束表达方式的核心主张：把约束表达在 Q9 已被裁定不会移动的那根轴（标识符）上，而不是表达在 Q9 明确要移动的那根轴（显示文案）上。** 这样它是 **构造上防改名** 的，不依赖任何人记得来改本 owner 的测试。

  **四 · 质询 2 · 历史准确性、写入代码、以及两件事并置的含义**

  **(1) 历史逐条准确，本 owner 在自己边界内独立复核，与本庭出具的数字无出入**（E-0061 一）：`eaf5a296` 在 `src/COMPONENTs/agents/` 内删 `memory_agent_system_panel.js`(−370) 与 `memory_agent_system_card.test.js`(−342)，改 `recipes_page.js`(−121)、`recipe_list.js`(−117)、`workflow_list.test.js`(+42)。`git show eaf5a296 -- .../workflow_list.test.js | grep "^+"` 证明 `:121` 那条测试与其六条断言 **全部为该 commit 新增**。**删掉卡片的提交与建立锁测试的提交确是同一个。** commit message 与内容不符一节，本 owner **只据 `--stat` 与 diff 推论，不据 message 推论**，与 E-0048(c) 同一处置，且 **不构成对任何人的指控**。

  **(2) 那张卡片写入 `memory_agent_v2` 的代码在本 owner 边界内，一处**（E-0061 二）：`memory_agent_system_panel.js@0dc333dc:126` 的 `updateMemoryAgentSettings(patch)`，由四个编辑控件调用 —— `:266` `displayName` · `:278` `additionalInstructions` · `:306` `provider` · `:315` `modelId`，**与 `memory_agent_config` 上行的四个字段一一对应**。即 `S-0015` / `E-0048` 所称「写入者是 Agent Builder 的 Memory Agent 系统卡片」在代码层面成立。**补一条二者未列的**：卡片的完整形态是「左树系统节点 + 右侧整个配置面板 + 一个 feature-flag 门」，共约 608 行，其中右侧面板由 `recipes_page.js@0dc333dc:207` 挂载。

  **(3) 两件事并置意味着什么 —— 本庭说不预设答案，本 owner 判：两个读法都真，但本庭给的二选一是错的形状。**

  - **「约束正确」为真，且本 owner 能给一条不依赖架构共识的独立理由。** Agent Builder 列表面的模型是「用户自建的 recipe，可拖拽、可分组、可改名、可删除、有右键菜单」。那张卡片 **每一条都不适用**，于是在 608 行里留下 **至少 7 处显式例外**：自带第二个 Explorer、`data-explorer-drag-disabled`、吞掉 `onContextMenu`、"deliberately no on_context_menu"、`SYS` 徽章加分隔线、两个文件里特判选中态（E-0061 四）。**一个需要逐条关掉宿主面全部交互模型的节点，就不属于那个面。** 故本 owner **明确表态：不请求撤销该约束，不请求把卡片放回来，且预先反对任何把 Memory Agent 配置面重新落到 Agent Builder 的方案。** 这不是让步，是本 owner 对自己那个面的判断。
  - **「约束锁死了一个还没有替代品的东西」也为真** —— `S-0015` / `E-0048` 已把后果证到底：四个被声明为 user-tunable 的字段每回合上行、取值恒为编译期常量。
  - **二者不冲突，因为它们说的不是同一件事。** 约束的 **内容** 正确（禁掉旧家），约束的 **形状** 有缺陷（禁令 + 无替代）。而这个形状 **已经失败过一次**：`eaf5a296` 就是「删掉 + 把职责记账给一个从未建成的面」。**议案现在提议把同一条禁令原样带进裁定，仍然不指定替代。若裁定单独重述它，就是在 case 尺度上重演 `eaf5a296`。**

  > **本 owner 的判决**：约束保留、原文不动、本 owner 的 charter 不改。**但裁定不得让它单独出现。** 一条禁令的正确配对物是一条归属指派，那条指派就是 `S-0015` 的 U-S1。**本 owner 支持 U-S1 进入待裁问题，并放弃对该配置面的任何主张权** —— 它不该在这里，本 owner 也不要它。

  **五 · 质询 3 · 另外三个文件全部同名无关**（E-0062 二）

  `recipe_migration.js:47` 的 `memory: legacy_agent?.memory` 是 legacy character 的 `agent.memory` 在「旧 character → recipe 图」迁移时的原样透传 · `recipe_roundtrip.test.js:47` 的 `memory_policy: "ephemeral"` 是 **subagent 会话记忆策略**（后端 `recipe.py:68` 的 `Literal["ephemeral","scoped_persistent"]`，参考）· `inspectors/toolkit_inspector.test.js` 的 `mcp.memory.memory` / `"Memory"` 是 **一个名为 Memory 的 MCP server** 在工具目录 fixture 里的条目（工具目录数据不归本 owner，归 `knowledge-owner-mcp-store`，本 owner 只消费引用）。**三者与 Memory V2 / Curator / `memory_agent_v2` 均无关系。**

  **净结论：本 owner 边界与本案的全部接触面，是一个测试文件里的六条断言。** 本 owner 的 **产品代码** 对 Memory V2 零引用（E-0060(a)：全边界命中 3 行，全在该测试内）。

- **边界命中依据**: `pupu:src/COMPONENTs/agents/**` · `pupu:src/SERVICEs/agent_folder_storage.js`。本案在本 owner 边界内的 **唯一** 命中对象是 `src/COMPONENTs/agents/pages/recipes_page/workflow_list.test.js:121-149`（依 [A-008](../../../codex/adaptations.md#a-008--co-located-测试随源文件归属) 随 `recipes_page.js` 归本 owner）。取证另落在 `pages/recipes_page/recipe_list.js:373-508/:511/:687-698`（今日 Explorer 数据推导，证明无硬编码系统项）· `pages/recipes_page/nodes/`（6 文件）· `pages/recipes_page/recipe_migration.js:47` · `recipe_roundtrip.test.js:47` · `inspectors/toolkit_inspector.test.js`；历史取证落在 `recipe_list.js@0dc333dc:197-252/:754-812` · `recipes_page.js@0dc333dc:13/:56-64/:84/:107/:181/:207/:254/:261` · `memory_agent_system_panel.js@0dc333dc:7-10/:83/:89/:126/:266/:278/:306/:315`。`src/SERVICEs/agent_folder_storage.js` **负向核对：零命中**。

  **边界更正 —— 确认 S-0002 自愈信号 3 的分类与处方，不反驳，不修改本 owner 的边界声明。** 本 charter 是路径 glob，议案给的是概念名（「Builder 卡片」「recipe 节点」），路径匹配器结构上不可能命中概念名；本庭建议 `codex` 考虑第三桶「议案写窄」，本 owner **同意该方向**，并补两条实测供其判断：

  1. **本案的正确抽取路径今天存在，而且很短。** 议案概念名「Builder 卡片 / recipe 节点」→ 若立案环节对概念名做一次全仓 grep（如 `grep -rn "Builder\|recipe" --include="*.js" -l`，或直接搜议案里出现的产物词），`workflow_list.test.js` 会命中。**缺的不是能力，是「概念名也要落到文件」这一步。** 这与 `S-0015` 边界更正段指出的同类缺陷（`settings_repository.js` / `feature_flags.js` 因议案只写概念名「durable localStorage namespace」「发布配置」而未被抽到）**是同一个缺陷**，故它 **不止影响本 owner 一人** —— 已有两名 owner 的实测证据。
  2. **但第三桶解决不了本案暴露的更深一层。** 本 owner 之所以被议案约束绑住，不是因为本边界有 Memory V2 代码（**一行都没有**，E-0060），而是因为 **一条测试恰好落在本边界内**。**一条约束的强制点落在谁那里，与该约束的受益者是谁，可以完全无关。** 现行传唤机制只能沿「路径 → owner」找到强制点持有者，找不到「这条约束真正在保护谁」。本案里，受益者是 `code-owner-settings`（U-S1）与产品本身，而持有人是本 owner —— **持有人今天没有任何动机、也没有任何信号去维护它**（E-0060 实测 20 绿）。**这一条本 owner 不裁，只归档，交 `codex`。**

- **受影响对象**:

  | 编号 | 落位 | 本 owner 的对象 |
  |---|---|---|
  | **Q1** | **不落在我这里** | 无。本 owner 不产帧、不投影、不渲染 trace |
  | **Q1-前段** | **不落在我这里** | 无。本 owner 不产、不驱动、不消费流 |
  | **Q9** | **部分落在我这里 —— 但落的不是命名债务，是约束的强制点** | Q9 逐字点名的三个对象（`memory_agent_settings.js` / `memory_v2_unchain_agent_factory.py` / "Memory Agent" 文案）**全部不在本边界内**；本 owner 的产品代码对它们 **零引用**（E-0060）。落在本 owner 的只有「清理不得重新引入 Builder 卡片或 recipe 节点」这条自带约束的强制点 `workflow_list.test.js:121-149` |
  | **Q10** | **不落在我这里** | 零命中。待删四文件全在 `unchain_runtime/**`，`pupu_legacy` 在本边界内零引用（E-0060(a)） |

  **需在本 owner 边界内改动的（唯一一项）**：约束表达介质更换（L1 + L2 + L3，第三节）。**零跨 owner 依赖、不改产品代码、与 (a)/(b)/(c) 正交、可立即执行，但须先有裁定。**

- **约束**:
  1. **「跑一遍 agents 测试全绿」不是约束仍然有效的证据 —— 本 owner 与 `code-owner-chat-bubble`（S-0006 约束 3）、`code-owner-settings`（S-0015 约束 4）作 **第三份同向证词**。** 本轮实跑 `3 suites / 20 tests` 全绿（E-0060(e)），而 E-0059 与 E-0062 证明这 20 条对约束的两个半边分别是「依赖另一名 owner 的默认值常量」与「结构上完全看不见」。**任何以本 owner 测试全绿作为「约束未被违反」证据的方案，本 owner 预先反对。**
  2. **裁定不得单独重述本案自带约束。** 必须与 U-S1 成对。理由见第四节 (3)：这个形状已经失败过一次，其失败产物就是本案 S-0015 手上那个模块。
  3. **任何把 Memory Agent 配置面落回 Agent Builder 的方案，本 owner 预先反对**，据 E-0061 四的 7 处例外。**这条是本 owner 主动放弃地盘，不是防守。**
  4. **`flow_editor` 不归本 owner。** 它在 `src/BUILTIN_COMPONENTs/flow_editor/`，owner 是 `code-owner-ui-primitives`；本 owner 只在 `recipe_canvas.js:2` **使用** 它（实测另有 `CONTAINERs/config` 与 `PAGEs/demo` 两个消费者）。**若任何方案要新增一类 recipe 节点，须先判定它是否触及 `flow_editor` 本体；若触及，`code-owner-ui-primitives` 须单独传唤 —— 本 owner 不代答，也不代改。**
  5. **本轮只读，未改任何产品代码，未 commit，未派生子 instance。** 写入见不确定性 8

- **建议处置**:

  **一 · 核心问题：(c)，但这是一张窄票，且本 owner 说清它什么条件下翻转**

  **先把诚实的部分放前面：本 owner 的边界不强制任何一个选项。** Q1、Q1-前段、Q10 都不落在本 owner；Q9 落在本 owner 的只有约束的强制点，而那一项 **在三个选项下都要做同一件事**。若只按「我的边界受什么影响」回答，诚实的答案是「三个一样」。**所以本 owner 的选择必须靠一条独立理由撑住 —— 它有一条，且与已出庭五位都不同：**

  > **(c)，因为 (a)/(b) 的三分法里 **没有位置** 放本案唯一那条自带约束的续命，而它正在过期。**
  >
  > (a) 是「先定词汇 → 再删」，(b) 是「先删 → 再定词汇」。**两者都只排序 Q1 与 Q10 这两件事。** 而本 owner 手上那条约束既不是词汇也不是删除 —— 它是一条 **禁令**，它的强制点会在 Q9 的显示名变更当天静默失效（第二节），而那次变更已被 `S-0015` 声明为「不需要等本案任何裁定」。**(a) 与 (b) 都不产生一个容器来装它。** 只有 (c) 的「同一份方案」在结构上能容纳第三个条目。
  >
  > 这与 `S-0015` 选 (c) 的理由相邻但不同：它说的是 **U-S1（配置面没归属）** 这个共用前置；本 owner 说的是 **这条禁令本身的耐久性** —— 前者问「谁来建那个面」，后者问「在那个面建成之前，禁止它建错地方的那条线还在不在」。**今天的答案是：那条线在，但它挂在另一名 owner 的一个常量上，而那名 owner 不知道它挂在那里。**

  **逐项表态**：

  - **(a) 反对，理由窄且明确。** 本 owner **不反对** `code-owner-chat-bubble` 对 (a) 的实体论证（删掉四个文件渲染端一个词都不失效），也无从复核；`S-0013` 对自身成立条件的核对同样不在本 owner 判断范围。**本 owner 反对 (a) 只因为一件事**：(a) 把「定词汇」排在最前，而定词汇的下游就是改显示文案（`S-0015` 已把 i18n 定为 Q1 的下游），**即 (a) 是三个选项里让本 owner 那条守卫 **最早** 失效的那个**，而 (a) 本身不含任何修补它的步骤。**这条反对是可以被消除的**，见下。
  - **(b) 反对，且本 owner 要主动交代一条对 (b) 有利、但本 owner 拒绝采信的理由。** 单从本 owner 的窄视角看，(b)（先删、后改词）会让守卫 **保持有效最久**。**本 owner 明确拒绝把这当作理由** —— 「我的测试能多绿几天」不是产品排序论据。而 `S-0006`（先删就是先把样本删掉再去设计怎么呈现样本）与 `S-0007`（删完 memory-agent 轴归零，在空态上删掉最后一个非空来源）给的是实体理由，本 owner 无从复核但 **不反对**。**故 (b) 反对。**
  - **(c) 采纳，并附翻转条件。** 本 owner 同意 `S-0013` / `S-0015` 把措辞从「同时落」改成「**三段有序，第一段是一个交付物不是一次讨论**」，并请求在其中加入第四个条目（下表）。
    > **翻转条件（请写进裁定的强制回应清单）**：**若裁定采纳 (a)，但同时把 U-S1 与「约束表达介质更换」两项写成有 owner、有验收标准的显式条目，本 owner 对 (a) 的反对即告消失，且在 (a) 与 (c) 之间无偏好。** 本 owner 争的不是顺序，是 **有没有一个容器**。若 (a) 能提供容器，(a) 就够了。

  **二 · 逐问建议处置**

  | 问 | 建议 |
  |---|---|
  | **Q1** | **不落在我这里。** 唯一请求：与 `S-0015` 同 —— 裁 Q1 之前先答 U-S1。本 owner 补一条它没有的支撑：U-S1 的旧答案曾经存在于本 owner 边界内并被删除，删除动作留下的唯一遗产就是本案的自带约束（E-0061）。**换言之，U-S1 不是一个新问题，是一个 2026-08-04 被记账、至今未偿的旧问题** |
  | **Q1-前段** | **不落在我这里** |
  | **Q9** | **命名债务本身不落在我这里**（三个逐字点名的对象在本边界内零引用，E-0060）。**落在我这里的是它自带的那条约束，且本 owner 判：约束保留、原文不动、强制介质更换。** 具体三层见评估结论第三节。**并请裁定把「Q9 的显示名变更」与「本 owner 的守卫更新」绑在同一次变更里落** —— 今天它们分属两名 owner、无任何机械关联、且先动的那一半不会让后一半变红 |
  | **Q10** | **不落在我这里**（零命中）。无证词可出 |

  **三 · 本 owner 看到、而 `case.md` 与 `FRAMING` 未列出的未决项（U-A1 … U-A5）**

  - **U-A1 · 约束的「recipe 节点」半边今天零强制。** 本轮最重要的新事实。`workflow_list.test.js:80-84` 把 `recipe_canvas` mock 成一个只渲染名字的桩、`:86-90` 把 `detail_panel` mock 成 `null`；本 owner 边界内 **不存在对节点类型集合的穷举断言**（`grep -rn "toEqual(\[" ` 全覆盖，E-0062 一）。**往 `nodes/` 里加一个 Memory V2 节点类型、接进 `recipe_graph.js` 与 `recipe_connection_rules.js`、在 `detail_panel/` 给它一个检查器 —— 六条断言没有一条会红。** `E-0003` 与 `S-0002` 把 `workflow_list.test.js:121-144` 记为整条约束的强制点，**该记载对约束的一半不成立**。（补：那张历史卡片 **从来不是 recipe 节点**，故这一半 **历史上从未被违反，也从未被守卫** —— 是一条无绊线的前瞻性禁令）
  - **U-A2 · 约束唯一的活强制点，其匹配串的定义权在另一名 owner 手里，且该 owner 已声明会在无裁定前提下改动它。** `:144` 匹配 `"Memory Agent"` 依赖 `memory_agent_settings.js:24` 的默认值（E-0059 三），而 `S-0015` 请求 2 写明该处置「不需要等本案任何裁定」。**这构成一条本案范围内、可在任意时刻发生、无红灯、无 case 的约束失效路径。**
  - **U-A3 · 结构断言被渲染顺序击穿。** `:147-148` 取 `mockExplorerProps.at(-1)`；历史形态的系统 Explorer 渲染在主 Explorer **之前**，故取不到（E-0059 二）。**这不只是本案的问题 —— 它是一个「穷举断言看起来强、实际取样只覆盖最后一个实例」的通用陷阱**，本 owner 边界内是否还有同形断言，本轮未穷举
  - **U-A4 · 「禁令 + 无替代」这个形状已经失败过一次，议案提议原样再来一次。** `eaf5a296` = 删除 + 把职责记账给「a future settings surface」；结果是 S-0015 手上那个「有读者、无写者、测试全绿」的模块。**裁定若单独重述约束而不裁 U-S1，就是第二次。** 本 owner 请求这一条进强制回应清单
  - **U-A5 · `workflow_list.test.js:124` 的 feature-flag 前置是空转。** `enable_memory_v2` 在本 owner **产品代码中零引用**（E-0060(b)），被测面无以该 flag 为条件的分支，故该测试在 flag 为 `false` 或整行删掉时行为完全相同。测试标题的 "when enabled" 描述了一个 **今天无法被触发的条件**（历史上它曾是真条件，随卡片一并删除，E-0061 三）。**今天不产生错误结论**（正确行为本就是无条件缺席），**但它会让未来的读者高估这条测试的覆盖面** —— 本案已经高估了一次

  **四 · 越界内容清单（标注为参考，不计入本 owner 结论）**

  `memory_agent_settings.js:24` 的 `DEFAULT_MEMORY_AGENT_DISPLAY_NAME` 变更时序 → `code-owner-settings`（本 owner 只请求与守卫更新同批落，不主张其内容）· `memory_agent_config` 四字段是否应从 wire 上摘掉 → `code-owner-settings` 与 `code-owner-chat-core` · `override.memory` 在后端 recipe schema 中的语义 → `code-owner-runtime` · `subagent_profile.memory_policy` 的取值语义 → `code-owner-runtime` 与 `expert-llm` · `mcp.memory.memory` 这条目录条目 → `knowledge-owner-mcp-store` · `flow_editor` 本体的任何改动 → `code-owner-ui-primitives` · Memory Agent 配置面若最终落在 Settings，其形态与凭据链路 → `code-owner-settings` 与 `expert-security` · A-010 是否需要第三桶「议案写窄」，以及「约束强制点持有人 ≠ 受益人」这一类 → `codex`

  **五 · 指名承接（不在本案）**

  无。本 owner 边界与 `0000-0003-2026-0807` / `0000-0004-2026-0807` 的议题均无接触面。

#### S-0018 | ANSWER | code-owner-runtime → E-0045
- **阶段**: 议案庭审
- **结论**: **E-0045 的事实描述准确，本端逐条复核成立，并把它两条自陈限制闭合、方向对它有利；仅其「归属表述」需一处更正（`:9471` 是 recipe graph 专属路径，不是普通对话回合的产出者，普通路径的产出者是另一个对象）。据此本端 **改述** S-0007 的 U-R1：不是「缺产出者」，是「回执已 typed 存在于进程内存、缺的是把它送出去的投影」—— 从新建降级为接线。**并且本端改变核心问题的选择：由 (c) 改为 (a)**，因为 (c) 唯一的承重论证就是 U-R1 是粘住 Q1 与 Q10 的那块料，而本轮证明 U-R1 既不在删除清单内也不依赖词汇规格，**粘合剂本身不存在**。**S-0007 约束 4 完整存活**（措辞改述），删除仍须在投影之后
- **依据**: E-0063 · E-0064 · E-0065 · E-0066（四条均由本人在 `pupu:unchain_runtime/**` 内取证）；被质询的 E-0045（经 S-0014）；本端前轮 E-0016 · E-0017 · E-0018 · E-0019；本案 E-0002（`unchain_runtime/` 自 `14ca3ccc` 零变更，全部行号锚点有效）· E-0024（本庭代跑，本端接受，见第五节）；S-0007 · S-0010 · S-0014
- **不确定性**:
  1. **全部为静态分析。未起 sidecar、未跑一次真实回合、未抓一次 SSE。** 三件事因此未证：(i) `process_after_enqueue` 在真实回合中是否被执行过；(ii) `_memory_v2_merge_diagnostics` 被调用的时点 `last_receipt` 是否已被写入（**时序未验，是投影方案落地前必须实测的一项**）；(iii) `graph_completion_authorized` 在真实配置下的取值
  2. **`PupuMemoryAgentWorkerModule` 实例的生命周期未核实**（每回合新建 vs 跨回合复用）。这决定 `_last_receipt` 的 last-write-wins 覆盖风险是否真实存在（E-0065 限制 2）
  3. **零消费者判定仍是 grep**，覆盖字面量与 `getattr` 字符串，**未覆盖** `vars()` / `__dict__` / 反射 —— 与 E-0045 同一限制，本端不改善
  4. **本端不裁收端。** 白名单怎么改、投影哪些字段进 `TOP_LEVEL_KEYS`、持久化后果 —— 属 `code-owner-shared-arteries`；「穿三层公开属性去读另一模块内部状态」是不是可接受的接缝形状 —— 属 `expert-architecture`。本端只出产端事实与产端约束
  5. S-0007 原「若 active 平面经 **未搜到的第五条路径** 产遥测，该结论要打折」这一自陈条件 —— **本端确认已触发**，且触发方式比预想的更彻底：有两条路径，都不写 diagnostics，所以四 token 负向 grep 搜不到它们
- **请求/下一步**:
  1. **请把 U-R1 在裁定材料中按本条第二节改述后的形状登记**，并把它 **单列为一个不依赖任何其他问的独立切片**（产端属本端，收端属 `code-owner-shared-arteries`）。不要再以「缺一个交付物」的形态进入裁定正文
  2. **请把 S-0007 约束 4 按第四节的改述保留进裁定**。E-0045 完全没有触及它 —— 它约束的是删除时序，不是产出者的存在与否
  3. **请把 E-0064 列为该缺陷的规范表述**：同一函数、同一谓词的两个极性上，legacy 支接了线、active 支没接。本案此前把它归入「第五个产出即丢弃」，**归错类了** —— 前四个是收端丢键，这一个是产端分叉时漏了一支
  4. **本端撤回 S-0007 选 (c) 的整段论证**（见第三节），改选 (a)。请勿把 U-R1 作为 (c) 的理由写进裁定正文 —— 这一点与 S-0014 请求 1 的结论一致，但本端是从产端事实独立得出的
- **问题编号**: E-0045（经 S-0014 提交）
- **回答状态**: ANSWERED

---

### 一 · E-0045 准不准确：准确；本端复核逐条成立，并把它的两条自陈限制闭合

**逐条复核结果（全部成立）**：

| E-0045 的主张 | 复核 |
|---|---|
| `PupuMemoryAgentWorkerReceipt` 是 typed frozen dataclass，docstring "Typed worker outcome containing identifiers and status only."，13 个字段 | **成立，逐字段核对无误**（`memory_v2_unchain_worker.py:103-119`） |
| `_record_receipt` 有四个已算好的稳定失败码 | **成立**（`:400-415`） |
| `last_receipt` / `last_failure_code` 两个 `RLock` 保护的公开 property | **成立**（`:387-398`） |
| `PupuUnchainGraphRootMemoryReceipt` 自陈 content-free | **成立**（`memory_v2_unchain_graph_root_completion.py:54-65`，docstring `:56`） |
| `grep -n '"graph_root_completion"' unchain_adapter.py` 只有一行 | **成立**（全文件仅 `:9467` import + `:9471` 写入两行） |
| `last_receipt` / `last_failure_code` 全仓零非测试消费者 | **成立**（非测试命中 8 行全在定义文件内，其余 14 行全在 `tests/`） |

**并且本端把 E-0045 的两条自陈限制闭合，两条都对它有利**：

- **其限制 #3（「未核实 `output_holder` 是否被整体传出该文件后由他处按键读取」）—— 闭合。** `output_holder` 是 `_stream_recipe_graph_events` 的函数局部字典（`unchain_adapter.py:8631`），`return output_holder` / `**output_holder` / `emit(output_holder)` 全为 0 行，且函数内 16 处 `output_holder` 读取无一读该键。**故 `:9471` 不是「本文件零读取」，是一次 dead store** —— 写进一个随函数返回即被回收的局部字典。**比 E-0045 主张的更强**（E-0063）
- **其限制 #1 的后半（「`:755` 的挂载条件未追」）—— 闭合。** `modules_for_active()`（`memory_v2_unchain_runtime_factory.py:722`）在 `if self.memory_agent_enabled:` 下 `modules.extend((self.memory_module, self.memory_worker_module))`，而 `unchain_adapter.py:7546` **无条件传 `memory_agent_enabled=True`**。**active 配置下该模块恒挂载**（E-0065）。其限制 #1 的前半（运行时是否真被执行）**仍未闭合，本端也未闭合**

**唯一需要更正的是归属表述，不是事实**：E-0045 把 `unchain_adapter.py:9471` 表述为「active 面 memory-agent 遥测」的丢弃点。**`:9471` 落在 `_stream_recipe_graph_events`（8156–9663）体内，是 recipe graph 路径专属**；普通对话回合走 `stream_chat_events`（9819–10454），**永不到达该行**（`graph_checkpoint_host` 非 graph 回合恒为 None）。普通路径的产出者是 **另一个对象** —— `PupuMemoryAgentWorkerModule._last_receipt`，它 **从不到达 `unchain_adapter.py`，也从不被写进任何字典**（E-0063 / E-0065）。

**这处更正不削弱 E-0045，反而扩大它**：产出者不是一个，是两个；两个都零消费者；两个的丢弃方式还不一样。

### 二 · U-R1 改述（本端接受改述，不撤回该项）

**S-0007 的下列表述失效**（协议禁止原地改写，此处标明替代表述）：

| S-0007 位置 | 失效表述 | 替代表述 |
|---|---|---|
| U-R1（`record.md:419`） | 「active 平面 **缺** memory-agent 遥测产出点……是唯一能让 (c) 落地的 **交付物**」 | 「active 平面的 memory-agent 结局 **已以 typed、构造时校验、自陈 content-free 的形式存在于进程内存中**（两个对象，见 E-0063 / E-0065）；**缺的是把它送出去的投影**。U-R1 是一个 **接线切片**，不是新建交付物」 |
| §Q1（`record.md:353`） | 「分层的下面那一层，在发布配置里今天是空的」 | 「下层 **有 typed 数据，没有出口**。先定分层不会定成一张空表 —— 上游枚举已经把表填好了（S-0014 的 E-0044，本端不复核其 unchain 侧取证）」 |
| 结论段（`record.md:327`） | 「删完之后这条轴 **没有产出者了**，规格无处可挂」 | 「删完之后这条轴 **今天唯一有出口的那一支没了**；另一支有产出者、无出口。规格挂得住，**但用户可见的那条轴会归零**（约束 4 因此存活）」 |

**为什么这是「接线」而不是「新建」—— 本端给出 E-0045 没给的可行性依据**：引用路径存在且全程公开属性 —— `active_context_bridge.preparation.host_factory.memory_worker_module.last_receipt`，而 adapter 已在 5 个点持有该 bridge（`persist_host_event`），落点 `_memory_v2_merge_diagnostics(**values)` 收任意 kwarg（E-0066）。

**但「接线」的成本不是零，本端限定其边界**：今天 adapter 对 `memory_worker` 的引用数是 **0**，bridge 也不曾为此暴露过 accessor。真实成本 = **一处产端读取 + 一个 diagnostics kwarg + 收端白名单一项 + 一条双向对账测试**（后两项不属本端）。仍然 **远小于** S-0007 原本主张的量级。

**并附一条 E-0045 的「接线」定性没有涵盖的设计约束**：worker 回执是 **易失的 last-write-wins 内存状态**，不是落盘记录 —— `_record_receipt` 覆盖前值，`_record_failure` 把它置回 `None`，且 hook 在 run 非 `completed` 时 **静默早退不留痕**（`memory_v2_unchain_worker.py:490-491`）。**读取必须在该模块实例生命周期内、且在下一次 run 覆盖之前发生。** 这是投影方案要处理的约束，不是投影不可行的理由。

### 三 · 核心问题：**改变，(c) → (a)**

**S-0007 的 (c) 只有一条承重论证**：U-R1 同时是 Q1 的前置和 Q10 的前置，**「正是这一点让两问必须同案」**（`record.md:419`）。

**本轮证明这块粘合剂不存在**：U-R1 的产端在 `memory_v2_unchain_worker.py` + active bridge（**都不在 Q10 删除清单内**），收端在 presenter（**也不在清单内**），且它 **不需要词汇规格先落地就能做**（投影 typed 字段，字段名与取值来自上游枚举）。**U-R1 是一个谁都不粘的独立切片。** 粘合剂消失，(c) 的强制性随之消失 —— 本端 **撤回 S-0007「建议处置」核心问题段（`record.md:396-404`）的整段论证**，含其排除 (a) 的那一条：该条写「今天能观察到的这套词汇只在正在死去的那条平面上产生」，**这句在 active 面有 typed 枚举可采纳的前提下不成立**。

**为什么落到 (a) 而不是「都不选」**：S-0014 的可证伪性论证在本端边界内的那一半，本端确认成立 —— 改 fail-closed 之后，**产端残留的、不属于上游枚举的字符串会立刻以显式未知态暴露**，这给 Q10 的删除提供一个 **今天不存在** 的验收信号（删除前后 trace 上不该再出现未知态）。先删则永远拿不到这个信号。这条论证的产端事实（哪些字符串由哪个产点产出）是本端的，本端背书。

**本端的 (a) 与 S-0014 的 (a) 在一处不同**：本端的 (a) **附一道删除门**（下节）。S-0014 把删除的前置收敛到「存量 store 处置 + `memory_propose` 参数 schema 比对」两项，**没有列投影**。本端认为投影也是删除前置 —— 理由不是耦合，是用户可见能力不得净减少。

### 四 · S-0007 约束 4：**完整存活，仅措辞改述**

E-0045 **完全没有触及这一条**。它约束的是 **删除时序**，不是产出者的存在与否：

> **改述后**：删除 `memory_v2_curator.py` 之前，active 平面必须先有一条 **把已存在的 typed 回执送到 trace 的投影**（原文作「必须先有一个 memory-agent 遥测产出者」）。否则删除动作本身就是一次 **用户可见能力的净减少**，而不是清理。

**理由在改述后反而更硬**，由 E-0064 直接支撑：在 `_stream_recipe_graph_events` 的同一个谓词上，**legacy 支（`graph_active_bridge is None`）的整理结局经 diagnostics 抵达 UI，active 支（`is not None`）的结局被 dead store**。删掉 legacy 支 = 删掉 **今天唯一有出口的那一支**。今天 active 面 trace 的 `agentRuns.length` 基线为 0（S-0014 引 E-0034 / E-0039），删除会把「只有 legacy 有」变成「谁都没有」—— **这一条 S-0007 已经说过，E-0045 没有推翻它，本端维持。**

S-0007 其余三条新增约束（1 平面标注 · 2 不得单方面加顶层键 · 3 `Isolated` 同词异义）**均不依赖 U-R1，全部维持**。其中约束 2 在改述后 **直接命中本切片** —— 投影 worker 回执正是一次新增顶层键的动作。

### 五 · 对 S-0010 / E-0024 的表态（本端不反驳，接受）

两项均接受，且两项都 **加强** 本端立场，不削弱：

1. **`pupu_legacy` store 隔离改名无任何代码路径、是人手做的** —— 本端提的「存量处置」前置由「建议」升格为已证实的必要条件。**接受，并入删除门**
2. **1,387,400 行 `operations` 全部是 `memory_v2_deletion:` 前缀、curator 操作零条** —— 本端 S-0007 那句「那是一百多万次没成功的整理」的推断 **不成立，本端撤回**。该推断本端已自标须验证，本庭代跑证否，**结论以 E-0024 为准**。撤回它不影响本端任何其他结论（它未被任何一条论证引用）

### 六 · 程序披露

未派生任何子 instance；全程 Read / Grep / Bash 只读；**未改任何产品代码，未 commit**。取证范围严格限于 `unchain_adapter.py:9471` 上下文、E-0045 指向的四个文件（`memory_v2_unchain_worker.py` · `memory_v2_unchain_graph_root_completion.py` · `memory_v2_unchain_runtime_factory.py` · `memory_v2_unchain_active_bridge.py`），未做全仓勘察。写入仅本案 `.inbox/` 下 `S-0018.md` 与 `E-0063`…`E-0066.md`。

#### S-0019 | ANSWER | code-owner-chat-core → S-0018
- **阶段**: 议案庭审
- **结论**: **本端的「无法验收」论证不依赖「缺产出者」，它依赖的是「wire 上没有真值到达可观察端」—— 这个前提今天一个字都没有失效，E-0064 反而把它说得更锋利（同一分叉，legacy 接了线，active 没接）。所以「接线之后也一样验收不了」这个答案，本端核实后 **不成立**：接线之后验收是可得的，而且落在本端这一侧、本端零改动。但本端 **改票，(c) → (a)** —— 理由不是新事实让验收变容易了，是新事实 **切断了本端自己那条粘合剂**：本端的 (c) 建立在「唯一能端到端跑通的真值来自即将被删的 legacy 产出者」，而 E-0065/E-0066 证明 active 面另有一条 **完全不在 Q10 删除清单内** 的验收基座。共同前置（投影）同时是 Q1 验收与 Q10 安全的前置，**但共同前置是扇出，不是纠缠 —— A 依赖 C、B 依赖 C，不构成 A 与 B 必须同案**。**(a) 采纳，附一条硬条件：Q1 自己的验收前置必须写明「投影已落地 + 一个真值在运行中的应用里被人眼看过一次 + 该值携带本回合标识」，否则 (a) 就是把一份验收不了的规格提前写出来，那正是本端 S-0012 反对 (a) 的理由，而那条理由至今有效。** 第 4 点（quorum）：**本案 quorum 在这条路上完整，可以闭庭** —— 投影路径全程不触及 `unchain:` 仓（E-0076，三点实测）。**但 U-R1 上的「第 0 段 形态裁定必须前置」这一条本端撤回**，它从阻塞前置降为非阻塞产品项
- **依据**: S-0018 · E-0063 · E-0064 · E-0065 · E-0066（`code-owner-runtime` 取证，本端在其结论方向上不越界复核，只复核与本端边界相接的那一段）；E-0045（`expert-llm`，经 S-0014）；本端前轮 E-0026 · E-0027 · E-0028 · E-0031 · E-0032；本轮新证 **E-0075**（`bundle` 通道上的第四道门，改写门）· **E-0076**（投影路径零 unchain，quorum 判据）
- **不确定性**:
  1. **本端仍未起一次真实回合。** 本轮全部为静态取证与正则重放。「接线之后验收是可得的」这句 **是可达性判断，不是实测** —— 它依赖 E-0066 限制 1 那条未验的时序（`_memory_v2_merge_diagnostics` 被调用时 `last_receipt` 是否已写入）。**若时序不成立，本端的 (a) 硬条件将无法被满足，届时 (a) 与 (c) 的差别会重新变得重要**
  2. **本端对 `unchain_runtime/**` 的一切读取均为越界。** E-0063…E-0066 的产端事实本端 **接受但不背书**；本端只背书 E-0076 的第 (3) 点（`use_chat_stream.js:7538-7565` 零改动）与 E-0075 的正则重放
  3. **E-0075 有一项写「未核实」**：`secret_scrub_registry` 在运行期注册的真实密钥值集本端完全没查。若该值集与遥测取值有重合，改写面比本端测出的更大
  4. **本端不裁收端。** presenter `TOP_LEVEL_KEYS` 加哪些键、持久化后果 → `code-owner-shared-arteries`；「穿三层公开属性读另一模块内部状态」是不是可接受的接缝 → `expert-architecture`。本端只出「到了 `message.meta.bundle` 之后本端零改动」这一件事
  5. **改票的自陈条件**：本端 (c) 的撤回 **只针对「Q1 与 Q10 必须同案」这一条强制性**。若本庭认定「共同前置即构成同案理由」（本端认为不构成，理由见第二节），那本端的改票就应被打折回 (c)
- **请求/下一步**:
  1. **请在裁定正文中删除「一份没有产出者的词汇规格无法被验收」这句归给本端的表述**，替代表述见第四节表格第 1 行。**产出者存在，缺的是出口** —— 本端接受 S-0018 的改述，且本端的论证在改述后仍然成立
  2. **请把本端 (a) 的硬条件原文写进裁定**（第二节末），与 `code-owner-chat-bubble` 在 S-0011 给 (a) 附的那条硬条件 **并列**。两条条件互不覆盖：它的条件管「规格写在哪个产点之上」，本端的条件管「规格凭什么算验收通过」
  3. **请把 U-C4 登记为「休眠，触发条件保留」而不是撤回**（第三节）。休眠条件是可机械检查的一句话：**只要裁定正文出现「新增 runtime event 类型」或「改 `unchain:src/unchain/events/{types,normalizer}.py`」，quorum 立刻不完整，第三层门禁须重判 `code-owner-unchain` 的必到资格。** 只要裁定把投影限定在 diagnostics/bundle 通道上、或对形态保持沉默，**quorum 完整，可以闭庭**
  4. **请把 E-0075 列为门计数的更正**：本案至今数的是「三道白名单」，实际是 **四道，且第四道不同类** —— 前三道丢键（缺失），第四道原地改写值（在场但不对）。**这一条直接约束 Q1「固化 `reason` 取值集」的写法**
  5. **本端撤回 S-0012「建议处置」第一节中「(a) 反对」与「(c) 采纳」两条，及第二节「形态裁定必须排在补产出者之前」的强制性。** 逐条替代表述见第四节，请按该表在闭庭产出中标注
- **问题编号**: S-0018
- **回答状态**: ANSWERED

---

### 一 · 本端的「无法验收」论证依赖的是什么 —— 不是「缺产出者」

**本庭问的是：那条论证是否只在「缺产出者」时成立。逐字回到 S-0012 原文（`record.md`，本端 建议处置 一）**：

> **这条链路上有 三道白名单 + 两道静默丢弃门，而唯一的诊断出口零消费者。**……**在这样的拓扑里，唯一可靠的验收方式是「一个真值端到端走完、有人眼看见」。**

**这段话的承重前提是拓扑，不是产出者。** 它说的是：**这条 wire 上每一道门都静默失败，所以除了让一个真值走完全程并被人看见，没有别的手段能证明规格被正确实现了。** 产出者存在与否，不改变任何一道门的行为。

**新事实对这个前提的作用是加强，不是削弱**：

| | S-0012 时本端以为的 | E-0063/E-0064/E-0065 证明的 | 对本端前提的作用 |
|---|---|---|---|
| active 面有没有 typed 数据 | 没有 | **有**（两个对象，均 typed、自陈 content-free） | 中性 —— 本端前提不谈这个 |
| active 面有没有真值到达可观察端 | 没有 | **仍然没有**（一个 dead store，一个压根没有写出动作） | **不变** |
| 为什么没有 | 「这条平面还没做遥测」 | **同一函数、同一谓词的两个极性上，legacy 接了线，active 没接**（E-0064） | **更锋利** |

**所以本庭给的那个可能答案（「接线也一样验收不了」）——本端核实后判定它 半对半错，必须拆开说**：

- **「今天一样验收不了」——对。** 而且原因和从前一模一样：active 面零真值到达。接线本身不产生验收信号，**接完线才产生**。
- **「接线之后仍然验收不了」——本端核实后不成立。** E-0076 把落点到 renderer 这一段查完了：`memory_v2` 已在 `route_chat.py:60-74` 的 13 键 allowlist 内、已在 `done` 信封上、已经落进 `use_chat_stream.js:7538-7565` 的 `message.meta.bundle`。**Electron 零改动（E-0028 信封级透传）、chat-core 零改动、unchain 零改动。** 收端只剩 presenter 白名单一处。**验收面存在且短，本端这一侧不构成任何阻碍。**

**但本端要补一条本庭没问、而接线特有的验收风险 —— 它和本端今天新查到的第四道门是同一个失败形状**：

E-0065 记了两件事：`_last_receipt` 是 **last-write-wins 的易失内存值**；hook 在 run 非 `completed` 时 **静默早退，不产回执也不记失败码，前值原样留存**。合起来意味着 —— **接线之后，UI 上可能出现一个「有值、但值是上一轮的」的状态，且与「本轮的值」在视觉上不可区分。** 而 E-0075 测出的第四道门（`route_chat.py:75-78` 对 allowlist 内每个值递归施加 `redact_text`）是 **同一类**：不是丢，是原地改写，**在场但不对**。

> **本案已经反复出现的失败类是「产出即丢弃」。这两条是它更难的同族：「产出即失真」。** 丢弃至少能被「没有」发现；失真只有知道原值的人能发现。**这恰恰是本端「唯一可靠验收 = 端到端真值 + 人眼」那条论证最需要成立的场合** —— 单元测试断言 fixture、payload 测试断言出参，两侧都不跨这两道门（S-0012 不确定性 6 已证）。

**故本端的验收论证不但存活，本轮还给它找到了两个此前没有的实例。**

### 二 · 核心问题：**改变，(c) → (a)**，理由与 S-0018 不同

**本端的 (c) 有两条腿，本庭这次只打断了一条 —— 但那条恰好是承重的。**

- **第一条腿（拓扑 → 唯一验收手段是端到端）：完好，见第一节。**
- **第二条腿（唯一能端到端跑通的真值来自即将被删的 legacy 产出者）：断了。** S-0012 原文写「先对着一个 **即将被删的产出者** 立规格，会让规格失去唯一可用的验收手段」。**这句里的「唯一」现在是假的**：E-0065/E-0066 证明 active 面另有一条基座 —— 产端在 `memory_v2_unchain_worker.py`、桥在 `memory_v2_unchain_active_bridge.py`、落点在 `_memory_v2_merge_diagnostics`，**一个都不在 Q10 的四文件删除清单里**。

**把 Q1 粘到 Q10 上的，正是那句「唯一」。它一假，粘合剂就没了。**

**为什么共同前置不构成同案理由 —— 这一点本端要说清楚，因为它是本端与 S-0018 论证路径不同的地方：**

投影（U-R1）确实同时是两件事的前置：**Q1 的验收前置**（没有它就没有真值可看）与 **Q10 的安全前置**（S-0007 约束 4，没有它删除就是用户可见能力净减少）。看起来像纠缠。**但它是扇出**：

> A 依赖 C、B 依赖 C，**不推出 A 与 B 必须同案**。它推出的是 **A 与 B 各自的裁定都必须把 C 写成自己的门**。

**这是一个处置形态的差别，不是严谨性的差别。** (c) 把两件事捆成一份方案换来的是「顺序被强制」；而同样的强制，用「各自挂门」也能拿到，且不必让一件便宜的事继承另一件贵的事的全部前提 —— **`code-owner-chat-bubble` 在 S-0011 反对 (c) 时说的正是这句（「把便宜的事挂在贵的事后面不是审慎」），本端当时不接受，现在接受，因为它的前提今天才被证成。**

**并且本端要给 (a) 补一条只有本端这一侧能看见的正面理由 —— 顺序本身就是诊断手段：**

若投影先落地、规格随后写在 **上游 typed 枚举** 之上（`MemoryAgentWorkerDisposition` / `ProcessDisposition` / `EnqueueDisposition`，非 `memory_v2_curator.py` 的字符串字面量），那么 Q10 的删除就获得一个 **今天完全不存在的可证伪信号**：**删除前后，active 面 trace 上的取值集应当逐字不变**（因为它本来就不来自被删的那四个文件）。一旦变了，就是删除动作本身出了问题。

> **(c) 恰恰会毁掉这个信号** —— 规格与删除同一份方案落地，trace 上出现任何差异都无法归因到其中一件。**本端是 `message.meta.bundle` 的接收端，是能看见这个 diff 的那一侧，所以这条由本端出。** 这与 S-0014 的可证伪性论证同向，但本端是从「谁看得见 diff」独立得出的。

**逐项表态（更新）**：

- **(a) 采纳，附一条硬条件（本端的，与 chat-bubble 那条并列不覆盖）**：

  > **Q1 的裁定必须把下列三项写成 Q1 自己的验收前置，不得留给 Q10：**
  > **(i)** active 面投影已落地（回执经 diagnostics 抵达 `bundle.memory_v2`）；
  > **(ii)** 一个真值在 **运行中的应用** 里被人眼看过一次 —— 单元测试在这条链路上不具备证明力（S-0012 不确定性 6；`code-owner-chat-bubble` 在 Q10 证词中独立同结论）；
  > **(iii)** 该值 **携带可与本回合对账的标识**（回执里的 `operation_id` / `claimed_root_run_id` 已够用），且验收断言核对它等于本回合 —— **这一项专治 E-0065 的静默早退**：没有它，验收会把上一轮的残留值当成本轮的成功。

  **没有这三条，(a) 就退化成本端 S-0012 反对它的那个形状：把一份验收不了的规格提前写出来。** 本端反对 (a) 的那条理由（「不失效 ≠ 可验收」）**一个字都没有失效 —— 它只是从「否决 (a) 的理由」变成了「(a) 成立的条件」。**

- **(b) 反对 —— 维持，理由不变且新事实使其更硬。** `enable_memory_v2` build 默认 `false`、全仓无覆盖（E-0031），Q10 今天零用户可见紧迫性；而 E-0064 证明 legacy 支是 **今天唯一有出口的那一支**，先删就是先把唯一的出口删掉。**S-0007 约束 4 本端完全支持其存活。**
- **(c) 撤回本端此前的采纳。** 撤回的是「必须同案」这一条强制性，**不撤回** 支撑它的拓扑事实与验收标准 —— 后者改挂在 (a) 的硬条件上。

### 三 · 第 4 点 · 「第 0 段」与 quorum —— **本案 quorum 在这条路上完整，可以闭庭**

**本庭说这一条对闭庭尤其重要，本端分成两问答。**

**问一 · 「第 0 段 形态裁定必须排在补产出者之前」这条修正是否仍成立？—— 其强制性 撤回。**

S-0012 那条修正的 **全部力量** 来自一句话：**「你没法在不知道是哪一个的情况下去 spec『补一个产出者』，因为它在两条路线上不是同一个交付物。」**

**这句话的主语没了。** 没有「补一个产出者」要 spec —— 产出者存在。要 spec 的是 **一根线**。而线的走向 **不是自由选择，是被数据今天的位置决定的**：回执是一个只活在 Python 模块属性上的进程内对象（E-0065），它 **从不进入 `Agent.run()` 的事件流**。要把它放上 runtime event 总线，得先 **制造** 一个事件 —— 那严格多于走同一调用点上已经接好的 diagnostics 通道。而 diagnostics 通道的传输层增量成本 **实测为零**：`memory_v2` 已在 13 键 allowlist 内、已在 `done` 信封上、已在 `message.meta.bundle` 里（E-0076）。

> **故：投影可以在形态未裁的前提下落地。第 0 段 从「阻塞前置」降为「非阻塞产品项」。** 形态问题（过程信号 vs 审计块）作为 **呈现取舍** 依然存在，但它是 Q1 呈现侧的问题，**不再是任何交付物的前置**。本端此前给它的那个「最便宜、最吃力」的定位，**吃力的部分不成立了**。

**问二 · 投影这条路会不会拉进 `code-owner-unchain`？—— 不会。三点实测（E-0076）：**

1. **`route_chat.py:1086-1090` 的 `continue` 在 `bridge.normalize(raw_event)` 之前返回。** `bundle` 通道 **显式绕过** unchain 的事件归一化管线。今日复核到行
2. **unchain 仓 HEAD `a4e69f41`（干净树）**，`src/unchain/events/` 下 4 个 `.py` 对 `memory_v2` / `memory_agent` 的命中数 **全部为 0**。unchain 的事件词汇表与本切片零交集
3. **本端这一侧 0 行改动**：`use_chat_stream.js:7538-7565` 对 `done.bundle` 是浅拷贝整体透传，本端 **不读任何 `memory_v2` 子键**。`bundle["memory_v2"]` 增加任何键，本端不需要改一个字符

**owner 清单（投影切片的完整出场名单）**：

| 段 | owner | 是否在本案 quorum | 改动量 |
|---|---|---|---|
| 产端读取 `last_receipt` + diagnostics kwarg | `code-owner-runtime` | **在** | 一处读取 + 一个 kwarg |
| 收端 presenter `TOP_LEVEL_KEYS` | `code-owner-shared-arteries` | **在** | 一项 |
| 双向对账测试 | 上二者 | **在** | 一条 |
| Electron preload 中继 | `code-owner-electron` | 在 | **0** |
| chat-core 传输 | `code-owner-chat-core` | **在（本端）** | **0** |
| unchain `events/{types,normalizer}.py` | `code-owner-unchain` | **不在** | **0 —— 不出场** |

> **结论：本案 quorum 在这条路上完整。本庭可以闭庭。**

**但本端不把 U-C4 撤回，改为休眠 —— 否则本端就是把一个条件项写成了无条件项。** U-C4 的触发条件原样保留，且它是可机械检查的：

> **只要闭庭产出的正文出现「新增 runtime event 类型」或「改 `unchain:src/unchain/events/{types,normalizer}.py`」中的任何一项，quorum 立刻不完整**，第三层门禁必须重判 `code-owner-unchain` 的必到资格（S-0002 排除它的前提是「本案不含 unchain 侧改动请求」，那一支上不再成立）。
> **反之，只要裁定把投影限定在 diagnostics/bundle 通道上，或对形态保持沉默 —— quorum 完整。**

**并附一条防止本条被读过头的限定**：E-0076 证明的是 **「这条路不需要 unchain」**，不是 **「不存在需要 unchain 的路」**。E-0032 早已指出 `route_chat.py:1086` 那个 `continue` 也可以被改成放行；那是另一条路，本端不覆盖也不主张。

### 四 · S-0012 的失效段落与替代表述（协议禁止原地改写，此处逐条标明）

| S-0012 位置 | 失效表述 | 替代表述 |
|---|---|---|
| **结论** 段末句 | 「在一个有多道静默丢弃门、且诊断缓冲零消费者的拓扑里，**一份没有产出者的词汇规格** 无法被验收」 | 「……**一份在 wire 上没有真值到达可观察端的词汇规格** 无法被验收」。**拓扑事实与验收标准不变；「没有产出者」这个刻画被 E-0045/E-0063/E-0065 取代** |
| **建议处置 一** ·「(a) 反对」 | 「(a) 反对 —— 不失效 ≠ 可验收」 | **「(a) 采纳，附硬条件」**。该反对理由 **不撤回**，它从「否决 (a) 的理由」变为「(a) 成立的条件」（第二节三项） |
| **建议处置 一** ·「(c) 采纳」 | 「(c) 采纳」及其「先对着一个即将被删的产出者立规格会失去 **唯一** 可用的验收手段」 | **撤回该选择。** 「唯一」为假 —— active 面另有一条完全不在删除清单内的验收基座（E-0065/E-0066）。**共同前置是扇出不是纠缠** |
| **建议处置 二** · 第 0 段 | 「形态裁定 **必须** 排在补产出者之前」；「产出者在两条路线上不是同一个交付物」 | **撤回其强制性。** 无「补产出者」可 spec；投影可在形态未裁下落地于 diagnostics/bundle 通道。**第 0 段 降为非阻塞产品项** |
| **建议处置 三** · 四段表第 1 段 | 「补 active 平面的 memory-agent 遥测产出者 …… 若为路线 B 则加 `code-owner-unchain`」 | 「**把已存在的 typed 回执投影到 diagnostics/bundle 通道**」；落 `code-owner-runtime` + `code-owner-shared-arteries`，**不含 `code-owner-unchain`**（E-0076） |
| **U-C4** | 「若形态裁向过程信号且走新增事件类型，本案 quorum 不完整」 | **不撤回，改为休眠**，触发条件与检查方式见第三节末 |
| **E-0026 结论 2** | 「`_redact_memory_v2_value` **只做密钥脱敏不做键过滤**」（因此未计入门列表） | 作为 **键过滤器** 的判断正确，但据此把它排除在门外是错的 —— **它是第四道门，改写门**（E-0075）。**门计数：三 → 四，且第四道不同类** |

**S-0012 其余部分全部维持**，特别是：约束 1–7 全部存活（其中 **约束 3「不得在不同步改两道静默门的前提下新增 runtime event 类型」在投影走 diagnostics 通道时不被触发**，但它正是 U-C4 休眠条件的技术依据，请勿删）；U-C1 / U-C2 / U-C3 / U-C5 / U-C6 / U-C7 维持；Q9 与 Q10 的逐问表态维持；「存量 `pupu_legacy` 数据处置从 Q10 摘出单列」维持。

### 五 · 本端在新事实下新增的两条约束（都落在 (a) 的验收面上，不落在别人的边界里）

1. **投影的值必须能与本回合对账。** 依据 E-0065 的静默早退 + last-write-wins：不带回合标识的验收会把上一轮的残留值判成本轮的成功。回执里 `operation_id` / `claimed_root_run_id` 已经有了，**要求的是验收断言去核对它，不是要求新增字段**。
2. **Q1 固化 `reason` 取值集时必须知道 wire 上有一道改写门。** 依据 E-0075：`bundle.memory_v2` 内每个字符串叶子都过一次 `redact_text` 的三条正则。实测四个稳定失败码与 `Isolated` **原样通过**（利好），但自由文本形状的 `reason` / `process_reason` 会被静默改写（`capture token=abc not complete` → `capture token=*** not complete`）。**本端不主张放松脱敏**（那是 `expert-security` 面）——**主张的是取值集规格要么避开可命中形状，要么显式接受改写。**

### 六 · 程序披露

未派生任何子 instance；全程 Read / Grep / Bash 只读。本轮取证严格限于本庭指定的 `.inbox/S-0018` · `E-0045` · `E-0063`…`E-0066`、本端自己的 S-0012 相关段落，以及为回答第 2 / 4 点所必需的四处代码复核（`use_chat_stream.js` 的 bundle 消费点 —— 本端边界内；`route_chat.py` 的 `continue` 与 13 键 allowlist、`custom_provider.py` 的两个脱敏器 —— **越界读取，属 `code-owner-runtime`**；unchain 仓 `src/unchain/events/` 的负向 grep —— **越界读取，属 `code-owner-unchain`，该 owner 不在本案 quorum**）。**未做全仓勘察，未改任何产品代码，未 commit。** 写入仅本案 `.inbox/` 下 `S-0019.md` · `E-0075.md` · `E-0076.md`（`E-0077` 未使用）。

**并附一项编号事实供本庭核对**：本端接到传票时 `.inbox/S-0019.md` 已存在，内容为 `speaker-of-the-house` 的 `NOTICE`（`expert-llm` 模型配额）；本端未覆盖它，转而等待。本庭随后已将其改号为 `S-0021.md`，`S-0019` 遂空出，本端据此按指派编号写入。**本端未删除、未改写任何既有归档件。**

#### S-0020 | ASSESSMENT | expert-architecture → case
- **阶段**: 议案庭审
- **结论**: **三选一是错的形状，本领域不选其中任何一个作为鉴定结论。** 使本案成为一案的那条 Q1↔Q10 耦合，已被提出它的 owner 本人撤回（S-0018 第三节）；而四张 (c) 票各自指认的「共用前置」**不是同一个东西 —— 是两个同源、一个是本案分案方式的产物、一个真正独立**。其中两个同源的那一个，本案至今没有任何一问指向它：**`memory_v2` 帧的载荷在产端没有被声明过形状**（不是「两侧各写一份键表」，是 **收端有一张 59 项冻结表、产端一张都没有**，写入点 ~24 个、默认语义是整字典替换、代码库里已有两处独立的绕行，E-0068 / E-0069 / E-0070）。**本案讨论的六道静默门、四个产出即丢弃的字段、7 丢 6（实测至少 45 丢 41）—— 全部是这一个缺失制品的下游症状。** 顺序问题（先定词汇还是先删）在这个诊断下是次要的：**两种顺序都能走通，只要删除切片与 `memory_v2_store_boundary.py:96` 的默认值变更同批落地** —— 不这么做，删除会 **引入** 一个指向不存在实现的活默认值（E-0073），这是本领域判为结构不成立的唯一元素，且它在 (a)/(b)/(c) 三个选项下都成立
- **依据**: E-0067 ~ E-0074（八条均由本人取证，含两次机械集合运算与四条附命令原文的负向 grep）；本案 E-0002 · E-0004 · E-0007 · E-0011 · E-0013 · E-0016 · E-0017 · E-0024 · E-0026 · E-0027 · E-0028 · E-0031 · E-0033 · E-0034 · E-0036 · E-0037 · E-0038 · E-0039 · E-0044 · E-0045 · E-0053 · E-0055 · E-0056 · E-0057 · E-0063 ~ E-0066；S-0002 ~ S-0018 全部；S-0021（含补记一）；跨案 `0000-0001-2026-0807#S-0005` · `#S-0006` · `#R-0001`
- **不确定性**:

  **一 · 模型替代是否实质影响本次结论：不影响。本领域不请求任何一项列为「因模型替代而不作结论」。**

  本条的全部事实主张由三类可机械复核的东西支撑：(i) 引用到 `file:line` 的静态读取；(ii) 两次机械集合运算（产端字面量键集 ↔ 收端 `TOP_LEVEL_KEYS` 的交与差；`bridge.preparation` 属性链深度统计），命令与脚本形式已随证据给出；(iii) 附命令原文的负向 grep。**没有任何一项事实结论依赖模型层的推理深度或世界知识。**

  **属于判断而非观察的有两项，本领域指名它们供复核者重点审查，但不因此撤回结论**：(1) 专业理由五的归并判断（六道门是一个架构问题而非六个局部缺陷）；(2) 专业理由六的形状判断（弃用一个 store owner 的正确形状是先取消其可选性、再删实现）。两项的机制与被它们排除的替代读法均已写出，任何评审者可按同一批证据独立复核。**若 `chief-judge` 仍要求登记缺口，正确的登记方式是「S-0020 以 `opus` 出具，其结论均可由所附证据机械复核」，而不是标注某一项失效。**

  **本领域另出一条与本案实体无关、但属本领域触发条件（共享原语的结构变更）的观察，见未决项 UA-6：`Expert` 层模型声明 0/6 的成功率本身是一条组织级单点故障，它的处置不在本案。**

  **二 · 「有条件成立」的全部必要条件（缺任一条，本领域的成立不再有效）**

  1. **删除切片必须与 `memory_v2_store_boundary.py:96` 的默认值变更同批落地。** 该行今天在环境变量缺失时返回 `pupu_legacy`；删掉那四个文件而不改它，一次 standalone 启动（本仓 `CLAUDE.md` 的成文开发流程）会解析出一个没有实现的 store owner。**这是清理动作引入的新故障，不是它清理的旧故障**（E-0073）。**该条在 (a)/(b)/(c) 下都适用**
  2. **词汇规格不得只写成一张表；产端必须先有一个被声明的载荷形状。** 具体：一个位于 `unchain_runtime` 的顶层键声明，`_memory_v2_merge_diagnostics` 与 `admission.update_diagnostics` 的全部写入点都经过它，对未声明键 **fail-loud**。缺此条，「先定词汇」定出的表没有产出方承认它（E-0068 / E-0069 / E-0070）
  3. **S-0013 第四节 / S-0014 验收 2 的双向对账测试不得排在条件 2 之前。** 它按描述建不起来 —— **产端没有可读的集合可对账**；今天只能实现为对 ~24 个写入点的源码字面量抓取，而字面量抓取在任何一次「键名由变量拼出」时静默漏报，**即它本身就是本案正在诊断的那个失败类的又一个实例**（E-0068）
  4. **preload 信封门（本案第六道，`unchain_stream_client.js:195-230`）必须单独、无条件先修，不得并入任何一问。** 它是唯一一处「丢弃」与「流正常结束」在下游不可区分的门（E-0072）。`code-owner-electron` 请求 3 与约束 2 本领域背书
  5. **journal reload 的数据层迁移必须把 `runStatusRank` / `mergeRuns` 一并迁走。** 迁移的正当性不是去重（S-0013 的因果反驳成立），是 **它今天在渲染层实现了一条跨数据源的仲裁策略**（E-0071）。若只迁 ref 正则与事件词表、把仲裁留在 `chat-bubble`，本领域的成立不再有效
  6. **`TOP_LEVEL_KEYS` 的任何扩表必须以持久化 schema 变更对待**（S-0013 约束 1，本领域确认：唯一非渲染消费者是 `chat_storage_sanitize.js:739`），方案必须显式说明历史行的处置。**这是单向门**
  7. **若形态裁向「过程信号 + 新增 runtime event 类型」，在 `code-owner-unchain` 的必到资格被第三层门禁重判之前，该支不得进入方案庭审**（S-0012 U-C4）。**本领域不裁形态取舍，只裁 quorum 前置**
  8. **裁定不得把 `agentRuns` 空态写成单一原因。** 庭上唯一归因是门链（E-0016 / E-0039）；E-0070 给出第二条未排除的机制（整字典替换 + `memory_agent_runs` 不在 sticky 集合内）。**机制已证、时序未证** —— 但一份把门链写成唯一解释的裁定，会让后续修复有修错地方的风险

  **三 · 本轮的取证限制**

  - **未起 sidecar、未跑一次真实回合、未抓一次 SSE、未在运行中的应用里看过任何一条 Memory V2 trace 行。** 与 S-0006 / S-0013 / S-0014 / S-0015 / S-0016 / S-0018 同一条限制，本领域不例外。**E-0070 的竞争解释因此是假说不是结论**
  - **E-0069 的 45 个产端键是下界不是全集** —— 字面量抓取漏掉变量键、f-string 键、`**dict` 展开；反方向（白名单里有多少项无产出者）本领域未能测准，不出数字，该方向以 E-0037 为准
  - **E-0073 只覆盖当前 HEAD。** E-0002 证明三个产品目录自 `14ca3ccc` 零变更，但 **不能证明更早的已发布版本里 Electron 也恒发 `off|unchain`**。**若任一已发布版本未设该环境变量，本领域对 Q10 存量处置的判断（专业理由六之三）翻转** —— 那时存量 store 是产品产物，不是开发产物
  - **`.inbox/S-0019.md`（`code-owner-chat-core` 对 S-0018 的回应）在本条写作时尚未落地。** S-0012 选 (c) 的承重论证「没有产出者的词汇规格无法验收」依赖已被 S-0018 撤回的 U-R1；**本条对 S-0012 立场的引用以其已归档原文为准**，若 S-0019 改变其论证，专业理由一之(3)须重读
  - **越界读取披露**：为核算跨层落差读了 `unchain_runtime/server/{unchain_adapter,memory_v2_context,memory_v2_store_boundary,memory_v2_unchain_active_bridge,memory_v2_unchain_runtime_factory,memory_v2_unchain_bootstrap_adapter,memory_v2_unchain_graph_checkpoint,memory_v2_context_adapter}.py`、`src/SERVICEs/runtime_events/{memory_v2_trace_presenter,event_store}.js`、`src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js`、`electron/preload/stream/unchain_stream_client.js`、`electron/main/services/unchain/memory_v2_rollout.js`、`docs/architecture/memory-v2-claude-handoff-2026-08-07.md`。**这些文件的处置一律以各自 owner 为准；`docs/**` 依 A-009 无 owner**
  - **未派生任何子 instance。本轮只读，未改任何产品代码，未 commit。** 写入仅两处：本案 `.inbox/` 下的 `S-0020.md` 与 `E-0067`…`E-0074.md`；以及 `.claude/agent-memory/expert-architecture/` 下的记忆文件与索引（该目录 git 已跟踪，工作树会带这些变更，特此披露）

- **请求/下一步**:
  1. **请把「`memory_v2` 帧载荷的产端声明」列为一个待裁交付物，指名 `code-owner-runtime`（产端）单独持有，不要写成产端与收端的共同交付。** 理由见专业理由二：今天没有任何一方持有它，因为它不存在；而收端白名单不能升格成它 —— 收端的 fail-closed 与 schema 的 fail-loud 方向相反（E-0072）
  2. **请把本条必要条件 1（默认值与删除同批）写进裁定正文，且不要写成 Q10 的一个步骤 —— 写成删除切片的成立条件。** 它是本领域判为「结构上不成立」的唯一元素，成本一行，落 `code-owner-runtime`
  3. **请裁定不要引用 `docs/architecture/memory-v2-claude-handoff-2026-08-07.md:590-595` 作为 Q10 的处置依据。** 它把那四个文件称作「不可达路径」，该前提已被本案两轮取证否定，而 `docs/**` 无 owner，不会有人去修正它（E-0074）
  4. **请把 E-0070 交 `code-owner-runtime` 定向质询一次**：`_finalize_memory_v2_curator` 写入 `memory_agent_runs` 之后，是否还有 `memory_v2_context.py` 的 `update_diagnostics` 调用。**这一问的答案决定「产出即丢弃」的第一现场在产端还是在收端，也决定必要条件 8 的力度**
  5. **请把 `pupu_legacy` 登记为本案第四处同词异义**（store owner ∥ chat history 来源格式，E-0074），并注明前三处都在庭上被抓到、**只有这一处落在 Q10 的决策面上**
  6. **本领域不请求任何属于自己的切片。** 本条不产生代码交付物

- **评估结论**: **有条件成立**（全部必要条件见「不确定性」第二节，共 8 条）

  **另出两项「不成立」，二者均已收窄到最小范围并各附翻转条件**（依角色职责进 `chief-judge` 强制回应清单）：

  - **不成立 (i) · (b)「先删再定词汇」在结构上不成立**，理由与庭上五位给的都不同：删除会留下一个 **仍然指向被删实现的活默认值**（E-0073）。**翻转条件**：若删除切片同批改掉 `memory_v2_store_boundary.py:96`，本项不成立即告消除 —— **但那样 (b) 与 (a) 在本领域的结构判据上就没有差别了，(b) 的劣势退回为其他 owner 已陈述的实体理由**
  - **不成立 (ii) · 「存量 `pupu_legacy` store 的处置是删除的必要前置」这一 *推论* 不成立**（其 *事实* 成立，本领域不反驳）。E-0024 → S-0010 → S-0016 的升级链把「产品没有任何机制处理它」推到了「用户面的存量处置是必要条件」，**中间少了一步**：`pupu_legacy` 不是产品配置，是模块默认值，而其唯一生产写入方恒发 `off|unchain`（E-0073）。在经 Electron 启动的产品上该平面不可达，S-0016 描述的「会让整个 Memory V2 面 degraded 的目录」在出厂路径上到不了。**证据链（E-0073 + E-0007 的 n=1 + E-0024 的内容表全空）指向开发环境清理，不指向产品迁移。** **翻转条件**：任何一个已发布版本被证明未设 `PUPU_CONTEXT_V2_STORE_OWNER`，本项立即翻转，且翻转后严重度按 S-0016 所述成立。**本领域未核实历史版本，明确承认这是本条最脆弱的一处**

- **专业适用范围**:

  | 触发条件 | 命中 | 落位 |
  |---|---|---|
  | 跨两个及以上 code-owner 边界 | **命中**（本案跨 7 名） | 帧载荷的产端/收端归属；投影管线落位；静默门的归并判断 |
  | 触及跨仓库接口 | **命中，但方向被本案两名 owner 收窄** | `runtime_events_v4` 经 E-0006 / S-0016 已确证为 capability 名、产端在 PuPu 自己的 sidecar、**不是跨仓握手**；真正的跨仓面只在「过程信号 + 新事件类型」这一支上（必要条件 7）。`unchain-core.lock.json` 的第二份手写副本（E-0055）落 readiness 门，属同一失败类 |
  | 共享原语或公共动脉的结构变更 | **命中** | `src/SERVICEs/runtime_events/**` 的收端白名单；`context_v2_bridge.js` 与 bundle 两条通路的入口都在同一 owner 边界内 |
  | 新增或移动一个功能的落位 | **命中** | journal reload 数据层迁入 `runtime_events/`；帧载荷声明制品的落位 |

  **四问落位**

  | 问 | 落位 |
  |---|---|
  | **Q1** | **部分落在本领域** —— 词汇规格挂在什么制品上、那个制品由谁持有、它与安全过滤器的关系。**具体词表内容、终态语义、呈现形态 —— 不落在本领域**（`expert-llm` / `code-owner-shared-arteries` / `expert-ux`） |
  | **Q1-前段** | **部分落在本领域** —— 两条路线的跨层成本量级与 quorum 完整性。**形态取舍（过程信号 vs 审计块）不落在本领域**：`expert-llm` 已从帧语义出具判据，本领域不复述也不加价 |
  | **Q9** | **不落在本领域**，一处例外：`settings` schema 的 namespace 增删改被 `code-owner-settings` 约束 1 声明须经本领域。**本案不触发它** —— 该 owner 已判 namespace「不做」，且理由（收益为零）本领域不反驳 |
  | **Q10** | **落在本领域（结构面）** —— 弃用一个数据平面的正确形状、删除是否引入新故障。**时序取舍、存量数据的可弃性、验收标准 —— 不落在本领域** |

- **专业理由**:

  **一 · 核心问题：三选一是错的形状**

  本领域不按票数判，也不代 `chief-judge` 取舍。以下是鉴定。

  **(1) 使本案成为一案的那条论证，已经不存在了。** `case.md` 与 `FRAMING` 的同案理由是「`Isolated` 的产点 4/5 在待删文件里，Q1 若立规格会挂在待删代码上」。该论证被 S-0006 在渲染端否掉（锚点不在清单里）、被 S-0013 在产端否掉（S-0006 提名的两个锚点一个在死轴上、一个不是产出者）、被 S-0014 换掉（锚点应取上游 typed 枚举）。而 S-0007 提出的更强替代（U-R1「删完之后这条轴没有产出者了」）**已被其本人在 S-0018 第三节撤回**，并明言「粘合剂本身不存在」。

  > **净效果：Q1 与 Q10 之间今天没有一条活着的耦合论证。** 本领域独立核对后 **不为任何一条耦合论证复活背书**。这不等于两问该拆 —— 拆不拆是排期取舍，属 `chief-judge`；本领域只判：**以「它们在技术上耦合」为由必须同案，这个判据今天不成立。**

  **(2) 四张 (c) 票各自指认了一个不同的「共用前置」——本庭问这是同一个结构问题的多个切面还是多个独立的东西。答案：两个同源、一个是本案分案方式的产物、一个真正独立。**

  | 票 | 指认的共用前置 | 本领域的归类 |
  |---|---|---|
  | `code-owner-shared-arteries` S-0013 | 收端白名单 / 拓扑 | **同源 A** —— 帧载荷无声明形状的收端半 |
  | `code-owner-settings` S-0015（U-S1） | Memory Agent 有没有用户可及的配置面 | **同源 A 的镜像** —— 同一失败类的输入侧：`memory_agent_config` 是一条 **有声明形状、无产出源** 的通道；帧载荷是一条 **有产出源、无声明形状** 的通道。**两者都是「契约只有一端活着」** |
  | `code-owner-agents` S-0017 | 需要一个容器装那条约束的续命 | **不是结构问题** —— 是本案分案方式的产物。该 owner 自陈「我争的是容器不是顺序」，并给出翻转条件。**一个议题因为没有归属而必须挂靠另一个议题，这是 case 分解的缺陷，不是系统的缺陷** |
  | `code-owner-electron` S-0016（九道门） | 唯一有效验收方式的物理前置 | **真正独立，且真实** —— 它不是契约缺陷，是「本系统唯一的验收仪器今天跑不起来」。**它在任何一问、任何一个顺序下都是前置**，与 Q1/Q10 是否同案完全无关 |

  **本领域据此出一条判断**：四个共用前置里 **没有一个是 Q1 与 Q10 共用的** —— 同源 A 的两个是 Q1 独有的上游、九道门是 **一切改动** 的上游、容器是分案的产物。**(c) 作为「耦合」不成立；作为「容器」它能工作，但那是分案的副产物，不是技术判据。** 把一个 case 分解缺陷记成技术耦合，代价是下一次同类议题会再一次被迫捆绑。

  **(3) 那么 (a) 呢：有条件成立，但它成立的理由不是三位 (a) 票给的任何一条。**

  - `code-owner-chat-bubble` 的 (a)：锚点已被 E-0039 证伪，本领域确认该证伪成立，不为其辩护
  - `expert-llm` 的 (a)（换锚点到上游 typed 枚举）：本领域确认 **锚点选择成立** —— 它不在删除清单、不在 fail-closed 门内侧、不在 PuPu 仓，且 `electron/` 对该词汇零依赖（S-0016 已在其边界内独立核实）。**但采纳一套上游枚举，解决的是「词从哪来」，没有解决「这些词随哪个制品到达 UI」** —— 那正是本条诊断的缺失制品
  - `code-owner-runtime` 改票后的 (a)（可证伪性：改 fail-closed 之后残留字符串会以显式未知态暴露，给删除提供一个今天不存在的验收信号）：**本领域确认这条论证成立，且它是庭上唯一一条真正的顺序判据** —— 它不主张耦合，它主张 **一个顺序能生产验收信号而另一个不能**。**这是一条正确形状的排序论据**

  > **本领域的鉴定**：顺序在本案是次要问题。**两种顺序都能走通**，只要必要条件 1 成立（删除与默认值同批）。真正决定这份方案能不能验收的，是必要条件 2（产端声明形状）与必要条件 4（信封门），**而这两条在 (a)、(b)、(c) 下都必须做，且都不因顺序改变。**

  **二 · 本庭质询 1 —— `memory_v2` 帧的顶层键表由谁持有（S-0007 U-R2 指名交本领域）**

  **该问预设了两个持有者。实测是一个持有者加一个开放集合。**

  - **收端**：`memory_v2_trace_presenter.js:9-69` 一张 **59 项冻结表**（`FRAMING` 与 S-0007 记作 60，差 1），全仓唯一持有者
  - **产端**：**没有表。** `_memory_v2_merge_diagnostics(admission, **values)` 收任意 kwarg；`update_diagnostics(values)` 直接 `self._latest = copy.deepcopy(values)`；`memory_v2_bundle_payload` 原样透出。产端仅有的两个键集合都不是准入表（一个是 ref 分桶路由，一个是做减法用的逐次快照剔除集）（E-0068）
  - **写入点 ~24 个不是 8 个**：`memory_v2_context.py` 21 处 + `memory_v2_context_adapter.py` 1 处 + adapter merge 助手（覆盖其 8 个调用点）。字面量顶层键 **至少 45 个，白名单收 4 个**（E-0069）。**庭上以「7 丢 6」为量级基础的每一处严重度判断，分母都低估了**
  - **默认语义是整字典替换，代码库自陈并已绕行两次**：`_StickyMemoryV2Admission` 的 docstring 逐字写着「Keep admission identity visible when compiler diagnostics are replaced」，靠重注入 15 个 identity 键挽救；adapter 的 merge 助手是第二处独立绕行。**两处互不知道对方存在，`memory_agent_runs` 一处都不在 sticky 集合里**（E-0070）

  **归属裁定（本领域出鉴定，落位判断在本领域职责内）**：

  > **该键表今天不由任何人持有，因为它不存在。** 应新建，**落 `code-owner-runtime` 单独持有** —— 理由是帧的产出方只有一个，而声明必须在产出侧才能 fail-loud。**不应写成产端与收端的共同交付**（这是 S-0008 推论 3 与 S-0013 的一处共同倾向），因为收端制品有一个不可让渡的相反职责：`BLOCKED_KEY_PATTERN`、四个封顶常量与挂载门与 `TOP_LEVEL_KEYS` 写在同一个文件里（E-0072），**它必须 fail-closed 且沉默**。把 schema 职责并进去，等于要求一个制品同时向两个相反方向失败。

  **可逆性**：新建声明制品 **可逆**。`TOP_LEVEL_KEYS` 扩表 **单向门**（必要条件 6）。

  **三 · 本庭质询 2 —— S-0007 请求把 E-0016 交本领域对质，S-0018 改票后是否消解**

  **消解一半，另一半升级了。**

  - **消解的一半**：该请求的自陈目的是「决定 Q1 是呈现问题还是 active 平面缺一个产出点」。S-0018 已自行回答（**都不是**：产出者存在，缺的是出口），且是从产端事实独立得出。**本领域不需要为那个决定作对质。**
  - **未消解的一半**：E-0016 的机制现在承载着另一件事 —— 它是 `memory_agent_runs` 成为 7 个 merge 键中唯一存活者的原因（E-0064），**因而也是那张 59 项白名单「看起来大致对得上」的原因**。白名单是对着一条 legacy 分支的产出形状长成的。**这一点在删除之后会变成：白名单继续存在、继续看起来对得上、而它对齐的那个产出者已经没了。** 这正是 S-0013 P-3（7 个死顶层键 + 7 个死 agent-run 源键）会扩大的方向
  - **本领域在其范围内对 E-0016 的表态**：**确认门与产点的位置关系**（依 E-0039 的行锚点复核，`_finalize_memory_v2_curator` 函数体 902–1153，三个调用点各自带门，`memory_agent_runs` 两个产点都在体内）。**不确认其运行时行为** —— 本领域未跑，与 E-0039 完整性限制 1 同一条限制。**并附必要条件 8**：`agentRuns` 空态今天有第二条未排除的机制（E-0070），归因不得写成唯一解

  **四 · 本庭质询 3 —— 投影管线迁不迁**

  **迁，数据层整体迁入 `src/SERVICEs/runtime_events/`。但庭上双方把它的性质和收益都说错了。**

  - **它不是 presenter 的重复实现。** 它是 **第二个数据源** 的投影（`contextV2Bridge.listEvents` 主动拉取 vs bundle 被动到达），两条通路的入口 **今天已经都在同一名 owner 边界内**（`runtime_events/` 与 `bridges/context_v2_bridge.js`，S-0013 边界更正段成立）。**迁移不消除任何一条管线**，因为两个源都不会消失。**S-0013 的因果反驳成立，本领域确认**
  - **真正的架构缺陷，庭上无人提出**：`runStatusRank`（`:424-432`）+ `mergeRuns`（`:434-481`）是一条 **跨数据源的仲裁策略** —— 它决定用户看到的终态词取自 bundle 还是 journal，以及 status / consumedTokens / inputTokens / outputTokens / cost / reason / errorCode **七个字段各自取哪一侧**。按庭上双方已互相确认的分界线（S-0006 §7.1 / S-0013 第六节：「返回对象的字段名与取值是 presenter 的，字段怎么变成像素是 chat-bubble 的」），**源之间的仲裁不是像素问题**。它比 S-0006 自认的两处越界（活跃词表、三元判断）重得多（E-0071）
  - **落位**：`src/SERVICEs/runtime_events/`，切分点 `:498/:500`，`:1` 是唯一的 React 耦合（组件半的 import）。**移动不是重写**，S-0013 四条条件本领域全部背书，**并追加必要条件 5**（仲裁必须一起走）
  - **定位**：**不是 Q1 的前置。** S-0013 的定位反驳成立，S-0006 的定位不成立 —— 迁移不改变任何词汇规格能不能写，只改变它写完之后落在几个 owner 手里。**可逆**

  **五 · 本庭质询 4 —— 六道静默门是一个架构问题还是六个局部缺陷**

  **是一个，实例至少九个 —— 但庭上正在收敛的处方对其中大多数无效。**

  **共性（E-0072）**：每一层都在把一个 **安全过滤器** 同时当成 **schema** 用。二者失败方向相反：安全过滤器必须 fail-closed 且沉默（不认识就丢，别泄漏别崩 —— 这是正确设计，本领域不主张改）；schema 必须 fail-loud。合用一个制品，结果必然是 **新字段被完全按设计丢掉，而没有人被告知**。最直接的证据是 presenter 一个文件里同时住着脱敏正则、四个封顶常量、字段表与挂载门。

  **为什么「每道门加 default 分支 + 计数」不够 —— 这个处方已经被实践过一次并失败，证据就在本案台账上**：`event_store.js:186-191` **已经有计数了**，`unknownEvents` 全仓 6 处命中 **全部是定义、写入与结构透传，零读取**。**六道门各加一个计数器，产出是六个新的 `unknownEvents`。** 唯一能改变这一类的是必要条件 2（产端声明形状）—— 之后每道门的未知键丢弃可以变成 **构建期的红灯**，而不是运行期的无人读诊断。

  **一处例外，本领域明确支持无条件先修**：第六道（preload 信封级）**性质不同**。它丢在类型机制存在之前，且是本案唯一一处「丢弃」与「流正常结束」在下游 **不可区分** 的门 —— 下游收不到东西，也收不到「有东西没收到」。`code-owner-electron` 请求 3 与约束 2 本领域背书，**且它不依赖本案任何一问、不依赖 schema 先落地**（必要条件 4）。**可逆**。

  **六 · Q10 结构面 —— 弃用一个数据平面的正确形状（本庭直接问的）**

  **(1) 先把被弃用的东西说准：不是一条用户所在的数据平面，是一个模块默认值。** `PUPU_CONTEXT_V2_STORE_OWNER` 缺失时 `memory_v2_store_boundary.py:96` 返回 `pupu_legacy`；而全仓唯一的生产写入方 `memory_v2_rollout.js:150` **恒发 `off` 或 `unchain`**。**故经 Electron 启动的 sidecar 永远到不了 legacy 平面；到得了它的唯一场合是不经 Electron 启动 —— 即本仓 `CLAUDE.md` 成文的 standalone 开发流程**（E-0073）。这与 E-0007 那个 473 MB 目录的时间戳与内容形态（内容表全空、`operations` 全为删除前缀）一致。

  **(2) 正确形状（本领域的核心判断）**：

  > **一个 store owner 是通过取消它的可选性来弃用的，不是通过删掉它的实现。** 顺序是：① 把该取值从可选集合中移除 / 改掉默认值 → ② 让一个版本在「它不可选」的状态下发出去 → ③ 然后删实现。
  >
  > **本案提案把这个顺序倒过来了，而这是它唯一一处结构上不成立的元素**：按当前清单删除，`memory_v2_store_boundary.py:96` 仍然把 `pupu_legacy` 作为默认值返回，于是一次 standalone 启动会解析出一个 **没有实现的 store owner**。**这是清理动作引入的新故障。** 修法在一名 owner 边界内、成本一行（必要条件 1）。

  **(3) 对「删代码、留数据、无迁移、无告知」这个组合的逐项鉴定**：

  | 元素 | 鉴定 |
  |---|---|
  | **删代码** | **可接受**，条件是 (2) 的顺序被恢复。删除本身是可逆的（git），**不可逆的是验收信号** —— 删完之后永远无法再观察 legacy 平面产出什么。这是 `code-owner-runtime` 改票后那条排序论据的真正力量所在，本领域背书 |
  | **留数据** | **可接受。** E-0007 实测内容表全 0 行，无可迁之物；且按 (1) 它是开发产物 |
  | **无迁移** | **可接受，且不该做。** 一个只有开发路径能创建、内容表为空的目录，写一次产品迁移是把成本花在一个证据不支持的方向。**`bootstrap_pupu_legacy_history_into_unchain` 不是它的迁移路径**（E-0074），任何认为「迁移已经存在」的复核意见都基于这处同词异义 |
  | **无告知** | **可接受，但有一个应做的替代动作。** readiness 门今天已经算出了 `context_v2_store_owner_incompatible` 这个理由，只是没有把它透给用户。**该做的是让门说出它撞到了哪一条，不是做一次数据迁移。** 这是一个诊断缺口，不是迁移义务 —— 落 `code-owner-electron`，**可逆** |

  **(4) 本领域据此对 E-0024 → S-0010 → S-0016 的升级链出「不成立 (ii)」**（见评估结论），并重申其翻转条件：**任何一个已发布版本被证明未设该环境变量，本项立即翻转。** 本领域未核实历史版本。

  **七 · 可逆 / 单向门（本领域的主动指出义务）**

  | 项 | 判定 | 说明 |
  |---|---|---|
  | 帧载荷产端声明制品（必要条件 2） | **可逆** | 新增一层校验，可撤 |
  | `TOP_LEVEL_KEYS` 扩表 | **单向门** | 同时是持久化 schema 变更（唯一非渲染消费者 `chat_storage_sanitize.js:739`）；历史行不可回收 |
  | journal 数据层迁移 | **可逆** | 移动 + import 路径改写 |
  | 终态解析改 fail-closed | **可逆** | S-0013 已认领 |
  | preload 信封门加 default | **可逆** | |
  | `memory_v2_store_boundary.py:96` 默认值变更 | **可逆** | 一行 |
  | 删除四个文件 | **单向门（验收意义上）** | 代码可从 git 恢复；**观察机会不可恢复** |
  | 新增 `service.js:935` 的 capability 项 | **单向门** | 相等门，旧 sidecar 配新 Electron 整个启动失败而非降级（S-0016 约束 6，本领域确认为单向门） |
  | 「过程信号 + 新 runtime event 类型」 | **单向门（跨仓）** | 一个类型进了共享协议就不能单方面撤；且触发 quorum 不完整（必要条件 7） |
  | 存量 473 MB 的删除 | **单向门** | 本领域不主张删或不删 |

  **八 · 本领域看到、而 `case.md` 与 `FRAMING` 未列出的未决项（UA-1 … UA-6）**

  - **UA-1 · 帧载荷在产端没有被声明过形状，写入点 ~24 个，默认语义是整字典替换，代码库里已有两处独立绕行。** 本轮最重要的一条。**本案已点名的四个「产出即丢弃」字段、六道静默门、7 丢 6（实测至少 45 丢 41）全部是它的下游症状。** 而本案没有任何一问指向它 —— 最接近的 U-R2 把它误述成「两侧各写一份键表」（E-0068 / E-0069 / E-0070）
  - **UA-2 · `agentRuns` 空态有第二条未排除的机制。** 庭上唯一归因是门链；整字典替换 + `memory_agent_runs` 不在 sticky 集合是第二条。**机制已证、时序未证** —— 本领域不主张它在发生，只主张单一归因未经排他性验证（E-0070，必要条件 8）
  - **UA-3 · 跨数据源的仲裁策略实现在渲染层**（`runStatusRank` / `mergeRuns` 决定七个字段各取哪一侧）。庭上把 journal reload 的问题一律说成「重复实现」，**漏掉了这条**（E-0071）
  - **UA-4 · `PupuUnchainActiveBridge` 的三方法 facade 是装饰性的。** 外部已有 ~13 处 `bridge.preparation.*` 直读，含 3 处与 `persist_host_event` 内部逐字相同的五层链。**直接后果**：E-0066 提议的投影接线 **不新增一类耦合**（本领域据此答复 E-0066 完整性限制 2 的指名质询：接线的接缝形状可接受）；**同时**，任何「给 bridge 加一个 accessor 就把接缝收好了」的处置 **收敛效果为零**（E-0067）
  - **UA-5 · `pupu_legacy` 是本案第四处同词异义**（store owner ∥ chat history 来源格式），且是唯一一处落在 Q10 决策面上的。前三处（`Isolated` / `bundle` / locale 的 `memory`）都在庭上被抓到，这一处没有（E-0074）
  - **UA-6 ·（属本领域触发条件，处置不在本案）`Expert` 层的模型声明是一条组织级单点故障。** S-0021 记载：三次发案、跨两个 case、5 名不同角色，签名相同，**成功率 0/6**。**从结构上看这是一条「共享原语的单点」** —— 每一次需要 `Expert` 鉴定的庭审都要么降级要么挂起，而 `Expert` 依 quorum 第二节不可缺席。**本领域支持 S-0021 的建议（charter 允许声明模型层降级链而非单值），并补一条形状判断：降级链必须把「已降级」作为鉴定的一个可见属性带进产物，而不是只记在 Speaker 的通知里** —— 否则下一份裁定材料里，降级过的鉴定与未降级的鉴定不可区分。**交 `codex` 与 `chief-judge`，本领域不在本案裁**

  **九 · 越界内容清单（标注为参考，不计入本领域结论）**

  形态的产品取舍（过程信号 vs 审计块的用户价值）→ `expert-ux` 与 `0000-0003-2026-0807`；帧语义那一半 `expert-llm` 已出判据，本领域不复述 · 终态词表的具体内容与 `reason` 的处置 → `expert-llm` 与 `code-owner-runtime` · `TOP_LEVEL_KEYS` 的具体改法与持久化后果 → `code-owner-shared-arteries` · `memory_v2_context.py` 的 21 个写入点该不该收敛、`_StickyMemoryV2Admission` 的存废 → `code-owner-runtime` · `memory_v2_unchain_graph_checkpoint.py` 的 13 处 `preparation` 直读是否该收敛 → `code-owner-runtime`（**本领域指出它使 facade 失效，但不主张现在改 —— 那是一次跨 8 个以上模块的重构，不属本案任何一问**）· 九道门的打通与 Electron runner 覆盖 → `code-owner-electron` 与 `code-owner-devtools` · 存量 473 MB 的可弃性 → `code-owner-runtime` 与 `chief-judge` · Memory Agent 配置面的形态与凭据链路 → `code-owner-settings` 与 `expert-security` · 约束表达介质更换 → `code-owner-agents`（本领域支持其 L1 源码级负向断言的方向：**把约束表达在 Q9 已判不动的那根轴上，是构造上防改名的，本领域从结构上背书**）· unchain 仓任何改动 → `code-owner-unchain`（**不在必到名单**；本领域的全部处方 **不请求任何 unchain 侧改动**）· A-010 第三桶与「约束强制点持有人 ≠ 受益人」→ `codex`

- **支撑证据**: E-0067（active bridge 的 facade 已被外部绕过 ~13 次，接缝形状判断）· E-0068（**产端没有键表 —— U-R2 前提更正**）· E-0069（**写入点 ~24 个不是 8 个；至少 45 键丢 41**）· E-0070（**整字典替换 + 两处独立绕行 + `memory_agent_runs` 不在 sticky 集合**）· E-0071（journal reload 是第二数据源的投影，仲裁策略在渲染层）· E-0072（**六道门共享同一条结构性质；「加计数器」处方已被 `event_store` 证伪**）· E-0073（**`pupu_legacy` 是模块默认值不是产品配置；删除会留下活默认值**）· E-0074（`bootstrap_pupu_legacy_history_into_unchain` 不是 store 迁移；第四处同词异义；议案依据第 593 行前提已过期）。援引本案 E-0002 · E-0004 · E-0007 · E-0016 · E-0017 · E-0024 · E-0026 · E-0027 · E-0033 · E-0034 · E-0036 ~ E-0039 · E-0044 ~ E-0045 · E-0053 · E-0055 ~ E-0057 · E-0063 ~ E-0066；S-0002 ~ S-0018 · S-0021；跨案 `0000-0001-2026-0807#S-0005` · `#S-0006`

#### S-0021 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: `expert-llm` 因 charter 指定的模型层配额耗尽而未能入席。`speaker-of-the-house` 依 [quorum 第六节](../../../codex/lifecycle/quorum.md) 的判定权，以替代模型串行重试并重新入席，归档本条备 `codex` 审查。**并报告一项分类落差：本次缺席既不是阻塞记录，也不是 [A-012](../../../codex/adaptations.md) 的运行时故障记录，两栏都套不上**
- **依据**: S-0004, S-0011, 0000-0001-2026-0807#S-0003
- **不确定性**: 模型替代对 `expert-llm` 鉴定可靠性的影响 **未经测量**。已要求其在 `ASSESSMENT` 的 **不确定性** 字段中明确声明该替代是否实质影响其结论。本庭 **不主张** 替代模型的鉴定与 charter 指定模型层等效
- **请求/下一步**: `codex` 若认为该判定不合法，可提出合法性异议（依异议的中止效力，本庭审暂停待 `chief-judge` 裁定）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T20:40:00-07:00
- **影响范围**: `expert-llm` 一名法定必到者

**事实经过**：批次 3 的两份传票并行发出（`expert-llm` · `code-owner-settings`，宽度 2，符合 A-012）。`expert-llm` 立即失败，错误为 `You've reached your Fable 5 limit`。其 charter frontmatter 声明 `model: fable`。同批的 `code-owner-settings`（`model: opus`）未受影响，继续运行。

**本庭为何未预先覆盖该模型层**：前案 `0000-0001-2026-0807#S-0003` 已记载同一故障，并明确声明「模型替代对 4 名 `Expert` 鉴定可靠性的影响未经测量」。本庭据此认为，**在配额可能已恢复的情况下预先降级，等于在没有必要时主动损失鉴定质量**，故先按 charter 声明发出。失败后再降级，是把不可测量的损失限制在确实必要的场合。

**判定**：以 `opus` 替代 `fable` **串行重试一次**（依 A-012 的重试纪律）。理由与前案一致：[quorum 第三节](../../../codex/lifecycle/quorum.md) 规定法定必到者无法参与时庭审 **挂起等待**，不得以「等不到」为由降格或跳过；而本次缺席原因不是 instance 被占用于不可中断的写入参与，**该情形法典未作规定**。以替代模型入席，优于让庭审无限期挂起，也优于在 `Expert` 缺席下推进（后者依 quorum 第二节直接构成不得闭庭的情形）。

**分类落差报告（本条的主要价值，交 `codex`）**

[A-012](../../../codex/adaptations.md) 建立了两栏分类，本次缺席 **两栏都不属于**：

| | 阻塞记录 | 运行时故障记录 | **本次** |
|---|---|---|---|
| 成因 | owner 边界过宽，被并发 case 争用 | 扇出宽度超出运行时容量 | **charter 声明的模型层配额耗尽** |
| 是什么的证据 | 组织过载 | 容量不足 | **charter 的 `model` 声明是一个单点故障** |
| 处方 | 拆 owner | 收窄单次传唤的并发宽度 | **？** |

**本次缺席与并发宽度无关** —— 发生在宽度 2 的批次里，而同批另一人正常运行；也与 owner 边界宽窄无关。A-012 的成立依据是「混计会把容量问题误读成组织过载」，**同理，把模型配额问题记进任一栏，都会误导后续读者去收窄扇出或去拆一个健康的角色，而正确处方是二者皆非**。

**本庭不自行增设第三栏** —— 那是 `codex` 的法典维护权。本条只归档事实与落差，并指出：前案 `#S-0003` 已把同一现象记为 **阻塞记录**，那是 A-012 尚未写入时的权宜；A-012 写入后，该归类应被重新审视，否则法典里会留下一条把模型配额算作组织过载的先例。

**同时登记一条本庭观察**：前案四名声明 `model: fable` 的 `Expert` 同时不可用，本案同一声明再次不可用 —— **这是同一单点故障在两个 case 中的第二次发案**。是否应允许 charter 声明模型层降级链（而非单值），交 `codex` 与 `chief-judge`，不在本案范围。

---

## 补记一 · 同一故障在本案的第二次发案（`expert-architecture`）

**事实经过**：批次 6 的两张票并行发出（`expert-architecture` · `code-owner-chat-core` 定向质询，宽度 2，符合 A-012）。`expert-architecture` 立即失败，签名与 `expert-llm` **完全相同**：`You've reached your Fable 5 limit`。同批的 `code-owner-chat-core`（`model: opus`）未受影响。

**本次比第一次严重，理由必须写明**：`expert-llm` 的 `model: fable` 是其 charter 的声明；而 `expert-architecture` 使用 Fable 5 是一条 **常设指令**（[A-007](../../../codex/adaptations.md) 第 1 项记载：2026-07-13 `chief-judge` 已显式覆盖其 `codex exec -p architect` 转手机制，**架构推理留在 Fable 5 本模型内**）。**以 `opus` 替代，构成对该常设指令的偏离。**

**判定与理由**：`speaker-of-the-house` 仍依 [quorum 第六节](../../../codex/lifecycle/quorum.md) 裁量替代并串行重试一次。权衡如下 ——

- 不替代的后果是 **本案无法闭庭**：`expert-architecture` 是法定必到者，缺席依 quorum 第二节直接构成不得闭庭；而配额何时恢复不可知，庭审将无限期挂起
- 替代的后果是 **一份可能不如常设指令所要求的架构鉴定**
- 两害相权，本庭取后者，**但明确声明：本庭无权豁免一条常设指令，只能在其不可执行时记录偏离并上报**

**故本条特别提请 `chief-judge` 注意**：`0000-0002-2026-0807#S-0020`（`expert-architecture` 的 `ASSESSMENT`）**系以替代模型作出**。若 `chief-judge` 认为架构鉴定必须由指令指定的模型层作出，**本庭建议在配额恢复后重新取得该份鉴定，而不是采信本次结果**。本庭已要求该角色在其 **不确定性** 字段中声明替代是否实质影响结论。

**分类落差同上**：本次同样 **既非阻塞记录、亦非 A-012 的运行时故障记录** —— 发生在宽度 2 的批次里、同批另一人正常，与扇出宽度和 owner 边界均无关。

**发案统计（这是本条的主要价值）**：

| case | 角色 | 结果 |
|---|---|---|
| `0000-0001-2026-0807` | `expert-architecture` · `expert-security` · `expert-llm` · `expert-qa`（4 名同时） | 全部失败，以 `opus` 替代入席 |
| `0000-0002-2026-0807` | `expert-llm` | 失败，以 `opus` 替代入席 |
| `0000-0002-2026-0807` | `expert-architecture` | 失败，以 `opus` 替代入席 |

**三次发案、跨两个 case、涉及 5 名不同角色，签名完全相同。** 迄今 **每一名声明 `model: fable` 的角色，在每一次被传唤时都失败了 —— 成功率 0/6**。

**这已不是偶发。** 本庭的观察是：**`Expert` 层的模型声明与庭审的可用性之间没有任何保护机制** —— 没有降级链、没有预检、没有在传唤前探测配额的手段，失败只能在传票发出后暴露。而 `Expert` 恰恰是 quorum 中不可缺席的一类。**结果是：本仓每一次需要 `Expert` 鉴定的庭审，都要么降级、要么挂起。**

**本庭不自行处置**（charter 的 `model` 字段属 `.claude/agents/**`，依 A-009 由书记员按 `chief-judge` 裁定写入）。交 `codex` 与 `chief-judge`，并建议与本条正文所述的「第三栏分类」一并考虑。

#### S-0022 | SUMMARY | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 闭庭条件已经满足，提交以下忠实汇总。**本庭不推荐批准或驳回，不折算票数，不合并不同理由**
- **依据**: S-0002 … S-0021，E-0001 … E-0077
- **不确定性**: 见 **已知缺口**。另有两项属本庭自身：(i) 传唤第二层以缩减形式执行（S-0003），覆盖面小于法典要求；(ii) 两名 `Expert` 均以替代模型出庭（S-0021），其中 `expert-architecture` 构成对一条常设指令的偏离
- **请求/下一步**: 提交 `chief-judge` 进行议案裁定
- **共识**: S-0006 ↔ S-0007 ↔ S-0016（删除在渲染端与传输端零可观测回归）· S-0007 ↔ S-0015 ↔ E-0004 / E-0012 / E-0022（Q9 文案归属）· S-0007 ↔ S-0015（Q9 识别符判「不做」）· S-0020 ↔ E-0068 / E-0069 / E-0070（帧载荷产端无形状声明）· S-0018 ↔ S-0020（Q1↔Q10 技术耦合论证今日无一存活）
- **分歧**: **核心问题** S-0006 / S-0014 / S-0018 / S-0019 ↔ S-0013 / S-0015 / S-0016 / S-0017 ↔ S-0020（第三种立场：三选一形状错误）· **投影管线落位** S-0006 ↔ S-0013 ↔ S-0020 · **存量 store 处置的必要性** S-0010 / S-0016 ↔ S-0020 不成立 (ii) · **约束表达介质** S-0006 U-5 ↔ S-0017
- **已知缺口**: S-0003（第二层缩减）· S-0021（两名 `Expert` 模型替代）· E-0007 完整性限制（n=1）· E-0077（两读并存未裁）· S-0019 U-C4（休眠条件）· `0000-0001-2026-0807#S-0006` 的 CE-1…CE-8 至今未验证未编号
- **候选方案**: **无。** S-0001 已声明本轮只收意见和建议，不收完整实施方案；全程无 `PROPOSAL` 动作提交。方案庭审为 Full track 第 4 步，另行召开
- **风险**: E-0073（删除引入指向不存在实现的活默认值）· S-0017 U-A1 + S-0006 U-5（约束可无 case、无红灯自行失效）· S-0016 A（第六道信封门零计数零日志）· S-0020（六道门是一个缺失制品的下游症状）· S-0021（`Expert` 层模型声明 0/6 成功率）
- **强制回应事项**: S-0020 不成立 (i) · S-0020 不成立 (ii) · S-0014 有条件成立的 5 条必要条件 · S-0020 有条件成立的 8 条必要条件
- **未答 non-blocking 传票**: 无（本案全程未签发 `Witness` 传票）

---

## 一、闭庭门禁逐项确认（发言协议第 96–107 行）

| # | 门禁项 | 结论 |
|---|---|---|
| 1 | 必到角色均已提交职责要求的输出 | **通过。9/9 全部提交**，无缺席、无弃权。两名 `Expert` 以替代模型出庭，判定与偏离已归档 S-0021 |
| 2 | 每项具证明力事实主张有证据编号，每项证据有验证状态 | **通过。** E-0001…E-0077 全部载有 **验证历史**。**其中「已验证」仅 E-0001/0002/0003/0004/0005/0006/0007/0024/0077（Speaker 取得）与各 owner 自陈实跑者；其余为「未验证」—— 即在提交人边界内取得、Speaker 未独立复核、`evidence-examiner` 全程未参与本案** |
| 3 | 每个 material `QUESTION` 已获回答或列为已知缺口 | **通过。** 两次定向质询均 `ANSWERED`：S-0018（→ E-0045）· S-0019（→ S-0018） |
| 4 | blocking `Witness` 传票均已回应 | **不适用。** 本案未签发任何 `Witness` 传票 —— 无任何出庭角色提出事实缺口四项门禁的申请 |
| 5 | blocking 性质争议均有 `Procedural Judge` 裁定 | **不适用。** 无传票即无争议 |
| 6 | 每项 `OBJECTION` 已标记 | **不适用（形式上）。** 全程无 `OBJECTION` 动作提交。**但实质异议大量存在**，均以 `ASSESSMENT`／`ANSWER` 内的具名反驳形式出现（E-0039 反驳 S-0006 硬条件 · E-0045 反驳 S-0007 前提 · S-0020 反驳 S-0010 升级链 · E-0004 反驳 `0000-0001-2026-0807#S-0005` 等）。**本庭据实记载：本案的异议未走 `OBJECTION` 通道，故亦未经该通道的标记流程；全部保留在原发言内，未被压制、未被合并** |
| 7 | 方案彼此可区分且各带风险/可逆性/验收标准 | **不适用。** 本轮不收方案（S-0001） |
| 8 | `Expert` 的「不成立」与 `Dimension Owner` 的「反对」进强制回应清单 | **通过。** S-0020 两项「不成立」已入清单。无 `Dimension Owner` 出庭（评估对象为组织变更议案，本案不是） |

## 二、传唤第三层 · 集合差检查（本庭不得跳过的一项）

庭上出现过的实体，逐类核对 owner 是否在场：

| 实体类 | 代表 | owner | 在场 |
|---|---|---|---|
| `unchain_runtime/**` | `unchain_adapter.py` · `memory_v2_curator.py` · `memory_v2_context.py` · `memory_v2_store_boundary.py` · `route_chat.py` · `memory_v2_deletion*.py` · `route_catalog.py` | `code-owner-runtime` | ✅ |
| `src/COMPONENTs/chat-bubble/**` | `trace_chain.js` · `memory_v2_journal_reload.js` · `memory_v2_trace_audit.js` | `code-owner-chat-bubble` | ✅ |
| `src/SERVICEs/runtime_events/**` · `chat_storage/**` · `locales/**` | `memory_v2_trace_presenter.js` | `code-owner-shared-arteries` | ✅ |
| `src/PAGEs/chat/**` · `streaming_message_store.js` | `use_chat_stream.js` | `code-owner-chat-core` | ✅ |
| `electron/**` | `service.js` · `unchain_stream_client.js` · `memory_v2_rollout.js` · `channels.js` | `code-owner-electron` | ✅ |
| `src/SERVICEs/memory_agent_settings.js` | 同左 | `code-owner-settings` | ✅ |
| `src/COMPONENTs/agents/**` | `workflow_list.test.js` · `memory_agent_system_panel.js`(已删) | `code-owner-agents` | ✅ |
| `src/BUILTIN_COMPONENTs/timeline/**` | `timeline.js:742` · `:34-48` | `code-owner-ui-primitives` | ❌ **未在场** |
| `unchain:**` | `sqlite_read_v2.py` · `src/unchain/events/**` · `unchain.memory.curator.models` | `code-owner-unchain` | ❌ **未在场** |
| `docs/**` | 议案依据 | **依 A-009 显式无 owner** | 豁免 |
| `~/Library/Application Support/PuPu/**` | 两个 context-v2 store | **现行边界体系未定义** | 见下 |

**三项处置，逐条给依据 —— 本庭只做集合运算，不做实体判断：**

1. **`code-owner-ui-primitives` 不构成补传义务。** 其边界内实体仅作为 **既有约束** 被引用（`timeline.js` 的三态 item 契约），且 `S-0006` 约束 4 明文 **禁止** 为本案改动该边界（「不得为 Q1 去改 `BUILTIN_COMPONENTs/timeline/**`」），修法走本面既有 `ErrorPoint` 约定。**无人请求其边界发生变更**，故不满足传唤条件。
2. **`code-owner-unchain` 不构成补传义务 —— 但附一条本庭必须转达的休眠条件。** `S-0019`（`code-owner-chat-core`）经三点实测（E-0076）判定：**投影路径零 unchain，quorum 完整，可以闭庭**。`S-0014` 引用的 `unchain.memory.curator.models` 是 **既有 typed 词汇表的采纳**，非变更。**但 `S-0019` 明示 U-C4 不撤回、改休眠：裁定正文一旦出现「新增 runtime event 类型」或「改 unchain events 词汇表」，quorum 立刻不完整。** 本庭据此声明：**本案 quorum 的完整性以「裁定不含该两类动作」为条件。若 `chief-judge` 的裁定包含其一，本案须补行传唤 `code-owner-unchain` 后重新闭庭。**
3. **运行时数据目录：本案不阻塞闭庭，但缺口不消失。** `~/Library/Application Support/PuPu/**` 在现行边界体系中 **无 owner** —— 全部 `Code Owner` 的边界形式均为仓内路径 glob，A-009 的显式豁免清单亦未覆盖。本案内 **写它与读它的代码分属 `code-owner-runtime` 与 `code-owner-electron`，二者均在场**，故不构成缺席。已归档为 **边界自愈信号第 5 号**，交 `codex`。

## 三、核心问题 —— 原样呈上，不折算

本庭在 S-0002 要求全体对 (a)/(b)/(c) 直接表态。**结果不是一次投票，是两次改票加一次拒绝作答**：

| 角色 | 发言 | 立场 | 论证支点（**各不相同，不得合并**） |
|---|---|---|---|
| `code-owner-chat-bubble` | S-0006 | **(a)** | 词汇锚点不在删除清单内。**其提名的两个「安全锚点」随后被 E-0039 证伪** |
| `expert-llm` | S-0014 | **(a)**，有条件成立 | 换锚点：`unchain.memory.curator.models` 九个 typed StrEnum ——「词汇不需要发明，只需采纳」 |
| `code-owner-runtime` | S-0007 **→ S-0018** | **(c) → (a)** | **经 E-0045 对质后本人撤回 U-R1**：非「缺产出者」，是「回执已 typed 在内存、缺投影」——接线非新建；(c) 唯一承重论证消失 |
| `code-owner-chat-core` | S-0012 **→ S-0019** | **(c) → (a)** | **改票理由与 S-0018 不同**：其论证从不依赖「缺产出者」，依赖「wire 上无真值到达可观察端」，该前提未失效；真正断的是「唯一能端到端跑通的真值来自即将被删的产出者」中的「唯一」 |
| `code-owner-shared-arteries` | S-0013 | **(c)** | **(a) 被其自身声明的成立条件击败**（E-0039） |
| `code-owner-settings` | S-0015 | **(c)** | 共用前置是「Memory Agent 有没有用户可及的配置面」，两问都绕过去了 |
| `code-owner-electron` | S-0016 | **(c)** | 传输面对时序 **无约束**（两条路线都 0 行），共用前置是本层九道 fail-closed 门的一次性全绿与留证 |
| `code-owner-agents` | S-0017 | **(c) 窄票 + 翻转条件** | 「**我争的是容器不是顺序**」；若裁定采纳 (a) 并把接班配置面写成有 owner、有验收的显式条目，**其反对消失** |
| `expert-architecture` | S-0020 | **拒绝三选一** | 「三选一是错的形状」。四张 (c) 票的「共用前置」**两个同源、一个是本案分案方式的产物、一个真正独立**；判 **(c) 作为「耦合」不成立，作为「容器」能工作但那是分案副产物** |

**本庭对该分歧的三点记载**：

1. **两次改票均发生在定向质询之后，且改票理由互不相同。** 若本庭跳过第 3 阶段直接闭庭，`chief-judge` 收到的将是一份 **建立在其提出者已撤回前提上的 (c) 主张**
2. **票数不是判据。** S-0020 明确不选任何一个，且其「不成立 (i)」判 **(b) 结构上不成立**，与庭上五位给的理由 **全都不同**
3. **`code-owner-agents` 的翻转条件与 `code-owner-settings` 的共用前置指向同一个东西**（接班配置面），但二者 **未互相引用、未协同**。本庭不代为合并 —— 是否同一，属 `chief-judge`

## 四、`chief-judge` 指定本庭特别处置的两件事 —— 处置结果

**第一件（E-0024 推翻 S-0007 结构性推断）** —— 已在 S-0010 首次标注，本条再次标注：`0000-0002-2026-0807#S-0007` 中「那 1,387,400 行 `operations` 是一百多万次没成功的整理」**已被 E-0024 推翻**（100% 为 `memory_v2_deletion:` 前缀，curator 操作零条），提交人自标过须验证，**不采信**。依宪法第七条，该 owner 不负自证其非义务；本庭负责的是不使其以未标注状态进入裁定材料。**S-0007 的其余部分不受影响。**

**同批一并标注的其他失效／撤回**（同一纪律，本庭主动扩用）：

| 编号 | 失效内容 | 由谁、以何推翻 |
|---|---|---|
| `0000-0001-2026-0807#S-0005` Q9 建议第 1 项 | 「用户可见文案属 `src/locales/**`、可现在改、零风险」 | **提出者本人于 S-0007 撤回**，据本案 E-0004；E-0012 / E-0022 独立佐证 |
| `0000-0001-2026-0807#S-0005` 产点计数「6 个」 | 实为 **5 个**（第 6 处是映射表非产点） | **提出者本人于 S-0007 更正**。比例由 4/6 变 4/5，**对同案理由是加强** |
| S-0006 建议处置第 3 项所附「硬条件」 | 两个「安全锚点」 | **E-0039 证伪**：一个在被门关掉的函数体内，一个不是产出者 |
| S-0007 的 U-R1「active 面缺遥测产出者」 | 缺产出者 | **提出者本人于 S-0018 改述**，据 E-0045 |
| S-0012「唯一能端到端跑通的真值来自即将被删的产出者」 | 「唯一」 | **提出者本人于 S-0019 撤回** |
| S-0002 / E-0003 关于 `workflow_list.test.js` 是「Q9 约束强制点」的记载 | **对一半不成立** | **S-0017 更正本庭框定**：约束有「Builder 卡片」与「recipe 节点」两半，**后一半今日零强制** |
| S-0010 把存量处置由建议升格为「已证实的必要条件」 | 该 **推论** | **S-0020 不成立 (ii)** 指其中间少一步。**该项直接针对本庭签发的通知，本庭不作辩解，原样列入强制回应清单**，并以 E-0077 补齐其自陈唯一未核实项（两读并存，本庭不择其一） |
| E-0024「electron 层无代码认得存量 `pupu_legacy`」 | **说轻了** | **S-0016 更正**：`MEMORY_V2_REQUIRED_SCHEMA_VERSION = 2` 那道相等门认得它，处置是判整面 degraded 并使下游硬失败 |
| E-0026 的静默门计数「三道」 | 计数与性质 | **S-0019 自行更正为四道**，第四道是 **改写门** 非丢弃门 |

**第二件（分歧不得压平）** —— 见本条第三节。本庭额外声明：**S-0020 的「拒绝三选一」不是弃权**，它是一个带完整论证的第三立场，已按 `Expert` 输出契约给出「有条件成立」加两项「不成立」。**本庭未将其折算为任何一方的票。**

## 五、本庭自身的程序瑕疵（一并呈报，不隐去）

1. **编号同号冲突（本庭之过）。** `S-0019` 一度被同时分配给本庭的程序通知与 `code-owner-chat-core` 的 `ANSWER`。发现时对方尚未写入，通知已改号为 `S-0021`。**「编号一经分配不可变更、不可复用」是本庭的职责，本次是本庭自己险些违反它**
2. **传唤第二层以缩减形式执行**（S-0003），覆盖「抽取漏掉」，不覆盖「边界写窄、须本人辨认」
3. **两名 `Expert` 以替代模型出庭**（S-0021），其中 `expert-architecture` 构成对一条常设指令（A-007 第 1 项）的偏离。**本庭建议：若 `chief-judge` 认为架构鉴定必须由指令指定的模型层作出，应在配额恢复后重新取得 S-0020，而非采信本次结果**
4. **`evidence-examiner` 全程未参与。** 77 条证据中大多数为「未验证」。本庭未启动证据审查程序 —— 依角色职责，本庭 **有权** 要求其审查，本案未行使

#### S-0023 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **议案庭审闭庭。** 全部闭庭门禁已逐项确认（S-0022 第一节），传唤第三层集合差检查已执行（S-0022 第二节），quorum 9/9 满足
- **依据**: S-0022
- **不确定性**: 本案 quorum 的完整性 **以「裁定不含『新增 runtime event 类型』或『改 unchain events 词汇表』两类动作」为条件**（S-0019 U-C4 休眠条件）。若裁定包含其一，须补行传唤 `code-owner-unchain` 后重新闭庭
- **请求/下一步**: 连同 `record.md`（S-0001…S-0023）与 `evidence.md`（E-0001…E-0077）提交 `chief-judge` 进行议案裁定
- **通知类型**: CLOSURE
- **生效时间**: 2026-08-07T22:20:00-07:00
- **影响范围**: case `0000-0002-2026-0807` 议案庭审阶段

**A-012 收窄实践的完整验证数据（本庭第二项交付）**

| 指标 | `0000-0001-2026-0807`（对照） | 本案 |
|---|---|---|
| 单次并发宽度 | **14** | **2**（全程六批，无一批超出） |
| instance 死亡 | **9**（含 3 个勘察子 instance） | **0** |
| 完整交付 | 2 / 14 | **11 / 11**（9 名必到 + 2 次定向质询） |
| 子 instance 派生 | 3（全部死亡） | **0** —— 全部出庭角色主动自陈遵守 |
| 单批墙钟 | —（10 分钟内崩溃） | 约 **16–28 分钟**／批 |
| 庭审总墙钟 | —— | 约 **4 小时**（六批串行 + 两次模型替代重试） |

**结论：A-012 的两条实践在本案得到完整验证，且效果是决定性的 —— 死亡率由 9/14 降至 0/11。** 「不得派生勘察子 instance」一条被全部 11 名出庭者遵守并主动披露。

**代价已如实计量**：串行化把庭审墙钟从「一次并发」变为「批次数 × 单批时长」。本案约 4 小时。**必到名单规模因此不只是 quorum 问题，也是排期问题** —— `0000-0004-2026-0807` 的必到名单为 7 人（4 批），其 `case.md` 已预写「若 A-012 尚未被验证有效，本案应最后开庭」；**本条为该判断提供了肯定的数据**。

**三条本案新增的运行时观察，交 `codex`**：

1. **`Expert` 层的模型声明是一个未被保护的单点故障。** 三次发案、跨两个 case、5 名不同角色、签名完全相同；**迄今每一名声明 `model: fable` 的角色在每一次被传唤时都失败，成功率 0/6**。无降级链、无预检、失败只能在传票发出后暴露，而 `Expert` 恰是 quorum 中不可缺席的一类（详见 S-0021）
2. **该类缺席既非阻塞记录亦非 A-012 运行时故障记录。** 两次均发生在宽度 2 的批次内、同批另一人正常，与扇出宽度及 owner 边界均无关。**增设第三栏属 `codex` 的法典维护权，本庭只报事实与落差**
3. **庭审的返回通道只有 agent 的最终输出**（S-0009）；**Speaker 无法在不淹没自身上下文的前提下观测在途 instance 存活**（transcript 即全量 JSONL，本庭曾因此误判批次 1 已停止）。**本案采用的规避方式是让发言人自行写入 `.inbox/`，Speaker 分配编号、校验格式、拼接归档**（S-0011）—— 该方式同时更贴合「不得代为改写」的协议要求，建议 `codex` 考虑是否收入常规实践
