---
name: theme-taxonomy-v2-frozen-decisions
description: 分类学 v2 冻结口径 —— Linked/Pinned 存储律、8 档 alpha 阶梯、picker 硬限制取代警告闸；含 allowlist 锚点陷阱
metadata:
  type: project
---

2026-08-04 CEO 全量拍板，冻结 spec 在本地 `docs/superpowers/specs/2026-08-04-semantic-theme-taxonomy-v2-frozen-spec.md`（不入库）。**它取代 08-01 提案里所有冲突条目**，08-01 只保留为取证记录。

**四条最容易被后来者改错的口径**

1. **"缺键即跟随"是全套跟随开关的地基。** Linked（跟随父色实时算）= 存储里没这个键；Pinned（冻结）= 键存在。tier 档写 `theme.custom[mode][key]`（沿用 sidebar/surface 今天的行为），**alpha 档写 `theme.details[mode][<family><Step>Alpha]`**——复用已发布的 details 通道，因此**零新增存储形状、导出 JSON 逐字节合法**。custom bag 永远只装 hex，不要往里塞数值。
2. **8 档 alpha 阶梯是"取证锚点+默认值发生器",不是变量名。** 永远不会有 `--pupu-a5`；每档都有语义名（`--pupu-text-faint` 等）。带 pin 的档（border 三档 .90/.55/.30、text-faint .38/.35、overlay-selected .10/.06、状态模板 .14/.18/.22/.25）显式声明 alpha 覆盖 rung 默认——**border 三档是已发布值，绝不能为了对齐 rung 而改**。
3. **对比度从"提交后警告"改成"picker 里选不到"。** 原案的非阻断警告条整条作废。统一模型：所有限制归约成"WCAG L 必须落在若干允许区间的并集"，SV 平面按列二分求边界曲线、纵向吸附（只改明度，保住用户的色相/饱和度意图）。**遮罩刻意不给 isDark 双值**——SV 平面与主题无关，跟着 isDark 变就是谎报。
4. **`kind: "alpha"` 的键永不进 `SEMANTIC_TOKEN_KEYS`。** 该数组的语义收窄为"能在 custom bag 里存实色 hex 的键"，本期 9→11（加 warning/info）。这条保证 `resolveSemanticPalette` 形状、boot palette 四键、`applySemanticPaletteToTheme` 解构全部不受冲击。

**两个必踩的坑**

- **`shell_background_allowlist.js:18,22` 的锚点写的就是 `dirty ? "#4a5bd8"` / `inlineName.trim() ? "#4a5bd8"`。** 做 `#4a5bd8 → accent` 迁移会让锚点命中 0 行 → 按 P0 定的 fail-closed 规则直接红闸。**必须同一个 commit 删掉这两条例外。**
- **`explorer.js` 的 hover 裸值有两份**（521-522 主路径 + 629-630 的 `node.component` 分支）。加禁用口子前**先去重**，否则只会关掉一半；且 custom-component 分支是最可能悄悄坏掉的地方，去重前先确认它有测试覆盖。

**两个实测出来的意外**
- `ColorPicker` 只有**一个**真实消费者（`theme_editor.js`）——`warp_palette.js` 只 import `color_utils`。所以给它加 prop 是 LOW 风险，不必畏手畏脚。
- `Explorer` 有 6 个消费者，最高频的是 `side_menu.js`；新 prop 默认值 = 现状，风险全在去重那一步，不在 prop 本身。

**P1 已实现（2026-08-04，分支 `worktree-semantic-theme-taxonomy-v2-p1`，基于 dev 0dc333dc，4 commits，未 push 未合并）。实现中挖出三件 spec 没预料到的事，都已用具名测试钉住：**

1. **"pin 一个还等于默认值的子节点"曾是空操作，已修（commit `0090a852`）。** 根因：`readThemeSettings` 把"等于预设默认值"的子键当冗余删掉，但在"缺键即跟随"法则下它就是"跟随 vs 钉住"的全部差别。
   **关键结论（别再走一遍弯路）：任何基于「值相等」的冗余判定都修不好这个 bug。** pin 动作冻结的是屏幕上当前显示的值 = **派生值**（by construction）。实测 default 预设：父色未动时 `pin写入=#151515 / preset=#151515 / derived=#151515`；父色改过后 `pin写入=#0e0e0e / preset=#151515 / derived=#0e0e0e`。所以比 preset 值会丢第一种，**比派生值两种全丢（开关变成全局空操作，比原来更糟）**。信息根本不在值里。
   **正解 = 干脆不删**：键只由显式动作移除（`clearThemeCustomColor` / `clearThemeDetailValue` / `resetThemeSettings`）。不引入新存储形状，三条承诺全守住。代价：导出 JSON 可能列出等于默认值的子键——那不是噪音，是用户说过"这个别动"。
2. **sidebar 漂移不是 minStep 一个原因。** minStep 修完只恢复了**明度**恒等（18 组全部 ≤1/255）；**饱和度仍然不跟**（deriveTier 只搬明度，重用 base 的 S），最坏 `warm` light sidebar 授权 #f6efe7 派生成 #ffeede，dS 0.545。要补得开 `matchSaturation`，但它的消色回退是 `min(base.s, 0.20)` —— 那是**次要文字**语义，套到外壳上会把用户特意调彩的 sidebar 洗成灰。这是 color_derive 的契约决策。
3. **量化是 picker 几何的隐藏坑**：`hsvToRgb` 四舍五入到 8bit，所以亮度是 V 的**阶梯函数**，二分出来的边界会落到墙外一步。必须把区间端点向内收到**量化后**仍满足，并且 snap 返回**整数 V**（picker 存整数，返回小数"合法值"再被 round 会把洞重新打开）。

**实测**：contrast_window 的测试独立复算出了与我事前测量完全一致的数（7.485 / 3.084 / 2.109 / 0.0717 / 0.8123），可当交叉验证用。

**info 解除别名是本轮唯一的可见行为变化**：`toast_host.js:102` 今天 `info` 直接吃 accent，默认主题下 info toast 是绿的；加 `info` 根色后变蓝。`loading` variant 继续走 accent（"应用在为你干活"绑品牌色是对的）。

相关：[[theme-contrast-measured-bounds]]（所有阈值的依据）、[[color-system-three-parallel-layers]]（为什么是"档位缺名"）、[[feedback-design-principles]]。
