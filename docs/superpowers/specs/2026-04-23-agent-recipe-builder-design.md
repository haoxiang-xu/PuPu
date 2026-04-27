# Agent Recipe Builder — Design

**Date**: 2026-04-23
**Status**: Approved (brainstorming)

## Goal

为 PuPu 新增一套 **Agent Recipe** 系统：用户可通过可视化 Builder 组合保存多个命名 recipe（agent prompt + toolkits + subagent pool），在聊天时单选使用。Recipe 跟 character 系统平行、跟当前主 agent 行为兼容。

## Context

当前状态：
- PuPu 的主 agent 在 `unchain_runtime/server/unchain_adapter.py::_build_developer_agent` 中硬编码组合：所有 toolkits + 所有 `~/.pupu/subagents/*.{soul,skeleton}` subagents。
- 缺少用户级的"这个 agent 用哪些 tool / 带哪些 subagent"自定义入口。
- `AgentsModal` 的 "Agents" tab 显示 "coming soon" 占位。
- `src/BUILTIN_COMPONENTs/flow_editor/` 已有成熟节点图组件（pan/zoom、贝塞尔连线、自定义节点渲染、port 连接），为 Builder UI 提供现成基础设施。

UI 不做传统 workflow（有方向/顺序的 DAG），做**Hub-and-Spoke 组合图**：中心是 Agent 节点，四周挂 Toolkit 节点和 Subagent Pool 节点，边表示 "attach" 关系，无方向、无执行语义。

---

## Architecture

```
┌────────────── PuPu Frontend ──────────────┐
│  AgentsModal                              │
│   ├── "Characters" tab (既有)             │
│   └── "Agents" tab (新) ← Recipe 列表 +  │
│                          Hub-and-Spoke   │
│                          Builder         │
│                                          │
│  ChatInput / attach_panel                │
│   └── modal selector → 加第 4 类 Agents │
│       (单选 recipe，选了就隐藏 Tools)   │
└──────────────┬───────────────────────────┘
               │ POST /chat_stream_v2
               │   options.recipe_name
               ▼
┌────────── PuPu Backend (Flask) ──────────┐
│  recipe_loader.load_recipe(name)         │
│       ↓                                  │
│  unchain_adapter._build_developer_agent  │
│    ├─ 按 recipe.toolkits 过滤 toolkits   │
│    ├─ 按 recipe.toolkit.enabled_tools    │
│    │    过滤每个 toolkit 的 tools       │
│    ├─ subagent 来源切换                  │
│    │   recipe 模式：按 pool 组装       │
│    │   无 recipe：走现有 load_templates │
│    └─ 每个 subagent 再应用              │
│        disabled_tools 过滤              │
└──────────────────────────────────────────┘
```

**Recipe 是"覆盖层"**：recipe 说了算的地方按 recipe 走，没说的地方（workspace、运行时 model override、max_iterations override）由 options 补。

---

## Scope Split: unchain vs PuPu

此 plan 只动 PuPu。未来另起小 plan 把 `.soul`/`.skeleton` parser 迁进 unchain。本次定论：

| 东西 | 归属 | 理由 |
|---|---|---|
| `.soul`/`.skeleton` 格式 + parser | 当前 PuPu，后续迁 unchain | 纯 unchain 域概念，属于 framework-level 格式 |
| 目录扫描 + precedence + seeding | PuPu | 是 PuPu 的 UX 决策 |
| `.recipe` 格式 + loader | PuPu | 含 toolkit IDs 等 PuPu 专属字段 |

---

## Data Model

**文件位置**：
```
~/.pupu/
├── subagents/          （既有）
│   ├── Explore.skeleton
│   └── CodeReview.soul
└── agent_recipes/      （新增）
    ├── Default.recipe  ← 首次启动 seed
    ├── Coder.recipe
    └── Researcher.recipe
```

**扩展名**：`.recipe`（内容是 JSON，不带 `.json` 后缀，便于区分）

**Schema**：

```json
{
  "name": "Coder",
  "description": "Full-stack coding assistant",
  "model": "anthropic:claude-sonnet-4-6",
  "max_iterations": 30,

  "agent": {
    "prompt_format": "soul",
    "prompt": "---\nname: Coder\n---\nYou are..."
  },

  "toolkits": [
    { "id": "core",      "enabled_tools": null },
    { "id": "workspace", "enabled_tools": ["read", "grep", "write_file"] }
  ],

  "subagent_pool": [
    { "kind": "ref",    "template_name": "Explore",    "disabled_tools": [] },
    { "kind": "inline",
      "name": "CodeReview",
      "prompt_format": "skeleton",
      "template": { /* 完整 SubagentTemplate JSON */ },
      "disabled_tools": ["shell"] }
  ]
}
```

**字段语义**：
- `model` / `max_iterations`: `null` 表示跟系统默认。非 null 作为 recipe 默认，可被 options 临时 override。
- `agent.prompt_format`: 编辑器 view hint，不影响存储；`prompt` 字段始终是字符串。
- `agent.prompt` 特殊 sentinel `{{USE_BUILTIN_DEVELOPER_PROMPT}}`：等价于"走现有 `_DEVELOPER_PROMPT_SECTIONS`"。仅 `Default.recipe` 使用；用户 duplicate 后编辑时转换为实际展开值。
- `toolkits[].enabled_tools`: `null` = 该 toolkit 全启用；数组 = 白名单。
- `subagent_pool[].kind`: `"ref"` 引用 `~/.pupu/subagents/` 下的文件；`"inline"` 把完整 template 嵌进 recipe。
- `subagent_pool[].disabled_tools`: 在 template.allowed_tools ∩ recipe.toolkits 启用 tools 的基础上再扣除。

**有效 tool 计算**（subagent 最终可用工具集）：
```
effective = template.allowed_tools
          ∩ union(recipe.toolkits[i].enabled_tools ∪ all tools if null)
          − disabled_tools
```

**Name 约束**：
- 正则 `^[A-Za-z0-9_\- ]{1,64}$`（允许空格，如 "Code Reviewer"）
- 文件名 = `{name}.recipe`，保存时校验
- `Default` 不允许删除（但可编辑；提供 "Reset to Default" 删文件触发重新 seed）

---

## Builder UI

**入口**：`AgentsModal` 的 "Agents" tab（既有占位，这次点亮），跟 "Characters" tab 平行。

**布局**（tab 内）：
```
┌─Agents tab ──────────────────────────────────────────────┐
│┌─────────┬──────────────────────────┬──────────────────┐│
││ Recipe  │  FlowEditor canvas       │  Inspector       ││
││ List    │                           │                  ││
││         │   ┌─Toolkit─┐             │  当前选中节点    ││
││ ▸ Coder │   │ Core    │   ┌─────┐   │  的编辑面板     ││
││ • Rsrch │   └────┬────┘   │Agent│   │                  ││
││ • PM    │        ╲        └──┬──┘   │                  ││
││         │   ┌─Toolkit─┐      │      │                  ││
││ [+New]  │   │Workspace│  ┌───┴───┐  │                  ││
││         │   └─────────┘  │ Pool  │  │                  ││
││         │                 └───────┘  │                  ││
││         │  [+ Toolkit ▾] [+ Pool]... │                  ││
│└─────────┴──────────────────────────┴──────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**节点类型**：
- **Agent 节点**（中心，唯一，不可删；颜色跟其他节点区分）
- **Toolkit 节点**（每个 PuPu toolkit 一个）
- **Subagent Pool 节点**（图上最多 1 个容器节点；容器内部以 chips 形式呈现多个 subagent——对应 schema 里的 `subagent_pool[]` 数组，避免每个 subagent 一个节点导致 graph 爆炸）

**顶部 toolbar**：
```
[+ Toolkit ▾]   [+ Subagent Pool]   [Save]   [Duplicate]   [Delete]
```
- `+ Toolkit` 下拉列还没加的 toolkits
- `+ Subagent Pool` 已存在就灰掉

**Inspector 行为**（跟当前选中节点绑）：

| 选中 | 显示 |
|---|---|
| Agent 节点 | name / description / model dropdown / max_iterations / prompt 编辑器（Soul \| Skeleton tab 切换） |
| Toolkit 节点 | toolkit 名 + tool 勾选列表（勾上 → 写进 `enabled_tools`）|
| Subagent Pool 节点 | subagent 列表（每行：name / source badge / disabled 计数）+ `[+ Add]` |
| Pool 里单个 subagent | **ref 型**：来源文件只读 + 继承 allowed_tools + `disabled_tools` 勾选<br>**inline 型**：完整模板编辑器（soul/skeleton 切换 + 所有 SubagentTemplate 字段 + `disabled_tools`）|

**添加 subagent** 时弹 picker 对话框：
- Tab 1 **Import from file**：列 `~/.pupu/subagents/` 下所有 `.soul`/`.skeleton`
- Tab 2 **Author inline**：空白模板，soul/skeleton 任选

**Soul/Skeleton 编辑器切换**：
- 只改视图，存储始终是字符串
- Soul view：YAML frontmatter 表单化（name/description/allowed_tools 等字段做输入）+ 下方 markdown textarea 写 instructions
- Skeleton view：单一 JSON editor
- 切换前检测未保存更改，有则提示

**连接规则**（在 FlowEditor `on_connect` 里约束）：
- 合法：Agent ↔ Toolkit，Agent ↔ Pool
- 非法：Toolkit ↔ Toolkit，Toolkit ↔ Pool（过滤掉）
- 断开边 = 从 recipe 里移除该 toolkit/pool，但 pool 内部 subagent 数据不删（下次重连还在）

**保存行为**：
- 明确 **explicit save**；Save 按钮在 dirty 时高亮
- 离开未保存弹 confirm
- 不做 autosave（避免误改）

**Recipe 列表区**（左栏）：
- 扫 `~/.pupu/agent_recipes/*.recipe`
- 右键/hover 菜单：Rename / Duplicate / Delete（Default 不能 Delete）
- `+ New Recipe` → 弹名字输入框，创建空 recipe 并选中

---

## Chat Integration

**`attach_panel.js` 加第 4 个 Select**（沿用现有 `Select` 组件）：

```
[Model ▾]  [Tools (badge) ▾]  [Workspaces (badge) ▾]  [Agents ▾]
                                                         ↑ 新增
```

**规格**：
- **单选** Select（`filter_mode="panel"`，跟 Model 一致的 pill 样式）
- Options 来自 `GET /agent_recipes`
- Trigger 显示当前 recipe 名
- 默认值：`Default`

**Recipe 选中后联动**：
- **Tools selector 隐藏**（recipe 权威，避免概念冲突）
- **Model selector 保留**，展示 recipe.model 作为默认；用户改选等于临时 override（不写回 recipe）
- **Workspace selector 独立**（跟 recipe 无关）

**Payload**（`use_chat_stream.js` 拼 body）：
```js
{
  ...existing,
  recipe_name: selectedRecipe,    // null 表示"无 recipe"
  modelId,                         // 允许 override
  // toolkits 字段在选中 recipe 时由后端按 recipe 计算，前端不再发
  selectedWorkspaceIds,
}
```

**边界情况**：
- Recipe 引用的 toolkit 不存在（卸载） → 日志 warn，跳过
- Recipe 引用的 subagent `ref` 文件不存在 → 日志 warn，跳过
- 用户删掉当前 chat 选中的 recipe → 前端下次刷新落回 `Default`

---

## Backend Integration

**新增 `unchain_runtime/server/recipe_loader.py`**：
- `list_recipes()` → 轻量列表（用于前端 Agents selector）
- `load_recipe(name: str) -> Recipe | None` → 完整加载 + 校验
- 失败模式：坏的 recipe 跳过并 warn（跟 `subagent_loader` 一致，不 raise）

**新增 Flask 路由**（`routes.py`）：
```
GET    /agent_recipes             → [{name, description, model, toolkit_ids, subagent_count}, …]
GET    /agent_recipes/<name>      → 完整 recipe JSON（builder 编辑用）
POST   /agent_recipes             → 保存/新建
DELETE /agent_recipes/<name>      → 删除（Default 拒绝）
```

**`_build_developer_agent` 改造**（新参数 `recipe: Recipe | None = None`）：
```python
def _build_developer_agent(..., recipe: Recipe | None = None, ...):
    if recipe is not None:
        toolkits = _apply_recipe_toolkit_filter(toolkits, recipe.toolkits)
        templates = _materialize_recipe_subagents(recipe, ...)
    else:
        templates = load_templates(...)   # 现有行为
```

**`_materialize_recipe_subagents`**：
- `ref` 型 → 通过 `subagent_loader` 拿 template，apply `disabled_tools`
- `inline` 型 → 直接喂 subagent_loader 的校验层，通过就用，apply `disabled_tools`

**Recipe 的 agent prompt 怎么喂 developer**：
- 既有：`_DEVELOPER_PROMPT_SECTIONS` 模块化 sections + `{{SUBAGENT_LIST}}` 占位符
- Recipe 模式：`recipe.agent.prompt` 整段**替代** DEVELOPER_PROMPT_SECTIONS 拼出的 instructions（保留 `{{SUBAGENT_LIST}}` 替换）
- `prompt_format == "soul"`：直接作为 instructions
- `prompt_format == "skeleton"`：prompt 里是 JSON，取 `.instructions` 字段
- sentinel `{{USE_BUILTIN_DEVELOPER_PROMPT}}`：走 legacy `_DEVELOPER_PROMPT_SECTIONS` 路径

**Model override 优先级**（高→低）：
1. `options["modelId"]`（chat input 临时改）
2. `recipe.model`
3. 系统默认

**`_create_agent` 入口**：
```python
def _create_agent(options, session_id):
    recipe_name = options.get("recipe_name") or "Default"
    recipe = recipe_loader.load_recipe(recipe_name)   # None if not found
    # 其余照旧，多传 recipe 给 _build_developer_agent
```

---

## Seeds & Migration

**首次启动 seed**（`main.py` 扩展）：
```python
ensure_seeds_written(Path.home() / ".pupu" / "subagents")             # 既有
ensure_recipe_seeds_written(Path.home() / ".pupu" / "agent_recipes")  # 新增
```

**新增 `recipe_seeds.py`**，复用 `subagent_seeds.py` 的幂等模式——`Default.recipe` 已存在就不覆盖。

**`Default.recipe` 内容**：
```json
{
  "name": "Default",
  "description": "PuPu 默认 agent 配置（复刻内置行为）",
  "model": null,
  "max_iterations": null,
  "agent": {
    "prompt_format": "skeleton",
    "prompt": "{{USE_BUILTIN_DEVELOPER_PROMPT}}"
  },
  "toolkits": [
    { "id": "core",      "enabled_tools": null },
    { "id": "workspace", "enabled_tools": null },
    { "id": "terminal",  "enabled_tools": null }
  ],
  "subagent_pool": [
    { "kind": "ref", "template_name": "Explore", "disabled_tools": [] }
  ]
}
```

**迁移**：
- 老用户升级后启动 → `~/.pupu/agent_recipes/` 创建 + seed `Default.recipe`
- `~/.pupu/subagents/` 不动；Default 通过 `ref: Explore` 引用它，行为连续
- 无 DB / schema migration，全文件系统——零风险

**Reset to Default**：
- Builder 的 Default recipe 提供 "Reset to Default" 按钮
- 删文件 → 下次调用 `load_recipe("Default")` 触发重新 seed

---

## Out of Scope

以下明确**不在**本 plan 内，避免 scope 爆炸：
- 内置 recipe 商店 / 社区分享
- Recipe 版本化 / diff
- Recipe 跨机器同步
- `.soul`/`.skeleton` parser 迁入 unchain（单独 plan 执行）
- 将当前主 agent 行为自动转成用户可编辑的 Default recipe（sentinel 保留升级空间，但 UI 把 Default 的 prompt 展开成"普通文本"是后续 enhancement）

---

## Success Criteria

- 用户在 Agents tab 能创建、编辑、删除、duplicate recipe
- 用户在 chat input 选中一个 recipe，聊天时后端按 recipe 过滤 toolkits + 组装 subagent pool
- Tools selector 在 recipe 选中时隐藏；Model selector 保留 override 能力
- 首次启动自动 seed `Default.recipe`；行为跟升级前一致
- Recipe 数据结构错误 / 文件损坏 不导致 agent 创建失败——warn + fallback
