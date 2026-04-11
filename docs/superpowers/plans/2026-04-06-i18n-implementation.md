# PuPu i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English + Simplified Chinese UI language support with a self-built `useTranslation` hook, persisted to localStorage via ConfigContext.

**Architecture:** JSON translation files (`src/locales/en.json`, `src/locales/zh-CN.json`) keyed by dot-path. A `useTranslation()` hook reads `locale` from `ConfigContext` and returns a `t(key)` resolver with English fallback. Language preference stored in `localStorage("settings").appearance.locale`.

**Tech Stack:** React 19, plain JavaScript, Jest + React Testing Library, inline styles.

---

### Task 1: Create English translation file

**Files:**
- Create: `src/locales/en.json`

This is the canonical key map. All UI strings go here first. Chinese follows in Task 2.

- [ ] **Step 1: Create `src/locales/en.json`**

```json
{
  "settings": {
    "title": "Settings",
    "appearance": "Appearance",
    "model_providers": "Model Providers",
    "workspaces": "Workspaces",
    "memory": "Memory",
    "token_usage": "Token Usage",
    "update": "Update",
    "local_storage": "Local Storage",
    "dev": "Dev"
  },
  "appearance": {
    "title": "Appearance",
    "theme_mode": "Theme Mode",
    "theme_mode_desc": "Choose between light and dark mode",
    "theme_light": "Light",
    "theme_dark": "Dark",
    "theme_system": "System",
    "language": "Language",
    "language_desc": "Choose display language"
  },
  "model_providers": {
    "api_key": "API Key",
    "retry": "Retry",
    "clear": "Clear",
    "all": "All",
    "embedding": "Embedding",
    "vision": "Vision",
    "tools": "Tools",
    "thinking": "Thinking"
  },
  "memory": {
    "title": "Chat Memory",
    "enable_memory": "Enable memory",
    "enable_memory_desc": "Each chat keeps short-term memory, while long-term memory is shared globally and recalled automatically when relevant.",
    "auto": "Auto"
  },
  "token_usage": {
    "7_days": "7 days",
    "30_days": "30 days",
    "90_days": "90 days",
    "all_time": "All time",
    "day": "Day",
    "week": "Week",
    "month": "Month",
    "input": "Input",
    "output": "Output",
    "consumed_tokens": "Consumed Tokens",
    "input_tokens": "Input Tokens",
    "output_tokens": "Output Tokens",
    "requests": "Requests",
    "avg_consumed": "Avg Consumed / Request",
    "top_model": "Top Model",
    "all_providers": "All Providers",
    "all_models": "All Models",
    "clear": "Clear",
    "search_models": "Search models…"
  },
  "app_update": {
    "title": "Update",
    "auto_update": "Auto update",
    "auto_update_desc": "Automatically check for app updates",
    "current_version": "Current Version",
    "current_version_desc": "Installed application version",
    "latest_version": "Latest Version",
    "latest_version_desc": "Latest version from release channel",
    "update_action": "Update Action",
    "update_action_desc": "Check, download, and install updates from GitHub Releases",
    "restart_to_install": "Restart to install",
    "checking": "Checking...",
    "downloading": "Downloading {progress}%",
    "up_to_date": "Up to date",
    "check_for_updates": "Check for updates",
    "unavailable": "In-app updates are unavailable in the current runtime.",
    "check_failed": "Failed to check for updates.",
    "install_failed": "Failed to start update installation."
  },
  "local_storage": {
    "delete_item": "Delete this item?",
    "clear_all": "Clear all?",
    "reset_settings_title": "Reset all settings to defaults?",
    "reset_settings_desc": "Deleting the {key} key will restore all preferences — including theme, appearance, and any future settings — back to their default values. This cannot be undone.",
    "reset_to_defaults": "Reset to defaults",
    "reload": "Reload",
    "clear_all_btn": "Clear all"
  },
  "dev": {
    "chrome_terminal": "Chrome Terminal",
    "ui_testing": "UI Testing",
    "open": "Open"
  },
  "side_menu": {
    "search": "Search...",
    "tools": "Tools",
    "agents": "Agents",
    "workspaces": "Workspaces",
    "settings": "Settings",
    "chats": "Chats",
    "no_chats_found": "No chats found"
  },
  "context_menu": {
    "new_chat": "New Chat",
    "new_folder": "New Folder",
    "paste": "Paste",
    "import": "Import",
    "rename": "Rename",
    "copy": "Copy",
    "copy_of": "Copy of {label}",
    "export": "Export",
    "delete": "Delete",
    "inspect_memory": "Inspect Memory"
  },
  "common": {
    "cancel": "Cancel",
    "delete": "Delete",
    "save": "Save",
    "confirm": "Confirm",
    "close": "Close",
    "loading": "Loading...",
    "error": "Error",
    "select": "Select...",
    "search": "Search..."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/locales/en.json
git commit -m "feat(i18n): add English translation file"
```

---

### Task 2: Create Chinese translation file

**Files:**
- Create: `src/locales/zh-CN.json`

- [ ] **Step 1: Create `src/locales/zh-CN.json`**

```json
{
  "settings": {
    "title": "设置",
    "appearance": "外观",
    "model_providers": "模型提供商",
    "workspaces": "工作区",
    "memory": "记忆",
    "token_usage": "Token 用量",
    "update": "更新",
    "local_storage": "本地存储",
    "dev": "开发者"
  },
  "appearance": {
    "title": "外观",
    "theme_mode": "主题模式",
    "theme_mode_desc": "选择浅色或深色模式",
    "theme_light": "浅色",
    "theme_dark": "深色",
    "theme_system": "跟随系统",
    "language": "语言",
    "language_desc": "选择显示语言"
  },
  "model_providers": {
    "api_key": "API Key",
    "retry": "重试",
    "clear": "清除",
    "all": "全部",
    "embedding": "嵌入",
    "vision": "视觉",
    "tools": "工具",
    "thinking": "思考"
  },
  "memory": {
    "title": "聊天记忆",
    "enable_memory": "启用记忆",
    "enable_memory_desc": "每个聊天保留短期记忆，长期记忆全局共享并在相关时自动召回。",
    "auto": "自动"
  },
  "token_usage": {
    "7_days": "7 天",
    "30_days": "30 天",
    "90_days": "90 天",
    "all_time": "全部",
    "day": "日",
    "week": "周",
    "month": "月",
    "input": "输入",
    "output": "输出",
    "consumed_tokens": "消耗 Token",
    "input_tokens": "输入 Token",
    "output_tokens": "输出 Token",
    "requests": "请求数",
    "avg_consumed": "平均消耗 / 请求",
    "top_model": "最常用模型",
    "all_providers": "全部提供商",
    "all_models": "全部模型",
    "clear": "清除",
    "search_models": "搜索模型…"
  },
  "app_update": {
    "title": "更新",
    "auto_update": "自动更新",
    "auto_update_desc": "自动检查应用更新",
    "current_version": "当前版本",
    "current_version_desc": "已安装的应用版本",
    "latest_version": "最新版本",
    "latest_version_desc": "发布渠道的最新版本",
    "update_action": "更新操作",
    "update_action_desc": "从 GitHub Releases 检查、下载并安装更新",
    "restart_to_install": "重启以安装",
    "checking": "检查中...",
    "downloading": "下载中 {progress}%",
    "up_to_date": "已是最新",
    "check_for_updates": "检查更新",
    "unavailable": "当前运行环境不支持应用内更新。",
    "check_failed": "检查更新失败。",
    "install_failed": "启动更新安装失败。"
  },
  "local_storage": {
    "delete_item": "删除此项？",
    "clear_all": "清除全部？",
    "reset_settings_title": "重置所有设置为默认值？",
    "reset_settings_desc": "删除 {key} 将恢复所有偏好设置（包括主题、外观及未来新增的设置）为默认值。此操作不可撤销。",
    "reset_to_defaults": "恢复默认",
    "reload": "重新加载",
    "clear_all_btn": "清除全部"
  },
  "dev": {
    "chrome_terminal": "Chrome 终端",
    "ui_testing": "UI 测试",
    "open": "打开"
  },
  "side_menu": {
    "search": "搜索...",
    "tools": "工具",
    "agents": "智能体",
    "workspaces": "工作区",
    "settings": "设置",
    "chats": "聊天",
    "no_chats_found": "没有找到聊天"
  },
  "context_menu": {
    "new_chat": "新建聊天",
    "new_folder": "新建文件夹",
    "paste": "粘贴",
    "import": "导入",
    "rename": "重命名",
    "copy": "复制",
    "copy_of": "{label} 的副本",
    "export": "导出",
    "delete": "删除",
    "inspect_memory": "查看记忆"
  },
  "common": {
    "cancel": "取消",
    "delete": "删除",
    "save": "保存",
    "confirm": "确认",
    "close": "关闭",
    "loading": "加载中...",
    "error": "错误",
    "select": "选择...",
    "search": "搜索..."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/locales/zh-CN.json
git commit -m "feat(i18n): add Simplified Chinese translation file"
```

---

### Task 3: Create `useTranslation` hook

**Files:**
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_translation.js`
- Create: `src/BUILTIN_COMPONENTs/mini_react/use_translation.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/BUILTIN_COMPONENTs/mini_react/use_translation.test.js`:

```js
import { renderHook } from "@testing-library/react";
import { useTranslation, resolveKey } from "./use_translation";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ── resolveKey unit tests ── */

describe("resolveKey", () => {
  const messages = {
    common: { cancel: "Cancel", delete: "Delete" },
    appearance: { title: "Appearance" },
  };

  it("resolves a dot-path key", () => {
    expect(resolveKey(messages, "common.cancel")).toBe("Cancel");
  });

  it("resolves a nested key", () => {
    expect(resolveKey(messages, "appearance.title")).toBe("Appearance");
  });

  it("returns undefined for missing key", () => {
    expect(resolveKey(messages, "common.missing")).toBeUndefined();
  });

  it("returns undefined for empty key", () => {
    expect(resolveKey(messages, "")).toBeUndefined();
  });
});

/* ── useTranslation hook tests ── */

const wrapper =
  (locale) =>
  ({ children }) => (
    <ConfigContext.Provider
      value={{ locale, setLocale: () => {} }}
    >
      {children}
    </ConfigContext.Provider>
  );

describe("useTranslation", () => {
  it("returns English string by default", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(result.current.t("common.cancel")).toBe("Cancel");
    expect(result.current.locale).toBe("en");
  });

  it("returns Chinese string for zh-CN locale", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("zh-CN"),
    });
    expect(result.current.t("common.cancel")).toBe("取消");
  });

  it("falls back to English when key missing in zh-CN", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("zh-CN"),
    });
    // If a key exists in en.json but not zh-CN.json, fallback to en
    expect(result.current.t("common.cancel")).toBeTruthy();
  });

  it("returns the key itself when not found in any locale", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(result.current.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates {placeholder} variables", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(
      result.current.t("app_update.downloading", { progress: 42 }),
    ).toBe("Downloading 42%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false --testPathPattern="use_translation.test"`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/BUILTIN_COMPONENTs/mini_react/use_translation.js`:

```js
import { useContext, useCallback, useMemo } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

import en from "../../locales/en.json";
import zhCN from "../../locales/zh-CN.json";

const LOCALE_MAP = {
  en,
  "zh-CN": zhCN,
};

/**
 * Resolve a dot-path key against a messages object.
 * e.g. resolveKey(messages, "common.cancel") → "Cancel"
 */
export const resolveKey = (messages, key) => {
  if (!key) return undefined;

  const parts = key.split(".");
  let current = messages;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
};

/**
 * Replace {placeholder} tokens in a string with values from a vars object.
 * e.g. interpolate("Downloading {progress}%", { progress: 42 }) → "Downloading 42%"
 */
const interpolate = (template, vars) => {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`,
  );
};

export const useTranslation = () => {
  const { locale, setLocale } = useContext(ConfigContext);
  const currentLocale = locale || "en";

  const messages = useMemo(
    () => LOCALE_MAP[currentLocale] || en,
    [currentLocale],
  );

  const t = useCallback(
    (key, vars) => {
      const value = resolveKey(messages, key);

      if (value !== undefined) {
        return interpolate(value, vars);
      }

      // Fallback to English
      if (currentLocale !== "en") {
        const fallback = resolveKey(en, key);
        if (fallback !== undefined) {
          return interpolate(fallback, vars);
        }
      }

      // Last resort: return key itself
      return key;
    },
    [messages, currentLocale],
  );

  return { t, locale: currentLocale, setLocale };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false --testPathPattern="use_translation.test"`

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BUILTIN_COMPONENTs/mini_react/use_translation.js src/BUILTIN_COMPONENTs/mini_react/use_translation.test.js
git commit -m "feat(i18n): add useTranslation hook with tests"
```

---

### Task 4: Integrate locale into ConfigContext

**Files:**
- Modify: `src/CONTAINERs/config/container.js` (lines 137-269 — ConfigContainer component)

- [ ] **Step 1: Read current `container.js`**

Read: `src/CONTAINERs/config/container.js`

Confirm the existing patterns: `loadSettingsStorage()`, `saveSettingsStorage()`, `_persisted`, `themeValue` memo.

- [ ] **Step 2: Add locale state initialization**

In `ConfigContainer`, after the existing `_persistedThemeMode` line (~line 144), add locale initialization:

```js
const _persistedLocale = _persisted?.appearance?.locale;
```

After the `isThemeBooting` state (~line 157), add:

```js
const [locale, setLocale] = useState(_persistedLocale || "en");
```

- [ ] **Step 3: Add locale persistence effect**

After the existing `saveSettingsStorage("appearance", ...)` effect (~line 196), add:

```js
useEffect(() => {
  saveSettingsStorage("appearance", { locale });
}, [locale]);
```

- [ ] **Step 4: Add locale to themeValue memo**

Modify the `themeValue` useMemo (~line 237) to include `locale` and `setLocale`:

```js
const themeValue = useMemo(
  () => ({
    syncWithSystemTheme,
    setSyncWithSystemTheme,
    availableThemes,
    theme,
    setTheme,
    onThemeMode,
    setOnThemeMode,
    locale,
    setLocale,
  }),
  [syncWithSystemTheme, availableThemes, theme, onThemeMode, locale],
);
```

- [ ] **Step 5: Verify app still boots**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false --testPathPattern="container.test"`

Expected: existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/CONTAINERs/config/container.js
git commit -m "feat(i18n): add locale state to ConfigContext"
```

---

### Task 5: Add Language selector to Appearance settings

**Files:**
- Modify: `src/COMPONENTs/settings/appearance.js` (lines 112-163 — AppearanceSettings)

- [ ] **Step 1: Read current `appearance.js`**

Read: `src/COMPONENTs/settings/appearance.js`

Confirm: `AppearanceSettings` uses `useContext(ConfigContext)` and has one `SettingsSection` with Theme Mode `SettingsRow` + `Select`.

- [ ] **Step 2: Add import for useTranslation**

At the top of `appearance.js`, after the existing imports, add:

```js
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
```

- [ ] **Step 3: Add Language selector row to AppearanceSettings**

In `AppearanceSettings`, destructure `locale` and `setLocale` from context, add `useTranslation`, and add a new `SettingsRow` below Theme Mode:

```js
export const AppearanceSettings = () => {
  const {
    onThemeMode,
    setOnThemeMode,
    syncWithSystemTheme,
    setSyncWithSystemTheme,
    locale,
    setLocale,
  } = useContext(ConfigContext);

  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const themeValue = syncWithSystemTheme ? "sync_with_browser" : onThemeMode;

  return (
    <div>
      <SettingsSection title={t("appearance.title")}>
        <SettingsRow
          label={t("appearance.theme_mode")}
          description={t("appearance.theme_mode_desc")}
        >
          <Select
            options={[
              { value: "light_mode", label: t("appearance.theme_light") },
              { value: "dark_mode", label: t("appearance.theme_dark") },
              { value: "sync_with_browser", label: t("appearance.theme_system") },
            ]}
            value={themeValue}
            set_value={(val) => {
              if (val === "sync_with_browser") {
                setSyncWithSystemTheme(true);
              } else {
                setSyncWithSystemTheme(false);
                setOnThemeMode(val);
              }
            }}
            filterable={false}
            style={{
              minWidth: 140,
              fontSize: 13,
              paddingVertical: 4,
              paddingHorizontal: 10,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)",
            }}
            option_style={{ height: 28, padding: "4px 8px", fontSize: 13 }}
            dropdown_style={{ padding: 4 }}
          />
        </SettingsRow>

        <SettingsRow
          label={t("appearance.language")}
          description={t("appearance.language_desc")}
        >
          <Select
            options={[
              { value: "en", label: "English" },
              { value: "zh-CN", label: "中文" },
            ]}
            value={locale}
            set_value={setLocale}
            filterable={false}
            style={{
              minWidth: 140,
              fontSize: 13,
              paddingVertical: 4,
              paddingHorizontal: 10,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)",
            }}
            option_style={{ height: 28, padding: "4px 8px", fontSize: 13 }}
            dropdown_style={{ padding: 4 }}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
```

Note: Language option labels ("English", "中文") are NOT translated — they stay in their own language so users can always find theirs.

- [ ] **Step 4: Run existing tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false --testPathPattern="settings_modal.test"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/settings/appearance.js
git commit -m "feat(i18n): add language selector to Appearance settings"
```

---

### Task 6: Translate Settings Modal sidebar labels

**Files:**
- Modify: `src/COMPONENTs/settings/settings_modal.js`

- [ ] **Step 1: Read current `settings_modal.js`**

Read: `src/COMPONENTs/settings/settings_modal.js`

Confirm: `BASE_SETTINGS_PAGES` array has hardcoded `label` strings, and the "Settings" title is inline at ~line 169.

- [ ] **Step 2: Convert static labels to translation keys**

The `label` field in `BASE_SETTINGS_PAGES` cannot use hooks (it's outside a component). Change `label` to `labelKey` and resolve at render time.

Replace `BASE_SETTINGS_PAGES` and `DEV_SETTINGS_PAGE`:

```js
const BASE_SETTINGS_PAGES = [
  { key: "appearance",     icon: "color",          labelKey: "settings.appearance" },
  { key: "model_providers", icon: "pentagon",       labelKey: "settings.model_providers" },
  { key: "runtime",        icon: "folder_2",       labelKey: "settings.workspaces" },
  { key: "memory",         icon: "brain",           labelKey: "settings.memory" },
  { key: "token_usage",    icon: "bar_chart",       labelKey: "settings.token_usage" },
  { key: "app_update",     icon: "download_cloud",  labelKey: "settings.update" },
  { key: "local_storage",  icon: "data",            labelKey: "settings.local_storage" },
];

const DEV_SETTINGS_PAGE = {
  key: "dev",
  icon: "code",
  labelKey: "settings.dev",
  pinToBottom: true,
};
```

Remove the `component` field from the page config array. Instead, look up the component inside `SettingsModal` using a map:

```js
const PAGE_COMPONENTS = {
  appearance: AppearanceSettings,
  model_providers: ModelProvidersSettings,
  runtime: RuntimeSettings,
  memory: MemorySettings,
  token_usage: TokenUsageSettings,
  app_update: AppUpdateSettings,
  local_storage: LocalStorageSettings,
  dev: DevSettings,
};
```

- [ ] **Step 3: Use `useTranslation` inside `SettingsModal`**

Add import:

```js
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
```

Inside `SettingsModal`, add:

```js
const { t } = useTranslation();
```

Replace the `ActivePageComponent` resolution:

```js
const ActivePageComponent = PAGE_COMPONENTS[activePage?.key] || AppearanceSettings;
```

Replace the inline "Settings" title (~line 169):

```js
{t("settings.title")}
```

Replace the page title (~line 241):

```js
{activePage ? t(activePage.labelKey) : t("settings.title")}
```

Replace the Button `label` in the sidebar map:

```js
{settingsPages.map((page) => (
  <Button
    key={page.key}
    prefix_icon={page.icon}
    label={t(page.labelKey)}
    onClick={() => setSelectedPage(page.key)}
    style={{ /* ... unchanged ... */ }}
  />
))}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false --testPathPattern="settings_modal.test"`

Expected: PASS (update test mocks if needed to provide ConfigContext with `locale`).

- [ ] **Step 5: Commit**

```bash
git add src/COMPONENTs/settings/settings_modal.js
git commit -m "feat(i18n): translate settings modal sidebar labels"
```

---

### Task 7: Translate Side Menu

**Files:**
- Modify: `src/COMPONENTs/side-menu/side_menu.js`
- Modify: `src/COMPONENTs/side-menu/side_menu_context_menu_items.js`
- Modify: `src/COMPONENTs/side-menu/side_menu_components.js`

- [ ] **Step 1: Read the three side menu files**

Read:
- `src/COMPONENTs/side-menu/side_menu.js`
- `src/COMPONENTs/side-menu/side_menu_context_menu_items.js`
- `src/COMPONENTs/side-menu/side_menu_components.js`

Find all hardcoded strings: "Search...", "Tools", "Agents", "Workspaces", "Settings", "Chats", "No chats found", context menu labels, "Cancel", "Delete".

- [ ] **Step 2: Translate `side_menu.js`**

Add import:

```js
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
```

Inside the component, add `const { t } = useTranslation();` and replace:
- `"Search..."` → `t("side_menu.search")`
- `"Tools"` → `t("side_menu.tools")`
- `"Agents"` → `t("side_menu.agents")`
- `"Workspaces"` → `t("side_menu.workspaces")`
- `"Settings"` → `t("side_menu.settings")`
- `"Chats"` → `t("side_menu.chats")`
- `"No chats found"` → `t("side_menu.no_chats_found")`

- [ ] **Step 3: Translate `side_menu_context_menu_items.js`**

This file exports a function `buildSideMenuContextMenuItems`. Since it's not a component, it can't use hooks. Change its signature to accept a `t` function parameter:

```js
export const buildSideMenuContextMenuItems = (params, t) => {
```

Replace all `label:` values:
- `"New Chat"` → `t("context_menu.new_chat")`
- `"New Folder"` → `t("context_menu.new_folder")`
- `"Paste"` → `t("context_menu.paste")`
- `"Import"` → `t("context_menu.import")`
- `"Rename"` → `t("context_menu.rename")`
- `"Copy"` → `t("context_menu.copy")`
- `"Export"` → `t("context_menu.export")`
- `"Delete"` → `t("context_menu.delete")`
- `"Inspect Memory"` → `t("context_menu.inspect_memory")`
- `` `Copy of ${clipboard.label}` `` → `t("context_menu.copy_of", { label: clipboard.label })`

Update the call site in `side_menu.js` to pass `t`:

```js
buildSideMenuContextMenuItems(params, t)
```

- [ ] **Step 4: Translate `side_menu_components.js`**

Find the `ConfirmDeleteModal` and replace "Cancel" / "Delete" with `t("common.cancel")` / `t("common.delete")`. This component will need to call `useTranslation()` or accept `t` as a prop — read the file to determine which pattern fits.

- [ ] **Step 5: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/COMPONENTs/side-menu/
git commit -m "feat(i18n): translate side menu and context menu items"
```

---

### Task 8: Translate remaining Settings pages

**Files:**
- Modify: `src/COMPONENTs/settings/app_update.js`
- Modify: `src/COMPONENTs/settings/memory/index.js`
- Modify: `src/COMPONENTs/settings/token_usage/index.js`
- Modify: `src/COMPONENTs/settings/model_providers/index.js`
- Modify: `src/COMPONENTs/settings/model_providers/components/api_key_input.js`
- Modify: `src/COMPONENTs/settings/model_providers/components/confirm_delete_api_key_modal.js`
- Modify: `src/COMPONENTs/settings/dev/index.js`

- [ ] **Step 1: Read each file, identify hardcoded strings**

Read all files listed above. Map each hardcoded string to its translation key from `en.json`.

- [ ] **Step 2: Translate each file**

For each component file:
1. Add `import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";` (adjust relative path as needed)
2. Add `const { t } = useTranslation();` inside the component
3. Replace hardcoded strings with `t("key")` calls
4. For dynamic strings like `"Downloading {progress}%"`, use `t("app_update.downloading", { progress })`

Also fix the typos in `app_update.js`: `"udpate"` → use `t("app_update.title")`, `"auto updte"` → use `t("app_update.auto_update")`.

- [ ] **Step 3: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false`

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/settings/
git commit -m "feat(i18n): translate all settings pages"
```

---

### Task 9: Translate Local Storage confirmation modals

**Files:**
- Modify: `src/COMPONENTs/settings/local_storage/components/confirm_delete_modal.js`
- Modify: `src/COMPONENTs/settings/local_storage/components/confirm_clear_all.js`
- Modify: `src/COMPONENTs/settings/local_storage/components/confirm_reset_settings_modal.js`

- [ ] **Step 1: Read each file**

Read all three files. Identify hardcoded strings: dialog titles, descriptions, button labels.

- [ ] **Step 2: Translate each file**

For each file:
1. Add `useTranslation` import and hook call
2. Replace strings:
   - `"Delete this item?"` → `t("local_storage.delete_item")`
   - `"Cancel"` → `t("common.cancel")`
   - `"Delete"` → `t("common.delete")`
   - `"Clear all?"` → `t("local_storage.clear_all")`
   - `"Clear"` → `t("local_storage.clear_all_btn")`
   - `"Reset all settings to defaults?"` → `t("local_storage.reset_settings_title")`
   - Reset description → `t("local_storage.reset_settings_desc", { key: "settings" })`
   - `"Reset to defaults"` → `t("local_storage.reset_to_defaults")`

- [ ] **Step 3: Run tests**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/COMPONENTs/settings/local_storage/
git commit -m "feat(i18n): translate local storage confirmation modals"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npx react-scripts test --watchAll=false`

Expected: all tests PASS.

- [ ] **Step 2: Manual smoke test**

Run: `cd /Users/red/Desktop/GITRepo/PuPu && npm run start:web`

Verify:
1. Open Settings → Appearance → Language selector appears
2. Select "中文" → all settings labels switch to Chinese
3. Select "English" → all labels switch back
4. Close and reopen the app — language preference is persisted
5. Side menu labels are translated
6. Right-click context menu items are translated

- [ ] **Step 3: Verify localStorage**

Open DevTools → Application → localStorage → `settings` key. Confirm:

```json
{
  "appearance": {
    "theme_mode": "dark_mode",
    "locale": "zh-CN"
  }
}
```
