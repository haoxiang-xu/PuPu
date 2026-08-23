---
name: superpowers-essentials-pack
description: P0 官方策展 skill pack「superpowers-essentials」的选品结论、pin SHA、准则先例(S5 切片)
metadata:
  type: project
---

第一个官方开源 skill pack 已策展完成(S5 切片,2026-07-18)。

**事实**: pack 落地 `docs/superpowers/skill-packs/superpowers-essentials/`(本地不入库),
从 obra/superpowers 精选 5/14 条纯指令方法论 skill:brainstorming、systematic-debugging、
writing-plans、receiving-code-review、verification-before-completion。上游 pin SHA
`d884ae04edebef577e82ff7c4e143debd0bbec99`,MIT(Jesse Vincent),再分发合规(保留版权声明即可)。

**Why**: spec §5「官方策展批次」P0 = superpowers 精选 chat 通用子集;S4 security 开闸条件是
「每条上架 body 全文审读」。选品准则(比"哪个火"重要):a)PuPu chat 语境成立(纯思考/写作/
流程方法论最稳,强依赖 Bash/文件编辑/子代理机制的不收) b)instruction-only c)≤64KB d)license。

**How to apply**: 做 P1 批次(anthropics/skills 子集、awesome 榜单单品)时复用同一四准则与
「degraded=附带文件引用要标注、命令数≤30、宁缺毋滥」的先例。淘汰的 9 条几乎全因准则 a
(子代理/git/bash/test-runner 依赖或生态元 skill)——computer-use 落地后 test-driven-development
等可重新评估。命名冲突口径:command token 是 skill `name` 全称(如 /writing-plans ≠ /plan),
与 PuPu 现有 /plan /btw /fyi /queue 逐个核。选品报告详情见 PACK.md 与仓内 spec
`docs/superpowers/specs/2026-07-18-open-skill-ecosystem-import.md` §5。
