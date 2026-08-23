#### S-XXXX | ASSESSMENT | code-owner-settings → case
- **阶段**: 议案庭审
- **结论**: **有条件可行，且必须按挂载点切成两半判定** —— side-menu 那一路（`mode="session"`）**可行**，前提是挂载点显式补传 `ownerChatId`（一个 prop 契约变更，落在 `code-owner-chat-core` 的文件里，不在我边界内）；settings 那一路（`mode="long_term"`）**以今天的 API 面不可行** —— 该挂载点在作用域内没有任何 chat 上下文（E-B3），而 V2 的整个读平面是 owner-scoped 的（E-B4），二者是模型不匹配，不是接线漏了。`ownerChatId` **不卡死本议案**，但它把议案的适用面砍掉一半，这一半必须由 CEO 显式取舍，不能在方案庭审才发现
- **依据**: E-B1, E-B2, E-B3, E-B4, E-B5, E-B6, E-B7, E-0003, E-0005, E-0006, 0000-0003-2026-0807#S-0005
- **不确定性**:
  1. **未起 sidecar、未发过一次真实请求、未运行应用、未跑测试。** 全部结论来自 PuPu `b2385d5d` 的静态阅读。凡涉及 `get_tree` 运行时行为的，我一律标为「归 `code-owner-runtime`」。
  2. **本机 V2 store `entries=0`（G2）。** 「有数据时 tree 有多少节点、深度多少、渲染是否撑得住」**结构上无法取证**，本发言中任何涉及正常态的量级判断都是 **推断**。
  3. **`node.chatId` 与 `use_chat_stream` 的 `currentChatId` 是否严格同一个 id 空间**，我做到了强旁证（E-B2）但没有做到证明 —— 两者都从 `chatStore` 取，且 `use_chat_stream.js:11985` 把 `currentChatId` 直接当 `ownerChatId` 用。**请 `code-owner-chat-core` 在自己边界内确认**，这一条若翻转，我的 Q1 结论前半段随之翻转。
  4. **`requireContextV2OwnerChatId` 缺参/错参时的行为归 `code-owner-electron`（G5）。** 我只核到正则会 **接受** 一个语义错误的 id（E-B2），没核到缺参路径。
  5. **发布构建的 `enable_memory_v2` 快照未核实**（与 `0000-0003-2026-0807#S-0005` 不确定性 3 同源，至今未消除）—— `.local/build_feature_flags.snapshot.json` 不入库，`FEATURE_FLAG_DEFINITIONS` 里的 `defaultValue: false` 不是发布值。任何「反正 flag 是关的所以不急」的论证，请先问是哪一份快照。
- **请求/下一步**:
  1. **请本庭把议案的适用面明确成一问交 CEO**：tree view 是只给 **per-chat** 的 Inspector（side-menu 入口），还是 settings 那个全局 Inspector 也要有？**这两个答案导出两套完全不同的可行性结论**（前者是接线，后者需要一条今天不存在的 owner-less 读路由）。我按「只给 per-chat」承接；若答案是两者都要，请把它当作 **新的待裁问题** 而不是实施细节。
  2. **请 `code-owner-chat-core` 确认** `0000-0003-2026-0807#S-0024` C4 的「挂载接口补 `ownerChatId` 且破坏面为零」承诺 **今天是否仍然有效**，并确认 side-menu 右键两条分支（普通 chat / character chat，E-B2）**各自应当传什么值**。character chat 那条分支今天传的是 `character_<x>__dm__<y>`，**它不是 chat id**。
  3. **请 `code-owner-runtime` 回答（G3 的服务端半边）**：`get_tree` 在 (a) space 存在但 `entries=[]`、(b) space 不存在、(c) owner 从未存在过、(d) `store_owner=off` 四种情况下各自的 HTTP 状态与 body。**(c) 是本案独有的新问题**，前案没问过 —— 它决定了 E-B2 的「静默错主」是会被后端挡住还是会静默返回空树。
  4. **请 `code-owner-shared-arteries` 与 `expert-security` 就一件事表态**：Inspector 成为 `contextV2Bridge.getStatus()` 的 **第一个 renderer 消费者**（E-B6）是否可接受。这是我 Q4 答案的唯一支点，被否决则 Q4 塌回不可判别。
  5. **请 `expert-architecture` 就 Q2 的落点表态**（详见下文第三节）—— 我在自己边界内能实现，但我 **不承接「四态判定归谁定义」这个判断本身**。
- **评估结论**: 逐问见下。总括：**Q1 = 有条件可行（分半）；Q4 收端 = 能区分，但只能靠两次调用配对，且要以 `getStatus` 为准；Q2 = 直接踩中，不构成进入方案庭审的阻塞，但构成方案庭审的议程首项，否则我边界内会长出第 4 份四态拷贝。** 附 8 条约束（C1~C8 为 `0000-0003-2026-0807#S-0005` 已提、本案继续成立者，编号沿用不重复展开；本案新增 N1~N4）
- **边界命中依据**:
  - `pupu:src/COMPONENTs/memory-inspect/**` —— 第一层路径机械命中（E-0002 / S-0003）。`memory_inspect_modal.js` 是 Inspector 主体的 **唯一实现**，959 行，六态状态机、两个 mode、5s 轮询、PCA 轴选择器、profile explorer 全在这一个文件里（E-B1）。
  - `pupu:src/COMPONENTs/settings/**` —— Inspector 两个挂载点之一在 `settings/memory/index.js:474-478`（E-0003 / E-B3），G6 点名归我的那一半就是这里。
  - `pupu:src/SERVICEs/feature_flags.js` —— `enable_memory_v2` 的定义与读取语义在我边界内（E-B6 附注）。它是「V2 未启用」这个概念在 renderer 侧唯一的本地信号，**但它不等于 `store_owner`**，见第二节。
- **受影响对象**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js` —— 组件签名 `:326-332`、唯一数据源分支 `:374-377`、empty 判据 `:398-408`、5s 静默轮询 `:358-442`、失败渲染 `:584-603`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.test.js` —— 现有唯一测试锁的是 long-term profiles 自动切换（`:59-93`），任何 view 切换改造都会动到它
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/memory/index.js` —— `:474-478` 挂载点；`:46` 组件签名 `({ onNavigate })`，**无 chat 上下文**
  - **跨边界，仅登记不主张**：`src/COMPONENTs/side-menu/side_menu.js:296-298, 772-779` 与 `side_menu_context_menu_items.js:194-225`（`code-owner-chat-core`）· `src/SERVICEs/bridges/context_v2_bridge.js`（`code-owner-shared-arteries`）· `electron/main/services/unchain/service.js:1945-1985, 2098-2116`（`code-owner-electron`）· `unchain_runtime/server/route_memory_v2.py:1111-1120` 与 `memory_v2_store.py:7408-7434`（`code-owner-runtime`）· `src/locales/**` 11 个 locale 文件（`code-owner-shared-arteries`）
- **约束**:
  - **C1~C8 继续成立**（`0000-0003-2026-0807#S-0005`，该案 `awaiting-ruling`，**这些是我的已归档主张不是裁定**）。本案直接被踩到的三条：
    - **C1** 不得以「载荷里没东西」作为 empty 的唯一判据 —— 今天 Inspector 正是这么干的（E-B7），tree view 不得复制。
    - **C4** 静默轮询不得驱动「有 → 无」方向的状态迁移 —— 今天 5s 静默刷新会在用户零操作下把 `ready` 翻成 `empty` 并吞掉失败（E-B7）。**tree view 若挂进同一个 effect 循环就继承这个 bug。**
    - **C8** Inspector 的 mode 数量冻结在 2，**任何第三种内容视为新建组件**。C8 原文把「entry 列表」逐字列为要另开组件的例子 —— 而 `get_tree` 在服务端就是 `list_entries` 之上组树（E-B5）。**本案在字面上命中我自己写的 C8。** 我不以 C8 反对本议案：C8 约束的是「不得再往那 959 行里塞」，不是「不得有第三种内容」。tree view 作为 `memory-inspect/` 下的 **新组件**（仍归我）由 modal 组合，C8 即满足。
  - **N1（新）· tree view 不得把 `sessionId` 当 `ownerChatId` 用。** 二者在 chat-core 的生产侧就是两个值（`use_chat_stream.js:11978, 11985`：`sessionId = characterConfig?.session_id || currentChatId`，`ownerChatId = currentChatId`），且错误的那个 **能通过 main 的正则**（E-B2）。必须由挂载点显式传入一个新的 `ownerChatId` prop，**不许在 modal 内部推导**。
  - **N2（新）· tree view 的「未启用」判定必须来自 `contextV2Bridge.getStatus()`，不得来自 `get_tree` 的载荷，也不得来自 `enable_memory_v2`。** 前者是服务端权威（E-B6），后者是 renderer 本地 UI gate，二者可以不一致；用 flag 冒充 store 状态就是又造一个假状态源。
  - **N3（新）· 不得请求在 `getStatus` 上增加任何计数或「有无数据」位。** `electron/main/services/unchain/service.js:1941-1943` 把 count-free 写成了明确不变量（"any row counts … can never leak out as a free enumeration oracle"）。空/非空只能来自数据调用，启用/未启用只能来自 status —— 这是 **两次调用的 join，不是一次返回的字段**。
  - **N4（新）· settings 挂载点在拿到一条 owner-less 的 V2 读路由之前，不得被赋予 tree view。** 替代方案「在 settings 里加个 chat 选择器」等于在 settings 里重建会话列表，与我在 `0000-0003-2026-0807#S-0005`「零 · 读法 A」里已论证反对的是同一件事。
- **建议处置**:
  1. **判定为「有条件可行」并进入方案庭审，但把适用面（per-chat / 全局）作为一条待 CEO 拍板的前置写进裁定文本**，不要留给方案庭审自行解释。
  2. **方案庭审的议程首项必须是「统一四态判定的落点与 owner」**（Q2，见第三节），而不是 tree view 本身。顺序反了，实施就会在我边界内产出第 4 份独立四态拷贝。
  3. **实施切成三片，且顺序不可换**：(a) 挂载点补 `ownerChatId`（chat-core）→ (b) 四态判定模块落位并由三个 chat-bubble 消费者与 Inspector 共用（owner 待定）→ (c) tree view 组件（我）。**(c) 单独先做是可以跑起来的，但那正是我反对的那条路** —— 它会把 (b) 永久推迟。
  4. **`get_tree` 的 (c) owner 从未存在过 这一情况请 runtime 明确**，并请本庭把它列为新增已知缺口 —— 前案没有这一问，而 E-B2 使它成为本案的实质风险面。

---

## 一 · Q1 —— `ownerChatId` 从哪来（按本庭的新表述作业）

本庭把疑点重述为「这个值在 A 处拿得到、在 B 处拿不到」。我核完之后要再收窄一次：**在我这一侧，它在 A 处也不是「拿得到」，而是「有一个长得很像它的东西」**。

### 1.1 modal 内部今天与 V2 完全无关

`grep -rn "ownerChatId|context_v2|contextV2" src/COMPONENTs/memory-inspect/` → **0 命中**（E-B1）。Inspector 今天的唯一数据源是 V1 projection 的两个方法：

```
memory_inspect_modal.js:374-377
  const fetchPromise =
    mode === "long_term"
      ? unchainApi.getLongTermMemoryProjection()   // 无参
      : unchainApi.getMemoryProjection(sessionId); // 唯一入参 = sessionId
```

所以「modal 拿不到 `ownerChatId`」这句话字面正确，但它掩盖了真正的问题：**modal 从来就不在 V2 的读平面上**。它不是少一个参数，是整条数据源要换。

### 1.2 A 处（side-menu）传进来的 `sessionId` 是一个 **多态 id**，不是 `ownerChatId`

这是本节最重要的一条。`side_menu_context_menu_items.js` 的右键构建器有 **两条分支**（E-B2）：

```
:197-207  普通 chat 之外的 character chat 分支
          memorySessionId = buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")
          onInspectMemory(memorySessionId, chatTitle)      →  "character_<x>__dm__<y>"

:217-223  普通 chat 分支
          onInspectMemory(node.chatId, chatTitle)          →  "chat-…"
```

两个值走同一个 prop 名 `sessionId`。生产侧的 chat-core 自己是把这两个概念分开的：

```
use_chat_stream.js:11978-11986
  const targetSessionId = characterConfig?.session_id || currentChatId;
  ...
  resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, sessionId: targetSessionId })
```

**净效果**：`ownerChatId` = UI chat id；`sessionId` = character session id **或** chat id。Inspector 收到的是后者。在普通 chat 分支上二者恰好是同一个字符串，**但 modal 无法知道自己拿到的是哪一支**。

而且错的那一支 **不会报错**：`CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/`（`electron/main/services/unchain/service.js:120`）对 `character_foo__dm__main` **返回 true**（E-B2，实跑 node 验证）。也就是说，如果 tree view 图省事把 `sessionId` 当 `ownerChatId` 传下去，character chat 会以一个 **语法合法、语义错误的 owner** 去查 —— 后端会怎么回，归 runtime（我的请求 3(c)），但 renderer 这一侧 **拿不到任何信号说自己查错了人**。

**这就是为什么我把 N1 写成硬约束，而不是实施注意事项。**

### 1.3 B 处（settings）不是「少传一个 prop」，是作用域里根本没有 chat

- `MemorySettings = ({ onNavigate })`（`settings/memory/index.js:46`）—— 唯一入参是导航回调。
- 整个 `src/COMPONENTs/settings/**` 里除 `token_usage/storage.js` 把 `chatId` 作为 **用量记录的一个字段** 之外，**没有任何 chat 上下文**（E-B3）。
- 它今天调的 `getLongTermMemoryProjection()` **无参** —— V1 的长期记忆视图在设计上就是 owner-less 的全局视图。

而 V2 的读平面 **每一个方法都是 owner-scoped**（E-B4）：`listContextV2Spaces` 要 `ownerChatId`；`getContextV2Tree` 要 `ownerChatId` **和** `spaceId`。所以 settings 那一路要显示 tree，第一步就得回答「显示谁的树」—— 这是产品问题不是接线问题。

**附带一条对议案有独立价值的发现**：`memory_v2_store.get_tree` 的签名里 **有** `allow_long_term` 与 `namespace` 两个参数（`memory_v2_store.py:7408-7414`），但 Flask 路由 **不读它们**（`route_memory_v2.py:1111-1120` 只取 `owner_chat_id`），主进程 **也不转发**（`service.js:2108-2116` 的 query 只有 `owner_chat_id`）。**「long_term」这个概念在 `get_tree` 里存在，但从 PuPu 今天的调用面上不可达。** 权威解释归 `code-owner-runtime`；我只登记代码事实（E-B4/E-B5）。

### 1.4 Q1 的直接回答

> **`ownerChatId` 从哪来？** —— 从挂载点显式传入，别处都不行。
> **两个挂载点的 props 差异（G6）在我端意味着什么？** —— 意味着 **议案对两个挂载点不是同一个议案**。A 处是「补一个 prop + 消歧两条右键分支」；B 处是「V2 今天没有全局读路径」。
> **是否卡死本议案？** —— **不卡死 A 处**（前提：chat-core 的 C4 承诺仍有效，请其确认）。**以今天的 API 面卡死 B 处**，除非议案接受 B 处不做。

---

## 二 · Q4 收端半边 —— 空态与未启用态在 API 层面能不能区分

### 2.1 Inspector 今天怎么处理 `/memory/projection` 的 200-空成功

跨案引用 `0000-0003-2026-0807#S-0005`（C1、C4），此处只补本案需要的最小事实（E-B7）：

```
memory_inspect_modal.js:398-408
  if (pts.length === 0) {
    ... if (mode === "long_term" && nextProfiles.length > 0) setStatus("profiles")
        else setStatus("empty");
  }
```

**判据是且仅是 `points.length === 0`。** 一个 200-空成功和一个「后端把失败归一化成了空」在这里 **完全同形**。而「V2 未启用」这个状态 **在 V1 的词汇表里根本不存在** —— 它不是被误判，是压根没有对应的枝。

再叠一层 C4：`:434-436` 的 5s 静默轮询会 **在用户零操作下** 把 `ready` 翻成 `empty`，且 `:424-430` 的 `if (!silent)` 让静默轮次的失败 **完全无声**。

### 2.2 如果 `get_tree` 也返回一个无判别位的 200，我能不能区分？

**能，但不能只靠 `get_tree`。** 拆成三段：

**(a) `get_tree` 的 200 自身 —— 无判别位。** 返回体是 `{owner_chat_id, space_id, space_revision, entries, tree}`（`memory_v2_store.py:7423-7434`，E-B5）。空 store 就是 `entries: []` + `tree: []`，**没有任何字段说明「V2 是否启用」**。这一条与议案 Q4 的假设一致。

**(b) 「未启用」有一个独立且权威的判别源，而且已经在 bridge 上了。** `contextV2Bridge.getStatus()`（`src/SERVICEs/bridges/context_v2_bridge.js:102`）→ 主进程返回

```
{ available, schemaVersion, journalMode, lexicalBackend,
  vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded }
```

（`service.js:1945-1985`，E-B6）。`available:false` / `rolloutMode:"off"` / `featureCeiling:"off"` 就是「未启用」。**它是 renderer 今天能拿到的、唯一不靠猜的启用态信号。**

**(c) 但它是 count-free 的，而且是刻意的。** `service.js:1941-1943` 的注释把这写成了不变量：status 从 allowlist 重建，**任何行计数都不得泄出，以免成为免费的枚举 oracle**。所以：

> **启用/未启用 → 只能问 `getStatus`；空/非空 → 只能问 `get_tree`。这是两次调用的 join，不存在「一次返回里的判别位」这种解法，也不应该去要一个。**（N3）

**(d) 实际上不止两态，最少四态。** renderer 侧还有两类与上面正交的出口：bridge 缺席（`isAvailable()` 为假 → `context_v2_unavailable`，`context_v2_bridge.js:68-74`）、runtime 未就绪或不可达（`context_v2_readiness_failed` / `context_v2_unreachable` / `context_v2_failed`，`service.js:1898-1940`）。码集是 **开放的**，所以 C2（默认拒真、其余一律落第三态）继续成立。

### 2.3 一条本案独有的发现，请本庭记入

**`contextV2Bridge.getStatus()` 今天在整个 renderer 里零消费者**（E-B6）。三个 chat-bubble 消费者用的是 `isAvailable()`（bridge 在不在）+ 错误码事后归因，**没有一个问过「V2 到底开没开」**。

也就是说：**判别位早就造好了、接到 bridge 了、没人用。** 这不是「缺一个能力」，是「缺一个 owner 去把它变成一个状态」。这一条直接把我送进第三节。

---

## 三 · Q2（G1）—— 强制表态，我不说「与我无关」

### 3.1 是否直接踩中？—— 是，而且是最直接的一次

前案 `#S-0014` D7 与 `#S-0024` D8 指的那个「被多方需要、今天没有 owner」的构件，具体化到本案就是：

> 把 **(bridge 可用性 × `getStatus` × 数据调用结果 × 错误码集合)** 映射成一个用户可见状态的那一段逻辑。

今天这段逻辑存在 **四份互不相干的实现**：
1. `memory_v2_journal_reload.js`（`:513-521` 自己构造 `status:"Unavailable"` + `reason` + `errorCode`）
2. `memory_v2_pending_reviews.js`（`:181-187` `errorPresentation()` + `:176-190` 的 `STALE_DECISION_CODES` 白名单）
3. `memory_v2_trace_audit.js`
4. `memory_inspect_modal.js` 的六态机（V1 口味，**没有「未启用」这一枝**）

**在 modal 里加 tree view，就是在同一个进程里造第 5 份。** 而且是第一份需要 **同时** 处理「V1 的四态」和「V2 的四态」的 —— 因为议案明写 vector view 保持现状，所以 **同一个组件里会并存两套语义不同的状态词汇**。这是 D7 描述的那个洞在本案里的确切形状。

### 3.2 是否会要求我的边界承担一个今天不属于我的判定职责？—— **部分是，我明确区分**

| 职责 | 今天在哪 | 本案会不会推给我 | 我的立场 |
|---|---|---|---|
| 把 `rolloutMode` / `featureCeiling` / `available` **算出来** | `electron/main/services/unchain/memory_v2_rollout.js` + runtime 的 `store_owner` | 不会 | 不是我的，也不该是我的 |
| **定义** 四态的判据（哪些码算「未知」、哪些算「无」） | **无人**（四份拷贝各自即兴） | **会** —— 我一写 tree view 就得当场定一遍 | **我不承接这个定义权。** 我承接的是「按已定义的判据渲染」 |
| 决定 settings 那个全局 Inspector 该显示谁的树 | **无人** | **会** | **不落在本边界。** 这是产品/架构判断，归 `expert-architecture` 出意见 + CEO 裁定 |
| 在 `memory-inspect/**` 内实现渲染与组件切分 | 我 | 会 | **承接** |

第二行是关键：**我可以在自己边界内写出第 5 份四态映射并且它能跑**。正因为能跑，才更需要本庭点名 —— 一个「能跑但会加深结构缺口」的实施，不会在验收时被任何人拦下来。

### 3.3 是否构成进入方案庭审的前置阻塞？—— **我的表态：不构成，但有一个硬附加条件**

**不构成**的理由：可行性论证不依赖前案的裁定。上面三节的每一条结论在 16 项强制回应的 **任何** 回应组合下都不变 —— 它们是代码形状，不是政策。

**硬附加条件**：方案庭审的议程 **首项必须是** 「四态判定模块落在哪一层、owner 是谁」，且该项 **必须有指派结果** 才能进入 tree view 本身的方案。理由是 `expert-architecture` 在前案已经明言的那句 —— **传唤机制解不了它，只有指派能解**。而本案会把「不解决它的代价」从「三份拷贝」推到「五份拷贝，且其中一份要同时讲两种语言」。

**换个说法，可证伪地**：如果方案庭审开庭时该构件仍无 owner，我的实施只有两条路 —— 造第 5 份拷贝，或者擅自替全组定义判据。**两条我都不接受**，届时我会以「前置未落地」拒绝承接实施，而不是硬做。这不是现在的阻塞，是届时的阻塞，**现在写下来是为了它届时不算意外**。

---

## 四 · 丙 —— 可证伪形式：什么条件下「可行」翻成「不可行」

我表态可行。以下 **任一** 条成立，我的表态即翻转，请本庭逐条登记为验收前必须闭合的检查点：

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **F1** | `code-owner-chat-core` 表示 `0000-0003-2026-0807#S-0024` C4 的 `ownerChatId` 承诺 **不再有效**，或挂载点无法新增 prop | side-menu 那一路 **不可行**（modal 内部无合法推导路径，N1 禁止猜） | chat-core |
| **F2** | `contextV2Bridge.getStatus()` **不允许** 被 Inspector 调用（shared-arteries 或 `expert-security` 反对新增 renderer 消费者） | Q4 塌回不可判别 → 按 C2 全部落第三态 → **空 store 与未启用态在用户面前同形** → 我判 **不可行**（这正是前案 Q8 的塌缩重演） | shared-arteries / expert-security |
| **F3** | `code-owner-runtime` 答复 `get_tree` 对 **从未存在过的 owner** 也返回 200 + 空树，且无任何区分位 | E-B2 的「静默错主」变成不可检测 → character chat 分支必须先做 owner 预检，否则 **不可行**（会稳定地给用户看一棵不属于他的空树） | runtime |
| **F4** | 议案的适用面被裁定为「settings 全局 Inspector 也要 tree view」，且不先落一条 owner-less 读路由 | 该挂载点 **不可行**（N4）。整个议案降级为「只能做一半」 | CEO 裁定 + runtime |
| **F5** | 方案庭审开庭时四态判定构件仍无 owner（第三节的硬附加条件未闭合） | 我 **拒绝承接实施**（不是技术不可行，是我不接受在自己边界内造第 5 份拷贝或替全组定判据） | chief-judge 的指派 |
| **F6** | 要求 tree view 写进 `memory_inspect_modal.js` 本体而非 `memory-inspect/` 下的新组件 | 违反 C8。技术上做得到，**我判为结构上不可接受**，会以 `OBJECTION` 形式重提 | 方案庭审 |
| **F7** | 本机 `entries=0` 的限制在方案阶段仍未解除，且议案要求对「正常态渲染量级」给出承诺 | 我给不出 —— 任何量级承诺都是推断（G2）。**需要一条造数据的路径**（fixture 或真机灌数），否则验收标准里不得出现正常态的性能/形态条款 | 全体（G2 是共有缺口） |

**关于 F2 的补充**：这是七条里唯一一条会把结论从「可行」直接推到「不可行」而 **没有任何绕行方案** 的。`enable_memory_v2` 这个 flag 看起来像个替代品，但它是 renderer 侧的 UI gate，**与服务端的 `store_owner` 是两个独立的值、可以不一致**（且发布构建下 flag 的持久化值根本不被读取 —— `feature_flags.js:92-95`，`NODE_ENV==="production"` 时直接短路到 build 快照）。**拿 flag 冒充 store 状态 = 再造一个假状态源**，我不做（N2）。

---

## 五 · 留待方案庭审（自行标注，本阶段不作为结论）

按 S-0001 的范围纪律，下列几条是我在核证过程中看到、**属于设计取舍** 的，登记但不主张：

- **两个 view 之间怎么切换**（并列 / 二选一 / 按数据可用性自动选）—— 这直接决定 5s 轮询循环要不要拆（C4 的实施形态），但选择本身是交互设计。
- **tree 与现有 `Explorer` 原语的关系** —— 技术事实登记于此：`BUILTIN_COMPONENTs/explorer/explorer`（`code-owner-ui-primitives` 边界）**今天已经是 `memory_inspect_modal.js` 的依赖**（`:10`，用于渲染 profile 文档），其数据契约是扁平 `{id: {label, type, children}}` + `root[]`，而 `get_tree` 返回的是嵌套 `roots`。**存在一个已在用的树渲染基底，需要一个形状适配函数** —— 这一条是可行性证据，够不够用是设计问题。
- **i18n**：`memory_inspect` 命名空间今天只有 12 个键、11 个 locale（`src/locales/**`，`code-owner-shared-arteries` 边界）。四态 × 两 view 的文案增量是跨面项。

---

## 六 · 本发言提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**，与 E-0001 一致（`unchain_runtime/` 在同一仓，故同一 revision）。全部为只读操作，未改任何文件、未 commit。

### E-B1 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:326-332, 340, 358-377`
- **取得方式**: `grep -rn "ownerChatId\|context_v2\|contextV2" src/COMPONENTs/memory-inspect/ | wc -l` → **`0`**；并整读该文件（959 行）与 `memory_inspect_modal.test.js`（94 行）
- **支持/反驳**: **支持** 本发言 Q1 结论「modal 今天完全不在 V2 读平面上」；**收窄** `case.md` Q1 的表述 —— 不是「少一个参数」，是数据源整条要换
- **完整性限制**: 只覆盖字面标识符与该目录。未运行组件，未观察实际挂载行为
- **净内容**: 组件签名 `({open, onClose, sessionId, chatTitle, mode="session"})`；状态机六态 `idle|loading|ready|profiles|empty|error`（`:340`）；唯一数据源 `:374-377` 为 V1 projection 两方法

### E-B2 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:194-225` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:301-302` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11978-11986` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:120, 198-204`
- **取得方式**: `grep -n "setMemoryInspect" -A 8 src/COMPONENTs/side-menu/side_menu.js` → 定位 `handleInspectMemory`；再 `grep -n "onInspectMemory"` 到构建器两分支并定点读取；正则实跑 `node -e` 对两个 id 各测一次
- **支持/反驳**: **支持** N1 与本发言 §1.2；**部分反驳** 「side-menu 挂载点拿得到 `ownerChatId`」这种简化读法 —— 它拿到的是一个 **多态** 值
- **完整性限制**: 未证明 `node.chatId` 与 `activeChatIdRef.current` 严格同一 id 空间（强旁证，见不确定性 3，归 chat-core 确认）。未实测 character chat 的实际请求
- **净内容**:
  ```
  side_menu_context_menu_items.js:198-207  character chat → buildCharacterMemorySessionId(...)  →  "character_<x>__dm__<y>"
  side_menu_context_menu_items.js:217-223  普通 chat      → node.chatId                          →  "chat-…"
  chat_storage_sanitize.js:301             `character_${…}__dm__${…}`
  use_chat_stream.js:11978                 const targetSessionId = characterConfig?.session_id || currentChatId;
  use_chat_stream.js:11985                 { ownerChatId: currentChatId, sessionId: targetSessionId }
  service.js:120                           CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
  node 实跑：  "chat-1772850432671-abc" → true      "character_foo__dm__main" → true
  ```
  **净效果**：语义错误的 id **能通过 main 的校验**，不会被挡下。

### E-B3 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/memory/index.js:46, 474-478`
- **取得方式**: `grep -rn "chatId\|sessionId" src/COMPONENTs/settings --include="*.js"`（排除 `*.test.js`）→ 命中仅 `settings/token_usage/storage.js:82,154,332`（用量记录字段，与 Inspector 无关）；定点读取 `MemorySettings` 签名与挂载块
- **支持/反驳**: **支持** N4 与本发言 §1.3；**支持** G6 归我的那一半的答案
- **完整性限制**: 只覆盖字面标识符 `chatId` / `sessionId`。未核实是否有经 context 传入的隐式 chat 上下文（我未发现 `ConfigContext` 携带 chat id，但未穷举全部 provider）
- **净内容**: `export const MemorySettings = ({ onNavigate }) => {` —— 唯一入参是导航回调；挂载块 `:474-478` 只传 `{open, onClose, mode="long_term"}`（与 E-0003 一致）

### E-B4 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-50, 102-108` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:2098-2116`
- **取得方式**: 整读 renderer facade（140 行内）；定点读取主进程 `listContextV2Spaces` / `getContextV2Tree`
- **支持/反驳**: **支持** 本发言 §1.3「V2 读平面全部 owner-scoped」；**新增** 一条 `case.md` 与 `FRAMING` 都未记的事实 —— **`getTree` 除 `ownerChatId` 外还必需 `spaceId`**
- **完整性限制**: 代码形状，非运行时行为。`spaceId` 的来源（`listSpaces` 返回什么、有没有默认 space）**我未核实**，归 runtime / electron
- **净内容**:
  ```
  service.js:2098-2101  listContextV2Spaces  → 必需 requireContextV2OwnerChatId
  service.js:2108-2116  getContextV2Tree     → 必需 ownerChatId + requireContextV2Identifier(spaceId)
                                              query 只有 owner_chat_id（无 allow_long_term / namespace）
  ```
  **净效果**：tree view 的最小读序列是 **两跳**（`listSpaces` → `getTree`），且两跳都以 `ownerChatId` 为根键。

### E-B5 | repository | 自证类（**仅就代码形状**；运行时行为归 `code-owner-runtime`）
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:7396-7434` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:1111-1120, 315-335` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store_boundary.py:26-32`
- **取得方式**: 定点读取三处
- **支持/反驳**: **支持** 本发言 §2.2(a)「`get_tree` 的 200 无判别位」；**支持** §1.3 末「long_term 参数存在但不可达」
- **完整性限制**: **未起 sidecar、未发过请求、未观察任何返回体。** 空 store / space 不存在 / owner 不存在 / `store_owner=off` 四种出口的 **实际** HTTP 状态与 body **一律未核实**（G3，归 runtime）。我只主张「代码里的返回构造长这样」
- **净内容**:
  ```
  memory_v2_store.py:7434   return {**listing, "tree": roots}
  listing 形状 :7397-7405   {owner_chat_id, space_id, space_revision, entries}
  → 200 载荷 = {owner_chat_id, space_id, space_revision, entries, tree}   无 enabled / store_owner / 任何判别位
  route_memory_v2.py:1114-1119  只取 owner_chat_id；不传 allow_long_term / namespace
  memory_v2_store_boundary.py:26-28  STORE_OWNER_OFF="off" / PUPU_LEGACY / UNCHAIN
  ```

### E-B6 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1941-1985, 1890-1905` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:102` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/feature_flags.js:53-56, 90-100`
- **取得方式**: `grep -rn "getStatus\b" src --include="*.js"`（排除 `*.test.js`）逐条归类；定点读取主进程 `getContextV2Status` 与其上方注释
- **支持/反驳**: **支持** 本发言 §2.2(b)(c) 与 §2.3；**支持** N2 / N3
- **完整性限制**: 只覆盖字面 `getStatus`。未实测调用返回。`projectMemoryV2Status` / `validateMemoryV2Status` 的内部判据我未追（归 electron）
- **净内容**:
  1. `getContextV2Status` 返回 8 字段 allowlist：`{available, schemaVersion, journalMode, lexicalBackend, vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded}`
  2. `service.js:1941-1943` 注释把 count-free 写成不变量：*"Status is deliberately COUNT-FREE … any row counts the sidecar might add later can never leak out as a free enumeration oracle."*
  3. **`src/` 下对 `contextV2Bridge.getStatus()` 的消费者数量 = 0。** 三个 chat-bubble 消费者用的是 `isAvailable()` + 错误码，未调过 status
  4. `feature_flags.js:53-56` `enable_memory_v2` 默认 `false`；`:90-100` `readFeatureFlags()` 在 `NODE_ENV==="production"` 时 **短路到 build 快照，完全不读持久化值** —— 故该 flag 不能替代 `getStatus` 作为启用态判据

### E-B7 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:398-408, 424-430, 434-441` · 同目录 `memory_inspect_modal.test.js:59-93`
- **取得方式**: 定点读取
- **支持/反驳**: **支持** Q4 收端半边前半问（Inspector 今天怎么处理 200-空）；**支持** C1 / C4 在本案继续成立
- **完整性限制**: 静态阅读，未运行组件、未跑测试（`react-scripts test` 未执行）
- **净内容**: empty 判据 = `pts.length === 0` 单条；`long_term` 且有 profiles 时改判 `profiles`；静默轮次（`silent:true`）的 `.catch` 整个被 `if (!silent)` 吞掉；5s `setInterval` 会在零操作下驱动 `ready → empty`。现有唯一测试锁的是 long-term profiles 自动切换这一条路径
