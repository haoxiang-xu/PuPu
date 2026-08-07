# Archive 数据总库

[Quorum 索引](README.md)

archive 是组织全部沉淀数据的 **唯一总库**，对应一个 `.claude/archive/` folder。组织不设与其并列的第二数据区。

- 收纳规则:
    - 组织的一切沉淀资料——个人文件、项目研究、人物档案、法典——统一收纳于 `.claude/archive/` 之下
    - 两类例外不入 archive: **庭审程序档案** (议案、方案、发言记录、证据记录) 归 `.claude/court/`，由 `Speaker of the House` 维护；**agent 私有记忆** 归各 agent 的 memory
    - 数据入库时点: 凡 case 产出中 具有长期价值的沉淀物，验收通过后 由对应子树 owner 收纳入库；无主沉淀物 由默认 archive owner 收纳

- 所有权分治:
    - archive 内部按 **subfolder 划分互斥所有权子树**；每个子树 **排他归属** 于唯一的 owner (`Knowledge Owner` 或 `Codex`)，该 owner 是子树的 **唯一维护入口**
    - 未被划出的部分，归 **默认 archive owner**——一个以 **排除式边界** 声明的 `Knowledge Owner` (拥有 `.claude/archive/**` 中未被其他 owner 划走的全部内容)；archive 下新增内容默认归其
    - 子树的划出与回收，由 `Chief Judge` 直接决定，属组织管理行为，不进 case lifecycle

- 项目制 owner:
    - **每个项目一个 owner**: 项目立项 即设 `knowledge-owner-<项目>`，拥有 `.claude/archive/` 下该项目的研究子树；不设覆盖多个项目的大一统 owner
    - 项目拥有真实代码库后，增设 `code-owner-<项目>`，拥有该代码库；代码库以 **remote URL** 为 canonical 边界标识，本机 checkout 路径为附注
    - owner 随项目增减，边界始终与项目一一对应

- 法典特区:
    - `.claude/codex/` 为法典库，归 `Codex` 所有 (见 [Roles · `Codex`](roles/codex.md))；其入库纪律由 `Codex` 角色职责规定，不适用默认收纳规则
    - 法典与项目子树的收录分野: 法典只收 **跨项目复用** 的结论、方法论与判例；**单一项目内部的业务/技术知识** 归该项目的 `Knowledge Owner` 子树，不入法典 (详见 [Roles · `Codex`](roles/codex.md) 准入边界)
