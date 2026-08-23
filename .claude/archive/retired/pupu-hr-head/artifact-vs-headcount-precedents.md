---
name: artifact-vs-headcount-precedents
description: HR 判例 — 本组织已死过两个"台账"工件(records/ + GitHub issues)；行级内容能维持、汇总/状态字段必烂；建制规则必须有内生上界
metadata:
  type: project
---

# 判例 5：本组织的"台账类工件"已经死过两次，死因相同

提"做个 ledger/台账就能解决"之前，先看这两具尸体（2026-07-31 实测）：

- **`.claude/records/`** —— 2026-06-26 建，INDEX.md 自称"最近更新:2026-06-26"，唯一 plan（v0.1.8 roadmap）状态至今仍标 🟡 进行中。实际：`v0.1.8` tag 之后已 **258 个 commit**，产品在 0.1.9 收敛。git 只碰过它一次（07-04 `4b3b880`）。活了约一周。
- **GitHub issues** —— 48 open / **32 个创建后 updatedAt 从未变** / 40 个零评论 / 26 个存活 >90 天。`#42「Weekly Regular Release Ticket」` 2026-03-01 建、03-14 后再没动过。

**共同死因：写入义务没有挂在"每回合都必然发生的动作"上。** 两者都是一次性写完就没有任何机制强制回写，而且**陈旧不会报错**（同[[org-review-precedents]]判例 2.5 的静默降级逻辑：不失败 ⇒ 不被发现）。

## 唯一活着的自维护工件（反证，指明可行形状）

`.claude/skills/pupu/SKILL.md` 的路由表：**22 个 agent 全部在表内可路由，零遗漏**；只有一行汇总数漂了（写 "CTO (12)"，实际 13）。它活着的原因是写入义务挂进了主 agent 每次路由都要走的流程。

**判读规则：行级内容能维持，汇总字段/状态字段必烂。** 任何新工件的设计约束：(1) 写入义务挂到既有的每回合动作上；(2) 只存行，不存需要重算的汇总；(3) 状态尽量从 git 派生，不靠手写散文。

**手写状态必烂的最强证据：连 CEO 自己的 auto-memory 都烂了** —— 它记 settings→SQLite "Phase 1A 已实施未提交(07-23)"，实际 07-26 已提交并推进到 Phase 5（`9d48d0c`/`69bc9e8`）。三天差四个 phase。组织里最好的那本账尚且如此。

# 判例 6：建制规则必须有内生上界

驳"按 CEO 想法建 project owner"的核心结构理由：dev 的上界是代码面（有限）、智的上界是 provider 数（有限）、PO 的上界是 CEO 的想象力（**无界**）。触发条件无上界的建制规则，一律不批。

# 判例 7：subagent 无常驻性 ⇒ 不能用"新设一个 subagent"去解决"遗忘"

第一人称实证（2026-07-31，HR head 自查工具清单）：subagent **没有 Task/Agent 启动工具**；`SendMessage` 的 `to` 只接受 teammate 名或 `main`（background 专用），本 org 不跑 teams 运行时。⇒ 新角色既不能派 dev、也不能在无人调用时"盯着"。
**用一个同样不常驻的角色，去解决不常驻导致的遗忘，是同义反复。** 这条论据不依赖承载力观测，可现场复验——刻意区别于 07-28 那轮"承载力结构性不可观测"的硬伤。

# 判例 8：遗忘的根因先查章程禁令，再谈编制

14/22 份章程含 `Ephemeral task details: in-progress work, temporary state` 禁令，并跟一句 "These exclusions apply even when the user explicitly asks to save"。**即使 CEO 明说"记住进度"，章程也让 agent 别存。** 未含该条款的 8 份：architect / dev-backend / hr×3 / ai-researcher / market-analyst / release-full-test。
处方顺序：改 memory 契约（零编制）→ 观察一个周期 → 仍不沉淀才谈编制。

相关：[[org-chart]] [[org-review-precedents]] [[team_roster]]
