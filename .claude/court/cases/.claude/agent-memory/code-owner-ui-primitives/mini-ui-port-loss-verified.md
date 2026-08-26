---
name: mini-ui-port-loss-verified
description: mini_ui 是 BUILTIN 组件的设计源头仓；移植损伤已有一个实测确认的案例（timeline pointDoneColor），且诊断方法是比对键的「存在性」而非取值
metadata:
  type: reference
---

`/Users/red/Desktop/GITRepo/mini_ui` 是 PuPu `src/BUILTIN_COMPONENTs/**` 的设计源头仓，目录结构同名同层（`src/BUILTIN_COMPONENTs/<组件>/`、`src/BUILTIN_COMPONENTs/theme/default_mini_theme.json`），另有 `src/PAGEs/docs/components/**` 的组件文档页 —— **PuPu 侧的组件没有 README，上游文档页往往是唯一的契约叙述来源。**

**2026-08-09 实测确认的一次移植损伤（charter 里那条规则的第一个具体案例）**：`theme.timeline` 在上游 **没有 `pointDoneColor` 这个键**，`done` 因此落 `pointColor`（不透明青 `#0ABAB5`），与 `pending`（0.18 中性灰）构成一次真实的两态编码。PuPu 的移植提交 `49b140c6`（2026-02-27）**新增** 了 `pointDoneColor: rgba(0,0,0,0.22)`，同时把 `lineDoneColor` / `seeDetailsColor` 由青改灰 —— 两态之差塌成 0.22 灰 vs 0.18 灰（对比度 1.69 vs 1.53，8 位差 10/255，人眼不可辨）。后续 `f7d26a42`（2026-06-01）删掉 `pointColor` 想把 timeline 接上 `themeHighlightColor`，但没删 `pointDoneColor`，于是 `active` 跟随用户主题而 `done` 被留在硬编码灰上。

**Why**：这类损伤 **不表现为「少了一个键」，而表现为「多了一个键」** —— 新增的键挡在 `??` 链首位，把上游的回退路径截断。只比对取值差异会完全看不见它，因为两边的取值都"有值、看起来合理"。

**How to apply**：用户说"之前有的效果没了"，或某个视觉区分弱到可疑时 —— 先 `diff` 上游同名文件，**并且单独比对 JSON 的键集合（`comm`/`grep -o '"[a-zA-Z]*":'`），不要只看取值**。修复优先方向是"删掉 PuPu 多出来的那个键让它回落上游路径"，而不是重新实现一遍效果。相关：[[timeline-primitive-hazards]]
