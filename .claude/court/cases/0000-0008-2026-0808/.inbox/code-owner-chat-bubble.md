#### S-XXXX | ASSESSMENT | code-owner-chat-bubble → case
- **阶段**: 议案庭审
- **结论**: **可行，我边界内 0 处必须改动。** 但本庭把我请来验证的那条推论，我要 **一半证实、一半推翻**。**甲 证实且比本庭说的更强**：我端的 `ownerChatId` 来自 `StreamingMessageStoreContext`，其源头与 `use_chat_stream.js:11985` 生产侧用的 **是同一个 `activeChatId`**，全链单一 provider、单一挂载点、空值 fail-closed、且 **三条性质全部被测试锁住**（E-F1/E-F2）。**本庭点名的 E-0016 多态值在我这条链上结构性不可达** —— `buildCharacterMemorySessionId` 在全 `src/` 只有 **一个** 消费者，就是 Inspector 那条右键路径，不是我（E-F3）。**但推翻的那一半更重要：我端不是 Inspector 可以复用的路径。** 我拿得到好值，是因为我 **只能** 在当前活跃会话的消息列表里挂载；Inspector 的 side-menu 入口是对 **任意（可能非活跃）节点右键**，今天没有任何 context 覆盖它。**我端是「这个值在 renderer 里存在」的实证，不是「Inspector 可以接上去的一根线」。** **乙 我的答案是「不能」，且原因不是信号没到，是我把它扔了** —— `context_v2_store_disabled` 在 **整个 `src/` 出现 0 次**（E-F4），我端唯一的启用态门 `isAvailable()` 是 preload 存在性探针不是 store 状态探针，**净效果：出厂默认态在我端渲染成一个红色 `role="alert"` 报错**。未知码落到 **四个不同去处，其中两个根本不解析码**，无码出口（`ensureMisoReady`）会把 **内部服务代号原文 `Miso service is not ready (…)` 渲染进 chat bubble**（E-F4/E-F5）。**丙 `code-owner-settings` 的描述 2/3 属实，第三份是错的，而真相更糟** —— `memory_v2_trace_audit.js` 根本 **没有** 读平面的四态实现，它的 `status` 是流式 presenter 的 **另一套词汇** 的直通显示；它不是第四份拷贝，是 **一个缺失的判定 + 同一个展开面板里的第三套 status 词汇**。**我端真正重复的不是四态机（那三者答三个不同问题），是最底下那一层「错误 → 码」的六个站点四种纪律。** 共享模块 **我无条件消费**，但 **只接窄口径**，宽口径我 `OBJECTION`。**Q2 我强制表态：三种主张我端今天一个都没在用**，我跑的是 shared-arteries E-0039 的形状但 **只实现了一半**（要了成败、扔了码）；electron 的 `unchainAPI.getStatus().memoryV2` **从 `src/COMPONENTs/**` 经任何合法路径不可达**（E-F6）
- **依据**: E-0005, E-0003, E-0004, E-0016, E-0018, E-0020, E-0024, E-0026, E-0034, E-0035, E-0037, E-0039, E-0040, E-F1, E-F2, E-F3, E-F4, E-F5, E-F6, E-F7, S-0006, S-0009
- **不确定性**:

  **一 · 我实跑到哪里为止**

  我 **未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求、未在运行中的 app 里打开过任何一个 Memory V2 trace 面板**。我的运行时观察 **只有一项**：`CI=true npx react-scripts test --testPathPattern="chat-bubble/(memory_v2_journal_reload|chat_bubble.memory_v2_mount|trace_chain.memory_v2)"`，4 suite / 23 test 全绿（E-F2）。**而这套测试把 `context_v2_bridge` 整个 mock 掉了**（`trace_chain.memory_v2.test.js:28-44`）—— 它锁住的是「我的组件按什么参数调 bridge」，**不是「bridge 背后真的通」**。凡涉及真实链路行为的一律标推断。

  **二 · 我自己的持久记忆里有一条与本案直接相关、且已被我复核为「仍然成立」的限制，必须前置声明**

  我的记忆 `memory-v2-trace-contract` 载：`trace_chain.memory_v2.test.js` / `memory_v2_journal_reload*.test.js` 的 fixture 全部用 **旧 PuPu fallback store 的嵌套 payload 形状 + 已规范化的 `pupu://` ref 串**，而生产 active 读适配器（`memory_v2_unchain_read_adapter.py:176`）把 payload **摊平**，`event.payload` 恒 `undefined`。**即：journal reload 的 ref 恢复对今天 `npm start` 实际走的那条适配器是死代码，而 21 个测试全绿。** 我在 `b2385d5d` 上复核了本端的两处锚点（`CURATOR_EVENT_TYPES` 在 `:22-30`、`runStatusRank` 在 `:424-432`）**仍然逐字成立**。**本庭与后续角色不得把「chat-bubble 有三个活的 V2 消费者且测试全绿」读作「V2 读平面在生产上工作」。** 这与 S-0009 登记的 `pupu_legacy` 幻影是 **同一类错误的第三次出现**：本庭的 E-0006 锚在不执行的代码上、`code-owner-runtime` 的 Q4 跑在不执行的代码上、**我这三个消费者的测试建在不存在的载荷形状上**。

  **三 · G8 是我 乙 结论的证据地板，且我同样跨不过去**

  我的码处理是否「封闭」，取决于 `store_owner=unchain` 分支实际发出的码长什么样。**S-0009 第五节已登记三人无一能实跑该分支。** 我也不能 —— 我端在 renderer，离得更远。故我关于「码保真到我这里」的全部陈述，**继承 E-0026 / E-0036 的推断地位**，不因我是收端而升级。

  **四 · G2 继承。** 本机 V2 store `entries=0`。我端有明确的封顶常量（见 §四），但 **从未在真实非空载荷上跑过**。凡涉及正常态量级一律推断。

- **请求/下一步**:
  1. **请本庭把「chat-bubble 今天就拿得到 `ownerChatId`」这一条，在 `SUMMARY` 中改写为可判定形式**：*「chat-bubble 在 **活跃会话的消息列表内** 拿得到，因为它挂在覆盖该会话的 provider 里；Inspector 的两个挂载点都不在那个 provider 内。」* 现在这句话在 `FRAMING` 甲 里的措辞，会诱导方案庭审去找一条不存在的复用路径。**这是我作为「那一半实证」被传唤过来最该纠正的一件事。**
  2. **请 `chief-judge` 就共享判定模块的 *口径* 与其落点一并裁**，不要只裁落点。我支持 `code-owner-shared-arteries` 认领（S-0011 Q2），**但落点定了口径没定，对我边界是净损失**：宽口径模块会把我三个面的三套合法词汇压成一套（§三）。口径见我的约束 B2。
  3. **请本庭把 `context_v2_request_failed` 与 `context_v2_journal_unavailable` 记为「renderer 自造码、服务端零出处」**（E-F5），与 `code-owner-shared-arteries` 请求 4 的 `context_v2_unavailable` 碰撞合并为同一条已知缺口。**我另报两条它没查到的**：我端 `journal_reload.js:391` 自造的 `context_v2_invalid_cursor` 与服务端 `memory_v2_store.py:3604` **字面碰撞且条件不同**；`context_v2_unavailable` 在我端还有 **两个** 自造点（`:294` / `:521`），即该字符串全仓 **三个生产者**。
  4. **答复 `code-owner-shared-arteries` 请求 5（E-0040）**：已知情，属实，是我边界内的缺陷，与 §二 表格里那四个「丢码」站点同一类。**本阶段只读，我不修**；请本庭登记为我承认的在册缺陷，方案庭审若触及即由我一并处置。
  5. **不请求** 本案为我做任何事。我边界内 0 处必须改动，我也不认领任何本案新工作 —— 除非 FB5 成立（见 §五）。

- **评估结论**: 逐问见下。

  ---

  ## 一 · 甲 —— `ownerChatId` 在我端从哪来，可不可靠，是不是那个多态值

  ### 1.1 完整链路（E-F1，逐段读过，无一段推断）

  ```
  chat_storage 权威 store 的 activeChatId
    → use_chat_session_state.js:202   const [activeChatId] = useState(initialChat.id)
      :237  activeChatIdRef = useRef(initialChat.id)
      :412  activeChatIdRef.current = nextActiveId        ← 与 store 快照对账
    → chat.js:1130                    <ChatMessages chatId={session.activeChatId} …>
    → chat_messages.js:60             chat_id: chatId
      :73-81                          streamingStoreContextValue = useMemo(() => ({chatId, store, notify…}))
      :212                            <StreamingMessageStoreContext.Provider value={…}>
    → trace_chain.js:647              const { chatId, store } = useStreamingMessageStoreContext()
      :1954 / :1984                   ownerChatId={chatId}
    → memory_v2_trace_audit.js:269 → :353/:355/:358
        ├─ RefList → RefReader:90                    readContent({ownerChatId, …})
        ├─ MemoryV2CanonicalJournalReload:501-549    listEvents({ownerChatId: owner, …})
        └─ MemoryV2PendingReviews:734-782            listCandidates / listCandidateReviews /
                                                     listPromotions / listSpaces({ownerChatId: owner})
  ```

  **谁提供：`code-owner-chat-core`**（`chat.js` · `use_chat_session_state.js` · `chat-messages/**` 全在其边界）。**我端是纯 sink**：不推导、不回退、不接受调用方覆盖 —— `trace_chain.js` 里 `ownerChatId` 的 **唯一** 赋值来源就是 `chatId`，没有第二条 props 通道（E-F1）。

  ### 1.2 可不可靠 —— 可靠，且是 renderer 里可得的最强形式，三条独立理由

  **(a) 它与生产写侧用的是同一个值，是构造上的同一，不是巧合。** `use_chat_stream.js:11874` `const currentChatId = activeChatIdRef.current`，`:11985` `ownerChatId: currentChatId`。我端拿的是 `session.activeChatId`（同一个 hook 的 state），它与 `activeChatIdRef.current` 是同一 store 字段的 state/ref 两副本，由 `use_chat_session_state.js:346-412` 的 `reconcileStoreSnapshot` 统一对账。**`code-owner-settings` 的不确定性 3（`node.chatId` 与 `currentChatId` 是否同一 id 空间）在我这条链上不存在** —— 我根本不经过 `node.chatId`。

  **(b) E-0016 的多态值在我链上结构性不可达（E-F3）。** `buildCharacterMemorySessionId` 在全 `src/` 非测试代码中 **只有一个消费者**：`side_menu_context_menu_items.js:198`。那是 Inspector 的右键入口。character chat 在 chat store 里是一 **种** chat（`characterId` 是 **另一个字段**，`use_chat_session_state.js:228/383/464`），它的 `id` 就是普通 chat id。**所以 `character_foo__dm__main` 这种「语法合法、语义错误」的 owner，我端不可能拿到。** `code-owner-electron` 的丙(3)「main 层没有任何机制能挡住冒充」我完全接受 —— 那道门确实挡不住，**但我这条链不产生需要被挡的东西**。

  **(c) 三条性质全部被测试锁住（E-F2）。** `trace_chain.memory_v2.test.js` **自己搭 `StreamingMessageStoreContext.Provider` 并传 `chatId`**（`:50-71`），然后逐次断言 bridge 收到 `ownerChatId: "owner-chat"`（`:196,:205,:297,:302,:377,:456,:470,:483,:614,:681,:690`）；`:229-240` 断言 `chatId: ""` 时 **五个 bridge 方法一个都不调**、面板不渲染。**我端的 fail-closed 是被断言锁住的，不是约定。**

  ### 1.3 —— 但这条路径 Inspector 复用不了，这是我最该说的一句话

  我端拿得到好值的 **原因**，恰恰是我端的 **限制**：`StreamingMessageStoreContext` 在全 `src/` 只被创建一次（`components/streaming_message_store_context.js:18`）、只被 provide 一次（`chat_messages.js:212`）、其值来自 **当前活跃会话**。我的消费者物理上只能是「屏幕上这个会话」的。

  Inspector 的 side-menu 入口是 **对侧边栏里任意一个（很可能非活跃的）节点右键**。**没有任何 provider 覆盖那个场景，今天没有，也不该为此造一个。** 所以：

  > **「chat-bubble 已经拿得到，Inspector 照做就行」这个推论不成立。** 我端是「这个值在 renderer 里存在且形状正确」的实证；Inspector 需要的是 **挂载点显式传参**，即 `code-owner-settings` 的 N1 与 `0000-0003-2026-0807#S-0024` C4 已经写下的那条。**我的存在支持 N1，不替代 N1。**

  **一条附带的、方案庭审必须知道的差异（E-F7）**：我的三个消费者被 **双重门** 关着 —— `chat_bubble.js:107-108` 要求 `isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)`（即 **必须有一个已完成回合的 bundle 带 memory_v2**），`trace_chain.js:1936` 要求该 audit 存在，`:1950` `unmountDetailsWhenClosed: true` 使子树 **折叠即卸载**。**净效果：V2 关着的时候，我这三个消费者一次也不会挂载。** Inspector 没有这个门 —— 用户随时能点开。**这就是为什么「chat-bubble 今天没炸」不能推出「tree view 也不会炸」：我端从未在未启用态下被打开过。**

  ---

  ## 二 · 乙 —— Q4 的收端半边：我端今天封闭吗

  ### 2.1 直接回答：**不封闭。能不能区分「V2 未启用」与「有 store 但没数据」—— 不能。**

  结构上，`code-owner-shared-arteries` 的 E-0039 形状在我链上 **确实成立**：数据调用 resolve ⟺ 读发生了；reject ⟹ 没发生。我也确实为两者产出不同渲染（空态文案 vs 错误块）。**但「未启用」与「已启用但空」这一刀，我端切不下来**，三条硬事实：

  **(a) `context_v2_store_disabled` 在整个 `src/` 出现 0 次**（E-F4，可复跑）。renderer 里 **没有任何消费者**（我的、chat-core 的、settings 的）分支于它。它到得了我手上（E-0026 的码保真链），**但没有一行代码看它**。

  **(b) 我唯一的启用态门是 `contextV2Bridge.isAvailable()`，它是 preload 存在性探针，不是 store 状态探针。** 四个使用点：`journal_reload.js:516` · `trace_audit.js:79` · `pending_reviews.js:299,736`。**在出厂默认（`store_owner=off`）的 build 里，preload bridge 一样在，`isAvailable()` 返回 `true`。**

  **(c) 净效果：出厂默认态在我端被渲染成「报错」，不是「未启用」。**
  - `pending_reviews.js:1027-1044` —— 红色 `role="alert"` 块，正文是 `<code>{state.error.code}</code> · {message}`
  - `journal_reload.js:272-274, :574-578` —— `status: "Unavailable"`，副行 `journal_reload_failed · context_v2_store_disabled`

  开发者读得出，用户读不出 —— 对用户，它和「后端崩了」完全同形。**这正是 `code-owner-settings` 的 C1 所警告的塌缩，只是从相反方向到达：它警告「失败被归一成空」，我端是「未启用被归一成失败」。两个方向都塌。**

  ### 2.2 未知码落到哪 —— **四个去处，四种纪律，其中两个根本不解析码**（E-F4/E-F5）

  | # | 站点 | 纪律 | 未知码 / 无码错误的归宿 |
  |---|---|---|---|
  | 1 | `journal_reload.js:274` | `parseContextV2ErrorCode(error) \|\| "context_v2_journal_unavailable"` | 一个 **服务端零出处的自造码** |
  | 2 | `journal_reload.js:294` · `:521` | 硬编码 `"context_v2_unavailable"`（bridge 缺席） | 与 sidecar **11 个非测试点** 及 facade `:69-75` **三方碰撞** |
  | 3 | `journal_reload.js:391` | 硬编码 `"context_v2_invalid_cursor"`（**客户端自判**游标停滞） | 与 `memory_v2_store.py:3604` **字面碰撞、条件不同** |
  | 4 | `pending_reviews.js:179-186`（2 个 catch 用） | `code \|\| "context_v2_request_failed"` | 另一个 **服务端零出处的自造码** |
  | 5 | `trace_audit.js:120-129`（`readContent`） | **完全不解析**，`error.message.slice(0,1000)` | **裸线上串直接上屏** |
  | 6 | `pending_reviews.js:397-407`（`readContent`） | **完全不解析**，`boundedText(error?.message,700)` | **裸线上串直接上屏** |

  **对本庭点名的那个无码出口（`ensureMisoReady`，S-0010 戊(4)(a)）的直接回答**：`parseContextV2ErrorCode` 对它返回 `null`（E-0036 已证该正则对无 `[code]` 前缀的串返回 `null`），于是它在我端 **同时** 落成三种东西 —— 站点 1 里变成 `context_v2_journal_unavailable`、站点 4 里变成 `context_v2_request_failed`、**站点 5/6 里以字面英文 `Miso service is not ready (status=…, reason=…)` 渲染进 chat bubble**。

  > **最后一条是一个产品可见缺陷，且是内部服务代号的外泄。** 它在我边界内，我认领它是我的，本阶段只读不修。**并且它恰好发生在冷启动早期** —— `code-owner-electron` 戊(4)(a) 已指出这正是 Inspector 最可能撞上的那一态。

  ### 2.3 我因此完全支持 `code-owner-shared-arteries` 的 A4，并报告它低估了我端

  A4 说的失效模式是「`null` 被静默替换成一个看起来合理的默认码」。**我端六个站点里有两个连 A4 的失效模式都到不了 —— 它们从不调用解析器。** A4 应当写成：*未知码必须落第三态；**且每一个 `contextV2Bridge` 的 catch 都必须先过解析器**，不得直接消费 `error.message`。*

  ---

  ## 三 · 丙 —— `code-owner-settings` 说我端是四份里的两份，属实吗

  ### 3.1 逐条核对：2/3 属实，第三条是错的，而真相更糟

  | 其列举 | 判定 | 实情 |
  |---|---|---|
  | `journal_reload.js:513-521` 自造 `status:"Unavailable"` + `reason` + `errorCode` | **属实** | 且不止这一处：该词汇（`Loading`/`Complete`/`Partial`/`Unavailable`）在 `:272,:294,:309,:365,:377,:389,:403,:506,:519` 共 **9 个铸造点** |
  | `pending_reviews.js:181-187` `errorPresentation()` | **属实** | 且它其实是 **5 支渲染机**：`!available` / `loading&&!loaded` / `error` / `isEmpty` / 列表（`:1015-1050`） |
  | `memory_v2_trace_audit.js` | **不属实** | 它 **没有** 读平面的四态实现 |

  **第三条的真相**：`trace_audit.js:317` 的 `audit.status` 与 `:349` 的 `audit.errorCode` 是 **流式 trace bundle 的直通显示**，产自 `SERVICEs/runtime_events/memory_v2_trace_presenter.js:350`（`code-owner-shared-arteries` 边界），词汇是 `Complete/Partial/Legacy/Unavailable`，**回答的是「这一回合的 trace bundle 完不完整」，与 store 通不通毫无关系**。该文件唯一真正的 bridge 调用是 `:89` 的 `readContent`，而它的错误处理 **一个码都不解析**（§二站点 5）。

  > **所以它不是「第四份同样的东西」，它是「一个缺失的判定」+「同一个展开面板里的第三套 status 词汇」。** 这比多一份拷贝更难修，因为它长得像已经有答案了。

  ### 3.2 我端那几份是不是同一件事的重复实现 —— **不是。真正重复的在底下一层**

  三者答 **三个不同的问题**，各自的词汇都是合法的：

  | 面 | 问题 | 词汇 |
  |---|---|---|
  | `journal_reload` | 「**我这次** canonical journal 重读跑完了吗」（每次挂载一个 job） | Loading/Complete/Partial/Unavailable |
  | `pending_reviews` | 「有没有等你拍板的条目；取它的那次请求失败了吗」 | 5 支渲染机 |
  | `trace_audit`（presenter 轴） | 「这一回合产的 trace bundle 完不完整」 | Complete/Partial/Legacy/Unavailable |

  **它们重复的，是最底下那一层且只有那一层**：*「`contextV2Bridge` 抛了一个错 —— 它的码是什么，没有码意味着什么」*。**这一层在我端重复了六次、四种纪律**（§二表）。**这才是 D7 那个无主构件在我边界里的确切形状，而它比 `code-owner-settings` 描述的「四态机拷贝」窄得多、也具体得多。**

  ### 3.3 若落一个共享判定模块，我消费吗，代价多大

  **消费，无条件，代价小 —— 但只接窄口径。**

  **我接的口径**（= 我的约束 B2）：
  ```
  (error) → { code: string, kind: <闭集> , parsed: boolean }
  ```
  `kind` 只覆盖 **传输/启用** 这一维（bridge 缺席 / sidecar 未就绪 / 未启用 / 降级 / 未找到 / 参数非法 / **未知**），并对无码出口给出 **显式非 null 契约**。
  - **代价**：**六个调用站点，全在三个文件里，每处 ≤5 行**；顺带 **删掉两个自造码**（`context_v2_request_failed` · `context_v2_journal_unavailable`），并给站点 5/6 补上解析器。这是我愿意主动认领的量级。

  **我不接、且会以 `OBJECTION` 反对的口径**：任何 **同时** 决定 **用户可见状态词** 的模块。§3.2 的三个面有三套合法词汇；强行统一会把 journal-reload 轴压进 presenter 轴 —— **那正是我已在册的碰撞（三条轴共用 `Complete/Partial/Unavailable` 三个词指三件事），把它从缺陷变成强制。**

  **我不同意 `code-owner-settings` 归因的一处**：它主张「在 modal 里加 tree view 就是造第 5 份」，据此把它当作反对/前置的杠杆。**我端的证据指向相反的处方** —— 第 5 份之所以会长出来，不是因为 tree view，是因为 **底层那一件事从来没有 owner**；我这里在没有 tree view 的情况下已经独立长出了 **六份**。**所以它是「先建底层」的理由，不是「暂缓 tree view」的理由。** 我支持其建议 3 的顺序（(b) 先于 (c)），反对把它读成阻塞。

  ---

  ## 四 · Q2（G1）· 强制表态 —— 三种主张，我端今天一个都没在用

  **不接受「与我无关」，我不说这句话。**

  ### 4.1 我端今天实际在用的是什么（这是本节唯一的观察，其余都是判断）

  | 信号 | 我用不用 | 出处 |
  |---|---|---|
  | `contextV2Bridge.isAvailable()`（preload 存在性） | **用，4 处** | E-F4 |
  | 每次调用的 **resolve / reject**（= E-0039 的形状） | **用** | §2.1 |
  | 该 reject 的 **码** | **6 个站点里 4 个丢掉、2 个换成自造码** | §2.2 |
  | `contextV2Bridge.getStatus()` | **从未调用** | E-0035（其结论），E-F4（我独立复核） |
  | `unchainAPI.getStatus().memoryV2` | **不可达** | E-F6 |

  ### 4.2 对三种主张逐条技术表态

  **(1) `code-owner-shared-arteries`（`getTree` 单独一次调用就够）—— 就我端而言它是对的，但它描述的是「可得的信号」，不是「今天有人在用的信号」。**
  我跑的正是它那个形状（成败可分），**而缺的恰是它论证里最关键的第二半 —— 拒绝码**。E-0039 说「reject ⟹ 读没发生，且拒绝码说明原因」：前半在我端成立，**后半在我端 6 个站点里 0 个实现**。**我从消费端确认 E-0039 的结构，同时报告：今天没有一个消费者兑现它。** 这对本庭的意义是：把 A3/E-0039 写进裁定文本 **是必要的但不充分的** —— 它描述的是一条今天全渲染层都没走的路，落地要改的是消费者，不是 facade。

  **(2) `code-owner-electron`（`memoryV2` 已过 IPC 线）—— 构件存在我确认，但从 `src/COMPONENTs/**` 经任何合法路径不可达（E-F6）。**
  两道锁，缺一都到不了我手上：
  - `src/SERVICEs/api.shared.js:330-343` 的 `normalizeUnchainStatus` 重建 6 字段 `{status, ready, url, reason, pid, port}`，**`memoryV2` 被丢弃**（我实读，与 S-0010 乙(1) 逐字一致）
  - **`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` 的 import 数为 0**（E-F6）。要绕过 facade 就得在组件里直接摸 `window.unchainAPI` —— **本仓工程铁律禁止渲染进程组件直连 bridge 面之外的东西，我不做。**

  所以 `code-owner-electron` 的「暴露代价在我边界内等于零」对 **它的** 边界成立；**残余代价是 `code-owner-shared-arteries` 那约 6 行 + 一个 facade 方法**。我会消费它，**但只作为次要轴**：`memoryV2` 是 **进程全局** 的，我的三个消费者是 **per-`ownerChatId`** 的，它答不了「这个会话有没有数据」。**主判据仍必须是数据调用自身（(1)）。**

  **(3) `code-owner-settings`（无人拥有）—— 就「定义权」而言它是对的，我端六个站点就是证据。**
  三个文件、同一作者、四种纪律、两个自造码。**有 owner 的东西不会长成这样。**

  ### 4.3 本案若推进，是否会要求我的边界承担一个今天不属于我的判定职责

  **会 —— 而我的答案不是「别推给我」，是「它早就被默认推给我了，而且我做砸了，请拿回去」。**

  | 职责 | 今天在哪 | 本案推不推 | 我的立场 |
  |---|---|---|---|
  | 把 bridge 错误映射成码/类别 | **已经在我这里了，六份，无人授权** | 会强化 | **交出去。** 我消费共享模块，**不再自造码** |
  | 决定我三个面各自的用户可见状态词 | 我 | 不该推走 | **保留。** 三个面答三个问题，词不该统一（B2） |
  | 定义四态判据本身 | 无人 | 会试图推 | **不承接。** 归 `code-owner-shared-arteries`（其已认领）+ CEO 指派 |
  | 决定 tree view 长什么样 / 挂哪 | `code-owner-settings` | 不落我 | **不落在本边界**，指名 `code-owner-settings` 与 `expert-architecture` |
  | 为 tree view 提供数据路径 | —— | **可能会试图推给我**（因为「chat-bubble 已经在读 V2」） | **拒绝。** 见 §1.3 与 FB1：我的文件被 bundle 门 + 折叠卸载锁死，不能当通用 V2 浏览器 |

  ### 4.4 G1（前案裁定未到达）是否构成前置阻塞 —— **对可行性不阻塞；对我的实施承接阻塞一件事**

  §一~§三的每一条都是当前 revision 的代码事实，**不依赖前案任何裁定**。故本案可在 `0000-0003-2026-0807` 裁定前完成议案庭审。
  **唯一的届时阻塞**：若共享模块最终以宽口径（含用户可见状态词）落地，我按 B2 反对并拒绝在我边界内消费。**这不是现在的阻塞，是届时的；现在写下来是为了它届时不算意外**（与 `code-owner-settings` §3.3 同构，但我反对的对象相反 —— 它怕没有模块，我怕模块太宽）。

  ---

  ## 五 · 丙（框定第三条）· 可证伪形式 —— 我的「可行 + 0 改动」在什么条件下翻转

  **任一条成立即翻：**

  **FB1 · 若方案把 tree view 的数据路径、渲染或状态放进 `src/COMPONENTs/chat-bubble/**` 任何文件（含 `trace_chain.js`）。→ 不可行（就该切法）。**
  推翻依据：E-F7 —— 我的三个 V2 消费者被 `chat_bubble.js:107-108` 的 `bundle.memory_v2` 门 + `trace_chain.js:1936` + `:1950 unmountDetailsWhenClosed` 三重锁在「**一个已完成回合的审计块，展开才活，折叠即卸载**」这个语义里。把一个用户随时可开、与回合无关的浏览器塞进来，**会同时破坏流式渲染契约与 issue #168 的折叠卸载**。**谁能证伪**：方案庭审的实施切分文本。

  **FB2 · 若共享判定模块的口径包含用户可见状态词。→ 我 `OBJECTION` 并拒绝消费**（我三个面保留各自词汇）。**谁能证伪**：模块 API 面 —— 若其对外只暴露 `{code, kind, parsed}` 而不暴露供渲染的 `status` 串，本条不触发。

  **FB3 · 若有人主张「Inspector 照 chat-bubble 的做法拿 `ownerChatId`」。→ 不可行。**
  推翻依据：E-F1 —— `StreamingMessageStoreContext` 全仓 **一处创建、一处 provide**，其值恒为 **活跃会话**。**谁能证伪**：`code-owner-chat-core` 造出一个能携带非活跃 chat id 的 provider —— **今天不存在，且我不建议为此造。**

  **FB4 · 若我端的 prop 契约被改成接受调用方指定的 `ownerChatId`（而非恒等于 `chatId`）。→ 我立刻继承 `code-owner-settings` 的 F3 全部风险**（E-0016 的语法合法/语义错误 id 能穿过 main，`code-owner-electron` 丙(3) 已答「main 层挡不住」，G10 未核实）。**今天我对 F3 免疫，免疫的唯一来源就是这条 prop 契约。** **谁能证伪**：方案文本是否引入 owner 覆盖参数。**请本庭把这条记为我端唯一的、且可由一行代码引入的回归面。**

  **FB5 · 若本庭裁定两个自造码（`context_v2_request_failed` / `context_v2_journal_unavailable`）与两处码碰撞必须在本案推进前清除。→ 我的「0 改动」变成 6 个站点的改动。**
  我 **接受** 这个裁定（那是我的缺陷），但本庭须知道它把我从「无前置」变成「有前置」。**谁能证伪**：本庭对 E-F5 的处置。

  **FB6 · 若 G8 被关闭，且 `store_owner=unchain` 分支发出的错误 *不带* `[code] ` 前缀、或其码不符 `[a-z0-9_]+`。→ 我 §二 的全部结论塌成一句「所有错误都是 `context_v2_request_failed`」**，A4 的失效模式从「边缘」变成「全域」。**这是我这份评估里价值最高的开放项，而它整段不在我边界内** —— 归 `code-owner-runtime`（产端字符集，其请求 3 已在问）与 `code-owner-unchain`（`store_owner=unchain` 分支）。**谁能证伪**：任何人在 `unchain` 可导入的环境里跑一次真实 `getTree` 并记录 renderer 侧收到的 `error.message` 原文。

  **不会被推翻的（可作方案庭审地基）**：`ownerChatId` 在我链上单一来源、与生产写侧同一值、多态值不可达、空值 fail-closed —— 四条均被 `trace_chain.memory_v2.test.js` 锁住（E-F2）；`context_v2_store_disabled` 在 `src/` 零消费者（E-F4）；`memoryV2` 经 `normalizeUnchainStatus` 被丢弃（E-F6）。

  ---

  ## 六 · 留待方案庭审（自行标注，本阶段不作为结论）

  按 S-0001 范围纪律，下列属设计取舍，登记不主张：

  - **同一个展开面板里已有三套共用 `Complete/Partial/Unavailable` 的 status 词汇**（presenter 轴 `trace_chain.js:1941`/`trace_audit.js:317` · journal-reload 轴 `journal_reload.js:568-572` · curator 轴 `trace_chain.js:1969` 的 `Completed/Failed/Isolated/NoOp/Running/Pending`）。**再引入一个说「Unavailable」的面，会让这个面板更难读，不是更好读。** 技术事实在此登记；怎么消歧是设计。
  - **`getTree` 是十八个读方法里唯一无上界的一个**（`code-owner-electron` E-0032）。**我边界内有本仓唯一的 V2 读封顶先例**：`JOURNAL_RELOAD_PAGE_SIZE=500` / `JOURNAL_RELOAD_MAX_PAGES=20` / `JOURNAL_RELOAD_MAX_EVENTS=10000` / `mergeRefs .slice(0,512)` / `agentRuns .slice(-128)`（`memory_v2_journal_reload.js:6-8,353-372,480,257`），这是 issue #168 A 阶段的产物。**这段封顶逻辑可复用为 tree view 的参考，但那是设计选择。**
  - **V2 读平面今天零轮询**（`code-owner-shared-arteries` E-0040 已证，我确认）。我端不轮询的原因是折叠即卸载（E-F7）。tree view 若引入轮询会是第一个 —— A5 的限流纪律届时全在调用方。

- **边界命中依据**: `pupu:src/COMPONENTs/chat-bubble/**` —— **第三层提前执行**（S-0003 #7 / S-0006 六节）。本次作业实际触及本边界内 8 个文件：`memory_v2_journal_reload.js` · `memory_v2_pending_reviews.js` · `memory_v2_trace_audit.js` · `trace_chain.js` · `chat_bubble.js` · `components/streaming_message_store_context.js` · `trace_chain.memory_v2.test.js` · `chat_bubble.memory_v2_mount.test.js`。**跨界只读引用（不构成本边界主张）**：`pupu:src/PAGEs/chat/chat.js`、`hooks/use_chat_session_state.js`、`hooks/use_chat_stream.js`、`src/COMPONENTs/chat-messages/chat_messages.js`、`src/COMPONENTs/side-menu/side_menu_context_menu_items.js`（**全归 `code-owner-chat-core`**）· `src/SERVICEs/bridges/context_v2_bridge.js`、`src/SERVICEs/api.shared.js`、`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`、`src/SERVICEs/chat_storage/chat_storage_sanitize.js`（**归 `code-owner-shared-arteries`**）· `unchain_runtime/server/memory_v2_store.py`（**归 `code-owner-runtime`**）· `src/COMPONENTs/ui-testing/runners/*`（**归 `code-owner-devtools`**）—— 均只用于确定「到达我组件的值是什么、我发出去的值到哪」，结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案按 `code-owner-settings` 的切法（tree view 落 `memory-inspect/` 下新组件）推进，我边界内 0 处必须改动。** 这是我这一半的主要结论。
  - **条件性影响 1（仅当 FB5 成立 / 或共享模块落地）**：六个错误处理站点须改 —— `memory_v2_journal_reload.js:274, :294, :391, :521` · `memory_v2_pending_reviews.js:179-186, :397-407` · `memory_v2_trace_audit.js:120-129`。同时删除两个自造码。**每处 ≤5 行，我主动认领。**
  - **条件性影响 2（仅当 FB4 成立）**：`trace_chain.js:1954, :1984` 的 `ownerChatId={chatId}` 与三个文件的入参契约须重审，且需新增测试锁住 owner 覆盖路径。**我预先反对引入该参数。**
  - **测试面**：`trace_chain.memory_v2.test.js`（34220 字节，锁住 `chatId → ownerChatId` 全链与 fail-closed）· `memory_v2_journal_reload.test.js` · `memory_v2_journal_reload.performance.test.js` · `chat_bubble.memory_v2_mount.test.js` —— **任何改动这四份都要一起动**，且注意其 fixture 建在 **旧 store 的嵌套 payload 形状** 上（不确定性二）。
  - **无影响**：`trace_chain.js` 的工具帧/流式 markdown/`interact`/`artifact-summary` 全部路径。本案不触及。

- **约束**:
  1. **B1 · tree view 不得落在 `src/COMPONENTs/chat-bubble/**`。** 我的文件被 `bundle.memory_v2` 门与折叠卸载锁在「回合审计块」语义里（E-F7）。**有人要求把它放进来，我以 `OBJECTION` 反对**（FB1）。
  2. **B2 · 共享判定模块的口径必须止于 `(error) → {code, kind, parsed}`。** 不得包含用户可见状态词。理由：我三个面答三个不同问题，各自词汇合法；统一词汇会把我已在册的三轴碰撞从缺陷变成强制（FB2、§六第一条）。
  3. **B3 · 不得在我端引入调用方可覆盖的 `ownerChatId` 参数。** 我今天对 `code-owner-settings` F3（静默错主）免疫，**免疫的唯一来源就是「`ownerChatId` 恒等于 provider 的 `chatId`」这条 prop 契约**（E-F1/E-F3）。破坏它等于把一个 main 层已确认挡不住的风险（E-0024 丙(3)）引进 chat-bubble（FB4）。
  4. **B4 · 每一个 `contextV2Bridge` 的 `catch` 都必须先过 `parseContextV2ErrorCode`，不得直接消费 `error.message`。** 这是我对 `code-owner-shared-arteries` A4 的加强 —— 我端两个站点连 A4 的失效模式都到不了，它们从不调用解析器，直接把线上串上屏（§2.2 站点 5/6）。
  5. **B5 · 渲染层不得再自造服务端不存在的错误码。** 我端已有两个（`context_v2_request_failed` · `context_v2_journal_unavailable`），另有两处与服务端字面碰撞（`context_v2_unavailable` · `context_v2_invalid_cursor`）。**新增消费者一个都不许再造。** 需要新码时按单向契约向产帧端提议 —— 那是跨面契约变更。
  6. **B6 · 任何以「chat-bubble 三个 V2 消费者测试全绿」为据的可行性论证一律无效。** 该测试套把 `context_v2_bridge` 整个 mock（`trace_chain.memory_v2.test.js:28-44`），且 fixture 建在生产适配器不产出的载荷形状上（不确定性二）。**绿测试在这个面上不是可用性证据。**

- **建议处置**: **判为「可行」并进入方案庭审。我这一侧不设前置阻塞，也不认领本案任何新工作。** 四条建议，按重要性排序：
  1. **改写「零消费者」更正的措辞**（请求 1）。`FRAMING` 甲 现在的写法会诱导方案庭审去复用一条不存在的路径。正确的可判定形式是：*chat-bubble 在活跃会话的消息列表内拿得到；Inspector 的两个挂载点都不在那个 provider 内；因此 N1（挂载点显式传参）仍是唯一处方。* **这是我作为「实证的那一半」被传唤过来最该纠正的一件事。**
  2. **把共享判定模块的 *口径* 与 *落点* 一起裁**（请求 2）。`code-owner-shared-arteries` 已认领落点（S-0011 Q2 的 P1/P2/P3），我支持；**但口径不定，对我边界是净损失**。裁定文本请含 B2。
  3. **把 A3/E-0039 写进裁定文本时加一句「今天没有消费者兑现它」。** E-0039 描述的是可得信号，**我从消费端确认结构成立、同时报告 6/6 站点未实现**。只写 A3 不写这句，方案会以为「照现状做就行」。
  4. **把 G8 升级为对本案 Q4 的 *共同* 阻塞项，而不只是 runtime/unchain 的缺口**（FB6）。S-0009 已把它记为 Q1/Q4 的证据地板；我从收端补一句：**我的码处理是否封闭，完全取决于那条从未被观察过的分支发出什么。** 三人跑不了，那就需要一次真机取证 —— 这是本案剩下的、最便宜也最决定性的一次实验。

---

### E-F1 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/components/streaming_message_store_context.js:18-25`（`createContext({chatId:"", store:null, …})` + `useStreamingMessageStoreContext`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-messages/chat_messages.js:60`（`chat_id: chatId`）· `:73-81`（`streamingStoreContextValue = useMemo(() => ({chatId, store, notifyStreamingContentCommitted}), […])`）· `:212`（唯一 `Provider`）· `:243, :275`（`CharacterChatBubble` / `ChatBubble` 均在 Provider 内）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:1129-1130`（`<ChatMessages chatId={session.activeChatId}`，全仓唯一挂载点）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_session_state.js:202`（`useState(initialChat.id)`）· `:237`（`activeChatIdRef = useRef(initialChat.id)`）· `:346-412`（`reconcileStoreSnapshot` → `:412 activeChatIdRef.current = nextActiveId`）· `:228, :383-384, :464-465`（`characterId` 为 **另一个字段**）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js:647`（`const { chatId, store } = useStreamingMessageStoreContext()`）· `:1932, :1954, :1984`（`ownerChatId={chatId}`，全文件仅此三处出现 `ownerChatId`）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11874`（`const currentChatId = activeChatIdRef.current`）· `:11985`（`ownerChatId: currentChatId`）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "useStreamingMessageStoreContext\|StreamingMessageStoreContext" src --include="*.js" | grep -v "\.test\.js"
  grep -rn "ChatMessages" src --include="*.js" | grep -v "\.test\.js" | grep -v "src/COMPONENTs/chat-messages"
  grep -n "chatId" src/COMPONENTs/chat-bubble/trace_chain.js
  grep -n "activeChatId" src/PAGEs/chat/hooks/use_chat_session_state.js
  ```
  逐段定点读取上列行号。
- **提交发言**: 本 ASSESSMENT（甲 §1.1/§1.2(a)、§1.3、Q2 §4.3、FB3/FB4、B3）
- **支持/反驳**: **支持** 本庭 `FRAMING` 甲「chat-bubble 今天就拿得到 `ownerChatId`」的 **事实部分**；**收窄其推论部分** —— 该值只在覆盖 **活跃会话** 的单一 provider 内可得，Inspector 的两个挂载点（E-0003）都不在其内，故 **不构成 Inspector 可复用的路径**。**支持** `code-owner-settings` N1 与 `0000-0003-2026-0807#S-0024` C4。**关闭** `code-owner-settings` 不确定性 3 **就我端而言的那一半**（我不经过 `node.chatId`；其 side-menu 半边仍归 `code-owner-chat-core`）
- **完整性限制**: **(1)** 静态阅读，**未运行应用**，未观察真实挂载时 provider 的实际取值。**(2)** `grep` 只覆盖字面标识符；未追经变量/动态 import 的第三处 provider（与 E-0003 同类限制）。**(3)** `activeChatId`（state）与 `activeChatIdRef.current`（ref）在同一 tick 内可能短暂不同步 —— 我读了对账逻辑（`:346-412`）**但未构造并发场景验证**；该确认归 `code-owner-chat-core`。**(4)** `src/COMPONENTs/ui-testing/runners/{trace_chain_runner,interject_runner}.js` 挂载真实 `TraceChain` 且 **不包 Provider**，故那里 `chatId` 取 context 默认值 `""` → 我的 V2 消费者 fail-closed；我 **未运行** 该测试台确认
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑 grep，任何人可在同一 revision 直接复核 → **自证类**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核

### E-F2 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`（`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`），工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08
- **取得方式**（**完整可复跑命令**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && CI=true npx react-scripts test --watchAll=false \
    --testPathPattern="chat-bubble/(memory_v2_journal_reload|chat_bubble.memory_v2_mount|trace_chain.memory_v2)"
  ```
  **实际输出（尾部逐字）**:
  ```
  PASS src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js
  PASS src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.performance.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.test.js

  Test Suites: 4 passed, 4 total
  Tests:       23 passed, 23 total
  Snapshots:   0 total
  Time:        2.221 s
  ```
  被锁住的具体断言（定点读取 `trace_chain.memory_v2.test.js`）：`:28-44` 整个 `context_v2_bridge` 被 `jest.mock` 替换为 11 个 mock 方法 · `:50-71` 测试自搭 `StreamingMessageStoreContext.Provider value={{chatId, …}}` · `:196,:205` `mockReadContent` 收到 `ownerChatId: "owner-chat"` · `:297,:302,:377,:456,:470,:483,:614,:681,:690` 其余 bridge 方法同 · **`:229-240` `chatId: ""` 时 `mockListCandidates` / `mockListCandidateReviews` / `mockListPromotions` / `mockListSpaces` / `mockListEvents` 五者 `not.toHaveBeenCalled()` 且面板不渲染**
- **提交发言**: 本 ASSESSMENT（甲 §1.2(c)、不确定性一/二、B6）
- **支持/反驳**: **支持** 甲 §1.2(c)（`chatId → ownerChatId` 全链与 fail-closed 被测试锁住）；**同时反驳** 任何以「chat-bubble 的 V2 测试全绿」论证 V2 读平面可用的说法（B6）—— **bridge 被整体 mock，该套测试对真实链路不作任何主张**
- **完整性限制**: **(1)** jest + jsdom，**未起 Electron、未起 sidecar、未经 IPC、未发过任何真实请求**。**(2)** `context_v2_bridge` 被整体替身，**故本条对「bridge 背后通不通」零证明力**。**(3)** 其 fixture 使用 **旧 PuPu fallback store 的嵌套 `event.payload` 形状** 与已规范化的 `pupu://` ref 串；生产 active 适配器（`memory_v2_unchain_read_adapter.py:176`）把 payload 摊平 —— **故 journal ref 恢复的绿测试不证明生产路径工作**（本条限制引自我的持久记忆 `memory-v2-trace-contract`，其自身为 **传闻类**，此处 **不用于证明该失配为真**，只用于声明本证据的作用域边界；该失配的权威确认归 `code-owner-runtime` / `code-owner-unchain`）。**(4)** 单次运行，未重复三轮
- **证据类型判据**: 由我发起的一次性测试运行产出的运行时观察，依赖本机 node/jest 环境 → **须查类**（依证据规则第三节，无需质疑即强制审查）
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| **须查类，请本庭路由 `evidence-examiner`**

### E-F3 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:301-302`（`buildCharacterMemorySessionId` 定义）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage.js:38`（再导出）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:2, 198`（**全 `src/` 唯一消费者**）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "buildCharacterMemorySessionId" src --include="*.js" | grep -v "\.test\.js"
  grep -rn "character_\${\|__dm__" src --include="*.js" | grep -v "\.test\.js"
  ```
  **实际结果**：四条命中 —— 定义 1 · 再导出 1 · `side_menu_context_menu_items.js` 2（import + 调用）。**`src/COMPONENTs/chat-bubble/**` 与 `src/COMPONENTs/chat-messages/**` 零命中。**
- **提交发言**: 本 ASSESSMENT（甲 §1.2(b)、B3、FB4）
- **支持/反驳**: **支持** 甲 §1.2(b)（E-0016 的多态值在我链上结构性不可达）；**收窄 E-0016 的作用域** —— 其所述「静默错主」风险 **只存在于 side-menu → Inspector 那一条路径**，不存在于 chat-bubble 的三个既有消费者上；**不反驳 E-0016 本身**（该 id 确能穿过 main 校验，`code-owner-electron` E-0024 已复跑确认）
- **完整性限制**: **(1)** 只覆盖字面标识符 `buildCharacterMemorySessionId` 与两个字面片段；未覆盖以其它方式拼出同形字符串的可能。**(2)** 未证明 chat store 里 character chat 的 `id` **一定** 是 `chat-…` 形态 —— 我读到的是「`characterId` 是 chat 记录上的独立字段」（E-F1 所列 `use_chat_session_state.js:228,383,464`），**这是强旁证不是证明**；chat id 的铸造归 `code-owner-shared-arteries`（`chat_storage`），该确认归其与 `code-owner-chat-core`
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容与行号 → **自证类**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核

### E-F4 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · 六个错误决策站点：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:261-279`（`failedProjection`，`:274` 兜底自造码）· `:289-300`（bridge 缺席，`:294` 硬编码码）· `:386-397`（游标停滞，`:391` 硬编码码）· `:513-530`（组件级 bridge 缺席，`:521` 硬编码码）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:179-186`（`errorPresentation`，`:183` 兜底自造码；被 `:805-811` 与 `:844-859` 两个 catch 使用）· `:397-407`（`ReviewContentReader` 的 catch，**无码解析**）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:120-129`（`RefReader` 的 catch，**无码解析**）；四个 `isAvailable()` 使用点：`memory_v2_journal_reload.js:516` · `memory_v2_trace_audit.js:79` · `memory_v2_pending_reviews.js:299, :736`；渲染出口：`memory_v2_pending_reviews.js:1015-1050`（五支）· `memory_v2_journal_reload.js:574-578`
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "context_v2_store_disabled\|context_v2_unchain_read_unavailable\|context_v2_store_owner_invalid\|context_v2_readiness_failed\|context_v2_unreachable" src --include="*.js"
  # → 全 src/（含测试）零命中
  grep -rn "getStatus\|unchainAPI\|isAvailable" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 仅 4 行 isAvailable，零 getStatus，零 unchainAPI
  grep -c "catch (error)" src/COMPONENTs/chat-bubble/memory_v2_{journal_reload,pending_reviews,trace_audit}.js
  grep -n "contextV2Bridge\." src/COMPONENTs/chat-bubble/*.js | grep -v "\.test\.js" | grep -v isAvailable
  ```
- **提交发言**: 本 ASSESSMENT（乙 §2.1/§2.2、丙 §3.2/§3.3、Q2 §4.1、B4）
- **支持/反驳**: **回答 Q4 收端半边** —— 我端 **不能** 区分「V2 未启用」与「有 store 但没数据」；**支持** `code-owner-shared-arteries` A4 并加强之（两个站点连解析器都不调）；**独立复核并确认** E-0035 第 3 点（`contextV2Bridge.getStatus()` 在 renderer 零消费者）就我端的那一半；**支持** `code-owner-settings` C1 的关切但指出其方向在我端是相反的（未启用被归一成失败，而非失败被归一成空）
- **完整性限制**: **(1)** 只覆盖字面标识符；未追经变量间接引用（如 `bridge[name]()`）。**(2)** **静态阅读，未运行组件，未观察任何真实错误到达时的实际渲染**；「出厂默认态在我端渲染成红色报错块」是 **推断**，其成立依赖 `code-owner-runtime` E-0010(b) 与 `code-owner-electron` E-0026 的码保真链 —— **前者为须查类且 S-0009 已登记其臂落在产品不选用的分支上**，故本推断继承其全部收窄。**(3)** 未穷举 `src/` 其它区域是否有以别的写法消费该码的地方 —— 但 grep 覆盖全 `src/`（含测试）且为零，该风险极低
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容与行号 → **自证类**。**但其中标注为「推断」的渲染结论不具此地位，不得作为事实引用**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核

### E-F5 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · 渲染层自造点：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:274`（`context_v2_journal_unavailable`）· `:294, :521`（`context_v2_unavailable`）· `:391`（`context_v2_invalid_cursor`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:183`（`context_v2_request_failed`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:69-75`（facade 自造 `context_v2_unavailable`，`code-owner-shared-arteries` 边界，只读引用）‖ 服务端同名点：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:3604`（`context_v2_invalid_cursor`）· `context_v2_unavailable` 于 `unchain_runtime/server` 下 **11 个非测试点**（`code-owner-runtime` 边界，只读引用；其 E-0037 记为 9 个，我的计数为 11，**差异未追**，见完整性限制）
- **取得方式**（**完整可复跑命令**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  for c in context_v2_request_failed context_v2_journal_unavailable context_v2_invalid_cursor context_v2_store_disabled; do
    printf "%-36s server:%s  renderer:%s\n" "$c" \
      "$(grep -rl "\"$c\"" unchain_runtime/server --include='*.py' 2>/dev/null | grep -v tests | grep -v __pycache__ | wc -l | tr -d ' ')" \
      "$(grep -rl "$c" src --include='*.js' 2>/dev/null | grep -v '\.test\.js' | wc -l | tr -d ' ')"
  done
  cd unchain_runtime/server && grep -rn "context_v2_invalid_cursor" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  grep -rn "context_v2_unavailable" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/" | wc -l
  ```
  **实际输出**:
  ```
  context_v2_request_failed            server:0  renderer:1
  context_v2_journal_unavailable       server:0  renderer:1
  context_v2_invalid_cursor            server:1  renderer:1
  context_v2_store_disabled            server:2  renderer:0
  memory_v2_store.py:3604:                "context_v2_invalid_cursor",
  11
  ```
- **提交发言**: 本 ASSESSMENT（乙 §2.2、请求 3、B5、FB5）
- **支持/反驳**: **支持** `code-owner-shared-arteries` 请求 4 与 E-0037（`context_v2_unavailable` 码碰撞），**并新增两条其未查到的**：(i) 我端 **两个** 服务端零出处的自造码；(ii) `context_v2_invalid_cursor` 是 **第二处** 渲染层/服务端字面碰撞且条件不同。**支持** B5、请求 3
- **完整性限制**: **(1)** `grep -rl` 统计的是 **文件数** 不是出现次数；`context_v2_store_disabled` 的 `server:2` 指两个文件。**(2)** `context_v2_unavailable` 我计得 11 个非测试点，`code-owner-shared-arteries` E-0037 记 9 个 —— **差异我未追**（可能是搜索文件集不同：其只搜四个指定文件，我搜全目录）。**以其为该边界的权威计数**，我这条只主张「≥9，且含读路径上的那一个」。**(3)** `unchain_runtime/server/**` 落 `code-owner-runtime` 边界，我 **只读引用**，**服务端该码在什么条件下发出、字符集是否为有意约定，权威解释归其**（其请求 3 正在问）。**(4)** 未核实这些自造码是否曾被写进任何契约文档
- **证据类型判据**: 可复跑命令 + 两仓内文件字面内容与行号 → **自证类**。**但其跨入 `code-owner-runtime` 边界的部分只作为「请其确认」的锚点，不作为本边界的终局主张**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核

### E-F6 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`，重建 `{status, ready, url, reason, pid, port}` 六字段）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/**`（对 `SERVICEs/api.*` 的 import **零命中**）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '330,343p' src/SERVICEs/api.shared.js
  grep -rn "from \"../../SERVICEs/api" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 零输出
  grep -rn "unchainAPI" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 零输出
  ```
- **提交发言**: 本 ASSESSMENT（Q2 §4.1/§4.2(2)）
- **支持/反驳**: **独立复核并确认** `code-owner-electron` S-0010 乙(1)（`normalizeUnchainStatus` 丢弃 `memoryV2`）；**同时对其「暴露代价在我边界内等于零」补一条其未覆盖的事实** —— 从 `src/COMPONENTs/**` 看，该构件 **经任何合法路径不可达**：facade 丢弃它，而组件不许直连 `window.unchainAPI`（本仓工程铁律）。**不反驳** 其构件存在与形状的主张（我未复核 `service.js:1645-1663` 的 15 字段，归其）
- **完整性限制**: **(1)** 只覆盖字面 import 路径 `"../../SERVICEs/api`；未覆盖经其它相对深度或经中间模块的传递 import。**(2)** `electron/**` 与 `service.js` 落 `code-owner-electron` 边界，我 **未读**，`memoryV2` 的 15 字段与四态闭集我 **完全依赖其 S-0010 乙 的陈述**，本条 **不为该部分承重**。**(3)** 未运行应用观察 `api.unchain.getStatus()` 的实际返回
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑 grep → **自证类**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核

### E-F7 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/chat_bubble.js:107-110`（`hasMemoryV2Audit = isAssistant && isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)`；`shouldRenderTraceChain` 三选一）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js:1928-1936`（`mergeMemoryV2AuditWithJournal(presentMemoryV2Audit(bundle?.memory_v2, …), …)` → `if (memoryV2Audit)`）· `:1950`（`unmountDetailsWhenClosed: true`）· `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/timeline/timeline.js:133, 367`（该 flag 的实现，`code-owner-ui-primitives` 边界，只读引用）· 封顶常量 `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:6-8`（`PAGE_SIZE=500` / `MAX_PAGES=20` / `MAX_EVENTS=10000`）· `:353-372`（限额分支）· `:257`（`agentRuns.slice(-128)`）· `:480`（`mergeRefs .slice(0,512)`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:6`（`MAX_PENDING_ITEMS = 25`）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '100,112p' src/COMPONENTs/chat-bubble/chat_bubble.js
  sed -n '1927,1960p' src/COMPONENTs/chat-bubble/trace_chain.js
  grep -n "unmountDetailsWhenClosed" src/COMPONENTs/chat-bubble/trace_chain.js src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "JOURNAL_RELOAD_MAX_PAGES\|JOURNAL_RELOAD_MAX_EVENTS\|JOURNAL_RELOAD_PAGE_SIZE\|MAX_PENDING_ITEMS =" src/COMPONENTs/chat-bubble/memory_v2_{journal_reload,pending_reviews}.js
  ```
- **提交发言**: 本 ASSESSMENT（甲 §1.3 末、Q2 §4.3、FB1、B1、§六第二/三条）
- **支持/反驳**: **支持** FB1/B1（我的文件被三重门锁在「回合审计块」语义里，不能当通用 V2 浏览器）；**独立确认** `code-owner-shared-arteries` E-0040 的「V2 读平面今天零轮询」并给出 **成因**（折叠即卸载，不是纪律）；**为 `code-owner-electron` E-0032「`getTree` 是唯一无上界读方法」提供一条本仓已有的封顶先例**
- **完整性限制**: **(1)** 静态阅读，**未运行应用**，未观察折叠/展开时的实际挂载与卸载行为。**(2)** `isMemoryV2TraceBundle` 的判据我未逐行读（其在 `SERVICEs/runtime_events/memory_v2_trace_presenter.js`，`code-owner-shared-arteries` 边界）—— 我只主张「有这道门」，不主张「这道门在什么载荷下开」。**(3)** 封顶常量 **从未在真实非空载荷上跑过**（G2），其是否够用是推断。**(4)** `unmountDetailsWhenClosed` 的实现在 `code-owner-ui-primitives` 边界，我只读引用其存在
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑命令 → **自证类**
- **验证历史**:
  - 本 ASSESSMENT | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
