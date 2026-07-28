# App Settings 迁移到 SQLite：实施计划

> 目标读者：负责实际实现、评审和测试的工程 Agent。
>
> 目标：把 PuPu 中属于长期用户配置的数据从 renderer `localStorage`
> 迁移到 Electron 主进程管理的 SQLite，同时保持升级无损、浏览器开发模式可用、
> 启动读取时序稳定，并为敏感凭据建立安全存储边界。

## 0. 执行前必须遵守

1. 先阅读仓库根目录的 `AGENTS.md`、`CLAUDE.md` 和
   `.claude/CLAUDE.md`。
2. 修改任何函数、类或方法之前，必须按仓库要求运行 GitNexus
   `impact({ target, direction: "upstream" })`，向用户报告直接调用方、受影响流程和
   风险等级。若结果为 `HIGH` 或 `CRITICAL`，先警告用户并等待确认。
3. 不得修改模型可见行为，例如 prompt、请求字段语义、Memory 默认值和模型选择逻辑。
   若不可避免，需要 `pupu-llm-expert` 明确签字。
4. Provider API key、OAuth token、MCP secret 属于安全敏感范围。开始实现密钥迁移前，
   必须获得 `pupu-security-expert` 签字。
5. Electron 测试的 `.js` 和 `.cjs` 版本必须同步。
6. 不创建 TypeScript 文件；frontend 使用 JavaScript、函数组件和现有 inline style
   约定。
7. React 不得直接访问 `ipcRenderer`。所有系统能力必须走：

   ```text
   renderer SERVICE bridge
       → preload contextBridge
       → main IPC handler
       → main settings storage service
       → SQLite
   ```

8. 不执行 `git commit`。实现完成后运行 GitNexus
   `detect_changes({ scope: "compare", base_ref: "main" })`，确认影响范围。
9. Mode B pilot 下，Codex/Fable 完成代码后必须由 Claude agent 审查 diff 并重跑相关测试。

## 1. 当前状态

### 1.1 已经在 SQLite 的数据

当前只有聊天数据使用 SQLite：

```text
userData/chats.db
├── meta
├── chats
└── messages
```

实现位于：

- `electron/main/services/chat_storage/db.js`
- `electron/main/services/chat_storage/service.js`
- `electron/main/services/chat_storage/register_handlers.js`
- `electron/preload/bridges/chat_storage_bridge.js`
- `src/SERVICEs/chat_storage/chat_storage_backend.js`

本计划可以复用其依赖注入、WAL、事务、handler 注册和测试组织方式，但不得把 Settings
直接塞进 `chats.db`。

### 1.2 当前 Settings 数据来源

核心设置集中在 `localStorage["settings"]`：

```javascript
{
  app: {
    setup_completed: true
  },
  appearance: {
    theme_mode: "dark_mode" | "light_mode" | "sync_with_browser",
    locale: "en",
    theme: {
      preset: "default",
      custom: {
        light_mode: {},
        dark_mode: {}
      },
      details: {
        light_mode: {},
        dark_mode: {}
      }
    }
  },
  ui: {
    side_menu_open: true
  },
  runtime: {
    workspace_root: "",
    workspaces: []
  },
  memory: {
    enabled: true,
    long_term_enabled: true,
    long_term_extract_every_n_turns: 6,
    embedding_provider: "auto",
    ollama_embedding_model: "nomic-embed-text",
    openai_embedding_model: "text-embedding-3-small",
    last_n_turns: 8,
    vector_top_k: 4,
    vector_min_score: 0,
    long_term_top_k: 4,
    long_term_min_score: 0
  },
  model_providers: {
    openai_api_key: "...",
    anthropic_api_key: "...",
    custom_providers: [],
    custom_provider_secrets: {}
  },
  feature_flags: {},
  dev: {
    chrome_terminal_enabled: false
  }
}
```

实际对象可能包含这里未列出的兼容字段。迁移不得根据上述示例裁剪未知字段。

Settings 相关的独立 localStorage key：

| Key | 当前内容 | 最终目标 |
|---|---|---|
| `token_usage` | token 使用记录 | 结构化 SQL 表 |
| `default_toolkits` | 各 scope 默认 toolkit | 结构化 SQL 表 |
| `toolkit_auto_approve` | toolkit/tool 自动批准 | 结构化 SQL 表 |
| `computer_use_consent` | 同意版本和时间 | SQL |
| `computer_use_enabled` | 用户期望的启用状态 | SQL |
| `computer_use_local_beta_enabled` | 本地 beta 状态 | SQL |
| `agent_folder_tree_v1` | Agent/Recipe 文件夹树 | 初期 JSON namespace |
| `custom_mcp_icons` | 自定义 MCP 图标 base64 | 文件 + SQL 元数据 |

### 1.3 本轮明确不迁移

以下数据不是普通 App Settings，不应在本项目中顺手迁移：

| Key/文件 | 原因 |
|---|---|
| `pupu_boot_palette` | 启动壳层缓存，需要在 React 启动前同步读取 |
| `userData/theme-prefs.json` | 原生窗口创建前的派生启动缓存 |
| `pupu.uiTesting.prefs` | 开发/UI 测试辅助数据 |
| `pupu.queued_turn_outbox.v1` | 崩溃恢复队列，应属于独立可靠队列设计 |
| `pupu.turn_mutation_outbox.v1` | 崩溃恢复队列 |
| `pupu.execution_cancel_outbox.v1` | 崩溃恢复队列 |
| `chats` 及迁移 marker | 已由 chat storage V3 负责 |
| 附件数据 | 属于附件存储，不属于 Settings |
| Ollama 模型文件 | 外部模型资产，不属于 Settings |

`ui.side_menu_open` 可以进入 SQL，但它是低价值 UI 偏好。第一阶段可以继续放在
`settings.ui` namespace 中，以避免人为拆分同一个根对象；`pupu_boot_palette` 和
`theme-prefs.json` 仍只是派生缓存，不是权威数据源。

## 2. 目标架构

### 2.1 数据权威

Electron 运行时：

```text
SQLite settings.db
    = App Settings 唯一权威数据源

renderer memory snapshot
    = 同步读取缓存
    = 启动时从 SQLite bootstrap
    = 每次成功 mutation 后更新

localStorage
    = 首次升级迁移来源
    = 一个发布周期内的只读回退
    = 启动壳层缓存的保留位置
```

浏览器开发模式或非 Electron 环境：

```text
localStorage
    = fallback backend
```

不要让各组件判断当前使用 SQL 还是 localStorage。判断只允许存在于统一 repository
内部。

### 2.2 为什么 renderer 需要内存快照

当前多条关键路径依赖同步读取：

- React bundle 初始化时读取主题、语言和 feature flags。
- `api.unchain.js` 在组装请求时同步读取 provider、workspace 和 Memory 配置。
- 多个 store helper 目前同步返回设置值。

如果所有 getter 直接改成异步 IPC，会引发大范围调用链变化和启动竞态。目标设计是：

1. preload 用同步 bootstrap IPC 一次性读取 SQLite snapshot。
2. renderer repository 在模块初始化时建立内存快照。
3. 所有业务 getter 继续同步读取内存。
4. mutation 通过异步 IPC 持久化，并在 repository 内串行处理。

同步 IPC 只允许用于启动 bootstrap，不用于日常写入。

### 2.3 数据库位置

新建：

```text
<app.getPath("userData")>/settings.db
```

不要复用 `chats.db`，理由：

- 聊天数据与设置数据的备份、清理和生命周期不同。
- Settings 后续可能需要凭据加密、版本迁移和导入导出。
- “清空聊天”和“重置设置”必须物理隔离。

SQLite 配置：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

## 3. 数据库 Schema

### 3.1 Phase 1：核心 namespace 表

```sql
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  namespace      TEXT PRIMARY KEY,
  value_json     TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     INTEGER NOT NULL
);
```

约定：

- 每个 `localStorage["settings"]` 顶层 key 是一个 namespace。
- 第一阶段至少包括 `app`、`appearance`、`ui`、`runtime`、`memory`、
  `model_providers`、`feature_flags`、`dev`。
- 未知顶层 key 也要原样迁移，不能静默丢弃。
- `value_json` 必须是合法 JSON；service 写入前执行 shape 和大小验证。
- mutation 按 namespace 原子替换，不能读取整个根对象后再覆盖整个数据库。

建议的 `meta`：

| Key | Value |
|---|---|
| `schema_version` | 当前数据库 schema 版本 |
| `legacy_migration_state` | `not_started` / `in_progress` / `complete` |
| `legacy_migration_version` | 当前 legacy 迁移版本 |
| `legacy_migration_digest` | 迁移输入的稳定摘要 |
| `legacy_migrated_at` | 完成时间 |

### 3.2 Phase 2：Token Usage

```sql
CREATE TABLE IF NOT EXISTS token_usage_records (
  id                           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp                    INTEGER NOT NULL,
  provider                     TEXT NOT NULL,
  model                        TEXT NOT NULL,
  model_id                     TEXT NOT NULL,
  consumed_tokens              INTEGER NOT NULL,
  input_tokens                 INTEGER NOT NULL DEFAULT 0,
  output_tokens                INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens      INTEGER,
  cache_creation_input_tokens  INTEGER,
  max_context_window_tokens    INTEGER,
  chat_id                      TEXT
);

CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp
  ON token_usage_records(timestamp);

CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model
  ON token_usage_records(provider, model_id);

CREATE INDEX IF NOT EXISTS idx_token_usage_chat
  ON token_usage_records(chat_id);
```

要求：

- 保留现有 normalize 语义。
- 迁移顺序保持 oldest-first。
- legacy 记录没有稳定 ID，迁移事务和 digest 必须保证不会重复插入。
- Settings 页面按日期筛选时改为 SQL query，不把无限增长的全量记录一次性拉入 renderer。

### 3.3 Phase 2：Toolkit Preferences

```sql
CREATE TABLE IF NOT EXISTS default_toolkits (
  scope_key   TEXT NOT NULL,
  toolkit_id  TEXT NOT NULL,
  ord         INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (scope_key, toolkit_id)
);

CREATE TABLE IF NOT EXISTS toolkit_auto_approve (
  toolkit_id  TEXT PRIMARY KEY,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_auto_approve (
  toolkit_id  TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (toolkit_id, tool_name)
);
```

要求：

- 复用现有 toolkit ID alias normalize。
- 保持默认 `global → ["core"]` 行为。
- 保持 computer toolkit 不允许缓存批准的安全策略。
- 不得扩大自动批准范围。

### 3.4 Phase 2：Computer Use Preferences

```sql
CREATE TABLE IF NOT EXISTS computer_use_preferences (
  key            TEXT PRIMARY KEY,
  value_json     TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
```

建议 key：

- `consent`
- `enabled`
- `local_beta_enabled`

必须保持：

- 无记录、损坏、版本不匹配时 fail closed。
- Consent version 语义不变。
- SQL 记录只表示用户期望状态；运行时 sidecar 状态仍是实际生效状态。

### 3.5 Phase 2：Agent 文件夹

第一版使用 namespace：

```text
settings.namespace = "agent_folder_tree_v1"
```

不要在本项目中顺手把树拆成多张关系表。先完成存储迁移并保持现有行为，后续如果需要
搜索、跨 workspace 或大规模排序，再单独设计。

### 3.6 Phase 3：Custom MCP Icon

不要继续把 base64 图像存入 JSON 或 SQLite。

```sql
CREATE TABLE IF NOT EXISTS asset_metadata (
  asset_id       TEXT PRIMARY KEY,
  owner_type     TEXT NOT NULL,
  owner_id       TEXT NOT NULL,
  relative_path  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE(owner_type, owner_id)
);
```

实际文件：

```text
userData/assets/mcp-icons/<sanitized-toolkit-id>-<sha256-prefix>.<ext>
```

要求：

- 只允许现有支持的 PNG 和 SVG。
- 保留现有单文件大小与条目数限制，或变得更严格。
- 文件名不得直接信任用户输入。
- 写新文件、写 SQL、删除旧文件需要可恢复顺序；失败时不能让 SQL 指向不存在的文件。

### 3.7 Phase 4：敏感凭据

现有敏感值包括但不限于：

- `model_providers.openai_api_key`
- `model_providers.anthropic_api_key`
- `model_providers.custom_provider_secrets`
- MCP/OAuth secret

这部分在 `pupu-security-expert` 签字前禁止实现。

最终目标二选一，由安全评审决定：

#### 方案 A：OS credential vault

SQL 只保存：

```sql
CREATE TABLE IF NOT EXISTS credential_refs (
  credential_kind TEXT NOT NULL,
  owner_id         TEXT NOT NULL,
  secret_ref       TEXT NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (credential_kind, owner_id)
);
```

真正 secret 放 macOS Keychain、Windows Credential Manager、Linux Secret Service。

#### 方案 B：Electron `safeStorage`

SQL 保存经过 `safeStorage.encryptString()` 的密文 BLOB。实现必须：

- 检查 `safeStorage.isEncryptionAvailable()`。
- 检查 Linux 选择的 backend；不得把 `basic_text` 当成安全加密。
- 加密不可用时 fail closed，并保留 legacy secret，不能悄悄降级为明文 SQL。
- 日志、错误和测试 snapshot 不得包含 secret 或密文。
- renderer 不得获得全量 secret snapshot。只允许在需要组装请求时按 provider 获取最小值。

无论采用哪种方案，普通 `settings` snapshot 都必须剔除真实 secret，只包含非敏感
provider 定义及是否已配置的布尔状态。

## 4. IPC 与服务接口

### 4.1 新增主进程模块

建议创建：

```text
electron/main/services/settings_storage/
├── db.js
├── service.js
└── register_handlers.js
```

职责：

`db.js`

- 封装 `node:sqlite`。
- 管理 statement cache、transaction、close。
- 不包含业务 normalize。

`service.js`

- 初始化 schema 和 schema migration。
- bootstrap snapshot。
- namespace get/set/delete。
- legacy import。
- 后续结构化表读写。
- 所有输入验证和事务边界。

`register_handlers.js`

- 注册 Settings 专属 IPC。
- 输出 channel 列表，供 channel contract 测试检查。

在 `electron/main/index.js`：

- 注入 `app`、`fs`、`path`、`sqlite`，必要时注入 `safeStorage`。
- 在创建 renderer window 前完成 `settingsStorageService.init()`。
- `before-quit` 时 close。
- 不修改现有 chat storage 生命周期。

### 4.2 Channel

在 `electron/shared/channels.js` 新增：

```javascript
SETTINGS_STORAGE: Object.freeze({
  BOOTSTRAP_READ: "settings-storage:bootstrap-read",
  MIGRATE_LEGACY: "settings-storage:migrate-legacy",
  SET_NAMESPACE: "settings-storage:set-namespace",
  DELETE_NAMESPACE: "settings-storage:delete-namespace",
  // Phase 2+
  TOKEN_USAGE_APPEND: "settings-storage:token-usage-append",
  TOKEN_USAGE_QUERY: "settings-storage:token-usage-query",
  TOKEN_USAGE_CLEAR: "settings-storage:token-usage-clear",
})
```

模式：

| Channel | IPC 模式 | 原因 |
|---|---|---|
| `BOOTSTRAP_READ` | `sendSync` | 模块初始化时提供同步 snapshot |
| `MIGRATE_LEGACY` | `invoke/handle` | 需要成功确认后才能写 marker |
| `SET_NAMESPACE` | `invoke/handle` | 持久化必须有 ack |
| `DELETE_NAMESPACE` | `invoke/handle` | 删除必须有 ack |
| Token Usage mutation/query | `invoke/handle` | 结构化数据需要结果和错误 |

不要使用同步日常写入。

### 4.3 Preload bridge

建议创建：

```text
electron/preload/bridges/settings_storage_bridge.js
```

暴露：

```javascript
window.settingsStorageAPI = {
  bootstrap(),
  migrateLegacy(payload),
  setNamespace(namespace, value, options),
  deleteNamespace(namespace),
  // Phase 2+
  appendTokenUsage(record),
  queryTokenUsage(query),
  clearTokenUsage()
}
```

同步更新：

- `electron/preload/index.js`
- `electron/preload/channels.js`
- `electron/shared/channels.js`
- `electron/tests/preload/api_contract.test.js`
- `electron/tests/preload/api_contract.test.cjs`
- IPC channel tests的 `.js` / `.cjs`

### 4.4 Renderer repository

建议创建：

```text
src/SERVICEs/settings_repository.js
src/SERVICEs/bridges/settings_storage_bridge.js
```

公开接口建议：

```javascript
readSettingsRoot()
readNamespace(namespace, fallback)
replaceNamespace(namespace, value)
updateNamespace(namespace, updater)
deleteNamespace(namespace)
subscribeSettings(listener)
flushSettingsWrites()
getSettingsPersistenceStatus()
```

核心约束：

- getter 同步。
- repository 持有唯一内存快照。
- 同一 namespace 的 writes 必须串行，避免旧 mutation 后到达而覆盖新 mutation。
- `updateNamespace()` 在本地执行 read-modify-write，但提交时发送完整 namespace；
  不允许各 helper 再读写整个 `settings` 根对象。
- mutation 返回 Promise，让 Settings UI 在需要时显示保存失败。
- 日志只包含 namespace 和错误码，不打印 value。
- Electron bridge 缺失时回退 localStorage，保证浏览器开发和 Jest 环境可用。

## 5. Legacy 迁移状态机

### 5.1 启动流程

```text
Main process starts
  → init settings.db
  → register IPC
  → create renderer
  → renderer repository calls bootstrap() synchronously

Database has data
  → hydrate memory snapshot from SQL
  → SQL is authority

Database empty / migration incomplete
  → synchronously read legacy localStorage
  → hydrate memory snapshot from legacy data
  → queue MIGRATE_LEGACY as first persistence operation
  → after migration ack, SQL becomes authority
```

### 5.2 Migration payload

建议 shape：

```javascript
{
  migrationVersion: 1,
  settingsRoot: { /* complete parsed settings root */ },
  standalone: {
    token_usage: {},
    default_toolkits: {},
    toolkit_auto_approve: {},
    computer_use_consent: null,
    computer_use_enabled: null,
    computer_use_local_beta_enabled: null,
    agent_folder_tree_v1: null,
    custom_mcp_icons: {}
  },
  digest: "<sha256 over stable canonical payload>"
}
```

Phase 1 可以只传 `settingsRoot`，但 payload shape 预留 standalone 区域。

主进程必须重新计算或验证 digest，不能盲信 renderer。

### 5.3 Migration transaction

在一个事务中：

1. 验证 `migrationVersion`。
2. 验证 payload 总大小及每个 namespace 大小。
3. 将 `legacy_migration_state` 设为 `in_progress`。
4. 导入所有 namespace，保留未知 namespace。
5. 对已获批准的 standalone store 进行 normalize 后导入。
6. 写入 digest、version、完成时间。
7. 将 state 设为 `complete`。
8. commit。

失败则 rollback，旧 localStorage 保持不变。

### 5.4 Idempotency

以下情况必须安全：

- migration IPC 重复发送相同 digest。
- App 在事务中退出。
- SQL 已完成，但 renderer 尚未写 local marker 就退出。
- localStorage 数据损坏。
- settings.db 存在但仅完成一部分 schema upgrade。

规则：

- 相同 migration version + digest 已完成：直接返回成功。
- 已完成且 SQL 有权威数据：不得用旧 localStorage 覆盖。
- `in_progress` 在下次启动时视作未完成，可重新执行事务。
- JSON parse 失败的单独 key 记录诊断但不阻塞其他非敏感 key；核心
  `settings` 根对象损坏时使用现有默认值并报告 migration warning。

### 5.5 何时清理 localStorage

发布 N：

- 迁移成功后写 marker：
  `pupu.settings_sql_migration.v1 = { digest, completedAt }`。
- 原 legacy key 暂时保留，只读，不再双写。

发布 N+1：

- 遥测/QA 证明稳定后，删除已经成功迁移的非敏感 key。
- 删除前再次确认 SQL migration state 为 `complete`。
- secret 只有在安全存储迁移成功并验证可解密后才能从 localStorage 删除。

不要长期双写。双写会产生两个权威来源，升级和回滚时很难判断哪份更新。

## 6. 分阶段实施

### Phase 0：契约、基线与文档

目标：在写代码前冻结行为。

任务：

- 为所有待迁 store 写当前行为的 characterization tests。
- 记录 localStorage key、默认值、normalize 和 fail-closed 行为。
- 明确 Phase 1 不迁 secret。
- 更新本计划中与最终评审不一致的决定。
- 运行当前相关测试形成 baseline。

完成标准：

- 现有测试全部通过。
- 所有待迁 key 都有 owner 和目标表。
- 安全范围已有明确标记。

### Phase 1A：Settings SQLite 基础设施

目标：主进程能够可靠读写 namespace，但 renderer 业务仍不切换。

任务：

- 新建 `settings_storage/db.js`。
- 新建 `settings_storage/service.js`。
- 新建 handler、channel 和 preload bridge。
- 在 main process init/close。
- 实现 bootstrap、set namespace、delete namespace、legacy import。
- 添加 `.js` / `.cjs` Electron 测试。

建议测试：

- 新库 schema 创建。
- namespace upsert。
- JSON/undefined/oversize 拒绝。
- transaction rollback。
- close 幂等。
- bootstrap 空库和非空库。
- migration 相同 digest 幂等。
- migration 中断重试。
- IPC channel allowlist。
- preload API contract。

完成标准：

- 尚未改业务 store。
- 新服务独立测试通过。
- `settings.db` 不影响 `chats.db`。

### Phase 1B：Renderer Repository 与核心设置迁移

目标：`localStorage["settings"]` 的非敏感内容由 SQL 权威管理。

先迁：

- `app`
- `appearance`
- `ui`
- `runtime`
- `memory`
- `feature_flags`
- `dev`
- `model_providers` 中的非敏感字段

暂不迁：

- `openai_api_key`
- `anthropic_api_key`
- `custom_provider_secrets`

任务：

- 新建 renderer settings repository。
- 实现 SQL bootstrap + localStorage fallback。
- 实现 migration queue。
- 把以下文件改为 repository：

  - `src/CONTAINERs/config/container.js`
  - `src/COMPONENTs/init-setup/init_setup_storage.js`
  - `src/COMPONENTs/init-setup/steps/workspace.js`
  - `src/COMPONENTs/settings/appearance/storage.js`
  - `src/COMPONENTs/settings/dev/storage.js`
  - `src/COMPONENTs/settings/memory/storage.js`
  - `src/COMPONENTs/settings/model_providers/storage.js`
  - `src/COMPONENTs/settings/runtime.js`
  - `src/SERVICEs/feature_flags.js`
  - `src/SERVICEs/custom_provider_store.js`
  - `src/SERVICEs/api.unchain.js`

- `api.unchain.js` 仍同步读取 repository memory snapshot。
- provider secret 在 Phase 1 继续从隔离的 legacy secret adapter 读取，不允许进入普通
  SQL snapshot。
- 保留 `pupu_boot_palette`。
- `theme-prefs.json` 仍由主进程作为启动派生缓存维护。

完成标准：

- Electron 启动后，非敏感 Settings 的权威数据位于 SQL。
- 浏览器模式继续工作。
- 主题、语言、workspace、Memory、feature flags 和初始化状态跨重启保持。
- provider 请求字段和模型行为无变化。
- secret 未进入普通 settings 表或 IPC bootstrap。

### Phase 2：结构化 Store

目标：迁移增长型或需要查询的数据。

顺序：

1. `token_usage`
2. `default_toolkits`
3. `toolkit_auto_approve`
4. Computer Use 三个 key
5. `agent_folder_tree_v1`

涉及文件：

- `src/COMPONENTs/settings/token_usage/storage.js`
- `src/COMPONENTs/settings/token_usage/index.js`
- `src/SERVICEs/default_toolkit_store.js`
- `src/SERVICEs/toolkit_auto_approve_store.js`
- `src/SERVICEs/computer_use_consent_store.js`
- `src/SERVICEs/computer_use_enabled_store.js`
- `src/SERVICEs/computer_use_local_beta_store.js`
- `src/SERVICEs/agent_folder_storage.js`

每个 store 单独完成：

- Schema。
- Service method。
- IPC。
- Renderer adapter。
- Legacy migration。
- Tests。
- 验收后再进入下一个 store。

不要把整个 Phase 2 做成一次巨型 diff。

### Phase 3：Custom MCP Icon

目标：图标文件落磁盘，SQL 只存元数据。

涉及：

- `src/SERVICEs/custom_mcp_icon_store.js`
- MCP 图标解析和删除调用方
- settings storage asset service

测试：

- PNG/SVG 成功迁移。
- 超大文件拒绝。
- 非法 mime 拒绝。
- 路径穿越输入拒绝。
- 重复内容去重或稳定替换。
- 删除 SQL 记录时清理文件。
- 文件写失败不产生悬空 SQL。

### Phase 4：Secrets

开始条件：

- `pupu-security-expert` 已批准存储方案和 threat model。
- 已决定 OS vault 或 `safeStorage`。
- 已定义 Linux 不安全 backend 的行为。
- 已定义旧版回滚时 secret 是否仍可用。

任务：

- 将 secret 从普通 settings namespace 剥离。
- 迁移 OpenAI、Anthropic 和 custom provider secret。
- 所有 secret getter 改为最小范围读取。
- 删除 bootstrap 中的 secret。
- 验证写入、读取、删除和 key rotation。
- 仅在验证成功后删除 localStorage secret。

完成标准：

- `settings.db` 普通表、日志、错误、测试输出中没有明文 secret。
- secret 存储不可用时 fail closed。
- provider 请求行为保持一致。

### Phase 5：清理与文档更新

任务：

- 删除业务代码对已迁 legacy key 的直接读写。
- 保留 repository 的非 Electron fallback。
- Settings → Local Storage 页面区分：
  - Browser cache
  - SQLite Settings database
  - Runtime files
- 为“重置 Settings”新增 SQL transaction，不使用
  `localStorage.clear()`。
- 更新下列过期文档：

  - `docs/architecture/storage-model.md`
  - `docs/architecture/ipc-boundary.md`
  - `docs/architecture/request-flow-and-streaming.md`
  - `docs/architecture/memory-system.md`
  - `docs/data-models/model-and-toolkit-catalog.md`
  - `docs/features/workspace-system.md`
  - `docs/features/custom-model-providers.md`
  - `docs/conventions/project-conventions.md`
  - `docs/DEV_GUIDE.md`

## 7. 写入一致性与错误策略

### 7.1 Mutation queue

Repository 需要单一写入队列：

```text
bootstrap/migration
  → namespace mutation 1
  → namespace mutation 2
  → ...
```

要求：

- migration 永远排在普通 SQL writes 之前。
- 同一 namespace 不允许写入乱序。
- App quit 前尽力 `flushSettingsWrites()`。
- 持久化失败不得静默伪装成功。

推荐策略：

1. 在内存应用 optimistic update。
2. 发 IPC。
3. 成功后确认 revision。
4. 失败时恢复该 mutation 前的 namespace，并通知订阅者。
5. UI 可显示统一的“设置保存失败”提示。

若实现 revision：

```sql
ALTER TABLE settings ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
```

`setNamespace` 带 `expectedRevision`，主进程用 compare-and-swap 防止未来多窗口覆盖。
当前只有一个主窗口时 revision 可延后，但接口应预留。

### 7.2 输入限制

建议第一版：

- namespace：允许的字符集 `[a-z0-9_.-]`，最大 100 字符。
- 单 namespace JSON：默认最大 1 MiB。
- migration 总 payload：默认最大 10 MiB。
- token 数值必须 finite、非负并限制在安全整数范围。
- 时间统一使用 Unix milliseconds。

限制常量集中定义并测试，不散落在组件。

### 7.3 Corruption

- `settings.db` 无法打开时，不要自动删除。
- 报告明确错误并保留文件，允许用户或支持人员恢复。
- 当前进程可进入 localStorage fallback，但必须暴露 degraded 状态。
- 不得在没有用户确认时用空数据库覆盖损坏数据库。
- JSON 单 namespace 损坏时，该 namespace 使用默认值，其余 namespace 继续可用。

## 8. 测试矩阵

### 8.1 Unit

- DB adapter transaction、statement cache、close。
- Service schema 和 CRUD。
- Repository sync getter。
- Repository write serialization。
- 各 store normalize。
- Secret redaction。
- Migration digest 与幂等。

### 8.2 IPC contract

`.js` 和 `.cjs` 都要覆盖：

- shared channel 注册。
- main handler 注册。
- preload allowlist。
- contextBridge API。
- payload 参数顺序和错误处理。

### 8.3 Migration integration

至少包含：

1. 全新安装，无 localStorage。
2. 完整旧版 settings。
3. 只有部分 namespace。
4. 未知 namespace。
5. 损坏 JSON。
6. migration 事务失败。
7. SQL commit 后、marker 写入前退出。
8. 同一 digest 重试。
9. 旧 digest 在 SQL 已有新数据后重试。
10. browser fallback。
11. secret 不进入普通 snapshot。
12. localStorage quota/error。

### 8.4 App behavior

- 重启后主题模式、语言和自定义颜色一致。
- 静态 boot shell 没有颜色闪烁。
- workspace 选择和校验一致。
- Memory payload 与迁移前完全一致。
- OpenAI/Anthropic/custom provider payload 与迁移前一致。
- Setup modal 不会重新出现。
- feature flag 开发行为一致。
- Computer Use 未同意时仍 fail closed。
- toolkit 自动批准不扩大。
- Token Usage 统计结果与 legacy 数据一致。

### 8.5 建议命令

以仓库现有 package scripts 为准，至少运行：

```text
相关 Jest 单测
Electron .js tests
Electron .cjs tests
react-scripts test（受影响范围）
unchain_runtime/server/run_tests.sh（只有修改 Python 时）
```

本项目预计不需要修改 Python。若修改任何 `unchain_runtime/server/*.py`，测试后必须说明
sidecar 需要重启。

## 9. 验收标准

全部满足才算完成：

- Electron 中核心 App Settings 的唯一权威来源是 `settings.db`。
- 业务组件不直接读写已迁 localStorage key。
- 非 Electron/browser 模式仍有可测试 fallback。
- 旧用户首次升级不丢任何已知或未知 settings namespace。
- migration 可重复、可中断恢复。
- Settings 写入顺序稳定，快速连续修改不会被旧值覆盖。
- `chats.db` 和聊天行为无变化。
- `pupu_boot_palette`、`theme-prefs.json` 继续正常承担启动缓存职责。
- Token Usage 查询不要求加载无限增长的全量 JSON。
- Computer Use 和 toolkit approval 的安全默认不变。
- 普通 SQL 表和 bootstrap IPC 中无明文 secret。
- 所有 `.js` / `.cjs` Electron 测试保持同步。
- GitNexus `detect_changes()` 只显示预期 symbol 和 execution flow。
- Claude reviewer 已审查 diff 并重跑相关测试。
- 没有 git commit，由 CEO 最终提交。

## 10. 推荐 PR / Diff 切分

即使不提交 git，也按以下独立 diff 边界工作：

1. Settings SQLite service + IPC + tests。
2. Renderer repository + migration + tests。
3. Core namespaces：Appearance/App/UI。
4. Runtime + Memory。
5. Feature flags + Dev。
6. Model provider 非敏感配置。
7. Token Usage。
8. Toolkit preferences。
9. Computer Use preferences。
10. Agent folders。
11. MCP icon assets。
12. Secrets（安全审批后的独立变更）。
13. Legacy cleanup + docs。

每个边界都应能单独运行测试并说明回滚方式。

## 11. Phase 1A 实施记录与裁决（2026-07-23，实施后追加）

> 本节由 Phase 1A 实施轮追加。Phase 1B 实施者视为计划正文的一部分。

状态：Phase 1A 已实施，通过 spec/correctness/security/conventions 四视角审查、
一轮 Critical/Important 修复复核和四条 Minor 契约修复。测试全绿：
Electron `.cjs` 142 suites / 1204 tests，`.js`（react-scripts）13 suites / 223 tests
（基线 139/1146、10/165）。未 commit。

### 11.1 已冻结的契约（Phase 1B 直接依赖）

- bootstrap snapshot 形状：
  `{ available, degraded, schemaVersion, migration, namespaces, revisions }`。
  `revisions` 是 §7.1 expectedRevision CAS 的预留读取点（整数 map）。
- `migrateLegacy` 结果 `status` 三值：`"complete"`（首次成功）、
  `"already-complete"`（同 digest 幂等重放）、`"refused-stale-digest"`
  （SQL 已权威且 digest 不同，拒绝覆盖）。**Phase 1B 写 localStorage marker
  前必须区分后两者**，不得对任何 resolved promise 一律写 marker。
- 错误码传输：`ipcMain.handle` reject 只保留 message（`.code` 会被 Electron
  剥掉），因此所有 service 错误 message 以 `"[<code>] "` 稳定前缀携带码。
  码表 10 个：settings_storage_unavailable / invalid_namespace / invalid_value /
  value_too_large / invalid_expected_revision / revision_conflict /
  invalid_migration_payload / unsupported_migration_version / digest_mismatch /
  payload_too_large。
- secret 剥离双层：`model_providers` 的 openai_api_key / anthropic_api_key /
  custom_provider_secrets 在 legacy import 写侧与 bootstrap 读侧都被剥离。
- `"__proto__"` 是非法 namespace（显式拒绝）；snapshot 的
  namespaces/revisions 是 null-prototype 对象。

### 11.2 裁决（偏离或细化计划处）

1. **迁移 all-or-nothing**：任何单个非法 entry（非法 namespace 名或超 1 MiB）
   使整个 legacy import 回滚，绝不部分导入。§5.4 的"单 key 损坏不阻塞"被
   裁定发生在 renderer 解析 localStorage 阶段（Phase 1B），到不了主进程
   payload。**Phase 1B 必须实现 renderer 侧预清洗：非法顶层 key 隔离并计入
   migration warning**，否则一个第三方写入的 localStorage key 会让迁移永久
   失败且无用户可见信号。
2. digest 归一化：`migrateLegacy` 入口先对 payload 做 JSON round-trip
   （失败 → invalid_value），之后 shape 校验、size gate、digest、导入全部
   使用归一化后的 payload；`computeLegacyMigrationDigest` 保持纯函数。
3. delete 后重新 set 会使该 namespace 的 revision 归零（多窗口 CAS 的 ABA
   隐患）。Phase 1B 落地 CAS 时应改为单调 revision（meta 计数器或 delete
   tombstone），并回填到 §7.1。
4. `electron/main/ipc/register_handlers.js` 在原文件清单外被修改——接线与
   channel-parity 测试必需，纯增量，镜像 chat_storage 模式。
5. `.js` 测试变体是一行 `require` 转发 stub（仓库既有约定）；react-scripts
   经 `src/electron/tests/` 下的转发 stub 发现这些测试（`src/electron` 是
   真实目录，非 symlink）。

### 11.3 提交白名单（CEO commit 用）

工作树同时存在并发 live-long-run 工作的未提交改动（scripts/test-api、e2e、
use_chat_stream 等）。提交本工作必须按下列名单逐文件 add，**禁止 `git add -A`**：

```text
docs/architecture/settings-sqlite-migration-plan.md
electron/main/index.js
electron/main/ipc/register_handlers.js
electron/main/services/settings_storage/db.js
electron/main/services/settings_storage/service.js
electron/main/services/settings_storage/register_handlers.js
electron/preload/bridges/settings_storage_bridge.js
electron/preload/channels.js
electron/preload/index.js
electron/shared/channels.js
electron/tests/main/ipc_channels.test.cjs
electron/tests/preload/api_contract.test.cjs
electron/tests/main/settings_storage_service.test.cjs
electron/tests/main/settings_storage_service.test.js
electron/tests/main/settings_storage_handlers.test.cjs
electron/tests/main/settings_storage_handlers.test.js
electron/tests/preload/settings_storage_bridge.test.cjs
electron/tests/preload/settings_storage_bridge.test.js
src/electron/tests/main/settings_storage_service.test.js
src/electron/tests/main/settings_storage_handlers.test.js
src/electron/tests/preload/settings_storage_bridge.test.js
```

### 11.4 影响范围（detect-changes）

对上述白名单做 scoped `detect-changes`（staged scope）：21 files / 153 symbols /
**0 affected processes / risk LOW**。Phase 1A 无 renderer 消费方，无执行流受
影响；working-tree 全量扫描中出现的 useChatStream flows 属并发工作。

### 11.5 Phase 1B 携带项

- renderer 预清洗非法顶层 key + migration warning（见 11.2-1）。
- 迁移 marker 写入必须区分 `already-complete` 与 `refused-stale-digest`。
- renderer 按 `"[<code>] "` message 前缀解析错误码。
- CAS 落地时处理 revision 单调性（见 11.2-3）。
- Phase 1B 文件清单外还有两处直接碰 localStorage 的调用方需核实是否走
  helper：`settings/model_providers/custom-providers/custom_provider_list.js`、
  `settings/model_providers/custom-providers/import_pipeline.js`；Phase 2 的
  Computer Use 同理：`settings/computer_use/boot_sync.js`、
  `enable_controller.js`、`index.js`。
- 无 in-app 冒烟：Phase 1A 无 renderer 消费方，settings.db 行为目前仅由
  单测/契约测试覆盖，Phase 1B 接通后需真机验证。

## 11B. Phase 1B 实施记录与裁决（2026-07-23，实施后追加）

状态：Phase 1B 已实施（五切片：repository 基础设施 → container/appearance/app →
runtime/memory → flags/dev → model_providers/api.unchain），通过五视角合并审查
（spec/正确性/安全/payload 逐字节等价/约定）+ 两轮修复 + 复审。
测试：renderer 296 suites / 2499 tests 全绿（迁移前基线 286/2345，净增 154），
Electron 142/1204 与 Phase 1A 后逐位一致。**真机冒烟已通过**（见 11B.4）。未 commit。

### 11B.1 HIGH/CRITICAL impact 批复（controller 追认，需 CEO 知情）

T2/T3 实施中 `readThemeSettings`（HIGH，13 impacted）、`readWorkspaceRoot`/
`readWorkspaces`（HIGH）、`readMemorySettings`（CRITICAL，fan-in 26，喂模型可见
请求字段）的 impact 结果超过停手线，实施者未停手。controller 追认理由：
(a) 计划正文明确指定转换这些符号；(b) 全部转换保持导出签名与返回值形状零变化，
调用方零改动；(c) payload 等价专设审查视角 + api.memoryProvider/api.workspaceRoot
characterization 测试逐字段验证请求 payload 不变；(d) 全量测试零回归。
若 CEO 否决：回滚路径 = revert T3 的 memory/storage.js 转换并重走停手上报流程。

### 11B.2 契约裁决（在 Phase 1A §11.1 基础上追加）

1. **迁移失败一律降级**：任何 migrateLegacy 失败（含 unknown status）都使本
   session 降级 localStorage fallback——SQL 未完成迁移前绝不接受后续写入，
   防止"部分 SQL 下次启动变权威"。
2. **fallback 模式 secret 同样剥离**：repository 读取任何模式下都不含三 secret
   字段；消费方经 settings_secret_adapter 合并读。
3. **fallback 写错误同步抛出**（`options.throwSyncWriteErrors`，仅 runtime/
   appearance opt-in）：保持 legacy quota 错误契约；其余吞错消费方行为不变。
4. **model_providers 非对象值写入直接拒绝**（`[invalid_value]`），secret 永不
   被非对象 replace 抹除；非 plain-object 的 legacy model_providers 迁移时整体
   替换为 `{}` 并记 warning。
5. **secret adapter 原样写入**（无 String() 强转）；损坏 root 时
   `setCustomProviderSecret` 走 opt-in repair（对齐 legacy clobber），
   `writeProviderSecret` 默认仍拒写（对齐 legacy refuse）。
6. **removeCustomProvider 原子性**：secret 删除排在 repository 持久化成功之后。
7. container.test.js 的 setItem 计数断言按 per-namespace 写语义更新（1→2、2→3），
   反冗余意图保留且更强。
8. `settings_repository.js` 顶部 `/* global globalThis */`——CRA eslint 不认
   globalThis，真机冒烟的 dev overlay 抓出（Jest 不跑 CRA eslint 所以测试全绿；
   不修会阻断 CI 构建）。

### 11B.3 遗留携带项（Phase 2 / Phase 5）

- **退出瞬间持久化窗口**：beforeunload flush 无法 await 排在未决迁移后面的
  写入（毫秒级、仅偏好级数据）。根治需主进程侧 drain 或同步 flush IPC——
  属 Phase 1A 冻结面的扩展，Phase 2 落地时一并设计。
- marker 不回填（bootstrap 已 complete 但 marker 缺失时）：Phase 5 清理逻辑
  必须以 SQL migration state 为准（计划 §5.5 已要求），不得只看 marker。
- CAS 落地时 revision 单调性（§11.2-3 未变）。
- dev 模式端口漂移 = localStorage origin 碎片化（2907/2908/2909 各一份 legacy
  副本、marker 只在迁移发生的 origin）。settings.db 是 userData 级跨 origin
  唯一权威，行为正确；但 dev 下 secret（仍在 localStorage）会随 origin 漂移——
  这是 dev 既有痛点，Phase 4 secret 入 OS vault/safeStorage 后根治。
- 冒烟中观察到 durable-interaction 恢复报
  `interaction_integrity_error: digest mismatch`（底部 toast），属 durable
  interaction 线的旧 journal 问题，与 settings 无关，转交该线 owner。

### 11B.4 真机冒烟证据（2026-07-23）

- 首启（真实 origin localhost:2907，真实用户数据）：`settings.db` 创建，
  8 namespaces 全部导入，meta digest 与 localStorage marker digest 一致
  （811027ec…），`legacy_migration_state=complete`。
- **secret 剥离实证**：legacy localStorage 含 OpenAI+Anthropic 真实 key，
  SQL `model_providers` 仅 `{"custom_providers":[]}`（23 字节）。
- 写路径：UI 关闭 sidebar → SQL `ui.side_menu_open=false`（revision 0→1），
  legacy localStorage 保持 true 不动（无双写）。
- 重启：SQL 权威赢过分歧的 legacy 值（sidebar 保持关闭）；迁移不重跑。
- 跨 origin：第二次启动落在 2909（另一份 legacy 副本、无 marker），SQL 仍权威。
- 探针：openai:gpt-4.1 发送"Reply OK"→ 收到 "OK"（secret adapter key + SQL
  workspace/memory 组装请求全链路），探针会话已删。
- SIGTERM 退出后 `PRAGMA integrity_check` = ok。

### 11B.5 提交白名单增补（接 §11.3，合并提交）

Phase 1B 新增 28 个文件，与 §11.3 的 19 个合并提交（仍禁 `git add -A`）：

```text
src/SERVICEs/settings_repository.js
src/SERVICEs/settings_repository.test.js
src/SERVICEs/settings_secret_adapter.js
src/SERVICEs/settings_secret_adapter.test.js
src/SERVICEs/bridges/settings_storage_bridge.js
src/SERVICEs/bridges/settings_storage_bridge.test.js
src/SERVICEs/api.unchain.js
src/SERVICEs/api.unchain.storage.test.js
src/SERVICEs/custom_provider_store.js
src/SERVICEs/custom_provider_store.test.js
src/SERVICEs/feature_flags.js
src/SERVICEs/feature_flags.test.js
src/CONTAINERs/config/container.js
src/CONTAINERs/config/container.test.js
src/COMPONENTs/settings/appearance/storage.js
src/COMPONENTs/settings/appearance/storage.test.js
src/COMPONENTs/settings/dev/storage.js
src/COMPONENTs/settings/dev/storage.test.js
src/COMPONENTs/settings/memory/storage.js
src/COMPONENTs/settings/memory/storage.test.js
src/COMPONENTs/settings/model_providers/storage.js
src/COMPONENTs/settings/model_providers/storage.test.js
src/COMPONENTs/settings/runtime.js
src/COMPONENTs/settings/runtime.test.js
src/COMPONENTs/init-setup/init_setup_storage.js
src/COMPONENTs/init-setup/init_setup_storage.test.js
src/COMPONENTs/init-setup/steps/workspace.js
src/COMPONENTs/init-setup/steps/workspace.test.js
```

scoped detect-changes（staged scope）：28 files / 104 symbols / 5 processes /
risk MEDIUM——即计划指定转换的高扇入符号本身，签名零变化、payload 等价已锁。

## 11C. Phase 2 实施记录与裁决（2026-07-24，实施后追加）

状态：Phase 2 四切片（S1 token_usage / S2 toolkit prefs / S3 computer use /
S4 agent folders）已实施，五视角审查 17 findings 经三轮修复 + 一轮 Minor 修复
（10 条）全部关闭。测试：renderer 300 suites / 2720、electron 145 / 1301 全绿。
真机冒烟通过（见 11C.4）。**Phase 2 改动未 commit**（39 文件白名单见 11C.5）。

### 11C.0 历史事件：a1fa965 大杂烩提交

Phase 2 窗口期内，一次并发提交 a1fa965（已推送 origin/dev，不可改写）把
Phase 1A/1B 全部 47 文件 + 并发 live-long-run 工作 + org 文件共 93 个文件扫进
一个 commit，提交信息只描述 secret adapter。已抽验提交内容为 1A/1B 审查后终态
（含 globalThis 修复），内容无损，仅历史归因受损。§10 的分批提交计划对
1A/1B 就此作废；**Phase 2 白名单（11C.5）建议尽快独立干净提交，避免再次被扫**。

### 11C.1 CRITICAL impact 披露（CLAUDE.md 规定必须报告 CEO）

刷新索引后 scoped detect-changes：39 files / 499 symbols / **56 affected
processes / risk CRITICAL**。评估：toolkit 自动批准与 token 记录位于聊天发送
热路径，扇入大是计划范围的固有属性。缓解证据：全部 store 导出签名零变化、
调用方零改动（use_chat_stream.js 未触碰）、五视角审查 + 四轮修复、双全量测试
零回归、真机冒烟覆盖热路径（2907 真实回复 / 2908 干净的 provider 错误路径）。

### 11C.2 契约与裁决

1. per-store 迁移协议落地：DB meta `<store>_migration_state` + digest 幂等 +
   失败整体回滚 + session 降级 localStorage；**SQL 状态权威**（Minor 修复 #1：
   marker 与 SQL 不一致时以 SQL 为准，complete 时本地补写 marker）。
2. bootstrap 会话级共享缓存（bridge `getSessionBootstrapSnapshot()`）——
   每 store 每会话至多一次 sendSync，热路径无重复同步 IPC。
3. **批准裁决**：SQL 模式下 `clearTokenUsageRecords` 同时把 legacy key 写成
   `{records:[]}`（防清除后旧记录经同步兼容读复活）——"legacy 只读"的
   显式例外，方向是收窄。
4. **批准裁决**：token_usage UI 下拉框候选集在 SQL 模式来自所选时间窗而非
   全量（统计数字不变）；后续如需全量候选，加 DISTINCT 查询 IPC。
5. 'All' 聚合截断方向 = 保最新弃最旧（DESC 扫描后 reverse 输出，未截断时
   字节级等价）；SQL 侧聚合是未来项（当前量级 << 5 万上限）。
6. `parseSettingsStorageErrorCode` 修复 `^` 锚定（Electron invoke 包装前缀
   使生产解析完全失效——Phase 1B 遗留缺陷，本轮授权修复并补真实前缀测试）。
7. S3 新增共享内部模块 `src/SERVICEs/computer_use_preferences_sql.js`
   （三 key 一表一迁移，比三份拷贝正确）——scope 偏离批准。
8. 安全面复核：computer toolkit 拒缓存批准在 SQL 模式锁定；fail-closed 全
   路径（无行/损坏/version 不匹配/镜像未就绪/迁移失败）成立；DB 重置 +
   marker 在场时 auto-approve 从 legacy 重建（narrowLegacyStore 保证 legacy
   跟随 revoke 收窄，无扩权）。

### 11C.3 遗留携带项

- toolkit_auto_approve 的真机首用未触达（只在真实工具调用审批时初始化）——
  下次带工具调用的 QA 顺手看一眼 `toolkit_auto_approve_migration_state`。
- agent folder 真机首用同理（需打开 recipe 列表 UI）。
- 探针在无 key origin 的失败信息干净（"Provider 'openai' requires API key"）；
  dev 端口漂移致 secret 随 origin 碎片化仍是 Phase 4 待根治项。
- S4 已知窗口：repository SQL→降级切换瞬间的少量树操作可能留在 settings 根
  而非 standalone key（报告 S4 节有细节，偏好级数据，接受）。
- query limit/offset 语义现为"最新端优先"——外部 QA 脚本如有假设需同步。

### 11C.4 真机冒烟证据（2026-07-24）

- schema v1→v2 就地升级（真实 DB，先由 19:16 的 S1 时代主进程升级建表，
  终态主进程补齐 S2/S3 表——增量 CREATE TABLE IF NOT EXISTS 路径实证）。
- **token_usage 迁移**：origin 2907 legacy 327 条 → SQL 328 行（含探针新增
  1 条），`token_usage_migration_state=complete`，探针回复 "OK"。
- **主进程旧代码 + renderer 新 bundle 的混布场景**：S2/S3 IPC 缺失时 store
  按设计降级 localStorage，聊天零中断——fail-safe 实证。
- **default_toolkits 迁移**：origin 2908 触发，marker complete，
  `global|core|0` 入表。
- **computer use fail-closed**：无 legacy → 0 行、默认关闭。
- 每轮退出后 `PRAGMA integrity_check` = ok。

### 11C.5 Phase 2 提交白名单（39 文件，独立提交，禁 git add -A）

以 `git status --porcelain | grep -E "^.. (src|electron)/"` 的当前全集为准
（a1fa965 之后 src/electron 两树下的改动全部属于 Phase 2）：
electron 面 = settings_storage 三件套 + shared/preload channels + bridge +
7 个 settings_storage 测试（.cjs/.js/src stub 齐全）+ ipc_channels/api_contract；
renderer 面 = token_usage {storage,index} / default_toolkit_store /
toolkit_auto_approve_store / computer_use 三 store + 共享
computer_use_preferences_sql / agent_folder_storage / bridges 及全部 co-located
测试。精确清单可随时用上述 grep 重新生成。

## 11D. Phase 3 实施记录与裁决（2026-07-25，实施后追加）

状态：Phase 3（Custom MCP Icon 落盘 + `asset_metadata`）已实施，四视角审查
6 findings（4 C/I 一轮修复 + 2 Minor 同根因由 controller 修复）全部关闭。
测试：renderer 301 suites / 2767、electron 146 / 1332 全绿。**真机冒烟通过**
（见 11D.3）。改动未 commit（17 文件白名单见 11D.4）。

> 过程注记：首次实施 agent 撞 Fable 5 用量上限中途死亡、零持久改动；切 Opus 4.8
> 后 resume workflow 从头重跑（errored agent 无缓存），干净完成。

### 11D.1 契约与裁决

1. 图标 FILES 落 `<userData>/assets/mcp-icons/<sanitized-id>-<sha256前缀>.<ext>`，
   `asset_metadata`（settings.db）只存元数据；schema_version 保持 2（增量建表，
   与 S2/S3 同判例）。
2. **SVG 内容模型偏离（已处理）**：brief 假设 content 恒为 base64，实际 SVG 以
   RAW UTF-8 文本存/渲染（PNG=base64）。按 mime 无损往返：磁盘存解码字节，
   getMcpIconAsset 按 mime 重编码，`getCustomMcpIcon` 输出与 ToolkitIcon 渲染
   字节级不变、调用方签名零改动。SVG 不做 sanitize——与 legacy 一致、经
   `<img src=data:...>` 渲染不执行脚本，无 XSS 回归。
3. **SVG 尺寸上限对齐（controller 修复的 Minor 根因）**：renderer 原按 400,000
   字符统一放行，但主进程按 300,000 解码字节封顶。PNG 两者等价（400k base64
   字符≈300k 字节），SVG 是裸文本会造成 300–400KB 区间"本会话乐观显示、
   下次启动被主进程静默丢弃"。已改 `isValidIcon` 为 mime-aware：SVG 按 UTF-8
   字节对齐 300,000、PNG 保持 400,000 字符（legacy 不变）。补两条测试。
4. get 返回 `{ok:true, icon:{mime, content}|null}`；文件缺失或路径损坏时删行
   自愈（SQL 行绝不 outlive 文件）。
5. 写序：临时文件+rename 原子落位 → upsert SQL → 删旧文件；SQL 失败删新文件。
   任何路径不留悬空引用。
6. 方法并入 service.js（非独立 asset_service.js）——共享 db/tx/meta/errorWithCode/
   迁移信封闭包，主进程侧每个 store 都住 service.js（S3 的 shared-module 是
   renderer 侧）。

### 11D.2 遗留携带项

- 迁移路径本次真机未走（测试机 legacy 图标为 0，冒烟走全新写入）——迁移逻辑
  由 25 个 electron 单测覆盖（含幂等/drop-and-count/digest-mismatch）；带真实
  legacy 图标的机器首用时顺手看一眼 `mcp_icons_migration_state`。
- 一帧 null 闪烁（迁移完成→惰性 hydrate 之间）+ hydrate 失败本会话降级通用
  glyph、下次自愈——偏好级，接受。
- durable-interaction 恢复报 `interaction_integrity_error`（app 日志），旧问题
  与 Phase 3 无关，仍归该线 owner。

### 11D.3 真机冒烟证据（2026-07-25，Opus 4.8）

- `asset_metadata` 表在 Phase 3 主进程 init 时自动建（增量 CREATE TABLE）。
- **set**：1×1 PNG → 磁盘 70 字节文件 + 表行，byteSize 一致，ext 由验证过的
  mime 派生（`.png`）。
- **get 往返**：读回文件字节重编码 base64 与输入字节级一致。
- **路径穿越中和**：toolkitId=`mcp.custom.../../../../../../tmp/evil` 被 sanitize
  成安全的 in-dir 文件名（点/斜杠→`_`），`/tmp/evil` 未被创建，文件留在
  mcp-icons 内。
- **bad mime**：`image/gif` 被拒（`[invalid_mcp_icon]` 前缀错误）。
- **重启持久化**：SIGTERM 后文件+行存活，新主进程 getMcpIconAsset 读回
  `persisted=true`。
- **delete 清理**：删除同时清行与文件（0 行 0 文件，无悬空/无孤儿）。
- 全程 `PRAGMA integrity_check` = ok。

> 冒烟工程注记：Electron app + CRA dev server 与 `react-scripts test` 同跑会 CPU
> 饥饿，导致无关套件（color_picker/persist_cadence/chat）出现 951s–4335s 超时假
> 失败——跑全量测试前必须先停掉 app 实例。停后干净重跑 301/2767 全绿。

### 11D.4 Phase 3 提交白名单（17 文件，独立提交，禁 git add -A）

以 `git status --porcelain | grep -E "^.. (src|electron)/"` 当前全集为准：
settings_storage service/register_handlers、shared/preload channels、preload+
renderer bridge、custom_mcp_icon_store，及全部 co-located 测试
（`settings_storage_mcp_icons` 三变体 .cjs/.js/src stub + 修改的
ipc_channels/api_contract/handlers/service/bridge 测试）。

## 11E. Phase 4 实施记录与裁决（2026-07-25，实施后追加）

状态：Phase 4（provider secret 迁移到 safeStorage 加密存储）已实施并**真机三态冒烟通过**。
7 切片（S1 密文表+safeStorage / S2 迁移+dual-keep / S3 configuredCredentials 信号 /
S4 main 注入接缝 / S5 renderer 去 secret / S6 字节等价 / **S7 迁移触发接线=激活**）。
三道签字门全过：安全 GO、架构师冻结契约、llm-expert 字节等价 CO-SIGN。
测试：electron 150 suites / 1419、renderer 310 suites / 2925 全绿。改动未 commit（44 文件白名单见 11E.5）。

> 过程注记：本 Phase 跨多次 agent 死亡（Fable 5 额度、连接中断），均零持久改动、resume/重派恢复；
> 所有设计/审查 agent（security/architect/llm-expert）因 Fable 额度尽，一律用 `model:opus` 覆盖派发。

### 11E.1 三道签字门

1. **安全 GO（有条件）**：方案 B（Electron `safeStorage` 加密 BLOB 存 settings.db 专表），
   零新依赖、机器绑定密文防备份外带；门 5（注入移 main）路由 CTO ADR。全文本地
   `phase4-security-decision.md`，裁决入 pupu-security-expert 记忆。
2. **CTO ADR（门 5 = (a) 注入移主进程）**：renderer 发非敏感描述符、main 在 POST 前解密注入并剥除；
   独立复核认定 (b) 是"付全款拿半货"。全文本地 `phase4-cto-adr.md`。
3. **架构师冻结检查点（CEO 指定，赚回成本）**：REVISE 抓到**漏第 4 条 secret 路
   `injectOpenAIEmbeddingKeyIfNeeded`**——`model=anthropic + memory + openai embedding` 同一 payload
   需两个不同 secret，单对象描述符表达不了 → 改为 **`[{kind,id,channel}]` 列表**；并修正字节等价
   陷阱（短路按 provider **id** 去重复刻今日 first-writer-wins，不看 channel）。冻结签字后 S4/S5 并行。
4. **llm-expert CO-SIGN**：模型可见字段字节等价（口径=字段集/值等价、JSON key 顺序不作差异，
   provider SDK 按字段名读）；亲跑三套 characterization 全绿；明确 ratify S5 双短路（删值短路会 VETO）。

### 11E.2 架构（门 5）

- 稳态：renderer 发 `options.__pupu_secret_injection = [{kind,id,channel}]`（无值无密文），
  main 在 `startMisoStream`（V1/V2/V4 唯一 choke）+ `replaceMisoSessionMemory` 两条出站路
  按 (id,channel) 固定字段集表解密注入、**必剥描述符**、fail-closed（解密失败 emit-error 绝不 keyless）。
- renderer 稳态**绝不读 secret 值**；`readDecryptedProviderSecret` 是 main 内部方法、绝不上 IPC。
- 三态：稳态发描述符 / 首启过渡+degraded 回退读 legacy（今日行为，字节等价）。
  `authoritative = secretStorageStatus==="available" AND configuredCredentials.includes(id)`；
  `configured = SQL OR legacyHasSecret`（OR-legacy 消除过渡窗"有 key 发不出"）。

### 11E.3 裁决（controller）

1. **S5 双短路**：保留今日基于值的 `hasAnyApiKey` 短路（捕获调用方显式 key）+ 新增 list 按 id 去重
   （捕获 embedding→model 塌缩）——互补，删值短路会破坏字节等价。**接受**（llm-expert 会 VETO 删除）。
2. **S7 bootstrap providerCredentials 增补**：S3 的 storeMigrations map 漏了 providerCredentials 键，
   幂等分支形同虚设 → 触发器每启动重发。补该键（identity-only 无 secret）是必要最小触碰。**接受**。
3. **S7 红线 ledger carve-out**：新 migrate channel 名含 'credential' 命中禁词 regex（原意禁 stored-secret
   **读** channel），但这条是**入站写方向**（renderer 交出自己 legacy 明文给 main 加密、只回 status），
   非读。精确名白名单 carve-out 合理、S7 安全视角审查已过。**接受**。
4. **S7 Minor 已修**：入站 secret channel 的 handler 日志去掉 `|| error.message` 回退、改
   code-only + `uncoded_error` 占位（防非编码抛错泄漏 payload 文本）。

### 11E.4 真机三态冒烟证据（2026-07-25，真 macOS Keychain）

- **状态 1 首启过渡**：configuredCredentials 快照在迁移前取（空）→ authoritative=false → 走 legacy 路，
  openai:gpt-4.1 探针 "OK"（零回归）。
- **状态 2 迁移完成**：boot 触发 S7 迁移 → `provider_credentials` 出现 2 行**真实 Keychain 加密**密文
  （openai 179B / anthropic 115B，hex 无 `sk-` 明文），migration_state=complete，**legacy 保留（dual-keep）**。
- **状态 3 重启稳态**：bootstrap `secretStorageStatus="available"` + `configuredCredentials=["anthropic","openai"]`
  → authoritative=true → **renderer 发描述符、不读原始 key** → main 解密注入 → openai:gpt-4.1 探针 "OK"。
  R1 收益（renderer 稳态见不到 key）在真机兑现。
- 每轮退出 `PRAGMA integrity_check` = ok。

### 11E.5 遗留与后续

- **删 legacy localStorage secret = N+1 独立变更，本 Phase 明确不做**（dual-keep 保跨版本回滚兜底）。
  硬前置（架构师 N1）：删 legacy 前 `configuredCredentials` 必须改可 live-refresh，否则 N+1 后
  "会话内新增 key 立即用"回归。
- **MCP/OAuth secret（`~/.pupu/*.json` 明文 0600）= OUT of Phase 4**，defer 独立 backend 工作项
  （owner pupu-dev-backend）。
- 残余风险（安全签字附带接受）：R2（同用户+代码执行恶意软件仍可解密文，桌面无硬件令牌不可根除）、
  Linux 无 keyring minority 保持现状明文（fail-closed 绝不更糟）。
- 两 characterization 文件靠逐字常量同步，建议后续抽共享 fixture。

### 11E.6 Phase 4 提交白名单（44 文件，独立提交，禁 git add -A）

以 `git status --porcelain | grep -E "^.. (src|electron)/"` 当前全集为准（c2695d0 之后 src/electron
两树改动全属 Phase 4）：settings_storage service/register_handlers/db、shared+preload channels、
preload+renderer bridge、unchain/service.js（注入接缝）、api.unchain.js（去 secret）、
provider_secret_status/provider_secret_migration + boot_sync、App.js（触发挂载）、及全部 co-located 测试
（三变体 .cjs/.js/src stub）。精确清单用上述 grep 重生成。

## 11F. Phase 5 实施记录与裁决（2026-07-26，实施后追加）

状态：Phase 5（清理 + 文档）已实施。代码切片 ‖ 文档切片并行，四视角审查
（reset-safety xhigh / correctness / conventions / docs-accuracy）8 findings 经两轮修复 +
一轮 4 条 Minor 修复全部关闭。测试 electron 150 suites / 1429、renderer 310 suites / 2955 全绿。
非破坏性冒烟通过（DB_STATS 元数据）。改动未 commit（43 文件白名单见 11F.4）。

### 11F.1 Reset Settings（CEO 拍板范围 = 只清非敏感设置+偏好）

- 主进程 `resetSettings()` 一个 SQL 事务：清 `settings` 全 namespace + `default_toolkits` +
  `toolkit_auto_approve` + `tool_auto_approve` + `computer_use_preferences`。
- **保留**：`provider_credentials`（API key 密文）、`token_usage_records`（token 历史）、
  `asset_metadata` + 图标文件、`meta`（迁移状态）、`chats.db`。
- **绝不用 `localStorage.clear()`**：改为剥离式清 legacy 非敏感 key，**不碰** secret 三字段 /
  pupu_boot_palette / outbox 三兄弟 / uiTesting。
- IPC `RESET_SETTINGS` + `DB_STATS`（只读元数据，size/rows，无任何 value/secret）。
- `local_storage/index.js` 的 `handleClearAll` 从 `localStorage.clear()` 改为调 reset-settings
  （confirm 门控保留）。reset 后同步调三个 store 的 `reset*MirrorForSettingsReset()` 立即撤销
  auto-approve/computer-use consent（安全控制本会话即失效，不等重启）；镜像 reset 编排在协调层
  （local_storage/index.js），避免 settings_repository 反向依赖上层 store。
- SQL reset 走 repository FIFO 队列（防 in-flight 写 ack 幸存 reset）。

### 11F.2 Local Storage 页分类 + 文档

- Local Storage 设置页三分类：Browser cache / SQLite Settings database（经 DB_STATS）/ Runtime files；
  storage_metrics 增 SQLite DB 大小。11 个 locale 补文案。
- 9 份文档更新到 SQLite 权威架构（storage-model/ipc-boundary/request-flow/memory-system/
  model-and-toolkit-catalog/workspace-system/custom-model-providers/project-conventions/DEV_GUIDE）。
  据 §11-§11E 已实施事实，未臆造"已删 legacy secret"（实为 dual-keep N+1 才删）。

### 11F.3 遗留

- reset 镜像撤销责任在组件层（local_storage/index.js），resetSettings 未来若有新 caller 需一并调
  三个镜像 reset（当前唯一 caller 两处已覆盖）。替代方案是 subscribe/event 解耦，本轮按"不反向依赖"处理。
- custom-model-providers.md 是设计稿型文档，只加顶部存储勘误块 + 更新一处，§3 的旧 localStorage
  shape 代码块保留但已被勘误块标注过期。storage-model.md 的 chat 存储章节仍描述 localStorage
  （chat 存储迁移不在本迁移范围）。
- **删 legacy localStorage secret 仍是 N+1 独立变更**（本 Phase 未做，dual-keep 保留）。

### 11F.4 Phase 5 提交白名单（43 文件，独立提交，禁 git add -A）

`git status --porcelain | grep -E "^.. (src|electron|docs)/"` 全集：settings_storage
service/register_handlers、shared+preload channels、preload+renderer bridge、settings_repository、
local_storage/{index,utils/storage_metrics}、11 locale、9 docs 及 co-located 测试。

## 11G. 迁移全景（2026-07-26，5 阶段完成）

App Settings → SQLite 迁移**五阶段全部实施完成**（未 commit，各阶段独立白名单）：

| Phase | 内容 | 状态 | commit |
|---|---|---|---|
| 1A | settings.db 基础设施 + IPC + repository 契约 | 冒烟过 | a1fa965（并发提交） |
| 1B | renderer repository + 核心 namespace 迁移 | 真机冒烟过 | a1fa965 |
| 2 | 结构化 store（token_usage/toolkit/computer_use/agent folders） | 真机冒烟过 | c2695d0 |
| 3 | MCP 图标落磁盘 + asset_metadata | 真机冒烟过（含路径穿越） | db501e3 |
| 4 | provider secret → safeStorage 加密 + 注入移主进程 | 真机三态冒烟过 | db501e3 |
| 5 | 清理 + reset SQL 事务 + 9 文档 | 非破坏冒烟过 | 未提交 |

单向门（已过，不可轻易回退）：settings.db schema v2、各 store 迁移契约、secret 描述符列表契约、
renderer 稳态不见原始 secret 的安全姿态。**未做（future）**：删 legacy localStorage（N+1，需
configuredCredentials live-refresh 前置）、MCP/OAuth `~/.pupu/*.json` 加密（独立 backend 工作）、
storage-model.md 的 chat 存储章节（chat 迁移不在本范围）。

## 12. 实现 Agent 的首个行动清单

1. 读取仓库规则和本计划。
2. 检查 GitNexus index 是否最新。
3. 对以下首批目标逐个运行 impact：

   - `createChatDb`，仅作为参考，不修改。
   - `registerIpcHandlers`
   - preload `contextBridge` 暴露入口
   - `loadSettingsStorage`
   - `saveSettingsStorage`

4. 报告 blast radius。
5. 只实现 Phase 1A，不提前修改业务 store。
6. 完成 Phase 1A 测试并让 Claude reviewer 验证。
7. 再进入 Phase 1B。

不要从批量替换 `localStorage` 开始；先把数据库服务、迁移协议和 repository 契约建立完整。
