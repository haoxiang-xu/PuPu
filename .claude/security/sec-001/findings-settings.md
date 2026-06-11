# SEC-INVESTIGATION-001 — findings-settings（dev-settings 自查）

调查者：pupu-dev-settings
区域：`src/COMPONENTs/settings/`、`init-setup/`、`workspace/`、`memory-inspect/` + `settings` localStorage 读写链路
主责边界：**秘密链路起点**（settings 存 key → payload 带 → electron 转发 → Flask 用）
说明：本节为只读调查，未改任何代码。severity 为初判，待守统一复核。

---

## 清单逐项

### 1. API key 存储 posture（"谁能读"）

```
[H] [verified] [boundary ③→①]
src/COMPONENTs/settings/model_providers/storage.js:1-18 —— provider API key 明文存 localStorage.settings.model_providers，无加密/无 OS keychain
exploit 场景：openai_api_key / anthropic_api_key 以明文写入 localStorage 的 settings 对象。renderer 要渲染边界③的不可信内容（模型/MCP 输出经 markdown sink，见清单3 头号热点 sanitize_html 默认 false）。任何能在 renderer 跑代码的注入（XSS / 被污染依赖 / 任意 bridge 透传）都能 JSON.parse(localStorage.getItem("settings")).model_providers.openai_api_key 直接读出全部明文密钥并外联。key 的安全 = renderer 里所有能跑代码的最弱者。
mitigation：key 移出 renderer 可读的 localStorage，改由 main 进程经 OS keychain（safeStorage / keytar）保管，renderer 只持句柄；payload 注入下沉到 main/Flask（见接缝）。跨边界+跨多区域的架构改动 → 必须报 CTO 触发同步会（settings schema + 秘密链路）。短期缓解：把 markdown sanitize_html 默认翻成 true（清单3 owns），收窄 renderer 注入面。
```

### 2. key 进日志 / 错误 / SSE / toast 的泄漏

```
[—] 已查无 finding（territory 内）
settings/**、init-setup/**、workspace/**、memory-inspect/** 全量 grep console.*/logger/JSON.stringify(key) —— 0 命中。
api_key_input.js:36 toast 仅输出 `${label} saved`（label = "OpenAI"/"Anthropic"），不含 key 值。
storage_key_row.js（local_storage 面板）仅渲染 key 名与字节大小，不渲染 value——不泄漏密钥内容。good。
注：key 真正进 payload/帧/Flask 日志的风险在 api.unchain.js（chat-core/electron territory）与 Flask（守清单7 #5），见接缝。
```

### 3. workspace 根路径可设任意路径

```
[M] [verified] [boundary ②③]
src/COMPONENTs/settings/runtime.js:34-47 + workspace_editor.js:99-118 —— workspace root 接受任意用户输入字符串（/、~、../..），保存即成为 filesystem 工具 / Flask 文件端点的授权根
exploit 场景：用户（或被社工诱导）把 workspace root 设成 / 或 ~，随后被投毒的 filesystem MCP server / Flask 文件端点把整机当授权范围读写。settings 编辑器对宽根无任何风险提示，存的就是授权边界。
降级理由：../ 逃逸的实际遏制在服务端（Flask adapter_workspace_tools，守清单7 #3）；本 finding 是"授权根设定面无 breadth 警告"，不是路径遍历本体——故 M 不是 H。
mitigation：① 保存宽根（/、~、$HOME、盘符根）时弹明确二次确认+危险提示；② 与守/Flask 对齐，确认服务端对 root 本身也做最小权限校验（不能信任 renderer 传来的 root 已安全）。

[L] [verified] [boundary 本地]
src/COMPONENTs/settings/runtime.js:75-83 —— validateWorkspaceRoot 在 bridge 不可用时 fail-open（返回 valid:true）
exploit 场景：web-only / bridge 缺失时 settings 编辑器的 root 校验直接放行任意路径。仅本地、需 bridge 缺失才触发，面小。
mitigation：fail-closed 或显式标注"未校验"；与 init-setup/steps/workspace.js:52-56 的 fail-closed 行为对齐（两处行为不一致）。
```

### 4. init 向导危险默认

```
[—] 已查无 finding（无危险默认）
init-setup/steps/workspace.js:140-142 文案诚实告警（"PuPu can create and delete files here. Choose a folder you have full access to."）；canContinue 仅在后端校验 valid:true 时为真（比 settings 编辑器更严，fail-closed）。
configure_providers.js:81-86 —— init 向导存 key 走 writeModelProviders（与主设置同一存储模块），不向任何外部端点发 key 做"校验"（仅本地保存）。无"向导阶段把 key 发给非预期端点"问题。
auto-approve / 宽 workspace / 跳过 key 校验等危险默认 —— 向导未预置任何一项为 on。good。
观察（非 finding）：workspace 步有"Skip for now"可整步跳过——属产品选择，跳过=不设 workspace，更保守，不构成安全降级。
```

### 5. memory / dev 子模块后门开关

```
[—] 已查无 finding（dev 后门有纵深防御，gated 充分）
dev/storage.js:21-31 isDevSettingsAvailable —— 双重 gate：NODE_ENV==="development" && window.runtime.isElectron===true。
settings_modal_content.js:68-70 —— dev tab 仅在 isDevSettingsAvailable() 为真才 push 进设置页列表（打包构建里整个 dev 面板不挂载）。
main 进程二次兜底：services/runtime/service.js:140-145 setChromeTerminalOpen 在 app.isPackaged 时直接返回 {ok:false, error:"dev_only"}，syncBuildFeatureFlagsSnapshot 同样 isPackaged 拒绝。
即：chrome_terminal（openDevTools detach）这个调试后门即便 settings.dev.chrome_terminal_enabled 被内容置 true，生产构建里 UI 不挂载+main 拒绝执行——内容无法在生产打开它。纵深防御到位。

[L] [verified] [boundary ③→本地]
src/CONTAINERs/config/container.js:295-308（territory 邻接，记录）—— 启动时若 isDevSettingsAvailable() 且 settings.dev.chrome_terminal_enabled===true 则自动 openDevTools
exploit：仅 dev 构建生效（同被 NODE_ENV gate），生产无效。记录以便守拼全链知晓"settings.dev 标志能驱动 DevTools 自动打开"这条边（生产已被 isPackaged 挡死）。
mitigation：无需改；确认 main 侧 isPackaged 兜底是真相源即可。
```

### 6. localStorage 写入纪律

```
[M] [verified] [boundary —，跨面契约/discipline]
settings 单对象被 6+ 模块各自 read-modify-write，无 SERVICEs 统一 helper：
  - settings/runtime.js:34-47,62-69
  - settings/memory/storage.js:30-36,129-134
  - settings/model_providers/storage.js:10-18
  - settings/dev/storage.js:42-56
  - init-setup/init_setup_storage.js:19-27
  - init-setup/steps/workspace.js:20-26 （**最差**：连 feature 存储模块都不复用，组件内联自写 settings.runtime.workspace_root）
exploit 场景：非安全注入面，是 discipline/正确性洞——(a) 多模块对同一 settings blob 并发 read-modify-write 存在 lost-update（一个面写 model_providers 时覆盖另一面刚写的 memory）；(b) 无单一脱敏/校验/迁移点，未来给 key 加密或加 schema 校验时无处统一拦截，正是 finding #1 难以收口的根因。
CLAUDE.md 硬规则："localStorage 写入必须走 SERVICEs 专用 helper，不得组件直写"——workspace.js:20-26 组件直写违规；其余虽抽进 storage 模块，但模块在 COMPONENTs 而非 SERVICEs，且各自为政。
mitigation：把 settings 读写收敛到单个 SERVICEs facade（统一 parse/序列化/校验/未来脱敏点）。settings schema 是 CTO-gated 共享动脉 → 报 CTO 触发同步会，不可私改。短期：至少让 init-setup/steps/workspace.js 复用 settings/runtime.js 的 writeWorkspaceRoot。
```

---

## 清单外暗角

```
[L] [verified] [boundary —]
init-setup/steps/workspace.js vs settings/runtime.js —— workspace root 校验行为不一致：
init 步 bridge 缺失 → invalid（fail-closed，安全）；settings 编辑器 bridge 缺失 → valid:true（fail-open）。
同一授权根设定，两个入口安全姿态相反。攻击者会挑 fail-open 的那个。建议统一为 fail-closed。

[note 非跨边界]
api.unchain.js:129-173 injectProviderApiKeyIntoPayload —— key 从 settings 读出后注入 payload.options.{apiKey,api_key,openai_api_key,...} 多别名字段。
这是秘密链路从 settings 跨到 payload 的接缝点（属 chat-core/electron territory，非我地盘），记录供守拼接缝 B：key 一旦进 payload，就经 IPC→main→Flask 全程流动，期间任一日志/帧打印 payload.options 即泄漏。守清单7 #5 需验证 Flask 不打印 options.api_key。
```

---

## 我学到的隐患

1. **秘密的安全 = 它最弱的读取者**。把 api_key 存进 renderer 的 localStorage，等于把它的机密性绑定到 renderer 里所有能跑的代码——而 renderer 的本职就是渲染边界③的不可信内容（markdown sanitize_html 还默认 false）。存储格式（明文/加密）是次要的，"谁能读到它"才是主轴。真正的修复是把 key 移出 renderer 地址空间（OS keychain + main 侧注入）。

2. **危险默认值是替用户做的安全决策**，这次 init 向导做对了——workspace 步文案诚实警告、校验 fail-closed、不预置任何 auto-approve/宽 root。对照之下 settings 编辑器同一个 root 设定却 fail-open + 无 breadth 警告，说明"同一能力的两个入口安全姿态可以悄悄分叉"，审查必须按入口而非按功能枚举。

3. **缺少统一 settings facade 不只是代码味道，是安全收口的缺失**。6 个模块各自 read-modify-write 同一 blob，意味着将来想给 key 加密、加 schema 校验、加脱敏，没有任何一处能统一拦截——这正是 finding #1 难修的结构性原因。统一 facade 是给秘密链路装上唯一闸门的前提。

4. **纵深防御值得记一笔正面样本**：chrome_terminal 调试后门用了 UI gate（NODE_ENV）+ 挂载 gate（isDevSettingsAvailable）+ main 执行 gate（app.isPackaged）三层，即便 localStorage 标志被内容污染，生产也打不开。这是"内容能写标志 ≠ 内容能触发能力"的正确做法，可作其它 dev 开关的模板。

---

## findings 数量统计（severity，初判）

- Critical: 0
- High: 1 （#1 API key 明文存 renderer-readable localStorage）
- Medium: 2 （#3 workspace 宽根无警告 / #6 settings 无统一 facade + 组件直写违规）
- Low: 3 （#3 validate fail-open / #5 dev 标志驱动 DevTools-生产已挡 / 暗角 入口校验不一致）
- 已查无 finding 项：#2 key 日志泄漏（territory 内）、#4 init 危险默认、#5 dev 后门 gating
- note（非跨边界/邻接 territory）：2（api.unchain payload 注入接缝、memory storage 已良好 clamp）

最重要 1-2 条：
- #1 (High)：openai/anthropic api_key 明文存 localStorage.settings.model_providers，对 renderer 全开放。配合清单3 markdown sanitize_html 默认 false，一次间接 prompt 注入即可读出全部密钥外联。这是接缝 B（秘密链路）的源头，修复需跨区域 + CTO 同步会。
- #6 (Medium)：settings 单对象被 6 模块各自直写、无 SERVICEs 统一闸门（init workspace 步甚至组件内联直写违反 CLAUDE.md 硬规则）。这是 #1 无法干净收口的结构性根因，也是 lost-update 正确性隐患。
