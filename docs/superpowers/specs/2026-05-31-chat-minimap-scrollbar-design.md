# 聊天区分段 Minimap 滚动条 — 设计文档

日期:2026-05-31
状态:待实施(已通过可视化原型评审)
原型:`docs/scrollbar-5d-final.html`(5D 描边窗最终态)

## 1. 目标

把聊天消息区的滚动控件,从现在的全局细 overlay 条(`scrollable.js`,4px→6px pill thumb)替换为一个 **垂直分段 minimap**:

- 整段对话的每条消息 = minimap 上一根竖条(pill),**竖向长度 ∝ 该消息的渲染高度**
- `user` 灰(淡)、`assistant` 蓝,一眼看出对话节奏
- 当前视口由一个 **1px pill 描边窗** 框住,随滚动平滑移动
- minimap **接管**聊天区滚动(点击/拖动跳转);app 其余区域仍用 `scrollable.js`
- 极简、克制、无 icon;idle 淡 → hover/滚动提亮 → 停手 1.2s 淡出

非目标:不改消息渲染、不改 windowing 的加载策略、不动全局 `scrollable.js` 对其它区域的行为。

## 2. 最终视觉规格(原型已锁定)

| 项 | 值 |
|---|---|
| 整列宽度 | `16px`,贴右 wall `right:8px` |
| 刻度竖条 | 宽 `4px`,`border-radius:100px`(pill),长度 = `渲染高度 × scale`,最小 `3px` |
| 描边窗 | `1px` 边框,`border-radius:100px`(pill),高 = `视口高 × scale`(`+6px` 视觉余量) |
| 动效 | top/height `.14s cubic-bezier(.22,.61,.36,1)`;提亮/淡出 `.25–.3s`;idle 淡出延迟 `1.2s` |
| 配色 dark | user(灰)idle `白0.13`→视口内 `白0.50`;assistant(蓝)idle `蓝0.40`→视口内 `蓝0.95`;框 `白0.28`,idle 框 `白0.12` |
| 配色 light | user(灰)`黑0.12`→`黑0.42`;assistant(蓝)`蓝0.35`→`蓝0.85`;框 `黑0.25`,idle 框 `黑0.10` |
| 高亮判定 | in-view 范围严格 = `[scrollTop·scale, (scrollTop+clientHeight)·scale]`,与描边窗同一范围(不可用任何固定比例近似 — 原型踩过此坑) |

蓝 = `rgba(120,170,255,a)`(dark)/ `rgba(40,110,230,a)`(light)。

## 3. 关键约束:虚拟化(windowing)

聊天区是虚拟化渲染(`use_message_window_scroll.js`):

- 只渲染 `messages.slice(safeVisibleStart)`(初始 12 条,滚到顶批量 prepend 6 条,带 scroll 补偿)
- `el.scrollHeight` 只反映**当前窗口**,不是整段对话
- 窗口外消息**没有 DOM 节点**,无法直接量渲染高度

因此 minimap 不能照搬原型(原型里所有消息都在 DOM)。采用 **高度缓存 + 估算** 方案。

## 4. 架构:高度缓存 + 估算

### 4.1 高度缓存
- `heightCacheRef: Map<messageId, number>`(px),挂在 hook 里,跨 re-render 保留。
- 每次 layout(`useLayoutEffect`,依赖 messages / safeVisibleStart;并用 `ResizeObserver` 监听内容变化以覆盖流式/图片加载),遍历 `messageNodeRefs`(index→node 已存在),把当前挂载节点的真实高度按 message id 写入缓存。
- 这样用户滚过历史时,缓存逐渐被真实值填满,minimap **自校正**。

### 4.2 估算未测量消息
- 对没量过的消息,用 `estimateHeight(message)`:基于 `content.length` 的线性模型 `base + perChar × len`,带每角色不同 base(user/assistant 气泡 padding 不同),并按"已测量样本的实际 char→px 斜率"动态校准(有样本就用样本中位数,没有就用保守默认)。
- 附件/图片消息:加固定附加量(每附件一个估算块高度);流式中的消息直接用其当前真实测量值。

### 4.3 几何计算(全部在估算坐标系里)
- `heights[i] = cache.get(id) ?? estimate(msg_i)`,`offset[i] = Σ_{j<i} heights[j]`,`H = Σ heights`。
- `scale = trackPx / H`。
- 段 i:`top = offset[i] × scale`,`height = max(3, heights[i] × scale)`。

### 4.4 视口框定位(窗口 → 绝对坐标换算)
窗口内第一条渲染消息 index = `safeVisibleStart`,其节点 `node0.offsetTop` 是它在窗口里的像素位置。当前绝对滚动量:

```
absScrollTop ≈ offset[safeVisibleStart] + (el.scrollTop - node0.offsetTop)
```

- 框 `top = absScrollTop × scale`,`height = el.clientHeight × scale`。
- 因为估算坐标系与真实窗口坐标系在已渲染区是一致的(用真实高度),框在可见区内严格准确;跨到估算区(还没滚到过的历史)会有轻微漂移,滚过一次即被真实值取代。

### 4.5 点击/拖动跳转(跨窗口)
点击/拖动 minimap → 目标比例 `r` → 目标消息 index `i`(在 `offset[]` 上二分)。

- 若 `i ≥ safeVisibleStart`(已在窗口):`el.scrollTo({ top: node_i.offsetTop })`。
- 若 `i < safeVisibleStart`(在窗口外):复用 hook 已有的 **pending-action 模式**——把 `visibleStartIndex` 下调到 `max(0, i - buffer)`,在随后的 `useLayoutEffect` 里等节点挂载后再 `scrollTo` 到该节点。这与现有 `handleSkipToTop` / `jumpToPreviousMessage` 的展开-再跳逻辑同构。

### 4.6 流式
流式时最后一条消息高度持续增长 → 其缓存值随 ResizeObserver/每帧 layout 更新 → 段尾与框跟着长。沿用现有"在底部则自动跟随到底"的行为,不额外处理。

## 4b. 超长对话:分桶(bucketing)+ 段数上限

minimap 轨道高度固定(≈视口高),可分辨的段数有物理上限。对话很长时每条一段会变成亚像素、糊成一团。

- 设段数上限 `SEG_CAP`(≈ `floor(trackPx / 5)`,演示用 90)。
- `units.length ≤ SEG_CAP`:每条消息一段(原方案)。
- 超过:`per = ceil(N / SEG_CAP)`,相邻 `per` 条合并为一个桶。桶高 = 桶内消息渲染高度之和(用同一高度缓存),桶色 = 桶内主导角色(user 过半则灰,否则蓝)。
- minimap **始终只画 ≤ SEG_CAP 段、始终非全量**;DOM 仍 windowing 不变。
- 点击/拖动按比例 → 绝对位置 → 落到对应消息 index(分桶不影响 §4.5 的跳转,仍按 `offset[]` 二分到具体消息)。
- `offset[]`/桶划分记忆化,仅在 messages 或高度缓存变化时重算。

## 4c. 上下对称导航 pill

minimap 顶/底各一颗 `22px` pill,内含唯一的 chevron SVG(全特性仅此 icon,用户明确要求):

- **go-to-top**(顶部,chevron-up):非顶部(`scrollTop > TOP_EDGE_THRESHOLD`)时从上方 `translateY(-6px)` 淡入;点击 → `scrollToTop('smooth')`(复用 hook 的 `handleSkipToTop`,含跨窗口展开)。
- **go-to-bottom**(底部,chevron-down):非底部(`scrollHeight - (scrollTop+clientHeight) > BOTTOM_FOLLOW_THRESHOLD`)时从下方 `translateY(6px)` 淡入;点击 → `handleBackToBottom`(含跨窗口展开)。
- 二者完全对称,替代原 `MessageJumpControls`(其 skip_up=go-to-top,skip_down=go-to-bottom;arrow_up「上一条」能力由 minimap 拖动/点击覆盖,舍弃)。
- 配色:dark pill 底 `白0.10`/箭头 `白0.85`;light 底 `黑0.08`/箭头 `黑0.70`。

## 5. "接管" — 移除 overlay + 整合 jump controls

- 聊天滚动容器 **去掉 `className="scrollable"`**,使全局 `scrollable.js` 不再给它挂 overlay thumb。
- 但仍需隐藏原生滚动条:`scrollable.js` 的隐藏 CSS 也是绑 `.scrollable` 的,所以给聊天容器加一个**新 class**(如 `chat-scroll-host`),由 minimap 组件注入一小段 `::-webkit-scrollbar{display:none}` + `scrollbar-width:none`(注入方式参照 `scrollable.js` 现有 `styleEl` 注入,inline style 无法写伪元素)。
- 全局 `scrollable.js` 与 app 其它 `.scrollable` 区域 **完全不动**。
- **jump controls 整合(已定)**:移除右下角 `MessageJumpControls`。其"跳到顶部 / 回到底部"由 minimap 上下对称 pill(§4c)替代;"上一条"舍弃。`chat_messages.js` 不再渲染 `MessageJumpControls`,组件文件可删除或留作未用(实施时确认无其它引用)。

## 6. 组件与改动清单

新增:
- `src/COMPONENTs/chat-messages/components/message_minimap.js` — 纯展示组件(track + 刻度条 + 描边窗 + 交互),inline style + `ConfigContext`。
- `src/COMPONENTs/chat-messages/hooks/use_message_minimap.js` — 高度缓存、估算、几何、绝对坐标换算、`scrollToMessageIndex`。(或并入现有 hook;倾向独立 hook 保持单一职责。)
- 对应 `*.test.js`。

修改:
- `use_message_window_scroll.js` — 暴露 minimap 所需:`heightCacheRef` 写入点(或返回测量回调)、`scrollToMessageIndex(i)`(封装跨窗口展开-再跳)、`absScrollTop`/几何所需的 `safeVisibleStart` 与首节点 offset。改动集中在返回值与一个新 callback,不动加载策略。
- `chat_messages.js` — 用 `<MessageMinimap … />` 替换 `MessageJumpControls`(同样作绝对定位兄弟节点);把现有的 `handleSkipToTop`/`handleBackToBottom`/`isAtTop`/`isAtBottom` 透传给 minimap 的上下 pill(复用现成逻辑,含跨窗口展开);容器 class 由 `scrollable` 改为 `chat-scroll-host`。

不动:`scrollable.js`、`chat.js`(仅透传现有 props)、消息渲染、windowing 加载阈值。

## 7. 边界情况
- 空对话 / 单条:`messagesCount<=0` 时 minimap 返回 `null`(同 jump controls)。
- 内容未撑满视口(不可滚动):minimap 隐藏或仅显示淡刻度、不显框,且不拦截点击。
- chat 切换:`chatId` 变 → 清空 `heightCacheRef`(高度按 chat 隔离)。
- 极长对话:几何是 O(N) 累加 + 二分查找,N 为消息数(通常 < 数百),每帧仅在 scroll/resize 时算,成本可忽略;必要时对 `offset[]` 做记忆化,仅在 messages/缓存变化时重算。
- reduce-motion:尊重 `prefers-reduced-motion`,关闭 top/height 过渡。

## 8. 测试
- `use_message_minimap.test.js`:估算模型(含校准)、`offset[]`/`scale` 计算、absScrollTop 换算、`scrollToMessageIndex` 的窗口内/外两分支(mock pending-action)。
- `message_minimap.test.js`:角色配色映射、in-view 高亮范围 == 视口范围、空/不可滚动时不渲染、点击比例→index 映射。
- 回归:沿用 `pupu-test-api` 跑聊天生命周期 + 发消息,确认滚动/跟随/jump controls 不被破坏。

## 9. 风险
- **改 `use_message_window_scroll.js`** 是这条链的核心。实施前**先跑 GitNexus 影响分析**(`gitnexus_impact({target:"useMessageWindowScroll", direction:"upstream"})` 与 `ChatMessages`),HIGH/CRITICAL 风险先报告。改动尽量做"加法"(新增返回字段/回调),避免改既有签名与加载逻辑。
- 估算漂移仅出现在"从未滚到过的历史区",且滚过即修正;可接受。
- 流式高频 re-measure:用 ResizeObserver + rAF 节流,避免每 token 强制重排放大。
