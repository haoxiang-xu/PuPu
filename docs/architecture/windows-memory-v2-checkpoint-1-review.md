# Windows Memory V2 — Checkpoint 1 验收

日期：2026-09-05。结论：**NO-GO，Checkpoint 1 不通过**。修复后回到同一 Checkpoint 1 复验；不进入 Checkpoint 2，不增加验收点，不启用日常 Active。

最新独立复验仍为 **NO-GO**，见文末“第三轮独立验收”。第二轮三个具体复现用例已转绿；本轮发现 Windows 开发启动和非 Windows 构建回归，错误文案的实际原因集合仍未覆盖完整。

依据：[实施计划](F:/GIT/PuPu/docs/architecture/windows-memory-v2-active-implementation-plan.md) 中第一阶段步骤 1–4、BC-001..006、SEQ-001..006 和 Checkpoint 1 通过条件，以及 [跨边界规则](F:/GIT/PuPu/.claude/rules/cross-boundary-contract-gate.md)。本轮只验收，未修改生产代码，未启动用户实例，未提交 Git。

审查基线：PuPu HEAD `036dffbd0e72e86421ec105bf00ee51d65a620df` 加当前未提交改动；unchain HEAD `6526dc15d49590675638d7b440e78cc1e1f96751`。不是已安装候选的验收。

## 已复现的阻断项

### R1 — P1：真实 provenance 不能通过能力回执校验

- 构建脚本和 [provenance producer](F:/GIT/PuPu/electron/main/services/unchain/windows_vault_provenance.js:3) 输出 `pupu.windows-vault-runtime-provenance.v1`。
- [receipt consumer](F:/GIT/PuPu/electron/main/services/unchain/windows_vault_capability.js:5) 要求 `pupu.windows-vault-provenance.v1`，严格字符串比较失败。
- [真实启动接线](F:/GIT/PuPu/electron/main/index.js:425) 原样传递该 provenance。因此前置验证与 probe 全部成功时，receipt 仍抛错，`configureWindowsVaultCapability` 根本不会执行，无法解除 Windows Active 限制。
- 原 startup 测试在 [mock](F:/GIT/PuPu/electron/tests/main/memory_vault_startup_assembly.test.cjs:200) 中直接 `return receipt`，绕过了实际 consumer，掩盖了漂移。

复现：无 mock 的 `direct-boundary.cjs` 使用本地合成文件，调用真实 resolver 和真实 receipt consumer，结果是 resolver 接受、consumer 拒绝。另将 startup 测试恢复真实 consumer 后，顺序中缺少 `windows:configure-capability`。

修复要求：明确唯一版本化契约并统一两端；保留真实 producer → 严格 consumer 的正向测试，以及未知字段、错版本、错身份负向测试。对应 BC-001/003、SEQ-001、AC-001/005/006。

### R2 — P1：lost 没有关闭 Memory V2 准入，也没有中止活动流

[markWindowsVaultCapabilityLost](F:/GIT/PuPu/electron/main/services/unchain/service.js:1710) 只更新 latch 和 JS rollout 配置，再调用 registry 清理 observer。它没有同步改变 `memoryV2Readiness`、中止活动 stream，或让当前 sidecar 停止其已有 Active 配置。

独立用例实际观察到：

1. 初态 Memory V2 ready，调用 markLost 后 `memoryV2.ready` 仍为 `true`。
2. 已建立的 stream `AbortSignal.aborted` 仍为 `false`。
3. lost 后新发起的 `memory_v2_requested: true` 请求仍调用 `/chat/stream/v4` transport。

[stream 准入](F:/GIT/PuPu/electron/main/services/unchain/service.js:5673) 只检查 readiness，未检查 terminal lost。生产代码中 markLost 的调用仅接入启动 FD3 bootstrap 失败；尚未看到 worker 结构性失效或启动后 broker 失效传入该状态机。[index observer](F:/GIT/PuPu/electron/main/index.js:179) 也只清理 registry。

修复要求：接通结构性失效事件；先同步关闭新工作准入、更新公开状态并中止活动流，再有界清理 lease/registry/broker 和处理 sidecar。验证 retry/resume/sidecar restart 不能恢复权限，正常 suspend 不误置 lost。专用删除必须保留。本轮验证它在 lost 后仍成功。对应 BC-004/005、SEQ-004/005、AC-007/008/013。

### R3 — P1：已知 sidecar 身份校验失败后仍尝试启动它

[index.js](F:/GIT/PuPu/electron/main/index.js:374) 将 provenance 无效、缺失、probe 失败统一 catch 后继续；随后 [无条件 startMiso](F:/GIT/PuPu/electron/main/index.js:464)。`resolveMisoEntrypoint` 对 packaged exe 只检查存在，`startMiso` 没有收到身份禁止执行状态。

独立 startup 测试注入与 resolver 相同的 `windows vault runtime provenance is invalid` 错误，仍观察到 `sidecar:start`。这与计划明确区分的两种失败语义不符：可信 sidecar 的 Vault 能力失败可降 Shadow；sidecar 自身身份失败须 unavailable、不得执行。

修复要求：区分 artifact 身份错误和 Vault 功能失败，前者阻止所有启动/重启入口；删除保留 durable outbox 待环境修复。对应 BC-001/003/005、SEQ-001/006、AC-002/006/008。

### R4 — P1：receipt 的 runtime 身份没有和实际 import 绑定

[resolver](F:/GIT/PuPu/electron/main/services/unchain/windows_vault_provenance.js:65) 重算 exe hash，但 wheel/manifest 仅验证字符串格式，arch 仅验证 JSON 字面值 `x64`，没有独立受控 candidate/snapshot 身份比较。exe 与旁置 JSON 自报一致不能单独证明计划要求的 artifact provenance。

[configureWindowsVaultCapability](F:/GIT/PuPu/electron/main/services/unchain/service.js:1691) 没有保留 receipt 的预期 manifest digest供启动校验；[verifyContextV2Readiness](F:/GIT/PuPu/electron/main/services/unchain/service.js:1985) 只执行已有协议兼容性/rollout 校验。因此一个兼容但与 receipt 身份不同的实际 runtime 仍被判 ready。

独立测试在 receipt 写入 `sha256:aaaa…`，status 返回另一个真实计算的有效 protocol manifest digest，仍得到 ready。协议兼容性通过不能代替 artifact identity 相等。

修复要求：复用既有受控 artifact/candidate 证据，分别验证安装字节身份与实际 import 的协议兼容性，并绑定 manifest digest、wheel、架构和 snapshot；补错 wheel、兼容但错 digest、替换 sidecar+旁置文件、错架构/快照的负向用例。不得以 Git SHA allowlist 代替 runtime compatibility。对应 BC-001/003、SEQ-001/006、AC-001/002/006。

### R5 — P2：启动中途失败没有清理已创建的 registry/broker

[启动 catch](F:/GIT/PuPu/electron/main/index.js:444) 仅记录错误。receipt 生成前已经启动 broker，receipt 拒绝后既未关闭 registry，也未停止 broker。注释“失败时 broker 不监听”与此路径不符。

独立 startup 用例观察到 `vault:start-broker → windows:receipt`，但没有 `executors:close`。修复要求：各阶段失败回滚此前创建的资源；分别测试 configure/broker/receipt 失败及重复清理，不关闭承载隐私删除的 Vault 数据库。对应 BC-002/003/004、SEQ-001、第一阶段步骤 4.1。

### R6 — P2：界面仍不能解释 Windows capability 为什么不可用

provenance/probe 失败只写日志，latch 在启动时最终归为 `vault_worker_capability_unconfigured`；[readiness 错误文案](F:/GIT/PuPu/electron/main/services/unchain/service.js:2028) 对这些原因仍返回 `Memory V2 capability is unavailable`。没有对应 renderer 展示接线，lost 又存在 R2 的 ready 状态矛盾。

修复要求：静态原因码从实际失败点贯通 status 与 renderer，区分未配置、探测失败、artifact/协议不符、存储错误和 lost，提供相应恢复操作；不要输出凭据或原始路径/Win32 错误。对应 AC-013、BC-003/004、第一阶段步骤 4.4。

## 仍缺少的第一阶段证据

- 三类 Windows sink 的真实成功执行属于第一阶段步骤 2.2，不能全部推迟到 Checkpoint 2。新 Python 测试 [test_windows_supervisor_attestation_reaches_shell_and_mcp](F:/GIT/PuPu/unchain_runtime/server/tests/test_vault_sink_worker.py:163) mock 了 `_execute_shell`；MCP 是进程内假 toolkit。它们证明内部参数传递，未证明 Windows supervisor → worker → 实际 env/stdin/local fake MCP 的成功执行与终止语义。原有 Unix shell 用例在本机跳过。
- 必须补三类合成 secret 的本地真实链路，观察 READY 前零 payload、prepare/CAS/decrypt/单次使用/drain，并覆盖结构性失败触发 R2。安装后的 exact pair 和 100 次循环仍按原计划留在 Checkpoint 2。
- 本轮没有重新验证完整 normal/graph/subagent、interaction/retry/resume 的 AC-010/011 source 矩阵。执行记录须给出适用用例与证据映射；本次重跑的协议/删除测试不能代替该矩阵。
- GitNexus PuPu 索引时间为 2026-09-05 10:03:35，未可靠反映全部新增路径；查询未给出可依赖的新调用链。本结论依据实际源码及运行用例，没有把空图结果作为低风险证据。先前的 17 个 tracked-file 变更报告不能单独覆盖 untracked provenance 文件；下轮修复前补新鲜 impact，复验时保留完整变更映射。

## 本轮实测结果

| 检查 | 结果 | 能证明的范围 |
|---|---|---|
| 原有 Electron 七组：capability、provenance、probe、sink executor、startup assembly、readiness、rollout | 104 passed | 既有单元测试未回归；不覆盖上述遗漏 |
| Python deletion、runtime protocol、worker、main worker、supervisor | 100 passed，10 skipped | 已有协议/删除/执行单元行为；Windows 跳过的测试不视为通过 |
| Node Windows contract fixture | 4 passed | 既有声明和帧校验 |
| 既有 native evidence 的独立 verifier | 返回 4 | 原 evidence 格式和断言通过；本轮未重新运行原生 probe，更不是 installed sink 证明 |
| 新增独立 acceptance probes（`REVIEW`） | **7 failed，1 passed** | R1/R2/R3/R4/R5 可复现，lost 后专用 DELETE 成功 |
| 真实 resolver → 真实 receipt consumer | resolver 接受，consumer 拒绝 | 无 validator mock 的 schema 漂移复现 |

native evidence SHA-256：`eb865b61cdd3cd157eb138b734a25f8affc4478704d70a4a48f2a07c608ae13a`。上表是不同范围的结果，不合并为“总覆盖率”。验收 probe 从原测试复制装配，仅运行 `REVIEW`，复制文件中其余 23 项被过滤；该过滤数不属于产品平台 skip。

证据目录：[checkpoint-1-review](F:/GIT/PuPu/.release-qa/windows-memory-v2-active/checkpoint-1-review)。含 `results.json`、`baseline-results.json`、`python-results.xml`、`direct-boundary-result.json`、review harness 和生成脚本。probe 只使用合成内容及 mocked transport，不发送模型/第三方请求。

在 PuPu 根目录复现独立验收：

```powershell
node .release-qa/windows-memory-v2-active/checkpoint-1-review/generate-review-tests.cjs
node node_modules/jest/bin/jest.js --config .release-qa/windows-memory-v2-active/checkpoint-1-review/jest.config.json --runInBand -t REVIEW --json --outputFile .release-qa/windows-memory-v2-active/checkpoint-1-review/results.json
node .release-qa/windows-memory-v2-active/checkpoint-1-review/direct-boundary.cjs
```

当前 Jest 命令预期 exit 1。生成器针对本次源码装配，未来测试重构后需核对插入位置；修复模型应把有效断言纳入正式回归测试，不仅修改 ignored harness。

## 给执行模型的修复顺序

1. 先按仓库要求完成影响分析；修 R1/R3/R4 的启动与身份契约，并为 R5 补完整失败回滚。
2. 修 R2，使用真实失效事件验证 admission、活动流、registry/broker、sidecar 和删除通道的组合行为。
3. 补第一阶段三类 Windows 真实执行、R6 的界面原因及状态矩阵测试。
4. 更新实施计划的 BC/SEQ/AC 证据映射，保存本轮 red 与修复后的 green，回到同一 Checkpoint 1 验收。不得通过改 mock、删断言或将这些项目再次推迟到 Checkpoint 2 获得放行。

## 修复复验记录 — 2026-09-05

本节记录上述阻断项的修复结果，取代“当前 Jest 命令预期 exit 1”的历史状态。它不是安装候选或日常 Active 启用结论；该结论仍须按实施计划在同一 Checkpoint 1 复验后作出。

- **R1：已修复。** producer 和 consumer 统一使用 `pupu.windows-vault-provenance.v1`。无 mock 的真实 resolver → 严格 receipt consumer 探针现在同时接受，且正式 provenance 测试覆盖错 schema、额外字段和受保护 app identity 不符。
- **R2：已修复。** terminal lost 同步使 Memory V2 readiness 变为 degraded、终止现有流并拒绝新流；worker setup、READY、parent 和 attestation 等结构性失败通过 executor 回调进入同一单向状态机。普通工具失败不触发它。broker/registry 随后有界关闭，专用删除路径未改动。
- **R3/R4：已修复。** packaged sidecar 的运行时 provenance 同时与 app payload 中封闭的 wheel/manifest identity 绑定；身份错误阻止 sidecar 启动。启动后 status 的 manifest digest 必须等于 sealed receipt，兼容但身份不同也会降级。
- **R5/R6：已修复。** receipt、broker 或 registry 任一步失败都会停止已启动的 broker 并释放 registry。未配置、probe、identity mismatch 和 terminal lost 映射为静态、可恢复的聊天错误文案，不传递路径、凭据或原始 Win32 错误。
- **此前缺失的 Windows 成功路径：部分补齐。** `test_windows_attested_shell_executes_env_and_stdin_without_plaintext_output` 在本机真实运行 `cmd.exe` 的环境变量路径和 PowerShell 标准输入路径，并验证成功、redaction 及零明文输出；`mcp_schema_secret` 保持本地 fake toolkit 的闭合 schema/attestation 测试。它们没有替代安装后的 supervisor → worker → sink 端到端测试。

本轮实际结果：

| 检查 | 结果 |
|---|---|
| 相关 Electron capability/provenance/readiness/executor/startup | 5 suites，74 passed |
| Python deletion、runtime protocol、worker、entry、job supervisor | 101 passed，10 skipped；skipped 为 Unix-only 用例 |
| Windows 实机 env/stdin shell 用例 | 1 passed，包含在上述 Python 集合 |
| build snapshot 与 Windows protocol/registry/frame contract | Node 8 passed |
| 独立 `REVIEW` probes | 2 suites，9 passed；原先 7 个失败项均转绿 |
| 真实 resolver → receipt consumer | producer/consumer schema 相同，双方接受 |
| 语法与补丁检查 | 改动的 JS `node --check`、PowerShell parser、`git diff --check` 通过 |

GitNexus `detect-changes --scope all --repo .`：19 个已跟踪文件、142 个符号、4 条受影响流程，风险为 **medium**。索引对动态/跨语言调用仍有 UNKNOWN 项；已用源码调用点和运行用例补证，不能将空图当作低风险。

仍需在 Checkpoint 1 复验中明确评估的事项：normal/graph/subagent 的完整 AC-010/011 状态矩阵，以及 Windows supervisor → worker → 三种 sink 的实际安装后串联。安装候选 exact pair、100 次混合循环和用户 Active 启用仍属于 Checkpoint 2，当前保持 Shadow。

## 第二轮独立验收 — 2026-09-05

结论：**NO-GO，Checkpoint 1 仍不通过**。本轮仅新增隔离验收探针及文档，没有修改生产代码、执行用户 sidecar 或更改日常配置。基线仍为 PuPu `036dffbd0e72e86421ec105bf00ee51d65a620df`、unchain `6526dc15d49590675638d7b440e78cc1e1f96751` 加工作区未提交修改。

### C1 — P1：身份失败可被启动页 Retry 绕过（R3 未闭合）

`index.js:501` 的局部变量只阻止首次启动；`service.js:5072` 的 `startMiso` 不校验身份失败状态。真实调用路径是 `boot_readiness/service.js:306` 的 renderer retry → `restartMiso` → `startMiso`，身份失败后的 unavailable 不阻止此路径。

独立用例先按 startup 的方式调用 `markWindowsVaultCapabilityLost('vault_worker_runtime_identity_invalid')`，确认 status 为 unavailable，再调用真实 `restartMiso`，观察到 mocked spawn **调用 1 次，预期 0 次**。没有执行任何真实二进制。应把 artifact execution admission 放在所有启动入口共享的服务层；身份失败应持续禁止执行，不得仅靠首次装配分支。对应 BC-001/003、SEQ-001/006、AC-002/006。

### C2 — P1：替换 exe 和旁置 JSON 仍被接受（R4 未闭合）

`windows_vault_provenance.js:133` 只将 app 内记录的 wheel 和 manifest digest 与旁置 JSON 比较。app 内记录没有预期 `sidecar_sha256`，因此实际 exe hash 仍只与其可一同替换的旁置记录比较。保持 app payload 不变，复制原 wheel/manifest 值、替换 exe 内容并重算旁置 sidecar hash，即可通过 resolver。

独立测试只使用临时文本文件模拟 exe；改动 exe 与 companion 后，严格 resolver **未抛错，预期拒绝**。即使 app payload 已有完整性保护，此缺口仍存在。应将运行目标的 sidecar 字节身份绑定到独立受控候选记录，并验证实际完整性保护与构建/签名后的哈希顺序；不得仅依赖旁置自报值。对应 BC-001、SEQ-006、AC-002。

### C3 — P2：探测失败原因仍会丢失，回到原来的泛化提示（R6 未闭合）

真实 probe 会抛 `vault_worker_ready_timeout` 等不以 `vault_worker_probe_` 开头的原因。初始状态虽保留该原因，但 `verifyContextV2Readiness` 在 `service.js:2072` 将它覆盖为 `vault_worker_containment_unavailable`，`getContextV2ReadinessFailure` 没有覆盖该结果，仍返回 `Memory V2 capability is unavailable`。`getContextV2Status` 也有同样覆盖路径。

独立测试使用请求 all、实际降 Shadow 且 fingerprint 匹配的 status，模拟 probe timeout 后正常启动可信 sidecar：公开状态 reason 从 `vault_worker_ready_timeout` 变为 `vault_worker_containment_unavailable`。应让结构性原因在后续 status 刷新中保持，并为 probe 的实际原因集合、lost、身份和存储问题提供可操作的静态提示。对应 BC-003/004、AC-013。

### 仍欠缺的证据及阶段边界

Windows env/stdin 实机测试比此前的 shell mock 前进了一步，但它直接调用 `execute_intent(... containment_attested=True)`；fake MCP 也在进程内执行。尚未证明第一阶段步骤 2.2 要求的真实 supervisor/worker 链路及 READY → prepare/CAS/decrypt → 单次使用 → drain。须补本地 source/native 链路证据，不能将三类执行整体后移。**安装后的 exact pair、installed Electron parent 和 100 次循环仍属于 Checkpoint 2，本轮不要求提前做安装验收。** 这纠正了上一执行记录将“安装后串联”混入 CP1 的表述。

AC-010/011 source 集成矩阵仍没有随修复材料提供逐项用例和结果映射，不以协议 feature 字符串或已通过的删除单元测试代替。

### 本轮实测

| 范围 | 结果 |
|---|---|
| Electron 七组正式回归 | 112 passed |
| Python 五组 | 101 passed，10 Unix-only skipped |
| Node build snapshot、Windows contract | 8 passed |
| 原独立 REVIEW 探针，使用专用 `jest.config.json` | 8 passed |
| 新 RECHECK 探针 | **3 failed**，分别复现 C1/C2/C3 |

上轮报告的“9 个独立 probes”使用了 baseline Jest 配置，实际选择了正式测试里的 REVIEW 名称；不等同于 ignored 目录里的原 8 个独立 probes。本轮用专用配置重跑原 8 项并保存 green，与原 red 保留分开。

证据目录：`.release-qa/windows-memory-v2-active/checkpoint-1-review/`。新增 `generate-recheck.cjs`、`recheck-service-review.test.cjs`、`recheck-provenance-review.test.cjs`、`recheck-results.json`；原验收 green 保存在 `review-green-results.json`。重现命令：

```powershell
node .release-qa/windows-memory-v2-active/checkpoint-1-review/generate-recheck.cjs
node node_modules/jest/bin/jest.js --config .release-qa/windows-memory-v2-active/checkpoint-1-review/jest.config.json --runInBand -t RECHECK --json --outputFile .release-qa/windows-memory-v2-active/checkpoint-1-review/recheck-results.json
```

预期 exit 1，3 failed。生成器复制现有测试装配并插入断言，未替换生产实现。GitNexus 仍为 10:03:35 的旧索引；query 找到 retry → restart 的定义但未返回完整流程，本轮依据当前源码及真实服务函数测试确认，不将空图作为通过证据。

下一步：先修 C1/C2，再修 C3，补本阶段 source/native 证据和 AC 映射，回到同一 Checkpoint 1 复验。当前不能进入 Checkpoint 2，不能启用日常 Active。

## 第三轮独立验收 — 2026-09-05

结论：**NO-GO，仍在 Checkpoint 1**。原 8 个 REVIEW 与第二轮 3 个 RECHECK 本轮均通过；这确认了首次身份失败后 packaged restart 被阻止、app 内身份记录已含 sidecar hash、timeout 原因能保留。不能据此宣称所有启动形态、构建平台和错误码均已覆盖。

### D1 — P1：Windows 开发态的 Memory-off 普通启动被新门禁阻断

`windows_vault_provenance.js:102` 明确拒绝 `app.isPackaged !== true`，这是开发态没有 packaged receipt 的正常情况。`index.js:388` 却把这类不可用一律传成 `vault_worker_runtime_identity_invalid`。新增的 `service.js:5111` 只检查该 reason，不区分开发态，导致 index 之后调用 startMiso 也不再执行 Python；重试同样被挡。

独立用例用真实 resolver、真实 service 及与 index 相同的 catch 接线，设置 `isPackaged=false`、Windows、Memory off：预期 Python spawn 1 次，实际 0 次。用例不启动真实 sidecar。必须区分“开发态 Vault 未获认证，保持 Shadow/off”与“已安装 artifact 损坏，禁止执行”，同时保留 C1 的 packaged retry 拒绝。对应 AC-014、BC-001/003、SEQ-001。

### D2 — P1：Windows 身份文件被强制要求于 macOS/Linux 构建

`scripts/build-web.cjs:90` 只要存在 `UNCHAIN_ARTIFACT_EVIDENCE_PATH` 就要求 `.local/unchain-artifact-identity.v1.json`，没有目标平台条件；该文件仅由 Windows PowerShell sidecar builder 生成。共享 package workflow 在 `.github/workflows/_shared-release-package.yml:212` 对 macOS、Linux、Windows 都设置 wheel evidence 环境变量，然后调用共同 build:web。因此干净的 macOS/Linux package job 会在 React build 前报 `evidence is missing its staged sidecar identity`。

独立用例在 VM 中加载原始 build-web 脚本，分别提供 darwin/linux 平台、合法 evidence 字段且没有 Windows staging，两个用例都失败。VM 只隔离文件系统和 process exit，没有更改脚本分支，也没有真实构建或外网请求；平台回归结论还依据真实 workflow/命令链及非 Windows builder 不生成此文件。应按明确的构建目标限定 Windows identity 逻辑，同时保留 Windows 缺文件/错 wheel/错 sidecar 的拒绝。对应 AC-014、BC-001。

### D3 — P2：Job 等真实结构性失败仍显示原来的泛化错误

`getContextV2ReadinessFailure` 当前只覆盖 probe 前缀、ready 前缀和 parent 错误；实际 probe/supervisor 还会传入 `vault_worker_job_setup_failed`、handle、attestation 等原因。独立用例注入实际 Job setup 失败码，经过真实 start/readiness 和 stream 准入，renderer event 的 code 仍是 `context_v2_readiness_failed`，而不是保留的结构性原因；对应分支文案仍为 `Memory V2 capability is unavailable`。应覆盖实际封闭原因集合并给出静态恢复动作，不能只针对 timeout 用例。对应 AC-013、BC-003/004。

### 本轮证据

- 原独立 REVIEW + RECHECK：11 passed。
- 本轮正式 provenance/readiness/startup assembly：35 passed。
- Node build snapshot + Windows contract：8 passed。
- 新 THIRD：**4 failed**（D1 一项、D2 两个平台、D3 一项）。
- 补跑 source 集成七组：**27 passed，21.49 秒**。实际命令如下；没有使用外部模型请求。normal/active resume 验证 canonical host，graph restart/interaction 验证冷恢复与不重放，context adapter 包含跨 chat 拒绝及四类 agent shape 装配。subagent shape 装配不等同于完整 subagent 交互执行矩阵；这些通过项是 AC-010/011 的部分证据，不能标记整张矩阵完成。
- `vault-supervisor-native-current.json` 独立 verifier：4；本轮验证已有 evidence，没有宣称重新执行原生进程 probe，也不把它当作三类 sink 完整链路证据。

source 集成命令（工作目录 `F:/GIT/PuPu/unchain_runtime/server`）：

```powershell
F:/GIT/PuPu/.venv/Scripts/python.exe -m pytest tests/test_memory_v2_context_adapter.py tests/test_memory_v2_unchain_active_stream.py tests/test_memory_v2_unchain_active_resume.py tests/test_memory_v2_unchain_active_graph_restart.py tests/test_memory_v2_unchain_active_graph_interaction_resume.py tests/test_context_composition_durable_resume.py tests/test_production_run_ownership_wiring.py -q --tb=short
```

新增复现文件均在 ignored 证据目录：`generate-third-review.cjs`、`third-review.test.cjs`、`third-results.json`。重现：

```powershell
node .release-qa/windows-memory-v2-active/checkpoint-1-review/generate-third-review.cjs
node node_modules/jest/bin/jest.js --config .release-qa/windows-memory-v2-active/checkpoint-1-review/jest.config.json --runInBand -t THIRD --json --outputFile .release-qa/windows-memory-v2-active/checkpoint-1-review/third-results.json
```

本轮未改生产代码。仍需补齐已声明的本地 supervisor→worker→三类 sink 真实链路与 AC-010/011 source 矩阵证据；安装后 exact pair 和 100 次循环继续留在 Checkpoint 2。先处理 D1/D2/D3，再回到同一 Checkpoint 1。

## 第四轮修复复验 — 2026-09-05

第三轮 D1/D2/D3 均已修复并转绿：

- **D1：已修复。** 仅已安装包的 provenance 失败进入 `vault_worker_runtime_identity_invalid` 并禁止任何启动入口；开发态 provenance 缺失改为 `vault_worker_capability_unconfigured`，维持 Shadow/off 并允许普通 sidecar 启动。正式 startup assembly 断言覆盖该分支。
- **D2：已修复。** build-web 仅在实际 Windows 构建时读取和校验 Windows sidecar identity。macOS/Linux 仍可使用 wheel evidence 构建，不产生或要求 Windows `.exe` 哈希。THIRD 的两个平台隔离用例均通过；Windows staged identity 的闭合校验仍通过。
- **D3：已修复。** 任何经过严格静态码限制的 `vault_worker_*` 结构性失败都会进入稳定的 containment 提示；已覆盖 Job setup 失败的实际 stream event。身份、lost、未配置和协议不符保留更具体的先行文案。

本轮实测：

| 范围 | 结果 |
|---|---|
| Electron capability/provenance/probe/readiness/executor/startup/rollout 七组 | 117 passed |
| Python protocol/delete/worker/supervisor + normal/graph/interaction/resume source 集合 | 128 passed，10 个明确 Unix-only skipped |
| REVIEW、RECHECK、THIRD 独立探针 | 15 passed |
| Node build snapshot、Windows contract/registry/frame | 8 passed |
| 实际 Windows native supervisor Job/parent probe | 4 passed，证据为 `vault-supervisor-native-current.json`，并经独立 verifier 检查 |
| 真实 resolver → receipt consumer synthetic boundary | 双方接受，同一 schema token |

`git diff --check`、改动 JS 的 `node --check`、PowerShell parser 均通过。GitNexus `detect-changes --scope all --repo .` 报告 19 个 tracked 文件、148 个符号、4 条受影响流程、**medium**；动态/跨语言调用仍有 UNKNOWN，运行用例与源码调用点已作补证，不能将图的空调用者作为低风险结论。

当前结论：**Checkpoint 1 仍为 INCOMPLETE，不进入 Checkpoint 2，也不启用日常 Active。** 代码与已复现缺陷已通过本地复验，但第一阶段步骤 2.2 要求的本地 supervisor → 同 exe worker → 三种 sink 的真实时序证据仍未形成；已有 env/stdin 测试直接调用 attested worker，fake MCP 也在进程内。source 集成矩阵现已有 27 项覆盖 normal/graph/resume、interaction、部分 subagent shape 与身份拒绝，尚未形成 AC-010/011 的完整逐格映射。安装 exact pair、installed Electron parent 和 100 次混合循环按计划仍属于 Checkpoint 2。

## 第五轮构建兼容性与真实链路复验 — 2026-09-05

本轮发现并修复了一个会造成“EXE 已生成，但 Windows Vault 仍不可用”的真实构建缺陷：`build_unchain_server.ps1` 在 PyInstaller 成功后调用 `Get-FileHash` 写入 sidecar provenance。通过 `npm` 实际调起的兼容 PowerShell 环境不提供该 cmdlet，因此脚本在 EXE 已落盘后退出，`windows-vault-runtime-provenance.v1.json` 和 app identity 都没有生成。该状态会被启动门禁正确拒绝，但对构建使用者表现为持续 unavailable。

修复改为使用 .NET `System.Security.Cryptography.SHA256`，不再依赖 `Get-FileHash`。已用该兼容 PowerShell 计算语句验证格式，并重新运行完整的 `PUPU_BUILD_VERSION=0.1.11 npm run build:unchain:win`。构建成功生成：

- `unchain_runtime/dist/windows/unchain-server.exe`；
- 旁置 `windows-vault-runtime-provenance.v1.json`；
- `.local/unchain-artifact-identity.v1.json`。

新 wheel identity 为 `sha256:7dc5256b3781d4223cba9bafff2eefe9f3737ec2ca880490aefae8529f67be8e`，manifest digest 为 `sha256:2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`。以该实际 EXE、旁置文件和 app identity 调用真实 resolver，得到 `resolved: true`、`arch: x64`、canonical schema；未将该临时构建当作安装候选。

步骤 2.2 的链路证据也新增两项真实成功执行：Electron `createVaultSinkExecutors` 以本轮 EXE 启动 `--vault-sink-supervisor`，等待真实 READY，supervisor 创建 Job 并从同一 EXE 启动 one-shot worker。随后分别以合成 token 执行不访问网络、不读取用户数据的命令：

| sink | 结果 |
|---|---|
| `shell_secret_env` | `win32_job_list_v1`，`exit_category=success` |
| `shell_secret_stdin` | `win32_job_list_v1`，`exit_category=success` |

输出只记录 sink、containment 和退出类别，未写入合成 token。两次 lease 都在 finally 中 abort、关闭 registry 并等待 drain。`mcp_schema_secret` 的真实成功链路仍未获得；不以 fake toolkit 或失败路径替代它。

新增 release-QA 断言要求 Windows builder 使用 .NET SHA-256，且不能再调用 `Get-FileHash -Algorithm`。`node --test scripts/release-qa/artifact-continuity-workflow.test.mjs` 为 **5 passed**；实际 resolver 复验通过；`git diff --check` 和 `node --check` 通过。GitNexus 最新 `detect-changes --scope all --repo .`：20 个 tracked 文件、148 symbols、4 条受影响流程、**medium**；动态图仍有 UNKNOWN，未按低风险处理。

当前结论：**Checkpoint 1 继续为 INCOMPLETE**。env/stdin 已有真实 supervisor→worker 成功证据；仍须补 MCP 真实成功链路，以及 AC-010/011 的逐格 source 结果映射。日常 Active 不启用，也未创建安装候选或提交 Git。

## 第六轮 MCP 链路修复复验 — 2026-09-05

第五轮的 MCP 实测初始返回 `vault_mcp_unavailable`。根因是 supervisor 的最小 worker 环境白名单没有包含 Electron 已传入的 `UNCHAIN_DATA_DIR`（同时也遗漏 `PUPU_MCP_RUNTIME_DIR`）；worker 因而不能读取其受控 MCP 配置和 secret store。env/stdin sink 不依赖该目录，所以此前两项成功没有覆盖这个缺口。

修复在 `vault_sink_job_supervisor.py` 的白名单中显式保留这两个目录变量；它们来自 Electron entrypoint，而非 framed plaintext intent。`test_vault_sink_job_supervisor_spawn.py` 断言 worker 环境保留目录变量并继续排除 vault PID、任意 secret 和 PyInstaller reset 变量。影响分析对 `_build_worker_environment` 返回 UNKNOWN（索引未解析该私有调用），已用文本调用点确认其只在 contained spawn 使用；未将 UNKNOWN 当作低风险。

验证：

- supervisor spawn 与 worker 协议回归：**43 passed，10 个明确 Unix-only skipped**；
- 重新构建 Windows sidecar，EXE 与两份 canonical identity/provenance 文件全部生成；
- 临时本地 stdio MCP fixture 声明 `x-pupu-secret` token 字段，仅返回固定 `{ delivered: true, channel: "checkpoint-1" }`，不联网、不写用户数据；
- 经实际 Electron executor → supervisor READY → Windows Job → 同 EXE worker → local MCP fixture 的 `mcp_schema_secret` 请求成功，输出为 `win32_job_list_v1` 和固定非敏感结果；lease/registry 已 drain，检查未发现残留 `unchain-server.exe` 进程；
- `artifact-continuity-workflow.test.mjs`：**5 passed**；`git diff --check` 通过。

因此步骤 2.2 的三种批准 sink 均已有本地真实成功时序证据：`shell_secret_env`、`shell_secret_stdin`、`mcp_schema_secret`。本次验证覆盖 **BC-003** 的受控 worker 环境继承和 **AC-012** 的三类成功路径；尚未覆盖 AC-012 的 nonzero/timeout/bad-frame/oversize、强杀与循环矩阵。

当前结论：**Checkpoint 1 仍为 INCOMPLETE**，只因 AC-010/011 尚未形成完整逐格 source 映射。步骤 2.2 的三类成功链路不再是缺口。日常 Active、安装候选和 Git commit 均未进行。

## 第七轮独立验收 — 2026-09-05

结论：**NO-GO，仍在 Checkpoint 1**。Windows 构建哈希替代与 worker 目录变量透传两处修复通过本轮验证；发现一项跨平台测试回归，且第六轮“只剩 AC-010/011 映射”的表述过宽。本轮未修改生产代码。

### E1 — P2：通用 release-QA 中的 Windows identity 测试在非 Windows 必败

`scripts/build-web.cjs:44` 已对非 Windows 返回 null，这是 D2 修复后的正确行为。`scripts/release-qa/build-web-snapshot.test.mjs:104` 的测试却不限定平台，仍在第 124 行要求带 extra 字段的 Windows identity 令 build-web 失败。Linux/macOS 会忽略该文件并成功退出，断言因此失败。该文件由 `package.json` 的 `test:release-qa:unit` 通配执行，且是 local gate 的检查项。应将 Windows 拒绝用例限定于 Windows，并显式覆盖其他平台忽略 Windows staging 的预期；不要撤销生产平台分支来满足旧断言。对应 AC-014。

本轮以 Node preload 将 process.platform 设为 linux，保留原测试、子进程和 build-web 实现，得到 **3 passed / 1 failed，exit 1**。这是分支模拟证据，不宣称 Linux 原生验收。相同的非 Windows 分支适用于 macOS。

复现材料在 `.release-qa/windows-memory-v2-active/checkpoint-1-review/`：`review-linux-platform.cjs`、`independent-linux-build-test.log`。PowerShell 命令：

```powershell
$env:NODE_OPTIONS = '--require=F:/GIT/PuPu/.release-qa/windows-memory-v2-active/checkpoint-1-review/review-linux-platform.cjs'
node --test scripts/release-qa/build-web-snapshot.test.mjs
```

### 真实 sink 验证通过，但仍需区分 executor 与 Vault 完整时序

新增 `independent-real-chain.cjs`，对同一份当前 EXE 重算 hash，并通过真实 provenance resolver 检查旁置/app staging identity。临时路径含中文与空格。每次运行在内存生成随机合成 token，三个真实目标都检查其 SHA-256，并故意回显 token，以验证 worker 的输出脱敏；lease 二次 execute 必须被拒绝，每次结束后 registry activeChildCount 为零。本轮三项全部通过，检查未见该 harness 的 sidecar/receiver 残留。

结果文件 `independent-real-chain-results.json` 绑定：sidecar `sha256:11e665b99a24b9518a45382639f460bfbeebf05a07a42d2798bb0261dc2ba878`，wheel `sha256:31371115da3d579eb630927d3dcdc96345ca2499dad9d8f5ea42794c0e577028`。parent 是 Node 调用生产 executor 的本地 harness，未冒充 installed Electron；只验证现有构建产物，没有重建或发布。

这补强了 env/stdin/MCP 的真实成功与脱敏证据。**第一阶段步骤 2.2 的完整 prepare→CAS→decrypt→execute→drain 串联仍未证明**：本轮和第五/六轮均直接向 executor 提供 plaintext，未调用 Vault executeUseIntent。现有 `memory_vault_use_state.test.cjs:542` 使用 deferred fake provider/lease 来测 READY 与 CAS/decrypt 顺序，24 项均通过，但这与真实 worker 分属两个装配。需要将真实 provider 接入临时 Vault，记录 READY 前不解密、CAS 后才解密、一次使用及 drain；不要求提前使用用户数据或安装后 Electron。该边界属于 BC-002，而非第六轮笼统引用的 BC-003。

### AC-010/011 source 证据范围

七组 source 测试本轮 **27 passed**。normal active stream/resume 中 `_create_agent` 和持久 bridge 被替换，证明参数/回调接线，不能代表 SQLite 首写、第二条消息和召回。graph restart/interaction 测试包含实际 runtime/持久化与离线 provider，构成有效的部分集成证据。`test_one_bound_context_module_constructs_every_agent_run_shape` 构造 subagent shape，但没有实际 subagent 两次 interaction/冷恢复执行。

需按已有 SEQ-002/003 列出 test name、实际装配边界、断言结果和尚缺项，并为缺少的 source 路径补测试；“27 passed”不能替代该映射。安装后完整矩阵和 100 次故障循环继续归 Checkpoint 2，本轮没有抬高安装验收门槛。

### 本轮实测汇总

| 范围 | 结果 |
|---|---|
| Electron 原七组 | 117 passed |
| Vault use state/CAS/lease | 24 passed |
| Python spawn/worker/private entry | 50 passed，10 Unix-only skipped |
| Python supervisor + spawn | 58 passed（与上行有重叠，不相加） |
| 七组 source 集成/接线 | 27 passed |
| Node artifact continuity/build snapshot/contract | 13 passed（Windows） |
| 同一当前 EXE 的 env/stdin/MCP 实链 | 3 passed，字节送达、脱敏、重复租期拒绝 |
| 本轮重新执行 native probe + 独立 verifier | 4，结果 `independent-native-current.json` |
| Linux 平台分支下原 build snapshot 测试 | 3 passed / 1 failed，复现 E1 |

下一步：修 E1，补真实 Vault 与 worker 的时序串联，补 AC-010/011 source 覆盖映射及确实缺少的用例，然后回到同一 Checkpoint 1。不能启用日常 Active。

## 第八轮修复复验 — 2026-09-05

状态：**READY FOR CHECKPOINT 1 REVIEW**。本轮修复了 E1，补齐 Vault→真实 worker 串联，并将 AC-010/011 从测试数量说明改成逐项 source 映射。尚未进入 Checkpoint 2，未创建或安装 Electron 候选，未启用日常 Active。

### E1 跨平台 release-QA

`build-web-snapshot.test.mjs` 现在将 Windows closed identity 拒绝测试限定为 `win32`，并新增非 Windows 忽略 Windows staging 文件的显式测试。结果：

| 平台分支 | 结果 |
|---|---|
| 当前 Windows | 4 passed，1 个 non-Windows 用例按条件 skipped |
| `NODE_OPTIONS` 将父测试进程及其 `build-web.cjs` 子进程都固定为 Linux 分支 | 4 passed，1 个 Windows 用例按条件 skipped |

只给父测试进程传 `--require` 不会改变其 spawn 子进程的平台，因此不作为平台证据；上述 Linux 分支使用继承到子进程的 `NODE_OPTIONS`。

### BC-003 / 步骤 2.2：Vault 与三种真实执行器

新增本地证据 harness `.release-qa/windows-memory-v2-active/checkpoint-1-review/independent-real-vault-chain.cjs`，其调用生产 `createMemoryVaultService` 与生产 `createVaultSinkExecutors`。每个 sink 都从加密 Vault deposit/grant/prepare/bind/native-confirm 开始；包装层只记录事件，不接收或替代执行结果。`safeStorage.decryptString` 回调即时从 `settings.db` 读取 intent 状态，三次均为 `executing`，证明 READY 后 CAS 已完成才解密。

当前重建身份：

- sidecar SHA-256：`sha256:b34d5f5d32bd119854ce7391e746919b8fb726949b40c564acbdd5dae78aa930`；
- Unchain wheel：`sha256:7ab5a7fada8261fd450296f3e3845416f62081f346654df056ccc47cf4b5246b`；
- runtime manifest：`sha256:2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`。

三类实际顺序均为 `prepare → READY → CAS(executing) → decrypt → execute → drain → receipt`。env/stdin/MCP fixture 都校验合成 token 的实际字节摘要；对外 receipt 不含 token。相同 execute operation 返回已存 receipt 且解密计数不增加，另一 operation 被 `vault_intent_conflict` 拒绝；每次及最终 `active_child_count=0`。机器可读结果为 `.release-qa/windows-memory-v2-active/checkpoint-1-review/independent-real-vault-chain-results.json`。该证据明确标注 `installed_electron_parent_tested:false`，安装后的 Electron parent 属于 Checkpoint 2。

### BC-006 / SEQ-002/003 / AC-010/011 source 映射

| 要求 | 实际 source 用例与装配边界 | 断言 | 结果 |
|---|---|---|---|
| normal 第一条、同 chat 第二条、全新 chat | `test_active_normal_second_message_reopens_same_chat_without_cross_chat_leak`；真实 Active bridge、Unchain `Agent`、SQLite/CAS、确定性 Ollama transport；每条消息重新构造 bridge | 第二次 provider 输入与 journal 同时含第一/第二条；foreign chat 仅含自己的消息 | PASS |
| graph 首次执行与冷恢复 | `test_active_two_node_graph_restarts_without_provider_reexecution` | 两个真实 graph step 使用各自确定性 provider；冷开后读取官方 checkpoint，已完成 provider 不重跑 | PASS |
| 第一次 interaction、receipt、冷恢复 | `test_active_graph_cold_resume_continues_exact_step_without_replaying_start[plain-input]` 与 `[opaque-vault-handle]`；公共 stream/receipt/resume 入口、真实 Agent/Context runtime/SQLite | 只恢复 exact step；receipt 一次消费；重复 resume 为 `interaction_not_found`；opaque handle 保留且 plaintext 不进入 Python | PASS |
| 同 execution 第二次 interaction、第二次冷恢复、retry | `test_active_graph_two_interactions_cold_resume_once_each_without_reexecution`；同一 graph step 连续产出两个 durable interaction，每次丢弃 runtime 后从 store 恢复 | `graph.step.resume.admitted=2`；collect provider 恰好 3 次、write 1 次；两个旧 interaction 的 retry 均不触发 provider | PASS |
| normal provider 使用 canonical journal | `test_active_context_module_compiles_provider_input_from_canonical_journal` | provider 看见 journal 当前输入，不看见 stale inline duplicate；用户消息和 final 各一份 | PASS |
| 工具完整结果先持久化 | `test_full_tool_payload_is_durable_before_host_notification`、`test_compiler_recovers_a_complete_tool_pair_from_the_bound_journal` | artifact/object 与完整 tool pair 在通知/恢复前可读 | PASS |
| subagent 实际执行与持久化 | `test_active_subagent_entry_finalizes_graph_without_root_completion`、`test_full_subagent_output_and_parent_receipt_precede_notification` | Active nested graph 真正执行并只完成 child graph；完整 child output 与 parent handoff receipt 先于通知持久化 | PASS |
| 跨身份拒绝 | `test_context_capability_rejects_another_host_execution_scope`、`test_binding_rejects_an_admission_for_a_different_chat`、`test_same_attempt_rejects_identity_drift_across_restart` | foreign execution/chat 与冷重启 identity drift 在读写/模型调用前拒绝 | PASS |
| 损坏数据与有界恢复 | `test_current_head_maps_authority_corruption_to_terminal_journal_error`、`test_rebase_guard_corruption_is_terminal_and_write_free`、`test_inline_recovery_is_bounded_to_one_call_and_one_replay`、`test_inline_recovery_replay_failure_is_bounded_and_escalates` | corrupt authority/guard 不写入；inline recovery 最多一次调用与一次 replay，失败后升级 | PASS |
| 冷重启召回 | `test_applied_promotion_is_recalled_across_cold_restart` | 关闭并重开 store 后从官方长期记忆 namespace 召回已应用 promotion | PASS |

双 interaction 新用例先复现两个实际缺陷：graph resume 将 canonical coordinator attempt 误作当前 session guard owner；第二次 suspension 的 parked guard 虽有 immutable resume-attempt binding，reconcile 仍只接受原 coordinator。修复为 `_stream_recipe_graph_events` 显式接收当前 guard owner attempt，并在 parked owner 不同的情况下仅当 `load_execution_attempt_binding(active_attempt).source_attempt_id` 与当前 checkpoint source 完全相同时接受。没有放宽 interaction/session/source identity；不匹配仍返回 409。

本轮测试汇总：

| 范围 | 结果 |
|---|---|
| 扩展 source 集合（9 个文件） | 90 passed |
| 原七组 source 集合（含新增双 interaction） | 28 passed |
| session guard / adapter owner / durable interaction host | 76 passed，1 skipped，17 subtests passed |
| Electron startup/capability/probe/rollout/Vault executor/broker/use state | 142 passed |
| Windows 与模拟 Linux build snapshot | 各 4 passed、1 条条件 skip |
| 当前 EXE Vault 三 sink 整链 | 3 passed，0 active children |
| Windows native Job probe + 独立 verifier | 4 |

Checkpoint 1 的 source 覆盖已包含 normal、graph、实际 subagent、第一/第二条消息、第一/第二次 interaction、retry、冷恢复、工具、召回及身份/损坏拒绝。安装 exact pair 上按 mode/shape 做完整组合、installed Electron parent 与 100 次故障循环仍按原计划留在 Checkpoint 2；本轮没有用 source 结果替代这些后续验收。

最终静态检查中，四个本轮 Python 文件通过 `py_compile`，JS 通过 `node --check`，`git diff --check` 通过；artifact continuity 与 Windows contract 共 9 passed。GitNexus `detect-changes --scope all --repo .` 完整返回 26 个 tracked 文件、163 个 symbols、5 条受影响流程、风险 **medium**，无 `partial`/`truncated`，未出现 HIGH/CRITICAL。前置 impact 对新增改动点因索引降级返回 UNKNOWN，已用所有调用点文本检索以及上述正向、身份错配负向和 durable guard 回归补证，没有将 UNKNOWN 当作低风险结论。

## 第九轮独立验收 — 2026-09-05

结论：**NO-GO，Checkpoint 1 未通过**。第八轮的同节点双 interaction、normal 第二条消息、跨平台构建用例均复验通过；新增跨节点 interaction 序列稳定失败。此次只新增独立验收脚本与文档，不改生产代码，不进入 Checkpoint 2。

### F1 — P1：恢复后下一个 graph 节点提问被错误拒绝

位置：`unchain_runtime/server/durable_interaction_host.py:2974` 与 `:2985`，`_reconcile_durable_interaction_session_guard`。

复现：collect 节点提问 → 持久 receipt → 以 transport attempt 恢复 → collect 完成 → write 节点再次提问 → `get_pending_interaction`。前五步真实执行成功，最后一步抛出 `session_guard_interaction_attempt_mismatch`（409）和 `Parked session guard has no exact durable resume lineage`。相同复现运行两次，均失败。

根因：transport attempt 的 immutable binding 仍正确指向首次恢复的 collect checkpoint；新 interaction 的 source 已是 write checkpoint。新增 parked 分支要求这两个 step ID 完全相等，误拒绝同一合法 graph 内向后推进的节点。guard 本身已 parked，且 owner 正是传入的 transport attempt；问题在 reconciliation 将“恢复起点”当成“后续所有 interaction 必须来自的节点”。

证据 `.release-qa/windows-memory-v2-active/checkpoint-1-review/test_review9_graph.json` 记录：

- guard owner：`transport-next-step-review9`，state：`parked`；
- resume binding source 与首次 interaction source 相同：`graph-step-ee562aa2…`；
- 第二次 interaction source：`graph-step-ed466797…`；
- provider 实际调用：collect 2 次、write 1 次，说明第一次恢复已完成并真实进入下一节点。

独立用例 `.release-qa/windows-memory-v2-active/checkpoint-1-review/test_review9_graph.py::test_second_interaction_on_next_graph_step` 复用已有确定性 SDK fixture，将两个节点设为不同 OpenAI model；公共 stream/receipt/resume、真实 Agent、SQLite/CAS 和 session guard 均未替换。断言待处理 interaction 在第二节点可读，当前失败。命令（工作目录 `unchain_runtime/server`）：

```powershell
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest F:/GIT/PuPu/.release-qa/windows-memory-v2-active/checkpoint-1-review/test_review9_graph.py -q --tb=short
```

修复要求：使用现有可信 graph plan/coordinator 与实际 session guard 的精确关系验证合法的节点推进；不能简单删除 source 校验或改写 immutable resume binding。补同节点与跨节点两次 interaction 正向、外来 graph/coordinator/session 负向，并把跨节点用例推进到第二次 receipt/resume 完成与旧 receipt 不重放。该要求属于既有 BC-006 / SEQ-003 / AC-010/011，不新增 checkpoint。

### 已通过项与证据界限

| 本轮独立复跑 | 结果 |
|---|---|
| Active bridge、graph interaction、实际 child graph、session guard、execution owner、durable host（7 文件） | 88 passed、1 skipped、17 subtests passed |
| Electron startup/capability/provenance/probe/rollout/executor/broker/Vault state（9 组） | 147 passed |
| Windows build snapshot + artifact continuity + Windows contract | 13 passed、1 条平台条件 skip |
| Linux 分支（NODE_OPTIONS 同时作用父子进程） | 4 passed、1 条平台条件 skip |
| 当前 EXE 的真实 Vault→三 sink，加强内部结果断言 | 3 passed，0 active children |
| 新增跨 graph 节点 interaction | 1 failed，两次稳定复现 F1 |

原 Vault harness 只检查外层 receipt 的 `ok/status`。独立脚本 `review9-strict-vault.cjs` 增加 `response.result.ok`、sink identity、shell success/stdout 与 MCP `received=true`，当前三类全部通过；它同时保留 READY/CAS/decrypt/drain/replay 断言。结果在 `review9-strict-vault-results.json`，仍绑定 sidecar `b34d5f5d…a930` 与 wheel `7ab5a7fa…5246b`。故意设置错误接收摘要时返回 `vault_use_indeterminate` 且进程退出 1，没有被误报成功。建议将加强后的断言并回正式证据脚本，此项不作为第二个生产缺陷。

此前 source 表格可作能力维度映射，但不能概括为所有状态组合已完整覆盖；本轮 F1 就是同节点测试未覆盖的合法跨节点状态。安装态完整组合、installed Electron parent 与 100 次故障循环仍留在 Checkpoint 2；本次未要求提前安装。日常 Active 继续保持未启用。

## 第十轮修复验证 — 2026-09-05

状态：**READY FOR INDEPENDENT REVIEW**，不是 Checkpoint 1 的验收结论。F1 的旧 step resume record 会在该 step 完成时被删除，所以修复不能依赖事后读取旧文件。`bind_execution_attempt` 在首次恢复时从已校验的 graph record 固化 source authority 摘要；后继节点只能同时满足：当前不可变 record 的 `predecessor_attempt_id` 等于绑定 source、当前 record 的 authority 摘要逐项匹配、并且 session 仍精确一致。没有摘要、外来 coordinator/plan/scope/topology、foreign session 或非直接后继均失败关闭；immutable binding 与 source identity 未被改写。

正式回归 `test_active_graph_cross_node_interactions_preserve_verified_guard_lineage` 走公共 stream、receipt、resume API 与真实 Agent/SQLite/CAS/session guard，完成 collect 提问 → receipt → cold resume → write 提问 → receipt → cold resume；两个 provider 各恰好执行两次，旧 receipt 重新 resume 为 `interaction_not_found` 且不增加 provider 调用。该用例还直接断言伪造 coordinator、plan、scope、topology 与 foreign session 不能通过 lineage 验证。F1 的原独立复现 `test_review9_graph.py` 现为 1 passed。

相关回归结果：durable interaction host 39 passed、2 subtests；session guard 24 passed、1 skipped、11 subtests；Active bridge 6 passed；graph cold resume 参数组 2 passed、同节点双 interaction 1 passed、跨节点 interaction 1 passed。`py_compile` 与 `git diff --check` 已通过。

本次 Python 修改后已构建新的 Windows sidecar，并只对新 identity 执行 Vault 复测：sidecar `6a62c57cc2d62a3d672cb358a855f49b472262551b8235406b9be712938d8aaf`、wheel `6aea691b70415c53ca4fb3f5cae7266540c259eb60bf9af66610c5074959be31`、manifest `2d7364b4ca56b9e8d9b1f70403fa84bcc0ab9eaeaa4de17a5337584f366e3e60`。严格 Vault chain 的 env/stdin/MCP 均通过；错误摘要的 fault probe 正确返回 `vault_use_indeterminate` 并以退出码 1 失败。尚未安装候选或启用日常 Active；下一步仍是同一 Checkpoint 1 的独立验收。

## 第十一轮独立验收 — 2026-09-05

结论：**NO-GO，Checkpoint 1 未通过**。第十轮修复对相邻节点有效，但合法的非相邻节点推进仍被拒绝；旧格式恢复绑定也会导致相邻节点恢复失败。本轮只增加独立测试和验收文档，未修改生产代码。

### G1 — P1：中间经过无需交互的节点后，第二次提问仍然失败

位置：`unchain_runtime/server/durable_interaction_host.py:3063`，`_graph_step_follows_bound_interaction_source`。

独立复现：collect 提问 → receipt → transport 恢复 collect → summarize 普通节点完成 → write 提问 → `get_pending_interaction`。真实 provider 调用已经到达 collect=2、summarize=1、write=1，guard 已以当前 transport attempt 正确 parked，但 pending 查询仍抛 `session_guard_interaction_attempt_mismatch` / `Parked session guard has no exact durable resume lineage`（409）。

原因：binding 固定指向 collect，write 的直接前驱却是 summarize；代码要求直接前驱必须等于首次恢复 source，因而仍将合法的同 graph 推进误判为外来执行。正式回归只含两个相邻节点，未覆盖该状态。应从可信持久 graph plan/checkpoint 验证完整的祖先关系和已完成推进，不能通过删除身份比较或放宽为任意同 plan 节点来修复。

### G2 — P2：旧格式 binding 被接受恢复，但没有必要的后续关联信息

位置：`unchain_runtime/server/durable_interaction_host.py:1910`，`bind_execution_attempt` 的已有记录分支。

独立复现保留合法 schema v1 的 session/attempt/source/created_at，只移除本轮新增的 `source_graph_guard_lineage`，模拟旧版本已经写下的恢复绑定。用同一个 attempt 重试时，当前代码已读取并验证了尚存的 source graph record，却直接返回旧 binding；第一次恢复和下一个节点提问仍成功，直到第二次 pending 查询才因缺少摘要被拒绝（409）。缺少新增字段的 schema v1 是旧格式状态，不应先允许执行推进、再把会话留在无法恢复的 parked 状态。

需要明确兼容策略：在执行推进前，以可信旧 checkpoint/plan 建立独立且不可变的关联证据，或在入口提供明确且可恢复的版本拒绝流程。不能覆盖原 source binding、删除用户状态或等到下个节点才发现无法恢复。

### 独立证据及通过项

新增 `.release-qa/windows-memory-v2-active/checkpoint-1-review/test_review11_graph.py` 通过 import 复用确定性 SDK fixture；公共 stream/receipt/resume、Agent、SQLite/CAS 与 session guard 均使用生产实现。参数 `adjacent` 是对照组并完成第二次 receipt/resume；`intermediate_node` 与 `legacy_binding` 均失败。结果 **1 passed、2 failed**，JUnit 证据 `review11-graph.xml`。复现命令（工作目录 `unchain_runtime/server`）：

```powershell
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest F:/GIT/PuPu/.release-qa/windows-memory-v2-active/checkpoint-1-review/test_review11_graph.py -q --tb=short
```

正式 graph interaction、durable host、session guard、graph resume context 四文件复跑为 **80 passed、1 skipped、19 subtests passed**。当前实际 EXE 的 SHA-256 与第十轮身份一致；严格 Vault→env/stdin/MCP 为 **3 passed、0 active children**，故障摘要 probe 正确退出 1。旧版本 Electron/Node 通过数没有计入本次复跑。

GitNexus query/context 能提供相关调用点，但索引行号早于本轮改动，作为导航使用；结论由当前源码与真实执行复现支持。`detect-changes --scope all` 返回 26 files、173 symbols、5 processes、medium，无 partial/truncated 标记。G1/G2 均属既有 BC-006 / SEQ-003 / AC-010/011；维持同一 Checkpoint 1，日常 Active 不启用。

## 第十二节：整体修复方案的独立验收 — 2026-09-05

**结论：NO-GO，Checkpoint 1 未通过。** 此次按整体方案 BC-007 / SEQ-007/008 / AC-010/011 和 R01..R08 验收。任意中间节点推进的已测正向、同节点多次交互、相邻节点与删掉新增摘要字段的兼容样例均通过；但恢复事务与快照边界尚未落实，不能把实现状态标为工作包 B/C 完成。

本次只增加两份独立回归测试并更新验收文档，没有修改生产代码、安装候选、启用 Active 或提交 Git。测试运行于 Windows、PuPu `.venv` Python 3.12.12，实际导入 `F:/GIT/unchain/src/unchain`。旧 sidecar/wheel 证据不计入本次新源码的验收。

### H1 — P1：已有只读入口忽略随后提交的 WAL，给已回答交互签发旧证明

位置：`F:/GIT/unchain/src/unchain/persistence/sqlite_v2.py:3496`、`:3518`，`SQLiteContextV2ReadOnlyJournal.__init__` / `_connection`。

新入口以构造时是否存在 `-wal` 文件决定是否永久使用 `immutable=1`。这是正在变化的数据库；构造后的正常写连接可以创建 WAL。读者仍按 immutable 模式打开主文件，忽略已经提交到 WAL 的新事实。

独立复现使用真实 admitted graph、真实 interaction ingress 和第二个 SQLite 连接：创建读者时没有 WAL → 提交交互回答并保留 WAL → 普通 journal 的 lineage proof 正确拒绝 → 只读 journal 的 proof 仍成功，且 high-water 与回答前完全相同。新测试 `F:/GIT/unchain/tests/context_v2/test_graph_readonly_checkpoint_review.py` 在应拒绝处稳定失败，报 `DID NOT RAISE GraphCheckpointError`。

这证明查询会产生陈旧恢复证据；不等同于已经证明 provider 重复执行。Host 还把 proof 化为布尔值，未消费 `journal_high_water` 做写入前重校验，因此不能依赖后续 CAS 自动补上这项保证。需要实现方案原定的一致只读快照和提交前有效性验证；不能仅把 WAL 检查移到下一次打开，保留同样的检查与使用竞态。

### H2 — P1：身份校验拒绝前已经持久保存回答

位置：`unchain_runtime/server/durable_interaction_host.py:3619`、`:3677`，`record_interaction_receipt`。HTTP `/chat/tool/confirmation` 在 `route_chat.py:554` 直接调用这个入口。

公共流程复现：collect 提问 → 回答并恢复 → write 第二次提问 → 将当前 resume context 的 plan 改成外来 plan 并重算合法摘要，保留 canonical plan/journal 和 guard → 提交第二个回答。Host 正确返回 `session_guard_interaction_attempt_mismatch`，但真实 runtime 再读取时已经存在该回答的 receipt。provider 次数和 guard 均未变化，因此失败精确位于“错误请求已写入回答”这一边界。

新测试 `unchain_runtime/server/tests/test_memory_v2_recovery_checkpoint_review.py` 在 `assert after.receipt is None` 失败，整组与单跑均复现。它使用真实 Agent、SQLite、interaction runtime 和 guard，只复用原测试的确定性外部 SDK fixture。回答已保存不代表已消费；本次没有宣称发生 provider 重放。

根因是 `runtime.record_receipt(...)` 先于 `_reconcile_durable_interaction_session_guard(...)`。需要完成方案第三节的只读身份预检、受保护的重校验和提交序列，并覆盖失败重试/崩溃窗口；只在 pending 查询中做校验不能保护可直接调用的 receipt 入口。

### H3 — P2：新增跨仓必需 API 未进入运行库能力准入

位置：`unchain_runtime/server/memory_v2_unchain_active_bridge.py:97`、`:389`；`F:/GIT/unchain/src/unchain/runtime/runtime_protocol.py:245`；`unchain_runtime/server/context_memory_v2_capability.py:313`。

当前 Host 必需导入 `open_existing_execution_journal_readonly` 和 `prove_graph_interaction_lineage`。现场对比证明：Unchain HEAD 没有这两个 API，但 HEAD 与当前工作树的 runtime protocol 文件完全相同；当前 Host 对这份真实 manifest 返回 `ready=True / unchain_runtime_protocol_compatible`。所以能力准入无法区分具备新恢复接口的 runtime 与不具备接口的旧 runtime，缺失将延迟到恢复入口导入时才暴露。

这是 BC-007 已明确要求的协议更新缺口。需用实际 imported runtime 的新 feature/minor 合约表达该能力并严格验证，覆盖旧 manifest 拒绝与新 manifest 接受。这里报告的是源码级已验证的准入缺口，未声称已执行旧 wheel 的安装态恢复。固定 wheel/sidecar pair 仍留给 Checkpoint 2。

### H4 — 已有 R06 回归仍会抛 Windows PermissionError

`test_durable_interaction_host.py::DurableInteractionHostTests::test_cancel_and_resume_binding_concurrency_always_terminalizes_parent` 在整组和定向复跑都失败。增加仅在异常时打印堆栈的观察包装后，第二次运行再次失败：

```text
cancel_chat_execution -> _cancel_pending_source_attempt_result
-> interaction.runtime.cancel_pending -> memory.runtime.save_interaction_session_state
-> session_transcript_media.save_if_revision -> memory.qdrant._write_json_unlocked
-> os.replace(temp_path, path)
PermissionError: [WinError 5] Access is denied
.../memory/sessions/.chat-bind-race-5.json.<id>.tmp
-> .../memory/sessions/chat-bind-race-5.json
```

失败写入位置是 `F:/GIT/unchain/src/unchain/memory/qdrant.py:848`。放慢线程的追踪运行可以通过，所以这是有时序依赖的已观测失败，不是稳定全绿。此路径早已存在，本次不把它归咎于新增 lineage API，也不能从该堆栈认定最初 `production_runs_v1/objects` 权限报错具有相同根因。需要查明读写句柄、锁与文件替换的竞争，并让原 R06 回归稳定通过，不能用忽略异常或测试重试冒充修复。

### 本轮实际结果与证据缺口

| 检查 | 本轮结果 |
|---|---|
| Unchain：既有 graph checkpoint + readonly journal + 新 H1 用例 | **15 passed，1 failed（H1）** |
| PuPu：上一轮声明的 8 文件集合 + 新 H2 用例 | **197 passed，3 failed，1 skipped，23 subtests passed** |
| PuPu 3 个失败 | H2；H4 并发权限错误；`test_cold_interaction_probe_uses_existing_only_journal_read` 主数据库字节变化 |
| H2 定向复跑 | **1 failed**，同一持久写入断言 |
| 原 cold probe + H4 定向复跑 | **1 passed，1 failed**；cold probe 单跑通过，H4 仍失败 |
| H4 异常堆栈观察 | 第一轮通过，第二轮失败，定位到 `os.replace` |
| 两仓 `git diff --check` | 通过；只有 LF/CRLF 提示 |

Cold probe 的整组失败、单跑通过说明当前无写验证也不稳定；尚未区分残留连接的 checkpoint、副作用或 fixture 生命周期，不把原因写成定论。

```powershell
# cwd: F:/GIT/unchain
$env:PYTHONPATH='F:/GIT/unchain/src'
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/context_v2/test_graph_readonly_checkpoint_review.py tests/context_v2/test_graph_interaction_resume_checkpoint.py tests/context_v2/test_sqlite_v2_readonly_journal.py -q --tb=short

# cwd: F:/GIT/PuPu/unchain_runtime/server
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/test_memory_v2_recovery_checkpoint_review.py tests/test_memory_v2_unchain_active_graph_interaction_resume.py tests/test_durable_interaction_host.py tests/test_session_execution_guard.py tests/test_durable_graph_step_resume_context.py tests/test_memory_v2_unchain_active_bridge.py tests/test_memory_v2_takeover_guard.py tests/test_memory_v2_unchain_active_host_event_boundary.py tests/test_unchain_adapter_execution_owner_scope.py -q --tb=short
```

原方案矩阵不可被实施记录中较窄的测试替换：

- R03：删掉当前 producer 的可选摘要可以证明这个格式样例可用，但还不是原方案要求的真实旧 producer fixture 与首次准入/回退序列。
- R05：快照前后相同不等于每个持久边界的 crash injection；本次 graph 测试未启动真正新的 sidecar 进程，不能标为进程冷恢复完成。
- R06：旧 generic CAS 测试不能替代新增 proof → guard → receipt 的竞态测试；H1/H2/H4 已显示对应缺口。
- R07：本轮集合的 normal/graph 结果不能替代实际 subagent × Memory mode 的完整状态证据。
- R08：新旧 runtime 合约的源码级拒绝应在 Checkpoint 1 完成；固定 wheel、sidecar 与安装态的确切组合仍按原计划留在 Checkpoint 2，不新增检查点。

GitNexus 查询定位到 receipt/graph 调用点，但当前索引行号陈旧；impact 对 receipt 因 `staticGated` schema 错误降级为 `UNKNOWN / partial`，对新增 readonly class 返回未收录。没有把空 callers 当作低风险证明；实际 HTTP caller、两仓 API consumer 和 proof 使用由当前源码补证。本轮未修改任何已有函数或类，未提交 Git，也不把旧图结果冒充新源码的完整变更分析。

下一次提交仍使用同一个 Checkpoint 1：先完成原定恢复事务和能力契约，再交付 R01..R08 中 Checkpoint 1 适用项的完整通过/失败/未测清单。无需新增方案或增加人工检查点。

## 第十三节：恢复边界修复执行一 — 2026-09-05

本次修复了第十二节 H1–H4 的直接缺陷，仍为 Checkpoint 1 内的进行中工作，不构成整体放行。

| 问题 | 实现 | 验证 |
|---|---|---|
| H1：旧 SQLite 快照 | 无 WAL 时继续使用不落盘的 immutable 读取；每次读取前后都检查 WAL。WAL 在对象建立后出现时，读取明确失败，不再返回旧 lineage proof。已有 WAL 时使用普通 read-only。 | Unchain graph readonly/checkpoint 集合 16 passed；新增回归覆盖“打开后提交回答并创建 WAL”。 |
| H2：拒绝前写 receipt | 从 reconciliation 中抽出无副作用的 guard/graph lineage 预检；`record_interaction_receipt` 在 `runtime.record_receipt` 前执行它。 | 新公共入口回归通过：外来 plan 被拒绝，receipt、revision、guard 与 provider 次数均不变。 |
| H3：旧 runtime 被误判兼容 | 新增 `durable_interaction.graph_interaction_lineage_preflight_v1`，同步 Unchain producer、PuPu sidecar、Electron rollout、发布 artifact 校验和 Windows contract。 | Python producer/consumer、Node contract/artifact 与 Electron admission 回归全部通过；缺少该特性的 manifest 失败关闭。 |
| H4：Windows replace 竞争 | 在已有会话/lease 锁内，仅对 Windows `PermissionError` 做 5 次、总计 100 ms 的有限退避；持续失败仍上抛。 | Unchain 会话/lease/cancel 69 passed、1 skipped；原 cancel/resume 并发用例连续 5 次通过；Windows 单元测试验证两次瞬时失败后成功替换。 |

本次完整受影响 source 集合：Unchain **104 passed, 1 skipped**；PuPu **226 passed, 1 skipped, 23 subtests passed**；Node contract/artifact **13 passed**；Electron runtime admission **52 passed**。`git diff --check` 通过。Windows package-sidecar 的独立 Node 测试未计入：其非 Windows mock 在真实 Windows 上没有 `pid`，被平台分支拒绝，与本次协议变更无关。

仍必须完成：R03 的真实旧 producer fixture，R05 的逐持久写入点崩溃注入及真正新 sidecar 进程恢复，R06 proof→guard→receipt 的专门竞态矩阵，R07 实际 subagent × Memory mode，及 Checkpoint 2 的固定 artifact/安装态组合。Active 继续保持未启用。

## 第十四节：第一批修复的独立验收 — 2026-09-05

**结论：NO-GO。H1/H2 仍有可复现缺陷；H3 的源码协议准入通过；H4 的有限退避回归通过，但尚未证明真实句柄竞争的根因。** 第十三节的“修复 H1–H4 直接缺陷”不能作为本批完成结论。本轮新增两份测试文件和本文档，未修改生产实现、安装候选或启用 Active。

### I1 — P1：WAL 存在性检查不能证明快照稳定，也不能保证只读零写入

位置：`F:/GIT/unchain/src/unchain/persistence/sqlite_v2.py:3496`、`:3521`、`:3540`。仍在对象创建时固定 `_use_immutable_snapshot`；检查只比较 WAL 文件是否存在，且 `isolation_level=None` 下没有显式读事务。

复现 A：先完成 plan lookup；在 checkpoint scan 的前置检查已取得“不存在”之后，通过真实 canonical ingress 提交回答并保留 WAL；扫描完成后、后置检查前关闭最后一个写连接，SQLite 正常 checkpoint 并清理 WAL。前后检查均为不存在，返回的 proof 却仍认为 interaction 未回答。正常 journal 对同一身份立即拒绝。

`test_completed_wal_cycle_cannot_grant_resolved_interaction_proof` 使用 hook 固定这一并发时序；返回的是实际存在性检查结果，没有伪造文件状态、删除 WAL、改写事件或替换 SQLite。失败是 `A completed WAL cycle still grants a stale proof`。它直接否定“读取期间出现 WAL 就一定失败关闭”的实现保证；不宣称已经发生 provider 重复执行。

复现 B 不需要时序 hook：有正常写连接和 WAL 时创建 readonly 对象 → 写连接关闭，SQLite 清理 WAL → `reader.capture_snapshot()`。固定的普通 `mode=ro` 会新建 `context_v2.sqlite3-wal` 和 `context_v2.sqlite3-shm`。`test_wal_reader_does_not_create_files_after_writer_closes` 的目录无新增断言失败。

这两例位于 `F:/GIT/unchain/tests/context_v2/test_graph_wal_cycle_review.py`，分别覆盖 WAL 的完整出现/消失周期及有→无切换。修复需要回到原方案的一致快照、明确读取副作用契约及提交前验证；不能再把“检查文件存在性”当作数据库并发协议。

### I2 — P1：预检到 receipt 写入间无保护，日志推进后仍落盘再报错

位置：`unchain_runtime/server/durable_interaction_host.py:3639`、`:3644`、`:3701`。

当前调用順序是只读 `_validated_durable_interaction_guard_owner_attempt` → `runtime.record_receipt` → 再次 reconciliation。首次返回值被丢弃，未持有能够覆盖 canonical journal 与 receipt 的执行权，也没有消费 `journal_high_water`。receipt 自身的 session revision CAS 不能发现另一个 SQLite journal 已经变化。

独立复现通过公共 graph stream/receipt/resume 走到第二次提问，在真实预检返回后、receipt 写入前，由实际 `ContextInputIngress.persist(HostResolvedInteractionInput(...))` 提交 canonical 回答。当前请求仍保存另一个回答，随后 reconciliation 才返回 `session_guard_interaction_attempt_mismatch`。

`unchain_runtime/server/tests/test_memory_v2_recovery_race_review.py` 在 `assert after.receipt is None` 失败，整组与定向复跑一致；provider 次数与 guard 均未改变。该测试明确覆盖跨持久边界的 journal 推进窗口，未伪造 checkpoint，也未把它声称为完整 HTTP cancel 序列。修复须完成原方案中的受保护重校验/提交及中断协调，而非仅将一次 helper 调用提前。

### 复验结果和结论范围

| 集合 | 本轮结果 |
|---|---|
| Unchain 上轮 104 项集合 + 两个 WAL 反例 | **104 passed，2 failed，1 skipped** |
| PuPu 上轮 226 项集合 + journal/receipt 竞态反例 | **226 passed，1 failed，1 skipped，23 subtests passed** |
| Node Windows contract / artifact | **13 passed** |
| Electron rollout / startup readiness | **52 passed** |

H3：新特性已进入 producer、sidecar、Electron、发布验收合同；缺少新特性的 manifest 拒绝测试通过。此结论仅适用于源码合同；固定 artifact pair 仍按 Checkpoint 2 验证。

H4：本轮原并发取消/恢复用例通过。当前测试证明有限退避在模拟瞬时失败下可成功，以及现有回归未失败；没有捕获或识别真实阻塞句柄。代码注释的“just-closed reader still owns destination”尚无证据，不应作为已确定根因。暂时缓解与根因闭环分别记录。

旧 cold probe 本轮通过；新增 `gc.collect()` 使 fixture 在比对前完成回收，不能替代 I1 的 WAL 生命周期覆盖。原 R03/R05/R06/R07 缺失项仍按第十三节记录，不能把既有 330 项通过概括为完整状态矩阵通过。

定向复现命令：

```powershell
# cwd: F:/GIT/unchain
$env:PYTHONPATH='F:/GIT/unchain/src'
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/context_v2/test_graph_wal_cycle_review.py -q --tb=short

# cwd: F:/GIT/PuPu/unchain_runtime/server
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/test_memory_v2_recovery_race_review.py -q --tb=short
```

GitNexus 在显式 PuPu repo 下查询了 receipt 流程；索引行号仍落后于当前修改，故仅作导航，结论由当前源码与实际执行支持。本轮没有生产函数修改或提交，没有把陈旧调用图当作完整影响证明。I1/I2 属于原 BC-007 / AC-010/011 / R05/06，沿用同一个 Checkpoint 1，不增加验收范围或检查点。

## 第十五节：命名互斥与 canonical-first 实现验收 — 2026-09-05

**结论：NO-GO。新增三个确定性反例均失败。** 上轮的单快照改动与两条 H2 定向用例有进展，但 P1 的无文件副作用、P2 的原子接受、P3 的 pending 恢复尚未达标。本轮只新增回归测试与本记录，未修改生产实现，未提交、安装或启用 Active。

### J1 — P1：最后一个普通 reader 的关闭没有参与 WAL 生命周期互斥

位置：`F:/GIT/unchain/src/unchain/persistence/sqlite_v2.py:776`、`:3565`。

`_transaction(immediate=False)` 使用 `nullcontext()`，其 connection.close 不参与新命名互斥。只读预检在 `_wal_exists()` 得到 true 后，另一个普通 reader 可关闭最后一个连接，SQLite 正常清理 WAL/SHM。预检仍按刚才的 true 使用 `mode=ro`，随后重新创建 WAL/SHM。

`tests/context_v2/test_graph_readonly_lock_boundary_review.py` 用真实 `store._transaction(immediate=False)` 固定该关闭时序；未伪造 SQLite 返回值、删除文件或调用外部写入者。断言失败明确新增 `context_v2.sqlite3-wal` 与 `context_v2.sqlite3-shm`。该反例证明 AC-015 的无预检文件写入失败，不声称已经造成数据损坏或错误回答。

写事务串行化不能单独覆盖最后连接关闭；`_initialize()` 也未使用该互斥。需按 P0/P1 完整定义连接创建、关闭、初始化和 checkpoint 的参与者，不能把每次重新判断 WAL 存在当作已完成的生命周期协议。

### J2 — P1：第二次 interaction 的中断状态无法经 pending 入口恢复

位置：`unchain_runtime/server/durable_interaction_host.py:3305`、`:3314`。

`record_interaction_receipt` 已允许 resolved 状态重试，但 `get_pending_interaction` 只有看到 host receipt 才传 `allow_resolved=True`。这恰好排除了“canonical resolution 已提交、host receipt 尚未提交”的中断状态。第二个图节点的提问需要经过 successor lineage 验证，此时默认 unresolved proof 拒绝规范日志中的 resolved 记录。

`tests/test_memory_v2_acceptance_boundary_review.py::test_pending_recovers_second_interaction_after_host_receipt_interruption` 通过真实 stream → 第一问 receipt/resume → 第二问到达；在 canonical ingress 后、host receipt 前注入失败，确认 receipt 为空，再丢弃旧 runtime 实例并调用公开 `adapter.get_pending_interaction`。结果抛出 `Parked session guard has no exact durable resume lineage`，无法返回 pending 状态。

该用例是真实持久状态加新 runtime 实例，**不是新 sidecar 进程冷启动证明**。上轮首个 interaction 的直接同答案重提测试仍通过，但不能替代 AC-017 的 pending/restart/reconciliation 路径。修复须使 pending 从 canonical 接受事实识别并协调中断，而不只依赖调用者重新提供答案。

### J3 — P1：canonical ingress 的 artifact 与事件仍分事务，失败后占住未接受的回答

位置：`unchain_runtime/server/durable_interaction_host.py:3692`、`:3705`；`F:/GIT/unchain/src/unchain/context/projector.py:702`；`F:/GIT/unchain/src/unchain/persistence/sqlite_v2.py:2626`、`:2171`。

当前 host 调用的是已有 `ContextInputIngress.persist`：projector 先通过 artifact.put 提交回答内容及固定 operation，再由 sink.append_projected 另开事务写 `interaction.resolved`。因此尚未实现计划 §10.4 的同一 connection 内重校验和接受提交。外层将所有 ingress 异常映射为 `interaction_canonical_conflict / Canonical interaction resolution was not accepted`，不能表达先前已经落盘的回答占位。

`tests/test_memory_v2_acceptance_boundary_review.py::test_failed_canonical_event_does_not_permanently_claim_unaccepted_answer` 在第二问的真实 artifact 提交后、事件提交前中断。第一次请求报告未接受；验证 host receipt 为空、该 interaction 无 resolved 事件。移除故障后提交另一个有效选项，却被先前 artifact 的 operation 占位拒绝：`ContextConflictError: artifact operation payload or target changed`。

这不是“成功接受后应拒绝换答案”的正常幂等行为：系统尚无已提交 acceptance/resolution，且已对用户报告未接受。若要把 artifact 定义成接受点，则需按 BC-009 定义严格接受记录、恢复消费与错误语义，不能静默将旧 artifact 写入当成方案中的原子接受。当前仍需完成问题级接受原语、取消/终态重校验与同一提交点，再接宿主投影；不能仅交换 JSON/SQLite 的先后顺序。

### 证据范围与剩余计划项

- Unchain：上轮 19 项集合加 J1，**19 passed，1 failed**。
- PuPu 定向：上轮两条 race/retry 用例加 J2/J3，**2 passed，2 failed**。
- PuPu 完整复跑：上轮声明的全部 11 个文件加本轮 J2/J3，**228 passed，2 failed，1 skipped，23 subtests passed**（150.08 秒）；与定向失败一致。
- 新增反例的同步动作均断言确实发生；失败来自文件副作用、真实 pending 错误、真实 artifact operation 冲突。
- P0 完整参与者/锁顺序、P2 同事务接受与取消胜负、BC-009 的原 receipt identity/严格结果/能力契约仍未完成；R03/R05/R06/R07 的旧 producer、逐持久边界真实退出重启、跨进程并发和实际 subagent/mode 矩阵不能标为完成。
- 固定 artifact/安装态仍属于 Checkpoint 2。本次不因源码失败额外增加人工检查点。

GitNexus 本次显式绑定 PuPu 查询 receipt；已有索引行号仍旧，仅用于导航。当前调用与事务边界由两仓源码及上述执行结果确认；未将索引查询成功当作完整影响分析或验收通过。

定向复现（使用 PuPu `.venv` Python，Unchain 为当前 sibling source import）：

```powershell
# cwd: F:/GIT/unchain
$env:PYTHONPATH='F:/GIT/unchain/src'
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/context_v2/test_graph_readonly_lock_boundary_review.py -q --tb=short

# cwd: F:/GIT/PuPu/unchain_runtime/server
& 'F:/GIT/PuPu/.venv/Scripts/python.exe' -m pytest tests/test_memory_v2_acceptance_boundary_review.py -q --tb=short
```
