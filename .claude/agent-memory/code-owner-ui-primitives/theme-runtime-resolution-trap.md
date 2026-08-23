---
name: theme-runtime-resolution-trap
description: default_mini_theme.json 的颜色键在运行时被语义 palette 全量覆盖 —— 读该 JSON 取值会算错底色/前景，主题自定义 flag 关闭也一样覆盖
metadata:
  type: project
---

**`src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` 里被语义 palette 覆盖的键，在生产中永远读不到。读它取值 = 算错。**

**Why:** 2026-08-07 案 `0000-0003` 里，`expert-ux` 整套对比度论证（E-0070/E-0071/E-0074）建立在「默认主题无 `semantic` 段，故 JSON fallback 生效」上。该前提不成立 —— `CONTAINERs/config/container.js` 的 `applyContainerThemeConfig` 在 `enable_theme_color_customization` **关闭** 时不是跳过语义解析，而是用 `defaultThemeColorSettings()`（preset `"default"`）走同一条路，所以 `theme.semantic` **从首帧起恒满**。一位领域鉴定专家在正式庭审里踩了这个坑，说明它不可靠地"读代码就能推出来"。

实际差额（默认 preset，我在 2026-08-07 实测）：

| 取值 | JSON 里写的 | 运行时真值 |
|---|---|---|
| modal panel 底 dark | `#1E1E1E` | **`#121212`**（`semantic.background`，不是 surface） |
| `theme.color` dark | `#CCCCCC` | **`#ffffff`**（`semantic.text`） |

**How to apply:**
- 要任何主题取值，读 `theme_semantic.js` 的 `applySemanticPaletteToTheme` 看该键有没有被覆盖；被覆盖的以 `semantic_tokens.js` 的 `SEMANTIC_DEFAULTS` / `SEMANTIC_PRESETS` 为准。
- **绝不往 `default_mini_theme.json` 加新颜色键**：`applySemanticPaletteToTheme` 不认识它 → 造出一个永远不跟用户主题走的死值。这个 bug 形态在 v2 之前发生过两次（`switch` 轨道灰、`markdown.pre` 背景），成文记录在 `theme_semantic.js` 的注释里。
- 新取值一律走 `--pupu-*` 语义通道。相关：[[semantic-alpha-ladder-unused-and-unguarded]]
