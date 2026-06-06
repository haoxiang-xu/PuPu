# PuPu MCP Toolkit Store — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PuPu Toolkit modal 的 Store tab 从 placeholder 换成真实的 curated MCP registry 只读展示（网格卡片 + 滑入 detail），并为 Phase 2 的 one-click setup 预留数据形状。

**Architecture:** 一个纯静态 service（`mcp_toolkit_store.js`）提供 registry 数据与查询；两个新组件（`StoreToolkitCard` 信息卡、`StoreToolkitDetailPanel` 滑入面板）；重写 `ToolkitStorePage`（搜索 + 分类 + 网格 + 空态 + disabled "Add Custom MCP"）；`ToolkitsPage` 增加 `kind` 区分让 store/installed 共用同一套滑入动画。全程只读，不碰 unchain runtime、不加 IPC、不执行 MCP。

**Tech Stack:** React 19（function components，inline styles，no TS/PropTypes）、mini_react `useTranslation`、builtin 组件（`Card`/`Input`/`SegmentedControl`/`Code`/`Markdown`/`Tooltip`/`Button`/`ToolkitIcon`/`PlaceholderBlock`）、Jest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-06-05-pupu-mcp-store-phase1-design.md`

---

## ⚠️ 执行约定（务必遵守）

1. **不自动 commit。** 本仓库 owner 自行 commit。每个 task 末尾**不要** `git commit`，停在 dirty 即可。原"Commit"步骤一律替换为"标记 task 完成、运行测试确认绿"。
2. **改既有 symbol 前先跑 GitNexus impact**（`gitnexus_impact({target, direction:"upstream"})`）：本 plan 涉及 `ToolkitStorePage`、`ToolkitsPage`、`SOURCE_CONFIG`。报告 blast radius；HIGH/CRITICAL 先告警。
3. **JS only / inline styles / no PropTypes。** 字体统一 `theme?.font?.fontFamily || "Jost, sans-serif"`。
4. 测试命令统一：`npm test -- --watchAll=false <path>`。

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/SERVICEs/mcp_toolkit_store.js` | 静态 registry：categories + 7 seed entries + list/get/search | Create |
| `src/SERVICEs/mcp_toolkit_store.test.js` | service 单测 | Create |
| `src/COMPONENTs/toolkit/constants.js` | 加 `SOURCE_CONFIG.mcp`、`STORE_CATEGORY_CONFIG`、`TRUST_CONFIG` | Modify |
| `src/COMPONENTs/toolkit/constants.test.js` | 常量一致性测试 | Create |
| `src/locales/en.json` / `src/locales/zh-CN.json` | 新增 `toolkit.store_*` / `source_mcp` / `trust_*` keys | Modify |
| `src/COMPONENTs/toolkit/components/store_toolkit_card.js` | 网格信息卡（无按钮，三 tag，右上 tool 数） | Create |
| `src/COMPONENTs/toolkit/components/store_toolkit_card.test.js` | 卡片测试 | Create |
| `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js` | 滑入 detail（Install 右上 disabled + 各预览区） | Create |
| `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js` | detail 测试 | Create |
| `src/COMPONENTs/toolkit/pages/toolkit_store_page.js` | placeholder → 真实 Store 页 | Modify |
| `src/COMPONENTs/toolkit/pages/toolkit_store_page.test.js` | Store 页测试 | Create |
| `src/COMPONENTs/toolkit/pages/toolkits_page.js` | 接入 store detail 滑入（kind 区分） | Modify |
| `src/COMPONENTs/toolkit/pages/toolkits_page.test.js` | 集成测试 | Create |

执行顺序：Task 1（service）→ 2（constants）→ 3（i18n）→ 4（card）→ 5（detail）→ 6（store page）→ 7（toolkits page 接入）。

---

## Task 1: Registry service

**Files:**
- Create: `src/SERVICEs/mcp_toolkit_store.js`
- Test: `src/SERVICEs/mcp_toolkit_store.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/SERVICEs/mcp_toolkit_store.test.js`:

```js
import {
  MCP_STORE_CATEGORIES,
  MCP_STORE_ENTRIES,
  listMcpStoreEntries,
  getMcpStoreEntry,
  searchMcpStoreEntries,
} from "./mcp_toolkit_store";

describe("mcp_toolkit_store", () => {
  test("categories start with 'all' and include the known set", () => {
    expect(MCP_STORE_CATEGORIES[0]).toBe("all");
    expect(MCP_STORE_CATEGORIES).toEqual(
      expect.arrayContaining(["browser", "dev", "productivity", "workspace", "memory"]),
    );
  });

  test("every entry carries the Installed-compatible fields", () => {
    for (const e of listMcpStoreEntries()) {
      expect(typeof e.id).toBe("string");
      expect(e.toolkitId).toMatch(/^mcp\./);
      expect(typeof e.toolkitName).toBe("string");
      expect(typeof e.toolkitDescription).toBe("string");
      expect(e.source).toBe("mcp");
      expect(MCP_STORE_CATEGORIES).toContain(e.category);
      expect(["stdio", "http"]).toContain(e.mcp.transport);
      expect(Array.isArray(e.tools)).toBe(true);
      expect(e.toolkitIcon.type).toBe("builtin");
    }
  });

  test("getMcpStoreEntry returns the entry or null", () => {
    expect(getMcpStoreEntry("browser.playwright").toolkitName).toBe("Playwright Browser");
    expect(getMcpStoreEntry("does.not.exist")).toBeNull();
  });

  test("searchMcpStoreEntries filters by category", () => {
    const browser = searchMcpStoreEntries(listMcpStoreEntries(), "", "browser");
    expect(browser.length).toBeGreaterThan(0);
    expect(browser.every((e) => e.category === "browser")).toBe(true);
  });

  test("searchMcpStoreEntries 'all' category returns everything", () => {
    const all = searchMcpStoreEntries(listMcpStoreEntries(), "", "all");
    expect(all.length).toBe(listMcpStoreEntries().length);
  });

  test("searchMcpStoreEntries matches name, description and tool names", () => {
    expect(searchMcpStoreEntries(listMcpStoreEntries(), "github", "all")
      .some((e) => e.id === "dev.github-remote")).toBe(true);
    expect(searchMcpStoreEntries(listMcpStoreEntries(), "notion", "all")
      .some((e) => e.id === "productivity.notion-remote")).toBe(true);
    expect(searchMcpStoreEntries(listMcpStoreEntries(), "filesystem", "all")
      .some((e) => e.id === "workspace.filesystem")).toBe(true);
  });

  test("slack entry is flagged needs_review", () => {
    expect(getMcpStoreEntry("productivity.slack").status).toBe("needs_review");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/SERVICEs/mcp_toolkit_store.test.js`
Expected: FAIL — "Cannot find module './mcp_toolkit_store'".

- [ ] **Step 3: Write the service**

Create `src/SERVICEs/mcp_toolkit_store.js`:

```js
/**
 * Static curated MCP toolkit registry (Phase 1, read-only).
 * No execution, no IPC, no runtime — pure data + query helpers.
 * `MCP_STORE_CATEGORIES` is the single source of truth for category keys;
 * UI label/icon config lives separately in toolkit/constants.js (STORE_CATEGORY_CONFIG).
 */

export const MCP_STORE_CATEGORIES = [
  "all",
  "browser",
  "dev",
  "productivity",
  "workspace",
  "memory",
];

export const MCP_STORE_ENTRIES = [
  {
    id: "browser.playwright",
    toolkitId: "mcp.browser.playwright",
    toolkitName: "Playwright Browser",
    toolkitDescription:
      "Browser automation through the official Playwright MCP server.",
    category: "browser",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0",
    sourceRepo: "https://github.com/microsoft/playwright-mcp",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    toolkitIcon: { type: "builtin", name: "globe", color: "#2563eb", backgroundColor: "#dbeafe" },
    mcp: { transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"] },
    setupPreview: "npx -y @playwright/mcp@latest",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      { name: "browser_navigate", title: "Navigate", requiresConfirmation: false },
      { name: "browser_snapshot", title: "Snapshot", requiresConfirmation: false },
      { name: "browser_click", title: "Click", requiresConfirmation: true },
      { name: "browser_type", title: "Type", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 2 },
    readmeMarkdown:
      "## Playwright Browser\n\nDrives a real browser over stdio: navigation, clicks, form fill and accessibility snapshots. Maintained by Microsoft.",
  },
  {
    id: "browser.browser-use-local",
    toolkitId: "mcp.browser.browser-use-local",
    toolkitName: "Browser Use",
    toolkitDescription:
      "Local agentic browser control via the browser-use CLI MCP server.",
    category: "browser",
    source: "mcp",
    trustLevel: "community",
    status: "available",
    license: "MIT",
    sourceRepo: "https://github.com/browser-use/browser-use",
    docsUrl: "https://github.com/browser-use/browser-use",
    toolkitIcon: { type: "builtin", name: "globe", color: "#7c3aed", backgroundColor: "#ede9fe" },
    mcp: { transport: "stdio", command: "uvx", args: ["--from", "browser-use[cli]", "browser-use", "--mcp"] },
    setupPreview: "uvx --from browser-use[cli] browser-use --mcp",
    prerequisites: ["uv / uvx", "Python >= 3.11"],
    secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
    tools: [
      { name: "open_tab", title: "Open tab", requiresConfirmation: false },
      { name: "go_to_url", title: "Go to URL", requiresConfirmation: false },
      { name: "click_element", title: "Click element", requiresConfirmation: true },
      { name: "input_text", title: "Input text", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 2 },
    readmeMarkdown:
      "## Browser Use\n\nRuns the browser-use CLI as an MCP server for LLM-driven browsing. Requires `uv`/`uvx` and an `OPENAI_API_KEY`.",
  },
  {
    id: "dev.github-remote",
    toolkitId: "mcp.dev.github-remote",
    toolkitName: "GitHub",
    toolkitDescription:
      "Remote GitHub MCP server for repositories, issues and pull requests.",
    category: "dev",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "MIT",
    sourceRepo: "https://github.com/github/github-mcp-server",
    docsUrl: "https://github.com/github/github-mcp-server",
    toolkitIcon: { type: "builtin", name: "github", color: "#475569", backgroundColor: "#e8e8ee" },
    mcp: { transport: "http", url: "https://api.githubcopilot.com/mcp/", headers: [] },
    setupPreview: "https://api.githubcopilot.com/mcp/",
    prerequisites: ["GitHub account"],
    secrets: [{ key: "GITHUB_MCP_PAT", label: "GitHub Personal Access Token", optional: true }],
    tools: [
      { name: "search_repositories", title: "Search repositories", requiresConfirmation: false },
      { name: "get_file_contents", title: "Get file contents", requiresConfirmation: false },
      { name: "create_issue", title: "Create issue", requiresConfirmation: true },
      { name: "create_pull_request", title: "Create pull request", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 2 },
    readmeMarkdown:
      "## GitHub (remote)\n\nThe official remote GitHub MCP server. Supports OAuth or a Personal Access Token header. Phase 1 shows the connection details only.",
  },
  {
    id: "productivity.notion-remote",
    toolkitId: "mcp.productivity.notion-remote",
    toolkitName: "Notion",
    toolkitDescription:
      "Hosted remote MCP for Notion pages, databases and search.",
    category: "productivity",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "hosted",
    sourceRepo: "https://developers.notion.com/docs/get-started-with-mcp",
    docsUrl: "https://developers.notion.com/docs/get-started-with-mcp",
    toolkitIcon: { type: "builtin", name: "server", color: "#334155", backgroundColor: "#e2e8f0" },
    mcp: { transport: "http", url: "https://mcp.notion.com/mcp", headers: [] },
    setupPreview: "https://mcp.notion.com/mcp",
    prerequisites: ["Notion account"],
    secrets: [],
    tools: [
      { name: "search", title: "Search", requiresConfirmation: false },
      { name: "fetch_page", title: "Fetch page", requiresConfirmation: false },
      { name: "create_page", title: "Create page", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 1 },
    readmeMarkdown:
      "## Notion (hosted)\n\nNotion's hosted MCP endpoint. Connection is via OAuth in the Phase 2 setup flow; Phase 1 only previews the endpoint.",
  },
  {
    id: "workspace.filesystem",
    toolkitId: "mcp.workspace.filesystem",
    toolkitName: "Filesystem",
    toolkitDescription:
      "Read and write files within an allowed workspace directory.",
    category: "workspace",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0 / MIT",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    toolkitIcon: { type: "builtin", name: "folder", color: "#d97706", backgroundColor: "#fef3c7" },
    mcp: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE}"] },
    setupPreview: "npx -y @modelcontextprotocol/server-filesystem ${WORKSPACE}",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      { name: "read_file", title: "Read file", requiresConfirmation: false },
      { name: "list_directory", title: "List directory", requiresConfirmation: false },
      { name: "write_file", title: "Write file", requiresConfirmation: true },
      { name: "move_file", title: "Move file", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 2 },
    readmeMarkdown:
      "## Filesystem\n\nReference MCP server for scoped file access. The `${WORKSPACE}` placeholder is filled with the chosen directory during Phase 2 setup.",
  },
  {
    id: "memory.memory",
    toolkitId: "mcp.memory.memory",
    toolkitName: "Memory",
    toolkitDescription:
      "Persistent knowledge-graph memory via the reference MCP server.",
    category: "memory",
    source: "mcp",
    trustLevel: "verified",
    status: "available",
    license: "Apache-2.0 / MIT",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    toolkitIcon: { type: "builtin", name: "server", color: "#0d9488", backgroundColor: "#ccfbf1" },
    mcp: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
    setupPreview: "npx -y @modelcontextprotocol/server-memory",
    prerequisites: ["Node.js >= 18"],
    secrets: [],
    tools: [
      { name: "search_nodes", title: "Search nodes", requiresConfirmation: false },
      { name: "read_graph", title: "Read graph", requiresConfirmation: false },
      { name: "create_entities", title: "Create entities", requiresConfirmation: true },
    ],
    policySummary: { reviewed: true, defaultEnabledTools: 0, confirmationRequiredTools: 1 },
    readmeMarkdown:
      "## Memory\n\nReference knowledge-graph memory server. Stores entities and relations the agent can recall across sessions.",
  },
  {
    id: "productivity.slack",
    toolkitId: "mcp.productivity.slack",
    toolkitName: "Slack",
    toolkitDescription:
      "Send messages and read channels via the Slack MCP server.",
    category: "productivity",
    source: "mcp",
    trustLevel: "needs_review",
    status: "needs_review",
    license: "Unverified",
    sourceRepo: "https://github.com/modelcontextprotocol/servers",
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    toolkitIcon: { type: "builtin", name: "link", color: "#475569", backgroundColor: "#e8e8ee" },
    mcp: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"] },
    setupPreview: "npx -y @modelcontextprotocol/server-slack",
    prerequisites: ["Node.js >= 18"],
    secrets: [{ key: "SLACK_BOT_TOKEN", label: "Slack bot token" }],
    tools: [
      { name: "list_channels", title: "List channels", requiresConfirmation: false },
      { name: "post_message", title: "Post message", requiresConfirmation: true },
    ],
    policySummary: { reviewed: false, defaultEnabledTools: 0, confirmationRequiredTools: 1 },
    readmeMarkdown:
      "## Slack\n\n⚠️ Candidate entry — recipe and license are not yet verified. Shown for review only.",
  },
];

export function listMcpStoreEntries() {
  return MCP_STORE_ENTRIES;
}

export function getMcpStoreEntry(id) {
  return MCP_STORE_ENTRIES.find((e) => e.id === id) || null;
}

export function searchMcpStoreEntries(entries, query, category) {
  const cat = category || "all";
  const q = (query || "").trim().toLowerCase();
  return entries.filter((e) => {
    if (cat !== "all" && e.category !== cat) return false;
    if (!q) return true;
    const name = (e.toolkitName || "").toLowerCase();
    const desc = (e.toolkitDescription || "").toLowerCase();
    const id = (e.id || "").toLowerCase();
    const toolNames = (e.tools || [])
      .map((t) => `${t.title || ""} ${t.name || ""}`.toLowerCase())
      .join(" ");
    return name.includes(q) || desc.includes(q) || id.includes(q) || toolNames.includes(q);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/SERVICEs/mcp_toolkit_store.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Mark task complete**

Confirm tests green. **Do not commit** — leave dirty for the owner.

---

## Task 2: Toolkit constants (mcp source + categories + trust)

**Files:**
- Modify: `src/COMPONENTs/toolkit/constants.js`
- Test: `src/COMPONENTs/toolkit/constants.test.js`

> Run `gitnexus_impact({target: "SOURCE_CONFIG", direction: "upstream"})` first; report blast radius.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/toolkit/constants.test.js`:

```js
import { SOURCE_CONFIG, STORE_CATEGORY_CONFIG, TRUST_CONFIG } from "./constants";
import { MCP_STORE_CATEGORIES } from "../../SERVICEs/mcp_toolkit_store";

describe("toolkit constants", () => {
  test("SOURCE_CONFIG has an mcp entry (violet)", () => {
    expect(SOURCE_CONFIG.mcp).toBeDefined();
    expect(SOURCE_CONFIG.mcp.color).toBe("#8b5cf6");
    expect(SOURCE_CONFIG.mcp.labelKey).toBe("toolkit.source_mcp");
  });

  test("existing source entries are untouched", () => {
    expect(SOURCE_CONFIG.builtin).toBeDefined();
    expect(SOURCE_CONFIG.local).toBeDefined();
    expect(SOURCE_CONFIG.plugin).toBeDefined();
  });

  test("STORE_CATEGORY_CONFIG keys exactly match the service category source-of-truth", () => {
    const keys = STORE_CATEGORY_CONFIG.map((c) => c.key);
    expect(keys).toEqual(MCP_STORE_CATEGORIES);
    for (const c of STORE_CATEGORY_CONFIG) {
      expect(typeof c.icon).toBe("string");
      expect(c.labelKey).toMatch(/^toolkit\.store_category_/);
    }
  });

  test("TRUST_CONFIG covers verified / community / needs_review", () => {
    expect(TRUST_CONFIG.verified.labelKey).toBe("toolkit.trust_verified");
    expect(TRUST_CONFIG.community.labelKey).toBe("toolkit.trust_community");
    expect(TRUST_CONFIG.needs_review.labelKey).toBe("toolkit.trust_needs_review");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/constants.test.js`
Expected: FAIL — `SOURCE_CONFIG.mcp` undefined / missing exports.

- [ ] **Step 3: Extend constants.js**

In `src/COMPONENTs/toolkit/constants.js`, add `mcp` to the existing `SOURCE_CONFIG` object (after the `plugin` entry):

```js
  plugin: {
    labelKey: "toolkit.source_plugin",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
  },
  mcp: {
    labelKey: "toolkit.source_mcp",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
  },
```

Then append these two new exports at the end of the file:

```js
/* UI config for the MCP Store category filter.
 * Category keys are owned by MCP_STORE_CATEGORIES in SERVICEs/mcp_toolkit_store.js;
 * this only adds label + icon. Icon names are verified-present builtin icons. */
export const STORE_CATEGORY_CONFIG = [
  { key: "all", icon: "search", labelKey: "toolkit.store_category_all" },
  { key: "browser", icon: "globe", labelKey: "toolkit.store_category_browser" },
  { key: "dev", icon: "code", labelKey: "toolkit.store_category_dev" },
  { key: "productivity", icon: "tool", labelKey: "toolkit.store_category_productivity" },
  { key: "workspace", icon: "folder", labelKey: "toolkit.store_category_workspace" },
  { key: "memory", icon: "server", labelKey: "toolkit.store_category_memory" },
];

export const TRUST_CONFIG = {
  verified: { labelKey: "toolkit.trust_verified", color: "#10b981", bg: "rgba(52,211,153,0.13)" },
  community: { labelKey: "toolkit.trust_community", color: "#60a5fa", bg: "rgba(96,165,250,0.13)" },
  needs_review: { labelKey: "toolkit.trust_needs_review", color: "#f59e0b", bg: "rgba(251,146,60,0.13)" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/constants.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Mark task complete** — tests green, leave dirty.

---

## Task 3: i18n keys (en + zh-CN)

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

No test (JSON data); validated indirectly by component tests using `t(key) => key`.

- [ ] **Step 1: Add English keys**

In `src/locales/en.json`, inside the `"toolkit"` object, replace the line:

```json
    "store_subtitle": "Browse and install community toolkits. Coming soon.",
```

with (keep `store_title` above it as-is):

```json
    "store_subtitle": "Browse curated MCP servers you can connect to PuPu.",
    "source_mcp": "mcp",
    "trust_verified": "verified",
    "trust_community": "community",
    "trust_needs_review": "review",
    "store_category_all": "All",
    "store_category_browser": "Browser",
    "store_category_dev": "Dev",
    "store_category_productivity": "Productivity",
    "store_category_workspace": "Workspace",
    "store_category_memory": "Memory",
    "store_search_placeholder": "Search MCP servers...",
    "store_add_custom": "Add Custom MCP",
    "store_add_custom_subtitle": "Custom setup and permission review arrive in the setup phase",
    "store_install": "Install",
    "store_install_coming": "coming in Phase 2",
    "store_setup_command": "Setup command",
    "store_requirements": "Requirements",
    "store_secrets": "Secrets required",
    "store_permissions": "Permissions",
    "store_auto_enabled": "auto-enabled",
    "store_ask_before_run": "ask before run",
    "store_tools_count": "Tools",
    "store_about": "About",
    "store_repository": "Repository",
    "store_docs": "Docs",
    "store_needs_review_title": "Candidate entry",
    "store_needs_review_desc": "This server's recipe and license are not yet verified.",
    "store_empty_search": "No MCP servers match your search.",
```

- [ ] **Step 2: Add Simplified Chinese keys**

In `src/locales/zh-CN.json`, inside the `"toolkit"` object, replace the line:

```json
    "store_subtitle": "浏览并安装社区工具包。即将推出。",
```

with:

```json
    "store_subtitle": "浏览可连接到 PuPu 的精选 MCP 服务器。",
    "source_mcp": "mcp",
    "trust_verified": "已验证",
    "trust_community": "社区",
    "trust_needs_review": "待审核",
    "store_category_all": "全部",
    "store_category_browser": "浏览器",
    "store_category_dev": "开发",
    "store_category_productivity": "效率",
    "store_category_workspace": "工作区",
    "store_category_memory": "记忆",
    "store_search_placeholder": "搜索 MCP 服务器...",
    "store_add_custom": "添加自定义 MCP",
    "store_add_custom_subtitle": "自定义配置与权限审查将在配置阶段提供",
    "store_install": "安装",
    "store_install_coming": "将在 Phase 2 推出",
    "store_setup_command": "配置命令",
    "store_requirements": "前置依赖",
    "store_secrets": "所需密钥",
    "store_permissions": "权限",
    "store_auto_enabled": "自动启用",
    "store_ask_before_run": "运行前询问",
    "store_tools_count": "工具",
    "store_about": "关于",
    "store_repository": "代码仓库",
    "store_docs": "文档",
    "store_needs_review_title": "候选条目",
    "store_needs_review_desc": "该服务器的配方与许可证尚未验证。",
    "store_empty_search": "没有匹配的 MCP 服务器。",
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "require('./src/locales/en.json'); require('./src/locales/zh-CN.json'); console.log('ok')"`
Expected: prints `ok` (no JSON syntax error).

- [ ] **Step 4: Mark task complete** — leave dirty.

---

## Task 4: StoreToolkitCard component

**Files:**
- Create: `src/COMPONENTs/toolkit/components/store_toolkit_card.js`
- Test: `src/COMPONENTs/toolkit/components/store_toolkit_card.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/toolkit/components/store_toolkit_card.test.js`:

```js
import { render, screen, fireEvent } from "@testing-library/react";
import StoreToolkitCard from "./store_toolkit_card";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => <span data-testid="toolkit-icon">{icon?.name || "fallback"}</span>,
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

// No react/context mock needed: ConfigContext defaults to "" so `{ theme } = useContext()`
// is undefined and components fall back via optional chaining (same as toolkit_card.test.js).

const entry = {
  id: "browser.playwright",
  toolkitName: "Playwright Browser",
  toolkitDescription: "Browser automation through the official Playwright MCP server.",
  source: "mcp",
  status: "available",
  trustLevel: "verified",
  license: "Apache-2.0",
  toolkitIcon: { type: "builtin", name: "globe" },
  mcp: { transport: "stdio" },
  tools: [{ name: "a" }, { name: "b" }, { name: "c" }],
};

describe("StoreToolkitCard", () => {
  test("renders name, transport tag, trust tag, license and tool count", () => {
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={() => {}} />);
    expect(screen.getByText("Playwright Browser")).toBeInTheDocument();
    expect(screen.getByText("toolkit.source_mcp · stdio")).toBeInTheDocument();
    expect(screen.getByText("toolkit.trust_verified")).toBeInTheDocument();
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    expect(screen.getByText("3 toolkit.store_tools_count")).toBeInTheDocument();
  });

  test("renders no install / setup affordance (info card only)", () => {
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={() => {}} />);
    expect(screen.queryByText("toolkit.store_install")).toBeNull();
    expect(screen.queryByText(/setup/i)).toBeNull();
  });

  test("clicking the card fires onClick with the entry id", () => {
    const onClick = jest.fn();
    render(<StoreToolkitCard entry={entry} isDark={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("Playwright Browser"));
    expect(onClick).toHaveBeenCalledWith("browser.playwright");
  });

  test("needs_review entry shows review tag and omits license tag", () => {
    const review = { ...entry, id: "productivity.slack", status: "needs_review", trustLevel: "needs_review", license: "Unverified" };
    render(<StoreToolkitCard entry={review} isDark={false} onClick={() => {}} />);
    expect(screen.getByText("toolkit.trust_needs_review")).toBeInTheDocument();
    expect(screen.queryByText("Unverified")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/components/store_toolkit_card.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/COMPONENTs/toolkit/components/store_toolkit_card.js`:

```js
import { useContext } from "react";
import ToolkitIcon, { isBuiltinToolkitIcon, isFileToolkitIcon } from "./toolkit_icon";
import { SOURCE_CONFIG, TRUST_CONFIG } from "../constants";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const Tag = ({ text, color, bg, fontFamily }) => (
  <span
    style={{
      fontSize: 10,
      fontFamily,
      fontWeight: 500,
      letterSpacing: "0.3px",
      padding: "1.5px 8px",
      borderRadius: 999,
      backgroundColor: bg,
      color,
      lineHeight: 1.7,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

const StoreToolkitCard = ({ entry, isDark, onClick }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const tools = Array.isArray(entry.tools) ? entry.tools : [];
  const sc = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.builtin;
  const isReview = entry.status === "needs_review";
  const trust = TRUST_CONFIG[entry.trustLevel] || TRUST_CONFIG.verified;

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const licBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const licColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";

  const iconWrapSize = 44;
  const hasFileIcon = isFileToolkitIcon(entry.toolkitIcon);
  const iconWrapBackground = isBuiltinToolkitIcon(entry.toolkitIcon)
    ? entry.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";

  const transportLabel = `${t("toolkit.source_mcp")}${entry.mcp?.transport ? ` · ${entry.mcp.transport}` : ""}`;

  return (
    <div
      className="store-toolkit-card-wrapper"
      onClick={() => onClick?.(entry.id)}
      style={{ cursor: "pointer" }}
    >
      <style>{`.store-toolkit-card-wrapper > div > div { box-shadow: none !important; }`}</style>
      <Card
        width="100%"
        height="100%"
        disabled
        border_radius={12}
        style={{ cursor: "pointer" }}
        body_style={{ padding: "14px", display: "flex", flexDirection: "column", gap: 0 }}
      >
        {/* icon + tool count */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          {hasFileIcon ? (
            <ToolkitIcon icon={entry.toolkitIcon} size={iconWrapSize} fallbackColor={sc.color} style={{ borderRadius: 12 }} />
          ) : (
            <div
              data-testid="store-card-icon-wrap"
              style={{
                width: iconWrapSize,
                height: iconWrapSize,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: iconWrapBackground,
              }}
            >
              <ToolkitIcon icon={entry.toolkitIcon} size={26} fallbackColor={sc.color} />
            </div>
          )}
          {tools.length > 0 && (
            <span style={{ fontSize: 10.5, fontFamily, color: mutedColor }}>
              {tools.length} {t("toolkit.store_tools_count")}
            </span>
          )}
        </div>

        {/* name */}
        <span
          style={{
            fontSize: 12.5,
            fontFamily,
            fontWeight: 500,
            color: textColor,
            letterSpacing: "0.15px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            marginBottom: 3,
          }}
        >
          {entry.toolkitName}
        </span>

        {/* description */}
        {entry.toolkitDescription && (
          <span
            style={{
              fontSize: 11.5,
              fontFamily,
              fontWeight: 400,
              color: mutedColor,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginBottom: 11,
            }}
          >
            {entry.toolkitDescription}
          </span>
        )}

        {/* footer: three tags */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: "auto", flexWrap: "wrap" }}>
          <Tag text={transportLabel} color={sc.color} bg={sc.bg} fontFamily={fontFamily} />
          <Tag text={t(trust.labelKey)} color={trust.color} bg={trust.bg} fontFamily={fontFamily} />
          {!isReview && entry.license && (
            <Tag text={entry.license} color={licColor} bg={licBg} fontFamily={fontFamily} />
          )}
        </div>
      </Card>
    </div>
  );
};

export default StoreToolkitCard;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/components/store_toolkit_card.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Mark task complete** — leave dirty.

---

## Task 5: StoreToolkitDetailPanel component

**Files:**
- Create: `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js`
- Test: `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js`:

```js
import { render, screen, fireEvent } from "@testing-library/react";
import StoreToolkitDetailPanel from "./store_toolkit_detail_panel";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => <span data-testid="toolkit-icon">{icon?.name || "fallback"}</span>,
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

jest.mock("../../../BUILTIN_COMPONENTs/code/code", () => ({
  __esModule: true,
  default: ({ code }) => <pre data-testid="code">{code}</pre>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div data-testid="markdown">{content}</div>,
}));

// No react/context mock: ConfigContext defaults to "" → theme is undefined → optional-chaining fallback.

const entry = {
  id: "browser.playwright",
  toolkitName: "Playwright Browser",
  toolkitDescription: "Browser automation through the official Playwright MCP server.",
  source: "mcp",
  status: "available",
  trustLevel: "verified",
  license: "Apache-2.0",
  sourceRepo: "https://github.com/microsoft/playwright-mcp",
  docsUrl: "https://github.com/microsoft/playwright-mcp",
  toolkitIcon: { type: "builtin", name: "globe" },
  mcp: { transport: "stdio" },
  setupPreview: "npx -y @playwright/mcp@latest",
  prerequisites: ["Node.js >= 18"],
  secrets: [],
  tools: [
    { name: "browser_navigate", title: "Navigate", requiresConfirmation: false },
    { name: "browser_click", title: "Click", requiresConfirmation: true },
  ],
  policySummary: { defaultEnabledTools: 0, confirmationRequiredTools: 1 },
  readmeMarkdown: "## Playwright\n\nDrives a browser.",
};

describe("StoreToolkitDetailPanel", () => {
  test("shows install button, disabled, with phase note", () => {
    render(<StoreToolkitDetailPanel entry={entry} isDark={false} onBack={() => {}} />);
    const install = screen.getByTestId("store-install-button");
    expect(install).toBeDisabled();
    expect(screen.getByText("toolkit.store_install_coming")).toBeInTheDocument();
  });

  test("renders setup command, tools, permissions and markdown", () => {
    render(<StoreToolkitDetailPanel entry={entry} isDark={false} onBack={() => {}} />);
    expect(screen.getByTestId("code").textContent).toBe("npx -y @playwright/mcp@latest");
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Click")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // auto-enabled
    expect(screen.getByText("1")).toBeInTheDocument(); // ask before run
    expect(screen.getByTestId("markdown").textContent).toContain("Playwright");
  });

  test("repository and docs links open externally", () => {
    render(<StoreToolkitDetailPanel entry={entry} isDark={false} onBack={() => {}} />);
    const repo = screen.getByText("toolkit.store_repository").closest("a");
    expect(repo).toHaveAttribute("href", "https://github.com/microsoft/playwright-mcp");
    expect(repo).toHaveAttribute("target", "_blank");
    expect(repo).toHaveAttribute("rel", "noreferrer");
  });

  test("back button calls onBack", () => {
    const onBack = jest.fn();
    render(<StoreToolkitDetailPanel entry={entry} isDark={false} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("store-detail-back"));
    expect(onBack).toHaveBeenCalled();
  });

  test("needs_review entry renders the warning banner", () => {
    const review = { ...entry, status: "needs_review", trustLevel: "needs_review" };
    render(<StoreToolkitDetailPanel entry={review} isDark={false} onBack={() => {}} />);
    expect(screen.getByText("toolkit.store_needs_review_title")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js`:

```js
import { useContext } from "react";
import ToolkitIcon, { isBuiltinToolkitIcon, isFileToolkitIcon } from "./toolkit_icon";
import { SOURCE_CONFIG, TRUST_CONFIG } from "../constants";
import Code from "../../../BUILTIN_COMPONENTs/code/code";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const StoreToolkitDetailPanel = ({ entry, isDark, onBack }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
  const labelColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const chipColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const licBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const licColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";

  const sc = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.builtin;
  const trust = TRUST_CONFIG[entry.trustLevel] || TRUST_CONFIG.verified;
  const isReview = entry.status === "needs_review";
  const tools = Array.isArray(entry.tools) ? entry.tools : [];
  const prerequisites = Array.isArray(entry.prerequisites) ? entry.prerequisites : [];
  const secrets = Array.isArray(entry.secrets) ? entry.secrets : [];
  const transportLabel = `${t("toolkit.source_mcp")}${entry.mcp?.transport ? ` · ${entry.mcp.transport}` : ""}`;

  const hasFileIcon = isFileToolkitIcon(entry.toolkitIcon);
  const iconBg = isBuiltinToolkitIcon(entry.toolkitIcon)
    ? entry.toolkitIcon.backgroundColor
    : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  const Label = ({ children }) => (
    <span style={{ fontSize: 10.5, fontFamily, fontWeight: 600, letterSpacing: "0.6px", textTransform: "uppercase", color: labelColor, display: "block", marginBottom: 8 }}>
      {children}
    </span>
  );
  const Tag = ({ text, color, bg }) => (
    <span style={{ fontSize: 10, fontFamily, fontWeight: 500, letterSpacing: "0.3px", padding: "1.5px 8px", borderRadius: 999, backgroundColor: bg, color, lineHeight: 1.7, whiteSpace: "nowrap" }}>{text}</span>
  );
  const Divider = () => <div style={{ height: 1, backgroundColor: dividerColor, margin: "16px 0" }} />;
  const Link = ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontFamily, fontWeight: 500, color: "#2563eb", textDecoration: "none", display: "inline-flex", gap: 3, alignItems: "center" }}>
      ↗ {children}
    </a>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* back */}
      <div style={{ flexShrink: 0, paddingRight: 24, marginBottom: 12 }}>
        <button
          data-testid="store-detail-back"
          onClick={onBack}
          style={{
            fontSize: 12, fontFamily, fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
            background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
            border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer",
          }}
        >
          ← {t("toolkit.store")}
        </button>
      </div>

      <div className="scrollable" style={{ flex: 1, overflowY: "auto", paddingRight: 24, paddingBottom: 24 }}>
        {/* header */}
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          {hasFileIcon ? (
            <ToolkitIcon icon={entry.toolkitIcon} size={52} fallbackColor={sc.color} style={{ borderRadius: 14, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: iconBg, flexShrink: 0 }}>
              <ToolkitIcon icon={entry.toolkitIcon} size={28} fallbackColor={sc.color} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontFamily, fontWeight: 600, color: textColor, display: "block", marginBottom: 4 }}>
              {entry.toolkitName}
            </span>
            {entry.toolkitDescription && (
              <p style={{ fontSize: 12, fontFamily, color: mutedColor, margin: "0 0 9px", lineHeight: 1.5 }}>
                {entry.toolkitDescription}
              </p>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Tag text={transportLabel} color={sc.color} bg={sc.bg} />
              <Tag text={t(trust.labelKey)} color={trust.color} bg={trust.bg} />
              {!isReview && entry.license && <Tag text={entry.license} color={licColor} bg={licBg} />}
            </div>
          </div>

          {/* install (right, disabled) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <button
              data-testid="store-install-button"
              disabled
              style={{
                fontSize: 13, fontFamily, fontWeight: 600,
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                border: "none", borderRadius: 9, padding: "8px 22px", cursor: "not-allowed",
              }}
            >
              {t("toolkit.store_install")}
            </button>
            <span style={{ fontSize: 10, fontFamily, color: labelColor }}>{t("toolkit.store_install_coming")}</span>
          </div>
        </div>

        {/* needs_review banner */}
        {isReview && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 9, background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.22)" }}>
            <span style={{ fontSize: 12, fontFamily, fontWeight: 600, color: "#d97706", display: "block", marginBottom: 2 }}>
              {t("toolkit.store_needs_review_title")}
            </span>
            <span style={{ fontSize: 11.5, fontFamily, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }}>
              {t("toolkit.store_needs_review_desc")}
            </span>
          </div>
        )}

        {/* links */}
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          {entry.sourceRepo && <Link href={entry.sourceRepo}>{t("toolkit.store_repository")}</Link>}
          {entry.docsUrl && <Link href={entry.docsUrl}>{t("toolkit.store_docs")}</Link>}
        </div>

        <Divider />

        {/* setup command */}
        <div style={{ marginBottom: 18 }}>
          <Label>{t("toolkit.store_setup_command")}</Label>
          <Code code={entry.setupPreview} language="bash" />
        </div>

        {/* requirements */}
        {prerequisites.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Label>{t("toolkit.store_requirements")}</Label>
            {prerequisites.map((p) => (
              <div key={p} style={{ fontSize: 12, fontFamily, color: chipColor, lineHeight: 1.7 }}>• {p}</div>
            ))}
          </div>
        )}

        {/* secrets */}
        {secrets.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Label>{t("toolkit.store_secrets")}</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {secrets.map((s) => (
                <span key={s.key} style={{ fontSize: 11.5, fontFamily, fontWeight: 500, color: chipColor, background: chipBg, padding: "3px 10px", borderRadius: 6 }}>
                  {s.key}{s.optional ? " (optional)" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* tools */}
        {tools.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Label>{tools.length} {t("toolkit.store_tools_count")}</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tools.map((tool) => (
                <span
                  key={tool.name}
                  style={{
                    fontSize: 11.5, fontFamily, fontWeight: 500,
                    color: tool.requiresConfirmation ? "#d97706" : chipColor,
                    background: tool.requiresConfirmation ? "rgba(217,119,6,0.10)" : chipBg,
                    padding: "3px 10px", borderRadius: 6, display: "inline-flex", gap: 4,
                  }}
                >
                  {tool.requiresConfirmation ? "🔒 " : ""}{tool.title || tool.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* permissions */}
        {entry.policySummary && (
          <div style={{ marginBottom: 18 }}>
            <Label>{t("toolkit.store_permissions")}</Label>
            <div style={{ display: "flex", gap: 18 }}>
              <div>
                <div style={{ fontSize: 18, fontFamily, fontWeight: 600, color: textColor }}>{entry.policySummary.defaultEnabledTools}</div>
                <div style={{ fontSize: 10.5, fontFamily, color: labelColor }}>{t("toolkit.store_auto_enabled")}</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontFamily, fontWeight: 600, color: textColor }}>{entry.policySummary.confirmationRequiredTools}</div>
                <div style={{ fontSize: 10.5, fontFamily, color: labelColor }}>{t("toolkit.store_ask_before_run")}</div>
              </div>
            </div>
          </div>
        )}

        <Divider />

        {/* about */}
        <Label>{t("toolkit.store_about")}</Label>
        {entry.readmeMarkdown ? <Markdown content={entry.readmeMarkdown} /> : null}
      </div>
    </div>
  );
};

export default StoreToolkitDetailPanel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Mark task complete** — leave dirty.

---

## Task 6: Rewrite ToolkitStorePage

**Files:**
- Modify: `src/COMPONENTs/toolkit/pages/toolkit_store_page.js`
- Test: `src/COMPONENTs/toolkit/pages/toolkit_store_page.test.js`

> Run `gitnexus_impact({target: "ToolkitStorePage", direction: "upstream"})` first.

- [ ] **Step 1: Write the failing test**

Create `src/COMPONENTs/toolkit/pages/toolkit_store_page.test.js`:

```js
import { render, screen, fireEvent } from "@testing-library/react";
import ToolkitStorePage from "./toolkit_store_page";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

// No react/context mock: ConfigContext defaults to "" → theme is undefined → optional-chaining fallback.

// Render store cards as simple stubs exposing entry id + name.
jest.mock("../components/store_toolkit_card", () => ({
  __esModule: true,
  default: ({ entry, onClick }) => (
    <button data-testid={`card-${entry.id}`} onClick={() => onClick(entry.id)}>
      {entry.toolkitName}
    </button>
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/input", () => ({
  __esModule: true,
  Input: ({ value, set_value, placeholder }) => (
    <input aria-label="search" placeholder={placeholder} value={value} onChange={(e) => set_value(e.target.value)} />
  ),
}));

jest.mock("../components/segmented_control", () => ({
  __esModule: true,
  default: ({ sections, onChange }) => (
    <div>
      {sections.map((s) => (
        <button key={s.key} data-testid={`cat-${s.key}`} onClick={() => onChange(s.key)}>{s.label}</button>
      ))}
    </div>
  ),
}));

describe("ToolkitStorePage", () => {
  test("renders all seed cards by default", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);
    expect(screen.getByTestId("card-browser.playwright")).toBeInTheDocument();
    expect(screen.getByTestId("card-dev.github-remote")).toBeInTheDocument();
    expect(screen.getByTestId("card-productivity.notion-remote")).toBeInTheDocument();
  });

  test("search filters cards", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "github" } });
    expect(screen.getByTestId("card-dev.github-remote")).toBeInTheDocument();
    expect(screen.queryByTestId("card-browser.playwright")).toBeNull();
  });

  test("category filter narrows cards", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);
    fireEvent.click(screen.getByTestId("cat-browser"));
    expect(screen.getByTestId("card-browser.playwright")).toBeInTheDocument();
    expect(screen.queryByTestId("card-dev.github-remote")).toBeNull();
  });

  test("empty search shows empty state", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "zzzznotareal" } });
    expect(screen.getByText("toolkit.store_empty_search")).toBeInTheDocument();
  });

  test("Add Custom MCP CTA is rendered and disabled", () => {
    render(<ToolkitStorePage isDark={false} onEntryClick={() => {}} />);
    expect(screen.getByTestId("store-add-custom")).toBeDisabled();
  });

  test("clicking a card calls onEntryClick with id", () => {
    const onEntryClick = jest.fn();
    render(<ToolkitStorePage isDark={false} onEntryClick={onEntryClick} />);
    fireEvent.click(screen.getByTestId("card-browser.playwright"));
    expect(onEntryClick).toHaveBeenCalledWith("browser.playwright");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/pages/toolkit_store_page.test.js`
Expected: FAIL — current placeholder page renders none of these testids.

- [ ] **Step 3: Rewrite the page**

Replace the entire contents of `src/COMPONENTs/toolkit/pages/toolkit_store_page.js`:

```js
import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import SegmentedControl from "../components/segmented_control";
import StoreToolkitCard from "../components/store_toolkit_card";
import { STORE_CATEGORY_CONFIG } from "../constants";
import { listMcpStoreEntries, searchMcpStoreEntries } from "../../../SERVICEs/mcp_toolkit_store";

const ToolkitStorePage = ({ isDark, onEntryClick }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const entries = useMemo(() => listMcpStoreEntries(), []);
  const filtered = useMemo(
    () => searchMcpStoreEntries(entries, search, category),
    [entries, search, category],
  );

  const sections = useMemo(
    () => STORE_CATEGORY_CONFIG.map((c) => ({ key: c.key, icon: c.icon, label: t(c.labelKey) })),
    [t],
  );

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* search + add custom */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <Input
          prefix_icon="search"
          value={search}
          set_value={(v) => setSearch(v)}
          placeholder={t("toolkit.store_search_placeholder")}
          style={{
            flex: 1, fontSize: 13, fontFamily, borderRadius: 7,
            color: isDark ? "#fff" : "#222", paddingVertical: 7, paddingHorizontal: 10,
          }}
        />
        <button
          data-testid="store-add-custom"
          disabled
          title={t("toolkit.store_add_custom_subtitle")}
          style={{
            fontSize: 11.5, fontFamily, fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)",
            background: "transparent",
            border: `1px dashed ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.16)"}`,
            borderRadius: 7, padding: "7px 11px", cursor: "not-allowed", whiteSpace: "nowrap",
          }}
        >
          ＋ {t("toolkit.store_add_custom")}
        </button>
      </div>

      {/* category filter */}
      <div style={{ marginBottom: 14 }}>
        <SegmentedControl sections={sections} selected={category} onChange={setCategory} isDark={isDark} />
      </div>

      {/* grid */}
      {filtered.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {filtered.map((entry) => (
            <StoreToolkitCard key={entry.id} entry={entry} isDark={isDark} onClick={onEntryClick} />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 40, fontSize: 12, fontFamily, color: mutedColor }}>
          {t("toolkit.store_empty_search")}
        </div>
      )}
    </div>
  );
};

export default ToolkitStorePage;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/pages/toolkit_store_page.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Mark task complete** — leave dirty.

---

## Task 7: Wire store detail into ToolkitsPage

**Files:**
- Modify: `src/COMPONENTs/toolkit/pages/toolkits_page.js`
- Test: `src/COMPONENTs/toolkit/pages/toolkits_page.test.js`

> Run `gitnexus_impact({target: "ToolkitsPage", direction: "upstream"})` first; report blast radius before editing.

**Approach:** add a `kind` discriminator to the slide-in state. Store page gets an `onEntryClick(entryId)` callback that opens a `"store"` detail; the existing installed `onToolClick` opens an `"installed"` detail. The overlay renders `StoreToolkitDetailPanel` or `ToolkitDetailPanel` based on `kind`. Default `activeTab` stays `"installed"`.

- [ ] **Step 1: Write the failing integration test**

Create `src/COMPONENTs/toolkit/pages/toolkits_page.test.js`:

```js
import { render, screen, fireEvent } from "@testing-library/react";
import ToolkitsPage from "./toolkits_page";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

// Installed page stub: a button that opens an installed detail.
jest.mock("./toolkit_installed_page", () => ({
  __esModule: true,
  default: ({ onToolClick }) => (
    <button data-testid="installed-row" onClick={() => onToolClick("inst.kit", null, { toolkitId: "inst.kit", tools: [] })}>
      installed row
    </button>
  ),
}));

// Store page stub: a button that opens a store detail.
jest.mock("./toolkit_store_page", () => ({
  __esModule: true,
  default: ({ onEntryClick }) => (
    <button data-testid="store-card" onClick={() => onEntryClick("browser.playwright")}>store card</button>
  ),
}));

jest.mock("../components/toolkit_detail_panel", () => ({
  __esModule: true,
  default: () => <div data-testid="installed-detail">installed detail</div>,
}));

jest.mock("../components/store_toolkit_detail_panel", () => ({
  __esModule: true,
  default: ({ entry }) => <div data-testid="store-detail">store detail: {entry.toolkitName}</div>,
}));

describe("ToolkitsPage detail routing", () => {
  test("default tab is installed", () => {
    render(<ToolkitsPage isDark={false} />);
    expect(screen.getByTestId("installed-row")).toBeInTheDocument();
    expect(screen.queryByTestId("store-card")).toBeNull();
  });

  test("clicking a store card opens the store detail panel, not the installed one", () => {
    render(<ToolkitsPage isDark={false} />);
    fireEvent.click(screen.getByText("toolkit.store")); // switch to Store tab
    fireEvent.click(screen.getByTestId("store-card"));
    expect(screen.getByTestId("store-detail")).toHaveTextContent("Playwright Browser");
    expect(screen.queryByTestId("installed-detail")).toBeNull();
  });

  test("clicking an installed row opens the installed detail panel, not the store one", () => {
    render(<ToolkitsPage isDark={false} />);
    fireEvent.click(screen.getByTestId("installed-row"));
    expect(screen.getByTestId("installed-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("store-detail")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/pages/toolkits_page.test.js`
Expected: FAIL — store detail never renders (store page currently gets no `onEntryClick`; overlay only renders `ToolkitDetailPanel`).

- [ ] **Step 3: Modify toolkits_page.js**

Apply these edits to `src/COMPONENTs/toolkit/pages/toolkits_page.js`:

**3a.** Add the import (after the existing `ToolkitDetailPanel` import, line ~6):

```js
import StoreToolkitDetailPanel from "../components/store_toolkit_detail_panel";
import { getMcpStoreEntry } from "../../../SERVICEs/mcp_toolkit_store";
```

**3b.** Replace the `openDetail` callback so it records a `kind`:

```js
  const openDetail = useCallback((kind, payload) => {
    setSelectedToolkit({ kind, ...payload });
    setDetailMounted(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setDetailVisible(true)),
    );
  }, []);
```

**3c.** Replace `handleToolClick` and add `handleEntryClick`:

```js
  const handleToolClick = useCallback(
    (toolkitId, toolName, toolkit) => {
      openDetail("installed", { toolkitId, toolName, toolkit });
    },
    [openDetail],
  );

  const handleEntryClick = useCallback(
    (entryId) => {
      const entry = getMcpStoreEntry(entryId);
      if (entry) openDetail("store", { entry });
    },
    [openDetail],
  );
```

**3d.** In `renderPage()`, pass the store callback:

```js
      case "store":
        return <ToolkitStorePage isDark={isDark} onEntryClick={handleEntryClick} />;
```

**3e.** Replace the overlay's panel render (the `<ToolkitDetailPanel ... />` block inside `detailMounted && selectedToolkit && (...)`) with a kind switch:

```js
            {selectedToolkit.kind === "store" ? (
              <StoreToolkitDetailPanel
                entry={selectedToolkit.entry}
                isDark={isDark}
                onBack={closeDetail}
              />
            ) : (
              <ToolkitDetailPanel
                toolkitId={selectedToolkit.toolkitId}
                toolName={selectedToolkit.toolName}
                tools={selectedToolkit.toolkit?.tools}
                isDark={isDark}
                isBuiltin={isBuiltinToolkit(selectedToolkit.toolkit)}
                defaultEnabled={Boolean(selectedToolkit.toolkit?.defaultEnabled)}
                onToggleEnabled={(id, val) => {
                  installedHandlersRef.current?.handleToggleEnabled?.(id, val);
                  setSelectedToolkit((prev) =>
                    prev
                      ? { ...prev, toolkit: { ...prev.toolkit, defaultEnabled: val } }
                      : prev,
                  );
                }}
                onDelete={(id) => {
                  installedHandlersRef.current?.handleDelete?.(id);
                  closeDetail();
                }}
                onBack={closeDetail}
              />
            )}
```

> Note: the overlay still guards on `detailMounted && selectedToolkit`. Keep `activeTab` initial value `"installed"` unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit/pages/toolkits_page.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full toolkit suite for regressions**

Run: `npm test -- --watchAll=false src/COMPONENTs/toolkit src/SERVICEs/mcp_toolkit_store.test.js`
Expected: PASS. Pre-existing unrelated failures (if any) must be documented, not "fixed" silently.

- [ ] **Step 6: Mark task complete** — leave dirty.

---

## Final Verification

- [ ] Run the full targeted suite:

Run: `npm test -- --watchAll=false src/SERVICEs/mcp_toolkit_store.test.js src/COMPONENTs/toolkit`
Expected: all green (or pre-existing unrelated failures documented).

- [ ] Manual smoke (optional, via `pupu-test-api` skill or `npm start`): open Toolkit modal → Store tab shows MCP cards → search/category filter works → click card → detail with disabled Install + setup command + tools/permissions → Add Custom disabled → Installed tab unaffected.

- [ ] Leave everything dirty for the owner to review and commit.

---

## Spec Coverage Check

| Spec requirement | Task |
|------------------|------|
| registry service (list/get/search) | 1 |
| 7 seed entries, http+stdio shapes, secrets/prereqs | 1 |
| SOURCE_CONFIG.mcp (violet) + STORE_CATEGORY_CONFIG + TRUST_CONFIG | 2 |
| i18n en + zh-CN (store_* / source_mcp / trust_*) | 3 |
| info card (3 tags, tool count, no button) | 4 |
| detail panel (Install right/disabled, setup Code, requirements, secrets, tools 🔒, permissions, links, markdown, needs_review banner) | 5 |
| Store page (search, category SegmentedControl translated, grid, empty state, Add Custom disabled) | 6 |
| ToolkitsPage kind routing + default tab installed + integration tests | 7 |
| raw MCPToolkit stays hidden / no runtime / no IPC | by construction (no such code added) |
