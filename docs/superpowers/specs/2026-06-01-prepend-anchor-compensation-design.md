# Prepend Anchor 持续补偿 — 设计文档

日期:2026-06-01
状态:待实施(已通过 systematic-debugging 根因确认 + brainstorming 评审)

## 1. 问题

聊天区用 sliding window(虚拟化)。向上滚看历史时,**滚动着会突然抖一下**,感觉是"加载出来的瞬间位置移动"。

## 2. 根因(已用运行时证据 + 代码确认)

- 向上滚到距顶 `top_load_threshold=80px` 时,`use_message_window_scroll.js` 的 `loadOlderMessages` 一次性 **prepend** `load_batch_size=6` 条更早消息。
- 其中 code / markdown「重内容」消息由 `src/COMPONENTs/chat-bubble/components/seamless_markdown.js` 渲染:**先以轻量占位符挂载**(`return <div>{content}</div>`,纯文本 pre-wrap),再通过 `IntersectionObserver` + `scheduleIdleUpgrade`(idle callback)**异步升级**为完整 `<Markdown>`(code 高亮 / 表格 / 标题边距)。升级后该消息**变高**。
- 现有补偿在 `useLayoutEffect` 里:prepend 那一帧用 `delta = el.scrollHeight - previousScrollHeight` 把 `el.scrollTop = previousScrollTop + delta` 补一次。但此时重内容还是占位高度。几帧后异步升级撑高 → 新增高度全在视口**上方**(prepend = 更早 = 在上)→ 视口下方内容下移 = **抖**。
- 纯文本消息(`isHeavyContent` 为 false)同步渲染 `<Markdown>`,无升级、不抖。证据:纯文本长对话 prepend 后逐帧追踪 scrollTop 在补偿后 30 帧纹丝不动;含 190 个 code 元素的对话才出现问题。minimap 框本身不抖(等比跟随内容)。

## 3. 方案:anchor 元素持续补偿

把"一次性 delta 补偿"升级为"**锁定 anchor 元素,持续把它钉回原屏幕位置,直到高度稳定**"。

### 3.1 核心思想
prepend 发生时记住当前视口顶部那条消息节点 = anchor,及它距视口顶的偏移 = `anchorOffset`。之后只要内容高度变化(含异步升级),就把 scrollTop 调到让 anchor 回到 `anchorOffset` 处。anchor 上方插入多少、升级撑高多少全自动吸收;下方变化不影响 `anchor.offsetTop`,**天然只对上方变化生效,无需判断方向**。

### 3.2 数据流(一次 prepend 生命周期)
```
1. 用户向上滚 → handleScroll 命中 top_load_threshold
2. loadOlderMessages():prepend 前先算并存 anchor 信息,再 prepend 6 条
   anchorIndex  = prepend 前视口顶部首条可见消息的绝对 index
   anchorOffset = anchorNode.offsetTop - el.scrollTop   // 距视口顶距离
3. React 提交新 DOM(重内容为占位符形态)
4. useLayoutEffect(现有补偿块,非底部分支):
   - 保留现有第一帧 delta 补偿(立即稳住)
   - 末尾调 beginCompensation({ anchorIndex, anchorOffset }) 接管后续异步增长
5. beginCompensation:ResizeObserver.observe(inner 内容容器),每次回调:
   const node = messageNodeRefs.current.get(anchorIndex)
   if (!node) return
   if (isAtBottomRef.current) { stop(); return }   // 底部跟随优先,不补
   const target = node.offsetTop - anchorOffset
   if (Math.abs(el.scrollTop - target) > 0.5) el.scrollTop = target
6. 停止条件(双保险,任一满足即 disconnect):
   - 连续 3 次 RO 回调高度无变化(稳定)
   - 自启动起 800ms 超时
   - 用户主动接管:el 上 wheel / touchstart / pointerdown 立即 disconnect
```

### 3.3 为什么 anchor 比 delta 累加鲁棒
- **方向无关**:anchor 上方任何增减都改变 `node.offsetTop` → target 跟着变 → anchor 屏幕位置恒定;下方变化不动 anchor.offsetTop → 不补。无需判断增长来自哪侧。
- **抗多次升级**:6 条里多条 code 消息在不同 idle tick 分别升级,每次 RO 都触发、都把 anchor 钉回,天然正确叠加。

## 4. 关键实现细节(防坑)
1. **anchor 信息在 prepend 前存**:`loadOlderMessages` 的 `setVisibleStartIndex` 回调里、写 `prependCompensationRef.current` 时一并算 `anchorIndex` / `anchorOffset`(此刻 DOM 仍是 prepend 前状态)。anchorIndex 取 `messageNodeRefs` 中 `offsetTop` 最接近且 ≤ `scrollTop` 的已渲染节点的绝对 index(即视口顶部那条)。
2. **anchor 节点常驻**:prepend 只在顶部新增、不卸载已渲染节点,anchor 不会消失;RO 回调仍加 `if (!node) return` 兜底。
3. **用户接管优先**:补偿期间监听 `el` 的 `wheel` / `touchstart` / `pointerdown`,任一触发立即 `stop()`(disconnect + 清监听 + 清超时),把控制权还给用户,避免卡手。
4. **防重入 / 防二次 prepend**:补偿期间 scrollTop 被钉住,一般不会再命中 top_load_threshold;沿用 `prependCompensationRef` 风格标志,补偿进行中不触发新的 `loadOlderMessages`(现有 `handleScroll` 已有 `!prependCompensationRef.current` 守卫,需确保新补偿期间该守卫等效成立——见 §4.6)。
5. **底部跟随优先**:`isAtBottom` 为 true 直接不启动 / 立即 stop。`isAtBottom` 经 ref 镜像传入,避免闭包过期。
6. **与现有一次性补偿协作**:现有 `useLayoutEffect` 的 delta 补偿(第一帧)保留;新 hook 接续后续帧。为避免补偿期间 `handleScroll` 因被钉住的 scrollTop 抖动而误触发,beginCompensation 启动时设、stop 时清一个 `isCompensatingRef`,`handleScroll` 的加载守卫追加 `&& !isCompensatingRef.current`。

## 5. 文件与改动
新增:
- `src/COMPONENTs/chat-messages/hooks/use_prepend_anchor.js`(~60 行,单一职责)
  - 入参:`{ messagesRef, messageNodeRefs, isAtBottomRef, isCompensatingRef }`
  - 返回:`beginCompensation({ anchorIndex, anchorOffset })`
  - 内部:ResizeObserver + 连续 3 帧稳定检测 + 800ms 超时 + wheel/touchstart/pointerdown 接管监听 + cleanup
- `src/COMPONENTs/chat-messages/hooks/use_prepend_anchor.test.js`

修改:
- `src/COMPONENTs/chat-messages/hooks/use_message_window_scroll.js`
  - 新增 `isAtBottomRef`(镜像 `isAtBottom`)、`isCompensatingRef`
  - `loadOlderMessages`:`prependCompensationRef.current` 增 `anchorIndex` / `anchorOffset`
  - `handleScroll` 加载守卫追加 `&& !isCompensatingRef.current`
  - `useLayoutEffect` 非底部补偿分支末尾调 `beginCompensation(...)`
  - 引入 `usePrependAnchor`

不动:消息渲染、`seamless_markdown.js`(升级机制本身正确,只吸收其高度变化)、minimap、windowing 加载策略与阈值。

## 6. 边界情况
- prepend 后立刻又到顶(继续向上):补偿稳定后正常,下一次向上滚再触发新一轮 prepend + 新 anchor。
- anchor 是最后一条(理论不会,prepend 取的是视口顶部):RO 回调兜底 `!node` 直接 return。
- 不支持 ResizeObserver 的环境:`typeof ResizeObserver !== "function"` 时跳过持续补偿,退化为现有一次性补偿(不崩、最多偶发抖)。
- reduce-motion:本方案改的是 scrollTop 即时赋值(非动画),不涉及。

## 7. 测试
- `use_prepend_anchor.test.js`(纯逻辑,jsdom 可测):
  - mock `el`(可读写 scrollTop / scrollHeight)、`messageNodeRefs`(可改 anchorNode.offsetTop)、手动触发 RO 回调。
  - 断言:anchor 升高(offsetTop 增大)后 scrollTop 跟到 `offsetTop - anchorOffset`;`isAtBottomRef=true` 时不补;连续 3 帧无变化后 disconnect;800ms 超时 disconnect;触发 wheel 后立即 disconnect。
- 运行时(pupu-test-api):在 code-heavy 长对话(28 条 / 190 code 元素,windowing 生效)向上滚触发 prepend,逐帧追踪 scrollTop —— 升级撑高后**无二次漂移**(对比修复前的漂移)。注意合成 scroll 难稳定触发 prepend,需配合真实交互或放宽触发。

## 8. 风险
- 改 `use_message_window_scroll.js`(核心滚动 hook)。改动尽量加法:新增 ref + 守卫追加 + 末尾调用,不改既有 delta 补偿与加载逻辑。
- 补偿与浏览器原生 scroll anchoring 可能叠加:必要时在 `.chat-scroll-host` 设 `overflow-anchor: none` 让我们完全接管(实施时验证是否需要)。
- ResizeObserver 高频回调:稳定检测 + 超时确保有限生命周期,不长期占用。
