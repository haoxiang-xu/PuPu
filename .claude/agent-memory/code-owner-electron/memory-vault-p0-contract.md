---
name: memory-vault-p0-contract
description: Memory V2 P0 vault 控制面的 IPC 契约与安全不变量（2026-08-01 落地）——改 memory_vault 前必读的单向门清单
metadata:
  type: project
---

Memory V2 P0 Vault 控制面已落地（electron/main/services/memory_vault/ + MEMORY_VAULT channel 组 + window.memoryVaultAPI + src/SERVICEs/bridges/memory_vault_bridge.js）。

**Why:** 安全 owner 的条件 SIGN-OFF 把以下几条定成了不可回退的契约，代码注释里有但容易在后续 phase 被"顺手"破坏：

- **listDescriptors / grant 都是 scope-bound**：两者都必须同时给 `scopeKind`+`scopeId`，缺一或只给一半 = 拒绝。没有"列全库"调用形态；grant 只在 handle 属于该 exact scope 时通过，跨 scope 与不存在返回**同一个** `secret_not_found`（防 handle 存在性探针）。preload 侧两个 scope 字段**永远显式转发**（不能条件省略，否则空 filter 会被读成 list-all）。
- **grant 目标是封闭 sink 枚举**，不是自由字符串 grantee：`computer_input` / `shell_secret_env` / `shell_secret_stdin` / `mcp_schema_secret`，存 `sink_kind` 列，其它一律 `invalid_sink_kind`（不做 trim/大小写折叠）。加成员 = 安全评审事件。renderer 侧 `MEMORY_VAULT_SINK_KINDS` 是镜像副本，main 才是权威。
- **getStatus 不回任何行数**（曾经有 `counts`，已删）：计数是对全库的无 scope 观测，等于免费 oracle。要数量走 scope-bound listDescriptors。测试锁死 key 集合 = {ok, available, secretStorageStatus}(+degraded 时 reason)。
- **vault_grants.handle 是真 FK → vault_secrets(handle) ON DELETE CASCADE**，且 init 里 `assertForeignKeysEnforced()` 查 PRAGMA，查不到就进 degraded（fail closed）。service 里那句显式 DELETE grants 只为拿 revokedGrants 计数 + 双保险，权威保证是 FK。`ensureGrantsSchema()` 是幂等收敛：老 preflight 表（grantee 无 FK）整表重建，只搬「handle 还活着且 sink 合法」的行，**从不删 secret**。
- **永远没有 read/resolve/decrypt IPC**。deposit 是唯一带明文的通道且只 renderer→main。sink resolution 是延后的独立 phase，需重新过安全评审——不要在 P0 面上加任何读方向方法。测试在 ipc_channels/api_contract/handlers 三层用 `/read|resolve|decrypt|reveal|export|plaintext/` 正则锁死。
- **handle 格式是稳定契约**：`pvh1_<64hex>`（256bit random），grant 是 `pvg1_<32hex>`。改格式=换版本前缀，不是改正则。
- **receipt hash 不含明文也不含 secret 派生物**：deposit 的 fingerprint 只有 {scopeKind, scopeId, label}。已接受的 tradeoff：同 operationId+同非密参数但不同明文 → 按 replay 处理返回原 handle（安全设计使然，不是 bug）。
- **safeStorage fail-closed**：独立探测（不共享 settings 的状态）；Linux 仅信任 gnome_libsecret/kwallet*；encryptString 抛错后本 session 闩死 unavailable；输出必须是 Buffer 且 ≠ 明文字节（防 spoofed safeStorage 把明文写库）。
- **与 settings.db 共文件但只建 vault_secrets / vault_grants / vault_operation_receipts 三表**（独立连接，经 createSettingsDb）。settings resetSettings 不清 vault（有 coexistence 测试锁定）。删 secret 时事务级联删 grants 并留非密 receipt。
- 错误 message 全部静态文案 + `[code] ` 前缀（Electron 会剥 error.code）；handler 日志只打 op 名 + code，绝不打 payload/error.message。

**Sink worker 生产装配（2026-08-01 落地，同属单向门）：**

- **启动顺序是安全要求不是风格**：chat/settings init → vault init → `unchainService.resolveVaultSinkWorkerEntrypoint()`（**只解析一次并冻结**，service 内部 memoize）→ `createVaultSinkExecutors()` → `configureSinkExecutors()` → `startSinkBroker()` → **最后才** `unchainService.startMiso()`。sidecar 是 broker 唯一客户端，先起 sidecar 等于让它够到一个服务不了的 listener。锁在 `memory_vault_startup_assembly.test.cjs`（真加载 index.js + mock service 工厂，不是源码正则）。
- **resolver 零参数、不搜 PATH**：packaged 只用绝对 onefile `unchain-server` + `--vault-sink-worker`（**没有 Python 回退**，二进制丢了就 fail closed，连解释器探测都不跑）；dev 只用绝对 python + 绝对 `server/main.py` + flag。所有失败折叠成同一个静态 `vault_worker_unavailable`（解释器探测的 message 会带本地路径，必须吞掉）。
- **`configureSinkExecutors` 是 main-only + one-shot**：broker 已 start → `vault_sink_executors_locked`（先查，是更强不变量）；重复调用 → `vault_sink_executors_already_configured`；空 registry → `vault_sink_registry_empty`（配置成空≠已配置）。constructor 的 `sinkExecutors` 只是测试 seam，空 map 视为**未配置**。
- **空 registry 绝不开 broker**：`startSinkBroker()` 未配置直接 `vault_sink_unavailable`，不开 listener。
- **registry 追踪所有活 child/process group**，`close()` 是**同步** SIGKILL 进程组并清空（will-quit 不 await promise）。`memoryVaultService.close()` 顺序固定：stop broker → 同步 drain executors → 关 DB；index.js 的 will-quit 再兜底 `vaultSinkExecutorRegistry?.close()`（configure 失败时 vault 不知道它存在）。
- Windows 仍在 build/frame plaintext **之前**拒（`vault_worker_containment_unavailable`）；broker key 仍走 FD3，不进 argv/env/log。

**这个面撑不起一个管理界面（2026-08-07 于案 `0000-0003-2026-0807` 逐条核实，E-0050…E-0055）：**

有人问「vault 的 UI 是不是只差个界面」时，答案是 **不是**，缺的是能力面，且三条性质不同：

- **`grantId` 是写后即不可见的。** `grant()` 返回那一刻是它在系统里唯一一次露面；`listDescriptors` 只给 `grantCount`（一个 `COUNT(*)` 子查询），不给 grantId 也不给 sinkKind；整个 service 没有任何按 handle/scope 枚举 grant 行的读方法。**净效果：`revoke` 在今天的 IPC 面上事实上不可调用**，能做的只有整条 `delete`（FK 级联全撤）。
- **chat 删除不回收 chat 域凭据。** deletion outbox 对 vault 只调 `deleteUseStateForOwnerChat`，其注释逐字禁止级联进 `vault_secrets`/`vault_grants`；而 `DELETE FROM vault_secrets` 全服务只有一处且必须给 `handle`，`handle` 只能从 `listDescriptors(该 chat 的 scopeId)` 取回。**chat 一删，scopeId 从此不可构造 → 那行密文永久驻留 settings.db，任何 UI 都到不了。**这是死区不是 UI 缺失。
- **`vault_secrets` 没有 TTL/status/revoked_at 列** —— 凭据永不过期，删是真删。文件里所有 `expires_at` 都属 `vault_use_intents` 的 10 分钟 intent TTL，别混。
- 落盘位置对用户文案有约束：**本体在 `userData/settings.db` 的 `ciphertext BLOB`，keychain 只托管 safeStorage 的密钥**。界面可诚实展示的字段全集 = label / scope / createdAt / updatedAt / grantCount，**没有查看/复制/验证有效性**（三层正则锁死）。

补法分三档，代价差一个数量级：`list-grants`（+1 channel，仍 scope-bound+handle-bound，不开新枚举维度）< scope 枚举（+1 channel，**直接对撞已签核的「无全库枚举」不变量**，须重过安全评审）< **main-only 的 `deleteSecretsForOwnerChat` 挂进 deletion outbox（零新增 IPC 面，只解孤儿，不解 revoke）**。只想解「存进去的东西会不会永远留在盘上」，第三档就够。

**How to apply:** 动 memory_vault 任何文件前先读 service.js 头部注释；给 vault 加通道必须同时过 CTO（共有动脉）+ 安全 owner；`.js`/`.cjs` twin 是 `require("./x.test.cjs")` 一行包装。相关：[[concurrent-worktree-hazard]]（主树常有并发进程的脏文件，dispatch 前查 status）。
