---
name: theme-launch-readiness-verdict
description: 主题定制上线(0.1.9)的 UX 就绪度判断——机制就绪但覆盖率+缺对比度闸是门槛
metadata:
  type: project
---

2026-07-05 路线会评审 theme 定制作为 0.1.9 旗舰的就绪度。**编辑器机制已就绪，但两处让它"出街即翻车"的门槛必须先修。**

**已就绪（merged to dev）**：`theme_editor.js` 完整——preset 下拉(default/high_contrast 等 4 套)、light/dark 分页、9 语义 token color picker、live preview(写 CSS var)、import/export JSON、reset、sidebar/surface 自动派生(deriveTier，仅当 background 被显式改才派生)。

**门槛 1 — 覆盖率（真正的 gate）**：只有 **11 个文件** 消费 `var(--pupu-*)`，而 **122 个文件** 仍用裸 `isDark ? hex`。custom accent 只到 7 个文件。→ 用户设一个大胆主题时，shell + card/markdown/modal + 几个 settings 面被重绘，chat bubble / button / icon / toolkit card / 大部分 app 保持默认 = 视觉上"半刷漆"，读作 bug 不是"定制"。**Why**：迁移第一/二期只收口了能无损映射的锚点子集，~472 处/100 文件 CEO 押后。**How to apply**：主张 0.1.9 只放"微调档"预设(保守偏移，半刷也不露馅)，大胆自由定制押到覆盖率补齐后；或先补 chat bubble + button + icon 三个高频面再放开。

**门槛 2 — 无对比度闸**：编辑器/color_picker/storage 里**没有** contrast/luminance 校验(只有一个 high_contrast 预设名和一句注释)。用户可把 background 设成接近 text → 自己把 UII 刷瞎。**How to apply**：commit 时算 text↔background WCAG 比，<4.5 给非阻断警告 + "仍要用"。这是 owner(我)的活。

相关：[[team-roster]]（迁移落地交 pupu-dev-settings/相关 dev），user 侧 auto-memory theme-customization-project 有历史。
