# 承重证据复核 · 批次 D（12 条）

`evidence-examiner` · 2026-08-08 · 只读，未改动任何文件

---

## 全批时效前提

复核实跑于：

```
git -C /Users/red/Desktop/GITRepo/PuPu rev-parse --short HEAD   → b2385d5d
git branch --show-current                                        → dev
git status --porcelain -- src electron unchain_runtime           → 0 行
```

**HEAD 与全批证据所载 revision（`b2385d5d`）一致，三个产品目录零 dirty。** 故本批全部 `file:line` 锚点的时效前提成立：**所有「当时是这样」的锚点，今天在同一 revision 上仍指向同一内容**，除下文逐条点名的例外。E-0001 承重复核所载「产品目录零 dirty」在本次（第五次时点）复测仍然成立。

**本批 12 条全部为自证类，全部按「进入承重集合免检失效」逐条实测。** 所有计数类与穷举类断言均实际重跑命令，未依赖登记摘要。

**批次 A 的缺陷模式在本批复现，且更严重**：本批查出 **5 条** 「登记转录 ≠ 该命令的实际含义或输出」，其中 **E-0053 是登记输出经复跑直接证伪**（不只是遗漏），**E-0054 是命令自身的过滤器失效导致标签为假**，**E-0055 是提交方自己预告的搜索盲区被实际命中**。四例全部落在负向或穷举性断言上。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0043
- **阶段**: 议案庭审
- **结论**: 全部 `file:line` 锚点与 `关键原文` 逐字复现，但登记的穷举计数「产品写点共 8 处」为假 —— 实为 **9 处**，遗漏 `chat_storage_migrate.js:174`。
- **依据**: E-0043
- **不确定性**: 遗漏项 `migrated.activeChatId = active;`（:174）的赋值同样受 `migrated.chatsById[input.activeChatId]` 成员性守卫约束（:169-172），或取自 `chatsById` 派生值/`null`，故 **不改变结论方向**；但该文件的 V1→V2 迁移函数完全未出现在证据中，`完整性限制 (1)` 只提到 `migrate.js:285-313`，**未披露 :174**。
- **请求/下一步**: 引用时把「8 处」改为「9 处」并补入 `chat_storage_migrate.js:174`；锚点与 `关键原文` 可单独承重。
- **评估结论**: 未验证
- **证据编号**: E-0043
- **来源类型**: general
- **真实性**: 锚点全部命中：`use_side_menu_actions.js:19-25`（`handleSelectNode` → `selectTreeNode` + `setChatStore`）· `side_menu.js:390` · `chat_storage_store.js:1022-1029`（`:1023` 守卫、`:1029` 赋值逐字一致）· `:1704-1744`（`selectTreeNode` → `updateActiveAndSelectedFromChatId`）· `chat_storage_tree.js:335` · `use_chat_session_state.js:237/345-353/412` · `use_chat_stream.js:11874/11985` —— 全部逐字相符。**计数失实**：`grep -rn "activeChatId = " src/SERVICEs/chat_storage/*.js` 重跑，非测试的 store 写点为 store.js 的 391/1029/1135/1869/1888/1898/2019 加 migrate.js 的 **174** 与 313，共 9 处；登记的 8 处漏掉 :174。（store.js:1071 与 migrate.js:285-310 为局部变量，正确排除。）
- **可靠性**: 内部来源（`code-owner-chat-core` 自陈只读检查），可在固定 revision 上机械复核。
- **相关性**: 支持其所称命题（`activeChatId` 的每个写点都受 `chatsById` 成员性约束）—— 补上第 9 个写点后该命题仍成立。计数缺陷不翻转方向，但登记形态是穷举枚举，下游可能当封闭集使用。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0044
- **阶段**: 议案庭审
- **结论**: 全部锚点与计数逐字复现，**22 处产品命中，数目与内容均一致**，无缺陷。
- **依据**: E-0044
- **不确定性**: 证据自陈的三项限制均属实且未被本次复核触及：注释按传闻类隔离（其主张所据为 `:6496`/`:6501` 两行代码，成立）；未实跑观察真实 payload；未核实 sidecar 侧行为。
- **请求/下一步**: 可直接承重。sidecar 侧 `owner_chat_id` 建 space 的确认仍归 `code-owner-runtime`。
- **评估结论**: 已验证
- **证据编号**: E-0044
- **来源类型**: general
- **真实性**: `:4116-4119` `runTurnRequest = useCallback(async ({ mode, chatId: targetChatId, …` ✓ · `:4713` `let effectiveThreadId = targetChatId;` ✓ · `:4912` `effectiveThreadId = resolvedCharacterConfig.session_id;` ✓ · `:6454-6456` 注释逐字一致 ✓ · `:6496`/`:6501` 两条 payload 分支各一次 `owner_chat_id: targetChatId,` ✓ · `:11978` `const targetSessionId = characterConfig?.session_id || currentChatId;` ✓ · `:11985` `ownerChatId: currentChatId,` ✓。重跑 `grep -n "ownerChatId\|owner_chat_id" src/PAGEs/chat/hooks/*.js src/PAGEs/chat/*.js | grep -v "\.test\.js"` → **恰好 22 行**，与登记一致；逐行核对，六处 `ownerChatId: currentChatId`（11985/12002/12277/12294/12524/12541）全部取 UI chat id 而非 session id，「全部一致」成立。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 直接支持其所称命题（写侧 `owner_chat_id` 恒为 UI chat id）。这是本批唯一一条产端写侧的直接代码依据，相关性强且未越界。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0045
- **阶段**: 议案庭审
- **结论**: 锚点全部属实，其单层事实（右键不改动激活选择）成立；**但本条的证据基础只覆盖 side-menu 回调这一层，不覆盖「整条链路」，更不含任何关于「可检测性」的证据。**
- **依据**: E-0045
- **不确定性**: 提交方自陈未核实的前提（explorer 是否先选中再派右键）**由我独立核实并解除**：`src/BUILTIN_COMPONENTs/explorer/explorer.js:607-611` 的 `handleContextMenu` 全体只有 `if (node.on_context_menu) node.on_context_menu(node, e);`，不触发 `onSelect`/`on_click`；`onClick={handleClick}` 是同一 div 上的独立 handler，contextmenu 事件不派发它。故该前提成立，结论不翻转。
- **请求/下一步**: **`expert-architecture` 的必要条件 C-A10 若以「错主在整条链路上结构性不可检测」为据，不能只靠 E-0045 承重** —— 该强主张所需的下游层证据（bridge / main 校验 / sidecar）本条一条都没有；跨层可检测性须另行取证或改由 E-0016/E-0024 一线承担。建议 speaker 把 E-0045 的承重范围明确限缩为「错主值可在 side-menu 层无声产生」。
- **评估结论**: 已验证（**仅限单层事实，见相关性**）
- **证据编号**: E-0045
- **来源类型**: general
- **真实性**: `side_menu.js:344-353` 的 `handleContextMenu` 实体存在，函数体确无 `handleSelectNode` / `selectTreeNode` / `setChatStore`；`:390`/`:391` 为 `explorerHandlerCallbacksRef.current.onSelect` / `.onContextMenu` 两个独立槽位 ✓；`:237-241` `memoryInspect` 本地 state ✓；`use_side_menu_actions.js:19-25` ✓。**一处形式偏差**：`关键原文` 是把多行对象字面量压成一行的**重排转录**，真实函数体跨 344-353 共 10 行，非登记所称「全函数体四行」；语句集合与 token 完全一致，属描述性不准确，非内容改动。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: **这是本条的关键限制。** 登记的四个锚点全部位于 side-menu 组件层，共同只证明一件事：**右键不会同步激活选择**——一个**发生侧（origination）**的事实。本条 **未登记任何** 关于以下各层的证据：explorer 派发层（提交方自陈未核）· 右键菜单项对 node 的后续取值（`side_menu_context_menu_items.js:196-207`，`memorySessionId` 直接由被右键 node 派生后交给 `onInspectMemory`，无任何校验）· bridge/IPC 层 · main 校验层 · sidecar 层。**「不可检测」是一条跨层否定命题，本条的证据基础一层都没覆盖到。** 就其自身所称的「新增一条错主路径」而言，相关性成立且充分。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0046
- **阶段**: 议案庭审
- **结论**: 全部锚点、两项计数、以及 `resolveApi` 的全有或全无语义均逐字复现，无缺陷。
- **依据**: E-0046
- **不确定性**: 证据自陈两项限制属实：「facade 加第 19 个方法会让测试静默改走降级分支」确为对 `resolveApi()` 语义的推论而非实跑（该语义我已在 `:63-65` 的 `for … if (typeof api[method] !== "function") return null;` 上核实，推论成立但仍是推论）；未核实 chat-bubble 三个消费者的 mock 形态。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0046
- **来源类型**: general
- **真实性**: 重跑计数 = **18** ✓；实际 mock 方法名逐个与 `REQUIRED_METHODS`（`context_v2_bridge.js:32-50`，18 项）**同名同序** ✓；`:249 getTree: noop,` ✓；`resolveApi` 于 `:59-67` 且为全有或全无 ✓；`grep -rln "contextV2API" src --include="*.js"` → **恰好 3 个文件**（本测试 + facade + facade 测试）✓。`use_chat_stream.js` 七个锚点全部命中：`:87-89`（import）· `:3907`/`:4004`（`isAvailable()` 守卫）· `:3916`（`getSessionHead`）· `:4010`（`rebaseSession`）· `:3920`/`:4013`（`parseContextV2ErrorCode(error) || "context_v2_failed"`）✓。（`取得方式` 的计数窗口写 `NR>=205` 而 `来源定位` 写 `:208-262` —— mock 对象起于 :207、首方法在 :208，窗口放宽不影响结果。）
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 直接支持其所称命题（该测试替身与 facade 必需方法集完全耦合，且是 `src/COMPONENTs/**` 与 `src/PAGEs/**` 下唯一构造该替身的文件）。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0047
- **阶段**: 议案庭审
- **结论**: 七段锚点与全部码表计数逐字复现（7 / 4 / 15 / 5），`fail-closed` 兜底行号精确到 `:434`，无实质缺陷。
- **依据**: E-0047
- **不确定性**: 两处极轻微描述偏差（见真实性），不影响承重。证据自陈限制属实：未逐一验证 19 个码在 sidecar 侧存在（`code-owner-runtime` E-0037 报 42 个码）；未跑该模块测试。
- **请求/下一步**: 可直接承重。**附带发现**：本条 `RUNTIME_UNAVAILABLE_CODES` 含 `"context_v2_unreachable"`（`:392`），**该行直接证伪 E-0053 的负向断言**，见 E-0053 项。
- **评估结论**: 已验证
- **证据编号**: E-0047
- **来源类型**: general
- **真实性**: `:93-109` 注释 + `Object.freeze` 块，固定文案 **7 条**（UNAVAILABLE/NOT_READY/IN_PROGRESS/FAILED/CONFLICT/CONFLICT_MANUAL/PERSIST）✓ · `:389-394` `RUNTIME_UNAVAILABLE_CODES` **4 码** ✓ · `:396-412` `NOT_READY_CODES` **15 码** ✓ · `:420-435` 函数体、`:434 return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;` 行号精确 ✓ · `:437-444` 不合并理由注释 ✓ · `:445-451` `V1_MIRROR_UNAVAILABLE_CODES` **5 码** ✓ · `:456-459` `contextV2V1MirrorMessage` ✓。`关键原文` 三段引文逐字一致。两处轻微偏差：(a)「5 出口 + 兜底」—— 函数实有 **5 个 return**，其中第 5 个即兜底，字面读作 5+1=6 会多计一个；(b) 引文标注 `:440-444`，而所引句首 "They" 实起于 `:439`。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核。
- **相关性**: 支持其所称命题（两张映射表在代码中确实分立、兜底为 fail-closed）。注释部分已由提交方自行按传闻类隔离，隔离得当。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0048
- **阶段**: 议案庭审
- **结论**: 两条登记命令 **逐字复现**，`context_v2_store_disabled` 在 `src/` 出现 **0 次**，服务端两处命中行号精确。核心负向命题成立。
- **依据**: E-0048
- **不确定性**: **`支持/反驳` 中的「覆盖率 = 0/5」在本条内无任何命令支撑，且分母未定义。** 若分母取 E-0053 所列五码集，则该比率为假 —— `context_v2_unreachable` 已被 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:392` 消费并映射为用户可见的 UNAVAILABLE 文案，覆盖率至少为 1/5。**该比率不得作为计数引用。** 证据自陈的三项限制（负向证明只覆盖字面标识符、可达性为推断不得作事实引用、未核 electron 侧改写）均属实。
- **请求/下一步**: 引用时只引「`context_v2_store_disabled` 在 `src/` 零命中，且在服务端存在于 `memory_v2_runtime.py:726` 与 `route_memory_v2.py:239`」；删去或重算「0/5」。
- **评估结论**: 已验证（**「0/5」一句除外，见不确定性**）
- **证据编号**: E-0048
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "context_v2_store_disabled\|store_disabled" src --include="*.js"` → **零输出（exit 1）** ✓ 与登记一致。重跑第二条 → 恰好两行：`unchain_runtime/server/memory_v2_runtime.py:726` 与 `route_memory_v2.py:239` ✓ 行号逐字一致。
- **可靠性**: 内部来源（`code-owner-chat-core`），可机械复核；负向命题按其自陈只覆盖字面标识符，此限制真实且已披露。
- **相关性**: 支持其所称命题（renderer 侧完全不认识该码）。但 `支持/反驳` 里的 0/5 推广超出本条命令所能证明的范围，且与同案 E-0047 抵触。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0050
- **阶段**: 议案庭审
- **结论**: 全部锚点、全部唯一性断言（唯一 Provider、唯一 `<ChatMessages>` 挂载点、`ownerChatId` 全文件仅三处）逐字复现，无缺陷。
- **依据**: E-0050
- **不确定性**: 证据自陈四项限制属实且未被本次复核推翻：未运行应用；grep 只覆盖字面标识符；`activeChatId`(state) 与 `activeChatIdRef.current`(ref) 的同 tick 同步性未构造并发验证；ui-testing 两个 runner 未实跑。第四项我确认了其前半：两个 runner 确实 import 并挂载真实 `TraceChain`（`trace_chain_runner.js:13,222` · `interject_runner.js:4`）。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0050
- **来源类型**: general
- **真实性**: `streaming_message_store_context.js:18-25` 默认值含 `chatId: ""` ✓ · `chat_messages.js:60`（`chat_id: chatId`）· `:73-81`（`useMemo` 三字段）· `:212`（`<StreamingMessageStoreContext.Provider`，重跑确认 **全 `src/` 唯一 Provider**）· `:243`/`:275` ✓ · `chat.js:1129-1130`：严格重跑 `grep -rn "<ChatMessages" src --include="*.js" | grep -v "\.test\.js"` → **单条命中**，「全仓唯一挂载点」成立 ✓ · `use_chat_session_state.js:202/228/237/345-353/383-384/412/464-465` 全部逐字命中，`characterId` 确为独立字段 ✓ · `trace_chain.js:647` ✓；`grep -n "ownerChatId" trace_chain.js` → **恰好 1932/1954/1984 三行**，「全文件仅此三处」成立 ✓ · `use_chat_stream.js:11874/11985` ✓。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: 直接支持其所称命题（`ownerChatId` 只在覆盖活跃会话的单一 provider 内可得），并正确地把 `FRAMING` 甲的事实部分与推论部分分开。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0052
- **阶段**: 议案庭审
- **结论**: 两条 grep 与四条命中逐字复现，「全 `src/` 唯一消费者」这一穷举断言 **实测成立**。
- **依据**: E-0052
- **不确定性**: 证据自陈两项限制属实：只覆盖字面标识符与两个字面片段；「character chat 的 `id` 一定是 `chat-…` 形态」确为强旁证而非证明，该确认归 `code-owner-shared-arteries` 与 `code-owner-chat-core`。
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0052
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "buildCharacterMemorySessionId" src --include="*.js"` → **恰好 4 条**（含测试亦为 4，即无测试命中）：定义 `chat_storage_sanitize.js:301` · 再导出 `chat_storage.js:38` · `side_menu_context_menu_items.js:2`（import）与 `:198`（调用）✓ 与登记完全一致。重跑 `grep -rn 'character_\${\|__dm__' src` → **单条**，`chat_storage_sanitize.js:302` ✓。**`src/COMPONENTs/chat-bubble/**` 与 `src/COMPONENTs/chat-messages/**` 确为零命中** ✓。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: 支持其所称命题（E-0016 的多态 session id 在 chat-bubble 链上不可达），并正确地把 E-0016 的作用域收窄为 side-menu→Inspector 单条路径而非反驳 E-0016 本身。相关性精确。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0053
- **阶段**: 议案庭审
- **结论**: **登记的第一条 grep 输出「全 `src/`（含测试）零命中」经同 revision 复跑直接证伪 —— 实为 4 条命中，其中 1 条在产品代码。** 其余四条 grep 与全部锚点逐字复现。
- **依据**: E-0053
- **不确定性**: 该证伪 **不推翻** 本条在 chat-bubble 边界内的结论：`src/COMPONENTs/chat-bubble/**` 内五码确实零命中，故「我端不能区分未启用与空数据」成立。但登记形态是 **全 `src/` 的封闭集断言**，下游若据此认为「整个 renderer 都不认识这五个码」会被误导。
- **请求/下一步**: 引用前必须把第一条 grep 的结论改写为 **「五码中四码在 `src/` 零命中；`context_v2_unreachable` 在 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:392` 被 chat-core 消费并映射为用户可见 UNAVAILABLE 文案，另有 3 处测试命中」**。同时提请注意：本条与同案 **E-0047 内部抵触** —— E-0047 的 `关键原文` 恰好引用了含该码的 `RUNTIME_UNAVAILABLE_CODES` 表。
- **评估结论**: 未验证
- **证据编号**: E-0053
- **来源类型**: general
- **真实性**: **grep1 证伪**：重跑登记原命令，输出 4 行 —— `context_v2_turn_mutation.test.js:173`、`:494`、`use_chat_stream.turn_mutation_v2.test.js:867`、**`context_v2_turn_mutation.js:392`（产品代码）**，登记为「零命中」，为假。其余复现无误：grep2 → 恰好 4 行 `isAvailable`（`journal_reload.js:516`、`pending_reviews.js:299`/`:736`、`trace_audit.js:79`），`getStatus` 与 `unchainAPI` 均零命中 ✓；grep3、grep4 输出正常。锚点逐一命中：`journal_reload.js:274`（`|| "context_v2_journal_unavailable"`）· `:294`/`:521`（`errorCode: "context_v2_unavailable"`）· `:391`（`errorCode: "context_v2_invalid_cursor"`）· `:574-578`（渲染出口）· `pending_reviews.js:179-186`（`errorPresentation`，`:183` `code || "context_v2_request_failed"`）· `:397-407`（`.catch` 确 **无码解析**）· `:1015-1050`（多支渲染）· `trace_audit.js:120-129`（`catch` 确 **无码解析**）—— 全部逐字相符。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核 —— 正因可机械复核，登记转录与实际输出的背离才能被当场查出。
- **相关性**: 就 chat-bubble 边界而言相关且成立；就其登记的全 `src/` 范围而言，负向断言不成立。证据自陈的「渲染结论为推断、不得作为事实引用」的自我限制得当且应被保留。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0054
- **阶段**: 议案庭审
- **结论**: 四行对照表与 `memory_v2_store.py:3604` **逐字复现**；但「`context_v2_unavailable` 于 `unchain_runtime/server` 下 **11 个非测试点**」为假 —— 该命令自身的过滤器失效，真实非测试点为 **10**。
- **依据**: E-0054
- **不确定性**: 缺陷为 **标签失实而非转录失实**：命令确实打印 `11`，但其 `grep -v "/tests/"` 无法过滤 `tests/test_memory_v2_runtime.py:24`（命令先 `cd` 进 `unchain_runtime/server` 再以 `.` 为根，相对路径无前导 `/`），故一个测试点混入了「非测试点」计数。本条的对冲主张（「≥9，且含读路径上的那一个」）不受影响，10 ≥ 9 成立。**该缺陷同时部分解释了提交方自陈「未追」的 11 vs E-0037 之 9 的差异。**
- **请求/下一步**: 引用时把 11 改为 **10**，并列明：`memory_v2_store.py:1527` · `memory_v2_runtime.py:702` · `route_memory_v2.py` ×8（259/333/388/504/591/719/804/856）。四行对照表可原样承重。
- **评估结论**: 未验证
- **证据编号**: E-0054
- **来源类型**: general
- **真实性**: 四行 for 循环输出 **逐字复现**（`request_failed` server:0/renderer:1 · `journal_unavailable` server:0/renderer:1 · `invalid_cursor` server:1/renderer:1 · `store_disabled` server:2/renderer:0）✓；`memory_v2_store.py:3604 "context_v2_invalid_cursor",` 行号精确 ✓。渲染层五个自造点锚点全部命中：`journal_reload.js:274/294/391/521` · `pending_reviews.js:183` · facade `context_v2_bridge.js:69-75`（`error.code = "context_v2_unavailable"`）✓。**计数失实**：登记 11，去掉泄漏的测试点后为 10。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。跨入 `code-owner-runtime` 边界的部分已被提交方明确标为「只读引用、权威解释归其」，自我限制得当。
- **相关性**: 支持其所称命题（渲染层两个服务端零出处的自造码 + `context_v2_invalid_cursor` 的第二处字面碰撞）—— 这三点均不依赖那个失实的 11，故实质相关性完好。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0055
- **阶段**: 议案庭审
- **结论**: 两条登记 grep 各自零输出属实，`normalizeUnchainStatus` 六字段重建逐字复现；**但「`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` 的 import 零命中」这一负向断言为假** —— 存在一处三层深度的 import，正落在提交方自己预告的搜索盲区里。
- **依据**: E-0055
- **不确定性**: 该反例 **不翻转** 本条的承重结论：反例调用的是 `api.unchain.listToolModalCatalog()`（`artifact_kind_registry.js:208`），而 `api.unchain.getStatus`（`api.unchain.js:870`）无论是否可达，其返回都经 `normalizeUnchainStatus` 重建为六字段、`memoryV2` 被丢弃。故「chat-bubble 拿不到 `memoryV2`」仍成立；**不成立的是「经任何合法路径不可达」这一更强的形式**。
- **请求/下一步**: 引用时把结论改写为「facade 侧 `normalizeUnchainStatus` 结构性丢弃 `memoryV2`，故即便 chat-bubble 经 facade 取状态也拿不到该构件」，删去「零 import / 不可达」的表述。
- **评估结论**: 未验证
- **证据编号**: E-0055
- **来源类型**: general
- **真实性**: `api.shared.js:330-343` `normalizeUnchainStatus` 逐字复现，确只重建 `{status, ready, url, reason, pid, port}` 六字段，无 `memoryV2` ✓。两条登记 grep 重跑均零输出 ✓（`from "../../SERVICEs/api` 与 `unchainAPI`）。**但放宽为 `grep -rn "SERVICEs/api" src/COMPONENTs/chat-bubble` 后命中一条**：`src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js:2: import api from "../../../SERVICEs/api";`，并于 `:208` 调用 `api.unchain.listToolModalCatalog()`。证据 `完整性限制 (1)` 恰好预告了「未覆盖其它相对深度」—— 该盲区被实际命中。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。其对 `electron/**` 与 `service.js` 的完全依赖已明确声明「本条不为该部分承重」，自我限制得当。
- **相关性**: 其所称支持的命题分两半：facade 丢弃 `memoryV2`（**成立且承重**）与 chat-bubble 不可达 facade（**不成立**）。承重时须只取前半。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0056
- **阶段**: 议案庭审
- **结论**: 三重门与多数封顶常量逐字复现，**但 `:480` 登记为 `mergeRefs .slice(0,512)`，实际该行为 `.slice(0, 128)`** —— 真实行号配错常量。另：跨界自我限制在锚点层被遵守，**在其派生因果主张中被越过**。
- **依据**: E-0056
- **不确定性**: `.slice(0, 512)` 确实存在于同一文件的 `:254` 与 `:421`，故不是常量凭空捏造，而是行号与常量错配；下游若按「mergeRefs 封顶 512」使用会低估该路径的收紧程度（实为 128）。
- **请求/下一步**: 引用时更正为 `:480 → .slice(0, 128)`；若要引 512，改指 `:254`（`refs` 投影）或 `:421`。并请把「折叠即卸载」降格为待核推断（见相关性）。
- **评估结论**: 未验证
- **证据编号**: E-0056
- **来源类型**: general
- **真实性**: 逐字命中：`chat_bubble.js:107-110`（`hasMemoryV2Audit` + `shouldRenderTraceChain` 三选一）✓ · `trace_chain.js:1928-1936`（`mergeMemoryV2AuditWithJournal(presentMemoryV2Audit(bundle?.memory_v2, …), …)` → `if (memoryV2Audit)`）✓ · `:1950 unmountDetailsWhenClosed: true,` ✓ · `timeline.js:133`（`unmountDetailsWhenClosed = false,`）与 `:367`（`unmountWhenClosed={unmountDetailsWhenClosed}`）✓ · `journal_reload.js:6-8`（500 / 20 / 10000）✓ · `:353-372` 限额分支 ✓ · `:257 .slice(-128)` 确在 `agentRuns:` 内（:255-258）✓ · `pending_reviews.js:6 MAX_PENDING_ITEMS = 25` ✓。**`:480` 失实**：实际为 `return Array.from(merged.values()).slice(0, 128);`。
- **可靠性**: 内部来源（`code-owner-chat-bubble`），可机械复核。
- **相关性**: **跨界自我限制的执行情况（受命专核）**：`来源定位` 与 `完整性限制 (4)` 都把 `timeline.js:133,367` 限定为「只读引用其存在」。**锚点层遵守了** —— 正文只引用 flag 的声明与转发，未对 timeline 内部行为作任何断言。**但 `支持/反驳` 越界**：「独立确认『V2 读平面今天零轮询』并给出**成因**（折叠即卸载，不是纪律）」是一条关于 `code-owner-ui-primitives` 实现行为的因果主张，而 `:367` 只显示该 flag 被 **再向下转发** 给另一组件，本条未登记任何证明「确实发生卸载」的证据，也未运行应用观察（其 `完整性限制 (1)` 自认）。故该自我限制 **未被其正文完全遵守**，「折叠即卸载」应作为待核推断处理，不得承重。
- **来源归类**: 内部来源

---

## 小结表

| 证据 | 提交方 | 评估结论 | 关键理由 |
|---|---|---|---|
| E-0043 | chat-core | **未验证** | 锚点全对；穷举计数 8 → 实为 **9**，漏 `chat_storage_migrate.js:174`（未披露） |
| E-0044 | chat-core | 已验证 | 锚点全对；22 处命中数目与内容全一致 |
| E-0045 | chat-core | 已验证（**限单层**） | 单层事实成立（explorer 前提由我独立解除）；**证据基础只覆盖 side-menu 回调层，不支撑「整条链路不可检测」**，C-A10 不可只靠本条 |
| E-0046 | chat-core | 已验证 | 18 方法同名同序、3 文件、全有或全无语义全部复现 |
| E-0047 | chat-core | 已验证 | 7/4/15/5 码表与 `:434` 兜底行号全部精确 |
| E-0048 | chat-core | 已验证（**「0/5」除外**） | 两条命令逐字复现；`0/5` 无命令支撑且分母未定义，取五码集则为假 |
| E-0050 | chat-bubble | 已验证 | 唯一 Provider / 唯一 `<ChatMessages>` / `ownerChatId` 仅三处，三项唯一性断言全部实测成立 |
| E-0052 | chat-bubble | 已验证 | 4 条命中、「全 `src/` 唯一消费者」实测成立 |
| E-0053 | chat-bubble | **未验证** | **登记输出「全 `src/` 零命中」经复跑证伪**：4 条命中，含产品代码 `context_v2_turn_mutation.js:392`；与同案 E-0047 内部抵触 |
| E-0054 | chat-bubble | **未验证** | 对照表逐字复现；「11 个非测试点」为假，其 `grep -v "/tests/"` 漏过一个测试文件，真实为 **10** |
| E-0055 | chat-bubble | **未验证** | facade 丢弃 `memoryV2` 成立；**「chat-bubble 对 `SERVICEs/api.*` import 零命中」为假**（`artifact_kind_registry.js:2`，三层深度，正中自陈盲区） |
| E-0056 | chat-bubble | **未验证** | 多数锚点精确；`:480` 登记 `.slice(0,512)` 实为 `.slice(0,128)`；跨界自我限制在派生因果主张「折叠即卸载」处被越过 |

**统计**：已验证 **7**（其中 E-0045 限单层、E-0048 有一句除外）· 未验证 **5** · 相矛盾 0。

**跨条模式**：5 条缺陷中 **4 条**（E-0043 · E-0053 · E-0054 · E-0055）落在**负向或穷举性断言**上，与批次 A 所报模式同型 —— 登记的命令转录呈现为封闭集，实际为经筛选或经失效过滤器的子集。**四条的结论方向均未翻转**，但四条的登记形态都恰是下游最易当作封闭集引用的形态。E-0056 的缺陷类型不同（行号—常量错配 + 跨界因果外推），单独处理。

**受命专核的两项特殊事项**：
1. **E-0045 / C-A10** —— 其证据基础止于 side-menu 回调一层，只证明错主值可**无声产生**，对 explorer 之后的任何一层（右键菜单取值、bridge、main 校验、sidecar）**零证据**，尤其对「可检测性」本身零证据。「整条链路结构性不可检测」不能由本条承重。
2. **E-0056 跨界只读自我限制** —— 锚点层遵守，`支持/反驳` 的「折叠即卸载」越界；`timeline.js:367` 仅显示 flag 再转发，本条未证明卸载实际发生。
