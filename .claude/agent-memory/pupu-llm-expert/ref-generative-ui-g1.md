---
name: ref-generative-ui-g1
description: 愿景研究 G1——生成式UI SDK/产品(Vercel AI SDK/C1/Adaptive Cards/make-real)真实机制 + PuPu artifact 注册表对照
metadata:
  type: reference
---

愿景研究 G1：模型驱动/生成 UI 的工程现状,作为 CEO "ultra app / 任务专属直接操作 UI、弱化 text input" 愿景的参照系。核心轴 = 模型"选预制件填参"(A端) vs "现写代码"(B端)。引用前复核版本,API 名会漂移。

A 端(constrained/declarative,可控、可校验、不可注入,表达力受组件库上限):
- Vercel AI SDK Generative UI（ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces）：tool-use 视觉化。模型只选 tool+填参,人预写 React 组件,客户端按 `part.type==='tool-<name>'` 把 `part.output` 当 props。三态 input-available/output-available/output-error。服务端 streamText()→toUIMessageStreamResponse()→useChat 流式。交互回流偏弱(需 addToolResult/手动新一轮)。
- Microsoft Adaptive Cards（learn.microsoft.com/adaptive-cards + adaptivecards.microsoft.com）：可移植 JSON,typed 元素(TextBlock/Input.*/FactSet)+动作(Action.Submit/Execute/OpenUrl),宿主原生渲染。原则:"Purely declarative—no code allowed"、"Safe—不暴露 raw markup/scripting"。= 模型可安全 emit 的 UI DSL 范式。
- Thesys C1（docs.thesys.dev）：模型返回 C1 DSL（XML-like `<thinking>/<content>/<artifact>`),React `<C1Component>` 渲染成 Crayon 预制组件库。OpenAI 兼容(换 baseURL)——但这把生成UI绑死它的端点,对 PuPu 多 provider 错配。

B 端(open-ended,表达力无上限、产物黑盒只能 iframe 沙箱+一次性):
- tldraw make-real（github.com/tldraw/make-real/blob/main/app/prompt.ts）：截图→GPT-4V→现写单个自包含 HTML(内联 tailwind CDN+module script,末行必 </html>),塞 iframe。模型真写代码。Electron 里直吞=安全面。

双向回流(对 PuPu 最有借鉴):
- C1 onAction(event={type,params}):表单提交 type='continue_conversation',params 含双消息——llmFriendlyMessage(富上下文喂模型)+ humanFriendlyMessage(给用户看)。"一次交互产给人/给模型各一份"是干净契约,贴合 CEO"直接操作回喂精确意图"的最后一公里。
- Adaptive Cards Action.Submit 打包 Input.* 值回宿主。

PuPu 现状(已站 A 端起跑线):
- `src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js` = 预制 kind→卡片注册表。COMPATIBILITY_ARTIFACT_KIND_DEFAULTS 写死 file_diff/plan/table/kv/log/link/markdown;每 kind 带 fallbackRenderer(白名单 markdown/text/table/kv/log/link/json,未知退 json 不崩)+icon;catalog/toolkit 可动态注册新 kind 但 builtin 不可覆盖。与 Vercel "tool→预制组件" 同构。
- trace_chain.js(58KB)=工具调用/确认可视化;recipes_page/=agent builder 另一条腿。

落地判断:PuPu 不必从零发明生成式UI,已有 A 端骨架(只读 artifact)。最近一步演进 = 沿 Adaptive Cards 声明式安全模型 + C1 双向回流契约,把只读 artifact 升级为"可交互、意图回流"的任务专属面板;B 端现写代码须严格关在受控 DSL 之后(直吞代码=安全面,security-expert 守区)。Vercel/C1 的 SDK/hook(useChat、C1Component、Crayon)无法直接 import(PuPu 用 mini_react 自研 hook)——借机制/契约,不借包。

关联：[[a2a-channel-direction]]（多 agent/recipe builder 另一条腿）、[[tool-injection-path]]（artifact 是 tool 输出的渲染端）、[[team-roster]]（security-expert 守 iframe/代码执行面）
