# Windows Memory V2 Active 实施与验收计划

日期：2026-09-05。供另一执行模型逐步实施，原审查模型在两个 checkpoint 验收。

**当前恢复修复入口（2026-09-05）：** 用户要求停止按单个失败反复修补。恢复机制的后续实现以 [整体修复方案](windows-memory-v2-recovery-repair-plan.md) 为准，替换下方历次临时 lineage 修补策略；其他 Windows/Vault 边界及原 Checkpoint 1、2 保留。先完成统一身份/状态模型和测试矩阵，再集中实施与验收。本次仅交付方案。

## 目标与执行权限

目标是在已验证的 Windows x64 环境中，让 Memory V2 从当前强制 Shadow 进入可用的 Active；启用必须依据真实运行能力，失败时仍有明确原因、可恢复的聊天与删除路径。

本轮只有 **Checkpoint 1、Checkpoint 2 两个人工验收点**。执行模型在每个检查点一次性提交材料并暂停，由用户将材料交给原审查模型。其余步骤自主完成；例行修复、测试失败后的迭代、补充技术记录不另设确认点。遇到确实缺失的外部资源，明确记录阻塞事实，不能伪造证据。

- 先实施与验证，Checkpoint 2 通过前不得把用户当前数据目录或日常 PuPu 实例切到 Active。隔离的临时数据目录、测试安装与合成数据可用于 Active 验证。
- 本轮交付可本地启用的确切候选及操作步骤，不包含公开发布、修改 GitHub ruleset、全量用户 rollout、自动发送真实模型请求或向别人发消息。
- `computer_input` 和 Windows ARM64 不在本轮支持范围。针对现有三类候选执行类型 `shell_secret_env`、`shell_secret_stdin`、`mcp_schema_secret` 逐一验证，只有通过者才能进入声明的能力集合；不能只因 worker 识别类型就全部打开。
- 不把 Memory 与 Vault 解耦作为本次捷径，不改变既有记忆、隐私删除或身份语义。如果完整 Active 所需执行类型未通过，报告未完成，不悄悄缩成另一种产品模式。
- 遵守两个仓库 AGENTS.md；修改符号前做各自 GitNexus impact，HIGH/CRITICAL 先说明；UNKNOWN 用源码补证，不当作安全结论。索引过期先刷新。完成后做 detect-changes 和 diff 检查。**不 git commit**，不覆盖他人的改动。
- Electron 现有 `.js/.cjs` 测试双份保持同步；已有仅 `.cjs` 的测试无需为本任务补一套。Python 测试使用后端自己的 Python/pytest，不用 Jest。
- 本计划是当前用户请求的直接实施计划。历史路线图提供技术依据，不新增旧角色、确认、裁决或人工 gate。公开发布的治理与分发工作不冒充本地启用的必要权限步骤。

## 已确认的起点（执行前重新核实）

1. 实际 sidecar 的 `/context/v2/status` 曾返回 `available=true`、协议兼容、`configured_mode=all`，但实际 `rollout_mode=shadow`。
2. `electron/main/services/unchain/memory_v2_rollout.js::constrainMemoryV2ConfigForPlatform` 对 Windows 的 canary/all 无条件降级。
3. `service.js::configureWindowsVaultCapability` 已有入口与一次性状态锁，但正式启动未调用；`startMiso` 会将未配置状态终结为 unavailable。
4. `windows_vault_supervisor_probe.js` 已有无明文探测实现；不能据此宣称真实 startup 或安装包已经接通。
5. `vault_sink_executor.js` 的 Windows 已允许执行类型集合及 `contracts/memory-v2/windows-required-protocol-and-sink-contract.v1.json` 的 enabled 集合仍为空。
6. native probe 与 packaged probe 已存在。当前 packaged probe 只证明 READY、畸形请求拒绝和正常退出三个检查，不等于完整 crash/quit/secret-lifetime 验证。
7. 已运行 capability/startup 两组测试 15/15；这些测试包含“Windows 必须被限制”的旧预期，不能作 Active 放行证据。
8. unchain 三个 SQLite store 的 Windows 目录 fsync 修复已在此前完成。确认最终 wheel 确实含有修复及其回归测试，避免打包旧依赖。
9. `vault_sink_worker.py::_execute_shell` 在 Windows 仍无条件报 `vault_shell_containment_unavailable`；`main(containment_attested=True)` 仅通过入口检查，尚未把验证结果传到 frame/shell/MCP 执行层。这是实际执行缺口，不是单改 JS allowlist 能解决。
10. 专用 `service.js::deleteContextV2Chat` 已使用独立认证 DELETE，Python 已允许 degraded 下隐私删除；优先保留和验证，不重复拆通道。`markLost` 虽已有实现，生产失效事件尚未接入。

重点文件：

- 启动与能力：`electron/main/index.js`、`electron/main/services/unchain/{service,memory_v2_rollout,windows_vault_capability,windows_vault_supervisor_probe}.js`。
- Vault 与删除：`electron/main/services/memory_vault/{service,vault_sink_executor}.js`、`electron/main/services/chat_storage/deletion_outbox.js`。
- Python：`unchain_runtime/server/{main,vault_sink_job_supervisor,vault_sink_worker,route_memory_v2}.py` 及实际 import 的 unchain runtime。
- 构建验证：`unchain_runtime/scripts/build_unchain_server.ps1`、`scripts/release-qa/*unchain-artifact*`、`windows-*-vault-supervisor-*.py`、既有 candidate identity 工具。
- 技术依据：`docs/architecture/memory-v2-rollout-and-legacy-retirement-roadmap.md` 的 W1/W2/W3、`.claude/rules/cross-boundary-contract-gate.md`。先核对代码，避免重复实施路线图中已完成的部分。

## 边界契约与验收编号

所有 CLOSED 边界都精确校验 key set、类型、版本和身份。未知字段/错版本/错身份要在进入下一边界前拒绝，不能双方共用一个宽松 helper 自证正确。runtime compatibility 由实际 import 的 manifest 独立验证；Git SHA 和源码路径仅作构建追踪。

| 编号 | producer → consumer / 传输与规范表示 | 准入、身份、失败语义 | 验收 |
|---|---|---|---|
| BC-001 | 一次构建的 wheel、sidecar、受控构建快照 → Electron provenance 校验；沿用现有 versioned artifact/candidate JSON 和 canonical SHA-256 | CLOSED/VERSIONED；绑定 wheel、实际 installed sidecar、runtime manifest、arch、worker/supervisor protocol、snapshot。安装身份与 build 身份分层，禁止自引用。exe hash 从运行目标重算，旁置自报文件不能单独证明可信；不匹配无执行能力 | AC-001 正确 exact pair；AC-002 缺失/篡改/错架构/错协议/旧 wheel 拒绝 |
| BC-002 | Electron probe/provider → Windows supervisor → 同 exe worker → Job 内普通子孙进程；现有长度前缀 JSON、READY/control、prepare/CAS/decrypt 租期 | CLOSED/VERSIONED；分别核对进程句柄/Job、request/lease/intent 身份及时间顺序；READY 前不传明文，不以 spawn 成功等同已隔离；probe 失败有界关闭，零 payload；不宣称 OS-wide sandbox | AC-003 正确 READY、仅已声明类型执行；AC-004 timeout/bad-frame/parent-loss/错身份/无 containment 拒绝 |
| BC-003 | startup 的已验证 receipt + 确切 broker registry → main capability latch → rollout config → sidecar/status → renderer | CLOSED/VERSIONED；精确绑定 broker protocol 与 sink key set、artifact identity 和 rollout fingerprint。首次启动前一次性计算；ready 才保留请求的 canary/all，其余 shadow/degraded；UI 不能伪造 receipt。有效 receipt 不能反过来把用户配置 off/shadow 升级为 Active | AC-005 全顺序接线及正确启用；AC-006 假 Boolean、未配置、延迟配置、协议/指纹不符拒绝 |
| BC-004 | provider 的结构性能力失效 → main admission/streams/lease registry/broker → sidecar 生命周期 | CLOSED 内部事件，仅静态原因码；ready→lost 单向，同一 app 不再恢复；先同步拒绝新工作并中止活动流，再异步 drain。普通单次工具失败不触发全局 lost；不关 Vault 数据库冒充降级 | AC-007 loss 后无新 lease/stream，sidecar 重启不升权，完整 app 重启重新验证 |
| BC-005 | 删除 outbox → 固定认证 DELETE → sidecar durable owner + Vault 清理 → 两腿 checkpoint | CLOSED/VERSIONED，沿用严格 request/receipt/error union 和 chat/owner identity；只让专用删除绕过普通 readiness，不开放任意 endpoint。固定 timeout、retryable 分类、有界预算、独立落盘、隔离终态；重启不重置预算 | AC-008 各模式可删且不会跨 chat；AC-009 timeout/terminal/重启/已完成腿不重放 |
| BC-006 | PuPu normal/graph/subagent chat → wheel 中的 Context/Memory/RunBundle 与 SQLite/CAS → 恢复、召回和界面 | CLOSED 现有 run/attempt/chat/generation 身份与 schema；不改存储格式、不靠已有对象跳过首写来证明成功；保留内容 fsync 和完整性检查 | AC-010 消息/interaction/工具/重试/恢复矩阵；AC-011 跨身份/损坏数据拒绝、无重复外部效果 |

补充验收：AC-012 为真实 Windows package/install 生命周期、三类执行类型各自验证及 100 次混合故障循环；AC-013 为 UI 准确解释 disabled/pending/ready/lost 且不泄露敏感值；AC-014 为 Linux/macOS 原行为与普通 Memory-off 聊天回归。

### 持久与生命周期序列

| 编号 | 初态、事件顺序、可观察结果 | 必测 repeat/retry/restart/rollback 与关联 |
|---|---|---|
| SEQ-001 | app 未启动、latch pending → hash/manifest → no-secret probe → registry → broker → sealed receipt ready → sidecar → fingerprint 一致 | 重复/过晚 configure 被拒；Vault 能力失败且 sidecar 自身可信时降 Shadow，sidecar artifact/协议失败则保持 unavailable；同进程 sidecar 重启不重新提升。BC-001/002/003，AC-001..006 |
| SEQ-002 | 隔离空目录与固定 chat → 第一条正常消息 → 同 chat 第二条 → 全新 chat → app 冷重启 → 继续与召回 | 分别覆盖 Memory off/shadow/active，不只检查 HTTP 200；检查持久记录、身份与真实 Active 路径。BC-006，AC-010/011 |
| SEQ-003 | 同 execution → 第一次 interaction → 恢复 → 第二次 interaction → retry/durable resume → sidecar 冷重启恢复 | normal、graph、subagent；receipt/lease 仅消费一次，provider resend 按既有语义不重复，工具已完成效果不重复。BC-002/006，AC-010/011 |
| SEQ-004 | ready 且有流/租期：结构性失效 → 停止新工作并置 lost → drain → sidecar restart 仍 lost → app restart 重验；正常 suspend → abort 当前 lease → 恢复后继续 ready | 两条分开验证；正常 quit 清理退出，不必记成永久故障；普通工具错误不误降级，重复 suspend/stop 幂等，父进程/worker 残留为零。BC-002/004，AC-007/012 |
| SEQ-005 | 两个 chat 有数据 → 删除其中一个 → Context/Vault 一腿完成、一腿失败 → timeout/retry/quarantine → 冷重启 | 成功腿不重做、预算不清零、另一 chat 无变化；rollback/off/degraded 均可删。BC-005，AC-008/009 |
| SEQ-006 | 已验证 candidate → 替换 exe/wheel/manifest/arch 或损坏快照 → 冷启动 → 拒绝；恢复原确切候选 → 完整重启重新验证 | 旧 evidence 不给新 artifact 放行；回退 Shadow 后已有 V2 owner 不被偷偷改成 legacy。BC-001/003/005/006，AC-002/006/008/011/012 |

## 第一阶段：实现完整接线，保持日常实例 Shadow

### 步骤 1：核实基线、影响范围与失败测试

1. 记录两个 checkout 的 HEAD/dirty diff、实际 Python/runtime import、Windows 版本与架构。保留他人的修改；不读取或输出真实凭据。
2. 对本计划涉及的生产符号做新鲜 GitNexus query/context/impact；分别补证跨 JS/Python/unchain 的真实连接，记录风险。只读 plan 不需要为文档符号伪造 impact。
3. 建立每项 BC/SEQ/AC 对应的测试名和证据文件清单。先复跑既有测试，标记真实已有实现；不把旧文档的 NOT_RUN 当作当前事实。
4. 保存能暴露实际缺口的 red：真实 startup 没有配置 capability；有效 receipt 仍被硬降级；loss 未联动；状态文案掩盖原因。缺口已有正确实现时记录已有证据，不改坏代码造 red。
5. 用固定 wheel +临时数据目录跑存储/协议与 Memory-off 基线；如果 Python runtime 或 Windows 首次写入不通过，先修这些阻碍。

### 步骤 2：补齐 provenance、无明文探测和执行能力声明

1. 复用 `probeWindowsVaultSupervisor` 和既有 Job/worker，而非新造启动器；补齐实际 entrypoint 的 hash/provenance producer 和独立严格 consumer。
2. 对 Windows 三类候选执行类型逐一建立测试，使用合成 secret、本地 fake MCP/命令；校验 before-READY 无明文、prepare→CAS→decrypt→一次使用→drain 顺序。未验证的类型继续 disabled，未知类型直接拒绝。
   - 将可信 supervisor bootstrap 的 containment attestation 沿 Python 内部调用显式传递到 `process_one_frame` 与 shell/MCP 执行层，验证以后再解除对应 Windows 拒绝分支。默认 direct invocation 仍拒绝；JSON、环境变量、renderer Boolean 不能提供该 authority。不增加与同进程可信代码对抗的伪安全封装。
   - 覆盖 shell env、shell stdin 和本地 fake MCP 各一次真实成功；验证无 attestation、伪造 wire 字段、不支持类型在解密或执行前拒绝。Windows 的 shell/管道/进程创建和终止语义必须按实际代码核验，不复用 POSIX 假设。
3. receipt 必须来自已验证真实 probe、exact supported registry 和 broker 协议，不能在启动代码里硬编码 true、测试对象或自报 hash。更新支持声明必须有对应证据，并保持 Node/Python contract 一致。
   - 当前合法 receipt 可以包含空 sink 集合；Active 准入必须拒绝这种“结构正确但无执行能力”的结果。冻结本轮必须支持的非空集合，并逐一证明 capability、实际 providers、broker registry 和支持声明精确一致。
4. 运行已有 Windows native probe 并用独立 verifier 检查结果；失败修实现或记录具体外部限制。原生成功尚不等于 packaged/installed 成功。

### 步骤 3：先完成失效与删除，再连接启用

1. 审计现有 privacy DELETE 和 outbox；已实现部分保留。补齐 BC-005 缺口，证明 off/shadow/degraded/lost 时仍可删除，且普通数据请求不因此绕过 readiness。
2. 接通结构性 loss 到 service、registry、broker 与活动 streams；同步关 admission，随后有界 drain。明确普通工具错误与结构性失效的分类，保留 Vault DB 的删除能力。
   - 正常 suspend 只中止当前租期，不应无条件永久 lost；恢复后允许通过现有 ready 能力创建新执行。验证重复 suspend/stop 幂等。只有确实失去 containment/provenance/broker 保证才单向失效。
3. 覆盖各失败点、取消、超时、两腿 checkpoint、预算与冷重启。禁止用“一律 catch 后继续”修成假成功。

### 步骤 4：接入真实 startup 与能力驱动的 rollout

1. 在 `index.js` 落实 SEQ-001：Vault init → 解析并验证目标 artifact → no-secret probe → 构造能力匹配 registry → configure → broker ready → sealed capability → start sidecar。任一步失败清理已建资源；仅 Vault capability/probe/broker 失败且 sidecar 自身验证通过时降为 Shadow 并保留删除路径。sidecar artifact/实际 import 协议本身不可信时保持明确 unavailable，删除请求留在 durable outbox，环境修复后继续，不启动已知损坏的运行时。
2. 将 service 构造时冻结的 runtime config 改为仅启动前可完成的一次性受控配置；仅已验证 ready 可解除 Windows hard cap，保留原始 off/shadow/canary/all 意图及 fingerprint 一致性。
3. 未配置、伪造、重复、过晚配置、lost 状态不能提升。移除旧 unconditional cap 时，同时替换旧测试为正反两侧验收，不删失败用例降低标准。
4. 用真实 startup assembly 测试整个顺序，不能只独立测试 helper。给 renderer 显示可操作的静态原因，区分平台能力未配置、探测失败、协议不符和存储错误；不显示密钥、broker token 或 raw Win32 error。
5. 第一阶段可在隔离测试装配中走 Active；不改公共 Shadow release profile，不启动用户日常实例的 Active。

### Checkpoint 1：实现与边界验收

提交：diff/文件清单、实际实现顺序、BC/SEQ/AC 映射、red/green 结果、native probe evidence、独立校验结果、未完成项、GitNexus impact/detect-changes。

通过条件：AC-001..009/013 的相关实现、严格负向测试和真实 startup assembly 通过；AC-010/011 有 source 集成覆盖；没有 capability-loss 或 deletion 遗留漏洞；平台正常/失败两侧均有证据。此处只评实现可进入最终候选验证，**不授权日常 Active**。

到此暂停，由用户交给原审查模型验收。未通过则按反馈修复并回到同一 checkpoint，不新建第三个验收点。

## 第二阶段：验证确切 Windows 候选并准备启用

### 步骤 5：构建一次 wheel，固定候选身份

1. 基于 Checkpoint 1 通过后的源码，用既有 `build-unchain-artifact.mjs` 生成一份 wheel 和 evidence；本轮所有 contract/package/installed 测试复用该同一文件。
2. 显式设置 `UNCHAIN_ARTIFACT_PATH` 与 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`，防止 wrapper 在不同命令中自动重建 sibling source。实际 import 的 manifest 仍须独立严格校验。
3. 固定测试候选的受控 snapshot（仅隔离验收请求 Active）、wheel SHA、manifest digest、sidecar SHA、build/package/install 身份；复用既有工具，不新造另一套宽松身份 JSON。公共 release profile 保持原值。
4. 构建真实 onefile sidecar 与 Windows 安装候选，保留已固定的 PyInstaller 版本；测试使用安装后的路径及对应私有测试 userData。源码 Electron 和 unpacked smoke 只能作辅助证据。
5. 若修复改变 wheel/sidecar/app payload，则生成新候选身份并重跑受影响及身份连续性检查；旧候选结果不得混入新候选通过报告。不为同一个候选悄悄重建 wheel。

### 步骤 6：原生、安装包与产品行为矩阵

1. 跑现有 native/package probe 与其 verifier，再补齐下述既有 probe 没覆盖的项目；先实际测当前 Windows x64，支持声明只覆盖实际测过的 OS，不把 Windows 11 结果外推为 Windows 10 已验收。
2. AC-012：三类声明启用的执行类型分别覆盖 success/nonzero/timeout/bad-frame/oversize；kill supervisor、worker/bootloader、parent；正常退出、挂起、冷启动、outer Job。退出后进程树/句柄/明文租期不残留。
   - 使用真实 NTFS 临时目录，覆盖路径空格和中文。必须包含 installed Electron 主进程作为实际 parent 的启动与强杀，不能仅用 Python probe parent 的结果代替。
3. 用合成 secret 检查 argv/cwd/log/temp/control/stdout/stderr 和非目标进程；目标 shell env/stdin/MCP 槽位按其契约为唯一允许位置。报告只存计数/digest，不存 secret 原文。至少 100 次包含成功与故障的混合循环。
4. AC-010/011：执行 SEQ-002/003 的首条、第二条、两次 interaction、retry/resume、冷恢复及 normal/graph/subagent。用本地确定性 provider fake 运行安装后的实际链路，不自动消耗用户 API 额度。检查实际 Active 与持久记录/召回，不以 UI 标签或状态接口 ready 代替行为。
5. AC-007..009：安装候选上的 loss 与删除序列；在存储和 sidecar 可用时，degraded/off/rollback 可安全读取既有记录，删除可按 outbox 重试完成。structural lost 不得借 sticky V2 retry/resume 重新进入需要 Vault 能力的执行路径；执行恢复须等完整 app 重启并重新验证能力。不能重放已完成外部效果。
6. AC-014：运行受影响的非 Windows 逻辑回归和普通 Memory-off 流程。对必须原生跑的 macOS/Linux 检查明确平台、证据与支持结论；模拟测试不冒充原生验证。
7. 每项记录 PASS/FAIL/NOT_RUN/N/A；N/A 必须说明状态为什么不可达。缺 report、零执行数、全 skipped 或身份不一致不能通过。

### 步骤 7：整理启用与回退操作

1. 提供当前确切候选路径、身份摘要和启用命令/配置入口，说明开发态与安装态分别支持到什么程度；不能通过平台伪装、环境 Boolean 或临时修改 guard 开启。
2. 提供完整 app 退出/重启、验证 Active 的方法及回退到同 lineage 的 Shadow 候选/受控配置的方法；解释为什么 sidecar 重启不会清除 lost 状态。
3. 不删除或重置用户数据，不把备份当作迁移方案。若涉及迁移，新增相应 BC/SEQ/AC 并完成验证；不能把未知的兼容性问题留给用户第一次启动。
4. 出具一份最终 evidence 索引：代码变化、测试实际命令/退出码/执行数量、失败修复记录、artifact digests、支持范围、未测限制、两个仓库 dirty 状态。只引用本候选证据。

### Checkpoint 2：安装候选与启用验收

提交步骤 5–7 全部材料及“哪些用户操作现在能成功”的简明演示结果。原审查模型按 BC/SEQ/AC 检查 actual installed pair，而非单元测试数量。

通过条件：目标 Windows x64 上所有适用验收通过，无未解决的身份、生命周期、持久化或删除失败；启用/回退步骤可执行。存在 FAIL 为 NO-GO，必需项 NOT_RUN 为 INCOMPLETE；均继续保持日常 Shadow，准确说明欠缺条件。

到此暂停。用户让原审查模型验收；**通过后才按已经验收的步骤启用该用户的确切候选**。公开发布、其他 OS 认证和全量分发不在本计划内，不增设第三个 checkpoint。

## 测试与证据入口

以下是已存在入口，不是声称已执行。执行模型读取各脚本参数，记录最终实际命令；不要凭空补测试名。

- Electron：`memory_v2_startup_readiness`、`windows_vault_capability`、`windows_vault_supervisor_probe`、`memory_v2_rollout`、`memory_vault_startup_assembly`、`memory_vault_sink_executor`、`memory_vault_sink_broker`、`chat_deletion_outbox` 对应测试；用项目 Jest Node 配置运行。
- Python：`test_vault_sink_job_supervisor*.py`、`test_vault_sink_worker.py`、`test_main_vault_sink_worker.py`、`test_memory_v2_deletion*.py`、`test_production_run_ownership*.py`、`test_context_memory_v2_runtime_protocol.py`，以及新增的实际缺口回归。
- 跨项目契约：`scripts/release-qa/run-context-v2-contract.mjs`、`run-run-bundle-contract.mjs`，显式复用同一 wheel。
- Native：`VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH` 指向独立证据文件，运行 `windows-vault-supervisor-native-probe.py` 后交给 `verify-windows-vault-supervisor-native-evidence.py`。
- Package：`windows-packaged-vault-supervisor-probe.py --sidecar <实际exe> --artifact-evidence <固定wheel证据> --out <证据>`，随后独立 verifier。现有三项 smoke 之外的矩阵需要扩展 harness。
- 建议产物目录：`.release-qa/windows-memory-v2-active/<candidate-id>/`；在本文件追加简短进度与证据链接。候选 id 必须来自真实构建身份，不能拿人为名称替代 hash 校验。

## 交给执行模型的提示词

> 按 `docs/architecture/windows-memory-v2-active-implementation-plan.md` 执行 Windows Memory V2 Active 实施。先核实当前代码和状态，复用已完成模块，按编号步骤推进，记录真实 BC/SEQ/AC 证据。只在 Checkpoint 1 和 Checkpoint 2 暂停，让用户交给原审查模型验收；不要增加例行人工确认。不要提交 Git、公开发布、伪造能力或提前启用用户日常实例。遇到失败应修复并复测；外部条件确实缺失则明确记录 INCOMPLETE，不能用删 guard 或绕过检查换取 ready。

## Checkpoint 1 execution record — 2026-09-05

状态：**READY FOR REVIEW**。未构建安装候选、未启动日常实例的 Active、未提交 Git。

- BC-001/003：Windows 打包 sidecar 现在须携带构建时生成的 `windows-vault-runtime-provenance.v1.json`；Electron 启动时重算实际 sidecar SHA-256，验证 wheel/manifest/arch，再开始无明文 probe。开发态、缺少文件或哈希不符都无法获得 receipt。
- BC-002：supervisor bootstrap 的 containment attestation 已仅在 Python 内部传到 frame executor 和 shell/MCP；direct worker、伪造 wire 数据或无 attestation 均在执行前拒绝。Windows 仅声明 `shell_secret_env`、`shell_secret_stdin`、`mcp_schema_secret`，`computer_input` 保持 unsupported。
- BC-003/004：startup 顺序为 provenance → probe → registry → broker → sealed receipt → sidecar。结构性 broker bootstrap 失效使 latch 单向 `ready → lost`，同步关闭 registry，重新配置不恢复 Active；正常 suspend 不走 lost。专用 authenticated DELETE 没有改动。
- AC-001..009/013 的本地实现测试：
  - `npx jest --config '{"testEnvironment":"node","moduleFileExtensions":["js","json","node","cjs"],"testRegex":"electron/tests/main/.*\\.test\\.cjs$"}' --runInBand --runTestsByPath …`：核心启动/能力组 **100 passed**；删除/bridge/probe 组 **171 passed**；service/broker/lifecycle 组 **126 passed, 1 skipped**。这些选择集有重叠，未将它们相加作为独立覆盖数。
  - `F:/GIT/PuPu/.venv/Scripts/python.exe -m pytest tests/test_memory_v2_deletion.py tests/test_context_memory_v2_runtime_protocol.py tests/test_vault_sink_worker.py tests/test_main_vault_sink_worker.py tests/test_vault_sink_job_supervisor.py -q --tb=short`：**100 passed, 10 skipped**；skipped 均为明确标注的 Unix shell/process-group 用例。
  - `node --test scripts/release-qa/windows-memory-v2-contract-fixture.test.mjs`：**4 passed**。
  - Windows 原生 Job evidence：`.release-qa/windows-memory-v2-active/checkpoint-1/vault-supervisor-native.v3.json`，独立 verifier 输出 `4`；文件 SHA-256 为 `eb865b61cdd3cd157eb138b734a25f8affc4478704d70a4a48f2a07c608ae13a`。
- 静态验证：`node --check` 覆盖改动的 Electron 文件；PowerShell parser 覆盖 build script；`git diff --check` 通过。
- GitNexus：变更检测 `detect-changes --scope all --repo .`：17 个已跟踪文件、80 个符号、4 条受影响流程、**medium**。索引对 `markLost`/registry 的属性调用返回 `UNKNOWN`，已用源码调用链复核；未出现 HIGH/CRITICAL。

未完成且明确留给 Checkpoint 2：固定 wheel 与安装后的 Electron/sidecar exact pair、包级 supervisor probe、三类实际执行和完整产品行为/100 次故障循环。因而本记录不是 Active 启用授权。

## Checkpoint 1 independent review — 2026-09-05

状态：**NO-GO，验收不通过**。此结论更新上方 READY FOR REVIEW 状态，不进入第二阶段。

独立复跑原有 Electron 104 项、Python 100 项（10 skipped）、契约 4 项均通过；新增 8 项验收 probe 中 7 项失败、1 项通过。发现真实 provenance/receipt schema 不一致、lost 后准入与活动流未关闭、artifact 身份错误仍启动、manifest 身份未绑定及启动失败未清理资源。AC-013 和第一阶段三类真实 Windows sink 成功证据仍缺失；其中三类本地真实执行按步骤 2.2 属于第一阶段，不能整体推迟到 Checkpoint 2。

具体复现、代码位置、证据与修复顺序见 [Checkpoint 1 验收报告](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。修复后回到同一 Checkpoint 1，不新增验收点。日常 Active 继续不启用。

## Checkpoint 1 second independent review — 2026-09-05

状态：**NO-GO，复验仍不通过**。修复后的正式 Electron 七组 112 passed、Python 101 passed（10 Unix-only skipped）、Node 8 passed，原独立验收 8 项已转绿。但新增 3 项独立负向测试均失败：身份拒绝可由启动页 retry → restartMiso 绕过；保持 app payload 不变、替换 exe+旁置哈希仍被 provenance resolver 接受；probe timeout 的具体原因被后续 readiness 覆盖，继续显示泛化 unavailable。

详见 [验收报告的第二轮独立验收](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。Windows env/stdin 已有真实命令执行，但本地 supervisor→worker→三类 sink 的时序证据与 AC-010/011 source 集成映射仍不足。第一阶段补 source/native；安装 exact pair、installed parent、100 次循环依然在第二阶段，不混淆两阶段门槛。修复后回到同一 Checkpoint 1。

## Checkpoint 1 third independent review — 2026-09-05

状态：**NO-GO**。第二轮 3 个具体复现已通过，但独立新增 4 项负向/兼容用例全部失败：开发态没有 packaged provenance 被当作 artifact 损坏，Windows Memory-off Python 启动也被禁止；通用 build:web 在 macOS/Linux 的真实 wheel evidence 配置下要求 Windows 专用 staging；Job setup 失败依然向 renderer 返回泛化 unavailable。详见 [验收报告第三轮](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。原 REVIEW+RECHECK 11 passed、正式三组 35 passed、Node 8 passed，不能替代上述平台/状态覆盖。

## Checkpoint 1 fourth repair verification — 2026-09-05

第三轮 D1/D2/D3 已修复：开发态在 provenance 未认证时保持 Shadow/off 并允许普通启动；仅 packaged identity invalid 阻止所有 restart；Windows artifact identity 不污染 macOS/Linux build-web；所有 `vault_worker_*` 结构性失败提供静态 renderer error。正式 Electron 七组 117 passed，Python 集合 128 passed、10 个 Unix-only skipped，REVIEW/RECHECK/THIRD 15 passed，Node 8 passed；实际 Windows native Job/parent probe 4 passed并已独立校验。详情见[验收报告第四轮](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。

状态为 **INCOMPLETE**：步骤 2.2 的真实 supervisor→worker→三类 sink 时序证据和 AC-010/011 的完整 source 矩阵仍待补齐。它们应在同一 Checkpoint 1 完成；安装 exact pair、installed parent 和 100 次混合循环继续属于 Checkpoint 2。日常 Active 不启用。

## Checkpoint 1 fifth repair verification — 2026-09-05

修复 Windows sidecar builder 对 `Get-FileHash` 的隐含依赖：兼容 PowerShell 会在 EXE 生成后失败，遗漏 Vault provenance 与 app identity。改为 .NET SHA-256 后，完整 `build:unchain:win` 已生成同一 EXE 的 canonical sidecar/app 身份对，并由真实 resolver 验收。实际 EXE 已通过 Electron executor 的 `shell_secret_env` 与 `shell_secret_stdin` supervisor → Job-contained worker 链路，各自成功并完成 drain；请求只用合成 token 和本地无副作用命令。

Checkpoint 1 仍为 **INCOMPLETE**：`mcp_schema_secret` 真实成功链路与 AC-010/011 逐格 source 映射尚缺。日常 Active、安装候选与 Git commit 均未进行。

## Checkpoint 1 sixth repair verification — 2026-09-05

**BC-003 / AC-012：** supervisor 在构造受限 worker 环境时错误移除了 Electron 提供的 `UNCHAIN_DATA_DIR` 和 `PUPU_MCP_RUNTIME_DIR`，导致 packaged MCP sink 不能读取受控本地配置并返回 `vault_mcp_unavailable`。已将这两个非明文目录变量加入明确 allowlist，仍排除 vault PID、任意用户 secret 和 PyInstaller reset 值；spawn/worker 回归为 43 passed、10 Unix-only skipped。

重建 sidecar 后，实际 Electron executor→supervisor→Windows Job→同 EXE worker 已分别成功执行 env、stdin 与本地确定性 MCP 三类 sink，并完成 drain。MCP fixture 不联网、不调用用户配置，仅使用合成 token 且返回固定非敏感结果。步骤 2.2 的三类成功时序证据已补齐。

Checkpoint 1 仍为 **INCOMPLETE**：AC-010/011 需要完整逐格 source 映射；AC-012 的故障/强杀/循环矩阵仍属后续完整验收。日常 Active、安装候选与 Git commit 均未进行。

## Checkpoint 1 seventh independent review — 2026-09-05

状态：**NO-GO**。本轮 Windows 两处修复与同一最新 EXE 的三类 sink 实测通过，增强测试验证实际 token 字节送达、回显脱敏、租期拒绝复用。新增 E1：通用 build snapshot 测试没有限定 Windows，却要求非 Windows 拒绝 Windows identity；模拟 Linux 为 3 passed / 1 failed，需按 AC-014 修正测试预期。

此外，步骤 2.2 的真实 executor 实测直接注入 plaintext，尚未串起 Vault 的 prepare/CAS/decrypt。Vault 的 fake lease 顺序测试 24 passed，不能作为该真实串联已完成的声明。AC-010/011 七组 27 passed 仍包含 mock 接线和 shape 构造，需逐项列清实际集成与缺失 source 行为。详见 [第七轮独立验收](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。未进入 Checkpoint 2；安装后矩阵与 100 次循环保持第二阶段范围。

## Checkpoint 1 eighth repair verification — 2026-09-05

状态：**READY FOR REVIEW**。E1 已改为 Windows/非 Windows 双侧条件测试，当前 Windows 与模拟 Linux 分别 4 passed、1 条条件 skip。生产 Vault 已与当前重建 EXE 的 env/stdin/MCP 三种 sink 串联，逐一证明 `READY → CAS(executing) → decrypt → execute → drain → receipt`、合成 token 实际送达、receipt 脱敏、相同 operation 不重放、冲突 operation 拒绝及零残留子进程。

AC-010/011 已补 normal 同 chat 第一/第二条与新 chat 隔离测试、同 execution 两次 interaction/两次冷恢复/重复 resume 不重放测试，并据此修复 graph resume guard owner 与后续 parked lineage 两个缺陷。扩展 source 集合 90 passed；原七组 28 passed；guard/interaction 回归 76 passed、1 skipped、17 subtests；Electron 相关 142 passed。逐格 test name、装配边界与断言见[验收报告第八轮](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。

当前 sidecar/wheel/manifest 分别为 `b34d5f5d32bd119854ce7391e746919b8fb726949b40c564acbdd5dae78aa930`、`7ab5a7fada8261fd450296f3e3845416f62081f346654df056ccc47cf4b5246b`、`2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`。未安装候选、未启用日常 Active、未提交 Git；Checkpoint 2 的 installed Electron parent、完整安装态组合与 100 次循环没有提前声明完成。

最终静态/契约检查通过；GitNexus 完整变更分析为 26 个 tracked 文件、163 symbols、5 条流程、medium，无 partial/truncated 或 HIGH/CRITICAL。

## Checkpoint 1 ninth independent review — 2026-09-05

状态：**NO-GO**，更新第八轮 READY FOR REVIEW。同节点两次 interaction 修复通过，但独立新增“collect 提问→恢复完成→write 提问”序列两次稳定失败：parked guard reconcile 强制比较 resume 起点 step 与当前 interaction step，误拒绝合法 graph 节点推进。需修复可信 graph ownership 判定，并补跨节点第二次 receipt/resume 与外来 graph/session 拒绝。复现和代码位置见[第九轮验收报告](F:/GIT/PuPu/docs/architecture/windows-memory-v2-checkpoint-1-review.md)。

本轮已有 Python 88 passed（1 skipped、17 subtests）、Electron 147 passed、Windows Node 13 passed（1 平台 skip）、Linux 分支 4 passed（1 平台 skip）。加强内部结果断言后的当前 EXE Vault 三 sink 整链全部通过。新跨节点用例 1 failed；未进入 Checkpoint 2，未启用日常 Active。

## Checkpoint 1 tenth repair verification — 2026-09-05

状态：**READY FOR INDEPENDENT REVIEW**。F1 没有删除 source 校验或改写旧 binding。恢复 attempt 首次绑定 graph step 时，binding 现在固化经校验的 graph authority 摘要（session、chat、coordinator、plan、scope、topology、canonical build 与 recipe/binding 摘要）。后继节点仅在其不可变 record 指向该 exact predecessor 且 authority 摘要完全相同的情况下，才能沿用 parked transport guard；缺少摘要、不同 graph/coordinator/session 或非直接前驱均继续 409 拒绝。

BC-006 / SEQ-003 / AC-010/011 的正式跨节点回归 `test_active_graph_cross_node_interactions_preserve_verified_guard_lineage` 已完成 collect→receipt→cold resume→write→receipt→cold resume，并验证旧 receipt 不重放。它还覆盖伪造 coordinator、plan、scope、topology 与 foreign session 的拒绝。相关 Python 回归为 durable host 39 passed（2 subtests）、session guard 24 passed/1 skipped（11 subtests）、Active bridge 6 passed，以及 graph 三组分别通过（两参数冷恢复 2、同节点双 interaction 1、跨节点 1）。

Python 改动后已重新构建并只使用新候选复测：sidecar `6a62c57cc2d62a3d672cb358a855f49b472262551b8235406b9be712938d8aaf`、wheel `6aea691b70415c53ca4fb3f5cae7266540c259eb60bf9af66610c5074959be31`、manifest `2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`。实际 Vault→env/stdin/MCP 三 sink 严格链路 3/3 通过，故意错误摘要退出 1 且返回 `vault_use_indeterminate`。未安装候选、未启用日常 Active、未提交 Git，仍在 Checkpoint 1 等待独立验收。

## Checkpoint 1 eleventh independent review — 2026-09-05

状态：**NO-GO**，更新第十轮 READY FOR INDEPENDENT REVIEW。相邻节点对照用例通过，但新增两种合法历史状态失败：G1 在 collect 恢复后经 summarize 普通节点再到 write 提问，直接前驱检查误拒绝同 graph 的非相邻推进；G2 旧 schema v1 binding 缺新增摘要时，入口允许第一次恢复，却在下个节点 pending 查询时拒绝。两者均为 409，属于 BC-006 / SEQ-003 / AC-010/011，详情见验收报告第十一轮。

本轮正式 Python 四文件 80 passed、1 skipped、19 subtests passed；新增独立参数用例 1 passed、2 failed。第十轮同一 EXE 的严格 Vault 三 sink 均通过、故障 probe 正确失败。未进入 Checkpoint 2，未启用日常 Active，未修改生产代码。
