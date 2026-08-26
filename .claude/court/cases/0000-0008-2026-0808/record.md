---
case_id: 0000-0008-2026-0808
updated_at: 2026-08-08T16:45:00-07:00
---

# 发言记录

追加式。已归档发言不得原地改写；内容有误以 `WITHDRAWAL` 撤回后另提替代发言。

本 case 的 `S-####` / `E-####` 为 **本地序列**，与 `0000-0003-2026-0807` 独立。援引前案一律写作 `0000-0003-2026-0807#S-####` / `#E-####`。

## 议案庭审

#### S-0001 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 议案庭审开庭
- **依据**: 无
- **不确定性**: 无
- **请求/下一步**: 进入议题框定
- **通知类型**: OPENING
- **生效时间**: 2026-08-08T16:45:00-07:00
- **影响范围**: case `0000-0008-2026-0808` 全部出庭角色。

  **本次庭审是 `phase: motion`，只论证「能不能做」，不论证「怎么做」。** 全体出庭角色须遵守下列范围纪律：

  > **任何具体视觉 / 交互设计（布局、配色、组件形态、层级、空态文案、交互状态的呈现）都不在本阶段范围内。** 出庭角色若在自己边界内认为某项设计取舍必须被记录，**照写不误**，但须自行标注为「留待方案庭审」；本庭会把它归档为备注，**不采纳为本阶段的 `ASSESSMENT` 结论**，也不因此压制其内容。届时按触发条件传唤 `expert-ux`。

  三项发言纪律（与 `0000-0005-2026-0807#S-0001` 相同，本庭不重复展开，只点名）：

  1. **质证权归全体出庭角色**（[宪法第五条](../../../codex/constitution.md)）。任何人可对任何 `E-####` 提 `OBJECTION`，类型 `SOURCE` 或 `UNSUPPORTED`，满足三项形式要件即 **强制触发** `evidence-examiner` 审查。本席 **不持质证权，对是否启动审查不持裁量权**，只作形式审查
  2. **证据四类分级**（[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)）。提交证据须标注类型。**传闻类（文档 / README / 注释 / 他人记忆）不得用于证明其所述事实为真** —— 本庭尤其适用：`docs/architecture/memory-v2-claude-handoff-2026-08-07.md` 依 [A-009](../../../codex/adaptations.md) 无 owner
  3. **承重证据复核**（[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)）。`依据` 里挂的每个 `E-####` 若进入 `SUMMARY` 的四项，都会被逐条复核，**自证类免检在本关失效**。挂不需要的编号只增加复核负担；漏挂需要的编号会使该项丧失证明力

#### S-0002 | FRAMING | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 本次议案庭审框定如下。待裁问题、范围、已知事实、已知缺口、必到名单与交付以本条及 S-0003 为准。**必到名单经传唤第一层重跑后，由 `case.md` 所载 5 人补正为 7 人**，依据与分类见 S-0003
- **依据**: E-0001, E-0002, E-0003, E-0004, E-0005, E-0006, 0000-0003-2026-0807#S-0024, 0000-0003-2026-0807#S-0014, 0000-0003-2026-0807#S-0006, 0000-0003-2026-0807#S-0005
- **不确定性**:

  **一 · 本庭的取证限制（写在最前，因为它决定了本案能得出什么结论）**

  本席 **未起 sidecar、未发过一次真实的 `/context/v2/memory/spaces/<space_id>/tree` 请求、未观察过任何返回体**。E-0006 只证明「六段代码都在、行号如下」，**不证明这条链路跑得通**。Q1 问的是「端到端管线是否完整可用」——「存在」与「可用」之间的那一段，本席给不出，须由 `code-owner-runtime` 与 `code-owner-electron` 在各自边界内实测或明确标注「未核实」。

  **二 · 前案的裁定尚未到达，且它可能改变本案的答案**

  `0000-0003-2026-0807` 现为 `status: awaiting-ruling`，其 `SUMMARY`（`#S-0024`）载 **强制回应事项 16 项 + 1 预防性** 待 `chief-judge` 逐条回应。本案 `relation: non-blocking` 是 **立案时的暂定判断**，Q2 正是要求庭审重判它。**任何角色不得把前案任何一条 `ASSESSMENT` 当作已生效裁定引用** —— 它们是已归档发言，不是裁定。

  **三 · 本案继承前案最大的证据空洞**

  本机 V2 store `entries=0`（`0000-0003-2026-0807#S-0024` 已知缺口 1，**该案 12 名必到者全部自标「正常态给不出取证」**）。故本案能取证的只有 **空态与未启用态**；「有数据时 tree 长什么样」在本案 **结构上无法取证**，任何据此作出的主张都须自标为推断。

- **请求/下一步**: 7 名法定必到角色按各自输出契约提交 `ASSESSMENT`，依 [A-012](../../../codex/adaptations.md#a-012--运行时故障不得记为阻塞记录) **每批 2 人、串行四批**。**被传唤角色不得派生自己的勘察子 instance**；取证不足按「未核实」交，强于再挂一次

- **待裁问题**:

  - **Q1 · 管线完整性。** `/context/v2/memory/spaces/<space_id>/tree` 端到端管线是否 **完整可用**（不只是「代码存在」）？E-0006 已固定六段锚点。已知一处硬疑点：主进程 `getContextV2Tree` 第一行即 `requireContextV2OwnerChatId(...)`，而 `case.md` 称 modal 今天只拿得到派生的 `sessionId`。**这是否卡死本议案？**

  - **Q2 · 与 `0000-0003-2026-0807` 已识别缺口的关系。** 在同一个 modal 内新增第二个 view，是否直接踩中前案的 **Q0**（`#S-0014` D7：六问缺一个前置问「是否该有单一状态源」，且四名角色在互不知情下各自索要了同一个不存在的构件，**而它今天没有 owner**）与 **Q2/Q5 接缝**（`#S-0024` D8：三方边界主张全部正确、合起来仍无人负责，`expert-architecture` 明言「传唤机制解不了它，只有指派能解」）？**若是，是否构成本议案进入方案庭审的前置阻塞？**

  - **Q3 · 「vector view 保持现状」的前提核实。** 书记员自查称：V1 的 `/memory/projection` 走 `memory_factory` 的旧向量集合逻辑，与 V2 store 无关；V2 侧只有 `context_v2_search`（语义搜索，返回排序列表），**未找到等价于 `/memory/projection` 的二维散点坐标生成逻辑**。**该自查结论不构成证据，本庭未复核，须由 `code-owner-runtime` 独立核实。** 若前提不成立，「保持现状」具体该如何界定 —— V1 view 完全不动，那 V2 数据被选中时 vector view 该呈现什么？（**问的是技术上有什么可呈现，不是问该长什么样**）

  - **Q4 · 空态 / 未启用态的可判别性（不涉及呈现设计）。** `get_tree` 在「store 为空」与「`store_owner=off`（V2 未启用）」两种情况下的返回形状 **是否可判别**？**只问 API 层面能不能区分，不问该怎么显示。**

  **本庭必须直接回应的三件事（不得被逐问表态淹没）**：

  > **甲 · 「零消费者」这条前提被本庭的取证 **部分推翻**，全体必到角色须在此基础上作业。**
  >
  > `case.md` Q1 称 `src/COMPONENTs/` 下零消费者。E-0004 确认 **`getTree` 确无消费者**；但 E-0005 同时确认 **`src/COMPONENTs/chat-bubble/` 下有三个文件已在消费 `context_v2_bridge`**（`memory_v2_journal_reload.js` · `memory_v2_pending_reviews.js` · `memory_v2_trace_audit.js`），**且它们今天就拿得到 `ownerChatId`**，并已就地处理 `context_v2_unavailable` 一族错误码。
  >
  > **净效果**：本案要新增的不是「第一个 V2 读消费者」，而是「第一个 `getTree` 消费者」。**Q1 的 `ownerChatId` 疑点因此不是一个「这个值拿不到」的问题，而是「这个值在 A 处拿得到、在 B 处拿不到」的问题** —— 处方完全不同。各角色在自己边界内表态时须按后者作业。

  > **乙 · Q2 不接受「与我无关」这种回答。**
  >
  > 前案 `#S-0014` D7 与 `#S-0024` D8 都指向 **同一件事**：一个被多方需要、但今天没有 owner 的构件。本案在同一个 modal 里加第二个 view，**几乎必然要再次触到它**。
  >
  > **每一名必到角色须就下列问题在自己边界内明确表态**：**本案若推进，是否会要求你的边界承担一个今天不属于你的判定职责？** 判断不落在自己边界内的，写明「不落在本边界」并 **指出谁能判断** —— 这也是一个有效回答，不得沉默略过。

  > **丙 · 「能不能做」的判定必须给出可证伪的形式。**
  >
  > 本阶段唯一的产出是「可行 / 不可行 / 有条件可行」。凡表态「可行」的角色，须一并写明 **在什么条件下它会变成不可行**（哪一个前提被推翻、哪一个缺口未填）。只写「可以做」而不给推翻条件的表态，本庭在 `SUMMARY` 中标注为 **不完整**。

- **范围**:
  - **在范围内**: Q1 / Q2 / Q3 / Q4，以及各出庭角色 **在自己边界内看到、而本 `FRAMING` 未列出** 的、与「新增一个 tree view 在技术上能不能做」直接相关的未决项。本轮收 **意见和建议**（可行性、结构性阻塞、前置条件、风险），不收完整实施方案
  - **不在范围内**:
    - **(a) 任何具体视觉 / 交互设计** —— 布局、配色、组件形态、层级、空态文案、交互状态的呈现。归方案庭审，届时按触发条件传唤 `expert-ux`（见 S-0001 与 S-0003 的不传唤判定）
    - **(b) 前案 `0000-0003-2026-0807` 六问本身的重开** —— 该案已闭庭待裁。本案只问「它的缺口是否阻塞我」，不重审其结论
    - **(c) 完整实施方案的步骤、可逆性与验收标准** —— 属方案庭审
    - **(d) V2 记忆系统本身的形态取舍、迁移与发版动作**
  - **约束（议案自带，出庭角色须遵守）**: 「vector view 保持现状」是 **议案的前提**，不是本庭的结论。Q3 允许推翻该前提；**若被推翻，本庭如实记录，不代为改写议案**

- **已知事实**（全部在 revision PuPu `b2385d5d` / unchain `a4e69f4` 上由 speaker 实跑确认，见 E-0001~E-0006）:

  1. **两仓 revision 已固定**，PuPu 工作树 dirty 条目 **全部在 `.claude/court/cases/**`**，三个产品目录零 dirty（E-0001）
  2. **`getTree` 链路六段代码全部存在**，行号见 E-0006。**只证明存在，不证明可用**
  3. **`MemoryInspectModal` 有且仅有两个挂载点，且 props 集合不同**（E-0003）：`src/COMPONENTs/side-menu/side_menu.js:772` 传 `{open, sessionId, chatTitle, onClose}`（**`code-owner-chat-core` 的边界**）；`src/COMPONENTs/settings/memory/index.js:474` 传 `{open, onClose, mode="long_term"}`，**连 `sessionId` 都不传**。**这一条直接决定了必到名单的第一处补正**（S-0003）
  4. **`src/COMPONENTs/**` 下确无 `getTree` 消费者**；但 `src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:249` 已在 mock 中 stub 了 `getTree`（E-0004）
  5. **`src/COMPONENTs/chat-bubble/` 下有三个 `context_v2_bridge` 消费者，且均以 `ownerChatId` 为入参**，并已就地处理 `context_v2_unavailable` 一族错误码（E-0005）。**这一条决定了必到名单的第二处补正**（S-0003）
  6. **主进程侧 `ownerChatId` 是必需参数**：`electron/main/services/unchain/service.js:2108-2109` 第一行即 `requireContextV2OwnerChatId(payload?.ownerChatId)`（E-0006）。**其缺失时的行为本庭未核实**

  **继承自 `0000-0003-2026-0807` 的已归档发言（不要重新取证，一律跨案引用）**：
  - `#S-0024` —— 该案 `SUMMARY`：C1~C8 共识、D1~D8 分歧、16 项强制回应、7 项已知缺口、R1~R5 风险
  - `#S-0024` C3 / C4 —— Q2/Q5 分流落 modal 内部；**挂载接口须补 `ownerChatId` 且破坏面为零**（chat-core 承诺、shared-arteries 复核加强）
  - `#S-0014` D7 / `#S-0024` D8 —— Q0 前置问缺失；Q2/Q5 接缝三方主张全对而无人负责
  - `#S-0024` R1 —— **凡以「今天默认 store owner 的行为」为据的结论，在 owner 切换当天全部需要重核**

- **已知缺口**（本庭 **不消除** 这些缺口，指名归属并要求在 `ASSESSMENT` 中直接回应）:

  - **G1 · 前案裁定未到达。** `0000-0003-2026-0807` 的 16 项强制回应待 `chief-judge` 逐条回应。**归 Q2，全体必到角色须表态其是否构成前置阻塞**
  - **G2 · 本机 V2 store `entries=0`。** 「有数据时 tree 长什么样」结构上无法取证。**归全体：任何涉及正常态的主张须自标为推断**
  - **G3 · `get_tree` 的实际返回形状完全未观察。** 空 store / `store_owner=off` / 缺 `owner_chat_id` 三种情况一次都没跑过。**归 `code-owner-runtime`（服务端半边）与 `code-owner-electron`（主进程半边）**
  - **G4 · 「V2 无散点坐标生成逻辑」是书记员自查，未经复核。** **归 `code-owner-runtime`**
  - **G5 · `requireContextV2OwnerChatId` 缺参时的行为未核实。** **归 `code-owner-electron`**
  - **G6 · 两个挂载点的 props 差异意味着什么，未决。** settings 那一处走 `mode="long_term"` 而完全不传 `sessionId`；若 tree view 要挂在 modal 内，它从哪一个挂载点拿 `ownerChatId`，今天没有答案。**归 `code-owner-settings`（modal 内部）与 `code-owner-chat-core`（side-menu 挂载点）**
  - **G7 · 传唤第二层以缩减形式执行**（见 S-0003 第四节），**不覆盖**「边界写窄、须 agent 本人辨认」这一类

- **必到角色与交付**: 见 S-0003（名单经补正，7 人）

#### S-0003 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **必到名单由 `case.md` 所载 5 人补正为 7 人。** 补正两处，均属「议案写窄 / 抽取写窄」而非「边界写窄」，处方不同，不得混为一谈。同时归档三项 quorum 判定（`codex` · `expert-ux` · 四个 `dimension-owner` 均不列为法定必到）
- **依据**: E-0002, E-0003, E-0004, E-0005
- **不确定性**: 第二层认领期以 **缩减形式** 执行（见第四节）。缩减的代价是：真正因边界写窄而该到场的角色，本庭只能靠第三层捞回，而第三层在闭庭前才执行
- **请求/下一步**: 补行传唤的两人与原 5 人同权，对已归档部分保留发言权（[quorum 第四节](../../../codex/lifecycle/quorum.md)）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T16:45:00-07:00
- **影响范围**: 本案 quorum 判定与全部出庭角色

  **一 · 补正后的 7 人名单与交付**

  | # | 角色 | 入选层 | 交付 |
  |---|---|---|---|
  | 1 | `code-owner-runtime` | 第一层 · 路径机械命中（3 处） | `ASSESSMENT` — `pupu:unchain_runtime/**`：`context_v2_tree` 端点行为、`get_tree` 在空 store / `store_owner=off` 下的返回形状（Q4、G3）、V2 是否存在散点坐标生成逻辑（Q3、G4） |
  | 2 | `code-owner-settings` | 第一层 · 路径机械命中（1 处） | `ASSESSMENT` — `pupu:src/COMPONENTs/memory-inspect/**`：Inspector 承接方，modal 内部能否容纳第二个 view，`ownerChatId` 从哪来（Q1、G6） |
  | 3 | `code-owner-electron` | 第一层 · 路径机械命中（12 处） | `ASSESSMENT` — `pupu:electron/**`：IPC channel 与 preload bridge 现状核实、`requireContextV2OwnerChatId` 缺参行为（Q1、G3、G5） |
  | 4 | `code-owner-shared-arteries` | 第一层 · 路径机械命中（1 处） | `ASSESSMENT` — `pupu:src/SERVICEs/bridges/context_v2_bridge.js`：renderer facade 现状核实、`getTree` 转发形状与错误码透传（Q1） |
  | 5 | `expert-architecture` | 第一层 · 触发条件（4 条命中 3 条） | `ASSESSMENT` — 「跨两个及以上 code-owner 边界」「新增或移动一个功能的落位」「公共动脉的结构变更」命中：落位，以及与 `0000-0003-2026-0807` Q0 / Q2-Q5 接缝的关系是否构成前置阻塞（Q2） |
  | 6 | `code-owner-chat-core` | **第一层 · 概念名（立案时漏列）** | `ASSESSMENT` — `pupu:src/COMPONENTs/side-menu/**` 与 `pupu:src/PAGEs/chat/**`：**Q1 疑点所述的挂载接口 `{open, sessionId, chatTitle, onClose}` 就是本端的 `side_menu.js:772`**（E-0003）；`0000-0003-2026-0807#S-0024` C4 的 `ownerChatId` 承诺是否仍然有效、是否卡死本案（Q1、G6） |
  | 7 | `code-owner-chat-bubble` | **第三层提前执行** | `ASSESSMENT` — `pupu:src/COMPONENTs/chat-bubble/**`：**`src/COMPONENTs/` 下今天唯一的 V2 读消费者群**（三文件，E-0005），且 **今天就拿得到 `ownerChatId`**。本端是「这个值在 A 处拿得到」那一半的实证；另请就其已实现的 `context_v2_unavailable` 一族错误码处理，回答 Q4 的收端半边（**该错误码集合在收端是否已足以区分空态与未启用态**） |

  **二 · 两处补正的分类（依 [A-010](../../../codex/adaptations.md#a-010--边界声明的可解析格式) 要求区分，处方相反）**

  | 补正 | 类别 | 归因 | 处方 |
  |---|---|---|---|
  | `code-owner-chat-core` | **概念名漏人（抽取写窄）+ 议案写窄** | 议案以 **概念** 指称实体（「挂载接口」「modal 拿不到 `ownerChatId`」），从未写出承载它的文件路径。`summon.py` 的概念名通道本次只产出 `memory_factory → expert-llm` 一条，**未产出「挂载接口 → side_menu.js」**（E-0002） | **不是改 `code-owner-chat-core` 的 charter** —— `pupu:src/COMPONENTs/side-menu/**` 与 `pupu:src/PAGEs/chat/**` 已逐字覆盖 `side_menu.js` 与 `use_chat_stream.*`。是 **立案时议案实体列举不全** + **抽取器概念名通道召回不足**。属 A-010 文末所留、`codex` 待处置的第三桶「议案写窄」的又一实例 |
  | `code-owner-chat-bubble` | **议案写窄** | 议案称「`src/COMPONENTs/` 下零消费者」。该陈述对 `getTree` 成立（E-0004），**对 `context_v2_bridge` 不成立**（E-0005，三个文件在 `chat-bubble`）。议案把一个窄命题写成了宽命题，宽命题下的 owner 因此没被列出 | 同上。**`pupu:src/COMPONENTs/chat-bubble/**` 的 charter 无需改动** |

  **本庭据此提出一条边界自愈信号（非针对任何 charter，针对工具）**：`summon.py` 的「未命中任何路径 owner」桶把 `pupu:src/COMPONENTs/` 原样吐出（E-0002）。**一个跨多 owner 的目录前缀被报为「无 owner」，是本次两处漏人共同的近因** —— 它既不是无 owner，也不是单一 owner，而是 **需要收窄成可判定命题后再匹配**。本席以 grep 手工收窄（E-0004 / E-0005）才得到正确名单。交 `codex` 与 `chief-judge` 处置。

  **三 · 三项 quorum 判定（依 [quorum 第六节](../../../codex/lifecycle/quorum.md) 归档，备 `codex` 审查）**

  **(1) `codex` 不列为法定必到。** `summon.py` 机械命中 `codex`（`pupu:.claude/codex/adaptations.md`，1 处，E-0002）。该路径在 `case.md` 中的唯一出现是一句 **程序引用** ——「传唤须遵 A-012 分小批串行」。本案四问无一涉及 `.claude/codex/**` 的增删改。本判定与 `0000-0005-2026-0807#S-0003` 第三节 **同理同结论**，理由不重复。`codex` 依[宪法第三条](../../../codex/constitution.md)随时可自请出庭（列席，发言权同等），本席不得拒绝。

  **(2) `expert-ux` 不列为法定必到。** 五条触发条件（布局与视觉层级 / 主题与 isDark 明暗对等 / 间距排版圆角阴影 / 交互状态 / 可访问性）**逐条对照均未命中**：本案 `phase: motion` 不提出任何 UI 取舍；Q4 的措辞已把自己限定在「API 层面能不能区分」，**明文排除「该怎么显示」**。**该判定的可翻转性写在此处**：若庭审中出现任何具体呈现形态的主张（而非可行性判断），本席在第三层门禁重判并补行传唤；在此之前，出庭角色若产出此类内容，本席标注为「留待方案庭审」，**不删除、不改写、不压制**（[发言协议](../../../codex/lifecycle/speech-protocol.md)）。

  **(3) 四个 `dimension-owner` 均不列为法定必到。** 评估对象恒为「组织变更议案（增删改 agent / department / 组织规则 / 边界声明）」，本案是产品议案，对象未命中。依 [summons.md](../../../codex/lifecycle/summons.md) 的 `Dimension Owner` 例外条款，该例外只在评估对象 **被命中之后** 才要求四把尺子全体到场。**本庭将在闭庭产出中注明：四个组织维度均未被覆盖，且这是规则结果，不是缺席。**

  **另两项不传唤判定（逐条对照触发条件后作出）**：
  - `expert-security`：五条触发条件中最接近的是「IPC channel 或 bridge 面的增删改」。**本案不增删改任何 IPC channel 或 bridge 面** —— `GET_TREE` channel 与 `getTree` 桥方法 **今天已存在且已被测试覆盖**（E-0004、E-0006），本案只问能不能新增一个 renderer 侧消费者。未命中。**若庭审中出现对 channel / bridge 面的增删改主张，第三层重判**
  - `expert-llm`：`summon.py` 由 `memory_factory` 产出概念名候选（E-0002）。逐条对照六条触发条件：Q3 问的是「V2 侧是否存在散点坐标生成逻辑」，这是一个 **代码是否存在** 的事实问题，归 `code-owner-runtime`，不是「检索参数（embedding 模型 / chunking / 召回参数）」的取舍。未命中。**若 `code-owner-runtime` 的答复把 Q3 转成「该不该为 V2 造一套投影」，该问题即落入 `expert-llm` 边界，第三层重判**
  - `code-owner-unchain`：本案实体全部落在 `pupu:` 侧（E-0006 六段锚点无一在 `unchain:**`）。**但 `get_tree` 内部经 `list_entries` 是否下潜到 unchain library，本席未追**（`memory_v2_store.py:7416`）。**该判定明确挂在 `code-owner-runtime` 的答复上** —— 其若指出跨仓依赖，本席在第三层补行传唤（前案 `0000-0003-2026-0807` 即以此路径补入该角色）

  **四 · 传唤第二层（认领期）以缩减形式执行**

  依 [A-012](../../../codex/adaptations.md) 的并发约束，本庭 **不向全体 31 个 agent 广播**。以本案标题与一句话摘要为准，认领期以下列方式替代：本席已对全部 31 份 charter 的「所有权边界声明」段作了一次逐份人工对照（`summon.py` 打印的 11 个触发条件类角色 + 20 个路径类角色 + 5 个无边界声明段的 court 角色），补正结果即第一节的表。

  **未被补正的角色若认为本案落入自身边界，仍可在闭庭前任意时点自请出庭，本席不得拒绝。**

  **本层未覆盖的一类**（如实登记为已知缺口 G7）：「边界声明写窄、须 agent 本人看到具体议案才能辨认」的情形。人工对照只能发现「charter 写了但工具没匹配上」，发现不了「charter 根本没写」。

#### S-0004 | ASSESSMENT | code-owner-runtime → case
- **阶段**: 议案庭审
- **结论**: **有条件可行。** 服务端半边的四个待答问题全部实跑取得结论：Q4 三态在 API 层 **完全可判别**（200 / 503 / 400，错误码互不重叠，实测见 E-0010）；Q3 书记员自查 **成立**（V1 投影与 V2 store 是两个零共享子系统，V2 侧确无任何坐标生成逻辑，E-0007/E-0008/E-0009）；Q1 **不成立于默认配置** —— 本庭未看到的门确实存在，且不止一道：`electron/main/services/unchain/memory_v2_rollout.js:150` 使 `PUPU_CONTEXT_V2_STORE_OWNER` **只可能是 `off` 或 `unchain`，永不为 `pupu_legacy`**，而 shipped build 把它冻结为 `off`（E-0011）。**净效果：E-0006 所锚定的 `memory_v2_store.py:7408` 这一段 `get_tree`，在两种真实配置下都不是被执行的实现** —— 这是对本庭「已知事实 2」的一条实质更正。Q2 我 **部分承担**：判据归我，判定不归我
- **依据**: E-0006, E-0002, E-0007, E-0008, E-0009, E-0010, E-0011, E-0012, E-0013, E-0014, 0000-0003-2026-0807#S-0024
- **不确定性**:

  **一 · 我实跑不到的那一半（诚实标注，不掩盖）**

  我的执行环境 **无法 import `unchain` 包**（`ModuleNotFoundError: No module named 'unchain'`，仓根 `.venv` 同样不可导入，E-0010 尾注）。因此 `store_owner=unchain`（即今天 `npm start` 的实际取值）下的 `get_tree` **我未能实跑**，我的探针在该分支上返回的 `context_v2_unchain_read_unavailable` 是 **我环境的 ImportError**，不是产品行为，**不得当作产品结论引用**。该分支的行为我只做了 **静态代码比对**，结论按推断标注。

  **二 · G2 继承的空洞**

  本机 V2 store `entries=0`。我的取证靠 **临时目录内新建 store + 手工 `ensure_space`** 绕过，因此我能给出「空 store / 空 space」的真实返回，但 **「有数据时 tree 的嵌套形状」仍未取证**，凡涉及正常态一律标推断。

  **三 · R1 纪律标注（`0000-0003-2026-0807#S-0024` R1）**

  下列结论 **全部以「今天的 store owner 行为」为据，owner 切换当天需全部重核**：Q1 的默认配置结论、Q4 的 (b) 分支、可证伪条件 3 与 4、以及下方「两套实现返回形状不同」的全部内容。

- **请求/下一步**:
  1. 请本庭把「E-0006 的 store 段锚点在真实配置下不执行」记入更正，并要求 **方案庭审的验收对象改以 `memory_v2_unchain_read_adapter.py:432` 为准**，否则验收会验到死代码（E-0011、E-0014）
  2. **请求补行传唤 `code-owner-unchain`**：S-0003 第三节明写该判定「挂在 `code-owner-runtime` 的答复上」。我的答复是 —— **跨仓依赖存在且在 tree 的关键路径上**。`store_owner=unchain` 时 `get_tree` 的条目 `kind` 取值来自 `unchain:src/unchain/memory/workspace/models.py:251-255` 的 `MemoryEntryKind`，分页来自同仓 `memory_tree`/`memory_list`（E-0014）。tree view 的节点类型判定 **直接消费该枚举**
  3. 请本庭就「`store_owner=off` 是否必须能被一个 200 响应读出」列为显式选项（见 Q2 表态），这是唯一可能落到我边界的新构件
  4. **不请求** 在本阶段解决 `ownerChatId` 疑点 —— 服务端只认 query 参数 `owner_chat_id`，非空即可（E-0010 c 行），这一疑点整段在 renderer/preload/main 侧

- **评估结论**:

  ### Q1 · 管线完整性的服务端半边 —— **代码完整，默认配置下不可用**

  **(1) 服务端读路径的完整门清单**（我端全部的门，本庭可据此判定无遗漏）：

  | # | 门 | 位置 | 对 `get_tree` 是否生效 |
  |---|---|---|---|
  | 1 | 鉴权 token | `route_memory_v2.py:72-73` → 401 | **生效** |
  | 2 | 请求体 48MB 上限 | `route_memory_v2.py:74-80` → 413 | GET 无体，不触发 |
  | 3 | `read_only_degraded` | `route_memory_v2.py:84-88` | **GET 显式豁免** —— `PUPU_MEMORY_V2_READ_ONLY_DEGRADED` **不阻塞** tree 读 |
  | 4 | store owner 分派 | `route_memory_v2.py:315-361` | **生效，且是决定性的一道** |
  | 5 | `UNCHAIN_DATA_DIR` 未配置 | `memory_v2_runtime.py:698-707` → 503 `context_v2_unavailable` | 生效 |
  | 6 | owner ≠ `pupu_legacy` 时拒开 legacy runtime | `memory_v2_runtime.py:718-735` → 503 | 生效 |
  | 7 | unchain reader import / open | `route_memory_v2.py:338-361` → 503 | 仅 owner=unchain 时 |
  | 8 | **capability 检查** | `resolve_context_memory_v2_capability` 在 `route_memory_v2.py` 中 **只出现在 :987/:1004**，即 `/context/v2/status` 内部 | **不在读路径上** —— `get_tree` 不过 capability 门 |

  **(2) 决定性的门是第 4 道，而它由 Electron 决定，不由我决定。**

  ```js
  // electron/main/services/unchain/memory_v2_rollout.js:150
  const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";
  ```

  Electron **总是** 注入 `PUPU_CONTEXT_V2_STORE_OWNER`，且取值域只有 `{off, unchain}`。而 `configured_context_v2_store_owner()` 在 env 缺失时默认 `pupu_legacy`（`memory_v2_store_boundary.py:96`）—— 那条默认路径 **只在脱离 Electron 直跑 `python main.py` 时可达**。

  由此，三种真实配置：

  | 配置 | `store_owner` | `get_tree` 实际实现 | 结果 |
  |---|---|---|---|
  | **shipped 安装包** | `off`（`build/build_feature_flags.json` 冻结，`enable_memory_v2: false`） | **不执行** | 503 `context_v2_store_disabled` |
  | **`npm start`** | `unchain`（package.json `start:electron` 设 `PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all`） | `memory_v2_unchain_read_adapter.py:432` | 走 unchain 库 |
  | 裸跑 `python main.py` | `pupu_legacy`（env 缺失默认） | `memory_v2_store.py:7408` | E-0006 锚定的那一段 |

  **`get_tree` 在今天出厂的 PuPu 里一次也不会被执行。** 这不使议案不可行 —— 它把议案的性质从「接一个已通的管线」改成「接一个只在开启态通的管线，默认态必须显示未启用」。

  **(3) 还有一段本庭未列的前置调用。** `get_tree` 需要 `space_id`，而 `space_id` 只能来自 `GET /context/v2/memory/spaces`（`route_memory_v2.py:1082`）。该端点 **已全链路打通**（renderer facade `src/SERVICEs/bridges/context_v2_bridge.js:38,107` · preload `:81-82,218` · channel `electron/shared/channels.js:151` · handler `register_handlers.js:29,641`）。**所以真实管线是两跳，不是一跳**：`listSpaces → getTree`。

  **(4) 且 space 是惰性创建的。** 产品代码里 `ensure_space` 的 **唯一** 调用点是 `memory_v2_toolkit.py`（:642,659,663,688,946,982,1002,1087,1392,1528,1672）—— 即 **只有模型真正调用过 memory 工具的会话才有 space**。没调用过的会话 `listSpaces` 返回 `{"owner_chat_id": X, "spaces": []}`（HTTP 200，实测 E-0012 S1）。**这是「空态」里最常见的一种，而它发生在 `get_tree` 之前，不在 `get_tree` 里。**

  ### Q3（G4）· 「vector view 保持现状」的技术前提 —— **书记员自查成立，且比他说的更强**

  **(1) V1 侧：`/memory/projection` 与 V2 零关联，已核实。**

  `unchain_runtime/server/route_projection.py:406-452`。入参是 `session_id`（不是 `owner_chat_id`），数据源是 `memory_factory._get_or_create_qdrant_client(data_dir)` + `memory_factory` 的集合命名（`_vector_collection_prefix` / `_session_collection_name`），坐标由 `_project_vectors`（:344-370）以 `numpy.linalg.svd` 中心化后取前 5 主成分产出 `coords + variance`，聚类由 `_kmeans_2d_numpy`（:219）。

  **决定性负向事实**：`route_projection.py` 全文对 `store_owner` / `context_v2` / `memory_v2` 的匹配数为 **0**。它 **不是 store-owner 感知的**，因此 store owner 无论切到 `off` / `unchain` / `pupu_legacy`，V1 vector view 的行为完全不变。**「vector view 保持现状」在技术上是自动成立的，不需要任何人做任何事来维持它。**

  **(2) V2 侧：确无等价逻辑，且负向搜索是穷尽的。**

  - `unchain_runtime/server` 全部非测试 `.py` 中，`numpy` / `np.linalg` 只出现在 `route_projection.py`（+ `routes.py:5,87` 的再导出）。**V2 侧一行投影数学都没有。**
  - `memory_v2_*.py` 与 `route_memory_v2.py` 中，`coords` / `PCA` / `pca` / `umap` / `tsne` / `t_sne` / `"x":` 的匹配文件数为 **0**。
  - V2 的 14 个 GET 路由（`route_memory_v2.py:982,1009,1025,1057,1082,1111,1123,1160,1223,1237,1299,1313,1347,1453`）**无一返回坐标或向量**。

  **(3) 比自查更强的一条：V2 连原始向量都不出库。**

  V2 确有向量子系统 `memory_v2_vector.py`，但它对外的最小单位是 `VectorHit`：

  ```python
  # memory_v2_vector.py:151-156
  @dataclass(frozen=True)
  class VectorHit:
      chunk_id: str
      text_hash: str
      score: float
  ```

  **没有 embedding 字段。** 向量只存在于 Qdrant 里，任何调用方都拿不到。且 `context_v2_search` 走的 `search_entries`（`memory_v2_store.py:8425+`）是 **纯词法**（FTS5 + 子串），实测返回 `{"backend":"fts5","results":[],"vector_status":"disabled"}`（E-0012 S5）。V2 向量后端默认 **关闭** —— 除非设 `PUPU_MEMORY_V2_VECTOR_PROVIDER`（`memory_v2_vector.py:30-32,118-120`），否则是 `NullVectorBackend`。

  **(4) 对「V2 数据被选中时 vector view 技术上有什么可呈现」的直接回答：今天，什么都没有。**

  不是「有数据但没排版」，是 **没有数据**。要让它有，必须新造三样东西，缺一不可：
  1. 打开 V2 向量后端（新配置 + 一个 embedding provider，今天默认关）
  2. 一个新的服务端路由，返回逐条目的 embedding 或服务端算好的坐标（今天 14 个 GET 路由都不给）
  3. 投影计算本身（今天只在 `route_projection.py` 里，且与 V1 集合命名强耦合）

  这三样是 **新建**，不是「保持现状」。**且做与不做的取舍已经不是「代码存不存在」而是「该不该为 V2 造一套投影」** —— 依 S-0003 第三节对 `expert-llm` 的不传唤判定原文，**该转化条件已被我的答复满足**，请本庭在第三层重判是否补传 `expert-llm`。我不代其表态。

  ### Q4（G3）· 空态 / 未启用态的可判别性 —— **可判别，三态两两不重叠，已实跑**

  实测于 PuPu `b2385d5d`，命令与完整输出见 E-0010：

  | 情形 | HTTP | 载荷 | 可判别性 |
  |---|---|---|---|
  | **(a)** store 存在、space 存在、`entries=0` | **200** | `{"entries":[], "tree":[], "owner_chat_id":…, "space_id":…, "space_revision":1}` | ✅ 唯一的 200 |
  | **(b)** `store_owner=off` | **503** | `{"error":{"code":"context_v2_store_disabled","retryable":false}}` | ✅ 唯一码 |
  | **(c)** `owner_chat_id` 空串 **或** 完全省略 | **400** | `{"error":{"code":"context_v2_invalid_request","message":"owner_chat_id is invalid","retryable":false}}` | ✅ 唯一码，两种写法同码 |

  **本庭没问、但收端必然会撞上的另外四态**（同批实跑）：

  | 情形 | HTTP | code |
  |---|---|---|
  | `space_id` 不存在 | 404 | `context_v2_not_found` |
  | `space_id` 存在但属于别的 chat | 404 | `context_v2_not_found` |
  | `store_owner` 值非法 | 503 | `context_v2_store_owner_invalid` |
  | owner=unchain 但 reader 打不开 | 503 | `context_v2_unchain_read_unavailable` |

  **两条必须写进记录的限制**：

  - **404 是坍缩的**：「没有这个 space」与「这个 space 不属于你」返回 **完全相同** 的 404 + 同一 code + 同一 message。这在安全上是正确的（owner-scoping 不泄露他人 space 的存在性），但意味着收端 **无法区分「查错了」与「越权了」**。若方案庭审要求区分，那是一个 **需要放宽安全边界** 的改动，我预先反对。
  - **「空」有两个不同形状**：`{"spaces": []}`（会话还没有 workspace，200，`listSpaces` 阶段）与 `{"entries": [], "tree": []}`（有 workspace 但里面是空的，200，`getTree` 阶段）。这是两个语义不同的空，发生在两跳的不同跳上。

  ### Q2（G1）· 强制表态 —— **判据归我，判定不归我；有一个新构件可能落到我头上**

  **不接受「与我无关」，我不说这句话。逐条表态：**

  **(1) 本案确实会触到前案 D7/D8 的那个无主构件，而它在我这一层有具体形态：服务端今天没有任何端点能回答「V2 现在处于哪一态」。**

  看起来最该承担这个职责的是 `/context/v2/status`（`route_memory_v2.py:982`）。**但它在最需要它作答的那一态里自己就 503 了** —— 实测：`store_owner=off` 时 `GET /context/v2/status` 返回 **503 `context_v2_store_disabled`**（E-0010 b3 行 / E-0012 S4 同因）。原因在 `_status_for_store_owner`（:786-799）：owner 非 `unchain` 时它直接调 `_runtime()`，而 `_runtime()` 对 `off` 一定抛。

  **净效果：「未启用」这一态只能从错误码反推，读不出来。** 前端要判态，只能 catch 503 再匹配 `error.code` 字符串。**那是把状态契约建在错误消息上。** 这就是 D7/D8 说的那个「多方需要、今天没有 owner」的构件在服务端的确切样子。

  **(2) 本案是否要求我的边界承担一个今天不属于我的判定职责？——「给判据」已经是我的，且已做到；「做判定」不是我的。**

  - **落在本边界（且今天已满足）**：产出机器可读、互不重叠的状态信号。Q4 的七种情形已经做到这一点，**不需要新工作**。我提供的是判据，不是判定。
  - **不落在本边界**：把这些信号收敛成一个「四态」并决定谁是权威。这跨 renderer / preload / main / sidecar 四层。**且 main 里已经存在一个半成品单一状态源**：`memoryV2Readiness`（`electron/main/services/unchain/service.js:1068`，形状 `{status: "ready"|"degraded"|…, reason, sidecarFingerprint}`，由 `validateMemoryV2Status` 在 :1866 与 :1961 两处写入）。**但我 grep `electron/main/ipc/` `electron/preload/` `src/SERVICEs/` 三处，`memoryV2Readiness` 零命中 —— 它没有以该名字暴露给 renderer。** 一个已经存在、只差一段暴露的状态源，比新造一个便宜得多。
  - **谁能判断**：**`code-owner-electron`**（它持有 `memoryV2Readiness` 这个既有状态，也持有 `requireContextV2OwnerChatId` 这道门）与 **`expert-architecture`**（落位与权威归属）。**不是我。**

  **(3) 唯一可能真正落到我头上的新构件（我主动登记，请本庭记为显式选项）**：

  > 若庭审判定「`off` 态必须能被一个 200 响应读出」，则我边界内需二选一：(i) 改 `_status_for_store_owner`，使 `off` 返回 200 + `available:false` 而非 503；(ii) 新开一个不依赖 store owner 的探针端点。

  **我不主张现在做**，因为它直接就是前案 Q0 的子问题，在 Q0 裁定前单独定它会制造第二个权威。但 **不做的代价必须被显式接受**：前端判态将依赖错误码字符串匹配。

  **(4) G1 是否构成前置阻塞？—— 对可行性论证不阻塞；对方案定稿阻塞。**

  我的 Q1/Q3/Q4 三项结论 **不依赖前案任何裁定**，它们是当前 revision 上的代码事实与实测事实。所以 **本案可以在 `0000-0003-2026-0807` 裁定之前完成议案庭审**。但上面 (3) 那个选择是 Q0 的子集，**方案庭审若在 Q0 裁定前定它，就是在前案的答案到达前先替它作答**。我建议本案进入方案庭审的门槛条件里加一条：Q0 裁定到达，或本案显式声明不碰状态源、只做错误码消费。

  ### 丙 · 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

  **任一条成立即翻**：

  1. **若本案要求 tree view 在 shipped 默认配置下就能显示真实 V2 数据。** 不可行。今天出厂的 `build/build_feature_flags.json` 是 `enable_memory_v2: false` + 冻结的 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`（E-0011）。要做到，本案就得同时变成一个 rollout 议案（改 build feature flag + 重出 release snapshot 指纹），那远超「加一个 view」。**议案必须显式接受：默认态下 tree view 只能显示「未启用」。**
  2. **若「vector view 保持现状」被解释成「V2 数据被选中时 vector view 里也要有东西」。** 不可行。需新造三样（开向量后端 / 新端点 / 投影计算，见 Q3(4)），且落 `expert-llm` 边界。
  3. **若验收对象被写成 `memory_v2_store.py::get_tree`。** 该实现在两种真实配置下都不执行（E-0011），验收会验到死代码。必须改以 `memory_v2_unchain_read_adapter.py:432` 为准。
  4. **若方案假设两个 owner 的 `get_tree` 返回同一形状。** —— **这一条我已部分证伪，它不是假设风险，是已确认的分歧**（E-0014）：

     | | `pupu_legacy`（`_entry_response`, `memory_v2_store.py:6642-6669`） | `unchain`（`_route_entry`, `…read_adapter.py:532-567`） |
     |---|---|---|
     | `kind` 取值域 | `folder` / **`file`** / `link` | `folder` / **`markdown`** / **`image`** / `link`（`unchain:src/unchain/memory/workspace/models.py:251-255`） |
     | 时间戳 | `created_at_ms` · `updated_at_ms` · `created_by` | **全无** |
     | `tags` | **无** | 有 |
     | `source_refs` | **无**（只有单个 `source_event_id`） | 有（列表）+ `source_event_id` |
     | `content_ref` 触发 | `kind == "file"` | `kind in {markdown, image}` |
     | `content_bytes` | 有 | **无** |
     | `space_revision` 来源 | `row["space_revision"]` | `entry.updated_seq` |

     **叶子节点的 kind 词汇表除 `link` 外完全不相交。** 一个按 `file` 分支渲染图标的 tree view，在 `unchain` owner 下每个叶子都会掉进 unknown 分支；反之亦然。**且这正是我记忆里 `unchain-drop-silently-whitelists` 那一类形态：白名单构造，未列字段无声消失。** 方案庭审必须选定一个 owner 作为契约基准，或显式做双形状归一 —— **归一层放哪一层，是 `expert-architecture` 的落位问题，不是我的。**
  5. **若前案 Q0 裁定把「单一状态源」定为本案的前置交付。** 那本案 scope 从「加一个 view」变成「先建状态源」，可行性需整体重判。

  **不会被推翻的（已实测钉死，可作为方案庭审的地基）**：Q4 三态 API 层可判别；GET 不受 `read_only_degraded` 影响；capability 检查不在读路径上；`listSpaces` 全链路已通；`route_projection.py` 零 store-owner 感知因而 V1 view 自动保持现状。

- **边界命中依据**: `pupu:unchain_runtime/**`，第一层路径机械命中 3 处（E-0002）。本次实际作业触及本边界内 `unchain_runtime/server/` 下 12 个文件：`route_memory_v2.py` · `memory_v2_store.py` · `memory_v2_store_boundary.py` · `memory_v2_runtime.py` · `memory_v2_rollout.py` · `memory_v2_vector.py` · `memory_v2_unchain_read_adapter.py` · `memory_v2_toolkit.py` · `route_projection.py` · `routes.py`。跨界只读引用（**不构成本边界主张**）：`pupu:electron/main/services/unchain/memory_v2_rollout.js` 与 `service.js`（归 `code-owner-electron`）、`pupu:src/SERVICEs/bridges/context_v2_bridge.js`（归 `code-owner-shared-arteries`）、`unchain:src/unchain/memory/workspace/models.py`（归 `code-owner-unchain`）—— 三处都只用于确认我这一段的上下游取值，结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案推进，我边界内 0 处必须改动。** 服务端 `get_tree` / `list_spaces` 两个端点已完整，无需为 tree view 新增或修改任何路由。这是我这一半的主要结论。
  - **条件性影响 1**：若庭审选定「`off` 态须 200 可读」，则 `route_memory_v2.py:786-799 _status_for_store_owner` 需改，或新增一个 store-owner 无关的探针端点。**改完 sidecar 必须重启才生效**，报告与验收都须标注。
  - **条件性影响 2**：若庭审选定服务端做双 owner 形状归一，则 `memory_v2_unchain_read_adapter.py:532 _route_entry` 与 `memory_v2_store.py:6642 _entry_response` 需对齐字段集与 `kind` 词汇表。**我预先提示：这会改动 `chat-bubble` 三个既有 V2 消费者已在依赖的响应形状（E-0005），破坏面非零，不是「只加不减」。**
  - **无影响**：`route_projection.py` 及全部 V1 投影路径。V1 vector view 不因本案发生任何改动，也不需要任何改动来「保持现状」。

- **约束**:
  1. **不得在本案内顺手改检索参数、chunking 或 embedding 配置。** V2 向量后端的开关与 provider 选择落 `expert-llm` 的 spec，不落我。我只报告它今天是关的。
  2. **不得把 `memory_v2_store.py::get_tree` 写进任何验收断言。** 它在两种真实配置下都不执行。
  3. **`.py` 改完 sidecar 必须重启**（本仓工程铁律），任何涉及服务端的验收步骤须显式包含重启，否则验的是旧代码。
  4. **跨仓改动强制双边取证**：一旦方案触及 `MemoryEntryKind` 或 workspace 条目形状，PuPu 与 unchain 两侧的 impact 都要有，单边看不全爆炸半径。
  5. **本机 V2 store `entries=0` 这一条不因我的取证而消除。** 我用临时目录新建 store 取到了空态返回，**这不等于取到了正常态**。凡涉及「有数据时」的主张仍是推断。

- **建议处置**: **本案可进入方案庭审，但须先由 `chief-judge` 或本庭确认三项前置声明**，否则方案会建在错误的地基上：
  1. **确认议案接受「默认配置下 tree view 显示未启用」**。不接受则本案性质变更（见可证伪条件 1）。
  2. **确认契约基准 owner 为 `unchain`**，并把 `memory_v2_unchain_read_adapter.py:432` 定为验收对象。**这是我最强的一条建议** —— 它同时消掉可证伪条件 3，并把条件 4 从「未知」降为「已知且有界」。
  3. **确认本案是否碰状态源**。碰 → 建议等 `0000-0003-2026-0807` Q0 裁定；不碰 → 显式声明 tree view 以错误码消费方式判态，并把「契约建在错误码上」记为已接受的技术债。

  另请本庭在第三层门禁 **重判两项传唤**：补传 `code-owner-unchain`（跨仓依赖已确认存在，见「请求/下一步」2）；重判 `expert-llm`（Q3 的转化条件已被我的答复满足，见 Q3(4)）。两项都是 S-0003 明写「挂在 `code-owner-runtime` 答复上」的判定，我已作答，处置权归本庭。

#### S-0005 | ASSESSMENT | code-owner-settings → case
- **阶段**: 议案庭审
- **结论**: **有条件可行，且必须按挂载点切成两半判定** —— side-menu 那一路（`mode="session"`）**可行**，前提是挂载点显式补传 `ownerChatId`（一个 prop 契约变更，落在 `code-owner-chat-core` 的文件里，不在我边界内）；settings 那一路（`mode="long_term"`）**以今天的 API 面不可行** —— 该挂载点在作用域内没有任何 chat 上下文（E-0017），而 V2 的整个读平面是 owner-scoped 的（E-0018），二者是模型不匹配，不是接线漏了。`ownerChatId` **不卡死本议案**，但它把议案的适用面砍掉一半，这一半必须由 CEO 显式取舍，不能在方案庭审才发现
- **依据**: E-0015, E-0016, E-0017, E-0018, E-0019, E-0020, E-0021, E-0003, E-0005, E-0006, 0000-0003-2026-0807#S-0005
- **不确定性**:
  1. **未起 sidecar、未发过一次真实请求、未运行应用、未跑测试。** 全部结论来自 PuPu `b2385d5d` 的静态阅读。凡涉及 `get_tree` 运行时行为的，我一律标为「归 `code-owner-runtime`」。
  2. **本机 V2 store `entries=0`（G2）。** 「有数据时 tree 有多少节点、深度多少、渲染是否撑得住」**结构上无法取证**，本发言中任何涉及正常态的量级判断都是 **推断**。
  3. **`node.chatId` 与 `use_chat_stream` 的 `currentChatId` 是否严格同一个 id 空间**，我做到了强旁证（E-0016）但没有做到证明 —— 两者都从 `chatStore` 取，且 `use_chat_stream.js:11985` 把 `currentChatId` 直接当 `ownerChatId` 用。**请 `code-owner-chat-core` 在自己边界内确认**，这一条若翻转，我的 Q1 结论前半段随之翻转。
  4. **`requireContextV2OwnerChatId` 缺参/错参时的行为归 `code-owner-electron`（G5）。** 我只核到正则会 **接受** 一个语义错误的 id（E-0016），没核到缺参路径。
  5. **发布构建的 `enable_memory_v2` 快照未核实**（与 `0000-0003-2026-0807#S-0005` 不确定性 3 同源，至今未消除）—— `.local/build_feature_flags.snapshot.json` 不入库，`FEATURE_FLAG_DEFINITIONS` 里的 `defaultValue: false` 不是发布值。任何「反正 flag 是关的所以不急」的论证，请先问是哪一份快照。
- **请求/下一步**:
  1. **请本庭把议案的适用面明确成一问交 CEO**：tree view 是只给 **per-chat** 的 Inspector（side-menu 入口），还是 settings 那个全局 Inspector 也要有？**这两个答案导出两套完全不同的可行性结论**（前者是接线，后者需要一条今天不存在的 owner-less 读路由）。我按「只给 per-chat」承接；若答案是两者都要，请把它当作 **新的待裁问题** 而不是实施细节。
  2. **请 `code-owner-chat-core` 确认** `0000-0003-2026-0807#S-0024` C4 的「挂载接口补 `ownerChatId` 且破坏面为零」承诺 **今天是否仍然有效**，并确认 side-menu 右键两条分支（普通 chat / character chat，E-0016）**各自应当传什么值**。character chat 那条分支今天传的是 `character_<x>__dm__<y>`，**它不是 chat id**。
  3. **请 `code-owner-runtime` 回答（G3 的服务端半边）**：`get_tree` 在 (a) space 存在但 `entries=[]`、(b) space 不存在、(c) owner 从未存在过、(d) `store_owner=off` 四种情况下各自的 HTTP 状态与 body。**(c) 是本案独有的新问题**，前案没问过 —— 它决定了 E-0016 的「静默错主」是会被后端挡住还是会静默返回空树。
  4. **请 `code-owner-shared-arteries` 与 `expert-security` 就一件事表态**：Inspector 成为 `contextV2Bridge.getStatus()` 的 **第一个 renderer 消费者**（E-0020）是否可接受。这是我 Q4 答案的唯一支点，被否决则 Q4 塌回不可判别。
  5. **请 `expert-architecture` 就 Q2 的落点表态**（详见下文第三节）—— 我在自己边界内能实现，但我 **不承接「四态判定归谁定义」这个判断本身**。
- **评估结论**: 逐问见下。总括：**Q1 = 有条件可行（分半）；Q4 收端 = 能区分，但只能靠两次调用配对，且要以 `getStatus` 为准；Q2 = 直接踩中，不构成进入方案庭审的阻塞，但构成方案庭审的议程首项，否则我边界内会长出第 4 份四态拷贝。** 附 8 条约束（C1~C8 为 `0000-0003-2026-0807#S-0005` 已提、本案继续成立者，编号沿用不重复展开；本案新增 N1~N4）
- **边界命中依据**:
  - `pupu:src/COMPONENTs/memory-inspect/**` —— 第一层路径机械命中（E-0002 / S-0003）。`memory_inspect_modal.js` 是 Inspector 主体的 **唯一实现**，959 行，六态状态机、两个 mode、5s 轮询、PCA 轴选择器、profile explorer 全在这一个文件里（E-0015）。
  - `pupu:src/COMPONENTs/settings/**` —— Inspector 两个挂载点之一在 `settings/memory/index.js:474-478`（E-0003 / E-0017），G6 点名归我的那一半就是这里。
  - `pupu:src/SERVICEs/feature_flags.js` —— `enable_memory_v2` 的定义与读取语义在我边界内（E-0020 附注）。它是「V2 未启用」这个概念在 renderer 侧唯一的本地信号，**但它不等于 `store_owner`**，见第二节。
- **受影响对象**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js` —— 组件签名 `:326-332`、唯一数据源分支 `:374-377`、empty 判据 `:398-408`、5s 静默轮询 `:358-442`、失败渲染 `:584-603`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.test.js` —— 现有唯一测试锁的是 long-term profiles 自动切换（`:59-93`），任何 view 切换改造都会动到它
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/memory/index.js` —— `:474-478` 挂载点；`:46` 组件签名 `({ onNavigate })`，**无 chat 上下文**
  - **跨边界，仅登记不主张**：`src/COMPONENTs/side-menu/side_menu.js:296-298, 772-779` 与 `side_menu_context_menu_items.js:194-225`（`code-owner-chat-core`）· `src/SERVICEs/bridges/context_v2_bridge.js`（`code-owner-shared-arteries`）· `electron/main/services/unchain/service.js:1945-1985, 2098-2116`（`code-owner-electron`）· `unchain_runtime/server/route_memory_v2.py:1111-1120` 与 `memory_v2_store.py:7408-7434`（`code-owner-runtime`）· `src/locales/**` 11 个 locale 文件（`code-owner-shared-arteries`）
- **约束**:
  - **C1~C8 继续成立**（`0000-0003-2026-0807#S-0005`，该案 `awaiting-ruling`，**这些是我的已归档主张不是裁定**）。本案直接被踩到的三条：
    - **C1** 不得以「载荷里没东西」作为 empty 的唯一判据 —— 今天 Inspector 正是这么干的（E-0021），tree view 不得复制。
    - **C4** 静默轮询不得驱动「有 → 无」方向的状态迁移 —— 今天 5s 静默刷新会在用户零操作下把 `ready` 翻成 `empty` 并吞掉失败（E-0021）。**tree view 若挂进同一个 effect 循环就继承这个 bug。**
    - **C8** Inspector 的 mode 数量冻结在 2，**任何第三种内容视为新建组件**。C8 原文把「entry 列表」逐字列为要另开组件的例子 —— 而 `get_tree` 在服务端就是 `list_entries` 之上组树（E-0019）。**本案在字面上命中我自己写的 C8。** 我不以 C8 反对本议案：C8 约束的是「不得再往那 959 行里塞」，不是「不得有第三种内容」。tree view 作为 `memory-inspect/` 下的 **新组件**（仍归我）由 modal 组合，C8 即满足。
  - **N1（新）· tree view 不得把 `sessionId` 当 `ownerChatId` 用。** 二者在 chat-core 的生产侧就是两个值（`use_chat_stream.js:11978, 11985`：`sessionId = characterConfig?.session_id || currentChatId`，`ownerChatId = currentChatId`），且错误的那个 **能通过 main 的正则**（E-0016）。必须由挂载点显式传入一个新的 `ownerChatId` prop，**不许在 modal 内部推导**。
  - **N2（新）· tree view 的「未启用」判定必须来自 `contextV2Bridge.getStatus()`，不得来自 `get_tree` 的载荷，也不得来自 `enable_memory_v2`。** 前者是服务端权威（E-0020），后者是 renderer 本地 UI gate，二者可以不一致；用 flag 冒充 store 状态就是又造一个假状态源。
  - **N3（新）· 不得请求在 `getStatus` 上增加任何计数或「有无数据」位。** `electron/main/services/unchain/service.js:1941-1943` 把 count-free 写成了明确不变量（"any row counts … can never leak out as a free enumeration oracle"）。空/非空只能来自数据调用，启用/未启用只能来自 status —— 这是 **两次调用的 join，不是一次返回的字段**。
  - **N4（新）· settings 挂载点在拿到一条 owner-less 的 V2 读路由之前，不得被赋予 tree view。** 替代方案「在 settings 里加个 chat 选择器」等于在 settings 里重建会话列表，与我在 `0000-0003-2026-0807#S-0005`「零 · 读法 A」里已论证反对的是同一件事。
- **建议处置**:
  1. **判定为「有条件可行」并进入方案庭审，但把适用面（per-chat / 全局）作为一条待 CEO 拍板的前置写进裁定文本**，不要留给方案庭审自行解释。
  2. **方案庭审的议程首项必须是「统一四态判定的落点与 owner」**（Q2，见第三节），而不是 tree view 本身。顺序反了，实施就会在我边界内产出第 4 份独立四态拷贝。
  3. **实施切成三片，且顺序不可换**：(a) 挂载点补 `ownerChatId`（chat-core）→ (b) 四态判定模块落位并由三个 chat-bubble 消费者与 Inspector 共用（owner 待定）→ (c) tree view 组件（我）。**(c) 单独先做是可以跑起来的，但那正是我反对的那条路** —— 它会把 (b) 永久推迟。
  4. **`get_tree` 的 (c) owner 从未存在过 这一情况请 runtime 明确**，并请本庭把它列为新增已知缺口 —— 前案没有这一问，而 E-0016 使它成为本案的实质风险面。

---

## 一 · Q1 —— `ownerChatId` 从哪来（按本庭的新表述作业）

本庭把疑点重述为「这个值在 A 处拿得到、在 B 处拿不到」。我核完之后要再收窄一次：**在我这一侧，它在 A 处也不是「拿得到」，而是「有一个长得很像它的东西」**。

### 1.1 modal 内部今天与 V2 完全无关

`grep -rn "ownerChatId|context_v2|contextV2" src/COMPONENTs/memory-inspect/` → **0 命中**（E-0015）。Inspector 今天的唯一数据源是 V1 projection 的两个方法：

```
memory_inspect_modal.js:374-377
  const fetchPromise =
    mode === "long_term"
      ? unchainApi.getLongTermMemoryProjection()   // 无参
      : unchainApi.getMemoryProjection(sessionId); // 唯一入参 = sessionId
```

所以「modal 拿不到 `ownerChatId`」这句话字面正确，但它掩盖了真正的问题：**modal 从来就不在 V2 的读平面上**。它不是少一个参数，是整条数据源要换。

### 1.2 A 处（side-menu）传进来的 `sessionId` 是一个 **多态 id**，不是 `ownerChatId`

这是本节最重要的一条。`side_menu_context_menu_items.js` 的右键构建器有 **两条分支**（E-0016）：

```
:197-207  普通 chat 之外的 character chat 分支
          memorySessionId = buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")
          onInspectMemory(memorySessionId, chatTitle)      →  "character_<x>__dm__<y>"

:217-223  普通 chat 分支
          onInspectMemory(node.chatId, chatTitle)          →  "chat-…"
```

两个值走同一个 prop 名 `sessionId`。生产侧的 chat-core 自己是把这两个概念分开的：

```
use_chat_stream.js:11978-11986
  const targetSessionId = characterConfig?.session_id || currentChatId;
  ...
  resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, sessionId: targetSessionId })
```

**净效果**：`ownerChatId` = UI chat id；`sessionId` = character session id **或** chat id。Inspector 收到的是后者。在普通 chat 分支上二者恰好是同一个字符串，**但 modal 无法知道自己拿到的是哪一支**。

而且错的那一支 **不会报错**：`CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/`（`electron/main/services/unchain/service.js:120`）对 `character_foo__dm__main` **返回 true**（E-0016，实跑 node 验证）。也就是说，如果 tree view 图省事把 `sessionId` 当 `ownerChatId` 传下去，character chat 会以一个 **语法合法、语义错误的 owner** 去查 —— 后端会怎么回，归 runtime（我的请求 3(c)），但 renderer 这一侧 **拿不到任何信号说自己查错了人**。

**这就是为什么我把 N1 写成硬约束，而不是实施注意事项。**

### 1.3 B 处（settings）不是「少传一个 prop」，是作用域里根本没有 chat

- `MemorySettings = ({ onNavigate })`（`settings/memory/index.js:46`）—— 唯一入参是导航回调。
- 整个 `src/COMPONENTs/settings/**` 里除 `token_usage/storage.js` 把 `chatId` 作为 **用量记录的一个字段** 之外，**没有任何 chat 上下文**（E-0017）。
- 它今天调的 `getLongTermMemoryProjection()` **无参** —— V1 的长期记忆视图在设计上就是 owner-less 的全局视图。

而 V2 的读平面 **每一个方法都是 owner-scoped**（E-0018）：`listContextV2Spaces` 要 `ownerChatId`；`getContextV2Tree` 要 `ownerChatId` **和** `spaceId`。所以 settings 那一路要显示 tree，第一步就得回答「显示谁的树」—— 这是产品问题不是接线问题。

**附带一条对议案有独立价值的发现**：`memory_v2_store.get_tree` 的签名里 **有** `allow_long_term` 与 `namespace` 两个参数（`memory_v2_store.py:7408-7414`），但 Flask 路由 **不读它们**（`route_memory_v2.py:1111-1120` 只取 `owner_chat_id`），主进程 **也不转发**（`service.js:2108-2116` 的 query 只有 `owner_chat_id`）。**「long_term」这个概念在 `get_tree` 里存在，但从 PuPu 今天的调用面上不可达。** 权威解释归 `code-owner-runtime`；我只登记代码事实（E-0018/E-0019）。

### 1.4 Q1 的直接回答

> **`ownerChatId` 从哪来？** —— 从挂载点显式传入，别处都不行。
> **两个挂载点的 props 差异（G6）在我端意味着什么？** —— 意味着 **议案对两个挂载点不是同一个议案**。A 处是「补一个 prop + 消歧两条右键分支」；B 处是「V2 今天没有全局读路径」。
> **是否卡死本议案？** —— **不卡死 A 处**（前提：chat-core 的 C4 承诺仍有效，请其确认）。**以今天的 API 面卡死 B 处**，除非议案接受 B 处不做。

---

## 二 · Q4 收端半边 —— 空态与未启用态在 API 层面能不能区分

### 2.1 Inspector 今天怎么处理 `/memory/projection` 的 200-空成功

跨案引用 `0000-0003-2026-0807#S-0005`（C1、C4），此处只补本案需要的最小事实（E-0021）：

```
memory_inspect_modal.js:398-408
  if (pts.length === 0) {
    ... if (mode === "long_term" && nextProfiles.length > 0) setStatus("profiles")
        else setStatus("empty");
  }
```

**判据是且仅是 `points.length === 0`。** 一个 200-空成功和一个「后端把失败归一化成了空」在这里 **完全同形**。而「V2 未启用」这个状态 **在 V1 的词汇表里根本不存在** —— 它不是被误判，是压根没有对应的枝。

再叠一层 C4：`:434-436` 的 5s 静默轮询会 **在用户零操作下** 把 `ready` 翻成 `empty`，且 `:424-430` 的 `if (!silent)` 让静默轮次的失败 **完全无声**。

### 2.2 如果 `get_tree` 也返回一个无判别位的 200，我能不能区分？

**能，但不能只靠 `get_tree`。** 拆成三段：

**(a) `get_tree` 的 200 自身 —— 无判别位。** 返回体是 `{owner_chat_id, space_id, space_revision, entries, tree}`（`memory_v2_store.py:7423-7434`，E-0019）。空 store 就是 `entries: []` + `tree: []`，**没有任何字段说明「V2 是否启用」**。这一条与议案 Q4 的假设一致。

**(b) 「未启用」有一个独立且权威的判别源，而且已经在 bridge 上了。** `contextV2Bridge.getStatus()`（`src/SERVICEs/bridges/context_v2_bridge.js:102`）→ 主进程返回

```
{ available, schemaVersion, journalMode, lexicalBackend,
  vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded }
```

（`service.js:1945-1985`，E-0020）。`available:false` / `rolloutMode:"off"` / `featureCeiling:"off"` 就是「未启用」。**它是 renderer 今天能拿到的、唯一不靠猜的启用态信号。**

**(c) 但它是 count-free 的，而且是刻意的。** `service.js:1941-1943` 的注释把这写成了不变量：status 从 allowlist 重建，**任何行计数都不得泄出，以免成为免费的枚举 oracle**。所以：

> **启用/未启用 → 只能问 `getStatus`；空/非空 → 只能问 `get_tree`。这是两次调用的 join，不存在「一次返回里的判别位」这种解法，也不应该去要一个。**（N3）

**(d) 实际上不止两态，最少四态。** renderer 侧还有两类与上面正交的出口：bridge 缺席（`isAvailable()` 为假 → `context_v2_unavailable`，`context_v2_bridge.js:68-74`）、runtime 未就绪或不可达（`context_v2_readiness_failed` / `context_v2_unreachable` / `context_v2_failed`，`service.js:1898-1940`）。码集是 **开放的**，所以 C2（默认拒真、其余一律落第三态）继续成立。

### 2.3 一条本案独有的发现，请本庭记入

**`contextV2Bridge.getStatus()` 今天在整个 renderer 里零消费者**（E-0020）。三个 chat-bubble 消费者用的是 `isAvailable()`（bridge 在不在）+ 错误码事后归因，**没有一个问过「V2 到底开没开」**。

也就是说：**判别位早就造好了、接到 bridge 了、没人用。** 这不是「缺一个能力」，是「缺一个 owner 去把它变成一个状态」。这一条直接把我送进第三节。

---

## 三 · Q2（G1）—— 强制表态，我不说「与我无关」

### 3.1 是否直接踩中？—— 是，而且是最直接的一次

前案 `#S-0014` D7 与 `#S-0024` D8 指的那个「被多方需要、今天没有 owner」的构件，具体化到本案就是：

> 把 **(bridge 可用性 × `getStatus` × 数据调用结果 × 错误码集合)** 映射成一个用户可见状态的那一段逻辑。

今天这段逻辑存在 **四份互不相干的实现**：
1. `memory_v2_journal_reload.js`（`:513-521` 自己构造 `status:"Unavailable"` + `reason` + `errorCode`）
2. `memory_v2_pending_reviews.js`（`:181-187` `errorPresentation()` + `:176-190` 的 `STALE_DECISION_CODES` 白名单）
3. `memory_v2_trace_audit.js`
4. `memory_inspect_modal.js` 的六态机（V1 口味，**没有「未启用」这一枝**）

**在 modal 里加 tree view，就是在同一个进程里造第 5 份。** 而且是第一份需要 **同时** 处理「V1 的四态」和「V2 的四态」的 —— 因为议案明写 vector view 保持现状，所以 **同一个组件里会并存两套语义不同的状态词汇**。这是 D7 描述的那个洞在本案里的确切形状。

### 3.2 是否会要求我的边界承担一个今天不属于我的判定职责？—— **部分是，我明确区分**

| 职责 | 今天在哪 | 本案会不会推给我 | 我的立场 |
|---|---|---|---|
| 把 `rolloutMode` / `featureCeiling` / `available` **算出来** | `electron/main/services/unchain/memory_v2_rollout.js` + runtime 的 `store_owner` | 不会 | 不是我的，也不该是我的 |
| **定义** 四态的判据（哪些码算「未知」、哪些算「无」） | **无人**（四份拷贝各自即兴） | **会** —— 我一写 tree view 就得当场定一遍 | **我不承接这个定义权。** 我承接的是「按已定义的判据渲染」 |
| 决定 settings 那个全局 Inspector 该显示谁的树 | **无人** | **会** | **不落在本边界。** 这是产品/架构判断，归 `expert-architecture` 出意见 + CEO 裁定 |
| 在 `memory-inspect/**` 内实现渲染与组件切分 | 我 | 会 | **承接** |

第二行是关键：**我可以在自己边界内写出第 5 份四态映射并且它能跑**。正因为能跑，才更需要本庭点名 —— 一个「能跑但会加深结构缺口」的实施，不会在验收时被任何人拦下来。

### 3.3 是否构成进入方案庭审的前置阻塞？—— **我的表态：不构成，但有一个硬附加条件**

**不构成**的理由：可行性论证不依赖前案的裁定。上面三节的每一条结论在 16 项强制回应的 **任何** 回应组合下都不变 —— 它们是代码形状，不是政策。

**硬附加条件**：方案庭审的议程 **首项必须是** 「四态判定模块落在哪一层、owner 是谁」，且该项 **必须有指派结果** 才能进入 tree view 本身的方案。理由是 `expert-architecture` 在前案已经明言的那句 —— **传唤机制解不了它，只有指派能解**。而本案会把「不解决它的代价」从「三份拷贝」推到「五份拷贝，且其中一份要同时讲两种语言」。

**换个说法，可证伪地**：如果方案庭审开庭时该构件仍无 owner，我的实施只有两条路 —— 造第 5 份拷贝，或者擅自替全组定义判据。**两条我都不接受**，届时我会以「前置未落地」拒绝承接实施，而不是硬做。这不是现在的阻塞，是届时的阻塞，**现在写下来是为了它届时不算意外**。

---

## 四 · 丙 —— 可证伪形式：什么条件下「可行」翻成「不可行」

我表态可行。以下 **任一** 条成立，我的表态即翻转，请本庭逐条登记为验收前必须闭合的检查点：

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **F1** | `code-owner-chat-core` 表示 `0000-0003-2026-0807#S-0024` C4 的 `ownerChatId` 承诺 **不再有效**，或挂载点无法新增 prop | side-menu 那一路 **不可行**（modal 内部无合法推导路径，N1 禁止猜） | chat-core |
| **F2** | `contextV2Bridge.getStatus()` **不允许** 被 Inspector 调用（shared-arteries 或 `expert-security` 反对新增 renderer 消费者） | Q4 塌回不可判别 → 按 C2 全部落第三态 → **空 store 与未启用态在用户面前同形** → 我判 **不可行**（这正是前案 Q8 的塌缩重演） | shared-arteries / expert-security |
| **F3** | `code-owner-runtime` 答复 `get_tree` 对 **从未存在过的 owner** 也返回 200 + 空树，且无任何区分位 | E-0016 的「静默错主」变成不可检测 → character chat 分支必须先做 owner 预检，否则 **不可行**（会稳定地给用户看一棵不属于他的空树） | runtime |
| **F4** | 议案的适用面被裁定为「settings 全局 Inspector 也要 tree view」，且不先落一条 owner-less 读路由 | 该挂载点 **不可行**（N4）。整个议案降级为「只能做一半」 | CEO 裁定 + runtime |
| **F5** | 方案庭审开庭时四态判定构件仍无 owner（第三节的硬附加条件未闭合） | 我 **拒绝承接实施**（不是技术不可行，是我不接受在自己边界内造第 5 份拷贝或替全组定判据） | chief-judge 的指派 |
| **F6** | 要求 tree view 写进 `memory_inspect_modal.js` 本体而非 `memory-inspect/` 下的新组件 | 违反 C8。技术上做得到，**我判为结构上不可接受**，会以 `OBJECTION` 形式重提 | 方案庭审 |
| **F7** | 本机 `entries=0` 的限制在方案阶段仍未解除，且议案要求对「正常态渲染量级」给出承诺 | 我给不出 —— 任何量级承诺都是推断（G2）。**需要一条造数据的路径**（fixture 或真机灌数），否则验收标准里不得出现正常态的性能/形态条款 | 全体（G2 是共有缺口） |

**关于 F2 的补充**：这是七条里唯一一条会把结论从「可行」直接推到「不可行」而 **没有任何绕行方案** 的。`enable_memory_v2` 这个 flag 看起来像个替代品，但它是 renderer 侧的 UI gate，**与服务端的 `store_owner` 是两个独立的值、可以不一致**（且发布构建下 flag 的持久化值根本不被读取 —— `feature_flags.js:92-95`，`NODE_ENV==="production"` 时直接短路到 build 快照）。**拿 flag 冒充 store 状态 = 再造一个假状态源**，我不做（N2）。

---

## 五 · 留待方案庭审（自行标注，本阶段不作为结论）

按 S-0001 的范围纪律，下列几条是我在核证过程中看到、**属于设计取舍** 的，登记但不主张：

- **两个 view 之间怎么切换**（并列 / 二选一 / 按数据可用性自动选）—— 这直接决定 5s 轮询循环要不要拆（C4 的实施形态），但选择本身是交互设计。
- **tree 与现有 `Explorer` 原语的关系** —— 技术事实登记于此：`BUILTIN_COMPONENTs/explorer/explorer`（`code-owner-ui-primitives` 边界）**今天已经是 `memory_inspect_modal.js` 的依赖**（`:10`，用于渲染 profile 文档），其数据契约是扁平 `{id: {label, type, children}}` + `root[]`，而 `get_tree` 返回的是嵌套 `roots`。**存在一个已在用的树渲染基底，需要一个形状适配函数** —— 这一条是可行性证据，够不够用是设计问题。
- **i18n**：`memory_inspect` 命名空间今天只有 12 个键、11 个 locale（`src/locales/**`，`code-owner-shared-arteries` 边界）。四态 × 两 view 的文案增量是跨面项。

---

#### S-0006 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 第 1 批两名必到者交付后，本庭执行四项程序处置：**(一)** 归档一条对本庭自己 `FRAMING` 的实质更正；**(二)** 传唤第三层提前执行，**法定必到名单由 7 人增至 9 人**（`code-owner-unchain` · `expert-llm`），两项均为 S-0003 已预先声明、由 S-0004 的答复机械触发；**(三)** 两条 **须查类** 证据已强制路由 `evidence-examiner`；**(四)** 新增三条已知缺口 G8~G10
- **依据**: S-0004, S-0005, E-0010, E-0011, E-0012, E-0014, E-0016, E-0020, S-0003
- **不确定性**: 更正(一)的权威确认 **尚未到达** —— E-0011 的结论跨入 `code-owner-electron` 边界，提交方 S-0004 自陈未逐行验证 `sidecarEnvironment` 到 spawn 的最后一段注入，并明写「该段的权威结论归 `code-owner-electron`」。本条在其答复到达前 **按未终局处理**
- **请求/下一步**: 补行传唤的两人与原 7 人同权，对已归档部分保留发言权（[quorum 第四节](../../../codex/lifecycle/quorum.md)）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T17:30:00-07:00
- **影响范围**: 本案 quorum 名单、证据审查路由、已知缺口清单

  **一 · 对本庭 `FRAMING` 的实质更正（本庭自陈，不隐去）**

  S-0002「已知事实 2」称《`getTree` 链路六段代码全部存在，行号见 E-0006》，并附「只证明存在，不证明可用」。S-0004 依 E-0011 **反驳了该条的隐含前提**：

  > `electron/main/services/unchain/memory_v2_rollout.js:150` 使 `PUPU_CONTEXT_V2_STORE_OWNER` 的取值域只有 `{off, unchain}`，**永不为 `pupu_legacy`**；而 E-0006 锚定的 `memory_v2_store.py:7408` 这一段 `get_tree` **只在 `pupu_legacy` 下执行**。故该锚点 **在两种真实配置（shipped 安装包 / `npm start`）下都不是被执行的实现**；真正执行的是 `memory_v2_unchain_read_adapter.py:432`。

  **本庭接受该更正并归档，但依[发言协议](../../../codex/lifecycle/speech-protocol.md)不原地改写 S-0002 与 E-0006** —— 二者保留原文，读者以本条为准。**本庭的取证缺陷在此明确**：E-0006 逐段核了「代码在不在」，**没有核「哪一段会被执行」**，而这两件事在本案里给出相反的答案。这是一条 **由必到者捞回的主持人取证不足**，非其边界问题。

  **净效果对议案的改变**（本庭如实转述，不加工）：议案性质由「接一个已通的管线」变为「**接一个只在开启态通的管线，默认态必须显示未启用**」。S-0004 明列此为其可证伪条件 1。

  **二 · 传唤第三层提前执行 —— 名单由 7 人增至 9 人**

  S-0003 第三节对下列两项写明「判定挂在 `code-owner-runtime` 的答复上」。其答复已到达，**两个触发条件逐字命中，本庭无裁量余地**：

  | # | 角色 | S-0003 预先声明的触发条件 | S-0004 的答复 | 交付 |
  |---|---|---|---|---|
  | 8 | `code-owner-unchain` | 「`get_tree` 内部经 `list_entries` 是否下潜到 unchain library，本席未追。该判定明确挂在 `code-owner-runtime` 的答复上 —— 其若指出跨仓依赖，本席在第三层补行传唤」 | **「跨仓依赖存在且在 tree 的关键路径上」** —— `store_owner=unchain` 时条目 `kind` 取值来自 `unchain:src/unchain/memory/workspace/models.py:251-255` 的 `MemoryEntryKind`，分页来自同仓 `memory_tree` / `memory_list`（E-0014） | `ASSESSMENT` — `unchain:**`：复核 E-0014 的跨仓半边；`memory_tree` 是否返回 `folder` 条目（E-0014 完整性限制 (3) 是一条 **提交方自标「纯推断、请勿采信」** 的外推）；`MemoryEntryKind` 的稳定性与扩展代价 |
  | 9 | `expert-llm` | 「若 `code-owner-runtime` 的答复把 Q3 转成『该不该为 V2 造一套投影』，该问题即落入 `expert-llm` 边界，第三层重判」 | **「该转化条件已被我的答复满足」**（S-0004 Q3(4)，其明写「我不代其表态」）。V2 向量后端默认 `NullVectorBackend`，要有可呈现的东西须新造三样：开向量后端（embedding provider）/ 新端点 / 投影计算 | `ASSESSMENT` — 「检索参数（embedding 模型、chunking、召回参数）」触发条件命中：**「vector view 保持现状」这一议案前提在本阶段是否成立**，以及「为 V2 造一套投影」是否属本案范围 |

  依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，二人为 **事后认定的法定必到者**。

  **归因分类（依 [A-010](../../../codex/adaptations.md) 要求区分，处方不同）**：两项 **均非边界写窄，亦非抽取写窄** —— 二者的 charter 与 `summon.py` 在立案时都没有可据以命中的输入，**因为触发这两项的事实是庭审中才产生的**（跨仓依赖由 E-0014 首次证实；Q3 的性质转化由 S-0004 的答复完成）。**这正是传唤第三层被设计出来的情形本身**，不构成任何一方的缺陷，**不产生边界自愈信号**。本庭据此提请注意：S-0003 那种「预先写明触发条件并挂在某人答复上」的做法，把第三层从闭庭前的一次性检查变成了 **可在庭中提前引爆的条件**，代价是本庭须逐条追踪自己挂出去的条件。

  **三 · 证据审查已强制路由（本庭对此不持裁量权）**

  S-0004 提交的 **E-0010** 与 **E-0012** 经本庭分类为 **须查类**（`tool-output`，一次性运行时观察，观察对象观察后可变）。依[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)，须查类 **无需任何人质疑即强制审查**。两条已分别路由 `evidence-examiner`，**在其审查结论到达前不得闭庭**（闭庭门禁第 10 项）。

  **本庭同时提请全体出庭角色注意**：这两条是 S-0004 回答 Q4 的 **唯一实测依据**，也是其「三态可判别」结论的全部经验基础。审查结论若为「未验证」或「相矛盾」，Q4 的答案随之动摇。

  **四 · 新增已知缺口（承 S-0002 的 G1~G7）**

  - **G8 · `store_owner=unchain` 分支全案无人实跑。** S-0004 自陈其执行环境 `import unchain` 失败（`ModuleNotFoundError`，仓根 `.venv` 亦然），故 **今天 `npm start` 下实际执行的那条路径（`memory_v2_unchain_read_adapter.py:432`）一次也没有被观察过**；其在该分支上的全部结论按静态比对与推断标注（E-0014）。**这是本案继 G2 之后第二大证据空洞**，且与 G2 正交：G2 是「没有数据」，G8 是「有代码但没跑过」。**归 `code-owner-unchain`（第三层补入）与 `code-owner-runtime`**
  - **G9 · 议案的适用面未决，且它导出两套完全不同的可行性结论。** S-0005 判定 tree view 对两个挂载点 **不是同一个议案**：side-menu 那一路是「补一个 prop + 消歧两条右键分支」；settings 那一路（`mode="long_term"`，作用域内无任何 chat 上下文，E-0017）需要 **一条今天不存在的 owner-less V2 读路由**（V2 整个读平面 owner-scoped，E-0018）。其请求本庭把此问交 `chief-judge` 拍板，并明言「若答案是两者都要，请当作新的待裁问题而非实施细节」。**本庭照转，不代答，不代 `chief-judge` 取舍**
  - **G10 · `get_tree` 对「从未存在过的 owner」的行为，取证不完整。** S-0005 请求 3(c) 提出该问并称「前案没问过」；S-0004 的实测覆盖了 `space_id` 不存在与 **space 属于别的 chat**（两者 404 同码同 message，其自判为 owner-scoping 的正确行为），**但未覆盖「owner 本身从未存在过」**。该缺口直接决定 S-0005 的可证伪条件 F3（「静默错主」是否可检测）—— 而 F3 的成因是 E-0016：`CONTEXT_V2_OWNER_ID_PATTERN` 对 `character_foo__dm__main` **返回 true**，即语义错误的 owner id 能穿过 main 的校验。**归 `code-owner-runtime`（服务端半边）与 `code-owner-electron`（校验门半边，已在第 2 批任务书中点名）**

  **五 · 两项 quorum 判定的现状（本庭主动交代，备 `codex` 审查）**

  **(1) `expert-security` 触发条件仍未命中，但已挂起重判。** S-0005 的 F2 点名请其就「Inspector 成为 `contextV2Bridge.getStatus()` 的第一个 renderer 消费者是否可接受」表态。本庭维持 S-0003 的判定：**消费一个既有 bridge 方法不构成「IPC channel 或 bridge 面的增删改」**，触发条件未命中。该问已在第 2 批任务书中 **同时点名** `code-owner-shared-arteries`（facade owner）与 `code-owner-electron`（`service.js:1941-1943` count-free 不变量的 owner）作答，并明告二者：**若认为这需要一次安全判断而非工程判断，请明说，其答复可触发第三层重判**。判定权不在被问者手上，但 **触发权在**。

  **(2) `expert-ux` 触发条件仍未命中，S-0003(2) 设计的处理方式已实际生效一次。** S-0005 自行标注了三条「留待方案庭审」的内容（两个 view 之间怎么切换 · tree 与 `BUILTIN_COMPONENTs/explorer` 原语的关系 · `memory_inspect` 命名空间 12 键 × 11 locale 的文案增量）。本庭 **归档为备注，不采纳为本阶段 `ASSESSMENT` 结论，亦不删除不改写**。**该三条不构成 `expert-ux` 的补传触发** —— 提交方主动标注为设计取舍并声明不在本阶段主张，与「庭上出现具体呈现形态的主张」不是同一件事。若后续有角色把此类内容作为可行性结论提出，本庭在第三层重判。

  **六 · 补正后的 9 人名单**

  | # | 角色 | 入选层 | 状态 |
  |---|---|---|---|
  | 1 | `code-owner-runtime` | 第一层 · 路径 | **已交付**（S-0004） |
  | 2 | `code-owner-settings` | 第一层 · 路径 | **已交付**（S-0005） |
  | 3 | `code-owner-electron` | 第一层 · 路径 | 第 2 批，在途 |
  | 4 | `code-owner-shared-arteries` | 第一层 · 路径 | 第 2 批，在途 |
  | 5 | `code-owner-chat-core` | 第一层 · 概念名（S-0003 补正） | 第 3 批 |
  | 6 | `code-owner-chat-bubble` | 第三层（S-0003 补正） | 第 3 批 |
  | 7 | `expert-architecture` | 第一层 · 触发条件 | 第 4 批 |
  | 8 | `code-owner-unchain` | **第三层（本条补入）** | 第 5 批 |
  | 9 | `expert-llm` | **第三层（本条补入）** | 第 5 批 |

  另有 `evidence-examiner` **两个 instance** 就 E-0010 / E-0012 在途（**非法定必到，不计入 quorum**，但其结论是闭庭门禁第 10 项的前置）。

#### S-0007 | ASSESSMENT | evidence-examiner → E-0010

- **阶段**: 议案庭审
- **结论**: E-0010 的登记输出 **逐字复跑成功**，来源可追溯，替身经核实为 **无损或不在路径上**。但其证明力 **窄于**「Q4 三态在 API 层可判别」：三臂中的 **200 空态臂只在 `store_owner=pupu_legacy` 下取得，而该值是 PuPu Electron 层从不发出的配置**。提交方自陈限制 (3) 隔离了 **被污染的输出**，**没有隔离该环境缺陷造成的作用域塌缩**。证据可采，作用域须按下文重述。
- **依据**: E-0010
- **不确定性**: 本次复跑与提交观察 **同机、同环境、同缺陷**（`import unchain` 失败）。因此我 **无法独立确认** 在一个 `unchain` 可导入的环境中，`store_owner=unchain` 下空态是否同样返回 200 —— 这恰是 Q4 在真实产品配置下的答案所在。若该前提改变，本条的相关性结论随之改变。另：`test_client` 未覆盖 Electron 转发段，本条对 renderer 最终观察到什么 **不作任何主张**。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条，但在案卷中把其命题 **重述为下文「实际支持的命题」**，不以其原表述「三态两两不重叠」入 `SUMMARY`；（2）若 Q4 需要覆盖产品配置，须在 **`unchain` 可导入的环境** 中补一次取证 —— 该补强责任依证据规则第一节归 **提出方**；（3）请注意 E-0012 自陈「同 E-0010 的四条限制全部适用」，故本条对限制 (3) 充分性的否定结论 **同样传导至 E-0012**，建议一并处置。
- **评估结论**: 已验证
- **证据编号**: E-0010
- **来源类型**: general

- **真实性**: **确认，逐字一致。**
  - revision 核对：`git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（= `b2385d5d`），分支 `dev`；`route_memory_v2.py` / `memory_v2_runtime.py` / `tests/test_route_memory_v2.py` 三文件工作区干净。
  - 我按证据条目原文 **原样复跑** 了那段 bash + heredoc（未作任何改写）。三行输出与登记内容 **完全一致**，含 status code、error code、message 全文及 `"retryable": false` 字段。唯一差异是 `space_id` 为本次新建的随机值 `mem_space_3105b0a5747f45b2ba868262ce3dc7dc` —— 证据条目本身即以 `mem_space_…` 省略该值，**不构成不一致**。
  - 同批登记的 5 项补充观察我 **亦逐项复跑，全部一致**：`owner_chat_id` 省略 → 400 `context_v2_invalid_request`；`space_id` 不存在 → 404 `context_v2_not_found`；owner 不匹配 → 404 **同码同 message**（`memory space was not found`）；`store_owner=bogus` → 503 `context_v2_store_owner_invalid`；`off` 下 `GET /context/v2/status` → 503 `context_v2_store_disabled`。
  - **无篡改迹象。** 登记内容与实际运行结果不存在任何取舍或美化。

- **可靠性**: **来源属实，替身经核实比提交方自陈的更无害；但发现一处未自陈的 harness 保真缺口。**
  - **出处核实（属实，行号略偏）**：`unchain_runtime/server/tests/test_route_memory_v2.py` 确实存在且确实包含该替身。但替身块实际位于 **`:31-38`**，`:29` 是 `self.env.start()`、`:30` 是 `_reset_memory_v2_runtime_for_tests()`。引用的 `29-38` **起始行差 2**，指向的文件与代码块正确，属笔误级别，不影响出处成立。
  - **替身形状一致**：`_is_authorized` 为 header 相等 lambda（既有测试用 token `"token"`，harness 用 `"t"`，与其自带 headers 自洽）；`_json_error` 为 `(jsonify({"error":{"code":…,"message":…}}), status)`，**形状完全一致**。
  - **`_json_error` 替身实为无损**：真实实现在 `route_auth.py:9-10`，即 `jsonify({"error": {"code": code, "message": message}}), status` —— 与替身 **功能上逐字等价**。
  - **更关键：三条登记响应根本不经过 `_json_error`。** 400 与 503 均带 `retryable` 字段，该字段只由 `route_memory_v2.py:55-65` 的 `_error_response` 从 `MemoryV2Error` 产出。`routes._json_error` 在本文件仅用于 401 / 413 / `read_only_degraded` / 500（`:73,:76,:89,:100`）。故该替身对本条主张 **完全不在路径上**，**真实的错误包装代码实际参与了** 这三条响应。提交方限制 (2)「错误包装未参与」**高估了自身风险**，据实应予更正。
  - **`_is_authorized` 替身不触及主张**：真实实现（`route_auth.py:13-30`）在未配置 `UNCHAIN_AUTH_TOKEN` 时直接放行，否则 hmac 比对；替身对 harness 请求同样放行。两者均使请求进入 view，而本条主张全部位于鉴权之后。
  - **未自陈的保真缺口（我的发现）**：harness 以 `mock.patch.dict(sys.modules, {"routes": fr})` 顶替了 `routes`，导致真实 `routes.py:3` 的 `from route_auth import …` 从未执行 —— 我实测 `"route_auth" in sys.modules` 为 **`False`**。因此 `route_auth.py:51-60` 那个模块级注册的 `@api_blueprint.before_request reject_non_loopback_requests` **在 harness 中未注册**，而产品环境中它是注册的。**本条判定为非实质**：`test_client` 请求的 `remote_addr` 为 `127.0.0.1`，即便注册也会放行，三条响应不变。但它不在自陈的四条之列，据实列出。
  - **`test_client` 而非真实 sidecar HTTP socket 的影响评估**：本条主张的载体是 **HTTP status + JSON body 的 `error.code`**，二者均由 Flask view 与错误处理逻辑产出，`test_client` 与 socket 服务走同一 WSGI 对象，**对这三条响应无差异**。未覆盖的是：上述 loopback 守卫、真实 token 配置、生产 WSGI 服务器自身的错误页、连接级故障，以及 Electron 转发段。**均不改变本条登记的三条响应**，故不动摇其窄命题；但也意味着本条对 renderer 最终观察到什么不作主张。

- **相关性**: **只支持一个更窄的命题；「三态两两不重叠」的表述有两处需重述。**
  - **实际支持的命题（建议以此入卷）**：*在 revision `b2385d5d`、经 Flask `test_client`、`routes` 被替身的条件下，tree 端点对以下三种输入返回三组互不相同的 (status, `error.code`) 组合：`pupu_legacy` + 空 space → 200；`store_owner=off` → 503 `context_v2_store_disabled`；`owner_chat_id` 为空 → 400 `context_v2_invalid_request`。* 这是 **服务端半边** —— 证据条目自身的「支持/反驳」字段已如此措辞，措辞本身是恰当的。
  - **重述点一（要害，且自陈未覆盖）：200 空态臂落在产品从不选用的分支上。** `electron/main/services/unchain/memory_v2_rollout.js:150` 为 `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";` —— Electron **只发出 `off` 或 `unchain`**；`pupu_legacy` 仅是 sidecar 侧 env 缺失时的默认（`memory_v2_store_boundary.py:96`）。我实测两个产品会发出的 owner：`unchain` + 合法 owner → **503 `context_v2_unchain_read_unavailable`**；`off` + 合法 owner → 503 `context_v2_store_disabled`。**即：在本环境下，200 空态臂在任一产品实际发出的 store owner 之下都取不到。** 三臂中 400 与 503(off) 两臂的取得条件与产品一致，**唯独 Q4 最依赖的「空态」臂不是**。
  - **重述点二：三态是「优先级有序」，不是「彼此正交」。** `route_memory_v2.py:1114-1119` 先调 `_read_runtime_for_store_owner(...)`、后由 `get_tree(...)` 校验 `owner_chat_id`，故 store owner 门 **严格先于** 参数校验。实测 `off` + 空 `owner_chat_id` → **503 `context_v2_store_disabled`，而非 400** —— 停用态会 **掩盖** 非法请求态。对「客户端能否从单次响应分辨出当前是哪一态」而言，有序化是够用甚至更好的；但本条 **未** 证明三条件可 **各自独立** 检出，「两两不重叠」不宜被这样解读。
  - **补充（部分已可从证据自身看出）：503 是多路复用的。** 同一读路径上至少有 `context_v2_store_disabled` / `context_v2_unchain_read_unavailable` / `context_v2_store_owner_invalid` / `context_v2_unavailable`（`memory_v2_runtime.py:701-706`），另有 `context_v2_owned_by_unchain`（`memory_v2_runtime.py:725-734`）走 `_runtime()` 的路径。**故三态判别只在消费方分支于 `error.code` 时成立，绝不能只看 HTTP status。** 证据登记了 code，命题字面成立；但任何据「503」单独判定停用态的下游设计都不被本条支持。
  - **对本庭特别问询的直接回答 —— 自陈 (3) 是否足以隔离污染：不足。** 我确认了污染的成因属实：实测该 ImportError 的真实来源是 `memory_v2_unchain_read_adapter` 中的 `from unchain.journal import ArtifactRef, EventCursor, ResourceRef` → `No module named 'unchain'`，**确系环境产物、非产品缺陷**，故 (3) 对「那条 `context_v2_unchain_read_unavailable` 输出不得当产品结论引用」的隔离 **是正确且必要的**。但同一环境缺陷 **另有一处未被隔离的后果**：它使 `unchain` 分支整体不可观测，从而让 200 空态臂 **只能** 退到 `pupu_legacy` 上取得（见重述点一）。(3) 隔离了 **被污染的输出**，未声明 **被塌缩的作用域**。就此而言，证据的其他部分（200 臂）**确实受同一环境缺陷影响**。
  - 其余两臂（400、503-off）**不受该缺陷影响**：`route_memory_v2.py:327` 为 `if store_owner != STORE_OWNER_UNCHAIN: return _runtime()`，两者均在 `:330-361` 的 unchain 导入段之前返回，路径上不触及 `import unchain`。

- **来源归类**: **内部来源。** 由提交方（`code-owner-runtime`）自行编写的一次性 harness，在本仓自身代码的固定 revision 上运行；非外部权威来源。其替身出处（`tests/test_route_memory_v2.py:31-38`）亦为内部既有测试。依证据规则第四节，须查类无保管链 —— 本次复跑与原观察 **同机同环境**，故复跑证成其可复现性，**不构成独立第二环境的佐证**。

#### S-0008 | ASSESSMENT | evidence-examiner → E-0012
- **阶段**: 议案庭审
- **结论**: E-0012 登记的五行输出 **全部实跑复现成功**，逐字符一致（两处为转录省略，非出入）。其 **真实性成立**，**可靠性高于提交方自陈**（E-0010 的两条继承限制经查对 S1~S5 五行 **均不成立**）。但 **相关性只覆盖它所声称的三条主张中的两条**：第三条主张（`store_owner=off` 时 **`/context/v2/status` 自身** 返回 503）**不在 E-0012 的五行输出之内** —— S4 记录的是 `list spaces` 在 off 态 503，不是 `status`。该命题本身经我独立实跑为真，但其观测记录在 **E-0010**，不在 E-0012。依此，**E-0012 不得作为第三条主张的引证**，须改引 E-0010。
- **依据**: E-0012
- **不确定性**:
  1. `store_owner=unchain` 分支 **无法实跑** —— 我的环境 `import unchain` 同样失败（`ModuleNotFoundError`，与提交方自陈一致）。故一切结论 **只覆盖 `pupu_legacy` 与 `off` 两个分支**。
  2. 全部走 Flask `test_client`，未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发 —— 该限制我 **确认成立**，无法排除。
  3. S1/S2/S3/S5 取自 `store_owner=pupu_legacy`。我实读 `electron/main/services/unchain/memory_v2_rollout.js:150`（`const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`）与 `build/build_feature_flags.json`（`sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER = "off"`），二者 **均不产生 `pupu_legacy`**。`pupu_legacy` 是 env 键缺失时的 Python 侧默认（`memory_v2_store_boundary.py:94`），即 sidecar 未经 Electron 注入时（如 `python main.py` 独立启动、或本 harness）才出现。**这四行观测到的是 `pupu_legacy` 代码路径的行为**；其向实际运行中的 app 的迁移，取决于启动路径 —— 该判断属 `code-owner-electron` 边界，我只登记 env 事实，不作结论。
  4. 我复跑取得的是 **2026-08-08 当日、revision `b2385d5d`** 的观测。依证据规则第四节，须查类不得据单次观察推断稳定状态；但见「可靠性」第 4 点，本条在此点上比典型须查类更强。
- **请求/下一步**:
  1. 请 `speaker-of-the-house` 将 **第三条主张的引证由 E-0012 改为 E-0010**（E-0010「取得方式」末段已载明 `store_owner=off` 下 `GET /context/v2/status` → 503）。若该主张进入 **强制回应事项** 或 **分歧** 项，则依证据规则第六节其承重证据集合应包含 E-0010 而非 E-0012。
  2. 请提出方 `code-owner-runtime` 补正 E-0012 的 **支持/反驳** 字段，删去「支撑 Q2(1)」一项或改标为「见 E-0010」。补强责任依证据规则第一节在提出方。
  3. 建议在 E-0012 的完整性限制中补记 **两项复跑必需信息**（详见「真实性」第 3 点）：请求的查询参数，以及配置切换需 `_reset_memory_v2_runtime_for_tests()` 的事实。
- **评估结论**: 已验证
- **证据编号**: E-0012
- **来源类型**: general
- **真实性**: **成立。** 我按 E-0010 的 harness 独立重建并实跑（工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`；`git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`，与登记 revision 一致；`git status --porcelain unchain_runtime/` 为空，工作树在该目录无未提交改动）。
  1. **五行逐条比对结果**：S1 `200 {"owner_chat_id":"chat_fresh","spaces":[]}` —— 一致。S2 `400 context_v2_invalid_request / "owner_chat_id is invalid"` —— 一致。S3 `200`，登记的六个字段（`available:true`、`rollout_mode:"off"`、`lexical_backend:"fts5"`、`journal_mode:"wal"`、`vector_status:"disabled"`、`context_memory_capability_reason:"memory_v2_disabled"`）**全部逐字命中**。S4 `503 context_v2_store_disabled` —— 一致。S5 `200 {"backend":"fts5","owner_chat_id":"chat_fresh","query":"anything","results":[],"vector_status":"disabled"}` —— 一致。**无篡改迹象。**
  2. **两处转录省略，非出入**：S2 与 S4 的实际响应体尚含 `"retryable": false`（由 `route_memory_v2.py:54-58` 的 `_error_response` 写入），E-0012 转录时略去，且未如 S3 那样标 `…`。E-0010 对同样两个 error code **保留了** `retryable: false`，可作内部对照。属呈现精度问题，不影响 code / status / message 的一致性。
  3. **「未自带完整命令」的处置 —— 这是本次审查的一项独立发现**：
     - **不构成法典违反。** 证据规则第三节「须给出可复现的定位（revision + 路径 + 行号，或完整命令）」一句 **在文本上只约束自证类**（其后紧接「给不出定位的，**不属自证类**」）。E-0012 自判为 **须查类**，适用的是第四节保管链条款，该条款只要求「载明观察时点与不可复现性」—— E-0012 已载明日期、revision、工作目录与五条完整性限制。**故形式要件满足。**
     - **事实上引用充分。** 「同 E-0010 harness，改请求为…」这一援引式定位 **可被独立复原** —— 我据此重建后五行全中，援引在实效上是够的。
     - **但存在两处真实的复跑缺口**：(a) 未记录 **查询参数**。我是从 S1/S5 输出回显的 `owner_chat_id` / `query` 字段以及 `route_memory_v2.py:1082-1090, 1223-1233` 的 handler 源码反推出 `owner_chat_id=chat_fresh`、`q=anything` 的（`search` 读的是 `q`，不是 `query`）。(b) **未记录 env 切换与顺序纪律**。我实测：若严格按 S1→S5 字面顺序执行、在 S4 设 `off` 后不复位，**S5 将返回 `503 context_v2_store_disabled` 而非登记的 200**。故该五行 **不是一次自上而下的连续运行**，其间必有一次向 `pupu_legacy` 的复位（或 S4 实际最后执行）；记录未言明这一点。**这是一项须记录的呈现缺陷，但它不影响任何单行的真实性** —— 我在为每行显式设置其自身 env 前提后，五行全部复现。
  4. **正对照（我追加，用以排除「桩恒返回空」的可能）**：对同一 store 调 `ensure_space` 后，同一端点即返回含完整 space 对象的非空数组；另取一个从未触碰的 `owner_chat_id=chat_other` 仍返回 `spaces: []`。**S1 的空数组确系「该 owner 无 space」的真实函数，不是恒定桩值。**
- **可靠性**: **内部来源，但污染面显著小于提交方自陈的继承限制。** 提交方以「同 E-0010 的四条限制全部适用」概括继承。我逐条核对该概括对 S1~S5 是否成立：
  1. **替身 `routes._json_error` —— 对五行 **全部不适用**。** 该替身仅被 `_endpoint` 装饰器在四种情形调用：`unauthorized`(401)、`context_v2_request_too_large`(413)、`context_v2_read_only_degraded`(503)、`context_v2_failed`(500)（`route_memory_v2.py:68-104`）。S2 的 `context_v2_invalid_request` 与 S4 的 `context_v2_store_disabled` 均为 `MemoryV2Error`，走 `_error_response`（同文件 `:54-58`）—— **真实产品代码**。判据是 `retryable` 字段：替身不产出该字段，`_error_response` 产出，而我的实跑输出含之。**五行响应体无一由替身塑形。**
  2. **替身 `routes._is_authorized` —— 只影响准入，不影响语义。** 它仅决定 401 门是否放行；五次请求均携 header 通过。真实 `routes.py` 的 token 校验若参与，改变的是「请求是否被受理」，不改变受理后的响应内容。
  3. **环境缺陷 `import unchain` 失败 —— 对五行不适用。** 五行全部落在 `pupu_legacy` 或 `off` 分支；`off` 在触及任何 unchain import 之前即抛 store_disabled（我实测 status / search / spaces 在 off 下均干净返回 503）。E-0010 限制(3) 所针对的 `store_owner=unchain` 分支 **未被 E-0012 的任何一行触及**。
  4. **「临时 store、非真实 store」—— 成立，但对 S3/S5 的关键字段无影响。** 见「相关性」第 2 点：`vector_status` 与 `lexical_backend` 由 env 与后端选型决定，不由 store 内容决定；我在建过 space 之后重测，两字段不变。该限制真正约束的是 S1（空数组取自新建临时 store），而 S1 的正对照见「真实性」第 4 点。
  5. **S3 / S4 的配置前提标注 —— 已正确标注，但只标了值、未标切换程序。** 两行各自在行首自带配置前缀（`pupu_legacy /` 与 `store_owner=off /`），**配置前提本身标注无误**，不存在把两种 env 下的观测混列为同一配置的问题。缺的是第 3.(b) 点所述的复位程序说明。
  6. **须查类的分类偏保守（有利于本条）**：该 harness 对固定 revision、全新临时 store 是 **确定性** 的。我在同一次会话中对 S1/S2/S3/S5 各重复执行三轮（默认 env、显式 `pupu_legacy`、字面顺序组），输出逐字节恒同，含 `rollout_fingerprint`。实践上它表现为可被独立第三方复现的自证类，而非一次性观察。
- **相关性**: **三条承重主张中，两条获支持（均需收窄），一条不获本条证据支持。** 逐条：
  1. **主张一（两跳读管线 + 新会话第一跳返回空 200）—— 部分支持，须收窄。** S1 **确实** 支持后半：`GET /context/v2/memory/spaces` 对无 space 的 owner 返回 `200 {"spaces": []}`，且经我正对照确认该空值是真实函数（真实性第 4 点）。但 **前半「真实读管线是两跳」不由这五行导出** —— 五行只证明两个端点各自独立响应，未观测任何客户端调用序列；管线的两跳结构是代码结构主张，其依据在 E-0013 的路由清单与 renderer 侧代码，不在 E-0012。此外，「**从未调用过 memory 工具**」与「无 space」之间的因果（memory toolkit 惰性创建 space）同样不在本条观测内，属 E-0013 的 `ensure_space` 调用点清单。**E-0012 能证的是「无 space 时第一跳返回空 200」，不是「因为没调过 memory 工具所以空」。**
  2. **主张二（V2 向量后端默认关闭）—— 支持，且比「仅此临时 store」更强，但须限定读路径。** 关于本庭特别点名的 S5：我追查了 `vector_status` 的产生链，结论是 **它不是 store 状态的函数，而是 env 配置的确定性函数**，故不止证明「在该临时 store 下它是关的」：
     - `_build_backend`（`memory_v2_vector.py:770-777`）：`config.provider` 为空 → `NullVectorBackend`；其 `status()` 硬编码返回 `"disabled"`（`:203-204`）。
     - `config.provider` 唯一来源是 env `PUPU_MEMORY_V2_VECTOR_PROVIDER`（`:30`，`VectorConfig.from_environ` `:65-80`）。
     - 我对全仓（`.js/.cjs/.json/.py`，排除 node_modules 与测试）grep 该键：**除其自身常量定义外，产品代码零处设置**。故在任何出厂配置下 `provider` 恒为空 → 后端恒为 `NullVectorBackend` → `vector_status` 恒为 `"disabled"`。**这是一条一般性结论，不是该 store 的偶然属性。** 我另测：建过 space 之后 S5 与 S3 的该字段不变，佐证其与 store 内容无关。
     - **限定**：以上只覆盖 `pupu_legacy` 读路径。`unchain` 读适配器在 search 响应中 **硬编码 `"vector_status": "degraded"`**（`memory_v2_unchain_read_adapter.py:489`），即该路径下永不出现 `"disabled"`；该分支我无法实跑。故准确表述是「**`pupu_legacy` 读路径下向量后端确定性关闭，检索为 `fts5` 词法**」，而非无差别的全产品结论。
  3. **主张三（`store_owner=off` 时 `/context/v2/status` 自身 503）—— 本条证据不支持，须改引 E-0010。** 这是本次审查最实质的一项发现，且恰落在本庭标注为「尤其承重」处：
     - E-0012 的五行中，**唯一在 `off` 态取得的观测是 S4，其请求是 `list spaces`，不是 `status`**。S3 虽是 `status`，但取自 `pupu_legacy`，返回 200。**「status 端点在 off 态自身 503」这一观测不存在于 E-0012 的转录之内。**
     - 然而 E-0012 的 **支持/反驳** 字段明写「**支持** Q2(1)（`store_owner=off` 时 status 端点自身 503）」。**该字段所声称的支持关系，其本条正文无对应输出。**
     - **命题本身经我独立实跑为真**：`PUPU_CONTEXT_V2_STORE_OWNER=off` 下 `GET /context/v2/status` → `503 {"error":{"code":"context_v2_store_disabled","message":"PuPu legacy Context V2 storage is not the selected data owner","retryable":false}}`。但这是 **我补跑的观测**，其原始登记在 **E-0010**（该条「取得方式」末段已明确列出此结果）。
     - 依证据规则第五节，我 **不评价** 由此推出的「未启用态读不出来、只能从错误码反推」是否成立，也不涉及它与 `S-0005` / F2 的关系。我只登记：**引证错配，应改引 E-0010；本条不因此为假，但不得为该主张承重。**
- **来源归类**: **内部来源。** 由本庭内 `code-owner-runtime` 自建 Flask `test_client` harness、对本仓 `b2385d5d` 代码在全新临时目录上产生的运行时输出，非外部系统响应，无第三方权威背书。依证据规则第四节，须查类无保管链 —— 但本条属可确定性复现的内部观测，已由我（独立于提出方）按其援引重建并逐字复现，且我用以判定 `vector_status` 与错误响应来源的是 **同一 revision 的仓内源码**（自证类），非提出方陈述。**内部来源、已由第二方独立复核。**

#### S-0009 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 两条须查类证据的强制审查已完成，**均为「已验证」**，闭庭门禁第 10 项就 E-0010 / E-0012 已满足。但两份审查 **各自独立地** 收窄了它们所支撑的命题，且 **在同一处收敛**：本庭据此登记一条 **本案迄今最重的证据限制** —— **Q4 的「可判别」结论，在任何一个产品实际会出现的配置下都未被演示过**
- **依据**: S-0007, S-0008, E-0010, E-0012, E-0011, E-0014, S-0004
- **不确定性**: 本条不判断 Q4 的答案是对是错 —— 那是实体结论，归出庭角色与 `chief-judge`。本条只登记 **该答案的证据基础覆盖到哪里、没覆盖到哪里**
- **请求/下一步**: 后续出庭角色（第 3~5 批）引用 Q4 结论时，**须连同下述收窄一并引用**，不得只引「三态可判别」这一句
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T17:05:00-07:00
- **影响范围**: Q4 的全部下游论证；E-0010 / E-0012 的引用方式；S-0004 的一处引证错配

  **一 · 两份审查在同一点收敛（本庭认为这是本条最重要的内容）**

  两名 `evidence-examiner` **互不知情、分别审查不同证据**，却撞上同一堵墙：

  | | S-0007（查 E-0010） | S-0008（查 E-0012） |
  |---|---|---|
  | 真实性 | 原样复跑，三行 + 同批 5 项补充观察 **逐字一致** | 独立重建 harness，五行 **逐条复现**，S3 六字段逐字命中 |
  | 撞上的同一堵墙 | 「200 空态臂 **只在 `store_owner=pupu_legacy` 下取得，而 Electron 从不发出该值**」 | 「S1/S2/S3/S5 取自 `pupu_legacy`……`memory_v2_rollout.js:150` 与 `build_feature_flags.json` **均不产生 `pupu_legacy`**」 |
  | 各自无法实跑的分支 | `store_owner=unchain`（`import unchain` 失败） | `store_owner=unchain`（同一失败） |

  **净效果**：`code-owner-runtime` 的 Q4 结论「三态在 API 层完全可判别」，其 **最要害的那一臂（200 空态）落在一条产品从不选用的代码路径上**。审查人 S-0007 逐字实测：两个产品实际会发出的 owner 之下 **均为 503**（`unchain` → `context_v2_unchain_read_unavailable`；`off` → `context_v2_store_disabled`）。

  **这与 S-0006 第一节归档的框定更正是同一件事的两面**：本庭的 E-0006 锚在不执行的代码上，S-0004 的 Q4 实测也跑在不执行的代码上 —— **两次都是同一个 `pupu_legacy` 幻影**。**G8 因此不是一条普通缺口，而是本案 Q1 与 Q4 两个待裁问题共同的证据地板。**

  **二 · 三处必须随证据一同引用的收窄（不得只引结论句）**

  1. **三态是「优先级有序」，不是「彼此正交」**（S-0007）。store owner 门 **严格先于** 参数校验（`route_memory_v2.py:1114-1119`），实测 `off` + 空 `owner_chat_id` → **503 而非 400**：**停用态会掩盖非法请求态。** 「两两不重叠」不得被读作「可各自独立检出」
  2. **503 是多路复用的**（S-0007，至少 5 个码）。**任何据 HTTP status 单独判定停用态的下游设计不被本案证据支持**，必须分支于 `error.code`
  3. **`vector_status: "disabled"` 只覆盖 `pupu_legacy` 读路径**（S-0008）。`unchain` 读适配器在 search 响应中 **硬编码 `"vector_status": "degraded"`**（`memory_v2_unchain_read_adapter.py:489`），**该路径下永不出现 `"disabled"`**。Q3 的「V2 向量后端默认关闭」作为 **env 决定的一般性结论成立**（全仓产品代码零处设置 `PUPU_MEMORY_V2_VECTOR_PROVIDER`），但 **产品路径上它的自述状态是 `degraded` 不是 `disabled`** —— 这一条 **第 5 批的 `expert-llm` 与 `code-owner-unchain` 须直接面对**

  **三 · 一处引证错配（S-0008 认定，本庭执行）**

  S-0004 用 **E-0012** 支撑「`store_owner=off` 时 `/context/v2/status` 自身 503」这一主张，而该观测 **不在 E-0012 的五行之内**（S4 记录的是 `list spaces`，S3 是 `status` 但取自 `pupu_legacy` 返 200）。**命题本身经审查人独立实跑为真，其原始登记在 E-0010。**

  **本庭处置**：`SUMMARY` 与后续引用 **一律改引 E-0010**；**E-0012 不得为该主张承重**。依[证据规则第一节](../../../codex/lifecycle/evidence-rules.md)，补正 E-0012「支持/反驳」字段的责任归提出方 `code-owner-runtime`，**该项列为未了结事项，non-blocking**（命题本身已有合格证据，仅编号挂错）。**本庭不代为改写 E-0012 的正文。**

  **四 · 两处对提出方 *有利* 的更正（一并登记，不只记不利的）**

  1. **S-0004 高估了自己的风险。** 其限制 (2) 称「真实 `routes.py` 的鉴权与错误包装未参与」；S-0007 实查后判定 **`routes._json_error` 替身完全不在路径上** —— 三条响应带 `retryable` 字段，由真实的 `_error_response`（`route_memory_v2.py:55-65`）产出。**真实错误包装实际参与了。**
  2. **E-0012 的须查类分类偏保守。** S-0008 判该 harness 对固定 revision + 全新临时 store 是 **确定性** 的，三轮重复执行逐字节恒同，实践上表现为可被第三方复现的自证类。**本庭维持须查类分类**（分类依判据不依结果，且该判据在观察时点无法预知），但记录该评述。

  **五 · 保管链声明（两份审查一致，本庭不得略去）**

  两次复核 **均与原观察同机、同环境、同缺陷**。依[证据规则第四节](../../../codex/lifecycle/evidence-rules.md)，复跑证成的是 **可复现性**，**不构成独立第二环境的佐证**。`store_owner=unchain` 分支至今 **三人（提交方 + 两名审查人）无一能实跑**。

#### S-0010 | ASSESSMENT | code-owner-electron → case
- **阶段**: 议案庭审
- **结论**: **有条件可行，且我边界内 0 处必须改动** —— `listSpaces → getTree` 两跳的 channel / handler / preload bridge / main service 全部现成、全部被 `.js`/`.cjs` 双胞胎锁住，本次实跑 4 个相关 suite 全绿（E-0029）。四件被推给我的事逐条落定：**甲 成立且比 `code-owner-runtime` 说的更强**（注入顺序已逐行核实，且被测试锁住，`pupu_legacy` 在 Electron spawn 下结构性不可达 —— E-0022/E-0023/E-0030），**但其 dev 那一行须更正：`npm start → unchain` 不是仓库属性，是本机属性**，取决于一个不入库的 `.local` 文件（E-0023）。**乙 我要直接推翻其前提**：`memoryV2Readiness` **今天已经跨过 IPC 线到达 renderer**，只是不叫这个名字 —— 它在 `unchainAPI.getStatus().memoryV2` 里，四态闭集 + 闭集 reason，preload 零投影（E-0025）；「暴露的代价」在我边界内 **等于零**，卡点在上一层的 `normalizeUnchainStatus` 里，不在我这里。**丙 G5 与新发现全部证实，且答案是「没有，一个都没有」**（E-0024）。**丁 我判可接受，但要报告一条谁都没说的硬事实**：在出厂默认态下 `contextV2Bridge.getStatus()` **是 reject 不是 resolve**，8 字段 allowlist 根本到不了（E-0028）—— 这使 `code-owner-settings` 的 F2「唯一没有绕行方案」**被部分证伪**，绕行方案存在且更强。**戊 前案 `0000-0003-2026-0807#S-0010` 的「stable code 端到端不丢」在本案链路上仍然成立，但有一个前置例外**：`ensureMisoReady` 抛的是无码错误，而它恰好是 sidecar 未就绪时 `getTree` 的实际出口（E-0026/E-0027）。**Q2 我部分承担并预先登记一条反对。**
- **依据**: E-0006, E-0004, E-0022, E-0023, E-0024, E-0025, E-0026, E-0027, E-0028, E-0029, E-0030, E-0031, E-0010, E-0011, E-0016, E-0018, E-0020, 0000-0003-2026-0807#S-0010, 0000-0003-2026-0807#S-0024
- **不确定性**:

  **一 · 我实跑到哪里为止**

  我 **未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求**。我的运行时观察只有两项：(1) 本仓 electron 测试套件（jest，`--env=node`，全 mock，E-0029）；(2) 一段把 `service.js:120` 的正则逐字复制出来的 node 脚本（E-0024）。**「代码这样写」与「运行起来这样跑」之间那一段，我给不出**，凡涉及真实进程行为的一律标推断。

  **二 · 我引用了两个不在我边界内的文件，并且它们承重**

  为回答丁，我读了 `unchain_runtime/server/route_memory_v2.py` 与 `memory_v2_runtime.py`（E-0028）。**这两处的权威解释归 `code-owner-runtime`**，我只主张「代码里的分支长这样」，且我的静态读结论与其 E-0010 实跑结果 **一致**（503 `context_v2_store_disabled`），这构成一次独立交叉验证 —— 但不构成我对其边界的主张。

  **三 · 我自己的一条记忆被本次核证推翻，如实登记**

  我的持久记忆里写着「默认构建下每一次 Context V2 读都返同一个 404 `context_v2_not_found`」。**在 `b2385d5d` 上这是错的**，实际是 503 `context_v2_store_disabled`（E-0028）。以当前代码为准，我已就地更正记忆。**本庭不应引用我此前任何以 404 为据的口径。**

  **四 · G2 继承的空洞**

  本机 V2 store `entries=0`。我这一层从不解析 tree 载荷（`getContextV2Tree` 是原样透传），所以「有数据时载荷多大、IPC 序列化撑不撑得住」**结构上无法取证**，任何量级判断是推断。**但我要提示一条本层特有的风险**：`getTree` 是 CONTEXT_V2 十八个方法里 **唯一没有 limit / page 参数** 的读方法（E-0032）。它的返回体大小由 store 内容单方面决定，本层不设上界。

- **请求/下一步**:
  1. **请本庭把「甲」按我的结论记入更正，并把 `code-owner-runtime` 表格里的 dev 那一行改为条件式** —— 「`npm start` → `unchain`」成立的前提是 `.local/build_feature_flags.snapshot.json` 存在且 `enable_memory_v2: true`。该文件 **不入库**（E-0023），新克隆与 CI 上它不存在 → 落 `off`。**这不是细节，是验收可复现性问题。**
  2. **请本庭把 `code-owner-settings` 的 F2 记为「已被本边界证据部分证伪」**，并把该条重新指向 `src/SERVICEs/api.shared.js:330-343 normalizeUnchainStatus`（`code-owner-shared-arteries` 边界，本案第 4 位必到者）。**真正的阻断点在那里，不在 `getStatus` 的许可上。**
  3. **请 `code-owner-shared-arteries` 就一件事表态**：`normalizeUnchainStatus` 今天丢弃 `memoryV2`（与 `contract`）—— 放行它、或新开一个等价 facade 方法，是否可接受？这是「四态状态源」从「已存在」变成「可消费」的 **唯一** 剩余动作。
  4. **不请求** 在本阶段解决 `ownerChatId` 的语义正确性 —— 我这一层只有语法门，没有身份门，且我 **不主张现在加**（见丙与 FE3）。
  5. **登记一条第三层重判的触发条件**（不代 `expert-security` 表态）：S-0003 的不传唤判定建立在「本案不增删改任何 channel / bridge 面」上。**该前提今天成立**（我边界内 0 处必须改动）。**一旦方案要求在任何 CONTEXT_V2 方法上增删改字段或参数 —— 包括给 `getStatus` 加一个「为什么关」字段 —— 该前提即被推翻，届时我本人请求补传。**

- **评估结论**:

  ### 甲 · `get_tree` 在出厂 PuPu 里一次也不会被执行 —— **成立。权威结论如下，并附一条对 `code-owner-runtime` 的更正**

  `code-owner-runtime` 自陈未验证的那一段（`service.js:4745-4810` 的覆盖顺序），我逐行核实了。**它比它自己以为的更硬**：

  **(1) 注入是无条件的，且写在 `process.env` 展开之后。**

  ```js
  // electron/main/services/unchain/service.js
  4745:  const sidecarEnvironment = { ...process.env };
  4758:  unchainProcess = spawn(entrypoint.command, entrypoint.args, {
  4762:    env: {
  4763:      ...sidecarEnvironment,                              // ← 环境先铺开
  ...
  4805:      [MEMORY_V2_ENV_KEYS.storeOwner]:
  4806:        memoryV2RuntimeConfig.sidecarEnvironment[
  4807:          MEMORY_V2_ENV_KEYS.storeOwner                   // ← 再无条件覆写
  4808:        ],
  ```

  五个 `PUPU_MEMORY_V2_*` / `PUPU_CONTEXT_V2_*` 键 **全部** 在 `:4789-4808` 无条件写入，位置在 `:4763` 的展开之后。**开发者 shell 里的同名变量一定被覆写**（E-0022）。

  **(2) 取值域二元，无第三值。** `memory_v2_rollout.js:150` 一行 `resolvedRolloutMode === "off" ? "off" : "unchain"`，是 `PUPU_CONTEXT_V2_STORE_OWNER` 在整个 Electron 侧的唯一产地（产品代码全仓仅 2 处出现该键：该 js 与 sidecar 侧的 py，E-0023）。

  **(3) 只有一个 spawn 点，且没有「附着到外部 sidecar」的路径。** `electron/main/` 下 sidecar 只在 `service.js:4758` 被 spawn（另两处 spawn 分别是 vault sink worker 与 `ollama serve`）；`startMiso` 的守卫是 `if (unchainProcess || unchainStatus === "starting") return`，没有任何 attach / external / skipSpawn 分支（E-0022）。

  **(4) 配置在进程生命周期内不可漂移。** `memoryV2RuntimeConfig` 是 `:1035` 的一个 `const`，`Object.freeze` 过，只算一次。

  **(5) 而且这一切被双胞胎测试锁住。** `electron/tests/main/memory_v2_startup_readiness.test.cjs` 直接断言 `spawn.mock.calls[0][2].env`：canary/packaged 与 win32 两例断言 `PUPU_CONTEXT_V2_STORE_OWNER: "unchain"`，off 例断言 `"off"`（E-0030）。**全仓测试里 `pupu_legacy` 作为该 env 取值零出现。**

  > **权威结论：`PUPU_CONTEXT_V2_STORE_OWNER` 在任何由 Electron 启动的 sidecar 里只可能是 `off` 或 `unchain`。Python 侧「env 缺失回退 `pupu_legacy`」（`memory_v2_store_boundary.py:96`）在 Electron 下结构性不可达。E-0006 锚定的 `memory_v2_store.py:7408 get_tree` 不是任何真实用户配置下被执行的实现。本庭「已知事实 2」应记更正。**

  **对 `code-owner-runtime` 的一条更正（方向：削弱其 dev 行的普适性）**

  它的表格写「`npm start` → `unchain`（package.json 设了两个 env）」。**env 设了不等于生效。** `buildRolloutConfig:135-140` 是这样的：

  ```js
  const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";
  const configuredMode = featureEnabled ? normalizeMode(readValue(...), "off") : "off";
  ```

  `featureEnabled` **不来自 env**，来自快照文件的 `enable_memory_v2`：打包态读 `build/build_feature_flags.json`（`false`，冻结），**非打包态读 `.local/build_feature_flags.snapshot.json`**（`memory_v2_rollout.js:216-218`）。**该文件不入库。** 本机上它是 `{"enable_memory_v2": true}` 且无 `_pupu_memory_v2_release` 块 → featureEnabled=true → 两个 env 被采纳 → `all` → `unchain`（E-0023）。**在一台没有该文件的机器上（新克隆 / CI），`npm start` 得到的是 `off`。**

  **净效果**：真实配置不是三种，是 **四种**，且第三种是本机独有的：

  | 配置 | featureEnabled 来源 | store owner | `get_tree` 实现 |
  |---|---|---|---|
  | 出厂安装包 | `build/build_feature_flags.json` = false | `off` | 不执行（503） |
  | `npm start` **且本机有 `.local` 快照 true** | `.local` 快照 | `unchain` | unchain read adapter |
  | `npm start` **无 `.local` 快照**（新克隆 / CI） | 无文件 → `{}` → false | `off` | 不执行（503） |
  | win32 + 上述第二行 | 同上，但 ceiling 压回 `shadow` | **仍是 `unchain`** | unchain read adapter |

  第四行值得单列：`constrainMemoryV2ConfigForPlatform:326-332` 只把 ceiling 压回 `shadow`，**storeOwner 仍是 `unchain`**（测试断言 `PUPU_CONTEXT_V2_STORE_OWNER: "unchain"` + `status: "degraded"` + `reason: "vault_worker_containment_unavailable"`，E-0030）。**Windows 上 store owner 是 unchain 但 readiness 恒 degraded** —— 对本案的意义见戊。

  ### 乙 · `memoryV2Readiness` —— **它不是「只差一段暴露」，它已经暴露了。`code-owner-runtime` 的 grep 是名字层面的假阴性**

  它 grep 的是标识符 `memoryV2Readiness`。**该值在跨层时改了名。** 完整链路（E-0025，我逐段读过，无一段推断）：

  ```
  service.js:1068           let memoryV2Readiness = initialMemoryV2Readiness()
  service.js:1645-1663      getMisoStatusPayload() → { …, memoryV2: { …15 字段… } }
  register_handlers.js:236  ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () => getMisoStatusPayload())
  preload/channels.js:17    CHANNELS.UNCHAIN.GET_STATUS 在 invoke 白名单里
  preload/bridges/unchain_bridge.js:4
                            getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)   ← 裸透传，零投影
  window.unchainAPI.getStatus()            ← renderer 今天就能拿到 memoryV2 全部 15 字段
  ```

  **我这一层没有任何一处投影、裁剪或过滤它。**

  **它是不是 D7 说的那个「多方需要、今天没有 owner」的构件在 main 侧的既有半成品？—— 是，而且比 D7 假设的完整得多。它已经是一个四态机。**

  - `status` 是 **闭集四值**：`off` | `pending` | `degraded` | `ready`（`:1039-1055` 产 off/pending/degraded，`:1874-1878` 与 `:1969-1973` 产 ready/degraded）
  - `reason` 是 **闭集**：`validateMemoryV2Status` 产 9 个失败码 + `""`（E-0023 逐条），service 侧另加 `rollout_off` / `not_verified` / `context_v2_readiness_unavailable` / `vault_worker_containment_unavailable` / 3 个 snapshot 码 = **共 16 个取值，可枚举**
  - 关键的是 `configured` 与 `ready` **两个布尔把「配置为关」与「配置为开但没就绪」分开了** —— 这正是 `contextV2Bridge.getStatus()` 做不到的那一刀（见丁）
  - 写入点唯一：只有 `verifyContextV2Readiness`（:1852）、`getContextV2Status`（:1960）、`startMiso` 重置（:4706）三处，全在同一个文件同一个闭包里。**不存在第二个产地。**

  **暴露它的代价是什么？—— 在我边界内是零，因为已经暴露完了。剩下的代价全在我边界之外，一共两笔：**

  **(1) 一笔在上一层，不是我的。** `src/SERVICEs/api.shared.js:330-343` 的 `normalizeUnchainStatus` 把状态重建成 6 字段 `{status, ready, url, reason, pid, port}`，**丢掉 `memoryV2` 与 `contract`**。所以经 `api.unchain.getStatus()` 的消费者（如 `src/PAGEs/chat/chat.js:578`）看不到它，而直接调 `window.unchainAPI.getStatus()` 的能看到。**这是 `code-owner-shared-arteries` 的边界，约 6 行的改动，不是新建构件。**

  **(2) 一笔是我的，且我要主动认领。** 该载荷今天是 **部分锁定** 的：`memory_v2_startup_readiness.test.cjs` 用 `toMatchObject` 在 7 处断言了 `memoryV2` 的一个子集（`configured` / `ready` / `status` / `reason` / `rolloutMode` / 三个 fingerprint），**但没有任何测试锁它的完整字段集，也没有任何测试断言「不得有额外字段」**（E-0030）。它今天是一个诊断载荷，15 个字段里 4 个是 sha256 指纹。**一旦它升为产品状态契约，加一条 allowlist 形状的双胞胎契约测试就是我的活**，位置：`electron/tests/main/memory_v2_startup_readiness.test.cjs` + 其 `.js` 孪生。这是我在本案里 **唯一** 会主动认领的新工作，量级是一个 test case。

  > **一句话**：D7 描述的那个洞，在 main 侧不是「没人造」，是「造好了、跨过 IPC 了、被上一层的一个 normalizer 丢掉了、没人消费」。**把它从「无主构件」重述为「一个已存在契约的归属与放行决定」，问题的量级差一个数量级。**

  ### 丙 · `ownerChatId` 的两道门

  **(1) G5 —— 缺参行为，已实跑确认（E-0024）**

  `requireContextV2OwnerChatId(undefined | null | "" | "   " | 123 | {})` **一律同步抛出**，早于任何 HTTP：

  ```
  code    = "context_v2_invalid_request"
  message = "[context_v2_invalid_request] ownerChatId is invalid"
  ```

  抛点在 `getContextV2Tree` 的第一行（`service.js:2108`），**请求不发出**。renderer 侧 `parseContextV2ErrorCode`（`src/SERVICEs/bridges/context_v2_bridge.js:57,77-82`）能从 message 里取回该码。这一「fail-closed 且不发请求」的性质被测试锁住：`context_v2_service.test.cjs:1417-1429` 断言 `listContextV2Spaces` / `decideContextV2Candidate` 在未就绪时 reject 且 `expect(fetchImpl).not.toHaveBeenCalled()`。

  **一条本庭该记的副作用**：`context_v2_invalid_request` 这个码 **主进程本地校验与服务端 400 共用**（E-0010 c 行 = 同码）。收端只看 code 分不清「我传错了参数」与「服务端认为参数非法」。message 不同（本地是 `ownerChatId is invalid`，服务端经 `contextV2Request` 重包后是 `context v2 request failed`），但依 `0000-0003-2026-0807#S-0010` 的约定，收端只该消费 code。**这是一处已存在的码碰撞。**

  **(2) 新发现 —— `code-owner-settings` E-0016 完全成立，我复跑确认（E-0024）**

  ```
  "chat-1772850432671-abc"   → true
  "character_foo__dm__main"  → true          ← 语义错误，语法合法
  "character_foo__dm__main " → true（trim 后）
  ```

  **(3) main 层今天有没有任何机制能挡住「用 character session id 冒充 ownerChatId」？—— 没有，一个都没有。**

  `service.js:118-120` 的注释逐字写明了这道门的性质：*"Mirrors memory_v2_store._OWNER_ID_RE / _ID_RE. Main re-validates rather than trusting the sidecar to reject: a malformed id must never reach the wire."* —— **它是一道语法门，防的是「畸形 id 上线」，不是「错误的人被冒充」。** 整个 Context V2 路径上没有任何 chat 存在性校验、没有任何 owner 归属校验。

  **能不能建一道？技术上能，且材料就在 main 里** —— `electron/main/services/chat_storage/service.js` 持有权威的 chat id 全集（`:357` `SELECT id FROM chats`，`:459` `SELECT id, meta FROM chats`，E-0031）。**但我不主张现在建**，理由两条：(a) 它是 main 内两个服务之间的新耦合 + 新行为，不是接线，须单独走 case；(b) 它会在 main 里造一个 chat 存在性 oracle，而本层现有的设计取向恰恰相反（`getStatus` 刻意 count-free 就是同一条理由）。

  > **对 F3 的直接回答**：`code-owner-settings` 的可证伪条件 F3 **在我这一层拿不到任何救济**。「静默错主」能否被检测，**100% 取决于 `code-owner-runtime` 对「从未存在过的 owner」的答复**。若服务端也返 200 空树，则该错误在整条链路上不可检测 —— 我这一层不会、也不该在方案阶段临时补一道身份门去救它。

  ### 丁 · Inspector 成为 `getStatus` 的第一个 renderer 消费者 —— **在我边界内可接受；但 8 字段不够，理由和本庭想的不一样**

  **(1) 可接受，四条理由：**

  - **不改任何面。** channel（`shared/channels.js:146`）、preload 白名单（`preload/channels.js:109`）、preload 方法（`preload/bridges/context_v2_bridge.js:42`）、main handler、main 实现 —— 全部现成，且被 `ipc_channels.test.cjs` 与 `api_contract.test.cjs` 双胞胎锁住（E-0030）。**新增一个消费者是零改动。**
  - **它是十八个方法里攻击面最小的一个**：`getStatus = () => ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_STATUS)` —— **零参数**。新增消费者 **不引入任何新的 renderer 可控输入**到主进程。
  - **载荷是 allowlist 重建的**（`service.js:1976-1985`），且 count-free 是成文不变量（`:1942-1944`）。**消费者数量不改变载荷。**
  - 依 S-0003，`expert-security` 的不传唤判定建立在「不增删改 channel / bridge 面」上，**该前提在此成立**。

  **(2) 但 8 字段 allowlist 不足以表达「V2 未启用」—— 不是字段选得不对，是那条路在最需要它的那一态上根本走不通。**

  `getContextV2Status`（`service.js:1945-1986`）是一个 **三岔口**：

  | 态 | 走哪一支 | renderer 看到什么 |
  |---|---|---|
  | sidecar 未就绪（`unchainStatus !== "ready" \|\| !unchainPort`） | `:1946-1957` **合成负值，不联系 sidecar** | resolve `{available:false, rolloutMode:"off", featureCeiling:"off", schemaVersion:0, …}` |
  | sidecar 就绪 + `store_owner=off`（**出厂默认**） | 真发请求 → 服务端 503 | **reject**，code `context_v2_store_disabled` |
  | sidecar 就绪 + owner=unchain + 一切正常 | 真发请求 → 200 | resolve 8 字段，`available` 再与 `validateMemoryV2Status` 取与（`:1974`） |

  第二行是我静态追出来、并与 `code-owner-runtime` 的 E-0010 实跑独立吻合的（E-0028）：`route_memory_v2.py:982-1006` 的 `context_v2_status` **不 catch**，`_status_for_store_owner:798-799` 在 owner≠unchain 时直调 `_runtime()`，而 `memory_v2_runtime.py:718-734` 对 `off` 必抛 503 `context_v2_store_disabled`。到我这层 `contextV2Request:1931-1938` 保码重包 → renderer 拿到的是一个 **rejected promise**。

  > **净效果两条，都必须进记录**：
  > **(a) 在出厂默认态下，`contextV2Bridge.getStatus()` 不会返回 `available:false` —— 它抛。** 8 字段 allowlist 在那一态下 **一次也不会被构造出来**。要用它判「未启用」，就得 catch 一个 503 再匹配错误码字符串。**这正是 `code-owner-runtime` 在服务端说的「把状态契约建在错误消息上」，它在我这一层也成立。**
  > **(b) 唯一会 resolve 出「看起来像未启用」的那一支，混淆了另外一件事**：sidecar 崩了 / 还在启动 → 同样是 `available:false, rolloutMode:"off", featureCeiling:"off"`。**8 个字段里没有任何一个能把「配置为关」与「后端没起来」分开。**

  **(3) 因此我要直接对 `code-owner-settings` 的 F2 提出部分证伪。**

  F2 称「`getStatus` 被否 → Q4 塌回不可判别 → 不可行，且这是唯一没有绕行方案的一条」。**绕行方案存在，而且比 `getStatus` 更强**：`window.unchainAPI.getStatus().memoryV2`（乙）。对比：

  | | `contextV2Bridge.getStatus()` | `unchainAPI.getStatus().memoryV2` |
  |---|---|---|
  | 出厂默认态（off） | **reject**（503 → 错误码） | **resolve**，`{configured:false, ready:false, status:"off", reason:"rollout_off"}` |
  | sidecar 未就绪 | resolve，与 off **同形** | resolve，`status:"pending"` 或 `"degraded"` + reason，**与 off 可分** |
  | 是否联系 sidecar | 是（可失败、可超时） | **否，纯主进程本地读，永不 reject** |
  | 状态词汇 | 8 个布尔/字符串，无状态枚举 | **四值枚举 + 16 值闭集 reason** |
  | 谁挡着 | 没人挡（今天就能调） | `normalizeUnchainStatus` 丢弃（shared-arteries） |

  **所以 N2「未启用判定必须来自 `contextV2Bridge.getStatus()`」我建议修正为**：主判据取 `memoryV2`（main 权威、不可失败、四态互斥），`contextV2Bridge.getStatus()` 作为 store 侧的交叉验证而非唯一来源。**但这是落位问题，归 Q2 / `expert-architecture`，我只提供两者的技术差异，不代其定。**

  **(4) 这需不需要一次安全判断？—— 就本案当前范围：不需要，是我边界内的工程判断。但我把触发线画出来。**

  「新增一个零参数、已锁契约、count-free 读方法的消费者」是工程判断，我做了，判可接受。**下列任一出现，即转为安全判断，我请求本庭第三层重判并补传 `expert-security`**：

  - 要求在 `getStatus` 或任何 CONTEXT_V2 方法上 **增加字段或参数**（含「为什么关」「有没有数据」「计数」）
  - 要求把 `memoryV2` 的 15 字段（含 4 个 sha256 指纹与 `platformActiveBlocked`）**原样** 作为产品状态源送进 renderer 组件 —— 这是把一个诊断面变成产品面，投影范围该被审一次
  - 要求 main 侧新增任何形式的 **存在性校验**（丙 (3)），因为那等于新建一个 oracle

  ### 戊 · Q1 我端的管线完整性 —— **两跳完整可用，错误码保真，但有一个前置例外**

  **(1) 两跳全段复核（不重取，只核 E-0006 的行号在 `b2385d5d` 上是否仍然对）—— 全部对，且我补齐了 `listSpaces` 那一跳的对应锚点：**

  | 段 | `listSpaces` | `getTree` |
  |---|---|---|
  | channel 常量 | `electron/shared/channels.js:151` | `:152` |
  | preload 白名单 | `electron/preload/channels.js:114` | `:115` |
  | preload 方法 | `preload/bridges/context_v2_bridge.js:81-84` | `:86-90` |
  | main handler 绑定 | `main/ipc/register_handlers.js:29,641` | `:30,642` |
  | main 实现 | `services/unchain/service.js:2098-2105` | `:2108-2116` |

  `getTree` 的入参：**`ownerChatId` 与 `spaceId` 都是必需**（`:2108-2109`），query **只带 `owner_chat_id`**，不转发 `allow_long_term` / `namespace`。**证实 `code-owner-runtime` 的两跳判断与 `code-owner-settings` 的 E-0018，逐字无出入。** preload 侧 `getTree` 是字段逐个重建的 `{ownerChatId, spaceId}`，多余键上不了车（`api_contract.test.cjs:254-265` 用 `listSpaces({ownerChatId, scope:"user"})` 断言只有 `{ownerChatId}` 过线）。

  **(2) 本次实跑：4 个相关 suite 全绿**（E-0029）。`context_v2_service.test.cjs:498-527` 的 `"space, tree and entry reads are owner-scoped and path-validated"` 逐字断言了 `…/spaces/space-1/tree?owner_chat_id=chat-1`。

  **(3) 七个服务端错误码穿过我这一层：code 保真，message 丢弃。** 机制（E-0026）：

  ```
  服务端 503 {"error":{"code":"context_v2_store_disabled",…}}
    → readJsonResponse:1740-1771   解析 body，把 error.code 挂到 error.code 上
    → contextV2Request:1931-1938   保住 code，重包为 createContextV2Error(code, "context v2 request failed")
    → createContextV2Error:186-190 message = `[${code}] ${message}`，同时保留 .code 给 main 内调用方
    → ipcMain.handle 抛出（Electron 剥掉 .code，只序列化 message）
    → src/SERVICEs/bridges/context_v2_bridge.js:57  /\[([a-z0-9_]+)\]\s/  取回 code
  ```

  七个码 `context_v2_store_disabled` / `context_v2_invalid_request` / `context_v2_not_found` / `context_v2_store_owner_invalid` / `context_v2_unchain_read_unavailable` / `context_v2_unavailable` / `context_v2_owned_by_unchain` **全部匹配 `[a-z0-9_]+`，一个都不会漏解析**。上游 message（可能含 sqlite 绝对路径 / Traceback）被 `:1938` 换成静态串 —— **这是刻意的，`:1932-1933` 有成文理由**。

  > **对本庭的直接回答：不被压平。`0000-0003-2026-0807#S-0010` 归档的「CONTEXT_V2 路上 stable code 端到端不丢」在本案链路上仍然成立。**

  **(4) 但我要给它补两条它没覆盖的边界，其中第一条恰好落在本案最关心的那一态附近：**

  **(a) `ensureMisoReady` 抛的是无码错误。** `contextV2Request` 的第一行就是 `ensureMisoReady()`（`:1893`），而它抛的是

  ```js
  // service.js:1666-1674
  throw new Error(`Miso service is not ready (status=${unchainStatus}${reasonSuffix})`);
  ```

  **没有 `[code] ` 前缀，没有 `.code`。** `parseContextV2ErrorCode` 对它返回 `null`。这不是理论 —— 它被测试逐字锁住：`context_v2_service.test.cjs:1417-1429` 断言 `rejects.toThrow(/not ready/i)`。**即：sidecar 未就绪时 `getTree` 的实际出口是一个收端无法分支的自由格式串**，而「sidecar 未就绪」正是 Inspector 开在冷启动早期时最可能撞上的一态。

  **(b) `context_v2_invalid_request` 主进程本地与服务端同码**（见丙 (1)）。

  **(5) 完整出口清单 —— 一次 `getTree` 调用，renderer 侧有七个互斥出口，其中一个无码：**

  | # | 触发 | renderer 拿到 |
  |---|---|---|
  | 1 | bridge 缺席 | reject `context_v2_unavailable`（renderer 侧自产，`src/SERVICEs/bridges/context_v2_bridge.js:69-75`） |
  | 2 | **sidecar 未就绪** | **reject，无码**，message `Miso service is not ready (status=…, reason=…)` |
  | 3 | `effectiveMode !== "off"` 且 readiness ≠ ready | reject `context_v2_readiness_failed`（`:1897-1906`；**注意：`off` 态下这道门不生效**，请求照发） |
  | 4 | 本地参数校验失败 | reject `context_v2_invalid_request`（不发请求） |
  | 5 | fetch 抛 | reject `context_v2_unreachable` |
  | 6 | 服务端非 2xx | reject，**服务端 code 原样**（7 个之一） |
  | 7 | 200 | resolve，**载荷原样透传，本层不解析、不投影、不封顶** |

  **第 3 行有一条反直觉的推论，方案庭审务必带上**：出厂默认（`effectiveMode === "off"`）时 readiness 门 **不拦**，请求会真的发到 sidecar 再 503 回来。**「本地立即失败」与「远程往返后失败」在延迟与可观测性上完全不同**，别按前者设计。而在 win32 + 开启态下，readiness 恒 `degraded`（甲 (5)），**第 3 行会拦下每一次 `getTree`** —— Windows 上 tree view 结构性拿不到数据，这与 `code-owner-runtime` 的可证伪条件 1 是两回事，须并列记录。

  ### Q2（G1）· 强制表态 —— **部分承担；我认领一件、拒绝一件、预先反对一件**

  **不接受「与我无关」，我不说这句话。**

  **(1) 本案会不会要求我的边界承担今天不属于我的判定职责？—— 会一半，我逐条分开：**

  | 职责 | 今天在哪 | 本案推不推给我 | 我的立场 |
  |---|---|---|---|
  | **计算** 四态与 reason，并跨 IPC 输出 | **已经是我的，且已完成**（`service.js:1039-1055,1645-1663,1852-1887`） | 不推 —— 已有 | **承接，零新工作** |
  | 给该载荷 **加契约测试**（allowlist 形状 + 禁额外字段） | 无人（今天只有 `toMatchObject` 部分断言） | **会推给我** | **我主动认领。** 落 `memory_v2_startup_readiness.test.cjs` + `.js` 孪生 |
  | **定义** 四态的用户可见语义（哪一态显示什么） | 无人 | 不该推给我 | **不落在本边界**（且属方案庭审） |
  | **决定** 谁是权威（`memoryV2` vs `contextV2Bridge.getStatus()` vs `enable_memory_v2`） | 无人 | 会试图推 | **不承接。** 归 `expert-architecture` 出意见 + CEO 裁定 |
  | 决定 `normalizeUnchainStatus` 是否放行 `memoryV2` | `code-owner-shared-arteries` | 不落我 | **不落在本边界**，指名 `code-owner-shared-arteries` |
  | 挡住「character session id 冒充 ownerChatId」 | 无人 | **会试图推给我**（因为门在我这里） | **拒绝在本案内承接**（丙 (3)、FE3）。门在我这里，但它是语法门；要建身份门须单独走 case |

  **(2) 我预先登记一条反对（请本庭记入强制回应清单）：**

  > **我反对任何「在 `contextV2Bridge.getStatus()` 上增加字段以表达未启用/有无数据」的方案。**
  > 理由不是 count-free（那是 `code-owner-settings` 的 N3，我同意但那是另一条）：**理由是同样的信息在 `getMisoStatusPayload().memoryV2` 里已经有了，而且形式更好。** 在一个零参数、count-free、已锁契约的安全面上加字段，去表达一个隔壁已经算好并已跨过 IPC 的状态，是在制造第二个权威 —— **正是 D7 想避免的那件事本身。**

  **(3) G1 是否构成前置阻塞？—— 对可行性不阻塞；对「谁是权威」阻塞；但本案有一条比等裁定便宜得多的出路。**

  我上面全部结论是 `b2385d5d` 上的代码事实与测试事实，**不依赖前案任何裁定**。所以本案可以在 `0000-0003-2026-0807` 裁定前完成议案庭审。

  **出路**：本案可以显式声明 **不新增任何状态源，只消费已存在的 `memoryV2`**。这样 Q0 无论怎么裁，本案都不返工 —— 因为本案没造新东西。**这与 `code-owner-settings` 的硬附加条件（方案庭审首项必须先定四态 owner）不冲突，而是给了它一个更小的靶子**：要指派的不是「建一个状态源」，是「确认 `getMisoStatusPayload().memoryV2` 升为产品状态契约，并把 `normalizeUnchainStatus` 的放行决定指给 `code-owner-shared-arteries`」。**从「建构件」降为「认领一个已存在的契约 + 放行一个字段」。**

  ### 丙（框定第三条）· 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

  **任一条成立即翻：**

  - **FE1 · 若议案要求 tree view 在出厂默认配置下显示真实 V2 数据。** 不可行。`build/build_feature_flags.json` 是 `enable_memory_v2: false` + 冻结的 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`，而打包态改它要重算 `snapshot_fingerprint` 与 `rollout_fingerprint` 两个 sha256 并通过 `memory_v2_rollout.js:241-279` 的双指纹门（E-0023）。**那是 rollout 议案，不是「加一个 view」。** 与 `code-owner-runtime` 的条件 1 同向，我这一层的证据是它的机械原因。
  - **FE2 · 若方案要求在任何 CONTEXT_V2 channel / bridge 方法上增删改字段或参数。** 我这一层从「零改动」变成「改公共动脉」，须走 Full track + `.js`/`.cjs` 双胞胎同步，**并推翻 S-0003 对 `expert-security` 的不传唤判定**。届时我请求补传，且不代其表态。
  - **FE3 · 若方案把「main 侧挡住 character session id 冒充」写成实施细节。** 判不可行。那是新行为、新耦合、新 oracle，须单独走 case（丙 (3)）。
  - **FE4 · 若 `code-owner-shared-arteries` 判定 `normalizeUnchainStatus` 不放行 `memoryV2` 且不新增等价方法。** 我在乙/丁给出的「零代价四态状态源」结论翻转，判据退回 `contextV2Bridge.getStatus()` 的三岔口，本案必须显式接受「在 off 态靠 catch 错误码判态」这条技术债。**不因此不可行，但要 CEO 显式接受，不能默默继承。**
  - **FE5 · 若「`npm start` 下 store owner = unchain」被写进方案或验收前提而不声明环境。** 翻转 —— 不是不可行，是 **不可复现**。该结论依赖不入库、每台机器不同的 `.local/build_feature_flags.snapshot.json`（E-0023）。**验收步骤必须显式声明该文件内容与 `app.isPackaged`，否则验收结果无意义。**
  - **FE6 · 若 `memoryV2` 载荷成为产品状态源而不加双胞胎契约测试。** 我判结构上不可接受。它今天是 15 字段自由形状（4 个 sha256 指纹），只有 `toMatchObject` 的部分断言（E-0030）。**这条我自己认领，翻转条件是「不让我做」。**
  - **FE7 · 若方案要求 tree view 在 Windows 上与 macOS 同等可用。** 不可行。win32 下 ceiling 被压回 `shadow`、readiness 恒 `degraded`、`contextV2Request` 的 readiness 门拦下每一次 `getTree`（甲 (5) + 戊 (5) 第 3 行）。**Windows 上 tree view 只能显示未启用/不可用态**，这与出厂 flag 是两个独立原因，堵住一个不解决另一个。

  **不会被推翻的（可作为方案庭审在我这一层的地基）**：两跳 channel/handler/preload/main 全段存在且双胞胎锁定；`getTree` 必需 `{ownerChatId, spaceId}` 且 query 只带 `owner_chat_id`；缺参同步抛 `context_v2_invalid_request` 且不发请求；服务端七码经我这层 **code 保真 message 丢弃**；`ensureMisoReady` 那一支 **无码**；`PUPU_CONTEXT_V2_STORE_OWNER` 取值二元、无条件覆写、单一 spawn 点。

  ### 留待方案庭审（自行标注，本阶段不作为结论）

  按 S-0001 的范围纪律登记，不主张：

  - **七个出口收敛成几个用户可见状态**（戊 (5)）—— 收敛比例与措辞是设计。
  - **是否轮询 status / 轮询谁** —— `memoryV2` 是本地读（廉价、永不失败），`contextV2Bridge.getStatus()` 是远程读（可失败、可超时，4s facade 超时在 `api.unchain.js:873-878`）。**两者的轮询代价差一个数量级，这是技术事实**；轮不轮、多久轮一次是设计。
  - **`getTree` 无上界这件事**（E-0032）：十八个方法里唯一没有 limit/page 的读方法，本层不封顶。要不要在方案里补一个上界，是设计 + 契约取舍；**若决定补，那是 bridge 面改动，直接触发 FE2。**

- **边界命中依据**: `pupu:electron/**`，第一层路径机械命中 **12 处**（E-0002，本案命中数最高者）。本次实际作业触及本边界内 9 个文件：`electron/main/services/unchain/service.js` · `electron/main/services/unchain/memory_v2_rollout.js` · `electron/main/ipc/register_handlers.js` · `electron/main/services/boot_readiness/service.js` · `electron/main/services/chat_storage/service.js` · `electron/shared/channels.js` · `electron/preload/channels.js` · `electron/preload/bridges/context_v2_bridge.js` · `electron/preload/bridges/unchain_bridge.js`，以及 6 对 `.js`/`.cjs` 测试双胞胎。**跨界只读引用（登记，不构成本边界主张）**：`pupu:src/SERVICEs/bridges/context_v2_bridge.js` 与 `pupu:src/SERVICEs/api.shared.js` · `pupu:src/SERVICEs/api.unchain.js`（`code-owner-shared-arteries`）· `pupu:src/PAGEs/chat/chat.js`（`code-owner-chat-core`）· `pupu:unchain_runtime/server/route_memory_v2.py` 与 `memory_v2_runtime.py`（`code-owner-runtime`）· `pupu:build/build_feature_flags.json` 与 `package.json`（`code-owner-devtools`）。结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案推进，我边界内 0 处必须改动。** `listSpaces` / `getTree` 两跳的 channel 常量、preload 白名单、preload 方法、main handler 绑定、main 实现 **全部现成且被双胞胎锁住**。这是我这一半的主要结论。
  - **条件性影响 1（我主动认领，量级 = 一个 test case）**：若 `getMisoStatusPayload().memoryV2` 升为产品状态契约 → `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.cjs` 加 allowlist 形状断言，**同步其 `.js` 孪生** `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.js`。
  - **条件性影响 2（我反对，登记以便本庭判断代价）**：若判定要给 `contextV2Bridge.getStatus()` 加字段 → `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1945-1986` + `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/context_v2_bridge.js:42` + 两对双胞胎（`ipc_channels` / `api_contract`）+ Full track + `expert-security` 补传。
  - **条件性影响 3（我拒绝在本案内承接）**：若要求 main 侧做 ownerChatId 存在性校验 → `service.js:198-204` 与 `electron/main/services/chat_storage/service.js` 之间的新耦合，另开 case。
  - **无影响**：SSE 流中继、vault、settings storage、window 管理、boot readiness 门。本案不触及。**特别地：`boot_readiness/service.js:224-226` 读的是同一个 `getMisoStatusPayload()`，但只取 `status` / `ready` 两个字段，`memoryV2` 对它不可见 —— 新增消费者不影响 boot 门。**

- **约束**:
  1. **渲染进程绝不碰 `ipcRenderer`**（工程铁律）。tree view 一切系统访问只经 `window.contextV2API` / `window.unchainAPI`，**不得新增任何直连，也不得在 renderer 侧自造 channel 名**。
  2. **任何 channel / bridge 面的增删改强制 Full track**，且 `electron/shared/channels.js` 常量 + `electron/preload/channels.js` 白名单 + preload 方法 + main 绑定 + **`.js`/`.cjs` 双胞胎必须同一次改完**。本案当前范围内 **不需要动任何一处**。
  3. **不得给 `contextV2Bridge.getStatus()` 增加任何字段或参数**（我的预先反对）。与 `code-owner-settings` 的 N3 同向但理由不同：N3 禁计数，我禁一切新增字段。
  4. **不得把 `memory_v2_store.py::get_tree` 写进任何验收断言。** 与 `code-owner-runtime` 的约束 2 同向；我这一层给出的是机械原因：Electron 永不产 `pupu_legacy`（甲）。
  5. **验收环境必须声明三件事，否则 store owner 不可复现**：`app.isPackaged` 的取值、`.local/build_feature_flags.snapshot.json` 的内容（**不入库！**）、`PUPU_FEATURE_MEMORY_V2` / `PUPU_MEMORY_V2_MODE` 是否经 `npm start` 注入。**缺任一项，「跑通了」这句话不成立。**
  6. **平台差异必须写进验收矩阵**：macOS 与 win32 在本案链路上行为不同（win32 恒 `degraded`，readiness 门拦下每一次 `getTree`）。**只在 macOS 上验过不等于验过。**
  7. **`.py` 改完 sidecar 必须重启**（工程铁律）。我是 relay 的一端：**Electron 侧的 `memoryV2Readiness` 在 sidecar 重启后由 `startMiso` 重置为 `initialMemoryV2Readiness()`（`service.js:4706`）再重新探测** —— 即改了 `.py` 又不重启 Electron，会看到一个基于旧探测结果的状态。报告与验收都须标注。

- **建议处置**: **本案可进入方案庭审。** 我不设阻塞，但请本庭先确认四项，否则方案会建在两个错误的地基上：

  1. **记 E-0006「已知事实 2」的更正**（甲），并把 `code-owner-runtime` 表格的 dev 行改为条件式（本机属性，非仓库属性）。
  2. **记 `code-owner-settings` 的 F2 为「已被本边界证据部分证伪」**，并把该条重新指向 `normalizeUnchainStatus`。**这是本案唯一一条被两名必到者以相反证据碰上的判断，不压成一个声音。**
  3. **把 Q2 的可指派动作改写为具体两项**（而非「建一个状态源」）：(i) 确认 `getMisoStatusPayload().memoryV2` 是否升为产品状态契约（若是，契约测试归我，我已认领）；(ii) 把 `normalizeUnchainStatus` 的放行决定指派给 `code-owner-shared-arteries`。**D7/D8 那个「无主构件」在 main 侧已经存在且已过线，问题是归属与放行，不是建造。**
  4. **确认本案显式声明「不新增状态源、只消费已存在的四态」**。若确认，本案对 `0000-0003-2026-0807` 的 Q0 裁定 **无依赖**，可与前案并行推进；若不确认（即本案要自造状态判据），我支持 `code-owner-settings` 的硬附加条件——先定 owner 再动手。

  另请本庭注意：我 **不请求** 补传任何角色。`expert-security` 的不传唤判定在本案当前范围内成立，触发条件我已画在丁 (4) 与 FE2；一旦命中，我本人请求补传。

#### S-0011 | ASSESSMENT | code-owner-shared-arteries → case
- **阶段**: 议案庭审
- **结论**: **可行，且我的边界内零改动。** 逐条：**甲 —— Inspector 成为 `getStatus()` 的第一个 renderer 消费者，我不反对，代价为零**（该方法今天已经是 `REQUIRED_METHODS` 的一员、已是可用性门的成立条件之一、已被我的测试覆盖，新增调用点是纯加法）。**但我同时部分证伪 F2 的前提**：`code-owner-settings` 把 F2 定为「唯一无绕行方案」的那一条，其依据是「`getStatus` 会 resolve 出 `available:false`」——**在最需要它作答的那一态里它不 resolve，它 reject**（E-0038）。更要紧的是，**`getTree` 单独一次调用就已经能区分空态与未启用态**（E-0039）：resolve ⟺ 读真的发生了，reject ⟹ 没发生且码说明原因；后端不存在「store 关着却回 200」这种出口（runtime E-0010 b）。**故 F2 即便成立也不塌 Q4，它从「无绕行」降级为「两条路里较贵的一条」。** **乙 —— 保真，42 个 sidecar 码零损耗透传，解析面按字符集开放而非白名单封闭**（未知码原样到达而不是被丢弃，这对 Q4 是好性质）；**一处实质缺陷：`context_v2_unavailable` 是我自造码与 sidecar 码的碰撞，且 sidecar 那一侧就在读路径上**（E-0037）。**丙 —— 两跳在我 facade 上完整，且第一跳 `listSpaces` 今天已有活的生产消费者**（`memory_v2_pending_reviews.js:782`，E-0040）——**本案要新增的是第二跳的第一个消费者，不是两跳的第一个消费者**。两个「空」在我这一层 **不可区分，因为我这一层不区分任何东西**——facade 逐字透传，join 是调用方的活。**丁 —— 无结构性障碍**。**Q2 —— 成立，四态判定该落我边界内，我接，但有 P1/P2/P3 三个前置，缺一我不接并指名 `code-owner-electron` 为替代 owner**
- **依据**: E-0001, E-0002, E-0004, E-0005, E-0006, E-0033, E-0034, E-0035, E-0036, E-0037, E-0038, E-0039, E-0040, E-0041, 0000-0003-2026-0807#S-0024, 0000-0003-2026-0807#S-0014
- **不确定性**:

  **一 · 我未起 sidecar、未跑应用、未跑 `react-scripts test`。** 全部结论来自 PuPu `b2385d5d` 的静态阅读 + 一次纯 `node -e` 的正则探针（E-0036）。凡涉及运行时行为的，我按下列归属标注：sidecar 归 `code-owner-runtime`，主进程归 `code-owner-electron`。

  **二 · 甲 的核心论断里有一段是 *推断*，不是观察。** 「shipped 配置（`store_owner=off`）下 `getStatus()` 会 reject 而不是 resolve」是我对 `electron/main/services/unchain/service.js` 控制流的阅读（E-0038）**乘以** `code-owner-runtime` 的 E-0010 b3（须查类，其自述用 Flask `test_client`、鉴权被替身、未起真实 sidecar）。**两个都不是产品运行观察，乘出来的结论只能是推断。** 请 `code-owner-electron` 在自己边界内确认或推翻。**我已核实该分支无测试守护**（E-0038 第 3 点）。

  **三 · 我对 `electron/**` 与 `unchain_runtime/**` 的全部引用都是跨界只读**，用途仅限于确定「到达我 facade 的 promise 是什么形状」。**权威结论归各自 owner，我不代其表态。**

  **四 · G2 继承。** 本机 V2 store `entries=0`。我这一层不解析载荷，所以「有数据时 tree 长什么样」对我的结论 **不构成影响**——但也意味着我 **无法** 为正常态的载荷体积、序列化开销、IPC 单帧上限给出任何承诺。凡涉及正常态量级的问题，我的答案是「未取证」，不是「没问题」。

  **五 · E-0001 的完整性限制要求承重复核时重测工作树，我已重测（E-0033），结果与 E-0001 不完全一致**：现为 12 个 dirty/untracked 条目（E-0001 记 8 个），新增 4 个全部是 **我自己的 `.claude/agent-memory/code-owner-shared-arteries/` 与 `0000-0005` 案卷**。**`src/` `electron/` `unchain_runtime/` 三个产品目录仍为零 dirty**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**仍然成立**。

- **请求/下一步**:
  1. **请本庭把「F2 是唯一无绕行方案的推翻条件」这一定性 *下调*，并把 E-0039 记为对它的部分反驳。** 我不主张 F2 不存在——我主张它不再是单点。Q4 的可判别性在 `getStatus` 被禁的世界里 **依然成立**，成本是判态逻辑从「读字段」变成「读 `getTree` 自身的拒绝码」。这直接改变 `code-owner-settings` 的 N2 该怎么写。
  2. **请 `code-owner-electron` 就三件事作权威答复**（都在其边界，我只能读到形状）：(a) shipped 配置下 `getStatus()` 究竟 resolve 还是 reject（E-0038 的推断）；(b) `createContextV2Error` 的 `` `[${code}] ${message}` `` 线格式与「码字符集恒为 `[a-z0-9_]`」是否是其愿意承诺的 **稳定契约** ——我的 `parseContextV2ErrorCode` 完全建在这两条上（E-0036）；(c) `memoryV2Readiness`（`service.js:1068`，`code-owner-runtime` 已指出它存在且未暴露）**是否会被暴露给 renderer**。(c) 是我 Q2 表态的 P3 前置。
  3. **请 `code-owner-runtime` 确认码字符集的产端半边**：我实测其 V2 面 42 个码 **全部** 符合 `[a-z0-9_]+`（E-0037）。请其确认这是有意的约定还是巧合。**若是巧合，我这层的保真在下一个新码上就可能静默失效**（落 `null` → 消费方 `|| 默认码` → 静默错归因，不报错）。
  4. **请本庭把 `context_v2_unavailable` 的双重语义记为一条新增已知缺口**（E-0037）：我的 facade 为「bridge 缺席」自造它，sidecar 在 9 个非测试点也发它、其中 `route_memory_v2.py:333` **就在读路径上**。前案未问过这一条。
  5. **请 `code-owner-chat-bubble` 知情一条与其直接相关的事实**：`listSpaces` 的既有消费者 `memory_v2_pending_reviews.js:800-802` 用 `Array.isArray(spacePayload?.spaces) ? … : []` 把「没有 space」与「载荷畸形」折叠成同一个空数组——**`code-owner-settings` 的 C1 所警告的那个缺陷，在第一跳上今天已经存在**。我只登记，处置权归其边界。

- **评估结论**: 逐问见正文四节 + Q2 一节 + 可证伪一节。总括：**甲 = 可接受（零代价），但 F2 的杠杆被部分证伪；乙 = 保真且解析面开放，一处码碰撞；丙 = 两跳完整、第一跳已有消费者、两个「空」在我这层结构上不区分（设计如此）；丁 = 无结构性障碍、零改动；Q2 = 落我边界成立，我接，附 P1/P2/P3 三前置与一条对 `expert-security` 的存续分歧。** 附约束 A1~A5。

- **边界命中依据**:
  - `pupu:src/SERVICEs/bridges/context_v2_bridge.js` —— 第一层路径机械命中（E-0002 / S-0003）。**这 125 行是 renderer 侧 V2 读平面的唯一实现**：我核实 `src/SERVICEs/api*.js` 对 `context_v2` / `contextV2` / `memory_v2` / `memoryV2` 的匹配数为 **0**（E-0034），即 `api.unchain.js` **不在** 本案链路上，不存在第二个 facade 可找。
  - `pupu:src/SERVICEs/runtime_events/**` —— 已登记，**本案不命中**。`memory_v2_trace_presenter.js` 处理的是流式 trace bundle，与 `/context/v2/**` 读平面无交集。写在这里是为了让本庭知道「shared-arteries 边界里有另一处叫 memory_v2 的东西，它不是这个」。
  - `pupu:src/CONTAINERs/**` —— **本案不命中**。`ConfigContext` 不携带 chat id，与 `code-owner-settings` E-0017 的完整性限制（其未穷举全部 provider）互补：我核实 `src/CONTAINERs/` 下只有 `config` 一个 provider（E-0034）。**故 settings 挂载点无法经 context 隐式取得 chat 上下文，E-0017 的那条限制可以关闭。**
  - `pupu:src/locales/**` —— 附带项命中，见第五节。
  - **残余条款**：本案不产生任何落入残余的新文件。附带一条与 E-0002 相关的边界自愈信号，见第五节末。

- **受影响对象**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js` —— **若本案按我的结论推进，本文件零改动**。相关行：`:32-51` 18 方法白名单（`getStatus` 在 `:33`）· `:57` `ERROR_CODE_TOKEN_PATTERN` · `:59-67` `resolveApi` 全有或全无探针 · `:69-75` **自造 `context_v2_unavailable`（碰撞点）** · `:77-82` `parseContextV2ErrorCode` · `:86-94` `invokeBridge` · `:102` `getStatus` · `:107` `listSpaces` · `:108` `getTree`
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.test.js` —— **零改动**。锁定项：`:39-56` facade 键集恒为 `isAvailable + 18` 且 `toHaveLength(18)` · `:93-99` / `:155-160` 缺任一方法即 fail-closed · `:162-177` 不吞码 · `:179-189` 同步抛转拒绝 · `:191-196` 码解析。**新增消费者不动其中任何一条；新增 *方法* 会同时动三条。**
  - **条件性影响（仅当 Q2 落我）**：`src/SERVICEs/bridges/` 下新增一个模块 + 其测试。**不写进 `context_v2_bridge.js` 本体**，理由见 Q2 一节。
  - `/Users/red/Desktop/GITRepo/PuPu/src/locales/*.json`（11 个）—— 条件性，仅当方案庭审新增文案。今天 `memory_inspect` 命名空间 13 键 × 11 locale，键集完全对等（E-0041）。
  - **跨边界，仅登记不主张**：`electron/main/services/unchain/service.js:120,186-212,1733-1782,1892-1986`（`code-owner-electron`）· `unchain_runtime/server/route_memory_v2.py:259,333,388,504,591,719,804,856` 与 `memory_v2_runtime.py:702`（`code-owner-runtime`）· `src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:736,782,800-802` 与 `memory_v2_journal_reload.js:274`（`code-owner-chat-bubble`）

- **约束**:
  - **A1 · facade 不得长出校验、载荷归一、缓存、重试或去重。** 文件头 `:6-9` 写死「performs NO validation of its own（main is the single validating boundary — a second, drifting copy of the rules here would be worse than none），holds NO state，touches NO localStorage」，并由 `:39-56` 与 `:74-90` 两条测试守护。**tree view 若需要这四样中的任何一样，须落在调用方或一个新模块，不落 facade。** 有人要求写进 facade，我以 `OBJECTION` 反对。
  - **A2 · 不得新增 facade 方法。** 本案的读序列（`listSpaces` + `getTree`）与判态所需（`getStatus`）**三个方法今天全在**。新增方法会同时动 18 方法锁、preload 面与 IPC 面，并按其触发条件把 `expert-security` 拉进本案——而 S-0003 的不传唤判定正是建立在「本案不增删改任何 IPC channel 或 bridge 面」上。**零新增方法是这条判定继续成立的条件，也是本案保持在当前 quorum 上的条件。**
  - **A3 · 判态不得只读 `getTree` 的载荷字段，也不得只读 `getStatus` 的字段。** 前者无判别位（settings E-0019 / runtime E-0010 a）；后者在最需要它的那一态里不返回字段而是抛（E-0038）。**唯一结构上成立的判据是「调用的成败 + 拒绝码」**，见 E-0039。我支持 `code-owner-settings` N2 的两个否定半（不得用载荷、不得用 `enable_memory_v2`），**反对其肯定半的排他性**（「必须来自 `getStatus`」）。
  - **A4 · 未知码必须落第三态，永不落「空」。** `parseContextV2ErrorCode` 对不符字符集的码返回 `null`，而今天 **三个既有消费者一律写成 `parseContextV2ErrorCode(error) || "<自己的默认码>"`**（`memory_v2_journal_reload.js:274` · `use_chat_stream.js:3920,4013`）——**`null` 会被静默替换成一个看起来合理的默认码，不报错、不落日志**（E-0036/E-0037）。这是我这层最真实的失真面，任何新消费者必须显式处理 `null`。
  - **A5 · tree view 若挂进 Inspector 现有 5s 静默轮询，须有 in-flight guard 且静默轮次的失败必须可见。** 今天三个 V2 消费者 **零轮询**（E-0040），tree view 会是 V2 读平面的第一个轮询消费者，代价是 **2 次 IPC/tick × 每个打开的 modal**；而我的 facade **无缓存、无去重、无 in-flight 合并**（`:24-25` 明写「never cache module-level state」）——**限流纪律 100% 在调用方**。叠加 settings E-0021 所述「静默轮次的 `.catch` 被 `if (!silent)` 整个吞掉」，后果是 **我这一层的失败对用户与对日志同时不可见**。

- **建议处置**:
  1. **判为「可行」并进入方案庭审**，我这一侧不设前置阻塞。**但请把 A3 与 E-0039 写进裁定文本**——判态处方从「读 `getStatus` 的字段」改为「以调用成败 + 拒绝码为准，`getStatus` 作为补充而非唯一支点」。写错了这一条，方案会去要一个后端不打算给的判别位。
  2. **把 Q2 的落点指派做成方案庭审的准入条件**，与 `code-owner-settings` 的建议一致，**但我在此处比它多走一步：我明确认领，并给出条件**（见 Q2 一节）。请 `chief-judge` 就 P1/P2/P3 三条与 `expert-architecture` 的落位意见一并裁。**我不接受「五份拷贝」这个空选项。**
  3. **请本庭在第三层门禁重判是否补传 `code-owner-chat-bubble` 对 E-0037 码碰撞与 E-0040 第一跳折叠的知情**——它已在名单内（S-0003 #7），我只是把两条新事实指给它。
  4. **附带项按事实登记即可，不需处置**（第五节）。

---

## 一 · 甲 —— F2：Inspector 成为 `getStatus()` 的第一个 renderer 消费者，我是否接受

### 1.1 直接回答：**接受，且代价为零**

三条独立理由，都在我边界内可核（E-0035）：

**(a) `getStatus` 今天不是「休眠方法」，它已经是承重的。** 它在 `REQUIRED_METHODS`（`:33`）里，而 `resolveApi()`（`:59-67`）要求 **18 个方法全部存在** 才返回 api。也就是说：**如果 preload 没有 `getStatus`，今天三个 chat-bubble 消费者就全部会因为 `isAvailable()` 为假而集体失明。** 它早已是可用性判定的成立条件之一，只是没人调过它。**新增一个调用点不新增任何暴露面。**

**(b) 我的测试今天就在调它。** `context_v2_bridge.test.js:129-131` 断言 bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝；`:151-152` 断言安装后 `getStatus()` 转发且 **不带参数**。**调用路径已被覆盖，新增消费者不需要我改一行测试。**

**(c) 它是这 18 个方法里权限最低的一个。** 零参数（`:102` `invokeBridge("getStatus", [])`），不携带 owner scope、不携带 path/port/token，返回是主进程 8 字段 allowlist 投影且被 `service.js:1942-1944` 的 count-free 注释写成不变量。**我完全同意 `code-owner-settings` 的 N3：不得请求在它上面加计数或「有无数据」位。** 那会把一个零权限探针变成枚举 oracle。

**故：我不反对。零 diff。** 这一条我表态完毕。

### 1.2 但 F2 的 *前提* 我部分证伪 —— 而这比 F2 本身重要

`code-owner-settings` §2.2(b) 写：「`available:false` / `rolloutMode:"off"` / `featureCeiling:"off"` 就是『未启用』。它是 renderer 今天能拿到的、唯一不靠猜的启用态信号。」

**读主进程控制流，`getStatus()` 有三种互不相同的出口，而上面那句只覆盖了其中一种**（E-0038）：

| 出口 | 触发条件（`service.js`） | renderer 侧观察到什么 |
|---|---|---|
| **(i) resolve 合成负值** | `:1946` `unchainStatus !== "ready" \|\| !unchainPort` —— **sidecar 根本没起来** | `{available:false, rolloutMode:"off", featureCeiling:"off", …}`，**且一次请求都没发**（`context_v2_service.test.cjs:249-288` 有测试锁定） |
| **(ii) resolve 真值** | sidecar 起来了且 `/status` 回 200 | 8 字段真实投影（runtime E-0012 S3 观察到 `pupu_legacy` 下 200 + `rollout_mode:"off"`） |
| **(iii) reject** | sidecar 起来了但 `/status` 非 2xx | 抛 `[context_v2_store_disabled] context v2 request failed`（runtime E-0010 b3 观察到 `store_owner=off` 时 `/status` 自身 **503**） |

关键在于 `contextV2Request` 的就绪门（`:1897-1906`）对 `/status` **显式豁免**（第一个条件 `endpoint !== …/status`），所以 `/status` 一定会真的发出去；发出去撞上 503，`readJsonResponse`（`:1740-1771`）就抛，`:1931-1939` 再包成 `[code] …` 抛给 renderer。

**净效果：在「未启用」这个最需要判别的态里，`getStatus()` 走的多半是 (iii)，即 *抛错*，而不是 resolve 出 `available:false`。** 也就是说 `code-owner-settings` 想用 `getStatus` 避开的那件事——「catch 503 再匹配 `error.code` 字符串」，`code-owner-runtime` Q2(1) 称之为「把状态契约建在错误消息上」——**用 `getStatus` 一样避不开。**

**这一段是推断，不是观察**（见不确定性二），归 `code-owner-electron` 确认。**我已核实它无测试守护**：`context_v2_service.test.cjs` 只锁了出口 (i)（`:249-288`）与出口 (ii) 的字段投影（`:210-247`），**没有任何测试覆盖 `/status` 非 2xx 的 (iii)**。

### 1.3 而这把 F2 从「唯一无绕行」降级为「两条路里较贵的一条」

因为 **`getTree` 自己就是一个判别器**（E-0039）。结构论证，不依赖具体码：

> **`getTree` resolve ⟺ 读真的发生了。** 主进程对数据调用 **没有** `getStatus` 那种「短路成合成负值」的分支——`:1946` 的短路是 `getContextV2Status` 独有的，`getContextV2Tree`（`:2108-2116`）没有对应物，它要么走完 `contextV2Request` 拿到 200 载荷，要么抛。
> **`getTree` reject ⟹ 读没发生**，且拒绝码说明为什么没发生。

再叠上 `code-owner-runtime` 已实跑钉死的一条：**后端不存在「store 关着却回 200」这种出口**（E-0010：`store_owner=off` → 503 `context_v2_store_disabled`；`store_owner` 非法 → 503 `context_v2_store_owner_invalid`；`UNCHAIN_DATA_DIR` 缺 → 503 `context_v2_unavailable`）。

**结论：**

| 用户面状态 | 单次 `getTree` 的观察 |
|---|---|
| 已启用 · 空 | **resolve**，`entries: []` / `tree: []` |
| 已启用 · 有数据 | **resolve**，`entries` 非空 |
| 未启用（store off） | **reject** `context_v2_store_disabled` |
| 已启用但降级 | **reject** `context_v2_readiness_failed`（`:1902`，仅当 `effectiveMode !== "off"`） |
| bridge 缺席 | **reject** `context_v2_unavailable`（我的 facade `:69-74`） |

**空态与未启用态落在 `resolve` / `reject` 两个不相交的分支上。** 所以：

> **即便 F2 成立（`getStatus` 被禁），Q4 也不塌回不可判别。** 处方变成「以数据调用自身的成败与拒绝码判态」，`getStatus` 退为 **补充信号**（它能进一步区分 (i) sidecar 没起来 与 (iii) store 关着，而 `getTree` 在这两种情况下的拒绝码可能不同也可能相同——这一格我未核实）。

**我不主张 F2 应当被删除**，它对「判态的形状」仍有影响。**我主张它不该被记为「唯一会把结论推到不可行且无任何绕行方案」的那一条。** 请本庭据 E-0039 下调其定性。

**对 `code-owner-settings` N2 的具体修订建议**（其边界，我只提议不主张）：把「必须来自 `getStatus()`」改为「**必须来自服务端权威信号——数据调用的拒绝码，或 `getStatus`；不得来自载荷字段，不得来自 `enable_memory_v2`**」。两个否定半我完全支持，尤其 `enable_memory_v2` 那一条——**我的记忆里有独立复跑过的一条相邻事实**：`enable_memory_v2` 在全部 18 个 tag 上出现 0 次，Memory V2 从未随任何发布出厂，其 flag 取值也不由仓库决定（`.local/build_feature_flags.snapshot.json` 不入库、无历史）。**拿它冒充 store 状态既是造假状态源，也是查了一个查不出东西的地方。**

---

## 二 · 乙 —— 错误码穿过我这一层是否保真

### 2.1 完整传输链（E-0036），逐段核实

```
sidecar          {"error":{"code":"<code>","message":"<msg>"}} + 非 2xx
  ↓ readJsonResponse            service.js:1746-1757  取 parsed.error.code 原样 trim → error.code
  ↓ contextV2Request catch      service.js:1931-1939  code 保留；**message 被换成静态串**
  ↓ createContextV2Error        service.js:186-190    new Error(`[${code}] ${message}`); error.code = code
  ↓ ipcMain.handle                                    **剥掉 error.code**，只留 message，并加前缀装饰
  ↓ preload bridge              纯 ipcRenderer.invoke 透传，不重包、不归一
  ↓ parseContextV2ErrorCode     context_v2_bridge.js:57,77-82   /\[([a-z0-9_]+)\]\s/ 取回码
```

**`:1931-1939` 是这条链最关键的一段，值得逐字引用**——它是「码保真、消息不保真」的成因：

```js
// readJsonResponse surfaces the sidecar's stable error code; keep it and
// re-wrap so the renderer only ever sees "[code] static message".
const code = error && typeof error.code === "string" && error.code
    ? error.code : "context_v2_failed";
throw createContextV2Error(code, "context v2 request failed");
```

**即：sidecar 的码原样穿过，sidecar 的 message 被丢弃。** 这正是我这层的字符集锁（`:53-56` 注释）能成立的原因——**消息里不可能再有用户内容，所以括号 token 不会假命中**。

### 2.2 实测：**原样到达，包括穿过 ipcMain.handle 的装饰**（E-0036）

我对 10 个码（runtime 点名的 7 个 + 我自造的 `context_v2_unavailable` + 主进程自造的 `context_v2_readiness_failed` / `context_v2_unreachable` / `context_v2_failed` / `context_v2_missing_auth_token`）各跑两遍：直接 wrap，以及套上 `Error invoking remote method '…': Error: ` 装饰。**20/20 全部原样取回。** 正则未加锚定，前缀装饰不影响。

### 2.3 解析面是 **开放** 的，不是封闭的 —— 这对 Q4 是好消息

**`parseContextV2ErrorCode` 没有白名单。** 它按字符集抽取，返回它看到的任何 `[a-z0-9_]+` token。所以：

- **未知码不会被丢弃，会原样到达收端。** 我实测 sidecar 的 V2 面共 **42 个互不相同的码，全部符合 `[a-z0-9_]+`**（E-0037）。**加上主进程自造的 5 个，收端今天可能看到 47 个码，全部可解析。**
- 这是刻意的：facade 头 `:6-9` 明写「a second, drifting copy of the rules here would be worse than none」。**在我这层维护一份码白名单 = 每加一个后端码就多一处静默失配。**

**「未知码落到哪」——这是本节唯一的实质缺陷，答案是「落到调用方的默认码，静默地」**：

```
memory_v2_journal_reload.js:274   parseContextV2ErrorCode(error) || "context_v2_journal_unavailable"
use_chat_stream.js:3920, 4013     parseContextV2ErrorCode(error) || "context_v2_failed"
```

`null` 与「解析出一个码」在这三处 **写法上不可区分**。所以失真只在一种情况下发生：**码不符字符集** → 返回 `null` → 被 `||` 替换成一个看起来合理的码 → **不报错、不落日志、用户面看到一个错误的归因**。我实测的漂移样本：

```
"context-v2-store-disabled" → null      "CONTEXT_V2_OFF" → null
"context.v2.off"            → null      "v2Disabled"     → null
"store_disabled_2"          → "store_disabled_2"   （符合字符集，正常穿过）
```

**故 A4：任何新消费者必须显式处理 `null`，不得用 `|| 默认码` 把它吞掉。** 并请 runtime 确认「42/42 符合字符集」是约定还是巧合（请求 3）。

### 2.4 一处实质碰撞：`context_v2_unavailable`（E-0037）

**我的 facade 为「bridge 缺席」自造这个码**（`:69-74`）。**sidecar 在 9 个非测试点也发这个码**：`route_memory_v2.py:259,333,388,504,591,719,804,856` + `memory_v2_runtime.py:702` + `memory_v2_store.py:1527`，语义是「Context V2 storage is not configured」（`UNCHAIN_DATA_DIR` 未配置，503 + `retryable: true`）。

**`route_memory_v2.py:333` 就在 `_read_runtime_for_store_owner` 里——即 `get_tree` 的读路径上。** 所以这不是理论碰撞。

碰撞后果：收端拿到 `context_v2_unavailable` **无法区分**「renderer 侧 preload 没装上」与「sidecar 侧没配数据目录」。理论上还有一个区分位——**我本地造的 error 保留 `error.code` 属性，穿过 IPC 的那个被剥掉了**——但没有任何消费者读 `error.code`，且依赖这个是隐式契约，我不推荐。

**这对本案的影响是有界的**：两种语义都是「第三态 / 未知」，都不是「空」，所以 **不影响 Q4 的空/未启用二分**。但它确实使「第三态里到底出了什么事」不可判，**且本案会把它从 3 个消费者扩到 5 个**。我按新增缺口报给本庭（请求 4），**不在本阶段主张修**——修法（给我的自造码改名）会破坏两个既有 chat-bubble 消费者的码处理，破坏面非零（见可证伪 D-F4）。

---

## 三 · 丙 —— 两跳读序列在我 facade 上是否完整

### 3.1 现状复核（E-0006 行号复核通过，E-0034）

```
src/SERVICEs/bridges/context_v2_bridge.js
  :38  "listSpaces"    ← REQUIRED_METHODS
  :39  "getTree"       ← REQUIRED_METHODS
  :107 listSpaces: (payload) => invokeBridge("listSpaces", [payload])
  :108 getTree:    (payload) => invokeBridge("getTree",    [payload])
```

**两跳都在，两跳都是纯透传**：不校验参数（`spaceId` / `ownerChatId` 在我这层一律不看）、不改载荷、不归一返回。**payload 逐字节到达 preload**——这条被 `context_v2_bridge.test.js:74-90` 以另一个方法锁定，机制同一。

### 3.2 一条对记录的修正：**第一跳不是新消费者**（E-0040）

`code-owner-runtime` 说「`listSpaces` 全链路已通」，`code-owner-settings` E-0018 说「`spaceId` 的来源我未核实」。**我这层能给出比两者都强的一条**：

```
src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:782
    contextV2Bridge.listSpaces({ ownerChatId: owner })
```

**`listSpaces` 今天已有一个活的生产消费者**，在 `Promise.all` 的四路之一（`:766-783`），以 `ownerChatId` 为唯一入参，结果被消费在 `:800-802` 与 `:826-834`（`space_id` → `revision` 的 Map）。

**净效果，请本庭记入**：`case.md` 与 `FRAMING` 的「第一个 `getTree` 消费者」这个表述可以再收窄一格 —— **本案新增的是「两跳读序列中第二跳的第一个消费者」，第一跳今天就在跑。** 这使 Q1 的风险面比目前记录的还要小一档。

### 3.3 两个不同语义的「空」，在我这一层是否可区分

**直接回答：在我这一层 *不可区分*，因为我这一层 *不区分任何东西*。这是设计，不是缺陷。**

- `{"spaces": []}`（会话从未调过 memory 工具，第一跳，runtime E-0012 S1 实测 200）与 `{"entries": [], "tree": []}`（有 workspace 但空，第二跳，runtime E-0010 a 实测 200）—— **它们是两个不同调用的两个不同形状**，我逐字返回，**所以在 *调用点* 上它们是平凡可区分的**（不同的 promise、不同的键）。
- 但 **我的 facade 里没有任何东西把「第一跳空」和「第二跳空」映射成一个概念**。谁调谁 join。这与 A1 一致：facade 无状态、无归一。

**这一条推出一个对方案有实质约束力的结论**：

> **判态逻辑必须是一个跨两跳的状态机，不是两个独立的 try/catch。** 第一跳空 ⟹ 第二跳 **根本不会被发出**（没有 `spaceId`），于是「未启用」这个态在第一跳空的路径上 **永远不会被 `getTree` 观察到**——它只能由第一跳自己的成败与拒绝码给出。而 runtime E-0012 S4 已实测：`store_owner=off` 时 **`listSpaces` 也返回 503 `context_v2_store_disabled`**。
>
> **所以 E-0039 的判别结构在第一跳上同样成立，而且必须在第一跳上先跑一遍。** 这是我对 `code-owner-settings` §2.2 那个「两次调用的 join」的具体化：**join 的两次不是「`getStatus` + `getTree`」，而是「`listSpaces` + `getTree`」，且 `getStatus` 是可选的第三次。**

### 3.4 既有第一跳消费者的处理方式，登记一条不利事实

```
memory_v2_pending_reviews.js:800-802
    spaces: Array.isArray(spacePayload?.spaces)
      ? spacePayload.spaces.slice(0, MAX_PENDING_ITEMS * 2)
      : [],
```

**「没有 space」与「载荷畸形 / 键缺失」在这里折叠成同一个空数组。** 这正是 `code-owner-settings` C1 所警告的形态（「不得以『载荷里没东西』作为 empty 的唯一判据」），**它在第一跳上今天已经存在**。归 `code-owner-chat-bubble`，我只登记（请求 5）。**tree view 不得复制这个写法。**

---

## 四 · 丁 —— Q1 我端的现状核实

### 4.1 `getTree` 的转发形状与参数校验

`:108` `getTree: (payload) => invokeBridge("getTree", [payload])`。**零校验。** 我不看 `ownerChatId`，不看 `spaceId`，不看类型。校验在主进程（`service.js:2109-2110` `requireContextV2OwnerChatId` + `requireContextV2Identifier(spaceId, "spaceId")`），**这是刻意的单一校验边界**（facade 头 `:6-9`）。

**对本案的直接后果**：`code-owner-settings` 的 N1（「不许在 modal 内部推导 `ownerChatId`」）**在我这层没有任何强制手段可以帮它**——我不会挡下一个语义错误的 owner id，主进程的正则也不会（其 E-0016 实跑证实 `character_foo__dm__main` 通过校验）。**N1 只能靠挂载点契约与代码评审保证，我这层不提供防线。这一条我确认，且不打算改——加一层校验就是造第二份漂移规则（A1）。**

### 4.2 `invokeBridge` 的失败模式（`:86-94`）——三种，全部有测试

| # | 触发 | 行为 | 测试 |
|---|---|---|---|
| 1 | `resolveApi()` 返回 `null` | **本地** reject `context_v2_unavailable`，**一次 IPC 都不发** | `:127-131` |
| 2 | preload 方法 **同步抛** | `try/catch` 转成 rejection（不让同步异常逃逸出 promise 契约） | `:179-189`（正好用 `listSpaces` 举例） |
| 3 | preload 返回的 promise reject | **原样透传，不吞、不重包** | `:162-177` |

**模式 3 是 Q4 收端可判别性的物理基础**——facade 不吞码，所以 E-0039 的判别结构在我这层不会被削掉。

### 4.3 一条需要登记的结构事实：**全有或全无的可用性探针**

```
:59-67  resolveApi()  → 对 18 个方法逐个 typeof 检查，缺任何一个即返回 null
```

**后果**：一个缺任意方法的 preload（例如版本不匹配）会让 **整个 facade 不可用**，包括 `getTree`。这是刻意的 fail-closed（`:97` 注释「a stale preload (pre-schema-v4) must not look usable」，测试 `:93-99` 与 `:155-160`），**但代价是 `isAvailable()` 是一个粗粒度信号，说不出「哪个能力缺了」**。

新增第 5 个消费者 **继承** 这个性质，**不加重也不减轻**。登记是因为它是「第三态为什么必然存在」的结构性原因之一，方案庭审设计判态时会用到。

### 4.4 无第二个 facade（E-0034）

`grep -ln "context_v2|contextV2|memory_v2|memoryV2" src/SERVICEs/api*.js` → **零命中**。**`api.unchain.js` 不在本案链路上。** renderer 侧 V2 读平面 = 这一个 125 行模块。登记以免有人去 `api.*` 找第二条路。

### 4.5 Q1 直接回答

> **新增 Inspector 作为第五个消费者，在我边界内有无结构性障碍？** —— **无。零改动。**
> 需要的三个方法（`listSpaces` / `getTree` / `getStatus`）**今天全在白名单里、全被测试覆盖、全是纯透传**。新增消费者是一次纯加法 import，不动 18 方法锁（`:39-56`）、不动 preload 面、不动 IPC 面。
> **这也正是 S-0003 对 `expert-security` 不传唤判定继续成立的条件**（A2）：本案不增删改任何 bridge 面。**一旦方案要求新增 facade 方法，该判定即须重判。**

---

## 五 · Q2（G1）· 强制表态 —— 四态判定落我边界内是否成立

### 5.1 直接回答：**成立。我认领。** 但附 P1/P2/P3 三个前置，缺一我不接

**为什么成立——三条，按强度排序：**

**(a) 它字面就是我 charter 的定义：多方消费、单点定义。** 今天的消费方已经跨三个 owner：`chat-bubble` 三个文件、`chat-core` 一处（`use_chat_stream.js:3920,4013`）、`memory-inspect` 一处（settings 点名的第 4 份，V1 口味）。**本案要造第 5 份，且是第一份需要同时讲两种语义的。** 五个消费者三个 owner 一份定义——**这就是公共动脉的形状，不是我在扩权。**

**(b) 物理上它必须紧挨 `parseContextV2ErrorCode`。** 该映射的 **唯一** 输入是码 token，而码 token 的抽取规则（`ERROR_CODE_TOKEN_PATTERN`，`:57`）在我这里。把映射放到别处 = 在两个 owner 手上各留一份对码词汇表的理解 = **facade 头 `:6-9` 明令禁止的「第二份漂移拷贝」**。这不是偏好，是那段注释的直接推论。

**(c) 我已经在为它的失真面负责了。** A4 描述的 `null → || 默认码` 静默错归因，今天是三个消费者各自踩的坑；**它的根因在我这层的返回契约（`null` 与「有码」同型）**。要么我改契约，要么我提供一个不让人踩的映射函数。**后者更便宜，而且它就是那个无主构件。**

### 5.2 代价（我如实报，不美化）

1. **新建一个模块 + 测试**，落 `src/SERVICEs/bridges/`（例如 `context_v2_state.js`），**不写进 `context_v2_bridge.js` 本体**——否则 `:39-56` 那条「adds nothing of its own」的测试就变成一句假话，而那条测试是本案 `expert-security` 不到场的依据之一（A2）。这部分代价小。
2. **真正的代价是迁移 4 份既有实现**：3 份在 `code-owner-chat-bubble`，1 份在 `code-owner-settings`。**我能定义，不能单方面迁。** 这是一次 Full track 跨 owner 改动，两个 owner 必须同案到场。**若只落定义不做迁移，结果是 5 份变 6 份**——比不做还坏。**所以「落我这里」与「迁移四份」是一个包，不能拆。**
3. **长期负债我知情接受**：我会成为每一个新 V2 码的收敛点。**今天 sidecar 侧 42 个、主进程侧 5 个，产端还在长**（E-0037）。我接这个负债，但它必须以 P1 为条件。

### 5.3 三个前置条件（缺一我不接，并指名替代 owner）

**P1 · 判据（码词汇表）的权威留在产端。** 我做的是「码 → 用户可见状态」的映射；**我不决定有哪些码、每个码在源头意味着什么**。码归 `code-owner-runtime`（42 个），线格式与 5 个主进程自造码归 `code-owner-electron`。**若有人要把「码的语义权威」也塞给我，我拒绝**——那是在 renderer 重新推导 sidecar 的规则，正是 `:6-9` 点名的反模式。

**P2 · 映射必须 fail-closed，未知一律落第三态，永不落「空」、永不落「就绪」。** 这一条我 **必须挑明它是一处存续分歧，不是已了结的事项**：**在 `0000-0003-2026-0807#S-0024` D6 ② 上，我与 `expert-security` 就 P0 不变量有过分歧，该案 `awaiting-ruling`，分歧未决。** 我在本案 **不改变立场**：fail-closed-to-unknown 是这个映射的 P0 不变量。**若裁定要求 fail-open（例如为了界面更顺，把未知当作「空」），我不承接这个模块**——因为那时它是一个「被设计成会撒谎」的构件，而我要长期为它的每一个新码负责。**这不是技术不可行，是我不接这个 owner 身份。** 请 `chief-judge` 显式回应，**不要让它默认继承前案的未决状态**。

**P3 · 主进程半边先定：`memoryV2Readiness` 暴不暴露。** `code-owner-runtime` 已查明 main 里存在一个半成品单一状态源 `memoryV2Readiness`（`service.js:1068`，形状 `{status, reason, sidecarFingerprint}`，由 `verifyContextV2Readiness` 与 `getContextV2Status` 两处写入，我在 `:1874-1878` 与 `:1969-1973` 复核到），**且它没有以该名字暴露给 renderer**。**若它日后被暴露，我的模块一夜之间变成第二个权威。** 所以：要么 `code-owner-electron` 暴露它、我的模块消费它；要么裁定明示它不暴露、我的模块是唯一权威。**在这两者之间造模块 = 掷硬币赌它会不会变成第 6 份拷贝。**（请求 2(c)）

### 5.4 若 P1~P3 不满足，谁该拿 —— 我指名 `code-owner-electron`

理由是它已经握着三样我没有的东西：**既有的 `memoryV2Readiness`**、**码的铸造权**（`createContextV2Error`）、**线格式**（`` `[${code}] ${message}` ``），而且它已经在把传输失败归一到一个稳定小集合（`:1914-1922`、`:1931-1939`）。**一个主进程侧的单一状态比 renderer 侧的派生更权威。**

**代价对比，我如实给两边**：

| | 落我（renderer 派生） | 落 electron（main 单一状态） |
|---|---|---|
| 权威性 | 派生的，可能与 main 的既有状态冲突 | **权威的，与 `memoryV2Readiness` 同源** |
| 新增暴露面 | **零**（不加方法，A2 成立） | 需新增 IPC / bridge 面 → **触发 `expert-security` 触发条件，本案 quorum 须扩** |
| 迁移成本 | 4 份拷贝，跨 3 owner | 同样 4 份，且还要跨进程边界 |
| 谁为新码负责 | 我 | electron + runtime |

**我不主张哪一个更好——落位是 `expert-architecture` 的判断，我两个都实现得了。** 我主张的只有一条：

> **我不接受「五份拷贝」这个空选项。** 若方案庭审开庭时该构件仍无 owner，我与 `code-owner-settings` 的立场一致：**届时构成阻塞。** 现在写下来是为了它届时不算意外。

### 5.5 G1 是否构成进入方案庭审的前置阻塞 —— **不构成**

我这一节全部结论是当前 revision 上的代码形状与一次本地正则实测，**在 16 项强制回应的任何组合下都不变**。**唯一的例外是 P2**：它 **正是** 前案 D6 ② 那条未决分歧的延续，前案对它的裁定会直接决定我接不接。**但那影响的是 owner 归属，不是可行性。**

---

## 六 · 丙（框定第三条）· 可证伪形式 —— 我的「可行」在什么条件下翻成「不可行」

**任一条成立即翻，请本庭逐条登记为方案庭审的检查点：**

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **D-F1** | 裁定要求「未启用」必须由 **一次调用的载荷字段** 读出（不许用拒绝码、不许跨调用 join） | **不可行**。我这层传输的是码，不是字段；载荷判别位要 sidecar 新增，而 runtime 已把它标为 Q0 子问题并预先不主张现在做 | `chief-judge` 裁定 + `code-owner-runtime` |
| **D-F2** | 要求在 `context_v2_bridge.js` 里加校验 / 载荷归一 / 缓存 / 重试 / 去重 | **我判结构上不可接受**，以 `OBJECTION` 反对。违反 `:6-9` 契约与 `:39-56`、`:74-90` 两条测试；造第二份漂移规则 | 方案庭审 |
| **D-F3** | `code-owner-electron` 或 `code-owner-runtime` 表示 `` `[${code}] ` `` 线格式会变，或码字符集会突破 `[a-z0-9_]`（引入连字符 / 大写 / 点） | **乙 的保真结论翻转**。全部消费者经 `\|\| 默认码` **静默错归因**（A4）。Q4 收端在解析修好之前不可判别 | electron / runtime（请求 2(b)、3） |
| **D-F4** | 裁定把 `context_v2_unavailable` 的双重语义（我的「bridge 缺席」× sidecar 的「storage 未配置」）定为 **必须可区分**，且要求在我这层解决 | **不是不可行，但从「零改动」升级为跨 owner 破坏性改动**：给我的自造码改名会破坏 `memory_v2_journal_reload.js:274` 与 `memory_v2_pending_reviews.js:176-190` 的码处理，**`code-owner-chat-bubble` 须同案到场** | 本庭 + chat-bubble |
| **D-F5** | P2 被裁定为 fail-open（未知态可以呈现为「空」或「就绪」） | **可行性不变，owner 变**：我不承接该映射模块，指名 `code-owner-electron`。**这是我与 `expert-security` 在 `0000-0003-2026-0807#S-0024` D6 ② 上未决分歧的延续，我不回避也不撤回** | `chief-judge` 对前案 D6 ② 的回应 |
| **D-F6** | tree view 被挂进 Inspector 现有 5s 静默轮询，且无 in-flight guard、静默轮次失败仍被吞 | **我判结构上不可接受**（A5）。facade 无去重（`:24-25` 明写不缓存），2 次 IPC/tick × 每个打开的 modal；叠加 settings E-0021 的静默吞错，**我这层的失败对用户与日志同时不可见** | 方案庭审 |
| **D-F7** | 方案要求我对 **正常态**（有数据时）的载荷体积 / 序列化开销 / IPC 单帧上限给出承诺 | **我给不出**（G2）。需要一条造数据的路径（fixture 或真机灌数），否则验收标准里不得出现我这层的正常态性能条款 | 全体（G2 共有缺口） |

**同时登记「不会被推翻的」**（可作方案庭审的地基）：facade 三个方法今天全在且全被测试覆盖；不吞码（`:162-177`）；同步抛转拒绝（`:179-189`）；payload 逐字节透传；`api.*` 面零 V2 触点；`getTree` resolve ⟺ 读真的发生了（主进程无合成负值分支）。

---

## 七 · 附带 —— `src/locales/**` 边界的事实登记（不设计文案）

按要求 **只登记事实**：

1. **`memory_inspect` 是 `en.json` 的 *顶层* 命名空间，含 13 个键**（不是 12——`code-owner-settings` 第五节记为 12，**差一个**）。键集：`chunk_detail` · `empty_profile` · `jitter` · `load_failed` · `loading` · `no_conversation_text` · `no_vectors` · `no_vectors_chat` · `profile` · `profiles` · `title` · `title_long_term` · `vs`（E-0041）。
2. **11 个 locale 全部 13 键，键集完全对等**——零缺失、零孤儿（E-0041 逐 locale 比对）。
3. **没有任何自动化测试守护这个命名空间的对等性。** 我边界内的 `src/SERVICEs/boot_locale_parity.test.js` **只覆盖 `boot.*`**（其五个 test 全部围绕 boot 键，E-0041）。**`memory_inspect` 的漂移今天只能靠 `i18n-coverage` skill 人工发现。**
4. **文案增量的量级、措辞、四态 × 两 view 的键结构——全部属方案庭审，我此处不主张。**

**一条边界自愈信号（附带，与 E-0002 相关）**：`summon.py` 把 `pupu:src/COMPONENTs/` 报为「未命中任何路径 owner」。**我的残余条款（`pupu:src/**` 中未被任何 owner 划走的部分）*不* 吸收它，也不应该吸收它**——`src/COMPONENTs/` 是一个跨 5+ owner 的目录 **前缀**，不是一个文件。残余条款的对象是文件，把一个多 owner 前缀塞进残余会把我变成事实上的全仓 owner，正是我 charter 明令要防的「默默收编」。**我支持 speaker 在 S-0003 第二节末提出的处置方向（收窄成可判定命题后再匹配），并确认它不该由残余条款兜底。** 交 `codex` 与 `chief-judge`。

---

## 八 · 留待方案庭审（自行标注，本阶段不作为结论）

- **`context_v2_unavailable` 改名的具体方案**（我的自造码换成例如 `context_v2_bridge_absent`）——技术上是我这层一行改动，但破坏面在 chat-bubble，属跨 owner 取舍，见 D-F4。
- **四态映射模块的 API 形状**（返回枚举 / 返回 `{state, code, retryable}` / 是否携带 `retryable` 位——注意 sidecar 的 `context_v2_unavailable` 带 `retryable: true` 而我的自造码不带，这个位今天在穿过 IPC 时 **是丢失的**，因为只有码进了消息 token）。
- **`getStatus` 是否作为 Inspector 的第三次调用**（E-0039 已证明它非必需，但它能进一步细分第三态）——这是「用户面要不要区分『sidecar 没起来』与『store 关着』」的产品取舍。

---

## 九 · 本 ASSESSMENT 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**，与 E-0001 一致。全部只读，未改任何文件、未 commit、未起 sidecar、未跑应用。

#### S-0012 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: 第 2 批交付后，本庭登记四项：**(一)** 一处 **三名 owner 各持不同答案** 的核心分歧，本庭 **原样保留，明确不压平**；**(二)** 一名 `Code Owner` 请求把其 **预先反对** 记入强制回应清单 —— 本庭 **既不静默升格也不静默丢弃**，按规则处置并交 `chief-judge`；**(三)** 三条新的 **须查类** 证据已强制路由 `evidence-examiner`；**(四)** 本庭 E-0001 的完整性限制已由第三方重测，结论更新
- **依据**: S-0005, S-0010, S-0011, E-0020, E-0025, E-0033, E-0038, E-0039
- **不确定性**: 分歧(一)的三方各自都 **明确标注了自己那一半是推断而非观察**，且三方推断链在同一处交汇于 G8（`store_owner=unchain` 分支无人实跑）。**本庭不判断谁对**
- **请求/下一步**: 第 3~5 批出庭角色引用 Q4 / F2 时，**须指明自己采信三条路径中的哪一条**，不得笼统称「可判别」
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T18:10:00-07:00
- **影响范围**: Q4 与 F2 的全部下游论证；强制回应清单的构成

  **一 · 核心分歧 D-A：「Inspector 靠什么判断 V2 未启用」—— 三名 owner，三个不同答案（原样保留）**

  | 主张方 | 判据 | 核心论据 | 自陈的弱点 |
  |---|---|---|---|
  | `code-owner-settings`（S-0005） | **只能靠 `contextV2Bridge.getStatus()`** | 它是 renderer 今天唯一不靠猜的启用态信号；`enable_memory_v2` 是 renderer UI gate，**与服务端 `store_owner` 可以不一致**，用它冒充就是再造假状态源（N2） | 其 F2 自陈为「**唯一没有绕行方案**」的一条 |
  | `code-owner-electron`（S-0010 丁） | **应改用 `unchainAPI.getStatus().memoryV2`** | **在出厂默认态下 `contextV2Bridge.getStatus()` 是 reject 不是 resolve** —— 8 字段 allowlist 在最需要它的那一态 **一次也不会被构造出来**；且唯一会 resolve 出「像未启用」的那一支 **把「配置为关」与「sidecar 没起来」混为一谈**。而 `memoryV2` 是 **四值闭集枚举 + 16 值闭集 reason**、纯主进程本地读、**永不 reject**，且 **今天就已跨过 IPC 线**（E-0025），卡点在 `normalizeUnchainStatus`（shared-arteries 边界，约 6 行） | 「shipped 下 getStatus 会 reject」是静态控制流阅读 × `code-owner-runtime` 的须查类 E-0010，**两个都不是产品运行观察** |
  | `code-owner-shared-arteries`（S-0011） | **`getTree` 单独一次调用就够** | resolve ⟺ 读真的发生了；reject ⟹ 没发生且码说明原因（E-0039）。故 **即使 `getStatus` 被禁，Q4 的可判别性依然成立**，成本是判态逻辑从「读字段」变成「读 `getTree` 自身的拒绝码」 | 其保真结论建在两条 **未获承诺** 的假设上：`` `[${code}] ${message}` `` 线格式、码字符集恒为 `[a-z0-9_]`（已分别请 electron / runtime 确认） |

  **本庭的处置**：**三条并列入卷，不合并、不排序、不推荐。** 三者 **不是同一命题的三种说法** —— 它们对「谁是权威状态源」给出实质不同的答案，而这正是前案 `0000-0003-2026-0807#S-0014` D7 所指那个构件的归属问题。**本案因此没有把 D7 解开，而是把它具体化到了可指派的粒度。**

  **两处共同点值得单列**（三方独立同向，非本庭综合）：
  - **`code-owner-electron` 与 `code-owner-shared-arteries` 分别以不同证据，各自独立地部分证伪了 `code-owner-settings` 的 F2「唯一无绕行方案」定性。** 二者给出的绕行方案 **互不相同**
  - 三方均未主张用 `enable_memory_v2` 判态；`code-owner-settings` 的 N2 在这一点上 **未被任何一方反对**

  **二 · `code-owner-electron` 的预先反对 —— 本庭按规则处置，不代为升格**

  该角色在 S-0010 Q2(2) 提出并 **请求本庭记入强制回应清单**：

  > 反对任何「在 `contextV2Bridge.getStatus()` 上增加字段以表达未启用/有无数据」的方案。理由不是 count-free，而是 **同样的信息在 `getMisoStatusPayload().memoryV2` 里已经有了且形式更好**；在一个零参数、count-free、已锁契约的安全面上加字段去表达隔壁已算好的状态，是 **制造第二个权威 —— 正是 D7 想避免的那件事本身**。

  **本庭的处置，及其规则依据**：[闭庭门禁第 8 项](../../../codex/lifecycle/speech-protocol.md) 只把 **`Expert` 的「不成立」** 与 **`Dimension Owner` 的「反对」** 列为自动进入强制回应清单的两类。**`Code Owner` 的反对不在其中。** 本庭 **无权自行扩张该清单** —— 那等于替 `chief-judge` 决定他必须回应什么。

  故本庭作如下处置，三条同时成立：
  1. 该反对 **原样进入 `SUMMARY` 的「分歧」栏**，具名、具编号、附完整理由
  2. **本庭在 `SUMMARY` 中显式向 `chief-judge` 转达该角色「请求记入强制回应清单」这一请求本身**，由其决定是否采纳 —— **不代其决定，也不因规则未覆盖而使该请求消失**
  3. 本庭 **同时登记一条规则观察**，交 `codex`：**本案是「`Code Owner` 提出了一条其本人认为需要显式回应的结构性反对，而规则未给它通道」的第一个实例。** 门禁第 8 项的两类是否穷尽，属 `codex` 待处置项。**本庭不在本案内自行补这个洞。**

  **三 · 三条新的须查类证据已强制路由（本庭不持裁量权）**

  | 编号 | 提交方 | 内容 | 特有风险（已写入审查任务书） |
  |---|---|---|---|
  | **E-0024** | `code-owner-electron` | `node -e` 探针：缺参同步抛出；`character_foo__dm__main` 通过校验 | **手抄件非 import 产品模块** —— 手抄与产品源的偏差会直接使结论失真 |
  | **E-0029** | `code-owner-electron` | 4 个 electron 测试 suite 全绿 | 全 mock、`--env=node`；且本仓铁律明载 **`.js`/`.cjs` 双胞胎是唯一会静默失效的测试形态**，已要求核实双胞胎真的存在且同步 |
  | **E-0036** | `code-owner-shared-arteries` | `node -e` 探针：`parseContextV2ErrorCode` 取回码 | 同为手抄件；且已知存在 **一个无码出口**（`ensureMisoReady`，S-0010 戊(4)(a)），已要求核实该反例是否落在探针覆盖之外 |

  连同已完成的 E-0010 / E-0012，本案 **须查类共 5 条**，闭庭门禁第 10 项须全部有结论。

  **四 · 本庭 E-0001 的完整性限制已被第三方重测（本庭如实更新，不辩解）**

  E-0001 自陈「未检查是否有并发会话在庭审期间改动产品目录 —— 承重复核时须重测」。`code-owner-shared-arteries` **主动执行了该重测**（E-0033）：dirty/untracked 条目 **由 8 个增至 12 个**，新增 4 个全部为 **该 owner 自己的 `.claude/agent-memory/` 与 `0000-0005` 案卷**。

  > **`src/` `electron/` `unchain_runtime/` 三个产品目录仍为零 dirty。** 故 E-0001 的 **承重部分（产品代码锚点与 HEAD 一致）仍然成立**，本案全部 `file:line` 锚点未失效。

  本庭记录该 owner **未被要求即主动复核他人证据** 这一事实。

#### S-0013 | ASSESSMENT | evidence-examiner → E-0024

- **阶段**: 议案庭审
- **结论**: E-0024 **真实**，且其手抄件经机械比对确认与产品源 **零偏差** —— 本条的特殊风险（手抄失真）已排除。但它 **被引用的范围宽于它实际证明的范围**：它证明的是「`requireContextV2OwnerChatId` 这个纯函数对六种缺参输入抛 `context_v2_invalid_request`，且对 `character_foo__dm__main` 返回该串」；它 **没有观察** G5 中「请求不发出」那一半，也 **不足以** 支撑「main 层没有任何机制能挡住冒充」这一层级范围的否定命题。另发现其完整性限制 (1) 所述 **理由与事实不符**。
- **依据**: E-0024
- **不确定性**: 见下「相关性」第 3 点 —— 我为回答可靠性之问所做的补充 grep 恰好佐证了那条宽命题，但该佐证 **是我的调查，不是 E-0024 的内容**，不应被记为本条证据的证明力。
- **请求/下一步**: 提请 `speaker-of-the-house` 注意：E-0024 可采，但引用它时须按下列窄命题计算证明力。若 S-0010 需要「请求不发出」被 **实际观察**，仓内已存在一条严格更忠实且成本极低的路径（见「可靠性」第 3 点），由提出方补强即可，无需新建装置。
- **评估结论**: 已验证
- **证据编号**: E-0024
- **来源类型**: general

- **真实性**: **通过。** 我在 `b2385d5d`（= 当前 HEAD，`git diff b2385d5d -- electron/main/services/unchain/service.js` 为空，工作树对该文件干净）逐字复跑了登记的 `node -e`，**九行输出与登记内容逐条一致**，无一行差异。
  一处 **非实质瑕疵须记录**：登记块标题为「**实际输出**」，但其中的列对齐空格是提交方后加的排版，命令本身不产生（实跑为 `undefined -> THROW ...`，登记为 `undefined                   -> THROW ...`）。内容零差异，属美化而非篡改，不影响可采性；但「实际输出」应为逐字粘贴。

- **可靠性**: **手抄保真度：通过，且经机械独立确认。**
  1. **正则逐字比对**：产品源 `service.js:120` 的字面量与探针 `OWNER` 经 shasum 比对 **byte-exact 相同**（`c987b427…`）。
  2. **两个函数的等价性**：`read` 与 `:195-196` 的 `readContextV2String` 语义相同；`req` 抛出的错误对象与产品 `contextV2InvalidRequest("ownerChatId")`（经 `:186-193` 的 `createContextV2Error`）在 `.message` / `.code` / `.name` 三项上 **全等**（实测）。正则无 `g` 标志，`.test()` 无跨调用状态，不存在手抄引入的隐性差异。
  3. **不依赖手抄的独立复核**：我用 `fs.readFileSync` 把产品源 **第 118–204 行原始字节** 机械抽出并 `new Function` 求值（无任何人工转录），对同一组九个输入复跑，**输出与探针逐行相同**。手抄未引入任何偏差。
  4. **关于「手抄替代 import 是否降级」**：**结论上不降级**（等价性已由上述 1–3 排除），但 **该证据弱于本可达到的强度**，且其完整性限制 (1) 的 **理由陈述不准确**：
     - 原文称「`service.js` 是一个需要 `electron` 的工厂，无法在 node 裸环境实例化」。实测 **该模块在裸 node 下 `require` 完全成功**，导出 `createNodeStreamFetch` 与 `createUnchainService`。
     - 真实障碍是另外两条：(a) `CONTEXT_V2_OWNER_ID_PATTERN` 与 `requireContextV2OwnerChatId` **是模块私有、未出现在 `:5922` 的 `module.exports` 中**，无法直接 import；(b) 裸调 `createUnchainService()` 失败于 `Cannot destructure property 'app' of 'undefined'`。**结论（拿不到该函数）成立，理由（模块 import 不了）不成立。**
     - **仓内已存在更忠实的路径**：`/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:3` 直接 `require` 真实 `createUnchainService`，在 mock 装置下跑 **真模块**，且其断言形态同时覆盖了探针够不到的那一半 —— 该文件在 `:287` 与 `:1430` 有 `expect(fetchImpl).not.toHaveBeenCalled()`，在 `:469` 有 `expect(fetchImpl.mock.calls.length).toBe(callsAfterStart)`。即「抛出」与「请求不发出」在该路径下 **均为直接观察**。
- **来源归类**: **内部来源** —— 被测代码与复核脚本均在 PuPu 仓内，脚本由提出方 `code-owner-electron` 自撰。非外部来源，不适用权威性判断；其可信度完全来自可复跑性，而可复跑性已由我独立验证。

- **相关性**: **部分支持，须按窄命题计算。**
  1. **对 G5 —— 支持前半，未观察后半。** 六种缺参输入（`undefined` / `null` / `""` / `"   "` / `123` / `{}`）全部抛出且 `code=context_v2_invalid_request`，**这一半由本条实测直接支持**。但：
     - **「请求不发出」本条未观察。** 探针是一个孤立纯函数，全程 **未触及** `contextV2Request`、未触及任何 fetch。该半命题只能由 **call site 的静态阅读** 支撑（我核对了全部 17 处调用，`requireContextV2OwnerChatId` 均为方法体首条语句、位于 `contextV2Request` 之前，如 `:2089-2091`、`:2108-2112`），而静态阅读属 E-0025/E-0026 的证据形态，不是 E-0024 的产出。
     - **「同步抛出」在 API 边界上表述不精确。** 全部 17 处调用均位于 `async` 方法内（`deleteContextV2Chat` `:2089`、`getContextV2Tree` `:2108`、`listContextV2Entries` `:2118` 等），因此 **外部调用方观察到的是 rejected promise，而非同步 throw** —— 本仓自有测试正是以 `.rejects.toThrow(/context_v2_invalid_request/)` 断言的。函数 **内部** 确为同步抛出（本条属实），但这与「服务方法同步抛出」不是同一命题。
  2. **对 F3 / 关键事实 —— 完全支持。** `"character_foo__dm__main"` 通过校验并原样返回，`"character_foo__dm__main "` 经 trim 后同样通过。这正是 `code-owner-settings` F3 所需的那条事实，**本条独立、充分地支撑它**。
  3. **对「main 层没有任何机制能挡住冒充」—— 不足以支撑。** 这是一条对 **整个 main 层** 的否定存在命题；单函数探针在逻辑上无法证明一个层内不存在其它机制，最多证明「**这一个** 校验器不拦它」。本条支持的是后者。
     （补充调查，**记为我的调查而非本条证明力**：我对 `register_handlers.js` 与 `service.js` grep `ownerChatId` 及 owner 相关的 verify/authoriz/belongs/match/impersonat 模式，**未发现任何额外的归属交叉校验**。这与那条宽命题一致，但若该命题要承重，应由其提出方以独立证据登记。）

#### S-0014 | ASSESSMENT | evidence-examiner → E-0036

- **阶段**: 议案庭审
- **结论**: E-0036 **逐字复跑成功，输出与登记完全一致**（exit 0）。本庭最担心的 E-0024 同类风险 **未发生** —— 手抄正则与产品源 `context_v2_bridge.js:57` **经机器比对逐字节全等**（`/\[([a-z0-9_]+)\]\s/`，无 flag，且为该文件内唯一正则字面量）。**但其证明力严格窄于「错误码端到端不丢」**：该探针实测的是 **条件保真**（*若* 消息带良构 `[code] ` 令牌，*则* 码能取回），**未触及也不可能触及前件**（getTree 路径上每一次 reject 是否都带该令牌）。`S-0010` 戊(4)(a) 的无码出口 **经我独立核实为真，且完全落在本探针取样之外** —— 探针 15 个样本 **全部由 `wrap()` 构造，即每一个输入都已自带方括号令牌**，它在设计上无法证伪自己。证据可采，作用域须按下文重述。
- **依据**: E-0036
- **不确定性**:
  1. 假设 (b)「码字符集恒为 `[a-z0-9_]`」**本探针零覆盖** —— 它把该字符集当作前提写进正则，再用满足该前提的样本喂它，**对字符集本身不构成任何检验**。该命题的证据在 E-0037（42 个码，自陈为下界），归 `code-owner-runtime` 确认。
  2. 假设 (a)「`` `[${code}] ${message}` `` 线格式」我已在 `service.js:186-190` 独立读到并确认 `createContextV2Error` 确实如此构造。**但这只覆盖经该构造器产出的错误**，不覆盖绕过它的抛出点 —— 而反例恰好是这一类。故 **(a) 即使被 `code-owner-electron` 确认为稳定契约，也不能封上第 3 点的缺口**。
  3. 该正则 **无锚定且取首个匹配**：我实测 `"…method [foo] bar: Error: [context_v2_store_disabled] x"` → `"foo"`（真码被前面的令牌遮蔽）。真实 Electron 装饰串 `Error invoking remote method 'context-v2:get-tree': Error: ` 不含方括号，故 **该遮蔽在已观察形状上不发生**；登记项限制 (3)「前缀变化不影响」在 *不引入方括号* 的前提下成立，此前提未被登记。
  4. 探针未起 Electron、未观察真实 IPC 消息 —— 此点登记项限制 (1) **已如实自陈**，我确认该自陈准确。
- **请求/下一步**: 交 `speaker-of-the-house`。三点建议：**(1)** 本条采纳应绑定「条件保真」措辞，凡引用它作 **无条件** 的「码端到端不丢」者，须标注超出本条作用域；**(2)** 提交方已发出的两项确认请求（`code-owner-electron` 管 (a)、`code-owner-runtime` 管 (b)）**均不足以把本条升格为端到端结论**，因缺口在覆盖面而非契约稳定性 —— 请勿以该二确认到位为由撤销本条作用域限制；**(3)** 若后续有发言以本条为据主张 `getTree` 单次调用的收端可判别性，该主张的 **无码出口分支** 需另行举证，不在 E-0036 承载范围内。
- **评估结论**: 已验证
- **证据编号**: E-0036
- **来源类型**: general
- **真实性**: **成立。** 按登记的完整命令原样复跑（`node -e`，无改动），exit 0。输出与登记逐项吻合：10 个码 **`true true` 全部 10/10**（直接 wrap 与穿过 ipcMain.handle 装饰两列均真）；漂移样本 `context-v2-store-disabled`→`null`、`CONTEXT_V2_OFF`→`null`、`context.v2.off`→`null`、`v2Disabled`→`null`、`store_disabled_2`→`"store_disabled_2"`；`"[context_v2_store_disabled]"` 无尾随字符→`null`。**无一处出入，无篡改迹象。** 探针纯字符串运算、无文件读写无网络，故不受观察时点漂移影响。
- **可靠性**: **内部来源，手抄保真度经机器核验为满分，但仍存一处结构性替代。** 逐字比对结果：产品 `src/SERVICEs/bridges/context_v2_bridge.js:57` 的 `ERROR_CODE_TOKEN_PATTERN` 与探针 `P` **字节全等**，且该文件仅此一个正则字面量，无「抄错了另一处实现」的空间 —— **E-0024 式偏差在本条未出现**。**降级点**：探针的 `parse` 收 **裸字符串**，产品 `parseContextV2ErrorCode`（`:77-82`）收 **Error 对象** 并先做 `typeof error.message === "string"` 守卫、否则退化为 `""`。**该守卫被探针整段跳过。** 我已独立补测：`null` / `{}` / `{message:42}` 三输入下产品语义均得 `null`，与探针不产生分歧，**故此替代对本条结论非实质性**。另需记明：该模块为 CRA 源树下的 ESM `export const`，`node -e` 直接 import 存在真实工程障碍，**手抄是可理解的取舍而非疏失**；但代价是探针与产品之间 **无编译期链接** —— 今日的全等由我核验提供，**不由探针自身保证**，`:57` 一旦改动，本探针不会失败。
- **相关性**: **对 A4 完全支持；对回答乙仅支持其条件形式；对「端到端不丢」不支持。** 逐条：**(1) 支持 A4（漂移码落 `null`）—— 完全成立且工具选择正确**，因「漂移形状是否被拒」纯属正则自身性质，无需任何外部契约假设，探针是恰当且充分的仪器。**(2) 支持回答乙（码原样到达含 IPC 装饰）—— 只到条件形式。** 输入串由探针 `wrap()`/`ipc()` **自行合成**，其形状取自提交方 **自陈未获承诺** 的两条假设；`ipc()` 一列因正则无锚定而近乎恒真（见不确定性 3），信息量低于其表面。**(3) 「已知码能被解析」不等同于「错误码端到端不丢」** —— 前者是后者的必要不充分条件。本探针证明的是「令牌若在，码可取回」，端到端命题还需「令牌恒在」，而后者 **不在探针射程内**。**(4) `S-0010` 戊(4)(a) 的反例经核实为真，且确在本探针覆盖之外：** `contextV2Request` 的 **第一行**（`service.js:1893`）即 `ensureMisoReady()`，位于就绪门之前；`getContextV2Tree`（`:2108`）全程经 `contextV2Request`；`ensureMisoReady`（`:1666-1674`）抛 `` new Error(`Miso service is not ready (status=…)`) ``，**无 `[code] ` 前缀、无 `.code`**。我按该构造实测四种 status 变体，**产品解析语义下全部得 `null`，穿过 IPC 装饰后仍为 `null`**。而探针 15 个样本 **无一为「整体缺失令牌」形状**（含 `"[code]"` 那例也仍带方括号），**该反例在取样上被结构性排除**。**结论：证据本身未过度声称** —— 登记项限制 (1) 已准确划出「测的是正则不是链路」，故报 **已验证**；但采纳时其作用域须为「条件保真 + 漂移拒斥」，**不得读作端到端保真**。
- **来源归类**: **内部来源。** 提交方 `code-owner-shared-arteries` 自撰探针，运行于本机，结论指向其自有边界内的模块（`src/SERVICEs/bridges/` 落其所有权），**非独立第三方**。所比对的产品源 `context_v2_bridge.js` 亦在其边界内；而作为其成立前提的 `service.js`（`code-owner-electron`）与码字符集（`code-owner-runtime`）**均在其边界之外**，此二者提交方 **已如实标注为待确认**。

#### S-0015 | ASSESSMENT | evidence-examiner → E-0029
- **阶段**: 议案庭审
- **结论**: E-0029 的承重内容 —— **主树 4 个相关 electron suite 全绿** —— 经独立复跑成立。登记的聚合数字 `6 passed / 81 total` 可逐字重现，但 **其构成与提交方自陈的完整性限制 (2) 相矛盾**：6 个 suite 中有 2 个（12 个 test）来自陈旧 worktree `.worktrees/pr-182-review`，而提交方声称"第二次已收窄到主树"。真实的主树数字是 **4 suites / 69 tests**。该瑕疵不触及承重部分，但登记须更正。此外，本庭点名核查的 **`.js` / `.cjs` 双胞胎**，实测形态与铁律预设的失效模式不同（见 **可靠性**），须向本庭澄清。
- **依据**: E-0029
- **不确定性**:
  1. 我只复跑了 E-0029 登记的 4 个 suite，**未跑** `memory_v2_startup_readiness` / `memory_v2_rollout`（提交方在 E-0029 完整性限制 (3) 中已自陈未跑，E-0030 的断言至今未经实跑佐证）——该缺口原样保留。
  2. 单次时点观察（2026-08-08，HEAD `b2385d5d`）。庭审期间若有并发会话改动 `electron/`，本结论不自动延续。
  3. 我未追查 `.worktrees/pr-182-review` 内那 2 个 suite 的内容与主树版本是否一致；其绿与否与本案无关，不予采信，仅记录其污染了聚合计数。
- **请求/下一步**:
  1. 请 `Speaker of the House` 要求提交方 **更正 E-0029 的「实际输出」与「完整性限制 (2)」**：主树实测为 `Test Suites: 4 passed, 4 total / Tests: 69 passed, 69 total`；已登记的 `6 / 81` 含 2 个 worktree suite。可复跑的收窄命令（我实跑通过，只读）：
     ```bash
     npm run test:electron -- --testPathPattern="^/Users/red/Desktop/GITRepo/PuPu/electron/tests/.*(context_v2_service|context_v2_bridge|ipc_channels|api_contract)"
     ```
     根因：忽略正则 `/worktrees/` 命中 `.claude/worktrees/`（9 棵，已正确排除），但 **不命中 `.worktrees/`**（前导点使 `/worktrees/` 不成为子串）。本仓有两个 worktree 根，只排除了一个。
  2. 若本案后续仍以「被双胞胎锁住」作为论证措辞，请要求提交方按 **可靠性** 段的实测形态改写 —— 该措辞所暗示的双重执行路径不存在。
  3. 本条不足以单独承载「新增 renderer 消费者时 electron 边界内 0 处必须改动」，理由见 **相关性**。是否有其他证据补足，不归我判断。
- **评估结论**: 已验证
- **证据编号**: E-0029
- **来源类型**: general
- **真实性**: **已复跑，承重内容为真。**
  - 锚点核对：`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`，与登记一致。
  - **命令合法性（本庭点名事项）**：登记命令 `npm run test:electron` **是本仓正确的跑法**，不违反工程铁律。铁律禁止的是对 **前端** 套件直接 `npx jest`（前端走 `react-scripts test`）；`electron/` 有自己的 npm script（`package.json:74`：`node node_modules/.bin/jest --env=node --runInBand --silent --moduleFileExtensions js --moduleFileExtensions cjs --moduleFileExtensions json --testMatch="**/electron/tests/**/*.test.cjs"`），且 CI 调用的正是它（`.github/workflows/release-qa.yml:99` = `npm run test:electron`）。
  - **逐字复跑**：原命令原样重跑，输出 `Test Suites: 6 passed, 6 total` / `Tests: 81 passed, 81 total` —— 与登记 **完全一致**，无篡改迹象。
  - **构成不符（登记瑕疵）**：6 个 suite 的实际清单为主树 4 个 + `.worktrees/pr-182-review/electron/tests/preload/api_contract.test.cjs` + `.worktrees/pr-182-review/electron/tests/main/ipc_channels.test.cjs`。提交方在完整性限制 (2) 中写「第二次已收窄到主树」，**该陈述不成立**；同时其自设的"worktree 结果不得引用"规则被自身的聚合数字违反。
  - **承重部分独立确认**：以绝对路径锚定主树重跑，得 `4 passed / 4 total`、`69 passed / 69 total`，**四个 PASS 行逐条为真且无遗漏**（`electron/tests/main/context_v2_service.test.cjs`、`electron/tests/main/ipc_channels.test.cjs`、`electron/tests/preload/api_contract.test.cjs`、`electron/tests/preload/context_v2_bridge.test.cjs`）。
  - **只读确认**：复跑后 `git status --porcelain -- electron src package.json` 输出为空；未产生快照或产物，未 commit。
- **可靠性**: **内部来源，全 mock 契约层单元测试。绿的效力止于契约层。**
  - **全 mock 已核实**（非采信自陈）：`context_v2_service.test.cjs` 中 `app.getAppPath/getPath/getVersion`、`fs.existsSync`、`spawn`/`spawnSync`、`crypto.randomBytes` 全为 `jest.fn`，HTTP 经 `fetchImpl` 替身；`context_v2_bridge.test.cjs:15` 与 `api_contract.test.cjs:13-17` 的 `ipcRenderer.invoke/send/on` 全为 `jest.fn`。配合 `--env=node`：**不启动 Electron、不发真实 IPC、不作真实 HTTP 往返**。提交方的完整性限制 (1) 在此点上准确。
  - **能支撑到什么程度**：仅 **名字绑定与参数整形三件事** —— (a) main 按契约拼 URL（实测断言：`/context/v2/memory/spaces?owner_chat_id=chat-1` 与 `/context/v2/memory/spaces/space-1/tree?owner_chat_id=chat-1`，`context_v2_service.test.cjs:500-514`）；(b) channel↔主进程方法名不漂移（`ipc_channels.test.cjs:366-367`）；(c) preload 按 allowlist 转发到专属 channel（`context_v2_bridge.test.cjs:217-218`、`api_contract.test.cjs:254-264`）。**不支撑** 真实往返、真实载荷大小、时序、并发或性能的任何结论。
  - **`.js`/`.cjs` 双胞胎核实（本庭点名事项）—— 实测形态与铁律预设不同**：
    - 四个双胞胎 **全部存在**：`context_v2_service.test.js`(42B)、`ipc_channels.test.js`(36B)、`api_contract.test.js`(36B)、`context_v2_bridge.test.js`(41B)。
    - 其内容 **不是复制品，而是一行委托 shim**，全文即 `require("./<name>.test.cjs");`。因此铁律警告的「双胞胎内容静默漂移」在这四个文件上 **结构上不可能发生** —— 这比"内容同步"更强，此项本庭关切可解除。
    - **但须报告一项反向发现**：这四个 `.js` 文件 **不被任何已配置的 runner 收集**。`test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`；`react-scripts test` 的 roots 被 CRA 硬编码为 `<rootDir>/src`（`node_modules/react-scripts/scripts/utils/createJestConfig.js:26`），仓内无 `jest.config*`、无 `craco.config*`/`config-overrides*`、`package.json` 无 `jest` 键，CI 亦只调 `npm run test:electron`。故 `.js` 双胞胎为 **惰性文件，零执行**。
    - **净效果**：E-0029 的效力 **不因此削弱**（CI 与本次复跑执行的都是 `.cjs`，锁力真实存在）；但「被双胞胎锁住」这一措辞所暗示的 **双重执行保险并不存在**，实际锁力全部来自单一的 `.cjs`。
  - **归类效力**：由提交方本人发起并登记的自有测试运行，无第三方系统佐证；其可信度来自可复跑性，而复跑已由我完成。
- **相关性**: **对其自身登记的主张相关且成立；对本庭点名的承重用途存在推理跨度。**
  - **直接相关部分成立**：四个 suite 确实逐层断言了本案的 `listSpaces → getTree` 两跳 —— preload 面存在性（`context_v2_bridge.test.cjs:32-33, 100-101`、`api_contract.test.cjs:88-89`）、channel 绑定（`context_v2_bridge.test.cjs:217-218`、`ipc_channels.test.cjs:366-367`）、main 侧 URL 拼装与 owner 作用域（`context_v2_service.test.cjs:22-23, 503-514`）。故 E-0029 自己「支持/反驳」字段所写的 **戊「两跳在单元契约层完整且绿」，成立**。
  - **跨度所在**：这些断言 **全部是对当前参数面的锁定**，不含任何关于"新增消费者所需入参是否落在该面内"的命题。测试绿证明的是 **既有行为未被破坏**，逻辑上不蕴含 **新增消费者无需改动**。
  - **一条直指该跨度的断言**：`api_contract.test.cjs:254-258` 断言 `api.listSpaces({ownerChatId:"chat-1", scope:"user"})` 实际转发出去的是 `{ownerChatId:"chat-1"}` —— preload **主动丢弃 allowlist 之外的入参**。这条同样是"绿"，但它锁住的是 **参数面很窄这一既定行为**：它证明约束存在，不证明约束足够。`getTree` 同理，入参面被锁为 `{ownerChatId, spaceId}` 二者（`:260-264`）。
  - **判断**：E-0029 支撑「两跳在单元契约层完整且绿」为 **相关且充分**；支撑「新增一个 renderer 消费者时 electron 边界内 0 处必须改动」为 **相关但不充分** —— 后者需要一次"新消费者需求 ⊆ 现有参数面"的比对，E-0029 不含该比对。**该不充分性仅为可采性判断，不构成对实体结论的意见**；结论是否另有证据支撑，归 `Speaker of the House` 与 `Chief Judge`。
- **来源归类**: **内部来源** —— PuPu 仓内自有单元测试套件（`electron/tests/`），由提交方 `code-owner-electron` 自行发起运行并登记，非外部权威来源。其证明力依赖可复跑性；本次复跑已由第二方（本 examiner）独立完成，主树部分结果一致。

#### S-0016 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **本庭归档过程中发生一次证据分类错误，本条自陈并更正。** 同时登记：五条须查类证据的强制审查 **全部完成**（闭庭门禁第 10 项已满足），五份审查 **无一条报「未验证」或「相矛盾」，但五份全部收窄了所审证据的作用域**；另登记两条由审查人发现、**与本案实体结论无关但对本仓有独立价值** 的事实
- **依据**: S-0007, S-0008, S-0013, S-0014, S-0015, E-0039
- **不确定性**: 无
- **请求/下一步**: 后续引用五条须查类证据的角色，**须连同其作用域收窄一并引用**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T18:40:00-07:00
- **影响范围**: E-0039 的分类；五条须查类证据的引用方式；本仓测试形态的一条既存事实

  **一 · 本庭的分类错误（自陈，不隐去）**

  本庭把 **E-0039 误标为须查类** 并在其验证历史里写入了「已路由 `evidence-examiner`」的记录 —— **而它从未被路由，也不需要被路由**。

  **成因是机械的，且完全在本庭这一侧**：本庭的归档脚本以「标题串是否含『须查类』」判定证据类型。E-0039 的标题是

  > `### E-0039 | repository | 自证类（**与 code-owner-runtime E-0010 联合，其为须查类**）`

  该括注说的是 **它所联合的那一条（E-0010）是须查类**，不是它自己。**子串匹配读不出这个区别。**

  **更正**：E-0039 为 **自证类**，未被路由，无需路由。其验证历史已就地追加更正记录（追加，不改写原行）。

  **本庭对此的评述（与 A-010 同类，故一并交 `codex`）**：这是本案第二次出现「**判据本身正确，但读取判据的工具太粗**」——[A-010](../../../codex/adaptations.md) 记录的三类静默漏人是同一个病。**本次的方向相反：不是漏，是多。** 若本庭未做逐条复核而直接按脚本结果路由，代价是 **一次无谓的 `evidence-examiner` 派遣**（浪费，但不失真）；真正危险的是相反方向 —— **一条真的须查类证据因标题措辞不含该词而被漏路由，那会直接违反闭庭门禁第 10 项且无人察觉**。本案未发生该情形（五条真须查类均被正确识别），但 **该风险由同一个缺陷承载**。

  **二 · 五条须查类证据审查完毕 —— 无一被推翻，但无一未被收窄**

  | 证据 | 提交方 | 审查结论 | 作用域收窄的要害 |
  |---|---|---|---|
  | E-0010 | runtime | S-0007 **已验证** | **200 空态臂只在 `pupu_legacy` 下取得，而 Electron 从不发出该值**；三态是 **优先级有序** 非正交；503 多路复用 |
  | E-0012 | runtime | S-0008 **已验证** | **引证错配**（`status` 自 503 那条不在本证据五行内，须改引 E-0010）；`vector_status:"disabled"` **只覆盖 `pupu_legacy` 读路径** |
  | E-0024 | electron | S-0013 **已验证** | 只证明 **纯函数** 行为；**「请求不发出」那一半未观察**；**不足以支撑「main 层无任何机制」这一否定存在命题** |
  | E-0029 | electron | S-0015 **已验证（承重部分）** | 登记的 `6/81` **含 2 个陈旧 worktree suite**，真实主树为 `4/69`；支撑「契约层绿」充分，支撑「新增消费者零改动」**不充分** |
  | E-0036 | shared-arteries | S-0014 **已验证** | 只证明 **条件保真**；**探针 15 个样本全部自带令牌，设计上无法证伪自己**；无码出口 **结构性落在取样之外** |

  > **本庭请 `chief-judge` 注意一处模式**：五份审查 **全部** 确认了真实性（复跑逐字一致、手抄件零偏差），**也全部** 判定所审证据 **被引用的范围宽于它实际证明的范围**。这不是五次独立的疏忽 —— 更像是 **「取到一个真结果」与「该结果能支撑多宽的命题」之间的距离，在本案的取证条件下系统性地被低估**。而这个取证条件就是 G8：**没有人能跑真实配置**，于是每个人都在能跑的那条路径上取证，再把结论说到需要的宽度。

  **三 · 两条与实体结论无关、但对本仓有独立价值的发现（一并上呈，不夹带处置意见）**

  1. **`.js` / `.cjs` 双胞胎的实际形态与本仓铁律预设的失效模式不同**（S-0015）。本仓 `CLAUDE.md` 载「Electron 测试有 `.js`/`.cjs` 双胞胎，必须同步 —— 本仓唯一会静默失效的测试形态」。审查人实测：这四个 `.js` **不是复制品，而是一行委托 shim**（全文即 `require("./<name>.test.cjs");`），故 **内容漂移在结构上不可能发生**（比「同步」更强）；**但它们不被任何已配置的 runner 收集** —— `test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`，`react-scripts test` 的 roots 被 CRA 硬编码为 `<rootDir>/src`，仓内无 `jest.config*`，CI 只调 `npm run test:electron`。**净效果：`.js` 双胞胎为惰性文件，零执行；「被双胞胎锁住」所暗示的双重执行保险并不存在。** 锁力真实存在，但全部来自单一 `.cjs`。
  2. **本仓有两个 worktree 根，测试忽略模式只排除了一个**（S-0015）。`/worktrees/` 命中 `.claude/worktrees/`（9 棵）但 **不命中 `.worktrees/`**（前导点使其不成为子串），导致 `.worktrees/pr-182-review` 的陈旧测试被一并计入。

  **本庭不就这两条提出处置**，它们不落在本案待裁问题内。**登记的理由是：它们由本案的证据审查机械产生，若不归档就只存在于一次性的审查报告里。** 是否另立 case 归 `chief-judge`。

#### S-0017 | ASSESSMENT | code-owner-chat-core → case

- **阶段**: 议案庭审

- **结论**: **有条件可行，我边界内的改动是 1 个目录、2 个产品文件、6 处、零测试改动、零跨 owner 协作。** 逐条：**甲 —— C4 承诺今天 *仍然有效，无条件*，`code-owner-settings` 的 F1 不成立**（挂载点能新增 prop，破坏面为零，我今天以完整 grep 爆炸半径 + 54 绿测试基线重新证成，E-0042/E-0049）。**乙 —— character 分支的 `ownerChatId` 就是 `node.chatId`，它存在、就在同一作用域里、今天被丢弃、取得代价为零**；而且我能给出一条本案至今没人举出的 **产端权威依据**：`use_chat_stream.js:6453-6457` 的注释逐字写明 *"owner_chat_id is ALWAYS the UI chat id (targetChatId) — never effectiveThreadId, which becomes the character session_id for character chats"*，写侧已经把这条契约写死在代码里（E-0044）——**读侧只需与写侧同键，不需要任何新判断**。**丙 —— `code-owner-settings` 不确定性 3 我 *确认*，并把它从「强旁证」升级为 *证明*：`node.chatId` 与 `currentChatId` 不是「同一个 id 空间」，是 *同一个值经五段确定性传递*，且两端各有一道 `chatsById` 存在性守卫**（E-0043）。其 Q1 结论前半段不翻转。**丁 —— `getTree: noop` 不是消费者，是 `resolveApi()` 全有或全无探针的产物**（我的 mock 恰好 18 个方法、与 `REQUIRED_METHODS` 逐项对应，E-0046）；**这构成一条落在我边界内、此前无人计价的成本，独立支持 `code-owner-shared-arteries` 的 A2**。**而我端持有的 `activeChatIdRef.current` 对 Inspector *不可复用*，我要主动报一条谁都没说的错主来源，它比 character session id 那条更危险**（E-0045）。**Q2 —— 我承担一半，并提交一条对「单点四态映射」的 *原则性反对意见*（不是拒绝落点，是给落点加一条必过约束）**：chat-core 今天已有一份完整、成文、**蓄意不与他人合并** 的 code→用户可见文案映射（19 码 / 7 文案 / 两张表），其代码注释里逐字写着为什么合并会撒谎（E-0047）。**并报一条硬事实：`context_v2_store_disabled` 在整个 `src/` 下出现 0 次（E-0048）——「未启用」不是 Inspector 词汇表里缺一枝，是整个 renderer 都不知道这个码存在，而在我的表里它落到 FAILED「请重试」，一个重试永远不会改变的条件。** **前案 C3 的越界交出在本案 *仍然成立，但不覆盖本案 Q2*，理由见正文六。**

- **依据**: E-0042, E-0043, E-0044, E-0045, E-0046, E-0047, E-0048, E-0049, E-0003, E-0004, E-0005, E-0016, E-0017, E-0018, E-0024, E-0035, 0000-0003-2026-0807#S-0006, 0000-0003-2026-0807#S-0024

- **不确定性**:

  **一 · 我实跑到哪里为止。** 我 **未启动应用、未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求**。我唯一的运行时观察是 **本仓自己的 jest 套件在未修改工作树上跑了一次**（E-0049，2 suite / 54 test 全绿）。「代码这样写」与「运行起来这样跑」之间那一段我给不出。凡涉及真实进程行为的一律标推断。

  **二 · 我的全部结论 *不依赖* 任何 store owner 取值，因此 R1 对我不适用。** 甲/乙/丙/丁 四问的答案是 renderer 侧的 **值传递与作用域** 事实，在 `off` / `unchain` / `pupu_legacy` 三种配置下 **完全相同**。G8（`unchain` 分支无人实跑）与 G2（`entries=0`）**不削弱我这一节的任何一条**，因为我这一层不发请求、不解析载荷、不判态。**我特意声明这一点，是因为本案迄今最重的证据限制（S-0009）落在服务端，而我不想让它被误读为覆盖全案。**

  **三 · 我不核实 `MemoryInspectModal` 收到新 prop 后会怎样。** 那是 `code-owner-settings` 的边界（E-0015）。我主张的只有「挂载点能把这个值送到 modal 的 props 上，且送出去的代价为零」。**「送进去之后 Inspector 该怎么用」我不主张。**

  **四 · 我未核实 `getSessionHead` / `rebaseSession` 之外的任何 V2 方法的运行时行为。** 我端只调这两个（E-0046），其余 16 个方法我只在 mock 里声明其存在。

  **五 · 一处我给不出答案的：右键菜单打开后、modal 仍开着时，用户切换了活动会话或删除了那个 chat，`ownerChatId` 该不该跟着变。** 今天 `memoryInspect` 是 side-menu 的本地 state，**开的时候快照一次、之后不跟随**（E-0045）。这个语义今天对 V1 `sessionId` 成立，对 V2 `ownerChatId` 是否也该成立，**我倾向「同样快照、不跟随」，但这是一个我边界内的设计取舍，自标为「留待方案庭审」，本阶段不作为结论。**

- **请求/下一步**:

  1. **请本庭直接判定 `code-owner-settings` 的 F1 *不成立*，并把它从其可证伪条件表里落定为已闭合。** 甲的答案是无条件的「仍然有效」，我不附任何条件。**F1 是本案唯一一条 *完全落在我边界内、且我能单方面终结* 的可证伪条件，本轮就该终结它，不必留到方案庭审。**

  2. **请本庭把「右键节点 ≠ 活动会话」（E-0045）记为一条 *新增已知缺口*，并与 G10 并列。** 它与 E-0016 的「character session id 冒充」是 **两条不同的错主路径**，且 **这一条严格更危险**：冒充的那个 id 后端至少可能查无此人（G10 待答），而右键错主给出的是 **一个真实存在的、属于另一个 chat 的、非空的树** —— 在链路上 **结构性不可检测**，`code-owner-electron` 的语法门、`code-owner-runtime` 的 owner-scoping、`code-owner-shared-arteries` 的码解析 **三道全部放行且全部正确**。本案没有任何一份已交付 `ASSESSMENT` 提到它。

  3. **请 `code-owner-settings` 就一件事作答**：其 N1 写「不许在 modal 内部推导 `ownerChatId`」——我完全支持并加强（正文二）。但 N1 只禁了推导，**没有禁「从别处取」**。请其确认 tree view 的 `ownerChatId` **只接受来自 props 的那一个值**，不得从 `chatStore.activeChatId`、不得从任何 context、不得从任何全局取。**这一条不写死，E-0045 那条错主路径会在实施时以「反正拿得到」的形式复活。**

  4. **请 `code-owner-shared-arteries` 知情一条落在我边界内、支持其 A2 的成本**（E-0046）：`REQUIRED_METHODS` 从 18 增到 19 的那一刻，我的 `use_chat_stream.turn_mutation_v2.test.js` 的 18 方法 mock 会让 `resolveApi()` 返回 `null` → `isAvailable()` 为假 → **turn-mutation 测试静默改走 legacy 分支而不是报错**。**这不是「测试会红」，是「测试会绿但测的是另一条路」。** 其 A2「不得新增 facade 方法」在我这里有一个 **具体的、会静默失效的** 代价。

  5. **请 `expert-architecture` 就 Q2 一并考虑我提交的原则性反对**（正文六 6.3）：**同一个码 token 在不同调用语境里意味不同的事**，这是我边界内已经用代码注释写死的判断（E-0047）。任何「一份映射喂五个消费者」的落位方案 **必须先回答它**，否则会把我这条已经生效的分层折平。**我不主张落点归谁，我只主张这条约束必须进落点的验收标准。**

  6. **不请求** 补传任何角色。我边界内 **不增删改任何 IPC channel、bridge 面、facade 方法或 locale 键**，S-0003 对 `expert-security` / `expert-ux` 的不传唤判定在我这一侧继续成立。**触发线我画在 CF5。**

- **评估结论**: 逐条见正文一~七。总括：**甲 = 仍然有效（无条件），F1 不成立；乙 = `node.chatId`，存在，代价零，且写侧已有成文契约背书；丙 = 确认并升级为证明，其 Q1 前半段不翻转；丁 = stub 是探针产物非消费者，我端持有的活动会话 id *不可复用* 且是一条新错主源；Q2 = 承担一半，提交一条原则性反对 + 一条硬事实；可证伪 = CF1~CF6。** 附约束 K1~K5。

- **边界命中依据**:

  - **`pupu:src/COMPONENTs/side-menu/**`** —— 议案 Q1 疑点所述的那个「挂载接口」实体就是 `side_menu.js:772-779`（E-0003），承载它的两个文件全在本边界：`side_menu.js`（modal hub 挂载点、`handleInspectMemory`、`memoryInspect` state、`handleContextMenu`）与 `side_menu_context_menu_items.js`（`Inspect Memory` 入口与两条右键分支的取值点）。**这是 S-0003 补正我入列的全部理由，我确认该补正正确，且确认它属「议案写窄 + 概念名漏人」而非我的 charter 写窄** —— `pupu:src/COMPONENTs/side-menu/**` 逐字覆盖这两个文件，任何路径匹配都该命中。
  - **`pupu:src/PAGEs/chat/**`** —— `use_chat_stream.js`（V2 bridge 的既有消费者、`ownerChatId` 的生产侧、写侧 payload 契约）、`context_v2_turn_mutation.js`（码→文案映射的既有实现）、`use_chat_session_state.js`（`activeChatIdRef` 的唯一写点）、`use_chat_stream.turn_mutation_v2.test.js`（`getTree` stub 所在）。
  - **跨界只读引用（登记，不构成本边界主张）**：`pupu:src/SERVICEs/chat_storage/**`（`selectTreeNode` · `updateActiveAndSelectedFromChatId` · `createChatNode` · `buildCharacterMemorySessionId`，归 `code-owner-shared-arteries`）· `pupu:src/SERVICEs/bridges/context_v2_bridge.js`（`REQUIRED_METHODS`，同上）· `pupu:src/COMPONENTs/memory-inspect/**`（归 `code-owner-settings`）· `pupu:electron/main/services/unchain/service.js`（归 `code-owner-electron`）。**结论归属仍在各自 owner；我引用它们只为确定「我送出去的那个值，到达对面时是什么」。**

- **受影响对象**:

  - **若本案按 side-menu 那一路推进，我边界内 6 处改动，全部在一个目录内**（E-0049 的爆炸半径是机械 grep，非估计）：
    1. `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:207` —— character 分支调用点
    2. 同文件 `:223` —— 普通分支调用点
    3. `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:237-241` —— `memoryInspect` 初始 state 形状
    4. 同文件 `:296-297` —— `handleInspectMemory` 签名与写入
    5. 同文件 `:772-779` —— `MemoryInspectModal` 挂载 props
    6. 同文件 `:777` —— `onClose` 的复位形状
  - **零测试改动。** `side_menu_context_menu_items.test.js:285` 只断言「Inspect Memory 这一项存在」，**从不断言 `onInspectMemory` 的调用参数**（E-0042）。**这是 C4「破坏面为零」在测试层的机械证据，前案未举出，本案补齐。**
  - **零跨 owner 协作。** `buildSideMenuContextMenuItems` 全仓 2 个产品引用点（自身定义 + `side_menu.js:425`）、`onInspectMemory` 全仓 3 个产品引用点，**全部在 `src/COMPONENTs/side-menu/` 内**（E-0049）。不动 `chat_storage`、不动 bridge、不动 locale、不动任何 `src/PAGEs/chat/**` 文件。
  - **条件性影响（仅当 Q2 的落点判给「统一映射」且要求迁移）**：`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:389-459` 两张码表与 `:420-435` 的映射函数。**这是一次跨 owner 的破坏性迁移，不是加法**，且须先满足我在 6.3 提的那条约束，否则我以 `OBJECTION` 反对（CF4）。
  - **条件性影响（仅当 facade 方法数变化）**：`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:208-262` 的 18 方法 mock。**量级小，但失效形式是静默的**（请求 4）。
  - **无影响**：流式编排、`streaming_message_store`、`runtime_events` 消费、`queued_turn_outbox` / `turn_mutation_outbox`、minimap、composer、chat header、附件。**本案不触及本边界的任何吸积点，特别是 `use_chat_stream.js` 主体零改动** —— 这一条我要显式说出来，因为它是我承接本案的主要理由（K1）。

- **约束**:

  - **K1 · 本案不得以任何形式扩大 `use_chat_stream.js`。** 2026-07 重构评估把它与 `unchain_adapter` 并列为两个定点手术目标（~12k 行，发布后第一批）。tree view 的 `ownerChatId` 取值 **必须来自 side-menu 挂载点的右键节点**，**不得**为它在 chat 页或 streaming hook 里新增任何导出、任何 context、任何 ref 透传。**这条不是偏好，是本案能在我边界内保持 6 处改动的前提；一旦走 chat 页取值，改动面立刻跨到吸积点上，我的可行性表态翻转（CF2）。**
  - **K2 · `ownerChatId` 与 `sessionId` 必须是两个独立 prop，不得合并、不得互推、不得复用同一个名字。** 二者在我端的生产侧就是两个值（`use_chat_stream.js:11978` 与 `:11985`），在写侧被成文区分（`:6453-6457`），在读侧的右键构建器里今天被错误地折进同一个位置参数（E-0016 / E-0042）。**普通 chat 分支上二者恰好同值，这是巧合不是契约** —— 任何「反正一样」的实施都是在等 character chat 上线时静默错主。
  - **K3 · 挂载接口的扩展必须改为对象参数，不得追加第三个位置参数。** `onInspectMemory(sessionId, chatTitle)` 今天是位置参数（`side_menu_context_menu_items.js:207,223`），而这条接缝 **已经跨 owner**（side-menu → memory-inspect）。JS 的位置参数错位是静默的，且本案要送的两个值 **都是合法 chat id 形状的字符串**，错位后没有任何一层会报错。**这一条与前案 C4 的约束 4 同文，本案维持不变。**
  - **K4 · `ownerChatId` 在 modal 打开时快照，之后不跟随活动会话。** 今天 `memoryInspect` 是 side-menu 本地 state，语义即快照（E-0045）。**若实施时把它改成跟随 `chatStore.activeChatId`，就等于把 E-0045 那条错主路径写成默认行为。** 我按快照承接。
  - **K5 · 不得在 side-menu 侧新增任何 V2 调用。** 挂载点只负责 **把一个已有的值送出去**，不 `listSpaces`、不 `getTree`、不 `getStatus`、不判态、不预检。**side-menu 是 modal hub，我提供稳定的挂载接口，各 modal owner 往里挂内容** —— 反向伸手就是把 modal 的数据依赖倒灌进导航树的渲染路径，而侧栏在 500+ 会话时已有一个已知的 O(n) 全树重建塌点。**要预检 owner 存在性（`code-owner-settings` 的 F3 救济），落 modal 内部，不落我。**

- **建议处置**:

  1. **判为「有条件可行」并进入方案庭审。我在 side-menu 那一路不设任何前置阻塞，且 F1 就此闭合。**
  2. **把 E-0045（右键节点 ≠ 活动会话）列为新增已知缺口，并把 K1/K2/K4 三条写进裁定文本而不是留给方案庭审自行解释。** 三条都是「实施时最省事的那个做法恰好是错的」这一类，**不写死就会以最省事的形式落地，且落地后三层校验全部放行**。
  3. **就 `code-owner-settings` 的 G9（适用面 per-chat / 全局）——我支持其「只给 per-chat」的承接，并补一条它没说的理由**：settings 那个挂载点即便将来拿到一条 owner-less 读路由，**它仍然拿不到「用户此刻想看谁的树」这个意图**，而 side-menu 右键天然携带这个意图。**这不是 API 面的差距，是入口语义的差距**，多一条读路由也补不上。请把这一条并入交 CEO 的那一问。
  4. **就 Q2：我支持把落点指派做成方案庭审的准入条件**（与 `code-owner-settings`、`code-owner-shared-arteries` 一致），**但我不支持把它写成「建一个统一映射」**。请把准入条件写成两项：**(i) 落点与 owner 已指派；(ii) 该落点的验收标准里含 6.3 那条语境分层约束。** 只做 (i) 不做 (ii)，产出的构件会把我这条已经生效的分层折平，那比五份拷贝更坏——**五份拷贝各自诚实，一份折平的映射会对用户撒谎。**

---

## 一 · 甲 —— C4 承诺今天是否仍然有效（`code-owner-settings` 的 F1）

### 1.1 直接回答：**仍然有效。无条件。F1 不成立。**

F1 的原文是两件事的析取：*「chat-core 表示 C4 承诺不再有效，**或** 挂载点无法新增 prop」*。**两件我都答否。**

- **承诺不再有效？——否。** 我在 `0000-0003-2026-0807#S-0006` 的承诺原文是「本端承诺该扩展，破坏面为零」。**我今天重新证成了它，而且证据比前案强**（E-0042 / E-0049）。
- **挂载点无法新增 prop？——否。** 挂载点是我自己文件里的一个 JSX 调用块（`side_menu.js:772-779`），新增一个 prop 是我单方面可做的加法。

**故 `code-owner-settings` 的 Q1 结论前半段（side-menu 那一路可行）在我这一侧 *成立*，且我请求本庭当场闭合 F1。**

### 1.2 我今天补齐的、前案没有的三条证据

前案 C4 的「破坏面为零」是我基于 `E-0016`（当时的编号）作出的判断。本案我把它做成机械可核的三条：

**(a) 爆炸半径是 grep 得出的闭集，不是估计**（E-0049）。全仓（`src` + `electron`，含 `.js`/`.cjs`）：

```
buildSideMenuContextMenuItems  →  产品引用 2 处：定义 :11 + side_menu.js:425
onInspectMemory / handleInspectMemory →  产品引用 5 处，全部在 src/COMPONENTs/side-menu/
```

**零处在本目录之外。零处在 electron。零处在其他 owner 的边界。**

**(b) 没有任何测试断言这个回调的参数**（E-0042）。`side_menu_context_menu_items.test.js:277-293` 那个 case 传的是 `onInspectMemory: jest.fn()`，断言只有四条 `items.some(item => item?.label === …)`。**改签名不需要动一行测试。** ——这一条前案没查，是「破坏面为零」在测试层的直接证据。

**(c) 基线是绿的，且我实跑确认**（E-0049）：`side_menu_context_menu_items.test.js` + `use_chat_stream.turn_mutation_v2.test.js`，**2 suite / 54 test 全绿**，2.344s，工作树未修改，产品目录零 dirty。

### 1.3 但我要主动加一条 F1 没问、而它比 F1 更要紧的话

**F1 问的是「这个 prop 能不能加」。我的答案是能，代价为零。但「加了这个 prop」*不足以* 让 tree view 拿到正确的树。** 还有第二条错主路径，落在同一个挂载点上，本案至今无人提及——见正文四。

**我把它写在甲的末尾而不是塞进乙，是因为它会被「C4 仍然有效」这句话掩盖掉。** 承诺有效 ≠ 问题解决。

---

## 二 · 乙 —— 两条右键分支各自应当传什么值

### 2.1 直接回答

| 分支 | 今天传出的（唯一位置参数 `sessionId`） | **应当传的 `ownerChatId`** | 存在？ | 取得代价 |
|---|---|---|---|---|
| character chat（`:197-208`） | `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId \|\| "main")` → `"character_<x>__dm__<y>"` | **`node.chatId`** | **存在** | **零** —— 它在 `:195` 与 `:197` 已被求值两次 |
| 普通 chat（`:217-224`） | `node.chatId` | **`node.chatId`** | **存在** | **零** —— 恒等 |

**两个分支的答案是同一个表达式：`node.chatId`。** 差别只在于 character 分支今天把它算出来、用了两次、然后丢掉了（E-0042）。

### 2.2 为什么是 `node.chatId` —— 我有产端权威依据，不是推断（E-0044）

本案至今的讨论都停在「`sessionId` 不是 `ownerChatId`」这个 **否定式** 上。我这一侧有一条 **肯定式** 的、写在代码注释里的契约：

```
src/PAGEs/chat/hooks/use_chat_stream.js:6453-6457
  /* Memory V2 P0 payload identity + lazy bootstrap.
     owner_chat_id is ALWAYS the UI chat id (targetChatId) — never
     effectiveThreadId, which becomes the character session_id for
     character chats — and is sent unconditionally on both the normal
     and the durable-resume payload …
```

并且它 **不只是注释**，写侧逐字如此实现（同文件 `:6496` 与 `:6501`，两条 payload 分支各一次）：

```js
owner_chat_id: targetChatId,
```

其中 `targetChatId` 是 `runTurnRequest` 的入参 `chatId`（`:4116-4119` `async ({ mode, chatId: targetChatId, … })`），调用方一律传 `activeChatIdRef.current`。

> **净效果**：**V2 数据的 owner 键，在写入的那一刻就被定死为 UI chat id，character chat 也不例外。** 所以读侧要拿的 `ownerChatId` **不需要任何派生、判断或分支** —— 它就是那个 chat 在 chat store 里的主键，而右键节点手上正好有它。
>
> **这条把乙从「该传什么」变成「同键」**：读写同键是唯一正确的答案，其余任何值（`sessionId` / character session id / `threadId` / `effectiveThreadId`）都会查到一个不同的 owner。

### 2.3 `sessionId` 必须继续存在，不能被替换（K2）

Inspector 今天的 V1 数据源是 `getMemoryProjection(sessionId)`（`code-owner-settings` E-0015），**而 V1 的 session 语义与 V2 的 owner 语义不同**：V1 按 character session 分库，V2 按 UI chat 分 owner。议案的前提是「vector view 保持现状」，那么 **两个 prop 必须并存**：

```
sessionId    → V1 vector view 继续用（多态：character session id 或 chat id）
ownerChatId  → V2 tree view 用（恒为 UI chat id）
```

**这也是我支持 `code-owner-settings` N1 并要求把它写死的理由**：不是「别推导」，是 **modal 内部同时握着两个长得很像、在普通 chat 上恰好相等、在 character chat 上必然不等的字符串**，任何一次拿错都不会报错。

### 2.4 我不主张的部分

**入口放不放 side-menu、按 admission 怎么分流** —— 前案 C3 我自陈越界并主动交出，**本案立场不变，仍然交出。** 我只承诺：挂载接口按需扩展，且扩展本身零成本零破坏面。

---

## 三 · 丙 —— `node.chatId` 与 `currentChatId` 是否同一个 id 空间

### 3.1 直接回答：**确认。且我把它从「强旁证」升级为 *证明*。**

`code-owner-settings` 自陈「做到了强旁证但没做到证明」。**它缺的那一段我今天补上了**：二者不是「两个碰巧相同的 id 空间」，而是 **同一个值经五段确定性传递**，且两端各有一道 `chatsById` 存在性守卫（E-0043）。

### 3.2 五段链条，逐段可核

```
① 右键构建器读的 node
   side_menu_context_menu_items.js:195   const chat = chatStore?.chatsById?.[node.chatId]
   同文件 :24-25                          isCharacterChatNode = (chatId) =>
                                            chatStore?.chatsById?.[chatId]?.kind === "character"
   → node.chatId 是 chatsById 的键（两处独立使用，两处都必须命中才有菜单）

② 同一个 node 被点选时走的路
   side_menu.js:390                       explorerHandlerCallbacksRef.current.onSelect = handleSelectNode
   use_side_menu_actions.js:19-25         handleSelectNode = (nodeId) => setChatStore(selectTreeNode({nodeId}))

③ store 侧把它写成 activeChatId
   chat_storage_store.js:1712-1737        target = store.tree.nodesById[nodeId]
                                          → updateActiveAndSelectedFromChatId(store, target.chatId)
   chat_storage_store.js:1022-1029        if (!chatId || !store.chatsById[chatId]) return null;
                                          store.activeChatId = chatId;          ← 守卫①

④ chat 页把它读进 ref
   use_chat_session_state.js:345-347      nextActiveId  = nextStore?.activeChatId
                                          nextActiveChat = nextStore?.chatsById?.[nextActiveId]
   use_chat_session_state.js:351-353      if (!nextActiveId || !nextActiveChat) return;   ← 守卫②
   use_chat_session_state.js:412          activeChatIdRef.current = nextActiveId

⑤ streaming hook 把它当 ownerChatId
   use_chat_stream.js:11874               const currentChatId = activeChatIdRef.current
   use_chat_stream.js:11985               resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, … })
   use_chat_stream.js:4116-4119 / :6496   runTurnRequest({chatId: targetChatId}) → owner_chat_id: targetChatId
```

**再加一道树侧的守卫**：`chat_storage_tree.js:335` 在重建树时逐字写着 `if (node.entity === "chat" && node.chatId && store.chatsById[node.chatId])` —— **chatId 不在 `chatsById` 里的 chat 节点根本进不了树**，因此右键菜单不可能拿到一个不在 `chatsById` 里的 `node.chatId`。

> **结论**：`node.chatId` 与 `activeChatIdRef.current` 取自同一张表 `store.chatsById`，且 `activeChatId` 的值 **正是** 某个 `node.chatId` 经 `selectTreeNode` 直接赋入的。**这不是「同一个 id 空间」，这是同一个值。**
>
> **对 `code-owner-settings` 的直接回答：你的不确定性 3 *确认成立*，你的 Q1 结论前半段 *不翻转*。**

### 3.3 一条限制，我如实标注

我核实了 `store.activeChatId` 的 **全部 8 个产品写点**（`chat_storage_store.js:391,1029,1135,1869,1888,1898,2019` + `chat_storage_migrate.js:313`），其中 `:391` / `:1135` 写 `null`，其余全部写一个来自 `chatsById` 或 chat 对象自身 `id` 的值。**我未逐一读完 migrate 那一条的全部分支**（`chat_storage_migrate.js:285-313`，五个 fallback）——**该文件归 `code-owner-shared-arteries`**，我只登记「它的输出仍是 chat 主键」这一形状，**不主张其正确性**。这一处不影响本节结论，因为 ④ 的守卫②会挡下任何不在 `chatsById` 里的值。

---

## 四 · 丁 —— 我端怎么用 `context_v2_bridge`、`getTree` stub 是什么、我端持有的取值路径

### 4.1 我端今天怎么用它 —— **只用两个方法，都是写路径的前置读**

```
src/PAGEs/chat/hooks/use_chat_stream.js:87-89   import { contextV2Bridge, parseContextV2ErrorCode }
  :3907   contextV2Bridge.isAvailable()                      ← 门
  :3916   contextV2Bridge.getSessionHead({ownerChatId, sessionId})   ← turn mutation 前的 admission 读
  :3920   parseContextV2ErrorCode(error) || "context_v2_failed"
  :4004   contextV2Bridge.isAvailable()
  :4010   contextV2Bridge.rebaseSession(payload)             ← 写
  :4013   parseContextV2ErrorCode(error) || "context_v2_failed"
```

**18 个方法里我只调 2 个**（`getSessionHead` / `rebaseSession`），且 **两个都服务于 edit/resend/delete 的 turn mutation**，不是浏览型读。**我不是 V2 读平面的消费者，我是它的写者。** 这一点值得本庭区分：`chat-bubble` 的三个消费者是读，我是写，**方向不同，处境也不同**。

### 4.2 `getTree: noop` 是什么 —— **是探针的产物，不是消费者**（E-0046）

`use_chat_stream.turn_mutation_v2.test.js:208-262` 构造的是一个 **完整的 `window.contextV2API` preload 替身**。我逐项比对：

```
mock 里的方法数                                = 18
REQUIRED_METHODS（context_v2_bridge.js:32-50） = 18
逐项对应                                        = 18/18，顺序亦同
其中 jest.fn 实现的只有 2 个（getSessionHead / rebaseSession），其余 16 个是 noop
```

原因在 facade 的 **全有或全无探针**（`context_v2_bridge.js:59-67`，`code-owner-shared-arteries` E-0035 已独立登记为 fail-closed 设计）：缺任何一个方法，`resolveApi()` 返回 `null`，整个 facade 失明。

> **净效果**：**`getTree: noop` 不表示 chat-core 消费 `getTree`，它表示 chat-core 被迫声明 `getTree` 存在，否则我真正要用的那两个方法拿不到。** 本庭 `FRAMING` 已知事实 4 把它记作「已在 mock 中 stub 了 `getTree`」——**字面正确，但读者极易把它读成「chat-core 与 getTree 有关」。请以本条为准。**

### 4.3 由此得出一条落在我边界内、支持 `code-owner-shared-arteries` A2 的成本（请求 4）

**A2「不得新增 facade 方法」在我这里有一个具体且 *静默* 的代价**：`REQUIRED_METHODS` 变 19 的那一刻，我的 mock 是 18，`resolveApi()` 返回 `null`，`isAvailable()` 为假 —— 而我的两个调用点 **都以 `isAvailable()` 为门**（`:3907` / `:4004`）。测试不会红，**它会绿，但测的是 bridge 缺席的降级分支**。

**这是本仓「唯一会静默失效的测试形态」（Electron `.js`/`.cjs` 双胞胎）之外的第二种。** 我登记它，不请求本案处置。

### 4.4 我端是否持有可供 Inspector 复用的 `ownerChatId` 取值路径 —— **持有两条，只有一条是对的**（E-0045）

| 路径 | 值 | 对 Inspector 可用？ |
|---|---|---|
| **A. 挂载点的 `node.chatId`** | **右键的那个 chat** | ✅ **正确，且这是唯一正确的一条** |
| **B. `activeChatIdRef.current` / `chatStore.activeChatId`** | **当前活动的那个 chat** | ❌ **错误。二者常常不是同一个 chat** |

**为什么 B 是错的 —— 机械原因，一行**：

```
src/COMPONENTs/side-menu/side_menu.js:344-353
  const handleContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x, y, node: storeNode });    ← 只开菜单
  }, []);                                                        ← 不调 handleSelectNode
```

**右键 *不* 选中节点。** `Inspect Memory` 作用于 **被右键的那个 chat**，而 `activeChatId` 是 **上一次左键点选的那个 chat**。用户在会话 A 里聊天、右键会话 B 选 `Inspect Memory` —— 这是这个入口最常见的用法之一，不是边缘情形。

### 4.5 为什么这条比 character session id 那条更危险 —— 请本庭记为新增缺口（请求 2）

| | E-0016 的错主（character session id 冒充） | **E-0045 的错主（右键节点 ≠ 活动会话）** |
|---|---|---|
| 传出的值 | `character_foo__dm__main` | **一个真实存在的 chat id** |
| main 语法门 | 通过（`code-owner-electron` 已实跑，S-0010 丙(2)） | **通过，且完全合法** |
| 服务端 owner-scoping | **可能** 404 / 空树（G10 未核实） | **必然返回该 owner 的真实数据** |
| 收端可检测性 | 取决于 G10 的答案 | **结构性不可检测** —— 200 + 非空树，每一层都正确 |
| 用户看到 | 空树 或 错误 | **另一个会话的真实记忆树，且看不出哪里不对** |

**三道防线全部放行，且全部没做错**：`code-owner-electron` 的语法门只防畸形（其 S-0010 丙(3) 明言「没有，一个都没有」）；`code-owner-runtime` 的 owner-scoping 正确地返回了该 owner 的数据；`code-owner-shared-arteries` 的 facade 正确地不做任何校验（其 A1）。**没有任何一层能救它，因为没有任何一层知道用户想看的是哪个 chat。**

**唯一的防线是挂载点本身把正确的值送出去。** 这就是 K1 / K4 与请求 3 的全部理由。

**我把这条自陈为「本案迄今由我这一层新捞出的、唯一的实质风险」，并声明它的成因是 *入口语义*，不是任何一方的实现缺陷。**

---

## 五 · Q4 / Q1 —— 我端没有被点名、但顺手可给的两条

**(1) 我端不参与判态，也不该参与。** side-menu 是 modal hub：我提供挂载接口，判态与呈现落 modal 内部（K5）。**故 Q4 的收端半边在我这里不产生任何主张。**

**(2) 但我端持有一份「V2 码 → 用户可见文案」的既有实现，它是本案讨论中被漏计的一份**，见正文六。

---

## 六 · Q2（G1）· 强制表态 —— 我不说「与我无关」

### 6.1 本案会不会要求我的边界承担今天不属于我的判定职责？—— **会一件，我拒绝；另有一件已经是我的，我不交出**

| 职责 | 今天在哪 | 本案推不推给我 | 我的立场 |
|---|---|---|---|
| 把 `ownerChatId` **送到** 挂载点 | 我 | 不推（已是我的） | **承接，6 处改动，零测试改动** |
| **消歧两条右键分支** | 我 | 不推（已是我的） | **承接**（K2/K3） |
| **保证送出去的是右键那个 chat 而不是活动 chat** | **无人明确持有** | **会推给我，而且应该推给我** | **承接。** 它落在我的挂载点上，没有第二个人能做（4.5） |
| **定义** 四态判据（哪些码算未知、哪些算无、哪些算未启用） | **无人**（各消费者即兴） | **会试图推**（因为我手上有一份最完整的映射） | **不承接定义权。** 但见 6.3：我提交一条 **必过约束** |
| **决定** 谁是权威（`memoryV2` / `contextV2Bridge.getStatus()` / `enable_memory_v2`） | 无人 | 会试图推 | **不落在本边界。** 归 `expert-architecture` 出意见 + CEO 裁定 |
| tree view 内部的渲染与状态机 | `code-owner-settings` | 不该推给我 | **不落在本边界** |
| 挡住「用错误 owner 查询」的身份门 | 无人（`code-owner-electron` 明确拒绝在本案内建，其 FE3） | 会试图推 | **不落在本边界，也不该建在我这里**（K5）。**能判断的是 `code-owner-runtime`（G10）与 `expert-architecture`（落位）** |

### 6.2 一条被本案漏计的事实：**chat-core 已经持有第 5、第 6 份码→文案映射，而且是最完整的一份**（E-0047）

`code-owner-shared-arteries` 在 5.1 数出「四份拷贝」并把 chat-core 记作「一处（`use_chat_stream.js:3920,4013`）」。**那两行只是取码，不是映射。真正的映射在另一个文件里，而且是两张表：**

```
src/PAGEs/chat/hooks/context_v2_turn_mutation.js
  :389-394   RUNTIME_UNAVAILABLE_CODES   4 个码  → UNAVAILABLE
  :396-412   NOT_READY_CODES            15 个码  → NOT_READY
  :420-435   contextV2TurnMutationMessage   5 个出口（+ IN_PROGRESS / CONFLICT / 兜底 FAILED）
  :445-451   V1_MIRROR_UNAVAILABLE_CODES  5 个码（V1 词汇，独立第二张表）
  :456-459   contextV2V1MirrorMessage       2 个出口
  :97-109    CONTEXT_V2_TURN_MUTATION_MESSAGES  7 条固定文案
```

**这份映射有三条别人那四份都没有的性质：**

1. **码词汇表是闭集且穷举过**（19 个 V2 码 + 5 个 V1 码），不是即兴 if-else。
2. **fail-closed 兜底成文**：`:434` `return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED`，未知一律落失败态、永不落「就绪」或「空」。**这与 `code-owner-shared-arteries` 的 A4 与 P2 立场完全一致，我在此登记为对其 P2 的独立支持。**
3. **绝不外泄服务端 message**：`:93-96` 逐字写着 *"A turn-mutation failure must never surface a server message, an error path, a payload excerpt or any conversation content"*。**七条文案全部是固定字面量。**

### 6.3 而这份映射的注释里，写着一条对「一份映射喂五个消费者」的 **原则性反对**，请本庭记入（请求 5）

```
src/PAGEs/chat/hooks/context_v2_turn_mutation.js:437-444
  /* ── V1 mirror leg (shadow only) ───────────────────────────────
     The second leg of a shadow mutation runs through the LEGACY V1 replace, so
     its failures arrive with V1/bridge error codes, not context_v2_* ones. They
     get their own mapping rather than being funnelled through
     contextV2TurnMutationMessage: that map would classify an unrelated V1 code
     as a rebase CONFLICT and tell the user the conversation moved when it did
     not. …
```

**这段注释记录的是一次已经作出的、有具体代价的判断**：把两个语境的码喂进同一张表，会让用户被告知「对话变了」——**而对话根本没变**。所以我在自己边界内 **蓄意维持了两张表**。

> **我的 Q2 表态因此不是「落点归谁」，而是给落点加一条必过约束：**
>
> **码 token 不是判据的全部，(码 × 调用语境) 才是。** 一个 `context_v2_unavailable` 在 turn mutation 里意味「你这次编辑没生效」，在 tree view 里意味「这棵树读不出来」，在 `chat-bubble` 的 journal reload 里意味第三件事。**任何统一映射若只按码分支、不按语境分层，就会在某个消费者身上撒谎** —— 我这份注释是它已经发生过一次的记录。
>
> **`code-owner-shared-arteries` 的 A4（未知落第三态）与我这条不冲突，是正交的两条**：它管「未知怎么办」，我管「已知的码在不同地方是不是同一件事」。**两条都进落点的验收标准，我才认这个落点解决了 D7/D8。只做前者，我这两张表迁不过去。**

### 6.4 一条硬事实：**`context_v2_store_disabled` 在整个 `src/` 下出现 0 次**（E-0048）

```
grep -rn "context_v2_store_disabled" src --include="*.js"   →   零命中
grep -rn "context_v2_store_disabled" unchain_runtime         →   route_memory_v2.py:239
                                                                 memory_v2_runtime.py:726
```

而这个码，按 `code-owner-runtime` 的 E-0010(b)、`code-owner-electron` 的 S-0010 丁(2)、`code-owner-shared-arteries` 的 E-0039，**正是「V2 未启用」在整条链路上的唯一权威信号**。

> **净效果，请本庭记入**：「未启用」不是 Inspector 的六态机里缺一枝（`code-owner-settings` §2.1 的表述），**是整个 renderer 都不知道这个码存在** —— 四份既有映射、facade 的解析面、我的两张表，无一处出现过它。
>
> **在我的表里它的归宿是可计算的**：不在 `RUNTIME_UNAVAILABLE_CODES`、不在 `NOT_READY_CODES`、不是 `CONTEXT_V2_REBASE_IN_PROGRESS_CODE`、不在 `TERMINAL_REBASE_ERROR_CODES` → **落 `:434` 的兜底 FAILED**：*"This message change could not be applied. Please try again."* —— **对一个重试永远不会改变的条件说「请重试」。**
>
> **这不是本案要修的 bug**（该码在我的调用路径上今天大概率不可达，因为 store off 时 `memory_v2_requested` 也不会打开——**该可达性我未核实，标为推断**）。**我举它是因为它给 D7/D8 那个「无主构件」提供了一个此前没有的、可证伪的度量**：**统一映射存在的必要性，可以用「同一个权威码在几份拷贝里被正确处理」来量。今天的答案是 0/5。**

### 6.5 前案 C3 的越界交出在本案是否仍然成立 —— **成立，但它不覆盖本案的 Q2**

本庭点名要我说明这一点，我分开答：

- **前案 Q2/Q5 = 「`Inspect Memory` 按 chat admission 分流放在哪一层」。** 我在 `0000-0001-2026-0807#S-0006` 自陈越界、主动交出，并在 `0000-0003-2026-0807#S-0006` 正文二(e) 重申。**本案立场完全不变：入口放哪一层、怎么按 admission 分流，是 `code-owner-settings` 的判断，我不主张。**
- **本案 Q2 = 「四态判定构件的落点与 owner」。** **这是一个不同的问题**，前案 `#S-0014` D7 / `#S-0024` D8 才第一次把它识别出来，**我从未就它作过任何交出。** 故我在 6.1~6.4 的表态 **不是收回交出**，是就一个新问题首次作答。
- **两者的分界线我说清楚**：**「谁被允许看到 Inspector」是产品分流 → 交出；「Inspector 看到的错误码该被翻译成什么」是公共动脉的语义 → 我不交出我这两张表的语境分层判断，但我不主张落点归属。**

### 6.6 G1 是否构成前置阻塞？—— **对可行性不阻塞；对我这两张表的迁移阻塞**

我在甲/乙/丙/丁 的全部结论都是 `b2385d5d` 上的 **值传递事实与作用域事实**，在 16 项强制回应的任何组合下都不变。**本案可以在 `0000-0003-2026-0807` 裁定之前完成议案庭审。**

**但**：若方案庭审要求我把 `context_v2_turn_mutation.js` 的两张表迁进一个统一构件，**那在 6.3 的约束闭合前是阻塞的**，且我会以 `OBJECTION` 反对（CF4）。**我与 `code-owner-settings`（F5）、`code-owner-shared-arteries`（5.4 末）在「不接受五份拷贝这个空选项」上立场一致；我比二者多一条：也不接受一份折平的映射。**

**我支持 `code-owner-electron` 的出路（其 S-0010 Q2(3)）**：本案显式声明 **不新增状态源、只消费已存在的四态**。若本案如此声明，**我边界内的改动仍是 6 处，两张表原地不动，本案对 Q0 裁定零依赖。** 这是我最优先推荐的路径。

---

## 七 · 丙（框定第三条）· 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

**任一条成立即翻，请本庭逐条登记为方案庭审的检查点：**

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **CF1** | 议案要求 tree view 的 `ownerChatId` **不从右键节点取**，而从 chat 页 / 活动会话 / 任何全局状态取 | **判不可行**（不是技术不可行，是 **稳定错主**）。E-0045 已证右键 ≠ 活动会话，且该错误在链路上结构性不可检测。我以 `OBJECTION` 反对 | 我 + `code-owner-settings`（N1 的范围） |
| **CF2** | 为了拿这个值，要求在 `use_chat_stream.js` 或 chat 页新增导出 / context / ref 透传 | **翻转**。改动面从 6 处一个目录跨到 ~12k 行的吸积点上，K1 破。**不是不可行，是我拒绝在本案内承接**，须单独走 case | 方案庭审 |
| **CF3** | 议案的适用面被裁定为「settings 全局 Inspector 也要 tree view」，且要求由我提供 chat 上下文 | **我这一路不受影响，但我预先反对该实现形态**：在 settings 里重建会话选择等于把 side-menu 的职责复制一份（与 `code-owner-settings` N4 同向，我从入口语义再加一条理由，见建议处置 3） | CEO 裁定 |
| **CF4** | 方案要求把 `context_v2_turn_mutation.js:389-459` 的两张码表迁进一个 **只按码分支、不按语境分层** 的统一映射 | **判结构上不可接受**，以 `OBJECTION` 反对（6.3）。**技术上做得到，做出来会对用户撒谎** —— 该代价我边界内已经付过一次并写进注释 | 方案庭审 + `expert-architecture` |
| **CF5** | 方案要求在 side-menu 侧新增任何 V2 调用（owner 预检 / `listSpaces` / 判态） | **判不可行**（K5）。侧栏在 500+ 会话时已有 O(n) 全树重建的已知塌点，把 modal 的数据依赖倒灌进导航树的渲染路径不可接受。**且这会推翻 S-0003 对 `expert-security` 的不传唤判定（新增 renderer 消费者落点），届时我请求补传** | 我 |
| **CF6** | `code-owner-settings` 表示 `MemoryInspectModal` **无法接受一个新 prop**（例如 props 已被冻结或有 allowlist） | **甲 的「破坏面为零」在下游翻转**。我这一侧的加法仍成立，但值送不进去 → side-menu 那一路不可行。**我未核实其组件内部，这一条只有它能证伪** | `code-owner-settings` |

**不会被推翻的（可作为方案庭审在我这一层的地基）**：`node.chatId` 在两条右键分支中 **均在作用域内**（character 分支已求值两次）；`node.chatId` 与 `ownerChatId` 是同一个值经五段确定性传递、两道 `chatsById` 守卫；写侧 `owner_chat_id` 恒为 UI chat id 且成文；挂载接口的产品引用点全仓 7 处且全部在 `src/COMPONENTs/side-menu/`；无任何测试断言 `onInspectMemory` 的参数；`getTree: noop` 是 18 方法探针的产物而非消费者；`handleContextMenu` 不选中节点。

---

## 八 · 留待方案庭审（自行标注，本阶段不作为结论）

按 S-0001 的范围纪律登记，**不主张**：

- **`ownerChatId` 是否随活动会话变化**（不确定性五）。我倾向「打开时快照、不跟随」，与今天 `sessionId` 的语义一致（K4 已把它写成约束的否定半），**但「打开着的 modal 在其 chat 被删除时该怎样」是交互设计**。
- **`Inspect Memory` 这一项在 V2 未启用时是否仍出现在右键菜单里**。技术事实登记于此：菜单构建器 `buildSideMenuContextMenuItems` 是 **纯同步** 的（`:11-23` 无 async、无 await、无 promise），**任何异步判态都不可能在菜单构建期完成** —— 这与我在 `0000-0001-2026-0807#S-0006` 提出的「入口是纯同步菜单构建器」是同一条硬约束，**它在本案继续成立**。要按启用态隐藏该项，只能靠一个已缓存的同步可读状态。**这是可行性证据，隐不隐是设计。**
- **`chatKind` 要不要一并送进 modal**。技术事实：`chat?.kind` 在 `:195` 已在作用域内（`isCharacterChatNode` 就是读它），送出去同样零成本。**送不送取决于 Inspector 要不要按 chat 类型分呈现，那是设计。**

---

## 九 · 本 `ASSESSMENT` 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**。我于作业开始时复测工作树：**16 个 dirty/untracked 条目，全部位于 `.claude/`；`src/` `electron/` `unchain_runtime/` 三个产品目录 `git status --porcelain` 输出行数为 0**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**在我作业时点仍然成立**（与 `code-owner-shared-arteries` E-0033 的复测结论一致，条目数因各 owner 陆续落盘记忆而继续增长）。全部只读，未改任何文件、未 commit、未起 sidecar、未起 Electron、未跑应用。

---

#### S-0018 | ASSESSMENT | code-owner-chat-bubble → case
- **阶段**: 议案庭审
- **结论**: **可行，我边界内 0 处必须改动。** 但本庭把我请来验证的那条推论，我要 **一半证实、一半推翻**。**甲 证实且比本庭说的更强**：我端的 `ownerChatId` 来自 `StreamingMessageStoreContext`，其源头与 `use_chat_stream.js:11985` 生产侧用的 **是同一个 `activeChatId`**，全链单一 provider、单一挂载点、空值 fail-closed、且 **三条性质全部被测试锁住**（E-0050/E-0051）。**本庭点名的 E-0016 多态值在我这条链上结构性不可达** —— `buildCharacterMemorySessionId` 在全 `src/` 只有 **一个** 消费者，就是 Inspector 那条右键路径，不是我（E-0052）。**但推翻的那一半更重要：我端不是 Inspector 可以复用的路径。** 我拿得到好值，是因为我 **只能** 在当前活跃会话的消息列表里挂载；Inspector 的 side-menu 入口是对 **任意（可能非活跃）节点右键**，今天没有任何 context 覆盖它。**我端是「这个值在 renderer 里存在」的实证，不是「Inspector 可以接上去的一根线」。** **乙 我的答案是「不能」，且原因不是信号没到，是我把它扔了** —— `context_v2_store_disabled` 在 **整个 `src/` 出现 0 次**（E-0053），我端唯一的启用态门 `isAvailable()` 是 preload 存在性探针不是 store 状态探针，**净效果：出厂默认态在我端渲染成一个红色 `role="alert"` 报错**。未知码落到 **四个不同去处，其中两个根本不解析码**，无码出口（`ensureMisoReady`）会把 **内部服务代号原文 `Miso service is not ready (…)` 渲染进 chat bubble**（E-0053/E-0054）。**丙 `code-owner-settings` 的描述 2/3 属实，第三份是错的，而真相更糟** —— `memory_v2_trace_audit.js` 根本 **没有** 读平面的四态实现，它的 `status` 是流式 presenter 的 **另一套词汇** 的直通显示；它不是第四份拷贝，是 **一个缺失的判定 + 同一个展开面板里的第三套 status 词汇**。**我端真正重复的不是四态机（那三者答三个不同问题），是最底下那一层「错误 → 码」的六个站点四种纪律。** 共享模块 **我无条件消费**，但 **只接窄口径**，宽口径我 `OBJECTION`。**Q2 我强制表态：三种主张我端今天一个都没在用**，我跑的是 shared-arteries E-0039 的形状但 **只实现了一半**（要了成败、扔了码）；electron 的 `unchainAPI.getStatus().memoryV2` **从 `src/COMPONENTs/**` 经任何合法路径不可达**（E-0055）
- **依据**: E-0005, E-0003, E-0004, E-0016, E-0018, E-0020, E-0024, E-0026, E-0034, E-0035, E-0037, E-0039, E-0040, E-0050, E-0051, E-0052, E-0053, E-0054, E-0055, E-0056, S-0006, S-0009
- **不确定性**:

  **一 · 我实跑到哪里为止**

  我 **未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求、未在运行中的 app 里打开过任何一个 Memory V2 trace 面板**。我的运行时观察 **只有一项**：`CI=true npx react-scripts test --testPathPattern="chat-bubble/(memory_v2_journal_reload|chat_bubble.memory_v2_mount|trace_chain.memory_v2)"`，4 suite / 23 test 全绿（E-0051）。**而这套测试把 `context_v2_bridge` 整个 mock 掉了**（`trace_chain.memory_v2.test.js:28-44`）—— 它锁住的是「我的组件按什么参数调 bridge」，**不是「bridge 背后真的通」**。凡涉及真实链路行为的一律标推断。

  **二 · 我自己的持久记忆里有一条与本案直接相关、且已被我复核为「仍然成立」的限制，必须前置声明**

  我的记忆 `memory-v2-trace-contract` 载：`trace_chain.memory_v2.test.js` / `memory_v2_journal_reload*.test.js` 的 fixture 全部用 **旧 PuPu fallback store 的嵌套 payload 形状 + 已规范化的 `pupu://` ref 串**，而生产 active 读适配器（`memory_v2_unchain_read_adapter.py:176`）把 payload **摊平**，`event.payload` 恒 `undefined`。**即：journal reload 的 ref 恢复对今天 `npm start` 实际走的那条适配器是死代码，而 21 个测试全绿。** 我在 `b2385d5d` 上复核了本端的两处锚点（`CURATOR_EVENT_TYPES` 在 `:22-30`、`runStatusRank` 在 `:424-432`）**仍然逐字成立**。**本庭与后续角色不得把「chat-bubble 有三个活的 V2 消费者且测试全绿」读作「V2 读平面在生产上工作」。** 这与 S-0009 登记的 `pupu_legacy` 幻影是 **同一类错误的第三次出现**：本庭的 E-0006 锚在不执行的代码上、`code-owner-runtime` 的 Q4 跑在不执行的代码上、**我这三个消费者的测试建在不存在的载荷形状上**。

  **三 · G8 是我 乙 结论的证据地板，且我同样跨不过去**

  我的码处理是否「封闭」，取决于 `store_owner=unchain` 分支实际发出的码长什么样。**S-0009 第五节已登记三人无一能实跑该分支。** 我也不能 —— 我端在 renderer，离得更远。故我关于「码保真到我这里」的全部陈述，**继承 E-0026 / E-0036 的推断地位**，不因我是收端而升级。

  **四 · G2 继承。** 本机 V2 store `entries=0`。我端有明确的封顶常量（见 §四），但 **从未在真实非空载荷上跑过**。凡涉及正常态量级一律推断。

- **请求/下一步**:
  1. **请本庭把「chat-bubble 今天就拿得到 `ownerChatId`」这一条，在 `SUMMARY` 中改写为可判定形式**：*「chat-bubble 在 **活跃会话的消息列表内** 拿得到，因为它挂在覆盖该会话的 provider 里；Inspector 的两个挂载点都不在那个 provider 内。」* 现在这句话在 `FRAMING` 甲 里的措辞，会诱导方案庭审去找一条不存在的复用路径。**这是我作为「那一半实证」被传唤过来最该纠正的一件事。**
  2. **请 `chief-judge` 就共享判定模块的 *口径* 与其落点一并裁**，不要只裁落点。我支持 `code-owner-shared-arteries` 认领（S-0011 Q2），**但落点定了口径没定，对我边界是净损失**：宽口径模块会把我三个面的三套合法词汇压成一套（§三）。口径见我的约束 B2。
  3. **请本庭把 `context_v2_request_failed` 与 `context_v2_journal_unavailable` 记为「renderer 自造码、服务端零出处」**（E-0054），与 `code-owner-shared-arteries` 请求 4 的 `context_v2_unavailable` 碰撞合并为同一条已知缺口。**我另报两条它没查到的**：我端 `journal_reload.js:391` 自造的 `context_v2_invalid_cursor` 与服务端 `memory_v2_store.py:3604` **字面碰撞且条件不同**；`context_v2_unavailable` 在我端还有 **两个** 自造点（`:294` / `:521`），即该字符串全仓 **三个生产者**。
  4. **答复 `code-owner-shared-arteries` 请求 5（E-0040）**：已知情，属实，是我边界内的缺陷，与 §二 表格里那四个「丢码」站点同一类。**本阶段只读，我不修**；请本庭登记为我承认的在册缺陷，方案庭审若触及即由我一并处置。
  5. **不请求** 本案为我做任何事。我边界内 0 处必须改动，我也不认领任何本案新工作 —— 除非 FB5 成立（见 §五）。

- **评估结论**: 逐问见下。

  ---

  ## 一 · 甲 —— `ownerChatId` 在我端从哪来，可不可靠，是不是那个多态值

  ### 1.1 完整链路（E-0050，逐段读过，无一段推断）

  ```
  chat_storage 权威 store 的 activeChatId
    → use_chat_session_state.js:202   const [activeChatId] = useState(initialChat.id)
      :237  activeChatIdRef = useRef(initialChat.id)
      :412  activeChatIdRef.current = nextActiveId        ← 与 store 快照对账
    → chat.js:1130                    <ChatMessages chatId={session.activeChatId} …>
    → chat_messages.js:60             chat_id: chatId
      :73-81                          streamingStoreContextValue = useMemo(() => ({chatId, store, notify…}))
      :212                            <StreamingMessageStoreContext.Provider value={…}>
    → trace_chain.js:647              const { chatId, store } = useStreamingMessageStoreContext()
      :1954 / :1984                   ownerChatId={chatId}
    → memory_v2_trace_audit.js:269 → :353/:355/:358
        ├─ RefList → RefReader:90                    readContent({ownerChatId, …})
        ├─ MemoryV2CanonicalJournalReload:501-549    listEvents({ownerChatId: owner, …})
        └─ MemoryV2PendingReviews:734-782            listCandidates / listCandidateReviews /
                                                     listPromotions / listSpaces({ownerChatId: owner})
  ```

  **谁提供：`code-owner-chat-core`**（`chat.js` · `use_chat_session_state.js` · `chat-messages/**` 全在其边界）。**我端是纯 sink**：不推导、不回退、不接受调用方覆盖 —— `trace_chain.js` 里 `ownerChatId` 的 **唯一** 赋值来源就是 `chatId`，没有第二条 props 通道（E-0050）。

  ### 1.2 可不可靠 —— 可靠，且是 renderer 里可得的最强形式，三条独立理由

  **(a) 它与生产写侧用的是同一个值，是构造上的同一，不是巧合。** `use_chat_stream.js:11874` `const currentChatId = activeChatIdRef.current`，`:11985` `ownerChatId: currentChatId`。我端拿的是 `session.activeChatId`（同一个 hook 的 state），它与 `activeChatIdRef.current` 是同一 store 字段的 state/ref 两副本，由 `use_chat_session_state.js:346-412` 的 `reconcileStoreSnapshot` 统一对账。**`code-owner-settings` 的不确定性 3（`node.chatId` 与 `currentChatId` 是否同一 id 空间）在我这条链上不存在** —— 我根本不经过 `node.chatId`。

  **(b) E-0016 的多态值在我链上结构性不可达（E-0052）。** `buildCharacterMemorySessionId` 在全 `src/` 非测试代码中 **只有一个消费者**：`side_menu_context_menu_items.js:198`。那是 Inspector 的右键入口。character chat 在 chat store 里是一 **种** chat（`characterId` 是 **另一个字段**，`use_chat_session_state.js:228/383/464`），它的 `id` 就是普通 chat id。**所以 `character_foo__dm__main` 这种「语法合法、语义错误」的 owner，我端不可能拿到。** `code-owner-electron` 的丙(3)「main 层没有任何机制能挡住冒充」我完全接受 —— 那道门确实挡不住，**但我这条链不产生需要被挡的东西**。

  **(c) 三条性质全部被测试锁住（E-0051）。** `trace_chain.memory_v2.test.js` **自己搭 `StreamingMessageStoreContext.Provider` 并传 `chatId`**（`:50-71`），然后逐次断言 bridge 收到 `ownerChatId: "owner-chat"`（`:196,:205,:297,:302,:377,:456,:470,:483,:614,:681,:690`）；`:229-240` 断言 `chatId: ""` 时 **五个 bridge 方法一个都不调**、面板不渲染。**我端的 fail-closed 是被断言锁住的，不是约定。**

  ### 1.3 —— 但这条路径 Inspector 复用不了，这是我最该说的一句话

  我端拿得到好值的 **原因**，恰恰是我端的 **限制**：`StreamingMessageStoreContext` 在全 `src/` 只被创建一次（`components/streaming_message_store_context.js:18`）、只被 provide 一次（`chat_messages.js:212`）、其值来自 **当前活跃会话**。我的消费者物理上只能是「屏幕上这个会话」的。

  Inspector 的 side-menu 入口是 **对侧边栏里任意一个（很可能非活跃的）节点右键**。**没有任何 provider 覆盖那个场景，今天没有，也不该为此造一个。** 所以：

  > **「chat-bubble 已经拿得到，Inspector 照做就行」这个推论不成立。** 我端是「这个值在 renderer 里存在且形状正确」的实证；Inspector 需要的是 **挂载点显式传参**，即 `code-owner-settings` 的 N1 与 `0000-0003-2026-0807#S-0024` C4 已经写下的那条。**我的存在支持 N1，不替代 N1。**

  **一条附带的、方案庭审必须知道的差异（E-0056）**：我的三个消费者被 **双重门** 关着 —— `chat_bubble.js:107-108` 要求 `isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)`（即 **必须有一个已完成回合的 bundle 带 memory_v2**），`trace_chain.js:1936` 要求该 audit 存在，`:1950` `unmountDetailsWhenClosed: true` 使子树 **折叠即卸载**。**净效果：V2 关着的时候，我这三个消费者一次也不会挂载。** Inspector 没有这个门 —— 用户随时能点开。**这就是为什么「chat-bubble 今天没炸」不能推出「tree view 也不会炸」：我端从未在未启用态下被打开过。**

  ---

  ## 二 · 乙 —— Q4 的收端半边：我端今天封闭吗

  ### 2.1 直接回答：**不封闭。能不能区分「V2 未启用」与「有 store 但没数据」—— 不能。**

  结构上，`code-owner-shared-arteries` 的 E-0039 形状在我链上 **确实成立**：数据调用 resolve ⟺ 读发生了；reject ⟹ 没发生。我也确实为两者产出不同渲染（空态文案 vs 错误块）。**但「未启用」与「已启用但空」这一刀，我端切不下来**，三条硬事实：

  **(a) `context_v2_store_disabled` 在整个 `src/` 出现 0 次**（E-0053，可复跑）。renderer 里 **没有任何消费者**（我的、chat-core 的、settings 的）分支于它。它到得了我手上（E-0026 的码保真链），**但没有一行代码看它**。

  **(b) 我唯一的启用态门是 `contextV2Bridge.isAvailable()`，它是 preload 存在性探针，不是 store 状态探针。** 四个使用点：`journal_reload.js:516` · `trace_audit.js:79` · `pending_reviews.js:299,736`。**在出厂默认（`store_owner=off`）的 build 里，preload bridge 一样在，`isAvailable()` 返回 `true`。**

  **(c) 净效果：出厂默认态在我端被渲染成「报错」，不是「未启用」。**
  - `pending_reviews.js:1027-1044` —— 红色 `role="alert"` 块，正文是 `<code>{state.error.code}</code> · {message}`
  - `journal_reload.js:272-274, :574-578` —— `status: "Unavailable"`，副行 `journal_reload_failed · context_v2_store_disabled`

  开发者读得出，用户读不出 —— 对用户，它和「后端崩了」完全同形。**这正是 `code-owner-settings` 的 C1 所警告的塌缩，只是从相反方向到达：它警告「失败被归一成空」，我端是「未启用被归一成失败」。两个方向都塌。**

  ### 2.2 未知码落到哪 —— **四个去处，四种纪律，其中两个根本不解析码**（E-0053/E-0054）

  | # | 站点 | 纪律 | 未知码 / 无码错误的归宿 |
  |---|---|---|---|
  | 1 | `journal_reload.js:274` | `parseContextV2ErrorCode(error) \|\| "context_v2_journal_unavailable"` | 一个 **服务端零出处的自造码** |
  | 2 | `journal_reload.js:294` · `:521` | 硬编码 `"context_v2_unavailable"`（bridge 缺席） | 与 sidecar **11 个非测试点** 及 facade `:69-75` **三方碰撞** |
  | 3 | `journal_reload.js:391` | 硬编码 `"context_v2_invalid_cursor"`（**客户端自判**游标停滞） | 与 `memory_v2_store.py:3604` **字面碰撞、条件不同** |
  | 4 | `pending_reviews.js:179-186`（2 个 catch 用） | `code \|\| "context_v2_request_failed"` | 另一个 **服务端零出处的自造码** |
  | 5 | `trace_audit.js:120-129`（`readContent`） | **完全不解析**，`error.message.slice(0,1000)` | **裸线上串直接上屏** |
  | 6 | `pending_reviews.js:397-407`（`readContent`） | **完全不解析**，`boundedText(error?.message,700)` | **裸线上串直接上屏** |

  **对本庭点名的那个无码出口（`ensureMisoReady`，S-0010 戊(4)(a)）的直接回答**：`parseContextV2ErrorCode` 对它返回 `null`（E-0036 已证该正则对无 `[code]` 前缀的串返回 `null`），于是它在我端 **同时** 落成三种东西 —— 站点 1 里变成 `context_v2_journal_unavailable`、站点 4 里变成 `context_v2_request_failed`、**站点 5/6 里以字面英文 `Miso service is not ready (status=…, reason=…)` 渲染进 chat bubble**。

  > **最后一条是一个产品可见缺陷，且是内部服务代号的外泄。** 它在我边界内，我认领它是我的，本阶段只读不修。**并且它恰好发生在冷启动早期** —— `code-owner-electron` 戊(4)(a) 已指出这正是 Inspector 最可能撞上的那一态。

  ### 2.3 我因此完全支持 `code-owner-shared-arteries` 的 A4，并报告它低估了我端

  A4 说的失效模式是「`null` 被静默替换成一个看起来合理的默认码」。**我端六个站点里有两个连 A4 的失效模式都到不了 —— 它们从不调用解析器。** A4 应当写成：*未知码必须落第三态；**且每一个 `contextV2Bridge` 的 catch 都必须先过解析器**，不得直接消费 `error.message`。*

  ---

  ## 三 · 丙 —— `code-owner-settings` 说我端是四份里的两份，属实吗

  ### 3.1 逐条核对：2/3 属实，第三条是错的，而真相更糟

  | 其列举 | 判定 | 实情 |
  |---|---|---|
  | `journal_reload.js:513-521` 自造 `status:"Unavailable"` + `reason` + `errorCode` | **属实** | 且不止这一处：该词汇（`Loading`/`Complete`/`Partial`/`Unavailable`）在 `:272,:294,:309,:365,:377,:389,:403,:506,:519` 共 **9 个铸造点** |
  | `pending_reviews.js:181-187` `errorPresentation()` | **属实** | 且它其实是 **5 支渲染机**：`!available` / `loading&&!loaded` / `error` / `isEmpty` / 列表（`:1015-1050`） |
  | `memory_v2_trace_audit.js` | **不属实** | 它 **没有** 读平面的四态实现 |

  **第三条的真相**：`trace_audit.js:317` 的 `audit.status` 与 `:349` 的 `audit.errorCode` 是 **流式 trace bundle 的直通显示**，产自 `SERVICEs/runtime_events/memory_v2_trace_presenter.js:350`（`code-owner-shared-arteries` 边界），词汇是 `Complete/Partial/Legacy/Unavailable`，**回答的是「这一回合的 trace bundle 完不完整」，与 store 通不通毫无关系**。该文件唯一真正的 bridge 调用是 `:89` 的 `readContent`，而它的错误处理 **一个码都不解析**（§二站点 5）。

  > **所以它不是「第四份同样的东西」，它是「一个缺失的判定」+「同一个展开面板里的第三套 status 词汇」。** 这比多一份拷贝更难修，因为它长得像已经有答案了。

  ### 3.2 我端那几份是不是同一件事的重复实现 —— **不是。真正重复的在底下一层**

  三者答 **三个不同的问题**，各自的词汇都是合法的：

  | 面 | 问题 | 词汇 |
  |---|---|---|
  | `journal_reload` | 「**我这次** canonical journal 重读跑完了吗」（每次挂载一个 job） | Loading/Complete/Partial/Unavailable |
  | `pending_reviews` | 「有没有等你拍板的条目；取它的那次请求失败了吗」 | 5 支渲染机 |
  | `trace_audit`（presenter 轴） | 「这一回合产的 trace bundle 完不完整」 | Complete/Partial/Legacy/Unavailable |

  **它们重复的，是最底下那一层且只有那一层**：*「`contextV2Bridge` 抛了一个错 —— 它的码是什么，没有码意味着什么」*。**这一层在我端重复了六次、四种纪律**（§二表）。**这才是 D7 那个无主构件在我边界里的确切形状，而它比 `code-owner-settings` 描述的「四态机拷贝」窄得多、也具体得多。**

  ### 3.3 若落一个共享判定模块，我消费吗，代价多大

  **消费，无条件，代价小 —— 但只接窄口径。**

  **我接的口径**（= 我的约束 B2）：
  ```
  (error) → { code: string, kind: <闭集> , parsed: boolean }
  ```
  `kind` 只覆盖 **传输/启用** 这一维（bridge 缺席 / sidecar 未就绪 / 未启用 / 降级 / 未找到 / 参数非法 / **未知**），并对无码出口给出 **显式非 null 契约**。
  - **代价**：**六个调用站点，全在三个文件里，每处 ≤5 行**；顺带 **删掉两个自造码**（`context_v2_request_failed` · `context_v2_journal_unavailable`），并给站点 5/6 补上解析器。这是我愿意主动认领的量级。

  **我不接、且会以 `OBJECTION` 反对的口径**：任何 **同时** 决定 **用户可见状态词** 的模块。§3.2 的三个面有三套合法词汇；强行统一会把 journal-reload 轴压进 presenter 轴 —— **那正是我已在册的碰撞（三条轴共用 `Complete/Partial/Unavailable` 三个词指三件事），把它从缺陷变成强制。**

  **我不同意 `code-owner-settings` 归因的一处**：它主张「在 modal 里加 tree view 就是造第 5 份」，据此把它当作反对/前置的杠杆。**我端的证据指向相反的处方** —— 第 5 份之所以会长出来，不是因为 tree view，是因为 **底层那一件事从来没有 owner**；我这里在没有 tree view 的情况下已经独立长出了 **六份**。**所以它是「先建底层」的理由，不是「暂缓 tree view」的理由。** 我支持其建议 3 的顺序（(b) 先于 (c)），反对把它读成阻塞。

  ---

  ## 四 · Q2（G1）· 强制表态 —— 三种主张，我端今天一个都没在用

  **不接受「与我无关」，我不说这句话。**

  ### 4.1 我端今天实际在用的是什么（这是本节唯一的观察，其余都是判断）

  | 信号 | 我用不用 | 出处 |
  |---|---|---|
  | `contextV2Bridge.isAvailable()`（preload 存在性） | **用，4 处** | E-0053 |
  | 每次调用的 **resolve / reject**（= E-0039 的形状） | **用** | §2.1 |
  | 该 reject 的 **码** | **6 个站点里 4 个丢掉、2 个换成自造码** | §2.2 |
  | `contextV2Bridge.getStatus()` | **从未调用** | E-0035（其结论），E-0053（我独立复核） |
  | `unchainAPI.getStatus().memoryV2` | **不可达** | E-0055 |

  ### 4.2 对三种主张逐条技术表态

  **(1) `code-owner-shared-arteries`（`getTree` 单独一次调用就够）—— 就我端而言它是对的，但它描述的是「可得的信号」，不是「今天有人在用的信号」。**
  我跑的正是它那个形状（成败可分），**而缺的恰是它论证里最关键的第二半 —— 拒绝码**。E-0039 说「reject ⟹ 读没发生，且拒绝码说明原因」：前半在我端成立，**后半在我端 6 个站点里 0 个实现**。**我从消费端确认 E-0039 的结构，同时报告：今天没有一个消费者兑现它。** 这对本庭的意义是：把 A3/E-0039 写进裁定文本 **是必要的但不充分的** —— 它描述的是一条今天全渲染层都没走的路，落地要改的是消费者，不是 facade。

  **(2) `code-owner-electron`（`memoryV2` 已过 IPC 线）—— 构件存在我确认，但从 `src/COMPONENTs/**` 经任何合法路径不可达（E-0055）。**
  两道锁，缺一都到不了我手上：
  - `src/SERVICEs/api.shared.js:330-343` 的 `normalizeUnchainStatus` 重建 6 字段 `{status, ready, url, reason, pid, port}`，**`memoryV2` 被丢弃**（我实读，与 S-0010 乙(1) 逐字一致）
  - **`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` 的 import 数为 0**（E-0055）。要绕过 facade 就得在组件里直接摸 `window.unchainAPI` —— **本仓工程铁律禁止渲染进程组件直连 bridge 面之外的东西，我不做。**

  所以 `code-owner-electron` 的「暴露代价在我边界内等于零」对 **它的** 边界成立；**残余代价是 `code-owner-shared-arteries` 那约 6 行 + 一个 facade 方法**。我会消费它，**但只作为次要轴**：`memoryV2` 是 **进程全局** 的，我的三个消费者是 **per-`ownerChatId`** 的，它答不了「这个会话有没有数据」。**主判据仍必须是数据调用自身（(1)）。**

  **(3) `code-owner-settings`（无人拥有）—— 就「定义权」而言它是对的，我端六个站点就是证据。**
  三个文件、同一作者、四种纪律、两个自造码。**有 owner 的东西不会长成这样。**

  ### 4.3 本案若推进，是否会要求我的边界承担一个今天不属于我的判定职责

  **会 —— 而我的答案不是「别推给我」，是「它早就被默认推给我了，而且我做砸了，请拿回去」。**

  | 职责 | 今天在哪 | 本案推不推 | 我的立场 |
  |---|---|---|---|
  | 把 bridge 错误映射成码/类别 | **已经在我这里了，六份，无人授权** | 会强化 | **交出去。** 我消费共享模块，**不再自造码** |
  | 决定我三个面各自的用户可见状态词 | 我 | 不该推走 | **保留。** 三个面答三个问题，词不该统一（B2） |
  | 定义四态判据本身 | 无人 | 会试图推 | **不承接。** 归 `code-owner-shared-arteries`（其已认领）+ CEO 指派 |
  | 决定 tree view 长什么样 / 挂哪 | `code-owner-settings` | 不落我 | **不落在本边界**，指名 `code-owner-settings` 与 `expert-architecture` |
  | 为 tree view 提供数据路径 | —— | **可能会试图推给我**（因为「chat-bubble 已经在读 V2」） | **拒绝。** 见 §1.3 与 FB1：我的文件被 bundle 门 + 折叠卸载锁死，不能当通用 V2 浏览器 |

  ### 4.4 G1（前案裁定未到达）是否构成前置阻塞 —— **对可行性不阻塞；对我的实施承接阻塞一件事**

  §一~§三的每一条都是当前 revision 的代码事实，**不依赖前案任何裁定**。故本案可在 `0000-0003-2026-0807` 裁定前完成议案庭审。
  **唯一的届时阻塞**：若共享模块最终以宽口径（含用户可见状态词）落地，我按 B2 反对并拒绝在我边界内消费。**这不是现在的阻塞，是届时的；现在写下来是为了它届时不算意外**（与 `code-owner-settings` §3.3 同构，但我反对的对象相反 —— 它怕没有模块，我怕模块太宽）。

  ---

  ## 五 · 丙（框定第三条）· 可证伪形式 —— 我的「可行 + 0 改动」在什么条件下翻转

  **任一条成立即翻：**

  **FB1 · 若方案把 tree view 的数据路径、渲染或状态放进 `src/COMPONENTs/chat-bubble/**` 任何文件（含 `trace_chain.js`）。→ 不可行（就该切法）。**
  推翻依据：E-0056 —— 我的三个 V2 消费者被 `chat_bubble.js:107-108` 的 `bundle.memory_v2` 门 + `trace_chain.js:1936` + `:1950 unmountDetailsWhenClosed` 三重锁在「**一个已完成回合的审计块，展开才活，折叠即卸载**」这个语义里。把一个用户随时可开、与回合无关的浏览器塞进来，**会同时破坏流式渲染契约与 issue #168 的折叠卸载**。**谁能证伪**：方案庭审的实施切分文本。

  **FB2 · 若共享判定模块的口径包含用户可见状态词。→ 我 `OBJECTION` 并拒绝消费**（我三个面保留各自词汇）。**谁能证伪**：模块 API 面 —— 若其对外只暴露 `{code, kind, parsed}` 而不暴露供渲染的 `status` 串，本条不触发。

  **FB3 · 若有人主张「Inspector 照 chat-bubble 的做法拿 `ownerChatId`」。→ 不可行。**
  推翻依据：E-0050 —— `StreamingMessageStoreContext` 全仓 **一处创建、一处 provide**，其值恒为 **活跃会话**。**谁能证伪**：`code-owner-chat-core` 造出一个能携带非活跃 chat id 的 provider —— **今天不存在，且我不建议为此造。**

  **FB4 · 若我端的 prop 契约被改成接受调用方指定的 `ownerChatId`（而非恒等于 `chatId`）。→ 我立刻继承 `code-owner-settings` 的 F3 全部风险**（E-0016 的语法合法/语义错误 id 能穿过 main，`code-owner-electron` 丙(3) 已答「main 层挡不住」，G10 未核实）。**今天我对 F3 免疫，免疫的唯一来源就是这条 prop 契约。** **谁能证伪**：方案文本是否引入 owner 覆盖参数。**请本庭把这条记为我端唯一的、且可由一行代码引入的回归面。**

  **FB5 · 若本庭裁定两个自造码（`context_v2_request_failed` / `context_v2_journal_unavailable`）与两处码碰撞必须在本案推进前清除。→ 我的「0 改动」变成 6 个站点的改动。**
  我 **接受** 这个裁定（那是我的缺陷），但本庭须知道它把我从「无前置」变成「有前置」。**谁能证伪**：本庭对 E-0054 的处置。

  **FB6 · 若 G8 被关闭，且 `store_owner=unchain` 分支发出的错误 *不带* `[code] ` 前缀、或其码不符 `[a-z0-9_]+`。→ 我 §二 的全部结论塌成一句「所有错误都是 `context_v2_request_failed`」**，A4 的失效模式从「边缘」变成「全域」。**这是我这份评估里价值最高的开放项，而它整段不在我边界内** —— 归 `code-owner-runtime`（产端字符集，其请求 3 已在问）与 `code-owner-unchain`（`store_owner=unchain` 分支）。**谁能证伪**：任何人在 `unchain` 可导入的环境里跑一次真实 `getTree` 并记录 renderer 侧收到的 `error.message` 原文。

  **不会被推翻的（可作方案庭审地基）**：`ownerChatId` 在我链上单一来源、与生产写侧同一值、多态值不可达、空值 fail-closed —— 四条均被 `trace_chain.memory_v2.test.js` 锁住（E-0051）；`context_v2_store_disabled` 在 `src/` 零消费者（E-0053）；`memoryV2` 经 `normalizeUnchainStatus` 被丢弃（E-0055）。

  ---

  ## 六 · 留待方案庭审（自行标注，本阶段不作为结论）

  按 S-0001 范围纪律，下列属设计取舍，登记不主张：

  - **同一个展开面板里已有三套共用 `Complete/Partial/Unavailable` 的 status 词汇**（presenter 轴 `trace_chain.js:1941`/`trace_audit.js:317` · journal-reload 轴 `journal_reload.js:568-572` · curator 轴 `trace_chain.js:1969` 的 `Completed/Failed/Isolated/NoOp/Running/Pending`）。**再引入一个说「Unavailable」的面，会让这个面板更难读，不是更好读。** 技术事实在此登记；怎么消歧是设计。
  - **`getTree` 是十八个读方法里唯一无上界的一个**（`code-owner-electron` E-0032）。**我边界内有本仓唯一的 V2 读封顶先例**：`JOURNAL_RELOAD_PAGE_SIZE=500` / `JOURNAL_RELOAD_MAX_PAGES=20` / `JOURNAL_RELOAD_MAX_EVENTS=10000` / `mergeRefs .slice(0,512)` / `agentRuns .slice(-128)`（`memory_v2_journal_reload.js:6-8,353-372,480,257`），这是 issue #168 A 阶段的产物。**这段封顶逻辑可复用为 tree view 的参考，但那是设计选择。**
  - **V2 读平面今天零轮询**（`code-owner-shared-arteries` E-0040 已证，我确认）。我端不轮询的原因是折叠即卸载（E-0056）。tree view 若引入轮询会是第一个 —— A5 的限流纪律届时全在调用方。

- **边界命中依据**: `pupu:src/COMPONENTs/chat-bubble/**` —— **第三层提前执行**（S-0003 #7 / S-0006 六节）。本次作业实际触及本边界内 8 个文件：`memory_v2_journal_reload.js` · `memory_v2_pending_reviews.js` · `memory_v2_trace_audit.js` · `trace_chain.js` · `chat_bubble.js` · `components/streaming_message_store_context.js` · `trace_chain.memory_v2.test.js` · `chat_bubble.memory_v2_mount.test.js`。**跨界只读引用（不构成本边界主张）**：`pupu:src/PAGEs/chat/chat.js`、`hooks/use_chat_session_state.js`、`hooks/use_chat_stream.js`、`src/COMPONENTs/chat-messages/chat_messages.js`、`src/COMPONENTs/side-menu/side_menu_context_menu_items.js`（**全归 `code-owner-chat-core`**）· `src/SERVICEs/bridges/context_v2_bridge.js`、`src/SERVICEs/api.shared.js`、`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`、`src/SERVICEs/chat_storage/chat_storage_sanitize.js`（**归 `code-owner-shared-arteries`**）· `unchain_runtime/server/memory_v2_store.py`（**归 `code-owner-runtime`**）· `src/COMPONENTs/ui-testing/runners/*`（**归 `code-owner-devtools`**）—— 均只用于确定「到达我组件的值是什么、我发出去的值到哪」，结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案按 `code-owner-settings` 的切法（tree view 落 `memory-inspect/` 下新组件）推进，我边界内 0 处必须改动。** 这是我这一半的主要结论。
  - **条件性影响 1（仅当 FB5 成立 / 或共享模块落地）**：六个错误处理站点须改 —— `memory_v2_journal_reload.js:274, :294, :391, :521` · `memory_v2_pending_reviews.js:179-186, :397-407` · `memory_v2_trace_audit.js:120-129`。同时删除两个自造码。**每处 ≤5 行，我主动认领。**
  - **条件性影响 2（仅当 FB4 成立）**：`trace_chain.js:1954, :1984` 的 `ownerChatId={chatId}` 与三个文件的入参契约须重审，且需新增测试锁住 owner 覆盖路径。**我预先反对引入该参数。**
  - **测试面**：`trace_chain.memory_v2.test.js`（34220 字节，锁住 `chatId → ownerChatId` 全链与 fail-closed）· `memory_v2_journal_reload.test.js` · `memory_v2_journal_reload.performance.test.js` · `chat_bubble.memory_v2_mount.test.js` —— **任何改动这四份都要一起动**，且注意其 fixture 建在 **旧 store 的嵌套 payload 形状** 上（不确定性二）。
  - **无影响**：`trace_chain.js` 的工具帧/流式 markdown/`interact`/`artifact-summary` 全部路径。本案不触及。

- **约束**:
  1. **B1 · tree view 不得落在 `src/COMPONENTs/chat-bubble/**`。** 我的文件被 `bundle.memory_v2` 门与折叠卸载锁在「回合审计块」语义里（E-0056）。**有人要求把它放进来，我以 `OBJECTION` 反对**（FB1）。
  2. **B2 · 共享判定模块的口径必须止于 `(error) → {code, kind, parsed}`。** 不得包含用户可见状态词。理由：我三个面答三个不同问题，各自词汇合法；统一词汇会把我已在册的三轴碰撞从缺陷变成强制（FB2、§六第一条）。
  3. **B3 · 不得在我端引入调用方可覆盖的 `ownerChatId` 参数。** 我今天对 `code-owner-settings` F3（静默错主）免疫，**免疫的唯一来源就是「`ownerChatId` 恒等于 provider 的 `chatId`」这条 prop 契约**（E-0050/E-0052）。破坏它等于把一个 main 层已确认挡不住的风险（E-0024 丙(3)）引进 chat-bubble（FB4）。
  4. **B4 · 每一个 `contextV2Bridge` 的 `catch` 都必须先过 `parseContextV2ErrorCode`，不得直接消费 `error.message`。** 这是我对 `code-owner-shared-arteries` A4 的加强 —— 我端两个站点连 A4 的失效模式都到不了，它们从不调用解析器，直接把线上串上屏（§2.2 站点 5/6）。
  5. **B5 · 渲染层不得再自造服务端不存在的错误码。** 我端已有两个（`context_v2_request_failed` · `context_v2_journal_unavailable`），另有两处与服务端字面碰撞（`context_v2_unavailable` · `context_v2_invalid_cursor`）。**新增消费者一个都不许再造。** 需要新码时按单向契约向产帧端提议 —— 那是跨面契约变更。
  6. **B6 · 任何以「chat-bubble 三个 V2 消费者测试全绿」为据的可行性论证一律无效。** 该测试套把 `context_v2_bridge` 整个 mock（`trace_chain.memory_v2.test.js:28-44`），且 fixture 建在生产适配器不产出的载荷形状上（不确定性二）。**绿测试在这个面上不是可用性证据。**

- **建议处置**: **判为「可行」并进入方案庭审。我这一侧不设前置阻塞，也不认领本案任何新工作。** 四条建议，按重要性排序：
  1. **改写「零消费者」更正的措辞**（请求 1）。`FRAMING` 甲 现在的写法会诱导方案庭审去复用一条不存在的路径。正确的可判定形式是：*chat-bubble 在活跃会话的消息列表内拿得到；Inspector 的两个挂载点都不在那个 provider 内；因此 N1（挂载点显式传参）仍是唯一处方。* **这是我作为「实证的那一半」被传唤过来最该纠正的一件事。**
  2. **把共享判定模块的 *口径* 与 *落点* 一起裁**（请求 2）。`code-owner-shared-arteries` 已认领落点（S-0011 Q2 的 P1/P2/P3），我支持；**但口径不定，对我边界是净损失**。裁定文本请含 B2。
  3. **把 A3/E-0039 写进裁定文本时加一句「今天没有消费者兑现它」。** E-0039 描述的是可得信号，**我从消费端确认结构成立、同时报告 6/6 站点未实现**。只写 A3 不写这句，方案会以为「照现状做就行」。
  4. **把 G8 升级为对本案 Q4 的 *共同* 阻塞项，而不只是 runtime/unchain 的缺口**（FB6）。S-0009 已把它记为 Q1/Q4 的证据地板；我从收端补一句：**我的码处理是否封闭，完全取决于那条从未被观察过的分支发出什么。** 三人跑不了，那就需要一次真机取证 —— 这是本案剩下的、最便宜也最决定性的一次实验。

---

#### S-0019 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **`expert-llm` 派遣失败，硬配额耗尽。quorum 现为 8/9，依 [quorum 第二节](../../../codex/lifecycle/quorum.md) 本案不得闭庭。** 且依 `0000-0003-2026-0807#R-0001` 第二节，**本庭无权自行以其他模型重新派遣** —— 那正是该裁定逐字禁止的「代为推断扩大」。本条登记失败、划定本庭权限边界、并向 `chief-judge` 呈报三条路径
- **依据**: E-0057, 0000-0003-2026-0807#R-0001, 0000-0003-2026-0807#E-0116, S-0006
- **不确定性**: 本庭 **未重试**，故不主张该配额永不恢复（见 E-0057 完整性限制）。**本庭亦不主张 `expert-llm` 的意见会改变本案结论** —— 那是实体判断，不归本庭
- **请求/下一步**: **请 `chief-judge` 就下列三条路径择一裁定。** 在裁定归档前，本庭 **不闭庭**、**不提交 `SUMMARY` 的最终版**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T19:20:00-07:00
- **影响范围**: 本案 quorum 与闭庭条件

  **一 · 事实（证据为 E-0057，本庭直接收到的结构化通知原文）**

  `expert-llm` 的 charter frontmatter 写死 `model: fable`（本庭已核：`.claude/agents/expertise/expert-llm.md:4`）。本庭 **未在派遣时显式指定模型**，故其按 charter 默认取 Fable 5，随即以硬配额耗尽终止，**零产出**。

  **本庭的过失部分，先自陈**：`0000-0003-2026-0807#R-0001` 已确立「派遣方须在派遣时显式选模型、不得依赖 frontmatter 默认值」这一操作纪律 —— **但该纪律在文本上只约束 `expert-architecture` 一个角色**。本庭派遣 `expert-llm` 时未显式指定模型，**在文本上并不违规**；然而 R-0001 的教训本可跨角色借鉴，本庭 **没有借鉴**。这一条本庭认账。

  **二 · 但纠正它超出本庭权限，这是本条的要害**

  `0000-0003-2026-0807#R-0001` 第二节逐字规定：

  > **撤销范围严格限于 `expert-architecture` 一个角色。** `expertise/` 部门其余仍写死 `model: fable` 的角色（`expert-security`、`expert-qa`、`expert-llm`）**未被触及**，`Chief Judge` **没有** 把本裁定扩及整个部门；**任何角色不得代为推断扩大。**

  **本庭若以 `model: "opus"` 重新派遣 `expert-llm`，即是该条逐字禁止的行为。** 本庭 **不做**。

  **这也不属 `procedural-judge` 的授权范围** —— 其五项授权事项（受质疑的内部证据 · non-blocking side case 开立 · 常规复议 · track 升档 · `Witness` 传票的 blocking 性质）**均不含模型指派**。故本项 **只能由 `chief-judge` 裁定**。

  **三 · 三条路径（本庭列举，不推荐，不排序）**

  1. **比照 R-0001 授权 `expert-llm` 在非 Fable 模型出庭。** 代价：`chief-judge` 须再作一次单角色撤销；收益：本案可闭庭。**本庭提请注意，这将是同一撤销的第二次单角色重复** —— 是否改为部门级处置，属 `chief-judge` 的取舍，本庭不代拟。
  2. **明示 `expert-llm` 无需到场**（[quorum 第四节](../../../codex/lifecycle/quorum.md) 的唯一减员通道）。代价：Q3 的转化形态「该不该为 V2 造一套投影」**本案无人作专业判断**，须作为已知缺口随裁定材料上呈。
  3. **等待配额恢复。** 前案实测 **并发度 1、等待 40 分钟后仍触发**（`0000-0003-2026-0807#E-0116`），故本路径的期望代价未知且可能无界。

  **四 · 一项本庭作出的、须备查的判定：E-0057 不路由 `evidence-examiner`**

  E-0057 属 **须查类**（一次性运行时观察），按[证据规则第三节](../../../codex/lifecycle/evidence-rules.md) 本应强制审查。**本庭判定不路由**，理由：**该证据在物理上不可由第三方复跑** —— 复跑意味着再发起一次派遣，即再消耗一次配额，且观察对象（配额状态）随时间变化，第二次观察无论结果如何都无法证成或证伪第一次。其真实性由通知原文的 **结构化字段** 承载，本庭是该字段的直接接收方。

  **本庭明确声明：这是一项裁量，而本庭对证据审查本就不该持裁量权**（[证据规则](../../../codex/lifecycle/evidence-rules.md) 开篇即言）。故本庭 **把这项判定连同其理由一并交 `codex` 审查**，并请 **一并处置一个更一般的问题**：**「运行时故障通知」这一类证据在四类分级中没有位置** —— 它既非自证（不可复现）、非传闻（本庭是直接接收方）、非证言（无 `Witness`），归入须查类后又撞上「审查手段本身会改变被观察对象」。**前案 `0000-0003-2026-0807` 已知缺口 7 记载「A-012 无法区分三种失败签名」仍开**，本条与之同源。

  **五 · 本庭在前案同类情形下的失范，本条主动引以自警**

  前案 `0000-0003-2026-0807#S-0018` 中，主持人曾 **在零观测下断言失败成因并逐字捏造错误串**，经 S-0019 撤回、S-0020 替代，且 `chief-judge` 明确 **不予追认** 其「内容碰巧正确」。

  **本庭本次的处置与之相反且刻意**：E-0057 的正文是本庭 **直接收到的通知原文逐字照录**，未作任何重构；「与前案签名相同」这一判断是 **两串文本的机械对照**，非回忆；「配额是否会恢复」本庭 **未观测，故不主张**，并把「未重试」写进证据的完整性限制。

#### S-0020 | ASSESSMENT | evidence-examiner → E-0051

- **阶段**: 议案庭审
- **结论**: 命令已按登记逐字复跑，输出完全一致，12 处引用行号全部逐字核对属实 —— **产物真实性无瑕疵**。但登记所声称的「三条性质**全部**被测试锁住」经逐条核实为 **1/3 属真断言，2/3 属推断**：「单一 provider」与「单一挂载点」在四个 suite 中 **没有任何对应断言**，它们是可由 grep 独立证明的结构事实，被并入了一条 `tool-output` 证据的射程。其对 **正向** 主张（Q1「A 处拿得到」）只支撑「链路形状完整」这一层，不支撑「值的真实取得」；对 **反向** 主张（「Inspector 不可复用此路径」）**零支撑** —— 该否定命题的承重前提恰是未被断言的那条性质。
- **依据**: E-0051
- **不确定性**: (1) 「单一挂载点」一语的确切所指未在登记中定义；我按两种读法各判一次（详见可靠性 §2），两种读法均不由本次运行支撑。(2) 我 **未** 就「Inspector 是否真的不可复用该路径」作任何实体判断 —— 该问题归 `code-owner-chat-core` / `code-owner-chat-bubble`，不归本席。(3) 提交方登记的 fixture 形状失配（完整性限制 (3)）我未复核，其自身已声明为传闻类且不用于证明事实，本席照此对待。
- **请求/下一步**: 请本庭 **将 E-0051 的射程收窄** 至其实际证明的命题（见下），并将「单一 provider」「单一挂载点」**拆出另立自证类 grep 证据** —— 二者以 grep 形式多半可独立成立，但不得继续借本次测试运行的「全绿」背书。反向主张若仍需保留，须由提出方另行举证。本条属 **内部来源且射程存在争议**，依证据规则第五节末段，争议部分请路由 `procedural-judge`。
- **评估结论**: 未验证
- **证据编号**: E-0051
- **来源类型**: general

---

**真实性** —— **通过，无保留。**

复跑环境与登记一致：`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`，`git status --porcelain src/COMPONENTs/chat-bubble/` 为空（受测目录无未提交改动）。

按登记命令逐字复跑，输出：

```
Test Suites: 4 passed, 4 total
Tests:       23 passed, 23 total
Snapshots:   0 total
```

与登记完全一致。仅两处非实质差异：`Time` 为 0.946s（登记 2.221s）、四个 `PASS` 行打印顺序不同 —— 均为 jest 并行调度产物，不影响结论。

**命令形态合规**：登记用 `npx react-scripts test`，即本仓 `package.json:72` 的 `test` 脚本本体，**不是** 被工程铁律禁止的 `npx jest`。本席特此确认提交方未踩该坑。

**引用锚点逐条核对（12 处，全部属实）**：`:28-44` `jest.mock("../../SERVICEs/bridges/context_v2_bridge")` 确以 11 个 mock 方法整体替身（`parseContextV2ErrorCode` + `default` 下 10 个），登记的「11 个」计数准确 · `:50-71` `renderMemoryTrace` 确自搭 `StreamingMessageStoreContext.Provider value={{chatId, store, notifyStreamingContentCommitted}}` · `:196,:205,:297,:302,:377,:456,:470,:483,:614,:681,:690` 逐行读取，**每一行确为 `ownerChatId: "owner-chat"`** · `:229-240` 确为完整的空值用例。无一处虚构或错位。

---

**可靠性** —— **形态受限，且登记的三条性质仅 1 条有断言。**

**§1 运行形态**：jest + jsdom，`context_v2_bridge` 被 **整体替换为 11 个 `jest.fn()`**，`icon` 亦被 mock。未起 Electron、未起 sidecar、未过 IPC、未发真实请求。故其观察面 **严格限于 React 树内部布线**：context 值 → props → 门面调用参数。对门面之下的任何环节零证明力。提交方在完整性限制 (1)(2) 中主动声明了这一点，本席复核 **属实且措辞准确**，此点值得记录。

**§2 逐条核实「三条性质全部被测试锁住」** —— 本庭特别要求，故逐条作答：

| 性质 | 是否有对应断言 | 核实结果 |
|---|---|---|
| **单一 provider** | **否 —— 推断** | 测试 **自建** provider（`:50-71`），provider 是 **测试输入（脚手架）**，不是被断言的输出。四个 suite 中无任何断言涉及「应用中存在几个 provider」。底层事实看似为真，但由 **另一种方法** 证明：grep 得非测试 provider 仅一处 `src/COMPONENTs/chat-messages/chat_messages.js:212`。那是 **自证类 grep 证据**，不是本次运行的产出。 |
| **单一挂载点** | **否 —— 推断，且字面读法与仓库现状不符** | `chat_bubble.memory_v2_mount.test.js` 全文仅 2 个 test，**正向** 断言两处挂载（`ChatBubble`→`lazy_trace_chain`、`CharacterChatBubble`→`trace_chain`）各自收到 `bundle.memory_v2`，**对穷尽性零断言** —— 穷尽性本就不是该 suite 能建立的命题类型。而 grep 得非测试 `<TraceChain` 挂载点 **不少于 5 处**：`character_chat_bubble.js:160,183`、`chat_bubble.js:124,147`（经 lazy）、`trace_chain.js:1461`（自递归），**外加两处 dev-only 挂载 `ui-testing/runners/trace_chain_runner.js:222` 与 `interject_runner.js:301`，二者位于 `chat_messages` provider 之外**。若采宽容读法（指「`chatId` 的单一消费点」`trace_chain.js:647`），那同样是 grep 事实，非测试事实。 |
| **空值 fail-closed** | **是 —— 真断言，但作用域小于「fail-closed」整体** | `:229-240` 为真实断言：`chatId: ""` 时五个 list 类调用 `not.toHaveBeenCalled()` 且 `queryByTestId("memory-v2-pending-reviews")` 不在文档中。**但**：全 suite 仅此 **一个** `chatId: ""` 用例，且它 **未** 断言 `mockReadContent` 被拦下。`readContent` 的空值守卫确在代码中（`memory_v2_trace_audit.js:77-78`，`ownerChatId.trim().length > 0`），但那又是 grep 事实，非本次运行所证。 |

**§2 小结**：**3 条中 1 条被真正锁住，且该条的射程窄于「fail-closed」这一整体表述；另 2 条是可由 grep 独立证明的结构事实，被折叠进一条 `tool-output` 证据后，借用了测试「全绿」作为背书，而测试对它们零证明力。**

**§3 来源独立性**：由提案方 code owner 在 **自己边界内** 编写、并由其自行发起的一次性运行，被测依赖被自己 mock 掉。这不构成造假嫌疑，但意味着 **无外部独立性**。

---

**相关性** —— **正向：部分支撑（弱于所称）。反向：不支撑。**

**正向主张**（「这个值在 renderer 里确实存在且可靠」，Q1「A 处拿得到」那一半）：**中等偏弱**。

它确实锁住了一件真事：当 context 中存在 chatId 时，`TraceChain` 会把它以 `ownerChatId` 之名、以精确的参数形状转发给门面 —— 12 处调用点一致。但必须指出它 **结构上无法** 证明的那一半：**该值是测试自己喂进去的**。测试从未展示这个值是从任何真实来源 **取得** 的。生产中的 provider 是 `chat_messages.js:212`，那里的 chatId 是否被正确填充、是否非空、是否指向对的会话，**完全在本次运行的观察面之外**。故其支撑的是 **「context→门面的管道形状完整」**，不是 **「值的真实取得」**。Q1「A 处拿得到」若指后者，本条不构成其「唯一实证」。

**反向主张**（「它端不是 Inspector 可复用的路径」）：**零支撑**。本庭的提示成立，且有三条独立理由：

1. **命题形态**。「该路径对任意（可能非活跃）节点不可用」是关于 **被测配置之外** 会发生什么的断言。该 suite 始终在一个恒定供给 chatId（或 `""`）的 provider 下渲染 `TraceChain`；**从未建模 side-menu 右键、从未渲染任何 side-menu 代码、全文不含 side-menu**。在配置 X 中跑绿 23 个测试，无法建立「配置 Y 会失败」。
2. **其承重前提未被断言**。该反向论证压在「只能在当前活跃会话的消息列表里挂载」之上 —— 这恰是上表第 2 条，本席已核实 **无任何断言**，且其字面形态被两处 provider 之外的 dev-only 挂载点所反证。前提不由 E-0051 承载，结论自然不由 E-0051 承载。
3. **即便让渡该前提**，从「只挂在活跃列表下」推到「Inspector 不可复用」，是一个关于 **provider 的值来源** 的架构论证，其事实基础位于 `chat-messages` / `chat-core` 边界内，**不在本次运行观察到的任何东西里**。

需明确：本席 **不主张该反向命题为假** —— 它很可能为真。本席只判定：**建立它的不是这条证据**。

**关于本案已出现五次的模式** —— 本席按证据本身独立判断，未以模式预设有问题。判定：**是，E-0051 重复了「被引用的范围宽于实际证明的范围」，但程度轻于前五条，且成因不同。** 其登记正文对自身局限的四条声明异常诚实，经本席逐条核实 **全部属实**（jsdom/整体 mock/无 IPC/单次未重复）。问题不在登记正文，而在 **引用它的那句话**——「三条性质全部被测试锁住」这一概括，宽于 `:229-240` 这唯一一条真断言。

**本条实际证明的命题（建议本庭据此收窄）**：

> 在 `b2385d5d`、`context_v2_bridge` 被整体 mock 的 jsdom 环境下，`TraceChain` 将 `StreamingMessageStoreContext` 的 `chatId` 以 `ownerChatId` 之名、以既定参数形状转发给该门面；当该 `chatId` 为空串时，五个 list 类门面调用不被发出且待审面板不渲染。

此命题 **已验证**。超出此范围的一切 —— 包括「单一 provider」「单一挂载点」「Inspector 不可复用」—— **不由本条支撑**。

---

- **来源归类**: **内部来源**（提案方 code owner 在自身边界内编写并自行运行的单元测试，被测依赖由其自行 mock；非权威外部来源，亦非不可靠外部来源）

#### S-0021 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **E-0051 经复核为「未验证」，这是本案第一条未通过的证据，触发[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)与[闭庭门禁第 11 项](../../../codex/lifecycle/speech-protocol.md)的处置。** 本庭据此作四项处置，并 **明确不做** 第五项
- **依据**: S-0020, E-0051, E-0050, S-0018
- **不确定性**: 本条 **不判断** S-0018 的实体结论是对是错。复核否定的是 **一条证据与一个命题之间的关系**，不是那个命题本身
- **请求/下一步**: 补强责任依[证据规则第一节](../../../codex/lifecycle/evidence-rules.md)归 **提出方 `code-owner-chat-bubble`**；本庭 **不代为补强，亦不代为撤回**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T20:05:00-07:00
- **影响范围**: S-0018 中依赖 E-0051 的主张；`SUMMARY` 的排布；闭庭条件

  **一 · 未通过的究竟是什么（本庭须精确转述，否则会被读成比实际更重或更轻）**

  E-0051 的 **产物真实性无瑕疵**：命令逐字复跑、输出完全一致、12 处引用行号全部属实。**未验证的是它与所声称命题之间的关系** —— 登记称「三条性质 **全部** 被测试锁住」，实为 **1/3 属真断言、2/3 属推断**：

  | 性质 | 四个 suite 中是否有对应断言 |
  |---|---|
  | 空值 fail-closed（`chatId: ""` → 五个 bridge 方法零调用） | **有**（`trace_chain.memory_v2.test.js:229-240`） |
  | 单一 provider | **无任何断言** |
  | 单一挂载点 | **无任何断言** |

  后两条是 **可由 grep 独立证明的结构事实**，被并入了一条 `tool-output` 证据的射程。

  **二 · 四项处置**

  1. **S-0018 中「三条性质全部被测试锁住」这一表述，丧失 E-0051 所提供的证明力。** 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)，本庭 **不删除、不改写该发言**，只在 `SUMMARY` 中标注其该项依据已失效。
  2. **区分两个方向，因为复核结论对二者不同** —— 对 **正向** 主张（Q1「A 处拿得到」）E-0051 仍支撑「链路形状完整」；对 **反向** 主张（「Inspector 不可复用此路径」）**零支撑**，而该否定命题的承重前提恰是那条未被断言的性质。**S-0018 请求 1（要求本庭改写 `FRAMING` 甲 的措辞）正是建立在该反向主张上。**
  3. **本庭因此 *不* 执行 S-0018 请求 1 所要求的改写。** 该请求要本庭把「chat-bubble 今天就拿得到 `ownerChatId`」改写为一个更窄的形式，理由是其反向主张。**该反向主张的证据基础刚被判未验证。** 本庭改与不改都不合适 —— 改，等于采纳一个证据未过关的命题；不改，等于无视一名必到者的正式请求。**故本庭两者都不做，而是把该请求连同复核结论一并原样上呈 `chief-judge`**，由其决定。
  4. **本项复核结果必须显式呈给 `chief-judge`**（证据规则第六节明文，且 **不得以「其他证据仍能支持同一结论」为由略去** —— 是否仍能支持，是裁决者的判断，不是本庭的）。

  **三 · 本庭 *不* 做的第五项，及其理由**

  审查人指出那两条性质「可由 grep 独立证明」，而 **提出方自己另有一条 `自证类` 证据 E-0050 恰好就是那份 grep**。本庭 **看得出这条补强路径，但不代为执行**：

  > 本庭若自行把 S-0018 的依据从 E-0051 改挂到 E-0050，即是 **代当事人补强证据** —— 那是提出方的举证责任（[证据规则第一节](../../../codex/lifecycle/evidence-rules.md)），不是主持人的归档动作。**主持人替一方把证据挂对，与主持人替一方把话说圆，是同一种越界。**

  故本庭只登记该路径存在，供 `code-owner-chat-bubble` 或 `chief-judge` 取用。

  **四 · 闭庭效力**

  依[闭庭门禁第 11 项](../../../codex/lifecycle/speech-protocol.md)，承重证据复核为未验证的，**受影响项须重排，且不得闭庭直至重排完毕**。本案 **本已因 quorum 8/9 不得闭庭**（S-0019），故本条 **不新增阻塞**，但为闭庭增加一项独立的前置：**S-0018 的受影响项须由提出方补强或由 `chief-judge` 处置**。

  **五 · 一项本庭对自己的观察，一并留痕**

  本案至今 **七条证据经 `evidence-examiner` 复核，六条「已验证」、一条「未验证」，而七条 *全部* 被判定「被引用的范围宽于实际证明的范围」**（S-0016 第二节已就前五条记过同一模式）。**E-0051 与前六条的差别不在于它更差，而在于它的越界跨过了「已验证」与「未验证」之间那条线。** 本庭提请 `chief-judge` 注意：**这条线的位置由审查人逐条判定，而本案的样本显示该模式是系统性的** —— 若以同一严格度重审前六条中的某些，结论未必稳定。**本庭不主张重审**（那需要新的触发条件，且会无限递归），但认为该事实必须与七份审查结论一同呈上。

#### S-0022 | ASSESSMENT | evidence-examiner → E-0049

- **阶段**: 议案庭审

- **结论**: **已验证。** 复跑逐字命中：同 revision、同工作树状态、同命令、同输出（2 suite / 54 test / 0 snapshot / 退出码 0）。提交方登记的跑法 **是本仓正确跑法**（`react-scripts test`，非 `npx jest`），铁律不被触犯。同批 grep 的行级事实经复跑全部为真，其承重结论（两个标识符在 `src/COMPONENTs/side-menu/` 之外零命中、`electron/` 零命中）确认成立。**保留两点，均不改变可采性，但限定该证据可被引用的范围**：**(一)** 该运行是 **改动前的基线**，对「新增 prop 破坏面为零」这一前瞻性命题的独立证明力为 **零**，且本条即使在改动后重跑也 **对该改动近乎不敏感**（见可靠性）；**(二)** 「54 绿」的内部构成 **未在条目或 S-0017 任何处披露**：54 中 **47 条属 `use_chat_stream.turn_mutation_v2.test.js`**，而该 suite 恰是 S-0017 自己在「受影响对象」里列为 **无影响** 的；真正落在挂载接口那一侧的是 **7 条**，其中触及 `onInspectMemory` 的是 **1 条**。

- **依据**: E-0049

- **不确定性**:

  **一 · 我不对 C4、F1 或 side-menu 那一路的可行性持任何立场。** 下文凡涉及 F1 之处，只作一项 **范围事实认定**（E-0049 的内容是否落在 F1 两个析取支上），不评价 F1 成立与否 —— 那是本庭与 `Chief Judge` 的事。

  **二 · 我未核验 E-0042。** 「测试从不断言 `onInspectMemory` 的调用参数」这一读解是 E-0042 的主张。我为评估本条的敏感度而读了 `side_menu_context_menu_items.test.js:285` 一段，读到的与该主张一致，**但这不构成我对 E-0042 的审查结论**，E-0042 应另行处置。

  **三 · 我未跑全量回归，也未跑 `npm run test:electron`。** 提交方在完整性限制 (1)(2) 已自陈未跑；我的职责是核验其登记内容为真，不是替其补做未登记的运行。

  **四 · 一处引用瑕疵我确认但认为无害。** 完整性限制 (4) 写「依 A-012，本条不作为『实施后一定安全』的依据」。我查了 [A-012](/Users/red/Desktop/GITRepo/PuPu/.claude/codex/adaptations.md#a-012--运行时故障不得记为阻塞记录)：该条管的是 **运行时故障记录与阻塞记录不得混计**，以及 **必到角色不得派生勘察子 instance**，**其中并无任何关于「基线证据可作何用」的规则**。故该引用 **不支持它所附着的命题**。但其自设的限制本身 **正确、且严于任何规则的要求**，对本庭只减不增负担 —— 我记为 **标错法条依据的正确自我限缩**，不作为减分项。

- **请求/下一步**:

  1. **请本庭把 E-0049 拆成两半分别计效力，不要整条引用。** 它是 **一条编号下的两件东西**：一次 jest 运行 + 一批 grep。二者回答的问题不同、范围不同、证明力不同。**grep 半边落在范围内，可照常引用**；**运行半边只能用于「b2385d5d 未修改工作树上这 2 个 suite 为绿」这一句**，不得再承担别的。
  2. **请本庭在采纳时把「54」这个数字换成「7」。** 若某处需要一个数字来表达「挂载接口一侧的既有测试覆盖」，正确的数字是 **7**（且其中触及 `onInspectMemory` 的是 1 条）。**「54」在任何指向挂载接口的语境里都是按构造高估的**。这一构成事实此前不在案卷内，我据复跑补入。
  3. **请本庭知悉一项范围认定**：E-0049 **不承重于 F1**（理由见相关性第 4 点）。据此，本条无论作何处置，**F1 的证据态势不变** —— 这不是说 F1 成立或不成立，而是说 **F1 的成败不落在这条证据上**，本庭据以裁量时不必把二者绑定。
  4. **一条超出 E-0049、但本庭点名让我核实故据实回报的**：S-0015 的双 worktree 根隐患 **对本条不成立**（本条结构性免疫，见真实性第 4 点），但 **对 `npm run test:electron` 仍然成立** —— 该 script 的 `--testMatch="**/electron/tests/**/*.test.cjs"` **不带 roots 限制**。本案若后续出现依赖该 script 的聚合数字，那条隐患需要单独核。**我不就此立案，只登记。**

- **评估结论**: 已验证

- **证据编号**: E-0049

- **来源类型**: general

- **真实性**: **确认，逐项命中。**

  1. **revision 与工作树状态属实。** `git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`，与登记一致。`git status --porcelain -- src electron unchain_runtime` = **0 行**，登记的「三目录零改动」为真。（全仓另有 `.claude/` 下的脏文件，但登记原文即限定于这三个目录，故属实而非避重就轻。）

  2. **跑法是本仓正确跑法。** 登记命令为 `CI=true npx react-scripts test --testPathPattern=… --watchAll=false`。本仓铁律要求前端用 `react-scripts test`、禁止直接 `npx jest`；`package.json` 的 `test` / `test:frontend` 亦均为 `react-scripts test`。**登记命令合规，未触犯铁律，也未因此产生 import 错。**

  3. **输出逐字复现。** 我原样复跑，得：

     ```
     PASS src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js
     PASS src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js

     Test Suites: 2 passed, 2 total
     Tests:       54 passed, 54 total
     Snapshots:   0 total
     ```

     **退出码 0**（另次带 `$?` 捕获确认）。与登记 **完全一致**，仅 `Time` 不同（1.351s vs 登记 2.344s），属正常抖动。

  4. **本庭点名的 worktree 污染：不成立，且是结构性免疫。** 本条 **不涉及 `electron/tests/`**，未跑任何 `.cjs`（提交方在完整性限制 (2) 已自陈未跑 `npm run test:electron`）。`react-scripts test` 将 jest `roots` 钉死在 `<rootDir>/src`，两个 worktree 根（`.claude/worktrees/` 与 `.worktrees/`）**均不在该 root 之下**。实证：`.claude/worktrees/*/src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js` **实际存在 12 份陈旧副本**，而本次运行只收集到 **2 个 suite，两个都在主 `src/` 下**。**故 54 未被 worktree 重名副本灌水。**

  5. **同批 grep：行级事实全真，计数标签有两处小瑕。** 我原样复跑两条 grep：
     - **承重结论确认为真**：`buildSideMenuContextMenuItems` 与 `onInspectMemory|handleInspectMemory` 的 **产品命中全部落在 `src/COMPONENTs/side-menu/` 内，`electron/` 下零命中**。
     - `onInspectMemory|handleInspectMemory`：登记「产品 5 处 …（+444 依赖数组）· 测试 1 处 :285 · electron 零命中」—— 实测产品 6 行（`side_menu_context_menu_items.js:19,207,223` + `side_menu.js:296,433,444`）、测试 1 行、electron 0 行，**与登记（5 + 依赖数组 1）完全吻合，标注诚实**。
     - `buildSideMenuContextMenuItems`：登记「产品 2 处 · 测试 7 处」。实测总命中 11（产品 3 行：`:11` 定义、`side_menu.js:25` import、`side_menu.js:425` 调用；测试 **8** 行：1,33,64,123,172,226,277,379）。**「产品 2 处」旁却列了三个行号**（计数把 import 行排除在外而未说明）；**「测试 7 处」实为 8**，差一。两处均为 **计数标签口径问题，被列举的行号本身准确**，且不触及该 grep 的承重结论。**不足以构成相矛盾，登记为瑕疵。**

  6. **一处引用不实**：完整性限制 (4) 对 A-012 的援引，见「不确定性 四」。

- **可靠性**: **内部来源。一手、确定性、任何角色可独立复现（我已复现）。但对其所支撑的前瞻性命题，证明力为零，且该运行对本案争议的改动近乎不敏感。**

  按本庭所问，逐层作答：

  **第一层 —— 基线是对照测量，不是安全证明。** 该运行的全部逻辑内容是一句话：*「在 b2385d5d、未修改的工作树上，这 2 个 suite 通过。」* 而「新增 prop 破坏面为零」是一个 **关于尚未发生的改动之后的行为** 的命题。改动前的绿只能提供一个 **让未来的差分可被解读的前提** —— 若改动后转红，基线使人可把红归因于改动而非既有失败。**但本条没有取那个差分**（改动尚未发生）。差分的一端缺席时，**基线对前瞻性命题的独立贡献是零**，不是「弱」而是「无」。

  **第二层 —— 更要紧的是仪器分辨率：即便改动后重跑，本条也几乎测不到这个改动。** 我拆跑了两个 suite：

  | suite | 测试数 |
  |---|---|
  | `side_menu_context_menu_items.test.js` | **7** |
  | `use_chat_stream.turn_mutation_v2.test.js` | **47** |
  | 合计 | 54 |

  54 中 **47 条（87%）** 属 `use_chat_stream.turn_mutation_v2.test.js`。落在挂载接口那一侧的只有 **7 条**；这 7 条中 **只有 1 条**（`:285`）向构建器传入 `onInspectMemory`，且传的是 `jest.fn()`、只断言「`Inspect Memory` 这一项存在」。**故本命令即使在改动落地后重跑，其对「挂载接口新增 prop」的敏感度也接近于零 —— 改动后的绿同样是弱证据。** 一件基线的可靠性，取决于它所用仪器在关注点上的分辨率；本条的分辨率在关注点上 **是 1 条不断言参数的测试**。

  **第三层 —— 提交方的自陈已覆盖第一层，未覆盖第二层。** 完整性限制 (1) 明确写了「只跑了 2 个 suite，不是全量回归 …… 只证明了『今天这 2 个 suite 是绿的』」，措辞精确、方向正确，**这一点应予记明**：它把第一层的过度解读在同一条目内自行堵死了。**但第二层（构成与敏感度）在条目与 S-0017 全文中均未出现**，是我复跑后新增的事实。

  **来源真实性方面无保留** —— 运行器是本仓自带、观察是一手、结果不依赖复现者（我以独立 instance 复现得同一结果）。**保留全部落在证明力，不落在来源。**

- **相关性**: **部分超范围，但超范围的那一处在同一条目内被自我限缩回范围内；grep 半边完全在范围内。须拆开计。**

  1. **本条是复合证据，两半必须分开评。** 一次 jest 运行 + 一批 grep 共用一个编号（提交方自陈「一并登记以免另编号」）。二者回答不同问题，**混在一个编号下引用，会让读者把 grep 的严密度转移到运行头上**。这本身不是不诚实，但要求本庭在采纳时拆开。

  2. **grep 半边 —— 引用范围与证明范围一致，无问题。** S-0017 中每一处伸向 grep 的引用我都复核了，全部准确：§1.2(a)「爆炸半径是 grep 得出的闭集，不是估计」；受影响对象「6 处改动」的机械依据；「零跨 owner 协作 …… 全部在 `src/COMPONENTs/side-menu/` 内」。**这三处的引用不宽于所证。**

  3. **运行半边 —— 存在一处引用宽于所证。** 本条 `支持/反驳` 字段写：**「支持 甲（C4 破坏面为零，且基线为绿）」**。该运行只证得后半句。**「破坏面为零」是改动后的行为命题，未修改工作树上的任何运行都不可能证得它。** 同一形状在 S-0017 结论句复现：「我今天以完整 grep 爆炸半径 **+ 54 绿测试基线** 重新证成」—— 把 54 绿列为证成 C4 的两件工具之一。

     **但本庭要我按证据本身判，我据此认定：该处过宽 *被同条目的完整性限制 (1)(4) 逐字撤回*。** 撤回文字精确（「未被本次运行证明」「只作为实施前基线状态的登记」），**读完整条条目的人不会被误导**。这与「宽引用且无自限」在效果上是两件事，我不把二者等同。**净结论：形态上命中该模式，实害被同条目中和。**

  4. **一项未被中和的、我新增的范围事实 —— 构成未披露。** 条目披露了「只跑 2 个 suite」，**未披露 54 的内部构成**。47/54 属 `use_chat_stream.turn_mutation_v2.test.js`，而 S-0017 自己的「受影响对象」把该 suite 归为 **「无影响」**（仅在 facade 方法数变化时才有条件性影响）。**于是「54 绿」这个数字，87% 由一个提交方自认与本改动无关的 suite 构成。** 凡以「54」表达对挂载接口一侧的把握程度者，**按构造高估**。正确的数字是 **7**。**这一点不在案卷内，也不在完整性限制里，故未被自限覆盖。**

  5. **对 F1 的承重认定（只作范围事实，不评实体）。** F1 的两个析取支是：**(i)** chat-core 表示 C4 承诺不再有效；**(ii)** 挂载点无法新增 prop。**E-0049 不含指向任何一支的内容**：(i) 由一项 **表态** 了结，表态不是证据，本条也不是表态；(ii) 由 **读 `side_menu.js:772-779` 的 JSX** 了结，该定位登记在别处（E-0042 / E-0050），不在本条。**故：整条勾销 E-0049，F1 的证据态势不变。** 本条对 F1 **至多为旁证，不承重**。我把这一点单列，是因为传唤令把 F1 写作本条的承重去处 —— **按证据本身核，它不是。**

- **来源归类**: **内部来源。** 运行器为本仓自带 `react-scripts test`（`package.json` 内），grep 为本地仓库文本检索，二者均由内部角色在内部工作树上执行，**不涉及任何外部系统、外部服务或第三方断言**。既非权威可信的外部来源，亦非不可靠未验证的外部来源。其可信度来自 **可被任意内部角色确定性复现**（我已复现），而非来源权威 —— 故复现性一旦成立，来源层面无保留；本条的全部保留在证明力与引用范围，已分列于上。

#### S-0023 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: `procedural-judge` 就 E-0051 的可采性作出程序裁定 **R-0001**，本庭 **逐字归档，未改一字**，正文见 [`ruling.md#R-0001`](ruling.md)，并依归档职责抄送 `chief-judge`。**裁定结果：可采，射程受限。** 本条同时更正本庭派遣时的一处程序疏漏
- **依据**: `ruling.md#R-0001`, S-0020, S-0021, E-0051
- **不确定性**: 无
- **请求/下一步**: 全体出庭角色得在 R-0001 第三节射程内引用 E-0051；射程之外的引用不获其证明力
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T20:45:00-07:00（**本裁定自本次归档时生效**）
- **影响范围**: E-0051 的可采性与射程；本庭派遣程序的一处更正

  **一 · 裁定要点（本庭只作索引，不复述正文，避免产生第二事实源）**

  - **可采。** 审查人判「未验证」的对象 **不是这份证据本身**，而是它与所声称命题之间的关系；可采性回答的是「这份证据是不是它自称的那个东西」，该问 **无保留肯定**
  - **射程逐字限于** R-0001 第三节所引的收窄命题（`procedural-judge` 明言 **只行使「采纳」，不行使「修改」与「另拟」** —— 一条证据实际证明了什么属审查人三问的判定，不属程序裁定范围）
  - **射程之外四项不由 E-0051 承载**，且裁定明确记明 **「射程之外 ≠ 命题为假」**
  - **不改变** S-0021 的四项处置、E-0051 的须查类分类与四条完整性限制、以及本案 **两项闭庭阻塞**（quorum 8/9；受影响项未重排）

  **二 · 本庭的一处程序疏漏，更正留痕**

  本庭派遣时要求 `procedural-judge` **自行创建 `ruling.md` 并写入裁定**。该要求与其[角色定义](../../../codex/roles/procedural-judge.md)第 9 行冲突 —— 该行逐字规定「**裁定记录的写入由 `Speaker of the House` 归档，本角色不直接写入**」。

  **`procedural-judge` 未照办，而是指出该条并把正文交回本庭归档。其处置正确，本庭的任务书错误。** 本条更正之，并登记：**归档权与裁定权分离是刻意设计** —— 裁定者不经手案卷，案卷经手者不作裁定。本庭若成功让它自行写入，破坏的是这条分离。

  **三 · 三项被裁定明确弹回、仍待 `chief-judge` 处置的事项（本庭登记，防止其在 `SUMMARY` 中沉底）**

  1. **S-0018 请求 1**（要求本庭改写 `FRAMING` 甲 的措辞）—— `procedural-judge` **不接手、不预表倾向**，确认本庭 S-0021 第二节(3) 的上呈处置正确。**仍待 `chief-judge` 显式处置。**
  2. **七条证据全部「引用宽于所证」这一系统性模式** —— `procedural-judge` **显式不采为射程依据**，理由是「射程必须由这一条证据实际证明了什么导出，不由案卷的统计分布导出」；并 **不裁** 是否重审前六条（超出其授权清单），**附议本庭已作的处置**，与本庭一致 **不主张** 重审。**仍待 `chief-judge` 显式处置。**
  3. **`code-owner-chat-bubble` 的补强或撤回** —— 裁定明确这是其 **权利，不是义务**，**不设期限**。不补强的后果即 S-0021 已登记的那一项，**不因裁定加重**。

  **四 · 本庭据 R-0001「获准 action」第 1 项执行的动作**

  已在 `evidence.md` 的 E-0051 验证历史中以 **引用 `ruling.md#R-0001`** 的方式标注其射程（追加，未改写既有行）。**未改写 S-0018 正文；未据本裁定为任何一方挂接其他证据。**

#### S-0024 | ASSESSMENT | code-owner-unchain → case

- **阶段**: 议案庭审

- **结论**: **G8 已填，且它填出来的东西推翻了本案 Q4 在产品路径上的答案。** 逐条：**丙 —— `import unchain` 失败是 *harness 构造缺陷*，既非环境问题也非结构问题**；产品自带 `unchain_adapter._ensure_unchain_on_path()` 在 **零 env 配置** 下即把本机 `/Users/red/Desktop/GITRepo/unchain/src` 挂上 `sys.path`（sibling 回退，`unchain_adapter.py:67-70`），三人未实跑是因为他们直接 `import route_memory_v2` 而 **从未 import 那个 bootstrap**（E-0059）。**我已实跑 `store_owner=unchain` 的完整 HTTP 面**（E-0062），并复跑仓内既有 13 项 `test_memory_v2_unchain_read_adapter.py` 全绿。**净效果：`store_owner=unchain` 下，「新建会话（无 lifecycle）」「owner 从不存在」「owner_chat_id 为空」「被冒充的 owner id」「读作用域损坏」五种条件坍缩为 *同一条* `503 context_v2_unchain_read_unavailable`，message 逐字节相同**；legacy 那边的 `400 context_v2_invalid_request` 与 `404 context_v2_not_found` **在产品路径上根本不存在**，坏 `space_id` 落 **500 `context_v2_failed`**。**Q4「三态可判别」在产品配置下不成立**；`code-owner-shared-arteries` 的 A2（`getTree` 单次调用够用）**在产品路径上被证伪**，`code-owner-settings` 的 F2 相应 **加强**。**唯一的好消息**：真·空态（lifecycle 存在、零条目）**确实** 返回 `200 {"entries":[],"tree":[]}`（E-0062-A），这是本案第一次在产品配置下观察到 200 空态臂 —— S-0007/S-0009 指出的那个「幻影」缺口就此闭合，**但闭合结果是坏消息不是好消息**。**甲 —— E-0014 三项主张全部复核为真**，且我把它从静态比对升级为 **两侧实跑观察**（E-0060）。**乙 —— 提交方自标「纯推断、请勿采信」的那条外推 *成立*，且比其自陈更严重**：`memory_tree` 返回 folder 条目 **当且仅当 folder 被显式创建**；祖先目录 **从不自动物化**，写 `/notes/x.md` 不会产生 `/notes`。我已双臂实跑：不建 folder → **tree 退化为扁平列表**（2 条目 / 2 roots / 零嵌套），建 folder → 正常嵌套（E-0061）。**且仓内既有产品测试 `test_memory_v2_unchain_read_adapter.py` 正是按退化那一路写的**。**丁 —— `[a-z0-9_]+` 既非有意约定亦非巧合，是 try/except 收敛的架构副产物**；unchain 对 `error.code` 贡献 **零个**码，故该路径安全 —— 但 unchain **自有两套码词汇表，字符集严格更宽**（允许大写 / `.` / `:` / `-`），且它们 **今天已经在线上**（`error_code` / `last_error_code`，`/context/v2/memory/reviews` 系列，chat-bubble 已消费）（E-0063）。**戊 —— 「degraded」是占位串，不是准确描述**：PuPu 读路径上的 `WorkspaceSearchService._vector_index` **实测为 `None`**，`vector_error` 为空、`lexical_fallback` 为 `False` —— **没有任何东西处于降级；根本没接向量后端**（E-0064）。**Q2 —— 落在本边界内的只有一件，且我明确承接；那个「无主构件」不落本边界。**

- **依据**: E-0058, E-0059, E-0060, E-0061, E-0062, E-0063, E-0064, E-0065, E-0014, E-0010, E-0012, E-0037, E-0036, E-0005, E-0011, E-0018, E-0019, S-0007, S-0008, S-0014, S-0006, S-0009, S-0012, S-0016, 0000-0003-2026-0807#S-0024

- **不确定性**:

  1. **我的 harness 与真实 sidecar 之间仍有一段未覆盖**：我走 Flask `test_client`，未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发。**但与 E-0010/E-0012 有一处关键差别**：我的 `unchain` 是由 **产品自己的 bootstrap** 解析的，不是我用 `PYTHONPATH` 硬塞的（E-0059），故「`store_owner=unchain` 分支被执行」这一点是真的产品代码路径。renderer 最终观察到什么，我不主张。
  2. **我的 store 是我按仓内既有测试 fixture 建的临时 store，不是本机真实 store。** G2（`entries=0`）在本案仍未被真实数据填上 —— 我填的是「代码在真实配置下会返回什么形状」，**不是**「用户机器上真实积累的数据长什么样」。条目规模、folder 使用率、真实 `tags` / `source_refs` 分布，**一律未核实**。
  3. **lifecycle 的创建时机我只做了静态阅读**（`memory_v2_unchain_runtime_factory.py:993` 绑定在 attempt/generation 上），**未实跑一次真实 agent turn 去观察 lifecycle 何时落库**。故「新建会话必然无 lifecycle → 必然 503」这一步是 **强推断，不是观察**。该推断若错，E-0062 的严重性显著下降 —— 见「可证伪条件」F2。**该确认归 `code-owner-runtime`。**
  4. **丁 的另一半不在我边界内**：E-0037 那 42 个码全部定义在 `pupu:unchain_runtime/server/**`，是 `code-owner-runtime` 的边界。我只能确证 **unchain 对那个字段贡献为零**，以及 **unchain 自有码的字符集更宽**。「那 42 个是不是穷尽」我不主张。
  5. **戊 中「degraded 是占位串」是对当前 revision 的判断。** 我未追查该串是否为某个未落地的向量后端预留的前向兼容占位 —— 若是，则它是「尚未接上」而非「写错了」，处方不同。写下该串的是 `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:489`，**归 `code-owner-runtime`**；我只出 unchain 侧的真实状态。
  6. **本条全部结论钉在 unchain `a4e69f41` / PuPu `b2385d5d`。** `MemoryEntryKind` 自 `f3e9590`（Context Memory V2 P0）引入后 **从未被改过** —— 「稳定」在此处只等于「没有历史」，不等于「有兼容承诺」。

- **请求/下一步**:

  1. **请本庭把 E-0062 作为 Q4 的承重证据，并把 S-0004 的 Q4 结论标为「在产品配置下被推翻」。** 这不是收窄，是方向相反的结果。依证据规则，E-0059/E-0061/E-0062/E-0064 为 **须查类**（自搭 harness 的运行时观察），**请强制路由 `evidence-examiner`**。我已把完整可复跑脚本写在证据条目里，且 **审查人现在有能力实跑 `unchain` 分支了**（E-0059 给出了方法）—— 建议在任务书中明写这一点，否则审查人会重蹈前三人的覆辙。
  2. **请把「D-A 三方分歧」连同 E-0062 一并呈 `chief-judge`。** E-0062 对三方 **不是中立的**：它 **证伪** `code-owner-shared-arteries` 的 A2 在产品路径上的可判别性主张，**加强** `code-owner-settings` 的 F2，对 `code-owner-electron` 的 `memoryV2` 路线 **既不支持也不反驳**（那条不经 `getTree`）。**我不主张谁该赢** —— 落点是 CEO 的事 —— 但本庭不应在三方仍并列的前提下闭庭，因为 **其中一条的事实基础今天变了**。
  3. **请就「G10」记一笔已闭合**：S-0006 四(G10) 问「`get_tree` 对从未存在过的 owner 的行为」。**产品路径上的答案是 `503 context_v2_unchain_read_unavailable`，与停用态、与新建会话态、与冒充态同码同 message**（E-0062 案例 4/6/9）。**G10 由此闭合，但闭合方式是「不可判别」。**
  4. **请把 E-0063 转 `code-owner-runtime` 与 `code-owner-shared-arteries` 各一半**：前者答「42 个码是否穷尽、是否有成文约定」，后者答「`error_code` / `last_error_code` 这两个 **payload 字段**（非 `error.code`）今天是否被任何 renderer 解析器碰到过」。**若被碰到，E-0036 的 `[a-z0-9_]+` 假设在那条路径上今天就是错的。**
  5. **不请求本案为 unchain 侧落任何代码改动。** 本阶段只论「能不能做」，且 E-0061/E-0064 指出的两件事（folder 不自动物化、`vector_status` 占位）**都不是 unchain 库的 bug** —— 前者是刻意设计（folder 是一等条目，不是路径推导物），后者写在 PuPu 侧。**若 CEO 要 tree view 不退化成扁平列表，那是产品行为问题，不是库缺陷，处方在写侧（谁来建 folder），不在读侧。**

- **评估结论**: **有条件可行。**

  **可行的部分（我边界内，零改动）**：`store_owner=unchain` 下 `get_tree` 的读链路 **今天就是通的** —— 实跑 200，返回结构完整的嵌套树，字段集稳定，owner 隔离生效（E-0062 案例 2）。**unchain 库侧不需要为本议案改任何一行代码。** 分页、作用域校验、kind 词汇表、schema 版本全部就位。

  **条件一（硬）· tree 可能不是树。** folder 条目 **不自动创建**。tree view 在真实配置下拿到什么形状，**取决于写侧有没有人建 folder** —— 而写侧是 memory toolkit（LLM 自主调用 `upsert(kind="folder")`）。**这不是可以在读侧修的东西。** 议案若假定「tree view 会显示一棵树」，该假定 **今天没有任何机制保证**（E-0061）。

  **条件二（硬）· 空态与不可用态不可判别。** 见 E-0062。**Inspector 无法仅凭 `getTree` 区分「这个会话还没有记忆」与「V2 挂了」**，而前者是新建会话的常态。**这直接决定 tree view 的空态该显示什么 —— 而那正是本阶段被划出范围的呈现问题。** 我提请本庭注意这个交叉：**这不是一个设计取舍，是一个「可判别性不足使得任何设计都会在某一态撒谎」的技术约束。**

  **条件三（软）· 规模上限未验证。** 条目数 ≥ 10,000 时 `_workspace_entries` 抛 `PupuUnchainMemoryV2ReadError`，**该异常不是 `MemoryV2Error` 子类**，落 `_endpoint` 的裸 `except Exception` → **500 `context_v2_failed`**（E-0065）。且 unchain 侧 `_workspace_page` 每翻一页都 **全量重扫** 后再切片（`sqlite_read_v2.py:1178-1224`），`get_tree` 又是 200/页地把全部条目拉完 —— **在大 store 上是 O(n²/页大小) 的行为**。本机无真实数据，**未实测任何规模下的耗时**。

- **边界命中依据**: 传唤第三层补入（S-0006 第二节），触发条件为 `code-owner-runtime` 答复「跨仓依赖存在且在 tree 的关键路径上」。本条全部实体主张锚在 `unchain:src/unchain/memory/workspace/**`、`unchain:src/unchain/persistence/sqlite_read_v2.py`、`unchain:src/unchain/memory/curator/**`、`unchain:src/unchain/journal/models.py`，均在 `unchain:**` 内。**凡跨到 `pupu:unchain_runtime/server/**` 的（`memory_v2_unchain_read_adapter.py` 的 `_route_entry` / `vector_status` / `_MAX_LIFECYCLES`、`route_memory_v2.py` 的 `_endpoint` 与 `_read_runtime_for_store_owner`），我只作为「跨仓半边的锚点」引用，终局结论归 `code-owner-runtime`。**

- **受影响对象**:
  - `unchain:src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `:310`（`SCHEMA = "unchain.memory_entry.v1"`）
  - `unchain:src/unchain/persistence/sqlite_read_v2.py:1242-1255`（`workspace_tree`）· `:1153-1224`（`_workspace_page`，全量重扫）· `:418`（`WorkspaceSearchService(repository=workspace)` —— **不传 `vector_index`**）
  - `unchain:src/unchain/persistence/sqlite_memory_v2.py:843-902`（`list_entries`，**无 kind 过滤**）· `:1120-1240`（写路径，**无父目录存在性要求**）
  - `unchain:src/unchain/memory/workspace/service.py:367-385`（`create_folder`，folder 的 **唯一** 产生方式）
  - `unchain:src/unchain/memory/workspace/search.py:98-120, 313-322`（`VectorIndex | None`，`vector_error`）
  - `unchain:src/unchain/journal/models.py:13`（`_IDENTIFIER_RE`）· `unchain:src/unchain/memory/curator/models.py:1167` · `unchain:src/unchain/memory/curator/ports.py:23-32`（两套更宽的码字符集）
  - **跨仓半边（非本边界终局）**：`pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:357-452, 489, 532-567` · `pupu:unchain_runtime/server/route_memory_v2.py:68-106, 315-361, 1111-1120` · `pupu:unchain_runtime/server/unchain_adapter.py:56-72`

- **约束**:
  1. **只读执行，两仓零改动。** 结束时 `git -C unchain status --porcelain` = 0 行，`git -C PuPu status --porcelain -- src electron unchain_runtime` = 0 行，unchain HEAD 仍为 `a4e69f41`（E-0058）。全部临时产物在 scratchpad 与系统临时目录。
  2. **A-012 遵守：未派生任何子 instance。** 全部 grep / 读取 / 实跑由本 instance 亲自执行。
  3. **未跑 `npx jest`**；unchain 侧与 sidecar 侧一律用各自 pytest（工程铁律）。
  4. **本条不含任何视觉 / 交互设计主张。** 条件二触及「空态该显示什么」，我 **只陈述可判别性这一技术事实，不主张呈现形态** —— 呈现归方案庭审。

- **建议处置**:

  **一 · 甲 —— E-0014 跨仓半边逐条复核结果：三项全部为真，且已由推断升级为观察**

  | E-0014 的主张 | 我的复核 | 手段 |
  |---|---|---|
  | `kind` 取值来自 `unchain:models.py:251-255` 的 `MemoryEntryKind`（`folder\|markdown\|image\|link`） | **成立。** `_route_entry` 取 `entry.kind.value`，`entry.kind` 即 `MemoryEntryKind`。实跑观察到的 kind 集合 = `{folder, markdown, link}`（image 未构造） | E-0060 / E-0061 |
  | 分页来自同仓 `memory_tree` / `memory_list` | **成立。** `memory_tree` → `_reader.workspace_tree` → `_workspace_page(recursive=True)` → `SQLiteMemoryV2Store.list_entries`。`get_tree` 恒走 `recursive=True` 一路 | E-0060 |
  | 两侧返回 **不同字段集**，叶子 `kind` **除 `link` 外完全不相交** | **成立，逐字段确证** | E-0060 |

  字段集差异（两侧均为 **实测**，非静态推断）：

  | | `pupu_legacy` | `unchain` |
  |---|---|---|
  | 独有 | `created_by` · `created_at_ms` · `updated_at_ms` · `content_bytes` | `tags` · `source_refs` |
  | kind 全集 | `folder \| file \| link` | `folder \| markdown \| image \| link` |
  | **叶子** kind | `{file, link}` | `{markdown, image, link}` |
  | 叶子交集 | **`{link}`** —— E-0014 的措辞精确 | |

  **我另加一条 E-0014 未记、但对 tree view 更要害的**：两侧 `content_ref` 的 **触发条件不同**。legacy 在 `kind == "file"` 时给（并可能附 `content_bytes`）；unchain 在 `kind ∈ {markdown, image}` 时给，**且永远不给 `content_bytes`**。**即：unchain 路径上，tree view 拿不到任何条目的字节大小。** 任何「显示文件大小」的呈现在产品配置下 **无数据可用**。

  **二 · 乙 —— 那条「纯推断」外推：成立，且前提比提交方以为的更脆**

  提交方写「`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立」。**这个推理是错的** —— 枚举里有 `FOLDER` 只说明 folder 是 **可表达的**，不说明它 **被产生**。实测：

  - `SQLiteMemoryV2Store.list_entries`（`sqlite_memory_v2.py:843-902`）的 SQL **无任何 kind 过滤** → folder 条目 **只要存在就一定被返回**。
  - 写路径（`sqlite_memory_v2.py:1120-1240`）**不要求父目录存在**，**不自动创建祖先 folder**。
  - folder 的 **唯一** 产生方式是显式 `create_folder`（`service.py:367`），对外经 toolkit `upsert(kind="folder")`（`toolkit/services.py:223`）。

  **双臂实跑（E-0061）**：

  ```
  B. 只写 /notes/Architecture.md + /notes/Upstream.link，不建 folder
     entries=2  roots=2  parent_paths={'/notes'}   ← 每个条目的 parent_path 都指向一个不存在的节点
     - /notes/Architecture.md  kind=markdown  children=0
     - /notes/Upstream.link    kind=link      children=0     ← 退化为扁平列表，零嵌套

  A. 先 create_folder("/notes")，再写同样两个条目
     entries=3  roots=1  parent_paths={'/', '/notes'}
     - /notes                  kind=folder    children=2
       - /notes/Architecture.md  kind=markdown  children=0
       - /notes/Upstream.link    kind=link      children=0   ← 正常嵌套
  ```

  **结论：退化是真实分支，且是默认分支。** 更值得本庭注意的是 —— **仓内既有的产品测试正是按退化那一路写的**：`pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py` 的 `_seed_owner` 写 `/notes/Architecture-{suffix}.md` 而 **从不建 `/notes`**，并断言 `reader.memory_tree().entries == (owner_a[1],)`（单条目）。**即：本仓对该路径的唯一既有覆盖，覆盖的是扁平那一支。**

  **对议案的直接影响**：这 **不阻断** 议案（树装配算法本身正确，folder 在时嵌套正常），但它意味着 **「tree view 会呈现层级」不是一个可依赖的前提**。是否要层级，取决于 memory toolkit 的实际使用方式 —— 那是 `expert-llm` 与写侧的问题，**不在读侧可修范围内**。

  **三 · 丙 —— G8：根因、方法、以及它填出来的结果**

  **(a) 该 import 失败是环境问题还是结构问题？—— 都不是，是 harness 构造缺陷。**

  产品的 sidecar 从不依赖 `pip install unchain`。`pupu:unchain_runtime/server/unchain_adapter.py:56-72` 有一个模块级 bootstrap：

  ```python
  def _ensure_unchain_on_path() -> None:
      _source = os.environ.get("UNCHAIN_SOURCE_PATH", "").strip()
      if _source:
          ... sys.path.insert(0, <_source>/src) ...
      _project_root = str(Path(__file__).resolve().parents[2])
      _sibling = os.path.join(os.path.dirname(_project_root), "unchain", "src")
      if os.path.isdir(_sibling) and _sibling not in sys.path:
          sys.path.insert(0, _sibling)
  _ensure_unchain_on_path()
  ```

  `parents[2]` = `/Users/red/Desktop/GITRepo/PuPu` → sibling = **`/Users/red/Desktop/GITRepo/unchain/src`** —— **这台机器上该目录存在**。故 **零 env 配置** 下 `import unchain` 就能成。

  三人失败的原因是一致且机械的：他们的 harness 直接 `import route_memory_v2`，**而 `route_memory_v2` 不 import `unchain_adapter`** —— bootstrap 从未执行。实测（E-0059）：

  ```
  BEFORE: 'unchain' importable? NO -> No module named 'unchain'
  AFTER importing unchain_adapter:
    unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
    UNCHAIN_SOURCE_PATH env = ''
  ```

  **这同时闭合了我自己记忆里挂了很久的一个洞**（`unchain-evidence-must-cite-lock-revision` 末段）：「checkout 与 lock 一致 ≠ 运行时 `import unchain` 解析到这个 checkout」。**现已坐实：解析到的就是这个 checkout，且它就是 lock 钉的 revision。**

  **(b) 能不能实跑？—— 能，已跑。**

  仓内既有 13 项 `tests/test_memory_v2_unchain_read_adapter.py` 全绿（`13 passed in 0.70s`）。在此之上我实跑了 `store_owner=unchain` 的完整 HTTP 面（E-0062）。**以下是本案第一次对该分支的产品行为观察**：

  | # | 条件（`store_owner=unchain`） | 实测响应 |
  |---|---|---|
  | 1 | `listSpaces`，owner 有 lifecycle | **200**，spaces 数组含 1 个 space |
  | 2 | **`getTree`，owner 有 lifecycle + 3 条目** | **200**，`{entries, owner_chat_id, space_id, space_revision, tree}`，嵌套正确 |
  | A | **`getTree`，owner 有 lifecycle + 0 条目（真·空态）** | **200 `{"entries":[],"tree":[],…}`** ← **本案首次在产品配置下取得 200 空态臂** |
  | 3 | `getTree`，`owner_chat_id` 为空 | **503 `context_v2_unchain_read_unavailable`** ← legacy 是 400 |
  | 4 | `getTree`，owner 从未存在过 | **503 `context_v2_unchain_read_unavailable`**（**G10 的答案**） |
  | 9 | `getTree`，store 在但该 owner 无 lifecycle（**新建会话**） | **503 `context_v2_unchain_read_unavailable`** |
  | 6 | `getTree`，`owner_chat_id=character_foo__dm__main` | **503 `context_v2_unchain_read_unavailable`**（**F3**） |
  | 5 | `getTree`，`space_id` 不存在 | **500 `context_v2_failed`** ← legacy 是 404 |
  | — | `store_owner=unchain` 但 `UNCHAIN_DATA_DIR` 未设 | **503 `context_v2_unavailable`** |
  | 7 | `/context/v2/status` | **200**，含 `"store_owner": "unchain"` |
  | 8 | `/context/v2/memory/search` | **200**，`backend: "fts5"`，`vector_status: "degraded"` |

  **(c) 这个结果对本案的意义 —— 三条，请勿只引第一条：**

  1. **Q4 的答案在产品路径上是「否」。** 案例 3/4/6/9 **同码同 message 同 `retryable`**，逐字节不可分。其中 **案例 9 是新建会话的常态**（lifecycle 绑定在 attempt 上，`memory_v2_unchain_runtime_factory.py:993`，即首次 agent turn 才落库）。**用户新建一个会话就打开 Inspector —— 拿到的是与「V2 挂了」完全相同的响应。**
  2. **legacy 的 400 / 404 两臂在产品路径上不存在。** 它们由 `pupu_legacy` 的 `get_tree` 内部校验产生，而那段代码在产品配置下 **不执行**（S-0006 第一节已归档的同一个「`pupu_legacy` 幻影」）。**E-0010 的三态实测，其中两臂的错误语义在产品路径上是别的东西。**
  3. **好消息只有一条**：真·空态确实 200 且 `tree: []`。**故「有 lifecycle 的会话」的空/非空是可判别的；不可判别的是「还没有 lifecycle」与「不可用」。**

  **四 · 丁 —— `[a-z0-9_]+`：既非约定亦非巧合**

  **审查人 S-0014 把该字符集判为「本探针零覆盖」并转给我，方向正确，但落点需要再挪一格。** 逐条：

  1. **unchain 对 `error.code` 贡献的码数量 = 0。** `route_memory_v2._endpoint`（`:68-106`）的 `except Exception` 把 **一切非 `MemoryV2Error`** 拍平成字面量 `context_v2_failed`。我实测确认 `PupuUnchainMemoryV2ReadError` 的 MRO 为 `[…, RuntimeError, Exception, …]`，**不是 `MemoryV2Error` 子类**。unchain 的 `RepositoryScopeError` / `ModelValidationError` / `SQLiteContextV2ReadError` 同理，**没有任何一个的名字或码能到达 `error.code`**（E-0063）。
  2. **所以字符集成立，但成立方式是「收敛」不是「约定」。** 没有任何跨仓协议、注释或测试表达过这条规则；它由一个 **谁都不会当成词汇表守卫的异常处理器** 结构性地强制着。**「有意的约定」与「巧合」这个二分法在这里不适用 —— 正确的说法是架构副产物。** 其脆弱性也因此不在「有人加了个新码」，而在 **有人改了那个 `except Exception` 的拍平行为**。
  3. **unchain 自有的码字符集严格更宽，且已在线上。** 实测：

     ```
     unchain _IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/   (journal/models.py:13)
       'curator.timeout'  → unchain 合法, [a-z0-9_]+ 不匹配
       'Curator-Failed'   → unchain 合法, [a-z0-9_]+ 不匹配
       'runner:aborted'   → unchain 合法, [a-z0-9_]+ 不匹配
     CurationRepositoryError.code 正规化 = re.sub(r"[^a-z0-9_:-]+","_", casefold())  (curator/ports.py:23-32)
       → 仍允许 ':' 与 '-'
     ```

     **且这些码今天已经在线上，只是走的是别的字段**：`memory_v2_unchain_curator_query.py:129` 的 `"error_code"` 与 `:179` 的 `"last_error_code"`，由 `/context/v2/memory/reviews` 与 candidates 系列路由送出 —— **而 `pupu:src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js` 今天就在消费该面（E-0005）。**

  **净答复**：对 `parseContextV2ErrorCode` 走的那条路（`error.code`），**下一个新码不会静默失效，因为不存在「来自我这侧的新码」**。真正的风险 **已经存在但被 E-0036/E-0037 的取样范围错过了**：`error_code` / `last_error_code` 是 payload 字段，携带 unchain 更宽字符集的码。**若哪天有人把它们喂进同一个 `[a-z0-9_]+` 解析器，那一刻就静默落 `null`。** 这正是审查人担心的失效模式，只是发生在另一个字段上。**请转 `code-owner-shared-arteries` 核实该面今天有无解析器。**

  **五 · 戊 —— V2 向量后端在 unchain 侧的真实状态**

  **答：不是「degraded」。是「根本没接」。** `"degraded"` 是硬编码占位串。

  实测（E-0064，同一 harness、同一 reader 实例）：

  ```
  WorkspaceSearchService._vector_index          = None
  raw WorkspaceSearchResult.vector_error        = ''        ← 空：没有任何失败
  raw WorkspaceSearchResult.lexical_fallback    = False     ← fts5 工作正常
  route search_entries → backend                = 'fts5'    ← 真实计算得出
  route search_entries → vector_status          = 'degraded' ← 常量
  ```

  结构性依据：`unchain:src/unchain/persistence/sqlite_read_v2.py:418` 构造 `WorkspaceSearchService(repository=workspace)` —— **不传 `vector_index`**，而该参数默认 `None`（`search.py:135`）。PuPu 的读适配器拿到的 reader 全部经这条路，**故 `_vector_index` 在该路径上恒为 `None`，不是配置问题，是接线问题**。unchain 侧 **确实支持** 向量（`VectorIndex` Protocol、`sqlite_long_term_memory_v2.py:104-106` 就传了），**只是 PuPu 的 Context V2 读路径没接**。

  **本庭请注意同一响应里的词汇不一致**：`backend` 字段用 `"degraded"` 表示「lexical 索引不可用、退化到全扫」（真实计算，`memory_v2_unchain_read_adapter.py:485`），`vector_status` 字段也用 `"degraded"` 但是常量。**同一个词在相邻两个字段里含义不同，其中一个还是假的。** 我另记一处同源的词汇碰撞：`matched_by` 里的 `'lexical_fallback'` 是 **评分通道名**（`search.py:264`，0.55 权重的 token 匹配），与 **结果级布尔** `WorkspaceSearchResult.lexical_fallback` 同名而不同义 —— 实测出现 `matched_by=['lexical_fallback','fts']` 而 `lexical_fallback=False` 的组合。**任何据这两个名字判断检索健康度的收端都会读错。**

  与 S-0009 二(3) 的关系：本庭登记的「产品路径上它的自述状态是 `degraded` 不是 `disabled`」**事实层面成立**，但 **含义层面须更正** —— 它不表示「有向量后端且已降级」，而表示「这个字段没有被实现」。**Q3「vector view 保持现状」的前提因此不仅成立，而且比 S-0004 说的更彻底：unchain 读路径上不存在任何向量数据，连 `VectorHit` 那种 `(chunk_id, text_hash, score)` 都没有 —— 没有索引对象。**

  **六 · Q2（G1）· 强制表态**

  **本案若推进，是否会要求我的边界承担一个今天不属于我的判定职责？**

  **一件会，且我明确承接；那个「多方需要、今天没有 owner」的构件不会落到我这里。** 分开说：

  **(1) 会落到我边界的一件 —— 跨仓读契约的稳定性判定。** tree view 一旦成为 `getTree` 的第一个真实消费者，`MemoryEntryKind` 与 `_route_entry` 的字段集就从「内部实现」变成 **有 UI 依赖的事实契约**。今天没有任何机制表达这件事：`MemoryEntryKind` 有 `SCHEMA = "unchain.memory_entry.v1"`，但 **`unchain-core.lock.json` 只钉 revision，不钉 schema**；PuPu 侧也没有任何测试断言过 kind 词汇表。**我承接这条**：本边界内新增 kind 或改字段集时，负责发起双边 impact。**代价我如实计价**：这是 charter 里「双边 impact 强制」已有的义务，**不需要新构件、不需要新 owner、不需要 CEO 拍板**。

  **(2) 不落在本边界的 —— 「单一状态源 / 谁是权威状态源」（前案 D7 / D8，本案 D-A）。** 明确写「**不落在本边界**」。理由不是我不想接，是 **结构上接不了**：该判定要在 renderer 里综合 `enable_memory_v2`（build flag）、`storeOwner`（Electron 决议）、sidecar 就绪态、以及 V2 读的返回 —— **四个输入里有三个在 unchain 库之外，而库这一侧对 PuPu 的 rollout / feature flag / IPC 一无所知，也不应该知道。** 让库承担这个判定就是让依赖倒挂。

  **谁能判断 —— 我指名，并给出本案新增的依据**：**这个落点判断本身归 `chief-judge`**（D7/D8 已两案未决，`expert-architecture` 明言「传唤机制解不了它，只有指派能解」）。但 **E-0062 收窄了可选项**：既然 `getTree` 在产品路径上 **无法** 区分「新会话」与「不可用」，**任何把状态判定放在 `getTree` 返回上的方案（含 `code-owner-shared-arteries` 的 A2）在产品配置下都会误报**。**故这个构件不能只读 `getTree`** —— 它必须至少多读一个源。**在 `code-owner-electron` 的 `unchainAPI.getStatus().memoryV2` 与 `code-owner-settings` 的 `contextV2Bridge.getStatus()` 之间怎么选，我不表态**（两者都在我边界外，且我未实跑 Electron 面）；**我只出一条硬约束：单靠 `getTree` 不够，这一点现在有实测证据了。**

  **(3) G1（前案裁定未到达）是否构成本案前置阻塞？** **对我这一侧不构成。** 前案 16 项强制回应无一落在 `unchain:**`；我上面全部结论不依赖前案任何一条 `ASSESSMENT`。**但我不主张对全案不构成阻塞** —— D-A 的落点悬而未决，而 E-0062 刚改变了它的事实基础，**是否阻塞归 `chief-judge`**。

  **七 · 可证伪形式（本条在什么条件下翻转）**

  | # | 结论 | 翻转条件 |
  |---|---|---|
  | **F1** | 甲：两侧字段集/kind 词汇表如上 | `MemoryEntryKind` 增删成员，或 `_route_entry` 改字段集。**检测**：`unchain:models.py:251-255` 与 `pupu:memory_v2_unchain_read_adapter.py:532-567` 任一变更即须重跑 E-0060 |
  | **F2** | 丙：新建会话必然 503（不可判别） | **若 lifecycle 实际在建会话时（而非首次 agent turn 时）即落库**，则新建会话直接落 200 空态臂，不可判别性大幅缩小。**我只做了静态阅读（`memory_v2_unchain_runtime_factory.py:993`），未实跑真实 turn** —— 这是本条最脆的一环，**归 `code-owner-runtime` 实测**。**若 F2 被推翻，条件二降级为软条件，D-A 的紧迫性下降。** |
  | **F3** | 丙：五种条件同码不可分 | `route_memory_v2._read_runtime_for_store_owner:355-361` 若把 `PupuUnchainMemoryV2ReadError` 按成因分码（该异常今天带不同 message，**信息在，只是被压成一个码**），则可判别性立即恢复。**这是一条低成本修复路径，我主动指出，但它在 `code-owner-runtime` 边界，不在我这里** |
  | **F4** | 乙：tree 可能退化为扁平 | 若写侧引入「自动创建祖先 folder」或 toolkit 强制先建目录，则退化消失。**检测**：`unchain:sqlite_memory_v2.py` 写路径出现父目录物化逻辑，或 `memory/toolkit/` 出现 mkdir 语义 |
  | **F5** | 戊：无向量后端 | `unchain:sqlite_read_v2.py:418` 若开始传 `vector_index=`，则 unchain 读路径有真向量，`"degraded"` 从占位串变成可能真实的状态。**检测**：该行签名变更 |
  | **F6** | 丁：unchain 对 `error.code` 贡献为零 | `route_memory_v2._endpoint:98-104` 的 `except Exception` 若改为透传底层异常的码，unchain 的宽字符集立刻进入 `error.code`，**E-0036 的解析在那一刻起会静默落 `null`** |
  | **F7** | 全部实测结论 | 我的 harness 与真实 sidecar 的差异（`test_client` vs 真进程 / 临时 store vs 真实 store）若在某处实质化。**推翻方式**：起真实 sidecar 重跑同样 11 个请求 |
  | **F8** | 「零改动」 | lock revision 与 unchain `dev` 分叉。**今天二者仍相等**（均 `a4e69f41`，工作树干净，E-0058），**但前案 R4 记的「此巧合不可依赖」依然有效** —— 任一侧推进即须重核 |

---

#### S-0025 | ASSESSMENT | expert-architecture → case
- **阶段**: 议案庭审
- **结论**: **有条件成立。** 本案的可行性问题在管线形状这一层 **可以判定且答案是「能」**，但议案的措辞把两个不同的问题合并了：**「新增一个 tree view 在技术上能不能做」成立；「这个 tree view 显示出来的是不是一棵树」本案取证结构上不足以回答**（G8），二者必须在 `SUMMARY` 里分开。逐条：**甲 —— 本案 **确实** 踩中前案 D7，但四条主张 **不是同一个问题的四种答案**（两条竞争、一条正交、一条是测量而非主张）；**D7 被具体化，未被解开** —— 其定义性属性（无 owner）分毫未变，变的是它从「不可定位」变成「可指派」。`code-owner-electron` 的重述 **成立于它主张的范围，不成立于它隐含的范围**：`memoryV2` 确已跨过 IPC 线（我第三次独立复核 `normalizeUnchainStatus` 丢弃它，E-0066），「放行一个字段」确是约 6 行；但「认领契约」不是小事，且 **`memoryV2` 是进程全局的，答不了本案每一个消费者都在问的 per-`ownerChatId` 问题** —— 故它可以是两轴中的第一轴，**不能是那个单一状态源**。**不构成前置阻塞。** **乙 —— 落 `code-owner-settings`，`memory-inspect/` 下新组件，成立**；但满足 C8 的条件不是「新开一个文件」，是 **新组件不得自持判定**（boot 先例的「判定与呈现分离」）。**「几乎所有人零改动」的分布可信 —— 但由它推出的「本案便宜」不成立**：五份「零改动」全部附条件，其总和不是零，缺的那一块恰好就是无主构件。**丙 —— 处方确实被提在了错误的抽象层级，但不是 `code-owner-chat-core` 说的那个错法**：真正的三层是 L1 提取 / L2 分类 / L3 呈现语义；**该收敛的是 L1+L2，不该收敛的是 L3**。这个三分 **同时满足** `code-owner-chat-bubble` 的 B2 口径与 `code-owner-chat-core` 的语境分层反对，并解释了它们为何看起来对立而实际正交。`code-owner-chat-bubble` 对第三份拷贝的更正 **成立，且推论比它自己说的更强 —— 「N 份四态机拷贝」这个计数本身是错的，而错误的度量直接产出了错误的处方**。**丁 —— `context_v2_store_disabled` 在 `src/` 零命中（我独立复核）不是一条缺口，是本案唯一一个可证伪的结构度量**；它同时把「默认态显示未启用」从设计题变成 **本案唯一一处「零改动」明确不成立的地方**。**戊 —— 归一层不放任何一层，因为今天没有两套活形状**：`pupu_legacy` 的 entry 形状在 Electron 下结构性不可达，为死形状建归一层会破坏三个活消费面。**若将来必须归一，落 sidecar，不落 renderer/main**（`kind` 词汇权威是跨仓 enum，归一必须发生在能 import 它的最近一层）。11 条单向门见正文五。**己 —— 在此证据条件下，「可行」只能硬到「形状可行」**；我给出按「结论是否依赖 store owner 取值」的三分，并指出 **五份审查同时收窄不是五次疏忽，是取证可达性的必然后果**
- **依据**: E-0066, E-0067, E-0068, E-0069, E-0070, E-0071（本发言新提）；E-0002, E-0003, E-0004, E-0005, E-0006, E-0010, E-0011, E-0014, E-0018, E-0019, E-0020, E-0025, E-0026, E-0029, E-0030, E-0032, E-0034, E-0035, E-0036, E-0038, E-0039, E-0040, E-0042, E-0045, E-0046, E-0047, E-0048, E-0050, E-0053, E-0054, E-0055, E-0056；S-0002, S-0004, S-0005, S-0006, S-0007, S-0008, S-0009, S-0010, S-0011, S-0012, S-0013, S-0014, S-0015, S-0016, S-0017, S-0018；`0000-0003-2026-0807#S-0014`, `0000-0003-2026-0807#S-0024`, `0000-0003-2026-0807#R-0001`

- **不确定性**（总括为「有条件成立」，以下 **C-A1…C-A10 为全部必要条件**，另附三条未核实项）:

  **C-A1 · 议案必须显式接受「出厂默认态下 tree view 只能显示未启用」，并同时显式接受这一态不是零改动。** 依据 E-0048 / E-0053（我独立复核，E-0071）：`context_v2_store_disabled` 在整个 `src/` 零命中。该码是链路上「未启用」的唯一权威信号（`code-owner-runtime` E-0010(b) · `code-owner-electron` S-0010 丁(2) · `code-owner-shared-arteries` E-0039 三方同向）。**故必须二选一且必须选**：(i) 消费该码（= 做 L1/L2 的活）；(ii) 消费 `memoryV2`（= 放行 + 投影的活）。**不选的后果已被实证**：`code-owner-chat-bubble` 端渲染成红色 `role="alert"`，`code-owner-chat-core` 端落 FAILED「请重试」而重试永不改变条件。

  **C-A2 · 本案若产出任何共享判定构件，其口径必须止于 L2，不得包含 L3。** L2 = `(error) → {code, kind, parsed}`；L3 = 用户可见状态词。这是 `code-owner-chat-bubble` B2 与 `code-owner-chat-core` 6.3 的 **合取**，我判两者都成立且不冲突（正文三）。

  **C-A3 · L2 的类别集合必须由产端权威枚举定义，并配两道方向相反的守卫。** (a) 唯一权威枚举在产端；(b) 产端有一个测试断言「每一个可发出的码都在枚举里」；(c) 消费端的测试 **`import`/`require` 该枚举而非转写**。**三条缺一，映射会在下一个新码上静默失配。** 这是前案 C-ARCH-2 原文，本案 **无任何证据削弱它**，我重申。`code-owner-shared-arteries` 的 P1（判据权威留产端）是其 **必要半，不充分** —— 它没有覆盖 (b)(c)。我实测 boot 先例三条今天仍全部成立（E-0067）。

  **C-A4 · tree view 落 `code-owner-settings`，形态为 `src/COMPONENTs/memory-inspect/` 下的新组件；且 `memory-inspect/**` 不得成为任何共享判定的导出点。** 后半是前案不成立项 ①（`0000-0003-2026-0807#S-0024` 强制回应 ①）在本案的重申，成因相同：产品面组件目录一旦成为公共依赖，会从外部压破 `code-owner-settings` 自己的 C8。

  **C-A5 · 若共享判定模块落 `code-owner-shared-arteries`，落点为 `src/SERVICEs/context_v2_state.js`（与 `boot_readiness.js` 同级），不落 `src/SERVICEs/bridges/`。** 其 S-0011 5.2(1) 提的是后者。同一 owner、同一工作量，但目录承载语义：`bridges/` 的定义性属性是「不校验、不持状态、不加任何自己的东西」（其 A1，且被其自己的测试守护）。把一个持规则的模块放进那个目录，会削弱使 A1 可执行的那条契约本身。boot 先例已经给了正确切法：哑 bridge 在 `bridges/boot_readiness_bridge.js`，判定模块在 `SERVICEs/boot_readiness.js`（E-0067）。

  **C-A6 · 契约基准选定 `unchain`，且以「承认唯一活形状」而非「建一个归一层」的形式落地。** 验收对象为 `memory_v2_unchain_read_adapter.py`；**不得对 `memory_v2_store.py::get_tree` 作任何验收断言**（与 `code-owner-runtime` 约束 2、`code-owner-electron` 约束 4 同向）。若将来 owner 并存使归一成为必要，**归一落 sidecar，不落 renderer、不落 main**（理由见正文五 5.2）。

  **C-A7 · 方案庭审的验收标准中不得出现任何关于 tree 形状、深度、量级或空态语义的断言，除非 G8 已闭合。** 闭合的定义是：在一个 `import unchain` 成功的环境里跑过一次真实 `get_tree`，并记录三项 ——（a）返回的条目里 **有没有 `kind == "folder"`**；（b）一次 reject 的 `error.message` **原文**；（c）`entries` 非空时的 **字段集实测**。**这是我唯一一条要求在方案庭审前闭合的取证条件**，理由见正文六。

  **C-A8 · 若本案声明「不新增状态源、只消费已存在的信号」（`code-owner-electron` S-0010 Q2(3) 的出路，`code-owner-chat-core` 6.6 首推），该声明必须同时指明消费哪一个信号。** 不指明它是空的：今天有三条候选路径，而 renderer **一条都没在用**（`code-owner-chat-bubble` §4.1 逐条实证）。一个不指明消费对象的「不新增状态源」声明，在实施时会以「就近取一个」的形式落地，那就是第 6 份。

  **C-A9 · 挂载接口的扩展必须位置参数换对象，不得追加第三个位置参数。** 前案 C-ARCH-3 原文，`code-owner-chat-core` K3 同向。**我加一条本案独有的时效理由**：今天破坏面为零（E-0042：无任何测试断言 `onInspectMemory` 的参数；E-0049：全部引用点 7 处且全在一个目录）**是一个会过期的窗口** —— 一旦出现第二个调用点，改签名的破坏面从零变非零，而两个待送的值都是合法 chat id 形状的字符串，位置错位在 JS 里静默。

  **C-A10 · `ownerChatId` 必须由挂载点显式传入、打开时快照、不跟随活动会话，且不得在 modal 内部从任何全局取。** = `code-owner-settings` N1 + `code-owner-chat-core` K1/K4/请求 3 的合取。**我把它列为必要条件而非实施注意事项，理由是 E-0045 那条错主在整条链路上结构性不可检测**：三道防线（main 语法门 / 服务端 owner-scoping / facade 不校验）全部放行且全部没做错，因为没有任何一层知道用户想看的是哪个 chat。**一个没有任何层能事后发现的错误，其防线必须写成契约，不能写成注意事项。**

  ---

  **未核实项（我实跑到哪里为止）**

  1. **我未启动应用、未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求、未跑任何测试套件。** 我的取证全部是 PuPu `b2385d5d` / unchain `a4e69f4` 上的静态阅读与只读 shell 命令。**依 A-012 未派生任何子 instance。** 凡涉及运行时行为的一律标推断。
  2. **G8 我同样跨不过去。** `store_owner=unchain` 分支我未实跑，本案至今 **四人（提交方 + 两名审查人 + 我）无一能跑**。我在 E-0068/E-0069/E-0070 里对该分支的全部陈述是 **静态比对**。
  3. **一条我只核到一半、明确交出的**：`pupu_legacy` 在写入时 **强制父 folder 存在**（`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"`），而这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因。**我在 `unchain:src/unchain/memory/workspace/service.py` 未找到等价强制，但我只读了那一个文件** —— 该强制可能在 repository port 或别处。**这不是主张，是一个问题，归 `code-owner-unchain`（第 5 批）。** 它的答案决定 `get_tree` 在活路径上返回的是树还是扁平列表。
  4. **G2 继承。** 本机 `entries=0`，「有数据时」一律不作断言（与前案同）。

- **请求/下一步**:

  1. **请 `speaker-of-the-house` 在 `SUMMARY` 中把议案的问题拆成两句**，不要合并：**(i)「新增一个 tree view 的管线形状可行」—— 本案证据充分；(ii)「该 tree view 呈现出来的是不是一棵树」—— 本案证据结构上不足**。本案迄今所有「可行」表态覆盖的都是 (i)。把二者合并会让裁定看起来比证据更硬（正文六）。

  2. **请 `speaker-of-the-house` 在保留 S-0012 D-A 四条并列的同时，为每一条标注它回答的是哪一层的问题。** 我 **不反对原样保留**，保留是正确的程序处置。我请求的是补一列 —— 因为四条被排成同一行这个记录形式本身，正在复制正文三所说的处方错层：两条竞争同一问题、一条正交、一条是测量而非主张（正文一 1.2 的表）。不标层，`chief-judge` 会被要求在四个不同层的答案里选一个。

  3. **请 `chief-judge` 把「共享判定构件的落点与 owner 指派」从本案剥离出来单独裁，并且不管 tree view 是否推进都裁。** 理由是本案产出了一份 **前案没有的东西**：一份完整的指派材料包（候选 owner 已自荐并开价 P1/P2/P3、替代 owner 已被指名、口径已被两个消费方分别约束、迁移成本已被逐站点计价）。**前案我说「传唤机制解不了它，只有指派能解」；本案的经验校准是 —— 传唤机制能做的最后一件事，是把指派从一个开放式判断降为一个二选一。它做到了，然后停在那里。** 材料齐了之后继续拖，成本从「不指派」变成「浪费一次已经付过的取证」。

  4. **请 `chief-judge` 把 `code-owner-chat-core` 提出的 0/5 度量写进裁定文本**（`context_v2_store_disabled` 在几份拷贝里被正确处理，今天 0）。理由见正文四：D7 此前一直是定性论证，谁都无法证伪；**给一个结构缺口配一个可测量的指标，是把它从辩论移进工程的唯一办法。**

  5. **请本庭把 E-0069 记为一条新增已知缺口**：活读路径有 10,000 条条目硬上限，**超限抛错而非截断**，本案至今无人提及。它与 `code-owner-electron` E-0032（「本层不封顶」）**不矛盾** —— 两句话在两个不同的层，合起来的净效果是：**tree view 的载荷上界由 sidecar 单方面决定，且到达上界时用户看到的是错误不是部分树。** 归 `code-owner-runtime` 与 `code-owner-unchain`。

  6. **请本庭把 E-0068 记为对 E-0014 的一处补正**：`pupu_legacy` 侧 `list_entries` 另加一个 `deleted` 字段（`memory_v2_store.py:7396-7400`），`unchain` 侧 `_route_entry` 无此字段。E-0014 的字段差异表漏记了它。**它对 tree view 是语义承重的**（要不要显示墓碑条目）。补正责任依证据规则第一节归提出方 `code-owner-runtime`；我只登记事实。

  7. **就 `expert-llm` 的边界，我写明依赖关系，不代其表态**（依本庭指示）：我的乙（落位）结论 **在其判「不为 V2 造投影」或「押后」时无条件成立**；**在其判「造」时，落位结论不翻转，但需追加一条前置** —— 那时 `memory-inspect/` 会从「一个 modal + 两个内容组件」变成「一个需要内容路由的容器」，`code-owner-settings` 的 C8 就不是「加一个新组件」能满足的了，**重开的是容器形态，不是 tree view 的位置**。故我的 C-A4 在两种裁法下都成立，只是后者需要并列一条容器形态的待裁问题。

  8. **不请求补传任何角色。** 我边界内本次作业不增删改任何 channel、bridge 面、facade 方法或 locale 键；`expert-security` / `expert-ux` 的不传唤判定在我这一侧继续成立。触发线我采纳 `code-owner-electron` 丁(4) 与 `code-owner-shared-arteries` A2 已画的那两条，不另立。

  9. **本阶段不提交 `PROPOSAL`。**

- **评估结论**: **有条件成立**（总括，条件为 C-A1…C-A10）。逐条三值：

  | 问 | 判定 |
  |---|---|
  | **甲 · 是否踩中 D7** | **成立**（踩中，且是最直接的一次） |
  | **甲 · D7 是否被解开** | **不成立** —— **只被具体化**。定义性属性（无 owner）未变 |
  | **甲 · 四条主张是否同一问题的四种答案** | **不成立** —— 两条竞争、一条正交、一条是测量 |
  | **甲 · `code-owner-electron` 的重述是否成立** | **有条件成立** —— 成立于其主张的范围；**不成立于其隐含的量级结论**（正文一 1.3） |
  | **甲 · 是否构成前置阻塞** | **不构成**（与六名 owner 同向） |
  | **乙 · 落 `code-owner-settings` / `memory-inspect/` 新组件** | **成立**，但 C8 的满足条件须加强（正文二 2.1） |
  | **乙 · 「零改动」分布是否可信** | **可信**；但由它推出的「本案便宜」**不成立**（正文二 2.2） |
  | **丙 · 「统一四态判定」是否提在错误抽象层级** | **成立**（但错法与 `code-owner-chat-core` 所述不同，见正文三） |
  | **丙 · 该收敛的是哪一层** | **L1 提取 + L2 分类 该收敛；L3 呈现语义 不该收敛** |
  | **丙 · `code-owner-chat-bubble` 对第三份拷贝的更正** | **成立**，且推论比其自述更强 —— **计数本身是错的** |
  | **丁 · 零命中对可行性的意义** | **本案唯一一处「零改动」明确不成立的地方** |
  | **戊 · 归一层落哪一层** | **今天不落任何一层**（无两套活形状）；将来若必要 **落 sidecar** |
  | **戊 · 选定 `unchain` 为契约基准** | **成立**，但措辞须由「归一」改为「承认唯一活形状」 |
  | **己 · 「可行」判断能有多硬** | **硬到「形状可行」，硬不到「可用」** —— 二者必须在 `SUMMARY` 分开 |

  **另附五项「不成立」，每一项的限定半句请本庭照录**（正文七）。

- **专业适用范围**: 全系统架构、功能落位（哪一层 / 哪个 owner）、跨层接缝、跨仓契约、共享原语与公共动脉的结构变更、可逆性与单向门判定。**明确不在范围、我不表态的**：(a) 任何具体视觉 / 交互设计，含 tree view 的呈现形态、两个 view 的切换方式、空态文案（归 `expert-ux`，本阶段依 S-0001 范围纪律不议）；(b) 「该不该为 V2 造一套投影」（`expert-llm` 的边界，我只写依赖关系，见请求 7）；(c) `store_owner=unchain` 分支的运行时行为（G8，无人可跑，我不假设）；(d) 「有数据时长什么样」（G2）；(e) 错误码的用户可见文案措辞；(f) 测试覆盖率取舍（`expert-qa`，本案未传唤）。**我只判专业成立性，不判议案要不要做 —— 取舍权属 `chief-judge`。**

- **专业理由**: 四条主线。**(1) 本案的「零改动」分布是一个真实的结构性质，不是运气** —— 它由 facade 的全有或全无探针（18/18，fail-closed）直接产生：该设计使得任何方法要么全组就位要么全组不可用，不存在「这个方法还没接好」的中间态。但同一个性质也解释了为什么「零改动的总和不是零」：**管线是加法的，判定不是**，而本案要新增的恰好是一个判定消费者。**(2) 前案我把病灶定位为「一个缺失构件在八个地方分别显形」；本案的六份取证把它精修了一格 —— 缺失的不是一个构件，是一个抽象层级的划分。** L1（提取）今天已经单点（facade `:57,:77-82`）却没人被强制走它，L2（分类）今天无人拥有，L3（呈现语义）今天分散且**分散是对的**。把三层打成一个包叫「四态判定」，是本案（和前案）一直在用的错误度量；错误的度量直接产出错误的处方，而 `code-owner-chat-core` 的原则性反对与 `code-owner-chat-bubble` 的「真正重复的在底下一层」是同一个发现从两端各到达一次。**(3) 落位与归一都不需要发明，本仓的两个既有形状各自给了答案**：判定的落位由 `boot_readiness`（renderer 单一读在 `SERVICEs/` + 产端 `Object.freeze` 枚举 + 消费端 `require` 而非转写）给出，我实测三条今天全部成立（E-0067）；归一的落位由「谁能 import 权威 enum」给出 —— `kind` 词汇表的权威是 `unchain:MemoryEntryKind`，能 import 它的最近一层是 sidecar，renderer 归一等于手抄一个跨仓 enum，而 boot 先例的注释逐字反对手抄。**(4) 本案的证据条件产生了一个可预测的系统性偏差，它不是纪律问题** —— 当唯一可跑的路径与产品路径不相交时，每个人都会在可跑的路径上取一个真结果，再把结论说到待裁问题所需要的宽度；**需要的宽度由问题定义，可跑的宽度由环境定义**，两者不相交时没有任何个人纪律能弥合。五份 examiner 审查全部命中同一条，是这个结构的直接后果，不是五次疏忽。唯一的处方是把那条路径跑起来（C-A7）。

- **支撑证据**: E-0066（`normalizeUnchainStatus` 逐字复核 + `api.unchain.getStatus` 的唯一产品消费者 —— 第三次独立同向）· E-0067（`boot_readiness` 先例在 `b2385d5d` 上的完整性复核，前案 E-0090 的当前 revision 重测）· E-0068（两侧 entry / `get_tree` 逐字复核；**E-0014 漏记一个字段**；共有 13 字段含全部树结构字段；树装配算法两侧字面等价且含静默孤儿升根）· E-0069（活读路径 10,000 条硬上限，**超限抛错而非截断**，本案无人提及）· E-0070（folder 条目的两端产能与一条写时不变量的不对称，附未核实标记）· E-0071（`context_v2_store_disabled` 与 `memory-inspect/` 目录的独立复核）。跨面引用见「依据」。

---

## 正文

### 一 · 甲 —— D7 在本案是被解开了，还是被具体化了

#### 1.1 先答本庭的第一问：这四条不是同一个问题的四种答案

我把 S-0012 D-A 的四条按 **它们各自回答的问题** 重排，得到的形状与本庭并列的那张表不同：

| 主张方 | 它实际回答的问题 | 层 | 与其他三条的关系 |
|---|---|---|---|
| `code-owner-settings` | 「V2 **配置为开** 吗」（store 侧自述） | sidecar 状态面 | **与 electron 竞争同一问题** |
| `code-owner-electron` | 「本机这次启动 **把 V2 配开了** 吗」（main 侧 rollout 决策 ∧ 一次探测） | main 配置面 | **与 settings 竞争同一问题** |
| `code-owner-shared-arteries` | 「**这一次读** 成功了吗」 | 单次调用面 | **正交，不竞争** |
| `code-owner-chat-bubble` | （无主张）「三种今天一个都没在用」 | 消费面 | **是测量，不是答案** |

**第三条与前两条不构成对立**：一次调用的成败在原理上答不了「是否配置为开」（`getTree` 在 `off` 态 reject，reject 的原因可以是 store 关着、也可以是 sidecar 没起来、也可以是 bridge 缺席），而一个配置状态在原理上答不了「有没有数据」。这正是 `code-owner-settings` 自己在 N3 里写下的那条：**启用/未启用问 status，空/非空问数据调用，这是两次调用的 join，不是一次返回里的判别位。** `code-owner-shared-arteries` 的 E-0039 是这个 join 的 **数据半边**，`code-owner-electron` 与 `code-owner-settings` 争的是 **配置半边的权威归谁**。

**所以真实的分歧只有一条，而不是四条。** 把四条排成同一行这个记录形式，本身正在复制正文三要说的那个处方错层 —— 它把不同层的答案摆成互斥选项。**我不反对原样保留（那是正确的程序处置），我请求补一列标注层**（请求 2）。

#### 1.2 配置半边的那一条分歧，在证据上是可判定的，不是偏好

- **`contextV2Bridge.getStatus()` 在最需要它作答的那一态里根本不返回字段。** `code-owner-electron` 静态追出、`code-owner-shared-arteries` 独立静态追出、`code-owner-runtime` 实跑观察到服务端半边 —— **三条独立路径同向**（S-0010 丁(2) · S-0011 1.2 · E-0010 b3）。**一个在你最需要读它的状态里抛异常的状态源，不是状态源。** 这一条我判成立，`code-owner-settings` 的 F2 前提被证伪的部分成立。
- **`memoryV2` 是一个真实的四态机。** 我复核：`status` 闭集四值（`off` | `pending` | `degraded` | `ready`，产地 `service.js:1039-1055` 三分支 + `:1874-1878` / `:1969-1973`），`configured` 与 `ready` 两个布尔把「配置为关」与「配置为开但没就绪」分开 —— 这正是 `contextV2Bridge.getStatus()` 的 8 字段切不下来的那一刀。

**所以，若必须在两者中选一个作配置半边的权威，答案是 `memoryV2`。** 这一格我与 `code-owner-electron` 同向。

#### 1.3 但它的重述有一半不成立，而那一半正是 D7

`code-owner-electron` 的原话：**「不是没人造，是造好了、跨过 IPC 了、被上一层 normalizer 丢掉了、没人消费」**，并称问题量级从「建构件」降为「认领契约 + 放行一个字段」。

**成立的部分，我第三次独立复核并确认（E-0066）：**

```js
// src/SERVICEs/api.shared.js:330-343  —— 我逐字读过全文
const normalizeUnchainStatus = (status) => ({
  status, ready, url, reason, pid, port          // 6 个键，重建，不是投影
});
```
`memoryV2` 与 `contract` 确实被丢弃。而 `api.unchain.getStatus()`（`api.unchain.js:870-885`）在拿到主进程载荷后 **无条件调 `normalizeUnchainStatus`**，其在 `src/` 的 **产品消费者只有一个**：`src/PAGEs/chat/chat.js:578`。**所以「放行一个字段」这句在破坏面上是准确的 —— 只有一个既有消费者，约 6 行。** 这与 `code-owner-chat-bubble` E-0055 的独立实读一致（第三次同向）。

**不成立的部分，三条，按分量排序：**

**(a) `memoryV2` 是进程全局的，答不了本案每一个消费者都在问的问题。** 本案全部 V2 消费者 —— `chat-bubble` 三个、`chat-core` 两个调用点、以及本案要新增的 tree view —— **全部是 per-`ownerChatId`** 的。`memoryV2` 里没有任何字段随 owner 变化。`code-owner-chat-bubble` §4.2(2) 已经说了这一半（「它答不了这个会话有没有数据」）。**我把它推到结论**：`memoryV2` 可以是两轴中的第一轴，**不能是「那个单一状态源」**。故 D7 索要的那个构件 **不等于 `memoryV2`** —— 它等于「`memoryV2`（配置轴）× 数据调用的成败与码（数据轴）」的那个 join，**而 join 今天仍然没有 owner，也仍然没有一行代码**。

**(b) 「认领契约」不是小事，而它被「放行一个字段」的量级掩盖了。** `memoryV2` 今天是一个 **诊断载荷**：15 个字段，其中 4 个是 sha256 指纹，另有 `platformActiveBlocked` 这种平台内部决策。把它升为产品状态契约是一次 **类型变更**，不是一次转发。`code-owner-electron` 自己认领了契约测试 —— 那是对的，也是必要的 —— **但契约测试是这件事里最便宜的一部分**。真正要作的决定是 **投影**：哪几个字段成为对外承诺。放行而不投影 = renderer 组件开始依赖诊断字段 = 收窄时要同时改 main、改 normalizer、改全部消费者。**这是单向门（正文五第 1 条），而它在「6 行」这个数字里看不见。**

**(c) 「被上一层丢掉了」这句在归因上是准的，在评价上会误导。** `normalizeUnchainStatus` 丢弃 `memoryV2` **不是疏忽，是 allowlist 投影** —— 它与 `code-owner-shared-arteries` 的 A1（facade 不加任何自己的东西）是同一条纪律在两个文件上的两次体现。**「被 normalizer 丢掉」与「normalizer 正在履行它的契约」是同一件事。** 所以放行不是修 bug，是 **改变一条既有纪律的适用范围** —— 这需要 owner 的同意，而 `code-owner-shared-arteries` 在其 P3 里恰好把这件事标成了 **它认不认领共享模块的前置**（「若它日后被暴露，我的模块一夜之间变成第二个权威」）。**两个 owner 各自把对方的动作列为自己的前置，这是 D8「三方主张全部正确、合起来无人负责」在本案的第二次出现。**

#### 1.4 直接回答本庭：解开了还是具体化了

**具体化了，且具体化到了可指派的粒度。D7 的定义性属性 —— 无 owner —— 分毫未变。**

前案 D7 的形式是：**四名角色在互不知情的独立首轮里，各自索要了同一个不存在的构件。**
本案的形式是：**六名 owner 在互不知情的独立首轮里，对这个构件「已经部分存在于哪里」给出了四种不同的答案。**

**从「不可定位」到「可指派」是真实进展。** 但要看清它是什么进展：前案缺的是「它在哪」，本案已经知道它在哪（L1 在 facade、配置轴在 main、数据轴在每次调用），缺的是 **谁拥有把它们合起来的那一步**。而 `code-owner-chat-bubble` 提供了这件事最干净的实证：**它在完全没有 tree view 的情况下，已经独立长出六个站点四种纪律。** 无主构件不会因为无人使用而消失，它会因为无人拥有而复制。

**我对自己前案那句话的经验校准（请本庭记入，这是本发言里唯一一条自我更正）：**

> 前案我说「传唤机制解不了它，只有指派能解」。**本案证明这句话对了一半。传唤机制确实不产生 owner —— 但它能做的最后一件事，是把「指派」从一个开放式判断降为一个二选一，并把两边的价都开出来。** 本案已经做到了：候选 owner 自荐并开价（`code-owner-shared-arteries` P1/P2/P3 + 4 份迁移跨 3 owner）、替代 owner 被指名（`code-owner-electron`，附四行代价对比表）、口径被两个消费方分别约束（B2、6.3）、迁移成本被逐站点计价（6 站点 × ≤5 行）。**这是一份完整的指派材料包，前案没有。**
>
> **推论：现在不指派的成本，已经从「不指派」变成「浪费一次已经付过的取证」。**

#### 1.5 是否构成前置阻塞 —— 不构成

六名 owner 各自独立给出同一理由，我复核后同意，并补一条只有从架构位置能给的：**本案全部可行性结论按「是否依赖 store owner 取值」可以整齐地三分**（正文六 6.2），而 **落在「不依赖」那一类里的结论，恰好覆盖了议案的全部四个待裁问题的可行性半边**。前案 16 项强制回应的任何回应组合都不改变值传递、作用域、channel 存在性与 facade 形状。**故 G1 对本案的可行性论证零杀伤。**

**但我要精确说出什么是被阻塞的**：不是可行性，是 **实施的形状**。三名 owner 各自以不同措辞给出了同一个届时阻塞（`code-owner-settings` F5「拒绝造第 5 份」· `code-owner-shared-arteries` 5.4 末「不接受五份拷贝这个空选项」· `code-owner-chat-core` 6.6「不接受一份折平的映射」）。**三条立场不是三份反对，是同一条约束的三次独立发现**，而第三条比前两条多一个维度（不只反对没有模块，也反对模块太宽）—— 与 `code-owner-chat-bubble` FB2 同向。**这四方在同一件事上收敛，是本案最强的一条结构信号，比任何一份单独的 ASSESSMENT 都重。**

---

### 二 · 乙 —— 落位

#### 2.1 落 `code-owner-settings` / `memory-inspect/` 下新组件：成立，但理由与满足条件都要加强

**我实测（E-0071）**：`src/COMPONENTs/memory-inspect/` 今天只有两个文件（`memory_inspect_modal.js` 30,849 字节 + `memory_inspect_modal.test.js` 2,678 字节）。**它今天不是一个目录，是一个文件加一个测试。** 新增一个组件把它转成多组件特性目录 —— 这是可逆的，且不产生任何新的跨 owner 面。

**落位理由**：`code-owner-settings` 给的是 C8 合规（别再往那 959 行里塞）。那是内部卫生理由。**结构理由是另一条，且它与我前案 §2.3 给接缝 owner 的原则是同一条**：

> **落位应当跟随「谁的形状不对就交付不了」。**

tree view 的消费者是 Inspector；**Inspector 是唯一一方，其交付会因为形状错误而失败**。所以它是唯一有持续动力维护该形状的一方。`code-owner-chat-core` 的义务是按 consumer 声明的形状供给（它已承诺，且实测破坏面为零）。这与前案 C3/C4 的分工完全一致，本案不改判。

**但 C8 的满足条件必须加强，这是我对 `code-owner-settings` 的一条补充：**

`code-owner-settings` 认为「tree view 作为 `memory-inspect/` 下的新组件，C8 即满足」。**新开一个文件不足以满足 C8。** 理由在它自己的 E-0021 里：今天 `memory_inspect_modal.js` 之所以是一个 959 行的塌点，不是因为它长，是因为它 **同时持有请求、判定与渲染** —— `:374-377` 自己发请求、`:398-408` 自己判 `points.length === 0`、`:584-603` 自己渲染，且 `:434-436` 的 5s 静默轮询直接改状态。**一个新组件若原样重复这个三合一，只是把塌点搬了个位置，C8 的立法目的落空。**

boot 先例给的正确形状是 **判定与呈现分离**（我实测 E-0067，`src/SERVICEs/boot_readiness.js` 文件头逐字：模块产出状态，`BootOverlay` 只渲染，且 `boot_progress` 保持哑原语）。**故 C8 的满足条件应写成两条**：(i) tree view 是 `memory-inspect/` 下的新组件；**(ii) 该组件不自持四态判定，只渲染由 L2 给出的类别。** 只有 (i) 没有 (ii)，就是 `code-owner-settings` 自己在 3.2 表格第二行说的那件事 —— **「我可以在自己边界内写出第 5 份四态映射并且它能跑，正因为能跑，才更需要点名」。**

#### 2.2 「几乎所有人零改动」的分布是否可信

**分布可信，且它有一个可检验的结构解释；但由它推出的「本案便宜」不成立。**

**可信的机械原因，我判它不是运气**：链路的每一段今天都已被 **另一个消费者** 走过 —— 第一跳 `listSpaces` 有活的生产消费者（`memory_v2_pending_reviews.js:782`，E-0040），`getTree` 的 channel/handler/preload/main 全段被 `.cjs` 测试逐字断言（E-0029/E-0030），facade 是 18 方法白名单纯透传。而这三者能同时成立，根源在 **`resolveApi()` 的全有或全无探针（18/18，缺一即整个 facade 失明）**：**该设计使得任何方法要么全组就位、要么全组不可用，不存在「这个方法还没接好」的中间态。** 这是一次我要点名的既有设计决策 —— 本案「零改动」是它的直接推论，不是巧合。

**「便宜」这个推论不成立，因为五份「零改动」全部附条件，且条件不相交：**

| owner | 报告 | 条件 |
|---|---|---|
| `code-owner-runtime` | 0 处 | 条件性影响 2：服务端双 owner 归一会 **改动 chat-bubble 三个既有消费者依赖的响应形状**，「破坏面非零，不是只加不减」 |
| `code-owner-electron` | 0 处 | 认领一个契约测试；且 FE5/FE7 把「零改动」的适用域限死在 macOS + 本机不入库的 `.local` 快照 |
| `code-owner-shared-arteries` | 0 处 | Q2 若落它 = 新模块 + **迁移 4 份跨 3 owner**；且明言「只落定义不做迁移，结果是 5 份变 6 份，比不做还坏」 |
| `code-owner-chat-bubble` | 0 处 | FB5 成立即 **6 个站点**；且已认领两个自造码的清除 |
| `code-owner-chat-core` | **6 处** | 唯一报非零者，而它恰好是唯一被要求 **送值** 的那一端 |

**净效果：零改动的总和不是零。** 它是「**管线零改动 + 一个未指派构件的全部代价**」。而这两项之所以能被分开报告，正是因为第二项没有 owner —— **没有 owner 的工作在每个人的边界统计里都是零。** 这是「零改动」分布最该被读出的一层含义，而它与 D7 是同一件事的记账形式。

**故我判**：分布可信；**「因此本案便宜」不成立**，把它读成便宜会直接产出第 5/第 6 份拷贝 —— 这正是 `code-owner-chat-bubble` 从相反方向证明的（**它在没有 tree view 的情况下已经独立长出六份**）。

---

### 三 · 丙 —— 该收敛的到底是哪一层

本庭认为这是本案最该由我判的，我同意。这一节是本发言的主轴。

#### 3.1 「统一四态判定」确实被提在了错误的抽象层级，但不是 `code-owner-chat-core` 说的那个错法

真实的层级有三个，而本案至今的全部讨论把它们打成了一个包：

| 层 | 内容 | 今天在哪 | 是不是重复 | 该不该单点 |
|---|---|---|---|---|
| **L1 · 提取** | `error → code token`，含「无码」这一情形 | **已经单点了** —— `parseContextV2ErrorCode`（`context_v2_bridge.js:57,77-82`） | **是** —— 6 个站点 4 种纪律，**其中 2 个根本不调解析器**（E-0053/E-0054） | **该，且已经是** —— 缺的不是模块，是 **强制** |
| **L2 · 分类** | `code → 传输/启用类别`（bridge 缺席 / sidecar 未起 / 未启用 / 降级 / 未找到 / 参数非法 / **未知**） | **无人** | **是**，且这一层是 **纯函数、与调用语境无关** | **该单点** |
| **L3 · 呈现语义** | `(类别 × 调用语境) → 用户可见状态词` | 各消费者各自持有 | **不是重复** —— 三个面答三个不同问题，词汇各自合法 | **不该单点** |

**这个三分同时满足两位 owner 的主张，并解释了它们为何看起来对立而实际正交：**

- **`code-owner-chat-bubble` 的 B2 口径 `(error) → {code, kind, parsed}` 正是 L1 + L2，且明确止于 L2。** 它同时说明白了「不接的是什么」：任何 **同时** 决定用户可见状态词的模块（= L3）。
- **`code-owner-chat-core` 的原则性反对正是反对把 L3 单点化。** 它引用的那次事故（`context_v2_turn_mutation.js:437-444` 注释）**是一次 L3 折平事故**：把 V1 mirror 腿的码喂进 turn-mutation 的 L3 表，会让用户被告知「对话变了」而对话根本没变。**它蓄意维持两张表，维持的是 L3 的分层，不是 L1/L2 的分裂。**
- **`code-owner-settings` 的「四态判定」措辞横跨 L1~L3 未作区分。** 这就是处方错层的确切形式：它把 **一个该单点的东西（L1/L2）** 与 **一个不该单点的东西（L3）** 打成了一个包，于是任何人接这个包都要么接过头、要么不敢接。

**故我的判定**：**该收敛的是 L1 与 L2；L3 不该收敛。「统一四态判定」若按字面落地会连 L3 一起收 —— 那一部分不成立**（正文七 ①）。

**两条正交的约束都必须进落点的验收标准，缺一不可**：`code-owner-shared-arteries` 的 A4（未知落第三态，永不落「空」或「就绪」）管的是 **L2 的兜底纪律**；`code-owner-chat-core` 的 6.3（同一个码在不同调用语境里是不同的事）管的是 **L2/L3 的边界**。**两者不冲突，`code-owner-chat-core` 自己也是这么说的，我确认这个判断成立。**

#### 3.2 `code-owner-chat-bubble` 对第三份拷贝的更正成立，且推论比它自己说的更强

它报 `code-owner-settings` 对第三份的描述是错的：`memory_v2_trace_audit.js` 根本没有读平面的四态实现，它的 `status` 是流式 trace presenter 的 **另一套词汇**（`Complete/Partial/Legacy/Unavailable`，产自 `SERVICEs/runtime_events/memory_v2_trace_presenter.js:350`）的直通显示，回答的是「这一回合的 bundle 完不完整」，与 store 通不通无关；其唯一真正的 bridge 调用（`:89 readContent`）**一个码都不解析**。

**我判该更正成立。并把它的推论说完：这意味着「四份拷贝」这个计数本身是错的。**

真实分布是两件不同的事，被合并计了一个数：

- **L1/L2**：`chat-bubble` 6 个站点 4 种纪律（2 个不解析）+ `chat-core` 2 个取码点 + `memory-inspect` 的六态机（V1 口味，无「未启用」枝）—— **这一层确实是重复，且比「四份」多**
- **L3**：`journal_reload` 轴 / `pending_reviews` 5 支渲染机 / presenter 轴 / curator 轴 / turn-mutation 两张表 —— **这一层不是重复，是不同问题的不同答案**

**错误的度量直接产出了错误的处方**：数出「四份四态机」→ 处方是「统一成一份四态机」→ 落地会同时收 L1/L2（对）和 L3（错）。**数对了则处方自动正确**：L1/L2 六个站点四种纪律 → 收敛；L3 若干套合法词汇 → 保留。

**这一条我认为是本案最该被 `chief-judge` 看到的一句，因为它是唯一一处「所有人都同意有问题、但对问题是什么的描述是错的」。**

#### 3.3 L2 的类别集合不能由 renderer 定义 —— 一条只有从架构位置看得见的约束

L2 的输入是 **产端的码词汇表**：sidecar 侧 42 个（`code-owner-shared-arteries` E-0037 实测）+ 主进程自造 5 个，**而且还在长**。

**boot 先例给了本仓唯一一条已被验证的解法，我实测它今天仍然完整（E-0067）：**

```
产端：electron/main/services/boot_readiness/service.js:113   const FAILURE_CODES = Object.freeze([...])
                                                      :339   导出
消费端：src/SERVICEs/boot_locale_parity.test.js:44-45
        const { FAILURE_CODES } = require("../../electron/main/services/boot_readiness/service");
        :47   const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];       ← 显式的第四类
```

其注释逐字给了为什么必须 `require` 而不是转写：*「Read the emittable codes STRAIGHT FROM MAIN rather than transcribing them: a hand-copied list silently stops covering a code the day someone adds one.」*

**据此我对 `code-owner-shared-arteries` 的 P1 作判定**：**成立，且是必要条件 —— 但不充分。** P1 说「判据（码词汇表）的权威留在产端」，这是三条里的第一条；它没有覆盖另外两条：**产端须有一个测试断言「每一个可发出的码都在枚举里」**，**消费端须 import 而非转写**。**缺这两条，枚举会在下一个新码上静默失配** —— 而这恰恰是 `code-owner-shared-arteries` 自己的 D-F3 与 `code-owner-chat-bubble` 的 FB6 **各自独立担心的同一件事**：两人都在问「码字符集会不会变」「线格式会不会变」，而两人都只能 **请对方承诺**，没有机制。**boot 先例把「承诺」换成了「测试」，这是它与本案全部现状的唯一实质差别。**

前案 C-ARCH-2 的三条 (a)(b)(c) 在本案 **未被任何证据削弱**，我原样重申为 C-A3。

---

### 四 · 丁 —— `context_v2_store_disabled` 零命中对可行性的意义

**我独立复核（E-0071）**：`grep -rn "context_v2_store_disabled" src --include="*.js"` → **0**。与 E-0048（`code-owner-chat-core`）、E-0053（`code-owner-chat-bubble`）三方同向。

三条意义，按分量排序：

**(1) 它不是一条缺口，它是一个测量结果 —— 而且是本案唯一一个可证伪的结构度量。**

`code-owner-chat-core` 给的形式是：**「同一个权威码在几份拷贝里被正确处理」，今天 0/5。** 我判 **该度量成立且应当被写进裁定文本**（请求 4）。理由是方法论的：D7 从前案至今一直是 **定性论证**（「它没有 owner」「四个人各自索要它」），而定性论证 **无法被证伪，也无法被验收**。0/5 是一个数，下一次测量可以推翻它。**给一个结构性缺口配一个可测量的指标，是把它从辩论移进工程的唯一办法** —— 这也是我在前案给 C-ARCH-2 配三条 import 强制的同一个动机。

**(2) 它把「默认态显示未启用」从一句设计描述变成本案唯一一处「零改动」明确不成立的地方。**

`code-owner-runtime` 的可证伪条件 1 与 `code-owner-electron` 的 FE1 都要求议案显式接受「默认态只能显示未启用」。**但要显示「未启用」，链路上唯一的权威信号就是这个码，而 renderer 里没有一行看它。** 所以「默认态显示未启用」今天不是「少写一个 else 分支」，是 **这条信息从未被 renderer 消费过一次**。

**二选一，且必须选**（C-A1）：消费该码（做 L1/L2 的活），或消费 `memoryV2`（放行 + 投影的活）。**两条都不是零。** 议案若不选，实施时会以「就近取一个」的形式落地，而实证已经给出了「就近取一个」的两个结果 —— 而它们方向相反。

**(3) 它给 D7「没有 owner」提供了本案最干净的实证，比任何计数都干净。**

同一个码、同一条链路、两个 owner：
- `code-owner-chat-bubble` 端：渲染成红色 `role="alert"` 报错块 —— **未启用被归一成失败**
- `code-owner-chat-core` 端：落 `:434` 兜底 FAILED「请重试」 —— **对一个重试永远不会改变的条件说请重试**

而 `code-owner-settings` 的 C1 警告的是 **相反方向**（失败被归一成空）。**三个 owner、三个方向、同一个成因。** 有 owner 的东西不会长成这样。

**一条限定，我如实标注**：`code-owner-chat-core` 自陈该码在其调用路径上「今天大概率不可达」（store off 时 `memory_v2_requested` 也不会打开），并标为推断。**我不采信该推断，也不否定它 —— 它不影响本节结论**：本节的结论建立在「renderer 无一处消费该码」这个 **已复核三次的负向事实** 上，与该码在某一条特定路径上是否可达无关。

---

### 五 · 戊 —— 跨仓归一的落位，与本案的单向门清单

#### 5.1 我自己的取证：两侧的分歧比 E-0014 描述的窄，也比它描述的多一个字段

我逐字读了两侧的 entry 构造与 `get_tree`（E-0068），得到三条 E-0014 没有说的：

**(a) 共有字段有 13 个，且包含全部树结构字段。** `entry_id` · `space_id` · `path` · `parent_path` · `name` · `kind` · `description` · `mime_type` · `revision` · `space_revision` · `source_event_id` · `ref` · `replayed` —— 两侧逐字相同，`ref` 连拼装格式都相同（`pupu://memory/{space_id}/{entry_id}@{revision}`）。**建一棵树需要的 `path` / `parent_path` / `name` 完全同形。**

**(b) E-0014 漏记了一个字段。** `pupu_legacy` 的 `list_entries`（`memory_v2_store.py:7396-7400`）在 `_entry_response` 之外 **另加** `response["deleted"] = row["deleted_at_ms"] is not None`；`unchain` 侧 `_route_entry` **无此字段**。**它对 tree view 是语义承重的**（要不要显示墓碑条目、条目消失时是删除还是不可见）。请提出方补正（请求 6）。

**(c) 树装配算法两侧字面等价，且两侧都含一个静默的孤儿升根。**
```python
parent = nodes.get(item["parent_path"])
if parent is None: roots.append(node)      # 两侧完全相同
```
**净效果**：若某条目的 `parent_path` 在本次返回的条目集里找不到对应条目，它 **静默升为根**，没有任何信号。**条目数不丢（每个条目都进树），但树的形状可以退化成扁平列表，且退化不可观测。**

**而两侧对 `parent_path` 的来源不同**：`pupu_legacy` 是一个 **存储列**；`unchain` 侧是 **计算出来的**（`entry.path.rsplit("/", 1)[0] or "/"`）。**这使得「树是不是树」在两侧依赖于不同的不变量** —— 而这正是 E-0014 完整性限制 (3) 那条被提交方自标「纯推断、勿采信」的外推所指的事。

**我对该推断补了一步取证，并明确它只到一半（E-0070）**：`unchain:src/unchain/memory/workspace/service.py:367,381` 有 `create_folder` 且产 `MemoryEntryKind.FOLDER`；PuPu 侧 `memory_v2_toolkit.py:364,372` 认 `folder` 这个 public_kind。**故「两端都支持 folder」成立。** 但 **「实际会不会产生 folder 条目」我没核到** —— 我另发现 `pupu_legacy` 在写入时 **强制父 folder 存在**（`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"`），**而我在 `unchain:.../workspace/service.py` 未找到等价强制（我只读了那一个文件）**。**这是一个问题不是主张，归 `code-owner-unchain`（第 5 批）。**

**这条为什么进可行性而不是进设计**：若活路径不产生 folder 条目，`nodes.get(parent_path)` 恒为 `None`，`get_tree` 退化为扁平列表，**「tree view」就没有树可显示**。这不是「树长得不好看」，是 **议案的核心对象不存在**。它是 C-A7 里 (a) 那一项，也是本案唯一一条能把议案本身证伪的观察。

#### 5.2 归一层放哪一层 —— 我的表态

**今天不放任何一层，因为今天没有两套活形状需要归一。**

理由是机械的，且 `code-owner-electron` 已经证成：`PUPU_CONTEXT_V2_STORE_OWNER` 在任何由 Electron 启动的 sidecar 里只可能是 `off` 或 `unchain`（无条件覆写在 `process.env` 展开之后、单一 spawn 点、无 attach 分支、`Object.freeze` 的配置、且被 `.cjs` 测试逐字断言 —— S-0010 甲 (1)~(5)）。**`pupu_legacy` 的 `_entry_response` 在产品里结构性不可达。**

**为一个不可达的形状建归一层是 speculative generality，而且它在本案有具体代价**：`code-owner-runtime` 自己已经指出，服务端做双 owner 归一 **会改动 `chat-bubble` 三个既有消费者已在依赖的响应形状**（其条件性影响 2，「破坏面非零，不是只加不减」）。**为统一一个死形状去破坏一个活消费面，是净负。**

**故我判 `code-owner-runtime` 的建议 2（选定 `unchain` 为契约基准）成立，但要求把措辞改一格**：

> 不是「选一个基准然后归一」，是 **「承认只有一个活的形状，并把另一个显式标记为不可达」**。

差别落在验收上，不落在措辞上：前者会产出一个归一层（新构件、新 owner、新单向门）；后者产出的只有 **一条约束**（不得对 `memory_v2_store.py::get_tree` 断言）与 **一次词汇表 owner 指认**（`kind` 的权威是 `unchain:MemoryEntryKind`）。

**若将来 owner 并存或切回（前案 R1 与我前案单向门清单第 4 项的情形），归一的正确落点是 sidecar，即 `memory_v2_unchain_read_adapter.py` 与 `memory_v2_store.py` 对齐字段集与 `kind` 词汇。三条理由：**

1. **`kind` 词汇表的权威是一个跨仓 enum**（`unchain:src/unchain/memory/workspace/models.py:251-255`，我复核为 `FOLDER/MARKDOWN/IMAGE/LINK`）。**归一必须发生在能 `import` 该 enum 的最近一层 —— 那是 sidecar。** 在 renderer 归一等于把一个跨仓 enum 手抄进 JS，而 boot 先例的注释逐字反对这种手抄（「a hand-copied list silently stops covering a code the day someone adds one」）。**同一条理由，同一份注释，第二次适用。**
2. **electron main 与 renderer facade 都以「不碰载荷」为成文契约**：`getContextV2Tree` 原样透传、本层不解析不投影不封顶（S-0010 戊 (5) 第 7 行）；facade 的 A1 明令不做载荷归一，且被其自己的测试守护。**在任一层加归一，是破坏一条已被测试守护的不变量，去换一个在更下游可以免费得到的东西。**
3. **归一在 sidecar 侧对既有消费者是向后兼容的加法**（补字段、映射值）；**在 renderer 侧是每个消费者各做一遍** —— 那正是 D7 本身。

#### 5.3 本案单向门清单

每条标 **单向门 / 半单向门 / 可逆**。依 charter，本领域对不可逆与高风险项负主动指出义务，无人问也要说。

| # | 项 | 判定 | 理由 |
|---|---|---|---|
| 1 | **把 `getMisoStatusPayload().memoryV2` 升为产品状态契约** | **单向门** | 15 字段含 4 个 sha256 与 `platformActiveBlocked`，今天是诊断面。renderer 组件一旦读它，字段集即成对外承诺；收窄需同时改 main + normalizer + 全部消费者。**放行前必须先定投影**，`code-owner-electron` 认领的契约测试是必要不充分（正文一 1.3(b)） |
| 2 | **`normalizeUnchainStatus` 放行 `memoryV2`（不加投影）** | **半单向门** | 约 6 行可回退、且今天只有一个既有消费者（`chat.js:578`，E-0066）；但「renderer 见过诊断字段」不可撤，且它改变了 `api.shared` 一条既有的 allowlist 纪律的适用范围 |
| 3 | **选定 `unchain` 为唯一活形状 / 把 `pupu_legacy` 标记为不可达** | **可逆** | 是一条约束与一次验收对象指认，不产生代码，不改任何契约面 |
| 4 | **在 sidecar 侧做双 owner 字段归一** | **单向门（跨仓）** | 触碰 `MemoryEntryKind` 即跨仓契约变更（前案 R4：`SQLiteContextV2StoreReadStatus` 是 `frozen=True, slots=True` 单一构造点，`unchain-core.lock.json` revision 须同步推进）；且会改动三个活消费者依赖的形状 |
| 5 | **在 renderer 做 `kind` 词汇归一（手抄跨仓 enum）** | **单向门（应避免）** | 手抄的 enum 在下一个新 kind 上静默失配，无失败信号。boot 先例的注释即为其明文反例 |
| 6 | **共享判定模块的口径含 L3（用户可见状态词）** | **单向门** | 三个面的词汇一旦被压成一套，`code-owner-chat-bubble` 已在册的三轴碰撞（`Complete/Partial/Unavailable` 三条轴共用同三个词指三件事）**从缺陷变成强制**；回退需重新分裂词汇 + 改全部文案 + 改 11 个 locale 的键结构 |
| 7 | **`memory-inspect/**` 成为共享判定的导出点** | **单向门** | 前案不成立项 ① 同理：产品面组件目录变成事实公共依赖，且会 **从外部** 压破 C8（`code-owner-settings` 自己拦不住它） |
| 8 | **在 side-menu 挂载接口上追加第三个位置参数（而非改对象参数）** | **单向门** | 两个待送的值都是合法 chat id 形状的字符串，JS 位置错位静默。**今天破坏面为零（E-0042/E-0049）是一个会过期的窗口** —— 第二个调用点出现即失效 |
| 9 | **给 `contextV2Bridge.getStatus()` 加任何字段或参数** | **单向门** | `code-owner-electron` 预先反对 + `code-owner-settings` N3 + `code-owner-shared-arteries` A2 三方同向；且推翻 S-0003 对 `expert-security` 的不传唤判定 |
| 10 | **`ownerChatId` 改成跟随活动会话（而非打开时快照）** | **单向门** | E-0045 已证右键 ≠ 活动会话，错主在链路上 **结构性不可检测**（三道防线全部放行且全部没做错）。一旦成为默认行为，**没有任何一层能事后发现它** |
| 11 | **store owner 切换本身** | **单向门，继承前案不改判** | 前案 R1 / 我前案单向门清单第 4 项。本案凡以「今天的 store owner 行为」为据的结论，切换当天全部需重核 |

**主动指出（charter 义务，无人问）**：第 8 条与第 10 条是本清单里 **唯二「实施时最省事的做法恰好是错的，且错了没有任何信号」** 的两条。第 1 条与第 6 条是 **唯二「做错了要付双向成本（改行为 + 改用户面）」** 的两条。四条我建议都写进裁定文本而不是留给方案庭审自行解释 —— 与 `code-owner-chat-core` 建议 2 同向。

---

### 六 · 己 —— 在这个证据条件下，「可行」能有多硬

#### 6.1 五份审查同时收窄不是五次疏忽，是一个可预测的结构后果

`speaker-of-the-house` 在 S-0016 第二节已经指出这个模式并给了正确的归因方向（G8 = 取证条件）。**我把它的成因说完整，因为它决定了处方：**

> 当 **唯一可跑的路径** 与 **产品实际走的路径** 不相交时，每个人的取证都会自动变成「在可跑的路径上取一个真结果，再把结论说到待裁问题所需要的宽度」。**需要的宽度由问题定义，可跑的宽度由环境定义。** 两者不相交时，**没有任何个人的取证纪律能弥合这个差**。

**这不是取证纪律问题，是取证可达性问题。** 五份审查全部确认真实性、全部判定「引用范围宽于证明范围」，是同一个结构在五个人身上各显形一次。**唯一的处方是把那条路径跑起来** —— 这就是 C-A7，也是 `code-owner-chat-bubble` 建议 4 的方向，我判其成立并加强。

#### 6.2 但空洞的杀伤力是不均匀的，而不均匀是可判定的

我按 **「结论是否依赖 store owner 取值」** 把本案全部可行性结论三分。这个划分是机械的，任何人可复核：

**第一类 · 不依赖（G8 零杀伤，最硬）**
- `code-owner-chat-core` 的 **全部** 结论（值传递与作用域；其不确定性二明确声明在三种 owner 下完全相同）
- `code-owner-chat-bubble` 的 `ownerChatId` 链路（单一 provider、单一挂载、空值 fail-closed，被测试锁住）
- `code-owner-shared-arteries` 的 facade 形状、18 方法锁、不吞码、同步抛转拒绝
- `code-owner-electron` 的 channel/handler/preload 全段存在性与注入顺序
- `memory-inspect/` 的落位空间（我实测，E-0071）

**第二类 · 依赖但已被独立交叉验证（较硬）**
- `store_owner` 取值域二元：`code-owner-electron` 逐行 + `.cjs` 测试断言 + `code-owner-runtime` 静态，**三方同向**
- `off` 态 503 `context_v2_store_disabled`：`code-owner-runtime` 实跑 + `evidence-examiner` 复跑 + `code-owner-electron` 独立静态追出，**三次独立同向**
- `normalizeUnchainStatus` 丢弃 `memoryV2`：`code-owner-electron` + `code-owner-chat-bubble` + **我**（E-0066），**三次独立同向**

**第三类 · 完全落在空洞里（软 —— 而它恰好是议案的核心对象）**
- `unchain` owner 下 `get_tree` 实际返回什么：字段集（E-0014，静态）· `kind` 词汇（静态）· **有没有 folder 条目**（提交方自标纯推断，我补到「两端都支持」为止，E-0070）· 错误是否带 `[code] ` 前缀（`code-owner-chat-bubble` FB6 / `code-owner-shared-arteries` D-F3，两人都只能请对方承诺）· **10,000 条上限的失败模式**（我今天新取，E-0069，静态）

#### 6.3 直接回答本庭：一个「可行」判断能有多硬

> **议案问的「新增一个 tree view 在技术上能不能做」，其答案落在第一类与第二类里 —— 这个问题可以被硬地回答，答案是能。**
>
> **议案默认的「这个 tree view 显示出来的是一棵树」，其答案完全落在第三类里 —— 这个问题本案的证据结构上无法回答。**
>
> **二者被议案的措辞合并了。本案能给出的最强结论是「管线形状可行」，不是「tree view 可行」。**

请本庭把这条区分写进 `SUMMARY`（请求 1）。**不写，裁定会看起来比证据更硬**；而本案已经有过一次同类错误的三重发作（本庭的 E-0006 锚在不执行的代码上 · `code-owner-runtime` 的 Q4 跑在不执行的代码上 · `code-owner-chat-bubble` 的三个消费者测试建在生产不产出的载荷形状上）。**第四次不必再发生。**

#### 6.4 关闭它的实验很便宜，而且它是本案剩下的唯一一次决定性实验

`code-owner-chat-bubble` 建议 4 已提出方向。**我把它收窄成三个具体问题，因为「跑一次 `getTree`」这个说法太宽，跑完可能还是不知道**：

| # | 观察什么 | 它决定什么 | 谁能做 |
|---|---|---|---|
| **(a)** | 返回的条目里 **有没有 `kind == "folder"`** | **议案的核心对象是否存在** —— 无 folder 则 `get_tree` 退化为扁平列表，「tree view」无树可显 | `code-owner-unchain`（第 5 批） |
| **(b)** | 一次 reject 的 **`error.message` 原文** | `[code] ` 线格式与 `[a-z0-9_]` 字符集是否成立 —— 关掉 `code-owner-shared-arteries` D-F3 与 `code-owner-chat-bubble` FB6 两条 | 任何能 `import unchain` 的环境 |
| **(c)** | `entries` 非空时的 **字段集实测** | 关掉 E-0014 的「推断」标记，含我新报的 `deleted` 字段 | 同上 |

**三项都不需要改任何产品代码，都是只读观察。** (a) 是唯一一条能把议案本身证伪的。**这是本案剩下的、最便宜也最决定性的一次实验**，我与 `code-owner-chat-bubble` 同向，并把它列为 C-A7 —— **我唯一一条要求在方案庭审前闭合的取证条件**。

**为什么它只阻塞方案庭审而不阻塞本阶段闭庭**：验收标准必然要对树的形状作断言，而树的形状恰好是未观察的那一项。**议案庭审判「能不能做」不需要它；方案庭审定「怎么验收」离不开它。**

---

### 七 · 「不成立」汇总（请录入 `chief-judge` 强制回应清单，每项的限定半句请照录）

| # | 不成立的对象 | 内容 | 依据 | 若被推翻会怎样 |
|---|---|---|---|---|
| **①** | **「统一四态判定」作为单一处方** | 「把四份四态机收敛成一份」**不成立** —— 它同时收 L1/L2（该收）与 L3（不该收）。**我不否定需要一个共享判定，那是对的；我只否定这个口径。** 正确口径止于 L2（`code-owner-chat-bubble` B2），L3 保留分层（`code-owner-chat-core` 6.3）。**两条正交，都必须进落点的验收标准** | 正文三；E-0047, E-0053, E-0054, S-0017 6.3, S-0018 §3.2 | 产出一个折平的映射：`code-owner-chat-core` 那次「告诉用户对话变了而对话没变」的事故会被从缺陷变成强制，且 `code-owner-chat-bubble` 与 `code-owner-chat-core` 两方均已声明届时 `OBJECTION` 并拒绝消费 —— 落点定了而没人接 |
| **②** | **「四份/五份拷贝」这个计数** | 该计数 **不成立**，因为它把 L1/L2 的真重复与 L3 的假重复合并了。**我不否定重复存在 —— 它比四份多；我否定的是这个数所支持的处方。** `code-owner-chat-bubble` 已实证第三份根本不是同类物 | S-0018 §3.1/§3.2；正文三 3.2 | 错误的度量继续产出错误的处方；且 D7 的进展无法被验收（因为验收会去数「还剩几份」，而那个数从一开始就是错的） |
| **③** | **`code-owner-electron` 重述的隐含量级结论** | 「问题量级从『建构件』降为『认领契约 + 放行一个字段』」**部分不成立**。**我确认其事实半边全部成立**（`memoryV2` 已过 IPC 线、`normalizeUnchainStatus` 丢弃它、放行约 6 行且只有一个既有消费者 —— 我第三次独立复核）。**我只否定量级结论**：(i) `memoryV2` 是进程全局，答不了本案每一个消费者都在问的 per-owner 问题，**故它不能是那个单一状态源**；(ii) 「认领契约」是把一个 15 字段诊断面升为产品面，是类型变更与一次投影决策，**是单向门**；(iii) 「被 normalizer 丢掉」与「normalizer 正在履行契约」是同一件事，放行需要另一个 owner 同意，而那个 owner 已把此事列为自己的前置（P3） | E-0066；S-0010 乙；S-0011 P3；S-0018 §4.2(2) | 「放行一个字段」被当作 D7 的解，实施后得到的是第 6 个信号源而不是第 1 个；且 `code-owner-shared-arteries` 的 P3 未闭合 → 其不认领 → 落点重新悬空 |
| **④** | **`code-owner-shared-arteries` 提的模块落点** | 「共享判定模块落 `src/SERVICEs/bridges/context_v2_state.js`」**不成立**（落错一格）。**我不否定它认领，也不否定它是最合适的 owner 之一；我只否定这个目录。** `bridges/` 的定义性属性是「不校验、不持状态、不加任何自己的东西」，且该属性由其自己的测试守护。**落 `src/SERVICEs/context_v2_state.js`，与 `boot_readiness.js` 同级** | E-0067；S-0011 A1/5.2(1) | 一个持规则的模块进了「不持规则」的目录，A1 从一条可执行契约退化成一句口号；下一个人会以同样理由把校验也写进 `bridges/` |
| **⑤** | **「零改动分布 ⇒ 本案便宜」这个推论** | 分布 **可信**（我给出其机械成因：facade 的 18/18 全有或全无探针）。**我不否定任何一份「0 处必须改动」的报告 —— 它们各自都对。** 我否定的是由它们的合取推出的便宜结论：五份「零改动」全部附条件且条件不相交，其总和不是零，**缺的那一块恰好就是无主构件 —— 没有 owner 的工作在每个人的边界统计里都是零** | 正文二 2.2；S-0004 条件性影响 2 · S-0010 FE5/FE7 · S-0011 5.2(2) · S-0018 FB5 · S-0017 受影响对象 | 本案被当作便宜项推进，实施时在 `memory-inspect/` 里长出第 5 份 L1/L2 拷贝，且它会跑、会通过验收、不会被任何人拦下 —— `code-owner-settings` 自己已经预告了这一点 |

**另重申一项前案的「不成立」，因为它在本案有新的触发面**：`memory-inspect/**` 不得成为共享判定的导出点（前案不成立项 ①，`0000-0003-2026-0807#S-0024` 强制回应 ①）。前案的触发面是 `code-owner-devtools` 的 D-2；**本案的新触发面是：tree view 落进 `memory-inspect/` 之后，那个目录就成了 `src/COMPONENTs/**` 下第一个 V2 浏览面，「判定就近放这里」的引力会显著增大。** 落点不变、理由不变，只是需要被再说一次。

---

### 八 · 与工程铁律的相容性声明

本发言全部意见与 `/Users/red/Desktop/GITRepo/PuPu/.claude/CLAUDE.md` 的工程铁律 **无冲突**，三处需显式说明：

1. **「不新建 context provider」** —— C-A5 建议的模块是 **模块级 store + `subscribe()` / `getState()`**，与 `src/SERVICEs/boot_readiness.js:180-206` 同形（我复核：`export const subscribe` / `export const getState` / `export default { start, retry, subscribe, getState }`），**不是 provider**。`ConfigContext` 无需扩展。**这一条同时回答了 `code-owner-chat-core` K1（不得扩大 `use_chat_stream.js`）与 K5（不得在 side-menu 侧新增 V2 调用）—— 一个模块级 store 两条都不触碰。**
2. **「渲染进程绝不碰 `ipcRenderer`」** —— 本发言全部方案经既有 `src/SERVICEs/bridges/context_v2_bridge.js` 与 `window.unchainAPI` 读，**不新增任何直连**。特别地，我 **不支持** 任何「在组件里直接摸 `window.unchainAPI` 绕过 facade」的做法（`code-owner-chat-bubble` §4.2(2) 已就此拒绝，我同意其判断）。
3. **「Electron 测试有 `.js`/`.cjs` 双胞胎，必须同步」** —— 我注意到 `evidence-examiner`（S-0015 经 S-0016 三(1) 归档）实测这四个 `.js` 是 **一行委托 shim 且不被任何已配置的 runner 收集**。**这不改变本案任何结论**（锁力真实存在，只是全部来自单一 `.cjs`），但它意味着 **「被双胞胎锁住」这句话在本案里表达的保险强度低于铁律的字面预设**。我只登记，处置不在本案范围。

---

## 九 · 本 `ASSESSMENT` 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）· unchain `a4e69f4`（branch `dev`）**，与 E-0001 一致。作业开始时我复测：`git status --porcelain src electron unchain_runtime` **输出 0 行**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**在我作业时点仍然成立**（与 E-0033、S-0017 九的复测结论一致）。**全部只读，未改任何文件、未 commit、未起 sidecar、未起 Electron、未跑应用、未跑任何测试套件。依 A-012 未派生任何子 instance。**

---

#### S-0026 | ASSESSMENT | evidence-examiner → E-0062

- **阶段**: 议案庭审
- **结论**: **E-0062 的核心诊断与全部登记观察，我独立复跑全部复现，其中承重三行逐字节相同。** 提交方对 G8 的诊断 **成立**：`import unchain` 的失败确是 harness 构造缺陷，产品 bootstrap 在零 env 配置下即可解析 —— 我在冷进程中亲验。**但本条的射程窄于 S-0024 引用它时的措辞**：E-0062 登记的是 **四** 个臂逐字节相同（不是五），且 **四个臂只落在两道内部门上**；更要紧的是，**E-0062 的四个 503 臂里没有一个是真正的「V2 不可用」态** —— 它唯一那个真·不可用臂（`UNCHAIN_DATA_DIR` 未设）返回的是 **另一个码** `context_v2_unavailable`。E-0062 **自身的登记文字是诚实的**（它写「四者」、它自标「新建会话→无 lifecycle」是静态推断、它如实记了第五臂的不同码）；越界发生在 **S-0024 的结论散文**（「五种条件坍缩」「400/404 在产品路径上根本不存在」），不在证据条目里。故判 **已验证**，并请本庭按下述射程使用。
- **依据**: E-0062
- **不确定性**:
  1. **200 空态臂（案例 A）的原脚本未留存。** E-0062 归因于「一段 inline heredoc」，该 heredoc 在 scratchpad 中不存在。**我以自建脚本独立重构该臂并逐字符命中登记值**，故该臂成立 —— 但它是 **重构验证，不是回放验证**，保管链上比其余九行弱一档。
  2. 我另行观察到两个 **E-0062 未覆盖** 的真·不可用态（store 目录从未初始化；store 已被 `pupu_legacy` durably 认领而路由配为 `unchain`）**确实** 坍缩进同一条 `503 context_v2_unchain_read_unavailable`。**这是我的观察，不是 E-0062 的内容**，我不把它读进本条；若本庭要用，须由有资格方另行举证。
  3. 与 E-0062 完整性限制 (1) 同：Flask `test_client`，未起真实 sidecar、未过 socket、未过 Electron。renderer 侧我不主张。
  4. 「新建会话必然无 lifecycle」我 **未验证**，提交方亦未主张（其 F2 已自标为最脆一环，归 `code-owner-runtime`）。
- **请求/下一步**:
  1. 请本庭在引用 E-0062 时使用下述射程，而非 S-0024 结论段的措辞：**「在 `store_owner=unchain` 的 `getTree` 端点上，四种不同的 `owner_chat_id` 输入返回逐字节相同的 503，故在该端点上互不可判别」** —— 而 **不是** 「五种条件坍缩」，也 **不是** 「空态与不可用态不可判别」。
  2. 请 `speaker-of-the-house` 注意 E-0062 与 S-0024 之间存在 **一处计数不一致**（证据条目写「四者」，结论散文写「五种」），且第五臂的登记码 **本就不同**。这属引用超出证据，宜按射程受限处理，**不宜据此贬损证据条目本身**。
  3. 请留意：E-0062 与 S-0024 引用的 **`retryable` 字段与 503 全部由产品 `_error_response` 塑形**（真实产品代码），**只有那一行 500 由替身塑形** —— 而该替身与产品 `route_auth._json_error` 是 **逐字相同的表达式**，故 500 那行的形状保真度是精确的，比 E-0062 自陈的「形状等价」更强。
- **评估结论**: 已验证
- **证据编号**: E-0062
- **来源类型**: general
- **真实性**: **已核实，复现度极高。**
  - **前提诊断独立验证通过**：冷进程 `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 -c "import unchain"` → `ModuleNotFoundError: No module named 'unchain'`（与三人所报同一字面）；同一进程内 `import unchain_adapter` 后 → `unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`，`UNCHAIN_SOURCE_PATH=''`、`PYTHONPATH=''`。sibling 回退逻辑在 `unchain_adapter.py:57-72`（`_ensure_unchain_on_path()` 于模块导入时执行）读出，与观察一致。**「三人失败是 harness 构造缺陷」这一诊断成立。**
  - **登记脚本原样复跑**：`/private/tmp/.../scratchpad/g8_http.py`（+ `g8_tree.py`）以登记命令执行，**10 行响应全部复现**，状态序列 `200/200/503/503/500/503/200/200/503/503`。承重三行逐字节相同：503 `{"code":"context_v2_unchain_read_unavailable","message":"Unchain-owned Context V2 read scope is unavailable","retryable":true}`（案例 3/4/6/9）；500 `{"code":"context_v2_failed","message":"Context V2 request failed"}`（案例 5）；案例 2 返回结构完整的嵌套树。
  - **确定性复核通过**：连跑两次，归一化随机 id（`space_id`/`entry_id`/`memory-<hex>`）后 `diff` 为空。E-0062 的确定性主张属实。
  - **未留存臂经重构命中**：案例 A 我自建 store（lifecycle 存在、space 存在、零条目）→ `200 {"entries": [], "owner_chat_id": "chat-e", "space_id": "space-e", "space_revision": 1, "tree": []}`，与登记值 **逐字符一致**。
  - **完整性限制逐条属实**：`/context/v2/status` 实测含 `"rollout_mode": "off"` 与 `"store_owner": "unchain"`（限制 5 属实）；替身对 `tests/test_route_memory_v2.py:31-38` 属实。
  - **revision 与工作树**：PuPu `b2385d5d`(dev)、unchain `a4e69f41`(dev)，均与 E-0062 所钉一致；复跑前后两仓 `git status --porcelain` 均为 0 行。
- **可靠性**: **内部来源 · 提交方自建 harness。(a) 通过；(b) 部分不成立。**
  - **(a) 是否真走产品 `store_owner=unchain` 路径 —— 是，不是替身。** `PUPU_CONTEXT_V2_STORE_OWNER` 由 `configured_context_v2_store_owner()` 在 **请求时** 读取（`route_memory_v2.py:315-326`，无模块级缓存）；`/context/v2/status` 回 `"store_owner": "unchain"`；案例 2 的树由产品 `memory_v2_unchain_read_adapter` 在真实 unchain checkout 上装配。替身只有 `routes._is_authorized` / `routes._json_error` 两个，且 `_root()` 在 `route_memory_v2.py` **仅 `:71` 一处调用**，替身爆炸半径就是这两函数，不及读路径任何一环。**真实 store 全程未被触碰**：每个臂的 `UNCHAIN_DATA_DIR` 都是 `tempfile.TemporaryDirectory()`；未设那一臂在 `:329-335` 即抛出，落盘前短路。
  - **(b) 强否定命题的五个臂 —— 无一构造失败，但「四种不同条件」是四种不同 *输入*，只对应 *两道* 内部门。** 我在 reader 上逐臂捕获异常：
    - 臂 3（`owner_chat_id=''`）→ `owner_chat_id is invalid`
    - 臂 4（owner 从未存在）→ `durable Unchain ownership lifecycle is unavailable`
    - 臂 6（character 形 id）→ **同上，与臂 4 同门**
    - 臂 9（新 store 新 owner）→ **同上，与臂 4 同门**
    即臂 4/6/9 是 **同一个内部条件（该 owner 无 lifecycle 行）被三种输入触达**。**没有伪装成坍缩的失败臂** —— 每个臂都确实构造出了它所声称的输入 —— 但「四种不同条件」在内部状态意义上是 **两种**。对 API 消费者而言不可判别性成立；对「有几种独立失效模式坍缩」这一读法则不成立。
  - **本条最重要的一处可靠性收窄**：**E-0062 登记的四个 503 臂里，没有一个是真正的「V2 不可用/损坏」态**，四个全是「该 owner 没有作用域」。它唯一那个真·不可用臂（`UNCHAIN_DATA_DIR` 未设）返回的是 **不同的码与不同的 message**：`503 context_v2_unavailable` / `"Context V2 storage is not configured"`（我复跑确认，且 S-0024 自己的表也如实记了这一行）。**故「不可用态与空态同码不可分」这一读法，在 E-0062 内部并未被实际检验。**
- **相关性**: **三条结论支撑强度不等，第 1 条只支撑一个更窄的命题。**
  - **结论 1（坍缩 → Q4 在产品配置下不成立）—— 部分支撑。** 登记观察支撑的是：**「在 `store_owner=unchain` 的 `getTree` 端点上，四种 `owner_chat_id` 输入（空 / 从未存在 / character 形 / 无 lifecycle 的新 owner）返回逐字节相同的 503」**。它 **不支撑**：(i) 「五种条件坍缩、message 逐字节相同」—— E-0062 自身写的是「四者」，第五臂码本就不同；(ii) 「新建会话 → 503」—— 依赖「新建会话必然无 lifecycle」，提交方已自标为静态推断（限制 4 / 不确定性 3 / F2），臂 9 证的是「无 lifecycle → 503」；(iii) 「空态与不可用态不可判别」—— 见上，无不可用态臂。**至于这是否足以推翻 Q4「三态可判别」，取决于 Q4 的三态各指什么，属实体争点，我不涉。** 我只登记：本条的射程是 **该端点 · owner-id 形输入 · 该两 revision**，不是「产品路径」整体。
  - **结论 2（legacy 400/404 在产品路径上根本不存在）—— 引用范围明显宽于所证。** 登记观察只证：`getTree` 上空 owner 落 503（legacy 为 400）、坏 `space_id` 落 500（legacy 为 404）。**两个码在 store-owner 分发路径上另有构造点** —— `route_memory_v2.py:~288-300` 在 `_generation_operation_for_store_owner`（`:214`）内显式构造 `context_v2_not_found` + `404`。故「根本不存在」这一全称否定 **未被本条建立**；被建立的是端点级、输入级的窄命题。
  - **结论 3（真·空态 200）—— 完全支撑，且经我独立重构逐字符复现。** 三条中最强的一条。**唯一保留**：该 store 的 lifecycle 由 `_persist_lifecycle` 直写而成，非真实 agent turn 产生，故它证的是 **读路径在该状态下的响应形状**，不证 **真实会话是否会到达该状态**。
- **来源归类**: **内部来源（提交方 `code-owner-unchain` 自建 harness 的运行时观察）。** 其所依赖的产品源码与 unchain 库为两仓内文件，可独立复核，我已复核；harness 本身为一次性构造，除案例 A 外全部留存且我已原样复跑。**不属权威外部来源，亦不属不可靠来源** —— 它是可复现的内部观察，其效力上限由射程而非由来源决定。

#### S-0027 | ASSESSMENT | evidence-examiner → E-0059

- **阶段**: 议案庭审
- **结论**: E-0059 登记的两段实跑 **逐字符复现成功**（heredoc 四行输出全同；既有测试 `13 passed in 0.70s` 全同），源锚点 `unchain_adapter.py:56-72` 引用精确。其两条主张 **均成立**：(a)「零 env 配置下产品自带 bootstrap 把 sibling repo 挂上 `sys.path`」是直接观察；(b)「三名同僚的 `ModuleNotFoundError` 系 harness 未 import 产品 bootstrap，而非环境缺陷」是 **归因**，但经我三项独立验证后 **机制被完整闭合**，属被证据支撑的归因，不是未经检验的推测。仅一处措辞需收窄：「非环境问题」只在「产品不要求安装 unchain」这一意义上成立，sibling 回退 **确实依赖目录布局** —— 该点提交方限制 (1) 已自陈，不构成夸大。
- **依据**: E-0059
- **不确定性**:
  1. **同机同环境复跑不构成第二环境佐证**（证据规则第四节，须查类无保管链）。本次复跑只证成可复现性。
  2. **归因链是我重建的，不是对三人执行过程的直接观察。** 我未原样重建 S-0004 的 E-0010 harness 并复现其失败；我做的是证明「唯一 bootstrap 链」存在且前案记载的替身正好切断它。若三人中任一人的失败另有成因，本条不覆盖。
  3. **打包态（`app.isPackaged`）解析未核实** —— 提交方限制 (2) 自陈并归 `code-owner-electron`，我同样未核实。
  4. 本条 **不闭合 G8**，它只提供方法；G8 的实跑闭合取决于 E-0062，不在本次审查范围。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条；（2）**在案卷中同步更正 G8 的成因定性** —— record.md:628 / :178 / :695 及 E-0010 限制 (3) 中「我环境的缺陷」的表述，据本条应改为「harness 未经产品 bootstrap」，二者对下游的含义完全不同（前者暗示不可修复，后者是可复跑的方法缺陷）；（3）E-0010 限制 (3) 对「被污染输出不得引用」的隔离 **仍然正确**，无需推翻，需更正的只是成因归属。
- **评估结论**: 已验证
- **证据编号**: E-0059
- **来源类型**: general

- **真实性**: **确认，逐字符一致。**
  - revision 核对：PuPu `git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（= `b2385d5d`）；unchain = `a4e69f413c449c5768433ba4dddc5b60b8146991`（= `a4e69f41`）。两仓 `unchain_runtime/` 与 unchain 工作树 **均干净**（本次审查前后各查一次，无改动）。
  - **原样复跑**（未改写一字）`cd .../unchain_runtime/server && env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 - <<'EOF' …`，实得：
    ```
    BEFORE: 'unchain' importable? NO -> No module named 'unchain'
    AFTER importing unchain_adapter:
      unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
      unchain.journal OK
      UNCHAIN_SOURCE_PATH env = ''
    ```
    与登记 **四行全同，无一字符出入**。
  - 既有产品测试复跑：`PYTHONPATH=.:…/unchain/src python3 -m pytest tests/test_memory_v2_unchain_read_adapter.py -q` → **`13 passed in 0.70s`**，与登记连耗时都相同。
  - **源锚点行号精确**：`unchain_adapter.py:56` 为注释 `# Ensure unchain source is on sys.path (dev mode uses UNCHAIN_SOURCE_PATH env)`，`:57` 为 `def _ensure_unchain_on_path() -> None:`，`:72` 为模块级调用 `_ensure_unchain_on_path()`。函数逻辑我整读确认：先取 `UNCHAIN_SOURCE_PATH`（试 `<src>/src` 再试 `<src>` 本身），未命中则 `Path(__file__).resolve().parents[2]` = `…/PuPu` → 兄弟目录 `…/GITRepo/unchain/src`。与观察到的解析结果一致。
  - **无篡改迹象。** `env -u` 的存在使「不依赖任何 env」这一要害可被机械检验，且检验通过。

- **可靠性**: **内部来源；但我另做三项独立验证，其可靠性 *高于* 一次自陈实跑。**
  - **出处**：提交方（`code-owner-unchain`）自编的一次性 harness，加一条 **非其编写** 的仓内既有测试。均为本仓/兄弟仓固定 revision 上的内部产物，非外部权威来源。
  - **独立验证一 —— 读路径入口本身不触发 bootstrap（要害）**：我实跑 `sys.path.insert(0,"."); import route_memory_v2` → 成功；紧接 `import unchain` → **仍 `ModuleNotFoundError: No module named 'unchain'`**。即前案 harness 走的那个入口 **确实不会** 把 unchain 挂上路径。
  - **独立验证二 —— 唯一那条 bootstrap 链被前案 harness 切断**：`memory_v2_unchain_read_adapter.py:25-45` 有 7 条顶层 `from unchain.*` import，但该文件与 `route_memory_v2.py` **均不 import `unchain_adapter`**（grep 实测零命中）。全 server 树内 import `unchain_adapter` 的产品模块只有 `routes.py:6`（另 `interject_router.py` / `route_interject.py`，不在读路径上）。而 S-0007 记载前案 harness 以 `mock.patch.dict(sys.modules, {"routes": fr})` **顶替了 `routes`** —— 唯一那条链因此不曾执行。这与 S-0007 实测 ImportError 来源为 `memory_v2_unchain_read_adapter` 的 `from unchain.journal import …` **完全吻合**。
  - **独立验证三 —— `.venv` 那半边归因同样被推翻**：我实测仓根 `.venv/bin/python -c "import unchain"` → `ModuleNotFoundError`（与三人自陈一致）；但同一 `.venv` 解释器先 `import unchain_adapter` 后 → 解析到 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`。**即 `.venv` 未装 unchain 不是缺陷，产品从不要求它装。**
  - **保管链**：依证据规则第四节，须查类无保管链。本次复跑与原观察 **同机同环境**，故 **不构成独立第二环境的佐证**。
  - 既有测试那一跑 **不是提交方产物**，构成一处弱内部旁证（证明该 revision 上带正确 sys.path 时读适配器整体可运行）。

- **相关性**: **支持其声称的全部内容；一处措辞需精确化；两处它明确不主张的须防止被过度引用。**
  - **技术判断（a）成立且是直接观察**：「产品自带 bootstrap 在零 env 下把 sibling repo 挂上 `sys.path`」—— `env -u` 双清 + 实跑输出 + 源码整读，三重支撑。
  - **对三名同僚的归因 —— 被证据支撑，非推测**。本庭特别请查此点。我的判定依据是：唯一 bootstrap 链（`routes.py:6`）已被机械穷举确认；前案 harness 切断该链有案卷记载（S-0007）；切断后必失败、接上后必成功两侧我均实测。**归因链闭合，无缺环。** 但须精确记录其性质：这是 **机制性归因**，不是对三人执行过程的重演 —— 我未复现三人各自的 harness。若某人的失败另有成因，本条不覆盖（见不确定性 2）。
  - **需收窄的措辞**：「既非环境问题也非结构问题」中「非环境问题」应读作「**产品不要求环境安装 unchain**」。sibling 回退 **本身就是环境依赖**（依赖 PuPu 与 unchain 为兄弟目录），且 CEO 已预告路径会变。提交方限制 (1) 已明确自陈不主张普适性 —— **自陈与主张一致，不构成夸大**，但案卷引用时不得丢掉该限定。
  - **明确不主张、须防过度引用的两处**：(i) 限制 (3) —— 本条只证明 import 可成，**不证明由此得到的行为等同真实 sidecar 进程**；(ii) 限制 (2) —— **打包态解析未核实**。任何据本条推断「产品运行时行为已被观察」的引用都超出其射程。
  - **对 G8 的作用须准确表述**：本条 **推翻 G8 的成因定性**并 **提供方法**，但 **本身不闭合 G8**（它没有跑 `store_owner=unchain` 的读路径，只跑了 import）。G8 的实跑闭合归 E-0062。证据条目自身措辞（「为本案后续一切 `store_owner=unchain` 取证提供方法」）是恰当的，请勿在 `SUMMARY` 中升格为「G8 已由 E-0059 闭合」。

- **来源归类**: **内部来源。** 提交方自编 harness 在本仓 `b2385d5d` / 兄弟仓 `a4e69f41` 上的一次性运行，外加一条仓内既有产品测试的运行。无外部权威来源参与。依证据规则第四节，须查类不得据单次观察推断稳定状态 —— 但本条的观察对象是 **源码中的确定性控制流**（`sys.path` 注入），我两次独立触发（含 `.venv` 解释器）结果相同，就此点而言比典型须查类更稳。

---

#### S-0028 | ASSESSMENT | evidence-examiner → E-0061

- **阶段**: 议案庭审
- **结论**: E-0061 的双臂实跑 **复现成功且确定**（连跑两次，全部计数、kind 集合、parent_paths、树层级逐项相同）。「当且仅当」的 **两个方向各自都有观察支撑** —— 方向一（显式建 folder → 返回、正常嵌套）由 A 臂直接观察，方向二（不建 → 不返回、祖先不物化）由 B 臂直接观察，**不是只跑到一个方向**。我另做静态闭合：全 unchain 仓 folder 条目的产生点 **只有一处**（`create_folder`），`_write` 每次只落一条 entry 且无任何父目录创建，故该双向命题在本 revision 上 **机制性成立**，非仅两点观察。关于仓内既有测试「正是按退化那一路写的」这一陈述 **属实且可逐行指认**。唯一须登记的瑕疵：登记的「实际输出」是 **经删节与手工重排版的转录，不是逐字**（三处差异 **全为排版性，无一处数字/kind/路径/层级被改动**）。
- **依据**: E-0061
- **不确定性**:
  1. **真实用户数据中 folder 的使用率不可知** —— 提交方限制 (1) 已自陈，受 G2 阻断。本条证明的是「退化形状 **可达**，且仓内既有测试正落在其上」，**不是**「真实配置下必然退化」。这是本条与议案之间唯一的缺口，**我不就其份量表态**（属实体争点）。
  2. 我的静态闭合只穷举了 **unchain 仓当前 revision** 的 folder 产生点。`pupu_legacy` 侧（`memory_v2_store.py`）是另一套表与另一套写路径，**不在本条射程内**，也不在 `store_owner=unchain` 路径上。
  3. `image` kind 未构造（限制 (2) 自陈）。但 `image` 与 markdown/link 同走 `service.py:_write`，**不影响方向二**。
  4. 同机同环境复跑，不构成独立第二环境佐证。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条，**并据此正式关闭 E-0014 限制 (3) 的挂起状态** —— E-0014 自标「纯推断、请勿采信」的那条外推，其 **结论成立**而其 **理由（"`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立"）被推翻**；案卷宜同时记两者，勿只记结论；（2）在 `SUMMARY` 中把本条命题登记为 **「退化形状可达 + 既有测试正落其上」**，而 **不是**「产品路径下 tree 必然退化」—— 后者需要限制 (1) 所指的真实数据取证，本案无法提供；（3）「实际输出」字段的转录性质建议在案卷中标注为「摘录」，以免后续复核者按逐字比对判定不一致。
- **评估结论**: 已验证
- **证据编号**: E-0061
- **来源类型**: general

- **真实性**: **复现成功且确定；登记块为摘录而非逐字，三处差异均无实质。**
  - 脚本存在于登记路径 `…/76138b07-…/scratchpad/g8_tree.py`（6916 字节，`8 Aug 17:26`），我整读全文确认其 **只写 `tempfile.TemporaryDirectory()`**，未触碰本机真实 store，未写任何仓内文件。
  - `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 g8_tree.py` **连跑两次**，两次输出相同，且与登记数值逐项一致：
    - **B 臂（不建 folder）**：`entries: 2` · `roots: 2` · `kinds ['link','markdown']` · `parent_paths ['/notes']` · 形状为 `/notes/Architecture.md` 与 `/notes/Upstream.link` **两个平级 root，零嵌套**。
    - **A 臂（建 folder）**：`entries: 3` · `roots: 1` · `kinds ['folder','link','markdown']` · `parent_paths ['/','/notes']` · 形状为 `/notes (folder, children=2)` 下挂两叶。
  - **三处转录差异（据实登记，均为排版性）**：(a) 登记块 **省略** 了 `[bootstrap] unchain.__file__ = …` 两行与每臂的 `top-level keys : ['entries','owner_chat_id','space_id','space_revision','tree']` 行；(b) 列被 **手工对齐**（脚本实际 print 格式为双空格分隔，见 `outline()` 的 f-string）；(c) `['link', 'markdown']` 登记为 `['link','markdown']`（去掉逗号后空格）。**没有任何数字、kind、路径或层级被改动或美化。** 但字段标称「实际输出」，故据实指出其为摘录。
  - 复跑前后两仓工作树 **均干净**，无任何文件被改动。

- **可靠性**: **内部来源；harness 出处核实属实，两臂对照结构经我逐行确认无污染。**
  - **出处属实**：`build()` 的建库序列确与 `pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py:54-215` 的 `_seed_owner` / `_seed` 同构 —— 同样的 `admit_context_v2_store_owner(requested_owner=STORE_OWNER_UNCHAIN)`、同样五个 SQLite store（context / compiler / memory / curator / promotion）+ `SQLiteLegacyBootstrapService`、同样补 `memory_host_v2_schema` 与 `memory_review_proposals` 两表、同样 `_initialize_lifecycle_schema` + `_persist_lifecycle`、同样 `bind_workspace` → `MemoryWorkspaceService`。
  - **两臂唯一差异确为 `make_folders` 布尔**：我逐行核对 `build()`，`if make_folders:` 只多出一次 `ws.create_folder(path="/notes", …)`，其余写入（`write_markdown` `/notes/Architecture.md`、`create_link` `/notes/Upstream.link`）与 revision 递增逻辑（`bump()`）两臂完全共用。**对照实验干净，无第二变量。**
  - **bootstrap 确为唯一 sys.path 来源**：脚本 `:20 import unchain_adapter` 是全文唯一使 unchain 可导入的动作，实跑打印解析到 sibling repo。与 E-0059 同一机制，可交叉印证。
  - **保管链**：须查类无保管链；同机复跑不构成第二环境佐证。

- **相关性**: **两个方向各自成立，我另做静态闭合把它从"两点观察"升为"机制性命题"；关于既有测试的陈述属实。**
  - **方向一（显式建 → 返回）**：A 臂直接观察 —— `create_folder("/notes")` 后，`kinds` 含 `folder`，`roots` 降为 1，`/notes` 节点 `children=2`。**成立。**
  - **方向二（不建 → 不返回，祖先从不自动物化）**：B 臂直接观察 —— 写 `/notes/Architecture.md` 与 `/notes/Upstream.link` 之后，`parent_paths` 为 `['/notes']` 而 `/notes` **自身不在 entries 里**。**成立。**
  - **我补的静态闭合（不在登记内，属我的独立取证）**：
    - `unchain:memory/workspace/service.py:661-730` 的 `_write` —— 每次调用只落 **一条** entry，全文 **无任何父目录创建、也无父目录存在性校验**。
    - `unchain:persistence/sqlite_memory_v2.py:843-902` 的 `list_entries` —— **无 kind 过滤**的 path-prefix 查询（`substr(e.path_key,1,length(?)) = ?`），返回底层原始行，不合成任何虚拟 folder。
    - **全仓 folder 条目产生点只有一处**：`service.py:367 create_folder`（`:381 kind=MemoryEntryKind.FOLDER`）。另两个调用方 `memory/toolkit/services.py:228`（agent 工具面）与 `persistence/sqlite_memory_host_v2.py:948`（promotion 落地）**均经由它**。其余 `MemoryEntryKind.FOLDER` 命中（`sqlite_curator_review_decision_v2.py:594`、`sqlite_memory_host_v2.py:706`）是 **反序列化分支，非产生点**。
    - 故「folder 条目 **当且仅当** `create_folder` 被调用」在本 revision 上是 **机制性成立**，而非仅由两次实跑外插。
  - **退化机制的落点经我核实**：`pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:443-448` —— `parent = nodes.get(item["parent_path"])`；`if parent is None: roots.append(node)`。**无 folder 条目 ⇒ 全部条目升为 root ⇒ tree 与 entries 同构（扁平）。** 与 E-0014 静态比对的描述一致。
  - **关于仓内既有测试的陈述 —— 属实，可逐行指认**：`tests/test_memory_v2_unchain_read_adapter.py` 全文 **零 `create_folder`**（grep 实测）；`_seed_owner` 唯一写入是 `:106 workspace.write_markdown(path=f"/notes/Architecture-{suffix}.md", …)`，**不建 `/notes`**；断言 `:238 assert reader.memory_tree().entries == (owner_a[1],)`（单条目）与 `:322 assert tree["tree"][0]["entry_id"] == entry.entry_id`（该 markdown **直接位于 tree 根**）。**这正是退化形状。** 该测试实跑 13 passed（E-0059 已跑，我复核）。提交方在限制 (4) 中明确将此标为「静态阅读 + 该测试实跑通过，非我对其意图的主张」—— **该自我限定恰当**，我同样不就测试作者的意图作任何推断。
  - **本条 *不* 支持、且未主张的**：真实配置下 tree 是否 **实际** 退化。这取决于真实数据里 folder 的使用率，受 G2 阻断。**请勿将本条升格为「产品路径下 tree 必然退化」** —— 那是本条与议案之间唯一的缺口，且提交方限制 (1) 已明确自陈。作为验证者我只登记该缺口存在，**不评估其对议案的份量**。

- **来源归类**: **内部来源。** 提交方（`code-owner-unchain`）自搭 harness 在 PuPu `b2385d5d` / unchain `a4e69f41` 上的运行，建库序列取自本仓既有测试 fixture；相关产品源码为两仓内部文件。无外部权威来源参与。依证据规则第四节，须查类不得据单次观察推断稳定状态 —— 本条经我 **两次连跑** 且观察对象为确定性控制流（无随机、无并发、无外部 IO），就可复现性而言强于典型须查类；但其 **不可外推至真实数据分布**，此为独立限制，与观察次数无关。

#### S-0029 | ASSESSMENT | evidence-examiner → E-0064

- **阶段**: 议案庭审
- **结论**: 七行观察 **全部独立复现，无篡改迹象**。其结构判据 **比提交方自陈更强** —— 本庭在传唤中提出的「只支持这一个实例」之忧不成立。「`degraded` 是占位串不是准确描述」**成立，且不是 `:489` 的重复**：我以三臂对照证明该字段在四种互不相同的真实状态下恒为 `'degraded'`，而相邻的 `backend` 字段确实会变。附 **三处引证/表述缺陷** 与 **一处必须随证据一同引用的收窄**。
- **依据**: E-0064
- **不确定性**: 见下「不确定性」四项
- **请求/下一步**: 见下「请求」四项
- **评估结论**: 已验证
- **证据编号**: E-0064
- **来源类型**: general
- **来源归类**: **内部来源，已由第二方以不同 harness 独立复核。** 提交方自建 harness 在 PuPu `b2385d5d` / unchain `a4e69f41` 上的运行时观察，非外部系统响应，无第三方权威背书。我 **未复用提交方的 `g8_tree.py`**，改以仓内既有 fixture（`pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py` 的 `_seed_owner` 建库序列）自写 harness 重建，并另加三臂对照。两仓 revision 经我 `git rev-parse` 实测与登记一致。依证据规则第四节须查类无保管链 —— 但本条的承重部分由 **同 revision 仓内源码（自证类）** 独立支撑，保管链弱点在此近乎不咬。同机同环境，惟 E-0059 所指 import 缺陷 **在我处未复发**。

---

- **真实性**: **成立。** 独立重建后逐条比对，E-0064 登记的七行 **全部命中**：

  | 登记值 | 我的复现 |
  |---|---|
  | `_vector_index = None` | `None` ✓ |
  | `vector_error = ''` | `''` ✓ |
  | `lexical_fallback = False` | `False` ✓ |
  | `matched_by = [['lexical_fallback','fts'], …]` | `[['lexical_fallback','fts']]` ✓ |
  | route keys `['backend','owner_chat_id','query','results','vector_status']` | 五键逐字一致 ✓ |
  | `backend = 'fts5'` | `'fts5'` ✓ |
  | `vector_status = 'degraded'` | `'degraded'` ✓ |

  **关于本庭点名的 import 检验：我未卡住。** 在 `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH -u PUPU_CONTEXT_V2_STORE_OWNER` 下，`import unchain` 先失败（`No module named 'unchain'`），仅执行 `import unchain_adapter` 之后 `unchain.__file__` 即解析到 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`，且 `UNCHAIN_SOURCE_PATH` 与 `PYTHONPATH` 均为空串。**E-0059 关于「harness 构造缺陷、产品自带 bootstrap 在零 env 下即挂 sys.path」的诊断，在我手上成立。**

  **四处缺陷（均不动摇任一观察值）**：
  1. **引证行号错** —— `backend` 实际在 `memory_v2_unchain_read_adapter.py:488`，非登记的 `:485`（`:489` 的 `vector_status` 正确）。同一错误亦见 S-0024 正文。
  2. **「取得方式」不可按其字面复跑** —— 其命名的 `g8_vector.py` 实为 3 行残桩（`# just inline minimal` 之后为空文件），真实探针是 inline heredoc 且 **未留存**。故本条的可复现性 **依赖我的独立重建，不依赖提交方留存的脚本**。
  3. **类名不准** —— 实际持有 `_search` 的是 `BoundSQLiteContextV2ReadService`（`sqlite_read_v2.py:399/:402`），非其完整性限制 (1) 所写的 `SQLiteContextV2ReadService`（`:280/:283`）。实质路径无误（后者在 `:389` 产出前者），仅命名瑕疵。
  4. `matched_by` 一行以 `…` 省略 —— 我的 store 只建 1 条目故只得 1 个元素，**省略部分不可核**。

- **可靠性**: **足以支撑结构性结论，且本条的结构判据比提交方自陈的更强。**

  1. **该实例确以产品路径构造，非测试便利构造。** 我经 **产品入口** `open_pupu_unchain_memory_v2_reader(root_dir=…, owner_chat_id=…)` 取得 reader —— 与 `route_memory_v2.py:351` 的调用同一入口；其 `search_entries` 即 `:1228` 路由所调的同一方法。实测 `reader._reader` 类型为 `unchain.persistence.sqlite_read_v2.BoundSQLiteContextV2ReadService`，`._search` 为 `unchain.memory.workspace.search.WorkspaceSearchService`。
  2. **提交方低估了自己的判据。** 其完整性限制 (2) 称「更稳的判据是 `sqlite_read_v2.py:418` 的构造实参」。**实际判据更强**：`SQLiteContextV2ReadService.__init__`（`:283-…`，形参仅 `context_store` / `memory_store` / `compiler_store`）与 `BoundSQLiteContextV2ReadService.__init__`（`:402-…`，形参仅 `database_path` / `scope` / `journals` / `artifacts` / `checkpoints` / `workspace`）**均无 `vector_index` 形参**；`_vector_index` 在 unchain 全源 **只有一处赋值**（`search.py:149`，`__init__` 内），无 setter；`src/unchain/persistence/` 内 **零处** 调用会保留 vector_index 的 `with_link_repository`。
  3. **故在此读路径上，任何调用方都无从接入向量索引 —— `None` 是构造上不可达其他值，不是「这一次实例恰好是 None」。** 读私有属性在此处只是对静态可导事实的一次确认，**本庭传唤中提出的「只支持这一个实例」之忧不成立**。
  4. 其完整性限制 (4)「临时 store」**在本条不咬** —— `_vector_index` 不是 store 内容的函数（与 E-0061 不同，那里该限制真实咬）。

- **相关性**: **支持其命题，且确属新信息，不是 `:489` 的重复。**

  本庭要求区分的两件事，我在 **同一产品构造实例** 上以对照实验分开：

  | 臂 | `_vector_index` | `raw.vector_error` | → route `vector_status` | route `backend` |
  |---|---|---|---|---|
  | 基线（产品接线，未触碰） | `None` | `''` | `'degraded'` | `'fts5'` |
  | A 注入 **健康** 向量索引 | 存在且可用 | `''` | `'degraded'` | `'fts5'` |
  | B 注入 **损坏** 向量索引 | 存在且抛错 | `'unavailable'` | `'degraded'` | `'fts5'` |
  | C 强制词法索引不可用 | `None` | `''` | `'degraded'` | **`'degraded'`** |

  - **C 臂是阳性对照**：相邻字段在同一 harness 下确实会变（`'fts5'` → `'degraded'`），故 `vector_status` 的恒定 **不是我探针的假象**。
  - **净效**：S-0008 从 `:489` 认定该字段是 **常量**；但常量仍可能碰巧为真 —— **B 臂即是碰巧为真的那一种世界**。E-0064 补上的是 **被指称的状态并不存在**：产品接线下没有任何东西处于降级，向量通道是 **缺席（absent）** 而非 **受损（impaired）**。「占位串不是准确描述」是这两个合取，**第二个合取由本条首次确立于 unchain 读路径**（S-0004 的 `NullVectorBackend` 属 PuPu 自有向量后端，是另一条路径）。
  - 其新增的 **词汇碰撞** 亦复现：同一次查询同时出现 `matched_by=['lexical_fallback','fts']`（评分通道名，`search.py:264`）与结果级 `lexical_fallback=False`（`search.py:117`）。
  - **一处必须随证据一同引用的收窄** —— E-0064 称「另经 E-0062 案例 8 在 **完整 HTTP 路径** 上复现同样两个字段值」。**「完整」过宽**：E-0062 自陈完整性限制 (1) 为「Flask `test_client`，**未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发**」。准确表述应为「**完整 Flask 路由层（`test_client`）**」。且 **E-0062 自身仍是未验证的须查类**，该佐证继承其待决状态。
  - **范围声明经核准确** —— 其完整性限制 (1) 只覆盖 PuPu Context V2 读路径，并明确不否认 unchain 支持向量。我复核其反证引用 `sqlite_long_term_memory_v2.py:104-106`（该处 **确传** `vector_index=self._vector_index`）与 `:176`，**属实**。**这是本批须查类中第一条援引范围不宽于所证范围的证据。** 惟下游引用须保留「**读路径**」限定语：不加限定的「根本没接向量后端」宽于所证。
  - 其自标未核实项（`"degraded"` 是否为某未落地后端的前向占位）我同样未核，**且该命题不为其结论所需**，提交方已正确标注为非主张。

---

- **不确定性**:
  1. 原始探针脚本未留存。我的复现虽逐字一致，仍不能排除提交方当时另有未记录的 env 或步骤 —— 本条的可复现性实际由我的独立重建承担。
  2. `matched_by` 行的 `…` 省略部分不可核。
  3. 全部观察取自临时 store；**本机真实 store（G2）仍未被观察**。这对 `_vector_index` 无影响（结构判据独立于 store 内容），但对 `matched_by` 的实际取值分布有影响。
  4. 未起真实 sidecar、未经 socket、未经 Electron 转发。**renderer 最终看到什么，本条与 E-0062 均不主张。**

- **请求**:
  1. 请将 `backend` 的引证由 `:485` 改为 `:488`（`:489` 无误），E-0064 与 S-0024 正文同处一并改。**该行号属 `pupu:` 侧**，依提交方在 S-0024 自设的边界（跨仓半边只作锚点引用），此项更正宜由 `code-owner-runtime` 确认。
  2. 请将「完整 HTTP 路径」改为「完整 Flask 路由层（`test_client`）」，并标注该佐证依赖 **尚未验证的 E-0062**。
  3. 建议本庭在 `SUMMARY` 中将本条的结构判据 **升格记载** 为「两个读服务 `__init__` 均无 `vector_index` 形参」，而非提交方所写的「构造未传实参」—— 前者排除了任何调用方接入的可能，后者没有。
  4. 若 Q3 前提据本条成立，建议同时记明一项 **纯事实登记**（不含实体主张）：`vector_status` 在产品读路径上 **恒为 `'degraded'` 且与真实状态无关**，四种互不相同的真实状态下取值不变。

#### S-0030 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **五份新审查产出六项更正，其中一项是对本庭自己转述的更正，另一项改变了本案最重要那条证据的成因定性。** 本条逐项归档。**六项全部为「引用/转述」层面的更正，无一条推翻证据本身** —— 五条须查类证据全部「已验证」
- **依据**: S-0026, S-0027, S-0028, S-0029, S-0024, E-0059, E-0061, E-0062, E-0064, E-0010, E-0014
- **不确定性**: 无
- **请求/下一步**: 更正 1、2 的补正责任依[证据规则第一节](../../../codex/lifecycle/evidence-rules.md)归 `code-owner-unchain`；更正 6 归 `code-owner-runtime`。**本庭不代为补强，只归档更正并在 `SUMMARY` 中按更正后的射程引用**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T22:10:00-07:00
- **影响范围**: S-0024 的结论散文；G8 的成因定性；E-0010 / E-0014 的限制表述；本庭 S-0009 与 S-0016 的相关转述

  **一 · 对本庭自己的更正（先说这一条，因为错的是本庭）**

  S-0024 归档后，本庭在向 `chief-judge` 的阶段性转述中 **原样复述了它的结论散文**：「**五种**条件坍缩为同一条 503」「400/404 在产品路径上根本不存在」。

  **`evidence-examiner`（S-0026）认定这两句都超出了 E-0062 实际证明的范围，而且认定得很精确 —— 越界不在证据条目里，在结论散文里。** E-0062 **自身的登记文字是诚实的**：它写的是「**四**者」，它自标「新建会话→无 lifecycle」为静态推断，它 **如实记了第五臂返回不同的码**。

  **本庭复述了一个未经复核的概括，而没有回去核对它所引证据条目的原文。** 这与本案反复出现的那个模式是同一件事，只是这次发生在本庭身上：**取一个真结果，再把结论说到需要的宽度。** 本庭登记此项，不辩解。

  **二 · 六项更正逐条**

  | # | 更正对象 | 原表述 | 更正后 | 依据 |
  |---|---|---|---|---|
  | **1** | S-0024 结论散文（**+ 本庭的转述**） | 「**五种**条件坍缩为同一条 503」 | **四个臂**，且四臂 **只落在两道内部门上**（臂 4/6/9 是 **同一个内部条件「该 owner 无 lifecycle 行」被三种输入触达**）。对 API 消费者不可判别性成立；对「有几种独立失效模式坍缩」这一读法 **不成立** | S-0026 |
  | **2** | S-0024 结论散文 | 「legacy 的 400/404 在产品路径上 **根本不存在**」 | **全称否定未被建立**。`route_memory_v2.py:~288-300` 在 `_generation_operation_for_store_owner` 内 **另有** `context_v2_not_found` + 404 的构造点。被建立的是 **端点级、输入级的窄命题** | S-0026 |
  | **3** | **G8 的成因定性**（本庭 S-0009 第五节 · S-0016 · E-0010 限制 (3)） | 「**我环境的缺陷**」「三人无一能实跑」 | **「harness 未经产品 bootstrap」** —— 是 **可复跑的方法缺陷**，不是不可修复的环境问题。**二者对下游的含义完全不同。** E-0010 限制 (3) 对「被污染输出不得引用」的隔离 **仍然正确，无需推翻**；需更正的 **只是成因归属** | S-0027 |
  | **4** | 对 E-0059 作用的读法 | （易被读作）「G8 已由 E-0059 闭合」 | **E-0059 推翻 G8 的成因定性并提供方法，但本身不闭合 G8**（它只跑了 import，未跑 `store_owner=unchain` 读路径）。**闭合归 E-0062。** 证据条目自身措辞恰当，**请勿在 `SUMMARY` 中升格** | S-0027 |
  | **5** | E-0061 的命题登记 | （易被读作）「产品路径下 tree **必然** 退化」 | **「退化形状 *可达*，且仓内既有测试正落其上」**。真实配置下是否 **实际** 退化，取决于真实数据里 folder 的使用率，**受 G2 阻断**。提交方限制 (1) 已自陈 | S-0028 |
  | **6** | E-0014 限制 (3) 的挂起状态 | 「纯推断、请勿采信」 | **正式关闭：结论成立，但其理由被推翻。** 原理由「`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立」**是错的** —— 一个 enum **可被表达** 不等于实例 **会被产生**。**案卷须同时记两者，勿只记结论** | S-0028 |

  **三 · 两项本庭据审查人请求执行的登记**

  1. **E-0061 的「实际输出」标注为「摘录」** —— 审查人认定其为 **经删节与手工重排版的转录，不是逐字**（三处差异 **全为排版性，无一处数字 / kind / 路径 / 层级被改动**）。标注的目的是 **避免后续复核者按逐字比对判定不一致**，不含贬损。
  2. **E-0064 的两处引证更正**：`backend` 实际在 `memory_v2_unchain_read_adapter.py:**488**`（非登记的 `:485`；`:489` 的 `vector_status` 无误），同一错误亦见 S-0024 正文，**该行号属 `pupu:` 侧，更正宜由 `code-owner-runtime` 确认**；「另经 E-0062 在 **完整 HTTP 路径** 上复现」应改为 **「完整 Flask 路由层（`test_client`）」**，且该佐证 **继承 E-0062 的射程限制**。

  **四 · 三项方向相反的更正 —— 审查人认定证据 *强于* 提交方自陈（本庭一并登记，不只记不利的）**

  1. **E-0064 的结构判据被升格。** 提交方写「构造未传实参」；审查人实测 **两个读服务的 `__init__` 形参里都没有 `vector_index`**，且 `_vector_index` 在 unchain 全源 **只有一处赋值、无 setter**。**前者没排除调用方接入的可能，后者排除了。** 故 `None` 是 **构造上不可达其他值**，不是「这一次实例恰好是 None」—— **本庭在传唤中提出的「只支持这一个实例」之忧，经查不成立。**
  2. **E-0064 是本批须查类中 *第一条* 援引范围不宽于所证范围的证据**（审查人原话）。**本案连续七条「引用宽于所证」的链条在此断开。**
  3. **E-0061 由「两点观察」升为「机制性命题」。** 审查人另作静态闭合：全 unchain 仓 folder 条目产生点 **只有一处**（`create_folder`），`_write` 每次只落一条 entry 且 **无任何父目录创建、无父目录存在性校验**，`list_entries` **无 kind 过滤、不合成虚拟 folder**。故「当且仅当」在本 revision 上 **机制性成立**。

  **五 · 一项审查人主动划清、本庭照录的界线**

  S-0026 的审查人另行观察到 **两个 E-0062 未覆盖的真·不可用态**（store 目录从未初始化 / store 已被 `pupu_legacy` durably 认领而路由配为 `unchain`）**确实** 坍缩进同一条 503。**其明确声明：「这是我的观察，不是 E-0062 的内容，我不把它读进本条；若本庭要用，须由有资格方另行举证。」**

  **本庭照此办理，不采纳该观察为本案证据。** 登记它，是因为它指向一个 **比 E-0062 已证范围更坏** 的可能，而该可能今天 **没有合格证据支撑** —— 若 `chief-judge` 认为该方向重要，须另行取证。

#### S-0031 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **闭庭门禁十一项逐项确认完毕：九项满足，两项不满足。本庭不闭庭，不提交 `SUMMARY`。** 依 [quorum 第二节](../../../codex/lifecycle/quorum.md)（法定必到 8/9）与[闭庭门禁第 11 项](../../../codex/lifecycle/speech-protocol.md)（承重证据复核未启动）。本条呈报 `chief-judge` 须裁的 **四项程序事项**，庭审材料 **原样保留待其裁定后闭庭**
- **依据**: S-0001 … S-0030；E-0001 … E-0071；`ruling.md#R-0001`
- **不确定性**: 本条 **不作任何实体汇总** —— 汇总是 `SUMMARY` 的内容，而 `SUMMARY` 在闭庭门禁满足前不得提交。本庭 **不以 NOTICE 变相提交 `SUMMARY`**
- **请求/下一步**: **请 `chief-judge` 就第三节四项择定，本庭据以补足门禁后提交 `SUMMARY`**
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T22:30:00-07:00
- **影响范围**: 本案闭庭条件

  **一 · 闭庭门禁逐项确认**

  | # | 门禁 | 确认 |
  |---|---|---|
  | 1 | 必到角色均已提交职责要求的输出 | **不满足**。法定必到 9 人，**已交付 8 人**。`expert-llm` 因 Fable 5 硬配额零产出（S-0019 / E-0057），且依 `0000-0003-2026-0807#R-0001` 第二节本庭 **无权** 以其他模型重派 |
  | 2 | 每项具证明力的事实主张都有证据编号，每项证据都有验证状态 | **满足**。**71 条证据** 均登记验证状态与证据类型 |
  | 3 | 每个 material `QUESTION` 已获答或列为已知缺口 | **满足**。**G8 与 G10 已闭合**（E-0059 提供方法 / E-0062 实跑闭合 / E-0061 关闭 E-0014 挂起项）；G1 · G2 · G9 结构性保留 |
  | 4 | 所有 blocking `Witness` 传票均已回应 | **不适用**。本案 **未签发任何 `Witness` 传票** —— 无出庭角色提出满足事实缺口四项门禁的传唤请求 |
  | 5 | blocking 性质争议均已有 `Procedural Judge` 裁定 | **不适用**。无传票，无争议 |
  | 6 | 每项 `OBJECTION` 已标记 | **不适用**。本案 **`OBJECTION` 动作零次提交**。全部反对以 `Expert` 的「不成立」（`expert-architecture` 5 项）与 `Code Owner` 的具名反驳 / 预先反对形式出现，**已分别录入强制回应清单与分歧栏**。**本庭登记：这是 `0000-0002-2026-0807` 所记同一现象的再次发生**，交 `codex` |
  | 7 | 可供裁定的方案彼此可区分且带风险/可逆性/验收标准 | **不适用**。议案庭审不产生方案，9 名必到者 **无一提交 `PROPOSAL`**，符合阶段要求 |
  | 8 | `Expert` 的「不成立」与 `Dimension Owner` 的「反对」已进强制回应清单 | **满足**。`expert-architecture` **5 项「不成立」** 已录入（每项的限定半句照录）。**无 `Dimension Owner` 在案** —— 评估对象为「组织变更议案」，本案是产品议案，未命中。依 [summons 第一层例外](../../../codex/lifecycle/summons.md)，本庭注明：**本案四个组织维度均未被覆盖，这是规则结果，不是缺席** |
  | 9 | 每一条 **被质疑** 的证据均有审查结论 | **不适用**。无 `OBJECTION` 型质疑 |
  | 10 | 每一条 **须查类** 与 **证言类** 证据均有审查结论 | **满足**。**11 条须查类中 10 条已获结论**（E-0010/0012/0024/0029/0036/0049/0051/0059/0061/0062/0064 —— 其中 E-0051 经 `ruling.md#R-0001` 裁为「可采，射程受限」）。**第 11 条 E-0057 本庭判定不路由**，理由与本庭对该项裁量的自我举报见 S-0019 第四节，**已交 `codex` 审查** |
  | 11 | **承重证据复核已完成** | **不满足，且尚未启动**。承重集合依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md) **由 `SUMMARY` 机械导出**，而 `SUMMARY` 因门禁 1 未满足 **不得起草定稿**。**二者构成一个必须按序解开的依赖**：门禁 1 → `SUMMARY` 草案 → 承重集合导出 → 复核 → `SUMMARY` 定稿 → 闭庭 |

  **二 · 本庭对第 11 项的成本预告（`chief-judge` 据以裁量时需要知道）**

  承重集合是 `SUMMARY` 在 **分歧 / 强制回应事项 / 候选方案 / 风险** 四项中点名发言的全部 `E-####`，**一跳、不做传递闭包、自证类不豁免**。

  按当前案卷粗估：九份 `ASSESSMENT` 的 `依据` 字段合计引用 **50 条以上** 不重复证据，其中 **约四成为自证类**。**即第 11 项一旦启动，是一次数十条规模的复核批次**，且依第六节它 **同时是时效性复核**（本案已持续约六小时，其间 `code-owner-shared-arteries` 已实测工作树 dirty 条目由 8 增至 12）。

  **本庭不建议压缩该批次，也不建议跳过** —— 那是本案 **唯一** 尚未执行的证据关卡，而本案已 **七次** 出现「引用宽于所证」。**但本庭有义务预告其成本，因为它会显著改变本案的总耗时，而 `chief-judge` 的路径选择应当在知道这一点的前提下作出。**

  **三 · 呈请 `chief-judge` 裁定的四项**

  **(1) `expert-llm` 的处置 —— 门禁 1 的唯一阻塞，三条路径本庭已列于 S-0019 第三节，不重复、不推荐、不排序。**
  本庭补一条 S-0019 未及的信息：**`expert-architecture` 已就其边界写明依赖关系**（S-0025 请求 7）—— 其落位结论在 `expert-llm` 判「不造投影」或「押后」时 **无条件成立**；在判「造」时 **落位不翻转，但需追加一条容器形态的待裁问题**。**故 `expert-llm` 的缺席对本案的杀伤面，比 S-0019 登记时已知的更小。** 这不构成本庭对路径的推荐。

  **(2) S-0018 请求 1（要求本庭改写 `FRAMING` 甲 的措辞）** —— 本庭 S-0021 第二节(3) 拒绝自行处置并上呈；`procedural-judge` **不接手、不预表倾向**（`ruling.md#R-0001` 第四节第 3 项）。**仍待显式处置。**

  **(3) 七条证据「引用宽于所证」的系统性模式是否重审** —— 本庭 **不主张重审**；`procedural-judge` **显式不采为射程依据，且不裁**（超出其授权清单），**附议本庭处置**。**仍待显式处置。** 本庭补一条本条归档后的新事实：**该链条已在 E-0064 处断开**（S-0029 认定其为「本批须查类中第一条援引范围不宽于所证范围的证据」）。

  **(4) 是否将本庭在庭审中登记的四项 **超出本案待裁问题** 的发现另立 case** —— 本庭 **不代立案**：
  - `.js` / `.cjs` 双胞胎为 **一行委托 shim 且不被任何 runner 收集**（S-0015）—— 工程铁律所述「唯一会静默失效的测试形态」在实测中的形态与预设不同
  - 本仓 **两个 worktree 根**，测试忽略模式只排除一个（`/worktrees/` 不命中 `.worktrees/`）（S-0015）
  - **活读路径 10,000 条硬上限，超限抛错而非截断**（E-0069）—— 与「本层不封顶」（E-0032）在两个不同层，合起来净效果是 **载荷上界由 sidecar 单方面决定，且到达上界时用户看到的是错误不是部分树**
  - **`vector_status` 在产品读路径上恒为 `'degraded'` 且与真实状态无关**（S-0029 三臂对照，四种互不相同的真实状态下取值不变）

  **四 · 本庭在本案中的四次自我举报，一并上呈（不隐去，不打包淡化）**

  1. **E-0006 锚在不执行的代码上**（S-0006 第一节）—— 逐段核了「代码在不在」，没核「哪一段会被执行」，而本案这两件事给出相反答案
  2. **证据分类脚本以标题子串判类，误标 E-0039**（S-0016 第一节）—— 本次方向是「多路由」（浪费），但同一缺陷的反方向是「漏路由」（直接违反门禁 10 且无人察觉）
  3. **派遣 `procedural-judge` 时要求其自行写入 `ruling.md`**（S-0023 第二节）—— 与其角色定义冲突，其拒绝执行并指出，本庭的任务书错误。**归档权与裁定权分离是刻意设计，本庭若得逞，破坏的正是这条分离**
  4. **原样复述 S-0024 未经复核的结论散文**（S-0030 第一节）—— 「五种条件坍缩」「400/404 根本不存在」两句均超出 E-0062 所证，而证据条目本身是诚实的

  **本庭请 `codex` 就上述四项一并作合法性审查。** 归档而非无声修补的理由与前案相同：**主持人是本案唯一不受其他角色审查的环节。**

#### S-0032 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: `chief-judge` 就 `expert-llm` 作出程序裁定 **R-0002** —— **把 `0000-0003-2026-0807#R-0001` 的 Fable 5 撤销明确扩展到 `expert-llm`，性质为「换模型重新可派遣」，quorum 名单不减员**。正文见 [`ruling.md#R-0002`](ruling.md)。本庭已完成三份文档的落盘核验，并以 **显式 `model: "opus"`** 第二次派遣 `expert-llm`。**闭庭门禁第 1 项的阻塞路径已打开，但在其交付前仍未满足**
- **依据**: `ruling.md#R-0002`, S-0019, S-0031, E-0057
- **不确定性**: 第二次派遣的结果 **未知**。本庭 **不预设成功**；若再次失败，依 R-0002 获准 action 3 **照实归档失败签名，不重复造证据**
- **请求/下一步**: 待 `expert-llm` 交付后，本庭补足门禁 1，随即启动门禁 11 的承重证据复核，然后提交 `SUMMARY`
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-08T23:00:00-07:00
- **影响范围**: 本案 quorum 与闭庭条件

  **一 · 三项本庭执行并核验的动作**

  1. **落盘核验已完成**（结果见 `ruling.md#R-0002` 后的核验表）。四项全部通过，其中最要紧的一项是 **反向核验**：`expert-qa` / `expert-security` 两份 charter 的 `model: fable` **仍在，未被连带修改** —— 与裁定第二节「严格逐角色、非部门级豁免」一致。**本庭刻意核这一项，因为撤销被悄悄扩大与撤销未落盘，是同一类错误的两个方向。**
  2. **第二次派遣已发出**，显式 `model: "opus"`，任务书载明不再有 Fable 限制，并 **附上了本案在其缺席期间产生的全部与其边界相关的新证据**（S-0008 / S-0024 戊 / S-0029 关于 `degraded` 与 `disabled` 的三轮取证），以免其重复取证。
  3. **任务书另附 G8 的闭合方法**（E-0059：产品自带 `unchain_adapter._ensure_unchain_on_path()` 在零 env 配置下即可解析），并明告 **不要重蹈三人先后失败的 harness 构造缺陷**。

  **二 · 一处编号不一致，本庭按实质归档并留痕**

  指派文本称本处置为「路径 2」，而 S-0019 第三节的 **路径 2 是「明示无需到场」**，**路径 1 才是「比照 R-0001 授权在非 Fable 模型出庭」**。指派文本同时 **逐字排除** 了前者。

  **本庭按实质归档为路径 1，不自行改写指派文本的编号。** 理由与本案已立的同一条界一致（S-0021 第三节 · `ruling.md#R-0001` 第五节）：**主持人替裁定者「把编号改对」，与替一方把话说圆、把证据挂对，是同一种越界。** 实质无歧义，故不请求澄清；登记备查即可。

  **三 · 本条不改变的**

  - **门禁 1 仍未满足** —— R-0002 解除的是 **不可派遣状态**，不是出庭义务。`expert-llm` **仍是法定必到者**，quorum 仍为 8/9 直至其交付
  - **门禁 11 仍未启动**，且仍依赖门禁 1 先解
  - S-0031 第三节 **(2)(3)(4) 三项待 `chief-judge` 处置的事项维持原状**（`code-owner-electron` 的强制回应清单诉求 · S-0018 请求 1 · 七条过度引用链的复核 · 四项 side case 候选）—— 指派文本明示 **暂未裁定，维持「待处置」**，本庭 **不催、不代拟、不因闭庭推进而将其淡化**
  - 本庭 **四项自我举报** 已转 `codex`，依指派 **在本案内不再处理，照实归档保留**

# 承重证据复核 · 批次 A（12 条）

`evidence-examiner` · 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md) · 2026-08-08

> 编号 `S-0033`~`S-0044` 为顺位建议（案内最高已归档为 `S-0032`）。**编号权归 `speaker-of-the-house`**，如与并发批次冲突请径行重排，内容不受影响。

---

## 全批时效前提（一次性核验，覆盖 12 条）

| 项 | E-0001 登记 | 复核实测（2026-08-08，本次） | 判定 |
|---|---|---|---|
| PuPu HEAD | `b2385d5d` / `dev` | `b2385d5dc7951887b6aeebd4001d17b4cd78af83` / `dev` | **一致** |
| unchain HEAD | `a4e69f4` / `dev` | `a4e69f413c449c5768433ba4dddc5b60b8146991` / `dev`，`git status --porcelain` **0 条** | **一致，且工作树全净** |
| `git status --porcelain -- src electron unchain_runtime` | 空 | **空** | **一致** |
| PuPu 工作树 dirty/untracked 总数 | **8**（E-0001）→ **12**（E-0028 重测） | **49**（21 modified + 28 untracked） | **已漂移** |
| dirty 条目分布 | 「**全部**位于 `.claude/court/cases/**`」 | **不再成立** —— 分布于 `.claude/agent-memory/`（32）、`.claude/agents/`（1）、`.claude/codex/`（2）、四个案卷目录（14） | **已失效** |

**结论**：**三个产品目录 `src/` `electron/` `unchain_runtime/` 在本次复核时点仍为零 dirty，两仓 HEAD 与 E-0001 所载完全一致。故本批 12 条的全部 `file:line` 锚点，其 revision 前提在闭庭时点依然成立。** E-0001 完整性限制所要求的重测（「未检查是否有并发会话在庭审期间改动产品目录」），本次为**第四次**满足，且是**最晚时点**的一次。

**同时须记入闭庭产出的一条**：庭审七小时内工作树由 8 涨至 49 条，增量**全部落在 `.claude/` 下**（多为本次庭审各角色新写的 agent memory 与案卷）。这使 E-0001 的 dirty 计数与「全部位于 `.claude/court/cases/**`」两句话**在今天为假**，但**不触及其承重部分**（产品目录零 dirty + 两仓 revision）。

**一条贯穿全批的元发现**：本批 12 条**无一条发生行号漂移、内容改动或文件消失**。我查出的全部缺陷，无例外地是**登记时即已存在的保真缺陷**（grep 转录不全、范围端点差一行、出处误植），**不是时效衰减**。就时效性而言，**本批 12 条全部仍然成立**。

---

#### S-0033 | ASSESSMENT | evidence-examiner → E-0001
- **阶段**: 议案庭审
- **结论**: 两仓 revision 锚点与三个产品目录的零 dirty 状态在闭庭时点全部仍然成立，承重部分完好；但其完整性限制中的 dirty 计数（8 条）与分布断言（「全部位于 `.claude/court/cases/**`」）今天均为假。
- **依据**: E-0001
- **不确定性**: 我只在本次复核时点测了一次。与 E-0001 一样，**不能证明整场庭审期间无并发改动**，只能证明四个时点（S-0002 / E-0028 / 前两次重测 / 本次）各测一次都是零。
- **请求/下一步**: 引用 E-0001 时只引 revision 与「产品目录零 dirty」两项；**dirty 计数与分布两句须以本复核的实测值（49 条，跨 `.claude/` 四个子树）替换**，或删去不引。
- **评估结论**: 已验证
- **证据编号**: E-0001
- **来源类型**: general
- **真实性**: `git rev-parse HEAD` 双仓实跑，与登记值逐字符一致；`git status --porcelain -- src electron unchain_runtime` 输出为空，与登记一致。与 `0000-0005-2026-0807#E-0001` 交叉核对，PuPu HEAD 相同一节亦属实。**dirty 计数已由 8 漂至 49，且不再全部位于 `.claude/court/cases/**`。**
- **可靠性**: 可复跑的 git 原语，无解释余地。
- **相关性**: 支持「本庭全部 `file:line` 锚点的固定 revision」这一用途，成立且是本批其余 11 条的时效前提。漂移的两句不服务于该用途。
- **来源归类**: 内部来源

---

#### S-0034 | ASSESSMENT | evidence-examiner → E-0002
- **阶段**: 议案庭审
- **结论**: 5 人路径边界机械命中、概念名候选与裸文件名歧义三块原样复现；但「未命中（**2 个**）」一块**不复现**，今天为 **10 个**。同时查出分类判据缺陷：该证据的输入 `case.md` 不入库且可变，**不满足自证类判据**。
- **依据**: E-0002
- **不确定性**: 未命中项由 2 增至 10，新增 8 条全部是 `case.md` 自身在庭审中新增的跨案援引（`0000-000{1,2,3}` 的 `evidence.md` / `record.md` / `ruling.md`）。我**未能取得** E-0002 观察时点的 `case.md` 副本（整个案卷目录为 untracked，无 revision 可比），故无法逐字证明这就是唯一成因 —— 但成因指向明确。
- **请求/下一步**: 引用 E-0002 时**只引 5 人命中块与概念名/歧义块**。**「未命中（2 个）」一句不得承重**，需要该结论者须重跑取当前值。另请 `speaker-of-the-house` 注意：**该证据登记为自证类系分类错误，正确分类为须查类**（一次性观察 + 观察对象观察后可变）；该缺陷**因本次承重复核已被实际治愈**，无需另行补程序。
- **评估结论**: 已验证
- **证据编号**: E-0002
- **来源类型**: general
- **真实性**: 原样复跑 `python3 .claude/skills/case/summon.py …`。5 人命中块（`code-owner-electron` 12 / `code-owner-runtime` 3 / `codex` 1 / `code-owner-settings` 1 / `code-owner-shared-arteries` 1）**逐字命中**；概念名候选 `expert-llm ← memory_factory` 逐字命中；`context_v2_bridge.js` 与 `service.js` 两条歧义逐字命中。**「未命中…（2 个）」今天输出「（10 个）」**，原 2 条（`pupu:/memory/projection`、`pupu:src/COMPONENTs/`）仍在列。
- **可靠性**: 工具本身可复跑、确定性；但其**输入不是 revision 固定的制品**，这是本条的结构性弱点，而非工具缺陷。
- **相关性**: 所声称支持的是「S-0003 传唤第一层的机械命中部分」—— 该部分完好，相关性成立。漂移块不在其声称支持的范围内。
- **来源归类**: 内部来源

---

#### S-0035 | ASSESSMENT | evidence-examiner → E-0003
- **阶段**: 议案庭审
- **结论**: 两个挂载点、两组 props、四处行号全部逐字复现，零漂移。本批质量最高的三条之一。
- **依据**: E-0003
- **不确定性**: 无。E-0003 自陈的限制（只覆盖字面标识符 `MemoryInspectModal`，未追动态挂载）我未扩大核查，该限制原样保留。
- **请求/下一步**: 可径行承重，无需附条件。
- **评估结论**: 已验证
- **证据编号**: E-0003
- **来源类型**: general
- **真实性**: `side_menu.js:48-50` = `lazy(() => import("../memory-inspect/memory_inspect_modal").then(m => ({default: m.MemoryInspectModal})))` 逐字命中；`:772-779` = `<MemoryInspectModal open/sessionId/chatTitle/onClose … />` **范围端点精确**（772 为开标签，779 为 `/>`）。`settings/memory/index.js:14` 静态 import 逐字命中；`:474-478` = `{open, onClose, mode="long_term"}` **范围端点精确**。独立重跑 grep：`src/` 下排除 `memory-inspect/` 自身后，`MemoryInspectModal` **有且仅有** `settings/memory/index.js:14,474` 与 `side_menu.js:48,50,772` 五处，即**恰好两个挂载点**。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 支持「两个挂载点 props 集合不同、是两条不同调用契约」以及「side-menu 那一处落在 `code-owner-chat-core` 边界」，两者均由所引原文直接导出。
- **来源归类**: 内部来源

---

#### S-0036 | ASSESSMENT | evidence-examiner → E-0004
- **阶段**: 议案庭审
- **结论**: 承重的负向主张「`src/COMPONENTs/**` 下零 `getTree` 消费者」**独立实跑确认为真**；但其「全部足迹」清单**不是所述命令的输出** —— 其中一行的出处误植，另有两处遗漏。
- **依据**: E-0004
- **不确定性**: 我同样只覆盖字面标识符，E-0004 自陈的「未核实字符串拼接旁路」限制原样保留、未消除。
- **请求/下一步**: 「`src/COMPONENTs/` 零命中」与「`use_chat_stream.turn_mutation_v2.test.js:249` 已 stub」两条可承重。**`electron/main/services/unchain/service.js:2108` 一行须改由 E-0006 引用**（E-0006 以正确出处登记了同一行），不得作为 `getTree` grep 的产物引用。
- **评估结论**: 已验证
- **证据编号**: E-0004
- **来源类型**: general
- **真实性**: 原样重跑 `grep -rn "getTree\|GET_TREE" src electron --include="*.js" --include="*.cjs"`。**核心负向结果确认**：`grep -rn "getTree\|GET_TREE" src/COMPONENTs` → **零命中**。登记的其余各行（facade `:39,108` · preload bridge `:86,219` · preload channels `:115` · shared channels `:152` · register_handlers `:30,642` · 五个测试文件）**全部命中且行号精确**。**三处缺陷**：**(1) 出处误植** —— 登记行 `electron/main/services/unchain/service.js:2108 const getContextV2Tree` **不是该命令的输出**；字面 `getTree` 在 `service.js` 中**出现 0 次**（`getContextV2Tree` 不含该子串），我另行确认 `:2108` 该行确实存在且内容无误，但它进不了这张表。**(2) 遗漏** —— `electron/preload/bridges/context_v2_bridge.js:12`（注释行）命中而未列入「全部足迹」。**(3) 范围虚指** —— `api_contract.test.cjs` 登记为 `:89,260-262`，实际命中为 `:89,260,262`，`:261` 无命中。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep。缺陷属登记保真，非来源问题。
- **相关性**: 所声称支持的是 `case.md` Q1「`src/COMPONENTs/` 下零消费者」并将其收窄 —— 该用途完全成立，三处缺陷均不触及它。
- **来源归类**: 内部来源

---

#### S-0037 | ASSESSMENT | evidence-examiner → E-0005
- **阶段**: 议案庭审
- **结论**: 四个 import 点、三个 chat-bubble 消费者、两串 `ownerChatId` 行号表、两组错误码处理点，**全部逐字复现，零缺陷**。本批最干净的一条。
- **依据**: E-0005
- **不确定性**: 无新增。E-0005 自陈「未追传递依赖」的限制原样保留。
- **请求/下一步**: 可径行承重，无需附条件。
- **评估结论**: 已验证
- **证据编号**: E-0005
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "context_v2_bridge" src --include="*.js"` 排除测试 → **恰好四个非测试文件**，其中三个在 `src/COMPONENTs/chat-bubble/`，与登记完全一致（`memory_v2_journal_reload.js:4` · `memory_v2_trace_audit.js:2` · `memory_v2_pending_reviews.js:4` · `use_chat_stream.js:89`）。登记的 `:2-4` 范围经定点读取确认为完整 import 语句（`import contextV2Bridge, { parseContextV2ErrorCode } from …`）。`ownerChatId` 行号表 **`journal_reload.js:239,248,262,271,282,286,291…` 与 `trace_audit.js:66,77-78,90,248,259,269,353,355,358,378` 逐个命中，无一错位**。错误码处理点全部证实：`journal_reload.js:274`（`parseContextV2ErrorCode(error) || "context_v2_journal_unavailable"`）· `:294` · `:391`（`context_v2_invalid_cursor`）· `:516-521`（`isAvailable()` 失败分支 → `context_v2_unavailable`）；`pending_reviews.js:31-38`（八个 `context_v2_*` 错误码常量表）· `:183`（`code || "context_v2_request_failed"`）· `:299`（`isAvailable()`）。登记原文用「**等**错误码」措辞，与实际的开放码集相符。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 支持「`src/COMPONENTs/` 下并非零 V2 读消费者，只是零 `getTree` 消费者」与「这三个消费者今天就拿得到 `ownerChatId`」—— 两者均由所引原文直接导出。
- **来源归类**: 内部来源

---

#### S-0038 | ASSESSMENT | evidence-examiner → E-0006
- **阶段**: 议案庭审
- **结论**: 六段链路 + 测试锚点共七处，**全部存在且行号命中**；仅 Flask 路由一处范围起点差一行。「`ownerChatId` 在 Electron main 层是必需参数」这一硬事实经原文确认。
- **依据**: E-0006
- **不确定性**: E-0006 自陈「未运行 sidecar、未观察任何返回体」的限制原样保留、未消除；其运行时半边由 E-0010 / E-0012 承担，不在本条。
- **请求/下一步**: 可承重。引用 Flask 路由段时**行号写 `:1111-1120`**（E-0013 已按 `:1111` 正确登记，两条互为佐证）。另注：E-0006 只记了 `getContextV2Tree` 必需 `ownerChatId`，**未记它同时必需 `spaceId`**（`service.js:2110`），该补充在 E-0018。
- **评估结论**: 已验证
- **证据编号**: E-0006
- **来源类型**: general
- **真实性**: 逐段定点读取。**store 段 `memory_v2_store.py:7408-7434` 范围两端精确**（`def get_tree(` … `return {**listing, "tree": roots}`），签名 `(*, owner_chat_id, space_id, allow_long_term=False, namespace="")` 与组树逻辑逐字符合。**主进程段 `service.js:2108-2116` 范围两端精确**，且 `:2109` 确为 `requireContextV2OwnerChatId(payload?.ownerChatId)` —— 「第一行就是」属实。`channels.js:152` = `GET_TREE: "context-v2:get-tree"` 逐字命中；`register_handlers.js:30,642`、`preload/bridges/context_v2_bridge.js:86-87,219`、`preload/channels.js:115`、`src/SERVICEs/bridges/context_v2_bridge.js:39,108` 全部逐字命中。测试锚点 `context_v2_service.test.cjs:500`（测试名逐字一致）与 `:513`（断言 `…/spaces/space-1/tree?owner_chat_id=chat-1` 逐字一致）精确。**唯一缺陷**：Flask 路由登记为 `:1112-1120`，但其引用的 `@api_blueprint.get("/context/v2/memory/spaces/<space_id>/tree")` 装饰器实际在 **`:1111`**，落在所记范围之外；`:1112` 是 `@_endpoint`。差一行，内容无误。
- **可靠性**: 仓内 tracked 文件，跨 `unchain_runtime` / `electron` / `src` 三个产品目录，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 所声称的是「在当前 revision 上确认链路各段存在，不确认运行时行为」—— 边界划得准确，相关性成立。
- **来源归类**: 内部来源

---

#### S-0039 | ASSESSMENT | evidence-examiner → E-0007
- **阶段**: 议案庭审
- **结论**: 四个函数/路由锚点命中，**「零 store-owner 感知」的负向 grep 独立复跑为 0 匹配**，承重部分成立；两处措辞过强需收窄。
- **依据**: E-0007
- **不确定性**: E-0007 自陈「静态读取、未实跑该端点（本机无 Qdrant 数据）」的限制原样保留 —— 我同样无法实跑，**该限制未消除**。
- **请求/下一步**: 可承重。引用时须改两处措辞：路由范围写 `:406-453`；**删去或改写「该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`」**，改为「该文件的全部数据源访问均经 `memory_factory`」——后者为真且足以支撑同一结论。
- **评估结论**: 已验证
- **证据编号**: E-0007
- **来源类型**: general
- **真实性**: `_project_vectors` **`:344-370` 范围两端精确**（`def _project_vectors(` … `return coords, variance`），内部 `np.linalg.svd` 于 `:353` 逐字命中。`_kmeans_2d_numpy` **`:219` 精确**。`/memory/long-term/projection` **`:456` 精确**。`grep -n "store_owner\|memory_v2\|context_v2" route_projection.py` → **0 匹配，独立复跑确认**。**两处缺陷**：**(1)** `memory_projection` 路由登记为 `:406-452`，装饰器 `:406` 正确，但函数体实际延伸至 `:453`（`return jsonify({"error": str(exc)}), 500`），范围端点少一行。**(2)** 完整性限制称「该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`」**不准确** —— 实际另有 `memory_factory._load_session_state`（`:423`）与两处 `getattr(memory_factory, …)`（`:430,:435`）。四者**全部经 `memory_factory`（V1）**，故不改变结论方向，但「唯一」为假。
- **可靠性**: 仓内 tracked 文件 + 可复跑负向 grep。
- **相关性**: 所声称支持的是「`/memory/projection` 走 V1 旧向量集合逻辑，与 V2 store 无关」—— 零匹配 grep 直接支持该结论，且上述 (2) 的四个访问点全落 V1 侧，反而强化它。
- **来源归类**: 内部来源

---

#### S-0040 | ASSESSMENT | evidence-examiner → E-0008
- **阶段**: 议案庭审
- **结论**: 两条决定性负向结果（关键词表 0 文件命中、V2 侧 14 个 GET 路由）**逐字复现**；但第一条命令的登记转录**不是该命令的输出** —— 实际 8 行，登记 5 行，且遗漏了一个测试文件命中。
- **依据**: E-0008
- **不确定性**: E-0008 自陈「这是一个负向证明，强度受限于关键词表」的限制**完全成立，我未能消除也未尝试扩表**。若存在以完全不同命名实现的投影逻辑，本条与我的复核均看不到。
- **请求/下一步**: 承重时**只引第二、三条命令的结果**（0 文件 / 14 路由），它们是该负向结论的实际承重面。**第一条的「命中仅…5 处」一句为假，须删去或替换为实测 8 行。**
- **评估结论**: 已验证
- **证据编号**: E-0008
- **来源类型**: general
- **真实性**: 三条命令原样重跑。**第二条 `grep -rln "def .*projection_points\|\"x\":\|coords\|pca\|PCA\|umap\|t_sne\|tsne" memory_v2_*.py route_memory_v2.py` → 命中文件数 0，逐字复现。** **第三条 `grep -n "@api_blueprint.get" route_memory_v2.py` → 恰好 14 条，逐字复现**（并顺带交叉证实 E-0006/E-0013 的 `:1082/:1111/:1123` 三个路由行号）。**第一条不复现**：登记称「命中仅 `route_projection.py:219,345,353` 与 `routes.py:5,87`」，实际输出 **8 行**，多出 `route_projection.py:220`（`import numpy as np`）、`route_projection.py:296`（`root._kmeans_2d_numpy(...)`）与 **`tests/test_models_catalog_route.py:644`** —— 最后一条本应被 `grep -v "/tests/"` 滤掉，但该路径渲染为 `tests/…` 而非 `./tests/…`，**过滤器实际未生效**。三处遗漏**全部仍落在 `route_projection.py` / V1 侧**，故负向结论不受影响。
- **可靠性**: 仓内 tracked 文件 + 可复跑命令。缺陷属登记保真，非来源问题。
- **相关性**: 所声称支持的是「V2 侧无等价于 `/memory/projection` 的二维散点坐标生成逻辑」—— 由第二、三条命令直接支持，成立。
- **来源归类**: 内部来源

---

#### S-0041 | ASSESSMENT | evidence-examiner → E-0009
- **阶段**: 议案庭审
- **结论**: 「V2 连原始 embedding 都不出库」的三个结构性依据 —— `VectorHit` 字段集、`NullVectorBackend` 为默认、`status()` 硬编码 `"disabled"` —— **全部逐字复现**。两处范围端点差一行，非实质。
- **依据**: E-0009
- **不确定性**: E-0009 自陈「未逐一追查 `OllamaQdrantBackend` 内部是否在别处泄出向量」的限制**我同样未消除**；其「类型层面已封闭」的论据（`query() -> list[VectorHit]`）我确认属实，但类型标注不是运行时保证。
- **请求/下一步**: 可承重。若需要「向量不出库」作为**运行时**结论而非类型结论，须另行取证 `OllamaQdrantBackend` 实现体。
- **评估结论**: 已验证
- **证据编号**: E-0009
- **来源类型**: general
- **真实性**: `VectorHit` **`:152-155` 字段恰为 `(chunk_id, text_hash, score)`，逐字确认**（登记范围 `:151-156` 含装饰器与尾空行，端点宽一行）。`NullVectorBackend` **`:198` 起，`status()` 返回字面量 `"disabled"`（`:204`）、`query(self, text, *, limit) -> list[VectorHit]` 返回 `[]`（`:209-210`），逐字确认**；类文档串自述「The default backend」。`VectorConfig` `:57` 起、`enabled` 属性 `:118-119`（`bool(self.provider and not self.configuration_error)`）命中。`search_entries` **`:8425` 精确**，函数体确为 SQL/`casefold()` 词法检索。**两处非实质缺陷**：env 名登记为「三个」于 `:30-32`，该范围确含三个，但文件在 `:33` 另有第四个（`VECTOR_TIMEOUT_MS_ENV`）落在范围外；`NullVectorBackend` 登记 `:198-215`，实际 `close()` 的 `return None` 在 `:216`，端点少一行。
- **可靠性**: 仓内 tracked 文件，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 所声称的是「支持并强化 Q3 结论」—— 三个依据均由所引原文直接导出，相关性成立。
- **来源归类**: 内部来源

---

#### S-0042 | ASSESSMENT | evidence-examiner → E-0011
- **阶段**: 议案庭审
- **结论**: 九个仓内代码锚点**全部逐字复现，零漂移**；`build/build_feature_flags.json` 内容亦逐字相符，**但该文件被 `.gitignore:51` 忽略、不入库**，故那一半是**本机观察而非仓库事实**，E-0011 的自证类判据对它不成立。**该缺陷不动摇本条的承重资格** —— 其结论由 tracked 的 `memory_v2_rollout.js:150` 独立支撑。
- **依据**: E-0011
- **不确定性**: **(1)** 我与提交方同机，`build/build_feature_flags.json`（789 字节，mtime 2026-08-03 22:23）与最近一次真实 release 的一致性**仍未核实**，该限制至今未消除。**(2)** 我未启动 Electron，落到 sidecar 进程的真实 env 仍是推断（其最后一段注入由 E-0022 补齐，不在本批）。
- **请求/下一步**: 三条须随 E-0011 一同引用，见下。另请注意：**本条自身不含任何「本机观察」标注** —— 提示中所指的那段标注属于 **E-0023**（`code-owner-settings`，S-0010），不属 E-0011。
- **评估结论**: 已验证
- **证据编号**: E-0011
- **来源类型**: general
- **真实性**: 逐点定点读取。**`memory_v2_rollout.js:150` = `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";` 逐字符命中**；`:14-20` env 键表**范围两端精确**（`Object.freeze({` … `});`，五键齐全）；`:135-141`（ceiling / mode / `effectiveMode` 取小）**范围两端精确**；`:216-218` 快照路径二选一**逐字命中**；`:261-266`（`allowProcessOverrides: !app.isPackaged`）**范围两端精确**。`memory_v2_store_boundary.py:96` = `raw = source.get(CONTEXT_V2_STORE_OWNER_ENV, STORE_OWNER_PUPU_LEGACY)` **逐字命中**。`memory_v2_runtime.py:694-735` 命中。`package.json:40` `start:electron` 一行**逐字符命中**。`grep -rn "PUPU_CONTEXT_V2_STORE_OWNER"` 排除测试 → **产品代码恰好 2 处**（`memory_v2_rollout.js:19` · `memory_v2_store_boundary.py:24`），**逐字复现**。`build/build_feature_flags.json` 内容与登记的「关键原文」**逐字相符**（`"enable_memory_v2": false`；`sidecar_environment` 五键含 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`）。**唯一缺陷**：该文件 `git ls-files` 无记录、`git check-ignore` 命中 `.gitignore:51 build/` —— **不入库，第三方无法在 `b2385d5d` 复核**。
- **可靠性**: 九个代码锚点为仓内 tracked 文件，可靠性高；`build/build_feature_flags.json` 为**本机构建产物**，可靠性等同于 E-0023 就 `.local` 一份所声明的等级，**但 E-0011 未作同等声明**。
- **相关性**: **成立，且强于其自身论证。** 承重主张是「`memory_v2_store.py:7408 get_tree` 在两种真实配置下均不执行」。该主张的真正支撑是 `:150` 一行 —— `storeOwner` 是**严格二元 `off | unchain`**，`pupu_legacy` 从该函数**任何输入下都不可达**，这是一条**完全 tracked、逐字符已验**的仓库事实。两个不入库制品只决定二元中取哪一个值，**不决定结论方向**。我另行读取 `.local/build_feature_flags.snapshot.json`（273 字节，mtime 2026-08-04，`"enable_memory_v2": true`，无 `_pupu_memory_v2_release` 块，与 E-0023 所载逐字相符）确认：本机 dev 下 `featureEnabled` 为真 → 读 env → `all` → `unchain`；即使该文件缺失或为 false，`:135-140` 短路 → `off`。**两条路径都不是 `pupu_legacy`。**
- **来源归类**: 内部来源（含一份不入库的本机构建产物）

**须随 E-0011 一同引用的三条收窄**

1. **不入库半边须按本机观察采纳。** `build/build_feature_flags.json` 与 `.local/build_feature_flags.snapshot.json` **均被 gitignore**（`.gitignore:51 build/` · `.gitignore:20 /.local/`）。E-0011 的证据类型判据「仓内文件字面内容与行号 → 自证类」**对前者不成立**，其完整性限制 (2) 只披露了「未核实与 release 的一致性」，**未披露不入库这一更根本的缺陷**。
2. **E-0011 的结论可承重，其两行配置表不可。** 结论（Electron 启动的 sidecar 永不选中 `pupu_legacy` store）由 tracked 的 `:150` 独立支撑；**表中「packaged → off」「dev → unchain」两个具体取值各自依赖一份不入库制品**，只能按本机观察采纳。此点与 E-0023「部分反驳 E-0011 表格的 dev 行 ——「`npm start` → `unchain`」不是仓库属性」的判断**一致，本复核予以证实**。
3. **适用边界须写明：该二元性是 `memory_v2_rollout.js` 的属性，即 Electron 启动路径的属性。** `memory_v2_store_boundary.py:96` 在 env 缺失时默认 `pupu_legacy` —— **绕过 Electron 启动的 sidecar（独立 `python main.py`，或 E-0010 / E-0012 所用的 harness）确实可达 `pupu_legacy`**。E-0011「两种真实配置」隐含以 Electron 为限，引用时须显式带上该限定，否则会与 E-0010 / E-0012 的观察产生表面冲突。

**就提示所问的 E-0023 标注是否恰当（不构成对 E-0023 的 `ASSESSMENT`，E-0023 不在本批）**：**就 `.local/build_feature_flags.snapshot.json` 而言恰当且准确** —— 我独立读取该文件，内容、字节数、mtime 与 E-0023 所载逐字相符；其「不入库 / 不可由他人在同 revision 复核 / 须按本机观察而非仓库事实采纳」三句**判断正确，措辞精准**。**但该标注涵盖不足**：E-0023 的证据类型判据把 `build/build_feature_flags.json` 归入「仓内文件（js / package.json / build json）→ 自证类」，而 `build/` **同样被 gitignore**，具备**完全相同**的缺陷却未获同等标注。建议 `speaker-of-the-house` 将该「本机观察」限定**同时适用于两份制品**。

---

#### S-0043 | ASSESSMENT | evidence-examiner → E-0013
- **阶段**: 议案庭审
- **结论**: 门清单侧的全部锚点**逐字复现，零漂移**，capability 检查不在 `get_tree` 读路径上一节独立证实；但 `ensure_space` 的「全部产品调用点」清单**不是所述命令的输出**，漏了两个文件，其中一处触及该证据所支持的第二个结论。
- **依据**: E-0013
- **不确定性**: 我未判断遗漏的调用点是否改变「空态最常见成因」这一实体结论 —— **该判断不属证据审查范围**，留给方案庭审。
- **请求/下一步**: **门清单部分（`_endpoint` / `_read_runtime_for_store_owner` / `_status_for_store_owner` / capability 唯一使用点 / 三个路由 / `list_spaces` / `ensure_space` 定义）可径行承重。** 第二个结论「space 由 memory toolkit 惰性创建」须收窄，见真实性栏。
- **评估结论**: 已验证
- **证据编号**: E-0013
- **来源类型**: general
- **真实性**: 逐点定点读取。**`route_memory_v2.py:68-106` `_endpoint` 范围两端精确**（`def _endpoint(function)` … `return wrapped`）；**`:315-361` `_read_runtime_for_store_owner` 范围两端精确**；**`:786-831` `_status_for_store_owner` 范围两端精确**。**capability grep 逐字复现**：`context_memory_v2_capability_status` / `resolve_context_memory_v2_capability` 在该文件**恰好 4 处** —— `:16,:17` 导入 + `:987,:1004` 使用，**与登记完全一致，故「capability 检查不在 `get_tree` 读路径上」由该 grep 直接证成**。三个路由 `:1082`（spaces）`:1111`（tree）`:1123`（entries）**逐一精确**。`memory_v2_store.py:6467` = `def ensure_space(`、`:6619` = `def list_spaces(`、`:6639` = `return {"owner_chat_id": owner, "spaces": […]}` **逐字命中**。`memory_v2_runtime.py:694-735` 命中。**缺陷**：登记称 `memory_v2_toolkit.py:642,659,663,688,946,982,1002,1087,1392,1528,1672` 为「`ensure_space` 的**全部产品调用点**」，但所述命令（`grep -rn "ensure_space" … | grep -v /tests/`）的实际输出**另含三个文件**：`unchain_adapter.py:365,366,384`（其 `:384 space = ensure_space(...)` 是一次真实的空间创建调用）、`context_memory_v2_repository.py:2934`（`self._store.ensure_space(`）、`route_memory_v2.py:418,1100`。**其中 `route_memory_v2` 一对已由 E-0013 完整性限制中的 `getattr` 动态派发一节披露；`unchain_adapter.py` 与 `context_memory_v2_repository.py` 两处未获披露。**
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep。缺陷属登记保真，非来源问题。
- **相关性**: **对第一个结论（完整门清单）成立且强**。**对第二个结论（「space 由 memory toolkit 惰性创建，是空态的最常见成因」）须收窄** —— `unchain_adapter.py:384` 表明 chat adapter 侧亦存在创建路径，故「由 memory toolkit 创建」不是穷举的创建者集合。该收窄只针对**证据的覆盖面**，不针对结论本身的真伪。
- **来源归类**: 内部来源

---

#### S-0044 | ASSESSMENT | evidence-examiner → E-0014
- **阶段**: 议案庭审
- **结论**: 两侧五个锚点**全部逐字复现**；其核心主张（两个 `get_tree` 返回不同字段集与不相交的叶子 `kind` 词汇表）我**独立追至两侧的权威定义处闭合确认**，包括登记未引的 pupu_legacy 侧 kind 约束。本批证明力最强的一条。
- **依据**: E-0014
- **不确定性**: E-0014 自陈「纯静态比对、未在 `store_owner=unchain` 下实跑」的限制**完全成立，我同样无法实跑**（同机同缺陷）。故「运行时字段确实如此」在本复核后**仍是推断，不是观察**。
- **请求/下一步**: 主结论与限制 (1)(2) 可承重。**限制 (3) 依传唤指令不在本次复核范围**，我未触碰亦不重开 —— 其归属仍在 E-0061 / S-0028。
- **评估结论**: 已验证
- **证据编号**: E-0014
- **来源类型**: general
- **真实性**: 两仓逐点定点读取（unchain `a4e69f4` 工作树 **0 dirty**，锚点前提最强）。**`memory_v2_store.py:6641` 起 `_entry_response` 逐字确认**：`created_at_ms` / `updated_at_ms` / `created_by` 在基础字段集内，`content_bytes` 在 `if row["kind"] == "file"` 分支内 —— **四项 pupu_legacy 独有字段全部证实**（登记范围端点 `:6669` 少一行，`return response` 在 `:6670`，非实质）。**`memory_v2_unchain_read_adapter.py:532-567` `_route_entry` 范围两端精确**，`tags` 与 `source_refs` 在其响应体内、上述四项**一个都不在** —— **两侧字段集不同，证实**。`:411`（`def list_entries(`）与 `:452`（`return {**listing, "tree": roots}`）精确，**且与 `memory_v2_store.py:7434` 逐字相同 —— 限制 (2) 的「树装配算法字面等价」独立证实**。`:357` `_workspace_entries` 与 `:382` 分页逻辑命中。unchain `models.py:251-255` = `MemoryEntryKind(StrEnum)` {FOLDER, MARKDOWN, IMAGE, LINK} **逐字精确**。**我另行闭合了登记未引的一环**：pupu_legacy 侧的 kind 约束在 `memory_v2_store.py:845` 的 SQL CHECK —— `kind IN ('folder', 'file', 'link')`，恰好三种。**故两侧词汇表的交集恰为 `{folder, link}`，pupu_legacy 独有 `file`，unchain 独有 `markdown` / `image` —— E-0014 的「`folder` 与 `link` 是两侧共有的仅有两个 kind」一句，逐字为真。**
- **可靠性**: 两仓 tracked 文件（PuPu `b2385d5d` + unchain `a4e69f4`，后者工作树全净），第三方可完全复核。
- **相关性**: 所声称的是「证实可证伪条件 4 的前半」—— 由所引原文直接导出，且经我追加的 `:845` 一环后闭合度高于登记时。
- **来源归类**: 内部来源（跨两个内部仓库）

---

## 批次小结（供 `speaker-of-the-house` 编入闭庭产出）

| 证据 | 评估结论 | 时效性 | 须随附条件 |
|---|---|---|---|
| E-0001 | 已验证 | 承重部分成立 | dirty 计数 8→49、分布断言失效，两句不得引 |
| E-0002 | 已验证 | 命中块成立，未命中块失效 | 「未命中（2 个）」不得承重；分类应为须查类（已由本关治愈） |
| E-0003 | 已验证 | 完全成立 | 无 |
| E-0004 | 已验证 | 完全成立 | `service.js:2108` 一行须改引 E-0006 |
| E-0005 | 已验证 | 完全成立 | 无 |
| E-0006 | 已验证 | 完全成立 | 路由行号改 `:1111-1120` |
| E-0007 | 已验证 | 完全成立 | 「唯一的数据源调用」须改写；范围改 `:406-453` |
| E-0008 | 已验证 | 完全成立 | 「命中仅…5 处」为假，只引第二、三条命令 |
| E-0009 | 已验证 | 完全成立 | 「不出库」为类型结论，非运行时结论 |
| E-0011 | 已验证 | 完全成立 | 三条收窄（见 S-0042），不入库半边按本机观察采纳 |
| E-0013 | 已验证 | 完全成立 | 门清单可承重；「toolkit 惰性创建」须收窄 |
| E-0014 | 已验证 | 完全成立 | 运行时仍为推断；限制 (3) 不在本次范围 |

**12 条全部为「已验证」，10 条附带须随引条件。**

**三条批次级观察**

1. **零时效衰减。** 本批**无一条**发生行号漂移、内容改动或文件消失。查出的全部缺陷都是**登记时即存在的保真缺陷**，而非七小时内的变化。产品目录在四个时点（含本次最晚时点）测得零 dirty。
2. **一个反复出现的缺陷模式：登记的命令转录 ≠ 该命令的实际输出。** E-0004、E-0008、E-0013 三条各自把一份**经人工筛选的子集**呈现为「全部足迹 / 命中仅 / 全部产品调用点」。三次的遗漏项都不改变结论方向，**但三次都出现在同一位置：负向或穷举性断言**，而这恰是最容易被下游当作封闭集使用的断言形态。建议 `speaker-of-the-house` 在闭庭产出中记一条通用告诫：**引用穷举性 grep 结论时须核对命令输出本身，不得依赖登记摘要。**
3. **不入库制品的标注纪律不统一。** E-0023 对 `.local/build_feature_flags.snapshot.json` 作了准确且措辞精准的就地标注，E-0011 对具备**完全相同缺陷**的 `build/build_feature_flags.json` **未作任何标注**，且 E-0023 自身也把后者误归为「仓内文件」。两份制品应适用同一条采纳规则。

#### S-0045 | ASSESSMENT | expert-llm → case

- **阶段**: 议案庭审

- **结论**: **有条件成立。** 逐条：**甲 —— `code-owner-runtime` 的窄命题成立，由它推出的宽命题不成立。** `route_projection.py` 对三个标识符零匹配，我独立复跑确认（`grep -c` = 0），故 V1 投影的 **读端** 确实 store-owner 无感知。**但「保持现状」是关于用户所见的陈述，而用户所见由 *写端* 决定，写端 S-0004 未看。我看了：写端是 V2 感知的，且是决定性的。** V2 admission 生效时 `_resolve_memory_runtime` 返回 `kind="v2_durability"`，其运行时对象 **根本没有 `commit_messages` / `prepare_messages` 方法**（我实跑确认，E-0073），装的是 `DurabilityModule` 不是 `MemoryModule`；产生 V1 向量的那条工厂路径自己的 docstring 写着「**deliberately bypasses Qdrant and embedding resolution**」（E-0072）。**净效果：V2 生效后 V1 向量视图不再有新数据进来，且退化是静默的 —— 同样 200、空 payload，与「这个会话还没有记忆」逐字节相同。** 故准确表述是：**「保持现状」在代码行为上自动成立（不需要任何人做任何事），在内容供给上不成立（不需要任何人做任何事就会失效）。** 这不阻断议案 —— 它反而是支持议案的最强论据。**乙 —— 「该不该为 V2 造一套投影」，我的答复是：不该造。** 三点：**(a)** 那三样 **不是** 缺一不可 —— 存在严格更便宜的等价物（对已有 FTS5 语料做 TF-IDF→SVD，零新 provider、零新 env、复用 `route_projection.py` 现成的 `np.linalg.svd`）。**我主动指出这一点，因为「做不到」是个假借口，它让本庭不必在真正的问题上表态。** **(b)** 若真要造，V2 向量子系统今天 **只支持 `ollama` 一个 provider**（其余一律 `unsupported_provider`，`memory_v2_vector.py:81-87`）且 **`model` 必填无默认** —— 「开个开关」实为「给每个想看这张图的用户强加一个本地 Ollama 安装 + 一次 embedding 模型拉取」；再加 chunk 单位错配（2000/200 字符切块 vs tree 的条目单位）、RRF 权重（`:43-45`，一旦开启即 **改变召回排序**，那是行为变更不是可视化）、以及若引入云 provider 则连带出密钥、成本与隐私 —— **全部是本案范围外的检索架构决定，没有一条是「加个 view」。** **(c) 这是本庭要的那句直话：一个建立在纯词法检索之上的 V2，其「向量视图」在信息论意义上不但无意义，而且是负价值。** 一张散点图唯一的正当性是 **它展示的几何就是系统实际使用的几何**。V1 满足这条（画图用的向量就是驱动召回的向量）。V2 不满足：为画图而现算的 embedding 与 V2 的实际召回 **零因果关系**，用户会做出的自然推断（「靠得近的会被一起想起来」）是假的。**在一个价值主张就是「可信的记忆」的子系统上，展示一张关于它自己的、可信度为零的图，是在花钱制造误导。** 且 V2 **已经有一个更好的自我视图，而那正是本议案要建的东西** —— path 层级是 **作者写下的显式结构**（ground truth），投影是 **有损、随数据漂移的派生结构**。**用后者取代前者是降级。** **丙 —— 不是同一件事的两种说法。** `disabled` 是 **配置的确定性函数且为真**（`NullVectorBackend.status()` 计算得出，`memory_v2_vector.py:203`）；`degraded` 是 **字面量且在它所指称的那一点上为假**（`:489`）—— `degraded` 断言「存在一个能力且它受损」，而实测是 **根本不存在（absent）而非受损（impaired）**（E-0064 / S-0029 三臂对照 + `__init__` 无 `vector_index` 形参 → 构造上不可达其他值）。**产品路径上报 `degraded` 不准确。** 对 renderer 的含义是一条 **禁令而非构件**：该字段熵为零，任何分支都在编译期已决；且同一响应体里相邻的 `backend` 也取 `"degraded"` 而 **那一处是真算的**（`:488`）—— **同一个词在相邻两键里一真一假，读端无法凭观察分辨。** **丁 —— 不属本案范围，且不该另立 case 去做。** 可以另立的是「V2 检索是否升级为混合检索」这个 **检索架构议案**；**可视化永远不得成为制造 embedding 的理由，顺序不可颠倒。** **戊 —— 知悉：我判「不造投影」，故 `expert-architecture` 的落位结论 **无条件成立**，本案 **不因我增加待裁问题**。** **另加一条本庭未问、但 `code-owner-unchain`（S-0024 请求/乙）明确路由给我且无人能代答的**：**tree 退化为扁平列表不是「可达分支」，是我这一轴上的 *预测默认值*，且成因在我边界内** —— `memory_upsert` 的 **模型可见** 描述从未提及 `folder`，`kind` 参数 **无 enum、无 pattern、描述是自动生成的占位串 `"Argument kind"`、默认 `"markdown"`**，四个合法值 **只在报错文案里出现**（E-0075 / E-0076）。**模型压根不知道 `folder` 存在。**

- **依据**: E-0007, E-0008, E-0009, E-0011, E-0012, E-0061, E-0062, E-0064, S-0002, S-0004, S-0008, S-0024, S-0025, S-0028, S-0029, S-0030；本发言新提 E-0072, E-0073, E-0074, E-0075, E-0076；`0000-0003-2026-0807#S-0024`

- **不确定性**:

  **一 · 「有条件成立」的全部必要条件（角色输出契约硬要求，缺任一条即翻为不成立）**

  | # | 必要条件 | 若不满足会怎样 |
  |---|---|---|
  | **C1** | 议案 **显式接受**「V2 数据被选中时 vector view 无可呈现之物」，且 **不得** 在本案内以任何形式新造投影、embedding 供给或向量后端开关 | 本案性质从「加一个 view」变为「决定 V2 检索架构」，可行性须整体重判 —— 在我这一轴 **不成立** |
  | **C2** | 议案 **显式接受**「V1 vector view 的内容供给在 V2 admission 生效的会话上停止」，即「保持现状」**仅指代码行为不变，不指用户所见不变**；并接受该退化 **静默**（200 + 空 payload，与「尚无记忆」不可分辨） | 若议案要求 V1 view 在 V2 生效后仍显示新数据，则需要重新接通一条已被刻意断开的写路径 —— 那是记忆架构改动，**在我这一轴不成立** |
  | **C3** | tree view（及本案产出的任何 renderer 代码）**不得读取 `vector_status`**，不得让它进入任何状态判定，不得据它向用户陈述向量检索的健康度 | 产品路径上该字段恒为 `'degraded'` 且与真实状态无关；任何消费它的 UI 都在向用户陈述一件假事。**这是我在本案的硬红线** |
  | **C4** | 本案 **不得** 顺手改动 embedding provider、chunking 参数、召回参数或 RRF 权重；V2 向量后端 **保持关闭**（`PUPU_MEMORY_V2_VECTOR_PROVIDER` 维持零处设置） | 任一改动都会 **改变模型可见行为与召回结果**，那需要独立议案 + eval，不能作为可视化议案的副产品 |
  | **C5** | 议案 **不把「tree view 会呈现层级」当作前提**；扁平列表须被接受为 **今天的默认形状** | 若议案以「有层级」为验收前提，则本案隐含了一次 **写侧 prompt / tool schema 改动**（我的边界），那是另一个议案。**在我这一轴不成立** |

  **C1–C5 是合取，全部必须成立。** 我不接受「先做、以后再补」——C3 与 C4 一旦破，破的是模型可见行为，不是渲染细节。

  **二 · 我这一份的取证限制**

  1. **E-0073 / E-0075 是我自搭 harness 的运行时观察 → 须查类，须强制送 `evidence-examiner`。** 我已给完整可复跑命令（含 E-0059 的 bootstrap 方法，未重蹈前三人的 harness 构造缺陷）。
  2. **E-0075 我复制了 `memory_upsert` 的签名而非导入闭包**（闭包定义在需要 runtime 的工厂内）。签名逐字抄自 `memory_v2_toolkit.py:1355-1366`，但「抄得对」这一步 **未经第二方核对**。若审查人能构造出真实 toolkit 并 dump schema，其结论强于我这一条。
  3. **我未实跑一次真实 agent turn。** 「V2 生效后 V1 集合不再收到新点」是由 **控制流 + 对象能力**（`KernelMemoryRuntime` 无 `commit_messages`）推出的，**不是对 Qdrant 集合的直接观察**。要证伪只需找到 **第三个写入者**：若存在其他代码在 admitted run 下仍向 `_session_collection_name(...)` 写点，我这条翻。**我 grep 了 `memory_factory` 的集合命名函数的调用点，未发现，但这是负向搜索。**
  4. **`store_owner=unchain` 与「admission 生效」不是同一件事。** 二者共用 Electron 侧同一个上游开关（`memory_v2_rollout.js:150`，E-0011，**跨界只读，终局归 `code-owner-electron`**），但 admission 另需 capability gate 与 canary 选中（`memory_v2_context.py:1194-1201, 1258-1261`）。**准确表述**：供给切断发生在 **被 admit 的 run** 上，而被 admit 的 run 只存在于 store_owner 已是 `unchain` 的配置里。**今天出厂包 rollout 冻结为 off（E-0011），故 shipped 用户不受影响 —— 这条风险在 0.1.10 记忆 agent 发版当天开始咬。**
  5. **G2 未消除。** 我没有真实 store，「真实使用下 folder 使用率是多少」我给不出数。C5 是按 **模型可见面** 作出的预测，不是对真实数据的统计。
  6. **模型事实纪律**：本发言 **未陈述任何未经现查的模型 / 维度 / 定价事实**。凡涉及 provider 与模型的，全部引自本仓当前 revision 的代码常量。**「2-D 线性投影通常保留多少方差」我不给数字 —— 那依赖具体 embedding 与语料，且端点自己就会算（`_project_vectors` 返回 `variance`），任何人想要这个数就去测，别引我的记忆，也别引任何人的记忆。**

- **请求/下一步**:

  1. **请本庭把甲记为一条更正而非确认**：S-0004 Q3(1) 的负向 grep **只覆盖读端**；「不需要任何人做任何事来维持」这句 **须补一个限定语「在代码行为上」**。**补正责任依证据规则第一节归 `code-owner-runtime`**，我只出锚点（E-0072 / E-0073 落在 `pupu:unchain_runtime/**`，是其边界，我 **跨界只读**，终局结论归其确认）。
  2. **请把 C3 写进本案 `SUMMARY` 的约束栏，而不是留给方案庭审。** 它零成本、可机械验收（`grep -rn "vector_status" src/` 应恒为 0），且是本案唯一一条 **现在不写下来就会在方案期被当成设计题重开** 的技术禁令。
  3. **请将「`vector_status` 恒为 `'degraded'` 且与真实状态无关」按 S-0029 请求 4 记为纯事实登记，并同时登记我这一条**：**`:489` 的正确取值应为 `"disabled"` 或 `"absent"`，一行改动，归 `code-owner-runtime`。** 我 **不请求在本案内改** —— 它不阻塞本案，且改它属另一议案。**但若不改，C3 必须永久有效。**
  4. **不请求为本案做任何 eval。** 但请把下列三项 **记入本案产出**，作为「将来若有人再提为 V2 造投影」的 **前置门**，免得同一个问题在没有判据的情况下被重开：
     - **E1 · 忠实度**：取 N≥50 条真实查询，比较「按 2-D 欧氏距离取 top-k」与「按生产检索器取 top-k」的重合度（Jaccard@10）。**低于 0.6 即证明该图不是检索的图像，不得以任何暗示检索行为的方式呈现。**
     - **E2 · 保留方差**：端点已经在算（`route_projection.py:359-369` 返回 `variance`）。**要求前两主成分的累计解释方差有明确下限，并在 UI 上如实显示，而不是藏起来。**
     - **E3 · 布局稳定性**：`_project_vectors` 每次请求都对当前全集 **重新拟合 SVD**（`:350-358`）。加入 k 条新条目后重投影，测点位平均位移。**V1 的会话作用域是有界的所以能忍；V2 的 store 是长期且无界增长的，同一做法会产生一张每加一条记忆就重排一次的地图 —— 那不是地图。** 这一条是我反对「把 V1 方案移植到 V2」的结构性理由，不是偏好。
  5. **另立议案的建议（我提出，不代本庭决定）**：**「V2 检索是否从纯词法升级为混合检索」** 值得单独立案 —— RRF 融合的常量已经写在代码里（`memory_v2_vector.py:43-45`），说明这条路是设计好的、只是没开。**它的收益是召回质量（用户真实痛点），不是一张图。** 若它有朝一日落地并使 embedding 成为承重件，投影才 **可能** 变得有意义 —— **即便那时，它仍然要和 tree 竞争，而 tree 有 ground truth 它没有。**
  6. **关于 C5 / 扁平树的成因（我的边界，本案不做）**：修法是 **prompt 面的**，两处任选其一即可 —— 在 `memory_upsert` 的模型可见描述里点名 `folder` 并给一句组织建议；或让 `kind` 参数带上 enum。**可证伪方式我一并给出**：A/B 跑 N 组种子会话，测 **folder 创建率** 与 **平均树深**，基线是今天（我预测 folder 创建率≈0）。**请勿在本案内做** —— 它改的是模型行为，须走自己的 case。

- **评估结论**: **有条件成立**

- **专业适用范围**:

  **落在我边界内（本条为终局主张）**：
  - 「向量视图 / 投影是否是 V2 的合理呈现物」这一 **检索与记忆表征** 判断（乙 a/b/c、丁）
  - embedding provider 选择与 chunking / 召回参数所连带的决定（乙 b）
  - `vector_status` / `degraded` 作为 **模型与产品可见的状态词汇** 是否可承载契约（丙）
  - `memory_upsert` 等 memory toolkit 的 **tool schema 形状与措辞**，及其对模型写出何种记忆结构的因果（C5、E-0075/E-0076）
  - 任何「更好 / 更准 / 更有意义」主张所需的 **eval 形式**（请求 4、6）

  **跨界只读，不构成本边界终局主张（须由该 owner 确认）**：
  - `pupu:unchain_runtime/server/unchain_adapter.py` · `memory_factory.py` · `memory_v2_vector.py` · `memory_v2_toolkit.py` · `memory_v2_unchain_read_adapter.py` · `memory_v2_context.py` → **`code-owner-runtime`**。E-0072 / E-0073 / E-0074 / E-0076 全部锚在这里，**我出的是「这些代码事实在检索与记忆语义上意味着什么」，不是「这些代码归谁改」**
  - `pupu:electron/main/services/unchain/memory_v2_rollout.js:150` → **`code-owner-electron`**
  - `unchain:src/unchain/tools/tool.py`（`Tool.from_callable` 的 schema 生成）→ **`code-owner-unchain`**

  **明确不在我边界内**：散点图 / tree view 长什么样、空态文案、层级如何呈现（`expert-ux` + 方案庭审）；四态判定的落位与权威归属（`chief-judge` / `expert-architecture`）；`:489` 那一行由谁改（`code-owner-runtime`）。

  **Q2 强制表态（FRAMING 乙，不说「与我无关」）**：**本案若推进，会要求我的边界承担一个今天不属于我的判定职责吗？—— 会一件，我明确承接；那个「无主构件」不落我这里。**
  - **会落我的一件**：`vector_status` 这类 **状态词汇是否可被 UI 消费** 的判定。今天没人拥有它，而它是「模型与检索子系统对外自述状态」的一部分 —— **我承接，并已在 C3 里把它办成了一条禁令**（成本：零行代码，一条 grep 可验收）。这是我边界内既有义务的延伸，**不需要新构件、不需要 CEO 拍板**。
  - **不落我的**：「四态由谁判、哪一层是权威状态源」。它要综合 build flag、Electron 决议、sidecar 就绪与 V2 读返回 —— **四个输入没有一个是检索或模型语义**。让我判它就是让鉴定人去当架构裁决人。**谁能判：`chief-judge` 指派（`expert-architecture` 已明言传唤机制解不了它）。**
  - **G1 是否前置阻塞我这一轴？—— 不构成。** 我上面五条必要条件无一依赖前案任何裁定，全部是当前 revision 上的代码事实与实测事实。

- **专业理由**:

  **甲 · 为什么窄命题成立而宽命题不成立**

  S-0004 用一次负向 grep 证明 `route_projection.py` 不认识 store owner，然后推出「保持现状自动成立」。**第一步无懈可击，第二步偷换了主语。** 「现状」不是一个关于源文件的属性，是一个关于 **用户打开这个视图会看到什么** 的属性。而那由两件事共同决定：读端怎么读（S-0004 看了），**以及有没有东西被写进去（S-0004 没看）**。

  写端我看了，链条是闭合的：

  1. V2 admission 生效 → `_resolve_memory_runtime` 走 `kind="v2_durability"` 分支（`unchain_adapter.py:5579-5615`），调 `create_durable_kernel_runtime_with_diagnostics`。
  2. 该工厂自己的 docstring 就是判据：**「Build the durability-only kernel runtime *without vector dependencies*. This path *deliberately bypasses Qdrant and embedding resolution*.」**（`memory_factory.py:1677-1682`）。对照同文件 `:1747-1764` —— **只有** `create_memory_manager_with_diagnostics` 那条路会建 `QdrantVectorAdapter` 并算 `collection_tag`，而 `/memory/projection` 读的正是这个 tag 派生的集合名（`route_projection.py:440-446`）。
  3. 返回对象因此 **不是 memory manager**。我实跑确认它是 `KernelMemoryRuntime`，**`hasattr(commit_messages)` = False，`hasattr(prepare_messages)` = False**（E-0073）。
  4. 装配层随之改道：`_memory_runtime_uses_durability_only({"kind":"v2_durability"})` = True（我实跑），于是 `:7183-7191` 装 `DurabilityModule(runtime=…)` 而 **不装 `MemoryModule(memory=…)`**。
  5. graph 路径还有第二道独立的门：`memory_commit_allowed` 初始 `False`（`:8731`），**只在 `not graph_memory_v2_admission.is_active` 的分支里** 才被置 `True`（`:8733, :8753`），而 `commit_messages` 的调用以它为条件（`:9485-9490`）。

  **两条路径、两种机制，结论同一：admitted run 不产生 V1 向量。**

  **为什么这对本庭重要，而不是一条趣闻**：因为它 **反转了本案的风险叙事**。本庭一直在问「新增 tree view 会不会踩到什么」。真实情况是 —— **V2 越是真正上线，V1 那个视图就越空**，而它空下去的方式是 **静默的**（`_empty_projection_payload`，200，与「这个会话还没有记忆」逐字节相同）。**用户会看到一个从来不报错、只是越来越空的向量视图。** tree view 不是在给一个健康的功能加同伴，**它是在给一个即将失去数据源的视图做接班人。** 这是支持议案的论据，我把它写在支持侧。

  **乙(a) · 「三样缺一不可」为什么不成立，以及我为什么主动拆自己的台**

  S-0004 说要造投影必须开向量后端 + 造新端点 + 写投影计算。**只有当产物被定义为「语义 embedding 的投影」时才缺一不可。** 若产物只是「一张二维散点」，**存在严格更便宜的等价物**：V2 的条目文本已经在 SQLite 的 FTS5 里，对它做 TF-IDF → SVD（即经典 LSA）即可得坐标，**零新 provider、零新 env、零 Qdrant**，而且 `route_projection.py:344-370` 那段 SVD 代码 **原样可用**。

  **我主动指出这条，是因为「技术上做不到」是一个会让本庭免于表态的假理由。** 拆掉它之后，问题回到它本来的样子：**不是「能不能」，是「该不该」。** 我的答案在 (c)。

  **乙(b) · 若真要造，会连带出哪些本案范围外的决定**

  | 连带决定 | 依据 | 为什么出本案范围 |
  |---|---|---|
  | **provider 事实上只有 Ollama** | `memory_v2_vector.py:81-87`：`provider != "ollama"` → `configuration_error="unsupported_provider"`；`:88-95`：`model` 必填无默认 | 「开个开关」实为「要求用户装 Ollama 并拉一个 embedding 模型」。**这是产品前置依赖，不是配置项。** 要支持云端 provider 就是新写一个后端 + 密钥 + 成本 + 隐私（本地记忆内容出机），全部属独立议案 |
  | **模型与维度成为存储身份的一部分** | V1 侧已有先例：`memory_embeddings.py:60-63` 的 `_vector_embedding_signature`（`provider:model:size`）与 `:108-141` 的换签名即换集合 | 换 embedding 模型 = 旧索引作废 + 重建。**这是迁移议案** |
  | **chunking 与 tree 的单位不一致** | `deterministic_chunks(chunk_chars=2000, overlap_chars=200)`（`:158-164`） | 向量的最小单位是 **重叠切块**，tree 的单位是 **条目**。散点画的是 chunk，同一条目切出的相邻块因 200 字符重叠而 **构造性地** 挨在一起 —— **图上最显眼的簇是切块产物，不是语义信号。** 要对齐就得再定一个聚合规则，那是新设计 |
  | **开了向量就改召回排序** | `RRF_K=60` / `LEXICAL_RRF_WEIGHT=2.0` / `VECTOR_RRF_WEIGHT=1.0`（`:43-45`），融合实现在 `:455-480` | **一旦启用，V2 的检索结果就变了。** 这是模型可见行为变更，必须有 eval 与 A/B，**绝不能作为「为了画一张图」的副产品发生。这一条是我最不肯让步的地方** |
  | **回填成本** | `MAX_INDEX_ENTRIES_PER_CALL = 2`（`:41`） | 存量 store 的索引是节流的增量过程，不是一次性任务 |

  **乙(c) · 直话：不该造**

  三条独立成立的理由，任一条都够：

  **1 · 忠实度。** 一张投影图唯一的正当性是「它展示的几何 = 系统实际使用的几何」。V1 成立：画图的向量就是驱动召回的向量。V2 **不成立** —— 今天检索是 FTS5 + 子串，**根本没有 embedding 参与**。为画图而现算的向量与召回 **零因果关系**。而用户看到散点会做的推断（「靠得近的会被一起想起来」）**是假的**。**一个不忠实的可视化不是中性装饰，它是一个关于用户自己记忆如何工作的错误断言 —— 而记忆子系统的全部价值就是可信。** 退一步，即便改用 (a) 那条便宜路（LSA），它忠实的也只是词法空间，**而 V2 的排序也不是那个空间上的余弦**，仍然不忠实，只是不忠实得便宜一点。

  **2 · V2 已经有更好的自我视图，而那正是本议案要建的东西。** V2 的组织结构是 **作者写下的**：path 层级、四种 typed kind、`tags`、`source_refs`。**那是 ground truth。** 投影是 **有损、随数据漂移、无语义标签** 的派生结构。**在一个已经携带权威结构的 store 上花钱去造一个更差的派生结构，是把 ground truth 换成估计值。** 本案的 tree view 正是那个权威视图 —— **所以正确的答复不是「V2 的 vector view 该显示什么」，而是「V2 的 vector view 就是 tree view」。**

  **3 · 结构上不可移植。** `_project_vectors` **每次请求都对当前全集重新拟合 SVD**（`:350-358`）。主成分基随数据变，**加一条记忆整张图就重排一次**（含主轴符号翻转）。V1 的作用域是单会话、有界，能忍；**V2 的 store 是长期、无界增长的** —— 同一做法在 V2 上产生的是一张每次打开都不一样的地图。**地图的价值在于稳定；不稳定的地图比没有地图更糟，因为用户会试图记住它。** 这条与向量后端开不开无关，**是把 V1 方案移植到 V2 这件事本身的结构性缺陷。**

  **丙 · 两个词不是一回事，且其中一个在产品路径上是假的**

  它们是 **两类不同的陈述**：

  | | `disabled`（`pupu_legacy` 读路径） | `degraded`（`unchain` 读路径 = 产品路径） |
  |---|---|---|
  | 产生方式 | **计算得出** —— `NullVectorBackend.status()`（`memory_v2_vector.py:203`），因 provider 未配置而选中该后端 | **字面量** —— `memory_v2_unchain_read_adapter.py:489` 硬编码 |
  | 可变性 | 随 env 变（配了 provider 就不是它） | **构造上不可达其他值**（S-0029：两个读服务 `__init__` 均无 `vector_index` 形参，全源单一赋值点无 setter） |
  | 是否为真 | **真** —— 抽象存在、开关关闭 | **假** —— 它断言「能力存在且受损」，实测是 **缺席（absent）非受损（impaired）** |

  **所以：不是同一件事的两种说法。`disabled` 是一个诚实的开关状态；`degraded` 是一个占位串，它掩盖的恰恰是「根本没开」，而且掩盖的方式比沉默更坏 —— 沉默不做断言，`degraded` 做了一个假断言。**

  **对一个要消费该字段判态的 renderer，意味着三件事：**

  1. **该字段熵为零，不携带任何信息。** 分支于它 = 写一个在编译期就已决定的 `if`。**任何据它显示「向量检索已降级」的 UI，都在告诉用户一件关于其记忆系统的假事。**
  2. **同一响应体里存在活的词汇碰撞。** 相邻的 `backend` 也取 `"degraded"`，**而那一处是真算的**（`:488`，`result.lexical_fallback` 为真时才是）。**同一个 token 在相邻两键里，一个是真状态一个是恒假占位，读端无法凭观察分辨。** 这与我在本组织已记录的同类形态是同一个病（`0000-0005-2026-0807` 系列：`complete`/`completed` 在上游自己分裂、终态被自由文本子串决定）。
  3. **由此推出一条我此前已立、此处再次适用的判据：一个构造上不可变的状态 token 不能承载契约。** 我在 finality / trace 终态两案的立场是「终态不得由自由文本子串决定」；此处是同一原理的另一面 —— **不得由一个不会变的字面量决定**。故 **C3 是禁令，不是构件**：本案的 tree view 本来就不需要向量状态，**只要写下「不读它」，这个坑今天就被永久封住，成本为零。**

  **丁 · 范围表态（直接回答，不推给本庭）**

  - **「为 V2 造一套投影」不属于本案范围。** 本案 `phase: motion` 问的是「能不能加一个 tree view」；投影是 **另一件产物、另一条数据依赖、另一组模型决定**。
  - **不该作为本案的 side case。** side case 的前提是「可分割的小块」。投影不是小块 —— **它预设了一个尚未作出的决定：V2 的检索要不要变成语义/混合检索。** 在那个决定之前谈投影，就是让可视化去替检索架构作答。
  - **也不该作为「为 V2 造投影」这个题目独立立案 —— 这个议案本身就不该存在。** 理由见乙(c)三条。
  - **可以独立立案的是另一个题目**：**「V2 检索是否从纯词法升级为混合检索」**（RRF 常量已在代码里预留，说明这条路是设计过的）。**它的收益是召回质量 —— 用户的真实痛点、也是本组织已认定的压注点 —— 不是一张图。** 若它落地并使 embedding 成为承重件，投影才 **可能** 有意义；**即便到那时，它仍要和 tree 竞争，而 tree 有 ground truth。**
  - **顺序不可颠倒，这是我这条表态的实质**：**检索决定在前，可视化至多是下游的、可选的后果。可视化永远不得成为制造 embedding 的理由。**

  **戊 · 对 `expert-architecture`（S-0025 请求 7）的知悉**

  我判 **不造投影**。依其自陈的依赖关系，其落位结论 **无条件成立**，`memory-inspect/` 保持「一个 modal + 两个内容组件」，**不需要变成需要内容路由的容器**。**本案不因我增加待裁问题。** 我不代其表态。

  **额外 · C5 的成因在我边界内（`code-owner-unchain` S-0024 请求/乙 明确路由给我）**

  `code-owner-unchain` 实证 folder 不自动物化、tree 会退化为扁平（E-0061），并说「是否要层级取决于 memory toolkit 的实际使用方式 —— 那是 `expert-llm` 与写侧的问题」。**我作答，答案是：在我这一轴，扁平是预测默认值，不是偶发分支。**

  判据是 **模型实际看到什么**（E-0075 / E-0076）：

  - `memory_upsert` 的模型可见 description 全文是：**「Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory.」**（`memory_v2_toolkit.py:1758-1762`）—— **一个字都没提 folder，没提层级，没提四个合法 kind。**
  - 参数 schema 由 `Tool.from_callable` 生成（`:459-466`）。我实跑 dump：**十个参数的 description 全部是自动生成的占位串 `"Argument <name>"`**，`kind` 是 `type_='string'`、**`pattern=None`、无 enum**、默认 `"markdown"`。
  - **函数 docstring 被丢弃** —— 描述取自显式传入的字符串。故 `memory_list` 里那句 `:param path: Virtual folder path;…` 等 **全部是死文档，模型永远看不到**。（这是一条比本案更宽的 prompt 装配缺陷，我登记，不在本案处置。）
  - 四个合法 kind **只出现在报错文案**（`:364-365`）—— 即模型 **只能先猜错才可能发现 `folder` 存在**，而它没有理由去猜：默认值已经给了它一个能用的值。
  - toolkit 里 **没有** `memory_create_folder` 这类工具（`:1751-1790` 全表）。

  **结论：模型不知道 `folder` 存在，因而不会建，因而不会有层级。** 这不是「可能退化」，是 **在没有人改 prompt 面之前，退化就是稳态**。故 **C5 必须写进议案前提**；而修法（点名 `folder` / 给 `kind` 加 enum）**是我的边界、是 prompt 面改动、不在本案范围**，须另走 case，且须带 A/B（folder 创建率、平均树深，基线为今天）。

- **支撑证据**:

# 承重证据复核 · 批次 B（13 条）

`evidence-examiner` 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)复核。本批全部为 **自证类**，依第六节 **免检失效**，逐条重验并附时效判断。

> **S 编号待 `speaker-of-the-house` 分配。** 下列 13 份 `ASSESSMENT` 按批内顺序排列，各以 `→ E-00NN` 相互区分。

---

## 全批时效前提（一次实测，覆盖本批全部 13 条）

本批 13 条的锚点全部为 `revision + 绝对路径 + 行号 + 内容` 形态，锚定 revision 均为 PuPu `b2385d5d`。复核时实测（2026-08-08，复核开始时刻）：

```
git rev-parse --short HEAD          → b2385d5d      （与全批锚点 revision 一致）
git branch --show-current           → dev
git status --porcelain -- src electron unchain_runtime
                                    → 空            （三个产品目录零 dirty）
git status --porcelain -- build package.json .local
                                    → 空            （E-0023 引用的两个受控文件亦零 dirty）
git status --porcelain | wc -l      → 49
```

**dirty 条目已由 E-0001 的 8 条、E-0033 的 12 条增至 49 条，但增量全部落在 `.claude/` 之下**（38 条 `.claude/agent-memory/**` + `.claude/agents/expertise/expert-llm.md` + `.claude/codex/**`，11 条 `.claude/court/**`）。**`src/` `electron/` `unchain_runtime/` `build/` `package.json` 五个被本批引用的受控位置，至本次复核时刻仍与 `b2385d5d` 逐字节一致。**

**净效果：本批全部 13 条的时效前提成立** —— 不存在因产品代码变动导致的行号漂移。本批出现的全部行号偏差，**均为提交时的誊录偏移，不是庭审期间的漂移**；二者性质不同，我逐条区分登记。

**一项本前提覆盖不到的例外**：E-0023 的一半依赖 `.local/build_feature_flags.snapshot.json`，**该文件不入库**，`git status` 对其无任何约束力，上述五行实测 **不为其提供任何保护**。见该条单独处理。

---

#### S-0046 | ASSESSMENT | evidence-examiner → E-0015
- **阶段**: 议案庭审
- **结论**: 逐项复核全部命中，无一处偏差。`memory-inspect/` 目录对 `ownerChatId` / `context_v2` / `contextV2` 的 grep 实测为 `0`；文件 959 行、测试 94 行；`:326-332` 的组件签名、`:340` 的六态注释、`:374-377` 的唯一数据源逐字一致。
- **依据**: E-0015
- **不确定性**: 提交方自陈「只覆盖字面标识符与该目录，未运行组件」属实且我未越过 —— 经变量/动态构造抵达 V2 的路径不在本次覆盖内。
- **请求/下一步**: 可直接承重，无须补强。
- **评估结论**: 已验证
- **证据编号**: E-0015
- **来源类型**: general
- **真实性**: 已确认。`:326-332` 实为 `({open, onClose, sessionId, chatTitle, mode = "session"})`，与登记的字段与顺序完全一致；`:340` 实为 `useState("idle")` 附 `"idle" | "loading" | "ready" | "profiles" | "empty" | "error"` 六态注释；`:374-377` 实为 `mode === "long_term" ? unchainApi.getLongTermMemoryProjection() : unchainApi.getMemoryProjection(sessionId)`。grep 计数 `0` 与两个行数 959 / 94 均实跑复现。无篡改迹象。
- **可靠性**: 提交方 `code-owner-settings` 在自己边界内的一级读取（`src/COMPONENTs/memory-inspect/**`），本次经第二方独立复核。
- **相关性**: 相关且充分。它支持的命题是「该 modal 今天完全不在 V2 读平面上」，而 grep 零命中 + 唯一数据源为 V1 projection 两方法，正是该命题的直接构成，未见外延。
- **来源归类**: 内部来源（本仓一级原始物，同 revision 任何人可复核）

---

#### S-0047 | ASSESSMENT | evidence-examiner → E-0016
- **阶段**: 议案庭审
- **结论**: 四个文件的锚点全部命中，`node` 正则探针原样复跑、两行输出一致。两处 **行内标号比所引内容早一行**，均落在该条自己已声明的行号区间之内，属排版压缩，非内容失真。
- **依据**: E-0016
- **不确定性**: 提交方自陈「未证明 `node.chatId` 与 `activeChatIdRef.current` 严格同一 id 空间」属实 —— 我核到的是 `use_chat_stream.js:11985` 传的是 `currentChatId`，而 side-menu 传的是 `node.chatId` / `memorySessionId`，**二者是不同变量，本条未跨越这道缝**。该确认归 `code-owner-chat-core`。
- **请求/下一步**: 可承重。建议 speaker 随证据带上两处行内标号更正（见真实性）。
- **评估结论**: 已验证
- **证据编号**: E-0016
- **来源类型**: general
- **真实性**: 已确认。`side_menu_context_menu_items.js:198-207` 实为 character 分支 `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")` 直至 `onInspectMemory(memorySessionId, chatTitle)`；`:217-223` 实为普通分支直至 `onInspectMemory(node.chatId, chatTitle)`，两段逐字命中。`service.js:120` 的 `CONTEXT_V2_OWNER_ID_PATTERN` 与 `:198-204` 的 `requireContextV2OwnerChatId` 均为精确边界。`node` 探针我以同一正则原样复跑：`"chat-1772850432671-abc" → true`、`"character_foo__dm__main" → true`，与登记一致。**两处行内标号更正**：(1) 登记写 `chat_storage_sanitize.js:301` 携带 `` `character_${…}__dm__${…}` ``，实际 `:301` 是 `export const buildCharacterMemorySessionId = (...)`，模板串在 `:302`（仍在其声明的 `:301-302` 内）；(2) 登记写 `use_chat_stream.js:11985` 为 `{ ownerChatId: currentChatId, sessionId: targetSessionId }` 一行，实际 `:11985` 是 `ownerChatId:`、`:11986` 是 `sessionId:`（仍在其声明的 `:11978-11986` 内）。两处均为把多行压成一行展示，内容零差异。
- **可靠性**: 跨三个 owner 边界的只读引用（side-menu 属 chat-core，`chat_storage/**` 属 shared-arteries，`service.js` 属 electron），提交方未就他人边界作权威主张，仅取代码形状。
- **相关性**: 相关。它证明的窄命题是 **`onInspectMemory` 的第一个实参在两条分支上是两种不同的 id，且两者都能通过 main 的 `CONTEXT_V2_OWNER_ID_PATTERN`** —— 该命题由上述锚点直接导出。**须随证据一同引用的收窄**：登记称此为「语义错误的 id」，「语义错误」是对该 id 应当是什么的判断，**不由本条锚点导出**，属实体争点，我不裁；本条只支持「校验器不区分二者」。
- **来源归类**: 内部来源（本仓一级原始物 + 本机可复跑的纯函数探针）

---

#### S-0048 | ASSESSMENT | evidence-examiner → E-0017
- **阶段**: 议案庭审
- **结论**: 两个锚点与一条 grep 全部精确复现。`MemorySettings` 签名唯一入参确为 `onNavigate`，挂载块确只传 `{open, onClose, mode}`。
- **依据**: E-0017
- **不确定性**: 提交方自陈「未穷举全部 provider」属实，本条未跨越。（该缺口已由本批外的 E-0034 以 `ls src/CONTAINERs/` 补上，不由我在此裁量其效力。）
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0017
- **来源类型**: general
- **真实性**: 已确认。`settings/memory/index.js:46` 实为 `export const MemorySettings = ({ onNavigate }) => {`，逐字一致；`:474-478` 实为 `<MemoryInspectModal open={inspectOpen} onClose={() => setInspectOpen(false)} mode="long_term" />`，五行精确闭合，与 E-0003 所载同一挂载点互证。grep 我原样复跑，`src/COMPONENTs/settings` 下非测试代码中 `chatId|sessionId` **恰好三处命中，全部在 `token_usage/storage.js:82,154,332`**，与登记逐行一致。
- **可靠性**: 提交方在自己边界内（`src/COMPONENTs/settings/**`）的一级读取。
- **相关性**: 相关且充分。命题是「settings 侧挂载点手里没有任何 chat 标识」，负向 grep + 正向签名读取二者合起来正是该命题，无外延。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0049 | ASSESSMENT | evidence-examiner → E-0018
- **阶段**: 议案庭审
- **结论**: 四段锚点全部命中，`getTree` 必需 `ownerChatId` + `spaceId` 且 query 仅含 `owner_chat_id` 三项事实逐字属实。两处描述偏松，均非内容问题。
- **依据**: E-0018
- **不确定性**: 提交方自陈「`spaceId` 的来源我未核实」属实且重要 —— 两跳读序列的第一跳返回什么、有无默认 space，本条一律未触及。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0018
- **来源类型**: general
- **真实性**: 已确认。`src/SERVICEs/bridges/context_v2_bridge.js:32-50` 确为 `REQUIRED_METHODS` 的 18 个方法名（`getStatus` 起、`decideCandidateReview` 止，`]);` 在 `:51`）；`:102-108` 确含 `getStatus`(:102) / `listSpaces`(:107) / `getTree`(:108) 三个纯透传定义。`service.js:2098-2101` 确为 `listContextV2Spaces` 头部含 `requireContextV2OwnerChatId(payload?.ownerChatId)`；`:2108-2116` **逐行精确** 为 `getContextV2Tree`，第 2109 行 `requireContextV2OwnerChatId`、2110 行 `requireContextV2Identifier(payload?.spaceId, "spaceId")`、2111 行 `buildContextV2Query([["owner_chat_id", ownerChatId]])`，**确无 `allow_long_term` / `namespace`**。**两处偏松（非内容错误）**：(1) 取得方式称 renderer facade「140 行内」，该文件实为 **124 行** —— 陈述为真但失准；(2) 本条另处以 `:2098-2105` 指 `listContextV2Spaces`，该函数实际闭合于 `:2106`。
- **可靠性**: 跨边界只读（`src/SERVICEs/bridges/**` 属 shared-arteries，`electron/**` 属 electron），提交方已就此自陈并把 `spaceId` 来源明确让归 runtime / electron。
- **相关性**: 相关且充分。它主张的是「V2 读平面全部 owner-scoped」与「`getTree` 除 `ownerChatId` 外还必需 `spaceId`」，两者都是被引行的直接内容。其推出的「最小读序列是两跳」是 **形状层的必然**（`getTree` 需 `spaceId`，而 `spaceId` 只能来自 `listSpaces`），成立；但「两跳在运行时确实如此走」超出本条，须另据。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0050 | ASSESSMENT | evidence-examiner → E-0019
- **阶段**: 议案庭审
- **结论**: 三个 Python 文件的锚点内容全部属实，**200 载荷恰为五键 `{owner_chat_id, space_id, space_revision, entries, tree}`、无任何判别位** 经我逐键复核成立。**跨界自我限制（只主张代码形状）在正文中被完整遵守。**
- **依据**: E-0019
- **不确定性**: 空 store / space 不存在 / owner 不匹配 / `store_owner=off` 四种出口的实际 HTTP 状态与 body，本条一律未观察 —— 提交方已明写并让归 `code-owner-runtime`。该缺口由本批外的 E-0010 部分填补，不在我此次复核范围。
- **请求/下一步**: 可承重（仅就代码形状）。任何把本条读成运行时结论的引用，请 speaker 拦下。
- **评估结论**: 已验证
- **证据编号**: E-0019
- **来源类型**: general
- **真实性**: 已确认。`memory_v2_store.py:7434` 逐字为 `return {**listing, "tree": roots}`；`listing` 的四个键 `owner_chat_id` / `space_id` / `space_revision` / `entries` 实位于 `:7402-7405`（登记的行内标号写 `:7397-7405`，起点早了四行，落在其自陈的 `:7396-7434` 区间内，非实质）。`route_memory_v2.py:1111-1120` **逐行精确**：`:1111` 路由装饰器、`:1114` `request.args.get("owner_chat_id", "")`、`:1116-1118` 调 `get_tree(owner_chat_id=…, space_id=…)`，**确未传 `allow_long_term` / `namespace`**。`memory_v2_store_boundary.py:26-28` 逐字为三个 `STORE_OWNER_*` 常量。
- **可靠性**: **跨界只读** —— `unchain_runtime/**` 不在提交方 `code-owner-settings` 边界内。该条标题即写明「仅就代码形状；运行时行为归 `code-owner-runtime`」，**我核实其正文严格守住了这条界**：净内容四行全是构造与常量，无一句断言端点实际返回什么。
- **相关性**: 相关且充分，**但须按窄命题采纳**：本条支持的是「`get_tree` 的成功载荷里没有判别位」这一 **结构** 命题，以及「`allow_long_term` 参数存在但该路由不传」。它 **不** 支持任何关于 200 何时出现、空态与停用态如何区分的命题 —— 那正是它自己划出去的部分。
- **来源归类**: 内部来源（本仓一级原始物，跨 owner 边界只读）

---

#### S-0051 | ASSESSMENT | evidence-examiner → E-0020
- **阶段**: 议案庭审
- **结论**: 四项净内容全部属实 —— 8 字段 allowlist、count-free 注释原文、`getStatus` 零消费者、production 短路，逐项复现。**但主锚点整体偏移一行，须在案卷中更正**：`getContextV2Status` 实为 `:1945-1986`、其注释实为 `:1942-1944`，登记的 `:1941-1985` 与 `:1941-1943` 均早一行。
- **依据**: E-0020
- **不确定性**: 该偏移 **不是庭审期间的漂移**（工作树对 `electron/**` 零 dirty，HEAD 与锚点 revision 同为 `b2385d5d`），而是提交时的誊录偏移。二者对时效性的含义不同，我不把它当作证据失效处理。
- **请求/下一步**: **补正责任在提出方 `code-owner-settings`。** 建议 speaker 在引用本条时改用 `:1942-1944`（注释）与 `:1945-1986`（函数），否则后来的读者会落在空行上。
- **评估结论**: 已验证
- **证据编号**: E-0020
- **来源类型**: general
- **真实性**: 已确认（内容），**行号须更正**。(1) 8 字段 allowlist 实位于 `:1976-1985`，逐字为 `{available, schemaVersion, journalMode, lexicalBackend, vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded}`，**恰 8 项，与登记集合完全相同**。(2) count-free 注释原文 *"Status is deliberately COUNT-FREE … can never leak out as a free enumeration oracle."* **逐字属实**，但位于 `:1942-1944`，`:1941` 是空行。(3) `src/` 下 `contextV2Bridge.getStatus()` 的消费者 **实测为 0** —— 我原样复跑 `grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"`，24 处命中中属 `contextV2Bridge` 的 **只有定义 `:102` 与白名单 `:33` 两处，零调用点**，其余分属 `api.unchain` / `api.ollama` / `ollama_bridge` / `memory_vault_bridge` 或 `toast_host.js:89` 的同名局部函数。(4) `feature_flags.js:53-56` 的 `enable_memory_v2.defaultValue: false` 精确命中；`:96-98` 的 `if (isProductionBuildRuntime) return buildDefaults;` 确在 `readNamespace(...)` 之前 —— **须补一处**：登记称条件为 `NODE_ENV === "production"`，该字面判断实际在 **`:5`**（`const isProductionBuildRuntime = process.env.NODE_ENV === "production";`），不在其所引的 `:90-100` 内；语义成立，出处不完整。另：本条另引的 `:1890-1905` 在净内容中未被使用，指向 `contextV2Request` 的注释与就绪门，无害。
- **可靠性**: 跨边界只读（`electron/**` 属 electron）。提交方已自陈 `projectMemoryV2Status` / `validateMemoryV2Status` 的内部判据未追、归 electron —— 该让渡属实。
- **相关性**: 相关。第 3、4 两点尤其有力且互补：它们合起来支持的窄命题是「今天 renderer 侧既没有在用 `getStatus`，也不能拿 `enable_memory_v2` flag 顶替它作启用态判据」。**须收窄一处**：第 2 点把注释读成「不变量」，注释确实以不变量口吻写成，但 **注释是意图声明，不是对实现的证明**；本条未验证该不变量在实现上被守住（8 字段 allowlist 的存在是强旁证，但 `projectMemoryV2Status` 内部未追）。
- **来源归类**: 内部来源（本仓一级原始物，跨 owner 边界只读）

---

#### S-0052 | ASSESSMENT | evidence-examiner → E-0021
- **阶段**: 议案庭审
- **结论**: 三段锚点全部精确命中。`pts.length === 0` 单条判据、`if (!silent)` 吞掉整个 `.catch`、5s `setInterval` 驱动静默轮次、以及「现有唯一测试只锁 long-term profiles 一条路径」四项均已复核成立。
- **依据**: E-0021
- **不确定性**: 提交方自陈「未运行组件、未跑测试」属实；「该测试今天是绿的」本条未主张，我亦未跑（`react-scripts test` 未执行）。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0021
- **来源类型**: general
- **真实性**: 已确认，四段行号 **逐行精确**。`:398-408` 实为 `if (pts.length === 0) { … if (mode === "long_term" && nextProfiles.length > 0) setStatus("profiles") else setStatus("empty"); return; }`；`:424-430` 实为 `.catch((err) => { if (cancelled) return; if (!silent) { setErrorMsg(...); setStatus("error"); } })` —— **静默轮次的错误确被整段吞掉**；`:434-441` 实为 `window.setInterval(() => loadProjection({ silent: true }), 5000)` 及其清理。我另独立核实了登记中最关键的一句「5s `setInterval` 会在零操作下驱动 `ready → empty`」：`:398-408` 的空态分支 **不在 `if (!silent)` 保护之内**，故静默轮次确能改写 status —— 该推论成立。测试文件我逐块清点，**全文只有一个 `test(` 块**（`:59` "shows stored long-term profiles when there are no vectors"，位于 `:54` 的单一 `describe` 内），与「唯一测试」一致。
- **可靠性**: 提交方在自己边界内（`src/COMPONENTs/memory-inspect/**`）的一级读取。
- **相关性**: 相关且充分。命题是「Inspector 今天如何处理 200-空」，四项发现全部是该处理路径的直接构成。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0053 | ASSESSMENT | evidence-examiner → E-0022
- **阶段**: 议案庭审
- **结论**: 全部七个行号锚点 **逐行精确**，三个 spawn 点的清单与 attach 负向搜索均原样复现。核心事实（五个 MEMORY_V2 键写在 `{...process.env}` 展开之后、无条件、无分支）成立。**但其「反驳」一句的射程明显宽于所证** —— 须随证据带上收窄。
- **依据**: E-0022
- **不确定性**: 提交方自陈未启动 Electron、未观察真实 spawn env 属实；未核 `scripts/start-dev.cjs` 是否另起 sidecar（属 devtools）亦属实，该缺口仍开着。
- **请求/下一步**: 可承重，**但必须与下述相关性收窄捆绑引用**。补正「反驳」措辞的责任在提出方 `code-owner-electron`。
- **评估结论**: 已验证
- **证据编号**: E-0022
- **来源类型**: general
- **真实性**: 已确认，**本批精度最高的一条之一**。`:4745` 逐字为 `const sidecarEnvironment = { ...process.env };`；`:4749-4751` 为三个 vault 键删除、`:4755` 为 dirty-dev 键删除（其自陈的 `:4749-4755` 恰好闭合这四行）；`:4758` 为 `spawn(entrypoint.command, entrypoint.args, {`、`:4762-4763` 为 `env: { ...sidecarEnvironment,`；`:4789-4808` **恰为五个键**（featureCeiling / rolloutMode / canaryPercent / readOnlyDegraded / storeOwner），`:4809-4811` 为 dirty-dev 条件重加。我另作一次负向核查：`:4758-4830` 区间内 `MEMORY_V2` 的全部命中 **就是这五个键加那一个条件项，无第六处、无任何分支包裹**。`:1035` 为 `constrainMemoryV2ConfigForPlatform(` 起始行、`:4695-4696` 为 `startMiso` 及其唯一守卫，均精确。`grep spawn(` 在 `electron/main` 下 **恰 3 个命中**，文件与行号（`vault_sink_executor.js:327` / `unchain/service.js:4758` / `ollama/service.js:67`）与登记逐条一致；attach 系列搜索的命中确实全部是流的 `attachedWebContentsId` / `attachmentId`，无外部进程附着路径。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取，并明确标注其为对 `code-owner-runtime` E-0011 未验证段的补全 —— 该补全关系属实。
- **相关性**: 事实相关，**「反驳」射程须收窄，这是本条唯一实质问题**。登记称本条「**反驳** 任何『开发者 shell 的环境变量可能生效』的设想」。所证实的只是 **直接继承通道** 被封死：`{...process.env}` 里的这五个键，会被 `:4789-4808` 无条件覆盖。**但同一提交方的 E-0023 恰好记录了间接通道**：`memory_v2_rollout.js:124-133` 的 `readValue` 在 `allowProcessOverrides` 为真时 **优先返回 `processEnvironment[key]`**，而 `:265` 设 `allowProcessOverrides: !app.isPackaged` —— 我已逐行核实这两处。故在非打包运行下，**开发者 shell 的 env 正是经由 rollout 解析器流进 `memoryV2RuntimeConfig.sidecarEnvironment`，再由 `:4789-4808` 写入 spawn**。两条证据本身不冲突（一条封直接通道、一条开间接通道），**但 E-0022 的措辞会被读成整层否定，那是不成立的**。请按「直接继承通道已封死」采纳，勿按字面采纳。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0054 | ASSESSMENT | evidence-examiner → E-0023
- **阶段**: 议案庭审
- **结论**: 全部关键原文逐字属实，10 条 reason 闭集我以同一命令复跑得 **恰好 10 条、集合完全相同**。`.local` 那一半我在本机独立读取并确认（273 字节、mtime 2026-08-04 17:20、`enable_memory_v2: true`、无 `_pupu_memory_v2_release` 块）。**就点名的两问：该标注恰当，且不影响本条的承重资格 —— 理由见相关性。**
- **依据**: E-0023
- **不确定性**: `build/build_feature_flags.json` 与最近一次真实 release 的一致性 **至今无人验证**（与 E-0011 限制 2 同源，本次复核亦未消除）。另：`.local` 文件不受任何 revision 约束，我今日之读只覆盖今日。
- **请求/下一步**: 可承重。建议 speaker 在裁定引用 `.local` 内容时，标注观察时刻而非 revision。
- **评估结论**: 已验证
- **证据编号**: E-0023
- **来源类型**: general
- **真实性**: 已确认。`:14-20` 五个 env 键表逐字命中。`:135-140` 逐字为 `const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";` 与同形的 `configuredMode` —— **`featureEnabled` 为假时 env 确实完全不被读取**，登记的关键原文属实。`:150` 逐字为 `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`。`:216-218` 逐字为 `app.isPackaged ? …/build/build_feature_flags.json : …/.local/build_feature_flags.snapshot.json`。`:265` 逐字为 `allowProcessOverrides: !app.isPackaged`。`build/build_feature_flags.json` 我 `cat` 全文：`"enable_memory_v2": false` ✓、`sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER: "off"` ✓、两个 sha256 在案 ✓。`package.json:40` 逐字一致。reason 闭集我复跑 `grep -o 'reason = "[a-z0-9_]*"' | sort -u` 得 **10 条，与登记的 10 条逐条相同（含 `""`）**。**须更正两处行号**：`resolveMemoryV2ReleaseConfig` 登记为 `:210-266`，实际闭合于 **`:309`** ——这也解释了该条内部的自相矛盾（其子锚点 `:241-279` 越出了自己声明的外沿），按 `:210-309` 读则两者自洽；`validateMemoryV2Status` 登记 `:405-449`，实际闭合于 `:450`。`:118-173`（`buildRolloutConfig`）与 `:311-342` 精确。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取，唯 `.local` 一项为本机非受控文件。**就点名的第一问：标注恰当。** 该条把 `.local` 明写为「本机文件、不入库、不可由他人在同 revision 复核」，并要求本庭按「本机观察」而非「仓库事实」采纳 —— 这个自陈准确。**我只补一条它没说、而对承重更要紧的**：`.local` 不受版本控制，意味着它 **可以在不留任何仓库痕迹的情况下改变**，全批时效前提里那五行 `git status` 对它 **零保护力**；因此它连「在 `b2385d5d` 上成立」这种表述都不适用，只能说「在我读它的那一刻成立」。
- **相关性**: 相关且充分。**就点名的第二问：不影响承重资格，理由是本条的承重命题并不真正依赖 `.local` 的内容。** 该命题是一个否定命题 ——「『`npm start` → `unchain`』**不是仓库属性**」。支撑它只需两件事：`:216-218` 证明非打包路径读的是 `.local`（受控、可复核），而 `.local` 不在仓库里（受控事实）。**至此该否定命题已经成立，`.local` 里写的是 `true` 还是 `false` 都不改变它。** `.local` 的具体内容只在一处额外起作用：说明本机此刻恰好会走到 `featureEnabled = true` 那一支。故 —— **承重的那一半落在受控文件上，不可复核的那一半只承担例证角色。** 反过来说：任何试图用本条去主张「dev 运行时实际取值就是 X」的引用，**才** 会真正压在 `.local` 上，那种引用不被本条支持。
- **来源归类**: 内部来源。**须分两级登记**：`memory_v2_rollout.js` / `build/build_feature_flags.json` / `package.json` 为受控的本仓一级原始物；`.local/build_feature_flags.snapshot.json` 为 **本机非受控观察**，无保管链、无 revision 锚，可复核性弱于自证类

---

#### S-0055 | ASSESSMENT | evidence-examiner → E-0025
- **阶段**: 议案庭审
- **结论**: 本批精度最高的一条。15 个字段、四个 status 取值的每一个行号、七个跨文件锚点 **全部逐行精确**，三条 grep 全部原样复现。核心链路（main 15 字段 → IPC → preload 裸透传 → `normalizeUnchainStatus` 丢弃）经我逐段走通。
- **依据**: E-0025
- **不确定性**: 提交方自陈「未在运行中的应用里 `await window.unchainAPI.getStatus()` 观察过一次」属实 —— 本条全部是代码路径推断。该推断的强度经我复核后 **高于其自谦**（见相关性）。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0025
- **来源类型**: general
- **真实性**: 已确认。`:1645-1663` **恰为 `memoryV2` 块的起止**，其中字段 **恰 15 个**，名称与顺序与登记完全相同（`configured, ready, status, reason, featureCeiling, configuredMode, releaseRolloutMode, rolloutMode, canaryPercent, readOnlyDegraded, platformActiveBlocked, releaseRolloutFingerprint, rolloutFingerprint, sidecarFingerprint, snapshotFingerprint`），其中 4 个为 fingerprint ✓。status 四值的每一个行号我逐一验证，**无一偏差**：`off` 在 `:1053`、`pending` 在 `:1055`、`degraded` 在 `:1045`/`:1875`/`:1881`/`:1970`、`ready` 在 `:1875`/`:1970`。`:1039-1056`（`initialMemoryV2Readiness`）、`:1068`（声明）、`:1637-1664`（`getMisoStatusPayload`）、`:1852`（`verifyContextV2Readiness` 起）、`:4706`（`startMiso` 重置）全部精确。`register_handlers.js:236-238`、`preload/channels.js:17`、`unchain_bridge.js:4`（`getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)`，确为裸透传）、`api.shared.js:330-343`（`normalizeUnchainStatus` 确重建为 6 字段，`memoryV2` 与 `contract` 确被丢弃）、`api.unchain.js:870-887`（`:879` 确为 `return normalizeUnchainStatus(status)`）全部精确。三条 grep 复现：`memoryV2Readiness` 在产品代码 **16 处且全在 `unchain/service.js` 一个文件内** ✓；`src/` 非测试代码中 **零处读 `status.memoryV2`** ✓（命中全是 `enable_memory_v2` flag 或同名局部变量）。**一处计数偏松**：`getMisoStatusPayload` 登记「3 个消费者」，实际 grep 另有 `service.js:5834`（导出对象）与 `boot_readiness/service.js:83`（注释）两处未计；两个真实调用点（`register_handlers.js:237` / `boot_readiness/service.js:224-225`）与登记一致，故结论不受影响。
- **可靠性**: 提交方在自己边界内（`electron/**`）的一级读取，跨入 shared-arteries 的部分已自陈只作「请其确认」的锚点，正文守住了。
- **相关性**: 相关且充分。**我另作一项独立观察，方向是加强而非削弱**：`src/SERVICEs/test_bridge/index.js:82-84` **直接调用 `unchainAPI.getStatus()`**（走裸 preload 桥，不经 `api.unchain` facade），即今天 renderer 进程里 **确实存在一条能拿到未归一化 15 字段载荷的现役路径**。E-0025 未引此处，但它正是其「renderer 今天就能拿到」的实证支点 —— 该推断因此比提交方自陈的更硬（该文件属 dev 面，其性质由相应 owner 判断，我不裁）。**须收窄一处**：本条「部分反驳 `code-owner-settings` 的 F2『唯一没有绕行方案』」是对他人命题的反驳，本条锚点只证明「存在另一条已经在线的状态通道」，**是否构成可用的『绕行方案』属实体争点，不由本条导出，我不裁**。
- **来源归类**: 内部来源（本仓一级原始物，含跨 owner 边界只读）

---

#### S-0056 | ASSESSMENT | evidence-examiner → E-0026
- **阶段**: 议案庭审
- **结论**: 两段引用注释 **逐字属实**，错误对象的完整生命周期（`parsed.error.code` → `error.code` → 保码重包为 `[code] static message`）经我逐段追踪成立。两处行号范围偏松。「七码无一漏解」一句的射程须收窄。
- **依据**: E-0026
- **不确定性**: 提交方自陈「未观察一次真实 IPC 往返」「未验证 Electron 包裹前缀不干扰正则」属实。该正则 `/\[([a-z0-9_]+)\]\s/` 确无锚点，故前缀理论上不干扰 —— 但这仍是推断，与提交方判断一致。
- **请求/下一步**: 可承重，**须与 E-0027 捆绑引用**（见相关性）。
- **评估结论**: 已验证
- **证据编号**: E-0026
- **来源类型**: general
- **真实性**: 已确认。`:182-185` 的注释原文 *"…the stable code rides in the message behind a `[<code>] ` prefix (Electron strips error.code across ipcMain.handle) AND stays on .code for main-process callers."* **逐字命中**；`:1932-1933` 的注释 *"readJsonResponse surfaces the sidecar's stable error code; keep it and re-wrap so the renderer only ever sees `[code] static message`."* **逐字命中**；`:1938` 逐字为 `throw createContextV2Error(code, "context v2 request failed");`。我另独立追踪了其未展开的中段：`:1745-1757` 确从 `parsed?.error?.code` 提取到局部 `errorCode`，`:1767-1770` 确将其挂到 `error.code` 后抛出 —— 即 `:1740-1771` 这个子区间的描述 **完全属实**。`:1892-1940`（`contextV2Request`）及其四个子锚点 `:1893` / `:1897-1906` / `:1914-1922` / `:1931-1938` **逐行精确**。`context_v2_bridge.js:53-57`（`ERROR_CODE_TOKEN_PATTERN`）与 `:69-82`（`unavailableError` / `parseContextV2ErrorCode`）**逐行精确**。**两处范围偏松**：`readJsonResponse` 登记 `:1733-1786`，实际闭合于 `:1783`，多包了三行的段落注释；`listContextV2Spaces` 登记 `:2098-2105`，实际闭合于 `:2106`。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取；跨入 shared-arteries 的 renderer 正则部分已自陈只读引用。
- **相关性**: 相关，**须两处收窄**。**(1)** 「七个服务端码全部匹配 `[a-z0-9_]+` → renderer 正则可解析，**无一漏解**」—— 本条锚点证明的是 **机制**（码被保留在 `.code` 上并重排为 `[code] message`，renderer 侧正则形如 `/\[([a-z0-9_]+)\]\s/`）；**「恰好是这七个码」的普查不在本条来源定位之内**，须另据。机制成立，普查未证。**(2)** 「code 端到端不丢」只在 **就绪门之后** 成立 —— 同一提交方的 E-0027 记录了一个前置例外（`ensureMisoReady` 抛出的是无 `[code]` 前缀、无 `.code` 的裸 `Error`），而 `contextV2Request` 的 **第一行** 正是 `ensureMisoReady()`（`:1893`，我已核）。**E-0026 自身不携带这条限定，E-0027 携带；两条必须一同引用，单引 E-0026 会得到一个过强的结论。**
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0057 | ASSESSMENT | evidence-examiner → E-0027
- **阶段**: 议案庭审
- **结论**: 两处锚点 **逐行精确**，两段引用代码 **逐字属实**。该条最有价值之处在于它是对自家 E-0026 的 **自我限定**，且限定得准确。
- **依据**: E-0027
- **不确定性**: 提交方自陈「未逐一断言 `getContextV2Tree`，故其行为相同是推断」属实且诚实。我可补强该推断的力度（见相关性），但 **它仍是推断，不是观察**，这一点我不改写。
- **请求/下一步**: 可承重。请 speaker 在任何引用 E-0026 之处一并带上本条。
- **评估结论**: 已验证
- **证据编号**: E-0027
- **来源类型**: general
- **真实性**: 已确认。`service.js:1666-1676` **恰为 `ensureMisoReady` 的起止**；`:1672-1674` 逐字为 `throw new Error(\`Miso service is not ready (status=${unchainStatus}${reasonSuffix})\`);` —— **确无 `[code]` 前缀、确未给 `.code` 赋值**，与登记完全一致。`context_v2_service.test.cjs:1414-1430` 精确：`:1416-1417` 的注释 *"Every capability (not just status) fails closed while the sidecar is not ready — no request is attempted at all."* 逐字属实，`:1418-1420` 与 `:1421-1429` 两个 `rejects.toThrow(/not ready/i)`、`:1430` 的 `expect(fetchImpl).not.toHaveBeenCalled()` 全部命中。登记对第二个断言以 `{...}` 省略了 payload，**省略有显式标记**，非隐藏。我另复跑 `grep -n "not ready"` 得 `:249` / `:1417` / `:1420` / `:1429` 四处，与登记一致。
- **可靠性**: 提交方在自己边界内（`electron/**`，含测试）的一级读取。
- **相关性**: 相关且充分。**我可为其自陈的推断补一节旁证，但不改其性质**：`getContextV2Tree`（`:2108-2116`）确实与被断言的 `listContextV2Spaces` 一样以 `contextV2Request` 为唯一出口，而 `contextV2Request` 的第一行即 `ensureMisoReady()`（`:1893`）—— 三者共用同一条第一行属实。故该推断在结构上很硬；**但测试确实没有断言 `getContextV2Tree`，「被测试锁住」这句只对被点名的两个方法成立**，提交方已如实标注，我确认该标注准确。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-0058 | ASSESSMENT | evidence-examiner → E-0028
- **阶段**: 议案庭审
- **结论**: 五处锚点 **全部逐行精确**（Python 侧三处的边界精度尤为罕见：`:315-328` 恰好收在 `return _runtime()`、`:718-734` 恰好闭合那个 `raise`、`:694-735` 恰好收在 `return None`）。**就点名的一问：跨界自我限制在正文中基本被遵守，但有一句越过了「只主张分支形状」的界，须按佐证而非权威采纳。**
- **依据**: E-0028
- **不确定性**: 提交方自陈未实跑任何 Python 属实。**一项它未标、我须补的**：其「独立交叉验证 E-0010」只对 `off` 一支成立；`unchain` 一支（`:728` 的 `context_v2_owned_by_unchain`）在本案中 **从未有任何运行时观察**（E-0010/E-0012 的复核记录均载明该分支因 `import unchain` 失败而无法实跑，且审查人与提交方同机同缺陷）。故该支 **只有静态读这一个来源，无交叉**。
- **请求/下一步**: 可承重（就分支形状）。请 speaker 在引用「出厂默认态 `getStatus()` reject」时并列引 E-0010 作为运行时依据，勿以本条为该结论的出处。
- **评估结论**: 已验证
- **证据编号**: E-0028
- **来源类型**: general
- **真实性**: 已确认，**全批精度最高**。本边界内：`:1946-1957` 恰为合成负值分支（**8 字段，与 E-0020 所载 allowlist 同集**）、`:1958` 恰为 `contextV2Request("GET", …/status)`、`:1974` 恰为 `projected.available = projected.available && validation.ok;`。跨界只读三处：`route_memory_v2.py:982-1006` 恰为 `context_v2_status` 全体，**「无 try/catch」经我逐行确认成立**（异常一律上抛至 `@_endpoint`）；`:786-799` 恰收在 `if store_owner != STORE_OWNER_UNCHAIN: return _runtime().status()`；`:315-328` 恰收在同形的 `return _runtime()`；`memory_v2_runtime.py:718-734` 逐字为 `if configured_owner in {STORE_OWNER_OFF, STORE_OWNER_UNCHAIN}: … code = "context_v2_store_disabled" if configured_owner == STORE_OWNER_OFF else "context_v2_owned_by_unchain" … raise MemoryV2Error(code, …, status_code=503)`，**与登记逐字一致**。其自陈的旁证亦属实：`context_v2_service.test.cjs:249` 的测试名 *"status short-circuits without a request when the runtime is not ready"* 逐字命中。
- **可靠性**: **跨界只读**（`unchain_runtime/**` 不在 `code-owner-electron` 边界内）。**就点名的一问，我的核实结论**：自我限制 **在正文中被遵守** —— 完整性限制 (1) 与证据类型判据两处均明写「只主张代码里的分支长这样，运行时行为的权威结论归 `code-owner-runtime`」，而净内容/关键原文各行 **全部是分支结构与常量，无一句断言端点实际返回什么**。**一处越界须标记**：「支持/反驳」栏写「支持 丁的核心结论（出厂默认态下 `getStatus()` **reject 而非 resolve**，8 字段 allowlist 不可达）」—— 「reject 而非 resolve」是 **运行时效果**，不是分支形状。该句以「支持他人结论」的形式出现、紧跟其后即为权威让渡、且所述效果确已由 `code-owner-runtime` 实跑取得（E-0010 之 503 `context_v2_store_disabled`，本庭 S-0007 已验），故 **性质属佐证而非自立权威**。按此采纳则自我限制成立；按字面读作本条自证运行时行为则不成立。
- **相关性**: 相关。**须两处收窄**：**(1)** 本条对「出厂默认态」结论的贡献是 **分支层的**（代码里确有这条 503 通路），运行时那一半的出处是 E-0010，**不是本条**。**(2)** 其自称「独立交叉验证 E-0010」—— 就 `off` 支成立（静态分支与实测 503 同码）；就 `unchain` 支 **不成立**，因该支从无任何运行时观察可供交叉，本条的静态读是它 **唯一** 的证据来源。另：本条「推翻我自己的一条持久记忆（原记默认构建下返 404 `context_v2_not_found`）」经我核实方向正确 —— 本 revision 上该路径确为 503 而非 404。
- **来源归类**: 内部来源（两仓一级原始物，跨 owner 边界只读）

---

## 批次小结（供 `speaker-of-the-house` 处置，非裁定）

**13 条全部 `已验证`，无 `未验证`，无 `相矛盾`。** 全批时效前提成立：产品目录在庭审期间零变动，无一条因行号漂移失效。

**须随证据一同流转的事项，按轻重排列：**

1. **E-0022 的「反驳」射程过宽**（唯一实质性相关性问题）。它封死的是直接继承通道；间接通道由同一提交方的 E-0023（`readValue` + `allowProcessOverrides: !app.isPackaged`）证明是开着的。两条不冲突，但 E-0022 单独引用会得到一个错误结论。
2. **E-0026 必须与 E-0027 捆绑引用**。「code 端到端不丢」只在就绪门之后成立，前置例外在 E-0027 里。
3. **E-0020 主锚点整体早一行**（正确值：注释 `:1942-1944`、函数 `:1945-1986`），内容逐字属实。补正责任在 `code-owner-settings`。
4. **E-0028 的 `unchain` 支无交叉验证** —— 全案至今无人实跑过该分支，本条的静态读是其唯一来源。
5. **E-0023 的 `.local` 半边**：标注恰当；且其承重命题（「不是仓库属性」）由受控文件独立支撑，`.local` 只承担例证角色，**故不影响承重资格**。但该文件不受版本控制，任何引用须标观察时刻而非 revision。
6. **其余为誊录级偏差**，不影响任何结论：E-0023 `resolveMemoryV2ReleaseConfig` 实为 `:210-309`（这也消解了该条内部 `:241-279` 越出外沿的自相矛盾）、`validateMemoryV2Status` 实至 `:450`；E-0026 `readJsonResponse` 实至 `:1783`；E-0019 listing 键实为 `:7402-7405`；E-0016 两处行内标号各早一行；E-0018 facade 实为 124 行；E-0025 `getMisoStatusPayload` 命中实为 4 处（两个真实调用点无误）。

**两项加强性独立发现**（方向为支持提交方，非反驳）：`src/SERVICEs/test_bridge/index.js:82-84` 直接调用裸 `unchainAPI.getStatus()`，是 E-0025「renderer 今天就能拿到 15 字段」的现役实证支点；`memory_inspect_modal.test.js` 全文确只有一个 `test(` 块，E-0021「唯一测试」属实。

**声明**：本次复核与原观察 **同机同工作树**，证成的是同一 revision 上的可复现性，**不构成独立第二环境的佐证**。本报告不含任何对议案实体争点的意见。

# 承重证据复核 · 批次 C（12 条）

`evidence-examiner` · 证据规则第六节 · 全批为自证类，**入卷免检在本关失效**

---

## 全批时效前提

复核开始时与结束时各测一次，覆盖本批全部 12 条：

```
git -C /Users/red/Desktop/GITRepo/PuPu rev-parse --short HEAD   →  b2385d5d   （首末两次一致）
git branch --show-current                                       →  dev
git status --porcelain -- src electron unchain_runtime          →  空（0 条）  （首末两次一致）
git status --porcelain | wc -l                                  →  49 → 51    （复核期间自增 2）
```

**三条结论，全批共用**：

1. **锚点 revision 未漂移。** 本批全部 12 条声明的 `b2385d5d` 今天仍是 HEAD，本次复核读到的每一个字节都与提交方当时读到的是同一棵树。
2. **产品目录持续零 dirty。** `src` / `electron` / `unchain_runtime` 在本次复核的首末两次测量中均为空。**故本批的行号与原文引用不存在「提交后被改动」这一失效通道** —— 凡我报为漂移的，都是提交当时即已存在的偏差，不是时效问题。
3. **工作树整体 dirty 计数仍在自增，且在我复核期间又涨了 2 条（49→51）。** 结合 E-0001 的 8 与 E-0033 的 12，本案七小时内该计数走了 `8 → 12 → 49 → 51`。**该计数不适合承载任何裁定**；产品目录零 dirty 才是稳定量，而它稳定成立。

**逐条结果**：已验证 10 条（E-0030 · E-0031 · E-0033 · E-0034 · E-0035 · E-0038 · E-0039 · E-0040 · E-0041 · E-0042）· 未验证 2 条（**E-0032** · **E-0037**），两条的失效点均为 **计数/构成不符**，且两条的核心引文本身逐字为真 —— 更正后可再议。

---

#### S-0059 | ASSESSMENT | evidence-examiner → E-0030

- **阶段**: 议案庭审
- **结论**: **六个行段全部命中，四个文件尺寸逐字节吻合，三项计数全部独立复现。** 本条是本批质量最高的几条之一。其自陈的两条完整性限制（未实跑、只搜字面串）经核 **属实且已充分**，我未发现未登记的缺口。
- **依据**: E-0030
- **不确定性**: 「这些断言今天为绿」仍无人实跑 —— 与 E-0029 审查（S-0015）所记「`memory_v2_startup_readiness` / `memory_v2_rollout` 至今无人实跑」是同一个缺口，本次复核 **未填补**（我只读不跑）。
- **请求/下一步**: 若裁定要压在「注入被测试锁住」上，须补一次这两个 suite 的实跑；引用时须写「测试源码里写着这些断言」，不得写「这些断言今天为绿」。
- **评估结论**: 已验证
- **证据编号**: E-0030
- **来源类型**: general
- **真实性**: **成立，逐项。** ① 六个行段全部指向所述内容：`:188-194` 打包+canary 的 spawn env（`PUPU_CONTEXT_V2_STORE_OWNER: "unchain"` 在 `:193`）· `:200-214` `getMisoStatusPayload` 的 `memoryV2` 投影（`configured:true, ready:true, status:"ready", reason:"", rolloutMode:"canary"` + 两个 fingerprint）· `:237-244` dev 脏活跃分支 · `:268-275` 无 dirty env + `ready` · `:379-392` off 态（`STORE_OWNER:"off"` 在 `:384`；`configured:false/ready:false/status:"off"` 在 `:390-392`）· `:426-440` win32+all（`shadow`/`all`/`unchain` 在 `:427-429`；`degraded` + `vault_worker_containment_unavailable` + `releaseRolloutMode:"all"` + `rolloutMode:"shadow"` 在 `:436-440`）。**全部逐字命中。** ② **三项计数全部复现**：`memoryV2:` 断言恰 **7 处**（`:203, 245, 273, 299, 360, 389, 435`）；`memoryV2.status` 被断言的取值恰为 `ready`/`degraded`/`off` **三值**；全仓 `PUPU_CONTEXT_V2_STORE_OWNER` 断言仅 **3 处**（`:193 unchain`/`:384 off`/`:429 unchain`），**`pupu_legacy` 断言确为零**。③ **四个文件尺寸逐字节吻合**：`context_v2_service.test.cjs` 49245B + `.js` 42B · `ipc_channels.test.cjs` 28313B + 36B · `api_contract.test.cjs` 37515B + 36B · `context_v2_bridge.test.cjs` 9241B + 41B。④ **六对双胞胎全部存在，六个 `.js` 全文各为一行 `require("./<name>.test.cjs");`**，我逐个 `cat` 确认，无一例外。⑤ 另三个锚点亦命中：`context_v2_service.test.cjs:498-527` 为 space/tree/entry 的 owner-scoped 读测试（`getContextV2Tree` 的 URL 断言在 `:511-513`）· `ipc_channels.test.cjs:360-375` 为 channel↔方法名绑定表（`:360` 即 `const expectedBindings = [`）· `api_contract.test.cjs:252-265` 为 `listSpaces`/`getTree` 的入参转发断言。**唯一非精确项**：`:498-527` 的起点比该 `test(` 块早 2 行（块实际为 `:500-528`），属区间引用的常见容差，**不构成漂移**，所述内容全在区间内。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界（`electron/**`）内的定点读取。提交方对自己不确定的部分（未实跑、以变量构造的断言未覆盖）作了主动登记，未见夸大。
- **相关性**: **相关且充分**，就其所支持的三条主张而言。支持「甲：注入被测试锁住」—— 三处 spawn env 断言确实钉住了 `PUPU_CONTEXT_V2_STORE_OWNER` 的注入值。支持「乙 (2)：`memoryV2` 只被部分锁定」—— **这一条尤其被本次复核加强**：7 处断言全为 `toMatchObject` 部分匹配，`status` 四值只锁三值，且我确认全仓 **无任何** 「不得有额外字段」的断言，故「部分锁定」不是保守说法而是精确说法。支持「丁 (1)：bridge 面被契约测试锁住」—— `api_contract.test.cjs:252-265` 与 `ipc_channels.test.cjs:360-375` 确为此提供锁力。**一处须随证据引用的限定**（承自 S-0015，本次复核确认其仍适用）：这六个 `.js` 双胞胎 **零执行**（`test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`），故「被双胞胎锁住」不含双重执行保险，锁力全部来自单一 `.cjs`。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，在 `b2385d5d` 上由第二方（本审查人）以 `sed` / `ls -la` / `cat` / `grep` 独立复核，非外部权威背书。同机同工作树。

---

#### S-0060 | ASSESSMENT | evidence-examiner → E-0031

- **阶段**: 议案庭审
- **结论**: **四个行号全部精确命中，三条 SQL 逐字一致。** 内容简短，无夸大，其两条自陈限制（未核 id 空间同一性、未核是否暴露可调用查询方法）经核 **属实且是本条最关键的边界** —— 本条只证明 SQL 存在于 main，不证明它可被 Context V2 侧调用。
- **依据**: E-0031
- **不确定性**: `chats.id` 与 `ownerChatId` 是否严格同一 id 空间，本条未答，我亦未核（归 `code-owner-chat-core`，其 E-0043 自称已确认并升级 —— 不在本批射程）。
- **请求/下一步**: 引用时须限定为「材料在 main 进程里」，**不得读作「main 今天可以建这道门」** —— 后者需要一次 service 间可调用性的核实，本条不含。
- **评估结论**: 已验证
- **证据编号**: E-0031
- **来源类型**: general
- **真实性**: **成立。** `chat_storage/service.js:357` = `.prepare("SELECT id FROM chats")` ✓ · `:459` = `const chatRows = requireDb().prepare("SELECT id, meta FROM chats").all();` ✓ · `:489` = `const chatCount = db.prepare("SELECT COUNT(*) AS n FROM chats").get().n;` ✓ —— 三条 **逐字一致，行号零漂移**。`unchain/service.js:118-120` 亦命中：`:118-119` 为注释 `// Mirrors memory_v2_store._OWNER_ID_RE / _ID_RE. Main re-validates rather than / // trusting the sidecar to reject: a malformed id must never reach the wire.`，`:120` 为 `CONTEXT_V2_OWNER_ID_PATTERN`。**E-0031 称该段是「语法门的成文声明」，与原文语义吻合** —— 注释明说 main 重做的是 id 形状校验（mirror 正则），而非身份/归属校验。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界内的 grep + 定点读取。所有断言均可在同 revision 一命令复现。
- **相关性**: **相关，但证明力窄于字面读法。** 支持「丙 (3)：main 今天没有身份门，但材料在 main 里」—— 前半（没有身份门）由 `:118-120` 的注释所述「语法门」间接支持；后半（材料在 main 里）由三条 SQL 直接支持。支持「FE3：建门是新耦合、新行为」同样成立。**但本条第二条自陈限制是承重的关键**：只确认了 SQL 存在于 `chat_storage` service 内部，**未确认该 service 对同进程其他 service 暴露任何可调用的查询方法**。故「材料在 main 里」为真，「main 可以拿到这些材料去建门」**本条不证**。我未擅自补测（跨越到可调用性核实已超出本条射程）。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 独立复核。

---

#### S-0061 | ASSESSMENT | evidence-examiner → E-0032

- **阶段**: 议案庭审
- **结论**: **未验证 —— 承重的那一句被它自己引用的文件反驳。** `getTree` 入参只有 `{ownerChatId, spaceId}` 这一句 **逐字为真**；但同一份 preload bridge 里 **`listEntries` 同样没有 `limit`**，且主进程对它 **同样不施加 `CONTEXT_V2_PAGE_LIMIT_MAX`**。故本条列举的七方法「均带 `limit`」**有一个成员是错的**（应为 `readContent`，不是 `listEntries`），其登记的推论「**`getTree` 是唯一无上界的读方法**」**不成立**。
- **依据**: E-0032
- **不确定性**: `listEntries` 是否另有服务端隐式上界，我 **未核**（与 E-0032 自陈的 `get_tree` 同一限制，归 `code-owner-runtime`）。故我主张的是「在 E-0032 自己划定的比对面（preload 入参 + main 常量）上，`getTree` 不唯一」，**不主张两者的真实载荷同样无界**。
- **请求/下一步**: **三项。** ① 请提出方 `code-owner-electron` 更正列举集，并把推论改写为「`getTree` 与 `listEntries` 是十八个方法里 **两个** 无分页参数的读方法」。② 该更正 **对本案是加强不是削弱**：无上界读方法从一个变两个，封顶议题的射程随之变大 —— 请本庭不要因本条判未验证而把封顶关切一并下调。③ 已有发言若以「唯一」措辞引用本条（其「留待方案庭审」第三条、`code-owner-chat-bubble` E-0056 的「为 E-0032『`getTree` 是唯一无上界读方法』提供先例」），须随更正一并调整。
- **评估结论**: 未验证
- **证据编号**: E-0032
- **来源类型**: general
- **真实性**: **核心引文为真，列举集为假。** ✓ 命中：`unchain/service.js:131` = `const CONTEXT_V2_PAGE_LIMIT_MAX = 500;` 逐字一致 · `:132` = `CONTEXT_V2_CONTENT_LIMIT_MAX = 128 * 1024` ✓ · `:2108-2116` 精确框住 `getContextV2Tree` 全函数，其 query 只含 `owner_chat_id` ✓ · preload `context_v2_bridge.js:35-231` 精确框住 `createContextV2Bridge` 至 return 对象闭合，返回对象恰 **18 个方法** ✓ · `getTree`（`:86-90`）入参确为 `{ownerChatId, spaceId}` 二者，无分页无大小参数 ✓。✗ **不成立**：`listEntries`（preload `:92-98`）入参为 `{ownerChatId, spaceId, parentPath, includeDescendants}` —— **无 `limit`**；主进程 `listContextV2Entries`（`service.js:2118-2137`）的 query 只拼 `owner_chat_id` / `parent_path` / `include_descendants`，**全函数不出现 `CONTEXT_V2_PAGE_LIMIT_MAX`**。且 `include_descendants` 经 `contextV2Boolean(payload?.includeDescendants, "includeDescendants", true)`（`:2126-2130`），而 `contextV2Boolean`（`:572-580`）在值为 `undefined`/`null` 时 **返回 fallback**，故默认 `true`；`parent_path` 经 `optionalContextV2Path` 可整个省略。**省略 `parentPath` 的 `listEntries` 调用返回整个 space 的全部条目，无任何上界** —— 与 `getTree` 同形。真正带 `limit` 的七个是 `listEvents`(:50) · `readContent`(:58-59, 含 offset) · `search`(:105) · `listCandidates`(:112) · `listJobs`(:121) · `listPromotions`(:128) · `listCandidateReviews`(:179)。**另一处非实质偏差**：取得方式称 bridge 为「235 行」，实为 **234 行**（文件以换行结尾）；不触及任何被引行号，记为笔误级。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界内的整读。**可靠性本身不低** —— 十八个方法的入参表逐项复核无误，且其括注「`listEntries`（经 `includeDescendants`）」显示提交方 **察觉到 `listEntries` 的封顶机制不同**，却仍把它写进了「均带 `limit`」的集合，属表述崩塌而非编造。但依本关标准，**察觉到差异却未把差异贯彻到结论，正是承重复核要拦的形态**。
- **相关性**: **不充分 —— 证据为真，证的不是它声称的那件事。** 它声称支持的是排他性命题（「`getTree` 是 **唯一** 无上界的读方法」），而它引用的同一份文件里存在第二个反例。排他性命题需要遍历十八个方法后无反例，本条做了遍历却漏判了一项。**本条剩余可用的部分**：「`getTree` 无任何分页或大小参数，返回体大小由 store 内容单方面决定」—— 这一句 **完全成立，可独立采信**，只是不能带「唯一」二字。
- **来源归类**: **内部来源。** 仓内文件字面内容，`b2385d5d`，第二方以 Read 整读 preload bridge（234 行全文）+ `sed` 读 main 对应函数独立复核。

---

#### S-0062 | ASSESSMENT | evidence-examiner → E-0033

- **阶段**: 议案庭审
- **结论**: **已验证，且其承重部分在本次复核的首末两次测量中 *仍然* 成立。** `b2385d5d` / `dev` / 三产品目录零 dirty —— 三项全部现场复现。其登记的 dirty 计数 12 属 **验证窗口已关闭** 的历史快照，我无法回溯核实；但今天该数已是 **51**（我复核期间自 49 增至 51），这 **印证而非推翻** 本条的核心判断：dirty 计数是易变量，产品目录零 dirty 才是稳定量。
- **依据**: E-0033
- **不确定性**: 「新增 4 条为 shared-arteries（3）与 `0000-0005` 案卷（余）」这一构成分解 **不可回溯核实**（今天 shared-arteries 下已有 4 个 untracked）。该分解 **不承重**，我不因其不可核而对本条减分。
- **请求/下一步**: **两项。** ① 请本庭把本条的可采范围明确限定为 **「revision + branch + 三产品目录零 dirty」**，dirty 总数（无论 8 / 12 / 51）**不得进入任何裁定文本** —— 它在本案七小时内走了四个值。② 本条经复核可作为 **全批 12 条的时效锚点**：因产品目录在提交时与复核时均为零 dirty，本批全部行号引用不存在「提交后被改动」这一失效通道。
- **评估结论**: 已验证
- **证据编号**: E-0033
- **来源类型**: general
- **真实性**: **承重三项全部成立且今天仍成立。** 我在复核开始与结束各跑一次：`git rev-parse --short HEAD` → `b2385d5d`（两次一致，与 E-0001 及本批全部 11 条声明的 revision 相同）· `git branch --show-current` → `dev` ✓ · `git status --porcelain -- src electron unchain_runtime` → **两次均为空** ✓。**不可核项**：`git status --porcelain` 当时的 12 条。今天为 51 条（复核开始 49，结束 51）。本条 **已自陈「单次快照」**，故该差异是快照性质使然，**不是篡改，也不是本条的过失**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 主动对本庭 E-0001 所作的重测。**这一主动性提高而非降低其可靠性** —— 提交方在自己不被要求的情况下修正了本庭自己的登记数字，且明确标注「部分修正」而非「推翻」。其完整性限制「庭审期间是否有并发会话改动产品目录，我未持续监视」**是本条最有价值的一句**：本次复核相当于对该限制作了一次补测，答案是 **未被改动**。
- **相关性**: **相关且对全批承重。** 它声称支持「E-0001 的承重部分（产品代码锚点与 HEAD 一致）」并「部分修正其 dirty 计数」—— 两者均已坐实。**其真正的相关性甚至高于自陈**：它是本案唯一一条把「产品目录零 dirty」与「工作树整体 dirty」明确切开的证据，而这一切分正是本批其余 11 条得以被逐行复核的前提。
- **来源归类**: **内部来源。** 提交方自陈的 git 状态观察，本次由第二方在同一工作树上以同样四条命令 **原样复跑**，承重三项逐项吻合。同机同工作树，无独立第二环境。

---

#### S-0063 | ASSESSMENT | evidence-examiner → E-0034

- **阶段**: 议案庭审
- **结论**: **已验证，本批引用精度最高的一条。** 十四个行号锚点 **全部零漂移**，三条可复跑命令 **输出逐项吻合**，九个测试断言行段 **逐段命中所述内容**。其自陈限制（未跑 `react-scripts test`，只主张「测试文件里写着这些断言」）**是精确的自我限缩，不是免责套话**。
- **依据**: E-0034
- **不确定性**: 「这些测试今天是绿的」我 **同样未跑**（本关只读）。承 S-0022 的实测，`react-scripts test` 把 jest `roots` 钉死在 `<rootDir>/src`，故该 suite 若跑，双 worktree 根隐患对它 **结构性免疫** —— 但仍未跑。
- **请求/下一步**: 引用时保留提交方自设的措辞（「测试文件里写着这些断言」）。**该措辞不必因本次复核而放宽** —— 我核的是文本，不是执行。
- **评估结论**: 已验证
- **证据编号**: E-0034
- **来源类型**: general
- **真实性**: **成立，逐项零漂移。** 产品源：`:32-51` = `REQUIRED_METHODS` 冻结数组，恰 18 项 ✓（`getStatus` 在 `:33` · `listSpaces` 在 `:38` · `getTree` 在 `:39`，**三个行号逐一命中**）· `:57` = `const ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/;` **逐字节一致** ✓ · `:59-67` = `resolveApi` 的逐方法 `typeof !== "function" → return null` ✓ · `:69-75` = `unavailableError` 自造 `context_v2_unavailable`（消息 `:71`、`error.code` `:73`）✓ · `:77-82` = `parseContextV2ErrorCode` ✓ · `:86-94` = `invokeBridge`（无 api → reject / 同步抛 → reject / 否则 resolve）✓ · `:102/107/108` = `getStatus`/`listSpaces`/`getTree` 三个纯透传行 ✓。测试源：`:39-56` 含 `expect(METHODS).toHaveLength(18)` 与键集 = `["isAvailable", ...METHODS]` ✓ · `:74-90` 含注释「the payload must arrive byte-identical」+ `toHaveBeenCalledWith(decidePayload)` ✓ · `:93-99` 与 `:155-160` 为两个不同的 fail-closed 变体（删 review triad / 删 `getSessionHead`）✓ · `:127-131` 为 bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝 ✓ · `:151-152` = `expect(api.getStatus).toHaveBeenCalledWith();` 无参转发 ✓ · `:162-177` 不吞码（`expect(rejection).toBe(conflict)`）✓ · `:179-189` 同步抛转拒绝，确以 `listSpaces` 举例 ✓ · `:191-196` 码解析含 `"no code here"` → `toBeNull()` ✓。**三条可复跑命令原样复跑，输出逐项吻合**：`grep -ln … src/SERVICEs/api*.js` **零命中**（exit 1）✓ · `ls src/CONTAINERs/` **仅 `config`** ✓ · `grep -c "cache\|inflight\|dedup" …` = **1**，且该行确为 `:24` 的注释 `never cache module-level state` ✓。**唯一非实质偏差**：称产品源「全文 125 行」，实为 **124 行**（文件以换行结尾）；测试文件称「197 行」**完全准确**。该 +1 与 E-0032 的 +1 同形，属计行口径，**不触及任何被引行号**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 在其自有边界（`src/SERVICEs/bridges/`）内的两文件整读 + 三条可复跑命令。提交方主动限定「未运行测试」并把主张压到「文件里写着」，**未把静态阅读伪装成执行观察**。
- **相关性**: **相关且充分。** 支持「丁全节与 A1/A2」成立。**「复核通过 E-0006 的 renderer facade 段行号（`:39,108`）」经我独立复验为真** —— `:39` 是白名单中的 `getTree`，`:108` 是 facade 中的 `getTree` 透传行，两者确为该方法在本文件的仅有两处。**「关闭 `code-owner-settings` E-0017 的完整性限制」亦成立** —— `ls src/CONTAINERs/` 确只有 `config` 一个目录，故「未穷举 provider」这一疑虑在结构上被关闭，不是被论证关闭。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 逐段读 + 三条命令原样复跑独立复核。

---

#### S-0064 | ASSESSMENT | evidence-examiner → E-0035

- **阶段**: 议案庭审
- **结论**: **已验证。** 承重结论「`contextV2Bridge.getStatus` 在 renderer 生产代码中 **零调用点**」经原样复跑 **精确成立**。两条 grep 我逐条重跑，24 行与 19 行输出全部复现。**两处表述不精确，均不触及承重结论**：文件分布少算一个文件，「另外三个不相干的桥」实为更多。
- **依据**: E-0035
- **不确定性**: 与提交方同 —— 只覆盖字面标识符 `getStatus`，**未追经变量间接调用**（如 `bridge[name]()`）。我亦未追。
- **请求/下一步**: 承重句可原样采信。**若有发言要引用「12 处调用点」这个数字，须同时说明计数规则**（见下），否则读者会把一行 JSDoc 注释当成调用点。
- **评估结论**: 已验证
- **证据编号**: E-0035
- **来源类型**: general
- **真实性**: **承重项精确成立；两处枚举不精确。** ✓ **承重项**：`grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"` 复跑得 **24 行**，其中属 `contextV2Bridge` 的 **恰两处**：`src/SERVICEs/bridges/context_v2_bridge.js:33`（白名单）与 `:102`（定义）。**零调用点，逐字复现。** ✓ 第二条 grep 复跑得 **19 行**，其中 **无一行** 是 `contextV2Bridge.getStatus`。⚠ **不精确一**：「其余全部属于另外 **三个** 不相干的桥（`api.unchain` / `api.ollama` / `memory_vault_bridge`）或同名局部函数（`toast_host.js:89`）」—— 实测其余还落在 `src/SERVICEs/bridges/ollama_bridge.js`（4 行）与 `src/SERVICEs/test_bridge/index.js`（2 行）两个未列模块，且 `toast_host.js` 是 **两行**（`:89` 定义 `getStatusStyle`、`:150` 调用它）而非一行。⚠ **不精确二**：「既有调用点共 **12 处**，分布于 3 个 chat-bubble 文件 + `use_chat_stream.js`」—— **12 这个数字确实复现**，但只在一条特定规则下：`grep "contextV2Bridge\."` 的 19 个命中减去 7 个含 `isAvailable` 的命中 = 12。该 12 内含 **一行 JSDoc 注释**（`src/PAGEs/chat/hooks/context_v2_turn_mutation.js:9`，`* contextV2Bridge.getSessionHead() → contextV2Bridge.rebaseSession()`），而该文件是 **第五个** 文件，不在所述四个之内。真正的产品调用表达式为 **11 处**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 的可复跑 grep。两条命令原样给出且我原样复跑，**无手抄环节，无 E-0024 式偏差风险**。
- **相关性**: **相关且充分，就其承重方向而言。** 它声称「独立复核并确认 `code-owner-settings` E-0020 第 3 点（`getStatus()` 在 renderer 零消费者）」—— **该确认成立，且是本条的全部价值所在**。它同时声称「补充它已是承重方法这一相反方向的事实」（即 `getStatus` 虽零调用，却已是 `REQUIRED_METHODS` 成员、是可用性门的成立条件）—— 这一点由 E-0034 的 `:32-51` 与 `:59-67` 独立支撑，本次一并复验为真。**两处不精确不影响任一方向**：无论其余 `getStatus` 属三个桥还是五个模块，都不改变「属 `contextV2Bridge` 的只有定义与白名单两处」。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件，`b2385d5d`，第二方原样复跑两条命令 + 一次按文件的分布统计独立复核。

---

#### S-0065 | ASSESSMENT | evidence-examiner → E-0037

- **阶段**: 议案庭审
- **结论**: **未验证 —— 一项计数不符，且与本条自己的 `来源定位` 相互矛盾。** 「42 个互不相同的码」与「不符 `^[a-z0-9_]+$` 的 0 个」**逐字节复现**；但「`context_v2_unavailable` 在 **9 个** 非测试点发出」**实为 10 个** —— 而本条 `来源定位` 自己列出的碰撞点恰好就是 **10 个行号**。计数与自陈列举不自洽。
- **依据**: E-0037
- **不确定性**: 42 是否穷尽，我 **不主张**（与提交方同 —— 只覆盖四文件的字面量，拼接构造未覆盖）。「字符集恒定是否为有意约定」仍归 `code-owner-runtime`（本案 E-0063 已作答，不在本批射程）。
- **请求/下一步**: **三项。** ① 请提出方把 9 更正为 **10**，或说明其排除了哪一个及为何。② **本次复核顺带了结了 E-0054 完整性限制 (2) 登记的「差异未追」**：E-0054 计得 11，因其所用的 `grep -v "/tests/"` 过滤器 **未能滤掉 `tests/test_memory_v2_runtime.py:24`**（输出路径无前导 `./`，`/tests/` 不成为子串）—— 该滤失在 E-0037 提交的命令里 **同样存在**，我复跑时原样复现。**正确数字是 10**，E-0037 少 1，E-0054 多 1（多的那个是测试文件）。③ 更正后本条的承重部分可再议 —— **失效点在计数，不在结论方向**。
- **评估结论**: 未验证
- **证据编号**: E-0037
- **来源类型**: general
- **真实性**: **两项精确，一项不符。** ✓ 原样复跑其命令（`cd unchain_runtime/server`）：`wc -l < codes.txt` → **42**，逐字节吻合 ✓ · `grep -vE '^[a-z0-9_]+$' codes.txt` → **零输出**，逐字节吻合 ✓。✗ 第三条命令 `grep -rn '"context_v2_unavailable"' --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"` → **11 行**，其中 1 行为 `tests/test_memory_v2_runtime.py:24`（过滤器失效所致），**真实非测试点为 10**：`memory_v2_runtime.py:702` · `memory_v2_store.py:1527` · `route_memory_v2.py:259, 333, 388, 504, 591, 719, 804, 856`。**这 10 个恰是本条 `来源定位` 逐一列出的 10 个行号** —— 故本条的 9 与它自己的列举冲突。我另核实这 10 处 **全部是真实发出点**（逐一确认为 `raise MemoryV2Error("context_v2_unavailable", …)`，含 `memory_v2_store.py:1527` 的 `_connect` 闭连接分支与 `memory_v2_runtime.py:702` 的 `UNCHAIN_DATA_DIR` 未配置分支），**不存在「10 个出现点但只有 9 个发出点」这一可能的辩解**。✓ 另两项命中：`route_memory_v2.py:333` 的上下文经我读取 **完全如其所述** —— `_read_runtime_for_store_owner` 定义于 `:315`，`if store_owner != STORE_OWNER_UNCHAIN: return _runtime()` 在 `:327`（确在其紧邻上方），`:332-337` 为 `raise MemoryV2Error("context_v2_unavailable", "Context V2 storage is not configured", status_code=503, retryable=True)`，**503 与 `retryable: True` 逐字为真**。我方 `src/SERVICEs/bridges/context_v2_bridge.js:69-74` 的自造点亦命中（已在 E-0034 复核中确认）。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 的可复跑 grep，**但结论跨入 `code-owner-runtime` 边界**（本条自陈只作「请 runtime 确认」的锚点，这一自我限缩是恰当的）。命令原样给出，无手抄，前两项复现完美 —— **可靠性本身不低，失效点是一次计数疏漏**。
- **相关性**: **方向相关，承重不足（因计数）。** 它声称支持「乙 §2.3 解析面按字符集开放」—— 由 42/0 两项 **充分支持**，该部分不受计数错误影响。它声称支持「§2.4 码碰撞，且 sidecar 那一侧在读路径上」—— **碰撞事实成立**（同一字面串 `context_v2_unavailable` 既由 renderer facade `:69-74` 自造，又由 sidecar 至少 10 处发出），**读路径上的那一处（`:333`）亦经我独立核实为真**。故「碰撞」这一实质发现 **不依赖 9 还是 10**。**但依本关标准，承重复核不放行计数不符的登记** —— 请更正后再议，届时其承重范围应为「碰撞成立 + 42 码下界 + 字符集今天恒定」。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件字面内容，`b2385d5d`（`unchain_runtime` 零 dirty），第二方原样复跑三条命令 + 逐点读取上下文独立复核。

---

#### S-0066 | ASSESSMENT | evidence-examiner → E-0038

- **阶段**: 议案庭审
- **结论**: **已验证，且本庭点名的推断标注问题 —— 经查，标注是干净的。** 十一个行段锚点全部命中；其最尖锐的一句「**无任何测试覆盖 `/status` 非 2xx 分支**」经我独立穷举 **确认为真**。推断部分在本条内 **三处标注**（标题、完整性限制 (1)、证据类型判据），且我逐一追查了案卷内全部四处再引用点，**未发现任何一处以事实口吻裸用**。
- **依据**: E-0038
- **不确定性**: 本条的 **结论**（shipped 配置下 `getStatus()` reject）依旧是推断，**本次复核未改变其地位** —— 我只核了 `service.js` 一侧的代码事实，另一乘数（`code-owner-runtime` E-0010 b3）是须查类，其审查（S-0007）已把关键臂收窄。**推断 × 收窄后的须查类 = 仍是推断。**
- **请求/下一步**: **两项。** ① 本条的 **代码事实部分可作为事实引用**；**结论部分不可**，须保留其「推断」标签 —— 本庭 S-0012 已在分歧表的「自陈的弱点」列做到了这一点，**请在后续裁定文本中维持该形态**。② 一处未标注的转述（见真实性末段），请提出方在采纳时改为逐字原文或标明为转述。
- **评估结论**: 已验证
- **证据编号**: E-0038
- **来源类型**: general
- **真实性**: **成立，逐项。** `service.js:186-190` = `createContextV2Error`，函数体确为 `new Error(\`[${code}] ${message}\`)` + `error.code = code` ✓ **逐字一致** · `:1733-1782` 框住 `readJsonResponse` 全函数 ✓，其中 `:1740-1771` 确为 `!response.ok` 分支，`parsed?.error?.code` 的提取在 `:1746-1750`、`error.code = errorCode` 在 `:1770` ✓ · `:1892-1940` 精确框住 `contextV2Request` 全函数 ✓（`:1893` 首行即 `ensureMisoReady()`，与 S-0014 的独立发现吻合）· `:1897-1906` 为就绪门，**`:1898` 第一个条件确为 `endpoint !== \`${CONTEXT_V2_ENDPOINT}/status\` &&`** ✓，故「`/status` 必定真的发出」为真 · `:1931-1939` 为 catch 块，码保留 + 消息替换 ✓ · `:1945-1986` 精确框住 `getContextV2Status` 全函数 ✓，`:1946` 确为 `if (unchainStatus !== "ready" || !unchainPort) {`、短路块止于 `:1957`、`:1958` 确为 `const payload = await contextV2Request("GET", …/status)` ✓。测试锚点：`:210-247` 为 200 分支的八字段投影（`toEqual` 全等，含 `counts` 不得穿透的断言）✓ · `:249-288` 为短路分支，`:277-287` 确为 `resolves.toEqual({…})` + `expect(fetchImpl).not.toHaveBeenCalled()` ✓。**「无任何测试覆盖 `/status` 非 2xx 分支」经我独立穷举确认为真**：`getContextV2Status` 在该 49KB 测试文件中仅 3 次出现（`:16` 方法名清单 · `:225` 200 测试 · `:277` 短路测试），全文唯一的 `ok: false` 在 `:1332`（status 409，不在 `/status` 路径上）。preload grep 三行号（`:42 getStatus` / `:81 listSpaces` / `:86 getTree`）亦全部命中，且我整读全文确认 preload 确为纯 `ipcRenderer.invoke` 透传，无重包无归一 ✓。**一处未标注的转述**：净内容把 catch 写作 `const code = error?.code || "context_v2_failed"`，原文为 `const code = error && typeof error.code === "string" && error.code ? error.code : "context_v2_failed";`。二者在承重方向（码保留/缺码兜底）上等价，**但原文更严**（非字符串的真值 `.code` 会被原文丢弃、被转述保留）。该字段名为「净内容」非「关键原文」，故不构成引文失真，但读者可能误当逐字。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-electron` 的 `service.js` 与 `electron/tests/**`，并已在完整性限制 (2) 主动声明「权威结论归其所有」。这一自我限缩恰当。
- **相关性**: **相关；代码事实充分，结论部分依设计即不充分且已被标注。** **关于本庭点名核实的推断标注 —— 我的结论是标注干净，四处再引用全部带标签**：① 本条内 **三处** 标注（标题括注、完整性限制 (1) 明写「乘积只能是推断」、证据类型判据明写「不得作为事实引用」）。② `record.md:1108`（提交方自己的 S-0011 结论）以肯定语气写「在最需要它作答的那一态里它不 resolve，它 reject（E-0038）」—— **但同一篇发言 6 行后（`:1114`）设专节「二 · 甲 的核心论断里有一段是 *推断*，不是观察」逐字撤回该语气并请 `code-owner-electron` 确认或推翻**。依 S-0022 已确立的判据（「宽引用且有自限」≠「宽引用且无自限」），读完整篇发言者不会被误导。③ `record.md:1148`（A3 拟裁定条文）以肯定语气复用 —— **这是四处中最需注意的一处**，但其命题形态是 **禁止性的**（「判态不得只读 `getStatus` 的字段」），即便推断为假，该禁令的代价也只是保守，不会致错。④ `record.md:1487`（本庭 S-0012 的分歧表）**在同一行的「自陈的弱点」列原样写入了「两个都不是产品运行观察」**，且 S-0012 的不确定性栏明记「三方各自都明确标注了自己那一半是推断而非观察」。⑤ `record.md:1178` 以「读主进程控制流」开头，已自带静态阅读的框定。**未发现任何一处把该推断作为既定事实写入且无任何标签。**
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 逐段读 + 一次穷举 grep（`/status` 非 2xx 覆盖）+ 一次 preload 全文整读独立复核。

---

#### S-0067 | ASSESSMENT | evidence-examiner → E-0039

- **阶段**: 议案庭审
- **结论**: **已验证（就其自证类的代码事实部分），并按本庭指示 *以自证类* 复核，未因标题措辞改分类。** 四个 `service.js` 行段与三个 renderer 行号 **全部精确命中**，其核心代码事实 ——「主进程对数据调用无合成负值短路，该分支为 `getContextV2Status` 独有」—— **经我逐函数对读确认为真**。其结论部分依其自陈受所联合的须查类约束，**该约束在本次复核中不减反增**（见相关性）。
- **依据**: E-0039
- **不确定性**: `store_owner=unchain` 分支下 `getTree` 的实际码 **至今无人实跑**（本条完整性限制 (2) 自陈，E-0010 审查 S-0007 亦记录 runtime 未能实跑，`import unchain` 失败）。**我同样无法填补**（本关只读，不起 sidecar）。
- **请求/下一步**: **两项。** ① 请把本条的可采范围切成两段：**代码事实段**（主进程数据调用无合成负值出口）**可作为事实引用**；**判别器结论段**（空态与未启用态落在两个不相交分支上，单次调用即可区分）**须绑定 E-0010 经 S-0007 收窄后的作用域**。② **该收窄对本条尤其咬**：S-0007 已认定「200 空态臂 **只在 `store_owner=pupu_legacy` 下取得，而 Electron 从不发出该值**」—— 而 `getTree` 判别器恰恰需要那条 200 空态臂。故在 Electron 实际会发出的两个 owner（`unchain` / `off`）之下，**判别器的「resolve 臂」今天尚无任何产品配置下的观察支撑**。
- **评估结论**: 已验证
- **证据编号**: E-0039
- **来源类型**: general
- **真实性**: **代码事实成立，逐项。** `service.js:2098-2116` **精确框住** `listContextV2Spaces`(`:2098-2106`) 与 `getContextV2Tree`(`:2108-2116`) 两个完整函数，**两者均直接进入 `contextV2Request`，无任何前置短路分支** ✓ · `:1892-1940` 为 `contextV2Request` 全函数，其出口 **恰为两类**：`readJsonResponse` 的成功返回，或三处 `throw`（就绪门 `:1902` / fetch 失败 `:1918` / catch 重包 `:1938`）——「唯一出口是 200 载荷或抛」**成立** ✓ · `:1946` 确为合成负值短路的判定行，且该分支 **确为 `getContextV2Status` 独有**（我复核 `:2098-2116` 与 `contextV2Request` 全文，无第二处 `return { available: false, … }` 形态的短路）✓ · renderer 侧 `context_v2_bridge.js:86-94`（`invokeBridge`）· `:107`（`listSpaces` 透传）· `:108`（`getTree` 透传）**三处全部命中**（已于 E-0034 复核中逐行确认）✓。**分类经本庭 S-0016 更正后为自证类，本次即按自证类复核** —— 标题括注「与 `code-owner-runtime` E-0010 联合，其为须查类」指的是被联合的那一条，我未据该子串改判。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-electron` 的 `service.js`，并已在完整性限制 (3) 声明「归 `code-owner-electron` 确认」。其对所联合证据的依赖关系 **主动且完整地登记在完整性限制 (1)**（「该两条为须查类……其被推翻则本条随之被推翻」），**这是本条最值得肯定的一点** —— 它把自己的可证伪条件写在了脸上。
- **相关性**: **代码事实相关且充分；判别器结论相关但今天不充分。** 支持「A3」与「丙 §3.3」的代码事实半 —— **充分**。「部分反驳 F2（`code-owner-settings` 的『唯一无绕行方案』定性）」—— 结构论证成立，**但其充分性取决于两个前提**：(a) 后端不存在「store 关着却回 200」的出口 —— 由 E-0010 支撑，S-0007 未推翻；(b) 存在「空 store → 200」的出口 —— **由 E-0010 支撑，但 S-0007 已认定该臂只在 Electron 从不发出的 `pupu_legacy` 下取得**。前提 (b) 缺了产品配置下的观察，判别器的两臂就只证得一臂。**故本条不足以单独承载「单次 `getTree` 调用即可区分空态与未启用态」这一裁定级结论**；它足以承载的是「**在主进程这一层，`getTree` 的 resolve/reject 二分未被任何合成负值污染**」—— 这一句完全成立，且是本条对本案的真实贡献。
- **来源归类**: **内部来源。** 仓内文件字面内容（自证类）+ 对他人已提交须查类证据的联合推理。`b2385d5d`，第二方以 `sed` 逐函数对读 + 交叉查阅 E-0010/E-0012 及其审查结论（S-0007/S-0008）独立复核。

---

#### S-0068 | ASSESSMENT | evidence-examiner → E-0040

- **阶段**: 议案庭审
- **结论**: **已验证。** 四个行段锚点全部命中，三条 grep 输出全部复现，其中「**四个既有 V2 消费者中 `setInterval` 命中 0 处**」经我逐文件重跑 **精确成立**。提交方自陈未逐行确认的那个 interval（`use_chat_stream.js:10721`），**我读了上下文并可确认其与 V2 读平面无关** —— 该限制可解除。
- **依据**: E-0040
- **不确定性**: 与提交方同 —— 只覆盖字面标识符，未追经变量间接的定时器构造（如 `const f = setInterval` 别名）。我亦未追。
- **请求/下一步**: **两项。** ① 「V2 读平面今天零轮询」可作为事实引用。② 本条自陈的完整性限制（`:10721` 未逐行确认）**经本次复核可以解除** —— 请在采纳时一并记录，避免下游发言重复携带一个已被填补的缺口。
- **评估结论**: 已验证
- **证据编号**: E-0040
- **来源类型**: general
- **真实性**: **成立，逐项。** `:734-736` 命中（`:734` = `export const MemoryV2PendingReviews = ({ ownerChatId, isDark }) => {`，`:736` = `const available = Boolean(owner) && contextV2Bridge.isAvailable();` **逐字一致**）✓ · `:750-783` 精确框住 `loadPending` 的 `Promise.all` 四路，**`:782` 确为 `contextV2Bridge.listSpaces({ ownerChatId: owner }),`，且确在生产代码路径而非测试** ✓ · `:800-802` **逐字一致**：`spaces: Array.isArray(spacePayload?.spaces) ? spacePayload.spaces.slice(0, MAX_PENDING_ITEMS * 2) : []` —— 「把『没有 space』与『载荷畸形』折叠成同一个空数组」**为精确描述** ✓ · `:817-834` 覆盖挂载 `useEffect`（`:819-826`，`if (available) loadPending();`）✓。**计数复现**：对四个既有 V2 消费者（`memory_v2_pending_reviews.js` / `memory_v2_journal_reload.js` / `memory_v2_trace_audit.js` / `context_v2_turn_mutation.js`）各跑一次 `grep -n "setInterval\|poll"`，**四个文件全部零命中** ✓。`grep -rn "listSpaces\|listEntries\b" src` 复跑：产品命中确为 `memory_v2_pending_reviews.js:782` 一处 + bridge 自身的定义/白名单四行，**`listEntries` 在产品代码中零消费者**（本条未主张，我顺带登记）。**提交方自陈未核的那一项，我核了**：`use_chat_stream.js` 全文 `setInterval` **恰一处**（`:10721`），其上下文（`:10715-10730`）调用 `getRunForTest({ id, attempt_id })` 并捕获 `error?.code === "run_not_found"` —— **属测试桥轮询，与 Context V2 读平面无任何关系，确认无关**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-chat-bubble` 的文件，并已在证据类型判据中声明「处置权归其所有」。grep 可复跑，无手抄。
- **相关性**: **相关且充分。** 「修正记录：`listSpaces` 并非新消费者，第一跳今天已在跑」—— **成立且重要**，`:782` 是活的生产调用点。「支持 丙 §3.2 / §3.4 与 A5」成立。**「V2 读平面今天零轮询」这一句的证明力值得单独标定**：它由四个文件的零命中直接导出，**是一个全称否定命题在有限枚举上的完全验证**（枚举面即「既有 V2 消费者」四个文件），故在该枚举面上 **充分**；但它 **不蕴含**「未来新增消费者也不会轮询」，引用时不得外推。本条自己给出的成因（`:800-802` 之后的折叠即卸载）由 `code-owner-chat-bubble` E-0056 独立确认，不在本批射程。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件字面内容，`b2385d5d`（`src` 零 dirty），第二方以 `sed` 逐段读 + 三组 grep 重跑 + 一次上下文补测独立复核。

---

#### S-0069 | ASSESSMENT | evidence-examiner → E-0041

- **阶段**: 议案庭审
- **结论**: **已验证 —— 本批唯一一条输出逐字节全等的条目。** 11 个 locale 名称、13 键计数、missing/extra 全空、5 个 `boot.*` test 的 5 个行号，**全部逐字复现，零偏差**。其对 `code-owner-settings` 「12 个键」的修正 **成立**（实为 13）。
- **依据**: E-0041
- **不确定性**: 与提交方同 —— 未核实这 13 键是否全被 `t()` 引用，也未核是否存在未定义于 `en.json` 的 `t("memory_inspect.*")` 引用。**那是 `i18n-coverage` skill 的作业面，我亦未跑。**
- **请求/下一步**: 可直接采信。若裁定要压在「新增 UI 无需补翻译」上，**须另跑 `i18n-coverage`** —— 本条证的是「已定义的 13 键在 11 语言齐平」，不是「新增文案不需要补键」。
- **评估结论**: 已验证
- **证据编号**: E-0041
- **来源类型**: general
- **真实性**: **成立，逐字节。** 原样复跑其 python3 脚本：11 个 locale 文件名 **逐一吻合**（`de` `en` `es` `fr` `it` `ja` `ko` `pt-BR` `ru` `zh-CN` `zh-TW`），**每个 13 键，missing 与 extra 全部为 `-`** —— 与登记完全一致，无一字差。`grep -n "describe\|test(" src/SERVICEs/boot_locale_parity.test.js` 复跑：`:59` describe · `:60` `test("all 11 locales are covered")` · `:64` 失败键来自 main · `:73` 每 locale 定义全部 `boot.*` · `:89` 无多余 boot 键 · `:106` 非英文确实被翻译 —— **5 个 test 的 5 个行号逐一命中，且确实全部围绕 `boot.*` 而非 `memory_inspect.*`** ✓。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 在其自有边界（`src/locales/`）内的可复跑脚本 + grep。**脚本原样给出且我原样复跑**，无手抄、无环境依赖（纯 stdlib）、对固定 revision 确定性。
- **相关性**: **相关且充分。** 「修正 `code-owner-settings` 第五节的『12 个键』（实为 13）」—— **成立**。「支持正文第七节全部三条」—— 就 locale 齐平这一事实而言充分。**一处须随证据引用的射程界定（本条已自陈，我确认其必要）**：`boot_locale_parity.test.js` 的 5 个 test **全部只覆盖 `boot.*`**，**没有任何测试守护 `memory_inspect.*` 的齐平**。故「今天 13 键在 11 语言齐平」是 **一次快照观察，不是被测试锁住的不变量** —— 引用时不得读作「新增 `memory_inspect` 键会被 CI 拦住漏翻」。
- **来源归类**: **内部来源。** 可复跑命令 + 仓内文件字面内容，`b2385d5d`（`src` 零 dirty），第二方原样复跑脚本与 grep 独立复核，输出逐字节比对。

---

#### S-0070 | ASSESSMENT | evidence-examiner → E-0042

- **阶段**: 议案庭审
- **结论**: **已验证。** `关键原文` 块的 **每一行原文与每一个行号逐字节命中**，跨两个文件共十一个锚点零漂移。其完整性限制中那句自我论证 ——「`onInspectMemory` 在该测试文件仅出现 1 次，故『无测试断言其参数』不受未穷举的限制影响」—— 经我 grep **精确成立**，该自限逻辑正确。
- **依据**: E-0042
- **不确定性**: 与提交方同 —— **未运行应用，未观察实际右键行为**。本条是纯静态的代码形状证据。
- **请求/下一步**: 可直接采信为代码事实。**其决定性主张（`node.chatId` 在 character 分支内已被求值两次，故在 `:207` 处被丢弃不是「拿不到」而是「没传」）** 经复核逐字成立，可作为事实引用。
- **评估结论**: 已验证
- **证据编号**: E-0042
- **来源类型**: general
- **真实性**: **成立，逐字节。** `side_menu_context_menu_items.js`：`:24-25` = `const isCharacterChatNode = (chatId) => chatStore?.chatsById?.[chatId]?.kind === "character";` ✓ · `:194` = `if (node.entity === "chat") {` ✓ · `:195` = `const chat = chatStore?.chatsById?.[node.chatId];` ✓ · `:196` = chatTitle 行 ✓ · `:197` = `if (isCharacterChatNode(node.chatId)) {` ✓ · `:198-201` = `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")` ✓ · `:207` = `onInspectMemory && onInspectMemory(memorySessionId, chatTitle),` ✓ · `:223` = `onInspectMemory && onInspectMemory(node.chatId, chatTitle),` ✓ —— **八行逐字节一致，无一处漂移**。`side_menu.js`：`:237-241` = `useState({ open:false, sessionId:null, chatTitle:"" })` ✓ · `:296-298` = `handleInspectMemory` ✓ · `:425-436` = `buildSideMenuContextMenuItems({…})` 调用，`onInspectMemory: handleInspectMemory` 确在 `:433` ✓ · `:772-779` = `<MemoryInspectModal …/>` JSX ✓。测试文件：`:277-293` 确为一次 `buildSideMenuContextMenuItems` 调用（`onInspectMemory: jest.fn()` 在 `:285`）+ **恰四条** `items.some((item) => item?.label === …)` 断言（`:289-292`），**无任何对 `onInspectMemory` 调用参数的断言** ✓。**其自限的关键前提经我独立 grep 确认**：`grep -n "onInspectMemory" side_menu_context_menu_items.test.js` → **恰一行（`:285`）**，故「未穷举全部 7 个调用点」这一限制 **确实不影响** 结论。
- **可靠性**: **内部来源**，`code-owner-chat-core` 在其自有边界（`src/COMPONENTs/side-menu/`）内的定点读取 + grep。提交方的 `关键原文` 采用逐行标注行号的形式，**便于逐字节比对，这一呈现形式本身提高了可核性**。grep 复跑结果与其登记的调用点分布一致。
- **相关性**: **相关且充分。** 支持「甲（C4 仍然有效）」与「乙（两分支应传 `node.chatId`）」—— 由 `:207` 与 `:223` 的对照直接支持。**「加强 E-0016」这一主张经复核为真且是本条的核心贡献**：E-0016 只登记了两个调用点的存在，本条补上的是 **`node.chatId` 在 character 分支内已被求值两次**（`:195` 索引 `chatsById`、`:197` 传给 `isCharacterChatNode`）—— 这把「`:207` 没传 `node.chatId`」从「可能拿不到」精确化为「已在手里但没传」，**是一个实质不同的命题，且完全由原文支撑**。**一处射程界定**：本条证的是代码形状，**不证运行时右键行为**（其已自陈）；且 `:277-293` 那一处测试的存在 **不构成对参数契约的守护** —— 四条断言只查菜单项 label，故新增/改动 `onInspectMemory` 的实参 **不会被现有测试拦住**。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`（`src` 零 dirty），第二方以 `sed` 逐段读三个文件 + 一次 grep 穷举独立复核。

---

## 批次收尾

**已验证 10 条**：E-0030 · E-0031 · E-0033 · E-0034 · E-0035 · E-0038 · E-0039 · E-0040 · E-0041 · E-0042
**未验证 2 条**：E-0032（列举集含一个错误成员，推论「唯一无上界读方法」被 `listEntries` 反驳）· E-0037（「9 个非测试点」实为 10，且与本条自己的 `来源定位` 列举冲突）

**两条须提请本庭注意的溢出发现**（超出单条，故在此单列）：

1. **`listEntries` 是第二个无上界读方法。** 由 E-0032 复核带出。preload 无 `limit`，main 无 `CONTEXT_V2_PAGE_LIMIT_MAX`，且 `include_descendants` 默认 `true`、`parent_path` 可省。**这是对封顶议题的加强，不是削弱** —— 请勿因 E-0032 判未验证而连带下调该关切。
2. **E-0054 完整性限制 (2) 登记的「差异未追」已由本次复核了结。** 正确数字是 **10**：E-0037 记 9（少 1），E-0054 记 11（多 1，多的是 `tests/test_memory_v2_runtime.py:24`，因两者共用的 `grep -v "/tests/"` 过滤器对无前导 `./` 的路径失效）。

**三条时效性结论**（重申，全批共用）：锚点 `b2385d5d` 未漂移 · 三产品目录在复核首末两次测量中均零 dirty · 工作树整体 dirty 计数本案内已走过 `8 → 12 → 49 → 51`，**不适合承载任何裁定**。

#### S-0071 | ASSESSMENT | evidence-examiner → E-0073

- **阶段**: 议案庭审
- **结论**: 八行输出 **全部逐字复现，无篡改迹象**。admission 替身自陈 **充分且必要** —— 已核实该对象在 `_resolve_memory_runtime` 内 **只被读取一次**。此外本庭发现该结论 **另有一条独立机制支撑**，比 harness 所示更强。**但负向搜索自陈 不充分**：我找到了提交方所说的「第三个写入者」，且它 **服务端零 admission 门禁**。故本条 **只能支持其 `支持/反驳` 字段所写的窄命题**，不支持传唤书中「V2 生效后 V1 向量视图不再有新数据」的宽命题。
- **依据**: E-0073
- **不确定性**: 见下「不确定性」三项
- **请求/下一步**: 见下「请求」三项
- **评估结论**: 已验证
- **证据编号**: E-0073
- **来源类型**: general

- **真实性**: **确认。** 两仓 revision 与自陈一致且工作树洁净（PuPu `b2385d5d`、unchain `a4e69f4`，`git status --porcelain -- src electron unchain_runtime` 为空，unchain 全仓为空），故复跑与提交时同底。**原样复跑其命令，八行输出与卷内逐字一致**，含 `unchain resolved -> /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`（E-0059 产品 bootstrap 方法有效）、`kind = v2_durability`、`KernelMemoryRuntime`、两个 `False`，及 docstring 前三行。无篡改迹象。复跑后再次确认两仓零改动。

- **可靠性**: **内部来源，但可靠性高于「须查类」的一般水准。** 该 harness 完全确定性：不依赖网络、不依赖本机 store（`UNCHAIN_DATA_DIR` 指向临时目录）、不依赖时点。任何角色在同 revision 可原样复现，**实测复现结果与复现者无关** —— 就判据而言它的行为接近自证类。提交方对四项限制（替身、未起 sidecar、临时目录、同机同环境）的自陈准确，无夸大。

- **相关性**: **对其自身所写的窄命题成立；对传唤书转述的宽命题不成立。** 分三层：

  1. **替身自陈（传唤第 2 问）—— 核实为充分。** `memory_v2_admission` 在 `_resolve_memory_runtime`（`unchain_adapter.py:5573-5613`）内 **仅出现一次**，即 `:5579` 的 `bool(getattr(memory_v2_admission, "is_active", False))`；进入该分支后再不触碰该对象。真实 admission 亦以属性形式持有 `is_active`（`:7151`、`:7360`）。故 `class Adm: is_active = True` **对本函数完全保真**，而「不证明真实 admission 何时 is_active」的自陈 **准确且必须保留**。

  2. **本庭另获一条独立佐证（强于 harness）。** 缺少 `commit_messages` / `prepare_messages` **甚至不需要被触发**：`unchain_adapter.py:8733` 的 `if memory_manager is not None and not graph_memory_v2_admission.is_active:` 把整个 prepare 段落挡在 active V2 之外，`memory_commit_allowed` 遂停留在 `:8731` 的 `False`，而 `:9488` 的 V1 commit 正以该标志为条件。**即 active V2 下 V1 commit 是被显式标志跳过，而非撞 AttributeError。** 能力缺失与控制流门禁 **两条互不依赖的机制指向同一结果**。

  3. **负向搜索自陈（传唤第 3 问）—— 覆盖面不足，第三个写入者确实存在。** 我沿 `add_texts` 全量枚举，得三个写入 `_session_collection_name` 派生集合的调用点，其中 **一个在 PuPu 侧且完全在 `commit_messages` 之外**：
     - `memory_factory.py:1948` `vector_adapter.add_texts(session_id=…)`，位于 `_commit_short_term_session_memory_replacement`（`:1861`），写入 `:1899-1906` 处算出的 session 集合；
     - 公开入口 `replace_short_term_session_memory`（`:2030`）与 `delete_short_term_session_memory`（`:2357`）；
     - 前者由 `route_memory.py:54` 的 **`POST /memory/session/replace`** 直接调用，**该路由服务端只校验 auth，无任何 V2 admission 判断**；后者由 `character_service.py:289` 调用。

     该路径把 **请求体里的 `messages`** 重新嵌入向量集合，故它 **有能力** 在 V2 生效期间向 V1 向量视图注入新内容。渲染端两个调用者中：`use_chat_stream.js:4066` 的 V1 mirror 腿 **被 `:4040` 的 `admissionMode !== SHADOW` 提前 return 挡住**（active 不镜像，shadow 才双写），此点保住了 active 场景；但 `chat_export.js:169` 的 `restoreSessionMemory`（导入会话时）**不带任何 admission 判断**。

     **净效果**：宽命题「V2 生效后 V1 向量视图不再有新数据」**并非由本条证据成立**，它还需要上述渲染端门禁事实，而那些事实 **不在 E-0073 内，是本庭自行查得**；且该门禁 **只在渲染端，服务端敞开**。反之，E-0073 `支持/反驳` 字段自己写的 **「admitted run 装配的运行时对象在能力层面就不可能写 V1 向量」完全成立**，且不受这些额外写入者影响 —— 它们不是 run 装配的那个对象。

  4. **一处必须随本条一同引用的剥离**：传唤书所述「退化静默（200 + 空 payload）」**不由 E-0073 承载**。该 harness 不发任何 HTTP 请求、不观察任何响应体。该半句若要承重，须另引它证。

- **来源归类**: **内部来源。** 自搭 harness 覆盖 `pupu:unchain_runtime/server/unchain_adapter.py` 与 `memory_factory.py`，被测代码全部在库内、同 revision 可定位。终局确认权按边界归 `code-owner-runtime`；`use_chat_stream.js` / `chat_export.js` 侧事实归 `code-owner-chat-core` 与 `code-owner-shared-arteries`。

- **不确定性**:
  1. 真实 `resolve_memory_v2_admission` 何时返回 `is_active=True` **仍未取证**（提交方已自陈，本庭确认该缺口真实存在）。
  2. 我沿 `add_texts` 做的枚举是 **又一次负向搜索**；我覆盖了两仓 `*.py` 的 `add_texts` 与 `.upsert(` 全量命中并排除测试与 `__pycache__`，但 **未穷举反射式/动态构造的调用**。
  3. `chat_export.js` 导入路径在 V2 已 admit 的会话上究竟能否触发，**未实跑**；我只确认该调用点无 admission 判断。

- **请求/下一步**:
  1. 采纳本条时 **须一并载明第 3 点的窄化**：可用于「运行时对象无能力写 V1 向量」，**不可** 单独用于「V1 向量视图不再有新数据」。
  2. `POST /memory/session/replace` 服务端无 admission 门禁一事，建议由 `code-owner-runtime` 确认是否属预期设计 —— 本庭 **不就此发表实体意见**。
  3. 「退化静默」半句请勿挂在 E-0073 名下。

---

#### S-0072 | ASSESSMENT | evidence-examiner → E-0075

- **阶段**: 议案庭审
- **结论**: 手抄签名与 description **逐字核对通过**（仅返回标注一处非实质差异）。更进一步：**本庭构造出了真实 toolkit 并 dump 出真实 provider JSON schema** —— 提交方预言「若审查人能做到则强于我这一条」，本庭做到了，其 **核心观察被真实闭包与四条 provider 路径全部证实**，限制 (3) 就此关闭。**但同时证伪了本条自己的限制 (2)，并推翻传唤书「模型压根不知道 folder 存在」的表述**：`from_callable` 会解析 `:param:`，`memory_list` 的 `folder` 字样 **确实到达模型**。
- **依据**: E-0075
- **不确定性**: 见下「不确定性」三项
- **请求/下一步**: 见下「请求」三项
- **评估结论**: 已验证
- **证据编号**: E-0075
- **来源类型**: general

- **真实性**: **确认，附一处措辞瑕疵。** 原样复跑其命令，description 与十个 `ToolParameter` 全部复现，`Argument <name>` 占位、`pattern=None`、无 enum 均一致。
  - **逐字比对（传唤指定项）**：签名 `memory_v2_toolkit.py:1355-1366` 与手抄 **完全一致** —— 十个参数的名称、顺序、类型、默认值逐一吻合，含 `kind: str = "markdown"`（实际在 `:1361`）与三个必填项。docstring `:1367-1372` **逐字一致**。description 实际位于 `:1760`，落在其所引 `:1758-1762`（该元组区间）之内，**字符串逐字一致**。
  - **唯一差异**：真实签名返回标注为 `-> dict[str, Any]`，手抄写作 `-> dict`。**非实质** —— 已由下述真实闭包 dump 证明返回标注不参与 schema 生成，两者产出相同。
  - **措辞瑕疵**：卷内标注「**实际输出（节选，逐字）**」的代码块内含为对齐而加的多余空格（`name='path',   description=…`），真实输出为单空格。**内容无出入，但该块并非字面逐字**，建议改标「节选（已对齐）」。

- **可靠性**: **内部来源；本庭已把它从「重建」升格为「原件」。** 提交方最大的自陈风险（复制签名而非导入真实闭包）**已被消除**：`build_memory_v2_toolkit`（`memory_v2_toolkit.py:481`）的 `runtime` 参数 **只在 `:503` 作 `is None` 判断**，运行时对象仅在工具被调用时才使用，故可传哨兵 `object()` 构造出 **真实 toolkit**。实测：
  - `build_memory_v2_toolkit(runtime=object(), …, curator=True)` → `unchain.tools.toolkit.Toolkit`，注册 14 个工具，含 `memory_upsert`；
  - 其真实 `Tool` 对象的 description 与十个参数 **与提交方的重建逐字符相同**。
  - **重要限定**：默认 `curator=False` 时 `:1327` 的 `if not is_curator:` 提前 return，工具只有 6 个且 **不含 `memory_upsert`** —— 该工具 **只对 curator 运行暴露**。此点 E-0075 未提及。

- **相关性**: **对 `memory_upsert` 的窄命题成立且已被强化；对「模型可见面」的宽表述不成立。** 分四层：

  1. **限制 (3) 已被本庭关闭，结论在 provider 边界成立。** `Toolkit.to_provider_json(provider)` 即模型可见 JSON。对 `openai` / `anthropic` / `gemini` / 默认 四条路径实跑，`memory_upsert` 均为：`"kind": {"type": "string", "description": "Argument kind"}` —— **无 `enum`、无 `pattern`、无默认值**；`required` 仅 `[path, description, expected_space_revision]`；`additionalProperties: false`。**字符串 `"enum"` 在三种 toolkit 变体的完整 provider JSON 中零出现。** 故「未以 enum 约束 `kind`」**在模型实际收到的 schema 层面确证**，不再隔着 provider adapter。

  2. **「函数 docstring 被丢弃」成立。** `memory_upsert` 的散文式 docstring 未进入任何模型可见字段；元组显式提供 description，故连 docstring summary 回退（`unchain:src/unchain/tools/tool.py:179`）也未启用。

  3. **限制 (2) 的推断被证伪。** 提交方推断「其余工具的参数描述按同一 `from_callable` 路径亦为占位串」。**错。** `Tool.from_callable` **会解析 `:param name:` 指令**（`unchain:src/unchain/tools/tool.py:266` 取 `parameter_descriptions`，`:282` 仅在缺失时回退 `f"Argument {name}"`）。实测三种变体下 **均有 3 个参数带真实描述**，全部来自 `memory_list`（`memory_v2_toolkit.py:924-935` 使用 `:param:` 语法）。**占位串是 `memory_upsert` 散文 docstring 触发的回退，不是 `from_callable` 的无条件行为。**

  4. **传唤书「模型压根不知道 `folder` 存在」被直接推翻。** 在 **全部三种 toolkit 变体**（普通 agent / curator / task_state_curator）的模型可见 JSON 中，均含 `memory_list.path` → **`"Virtual folder path; never use a host filesystem path."`**。**`folder` 一词确实到达模型**，且普通 agent 也看得到。
     **仍然成立的、且仍具材料性的窄事实是**：唯一的写入工具 `memory_upsert` 的模型可见面 **不提 `folder`**，`kind` **无 enum、无默认、描述为占位串**。**但「模型不知道 folder 存在」不能再说** —— 「扁平是稳态」的升格因此失去其中一条支柱，是否仍成立须由提出方重排，**不由本庭判断**。

- **来源归类**: **内部来源。** 被测面跨两仓：`pupu:unchain_runtime/server/memory_v2_toolkit.py` 归 `code-owner-runtime`；`unchain:src/unchain/tools/tool.py` 与 `toolkit.py` 归 `code-owner-unchain`。提交方对该跨界的自陈准确。

- **不确定性**:
  1. 我以 `object()` 作 runtime 哨兵构造 toolkit。**该替身只被 `:503` 的 `is None` 读取**，故对 schema 生成保真；但同 E-0073，**不证明真实运行时下工具集合完全相同**（`curator` 等入参由服务端决定）。
  2. 我 dump 的是 unchain 的 `to_provider_json`。**未实跑一次真实 provider 网络请求**，故「SDK 不再改写 schema」这一层 **仍未取证** —— 相对提交方的自陈已推进一层，但未推到底。
  3. `memory_upsert` 仅对 `curator=True` 暴露一事，其对宽命题的影响 **未评估**，本庭不评估。

- **请求/下一步**:
  1. 采纳本条时 **必须同时载明第 3、4 点**：其限制 (2) 的推断已证伪，且 **「模型压根不知道 folder 存在」不可再使用**；可用的是「`memory_upsert` 不提 folder、`kind` 无 enum 无默认」。
  2. 建议以本庭 dump 出的 **真实 provider JSON** 取代或补强 E-0075 的重建输出 —— 提交方已预先声明该形态强于其原件。
  3. 「实际输出（逐字）」标注建议按真实性节的意见修正。

---

#### 执行约束自陈
- **A-012 遵守：未派生任何子 instance。** 全部复跑、grep、读取与真实 toolkit 构造由本 instance 亲自执行。
- **只读。** 两仓零改动 —— 复跑前后均实测 PuPu `git status --porcelain -- src electron unchain_runtime` 为空、unchain 全仓 `git status --porcelain` 为空，HEAD 仍为 `b2385d5d` / `a4e69f4`。全部 harness 的 `UNCHAIN_DATA_DIR` 指向 `tempfile.TemporaryDirectory()`，**未触碰本机真实 store**，未起 sidecar，未发网络请求。
- **未就实体争点发表意见。** 本庭对「vector view 该不该保持现状」「tree 会不会退化」**不持立场**；上文对宽命题的窄化只陈述「该证据支持到哪里为止」，不主张任何方案取舍。
- **两条结论独立作出，未合并判定。**

# 承重证据复核 · 批次 D（12 条）

`evidence-examiner` · 2026-08-08 · 只读，未改动任何文件

---

## 全批时效前提

复核实跑于：

```
git -C /Users/red/Desktop/GITRepo/PuPu rev-parse --short HEAD   → b2385d5d
git branch --show-current                                        → dev
git status --porcelain -- src electron unchain_runtime           → 0 行
```

**HEAD 与全批证据所载 revision（`b2385d5d`）一致，三个产品目录零 dirty。** 故本批全部 `file:line` 锚点的时效前提成立：**所有「当时是这样」的锚点，今天在同一 revision 上仍指向同一内容**，除下文逐条点名的例外。E-0001 承重复核所载「产品目录零 dirty」在本次（第五次时点）复测仍然成立。

**本批 12 条全部为自证类，全部按「进入承重集合免检失效」逐条实测。** 所有计数类与穷举类断言均实际重跑命令，未依赖登记摘要。

**批次 A 的缺陷模式在本批复现，且更严重**：本批查出 **5 条** 「登记转录 ≠ 该命令的实际含义或输出」，其中 **E-0053 是登记输出经复跑直接证伪**（不只是遗漏），**E-0054 是命令自身的过滤器失效导致标签为假**，**E-0055 是提交方自己预告的搜索盲区被实际命中**。四例全部落在负向或穷举性断言上。

---

#### S-0073 | ASSESSMENT | evidence-examiner → E-0043
- **阶段**: 议案庭审
- **结论**: 全部 `file:line` 锚点与 `关键原文` 逐字复现，但登记的穷举计数「产品写点共 8 处」为假 —— 实为 **9 处**，遗漏 `chat_storage_migrate.js:174`。
- **依据**: E-0043
- **不确定性**: 遗漏项 `migrated.activeChatId = active;`（:174）的赋值同样受 `migrated.chatsById[input.activeChatId]` 成员性守卫约束（:169-172），或取自 `chatsById` 派生值/`null`，故 **不改变结论方向**；但该文件的 V1→V2 迁移函数完全未出现在证据中，`完整性限制 (1)` 只提到 `migrate.js:285-313`，**未披露 :174**。
- **请求/下一步**: 引用时把「8 处」改为「9 处」并补入 `chat_storage_migrate.js:174`；锚点与 `关键原文` 可单独承重。
- **评估结论**: 未验证
- **证据编号**: E-0043
- **来源类型**: general
- **真实性**: 锚点全部命中：`use_side_menu_actions.js:19-25`（`handleSelectNode` → `selectTreeNode` + `setChatStore`）· `side_menu.js:390` · `chat_storage_store.js:1022-1029`（`:1023` 守卫、`:1029` 赋值逐字一致）· `:1704-1744`（`selectTreeNode` → `updateActiveAndSelectedFromChatId`）· `chat_storage_tree.js:335` · `use_chat_session_state.js:237/345-353/412` · `use_chat_stream.js:11874/11985` —— 全部逐字相符。**计数失实**：`grep -rn "activeChatId = " src/SERVICEs/chat_storage/*.js` 重跑，非测试的 store 写点为 store.js 的 391/1029/1135/1869/1888/1898/2019 加 migrate.js 的 **174** 与 313，共 9 处；登记的 8 处漏掉 :174。（store.js:1071 与 migrate.js:285-310 为局部变量，正确排除。）
- **可靠性**: 内部来源（`code-owner-chat-core` 自陈只读检查），可在固定 revision 上机械复核。
- **相关性**: 支持其所称命题（`activeChatId` 的每个写点都受 `chatsById` 成员性约束）—— 补上第 9 个写点后该命题仍成立。计数缺陷不翻转方向，但登记形态是穷举枚举，下游可能当封闭集使用。
- **来源归类**: 内部来源

---

#### S-0074 | ASSESSMENT | evidence-examiner → E-0044
- **阶段**: 议案庭审
- **结论**: 全部锚点与计数逐字复现，**22 处产品命中，数目与内容均一致**，无缺陷。
- **依据**: E-0044
- **不确定性**: 证据自陈的三项限制均属实且未被本次复核触及：注释按传闻类隔离（其主张所据为 `:6496`/`:6501` 两行代码，成立）；未实跑观察真实 payload；未核实 sidecar 侧行为。
- **请求/下一步**: 可直接承重。sidecar 侧 `owner_chat_id` 建 space 的确认仍归 `code-owner-runtime`。
- **评估结论**: 已验证
- **证据编号**: E-0044
- **来源类型**: general
- **真实性**: `:4116-4119` `runTurnRequest = useCallback(async ({ mode, chatId: targetChatId, …` ✓ · `:4713` `let effectiveThreadId = targetChatId;` ✓ · `:4912` `effectiveThreadId = resolvedCharacterConfig.session_id;` ✓ · `:6454-6456` 注释逐字一致 ✓ · `:6496`/`:6501` 两条 payload 分支各一次 `owner_chat_id: targetChatId,` ✓ · `:11978` `const targetSessionId = characterConfig?.session_id || currentChatId;` ✓ · `:11985` `ownerChatId: currentChatId,` ✓。重跑 `grep -n "ownerChatId\|owner_chat_id" src/PAGEs/chat/hooks/*.js src/PAGEs/chat/*.js | grep -v "\.test\.js"` → **恰好 22 行**，与登记一致；逐行核对，六处 `ownerChatId: currentChatId`（11985/12002/12277/12294/12524/12541）全部取 UI chat id 而非 session id，「全部一致」成立。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 直接支持其所称命题（写侧 `owner_chat_id` 恒为 UI chat id）。这是本批唯一一条产端写侧的直接代码依据，相关性强且未越界。
- **来源归类**: 内部来源

---

#### S-0075 | ASSESSMENT | evidence-examiner → E-0045
- **阶段**: 议案庭审
- **结论**: 锚点全部属实，其单层事实（右键不改动激活选择）成立；**但本条的证据基础只覆盖 side-menu 回调这一层，不覆盖「整条链路」，更不含任何关于「可检测性」的证据。**
- **依据**: E-0045
- **不确定性**: 提交方自陈未核实的前提（explorer 是否先选中再派右键）**由我独立核实并解除**：`src/BUILTIN_COMPONENTs/explorer/explorer.js:607-611` 的 `handleContextMenu` 全体只有 `if (node.on_context_menu) node.on_context_menu(node, e);`，不触发 `onSelect`/`on_click`；`onClick={handleClick}` 是同一 div 上的独立 handler，contextmenu 事件不派发它。故该前提成立，结论不翻转。
- **请求/下一步**: **`expert-architecture` 的必要条件 C-A10 若以「错主在整条链路上结构性不可检测」为据，不能只靠 E-0045 承重** —— 该强主张所需的下游层证据（bridge / main 校验 / sidecar）本条一条都没有；跨层可检测性须另行取证或改由 E-0016/E-0024 一线承担。建议 speaker 把 E-0045 的承重范围明确限缩为「错主值可在 side-menu 层无声产生」。
- **评估结论**: 已验证（**仅限单层事实，见相关性**）
- **证据编号**: E-0045
- **来源类型**: general
- **真实性**: `side_menu.js:344-353` 的 `handleContextMenu` 实体存在，函数体确无 `handleSelectNode` / `selectTreeNode` / `setChatStore`；`:390`/`:391` 为 `explorerHandlerCallbacksRef.current.onSelect` / `.onContextMenu` 两个独立槽位 ✓；`:237-241` `memoryInspect` 本地 state ✓；`use_side_menu_actions.js:19-25` ✓。**一处形式偏差**：`关键原文` 是把多行对象字面量压成一行的**重排转录**，真实函数体跨 344-353 共 10 行，非登记所称「全函数体四行」；语句集合与 token 完全一致，属描述性不准确，非内容改动。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: **这是本条的关键限制。** 登记的四个锚点全部位于 side-menu 组件层，共同只证明一件事：**右键不会同步激活选择**——一个**发生侧（origination）**的事实。本条 **未登记任何** 关于以下各层的证据：explorer 派发层（提交方自陈未核）· 右键菜单项对 node 的后续取值（`side_menu_context_menu_items.js:196-207`，`memorySessionId` 直接由被右键 node 派生后交给 `onInspectMemory`，无任何校验）· bridge/IPC 层 · main 校验层 · sidecar 层。**「不可检测」是一条跨层否定命题，本条的证据基础一层都没覆盖到。** 就其自身所称的「新增一条错主路径」而言，相关性成立且充分。
- **来源归类**: 内部来源

---

#### S-0076 | ASSESSMENT | evidence-examiner → E-0046
- **阶段**: 议案庭审
- **结论**: 全部锚点、两项计数、以及 `resolveApi` 的全有或全无语义均逐字复现，无缺陷。
- **依据**: E-0046
- **不确定性**: 证据自陈两项限制属实：「facade 加第 19 个方法会让测试静默改走降级分支」确为对 `resolveApi()` 语义的推论而非实跑（该语义我已在 `:63-65` 的 `for … if (typeof api[method] !== "function") return null;` 上核实，推论成立但仍是推论）；未核实 chat-bubble 三个消费者的 mock 形态。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0046
- **来源类型**: general
- **真实性**: 重跑计数 = **18** ✓；实际 mock 方法名逐个与 `REQUIRED_METHODS`（`context_v2_bridge.js:32-50`，18 项）**同名同序** ✓；`:249 getTree: noop,` ✓；`resolveApi` 于 `:59-67` 且为全有或全无 ✓；`grep -rln "contextV2API" src --include="*.js"` → **恰好 3 个文件**（本测试 + facade + facade 测试）✓。`use_chat_stream.js` 七个锚点全部命中：`:87-89`（import）· `:3907`/`:4004`（`isAvailable()` 守卫）· `:3916`（`getSessionHead`）· `:4010`（`rebaseSession`）· `:3920`/`:4013`（`parseContextV2ErrorCode(error) || "context_v2_failed"`）✓。（`取得方式` 的计数窗口写 `NR>=205` 而 `来源定位` 写 `:208-262` —— mock 对象起于 :207、首方法在 :208，窗口放宽不影响结果。）
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 直接支持其所称命题（该测试替身与 facade 必需方法集完全耦合，且是 `src/COMPONENTs/**` 与 `src/PAGEs/**` 下唯一构造该替身的文件）。
- **来源归类**: 内部来源

---

#### S-0077 | ASSESSMENT | evidence-examiner → E-0047
- **阶段**: 议案庭审
- **结论**: 七段锚点与全部码表计数逐字复现（7 / 4 / 15 / 5），`fail-closed` 兜底行号精确到 `:434`，无实质缺陷。
- **依据**: E-0047
- **不确定性**: 两处极轻微描述偏差（见真实性），不影响承重。证据自陈限制属实：未逐一验证 19 个码在 sidecar 侧存在（`code-owner-runtime` E-0037 报 42 个码）；未跑该模块测试。
- **请求/下一步**: 可直接承重。**附带发现**：本条 `RUNTIME_UNAVAILABLE_CODES` 含 `"context_v2_unreachable"`（`:392`），**该行直接证伪 E-0053 的负向断言**，见 E-0053 项。
- **评估结论**: 已验证
- **证据编号**: E-0047
- **来源类型**: general
- **真实性**: `:93-109` 注释 + `Object.freeze` 块，固定文案 **7 条**（UNAVAILABLE/NOT_READY/IN_PROGRESS/FAILED/CONFLICT/CONFLICT_MANUAL/PERSIST）✓ · `:389-394` `RUNTIME_UNAVAILABLE_CODES` **4 码** ✓ · `:396-412` `NOT_READY_CODES` **15 码** ✓ · `:420-435` 函数体、`:434 return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;` 行号精确 ✓ · `:437-444` 不合并理由注释 ✓ · `:445-451` `V1_MIRROR_UNAVAILABLE_CODES` **5 码** ✓ · `:456-459` `contextV2V1MirrorMessage` ✓。`关键原文` 三段引文逐字一致。两处轻微偏差：(a)「5 出口 + 兜底」—— 函数实有 **5 个 return**，其中第 5 个即兜底，字面读作 5+1=6 会多计一个；(b) 引文标注 `:440-444`，而所引句首 "They" 实起于 `:439`。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 支持其所称命题（两张映射表在代码中确实分立、兜底为 fail-closed）。注释部分已由提交方自行按传闻类隔离，隔离得当。
- **来源归类**: 内部来源

---

#### S-0078 | ASSESSMENT | evidence-examiner → E-0048
- **阶段**: 议案庭审
- **结论**: 两条登记命令 **逐字复现**，`context_v2_store_disabled` 在 `src/` 出现 **0 次**，服务端两处命中行号精确。核心负向命题成立。
- **依据**: E-0048
- **不确定性**: **`支持/反驳` 中的「覆盖率 = 0/5」在本条内无任何命令支撑，且分母未定义。** 若分母取 E-0053 所列五码集，则该比率为假 —— `context_v2_unreachable` 已被 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:392` 消费并映射为用户可见的 UNAVAILABLE 文案，覆盖率至少为 1/5。**该比率不得作为计数引用。** 证据自陈的三项限制（负向证明只覆盖字面标识符、可达性为推断不得作事实引用、未核 electron 侧改写）均属实。
- **请求/下一步**: 引用时只引「`context_v2_store_disabled` 在 `src/` 零命中，且在服务端存在于 `memory_v2_runtime.py:726` 与 `route_memory_v2.py:239`」；删去或重算「0/5」。
- **评估结论**: 已验证（**「0/5」一句除外，见不确定性**）
- **证据编号**: E-0048
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "context_v2_store_disabled\|store_disabled" src --include="*.js"` → **零输出（exit 1）** ✓ 与登记一致。重跑第二条 → 恰好两行：`unchain_runtime/server/memory_v2_runtime.py:726` 与 `route_memory_v2.py:239` ✓ 行号逐字一致。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核；负向命题按其自陈只覆盖字面标识符，此限制真实且已披露。
- **相关性**: 支持其所称命题（renderer 侧完全不认识该码）。但 `支持/反驳` 里的 0/5 推广超出本条命令所能证明的范围，且与同案 E-0047 抵触。
- **来源归类**: 内部来源

---

#### S-0079 | ASSESSMENT | evidence-examiner → E-0050
- **阶段**: 议案庭审
- **结论**: 全部锚点、全部唯一性断言（唯一 Provider、唯一 `<ChatMessages>` 挂载点、`ownerChatId` 全文件仅三处）逐字复现，无缺陷。
- **依据**: E-0050
- **不确定性**: 证据自陈四项限制属实且未被本次复核推翻：未运行应用；grep 只覆盖字面标识符；`activeChatId`(state) 与 `activeChatIdRef.current`(ref) 的同 tick 同步性未构造并发验证；ui-testing 两个 runner 未实跑。第四项我确认了其前半：两个 runner 确实 import 并挂载真实 `TraceChain`（`trace_chain_runner.js:13,222` · `interject_runner.js:4`）。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0050
- **来源类型**: general
- **真实性**: `streaming_message_store_context.js:18-25` 默认值含 `chatId: ""` ✓ · `chat_messages.js:60`（`chat_id: chatId`）· `:73-81`（`useMemo` 三字段）· `:212`（`<StreamingMessageStoreContext.Provider`，重跑确认 **全 `src/` 唯一 Provider**）· `:243`/`:275` ✓ · `chat.js:1129-1130`：严格重跑 `grep -rn "<ChatMessages" src --include="*.js" | grep -v "\.test\.js"` → **单条命中**，「全仓唯一挂载点」成立 ✓ · `use_chat_session_state.js:202/228/237/345-353/383-384/412/464-465` 全部逐字命中，`characterId` 确为独立字段 ✓ · `trace_chain.js:647` ✓；`grep -n "ownerChatId" trace_chain.js` → **恰好 1932/1954/1984 三行**，「全文件仅此三处」成立 ✓ · `use_chat_stream.js:11874/11985` ✓。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: 直接支持其所称命题（`ownerChatId` 只在覆盖活跃会话的单一 provider 内可得），并正确地把 `FRAMING` 甲的事实部分与推论部分分开。
- **来源归类**: 内部来源

---

#### S-0080 | ASSESSMENT | evidence-examiner → E-0052
- **阶段**: 议案庭审
- **结论**: 两条 grep 与四条命中逐字复现，「全 `src/` 唯一消费者」这一穷举断言 **实测成立**。
- **依据**: E-0052
- **不确定性**: 证据自陈两项限制属实：只覆盖字面标识符与两个字面片段；「character chat 的 `id` 一定是 `chat-…` 形态」确为强旁证而非证明，该确认归 `code-owner-shared-arteries` 与 `code-owner-chat-core`。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0052
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "buildCharacterMemorySessionId" src --include="*.js"` → **恰好 4 条**（含测试亦为 4，即无测试命中）：定义 `chat_storage_sanitize.js:301` · 再导出 `chat_storage.js:38` · `side_menu_context_menu_items.js:2`（import）与 `:198`（调用）✓ 与登记完全一致。重跑 `grep -rn 'character_\${\|__dm__' src` → **单条**，`chat_storage_sanitize.js:302` ✓。**`src/COMPONENTs/chat-bubble/**` 与 `src/COMPONENTs/chat-messages/**` 确为零命中** ✓。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: 支持其所称命题（E-0016 的多态 session id 在 chat-bubble 链上不可达），并正确地把 E-0016 的作用域收窄为 side-menu→Inspector 单条路径而非反驳 E-0016 本身。相关性精确。
- **来源归类**: 内部来源

---

#### S-0081 | ASSESSMENT | evidence-examiner → E-0053
- **阶段**: 议案庭审
- **结论**: **登记的第一条 grep 输出「全 `src/`（含测试）零命中」经同 revision 复跑直接证伪 —— 实为 4 条命中，其中 1 条在产品代码。** 其余四条 grep 与全部锚点逐字复现。
- **依据**: E-0053
- **不确定性**: 该证伪 **不推翻** 本条在 chat-bubble 边界内的结论：`src/COMPONENTs/chat-bubble/**` 内五码确实零命中，故「我端不能区分未启用与空数据」成立。但登记形态是 **全 `src/` 的封闭集断言**，下游若据此认为「整个 renderer 都不认识这五个码」会被误导。
- **请求/下一步**: 引用前必须把第一条 grep 的结论改写为 **「五码中四码在 `src/` 零命中；`context_v2_unreachable` 在 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:392` 被 chat-core 消费并映射为用户可见 UNAVAILABLE 文案，另有 3 处测试命中」**。同时提请注意：本条与同案 **E-0047 内部抵触** —— E-0047 的 `关键原文` 恰好引用了含该码的 `RUNTIME_UNAVAILABLE_CODES` 表。
- **评估结论**: 未验证
- **证据编号**: E-0053
- **来源类型**: general
- **真实性**: **grep1 证伪**：重跑登记原命令，输出 4 行 —— `context_v2_turn_mutation.test.js:173`、`:494`、`use_chat_stream.turn_mutation_v2.test.js:867`、**`context_v2_turn_mutation.js:392`（产品代码）**，登记为「零命中」，为假。其余复现无误：grep2 → 恰好 4 行 `isAvailable`（`journal_reload.js:516`、`pending_reviews.js:299`/`:736`、`trace_audit.js:79`），`getStatus` 与 `unchainAPI` 均零命中 ✓；grep3、grep4 输出正常。锚点逐一命中：`journal_reload.js:274`（`|| "context_v2_journal_unavailable"`）· `:294`/`:521`（`errorCode: "context_v2_unavailable"`）· `:391`（`errorCode: "context_v2_invalid_cursor"`）· `:574-578`（渲染出口）· `pending_reviews.js:179-186`（`errorPresentation`，`:183` `code || "context_v2_request_failed"`）· `:397-407`（`.catch` 确 **无码解析**）· `:1015-1050`（多支渲染）· `trace_audit.js:120-129`（`catch` 确 **无码解析**）—— 全部逐字相符。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核 —— 正因可机械复核，登记转录与实际输出的背离才能被当场查出。
- **相关性**: 就 chat-bubble 边界而言相关且成立；就其登记的全 `src/` 范围而言，负向断言不成立。证据自陈的「渲染结论为推断、不得作为事实引用」的自我限制得当且应被保留。
- **来源归类**: 内部来源

---

#### S-0082 | ASSESSMENT | evidence-examiner → E-0054
- **阶段**: 议案庭审
- **结论**: 四行对照表与 `memory_v2_store.py:3604` **逐字复现**；但「`context_v2_unavailable` 于 `unchain_runtime/server` 下 **11 个非测试点**」为假 —— 该命令自身的过滤器失效，真实非测试点为 **10**。
- **依据**: E-0054
- **不确定性**: 缺陷为 **标签失实而非转录失实**：命令确实打印 `11`，但其 `grep -v "/tests/"` 无法过滤 `tests/test_memory_v2_runtime.py:24`（命令先 `cd` 进 `unchain_runtime/server` 再以 `.` 为根，相对路径无前导 `/`），故一个测试点混入了「非测试点」计数。本条的对冲主张（「≥9，且含读路径上的那一个」）不受影响，10 ≥ 9 成立。**该缺陷同时部分解释了提交方自陈「未追」的 11 vs E-0037 之 9 的差异。**
- **请求/下一步**: 引用时把 11 改为 **10**，并列明：`memory_v2_store.py:1527` · `memory_v2_runtime.py:702` · `route_memory_v2.py` ×8（259/333/388/504/591/719/804/856）。四行对照表可原样承重。
- **评估结论**: 未验证
- **证据编号**: E-0054
- **来源类型**: general
- **真实性**: 四行 for 循环输出 **逐字复现**（`request_failed` server:0/renderer:1 · `journal_unavailable` server:0/renderer:1 · `invalid_cursor` server:1/renderer:1 · `store_disabled` server:2/renderer:0）✓；`memory_v2_store.py:3604 "context_v2_invalid_cursor",` 行号精确 ✓。渲染层五个自造点锚点全部命中：`journal_reload.js:274/294/391/521` · `pending_reviews.js:183` · facade `context_v2_bridge.js:69-75`（`error.code = "context_v2_unavailable"`）✓。**计数失实**：登记 11，去掉泄漏的测试点后为 10。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。跨入 `code-owner-runtime` 边界的部分已被提交方明确标为「只读引用、权威解释归其」，自我限制得当。
- **相关性**: 支持其所称命题（渲染层两个服务端零出处的自造码 + `context_v2_invalid_cursor` 的第二处字面碰撞）—— 这三点均不依赖那个失实的 11，故实质相关性完好。
- **来源归类**: 内部来源

---

#### S-0083 | ASSESSMENT | evidence-examiner → E-0055
- **阶段**: 议案庭审
- **结论**: 两条登记 grep 各自零输出属实，`normalizeUnchainStatus` 六字段重建逐字复现；**但「`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` 的 import 零命中」这一负向断言为假** —— 存在一处三层深度的 import，正落在提交方自己预告的搜索盲区里。
- **依据**: E-0055
- **不确定性**: 该反例 **不翻转** 本条的承重结论：反例调用的是 `api.unchain.listToolModalCatalog()`（`artifact_kind_registry.js:208`），而 `api.unchain.getStatus`（`api.unchain.js:870`）无论是否可达，其返回都经 `normalizeUnchainStatus` 重建为六字段、`memoryV2` 被丢弃。故「chat-bubble 拿不到 `memoryV2`」仍成立；**不成立的是「经任何合法路径不可达」这一更强的形式**。
- **请求/下一步**: 引用时把结论改写为「facade 侧 `normalizeUnchainStatus` 结构性丢弃 `memoryV2`，故即便 chat-bubble 经 facade 取状态也拿不到该构件」，删去「零 import / 不可达」的表述。
- **评估结论**: 未验证
- **证据编号**: E-0055
- **来源类型**: general
- **真实性**: `api.shared.js:330-343` `normalizeUnchainStatus` 逐字复现，确只重建 `{status, ready, url, reason, pid, port}` 六字段，无 `memoryV2` ✓。两条登记 grep 重跑均零输出 ✓（`from "../../SERVICEs/api` 与 `unchainAPI`）。**但放宽为 `grep -rn "SERVICEs/api" src/COMPONENTs/chat-bubble` 后命中一条**：`src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js:2: import api from "../../../SERVICEs/api";`，并于 `:208` 调用 `api.unchain.listToolModalCatalog()`。证据 `完整性限制 (1)` 恰好预告了「未覆盖其它相对深度」—— 该盲区被实际命中。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。其对 `electron/**` 与 `service.js` 的完全依赖已明确声明「本条不为该部分承重」，自我限制得当。
- **相关性**: 其所称支持的命题分两半：facade 丢弃 `memoryV2`（**成立且承重**）与 chat-bubble 不可达 facade（**不成立**）。承重时须只取前半。
- **来源归类**: 内部来源

---

#### S-0084 | ASSESSMENT | evidence-examiner → E-0056
- **阶段**: 议案庭审
- **结论**: 三重门与多数封顶常量逐字复现，**但 `:480` 登记为 `mergeRefs .slice(0,512)`，实际该行为 `.slice(0, 128)`** —— 真实行号配错常量。另：跨界自我限制在锚点层被遵守，**在其派生因果主张中被越过**。
- **依据**: E-0056
- **不确定性**: `.slice(0, 512)` 确实存在于同一文件的 `:254` 与 `:421`，故不是常量凭空捏造，而是行号与常量错配；下游若按「mergeRefs 封顶 512」使用会低估该路径的收紧程度（实为 128）。
- **请求/下一步**: 引用时更正为 `:480 → .slice(0, 128)`；若要引 512，改指 `:254`（`refs` 投影）或 `:421`。并请把「折叠即卸载」降格为待核推断（见相关性）。
- **评估结论**: 未验证
- **证据编号**: E-0056
- **来源类型**: general
- **真实性**: 逐字命中：`chat_bubble.js:107-110`（`hasMemoryV2Audit` + `shouldRenderTraceChain` 三选一）✓ · `trace_chain.js:1928-1936`（`mergeMemoryV2AuditWithJournal(presentMemoryV2Audit(bundle?.memory_v2, …), …)` → `if (memoryV2Audit)`）✓ · `:1950 unmountDetailsWhenClosed: true,` ✓ · `timeline.js:133`（`unmountDetailsWhenClosed = false,`）与 `:367`（`unmountWhenClosed={unmountDetailsWhenClosed}`）✓ · `journal_reload.js:6-8`（500 / 20 / 10000）✓ · `:353-372` 限额分支 ✓ · `:257 .slice(-128)` 确在 `agentRuns:` 内（:255-258）✓ · `pending_reviews.js:6 MAX_PENDING_ITEMS = 25` ✓。**`:480` 失实**：实际为 `return Array.from(merged.values()).slice(0, 128);`。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: **跨界自我限制的执行情况（受命专核）**：`来源定位` 与 `完整性限制 (4)` 都把 `timeline.js:133,367` 限定为「只读引用其存在」。**锚点层遵守了** —— 正文只引用 flag 的声明与转发，未对 timeline 内部行为作任何断言。**但 `支持/反驳` 越界**：「独立确认『V2 读平面今天零轮询』并给出**成因**（折叠即卸载，不是纪律）」是一条关于 `code-owner-ui-primitives` 实现行为的因果主张，而 `:367` 只显示该 flag 被 **再向下转发** 给另一组件，本条未登记任何证明「确实发生卸载」的证据，也未运行应用观察（其 `完整性限制 (1)` 自认）。故该自我限制 **未被其正文完全遵守**，「折叠即卸载」应作为待核推断处理，不得承重。
- **来源归类**: 内部来源

---

## 小结表

| 证据 | 提交方 | 评估结论 | 关键理由 |
|---|---|---|---|
| E-0043 | chat-core | **未验证** | 锚点全对；穷举计数 8 → 实为 **9**，漏 `chat_storage_migrate.js:174`（未披露） |
| E-0044 | chat-core | 已验证 | 锚点全对；22 处命中数目与内容全一致 |
| E-0045 | chat-core | 已验证（**限单层**） | 单层事实成立（explorer 前提由我独立解除）；**证据基础只覆盖 side-menu 回调层，不支撑「整条链路不可检测」**，C-A10 不可只靠本条 |
| E-0046 | chat-core | 已验证 | 18 方法同名同序、3 文件、全有或全无语义全部复现 |
| E-0047 | chat-core | 已验证 | 7/4/15/5 码表与 `:434` 兜底行号全部精确 |
| E-0048 | chat-core | 已验证（**「0/5」除外**） | 两条命令逐字复现；`0/5` 无命令支撑且分母未定义，取五码集则为假 |
| E-0050 | chat-bubble | 已验证 | 唯一 Provider / 唯一 `<ChatMessages>` / `ownerChatId` 仅三处，三项唯一性断言全部实测成立 |
| E-0052 | chat-bubble | 已验证 | 4 条命中、「全 `src/` 唯一消费者」实测成立 |
| E-0053 | chat-bubble | **未验证** | **登记输出「全 `src/` 零命中」经复跑证伪**：4 条命中，含产品代码 `context_v2_turn_mutation.js:392`；与同案 E-0047 内部抵触 |
| E-0054 | chat-bubble | **未验证** | 对照表逐字复现；「11 个非测试点」为假，其 `grep -v "/tests/"` 漏过一个测试文件，真实为 **10** |
| E-0055 | chat-bubble | **未验证** | facade 丢弃 `memoryV2` 成立；**「chat-bubble 对 `SERVICEs/api.*` import 零命中」为假**（`artifact_kind_registry.js:2`，三层深度，正中自陈盲区） |
| E-0056 | chat-bubble | **未验证** | 多数锚点精确；`:480` 登记 `.slice(0,512)` 实为 `.slice(0,128)`；跨界自我限制在派生因果主张「折叠即卸载」处被越过 |

**统计**：已验证 **7**（其中 E-0045 限单层、E-0048 有一句除外）· 未验证 **5** · 相矛盾 0。

**跨条模式**：5 条缺陷中 **4 条**（E-0043 · E-0053 · E-0054 · E-0055）落在**负向或穷举性断言**上，与批次 A 所报模式同型 —— 登记的命令转录呈现为封闭集，实际为经筛选或经失效过滤器的子集。**四条的结论方向均未翻转**，但四条的登记形态都恰是下游最易当作封闭集引用的形态。E-0056 的缺陷类型不同（行号—常量错配 + 跨界因果外推），单独处理。

**受命专核的两项特殊事项**：
1. **E-0045 / C-A10** —— 其证据基础止于 side-menu 回调一层，只证明错主值可**无声产生**，对 explorer 之后的任何一层（右键菜单取值、bridge、main 校验、sidecar）**零证据**，尤其对「可检测性」本身零证据。「整条链路结构性不可检测」不能由本条承重。
2. **E-0056 跨界只读自我限制** —— 锚点层遵守，`支持/反驳` 的「折叠即卸载」越界；`timeline.js:367` 仅显示 flag 再转发，本条未证明卸载实际发生。

# 承重证据复核 · 批次 E（10 条）

`evidence-examiner` instance · 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md) · 本批 **全部为自证类，本关不豁免**

---

## 全批时效前提（两仓，复核当日实测）

复核开始时实跑，覆盖本批全部 10 条的时效前提：

```bash
git -C /Users/red/Desktop/GITRepo/PuPu     rev-parse --short HEAD   # -> b2385d5d   (branch dev)
git -C /Users/red/Desktop/GITRepo/PuPu     status --porcelain | wc -l   # -> 53
git -C /Users/red/Desktop/GITRepo/unchain  rev-parse --short HEAD   # -> a4e69f4    (branch dev)
git -C /Users/red/Desktop/GITRepo/unchain  status --porcelain | wc -l   # -> 0
```

**PuPu 的 53 条 dirty 全部落在 `.claude/` 之下**（agent-memory 39 · court 11 · codex 2 · agents 1），按目录归类实测：

```bash
git -C .../PuPu status --porcelain | grep -v '\.claude/'   # -> 空
git -C .../PuPu status --porcelain src electron unchain_runtime | wc -l   # -> 0
```

**结论**：本批引用的 **全部产品源锚点**（`src/**`、`electron/**`、`unchain_runtime/**`、unchain `src/**`）均处于 **未修改的 commit 状态**。两仓 revision 与提交时登记的 `b2385d5d` / `a4e69f4` **逐字相同**。**本批不存在因工作树漂移导致的时效失效**，时效判断可全部归结为「行号是否仍指向所述内容」。

### 本关采用的失效判据（明示，供 `speaker-of-the-house` 覆盖）

传唤指示「行号漂移即未验证」。本关按 **「跟着这个锚点走，读者读到的是不是所主张的内容」** 落地：

- 引用区间的 **端点多算或少算一两行，但区间内仍完整包含所述机制** → 登记为漂移瑕疵，**不判失效**（本批 3 处：E-0065 · E-0066 · E-0069）
- 引用行 **指向另一段代码**，读者读到的不是所主张的东西 → 构成实质引证缺陷（本批 1 处：E-0060）

该判据与本案既有先例一致（S-0026 / S-0028 / S-0029 均在「登记文字有瑕疵、承重内容复现」时报 **已验证** 并附收窄）。**若本庭采严格读法，E-0060 · E-0065 · E-0066 · E-0069 四条应改判未验证** —— 每处漂移的精确行号我已在各条内写明，本庭可直接据以改判，无需再传唤。

### 传唤点名的缺陷模式：本批实跑结论

传唤要求重点核「登记的命令转录 ≠ 该命令实际输出」，尤其在负向与穷举断言上。**本批的负向/穷举断言全部实跑，全部成立**，且我用比登记更严的条件复跑仍成立（详见 E-0071 · E-0066 · E-0070）。**转录不逐字的问题在本批出现 2 次**（E-0058 · E-0063），**两次都不在负向或穷举断言上，两次都不改变任何数值或结论方向**，其中 E-0063 已自行标注省略。**本批未复现批次 A 的那个缺陷形态。**

---

#### S-0085 | ASSESSMENT | evidence-examiner → E-0058

- **阶段**: 议案庭审
- **结论**: 三条命令全部重跑，unchain revision、工作树计数、lock 内容 **逐值复现**，lock 与 `dev` HEAD 今日 **仍然相等**；登记的 `cat` 转录为紧凑单行 JSON 而实际文件为 5 行 pretty-print，属排版性不逐字，无键无值被改动。
- **依据**: E-0058
- **不确定性**: 「lock 只钉 revision，不钉 schema 版本」一句 **不完全精确** —— lock 实含第三个键 `context_memory_contract: 1`，是一个契约整数。精确表述应为：lock 钉 **revision 与一个契约整数**，**既不钉 `MemoryEntry.SCHEMA` 字符串（`unchain.memory_entry.v1`），也不钉任何 kind 词汇表** —— 后半句（本条真正承重的部分）我已独立证实。「巧合延续、非机制」为提交方自陈，我未能取得可证伪的机制缺席证据，仅确认 lock 文件自身不含任何强制相等的装置。shipped 安装包内的 unchain revision 提交方已自陈未核实，本关同样无法取证。
- **请求/下一步**: 引用本条时按上条把「不钉 schema 版本」替换为「不钉 `SCHEMA` 字符串与 kind 词汇表」。转录排版差异建议登记但不必重排。
- **评估结论**: 已验证
- **证据编号**: E-0058
- **来源类型**: general
- **真实性**: 三条命令逐条重跑。`rev-parse HEAD` → `a4e69f413c449c5768433ba4dddc5b60b8146991`，与登记 **逐字符相同**；`status --porcelain | wc -l` → `0`，相同；`unchain-core.lock.json` 的三个键与三个值与登记 **完全相同**。另查该 lock 文件在 PuPu 侧 `git status --porcelain` 输出 0 行，即文件本身未被修改。**一处不逐字**：登记的「实际输出」把文件写成单行紧凑 JSON，实际 `cat` 输出为 5 行缩进 JSON —— 纯排版，键序与值全同。
- **可靠性**: 两仓 git 元数据与仓内文件字面内容，任何人可在同一 revision 复跑得到同一结果，不依赖提交方叙述。
- **相关性**: 支持其所称的 revision 固定与 lock 一致性主张。其「lock 一致不构成契约承诺」的推论由 lock 的实际键集直接支撑（无 SCHEMA、无 kind），成立。
- **来源归类**: 内部来源

---

#### S-0086 | ASSESSMENT | evidence-examiner → E-0060

- **阶段**: 议案庭审
- **结论**: 六个锚点中 **五个逐行精确**，两侧字段集差异与 `content_bytes` 在 unchain 路径永不出现均 **独立证实**；**一处引证指错分支** —— `:565-566` 被用来支撑「`image` 与 `markdown` 同走 `content_ref` 分支」，但该两行是 **`link` 分支**，正确锚点为 `:563-564`。
- **依据**: E-0060
- **不确定性**: 该引证缺陷落在提交方 **自行标注为「推断、未构造实例」** 的 `image` 部分，不在承重的字段集比对上。legacy 半边仍为静态阅读（提交方自陈），本关亦未实跑 `pupu_legacy` 分支，故「两侧差异」中 legacy 半边的运行时值仍未观察。
- **请求/下一步**: 引用本条时把 `image` 分支锚点更正为 `memory_v2_unchain_read_adapter.py:563-564`。若本庭采严格漂移读法，本条应改判 **未验证** 并退回重排该一处。
- **评估结论**: 已验证（附一处必须随证据一同更正的引证）
- **证据编号**: E-0060
- **来源类型**: general
- **真实性**: 逐点复核 —— unchain `models.py:251-255` = `class MemoryEntryKind(StrEnum)` 的 FOLDER/MARKDOWN/IMAGE/LINK **四值，精确**；`:310` = `SCHEMA: ClassVar[str] = "unchain.memory_entry.v1"` **精确**；PuPu `memory_v2_unchain_read_adapter.py:532-567` = `_route_entry` 全体（532 为 `def`，567 为 `return response`）**精确**；`memory_v2_store.py:6641-6669` = legacy `_entry_response` 全体 **精确**；`:6680,6688,6696` = `if kind == "folder"` / `"file"` / `"link"` **三个行号逐一命中，精确**。**唯 `:565-566` 实为 `elif entry.kind.value == "link":` 与其赋值行**，`markdown`/`image` 的 `content_ref` 分支在 `:563-564`。
- **可靠性**: 两仓仓内文件字面内容与行号，同 revision 可直接复核；字段集另经本案 E-0061/E-0062 的实跑交叉确认（提交方已声明），不孤证。
- **相关性**: 支持其所称的「两侧字段集与 kind 词汇表不同」。新增的 `content_bytes` 主张我独立证实：`_route_entry` 全函数无 `content_bytes` 赋值，该键仅在 legacy `_entry_response` 的 `file` 分支且 `byte_size` 非空时出现，故「unchain 路径上永不出现」成立，其「显示条目大小在产品配置下无数据」的推论由此直接得出。
- **来源归类**: 内部来源

---

#### S-0087 | ASSESSMENT | evidence-examiner → E-0063

- **阶段**: 议案庭审
- **结论**: 两段探针 **逐字符重跑成功**，八个锚点 **全部逐行精确**；其自陈未做的「穷举 unchain 异常类」一项，我以更强的结构判据 **直接闭合**（unchain 全仓对 `MemoryV2Error` 引用数 0，对 PuPu 模块 import 数 0，故结构上不存在继承）。
- **不确定性**: 登记的字符集探针「实际输出」只列 1 行加一句 `(Curator-Failed / runner:aborted 同)`，实际输出 5 行。省略 **已被标注**，且被标注的两行确与首行同。但 **未被提及的第 4 行 `curation_repository_error unchain_ok=True narrow_ok=True`** 是唯一一个 **同时通过窄字符集** 的样本 —— 它 **轻微反方向**，不改变结论（结论建立在 `_IDENTIFIER_RE` 本身更宽这一结构事实上，非样本统计），但本庭引用时应知其存在。提交方自陈的「未实测真实 curator 失败码端到端送达 renderer」本关同样未做。
- **依据**: E-0063
- **请求/下一步**: 引用「unchain 对 `error.code` 贡献为零」时可直接使用本关的结构判据（引用数 0 / import 数 0），比原自陈更强，不必再留「未穷举」的口子。
- **评估结论**: 已验证（自陈的完整性限制 (1) 经本关闭合，可去除）
- **来源类型**: general
- **证据编号**: E-0063
- **真实性**: 探针一（MRO）重跑输出 `MRO: ['PupuUnchainMemoryV2ReadError','RuntimeError','Exception','BaseException','object']` 与 `subclass of MemoryV2Error? False`，与登记 **逐字符相同**。探针二（字符集）5 行全部重现，被登记的那 1 行 **逐字符相同**。锚点：`journal/models.py:13` = `_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")` —— **正则逐字符与登记相同**；`:234` = `if identifier and _IDENTIFIER_RE.fullmatch(normalized) is None:` **精确**；`curator/models.py:1167` = `self.code = _required_text(code, "runner failure code", maximum=128, identifier=True)` **精确**；`curator/ports.py:23-32` = `CurationRepositoryError.__init__` 的 `re.sub(r"[^a-z0-9_:-]+", "_", …)` 与默认码 `"curation_repository_error"` **精确**；PuPu 侧 `route_memory_v2.py:98-104` = 裸 `except Exception` → `context_v2_failed` 500 **精确**；`memory_v2_unchain_read_adapter.py:65` = `class PupuUnchainMemoryV2ReadError(RuntimeError):` **精确**；`memory_v2_unchain_curator_query.py:129` = `"error_code": candidate.error_code,` **精确**；`:179` = `"last_error_code": job.last_error_code,` **精确**。
- **可靠性**: 仓内文件字面内容 + 对纯函数与类型系统的确定性探针（无 I/O、无外部状态、连跑同值）。提交方主动提出「若本庭认为探针属运行时观察，可改判须查类」—— 本关认为其确定性足以维持自证类。
- **相关性**: 支持其所称的「`error.code` 的窄字符集是 try/except 收敛的架构副产物，而非约定」。其指出的风险面（`error_code` / `last_error_code` payload 字段承载更宽字符集）由 `:129` / `:179` 两处字段直接支撑，成立。
- **来源归类**: 内部来源

---

#### S-0088 | ASSESSMENT | evidence-examiner → E-0065

- **阶段**: 议案庭审
- **结论**: 九个锚点内容 **全部证实**，其最承重的结构主张 —— **`get_tree` 的调用落在 `PupuUnchainMemoryV2ReadError` 的 catch 作用域之外，因而超限失败以 500 无语义码出场** —— 经本关逐行确认 **成立**；一处区间端点各早一行（`:1202-1205`，实为 `:1203-1206`），区间内仍完整含该 raise。
- **依据**: E-0065
- **不确定性**: 提交方自陈「纯静态、未构造 >10,000 条目 store、未测耗时」本关同样成立，`O(n²/页大小)` 仍是结构复杂度推断而非测量，**不得作为性能事实引用**。真实 store 规模受 G2 阻断，本关无法取证。另：本条同时引用 PuPu 侧 `_MAX_LIFECYCLES=10_000` 与 unchain 侧 `_MAX_LIST_SCAN=10_000` 两道界，**两道界的相对触发次序本条未论述**，我在 E-0069 项下补记。
- **请求/下一步**: 引用 unchain 侧超扫描界时把行号更正为 `sqlite_read_v2.py:1203-1206`。
- **评估结论**: 已验证（一处区间端点漂移一行，内容未变）
- **证据编号**: E-0065
- **来源类型**: general
- **真实性**: PuPu 侧 —— `memory_v2_unchain_read_adapter.py:48` = `_MAX_LIFECYCLES = 10_000` **精确**；`:365` = `while len(entries) < _MAX_LIFECYCLES:` **精确**；`:387-389` = `raise PupuUnchainMemoryV2ReadError("workspace listing exceeds the P0 route limit")` **精确**；`:65` 异常继承 `RuntimeError` **精确**；`route_memory_v2.py:98-104` 裸 `except Exception` → 500 **精确**；`:355-361` = `except PupuUnchainMemoryV2ReadError` 块，且其 `try:` 起于 `:350` **只包住 `open_pupu_unchain_memory_v2_reader(...)`（:351-354）** —— **提交方所称的 catch 作用域逐行属实**；`:1114-1119` 处 `context_v2_tree` 把 `.get_tree(...)` 链在 `_read_runtime_for_store_owner(...)` 的返回值上（`:1116`），**确在该 try 之外**。unchain 侧 —— `sqlite_read_v2.py:53-55` = `_MAX_LIST_RESULTS=200` / `_MAX_LIST_SCAN=10_000` / `_SCAN_PAGE_SIZE=200` **三行逐一精确**；`_workspace_page` 的「全量扫描 → `entries.sort(...)` → 切片」结构 **属实**。**唯一偏差**：超扫描界的 raise 登记为 `:1202-1205`，实为 `if page.has_more:` @1203 + raise @1204-1206；`:1202` 是循环内的 `repository_cursor = page.next_cursor`。
- **可靠性**: 两仓仓内文件字面内容与行号；异常层级部分复用 E-0063 的实测 MRO（本关已独立重跑，见上条）。
- **相关性**: 支持其所称的「tree view 是唯一一次拉完整个 store 的消费者，且其失败模式为 500 无语义码」。该结论的两个前提（无分页的全量拉取 · catch 作用域不覆盖）均经本关直接观察，推论成立。标注为推断的复杂度部分不承重，与提交方自陈一致。
- **来源归类**: 内部来源

---

#### S-0089 | ASSESSMENT | evidence-examiner → E-0066

- **阶段**: 议案庭审
- **结论**: 全部锚点内容证实，登记的 grep **逐条重跑且四行命中分区完全如登记所述**；其穷举断言（`api.unchain.getStatus()` 在 `src/` 只有一个产品消费者）经本关 **用比登记更严的探针** 复核仍成立。**三方（E-0025 · E-0055 · E-0066）在实体事实上无分歧**，唯一差异是一处引用区间端点。
- **依据**: E-0066, E-0025, E-0055
- **不确定性**: 提交方自陈「未对 `src/COMPONENTs/**` 全域复核是否存在经 `window.unchainAPI.getStatus()` 直连的第三方消费者」—— 本关已代为核实并 **闭合**（见真实性），该限制可去除。三方均为静态阅读，**无一方运行过应用观察 `getStatus()` 的实际返回值**，此为三方共同的、至今未闭合的缺口。
- **请求/下一步**: 引用 `getStatus` 函数体时建议采用 E-0025 的 `api.unchain.js:870-887`（实测精确），而非 E-0066 的 `:870-885`。
- **评估结论**: 已验证（第三次同向，与前两次无分歧）
- **证据编号**: E-0066
- **来源类型**: general
- **真实性**: `api.shared.js:330-343` = `normalizeUnchainStatus` 全体（330 为 `const normalizeUnchainStatus = (status) => ({`，343 为 `});`）**精确**；其为 **6 键对象字面量**（`status/ready/url/reason/pid/port`），**无 spread**，故「重建非投影」**属实**，`memoryV2` 与 `contract` 确不在其中。`:390` = `normalizeUnchainStatus,` 于导出块内 **精确**。`chat.js:578` = `const status = await api.unchain.getStatus();` **精确**。grep 重跑得 4 行：`chat.js:578`（`api.unchain`）+ `local_storage/index.js:43`（`api.ollama`）+ `configure_providers.js:173,207`（`ollamaBridge`）—— **与登记的「另三处分属 api.ollama 与 ollamaBridge」逐条吻合，无遗漏项**。**本关补跑的更严探针**：`grep -rn "getStatus" src --include=*.js`（去掉 `.getStatus(` 形态，可捕获解构/别名）与 `grep -rn "unchainAPI" src` 各自复核 —— **无任何解构或别名消费者**，`src/` 内除 `api.unchain.js` 自身的 `hasBridgeMethod` 能力探测外 **无直连 `window.unchainAPI.getStatus()` 的调用点**；其余 `getStatus` 命中分属 `api.ollama` / `ollama_bridge` / `context_v2_bridge` / `memory_vault_bridge`，均非本对象。**穷举断言成立。** 偏差一处：`api.unchain.js` 的 `getStatus` 块实为 `:870-887`（登记 `:870-885`），承重行 `return normalizeUnchainStatus(status);` @879 落在两个区间内。
- **可靠性**: 仓内文件字面内容 + 可复跑 grep；且为 **第三个独立来源**（前有 `code-owner-electron` E-0025 与 `code-owner-chat-bubble` E-0055）。
- **相关性**: 支持其所称的两点。**三方一致性核实结果**：三条对 `api.shared.js:330-343` 的定位 **完全一致**，对六个键的枚举 **逐字一致**，对「`memoryV2` 在此被丢弃」**一致**。E-0025 另主张 electron 侧 15 字段与四态闭集（不在 E-0066 射程内，E-0055 亦明示不为该部分承重）；E-0055 另主张 chat-bubble 边界内 import 零命中；E-0066 另主张全 `src/` 单一消费者。**三者是同一事实的三个不重叠外延，不存在相互矛盾之处。**
- **来源归类**: 内部来源

---

#### S-0090 | ASSESSMENT | evidence-examiner → E-0067

- **阶段**: 议案庭审
- **结论**: 十个锚点 **全部逐行精确**，五条结构属性 **逐条独立证实**；作为前案 E-0090 在 `b2385d5d` 上的重测，本关另比对了前案原文，**四条结构属性与两道守卫确实无一失效**，连 `boot_readiness.js` 的 206 行总长都与前案 `:1-206` 的登记一致。
- **依据**: E-0067, E-0090（案 `0000-0003-2026-0807`）
- **不确定性**: 提交方明确自陈 **未跑** `boot_locale_parity.test.js` 与 `boot_readiness_service.test.cjs`，故「两道守卫今天仍绿」**未被任何人验证**；本关亦未跑（只读约束）。本条只支持「守卫的代码仍在且形状未变」，**不支持「守卫今天通过」**，引用时不得跨越这条界。前案 E-0090「不主张 boot 运行无缺陷」的限制继续适用。
- **请求/下一步**: 若本庭需要「守卫仍绿」，须另行传唤有执行权的角色实跑两个测试 —— 这不是本条能补强的。
- **评估结论**: 已验证
- **证据编号**: E-0067
- **来源类型**: general
- **真实性**: `boot_readiness.js:1-22` = 文件头块注释全体（`/*` @1，`*/` @22）**精确**，其正文确逐字写明 renderer 侧单一订阅职责；`:62-74` 起于 `let listeners = new Set();` **精确**；`:180-186` = `export const subscribe` @180 至 `export const getState = () => ({ ...state });` @186 **精确**；`:205-206` = `const bootReadiness = { start, retry, subscribe, getState };` + `export default bootReadiness;` **精确**（文件恰 206 行）。`src/SERVICEs/bridges/boot_readiness_bridge.js` 存在（98 行），确为 `window.bootReadinessAPI` 的薄包装，**与判定模块分居两目录，属实**。`electron/main/services/boot_readiness/service.js:113` = `const FAILURE_CODES = Object.freeze([` **精确**（三个码）；`:339` = 导出块内 `FAILURE_CODES,` **精确**；全文件 `FAILURE_CODES` 仅此两处命中。`boot_locale_parity.test.js` 的 `require("../../electron/main/services/boot_readiness/service")` 落 `:45`（`const {` 起于 `:43`，`FAILURE_CODES,` 在 `:44`），登记的 `:44-45` **命中该 require 语句**；`:47` = `const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];` **精确**。`.cjs` 双胞胎 `boot_readiness_service.test.cjs` 与 `.js` 同时存在。
- **可靠性**: 仓内文件字面内容与行号；且为对前案已归档证据的当期重测，可与 E-0090 交叉比对。
- **相关性**: 支持其所称的五条结构属性，逐条对应到具体行，无一条依赖叙述。「是 E-0090 在当前 revision 上的重测且无一失效」经本关调阅前案原文比对后 **成立**。
- **来源归类**: 内部来源

---

#### S-0091 | ASSESSMENT | evidence-examiner → E-0068

- **阶段**: 议案庭审
- **结论**: 五个锚点 **全部逐行精确，无一漂移**；13 个共有字段、`deleted` 单侧追加、树装配两侧字面等价含静默孤儿升根、`parent_path` 两侧来源不同 —— **四项主张逐项独立比对证实**。本批引证质量最高的一条。
- **依据**: E-0068
- **不确定性**: 提交方自陈「纯静态比对，未在 `store_owner=unchain` 下实跑（G8）」**部分已由本案他条缓解** —— E-0062 已在产品配置下实跑该分支并取得 `"kind":"folder"` 的 tree 响应（S-0026 已验证），但 **本条登记的完整字段集本身仍无人在运行时逐字段核对过**，故「运行时字段确实如此」仍是推断。提交方另自陈未读 unchain 侧 `memory_tree` / `memory_list` 实现，本关亦未读。
- **请求/下一步**: 无。本条可按原文引用。
- **评估结论**: 已验证
- **证据编号**: E-0068
- **来源类型**: general
- **真实性**: `memory_v2_store.py:6641-6669` = legacy `_entry_response` 全体 **精确**；`:7396-7400` = `entries = []` 至 `entries.append(response)`，其中 `:7399` 逐字为 `response["deleted"] = row["deleted_at_ms"] is not None` **精确**；`:7408-7434` = legacy `get_tree` 全体（7408 `def`，7434 `return {**listing, "tree": roots}`）**精确**；`memory_v2_unchain_read_adapter.py:411-452` = adapter `list_entries` + `get_tree` 两函数（411 `def list_entries(`，452 `return {**listing, "tree": roots}`）**精确**；`:532-567` = `_route_entry` 全体 **精确**。**逐字段人工比对结果**：13 个共有字段 `entry_id · space_id · path · parent_path · name · kind · description · mime_type · revision · space_revision · source_event_id · ref · replayed` **两侧全部存在，一个不多一个不少**；`ref` 拼装两侧同为 `pupu://memory/{space_id}/{entry_id}@{revision}` **格式逐字相同**；`deleted` **仅 legacy 有，`_route_entry` 无**，属实；两侧树装配均为 `parent = nodes.get(item["parent_path"])` → `if parent is None: roots.append(node)` **逐字等价**，孤儿确被静默升根、无任何信号；`parent_path` legacy 取 `row["parent_path"]`（`:6647`，且 schema `:843` 确有该存储列），unchain 取 `entry.path.rsplit("/", 1)[0] or "/"`（`:534`）**两侧来源不同，属实**。
- **可靠性**: 两仓仓内文件字面内容与行号，同 revision 可逐字段复核。
- **相关性**: 支持其所称的三点（支持 E-0014 主结论 · 补正一处遗漏 · 新增两条结构事实），每一点均落到可指认的行，无越界。
- **来源归类**: 内部来源

---

#### S-0092 | ASSESSMENT | evidence-examiner → E-0069

- **阶段**: 议案庭审
- **结论**: 四个锚点内容证实，**上限的触发条件与失败模式经本关逐行追完整条链路，主张成立**：超限确以异常出场而非截断，且该异常 **确会以 500 无语义码到达调用方**。一处区间漂移一行（`:381-384`，实为 `:382-385`）。作为「新增已知缺口」的登记请求，本关认为 **事实基础充分**。
- **依据**: E-0069, E-0065
- **不确定性**: **该上限在任何条件下均未被观察过**（提交方自陈，本关同意且未补测：只读约束 + 无 >10,000 条目 store）。本关另发现 **本条未论及的一层**：unchain 侧 `sqlite_read_v2.py:53-55` 另有一道 `_MAX_LIST_SCAN = 10_000` 的 **每次调用扫描界**，超界抛 `SQLiteContextV2ReadError`（`:1203-1206`）。故实际生效的天花板是 **两道 10,000 界中先触发的那一道**，而 **两道都不是 `MemoryV2Error` 子类**（unchain 全仓对 `MemoryV2Error` 引用数 0，见 E-0063 项下实测），**两道因此落在同一个 500 出口上**。本条把上限单方面记在 PuPu adapter 名下 **不算错，但不完整**。`pupu_legacy` 侧是否有对应上限提交方自陈未核实，本关亦未核实。
- **请求/下一步**: 若本庭采纳本条为新增已知缺口，建议按上条把缺口表述为 **「活读路径存在两道 10,000 界，任一触发均以 500 `context_v2_failed` 出场」**，而非单指 adapter 一道。
- **评估结论**: 已验证（一处区间端点漂移一行；缺口表述建议按不确定性栏扩写）
- **证据编号**: E-0069
- **来源类型**: general
- **真实性**: `memory_v2_unchain_read_adapter.py:48` = `_MAX_LIFECYCLES = 10_000` **精确**；`:365` = `while len(entries) < _MAX_LIFECYCLES:` **精确**；`:387-389` = `raise PupuUnchainMemoryV2ReadError(` / `"workspace listing exceeds the P0 route limit"` / `)` **精确**，与登记的关键原文 **逐字相同**；`:598` = `limit=_MAX_LIFECYCLES,` 与 `:604` = `if len(lifecycles) >= _MAX_LIFECYCLES:` **两处精确**，同一常量的第二用途属实。**偏差一处**：「游标不前进即抛」的守卫登记为 `:381-384`，实为 `if page.next_cursor is None or page.next_cursor == cursor:` @382 + raise @383-385；`:381` 是 `return tuple(entries)`。**触发条件（本关追加核实）**：循环在 `:380-381` 于 `has_more` 为假时 **正常返回**，只有当 `len(entries) >= 10_000` **且** 上一页仍报 `has_more=True` 时才落到 `:387` 的 raise；页大小恒 200（`:369`/`:376`），故触发点为 **条目数严格超过 10,000**，恰好 10,000 且到底则正常返回。**失败模式（本关追加核实）**：`PupuUnchainMemoryV2ReadError` 继承 `RuntimeError`（`:65`）且 **实测非 `MemoryV2Error` 子类**；`route_memory_v2.py` 的 `except PupuUnchainMemoryV2ReadError`（`:355-361`）**只包住 `open_…reader`**，而 `context_v2_tree`（`:1116`）把 `.get_tree(...)` 链在其外 → 异常直抵 `_endpoint` 的裸 `except Exception`（`:98-104`）→ **HTTP 500 `{"error":{"code":"context_v2_failed",…}}`，无 `retryable` 字段**。该 500 形状与 E-0062 在完整 HTTP 路径上实测到的 500 行 **逐字节一致**，构成旁证。
- **可靠性**: 仓内文件字面内容与行号；失败模式部分由本关跨三个文件的控制流追踪独立确认，不依赖提交方叙述。
- **相关性**: 支持其所称的「上界由 sidecar 单方面决定，到界时用户拿到的是错误而非部分树」。该结论的两个环节（抛而非截断 · 异常不被语义化）均经本关直接观察，成立。与 `code-owner-electron` E-0032 的「不矛盾、两层」判断经本关核对亦成立 —— E-0032 说的是 IPC 方法签名层无 limit 参数，本条说的是 sidecar 实现层有硬界，两者不冲突。
- **来源归类**: 内部来源

---

#### S-0093 | ASSESSMENT | evidence-examiner → E-0070

- **阶段**: 议案庭审
- **结论**: 七个锚点 **全部逐行精确**，`:6724` 的写时父 folder 强制 **逐字引用无误**；**传唤特别要求核实的一点经本关逐句检查后确认** —— 该「未核实项」被明确标注为「不是一条主张，是一个问题」，且 **在本条正文任何位置均未以事实口吻复用**；本关另重跑了 folder 条目产生点的穷举搜索，**结论成立，但需补一条可达性事实**。
- **依据**: E-0070, E-0061
- **不确定性**: 本关的穷举重跑发现 unchain 全仓另有 **两处 `return MemoryEntryKind.FOLDER`**（`sqlite_curator_review_decision_v2.py:594` 与 `sqlite_memory_host_v2.py:706`），二者均为 `_workspace_kind` 静态分类助手（字符串 → 枚举），**不产生条目**；其中 `sqlite_memory_host_v2.py:947-948` 分类后 **回调 `self._workspace.create_folder(**common)`**。故「产生点只有一处」**成立**，但 **可达路径不止一条** —— 除直接调用外，**curator 晋升路径亦可产生 folder 条目**。本条未及此，引用时不应据其推出「folder 条目只能由用户显式创建」。另：本条 净内容 末句「这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因」是 **推论**（由 `:6724` 与 E-0068 所载升根逻辑合成），**以事实口吻书写、未标注为推断**，且其射程 **仅限 `pupu_legacy`**。
- **请求/下一步**: 引用时把上述两点随证据一同带上。传唤所述「该未核实项后由 E-0061 独立证成」与本关观察一致：我在 unchain `_write`（`service.py:661-790`）与持久层写路径（`sqlite_memory_v2.py:1120-1240`）中 **均未找到父存在性强制**（该区间的 raise 全部关于 space/entry revision、路径碰撞、folder 有活跃子孙的删除保护），**方向与 E-0061 一致**。
- **评估结论**: 已验证（未核实项标注合规；附一条可达性补充与一处推论标注缺失）
- **证据编号**: E-0070
- **来源类型**: general
- **真实性**: unchain `models.py:251-255` = `MemoryEntryKind` 四值 **精确**；`service.py:367` = `def create_folder(` **精确**；`:381` = `kind=MemoryEntryKind.FOLDER,` **精确**；`:154-186` 落在 `list_entries` 内且确含 `parent = entry.path.rsplit("/", 1)[0] or "/"` 的 parent 计算 **精确**。PuPu `memory_v2_toolkit.py:364` = `if public_kind not in {"folder", "markdown", "image", "link"}:` **精确**；`:372-375` = `if public_kind == "folder":` 至 `return "folder", None, "", ""` **精确**；`memory_v2_store.py:845` = `kind TEXT NOT NULL CHECK(kind IN ('folder', 'file', 'link')),` **精确**（登记引文省略了逗号后空格，纯排版）；`:6724` = `if parent is None or parent["kind"] != "folder":` —— **与登记引文逐字相同**，其后 `:6725-6729` 抛 `context_v2_parent_not_found` 409。**穷举重跑**：`grep -rn "MemoryEntryKind.FOLDER" src/` 得 12 处命中，`grep -rn 'kind\s*=\s*["'"'"']folder' src/` 得 0 处；12 处中 **仅 `service.py:381` 一处是写入构造**，其余为比较判定（`is FOLDER` / `in {FOLDER, LINK}`）或上述两处分类助手；`_write` 的四个调用点（`:377/407/443/468`）分别对应 folder/markdown/image/link 各一。
- **可靠性**: 两仓仓内文件字面内容与行号；穷举部分由本关以两条独立 grep 重跑确认。
- **相关性**: 支持其所称的三点净内容。**标注纪律核实结果**：本条 净内容 中关于父强制的陈述 **只出现在 `pupu_legacy` 名下**（「`pupu_legacy` 在写入时强制父 folder 存在」），**从未对 unchain 侧作同类陈述**；支持/反驳 栏明写「**但不闭合该推断**」；完整性限制栏明写「**这不是一条主张，是一个问题**」并指名归属。**三处表述相互一致，无以事实口吻复用未核实项的情形。** 该克制经核属实。
- **来源归类**: 内部来源

---

#### S-0094 | ASSESSMENT | evidence-examiner → E-0071

- **阶段**: 议案庭审
- **结论**: 三条命令 **全部重跑，三项净内容逐值复现**，含两个文件字节数精确到个位；**其负向断言经本关以三重更严条件复跑仍为 0**，其自陈的唯一残余风险（字符串拼接构造）本关亦已探测，未见任何构造路径。
- **依据**: E-0071
- **不确定性**: 负向证明的固有边界仍在：本关覆盖了字面全串、两段子串与字面量前缀枚举，**但不可能穷尽运行时动态拼装的全部形态**。此外，该字面串 **确实存在于 `unchain_runtime/server/` 的 4 个文件中**（`route_memory_v2.py` · `memory_v2_runtime.py` 及两个测试）—— 与本条主张不冲突（本条射程明写为 `src/**`），但引用时须保留 `src/**` 这个限定词，**不得升格为「全仓无此码」**。提交方自陈未读 `memory_inspect_modal.js` 全文，本关同样未读。
- **请求/下一步**: 引用第 (1) 项时务必带上 `src/**` 限定。
- **评估结论**: 已验证
- **证据编号**: E-0071
- **来源类型**: general
- **真实性**: `ls -la src/COMPONENTs/memory-inspect/` 重跑 → **恰两个文件**：`memory_inspect_modal.js` **30,849 字节** 与 `memory_inspect_modal.test.js` **2,678 字节**，**与登记逐字节相同**，无子目录。`git rev-parse --short HEAD` → `b2385d5d`，branch `dev`；`git status --porcelain src electron unchain_runtime | wc -l` → **0**，均与登记相同。**负向断言的三重加严复跑**：(a) 原命令 `grep -rn "context_v2_store_disabled" src --include="*.js" | wc -l` → **0**；(b) **去掉 `--include` 过滤**，全 `src/` 任意文件 → **0**；(c) 子串与前缀探测 —— `store_disabled` 在 `src/` → **0**，`context_v2_store` 在 `src/` → **0**，`context_v2_[a-z_]*` 全枚举得 30 个不同字面量（`context_v2_unavailable` · `context_v2_not_found` 等），**其中无一为 `context_v2_store_disabled` 亦无任何可拼出它的片段**。另查 `src/` 全部文件扩展名分布：780 个 `.js` + 字体/图标/json/css 等资源，**无 `.jsx` / `.ts` / `.mjs`**，故 `--include="*.js"` 对源码 **零遗漏**，原命令的过滤器不构成盲区。
- **可靠性**: 可复跑命令 + 仓内目录状态；三条命令均不依赖提交方叙述，任何人可复核。
- **相关性**: 支持其所称的三点，并支持其「独立复核并确认 E-0048 与 E-0053，第三次同向」的定位。负向断言在加严条件下仍成立，故其对 C-A4 落位空间的支撑不因取样方式而削弱。
- **来源归类**: 内部来源

---

## 小结表

| 证据 | 提交方 | 评估结论 | 锚点核对 | 命令/穷举重跑 | 须随证据一同引用的登记项 |
|---|---|---|---|---|---|
| E-0058 | code-owner-unchain | **已验证** | 全部复现 | 3/3 逐值相同 | `cat` 转录为紧凑单行、实为 5 行 pretty-print（排版性）；「不钉 schema 版本」应改为「不钉 `SCHEMA` 字符串与 kind 词汇表」（lock 实含 `context_memory_contract: 1`） |
| E-0060 | code-owner-unchain | **已验证** | 5/6 精确，**1 处指错分支** | — | `image`/`markdown` 的 `content_ref` 分支应为 `:563-564`，登记的 `:565-566` 是 `link` 分支 |
| E-0063 | code-owner-unchain | **已验证** | 8/8 精确 | 2/2 探针逐字符相同 | 自陈的「未穷举 unchain 异常类」**经本关闭合可去除**（引用数 0 / import 数 0）；字符集探针登记为 1 行摘录、实 5 行，省略已标注，但未提及的 `curation_repository_error` 是唯一同时通过窄字符集者 |
| E-0065 | code-owner-unchain | **已验证** | 内容全证实，**1 处区间早一行** | — | 超扫描界应为 `sqlite_read_v2.py:1203-1206`；`O(n²/页大小)` 是推断非测量，不得作性能事实引用 |
| E-0066 | expert-architecture | **已验证** | 内容全证实，**1 处区间短两行** | grep 4 行命中分区完全吻合；**穷举断言加严后仍成立** | `getStatus` 函数体宜采 E-0025 的 `:870-887`；自陈的「未复核直连消费者」**经本关闭合可去除** |
| E-0067 | expert-architecture | **已验证** | 10/10 精确 | — | 「两道守卫仍绿」**无人验证**，本条只支持「守卫代码仍在且形状未变」 |
| E-0068 | expert-architecture | **已验证** | 5/5 精确，**无漂移** | 13 字段逐项比对相符 | 无（本批引证质量最高） |
| E-0069 | expert-architecture | **已验证** | 4/4 内容证实，**1 处区间早一行** | 触发条件与失败模式经本关追完整链 | 守卫应为 `:382-385`；缺口宜表述为 **两道 10,000 界、任一触发均落同一 500 `context_v2_failed`** |
| E-0070 | expert-architecture | **已验证** | 7/7 精确 | **穷举重跑成立**（2 条独立 grep） | 产生点唯一但 **可达路径不止一条**（curator 晋升亦调 `create_folder`）；「孤儿升根之所以安全」是推论且仅限 `pupu_legacy`；**「未核实项」标注合规，未在别处以事实口吻复用** |
| E-0071 | expert-architecture | **已验证** | 全部复现（含字节数） | **负向断言三重加严后仍为 0** | 第 (1) 项须保留 `src/**` 限定 —— 该码在 `unchain_runtime/server/` 的 4 个文件中确实存在 |

**批次统计**：已验证 **10** · 未验证 **0** · 相矛盾 **0**。全部 `general` 来源类型，全部归类为 **内部来源**。

**两条跨条目的事实登记**（供 `speaker-of-the-house` 判断是否需要重排引用它们的发言）：

1. **E-0069 的缺口射程应扩写。** 活读路径上有 **两道** 10,000 界（PuPu `_MAX_LIFECYCLES` 与 unchain `_MAX_LIST_SCAN`），两者的异常 **都不是 `MemoryV2Error` 子类**，因此 **都落在同一个 500 `context_v2_failed` 出口**。按单道界表述会低估该缺口。
2. **E-0070 的 folder 可达性应补一条。** 产生点唯一（`create_folder`）成立，但 `sqlite_memory_host_v2.py:947-948` 显示 **curator 晋升路径会调用它**，故 folder 条目并非只能由显式用户动作产生。

**程序性声明**：本关未对任何实体争点发表意见，未重开任何已归档辩论，未派生子 instance（A-012），两仓均未作任何写操作（`git status` 在复核前后一致）。

#### S-0095 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **承重证据复核 75 条已完成 72 条，8 条判为「未验证」，已按同一路由送 `procedural-judge`（R-0003 在途）。** 本条归档三件事：**(一)** 本庭对 `chief-judge` 的两处转述被复核推翻，本庭自陈更正；**(二)** 六批复核暴露出一个 **系统性缺陷模式**，成因已被机械定位；**(三)** 复核中 **五处方向相反** 的发现（证据强于提交方自陈）一并登记
- **依据**: S-0033 … S-0094, S-0071, S-0072, E-0073, E-0075
- **不确定性**: R-0003 未到达前，8 条未验证证据的可采性与射程未定，受影响项的重排范围因而未定
- **请求/下一步**: 更正 1、2 的补正责任归各自提出方；本庭 **不代为补强**，只在 `SUMMARY` 中按更正后的射程引用
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-09T00:30:00-07:00
- **影响范围**: 本庭对外转述的两处表述；`SUMMARY` 的引用纪律

  **一 · 本庭自己的两处转述被推翻（先说这一条，因为错的是本庭）**

  | # | 本庭转述 | 复核认定 | 依据 |
  |---|---|---|---|
  | **1** | 「V2 越是真的上线，V1 向量视图越空 —— 而且是静默的」 | **宽命题不成立。** 该结论 **不由 E-0073 承载** —— 审查人沿 `add_texts` 全量枚举，找到 **第三个写入者**：`memory_factory.py:1948` ← `replace_short_term_session_memory` ← **`POST /memory/session/replace`，该路由服务端只校验 auth、无任何 V2 admission 门禁**；渲染端 `chat_export.js:169` 的 `restoreSessionMemory`（导入会话）**同样不带 admission 判断**。**成立的是窄命题**：「admitted run **装配的运行时对象** 在能力层面就不可能写 V1 向量」。另：「静默（200 + 空 payload）」**整段不由 E-0073 承载** —— 该 harness 不发任何 HTTP 请求、不观察任何响应体 | S-0071 |
  | **2** | 「模型压根不知道 `folder` 存在」 | **直接推翻。** 审查人构造出 **真实 toolkit** 并 dump 出 **真实 provider JSON**：在 **全部三种 toolkit 变体**（普通 agent / curator / task_state_curator）的模型可见 JSON 中均含 `memory_list.path` → **`"Virtual folder path; never use a host filesystem path."`** —— **`folder` 一词确实到达模型，且普通 agent 也看得到**。**仍然成立的窄事实**：唯一的 **写入** 工具 `memory_upsert` 的模型可见面不提 `folder`，`kind` 无 enum、无默认、描述为占位串 `"Argument kind"` | S-0072 |

  **本庭对第 2 项的额外声明**：`expert-llm` 据以把「扁平是稳态」从「可达分支」升格为「预测默认值」的支柱之一 **已失效**。**该升格是否仍成立，须由提出方 `expert-llm` 重排**，审查人明确不代判，**本庭同样不代判**。

  **本庭对自身的评述**：这是本案 **第二次** 本庭复述了一个未经复核的概括（第一次见 S-0030 第一节）。两次的形态相同 —— **取一个真结果，再把结论说到需要的宽度**。第一次发生后本庭已就此留痕，**第二次仍然发生**。本庭不辩解，交 `codex` 与 S-0031 第四节的四项自我举报并案。

  **二 · 一个系统性缺陷模式，成因已机械定位（本庭认为这是本次复核最有价值的产出）**

  六批复核（A/B/C/D/E/F + 4 条须查类）共查出 **同类缺陷 9 次**，全部落在 **负向或穷举性断言** 上 —— 即下游最容易当作封闭集引用的形态。**成因归为两类，且两类都可机械修复**：

  | 类别 | 实例 | 机械成因 |
  |---|---|---|
  | **人工筛选的子集被呈现为全集** | E-0004（`service.js:2108` 出处误植）· E-0008（登记 5 行实为 8 行）· E-0013（漏 `unchain_adapter.py:384` 等三处）· E-0032（`listEntries` 同样无上界）· E-0043（漏第 9 个写点）· E-0053（**登记「零命中」实为 4 条含产品代码**）· E-0055（三层深度 import，**正中其自陈盲区**） | 登记时把 grep 输出人工摘要后呈现，**未回头核对命令本身的输出** |
  | **过滤器对相对路径失效** | E-0037（少 1）· E-0054（多 1）· E-0008（测试文件混入） | ``grep -v "/tests/"`` 在 `cd` 进目录后以 `.` 为根时，输出路径为 `tests/…` **无前导 `/`**，故 `/tests/` 不成为子串，**过滤器静默不生效** |

  **第二类的净效果已在本案闭合**：`context_v2_unavailable` 的非测试发出点，E-0037 记 9、E-0054 记 11，**正确值为 10** —— 三方数字经复核归一。

  **本庭据此提请 `codex` 注意一条通用告诫**（不代其立条文）：**引用穷举性 grep 结论时须核对命令输出本身，不得依赖登记摘要**；且 **`grep -v "/tests/"` 这一惯用写法在本仓的相对路径场景下不可靠**。

  **三 · 五处方向相反的发现 —— 复核使证据 *强于* 提交方自陈（一并登记，不只记不利的）**

  1. **E-0064**：审查人以 **三臂对照** 证明 `vector_status` 在 **四种互不相同的真实状态下恒为 `'degraded'`**，而相邻 `backend` 字段确实会变；且两个读服务的 `__init__` **形参里都没有 `vector_index`**，`_vector_index` 全源 **只有一处赋值、无 setter** —— **`None` 是构造上不可达其他值**。**本庭在传唤中提出的「只支持这一个实例」之忧，经查不成立。**
  2. **E-0063**：其自陈的「未穷举 unchain 异常类」**经复核以更强的结构判据闭合**（unchain 全仓对 `MemoryV2Error` 引用数 0、对 PuPu 模块 import 数 0，**结构上不存在继承**），**该限制可去除**。
  3. **E-0066**：其自陈的「未复核是否存在直连 `window.unchainAPI.getStatus()` 的消费者」**经复核闭合** —— 审查人以加严探针（去掉 `.getStatus(` 形态以捕获解构/别名）复跑，**无任何解构或别名消费者**，**该限制可去除**。
  4. **E-0040**：其自陈未逐行确认的 `use_chat_stream.js:10721` 那个 interval，**审查人读了上下文并确认与 V2 读平面无关**，**该限制可去除**。
  5. **E-0075**：审查人发现 `build_memory_v2_toolkit` 的 `runtime` 参数 **只在 `:503` 作 `is None` 判断**，故可传哨兵构造 **真实 toolkit** —— **把该条从「重建」升格为「原件」**，其限制 (3) 就此关闭。

  **四 · 三条超出单条、须由本庭登记的溢出发现**

  1. **`listEntries` 是第二个无上界读方法**（S-0061）—— preload 无 `limit`、main 不施加 `CONTEXT_V2_PAGE_LIMIT_MAX`、`include_descendants` 默认 `true`、`parent_path` 可省。**审查人明确：这对封顶议题是加强不是削弱，请勿因 E-0032 判未验证而连带下调该关切。**
  2. **活读路径有两道 10,000 界，不是一道**（S-0093）—— PuPu `_MAX_LIFECYCLES` 与 unchain `_MAX_LIST_SCAN`，**两者的异常都不是 `MemoryV2Error` 子类，因此都落在同一个 500 `context_v2_failed` 出口**。按单道界表述会低估该缺口。
  3. **folder 条目的可达路径不止一条**（S-0094）—— 产生点唯一（`create_folder`）成立，但 `sqlite_memory_host_v2.py:947-948` 显示 **curator 晋升路径会调用它**，故 **folder 条目并非只能由显式用户动作产生**。该事实对 `expert-llm` 的「扁平是稳态」与 `code-owner-unchain` 的「当且仅当」均有影响，**须由二者各自重排，本庭不代判**。

# 承重证据复核 · 批次 F（收尾）· E-0072 / E-0074 / E-0076

提交方 `expert-llm`（S-0045）。三条全为 **自证类**，依证据规则第六节在本关不豁免；本关同时为时效性复核。

## 全批时效前提

复核开工与收工时实测：

| 项目 | 实测值 |
|---|---|
| PuPu `git rev-parse --short HEAD` | `b2385d5d`（branch `dev`） |
| PuPu `git status --porcelain -- src electron unchain_runtime` | **0 行** |
| unchain `git rev-parse --short HEAD` | `a4e69f4` |
| unchain `git status --porcelain` | **0 行** |

三条证据登记的 revision 均为 PuPu `b2385d5d`，**与本关实测 revision 同一**，且三个产品目录零改动。故本批 **不存在 revision 漂移**：凡本关查出的偏差，均为登记时即已存在的偏差，**不是时效性失效**。反之，凡本关复现的断言，**至今日仍然成立**。

复核方式：所有行号定点读取、所有计数类与穷举类断言 **实际重跑命令**，负向断言 **另行独立取证**，不依赖登记摘要，亦不依赖前批（S-0071 / S-0072）的结论 —— 与前批重合处均由本关重新独立观察。**未派生任何子 instance（A-012）。两仓只读、零改动、未 commit。** 全部临时对象在 `tempfile.TemporaryDirectory()` 内，随进程销毁。

---

#### S-0096 | ASSESSMENT | evidence-examiner → E-0072

- **阶段**: 议案庭审
- **结论**: 十处行号引用 **全部精确命中** 所述内容，唯一的计数类断言（`memory_commit_allowed` 全文 3 处）**逐个行号复现**，无篡改、无漂移。本条在当前工作树上 **仍然完全成立**。
- **依据**: E-0072
- **不确定性**: 本条 **缺 `净内容` 字段**，其事实主张全部内嵌在 `来源定位` 的括注中 —— 这是形式瑕疵，不影响可验证性（每条括注均可独立核对且均已核对），但下游引用时须逐条摘引括注，不能整体引用「E-0072 证明了 X」。
- **请求/下一步**: 无补强请求。建议 `speaker-of-the-house` 在采信时连带记录下方「相关性」段的射程边界。
- **评估结论**: **已验证**
- **证据编号**: E-0072
- **来源类型**: general
- **真实性**: **通过。** 逐项实测：
  - `memory_factory.py:1672-1704` = `create_durable_kernel_runtime_with_diagnostics` 完整函数体（`def` 在 1672，`return runtime, ""` 在 1704），**首尾精确**；docstring 首行 1677 起，正文末行 1682，逐字为 `Build the durability-only kernel runtime without vector dependencies.` / `This path deliberately bypasses Qdrant and embedding resolution.`（闭合 `"""` 在 1683，登记范围取正文，非实质差异）
  - `memory_factory.py:1707-1764` = `create_memory_manager_with_diagnostics`，`_prepare_vector_collection_tag(` 在 **1752**、`QdrantVectorAdapter(` 在 **1759**，两者均落在登记区间内，**精确**
  - `unchain_adapter.py:5579-5615` = `_resolve_memory_runtime` 的 `v2_durability` 分支；实测分支自 5578 的 `if bool(getattr(memory_v2_admission, "is_active", False)):` 起、至 5614 的 `return memory_runtime, None` 止，登记区间两端各差 1 行，**指向内容无误**
  - `unchain_adapter.py:5688-5697` = `_memory_runtime_uses_durability_only`（`def` 在 5688，函数体止于 5696），**精确**
  - `unchain_adapter.py:7183-7191` = `if memory_manager is not None:` → `if memory_durability_only:` → `DurabilityModule(runtime=…)` / `else: MemoryModule(memory=…)`，**九行首尾精确**
  - `unchain_adapter.py:7684` = `memory_durability_only=_memory_runtime_uses_durability_only(`，**逐字精确**
  - `unchain_adapter.py:8731 / 8733 / 8753` = `memory_commit_allowed = False` / `if memory_manager is not None and not graph_memory_v2_admission.is_active:` / `memory_commit_allowed = True`，**三行逐字精确**；缩进实测确认 8753（20 空格）位于 8733（12 空格）的真分支内，故「**仅在非 admission 分支置真**」成立
  - `unchain_adapter.py:9485-9490` = `if (` / `memory_manager is not None` / `and final_text` / `and memory_commit_allowed` / `and not _execution_is_cancelled(execution_token)` / `):`，**六行逐字精确**
  - `route_projection.py:406-449` = `@api_blueprint.get("/memory/projection")` 起至 `return jsonify(_build_vector_payload(scroll_result))` 止，**首尾精确**；`tag = str(state.get("vector_collection_tag") …)` 与 `session_collection_name(session_id=…, collection_prefix=vector_collection_prefix(tag))` 实见于 440-444，故「读端集合名来自 `memory_factory` 的 tag」**逐行成立**
  - **计数类断言实跑**：`grep -n "memory_commit_allowed" unchain_adapter.py` → **恰 3 行：8731 / 8753 / 9488**，`grep -c` = **3**。与登记 **完全一致**（登记写 9488，正文引用写 `:9485-9490`，指同一条件式，无冲突）
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**` 同 revision 仓内文件）。属最高可复核形态 —— 断言与载体同处一个 commit，任何第三方可零成本重跑。本关全部实测为审查人亲自执行。
- **相关性**: **成立，但射程须按其自陈边界读。** 所引控制流确实共同支持「active V2 admission 下装配的是 `DurabilityModule` + `KernelMemoryRuntime`，且 V1 commit 被 `memory_commit_allowed` 显式跳过」，也确实支持「读端 `/memory/projection` 的集合名取自 `memory_factory` 的 tag」。**其自陈的未穷举项，本关代为穷举，结果为：该风险确实存在。** 实跑 `grep -rn "add_texts" --include="*.py"`（排除 `__pycache__` 与 `tests/`）→ 产品代码 **唯一写入点 `memory_factory.py:1948`**；实跑 `grep -rn "_session_collection_name"` → 产品调用者为 `memory_embeddings.py:142`、`memory_factory.py:747/1899/1906/2372/2376/2505` 与 `route_projection.py:436` 的 `getattr` 兜底。**即：确有一条不经 run 装配对象的向量写入路径存在（与 S-0071 就 E-0073 所查同一处）。** 这 **不否定 E-0072 的任何正向断言** —— 后者全部是控制流阅读，逐条为真；但它划定了射程：**由 E-0072 单独推不出「V2 生效后 V1 向量集合再无新点」这一宽命题**，该宽命题需另引证据。本条自身表述为「支持读端结论、反驳『保持现状 = 用户所见不变』」，此表述 **在射程内**。审查人不就该实体争点表态。

---

#### S-0097 | ASSESSMENT | evidence-examiner → E-0074

- **阶段**: 议案庭审
- **结论**: 十三处行号引用 **全部精确**，**每一个常量值逐一实测复现**（无 `E-0056` 式的行号/常量错配），两条 grep 断言 **实际重跑并复现**；审查人另代其穷举了一条自陈未穷举的负向搜索，结果 **反向加强** 本条。当前工作树上 **仍然成立**。
- **依据**: E-0074
- **不确定性**: 两处非实质的区间取舍（见真实性段末），均不改变所指内容。本条 `完整性限制` 中「未实跑任何向量路径」为真且本关未改变 —— 审查人只验证了「后端为何恒为 `NullVectorBackend`」的前提，未跑任何嵌入或 Qdrant 路径。
- **请求/下一步**: 无补强请求。审查人代查的穷举结果（唯一后端构造 seam）可并入卷宗，供 `code-owner-runtime` 终局确认时省一步。
- **评估结论**: **已验证**
- **证据编号**: E-0074
- **来源类型**: general
- **真实性**: **通过，含全部常量逐值核对。**
  - `memory_v2_vector.py:30` = `VECTOR_PROVIDER_ENV = "PUPU_MEMORY_V2_VECTOR_PROVIDER"` ✔逐字
  - `:41` = `MAX_INDEX_ENTRIES_PER_CALL = 2` ✔**值为 2**
  - `:43-45` = `RRF_K = 60` / `LEXICAL_RRF_WEIGHT = 2.0` / `VECTOR_RRF_WEIGHT = 1.0` ✔**三值逐一吻合，行号逐行吻合**
  - `:81-87` = `if provider != "ollama":` … `configuration_error="unsupported_provider",` ✔首尾精确
  - `:88-95` = `if not model:` … `configuration_error="model_required",` ✔首尾精确
  - `:152-156` = `class VectorHit:` + `chunk_id: str` / `text_hash: str` / `score: float` ✔**恰三字段**
  - `:158-164` = `def deterministic_chunks(` … `chunk_chars: int = 2000,` (163) / `overlap_chars: int = 200,` (164) ✔**两默认值精确**
  - `:198-205` = `class NullVectorBackend:` … `def status(self) -> str: return "disabled"` ✔
  - `:231` = `if not config.enabled or config.provider != "ollama":` ✔逐字
  - `:455-480` = RRF 融合段；两处权重累加实见于 460-462（`LEXICAL_RRF_WEIGHT / (RRF_K + rank)`）与 475-477（`VECTOR_RRF_WEIGHT / (RRF_K + rank)`），**均在区间内**（区间起点 455 落在 lexical 循环体内，循环头在 453；非实质）
  - `memory_v2_unchain_read_adapter.py:488-489` = `"backend": "degraded" if result.lexical_fallback else "fts5",` / `"vector_status": "degraded",` ✔**逐字精确**
  - `route_projection.py:344-370` = `_project_vectors` 完整函数（`def` 在 344，`return coords, variance` 在 370）✔首尾精确；`np.linalg.svd(centered, full_matrices=False)` 在 353、`num_components = min(5, len(singular_values))` 在 357、`variance` 列表推导 `for i in range(5)` 在 365 —— **「每次请求对全集重拟合 SVD、取前 5 主成分、返回 variance」三点逐点复现**，且 `/memory/projection` 路由每次请求 scroll 全集后调用它，「每次请求重拟合」成立
  - `memory_embeddings.py:60-63` = `_vector_embedding_signature` 完整函数，`return f"{provider}:{model}:{int(vector_size)}"` ✔**签名格式逐字**；`:108-141` 覆盖 `previous_signature` 比对(108-111) → `new_tag = uuid4().hex[:12]`(113) → 写回(114-115)，「**换签名即换集合**」的赋值全部在区间内（旧集合删除自 142 起，紧邻区间外一行；非实质）
  - **计数/负向断言实跑**：`grep -c "store_owner\|memory_v2\|context_v2" route_projection.py` → **0**；`grep -n` 同模式 → **零行输出，exit 1**（真零命中，非过滤器假象）。`grep -rn "PUPU_MEMORY_V2_VECTOR_PROVIDER" --include="*.py" --include="*.js" --include="*.cjs" --include="*.json" .` 于仓根实跑 → **原始 16 行**：产品树 `unchain_runtime/server/memory_v2_vector.py:30` **1 行** + `unchain_runtime/server/tests/test_memory_v2_vector.py` **7 行**；`.claude/worktrees/semantic-theme-taxonomy-v2-p1/` 下镜像 **8 行**（1 产品副本 + 7 测试）。**施加登记声明的同一排除（测试、`__pycache__`、`node_modules`）后：产品代码恰 1 处（`:30` 自身常量定义），工作树副本恰 1 处** —— 与登记「另一处命中在 `.claude/worktrees/` 下」**逐字吻合，过滤器在本条上未失效**。附带确证：`.js` / `.cjs` / `.json` **零命中**，即渲染端与 Electron 侧无任何代码设置该环境变量
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**`，同 revision）。同 E-0072，属可零成本重跑的最高可核形态。
- **相关性**: **成立，且经本关补强后强于登记。** 所引常量与分支确实支持其所声称的「V2 向量层的形状事实」（provider 白名单、RRF 权重、分块参数、默认禁用、读端每请求重拟合 SVD、V1 换签名即换集合）。**其自陈「未穷举是否有绕过 `VectorConfig` 的第二条构造路径」，本关代为穷举并已闭合**：`grep -rn "OllamaQdrantBackend\|NullVectorBackend\|VectorConfig("`（排除 `tests/`、`__pycache__`）→ 产品代码 **仅 `memory_v2_vector.py:772`（`return NullVectorBackend()`）与 `:776`（`return OllamaQdrantBackend(...)`）两处构造，同处一个 `_build_backend` seam**，无第二条路径。**另作一次运行时时效验证**（读操作，只读环境变量 + 构造 dataclass）：本机 `PUPU_MEMORY_V2_VECTOR_PROVIDER` / `..._MODEL` 均 **未设置**，`VectorConfig.from_environ()` 返回 `provider=''`、`enabled=False`、`configuration_error=''` —— 即本条 `完整性限制` 所依赖的「后端恒为 `NullVectorBackend`，无可跑」这一前提 **今日实测成立**。

---

#### S-0098 | ASSESSMENT | evidence-examiner → E-0076

- **阶段**: 议案庭审
- **结论**: 五处行号引用精确，但 **一项计数不符（登记 `folder` 全文 6 处，实测 9 行）**，且 **其括号内的负向断言与一处 `来源定位` 标注被审查人第一手取证直接证伪** —— `memory_v2_toolkit.py:931` 的 `Virtual folder path; never use a host filesystem path.` **确实逐字到达模型可见 schema**。依本关规则「计数不符即未验证」，本条报 **未验证**；其中仍然成立的窄事实已在下方逐条剥离保留。
- **依据**: E-0076
- **不确定性**: 被证伪的是「`folder` 一词是否到达模型」，**不是** 「`memory_upsert` 的模型可见面是否提 `folder`」—— 后者经本关实跑仍然成立。两者在本条内被合并表述，须由提出方 `expert-llm` 拆分后重排其上层推论；**审查人明确不代判该推论是否仍然成立**。
- **请求/下一步**: 请 `speaker-of-the-house` 依证据处理规则处置；若提出方补强，需要的只是把计数改正为 9 行、并把「无一处在模型可见 description 内」改为「**除 `:931` 外**无一处在模型可见 description 内」。补强责任在提出方。
- **评估结论**: **未验证**
- **证据编号**: E-0076
- **来源类型**: general
- **真实性**: **部分通过。行号引用精确，计数与负向断言不实。**

  **精确复现的部分：**
  - `:1355-1366` = `def memory_upsert(` 起至 `) -> dict[str, Any]:` 止，**十参数首尾精确**；`kind: str = "markdown",` 实测在 **1361** ✔与登记逐字吻合
  - `:1367-1372` = 被丢弃的 docstring，起于 `"""Create or revise formal chat memory with CAS protection.`、止于闭合 `"""` ✔精确
  - `:1758-1762` = `memory_upsert` 元组，description 全文 `"Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory."` ✔**逐字**，且本关实跑确认这正是模型收到的 `description`
  - `:459-466` = `toolkit.register(_UnchainTool.from_callable(function, name=name, description=description, always_load=True))` ✔精确，「description 由元组显式提供」成立
  - `:364-365` = `if public_kind not in {"folder", "markdown", "image", "link"}:` / `raise MemoryV2ToolkitError("kind must be folder, markdown, image, or link")` ✔逐字，「在错误分支」成立
  - `grep -n "    def memory_" memory_v2_toolkit.py` → **恰 17 行** ✔与登记「17 个工具」吻合（924/974/1027/1044/1158/1187/1208/1242/1338/1355/1451/1489/1507/1553/1621/1659/1692）
  - `grep -n 'kind: str = "markdown"\|kind must be folder'` → 365 / 1048 / 1361 ✔复现
  - 负向项 `grep -n "create_folder" memory_v2_toolkit.py` → **零命中（exit 1）**，17 个工具名中亦无此名 → **「无 `memory_create_folder`」成立**

  **不实的部分：**
  1. **计数不符。** 登记 `grep -n "folder" memory_v2_toolkit.py`（**全文 6 处**）。实测 **9 行**：`82`（`_PLACEHOLDER_NAMES` 内的 `"folder"`）· `364` · `365` · `372` · `374` · `375` · **`931`** · `1578` · `1579`；`grep -c` = **9**。少登记 3 行，且 revision 未变，**属登记时即已存在的计数失实**。
  2. **负向断言被证伪。** 登记「**无一处在模型可见 description 内**」。审查人 **不依赖前批结论，独立取证**：以产品自带 bootstrap（`import unchain_adapter` 解析出 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`）构造 **真实 `Toolkit`**（`build_memory_v2_toolkit` 的 `runtime` 仅在 `:503` 作 `is None` 判断，故哨兵 `object()` 得到真件而非重建件），再调 `Toolkit.to_provider_json(provider)` dump **模型实际收到的 JSON**：

     | curator | provider | `"Virtual folder path; never use a host filesystem path."` 在模型 JSON 内 | JSON 内 `folder` 出现次数 | `enum` |
     |---|---|---|---|---|
     | False (6 工具) | openai / anthropic / gemini | **True** | 1 | 无 |
     | True (14 工具) | openai / anthropic / gemini | **True** | 1 | 无 |

     即 **六种组合全部命中**。机制经审查人在 unchain 仓亲自定位：`unchain:src/unchain/tools/tool.py:266` `_, parameter_descriptions = _parse_docstring(func)`，`:282` `description=parameter_descriptions.get(name, f"Argument {name}")` —— **`:param name:` 指令会被解析成模型可见的参数描述，占位串只是缺失时的回退**。
  3. **`来源定位` 标注被证伪。** `:924-933`（`memory_list` 的 `:param path: Virtual folder path;…`）标注为「**同样不可达模型**」，与上表直接冲突：该行是 **9 处 `folder` 中唯一一处、也是全部模型可见 JSON 中唯一一处** 到达模型的 `folder`。
  4. **区间标注不准（非实质）。** `:1751-1790` 标注为「工具名/描述全表」。实测工具表起于 `:1122` 的 `tools: list[...] = [`，中经 `:1326` / `:1336` / `:1749` 三处早退与 `:1751` 的 `tools.extend(`，终于 `:1800` 的 `return _toolkit_registry(tools)`；`1751-1790` 只覆盖 curator 扩展段且在 `memory_history` 处截断。**其负向结论（无 `memory_create_folder`）不受影响** —— 已由全文 grep 独立证实。
  5. **措辞不准（非实质）。** `:364-365` 称四个合法 kind 的「**唯一**出现处」；`"markdown"` 另见于 `:1048` 与 `:1361` 的参数默认值。作「四者并列枚举的唯一出现处」解则成立。
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**` 同 revision，机制部分旁及 `unchain:src/unchain/tools/tool.py`，unchain HEAD `a4e69f4`）。**来源本身权威且可零成本重跑 —— 失效不在来源，在登记与来源的偏离**：本条正是本案已发九次的「登记的命令转录 ≠ 该命令的实际输出」模式的第十次，且再次落在负向/穷举断言上。
- **相关性**: **主张部分成立、部分被证伪，须拆分后方可引用。**

  **经本关实跑仍然成立、且仍具材料性的窄事实**（引自审查人 dump 的 `memory_upsert` 模型可见 schema 原文）：
  - `memory_upsert` 的模型可见 `description` **不含 `folder` 一词** ✔
  - 其 `kind` 参数模型可见形态为 `{"type": "string", "description": "Argument kind"}` —— **无 `enum`、无 `pattern`、无默认值**，`"markdown"` 这一默认值 **不出现在模型侧** ✔
  - `required` 仅 `path` / `description` / `expected_space_revision` 三项 ✔
  - 四个合法 kind 仅在错误分支枚举，模型只能撞错才见到 ✔
  - 不存在 `memory_create_folder` 工具 ✔

  **被证伪、不得再引用的表述**：「`folder` 一词不到达模型」「`memory_list` 的 `:param path:` 不可达模型」「全文 6 处」。

  本条声称「**与 E-0061 / S-0024 乙 合取** 得出『扁平是稳态』」—— 该合取的一条支柱（模型完全不知 `folder` 概念）已被本关第一手证伪，**该上层推论是否仍成立须由提出方 `expert-llm` 重排。审查人依中立原则不代判，也不就「该不该为 V2 造投影」「vector view 该不该保持现状」表任何态。**

---

### 执行约束自陈

- **A-012 遵守：未派生任何子 instance。** 全部 `git` / `grep` / `sed` / python harness 由本 instance 亲自执行。
- **只读。** 收工复测：PuPu `HEAD = b2385d5d`、`git status --porcelain -- src electron unchain_runtime` 为 **0 行**；unchain `HEAD = a4e69f4`、`git status --porcelain` 为 **0 行**。两仓零改动，未 commit。三次 python harness 均只读构造对象、未发任何 HTTP 请求、未触碰真实 `UNCHAIN_DATA_DIR`（指向 `tempfile.TemporaryDirectory()`，随进程销毁）。
- **审查范围。** 仅就真实性 / 可靠性 / 相关性 / 时效性作答，未对本案任何实体争点表态。

#### S-0099 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: `procedural-judge` 就七条未验证证据作出程序裁定 **R-0003**，本庭 **逐字归档，未改一字**（[`ruling.md#R-0003`](ruling.md)），并依其「获准 action」第 1、2 项 **执行完毕射程标注与重排**。**七条全部可采、射程逐条受限。** 第八条（E-0076）依同一路由已送 `procedural-judge`（R-0004 在途）
- **依据**: `ruling.md#R-0003`, S-0061, S-0065, S-0073, S-0081, S-0082, S-0083, S-0084, S-0098
- **不确定性**: R-0004 未到达前，E-0076 的可采性与射程未定，门禁 11 因而仍未满足
- **请求/下一步**: 七份复核结论与 R-0003 **须一并显式呈 `chief-judge`**（裁定强制回应明文，**不得以「其他证据仍能支持同一结论」为由略去**）
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-09T01:10:00-07:00
- **影响范围**: 七条证据的射程；九项表述的证明力；闭庭门禁第 11 项

  **一 · 本庭已执行的两项动作**

  1. **射程标注**：七条证据的验证历史各追加一条 `R-0003` 记录，**以引用裁定编号的方式** 标注「射程之内 / 剔除 / 不并入」三段。**未改写任何证据条目的登记正文；未把审查人的复核产出并入任何条目；未代任何一方挂接其他证据。**
  2. **重排**：依裁定第四节 (1) 的机械规则，下列 **九项表述丧失所依据证据的证明力**。依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)，本庭 **不删除、不改写发言正文**，只在此标注：

  | # | 发言 | 丧失证明力的表述 | 失去的依据 |
  |---|---|---|---|
  | 1 | S-0010 | 「十八个方法里 **唯一** 没有 limit/page 的读方法」— 唯一性部分 | E-0032 |
  | 2 | S-0018 | 「`getTree` 是十八个读方法里 **唯一** 无上界的一个」— 唯一性部分 | E-0032 |
  | 3 | S-0011 | 「sidecar 在 **9 个非测试点** 也发这个码」— 计数部分 | E-0037 |
  | 4 | S-0017 | 「`store.activeChatId` 的 **全部 8 个产品写点**」— 封闭集与计数 | E-0043 |
  | 5 | S-0018 | 以 E-0053 承载 **全 `src/` 范围** 的负向断言者（含单码形式） | E-0053 |
  | 6 | S-0018 | 「与 sidecar **11 个非测试点** 三方碰撞」— 计数部分 | E-0054 |
  | 7 | S-0018 | 「从 `src/COMPONENTs/**` **经任何合法路径不可达**」 | E-0055 |
  | 8 | S-0018 | 「`mergeRefs .slice(0,512)`」及所附行号 `480` | E-0056 |
  | 9 | S-0018 | 「**折叠即卸载**」因果命题的 **全部出现处，不论提出方为谁** | E-0056 |

  **二 · 三条本庭必须原样转达、不得代为消化的裁定内容**

  1. **「失效是条目级的，不是发言级的。」** 裁定第四节 (1) 末句明写：**同一份 `ASSESSMENT` 内，一句话失去依据、相邻一句照常成立，是本裁定的预期结果，不是矛盾。** 本庭据此 **不整份下调任何一份 `ASSESSMENT` 的分量**。
  2. **「是否仍能由其他证据支持，本庭不得代为认定。」** 裁定第四节 (4) 与[证据规则第六节末项](../../../codex/lifecycle/evidence-rules.md)双重约束 —— **那是裁决者的判断**。本庭因此 **不在上表任何一行后面补一句「但另有 X 证据支持」**，即便本庭看得出某些行确实另有支撑。
  3. **「射程之外 ≠ 命题为假。」** 裁定第五节第 2 项列名四项：`getTree` 是否唯一无上界 · 五码在全 `src/` 是否零命中 · chat-bubble 是否可达 facade · `mergeRefs` 封顶几何。**任何角色不得把本裁定读作对上述任一命题的否定，亦不得读作支持。**

  **三 · 一项裁定对本庭的直接约束，本庭照录并已遵守**

  裁定第二节 (5) 前置声明：审查人在复核中取得的 **新事实**（`listEntries` 亦无上界 · 正确计数 10 · 第 9 个写点 · `context_v2_turn_mutation.js:392` · `artifact_kind_registry.js:2` · `:254`/`:421` 的 512）是 **复核内容，不是被复核证据的内容**，**一律不并入任何一条证据的射程**。

  > **理由裁定写得很清楚，本庭原样转达**：把审查人的复核产出灌进证据条目，**等于替提出方完成了补强**。这是 R-0001 第五节与 S-0021 第三节已立的同一条界，**且对裁定者的约束比对本庭更强**。

  **本庭已核对自身执行**：上述六项新事实 **一项都未写入任何证据条目的登记正文**，只作为 **复核记录** 留在验证历史与 S-0095 第四节。

  **四 · 一处本庭须向 `chief-judge` 单独点名的裁定说理**

  裁定第二节 (3) 载明其 **三问判准**（可分性 / 可复核性 / 器械污染），并明写：

  > **「『方向是否翻转』本席一次也没有问，它不是本席的判准。」**

  本庭认为此句须单独呈上，理由是：**本庭在 S-0030 与 S-0095 两次自陈更正中，都用过「结论方向不翻转」这类措辞来描述缺陷的轻重**。裁定明确 **拒绝** 把该描述当作放行理由，并给出了一套可复核的替代判准。**这构成对本庭既往表述习惯的一次纠正，本庭接受并登记。**

#### S-0100 | NOTICE | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: `procedural-judge` 就 E-0076 作出 **R-0004**，本庭逐字归档（[`ruling.md#R-0004`](ruling.md)）并执行射程标注与重排。**至此九条未验证证据全部获程序裁定，承重集合 75 条全部复核完毕，闭庭门禁十一项全部满足。**
- **依据**: `ruling.md#R-0004`, S-0098, S-0045
- **不确定性**: 无
- **请求/下一步**: 进入闭庭，提交 `SUMMARY`
- **通知类型**: PROCEDURAL
- **生效时间**: 2026-08-09T02:10:00-07:00
- **影响范围**: E-0076 射程；S-0045 四项表述；闭庭条件

  **重排（依 R-0004，仅命中 S-0045 一份发言）** —— 本庭 **不删除、不改写发言正文**，只标注依据已失效：

  | # | 表述 | 处置 |
  |---|---|---|
  | 1 | 结论末段「**模型压根不知道 `folder` 存在**」 | 丧失 E-0076 证明力 |
  | 2 | §额外判据 3「全部是死文档，模型永远看不到」的 **一般化部分** | 丧失；**「`memory_upsert` 的描述取自显式传入字符串、其自身 docstring 被丢弃」不受影响** |
  | 3 | §额外结论中「模型不知道 `folder` 存在」这一 **前提** | 丧失 |
  | 4 | §额外判据 5「（`:1751-1790` **全表**）」这一 **定位形式** | 丧失；**负向结论「toolkit 里没有 `memory_create_folder`」不失效** |

  **另依 R-0004 覆盖性规定第 2 条**：E-0076 `支持/反驳` 字段中「与 E-0061 / S-0024 乙 **合取** 得出『扁平是稳态』」这一登记本身，**该支柱不获 E-0076 证明力**。本庭 **只作标注，未改写该字段登记正文**。**该合取推论是否仍成立，审查人、`procedural-judge`、本庭三方均明确不代判，重排责任在 `expert-llm`。**

#### S-0101 | SUMMARY | speaker-of-the-house → case
- **阶段**: 议案庭审
- **结论**: **闭庭门禁十一项已逐项确认全部满足，宣布闭庭，提交以下忠实汇总**
- **依据**: S-0001 … S-0100；E-0001 … E-0076；`ruling.md#R-0001` `#R-0002` `#R-0003` `#R-0004`
- **不确定性**: **本案对议案的核心对象「这个 tree view 显示出来的是不是一棵树」，取证结构上不足以回答**（`expert-architecture` S-0025 己）。**G2 全程未解**：本机 V2 store `entries=0`，无一名必到者能就「有数据时」取证
- **请求/下一步**: 提交 `chief-judge` 进行议案裁定。**强制回应事项 5 项须逐条显式回应方可裁定**（门禁第 8 项）；另有 **7 项待处置事项** 与 **9 项证明力失效标注** 须一并过目
- **共识**: S-0004, S-0005, S-0010, S-0011, S-0017, S-0018, S-0024, S-0025, S-0045
- **分歧**: D-A（S-0005 ↔ S-0010 ↔ S-0011 ↔ S-0018）· D-B（S-0024 ↔ S-0004）· D-C（S-0025 ↔ S-0005/S-0010/S-0011/S-0017/S-0018）· D-D（S-0018 ↔ S-0005）· D-E（S-0010 预先反对，`Code Owner` 反对无自动通道）
- **已知缺口**: G1, G2, G9（G8 / G10 已闭合）· E-0057 · S-0031 第三节
- **候选方案**: **无**（议案庭审不产生方案，9 名必到者无一提交 `PROPOSAL`）
- **风险**: R1（11 条单向门，S-0025 正文五）· R2（出厂默认态不可行，S-0004 条件 1 / S-0010 FE1）· R3（Windows 结构性不可用，S-0010 FE7）· R4（跨仓契约钉死点）· R5（载荷无上界，S-0061 认定为 **两个** 方法）
- **强制回应事项**: **S-0025 的 5 项「不成立」**（每项限定半句照录）
- **未答 non-blocking 传票**: **无**（本案未签发任何 `Witness` 传票）

---

### 闭庭门禁逐项确认

| # | 门禁 | 确认 |
|---|---|---|
| 1 | 必到角色均已提交 | **满足**。法定必到 **9 人全部交付**（立案 5 → 第一层复核 7 → 第三层补 9）。`expert-llm` 经 `chief-judge` R-0002 撤销 Fable 5 限制后第二次派遣方得交付 |
| 2 | 事实主张有编号，证据有验证状态 | **满足**。**76 条证据** 均登记验证状态与证据类型（自证类 62 / 须查类 14 / 传闻类 0） |
| 3 | material `QUESTION` 已获答或列为缺口 | **满足**。**G8 与 G10 已闭合**（E-0059 提供方法 · E-0062 实跑闭合 · E-0061 关闭 E-0014 挂起项）；G1 · G2 · G9 结构性保留 |
| 4 | blocking `Witness` 传票均已回应 | **不适用**。本案 **未签发任何 `Witness` 传票** |
| 5 | blocking 性质争议均已裁定 | **不适用**。无传票，无争议 |
| 6 | 每项 `OBJECTION` 已标记 | **不适用**。**`OBJECTION` 动作零次提交**；全部反对以 `Expert` 的「不成立」与 `Code Owner` 的具名反驳/预先反对形式出现，已分别录入强制回应清单与分歧栏。**本庭登记：这是 `0000-0002-2026-0807` 所记同一现象的再次发生**，交 `codex` |
| 7 | 方案可区分且带风险/可逆性/验收标准 | **不适用**。议案庭审不产生方案，9 名必到者无一提交 `PROPOSAL`，符合阶段要求 |
| 8 | `Expert` 不成立与 `Dimension Owner` 反对已进强制回应清单 | **满足**。`expert-architecture` **5 项** 已录入。`expert-llm` 判 **有条件成立**（C1~C5），**无「不成立」**。**无 `Dimension Owner` 在案** —— 评估对象为组织变更议案，本案是产品议案，未命中；依 [summons 第一层例外](../../../codex/lifecycle/summons.md)，**本庭注明：四个组织维度均未被覆盖，这是规则结果不是缺席** |
| 9 | 被质疑证据均有审查结论 | **不适用**。无 `OBJECTION` 型质疑 |
| 10 | 须查类与证言类均有审查结论 | **满足**。**14 条须查类中 13 条已获结论**；**E-0057 本庭判定不路由**，理由与本庭对该项裁量的 **自我举报** 见 S-0019 第四节，已交 `codex` |
| 11 | **承重证据复核已完成** | **满足**。承重集合 **75 条机械导出、全部复核完毕**（六批 + 4 条须查类单查）。**9 条判「未验证」，全部获程序裁定**：E-0051（R-0001）· 七条（R-0003）· E-0076（R-0004），**均为「可采，射程受限」**。**受影响的 13 项表述已重排**（S-0099 九项 + S-0100 四项），**依证据规则第六节不删除不改写发言正文，只标注依据已失效** |

**证据强度声明（本庭必须前置，否则裁定会高估案卷）**：本案 **76 条证据中 75 条经 `evidence-examiner` 独立复核**，这是本仓迄今复核覆盖率最高的一案。**但复核暴露出一个系统性事实，`chief-judge` 须在读任何结论前知道**：**十次**「登记的命令转录 ≠ 该命令的实际输出」，**全部落在负向或穷举性断言上** —— 即下游最容易当作封闭集引用的形态。成因已机械定位为两类（人工筛选的子集被呈现为全集 / `grep -v "/tests/"` 对无前导 `./` 的相对路径静默失效）。**九条因此判未验证，但无一条被排除** —— `procedural-judge` 三度适用同一判准（可分性 / 可复核性 / 器械污染），并明确 **拒绝** 把「结论方向未翻转」当作放行理由。

---

### 一 · 共识

**C1 · 管线形状可行，这是本案唯一被硬证的东西。** `listSpaces → getTree` 两跳的 channel / handler / preload / main / facade **全段现成**，被 `.cjs` 测试逐字锁住（E-0029 经 S-0015 复核，主树真实数字为 **4 suites / 69 tests**，非登记的 6/81）。**五名 owner 各自独立报「本边界内 0 处必须改动」**（runtime · electron · shared-arteries · chat-bubble · 加条件后的 settings），**唯一报非零的是 `code-owner-chat-core`（1 目录 / 2 文件 / 6 处 / 零测试改动）—— 而它恰好是唯一被要求「送值」的那一端**。

**C2 · 该分布可信，且有机械成因，但由它推出的「本案便宜」不成立。** `expert-architecture` 给出成因：`resolveApi()` 的 **全有或全无探针**（18/18，缺一即整个 facade 失明）使任何方法要么全组就位要么全组不可用，**不存在「这个方法还没接好」的中间态**。**但五份「零改动」全部附条件且条件不相交，其总和不是零** —— 缺的那一块恰好就是无主构件。**没有 owner 的工作在每个人的边界统计里都是零。**

**C3 · `ownerChatId` 必须由挂载点显式传入，这是全案最强的收敛。** `code-owner-settings` N1 · `code-owner-chat-core` 甲/乙（**C4 承诺仍然有效、无条件**，故 `code-owner-settings` 的 F1 **不成立**）· `code-owner-chat-bubble` B3 · `code-owner-electron` 丙 · `expert-architecture` C-A10 **五方同向**。且 `code-owner-chat-core` 给出产端权威依据：`use_chat_stream.js:6453-6457` 注释逐字写明 `owner_chat_id` **ALWAYS** 是 UI chat id。**character 分支的正确值就是 `node.chatId`，它已在同一作用域内被求值两次却被丢弃**（E-0042 经 S-0070 复核，认定这把问题从「拿不到」精确化为 **「已在手里但没传」**）。

**C4 · 出厂默认态下 tree view 只能显示「未启用」，且这一态不是零改动。** `PUPU_CONTEXT_V2_STORE_OWNER` 在任何由 Electron 启动的 sidecar 里 **只可能是 `off` 或 `unchain`**，`pupu_legacy` **结构性不可达**（E-0011 经 S-0042 复核，认定该二元性由 tracked 的 `memory_v2_rollout.js:150` **独立支撑**，两个不入库制品只决定取哪个值、不决定结论方向）。而 `context_v2_store_disabled` 在整个 `src/` **零命中**（E-0048 经 S-0078 复核成立）—— **该码是链路上「未启用」的唯一权威信号，而 renderer 没有一行看它**。

**C5 · 落 `code-owner-settings`，`memory-inspect/` 下新组件。** 四方同向；`expert-architecture` 加一条必过条件：**新组件不得自持判定**（boot 先例的判定与呈现分离，E-0067 实测该先例三条今天仍全部成立）。

**C6 · 不为 V2 造投影。** `expert-llm` 判 **不该造**，并 **先拆掉了自己最强的借口** —— TF-IDF→SVD 在既有 FTS5 语料上更便宜，故「技术上做不到」是假理由。其真实理由：散点图的唯一正当性是 **所展示的几何就是系统实际使用的几何**，这对 V1 为真、对 V2 为假（检索纯词法，为绘图而算的 embedding 与召回 **零因果关系**）；且 V2 已有更好的自我视图 —— **作者手写的 path 层级是 ground truth，投影是有损且会漂移的派生物**。

**C7 · 本仓已有一份跑通并守住的先例可复用** —— `boot_readiness`（判定模块在 `SERVICEs/`、哑 bridge 在 `bridges/`、产端 `Object.freeze` 枚举、消费端 `require` 而非转写、显式第四类 `"unknown"`）。`expert-architecture` 与 `expert-ux`（前案）独立指向同一先例。

---

### 二 · 分歧（**原样保留，未压平**）

**D-A · 「Inspector 靠什么判断 V2 未启用」—— 四方，四个不同答案**（S-0012 已详录，此处只列指向）
- `code-owner-settings`（S-0005 F2）：**只能靠 `contextV2Bridge.getStatus()`**，且自陈这是「唯一无绕行方案」
- `code-owner-electron`（S-0010 丁）：**该方法在出厂默认态 reject 不 resolve**，8 字段 allowlist 在最需要它的那一态 **一次也构造不出来**；应改用 `unchainAPI.getStatus().memoryV2`（四值闭集 + 16 值闭集 reason，**今天已跨过 IPC 线**）
- `code-owner-shared-arteries`（S-0011）：**两者都不要，`getTree` 单次调用就够**
- `code-owner-chat-bubble`（S-0018）：**三种今天一个都没在用**

**`expert-architecture` 的重排（S-0025 甲）**：这四条 **不是同一问题的四种答案** —— 两条竞争同一问题（配置轴权威归谁）、一条正交（数据轴）、一条是 **测量而非主张**。**D7 被具体化，未被解开**：其定义性属性（无 owner）分毫未变，变的是从「不可定位」变成「可指派」。

**D-B · Q4 的答案被产品配置下的实跑推翻。** `code-owner-runtime`（S-0004）判「三态在 API 层完全可判别」；`code-owner-unchain`（S-0024）实跑 `store_owner=unchain` 后判 **在产品配置下不成立** —— 四个臂坍缩为同一条 `503 context_v2_unchain_read_unavailable`（S-0026 收窄：是 **四** 不是五，且四臂只落在 **两道** 内部门上，**四个 503 臂里没有一个是真正的「V2 不可用」态**）。

**D-C · `expert-architecture` 的五项「不成立」** —— 见第四节，全部进强制回应清单。

**D-D · 「在 modal 里加 tree view 就是造第 5 份拷贝」这一归因被消费端反驳。** `code-owner-chat-bubble`：**它在完全没有 tree view 的情况下已独立长出六个站点四种纪律** —— 故这是「**先建底层**」的理由，**不是「暂缓 tree view」的理由**。

**D-E · `code-owner-electron` 的预先反对（`Code Owner` 反对无自动通道）** —— 其反对任何「在 `contextV2Bridge.getStatus()` 上增加字段」的方案，理由是同样的信息在 `getMisoStatusPayload().memoryV2` 里已有且形式更好，**在一个零参数 count-free 已锁契约的安全面上加字段去表达隔壁已算好的状态，是制造第二个权威 —— 正是 D7 想避免的那件事本身**。
> **本庭的处置**：[闭庭门禁第 8 项](../../../codex/lifecycle/speech-protocol.md) 只把 `Expert` 的「不成立」与 `Dimension Owner` 的「反对」列为自动进入强制回应清单的两类，**`Code Owner` 的反对不在其中，本庭无权自行扩张该清单**。故：该反对 **原样进入本栏**；**本庭同时向 `chief-judge` 显式转达该角色「请求记入强制回应清单」这一请求本身**，由其决定是否采纳；**本庭并登记一条规则观察交 `codex`** —— 本案是「`Code Owner` 提出了一条其本人认为需要显式回应的结构性反对，而规则未给它通道」的第一个实例，门禁第 8 项的两类是否穷尽属 `codex` 待处置项。**本庭不在本案内自行补这个洞。**

---

### 三 · 已知缺口

| # | 缺口 | 状态 |
|---|---|---|
| G1 | 前案 `0000-0003-2026-0807` 裁定未到达（16 项强制回应待回应） | **仍开**。但 **9 名必到者全部独立表态：对本案可行性论证零杀伤**。`expert-architecture` 补机械依据：本案结论按「是否依赖 store owner 取值」可整齐三分，落「不依赖」类的覆盖全部四个待裁问题的可行性半边 |
| G2 | 本机 V2 store `entries=0` | **仍开，结构性。9 名必到者全部自标「正常态给不出取证」** —— 本案最大证据空洞，与前案同源未解 |
| G8 | `store_owner=unchain` 分支无人能跑 | **已闭合**。成因是 **harness 构造缺陷**，非环境非结构（E-0059 经 S-0027 复核，认定其归因「被证据支撑而非未经检验的推测」）。**本庭据此更正 S-0009/S-0016 的成因定性** |
| G10 | `get_tree` 对「从未存在过的 owner」的行为 | **已闭合**，且答案是坏消息：与「未启用」**不可区分** |
| G9 | 议案适用面（per-chat / 全局）未决 | **仍开，须 `chief-judge` 拍板**。`code-owner-settings` 判两个挂载点 **不是同一个议案**：side-menu 是接线，settings 那一路需要 **一条今天不存在的 owner-less 读路由**，并请求「若两者都要，请当作新的待裁问题而非实施细节」 |
| — | E-0057 不路由 | **本庭的裁量，已自我举报**（S-0019 第四节）。「运行时故障通知」在四类分级中 **没有位置**，且审查手段本身会改变被观察对象。交 `codex` |

---

### 四 · 强制回应事项（**5 项，须逐条显式回应方可裁定**）

**`expert-architecture`（S-0025）· 5 项「不成立」，每项的限定半句照录**：

① **「统一四态判定」作为单一处方不成立** —— 它同时收 L1/L2（该收）与 L3（不该收）。**「我不否定需要一个共享判定，那是对的；我只否定这个口径。」** 正确口径止于 L2（`(error) → {code, kind, parsed}`），L3 呈现语义保留分层。**该三分同时满足 `code-owner-chat-bubble` 的 B2 与 `code-owner-chat-core` 的原则性反对，并解释了它们为何看起来对立而实际正交。**

② **「四份/五份拷贝」这个计数不成立** —— 它把 L1/L2 的真重复与 L3 的假重复合并了。**「我不否定重复存在 —— 它比四份多；我否定的是这个数所支持的处方。」** **错误的度量直接产出了错误的处方。**

③ **`code-owner-electron` 重述的隐含量级结论部分不成立** —— **「我确认其事实半边全部成立」**（`memoryV2` 已过 IPC 线、约 6 行、只有一个既有消费者，其第三次独立复核）。**只否定量级结论**：`memoryV2` 是 **进程全局**，答不了本案每一个消费者都在问的 per-`ownerChatId` 问题，**故它不能是那个单一状态源**；「认领契约」是把 15 字段诊断面升为产品面，**是单向门**；且放行需要另一个 owner 同意，**而那个 owner 已把此事列为自己的前置** —— **D8「三方主张全部正确、合起来无人负责」在本案的第二次出现**。

④ **`code-owner-shared-arteries` 提的模块落点不成立（落错一格）** —— **「我不否定它认领，也不否定它是最合适的 owner 之一；我只否定这个目录。」** `bridges/` 的定义性属性是「不校验、不持状态、不加任何自己的东西」且由其自己的测试守护；**落 `src/SERVICEs/context_v2_state.js`，与 `boot_readiness.js` 同级**。

⑤ **「零改动分布 ⇒ 本案便宜」这个推论不成立** —— **「我不否定任何一份『0 处必须改动』的报告 —— 它们各自都对。」** 五份「零改动」条件不相交，**缺的那一块恰好就是无主构件**。

**`expert-llm`（S-0045）· 无「不成立」**，判 **有条件成立**（C1~C5）。
**`Dimension Owner` 反对：无。** 四个组织维度 **均未被覆盖**，理由见门禁第 8 项。

---

### 五 · 风险

**R1 · 11 条单向门**（S-0025 正文五）。其中 `expert-architecture` 主动点名 **唯二「实施时最省事的做法恰好是错的，且错了没有任何信号」**：**挂载接口追加第三个位置参数**（两个待送值都是合法 chat id 形状的字符串，JS 位置错位静默；**今天破坏面为零是一个会过期的窗口**）与 **`ownerChatId` 改成跟随活动会话**（错主在链路上不可检测）。

**R2 · 出厂默认态下不可行**（S-0004 条件 1 / S-0010 FE1）—— 改 `build_feature_flags.json` 要重算两个 sha256 并过双指纹门，**那是 rollout 议案不是「加一个 view」**。

**R3 · Windows 结构性不可用**（S-0010 FE7）—— win32 下 ceiling 压回 `shadow`、readiness 恒 `degraded`、readiness 门 **拦下每一次 `getTree`**。**与 R2 是两个独立原因，堵住一个不解决另一个。**

**R4 · 跨仓契约钉死点** —— `MemoryEntryKind` 是跨仓 enum；`expert-architecture` 判 **今天不建归一层**（`pupu_legacy` 形状结构性不可达，为死形状建归一层会破坏三个活消费面），**若将来必须归一，落 sidecar 不落 renderer/main**。

**R5 · 载荷无上界，且是两个方法不是一个** —— `getTree` 与 `listEntries` 均无分页参数（S-0061 认定，且其明确 **「这对封顶议题是加强不是削弱，请勿因 E-0032 判未验证而连带下调该关切」**）。叠加 **两道 10,000 界**（PuPu `_MAX_LIFECYCLES` 与 unchain `_MAX_LIST_SCAN`，**两者异常都不是 `MemoryV2Error` 子类，故都落在同一个 500 `context_v2_failed` 出口**，S-0093）—— **到达上界时用户看到的是错误，不是部分树**。

**R6 · 议案核心对象可能不存在** —— folder 不自动物化，无 folder 则 tree **退化为扁平列表**（E-0061 经 S-0028 复核，认定双向命题 **机制性成立**）。**但 S-0094 补一条相反方向的事实**：curator 晋升路径 **会** 调用 `create_folder`，**故 folder 条目并非只能由显式用户动作产生**。**该事实对 `expert-llm`「扁平是稳态」与 `code-owner-unchain`「当且仅当」均有影响，须由二者各自重排 —— 本庭不代判。**

---

### 六 · 待 `chief-judge` 处置的 7 项（本庭登记，防止在裁定中沉底）

1. **G9 · 议案适用面**（per-chat / 全局二选一）—— `code-owner-settings` 请求当作前置拍板，非实施细节
2. **S-0018 请求 1** —— 要求本庭改写 `FRAMING` 甲 的措辞；本庭 **拒绝自行处置并上呈**（S-0021），`procedural-judge` **不接手、不预表倾向**（R-0001）
3. **`code-owner-electron` 的强制回应清单诉求**（D-E）
4. **「登记转录 ≠ 命令实际输出」模式现已第十次出现** 的后续处置 —— 本庭 **不主张重审**；`procedural-judge` 三度 **显式不采为射程依据且不裁**
5. **四项 side case 候选**（`.js`/`.cjs` 双胞胎零执行 · 双 worktree 根 · 两道 10,000 界 · `vector_status` 恒 `degraded`）
6. **`expert-llm` 与 `code-owner-unchain` 的重排** —— 「扁平是稳态」升格支柱失效后是否仍成立（三方均不代判）
7. **本庭四项自我举报 + 第五项**（见下）

---

### 七 · 本庭自身的失范留痕（一并上呈，不隐去，不打包淡化）

1. **E-0006 锚在不执行的代码上**（S-0006）—— 逐段核了「代码在不在」，没核「哪一段会被执行」
2. **归档脚本以标题子串判类，误标 E-0039**（S-0016）—— 本次方向是多路由（浪费），**同一缺陷的反方向是漏路由，直接违反门禁 10 且无人察觉**
3. **派遣 `procedural-judge` 时要求其自行写入 `ruling.md`**（S-0023）—— 与其角色定义冲突，**其拒绝执行并指出；归档权与裁定权分离是刻意设计，本庭若得逞，破坏的正是这条分离**
4. **两次复述未经复核的结论散文**（S-0030 第一节 · S-0095 第一节）—— **第一次发生后已留痕，第二次仍然发生**
5. **用「结论方向不翻转」描述缺陷轻重** —— `procedural-judge` 在 R-0003 明确 **拒绝** 把它当作放行理由（**「『方向是否翻转』本席一次也没有问，它不是本席的判准」**），并给出可复核的三问替代。**这构成对本庭既往表述习惯的一次纠正，本庭接受并登记。**

**本庭请 `codex` 就上述五项一并作合法性审查。** 归档而非无声修补的理由与前案相同：**主持人是本案唯一不受其他角色审查的环节。**

---

### 八 · 一句必须放在最后的区分（`expert-architecture` 请求，本庭照录）

> **议案问的「新增一个 tree view 在技术上能不能做」—— 可以被硬地回答，答案是能。**
> **议案默认的「这个 tree view 显示出来的是一棵树」—— 本案的证据结构上无法回答。**
> **二者被议案的措辞合并了。本案能给出的最强结论是「管线形状可行」，不是「tree view 可行」。**

**不写这条区分，裁定会看起来比证据更硬** —— 而本案已有过同类错误的 **三重发作**（本庭 E-0006 锚在不执行的代码上 · `code-owner-runtime` 的 Q4 跑在不执行的代码上 · `code-owner-chat-bubble` 三个消费者的测试建在生产不产出的载荷形状上）。**第四次不必再发生。**
