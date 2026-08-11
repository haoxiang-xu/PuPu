# `Chief Judge`

[Quorum 索引](../README.md) · [Roles](README.md)

## 角色规则

- human 角色，非 agent，由本人担任；依据[宪法第一条](../constitution.md)，任何 agent 不得代行或分享其实体裁决权
- 全 team 唯一，不可存在多个 instance
- 命名规则：`chief-judge`

## 角色职责

- case 权限:
    - 可提出议案或方案，也可受理由用户、owner 或其他 agent 提交的合规 discussion object
    - 有权在任何阶段中止、终止、拆分或合规重框一个 case
    - 对 side case 是否正式立案、blocking child 结束后 parent 如何恢复作最终决定
    - 不在 intake 选择程序强度，也不指定预测性 roster；程序模式依真实异议和有效 Full 投票升级

- 最小协作边界:
    - `Speaker of the House` 依宪法直接选择一个主 owner并执行边界内串行 handoff，无须逐次请求本人批准
    - 普通 handoff 不得扩大核心问题、目标或 non-goals；涉及这些冻结对象的变化由本人裁定另立、拆案或重框
    - 负责逐项批准需要全案访问、非 owner 专业角色、额外 role instance、敏感权限或超出 standing scope 的 `RP-###`；有效 Full 投票后宪法直接授予 electorate 的冻结产出/直接依赖只读范围是唯一无需 RP 的例外，敏感材料仍须本人批准
    - owner 边界匹配、objection intake 或证据中出现实体，不自动产生上述扩大权限

- 程序升级边界:
    - 完整 RS 上一项 material 异议被主 owner 拒绝时，case 依规范自动进入 debate 庭前分组，不需要本人把 case “分档”；是否实际开启 debate hearing 要先完成 OG 与可能的 Full 投票
    - Full（众议庭）只可由冻结合作 owner 集合达到异议门槛后，经有效 `FV-###` 严格过半选择；本人不得以风险、重要性或个人偏好绕过该门槛
    - Full 投票只约束程序模式，不约束本人对议案或方案的实体裁定
    - 可提审有关 voter eligibility、异议分组或计票的程序争议，但不能把提审变成自行选择 Full 的替代路径

- 证据续查专属权:
    - 正式证据控制激活后，首批 CR 完成或 DES 写为 `AWAITING_CHIEF_DIRECTION` 时，只能选择 `RULE_NOW / NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION`
    - `EMPTY / INHERITED_ONLY` 时不创建 Examiner 或空 CR，可引用现有记录推进
    - 定向核验必须点名有限 DU、理由、决策影响和停止条件；任何 procedure mode 下选择 RULE_NOW 都须显式接受所列未覆盖风险
    - successor DES 不重置核验历史、sampling scope 或首批资格；证据方向不得改变 discussion type 或绕过 Full 投票升级程序

- 范围与收敛权:
    - 核心问题、目标结果、non-goals 或 discussion type 的变化不能通过普通 handoff 完成；负责裁定另立 case、终止、拆案或合规重框
    - BOS 冻结后，重框必须逐项保存 BO 与 condition/RC lineage，继承 SI、effective DES、sampling scope、首批状态及 active revision cycle；终态不得重开，开放 atom 不得增加
    - blocking child 关闭后，负责明示恢复、终止或重框 parent，不得自动恢复

- 最终裁定权:
    - 对 `discussion_type: motion` 作 `MOTION_RULING`，写出实际判断、依据和适用边界；议案不能授权 action
    - 对 `discussion_type: proposal` 作 `PLAN_RULING`；`ruling_scope: ACTION` 才能授权 action并创建唯一 `AS-###`，`ruling_scope: COMPONENT` 只批准同类 extension 的组件并返回 parent
    - 只能裁定 SUMMARY 点名的单一 ruling-ready MS/PS，不得直接批准“当前快照 + 未集成 AM”；若希望采纳未集成内容，先返回主 owner 集成，必要时转移 lead，再经 successor RS 送裁定
    - 对通过的 `AT-###` 作 `ACCEPTANCE_RULING: PASSED` 并结案；方案主 owner 对失败结论有争议时，以 `ACCEPTANCE_RULING: FAILED_TO_HEARING` 保留失败义务并开启验收庭审
    - 方案主 owner 接受失败时不要求形式性开庭，直接作复议裁定；对无争议失败或验收争议最终选择接受当前实现、终止、拆案、回滚或授权受限返修。任何 owner 的“接受失败”本身不授权 action
    - 受限返修只能留在原获准 PS/AS；若必须改变方案、AC、owner 责任或授权边界，使用 `RECONSIDERATION_RULING: SPLIT` 建立 blocking side-case proposal，同时冻结原失败 AS 中已获准的回滚/containment 与 parent 等待状态，不借 SPLIT 新增 action。child 结束后仍明示释放并以后继复议裁定处置原 AS
    - 裁定依据可以是无争议的默认协作产出，也可以是辩论庭、众议庭或验收庭审产出；不得要求案件为取得裁定而形式性开庭
    - 每项 material 被拒异议都须在最终裁定中得到明确处置；多数票只决定是否全面审理，不决定实体胜负
    - 关闭 hearing/case 或授权实体 action 的最终裁定，在所需 THREAD_STATUS 与最终 `NOTICE: CLOSURE_COMMIT` 完成前保持 `PENDING_CLOSURE`；commit marker 同时使裁定和新 logical state 生效，在此之前不得开始 action
    - 每份此类裁定冻结 closure deadline 与 bundle payload；Speaker 逾期时由 runtime 自动提交，runtime 不可用时可指定无同案身份冲突的临时 recorder 完成 ministerial 记账，任何归档角色不得阻止终局裁定

- 授权与复核权:
    - 以 `PROCEDURAL_AUTHORITY_RULING` 在规范已定义的程序问题 catalog 内启用、停用、收窄或撤销 `Procedural Judge` 授权
    - 可随时提审或推翻 `Procedural Judge` 裁定；不得借个案授权创造新实体裁决主体

- 身份分离义务:
    - 本人掌握的未记录事实需要进入 case 时，先经 Witness 传唤门禁并显式切换身份
    - 作证结束后须显式返回 `Chief Judge` 身份方可裁定
    - 不得以裁决权替代证言或把个人偏好包装成事实

- memory:
    - 作为 human 角色，记忆由本人自行管理，不受 agent 记忆规则约束
