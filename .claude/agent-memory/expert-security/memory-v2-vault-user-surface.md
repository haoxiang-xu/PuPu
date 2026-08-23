---
name: memory-v2-vault-user-surface
description: 2026-08-07 case 0000-0003 S-0013 鉴定 — Memory V2 vault 凭据管理界面(Q4-B)有条件成立；5 项不成立(C7自锁/枚举不变量已porous/无Traceback/误报前提无据/fail-closed非安全控制)；孤儿凭据与 projection 泄漏均定 Low
metadata:
  type: project
---

# Memory V2 vault 用户可见面 · 鉴定与先例（2026-08-07）

Case `0000-0003-2026-0807`《Memory 的用户可见面》议案庭审，发言 S-0013，证据 E-0080…E-0089。仓库状态 dev @ `8d7fbd1d`。总括结论 **有条件成立**。

**Why**: 本次是 Memory V2 vault 第一次被要求长出用户界面。庭上有四条被当成"安全约束"的说法，其中两条经核实站不住；两个转交给我的 severity 都被高估。这些判断如果不落地，下一次评审会从头再辩一遍，而且很可能得出被高估的那个版本。

**How to apply**: 动到 `electron/main/services/memory_vault/` 、`src/SERVICEs/bridges/memory_vault_bridge.js`、`src/PAGEs/chat/hooks/use_secret_capture_gate.js` 或 `deletion_outbox.js` 时先读本条。以下每条都是**当时实测**，改动后要重新验，不要当永久事实引用。

## 一 · 已核实的 vault 安全现状（当时）

- **秘密材料从未到过渲染进程。** IPC 只有六条封闭通道（deposit / listDescriptors / delete / grant / revoke / getStatus），无 read/resolve/decrypt；`listDescriptors` 的 SQL 不投影 `ciphertext`；`getStatus` 不返回行数；解密只在 main 内 sink 执行路径且显式标注绝不注册为 IPC。**所以 vault 管理界面是元数据界面，风险量级远低于直觉。**
- **`revoke` 今天字面不可调用。** 它只吃 `grantId`，而全仓无任何方法返回 grantId（`listDescriptors` 只给 `grant_count`），service 导出集里没有 `listGrants`。**不存在任何进程曾持有过任何 grantId。**
- **渲染进程已掌握 vault 全部在用 scope 的键集。** `store.chatsById`（会话树数据源）= 全部 chat 域 scopeId；`"pupu.user"` 是编译期常量。**「渲染进程不可枚举 vault」这条 P0 不变量实为「一次调用不可枚举」。**
- **删除 outbox 没有终态失败、没有重试上限**，`pruneReceipts` 只删 `status='complete'`。孤儿凭据**不可能来自重试耗尽**，只能来自 `chats.db` 的 outbox 记录本身消失（vault 在 settings.db，两个文件）。**未完成的 outbox 行本身就是孤儿 scopeId 的发现凭据。**
- **本仓不存在 Traceback→renderer 路径。** `format_exc()` 全仓仅 `unchain_adapter.py` 三处，全部只进 stderr。跨界的是 `str(exc)`。

## 二 · 五条「不成立」（已进 chief-judge 强制回应清单，CEO 尚未回应）

1. **C7 字面表述自锁** —— "不得新增任何 read 通道"会使 Q4-B 的撤销入口永久不可实现。建议重述为：返回体不得含明文/密文；新读通道仅限非秘密授权元数据（grantId/sinkKind/createdAt）且必须 scope-bound。
2. **"新增 scope 枚举推翻 P0 不变量"** —— 不变量已 porous；该能力唯一新增信息是**孤儿 scopeId**。连带："全量清单做不出来"也不成立（O(会话数) 扇出今天可行，是性能问题）。
3. **"projection 把 Traceback 直送 renderer"** —— 是 `str(exc)`，不是 Traceback。
4. **"启发式误报（版本号/UUID）是高频骚扰"** —— 扫描器双重锚定（六条已知规则全带高特异性前缀、无泛化高熵规则；赋值规则以凭据键名为左锚；值侧三道过滤），裸版本号/UUID 结构上不命中。**且从未有人测量过误报率。**
5. **"给 turn mutation 逃生口属安全语义变更"** —— 该 fail-closed 防的是记忆一致性，无攻击者模型、无权限边界。**并非所有 fail-closed 都是安全控制。**

## 三 · 两个 severity（防止下次被重新抬高）

- **孤儿凭据死区 = Low。** 密文 + 无 read 路径 + handle 不可寻址 ⇒ 孤儿比正常凭据更难取用；需机器已被攻陷；非内容可达。真实伤害是"删除预期被违背"（隐私/数据卫生），不是可利用性。**明确拒绝为便于排期而抬级。**
- **`/memory/projection` 泄漏 = Low（单点）。** 读到它需已能执行渲染进程 JS，而那已授予全部 bridge；新增信息仅 OS 用户名。**不独立跨过任何边界。**
- **`str(exc)` 类整体 = 拒绝定级。** sidecar 非测试代码里 109 处，只核实了 2 处。**明确拒绝由一个样本推断一个类**——建议独立只读侧案。这条纪律比结论本身更值得记住。

## 四 · 我提的硬条件（若 Q4-B 施工）

1. C7 须重述（否则不可交付）。
2. **`grant` 不得出现在管理界面上。** sink kinds = `computer_input` / `shell_secret_env` / `shell_secret_stdin` / `mcp_schema_secret`，即 shell 执行、computer use、MCP schema 注入。设置页里的授予开关 = 预授权 UI，抵消 per-use 原生确认。界面只允许**撤销**（减权），不允许**授予**（加权）。
3. 界面不得沉默少报——**少报的凭据清单比没有清单更危险**（把"不知道"变成"错误地确信")。
4. 删除文案须诚实：删的是本机密文，撤不回已发出去的东西。写 "Delete from this device"，不写 "Revoke"。

## 五 · 推荐的占优方案（供后续引用）

**主进程侧孤儿对账清扫**：main 同时可读 `vault_secrets` 的 chat 域全集、`chats.db` 现存 chatId、未完成 outbox 行；差集即孤儿，直接删，只对渲染进程暴露一个计数。一次改动同时闭合三件事 —— 孤儿不再驻留、"设备+本会话"口径在语义上变完整、渲染进程不获得任何新枚举能力。**优于新增 renderer 枚举通道。**

## 六 · 顺带登记

- `CONFLICT_MANUAL`（`src/PAGEs/chat/hooks/context_v2_turn_mutation.js`）全仓仅 1 处出现即定义本身，**死字符串**，用户从未见过。清理 vs 接线是两个决定。
- `/memory/projection` 的 `session_id` 校验先于 `_is_authorized()`；同文件 `/memory/long-term/projection` 顺序正确。**Informational**，建议两行对调。
- 若做「按凭据记住」的进程内抑制：键必须是**进程内随机盐的加盐哈希**，绝不存原值（哈希 = 离线可爆破验证器，而扫描器命中的值多为结构化/低熵）。持久化的 per-credential 豁免 **不成立**。

相关：[[phase4-secret-storage-decision]]、[[memory-v2-context-reference-double-gate]]、[[flask-sidecar-posture]]、[[sec-001-final-verdict]]
