# SEC-INVESTIGATION-001 — findings: dev-chat-bubble

调查者：pupu-dev-chat-bubble
范围：`src/COMPONENTs/chat-bubble/`（流式 markdown / trace_chain / interact / artifact-summary）+ 底层 `src/BUILTIN_COMPONENTs/markdown/markdown.js`
性质：**只读调查，未改任何代码。**
主责边界：③ 模型/工具输出渲染 sink（边界③头号热点）。

> 关键前置事实（影响全部 severity 判断）：PuPu 的 markdown 渲染走 **react-showdown**，且在本仓**不使用 `dangerouslySetInnerHTML`**（已验证 `markdown.js` 未传该 prop）。react-showdown 在无 `dangerouslySetInnerHTML` 时把 showdown 产出的 HTML 用 `htmlparser2.parseDOM` 解析，再对每个节点 `React.createElement(tag, attribs, children)` 渲染（`node_modules/react-showdown/dist/react-showdown.cjs.development.js:99-152, 188-218`）。
> 这把威胁模型从"经典 innerHTML XSS"收窄到"React createElement 能透传什么"：
> - `<script>` 子节点 → React 当作惰性子元素，**不执行**。
> - `javascript:` href on `<a>` → React **照样渲染到真实 DOM 的 href**，点击即执行 → **可利用**。
> - `<iframe src>` / `<img src>` → 照样渲染 → 外联 / 嵌入 / beacon。
> - 原始 `onerror=` 之类字符串属性 → React 对未知小写事件属性处理不一致，**不能假定一定被剥离**，按"可能落到 DOM"保守对待。
> showdown 默认**透传原始内联 HTML**（不转义 `<img>/<iframe>/<a>`，仅转义非标签样的 `<`），且**不过滤链接里的 `javascript:`**（已查 `node_modules/showdown/dist/showdown.js`）。

---

## 头号 suspected → **VERIFIED** 结论

**`sanitize_html` 在 chat-bubble 助手消息渲染链全程缺省 = `false`。**

调用链（已逐跳验证）：
- `markdown.js:174` —— `sanitize_html = false` 默认值；`markdown.js:385` —— `sanitizeHtml={sanitize_html}` 直接透传给 `ReactShowdown`。
- `react-showdown ...:190` —— `if (sanitizeHtml) { html = sanitizeHtml(html); }`。注意该 prop 语义是**清洗函数**，不是布尔；传 `false` ⇒ 条件为假 ⇒ **完全跳过清洗**。
- chat-bubble 侧**没有任何一处**给 `<Markdown>` / `SeamlessMarkdown` 传 `sanitize_html`（全仓 `grep sanitize_html` 只命中 `markdown.js` 自身两行）。
- `assistant_message_body.js:101-107` → `SeamlessMarkdown` → `seamless_markdown.js:320-325 / 371-380` 两处 `<Markdown ... />` 均**不传** `sanitize_html` → 取默认 `false`。

**结论：VERIFIED。** 渲染 attacker-controlled 的助手消息 / 工具返回 / artifact markdown 时，HTML **未清洗**。但实际可达危害受 react-showdown 的 React-createElement 渲染模型限制（见上方前置事实）——不是 `<script>`-级 RCE-XSS，而是 `javascript:` 链接执行 + iframe/img 外联级别。守在复核定级时请以此为准。

影响面（同一条不清洗路径覆盖）：助手正文（`assistant_message_body`）、trace 帧 / 工具 observation（`trace_chain.js:909, 1507`）、artifact markdown（`plan_card.js:134`、`generic_artifact_card.js:217`）、流式块（`seamless_markdown.js` StreamingMarkdownBlock）。

---

## 逐项 findings

### 检查项 1 — markdown HTML 清洗开关
```
[H] [verified] [boundary ③]
src/BUILTIN_COMPONENTs/markdown/markdown.js:174,385 (+ seamless_markdown.js:320-325,371-380) —— 助手/工具/artifact markdown 渲染时 sanitize_html 缺省 false，原始 HTML 进 react-showdown
exploit 场景：攻击者经间接 prompt 注入让模型（或一个被投毒的 MCP server 的工具返回）输出含原始 HTML 的 markdown，例如 [click](javascript:window.unchainAPI...)、<iframe src=http://evil>、<img src=http://evil/b.png>。该内容流经 SSE → chat_storage → SeamlessMarkdown → react-showdown，HTML 不被清洗。<script>/onerror 多半被 React 渲染模型挡掉，但 javascript: 链接点击执行、iframe/img 外联可达。
mitigation：在 markdown.js 把 chat-bubble 渲染路径显式传 sanitize_html={真正的清洗函数}（注意 react-showdown 的该 prop 要的是 (html)=>string，传 true 无效——传 boolean 是现有 bug 的根因）。或在 markdown.js 内置一个默认清洗函数（白名单标签 + 过滤 href/src scheme），令"不清洗"成为需显式 opt-out 的危险选项而非默认。红用例：渲染含 javascript: 链接、<iframe>、<img onerror> 的助手消息，断言不外联、不可点击执行。
注：本条是 markdown.js（BUILTIN 共享原语，CTO 守门）+ chat-bubble 渲染路径的接缝。修复触及共享原语 → 必须报 CTO 触发同步会，不能由 chat-bubble 私改。
```

### 检查项 2 — 链接 href 的 scheme 过滤
```
[H] [verified] [boundary ③]
全链路无 href scheme 过滤（markdown.js / seamless_markdown.js / trace_chain.js 均无）—— markdown 产出的 <a href> scheme 不受限
exploit 场景：模型/工具输出 [正常文字](javascript:...) 或 [报告](file:///etc/passwd)。showdown 不过滤 javascript:，react-showdown 把 href 原样 createElement 到 <a>，React 不拦 javascript: href，用户点击即在 renderer 上下文执行（renderer 能读 localStorage 里的 provider API key、调 window.*API bridge）。file:/数据外链同理。
mitigation：清洗函数对 <a href> 做 scheme 白名单（仅 http/https/mailto），其余降级为纯文本或剥离；理想是所有外链统一走 main 进程 openExternal-deny 流程（与 dev-electron 的 will-navigate/openExternal 白名单接缝）。红用例：点击 javascript: 链接无任何代码执行。
依赖：同检查项 1，需 CTO 协调 markdown.js + electron 外链策略。
```

### 检查项 3 — normalizeHtmlDocumentMarkdown
```
[L] [verified] [boundary ③] —— 代码质量 note，倾向减害而非放大
src/COMPONENTs/chat-bubble/components/seamless_markdown.js:93-140
查证结论：该函数检测内容里出现 <!doctype html|<html|<head|<body...> 这类整文档 HTML 行，把它用 ```html 代码围栏包起来（line 138-139）或补齐已有围栏（line 117-129）。效果是把"看起来像 HTML 文档"的内容转成代码块展示，而不是当 HTML 渲染——即它减小而非放大原始 HTML 可达性。
exploit 场景：无新增可利用面。但注意它只覆盖"行首是文档级标签"的情形；行内片段 HTML（<iframe>、<a href=javascript:> 混在正常 markdown 段落里）不被它围栏化，仍按检查项 1/2 的路径进 react-showdown。所以它不是检查项 1 的缓解，别误以为有了它就安全。
mitigation：无需改本函数；真正的清洗必须在检查项 1 的渲染层做。此处仅记录"它不构成防护"以免后续误判。
```

### 检查项 4 — trace_chain / interact 的可交互元素 / 确认按钮
```
[已查无 finding] [boundary ③]
- pending_confirmation_trace_frames.js:1-75 —— 所有帧字段（confirmationId/callId/toolName/description/arguments/interactType）逐个 typeof+trim 校验，未进任何 HTML/href sink；构造的 payload 是数据，不驱动渲染执行。
- interact/confirm_interact.js —— Allow/Always allow/Deny 三个按钮 label 与 onSubmit payload({approved,scope}) 全部硬编码，不来自帧字段；按钮不可被内容伪造、payload 不被 frame 控制。✅ 守住了"确认按钮不可被内容伪造"。
- interact/interact_wrapper.js + single_select_interact.js（及同目录 multi/text 等）—— config 里的 title/question/label/description 作为 JSX 文本子节点渲染（React 自动转义），无 HTML sink；onSubmit 数据来自用户选择，不直接回灌 frame 字段。
- trace_chain.js 的 onClick（302/463/1189/1265/1692）全是展开/折叠等 UI 状态切换，没有任何"打开 frame 提供的 url/href"的导航。
结论：trace/interact 这条线渲染安全，确认门控的客户端表现层未被内容污染。
注：确认"弹不弹/是否真的需要确认"由后端帧字段 requires_confirmation 决定——那是 chat-core(清单2)/llm-expert/Flask(清单7) 的真相源问题，不在本区域。
```

### 检查项 5 — artifact-summary 渲染（含图标 / 路径 / 链接 / 头像暗角）
```
[M] [verified] [boundary ③] —— 本地路径信息泄漏（text-only，无执行）
src/COMPONENTs/chat-bubble/artifact-summary/plan_card.js:36-40 (sourceLabel)、files_changed_card.js:271 ({file.path})、generic_artifact_card.js:179-189 (RenderLink {label})
exploit 场景：artifact 的 source.path / file.path / snapshot.url|path 直接以纯文本渲染。若工具返回里带绝对路径（含用户名/home 目录结构），会在 UI 暴露本机路径信息（轻度信息泄漏 + 给后续社工/定位提供情报）。注意：这些都是纯文本展示（无 <a href>、无 createElement 进 sink），不构成执行型注入。RenderLink 尤其是只显示 label 文本、不生成可点击链接。
mitigation：展示前对绝对路径做 home 目录脱敏（~/）或仅显示 relative_path（plan_card 已优先 relative_path，good）。低优先。红用例：artifact 含绝对路径时 UI 不泄漏完整 home 路径。
```
```
[已查无 finding（img-boundary 安全）] [boundary ③]
src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_icon.js:17-28,30-43
查证：file 图标把 icon.content 拼成 data:image/svg+xml 或 data:image/png 进 <img src>。SVG 虽可带脚本，但经 <img> 加载的 SVG 浏览器不执行其脚本（非 inline <svg>/非 <object>/<iframe>）；PNG 仅 base64 数据。mimeType 被白名单（仅 svg+xml / png），其余返回空。结论：安全，记录 <img>-boundary 推理以备复核。
```

### 暗角补充 — 角色头像 src（清单未列，但属本区域渲染 sink）
```
[M] [verified] [boundary ③] —— character 头像 url/path 无 scheme 过滤 → 外联 beacon / 本地文件探测
src/COMPONENTs/chat-bubble/character_chat_bubble.js:11-24 (resolveAvatarSrc) → :229-231 (<img src={avatarSrc}>)
数据来源：chat.js:900 session.activeCharacterAvatar → 即 character 配置。按清单6，character 卡是"可分发的信任配置"，可被外部导入，故 avatar 字段视为 attacker-influenceable。
exploit 场景：resolveAvatarSrc 对 avatar.url 原样返回（:12-13，无 scheme 过滤），并对 absolute_path 显式放行 file:（:19）/把任意本地路径转 file://（:21-23）。一张被投毒的 character 卡把 avatar.url 设为 http://attacker/beacon.png?u=... → 加载即向攻击者发请求（暴露用户 IP / 在线状态 / 打开时间，可做追踪像素）；设为 file:///some/path 可探测本机文件是否存在（加载成功/失败差异）。落点是 <img src>，故 javascript: 不执行，但外联/探测可达。
mitigation：resolveAvatarSrc 对 url/path 做 scheme 白名单——本地头像应只接受 app 受控目录下的 file:// 或 data:（且 data 限 image/*）；远程 http(s) 头像要么禁用、要么走显式同意。红用例：导入含远程 url 头像的 character，断言渲染前不发外联请求。
注：character 导入/落库的来源校验属 dev-agents(清单6)；本条只管"渲染层不该把未过滤的 url 喂给 <img>"。
```

---

## 我学到的隐患

1. **`sanitize_html=false` 的真正含义被 prop 类型坑放大了。** react-showdown 的 `sanitizeHtml` 要的是清洗函数 `(html)=>string`，不是布尔开关。PuPu 把它当布尔默认成 `false`——即使有人"以为打开"传了 `true`，也只是个 truthy 值被当函数调用会直接抛错，等于这个清洗位从设计上就没接对。安全默认值不仅"默认关"，而且接口形状就不鼓励正确使用。

2. **威胁等级取决于渲染引擎，不能照搬"markdown 不清洗 = XSS"的口号。** 因为本仓走 react-showdown 的 `createElement` 路径而非 `dangerouslySetInnerHTML`，`<script>`/事件属性大概率被 React 挡掉，真正稳定可利用的是 `javascript:` 链接和 iframe/img 外联。判级前必须先确认"HTML 最终怎么进 DOM"——`dangerouslySetInnerHTML` vs `createElement` 是两个量级。

3. **`<img src>` 是被低估的外联面。** 即使 javascript: 在 img 里不执行，一个 attacker 控制的 `<img src=http://...>`（头像、artifact 图标、markdown 图片）就是零点击的追踪 beacon + 本地文件存在性探测。渲染层对每一个 src/href 都该过 scheme 白名单，而不只盯着"能不能执行脚本"。

4. **确认按钮这条线 PuPu 做对了，值得作为正面样板记住。** ConfirmInteract 的 label 和 onSubmit payload 全硬编码、不吃 frame 字段；pending frame 字段全部 typeof+trim 校验。这正是"确认控件不可被内容伪造"的正确姿势——任何未来给 interact 加"自定义按钮文案/动作来自帧"的需求，都要在这条红线前停下。
