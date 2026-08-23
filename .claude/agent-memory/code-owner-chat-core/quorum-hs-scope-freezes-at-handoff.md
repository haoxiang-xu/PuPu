---
name: quorum-hs-scope-freezes-at-handoff
description: 交棒（HS-###）的 AC/BC/SEQ 集合冻结在 HANDOFF 事件那一刻——在 return 里请求新增 AC 编号会使自己刚给出的 owner confirmation 在送裁门禁上失效
metadata:
  type: feedback
---

作为 handoff owner 交付时，**不要建议给自己确认的 BC/SEQ 新增 AC 编号**；要拆分验收就用"同一 AC 内的子例 + cell 到子例映射"，不要用新编号。

**Why:** `quorum_lint` 有一条 `confirmation handoff HS-### scope does not cover responsibility criteria [...]` 检查——某个 BC/SEQ 的 owner confirmation 引用 HS-###，则该 BC/SEQ 的正负 acceptance 并集必须全部落在那一棒 **HANDOFF 事件冻结的 scope** 内。scope 冻结在交棒时刻，物理上不可能包含在 return 里才诞生的编号。后果是：新编号一加，我刚给出的确认立刻在门禁上失效，lead 被迫为一次纯重新确认再开一棒。

这条在 case P-0000-0007-2026-0815 里撞了两次：runtime 建议新增 AC-016 承载 BC-004 producer 自证（lead 把它逐字保留为 AC-011 的一个子例，只去掉编号）；我建议把 SEQ-004 的负向拆成独立 AC 并断言"本次不存在 scope 溢出"，**lead 在临时副本上实测复现了该 linter 错误并回滚**，证伪了我的前提。两次的处理方式一致，都是"保留正文、不给编号"。

**How to apply:** 交付里想提升可追踪性时，先问"这需要新编号吗"。可追踪性的实质诉求（验收时逐格定位失败）用 SEQ 的 `cell 到子例映射` 字段就能满足，代价为零。真要独立编号，那是 lead 在下一次 PS 里的裁量或 Chief 的裁定，不是我在 return 里能提的——我提了只会制造一次无收益的交棒。相关：[[memory-v2-turn-mutation-rebase]]。
