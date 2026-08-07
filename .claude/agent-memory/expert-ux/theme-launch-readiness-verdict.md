---
name: theme-launch-readiness-verdict
description: 主题定制就绪度——覆盖率门槛已大幅缓解(2026-08 复核 66 文件消费变量)，对比度闸至今仍未做
metadata:
  type: project
---

2026-07-05 路线会评审 theme 定制作为 0.1.9 旗舰的就绪度，判定两道"出街即翻车"门槛。**2026-08-01 复核后状态更新如下。**

**已就绪**：`theme_editor.js` 完整——preset 下拉(9 套)、light/dark 分页、9 语义 token color picker、live preview、import/export JSON、reset、sidebar/surface 自动派生(deriveTier，仅当 background 被显式改才派生)、Explorer 折叠树 + auto 徽章。

**门槛 1 — 覆盖率：已大幅缓解，不再是 gate**。2026-08-01 实测：**66 个文件**消费 `var(--pupu-*)`(2026-07-05 时只有 11 个)；仍有 143 文件用 `isDark ?` 三元、118 文件含裸 hex(总 410 个非测试 js)。外壳/模态/卡面/输入面已收口，剩余债集中在中性叠加(hover/按压/发丝线)与文字灰阶，属"档位缺名"而非"没接主题"。**How to apply**：不要再引用"11/122"这个旧数字劝阻放开定制；新的阻力点是缺具名档位导致迁移无词汇可用。

**门槛 2 — 对比度闸：代码仍未做，但方案已冻结、形态被 CEO 改掉了**。编辑器/color_picker/storage 里至今没有任何 contrast/luminance 校验(唯一的 WCAG 实现在 `semantic_tokens.test.js` 里，只管 preset，不管用户自定义)。用户可把 background 设成接近 text 自己刷瞎。
**2026-08-04 更新**：CEO 否掉"提交后非阻断警告条"这个形态，改为 **picker 级硬限制 —— 用户在选色器里直接选不到不合格的颜色**。冻结口径见 [[theme-taxonomy-v2-frozen-decisions]]，阈值依据见 [[theme-contrast-measured-bounds]]。
**How to apply**：不要再提"警告 + 仍要用"那一套；也不要凭直觉定阈值(3:1 对状态色是错的，会让默认主题出厂即非法)。"自动派生值必须硬钳位"这一条**原样保留**并扩展到 JSON 导入。

相关：[[team-roster]]、[[feedback-design-principles]]；user 侧 auto-memory `theme-customization-project` 有历史决策。
