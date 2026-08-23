---
name: four-state-presentation-doctrine
description: 「正常/为空/未就绪/失败」四态在 PuPu 用户面的呈现定式 —— 状态是注记不是画面、结构差异不能只靠文案、渲染"没有"必须 fail-closed；含 Inspector/disclaimer/action bar 三处实测对比度
metadata:
  type: project
---

2026-08-07 case `0000-0003-2026-0807`（Memory 的用户可见面）我出的鉴定 S-0012。裁定结果待 CEO；**定式本身与实测数字与裁定无关，可直接复用到任何"这块面在四种状态下长什么样"的问题**。

## 三条呈现规则（R1/R2/R3）

**R1 · 未就绪与失败是「注记」，不是「画面」。** 状态条与内容区并存，不得取代内容区。第三条理由是决定性的：**取代式空屏与真空屏永远只差一个字符串**，而本仓缺键机制是静默回退到 key 本身（`use_translation.js` 三级回退，不抛错不告警 —— 49 个 locale 缺口因此长期无人发现）。只靠字符串区分的四态，在任一 locale 漏一个键的那一刻两态当场同形。

**R2 · 为空与不可信必须结构不同。** 为空 = 内容区一句话、无状态条；不可信 = 有状态条。结构差异（多/少一个块）不会因 i18n 回退消失。

**R3 · 渲染「没有」是 fail-closed 的。** 只有持有肯定的「空」信号才允许说「没有」，否则落不可信。这是 code owner 侧「分类器默认拒真」的镜像 —— **它约束的是屏幕，不是分类器**。二者都要：前者保护新增端点，后者保护新增屏幕（本案里三处渲染"没有"的屏幕根本不发请求，端点约束拦不住）。

## 用户面状态数必须与后端 code 数解耦

系统四态 → 用户面 **两种呈现形态（内容区 / 状态条）+ 四句话**。轴 A = 这画面可不可信；轴 B（仅不可信时）= 等 / 降级 / 卡住 / 说不清。

后端可以有 46 个 code（35 个 `context_v2_*` + main 侧 11 个 reason），全部折进轴 B。**「卡住」是唯一配得上按钮的类** —— 它的定义是「你的改动既没生效也没被丢弃」，只有这一类的解由用户持有。`retryable` 布尔是正确的主轴但只给两类，缺的正是「卡住」。

**reason code 不进句子。** 另起一行，11px 等宽，可选中，不翻译。它服务排障，不服务当下这个用户的决策。

## 句式规范：抄 `boot.failure.*`

本仓唯一跑通并守住的四态先例（`boot_overlay.js` + `boot_locale_parity.test.js`，638 个 locale 键里唯一配对等性守卫的一段）。每句三要素：**影响了什么（用户词汇）/ 还在不在自己重试 / 你能做什么**。`unknown` 是一句显式的话，不是空 —— 本类病灶几乎全部是「兜底 = 什么都不显示」。

`MUTED_OPACITY = 0.75` 是因 AA 实测上调过的（0.55 在 9 个亮色预设里 8 个不过，最差 3.08:1），成文在 `boot_overlay.js:331-333`。直接复用，别另定。

## 实测对比度（2026-08-07，默认主题，静态计算未起应用）

| 位置 | 声明 | dark | light | AA |
|---|---|---|---|---|
| Inspector loading/empty/profiles | `rgba(*,0.28)` 13px | **2.53:1** | **1.99:1** | 双双不过 |
| Inspector error | 红 @0.7 13px | **3.46:1** | **3.67:1** | 双双不过 |
| composer disclaimer | `theme.color` @0.3/0.4 **11px** | **2.11:1** | **2.42:1** | 连 3:1 都不到 |
| action bar 图标 enabled | @0.5 14px | 3.73:1 | 3.17:1 | 过 1.4.11 |
| action bar 图标 disabled | @0.4 | 2.82:1 | 2.42:1 | 1.4.11 豁免 inactive |

**达标临界 opacity**（`theme.color` = `#CCCCCC`/`#222222`）：modal 底（`#1E1E1E`/`#FFFFFF`）4.5:1 需 **0.60 / 0.62**；page 底（`#121212`/`#FFFFFF`）需 **0.58 / 0.62**。0.75 给 6.4–7.0:1。**两档 muted 就够用：主句 0.75，次级 0.60/0.62。**

## 三条别再重新发现的坑

1. **「opacity 0.5→0.4」不是 disabled 态。** WCAG 1.4.11 明文把 inactive 组件排除在对比度要求外 —— 规范不承认降低对比度携带信息。调大差量没用，得换信号。
2. **`title` 不是 blocked 的解。** 只在鼠标悬停出现，键盘/触控不触发，AT 暴露不一致；而 message action bar 本身 `opacity: hovered ? 1 : 0`，等于把解释藏在解释之后。
3. **message action bar 四个按钮可访问名恒为空**（不传 `ariaLabel`/`title` → Button 无 children → `Icon` 走 `UISVGs` 内联 SVG，该 SVG 无 `<title>`、`props` 不透传）。WCAG 4.1.2 Level A，**与 blocked 无关，任何状态下都成立**。且 `opacity:0`+`pointer-events:none` 都不移出 tab order，配上 Button 的 `outline:"none"` 无 focus 态 → 键盘用户 Tab 到每条消息的 4 个不可见无名按钮。

## 一条只在 PCA 面成立的

`/memory/projection` 是 **PCA 投影**，轴对全体点集全局求解。加一个点 = 所有点重新落位。所以那个 5s 静默轮询不是良性增量更新，是整图跳动。**通则：静默刷新只可增不可减；刷新失败的正确表现是给内容加「N 秒前」注记，不是切换状态。**

相关：[[theme-contrast-measured-bounds]]、[[button-primitive-styling-contract]]、[[settings-deprecation-ux-pattern]]、[[feedback_design_principles]]。
