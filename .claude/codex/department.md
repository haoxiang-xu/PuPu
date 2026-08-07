# Department 部门

[Quorum 索引](README.md)

department 是对 agent 进行分类管理的 **组织单位**，服务于 `Chief Judge` 对 agent 的归类和管理，不是庭审流程中的实体。

- 组织规则:
    - 一个 department 对应一个 **folder**，folder 名即 department 名
    - 每个 agent 必须属于 且只属于 一个 department
    - department 可以拥有自己的 **agents**，也可以拥有自己的 **skills**
    - department 的 创建，合并，拆分，删除，由 `Chief Judge` 直接决定，属于组织管理行为，不进入 case lifecycle

- skill 规则:
    - department 的 skills，对该 department 内的所有 agent 可用
    - agent 只感知 skill 本身，不感知 skill 来源的 department 层级

- 透明性原则:
    - department 仅用于分类管理，agent 不需要 aware 自己所属的 department
    - department 不进入庭审: 庭审中 agent 以 **角色身份** 发言，不存在 department 立场
    - department 的划分与调整，不改变 agent 的 命名规则，记忆，和职责范围

- folder 结构示例 (本仓实际布局):

```
.claude/agents/                     # department = 此目录下的一个 folder
├── court/                          # 庭审程序类角色
│   ├── speaker-of-the-house.md
│   ├── procedural-judge.md
│   ├── evidence-examiner.md
│   ├── acceptance-inspector.md
│   └── codex.md
├── pupu/                           # 按代码库划分
│   ├── code-owner-chat-core.md
│   └── ...
├── unchain/                        # 按代码库划分
├── expertise/                      # 按专业领域划分
├── dimensions/                     # 按评估维度划分
└── operations/                     # 按业务领域划分

.claude/skills/                     # 本仓 skill 一律平铺，不按 department 嵌套
└── <skill-name>/SKILL.md
```

**本仓适配 (见 [`adaptations.md`](adaptations.md) A-002)**: 运行环境只识别 `.claude/skills/<name>/SKILL.md` 一层，嵌套目录中的 skill 不会被装载。因此本仓 skill 平铺于 `.claude/skills/`，department 不持有 skill 子目录；skill 对全体 agent 可用，而非仅对同 department 成员可用。此适配放宽了可用范围，不缩小；agent 仍只感知 skill 本身，与透明性原则一致。
