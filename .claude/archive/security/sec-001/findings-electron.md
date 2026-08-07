# SEC-INVESTIGATION-001 — findings-electron (dev-electron 自查)

主责边界: (1) renderer<->main IPC (兼 (2)main<->Flask 发起端)
范围: electron/main/, electron/preload/bridges/, electron/preload/stream/, electron/shared/
调查性质: 只读。所有 file:line 基于 branch codex/runtime-events-v4 当前 HEAD。

威胁模型前提(守的尺子): renderer 渲染边界(3)不可信内容(模型/MCP 输出、markdown 里的 <img onerror>/<script>、被投毒的 character/recipe)。一旦 renderer 内有任意 JS 执行(XSS / /v1/debug/eval),它就能调用所有 window.*API bridge。因此「被注入的 renderer 拿这个 bridge 能做什么」是定级主轴。chat-bubble 清单(清单3)的 sanitize_html 默认 false 若坐实,本区所有 "renderer 已可信" 的假设全部失效——本报告所有 finding 均按「renderer 可被注入」评估,这是与清单3 的联合点。

---

## 检查项 1 — preload bridge 暴露面最小化

锚点: electron/preload/bridges/*.js, preload/index.js, preload/channels.js

总体结论: bridge 写法本身是白名单化具名方法,没有任何 bridge 把 ipcRenderer 对象、通用 invoke(任意channel)、Node 模块、shell/fs/child_process 直接透传给 renderer。这一点 good,记一行「已查,bridge 透传无 finding」。但暴露的具名能力本身包含数个高危原语:

### [H] [verified] [boundary (1)->(2)] unchain_bridge.js:143-146 — writeFile/readFile bridge 暴露任意路径文件读写
unchain_bridge.js:143 (writeFile)、:145 (readFile) 把任意 filePath 透到 main runtimeService.writeFile/readFile (根因见检查项2)。
- exploit: 被注入的 renderer 执行 window.unchainAPI.writeFile("~/Library/LaunchAgents/x.plist", 恶意内容) 或 readFile("~/.ssh/id_rsa") / 读 ~/.pupu/mcp_secrets.json 回传模型/外联。一条带 XSS 的助手消息即可触发。
- mitigation: 根因在 main 侧(检查项2)。这两个方法是 bridge 面最危险出口,应在 main 侧加 root 约束后保留。红用例:「注入 renderer 调 readFile 读 ~/.ssh/id_rsa」。

### [M] [verified] [boundary (1)] index.js:74-75 / test_bridge_preload.js:70-74 — __pupuTestBridge 暴露依赖 env gate,无打包硬断言
test_bridge_preload.js:71 if (process.env.NODE_ENV === "production") return; :72 PUPU_TEST_API_DISABLE === "1" 才不暴露。index.js:74 无条件 installTestBridge(),gate 全在被调函数内。
- exploit: 若某次打包未把 NODE_ENV 钉成 production(构建配置回归),生产版会暴露 window.__pupuTestBridge,配合 main 侧 test-api 的 /v1/debug/eval(检查项6)形成 renderer<->本机 eval 后门。
- mitigation: gate 改用 app.isPackaged(运行时事实)而非 NODE_ENV(构建期字符串,易回归),preload 与 main test-api 两处都断言;加构建期单测验证 packaged build 内 __pupuTestBridge 为 undefined。红用例:「packaged build 内 window.__pupuTestBridge 必须 undefined」。

### [L] [verified] [boundary (1)] preload bridges 全量 — bridge 方法不校验入参类型,把校验全推给 main
所有 bridge 直接把 renderer 实参塞进 ipcRenderer.invoke(如 unchain_bridge.js:143 不校验 filePath 是否 string)。属纵深防御缺口 note,非独立漏洞(main 侧应校验,但检查项2 证明 main 有缺口)。mitigation: 不强求 bridge 侧,main 侧必须补。

---

## 检查项 2 — 主进程 handler 输入校验(renderer->main 提权 / 路径遍历)

锚点: register_handlers.js, services/runtime/service.js

### [H] [verified] [boundary (1)] runtime/service.js:517-547 — writeFile/readFile 接受任意绝对路径,零 root 约束(本区头号 finding)
writeFile(:517) 仅 trim() 后 fs.writeFileSync(p, content); readFile(:531) 仅 trim()+existsSync 后 fs.readFileSync(p)。没有任何 workspace root 限定、没有 path.resolve 逃逸检查、没有绝对路径过滤。经 register_handlers.js:430-435 暴露为 IPC handle,经 unchain_bridge.js:143-146 暴露给 renderer。
- exploit: 被注入的 renderer(XSS 或 /v1/debug/eval) -> window.unchainAPI.readFile("/Users/<user>/.ssh/id_rsa") 读任意文件; writeFile 写任意绝对路径 -> 持久化/RCE。renderer->本机文件系统的直通管道。
- mitigation: writeFile/readFile 内强制 path.resolve 后必须落在白名单 root(workspace root ∪ userData ∪ downloads)内,逃逸即拒;或只接受 showSaveDialog/showOpenDialog 返回的用户刚确认路径(user-consent token)。红用例:「renderer 调 readFile 读 root 外文件应被拒」。

### [M] [verified] [boundary (1)] runtime/service.js:448-462 / 276-305 — clearRuntimeDir/getRuntimeDirSize 接受任意 dirPath,无 root 约束
clearRuntimeDir(:448) 对任意 dirPath 做 readdirSync + rmSync(recursive:true,force:true); getRuntimeDirSize(:276) 对任意 dirPath 递归枚举(目录信息泄漏)。trim 后无 root 校验。经 register_handlers.js:306-314 暴露。
- exploit: 注入 renderer -> clearRuntimeDir("/Users/<user>/Documents") 递归删除任意目录(破坏性); getRuntimeDirSize("~/.ssh") 枚举敏感目录文件名。
- mitigation: 所有 dirPath 强制落在 userData/workspace root 内。红用例:「clearRuntimeDir 对 root 外路径应拒」。

### [M] [verified] [boundary (1)] runtime/service.js:129-138 / 86-116 — openRuntimeFolder root 可为任意已存在目录
openRuntimeFolder(:129) 走 validateWorkspaceRootPath(:35,只校验存在+是目录)后 shell.openPath(resolvedPath); expandWorkspacePath(:17) 会展开 ~。校验不限定 app 范围。
- exploit: 注入 renderer -> openRuntimeFolder("/Applications") 用 OS 文件管理器打开任意目录(信息暴露,非 RCE)。
- mitigation: 限定为 app 已知 runtime 目录集合(userData 子树),不接受裸路径。红用例:「openRuntimeFolder 只接受 runtime 目录白名单」。

### 已查无 finding(检查项2 做对的部分,记录备守复核)
- deleteRuntimeEntry(:427-446): 用 path.basename(entryName) 去路径分量 + full.startsWith(dir + path.sep) 逃逸检查——本区唯一做对路径约束的 handler,可作 writeFile/readFile/clearRuntimeDir 的修复范本。无 finding。
- deleteCharacterStorageEntry(:363-425): safeEntryName 走固定枚举 + startsWith("character_"),目标目录由 main 用 app.getPath("userData") 拼,renderer 不可控目录基。无 finding。
- stream handler(register_handlers.js:444-462): payload 透传 unchainService,workspaceRoot 在 startMisoStream(service.js:2283-2308)经 validateWorkspaceRootPath 校验后才发 Flask——main 侧对 workspace root 有校验,good(同时是接缝A,Flask 是否还需独立校验由守端到端追)。无 finding。

---

## 检查项 3 — sandbox:false 的代偿确认

锚点: main_window.js:191-198

### 已查无新 finding(已知 tradeoff,未被放大,但与检查项1/2 叠加风险升级)
main_window.js:193 contextIsolation:true、:194 nodeIntegration:false、:196 sandbox:false(注释:preload 模块加载兼容)。逐查 preload:所有 bridge 用 contextBridge.exposeInMainWorld 暴露纯函数,闭包内没有把 require/process/Node 对象泄漏进暴露对象(index.js 仅暴露 runtime/osInfo 两个静态对象 + bridge 函数;process.platform 是值拷贝)。contextIsolation 未被自我绕过。
- 记录: sandbox:false 本身不在我处上报范围(已知 tradeoff),但它把 "preload 不向 renderer 递 Node 能力" 从 sandbox 强制降级为纯代码自觉。叠加效应:检查项1/2 证明 bridge 具名地暴露了 writeFile/readFile 等本机能力——sandbox:false 让这些能力没有第二道闸。建议守汇总时把 "sandbox:false + 高危 bridge 原语无 root 约束" 作组合项评估是否值得开 sandbox 重评。

---

## 检查项 4 — 导航 / 外链白名单

锚点: main_window.js:302-317

### [M] [verified] [boundary (3)->(1)] main_window.js:302-306 — setWindowOpenHandler 对一切 https? 直接 openExternal,无确认
:303 if (/^https?:/i.test(url)) shell.openExternal(url),return deny(good:不开新窗)。但任何 http/https 链接无确认直接交 OS 浏览器。
- exploit: 模型/MCP 输出(边界(3))里的 markdown 链接诱导点击 -> 自动 openExternal 钓鱼/drive-by。非 RCE,但内容可达。注:file:/smb:/自定义协议被 ^https? 隐式拒绝(deny 且不 openExternal),good。
- mitigation: 与清单3 链接 sink 联动,href scheme 过滤在渲染层先做;main 侧 openExternal 前加一次确认或限已知 host。红用例:「模型输出的 https 链接点击应经确认」。

### [L] [verified] [boundary (1)] main_window.js:309-317 — will-navigate 的 devServerOrigin 在 prod 仍可匹配 http://localhost:2907
:310 getDevServerOrigin() 在 prod 仍返回 http://localhost:2907。:311 url.startsWith("file://") || url.startsWith(devServerOrigin) 放行导航。
- exploit: 极弱——prod 入口是 file://,要导航到 2907 需已有注入能力且本机有该服务。理论残留,非可达漏洞。
- mitigation: prod 下 isLocalAppUrl 只认 file://,devServerOrigin 仅 dev 启用。低优。

---

## 检查项 5 — channel 常量契约一致性

锚点: shared/channels.js, preload/channels.js, register_handlers.js

### [L] [verified] [boundary (1)] channels.js:85 — VALIDATE_API_KEY 定义但无 handler/无 bridge(死契约)
shared/channels.js:85 定义 VALIDATE_API_KEY 但 register_handlers.js 无对应 handle,preload 也未暴露。不可达,不构成漏洞。契约卫生 note(死 channel 易被误接成无校验 handler),不跨边界。mitigation: 删未用常量或补全契约。

### [L] [verified] [boundary (1)] preload/channels.js 与 register_handlers.js 清单漂移 + 白名单未通电
preload/channels.js 的 PRELOAD_INVOKE_CHANNELS(:3-51) 缺多个 main 已注册 channel(LIST_MCP_STORE_ENTRIES/REGISTRIES、IMPORT/VALIDATE/REFRESH/DELETE_MCP_STORE_REGISTRY、APPROVE/REVOKE_MCP_STORE_ENTRY、GET_TOOLKIT_DETAIL、OPEN_RUNTIME_FOLDER、WRITE_FILE、READ_FILE 等)。经查这些 PRELOAD_*_CHANNELS 数组当前未被用作运行时 invoke 白名单(bridge 直接 ipcRenderer.invoke(CHANNELS.X),不查数组)——漂移不放大攻击面,但意味着「白名单」是未通电的安全控件:看着像 allowlist,实际不拦任何东西。
- mitigation: 要么让 preload 真正用该数组校验 invoke 目标 channel(通电),要么删掉造成「有 allowlist 安全感但无实效」的误导。建议前者。红用例:「preload 应拒绝不在白名单内的 invoke channel」。
- 记一行「已查」: renderer 不能伪造 stream 帧灌别的会话——unchain_stream_client.js:19/68 每 listener 用 envelope.requestId !== requestId 过滤,requestId 由本地 createRequestId() 随机生成;STREAM_EVENT 是 main->renderer 单向 send,renderer 无法以 STREAM_EVENT 身份注入(不在 IPC_ON_CHANNELS)。无 finding。

---

## 检查项 6 — SSE relay 注入

锚点: unchain_stream_client.js, unchain/service.js 的 emitMisoStreamEvent/streamMisoSseToRenderer, test-api

### [H] [verified] [boundary (2)->(1)] unchain/service.js:2196-2201 + stream_client.js:74-120 — Flask SSE 帧结构未校验,原样转发驱动 renderer 状态
streamMisoSseToRenderer(service.js:2160) 用 parseSsePayload(:2137) JSON.parse 后 emitMisoStreamEvent(:2196) 原样转发 payload 到 renderer; preload registerMisoStreamV2Listener(stream_client.js:74) 按 data.type/data.payload 分发到 onFrame/onToken/onDone,对帧结构、字段类型、tool 名、confirmation 标志不做任何校验。
- exploit: 边界(2)帧源头是 Flask 转发的 MCP/LLM 输出(边界(3))。被投毒的 MCP server 构造任意 frame(伪造 requires_confirmation:false、伪造 artifact 路径、伪造 done payload),main relay 不审、preload 不审,直灌 renderer 状态机。信任假设漏洞落点在清单2(use_chat_stream 消费帧)与清单7(Flask 确认门控真相源),但 relay 这一层是它们的运输带且自己不设防。
- mitigation: relay 侧在 emitMisoStreamEvent 前对 envelope 做最小结构白名单(event 名枚举、type 枚举、丢弃未知/超大字段)。确认门控真相源由 Flask(清单7 #6)+ llm-expert 负责,relay 不应是唯一防线但应做结构 sanitize。红用例:「畸形/超大 SSE 帧不应使 renderer 崩溃或越权」。与清单2/清单7 联合点。

### [H] [verified] [boundary (2)->(1)/(3)] unchain/service.js:473-479 + 511-515 — unchain auth token 经 buildMisoAssetUrl 写进 avatar.url,泄漏到 renderer DOM
buildMisoAssetUrl(:473) 把 unchainAuthToken 拼成 ?unchain_auth=<token>; decorateCharacterAvatar(:511) 把它写进 avatar.url 返回 renderer,renderer 当 <img src> 渲染。Flask<->main 的认证 token 因此落进 renderer 可读处与 DOM。
- exploit: 被注入的 renderer 读任一 character 的 avatar.url(或拦 <img> src / 读 performance entries)即可提取 unchain_auth token -> 直接对 http://127.0.0.1:<port> 发认证请求,绕过 "token 仅 main 持有" 假设,驱动 Flask chat/工具/文件/memory 端点(边界(2)全开)。token 还可能进 referrer/历史/日志。秘密链路接缝B 在 electron 段的泄漏点。
- mitigation: avatar 不用 query-string token。改为 (a) main 侧代理 avatar 字节经 IPC 返回 data/blob,token 不出 main; 或 (b) 一次性、avatar-scope、短时效能力票据。红用例:「renderer 不应能从任何 bridge 返回值/DOM 提取 unchain_auth token」。建议升级守复核 + 报 CTO(秘密链路接缝)。

### [M] [verified] [boundary (1)] test-api/builtin_commands.js:157-204 — 本地 HTTP 服务暴露 /v1/debug/eval(renderer 任意 JS 执行)+/dom
createServer(server.js:78) listen(0,"127.0.0.1") 随机端口写入 userData/test-api-port(index.js:54)。/v1/debug/eval(builtin_commands.js:157) 对 body.code 做 win.webContents.executeJavaScript(wrapped,true)——同机任意进程读到 port 文件即可在 renderer 内执行任意 JS,配合检查项2 的 writeFile/readFile 即本机全权。
- 定级理由: gate 是 NODE_ENV!=="production" && PUPU_TEST_API_DISABLE!=="1"(test-api/index.js:23)——dev/QA 才开,prod 默认关;触发需机器已有恶意进程能读 port 文件 + loopback,按守的尺子降到 Medium。但 executeJavaScript 上限是 RCE,且 gate 依赖 NODE_ENV 字符串(同检查项1 回归风险)。
- mitigation: (1) gate 改 app.isPackaged; (2) test-api server 加每会话 bearer token; (3) port 文件 0600。红用例:「packaged build 不监听 test-api 端口;dev 端口需 token」。

### 已查无 finding(relay 做对的部分)
- emitMisoRuntimeLog(service.js:1770) 只向 getType()==="window" 的 webContents 发日志,且 index.js:30-43 过滤掉 HTTP access log 行(避免把可能含 query token 的 Flask 请求行刷进 renderer console)。有意脱敏,good。
- main 不主动 push unchainPort/unchainAuthToken 给 renderer(getMisoStatusPayload 返回 port+url 但不含 token,service.js:447-454)。port 暴露 Low(renderer 本就同机),token 不在该 payload,good。唯一 token 泄漏点是上面 avatar.url finding。

---

## 我学到的隐患(攻击面认知)

1. 我的 bridge 面有两个「裸文件系统原语」是整个 app 最危险的出口: unchainAPI.writeFile/readFile(+clearRuntimeDir/getRuntimeDirSize)。它们经我手白名单化暴露给 renderer,却在 main 侧零 root 约束。我一直把 "bridge 是具名白名单" 当安全终点,但具名 != 安全——暴露无约束的 readFile(任意路径) 和透传整个 fs 没本质区别。同仓 deleteRuntimeEntry 已有正确的 basename+逃逸检查范本,说明是疏漏不是不会做。

2. 秘密链路在我这段有隐蔽泄漏点: auth token 经 avatar URL 的 query-string 漏进 renderer DOM。我以为 x-unchain-auth 只活在 main header,但 buildMisoAssetUrl 为让 <img> 取头像把 token 拼进 renderer 拿得到的 URL。renderer 一旦被注入就能偷 token 直接打 Flask——loopback+token 双层防护被我自己在 electron 段凿穿。「token 仅 main 持有」是我没验证就相信的假设。

3. SSE relay 是边界(2)->(1)的运输带,而它自己不设防。emitMisoStreamEvent/preload listener 把 Flask 帧原样转发、按 data.type 分发,从不校验结构。帧真实源头是 MCP/LLM(边界(3))。我过去把 SSE 当「我们自己的数据」,但它是不可信内容的载体;relay 不该是唯一防线,但也不该是零防线。

4. 我的 dev-only gate 全靠 NODE_ENV 字符串,不是 app.isPackaged 运行时事实。__pupuTestBridge、test-api server、/v1/debug/eval、setChromeTerminalOpen 都用 env 判定。一次构建配置回归就能让 eval 后门进生产。运行时事实 app.isPackaged 比构建期注入的字符串更难被意外放宽。

---

## findings 统计

Critical: 0
High: 4 — writeFile/readFile bridge 暴露(检1)、writeFile/readFile main 零约束(检2)、SSE 帧未校验 relay(检6)、auth token 经 avatar URL 泄漏 renderer(检6)
Medium: 5 — __pupuTestBridge gate 依赖 NODE_ENV(检1)、clearRuntimeDir/getRuntimeDirSize 无 root(检2)、openRuntimeFolder 任意目录(检2)、openExternal 无确认(检4)、test-api /eval 后门(检6)
Low: 4 — bridge 不校验入参 note(检1)、will-navigate devServerOrigin 残留(检4)、VALIDATE_API_KEY 死契约(检5)、preload channel 白名单未通电+漂移(检5)

注: 检1 与检2 的 writeFile/readFile 是同一根因的两段(bridge 出口 + main 无约束),守复核可合并为一条「IPC 任意文件读写」主 finding;我按出现位置分列以便定位。

## 最重要的 1-2 条(概要)

1. IPC 任意文件读写(runtime/service.js:517-547,经 unchain_bridge.js:143-146)——unchainAPI.writeFile/readFile 接受任意绝对路径,main 侧零 root 约束。被注入的 renderer(XSS/模型输出//v1/debug/eval)可读 ~/.ssh/id_rsa、~/.pupu/mcp_secrets.json,写 LaunchAgent 持久化。修复范本就在同文件 deleteRuntimeEntry(basename+逃逸检查)。本区头号 High。

2. auth token 经 avatar URL 泄漏进 renderer DOM(unchain/service.js:473-479 + 511-515)——main<->Flask 的 x-unchain-auth 被 buildMisoAssetUrl 拼进 avatar.url 的 query-string 返回 renderer 当 <img src>。注入的 renderer 偷 token 即可绕过 loopback+token 直接驱动 Flask 全部端点。秘密链路接缝B 在 electron 段的凿穿点,建议升级守复核并报 CTO。
