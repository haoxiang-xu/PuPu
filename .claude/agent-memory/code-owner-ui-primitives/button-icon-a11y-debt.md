---
name: button-icon-a11y-debt
description: Button 的 ariaLabel 槽位早就有但 81/100 个 icon-only 调用点没传；焦点态是结构性无出口；button.js 零测试
metadata:
  type: project
---

**`BUILTIN_COMPONENTs/input/button.js` 上有两类 a11y 债，归属相反 —— 一类是调用方的，一类只能修在原语。**

**Why:** 2026-08-07 案 `0000-0003` 里 `expert-ux` 与 `code-owner-chat-bubble` 把「四个图标按钮可访问名恒为空」判为原语缺陷。实测后归属要拆：

- **可访问名 = 调用方缺陷。** `ariaLabel` prop 从 props 文档到 `aria-label={ariaLabel}` 落点都在，还逐字写着 "accessible name for icon-only buttons"。我扫了全仓：**100 个 icon-only `<Button>`，81 个没传（81%）**。缺最多的是 `PAGEs/demo/show_room_demo/chat_showroom.js`(11)、`textfield_demo.js`(6)、`chat-input/components/attach_panel.js`(5)，**其中 4 个在我自己的 `BUILTIN_COMPONENTs/electron/title_bar.js` 里**（窗口最小化/最大化/关闭/恢复）。失效的是"靠调用方自觉"这个机制，不是原语的出口 —— 所以修法是原语层加 dev-only 告警 + 测试，不是逐个补 4 个。
- **焦点可见 = 原语缺陷，结构性无出口。** `outline: "none"` 写死，且 `DEFAULT_BUTTON_STYLE.state` 只有 hover/active/disabled 三槽、`resolveStateStyle` 也只读这三个 —— **没有 focus 通道，调用方没有入口**（只能整体覆盖 `root.outline`，会连带改掉鼠标态）。
- **`disabled` 用原生属性** → 移出 tab order 且不向 AT 播报。改成 `aria-disabled` + 拦截激活会改变全部 100+ 调用点的键盘行为，半径过大，别顺手做。
- **`Icon` 的 props 透传不对称**：`...props` 只展开在"图标未加载完"那一帧的占位 `<div>` 上，四个解析后分支全不展开。症状是「本地看着生效、真跑起来没了」—— 从调用方给内联 SVG 补 a11y 属性这条路是堵的。

**How to apply:**
- 新增 icon-only 按钮一律传 `ariaLabel`。
- 要加守卫就照抄 `theme/shell_background_guard.test.js` 的形状：内容锚定豁免表 + "精确一次匹配"（0 次=锚点烂了、2+ 次=豁免被复制），两个失效方向都封死。
- **`button.js` 至今没有 `button.test.js`** —— 同目录的 slider / spinner_button / tag_input / segmented_button 都有。它是本仓消费最广的原语之一，零覆盖。动它之前先补测试。
