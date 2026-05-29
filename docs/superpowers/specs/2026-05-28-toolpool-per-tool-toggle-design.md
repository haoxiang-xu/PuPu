# ToolkitPool 面板：per-tool 启用开关

**日期：** 2026-05-28
**状态：** 设计已批准，待写实施计划

## 目标

在 Agent Builder 的 ToolkitPool 详情面板（`ToolPoolPanel`）里，把展开 toolkit 后的只读 tool chip 升级成可点击的 tag，让用户能选择每个 toolkit 里具体启用哪些 tools，写入 `node.toolkits[i].enabled_tools`。

后端、recipe schema、保存投影链路**均已支持** tool 级白名单，无需改动。本次只改前端 UI 与其单元测试。

## 背景：现有链路（无需改动）

- `unchain_runtime/server/recipe.py` 的 `ToolkitRef` 已有 `enabled_tools: tuple[str, ...] | None`，`parse_recipe_json()` 已解析。
- `unchain_adapter.py::_apply_recipe_toolkit_filter()` 已按 `enabled_tools` 过滤 toolkit.tools。
- graph runtime `_graph_toolkit_refs()` 已从 ToolkitPool node 的 `toolkits[].enabled_tools` 读白名单。
- `recipe_graph.js::projection_toolkits()` 只在 `Array.isArray(tk.enabled_tools)` 时把它投影到顶层；`to_save_payload()` 会保存该投影。

因此：只要 UI 正确写入 `node.toolkits[i].enabled_tools`，全链路即生效。

## 数据模型

Pool 条目当前为 `{ id, config: {} }`，扩展为可选带 `enabled_tools`：

| 状态 | 存储 | 含义 |
|------|------|------|
| 全开 | `enabled_tools` 缺省（不写该 key） | 全部 tool 启用 |
| 白名单 | `enabled_tools: ["read_file", "write_file"]` | 仅启用这些 |
| 全关 | `enabled_tools: []` | toolkit 保留、无 tool |

关键约定：

- **「缺省」和「全开」等价**：`projection_toolkits` 只认数组，缺省与 `null` 都表示全开。全开时**删除该 key**（保持条目干净），不写 `null`。
- **永不自动删除 toolkit**：tool 全部关掉就写 `[]`，toolkit 条目保留，避免误删配置。删除 toolkit 仍只走标题行的 × 按钮。
- 写入数组时**按 catalog tool 顺序排序**，保证 diff/测试稳定。

## UI 设计

视觉风格已通过 mockup 选定：

- **Tool tag 实心高亮**：启用 = 实心 accent (`#4a5bd8`) 填充 + 白字；禁用 = 浅灰底 + 淡色字。无 border。
- **总开关 = 行尾文字按钮**：toolkit 标题行 count 旁一个小文字按钮，单按钮随状态切换标签：
  - 当前全开 → 显示 **None**，点击 → 写 `enabled_tools: []`（全关）
  - 其余（白名单/全关）→ 显示 **All**，点击 → 删除 key（全开）
- **count 格式**：`启用数/总数`，如 `2/4`、全开 `4/4`、全关 `0/4`。（当前为单纯 `tools.length`，需改。）

展开区交互：

- 展开 toolkit → tools 渲染为可点击 tag。点击 tag 切换该 tool 的启用状态。
- tag 列表为空（toolkit 无 tool）→ 显示 "No tools."。

## 切换算法

写入目标：`recipe.nodes[].toolkits[i].enabled_tools`（i 为当前 ToolkitPool node）。

**点击单个 tool tag：**

1. 当前启用集 = `enabled_tools` 缺省 ? `全部 catalog tool 名` : `数组`。
2. 该 tool 在集合中则移除，否则加入。
3. 规整结果：
   - 若结果集 == 全部 catalog tools → 删除 `enabled_tools` key（全开）。
   - 否则 → 写 `enabled_tools = 按 catalog 顺序过滤出的数组`（可能为 `[]`）。
4. toolkit 条目始终保留。

**点击 All / None 文字按钮：**

- 显示 None（当前全开）时点击 → `enabled_tools: []`。
- 显示 All（其余）时点击 → 删除 `enabled_tools` key。

## 边界情况

- **toolkit 不在 catalog**（拿不到 tool 列表）：不渲染 tag；count 回退为已存 `enabled_tools` 数组长度或占位 `—`；保留现有 fallback 行为。tag 切换/All-None 在无 catalog tools 时不可用。
- **catalog 中 toolkit 无 tool**：显示 "No tools."，无 tag。
- **既有数据兼容**：旧条目无 `enabled_tools` 字段 = 全开，符合现有语义。

## 改动范围

- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
  - 展开区：只读 chip → 可点击 tag（实心高亮风格）。
  - 标题行：新增 All/None 文字按钮；count 改为 `n/m` 格式。
  - 新增 `enabled_tools` 读取 / 切换 / 规整逻辑。
- `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`
  - 更新受影响的旧断言（count 格式从 `2` → `2/2`；chip 文案不变但角色变为可点击）。
  - 新增用例（见下）。
- `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`（可选）
  - 补一个 node.toolkits 含 `enabled_tools` 的保存投影 case。

**可参考但不接入**的旧逻辑：`inspectors/toolkit_inspector.js`（per-tool switch；但它写旧顶层 `recipe.toolkits` 且空数组即删 toolkit，语义与本设计冲突，不可照搬）。

## 测试

1. 展开 pool 里的 toolkit → 能看到 tool tag（启用/禁用样式区分）。
2. 全开状态下点掉一个 tool tag → 写入 `enabled_tools` 白名单（catalog 全集减该 tool，按 catalog 顺序）。
3. 再点一个禁用的 tool tag → 更新白名单（加入该 tool）。
4. 点 All/None 文字按钮：全开时显 None → 点击写 `[]`；非全开时显 All → 点击删 key（全开）。
5. count 显示 `n/m`。
6. 把白名单点到空 → `enabled_tools: []` 且 toolkit 条目保留（不被移除）。
7.（可选）`recipe_save_payload.test.js` 保存含 `enabled_tools` 的 node.toolkits 投影正确。

运行：

```bash
npm test -- --runTestsByPath \
  src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js \
  src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js \
  --watchAll=false
```

## 约束

- JavaScript only，inline styles，function component（项目惯例）。
- 编辑 `ToolPoolPanel` 前按 `CLAUDE.md` 跑 `gitnexus_impact({target: "ToolPoolPanel", direction: "upstream"})`，提交前跑 `gitnexus_detect_changes()`。
- 不主动 git commit，改完留 dirty 状态。
