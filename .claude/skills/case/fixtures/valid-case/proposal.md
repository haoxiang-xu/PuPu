---
case_id: P-0000-0001-2026-0812
boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222
updated_at: 2026-08-12T12:00:00Z
---

# 方案

## P-0000-0001-2026-0812
- **主 owner**: code-owner-service-a
- **目标结果**: 在固定版本组合中传递并恢复一个任务
- **non_goals**: 不改变外部授权范围
- **contract_set**: BC-001
- **state character**: STATEFUL
- **验收标准**:
  - AC-001 | 真实 producer 输出通过最终 consumer
  - AC-002 | 未知字段在最终 consumer 被拒绝
  - AC-003 | 首次使用创建唯一任务
  - AC-004 | 重复使用保持 identity 且不重复提交
  - AC-005 | retry/resume 保持 attempt 与 interaction 语义
  - AC-006 | 冷重启后恢复同一 durable task
- **boundary obligations**: BC-001
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | service-a 到 service-b
- **producer**: service-a 的真实任务 envelope
- **producer owner**: code-owner-service-a
- **consumer**: service-b 的最终 admission boundary
- **consumer owner**: code-owner-service-b
- **canonical representation**: UTF-8 canonical JSON task envelope v2
- **consumer projection**: task_id, attempt_id, interaction_id, payload
- **admission policy**: CLOSED
- **admission details**: 精确允许四个字段，字段类型与顺序规范化后比较
- **unknown input behavior**: 返回 stable invalid-contract error
- **failure semantics**: fail closed，不持久化部分任务，不调用下游
- **identity/version binding**: producer sha256:1111111111111111111111111111111111111111111111111111111111111111 + consumer sha256:2222222222222222222222222222222222222222222222222222222222222222
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-001
- **positive acceptance**: AC-001
- **negative acceptance**: AC-002

### SEQ-001 | durable task 生命周期
- **owner**: code-owner-service-b
- **owner confirmation**: HS-002
- **identity key**: task_id + attempt_id + interaction_id
- **initial state**: task 不存在且没有 receipt
- **ordered events**: first use → repeat → retry → resume → cold restart
- **expected observations**: 每一步 identity、receipt、side effect count 与 error 均符合获准语义
- **persistence boundary**: service-b durable task journal at schema v2
- **boundary contracts**: BC-001
- **positive acceptance**: AC-003, AC-004, AC-006
- **negative acceptance**: AC-005
- **first use**: REQUIRED | AC-003
- **repeat**: REQUIRED | AC-004
- **retry**: REQUIRED | AC-005
- **resume**: REQUIRED | AC-005
- **restart**: REQUIRED | AC-006
- **reset**: NOT_APPLICABLE | 该任务协议没有 reset 操作
- **rollback**: NOT_APPLICABLE | 失败在 consumer admission 前关闭且不产生可回滚 side effect

### PS-001 | 2026-08-12T12:00:00Z
- **supersedes**: null
- **included contributions**: HS-001, HS-002
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574
- **content hash**: sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
- **formed_by**: code-owner-service-a
