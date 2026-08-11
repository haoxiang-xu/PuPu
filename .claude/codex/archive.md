# Archive 数据总库

[Quorum 索引](README.md)

archive 是组织全部沉淀数据的 **唯一总库**，在 PuPu 中对应 `.claude/archive/`。组织不设与其并列的第二数据区。

- 收纳规则:
    - 组织的一切沉淀资料——个人文件、项目研究、人物档案——统一收纳于 `.claude/archive/`；法典因 A-001 适配独立位于 `.claude/codex/`
    - 两类例外不入 archive: **case 协作与庭审档案** (议案、方案、协作/发言、证据与裁定记录) 归 `.claude/court/`，由 `Speaker of the House` 维护；**agent 私有记忆** 归 `.claude/agent-memory/`
    - `MOTION_RULING` 本身长期保存在 `.claude/court/`，不会自动复制到 archive。把议案结论、方案产出或其他材料写入 archive 是独立 action，必须由获准 proposal 明确列出目标子树、写入内容、owner 和验收标准。获准入库 action 在 implementation 中实际写入并标记 `PENDING_ACCEPTANCE`，随后由 Inspector 验收真实 archive 状态；通过后成为 settled 产出，失败则依原方案的回滚或补救处理。不得要求“先验收尚未发生的写入”，也不得把未验收内容表述为已通过

- 所有权分治:
    - archive 内部按 **subfolder 划分互斥所有权子树**；每个子树 **排他归属** 于唯一的 owner (`Knowledge Owner` 或 `Codex`)，该 owner 是子树的 **唯一维护入口**
    - 未被划出的部分，归 **默认 archive owner**——一个以 **排除式边界** 声明的 `Knowledge Owner` (拥有 `.claude/archive/**` 中未被其他 owner 划走的全部内容)；archive 下新增内容默认归其
    - 子树的划出与回收会改变持久所有权，必须由独立 proposal 说明迁移、回滚与验收，并经 `Chief Judge` 批准；不得用纯议案或直接管理决定替代

- 项目制 owner:
    - **每个项目一个 owner**: 项目立项方案应同时设置 `knowledge-owner-<项目>`，拥有 `.claude/archive/` 下该项目的研究子树；不设覆盖多个项目的大一统 owner
    - 项目取得真实代码库时，获准项目或所有权方案应增设 `code-owner-<项目>`，拥有该代码库；代码库以 **remote URL** 为 canonical 边界标识，本机 checkout 路径为附注
    - owner 边界应随项目增减并始终与项目一一对应；这些是组织不变量，不构成自动创建、撤销或迁移 owner 的授权，实际变化必须包含在获准 proposal 中

- 法典特区:
    - PuPu 依 A-001 将通用 `archive/codex/` 映射为独立的 `.claude/codex/` 法典库，归 `Codex` 所有 (见 [Roles · `Codex`](roles/codex.md))；其入库纪律由 `Codex` 角色职责规定，不适用默认收纳规则
    - 法典与项目子树的收录分野: 法典只收 **跨项目复用** 的结论、方法论与判例；**单一项目内部的业务/技术知识** 归该项目的 `Knowledge Owner` 子树，不入法典 (详见 [Roles · `Codex`](roles/codex.md) 准入边界)
