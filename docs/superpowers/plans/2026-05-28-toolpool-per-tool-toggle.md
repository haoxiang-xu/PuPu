# ToolkitPool per-tool 启用开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `ToolPoolPanel` 展开 toolkit 后能逐个点击 tool tag 启用/禁用，并提供 All/None 总开关，写入 `node.toolkits[i].enabled_tools`。

**Architecture:** 纯前端改动。把启用状态推导与切换逻辑抽成 4 个可导出的纯函数（便于单测），渲染层用这些函数把只读 chip 升级为可点击 tag + 行尾 All/None 文字按钮，count 改为 `n/m`。后端、recipe schema、`projection_toolkits` 投影链路均已支持，不改。

**Tech Stack:** React 19（function component，inline styles，JavaScript only），Jest + @testing-library/react。

**重要约定（项目规矩）：**
- **绝不 git commit。** 本计划不含任何 commit 步骤；每个任务跑完测试后留工作区 dirty，由用户自行 commit。
- JavaScript only，无 TypeScript / PropTypes；inline styles。
- 编辑 `ToolPoolPanel` 前先跑 GitNexus impact analysis（Task 1）。

参考但**不接入**：`src/COMPONENTs/agents/pages/recipes_page/inspectors/toolkit_inspector.js`（旧逻辑写顶层 `recipe.toolkits` 且空数组即删 toolkit，与本设计冲突）。

设计文档：`docs/superpowers/specs/2026-05-28-toolpool-per-tool-toggle-design.md`

---

## 数据语义速查

Pool 条目形如 `{ id, config, enabled_tools? }`：

| 状态 | `enabled_tools` | 含义 |
|------|------|------|
| 全开 | 缺省（无该 key）或 `null` | 全部 tool 启用 |
| 白名单 | `["read_file", "write_file"]` | 仅这些 |
| 全关 | `[]` | toolkit 保留、无 tool |

- 写入数组时按 **catalog tool 顺序**排序。
- 全开时**删除** `enabled_tools` key（不写 `null`）。
- 永不自动删除 toolkit 条目。

---

## File Structure

- **Modify:** `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
  - 新增 4 个 module 级可导出纯函数。
  - 展开区：只读 chip → 可点击 tag。
  - 标题行：count 改 `n/m` + 新增 All/None 文字按钮。
- **Modify (test):** `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`
  - 新增纯函数单测、tag 切换 / All-None 集成测试；更新 count 断言。
- **Modify (test, 可选):** `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`
  - 补 node.toolkits 含 `enabled_tools` 的保存投影 case。

---

## Task 1: Pre-flight — GitNexus impact analysis

**Files:** none（只读检查）

- [ ] **Step 1: 跑 impact analysis**

调用 GitNexus MCP 工具：

```
gitnexus_impact({target: "ToolPoolPanel", direction: "upstream"})
```

向用户报告 blast radius（直接调用方、受影响流程、风险等级）。若返回 HIGH / CRITICAL，先警告用户再继续。

若 GitNexus 工具不可用或提示索引过期，先在终端运行 `npx gitnexus analyze`（在 `/Users/red/Desktop/GITRepo/PuPu` 下），再重试一次；仍不可用则在终端记录「跳过 impact 分析（工具不可用）」后继续。

---

## Task 2: 纯函数 — 启用状态推导与切换

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
- Test: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`

- [ ] **Step 1: 写失败测试**

在 `toolpool_panel.test.js` 顶部 import 处加入对纯函数的引用，并在文件末尾追加 describe 块：

```js
import ToolPoolPanel, {
  is_all_on,
  enabled_tool_set,
  enabled_count,
  next_enabled_tools,
} from "./toolpool_panel";
```

```js
describe("toolpool_panel helpers", () => {
  const names = ["read_file", "write_file", "list_dir"];

  test("is_all_on: 缺省/null/无 entry 都算全开", () => {
    expect(is_all_on(undefined)).toBe(true);
    expect(is_all_on({ id: "x" })).toBe(true);
    expect(is_all_on({ id: "x", enabled_tools: null })).toBe(true);
    expect(is_all_on({ id: "x", enabled_tools: [] })).toBe(false);
    expect(is_all_on({ id: "x", enabled_tools: ["read_file"] })).toBe(false);
  });

  test("enabled_tool_set: 全开返回全集，白名单返回数组集合", () => {
    expect(enabled_tool_set({ id: "x" }, names)).toEqual(new Set(names));
    expect(enabled_tool_set({ id: "x", enabled_tools: ["read_file"] }, names)).toEqual(
      new Set(["read_file"]),
    );
    expect(enabled_tool_set({ id: "x", enabled_tools: [] }, names)).toEqual(new Set());
  });

  test("enabled_count: 全开=总数，白名单=数组长度", () => {
    expect(enabled_count({ id: "x" }, names)).toBe(3);
    expect(enabled_count({ id: "x", enabled_tools: ["read_file"] }, names)).toBe(1);
    expect(enabled_count({ id: "x", enabled_tools: [] }, names)).toBe(0);
  });

  test("next_enabled_tools: 全开下关一个 → 按 catalog 顺序的白名单", () => {
    expect(next_enabled_tools({ id: "x" }, names, "write_file")).toEqual([
      "read_file",
      "list_dir",
    ]);
  });

  test("next_enabled_tools: 白名单下开一个 → 凑齐全集返回 undefined(全开)", () => {
    expect(
      next_enabled_tools({ id: "x", enabled_tools: ["read_file", "list_dir"] }, names, "write_file"),
    ).toBeUndefined();
  });

  test("next_enabled_tools: 关掉最后一个 → 空数组", () => {
    expect(
      next_enabled_tools({ id: "x", enabled_tools: ["read_file"] }, names, "read_file"),
    ).toEqual([]);
  });

  test("next_enabled_tools: 全关下开一个 → 单元素白名单", () => {
    expect(next_enabled_tools({ id: "x", enabled_tools: [] }, names, "list_dir")).toEqual([
      "list_dir",
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: FAIL —`is_all_on is not a function` 之类（函数未定义/未导出）。

- [ ] **Step 3: 实现纯函数**

在 `toolpool_panel.js` 顶部（`import` 之后、`SECTION_LABEL` 之前）加入：

```js
export function is_all_on(entry) {
  return !entry || entry.enabled_tools == null;
}

export function enabled_tool_set(entry, catalog_tool_names) {
  if (is_all_on(entry)) return new Set(catalog_tool_names);
  return new Set(entry.enabled_tools);
}

export function enabled_count(entry, catalog_tool_names) {
  if (is_all_on(entry)) return catalog_tool_names.length;
  return entry.enabled_tools.length;
}

export function next_enabled_tools(entry, catalog_tool_names, tool_name) {
  const set = enabled_tool_set(entry, catalog_tool_names);
  if (set.has(tool_name)) set.delete(tool_name);
  else set.add(tool_name);
  const ordered = catalog_tool_names.filter((name) => set.has(name));
  if (ordered.length === catalog_tool_names.length) return undefined;
  return ordered;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 新增 helper 测试全 PASS；既有「count」测试此时可能仍 PASS（尚未改渲染）。

---

## Task 3: 标题行 — count 改 `n/m` + 写入辅助

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
- Test: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`

- [ ] **Step 1: 更新既有 count 测试**

把现有测试 `renders pool entries with toolkit name and tool count` 里的：

```js
expect(screen.getByText("2")).toBeInTheDocument();
```

改为：

```js
expect(screen.getByText("2/2")).toBeInTheDocument();
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 该用例 FAIL — 找不到文本 `2/2`（当前渲染的是 `2`）。

- [ ] **Step 3: 加入写入辅助 + 改 count 渲染**

在组件内 `remove_toolkit` 之后加入写入辅助函数：

```js
function write_enabled_tools(tk_id, value) {
  update_node({
    toolkits: toolkits.map((t) => {
      if (t.id !== tk_id) return t;
      if (value === undefined) {
        const { enabled_tools: _drop, ...rest } = t;
        return rest;
      }
      return { ...t, enabled_tools: value };
    }),
  });
}
```

在 pool 渲染 `toolkits.map((entry) => {...})` 里，`const tools = ...` 之后加入：

```js
const tool_names = tools.map((t) => t.name);
const total = tool_names.length;
const count_label =
  total > 0
    ? `${enabled_count(entry, tool_names)}/${total}`
    : Array.isArray(entry.enabled_tools)
      ? String(entry.enabled_tools.length)
      : "";
```

把标题行里的 count span：

```jsx
<span style={{ fontSize: 10.5, color: muted }}>
  {tools.length}
</span>
```

改为：

```jsx
<span style={{ fontSize: 10.5, color: muted }}>
  {count_label}
</span>
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: count 用例 PASS（显示 `2/2`），其余既有用例仍 PASS。

---

## Task 4: 展开区 — 可点击 tool tag + 切换接线

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
- Test: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`

- [ ] **Step 1: 写失败测试**

在 `ToolPoolPanel — pool` describe 内追加：

```js
test("全开下点掉一个 tool tag → 写入 catalog 顺序白名单", async () => {
  const { node, recipe } = makeRecipe({
    toolkits: [{ id: "core", config: {} }],
  });
  const onChange = jest.fn();
  render(
    wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
  );
  await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Core")); // 展开
  fireEvent.click(screen.getByText("write_file"));
  expect(onChange).toHaveBeenCalled();
  const call = onChange.mock.calls[0][0];
  expect(call.nodes[0].toolkits[0].enabled_tools).toEqual(["read_file"]);
});

test("白名单下点亮一个禁用 tool tag → 更新白名单", async () => {
  const { node, recipe } = makeRecipe({
    toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
  });
  const onChange = jest.fn();
  render(
    wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
  );
  await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Core"));
  fireEvent.click(screen.getByText("write_file"));
  const call = onChange.mock.calls[0][0];
  // 凑齐 read_file + write_file = 全集 → 删 key（全开）
  expect("enabled_tools" in call.nodes[0].toolkits[0]).toBe(false);
});

test("点掉最后一个 tool → enabled_tools:[] 且 toolkit 保留", async () => {
  const { node, recipe } = makeRecipe({
    toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
  });
  const onChange = jest.fn();
  render(
    wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
  );
  await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Core"));
  fireEvent.click(screen.getByText("read_file"));
  const call = onChange.mock.calls[0][0];
  expect(call.nodes[0].toolkits[0].enabled_tools).toEqual([]);
  expect(call.nodes[0].toolkits).toHaveLength(1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 三个新用例 FAIL —点击 tag 不触发 `onChange`（当前 chip 无 onClick）。

- [ ] **Step 3: 加 tag 颜色变量 + 切换函数 + 可点击 tag**

在组件内既有颜色变量区（`chip_color` 那一组）后加入：

```js
const tag_off_color = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)";
```

在 `write_enabled_tools` 之后加入：

```js
function toggle_tool(tk_id, tool_names, tool_name) {
  const entry = toolkits.find((t) => t.id === tk_id);
  write_enabled_tools(tk_id, next_enabled_tools(entry, tool_names, tool_name));
}
```

在 pool 渲染中，进入 `toolkits.map` 后、`return (...)` 之前计算启用集（紧跟 Task 3 加的 `count_label` 之后）：

```js
const en_set = enabled_tool_set(entry, tool_names);
```

把展开区里只读 chip 的渲染：

```jsx
{tools.map((t) => (
  <span
    key={t.name}
    style={{
      fontSize: 10.5,
      fontFamily: "ui-monospace, Menlo, monospace",
      color: chip_color,
      background: chip_bg,
      padding: "2px 7px",
      borderRadius: 999,
    }}
  >
    {t.name}
  </span>
))}
```

改为可点击 tag（实心高亮）：

```jsx
{tools.map((t) => {
  const on = en_set.has(t.name);
  return (
    <span
      key={t.name}
      onClick={() => toggle_tool(entry.id, tool_names, t.name)}
      style={{
        fontSize: 10.5,
        fontFamily: "ui-monospace, Menlo, monospace",
        color: on ? "#fff" : tag_off_color,
        background: on ? accent : chip_bg,
        padding: "2px 7px",
        borderRadius: 999,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {t.name}
    </span>
  );
})}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 三个 tag 用例 PASS，其余 PASS。

---

## Task 5: 标题行 — All / None 文字按钮

**Files:**
- Modify: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.js`
- Test: `src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js`

- [ ] **Step 1: 写失败测试**

在 `ToolPoolPanel — pool` describe 内追加：

```js
test("全开时显示 None，点击 → enabled_tools:[]", async () => {
  const { node, recipe } = makeRecipe({
    toolkits: [{ id: "core", config: {} }],
  });
  const onChange = jest.fn();
  render(
    wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
  );
  await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
  fireEvent.click(screen.getByText("None"));
  const call = onChange.mock.calls[0][0];
  expect(call.nodes[0].toolkits[0].enabled_tools).toEqual([]);
});

test("非全开时显示 All，点击 → 删 key(全开)", async () => {
  const { node, recipe } = makeRecipe({
    toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
  });
  const onChange = jest.fn();
  render(
    wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
  );
  await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
  fireEvent.click(screen.getByText("All"));
  const call = onChange.mock.calls[0][0];
  expect("enabled_tools" in call.nodes[0].toolkits[0]).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 两个新用例 FAIL — 找不到文本 `None` / `All`。

- [ ] **Step 3: 渲染 All/None 文字按钮**

在 pool 渲染中计算（紧跟 Task 4 的 `en_set` 之后）：

```js
const all_on = is_all_on(entry);
```

在标题行 count span 与 close `Button` 之间插入文字按钮（仅当 `total > 0` 时显示）：

```jsx
{total > 0 && (
  <span
    onClick={(e) => {
      if (e?.stopPropagation) e.stopPropagation();
      write_enabled_tools(entry.id, all_on ? [] : undefined);
    }}
    style={{
      fontSize: 10.5,
      color: accent,
      cursor: "pointer",
      userSelect: "none",
      padding: "0 2px",
    }}
  >
    {all_on ? "None" : "All"}
  </span>
)}
```

> 注意：该 span 必须 `stopPropagation`，否则会触发标题行的展开/收起。

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js --watchAll=false
```
Expected: 两个 All/None 用例 PASS；全文件 PASS。

---

## Task 6 (可选): 保存投影含 enabled_tools

**Files:**
- Test: `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`

- [ ] **Step 1: 先读现有测试确认风格**

Read: `src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js`
确认其构造 recipe / 调用 `to_save_payload` 的既有写法，照搬风格。

- [ ] **Step 2: 追加投影测试**

新增一个用例：构造含 `toolkit_pool` node、其 `toolkits` 含 `{ id: "core", enabled_tools: ["read_file"] }`，断言 `to_save_payload` 结果顶层 `toolkits` 含 `{ id: "core", enabled_tools: ["read_file"] }`；再构造一个全开（无 `enabled_tools`）的条目，断言投影结果不含 `enabled_tools` key。

（具体断言字段名以 Step 1 读到的现有用例为准——若该文件已覆盖等价场景，则跳过本任务并在终端说明。）

- [ ] **Step 3: 跑测试确认通过**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js --watchAll=false
```
Expected: PASS。

---

## Task 7: 整体验证

**Files:** none

- [ ] **Step 1: 跑两个文件全套测试**

Run:
```bash
cd /Users/red/Desktop/GITRepo/PuPu && npm test -- --runTestsByPath \
  src/COMPONENTs/agents/pages/recipes_page/detail_panel/toolpool_panel.test.js \
  src/COMPONENTs/agents/pages/recipes_page/recipe_save_payload.test.js \
  --watchAll=false
```
Expected: 全 PASS。

- [ ] **Step 2: GitNexus 变更范围检查**

调用 `gitnexus_detect_changes()`，确认改动只波及 `ToolPoolPanel` 及预期符号；有意外波及则向用户报告。工具不可用则在终端说明已跳过。

- [ ] **Step 3: 留 dirty 交接**

**不要 commit。** 在终端汇报：改了哪些文件、测试结果、是否跑了 gitnexus 检查；提示用户自行 review + commit。
