---
case_id: 0000-0001-2026-0807
updated_at: 2026-08-07T16:06:00-07:00
---

# 发言记录

追加式。已归档发言不得原地改写；内容有误以 `WITHDRAWAL` 撤回后另提替代发言。

## 议案庭审

#### S-0001 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 议案庭审开庭
- **依据**: 无
- **不确定性**: 无
- **请求/下一步**: 进入议题框定
- **通知类型**: OPENING
- **生效时间**: 2026-08-07T16:06:00-07:00
- **影响范围**: case `0000-0001-2026-0807` 全部出庭角色；本次庭审只收 **意见和建议**，不收完整实施方案（方案庭审为 Full track 第 4 步，另行召开）

#### S-0002 | FRAMING | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 本次议案庭审框定如下；待裁问题、范围、已知事实、已知缺口、必到名单与交付以本条为准
- **依据**: E-0001, E-0002, E-0003
- **不确定性**: E-0001 未入库且 `docs/**` 依 A-009 显式无 owner，其内容主张无 owner 背书；引用它的具证明力主张须自行核对到代码、命令或 DB
- **请求/下一步**: 13 名法定必到角色按各自输出契约独立提交 `ASSESSMENT`
- **待裁问题**:
  - **Q1** Memory V2 在 trace chain 中如何体现？现有 presenter 已支持 Complete/Partial/Legacy/Unavailable、context pressure、checkpoint/artifact/handoff ref、折叠 Curator 子树、candidate/review/promotion 状态 —— 这套够不够，缺什么，哪些是噪音
  - **Q2** 每一个 chat 的 `Inspect Memory` UI 要不要优化，优化成什么形态？当前 V2 chat 打开它看到的是 V1 空向量
  - **Q3** UI Testing modal 要不要为 Memory V2 加东西？加什么
  - **Q4** 除上述之外，产品面还有哪些未定项 —— 由各出庭角色从自己的边界内补出，不由提出者预先穷举
  - **Q5** V2 Inspector 是否按 chat admission 分流（Legacy → 现有 PCA modal，V2 → 新 Workspace Inspector）
  - **Q6** 是否新增严格 scope-bound 只读 `getTaskState` 四层契约（Flask route → Electron service/IPC → preload → renderer bridge）
  - **Q7** 是否新增 scope-bound `listArtifacts` 契约，还是仅从 journal/entry/handoff 已披露 refs 打开 artifact
  - **Q8** empty state 如何区分「V2 正常但尚无 entry」与「V2 unavailable/partial」
  - **Q9** 命名债务（`memory_agent_settings.js`、`memory_v2_unchain_agent_factory.py`、"Memory Agent" 文案）是否清理、何时清理
  - **Q10** PuPu 旧 fallback 实现（`memory_v2_toolkit.py` / `memory_v2_curator.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` 及 `unchain_adapter.py` 内的 legacy 构建路径）何时物理删除
- **范围**:
  - **在范围内**: Memory V2 **产品面** 尚未裁定的事项 —— 即 Q1–Q10 及各角色边界内补出的未定项。本轮收 **意见和建议**（缺什么、该定成什么样、约束是什么、风险在哪），不收完整实施方案
  - **不在范围内**: (a) 「要不要做 Memory V2」本身 —— 不是本案争点；(b) 议案依据 §3 列为 **已锁定架构共识** 的原则（五层共享一个数据平面、Memory 不是 Builder 里的 Agent、权限不用角色枚举、长期记忆永远需要用户确认、同进程无 capability 隔离）—— 要推翻须另行立案；(c) 完整实施方案的步骤、可逆性与验收标准 —— 属方案庭审；(d) 发版动作与发布认证 —— 本案不含
  - **约束（议案自带，出庭角色须遵守）**: Q9 的命名清理 **不得重新引入 Builder 卡片或 recipe 节点**；Q10 的物理删除有既定前置顺序（E-0001 §13）
- **已知事实**:
  - 议案依据为 `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`（E-0001），文档自评 P0 总体约 70%，其中 UI/Trace/Inspector 65%，Memory 写入/整理/提升/召回闭环 55%，Canary/生产 rollout 25%
  - 本机 official store（`~/Library/Application Support/PuPu/memory_v2/context_v2.sqlite3`）当前实测：`executions=1`、`events=17`、`spaces=2`、`entries=0`、`artifacts=4`、`candidates=0`、`consolidation_jobs=0`、`promotion_proposals=0`（E-0002，Speaker 于开庭时以 immutable URI 复核，与 E-0001 §10 一致）
  - PuPu HEAD 为 `14ca3ccc`，unchain HEAD 为 `a4e69f41`，`unchain_runtime/unchain-core.lock.json` 锁定 `a4e69f41`、contract version `1`，握手一致（E-0003）
  - E-0001 §2 记录的 PuPu 锚点 `cd56dc0f` 与当前 HEAD 之间只有一次提交（`14ca3ccc`，组织改制），产品代码零变更（E-0003）；E-0001 的代码锚点对本次庭审仍然成立
  - 现有 renderer 侧受控能力覆盖 status/events/content/session-head 只读、session rebase、spaces/tree/entries/search/candidates/reviews/jobs/promotions 的列举或读取，以及 candidate/candidate-review/promotion 的受控 decision；**没有** entry create/update/delete、consolidation-job 控制、generic append、任意 URL/namespace、Curator lease、plaintext secret read（E-0001 §7.3，待各 owner 核实到代码）
  - 右键 `Inspect Memory` 当前链路为 `side_menu_context_menu_items.js` → `memory_inspect_modal.js` → `getMemoryProjection(sessionId)` → `/memory/projection` → `route_projection.py` → Qdrant/PCA + V1 profile JSON（E-0001 §8，待各 owner 核实到代码）
- **已知缺口**:
  - **议案依据本身未入库、且无 owner。** E-0001 是 untracked 文件，`docs/**` 依 [A-009](../../../codex/adaptations.md#a-009--显式无-owner-清单) 显式无 owner。本案主要证据没有 owner 为其真实性背书 —— 引用它的具证明力主张须自行核对到代码、命令或 DB，核实不了必须写 **未核实**
  - **跨会话闭环未证明。** `entries=0`、`candidates=0`、`consolidation_jobs=0`、`promotion_proposals=0`（E-0002）。任何关于「用户在 Inspector 里会看到什么」的判断目前都没有真实数据支撑；据此提出的形态主张须标注为基于空态推演
  - **代码情报索引落后于 HEAD**（E-0001 §12，且增量 analyze 曾遇 `file_fts` inconsistency）。依赖调用图取证的角色须先确认索引新鲜度，不得把旧图当当前事实
- **必到角色与交付**:

  **传唤第一层 · `Code Owner` 路径 glob 机械命中（8 名，均交 `ASSESSMENT`）**

  | 角色 | 边界命中依据（议案实体 → 该角色边界声明） |
  |---|---|
  | `code-owner-unchain` | `unchain:**` ← `src/unchain/memory/**`、`src/unchain/context/**`、`src/unchain/persistence/sqlite_*_v2.py`、`src/unchain/memory/toolkit/policy.py`（Q1/Q6/Q7 的数据与语义来源，Q10 的删除对象在 PuPu 侧但契约在库侧） |
  | `code-owner-runtime` | `pupu:unchain_runtime/**` ← `route_memory_v2.py`、`memory_v2_unchain_active_bridge.py`、`context_memory_v2_capability.py`、`route_projection.py`、`memory_v2_toolkit.py` / `memory_v2_curator.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` / `unchain_adapter.py`、`memory_v2_unchain_agent_factory.py`（Q5/Q6/Q7/Q9/Q10 的第一落点） |
  | `code-owner-electron` | `pupu:electron/**` ← `main/services/unchain/service.js`、`shared/channels.js`、`preload/bridges/context_v2_bridge.js`、`main/services/unchain/memory_v2_rollout.js`、`main/services/memory_vault/**`（Q6 四层契约的中间两层） |
  | `code-owner-chat-bubble` | `pupu:src/COMPONENTs/chat-bubble/**` ← `trace_chain.js`、`memory_v2_journal_reload.js`、`memory_v2_trace_audit.js`、`memory_v2_pending_reviews.js`（Q1 的第一落点） |
  | `code-owner-shared-arteries` | `pupu:src/SERVICEs/runtime_events/**` ← `memory_v2_trace_presenter.js`；`pupu:src/SERVICEs/bridges/**` ← `context_v2_bridge.js`、`memory_vault_bridge.js`；`pupu:src/locales/**` ← Q8/Q9 的文案（Q1/Q6/Q7/Q8/Q9 的公共动脉侧） |
  | `code-owner-devtools` | `pupu:src/COMPONENTs/ui-testing/**`（Q3 的第一落点）；`pupu:src/SERVICEs/test_bridge/**`、`pupu:src/electron/**`（E-0001 §15.5 的 focused 调用形态）、`pupu:package.json`（`start:electron` 的 `PUPU_FEATURE_MEMORY_V2=all`） |
  | `code-owner-chat-core` | `pupu:src/COMPONENTs/side-menu/**` ← `side_menu_context_menu_items.js`（`Inspect Memory` 入口与 modal 挂载接口，Q2/Q5）；`pupu:src/PAGEs/chat/**` ← `hooks/secret_capture.js`、`hooks/use_secret_capture_gate.js`；`pupu:src/SERVICEs/turn_mutation_outbox.js` ← E-0001 §7.2 的 edit/resend/delete 语义 |
  | `code-owner-agents` | `pupu:src/COMPONENTs/agents/**` ← `pages/recipes_page/workflow_list.test.js` 与「不展示 Memory Agent 卡片 / 不增加 Memory Adapter 节点」的现状锁定（Q9 的约束落点） |

  **传唤第一层 · `Expert` 触发条件命中（5 名，均交 `ASSESSMENT`；结论只允许 成立 / 不成立 / 有条件成立）**

  | 角色 | 触发条件命中依据 |
  |---|---|
  | `expert-architecture` | 「跨两个及以上 code-owner 边界」（本案跨 8 名）+「触及跨仓库接口（PuPu↔unchain 的 memory 契约）」+「新增或移动一个功能的落位」（Q2/Q5 的 Inspector 落位） |
  | `expert-security` | 「IPC channel 或 bridge 面的增删改」（Q6/Q7 的新增契约）+「密钥与凭据（存储、迁移、日志与帧中的泄露面）」（Vault 与 secret 不进 journal/Trace/memory 的边界） |
  | `expert-llm` | 「tool schema 的形状与措辞」（`memory_propose` 与 `unchain.memory.proposal_policy.v1`）+「流式帧语义」（Q1 的 Trace 帧）+「检索参数」（long-term recall 作为不可信引用内容进入 context 而不进 system/developer prompt） |
  | `expert-ux` | 「布局与视觉层级」+「交互状态（含 empty）」（Q1/Q2/Q8）+「主题与 isDark 明暗对等」 |
  | `expert-qa` | 「一个改动的回归面判定」+「测试策略与覆盖范围的取舍」+「这个证据够不够证明它没坏」（Q3 与 E-0001 §11 的证据充分性；`.js`/`.cjs` 对等） |

  **未命中，不进必到名单（理由登记，供第二层认领期与第三层门禁复核）**

  - `expert-business` —— 触发条件五项（定价/授权/变现、分发曝光、首次体验与留存、增长指标读法、对外发布）均未命中；本案不含发版动作
  - `dimension-owner-*` ×4 —— 评估对象是「组织变更议案」，本案不是组织变更
  - `task-owner-release-certification` —— task 名 `release-certification` 未在议案中出现；本案不跑发布认证
  - `knowledge-owner-*` ×4 —— 各自知识库路径均未命中

  **每名必到角色本轮须交付**（在 `ASSESSMENT` 的角色输出契约字段内完成，不另开动作）：

  1. **Q1–Q10 中落在本角色边界/领域内的编号**，逐条给出意见；不落在自己身上的编号明确写「不落在我这里」
  2. **Q4 的本角色答案**：本角色看到、而 `chief-judge` 未列出的产品面未决项
  3. 每项具证明力的主张给 **出处**（`file:line` / 可复现命令 / DB 查询）；核实不了写 **未核实**
  4. 越出本角色边界/领域的看法，**标注为参考**，不计入本角色结论

#### S-0003 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 4 名法定必到 `Expert` 因 charter 指定的模型层配额耗尽而无法入席，`speaker-of-the-house` 依 [quorum 第六节](../../../codex/lifecycle/quorum.md) 的判定权，以替代模型重新入席，并归档本条以备 `codex` 审查
- **依据**: 无
- **不确定性**: 模型替代对 4 名 `Expert` 鉴定可靠性的影响未经测量。已要求 4 人各自在其 `ASSESSMENT` 的 **不确定性** 字段中明确声明该替代是否实质影响其结论
- **请求/下一步**: `codex` 若认为该判定不合法，可提出合法性异议（依异议的中止效力，本庭审暂停待 `chief-judge` 裁定）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-07T16:12:00-07:00
- **影响范围**: `expert-architecture`、`expert-security`、`expert-llm`、`expert-qa` 四名法定必到者

**事实经过**：首轮 13 份传票并行发出后，上述 4 人立即失败，错误为 `You've reached your Fable 5 limit`。四人的 charter frontmatter 均声明 `model: fable`（`expert-ux` 与 `expert-business` 声明 `model: opus`，8 名 `Code Owner` 声明 `model: opus`，均未受影响）。

**判定与理由**：[quorum 第三节](../../../codex/lifecycle/quorum.md) 规定，法定必到者确实无法参与时庭审 **挂起等待**，不得以「等不到」为由降格或跳过。本次缺席原因不是 instance 被占用于不可中断的写入参与，而是 **charter 指定的模型层不可用** —— 该情形法典未作规定。`speaker-of-the-house` 认为：以替代模型入席，优于让庭审无限期挂起或让本案在 4/5 `Expert` 缺席下推进（后者依 quorum 第二节直接构成不得开庭的情形）。故裁量以 `opus` 替代 `fable` 重新签发 4 份传票。

**阻塞记录**（依 quorum 第三节归档）：

| 项 | 值 |
|---|---|
| 等待方 case | `0000-0001-2026-0807` |
| 被等待的角色 | `expert-architecture`、`expert-security`、`expert-llm`、`expert-qa` |
| 等待起点 | 2026-08-07T16:08:00-07:00（首轮传票失败） |
| 等待终点 | 2026-08-07T16:12:00-07:00（替代模型重新入席） |
| 阻塞时长 | 约 4 分钟 |
| 阻塞原因 | charter 指定模型层配额耗尽，非 owner 边界过宽 |

**本条不构成「该 owner 边界过宽应予拆分」的立案依据** —— 阻塞原因与边界宽窄无关。它构成的是另一类信号：**charter 的 `model` 声明是一个单点故障**，四名 `Expert` 同时不可用是因为它们指向同一个模型层。该信号交 `codex` 与 `chief-judge` 处置，不在本案范围内。

#### S-0004 | SUMMONS | speaker-of-the-house → code-owner-settings
- **阶段**: 议案庭审
- **结论**: 补行传唤 `code-owner-settings`。其已声明边界内有两个实体被议案直接点名，立案时的传唤第一层机械匹配遗漏了它；依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，其为 **事后认定的法定必到者**
- **依据**: E-0004, S-0002
- **不确定性**: 无。两处命中均已核实到文件系统
- **请求/下一步**: `code-owner-settings` 按 `Code Owner` 输出契约提交 `ASSESSMENT`；对已完成部分保留完整发言权
- **问题**: 见传票正文（Q1–Q10 全文，重点 Q2 / Q5 / Q8 / Q9）
- **受影响事项**: Q2（`Inspect Memory` UI 的形态）、Q5（admission 分流的落位）、Q8（empty state）、Q9（`memory_agent_settings.js` 的命名清理成本与是否涉及存储键迁移）
- **已查来源**: `.claude/agents/pupu/code-owner-settings.md` 的所有权边界声明；文件系统核实 `src/COMPONENTs/memory-inspect/`（含 `memory_inspect_modal.js`、`memory_inspect_modal.test.js`）与 `src/SERVICEs/memory_agent_settings.js` 均存在
- **本人知情理由**: 不适用（本条非 `Witness` 传票，是 owner 补行传唤）
- **阻塞状态**: blocking —— 缺其 `ASSESSMENT` 则 Q2 与 Q9 的第一落点无 owner 在场，依传唤第三层不得闭庭

**命中依据（机械匹配，非判断）**：

| 议案实体 | `code-owner-settings` 的边界声明条目 | 关联待裁问题 |
|---|---|---|
| `src/COMPONENTs/memory-inspect/memory_inspect_modal.js` | `pupu:src/COMPONENTs/memory-inspect/**` | Q2（第一落点）、Q5、Q8 |
| `src/SERVICEs/memory_agent_settings.js` | `pupu:src/SERVICEs/memory_agent_settings.js` | Q9（议案原文按文件名点名） |

**边界自愈信号 · 第 1 号（分类说明）**：本条 **不是**「边界声明写窄」。`code-owner-settings` 的边界声明 **正确覆盖** 了这两个实体 —— 缺陷在于立案时的传唤第一层 **机械匹配未走完全部边界声明**。因此修正对象不是该 owner 的 charter，而是立案环节的匹配执行。该信号交 `codex` 与 `chief-judge` 处置。

#### S-0005 | ASSESSMENT | code-owner-runtime → case
- **阶段**: 议案庭审
- **结论**: Q5/Q7/Q8 在本端 **基本不需要新契约** —— 判据与取数路径都已存在且已路由；真正需要新建的只有 Q6，而它不是四层契约，是 **五层**，第 0 层在 unchain 仓库（`sqlite_read_v2` 没有 task-state 只读面）。Q10 的前提需要更正：那四个文件不是「不可达 fallback」，是 `pupu_legacy` 数据平面的 **唯一实现**，删除是弃用一个 store owner，不是清理死代码
- **依据**: E-0005 ~ E-0015；E-0001 §7.3 / §8 / §12 / §13 逐条核对，两处与代码不符、一处措辞需更正
- **不确定性**: (a) `get_session_head` 在 `session_id` 为空时的行为未实测，Q5 判据若要用它必须先确认；(b) `pupu_legacy` schema 的存量安装是否真实存在，只能证明当前代码不会新产生，无法证明历史版本没产生过；(c) Trace 侧渲染取舍（Q1）越出本端边界，只对 **产帧端** 表态
- **请求/下一步**: 把 E-0011 交给 `code-owner-unchain` 对质 —— Q6 能不能做，取决于 unchain 是否愿意出一个 **只读** task-state 投影；若答案是「用现有 `bind_task_state`」，本端 **不成立**
- **评估结论**: 见下逐问

**Q1 — 部分落在本端（产帧端）。**
presenter 的四态（Complete/Partial/Legacy/Unavailable）不是后端唯一在产的状态。后端另产一条正交轴：Curator 的 `status: "Isolated"` + `reason` + `worker_status`，产点在 `unchain_adapter.py:938-945` 与 `memory_v2_curator.py:450/479/504/919`。其中 `Isolated` 有渲染落点（`memory_v2_journal_reload.js:130` 映射 `memory.curator.isolated`），但 `worker_status`（`"NotScheduled"`，`unchain_adapter.py:945/1114`）在 `src/` 中 **零引用 —— 产出即丢弃**。

意见：这套 **不够**，缺的不是状态种类，是 **分层**。「本轮 V2 编译是否完整」（四态）与「本轮产生的记忆有没有被整理」（Curator 轴）是两件事，现在被拍平在同一条 trace 上。噪音判断不表态（属 chat-bubble）。

**与 Q10 的耦合，无人指出**：6 个 `Isolated` 产点里有 4 个在 `memory_v2_curator.py` —— **Q10 要删的文件**。Q1 若基于当前 trace 词汇立规格，规格会挂在待删代码上。**两问必须同时裁。**

**Q2 — 服务端那一半落在本端。**
Q2 的病比「看到 V1 空向量」更准确的描述是：**`/memory/projection` 在所有失败路径上都返回 HTTP 200 + `{"points": [], "variance": [0,0]}`**（`route_projection.py:69-70`，返回点 393/397/401/448/452）。V2 chat 看到的不是「错误」，是一个 **格式完好的空成功**。renderer 今天 **结构上无法** 区分三件事：V2 chat 开错了 Inspector / V1 chat 确实还没记忆 / Qdrant 挂了。

意见：**保留入口 + 按 admission 分流是对的**，但必须附带约束 —— **新 Inspector 不得继承这个 200-空成功的形状**。

**Q3 — 不落在本端**（`src/COMPONENTs/ui-testing/**` 属 devtools）。仅提供一条服务端约束供其定案：`/context/v2/status` **蓄意不返回 counts**，且被测试锁死（`tests/test_route_memory_v2.py:56` `assertNotIn("counts", ...)`）。任何依赖「V2 现在有几条 entry」的测试面板今天拿不到该数，需先裁 counts 该不该开。

**Q5 — 落在本端。判据服务端已经能给，而且已经路由了。**

`GET /context/v2/session/head` 已实现 **三路判别**（`route_memory_v2.py:288-301`）：

| 服务端返回 | 语义 | 分流去向 |
|---|---|---|
| 200 | 该 chat 有 V2 durable state | V2 Workspace Inspector |
| 404 `context_v2_not_found` | 从未有过 V2 state | Legacy PCA modal |
| 503 `context_v2_mutation_not_ready`（retryable） | 有 V2 state 但未就绪 | 既不能开 V2 也不能落 Legacy |

支撑它的是 `_context_v2_chat_state_exists_read_only`（`route_memory_v2.py:113-211`）—— 一个 `PRAGMA query_only=ON` + `mode=ro` 的探针，**不开任何一个 store、不写**。sticky admission 落在 `pupu_context_v2_admissions` / `host_generation_chat_bindings` / `chat_deletion_tombstones` 三张表（同文件 164-187）。

结论：**Q5 分流不需要新契约。** `contextV2Bridge.getSessionHead` 已存在（`src/SERVICEs/bridges/context_v2_bridge.js:105`）。

两个必须写进裁定的 **约束**：
1. **第三态（503 not_ready）必须有独立 UI 落点。** 今天没有。把它当成「Legacy」是错的 —— 那会让用户在一个已经有 V2 记忆的 chat 上看到 V1 空向量，正是 Q2 要修的病
2. 该探针目前只被 generation 路径调用（`route_memory_v2.py:237, 292`）。若要它当 Inspector 的分流判据，需确认 `get_session_head` 在 `session_id` 为空时可用 —— **未核实**。若不可用，最小改动是把这个已有探针单独路由成 `GET /context/v2/chat/<id>/admission`，**这比 Q6 便宜一个数量级**，且不引入新读能力

**Q6 — 落在本端。这是本案唯一真需要新建的东西，但它不是四层。**

本端期待，逐项写具体（供与 `code-owner-electron`、`code-owner-shared-arteries` 对质）：

- **暴露什么**：`GET /context/v2/memory/task-state`，只读、单数（一个 chat scope 一个 pinned state）。不接受 `space_id`、不接受 `binding_id`、不接受 `namespace` —— 全部服务端注入
- **scope 怎么绑**：唯一入参是 query 的 `owner_chat_id`，与现有全部读路由同形（对照 `route_memory_v2.py:1085, 1114, 1126`）。绑定实体由 `_read_runtime_for_store_owner(owner_chat_id=...)`（`route_memory_v2.py:315-361`）解析
- **谁注入 binding**：**host，不是 renderer，也不是模型。** `open_pupu_unchain_memory_v2_reader` 已从 durable ownership lifecycle 解析出唯一 `binding_id` 并用它 bind `SQLiteCuratorQueryV2Store`（reader 工厂，`memory_v2_unchain_read_adapter.py:570-650`）。**task state 的 scope key 恰好就是 `binding_id`**（unchain `sqlite_memory_v2.py:463` `bind_task_state(binding_id=, state_id=)`）。故 host 侧 **零新增绑定逻辑**
- **返回形状**：`{owner_chat_id, revision, objective, success_criteria[], constraints[], decisions[], questions[], plan[], refs[]}`，其中 `refs[]` 必须经 `_route_resource_uri` 转成 `pupu://…` 字符串（同 `_route_entry` 的既有处理，`memory_v2_unchain_read_adapter.py:505-515, 532-568`），**不得漏原始 `ResourceRef` dict 出去** —— 那会把 unchain 内部 schema 变成 IPC 契约

**Q6 做不成四层，除非 unchain 先动。**
`SQLiteContextV2ReadService`（reader 唯一的只读投影）**没有任何 task_state 读方法** —— `grep task_state src/unchain/persistence/sqlite_read_v2.py` 零命中（E-0011）。PuPu 侧唯一的 task-state 绑定 `memory_v2_task_state_adapter.py` 走 `memory_v2_workspace_adapter` + `context_memory_v2_repository`，即 **`pupu_legacy` 平面**，且只被测试引用 —— 在 unchain 平面上是废的。

真实层数是 **5**：`unchain 只读投影` → Flask route → Electron service/IPC → preload → renderer bridge。

**明确反对项**：不要用现有 `bind_task_state()` 凑数。它返回 `_SQLiteBoundPinnedTaskStateRepository` —— **写能力仓储**，Curator 更新用的就是它。整个 `/context/v2/**` 读面的不变式是「读路径拿到的对象结构上不能写」（`SQLiteContextV2ReadService`、探针的 `query_only=ON`）。把写仓储塞进读路由会破掉这条不变式，而它现在是 renderer 只读保证的 **结构性依据**，不是约定。宁可让 unchain 出只读投影，也不要在 host 层用「我保证只调 read 方法」补。

**附带 contract 后果**：lock 是 `{repository, revision, context_memory_contract:1}`，字段集被 `_validated_lock` 精确校验（`context_memory_v2_capability.py:60`），packaged 下 revision 不匹配 fail-closed。unchain 一旦为此前进，**必须同步更新 lock 并重跑 capability/readiness** —— 这正是 `82a609db` 修的那次真实故障。Q6 的成本里要算上这一次跨仓握手。

**Q7 — 落在本端。回答：不新增 `listArtifacts`。**

「现有 bridge 有没有 artifact 列表接口」：**没有**，且 `route_memory_v2.py` 全文 **`artifact` 零命中**（E-0005）。

「从已披露 refs 打开 artifact，服务端支持到什么程度」：**完全支持，今天就能用。** 关键机制是 `_route_json_value`（`memory_v2_unchain_read_adapter.py:517-530`）—— 递归扫描 event payload，把任何 unchain `ResourceRef` 就地翻译成 `pupu://…` 字符串。journal 事件流出时 artifact ref **已经是** `pupu://artifact/<id>@<rev>`。`_route_entry`（同文件 532-568）同样把 entry 的 `source_refs` 与 `content_ref` 输出成 `pupu://` URI。

回读端 `GET /context/v2/content/<path:ref>` 支持 4 种 URI（正则见同文件 48-62）：`pupu://artifact/<id>@<rev>` / `pupu://memory/<space>/<entry>@<rev>` / `pupu://context/checkpoint/<id>` / `pupu://memory/review/<id>@<rev>/(diff|proposed)`，且带 offset/limit 分页。

结论：**refs 路线是已建成的完整闭环**，`listArtifacts` 是净新增攻击面换一个「浏览」功能。反对新增，理由不只是省事 —— `electron/shared/channels.js:120-145` 有一段成文硬边界，明写「**每个能力是一个具名 channel 对应一个固定 Flask 路由，没有 generic channel**」，且「space/entry mutation 等内部面 **蓄意不在此列**」。`listArtifacts` 是一个无 chat 语义锚点的枚举面，与这段已写下的契约方向相反。若产品坚持要独立浏览，应先说明 **用户在什么场景下需要一个不挂在任何消息上的 artifact 列表** —— 该用例目前没人给出。

**Q8 — 落在本端。回答：是**，两个响应在 route 层今天 **不可靠区分**；且这与 §12 的 500 归一 **是同一个病的两半，不是同一条**。

实测（E-0006，可复现脚本 + 输出）：

| 场景 | 实测响应 |
|---|---|
| V2 正常但尚无 entry | `200 {"entries": [], "has_more": false}` |
| ref 不存在 / 超出绑定 scope | `500 {"code": "context_v2_failed"}` |
| workspace 超出绑定 scope | `500 {"code": "context_v2_failed"}` |

根因是类型层的：`PupuUnchainMemoryV2ReadError` 继承 `RuntimeError`（`memory_v2_unchain_read_adapter.py:65`），**不是** `MemoryV2Error`，实测 `issubclass(...) == False`。而 `_endpoint` 只对 `MemoryV2Error` 做精确映射，其余一律 `except Exception → 500 context_v2_failed`（`route_memory_v2.py:96-104`）。route 里对该异常的 `try/except` 只有两处，且都在 **reader 打开阶段**（335-361、811-831）；**reader 方法内部抛的全部漏到 500**。

**§12 那条与 Q8 部分重合但不等同**：
- Q8 的「正常但空」↔「异常」，在 **200 vs 非 200** 这一层 **已经可分**
- 真正不可分的是 **非 200 内部**：「V2 unavailable/partial」「你要的东西不存在」「后端真崩了」三者塌成同一个 `context_v2_failed` 500。所以 Q8 的 **第二个分支在线上无法表达**，但原因不是被空态吃掉，是 **错误侧没有词汇表**

**修法在同一个文件里已经现成**：`_generation_operation_for_store_owner` 已做了 code→status 的精确映射（404 / 503-retryable，`route_memory_v2.py:288-312`）。读路径缺的就是同一套处理。这是补齐，不是发明。

**并且这不是新代码的问题** —— `tests/test_route_memory_v2.py` 全文 **没有任何一条断言检查 500 或错误码**（E-0006）。该行为今天无测试保护。

**Q9 — 后端那一半落在本端。回答：暂不清理；若要清理必须拆成两件事，且识别符那件事应该判「不做」。**

核对结果与「命名债务」这个措辞不符。`memory_agent` **不是名字，是四类契约**：

1. **线上 payload key** —— `memory_agent_config` 由 renderer 发出（`src/PAGEs/chat/hooks/use_chat_stream.js:6483`）进 `route_chat.py`；`memory_agent_runs` 走 trace 帧（`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:283`）
2. **durable localStorage namespace** —— `MEMORY_AGENT_NAMESPACE = "memory_agent_v2"`（`src/SERVICEs/memory_agent_settings.js:22`）。**改名即静默丢弃用户已保存的 Curator 模型选择**，除非写迁移
3. **稳定错误码词汇表** —— `memory_agent_selection_failed` / `memory_agent_model_unavailable` / `memory_agent_worker_recursion_blocked` 等数十个，分布在 `memory_v2_unchain_agent_selection.py`、`memory_v2_unchain_model_invoker.py`、`memory_v2_unchain_graph_root_completion.py`、`memory_v2_unchain_run_binding.py`
4. **prompt 常量** —— `PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT`（`memory_v2_unchain_agent_factory.py:17`）

体量：**非测试 Python 文件 12 个、620 处命中**，另有 15 个测试文件（E-0010）。

建议 **拆开裁**：
- **用户可见文案**（"Memory Agent" 出现在 UI 的地方）→ 可以现在改，零风险，属 shared-arteries 的 `src/locales/**`
- **识别符 / wire key / storage namespace / 错误码** → 意见是 **判「不做」而不是「以后做」**。收益是内部可读性，成本是一次协议变更 + 一次 durable 迁移 + 一批错误码作废。这个交换不划算，把它挂在 backlog 上只会让它每次评审重新消耗一次注意力
- **第 4 项（prompt 常量）越出本端边界** —— 它是模型可见材料，属 `expert-llm` 的 spec。**标注为参考**：建议裁定明确写「prompt 常量不在本案命名清理范围内」，否则将来会有人顺手改

议案自带约束（不得重新引入 Builder 卡片 / recipe 节点）在本端不构成风险：`unchain_runtime/**` 不产出 Builder 卡片，也不产出 recipe 节点。

**Q10 — 全部落在本端。前提需要更正；六步里有真前置，也有一步是过度保守，还漏了一个真前置。**

**更正 1：`STORE_OWNER_PUPU_LEGACY` 是 Python 侧的默认值。**
`configured_context_v2_store_owner()` 在环境变量缺失时返回 `pupu_legacy`（`memory_v2_store_boundary.py:96`）。但 Electron 只会传 `off` 或 `unchain`，二值，无第三种可能 —— `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`（`electron/main/services/unchain/memory_v2_rollout.js:150`）。推论：**`pupu_legacy` 在打包产品里不可达**，只在 sidecar 独立运行与测试中可达。已存在的 pupu_legacy DB 撞上 unchain 环境会 `context_v2_store_owner_conflict` fail-closed（`memory_v2_store_boundary.py:341/365/380`），不会误跑。

**更正 2：这四个文件不是「不可达 fallback」。**
它们是 `pupu_legacy` 平面的 **唯一实现**，且是 **活的**。分流点是 `official_context_v2_active = memory_v2_active_bridge is not None`（`unchain_adapter.py:7605`）；当它为 False，`_append_memory_v2_normal_toolkit` 照常挂 PuPu 旧 toolkit（`unchain_adapter.py:7159-7163` → `5734/5761`），`_finalize_memory_v2_curator` 照常起 `MemoryV2Curator`（`unchain_adapter.py:960`，调用点 `9646`）。E-0001 §13「official active 明确跳过旧 toolkit」**成立**，但「旧 fallback 实现」这个措辞会误导 —— 删除它们等于 **弃用一个 store owner**，是数据平面决策，不是清理。

**更正 3：Q10 的文件清单不闭合，漏了两个依赖者。**
`memory_v2_workspace_adapter.py` 被三处非测试引用（E-0009）：
- `memory_v2_context_adapter.py:26`（在清单内）
- `memory_v2_task_state_adapter.py:11`（**不在清单内**）
- `memory_v2_context_reference_policy.py:21`（**不在清单内**，而它又被 `context_memory_v2_repository.py:670/706` 引用 —— 那是 119KB 的仓储）

按清单删 `memory_v2_workspace_adapter.py` 会 **直接打断两个未列出的模块**。清单在合并前必须补全。

对六步的逐条意见：

| 步 | 判断 |
|---|---|
| 1. 先完成 V2 product E2E 和 shadow/canary | **过度保守**。canary 证明的是 unchain 平面的稳定性，与「pupu_legacy 平面能否删」无逻辑关系。真前置是 **「确认没有存量 pupu_legacy DB」**，不是 canary |
| 2. usage/impact 区分 active/shadow/legacy/fixture | **真前置**，且当前清单已被证明不闭合（更正 3）。必做 |
| 3. 逐个删除不可达路径、保持 Legacy V1 chat 可读 | **真前置**，但「Legacy V1 chat」（Qdrant/`route_projection`）与「pupu_legacy store owner」是 **两个不同的东西**，不要混为一谈 |
| 4. 每 symbol 删除前 GitNexus upstream impact | **真前置**，但 E-0001 §12 自陈索引落后 HEAD 且 `file_fts` 不一致 —— 依赖它之前必须先 rebuild，否则是拿旧图当事实 |
| 5. 重跑 active + shadow + legacy bootstrap + migration + route tests | **真前置**。基线已实测为绿：`49 passed, 3 subtests passed`（E-0014） |
| 6. 最后更新架构文档 | 同意，非前置 |
| **（漏）** | **`tests/export_memory_v2_contract_fixtures.py` 把 `memory_v2_legacy_adapter.py` 的路径写死在 fixture 里**（42/48/517 行）。删文件会打断 contract fixture 导出。清单必须包含它 |

**建议时序**：先做 **更正 3 的清单补全 + 存量 pupu_legacy DB 的实证**（两件都是只读调查，现在就能做，不必等 canary），再把删除本身排在 P0-2/P0-3 之后。不建议等 P0-4 canary 全绿 —— 那是把一个数据平面决策绑在一个与它无关的门上。

**Q4 的本端答案（边界内、`chief-judge` 未列出的产品面未决项）**

**Q4-A｜`getEntry` 的路由存在，但渲染层拿不到。**
`GET /context/v2/memory/spaces/<space_id>/entries/<entry_id>` 已实现（`route_memory_v2.py:1160-1162`），但 `CHANNELS.CONTEXT_V2` 的 18 个 channel 里 **没有 GET_ENTRY**（`electron/shared/channels.js:120-145`），renderer bridge 也没有（`src/SERVICEs/bridges/context_v2_bridge.js:96-122` 只有 `listEntries`）。E-0001 §17 的 DoD 第 1 条要求 Inspector 展示 **entry、revision、provenance**。`listEntries` 给不给 provenance 未逐字核实，但 entry **详情** 没有独立读路径是确定的。**这个缺口和 Q7 同形、比 Q7 更中心，却没人列。** 而且它比 Q6 便宜得多 —— 路由已在，只差 channel + preload + bridge 三层。

**Q4-B｜rollout 降到 off 之后，已有 sticky V2 chat 的产品行为未定。**
route 已经会返回 `context_v2_store_disabled` / 503（`route_memory_v2.py:236-242`，蓄意区分于 404），即「存储已关但 durable state 还在」。UI 对这个状态 **没有定义行为**。E-0001 §12 把它记成 backlog，本端认为它是 **产品决策**：用户关掉 Memory V2 之后，他之前那些 chat 的记忆是不可见、只读可见、还是提示可重新开启？这必须裁，且它决定 Inspector 的状态机有几个态。

**Q4-C｜Curator 是 after-run 内联，失败没有用户可见的重试面。**
`_finalize_memory_v2_curator` 在 root run 的 after-run 生命周期里内联跑（`unchain_adapter.py:9646`），不是 daemon（与 E-0001 §4.7 一致）。capture 不是 `complete` 就直接产 `Isolated` + reason 并返回（`unchain_adapter.py:930-957`）。产品后果：用户说了「记住这件事」，run 正常结束，但整理被 Isolated 掉 —— 他看到的是一次成功的对话，**没有任何界面告诉他「这条还没进记忆，可以重试」**。E-0001 §6.6 明令不得把 `memory_propose` 成功说成「已保存」；那么反过来，**「没保存」要不要告诉用户、怎么告诉**，是未裁的产品问题。

**Q4-D｜长期记忆 namespace 硬编码 `user:local`。**
`_MEMORY_V2_LONG_TERM_NAMESPACE = "user:local"`（`unchain_adapter.py:96`），单点。E-0001 §5 Layer 5 承认 resolver 未产品化。产品未定项：Inspector 要不要显示 namespace？多 workspace / 多 profile 时长期记忆是共享还是隔离？**这条必须在 Inspector 定形之前裁** —— 一旦 Inspector 的信息架构假设「只有一个 namespace」，将来加 namespace 就是重画，不是加字段。

**Q4-E｜`memory_v2_unchain_ownership_adapter.py` 顶部注释与现实相反，且它是安全语义注释。**
文件 docstring 明写「**the P0 production gate remains closed and shadow preparation has no model/tool surface**」（第 6-7 行）。production gate 已经开了。E-0001 §12 只把它记成「旧注释」，本端认为它比普通注释债更重：这是一句关于 **这个模块有没有模型/工具面** 的断言，将来任何人（包括安全评审）读到它会得出错误结论。建议单独列为必修，不要混进 Q9 的命名清理。

- **边界命中依据**: `pupu:unchain_runtime/**`。本轮取证落在 `route_memory_v2.py`、`memory_v2_unchain_read_adapter.py`、`memory_v2_store_boundary.py`、`context_memory_v2_capability.py`、`unchain_adapter.py`、`memory_v2_curator.py` / `memory_v2_toolkit.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` / `memory_v2_context_reference_policy.py` / `memory_v2_task_state_adapter.py`、`memory_v2_unchain_agent_factory.py`、`memory_v2_unchain_ownership_adapter.py`、`route_projection.py`、`unchain-core.lock.json`
- **受影响对象**:
  - **需新增（仅 Q6）**：unchain 侧只读 task-state 投影 → `PupuUnchainMemoryV2Reader.get_task_state` → `GET /context/v2/memory/task-state` → channel → preload → bridge（**5 层**）
  - **需补齐（Q8）**：`_endpoint` 或读路径的 `PupuUnchainMemoryV2ReadError` → 精确 status 映射；配套错误码断言测试（当前零覆盖）
  - **需接线（Q4-A）**：`GET_ENTRY` channel + preload + bridge（路由已存在，**3 层**）
  - **可选、更便宜的 Q5 替代**：把已有只读探针路由成 `GET /context/v2/chat/<id>/admission`
  - **不新增**：`listArtifacts`（Q7）
  - **延后并需重新界定**：Q10 的删除集（清单不闭合，缺 `memory_v2_context_reference_policy.py`、`memory_v2_task_state_adapter.py`、`tests/export_memory_v2_contract_fixtures.py`）
- **约束**:
  1. **`.py` 改完 sidecar 必须重启** 才生效 —— 本案任何 route 层改动的验收报告必须标注这一点，否则验的是旧代码
  2. **不得为了 Q6 把写能力仓储塞进读路由**。`/context/v2/**` 读面「拿到的对象结构上不能写」是当前 renderer 只读保证的 **结构性依据**，不是约定
  3. **Q6 一旦要求 unchain 前进，必须同步更新 `unchain-core.lock.json` 并重跑 capability/readiness**。`_validated_lock` 精确校验字段集，packaged 下 fail-closed。**不得用 dev bypass 代替 lock 更新**
  4. **不得让 `pupu://…` 之外的原始 `ResourceRef` dict 越过 route 边界**。`_route_json_value` / `_route_entry` 的翻译是唯一出口
  5. **Q9 的 prompt 常量（`PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT`）不在本端可裁范围**，属 `expert-llm` 的 spec
  6. **Q10 删除前必须先 rebuild GitNexus 索引** —— 拿旧图做 impact 等于没做
  7. 后端 focused 基线：`49 passed, 3 subtests passed`（E-0014），任何改动须对齐此基线
- **建议处置**:
  1. **Q5 = 已有能力，判「不新增契约」**，用 `getSessionHead` 三态分流；必须同时裁定第三态（503 not_ready）的 UI 落点。若 `session_id` 空值不可用，改用「把已有只读探针单独路由」这条最小路径
  2. **Q7 = 判「不新增 `listArtifacts`」**，走已披露 refs。要推翻须先给出「不挂在任何消息上的 artifact 列表」的具体用户场景
  3. **Q8 = 判「必修，且优先于 Inspector 定形」**。修法是把 `_generation_operation_for_store_owner` 已有的 code→status 映射套到读路径。**新 Inspector 不得继承 `/memory/projection` 的 200-空成功形状**
  4. **Q6 = 本轮唯一真新建，且先问 `code-owner-unchain`**。把 E-0011 拿去对质。若答案是「用现有 `bind_task_state`」，本端 **不成立**（违反约束 2）。另建议把 **Q4-A（`getEntry`）排在 Q6 之前** —— 更便宜、更中心、且是 DoD 明列项
  5. **Q9 = 拆开裁**：用户可见文案现在改；识别符/wire key/storage namespace/错误码判 **「不做」** 而非「以后做」；prompt 常量明确划出本案范围
  6. **Q10 = 先补清单再谈时序**。清单补全 + 存量 `pupu_legacy` DB 实证是只读调查，**现在就能做，不必等 canary**。删除本身排在 P0-2/P0-3 之后即可
  7. **Q1 与 Q10 必须同轮裁**（`Isolated` 的 4/6 产点在待删文件里）
  8. 建议把 **Q4-E** 单列必修，不要并进 Q9

#### S-0006 | ASSESSMENT | code-owner-chat-core → case
- **阶段**: 议案庭审
- **结论**: E-0001 §8 的 `Inspect Memory` 链路逐段核实为 **真**，但漏记一跳（`side_menu.js` 的 modal hub）。Q5 的分流 **不应在本端做** —— 入口是纯同步菜单构建器，无异步能力；而 modal 内部已有 mode 分支与六态状态机，admission 是同一状态机的第四条轴。本端唯一该改的是把 `ownerChatId` 补进挂载接口
- **依据**: E-0001（§7.2 / §8 / §9 / §12，均已自行核对到代码）、CE-1 … CE-8
- **不确定性**: `streamError` 的清除时机只核实了写入侧，未穷举清除点，故"提示会被下一次发送冲掉"标为 **未核实**
- **请求/下一步**: 若裁定分流在 modal 内，请把「入口补传 `ownerChatId`」作为独立的、属于本端的小切片列出 —— 它是 `code-owner-settings` 任何方案的 **前置条件**
- **主张类型**: FACT
- **边界命中依据**: `src/COMPONENTs/side-menu/**`（入口 + modal hub 挂载）、`src/PAGEs/chat/**`（`context_v2_turn_mutation.js`、`use_chat_stream.js`、`secret_capture.js`、`use_secret_capture_gate.js`、`chat.js`）、`src/SERVICEs/turn_mutation_outbox.js`
- **受影响对象**: `side_menu_context_menu_items.js`、`side_menu.js`、`chat.js`、`use_chat_stream.js`；下游受影响但不归本端：`src/COMPONENTs/memory-inspect/**`
- **约束**: 本轮只读，未改任何代码，未 commit
- **建议处置**: 见下六项

**Q1–Q10 落位**：Q1 部分（产帧端）· Q2 入口段 · Q4 落在本端（四条）· Q5 落位问题本身落在本端 · Q8 入口段 · 其余不落在本端。

**Q1（本端部分）**：`trace_chain` 渲染归 `code-owner-chat-bubble`，本端只驱动流。Memory V2 在 trace 里能体现什么，取决于 `streaming_message_store` / `runtime_events_v4` 承不承载 V2 帧 —— 这是本端与 bubble 之间的 **跨面契约**，让 schema 承载新数据是契约变更，强制 Full track，不能在 presenter 侧"顺手读一个新字段"。**故 Q1 若结论是"presenter 缺 X"，其前半段是本端的工作**；请在裁定中写明，否则会变成 bubble 单方面被要求渲染它拿不到的数据。

**Q2 / Q5（分流落位）—— 明确表态：分流放 modal 内部（settings），不放 side-menu。**

三条理由，前两条是硬约束：

1. **入口物理上做不了分流。** `buildSideMenuContextMenuItems` 是纯同步函数（返回值直接进 `ContextMenu` 的 `items`）。要在菜单构建时判 admission 只有两条路：(a) 右键时先 `await getSessionHead` 再画菜单 —— 把一次 IPC 往返放进右键关键路径，而该 builder 对 **每个节点的每次右键** 都跑；(b) 预取全树 admission —— 正是本端 charter 已标红的 side-menu O(n) 全树重建塌点，500+ 会话会直接塌
2. **放在点击后、开 modal 前更差。** 第三态恰是 **503 = 有 state 但未就绪**，可能持续数秒到超时；把分流点放在一个 **没有 loading 表面** 的层，用户会看到"点了没反应"
3. **modal 已有承接结构**（`:330` mode 分支、`:340` 六态 status）。把 admission 拆到两个组件，等于把一个状态机劈成两半跨 owner

**分流放本端是否越界 —— 是，越界。** 本端 charter 明确：提供稳定挂载接口，各 owner 只往里挂内容。"打开 PCA modal 还是 Workspace Inspector"是 **内容决策**，不是挂载决策。

**挂载接口的边界线（第三层集合差可直接引用这句）**：本端拥有 右键菜单项的存在与文案 key、菜单项 `onClick` 的调用、`memoryInspect` 的 open/close state、lazy 导入与一次性挂载闩、**以及传给 modal 的那组 prop 的名字与取值**；不拥有 `open` 之后 modal 内部的一切。**分界线就是 `side_menu.js:772-779` 的那个 prop 列表 —— props 是本端的，props 之内是 settings 的。**

**本端唯一该改的（Q5 中真正属于本端的部分）**：今天传 `{ open, sessionId, chatTitle, onClose }`，但 character chat 传的是 `buildCharacterMemorySessionId(...)` 的 **派生值**，而 `getSessionHead` 的入参是 `{ ownerChatId, sessionId }`。**modal 从今天传的东西里反推不出 `ownerChatId`。** 须扩为 `{ open, ownerChatId, sessionId, chatTitle, onClose }`；`ownerChatId` 恒等于 `node.chatId`，两个分支都有。**传的是身份，不是判决** —— 供 modal 查 admission 所需坐标，判决它自己做。

**对 `code-owner-runtime`（S-0005）的一处修正**：它称"第三态今天没有 UI 落点"，在 Inspector 上成立，**在本端面上不成立** —— 今天有一个落点，只是错的（见 Q4-A）。

**（越维参考）** Q6 的 `getTaskState` 若成立，请与 `getSessionHead` 用 **同一个 scope 入参形状** `{ownerChatId, sessionId}`；两套形状会让入口层被迫维护两套坐标。

**Q4 —— 本端边界内的未决项，四条：**

**Q4-A · fail-closed 呈现为一行标着 "Unchain error:" 的免责声明，这个产品行为没有定过。**
链路核实到底：`context_v2_turn_mutation.js:97-110`（七条固定文案）→ `:170-249`（**13 个 blocked 分支**）→ `:420-434`（折叠成 **5 条文案**）→ `use_chat_stream.js:11989-11994`（blocked → `setStreamErrorForChat`）→ `:872-878`（**仅当 `activeChatIdRef.current === targetChatId` 才写**）→ `chat.js:771-772`（`Unchain error:` 前缀）→ `:888`（输入框下方 disclaimer）。
四个未决项：**归属错位**（记忆系统的 fail-closed 被渲染成"模型出错了"）· **落点错位**（与"正在流式""模型没选"共用同一槽位，而用户注意力在他刚点的那条消息上）· **跨会话静默丢失**（在 A 会话点删除后立刻切到 B，fail-closed 结果一个字都不显示，而 `isTurnMutationBlocked` 仍在 A 会话禁用发送与全部消息操作按钮 —— **用户回到 A 会看到一个不能发消息、按钮全灰、零解释的会话；这是本端看到最严重的一条**）· **`CONFLICT_MANUAL` 文案承诺了一个不存在的产品动作**（`src` 内无任何 manual review 入口）。

**Q4-B · Vault 是单向的：能存进去，没有任何界面能看见、改名或撤销。**
`memory_vault_bridge.js` 暴露 `deposit` / `listDescriptors` / `deleteSecret` / `grant` / `revoke`，全 `src` 内唯一非测试消费者是 `use_secret_capture_gate.js:64`；**`listDescriptors` / `revoke` / `grant` 零 UI 消费者**。用户起了名、选了 scope、存进 vault 之后再也见不到它，想撤销没有入口。未决：captured secret 的生命周期管理界面在哪个 surface、归谁（本端主张不在 chat，**标为参考**）。另一条更小的：用户选"按普通消息发送"之后 **该决定是否对同一凭据记住**，在启发式误报（把版本号、UUID 当 token）时是高频骚扰路径 —— **未定**。

**Q4-C · rollout 降到 off 之后会静默产生不可修复的记录分叉。**
实测：`enable_memory_v2` / `memory_v2` / `memoryV2` 在 `side-menu/`、`chat-header/`、`chat-messages/`、`chat-input/` 内 **零命中** —— 会话列表、标题栏、消息列表、输入框 **没有任何一处知道一个 chat 是不是 V2**。而 `context_v2_turn_mutation.js:184` 第一条即 `if (flagEnabled !== true) return legacy("flag_off")`：**flag 一关，编辑/删除立刻回到 V1 replace 路径，直接写 V1 短期记忆，而该 chat 的 canonical 记录在 V2 journal 里。** 这正是该文件头注释 `:15-27` 用整段论证"绝不能发生"的分叉，只不过 flag off 被明确列成合法出口。**这条比 Inspector 的态数严重得多，请独立列为待裁项。**

**Q4-D · `isTurnMutationBlocked` 是一个无解释的全局禁用态。**
`use_chat_stream.js:1447-1454`：outbox 不可用、或该 chat 有任何在途/滞留 mutation 行，即为真，于是 `chat.js` 同时禁掉 **发送**（`:800-801`）、**全部消息操作按钮**（`:1133-1136`）、**换模型**（`:726`）；而 `effectiveDisclaimer`（`:747-790`）**没有任何分支对应它**。PARTIAL 行会长期保持该状态，用户看到一个整个瘫痪、零解释的会话。未决：blocked 态需不需要自己的文案 / 可视指示 / 重试入口 —— 今天三样都没有。

**建议处置（六项）**：① Q5 分流判给 modal（settings），入口保持 admission-blind，同时把「入口补传 `ownerChatId`」作为归本端的独立小切片列出；② **Q4-A 与 Q4-D 合并** 成"V2 turn-mutation 的失败与阻塞反馈"从零定 —— 这两条今天都是 **已实现但没设计过** 的行为，不是缺功能；③ **Q4-C 单独列并升格** 为"flag off 后 sticky V2 chat 的 mutation 路径是否仍走 legacy"，后者是数据完整性问题；④ Q4-B 单独列，判 vault 管理界面归属 surface；⑤ **Q1 的前半段（流是否承载 V2 帧）与 bubble 的 presenter 议题绑定裁决**，拆开会让 bubble 被要求渲染它拿不到的数据。

**候选证据 CE-1 … CE-8**（来源定位与完整性限制随发言提交，待 `evidence.md` 分配 `E-####`）：
CE-1 入口实际参数形态 `side_menu_context_menu_items.js:197-208 / :218-224` ·
CE-2 modal hub 挂载接口 `side_menu.js:48-51 / :237-242 / :296-299 / :772-779` ·
CE-3 modal 已有 mode 分支与六态 `memory_inspect_modal.js:326-331 / :340 / :374-377` ·
CE-4 §8 四层链路首尾相接 `api.unchain.js:1811 → unchain_bridge.js:133 → service.js:85 → route_projection.py:406` ·
CE-5 turn mutation fail-closed 的用户可见形态（链路见 Q4-A） ·
CE-6 `isTurnMutationBlocked` 无解释禁用 `use_chat_stream.js:1445-1454 / :13074`、`chat.js:726 / :800-801 / :1133-1136 / :747-790` ·
CE-7 chat 表面对 Memory V2 零感知（负向 grep，四目录三 token 零命中） ·
CE-8 vault 单向 `memory_vault_bridge.js:6-9 / :64-68 / :120-124`，唯一非测试消费者 `use_secret_capture_gate.js:64`

> **归档说明（书记员补录）**：本条 `ASSESSMENT` 于 `chief-judge` 中止本案之后返回，`speaker-of-the-house` 已停止，无法由其归档。为免证据灭失，由书记员按发言协议补录，编号续 `S-0005`。候选证据 `CE-1…CE-8` **未经 `evidence-examiner` 验证，也未分配 `E-####`**，不得作为已验证证据引用；后继 case 引用本条须写作 `0000-0001-2026-0807#S-0006` 并自行承担举证责任。此补录本身是一次程序偏离，理由与依据见本案 `ruling.md`。
