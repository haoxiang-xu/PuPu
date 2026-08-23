# HS-004 · code-owner-shared-arteries · SLOT-007 交付

- **case**: P-0000-0007-2026-0815
- **handoff**: HS-004 | S-0021 | from code-owner-unchain | return_to code-owner-unchain
- **scope**: PS-004, SLOT-007, BC-004, AC-010, AC-011, AC-012, AC-016, `contributions/HS-001-code-owner-runtime.md`, `contributions/HS-002-code-owner-chat-core.md`, `contributions/HS-003-code-owner-electron.md`, `intake/fact-check.md`, `intake/chief-directive.md`
- **基线**: PuPu `28b1e0ef`（工作树含 P-0000-0003 在途未提交改动：`src/COMPONENTs/chat-input/**`、`src/PAGEs/chat/chat.js`、`src/SERVICEs/context_composition_v1.js`，均不触及 `src/SERVICEs/bridges/**`）
- **production effect**: NONE | 本交付不改动任何生产代码、不新建任何文件；只产出方案正文与可验收的测试义务描述。§2.3 的注释补写是本 owner **请求授权**的唯一生产文件改动（纯注释、零行为），不在本交付内执行
- **本 owner 边界**: `pupu:src/SERVICEs/bridges/**`（charter 显式声明项，非残余条款兜底）
- **stance 预告（供冻结 RS 时参照）**: **AGREE**，唯一条件为 M-27（见 §4.3）。M-22 至 M-26 是措辞与风险面精化，**不构成**同意的条件

---

## §0 本 owner 自行核对的源码事实

PS-004、S-0020、S-0021 与三份 contribution 中凡涉及 `src/SERVICEs/bridges/**` 的表述，本 owner 逐条回源码核对。**F-S5 至 F-S9 是本案至今未记载的事实，其中 F-S6 与 F-S7 改变 R8 的形状。**

| # | 事实 | 取证位置 |
|---|---|---|
| **F-S1** | `ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/`，**未加起始锚定**。注释（:53-56）记载了字符集锁的理由与「code 总在 message 内容之前」，但**没有**记载 Electron 包裹形式，也**没有**记载「不得加锚定」 | `src/SERVICEs/bridges/context_v2_bridge.js:53-57` |
| **F-S2** | `parseContextV2ErrorCode` 取 `error.message`（非字符串则空串），`ERROR_CODE_TOKEN_PATTERN.exec(message)`，命中返回第一个捕获组否则 `null`。**无 `error.code` 快路径** | 同文件 `:77-82` |
| **F-S3** | 该模块自述为「intentionally dumb：可用性探测、promise 整形与错误码解析」，明示**不做任何自有校验**（main 是唯一校验边界），不持状态、不碰 localStorage | 同文件 `:1-30` |
| **F-S4** | `rebaseSession` 是 `REQUIRED_METHODS` 第 5 项，经 `invokeBridge` 透传，不做错误处理；其 rejection 原样上抛 | 同文件 `:37, :86-94, :106` |
| **F-S5** | **PS-004 对本 owner 边界的表述有一处需精化。** 该正则并非「CLOSED 准入判据」的**完整**执行点：它执行字符集锁与 `] ` 分隔符，并完成**位置无关的首 token 选择**；它**不**执行 `{1,64}` 长度上界（`+` 即 1..∞），也**不**执行封闭 code 集合成员判定（在 chat-core 的分类段）。四元素归属见 §1.1 | `src/SERVICEs/bridges/context_v2_bridge.js:57`；对照 BC-004 `admission details` |
| **F-S6** | **该正则是一条共享动脉，服务 5 个 call site、4 个文件、3 个 owner**，其中只有 2 个在本案的 rebase 路径上。完整清单见 §3.1 | `git grep parseContextV2ErrorCode -- src` |
| **F-S7** | **R8「今天没有任何测试会因此变红」属实，但被低估了一档：存在一个看上去覆盖了该解析器、而在锚定回归下仍会保持绿的测试。** `trace_chain.memory_v2.test.js` 用 `jest.mock` 替换整个 bridge，并在 mock 工厂内**就地重实现**了一份**正确的、未加锚定的** `/\[([a-z0-9_]+)\]\s/`；因 CRA 的 `resetMocks: true`，该实现在 `beforeEach` 中再次重建。该 mock 本身是正确做法（组件测试不该依赖真 bridge），问题只在于：审计「解析器有没有被测」时按函数名 grep 会得到**假阳性** | `src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js:23-26, :101-104`（chat-bubble 边界，本 owner 只读，不动） |
| **F-S8** | 本仓四份 bracket-code 解析器中，**三份未加锚定**（`context_v2_bridge.js:57`、`memory_vault_bridge.js:75`、`settings_storage_bridge.js:110`，三者字面量逐字相同），**一份加锚定**（`run_bundle_storage_bridge.js:16`）。S-0020 与 PS-004 称之为「同目录先例」，属实 | 见各文件行号 |
| **F-S9** | **该加锚定的先例是一处 latent defect，但当前惰性。** `run_bundle_storage_bridge.js:13-18` 既有 `error.code` 快路径又有锚定正则，而 `register_handlers.js:11-54` 三个 handler 全部 `throw error` 穿过 `ipcMain.handle` —— Electron 在此剥掉 `error.code` 并包裹 message，故**两条路径在生产中都恒失效**，`parseRunBundleStorageErrorCode` 对任何真实 IPC rejection 恒返回 `null`。**但它当前零消费者**（导出后从未被 import），故无行为依赖它，不是活 bug。处置见 §5.2 | `src/SERVICEs/bridges/run_bundle_storage_bridge.js:13-18`；`electron/main/services/run_bundle_storage/register_handlers.js:11-54`；`git grep parseRunBundleStorageErrorCode` |
| **F-S10** | 引用精度：注释实际在 `settings_storage_bridge.js:101-109`（正则在 `:110`），PS-004 记 `:100-108`；其包裹形式测试实际在 `settings_storage_bridge.test.js:716-737`（`describe` 起于 `:702`，首/末 token 与 null 三格延伸至 `:764`），PS-004 记 `:718-760`。两处**均不构成错误**（行段覆盖到了对象），仅供引用时取准 | `src/SERVICEs/bridges/settings_storage_bridge.js:101-110`；`settings_storage_bridge.test.js:702-764` |
| **F-S11** | 本仓已有「读源码文本作断言」的守卫测试家族，可直接沿用其形制：`fs.readFileSync` + 对源码文本断言 | `src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js:1-5`；本 owner 自有的 `src/SERVICEs/boot_shell_inline_script.test.js` |
| **F-S12** | 本仓 eslint 配置为裸 `react-app` + `react-app/jest`，无自定义 plugin、无 flat config、无 local rule 装载点 | `package.json:103-108` |

---

## §1 交付一 · 反解段 owner confirmation

### 1.1 确认：是，但准入判据须按四元素分列

**本 owner 确认**：`src/SERVICEs/bridges/context_v2_bridge.js` 的 `ERROR_CODE_TOKEN_PATTERN`(:57) 与 `parseContextV2ErrorCode`(:77-82) 属本 owner 边界（`pupu:src/SERVICEs/bridges/**`，charter 显式声明项），并且是 BC-004 第三跳上 renderer 侧**唯一**把传输串还原为分类输入的代码路径。在此意义上，S-0020 与 PS-004 对本段的定位成立，本 owner 接受该责任。

**但 PS-004 的措辞需精化。** BC-004 `admission details` 把准入判据写作「code 匹配 `^[a-z0-9_]{1,64}$` 且紧跟一个空格，且属于封闭 code 集合」，而 `consumer` 字段称「CLOSED 准入判据由这一行正则**实际执行**」。逐元素核对后，该断言对其中三项成立、对两项不成立：

| # | 准入元素 | 实际执行点 | 责任方 |
|---|---|---|---|
| (i) | 字符集锁 `[a-z0-9_]` | `ERROR_CODE_TOKEN_PATTERN` 的字符类 | **shared-arteries** |
| (ii) | code 后紧跟分隔空白（`\]\s`） | 同一正则 | **shared-arteries** |
| (iii) | token 选择：**位置无关、首个匹配胜出** | `.exec()` 于未锚定模式上的首次匹配语义 | **shared-arteries** |
| (iv) | 长度上界 `{1,64}` | **消费侧无任何执行点**（`+` = 1..∞） | producer 义务；载体按 AC-012 E3 明示**不得**守门 |
| (v) | 封闭 code 集合成员判定 | `context_v2_turn_mutation.js` 的分类段 | code-owner-chat-core |

**(iv) 在消费侧不被执行是安全的，且本 owner 不要求补上**：超长 token 落为未知 code，经 §3.2 的链路走有界重试→`paused`，既不 quarantine 也不 discard。给它加长度门反而会把一个本可保守降级的输入变成 `null`，语义无改善。但 BC-004 现文措辞会让读者以为该行正则守住了 `{1,64}`，这正是下一个改这行代码的人可能踩的第二个坑。→ **M-22**。

一处更细的精度差：BC-004 写「紧跟一个**空格**」，实现是 `\s`（任意空白，含 `\t` / `\n`）。producer 模板 `` `[${code}] ${message}` `` 恒产出字面空格，故今天无差异；实现比契约文本**略宽**。本 owner 建议对齐**文本**而非收紧实现（无已证需求的行为改动不做）。→ **M-24**。

### 1.2 「不得加起始锚定」：接受为持续义务，但须按行为重述

**本 owner 接受**该义务为 `src/SERVICEs/bridges/context_v2_bridge.js` 边界内的**持续义务**，并接受由本 owner 承担其防护与后续维护。

**但「不得加 `^` 锚定」是按语法形式表述的禁令，欠定。** 下列改法**全部满足该禁令的字面**，而破坏效果与加锚定**完全相同**（本 owner 逐条在纸面推演，均使包裹形式反解为 `null` 或错值）：

1. 改为 `/^\[([a-z0-9_]+)\]/`（教科书式，即 F-S8 的既有先例）；
2. 保留未锚定正则，但加前置守卫 `if (!message.startsWith("[")) return null;`；
3. 保留未锚定正则，但加 `if (message.indexOf("[") !== 0) return null;`；
4. 改用 `message.split(": ")[0]` 之类的「先剥包裹再解析」写法 —— 包裹层的 channel 名本身含 `:`，切分点不唯一；
5. 给正则加 `y`（sticky）标志，`lastIndex` 为 0 时等价于锚定；
6. 加尾锚 `$`（使任何带后续 message 内容的输入失配，比锚头更彻底）。

因此**本 owner 接受并主张的义务形状是行为式的**：

> **`parseContextV2ErrorCode` 必须能从 message 字符串的任意位置还原出第一个 `[<code>] ` token。任何使还原结果依赖该 token 在字符串中位置的改动，均被禁止。**

「不得加起始锚定」是该义务的一个特例，不是它的全部。→ **M-23**。这条重述同时决定了 §2 的防护为什么必须以**行为**为主、以源码文本为辅：只有行为断言能同时覆盖上述六种改法。

### 1.3 关于「反解段是否必须独立成 BC」

S-0020 与 S-0021 请本 owner 表态。**本 owner 明确回答：不要求拆分，且不以此为同意的条件。**

理由：本 owner 需要的是**知情与同意被留痕**，contribution + RS stance 已完整承载这一点；而拆分的机械代价（使 HS-001 与 HS-002 两个已冻结确认同时失效、强制两次纯重新确认交棒）已由 lead、electron owner 与 Speaker 三方各自独立核实，本案亦已三次实测同一约束。为一次形式对齐付这个代价不成比例。S-0022 (c) 把它定性为 boundary protocol v1 的结构性限制而非任何一方疏漏，本 owner 同意该定性。是否拆分仍属 Chief 裁量，无论裁定为何，本 owner 的实体立场不变。

---

## §2 交付二 · 防护形状（本 owner 定义）

设计判据：§1.2 已证明这条义务是**行为性**的，故防护主体必须是行为断言；源码文本断言只能作从属层，且其价值在**可理解性**而非**可检出性**（行为层已能检出全部六种改法）。本 owner 不为了看起来更严密而把从属层说成主防护。

### 2.1 第一层（主防护，行为）· 双变体 + 属性断言，共 7 格

落在 `src/SERVICEs/bridges/context_v2_bridge.test.js` 新增 `describe`，调用**真实**的 `parseContextV2ErrorCode`。7 格正文见 §3.3（G1–G7）。这是唯一能检出 §1.2 全部六种改法的一层。

### 2.2 第二层（从属，源码文本）· 1 格

同文件 `fs.readFileSync` 读 `context_v2_bridge.js` 源码文本，断言不存在位置依赖式解析（G8，正文见 §3.3）。

**本 owner 对这一层的诚实评估**：它**不增加检出能力**（G2/G3 已覆盖），它买的是三样东西 —— 其一，失败信息可以逐字指名 BC-004 与本案编号，而 G2 的失败信息只会说「expected 'context_v2_…', received null」，后者容易被下一个人当成「测试过期了」而顺手改掉测试；其二，它对**尚未写出的**位置依赖写法（§1.2 之外的第七种）仍会红；其三，它使「这行不能随便动」成为源码级事实而非口头约定。

它的代价是**脆性**：任何对该正则字面量的改动（哪怕是收紧 `\s`→` ` 这种合理改动）都会让它变红。**本 owner 认为该脆性正是机制本身**——它是一道「请先回去读 BC-004」的理解闸，不是回归闸。接受这一点才应采纳这一层；不接受则应只采纳第一层，本 owner 对两者都可接受，第一层是不可省的那个。

### 2.3 第三层（注释，**需授权，不在本交付内执行**）

`context_v2_bridge.js:53-56` 的注释今天写的是字符集锁的理由，**没有一个字**提到 Electron 包裹形式或锚定禁令 —— 而同目录 `settings_storage_bridge.js:101-109` 把这两件事都写清楚了（「a ^-anchored pattern never matches in production」）。**这就是陷阱得以存在的直接原因：同一份知识在一个文件里有、在另一个文件里没有，而没有的那个恰好是本案的执行点。** 本 owner 判断这是三层里**单位成本最低、防止「无知情改动」最直接**的一层 —— 因为它作用在人打开文件的那一刻，早于任何测试。

拟补写内容（要点，非最终字面）：本 token 是 BC-004（P-0000-0007-2026-0815）第三跳的 CLOSED 准入执行点；renderer 实际输入是 Electron 包裹形式而非裸串；不得加锚定、不得引入任何位置依赖；本行的语义由 `context_v2_bridge.test.js` 的 G1–G8 锁定。

**纯注释、零行为改动，但仍是生产文件改动**，故本 owner 不在本交付内执行，**请求在 PLAN_RULING 中一并授权**。

### 2.4 已评估并**否决**：目录级 lint 规则

S-0020 把它列为可选项，本 owner 评估后**不采纳**，三条理由：(a) 本仓 eslint 为裸 `react-app`，无 plugin 装载点（F-S12），要加自定义规则须引入本地 plugin 包或迁 flat config —— 为 4 个解析器做这件事不成比例；(b) CRA 的 lint 在 **build/dev 期**执行，不是 `test:frontend` 的门，因此它给不了本案要的那种**测试门**；(c) 真正的漂移面是**语义**（位置依赖）不是**字面**，正则字面量的 lint 匹配写不准，容易产生假阴性并给人虚假安全感。**记录为「已考虑并否决」以免日后重复提议。**

---

## §3 交付三 · 取证位置与可验收正文

### 3.1 先确定被保护对象的真实范围（这决定了取证强度）

本 owner 核出 `parseContextV2ErrorCode` 的完整消费面（F-S6）：

| # | call site | 用途 | owner |
|---|---|---|---|
| 1 | `use_chat_stream.js:4072` | **本案路径** · rebase 失败码 → 分类段 | code-owner-chat-core |
| 2 | `use_chat_stream.js:3979` | **本案邻接** · `getSessionHead` 失败码 → `decideTurnMutationMemoryMode` | code-owner-chat-core |
| 3 | `memory_v2_journal_reload.js:274` | journal 重载失败的 `errorCode` 投影 | code-owner-chat-bubble |
| 4 | `memory_v2_pending_reviews.js:180` | 待审复核的错误呈现 | code-owner-chat-bubble |
| 5 | `memory_v2_tree_state.js:106, :114, :445` | tree 状态；**`:114` 用 `=== STORE_DISABLED_CODE` 严格相等**判定「store 关着」而非「坏了」 | shared-arteries（**残余条款**，见 §5.3） |

**结论：本 owner 这一行不是 BC-004 的专属零件，而是一条 5 call site / 4 文件 / 3 owner 的共享动脉，本案路径只占其中 2 个。** 锚定回归的真实爆炸半径因此大于 BC-004 现文所述（→ **M-25**）：

- 本案路径：新 code 的 quarantine 语义丢失，`recovery_required` 的专属两级阶梯（250/750→quarantine）退化为 12 级共享阶梯→`paused`；
- **既有九个 terminal-discard code 一并失效** —— 它们会从「立即删除条目」退化为「12 次无谓重试后 paused」，陈旧条目开始堆积。这一项 BC-004 现文未提；
- call site 5 的 `:114` 严格相等在 `null` 下恒为 false → 一个**关着**的 store 会渲染成 **ERROR** 而不是 DISABLED；
- call site 3、4 的 code 投影全部降级为各自的 fallback 常量。

### 3.2 一项本 owner 认为必须核实、且核实结果**支持**现有结论的事

R8 的严重性取决于「解析失败之后会怎样」。本 owner 未采信任何一方转述，直接核源码：两个 rebase 路径 call site 均为 `parseContextV2ErrorCode(error) || "context_v2_failed"`（`use_chat_stream.js:3979, :4072`），而 `TERMINAL_REBASE_ERROR_CODES` 是九个 conflict code 的封闭集合、**不含** `context_v2_failed`（`context_v2_turn_mutation.js:367-377, :386`，只读核对，不动其文件）。

**故：解析失败 → `context_v2_failed` → 非 terminal → 有界重试 → `paused`，frozen payload 被保留。** PS-004 对 R8 的描述（「静默退化为『未知 code → paused』」）**准确无误**，本 owner 予以确认，并据此把 R8 定性为**语义退化 + 每条 frozen 条目至多 12 次无谓重试（上限 60s 退避）**，而**不是数据丢失**。这条边界值得写进 R8，以免日后被当成 P0 数据丢失风险误判优先级。→ **M-25**。

### 3.3 取证位置与可验收正文

**位置**：`src/SERVICEs/bridges/context_v2_bridge.test.js`，新增 `describe("BC-004 third hop — error code recovery across the Electron IPC wrapper")`。

**这是 AC-012 的一个新取证位置，不新增 AC 编号**（与 S-0021 `scope verification` 一致；与位置 (E) 用 `E1`–`E9` 同一理由，本段用 `G1`–`G8`）。

**归属与执行**：该文件在 `src/**` 内，由 `react-scripts test` 收集，**不涉及 `.js`/`.cjs` 双胞胎规则**（那是 `electron/**` 专有）。执行 `npx react-scripts test --watchAll=false --testPathPattern context_v2_bridge`，**不得直接 `npx jest`**。同步验证只需一步：`npm run test:frontend` 的总用例数相对改动前**严格增加 8**，不接受「全绿」作为已运行的证据。

**严格 consumer 规则在本位置的正确适用（重要，见 M-27）**：AC-012 位置 (E) 规定「反解正则必须就地字面量、**不得** import `context_v2_bridge.js`」。该规则**对 electron 成立且必须保持**——那里的被测对象是**载体**，若 import 本 owner 的实现，就成了 producer 与 consumer 共用一份实现互证。**但它不能原样套到本位置**：本位置的被测对象**就是**该解析器本身，G1–G7 **必须**调用真实导出的 `parseContextV2ErrorCode`，否则测的是测试自己写的正则、与生产代码彻底脱钩，防护归零。就地字面量在本位置只出现在 G8（作为源码文本的期望值），不作为行为断言的替身。**producer 真实性由另一条途径保证**：G2/G3 的输入 code 全部逐条读自 AC-012 位置 (D) 的 fixture，不手抄（与位置 (E) 的 E2 同法）。

**八格正文**：

- **G1 · 裸形式回归锁（今日唯一覆盖，保留并扩充）**。对本案两个新 code 与至少一个既有 terminal code，`parseContextV2ErrorCode(new Error("[<code>] context v2 request failed"))` 逐字 `toBe(<code>)`。**本格在锚定回归下仍会通过** —— 这是它的价值：它与 G2/G3 的对比构成 R8 的直接经验证据（见下方 red-before-green）。
- **G2 · 包裹形式变体 A，由 fixture 驱动**。读取位置 (D) fixture `src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json`；对其中每个 `{code}`，构造 ``  `Error invoking remote method 'context-v2:rebase-session': [${code}] context v2 request failed` `` 断言逐字 `toBe(code)`。**fixture 缺失、非数组、为空数组或任一元素缺 `code` 键时必须 FAIL 而非 skip。**
- **G3 · 包裹形式变体 B（含 `Error: `），同一 fixture 驱动**。构造 ``  `Error: Error invoking remote method 'context-v2:rebase-session': [${code}] context v2 request failed` `` 断言逐字 `toBe(code)`。G2 与 G3 合起来覆盖 M-16 认定的两种记载变体，**不硬编码任一种**。
- **G4 · 首 token 胜出 / `]` 夹带不可伪造 quarantine**。(a) 包裹形式下 message 为 `` `[x] [context_v2_rebase_journal_incompatible] …` `` 时 `toBe("x")` 且显式 `.not.toBe("context_v2_rebase_journal_incompatible")`；(b) 镜像 settings bridge 已锁的形态，后出现的方括号数字段（如 `… exceeds [1048576] bytes`）**永不**覆盖首 token。本格是位置 (E) E7 走私格在**真实决策点**上的对应格 —— E7 证明载体不改写，G4 证明解析器不被骗。
- **G5 · 非法字符集 fail-closed → `null`**。`"CONTEXT_V2_UPPER"` / `"has space"` / `"has-dash"` 三个 token，**裸形式与包裹形式各一次**，共 6 次断言，全部 `toBeNull()`。落未知 code 进 `paused`，而非被误解析成某个已知 code。（附注：包裹层的 channel 名含 `-` 与 `:`，均在字符集外，故即便 channel 名里出现方括号也不能伪造出 code；本格顺带覆盖该性质。）
- **G6 · 分隔符是承重的（已知并接受的性质，显式留档）**。`"Error invoking remote method 'x': plain wrapped failure"` → `null`；`"no code here"` → `null`；**`"[context_v2_failed]"`（无尾随空白）→ `null`**。第三条断言的是「`\]\s` 中的 `\s` 不可省」这一今天没人写下来的性质。**它与位置 (E) 的 E4 是同一不变量的两半**：E4 锁住载体恒发射 `` `[code] ` ``（含空格），G6 锁住解析器要求那个空格。两格必须同生共死 —— 若日后有人改 E4 的模板去掉空格，G6 会红，反之亦然。
- **G7 · 防御性输入 → `null`**。`null`、`undefined`、`{}`、`{ message: 123 }`、`new Error()`（message 为 `""`）。锁住 `:78-79` 的 `typeof error.message === "string"` 守卫。
- **G8 · 源码形状守卫（第二层）**。`fs.readFileSync` 读 `context_v2_bridge.js`：(a) 断言源码文本中**不出现**锚定式方括号解析（`/\/\^\\\[/` 不匹配）；(b) 断言 `ERROR_CODE_TOKEN_PATTERN` 的赋值恰出现一次且其字面量逐字为 `` /\[([a-z0-9_]+)\]\s/ ``。两条断言的失败信息**必须逐字包含** `BC-004`、`P-0000-0007-2026-0815` 与 §1.2 的行为式义务原文，使失败者被导向契约而不是导向「改掉这个测试」。形制沿用 `shell_background_guard.test.js`（F-S11）。

**red-before-green（本 owner 要求保存记录的格）**：**G2、G3、G4、G8**。统一取红方法：把生产正则临时改为 `/^\[([a-z0-9_]+)\]\s/`，记录 **G1 保持绿而 G2/G3/G8 变红**。

> **这份 red 记录本身就是本案对 R8 的直接经验证据**：它现场证明「今天的覆盖（G1 形态）对该退化完全盲」，把 R8 从推演升级为实测。本 owner 建议 lead 在集成时保留这一句，因为它是本棒相对于「只在 electron 侧镜像断言」（M-17 的 (b)）多出来的、无法在别处取得的东西。G4 另以「把 `.exec` 换成 `.match` 后取 `[0]`」取红。G5/G6/G7 的取红为建议项。

### 3.4 与其他 owner 的取证依赖（一条，需 lead 转达）

G2/G3 读 `src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json` —— chat-core 目录下、由 runtime 的 AC-011 子例 6 产出的文件。加上位置 (D) 自身与位置 (E) 的 E2，**该 fixture 现在有三个 owner 的测试读它**。本 owner 请求：在 PLAN_RULING 中把该路径视为**稳定引用点**；若最终落在别处，本 §3.3 的 G2/G3 路径须在同一次编辑中更新。这是一条协调事项，不是异议。

---

## §4 交付四 · 对 AC-010 / AC-011 / AC-012 的知情确认

### 4.1 AC-010 — **CONFIRMED（无条件）**，并附一条强化事实

AC-010 全部落在 sidecar 侧（既有 reason 的 `str(error)` 字节同一性、旧关键词分类器回放），本 owner 边界内无任何执行点：本段只看见两次覆写之后的 code token。

**附一条本 owner 实测的强化事实**：AC-010 第三款要求「新增 reason 在未升级分类器下不落入任何会丢弃 frozen outbox 的分支」。该性质**在本 owner 这一段完全失效时依然成立** —— 因为解析失败得到的是 `context_v2_failed`，而它不在九个 `TERMINAL_REBASE_ERROR_CODES` 之内（§3.2 已核）。即：**AC-010 的安全性质对 R8 回归是稳健的。** 这不改变 AC-010 的正文，只是把它的成立条件说清楚。

### 4.2 AC-011 — **CONFIRMED（有一项条件，非实体异议）**

本 owner 只依赖子例 6 的**产物**（fixture），不依赖其内部方法。对 U-14 的入库定案**明确赞成**：本 owner 的 G2/G3 与 electron 的 E2 同理，`react-scripts test` 不跑 pytest，不入库会使 `test:frontend` 在未跑过 pytest 的环境里红。

**条件**：fixture 须为数组、每元素含 `code` 键、且覆盖七个 code 全集。若形状与此不符，§3.3 G2/G3 的正文须同步调整（调整可在实施期完成，不需回棒）。

### 4.3 AC-012 — **CONFIRMED_CONDITIONAL**

- 位置 (A)(B)(C)（chat-core）、(D)（fixture）、(E) 九格（electron）：本 owner 逐条读过，**无异议**，知情确认。位置 (E) 的 E4 与本 owner 的 G6 构成同一不变量的两半（§3.3），E7 与 G4 构成走私防护的载体侧/决策点侧两格 —— 本 owner 确认这四格互不重复、缺一则该性质只被单侧覆盖。
- 新增本 owner 的 G1–G8 为一个新取证位置，**不新增 AC 编号**。
- **条件（唯一，且是本 owner 同意的前提）**：AC-012 中「反解正则不得从实现 import、须 in-file 重声明」这一句，必须**明确限定于位置 (E) 的载体格**。若原文被理解为对本位置同样生效，则本 owner 的 G1–G7 无法调用真实解析器，防护形状不成立、本棒交付作废。→ **M-27**。本 owner 判断原文的立法意图本就只针对载体（其理由「producer 与 consumer 共用一份实现即不成其为契约测试」在本位置反而要求相反做法），故这多半只是文字覆盖面问题，但因它决定交付能否成立，本 owner 必须把它列为条件而非建议。
- **程序性确认**：S-0022 已记「冻结 RS 时 AC-012 应同时列入这几位 owner 的 owned block 或直接依赖范围」。本 owner 确认需要该处置，否则会出现对自己撰写的正文无权登记 stance。

### 4.4 AC-016 — **无依赖**

AC-016 为 LEAD 自身的只读 plan 定位辅助，由 LEAD 确认，本 owner 边界内无执行点，无意见。

---

## §5 建议采纳的修正（M-22 至 M-27）与两条边界信号

### 5.1 修正项

- **M-22（BC-004 `consumer` 字段；精化）**：把「CLOSED 准入判据由这一行正则**实际执行**」改为 §1.1 的四元素分列 —— 该正则执行**字符集锁、`] ` 分隔符与位置无关的首 token 选择**；**不**执行 `{1,64}` 长度上界（消费侧无执行点，属 producer 义务，载体按 E3 明示不得守门），**不**执行封闭集合成员判定（属 chat-core 分类段）。理由：现文会让下一个改这行的人误以为长度门在此。
- **M-23（BC-004 `admission details`；实质强化）**：把「反解正则不得加起始锚定」改为行为式义务 —— 「**必须能从 message 任意位置还原第一个 `[<code>] ` token；任何使还原结果依赖该 token 位置的改动均被禁止**」，并把「加起始锚定」标注为其一个特例。理由见 §1.2：现文是语法禁令，至少有六种改法满足其字面而破坏效果相同。
- **M-24（BC-004 `admission details`；措辞精度）**：「紧跟一个空格」→「紧跟一个 ASCII 空白字符（实现为 `\s`）」。实现比契约文本略宽；建议对齐文本，不改实现。
- **M-25（风险 R8；扩面 + 定界，**在原条目内修改，不新增编号**）**：(a) 爆炸半径扩为 5 call site / 4 文件 / 3 owner（§3.1 表），并显名两项现文未提的退化 —— **既有九个 terminal-discard code 一并失效**（陈旧条目堆积）与 `memory_v2_tree_state.js:114` 的「store 关着」被误呈现为 ERROR；(b) 同时**定界**：解析失败落 `context_v2_failed`，该 code 不在九个 terminal 集合内，故 **frozen payload 不会被销毁** —— R8 是语义退化 + 每条至多 12 次无谓重试，**不是数据丢失**（§3.2 实测）。
- **M-26（风险 R8；补事实）**：「今天没有任何测试会因此变红」补一句 —— 更精确地说，存在一个**看上去覆盖了该解析器、而在回归下仍保持绿**的测试（`trace_chain.memory_v2.test.js:23-26, :101-104` 以就地重实现的正确正则 mock 掉整个 bridge）。该 mock 本身正确，问题只在于按函数名审计覆盖会得到假阳性。**chat-bubble 边界内无需任何动作**，本 owner 的 G1–G8 落地后该盲区即闭合。
- **M-27（AC-012；本 owner 同意的条件）**：把「反解正则不得从实现 import、须 in-file 重声明」明确限定于**位置 (E) 的载体格**；新增本 owner 位置的相反规则 —— **G1–G7 必须调用真实导出的 `parseContextV2ErrorCode`**，producer 真实性改由「输入逐条读自位置 (D) fixture」保证。理由见 §3.3。

### 5.2 边界信号一 · `run_bundle_storage_bridge.js` 的 latent defect（**不在本案处置**）

F-S9 已核实：`parseRunBundleStorageErrorCode` 的两条路径（`error.code` 快路径与锚定正则）在生产中**均恒失效**，因其 handler 穿 `ipcMain.handle` 抛出而 Electron 剥 code 并包裹 message。**当前零消费者，故不是活 bug**，而是——用最准确的话说——**坐在同一个目录里、等着被复制的错误范本**。它正是 R8 所描述的那次回归**已经在隔壁文件里发生过**的实例。

**本 owner 不在本案修它**：不在 `write_set` 内，无授权，且与本案的 quiescence 契约无因果关系。**建议另立一案**（一并评估 `memory_vault_bridge.js` 是否也需同形守卫）。记录于此，是为了让这条知识不再只存在于本次调查里。

### 5.3 边界信号二 · 残余条款（charter 义务，必须报）

`src/SERVICEs/memory_v2_tree_state.js`（call site 5）**不在本 owner charter 的任何显式声明项内**，仅由**残余条款**兜底。按 charter，接住残余文件必须报边界维护信号：

- **实测事实**：该文件的生产消费者**有且仅有一个** —— `src/COMPONENTs/memory-inspect/memory_v2_tree_view.js`（另有其自身的 `memory_v2_tree_state.test.js`）。
- **长期应属于谁**：**code-owner-settings**。其 charter 显名 memory-inspect 与 diff views；该文件是单消费者的**视图状态机**（`MEMORY_V2_TREE_STATES` 的 DISABLED / ERROR / … 投影），不具备「多方消费、单点定义」的动脉特征，留在 shared-arteries 只因文件恰好落在 `src/SERVICEs/` 路径下。
- **本信号不自动扩张本案**，也不请求在本案内调整所有权。所有权调整须另以方案裁定。

---

## §6 remaining unknowns

1. **AC-012 位置 (D) fixture 的最终路径与形状** | code-owner-runtime / code-owner-chat-core / lead —— §3.4 与 §4.2。三个 owner 的测试读同一文件，路径若变动需同步更新 §3.3 的 G2/G3。**不阻断**，可在实施期解决，不需回棒。
2. **M-27 是否被采纳** | lead —— 这是本 owner 唯一的条件项。若 lead 认为 AC-012 现文本就不约束本位置，请在集成时明写一句即可，效果等同。
3. **§2.3 的注释补写是否获授权** | chief-judge —— 本 owner 请求的唯一生产文件改动（纯注释、零行为）。若不授权，第一层与第二层防护仍然成立，只是「打开文件那一刻」的那道闸缺失。
4. **§2.2 第二层（G8）是否采纳** | lead / chief-judge —— 本 owner 已如实说明它不增加检出能力、且其脆性即其机制。采纳与否本 owner 都接受；**第一层是不可省的那个**。
5. **BC-004 是否拆分** | chief-judge —— §1.3。本 owner **不要求**拆分，且不以此为条件；无论裁定为何，实体立场不变。
6. **R6** —— 不在本 owner 边界，**无立场**。本 owner 的 G1–G8 八格在 R6 的两种取舍下**全部继续有效、无一需重写**（它们只依赖 message 字符串形状，不依赖 channel 或 endpoint 拓扑）。若走新 endpoint 退路，本位置**零追加、零返修**。这条量级判断供 Chief 裁定 R6 时使用。
7. **§5.2 的 latent defect 何时处置** | chief-judge —— 建议另立一案，不在本案。

---

## §7 recommended next handoff

1. **本 owner 边界内不需要再开棒。** 本件已覆盖 S-0020 四项交付的全部内容，含防护形状、可验收正文与知情确认。
2. **下一棒按 Speaker 在 S-0022 的既定队列**：`code-owner-devtools | SLOT-006 / SEQ-007`。本 owner 对该棒无边界交集，无附加要求。
3. **不建议为本案追加任何专家参与。** 本 owner 独立复核后与 HS-003 §8.3 的安全结论一致，并补一条本 owner 侧的实测支撑：`]` 夹带在**真实解析器**上只能取出第一个括号组（G4 将把它变成断言），故被攻陷的 sidecar 无法把一个条目伪造成 quarantine 或 discard；且解析失败的最坏后果是 `paused`（保留 payload），不是数据丢失（§3.2）。
4. **实施排序提示（供 PLAN_RULING 后参考，非本棒授权）**：G1、G4、G5、G6、G7、G8 六格**只依赖今日已存在的实现**，不依赖 unchain、sidecar 或 fixture 的任何改动，**立刻可跑**；仅 G2、G3 待位置 (D) fixture。与 electron 位置 (E) 的情况相同，本片同样可以在 SLOT-001 / SLOT-002 实施之前先行取绿。若 Chief 希望尽早锁住这条今天零覆盖、且已被证实有同目录反例的性质，本片与位置 (E) 是本案成本最低、可最先落地的两片。
