# SEC-INVESTIGATION-001 — 审查清单（守 / pupu-security-expert 出品）

**调查任务书摘要**
- 三条信任边界：① renderer↔main IPC　② main↔Flask 本地 HTTP　③ app↔第三方 MCP/LLM 内容（默认 attacker-controlled）。
- 流程：本清单 → dev 按区域自查 → 守汇总复核定级 → HIGH/CRITICAL 报 CTO 仲裁。
- **本阶段只产 findings，不改代码。**

**Finding 提交格式（每条都要齐全）**
```
[severity C/H/M/L] [verified|suspected] [boundary ①/②/③]
file:line —— 一句话标题
exploit 场景：攻击者从哪个入口、放什么内容、达成什么效果
mitigation：具体改哪里、验什么、对应什么红用例
```

**定级原则（守的尺子）**
- 本体是本地桌面 app：需要"机器已被攻陷"才能触发的，通常降到 Low。
- 反过来，凡是**内容可达**（一条聊天消息、一个 workspace 文件、一条 MCP 商店条目、一段模型输出）能触发的，默认是热点，起步 High。
- 跨边界才算安全 finding；不跨边界的算代码质量 note，请明确标注。
- 每条 finding 必须能 trace 到 file:line，否则标 `suspected`。

---

## 清单 1 — dev-electron（主进程 / preload / IPC relay / channel 常量）

**主责边界：① renderer↔main IPC（同时是 ②main↔Flask 的发起端）**
范围：`electron/main/`、`electron/preload/bridges/`、`electron/preload/stream/`、`electron/shared/channels.js`

锚点已观察：`main_window.js` webPreferences = `contextIsolation:true / nodeIntegration:false / sandbox:false`；有 `setWindowOpenHandler` deny + `will-navigate` 拦截。这些先确认未在别处被放宽。

检查项：
1. **preload bridge 暴露面最小化** — 逐个看 `electron/preload/bridges/*.js`。finding：任何 bridge 把通用能力（任意 channel `invoke`/`send`、`ipcRenderer` 对象、Node 模块、`shell`/`fs`/`child_process`）透传给 renderer，而非白名单化的具名方法。威胁：被注入的 renderer（边界③的内容打进来）经 bridge 升级为本机能力。
2. **主进程 handler 输入校验** — `electron/main/ipc/register_handlers.js`（471 行）逐个 handler 看入参。finding：handler 直接把 renderer 传入的路径/命令/URL/端口用于 fs、spawn、HTTP、`shell.openExternal` 而不校验类型与范围。威胁：renderer→main 提权、路径遍历、SSRF 发起点。
3. **`sandbox:false` 的代偿确认** — `main_window.js:196`。finding：在 sandbox 关闭的前提下，preload 是否引入了会把 Node 能力泄漏到 contextBridge 暴露对象的写法（闭包里漏 `require`、返回带原型链的对象）。威胁：contextIsolation 被绕过。注意：sandbox:false 本身是已知 tradeoff，先查"有没有被它放大的具体漏洞"，再谈是否上报 CTO 重评。
4. **导航/外链白名单** — `main_window.js:302-317`。finding：`shell.openExternal` 对 `https?:` 直接放行，未拒 `file:`/`smb:` 之外的危险 scheme（如某些平台的自定义协议）；`will-navigate` 的 `devServerOrigin` 在 prod 是否仍可被 `http://localhost:2907` 命中。威胁：模型输出的恶意链接被用户点击后用 openExternal 触达本机 handler。
5. **channel 常量契约一致性** — `electron/shared/channels.js`（119 行）对照 preload `channels.js` 与 main 注册表。finding：存在已注册但无人校验来源的 channel，或 renderer 可监听本应只读的 stream channel 并伪造帧。威胁：边界① 的 channel 伪造。
6. **SSE relay 注入** — `electron/preload/stream/unchain_stream_client.js` + `services/unchain/service.js`。finding：从 Flask 转发到 renderer 的帧未做来源/结构校验，或把 Flask 的端口/token 暴露到 renderer 可读处。威胁：边界②的内容直灌 renderer。

教育要点：
- **preload 是整个 app 最危险的 28 行**——它是 renderer（不可信内容的落点）和 Node（完整本机能力）之间唯一的合法门。每暴露一个方法，问"被注入的 renderer 拿这个能做什么"，而不是"功能上需不需要"。
- **`contextIsolation:true` 不等于安全**——它只在 preload 不主动把能力递出去时才成立；`sandbox:false` 让这个"不递出去"的纪律变成纯靠代码自觉。

---

## 清单 2 — dev-chat-core（chat 页 / 流式编排 hook / 输入面板 / side-menu）

**主责边界：③ 内容入口与流式编排（消费 ②的 SSE，渲染 ③的模型输出）**
范围：`src/PAGEs/chat/`、`use_chat_stream.js`（3722 行）、`chat-input/`、`side-menu/`

检查项：
1. **SSE 帧信任假设** — `use_chat_stream.js` 的 `onFrame`/`onToken`/`onDone` 处理。finding：把帧里的字段（工具名、确认标志、artifact 路径、跳转指令）当可信，直接驱动 UI 状态或本地写入而不校验。威胁：边界② 被污染的帧（源头可能是边界③的 MCP 输出）操纵客户端。
2. **工具确认门控的客户端侧** — 追 `requires_confirmation` 在前端如何被消费、谁决定弹不弹确认框。finding：确认与否完全由后端帧的自声明字段决定，前端无独立校验/无白名单兜底。威胁：恶意工具/被注入的编排把自己标成"无需确认"直接执行。（与 llm-expert 联合点）
3. **本地持久化写入的来源** — `background_stream_persister.js`、`finalize_stream_persist.js`、`chat_storage`。finding：模型输出/工具结果未经清洗直接写 localStorage，且读回时被当结构化可信数据。威胁：存储型注入（投毒内容跨会话存活、回放时触发）。
4. **输入面板的附件/粘贴路径** — `use_chat_attachments.js`、`chat-input/`。finding：附件路径、文件名、粘贴内容被直接拼进发往 Flask 的 payload 或本地路径而不校验。威胁：边界②路径遍历的发起点。
5. **side-menu 渲染会话标题/树** — `side-menu/`。finding：会话标题（可由模型生成）渲染时若进了某个 HTML/链接 sink。威胁：③内容→XSS-类注入（与清单3 同源，确认 side-menu 是否复用了 markdown 渲染）。

教育要点：
- **SSE 流不是"我们自己的数据"**——它最终承载 MCP server 与 LLM 的输出，即边界③。流式编排 hook 的每个 handler 都应假设帧可能是敌意构造的。
- **localStorage 是注入的时间机器**——写进去的污染内容会在未来某次会话被读回渲染；"现在看起来无害"不代表回放时无害。

---

## 清单 3 — dev-chat-bubble（流式 markdown 渲染 / trace_chain / interact / artifact-summary）

**主责边界：③ 模型/工具输出的渲染 sink（最热的注入落地点）**
范围：`src/COMPONENTs/chat-bubble/`、底层 `src/BUILTIN_COMPONENTs/markdown/markdown.js`

锚点已观察：`markdown.js` 用 `ReactShowdown`，`sanitizeHtml={sanitize_html}` 且 **`sanitize_html` 默认 `false`**（markdown.js:173,385）。这是本次调查的头号 suspected 热点——必须确认 chat-bubble 渲染助手消息时传的是 `true` 还是默认 `false`。

检查项：
1. **markdown HTML 清洗开关** — `seamless_markdown.js`、`assistant_message_body.js`、`StreamingMarkdownView` 调 `Markdown`/`ReactShowdown` 时是否显式 `sanitize_html={true}`。finding（起步 High）：渲染 attacker-controlled 的助手消息时 `sanitize_html` 为 false 或缺省 → 原始 HTML 进 DOM。威胁：模型/MCP 输出里嵌 `<img onerror>`、`<script>`、`<iframe>` 形成 XSS。
2. **链接 href 的 scheme 过滤** — markdown 渲染出的 `<a>`。finding：未过滤 `javascript:`/`data:`/`file:` scheme，或链接未走 openExternal-deny 流程。威胁：模型输出诱导点击的恶意链接。
3. **`normalizeHtmlDocumentMarkdown`（seamless_markdown.js:93）** — 这个把内容当 HTML 文档处理的归一化函数。finding：它是否在 sanitize 之前就放大了原始 HTML 的可达性。威胁：绕过 1 的清洗。
4. **trace_chain / interact 的可交互元素** — `trace_chain.js`、`interact/`、`pending_confirmation_trace_frames.js`。finding：trace 帧里的文本/参数直接渲染为可点击/可执行 UI，或确认按钮的 payload 来自未校验的帧字段（顺手误点风险，与 ux-designer 共管）。威胁：把确认弹窗嵌进流式 trace 链里诱导误点（已知 UX 攻击面）。
5. **artifact-summary 渲染** — `artifact-summary/`。finding：artifact 的标题/内容/路径渲染时进入 HTML 或链接 sink，或展示了不该暴露的本地路径。威胁：③内容注入 + 信息泄漏。

教育要点：
- **markdown 渲染器是 PuPu 面向不可信内容的头号 sink**——模型输出 100% attacker-influenceable（间接注入）。"默认不清洗 HTML" 是一个需要被显式推翻的危险默认值，不是细节。
- **确认按钮也是攻击面**——一个嵌在流式内容里、长得像普通 UI 的"允许执行"按钮，其安全价值取决于它不可被内容伪造、不可被顺手误点。渲染层要守住这条。

---

## 清单 4 — dev-toolkit（toolkit UI / mcp_toolkit_store / mcp_install / custom_mcp）

**主责边界：③ MCP 供应链（安装 = 执行第三方代码）**
范围：`src/COMPONENTs/toolkit/`、`mcp_toolkit_store.js`（303）、`mcp_install.js`（257）、`custom_mcp_page.js`、`custom_mcp_icon_store.js`

锚点已观察：registry 用 `npx -y @xxx@latest` / `uvx` 拉远端包（见 [[mcp-store-security-baseline]]）；`mcp_install.js` 有 `setupKindForEntry`（direct/secrets/oauth/http_secret/workspace）。

检查项：
1. **stdio 命令/args 卫生** — `mcp_install.js` 安装路径如何组装 `command`/`args`/`env` 并交给后端 spawn。finding（起步 High）：`command`/`args` 含 `-y`（跳确认）+ `@latest`（不锁版本），或用户/条目可控字段未经白名单直接进命令行。威胁：typosquat / 上游投毒 / 命令注入——安装即 RCE。
2. **custom MCP 自定义条目** — `custom_mcp_page.js`。finding：用户手填的 command/args/env/url 未校验直接落库并执行；icon 走 `custom_mcp_icon_store.js` 时是否接受 `data:`/远程 URL。威胁：用户被社工诱导粘贴恶意配置；icon 成为 ③内容注入点。
3. **store 条目渲染与信任标识** — `toolkit_store_page.js`、`toolkit_card`。finding：商店条目的 name/desc/作者/链接渲染进 HTML/链接 sink；安装高危条目与普通插件观感无差异（无风险分级提示）。威胁：③内容注入 + 用户在无知情下授权执行第三方代码。
4. **auto-approve 持久化** — `toolkit_auto_approve_store.js`。finding：自动批准范围过宽、可被条目自声明撑大、或写入时不校验来源。威胁：绕过工具确认门控（边界③的核心安全控制被静默关闭）。
5. **filesystem server 权限广度** — `workspace.filesystem` 类条目。finding：安装流把整个 `${WORKSPACE}` 读写权授予 server，无 scope 收窄/无提示。威胁：一个被投毒的 filesystem server 可读写整个工作区。
6. **registry 完整性** — `mcp_toolkit_registry.json` + schema。finding：registry 来源、签名/校验缺失，或 schema 未约束 command/url 字段。威胁：注册表被篡改即批量投毒。

教育要点：
- **"安装一个工具" = "在用户机器上运行陌生人写的代码"**——MCP 安装流不是插件市场的 UX 问题，是供应链 RCE 问题。`@latest` + `-y` 把"信任决策"从用户手里偷走了。
- **工具确认是安全控制，不是 UX 弹窗**——任何让确认/auto-approve 范围被条目自声明撑大的设计，等于把门钥匙交给被审查对象自己保管。

---

## 清单 5 — dev-settings（settings UI / init 向导 / workspace / localStorage settings）

**主责边界：秘密链路起点（settings 存 key）——跨边界①②③的秘密接缝起点**
范围：`src/COMPONENTs/settings/`（model_providers、memory、workspace、local_storage、dev）、`init-setup/`

检查项：
1. **API key 存储posture** — `settings/model_providers/`、`settings/local_storage/`。finding（已知现状，需 trace 确认范围）：provider API key 明文存 localStorage。威胁：任何能读 renderer 存储的路径（边界③注入 + 边界①bridge）都能拿到 key。这是秘密链路的源头，重点 trace "谁能读到它"。
2. **key 进日志/错误/SSE 的泄漏** — 搜 settings 与 console_logger、toast、错误展示路径。finding：key 被打进 console、toast、错误弹窗、或回显进可被模型读到的上下文。威胁：密钥外泄（与守的汇总阶段"秘密链路"接缝直接相关）。
3. **workspace 根路径设置** — `settings/runtime.js` 的 `readWorkspaceRoot`、`workspace/`。finding：workspace root 可被设为任意路径（如 `/`、`~`）且无确认，随后被 filesystem 工具/Flask 文件端点当作授权范围。威胁：把整机暴露给边界②③的文件操作。
4. **init 向导的默认值** — `init-setup/`。finding：首次设置把危险默认打开（auto-approve、宽 workspace、跳过 key 校验），或在向导阶段就把 key 发给非预期端点验证。威胁：用户还没理解就被置于不安全默认。
5. **memory/dev 子模块的开关** — `settings/memory/`、`settings/dev/`。finding：dev/test 专用能力（如 test_bridge、test-api）可被普通用户或内容触发开启。威胁：调试后门在生产被内容打开。
6. **localStorage 写入纪律** — 确认 settings 写 key 走 SERVICEs 专用 helper 而非组件直写（CLAUDE.md 硬规则）。finding：组件直接写敏感 localStorage。威胁：绕过统一校验/脱敏点。

教育要点：
- **秘密的安全等于它最弱的读取者**——key 存在 localStorage，意味着它的安全性由"renderer 里所有能跑的代码"共同决定，而 renderer 要渲染边界③的不可信内容。存储格式之外，更要画清"谁能读"。
- **危险默认值是最隐蔽的漏洞**——用户几乎不会改默认。init 向导每一个默认开关，都是一次替用户做的安全决策。

---

## 清单 6 — dev-agents（characters / recipes / flow_editor）

**主责边界：③ 上下文装配（character 卡 / recipe 是无信任分层的 prompt/工具来源）**
范围：`src/COMPONENTs/agents/`（characters_page、customize_page、recipes_page、flow_editor）

检查项：
1. **character 卡内容作为 prompt 注入面** — `characters_page.js`、character 导入。finding：character 的 system prompt/描述/字段被直接拼进发给模型的上下文，且 character 可从外部导入（无来源校验）。威胁：导入一张恶意 character 卡 = 持久化的 prompt 注入 + 可预置危险工具集。
2. **character 导入/导出的反序列化** — 追导入路径（前端 + `character_import_export.py`）。finding：导入的 JSON 字段未校验直接落库，含可执行配置（绑定的 toolkit、auto-approve、workspace）。威胁：一张卡片携带"自带工具权限"的配置。
3. **recipe 图节点语义** — `recipes_page/`、`flow_editor`。finding：recipe 节点可引用 subagent/tool pool 并预设其权限/auto-approve，且节点字段渲染进 HTML/链接 sink。威胁：recipe 成为打包好的"高权限工具组合"分发载体；③内容渲染注入。
4. **subagent_picker 的工具池授权** — finding：subagent 选取的工具池绕过用户逐次确认，或把确认门控的范围在 recipe 层面预批。威胁：编排层静默放大工具权限（与 llm-expert / 清单4 auto-approve 联动）。
5. **character 渲染 sink** — character 名/头像/描述展示。finding：进 HTML 或接受 `data:`/远程头像 URL。威胁：③内容注入 + 外联。

教育要点：
- **character 卡和 recipe 是"可分发的信任配置"**——它们不只是文案，还携带 system prompt 和工具权限。一张从社区下载的 character，本质是别人替你写好的 prompt + 预授权的工具集，威胁模型等同 MCP 条目。
- **prompt 注入的持久化形态**——比起单条聊天消息，存进 character/recipe 的注入内容会在每次使用时重新生效，杀伤更持久。

---

## 清单 7 — Flask sidecar（守自查，不交 dev）

**主责边界：② main↔Flask 本地 HTTP（以及 ③ 经 Flask 落地的文件/网络/工具执行）**
范围：`unchain_runtime/server/` —— `routes.py` 及 `route_*.py`、`route_auth.py`、`unchain_adapter.py`、`mcp_secrets.py`、`memory_*.py`、`adapter_workspace_tools.py`

锚点已观察（待深审验证）：
- bind = `os.environ.get("UNCHAIN_HOST", "127.0.0.1")`（main.py:34）—— 默认 loopback，good，但确认无处覆盖成 0.0.0.0。
- `route_auth.py`：`before_request reject_non_loopback_requests` + 可选 `UNCHAIN_AUTH_TOKEN`（HMAC compare）。token 为空时 `_is_authorized` 返回 True（即默认无认证，仅靠 loopback）。
- `mcp_secrets.py`：secrets 存 `~/.pupu/mcp_secrets.json` 明文。

检查项：
1. **bind 地址不可被放宽** — 全仓搜 `UNCHAIN_HOST`、`host=`、`0.0.0.0`。finding：任何路径能把 host 设成非 loopback（含测试/打包配置）。威胁：本地 HTTP 面暴露给同网段（边界②变远程）。
2. **未认证本地调用的影响面** — `route_auth.py` token 默认空 → 仅 loopback 防护。finding：判断同机任意进程（其它 app、被注入的浏览器页通过 DNS-rebind/CSRF）能否打到危险端点。威胁：本机恶意进程直接驱动 chat/工具/文件端点。重点看是否有 Origin/CSRF 防护，因为 loopback 不防浏览器跨站打本地端口。
3. **路径遍历** — `adapter_workspace_tools.py`、`route_memory.py`、任何接收 path/filename 的端点。finding：把请求里的路径 join 进 workspace root 而不规范化/不校验是否逃逸（`../`、绝对路径、symlink）。威胁：读写 workspace 之外的任意文件（边界②③）。
4. **SSRF via provider/MCP URL** — `unchain_adapter.py`、`route_mcp.py`、`mcp_external_registries.py`、`mcp_oauth.py`。finding：provider base_url / MCP http endpoint / OAuth 端点取自用户或条目输入，未限制 scheme/内网地址即发起请求。威胁：用 Flask 当跳板打内网/云元数据（169.254.169.254）。
5. **密钥进日志** — 搜 `routes.py`/`unchain_adapter.py`/logger 调用里是否打印 headers、payload、api_key、Authorization、secrets。finding：key/token 进日志或错误响应或 SSE 帧。威胁：秘密链路终点泄漏。
6. **unchain_adapter 确认门控的服务端真相源** — `unchain_adapter.py` 里 `requires_confirmation` 如何判定（自声明 vs legacy 名单 vs 服务端策略）。finding（与 llm-expert 联合点）：确认与否由工具自声明决定，服务端无独立白名单/无默认拒绝。威胁：恶意工具自标"无需确认"绕过门控——这是边界③的核心控制，服务端必须是真相源。
7. **secrets 落盘 posture** — `mcp_secrets.py` 明文存 `~/.pupu/`。finding：文件权限（是否 0600）、是否随诊断/导出被带走、是否进日志。威胁：本机其它用户/进程读取密钥。

教育要点（守自省）：
- **loopback 不是认证**——同机任意进程、以及任何能让浏览器对 `127.0.0.1:<port>` 发请求的网页（DNS rebinding / 简单 CSRF）都在 loopback 之内。token 默认空时，Flask 面对的是"整台机器都是可信的"这一过强假设，需要 Origin/CSRF 校验补强。
- **Flask 是边界②③的汇流口**——renderer 经 main 转发的请求、MCP/provider 的外联、workspace 文件操作，全在这里落地。这一层的路径校验和 SSRF 防护，是把"内容"挡在"本机能力"之外的最后一道闸。

---

## 守在汇总阶段自接的两条跨层接缝（dev 不必管，记录在此）

- **接缝 A：main 进程同承边界①②** —— 清单1（IPC handler 把 renderer 输入转成发往 Flask 的 HTTP）拼接清单7（Flask 端校验）。要验证：renderer 传入的路径/URL/端口，在 main 与 Flask 两侧是否各自校验，还是互相假设对方已校验（双方都不校验 = 洞）。
- **接缝 B：秘密链路 settings存→payload带→electron转发→Flask用** —— 清单5（localStorage 存 key）→ 清单2（payload 注入）→ 清单1（IPC/SSE 转发）→ 清单7（Flask 使用 + 落盘 + 日志）。要端到端追一个 api_key：从存储格式、谁能读、是否进 payload/帧/日志，到最终落盘权限，画出它全程暴露给哪些不可信面。
