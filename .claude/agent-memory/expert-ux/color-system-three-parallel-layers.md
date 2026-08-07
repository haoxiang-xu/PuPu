---
name: color-system-three-parallel-layers
description: PuPu 颜色不是一套是三套并行(semantic tokens / mini_theme 86叶 / 组件自建);实测数字与"档位缺名"的量化证据
metadata:
  type: project
---

2026-08-04 全局颜色审计实测(423 个非测试 js)。**PuPu 的颜色不是"一套 token + 一堆待迁移散落点",而是三套并行体系。** 这是理解任何主题工作的前提。

**体系 A — semantic tokens**：9 个 key → `--pupu-*` CSS 变量。70 文件 / 446 处消费。其中 **297 处(67%)是 `rgba(var(--pupu-text-rgb),α)`** —— 即中性叠加，不是真正的"9 色"消费。

**体系 B — `BUILTIN_COMPONENTs/theme/default_mini_theme.json`**：一棵**已经存在的深层树**，86 个颜色叶/模式，路径式命名(`select.group.headerColor`、`timeline.pointDoneColor`、`flow_editor.edgeAddBtnHoverColor`)。`applySemanticPaletteToTheme` 只接管 **22 片**，**64 片主题失明**(改自定义主题它们不动)。orphan 大户：flow_editor 15、select 8、timeline 8、markdown 6、scatter 6、modal 5。
→ **CEO 要的"更细致的 explorer tree"，数据形状在这个文件里已经有了**，缺的是把它接到色源上。

**体系 C — 组件自建局部 palette**：1178 处裸 hex、1748 处中性叠加。

**核心量化发现 —— 档位缺名(不是"没接主题")**：
1748 处中性叠加(`rgba(255,255,255,α)` / `rgba(0,0,0,α)` / `rgba(var(--pupu-text-rgb),α)`)用了 **73 个不同的 α 值**，但坍缩成 **8 个语义档**：
hairline<0.06(234) / subtle 0.055-0.09(384) / hover 0.09-0.16(225) / press 0.16-0.28(105) / divider-disabled 0.28-0.42(295) / muted 0.42-0.60(219) / secondary 0.60-0.80(130) / near-primary 0.80+(156)。
mini_theme 里 37 对黑白叠加中 **15 对 light/dark alpha 完全相同** —— 即 `rgba(var(--pupu-text-rgb),α)` 的精确 drop-in。

**结构性约束(动 taxonomy 前必读)**：
- `semantic_tokens.test.js` 断言 **"no child is itself a family root"** → 当前 taxonomy 被**硬锁在 2 层**。做 3 层树必须改这条断言，是 test-enforced 门。
- 同文件断言 `SEMANTIC_TOKEN_KEYS` 精确等于那 9 个，且**每个 preset 必须定义每个 key** → **加一个一级 token = 手工作者 9 presets × 2 modes = 18 个值**。这是"派生 vs 一级 token"边界的真实定价。
- `appearance/storage.js` 的 `custom[mode][key]` 是**扁平 bag**，加 key 天然向后兼容；`stripAutoTiers` 从 `SEMANTIC_FAMILIES` 读，加 family 免费继承。

**缺席的一级角色**：`--pupu-warning` 与 `--pupu-info` **不存在**(grep 0 命中)。代价：`isDark?"#fdba74":"#c2410c"` 这一个 warning 值散落 **13 文件 15 处**，变量名有 `warningColor`/`warnColor`/`hotColor`/`errorColor` 四种(mcp_registries_modal 里 amber 被命名成 errorColor)。

**其他高杠杆重复**：`#4a5bd8` 靛蓝 20 处 / 14 文件(recipes_page 事实上的 accent，硬编码)；`#86868b` 灰 25 处 / 10 文件(应为 text-muted)；danger 有 5 种拼法(#dc3545/#f87171/#dc2626/#E5484D/#ef4444)。

**编辑器现状**：`theme_editor.js` **已经在用 BUILTIN Explorer 渲染树**(9 token + background 折叠族 + auto 徽章)。CEO 说"做一个 explorer tree"时它已存在 —— 但 `enable_theme_color_customization` **defaultValue: false**，默认看不到。

相关：[[theme-launch-readiness-verdict]](对比度闸仍是唯一硬门槛，也是任何派生扩张的前置条件)、[[feedback-design-principles]]。
