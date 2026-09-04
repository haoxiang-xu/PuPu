# 自定义 Model Provider（可分享 JSON 配置）— 设计文档

> **状态：设计稿；核心已实施**（设计 2026-07-15）
> 产出方式：4 份代码勘察 → 3 份独立设计（最小改动 / 产品优先 / 健壮安全优先）→ 3 视角评审（架构 / 安全 / 产品）→ 合成。评审记录见 §14。
>
> **存储勘误（App Settings → SQLite 迁移后，2026-07-25）**：本文 §3 / §9.7 描述的
> "定义与 secret 明文存 localStorage" 已过期。迁移后：
> - **定义**（`custom_providers`）存 `settings.db` 的 `model_providers` namespace（经
>   settings repository / `custom_provider_store.js`），仍是可分享、无密钥的形状；
> - **secret**（原 `custom_provider_secrets`）与内置 openai/anthropic key 一样，改存
>   `settings.db` 的 `provider_credentials` 表，经 Electron `safeStorage` 加密（机器绑定密文）；
> - 每请求的 key 注入**从 renderer 移到主进程**：renderer 只发 secret 描述符
>   `{ kind: "custom_provider", id, channel }`，主进程解密后注入并剥除描述符（原
>   `options.custom_provider_api_key` 专名字段仍是主进程注入到出站 payload 的落点）。
> - 删除 legacy 明文 localStorage secret 是独立的 N+1 变更，本阶段**未做**（dual-keep 只读保留）。
>
> 其余架构（协议孪生映射、白名单导出、catalog 前端合并、`model_io_factory` 闭包）不变。
> 动机场景：SAP Hyperspace LLM proxy —— 本地 `hai proxy start` 在 `http://localhost:6655/anthropic` 暴露 Anthropic 兼容 Messages API，`x-api-key` 认证，模型 ID 形如 `anthropic--claude-4.5-haiku`。
> 文中 file:line 引用来自勘察时点（dev 分支），行号漂移时以函数名为准。

---

## 0. 一句话架构

自定义 provider 的**定义**（协议、base_url、认证方式、模型能力表）是可分享的 JSON，存前端 localStorage（经 SERVICEs helper）；**API key 值**单独存本机 secret map，永不进入定义对象。每次聊天请求，前端把「净化后的定义 + 本机 key（专名字段）」注入 payload options（Electron 层已核实无损透传），Flask adapter 严格重校验后，用 unchain 现成的 `Agent(model_io_factory=...)` 钩子装配带 base_url/headers 的 ModelIO。unchain 侧只需一个独立小 PR（工具 schema 按协议分派）。

## 1. 核心架构决策

| # | 决策 | 选择 | 关键理由 |
|---|---|---|---|
| A1 | 配置存放 | 前端 localStorage，每请求随 options 下发；后端无状态 | 与现有 openai/anthropic key 注入模式一致（api.unchain.js:129-172）；Electron 层零改动（payload 原样透传，已核实） |
| A2 | secret 存放 | `custom_provider_secrets` map，与定义数组物理分离 | 导出函数只能触到定义 store，结构上不可能泄密；删除 provider 联动删 map 条目，无孤儿平面 key |
| A3 | **spec.provider 取值** | **协议孪生名**：anthropic 协议 → `"hyperspace"`，openai-responses → `"openai"`，ollama → `"ollama"`；自定义身份 `custom.<slug>` 只存在于 PuPu 层（modelId + options.custom_provider） | 见 §1.1，本设计最重要的抉择（2026-07-15 实施前修正，原 fail-closed 裸自定义名路线被实现勘察证伪） |
| A4 | unchain 集成 | `model_io_factory` 闭包 + 一个小 PR（protocol 类属性） | 零构造器签名破坏；`clone()` 自动转发 factory，子代理天然继承 |
| A5 | 静默回退 | **全部替换为硬错误** | 现状：未知 modelId 会被静默换成 `ollama:deepseek-r1:14b` 并回写 UI——本设计明确消灭该行为 |
| A6 | v1 协议 | `anthropic`（主打）、`openai-responses`、`ollama` | 协议名对 openai 刻意带 "responses" 后缀：unchain 的 OpenAIModelIO 走 Responses API（openai.py:149），**不是** chat/completions，只实现 chat/completions 的网关（LiteLLM/vLLM 默认面）不兼容，命名必须诚实。ollama 协议覆盖无认证本地网关（OllamaModelIO 原生支持 base_url） |
| A7 | catalog | 纯前端本地合并，后端 catalog 零改动 | catalog 是无 options 的 GET，后端本来就不知道 localStorage 里的定义 |
| A8 | key 传输 | 专名字段 `options.custom_provider_api_key`（+camel 变体），**不复用**通用 `options.api_key/apiKey` 通道 | 通用通道正是现有 openai key 的注入通道——任何 provider 判定 bug 都可能把 custom key 当 openai key 发给 api.openai.com；专名字段同时给日志脱敏一个确定靶点 |

### 1.1 spec.provider 的取值：协议孪生映射（实施前修正，记录 rationale）

**评审阶段的原方案**（spec.provider = `custom.<slug>`，fail-closed 裸自定义名）在实施勘察中被证伪：unchain kernel 的 `validate_provider`（kernel/run_preparation.py:58，白名单 `{"openai","anthropic","ollama","hyperspace"}`）对未知名字直接 `NotImplementedError`，运行都起不来；且按 provider 名分派线上行为的点全库约 12 处（消息构造器对未知名 raise、context_assembler、model_turn_runtime、checkpoint_state、coalesce、observation、openai response-chain 特判等，其中多处来自 2026-07-15 合入的 durable 运行时）。逐点插协议解析 = 中型 kernel 改造，对刚合入的 durable 机器回归风险不成比例。

**另一备选**「协议映射」（spec.provider = 协议名 "anthropic"）unchain 零改动，但 adapter 里 `provider=="anthropic"` 的 memory 摘要分支会拿 custom key 直连 api.anthropic.com（fail-open 泄 key 面），且 `4.5→4-5` 模型名归一化会破坏 Hyperspace 模型 ID。

**定案：协议孪生映射** —— 取两者之长：

| 协议 | spec.provider（孪生名） | ModelIO |
|---|---|---|
| anthropic | `"hyperspace"` | HyperspaceModelIO（原生支持 base_url） |
| openai-responses | `"openai"` | OpenAIModelIO + client_factory 闭包 |
| ollama | `"ollama"` | OllamaModelIO（原生支持 base_url） |

`hyperspace` 在 unchain **每一个**分派点都是一等公民（`{"anthropic","hyperspace"}` 集合、HyperspaceMessageBuilder=AnthropicMessageBuilder 空壳子类、checkpoint 格式 anthropic.messages.v1、kernel 白名单），全链路 wire 正确；而它**不是** `"anthropic"`，所以对旗舰协议（anthropic，覆盖 Hyperspace 场景）天然 fail-closed：memory 摘要落 else 分支 no-op（custom key 不会发往官方端点，零补丁）、`_normalize_provider_model_name` 天然跳过（模型 ID 原样透传）、durable resume `HyperspaceModelIO.provider` 类属性 == spec.provider **零 hack**。

代价与边界（诚实记录）：
- **openai-responses 协议**的孪生名是 `"openai"`，是 fail-open 的——memory 摘要、模型降级、env key 回退这些 `provider=="openai"` 分支必须逐点打补丁（§7.2/§7.7）+「custom key 永不进官方端点」测试族钉死（FM16）。可枚举、有限、有测试。
- **身份歧义**：checkpoint/durable 里 provider 是孪生名，无法单从 provider 字符串区分自定义与内置会话；忠实重建靠 PuPu 层 durable resume context 里保存的 options（含 custom_provider 配置），已有该机制。
- **hyperspace 孪生撞真 hyperspace**：custom 会话里显式声明 provider="hyperspace" 的子代理模板会被 factory 按声明模型路由（在配置内→custom 端点；不在→明确 raise），文档化为 v1 限制。

---

## 2. JSON 配置格式

### 2.1 JSON Schema（draft-07，规范文档；校验器手写，不引 ajv）

新文件：`src/SERVICEs/custom_provider.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://pupu.app/schemas/custom-model-provider-v1.json",
  "title": "PuPu Custom Model Provider Export",
  "type": "object",
  "required": ["format", "format_version", "provider"],
  "properties": {
    "format": { "const": "pupu-model-provider" },
    "format_version": { "const": 1 },
    "exported_at": { "type": "string" },
    "provider": { "$ref": "#/definitions/provider" }
  },
  "definitions": {
    "provider": {
      "type": "object",
      "required": ["id", "display_name", "protocol", "base_url", "auth", "models"],
      "properties": {
        "config_version": { "const": 1 },
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$",
          "not": { "enum": ["openai", "anthropic", "ollama", "hyperspace",
                            "auto", "custom", "default", "system", "unknown"] }
        },
        "display_name": { "type": "string", "minLength": 1, "maxLength": 100 },
        "description": { "type": "string", "maxLength": 500 },
        "protocol": { "enum": ["anthropic", "openai-responses", "ollama"] },
        "base_url": { "type": "string", "pattern": "^https?://", "maxLength": 2000 },
        "auth": {
          "type": "object",
          "required": ["mode"],
          "additionalProperties": false,
          "properties": {
            "mode": { "enum": ["x-api-key", "bearer", "header", "none"] },
            "header_name": { "type": "string", "pattern": "^[A-Za-z0-9-]{1,64}$" },
            "key_label": { "type": "string", "maxLength": 120 },
            "key_hint": { "type": "string", "maxLength": 500 }
          }
        },
        "extra_headers": {
          "type": "object",
          "maxProperties": 10,
          "propertyNames": { "pattern": "^[A-Za-z0-9-]{1,64}$" },
          "additionalProperties": { "type": "string", "maxLength": 200 }
        },
        "timeout_seconds": { "type": "integer", "minimum": 5, "maximum": 900 },
        "default_model": { "type": "string" },
        "models": {
          "type": "array", "minItems": 1, "maxItems": 100,
          "items": { "$ref": "#/definitions/model" }
        },
        "metadata": {
          "type": "object",
          "additionalProperties": false,
          "properties": { "revision": { "type": "integer", "minimum": 1 } }
        },
        "notes": { "type": "string", "maxLength": 2000 }
      }
    },
    "model": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string", "minLength": 1, "maxLength": 128, "pattern": "^\\S+$" },
        "display_name": { "type": "string", "maxLength": 100 },
        "capabilities": {
          "type": "object",
          "properties": {
            "supports_tools": { "type": "boolean" },
            "supports_vision": { "type": "boolean" },
            "supports_reasoning": { "type": "boolean" },
            "max_tokens": { "type": "integer", "minimum": 1, "maximum": 400000 },
            "max_context_window_tokens": { "type": "integer", "minimum": 1024 }
          }
        },
        "default_payload": { "type": "object", "maxProperties": 16 }
      }
    }
  }
}
```

`auth.key_label` / `key_hint`：给导入者的补 key 引导文案（"从 `hai proxy status` 获取"这类提示直接长在配置里，编辑器与导入引导展示）。capabilities 键名实现时以 unchain `runtime/resources/model_capabilities.json` 现有 hyperspace 条目为模板逐键核对（R3）。

### 2.2 演进策略：宽进严出

- **同 format_version 内前向兼容**：provider 根 / model 条目的**未知字段** → `unknown_field` warning 诊断 + 剥离后落盘（本机存储永远是已知形状）。
- **安全敏感节点严格**：`auth` / `extra_headers` 内未知字段 → 硬错误（防止把认证材料走私进可分享物）。
- `format_version > 1` → 硬拒绝，文案"此配置由更新版本的 PuPu 导出，请升级"。
- 存储条目带 `config_version`，`readCustomProviders()` 内维护 `MIGRATIONS` 升级链；导入器维护 `IMPORTERS = {1: importV1}`，未来 v2 必须保留 v1 分支。

### 2.3 Schema 之外的语义校验（前端 normalizer + 后端 `_parse_custom_provider` 双份实现，后端不信任前端）

| 规则 | 错误码 |
|---|---|
| `auth.mode === "header"` 时 `header_name` 必填 | `invalid_auth_config` |
| `extra_headers` key 命中拒绝名单（大小写不敏感）：`authorization` `x-api-key` `api-key` `cookie` `proxy-authorization` `x-auth-token` | `auth_header_in_extra_headers` |
| `extra_headers` / `notes` 值启发式检查（`sk-` / `Bearer ` 前缀、长随机串）→ warning | `suspicious_secret_value`（warning） |
| payload 任意层级出现 `api_key`/`apiKey`/`token`/`secret` 形字段 → 剥离 + warning "导入文件不应包含密钥，已忽略" | `stripped_secret_field`（warning） |
| `model.id` 不含空白；**允许含冒号**（§4.2）；数组内去重 | `invalid_model_id` / `duplicate_model_id` |
| `default_model` 必须在 models 中，否则清除该字段 + warning | `invalid_default_model`（warning） |
| `base_url` 可被 URL 解析；`http://` 且 host 非 localhost/127.0.0.1/[::1] → warning + UI 常驻"明文传输"徽标 | `insecure_base_url`（warning） |
| `default_payload` 值只允许 JSON 标量与一层嵌套；key 不以 `__` 开头 | `invalid_default_payload` |
| 文件 ≤ 256 KB；任意层级拒绝 `__proto__`/`constructor`/`prototype` key（白名单逐字段拷贝构造，绝不 Object.assign 原始输入） | `payload_too_large` / `forbidden_key` |

### 2.4 SAP Hyperspace 官方预设（内置 showcase，完整示例）

内置文件 `src/SERVICEs/custom_provider_presets.json` 收录此条目（PresetPicker 数据源，§8.4）；同一内容也是可分享导出物的示例：

```json
{
  "format": "pupu-model-provider",
  "format_version": 1,
  "exported_at": "2026-07-15T10:00:00Z",
  "provider": {
    "config_version": 1,
    "id": "sap-hyperspace",
    "display_name": "SAP Hyperspace (local proxy)",
    "description": "SAP 内部 LLM proxy，经本机 hai CLI 转发 Claude 模型",
    "protocol": "anthropic",
    "base_url": "http://localhost:6655/anthropic",
    "auth": {
      "mode": "x-api-key",
      "key_label": "Hyperspace API Key (x-api-key)",
      "key_hint": "先运行 `hai proxy start`，key 见 `hai proxy status` 或 Hyperspace 账户页。"
    },
    "timeout_seconds": 600,
    "default_model": "anthropic--claude-4.5-haiku",
    "models": [
      {
        "id": "anthropic--claude-4.5-haiku",
        "display_name": "Claude 4.5 Haiku",
        "capabilities": { "supports_tools": true, "supports_vision": true,
                          "max_tokens": 8192, "max_context_window_tokens": 200000 }
      },
      {
        "id": "anthropic--claude-4.5-sonnet",
        "display_name": "Claude 4.5 Sonnet",
        "capabilities": { "supports_tools": true, "supports_vision": true, "supports_reasoning": true,
                          "max_tokens": 16384, "max_context_window_tokens": 200000 }
      }
    ],
    "metadata": { "revision": 1 },
    "notes": "使用前先在终端运行 `hai proxy start`。"
  }
}
```

### 2.5 可分享 vs 永不出现

| 类别 | 字段 |
|---|---|
| **可分享**（导出物全集） | schema 全集：id, display_name, description, protocol, base_url, auth（mode/header_name/key_label/key_hint）, extra_headers, timeout_seconds, default_model, models[], metadata, notes |
| **永不出现在配置/导出物** | API key 的**值**、任何 token（只存本机 secret map；导出按白名单**构造**而非 delete 字段，schema 双保险） |
| **本机私有，不导出** | enabled, source("manual"/"import"/"preset"), created_at, updated_at |

---

## 3. 存储设计

```js
settings.model_providers = {
  openai_api_key: "sk-...",                 // 现状不变
  anthropic_api_key: "sk-ant-...",          // 现状不变
  custom_provider_secrets: {                // 【新增】secret map（物理分离）
    "sap-hyperspace": "hs-key-..."
  },
  custom_providers: [                       // 【新增】定义数组（无任何密钥）
    { config_version: 1, id: "sap-hyperspace", ..., enabled: true, source: "preset",
      created_at: "...", updated_at: "..." }
  ]
}
```

**新文件 `src/SERVICEs/custom_provider_store.js`**（唯一读写入口；放 SERVICEs 而非 COMPONENTs——api.unchain.js 也要消费，避免 SERVICEs→COMPONENTs 层次倒挂）：

```js
// 定义（normalize-on-read，损坏/缺失 → []；参照 memory/storage.js:52-121）
readCustomProviders() / findCustomProvider(slug)
addCustomProvider(def)            // 撞名 throw {code:"provider_id_exists"}
updateCustomProvider(slug, def)   // id 创建后不可变（FM12）
removeCustomProvider(slug)        // 联动 removeCustomProviderSecret
setCustomProviderEnabled(slug, enabled)
// secret（独立路径，返回结构与定义无交集）
getCustomProviderSecret(slug) / setCustomProviderSecret(slug, v)
removeCustomProviderSecret(slug) / hasCustomProviderSecret(slug)   // UI 只用布尔
// 校验/规范化（导入与编辑共用）→ {ok, provider} | {ok:false, diagnostics:[{code,path,message,severity}]}
normalizeCustomProvider(raw)
// 导出（白名单构造式，§8.2）
buildProviderExportPayload(slug)
// 编址
customProviderKey(slug)           // → "custom." + slug
parseCustomProviderKey(key)
```

所有写操作后 `emitModelCatalogRefresh()`（现成 pub-sub）。settings schema 变更为纯增量（只加两个 key），是 CTO-gated 项——评审材料即本文 §3。

迁移：条目级 `config_version` + normalize-on-read 升级链；升级失败的单条目跳过 + console.warn（不打印字段值）；`config_version` 高于支持版本 → UI 显示"需要升级 PuPu"占位行（不静默消失）；localStorage 整删/损坏 → 一切读取回退空默认。

---

## 4. modelId 路由

### 4.1 编址

```
modelId = "custom.<slug>:<model_id>"
例:       "custom.sap-hyperspace:anthropic--claude-4.5-haiku"
```

内置 provider 名字里没有点，**结构上不可能撞名**；schema 保留字名单防 `custom.openai` 类视觉仿冒；选择器/列表恒显 "Custom" 徽标（二重防线）。

### 4.2 模型 ID 含冒号

前端 `parseProviderFromModelValue`（api.unchain.js:56-69）`split(":", 1)[0]`（JS 截断语义）取完整 providerKey；后端 `split(":", 1)`（Python maxsplit）保证 model 段完整——`custom.x:some:model:v1` 两侧都正确。**双冒号 roundtrip 必须有测试**（ollama 的 `deepseek-r1:14b` 已证同类解析安全）。

### 4.3 下游兼容（已核实，无需改动）

per-chat 持久化是自由字符串；token 统计对未知前缀记 "unknown" 不崩（v2 优化显示名）；能力查询由前端目录合并提供（§6.4），查不到落 text-only 默认。

---

## 5. unchain 侧改动（协议孪生映射后接近归零）

### 5.1 唯一改动：observation payload 的 hyperspace 分支（预存 bug 修复）

`tools/observation.py:54` 的 `build_observation_payload` 只认 `normalized_provider == "anthropic"` 才用 `max_tokens`，`hyperspace` 落入 else 拿到 OpenAI 的 `max_output_tokens`——这是内置 hyperspace 自己的预存 bug，孪生映射后影响面扩大到所有 anthropic 协议自定义 provider。改为 `in {"anthropic", "hyperspace"}` + 单测。一行，独立可合。

### 5.2 依赖的现成机制（零改动，实施者须知）

- `Agent(model_io_factory=...)`（agent.py:27）→ `builder._resolve_model_io` 优先走 factory（builder.py:839-840），完全绕过 registry 白名单；`clone()` 转发 factory（agent.py:122），子代理天然继承。
- `HyperspaceModelIO`（providers/hyperspace.py）原生接受 base_url + client_factory；`OllamaModelIO` 原生接受 base_url。
- durable resume 校验 `infer_provider(model_io)` 读实例 provider 属性 == spec.provider：孪生名下类属性天然相等，**无需任何 hack**。
- kernel `SUPPORTED_PROVIDERS`（run_preparation.py:11）已含 hyperspace。
- **无跨仓版本依赖**：v1 不需要 unchain 新 API（5.1 是修复不是依赖），原设计的"启动探测 + 硬禁用"（FM19）随之取消。

### 5.3 Phase B（v2 清理，非阻塞）

`AgentSpec` 加 `base_url` / `extra_headers`；`ModelIOFactoryRegistry.create()` 扩签名；三个 ModelIO 构造器原生收 base_url/default_headers；`ollama.py:83-88` 传 headers（解锁带认证 ollama 网关）；若未来要消除孪生名的身份歧义，引入统一 `resolve_provider_protocol` 注册表让 kernel 接受一等自定义身份（即被否决路线的完整版，成本已知约 12 个分派点）。

---

## 6. PuPu 前端改动

### 6.1 设置 UI 组件结构

扩展 `src/COMPONENTs/settings/model_providers/index.js:243-262`，三个内置节之后追加：

```
CustomProvidersSection                目录: settings/model_providers/custom-providers/
├── index.js                — SettingsSection 外壳 + 列表 + [从预设添加][手动添加][导入] 三入口
├── preset_picker.js        — PresetPicker：内置预设卡片（SAP Hyperspace，"Official" badge），
│                             选中 → 走 §8.3 同一导入流水线（source:"preset"）
├── custom_provider_list.js — 行：display_name · 协议徽标 · base_url（非本地 http 带"明文传输"徽标）
│                             · 模型数 · 密钥状态点(hasCustomProviderSecret) · enabled 开关
│                             · [编辑][导出][删除(确认模态，文案提醒"历史会话续跑将失效")]
├── custom_provider_editor.js — 模态（仿 custom_mcp_page.js 分区）：
│                             IDENTITY: id(创建后只读)/display_name/notes
│                             CONNECTION: protocol 分段按钮(anthropic|openai-responses|ollama)
│                               / base_url / timeout_seconds / extra_headers 键值行编辑器
│                             AUTH: mode 分段按钮 + header_name(条件显示) + key_label/hint 展示
│                               + APIKeyInput（namespace 版，读写 secret map）
│                             MODELS: 行编辑器(id/display_name/capabilities/default_payload)
│                             FOOTER: [测试连接](§6.5) · 校验错误行 · [保存]
└── custom_provider_import_modal.js — 导入模态（§8.3）
```

inline style + `isDark`；外壳/背景色用 `var(--pupu-background|sidebar|surface)`（shell_background_guard）；`model_providers.custom.*` i18n 命名空间，11 个 locale 同步。

### 6.2 payload 注入（`src/SERVICEs/api.unchain.js`）

| 位置 | 改动 |
|---|---|
| `parseProviderFromModelValue` L56-69 / `detectProviderFromStreamPayload` L71-106 | 放行 `custom.*` 前缀（查得到定义才返回，否则 ""） |
| 新 `injectCustomProviderIntoPayload(payload)` | `custom.*` 前缀时：(a) 定义不存在 → **throw** `custom_provider_not_found`（发送前阻断）；(b) `enabled===false` → throw `custom_provider_disabled`；(c) 需 key 而无 secret → throw `custom_provider_missing_api_key`（UI 捕获 → 打开编辑器聚焦 APIKeyInput，仿 mcp_install entryOpensSetup）；(d) 通过 → `options.custom_provider = 白名单净化定义（无 enabled/时间戳/密钥）`，`options.custom_provider_api_key`（+`customProviderApiKey`）= secret 值（**专名字段，决策 A8**） |
| `normalizeUnchainV2Payload` L521-528 | 链尾追加该环节 |
| `SUPPORTED_REMOTE_PROVIDERS` L17 / `injectProviderApiKeyIntoPayload` L129 | **不动**——custom 前缀解析为 "" 天然跳过，内置官方 key 永不注入 custom 请求（安全性质，测试钉住） |
| `getModelCatalog` L564-585 | normalize 后追加 `mergeCustomProvidersIntoCatalog(catalog)`（§6.4） |
| 新 facade `testCustomProvider(definition, apiKey)` | withTimeout 20s，走新 IPC（§6.5） |

### 6.3 model picker 合并

- `build_model_options.js`：硬编码三组之后，遍历 enabled 且（mode==="none" 或已配 secret）的自定义 provider，各生成一组（组名带 Custom 徽标；`default_model` 排首位）。
- `constants.js:8-18` `MODEL_PROVIDER_PREFIXES`：静态 map + `custom.*` 动态前缀，折叠状态 key 用完整 providerKey。
- `use_chat_input_models.js:24-30`：扩展配置状态；`model_catalog_refresh` 订阅已有。
- `chat.js:56-60` `PROVIDER_ICON`：通用 fallback 图标（server/plug 类 glyph）。hero chips v1 不加。

### 6.4 前端目录合并

`mergeCustomProvidersIntoCatalog(catalog)`：`catalog.providers["custom.<slug>"]` + `catalog.modelCapabilities["custom.<slug>:<id>"] =` 由 m.capabilities 映射为 `defaultModelInputCapabilities()` 同形状对象——保证 chat.js L257-279 能力门控与 `modelSupportsTools` 正确（supports_tools=false 时前端隐藏工具选择器）。

### 6.5 测试连接链路（唯一的 Electron 改动）

React → `api.unchain.testCustomProvider` → SERVICEs bridge → preload `ipcRenderer.invoke` → shared 常量 `UNCHAIN.TEST_CUSTOM_PROVIDER` → main handler → `service.js` 新方法（照 `installMisoMcpToolkit` L710-737 模式 POST Flask `/models/custom-providers/test`）。请求体含一次性 api_key，Electron 层**禁止**打印该请求 body；Electron 测试 `.js`/`.cjs` 双版本同步（项目 pitfall）。聊天主链路 Electron 零改动。

---

## 7. PuPu adapter / Flask 侧改动（unchain_runtime/server/）

### 7.1 解析与校验

```python
@dataclass(frozen=True)
class CustomProviderConfig:
    slug: str; provider_key: str; display_name: str
    protocol: str            # "anthropic" | "openai-responses" | "ollama"
    base_url: str
    auth_mode: str           # "x-api-key" | "bearer" | "header" | "none"
    auth_header_name: str | None
    extra_headers: tuple[tuple[str, str], ...]
    timeout_seconds: int
    models: dict[str, dict]  # model_id -> {capabilities, default_payload}

def _parse_custom_provider(options) -> CustomProviderConfig | None:
    """无 custom_provider → None；有但非法 → raise CustomProviderError（绝不静默忽略）。
    重实现 §2.3 全部校验，不信任前端。key 从 options.custom_provider_api_key /
    customProviderApiKey 专名字段读取（决策 A8）。"""
```

`CustomProviderError(code, message)` 走现有错误帧通道；message 先过 `_redact_secrets`。

### 7.2 白名单放行（消灭静默回退）

| 位置 | 改动 |
|---|---|
| `_parse_model_overrides` L761/768/778 | modelId 前缀 == cfg.provider_key（`custom.<slug>`）→ 返回 `(孪生名, model 原样)`；前缀以 `custom.` 开头但无/不匹配 cfg → **raise** `custom_provider_not_found`（消灭 L761→L791→ollama 静默回退链）。model 段不过 `_normalize_provider_model_name`（孪生名 hyperspace 天然跳过，openai 协议无该归一化） |
| `_get_runtime_config` L791/794/800 | cfg 存在且 override == 孪生名 → 接受（"hyperspace" 不在现白名单内，需 cfg 门控放行）；env `UNCHAIN_PROVIDER` 路径不放行（env 全局共享，禁承载 per-request 配置） |
| `_resolve_agent_api_key` L3143 | cfg 存在、`auth_mode != "none"`、key 空 → raise `custom_provider_missing_api_key`（纵深，前端已拦一道） |
| `_model_is_available_for_provider` L871-876 | cfg 存在 → 查 `model in cfg.models`；不在 → raise `custom_provider_model_not_declared`（保证 capability 注入正确性） |
| `_provider_default_model` L724-729 | cfg 存在 → `default_model` 或声明列表第一个 |
| `_GENERAL_MODEL_BY_PROVIDER` L267-269/L883-884 | custom 不降级（保持所选模型） |
| `get_max_context_window_tokens` L1162-1176 | cfg 存在 → 读该模型 `max_context_window_tokens`（normalizer 保证有值，默认 32768），**永不为 0** |
| `_normalize_provider_model_name` L740-743 | 不改（custom key 天然跳过 4.5→4-5 改写，单测钉住） |

### 7.3 Agent 构造（核心 factory）

`_create_agent` L4497+ 解析 cfg → `_make_custom_model_io_factory(cfg, api_key)` → `_build_developer_agent` 签名加 `model_io_factory=None` → `UnchainAgent(..., model_io_factory=factory)`（None 时行为不变）。

```python
_TWIN_BY_PROTOCOL = {"anthropic": "hyperspace", "openai-responses": "openai", "ollama": "ollama"}

def _make_custom_model_io_factory(cfg, api_key):
    twin = _TWIN_BY_PROTOCOL[cfg.protocol]
    def factory(spec, call_context):
        if spec.provider != twin or spec.model not in cfg.models:
            if spec.provider == twin:
                # 同孪生名但模型未在配置声明：custom 会话内不猜测端点，明确报错（v1 限制，文档化）
                raise CustomProviderError("custom_provider_model_not_declared", spec.model)
            # 子代理/模板用其他内置 provider → 回落默认装配，用 spec 自己的 key（custom key 不填充）
            return ModelIOFactoryRegistry().create(
                provider=spec.provider, model=spec.model, api_key=spec.api_key)
        entry = cfg.models[spec.model]
        caps = {spec.model: {..., "provider_model": spec.model,      # 精确命中，绕开模糊匹配
                "allowed_payload_keys": _PROTOCOL_ALLOWED_PAYLOAD_KEYS[cfg.protocol]}}
        payloads = {spec.model: dict(entry.get("default_payload") or {})}
        headers = dict(cfg.extra_headers)
        if cfg.auth_mode == "header":
            headers[cfg.auth_header_name] = api_key                  # 只进 client，不进日志/配置
        if cfg.protocol == "anthropic":
            io = HyperspaceModelIO(model=spec.model, api_key=api_key or "not-needed",
                base_url=cfg.base_url,
                client_factory=<闭包: anthropic.Anthropic(base_url, default_headers,
                    x-api-key→api_key / bearer→auth_token, timeout=cfg.timeout_seconds)>,
                model_capabilities=caps, default_payloads=payloads)
        elif cfg.protocol == "openai-responses":
            io = OpenAIModelIO(model=spec.model, api_key=api_key or "not-needed",
                client_factory=<闭包: OpenAI(base_url, default_headers, bearer→api_key)>,
                model_capabilities=caps, default_payloads=payloads)
        else:  # ollama
            io = OllamaModelIO(model=spec.model, base_url=cfg.base_url,
                model_capabilities=caps, default_payloads=payloads)
        return io   # io.provider 类属性即孪生名，durable resume 天然一致，无 hack
    return factory
```

要点：
- **capability/default_payload/allowed_payload_keys 强制注入** → 精确命中 `_resolve_model_key`（native.py:311-329），绕开两个坑：`_merged_payload`（native.py:344-364）对无条目模型**静默丢弃全部用户 payload**（temperature/thinking 悄悄失效、Anthropic 固定 4096 max_tokens）、startswith 模糊匹配误命中（`gpt-5-xxx` 误继承静态 `gpt-5` 条目）。
- factory 经 `clone()` 传播；**显式构造子代理的路径必须穿透**：`_materialize_recipe_subagents` L4408-4422、`subagent_loader.load_templates` L4430-4447、recipe graph L4965-4995 的 `UnchainAgent(...)` 都追加 `model_io_factory=factory`（factory 自带内置回落，openai/anthropic 模板子代理不受影响、用**它们自己的** key 走官方装配）。
- 内置回落分支若 spec 无 key 且请求也没带对应官方 key → registry 自然报错——**custom key 绝不填充给内置装配**。

### 7.4 payload 参数名

`_build_payload` L2402-2419：签名扩为 `(provider, options)`，cfg 存在按 `cfg.protocol` 分支（anthropic → `max_tokens`；openai-responses → `max_output_tokens`；ollama → `num_predict`），否则维持现状。不改则 anthropic 协议自定义 provider 拿到 ollama 的 `num_predict`。

### 7.5 stream_started 回显

`route_chat.py:517`（v2）及 v4 同构点（L643/L726）：`stream_started` 帧 model 字段回显 `options.modelId` 原值（`custom.<slug>:<model>`）——否则 use_chat_stream.js:3561 会用裸 model 名覆写 UI 模型芯片。加"stream_started 不覆写"断言测试（前端不改）。

### 7.6 测试连接端点

新 `route_providers.py`：`POST /models/custom-providers/test`，body `{custom_provider, api_key}`（一次性，不落盘）→ `_parse_custom_provider` 校验 → §7.3 同一 factory 构造 client → 最小请求（anthropic: `messages.create(max_tokens=1)`；openai-responses / ollama 等价最小请求），硬超时 15s。错误映射：`provider_unreachable` / `provider_timeout` / `provider_auth_failed`(401/403) / `provider_bad_response`(404 等，**Responses API 不兼容在此暴露**)。message 过 `_redact_secrets`。

### 7.7 明确排除项（文档化产品限制）

- **memory 摘要**：custom key 落 L3046-3079 else 分支天然 no-op——安全特性（防 key 发官方端点），设置页 memory 区提示文案说明；加回归测试防未来有人按 protocol 改分支（FM16）。
- **memory embedding**：自定义 provider 不做 embedding（v2 议题）。
- **web_fetch extract-model**：`web_fetch.py:587` 自建 registry，不把自定义模型暴露给该配置；实现时审计其 key 来源（R6）。
- **catalog / SSE 链路 / Electron 聊天主链路**：零改动。

---

## 8. 导入 / 导出 / 预设

### 8.1 导出 UX

provider 行 [导出] → `buildProviderExportPayload(slug)` → Electron `showSaveDialog` + writeFile（照 chat_export.js:85-111），web dev 回退 Blob 下载；文件名 `pupu-provider-<slug>.json`；toast 提示"导出文件不含你的 API key，可安全分享"。

### 8.2 导出构造规则（防泄密核心）

**只允许白名单构造**，禁止「拷贝整对象再 delete」——`enabled/source/时间戳`不在白名单内，secret 在另一个 store 根本不可达。CI 断言：写入 secret 后导出物 stringify 不含 secret 值、不含 `api_key`/`apiKey` 子串（**该测试放最早切片并进 CI**）。红线条款：任何"debug 导出全部设置"类功能禁止包含 model_providers namespace。

### 8.3 导入 UX（Validate / Import 两步）

1. **来源**：粘贴 JSON / 选文件 / 拖拽（chat_export.js FileReader 模式）；预设通道复用同一流水线（跳过文件读取，source:"preset"）。
2. **Validate**（纯前端）：字节上限 → JSON.parse → format/format_version 校验 → `normalizeCustomProvider` 全量语义校验（§2.3）。失败 → 诊断列表 `{code, path, message, severity}`；成功 → **审查卡片**：display_name、协议、**base_url 高亮全文**、认证方式、header 列表、模型清单、notes、warning 汇总，附固定提示："这是第三方配置。启用后，你为它填写的 API key 将被发送到上面显示的地址。请确认你信任该地址。"
3. **Import**：`id` 已存在 → 冲突三选项：
   - **[覆盖更新]**：`base_url`/`auth`/`extra_headers` 任一与既有不同 → 展示 old→new diff + **强制 `enabled:false` + 清空既有 secret 待重填**（防"分享更新版换 base_url 收割旧 key"）；三者全同（纯模型列表/文案更新，`metadata.revision` 提示新旧）→ 保留 secret 与 enabled。
   - **[重命名导入]**：自动追加 `-2` 后缀，提示新 id（历史会话旧模型选择不受影响）。
   - **[取消]**。
   - 新写入一律 `enabled:false`、secret 为空。
4. **导入后引导 + 自动启用**：需 key → 自动打开编辑器聚焦 APIKeyInput（展示 key_label/key_hint）；**required secret 保存成功 → 自动 `enabled:true` + toast**（消灭"忘了打开开关，模型死活不出现"）；建议点 [测试连接]，测试失败不阻断（本地代理可能未启动），只显示状态。

### 8.4 预设（PresetPicker）

内置 `custom_provider_presets.json`（首发只收 SAP Hyperspace），设置区 [从预设添加] 展示卡片（Official badge + description + key_hint）。预设即格式的活文档；未来预设库/商店沿 format v1 信封演进。SAP 用户零到聊天路径：预设卡片 → 填 key（自动启用）→ 选模型 → 聊天，约 4 步。

---

## 9. 安全设计

1. **secret 物理隔离**：key 值唯一存放地 `custom_provider_secrets`；定义数组、导出物、导入物、`options.custom_provider` 四处结构上无密钥字段。传输仅经专名字段 `options.custom_provider_api_key`（localhost IPC→HTTP，带 x-unchain-auth，与现状 openai key 注入同级）。
2. **key 互不串用**（测试钉死的性质族）：内置官方 key 永不注入 custom 请求（`injectProviderApiKeyIntoPayload` 对 custom 前缀天然跳过）；custom key 永不进入任何官方端点 client 构造（fail-closed 结构 + factory 回落分支不填充 key + FM16 回归测试，显式覆盖 memory 摘要、降级映射、web_fetch 路径）。
3. **导出剥离** = 白名单构造式（§8.2）+ 导入侧任意层级 secret 形字段防呆剥离（双保险）。
4. **日志红线**：Flask 新增 `_redact_secrets(obj)`（key 名匹配 `/(api[_-]?key|authorization|x-api-key|token|secret)/i` → `"***"`），任何 logger 打印 options/custom_provider/测试请求体前必须过之，SDK 异常 message 上抛前同样过滤；Electron 不新增 payload 级日志；前端禁止 console.log 注入后 payload；单测断言 key 值不出现在 redact 输出。
5. **恶意分享配置威胁模型**：base_url 钓 key → 审查卡片高亮 + 独立 key 槽（拿不到官方 key）+ 默认 disabled + 覆盖导入强制重验（§8.3）；视觉仿冒 → 保留字名单 + Custom 徽标 + base_url 常驻展示；原型污染/超深 JSON → 白名单拷贝 + forbidden_key + 256KB 上限；明文 http 远端 → 警告 + 常驻徽标（localhost 放行，对齐 custom MCP 先例）。
6. **服务端重校验**：前端校验只做门控，adapter 全量重验，不信任 renderer。
7. **已实施更新**（原"已知限制"）：secret 已随 App Settings→SQLite 迁移，改存
   `settings.db` `provider_credentials` 表、经 `safeStorage` 加密（与 openai/anthropic key 同级），
   不再是 localStorage 明文。legacy 明文 localStorage 副本 dual-keep 只读保留，删除是独立 N+1 变更（见顶部勘误）。

---

## 10. 失败模式全表（穷举 → 防御索引）

| # | 失败模式 | 防御 |
|---|---|---|
| FM1 | 畸形/恶意 JSON 导入 | §2.3 校验 + §8.3 Validate + 原型污染防御 |
| FM2 | slug 与内置撞名/仿冒 | `custom.` 前缀结构隔离 + 保留字名单 + Custom 徽标 |
| FM3 | 模型 ID 含冒号 | 两侧 split(":",1) 语义 + roundtrip 测试 |
| FM4 | base_url 不可达/超时 | 测试连接端点 + timeout clamp + 错误码映射；不自动重试 |
| FM5 | 非 https 远端 | 警告不阻断 + 常驻徽标 |
| FM6 | 导出泄密 | 白名单构造 + 物理分离 + CI 断言（最早切片） |
| FM7 | 日志泄密 | 三层 redact 红线 + 专名 key 字段确定靶点 |
| FM8 | streaming 中途断开 | 复用现有 SSE 错误/取消路径（provider 无关，已核实） |
| FM9 | 无 capability 条目模型进工具路径 | capability 强制注入精确命中；supports_tools=false 前端隐藏工具选择器 |
| FM10 | schema 演进 | config_version 升级链 + 宽进严出 + 高版本硬拒 |
| FM11 | 后端静默换模（现状行为） | 全链硬错误（§7.2）+ 前端发送前预检 |
| FM12 | durable resume 不匹配 | io.provider=provider_key；id 不可变；删除确认提醒续跑失效 |
| FM13 | 子代理/recipe 构造炸 | factory 穿透三条显式构造路径 + 内置回落 |
| FM14 | web_fetch extract-model | 不暴露 + key 来源审计 |
| FM15 | 配置被删后旧会话 modelId 悬空 | 读取兜底 + 发送前 throw → toast 引导重选；不崩不换模 |
| FM16 | memory 摘要把 custom key 发官方端点 | custom key 天然 no-op + 回归测试钉死 |
| FM17 | env 全局配置串会话 | 一切走 per-request options；env 路径不放行 custom |
| FM18 | openai-responses 端点只有 chat/completions | 协议名明示 + 编辑器说明 + 测试连接暴露 404 |
| FM19 | 孪生名撞真 hyperspace（custom 会话内 provider="hyperspace" 的子代理模板） | factory 按声明模型路由：在配置内→custom 端点；不在→明确 raise（v1 限制，文档化） |
| FM20 | 导入"更新版"换 base_url 收割旧 key | 覆盖导入强制 diff + disabled + 清 secret 重验（§8.3） |

---

## 11. 分阶段落地（每片独立交付/验收）

| 切片 | 内容 | 验收 |
|---|---|---|
| **S1 unchain 修复** | §5.1 observation.py 一行修复 + 单测 | unchain 测试套通过（不再是阻塞依赖） |
| **S2 Flask 后端** | §7.1-7.6 全部 + §5.2 探测 + `_redact_secrets` + pytest | curl 直打 Flask + `hai proxy start` 完成流式对话与工具调用；畸形配置返回结构化错误而非静默换模 |
| **S3 前端 store + 注入 + 选择器** | custom_provider_store.js + schema 文件 + 注入/目录合并 + 动态组 + Jest（含导出防泄密 CI 断言） | 手工经 helper 写入定义与 key → 选择器出组 → 端到端聊天；双冒号 roundtrip |
| **S4 设置 UI + 测试连接** | §6.1 组件树 + APIKeyInput namespace 版 + §6.5 IPC 全链（.js/.cjs 同步）+ 11 locale | 纯 UI 完成增删改、填 key、测试连接、自动启用 |
| **S5 导入/导出/预设** | §8 全部（含冲突三选项、强制重验、PresetPicker + Hyperspace 预设） | 导出→删除→导入→补 key→聊天全流程；预设 4 步通路 |
| **S6 收尾** | fallback 图标、文案打磨、docs（api-reference 新 IPC/端点、data-models 存储形状）、init-setup 向导（可选） | 文档齐全；`detect_changes()` 核对影响面 |

依赖：S1 ⟂ S3/S4 可并行；S2 依赖 S1；S5 依赖 S3+S4。每片提交前按仓库规约跑 GitNexus `impact` / `detect_changes()`。

## 12. 风险清单（Top）

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | openai-responses 兼容面窄（多数网关只有 chat/completions） | 高 | 主打 anthropic 协议；协议名明示；测试连接暴露；v2 unchain 增 ChatCompletions ModelIO 后开放 `openai-chat` 枚举 |
| R2 | 恶意分享配置骗 key | 高 | §9.5 全套 + FM20 覆盖导入强制重验 |
| R3 | capability 键名与 unchain 资源文件不符 → payload 静默丢弃 | 中高 | 以 model_capabilities.json hyperspace 条目为模板逐键核对；S2 验收含"temperature/max_tokens 实际生效"检查 |
| R4 | openai-responses 协议的孪生名 "openai" 是 fail-open 面（memory 摘要/降级/env key 回退） | 中高 | cfg 门控逐点补丁（§7.2/§7.7）+ FM16 测试族钉死；旗舰 anthropic 协议经 hyperspace 孪生结构性免疫 |
| R5 | settings schema 变更（CTO-gated） | 中 | 纯增量两个 key；normalize-on-read 容错；评审材料即本文 §3 |
| R6 | 白名单放行误伤内置路径 | 中 | 所有改动以 `cfg is not None` 前置，内置路径字节级不变；三家回归 pytest；`detect_changes({scope:"compare", base_ref:"main"})` |
| R7 | key 明文 localStorage（面扩大） | 中 | 与现状同级，明确接受；keychain 迁移独立议题 |
| R8 | 本地代理未启动的报错可读性 | 低中 | `provider_unreachable` 文案含 base_url + notes/key_hint 提示 |

## 13. 测试清单（关键断言）

- **Jest**：normalize 宽进严出（未知字段 warning+strip / auth 内硬错）；`__proto__`、保留字、header 走私、secret 形字段剥离；升级链；冷启动空值；导出防泄密（stringify 无 secret 值/无 api_key 子串，进 CI）；注入（双冒号 roundtrip、缺 key throw、custom_provider 无密钥字段、专名 key 字段）；build_model_options 门控。
- **pytest**：`_parse_custom_provider` 校验矩阵；factory（client_factory 收到 base_url/headers、`io.provider == 孪生名`、模型未声明 raise、内置回落分支不带 custom key）；`_build_payload` 协议分支；静默回退消灭（custom 前缀无 cfg → raise 而非 ollama）；**key 互不串用性质族**（FM16 + web_fetch + 降级 + env 回退路径，重点覆盖 openai 孪生）；`_redact_secrets`；stream_started 回显 modelId；孪生 hyperspace 跳过 4.5→4-5 归一化。
- **unchain S1 内**：observation payload hyperspace 分支单测。
- **Electron**：新 IPC handler `.js`/`.cjs` 双版本。
- **端到端**：Hyperspace 预设 → 补 key → 测试连接 → 流式对话 → 工具调用 → 中断取消 → 导出再导入全流程（test-api / 手动）。

## 14. 评审记录

三份独立设计（最小改动 / 产品优先 / 健壮安全优先）在核心架构上自发收敛：配置-密钥物理分离、options 每请求透传、model_io_factory 闭包、前端 catalog 合并、白名单构造式导出。三视角评审总分 20/20/23，健壮安全稿胜出为骨架；主要嫁接：专名 key 传输字段与集中脱敏（安全评审）、fail-closed 回退封堵与模型声明校验（安全稿原生）、PresetPicker/自动启用/宽进严出/key_hint/metadata.revision/ollama 协议（产品评审自产品稿）、版本探测硬禁用替代 getattr 降级（产品评审）、覆盖导入强制重验（两评审共识，堵 FM20）、双仓零信任的测试钉死清单（架构评审自最小稿）。被否决的路线：value_from_secret 前端展开（in-band 泄密）、裸 slug 命名空间（撞名）。

**2026-07-15 实施前修正**：评审胜出的「fail-closed 裸自定义名」路线（spec.provider=`custom.<slug>`）在实施勘察中被证伪——kernel `validate_provider` 硬白名单直接拒绝未知名，且全库约 12 处按 provider 名分派线上行为（多数来自当日合入的 durable 运行时），逐点插解析等于中型 kernel 改造。最终采用**协议孪生映射**（§1.1）：借 unchain 既有的 hyperspace 一等公民身份获得 anthropic 协议的结构性 fail-closed，openai-responses 协议退守枚举补丁 + 测试钉死。这恰是架构评审当初对该设计"长尾未证伪"警告的应验；教训已计入：涉及 kernel 分派面的设计决策，必须先跑一遍全库分派点枚举再定案。
