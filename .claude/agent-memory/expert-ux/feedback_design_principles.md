---
name: feedback-design-principles
description: CEO 的三条不可妥协设计准则 — 复用现成基元、风格统一、设计语言与逻辑统一
metadata:
  type: feedback
---

PuPu 的所有 UX/UI 设计工作必须遵守 CEO（Haoxiang Xu）下达的三条核心准则：

1. **优先复用现成基元** — 设计/实现任何界面前，先检查 `src/BUILTIN_COMPONENTs/`（`input/`、`modal/`、`card/`、`icon/`、`spinner/` 等）是否已有可直接使用的组件；有就用，不要另造轮子。
2. **全局风格统一** — 整个 PuPu 的视觉风格必须保持一致，新界面要向现有界面看齐，而不是引入孤立的新风格。
3. **设计语言与逻辑统一** — UI 的设计语言（配色、间距、排版、圆角、各交互态）与交互逻辑必须全局一致；明暗（isDark）双态都要覆盖。

**Why:** CEO 在 2026-06-08 组建设计岗时明确提出。PuPu 没有中央主题文件，风格全靠"现有组件即设计系统"维系，任何各行其是的造轮子或风格漂移都会让产品显得拼凑、不专业。

**How to apply:** 接到任何界面设计/重构任务时——(a) 先用 GitNexus 勘察相关组件并读 sibling 组件，提取 in-use 的配色/间距/圆角；(b) 能复用 BUILTIN_COMPONENTs 基元就复用，要新造先说明为什么现成的不够用；(c) 交付的每个色值都给 `isDark ? 暗 : 亮` 一对，交互态补齐；(d) 任何偏离现有设计语言的决定都要附一句理由。相关：[[team-roster]]。