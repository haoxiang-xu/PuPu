# Department 部门

[Quorum 索引](README.md)

department 是对 agent 进行分类管理的 **组织单位**，服务于 `Chief Judge` 对 agent 的归类和管理，不是庭审流程中的实体。

- 组织规则:
    - 一个 department 对应一个 **folder**，folder 名即 department 名
    - 每个 agent 必须属于 且只属于 一个 department
    - department 可以拥有自己的 **agents**；PuPu 的 skill 因运行时约束统一平铺在 `.claude/skills/`，不嵌套到 department
    - department 的 创建、合并、拆分、删除属于持久组织变更，必须由 proposal 说明 agent/skill 迁移、回滚与验收，并经 `Chief Judge` 批准；纯议案只能判断是否应变更，不能直接执行

- skill 规则（PuPu A-002）:
    - 运行环境只识别 `.claude/skills/<name>/SKILL.md` 一层；全部 skill 对所有 agent 可发现
    - agent 只感知 skill 本身，不感知来源 department；权限与使用边界仍由 skill 自身定义

- 透明性原则:
    - department 仅用于分类管理，agent 不需要 aware 自己所属的 department
    - department 不进入庭审: 庭审中 agent 以 **角色身份** 发言，不存在 department 立场
    - department 的划分与调整，不改变 agent 的 命名规则，记忆，和职责范围

- folder 结构示例（PuPu 实际布局）:

```
.claude/agents/
├── court/                          # 程序与法典角色 instance
├── pupu/                           # PuPu code owners
├── unchain/                        # unchain code owner
├── expertise/                      # 专业鉴定
├── dimensions/                    # 评估维度
└── operations/                    # task / knowledge owners

.claude/skills/
└── <skill-name>/SKILL.md           # 一律平铺
```
