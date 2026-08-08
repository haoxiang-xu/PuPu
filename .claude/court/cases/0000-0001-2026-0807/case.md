---
case_id: 0000-0001-2026-0807
title: Memory V2 产品面待裁事项
track: full
status: terminated
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T16:01:07-07:00
updated_at: 2026-08-07T17:05:00-07:00
---

# Memory V2 产品面待裁事项

`chief-judge` 提出。议案依据：`docs/architecture/memory-v2-claude-handoff-2026-08-07.md`（交接文档，**当前未入库**）。

Memory V2 的地基与生产 active 接线已完成，产品闭环与收尾未完成（文档自评 P0 总体约 70%，其中 UI/Trace/Inspector 65%）。本案要裁的不是"要不要做 Memory V2"，而是 **它的产品面上还有哪些没定的事，各自定成什么样**。

## 待裁问题

`chief-judge` 直接提出：

- **Q1** Memory V2 在 trace chain 中如何体现？现有 presenter 已支持 Complete/Partial/Legacy/Unavailable、context pressure、checkpoint/artifact/handoff ref、折叠 Curator 子树、candidate/review/promotion 状态 —— 这套够不够，缺什么，哪些是噪音
- **Q2** 每一个 chat 的 `Inspect Memory` UI 要不要优化，优化成什么形态？当前 V2 chat 打开它看到的是 V1 空向量
- **Q3** UI Testing modal 要不要为 Memory V2 加东西？加什么
- **Q4** 除上述之外，产品面还有哪些未定项 —— 由各出庭角色从自己的边界内补出，不由提出者预先穷举

从议案依据中机械读出、属于产品面且尚未裁定的事项（登记为待裁，不预设结论）：

- **Q5** V2 Inspector 是否按 chat admission 分流（Legacy → 现有 PCA modal，V2 → 新 Workspace Inspector）
- **Q6** 是否新增严格 scope-bound 只读 `getTaskState` 四层契约（Flask route → Electron service/IPC → preload → renderer bridge）。**这是新增 IPC 契约，是本案强制 Full 的触发条件之一**
- **Q7** 是否新增 scope-bound `listArtifacts` 契约，还是仅从 journal/entry/handoff 已披露 refs 打开 artifact
- **Q8** empty state 如何区分「V2 正常但尚无 entry」与「V2 unavailable/partial」
- **Q9** 命名债务（`memory_agent_settings.js`、`memory_v2_unchain_agent_factory.py`、"Memory Agent" 文案）是否清理、何时清理。**约束：清理不得重新引入 Builder 卡片或 recipe 节点**
- **Q10** PuPu 旧 fallback 实现（`memory_v2_toolkit.py` / `memory_v2_curator.py` / `memory_v2_workspace_adapter.py` / `memory_v2_context_adapter.py` 及 `unchain_adapter.py` 内的 legacy 构建路径）何时物理删除

## 必到角色与交付

**传唤第一层 · 路径边界机械命中**（8 个 `Code Owner`，命中处数见 `record.md` 的 `FRAMING`）：

- `code-owner-unchain`: `ASSESSMENT`
- `code-owner-runtime`: `ASSESSMENT`
- `code-owner-electron`: `ASSESSMENT`
- `code-owner-chat-bubble`: `ASSESSMENT`
- `code-owner-shared-arteries`: `ASSESSMENT`
- `code-owner-devtools`: `ASSESSMENT`
- `code-owner-chat-core`: `ASSESSMENT`
- `code-owner-agents`: `ASSESSMENT`

**传唤第一层 · 触发条件命中**（5 个 `Expert`）：

- `expert-architecture`: `ASSESSMENT` — 跨 8 个 code-owner 边界；触及 PuPu↔unchain 跨仓库接口；Inspector 的落位
- `expert-security`: `ASSESSMENT` — 新增 IPC/bridge 面；Vault 与 secret 不进 journal/Trace/memory 的边界
- `expert-llm`: `ASSESSMENT` — `memory_propose` tool schema 与 proposal policy；long-term recall 作为不可信引用内容进入 context 而不进 system/developer prompt；Trace 帧语义
- `expert-ux`: `ASSESSMENT` — Inspector 与 Trace 的布局层级、交互状态、empty state
- `expert-qa`: `ASSESSMENT` — 本案改动的回归面、focused 测试构成、`.js`/`.cjs` 对等

**未命中，不进必到名单**（记录理由，供第二层认领期与第三层门禁复核）：

- `expert-business` — 触发条件五项（定价 / 授权 / 变现 / 分发曝光 / 首次体验留存 / 对外发布）均未在本案范围内命中。本案不含发版动作
- `dimension-owner-*` ×4 — 评估对象是「组织变更议案」，本案不是组织变更
- `task-owner-release-certification` — task 名 `release-certification` 未在议案中出现；本案不跑发布认证
- `knowledge-owner-*` ×4 — 各自知识库路径均未命中

## 已知缺口

- **议案依据本身未入库。** `docs/architecture/memory-v2-claude-handoff-2026-08-07.md` 当前是 untracked 文件，且 `docs/**` 依 [A-009](../../../codex/adaptations.md#a-009--显式无-owner-清单) 显式无 owner。本案的主要证据没有 owner 为其真实性背书 —— 引用它的主张须自行核对到代码或 DB
- **跨会话闭环未证明。** 本机 official store 实测 `entries=0`、`candidates=0`、`consolidation_jobs=0`、`promotion_proposals=0`。任何关于"用户在 Inspector 里会看到什么"的判断，目前都没有真实数据支撑
- **代码情报索引落后于 HEAD**（议案依据 §12 记录，且增量 analyze 曾遇 `file_fts` inconsistency）。依赖调用图取证的角色须先确认索引新鲜度，不得把旧图当当前事实

## 文件索引

- [发言记录](record.md)
- [证据台账](evidence.md)
- [裁定与授权](ruling.md) — R-0001 中止
