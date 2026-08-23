---
name: adr-unchain-team-plan
description: 2026-07-28 unchain 编制案 — HR 否决建团队、批 Mission 0；CTO 原 warrant 证据被推翻并已撤回；收敛为 0 新建 + 擎持有 + 触发式扩编
metadata:
  type: project
---

**2026-07-28 CEO 指令组建 unchain 专属团队 → CTO 提案（2 dev sub-team + lead）→ HR 否决主体、批准 Mission 0 → CTO 答辩后收敛。待 CEO 终批。**

## 已撤回的错误论据（正式更正，防止污染绩效记录）
我原 warrant 称"擎对 unchain core 零实际吞吐、unchain 未进入 agent 工作流"。**此推论错误，正式撤回：** 擎 charter 铁律 `NEVER git commit — 留 dirty tree 给 CEO 提交`，全组织 agent 产出在 git 上定义性地归属 CEO 作者，authorship 数据无法区分人机吞吐。反向实证：unchain core 近 90 天至少 9 个 `Co-Authored-By: Claude` commit（含 rich tool result +516 行核心改动），与擎的 memory（`rich-tool-result-and-native-tool-contract.md`）一一对应。**擎是 unchain core 的活跃贡献者。** 另：我引用的"不跨 repo 动 unchain core"位于 Mode B/Codex 试点合格任务清单内，约束的是 Codex 委派资格，不是 ownership——擎 charter Identity B 项本就 owns unchain core。
**教训（load-bearing）：在本组织内，git authorship 永远不是 agent 贡献证据；贡献取证须走 memory 增长 + Co-Authored-By + 双证（HR 考评方法论）。**

## 收敛后的共识（CTO+HR 一致，待 CEO 批）
1. **不新建任何 agent / sub-team / lead / domain architect。** unchain core 留在擎 scope（本就在）；修订擎 charter 第 68 行措辞为"Codex 委派排除项，不影响 ownership"，Mission 0 写入其使命。
2. **Mission 0（正名 API 面）批准执行**，拆 M0a（盘点/三档台账/shim/本地契约测试，可逆）与 M0b（CI 从零搭建——unchain repo 无 `.github/`，零 CI 是最大隐藏工作量，单独排期）。**阶段二"对第三方宣布 stable"写死需 CEO 单独批准，不随 Mission 0 完成自动推进。**
3. **跨仓治理条款替换为 role-based**（架构师技术决定 + 双侧作证 + CTO 运营门），**同时写入擎与智两侧 charter**（现行"智+CTO 双签"只单方面写在擎文件里，智从未承接——HR 发现的程序缺陷）。
4. **删除"90 天触发即设 domain architect"，改为 90 天复评 architect 负载**；触发条件降格为"重新提案的证据门槛"。unchain GitNexus 索引已存在（7786 symbols）但 07-16 已过期——真问题是保鲜机制不是从零建。
5. **簇 3 边界须 architect 重核后再分档**：HR 实证 `agent/modules/jobs.py:6` import `jobs.plugin`，推翻 architect"jobs 纯叶子零内部消费者"论断（簇1→簇3 依赖实存）。未来切分线（HR 主张按模块热度 toolkits+subagents 切，非核心/扩展切）与 import-graph 边界是两个维度，两套数据一并交 architect 重裁。
6. **第二人触发门槛（可取证）**：toolkits 或 subagents 连续两月 ≥15 commits 且与 kernel/tools co-change <20%；或第二消费方出现；或双边并行改动成常态；或（CTO 增补）Mission 0 与 PuPu backend 队列同时饱和迫使派发二选一持续两周期。
7. **组织判例（HR 立，CTO 接受）**：任何建团队提案，必须先证明"改现有 charter 措辞"不能解决。

## CTO 保留的实质增补（HR 未反对，待确认）
**双侧作证坍缩**：role-based 规则原设计假设 unchain 契约 owner 与 PuPu 适配 owner 是两个人互证；0 新建后两侧都是擎，双侧作证退化为单侧自证。补救 = architect packet 内的自主双仓取证为独立第二证 + 验的契约测试执行结果为机器第三证。

相关 [[backend-dev-onboarding]] [[boundary-pupu-server-vs-unchain]] [[hiring-policy]] [[team_roster]]。architect 原三裁决在 `agent-memory/pupu-architect/unchain-team-ruling.md`（其簇3 论断待重核，Q2/Q3 主体仍成立）。
