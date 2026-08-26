---
name: timeline-primitive-hazards
description: timeline 原语的两个静默失效点（point 槽被 isPassThrough 吞掉、未知 status 静默落 pending），以及它极小的真实改动半径
metadata:
  type: project
---

`src/BUILTIN_COMPONENTs/timeline/timeline.js` 有两处 **不报错、照常渲染、只是少了东西** 的失效点，二者都不在 `:727-745` 的对外 props 契约里，调用方无从发现。

1. **`point` 槽会被静默吞掉。** `:809` 的 `isPreset` 只匹配字符串 `"start"` / `"end"`；`:810` 的 `isPassThrough = !isFirst && !isLast && !isActive && !isPreset` 为真时，`:205` 整个不渲染 `pointEl` —— **包括调用方传入的自定义 ReactNode**。即：中间行 + `status` 非 `active` + 自定义 point ⇒ 点根本不出现。同文件 `:55-60` 的 `getPointRadius` 却 **认得** 自定义元素并为它预留 12×12 几何 —— 布局承认、可见性门不承认，这处内部不一致是判定它为遗漏而非取舍的依据。
2. **未知 `status` 静默落 `pending`。** `:34-48` 两个 resolver 的末行都是无保护兜底，任何不等于 `"done"` / `"active"` 的字符串（拼错的、未来新增的枚举成员）都被画成 pending，无 warn、无抛错。词汇表封闭于三值，**没有 error 态**，主题 JSON 里也没有任何 danger/error 键。

**改动半径比直觉小得多**：`Timeline`(v1) 全仓只有 **一个** 生产消费者（`COMPONENTs/chat-bubble/trace_chain.js`）加一个测试。另有 `timeline_v2/`（约 1000 行）读同一份 `theme.timeline` 块但 **零生产消费者**，且它没有抑制门、没有 `pointDoneColor` 分支、DotDefault 是实心圆 —— 任何 `theme.timeline` 的键增删会静默改变它。两个 timeline 目录 **都没有任何测试**（BUILTIN 下 40 个 test 无一覆盖）。

**Why**：2026-08-09 court case `0000-0005` 上，`expert-ux` 与 `code-owner-chat-bubble` 双方都在"圆点存在、只是颜色相近"的前提下论证了整整两轮，谁都没发现那一行在真实回合里连点都不渲染 —— 因为契约段里没写。

**How to apply**：有人提议"给某一行传个自定义 `point` 做区分"时，先确认那一行会不会是中间行；要让形状真正出现，得先对齐 `isPreset` 与 `getPointRadius`（**不要删 `isPassThrough`**，中间行不画默认小圆点是 v1 刻意的密度设计）。要在本边界建"再次沉默时会变红"的机制，形态应是扩 `theme/contrast_window.test.js`（已有全预设扫描 + 已有读者），而不是新建计数器 —— 本仓已两次证明写了没人读。相关：[[mini-ui-port-loss-verified]]
