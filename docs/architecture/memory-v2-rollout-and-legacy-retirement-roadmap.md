# Memory V2 全量开放与旧链路退役路线图

> 状态：`NO-GO`
> 基线：PuPu `002fb8ad`（2026-08-21）
> 执行原则：后续工作以本文为顺序依据；完成条件以证据为准，不以“代码已存在”或单侧测试通过为准。

## 0. 执行记录（2026-08-21）

已完成 **P0 containment**，但未完成 M1 出口、更未获得全量开放授权：

- 删除路由改为读取持久 marker/schema 决定实际 owner；`off` 不再关闭已存数据的隐私删除 authority；
- absent 或真正 blank 的 SQLite 返回 closed `not_present` 收据，且不创建 root、marker、SQLite、WAL 或 SHM；
- 空 Unchain root 在进入 lifecycle reader 前短路，因此不再留下 extension-only partial schema；
- known legacy / known Unchain schema 即使当前配置为 `off` 也分别交由其真实 owner 删除；unknown、zero-byte、mixed 或 partial schema 返回 typed non-retryable error；
- 相关 sidecar 三组测试为 `50 passed, 3 subtests passed`，Electron deletion-outbox 主测试为 `17 passed`；另以单一构建的 Unchain wheel（`sha256:f9e44d9b27dfb061b26d4fa6a37103ecd5ae0ec69a172cdfc335a8b66448446c`，manifest `sha256:a9b70a1ba8616fd13f91adfbb3cca90b53670abac038996dc413ce5c4252787d`，revision `abd7e08f26452e1dbe2767fac3dbfaff7dfb9f3b`）运行 P0 精确格，`8 passed`。此前 mutable sibling source 测试只作为快速 containment 证据；该 exact pair 仍不替代 P6 的全部状态矩阵。

仍未完成：P6 direct-plan 的完整 BC/SEQ/AC 与验收证据、Electron DELETE 的 strict protocol/deadline/allowlist、Unchain 公开 canonical schema-only bootstrap、empty-scope tombstone、**完整状态矩阵的** exact wheel-pair 验证及实施闭合。因此总状态继续是 `NO-GO`。

### 0.1 P6 / W0-07 子交付：Electron terminal failure containment（2026-08-22）

本次只落实 `BC-005` / `SEQ-008` 的 Electron failure-containment 子集；它不是
P6 closure，也不能作为 Windows Active 或 legacy retirement 的资格证据。

| ID | producer → consumer | 当前冻结语义 | 本次证据 |
|---|---|---|---|
| `BC-005a` | sidecar HTTP error → `deleteContextV2Chat`（main-only） | 只保留 stable `code` 和布尔 `retryable`；原始 response/message 不进入 outbox log 或 renderer。transport unreachable 为 `retryable=true`；缺失或非法 retryability 不被推断为 transient。 | `context_v2_service` 覆盖 typed terminal error 保留；本地 56 tests |
| `BC-005b` | `deleteContextV2Chat` / Vault hook → durable outbox | 只有 `retryable === true` 且 failure count 未到 12 才指数退避；terminal、unknown/invalid response 或预算耗尽写 `quarantined`。失败码只存 outbox 自己的静态 code。 | `chat_deletion_outbox` 覆盖 offline retry、invalid receipt、terminal Context failure |
| `SEQ-008a` | pending → retry → complete | retry 继续使用原 `operation_id`；已完成的 Context checkpoint 仍不重放。 | existing cold-restart / stable-operation tests |
| `SEQ-008b` | pending/retry → quarantined → manual repair | `quarantined` 不再被 due query 或 wake query 选中，但 `status != complete` 的 write fence 保持；重启不得自动解除。main-only `requeueQuarantinedDeletion` 只接受 quarantined row、受限 repair reason，保留原 operation ID 与 checkpoint，并在 receipt 写入递增 generation/reason（最多保留 8 条）。未注册 IPC。 | terminal test 连续跑两次，第二次 `not_due` 且 chat ID 仍 fenced；explicit requeue 后同一 operation ID 完成 |

本次 acceptance：

- `AC-P6-005-01`：typed `retryable=false` Context schema failure 首次尝试后为
  `quarantined`，不执行 Vault、不再请求 sidecar、chat ID 仍不可写；**PASS（local）**。
- `AC-P6-005-02`：typed transient/offline failure 进入 bounded retry，恢复后以同一
  `operation_id` 完成；**PASS（local）**。
- `AC-P6-005-03`：非法 Vault receipt fail closed 至 `quarantined`，不继续 secret
  enumeration；**PASS（local）**。
- `AC-P6-005-04`：explicit repair/requeue 从 quarantine 记录递增 generation/reason，保留
  checkpoint 与 operation ID，且恢复后可完成；**PASS（local）**。
- `AC-P6-005-05`：sidecar strict versioned success/error union、deadline、unknown
  error-code allowlist，以及 exact PuPu candidate + single Unchain wheel matrix；
  **NOT_RUN / BLOCKING**。

未改变的决定：Context failure 仍会阻断 Vault，直到 P6 对双腿独立收敛作出可验证决定；
不允许 Electron 从 404/503/error code 推断 no-store。当前 generic request adapter 只补回
`retryable`，尚不是 W3-03 所要求的 DELETE 专用 strict parser/deadline。

## 1. 最终目标

在不丢失既有聊天状态、不产生双写分叉、不削弱隐私删除、不依赖可变 sibling checkout 的前提下：

1. 将 Context / Memory V2 从 gated 状态推进到全量 active；
2. 证明 normal、resume、graph、subagent、重试、冷重启和删除路径一致；
3. 完成旧 Memory / legacy Context 路径的数据处置与代码退役；
4. 保留可验证的回滚路径，但回滚不得复活已删除 chat 或重新引入双 owner。

当前不能全量打开，也不能淘汰旧链路。最先要关闭的是聊天删除链上的两个 P0。

## 2. 当前硬阻断

| ID | 现场 | 当前后果 | 放行条件 |
|---|---|---|---|
| `P0-DEL-01` | `owner=off` 删除 chat | sidecar 返回 `context_v2_store_disabled`；outbox 持续重试；Vault 清理不执行 | `off` 只禁止新 admission；隐私删除按持久 owner 路由，或由 sidecar 严格证明 no-store 后返回成功 |
| `P0-DEL-02` | `owner=unchain`、数据库不存在时先删除旧 chat | lifecycle “读”路径曾先写 owner marker 和三张扩展表，形成 partial schema；后续官方 V2 无法启动 | 当前 containment 在空根返回 no-store 且零写入；最终仍须由 canonical Unchain base schema → extensions → empty-scope tombstone 取代 |
| `P0-P6-03` | P6 删除闭包仍缺 direct-plan 完整证据 | BC / SEQ / AC 与完整状态矩阵未闭合，不能放行跨进程、跨仓和持久化行为变化 | P6 在本路线图/#195 中补齐 BC/SEQ/AC、exact artifact pair、边界测试和 acceptance evidence |
| `P0-WIN-04` | Windows `canary/all` 被强制压到 `shadow` | Vault worker 没有可证明的整树收容；readiness=`degraded`，Active 不可达；degraded readiness 还会拦截 privacy DELETE | 在任何解密前完成两阶段 containment、用 Windows Job Object 收容 worker 及普通子孙进程、给删除建立独立内部通道，并以真实 Windows 安装包完成 crash/quit/restart 矩阵 |
| `P0-WIN-05` | clean CI 没有受控 Memory V2 release snapshot，Windows smoke 也没有执行已安装 NSIS candidate | clean checkout 会把 feature flags 默认为 off；package smoke 又直接给 build-output sidecar 注入 `all`，可能出现“sidecar 绿、安装包功能仍关闭”的假绿；final merge 未强制 installed/Playwright/containment 报告存在，live ruleset 也未要求 aggregator check | release build 缺 snapshot 时 fail closed；payload/build/package/install 全链绑定；同一安装包 install 后黑盒 E2E；缺报告或 `executed_tests=0` 必须失败；稳定 aggregator 成为 repository/promotion required gate |

基线时的相关测试全绿并不代表 P0 已关闭；现在已补上两个触发态的 containment 回归格并跑过其 exact artifact pair，但 P6 的完整闭环、完整状态矩阵的 artifact-pair 与 Electron terminal-failure 行为仍未验收。

## 3. 不变量与已定方向

### 3.1 rollout 配置不等于持久化 owner

- `owner=off` 的含义是停止新的 V2 admission，不是撤销隐私删除 authority。
- 删除必须依据 owner marker、数据库 schema 和完整 owner evidence 决定真实 owner。
- Electron 不得把 `context_v2_store_disabled`、404、503 或网络失败猜成“没有 Context 数据”。
- 只有持有磁盘证据的 sidecar 可以签发 `not_present` 成功结果。

### 3.2 no-store 与 empty-scope 是两件事

- `off + DB/marker 双 absent`：允许返回 terminal `not_present`；不得创建目录、DB 或 marker。
- `unchain + absent store`：最终 P6 不能停在 no-op；必须建立 canonical data plane，再写 empty-scope tombstone，以阻止同一 chat identity 后续复活。**在公开 initializer 尚不存在期间，P0 containment 暂时返回 no-store 收据且零写入**；它只消除 partial-schema poison，不构成 P6 closure 或 active-rollout 资格。
- marker/schema 冲突、zero-byte、mixed/unknown partial schema：fail closed；不得自动猜 owner。

### 3.3 Context 与 Vault 是两个 durable checkpoint

- `context_done` 与 `vault_done` 分别持久化。
- 一侧成功后，冷重启不得重复执行该侧。
- 只有两侧都成功才可 `complete`。
- 永久结构错误不得热循环；进入 `quarantined` 后仍保留 chat-ID write fence，修复后显式 requeue。
- P6 direct-plan 的 BC/SEQ/AC 与对应证据闭合前不改变现有执行顺序；若批准独立收敛，Context 失败时仍可完成 Vault，但不得把整单标为完成。

### 3.4 删除后的 identity 不能含糊

Unchain tombstone 当前永久阻止原 `owner_chat_id` 复活，而 Electron 现有测试允许删除完成后复用同一 chat ID。P6 必须二选一：

1. 真实删除后永不复用 ID，新聊天生成新 ID；或
2. 引入独立 `chat_incarnation_id`，所有 tombstone 和 scope 绑定 incarnation。

在 direct Plan 明确该状态语义前，不得通过放宽 tombstone 来迁就旧测试。

## 4. M0 — 冻结契约与现场证据

目标：在改实现前，把跨边界语义写成可执行、可验收的 P6 direct Plan。

### M0-01：补全 P6 边界契约

至少形成：

- `BC-005`：Electron deletion outbox → sidecar privacy delete → Context/Vault 双 checkpoint；
- `BC-006`：configured owner + owner marker + DB schema → durable deletion owner；
- `BC-007`：PuPu scope resolver / extension declarations → Unchain atomic deletion service；
- 每个边界写明 closed/versioned request、success union、error code、`retryable`、unknown-input 和 exact artifact identity。

### M0-02：补全状态序列

- `SEQ-006`：`off` 下 no-store、persisted legacy、persisted unchain、冲突 schema 的删除与重启；
- `SEQ-007`：Unchain absent store 的 canonical bootstrap、empty-scope tombstone、崩溃点恢复和并发 first admission；
- `SEQ-008`：Context/Vault 单边失败、双边失败、quarantine、repair/requeue 和冷重放。

### M0-03：先保存 red evidence

先只加失败测试并保存：PuPu revision、Unchain revision/wheel identity、测试 diff hash、失败日志和磁盘对象清单。修复后必须运行同一测试转绿。

### M0 出口

- P6 不再是 `DRAFT_ONLY/PENDING`；
- BC/SEQ 全部映射到正向和负向 AC；
- runtime、Electron、Unchain producer/consumer 两侧均有独立证据；
- P6 的 direct-plan acceptance evidence 完整。active rollout 在 closure 前仍保持 blocked。

## 5. M1 — 修复两个删除 P0

### M1-A：修复 `owner=off` 无限重试和 Vault 阻塞

#### A1. 新增删除专用的只读 owner preflight

新增窄 helper，组合现有 DB inspection 与 owner manifest read；不要修改通用 `inspect_context_v2_database`，也不要复用 `_context_v2_chat_state_exists_read_only` 作为 empty-scope authority。

输出必须是封闭枚举：

- `no_store`
- `pupu_legacy`
- `unchain`
- `incompatible`

建议矩阵：

| marker | DB | 结果 |
|---|---|---|
| absent | absent/真正 blank | `no_store` |
| absent | known legacy | `pupu_legacy` |
| absent | known unchain | `unchain` |
| legacy | absent/真正 blank | `no_store`（orphan marker 不代表存在 chat 数据） |
| unchain | absent/真正 blank | `no_store`（不得为读取 marker 而补建 schema） |
| legacy | known legacy | `pupu_legacy` |
| unchain | known unchain | `unchain` |
| 任意 | owner 冲突、zero-byte、mixed/partial/unknown | `incompatible` |

这里的 `blank` 必须是只读打开后确认无对象的合法 SQLite；zero-byte 继续视为 incompatible。

#### A2. 改删除分派，不按 configured owner 一刀切

- `off + no_store`：返回 closed `not_present` 成功收据，零磁盘写入；
- `off + persisted legacy`：通过删除专用 legacy opener 删除，不得被普通 rollout gate 拒绝；
- `off + persisted unchain`：调用官方 Unchain deletion adapter；
- `pupu_legacy/unchain`：configuration 只做合法值验证；删除以 durable owner 为准，不能因当前 rollout 设置而拒绝；
- incompatible：返回稳定 typed error，不得落到 generic `context_v2_failed`。

#### A3. 让 outbox 表达 bounded failure

在 P6 批准后：

- 保留 `pending/retry/complete`，增加 `quarantined`；无需新增表列；
- `nextDue` / `nextWakeDelay` 只选择 `pending/retry`；
- `findActiveDeletion(status != complete)` 保持不变，使 quarantine 继续阻止同 ID 写入；
- sidecar 的 stable `code + retryable` 必须传到 main process；transient 才 retry，terminal 进入 quarantine；
- 成功腿立即持久化。若 P6 批准双腿独立收敛，则 Context 失败也继续 Vault，并形成 `context_done=0, vault_done=1`；
- 未知 error code fail closed，并按 P6 的 bounded fallback 处理，不能无限热循环。

#### A4. 验收

- `off + DB/marker 双 absent`：首次、重复、冷重启均完成；没有创建 `memory_v2`、DB、WAL/SHM 或 marker；
- `off + existing legacy` 与 `off + existing unchain`：按 durable owner 删除；
- terminal schema error：不再周期唤醒，Vault/checkpoint 行为符合 P6，chat ID 仍 fenced；
- transient sidecar offline：稳定 operation ID，恢复后继续；
- Vault 单边失败：不重复 Context；Context 单边失败：不重复已完成 Vault（若独立收敛获批）。

### M1-B：修复 Unchain 空库先删造成 partial schema

#### B1. 删除路径先做纯只读 preflight

`_resolve_scope` 在任何 owner claim、建库或建表之前识别：absent、canonical unchain、已知旧 poison、unknown/incompatible。

名为 read/list 的 API 不得隐式调用 schema initializer。为删除新增严格只读 lifecycle reader，避免直接修改被 read/workspace/promotion/recall/review/curator 共用的现有函数。

#### B2. 提供 canonical full-schema bootstrap

由 Unchain 提供公开、版本化的 data-plane initializer。顺序固定为：

1. `SQLiteContextV2Store` canonical base schema；
2. compiler / memory / curator / promotion / legacy-bootstrap / memory-host 等删除闭包要求的完整官方 schema；
3. PuPu ownership/admission extensions；
4. exact empty-scope revalidation；
5. `SQLiteChatDeletionV2Service` 原子写 tombstone 和 receipt。

任何崩溃点恢复后，DB 必须仍能被识别为 `unchain` 或完全 absent，绝不能出现 extension-only incompatible 状态。

#### B3. 有界修复已经产生的 poisoned store

只允许自动修复下面的精确签名：

- marker 为 `unchain`；
- `user_version=0`；
- 只有已知的三张 `pupu_unchain_ownership_*` 表及其精确 index/schema version；
- bindings/operations 为零行；
- 没有任何未知对象或业务行。

满足时补全 canonical schema，再继续 tombstone。多一张表、多一行数据、版本漂移、marker 不匹配或 symlink 均原样 fail closed，并给出稳定 terminal code。

#### B4. 错误归一化

`ContextV2StoreBoundaryError`、Unchain schema/deletion 错误必须投影为 closed 删除错误；不得逃逸成 HTTP 500。结构错误 `retryable=false`，暂态 I/O/runtime unavailable 才是 `retryable=true`。

#### B5. 完整 successor 的验收（不是当前 containment 的验收）

- absent store 首次删除后：inspection=`unchain`、完整 required-table closure、empty-scope tombstone 存在；
- 同 operation 响应丢失后冷重放：receipt/digest 不漂移，`replayed=true`；
- bootstrap 每个 fault-injection 点重启可恢复，无 extension-only；
- 删除与 first admission 并发线性化：admission 先赢则删除完整 scope，delete 先赢则 admission 被 tombstone 拒绝；
- 精确旧 poison 可修复，未知 partial 不被改写；
- 后续 Memory V2 正常启动和读写成功。

### M1-C：回归与交付证据

按顺序运行：

1. PuPu sidecar route/boundary/ownership/deletion adapter focused tests；
2. Unchain canonical initializer 与 chat deletion core tests；
3. Electron outbox + Context V2 service 的 `.cjs` 主测试及 `.js` wrappers；
4. sidecar 冷重启、outbox 冷重启和真实 Electron → sidecar → SQLite/Vault 集成；
5. 使用一次构建并全程复用的同一个 Unchain wheel 跑 exact deployed pair matrix；
6. GitNexus `detect_changes(compare main)`，确认只影响预期 symbol/flow。

### M1 出口

- 两个原始复现脚本转绿；
- 新增负向矩阵全绿；
- P6 acceptance + closure 完成；
- 没有 generic 500、无限 retry、partial schema、Vault 永久残留或 chat resurrection；
- 才允许进入 M2。关闭代码 P0 不等于立即全量打开。

## 6. M2 — sticky owner 与 rollout-off 完整语义

将删除路径验证过的 durable-owner resolver 扩展到所有需要 sticky continuity 的路径，但每个 symbol 修改前单独做 impact：

- head/read；
- rebase/edit/resend/delete-turn；
- normal run；
- resume/replay；
- graph/subagent；
- workspace/curator/promotion/recall。

`off` 只禁止新 admission；已有 legacy/unchain chat 继续由原 owner 服务。不得只修 delete 而让其他路径产生半 sticky 状态。

M2 出口：全路径状态矩阵、冷重启和 owner mismatch 负向测试通过，且 rollout 降档不会丢失既有 chat continuity。

## 6A. MW — Windows Active enablement track

本轨道解决的是“Windows 能否从 Shadow 进入 Active”，不是 Windows
安装包、签名或自动更新的全部问题。当前结论仍是 **Windows Active
NO-GO**。`canary/all` 在 win32 被强制压为 `shadow`，且 readiness 因
`vault_worker_containment_unavailable` 保持 degraded。

### MW-0：冻结范围与安全不变量

第一阶段仅覆盖当前 package 已支持的 **Windows 10/11 x64**。Windows
ARM64、Windows secure `computer_input`、代码签名和旧客户端自动更新不在
本轨道内：

- Windows ARM64 没有当前 runtime/package artifact，保持 unsupported；
- `computer_input` 目前只实现 macOS secure-field 写入。Windows registry
  不得宣称支持它，必须在解密前返回 `vault_sink_unavailable`；若产品要求四种
  sink 完全同构，Windows Active 继续 NO-GO，并另开 UI Automation 工作；
- #195 负责 Memory V2 的 Windows Active 能力和 exact installed-artifact
  证据；#200 负责签名、update feed 和旧客户端升级闭环。两者都是 v0.1.10
  release close 的条件，但 #200 不应掩盖 #195 的功能验收。

Windows Active 必须维持以下不变量：

1. **contained-ready 之前零解密。** 当前 Vault service 会先将 intent
   标成 `executing` 并解密，再调用 executor。新增方案必须改为
   `prepare(no secret) → contained ready → CAS executing → decrypt → frame`。
2. **Job 是获准普通 CreateProcess 树的 lifecycle authority。** `child.kill()` 和
   `taskkill /T` 只能作为辅助，不能成为安全证明。Job 必须设置
   `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，不允许 `BREAKAWAY_OK` 或
   `SILENT_BREAKAWAY_OK`；它不等同于抵御 broker escape 的 OS sandbox。
3. **worker 创建即已在 Job 中。** 首选 `STARTUPINFOEX` 的
   `PROC_THREAD_ATTRIBUTE_JOB_LIST` 原子准入；若 packaged 兼容性证明失败，
   fallback 才是 `CREATE_SUSPENDED → AssignProcessToJobObject → ResumeThread`。
4. **精确 handle 继承。** 只允许 stdin、stdout 和获准的私有控制 handle；
   Job handle、Vault broker key、ambient secret environment 不得进入 worker。
5. **supervisor 在 Job 外且持有唯一长期 Job handle。** worker 和普通
   `CreateProcess` 子孙都在 Job 内；supervisor 同时监视 worker、PyInstaller
   bootloader 直接父进程和 Electron main process handle。
6. **每条终止路径都归零。** 正常完成、timeout、protocol error、worker
   crash、launcher crash、`will-quit` 和 Electron hard crash 都必须结束整棵
   Job tree；只有确认回收后才把 session 从 tracker 移除。
7. **任何能力失败都保持 Shadow。** 缺 artifact、错协议、Job 创建/准入失败、
   外层 Job 不兼容或 probe 超时，均不得通过删 guard 降级成 Active。
8. **privacy DELETE 不依赖 Active readiness。** 它仍须经过 sidecar ready、
   auth、closed request/receipt 和 durable-owner authority，但不能被
   `shadow/degraded` 的普通 Context V2 admission gate 拦截。

Job Object 覆盖普通 Windows `CreateProcess` 子孙，但不自动证明 WMI、计划任务、
系统服务等 brokered process creation。Windows direct Plan 必须明确 threat model：
未获准的 escape channel 继续禁用相应 sink，不得把 Job Object 宣传为覆盖整个 OS。

### MW-0A：待实例化的跨边界契约

下面的 `WBC/WSEQ/WAC` 是本 direct Plan 的工程追踪标识，不等同于 Active
资格。实施前必须在本路线图和 #195 中补齐每条 BC/SEQ/AC 的 producer、consumer、
closed schema、failure/rollback 与 exact artifact-pair evidence；不要把它们混入
只处理 durable deletion 的 P6。

| 草案 ID | producer → consumer | policy | 核心义务 |
|---|---|---|---|
| `WBC-001` | Vault `executeUseIntent` → executor lease | `CLOSED` | `prepare()` 只接收非秘密 identity/sink 元数据；strict READY 前 `safeStorage.decryptString` 必须为零调用；pre-CAS 失败时执行路径不改 durable status，无竞争时仍 approved、竞争状态获胜 |
| `WBC-002` | Electron executor → Windows supervisor | `VERSIONED + CLOSED` | frozen absolute entrypoint、Electron parent PID、arch/artifact identity 与精确 stdio handles；READY/failure 为限长封闭 union，未知字段、错版本、timeout 均在解密前 fail closed |
| `WBC-003` | supervisor → Job Object → worker tree | `CLOSED` | `KILL_ON_JOB_CLOSE`、无 breakaway、worker 创建即入 Job、Job handle 不继承；parent/launcher/worker 任一路径死亡后 tree 归零 |
| `WBC-004` | Electron plaintext frame → worker response | `VERSIONED + CLOSED` | 延续 one-shot framed protocol；请求和响应精确 key set、限长、无 trailing bytes，结果扫描 raw/encoded secret variants；只有 sink contract 明确许可的目标槽位可在规定租期内含明文（例如 `shell_secret_env` 的目标进程 env）；supervisor/bootloader/其他进程/argv/cwd/log/control/temp 和租期外不得含明文 |
| `WBC-005` | packaged containment capability → rollout/readiness | `VERSIONED + CLOSED` | capability 来自本次安装包的无秘密 probe，并绑定 platform、arch、protocol、packaged sidecar SHA、wheel SHA 与 runtime manifest digest；Git SHA 只作 provenance |
| `WBC-006` | deletion outbox → main-internal privacy DELETE → sidecar/Vault | `VERSIONED + CLOSED` | 只绕过 Memory V2 readiness，不绕过 transport/auth/validator/owner authority；引用 P6 durable-owner、bounded retry/quarantine 与双 checkpoint 契约 |
| `WBC-007` | release builder → installed Windows candidate | `CLOSED` | 同一 PuPu candidate、同一次构建的 Unchain wheel 和同一 packaged sidecar bytes 贯穿 contract、package、E2E 和 report；任何 identity drift 为 NO-GO |

状态序列草案：

| 草案 ID | 顺序与关键结果 |
|---|---|
| `WSEQ-001` | `approved → prepare(no secret) → READY → CAS executing → decrypt → frame → one effect → strict response → tree zero → CAS complete receipt`；receipt replay 不再 spawn/effect |
| `WSEQ-002` | CreateJob/limit/process/job-list/handle-list/READY 任一点失败：0 decrypt、0 frame、0 effect；执行路径不改 durable status（无并发 transition 时仍为 `approved`），相同 operation 可安全重试新 lease |
| `WSEQ-003` | READY 后、CAS 前 lease 丢失：abort/drain Job，执行路径不改 durable status（无竞争时仍 approved）；CAS 后 timeout/crash/protocol error/response loss：tree zero，intent=`indeterminate`，禁止自动重放 effect |
| `WSEQ-004` | 正常 quit、Electron Task Manager kill、PyInstaller bootloader/launcher/worker kill、system suspend、sidecar crash和冷重启；broker 先停、Jobs 再归零、Vault DB 最后关闭 |
| `WSEQ-005` | standalone Windows 与已有外层 Job 的 runner/package 环境；嵌套 Job 不兼容时 fail-before-decrypt 并保持 Shadow |
| `WSEQ-006` | `shadow → internal canary → wider canary → all`；能力丢失后停止新 admission/Vault use，不改写 sticky owner，不回落 legacy；重新启用须整 app restart 后重验 |
| `WSEQ-007` | `off/shadow/degraded/canary/all` 下 privacy DELETE，覆盖 sidecar offline、terminal schema error、Context/Vault 单边完成、outbox 冷重启和 repair/requeue |
| `WSEQ-008` | exact installed artifact 依次跑 first/second turn、interaction、retry/resume、sidecar restart、graph、subagent、Vault use、delete、quit/crash |
| `WSEQ-009` | READY startup frame 后 control stream 必须保持 silent；额外 byte/pipe fault 触发 structural capability loss。若 loss 在线性化上先于 CAS则 abort/drain且 0 decrypt/frame/effect；CAS 已获胜则 intent indeterminate、tree-zero、全局 ready→lost |

### MW-1：两阶段 executor lease（仍保持 Windows Shadow）

将生产 executor 从单函数改为一枪一用的 lease：

```text
validate approved intent and registered sink
→ reserve in-process flight
→ lease = await executor.prepare(non-secret identity)
→ validate closed READY receipt
→ CAS approved → executing
→ resolve handles and decrypt
→ await lease.execute(secret frame)
→ validate/sanitize response
→ synchronously abort if needed and await confirmed tree drain
→ commit complete receipt or mark indeterminate
```

实现要求：

- prepare 之前及期间不构造 secret array，不调用 `decryptString`；
- prepare 失败或与 quit 竞争失败时 abort/drain lease，执行路径不改 durable status
  （无并发 transition 时仍为 `approved`）；
- CAS 失败时触发同步 abort、等待 drain，不发送 frame；执行路径重新读取 durable
  truth，不假定状态仍为 approved；
- CAS 后任何失败沿用现有保守 `indeterminate`，不得因“看起来还没 effect”自动
  回到 `approved`；
- 在 await prepare 引入后，先建立同 intent 的 in-flight fence，防止两个 caller
  同时准备两个 Job；
- `abort()` 同步触发终止；timeout 与完成路径只在 `awaitDrained()` 证明真实
  launcher close/Job tree-zero 后从 tracker 移除；
- READY 协议固定版本、精确字段、限时限字节，且只允许静态错误码；禁止路径、PID、
  原始 Win32 error 或 payload 进入 renderer/log。

主要文件：

- `electron/main/services/memory_vault/service.js`
- `electron/main/services/memory_vault/vault_sink_executor.js`
- `electron/main/index.js`
- 对应 `.cjs` 主测试与 `.js` wrappers

MW-1 出口：POSIX 既有行为不回归；所有 pre-ready fault injection 都证明
`decryptString=0`、执行路径不改 durable status（无竞争时仍 approved）、
tracker=0。Windows gate 仍不解除。

### MW-2：Windows Job Object supervisor（仍保持 Windows Shadow）

首选复用已经被 package 的 `unchain-server.exe`，新增
`--vault-sink-supervisor` 模式：

1. Electron 以绝对路径、无 shell、最小环境启动 supervisor，不传明文；
2. supervisor 用 Python stdlib `ctypes` 创建 unnamed/non-inheritable Job，设置
   kill-on-close 且不设置任何 breakaway；
3. supervisor 用 `CreateProcessW + STARTUPINFOEX` 启动同一 exe 的内部
   `--vault-sink-worker`，通过 `PROC_THREAD_ATTRIBUTE_JOB_LIST` 原子加入 Job，
   通过 `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` 只继承获准 handles；
4. worker 在读取 stdin 前完成内部 membership/protocol self-check，发出 closed
   READY；
5. supervisor 持有 Job handle，等待 worker、Electron process handle 和
   PyInstaller bootloader parent handle；任何终止路径调用/触发 Job termination，
   并等待 active process count 为零；
6. worker 正常完成后也必须终止 Job，清理可能仍活着的 MCP/shell 子孙；
7. `taskkill` 不再是 authority。直接 process kill 只作为促使 supervisor/worker
   退出的辅助，最终由 Job 回收整树。

建议新增 `unchain_runtime/server/vault_sink_job_supervisor.py`，并窄改：

- `unchain_runtime/server/main.py::_dispatch_vault_sink_worker`：在 Flask 和
  普通 worker 之前分派 supervisor/inner-worker；
- `unchain_runtime/server/vault_sink_worker.py`：只有本次 supervisor 的
  containment attestation 成功后才允许 Windows shell/MCP 执行；
- `unchain_runtime/scripts/build_unchain_server.ps1`：确保 supervisor 被 PyInstaller
  收入；macOS/Linux build 不改变执行语义。

Fallback 顺序固定：

1. Python/PyInstaller supervisor；
2. 只有真实 packaged E2E 证明 PyInstaller parent 拓扑、Win32 attribute list 或
   p95 启动预算不可接受时，才改为独立 native launcher；
3. 不采用 Node native addon，避免 Electron ABI/rebuild/crash 面。

`main.py` 入口的 GitNexus upstream impact 当前为 **CRITICAL**（约 59–61 条
process flows）；JS const-arrow symbols 未被索引可靠解析，风险记为 UNKNOWN，
不得按 LOW 处理。实施前必须重新 impact 并向 owner 报告。

### MW-3：capability-aware rollout 与 privacy transport

不能简单删除 `platform === "win32"` guard。启动时建立一次性、内容为空的
containment probe，并把结果作为 main-internal、versioned capability latch：

- `probe_verified`：临时、非 rollout receipt，只证明 no-secret
  supervisor/Job/worker/provenance probe；它用于构造 registry，不能解除 Shadow；
- `ready`：真实 Job probe、worker READY protocol、broker registry、platform/arch
  和 exact artifact identity 全部匹配；
- `unavailable`：只允许 closed reason，例如 artifact missing/digest mismatch、
  wrong arch、protocol mismatch、Job creation/assignment failure、worker self-check
  failure、outer-job incompatibility 或 timeout；
- capability 不得包含路径、PID、原始 Win32 error、secret 或 broker coordinates；
- 只有 `ready` 才让 Windows 尊重 release 的 `canary/all`；否则继续强制
  `shadow + degraded + platformActiveBlocked=true`；
- 运行中 capability 丢失时关闭 broker/Jobs，拒绝新的 Vault use 和 admission，
  既有 sticky owner 不改写；恢复必须完整 app restart 后重新 probe。

privacy DELETE 使用专用 main-internal transport，不给 generic
`contextV2Request` 增加可被误用的宽泛 bypass：

- 只允许 DELETE chat endpoint；
- 仍调用 `ensureMisoReady`、auth header、closed request/response validator；
- `shadow/degraded/off` 不阻断它；
- sidecar transport failure 才 retry，typed terminal failure 按 P6 进入 quarantine；
- Electron 永远不能从 404/503/error code 推断 no-store。

MW-3 出口：Windows capability false 时保持现状；capability true 时
`platformActiveBlocked=false`，release `canary/all` 不再被压成 shadow；两种状态下
privacy DELETE 都按 durable owner 收敛。

### MW-4：真实 Windows 验收矩阵

#### 单元与协议层

- READY 前所有故障：`decryptString=0`、frame=0、effect=0；
- READY startup frame 的 extra/missing key、错 version、partial/oversized、timeout
  全部 pre-decrypt 拒绝；完整 READY 后 control 额外 byte/pipe fault 按
  WSEQ-009 测 pre/post-CAS 线性化；
- worker 请求/响应继续使用 exact key set，补掉任何 `issubset` 宽松 validator；
- Windows registry 只列真实支持的 sink；`computer_input` 在解密前拒绝；
- success receipt 重放不再 spawn/effect；response loss 后为 indeterminate；
- prepare/quit、prepare/cancel、CAS/quit、timeout/response 竞争全部收敛。

#### 真实 Windows Job 层

- `cmd`/PowerShell 与 fake MCP 分别创建 child + grandchild；
- normal success、non-zero、timeout、oversized output、bad frame、worker crash、
  supervisor crash、kill bootloader、kill Electron 后，所有进程在限定时间内消失；
- 用延迟 sentinel 文件证明 grandchild 没有幸存，不能只看 PID；
- `CREATE_BREAKAWAY_FROM_JOB` 负向尝试失败；嵌套 outer Job 环境要么通过、要么
  在解密前给出 closed unavailable；
- synthetic secret 的 raw/base64/base64url/hex/percent variants 只允许出现在该 sink
  contract 明确许可的目标槽位和租期；`shell_secret_env` 的目标进程指定 env 槽是
  预期例外。supervisor/bootloader/无关 descendants、argv、cwd、stdout、stderr、
  control receipt、日志、临时文件和租期外一律不得出现；
- 连跑至少 100 次，无 orphan、明显 handle 增长或 tracker 泄漏；
- 对 WMI/计划任务/服务型 brokered creation 保存 threat-model 测试或明确禁用证据。

#### installed product 层

- 使用本次实际 `PuPu Setup ...exe` 安装后的 Electron 和实际 packaged
  `unchain-server.exe`，不能只跑源码 Python；
- 同一个 wheel SHA、runtime manifest digest、packaged sidecar SHA 和 PuPu candidate
  贯穿测试、package smoke 与 final report；
- 跑 Context profile `CTX-S01..S08` 的全部 Windows applicable 格；
- 跑 normal/second turn、interaction、retry/resume、sidecar cold restart、graph、
  subagent、全部 W0 获准 Vault sinks、privacy deletion、normal quit 和 hard crash；
- Windows Playwright/containment/package jobs 任何 `continue-on-error` 都必须在同一 job
  被显式 enforce；缺 artifact 或零测试数必须失败，不能再出现历史 false green；
- GitHub `windows-latest` 是 required CI；正式放量前还需真实 Windows 11 x64
  安装环境完成 lifecycle smoke。

### MW-5：Windows staged rollout 与回滚

顺序固定：

1. `W-G0`：Windows direct Plan 的 BC/SEQ/AC、threat model 与 red evidence 已闭合；
2. `W-G1`：两阶段 executor、Job supervisor、privacy transport 在真实 Windows
   installed qualification candidate 全绿，但 production channel 仍为 Shadow；
3. `W-G2`：P6 closure 后，先完成同 payload lineage 的 Shadow rollback/观察
   descendant，再把 W-G1 exact Active candidate 分发到 internal canary，只开放
   已证明的 sink kinds；
4. `W-G3`：public 5%/25% 使用同 code/wheel/sidecar、仅 snapshot 变化的
   configuration-only descendants；各自重跑 W0-10 并跨正常重启、sidecar 冷重启、
   Electron/launcher crash 和 outbox 重启观察；
5. `W-G4`：全部 applicable matrix PASS、P6 closure 和 exact artifact continuity
   完成后才允许 Windows `all`。

任一阶段出现 containment/protocol/artifact/owner/schema drift：按 W0-08 已冻结的
authority/SLA 停止新 admission 和 Vault use，维持或退回 Shadow；未收到 stop 的
客户端不能被虚报为已停止。不得把已有 Unchain sticky chat 改写为 legacy，也不得
删除 marker/DB 来伪造回滚。Windows Active 完成不自动授权 M5 旧链路退役。

### MW 放行 AC 摘要

- `WAC-001`：strict READY 前 `safeStorage.decryptString` 为 0；
- `WAC-002`：worker 创建即在 no-breakaway Job，且只继承精确 handles；
- `WAC-003`：所有 pre-ready fault 为 0 decrypt/frame/effect且执行路径不改 durable
  status；无竞争时仍 approved，竞争状态获胜；
- `WAC-004`：所有 post-CAS failure 为 indeterminate，且 Job tree 归零；
- `WAC-005`：正常 quit、Electron/bootloader/supervisor/worker hard kill 均无 orphan；
- `WAC-006`：全部声明支持的 sink 在 installed package 真跑，未声明 sink
  fail-before-decrypt；
- `WAC-007`：capability ready 才解除 `platformActiveBlocked`；tamper/错 arch/错协议/
  outer-job failure 继续 Shadow；
- `WAC-008`：Windows degraded/off/active 均可执行 exact privacy DELETE，重启不重复
  已完成 checkpoint；
- `WAC-009`：同一 installed artifact 通过 CTX-S01..S08 和 Windows lifecycle 矩阵；
- `WAC-010`：wheel/runtime manifest/packaged sidecar/candidate identity 全程一致；
- `WAC-011`：brokered process escape threat model 已在 direct Plan 固定，未覆盖 sink 保持禁用；
- `WAC-012`：保存当前 forced-shadow 与 fail-before-spawn 的 red-before-green 证据，
  tamper negative tests 永久保留。
- `WAC-013`：READY 后 control 额外 byte/pipe fault 的 CAS 竞态有单一线性化结果：
  pre-CAS 为 0 decrypt/effect，post-CAS 为 indeterminate；两者都触发 tree-zero 和
  lifecycle `lost`，不得继续 Active。

任一适用 `WSEQ` 或 `CTX-S01..S08` 为 `NOT_RUN/PENDING` 时，Windows Active 结论
只能是 `INCOMPLETE` 并保持 Shadow；已执行失败或 artifact identity 不一致为
`NO-GO`。

## 6B. MW 详细实施计划（执行版）

本节把 MW-0..5 展开为可执行、可验收、可停止的工作包。它是后续 Windows
工作的直接工程 Plan；在 W-G0 的 BC/SEQ/AC 与 red evidence 未完成前，只能完成
文档、red evidence 和不改变 production admission 的底层实现；在 installed
candidate 全部通过前，不得解除 win32 Shadow hard cap。

### 6B.0 执行规则与依赖图

每个任务只允许进入以下状态：

- `PENDING`：尚未开始；
- `IN_PROGRESS`：direct Plan 已冻结部分契约或已有局部实现/证据，尚未达到该任务的
  完成定义；必须保持 Shadow；
- `RED_SAVED`：失败测试及精确基线证据已保存，production 尚未切换；
- `IMPLEMENTED_SHADOW`：代码与 focused tests 已完成，但 Windows 仍强制 Shadow；
- `QUALIFIED`：同一 installed candidate 的适用矩阵全部通过；
- `ROLLED_OUT`：通过对应 staged gate；
- `BLOCKED`：命中本任务 stop condition，保持或回到 Shadow。

主依赖为：

```text
W0 governance/candidate contract
├─→ W1 two-stage Vault lease ───────────┐
├─→ W2 Win32 supervisor + Job Object ───┼─→ W3 capability/readiness wiring
├─→ W3-03 privacy transport ────────────┤
└─→ P6 direct-plan closure ─→ W3-04 outbox ──┘
                                         ↓
                         W4 exact installed qualification
                                         ↓
                         W5 internal → 5% → 25% → all
```

W1 和 W2 在 W0 获准后可以分支实施，但接线和验收必须按
`W1 lease → W2 READY/Job → W3 latch → W4 installed` 收敛。P6 closure 必须在
第一次 Active internal canary 前完成。

#200 在本计划中拆成三个明确 gate，避免一个模糊依赖被错误前移：

- `#200-C`：签名/update/rollback contract 已冻结，供 W0 定义 identity/lineage；
- `#200-S`：public candidate 的签名流水线 ready，不重建 wheel/sidecar；
- `#200-R`：update feed、可交付 Shadow rollback 与 direct Plan 固定的 stop authority 闭合。

W4 internal qualification 不依赖 `#200-S/R`；public 5% 同时依赖
`#200-S + #200-R`。

### 6B.1 W0 — 治理、支持面与 candidate 契约

| ID | 任务与产物 | 依赖 | 验收与证据 | Stop / NO-GO |
|---|---|---|---|---|
| `W0-01` | 在本路线图和 #195 维护独立 Windows containment direct Plan；把 `WBC/WSEQ/WAC` 实例化为工程 `BC/SEQ/AC`，列 producer/consumer、protocol、rollback 和 threat model | #195 | direct-plan traceability、BC/SEQ/AC、test evidence | 仍为 draft；任一适用 sequence 没有正负 AC；把本任务混入仅处理 durable deletion 的 P6 |
| `W0-02` | 冻结支持面：Windows 10/11 x64；暂定评估 `shell_secret_env`、`shell_secret_stdin`、`mcp_schema_secret`；`computer_input` pre-decrypt unavailable；ARM64 unsupported。direct Plan 必须限定 Job 仅为普通 `CreateProcess` 后代的合作式生命周期 containment；若要求抵御 WMI/计划任务/服务/parent-spoof broker escape，则 shell sinks 不得仅凭 Job 宣称 supported | W0-01 | versioned support/threat matrix，列每个 OS/arch/sink 与 broker channel 的 PASS/N/A/disabled 理由 | UI/文档声称四 sink 同构；registry 注册未获准 sink；把 Job 宣称为任意恶意 shell 的 OS-wide sandbox |
| `W0-03` | 冻结 clean-CI release snapshot 生产方式：一个 producer 从受控 profile **只生成一次 exact bytes**，与 wheel 一起上传；deterministic/package/install jobs 只下载复用；release/package 启用 snapshot-required；package smoke 从 snapshot 读取 mode 并核对 fingerprint，不再硬编码 `PUPU_*=all` | W0-01 | snapshot 内容、SHA-256、fingerprint、生成日志和跨 job byte-equality test | 各 job 自行 materialize；继续读取开发机忽略的 `.local`；package 与 smoke 使用不同 mode；缺 snapshot 仍回落默认 off |
| `W0-04` | 统一 Electron、sidecar、artifact checker 的 required feature、worker/supervisor protocol 和 supported sink closed set | W0-02/03 | Node/Python 双方独立 golden fixture；尤其统一 `context_memory.tool_output_management_v1` 是否为 required | producer/consumer feature 集不一致；unknown protocol/sink 被宽松接受 |
| `W0-05` | 冻结非自引用、分层 candidate schema：`payload-lineage.v1`（revision/code/wheel/runtime/sidecar/arch，不含 rollout snapshot）→ `build-identity.v1`（payload lineage + exact snapshot）→ `package-attestation.v1`（app/asar/installer + signing envelope）→ `install-attestation.v1` → 外部 `evidence-envelope.v1` | W0-03/04 | 五层 schemas、golden fixtures、parent fingerprint 与 Authenticode pre/post-sign allowed-delta 规则；每个 snapshot 产生新 build identity，W0 不要求真实 installer/install hashes | 声称改 snapshot 仍是同 build identity；单一 manifest 自引用；pre-package 报告填未来 digest；签名掩盖 payload delta |
| `W0-06` | 冻结 mode-aware CI/report topology 与 red：`lite`、`release`、`windows-active-qualification` 各自由 workflow input/event 决定 expected-report manifest；不能从实际下载到的报告反推 required set | W0-03；W0-05 可并行细化 identity 字段 | 三种 expected-report fixtures、missing/zero/tamper red、每份 report exact schema 与 `executed_tests > 0` | 无条件要求 installed 报告导致 lite 永失败；release 缺报告仍绿；`continue-on-error`/missing `needs` 未被 red 捕获 |
| `W0-07` | 冻结 P6 dependency/contract：专用 privacy DELETE、typed retryable、bounded retry/quarantine、双 checkpoint、durable owner/no-store authority；P6 closure 是 W3-07/W5-02 gate，不阻断 W1/W2 底层实现 | P6 direct Plan | Windows rollout-mode deletion AC 与明确 closure gate | 让 W3-07/W5-02 绕过 P6；或反向要求 P6 closure 才能完成整个 W0 |
| `W0-08` | 冻结 staged lineage、rollback authority 与 stop rules：每个 snapshot 是 immutable candidate；descendant 复用 payload lineage但生成新 build identity；单独验证 snapshot delta 与 Authenticode signing envelope；明确 signed remote kill 或强制更新及传播/止血 SLA | W0-05；`#200-C` | lineage/allowed-delta schema、rollback policy、SLA 和 threat review；真实 rollback 包留到 W5 | 把普通可选 updater当即时 stop；声称 snapshot 变化仍同 build identity；签名掩盖 payload delta；回滚改 sticky owner/删 DB |
| `W0-09` | 保存 red-before-green：forced Shadow、win32 fail-before-spawn、decrypt-before-containment、clean snapshot 默认为 off、missing report/source-E2E false-green，以及 live ruleset 无 required status / always-bypass 现场 | W0-03/06 | PuPu SHA、test diff hash、失败日志、ruleset API snapshot、磁盘/进程/artifact inventory；日志不得含秘密 | 先删 guard 后补红测试；测试没有证明命中当前 candidate；只修 aggregator 不保存 repository gate red |
| `W0-10` | 冻结 descendant 重跑矩阵与 retention：Shadow/internal/5%/25% 至少跑 snapshot/provenance、capability、privacy DELETE、全部 W0 获准 sinks、quit/crash；exact all 重跑全部 CTX-S01..S08 与适用 WSEQ | W0-05/06/08 | versioned matrix、promotion rule、retention 下限覆盖全部观察窗与 rollback | 用“critical matrix”模糊继承旧 candidate 结果；all 继承 canary WAC；artifact 在观察期内过期 |

W0 出口为 `W-G0`：Windows direct Plan 的 BC/SEQ/AC 已闭合，support/candidate/report
contract 已冻结，red evidence 已保存。P6 closure、真实 package/install attestation、
绿色 workflow enforcement 和 signed rollback artifact 分别在 W3/W4/W5 完成，不构成
W0 的后向依赖。
此时 production 仍是 Shadow。

### 6B.2 W1 — 两阶段 Vault lease

W1 的唯一目的，是把安全顺序从当前
`CAS executing → decrypt → executor` 改成
`reserve → prepare(no secret) → READY → CAS → decrypt → execute`。不在本阶段
打开 Windows。

#### W1-01：冻结 lease 状态机并保存 red

- 只先修改测试：
  `electron/tests/main/memory_vault_use_state.test.cjs`、
  `memory_vault_sink_executor.test.cjs`，并同步对应 `.js` wrapper。
- 必须先得到以下 red：
  deferred prepare 未 READY且无竞争者时 `decryptString=0`、DB 仍 `approved`；
  prepare reject 后执行路径不改 durable status且无 receipt/frame/effect；同
  operation 只创建一个 lease；
  不同 operation 冲突；prepare 与 close/quit 竞争后不能继续 CAS/decrypt。
- 保存调用顺序和精确失败断言，不记录 payload。
- 若 direct Plan 未冻结“pre-CAS 执行路径不改 durable status，竞争者状态获胜；
  post-CAS 失败为 indeterminate”，本步止步于 `RED_SAVED`。

#### W1-02：新增不含明文的 prepared-lease primitive

拟改：

- `electron/main/services/memory_vault/vault_sink_executor.js`
  的 executor factory、framed worker session 和 child tracker；
- 新的 registry value 必须是闭合 provider，不再是裸函数。

目标接口：

```text
provider.prepare({ sinkKind })
  → lease { execute(secretFrameInput), abort(), awaitDrained() }
```

约束：

- `prepare` 不接收 chat、audit payload、handle、secret 或 broker key；
- lease 一枪一用；第二次 `execute`、abort 后 execute 均拒绝；
- `abort()` 同步、幂等地触发 terminate/close authority，供 `will-quit` 使用；
  `awaitDrained()` 提供可等待的真实 close/tree-zero 证明；
- registry `close()` 必须同步 abort 全部 lease，但 session 只有在
  `awaitDrained()` 完成后才从 tracker 移除；
- 本步保留 POSIX 行为，Windows provider 仍返回 containment unavailable；
- 不允许长期保留 production 旧函数 fallback。

测试必须覆盖 ready 前 stdin 为 0 bytes、argv/env/control 无 secret、
close/ready race、double execute、tracker 最终为 0。

#### W1-03：MemoryVault 切换为 prepare → CAS → decrypt

拟改：

- `electron/main/services/memory_vault/service.js` 的 registry normalization、
  `executeUseIntent`、`executionInFlight`、drain/close；
- `vault_sink_executor.js` 的 registry assembly；
- startup assembly 和 use-state 测试。

精确顺序：

```text
validate approved intent and registered sink
→ check and reserve process-local in-flight identity
→ await provider.prepare({sinkKind})
→ validate strict READY
→ CAS approved → executing
→ resolve handles and decrypt
→ await lease.execute(one secret frame)
→ validate and sanitize strict response
→ abort if needed and await lease drain/tree-zero
→ CAS complete receipt
```

`executionInFlight` 的规范算法是：同步读取并验证 intent identity 后，立即检查/
预留 `{operationId, promise}`，再处理 durable status 和调用 `prepare()`。同
operation 共享 promise；不同 operation 返回 conflict。检查必须发生在当前
`row.status === executing` 分支之前，否则 prepare pending 期间两个 caller 会
创建两个 lease。

状态语义固定为：

- prepare/READY 失败：执行路径不改 durable status，通常仍为 `approved`，且
  0 decrypt/frame/effect；
- CAS 返回 0：同步 abort、等待 drain并重新读取 durable truth；若 cancel 等竞争者
  已获胜可为 `cancelled`，不得强写回 approved；始终 0 frame/effect；
- CAS 成功后任何 timeout/crash/protocol/response/cleanup failure：
  `indeterminate`，不得自动重放 effect；
- 完整 worker response 但 tree 尚未归零：仍不得写 complete receipt；drain failure
  直接进入 indeterminate。

#### W1-04：lease lifecycle/fault matrix

补齐：

- crash before CAS、after CAS/before frame、response loss；
- prepare/close、prepare/cancel、CAS/quit、timeout/response 同 tick；
- app restart 恢复 `executing`；
- success response 后 descendant 仍活；
- close before spawn、spawn-before-READY close、READY-before-CAS close。

出口：所有 pre-CAS 格均为 0 frame/effect且执行路径不改 durable status；无竞争
时仍 approved，有 cancel 等竞争时保留获胜状态。所有 post-CAS 格为 indeterminate，
每格 lease 只触发一次 abort/terminal drain、tracker 最终为 0。非 Windows 可先证明
process-group 语义，Windows 整树证明由 W2/W4 完成。

#### W1-05：严格化 worker v1 wire

拟改：

- `unchain_runtime/server/vault_sink_worker.py::_validate_intent`、
  `process_one_frame`；
- Electron worker response validator。

把当前 subset/default 行为改为 exact/versioned：

- version、toolkit metadata 和全部 required key 必须存在；
- unknown/missing/extra key、wrong version、oversized/trailing bytes 均拒绝；
- Electron 写完唯一 frame 后关闭 stdin；worker 在任何 executor/effect 前再读取
  1 byte并要求 EOF。第二 frame或任意 trailing byte 时
  `executor call count=0`，不能在 effect 后才发现；
- success/error response 也用精确 closed union；
- JS producer 与 Python consumer 使用独立测试，不能共享同一宽松 validator 自证。

Python 修改后必须重启 sidecar再做集成验证。

#### W1-06：按 capability 构造 Windows sink registry

- Windows registry 只注册 capability 和 W0 threat/support direct-plan evidence 共同证明的 sinks；
- `computer_input` 与任何 unknown sink 在 prepare/decrypt 前返回
  `vault_sink_unavailable`；
- duplicate/unknown capability entry 使整个 capability invalid，而不是跳过；
- 每个声明支持的 sink 必须由 W4 installed package 真跑。

W1 出口：POSIX focused suites 不回归，全部 pre-ready fault 证明 0 decrypt，
production Windows cap 仍在。实施前需重新运行 GitNexus impact：
`memory_vault/service.js` 与 `vault_sink_executor.js` 当前保守评估为
**CRITICAL**；必须先向用户报告 blast radius 并获得继续实施的明确授权，才可改
production symbol。

### 6B.3 W2 — Windows supervisor 与 Job Object

W2 推荐复用 packaged `unchain-server.exe`，新增
`--vault-sink-supervisor`，不新增 native addon。direct Plan 必须先冻结以下
拓扑；若真实 PyInstaller package 证明不可行，再以新版本协议评估独立 native
launcher，不能在同一运行中偷偷 fallback：

```text
Electron main
└─ PyInstaller supervisor bootloader / Python supervisor   [Job 外]
   └─ same exe --vault-sink-worker                          [创建即在 Job 内]
      └─ shell / MCP child / grandchild                     [同一 Job 内]
```

#### 固定 handle 模型

| Handle | 长期 owner | worker 可见 | 关闭规则 |
|---|---|---:|---|
| unnamed `hJob` | supervisor 唯一 | 否 | tree drain 后最后关闭；supervisor hard crash 时由 OS 关闭并触发 kill-on-close |
| Electron process handle | supervisor | 否 | supervisor finally |
| PyInstaller 直接父进程 handle | supervisor | 否 | supervisor finally |
| non-inheritable ready Event | supervisor | 否 | supervisor READY wait 后关闭 |
| inheritable ready Event duplicate | worker 临时持有 | 是 | 只放入 HANDLE_LIST/bootstrap env；supervisor spawn 后关自己的 duplicate，worker import/restore/membership 后 `SetEvent` 并关闭继承副本 |
| child stdin/stdout/NUL stderr | worker | 是 | supervisor 在 `CreateProcessW` 返回后关闭自己的 duplicate |
| child process/thread、attribute list | supervisor | 否 | thread/list 在 spawn 后立即释放；process 在 exit/drain 后释放 |

worker 不继承、不开启任何 Job handle。supervisor 是唯一长期 Job handle owner，并用
`IsProcessInJob(child, hJob)` 独立验证 membership；不能依赖 worker 自报或环境
Boolean。

#### 外部 READY control 协议草案

Electron 与 supervisor 的 control channel 建议独占 supervisor stderr：

```text
uint32-be payload_length
canonical UTF-8 JSON, max 256 bytes
one startup frame, then monitored silence until child close
```

建议 exact union：

```json
{"containment":"win32_job_list_v1","kind":"ready","protocol":1}
{"code":"vault_worker_job_setup_failed","kind":"error","protocol":1}
```

pre-ready error 只允许静态枚举：
`vault_worker_containment_unsupported`、
`vault_worker_parent_unavailable`、
`vault_worker_job_setup_failed`、
`vault_worker_handle_setup_failed`、
`vault_worker_spawn_failed`、
`vault_worker_attestation_failed`、
`vault_worker_ready_timeout`。未知 code/field/version、partial/oversize startup
frame 统一映射为本地 `vault_worker_ready_protocol_error`。由于 PyInstaller
bootloader 可能继续持有 pipe，EOF 不是 READY 前置；startup frame 后的任何额外
byte/pipe fault 按 `WSEQ-009/WAC-013` 处理，不能再声称“READY 前证明 exactly-one
frame”。control 不得包含 PID、路径、原始 Win32 error、payload 或 secret。以上
字节必须在 W0 direct Plan 中冻结后再实现。

#### W2-00：冻结红证据与性能预算

- 依赖：W0 direct-plan evidence、W1 contract 与 W1-01 red；W2 core 可与 W1-02/03 并行，
  只有 W2-08 Electron 接线依赖 W1-03；Windows 继续 Shadow。
- 保存 forced-shadow、executor win32 0-spawn、direct Windows worker shell 拒绝证据。
- 建议 packaged mixed cold/warm 100 次预算：
  prepare p95 ≤ 5s、p99 ≤ 10s、hard timeout 15s；最终数值由 direct Plan 冻结。
- 若需要 breakaway、broad handle inheritance，或产品要求同步交付
  `computer_input`，停止。

#### W2-01：Win32 ctypes ABI 层

建议新增：

- `unchain_runtime/server/vault_sink_job_supervisor.py`；
- `_Win32Api`、`_OwnedHandle` 和需要的 Win32 structs/constants。

必须：

- `ctypes.WinDLL("kernel32", use_last_error=True)`；
- 显式 `argtypes/restype`，不依赖宿主 C `long` 宽度；
- x64 ABI 断言 pointer/struct size；
- 每个 API wrapper 按自己的失败 sentinel 验证后才能交给 `_OwnedHandle`：
  `CreateToolhelp32Snapshot`、`CreateFileW("NUL")`、`GetStdHandle` 可能返回
  `INVALID_HANDLE_VALUE (-1)`，Job/Event/OpenProcess 通常以 `NULL` 失败；禁止
  用 Python truthiness 统一判断，也禁止 `CloseHandle(INVALID_HANDLE_VALUE)`；
- 覆盖 `CreateJobObjectW`、`Set/QueryInformationJobObject`、
  `Initialize/Update/DeleteProcThreadAttributeList`、`CreateProcessW`、
  `OpenProcess`、`IsProcessInJob`、`WaitForMultipleObjects`、
  `TerminateJobObject`、`DuplicateHandle`、`CreateEventW`、`SetEvent`、
  `GetStdHandle`/CRT-fd conversion、`GetExitCodeProcess`、`GetProcessTimes`、
  Toolhelp parent lookup 与 handle flags；
- 非 Windows fake-kernel tests 证明 error mapping 和所有 partial-init finally；
  Windows tests 实际加载 API 并 create/query/close 空 Job。

任一 ABI size 不符、API 缺失或非 x64，返回 closed unsupported 并保持 Shadow。

#### W2-02：control codec 与静态错误域

- supervisor 启动必须先捕获原 stdin/stdout/stderr，再一次性创建 control writer
  和 child stdin/stdout duplicates；完成这些 duplicate 后才用 `os.dup2` 把 Python
  已初始化的 fd 0/1/2 全部重定向 NUL。只调 `SetStdHandle` 不足以改变既有
  Python stream；supervisor 绝不能消费后续 plaintext；
- writer 最多发送一个限长 frame，发送后立即 close；
- Win32 last-error 只供内部分类，不进入 frame、日志或 exception text；
- producer golden bytes 与独立 JS consumer 分别测 missing/extra/wrong
  version/partial/oversize、duplicate-key JSON 和 secret/path fault injection；
- Electron 在收到第一个完整、逐字节等于允许 canonical bytes 的 frame 后即可接受
  READY，不能等待 control EOF（outer bootloader 可能继续持有 pipe）；READY 后
  control 出现任何额外 byte/pipe fault 都按 WSEQ-009 线性化为 structural loss；
- READY 前 worker response stdout 必须为 0 bytes，任何 stdout byte 都
  fail-before-decrypt。

任何 control channel 杂字节或 raw error 越界即停止。

#### W2-03：打开 parent handles 并建立 kill-on-close Job

建议 symbols：
`_open_parent_handles`、`_create_kill_on_close_job`、`_query_job_limits`。

顺序固定：

1. 严格解析 Electron 传入的十进制 PID，读取 `os.getppid()` 和当前 supervisor
   PID；
2. 先以 `PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE` 打开 Electron、
   direct parent 和 current supervisor 的稳定 process handles，并立即 zero-time
   wait，消除 Toolhelp-before-open 的 PID reuse 窗口；
3. packaged 分支再用 Toolhelp snapshot 验证 direct parent 记录的 parent PID
   等于 Electron PID，并要求
   `electron_creation < bootloader_creation < supervisor_creation`；
4. dev 中 `getppid()==electron_pid` 时走明确的 single-parent 分支，只要求
   `electron_creation < supervisor_creation`，不伪造 bootloader 检查；
5. `CreateJobObjectW(NULL, NULL)` 建 unnamed/non-inheritable Job；
6. 设置并回读 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`；
7. 确认 `BREAKAWAY_OK` 和 `SILENT_BREAKAWAY_OK` 均未设置。

测试覆盖 PID 缺失/非法、parent 已死、Open/Set/Query fault、standalone Windows 和
已有 outer Job runner。若 nested Job 不兼容或需要 breakaway，必须 pre-ready
unavailable，不能降级执行。PID 只用于取得并验证 liveness handle，不能称为固定
process identity；若 parent-chain/creation-time 任一验证失败即 fail closed。

#### W2-04：精确 handles 与原子 worker 创建

建议 symbols：
`_capture_protocol_handles`、`_create_ready_event`、
`_build_worker_command`、`_build_worker_environment`、
`_build_attribute_list`、`_spawn_contained_worker`。

精确流程：

1. 使用 W2-02 在任何 `dup2` 前已经捕获/duplicate 的 Electron stdin/stdout；
2. duplicate inheritable child stdin/stdout，创建 inheritable NUL stderr；创建
   unnamed/manual-reset/initially-unsignaled、non-inheritable supervisor Event，再
   duplicate 一个 inheritable child Event；
3. attribute list 固定两个属性：
   `PROC_THREAD_ATTRIBUTE_JOB_LIST=[hJob]`，
   `PROC_THREAD_ATTRIBUTE_HANDLE_LIST=[stdin,stdout,NUL,childReadyEvent]`；list 中
   每个 handle 必须实际带 `HANDLE_FLAG_INHERIT`，Job/supervisor Event 不得带；
4. 用绝对 `sys.executable`、可变 Unicode command buffer、
   `EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW`
   调 `CreateProcessW`；必须设置
   `STARTF_USESTDHANDLES`、
   `STARTUPINFOEXW.StartupInfo.cb=sizeof(STARTUPINFOEXW)` 和
   `bInheritHandles=TRUE`，handle-list 才真正生效；
5. frozen command 为同 exe 的 `--vault-sink-worker`；dev command 使用绝对
   `main.py`；不得 shell；
6. worker env 从 supervisor 的 reviewed minimal env 与本次 onefile 必需的
   `_PYI_*` 开始，只增加 bootstrap version/Event handle；移除 Electron PID和
   所有 secret，不设置 `PYINSTALLER_RESET_ENVIRONMENT`；自定义 Unicode env
   block 按变量名不区分大小写排序，以双 NUL结束并保活到 spawn 返回；
7. spawn 后立即关闭 supervisor 侧 child duplicates、thread 和 attribute list；
8. supervisor 以 child process handle + Job handle 调 `IsProcessInJob`，必须 true。

`InitializeProcThreadAttributeList(NULL,...)` 第一次返回 false/insufficient-buffer 是
预期 sizing probe。attribute buffer、`HANDLE[]` backing arrays、command buffer 和
environment buffer 必须持续存活到 `CreateProcessW` 返回并调用
`DeleteProcThreadAttributeList`；handle/job list 的 `cbSize` 分别为
`count * sizeof(HANDLE)`。attribute list 不是 kernel handle，不能交给
`CloseHandle`/`_OwnedHandle`。

测试覆盖空格/Unicode/长路径 quoting、decoy inheritable handle、Job handle
不可继承、第一条 worker 可观察指令前已入 Job、descendant breakaway 负向尝试。
不允许“child 先跑，再 Assign”；若未来需 suspended fallback，必须定义独立
`win32_suspended_assign_v1` 并在 direct Plan 重新评估。

#### W2-05：inner worker bootstrap 与入口分派

拟改：

- `unchain_runtime/server/main.py` 新增 supervisor dispatcher，并窄改 worker
  dispatcher；
- supervisor 的 bootstrap consume/signal；
- `vault_sink_worker.py::main(containment_attested=False)`。

入口顺序：

1. `--vault-sink-supervisor` 在 Flask/普通 worker 前最先分派，只接受 Windows
   和精确 argv；
2. supervisor 不调用现有 frozen-environment restore，使 inner same-exe worker
   复用 PyInstaller extraction；
3. inner worker 保留 bootloader 注入的 `_PYI_*`，不得设置
   `PYINSTALLER_RESET_ENVIRONMENT=1`；先显式 preload 所有 bundled worker、shell
   和 MCP execution-time dependencies，再读取并删除 PuPu bootstrap env，
   验证自己在 Job，调用现有 restore，再 `SetEvent`/close Event；
4. 完成以上步骤后才进入 worker main 和读取 stdin；
5. Windows direct worker、缺 Event、错 bootstrap version、非 Job membership 均在
   stdin read 前退出。

优先不修改 `restore_frozen_job_environment`，避免扩大其 CRITICAL blast radius；
但 READY 前必须验证 Windows DLL-directory restore 成功。若无法用窄 postcondition
完成，就对该 CRITICAL symbol 重新 impact、报告 owner 后修正，不能忽略
`SetDllDirectoryW` failure。
测试必须分别证明 source Python 与 packaged exe dispatcher 顺序，且 direct worker
`stdin read count=0`。

#### W2-06：supervisor wait/drain 状态机

建议状态：

```text
NEW → PARENTS_OPEN → JOB_READY → CHILD_CREATED → INNER_READY
    → READY_SENT → TERMINATING → DRAINED → CLOSED
```

pre-ready wait 优先级固定为 Electron、PyInstaller parent、worker、ready Event；
process death 与 Event 同 tick 时 death 获胜。Event signal 后再 zero-time 检查三种
process handle并复核 membership，才发送 READY。

READY 后监视 Electron、parent、worker；任一退出都 terminate Job。worker 正常
退出也要清除可能仍存活的 shell/MCP descendants。查询 Job
`ActiveProcesses=0` 后才能：

- supervisor exit 0；
- Electron 接受 success；
- tracker remove session。

`TerminateJobObject` 后只在固定 cleanup deadline 内轮询 active count；
terminate/query/timeout 任一失败都关闭 `hJob` 触发 kill-on-close，并让 supervisor
非零退出。Electron success 必须同时满足：exact response、worker stdout EOF、Node
child `close` event、exit code 0；不能只依据 response frame或较早的 `exit`
event。`finally` 最后关闭 Job handle；hard-kill supervisor 不执行 finally 时依赖
OS close handle。测试覆盖每个状态 fault、READY/parent-death race、
terminate/query failure、重复 close、partial init 与 hard kill sentinel。

#### W2-07：Windows worker sink gate

拟改 `vault_sink_worker.py` 的 execute/shell/MCP/termination/validation：

- Windows shell/MCP 只有内部 `containment_attested is True` 才可 spawn；
- 移除 shell 的无条件 NT 拒绝，但不放宽任何 direct-worker 路径；
- Windows timeout 只 kill direct process；整树 authority 是 Job，不再查 PATH 调
  `taskkill /T`；
- sink descendants 的 env 移除 bootstrap handles、Electron PID 与 `_PYI_*`；
- `computer_input` 继续 unsupported，并由 Electron registry 在解密前挡住；
- fake MCP 必须覆盖普通 child+grandchild；WMI/计划任务/服务等 brokered creation
  若为依赖，该 sink 不得宣称 supported。

#### W2-08：Electron READY、lease 与 shutdown 接线

- Windows entrypoint 切到 `--vault-sink-supervisor`；POSIX 仍是 worker；
- Electron 只传供 W2-03 建立已验证 liveness handle 的 parent PID和最小环境，
  不把 PID 本身当固定 identity，也不传明文；
- strict parser 消费一个 READY control frame；
- READY 前不 build secret frame、不写 stdin、不 decrypt；
- response 完整后仍等待 supervisor exit 0/tree drain；
- `close()` 永久关闭 registry；若产品需要 suspend/resume，另提供
  `abortActive()` 杀当前 lease但不重开旧 lease；
- `will-quit` 可以同步终止直接 child，但安全 authority 是 parent watch +
  kill-on-close，不能依赖异步 await 才安全。

完整 response 但 cleanup 未确认仍为 indeterminate。必须测试 close 在 spawn、
READY、CAS、decrypt/write、response/cleanup 各边界，以及 Electron/bootloader
hard kill 和 suspend/resume。

#### W2-09：PyInstaller/package 接入

- `unchain_runtime/scripts/build_unchain_server.ps1` 收入 supervisor module；
  相关 Linux/macOS build recipe 同步保持 parity，但不改变其执行语义；
- 保持一个 `unchain-server.exe`、onefile、现有 extraResources；不增加
  pip/npm/native dependency或第二个签名目标；
- PyInstaller 不能继续使用无上限的 `>=6.10`；pin exact tested version，最低须
  包含 6.22.1 引入的 onefile child-path security validation，并把版本写入 build
  identity；
- 实测 same-exe inner spawn 的 PyInstaller extraction 拓扑，不假设 bootloader
  只有一层；只要求从 `CreateProcessW` 得到的根与所有 descendants 都在 Job；
- 若 self-spawn/extraction 不稳定、任一 bootloader 逃出 Job 或性能超预算且证明是
  supervisor 架构所致，才回到 direct Plan 评估独立 native launcher。

#### W2-10：packaged containment harness

建议新增 release-QA harness 与 unit test，至少输出：

`candidate identity`、sidecar/wheel/runtime digests、OS/arch、protocol、
`executed_tests`、race matrix、latency percentiles、orphan/sentinel/secret-leak
counts。

在 Windows package 上执行 shell env、shell stdin、fake MCP；success/nonzero/
timeout/bad frame/oversize；kill supervisor/bootloader/parent；normal quit/suspend/
cold restart；outer Job；100 次 mixed soak。synthetic secret 的 raw/base64/
base64url/hex/percent variants 只允许出现在 sink contract 的目标槽位和租期；
`shell_secret_env` 的目标进程 env 是显式例外。supervisor/bootloader/无关进程、
argv/cwd/stdout/stderr/control/log/temp 和租期外必须为零。

W2 出口只代表真实 packaged supervisor/Job/READY/tree-zero 成立，状态记为
`IMPLEMENTED_SHADOW`。不得在 W2 删除 Windows rollout cap。涉及
`main.py::_dispatch_vault_sink_worker` 或 `main` 前须重新 impact；当前为
**CRITICAL**，约影响 59–61 条流程。

### 6B.4 W3 — capability、readiness 与 privacy DELETE

W3 才把“这个已安装 candidate 确实有 containment”接入 rollout。不能用
`platform === win32`、环境 Boolean、PATH 中某个 exe 或进程自报作为 capability。

#### W3-01：实现 exact artifact provenance

- build sidecar 后生成 closed/versioned provenance，至少包含：
  actual sidecar SHA、wheel SHA、runtime manifest digest、supervisor/worker
  protocol、supported sinks、platform/arch；
- 受控 snapshot 保存**预期** payload-lineage/provenance inputs（含 sidecar SHA），
  不保存尚未计算的 build identity，也不包含未来 installer/install digest；
  snapshot exact bytes finalized 后才计算
  `build-identity = H(payload-lineage fingerprint + snapshot fingerprint)`；
  Electron 运行时从 frozen absolute entrypoint 重新 hash installed sidecar；
- packaging 生成 package attestation，安装后另生成 install attestation；最终由仓外
  evidence envelope 引用 payload/build/package/install 四层 parent chain，不让
  任何 manifest 自引用；
- companion manifest 不单独充当 trust root，避免攻击者同时替换 exe + 自报 manifest；
- missing/tampered/wrong arch/wrong protocol/digest mismatch 全部得到静态
  unavailable reason。

测试从 clean build 开始，证明 snapshot 缺失时 release build 失败，且 package、
installed smoke 与 runtime status 看到同一个 fingerprint。

#### W3-02：one-shot capability latch

拟改：

- `electron/main/services/unchain/memory_v2_rollout.js` 的 platform constraint；
- `electron/main/services/unchain/service.js` 的 runtime config/readiness；
- 新 main-only 的一次性 capability configure surface，不暴露 renderer/IPC。

状态机：

```text
pending → ready
        ↘ unavailable
ready → lost
```

`unavailable` 和 `lost` 是本次 app lifecycle 的终态；`ready` 只能单向转为
`lost`，不能回 pending/ready。只有完整 app restart 才能重新 probe。规则：

- `probe_verified` 只是启动函数内的 closed receipt，不写入 latch、readiness 或
  status payload；
- `ready + exact identity` 才允许 Windows 保留 release snapshot 中的
  `canary/all`；
- pending/unavailable/malformed 一律压为
  `shadow + degraded + platformActiveBlocked=true`；
- service/startMiso 后禁止由 unavailable 向 ready 抬高；
- 未配置就启动，自动 latch unavailable；
- capability payload 是 exact schema，不能接受 Boolean `true`。

当前 Unchain service 在构造时冻结 runtime config，所以实现需要受控的一次性
configure/recompute，且必须发生在 sidecar start 之前。

#### W3-03：拆出专用 privacy DELETE transport

拟改 `electron/main/services/unchain/service.js`：

- 保留 private low-level authenticated HTTP sender；
- 普通 `contextV2Request` 继续执行 rollout/readiness gate；
- `deleteContextV2Chat` 以固定 method/path/body 直接调用低层 sender；
- 仍执行 `ensureMisoReady`、auth header、固定 DELETE deadline、限长 response、
  closed request/receipt 和
  durable-owner authority；
- 只绕过 ordinary Memory V2 admission readiness，不接受任意 endpoint/method
  参数，不新增 renderer channel；
- 使用 DELETE 专用 strict parser，完整保留 sidecar `code + retryable`。当前
  generic JSON error path 会丢掉 `retryable`，不得继续复用；
- 同步纳入 `unchain_runtime/server/route_memory_v2.py` 与双方 golden tests：
  P6 必须把 Unchain versioned receipt、no-store receipt、legacy receipt 归一为一个
  versioned success schema，或冻结完整 exact discriminated union；error 也要列出
  每个 code 允许的 retryable 值。missing/extra/unknown/非法配对一律 fail closed。

当前 generic fetch 没有 deadline。实现必须使用 `AbortController`/等价机制和固定
上限；offline/abort/timeout 映射为 typed transient，auth/request/schema 错误为
terminal，unknown response 进入 P6 bounded fail-closed fallback。timeout 后
outbox `processing` 必须释放，并按 P6 继续/保存 Vault 腿；永久挂住或继续阻断
Vault 是 stop condition。

红/绿矩阵：

- Windows requested-active 但实际 shadow/degraded 时 DELETE 仍发出；
- 同时 list/read/write 等 data-plane 请求仍被拒；
- `off/shadow/degraded/canary/all` exact method/path/body/auth；
- sidecar offline 为 transient retryable；terminal schema error 保持 typed
  non-retryable；
- hung sidecar 在 deadline 后释放 processing，冷重启不重置 retry budget；
- renderer/preload API surface 不增加。

#### W3-04：bounded outbox 与双 checkpoint

依赖 P6 direct Plan 对 chat identity、腿执行顺序、quarantine/requeue 给出已验证的技术结论。
拟改 `electron/main/services/chat_storage/deletion_outbox.js` 的 processing、
progress/retry/wake/fence：

- P6 明确 retry budget 是 per-leg 还是 per-operation，并冻结最大 attempts、最大
  elapsed time、backoff/jitter、terminal/unknown code 表；attempt/time 起点必须
  durable，冷重启不得重置；
- transient 才进入 bounded retry；
- terminal、预算耗尽或 P6 direct Plan 固定的 unknown fallback 进入 `quarantined`，保存
  versioned quarantine receipt；显式 requeue 记录新 generation/reason，不能抹掉
  旧证据；
- `nextDue/nextWakeDelay` 只选择 `pending/retry`，不再用
  `status != complete` 做 due selection；
- `findActiveDeletion(status != complete)` 继续 fence quarantined chat identity；
- Context 与 Vault checkpoint 分别立即持久化，冷重启不重复已完成腿；
- 若 P6 批准独立收敛，Context 失败后仍尝试 Vault，但整单不得标 complete；
- unknown error code fail closed，使用 P6 的 bounded fallback，不能无限热循环；
- repair/requeue 是显式操作，不因重启自动解除 quarantine。

验收覆盖 parser 丢 `retryable` 的 red、terminal hot loop、Context 阻断 Vault、
completed leg 重放、quarantine fence、sidecar offline/recovery 和冷重启。任何
重启后 retry 预算归零、无限增长或 quarantine 被 due loop 重新拉起，均为 NO-GO。

#### W3-05：启动顺序接线

Electron main 的顺序固定为：

```text
vault init
→ resolve and hash exact installed sidecar
→ create provider factory/probe runner, but no sink registry yet
→ no-secret supervisor/Job/worker probe
→ validate READY + provenance into local probe_verified receipt (not rollout-ready)
→ construct exact sink map from probe_verified + W0 support direct-plan evidence
→ configure registry
→ start broker
→ verify exact broker registry/protocol binding
→ latch final capability ready
→ start sidecar with effective rollout snapshot
```

probe 失败时同步 close probe provider、不构造可执行 sink map、不启 broker、latch
unavailable；registry/configure/broker 任一步失败时 stop broker、close/drain
provider并 latch unavailable。只有全部成功才从 pending latch 为 final ready，
随后 sidecar 以 effective mode启动；所有失败分支 sidecar 均以 Shadow启动并继续
提供 privacy DELETE。测试必须加载真实 startup assembly，证明 registry key set 不会
先于 probe_verified 决定、final ready 不会早于 broker ready、sidecar 不会早于 final
latch；错误日志只有 static code。

#### W3-06：运行时 capability loss 单向降级

只有 structural containment/provenance failure 触发全局 `ready → lost`；普通某次
sink effect failure 只让该 intent indeterminate，不能误伤全局 capability。

loss 顺序：

1. 新 main-only lifecycle kill switch（例如
   `disableSinkExecutionForLifecycle(staticCode)`）在同一个同步临界区完成
   `ready→lost`、readiness degraded、拒绝新 admission/prepare，并向 active
   streams 发出 abort；不得先等待 drain 再降级；
2. 同步 abort/关闭 executor registry并 stop broker；
3. 临界区退出后再异步等待所有 lease/Job `awaitDrained()`，期间仍保持 lost；
4. sidecar 保留或以 Shadow restart，只用于 sticky continuity 和 privacy DELETE；
5. **不调用会关闭 Vault DB 的普通 service `close()`**；DB 和
   `deleteUseStateForOwnerChat/listDescriptors/deleteSecret` 保持可用，以便 privacy
   Vault cleanup；
6. 不修改已存在 owner，不回退 legacy；
7. 本进程内不自动恢复，完整 app restart 后才重 probe。

必须测试 active stream cancellation、loss 后新 lease/stream 拒绝、sidecar restart
不会自动 active、privacy DELETE/Vault cleanup 仍可用，以及 broker one-shot key
不被错误复用。结构性 loss 由 provider 的一次性 callback 触发，使用 static code；
普通 intent error 不得触发。kill switch 若只能通过关闭 Vault DB 实现，本步 NO-GO。

#### W3-07：移除无条件 win32 hard cap，只开放内部 canary

这是最早可以修改当前 Windows hard cap 的步骤，依赖：

- W1 全部 `IMPLEMENTED_SHADOW`；
- W2 packaged containment 全绿；
- W3-01..06 全绿；
- P6 closure；
- W4-01/02 已通过，W4-10a 已把它们纳入 stable aggregator，W4-10c 已把该
  aggregator 设为 repository/promotion required gate。

正负结果：

- valid exact capability：
  `platformActiveBlocked=false`，effective mode 保留 release canary/all，
  readiness ready；
- missing/tampered/wrong arch/wrong protocol/outer-job incompatibility：
  仍强制 Shadow/degraded；
- 两边 privacy DELETE 都可用。

此步只允许构建供 W4 隔离验收的 internal-canary candidate；在 W4 closure 前不得
分发到内部设备，更不能 public/all。production channel 的 snapshot 继续保持 Shadow。任一适用格
`NOT_RUN/PENDING` 为 `INCOMPLETE`，继续 Shadow；任何 failure 为 `NO-GO`。

W3 主要 production files：

- `electron/main/services/unchain/memory_v2_rollout.js`
- `electron/main/services/unchain/service.js`
- `electron/main/services/chat_storage/deletion_outbox.js`
- `electron/main/services/memory_vault/vault_sink_executor.js`
- `electron/main/index.js`
- `scripts/build-web.cjs`
- `unchain_runtime/server/route_memory_v2.py`（DELETE closed union）

所有 `.cjs` 主测试与 `.js` wrapper 必须同步。每个 production symbol 编辑前单独
跑 upstream impact；任何 HIGH/CRITICAL 先向 owner 报告。

### 6B.5 W4 — exact installed Windows qualification

当前 release lane 有三类 false green，W4 必须逐项消除：

1. clean checkout 缺忽略的 feature snapshot，web build 会默认 flags=off；
2. package smoke 启动的是 build 目录 sidecar，Playwright 启动的是 repo cwd 下的
   source Electron，不是 NSIS 安装结果；
3. Windows Playwright 可 `continue-on-error`，final/merge 没有强制 installed、
   containment、privacy 和 Playwright 报告存在且非零；
4. 2026-08-21 的 live main ruleset `11921569` 没有
   `required_status_checks`，且存在 always-bypass role；即使 aggregator 自身修好，
   也还没有 repository-level merge enforcement。

W4 不允许测试 job checkout 后重建 candidate。唯一合法链为：

```text
one payload lineage → one exact snapshot/build identity
→ one Electron package → one installer artifact
→ clean install → hash installed bytes → execute installed app/sidecar
→ merge reports through package attestation → install attestation → evidence envelope
```

签名时点采用分层方案：W4-G1 可以资格化 internal unsigned/test-signed candidate，
因此 `#200-S/R` 不阻断底层 W4；但任何 public signed descendant 只能复用同一
payload-lineage identity。它的 snapshot 必须生成新的 build identity，并生成自己的
package/install attestation、验证 Authenticode 只改变获准签名 envelope，再重跑
W0-10 installed 矩阵。unsigned W4 证据不能直接继承为 public signed candidate
证据。

| ID | 任务 | 环境与依赖 | 必须证据 | NO-GO |
|---|---|---|---|---|
| `W4-01` | READY/request/response closed protocol、pre-ready fault、CAS race、unsupported sink 单元矩阵；同步 `.cjs/.js` | Ubuntu + `windows-latest`；W1/W2 | Jest/pytest machine-readable reports，`executed_tests > 0` | subset/default-version validator；skip-only；READY 前解密 |
| `W4-02` | Win32 ABI/Job contract：kill-on-close、no-breakaway、job-list、handle-list、non-inheritable Job handle、outer-job verdict | `windows-latest`；W2 | OS build/arch/ABI sizes、Job limits、handle allowlist receipt | assign 前执行 child；ambient/decoy handle 可用；raw Win32 error 越界 |
| `W4-03` | 真实 process tree：cmd/PowerShell/fake MCP child+grandchild；success/error/timeout/bad frame；kill worker/supervisor/bootloader/Electron | Windows 11 x64 standalone + synthetic outer Job | process-tree JSONL、Job accounting、delayed sentinel、handle matrix | 任一 orphan/sentinel；breakaway 成功；outer-job 不兼容却继续解密 |
| `W4-04` | 100 次 mixed soak 与竞态：prepare/quit、prepare/cancel、CAS/quit、timeout/response；secret variants 在许可槽位/租期外的扫描与 handle/tracker 检查 | Windows 11 x64 | latency、orphan/sentinel/leak count、handle baseline/delta | 单次 containment failure；许可边界外 secret 泄漏；单调 handle 增长；post-CAS 自动 replay |
| `W4-05` | P6 privacy deletion 精确矩阵：所有 rollout mode、sidecar offline、terminal schema、Context/Vault 单腿完成、冷重启、repair/requeue | Windows integration + installed app；P6 | checkpoint 前后 DB snapshot、owner/receipt/error、`windows-privacy-delete-matrix.json` | generic 500、无限 retry、已完成腿重跑、Vault 残留、chat resurrection |
| `W4-06` | 一次构建 internal qualification candidate；生成 build identity 与 package attestation。签名不得重建 wheel/sidecar；public signed descendant 在 `#200-S` 后生成并重跑 W0-10 矩阵 | Windows builder；W0-05；`#200-S` 仅阻断 public | wheel/runtime/sidecar/snapshot + app/asar/installer hashes | 多 wheel；签名后 payload 漂移；unsigned 证据直接冒充 public signed 证据 |
| `W4-07` | 将同一 NSIS installer 静默安装到 clean VM，从安装目录重新定位并 hash app/asar/sidecar/provenance | clean Windows 10 x64 + 11 x64 | installer/install logs、`windows-installed-manifest.json` | 测 `dist/windows` 代替 installed bytes；安装后 identity 不符 |
| `W4-08` | installed app 黑盒 Vault/containment：从已安装 `PuPu.exe` 启动，全部 W0 获准 sinks 真跑，computer_input pre-decrypt 拒绝，quit/crash tree-zero | W4-07；外部 fake provider/MCP/process harness | installed Vault report、process image SHA、`app.isPackaged=true`、runtime origin、process/sentinel/secret evidence | 为测试重打另一个 package；加载 repo/dev server/source runtime；启用 packaged Test API；orphan/leak |
| `W4-09` | 同一 installed candidate 执行 CTX-S01..S08、normal/second turn/interaction/retry/resume/restart/graph/subagent/delete | W4-07/08；P6 closure | 逐格 PASS 或 N/A+direct-plan rationale、test count、分层 artifact fingerprints | applicable 格 `NOT_RUN/PENDING`；用源码 Python/Electron代替安装包 |
| `W4-10a` | qualification pre-gate：在 S7 前把 W4-01 unit 与 W4-02 Job reports、对应 `needs.*.result` 和 nonzero test count 设为 Windows qualification required | W0-06、W4-01/02 | workflow self-tests、missing/zero/failure fixtures | W3-07 能在 unit/Job report 缺失或失败时生成 candidate |
| `W4-10b` | installed final enforcement：按 mode-aware expected-report manifest 检查 W4-03..09 全部适用 `needs.*.result`、报告/schema/fingerprint/`executed_tests>0`；upload missing-file hard fail | W4-03..09、W4-10a | lite/release/windows-active 三模式 reporting self-tests，missing/zero/tamper fixtures | 从下载结果反推 required set；缺 installed report 仍绿；外部 Win10/11 证据无 ingest/promotion gate |
| `W4-10c` | repository enforcement：保持一个所有适用 mode 都会产生的稳定 Final Release QA aggregator check，把它加入 main 与实际 release branches 的 required ruleset，并让 promotion workflow消费 exact W-G1 result；bypass 必须禁用或留下 owner/audit reason | W4-10a；W4-10b 完成后沿用同一 check | ruleset API attestation、required check name/app ID、成功/失败 PR fixture、promotion dependency、bypass audit | 只修 workflow 不修 ruleset；check name不稳定；可无记录 bypass；promotion 不依赖 exact report |
| `W4-11` | owner evidence review 与 exact-candidate closure | W4 全部 | owner-attested evidence index、Electron/runtime/Unchain/security owner approvals | digest/OS/arch/harness identity 不明；宣称支持但目标客户端 OS 未测 |

为避免 candidate 依赖环，执行顺序固定为
`W4-01/02 → W4-10a/10c(pre-gate) → W3-07/S7 生成隔离且不可分发的 candidate
→ W4-03..10b/10c(final)/11
→ W-G1 → W5/S9 internal distribution`。

#### W4 test suites 与运行约束

Focused JS 至少覆盖：

- `electron/tests/main/memory_vault_use_state.test.cjs`
- `memory_vault_sink_executor.test.cjs`
- `memory_vault_startup_assembly.test.cjs`
- `memory_v2_rollout.test.cjs`
- `memory_v2_startup_readiness.test.cjs`
- `chat_deletion_outbox.test.cjs`

Focused Python 至少覆盖：

- `unchain_runtime/server/tests/test_main_vault_sink_worker.py`
- `test_vault_sink_worker.py`
- 新 supervisor/Job tests
- `test_route_memory_v2.py`
- `test_memory_v2_deletion*.py`

Release-QA 至少覆盖：

- `scripts/release-qa/unchain-artifact*.test.mjs`
- `artifact-continuity-workflow.test.mjs`
- `package-sidecar-smoke.test.mjs`
- `reporting.test.mjs`
- 新 installed/containment harness self-tests
- `.github/workflows/release-qa.yml` 的 missing-needs/report enforcement fixture

Python 必须使用 Unchain 自身环境和 exact wheel/artifact pair；改 `.py` 后重启
sidecar。Windows installed Playwright 应直接指定已安装 executable，不能再通过
`require("electron")`、repo cwd、`NODE_ENV=development` 启动 source app。
它还必须证明 process image SHA 命中 install attestation、
`app.isPackaged === true`、页面来自 installed `app.asar/build`、没有
`ELECTRON_START_URL`/React dev server、未设置 `NODE_ENV=development`、
packaged Test API 关闭、`PYTHONPATH/UNCHAIN_SOURCE_PATH` 为空且 runtime origin
是 installed sidecar。资格化 VM 应能在没有 repo checkout 的条件下运行。测试
harness 不得为生产 renderer 增加后门。

#### W4 evidence bundle

每个 candidate 至少保存：

```text
windows-payload-lineage.v1
windows-build-identity.v1
windows-package-attestation.v1
windows-install-attestation.v1
windows-evidence-envelope.v1
windows-build-snapshot.json
windows-job-api-contract.json
windows-containment-process-tree.jsonl
windows-containment-soak.json
windows-installed-manifest.json
windows-installed-vault.json
windows-privacy-delete-matrix.json
ctx-windows-installed-matrix.json
release-qa-merged-report.json
github-ruleset-attestation.json
```

每份报告都要包含 schema/version、其执行阶段已经存在的最深层 identity
fingerprint、source revision、OS/arch、harness digest、executed count 和
PASS/FAIL/N/A。pre-package 报告只绑定 build identity，不能伪填未来 installer
digest；installed 报告必须绑定 install attestation。N/A 必须有 W0 support direct-plan rationale；
缺字段、未知字段、零测试、identity drift 都 fail closed。artifact retention 必须
覆盖 W5 的 24h + 48h + 48h + 72h + 稳定观察期和 rollback 窗口；现有短 retention
若不足，W4-10b 必须先修。

W4 出口为 `W-G1 PASS`：同一 installed qualification candidate 的全部适用矩阵
合格，且 security/runtime/Electron owner 接受证据；production channel 在此之前仍
保持 Shadow。W-G1 只授权进入 W5-00A/01 的 internal Shadow rollback/observation；
其 promotion 通过后才可把已验收的 Active candidate 分发给受控内部设备，更不等于
允许 public rollout。

### 6B.6 W5 — staged rollout 与回滚

当前 feature snapshot 是 build-time、immutable 输入。同一 installer 不能从 5%
原地变成 25%/all。跨阶段使用同一 code/wheel/sidecar、只改变受控 snapshot 的
configuration-only descendant：复用 payload-lineage identity，但每个 snapshot
都产生新的 build identity、installer SHA、package/install attestation 和自己的
W0-10 required installed evidence。

当前 canary 是按 `owner_chat_id` hash 分桶，不是按设备或用户。internal Active
优先使用只分发给受控设备的 `canary_percent=100` candidate；若不用 100%，证据
必须记录确定命中 bucket 的 synthetic chat IDs。public 5%/25% 的分母是**新 owner
chat admissions**，不是安装量或设备量；sticky chat 不因 percent 改变重新分桶。

以下观察时长是初始下限，必须在 W0 direct Plan 中结合样本量正式冻结：

| ID | 阶段 | 前置 | 最小观察与证据 | Gate / 回滚 |
|---|---|---|---|---|
| `W5-00A` | Internal stop/rollback gate：从 W-G1 payload lineage 生成/安装一个新 build-id 的 Shadow descendant，并验证受控设备分发撤销、强制安装或等价 authority | W-G1；不依赖 `#200-S/R` | exact Shadow package/install attestation、W0-10 格、设备控制与内部止血 SLA 演练 | 受控设备不能在 SLA 内停止/替换：不得 W5-01/02 |
| `W5-00B` | Public signed stop/rollback gate：落实 W0-08 与 `#200-S/R` | `#200-S + #200-R`；可与 internal observation 并行 | payload-lineage comparator、signed Shadow package、update/remote-stop 传播与未更新客户端演练 | 只有用户可选 updater却承诺即时 stop：不得 W5-03 |
| `W5-01` | Shadow internal | W5-00A exact Shadow descendant | ≥24h 且达到 W0 样本下限；probe、privacy DELETE、restart、artifact telemetry | 任一 capability/artifact/owner/schema drift：修复后重跑 W4 |
| `W5-02` | Internal Active | W5-01 promotion + W5-00A；分发 W-G1 exact qualification candidate；P6 CLOSED；仅 W0 获准 sinks；100% internal 或确定命中 chat bucket | 受控内部设备 ≥48h；复核 W0-10 identity并跨 app/sidecar/outbox restart 与 crash | #195 标记 internal-canary；hard-zero 事件触发 internal stop path 和 Shadow candidate |
| `W5-03` | Public 5% | W5-02 promotion + W5-00B；5% descendant 重跑 W0-10 格 | ≥48h + 以新 owner-chat admissions 计的样本下限 | operational budget 超限或 hard-zero 非零，按 public SLA 停止新 admission；SLA 无法保证则 NO-GO |
| `W5-04` | Public 25% | W5-03 promotion；25% descendant 重跑 W0-10 格 | ≥72h；覆盖正常重启、sidecar 冷启、Electron/launcher crash、DELETE cold replay | 新 quarantine、owner/schema mismatch 或 hard-zero 非零，按 direct Plan 固定的 stop/rollback 执行 |
| `W5-05` | Windows all | W5-04 promotion；全部 WSEQ/CTX applicable 格 PASS；all descendant exact installed verified | all candidate 重新跑完整 CTX-S01..S08 与适用 WSEQ，不能继承 canary WAC；promotion direct-plan evidence、rollback仍可用 | 任一 `NOT_RUN/PENDING`、P6 或 `#200-S/R` 未闭合，或 identity drift：不得 all |
| `W5-06` | all 后稳定期 | W5-05 | 建议 ≥7 天；保留 Shadow rollback 与 sticky-owner inventory | 完成 #195；仍不授权 M5 legacy retirement |

promotion edge 不可跳级：
`W-G1 → W5-00A → W5-01 → W5-02 → W5-03 → W5-04 → W5-05 → W5-06`。
`W5-00A` 必须在 W5-01 前完成；`W5-00B` 可与 W5-00A/01/02 并行，但必须在
W5-03 前完成。

所有阶段 hard-zero 指标：

- decrypt/frame/effect before READY；
- Job escape/orphan/delayed sentinel；
- raw 或 encoded secret leak；
- artifact/snapshot/protocol mismatch；
- schema/owner drift、chat resurrection；
- 已完成 Context/Vault deletion checkpoint 重放。

internal 回滚使用 W5-00A 的受控设备 authority；public 回滚必须使用 W5-00B/
W0-08 已冻结的 stop authority，在明确 SLA 内停止新 admission 和新的 Vault use，并
分发/启用受控 Shadow descendant。若客户端在 SLA 内尚未收到 stop，路线图必须如实
记录其仍可 admission，不能宣称“已经全局停止”。回滚不得改 sticky owner、删除
marker/DB、复活 legacy admission 或重放 indeterminate effect。

### 6B.7 任务到契约的 traceability

| Boundary | 关键 sequences | 主要任务 | 验收 |
|---|---|---|---|
| `WBC-001` Vault → lease | WSEQ-001/002/003/004 | W1-01..04、W2-08 | WAC-001/003/004/005/012 |
| `WBC-002` Electron → supervisor | WSEQ-001..005/008/009 | W2-02/04/06/08、W3-05/06 | WAC-001/002/003/004/005/007/009/010/012/013 |
| `WBC-003` supervisor → Job tree | WSEQ-001..005/008 | W2-01/03/04/06/07/09/10 | WAC-002/003/004/005/006/011/012 |
| `WBC-004` plaintext frame → worker response | WSEQ-001..004/008 | W1-05、W2-07/08、W4-01 | WAC-003/004/006/009/012 |
| `WBC-005` capability → rollout/readiness | WSEQ-002/005/006/008/009 | W3-01/02/05/06/07 | WAC-007/009/010/011/012/013 |
| `WBC-006` privacy DELETE | WSEQ-004/006/007/008 | W0-07、W3-03/04、W4-05 | WAC-008/009/010/012 + P6 direct-plan AC |
| `WBC-007` builder → installed candidate | WSEQ-006/008 | W0-03..06、W3-01、W4-06..11 | WAC-009/010/012 |

WSEQ coverage：

- `WSEQ-001`：WAC-001/002/004/005/006；
- `WSEQ-002`：WAC-001/002/003/007/012；
- `WSEQ-003`：WAC-003/004/005；
- `WSEQ-004`：WAC-004/005/008；
- `WSEQ-005`：WAC-002/003/005/007/011/012；
- `WSEQ-006`：WAC-007/008/009/010/012；
- `WSEQ-007`：WAC-008/009/010/012 + P6；
- `WSEQ-008`：WAC-001..010/012。
- `WSEQ-009`：WAC-003/004/005/007/013。

Windows direct Plan 应在 W0 把摘要 WAC 扩成原子 AC。例如“kill Electron 无 orphan”
和“kill supervisor 无 orphan”必须是两个独立 AC，不能靠一个笼统 lifecycle AC
掩盖未执行分支。

### 6B.8 建议 change slices

每个 slice 独立 review、focused test 和 `detect_changes(compare main)`。
production channel 的 snapshot 在 S9 前始终保持 Windows Shadow；S7 产生的
Active-capable candidate 只能进入隔离验收环境，不能分发：

1. **S0 — documents/red only**：Windows direct Plan、support/candidate schema、
   current false-green/red fixtures；不改 production；
2. **S1 — lease primitive**：provider/lease/tracker，production 尚未接线；
3. **S2 — lease state machine + strict worker wire**：prepare→CAS→decrypt 与 exact
   protocol；Windows仍拒绝；
4. **S3 — Win32 supervisor core**：ctypes/Job/inner bootstrap/package hidden import；
   source 与 packaged harness；
5. **S4 — privacy DELETE/P6**：专用 transport、typed retryable、quarantine 和双
   checkpoint；可独立早交付；
6. **S5 — capability/provenance/startup/loss**：no-secret probe 和 one-shot latch；
   release config仍 Shadow；
7. **S6 — qualification prechecks**：先完成 W4-01/02、W4-10a/10c 和
   release-QA schema/red；
8. **S7 — isolated qualification candidate**：P6 closure、W1/W2/W3 和 W4-01/02
   通过后，合入 capability-aware cap，生成不可分发的 internal-canary candidate；
9. **S8 — installed qualification**：用 S7 exact candidate 完成
   W4-03..10b/11 的 NSIS install、installed Playwright/containment/CTX 和 final
   report enforcement；
10. **S9 — internal staged distribution**：`W-G1 PASS` 后先生成/安装 Shadow
    descendant、完成 W5-00A/01；promotion 后才把 W-G1 exact Active candidate
    分发给受控内部设备进入 W5-02；
11. **S10 — public descendants**：5%/25%/all 每阶段只允许 direct Plan 已固定的 snapshot delta，
    各自重跑 W0-10 矩阵并逐次批准。

若某 slice 需要跨 repository/process/provider/serialization/persistence/durable
state 边界，PR/变更说明必须列适用 BC/SEQ/AC 和 exact deployed revision pair。

### 6B.9 每步交付模板

每个 W-task 完成时在本路线图执行记录或 #195 的执行评论中追加：

```text
Task:
Status:
PuPu revision + dirty diff fingerprint:
Unchain wheel SHA + runtime manifest digest:
Build snapshot fingerprint:
Payload-lineage + build-identity fingerprint:
Package + install attestation fingerprints:
Applicable BC/SEQ/AC:
Red evidence:
Green commands and executed test counts:
Windows OS build / arch:
Negative tests:
Known N/A with direct-plan rationale:
GitNexus impact before edit:
GitNexus detect_changes after edit:
User / designated maintainer review:
Stop/rollback decision:
```

证据中不得保存真实 secret、chat 内容、用户路径、PID 或 raw Win32 error。测试用
synthetic secret 只记录命中计数和 digest，不记录原文。

### 6B.10 第一执行包

执行状态（2026-08-21）：已完成 `W0-01 + W0-02 + W0-03 + W0-06 + W0-09` 的
**W0-DRAFT + RED_SAVED** 首包。其 canonical direct Plan 是本路线图与
[#195](https://github.com/haoxiang-xu/PuPu/issues/195)，不使用已停用的 court
机制；它只冻结支持/候选/发布 gate 草案及 red baseline，不授予 Windows Active、
运行时 guard、Vault/Job Object supervisor 或 GitHub ruleset 的任何变更权限。

1. 在 direct Plan 中实例化本节 `WBC/WSEQ/WAC` 工程 contract/sequence/acceptance；
2. 冻结 Windows 10/11 x64 + 暂定三 sink 的 threat/support matrix；
3. 给 clean-CI snapshot false-green、source-E2E-not-installed、missing-report、
   no-required-ruleset、decrypt-before-containment 和 forced-shadow 各加一条 red
   fixture/evidence；
4. 保存 exact revisions、test diff hash 和失败报告；
5. 输出 `W0-DRAFT + RED_SAVED`；随后完成 W0-04/05/07/08/10 和 direct-plan
   W-G0 gate，才领取 W1-01 与 W2-00。

第一执行包的完成定义是 `W0-DRAFT + RED_SAVED`，不是 `W-G0`、不是代码
“能跑”，更不是 Windows Active。

#### W0 direct-plan 执行记录

- **支持面**：Windows 10/11 x64 仅 `shadow_only`；Windows ARM64 与
  `computer_input` 为 `unsupported`。`shell_secret_env`、`shell_secret_stdin`、
  `mcp_schema_secret` 在 W-G0 前均为 disabled；Job Object 未来最多只能声明普通
  `CreateProcess` 子孙的合作式生命周期 containment，不能宣称 OS-wide sandbox 或
  覆盖 WMI、计划任务、服务与 parent-spoof escape。
- **candidate identity**：按 `payload-lineage → release-snapshot → build-identity →
  package-attestation → install-attestation → evidence-envelope` 分层；snapshot 必须
  单次生成、精确复用。缺字段、snapshot/fingerprint 不一致、source-only/build-output-only
  Windows proof、缺/零执行 report 或可绕过 required check 一律 fail closed。
- **已保存 red baseline**：PuPu `002fb8adf71d37d06c0195ae14733936d6609c71`；协议
  mismatch 的 red detector SHA-256 为
  `6395bb4119e88468f47ea03fb66adad0c19c571d358ee2f2c4294d5c10fb2a79`，日志与结论保存于
  #195 的 W0-04 评论。clean snapshot default-off 与 smoke hard-coded-all 的 historical red
  均已保存；final-report dependency gap 的 historical red 也已保存。当前仍未修复的两条
  detector 是 decrypt-before-containment 与 source Electron E2E。
- **已复跑 guard/evidence**：修复后 red/green evidence script SHA-256 为
  `86e7ada3c5667451d303016374ec1235ee024ce22c7e488895f63e1b7fea0d0a`，共 7/7（2 条
  未修复 red + W0-03 snapshot/smoke、W0-04 protocol、W0-06 report topology、W0-08 stop policy
  五条 green guard）；release-QA unit 55/55。此前的 Electron protocol admission 33/33、startup readiness 8/8、Windows forced-Shadow 与 pre-spawn
  containment reject 的既有证据为 2/2。它们不构成 Active qualification。
- **当前外部 gate**：GitHub main ruleset `11921569` 仍没有 required-status-check
  rule，且存在 RepositoryRole always-bypass；在 W0-06 的 workflow 实跑、W0-08 修复并实际验证前，任何
  CI green 都不可以作为 Windows Active 放行依据。

##### W0-03 release snapshot fail-closed（`IN_PROGRESS`，未放行）

- `scripts/build-web.cjs` 在 `PUPU_VERSION_PREPARED=1` 或
  `PUPU_REQUIRE_BUILD_FEATURE_SNAPSHOT=1` 时，必须从
  `PUPU_BUILD_FEATURE_SNAPSHOT_PATH`（或默认 `.local` path）读取一个 object snapshot；
  缺失、JSON 损坏或非 object 都在 React build 前退出非零，不能回落默认 flags。
- `scripts/write-build-feature-snapshot.cjs` 仍可显式接受 `--feature-flags`，但 release
  workflow 只接受 versioned `contracts/memory-v2/release-profile.shadow.v1.json`。该 profile
  有 exact schema、五个 sidecar env fields，且 producer 拒绝将 profile 与 flags 混用；profile
  生成时忽略调用进程的 `all`/canary/readonly 覆写，输出必须仍是 canonical Shadow snapshot。
- deterministic job 只生成一次 snapshot，并上传 bytes 与 SHA-256；每个 package job 下载后先
  核验 checksum，才将同一路径设置为 `PUPU_BUILD_FEATURE_SNAPSHOT_PATH`。因此 release build 和
  smoke 都不得读取开发机 `.local`，也不能各自 materialize 默认 off 或不同 rollout。
- `package-sidecar-smoke.mjs` 现在将 `--snapshot` 作为必填输入：spawn 前验证 enabled release
  snapshot 与其双 fingerprint，以 snapshot 的五个 env fields 启动 sidecar，并要求 `/health` 和
  `/context/v2/status` 的 rollout fields/fingerprint 同快照一致。缺快照、无效/disabled snapshot、
  环境漂移都会失败；不再硬编码 `all/unchain`。这是 build-output sidecar 的 smoke，仍不是安装包
  Black-box proof。
- 当前 producer SHA-256 为 `a9ffa42e55833b499f9517e6fc902a6585919630dc3cd5fbc7a0a419c6a675eb`，
  profile SHA-256 为 `407063e054f91ff0e4bea74f3a465336a76a3f078a63ee8724a780bc067dffca`，
  smoke SHA-256 为 `ff202ef025e9b45351e4def02a6af2334bf217e58fa60bbb251fd56de0a93fa3`；
  snapshot tests SHA-256 为 `a3f155ff55f37adacb981fd28870a1599e86a471b09d8556154a93ab1fbec417`，
  workflow topology tests SHA-256 为 `9cf01bb1847137f6bfae05e3dcc7dfd78c322e76c66dac145e7cb535513e6f3f`。
  CI 尚未执行，安装 package/install attestation 和 installed Windows E2E 仍属 W0-03/05/06
  后续工作。

##### W0-04 required protocol / sink contract（`IN_PROGRESS`，未放行）

- `context_memory` 的 required feature 集是跨 Electron、sidecar 与 release artifact
  的单一契约：`artifact_handoff`、`canonical_journal`、
  `chat_deletion_sqlite_scope_closure`、`context_compiler`、
  `generation_rebase_live_interaction_cycles`、`interaction_resolution_compat`、
  `long_term_promotion`、`memory_curator`、`memory_toolkit`、`memory_workspace` 与
  `tool_output_management_v1`。Python sidecar、artifact verifier 和 Electron 已均要求
  最后一项；对缺失该 feature 的 Electron admission test 已为 green。该缺口的 red baseline
  已保存，但这只是 `WAC-004` 的第一格通过，不能解除 Active NO-GO。
- worker protocol 的可识别 sink kinds 为 `computer_input`、`shell_secret_env`、
  `shell_secret_stdin`、`mcp_schema_secret`；Windows candidate 的 **enabled sink set
  目前为空集**。因此 Shadow 不可执行 Vault payload，Active 更不可因“worker 支持该 kind”
  而推断为可用。只有 W1 的 contained-ready admission、W2 的已验证 containment 与按 kind
  的 capability evidence 全部 PASS 后，才可逐项打开。
- `WBC-004`：独立 Node 与 Python parser 必须消费同一个 versioned golden fixture，拒绝
  feature 缺失、未知 feature、重复 feature、未知 sink kind、enabled kind 无 capability
  attestation，以及 Electron/sidecar/artifact 三方 feature-set 任何不相等的候选。
  `WSEQ-004`：fixture 生成 → 三方 parse/normalize → candidate report → package/install
  attestation → Windows executed evidence；任一步失败均不得产生 Active admission。
  `WAC-004`：三方 green parity、四类 sink 的 disabled/unsupported negative matrix、以及
  installed Windows candidate 的零 payload execution shadow proof。当前 fixture
  `contracts/memory-v2/windows-required-protocol-and-sink-contract.v1.json`
  （SHA-256 `99297a280d4023ea43a931d7b73087c20a67076af547aca57874f0075e8e0441`）已被独立
  Node parser 与 Python parser 消费：Node 1/1；Python 1/1，后者使用本地 Unchain checkout
  `abd7e08f26452e1dbe2767fac3dbfaff7dfb9f3b`，仅为单元契约验证，不能替代 exact deployed
  revision pair。fixture 已冻结 `missing_required_feature`、`unknown_sink_kind` 与
  `disabled_windows_sink` 三个 negative case。Node matrix 已实际证明：缺
  `tool_output_management_v1` 的 manifest 被 Electron admission 拒绝；unknown sink 在
  frame/spawn 前拒绝；Windows 下四类已识别 sink 均因 containment unavailable 拒绝且
  `spawn=0`。candidate report、package/install attestation 与 installed Windows Shadow
  proof 尚未完成，故 W0-04 仍为 `IN_PROGRESS`。

##### W0-05 candidate identity chain（`IN_PROGRESS`，未放行）

- `scripts/release-qa/windows-candidate-identity.mjs` 现在验证闭合的五层链：
  `payload-lineage → release-snapshot → build-identity → package-attestation →
  install-attestation → evidence-envelope`。每层仅引用已存在的父 fingerprint，并以其
  schema domain-separated canonical JSON 计算自身 fingerprint；任何层都不能引用自身，
  build identity 也不得预填 installer/install digest。
- `contracts/memory-v2/windows-candidate-identity-fixture.v1.json`（SHA-256
  `5dd9a3bd01e6876d5778dd8f0d4989554e9ffb44bc9cdd54f2610f258743c4eb`）固定一个
  payload lineage 和两个 immutable snapshots。Node golden tests 4/4 证明 snapshot
  descendant 复用 lineage、但生成不同 build/package identity；并拒绝 parent mismatch、
  self-reference、future install digest，以及 app/asar 的签名前后漂移。Authenticode
  仅允许 `installer_authenticode_envelope` 这一 installer hash 差异，app/asar 必须精确
  相等。`pupu.windows-candidate-identity-report.v1` 只在完整 chain 和
  `executed_tests > 0` 时生成，且仅输出各层 fingerprint；不能夹带未验证的 future artifact
  字段。release-QA unit 为 44/44。
- 当前是合成 contract/validator/report evidence，尚未接入真正的 build、installer、clean
  install、现有 release merge 或 external evidence publisher；因此不能产出 release
  candidate、不能作为 installed attestation，更不能解除 Windows Shadow cap。W0-05 仍为
  `IN_PROGRESS`。

##### W0-06 mode-aware report topology（`IN_PROGRESS`，本地 gate 已实现，未实跑 CI）

- `contracts/memory-v2/release-qa-report-topology.v1.json` 冻结 `lite`、`release` 和
  `windows-active-qualification` 三种 mode 的 expected report platform set。merge 时由
  workflow 的 event/input 显式传入 `--mode` 和 manifest；required set 不再由已经下载到的
  reports 倒推。每个 expected platform 必须恰有一份 report，缺失、重复或 report 内的 failed/
  skipped/zero-evidence check 都使 merged result 失败。
- Playwright job 现在解析 `test-results/playwright/results.json`，只把真正执行的 passed/
  failed/timedOut/interrupted test 计数写入 report。skipped-only、没有 JSON 或 `0` tests
  不能满足 required `Playwright Electron release smoke`。final job 同时检查 deterministic、
  Playwright 和非-lite mode 的 package matrix job result，并以同一 topology merge/report。
- `windows-active-qualification` 已可作为 workflow_dispatch mode 选择；它预先要求
  `windows-installed-qualification` report。该 job 尚未实现，所以当前选择它会故意 fail
  closed，不能伪造 Active qualification；lite 不要求 package 或 installed report。
- topology resolver SHA-256 为 `82e478d15c512d45069fc1652edf60ec31614957cd90a74d6c9485c1152aaf43`，
  fixture SHA-256 为 `02a64fe3b26898d95f01e0d21dc14cd6e60c434324008bba8b415eb598526100`，
  topology tests SHA-256 为 `d910214300e4d775afd026b99d46e9bae7495ca5ae06cac8d10599f39b307bb8`；
  Playwright execution verifier SHA-256 为 `cd7fc9e56fadc6dc09ab35a25a3be0db8384cf194a8166416bf328675b673452`，
  tests SHA-256 为 `9c7eafa16d053869302b0438c365daa88d311c8d04aab772bf14244c1a327642`。
  本地 negative matrix 已覆盖 unknown mode、tampered closed definition、missing/duplicate/
  zero-evidence reports；实际 GitHub workflow 尚未运行，repository ruleset 也尚未成为
  required gate，故 W0-06 与 Windows Active 仍是 `IN_PROGRESS`。

##### W0-08 staged rollback / stop authority（`IN_PROGRESS`，policy 已冻结，authority 未接通）

- `contracts/memory-v2/windows-rollout-stop-policy.v1.json` 是 closed policy。当前 internal
  和 public channel 的 `authority` 都明确为 `unavailable` 且 `promotion_allowed=false`；
  internal 将来只能接受 `managed_device_force_install`，public 将来只能接受
  `signed_remote_stop_or_forced_update`。optional updater、普通 runtime flag 或“尚未收到
  stop 的客户端已全局停止”均不是 authority，因此当前不能承诺 SLA、不能 promotion。
- policy 固定 hard-zero 的三项动作：停止新的 admission、停止新的 Vault use、安装一个新的
  Shadow descendant；不会改写 sticky owner、删除 marker/DB、复活 legacy admission 或重放
  indeterminate effect。`windows-rollout-stop-policy.mjs` 同时要求 rollback 复用 payload
  lineage、使用新 release snapshot 和新 build identity，且 rollout mode 必须是 Shadow。
- resolver SHA-256 为 `5eb6b977757bc211c8646879d44c53cafdccddc22c4de1701b2a334da1a8a977`，policy
  SHA-256 为 `e3380c1f32bcbd250fe379d004f1b358ae05fecb882390f45c9fce2b8ed35a4e`，tests SHA-256
  为 `176a5ad0cccbf8a382b5a8bd5a0e36b0ac93544c83953c4cd3f12779ac8d7ced`。negative matrix
  覆盖 optional-updater authority、错误 authority、同 snapshot、同 build identity 和
  非-Shadow rollback；未连接的实际 distribution/update/remote-stop 与 SLA 演练仍是
  W5-00A/00B 工作，故不能当作 rollback qualification 或 Active evidence。

## 7. M3 — 全量开放前的产品与数据闭包

- normal/resume/interaction/graph/subagent feature parity；
- Memory V2 workspace、curator、promotion、long-term recall 的端到端用户流；
- 数据完整性、secret/Vault 泄漏、外部 vector fail-closed；
- 性能、DB 增长、WAL、并发和 crash recovery；
- telemetry 能区分 admission、owner、quarantine、retry 和 exact runtime manifest，但不记录 chat 内容、路径或 secret；
- package 内实际 import 的 runtime manifest 决定 capability，Git SHA 只作 provenance。

M3 出口：所有 applicable 单元格为 PASS；任何 `NOT_RUN/PENDING` 仍阻断 active-all。

## 8. M4 — 分阶段 rollout

顺序固定：

1. `off` 基线和删除闭包 smoke；
2. shadow，无用户可见 side effect；
3. internal/canary，小比例新 admission；
4. 扩大 canary，观察错误率、quarantine、恢复和 DB 健康；
5. `all` 只对新 admission 生效，既有 owner 继续 sticky；
6. 至少跨一次应用重启和一次 sidecar 冷重启观察窗口。

任一 schema/owner mismatch、复活、删除不收敛或 exact artifact identity 漂移，立即停止新增 admission；不得通过删除 marker/DB 或切回旧 owner 来“恢复”。

## 9. M5 — 旧链路退役

只有在 active-all 稳定且 durable inventory 证明没有仍需 legacy owner 服务的 chat 后开始：

1. 冻结 legacy 新写入；
2. 清点 legacy owner marker、schema、active chats、pending deletion 和回滚样本；
3. 对需要迁移的数据采用独立、可重放、可校验迁移工具，不做运行时双写；
4. 迁移后逐 chat 核对 identity、counts、digest 和删除 tombstone；
5. 先移除 legacy admission，再移除 read path，最后移除 schema/runtime/code；
6. 保留只读诊断和受控恢复窗口；
7. 删除代码前重新跑 GitNexus upstream impact 和完整 package matrix。

M5 出口：生产 durable inventory 中 legacy owner 为零、pending deletion 为零、回滚策略不依赖旧 runtime，才可宣布旧链路退役。

## 10. 执行清单

| 顺序 | 工作项 | 当前状态 |
|---|---|---|
| 1 | P6 集成 BC/SEQ/AC 并在 direct Plan 固定 chat identity 与 Context/Vault 顺序 | `BLOCKED / NEXT` |
| 2 | 保存两个 P0 的 red-before-green 证据 | `PENDING` |
| 3 | 实现删除专用 durable-owner preflight | `PENDING` |
| 4 | 修 `off` privacy-delete dispatch | `PENDING` |
| 5 | 实现 canonical Unchain full-schema bootstrap | `PENDING` |
| 6 | 修 scope reader 与精确 poisoned-store recovery | `PENDING` |
| 7 | 实现 typed retry/quarantine 与双 checkpoint（以 P6 direct-plan evidence 为准） | `PENDING` |
| 8 | focused/integration/exact-wheel 验收并完成 P6 closure | `PENDING` |
| 9 | M2 sticky owner 全路径 | `PENDING` |
| 10 | MW-0 Windows containment direct Plan、support/candidate 契约与 red evidence（详见 6B.10） | `NEXT / PLAN READY` |
| 11 | MW-1 两阶段 executor：contained-ready 后才 claim/decrypt | `PENDING` |
| 12 | MW-2 PyInstaller Job Object supervisor | `PENDING` |
| 13 | MW-3 capability-aware gate 与 degraded privacy transport | `PENDING` |
| 14 | MW-4 exact Windows installed-artifact matrix | `PENDING` |
| 15 | MW-5 Windows internal canary → all | `BLOCKED` |
| 16 | M3 产品、数据和发布闭包 | `PENDING` |
| 17 | M4 staged rollout | `PENDING` |
| 18 | M5 legacy retirement | `PENDING` |

## 11. 影响风险记录

当前 GitNexus 结果：

- `_delete_chat_for_store_owner`：LOW；
- `_context_v2_chat_state_exists_read_only`：LOW，但语义不足，不作为删除 authority；
- `delete_pupu_unchain_chat`：CRITICAL；
- `_resolve_scope`：CRITICAL；
- `inspect_context_v2_database`：CRITICAL，计划保持不变；
- ownership lifecycle list：索引无法可靠解析，人工确认被多个 read/workspace/promotion/recall/review/curator/deletion 路径共享；
- `electron/main/services/unchain/service.js`：MEDIUM；应优先采用窄改动。

实施前必须对最终拟改 symbol 重新运行 upstream impact。任何 HIGH/CRITICAL 结果先向 owner 报告，再开始编辑。实现完成后运行 `detect_changes(scope=compare, base_ref=main)`；本项目不由 Codex commit。

## 12. 关键证据入口

- P6 direct-plan / implementation evidence：#195 的 Current state、P0 containment 执行记录与 `docs/architecture/context-v2-boundary-contracts.md`
- 跨边界门禁：`.claude/rules/cross-boundary-contract-gate.md`
- 删除 outbox：`electron/main/services/chat_storage/deletion_outbox.js`
- 删除 route：`unchain_runtime/server/route_memory_v2.py`
- Unchain deletion adapter：`unchain_runtime/server/memory_v2_unchain_deletion_adapter.py`
- ownership adapter：`unchain_runtime/server/memory_v2_unchain_ownership_adapter.py`
- store boundary：`unchain_runtime/server/memory_v2_store_boundary.py`
- Windows rollout cap：`electron/main/services/unchain/memory_v2_rollout.js`
- Vault execution state machine：`electron/main/services/memory_vault/service.js`
- Vault worker executor/tracker：`electron/main/services/memory_vault/vault_sink_executor.js`
- Vault worker：`unchain_runtime/server/vault_sink_worker.py`
- packaged sidecar entrypoint：`unchain_runtime/server/main.py`
- Windows release lane：`.github/workflows/release-qa.yml`
- Win32 `PROC_THREAD_ATTRIBUTE_HANDLE_LIST/JOB_LIST` primary reference：
  [Microsoft UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)
- PyInstaller onefile child/runtime primary reference：
  [PyInstaller common issues](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html)、
  [6.22.1 security validation](https://pyinstaller.org/en/v6.22.1/advanced-topics.html)
- GitHub current main ruleset red evidence：
  [main protection rule 11921569](https://github.com/haoxiang-xu/PuPu/rules/11921569)
