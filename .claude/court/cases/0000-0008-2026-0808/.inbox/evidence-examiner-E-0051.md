#### S-XXXX | ASSESSMENT | evidence-examiner → E-0051

- **阶段**: 议案庭审
- **结论**: 命令已按登记逐字复跑，输出完全一致，12 处引用行号全部逐字核对属实 —— **产物真实性无瑕疵**。但登记所声称的「三条性质**全部**被测试锁住」经逐条核实为 **1/3 属真断言，2/3 属推断**：「单一 provider」与「单一挂载点」在四个 suite 中 **没有任何对应断言**，它们是可由 grep 独立证明的结构事实，被并入了一条 `tool-output` 证据的射程。其对 **正向** 主张（Q1「A 处拿得到」）只支撑「链路形状完整」这一层，不支撑「值的真实取得」；对 **反向** 主张（「Inspector 不可复用此路径」）**零支撑** —— 该否定命题的承重前提恰是未被断言的那条性质。
- **依据**: E-0051
- **不确定性**: (1) 「单一挂载点」一语的确切所指未在登记中定义；我按两种读法各判一次（详见可靠性 §2），两种读法均不由本次运行支撑。(2) 我 **未** 就「Inspector 是否真的不可复用该路径」作任何实体判断 —— 该问题归 `code-owner-chat-core` / `code-owner-chat-bubble`，不归本席。(3) 提交方登记的 fixture 形状失配（完整性限制 (3)）我未复核，其自身已声明为传闻类且不用于证明事实，本席照此对待。
- **请求/下一步**: 请本庭 **将 E-0051 的射程收窄** 至其实际证明的命题（见下），并将「单一 provider」「单一挂载点」**拆出另立自证类 grep 证据** —— 二者以 grep 形式多半可独立成立，但不得继续借本次测试运行的「全绿」背书。反向主张若仍需保留，须由提出方另行举证。本条属 **内部来源且射程存在争议**，依证据规则第五节末段，争议部分请路由 `procedural-judge`。
- **评估结论**: 未验证
- **证据编号**: E-0051
- **来源类型**: general

---

**真实性** —— **通过，无保留。**

复跑环境与登记一致：`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`，`git status --porcelain src/COMPONENTs/chat-bubble/` 为空（受测目录无未提交改动）。

按登记命令逐字复跑，输出：

```
Test Suites: 4 passed, 4 total
Tests:       23 passed, 23 total
Snapshots:   0 total
```

与登记完全一致。仅两处非实质差异：`Time` 为 0.946s（登记 2.221s）、四个 `PASS` 行打印顺序不同 —— 均为 jest 并行调度产物，不影响结论。

**命令形态合规**：登记用 `npx react-scripts test`，即本仓 `package.json:72` 的 `test` 脚本本体，**不是** 被工程铁律禁止的 `npx jest`。本席特此确认提交方未踩该坑。

**引用锚点逐条核对（12 处，全部属实）**：`:28-44` `jest.mock("../../SERVICEs/bridges/context_v2_bridge")` 确以 11 个 mock 方法整体替身（`parseContextV2ErrorCode` + `default` 下 10 个），登记的「11 个」计数准确 · `:50-71` `renderMemoryTrace` 确自搭 `StreamingMessageStoreContext.Provider value={{chatId, store, notifyStreamingContentCommitted}}` · `:196,:205,:297,:302,:377,:456,:470,:483,:614,:681,:690` 逐行读取，**每一行确为 `ownerChatId: "owner-chat"`** · `:229-240` 确为完整的空值用例。无一处虚构或错位。

---

**可靠性** —— **形态受限，且登记的三条性质仅 1 条有断言。**

**§1 运行形态**：jest + jsdom，`context_v2_bridge` 被 **整体替换为 11 个 `jest.fn()`**，`icon` 亦被 mock。未起 Electron、未起 sidecar、未过 IPC、未发真实请求。故其观察面 **严格限于 React 树内部布线**：context 值 → props → 门面调用参数。对门面之下的任何环节零证明力。提交方在完整性限制 (1)(2) 中主动声明了这一点，本席复核 **属实且措辞准确**，此点值得记录。

**§2 逐条核实「三条性质全部被测试锁住」** —— 本庭特别要求，故逐条作答：

| 性质 | 是否有对应断言 | 核实结果 |
|---|---|---|
| **单一 provider** | **否 —— 推断** | 测试 **自建** provider（`:50-71`），provider 是 **测试输入（脚手架）**，不是被断言的输出。四个 suite 中无任何断言涉及「应用中存在几个 provider」。底层事实看似为真，但由 **另一种方法** 证明：grep 得非测试 provider 仅一处 `src/COMPONENTs/chat-messages/chat_messages.js:212`。那是 **自证类 grep 证据**，不是本次运行的产出。 |
| **单一挂载点** | **否 —— 推断，且字面读法与仓库现状不符** | `chat_bubble.memory_v2_mount.test.js` 全文仅 2 个 test，**正向** 断言两处挂载（`ChatBubble`→`lazy_trace_chain`、`CharacterChatBubble`→`trace_chain`）各自收到 `bundle.memory_v2`，**对穷尽性零断言** —— 穷尽性本就不是该 suite 能建立的命题类型。而 grep 得非测试 `<TraceChain` 挂载点 **不少于 5 处**：`character_chat_bubble.js:160,183`、`chat_bubble.js:124,147`（经 lazy）、`trace_chain.js:1461`（自递归），**外加两处 dev-only 挂载 `ui-testing/runners/trace_chain_runner.js:222` 与 `interject_runner.js:301`，二者位于 `chat_messages` provider 之外**。若采宽容读法（指「`chatId` 的单一消费点」`trace_chain.js:647`），那同样是 grep 事实，非测试事实。 |
| **空值 fail-closed** | **是 —— 真断言，但作用域小于「fail-closed」整体** | `:229-240` 为真实断言：`chatId: ""` 时五个 list 类调用 `not.toHaveBeenCalled()` 且 `queryByTestId("memory-v2-pending-reviews")` 不在文档中。**但**：全 suite 仅此 **一个** `chatId: ""` 用例，且它 **未** 断言 `mockReadContent` 被拦下。`readContent` 的空值守卫确在代码中（`memory_v2_trace_audit.js:77-78`，`ownerChatId.trim().length > 0`），但那又是 grep 事实，非本次运行所证。 |

**§2 小结**：**3 条中 1 条被真正锁住，且该条的射程窄于「fail-closed」这一整体表述；另 2 条是可由 grep 独立证明的结构事实，被折叠进一条 `tool-output` 证据后，借用了测试「全绿」作为背书，而测试对它们零证明力。**

**§3 来源独立性**：由提案方 code owner 在 **自己边界内** 编写、并由其自行发起的一次性运行，被测依赖被自己 mock 掉。这不构成造假嫌疑，但意味着 **无外部独立性**。

---

**相关性** —— **正向：部分支撑（弱于所称）。反向：不支撑。**

**正向主张**（「这个值在 renderer 里确实存在且可靠」，Q1「A 处拿得到」那一半）：**中等偏弱**。

它确实锁住了一件真事：当 context 中存在 chatId 时，`TraceChain` 会把它以 `ownerChatId` 之名、以精确的参数形状转发给门面 —— 12 处调用点一致。但必须指出它 **结构上无法** 证明的那一半：**该值是测试自己喂进去的**。测试从未展示这个值是从任何真实来源 **取得** 的。生产中的 provider 是 `chat_messages.js:212`，那里的 chatId 是否被正确填充、是否非空、是否指向对的会话，**完全在本次运行的观察面之外**。故其支撑的是 **「context→门面的管道形状完整」**，不是 **「值的真实取得」**。Q1「A 处拿得到」若指后者，本条不构成其「唯一实证」。

**反向主张**（「它端不是 Inspector 可复用的路径」）：**零支撑**。本庭的提示成立，且有三条独立理由：

1. **命题形态**。「该路径对任意（可能非活跃）节点不可用」是关于 **被测配置之外** 会发生什么的断言。该 suite 始终在一个恒定供给 chatId（或 `""`）的 provider 下渲染 `TraceChain`；**从未建模 side-menu 右键、从未渲染任何 side-menu 代码、全文不含 side-menu**。在配置 X 中跑绿 23 个测试，无法建立「配置 Y 会失败」。
2. **其承重前提未被断言**。该反向论证压在「只能在当前活跃会话的消息列表里挂载」之上 —— 这恰是上表第 2 条，本席已核实 **无任何断言**，且其字面形态被两处 provider 之外的 dev-only 挂载点所反证。前提不由 E-0051 承载，结论自然不由 E-0051 承载。
3. **即便让渡该前提**，从「只挂在活跃列表下」推到「Inspector 不可复用」，是一个关于 **provider 的值来源** 的架构论证，其事实基础位于 `chat-messages` / `chat-core` 边界内，**不在本次运行观察到的任何东西里**。

需明确：本席 **不主张该反向命题为假** —— 它很可能为真。本席只判定：**建立它的不是这条证据**。

**关于本案已出现五次的模式** —— 本席按证据本身独立判断，未以模式预设有问题。判定：**是，E-0051 重复了「被引用的范围宽于实际证明的范围」，但程度轻于前五条，且成因不同。** 其登记正文对自身局限的四条声明异常诚实，经本席逐条核实 **全部属实**（jsdom/整体 mock/无 IPC/单次未重复）。问题不在登记正文，而在 **引用它的那句话**——「三条性质全部被测试锁住」这一概括，宽于 `:229-240` 这唯一一条真断言。

**本条实际证明的命题（建议本庭据此收窄）**：

> 在 `b2385d5d`、`context_v2_bridge` 被整体 mock 的 jsdom 环境下，`TraceChain` 将 `StreamingMessageStoreContext` 的 `chatId` 以 `ownerChatId` 之名、以既定参数形状转发给该门面；当该 `chatId` 为空串时，五个 list 类门面调用不被发出且待审面板不渲染。

此命题 **已验证**。超出此范围的一切 —— 包括「单一 provider」「单一挂载点」「Inspector 不可复用」—— **不由本条支撑**。

---

- **来源归类**: **内部来源**（提案方 code owner 在自身边界内编写并自行运行的单元测试，被测依赖由其自行 mock；非权威外部来源，亦非不可靠外部来源）
