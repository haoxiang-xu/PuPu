---
case_id: 0000-0008-2026-0808
title: Memory Inspector 新增 V2 Tree View
track: full
status: awaiting-ruling
phase: motion
parent_case_id: 0000-0003-2026-0807
relation: non-blocking
created_at: 2026-08-08T16:23:34-07:00
updated_at: 2026-08-09T02:30:00-07:00
---

# Memory Inspector 新增 V2 Tree View

CEO 提议：Inspector 里 vector view 保持现状，新增一个 tree view 呈现 V2 记忆。**本案 `phase: motion` 只论证能不能做**（技术可行性、有无结构性阻塞）；能做之后再另开 `phase: proposal` 论证怎么做——**任何具体视觉/交互设计（布局、配色、组件形态、空态文案等）都不在本阶段讨论范围内**，留到方案庭审，届时按触发条件传唤 `expert-ux`。

承接自 `0000-0003-2026-0807`（现状态 `awaiting-ruling`）：该案已识别 Q0（四态判定归谁、落哪一层，无单一状态源）与 Q2/Q5 接缝（三个 owner 各自主张都正确，合起来无人拥有）两处结构缺口，本案会直接踩中这两处，故列 `parent_case_id`。暂标 `non-blocking`——可行性论证可独立推进，若庭审判定 0003 的裁定是前置阻塞，届时改标或并入。

## 待裁问题

- **Q1（管线完整性）**：`/context/v2/memory/spaces/<space_id>/tree` 端到端管线是否完整可用？我（书记员）自查已确认这条链路存在：后端 `route_memory_v2.py::context_v2_tree` → `memory_v2_store.py::get_tree`（按 `path`/`parent_path` 组出真实父子树）→ 主进程 `electron/main/services/unchain/service.js::getContextV2Tree` → IPC `CHANNELS.CONTEXT_V2.GET_TREE` → preload bridge → `src/SERVICEs/bridges/context_v2_bridge.js::getTree`，且 `electron/tests/main/context_v2_service.test.cjs` 已覆盖，但 **`src/COMPONENTs/` 下零消费者**。已知一处疑点：`getTree` 需要 `ownerChatId`，而 `0000-0003-2026-0807` 的证据显示 modal 今天拿不到这个值（只有派生的 `sessionId`）——这是否卡死本议案，需要 `code-owner-settings` / `code-owner-electron` 核实
- **Q2（与 0003 案已识别缺口的关系）**：在同一个 modal 内新增第二个 view，是否直接踩中 0003 案的 Q0（判定归谁）与 Q2/Q5 接缝（谁来管这个新入口/新数据形状）？若是，是否构成本议案进入方案庭审的前置阻塞
- **Q3（"vector view 保持现状"的前提核实）**：我已自查代码——V1 的 `/memory/projection` 走 `memory_factory` 的旧向量集合逻辑，与 V2 store 无关，不是 store-owner 感知的；V2 侧目前只有 `context_v2_search`（语义搜索，返回排序列表），**没有找到等价于 `/memory/projection` 的二维散点坐标生成逻辑**。"vector view 保持现状"这个前提是否成立？若不成立，"保持现状"具体该如何界定——V1 view 完全不动、那 V2 数据被选中时 vector view 该呈现什么？
- **Q4（空态/未启用态的可判别性，不涉及呈现设计）**：本机 V2 store 现为 `entries=0`（继承自 0003 案已知缺口）。`get_tree` 在「store 为空」与「`store_owner=off`（V2 未启用）」两种情况下的返回形状是否可判别？只问 API 层面能不能区分，不问该怎么显示

## 必到角色与交付

- `code-owner-settings`: `ASSESSMENT` — `src/COMPONENTs/memory-inspect/**`，Inspector 承接方，Q1 的 `ownerChatId` 疑点
- `code-owner-runtime`: `ASSESSMENT` — `unchain_runtime/**`，`/context/v2/memory/spaces/<space_id>/tree` 端点行为、空态/未启用态返回形状（Q4）、V2 是否存在散点坐标生成逻辑（Q3）
- `code-owner-electron`: `ASSESSMENT` — `electron/**`，IPC channel 与 preload bridge 现状核实（Q1）
- `code-owner-shared-arteries`: `ASSESSMENT` — `src/SERVICEs/bridges/context_v2_bridge.js` 现状核实（Q1）
- `expert-architecture`: `ASSESSMENT` — 落位、与 0003 案 Q0/Q2/Q5 的关系是否构成前置阻塞（Q2）

以上是书记员按边界声明做的初步机械匹配，`speaker-of-the-house` 仍须跑完整三层传唤（含认领期与闭庭集合差检查）。**`expert-ux` 未列入必到**——本阶段不涉及任何视觉/交互设计内容，按其触发条件不应命中；若庭审中出现具体设计判断，届时补传或留到方案庭审。

传唤须遵 [A-012](../../../codex/adaptations.md)：必到角色多时分小批串行，不得再派生自己的勘察子 instance。

## 已知缺口

- `0000-0003-2026-0807` 仍是 `status: awaiting-ruling`，其 Q0/Q2/Q5 的裁定结果可能实质影响本案能否进入方案庭审
- 本机 V2 store `entries=0`，继承自 0003 案同一限制——无法就"有数据时长什么样"取证
- "vector view 保持现状"的技术前提未经 `code-owner-runtime` 权威核实，书记员的自查结论仅供参考，不构成证据

## 文件索引

- [发言记录](record.md) · [证据台账](evidence.md) · [裁定与授权](ruling.md)
- **闭庭**：`record.md#S-0101`（`SUMMARY`）。**闭庭门禁十一项已逐项确认全部满足**
- **法定必到 9 人全部交付**：立案 5 → 传唤第一层重跑 7（`#S-0003`）→ 传唤第三层 9（`#S-0006`）
- **证据 76 条，其中 75 条经 `evidence-examiner` 独立复核**（承重集合机械导出，六批 + 4 条须查类单查）
- **四份程序裁定**：R-0001（E-0051 射程）· R-0002（`chief-judge`，`expert-llm` 模型撤销）· R-0003（七条射程）· R-0004（E-0076 射程）。**9 条未验证证据全部「可采，射程受限」，13 项表述已重排**
- **强制回应事项 5 项**（`expert-architecture` 的「不成立」）待 `chief-judge` 逐条显式回应；**另有 7 项待处置事项** 见 `#S-0101` 第六节
