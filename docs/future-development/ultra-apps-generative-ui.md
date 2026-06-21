# Ultra App 与生成式 UI —— 未来方向与契约

> **状态:愿景 / 讨论稿(2026-06-20)。** 一次 CEO 愿景会议的完整落档:方向、研究证据、专家收敛与架构契约。**非承诺实现计划,不含代码。** 所有"需要决定"的事项一律保持开放,留作后续讨论 —— 我们不在此 plan 死任何东西。
>
> **参会:** CEO、pupu-ux-designer(主讲)、pupu-llm-expert、pupu-cto、pupu-architect(契约 pass)。研究:1 轮 workflow、6 个 research agent(生成式 UI SDK / HCI 理论 / 可塑软件 / 领域范例 / PuPu 现状)。
>
> **姊妹篇:** [`always-on-agents.md`](./always-on-agents.md) —— 这是同一个 PuPu 的"两条腿",且在本文 §6 的回流契约处与之合流。
>
> **数字约定:** 论文/产品数字均标"需复核"(版本漂移 + 二手抽取)。

---

## 0. TL;DR

- **大图景:** 未来所有 app 都会变成 **"ultra app"——UI 不再是阻碍,app 能按用户需求即时变成它该有的样子**。
- **核心主张:弱化 text input。** 文字像 "AI 时代的 CLI":通用、上手快,但不是最高效。最高效的输入是**任务专属的直接操作 UI**(剪视频→时间线+音轨;改代码→定位代码+Android-Studio 式属性面板/color picker)。**文字负责高层/模糊/跨域意图,直接操作负责最后一公里的连续/空间/精确编辑。**
- **三方强收敛(比上一场还狠):** **砍掉"模型现写 UI 代码"**(谱第 3/D 档:Electron renderer 执行模型代码 = RCE 面、撞铁律、毁一致性)。生成边界钉在 **A/B/C 档 = 受约束的生成**:模型**从手写白名单精确控件里挑选 + 参数化**,不画像素。
- **两条反认知的好消息:** ①"mini_react"不是自研渲染器,是标准 React 19,**无渲染层障碍**;② PuPu **已经有** `artifact_kind_registry.js`(后端 catalog 驱动前端渲染 + 白名单退化),**已站在生成式 UI 谱系 A 端起跑线、且自验可行**,只是天花板钉死 7 个 renderer、且只读。**核心缺口只是一层"描述/schema → 白名单组件"的间接层。**
- **架构契约(架构师定案):** `ui_surface.v1`(声明式 UI spec)+ `ui_component_registry`(name→受控组件)+ `ui_edit_event.v1`(语义编辑回流)。**落位 = 第三契约面,不是第三条腿**:chat/recipe/always-on 共享一个 semantic surface 运行时。
- **两腿合流:** 一个控件 commit ≡ 一个 `ui_edit_event` ≡ 一个 `pupu.flow_event`(见姊妹篇)≡ always-on 腿上的一个 listener 事件。
- **变形必须带 gate:** 真实长尾里"普遍变形"只有 ~50.8% 胜率(策划任务才 84%)。简单 how-to 保持文字反而更好。
- **最小探针:** 就在当前 `feat/customizable-semantic-theme` 分支做"**主题 color picker**"——走 operable 全链路、但词汇表只发 1 个控件,把单向门踩在最小面上验证。

---

## 1. 愿景

### 1.1 Ultra app:UI 不再是阻碍
未来所有 app 按用户需求即时变成它该有的样子。AI 按需生成/切换出"恰当的、任务专属的直接操作界面",文字只是众多输入模式之一。

### 1.2 弱化 text input,但不是消灭它
CEO:文字 = "AI 时代的 CLI"。**方向对、措辞要修正**(研究 + LLM expert 共识):
- CLI 的本质是**精确**;文字的本质是**高歧义、高抽象**——所以类比反了一半。
- 准确框架:**文字 = 通用低带宽信道;直接操作 = 任务专属高带宽信道。胜负取决于"意图到动作之间有没有一个稳定、可空间化的对象"。**
- **直接操作碾压**:连续值(颜色/音量/时间码)、空间/几何选择、重复微调、即时可逆探索。
- **文字碾压**:抽象/模糊目标、歧义消解、跨域组合("把这视频配色应用到我 PPT")、反事实条件、目标尚无可见对象时的召唤。
- **内部口号应改为**:"文字=自然语言层,直接操作=精确执行层",否则团队会误以为文字低人一等而过度削弱它。
- CEO 的"最后一公里交给直接操作"恰好只用直接操作的长处、绕开其短板(不可组合/不可抽象),分工本身聪明。

---

## 2. 研究结论

### 2.1 生成式 UI 的可靠性谱系(约束越强越靠谱,表达力反之)
| 档 | 形态 | 代价 | 收益 | 代表 |
|---|---|---|---|---|
| **0 纯声明数据 DSL** | 模型只产 JSON UI 描述("no code allowed") | 表达力被 schema 锁死 | 可校验/可测/零注入面 | Adaptive Cards |
| **1 受控组件 DSL→预制件** | 模型产 DSL/tool-call → 映射预制组件 + 双消息回流 | 表达力受组件库上限 | 可校验 + 干净双向绑定 | Thesys C1 / Vercel AI SDK |
| **2 受限内容生成** | 单文件可交互物 / 区域级直接编辑 | 迭代靠重生成或沙箱面增大 | Canvas 区域编辑最贴"最后一公里" | Claude Artifacts / ChatGPT Canvas |
| **3 现写代码 + 真沙箱** | 模型现写 React/HTML 进 microVM/iframe | **产物即黑盒、必须真隔离、安全面最大** | 表达力无上限 | v0(Firecracker)/ bolt(WebContainer)/ tldraw make-real |

**可靠性断崖在 2→3(C→D)之间。** naive 端到端生成三病:inconsistency、wrong affordance、control deficiency。**PuPu 该押 0-2 档(A/B/C)。**

### 2.2 关键实证
- **GenUI**(arXiv 2508.19227,需复核):策划任务 84% win、最高 +72% 偏好;但**真实自带 query 仅 50.8% win / 41.1% loss**;**域分化**剧烈(数据分析 93.8% vs Advanced AI/ML 仅 50.0%)。→ **变形必须带 gate**,不是普遍更好。
- **DynaVis**(arXiv 2401.10880):NL + 动态合成的**持久** widget 混合,n=24 偏好混合 > 纯 NLI。
- **语义漂移**(arXiv 2601.19171,需复核):**迭代放大而非缩小 gulf**——每轮 refine 从"对上次输出的不完整理解"开始,设计原则跨轮丢失。**对策是语义中间层(结构化规格 + 透明分析),不是更强的端到端模型。**
- **两段式分工**:Cursor 用大模型 Sketching(意图)+ 自训小 Apply 模型(精确落点)——"生成意图"与"精确落点"是两种能力。

### 2.3 "最后一公里直接操作"的跨域工程范式(四领域收敛)
1. **两段式分工**:AI 做覆盖面广/批量的粗活,直接操作做逐对象精确锚定的精修。
2. **结构化可操作对象是硬前提**:Figma 落成可编辑图层、Cursor 落成 diff、v0 落成可点选 DOM、Descript 落成 transcript token——**产 blob 则精修不可达**。
3. **精修控件任务专属但形态可归类**:diff-hunk 裁决 / 属性面板+color picker / keyframe override / inline 点选 / 区域文本编辑。
4. **意图回流契约**:直接操作结果回喂 AI(C1 的 llmFriendly/humanFriendly 双消息)。
5. **暴露底层多少 = 精修天花板 vs 认知负荷的取舍**(Webflow 全暴露 vs Framer 藏玻璃后),需逐任务显式选定。
- AI 视频里时间线/轨道**没被取代**,反成"AI 漂移时的人工兜底层"(CapCut keyframe override / Runway keyframing 仍一等公民 / Descript transcript-as-UI)。

---

## 3. 专家开场收敛

### UX designer(主讲)
- **直接操作 vs 语言按"意图的形状"分工**,不按先进程度。
- **驯服"会变形 UI"的三原则**:① 稳定外壳 + 可变画布(召唤/撤销/历史/确认/"回到文字"永远固定,变形只在中间画布);② 可预测召唤 + 可解释变形(可关、可拒);③ 永远可逆、永远能退回文字。
- **"最后一公里"组织范式**:AI 提案 + 一个**作用域很窄**的精确手柄并置(别端出整个 Premiere)。
- PuPu 诊断:inline-style 反而**助力**程序化生成(样式即数据);真缺口是"**没有画布概念**"和"**没有稳定外壳**"——第一步是把"对话流"和"可操作画布"在布局上分家。

### CTO
- **延伸非转向**,与 always-on/recipe 那条腿**共用脊椎**(一个 recipe 应能声明它召唤哪个操作 UI)。
- **砍掉"模型现写 UI 代码"**:RCE 面 + 撞安全信任边界。务实形态 = **schema-driven 的"AI 召唤预制操作面板"**(模型产结构化指令,不产代码),复用现有 tool-use/streaming 帧契约。
- **最小探针 = 主题 color picker**(当前分支,独立可发、风险自包含、直接验证"拖比打字准")。

### LLM expert
- **"intent→哪个 UI"是三层级联**:① 路由(function-calling,**注意模型偏向文字这一失败模式**)② 参数填充(structured output,**生产可用**)③ 生成层(风险敞口)。别拿第 3 档给整件事定价。
- **四档谱系,断崖在 C→D**(同 §2.1)。
- **最被低估的难点 = UI→模型的状态回流**(不是模型→UI)。推荐**语义化编辑事件流**(把"色温 5000K→6500K"反向编译回语言),省 token、契合模型;**且一个编辑事件本质就是一个 listener 事件**(咬合 always-on 腿)。
- 坚持**先有 eval 再有承诺**:modality 路由准确率、参数填充 schema 符合率、回流意图理解率。

---

## 4. PuPu 现状差距图(研究勘明,纯映射不推荐)

| 能力 | 现有 | 缺口 | 约束 |
|---|---|---|---|
| 动态挂载任意组件树 | **已有**:标准 React 19 + reconciler(非自研 VDOM) | 无底层障碍 | — |
| **描述/schema → 组件 的间接层** | **缺**(全仓无 component-map/renderer-by-name) | **核心缺口** | JS-only=只能"产 props/schema→实例化白名单组件",不能现编译 JSX |
| 模型可调用的组件白名单注册表 | **半有**:`artifact_kind_registry.js` 验证可行,但只 7 renderer | 扩到"N 组件 + 受控 props schema" | 无 TS=props 靠运行时校验 |
| 富内容/活卡片 | **已有但只读**:artifact-summary、GenericArtifactCard | 不可变快照,模型只能填数据选不了组件 | kind 白名单钉死 `artifact_kind_registry.js:7` |
| 字符串/标签→自定义活组件 | **有先例但关着**:`markdown.js` components(`think→ThinkBlock`) | 主路径 `seamless_markdown.js` 不传 components、主动把 HTML 当文本抑制 | inline-style=助力 |
| 配置→可直接操作活 UI | **已有成品**:`flow_editor.js`(nodes/edges + render_node)、recipe_canvas | 渲染分发是 JS 端 switch,type 非模型驱动 | 节点类型预定义 |
| 任务专属控件原语 | **齐**:color_picker / timeline / explorer / bar_chart / scatter / select / context_menu | 无统一 name→component 注册表 | — |
| UI 交互回灌 AI | **已有血管**:`onToolConfirmationDecision`/`onContinuationDecision`→回 Flask | 无 C1 式双消息契约 | 不必新建 IPC |
| 现写代码+沙箱(谱第 3 档) | **缺**:Electron 桌面端,无 Firecracker/WebContainer 等价物 | 最大工程缺口 + 安全面 | renderer 永不碰 ipcRenderer |

> **"ultra app"在 PuPu 是第三样东西**:现有两条腿(artifact 只读快照 / recipe 人手搭 graph)都不直接指向"一句意图→当场生成可操作界面";但上面四条接入缝是现有机制的延长线。

---

## 5. 架构契约(架构师定案)

### 5.1 `ui_surface.v1` —— 声明契约
模型产**纯声明 JSON**(类 Adaptive Cards / C1 DSL,**不产 JSX/代码**)。每个 surface 带 `mode: snapshot | operable | mixed`:
```
ui_surface.v1 {
  surface_id, mode,
  components: [ { id, component, component_version, props, events: [{name, action}] } ]
}
```
把 `artifact_kind_registry` 的"7 renderer"泛化成 **`ui_component_registry`**:`name → { React组件, props JSON schema, allowed events, event normalizer, capability flags, version }`。注册表住前端(artifact render 目录旁),schema **可导出给 Flask 做双重校验**(Flask 发出前 reject 非法 spec,前端挂载前再校验)。**只读卡片与可操作控件同一契约**——artifact summary 即 `mode:snapshot, events:[]`,不另起系统。

### 5.2 `ui_edit_event.v1` —— 回流契约(两腿合流点)
控件产**语义编辑事件**(非 raw DOM state):
```
ui_edit_event.v1 {
  event_id, surface_id, component_id, action, value,
  llmFriendly: { text, data },   // 喂模型
  humanFriendly: { summary },    // 给人
  causality
}
```
走**现成 `onToolConfirmationDecision` 血管**,新增 payload kind `ui.semantic_edit`,不另起 callback。Flask 收到后**立刻包成 `pupu.flow_event.v1`**(姊妹篇)。于是 **一个控件 commit ≡ 一个 flow_event ≡ always-on 腿上的一个 listener 事件**。preview/drag 中间态留本地,除非注册表显式声明为语义事件。

### 5.3 落位 = 第三契约面,不是第三条腿
chat / recipe / always-on 共享一个 **semantic surface 运行时**:`model intent → ui_surface spec → 白名单 renderer → ui_edit_event → flow_event ledger`。chat 在 bubble 挂 surface,recipe 在可变画布挂同一 surface,always-on 只吃 flow_event。**语义中间层跨桥两侧**:Flask 管路由/结构化生成/校验/包 ledger,renderer 管注册表/受控挂载/事件归一化。**无新长期 owner**;若 surface runtime 长大到需专人,再拉 pupu-hr-head 共评。

### 5.4 架构师在 Codex 之上的两处 PuPu 加判
- **no-TS 校验必须 fail-closed**:任一 prop 不过 schema → 整个 component 降级惰性占位,**绝不 best-effort 渲染部分 props**;无 schema 的 name → reject 整个 surface。校验器是受信前端代码,非生成物。
- **真正的单向门是 `snapshot → operable`,比词汇表更早**:今天 artifact 只读;一旦发布**任何** operable 控件 = 宣布"生成式 UI 可改应用状态",回流+安全边界即刻定型。故 **M0 探针就走 operable 全链路,但词汇表只发 1 个控件**,把单向门踩在最小面上验证。

### 5.5 结构性单向门(改不起)
1. **组件词汇表 append-only**:`color_picker@1` + props schema 一旦发布,语义不可变,只能加 `@2`(用户/recipe 一旦依赖即成约)。
2. **安全边界永久**:生成物只能实例化已注册 component + 发 `ui_edit_event.v1`,**永不能碰 preload API / ipcRenderer / 任意函数 / 运行时 JSX / 未注册事件通道**。renderer 无沙箱,这条比 v0/bolt 更硬。

---

## 6. "会变形的 UI"的风险与对策
| 风险 | 机制 | 对策 |
|---|---|---|
| **语义漂移(头号)** | 迭代放大 gulf,设计原则跨轮丢失 | **语义中间层**(结构化规格 + 透明分析) |
| 可学习性碎片化 | 同一意图每次生成不同 UI,毁肌肉记忆 | **稳定组件词汇表**(同类意图复用同套控件) |
| 控制感下降 | 界面自己动 | 稳定外壳 + 逃生通道(退回文字/上一版) |
| 错误 affordance / 幻觉控件 | naive 生成三病 | 受控词汇表 + fail-closed 校验 |
| 简单场景过度工程 | easy how-to 加 UI 反增认知负荷 | **变形带 gate**:复杂/结构化/交互式才变 |
| **安全(PuPu 特有)** | Electron 端生成 UI 触达系统能力,外部沙箱不可移植 | §5.5 单向门 2;v0 AutoFix 式"产出当不可信输入流式校验";security-expert 早期定边界 |

---

## 7. 最小探针(讨论态,未动工)
**主题 color picker** —— 当前 `feat/customizable-semantic-theme` 分支:用户说"侧栏暖一点"→ 模型产 `ui_surface.v1`(`mode:operable`,1 个 `color_picker` 控件)→ 用户拖 → `ui_edit_event` → 写主题 token。
- 走 **operable 全链路**(踩 snapshot→operable 单向门),但**词汇表只发 1 个控件**(最小面)。
- 独立可发版、风险自包含(只写主题 token,不碰聊天主干)、直接验证"拖比打字准"核心假设。
- 角色:dev-agents / ux(复用 PuPu 现有控件)+ backend(校验/包 ledger)+ security(operable 边界)。

---

## 8. 开放问题(全部留待后续讨论,非阻塞)
1. **Gate 判定器长什么样**:"何时该变形 vs 保持文本"的判定信号(query 类型/域/有无可空间化对象)——与姊妹篇的打扰判定器/cheap-gate 是同一类"何时该动"问题。
2. **Electron 生成 UI 能触达什么的安全边界**:operable 控件要"直接操作"(剪视频/改文件)就触达系统能力,暴露面/沙箱/谁守(security-expert)需一手定义。
3. **谱的哪一档与多 provider 抽象兼容**:各 provider 能否一致产出受控 schema;"借机制不借包"借到什么粒度。
4. **两条腿是否需两种 malleability**:chat 用完即走 vs recipe 伪常驻;chat 侧控件状态要不要跨会话留存。
5. **两段式分工(意图 vs 落点)在 PuPu 是否成立**:谁产 schema、谁做精确落点、是否需独立"落点"能力。
6. **稳定词汇表 vs 完全即时定制**:CEO 的"即时变成该有的样子"偏后者,实证全指向前者——取舍点在哪(逐任务/逐域)。
7. **成功判据**:真实长尾 ~50.8% win 下,衡量生成式 UI 成功的指标(偏好率/任务完成/认知负荷)与 gate 之外的验证回路。

---

## 9. 附录:出处
- **生成式 UI SDK**:Vercel AI SDK Generative UI、Microsoft Adaptive Cards(`adaptivecards.io`)、Thesys C1、tldraw make-real。
- **HCI 理论/实证**:Hutchins/Hollan/Norman 1985(两条 gulf)、Shneiderman 直接操作三原则、DynaVis(arXiv 2401.10880)、GenUI(arXiv 2508.19227)、语义引导生成(arXiv 2601.19171)。
- **可塑软件/artifacts**:Claude Artifacts、ChatGPT Canvas、v0(Firecracker)、bolt(WebContainer)、Ink & Switch *Malleable Software*。
- **领域范例**:CapCut / Runway Aleph / Descript(视频)、Figma First Draft / Webflow / Framer(设计)、Cursor(Sketching+Apply)/ Android Studio Layout Editor / v0(IDE/前端)。
- **PuPu 取证**:`src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js:7,167`、`seamless_markdown.js`、`markdown.js`、`flow_editor.js`、`recipe_canvas.js`;`onToolConfirmationDecision`(trace_chain)。
- **更深一手取证**散落在 agent-memory(`pupu-llm-expert/*`、`pupu-architect/generative-ui-contract.md`)。

---

*愿景落档,非承诺路线。下一步(若推进)= 选定探针 → 走正式 spec/plan。所有数字落地前复核一手。*
