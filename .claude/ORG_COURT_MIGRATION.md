# Org Court Migration — 全组织改法庭制的迁移映射

**状态**: **历史迁移档案，已执行且已被后续规则取代。不得再次作为执行清单。** 2026-08-07 的组织迁移已完成；现行法典在 [`.claude/codex/`](codex/README.md)，常驻操作入口在 [`.claude/CLAUDE.md`](CLAUDE.md) 与 [`case` skill](skills/case/SKILL.md)。

本文中的“三层传唤”“机械命中即必到”“名单只增不减”等措辞只解释当时设计。自 2026-08-09 起，边界命中只产生候选，所有 agent / role instance 由 `chief-judge` 逐项批准；证据使用最小决策集合、16% 首批抽查与 Chief-only 续查。历史测量与角色映射保留，不具现行程序效力。

**原设计稿**: `/Users/red/Desktop/agent_team_design.md`（本地，不入库）。本文只保留当时 PuPu + unchain 的迁移映射与测量证据。

**位置说明**: 本文件放在 `.claude/` 顶层而非 `.claude/agents/` 下，因为 `.claude/CLAUDE.md` 的漂移检查与 `org-court` 的现状测量都对 `.claude/agents/*.md` 做 find/grep，放进去会被误计为一个 agent。

---

## 一、所有权覆盖审计（2026-08-05 实测）

把所有权边界写成**机器可判定**的形式（传唤第一层的前提），第一件暴露出来的不是映射关系，而是**现有组织的所有权真空**。

边界数据来源：从现有 11 个 charter 中实际提取的路径声明，未经推测补全。`pupu-ux-designer` 声明的整个前端不计入——它在新模型中成为 `expert-ux`，边界形式是触发条件而非路径。

### 起点

```
PuPu 生产源文件（排除测试）:  603
落在已声明边界内:              402
无主:                          201
覆盖率:                        66%
```

**关键发现：真空区正是最活跃的开发区。** 近 60 天改动最频繁的生产文件 **Top 15 全部无主**——`select.js` 23 次、`preload/channels.js` 21 次、`theme_semantic.js` 20 次、`boot_overlay.js` 20 次、`main/ipc/register_handlers.js` 18 次。

### 66% 这个数字的真实含义

每个 dev charter 都载有同一段"公共动脉守门规则"，声明 `chat_storage` / `api.*` facades / `runtime_events` / `ConfigContext` / BUILTIN 核心原语归 `pupu-cto` **守门**：dev 可以提议，但不得自行合并。

**守门 ≠ 所有权。** CTO 是审批闸，不是 owner。这些文件的真实状态是**有人管、无人拥有**——无人负责日常演进，无人积累关于它们的记忆。这正是 `select.js` 改了 23 次却无主的原因。

而 `pupu-cto` 在新模型下消失，守门权没有承接者。100% 覆盖必须一并解决这件事（见第四节 `code-owner-shared-arteries`）。

### 终点（本文件第三、四节的分配方案实测结果）

```
PuPu:     614 / 614 = 100%   （含 src/locales/*.json）
unchain:  295 / 295 = 100%
合计:     909 个生产文件，零重叠，零遗漏
```

验证方式：每个 owner 的边界写成 regex，逐对做交集检测（确认零重叠），再对全量文件求并集补集（确认零遗漏）。

---

## 二、角色映射（24 → 29）

### `Expert` ×7

| 新角色 | 来源 | 迁移要点 |
|---|---|---|
| `expert-architecture` | `pupu-architect` | 最终技术权威 → 鉴定意见 + 强制回应；工作切片权移交 `Chief Judge` |
| `expert-security` | `pupu-security-expert` | 严重性定级 → 鉴定意见；发布安全签字 → 鉴定意见 |
| `expert-llm` | `pupu-llm-expert` | **veto → 强制回应**（可被推翻，不可被静默跳过） |
| `expert-business` | `pupu-coo`（拆） | GO/NO-GO **上收 `Chief Judge`**（商业取舍不是专业鉴定） |
| `expert-product-growth` | `pupu-coo` + `pupu-growth-ops`（判断部分） | |
| `expert-ux` | `pupu-ux-designer`（判断部分） | 边界从"整个前端"改为触发条件，消除与全体 code-owner 的重叠 |
| `expert-qa` | `pupu-qa-tester`（判断部分） | 验收职能移交 `Acceptance Inspector` |

### `Code Owner` ×11

| 新角色 | 来源 | 文件数 |
|---|---|---|
| `code-owner-chat-core` | `pupu-dev-chat-core` | 68 |
| `code-owner-chat-bubble` | `pupu-dev-chat-bubble` | 33 |
| `code-owner-settings` | `pupu-dev-settings` | 79 |
| `code-owner-toolkit` | `pupu-dev-toolkit` | 39 |
| `code-owner-agents` | `pupu-dev-agents` | 37 |
| `code-owner-electron` | `pupu-dev-electron` | 49 |
| `code-owner-backend` | `pupu-dev-backend`（PuPu 侧） | 132 |
| `code-owner-unchain` | `pupu-dev-backend`（unchain 仓库侧） | 295 |
| **`code-owner-ui-primitives`** | **新建** | 85 |
| **`code-owner-shared-arteries`** | **新建**（承接 CTO 守门权） | 42 |
| **`code-owner-devtools`** | **新建** | 39 |

### `Task Owner` ×4

`task-owner-growth-patrol`（`pupu-growth-ops` 执行部分）· `task-owner-release-certification`（`pupu-release-full-test`）· `task-owner-market-research`（`pupu-market-analyst` 执行部分）· `task-owner-ai-investigation`（`pupu-ai-researcher`）

### `Knowledge Owner` ×3

`knowledge-owner-mcp-store`（`mcp-store-curator`）· `knowledge-owner-market`（`pupu-market-analyst` 知识部分）· `knowledge-owner-growth-metrics`（`pupu-growth-ops` 知识部分）

### 程序角色 ×4（全新）

`speaker-of-the-house` · `procedural-judge` · `evidence-examiner` · `acceptance-inspector`

四者均**不拥有记忆**。这与 2026-08-04 CEO 所立 org-court 宪法第 4 条（"不需要 memory 的职能做成 skill，不做 agent"）**存在冲突**，属 blocking 未决项（见第七节）。

### 消失 ×1

`pupu-cto` — 新模型无中层管理层。技术方向权 → `expert-architecture`；派发权 → `Speaker of the House` 的传唤机制；**公共动脉守门权 → `code-owner-shared-arteries`**。

### 一人切三层

`growth-ops` / `market-analyst` / `ux-designer` / `qa-tester` 都被切成 **执行（task-owner）· 知识积累（knowledge-owner）· 判断（expert）** 三层。

- **收益**: context 纯净——跑巡船脚本的 agent 不需要装载商业判断的记忆
- **代价**: 原本 agent 内部完成的"数据 → 判断"变为跨 agent 传话，信息在交接处流失
- **尚无实测证据**表明这些 agent 当前因职责过载而变钝；这项拆分**未经证据支持**，执行前应先取证

---

## 三、边界声明（传唤第一层依据）

已验证：**零重叠、零遗漏**。

### PuPu 仓库

| Owner | 边界 |
|---|---|
| `code-owner-chat-core` | `src/PAGEs/chat/**`<br>`src/COMPONENTs/{chat-header,chat-input,chat-messages,side-menu}/**`<br>`src/SERVICEs/{chat_export,composer_prefill,attachment_storage,streaming_message_chunks,streaming_message_store,queued_turn_outbox,turn_mutation_outbox}.js` |
| `code-owner-chat-bubble` | `src/COMPONENTs/chat-bubble/**` |
| `code-owner-settings` | `src/COMPONENTs/{settings,diff,init-setup,memory-inspect,workspace}/**`<br>`src/SERVICEs/{settings_repository,settings_secret_adapter,settings_quit_drain}.js`<br>`src/SERVICEs/{provider_credential_persistence,provider_secret_migration,provider_secret_status,custom_provider_store,model_catalog_refresh,memory_agent_settings,feature_flags}.js`<br>`src/SERVICEs/computer_use_*.js` |
| `code-owner-toolkit` | `src/COMPONENTs/toolkit/**`<br>`src/SERVICEs/{mcp_install,mcp_toolkit_store,custom_mcp_icon_store,default_toolkit_store}.js`<br>`src/SERVICEs/{toolkit_auto_approve_store,toolkit_catalog_refresh,toolkit_id_aliases,tool_confirmation_cache_policy}.js`<br>`src/SERVICEs/{plugin_presentation,plugin_skill_sync,skill_pack_import}.js` |
| `code-owner-agents` | `src/COMPONENTs/agents/**`<br>`src/SERVICEs/agent_folder_storage.js` |
| `code-owner-electron` | `electron/**` |
| `code-owner-backend` | `unchain_runtime/**` |
| `code-owner-ui-primitives` | `src/BUILTIN_COMPONENTs/**` |
| `code-owner-shared-arteries` | `src/SERVICEs/api*.js`<br>`src/SERVICEs/{bridges,runtime_events,chat_storage,prompts}/**` + `src/SERVICEs/chat_storage.js`<br>`src/CONTAINERs/**`<br>`src/SERVICEs/{progress_bus,toast,toast_bus,command_registry,console_logger,system_prompt_sections,boot_progress,boot_readiness}.js`<br>`src/COMPONENTs/boot-overlay/**`<br>`src/locales/**` |
| `code-owner-devtools` | `src/PAGEs/demo/**`<br>`src/COMPONENTs/ui-testing/**`<br>`src/SERVICEs/test_bridge/**`<br>`src/electron/**` |
| `knowledge-owner-mcp-store` | `src/SERVICEs/mcp_toolkit_registry.json`<br>`src/SERVICEs/plugin_store_curation.json` |

### unchain 仓库

| Owner | 边界 |
|---|---|
| `code-owner-unchain` | `unchain:**`（整个仓库，排除 `tests/`） |

边界为整仓而非 `src/unchain/**`，因为 `verify_models.py` 与 `examples/` 落在包目录之外。

**可细分轴线（暂不拆分）**: `memory/`(50) · `context/`(38) · `tools/`(22) · `providers/`(19) · `kernel/`(18)。设计稿允许一个代码库拆多个 code-owner（`code-owner-llm-agent-memory` 即此类），待有实测证据表明单 owner 过载时再拆。

### `Expert` 的边界（触发条件形式）

| 角色 | 触发条件 |
|---|---|
| `expert-security` | 议案涉及 IPC / 网络请求 / 密钥与凭据 / 第三方代码执行 / 自动更新 |
| `expert-llm` | 议案涉及 prompt 组装 / 检索参数 / tool schema / 流式帧语义 / 模型选择 |
| `expert-architecture` | 议案跨两个及以上 code-owner 边界，或触及跨仓库接口 |
| `expert-ux` | 议案涉及 布局 / 主题与 isDark / 间距与排版 / 可访问性 |
| `expert-business` | 议案涉及 定价 / 授权协议 / 变现 / 对外发布 |
| `expert-product-growth` | 议案涉及 分发 / 首次体验 / 留存 / 增长指标 |
| `expert-qa` | 议案涉及 测试策略 / 回归面 / 发布门禁 |

---

## 四、三个新建 owner 的依据

以下为**建制变更**，须过 org-court 裁定，不可直接创建。

### `code-owner-ui-primitives` → `src/BUILTIN_COMPONENTs/**`（85 文件）

33 个子目录、85 个生产文件当前完全无主，且含**全仓改动最频繁的文件**（`select/select.js`，60 天 23 次）。`mini_react`（自研 router/storage，9 文件）、`theme`（语义 token，12 次改动）、`input`（9 文件）都在此。

参见记忆 `mini-ui-component-source`：这些组件从 `mini_ui` 移植且移植过程中会丢行为——这正是需要一个**积累记忆的 owner** 的场景，而非 skill。

**`flow_editor` 归此 owner**，不归 `code-owner-agents`：实测其消费者有三个（`COMPONENTs/agents`、`CONTAINERs/config`、`PAGEs/demo`），是真正的通用原语。若划给单一消费者，BUILTIN 边界即被开口，后续每个消费者都可援例切走一块。

### `code-owner-shared-arteries` → 公共动脉（42 文件）

**这是 `pupu-cto` 消失后守门权的承接者。** 覆盖 `api.*` facades、`bridges/`、`runtime_events/`、`chat_storage`、`ConfigContext`、`boot_*`、`toast`/`progress_bus`/`command_registry`、`src/locales/`。

公共动脉的共同特征是**多方消费、单点定义**，正需要一个中立守门人。当前它们由 CTO 守门但无人拥有，是 66% 缺口中性质最严重的一块——改动频繁（`theme_semantic.js` 20 次、`container.js` 13 次、`boot_overlay.js` 20 次）却无人积累记忆。

`src/locales/**`（11 个语言文件）暂并入此 owner。备选方案是单设 `knowledge-owner-i18n`——多语言内容确有知识库性质，且已有 `i18n-coverage` skill。待裁。

### `code-owner-devtools` → 开发期设施（39 文件）

`src/PAGEs/demo/**`(20) · `src/COMPONENTs/ui-testing/**`(13) · `src/SERVICEs/test_bridge/**`(6) · `src/electron/**`。

**另一种同样有效的结论是：显式声明这些无需 owner。** 但必须显式——否则传唤第三层的闭庭门禁会对它们反复报警。设立 owner 与显式豁免，二者择一，不可留空。

---

## 五、跨仓库路径歧义（须在边界声明中解决）

`pupu-dev-backend` 的 charter 中写有 `src/unchain/*`。但 **PuPu 仓库根本没有 `src/unchain/` 目录**——该路径指的是 unchain 仓库中的包目录。

**同一个 glob 在两个仓库里含义不同。** 新模型的边界声明必须带**仓库限定符**：

```
pupu:src/SERVICEs/**
unchain:src/unchain/**
```

否则传唤第一层的机械匹配会在跨仓库议案上产生误命中或漏命中。这是 `code-owner-backend` / `code-owner-unchain` 拆分的另一个理由——拆开后各自的仓库归属不再有歧义。

---

## 六、memory 继承

现有 27 个 `.claude/agent-memory/*/` 目录，约 1MB 积累。体量前五：`pupu-cto` 196K · `pupu-architect` 172K · `pupu-llm-expert` 132K · `pupu-dev-backend` 96K · `pupu-security-expert` 96K。

**未设计**。需要处理的情形：

1. **一对一改名**（`pupu-dev-chat-bubble` → `code-owner-chat-bubble`）：直接迁移
2. **一拆多**（`pupu-growth-ops` → task-owner + knowledge-owner + expert 三份）：需人工判读分派，无法机械切分
3. **岗位消失**（`pupu-cto` 196K，体量最大）：分散到 `expert-architecture` / `code-owner-shared-arteries` / 各 code-owner，还是整体归档为只读判例
4. **三个新建 owner 无历史记忆**：其负责区域的历史只存在于 git log 与 CTO 的记忆中；是否需要一次性的记忆播种（从 CTO 记忆中析出相关部分）
5. 程序角色四者**不拥有记忆**，无继承需求

---

## 七、未决项

| # | 事项 | 阻塞级别 |
|---|---|---|
| 1 | **程序角色四人无记忆，与 org-court 宪法第 4 条冲突**（"不需要 memory 的职能做成 skill，不做 agent"）。需改宪法，或将四者实现为 skill | **blocking** — 涉及已生效宪法 |
| 2 | **三个新建 owner 须过 org-court**（`ui-primitives` / `shared-arteries` / `devtools`） | **blocking** — 建制变更 |
| 3 | memory 继承方案，尤其 `pupu-cto` 的 196K 与三个新 owner 的记忆播种 | **blocking** — 迁移前必须定 |
| 4 | `src/locales/**` 归 `shared-arteries` 还是单设 `knowledge-owner-i18n` | non-blocking |
| 5 | `devtools` 设 owner 还是显式豁免 | non-blocking — 但必须显式，不可留空 |
| 6 | `department` 切法：按领域 vs 按角色类型 | non-blocking — department 仅分类，agent 无感知 |
| 7 | `code-owner-unchain` 是否细分（memory / context / tools / providers / kernel） | non-blocking — 待过载证据 |
| 8 | 一人切三层缺乏证据支持，执行前需取证 | non-blocking |

---

## 八、固有特性（非缺陷，需知悉）

- `Chief Judge` 是 human 角色，Express 与 Full 档的 case 会因 CEO 不在场而挂起。Fast Track 免裁定可缓解一部分。**并行度提升了，吞吐仍受限于 CEO 的在场时间**
- 编制从 24 增至 29。按 org-court 宪法第 5 条（编制数量非问题，唯一边际成本是路由面），此项膨胀本身不构成问题——**前提是三层传唤机制确实取代了 description 猜测**。三层传唤的第一层是机械匹配，其成本不随 agent 数量线性增长，这是编制可以放开的前提
- **共同所有权需要显式表达**：`electron/shared/` 当前被 `pupu-cto`、`pupu-qa-tester`、`pupu-dev-electron` 三方声明，这是有意的（IPC 契约为公共动脉）。传唤第一层天然支持多 owner 命中（都传唤），但 charter 必须写明，否则第三层闭庭门禁无法判断"少了谁算缺席"

---

## 九、已执行的修正

**2026-08-05 · `pupu-dev-electron` 边界扩为 `electron/**`**

原声明为 `electron/{main/services,preload/bridges,preload/stream,shared}/`，漏掉 `main/ipc/`、`main/window/`、`main/index.js`、`preload/channels.js`、`preload/index.js`、`preload/test_bridge_preload.js`。补回 6 个生产文件，近 60 天累计改动 **66 次**（`channels.js` 25 · `register_handlers.js` 22 · `index.js` 10 · `main_window.js` 6 · `preload/index.js` 3）。

这是**修正而非扩权**：该 charter 的 description 与正文本就写明 "adding or changing an IPC channel" 属其职责，只是路径清单漏了，因而无需过 org-court。

本节以外的所有分配**均未执行**，仅为方案。
