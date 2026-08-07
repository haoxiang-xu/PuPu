---
name: theme-contrast-measured-bounds
description: 出厂 9 预设实测的对比度/亮度下界 —— 每一条主题护栏阈值的依据；含"状态色不能用 3:1"这条反直觉裁决
metadata:
  type: project
---

2026-08-04 为 picker 硬限制实测 9 预设 × 2 模式全量对比度。**这些数字是 PuPu 每一条主题护栏阈值的唯一依据**，护栏纪律 G7 要求"阈值必须 ≤ 出厂实测下界"，所以定任何新阈值前先看这张表。

**亮度（WCAG relative luminance）窗口**
- dark 模式外壳（background/sidebar/surface）最亮 = **0.0717**（nord.surface `#434c5e`）
- light 模式外壳最暗 = **0.8123**（nord.sidebar `#e5e9f0`）
- 拍板窗口：dark `L ≤ 0.10` / light `L ≥ 0.30`，来自同一条标准——**该极值墨（暗色白/亮色黑）在其上恰好达到 7:1 AAA**。

**对比度实测下界（跨 background+sidebar+surface）**
| 项 | 下界 | 出处 |
|---|---|---|
| text ↔ 外壳 | 7.485 | nord dark text/surface |
| textMuted ↔ 外壳 | **3.084** | default light muted `#8c8c8c` / sidebar `#f5f5f5` |
| accent/success/warning/danger ↔ 外壳 | **1.998** | default light accent `#65c466` / sidebar |
| 同上但只对 {background, surface} | **2.109** | nord dark danger/surface |

**两条反直觉裁决（都推翻了 08-01 提案的草案）**
1. **状态色阈值只能定 1.9:1，不能定 WCAG 1.4.11 的 3:1。** 出厂 success 在 7 个亮色预设里只有 2.19–2.28、default light accent 只有 2.178。定 3:1 会让我们自己的默认主题出厂即非法。1.9 只拦"色相与底色完全糊住"的灾难态，**不是合规闸，别对外宣称是**。
2. **textMuted 的 3:1 只有 0.084 余量**（3.084）。default light 的次要文字本来就勉强及格。后果是正确的：用户能保留 `#8c8c8c` 但再也调不淡。想要余量得把 default light textMuted 调到 `#808080`（→3.623），是出厂观感变化，需单独批。

**注意坑**：只对 `background` 量会得到偏乐观的 3.363 / 2.178；**把 sidebar 算进来才是真下界**。08-01 提案的 3.36 就是漏了 sidebar。

相关：[[color-system-three-parallel-layers]]、[[theme-launch-readiness-verdict]]、[[theme-taxonomy-v2-frozen-decisions]]。
