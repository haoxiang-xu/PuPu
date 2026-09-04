---
name: status-color-shape-over-color
description: 状态信号在 PuPu 必须由形状承载、颜色只作强化 —— 出厂 danger 在 nord 暗色对 background 只有 3.05:1，余量 0.05
metadata:
  type: feedback
---

**规则：在 PuPu 给任何状态设计视觉编码时，把信号压在 *形状* 上（图标 / 点形 / 结构），颜色只作强化，绝不作为唯一通道。**

**Why:** 2026-08-08 为 case `0000-0005-2026-0807` 跑了全 9 套出厂预设 × 2 模式的 `danger` 对比度扫描（`semantic_tokens.js` 的 `SEMANTIC_DEFAULTS` + `SEMANTIC_PRESETS`）。结果：

| 核算面 | 出厂下界 | 出处 | 对 3:1 |
|---|---|---|---|
| **`danger ↔ background`** | **3.05:1** | `nord` 暗色 `#bf616a` on `#2e3440` | 满足，**余量 0.05** |
| `danger ↔ sidebar` | 2.46:1 | `nord` 暗色 | **不满足** |
| `danger ↔ surface` | **2.11:1** | `nord` 暗色 `#bf616a` on `#434c5e` | **不满足** |

`default` 预设是 4.53:1 / 6.77:1 —— **只量 default 会得到偏乐观的数，必须跑全预设。** 次低的几档（warm/violet/ocean/graphite 亮色对 sidebar）在 3.97–4.12，**`nord` 暗色是唯一的绑定约束**。

即：**一个只靠颜色编码的状态信号，在我们自己的出厂预设上就已经处于合规边缘（sidebar / surface 上直接不合规）。而换一个形状的圆点在任何预设上都成立。**

**How to apply:**
- 出规格时，形状差异写成硬要求，颜色写成"强化"。验收数字挂在形状上，不挂在颜色上。
- **核算底色必须写明。** 同一个前景色对 `background` / `sidebar` / `surface` 能差出 1 个整档。先确认那块面坐在哪个外壳上再算（例：assistant 气泡不上底色 → 坐在 `background`，是三者里最宽松的一档）。
- **别把这条与既有主题护栏的 1.9:1 搞混。** 护栏（见 [[theme-contrast-measured-bounds]]）管"用户改到什么程度会被拦下"，核算面含 `sidebar`；本条管"我们新增的呈现要达到什么"。**新增严于兼容是对的**，两者不冲突 —— 但被问到时要能一句话说清，否则看起来像自相矛盾。
- 复算公式：WCAG 2.x 相对亮度，半透明前景先按 `α·前景 + (1−α)·底色` 合成再算。

相关：[[theme-contrast-measured-bounds]]、[[trace-chain-timeline-surface]]、[[four-state-presentation-doctrine]]。
