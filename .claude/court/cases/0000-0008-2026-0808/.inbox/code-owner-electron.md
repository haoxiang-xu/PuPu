#### S-XXXX | ASSESSMENT | code-owner-electron → case
- **阶段**: 议案庭审
- **结论**: **有条件可行，且我边界内 0 处必须改动** —— `listSpaces → getTree` 两跳的 channel / handler / preload bridge / main service 全部现成、全部被 `.js`/`.cjs` 双胞胎锁住，本次实跑 4 个相关 suite 全绿（E-C8）。四件被推给我的事逐条落定：**甲 成立且比 `code-owner-runtime` 说的更强**（注入顺序已逐行核实，且被测试锁住，`pupu_legacy` 在 Electron spawn 下结构性不可达 —— E-C1/E-C2/E-C9），**但其 dev 那一行须更正：`npm start → unchain` 不是仓库属性，是本机属性**，取决于一个不入库的 `.local` 文件（E-C2）。**乙 我要直接推翻其前提**：`memoryV2Readiness` **今天已经跨过 IPC 线到达 renderer**，只是不叫这个名字 —— 它在 `unchainAPI.getStatus().memoryV2` 里，四态闭集 + 闭集 reason，preload 零投影（E-C4）；「暴露的代价」在我边界内 **等于零**，卡点在上一层的 `normalizeUnchainStatus` 里，不在我这里。**丙 G5 与新发现全部证实，且答案是「没有，一个都没有」**（E-C3）。**丁 我判可接受，但要报告一条谁都没说的硬事实**：在出厂默认态下 `contextV2Bridge.getStatus()` **是 reject 不是 resolve**，8 字段 allowlist 根本到不了（E-C7）—— 这使 `code-owner-settings` 的 F2「唯一没有绕行方案」**被部分证伪**，绕行方案存在且更强。**戊 前案 `0000-0003-2026-0807#S-0010` 的「stable code 端到端不丢」在本案链路上仍然成立，但有一个前置例外**：`ensureMisoReady` 抛的是无码错误，而它恰好是 sidecar 未就绪时 `getTree` 的实际出口（E-C5/E-C6）。**Q2 我部分承担并预先登记一条反对。**
- **依据**: E-0006, E-0004, E-C1, E-C2, E-C3, E-C4, E-C5, E-C6, E-C7, E-C8, E-C9, E-C10, E-A4, E-A5, E-B2, E-B4, E-B6, 0000-0003-2026-0807#S-0010, 0000-0003-2026-0807#S-0024
- **不确定性**:

  **一 · 我实跑到哪里为止**

  我 **未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求**。我的运行时观察只有两项：(1) 本仓 electron 测试套件（jest，`--env=node`，全 mock，E-C8）；(2) 一段把 `service.js:120` 的正则逐字复制出来的 node 脚本（E-C3）。**「代码这样写」与「运行起来这样跑」之间那一段，我给不出**，凡涉及真实进程行为的一律标推断。

  **二 · 我引用了两个不在我边界内的文件，并且它们承重**

  为回答丁，我读了 `unchain_runtime/server/route_memory_v2.py` 与 `memory_v2_runtime.py`（E-C7）。**这两处的权威解释归 `code-owner-runtime`**，我只主张「代码里的分支长这样」，且我的静态读结论与其 E-A4 实跑结果 **一致**（503 `context_v2_store_disabled`），这构成一次独立交叉验证 —— 但不构成我对其边界的主张。

  **三 · 我自己的一条记忆被本次核证推翻，如实登记**

  我的持久记忆里写着「默认构建下每一次 Context V2 读都返同一个 404 `context_v2_not_found`」。**在 `b2385d5d` 上这是错的**，实际是 503 `context_v2_store_disabled`（E-C7）。以当前代码为准，我已就地更正记忆。**本庭不应引用我此前任何以 404 为据的口径。**

  **四 · G2 继承的空洞**

  本机 V2 store `entries=0`。我这一层从不解析 tree 载荷（`getContextV2Tree` 是原样透传），所以「有数据时载荷多大、IPC 序列化撑不撑得住」**结构上无法取证**，任何量级判断是推断。**但我要提示一条本层特有的风险**：`getTree` 是 CONTEXT_V2 十八个方法里 **唯一没有 limit / page 参数** 的读方法（E-C11）。它的返回体大小由 store 内容单方面决定，本层不设上界。

- **请求/下一步**:
  1. **请本庭把「甲」按我的结论记入更正，并把 `code-owner-runtime` 表格里的 dev 那一行改为条件式** —— 「`npm start` → `unchain`」成立的前提是 `.local/build_feature_flags.snapshot.json` 存在且 `enable_memory_v2: true`。该文件 **不入库**（E-C2），新克隆与 CI 上它不存在 → 落 `off`。**这不是细节，是验收可复现性问题。**
  2. **请本庭把 `code-owner-settings` 的 F2 记为「已被本边界证据部分证伪」**，并把该条重新指向 `src/SERVICEs/api.shared.js:330-343 normalizeUnchainStatus`（`code-owner-shared-arteries` 边界，本案第 4 位必到者）。**真正的阻断点在那里，不在 `getStatus` 的许可上。**
  3. **请 `code-owner-shared-arteries` 就一件事表态**：`normalizeUnchainStatus` 今天丢弃 `memoryV2`（与 `contract`）—— 放行它、或新开一个等价 facade 方法，是否可接受？这是「四态状态源」从「已存在」变成「可消费」的 **唯一** 剩余动作。
  4. **不请求** 在本阶段解决 `ownerChatId` 的语义正确性 —— 我这一层只有语法门，没有身份门，且我 **不主张现在加**（见丙与 FE3）。
  5. **登记一条第三层重判的触发条件**（不代 `expert-security` 表态）：S-0003 的不传唤判定建立在「本案不增删改任何 channel / bridge 面」上。**该前提今天成立**（我边界内 0 处必须改动）。**一旦方案要求在任何 CONTEXT_V2 方法上增删改字段或参数 —— 包括给 `getStatus` 加一个「为什么关」字段 —— 该前提即被推翻，届时我本人请求补传。**

- **评估结论**:

  ### 甲 · `get_tree` 在出厂 PuPu 里一次也不会被执行 —— **成立。权威结论如下，并附一条对 `code-owner-runtime` 的更正**

  `code-owner-runtime` 自陈未验证的那一段（`service.js:4745-4810` 的覆盖顺序），我逐行核实了。**它比它自己以为的更硬**：

  **(1) 注入是无条件的，且写在 `process.env` 展开之后。**

  ```js
  // electron/main/services/unchain/service.js
  4745:  const sidecarEnvironment = { ...process.env };
  4758:  unchainProcess = spawn(entrypoint.command, entrypoint.args, {
  4762:    env: {
  4763:      ...sidecarEnvironment,                              // ← 环境先铺开
  ...
  4805:      [MEMORY_V2_ENV_KEYS.storeOwner]:
  4806:        memoryV2RuntimeConfig.sidecarEnvironment[
  4807:          MEMORY_V2_ENV_KEYS.storeOwner                   // ← 再无条件覆写
  4808:        ],
  ```

  五个 `PUPU_MEMORY_V2_*` / `PUPU_CONTEXT_V2_*` 键 **全部** 在 `:4789-4808` 无条件写入，位置在 `:4763` 的展开之后。**开发者 shell 里的同名变量一定被覆写**（E-C1）。

  **(2) 取值域二元，无第三值。** `memory_v2_rollout.js:150` 一行 `resolvedRolloutMode === "off" ? "off" : "unchain"`，是 `PUPU_CONTEXT_V2_STORE_OWNER` 在整个 Electron 侧的唯一产地（产品代码全仓仅 2 处出现该键：该 js 与 sidecar 侧的 py，E-C2）。

  **(3) 只有一个 spawn 点，且没有「附着到外部 sidecar」的路径。** `electron/main/` 下 sidecar 只在 `service.js:4758` 被 spawn（另两处 spawn 分别是 vault sink worker 与 `ollama serve`）；`startMiso` 的守卫是 `if (unchainProcess || unchainStatus === "starting") return`，没有任何 attach / external / skipSpawn 分支（E-C1）。

  **(4) 配置在进程生命周期内不可漂移。** `memoryV2RuntimeConfig` 是 `:1035` 的一个 `const`，`Object.freeze` 过，只算一次。

  **(5) 而且这一切被双胞胎测试锁住。** `electron/tests/main/memory_v2_startup_readiness.test.cjs` 直接断言 `spawn.mock.calls[0][2].env`：canary/packaged 与 win32 两例断言 `PUPU_CONTEXT_V2_STORE_OWNER: "unchain"`，off 例断言 `"off"`（E-C9）。**全仓测试里 `pupu_legacy` 作为该 env 取值零出现。**

  > **权威结论：`PUPU_CONTEXT_V2_STORE_OWNER` 在任何由 Electron 启动的 sidecar 里只可能是 `off` 或 `unchain`。Python 侧「env 缺失回退 `pupu_legacy`」（`memory_v2_store_boundary.py:96`）在 Electron 下结构性不可达。E-0006 锚定的 `memory_v2_store.py:7408 get_tree` 不是任何真实用户配置下被执行的实现。本庭「已知事实 2」应记更正。**

  **对 `code-owner-runtime` 的一条更正（方向：削弱其 dev 行的普适性）**

  它的表格写「`npm start` → `unchain`（package.json 设了两个 env）」。**env 设了不等于生效。** `buildRolloutConfig:135-140` 是这样的：

  ```js
  const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";
  const configuredMode = featureEnabled ? normalizeMode(readValue(...), "off") : "off";
  ```

  `featureEnabled` **不来自 env**，来自快照文件的 `enable_memory_v2`：打包态读 `build/build_feature_flags.json`（`false`，冻结），**非打包态读 `.local/build_feature_flags.snapshot.json`**（`memory_v2_rollout.js:216-218`）。**该文件不入库。** 本机上它是 `{"enable_memory_v2": true}` 且无 `_pupu_memory_v2_release` 块 → featureEnabled=true → 两个 env 被采纳 → `all` → `unchain`（E-C2）。**在一台没有该文件的机器上（新克隆 / CI），`npm start` 得到的是 `off`。**

  **净效果**：真实配置不是三种，是 **四种**，且第三种是本机独有的：

  | 配置 | featureEnabled 来源 | store owner | `get_tree` 实现 |
  |---|---|---|---|
  | 出厂安装包 | `build/build_feature_flags.json` = false | `off` | 不执行（503） |
  | `npm start` **且本机有 `.local` 快照 true** | `.local` 快照 | `unchain` | unchain read adapter |
  | `npm start` **无 `.local` 快照**（新克隆 / CI） | 无文件 → `{}` → false | `off` | 不执行（503） |
  | win32 + 上述第二行 | 同上，但 ceiling 压回 `shadow` | **仍是 `unchain`** | unchain read adapter |

  第四行值得单列：`constrainMemoryV2ConfigForPlatform:326-332` 只把 ceiling 压回 `shadow`，**storeOwner 仍是 `unchain`**（测试断言 `PUPU_CONTEXT_V2_STORE_OWNER: "unchain"` + `status: "degraded"` + `reason: "vault_worker_containment_unavailable"`，E-C9）。**Windows 上 store owner 是 unchain 但 readiness 恒 degraded** —— 对本案的意义见戊。

  ### 乙 · `memoryV2Readiness` —— **它不是「只差一段暴露」，它已经暴露了。`code-owner-runtime` 的 grep 是名字层面的假阴性**

  它 grep 的是标识符 `memoryV2Readiness`。**该值在跨层时改了名。** 完整链路（E-C4，我逐段读过，无一段推断）：

  ```
  service.js:1068           let memoryV2Readiness = initialMemoryV2Readiness()
  service.js:1645-1663      getMisoStatusPayload() → { …, memoryV2: { …15 字段… } }
  register_handlers.js:236  ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () => getMisoStatusPayload())
  preload/channels.js:17    CHANNELS.UNCHAIN.GET_STATUS 在 invoke 白名单里
  preload/bridges/unchain_bridge.js:4
                            getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)   ← 裸透传，零投影
  window.unchainAPI.getStatus()            ← renderer 今天就能拿到 memoryV2 全部 15 字段
  ```

  **我这一层没有任何一处投影、裁剪或过滤它。**

  **它是不是 D7 说的那个「多方需要、今天没有 owner」的构件在 main 侧的既有半成品？—— 是，而且比 D7 假设的完整得多。它已经是一个四态机。**

  - `status` 是 **闭集四值**：`off` | `pending` | `degraded` | `ready`（`:1039-1055` 产 off/pending/degraded，`:1874-1878` 与 `:1969-1973` 产 ready/degraded）
  - `reason` 是 **闭集**：`validateMemoryV2Status` 产 9 个失败码 + `""`（E-C2 逐条），service 侧另加 `rollout_off` / `not_verified` / `context_v2_readiness_unavailable` / `vault_worker_containment_unavailable` / 3 个 snapshot 码 = **共 16 个取值，可枚举**
  - 关键的是 `configured` 与 `ready` **两个布尔把「配置为关」与「配置为开但没就绪」分开了** —— 这正是 `contextV2Bridge.getStatus()` 做不到的那一刀（见丁）
  - 写入点唯一：只有 `verifyContextV2Readiness`（:1852）、`getContextV2Status`（:1960）、`startMiso` 重置（:4706）三处，全在同一个文件同一个闭包里。**不存在第二个产地。**

  **暴露它的代价是什么？—— 在我边界内是零，因为已经暴露完了。剩下的代价全在我边界之外，一共两笔：**

  **(1) 一笔在上一层，不是我的。** `src/SERVICEs/api.shared.js:330-343` 的 `normalizeUnchainStatus` 把状态重建成 6 字段 `{status, ready, url, reason, pid, port}`，**丢掉 `memoryV2` 与 `contract`**。所以经 `api.unchain.getStatus()` 的消费者（如 `src/PAGEs/chat/chat.js:578`）看不到它，而直接调 `window.unchainAPI.getStatus()` 的能看到。**这是 `code-owner-shared-arteries` 的边界，约 6 行的改动，不是新建构件。**

  **(2) 一笔是我的，且我要主动认领。** 该载荷今天是 **部分锁定** 的：`memory_v2_startup_readiness.test.cjs` 用 `toMatchObject` 在 7 处断言了 `memoryV2` 的一个子集（`configured` / `ready` / `status` / `reason` / `rolloutMode` / 三个 fingerprint），**但没有任何测试锁它的完整字段集，也没有任何测试断言「不得有额外字段」**（E-C9）。它今天是一个诊断载荷，15 个字段里 4 个是 sha256 指纹。**一旦它升为产品状态契约，加一条 allowlist 形状的双胞胎契约测试就是我的活**，位置：`electron/tests/main/memory_v2_startup_readiness.test.cjs` + 其 `.js` 孪生。这是我在本案里 **唯一** 会主动认领的新工作，量级是一个 test case。

  > **一句话**：D7 描述的那个洞，在 main 侧不是「没人造」，是「造好了、跨过 IPC 了、被上一层的一个 normalizer 丢掉了、没人消费」。**把它从「无主构件」重述为「一个已存在契约的归属与放行决定」，问题的量级差一个数量级。**

  ### 丙 · `ownerChatId` 的两道门

  **(1) G5 —— 缺参行为，已实跑确认（E-C3）**

  `requireContextV2OwnerChatId(undefined | null | "" | "   " | 123 | {})` **一律同步抛出**，早于任何 HTTP：

  ```
  code    = "context_v2_invalid_request"
  message = "[context_v2_invalid_request] ownerChatId is invalid"
  ```

  抛点在 `getContextV2Tree` 的第一行（`service.js:2108`），**请求不发出**。renderer 侧 `parseContextV2ErrorCode`（`src/SERVICEs/bridges/context_v2_bridge.js:57,77-82`）能从 message 里取回该码。这一「fail-closed 且不发请求」的性质被测试锁住：`context_v2_service.test.cjs:1417-1429` 断言 `listContextV2Spaces` / `decideContextV2Candidate` 在未就绪时 reject 且 `expect(fetchImpl).not.toHaveBeenCalled()`。

  **一条本庭该记的副作用**：`context_v2_invalid_request` 这个码 **主进程本地校验与服务端 400 共用**（E-A4 c 行 = 同码）。收端只看 code 分不清「我传错了参数」与「服务端认为参数非法」。message 不同（本地是 `ownerChatId is invalid`，服务端经 `contextV2Request` 重包后是 `context v2 request failed`），但依 `0000-0003-2026-0807#S-0010` 的约定，收端只该消费 code。**这是一处已存在的码碰撞。**

  **(2) 新发现 —— `code-owner-settings` E-B2 完全成立，我复跑确认（E-C3）**

  ```
  "chat-1772850432671-abc"   → true
  "character_foo__dm__main"  → true          ← 语义错误，语法合法
  "character_foo__dm__main " → true（trim 后）
  ```

  **(3) main 层今天有没有任何机制能挡住「用 character session id 冒充 ownerChatId」？—— 没有，一个都没有。**

  `service.js:118-120` 的注释逐字写明了这道门的性质：*"Mirrors memory_v2_store._OWNER_ID_RE / _ID_RE. Main re-validates rather than trusting the sidecar to reject: a malformed id must never reach the wire."* —— **它是一道语法门，防的是「畸形 id 上线」，不是「错误的人被冒充」。** 整个 Context V2 路径上没有任何 chat 存在性校验、没有任何 owner 归属校验。

  **能不能建一道？技术上能，且材料就在 main 里** —— `electron/main/services/chat_storage/service.js` 持有权威的 chat id 全集（`:357` `SELECT id FROM chats`，`:459` `SELECT id, meta FROM chats`，E-C10）。**但我不主张现在建**，理由两条：(a) 它是 main 内两个服务之间的新耦合 + 新行为，不是接线，须单独走 case；(b) 它会在 main 里造一个 chat 存在性 oracle，而本层现有的设计取向恰恰相反（`getStatus` 刻意 count-free 就是同一条理由）。

  > **对 F3 的直接回答**：`code-owner-settings` 的可证伪条件 F3 **在我这一层拿不到任何救济**。「静默错主」能否被检测，**100% 取决于 `code-owner-runtime` 对「从未存在过的 owner」的答复**。若服务端也返 200 空树，则该错误在整条链路上不可检测 —— 我这一层不会、也不该在方案阶段临时补一道身份门去救它。

  ### 丁 · Inspector 成为 `getStatus` 的第一个 renderer 消费者 —— **在我边界内可接受；但 8 字段不够，理由和本庭想的不一样**

  **(1) 可接受，四条理由：**

  - **不改任何面。** channel（`shared/channels.js:146`）、preload 白名单（`preload/channels.js:109`）、preload 方法（`preload/bridges/context_v2_bridge.js:42`）、main handler、main 实现 —— 全部现成，且被 `ipc_channels.test.cjs` 与 `api_contract.test.cjs` 双胞胎锁住（E-C9）。**新增一个消费者是零改动。**
  - **它是十八个方法里攻击面最小的一个**：`getStatus = () => ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_STATUS)` —— **零参数**。新增消费者 **不引入任何新的 renderer 可控输入**到主进程。
  - **载荷是 allowlist 重建的**（`service.js:1976-1985`），且 count-free 是成文不变量（`:1942-1944`）。**消费者数量不改变载荷。**
  - 依 S-0003，`expert-security` 的不传唤判定建立在「不增删改 channel / bridge 面」上，**该前提在此成立**。

  **(2) 但 8 字段 allowlist 不足以表达「V2 未启用」—— 不是字段选得不对，是那条路在最需要它的那一态上根本走不通。**

  `getContextV2Status`（`service.js:1945-1986`）是一个 **三岔口**：

  | 态 | 走哪一支 | renderer 看到什么 |
  |---|---|---|
  | sidecar 未就绪（`unchainStatus !== "ready" \|\| !unchainPort`） | `:1946-1957` **合成负值，不联系 sidecar** | resolve `{available:false, rolloutMode:"off", featureCeiling:"off", schemaVersion:0, …}` |
  | sidecar 就绪 + `store_owner=off`（**出厂默认**） | 真发请求 → 服务端 503 | **reject**，code `context_v2_store_disabled` |
  | sidecar 就绪 + owner=unchain + 一切正常 | 真发请求 → 200 | resolve 8 字段，`available` 再与 `validateMemoryV2Status` 取与（`:1974`） |

  第二行是我静态追出来、并与 `code-owner-runtime` 的 E-A4 实跑独立吻合的（E-C7）：`route_memory_v2.py:982-1006` 的 `context_v2_status` **不 catch**，`_status_for_store_owner:798-799` 在 owner≠unchain 时直调 `_runtime()`，而 `memory_v2_runtime.py:718-734` 对 `off` 必抛 503 `context_v2_store_disabled`。到我这层 `contextV2Request:1931-1938` 保码重包 → renderer 拿到的是一个 **rejected promise**。

  > **净效果两条，都必须进记录**：
  > **(a) 在出厂默认态下，`contextV2Bridge.getStatus()` 不会返回 `available:false` —— 它抛。** 8 字段 allowlist 在那一态下 **一次也不会被构造出来**。要用它判「未启用」，就得 catch 一个 503 再匹配错误码字符串。**这正是 `code-owner-runtime` 在服务端说的「把状态契约建在错误消息上」，它在我这一层也成立。**
  > **(b) 唯一会 resolve 出「看起来像未启用」的那一支，混淆了另外一件事**：sidecar 崩了 / 还在启动 → 同样是 `available:false, rolloutMode:"off", featureCeiling:"off"`。**8 个字段里没有任何一个能把「配置为关」与「后端没起来」分开。**

  **(3) 因此我要直接对 `code-owner-settings` 的 F2 提出部分证伪。**

  F2 称「`getStatus` 被否 → Q4 塌回不可判别 → 不可行，且这是唯一没有绕行方案的一条」。**绕行方案存在，而且比 `getStatus` 更强**：`window.unchainAPI.getStatus().memoryV2`（乙）。对比：

  | | `contextV2Bridge.getStatus()` | `unchainAPI.getStatus().memoryV2` |
  |---|---|---|
  | 出厂默认态（off） | **reject**（503 → 错误码） | **resolve**，`{configured:false, ready:false, status:"off", reason:"rollout_off"}` |
  | sidecar 未就绪 | resolve，与 off **同形** | resolve，`status:"pending"` 或 `"degraded"` + reason，**与 off 可分** |
  | 是否联系 sidecar | 是（可失败、可超时） | **否，纯主进程本地读，永不 reject** |
  | 状态词汇 | 8 个布尔/字符串，无状态枚举 | **四值枚举 + 16 值闭集 reason** |
  | 谁挡着 | 没人挡（今天就能调） | `normalizeUnchainStatus` 丢弃（shared-arteries） |

  **所以 N2「未启用判定必须来自 `contextV2Bridge.getStatus()`」我建议修正为**：主判据取 `memoryV2`（main 权威、不可失败、四态互斥），`contextV2Bridge.getStatus()` 作为 store 侧的交叉验证而非唯一来源。**但这是落位问题，归 Q2 / `expert-architecture`，我只提供两者的技术差异，不代其定。**

  **(4) 这需不需要一次安全判断？—— 就本案当前范围：不需要，是我边界内的工程判断。但我把触发线画出来。**

  「新增一个零参数、已锁契约、count-free 读方法的消费者」是工程判断，我做了，判可接受。**下列任一出现，即转为安全判断，我请求本庭第三层重判并补传 `expert-security`**：

  - 要求在 `getStatus` 或任何 CONTEXT_V2 方法上 **增加字段或参数**（含「为什么关」「有没有数据」「计数」）
  - 要求把 `memoryV2` 的 15 字段（含 4 个 sha256 指纹与 `platformActiveBlocked`）**原样** 作为产品状态源送进 renderer 组件 —— 这是把一个诊断面变成产品面，投影范围该被审一次
  - 要求 main 侧新增任何形式的 **存在性校验**（丙 (3)），因为那等于新建一个 oracle

  ### 戊 · Q1 我端的管线完整性 —— **两跳完整可用，错误码保真，但有一个前置例外**

  **(1) 两跳全段复核（不重取，只核 E-0006 的行号在 `b2385d5d` 上是否仍然对）—— 全部对，且我补齐了 `listSpaces` 那一跳的对应锚点：**

  | 段 | `listSpaces` | `getTree` |
  |---|---|---|
  | channel 常量 | `electron/shared/channels.js:151` | `:152` |
  | preload 白名单 | `electron/preload/channels.js:114` | `:115` |
  | preload 方法 | `preload/bridges/context_v2_bridge.js:81-84` | `:86-90` |
  | main handler 绑定 | `main/ipc/register_handlers.js:29,641` | `:30,642` |
  | main 实现 | `services/unchain/service.js:2098-2105` | `:2108-2116` |

  `getTree` 的入参：**`ownerChatId` 与 `spaceId` 都是必需**（`:2108-2109`），query **只带 `owner_chat_id`**，不转发 `allow_long_term` / `namespace`。**证实 `code-owner-runtime` 的两跳判断与 `code-owner-settings` 的 E-B4，逐字无出入。** preload 侧 `getTree` 是字段逐个重建的 `{ownerChatId, spaceId}`，多余键上不了车（`api_contract.test.cjs:254-265` 用 `listSpaces({ownerChatId, scope:"user"})` 断言只有 `{ownerChatId}` 过线）。

  **(2) 本次实跑：4 个相关 suite 全绿**（E-C8）。`context_v2_service.test.cjs:498-527` 的 `"space, tree and entry reads are owner-scoped and path-validated"` 逐字断言了 `…/spaces/space-1/tree?owner_chat_id=chat-1`。

  **(3) 七个服务端错误码穿过我这一层：code 保真，message 丢弃。** 机制（E-C5）：

  ```
  服务端 503 {"error":{"code":"context_v2_store_disabled",…}}
    → readJsonResponse:1740-1771   解析 body，把 error.code 挂到 error.code 上
    → contextV2Request:1931-1938   保住 code，重包为 createContextV2Error(code, "context v2 request failed")
    → createContextV2Error:186-190 message = `[${code}] ${message}`，同时保留 .code 给 main 内调用方
    → ipcMain.handle 抛出（Electron 剥掉 .code，只序列化 message）
    → src/SERVICEs/bridges/context_v2_bridge.js:57  /\[([a-z0-9_]+)\]\s/  取回 code
  ```

  七个码 `context_v2_store_disabled` / `context_v2_invalid_request` / `context_v2_not_found` / `context_v2_store_owner_invalid` / `context_v2_unchain_read_unavailable` / `context_v2_unavailable` / `context_v2_owned_by_unchain` **全部匹配 `[a-z0-9_]+`，一个都不会漏解析**。上游 message（可能含 sqlite 绝对路径 / Traceback）被 `:1938` 换成静态串 —— **这是刻意的，`:1932-1933` 有成文理由**。

  > **对本庭的直接回答：不被压平。`0000-0003-2026-0807#S-0010` 归档的「CONTEXT_V2 路上 stable code 端到端不丢」在本案链路上仍然成立。**

  **(4) 但我要给它补两条它没覆盖的边界，其中第一条恰好落在本案最关心的那一态附近：**

  **(a) `ensureMisoReady` 抛的是无码错误。** `contextV2Request` 的第一行就是 `ensureMisoReady()`（`:1893`），而它抛的是

  ```js
  // service.js:1666-1674
  throw new Error(`Miso service is not ready (status=${unchainStatus}${reasonSuffix})`);
  ```

  **没有 `[code] ` 前缀，没有 `.code`。** `parseContextV2ErrorCode` 对它返回 `null`。这不是理论 —— 它被测试逐字锁住：`context_v2_service.test.cjs:1417-1429` 断言 `rejects.toThrow(/not ready/i)`。**即：sidecar 未就绪时 `getTree` 的实际出口是一个收端无法分支的自由格式串**，而「sidecar 未就绪」正是 Inspector 开在冷启动早期时最可能撞上的一态。

  **(b) `context_v2_invalid_request` 主进程本地与服务端同码**（见丙 (1)）。

  **(5) 完整出口清单 —— 一次 `getTree` 调用，renderer 侧有七个互斥出口，其中一个无码：**

  | # | 触发 | renderer 拿到 |
  |---|---|---|
  | 1 | bridge 缺席 | reject `context_v2_unavailable`（renderer 侧自产，`src/SERVICEs/bridges/context_v2_bridge.js:69-75`） |
  | 2 | **sidecar 未就绪** | **reject，无码**，message `Miso service is not ready (status=…, reason=…)` |
  | 3 | `effectiveMode !== "off"` 且 readiness ≠ ready | reject `context_v2_readiness_failed`（`:1897-1906`；**注意：`off` 态下这道门不生效**，请求照发） |
  | 4 | 本地参数校验失败 | reject `context_v2_invalid_request`（不发请求） |
  | 5 | fetch 抛 | reject `context_v2_unreachable` |
  | 6 | 服务端非 2xx | reject，**服务端 code 原样**（7 个之一） |
  | 7 | 200 | resolve，**载荷原样透传，本层不解析、不投影、不封顶** |

  **第 3 行有一条反直觉的推论，方案庭审务必带上**：出厂默认（`effectiveMode === "off"`）时 readiness 门 **不拦**，请求会真的发到 sidecar 再 503 回来。**「本地立即失败」与「远程往返后失败」在延迟与可观测性上完全不同**，别按前者设计。而在 win32 + 开启态下，readiness 恒 `degraded`（甲 (5)），**第 3 行会拦下每一次 `getTree`** —— Windows 上 tree view 结构性拿不到数据，这与 `code-owner-runtime` 的可证伪条件 1 是两回事，须并列记录。

  ### Q2（G1）· 强制表态 —— **部分承担；我认领一件、拒绝一件、预先反对一件**

  **不接受「与我无关」，我不说这句话。**

  **(1) 本案会不会要求我的边界承担今天不属于我的判定职责？—— 会一半，我逐条分开：**

  | 职责 | 今天在哪 | 本案推不推给我 | 我的立场 |
  |---|---|---|---|
  | **计算** 四态与 reason，并跨 IPC 输出 | **已经是我的，且已完成**（`service.js:1039-1055,1645-1663,1852-1887`） | 不推 —— 已有 | **承接，零新工作** |
  | 给该载荷 **加契约测试**（allowlist 形状 + 禁额外字段） | 无人（今天只有 `toMatchObject` 部分断言） | **会推给我** | **我主动认领。** 落 `memory_v2_startup_readiness.test.cjs` + `.js` 孪生 |
  | **定义** 四态的用户可见语义（哪一态显示什么） | 无人 | 不该推给我 | **不落在本边界**（且属方案庭审） |
  | **决定** 谁是权威（`memoryV2` vs `contextV2Bridge.getStatus()` vs `enable_memory_v2`） | 无人 | 会试图推 | **不承接。** 归 `expert-architecture` 出意见 + CEO 裁定 |
  | 决定 `normalizeUnchainStatus` 是否放行 `memoryV2` | `code-owner-shared-arteries` | 不落我 | **不落在本边界**，指名 `code-owner-shared-arteries` |
  | 挡住「character session id 冒充 ownerChatId」 | 无人 | **会试图推给我**（因为门在我这里） | **拒绝在本案内承接**（丙 (3)、FE3）。门在我这里，但它是语法门；要建身份门须单独走 case |

  **(2) 我预先登记一条反对（请本庭记入强制回应清单）：**

  > **我反对任何「在 `contextV2Bridge.getStatus()` 上增加字段以表达未启用/有无数据」的方案。**
  > 理由不是 count-free（那是 `code-owner-settings` 的 N3，我同意但那是另一条）：**理由是同样的信息在 `getMisoStatusPayload().memoryV2` 里已经有了，而且形式更好。** 在一个零参数、count-free、已锁契约的安全面上加字段，去表达一个隔壁已经算好并已跨过 IPC 的状态，是在制造第二个权威 —— **正是 D7 想避免的那件事本身。**

  **(3) G1 是否构成前置阻塞？—— 对可行性不阻塞；对「谁是权威」阻塞；但本案有一条比等裁定便宜得多的出路。**

  我上面全部结论是 `b2385d5d` 上的代码事实与测试事实，**不依赖前案任何裁定**。所以本案可以在 `0000-0003-2026-0807` 裁定前完成议案庭审。

  **出路**：本案可以显式声明 **不新增任何状态源，只消费已存在的 `memoryV2`**。这样 Q0 无论怎么裁，本案都不返工 —— 因为本案没造新东西。**这与 `code-owner-settings` 的硬附加条件（方案庭审首项必须先定四态 owner）不冲突，而是给了它一个更小的靶子**：要指派的不是「建一个状态源」，是「确认 `getMisoStatusPayload().memoryV2` 升为产品状态契约，并把 `normalizeUnchainStatus` 的放行决定指给 `code-owner-shared-arteries`」。**从「建构件」降为「认领一个已存在的契约 + 放行一个字段」。**

  ### 丙（框定第三条）· 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

  **任一条成立即翻：**

  - **FE1 · 若议案要求 tree view 在出厂默认配置下显示真实 V2 数据。** 不可行。`build/build_feature_flags.json` 是 `enable_memory_v2: false` + 冻结的 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`，而打包态改它要重算 `snapshot_fingerprint` 与 `rollout_fingerprint` 两个 sha256 并通过 `memory_v2_rollout.js:241-279` 的双指纹门（E-C2）。**那是 rollout 议案，不是「加一个 view」。** 与 `code-owner-runtime` 的条件 1 同向，我这一层的证据是它的机械原因。
  - **FE2 · 若方案要求在任何 CONTEXT_V2 channel / bridge 方法上增删改字段或参数。** 我这一层从「零改动」变成「改公共动脉」，须走 Full track + `.js`/`.cjs` 双胞胎同步，**并推翻 S-0003 对 `expert-security` 的不传唤判定**。届时我请求补传，且不代其表态。
  - **FE3 · 若方案把「main 侧挡住 character session id 冒充」写成实施细节。** 判不可行。那是新行为、新耦合、新 oracle，须单独走 case（丙 (3)）。
  - **FE4 · 若 `code-owner-shared-arteries` 判定 `normalizeUnchainStatus` 不放行 `memoryV2` 且不新增等价方法。** 我在乙/丁给出的「零代价四态状态源」结论翻转，判据退回 `contextV2Bridge.getStatus()` 的三岔口，本案必须显式接受「在 off 态靠 catch 错误码判态」这条技术债。**不因此不可行，但要 CEO 显式接受，不能默默继承。**
  - **FE5 · 若「`npm start` 下 store owner = unchain」被写进方案或验收前提而不声明环境。** 翻转 —— 不是不可行，是 **不可复现**。该结论依赖不入库、每台机器不同的 `.local/build_feature_flags.snapshot.json`（E-C2）。**验收步骤必须显式声明该文件内容与 `app.isPackaged`，否则验收结果无意义。**
  - **FE6 · 若 `memoryV2` 载荷成为产品状态源而不加双胞胎契约测试。** 我判结构上不可接受。它今天是 15 字段自由形状（4 个 sha256 指纹），只有 `toMatchObject` 的部分断言（E-C9）。**这条我自己认领，翻转条件是「不让我做」。**
  - **FE7 · 若方案要求 tree view 在 Windows 上与 macOS 同等可用。** 不可行。win32 下 ceiling 被压回 `shadow`、readiness 恒 `degraded`、`contextV2Request` 的 readiness 门拦下每一次 `getTree`（甲 (5) + 戊 (5) 第 3 行）。**Windows 上 tree view 只能显示未启用/不可用态**，这与出厂 flag 是两个独立原因，堵住一个不解决另一个。

  **不会被推翻的（可作为方案庭审在我这一层的地基）**：两跳 channel/handler/preload/main 全段存在且双胞胎锁定；`getTree` 必需 `{ownerChatId, spaceId}` 且 query 只带 `owner_chat_id`；缺参同步抛 `context_v2_invalid_request` 且不发请求；服务端七码经我这层 **code 保真 message 丢弃**；`ensureMisoReady` 那一支 **无码**；`PUPU_CONTEXT_V2_STORE_OWNER` 取值二元、无条件覆写、单一 spawn 点。

  ### 留待方案庭审（自行标注，本阶段不作为结论）

  按 S-0001 的范围纪律登记，不主张：

  - **七个出口收敛成几个用户可见状态**（戊 (5)）—— 收敛比例与措辞是设计。
  - **是否轮询 status / 轮询谁** —— `memoryV2` 是本地读（廉价、永不失败），`contextV2Bridge.getStatus()` 是远程读（可失败、可超时，4s facade 超时在 `api.unchain.js:873-878`）。**两者的轮询代价差一个数量级，这是技术事实**；轮不轮、多久轮一次是设计。
  - **`getTree` 无上界这件事**（E-C11）：十八个方法里唯一没有 limit/page 的读方法，本层不封顶。要不要在方案里补一个上界，是设计 + 契约取舍；**若决定补，那是 bridge 面改动，直接触发 FE2。**

- **边界命中依据**: `pupu:electron/**`，第一层路径机械命中 **12 处**（E-0002，本案命中数最高者）。本次实际作业触及本边界内 9 个文件：`electron/main/services/unchain/service.js` · `electron/main/services/unchain/memory_v2_rollout.js` · `electron/main/ipc/register_handlers.js` · `electron/main/services/boot_readiness/service.js` · `electron/main/services/chat_storage/service.js` · `electron/shared/channels.js` · `electron/preload/channels.js` · `electron/preload/bridges/context_v2_bridge.js` · `electron/preload/bridges/unchain_bridge.js`，以及 6 对 `.js`/`.cjs` 测试双胞胎。**跨界只读引用（登记，不构成本边界主张）**：`pupu:src/SERVICEs/bridges/context_v2_bridge.js` 与 `pupu:src/SERVICEs/api.shared.js` · `pupu:src/SERVICEs/api.unchain.js`（`code-owner-shared-arteries`）· `pupu:src/PAGEs/chat/chat.js`（`code-owner-chat-core`）· `pupu:unchain_runtime/server/route_memory_v2.py` 与 `memory_v2_runtime.py`（`code-owner-runtime`）· `pupu:build/build_feature_flags.json` 与 `package.json`（`code-owner-devtools`）。结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案推进，我边界内 0 处必须改动。** `listSpaces` / `getTree` 两跳的 channel 常量、preload 白名单、preload 方法、main handler 绑定、main 实现 **全部现成且被双胞胎锁住**。这是我这一半的主要结论。
  - **条件性影响 1（我主动认领，量级 = 一个 test case）**：若 `getMisoStatusPayload().memoryV2` 升为产品状态契约 → `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.cjs` 加 allowlist 形状断言，**同步其 `.js` 孪生** `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.js`。
  - **条件性影响 2（我反对，登记以便本庭判断代价）**：若判定要给 `contextV2Bridge.getStatus()` 加字段 → `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1945-1986` + `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/context_v2_bridge.js:42` + 两对双胞胎（`ipc_channels` / `api_contract`）+ Full track + `expert-security` 补传。
  - **条件性影响 3（我拒绝在本案内承接）**：若要求 main 侧做 ownerChatId 存在性校验 → `service.js:198-204` 与 `electron/main/services/chat_storage/service.js` 之间的新耦合，另开 case。
  - **无影响**：SSE 流中继、vault、settings storage、window 管理、boot readiness 门。本案不触及。**特别地：`boot_readiness/service.js:224-226` 读的是同一个 `getMisoStatusPayload()`，但只取 `status` / `ready` 两个字段，`memoryV2` 对它不可见 —— 新增消费者不影响 boot 门。**

- **约束**:
  1. **渲染进程绝不碰 `ipcRenderer`**（工程铁律）。tree view 一切系统访问只经 `window.contextV2API` / `window.unchainAPI`，**不得新增任何直连，也不得在 renderer 侧自造 channel 名**。
  2. **任何 channel / bridge 面的增删改强制 Full track**，且 `electron/shared/channels.js` 常量 + `electron/preload/channels.js` 白名单 + preload 方法 + main 绑定 + **`.js`/`.cjs` 双胞胎必须同一次改完**。本案当前范围内 **不需要动任何一处**。
  3. **不得给 `contextV2Bridge.getStatus()` 增加任何字段或参数**（我的预先反对）。与 `code-owner-settings` 的 N3 同向但理由不同：N3 禁计数，我禁一切新增字段。
  4. **不得把 `memory_v2_store.py::get_tree` 写进任何验收断言。** 与 `code-owner-runtime` 的约束 2 同向；我这一层给出的是机械原因：Electron 永不产 `pupu_legacy`（甲）。
  5. **验收环境必须声明三件事，否则 store owner 不可复现**：`app.isPackaged` 的取值、`.local/build_feature_flags.snapshot.json` 的内容（**不入库！**）、`PUPU_FEATURE_MEMORY_V2` / `PUPU_MEMORY_V2_MODE` 是否经 `npm start` 注入。**缺任一项，「跑通了」这句话不成立。**
  6. **平台差异必须写进验收矩阵**：macOS 与 win32 在本案链路上行为不同（win32 恒 `degraded`，readiness 门拦下每一次 `getTree`）。**只在 macOS 上验过不等于验过。**
  7. **`.py` 改完 sidecar 必须重启**（工程铁律）。我是 relay 的一端：**Electron 侧的 `memoryV2Readiness` 在 sidecar 重启后由 `startMiso` 重置为 `initialMemoryV2Readiness()`（`service.js:4706`）再重新探测** —— 即改了 `.py` 又不重启 Electron，会看到一个基于旧探测结果的状态。报告与验收都须标注。

- **建议处置**: **本案可进入方案庭审。** 我不设阻塞，但请本庭先确认四项，否则方案会建在两个错误的地基上：

  1. **记 E-0006「已知事实 2」的更正**（甲），并把 `code-owner-runtime` 表格的 dev 行改为条件式（本机属性，非仓库属性）。
  2. **记 `code-owner-settings` 的 F2 为「已被本边界证据部分证伪」**，并把该条重新指向 `normalizeUnchainStatus`。**这是本案唯一一条被两名必到者以相反证据碰上的判断，不压成一个声音。**
  3. **把 Q2 的可指派动作改写为具体两项**（而非「建一个状态源」）：(i) 确认 `getMisoStatusPayload().memoryV2` 是否升为产品状态契约（若是，契约测试归我，我已认领）；(ii) 把 `normalizeUnchainStatus` 的放行决定指派给 `code-owner-shared-arteries`。**D7/D8 那个「无主构件」在 main 侧已经存在且已过线，问题是归属与放行，不是建造。**
  4. **确认本案显式声明「不新增状态源、只消费已存在的四态」**。若确认，本案对 `0000-0003-2026-0807` 的 Q0 裁定 **无依赖**，可与前案并行推进；若不确认（即本案要自造状态判据），我支持 `code-owner-settings` 的硬附加条件——先定 owner 再动手。

  另请本庭注意：我 **不请求** 补传任何角色。`expert-security` 的不传唤判定在本案当前范围内成立，触发条件我已画在丁 (4) 与 FE2；一旦命中，我本人请求补传。

---

## 本 ASSESSMENT 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**，与 E-0001 一致。**`electron/` 目录零 dirty**（`git status --porcelain electron/` → 0 行，本次复测）。全部为只读操作，未改任何文件，未 commit。

### E-C1 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:4745`（`const sidecarEnvironment = { ...process.env }`）· `:4749-4755`（三个 vault 键与 dirty-dev 键的删除）· `:4758-4763`（`spawn(...)`，`env: { ...sidecarEnvironment, …`）· `:4789-4808`（五个 MEMORY_V2 env 键无条件写入）· `:4809-4811`（dirty-dev 条件重加）· `:1035`（`const memoryV2RuntimeConfig = constrainMemoryV2ConfigForPlatform(...)`）· `:4695-4696`（`startMiso` 的唯一守卫，无 attach 分支）
- **取得方式**: 定点读取上述行段；`grep -rn "spawn(" electron/main --include="*.js"` → **全 `electron/main/` 只有 3 个 spawn 点**：`memory_vault/vault_sink_executor.js:327`（vault worker）· `unchain/service.js:4758`（sidecar）· `ollama/service.js:67`（`ollama serve`）；`grep -rn "EXTERNAL|externalSidecar|skipSpawn|attach" unchain/service.js` → 无任何附着外部进程的路径（命中全部是 stream 的 `attachedWebContentsId`，与 spawn 无关）
- **支持/反驳**: **支持并补全** `code-owner-runtime` 的 E-A5 —— 其自陈未验证的 `sidecarEnvironment` → spawn 最后一段注入，此处逐行确认：**五个键的写入位置在 `{...process.env}` 展开之后，无条件，无分支**。**反驳** 任何「开发者 shell 的环境变量可能生效」的设想
- **完整性限制**: **(1)** 静态读取，**未启动 Electron，未观察真实 spawn 的 env**。运行时行为是推断（但见 E-C9，该注入被测试锁住）。**(2)** 我核的是 `electron/main/` 下的 spawn；**未核** `scripts/start-dev.cjs` 是否另起 sidecar（该文件属 `code-owner-devtools`，我只读到 `package.json` 层）
- **证据类型判据**: 仓内文件字面内容与行号，任何人可在同一 revision 复核 → 自证类

### E-C2 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:14-20`（env 键表）· `:118-173`（`buildRolloutConfig`，**`:135-140` 的 featureEnabled 短路**、`:150` 的二元 storeOwner）· `:210-266`（`resolveMemoryV2ReleaseConfig`，**`:216-218` 快照路径二选一**、`:241-279` 双指纹门、`:265` `allowProcessOverrides: !app.isPackaged`）· `:311-342`（`constrainMemoryV2ConfigForPlatform`）· `:405-449`（`validateMemoryV2Status`）· `/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json` · `/Users/red/Desktop/GITRepo/PuPu/.local/build_feature_flags.snapshot.json` · `/Users/red/Desktop/GITRepo/PuPu/package.json:40`
- **取得方式**: 定点读取；`cat build/build_feature_flags.json`；`ls -la .local/ && cat .local/build_feature_flags.snapshot.json`；`grep -n "start:electron" package.json`；`grep -o 'reason = "[a-z0-9_]*"' memory_v2_rollout.js`（**10 条，含 `""`**）
- **支持/反驳**: **支持** 甲的取值域二元结论；**部分反驳** `code-owner-runtime` E-A5 表格的 dev 行 —— 「`npm start` → `unchain`」不是仓库属性
- **关键原文**:
  - `memory_v2_rollout.js:135-140`：`const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";`（`configuredMode` 同形）—— **featureEnabled 为假时，env 完全不被读取**
  - `memory_v2_rollout.js:216-218`：`app.isPackaged ? build/build_feature_flags.json : .local/build_feature_flags.snapshot.json`
  - `build/build_feature_flags.json`：`"enable_memory_v2": false`，`_pupu_memory_v2_release.sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER = "off"`，两个 sha256 指纹在案
  - **`.local/build_feature_flags.snapshot.json`（本机，273 字节，mtime 2026-08-04）：`{"enable_memory_v2": true, …}`，且 无 `_pupu_memory_v2_release` 块**
  - `package.json:40`：`"start:electron": "cross-env PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1 node ./scripts/start-dev.cjs"`
  - `validateMemoryV2Status` 的 reason 闭集（10）：`""` / `context_v2_unavailable` / `context_v2_store_owner_incompatible` / `context_v2_schema_incompatible` / `context_v2_wal_required` / `context_v2_lexical_backend_incompatible` / `context_v2_unchain_capability_unavailable` / `context_v2_unchain_capability_invalid` / `context_v2_rollout_config_invalid` / `context_v2_rollout_mismatch`
- **完整性限制**: **(1)** `.local/build_feature_flags.snapshot.json` 是 **本机文件、不入库**，其内容 **不可由他人在同 revision 复核** —— 这一条本身就是我 FE5 的依据，但也意味着 **该条证据的这一半不具备可复核性**，本庭须按「本机观察」而非「仓库事实」采纳。**(2)** 未实际打包、未验证 `build/build_feature_flags.json` 与最近一次真实 release 的一致性（与 `code-owner-runtime` E-A5 限制 2、`code-owner-settings` 不确定性 5 同源，**至今未消除**）
- **证据类型判据**: 仓内文件（js / package.json / build json）→ 自证类；`.local` 那一份是本机不入库文件的读取，**其可复核性弱于自证类**，本条已就地标注

### E-C3 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，2026-08-08。被测常量逐字取自 `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:120`（`CONTEXT_V2_OWNER_ID_PATTERN`）· `:195-204`（`readContextV2String` / `requireContextV2OwnerChatId`）· `:186-193`（`createContextV2Error` / `contextV2InvalidRequest`）
- **取得方式**（**完整可复跑命令**，纯本地、零副作用）:
  ```bash
  node -e '
  const OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
  const read = (v) => (typeof v === "string" ? v.trim() : "");
  const req = (v) => { const o = read(v); if (!OWNER.test(o)) { const e = new Error("[context_v2_invalid_request] ownerChatId is invalid"); e.code="context_v2_invalid_request"; throw e; } return o; };
  for (const v of [undefined, null, "", "   ", 123, {}, "chat-1772850432671-abc", "character_foo__dm__main", "character_foo__dm__main "]) {
    try { console.log(JSON.stringify(v), "-> OK", JSON.stringify(req(v))); }
    catch (e) { console.log(JSON.stringify(v), "-> THROW code=" + e.code + " msg=" + JSON.stringify(e.message)); }
  }'
  ```
  **实际输出**:
  ```
  undefined                   -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  null                        -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  ""                          -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  "   "                       -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  123                         -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  {}                          -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  "chat-1772850432671-abc"    -> OK "chat-1772850432671-abc"
  "character_foo__dm__main"   -> OK "character_foo__dm__main"
  "character_foo__dm__main "  -> OK "character_foo__dm__main"
  ```
- **支持/反驳**: **回答 G5**（缺参 = 同步抛 `context_v2_invalid_request`，请求不发出）；**证实** `code-owner-settings` 的 E-B2（语义错误、语法合法的 id 穿过本层），并补一条：**尾随空白被 trim 后同样通过**
- **完整性限制**: **(1)** 我复制的是常量与两个纯函数的字面等价物，**不是 import 真实模块**（`service.js` 是一个需要 `electron` 的工厂，无法在 node 裸环境实例化）。等价性由逐字比对保证，**但仍是复制品，不是被测代码本身**。**(2)** 只覆盖 `requireContextV2OwnerChatId`；`requireContextV2Identifier(spaceId)` 我 **未实跑**（其正则更宽：`{0,511}`）。**(3)** 未观察抛出后经 `ipcMain.handle` 到 renderer 的真实序列化形态
- **证据类型判据**: 由我编写的脚本产出的运行时观察 → **须查类**（无需质疑即强制审查）

### E-C4 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1039-1056`（`initialMemoryV2Readiness`）· `:1068`（声明）· `:1637-1664`（`getMisoStatusPayload`，**`:1645-1663` 是 `memoryV2` 的 15 个字段**）· `:1852-1887`（`verifyContextV2Readiness`，写入点 1）· `:1960-1975`（`getContextV2Status` 内的写入点 2）· `:4706`（`startMiso` 重置）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/ipc/register_handlers.js:236-238` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/channels.js:17` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/unchain_bridge.js:4` ‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js:870-887` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:578`
- **取得方式**: `grep -rn "memoryV2Readiness" electron/ src/ --include="*.js" --include="*.cjs"`（**产品代码全部命中都在 `unchain/service.js` 一个文件内，共 16 处**）；`grep -rn "getMisoStatusPayload" electron/main`（**3 个消费者**：`register_handlers.js:237` · `boot_readiness/service.js:224-225` · 自身定义）；`grep -rn "memoryV2" src --include="*.js" | grep -v ".test.js"`（**零处读 `status.memoryV2`**，全部命中是同名局部变量或 `enable_memory_v2` flag）；定点读取 `normalizeUnchainStatus`
- **支持/反驳**: **反驳** `code-owner-runtime` 的「`memoryV2Readiness` 三处 grep 零命中 ⇒ 未暴露给 renderer」—— 该推论是名字层面的假阴性；**支持** 乙的全部结论；**部分反驳** `code-owner-settings` 的 F2「唯一没有绕行方案」
- **净内容**:
  ```
  service.js:1645-1663  memoryV2: { configured, ready, status, reason, featureCeiling, configuredMode,
                                    releaseRolloutMode, rolloutMode, canaryPercent, readOnlyDegraded,
                                    platformActiveBlocked, releaseRolloutFingerprint, rolloutFingerprint,
                                    sidecarFingerprint, snapshotFingerprint }        ← 15 字段，4 个是 sha256
  register_handlers.js:236  ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () => unchainService.getMisoStatusPayload())
  preload/bridges/unchain_bridge.js:4  getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)   ← 裸透传
  ─────────────────────────────  以上全在 code-owner-electron 边界内，零投影 ─────────────────────────────
  api.shared.js:330-343  normalizeUnchainStatus → 重建为 { status, ready, url, reason, pid, port }
                                                 ← memoryV2 与 contract 在此被丢弃（shared-arteries 边界）
  boot_readiness/service.js:224-232  只取 status.status 与 status.ready，memoryV2 对 boot 门不可见
  ```
  **status 的取值域**：`off`（`:1053`）/ `pending`（`:1055`）/ `degraded`（`:1045,1875,1881,1970`）/ `ready`（`:1875,1970`）—— **闭集四值**
- **完整性限制**: **(1)** 静态读取，未运行应用。「renderer 今天就能拿到」是对代码路径的推断，**未在运行中的应用里 `await window.unchainAPI.getStatus()` 观察过一次**。**(2)** grep 只覆盖字面标识符 `memoryV2Readiness` 与 `memoryV2`；未追经解构/重命名的间接消费。**(3)** `normalizeUnchainStatus` 与 `api.unchain.js` 落 `code-owner-shared-arteries` 边界，**我只读引用，其权威解释不归我**
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但其结论跨入 shared-arteries 边界，本条对 `normalizeUnchainStatus` 的部分只作为「请其确认」的锚点**

### E-C5 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:182-193`（`createContextV2Error` 与其成文理由注释）· `:1733-1786`（`readJsonResponse`，**`:1740-1771` 的错误分支提取 `parsed.error.code` 挂到 `error.code`**）· `:1892-1940`（`contextV2Request`：`:1893` `ensureMisoReady()` · `:1897-1906` readiness 门 · `:1914-1922` fetch 失败 → `context_v2_unreachable` · `:1931-1938` 保码重包）· `:2108-2116`（`getContextV2Tree`）· `:2098-2105`（`listContextV2Spaces`）‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:53-57`（`ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/`）· `:69-82`（`unavailableError` / `parseContextV2ErrorCode`）
- **取得方式**: 定点读取全部行段并逐段追踪一个错误对象的生命周期
- **支持/反驳**: **支持** 戊「服务端七码经本层 code 保真、message 丢弃」；**证实** `0000-0003-2026-0807#S-0010` 归档结论在本案链路上仍然成立
- **关键原文**:
  - `service.js:182-185`（注释）：*"the stable code rides in the message behind a `[<code>] ` prefix (Electron strips error.code across ipcMain.handle) AND stays on .code for main-process callers."*
  - `service.js:1932-1933`（注释）：*"readJsonResponse surfaces the sidecar's stable error code; keep it and re-wrap so the renderer only ever sees `[code] static message`."*
  - `service.js:1938`：`throw createContextV2Error(code, "context v2 request failed");` —— **上游 message 在此被丢弃**
  - 七个服务端码全部匹配 `[a-z0-9_]+` → renderer 正则可解析，**无一漏解**
- **完整性限制**: **(1)** 静态追踪，**未观察一次真实的 IPC 往返**，未验证 Electron 实际包裹的 `Error invoking remote method '<channel>': ...` 前缀不会干扰正则（该正则无锚点，理论上不受影响，**但这是推断**）。**(2)** `src/SERVICEs/bridges/context_v2_bridge.js` 属 `code-owner-shared-arteries`，我只读引用
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-C6 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1666-1676`（`ensureMisoReady`）· `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:1414-1430`
- **取得方式**: 定点读取；`grep -n "not ready" electron/tests/main/context_v2_service.test.cjs`
- **支持/反驳**: **限定** E-C5 与 `0000-0003-2026-0807#S-0010` 的「code 端到端不丢」—— **有一个前置例外，且它被测试锁住**
- **关键原文**:
  ```js
  // service.js:1672-1674
  throw new Error(
    `Miso service is not ready (status=${unchainStatus}${reasonSuffix})`,
  );                                  // ← 无 [code] 前缀，无 .code
  ```
  ```js
  // context_v2_service.test.cjs:1416-1430
  // "Every capability (not just status) fails closed while the sidecar is
  //  not ready — no request is attempted at all."
  await expect(service.listContextV2Spaces({ ownerChatId: "chat-1" })).rejects.toThrow(/not ready/i);
  await expect(service.decideContextV2Candidate({...})).rejects.toThrow(/not ready/i);
  expect(fetchImpl).not.toHaveBeenCalled();
  ```
- **完整性限制**: **(1)** 该测试断言的是 `listContextV2Spaces` 与 `decideContextV2Candidate`，**未逐一断言 `getContextV2Tree`** —— 但三者共用 `contextV2Request` 的同一条第一行，故推断其行为相同（**是推断，不是观察**）。**(2)** 未验证该无码 message 到达 renderer 后的确切形态
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-C7 | repository | 自证类（**跨界只读，权威解释归 `code-owner-runtime`**）
- **来源定位**: PuPu `b2385d5d` · **本边界内**：`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1942-1986`（`getContextV2Status`：`:1946-1957` 合成负值分支 · `:1958` 真发请求 · `:1974` `available &&= validation.ok`） ‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:982-1006`（`context_v2_status`，**无 try/catch**）· `:786-799`（`_status_for_store_owner`，owner≠unchain → 直调 `_runtime()`）· `:315-328`（`_read_runtime_for_store_owner`，同形）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_runtime.py:694-735`（**`:718-734`：owner ∈ {off, unchain} 且 required → 抛 503，code 为 `context_v2_store_disabled`（off）/ `context_v2_owned_by_unchain`（unchain）**）
- **取得方式**: 定点读取五处
- **支持/反驳**: **支持** 丁的核心结论（出厂默认态下 `getStatus()` reject 而非 resolve，8 字段 allowlist 不可达）；**独立交叉验证** `code-owner-runtime` 的 E-A4（其实跑得 503 `context_v2_store_disabled`，与我静态读结论一致）；**推翻我自己的一条持久记忆**（原记「默认构建下每次读返 404 `context_v2_not_found`」，在本 revision 上不成立）
- **完整性限制**: **(1)** `unchain_runtime/**` 不在我边界内。我只主张「代码里的分支长这样」，**运行时行为的权威结论归 `code-owner-runtime`**（其已实跑，结论一致）。**(2)** 我 **未实跑** 任何 Python 代码，未起 sidecar。**(3)** 主进程侧的 `:1946-1957` 合成分支我未实跑，但其存在被 `context_v2_service.test.cjs:249` 的 `"status short-circuits without a request when the runtime is not ready"` 锁住
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类

### E-C8 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08
- **取得方式**（**完整可复跑命令**，只读、不改文件）:
  ```bash
  npm run test:electron -- --testPathPattern="context_v2_service|context_v2_bridge|ipc_channels|api_contract" \
    --testPathIgnorePatterns="/node_modules/" "/worktrees/"
  ```
  **实际输出（主树部分）**:
  ```
  PASS electron/tests/preload/api_contract.test.cjs
  PASS electron/tests/main/context_v2_service.test.cjs
  PASS electron/tests/main/ipc_channels.test.cjs
  PASS electron/tests/preload/context_v2_bridge.test.cjs
  Test Suites: 6 passed, 6 total
  Tests:       81 passed, 81 total
  ```
- **支持/反驳**: **支持** 戊「两跳在单元契约层完整且绿」
- **完整性限制**: **(1)** 这些是 **全 mock 的 node 环境单元测试**（`--env=node`，`fetch` 被 jest.fn 替身），**证明的是「主进程按契约拼 URL、preload 按 allowlist 转发、channel↔方法名绑定不漂移」，不证明任何真实 HTTP 往返**。**(2)** 第一次不带 ignore 参数的运行 **把仓内 9 个陈旧 worktree 的同名测试一并跑了**（30 suites / 317 tests 全绿）—— 那些结果 **与本案无关，不得引用**；第二次已收窄到主树。**(3)** 未跑 `memory_v2_startup_readiness` 与 `memory_v2_rollout` 两个 suite（E-C9 的断言我是静态读取的，**未实跑验证其今天为绿**）
- **证据类型判据**: 由我发起的测试运行产出的运行时观察 → **须查类**

### E-C9 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.cjs:188-194, 200-214, 237-244, 268-275, 379-392, 426-440` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:498-527` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/ipc_channels.test.cjs:360-375` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/preload/api_contract.test.cjs:252-265`
- **取得方式**: 定点读取；`ls -la electron/tests/main/context_v2_service.test.* electron/tests/preload/context_v2_bridge.test.* electron/tests/main/ipc_channels.test.* electron/tests/preload/api_contract.test.* electron/tests/main/memory_v2_*`；`cat electron/tests/main/context_v2_service.test.js`
- **支持/反驳**: **支持** 甲（注入被测试锁住）、乙 (2)（`memoryV2` 只被部分锁定）、丁 (1)（bridge 面被契约测试锁住）
- **净内容**:
  ```
  spawn env 断言（memory_v2_startup_readiness.test.cjs）:
    :188-193  packaged + canary  → PUPU_CONTEXT_V2_STORE_OWNER: "unchain"
    :379-386  off                → PUPU_CONTEXT_V2_STORE_OWNER: "off"
    :426-433  win32 + all        → PUPU_FEATURE_MEMORY_V2:"shadow", PUPU_MEMORY_V2_MODE:"all",
                                   PUPU_CONTEXT_V2_STORE_OWNER: "unchain"
    全仓测试中 PUPU_CONTEXT_V2_STORE_OWNER 取 "pupu_legacy" 的断言：零

  memoryV2 载荷断言（同文件，7 处，全部 toMatchObject 部分匹配）:
    :200-214  {configured:true, ready:true, status:"ready", reason:"", rolloutMode:"canary", 三个 fingerprint}
    :386-392  {configured:false, ready:false, status:"off", …}
    :435-440  {ready:false, status:"degraded", reason:"vault_worker_containment_unavailable",
               releaseRolloutMode:"all", rolloutMode:"shadow"}
    → status 四值中三值有断言；15 字段的完整集合与「不得有额外字段」均无断言

  双胞胎清单（全部 .js 为一行 require 壳）:
    electron/tests/main/context_v2_service.test.cjs (49245B)      + .test.js (42B)
    electron/tests/main/ipc_channels.test.cjs (28313B)            + .test.js (36B)
    electron/tests/main/memory_v2_rollout.test.cjs                + .test.js
    electron/tests/main/memory_v2_startup_readiness.test.cjs      + .test.js
    electron/tests/preload/api_contract.test.cjs (37515B)         + .test.js (36B)
    electron/tests/preload/context_v2_bridge.test.cjs (9241B)     + .test.js (41B)
    e.g. context_v2_service.test.js 全文 = `require("./context_v2_service.test.cjs");`
  ```
- **完整性限制**: **(1)** 静态读取测试源码；这批 `memory_v2_*` suite 我 **本次未实跑**（E-C8 未覆盖），故「这些断言今天为绿」是推断。**(2)** 「全仓测试中 `pupu_legacy` 零断言」是对字面串的搜索，未覆盖以变量构造的断言
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-C10 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/chat_storage/service.js:357`（`SELECT id FROM chats`）· `:459`（`SELECT id, meta FROM chats`）· `:489`（`SELECT COUNT(*) AS n FROM chats`）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:118-120`（该门是语法门的成文声明）
- **取得方式**: `grep -n "SELECT id\|FROM chats" electron/main/services/chat_storage/service.js`；定点读取 `service.js:118-120` 注释
- **支持/反驳**: **支持** 丙 (3)「main 今天没有身份门，但材料在 main 里」；**支持** FE3（建门是新耦合、新行为）
- **完整性限制**: **(1)** 我 **未核实** `chats.id` 与 `ownerChatId` 是否严格同一 id 空间（与 `code-owner-settings` 的不确定性 3 同源，**该确认归 `code-owner-chat-core`**）。**(2)** 未核实 chat_storage service 是否对同进程内其他 service 暴露可调用的查询方法 —— 我只确认了 SQL 存在
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-C11 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/context_v2_bridge.js:35-231`（十八个方法的完整入参表）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:131`（`CONTEXT_V2_PAGE_LIMIT_MAX = 500`）· `:2108-2116`（`getContextV2Tree` 无 limit）
- **取得方式**: 整读 preload bridge（235 行），逐方法比对入参
- **支持/反驳**: **支持** 我在「留待方案庭审」里登记的第三条（`getTree` 是唯一无上界的读方法）
- **净内容**: 十八个方法中，`listEvents` / `listEntries`(经 `includeDescendants`) / `search` / `listCandidates` / `listJobs` / `listPromotions` / `listCandidateReviews` 均带 `limit`（主进程以 `CONTEXT_V2_PAGE_LIMIT_MAX = 500` 封顶）；`readContent` 带 `offset`/`limit`（`CONTEXT_V2_CONTENT_LIMIT_MAX = 128KB`）；**`getTree` 的入参只有 `{ownerChatId, spaceId}`，无任何分页或大小参数**，返回体大小由 store 内容单方面决定
- **完整性限制**: 只比对了 preload 入参与 main 的常量；**未核实** 服务端 `get_tree` 内部是否另有隐式上界（归 `code-owner-runtime`）。**未观察任何真实载荷大小**（G2）
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
