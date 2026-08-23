# HS-003 · code-owner-electron · SLOT-004 交付

- **case**: P-0000-0007-2026-0815
- **handoff**: HS-003 | S-0015 | from code-owner-unchain | return_to code-owner-unchain
- **scope**: PS-003, SLOT-004, BC-004, AC-010, AC-011, AC-012, `contributions/HS-001-code-owner-runtime.md`, `contributions/HS-002-code-owner-chat-core.md`, `intake/fact-check.md`, `intake/chief-directive.md`
- **基线**: PuPu `28b1e0ef`（工作树含 P-0000-0004 在途未提交改动，均在 `src/` 内，不触及 `electron/**`）
- **勘误**: §3.4 的既有漂移计数在本件内经本 owner 自查更正过一次（首版按文件名词干配对，产生 4 项假阳性；已改为解析每个 shim 的 `require()` 实际目标重算）。更正后的数字为 43 个 `.cjs` body、40 个 CRA 可达、**3 处**缺 CRA shim。本更正不影响本件任何其他结论 —— 本次交付涉及的两组三槽在两版审计下都完整
- **production effect**: NONE | 本交付不改动任何生产代码，也不新建任何测试文件；只产出方案正文与可验收的测试义务描述
- **本 owner 边界**: `pupu:electron/**`（整目录）

---

## §0 本 owner 自行核对的源码事实

PS-003 与两份 contribution 中凡涉及 `electron/**` 的表述，本 owner 逐条回源码核对。**F-E10 至 F-E14 是本案至今未记载、且直接改变载体段义务形状的事实。**

| # | 事实 | 取证位置 |
|---|---|---|
| **F-E1** | `createContextV2Error(code, message)` 构造 `` new Error(`[${code}] ${message}`) `` 并设 `error.code = code`。方括号与其后的**单个空格是模板字面量**，不是由 code 携带的。函数对 code 不做任何校验、过滤、大小写改写、截断或替换 | `electron/main/services/unchain/service.js:185-189` |
| **F-E2** | 该契约由实现者自觉写入注释：「the stable code rides in the message behind a `"[<code>] "` prefix (Electron strips `error.code` across `ipcMain.handle`) AND stays on `.code` for main-process callers」 | 同文件 `:181-184` |
| **F-E3** | PS-003「与 intake 的偏差」第 6 条把 `createContextV2Error` 定位为 `:1978-1986`。该行段是 `contextV2Request` 的 **catch 块（调用点）**，函数定义在 `:185-189`。两处都真实存在，引用不构成错误，但载体测试要断言的模板在 `:185-189` | 同文件 `:1978-1986` 与 `:185-189` |
| **F-E4** | `readJsonResponse` 是**唯一**读取 sidecar `error.code` 的地方：要求 `parsed?.error?.code` 为字符串且 `.trim()` 后非空，取**trim 后**的值写入 `error.code`。无 allowlist、无大小写处理、无长度上限。`.trim()` 是载体路径上唯一的字符串变换，对任何匹配 `^[a-z0-9_]{1,64}$` 的 code 是恒等操作 | 同文件 `:1750-1800`，尤 `:1763-1767`、`:1774`、`:1785-1787` |
| **F-E5** | `contextV2Request` 的 catch：`code = error.code`（非空字符串）否则 `"context_v2_failed"`，随后 `createContextV2Error(code, "context v2 request failed")`。**sidecar 的 message 在此被整体替换**，PS-003 的「message 被覆写两次」结论成立 | 同文件 `:1978-1986` |
| **F-E6** | 409 body 非 JSON 时 `JSON.parse` 抛出，`message = bodyText.slice(0, 200)` 而 `errorCode` 保持 `""`；该 Error **没有 `.code`**，因此 catch 降级为 `context_v2_failed`，且被切下的 200 字符正文随 message 一起被丢弃，不跨出主进程 | 同文件 `:1780-1782` 与 `:1981-1985` |
| **F-E7** | JSON body 中 `error.code` 缺失 / 空串 / 纯空白 / 非字符串时同样落 `errorCode = ""`，降级路径与 F-E6 一致 | 同文件 `:1763-1767` |
| **F-E8** | `rebaseContextV2Session` 在 `contextV2Request` 之外不做任何错误处理；它的失败一律来自 `contextV2Request`，或来自 fetch 之前的入参校验（后者直接抛 `context_v2_invalid_request` / `context_v2_invalid_history`） | 同文件 `:2101-2138` |
| **F-E9** | IPC handler 层：`CONTEXT_V2_HANDLERS` 循环 `console.warn` 只记 `method` 与 `(error && error.code) \|\| "uncoded_error"`，随后 `throw error` —— **同一个 Error 实例**，message 不被触碰。`REBASE_SESSION → "rebaseContextV2Session"` 是表内第 5 项 | `electron/main/ipc/register_handlers.js:632-677`（`:640` 为 rebase 绑定行） |
| **F-E10** | **Electron 自身会再包一层。** renderer 实际看到的 message 是 `` `Error invoking remote method '<channel>': Error: [<code>] <message>` ``，不是 main 产出的裸 `[code] message`。本仓已有明文记载与断言 | `src/SERVICEs/bridges/settings_storage_bridge.js:104`；`src/SERVICEs/bridges/settings_storage_bridge.test.js:718-760` |
| **F-E11** | 因此 BC-004「第二跳」的 canonical representation 只描述了 main 的**产出**，未描述第三跳的**实际输入**。第三跳的正则 `/\[([a-z0-9_]+)\]\s/` 未加锚定，故仍能反解成功 —— 但这是运气好，不是被证明的性质。同仓另一个 bridge 用的是**加锚定**的 `/^\[([a-z0-9_]+)\]/`，那个写法在包裹形式下会返回 null | `src/SERVICEs/bridges/context_v2_bridge.js:53-57`；对照 `src/SERVICEs/bridges/run_bundle_storage_bridge.js:16` |
| **F-E12** | **第三跳的反解代码不在 BC-004 任何一方的边界内。** `parseContextV2ErrorCode` 与 `ERROR_CODE_TOKEN_PATTERN` 位于 `src/SERVICEs/bridges/context_v2_bridge.js`，而 `pupu:src/SERVICEs/bridges/**` 属 **code-owner-shared-arteries**。BC-004 的 consumer 字段只点名 `context_v2_turn_mutation.js`（chat-core）与 `turn_mutation_outbox.js`（chat-core 显式 carve-out）。rebase 失败的 code 在 `use_chat_stream.js:4069-4072` 由该 shared-arteries 函数解析后才交给 chat-core 的分类器 | `src/SERVICEs/bridges/context_v2_bridge.js:77-82`；`src/PAGEs/chat/hooks/use_chat_stream.js:90, 4069-4072`；`.claude/agents/pupu/code-owner-shared-arteries.md:15`、`.claude/agents/pupu/code-owner-chat-core.md:25` |
| **F-E13** | 第三跳既有测试只覆盖**裸**形式（`new Error("[context_v2_invalid_request] nope")`），从未覆盖 F-E10 的包裹形式。同仓 settings bridge 的对应测试是覆盖的 —— 两者不对称 | `src/SERVICEs/bridges/context_v2_bridge.test.js:190-196` |
| **F-E14** | **preload 层对错误零处理。** `rebaseSession` 只做 allowlist 重建后 `ipcRenderer.invoke`，没有 try/catch、没有 error 变换。channel 常量 `REBASE_SESSION: "context-v2:rebase-session"` | `electron/preload/bridges/context_v2_bridge.js:68-79`；`electron/shared/channels.js:158` |

**经验证的运行时行为**（本 owner 实跑 `node -e`，非推断）：`context_v2_rebase_recovery_required` 长 35、`context_v2_rebase_journal_incompatible` 长 38，均匹配 `^[a-z0-9_]{1,64}$`。对包裹形式的严格 consumer 正则反解：两个新 code、64 字符 code、`"a"`、`"0"`、`"_"` 全部逐字还原；`"AB_C"`、`"a b"` 返回 **null**（落未知 code，即 BC-004 的 `paused`，fail-safe）；`"x] [context_v2_rebase_journal_incompatible"` 反解为 `"x"` —— **`]` 夹带无法把一个条目伪造成 quarantine**。

**对 PS-003 的事实性结论**：PS-003 与 HS-002 关于 electron 边界的全部表述本 owner **未发现错误**。只发现两处**缺失**（F-E10 / F-E12），它们改变 BC-004 第三跳的正确写法与 owner 覆盖面，见 §6 的 M-16 与 M-17。

---

## §1 交付一 · 载体逐字保真的契约测试义务

### 1.1 载体路径的精确分段

S-0014 把义务描述为「`context-v2:rebase-session` 链路」。该链路在本 owner 边界内实际有**四段**，第五段是 Electron 框架行为：

| 段 | 位置 | 对 code 的作用 | 在我边界内 |
|---|---|---|---|
| C1 | `readJsonResponse` `:1750-1800` | 从 409 JSON body 取 `error.code`，`.trim()`，写上 `.code` | 是 |
| C2 | `contextV2Request` catch `:1978-1986` | 取 `.code`（缺则 `context_v2_failed`），重建 `[code] 常量` | 是 |
| C3 | `ipcMain.handle` 包装 `register_handlers.js:665-677` | 只记 code 到日志，原实例 rethrow | 是 |
| C4 | Electron IPC 序列化 | 丢弃 `.code`，把 message 包成 `Error invoking remote method '<channel>': Error: <message>` | 否（框架） |
| C5 | preload `context_v2_bridge.js:68-79` | 无（不接触错误） | 是 |

**逐字保真义务落在 C1、C2、C3；C5 由「无代码」保证并已被既有 preload 契约测试锁定形状；C4 只能作为已知形式在断言中显式建模。** 这是 §4 中 (E) 子例 E1(v) 存在的理由。

### 1.2 测试文件位置 —— 建议「零新增槽位」

**建议：不新建测试文件。** 把载体正向/负向格追加为 `electron/tests/main/context_v2_service.test.cjs` 的一个新 `describe("context v2 rebase error transport — carrier fidelity")`，紧邻既有的 `describe("context v2 controlled bridge — error containment")`（`:1321-1432`）；C3 的一格追加为 `electron/tests/main/ipc_channels.test.cjs` 的新 `test`，紧邻既有的 `"context v2 handler logs only the operation and the stable error code"`（`:423-474`）。

三条理由，按重要性排序：

1. **零新增双胞胎槽位。** 两个文件的三槽（见 §3）今天都齐备。新建文件会一次性引入三个必须手工保持一致的槽位，而这正是本仓唯一会静默失效的测试形态 —— 为了给「防静默失效」的契约加测试而新增静默失效面，是自相矛盾的。
2. **harness 复用，避免第二份可漂移的副本。** `startService` / `startReadyService` / `createCompatibleHealthResponse` / `jsonResponse` / `lastRequest`（`context_v2_service.test.cjs:40-151`）是这条链路唯一的启动夹具。新文件必须复制或抽取它；复制会漂移，抽取会改动既有 34 个用例的 import 面，两者都比追加 describe 代价大。
3. **既有 `error containment` describe 已经是同一命题的一半。** `:1327` 的用例已经断言 `rejection.message === "[context_v2_operation_conflict] context v2 request failed"`。本交付要做的是把「对这一个 code 成立」升级为「对任意合法 code 成立」，语义上是同一节的加强，不是新主题。

**若 lead 或 Chief 坚持独立文件**，代价是精确的三个新文件，必须同时创建、缺一即静默失效：
`electron/tests/main/context_v2_rebase_error_transport.test.cjs`（权威 body）、`electron/tests/main/context_v2_rebase_error_transport.test.js`（内容恰为 `require("./context_v2_rebase_error_transport.test.cjs");`）、`src/electron/tests/main/context_v2_rebase_error_transport.test.js`（内容恰为 `require("../../../../electron/tests/main/context_v2_rebase_error_transport.test.cjs");`）。本 owner 不反对该方案，只要求它连同三槽一起被写进验收正文。

### 1.3 断言形状 —— 通用规则

适用于本节全部格，先行声明以免逐格重复：

- **全等比较，不用包含式。** message 一律 `expect(rejection.message).toBe(...)`，禁止 `toContain` / `toMatch`；`toContain` 无法发现前缀污染或分隔符改写。
- **严格 consumer 就地重新声明。** 反解用的正则字面量必须写在 electron 测试文件内，**不得**从 `src/SERVICEs/bridges/context_v2_bridge.js` import。理由是 [`cross-boundary-contract-gate`](../../../rules/cross-boundary-contract-gate.md) 的「禁止双方共享同一个宽松 helper 后互相证明」：载体是 producer，反解器是 consumer，共用一份实现就不再是契约测试。就地字面量必须与 `src/SERVICEs/bridges/context_v2_bridge.js:57` 逐字相同并在注释中标注其行号，形成人工可核对的镜像；镜像漂移的检测归属见 §6 M-17。
- **不 import 任何 `src/**` 生产代码。** electron 测试进程是 `--env=node`，且跨 owner 边界 import 会把 shared-arteries 的改动变成 electron 测试的红，责任面错位。
- **不写 snapshot。** 载体断言必须是显式字面量，snapshot 会在 `-u` 时被静默接受。

### 1.4 正向格

见 §4 的 E1–E5（AC-012 位置 (E) 正文即为本节的可验收形式，不在此重复）。

### 1.5 本载体测试**不**保证什么（诚实边界）

写进方案，避免验收时被误读为更强的结论：

- **不保证封闭性。** 载体按契约要求恰恰**不得**做 allowlist（BC-004 admission details 原文）。封闭集合的守门人是 AC-011 子例 6 的 sidecar 出网 allowlist `CONTEXT_V2_REBASE_ERROR_CODES`。E6 正是对「载体不守门」的**正面**证明。
- **不保证 `^[a-z0-9_]{1,64}$`。** 载体对长度与字符集完全不敏感（F-E1/F-E4）。`{1,64}` 是 producer 侧义务。E3 的 65 字符格是遥测格，明确标注不是准入格。
- **不覆盖 C4。** Electron 的 IPC 包装无法在 jest node 环境下真实触发，E1(v) 是对其**已知形式**的建模断言，不是对 Electron 行为的证明。若 Chief 要求真实 C4 证据，唯一途径是 playwright e2e（`npm run test:e2e`），属 `code-owner-devtools` 边界，本 owner 不代为承诺 —— 见 U-15。
- **不覆盖第三跳的真实实现。** 见 F-E12 / M-17。

---

## §2 交付二 · 409 body 两格

两个新 code 各一格，落在 §4 的 **E1**，并由 **E2** 保证输入来自真实 producer 而非手抄。

**采纳 lead 的追加发现并据此收窄断言对象。** PS-003 已证明 message 在链路上被覆写两次（route 层 → `createContextV2Error` 常量），sidecar 的 message 到不了 renderer。因此本 owner **不**断言 message 内容的透传，**只**断言：

1. **code token 保真** —— `rejection.code` 与反解结果都逐字等于 sidecar 发出的 code；
2. **message 恒为常量形式** —— 逐字等于 `` `[${code}] context v2 request failed` ``，这条同时是不泄漏的正面证据；
3. **sidecar message 与非 code 字段确实不可达** —— 断言 sidecar body 中的 `message`、`retryable`、`expected_revision`、`actual_revision` 的任何取值都不出现在 `rejection.message` 内。

第 3 点把 PS-003 的「载体层还会再拦一道」从论证升级为断言，是本 owner 对该发现的具体承接。

**HTTP status 的处置**：两个新 code 都是 409（SLOT-002 A 表）。载体对 status 只用 `response.ok` 判真假，**不区分 409 与 503**，也不把 status 传给 renderer（F-E4/F-E5）。因此本 owner **不**在载体层断言 status —— 那是 producer 侧 AC-011 子例 6 的义务。载体测试只需保证 409 与 503 走同一条重建路径且都保真，E2 遍历 fixture 时天然覆盖（fixture 含 503 的 `context_v2_rebase_unavailable`）。这是对 SLOT-002 A 表脚注「preload 与 electron 对 409 body 的透传路径已被覆盖」的一处澄清：**被覆盖的是 `!response.ok` 这一条共用路径，不是 409 专有路径**；用 409 而非 503 的真正好处在 renderer 语义与既有 terminal code 的一致性上，不在载体上。

---

## §3 交付三 · `.js` / `.cjs` 双胞胎同步义务

### 3.1 事实更正：本仓的双胞胎是**三槽**，不是两槽

工程铁律写作「Electron 测试有 `.js` / `.cjs` 双胞胎，必须同步」。本 owner 实测后确认该表述**不足以**保证测试真的会跑。实际结构是：

| 槽 | 路径形态 | 内容 | 被谁收集 |
|---|---|---|---|
| **S1 权威 body** | `electron/tests/<area>/X.test.cjs` | 真正的测试代码 | `npm run test:electron`（`jest --testMatch="**/electron/tests/**/*.test.cjs"`，`package.json`） |
| **S2 同目录 shim** | `electron/tests/<area>/X.test.js` | 恰一行 `require("./X.test.cjs");` | **无人收集**（实测） |
| **S3 CRA shim** | `src/electron/tests/<area>/X.test.js` | 恰一行 `require("../../../../electron/tests/<area>/X.test.cjs");` | `npm test` / `npm run test:frontend`（`react-scripts test`，CRA 的 jest `roots` 固定为 `<rootDir>/src`） |

取证方法（可复现）：`CI=true npx react-scripts test --watchAll=false --listTests` 输出 40 条 `/src/electron/tests/...` 路径，**零条** `/electron/tests/...`。`src/electron/` 是一个真实目录（非 symlink），其下只有 shim，`realpath` 与 inode 均与 `electron/tests/` 下的同名文件不同。

**S2 是历史遗留、当前不被任何 runner 收集**（`test:electron` 只匹配 `*.test.cjs`；CRA 只看 `src/`；`test:e2e` 是 playwright）。铁律中的「双胞胎」最可能原指 S1↔S2，但**今天真正承载「不静默失效」的是 S1↔S3**。本 owner 保留 S2 的建议是：继续按既有多数惯例创建，因为它是人在 `electron/tests/` 目录里唯一能看见的「这条测试有 CRA 侧入口」的提示；但要知道它本身不跑。

### 3.2 本次涉及的双胞胎清单

按 §1.2 的「零新增槽位」方案，**本次交付不新增任何槽位**，只需保证下列两组既有三槽在改动后仍完整且指向正确：

| 逻辑测试 | S1（本次追加内容） | S2 | S3 |
|---|---|---|---|
| `context_v2_service` | `electron/tests/main/context_v2_service.test.cjs` — 新增 describe `context v2 rebase error transport — carrier fidelity`（E1–E4、E6–E9） | `electron/tests/main/context_v2_service.test.js` | `src/electron/tests/main/context_v2_service.test.js` |
| `ipc_channels` | `electron/tests/main/ipc_channels.test.cjs` — 新增 test（E5） | `electron/tests/main/ipc_channels.test.js` | `src/electron/tests/main/ipc_channels.test.js` |

两组 S2 / S3 均已存在且内容正确（本 owner 逐字读取确认）。**因为新增内容全部落在既有 S1 文件内，shim 无需任何改动 —— 这正是选择追加而非新建的收益。**

### 3.3 同步验证方法（可执行，写入验收）

1. `npm run test:electron` — 断言两个新 describe/test 出现在输出，且总用例数相对改动前**严格增加**预期格数（不接受「全绿」作为已运行的证据；参见本仓「测试门闩纪律」教训：管道吞码与看错计数）。
2. `CI=true npx react-scripts test --watchAll=false --listTests | grep -c "/src/electron/tests/"` — 数值必须与改动前一致（本次为 **40**）；若采用独立文件方案则必须变为 41。
3. `npm run test:frontend -- --passWithNoTests -t "carrier fidelity"` — 必须**匹配到并跑过**该 describe。这是唯一能证明 S3 链路真的把新代码带进 CRA runner 的一步；只跑 `test:electron` 无法证明。
4. 若采用独立文件方案，追加一步：`node -e` 断言 S2 与 S3 两个 shim 的内容逐字等于其规定的单行，且 `require` 目标文件存在。

### 3.4 审计方法的一处陷阱，与更正后的既有漂移（报告，不在本案 write_set 内）

**先记一条方法学更正，因为本 owner 自己先踩了它。** shim 的文件名**不必**与 `.cjs` body 同名。本仓有两处真实反例：`src/electron/tests/main/unchain_service_loader.test.js` 加载的是 `unchain_service.test.cjs`；`src/electron/tests/preload/miso_stream_client.test.js` 加载的是 `unchain_stream_client.test.cjs`。因此**任何按文件名词干配对的审计都会产生假阳性** —— 本 owner 第一版审计正是如此，误报了 4 项。**正确方法是解析每个 shim 的 `require()` 实际目标并归一化路径**，本节数据已按该方法重算。

更正后的全量审计（43 个 `.cjs` body，逐个解析 shim 的 require 目标）：

- **CRA 侧可达**：40 / 43。与 `--listTests` 数出的 40 条 `/src/electron/tests/` 完全对上，互为交叉验证。
- **缺 S3，因此 `npm test` / `react-scripts test` 完全看不见**（**3 处**）：`main/chat_storage_lifecycle`、`main/ollama_service`、`main/settings_quit_coordinator`。
- **无悬空 shim**：没有任何 CRA shim 指向不存在的 body。
- **S2 确为可选**：`main/boot_readiness_service` 有 S3 但**没有** S2，且照常被两个 runner 覆盖 —— 这是 S2 不承载任何收集职责的直接证据。

**影响评估**：release gate 与 CI 同时运行 `npm run test:frontend` 与 `npm run test:electron`（`scripts/release-qa/local-gate-checks.mjs:19,25`；`.github/workflows/release-qa.yml:134,140`），这 3 处仍在发布门内被 `test:electron` 执行 —— **不是发布风险**。真实损失只在开发回路：CLAUDE.md 指示的 `react-scripts test` 跑不到它们。

**本 owner 不在本案修补它们**：属另一主题的测试树整理，与本案讨论对象无关，且会把 electron 的 write_set 从零扩到 3 个文件。建议单独立案或由 CEO 直接指示。此处只作显名记录。本次交付涉及的两组三槽均完整，不受此影响。

---

## §4 交付四 · AC-012 位置 (E) 正文

以下为可逐字并入 AC-012 的 (E) 段。**编号刻意使用 `E1`–`E9` 而非续接子例 15+**：SEQ-004 的 cell→子例映射（PS-003 `SEQ-004` 的 `cell 到子例映射` 字段）逐格引用「子例 1–8」与「负向子例 9–14」，续接数字会让「子例」一词在同一 AC 内指两类互不相干的对象；`E` 前缀使载体格可独立追踪而不扰动任何既冻结的映射，也不新增 AC 编号（K-14 的同一约束）。

> **位置 (E) · Electron 载体段（SLOT-004 交付）。**
> **取证位置**：`electron/tests/main/context_v2_service.test.cjs` 新增 `describe("context v2 rebase error transport — carrier fidelity")`（E1–E4、E6–E9），与 `electron/tests/main/ipc_channels.test.cjs` 新增一个 test（E5）。两文件的三槽双胞胎（`.cjs` 权威 body、`electron/tests/**` 同目录 shim、`src/electron/tests/**` CRA shim）今天已齐备且本项**不新增任何槽位**。
> **执行方式**：`npm run test:electron`（`.cjs` 权威运行器）**与** `npm run test:frontend -- --passWithNoTests`（经 `src/electron/tests/**` shim 由 `react-scripts test` 收集）**两者都必须绿**；只跑其一不构成证据。另须记录 `CI=true npx react-scripts test --watchAll=false --listTests | grep -c "/src/electron/tests/"` 的值与改动前一致（40），证明 CRA 侧收集面未因本次改动而缺失。
> **严格 consumer 规则**：反解用的正则必须是写在 electron 测试文件内的就地字面量 `/\[([a-z0-9_]+)\]\s/`，**不得**从 `src/SERVICEs/bridges/context_v2_bridge.js` import —— producer 与 consumer 共用一份实现即不成其为契约测试。该字面量须在注释中标注其镜像来源 `src/SERVICEs/bridges/context_v2_bridge.js:57`。全部 message 断言使用 `toBe` 全等，禁止 `toContain` / `toMatch` / snapshot。
>
> **正向 E1**（两格，本 AC 对两个新 code 的端到端载体格）：分别以 `context_v2_rebase_recovery_required`（409）与 `context_v2_rebase_journal_incompatible`（409）的真实 producer 信封驱动 `service.rebaseContextV2Session(...)`，各断言六项 —— (i) rejection 是 `Error` 实例；(ii) `rejection.code` 逐字等于该 code；(iii) `rejection.message` 逐字等于 `` `[${code}] context v2 request failed` ``；(iv) 就地严格正则对 `rejection.message` 的第一个捕获组逐字等于该 code；(v) 对 Electron 实际投递给 renderer 的**包裹形式** `` `Error invoking remote method 'context-v2:rebase-session': Error: ${rejection.message}` `` 反解，仍得到同一 code —— 这是第三跳的真实输入，裸形式不是；(vi) 信封中 `message`、`retryable`、`expected_revision`、`actual_revision` 的任何取值都不出现在 `rejection.message` 中。
> **正向 E2**（producer 真实性）：E1 与全表格的输入**不得手抄**，须逐条读取位置 (D) 的 fixture `src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json`（由 AC-011 子例 6 在真实 Flask 测试客户端写出），对其中每一个 `{code, http_status, message}` 驱动一次载体并作 E1 (i)–(vi) 断言。**fixture 缺失、为空数组、或缺任一必需 key 时本例必须 FAIL 而非 skip**。另断言 fixture 的 code 集合与 SLOT-002 A 表七 code 及出网 allowlist 的并集一致：任一侧新增而另一侧未同步即失败。
> **正向 E3**（字符集与长度属性锁，合成输入）：对 `"a"`、`"0"`、`"_"`、`"a0_"`、`"c".repeat(64)` 及两个新 code 各驱动一次 409，断言 (iii)(iv) 成立。**64 字符一格是硬边界格**，证明载体不做任何长度截断。追加一格 `"c".repeat(65)`：断言载体**同样**逐字透传，并在注释与断言名中标明这是遥测格而非准入格 —— `^[a-z0-9_]{1,64}$` 是 producer 侧义务，由 AC-011 子例 6 的出网 allowlist 承担，载体按 BC-004 admission details 恰恰不得守门。
> **正向 E4**（分隔符结构锁）：对每个正向 code 断言 `` rejection.message.startsWith(`[${code}] `) ``、`rejection.message.indexOf("]") === code.length + 1`、`rejection.message.charAt(code.length + 2) === " "`。目的是让对 `electron/main/services/unchain/service.js:185-189` 模板的任何改写（去空格、换分隔符、加前缀）立刻变红。
> **正向 E5**（IPC handler 层不改写，落 `ipc_channels.test.cjs`）：经 `registerIpcHandlers` 注册一个 `rebaseContextV2Session` 被 mock 为 reject 的 `unchainService`，取 `CHANNELS.CONTEXT_V2.REBASE_SESSION` 的 handler 调用，断言 (i) rejection 与注入的是**同一个 Error 实例**（`toBe`，非 `toEqual`）；(ii) `rejection.message` 与注入时逐字节相同；(iii) `console.warn` 恰一次，拼接后含 `rebaseContextV2Session` 与该 code，**不含** message 中的哨兵串、不含 payload 中任何取值。
>
> **负向 E6**（表外 code 不被载体拦截或改写）：注入既不在七 code 表、也不在出网 allowlist 内的 code（如 `zz_not_a_real_code`），断言 `rejection.code` 与反解结果都**逐字等于注入值** —— 载体不过滤、不替换、不降级。本格是对 BC-004「载体不得做 allowlist」的正面证明，同时把封闭集合的守门责任明确留在 producer 侧。
> **负向 E7**（非法字符集 fail-closed 而非误判）：注入 `"CONTEXT_V2_UPPER"`、`"has space"`、`"has-dash"` 三格，断言 (i) 载体仍逐字透传（不改大小写、不做字符替换）；(ii) 严格正则对三者均返回 **null**，即 renderer 落「未知 code」并按 BC-004 `unknown input behavior` 进 `paused`，而非被误解析为某个已知 code。追加一格 `"x] [context_v2_rebase_journal_incompatible"`：断言反解得到 `"x"` 而**不是**被夹带的那个 terminal code —— `]` 夹带无法把一个条目伪造成 quarantine。
> **负向 E8**（缺 code 的 409 降级）：body 分别为 `{"error":{"message":"…","retryable":true}}`、`{"error":{"code":"","message":"…"}}`、`{"error":{"code":"   "}}`、`{"error":{"code":123}}` 四格，断言 `rejection.code === "context_v2_failed"` 且 message 逐字等于 `"[context_v2_failed] context v2 request failed"`。
> **负向 E9**（异常 body 降级且不泄漏）：body 分别为非 JSON 文本（内含一段 250 字符哨兵与 `sk-SENTINEL`）、空字符串、`"null"`、`"[]"` 四格，断言 `rejection.code === "context_v2_failed"`、message 逐字等于常量形式、且 `rejection.message` **不含哨兵文本的任何子串** —— 锁定 `readJsonResponse` 的 `bodyText.slice(0, 200)` 在 `contextV2Request` 的 catch 中被整体丢弃（`electron/main/services/unchain/service.js:1781` 与 `:1985`）。
>
> **red-before-green**：**E1 两格、E6、E7 必须保存 red-before-green 记录。** 取红方法为在 `createContextV2Error` 或 `readJsonResponse` 内临时注入一个改写后确认对应用例变红再回退 —— E1 用 `code.toUpperCase()`；E6 用一个临时 code allowlist（表外降级为 `context_v2_failed`）；E7 用 `code.replace(/[^a-z0-9_]/g, "_")`；E3 的 64 字符格用 `code.slice(0, 32)`；E9 的哨兵格用把 `bodyText.slice(0, 200)` 保留进最终 message。E3 与 E9 的取红记录为建议项，E1/E6/E7 为必需项。
> **本段不保证的事**（写入验收以免被误读为更强结论）：载体不保证封闭性（守门在 AC-011 子例 6）、不保证 `{1,64}`（producer 义务）、不覆盖 Electron 自身的 IPC 包装（E1(v) 是对其已知形式的建模断言，真实 C4 证据只能来自 e2e，属 devtools 边界）、不覆盖第三跳反解器的真实实现（该文件属 code-owner-shared-arteries，见 M-17）。

---

## §5 交付五 · BC-004 载体段 owner confirmation

### 5.1 确认结论

**BC-004 载体段（第二跳：sidecar HTTP 409 → Electron main 重建 `[code] message` → 交付第三跳反解）：`CONFIRMED_CONDITIONAL`。**

条件为 §6 的 **M-16** 与 **M-17** 被采纳（M-18 至 M-21 为措辞与追踪性改进，不构成条件）。

确认覆盖的具体义务，逐条对照 BC-004 现有正文：

| BC-004 字段中的载体义务 | 本 owner 确认 |
|---|---|
| 「main 把错误重建为 `` `[${code}] ${message}` `` 并把 message 替换为自己的常量」 | **属实**，F-E1/F-E5 |
| 「`retryable` / `expected_revision` / `actual_revision` 物理上不跨越 IPC 边界」 | **属实**，F-E4/F-E5：这三个字段在 `readJsonResponse` 内根本没有被读取，连进入主进程 Error 的机会都没有 |
| 「Electron main 不得对 code 做 allowlist 过滤、大小写改写、截断或替换，必须逐字保留」 | **接受为本 owner 的持续义务**。今日实现满足它（唯一变换是 `.trim()`，对准入集内 code 为恒等）；由 E1/E3/E4/E6/E7 锁定 |
| 「该义务今天只由实现细节保证、零测试覆盖」 | **属实**。既有 `:1327` 用例只覆盖单个既有 code，不构成 any-code 的属性锁 |
| 「本次只新增 code 值，不新增/删除/重命名任何 envelope 字段」 | **接受**。载体侧因此确实**无需生产代码改动** |
| 「第三跳用 `/\[([a-z0-9_]+)\]\s/` 反解 code token」 | **属实但描述不完整** —— 第三跳的真实输入是 Electron 包裹形式，不是裸串（M-16）；且该正则不在 BC-004 任一确认方的边界内（M-17） |

**载体侧生产代码结论：无需改动。** 两个新 code 的字符集与长度均落在今日载体已能逐字透传的范围内，409 与 503 共用 `!response.ok` 一条路径，preload 与 channel 常量无需变更。**本案在 electron 边界的全部产出是测试与契约正文。**

### 5.2 关于确认形式（回应 S-0014 的点名提问与 S-0016 的程序判断）

S-0014 请本 owner 说明是否认为载体跳必须成为独立 BC。

**本 owner 的判断：不主张拆分为独立 BC。以 contribution + RS stance 承载在实体上是充分的，但残余风险不为零，且残余的形状与 Speaker 在 S-0016 记录的不完全相同。**

理由三条：

1. **拆分的代价已被 lead 与 Speaker 各自独立核实且成立。** 新 BC 编号不在 HS-001 / HS-002 的冻结 scope 内，两个已取得的确认会立即在 `quorum_lint` 上失效并强制追加两次纯重新确认的交棒。本案已两次实测同一约束（S-0008 的 AC-016、S-0013 的 M-13/AC-017）。为一个**不需要生产代码改动**的载体段付两次交棒，代价与收益不成比例。
2. **载体段的实体义务已经有正文归宿。** 它写在 BC-004 的 `admission details` 里，且现在有 AC-012 位置 (E) 的九格把它变成可执行断言。缺的只是 linter 能机械校验的那个 confirmation 字段槽位，不是义务本身。
3. **真正的残余不是「电子载体段没占字段」，而是第三跳有第四个 owner。** 见 M-17 与 U-13 —— 这一条比确认形式更值得写进 SUMMARY。

**因此本 owner 建议 SUMMARY 的 coverage gap 显名项按两条并列，而不是一条**：(a) 载体段义务由 HS-003 contribution 与 RS stance 承载，未占据 BC-004 的两个 confirmation 字段（S-0016 已记）；(b) BC-004 第三跳的实际反解代码位于 `code-owner-shared-arteries` 边界，该 owner 在本案从未被交棒，其对第三跳的义务既无 contribution 也无 stance（本 owner 新增）。(b) 的严重程度高于 (a)：(a) 缺的是形式校验，(b) 缺的是**一个真实 owner 对一段真实代码的任何形式的知情与同意**。

### 5.3 RS 阶段的预登记立场

本 owner 在 RS 冻结后将对自身块（SLOT-004 / AC-012 位置 (E) / BC-004 载体段）登记 **AGREE**，前提是 M-16 与 M-17 被采纳或被 Chief 明示处置。若 M-17 被以「不处理」结案而不作显名，本 owner 将改登记 **OBJECT**，异议仅限于「BC-004 声称是三跳契约，但第三跳无 owner 确认」这一条，不涉及本案任何实体设计。

---

## §6 修改意见

编号续 HS-002 的 M-15。

- **M-16（BC-004 `canonical representation` 第三跳；实质，构成确认条件）**：第三跳的输入不是 main 产出的裸 `` `[${code}] ${message}` ``，而是 Electron 再包一层后的 `` `Error invoking remote method '<channel>': Error: [<code>] <message>` ``（F-E10，本仓 `settings_storage_bridge.js:104` 与其测试 `:718-760` 已明文记载并断言）。后果有二：(i) BC-004 现有正文若被后来者当作规格实现一个新反解器，会很自然地写出**加锚定**的 `/^\[([a-z0-9_]+)\]/` —— 本仓 `run_bundle_storage_bridge.js:16` 正是这个写法 —— 那个写法在包裹形式下返回 null，整条分类链静默退化为「未知 code → paused」，而 `journal_incompatible` 的 quarantine 语义随之丢失，用户 frozen payload 的处置回到今天的样子；(ii) 现有的第三跳测试只覆盖裸形式（F-E13），这条退化今天没有任何测试会红。**建议**：在 BC-004 `canonical representation` 的第三跳描述中补一句「renderer 的实际输入是 Electron 包裹后的字符串，反解正则**不得加起始锚定**」，并把该性质纳入 AC-012 —— 本 owner 已在位置 (E) 的 E1(v) 于载体侧取到该证据，但真正需要它的是第三跳自己（见 M-17）。
- **M-17（BC-004 `consumer` 与 owner 覆盖；实质，构成确认条件）**：BC-004 的 consumer 字段点名 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js` 与 `src/SERVICEs/turn_mutation_outbox.js`，两者都在 chat-core 边界（后者是其显式 carve-out）。但**执行第三跳反解的代码不在其中**：`parseContextV2ErrorCode` / `ERROR_CODE_TOKEN_PATTERN` 位于 `src/SERVICEs/bridges/context_v2_bridge.js:53-57, 77-82`，属 `pupu:src/SERVICEs/bridges/**` = **code-owner-shared-arteries**；rebase 失败的 code 在 `use_chat_stream.js:4069-4072` 由它解析后才进入 chat-core 的分类器（F-E12）。于是 BC-004 这份「三跳契约」实际涉及**四个** owner，其中一个从未被交棒、既无 contribution 也无 stance，而 CLOSED 的准入判据（code token 与格式）恰恰由他那一行正则**实际执行**。**建议按代价排序的三个选项，由 lead 或 Chief 择一**：(a) **最小**——不交棒，只在 BC-004 的 consumer 字段显式补一行「第三跳反解位于 `src/SERVICEs/bridges/context_v2_bridge.js`，owner code-owner-shared-arteries，本案未取得其确认」，并作为 SUMMARY 的第二条 coverage gap 显名交 Chief；(b) **中**——同 (a)，另在 AC-012 位置 (B) 或 (E) 增设一格，断言 `src/SERVICEs/bridges/context_v2_bridge.js:57` 的正则字面量与 electron 侧就地镜像逐字相同且**未加起始锚定**（该格落在谁的文件里决定它属哪个位置，不需要新 AC 编号）；(c) **大**——向 shared-arteries 追加一次 `HS-004`。本 owner 倾向 **(b)**：它把 M-16 的退化变成可红的断言，且不新增编号、不使任何既冻结确认失效；但 (b) 仍不解决「该 owner 未知情」这一点，故 (b) 必须与 (a) 的显名同时做。
- **M-18（BC-004 `admission details` 措辞；非实质）**：「Electron main 不得对 code 做 allowlist 过滤、大小写改写、截断或替换，必须逐字保留」——「逐字保留」在字面上与今日实现的 `.trim()` 有极小出入（F-E4）。建议改为「必须逐字保留任何匹配 `^[a-z0-9_]{1,64}$` 的 code；对该集合外的输入允许且仅允许首尾空白裁剪，不得做任何其他变换」。这既与实现一致，也使 E7 的断言有确定的规格依据。
- **M-19（SLOT-002 A 表脚注；非实质，事实澄清）**：脚注称 `journal_incompatible` 选 409 的理由之一是「preload 与 electron 对 409 body 的透传路径已被覆盖」。**载体不区分 409 与 503**（F-E4/F-E5 只看 `response.ok`），也不把 status 交给 renderer；被覆盖的是共用的 `!response.ok` 路径。409 vs 503 的实际收益在 renderer 语义与既有 terminal code 的一致性上，不在载体上。建议删去或改写该半句，以免验收时被当成载体侧已有 409 专有证据。
- **M-20（PS-003 定位精度；非实质）**：PS-003「与 intake 的偏差」第 6 条把 `createContextV2Error` 定位为 `service.js:1978-1986`，那是 `contextV2Request` 的 catch（调用点）；函数定义在 `:185-189`，注释在 `:181-184`（PS-003 另处写作 `:180-183`，起始行差一）。两处引用都指向真实存在的代码，不影响任何结论，建议在下次集成时把定义与调用点分别写明，便于验收时定位 E4 要锁的那个模板。
- **M-21（AC-012 位置 (E) 的编号约定；程序性）**：位置 (E) 采用 `E1`–`E9` 而非续接「子例 15+」，理由见 §4 首段。若 lead 认为必须与 1–14 同列，本 owner 不反对改为 15–23，但请同时复核 SEQ-004 `cell 到子例映射` 的表述是否会因「子例」指称两类对象而产生歧义。

---

## §7 remaining unknowns

- **U-13 · BC-004 第三跳的 owner 归属如何处置** | lead / Speaker / chief-judge —— M-17 的 (a)/(b)/(c) 三选一。这是本 owner 认为本案剩余的**最大**未闭合项：一份被写作 CLOSED 的三跳契约，其准入判据的实际执行代码没有任何一方确认过。
- **U-14 · AC-012 位置 (D) 的 fixture 是否会被提交入库** | code-owner-runtime / lead —— E2 把载体格的输入绑定到该 fixture（这是让载体段成为「真实 producer → 严格 consumer」的唯一途径）。若 fixture 只在 pytest 运行时生成而不入库，则 `npm run test:electron` 与 `npm run test:frontend` 在未跑过 pytest 的环境里会红。本 owner 的预期是**入库**（renderer 的 jest 也不跑 pytest），并由 AC-011 子例 6 负责重新生成与 diff 校验；请 runtime 在 RS 时确认这一点。若不入库，E2 需退化为「载体侧手抄七 code 表 + 一条与 SLOT-002 A 表的一致性断言」，强度下降一档，本 owner 会据此调整位置 (E) 正文。
- **U-15 · 是否需要真实 Electron IPC（C4）证据** | chief-judge / code-owner-devtools —— E1(v) 只是对 Electron 包裹形式的建模断言。真实证据需 playwright e2e，属 devtools 边界。本 owner 判断**不需要**：包裹形式在本仓已由 settings bridge 的既有测试独立锁定，且 M-17(b) 若采纳会在第三跳自己的文件上取到断言。若 Chief 认为需要，请在 SLOT-006 交棒时一并交给 devtools。
- **U-16 · R6 若改走新 endpoint，位置 (E) 的返修范围** | chief-judge —— 按 S-0017 本棒在两种取舍下都必需。具体差异是：退路会新增一个 channel 与一个 preload bridge 方法，位置 (E) 需**追加**（非重写）三项 —— 新 channel 的 `ipc_channels.test.cjs` 双侧分类格、preload bridge 的 allowlist 重建格（`context_v2_bridge.test.cjs`）、以及 recovery endpoint 自身失败码的 E1/E8/E9 同形三格。E1–E9 的既有九格**全部继续有效、无一需要重写**。本 owner 给出这个量级判断，是为了让 Chief 在裁定 R6 时知道 electron 侧的退路成本是「加三格、零返修」，而不是 PS-003 风险条目 R6 现在写的「从确认透传升级为新增 channel + preload bridge」所暗示的整段重做。**建议 lead 据此收窄 R6 风险条目中对 SLOT-004 的代价描述**（chat-core 侧 M-15 记载的返修代价不受此影响，仍然成立）。
- **U-17 · 既有三槽漂移的 3 处缺 S3 是否要修** | chief-judge —— §3.4。非发布风险，是开发回路损失。本 owner 不在本案动它。

---

## §8 recommended next handoff

1. **若 M-17 取 (c)**：下一棒 `HS-004 | code-owner-shared-arteries`，scope 极小 —— 只需第三跳反解器的 owner 确认与「正则不得加起始锚定」的一格。**本 owner 不建议走 (c)**，理由见 §5.2：为一个零代码改动的性质付一次交棒，且 (b) 已能取到同等强度的断言。
2. **若 M-17 取 (a) 或 (b)（推荐）**：按 Speaker 在 S-0011 / S-0016 的既定队列继续，下一棒 `code-owner-devtools | SLOT-006 / SEQ-007`（release artifact provenance）。本 owner 对该棒的边界提示两点：其一，AC-014 要求同一个 wheel SHA-256 在契约矩阵、package smoke 与 release report 三处逐字相同，本仓已有 `scripts/release-qa/unchain-artifact.mjs` 与 `run-with-unchain-artifact.mjs` 承担该机制，devtools 应确认它们是否已覆盖三处而非两处；其二，若 Chief 采纳 U-15 的真实 C4 证据，请在同一棒交给 devtools，不要为此单开。
3. **不建议为本案召集 `expert-security`**。本 owner 独立复核后与 HS-001 / HS-002 的结论一致，并补一条它们没有的理由：载体层对 code 的**不设限透传**理论上让一个被攻陷的 sidecar 把任意 token 送进 renderer 的 `error.message`，但 (i) message 本体是主进程常量，(ii) 反解结果只用于分类，未知 code 的最坏后果是 `paused`（保留 payload、停止自动重试），(iii) 经实测 `]` 夹带只能反解出第一个括号组，无法把一个条目伪造成 quarantine 或 discard（E7 已把这三点变成断言）。攻陷 sidecar 的攻击者本就能直接发送任何合法 code，透传不构成额外授权面。
4. **实施排序提示（供 PLAN_RULING 后参考，非本棒授权）**：位置 (E) 的九格全部只依赖今日已存在的载体实现，**不依赖 unchain 或 sidecar 的任何改动落地**，唯一外部依赖是 U-14 的 fixture。因此 electron 侧可以在 SLOT-001 / SLOT-002 实施之前就先行取绿（E3/E4/E6/E7/E8/E9 六格立刻可跑，E1/E2/E5 待 fixture）。若 Chief 希望尽早锁住「载体不得漂移」这条今天零覆盖的性质，这是本案成本最低、可以最先落地的一片。
