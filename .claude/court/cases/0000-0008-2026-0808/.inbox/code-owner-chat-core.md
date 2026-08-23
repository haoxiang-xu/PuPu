#### S-XXXX | ASSESSMENT | code-owner-chat-core → case

- **阶段**: 议案庭审

- **结论**: **有条件可行，我边界内的改动是 1 个目录、2 个产品文件、6 处、零测试改动、零跨 owner 协作。** 逐条：**甲 —— C4 承诺今天 *仍然有效，无条件*，`code-owner-settings` 的 F1 不成立**（挂载点能新增 prop，破坏面为零，我今天以完整 grep 爆炸半径 + 54 绿测试基线重新证成，E-E1/E-E8）。**乙 —— character 分支的 `ownerChatId` 就是 `node.chatId`，它存在、就在同一作用域里、今天被丢弃、取得代价为零**；而且我能给出一条本案至今没人举出的 **产端权威依据**：`use_chat_stream.js:6453-6457` 的注释逐字写明 *"owner_chat_id is ALWAYS the UI chat id (targetChatId) — never effectiveThreadId, which becomes the character session_id for character chats"*，写侧已经把这条契约写死在代码里（E-E3）——**读侧只需与写侧同键，不需要任何新判断**。**丙 —— `code-owner-settings` 不确定性 3 我 *确认*，并把它从「强旁证」升级为 *证明*：`node.chatId` 与 `currentChatId` 不是「同一个 id 空间」，是 *同一个值经五段确定性传递*，且两端各有一道 `chatsById` 存在性守卫**（E-E2）。其 Q1 结论前半段不翻转。**丁 —— `getTree: noop` 不是消费者，是 `resolveApi()` 全有或全无探针的产物**（我的 mock 恰好 18 个方法、与 `REQUIRED_METHODS` 逐项对应，E-E5）；**这构成一条落在我边界内、此前无人计价的成本，独立支持 `code-owner-shared-arteries` 的 A2**。**而我端持有的 `activeChatIdRef.current` 对 Inspector *不可复用*，我要主动报一条谁都没说的错主来源，它比 character session id 那条更危险**（E-E4）。**Q2 —— 我承担一半，并提交一条对「单点四态映射」的 *原则性反对意见*（不是拒绝落点，是给落点加一条必过约束）**：chat-core 今天已有一份完整、成文、**蓄意不与他人合并** 的 code→用户可见文案映射（19 码 / 7 文案 / 两张表），其代码注释里逐字写着为什么合并会撒谎（E-E6）。**并报一条硬事实：`context_v2_store_disabled` 在整个 `src/` 下出现 0 次（E-E7）——「未启用」不是 Inspector 词汇表里缺一枝，是整个 renderer 都不知道这个码存在，而在我的表里它落到 FAILED「请重试」，一个重试永远不会改变的条件。** **前案 C3 的越界交出在本案 *仍然成立，但不覆盖本案 Q2*，理由见正文六。**

- **依据**: E-E1, E-E2, E-E3, E-E4, E-E5, E-E6, E-E7, E-E8, E-0003, E-0004, E-0005, E-0016, E-0017, E-0018, E-0024, E-0035, 0000-0003-2026-0807#S-0006, 0000-0003-2026-0807#S-0024

- **不确定性**:

  **一 · 我实跑到哪里为止。** 我 **未启动应用、未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求**。我唯一的运行时观察是 **本仓自己的 jest 套件在未修改工作树上跑了一次**（E-E8，2 suite / 54 test 全绿）。「代码这样写」与「运行起来这样跑」之间那一段我给不出。凡涉及真实进程行为的一律标推断。

  **二 · 我的全部结论 *不依赖* 任何 store owner 取值，因此 R1 对我不适用。** 甲/乙/丙/丁 四问的答案是 renderer 侧的 **值传递与作用域** 事实，在 `off` / `unchain` / `pupu_legacy` 三种配置下 **完全相同**。G8（`unchain` 分支无人实跑）与 G2（`entries=0`）**不削弱我这一节的任何一条**，因为我这一层不发请求、不解析载荷、不判态。**我特意声明这一点，是因为本案迄今最重的证据限制（S-0009）落在服务端，而我不想让它被误读为覆盖全案。**

  **三 · 我不核实 `MemoryInspectModal` 收到新 prop 后会怎样。** 那是 `code-owner-settings` 的边界（E-0015）。我主张的只有「挂载点能把这个值送到 modal 的 props 上，且送出去的代价为零」。**「送进去之后 Inspector 该怎么用」我不主张。**

  **四 · 我未核实 `getSessionHead` / `rebaseSession` 之外的任何 V2 方法的运行时行为。** 我端只调这两个（E-E5），其余 16 个方法我只在 mock 里声明其存在。

  **五 · 一处我给不出答案的：右键菜单打开后、modal 仍开着时，用户切换了活动会话或删除了那个 chat，`ownerChatId` 该不该跟着变。** 今天 `memoryInspect` 是 side-menu 的本地 state，**开的时候快照一次、之后不跟随**（E-E4）。这个语义今天对 V1 `sessionId` 成立，对 V2 `ownerChatId` 是否也该成立，**我倾向「同样快照、不跟随」，但这是一个我边界内的设计取舍，自标为「留待方案庭审」，本阶段不作为结论。**

- **请求/下一步**:

  1. **请本庭直接判定 `code-owner-settings` 的 F1 *不成立*，并把它从其可证伪条件表里落定为已闭合。** 甲的答案是无条件的「仍然有效」，我不附任何条件。**F1 是本案唯一一条 *完全落在我边界内、且我能单方面终结* 的可证伪条件，本轮就该终结它，不必留到方案庭审。**

  2. **请本庭把「右键节点 ≠ 活动会话」（E-E4）记为一条 *新增已知缺口*，并与 G10 并列。** 它与 E-0016 的「character session id 冒充」是 **两条不同的错主路径**，且 **这一条严格更危险**：冒充的那个 id 后端至少可能查无此人（G10 待答），而右键错主给出的是 **一个真实存在的、属于另一个 chat 的、非空的树** —— 在链路上 **结构性不可检测**，`code-owner-electron` 的语法门、`code-owner-runtime` 的 owner-scoping、`code-owner-shared-arteries` 的码解析 **三道全部放行且全部正确**。本案没有任何一份已交付 `ASSESSMENT` 提到它。

  3. **请 `code-owner-settings` 就一件事作答**：其 N1 写「不许在 modal 内部推导 `ownerChatId`」——我完全支持并加强（正文二）。但 N1 只禁了推导，**没有禁「从别处取」**。请其确认 tree view 的 `ownerChatId` **只接受来自 props 的那一个值**，不得从 `chatStore.activeChatId`、不得从任何 context、不得从任何全局取。**这一条不写死，E-E4 那条错主路径会在实施时以「反正拿得到」的形式复活。**

  4. **请 `code-owner-shared-arteries` 知情一条落在我边界内、支持其 A2 的成本**（E-E5）：`REQUIRED_METHODS` 从 18 增到 19 的那一刻，我的 `use_chat_stream.turn_mutation_v2.test.js` 的 18 方法 mock 会让 `resolveApi()` 返回 `null` → `isAvailable()` 为假 → **turn-mutation 测试静默改走 legacy 分支而不是报错**。**这不是「测试会红」，是「测试会绿但测的是另一条路」。** 其 A2「不得新增 facade 方法」在我这里有一个 **具体的、会静默失效的** 代价。

  5. **请 `expert-architecture` 就 Q2 一并考虑我提交的原则性反对**（正文六 6.3）：**同一个码 token 在不同调用语境里意味不同的事**，这是我边界内已经用代码注释写死的判断（E-E6）。任何「一份映射喂五个消费者」的落位方案 **必须先回答它**，否则会把我这条已经生效的分层折平。**我不主张落点归谁，我只主张这条约束必须进落点的验收标准。**

  6. **不请求** 补传任何角色。我边界内 **不增删改任何 IPC channel、bridge 面、facade 方法或 locale 键**，S-0003 对 `expert-security` / `expert-ux` 的不传唤判定在我这一侧继续成立。**触发线我画在 CF5。**

- **评估结论**: 逐条见正文一~七。总括：**甲 = 仍然有效（无条件），F1 不成立；乙 = `node.chatId`，存在，代价零，且写侧已有成文契约背书；丙 = 确认并升级为证明，其 Q1 前半段不翻转；丁 = stub 是探针产物非消费者，我端持有的活动会话 id *不可复用* 且是一条新错主源；Q2 = 承担一半，提交一条原则性反对 + 一条硬事实；可证伪 = CF1~CF6。** 附约束 K1~K5。

- **边界命中依据**:

  - **`pupu:src/COMPONENTs/side-menu/**`** —— 议案 Q1 疑点所述的那个「挂载接口」实体就是 `side_menu.js:772-779`（E-0003），承载它的两个文件全在本边界：`side_menu.js`（modal hub 挂载点、`handleInspectMemory`、`memoryInspect` state、`handleContextMenu`）与 `side_menu_context_menu_items.js`（`Inspect Memory` 入口与两条右键分支的取值点）。**这是 S-0003 补正我入列的全部理由，我确认该补正正确，且确认它属「议案写窄 + 概念名漏人」而非我的 charter 写窄** —— `pupu:src/COMPONENTs/side-menu/**` 逐字覆盖这两个文件，任何路径匹配都该命中。
  - **`pupu:src/PAGEs/chat/**`** —— `use_chat_stream.js`（V2 bridge 的既有消费者、`ownerChatId` 的生产侧、写侧 payload 契约）、`context_v2_turn_mutation.js`（码→文案映射的既有实现）、`use_chat_session_state.js`（`activeChatIdRef` 的唯一写点）、`use_chat_stream.turn_mutation_v2.test.js`（`getTree` stub 所在）。
  - **跨界只读引用（登记，不构成本边界主张）**：`pupu:src/SERVICEs/chat_storage/**`（`selectTreeNode` · `updateActiveAndSelectedFromChatId` · `createChatNode` · `buildCharacterMemorySessionId`，归 `code-owner-shared-arteries`）· `pupu:src/SERVICEs/bridges/context_v2_bridge.js`（`REQUIRED_METHODS`，同上）· `pupu:src/COMPONENTs/memory-inspect/**`（归 `code-owner-settings`）· `pupu:electron/main/services/unchain/service.js`（归 `code-owner-electron`）。**结论归属仍在各自 owner；我引用它们只为确定「我送出去的那个值，到达对面时是什么」。**

- **受影响对象**:

  - **若本案按 side-menu 那一路推进，我边界内 6 处改动，全部在一个目录内**（E-E8 的爆炸半径是机械 grep，非估计）：
    1. `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:207` —— character 分支调用点
    2. 同文件 `:223` —— 普通分支调用点
    3. `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:237-241` —— `memoryInspect` 初始 state 形状
    4. 同文件 `:296-297` —— `handleInspectMemory` 签名与写入
    5. 同文件 `:772-779` —— `MemoryInspectModal` 挂载 props
    6. 同文件 `:777` —— `onClose` 的复位形状
  - **零测试改动。** `side_menu_context_menu_items.test.js:285` 只断言「Inspect Memory 这一项存在」，**从不断言 `onInspectMemory` 的调用参数**（E-E1）。**这是 C4「破坏面为零」在测试层的机械证据，前案未举出，本案补齐。**
  - **零跨 owner 协作。** `buildSideMenuContextMenuItems` 全仓 2 个产品引用点（自身定义 + `side_menu.js:425`）、`onInspectMemory` 全仓 3 个产品引用点，**全部在 `src/COMPONENTs/side-menu/` 内**（E-E8）。不动 `chat_storage`、不动 bridge、不动 locale、不动任何 `src/PAGEs/chat/**` 文件。
  - **条件性影响（仅当 Q2 的落点判给「统一映射」且要求迁移）**：`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:389-459` 两张码表与 `:420-435` 的映射函数。**这是一次跨 owner 的破坏性迁移，不是加法**，且须先满足我在 6.3 提的那条约束，否则我以 `OBJECTION` 反对（CF4）。
  - **条件性影响（仅当 facade 方法数变化）**：`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:208-262` 的 18 方法 mock。**量级小，但失效形式是静默的**（请求 4）。
  - **无影响**：流式编排、`streaming_message_store`、`runtime_events` 消费、`queued_turn_outbox` / `turn_mutation_outbox`、minimap、composer、chat header、附件。**本案不触及本边界的任何吸积点，特别是 `use_chat_stream.js` 主体零改动** —— 这一条我要显式说出来，因为它是我承接本案的主要理由（K1）。

- **约束**:

  - **K1 · 本案不得以任何形式扩大 `use_chat_stream.js`。** 2026-07 重构评估把它与 `unchain_adapter` 并列为两个定点手术目标（~12k 行，发布后第一批）。tree view 的 `ownerChatId` 取值 **必须来自 side-menu 挂载点的右键节点**，**不得**为它在 chat 页或 streaming hook 里新增任何导出、任何 context、任何 ref 透传。**这条不是偏好，是本案能在我边界内保持 6 处改动的前提；一旦走 chat 页取值，改动面立刻跨到吸积点上，我的可行性表态翻转（CF2）。**
  - **K2 · `ownerChatId` 与 `sessionId` 必须是两个独立 prop，不得合并、不得互推、不得复用同一个名字。** 二者在我端的生产侧就是两个值（`use_chat_stream.js:11978` 与 `:11985`），在写侧被成文区分（`:6453-6457`），在读侧的右键构建器里今天被错误地折进同一个位置参数（E-0016 / E-E1）。**普通 chat 分支上二者恰好同值，这是巧合不是契约** —— 任何「反正一样」的实施都是在等 character chat 上线时静默错主。
  - **K3 · 挂载接口的扩展必须改为对象参数，不得追加第三个位置参数。** `onInspectMemory(sessionId, chatTitle)` 今天是位置参数（`side_menu_context_menu_items.js:207,223`），而这条接缝 **已经跨 owner**（side-menu → memory-inspect）。JS 的位置参数错位是静默的，且本案要送的两个值 **都是合法 chat id 形状的字符串**，错位后没有任何一层会报错。**这一条与前案 C4 的约束 4 同文，本案维持不变。**
  - **K4 · `ownerChatId` 在 modal 打开时快照，之后不跟随活动会话。** 今天 `memoryInspect` 是 side-menu 本地 state，语义即快照（E-E4）。**若实施时把它改成跟随 `chatStore.activeChatId`，就等于把 E-E4 那条错主路径写成默认行为。** 我按快照承接。
  - **K5 · 不得在 side-menu 侧新增任何 V2 调用。** 挂载点只负责 **把一个已有的值送出去**，不 `listSpaces`、不 `getTree`、不 `getStatus`、不判态、不预检。**side-menu 是 modal hub，我提供稳定的挂载接口，各 modal owner 往里挂内容** —— 反向伸手就是把 modal 的数据依赖倒灌进导航树的渲染路径，而侧栏在 500+ 会话时已有一个已知的 O(n) 全树重建塌点。**要预检 owner 存在性（`code-owner-settings` 的 F3 救济），落 modal 内部，不落我。**

- **建议处置**:

  1. **判为「有条件可行」并进入方案庭审。我在 side-menu 那一路不设任何前置阻塞，且 F1 就此闭合。**
  2. **把 E-E4（右键节点 ≠ 活动会话）列为新增已知缺口，并把 K1/K2/K4 三条写进裁定文本而不是留给方案庭审自行解释。** 三条都是「实施时最省事的那个做法恰好是错的」这一类，**不写死就会以最省事的形式落地，且落地后三层校验全部放行**。
  3. **就 `code-owner-settings` 的 G9（适用面 per-chat / 全局）——我支持其「只给 per-chat」的承接，并补一条它没说的理由**：settings 那个挂载点即便将来拿到一条 owner-less 读路由，**它仍然拿不到「用户此刻想看谁的树」这个意图**，而 side-menu 右键天然携带这个意图。**这不是 API 面的差距，是入口语义的差距**，多一条读路由也补不上。请把这一条并入交 CEO 的那一问。
  4. **就 Q2：我支持把落点指派做成方案庭审的准入条件**（与 `code-owner-settings`、`code-owner-shared-arteries` 一致），**但我不支持把它写成「建一个统一映射」**。请把准入条件写成两项：**(i) 落点与 owner 已指派；(ii) 该落点的验收标准里含 6.3 那条语境分层约束。** 只做 (i) 不做 (ii)，产出的构件会把我这条已经生效的分层折平，那比五份拷贝更坏——**五份拷贝各自诚实，一份折平的映射会对用户撒谎。**

---

## 一 · 甲 —— C4 承诺今天是否仍然有效（`code-owner-settings` 的 F1）

### 1.1 直接回答：**仍然有效。无条件。F1 不成立。**

F1 的原文是两件事的析取：*「chat-core 表示 C4 承诺不再有效，**或** 挂载点无法新增 prop」*。**两件我都答否。**

- **承诺不再有效？——否。** 我在 `0000-0003-2026-0807#S-0006` 的承诺原文是「本端承诺该扩展，破坏面为零」。**我今天重新证成了它，而且证据比前案强**（E-E1 / E-E8）。
- **挂载点无法新增 prop？——否。** 挂载点是我自己文件里的一个 JSX 调用块（`side_menu.js:772-779`），新增一个 prop 是我单方面可做的加法。

**故 `code-owner-settings` 的 Q1 结论前半段（side-menu 那一路可行）在我这一侧 *成立*，且我请求本庭当场闭合 F1。**

### 1.2 我今天补齐的、前案没有的三条证据

前案 C4 的「破坏面为零」是我基于 `E-0016`（当时的编号）作出的判断。本案我把它做成机械可核的三条：

**(a) 爆炸半径是 grep 得出的闭集，不是估计**（E-E8）。全仓（`src` + `electron`，含 `.js`/`.cjs`）：

```
buildSideMenuContextMenuItems  →  产品引用 2 处：定义 :11 + side_menu.js:425
onInspectMemory / handleInspectMemory →  产品引用 5 处，全部在 src/COMPONENTs/side-menu/
```

**零处在本目录之外。零处在 electron。零处在其他 owner 的边界。**

**(b) 没有任何测试断言这个回调的参数**（E-E1）。`side_menu_context_menu_items.test.js:277-293` 那个 case 传的是 `onInspectMemory: jest.fn()`，断言只有四条 `items.some(item => item?.label === …)`。**改签名不需要动一行测试。** ——这一条前案没查，是「破坏面为零」在测试层的直接证据。

**(c) 基线是绿的，且我实跑确认**（E-E8）：`side_menu_context_menu_items.test.js` + `use_chat_stream.turn_mutation_v2.test.js`，**2 suite / 54 test 全绿**，2.344s，工作树未修改，产品目录零 dirty。

### 1.3 但我要主动加一条 F1 没问、而它比 F1 更要紧的话

**F1 问的是「这个 prop 能不能加」。我的答案是能，代价为零。但「加了这个 prop」*不足以* 让 tree view 拿到正确的树。** 还有第二条错主路径，落在同一个挂载点上，本案至今无人提及——见正文四。

**我把它写在甲的末尾而不是塞进乙，是因为它会被「C4 仍然有效」这句话掩盖掉。** 承诺有效 ≠ 问题解决。

---

## 二 · 乙 —— 两条右键分支各自应当传什么值

### 2.1 直接回答

| 分支 | 今天传出的（唯一位置参数 `sessionId`） | **应当传的 `ownerChatId`** | 存在？ | 取得代价 |
|---|---|---|---|---|
| character chat（`:197-208`） | `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId \|\| "main")` → `"character_<x>__dm__<y>"` | **`node.chatId`** | **存在** | **零** —— 它在 `:195` 与 `:197` 已被求值两次 |
| 普通 chat（`:217-224`） | `node.chatId` | **`node.chatId`** | **存在** | **零** —— 恒等 |

**两个分支的答案是同一个表达式：`node.chatId`。** 差别只在于 character 分支今天把它算出来、用了两次、然后丢掉了（E-E1）。

### 2.2 为什么是 `node.chatId` —— 我有产端权威依据，不是推断（E-E3）

本案至今的讨论都停在「`sessionId` 不是 `ownerChatId`」这个 **否定式** 上。我这一侧有一条 **肯定式** 的、写在代码注释里的契约：

```
src/PAGEs/chat/hooks/use_chat_stream.js:6453-6457
  /* Memory V2 P0 payload identity + lazy bootstrap.
     owner_chat_id is ALWAYS the UI chat id (targetChatId) — never
     effectiveThreadId, which becomes the character session_id for
     character chats — and is sent unconditionally on both the normal
     and the durable-resume payload …
```

并且它 **不只是注释**，写侧逐字如此实现（同文件 `:6496` 与 `:6501`，两条 payload 分支各一次）：

```js
owner_chat_id: targetChatId,
```

其中 `targetChatId` 是 `runTurnRequest` 的入参 `chatId`（`:4116-4119` `async ({ mode, chatId: targetChatId, … })`），调用方一律传 `activeChatIdRef.current`。

> **净效果**：**V2 数据的 owner 键，在写入的那一刻就被定死为 UI chat id，character chat 也不例外。** 所以读侧要拿的 `ownerChatId` **不需要任何派生、判断或分支** —— 它就是那个 chat 在 chat store 里的主键，而右键节点手上正好有它。
>
> **这条把乙从「该传什么」变成「同键」**：读写同键是唯一正确的答案，其余任何值（`sessionId` / character session id / `threadId` / `effectiveThreadId`）都会查到一个不同的 owner。

### 2.3 `sessionId` 必须继续存在，不能被替换（K2）

Inspector 今天的 V1 数据源是 `getMemoryProjection(sessionId)`（`code-owner-settings` E-0015），**而 V1 的 session 语义与 V2 的 owner 语义不同**：V1 按 character session 分库，V2 按 UI chat 分 owner。议案的前提是「vector view 保持现状」，那么 **两个 prop 必须并存**：

```
sessionId    → V1 vector view 继续用（多态：character session id 或 chat id）
ownerChatId  → V2 tree view 用（恒为 UI chat id）
```

**这也是我支持 `code-owner-settings` N1 并要求把它写死的理由**：不是「别推导」，是 **modal 内部同时握着两个长得很像、在普通 chat 上恰好相等、在 character chat 上必然不等的字符串**，任何一次拿错都不会报错。

### 2.4 我不主张的部分

**入口放不放 side-menu、按 admission 怎么分流** —— 前案 C3 我自陈越界并主动交出，**本案立场不变，仍然交出。** 我只承诺：挂载接口按需扩展，且扩展本身零成本零破坏面。

---

## 三 · 丙 —— `node.chatId` 与 `currentChatId` 是否同一个 id 空间

### 3.1 直接回答：**确认。且我把它从「强旁证」升级为 *证明*。**

`code-owner-settings` 自陈「做到了强旁证但没做到证明」。**它缺的那一段我今天补上了**：二者不是「两个碰巧相同的 id 空间」，而是 **同一个值经五段确定性传递**，且两端各有一道 `chatsById` 存在性守卫（E-E2）。

### 3.2 五段链条，逐段可核

```
① 右键构建器读的 node
   side_menu_context_menu_items.js:195   const chat = chatStore?.chatsById?.[node.chatId]
   同文件 :24-25                          isCharacterChatNode = (chatId) =>
                                            chatStore?.chatsById?.[chatId]?.kind === "character"
   → node.chatId 是 chatsById 的键（两处独立使用，两处都必须命中才有菜单）

② 同一个 node 被点选时走的路
   side_menu.js:390                       explorerHandlerCallbacksRef.current.onSelect = handleSelectNode
   use_side_menu_actions.js:19-25         handleSelectNode = (nodeId) => setChatStore(selectTreeNode({nodeId}))

③ store 侧把它写成 activeChatId
   chat_storage_store.js:1712-1737        target = store.tree.nodesById[nodeId]
                                          → updateActiveAndSelectedFromChatId(store, target.chatId)
   chat_storage_store.js:1022-1029        if (!chatId || !store.chatsById[chatId]) return null;
                                          store.activeChatId = chatId;          ← 守卫①

④ chat 页把它读进 ref
   use_chat_session_state.js:345-347      nextActiveId  = nextStore?.activeChatId
                                          nextActiveChat = nextStore?.chatsById?.[nextActiveId]
   use_chat_session_state.js:351-353      if (!nextActiveId || !nextActiveChat) return;   ← 守卫②
   use_chat_session_state.js:412          activeChatIdRef.current = nextActiveId

⑤ streaming hook 把它当 ownerChatId
   use_chat_stream.js:11874               const currentChatId = activeChatIdRef.current
   use_chat_stream.js:11985               resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, … })
   use_chat_stream.js:4116-4119 / :6496   runTurnRequest({chatId: targetChatId}) → owner_chat_id: targetChatId
```

**再加一道树侧的守卫**：`chat_storage_tree.js:335` 在重建树时逐字写着 `if (node.entity === "chat" && node.chatId && store.chatsById[node.chatId])` —— **chatId 不在 `chatsById` 里的 chat 节点根本进不了树**，因此右键菜单不可能拿到一个不在 `chatsById` 里的 `node.chatId`。

> **结论**：`node.chatId` 与 `activeChatIdRef.current` 取自同一张表 `store.chatsById`，且 `activeChatId` 的值 **正是** 某个 `node.chatId` 经 `selectTreeNode` 直接赋入的。**这不是「同一个 id 空间」，这是同一个值。**
>
> **对 `code-owner-settings` 的直接回答：你的不确定性 3 *确认成立*，你的 Q1 结论前半段 *不翻转*。**

### 3.3 一条限制，我如实标注

我核实了 `store.activeChatId` 的 **全部 8 个产品写点**（`chat_storage_store.js:391,1029,1135,1869,1888,1898,2019` + `chat_storage_migrate.js:313`），其中 `:391` / `:1135` 写 `null`，其余全部写一个来自 `chatsById` 或 chat 对象自身 `id` 的值。**我未逐一读完 migrate 那一条的全部分支**（`chat_storage_migrate.js:285-313`，五个 fallback）——**该文件归 `code-owner-shared-arteries`**，我只登记「它的输出仍是 chat 主键」这一形状，**不主张其正确性**。这一处不影响本节结论，因为 ④ 的守卫②会挡下任何不在 `chatsById` 里的值。

---

## 四 · 丁 —— 我端怎么用 `context_v2_bridge`、`getTree` stub 是什么、我端持有的取值路径

### 4.1 我端今天怎么用它 —— **只用两个方法，都是写路径的前置读**

```
src/PAGEs/chat/hooks/use_chat_stream.js:87-89   import { contextV2Bridge, parseContextV2ErrorCode }
  :3907   contextV2Bridge.isAvailable()                      ← 门
  :3916   contextV2Bridge.getSessionHead({ownerChatId, sessionId})   ← turn mutation 前的 admission 读
  :3920   parseContextV2ErrorCode(error) || "context_v2_failed"
  :4004   contextV2Bridge.isAvailable()
  :4010   contextV2Bridge.rebaseSession(payload)             ← 写
  :4013   parseContextV2ErrorCode(error) || "context_v2_failed"
```

**18 个方法里我只调 2 个**（`getSessionHead` / `rebaseSession`），且 **两个都服务于 edit/resend/delete 的 turn mutation**，不是浏览型读。**我不是 V2 读平面的消费者，我是它的写者。** 这一点值得本庭区分：`chat-bubble` 的三个消费者是读，我是写，**方向不同，处境也不同**。

### 4.2 `getTree: noop` 是什么 —— **是探针的产物，不是消费者**（E-E5）

`use_chat_stream.turn_mutation_v2.test.js:208-262` 构造的是一个 **完整的 `window.contextV2API` preload 替身**。我逐项比对：

```
mock 里的方法数                                = 18
REQUIRED_METHODS（context_v2_bridge.js:32-50） = 18
逐项对应                                        = 18/18，顺序亦同
其中 jest.fn 实现的只有 2 个（getSessionHead / rebaseSession），其余 16 个是 noop
```

原因在 facade 的 **全有或全无探针**（`context_v2_bridge.js:59-67`，`code-owner-shared-arteries` E-0035 已独立登记为 fail-closed 设计）：缺任何一个方法，`resolveApi()` 返回 `null`，整个 facade 失明。

> **净效果**：**`getTree: noop` 不表示 chat-core 消费 `getTree`，它表示 chat-core 被迫声明 `getTree` 存在，否则我真正要用的那两个方法拿不到。** 本庭 `FRAMING` 已知事实 4 把它记作「已在 mock 中 stub 了 `getTree`」——**字面正确，但读者极易把它读成「chat-core 与 getTree 有关」。请以本条为准。**

### 4.3 由此得出一条落在我边界内、支持 `code-owner-shared-arteries` A2 的成本（请求 4）

**A2「不得新增 facade 方法」在我这里有一个具体且 *静默* 的代价**：`REQUIRED_METHODS` 变 19 的那一刻，我的 mock 是 18，`resolveApi()` 返回 `null`，`isAvailable()` 为假 —— 而我的两个调用点 **都以 `isAvailable()` 为门**（`:3907` / `:4004`）。测试不会红，**它会绿，但测的是 bridge 缺席的降级分支**。

**这是本仓「唯一会静默失效的测试形态」（Electron `.js`/`.cjs` 双胞胎）之外的第二种。** 我登记它，不请求本案处置。

### 4.4 我端是否持有可供 Inspector 复用的 `ownerChatId` 取值路径 —— **持有两条，只有一条是对的**（E-E4）

| 路径 | 值 | 对 Inspector 可用？ |
|---|---|---|
| **A. 挂载点的 `node.chatId`** | **右键的那个 chat** | ✅ **正确，且这是唯一正确的一条** |
| **B. `activeChatIdRef.current` / `chatStore.activeChatId`** | **当前活动的那个 chat** | ❌ **错误。二者常常不是同一个 chat** |

**为什么 B 是错的 —— 机械原因，一行**：

```
src/COMPONENTs/side-menu/side_menu.js:344-353
  const handleContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x, y, node: storeNode });    ← 只开菜单
  }, []);                                                        ← 不调 handleSelectNode
```

**右键 *不* 选中节点。** `Inspect Memory` 作用于 **被右键的那个 chat**，而 `activeChatId` 是 **上一次左键点选的那个 chat**。用户在会话 A 里聊天、右键会话 B 选 `Inspect Memory` —— 这是这个入口最常见的用法之一，不是边缘情形。

### 4.5 为什么这条比 character session id 那条更危险 —— 请本庭记为新增缺口（请求 2）

| | E-0016 的错主（character session id 冒充） | **E-E4 的错主（右键节点 ≠ 活动会话）** |
|---|---|---|
| 传出的值 | `character_foo__dm__main` | **一个真实存在的 chat id** |
| main 语法门 | 通过（`code-owner-electron` 已实跑，S-0010 丙(2)） | **通过，且完全合法** |
| 服务端 owner-scoping | **可能** 404 / 空树（G10 未核实） | **必然返回该 owner 的真实数据** |
| 收端可检测性 | 取决于 G10 的答案 | **结构性不可检测** —— 200 + 非空树，每一层都正确 |
| 用户看到 | 空树 或 错误 | **另一个会话的真实记忆树，且看不出哪里不对** |

**三道防线全部放行，且全部没做错**：`code-owner-electron` 的语法门只防畸形（其 S-0010 丙(3) 明言「没有，一个都没有」）；`code-owner-runtime` 的 owner-scoping 正确地返回了该 owner 的数据；`code-owner-shared-arteries` 的 facade 正确地不做任何校验（其 A1）。**没有任何一层能救它，因为没有任何一层知道用户想看的是哪个 chat。**

**唯一的防线是挂载点本身把正确的值送出去。** 这就是 K1 / K4 与请求 3 的全部理由。

**我把这条自陈为「本案迄今由我这一层新捞出的、唯一的实质风险」，并声明它的成因是 *入口语义*，不是任何一方的实现缺陷。**

---

## 五 · Q4 / Q1 —— 我端没有被点名、但顺手可给的两条

**(1) 我端不参与判态，也不该参与。** side-menu 是 modal hub：我提供挂载接口，判态与呈现落 modal 内部（K5）。**故 Q4 的收端半边在我这里不产生任何主张。**

**(2) 但我端持有一份「V2 码 → 用户可见文案」的既有实现，它是本案讨论中被漏计的一份**，见正文六。

---

## 六 · Q2（G1）· 强制表态 —— 我不说「与我无关」

### 6.1 本案会不会要求我的边界承担今天不属于我的判定职责？—— **会一件，我拒绝；另有一件已经是我的，我不交出**

| 职责 | 今天在哪 | 本案推不推给我 | 我的立场 |
|---|---|---|---|
| 把 `ownerChatId` **送到** 挂载点 | 我 | 不推（已是我的） | **承接，6 处改动，零测试改动** |
| **消歧两条右键分支** | 我 | 不推（已是我的） | **承接**（K2/K3） |
| **保证送出去的是右键那个 chat 而不是活动 chat** | **无人明确持有** | **会推给我，而且应该推给我** | **承接。** 它落在我的挂载点上，没有第二个人能做（4.5） |
| **定义** 四态判据（哪些码算未知、哪些算无、哪些算未启用） | **无人**（各消费者即兴） | **会试图推**（因为我手上有一份最完整的映射） | **不承接定义权。** 但见 6.3：我提交一条 **必过约束** |
| **决定** 谁是权威（`memoryV2` / `contextV2Bridge.getStatus()` / `enable_memory_v2`） | 无人 | 会试图推 | **不落在本边界。** 归 `expert-architecture` 出意见 + CEO 裁定 |
| tree view 内部的渲染与状态机 | `code-owner-settings` | 不该推给我 | **不落在本边界** |
| 挡住「用错误 owner 查询」的身份门 | 无人（`code-owner-electron` 明确拒绝在本案内建，其 FE3） | 会试图推 | **不落在本边界，也不该建在我这里**（K5）。**能判断的是 `code-owner-runtime`（G10）与 `expert-architecture`（落位）** |

### 6.2 一条被本案漏计的事实：**chat-core 已经持有第 5、第 6 份码→文案映射，而且是最完整的一份**（E-E6）

`code-owner-shared-arteries` 在 5.1 数出「四份拷贝」并把 chat-core 记作「一处（`use_chat_stream.js:3920,4013`）」。**那两行只是取码，不是映射。真正的映射在另一个文件里，而且是两张表：**

```
src/PAGEs/chat/hooks/context_v2_turn_mutation.js
  :389-394   RUNTIME_UNAVAILABLE_CODES   4 个码  → UNAVAILABLE
  :396-412   NOT_READY_CODES            15 个码  → NOT_READY
  :420-435   contextV2TurnMutationMessage   5 个出口（+ IN_PROGRESS / CONFLICT / 兜底 FAILED）
  :445-451   V1_MIRROR_UNAVAILABLE_CODES  5 个码（V1 词汇，独立第二张表）
  :456-459   contextV2V1MirrorMessage       2 个出口
  :97-109    CONTEXT_V2_TURN_MUTATION_MESSAGES  7 条固定文案
```

**这份映射有三条别人那四份都没有的性质：**

1. **码词汇表是闭集且穷举过**（19 个 V2 码 + 5 个 V1 码），不是即兴 if-else。
2. **fail-closed 兜底成文**：`:434` `return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED`，未知一律落失败态、永不落「就绪」或「空」。**这与 `code-owner-shared-arteries` 的 A4 与 P2 立场完全一致，我在此登记为对其 P2 的独立支持。**
3. **绝不外泄服务端 message**：`:93-96` 逐字写着 *"A turn-mutation failure must never surface a server message, an error path, a payload excerpt or any conversation content"*。**七条文案全部是固定字面量。**

### 6.3 而这份映射的注释里，写着一条对「一份映射喂五个消费者」的 **原则性反对**，请本庭记入（请求 5）

```
src/PAGEs/chat/hooks/context_v2_turn_mutation.js:437-444
  /* ── V1 mirror leg (shadow only) ───────────────────────────────
     The second leg of a shadow mutation runs through the LEGACY V1 replace, so
     its failures arrive with V1/bridge error codes, not context_v2_* ones. They
     get their own mapping rather than being funnelled through
     contextV2TurnMutationMessage: that map would classify an unrelated V1 code
     as a rebase CONFLICT and tell the user the conversation moved when it did
     not. …
```

**这段注释记录的是一次已经作出的、有具体代价的判断**：把两个语境的码喂进同一张表，会让用户被告知「对话变了」——**而对话根本没变**。所以我在自己边界内 **蓄意维持了两张表**。

> **我的 Q2 表态因此不是「落点归谁」，而是给落点加一条必过约束：**
>
> **码 token 不是判据的全部，(码 × 调用语境) 才是。** 一个 `context_v2_unavailable` 在 turn mutation 里意味「你这次编辑没生效」，在 tree view 里意味「这棵树读不出来」，在 `chat-bubble` 的 journal reload 里意味第三件事。**任何统一映射若只按码分支、不按语境分层，就会在某个消费者身上撒谎** —— 我这份注释是它已经发生过一次的记录。
>
> **`code-owner-shared-arteries` 的 A4（未知落第三态）与我这条不冲突，是正交的两条**：它管「未知怎么办」，我管「已知的码在不同地方是不是同一件事」。**两条都进落点的验收标准，我才认这个落点解决了 D7/D8。只做前者，我这两张表迁不过去。**

### 6.4 一条硬事实：**`context_v2_store_disabled` 在整个 `src/` 下出现 0 次**（E-E7）

```
grep -rn "context_v2_store_disabled" src --include="*.js"   →   零命中
grep -rn "context_v2_store_disabled" unchain_runtime         →   route_memory_v2.py:239
                                                                 memory_v2_runtime.py:726
```

而这个码，按 `code-owner-runtime` 的 E-0010(b)、`code-owner-electron` 的 S-0010 丁(2)、`code-owner-shared-arteries` 的 E-0039，**正是「V2 未启用」在整条链路上的唯一权威信号**。

> **净效果，请本庭记入**：「未启用」不是 Inspector 的六态机里缺一枝（`code-owner-settings` §2.1 的表述），**是整个 renderer 都不知道这个码存在** —— 四份既有映射、facade 的解析面、我的两张表，无一处出现过它。
>
> **在我的表里它的归宿是可计算的**：不在 `RUNTIME_UNAVAILABLE_CODES`、不在 `NOT_READY_CODES`、不是 `CONTEXT_V2_REBASE_IN_PROGRESS_CODE`、不在 `TERMINAL_REBASE_ERROR_CODES` → **落 `:434` 的兜底 FAILED**：*"This message change could not be applied. Please try again."* —— **对一个重试永远不会改变的条件说「请重试」。**
>
> **这不是本案要修的 bug**（该码在我的调用路径上今天大概率不可达，因为 store off 时 `memory_v2_requested` 也不会打开——**该可达性我未核实，标为推断**）。**我举它是因为它给 D7/D8 那个「无主构件」提供了一个此前没有的、可证伪的度量**：**统一映射存在的必要性，可以用「同一个权威码在几份拷贝里被正确处理」来量。今天的答案是 0/5。**

### 6.5 前案 C3 的越界交出在本案是否仍然成立 —— **成立，但它不覆盖本案的 Q2**

本庭点名要我说明这一点，我分开答：

- **前案 Q2/Q5 = 「`Inspect Memory` 按 chat admission 分流放在哪一层」。** 我在 `0000-0001-2026-0807#S-0006` 自陈越界、主动交出，并在 `0000-0003-2026-0807#S-0006` 正文二(e) 重申。**本案立场完全不变：入口放哪一层、怎么按 admission 分流，是 `code-owner-settings` 的判断，我不主张。**
- **本案 Q2 = 「四态判定构件的落点与 owner」。** **这是一个不同的问题**，前案 `#S-0014` D7 / `#S-0024` D8 才第一次把它识别出来，**我从未就它作过任何交出。** 故我在 6.1~6.4 的表态 **不是收回交出**，是就一个新问题首次作答。
- **两者的分界线我说清楚**：**「谁被允许看到 Inspector」是产品分流 → 交出；「Inspector 看到的错误码该被翻译成什么」是公共动脉的语义 → 我不交出我这两张表的语境分层判断，但我不主张落点归属。**

### 6.6 G1 是否构成前置阻塞？—— **对可行性不阻塞；对我这两张表的迁移阻塞**

我在甲/乙/丙/丁 的全部结论都是 `b2385d5d` 上的 **值传递事实与作用域事实**，在 16 项强制回应的任何组合下都不变。**本案可以在 `0000-0003-2026-0807` 裁定之前完成议案庭审。**

**但**：若方案庭审要求我把 `context_v2_turn_mutation.js` 的两张表迁进一个统一构件，**那在 6.3 的约束闭合前是阻塞的**，且我会以 `OBJECTION` 反对（CF4）。**我与 `code-owner-settings`（F5）、`code-owner-shared-arteries`（5.4 末）在「不接受五份拷贝这个空选项」上立场一致；我比二者多一条：也不接受一份折平的映射。**

**我支持 `code-owner-electron` 的出路（其 S-0010 Q2(3)）**：本案显式声明 **不新增状态源、只消费已存在的四态**。若本案如此声明，**我边界内的改动仍是 6 处，两张表原地不动，本案对 Q0 裁定零依赖。** 这是我最优先推荐的路径。

---

## 七 · 丙（框定第三条）· 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

**任一条成立即翻，请本庭逐条登记为方案庭审的检查点：**

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **CF1** | 议案要求 tree view 的 `ownerChatId` **不从右键节点取**，而从 chat 页 / 活动会话 / 任何全局状态取 | **判不可行**（不是技术不可行，是 **稳定错主**）。E-E4 已证右键 ≠ 活动会话，且该错误在链路上结构性不可检测。我以 `OBJECTION` 反对 | 我 + `code-owner-settings`（N1 的范围） |
| **CF2** | 为了拿这个值，要求在 `use_chat_stream.js` 或 chat 页新增导出 / context / ref 透传 | **翻转**。改动面从 6 处一个目录跨到 ~12k 行的吸积点上，K1 破。**不是不可行，是我拒绝在本案内承接**，须单独走 case | 方案庭审 |
| **CF3** | 议案的适用面被裁定为「settings 全局 Inspector 也要 tree view」，且要求由我提供 chat 上下文 | **我这一路不受影响，但我预先反对该实现形态**：在 settings 里重建会话选择等于把 side-menu 的职责复制一份（与 `code-owner-settings` N4 同向，我从入口语义再加一条理由，见建议处置 3） | CEO 裁定 |
| **CF4** | 方案要求把 `context_v2_turn_mutation.js:389-459` 的两张码表迁进一个 **只按码分支、不按语境分层** 的统一映射 | **判结构上不可接受**，以 `OBJECTION` 反对（6.3）。**技术上做得到，做出来会对用户撒谎** —— 该代价我边界内已经付过一次并写进注释 | 方案庭审 + `expert-architecture` |
| **CF5** | 方案要求在 side-menu 侧新增任何 V2 调用（owner 预检 / `listSpaces` / 判态） | **判不可行**（K5）。侧栏在 500+ 会话时已有 O(n) 全树重建的已知塌点，把 modal 的数据依赖倒灌进导航树的渲染路径不可接受。**且这会推翻 S-0003 对 `expert-security` 的不传唤判定（新增 renderer 消费者落点），届时我请求补传** | 我 |
| **CF6** | `code-owner-settings` 表示 `MemoryInspectModal` **无法接受一个新 prop**（例如 props 已被冻结或有 allowlist） | **甲 的「破坏面为零」在下游翻转**。我这一侧的加法仍成立，但值送不进去 → side-menu 那一路不可行。**我未核实其组件内部，这一条只有它能证伪** | `code-owner-settings` |

**不会被推翻的（可作为方案庭审在我这一层的地基）**：`node.chatId` 在两条右键分支中 **均在作用域内**（character 分支已求值两次）；`node.chatId` 与 `ownerChatId` 是同一个值经五段确定性传递、两道 `chatsById` 守卫；写侧 `owner_chat_id` 恒为 UI chat id 且成文；挂载接口的产品引用点全仓 7 处且全部在 `src/COMPONENTs/side-menu/`；无任何测试断言 `onInspectMemory` 的参数；`getTree: noop` 是 18 方法探针的产物而非消费者；`handleContextMenu` 不选中节点。

---

## 八 · 留待方案庭审（自行标注，本阶段不作为结论）

按 S-0001 的范围纪律登记，**不主张**：

- **`ownerChatId` 是否随活动会话变化**（不确定性五）。我倾向「打开时快照、不跟随」，与今天 `sessionId` 的语义一致（K4 已把它写成约束的否定半），**但「打开着的 modal 在其 chat 被删除时该怎样」是交互设计**。
- **`Inspect Memory` 这一项在 V2 未启用时是否仍出现在右键菜单里**。技术事实登记于此：菜单构建器 `buildSideMenuContextMenuItems` 是 **纯同步** 的（`:11-23` 无 async、无 await、无 promise），**任何异步判态都不可能在菜单构建期完成** —— 这与我在 `0000-0001-2026-0807#S-0006` 提出的「入口是纯同步菜单构建器」是同一条硬约束，**它在本案继续成立**。要按启用态隐藏该项，只能靠一个已缓存的同步可读状态。**这是可行性证据，隐不隐是设计。**
- **`chatKind` 要不要一并送进 modal**。技术事实：`chat?.kind` 在 `:195` 已在作用域内（`isCharacterChatNode` 就是读它），送出去同样零成本。**送不送取决于 Inspector 要不要按 chat 类型分呈现，那是设计。**

---

## 九 · 本 `ASSESSMENT` 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**。我于作业开始时复测工作树：**16 个 dirty/untracked 条目，全部位于 `.claude/`；`src/` `electron/` `unchain_runtime/` 三个产品目录 `git status --porcelain` 输出行数为 0**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**在我作业时点仍然成立**（与 `code-owner-shared-arteries` E-0033 的复测结论一致，条目数因各 owner 陆续落盘记忆而继续增长）。全部只读，未改任何文件、未 commit、未起 sidecar、未起 Electron、未跑应用。

---

### E-E1 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:24-25, 194-208, 217-224` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:237-241, 296-298, 425-436, 772-779` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js:277-293`
- **取得方式**: 定点读取上述行段；`grep -n "onInspectMemory\|handleInspectMemory\|memoryInspect\|setMemoryInspect\|MemoryInspectModal" src/COMPONENTs/side-menu/*.js`
- **支持/反驳**: **支持** 甲（C4 仍然有效）与 乙（两分支应传 `node.chatId`）；**加强** E-0016 —— 其只登记了两个调用点，本条补上 **`node.chatId` 在 character 分支内已被求值两次**（`:195` 索引 `chatsById`、`:197` 传给 `isCharacterChatNode`）这一决定性事实
- **关键原文**:
  ```
  :24-25   const isCharacterChatNode = (chatId) =>
             chatStore?.chatsById?.[chatId]?.kind === "character";
  :194     if (node.entity === "chat") {
  :195       const chat = chatStore?.chatsById?.[node.chatId];      ← node.chatId 用法 1
  :196       const chatTitle = chat?.title || node.label || "Chat";
  :197       if (isCharacterChatNode(node.chatId)) {                ← node.chatId 用法 2
  :198-201     const memorySessionId = buildCharacterMemorySessionId(
                 chat?.characterId, chat?.threadId || "main");
  :207         onInspectMemory && onInspectMemory(memorySessionId, chatTitle)   ← node.chatId 在此被丢弃
  :223       onInspectMemory && onInspectMemory(node.chatId, chatTitle)
  ```
- **完整性限制**: 只覆盖字面标识符与该目录。**未运行应用，未观察实际右键行为。** `side_menu_context_menu_items.test.js:277-293` 我读了全段并确认其断言只有四条 `items.some(item => item?.label === …)`，**未穷举该文件全部 7 个 `buildSideMenuContextMenuItems` 调用点的每一条断言** —— 但 `onInspectMemory` 在该文件仅出现 1 次（`:285`），故「无测试断言其参数」这一结论不受该限制影响
- **证据类型判据**: 仓内文件字面内容与行号，可在同一 revision 直接复核 → 自证类

### E-E2 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js:19-25` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:390` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_store.js:1022-1029, 1704-1744` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_tree.js:335-341` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_session_state.js:237, 345-353, 412` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11874, 11985`
- **取得方式**: 逐段定点读取；`grep -rn "activeChatId = " src/SERVICEs/chat_storage/*.js`（产品写点共 **8 处**：`chat_storage_store.js:391,1029,1135,1869,1888,1898,2019` + `chat_storage_migrate.js:313`）
- **支持/反驳**: **确认并升级** `code-owner-settings` 不确定性 3 —— 从「强旁证」升级为证明；**支持** 丙 的全部内容
- **关键原文**:
  ```
  chat_storage_store.js:1712-1737   target = store.tree.nodesById[nodeId]
                                    → updateActiveAndSelectedFromChatId(store, target.chatId)
  chat_storage_store.js:1023        if (!chatId || !store.chatsById[chatId]) { return null; }
  chat_storage_store.js:1029        store.activeChatId = chatId;
  use_chat_session_state.js:345-353 nextActiveId = nextStore?.activeChatId
                                    nextActiveChat = nextStore?.chatsById?.[nextActiveId]
                                    if (!nextActiveId || !nextActiveChat) { return; }
  use_chat_session_state.js:412     activeChatIdRef.current = nextActiveId;
  chat_storage_tree.js:335          if (node.entity === "chat" && node.chatId && store.chatsById[node.chatId])
  ```
- **完整性限制**: **(1)** `chat_storage_migrate.js:285-313` 的五条 fallback 我 **只读了赋值行未逐条追其来源**，该文件归 `code-owner-shared-arteries`；本条结论不依赖它，因为 `use_chat_session_state.js:351` 的守卫会挡下任何不在 `chatsById` 里的值。**(2)** 纯静态，**未运行应用**，「用户点选后 ref 确实更新」是对代码的阅读不是观察。**(3)** 未穷举 `store.tree.nodesById` 的全部写入点，只核了树重建时的 `chatsById` 守卫（`chat_storage_tree.js:335`）与节点工厂（`:35-46`）
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-E3 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:4116-4119`（`runTurnRequest = useCallback(async ({ mode, chatId: targetChatId, … }))`）· `:4713`（`let effectiveThreadId = targetChatId`）· `:4912`（`effectiveThreadId = resolvedCharacterConfig.session_id`）· `:6453-6458`（成文契约注释）· `:6496`、`:6501`（两条 payload 分支各一次 `owner_chat_id: targetChatId`）· `:11978`、`:11985`
- **取得方式**: 定点读取；`grep -n "ownerChatId\|owner_chat_id" src/PAGEs/chat/hooks/*.js src/PAGEs/chat/*.js`（排除 `*.test.js`，**产品命中 22 处，全部一致**）
- **支持/反驳**: **支持** 乙 —— 提供本案至今唯一一条 **产端（写侧）** 的权威依据，把「character 分支该传什么」从推断变为「与写侧同键」
- **关键原文**:
  ```
  :6454-6456   owner_chat_id is ALWAYS the UI chat id (targetChatId) — never
               effectiveThreadId, which becomes the character session_id for
               character chats
  :6496        owner_chat_id: targetChatId,        （durable-resume 分支）
  :6501        owner_chat_id: targetChatId,        （普通 send 分支）
  :11985       resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, sessionId: targetSessionId })
  ```
- **完整性限制**: **(1) 注释本身是传闻类，不得用于证明其所述事实为真** —— 我据以主张的是 **`:6496` / `:6501` 两行代码**，注释只作为「该契约是被有意识写下的」的旁证。**(2)** 未实跑，未观察任何真实 payload。**(3)** 我未核实 sidecar 侧是否真的按 `owner_chat_id` 建 space —— **那归 `code-owner-runtime`**；我只主张 renderer 送出去的键是什么
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类（**其中注释部分按传闻类对待，已在完整性限制中隔离**）

### E-E4 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:344-353`（`handleContextMenu`）· `:390`（`onSelect = handleSelectNode`）· `:391`（`onContextMenu = handleContextMenu`）· `:237-241`（`memoryInspect` 本地 state）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js:19-25`
- **取得方式**: 定点读取 `handleContextMenu` 全体并与 `handleSelectNode` 逐行对照
- **支持/反驳**: **新增** 一条本案至今无人提出的错主路径；**加强** `code-owner-settings` 的 N1 与 F3 的动机；**与 E-0016 的错主路径正交**（二者成因不同、可检测性不同）
- **关键原文**:
  ```js
  const handleContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node: storeNode });
  }, []);
  ```
  **全函数体四行，无 `handleSelectNode`、无 `selectTreeNode`、无 `setChatStore`。**
- **完整性限制**: **(1)** 未运行应用 —— 「右键不选中」是对该回调全文的阅读，**但我未核实 `BUILTIN_COMPONENTs/explorer` 是否在派发 `onContextMenu` 之前另行触发了 `onSelect`**（该组件归 `code-owner-ui-primitives`）。**若 explorer 内部先选中再派右键，本条结论翻转** —— 我明确标注该前提未核实，并请方案庭审在实施前核一次。**(2)** 未观察任何用户行为，「用户常在 A 里右键 B」是使用推断不是数据
- **证据类型判据**: 仓内文件字面内容 → 自证类

### E-E5 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:208-262`（18 方法 mock）· `:249`（`getTree: noop`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-50`（`REQUIRED_METHODS`）· `:59-67`（`resolveApi`）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:87-89, 3907, 3916, 3920, 4004, 4010, 4013`
- **取得方式**: 逐项比对 mock 的方法名与 `REQUIRED_METHODS`；机械计数 `awk 'NR>=205 && NR<=262' … | grep -cE "^\s{6}(getStatus|listEvents|…|decideCandidateReview):"` → **18**；`grep -rln "contextV2API" src --include="*.js"` → **3 个文件**（本测试 + facade + facade 测试），即 **`src/COMPONENTs/**` 与 `src/PAGEs/**` 下只有我这一个文件构造该替身**
- **支持/反驳**: **收窄** 本庭 `FRAMING` 已知事实 4 —— `getTree: noop` 不表示 chat-core 消费 `getTree`；**独立支持** `code-owner-shared-arteries` 的 A2，并给出该约束在我边界内的具体、**静默** 的代价
- **完整性限制**: **(1)** 「facade 加第 19 个方法会让我的测试静默改走降级分支」是 **对 `resolveApi()` 全有或全无语义的推论，我未实跑验证**（要验证须临时改 facade，而本轮只读）。**(2)** 我未核实 `chat-bubble` 三个消费者的 mock 形态是否有同样问题 —— 那是其边界
- **证据类型判据**: 仓内文件字面内容 + 可复跑计数命令 → 自证类

### E-E6 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:93-109`（7 条固定文案）· `:389-394`（`RUNTIME_UNAVAILABLE_CODES`，4 码）· `:396-412`（`NOT_READY_CODES`，15 码）· `:420-435`（`contextV2TurnMutationMessage`，5 出口 + 兜底）· `:437-444`（**不合并的成文理由**）· `:445-451`（`V1_MIRROR_UNAVAILABLE_CODES`，5 码）· `:456-459`（`contextV2V1MirrorMessage`）
- **取得方式**: 定点读取全部七段
- **支持/反驳**: **补正** `code-owner-shared-arteries` 5.1 的拷贝计数（其把 chat-core 记作「一处 `use_chat_stream.js:3920,4013`」，**那两行只取码不映射，真正的映射是另一文件的两张表**）；**支持** 其 P2（fail-closed 兜底）为一条已在生产中生效的实践；**提出** 6.3 的语境分层约束
- **关键原文**:
  ```
  :434       return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;      ← fail-closed 兜底
  :93-96     A turn-mutation failure must never surface a server message, an error
             path, a payload excerpt or any conversation content …
  :440-444   They get their own mapping rather than being funnelled through
             contextV2TurnMutationMessage: that map would classify an unrelated V1
             code as a rebase CONFLICT and tell the user the conversation moved
             when it did not.
  ```
- **完整性限制**: **(1)** 注释按传闻类对待 —— 它证明「该判断曾被作出并写下」，**不证明「合并一定会撒谎」**；我据以主张的是 **两张表在代码中确实分立** 这一结构事实。**(2)** 我未逐一验证 19 个码在 sidecar 侧确实存在且语义如我表所设（**产端归 `code-owner-runtime`，其 E-0037 报 42 个码**）。**(3)** 未跑 `context_v2_turn_mutation` 的测试
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类

### E-E7 | repository | 自证类
- **来源定位**: 全仓负向搜索
- **取得方式**（**可复跑，须在 `/Users/red/Desktop/GITRepo/PuPu` 下执行**）:
  ```bash
  grep -rn "context_v2_store_disabled\|store_disabled" src --include="*.js"        #  → 零命中
  grep -rn "context_v2_store_disabled" electron unchain_runtime \
    --include="*.js" --include="*.py" --include="*.cjs" | grep -v test
  #  → unchain_runtime/server/memory_v2_runtime.py:726
  #  → unchain_runtime/server/route_memory_v2.py:239
  ```
- **支持/反驳**: **支持** 6.4；**为 D7/D8 的「无主构件」提供一个此前没有的可证伪度量**（权威码在既有拷贝里的覆盖率 = 0/5）；**加强** `code-owner-settings` §2.1 末「未启用在 V1 词汇表里根本不存在」—— 本条把它从「Inspector 缺一枝」扩大为「整个 renderer 都不知道这个码」
- **完整性限制**: **(1) 这是负向证明**，只覆盖两个字面标识符。若该码以拼接、常量转发或别名形式出现于 `src/`，本搜索看不到 —— 我认为可能性低但 **不能排除**。**(2)** 我未核实该码在我的调用路径上今天是否可达（`store_owner=off` 时 `memory_v2_requested` 是否也为假），**该可达性判断是推断，不得作为事实引用**。**(3)** 未核实 `electron/` 侧的中转是否改写过该码 —— 归 `code-owner-electron`（其 S-0010 戊(3) 已报「code 保真」）
- **证据类型判据**: 可复跑 grep + 仓内文件 → 自证类

### E-E8 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08。**工作树未修改，`src/` `electron/` `unchain_runtime/` 三目录 `git status --porcelain` 行数为 0**
- **取得方式**（**完整可复跑命令，只读、不改文件**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && CI=true npx react-scripts test \
    --testPathPattern="side_menu_context_menu_items|use_chat_stream.turn_mutation_v2" \
    --watchAll=false
  ```
  **实际输出（尾部）**:
  ```
  PASS src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js
  PASS src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js

  Test Suites: 2 passed, 2 total
  Tests:       54 passed, 54 total
  Snapshots:   0 total
  Time:        2.344 s
  ```
  **同批（纯 grep，自证类，一并登记以免另编号）—— 挂载接口的机械爆炸半径**:
  ```bash
  grep -rn "buildSideMenuContextMenuItems" src electron --include="*.js" --include="*.cjs"
  #  产品 2 处：side_menu_context_menu_items.js:11（定义）· side_menu.js:25,425（import + 调用）
  #  测试 7 处：全部在 side_menu_context_menu_items.test.js
  grep -rn "onInspectMemory\|handleInspectMemory" src electron --include="*.js" --include="*.cjs"
  #  产品 5 处：side_menu_context_menu_items.js:19,207,223 · side_menu.js:296,433(+444 依赖数组)
  #  测试 1 处：side_menu_context_menu_items.test.js:285（仅 jest.fn()，不断言参数）
  #  electron/ 下：零命中
  ```
- **支持/反驳**: **支持** 甲（C4 破坏面为零，且基线为绿）；**支持** 「受影响对象」的 6 处清单与「零测试改动」结论
- **完整性限制**: **(1)** 只跑了 2 个 suite，**不是全量回归** —— 「我改这 6 处不会破坏别处」这一命题 **未被本次运行证明**，只证明了「今天这 2 个 suite 是绿的」。**(2)** 未跑 `npm run test:electron`（我边界内无 `.cjs` 双胞胎，但该断言未经验证）。**(3)** grep 只覆盖字面标识符，**未核实是否存在经动态属性访问的旁路调用**。**(4)** 依 [A-012](../../../codex/adaptations.md)，本条不作为「实施后一定安全」的依据，只作为「实施前基线状态」的登记
- **证据类型判据**: 运行时观察（本仓自带 test runner，未搭替身、未改代码）→ **须查类**（与 `code-owner-electron` 的 E-0029 同判据同分类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查）
