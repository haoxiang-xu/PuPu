---
name: routing-hit-audit-method
description: 路由命中审计的可复现测量路径 — 表面认领缺口检测法 + 正文/description 分离检验 + 路由面三层基线(2026-08-04 org-court 001 案首次跑通)
metadata:
  type: project
---

# 路由命中审计 — 已验证测量路径

**首次跑通**: 2026-08-04 org-court 第 001 案 (dev scope 细化 + 议会 skill)。三条命令验证有效, 结论进判决材料。

## 1. 表面认领缺口检测 (unclaimed-surface scan)

判「代码落在没人认领的表面」有客观测法, 不靠印象:

```bash
# 近三月按一级/二级表面统计触及次数
git log --since=<date> --name-only --pretty=format: | grep -v '^$' \
 | awk -F/ '{...按 src/COMPONENTs|BUILTIN_COMPONENTs|PAGEs|CONTAINERs 取三段, electron/unchain_runtime 取两段...}' \
 | sort | uniq -c | sort -rn
# 再把 24 份 description 抽成一个语料, 逐表面 grep
```
关键: **关键词匹配会假阳性** (select/input/card/class 这类通用词在任何 description 里都出现)。凡命中必须回头看原文确认是"作为表面被认领"还是"碰巧出现的英文单词"。假阴性同理: chat-input 字面不在 description 里, 但 chat-core 写了 "the input/attach panel" —— 语义已认领。**只有人工复核过的缺口才能上庭。**

## 2. 正文 vs description 分离检验 (P-1 的实证形态)

最有力的一步: 同一关键词在 **description 语料 = 0** 而在 **整份 agent 文件 > 0** ⇒ 该表面只写在 charter 正文里 ⇒ 路由决策时不可见。

2026-08-04 实测: `BUILTIN_COMPONENTs` 在 24 份 description 中 0 次, 在 9 份 charter 正文中命中 (7 dev 各 1 行 "公共动脉守门规则: 这些不属于你, 属于 pupu-cto", ux-designer 5 处含 "your design-system substrate")。同期该表面 107 个独立 commit。**这就是"把 scope 写进正文对派错人零改善"的实证, 不是推理。**

这条检验对任何"写细 scope"类提案通用: 先证明现有正文已经写得比 description 细, 而缺陷仍在。

## 3. 路由面三层基线 (2026-08-04 实测, 每个顶层轮次都付)

| 层 | 词数 | 备注 |
|---|---|---|
| 24 份 agent description | ~3,820 | 唯一的 dispatch 判据 |
| `.claude/CLAUDE.md` 路由章节 | 1,547 | 也常驻, 但是可写表格(可放 surface→owner 映射) |
| 12 份 skill description | 572 | skill 的全部路由成本 |
| **合计** | **~5,940** | |

前基线 4,289 词/23 agent (2026-08-04 改组前) → 3,816 词/24 agent。**HR 法庭化在编制 +1 的同时砍掉 ~473 词路由面**: 旧 HR 三人 description 248+178+157=583, 新五人 50+52+55+65+68=290。原因是程序化传唤的 agent 不需要在 description 里争夺命中率。**这是"程序化传唤 = description 可极短"的第一份量化先例, 以后所有 skill-summoned 角色都可以援引。**

## 4. 新增 agent 的边际路由成本 (按写法, 不按角色)

- 窄 dev 现行写法 (chat-core/bubble/settings/toolkit/agents/electron): 64–75 词, 均值 ~70 → 每加一人 +1.8% agent 面。
- 带 `<example>` 块的写法 (backend 215 / qa 227 / security 231 / ux 243 / curator 241 / cto 266 / architect 270 / ai-researcher 335): 3 倍价。
- **同一个角色, 写法差 3 倍价而判别性没有更好** (64 词的 electron 零歧义; 266/270 词的 cto/architect 撞车两次)。给编制提案报增量时必须先问"按哪种写法算"。

## 5. cto ↔ architect description 撞车 (C-3) 已扩大为两道题

2026-08-04 复测: 两份 description 各装 **两道**相同例题指向不同 owner —— 「跨设备会话同步怎么设计」与「chat_storage 该不该迁出 localStorage」。奠基记录只写了一道。C-3 未修前, 任何把裁决权/主持权授给 cto 或 architect 的提案都在一个未消歧的锚上加载荷。
