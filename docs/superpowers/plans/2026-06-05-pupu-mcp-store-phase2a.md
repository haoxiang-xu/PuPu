# PuPu MCP Store — Phase 2A Implementation Plan（UI）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。Steps 用 `- [ ]` 跟踪。

**Goal:** 把 Phase 1 的只读 MCP Store 升级成可安装 curated MCP：Store/detail 可 Install、Installed/Settings 可 delete、各消费面（Installed 页 / Chat selector / Agent Builder）安装后能看到 MCP。

**Architecture:** 新增一层薄 service `mcp_install.js`（封装 installable 判定 / workspace 校验 / install·delete / installed-set 查询），UI 各面调它；Store 卡片与 detail 变 install-aware（按钮状态机）；Installed 页与 Settings(local_storage) 新增 MCP delete/管理；selector/Agent Builder 确保 MCP 进 catalog 并在 install/delete 后刷新。**只做 UI，不碰 backend/IPC/runtime。**

**Tech Stack:** React 19（JS only、inline styles、no PropTypes）、mini_react、builtin 组件、Jest + @testing-library/react（`CI=true npx react-scripts test --watchAll=false <path>`）。

**Spec:** `docs/superpowers/specs/2026-06-05-pupu-mcp-store-phase2a-design.md`

---

## ⚠️ 执行约定

1. **不自动 commit**，每 task 末尾留 dirty。
2. 改既有 symbol 前跑 `gitnexus_impact`（`ToolkitStorePage`/`ToolkitsPage`/`ToolkitInstalledPage`/`ToolkitDetailPanel`/`LocalStorageSettings`）。
3. 测试命令：`CI=true npx react-scripts test --watchAll=false <path>`（**别用 `npx jest`**，会 babel 失败）。
4. 组件测试**不要** mock react useContext（ConfigContext 默认 `""`，optional chaining 已 fallback）。

## ✅ API 契约（codex 2026-06-05 已确认，照此实现）

- `listMcpToolkits()` → `{ toolkits: [REC], count }`
- `installMcpToolkit({ entryId, workspaceRoot })` → `{ toolkit: REC }`（成功）
- `checkMcpToolkitHealth(toolkitId, { workspaceRoot })` → `{ toolkit: REC }`
- `reloadMcpToolkits({ workspaceRoot })` → `{ toolkits: [REC], count }`
- `deleteMcpToolkit(toolkitId)` → `{ ok: true, toolkitId }`
- 错误码透传 wrapper：`mcp_workspace_required` / `mcp_already_installed` / `unsupported_mcp_entry` / `mcp_install_failed` / `mcp_health_failed` / `mcp_toolkit_not_found`

**REC（toolkit record，统一形状）**：
`{ entryId, toolkitId（关联用这个，不是 id）, toolkitName, toolkitDescription, toolkitIcon, source:"mcp", status:"available"|"error"|"unknown", tools:[{name,title,description,requiresConfirmation}], toolCount, lastCheckedAt, lastError, workspaceRoot, workspace_root, license, sourceRepo, docsUrl, readmeMarkdown, policySummary }`

**Agent Builder（Task 8 已解 BLOCKED）**：codex 已让 installed MCP 同时进 `listToolModalCatalog()`（v2）**和** `getToolkitCatalog()`（v1）。v1 MCP entry shape：`{ id:"mcp.*", name, class_name:"MCPToolkit", module, kind:"mcp", source:"mcp", toolkitName, toolkitDescription, toolkitIcon, status, tools:[{name,description}] }`。

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/SERVICEs/mcp_install.js` | installable 判定 + workspace 校验 + install/delete + installed-set 查询 | Create |
| `src/SERVICEs/mcp_install.test.js` | service 单测 | Create |
| `src/locales/en.json` / `zh-CN.json` | Phase 2A i18n keys | Modify |
| `src/COMPONENTs/toolkit/components/store_toolkit_card.js` | 卡片右侧 action（Install/Installed/Coming soon），整卡点击 vs 按钮 | Modify |
| `src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js` | detail install-aware：status chip + 真实 Install + 错误/loading | Modify |
| `src/COMPONENTs/toolkit/pages/toolkit_store_page.js` | 注入 installedIds + onInstall 回调 | Modify |
| `src/COMPONENTs/toolkit/pages/toolkits_page.js` | 加载 installed MCP set + install/delete 后刷新协调 | Modify |
| `src/COMPONENTs/toolkit/pages/toolkit_installed_page.js` | `handleDelete` 实现（仅 MCP）+ 安装后刷新 | Modify |
| `src/COMPONENTs/toolkit/components/toolkit_row.js` | MCP 行显示 delete 入口（仅 source==="mcp"） | Modify |
| `src/COMPONENTs/toolkit/components/toolkit_detail_panel.js` | installed detail：MCP 项 delete 走真实 API | Modify |
| `src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.js` | Settings MCP 管理 section | Create |
| `src/COMPONENTs/settings/local_storage/index.js` | 挂载 `<McpToolkitsSection>` | Modify |
| `src/COMPONENTs/chat-input/hooks/use_chat_input_toolkits.js` | 确认 MCP 不被 filter 掉 | Verify/Modify |
| 测试若干 | 见各 task | Create |

执行顺序：1 service → 2 i18n → 3 store card → 4 store detail → 5 toolkits_page 协调 → 6 installed delete(page+row+detail) → 7 Settings section → 8 selector/agent builder 校验 → 9 汇总测试。

---

## Task 1: MCP install service

**Files:** Create `src/SERVICEs/mcp_install.js` + `src/SERVICEs/mcp_install.test.js`

- [ ] **Step 1 — 契约已定**：按上方 codex 确认的 REC 形状实现，关联字段用 `toolkitId`，status ∈ available/error/unknown。无需实测。

- [ ] **Step 2 — 写失败测试** `src/SERVICEs/mcp_install.test.js`：

```js
import {
  INSTALLABLE_ENTRY_IDS,
  isEntryInstallable,
  entryInstallState,
  resolveInstallWorkspace,
} from "./mcp_install";

describe("mcp_install helpers", () => {
  test("only the three Phase 2A entries are installable", () => {
    expect(INSTALLABLE_ENTRY_IDS).toEqual(
      new Set(["browser.playwright", "memory.memory", "workspace.filesystem"]),
    );
    expect(isEntryInstallable({ id: "browser.playwright", status: "available" })).toBe(true);
    expect(isEntryInstallable({ id: "dev.github-remote", status: "available" })).toBe(false);
    expect(isEntryInstallable({ id: "productivity.slack", status: "needs_review" })).toBe(false);
  });

  test("entryInstallState reflects installed set", () => {
    const installed = new Set(["mcp.browser.playwright"]);
    expect(entryInstallState({ id: "browser.playwright", toolkitId: "mcp.browser.playwright", status: "available" }, installed)).toBe("installed");
    expect(entryInstallState({ id: "memory.memory", toolkitId: "mcp.memory.memory", status: "available" }, installed)).toBe("installable");
    expect(entryInstallState({ id: "dev.github-remote", toolkitId: "mcp.dev.github-remote", status: "available" }, installed)).toBe("coming_soon");
    expect(entryInstallState({ id: "productivity.slack", toolkitId: "mcp.productivity.slack", status: "needs_review" }, installed)).toBe("needs_review");
  });

  test("filesystem requires workspace root, others do not", () => {
    expect(resolveInstallWorkspace({ id: "workspace.filesystem" }, "")).toEqual({ ok: false, code: "mcp_workspace_required" });
    expect(resolveInstallWorkspace({ id: "workspace.filesystem" }, "/ws")).toEqual({ ok: true, workspaceRoot: "/ws" });
    expect(resolveInstallWorkspace({ id: "browser.playwright" }, "")).toEqual({ ok: true, workspaceRoot: "" });
  });
});
```

- [ ] **Step 3 — 实现** `src/SERVICEs/mcp_install.js`：

```js
import api from "./api";
import { readWorkspaceRoot } from "../COMPONENTs/settings/runtime";
import { setDefaultToolkitEnabled } from "./default_toolkit_store";

export const INSTALLABLE_ENTRY_IDS = new Set([
  "browser.playwright",
  "memory.memory",
  "workspace.filesystem",
]);

const FILESYSTEM_ENTRY_ID = "workspace.filesystem";

/* installable = 在白名单且 status 非 needs_review */
export function isEntryInstallable(entry) {
  if (!entry) return false;
  if (entry.status === "needs_review") return false;
  return INSTALLABLE_ENTRY_IDS.has(entry.id);
}

/* installed | installable | needs_review | coming_soon */
export function entryInstallState(entry, installedIds) {
  if (!entry) return "coming_soon";
  if (installedIds && installedIds.has(entry.toolkitId)) return "installed";
  if (entry.status === "needs_review") return "needs_review";
  if (INSTALLABLE_ENTRY_IDS.has(entry.id)) return "installable";
  return "coming_soon";
}

/* filesystem 必须有 workspace root；其它不需要。绝不 fallback 到任何兜底目录。 */
export function resolveInstallWorkspace(entry, workspaceRoot) {
  if (entry?.id === FILESYSTEM_ENTRY_ID) {
    const wr = (workspaceRoot || "").trim();
    if (!wr) return { ok: false, code: "mcp_workspace_required" };
    return { ok: true, workspaceRoot: wr };
  }
  return { ok: true, workspaceRoot: (workspaceRoot || "").trim() };
}

/* 当前已安装 MCP 的 toolkitId 集合（用于卡片 installed 状态） */
export async function getInstalledMcpIds() {
  const payload = await api.unchain.listMcpToolkits();
  const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
  return new Set(list.map((tk) => tk.toolkitId).filter(Boolean));
}

/* 执行安装：校验 workspace → installMcpToolkit → auto-enable。
   返回 { ok, toolkitId } 或抛带 .code 的错误。 */
export async function installMcpEntry(entry, { workspaceRoot } = {}) {
  if (!isEntryInstallable(entry)) {
    const err = new Error("Entry not installable");
    err.code = "unsupported_mcp_entry";
    throw err;
  }
  const wr = workspaceRoot !== undefined ? workspaceRoot : readWorkspaceRoot();
  const resolved = resolveInstallWorkspace(entry, wr);
  if (!resolved.ok) {
    const err = new Error("Workspace required");
    err.code = resolved.code;
    throw err;
  }
  await api.unchain.installMcpToolkit({
    entryId: entry.id,
    workspaceRoot: resolved.workspaceRoot,
  });
  setDefaultToolkitEnabled("global", entry.toolkitId, true);
  return { ok: true, toolkitId: entry.toolkitId };
}

export async function deleteMcpEntry(toolkitId) {
  await api.unchain.deleteMcpToolkit(toolkitId);
  return { ok: true, toolkitId };
}
```

- [ ] **Step 4** — `CI=true npx react-scripts test --watchAll=false src/SERVICEs/mcp_install.test.js` → PASS。
- [ ] **Step 5** — 标记完成，dirty。

---

## Task 2: i18n keys

**Files:** Modify `src/locales/en.json` + `src/locales/zh-CN.json`（toolkit 命名空间内追加；local_storage 命名空间加 MCP section keys）

- [ ] **Step 1** — en.json 的 `"toolkit"` 内追加：

```json
    "store_installed": "Installed",
    "store_coming_soon": "Coming soon",
    "store_needs_review_action": "Needs review",
    "store_installing": "Installing…",
    "store_install_error": "Install failed",
    "store_workspace_required": "Select an agent workspace before installing Filesystem MCP.",
    "store_already_installed": "Already installed",
    "store_delete": "Delete",
    "store_delete_confirm": "Remove this MCP toolkit?",
    "store_status_available": "Available",
    "store_status_error": "Error",
    "store_status_unknown": "Unknown",
    "store_needs_review_phase2a": "Not installable in this phase — needs secret / OAuth / review / custom setup.",
```

en.json 的 `"local_storage"` 内追加：

```json
    "section_mcp": "MCP Toolkits",
    "mcp_reload_all": "Reload all",
    "mcp_no_installed": "No MCP toolkits installed.",
    "mcp_tools_count": "tools",
    "mcp_last_checked": "checked",
    "mcp_workspace": "workspace",
    "mcp_delete_confirm": "Remove this MCP toolkit?",
```

- [ ] **Step 2** — zh-CN.json 对称追加（`toolkit`）：

```json
    "store_installed": "已安装",
    "store_coming_soon": "即将推出",
    "store_needs_review_action": "待审核",
    "store_installing": "安装中…",
    "store_install_error": "安装失败",
    "store_workspace_required": "安装 Filesystem MCP 前请先选择 agent 工作区。",
    "store_already_installed": "已安装",
    "store_delete": "删除",
    "store_delete_confirm": "移除此 MCP 工具包？",
    "store_status_available": "可用",
    "store_status_error": "错误",
    "store_status_unknown": "未知",
    "store_needs_review_phase2a": "本阶段不可安装 —— 需 secret / OAuth / 审核 / 自定义配置。",
```

zh-CN.json 的 `"local_storage"` 内追加：

```json
    "section_mcp": "MCP 工具包",
    "mcp_reload_all": "全部刷新",
    "mcp_no_installed": "未安装 MCP 工具包。",
    "mcp_tools_count": "个工具",
    "mcp_last_checked": "检查于",
    "mcp_workspace": "工作区",
    "mcp_delete_confirm": "移除此 MCP 工具包？",
```

- [ ] **Step 3** — `node -e "require('./src/locales/en.json');require('./src/locales/zh-CN.json');console.log('ok')"` → ok。
- [ ] **Step 4** — 标记完成，dirty。

---

## Task 3: Store card install-aware

**Files:** Modify `store_toolkit_card.js` + `store_toolkit_card.test.js`

设计：卡片右侧加 action 按钮。`entryInstallState(entry, installedIds)` 决定按钮：
- `installable` → 主操作 `Install`（实色，可点，`onInstall(entry)`，`stopPropagation`）
- `installed` → disabled subtle `Installed`
- `coming_soon` → disabled `Coming soon`
- `needs_review` → disabled `Needs review`

整卡仍可点进 detail；action 按钮 `onClick` 必须 `e.stopPropagation()`。新增 props：`installedIds`、`onInstall`、`installing`（boolean，安装中显示 `Installing…` + 禁用）。

- [ ] **Step 1 — 失败测试**（追加到现有 `store_toolkit_card.test.js`）：

> mock `t(key)=>key`，按钮 label 文本即 key。`installable` label = `toolkit.store_install`（Phase 1 已有），`installed` = `toolkit.store_installed`，`coming_soon` = `toolkit.store_coming_soon`。新增 props：`installedIds`/`onInstall`/`installing`。在现有 describe 内追加：

```js
test("installable entry shows Install and stops propagation", () => {
  const onInstall = jest.fn();
  const onClick = jest.fn();
  render(<StoreToolkitCard entry={{ ...entry, id: "browser.playwright", toolkitId: "mcp.browser.playwright" }} isDark={false} installedIds={new Set()} onInstall={onInstall} onClick={onClick} />);
  const btn = screen.getByText("toolkit.store_install");
  fireEvent.click(btn);
  expect(onInstall).toHaveBeenCalled();
  expect(onClick).not.toHaveBeenCalled();
});

test("installed entry shows disabled Installed", () => {
  render(<StoreToolkitCard entry={{ ...entry, id: "browser.playwright", toolkitId: "mcp.browser.playwright" }} isDark={false} installedIds={new Set(["mcp.browser.playwright"])} onInstall={() => {}} onClick={() => {}} />);
  expect(screen.getByText("toolkit.store_installed")).toBeInTheDocument();
});

test("unsupported entry shows Coming soon", () => {
  render(<StoreToolkitCard entry={{ ...entry, id: "dev.github-remote", toolkitId: "mcp.dev.github-remote" }} isDark={false} installedIds={new Set()} onInstall={() => {}} onClick={() => {}} />);
  expect(screen.getByText("toolkit.store_coming_soon")).toBeInTheDocument();
});
```

- [ ] **Step 2** — 跑确认失败。
- [ ] **Step 3 — 实现**：在 footer 区右侧加 action。核心新增（在现有卡片 footer tags 之后、或 footer 行右侧）：

```js
// imports 顶部追加：
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { entryInstallState } from "../../../SERVICEs/mcp_install";

// 组件内：
const state = entryInstallState(entry, installedIds);
const actionLabel =
  installing ? t("toolkit.store_installing")
  : state === "installed" ? t("toolkit.store_installed")
  : state === "installable" ? t("toolkit.store_install")
  : state === "needs_review" ? t("toolkit.store_needs_review_action")
  : t("toolkit.store_coming_soon");
const actionEnabled = state === "installable" && !installing;

// footer 行改为 space-between：左 tags，右 action button
<div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: "auto", flexWrap: "wrap" }}>
  {/* …三个 Tag 不变… */}
  <div style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
    <Button
      label={actionLabel}
      disabled={!actionEnabled}
      onClick={() => actionEnabled && onInstall?.(entry)}
      style={{
        fontSize: 11,
        fontWeight: 600,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 999,
        color: actionEnabled ? (isDark ? "#fff" : "#111") : (isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"),
        root: { background: actionEnabled ? (isDark ? "rgba(255,255,255,0.14)" : "#111") : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)") },
        state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
      }}
    />
  </div>
</div>
```

props 签名改为 `({ entry, isDark, onClick, installedIds, onInstall, installing })`。

- [ ] **Step 4** — 跑测试 PASS（含现有 3 个用例不破）。
- [ ] **Step 5** — dirty。

---

## Task 4: Store detail install-aware

**Files:** Modify `store_toolkit_detail_panel.js` + test

把固定 header 区右上的 disabled Install 换成状态机按钮（installable 时真实可点），并在顶部加 **status chip**（Installed/Available/Coming soon/Needs review/Error）。新增 props：`installedIds`、`onInstall`、`installing`、`installError`。

- [ ] **Step 1 — 测试**（追加到现有 detail test）：

```js
test("installable detail shows enabled Install", () => {
  render(<StoreToolkitDetailPanel entry={{ ...entry, id: "browser.playwright", toolkitId: "mcp.browser.playwright" }} isDark={false} installedIds={new Set()} onInstall={jest.fn()} onBack={() => {}} />);
  const btn = screen.getByRole("button", { name: "toolkit.store_install" });
  expect(btn).not.toBeDisabled();
});

test("installed detail shows disabled Installed + status chip", () => {
  render(<StoreToolkitDetailPanel entry={{ ...entry, id: "browser.playwright", toolkitId: "mcp.browser.playwright" }} isDark={false} installedIds={new Set(["mcp.browser.playwright"])} onInstall={() => {}} onBack={() => {}} />);
  expect(screen.getByRole("button", { name: "toolkit.store_installed" })).toBeDisabled();
});

test("workspace error shows inline message", () => {
  render(<StoreToolkitDetailPanel entry={{ ...entry, id: "workspace.filesystem", toolkitId: "mcp.workspace.filesystem" }} isDark={false} installedIds={new Set()} onInstall={() => {}} installError={{ code: "mcp_workspace_required" }} onBack={() => {}} />);
  expect(screen.getByText("toolkit.store_workspace_required")).toBeInTheDocument();
});
```

- [ ] **Step 2** — 失败确认。
- [ ] **Step 3 — 实现**：
  - import `entryInstallState` + `isEntryInstallable`。
  - 计算 `state = entryInstallState(entry, installedIds)`。
  - **status chip**（header 区，name 旁或 badges 行）：按 state 渲染小 chip（installed=绿 / available=中性 / coming_soon=灰 / needs_review=橙 / error=红）。用现有 Badge 组件。
  - **Install 按钮**（替换现有固定 disabled Install）：label/disabled 同 Task 3 逻辑（installing→Installing…）。`onClick={() => onInstall?.(entry)}`。
  - **install error 内联块**：`installError` 时在按钮下方渲染 `t("toolkit." + (code 映射))`（`mcp_workspace_required` → `store_workspace_required`，其余 → `store_install_error`），紧凑红/橙块。
  - needs_review 时保留现有 warning banner，文案改用 `store_needs_review_phase2a`。

- [ ] **Step 4** — 跑测试 PASS（现有 4 用例不破）。
- [ ] **Step 5** — dirty。

---

## Task 5: ToolkitsPage 安装协调 + 刷新

**Files:** Modify `toolkits_page.js`（+ store page 透传）+ `toolkit_store_page.js`

`ToolkitsPage` 负责：加载 installed MCP set、把 `installedIds`/`onInstall`/`installing` 传给 store page→card 和 store detail；install 成功后刷新（installed set + 触发 installed 页 reload）。

- [ ] **Step 1** — `toolkit_store_page.js`：props 增加 `installedIds`/`onInstall`/`installingId`，透传给每个 `StoreToolkitCard`（`installing={installingId === entry.id}`）。

- [ ] **Step 2** — `toolkits_page.js`：
```js
import { getInstalledMcpIds, installMcpEntry } from "../../../SERVICEs/mcp_install";
import { readWorkspaceRoot } from "../../settings/runtime";
// state: installedIds(Set), installingId(string|null), installError({entryId,code}|null)
// 挂载时 + install/delete 后 loadInstalledIds()
const loadInstalledIds = useCallback(async () => {
  try { setInstalledIds(await getInstalledMcpIds()); } catch { /* ignore */ }
}, []);
useEffect(() => { loadInstalledIds(); }, [loadInstalledIds]);

const handleInstall = useCallback(async (entry) => {
  setInstallingId(entry.id); setInstallError(null);
  try {
    await installMcpEntry(entry, { workspaceRoot: readWorkspaceRoot() });
    await loadInstalledIds();
    // 若 store detail 打开着同一 entry，状态自然由 installedIds 反映
  } catch (e) {
    setInstallError({ entryId: entry.id, code: e?.code || "mcp_install_failed" });
  } finally {
    setInstallingId(null);
  }
}, [loadInstalledIds]);
```
  - store 分支 detail 渲染传 `installedIds` / `onInstall={handleInstall}` / `installing={installingId === selectedToolkit.entry?.id}` / `installError`（仅当 error.entryId 匹配）。
  - store page 渲染传 `installedIds` / `onInstall={handleInstall}` / `installingId`。

- [ ] **Step 3 — 集成测试**（`toolkits_page.test.js` 追加）：mock `mcp_install`（`getInstalledMcpIds` 返回空→install 后返回含 id；`installMcpEntry` resolve），store 卡片点 Install → 断言 `installMcpEntry` 调用、之后 `getInstalledMcpIds` 再次被调（刷新）。

- [ ] **Step 4** — 跑测试 PASS。
- [ ] **Step 5** — dirty。

---

## Task 6: Installed 页 / row / detail 的 MCP 删除

**Files:** Modify `toolkit_installed_page.js` + `toolkit_row.js` + `toolkit_detail_panel.js`

- [ ] **Step 1 — 测试**：
  - `toolkit_installed_page.test.js`（若无则建）：mock `api.unchain.listToolModalCatalog` 返回含一个 `source:"mcp"` toolkit + 一个 builtin；mock `deleteMcpEntry`。触发 MCP 行 delete → 断言 `deleteMcpEntry(toolkitId)` 调用 + catalog reload。
  - 断言 builtin 行**不**出现 delete 入口。

- [ ] **Step 2 — 实现**：
  - `toolkit_installed_page.js`：`handleDelete` 从 TODO 改为：
```js
import { deleteMcpEntry } from "../../../SERVICEs/mcp_install";
const handleDelete = useCallback(async (toolkitId) => {
  const tk = toolkits.find((t) => t.toolkitId === toolkitId);
  if (!tk || tk.source !== "mcp") return; // 仅 MCP 可删
  try {
    await deleteMcpEntry(toolkitId);
    removeInvalidToolkitIds("global", toolkits.filter((t) => t.toolkitId !== toolkitId).map((t) => t.toolkitId));
    await loadCatalog().then((r) => { if (r !== undefined) setToolkits(r); });
  } catch { /* surface via existing error path if any */ }
}, [toolkits, loadCatalog]);
```
  - `toolkit_row.js`：当 `toolkit.source === "mcp"` 时，行内显示 delete 按钮（hover 显隐，照 RuntimeFileRow 的 delete 模式 + 现有 ConfirmDeleteModal 或 toolkit 既有确认）；调 `onDelete(toolkitId)`。非 mcp 不显示。
  - `toolkit_detail_panel.js`（installed detail）：现有 delete SettingsRow 对 builtin disabled；改为：`source==="mcp"` → 启用 delete（走 `onDelete`），其余维持原行为。

- [ ] **Step 3** — 跑测试 PASS（现有 installed/detail 测试不破）。
- [ ] **Step 4** — dirty。

---

## Task 7: Settings — Local Storage 页 MCP section

**Files:** Create `src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.js` + Modify `local_storage/index.js` + 新增 section test

照 `OllamaSection`/`RuntimeSection` 模式（同文件内 statusPill + reload + rows + ConfirmDeleteModal）。

- [ ] **Step 1 — 测试** `mcp_toolkits_section.test.js`：mock `api.unchain.listMcpToolkits`（返回 1 个 installed）、`api.unchain.reloadMcpToolkits`、`deleteMcpEntry`。断言：渲染 toolkit name + status chip + tool count；点 Reload all 调 `reloadMcpToolkits`；点行 delete → 确认 → `deleteMcpEntry` 调用 + 列表刷新；空列表显示 `local_storage.mcp_no_installed`。

- [ ] **Step 2 — 实现** `mcp_toolkits_section.js`：
```js
// 组件 McpToolkitsSection({ isDark })
// state: status("loading"|"ready"|"error"), items[]
// load(): items = (await api.unchain.listMcpToolkits()).toolkits
// reloadAll(): await api.unchain.reloadMcpToolkits({ workspaceRoot: readWorkspaceRoot() }); load()
// handleDelete(toolkitId): await deleteMcpEntry(toolkitId); load()
// 渲染：<SettingsSection title={t("local_storage.section_mcp")}>
//   顶行：左 statusPill(`${items.length} ${...}`)；右 Button "Reload all"(reloadAll)
//   items.map → row：icon + name + statusPill(status) + `${tools.length} tools` + lastChecked + (workspaceRoot if filesystem) + lastError(if) + hover delete(ConfirmDeleteModal)
//   空：local_storage.mcp_no_installed
// styling 完全照 OllamaSection（pill/reload/row 复用同款 inline style）
```
  字段用 REC：`toolkitId`/`toolkitName`/`status`/`toolCount`(或 `tools.length`)/`lastCheckedAt`/`workspaceRoot`/`lastError`/`tools`。

- [ ] **Step 3** — `local_storage/index.js` 的 `LocalStorageSettings` return 末尾（`<RuntimeSection>` 后）加 `<McpToolkitsSection isDark={isDark} />`，import 之。

- [ ] **Step 4** — 跑测试 PASS。
- [ ] **Step 5** — dirty。

---

## Task 8: Chat selector + Agent Builder 校验

**Files:** Verify `use_chat_input_toolkits.js`（+ `utils/filter_toolkits`）；Verify `toolkit_inspector.js`

- [ ] **Step 1 — 校验 selector**：读 `utils/filter_toolkits.js`，确认 `source:"mcp"` 不被过滤（只过滤 BASE_TOOLKIT_IDS）。若被误过滤 → 修正保留 mcp。补测试：filter 输入含 mcp toolkit → 输出保留。
  - 刷新：`refreshToolkits` 在 attach panel 打开时调用即可（install/delete 后用户下次打开 selector 自然刷新）；确认现有调用时机覆盖。

- [ ] **Step 2 — Agent Builder**（codex 已让 `getToolkitCatalog()` 含 MCP，不再 BLOCKED）：`toolkit_inspector.js` 逻辑无需改（已用 `{id, enabled_tools}` + `tk.tools`，MCP 的 `id="mcp.*"`、`tools=[{name,description}]` 直接可用）。**优化**：toolkit 标题显示 `tk.toolkitName || tk.id`（MCP 的 raw id 不好看）。补测试：catalog 含 mcp toolkit → ToolkitPool 渲染、toggle 写入 `{id:"mcp.*", enabled_tools}`。

- [ ] **Step 3** — 跑相关测试 PASS。
- [ ] **Step 4** — dirty。

---

## Task 9: 汇总验证

- [ ] 跑全套：`CI=true npx react-scripts test --watchAll=false src/SERVICEs/mcp_install.test.js src/COMPONENTs/toolkit src/COMPONENTs/settings/local_storage src/COMPONENTs/chat-input src/COMPONENTs/agents` → 全绿（预先存在的无关 `toolkit_card.test.js` 失败需记录）。
- [ ] 手动 smoke（PuPu 运行 + pupu-test-api）：Store 装 Playwright → Installed/selector/Agent Builder 出现 → Settings 删除 → 各面消失。
- [ ] 留 dirty 给 owner commit。

---

## Spec 覆盖对照

| Spec 需求 | Task |
|-----------|------|
| installable 仅 3 个 + workspace 规则 | 1 |
| i18n | 2 |
| Store 卡片 install/installed/coming soon/needs review action | 3 |
| Store detail install-aware + status chip + 错误/loading | 4 |
| install 成功 → 刷新 + auto-enable | 1(auto-enable) + 5(刷新) |
| Installed tab 仅 MCP delete + 刷新 | 6 |
| Settings(local_storage) MCP section list+delete(+reload) | 7 |
| Chat selector 见 MCP | 8 |
| Agent Builder ToolkitPool 加 MCP 存 `{id,enabled_tools}` | 8 |
| 全套测试 | 各 task + 9 |
