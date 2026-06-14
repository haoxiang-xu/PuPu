---
name: security-render-sinks
description: chat-bubble 渲染层的安全攻击面与 react-showdown 真实威胁模型（SEC-001 调查结论）
metadata:
  type: project
---

chat-bubble 是 PuPu 边界③（模型/工具输出）的头号渲染 sink。SEC-INVESTIGATION-001 调查得出的关键事实，做任何渲染改动前都要记住：

**markdown 渲染的真实威胁模型（非显而易见，判级前必查）：**
- PuPu 走 `react-showdown` 且**不用 `dangerouslySetInnerHTML`**——它把 showdown 的 HTML 经 `htmlparser2.parseDOM` 再 `React.createElement(tag, attribs)` 渲染。
- 后果：`<script>`/事件属性多半被 React 渲染模型挡掉（**不是** `<script>`-级 XSS），但**稳定可利用**的是：① `<a href="javascript:...">` 点击执行；② `<iframe>/<img src>` 外联 beacon / 嵌入 / 本地文件探测。
- showdown 默认**透传原始内联 HTML** 且**不过滤链接 `javascript:`**。
- **`dangerouslySetInnerHTML` vs `createElement` 是两个量级**——判级前先确认 HTML 怎么进 DOM。

**Why:** 照搬"markdown 不清洗 = XSS"会误判 severity；本仓的 createElement 路径把危害收窄到链接/外联级。
**How to apply:** 改 markdown 渲染或新增任何 content-driven sink 时，按"javascript: 链接 + img/iframe 外联"评估，而非 script 注入。

**已 VERIFIED 的 finding（截至 2026-06-10）：**
- `markdown.js:174` `sanitize_html=false` 默认值，chat-bubble 渲染链全程不传 → 助手/工具/artifact markdown 全不清洗。**坑：react-showdown 的 `sanitizeHtml` prop 要的是清洗函数 `(html)=>string`，不是布尔；传 `true` 也无效。** 这是 BUILTIN 共享原语，修复必须报 CTO（见 [[team-roster]]）。
- `character_chat_bubble.js` `resolveAvatarSrc` 对 avatar url/path 无 scheme 过滤 → `<img src>` 外联 beacon / file:// 探测。character 是可分发信任配置。
- artifact 路径（plan_card/files_changed_card/generic_artifact_card）纯文本展示绝对路径 = 轻度信息泄漏。

**正面样板（别破坏）：** `ConfirmInteract` 按钮 label + onSubmit payload 全硬编码、不吃 frame 字段；`pending_confirmation_trace_frames.js` 帧字段全 typeof+trim 校验。这是"确认控件不可被内容伪造"的正确姿势——若未来要做"自定义按钮文案/动作来自帧"，在这条红线前停下，过 CTO。
**安全：** `artifact_kind_icon.js` 的 data:svg 经 `<img>` 加载，浏览器不执行其脚本。
