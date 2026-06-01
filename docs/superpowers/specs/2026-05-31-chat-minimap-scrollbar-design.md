# 聊天区分段 Minimap 滚动条 — 设计文档

日期:2026-05-31
状态:待实施(已通过可视化原型评审)
原型:`docs/scrollbar-5d-final.html`(5D 描边窗 + sliding window 最终态)

## 1. 目标

把聊天消息区的滚动控件,从现在的全局细 overlay 条(`scrollable.js`,4px→6px pill thumb)替换为一个 **垂直分段 minimap**:

- 每条消息 = minimap 上一根竖条(pill),**竖向长度 ∝ 该消息的渲染高度**
- `user` 灰(淡)、`assistant` 蓝,一眼看出对话节奏
- 当前视口由一个 **1px pill 描边窗** 框住,四边间距一致,随滚动平滑移动
- minimap **接管**聊天区滚动(点击/拖动跳转);app 其余区域仍用 `scrollable.js`
- 超长对话:节点保持可辨识大小,minimap 内容**滑动(sliding window)**,上下用计数标注隐藏条数
- 极简、克制;唯二的 icon 是上下两颗导航 pill 里的箭头;idle 淡 → hover/滚动提亮 → 停手 1.2s 淡出

非目标:不改消息渲染、不改 windowing 的加载策略、不动全局 `scrollable.js` 对其它区域的行为。

## 2. 最终视觉规格(原型已锁定)

| 项 | 值 |
|---|---|
| 整列宽度 | minimap 轨道宽 `16px`,贴右 wall `right:3px`;外层 stack 宽 `22px` 容纳计数 |
| 刻度竖条 | 宽 `4px`,`border-radius:100px`(pill),长度 = `renderH × scale`,最小可辨识 `MIN_SEG≈7px` |
| 描边窗 | `1px` 边框,`border-radius:100px`(pill),高 = `视口高 × scale`,上下各外扩 `GAP=7px` |
| 四边间距 | 节点离框左右内边 ≈ `5px`;框上下各外扩 `GAP=7px`(上下 margin 略大于左右,首尾节点留白更足);`PAD=GAP+1=8px` 裁剪安全边距 |
| 导航 pill | 竖向 pill `16×24`,`border-radius:100px`,内含唯一 icon(chevron-up / chevron-down) |
| 计数标签 | `↑ N` / `↓ M`,`9px`,**超过 99 显示 `99+`**;仅 sliding(溢出)时显示 |
| 动效 | 框 top/height、minimap 滑动 translateY `.14s cubic-bezier(.22,.61,.36,1)`;提亮/淡出 `.25–.3s`;idle 淡出延迟 `1.2s` |
| 配色 dark | user(灰)`白0.13`→视口内 `白0.50`;assistant(蓝)`蓝0.40`→`蓝0.95`;框 `白0.28`,idle 框 `白0.12`;pill 底 `白0.12`/箭头 `白0.85`;计数 `白0.40` |
| 配色 light | user(灰)`黑0.12`→`黑0.42`;assistant(蓝)`蓝0.35`→`蓝0.85`;框 `黑0.25`,idle 框 `黑0.10`;pill 底 `黑0.10`/箭头 `黑0.70`;计数 `黑0.40` |
| 高亮判定 | in-view 范围严格 = `[scrollTop·scale, (scrollTop+clientHeight)·scale]`(不可用任何固定比例近似 — 原型踩过此坑) |

蓝 = `rgba(120,170,255,a)`(dark)/ `rgba(40,110,230,a)`(light)。

## 3. 关键约束:虚拟化(windowing)

聊天区是虚拟化渲染(`use_message_window_scroll.js`):

- 只渲染 `messages.slice(safeVisibleStart)`(初始 12 条,滚到顶批量 prepend 6 条,带 scroll 补偿)
- `el.scrollHeight` 只反映**当前窗口**,不是整段对话
- 窗口外消息**没有 DOM 节点**,无法直接量渲染高度

因此 minimap 不能照搬原型(原型里所有消息都在 DOM)。采用 **高度缓存 + 估算** 提供每条消息的高度,再在其上做 sliding window 布局。

## 4. 架构:高度缓存 + 估算

### 4.1 高度缓存
- `heightCacheRef: Map<messageId, number>`(px),挂在 hook 里,跨 re-render 保留。
- 每次 layout(`useLayoutEffect`,依赖 messages / safeVisibleStart;并用 `ResizeObserver` 监听内容变化以覆盖流式/图片加载),遍历 `messageNodeRefs`(index→node 已存在),把当前挂载节点真实高度按 message id 写入缓存。
- 用户滚过历史时缓存逐渐被真实值填满,minimap **自校正**。

### 4.2 估算未测量消息
- `estimateHeight(message)`:基于 `content.length` 的线性模型 `base + perChar × len`,每角色不同 base(气泡 padding 不同),并按"已测量样本的实际 char→px 斜率"动态校准(有样本用样本中位数,否则用保守默认)。
- 附件/图片消息加固定附加量;流式中的消息用其当前真实测量值。

### 4.3 几何(估算坐标系)
- `heights[i] = cache.get(id) ?? estimate(msg_i)`,`offset[i] = Σ_{j<i} heights[j]`,`H = Σ heights`。
- 几何随 messages/缓存变化记忆化重算,避免每帧累加。

## 4b. sliding window 布局(替代"塞满轨道")

轨道高度固定(≈视口高),若把所有消息压进轨道,长对话每段会变成亚像素、糊成一团、失去意义。改为 **保住节点大小 + 内容滑动**:

- `usable = trackH - 2·PAD`(实际绘制区,两端各留 PAD 不被裁)。
- `scale = max(usable / H, MIN_SEG / median(heights))` —— **装得下就铺满;装不下就保住中位节点 ≈ MIN_SEG 的可辨识大小**。
- `MH = H · scale`(minimap 内容总高)。`overflow = MH > usable`。
- **滑动**:`off = clamp(boxCenter − usable/2, 0, MH − usable)`,minimap 内容容器 `translateY(−off)`,始终把视口框带在轨道中部(像 VS Code minimap)。不溢出时 `off=0`。
- 段 i 绘制:`top = PAD + offset[i]·scale`,`height = max(3, heights[i]·scale − gap)`。

### 4b.1 视口框定位(窗口 → 绝对坐标)
窗口内第一条渲染消息 index = `safeVisibleStart`,节点 `node0.offsetTop` 是其窗口内像素位置:

```
absScrollTop ≈ offset[safeVisibleStart] + (el.scrollTop − node0.offsetTop)
```

- 框 `top = PAD + absScrollTop·scale − GAP`,`height = el.clientHeight·scale + 2·GAP`(上下外扩 GAP 使四边间距一致)。
- 框在 minimap 内容容器内,随 `translateY(−off)` 一起滑。
- 已渲染区严格准确;跨到从未滚到过的估算区有轻微漂移,滚过一次即被真实值取代。

### 4b.2 计数标签
- 可见窗口(content-scaled)= `[off, off + usable]`。
- `above` = 段完全在窗口上方的消息数;`below` = 完全在下方的消息数。
- `overflow` 时显示 `↑ cap(above)` / `↓ cap(below)`,`cap(n) = n>99 ? '99+' : n`;不溢出则隐藏。

### 4b.3 动态内边距(只在需要时给计数留位)
- 不溢出:stack 上下内边距用 `INSET_BASE`(只给 pill 让位,计数不占空间,**minimap 更长不被遮挡**)。
- 溢出:用 `INSET_COUNTS`(= base + 计数高度)。
- 先用 `INSET_BASE` 对应的 usable 判定 overflow,再据此设最终内边距并重算 scale/MH(单次,无递归);用数值 `stackH − 2·inset` 计算避免读取 transition 中的 clientHeight。

### 4c. 点击/拖动跳转(跨窗口)
- 指针 y → 轨道内 `rel = clamp(y − trackTop − PAD, 0, usable)` → `contentY = (rel + off)/scale` → 目标消息 index(`offset[]` 二分)。
- 若 `i ≥ safeVisibleStart`(已在窗口):`el.scrollTo({ top: node_i.offsetTop })`。
- 若 `i < safeVisibleStart`(窗口外):复用 hook 已有 **pending-action 模式**——把 `visibleStartIndex` 下调到 `max(0, i − buffer)`,在随后的 `useLayoutEffect` 等节点挂载后再 `scrollTo`。与现有 `handleSkipToTop` / `jumpToPreviousMessage` 同构。

### 4d. 上下对称导航 pill
- minimap 顶/底各一颗竖向 pill(`16×24`),内含唯一 icon(全特性仅此两个 icon,用户明确要求)。
- **go-to-top**(chevron-up):非顶部(`scrollTop > TOP_EDGE_THRESHOLD`)时从上方 `translateY(−5px)` 淡入;点击 → 复用 `handleSkipToTop`(含跨窗口展开)。
- **go-to-bottom**(chevron-down):非底部(`scrollHeight−(scrollTop+clientHeight) > BOTTOM_FOLLOW_THRESHOLD`)时从下方 `translateY(5px)` 淡入;点击 → 复用 `handleBackToBottom`。
- 替代原 `MessageJumpControls`(skip_up→go-to-top,skip_down→go-to-bottom;arrow_up「上一条」由 minimap 拖动/点击覆盖,舍弃)。

### 4e. 流式
最后一条消息高度持续增长 → 缓存值随 ResizeObserver/layout 更新 → 段尾与框跟着长。沿用现有"在底部则自动跟随"行为,不额外处理。

## 5. "接管" — 移除 overlay + 整合 jump controls

- 聊天滚动容器 **去掉 `className="scrollable"`**,使全局 `scrollable.js` 不再给它挂 overlay thumb。
- 仍需隐藏原生滚动条:`scrollable.js` 的隐藏 CSS 也绑 `.scrollable`,故给聊天容器加**新 class**(如 `chat-scroll-host`),由 minimap 组件注入一小段 `::-webkit-scrollbar{display:none}` + `scrollbar-width:none`(注入方式参照 `scrollable.js` 现有 `styleEl`,inline style 无法写伪元素)。
- 全局 `scrollable.js` 与 app 其它 `.scrollable` 区域 **完全不动**。
- **jump controls(已定)**:移除右下角 `MessageJumpControls`,导航统一到 minimap 上下 pill;`chat_messages.js` 不再渲染它,组件文件确认无其它引用后可删。

## 6. 组件与改动清单

新增:
- `src/COMPONENTs/chat-messages/components/message_minimap.js` — 纯展示组件(track + 滑动容器 + 刻度条 + 描边窗 + 上下 pill + 计数),inline style + `ConfigContext`。
- `src/COMPONENTs/chat-messages/hooks/use_message_minimap.js` — 高度缓存、估算、几何、sliding(scale/MH/off/usable)、absScrollTop 换算、计数、`scrollToMessageIndex`。独立 hook,保持单一职责。
- 对应 `*.test.js`。

修改:
- `use_message_window_scroll.js` — 暴露 minimap 所需:`heightCacheRef` 写入点(或测量回调)、`scrollToMessageIndex(i)`(封装跨窗口展开-再跳)、`safeVisibleStart` 与首节点 offset。改动集中在返回值与一个新 callback,**不动加载策略**。
- `chat_messages.js` — 用 `<MessageMinimap … />` 替换 `MessageJumpControls`(同样作绝对定位兄弟节点);透传 `handleSkipToTop`/`handleBackToBottom`/`isAtTop`/`isAtBottom` 给 pill;容器 class 由 `scrollable` 改为 `chat-scroll-host`。

不动:`scrollable.js`、`chat.js`(仅透传现有 props)、消息渲染、windowing 加载阈值。

## 7. 边界情况
- 空对话 / 单条:`messagesCount<=0` 时 minimap 返回 `null`。
- 内容未撑满视口(不可滚动):minimap 隐藏或仅显示淡刻度、不显框、不拦截点击。
- chat 切换:`chatId` 变 → 清空 `heightCacheRef`(高度按 chat 隔离)。
- 极长对话:几何 O(N) 累加 + 二分,N 通常 < 数百,仅在 messages/缓存/scroll 变化时算,记忆化;sliding 保证视觉始终可辨识。
- reduce-motion:尊重 `prefers-reduced-motion`,关闭 translateY/top/height 过渡。

## 8. 测试
- `use_message_minimap.test.js`:估算模型(含校准)、`offset[]`/`scale`(含 MIN_SEG 下限)/`MH`/`off`/`usable`、absScrollTop 换算、计数(含 99+ 封顶)、`scrollToMessageIndex` 窗口内/外两分支(mock pending-action)。
- `message_minimap.test.js`:角色配色映射、in-view 高亮范围 == 视口范围、四边间距(GAP/PAD)、动态内边距(溢出/不溢出)、pill 显隐与点击、空/不可滚动时不渲染。
- 回归:`pupu-test-api` 跑聊天生命周期 + 发消息,确认滚动/跟随/跳转不被破坏。

## 9. 风险
- **改 `use_message_window_scroll.js`** 是核心链。实施前**先跑 GitNexus 影响分析**(`gitnexus_impact({target:"useMessageWindowScroll", direction:"upstream"})` 与 `ChatMessages`),HIGH/CRITICAL 风险先报告。改动尽量"加法"(新增返回字段/回调),不改既有签名与加载逻辑。
- 估算漂移仅在"从未滚到过的历史区",滚过即修正,可接受。
- 流式高频 re-measure:ResizeObserver + rAF 节流,避免每 token 强制重排。
