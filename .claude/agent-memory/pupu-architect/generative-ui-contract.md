---
name: generative-ui-contract
description: 生成式UI(ultra app)契约定案——ui_surface.v1 声明契约 + ui_edit_event.v1 回流 + 落位为第三契约面而非第三条腿;单向门=组件词汇表append-only+安全边界
metadata:
  type: project
---

2026-06-20 ultra app/生成式UI 愿景会·契约pass。CTO/UX/LLM-expert 三方已收敛(砍模型写码档/稳定外壳+可变画布/受约束生成/三层级联),把契约 punt 给我。我定契约,Codex(architect)深推一次后我在两处 PuPu 约束上加判。

**Why:** 北极星=ultra app,模型从手写白名单控件挑选+参数化,绝不画像素。和 always-on/recipe 共用脊椎(延伸非转向)。最被低估难点=UI→模型状态回流。头号风险=语义漂移(对策是插语义中间层,非更强端到端模型)。PuPu 比 web 同行(v0/bolt 假设浏览器/云沙箱)更早撞安全墙。

**How to apply:** 任何动 artifact_kind_registry、动态挂载白名单组件、UI→Flask 回流、生成式 UI 落位的设计,以本条为基线契约。和 [[listener-node-and-boulders]] 的 flow_event.v1 envelope 咬合。

## 1) ui_surface.v1(声明契约)
模型产纯声明 JSON(类 Adaptive Cards / C1 DSL),不产 JSX/代码。关键字段:schema / surface_id / mode(snapshot|operable|mixed) / origin{conversation_id,message_id,recipe_id,artifact_id} / components[]{id,component,component_version,props,events[]{name,action}}。
artifact_kind_registry 的"7 renderer"泛化成 ui_component_registry:name → {React组件, props JSON schema, allowed events, event normalizer, capability flags, version}。
注册表住前端(artifact render directory 旁),但 schema 必须可导出给 Flask,做"双重校验":Flask 在发给 Electron 前 reject 非法 spec,前端挂载前再校验一次。
只读卡片 + 可操作控件同一契约,区别只在 mode 与已注册 capabilities。artifact summary = mode:snapshot + events:[]。不另起"generated artifact"系统。

## 2) ui_edit_event.v1(回流契约)
控件 listener 产一个语义编辑事件(非 raw DOM state):schema / event_id / surface_id / component_id / action / value / llmFriendly{text,data} / humanFriendly{summary} / causality{correlation_id}。C1 双消息(llmFriendly/humanFriendly)落这里。
走现成 onToolConfirmationDecision/onContinuationDecision 血管,新增 payload kind `ui.semantic_edit`(decision + payload),不另起 component callback。
Flask 立刻包成 pupu.flow_event.v1(source:pupu.ui, actor:user, payload.kind:ui.semantic_edit, payload.data=ui_edit_event)。一个控件 commit = 一个 flow_event。preview/drag/中间态留本地,除非注册表显式声明为语义事件。

## 3) 落位 = 第三契约面,不是第三条腿
不是 chat 腿也不是 recipe 腿。是 chat/recipe/always-on 共享的 semantic surface 运行时:
model intent → ui_surface spec → 白名单 renderer → ui_edit_event → flow_event ledger。
chat 在 bubble 里挂 surface;recipe 在可变画布挂同一个 surface;always-on/listener 只消费 flow_event.v1。
语义中间层跨桥两侧:Flask 管路由/结构化生成/校验/包 ledger;renderer 管注册表/受控挂载/事件归一化。

## 我在 Codex 之上的两处加判(PuPu 专属约束)
- **no-TS 校验必须 fail-closed**:props 运行时校验,任一 prop 不过 schema → 整个 component 降级到惰性占位(显示"无法渲染"),绝不 best-effort 渲染部分 props。校验器是受信前端代码(非生成物)。无 schema 的 component name → reject 整个 surface。
- **snapshot→operable 是真单向门(比词汇表更早)**:今天 artifact 是只读快照。一旦发布任何 mode:operable 控件,就等于宣布"生成式 UI 可改应用状态",回流契约+安全边界即刻定型,撤不回。建议 M0 探针(主题 color picker)就走 operable 全链路(产 ui_edit_event→flow_event),但词汇表只发 1 个控件——把单向门踩在最小面上验证,而不是先做一堆 snapshot 再补 operable。

## 单向门(改不起)
1. **组件词汇表 append-only**:color_picker@1 + 其 props schema 一旦发布,语义不可变,只能加 @2。用户/recipe 一旦依赖某控件契约,该契约本身成单向门。
2. **生成 UI 的安全边界**:生成物只能实例化已注册 component + 发 ui_edit_event.v1。永不能碰 preload API/ipcRenderer/任意函数/运行时 JSX/未注册事件通道。PuPu 在 renderer 执行环境无沙箱,这条比 web 同行更硬。

可逆:具体控件实现、Flask route 命名、surface 在 bubble/canvas 的视觉、首批控件选哪几个、JSON schema 校验库选型。

## 我与 CTO、LLM-expert 的立场
比 CTO 想要的"面板多通用/能力宽"克制:M0 只发 1 个 operable 控件,把 snapshot→operable 单向门踩在最小面上验证,而非先铺宽面。
比 LLM-expert 想要的"契约多自由"收紧:契约只允许声明式选择+参数化,fail-closed 校验,绝不给端到端生成留口子——因为语义漂移的解药是更强的中间层,不是更自由的模型。两条都指向同一原则:运行时骨架(ui_surface/ui_edit_event/flow_event 契约 + fail-closed 校验)早定,用户可见控件面晚铺。
