---
name: org-review-precedents
description: HR 判例 — 建制提案的三道自约束闸门 + 本组织 git authorship 无法测贡献的方法论特例
metadata:
  type: project
---

# 组织研判判例（2026-07-28 两轮实战验证）

## 判例 1：git authorship 在本组织无法测量 agent 贡献（方法论特例，最高优先级）

**事实：** 全组织 agent charter 硬性规定 `NEVER git commit — 留 dirty tree 给 CEO 自己提交`。因此**所有** agent 产出在 git 里都显示 author = CEO。

**决定性对照组：** `.claude/agent-memory/`（100% 由 agent 产出，人类不写）的作者分布同样是 CEO 独占 100%。任何"author=CEO ⇒ agent 无贡献"的推论，将同时证明全部 22 个 agent 都是死重——**推论自证无效**。

**Why:** 2026-07-28 CTO 的 unchain 建团案以"擎从未产生实际吞吐（146/153 作者=CEO）"为核心论据，几乎给一个活跃贡献者留下不实绩效记录。反证：unchain core commit `31e1e0d`（+516 行，author=CEO）的设计与契约逐条记录在擎 memory 里。CTO 复核后全盘接受并撤回该论据。

**How to apply:** 判贡献只用 **memory 生长 + scope 覆盖 + CEO 口供**。任何用 commit 作者/数量判 agent 死活的论证，一律驳回。裁撤双证照旧。

## 判例 2：建制提案的三道自约束闸门（HR 首先约束自己）

任何"建新部门/新角色"提案，必须依次证明：
1. **改现有 charter 措辞不能解决** —— unchain 案真实病因是擎 charter 一句 Mode B 条款的作用域被误读，处方却是 2 人团队 + lead + 新汇报线。
2. **该工作面确实无主** —— 用 `grep -ril "<关键词>" .claude/agent-memory/` 和 `.claude/agents/` 双向验。**注意两者会给出相反答案**：i18n 在 memory 层看似有主（`pupu-dev-toolkit/i18n_locale_workflow.md`），但那份 memory 自我限定只管 `toolkit.*` + `computer_use.*`（17 个 namespace 中的 2 个）；charter 层 grep 则**22 份 charter 无一认领 i18n**。
   **判读规则：memory 证明"有人做过"，charter 才证明"有人负责"。判无主看 charter，不看 memory。**

## 判例 2.5：能用 CI 守的一致性，永远不要用编制守

i18n 实测（2026-07-28）：en 625 keys，9 个 locale 各缺**同一批 49 个** key，且缺口发生在一次人肉 sweep commit **之后**——证明人肉 sweep 机制本身不可靠。无人报 bug 的原因是 `src/BUILTIN_COMPONENTs/mini_react/use_translation.js:82-85` 有 en 静默兜底，非英语用户看到中英混排而非崩溃。**静默降级 = 永不产生 bug report = 永不进 backlog = 永远不会被发现。**

**Why:** 一致性检查是机械的、无判断的、可失败即报的——这是 CI 的形状，不是 agent 的形状。给它配人，等于用一个需要 CEO 记得调用的角色，替代一个自动触发的门。项目已为 MCP registry 建了 `validate-mcp-registry.yml`，却没为 locale 建。

**How to apply:** 遇到"某类一致性没人看"的缺口，先问能不能写成 CI 检查。能 → 建 CI + 把策略挂给最近的现有 owner；不能 → 才谈编制。
3. **不为了给 CEO 一个答案而发明需求** —— CEO 问"还需要新部门么"时，"不需要"是完全合法且常常正确的答案。

**How to apply:** 收到建制提案先跑这三道闸门再谈编制大小。

## 判例 3：span-of-control 不对称必须正面处理

CTO 带 9+ 直属不加层，COO 带 3 直属就要加层——**这是双标**。判据不是人数，是 [[org-chart]] 里的"设 lead 三条判据"（强耦合需单一协调出口 + 意见需合成权衡 + 需对外代表）。3 个直属若彼此不耦合、方向由 CEO 定，不设 lead。

## 判例 4：切分线要按变更热度取证，不按行数

unchain 案：CTO 用「簇1 29K 行 vs 簇2 13K 行」论证第二人是"发明工作"。实测 7 月 commit：簇2 **56** 个（45 个完全不碰簇1）> 簇1 **49** 个。**行数 ≠ 工作流，方向可能正好相反。** 但簇2 内部只有 5 个 commit 跨其内部两模块 → 不内聚，仍不配第二人。切分线按模块热度切，不按"核心/扩展"切。

相关：[[org-chart]] [[team_roster]]
