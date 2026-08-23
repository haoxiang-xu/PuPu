---
name: hs-scope-freeze-no-new-ac
description: 作为 HS 交棒目标 owner 返回时绝不新设 AC 编号 —— HS scope 冻结在 HANDOFF 事件，新编号会使自己刚给出的 owner confirmation 在送裁门禁上立即失效
metadata:
  type: feedback
---

在 Quorum case 里担任 `HS-###` 的目标 owner、返回 contribution 时，**不要提议新增 `AC-###` 编号来承载自己那份验收**。把新验收写成**既有 AC 的子例**（例如「AC-011 子例 6」），并在正文里注明「作为 AC-0xx 的引用项，不重复计数」。

**Why:** `HS-###` 的 `scope` 冻结于 Speaker 发布 HANDOFF 的那一刻。若你确认的 `BC-###` / `SEQ-###` 的 responsibility criteria（= 其正负 acceptance 的并集）中出现一个不在该 scope 内的 AC 编号，`quorum_lint` 立刻报 `confirmation handoff HS-### scope does not cover responsibility criteria`，后果是**你刚给出的 owner confirmation 失效**，并被迫为纯重新确认再开一棒。这不是理论风险：P-0000-0007-2026-0815 内实测复现三次 —— 我自己在 HS-001 建议的 AC-016（S-0008 处置）、chat-core 的 M-13 给 SEQ-004 拆负向 AC（S-0013，lead 在临时副本实跑复现后回滚）、以及 electron 载体段（K-14 / K-16）。lead 每次的处置都相同：保留验收正文逐字不变，只去掉独立编号。

**How to apply:** 写 HANDOFF_RETURN 前先看 HANDOFF 事件的 `scope` 字段列了哪些 AC —— 那就是你能引用的全集。需要新验收面时，挂到 scope 内某条 AC 下做子例；确实需要独立编号时，在 return 里**只提出请求并说明代价**，由 lead 在自己不受 HS scope 约束的位置（如 LEAD 确认的对象）新开编号。另外两条同源纪律：RETURN 的 `contribution` 字段里 BC/SEQ/AC/HS 必须是同案裸编号且**每个只出现一次**（重复会被 linter 报 `duplicate ... refs`，且在 append-only 下无法事后归零，见该案 S-0030）；子例编号若与既有「子例 N」体系并行，改用别的前缀（该案用 `E1`–`E9` / `G1`–`G8`）以免「子例」一词在同一 AC 内指两类对象。

**同源的第二个失败模式 —— 集成压缩会吃掉断言主体：** lead 把各 owner 的 contribution 集成进 PS 时会大幅压缩。同一案里我交付的一张**六行三码**失败码对照表被压成一句「恢复期失败一律映射 X」，前两行（瞬时争用 → 可重试）连同其区分依据一并消失；同时我写的 AC 子例「返回码 A 且零写入；释放后同一请求成功」被压成「零写入」。危险在于**「零写入」是必要条件不是充分条件，对两种语义相反的实现都会通过** —— 压缩后验收再也抓不住这个错误。防法：在 return 里把**判据本身**（为什么需要这条断言、只断言弱条件会漏掉什么）与断言写在同一句里；判据一旦进了 AC 正文，压缩者就看得见删它的代价。异议被 ACCEPT 后 lead 明确认可这比只恢复断言更耐久。写 stance 复核 successor PS 时，逐行比对自己 contribution 的原表，不要只看结论一致。

相关：[[unchain-externalization-charter]]
