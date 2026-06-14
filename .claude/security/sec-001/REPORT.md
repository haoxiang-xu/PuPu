# SEC-INVESTIGATION-001 — 汇总复核与定级报告

**技术主导**：守（pupu-security-expert）
**日期**：2026-06-10
**分支**：codex/runtime-events-v4（所有 file:line 基于当前 HEAD）
**性质**：只读调查 + 统一复核定级。未改任何代码。
**输入**：7 份分区 findings（electron / chat-core / chat-bubble / toolkit / settings / agents / flask）
**复核权**：各 dev 的 severity 为初判，最终裁量权在守。本报告对若干条做了升降级，并把多 dev 指向同一根因的条目合并为根因主条。

---

## 1. 执行摘要

三条信任边界（renderer↔main IPC、main↔Flask 本地 HTTP、app↔第三方 MCP/LLM/character 内容）经 7 区穿透审查，**未发现可被远程未授权方直接触达的 Critical**——归功于两道既有硬防护：Flask 每会话随机 token + 逐路由强制认证、bind 恒 127.0.0.1（校正了清单原以为的"token 默认空"假设）。

但调查暴露了**一个系统性结构缺陷三连**，它们让"renderer 一旦被内容注入"从理论变成高杀伤现实：

1. **渲染层默认不清洗 HTML**（markdown `sanitize_html` 默认 false，3 个落点）—— 把"间接 prompt 注入"升级为"renderer 内容可达执行面"。
2. **renderer 持有无约束的本机能力**（IPC writeFile/readFile 零 root 约束 + provider API key 明文存 localStorage）—— 让被注入的 renderer 能读密钥、读写任意文件。
3. **工具确认门控由被审查对象自声明**（Flask + 前端两侧都不默认拒绝）—— 边界③核心运行时安全网对"已安装但被注入劫持的工具"形同虚设。

这三条叠加构成两条真实跨层杀伤链（见第 4 节接缝 A/B）。**单看每条是 High，组合后接缝 B（秘密链路）真实风险达 Critical**，是本次最需 CTO 仲裁的项。

**最终 severity 分布（复核后，根因合并去重）**：

| Severity | 数量 | 说明 |
|---|---|---|
| **Critical** | 1 | 接缝 B 组合链（秘密链路，单条均 High，组合升级） |
| **High** | 6 | 根因合并后 6 条主 finding |
| **Medium** | 14 | M-1~M-14（狭义跨边界注入/SSRF 9 条 + character 持久化/结构性 5 条） |
| **Low** | 11 | |
| 已查无 finding（正面样板/确认安全） | 14+ | 记录备复核 |

> 复核动作摘要：合并 3 组同根因（markdown 不清洗 ×3→1；avatar/img scheme ×3→1；确认门控自声明 ×2→1）；electron 检1/检2 writeFile/readFile 两段合并为 1 条；chat-bubble markdown 条按 react-showdown createElement 模型**从"RCE 级"修正为"javascript: 链接 + 外联级"**（维持 High，去除 `<script>` RCE 措辞）；接缝 B 组合链**升级 Critical**。

---

## 2. 最终 Finding 表（按复核后 severity 排序，含根因合并）

### CRITICAL

| ID | 标题 | 受影响位点 | 复核说明 |
|---|---|---|---|
| **RC-SEAM-B** | **秘密链路组合：明文 key + auth token 经 avatar URL 泄漏 + renderer 注入面** | 见接缝 B（第 4 节） | 组合升级。三条单 High 组合成"一次内容注入 → 偷 provider key + 偷 Flask token → 全端点驱动 + 密钥外联"。 |

### HIGH（根因合并后 6 条）

| ID | 标题 | 受影响位点（合并） | 复核裁定 |
|---|---|---|---|
| **RC-1** | **markdown 渲染默认不清洗 HTML**（合并 ×3） | 底层 `markdown.js:174,385`；落点① chat-bubble `seamless_markdown.js:320-325,371-380` + `trace_chain.js:909,1507` + `plan_card.js:134` + `generic_artifact_card.js:217`；落点② toolkit `store_toolkit_detail_panel.js:989` + `toolkit_detail_panel.js:668` | **维持 High，修正危害量级**：本仓走 react-showdown `createElement` 而非 `dangerouslySetInnerHTML`，`<script>`/事件属性多半被 React 挡掉——不是 RCE-XSS，是 `javascript:` 链接点击执行 + iframe/img 外联。点击 javascript: 链接即触达全部 `window.*API` + localStorage 密钥 → 维持 High。toolkit README 来自外部 registry，attacker-influenceable 最高。 |
| **RC-2** | **链接 href / img·iframe src 无 scheme 过滤**（与 RC-1 同源） | `markdown.js`/`seamless_markdown.js`/`trace_chain.js` 全链无 href scheme 白名单 | 维持 High。`javascript:`/`file:` href 经 createElement 原样落 DOM，点击即执行/读本地。与 RC-1 同一清洗函数收口。 |
| **RC-3** | **avatar / 内容 img src 无 scheme 白名单**（合并 ×3） | `side_menu.js:57-77`（chat-core，M）；`character_chat_bubble.js:11-24`（chat-bubble，M）；`characters_page.js:17-22`（agents，H）；上游 `chat_storage_sanitize.js:349` 不校验 | **合并升 High**。三 dev 报 M/M/H 不一，合并定 High：character 卡是可分发信任配置，`<img src>` 远程=零点击外联 beacon、`file://`=本地探测、`data:`=潜在 SVG。三 sink 共用一个白名单修复，须三处都加（纵深防御）。 |
| **RC-4** | **工具确认门控由被审查对象自声明，两侧均无默认拒绝**（合并 ×2，接缝顶点） | Flask `confirmation.py:92` + `mcp.py:324`(默认 False) + `unchain_adapter.py:2785-2797`(无 MCP override)=F-FLASK-01；前端 `use_chat_stream.js:2342-2344,2619-2621,2679` + `:1001-1022`(auto-approve 帧自报键可冒名)=F-CC-01/02 | 维持 High。服务端是唯一真相源、当前对 MCP 默认放行——被注入诱导调用未声明 destructiveHint 的工具，确认框完全不弹。前端 auto-approve 又可被 XSS 写 `toolkit_auto_approve` 静默关门控。主修 Flask（默认拒绝+白名单），前端补兜底。报 CTO + llm-expert 同步会。 |
| **RC-5** | **IPC 任意文件读写，零 root 约束**（electron 检1+检2 合并） | main 根因 `runtime/service.js:517-547`；bridge 出口 `unchain_bridge.js:143-146`；经 `register_handlers.js:430-435` 暴露 | 维持 High。被注入 renderer → `readFile("~/.ssh/id_rsa")` / 读 `~/.pupu/mcp_secrets.json` / writeFile 写 LaunchAgent。**修复范本就在同文件** `deleteRuntimeEntry`（basename + 逃逸检查）——疏漏非不会做。 |
| **RC-6** | **provider API key 明文存 renderer-readable localStorage** | `model_providers/storage.js:1-18` | 维持 High（接缝 B 源头）。`JSON.parse(localStorage.settings).model_providers.openai_api_key` 一行读出。key 机密性 = renderer 内最弱代码，而 renderer 本职就是渲染③不可信内容（RC-1 还默认不清洗）。修复需 OS keychain + main 注入。 |

### MEDIUM（14 条）

| ID | 标题 | 位点 | 复核 |
|---|---|---|---|
| M-1 | SSE 帧结构未校验，relay 原样转发 | electron 检6 `service.js:2196-2201` + `stream_client.js:74-120` | High→Medium。relay 是 RC-4 运输带非真相源，门控缺陷已计 RC-4；应做最小结构白名单作纵深防御。 |
| M-2 | clearRuntimeDir/getRuntimeDirSize 任意 dirPath 无 root | `runtime/service.js:448-462,276-305` | 维持。递归删任意目录 + 枚举泄漏。与 RC-5 同类，危害形态不同（删/枚举 vs 读/写）。 |
| M-3 | openRuntimeFolder 接受任意已存在目录 | `runtime/service.js:129-138` | 维持。信息暴露非 RCE。 |
| M-4 | setWindowOpenHandler 对一切 https? 直接 openExternal 无确认 | `main_window.js:302-306` | 维持。内容可达钓鱼。与 RC-2 联动。 |
| M-5 | test-api `/v1/debug/eval` 本地后门 | `test-api/builtin_commands.js:157-204` | 维持 Medium。dev/QA 才开、prod 默认关、触发需同机恶意进程读 port 文件。gate 依赖 NODE_ENV 字符串、上限 RCE。 |
| M-6 | `__pupuTestBridge` gate 依赖 NODE_ENV 无打包硬断言 | `index.js:74-75` + `test_bridge_preload.js:70-74` | 维持。一次构建回归→生产暴露后门。改 `app.isPackaged`。 |
| M-7 | MCP OAuth 出站无 scheme/内网 IP 校验（SSRF） | `mcp_oauth.py:167-211`=F-FLASK-02 | 维持。可打 169.254.169.254/内网。 |
| M-8 | registry/metadata/icon fetch 强制 https 但不挡内网 IP（SSRF） | `mcp_external_registries.py:116-154` / `mcp_store_metadata.py:108-135`=F-FLASK-03 | 维持。与 M-7 共用校验器。 |
| M-9 | filesystem server 安装授整个 workspace 读写无收窄/无提示 | `mcp_install.js:57-65`=toolkit 清单5 | 维持。enforcement 在 Flask，前端缺知情提示。 |
| M-10 | character 导入=持久化 prompt 注入 + self_profile 记忆投毒 | `character_import_export.py:132-133,163-172` | 定 Medium 且**当前休眠**：`importCharacter` 全链路就绪但 agents 面无 UI 调用（grep 无命中）。接线那天升 High——已记入 agent memory 作接线前置硬要求。 |
| M-11 | settings 单对象被 6+ 模块各自直写，无 SERVICEs 统一 facade | settings #6（含 `init-setup/steps/workspace.js:20-26` 组件直写违反 CLAUDE.md 硬规则） | 维持。RC-6 无法干净收口的结构性根因 + lost-update 正确性洞。 |
| M-12 | workspace 根可设任意路径（/、~），无 breadth 警告 | `settings/runtime.js:34-47` + `workspace_editor.js:99-118` | 维持。授权根设定面无危险提示；../ 逃逸遏制在 Flask。 |
| M-13 | MCP registry schema additionalProperties:true + 外部 registry 无签名 | `mcp_toolkit_registry.schema.json` | 维持。转 mcp-store-curator（schema 拥有者）。 |
| M-14 | custom MCP SVG icon 原文存储（渲染若内联则 stored XSS） | `custom_mcp_icon_store.js:70-75`（suspected） | 维持 suspected。取决于 `toolkit_icon.js` 渲染方式——**未闭环，需补读 toolkit_icon.js**。 |

### LOW（11 条，摘要）

| ID | 标题 | 位点 |
|---|---|---|
| L-1 | bridge 不校验入参类型，校验全推 main | preload bridges 全量 |
| L-2 | will-navigate devServerOrigin 在 prod 仍可匹配 localhost:2907 | `main_window.js:309-317` |
| L-3 | VALIDATE_API_KEY 死契约 | `channels.js:85` |
| L-4 | preload channel 白名单未通电 + 清单漂移 | `preload/channels.js` |
| L-5 | toolkit 风险分级 UX：curated 与高危条目卡片观感接近 | `store_toolkit_detail_panel.js:263-284`（转 ux-designer） |
| L-6 | custom MCP 命令前端无白名单（执行点在 Flask） | `mcp_install.js:128-160` |
| L-7 | metadata file-icon 无 mime 白名单（suspected，同 M-14 根） | `mcp_toolkit_store.js:120,175-189` |
| L-8 | settings validateWorkspaceRoot bridge 缺失时 fail-open（与 init 步 fail-closed 不一致） | `settings/runtime.js:75-83` |
| L-9 | dev chrome_terminal 标志驱动 DevTools 自动打开（prod 已被 isPackaged 挡死） | `container.js:295-308` |
| L-10 | auth token 经 query-string 落运行时日志（接缝 B 一环） | `route_auth.py:20-22` + `service.js:478`=F-FLASK-04 |
| L-11 | 流式错误回灌 provider 原始异常 / ~/.pupu 目录权限随 umask / _resolve_path 兜底全靠库 | F-FLASK-05/06/07 |

---

## 3. 根因合并说明

**RC-1 markdown 默认不清洗（合并 chat-bubble 检1 + toolkit F-1）**：单一根因 `markdown.js:174` 默认 false → `:385` 跳过清洗。受影响 chat-bubble 5 处 + toolkit 2 处。**定级修正**：react-showdown `createElement` 而非 dangerouslySetInnerHTML，不是 RCE-XSS 而是 javascript: 链接执行 + iframe/img 外联，维持 High。**接口坑**：sanitizeHtml prop 要的是函数 `(html)=>string` 不是布尔，传 true 会抛错——清洗位从设计就没接对，修复必须传真正清洗函数。

**RC-3 avatar/img scheme（合并 chat-core F-CC-04 + chat-bubble 暗角 + agents 检5）**：三 sink 共用一个白名单修复，character 卡可分发。三 dev 报 M/M/H，**合并定 High**。纵深防御要求三处各自兜底，不信上游。

**RC-4 确认门控自声明（合并 chat-core F-CC-01/02 + flask F-FLASK-01）**：确认与否由工具/帧自声明，两侧无默认拒绝。主修服务端（默认拒绝+白名单），前端补兜底。维持 High——边界③核心控制对被劫持的已装工具失效。

---

## 4. 两条跨层接缝分析

### 接缝 A — 路径双侧校验：两端都不自校验，全靠第三方库

- **electron 侧**：`runtime/service.js:517-547` writeFile/readFile 零 root 约束（RC-5）；clearRuntimeDir/getRuntimeDirSize 同样（M-2）。stream handler workspaceRoot 经 validateWorkspaceRootPath 只校验"存在且是目录"，不限 app 范围。
- **Flask 侧**：route 层对 session_id/path 不自校验（F-FLASK-06），全靠 unchain 库 `_resolve_workspace_path` + qdrant `JsonFileSessionStore._path` 的 `isalnum/-_.` sanitizer。

**组合真实风险 Medium-High**：两端都把路径安全外包（electron→"main 应校验"但没校验；Flask→"库会校验"）。经典"双方互相假设对方已校验"。**RC-5 是可达入口**：被注入 renderer 不经 Flask，直接 `unchainAPI.readFile` 读任意文件，完全绕过 Flask 侧。修复须双侧独立断言，不接受"库会挡"作唯一防线。

### 接缝 B — 秘密链路：明文 key + token 经 avatar URL 泄漏 + 错误回灌（**组合 Critical**）

链条端到端：
1. **源头（RC-6）**：api_key 明文存 `localStorage.settings.model_providers`，renderer 全可读。
2. **进 payload**：`api.unchain.js:129-173` 把 key 注入 `payload.options.{apiKey,api_key,...}` → IPC→main→Flask 全程流动。
3. **token 泄漏（electron 检6 + F-FLASK-04）**：main↔Flask 的 `x-unchain-auth` 会话 token 经 `buildMisoAssetUrl` 拼进 character `avatar.url` query-string（`service.js:473-479,511-515`），返回 renderer 当 `<img src>`；同一 token 又经流式 URL `?unchain_auth=<token>` 落 werkzeug 请求日志。
4. **错误回灌（F-FLASK-05）**：`route_chat.py:98-112` 通用流式错误把 provider 原始异常 `str(stream_error)` 原样进 SSE error frame——若含 key 片段则二次泄漏回 renderer。

**组合真实风险 Critical**：单看每环 High/Low，组合成完整杀伤链——一次内容注入（经 RC-1 javascript: 链接或任意 renderer 注入）→ 读 localStorage 偷 provider key（直接价值可盗刷）；同一注入 → 读任一 character avatar.url 提取 Flask 会话 token → 绕过"token 仅 main 持有"，直接对 `127.0.0.1:<port>` 认证驱动全部 Flask 端点（chat/工具/文件/memory），loopback+token 双防被自己在 electron 段凿穿；F-FLASK-05 提供额外 key 回灌路径。**本次唯一 Critical**。修复需 settings/electron/flask 三区 + CTO 同步会：(a) key 移出 renderer（OS keychain + main 注入）；(b) avatar 不用 query-string token（main 代理字节经 IPC 返回 data/blob，或一次性 avatar-scope 票据）；(c) F-FLASK-05 错误归一化剥离 provider 原始异常。

---

## 5. 报 CTO 仲裁的 HIGH/CRITICAL 清单（带建议处置）

| ID | Severity | 建议处置 | 理由 / 同步会需求 |
|---|---|---|---|
| **RC-SEAM-B** | **Critical** | **修（必修，跨区同步会）** | 秘密链路组合链。三区联动：settings 下沉 key OS keychain、electron 改 avatar token 传递、flask 错误归一化。**唯一 Critical，本次最高优先级 ADR。** |
| **RC-4** | High | **修（同步会：llm-expert + CTO）** | 边界③核心运行时安全网，当前对 MCP 默认放行。主修 Flask（默认拒绝+白名单），前端补兜底。涉确认 UX 摩擦（欠 ux-designer 风险分级契约）。 |
| **RC-5** | High | **修（quick win，dev-electron）** | 同文件 deleteRuntimeEntry 已有范本，照搬即可。低风险高收益。 |
| **RC-6** | High | **修（架构，settings + CTO）或缓解后 accepted risk** | 理想 OS keychain（safeStorage）+ main 注入，涉 settings schema（CTO-gated）+ 秘密链路重构。短期缓解：先翻 RC-1 默认清洗收窄注入面 + 统一 settings facade。CTO 裁定修 / 带 tradeoff accepted risk。 |
| **RC-1** | High | **修（CTO 仲裁：共享 primitive）** | markdown.js 是 BUILTIN 共享原语 CTO 守门。(a) toolkit 可自己两处显式传清洗函数；(b) CTO 翻转默认值令"不清洗"成显式 opt-out。建议 (b) 根治。 |
| **RC-2** | High | **修（随 RC-1 同一清洗函数）** | href/src scheme 白名单（http/https/mailto），外链统一走 main openExternal-deny。 |
| **RC-3** | High | **修（quick win ×3，三 dev 各自落地）** | 三 `<img src>` sink 各加 scheme 白名单（仅 https + app 受控本地路径），互不依赖可并行；上游 sanitize 补（纵深）。 |

**accepted risk 候选（建议 CTO 确认而非默认接受）**：
- M-5/M-6（test-api eval + __pupuTestBridge gate）：建议 gate 从 NODE_ENV 改 `app.isPackaged` + 构建期单测断言——成本低，不建议 accepted。
- M-10（character 导入持久化注入）：当前**休眠**（无 UI 入口），可接受现状，但**必须把"导入需文件选择 + prompt 预览 + 记忆导入确认"列为接线前置硬门写进 ADR**，否则接线易被当纯 UI 改动跳过安全复核。

---

## 6. 各 dev 学到的隐患汇总（教育目标成果）

- **dev-electron**：① "bridge 是具名白名单"≠安全——无约束 readFile 等于透传 fs；② "token 仅 main 持有"是没验证就相信的假设，被自己 avatar URL 凿穿；③ SSE relay 是不可信内容运输带，不该零防线；④ dev-only gate 应用 `app.isPackaged` 而非 NODE_ENV。
- **dev-chat-core**：① 流式门控是呈现层非安全控制——类型校验 ≠ 信任校验；② localStorage 是注入时间机器，"存原文"与"安全"是张力，安全责任下移渲染 sink；③ 塞③内容进任何 DOM 属性（src/href/style-url）都是 sink；④ 跨 owner 字段最危险是"每棒假设上棒已清洗"。
- **dev-chat-bubble**：① 安全默认值不仅"默认关",接口形状就该不鼓励错误使用；② 威胁等级取决于渲染引擎，dangerouslySetInnerHTML vs createElement 两个量级；③ `<img src>` 是被低估的零点击外联面；④ **确认按钮线是正面样板**（label/payload 全硬编码）。
- **dev-toolkit**：① "安装=跑陌生人代码"但前端不是执行闸，价值在不把第三方内容当可信渲染 + 知情提示；② markdown 不清洗在 toolkit 有第二落点且 README attacker-influenceable 最高；③ auto-approve 纯前端判定，安全=renderer 安全；④ "只是个图标"是危险轻视——SVG 是可执行文档格式。
- **dev-settings**：① 秘密的安全=最弱读取者，"谁能读到"才是主轴；② 危险默认值是替用户做安全决策，同能力两入口姿态可悄悄分叉（init fail-closed vs settings fail-open）；③ 缺统一 facade 是安全收口缺失；④ **三层 gate（NODE_ENV+挂载+isPackaged）是正面样板**。
- **dev-agents**：① character 卡=别人替你写好的 prompt+工具集，注入形态在"配置"里每次重新生效；② avatar.url 两来源分支防护不对称；③ **"休眠攻击面"比"开着的洞"更易忽略**，接线时机才是定级时机；④ 边界划分要诚实，"工具可用"≠"工具已授权"。

**贯穿教训**：纵深防御要求每个 sink 自己兜底，不信上游——这正是接缝 A/B 本质（双方都不校验=洞）。

---

## 7. 修复优先级排序

### Quick Win（低风险、地盘内可独立落地、不需同步会）
1. **RC-5 IPC 文件读写加 root 约束** — 照搬 deleteRuntimeEntry 范本，dev-electron 独立。**最高 quick win 收益**（堵接缝 A 入口）。
2. **RC-3 三处 avatar `<img src>` scheme 白名单** — 三 dev 并行。
3. **M-6/M-5 gate 改 app.isPackaged** + 构建期单测断言 packaged build 无后门。
4. **M-7/M-8 SSRF 统一出站校验器**（拒 loopback/私网/link-local + resolved-IP 比对防 rebinding）。
5. **L-8 workspace 校验 fail-open → fail-closed** 与 init 步对齐。
6. **toolkit RC-1 落点**：两处 README `<Markdown>` 在自己地盘可先显式传清洗函数。
7. **闭环 M-14**：补读 `toolkit_icon.js` 确认 SVG 渲染路径。

### 需同步会 / CTO 仲裁（跨层、共享动脉、架构改动）
1. **RC-SEAM-B（Critical）秘密链路重构** — settings+electron+flask 三区，最高优先级 ADR。
2. **RC-1/RC-2 markdown 共享 primitive 默认值翻转 + 清洗函数** — CTO 守门，建议翻默认值根治，联动 electron openExternal（M-4）。
3. **RC-4 确认门控服务端默认拒绝** — Flask 主修 + 前端兜底 + ux-designer 风险分级契约，llm-expert + CTO 同步会。
4. **RC-6 key 移出 renderer（OS keychain）+ M-11 settings facade 收口** — settings schema CTO-gated，是 RC-6 收口前提。
5. **M-10 character 导入接线前置硬门** — 写进 ADR。
6. **M-13 registry schema runner 枚举 + 外部 registry 签名** — 转 mcp-store-curator + 守 vetting bar。

### 红用例移交清单（→ pupu-qa-tester）
- RC-1：渲染含 javascript: 链接/iframe/img onerror 的助手消息与 store README，断言不外联、不可点击执行。
- RC-3：导入含远程 url/file:// 头像的 character，断言渲染前不发外联、不加载本地文件。
- RC-4：装无 destructiveHint 的 stub MCP server + 诱导消息，断言必收 confirmation frame；approve 安全工具后灌冒名帧断言不被静默放行。
- RC-5：renderer 调 readFile 读 root 外文件（~/.ssh/id_rsa）应被拒；clearRuntimeDir 对 root 外路径应拒。
- RC-SEAM-B：renderer 不应能从任何 bridge 返回值/DOM 提取 unchain_auth token 或 provider key。
- M-6：packaged build 内 window.__pupuTestBridge 必须 undefined、不监听 test-api 端口。
- M-7/M-8：MCP OAuth/registry fetch 指向 169.254.169.254/内网 IP 应被拒。

---

## 8. 结论

PuPu 两道既有硬防护（Flask 随机 token 逐路由认证 + 127.0.0.1 bind）守住了"远程未授权直达"底线，无 Critical 来自外部直接触达。但全部高危收敛到同一句话：**一旦 renderer 被内容注入，它持有的能力太大、密钥太近、门控太软**。三个系统性根因相互放大，组合出 1 个 Critical（秘密链路）和 2 条跨层接缝。路线：先做 quick win 缩小注入面与可达能力（RC-5/RC-3/SSRF），再经 CTO 同步会做三个根治（markdown 默认清洗、确认门控服务端默认拒绝、key 移出 renderer）。所有 exploit 已具备红用例移交 QA——没有红用例的防御等于没防御。
