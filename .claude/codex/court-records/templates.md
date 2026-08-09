# 固定模板

[Quorum 索引](../README.md) · [Court Records](README.md)

普通发言使用[庭审发言协议 · 公共信封](../lifecycle/speech-protocol.md#公共信封)。以下模板增加相应固定载荷；正文与状态记录均只追加，不原地改写历史。

## 初始参与批准、当前 roster 与参与请求

`case.md` 的初始批准块：

```markdown
## 初始参与批准（不可改写）
- **初始批准**: Chief Judge | 2026-08-06T18:00:00-07:00 | intake-sha256:...
- `speaker-of-the-house` | Speaker of the House | 主持、相关性路由、归档 | case 全部规范档案 | `INTAKE@2026-08-06T18:00:00-07:00`
- `code-owner-example` | Code Owner | 主 owner、集成方案 | `src/example/**` | `INTAKE@2026-08-06T18:00:00-07:00`

## 当前 roster
- `speaker-of-the-house` | Speaker of the House | 主持、相关性路由、归档 | case 全部规范档案 | `INTAKE@2026-08-06T18:00:00-07:00`
- `code-owner-example` | Code Owner | 主 owner、集成方案 | `src/example/**` | `INTAKE@2026-08-06T18:00:00-07:00`
```

初始批准块创建后不可改写；当前 roster 随获准裁定更新。后续增加、移除、豁免交付或修改既有成员的范围/交付，均在 `case.md` 中使用：

```markdown
## 待批参与请求
- RP-001 | ADD | `expert-example` | Expert | NOT_APPLICABLE | Q-002 | 现有 roster 无该专业判断 | 缺席将使 Q-002 保持未知 | 仅读取 Q-002 相关档案 | NOT_APPLICABLE | pending
```

字段顺序为：请求编号、请求动作、agent instance、角色、原批准来源、目标决定/交付、理由或独有信息、缺席/变更影响、建议访问范围、重提依据、状态。`ADD` 的原批准来源写 `NOT_APPLICABLE`，其余动作必须引用当前 roster 行的 `INTAKE@...` 或 `R-####`。初次请求的重提依据写 `NOT_APPLICABLE`；重提时写 `旧 RP | 拒绝 R | 会推翻 rejection_predicate 的同 target 状态变化编号`。请求动作只允许 `ADD / REMOVE / CHANGE_SCOPE / CHANGE_DELIVERY / WAIVE_DELIVERY`；状态只允许 `pending / approved / rejected`，非 `pending` 状态必须附 `R-####`。同一 `(instance, action, target)` 只允许一项开放请求。

## `Witness` 传票

```markdown
#### S-0012 | SUMMONS | speaker-of-the-house → witness
- **阶段**: 辩论庭
- **结论**: 传唤回答下列单一事实问题
- **依据**: S-0008, E-0003
- **不确定性**: 无法从已查来源确定
- **请求/下一步**: Witness 回答 KNOWN、UNKNOWN 或 UNCERTAIN
- **问题**: ...
- **受影响事项**: Q-002
- **阻塞项**: PENDING_BOS
- **已查来源**: ...
- **本人知情理由**: ...
- **阻塞状态**: blocking
```

## `Witness` 证言

```markdown
#### S-0013 | TESTIMONY | witness → S-0012
- **阶段**: 辩论庭
- **结论**: UNKNOWN
- **依据**: S-0012
- **不确定性**: 本人不掌握该事实
- **请求/下一步**: 将该问题保留为已知缺口
- **回答状态**: UNKNOWN
- **证据编号**: E-0004
- **答案**: 不知道
- **知识来源**: 本人记忆
- **适用边界**: 仅回答 S-0012 所问范围
- **可佐证线索**: 无
```

## 异议线程状态

```markdown
#### S-0019 | THREAD_STATUS | speaker-of-the-house → S-0015
- **阶段**: 辩论庭
- **结论**: 本异议暂无可自动执行的下一增量，暂停送裁定
- **依据**: S-0015, S-0016, S-0017
- **不确定性**: 无
- **请求/下一步**: 保持 OPEN_MATERIAL 并提交 Chief Judge
- **异议线程**: S-0015
- **阻塞项**: BOS-001/BO-001
- **阻塞项状态**: OPEN
- **线程状态**: OPEN_MATERIAL
- **状态理由**: 仍有实质异议，但没有新的决策关键证据或方案变化
- **实质增量引用**: 无
- **已关闭条件**: 无
- **剩余解决条件**: S-0015/RC-001 | 当前方案仍未给出可复现回滚检查
```

## 阶段阻塞清单

首次完整材料与首次审查窗口结束后，由 `Speaker of the House` 追加：

```markdown
#### S-0018 | OBLIGATION_SET | speaker-of-the-house → case
- **阶段**: 辩论庭
- **结论**: 冻结本收敛域的有限阻塞清单
- **依据**: Q-001, Q-002, S-0011, S-0015, S-0016, S-0017, 0000-0003-2026-0806#PS-002
- **不确定性**: 无
- **请求/下一步**: 后续 material 线程只处理本清单开放项
- **阻塞清单编号**: BOS-001
- **收敛域/SI**: debate | SI-002
- **形成基线**: 0000-0003-2026-0806#PS-002 | first-review-cutoff 2026-08-06T19:08:00-07:00
- **首次审查截止**: 2026-08-06T19:08:00-07:00
- **阻塞项**:
  - BO-001 | S-0015 | 0000-0003-2026-0806#AC-002 | 回滚检查可在冻结 revision 上复现 | OPEN
  - BO-002 | Q-002, S-0013 | Q-002 | 固定 revision 的接口切片可判定是否支持所需输入，或由 Chief 明示接受该未知风险 | OPEN
- **阻塞项状态理由**:
  - BO-001 | AWAITING_EVIDENCE
  - BO-002 | AWAITING_EVIDENCE
- **清单摘要哈希**: sha256:bos1...
```

每个 BOS 在其收敛域只冻结一次，候选来源必须可与首次审查截止点复算。冻结后不得追加 BO；状态变化只使用新的 `THREAD_STATUS` 引用原 BO，不改写本块，`SUMMARY` 只汇总并引用最新状态事件。同一获准 action 的后续 AT 引用原验收 BOS，不建立一份更宽的新清单。

## 证据条目

```markdown
### E-0001 | repository
- **来源类型**: 自证类
- **来源定位**: `src/example.ts:10-24`
- **取得方式**: revision `abc123` 的只读检查
- **提交来源**: S-0008
- **支持/反驳**: 支持 S-0007
- **受影响决定**: Q-001
- **完整性限制**: 未检查部署环境
- **稳定切片**:
  - ES-001 | `src/example.ts:10-24` | revision `abc123` | observed_at NOT_APPLICABLE | sha256:slice1... | 仅函数体，不含调用方
- **质疑历史**: 无
- **验证历史**:
  - CR-001 | DES-001/DU-001 | 已验证 | 内容存在且与引用一致
```

`提交来源` 只允许 `S-####` 或 Fast filing 的 `INTAKE@<submission-hash>`。每个 `ES-###` 依次记录 locator、revision、观察时点、规范化内容哈希与切片边界，并继承所属 E 的 **来源类型** 与 **完整性限制**；同一 E 的切片不得覆盖这两项，需要不同值时另建 E。DU 只能引用稳定切片。`质疑历史` 与 `验证历史` 都只能追加。BOS 冻结后的 flag 使用两种固定事件：`FLAG | S-#### | target | reason | decision link | BOS/BO | dedupe key`，随后 `STATUS | S-#### | OPEN/CLOSED | basis S/R | disposition`。首个 STATUS 以该 OBJECTION S 为 basis；CLOSED 只可引用点名 flag 的 Chief R 或原提交者 WITHDRAWAL S。重复提交不建 flag，只在 parking lot 以 `MERGE_DUPLICATE → 原 S` 留痕。flag 不新建 RC/BO，也不改变既有核验结果。一般来源使用 `已验证 / 未验证 / 相矛盾`；证言使用 `已佐证 / 未佐证 / 相矛盾`。证言条目只指回 `TESTIMONY`，不复制答案。

## 决策证据集 manifest

```markdown
## DES-001 | 2026-08-06T19:10:00-07:00
- **关联阶段**: debate
- **stage instance**: SI-002
- **sampling scope**: SI-002
- **supersedes**: null
- **自动首批资格**: ELIGIBLE
- **初始抽样处置**: FIRST_RANDOM_REQUIRED
- **候选单元**:
  - DU-001 | Q-001 | “调用路径会进入新分支” | E-0001/ES-001 | 自证类 | 未检查部署环境 | sha256:content1... | sha256:vkey1...
  - DU-002 | 0000-0003-2026-0806#AC-001 | “AC-001 可被自动测量” | E-0003/ES-001 | 自证类 | 仅本地运行 | sha256:content2... | sha256:vkey2...
  - DU-003 | Q-002 | “现有接口支持所需输入” | E-0007/ES-001 | 自证类 | 未检查旧版本 | sha256:content3... | sha256:vkey3...
  - DU-004 | 0000-0003-2026-0806#SLOT-002 | “owner B 可独立实施该块” | E-0010/ES-001 | 传闻类 | 只证明文档如此陈述 | sha256:content4... | sha256:vkey4...
  - DU-005 | 0000-0003-2026-0806#AC-002 | “回滚检查可复现” | E-0012/ES-001 | 自证类 | 单一环境 | sha256:content5... | sha256:vkey5...
  - DU-006 | 0000-0003-2026-0806#AC-001 | “AC-001 可被自动测量” | E-0006/ES-001 | 自证类 | 与 DU-002 同方法 | sha256:content6... | sha256:vkey6...
  - DU-007 | Q-001 | “相邻页面也采用树形布局” | E-0008/ES-001 | 自证类 | 相邻页面非当前范围 | sha256:content7... | sha256:vkey7...
- **最终抽样总体**: DU-001, DU-002, DU-003, DU-004, DU-005
- **随机资格**:
  - DU-001, DU-002, DU-003, DU-004, DU-005 | RANDOM_ELIGIBLE
- **合并来源**:
  - DU-006 → DU-002 | 同一方法与决策事实
- **排除单元**:
  - DU-007 | ADMIT_CONTEXT | 即使相反也不改变当前方案
- **分区校验**: 7 = 5 + 1 + 1
- **N**: 5
- **首批 k**: 1
- **manifest 摘要哈希**: sha256:manifest...
- **抽样算法**: evidence-rules.md#五-16-可复现随机抽查
- **冻结者**: speaker-of-the-house

### Sampling seed | DES-001
- **manifest 摘要哈希**: sha256:manifest...
- **生成者**: runtime
- **seed**: 64 个 hex 字符
- **生成时点**: manifest 冻结之后、抽样之前
```

候选单元必须完整且互斥地落入最终总体、合并来源或排除单元。DU 行依次记录编号、决策链接、单一事实、稳定 E/ES 切片、来源类型、已知限制、内容哈希与 `verification_key`。该 key 必须按证据规则的固定 canonical JSON 从 E/ES 字段重算，不接受无法复现的手填值。最终总体中的随机资格只允许 `RANDOM_ELIGIBLE / CHECKED_INHERITED / REPLACEMENT_REQUIRES_TARGETED_CHECK`。`N` 等于最终总体的 DU 数；`k = ceil(N × 0.16)`。`自动首批资格` 只允许 `ELIGIBLE / INELIGIBLE_INHERITED`；`初始抽样处置` 只允许 `EMPTY / FIRST_RANDOM_REQUIRED / INHERITED_ONLY / AWAITING_CHIEF_DIRECTION`：`N = 0` 为 `EMPTY`；存在合格随机未查 DU 且 scope 资格未消费时为 `FIRST_RANDOM_REQUIRED`；最终总体的每个 DU 均以自身未变化的 `verification_key` 标记为 `CHECKED_INHERITED` 时为 `INHERITED_ONLY`；其余无自动批次的非空集合为 `AWAITING_CHIEF_DIRECTION`。`sampling scope` 在 action 获准前写当前 `SI-###`，批准 action 后从 implementation 起写该 action 的 `AS-###`，同一 scope 只有实际生成 `FIRST_RANDOM_16` CR 才消耗资格，`EMPTY / INHERITED_ONLY` 不消耗尚未使用的资格。每个 `N > 0` DES 冻结后都生成且只接受第一条 seed，以便未来获准随机批可复现；资格只控制是否自动开首批，不控制 seed。方案或证据返修后追加 successor DES，不修改旧 manifest。

successor DES 除上述完整分区外，必须追加：

```markdown
- **继承单元与核验状态**:
  - DU-001 | UNCHANGED | from DES-001/DU-001 | sha256:vkey1... | CHECKED_INHERITED | CR-001 已验证
  - DU-003 | UNCHANGED | from DES-001/DU-003 | sha256:vkey3... | RANDOM_ELIGIBLE | UNCHECKED
- **替换/退役映射**:
  - DU-008 | REPLACEMENT_OF DES-001/DU-005 | 原单元 UNCHECKED / 未抽中；用于恢复同一 AC-002 主张 | 历史保留
- **新增单元资格**:
  - DU-008 | REPLACEMENT_REQUIRES_TARGETED_CHECK
  - DU-009 | NEW_INDEPENDENT | 即使 DES-001/DU-005 为假仍独立成立且改变 Q-003 | RANDOM_ELIGIBLE
```

累计已查数包含继承的已查单元；替换单元不得进入随机续批。若当前 `sampling scope` 尚未产生任何首批 CR，首次从 `N = 0` 变为 `N > 0` 的 successor 可为 `ELIGIBLE`。非空 DES 的最终总体若全部是 `CHECKED_INHERITED`，写 `INHERITED_ONLY` 与 `CR = NOT_APPLICABLE`，不创建空批次或 Examiner；若同一未消费 scope 的后继 DES 首次出现 `RANDOM_ELIGIBLE` 单元，再写 `FIRST_RANDOM_REQUIRED` 并执行唯一自动首批。同一 AS 下新 AT 的 DES 也属于 successor；AS 已消费首批时只能为 `INELIGIBLE_INHERITED`。

## 置信度报告

```markdown
## CR-001 | 2026-08-06T19:20:00-07:00
- **Evidence Examiner**: evidence-examiner-0000-0001-2026-0806-01
- **决策证据集**: DES-001
- **stage instance**: SI-002
- **sampling scope**: SI-002
- **manifest 摘要哈希**: sha256:manifest...
- **批次**: FIRST_RANDOM_16
- **授权来源**: AUTO_FIRST_BATCH
- **N / 本批 / 累计已查**: 5 / 1 / 1
- **实际累计比例**: 20.00%
- **seed**: ...
- **抽中单元**: DES-001/DU-001
- **核验结果**:
  - DES-001/DU-001 | E-0001/ES-001 | 已验证 | ...
- **已覆盖决定**: Q-001
- **未覆盖决定**: Q-002, 0000-0003-2026-0806#SLOT-002, 0000-0003-2026-0806#AC-001, 0000-0003-2026-0806#AC-002
- **未抽中单一来源关键主张**: DES-001/DU-003, DES-001/DU-004, DES-001/DU-005
- **置信等级**: MEDIUM
- **限制**: 样本很小；不得解释为整个集合为真的概率
- **请求/下一步**: 等待 Chief Judge 证据方向
```

批次只允许 `FIRST_RANDOM_16 / NEXT_RANDOM_16 / TARGETED_CHECK`。后两者的 **授权来源** 必须引用 `R-####`；只有实际核验批次才生成 `CR-###`。`INHERITED_ONLY` 只引用既有逐项 CR 历史并写 `CR = NOT_APPLICABLE`，不得为它伪造空报告。

## 送裁定摘要

```markdown
#### S-0020 | SUMMARY | speaker-of-the-house → case
- **阶段**: 辩论庭
- **结论**: 提交当前裁定材料并休庭等待 Chief Judge
- **依据**: S-0001, S-0014, S-0018, S-0019, DES-001, CR-001
- **不确定性**: CR-001
- **请求/下一步**: Chief Judge 选择证据方向或作实体裁定
- **共识**: S-0016, S-0017
- **分歧**: S-0015, S-0019
- **已知缺口**: Q-002
- **候选方案**: 0000-0003-2026-0806#PS-002
- **风险**: S-0015
- **阻塞清单状态**: BOS-001 | BO-001 OPEN/AWAITING_EVIDENCE | BO-002 OPEN/AWAITING_EVIDENCE
- **证据质疑标记**: 无
- **未核验 replacement 风险**: 无
- **强制回应事项**: S-0015
- **相关性处置**: 3 material；2 context；1 duplicate；2 parked
- **决策证据集**: DES-001
- **置信度报告**: CR-001
- **停止原因**: 没有满足续轮条件的下一发言
- **覆盖缺口**: RP-001 尚未批准；不阻止送裁定
- **未答 non-blocking 传票**: 无
```

`EMPTY / INHERITED_ONLY` 时把 **置信度报告** 写为 `NOT_APPLICABLE`，后者列出继承的逐项 CR 历史，请求直接进入实体裁定。

## Debate 方案、快照与 ACK

```markdown
---
case_id: 0000-0001-2026-0806
updated_at: 2026-08-06T19:05:00-07:00
---

# 方案

## 0000-0003-2026-0806
- **提出发言**: S-0011
- **主 owner**: code-owner-example
- **目标结果**: ...
- **实施范围**: ...
- **owner slots**:
  - SLOT-001 | code-owner-example | 核心实现
  - SLOT-002 | knowledge-owner-example | 文档与说明
- **关键步骤**: ...
- **风险**: ...
- **可逆性**: ...
- **回滚/补救方式**: ...
- **验收标准**:
  - AC-001 | ...
  - AC-002 | ...

### AM-001
- **提出发言**: S-0014
- **影响字段**: STEPS
- **原值引用**: 0000-0003-2026-0806#SLOT-002
- **修正内容**: ...
- **修正理由**: ...

### PS-001 | 2026-08-06T18:50:00-07:00
- **base proposal**: 0000-0003-2026-0806
- **supersedes**: null
- **included amendments**: 无
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **content hash**: sha256:ps1...
- **形成者**: code-owner-example

### PS-002 | 2026-08-06T19:05:00-07:00
- **base proposal**: 0000-0003-2026-0806
- **supersedes**: PS-001
- **included amendments**: AM-001
- **changed blocks**: SLOT-002
- **dependent review blocks**: SLOT-002, AC-002
- **content hash**: sha256:ps2...
- **形成者**: code-owner-example

### Review ledger | PS-002
- `code-owner-example` | S-0016 | ACK | 全案
- `knowledge-owner-example` | S-0017 | ACK | 全案
```

每个快照 manifest 明确 base、纳入的全部 AM、变化块、依赖复审块与内容哈希。ACK 必须指向 `PS-###`；新快照只使审查范围与 `changed/dependent review blocks` 相交的旧 ACK 失效。目标结果或验收标准变化时必须新建方案编号，不能只建新快照。

## 裁定文档

每条 `R-####` 在标题后先按固定顺序写 **裁定身份**、**记录类型**、**依据**、**证据质疑处置**。最后一项写 `NOT_APPLICABLE`，或逐项写 `S-#### | CLOSED | disposition`；只有明确点名 flag 的 `Chief Judge` 证据方向/实体裁定可以使用后者，`Procedural Judge` 与无关裁定不得关闭 flag。随后才按记录类型追加下述固定 payload。

```markdown
---
case_id: 0000-0001-2026-0806
updated_at: 2026-08-06T21:15:00-07:00
---

# 裁定与授权

## R-0001 | Debate 方案裁定 | 2026-08-06T20:00:00-07:00
- **裁定身份**: Chief Judge
- **记录类型**: DEBATE_RULING
- **依据**: S-0020, DES-001, CR-001, 0000-0003-2026-0806#PS-002
- **证据质疑处置**: NOT_APPLICABLE
- **强制回应**:
  - S-0015: ...
- **裁定模式**: INITIAL_ACTION
- **方案结果**: APPROVED
- **获准方案**: 0000-0003-2026-0806
- **方案快照**: 0000-0003-2026-0806#PS-002
- **获准 action**: ...
- **验收标准引用**: 0000-0003-2026-0806#AC-001, 0000-0003-2026-0806#AC-002
- **证据处置**: RULE_NOW
- **接受的未覆盖风险**: CR-001 所列 Q-002 与未抽中单一来源主张
- **BOS 处置**: BOS-001 | BO-001、BO-002 均为 WAIVED_BY_RULING；理由见接受的未覆盖风险 | 无 OPEN BO
- **acceptance series**: AS-001
- **阶段授权**: BOS-001 状态事件全部追加后 SI-003 implementation 生效；实施 artifact、revision 与快照哈希归档后，SI-004 acceptance 条件生效
- **下一状态/SI**: implementing | SI-003 implementation
- **停止条件**: BOS-001 状态事件全部追加后进入 SI-003
```

`记录类型` 只允许 `MOTION_RULING`、`PLAN_RULING`、`EXPRESS_RULING`、`DEBATE_RULING`、`ACCEPTANCE_RULING`、`RECONSIDERATION_RULING`、`PROCEDURAL_RULING`、`PROCEDURAL_AUTHORITY_RULING`、`PARTICIPATION_RULING`、`EVIDENCE_DIRECTION`、`TRACK_RULING`、`SCOPE_RULING`、`REFRAME_RULING`、`SIDE_CASE_RULING`、`TERMINATION_RULING`、`FAST_TRACK_DIRECTIVE`。

基础实体裁定与程序裁定使用以下固定 payload 与迁移：

| 类型 | 固定 payload（按序） | 状态迁移 |
|---|---|---|
| `MOTION_RULING` | **强制回应**、**议案结果** (`APPROVED / REJECTED`)、**是否需要实施** (`true / false`)、**证据处置**、**接受的未覆盖风险**、**接受的未覆盖 Full 风险**、**BOS 处置**、**下一状态/SI**、**停止条件** | `APPROVED + true → proposal/new SI`；`APPROVED + false` 或 `REJECTED →` BOS 状态事件后 `closed` |
| `PLAN_RULING` | **强制回应**、**裁定模式** (`INITIAL_ACTION / ACCEPTANCE_REVISION`)、**方案结果** (`APPROVED / REJECTED`)、**获准方案**、**方案快照**、**获准 action**、**验收标准引用**、**证据处置**、**接受的未覆盖风险**、**接受的未覆盖 Full 风险**、**BOS 处置**、**acceptance series**、**阶段授权**、**下一状态/SI**、**停止条件** | `INITIAL_ACTION + APPROVED → implementation/new SI + new AS`；`ACCEPTANCE_REVISION + APPROVED → implementation/new SI + inherited AS/BOS/DES/cycle`；initial rejection 在状态事件后 `closed`，revision rejection 保留验收失败并回 `awaiting-ruling` |
| `EXPRESS_RULING` | **强制回应**、**裁定模式** (`INITIAL_ACTION / ACCEPTANCE_REVISION`)、**综合结果** (`APPROVED / REJECTED`)、**获准方案**、**方案快照**、**获准 action**、**验收标准引用**、**证据处置**、**接受的未覆盖风险**、**BOS 处置**、**acceptance series**、**阶段授权**、**下一状态/SI**、**停止条件** | 与 `PLAN_RULING` 相同；`综合结果` 是合并庭审唯一实体结果，不再另写互相独立的议案/方案结果 |
| `DEBATE_RULING` | **强制回应**、**裁定模式** (`INITIAL_ACTION / ACCEPTANCE_REVISION`)、**方案结果** (`APPROVED / REJECTED`)、**获准方案**、**方案快照**、**获准 action**、**验收标准引用**、**证据处置**、**接受的未覆盖风险**、**BOS 处置**、**acceptance series**、**阶段授权**、**下一状态/SI**、**停止条件** | 与 `PLAN_RULING` 相同；不创建独立议案结果 |
| `PROCEDURAL_RULING` | **授权来源** (`STANDING_AUTHORITY@roles/procedural-judge.md#授权裁定权-当前授权清单@<content-hash>` 或变更授权的 `R-####`)、**程序问题类型**、**程序结果**、**作用边界**、**状态影响**、**下一状态**、**停止条件** | 不得批准 action、增员、改 Track、创建 AS 或最终处置 BOS；按下述有限结果更新证据/传票状态，或转 `awaiting-ruling` 等待 Chief |
| `PROCEDURAL_AUTHORITY_RULING` | **授权动作** (`ENABLE / DISABLE / REPLACE_SCOPE / REVOKE_ALL`)、**旧授权引用/hash**、**新授权清单/hash**、**作用范围**、**生效时间**、**后继授权引用**、**停止条件** | 公共 **裁定身份** 必须是 `Chief Judge`；只改变后续 `PROCEDURAL_RULING` 的授权来源，不得追溯改写既有 R，也不得批准 action、增员、改 Track、创建 AS 或处置 BOS |

`PROCEDURAL_RULING` 的问题类型与结果只允许：`EVIDENCE_VALIDITY → ADMISSIBLE / INADMISSIBLE`；`ACCEPTANCE_FACT → FAILURE_OBJECTIVE / FAILURE_NOT_OBJECTIVE / DEFENSE_REBUTS / DEFENSE_DOES_NOT_REBUT`；`WITNESS_BLOCKING → BLOCKING / NON_BLOCKING`。`PROCEDURAL_AUTHORITY_RULING` 只能在这三类固定 catalog 内启用、停用或收窄作用范围，**不得定义第四种 issue type、增加 result enum 或改变结果语义**；需要扩展 catalog 时必须先修改本规范，不能靠 case 内裁定动态造协议。standing authority 引用必须带当时文档内容哈希；后续授权变更只能由 `Chief Judge` 的 authority R 产生，下一条程序裁定引用该 R。授权清单以外的问题不得使用 `OTHER` 兜底，必须上报 `Chief Judge`。

上述裁定授权 BO 处置后，Speaker 先在 `record.md` 为每个变化项追加状态事件：

```markdown
#### S-0021 | THREAD_STATUS | speaker-of-the-house → BOS-001/BO-001
- **阶段**: 辩论庭
- **结论**: 依 R-0001 将 BO-001 记为 WAIVED_BY_RULING
- **依据**: R-0001, BOS-001/BO-001
- **不确定性**: CR-001 所列未覆盖风险
- **请求/下一步**: 更新有效 BOS 状态
- **异议线程**: S-0015
- **阻塞项**: BOS-001/BO-001
- **阻塞项状态**: WAIVED_BY_RULING
- **线程状态**: RESOLVED_BY_RULING
- **状态理由**: R-0001 已显式接受未覆盖风险
- **实质增量引用**: R-0001
- **已关闭条件**: S-0015/RC-001 | WAIVED_BY_RULING
- **剩余解决条件**: NOT_APPLICABLE

#### S-0022 | THREAD_STATUS | speaker-of-the-house → BOS-001/BO-002
- **阶段**: 辩论庭
- **结论**: 依 R-0001 将 direct BO-002 记为 WAIVED_BY_RULING
- **依据**: R-0001, BOS-001/BO-002
- **不确定性**: Q-002 仍为已知缺口
- **请求/下一步**: 更新有效 BOS 状态
- **异议线程**: NOT_APPLICABLE
- **阻塞项**: BOS-001/BO-002
- **阻塞项状态**: WAIVED_BY_RULING
- **线程状态**: NOT_APPLICABLE
- **状态理由**: R-0001 已显式接受 Q-002 风险
- **实质增量引用**: R-0001
- **已关闭条件**: Q-002 的冻结退出条件 | WAIVED_BY_RULING
- **剩余解决条件**: NOT_APPLICABLE
```

状态事件完成、全部 BO 终态后，`record.md` 才追加 hearing 闭庭通知：

```markdown
#### S-0023 | NOTICE | speaker-of-the-house → case
- **阶段**: 辩论庭
- **结论**: 实体裁定已完成，当前 hearing 最终闭庭
- **依据**: R-0001, BOS-001
- **不确定性**: 无
- **请求/下一步**: 进入 SI-003 implementation
- **通知类型**: CLOSURE
- **生效时间**: 2026-08-06T20:01:00-07:00
- **影响范围**: debate hearing；case 继续实施
```

`PLAN_RULING / DEBATE_RULING` 使用唯一 **方案结果**，`EXPRESS_RULING` 使用唯一 **综合结果**：

- `INITIAL_ACTION + APPROVED` 必须给出完整方案/快照、至少一项验收标准与非空 action，随后进入 `implementing`；
- `INITIAL_ACTION + REJECTED` 的获准方案为 `NOT_APPLICABLE`，验收标准与 action 为 `无`，随后进入 `closed`；
- `ACCEPTANCE_REVISION + APPROVED` 使用同样完整的方案字段，但按下节 carry-open 规则进入受限 implementation；`ACCEPTANCE_REVISION + REJECTED` 不关闭原验收 BO，返回 `awaiting-ruling`。

任何实体裁定引用最新 CR 而隐式选择 `RULE_NOW` 时，都必须填写 **证据处置** 与 **接受的未覆盖风险**；Full 另填 **接受的未覆盖 Full 风险**。`EMPTY / INHERITED_ONLY` 时风险字段可为 `无`，但仍引用 DES 与 `CR = NOT_APPLICABLE`。initial action 的最终批准、驳回、通过验收或终止当前收敛域的裁定还须填写 **BOS 处置**，逐项保留既有终态，并把每个剩余 OPEN BO 明示为已满足或 `WAIVED_BY_RULING`。验收返修只允许三种非终态 BOS 处置：返回方案入口的 `KEEP_OPEN_FOR_REVISION_HEARING`、进入实施的 `CARRY_OPEN_TO_IMPLEMENTATION`、返修方案驳回后的 `KEEP_OPEN_AWAITING_RULING`。每种都须逐项列出仍 OPEN 的验收 BO/atom，引用继承的 AS、BOS、effective DES 与 active revision cycle，并使用发言协议规定的对应状态理由；不得新增 BO/RC、清空 cycle 或宣称 rank 已下降。Speaker 以 `THREAD_STATUS` 追加保持 OPEN 的状态事件后，才可关闭当前 hearing 并原子进入裁定点名的 phase/state。其他裁定授权的状态变化均由 Speaker 逐项追加 `THREAD_STATUS`，该状态历史才是 effective BOS 的 canonical source；只有终局裁定的全部状态事件完成后才可最终 `CLOSURE`。普通 `RETURN_FOR_REVISION` 不跨 hearing，只保持 OPEN。

`INITIAL_ACTION` 批准实施时必须分配新的唯一 **acceptance series** `AS-###` 并填写 **阶段授权**：点名 implementation SI，并以可判定触发条件点名紧随其后的 acceptance SI。`ACCEPTANCE_REVISION` 不得新建 AS，必须复用原 AS，并点名继承 BOS、effective DES、active revision cycle 与后继 implementation/acceptance SI。只有授权条件实际满足后才能创建对应 `AT-###`；同一 action 的所有后继 AT 与复议沿用该 AS，这不改变 roster，后续执行者仍受其已批准访问范围约束。

## Fast Track 指派

下例属于独立的 `0000-0002-2026-0806` Fast case，不续接上面的 Debate `R-####` 序列：

```markdown
<!-- case_id: 0000-0002-2026-0806 -->
## R-0001 | Fast Track 指派 | 2026-08-06T18:30:00-07:00
- **裁定身份**: Chief Judge
- **记录类型**: FAST_TRACK_DIRECTIVE
- **依据**: INTAKE@sha256:..., DES-001, CR-001 / NOT_APPLICABLE
- **证据质疑处置**: NOT_APPLICABLE
- **Fast 五项判定**: reversible=true | single_owner=true | contract_change=false | material_dispute=false | external_or_money=false
- **write_set**: `src/example/**`
- **contract_set**: 无
- **执行 owner**: code-owner-example
- **authority refs**: INTAKE@2026-08-06T18:00:00-07:00 | intake-sha256:...
- **BOS 处置**: BOS-001 | 逐项写 `SATISFIED / WAIVED_BY_RULING` 及理由 | 指派后无 OPEN BO
- **获准 action**: ...
- **可逆性**: ...
- **回滚方式**: ...
- **决策证据集**: DES-001
- **置信度报告**: CR-001 / NOT_APPLICABLE
- **证据处置**: RULE_NOW / NOT_APPLICABLE
- **接受的未覆盖风险**: ... / 无
- **验收标准**:
  - AC-001 | ...
- **acceptance series**: AS-001
- **阶段授权**: Speaker 完成 intake BOS 状态事件后，SI-002 implementation 生效；实施 artifact、revision 与快照哈希归档后，SI-003 acceptance 条件生效
- **下一状态/SI**: implementing | SI-002 implementation
- **停止条件**: intake BOS 状态事件全部追加
```

`FAST_TRACK_DIRECTIVE` 自身是方案、Fast 的最终实体处置与裁定；其 AC 引用写为 `<case-id>#R-####/AC-###`，并为该 action 分配唯一 `AS-###`。存在 `CR-###` 时引用它即隐式选择 `RULE_NOW`；`EMPTY / INHERITED_ONLY` 时引用 DES、继承历史（如有）与 `CR = NOT_APPLICABLE`。即使 Fast 没有 hearing，也必须逐项处置 intake BOS：CR 或继承历史正面支持退出条件的可 `SATISFIED`，未抽中/未覆盖但 Chief 接受风险的写 `WAIVED_BY_RULING`；Speaker 依裁定追加对应 `THREAD_STATUS` 后才进入 implementation。

## 参与名单变更裁定

下例属于独立的 `0000-0005-2026-0806` case：

```markdown
<!-- case_id: 0000-0005-2026-0806 -->
## R-0001 | 参与名单裁定 | 2026-08-06T20:10:00-07:00
- **裁定身份**: Chief Judge
- **记录类型**: PARTICIPATION_RULING
- **依据**: RP-001
- **证据质疑处置**: NOT_APPLICABLE
- **参与请求**: RP-001
- **请求动作**: ADD / REMOVE / CHANGE_SCOPE / CHANGE_DELIVERY / WAIVE_DELIVERY
- **参与裁定**: APPROVED / REJECTED
- **agent instance**: expert-example
- **角色**: Expert
- **原批准来源**: NOT_APPLICABLE / R-#### / INTAKE@...
- **具体交付**: Q-002
- **可访问范围**: 仅读取 Q-002 相关档案
- **blocking**: false
- **rejection_predicate**: REJECTED 时写可判定的拒绝前提；APPROVED 时为 NOT_APPLICABLE
- **允许重提条件**: 明确影响同一 target 或 rejection_predicate 点名覆盖角色、且会推翻该 predicate 的已编号 ADMIT_MATERIAL、SCOPE_RULING 或 PARTICIPATION_RULING；APPROVED 时为 NOT_APPLICABLE
- **下一状态**: 返回请求前状态
- **停止条件**: RP-001 更新为 approved / rejected 并同步 current roster（如适用）
```

每个 `RP-###` 单独裁定；批准 A 不批准同一请求之外的 B。获准 `ADD` 新增当前 roster 行；`REMOVE` 删除当前行但保留初始历史；`CHANGE_*` 更新当前行并把最新来源改为本 R；`WAIVE_DELIVERY` 解除该交付的闭庭义务。裁定后更新请求状态并保留本 `R-####` 引用。REJECTED 必须给出可由后来状态变化判定真假的 `rejection_predicate`；“目前不需要”等不可复算文字不合格。重提使用新的 RP，并引用旧 RP、本 R 与推翻 predicate 的同 target 状态变化。

## Track、范围、side case 与终止裁定

范围变化先使用不产生实施效果的请求：

```markdown
<!-- case_id: 0000-0006-2026-0806 -->
#### S-0005 | SCOPE_REQUEST | code-owner-example → Q-001
- **阶段**: 辩论庭
- **结论**: 请求把 `src/new/**` 加入 write_set
- **依据**: Q-001
- **不确定性**: 新范围可能触发 Track 变化
- **请求/下一步**: Chief Judge 裁定 SR-001
- **范围请求编号**: SR-001
- **目标 Q/方案**: Q-001
- **write_set 变化**: ADD `src/new/**`
- **contract_set 变化**: 无
- **owner slot 变化**: 请求新增一个尚未编号的 owner slot
- **决策理由**: 不增加该对象则无法满足 Q-001 的既定验收路径
- **Track 影响**: 需重判
```

`TRACK_RULING` 用于不处于证据等待状态时的重分类，必填 **原 track**、**目标 track**、**触发条件**、**继承阶段/SI**、**继承证据状态**、**BOS 处置** (`NOT_APPLICABLE / KEEP_BOS / ATOMIC_REFRAME`) 与 **停止条件**。`NOT_APPLICABLE` 只在 effective BOS 尚不存在时合法；已有 BOS 时必须 KEEP 或选择 `ATOMIC_REFRAME`，后者在同一 R 内嵌下节全部重框字段并与 Track 原子生效。若已经有 CR，也可由 `EVIDENCE_DIRECTION: RECLASSIFY` 完成同一转换；同一争点两种路径都不得重置 SI、证据历史、active revision cycle 或首批资格。

`SCOPE_RULING` 必须引用 `SR-###`，并填写 **结果** (`APPROVED / REJECTED`)、**原 write_set/contract_set**、**新 write_set/contract_set**、**owner slot 变化**、**Track 复核**、**roster 影响**、**BOS 处置** (`KEEP_BOS / ATOMIC_REFRAME / NOT_APPLICABLE`) 与 **停止条件**。BOS 已冻结时，`KEEP_BOS` 必须说明范围变化为何不新增退出条件；`ATOMIC_REFRAME` 在同一 R 内嵌下节全部字段，使范围与 successor BOS 原子生效。只有 `APPROVED` 后才更新 `case.md` 当前范围；新增 agent 仍须独立 `PARTICIPATION_RULING`。DES 已冻结时，范围批准本身不授权换方案或换证，仍须另行 `RETURN_FOR_REVISION`。

## BOS 重框裁定

standalone `REFRAME_RULING` 只用于不依赖同时范围/Track 变化的同一争点重框；需要联动时由消费 ruling 内嵌 `ATOMIC_REFRAME`，两者使用完全相同字段并在单条 R 内原子激活 successor BOS。必填：**旧 BOS**、**新 BOS**、**触发来源**、**同一争点** (`true`)、**BO lineage** (`旧 BO | 新 BO/终态 | 状态继承 | 理由`)、**condition/RC lineage** (`旧退出条件或 S/RC | 新条件/终态 | 状态继承`)、**旧/新 OPEN BO 数**、**旧/新 OPEN condition/RC atom 数**、**继承 SI**、**继承 effective DES**、**继承 sampling scope**、**首批消耗状态**、**继承 active revision cycle** 与 **停止条件**。新 BOS 的 `OBLIGATION_SET` 正文仍写入 `record.md`，但必须与该 R 在同一 archive transaction 原子追加；任一单独存在都不生效。旧终态 BO/condition 必须保持同一状态；旧 OPEN atom 只可继承、合并或转为终态，新 OPEN BO 与 atom 数均不得增加，不得生成新 RC，也不得用新编号重开等价义务。active cycle 处于 `PENDING_VERIFICATION` 时必须原样传给 successor BOS，rank 未下降前不得再次 RETURN。无法满足该 rank 条件的新 blocker 必须以 `SPLIT`/新 case 处理。

`SIDE_CASE_RULING` 必填 **parent**、**child**、**动作** (`OPEN_BLOCKING / OPEN_NON_BLOCKING / RESUME_PARENT / TERMINATE_PARENT`)、**状态变化** 与 **停止条件**。blocking child 的 `closed / terminated` 不自动恢复 parent。

`TERMINATION_RULING` 必填 **终止对象**、**终止理由**、**未完成 action**、**外部/回滚处置**、**关联 parent/child 处置** 与 **终态**；终态只允许 `terminated`。

## 证据方向裁定

所有 `EVIDENCE_DIRECTION` 先写公共字段：

```markdown
<!-- case_id: 0000-0004-2026-0806 -->
## R-0001 | 证据方向 | 2026-08-06T20:20:00-07:00
- **裁定身份**: Chief Judge
- **记录类型**: EVIDENCE_DIRECTION
- **依据**: DES-001, CR-001 / DES-001, CR = NOT_APPLICABLE
- **证据质疑处置**: NOT_APPLICABLE / S-#### | CLOSED | disposition
- **决策证据集**: DES-001
- **上一置信度报告**: CR-001 / predecessor CR-001 / NOT_APPLICABLE
- **返修周期**: NOT_APPLICABLE / R-#### PENDING_VERIFICATION
- **证据方向**: RULE_NOW / NEXT_RANDOM_16 / TARGETED_CHECK / RETURN_FOR_REVISION / RECLASSIFY
```

随后按方向追加：

| 方向 | 必填字段 |
|---|---|
| `RULE_NOW` | **接受的未覆盖风险**；Full 另填 **接受的未覆盖 Full 风险**；**停止条件** |
| `NEXT_RANDOM_16` | **合格未查总体**、**本批上限**、**停止条件** |
| `TARGETED_CHECK` | **目标 DES/DU**、**核验理由**、**决策影响**、**停止条件** |
| `RETURN_FOR_REVISION` | **返修目标**、**未关闭阻塞项**、**冻结 BO 退出条件**、**未关闭 RC** (`NOT_APPLICABLE` 允许)、**本次必须关闭的 atom**、**返修要求**、**允许新增材料范围**、**successor DES 要求**、**停止条件** |
| `RECLASSIFY` | **目标 track**、**触发条件**、**继承 SI**、**继承证据状态**、**BOS 处置** (`NOT_APPLICABLE / KEEP_BOS / ATOMIC_REFRAME`)、**停止条件**；`NOT_APPLICABLE` 仅限尚无 effective BOS，选择重框时同一 R 内嵌全部重框字段 |

`RULE_NOW / RETURN_FOR_REVISION / RECLASSIFY` 不产生 `CR-###`。`NEXT_RANDOM_16 / TARGETED_CHECK` 完成后产生新 CR，并引用本裁定。非空 successor DES 写 `AWAITING_CHIEF_DIRECTION` 时，公共依据写 `successor DES, RETURN R, predecessor CR / CR = NOT_APPLICABLE`，**返修周期**写该 RETURN R；当前周期 rank 未下降前不得再次 RETURN。`EMPTY / INHERITED_ONLY` 使用 `DES-###, CR = NOT_APPLICABLE` 并进入 `awaiting-ruling`，后者另列全部继承 CR；普通集合只允许规则明确适用的 `RETURN_FOR_REVISION / RECLASSIFY` 或实体裁定，若已有等-rank `PENDING_VERIFICATION` cycle 则再排除 RETURN。`EMPTY` 不得 `NEXT_RANDOM_16 / TARGETED_CHECK`，`INHERITED_ONLY` 不得重复核验未变化 DU。`REPLACEMENT_REQUIRES_TARGETED_CHECK` 不得出现在随机批。direct BO 没有关联 RC 时，**未关闭 RC** 写 `NOT_APPLICABLE`，以 **冻结 BO 退出条件** 作为待关闭 atom；完整返修周期结束、或再次授权 RETURN 前才检查全案 rank 是否严格减少。

## 验收文档

首个验收观察与首次回应窗口结束后，`record.md` 追加并冻结同一获准 action 后续 AT 都要继承的验收 BOS：

```markdown
#### S-0024 | OBLIGATION_SET | speaker-of-the-house → case
- **阶段**: 验收
- **结论**: 冻结本 action 的验收阻塞清单
- **依据**: R-0001, AT-001, E-0013, E-0014
- **不确定性**: 无
- **请求/下一步**: 冻结 DES 并执行首批抽样
- **阻塞清单编号**: BOS-002
- **收敛域/SI**: AS-001 | SI-004
- **形成基线**: AT-001 initial observation | 0000-0003-2026-0806#PS-002
- **首次审查截止**: 2026-08-06T21:07:00-07:00
- **阻塞项**:
  - BO-001 | 0000-0003-2026-0806#AC-001 | AC-001 | 冻结实施快照满足 AC-001 | OPEN
  - BO-002 | 0000-0003-2026-0806#AC-002 | AC-002 | 冻结实施快照满足 AC-002 | OPEN
- **阻塞项状态理由**:
  - BO-001 | AWAITING_EVIDENCE
  - BO-002 | AWAITING_EVIDENCE
- **清单摘要哈希**: sha256:bos2...
```

验收通过或转入失败庭审都由 `Chief Judge` 作实体裁定；下例写入 `ruling.md`，CR-002 已正面支持 AC-001，但未覆盖 AC-002：

```markdown
## R-0002 | 验收裁定 | 2026-08-06T21:15:00-07:00
- **裁定身份**: Chief Judge
- **记录类型**: ACCEPTANCE_RULING
- **依据**: AT-001, S-0024, BOS-002, DES-002, CR-002
- **证据质疑处置**: NOT_APPLICABLE
- **AT**: AT-001
- **验收结果**: PASSED
- **证据处置**: RULE_NOW
- **接受的未覆盖风险**: CR-002 未覆盖 AC-002；按当前观察接受其残余不确定性
- **BOS 处置**: BOS-002 | BO-001 SATISFIED（CR-002 正面支持退出条件）；BO-002 WAIVED_BY_RULING（接受 AC-002 未覆盖风险）
- **下一状态**: Speaker 完成 BOS 状态事件后 closed
- **停止条件**: BOS-002 无 OPEN BO
```

`record.md` 随后追加两个 direct BO 状态事件；它们不创建异议线程：

```markdown
#### S-0025 | THREAD_STATUS | speaker-of-the-house → BOS-002/BO-001
- **阶段**: 验收
- **结论**: 依 CR-002 与 R-0002 将 BO-001 记为 SATISFIED
- **依据**: BOS-002/BO-001, CR-002, R-0002
- **不确定性**: 无
- **请求/下一步**: 更新有效验收 BOS
- **异议线程**: NOT_APPLICABLE
- **阻塞项**: BOS-002/BO-001
- **阻塞项状态**: SATISFIED
- **线程状态**: NOT_APPLICABLE
- **状态理由**: CR-002 正面支持冻结退出条件
- **实质增量引用**: CR-002, R-0002
- **已关闭条件**: 冻结实施快照满足 AC-001
- **剩余解决条件**: NOT_APPLICABLE

#### S-0026 | THREAD_STATUS | speaker-of-the-house → BOS-002/BO-002
- **阶段**: 验收
- **结论**: 依 R-0002 将 BO-002 记为 WAIVED_BY_RULING
- **依据**: BOS-002/BO-002, CR-002, R-0002
- **不确定性**: AC-002 未被 CR-002 抽中
- **请求/下一步**: 更新有效验收 BOS
- **异议线程**: NOT_APPLICABLE
- **阻塞项**: BOS-002/BO-002
- **阻塞项状态**: WAIVED_BY_RULING
- **线程状态**: NOT_APPLICABLE
- **状态理由**: R-0002 已显式接受未覆盖风险
- **实质增量引用**: R-0002
- **已关闭条件**: 冻结实施快照满足 AC-002 | WAIVED_BY_RULING
- **剩余解决条件**: NOT_APPLICABLE
```

```markdown
---
case_id: 0000-0001-2026-0806
updated_at: 2026-08-06T21:17:00-07:00
---

# 验收

## AT-001 | 2026-08-06T21:00:00-07:00
- **stage instance**: SI-004
- **acceptance series**: AS-001
- **实施依据裁定**: R-0001
- **验收阶段授权**: R-0001 | SI-004 条件已由 artifact/revision/hash 归档满足
- **方案/快照**: 0000-0003-2026-0806#PS-002
- **artifact / revision**: `abc123` | `dist/example.bundle`
- **实施快照哈希**: sha256:implementation...
- **验收身份**: Acceptance Inspector
- **验收标准引用**:
  - 0000-0003-2026-0806#AC-001
  - 0000-0003-2026-0806#AC-002

### 初始观察 | 2026-08-06T21:05:00-07:00
- **检查方法**:
  - 0000-0003-2026-0806#AC-001 | ...
  - 0000-0003-2026-0806#AC-002 | ...
- **观察结果**:
  - 0000-0003-2026-0806#AC-001 | ...
  - 0000-0003-2026-0806#AC-002 | ...
- **证据**: E-0013, E-0014
- **初始验收结论**: 通过

### Obligation-control history
- 2026-08-06T21:07:00-07:00 | S-0024 | BOS-002 | AC-001、AC-002 对应 BO 均 OPEN；reason=AWAITING_EVIDENCE | frozen

### Evidence-control history
- 2026-08-06T21:10:00-07:00 | AS-001 | DES-002 | CR-002 | awaiting-evidence-direction
- 2026-08-06T21:15:00-07:00 | AS-001 | DES-002 | CR-002 | R-0002 ACCEPTANCE_RULING / RULE_NOW

### Obligation-control history (continued)
- 2026-08-06T21:16:00-07:00 | S-0025 | BOS-002/BO-001 | SATISFIED | CR-002, R-0002
- 2026-08-06T21:16:01-07:00 | S-0026 | BOS-002/BO-002 | WAIVED_BY_RULING | R-0002

### Final disposition | 2026-08-06T21:17:00-07:00
- **最终验收结论**: 通过
- **依据**: AT-001 初始观察, S-0024, BOS-002, DES-002, CR-002, R-0002, S-0025, S-0026
- **case 结果**: closed
```

AT header 创建后不可改写；初始观察、BOS 指针、每次 DES/CR/R 状态与 final disposition 按时间追加。每次实施快照使用新的 `AT-###` 与 acceptance SI，但同一获准 action 的后续 AT 继承原 `AS-###`、验收 BOS、effective DES 链与首批消耗状态，不得新增阻塞义务，也不得新增或重置自动首批额度。若该 AS 从未产生 `FIRST_RANDOM_16`，后继 DES 首次出现 `RANDOM_ELIGIBLE` 未查 DU 时可消费原有唯一额度。实际 CR 或 `AWAITING_CHIEF_DIRECTION` 进入证据方向；`EMPTY / INHERITED_ONLY` 的 history 写 `DES-### | NOT_APPLICABLE | awaiting-ruling`，不创建 CR。标准变化必须先产生新方案或 Fast 指派，不得在验收文档中改写。

`ACCEPTANCE_RULING` 必填 **AT**、**验收结果** (`PASSED / FAILED_TO_HEARING`)、**证据处置**、**接受的未覆盖风险**、Full case 专用的 **接受的未覆盖 Full 风险**、**BOS 处置**、**下一状态** 与 **停止条件**；非 Full 不写 Full 专用字段。`PASSED` 必须逐项把 BO 记为 `SATISFIED / WAIVED_BY_RULING`，状态事件完成后才 `closed`；`FAILED_TO_HEARING` 保留失败相关 OPEN BO 并进入验收庭审，不得提前终态化。

验收庭审后的 `RECONSIDERATION_RULING` 必填 **AT**、**客观失败与辩护状态**、**复议动作** (`ACCEPT / TERMINATE / SPLIT / REAUTHORIZE_REVISION`)、**返修类型** (`IMPLEMENTATION_ONLY / PLAN_CHANGE / NOT_APPLICABLE`)、**BOS 处置** (`FINAL / KEEP_OPEN_FOR_REVISION_HEARING / CARRY_OPEN_TO_IMPLEMENTATION`)、**未关闭阻塞项**、**冻结 BO 退出条件**、**未关闭 RC** (`NOT_APPLICABLE` 允许)、**本次必须关闭的 atom**、**获准返修范围**、**继承 AS/BOS/effective DES/首批状态/active cycle**、**返修入口**、**停止条件** 与 **下一状态/SI**。`ACCEPT` 只在记录已经支持辩护推翻失败时使用，须逐项作 `FINAL` BOS 处置并通过验收；`REAUTHORIZE_REVISION` 保留 OPEN 项，允许一次 `PENDING_VERIFICATION` 等-rank 中间态，但再次授权返修前必须严格减少全案 rank。返修入口固定为：Fast 在仍满足准入时可直接进入受限 implementation revision；Express 的 `IMPLEMENTATION_ONLY` 可直达受限 implementation revision，`PLAN_CHANGE` 回 combined；Debate 的 `IMPLEMENTATION_ONLY` 可直达受限 implementation revision，`PLAN_CHANGE` 回 debate；Full 为保持完整九步，无论类型均回 proposal。直达 implementation 时本条 R 使用 `CARRY_OPEN_TO_IMPLEMENTATION` 并授权后继 SI；回方案入口时使用 `KEEP_OPEN_FOR_REVISION_HEARING`，后续 `PLAN_RULING / EXPRESS_RULING / DEBATE_RULING` 必须采用 `裁定模式 = ACCEPTANCE_REVISION`，复用原 AS/BOS/DES/cycle。该后续方案若驳回，使用 `KEEP_OPEN_AWAITING_RULING` 回到 Chief，不得再次自动返修。所需变化若破坏当前 Track 准入，须先以 `TRACK_RULING / RECLASSIFY` 改档，不能硬套原入口。`TERMINATE / SPLIT` 也使用 `FINAL` 作终局处置。每次返修都须由 `Chief Judge` 明示选择；不设固定次数，但不得自动回环或授权开放式“继续优化”。

## 相关性处置清单

`parking-lot.md` 中每项使用 `P-###`，共同字段为 **提交摘要哈希**、**关联决定**、**处置** 与 **处置理由**。来源若已入主记录可引用既有 S/E；否则不得为它补分配编号。

| 处置 | 额外必填字段 |
|---|---|
| `ADMIT_CONTEXT` | **背景用途** |
| `MERGE_DUPLICATE` | **合并至编号** |
| `PARK_OUT_OF_SCOPE` | **命中的 non_goal/范围边界**、**未来触发条件** |
| `PARK_PREMATURE` | **尚未满足条件**、**未来触发条件** |
| `RETURN_NO_LINK` | **缺失的决策链接**、**允许重排入口** |

这些条目不具证明力，不进入决策证据集，也不触发增员、续轮或闭庭门禁。
