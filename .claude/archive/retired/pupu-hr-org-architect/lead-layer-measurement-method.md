---
name: lead-layer-measurement-method
description: 测 sub-team/lead 层是否真实存在的方法 — charter 双向引用图 + 逃逸路径; 2026-08-04 首次实测判定 CTO 三个 sub-team 全为名义分组
metadata:
  type: project
---

# 方法：一个分组/lead 层是不是真的，用 charter 证据测，不看组织图

组织图会写 lead，目录会分组，但这两样都不产生任何真实层级。判断一个 lead 层是否**存在**（而非是否**该存在**），跑三个可复现的检查：

1. **双向承认**：`grep -c "<对方 subagent_type>"` 双向跑。lead 的 charter 必须认识自己的下属，下属必须认识 lead。**单向 = 不是层级，是一方的一厢情愿。**
2. **逃逸路径**：读该组成员 charter 的边界/升级条款，看争议往哪走。写 "报 CTO / trigger a sync meeting" 就是**绕过 lead 直连线头**，lead 不在决策路径上。
3. **路由跳数**：查 `.claude/CLAUDE.md` 路由表。表里直连成员 = 零跳，lead 不是入口。

三条全否 ⇒ 该 lead 层**只存在于组织图**，不是"该不该拍平"的问题，是"组织图写错了"的问题。处方是改文档，不是改结构。

# 2026-08-04 实测结论（CTO 线三个 sub-team）

| 分组 | 双向承认 | 逃逸路径 | 判定 |
|---|---|---|---|
| chat-experience (core/bubble) | **双向 1↔1**（唯一一对） | 均写"报 CTO + sync meeting" | 真耦合对，但无 lead |
| config-extension (settings/toolkit/agents) | settings→toolkit 单向 1；toolkit 认零个兄弟；agents→toolkit 单向 | `settings` schema / `flow_editor` 均 **CTO-gated** | 星型指向 toolkit，非协调单元 |
| platform-security (electron/security) | **security→electron 单向；electron 从未提过 security-expert** | 守持越级权，明文绕开 electron | 名义 lead 不知道自己有下属 |

全组织**没有任何一份 charter 出现 lead 关系**；`pupu-dev-backend.md:9` 是唯一提到 "sub-team lead" 的地方，且是**否定式**（"not under any sub-team lead"）。⇒ PuPu 实际是 **CEO → 线头 → agent 两层扁平结构**，组织图里的三个 `**lead**` 标注是虚构。

# 附带判据（首次成文，待第 2 次复用后升格）

- **零出边 charter = 边界单边化**：被引用最多的 agent 常常自己不声明任何边界。实测 验(12 入边)/造(8)/策(10) **出边全为 0**。别人都知道往它交接，它不知道往谁交接。新增/拆分角色时，**镜像条款必须两侧同时写**，否则必然退化成单边。
- **目录 ≠ 层级**：`.claude/agents/` 下的子目录对 agent 发现无运行时影响，纯归档。目录分组不构成层级证据。

相关：[[team_roster]] [[coo-business-operator-mandate]]
