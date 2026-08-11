# 编号与交叉引用

[Quorum 索引](../README.md) · [Court Records](README.md)

## 全局 discussion 编号

- 议案使用 `M-0000-0001-YYYY-MMDD`，方案使用 `P-0000-0001-YYYY-MMDD`；二者各自独立递增，前缀保证 `.claude/court/cases/` 下不冲突
- 每个 discussion object 同时就是一个 case，`case_id` 等于其议案或方案编号
- 同类 extension、跨类别 derived 与 side case 都取得新的全局编号，并通过 `parent_case_id / relation / derived_from / blocking` 关联
- 编号一经原子占用不可复用；取消、驳回或终止也保留

## case 内编号

- 发言/事件、证据与裁定分别使用 `S-0001`、`E-0001`、`R-0001` 起始序列
- 待裁问题使用 `Q-001`；议案主问题通常为 `Q-001`
- owner handoff 使用 `HS-001`；同一时刻最多一个 OPEN HS
- 议案回答快照使用 `MS-001`；方案快照使用 `PS-001`
- review/electorate 快照使用 `RS-001`
- Full 全面审查的只读范围 overlay 使用 `FS-001`；它必须引用一个 RS，不能改变该 RS 的 electorate 或 N
- Speaker 归并后的异议组使用 `OG-001`
- Full（众议庭）程序投票使用 `FV-001`；状态只允许 `OPEN / REMAIN_IN_DEBATE / ENTER_FULL / CANCELLED_NO_RESULT`
- 阶段/visit instance 使用 `SI-001`
- BOS 与 BO 使用 `BOS-001/BO-001`；异议解决条件使用其发言内 `S-####/RC-001`，无 BOS 的 Chief 返修条件使用 `R-####/RC-001`
- 决策证据集、事实单元与报告使用 `DES-001/DU-001`、`CR-001`
- 证据稳定切片使用 `E-####/ES-001`
- 参与权限请求与范围请求使用 `RP-001`、`SR-001`
- parking lot 项使用 `PARK-001`，避免与全局方案 `P-...` 混淆
- action 验收系列与实施快照使用 `AS-001`、`AT-001`

## 产出内部编号

- owner 方案块使用 `SLOT-001`，适用于所有方案，不限于某个 procedure mode
- 议案回答或方案修正都可使用 `AM-001`；其所属 MS/PS lineage 与 target 必须明确
- 验收标准使用 `AC-001`
- 方案引用写为 `<proposal-id>#SLOT-###`、`<proposal-id>#AM-###`、`<proposal-id>#AC-###` 或 `<proposal-id>#PS-###`；议案修正写为 `<motion-id>#AM-###`

## 引用规则

- 同 case 可裸写 case 内编号；跨 case 必须写 `<case-id>#<local-id>`
- 普通 `AGREE / OBJECT / ABSTAIN` 必须引用 `RS-###`、对应 `MS-###/PS-###` 与实际审查范围；Full 中对扩展只读范围的 stance 必须同时引用原 `RS-###` 与当前 `FS-###`
- `LEAD_DISPOSITION` 必须引用具体 `OBJECTION` 的 `S-####`；RS 前异议还必须引用其 `NOTICE: OBJECTION_RETARGET` 的 `CONFIRMED` 事件
- successor RS 中沿用的 OBJECT 必须引用原 objection S、此前 retarget/disposition 与当前 `OBJECTION_RETARGET`；target 或直接依赖 hash 变化、或 lead transfer 后，旧 disposition 不得继续生效
- `OG-###` 必须列出全部成员异议；`FV-###` 必须引用 electorate `RS-###` 和触发它的 OG
- `BALLOT` 必须引用一个开放 `FV-###`，不能把 review stance 当作程序票
- 同一 voter 在一个 FV 中只有第一张有效 BALLOT 生效；同一 RS 与同一 OG 集合只能有一个 FV
- 最终实体 R 的 closure manifest 在 R 归档时原子保留其 S ID；这些 ID 不参加其他事件分配，同一 R 只有首条 payload/hash 完全匹配的 `NOTICE: CLOSURE_COMMIT` 生效
- `ANSWER`、`OBJECTION`、`AMENDMENT`、`TESTIMONY` 与 `WITHDRAWAL` 必须指向稳定 target
- 摘要与裁定只能引用 canonical source，不得复制原文形成第二事实源
