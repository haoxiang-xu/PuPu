---
name: primitive-uptake-threshold
description: 上收一个新 BUILTIN 原语的判据是"实测三个消费者"，两个消费者时先在消费者侧各落一份
metadata:
  type: project
---

**新形态出现时，不要在只有两个消费者的时候就把它冻成 BUILTIN 原语。**

**Why:** charter 里 `flow_editor` 归属的判据就是这把尺子 —— "实测三个消费者（`COMPONENTs/agents`、`CONTAINERs/config`、`PAGEs/demo`），是真正的通用原语"。2026-08-07 案 `0000-0003` 里 `expert-ux` 主张四态呈现需要一个"状态注记条"形态，我核过 33 个子目录确认库里没有可复用件（`toast_host` 是瞬时的、`card` 是纯容器、`top_progress_bar` 是进度），但仍然不建议现在建：消费者只有 2 个，且形态的关键变量取决于一份当时还没取到的真实数据。**BUILTIN 的价值是被多方消费；两消费者的原语只是提前冻结一个还没被检验的形态。**

**How to apply:**
- 2 个消费者 → 在消费者侧各落一份，取值引用 token（保证一致的是值，不是代码）。
- 第 3 个消费者出现 → 由本 owner 上收，此时三份实现的差异本身就是接口设计的输入。
- 反方向同样成立：有人想把 BUILTIN 里某块切给单一消费者时，用同一把尺子挡回去 —— 划走一次，边界就被开口，后续每个消费者都能援例。

**顺带的库存事实（2026-08-07 实测）**：全仓 `aria-live` 只有 2 处 —— `BUILTIN_COMPONENTs/toast/toast_host.js` 与 `COMPONENTs/boot-overlay/boot_overlay.js`。任何"状态变了但画面没换"的呈现，对读屏用户默认是零播报，必须自带 live region。`boot_overlay.js` 是本仓唯一一份在四态问题上跑通并守住的先例（配了 `boot_locale_parity.test.js`），要抄形状抄它。
