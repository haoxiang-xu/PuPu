---
name: button-primitive-styling-contract
description: BUILTIN Button 的实际样式契约 —— ghost 默认在无卡片表面上没有可供性、三个系统性缺口(无 focus 态/disabled 夺焦/无 ref 与任意 props 透传)，以及主操作 chip 的抄写模板
metadata:
  type: project
---

`src/BUILTIN_COMPONENTs/input/button.js` 是 PuPu 唯一的按钮基元（CEO 三准则第一条要求必须复用它）。但"用了 Button"≠"设计对了" —— 2026-08-04 boot overlay 评审时把它的实际契约挖穿了，记下来免得每次重查。

**默认形态是 ghost，不是主操作形态。** `computedRootStyle` 里 `background: "transparent"`、无边框、无描边，静息态完全看不见，只有 hover 才浮出底色。放在有 card/surface 承托的地方没问题；**放在满屏底色（boot overlay、空状态、全屏引导）上，它读起来就是一行纯文字**——正好撞上"禁 transparent 裸文字链"那条规矩的精神面。判据：这个按钮周围有没有一块 surface？没有就必须给静息底色。

**主操作 chip 的抄写模板**（先例 `settings/app_update.js`、`local_storage/components/confirm_delete_modal.js`，boot overlay 已验收采用）：
```js
style={{
  fontSize: 13, paddingVertical: 7, paddingHorizontal: 16, borderRadius: 7,
  root: { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" },
  color: <semantic.text>,
  hoverBackgroundColor:  isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
  activeBackgroundColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.14)",
}}
```
`fontSize` **必须显式传 13**：默认是 16，会比 13px 的正文还大，层级倒挂。`root.backgroundColor` 能盖住 `background:"transparent"` 是因为二者是不同 CSS 属性且 key 顺序在后，这是先例里久经验证的写法，不是巧合。

**暗色 hover 通常不必自己传。** `default_mini_theme.json` 的 `dark_mode.button` 已给 `hoverBackgroundColor: rgba(255,255,255,0.08)` / `color: #CCCCCC`；`theme.button` 会 deepMerge 覆盖 `DEFAULT_BUTTON_STYLE` 里那套 light-only 的黑色 wash。所以"暗色记得传 hoverBackgroundColor"的真实含义是**为可供性传更强的值**，而不是为了修暗色 bug。前提：组件挂载时 `theme` 已解析（`ConfigContainer` 在 `isThemeBooting` 期间不渲染 children，所以正常都成立）。

**三个系统性缺口（改任何一个都是共享基元 HIGH risk，须先跑 impact）：**
1. **没有 focus 态。** `outline:"none"` 且状态机只有 hover/active/disabled —— 全 PuPu 的按钮键盘聚焦零视觉反馈。作用域内的绕法：出现时用 ref 自动聚焦，别指望焦点环。
2. **`disabled` 会夺焦。** 点击后置 disabled → 焦点掉 `<body>`，键盘用户被困。**忙碌态永远不要用 `disabled`**，改成保持 enabled + handler 里做重入 guard。
3. **不透传 ref，也不透传任意 props**（只认 `ariaLabel`/`title`/`style`/`disabled`/`onClick` 等白名单）。要拿 DOM 或挂 aria-* 只能套一层 wrapper div + `querySelector("button")`。

**`ariaLabel` 是给 icon-only 用的，别给有可见 label 的按钮传** —— 它会**覆盖**可访问名，导致可访问名不含可见文字（WCAG 2.5.3 Label in Name 违规，语音控制点不动），而且 label 后续变化读屏永远听不到。

**wrapper 上的 `aria-busy` 不是忙碌态的解。** 若 wrapper 位于 `role="alert"` 子树内，`aria-busy=true` 反而**抑制**该子树的播报，把本该播报的状态吃掉。正解：让 label 文本自己变（可访问名随之变），由外层 live region 播报。

相关：[[feedback-design-principles]]、[[color-system-three-parallel-layers]]、[[theme-contrast-measured-bounds]]。
