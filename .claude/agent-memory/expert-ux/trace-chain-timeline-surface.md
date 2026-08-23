---
name: trace-chain-timeline-surface
description: trace chain / timeline 这块面的实测事实 —— 状态编码为零、调色不跟随主题、detail 按钮四项不达标；动它之前先读这条
metadata:
  type: project
---

2026-08-08 case `0000-0005-2026-0807` 出庭时对 `timeline` + `trace_chain` 做的全量实测。revision `b2385d5d`。**这块面每次有人要"加个状态"都会撞上下面四条，先读再动。**

## 一 · 这块面今天的有效状态编码数量是 1，不是 2

`Timeline` item 的 `status` 只有 `done` / `active` / `pending` 三值，**没有 error 态**（`timeline.js:742` 的 props 文档）。memory_v2 那一项只区分 `Unavailable → pending`，其余三态全落 `done`。

**但那次区分在用户面上不存在**。`done` 与 `pending` 的全部差别是 `pointDoneColor` 0.22 与 `pointPendingColor` 0.18 的 alpha 差，作用在一个 10×10 透明圆的 **1px 描边** 上：

| | light on `#ffffff` | dark on `#121212` |
|---|---|---|
| `done` | **1.69:1** | **1.99:1** |
| `pending` | **1.53:1** | **1.72:1** |

四个值全部低于 SC 1.4.11 的 3:1，两态差值远低于可辨阈。**结论：不要把"照 Unavailable 的做法再来一个"当成可行的低成本处置 —— 那是在照抄一个不工作的东西。**

底色可以直接用 `--pupu-background`：**assistant 气泡不上底色**（`chat_bubble.js:170-176` 只在 `isUser && !isEditing` 时上色）。

## 二 · `theme.timeline` 不在语义 token 的覆盖表内

`applySemanticPaletteToTheme`（`theme_semantic.js:211-303`）覆写 icon / font / input / select / modal / switch / code / textfield / markdown —— **不含 `timeline`**。故整条 trace chain 的点、线、标题、span、detail 按钮取的是 `default_mini_theme.json` 里的固定 alpha 灰，**不跟随用户自定义主题**。

后果：在这块面上放一个走 `--pupu-danger` 的元素，会得到"周围不跟随、这一个跟随"的不一致。**这是已知的、可接受的**，但要主动交代，别让人当 bug 报。

登记项，未处置。归 `code-owner-shared-arteries`（`CONTAINERs/config/`）＋ `code-owner-ui-primitives`（消费侧）。

## 三 · `detail` 按钮：四项不达标，且 hover 反向

`timeline.js:281-320`。它是通往任何 `details` 内容的唯一控件：

- `outline:"none"`，**无任何替代焦点样式**（内联样式，没有伪类可用）→ SC 2.4.7 不满足
- 无 `aria-expanded` / `aria-controls`，可访问名只有 `detail` / `hide` → SC 4.1.2 不满足
- `padding:"0"`，有效目标约 **45×18px** → SC 2.5.8（24×24）不满足
- 静息 **2.44:1 / 3.21:1**（11px，不算大字号）→ SC 1.4.3 不满足；**hover 把 opacity 降到 0.6 → 1.65:1 / 1.92:1，越靠近越暗**

**直接的设计后果**：**任何把信号放进展开态的方案等于把它放进一个没人打开的抽屉。** 信号必须在默认折叠态上成立。展开后的内容本身是合格的（`AuditRow` 值实测 8.74:1 / 10.48:1）—— **失效在可达性，不在可读性。**

另：title 与 span 都是 `userSelect:"none"`，用户想把看到的状态词复制给我们只能截图。

## 四 · 错误标记的形态已经存在，就在同一个文件里

`trace_chain.js:545-567` 有 `ErrorPoint`（16×16 实心圆＋感叹号 svg），已被 `:1747` 使用；`trace_chain.js` 里共有 **六个** 自定义 point 元素在用 timeline 的 `point` 槽。**memory_v2 那一次 `grouped.push` 只是没传 `point`。**

同一目录的 `memory_v2_trace_audit.js:199` 已在用 `var(--pupu-danger, #c44)` 配 `role="alert"`；`memory_v2_journal_reload.js:574` 有 `role="status"` 的先例。

**所以"这块面没有形态可以挂载"这句话是错的 —— 形态在，只是没被用。** 遇到这个说法直接指这两处。

**但别连 `#ef4444` 一起抄**：那是裸 hex、单值双主题、绕过 `theme.semantic.danger`。既有债（归 `code-owner-chat-bubble`），复用形状不复用颜色。

相关：[[four-state-presentation-doctrine]]、[[status-color-shape-over-color]]、[[color-system-three-parallel-layers]]、[[button-primitive-styling-contract]]。
