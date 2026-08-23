---
name: semantic-alpha-ladder-unused-and-unguarded
description: --pupu-text-* alpha 阶梯已发货但几乎零消费者，且 alpha 步不受可读性窗口约束；只有 0.75 一档在 9 套预设下恒过 AA
metadata:
  type: project
---

**`--pupu-text-{muted,strong,secondary,faint,disabled}` 六个变量今天无条件挂在 `document.documentElement` 上，但业务代码基本没在用；而且它们不受任何对比度护栏保护。**

**Why:** 2026-08-07 案 `0000-0003` 取证时实测三件事：

1. **消费者接近零** —— 全仓 `src/**/*.js`（排除测试）只有 `settings/appearance/theme_editor.js` 引用 3 处（`text-faint` ×2、`text-secondary` ×1）；`text-muted` / `text-strong` / `text-disabled` **零消费者**。这套阶梯是"建好了没人用"的状态，第一个真实业务消费者会把它的缺陷全暴露。
2. **alpha 步无可读性窗口** —— `contrast_window.js` 的 `roleWindow` 对 shell / text / textMuted / 5 个 hue 各返回窗口，对 alpha 步一律 `return []`（末行注释成文）。而 alpha 值本身可被用户经 `details` 通道覆写（`resolveThemeDetails`：user > preset > default）。**root 被夹在窗口里，由 root 派生的每一个 alpha 步都不被夹。**
3. **9 预设 × 2 mode × 3 shell 全扫描**（我 2026-08-07 实测，前景恒为该预设 `text`）：

| alpha | 全预设最差对比度 | AA 4.5:1 |
|---|---|---|
| `0.75 / 0.75` | **5.04:1**（nord/dark/surface） | 通过 |
| `0.72 / 0.68`（出厂 text-secondary） | 4.31:1（nord/light/background） | 差 0.2 |
| `0.60 / 0.62` | 3.69:1 | 不通过 |
| `0.38 / 0.35`（出厂 text-faint） | 1.93:1 | 严重不通过 |

恒过 AA 的最小固定 alpha：dark `0.69`、light `0.70`（含 sidebar 时 light `0.71`）。

**How to apply:**
- 任何"淡一点的正文"取值，**只用 `0.75` 这一档**。在默认预设上调出来的 `0.6` 档会在 nord / ocean 上失效，且失效静默 —— 本仓没有任何测试约束前景对比度（`shell_background_guard` 只管背景 sink 且只认不透明字面量，`color:` + `rgba(...,0.28)` 两个判据都不命中）。
- **时效**：`enable_theme_color_customization` 的 `defaultValue` 是 `false`（`SERVICEs/feature_flags.js`），所以生产里今天只有 default 一套调色板 —— 上表是前瞻性风险。**该 flag 翻开的那天它变成当前缺陷，届时先重跑这张扫描表。**
- 相关：[[theme-runtime-resolution-trap]]
