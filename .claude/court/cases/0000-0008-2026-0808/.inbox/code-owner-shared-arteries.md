#### S-XXXX | ASSESSMENT | code-owner-shared-arteries → case
- **阶段**: 议案庭审
- **结论**: **可行，且我的边界内零改动。** 逐条：**甲 —— Inspector 成为 `getStatus()` 的第一个 renderer 消费者，我不反对，代价为零**（该方法今天已经是 `REQUIRED_METHODS` 的一员、已是可用性门的成立条件之一、已被我的测试覆盖，新增调用点是纯加法）。**但我同时部分证伪 F2 的前提**：`code-owner-settings` 把 F2 定为「唯一无绕行方案」的那一条，其依据是「`getStatus` 会 resolve 出 `available:false`」——**在最需要它作答的那一态里它不 resolve，它 reject**（E-D6）。更要紧的是，**`getTree` 单独一次调用就已经能区分空态与未启用态**（E-D7）：resolve ⟺ 读真的发生了，reject ⟹ 没发生且码说明原因；后端不存在「store 关着却回 200」这种出口（runtime E-A4 b）。**故 F2 即便成立也不塌 Q4，它从「无绕行」降级为「两条路里较贵的一条」。** **乙 —— 保真，42 个 sidecar 码零损耗透传，解析面按字符集开放而非白名单封闭**（未知码原样到达而不是被丢弃，这对 Q4 是好性质）；**一处实质缺陷：`context_v2_unavailable` 是我自造码与 sidecar 码的碰撞，且 sidecar 那一侧就在读路径上**（E-D5）。**丙 —— 两跳在我 facade 上完整，且第一跳 `listSpaces` 今天已有活的生产消费者**（`memory_v2_pending_reviews.js:782`，E-D8）——**本案要新增的是第二跳的第一个消费者，不是两跳的第一个消费者**。两个「空」在我这一层 **不可区分，因为我这一层不区分任何东西**——facade 逐字透传，join 是调用方的活。**丁 —— 无结构性障碍**。**Q2 —— 成立，四态判定该落我边界内，我接，但有 P1/P2/P3 三个前置，缺一我不接并指名 `code-owner-electron` 为替代 owner**
- **依据**: E-0001, E-0002, E-0004, E-0005, E-0006, E-D1, E-D2, E-D3, E-D4, E-D5, E-D6, E-D7, E-D8, E-D9, 0000-0003-2026-0807#S-0024, 0000-0003-2026-0807#S-0014
- **不确定性**:

  **一 · 我未起 sidecar、未跑应用、未跑 `react-scripts test`。** 全部结论来自 PuPu `b2385d5d` 的静态阅读 + 一次纯 `node -e` 的正则探针（E-D4）。凡涉及运行时行为的，我按下列归属标注：sidecar 归 `code-owner-runtime`，主进程归 `code-owner-electron`。

  **二 · 甲 的核心论断里有一段是 *推断*，不是观察。** 「shipped 配置（`store_owner=off`）下 `getStatus()` 会 reject 而不是 resolve」是我对 `electron/main/services/unchain/service.js` 控制流的阅读（E-D6）**乘以** `code-owner-runtime` 的 E-A4 b3（须查类，其自述用 Flask `test_client`、鉴权被替身、未起真实 sidecar）。**两个都不是产品运行观察，乘出来的结论只能是推断。** 请 `code-owner-electron` 在自己边界内确认或推翻。**我已核实该分支无测试守护**（E-D6 第 3 点）。

  **三 · 我对 `electron/**` 与 `unchain_runtime/**` 的全部引用都是跨界只读**，用途仅限于确定「到达我 facade 的 promise 是什么形状」。**权威结论归各自 owner，我不代其表态。**

  **四 · G2 继承。** 本机 V2 store `entries=0`。我这一层不解析载荷，所以「有数据时 tree 长什么样」对我的结论 **不构成影响**——但也意味着我 **无法** 为正常态的载荷体积、序列化开销、IPC 单帧上限给出任何承诺。凡涉及正常态量级的问题，我的答案是「未取证」，不是「没问题」。

  **五 · E-0001 的完整性限制要求承重复核时重测工作树，我已重测（E-D1），结果与 E-0001 不完全一致**：现为 12 个 dirty/untracked 条目（E-0001 记 8 个），新增 4 个全部是 **我自己的 `.claude/agent-memory/code-owner-shared-arteries/` 与 `0000-0005` 案卷**。**`src/` `electron/` `unchain_runtime/` 三个产品目录仍为零 dirty**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**仍然成立**。

- **请求/下一步**:
  1. **请本庭把「F2 是唯一无绕行方案的推翻条件」这一定性 *下调*，并把 E-D7 记为对它的部分反驳。** 我不主张 F2 不存在——我主张它不再是单点。Q4 的可判别性在 `getStatus` 被禁的世界里 **依然成立**，成本是判态逻辑从「读字段」变成「读 `getTree` 自身的拒绝码」。这直接改变 `code-owner-settings` 的 N2 该怎么写。
  2. **请 `code-owner-electron` 就三件事作权威答复**（都在其边界，我只能读到形状）：(a) shipped 配置下 `getStatus()` 究竟 resolve 还是 reject（E-D6 的推断）；(b) `createContextV2Error` 的 `` `[${code}] ${message}` `` 线格式与「码字符集恒为 `[a-z0-9_]`」是否是其愿意承诺的 **稳定契约** ——我的 `parseContextV2ErrorCode` 完全建在这两条上（E-D4）；(c) `memoryV2Readiness`（`service.js:1068`，`code-owner-runtime` 已指出它存在且未暴露）**是否会被暴露给 renderer**。(c) 是我 Q2 表态的 P3 前置。
  3. **请 `code-owner-runtime` 确认码字符集的产端半边**：我实测其 V2 面 42 个码 **全部** 符合 `[a-z0-9_]+`（E-D5）。请其确认这是有意的约定还是巧合。**若是巧合，我这层的保真在下一个新码上就可能静默失效**（落 `null` → 消费方 `|| 默认码` → 静默错归因，不报错）。
  4. **请本庭把 `context_v2_unavailable` 的双重语义记为一条新增已知缺口**（E-D5）：我的 facade 为「bridge 缺席」自造它，sidecar 在 9 个非测试点也发它、其中 `route_memory_v2.py:333` **就在读路径上**。前案未问过这一条。
  5. **请 `code-owner-chat-bubble` 知情一条与其直接相关的事实**：`listSpaces` 的既有消费者 `memory_v2_pending_reviews.js:800-802` 用 `Array.isArray(spacePayload?.spaces) ? … : []` 把「没有 space」与「载荷畸形」折叠成同一个空数组——**`code-owner-settings` 的 C1 所警告的那个缺陷，在第一跳上今天已经存在**。我只登记，处置权归其边界。

- **评估结论**: 逐问见正文四节 + Q2 一节 + 可证伪一节。总括：**甲 = 可接受（零代价），但 F2 的杠杆被部分证伪；乙 = 保真且解析面开放，一处码碰撞；丙 = 两跳完整、第一跳已有消费者、两个「空」在我这层结构上不区分（设计如此）；丁 = 无结构性障碍、零改动；Q2 = 落我边界成立，我接，附 P1/P2/P3 三前置与一条对 `expert-security` 的存续分歧。** 附约束 A1~A5。

- **边界命中依据**:
  - `pupu:src/SERVICEs/bridges/context_v2_bridge.js` —— 第一层路径机械命中（E-0002 / S-0003）。**这 125 行是 renderer 侧 V2 读平面的唯一实现**：我核实 `src/SERVICEs/api*.js` 对 `context_v2` / `contextV2` / `memory_v2` / `memoryV2` 的匹配数为 **0**（E-D2），即 `api.unchain.js` **不在** 本案链路上，不存在第二个 facade 可找。
  - `pupu:src/SERVICEs/runtime_events/**` —— 已登记，**本案不命中**。`memory_v2_trace_presenter.js` 处理的是流式 trace bundle，与 `/context/v2/**` 读平面无交集。写在这里是为了让本庭知道「shared-arteries 边界里有另一处叫 memory_v2 的东西，它不是这个」。
  - `pupu:src/CONTAINERs/**` —— **本案不命中**。`ConfigContext` 不携带 chat id，与 `code-owner-settings` E-B3 的完整性限制（其未穷举全部 provider）互补：我核实 `src/CONTAINERs/` 下只有 `config` 一个 provider（E-D2）。**故 settings 挂载点无法经 context 隐式取得 chat 上下文，E-B3 的那条限制可以关闭。**
  - `pupu:src/locales/**` —— 附带项命中，见第五节。
  - **残余条款**：本案不产生任何落入残余的新文件。附带一条与 E-0002 相关的边界自愈信号，见第五节末。

- **受影响对象**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js` —— **若本案按我的结论推进，本文件零改动**。相关行：`:32-51` 18 方法白名单（`getStatus` 在 `:33`）· `:57` `ERROR_CODE_TOKEN_PATTERN` · `:59-67` `resolveApi` 全有或全无探针 · `:69-75` **自造 `context_v2_unavailable`（碰撞点）** · `:77-82` `parseContextV2ErrorCode` · `:86-94` `invokeBridge` · `:102` `getStatus` · `:107` `listSpaces` · `:108` `getTree`
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.test.js` —— **零改动**。锁定项：`:39-56` facade 键集恒为 `isAvailable + 18` 且 `toHaveLength(18)` · `:93-99` / `:155-160` 缺任一方法即 fail-closed · `:162-177` 不吞码 · `:179-189` 同步抛转拒绝 · `:191-196` 码解析。**新增消费者不动其中任何一条；新增 *方法* 会同时动三条。**
  - **条件性影响（仅当 Q2 落我）**：`src/SERVICEs/bridges/` 下新增一个模块 + 其测试。**不写进 `context_v2_bridge.js` 本体**，理由见 Q2 一节。
  - `/Users/red/Desktop/GITRepo/PuPu/src/locales/*.json`（11 个）—— 条件性，仅当方案庭审新增文案。今天 `memory_inspect` 命名空间 13 键 × 11 locale，键集完全对等（E-D9）。
  - **跨边界，仅登记不主张**：`electron/main/services/unchain/service.js:120,186-212,1733-1782,1892-1986`（`code-owner-electron`）· `unchain_runtime/server/route_memory_v2.py:259,333,388,504,591,719,804,856` 与 `memory_v2_runtime.py:702`（`code-owner-runtime`）· `src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:736,782,800-802` 与 `memory_v2_journal_reload.js:274`（`code-owner-chat-bubble`）

- **约束**:
  - **A1 · facade 不得长出校验、载荷归一、缓存、重试或去重。** 文件头 `:6-9` 写死「performs NO validation of its own（main is the single validating boundary — a second, drifting copy of the rules here would be worse than none），holds NO state，touches NO localStorage」，并由 `:39-56` 与 `:74-90` 两条测试守护。**tree view 若需要这四样中的任何一样，须落在调用方或一个新模块，不落 facade。** 有人要求写进 facade，我以 `OBJECTION` 反对。
  - **A2 · 不得新增 facade 方法。** 本案的读序列（`listSpaces` + `getTree`）与判态所需（`getStatus`）**三个方法今天全在**。新增方法会同时动 18 方法锁、preload 面与 IPC 面，并按其触发条件把 `expert-security` 拉进本案——而 S-0003 的不传唤判定正是建立在「本案不增删改任何 IPC channel 或 bridge 面」上。**零新增方法是这条判定继续成立的条件，也是本案保持在当前 quorum 上的条件。**
  - **A3 · 判态不得只读 `getTree` 的载荷字段，也不得只读 `getStatus` 的字段。** 前者无判别位（settings E-B5 / runtime E-A4 a）；后者在最需要它的那一态里不返回字段而是抛（E-D6）。**唯一结构上成立的判据是「调用的成败 + 拒绝码」**，见 E-D7。我支持 `code-owner-settings` N2 的两个否定半（不得用载荷、不得用 `enable_memory_v2`），**反对其肯定半的排他性**（「必须来自 `getStatus`」）。
  - **A4 · 未知码必须落第三态，永不落「空」。** `parseContextV2ErrorCode` 对不符字符集的码返回 `null`，而今天 **三个既有消费者一律写成 `parseContextV2ErrorCode(error) || "<自己的默认码>"`**（`memory_v2_journal_reload.js:274` · `use_chat_stream.js:3920,4013`）——**`null` 会被静默替换成一个看起来合理的默认码，不报错、不落日志**（E-D4/E-D5）。这是我这层最真实的失真面，任何新消费者必须显式处理 `null`。
  - **A5 · tree view 若挂进 Inspector 现有 5s 静默轮询，须有 in-flight guard 且静默轮次的失败必须可见。** 今天三个 V2 消费者 **零轮询**（E-D8），tree view 会是 V2 读平面的第一个轮询消费者，代价是 **2 次 IPC/tick × 每个打开的 modal**；而我的 facade **无缓存、无去重、无 in-flight 合并**（`:24-25` 明写「never cache module-level state」）——**限流纪律 100% 在调用方**。叠加 settings E-B7 所述「静默轮次的 `.catch` 被 `if (!silent)` 整个吞掉」，后果是 **我这一层的失败对用户与对日志同时不可见**。

- **建议处置**:
  1. **判为「可行」并进入方案庭审**，我这一侧不设前置阻塞。**但请把 A3 与 E-D7 写进裁定文本**——判态处方从「读 `getStatus` 的字段」改为「以调用成败 + 拒绝码为准，`getStatus` 作为补充而非唯一支点」。写错了这一条，方案会去要一个后端不打算给的判别位。
  2. **把 Q2 的落点指派做成方案庭审的准入条件**，与 `code-owner-settings` 的建议一致，**但我在此处比它多走一步：我明确认领，并给出条件**（见 Q2 一节）。请 `chief-judge` 就 P1/P2/P3 三条与 `expert-architecture` 的落位意见一并裁。**我不接受「五份拷贝」这个空选项。**
  3. **请本庭在第三层门禁重判是否补传 `code-owner-chat-bubble` 对 E-D5 码碰撞与 E-D8 第一跳折叠的知情**——它已在名单内（S-0003 #7），我只是把两条新事实指给它。
  4. **附带项按事实登记即可，不需处置**（第五节）。

---

## 一 · 甲 —— F2：Inspector 成为 `getStatus()` 的第一个 renderer 消费者，我是否接受

### 1.1 直接回答：**接受，且代价为零**

三条独立理由，都在我边界内可核（E-D3）：

**(a) `getStatus` 今天不是「休眠方法」，它已经是承重的。** 它在 `REQUIRED_METHODS`（`:33`）里，而 `resolveApi()`（`:59-67`）要求 **18 个方法全部存在** 才返回 api。也就是说：**如果 preload 没有 `getStatus`，今天三个 chat-bubble 消费者就全部会因为 `isAvailable()` 为假而集体失明。** 它早已是可用性判定的成立条件之一，只是没人调过它。**新增一个调用点不新增任何暴露面。**

**(b) 我的测试今天就在调它。** `context_v2_bridge.test.js:129-131` 断言 bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝；`:151-152` 断言安装后 `getStatus()` 转发且 **不带参数**。**调用路径已被覆盖，新增消费者不需要我改一行测试。**

**(c) 它是这 18 个方法里权限最低的一个。** 零参数（`:102` `invokeBridge("getStatus", [])`），不携带 owner scope、不携带 path/port/token，返回是主进程 8 字段 allowlist 投影且被 `service.js:1942-1944` 的 count-free 注释写成不变量。**我完全同意 `code-owner-settings` 的 N3：不得请求在它上面加计数或「有无数据」位。** 那会把一个零权限探针变成枚举 oracle。

**故：我不反对。零 diff。** 这一条我表态完毕。

### 1.2 但 F2 的 *前提* 我部分证伪 —— 而这比 F2 本身重要

`code-owner-settings` §2.2(b) 写：「`available:false` / `rolloutMode:"off"` / `featureCeiling:"off"` 就是『未启用』。它是 renderer 今天能拿到的、唯一不靠猜的启用态信号。」

**读主进程控制流，`getStatus()` 有三种互不相同的出口，而上面那句只覆盖了其中一种**（E-D6）：

| 出口 | 触发条件（`service.js`） | renderer 侧观察到什么 |
|---|---|---|
| **(i) resolve 合成负值** | `:1946` `unchainStatus !== "ready" \|\| !unchainPort` —— **sidecar 根本没起来** | `{available:false, rolloutMode:"off", featureCeiling:"off", …}`，**且一次请求都没发**（`context_v2_service.test.cjs:249-288` 有测试锁定） |
| **(ii) resolve 真值** | sidecar 起来了且 `/status` 回 200 | 8 字段真实投影（runtime E-A6 S3 观察到 `pupu_legacy` 下 200 + `rollout_mode:"off"`） |
| **(iii) reject** | sidecar 起来了但 `/status` 非 2xx | 抛 `[context_v2_store_disabled] context v2 request failed`（runtime E-A4 b3 观察到 `store_owner=off` 时 `/status` 自身 **503**） |

关键在于 `contextV2Request` 的就绪门（`:1897-1906`）对 `/status` **显式豁免**（第一个条件 `endpoint !== …/status`），所以 `/status` 一定会真的发出去；发出去撞上 503，`readJsonResponse`（`:1740-1771`）就抛，`:1931-1939` 再包成 `[code] …` 抛给 renderer。

**净效果：在「未启用」这个最需要判别的态里，`getStatus()` 走的多半是 (iii)，即 *抛错*，而不是 resolve 出 `available:false`。** 也就是说 `code-owner-settings` 想用 `getStatus` 避开的那件事——「catch 503 再匹配 `error.code` 字符串」，`code-owner-runtime` Q2(1) 称之为「把状态契约建在错误消息上」——**用 `getStatus` 一样避不开。**

**这一段是推断，不是观察**（见不确定性二），归 `code-owner-electron` 确认。**我已核实它无测试守护**：`context_v2_service.test.cjs` 只锁了出口 (i)（`:249-288`）与出口 (ii) 的字段投影（`:210-247`），**没有任何测试覆盖 `/status` 非 2xx 的 (iii)**。

### 1.3 而这把 F2 从「唯一无绕行」降级为「两条路里较贵的一条」

因为 **`getTree` 自己就是一个判别器**（E-D7）。结构论证，不依赖具体码：

> **`getTree` resolve ⟺ 读真的发生了。** 主进程对数据调用 **没有** `getStatus` 那种「短路成合成负值」的分支——`:1946` 的短路是 `getContextV2Status` 独有的，`getContextV2Tree`（`:2108-2116`）没有对应物，它要么走完 `contextV2Request` 拿到 200 载荷，要么抛。
> **`getTree` reject ⟹ 读没发生**，且拒绝码说明为什么没发生。

再叠上 `code-owner-runtime` 已实跑钉死的一条：**后端不存在「store 关着却回 200」这种出口**（E-A4：`store_owner=off` → 503 `context_v2_store_disabled`；`store_owner` 非法 → 503 `context_v2_store_owner_invalid`；`UNCHAIN_DATA_DIR` 缺 → 503 `context_v2_unavailable`）。

**结论：**

| 用户面状态 | 单次 `getTree` 的观察 |
|---|---|
| 已启用 · 空 | **resolve**，`entries: []` / `tree: []` |
| 已启用 · 有数据 | **resolve**，`entries` 非空 |
| 未启用（store off） | **reject** `context_v2_store_disabled` |
| 已启用但降级 | **reject** `context_v2_readiness_failed`（`:1902`，仅当 `effectiveMode !== "off"`） |
| bridge 缺席 | **reject** `context_v2_unavailable`（我的 facade `:69-74`） |

**空态与未启用态落在 `resolve` / `reject` 两个不相交的分支上。** 所以：

> **即便 F2 成立（`getStatus` 被禁），Q4 也不塌回不可判别。** 处方变成「以数据调用自身的成败与拒绝码判态」，`getStatus` 退为 **补充信号**（它能进一步区分 (i) sidecar 没起来 与 (iii) store 关着，而 `getTree` 在这两种情况下的拒绝码可能不同也可能相同——这一格我未核实）。

**我不主张 F2 应当被删除**，它对「判态的形状」仍有影响。**我主张它不该被记为「唯一会把结论推到不可行且无任何绕行方案」的那一条。** 请本庭据 E-D7 下调其定性。

**对 `code-owner-settings` N2 的具体修订建议**（其边界，我只提议不主张）：把「必须来自 `getStatus()`」改为「**必须来自服务端权威信号——数据调用的拒绝码，或 `getStatus`；不得来自载荷字段，不得来自 `enable_memory_v2`**」。两个否定半我完全支持，尤其 `enable_memory_v2` 那一条——**我的记忆里有独立复跑过的一条相邻事实**：`enable_memory_v2` 在全部 18 个 tag 上出现 0 次，Memory V2 从未随任何发布出厂，其 flag 取值也不由仓库决定（`.local/build_feature_flags.snapshot.json` 不入库、无历史）。**拿它冒充 store 状态既是造假状态源，也是查了一个查不出东西的地方。**

---

## 二 · 乙 —— 错误码穿过我这一层是否保真

### 2.1 完整传输链（E-D4），逐段核实

```
sidecar          {"error":{"code":"<code>","message":"<msg>"}} + 非 2xx
  ↓ readJsonResponse            service.js:1746-1757  取 parsed.error.code 原样 trim → error.code
  ↓ contextV2Request catch      service.js:1931-1939  code 保留；**message 被换成静态串**
  ↓ createContextV2Error        service.js:186-190    new Error(`[${code}] ${message}`); error.code = code
  ↓ ipcMain.handle                                    **剥掉 error.code**，只留 message，并加前缀装饰
  ↓ preload bridge              纯 ipcRenderer.invoke 透传，不重包、不归一
  ↓ parseContextV2ErrorCode     context_v2_bridge.js:57,77-82   /\[([a-z0-9_]+)\]\s/ 取回码
```

**`:1931-1939` 是这条链最关键的一段，值得逐字引用**——它是「码保真、消息不保真」的成因：

```js
// readJsonResponse surfaces the sidecar's stable error code; keep it and
// re-wrap so the renderer only ever sees "[code] static message".
const code = error && typeof error.code === "string" && error.code
    ? error.code : "context_v2_failed";
throw createContextV2Error(code, "context v2 request failed");
```

**即：sidecar 的码原样穿过，sidecar 的 message 被丢弃。** 这正是我这层的字符集锁（`:53-56` 注释）能成立的原因——**消息里不可能再有用户内容，所以括号 token 不会假命中**。

### 2.2 实测：**原样到达，包括穿过 ipcMain.handle 的装饰**（E-D4）

我对 10 个码（runtime 点名的 7 个 + 我自造的 `context_v2_unavailable` + 主进程自造的 `context_v2_readiness_failed` / `context_v2_unreachable` / `context_v2_failed` / `context_v2_missing_auth_token`）各跑两遍：直接 wrap，以及套上 `Error invoking remote method '…': Error: ` 装饰。**20/20 全部原样取回。** 正则未加锚定，前缀装饰不影响。

### 2.3 解析面是 **开放** 的，不是封闭的 —— 这对 Q4 是好消息

**`parseContextV2ErrorCode` 没有白名单。** 它按字符集抽取，返回它看到的任何 `[a-z0-9_]+` token。所以：

- **未知码不会被丢弃，会原样到达收端。** 我实测 sidecar 的 V2 面共 **42 个互不相同的码，全部符合 `[a-z0-9_]+`**（E-D5）。**加上主进程自造的 5 个，收端今天可能看到 47 个码，全部可解析。**
- 这是刻意的：facade 头 `:6-9` 明写「a second, drifting copy of the rules here would be worse than none」。**在我这层维护一份码白名单 = 每加一个后端码就多一处静默失配。**

**「未知码落到哪」——这是本节唯一的实质缺陷，答案是「落到调用方的默认码，静默地」**：

```
memory_v2_journal_reload.js:274   parseContextV2ErrorCode(error) || "context_v2_journal_unavailable"
use_chat_stream.js:3920, 4013     parseContextV2ErrorCode(error) || "context_v2_failed"
```

`null` 与「解析出一个码」在这三处 **写法上不可区分**。所以失真只在一种情况下发生：**码不符字符集** → 返回 `null` → 被 `||` 替换成一个看起来合理的码 → **不报错、不落日志、用户面看到一个错误的归因**。我实测的漂移样本：

```
"context-v2-store-disabled" → null      "CONTEXT_V2_OFF" → null
"context.v2.off"            → null      "v2Disabled"     → null
"store_disabled_2"          → "store_disabled_2"   （符合字符集，正常穿过）
```

**故 A4：任何新消费者必须显式处理 `null`，不得用 `|| 默认码` 把它吞掉。** 并请 runtime 确认「42/42 符合字符集」是约定还是巧合（请求 3）。

### 2.4 一处实质碰撞：`context_v2_unavailable`（E-D5）

**我的 facade 为「bridge 缺席」自造这个码**（`:69-74`）。**sidecar 在 9 个非测试点也发这个码**：`route_memory_v2.py:259,333,388,504,591,719,804,856` + `memory_v2_runtime.py:702` + `memory_v2_store.py:1527`，语义是「Context V2 storage is not configured」（`UNCHAIN_DATA_DIR` 未配置，503 + `retryable: true`）。

**`route_memory_v2.py:333` 就在 `_read_runtime_for_store_owner` 里——即 `get_tree` 的读路径上。** 所以这不是理论碰撞。

碰撞后果：收端拿到 `context_v2_unavailable` **无法区分**「renderer 侧 preload 没装上」与「sidecar 侧没配数据目录」。理论上还有一个区分位——**我本地造的 error 保留 `error.code` 属性，穿过 IPC 的那个被剥掉了**——但没有任何消费者读 `error.code`，且依赖这个是隐式契约，我不推荐。

**这对本案的影响是有界的**：两种语义都是「第三态 / 未知」，都不是「空」，所以 **不影响 Q4 的空/未启用二分**。但它确实使「第三态里到底出了什么事」不可判，**且本案会把它从 3 个消费者扩到 5 个**。我按新增缺口报给本庭（请求 4），**不在本阶段主张修**——修法（给我的自造码改名）会破坏两个既有 chat-bubble 消费者的码处理，破坏面非零（见可证伪 D-F4）。

---

## 三 · 丙 —— 两跳读序列在我 facade 上是否完整

### 3.1 现状复核（E-0006 行号复核通过，E-D2）

```
src/SERVICEs/bridges/context_v2_bridge.js
  :38  "listSpaces"    ← REQUIRED_METHODS
  :39  "getTree"       ← REQUIRED_METHODS
  :107 listSpaces: (payload) => invokeBridge("listSpaces", [payload])
  :108 getTree:    (payload) => invokeBridge("getTree",    [payload])
```

**两跳都在，两跳都是纯透传**：不校验参数（`spaceId` / `ownerChatId` 在我这层一律不看）、不改载荷、不归一返回。**payload 逐字节到达 preload**——这条被 `context_v2_bridge.test.js:74-90` 以另一个方法锁定，机制同一。

### 3.2 一条对记录的修正：**第一跳不是新消费者**（E-D8）

`code-owner-runtime` 说「`listSpaces` 全链路已通」，`code-owner-settings` E-B4 说「`spaceId` 的来源我未核实」。**我这层能给出比两者都强的一条**：

```
src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:782
    contextV2Bridge.listSpaces({ ownerChatId: owner })
```

**`listSpaces` 今天已有一个活的生产消费者**，在 `Promise.all` 的四路之一（`:766-783`），以 `ownerChatId` 为唯一入参，结果被消费在 `:800-802` 与 `:826-834`（`space_id` → `revision` 的 Map）。

**净效果，请本庭记入**：`case.md` 与 `FRAMING` 的「第一个 `getTree` 消费者」这个表述可以再收窄一格 —— **本案新增的是「两跳读序列中第二跳的第一个消费者」，第一跳今天就在跑。** 这使 Q1 的风险面比目前记录的还要小一档。

### 3.3 两个不同语义的「空」，在我这一层是否可区分

**直接回答：在我这一层 *不可区分*，因为我这一层 *不区分任何东西*。这是设计，不是缺陷。**

- `{"spaces": []}`（会话从未调过 memory 工具，第一跳，runtime E-A6 S1 实测 200）与 `{"entries": [], "tree": []}`（有 workspace 但空，第二跳，runtime E-A4 a 实测 200）—— **它们是两个不同调用的两个不同形状**，我逐字返回，**所以在 *调用点* 上它们是平凡可区分的**（不同的 promise、不同的键）。
- 但 **我的 facade 里没有任何东西把「第一跳空」和「第二跳空」映射成一个概念**。谁调谁 join。这与 A1 一致：facade 无状态、无归一。

**这一条推出一个对方案有实质约束力的结论**：

> **判态逻辑必须是一个跨两跳的状态机，不是两个独立的 try/catch。** 第一跳空 ⟹ 第二跳 **根本不会被发出**（没有 `spaceId`），于是「未启用」这个态在第一跳空的路径上 **永远不会被 `getTree` 观察到**——它只能由第一跳自己的成败与拒绝码给出。而 runtime E-A6 S4 已实测：`store_owner=off` 时 **`listSpaces` 也返回 503 `context_v2_store_disabled`**。
>
> **所以 E-D7 的判别结构在第一跳上同样成立，而且必须在第一跳上先跑一遍。** 这是我对 `code-owner-settings` §2.2 那个「两次调用的 join」的具体化：**join 的两次不是「`getStatus` + `getTree`」，而是「`listSpaces` + `getTree`」，且 `getStatus` 是可选的第三次。**

### 3.4 既有第一跳消费者的处理方式，登记一条不利事实

```
memory_v2_pending_reviews.js:800-802
    spaces: Array.isArray(spacePayload?.spaces)
      ? spacePayload.spaces.slice(0, MAX_PENDING_ITEMS * 2)
      : [],
```

**「没有 space」与「载荷畸形 / 键缺失」在这里折叠成同一个空数组。** 这正是 `code-owner-settings` C1 所警告的形态（「不得以『载荷里没东西』作为 empty 的唯一判据」），**它在第一跳上今天已经存在**。归 `code-owner-chat-bubble`，我只登记（请求 5）。**tree view 不得复制这个写法。**

---

## 四 · 丁 —— Q1 我端的现状核实

### 4.1 `getTree` 的转发形状与参数校验

`:108` `getTree: (payload) => invokeBridge("getTree", [payload])`。**零校验。** 我不看 `ownerChatId`，不看 `spaceId`，不看类型。校验在主进程（`service.js:2109-2110` `requireContextV2OwnerChatId` + `requireContextV2Identifier(spaceId, "spaceId")`），**这是刻意的单一校验边界**（facade 头 `:6-9`）。

**对本案的直接后果**：`code-owner-settings` 的 N1（「不许在 modal 内部推导 `ownerChatId`」）**在我这层没有任何强制手段可以帮它**——我不会挡下一个语义错误的 owner id，主进程的正则也不会（其 E-B2 实跑证实 `character_foo__dm__main` 通过校验）。**N1 只能靠挂载点契约与代码评审保证，我这层不提供防线。这一条我确认，且不打算改——加一层校验就是造第二份漂移规则（A1）。**

### 4.2 `invokeBridge` 的失败模式（`:86-94`）——三种，全部有测试

| # | 触发 | 行为 | 测试 |
|---|---|---|---|
| 1 | `resolveApi()` 返回 `null` | **本地** reject `context_v2_unavailable`，**一次 IPC 都不发** | `:127-131` |
| 2 | preload 方法 **同步抛** | `try/catch` 转成 rejection（不让同步异常逃逸出 promise 契约） | `:179-189`（正好用 `listSpaces` 举例） |
| 3 | preload 返回的 promise reject | **原样透传，不吞、不重包** | `:162-177` |

**模式 3 是 Q4 收端可判别性的物理基础**——facade 不吞码，所以 E-D7 的判别结构在我这层不会被削掉。

### 4.3 一条需要登记的结构事实：**全有或全无的可用性探针**

```
:59-67  resolveApi()  → 对 18 个方法逐个 typeof 检查，缺任何一个即返回 null
```

**后果**：一个缺任意方法的 preload（例如版本不匹配）会让 **整个 facade 不可用**，包括 `getTree`。这是刻意的 fail-closed（`:97` 注释「a stale preload (pre-schema-v4) must not look usable」，测试 `:93-99` 与 `:155-160`），**但代价是 `isAvailable()` 是一个粗粒度信号，说不出「哪个能力缺了」**。

新增第 5 个消费者 **继承** 这个性质，**不加重也不减轻**。登记是因为它是「第三态为什么必然存在」的结构性原因之一，方案庭审设计判态时会用到。

### 4.4 无第二个 facade（E-D2）

`grep -ln "context_v2|contextV2|memory_v2|memoryV2" src/SERVICEs/api*.js` → **零命中**。**`api.unchain.js` 不在本案链路上。** renderer 侧 V2 读平面 = 这一个 125 行模块。登记以免有人去 `api.*` 找第二条路。

### 4.5 Q1 直接回答

> **新增 Inspector 作为第五个消费者，在我边界内有无结构性障碍？** —— **无。零改动。**
> 需要的三个方法（`listSpaces` / `getTree` / `getStatus`）**今天全在白名单里、全被测试覆盖、全是纯透传**。新增消费者是一次纯加法 import，不动 18 方法锁（`:39-56`）、不动 preload 面、不动 IPC 面。
> **这也正是 S-0003 对 `expert-security` 不传唤判定继续成立的条件**（A2）：本案不增删改任何 bridge 面。**一旦方案要求新增 facade 方法，该判定即须重判。**

---

## 五 · Q2（G1）· 强制表态 —— 四态判定落我边界内是否成立

### 5.1 直接回答：**成立。我认领。** 但附 P1/P2/P3 三个前置，缺一我不接

**为什么成立——三条，按强度排序：**

**(a) 它字面就是我 charter 的定义：多方消费、单点定义。** 今天的消费方已经跨三个 owner：`chat-bubble` 三个文件、`chat-core` 一处（`use_chat_stream.js:3920,4013`）、`memory-inspect` 一处（settings 点名的第 4 份，V1 口味）。**本案要造第 5 份，且是第一份需要同时讲两种语义的。** 五个消费者三个 owner 一份定义——**这就是公共动脉的形状，不是我在扩权。**

**(b) 物理上它必须紧挨 `parseContextV2ErrorCode`。** 该映射的 **唯一** 输入是码 token，而码 token 的抽取规则（`ERROR_CODE_TOKEN_PATTERN`，`:57`）在我这里。把映射放到别处 = 在两个 owner 手上各留一份对码词汇表的理解 = **facade 头 `:6-9` 明令禁止的「第二份漂移拷贝」**。这不是偏好，是那段注释的直接推论。

**(c) 我已经在为它的失真面负责了。** A4 描述的 `null → || 默认码` 静默错归因，今天是三个消费者各自踩的坑；**它的根因在我这层的返回契约（`null` 与「有码」同型）**。要么我改契约，要么我提供一个不让人踩的映射函数。**后者更便宜，而且它就是那个无主构件。**

### 5.2 代价（我如实报，不美化）

1. **新建一个模块 + 测试**，落 `src/SERVICEs/bridges/`（例如 `context_v2_state.js`），**不写进 `context_v2_bridge.js` 本体**——否则 `:39-56` 那条「adds nothing of its own」的测试就变成一句假话，而那条测试是本案 `expert-security` 不到场的依据之一（A2）。这部分代价小。
2. **真正的代价是迁移 4 份既有实现**：3 份在 `code-owner-chat-bubble`，1 份在 `code-owner-settings`。**我能定义，不能单方面迁。** 这是一次 Full track 跨 owner 改动，两个 owner 必须同案到场。**若只落定义不做迁移，结果是 5 份变 6 份**——比不做还坏。**所以「落我这里」与「迁移四份」是一个包，不能拆。**
3. **长期负债我知情接受**：我会成为每一个新 V2 码的收敛点。**今天 sidecar 侧 42 个、主进程侧 5 个，产端还在长**（E-D5）。我接这个负债，但它必须以 P1 为条件。

### 5.3 三个前置条件（缺一我不接，并指名替代 owner）

**P1 · 判据（码词汇表）的权威留在产端。** 我做的是「码 → 用户可见状态」的映射；**我不决定有哪些码、每个码在源头意味着什么**。码归 `code-owner-runtime`（42 个），线格式与 5 个主进程自造码归 `code-owner-electron`。**若有人要把「码的语义权威」也塞给我，我拒绝**——那是在 renderer 重新推导 sidecar 的规则，正是 `:6-9` 点名的反模式。

**P2 · 映射必须 fail-closed，未知一律落第三态，永不落「空」、永不落「就绪」。** 这一条我 **必须挑明它是一处存续分歧，不是已了结的事项**：**在 `0000-0003-2026-0807#S-0024` D6 ② 上，我与 `expert-security` 就 P0 不变量有过分歧，该案 `awaiting-ruling`，分歧未决。** 我在本案 **不改变立场**：fail-closed-to-unknown 是这个映射的 P0 不变量。**若裁定要求 fail-open（例如为了界面更顺，把未知当作「空」），我不承接这个模块**——因为那时它是一个「被设计成会撒谎」的构件，而我要长期为它的每一个新码负责。**这不是技术不可行，是我不接这个 owner 身份。** 请 `chief-judge` 显式回应，**不要让它默认继承前案的未决状态**。

**P3 · 主进程半边先定：`memoryV2Readiness` 暴不暴露。** `code-owner-runtime` 已查明 main 里存在一个半成品单一状态源 `memoryV2Readiness`（`service.js:1068`，形状 `{status, reason, sidecarFingerprint}`，由 `verifyContextV2Readiness` 与 `getContextV2Status` 两处写入，我在 `:1874-1878` 与 `:1969-1973` 复核到），**且它没有以该名字暴露给 renderer**。**若它日后被暴露，我的模块一夜之间变成第二个权威。** 所以：要么 `code-owner-electron` 暴露它、我的模块消费它；要么裁定明示它不暴露、我的模块是唯一权威。**在这两者之间造模块 = 掷硬币赌它会不会变成第 6 份拷贝。**（请求 2(c)）

### 5.4 若 P1~P3 不满足，谁该拿 —— 我指名 `code-owner-electron`

理由是它已经握着三样我没有的东西：**既有的 `memoryV2Readiness`**、**码的铸造权**（`createContextV2Error`）、**线格式**（`` `[${code}] ${message}` ``），而且它已经在把传输失败归一到一个稳定小集合（`:1914-1922`、`:1931-1939`）。**一个主进程侧的单一状态比 renderer 侧的派生更权威。**

**代价对比，我如实给两边**：

| | 落我（renderer 派生） | 落 electron（main 单一状态） |
|---|---|---|
| 权威性 | 派生的，可能与 main 的既有状态冲突 | **权威的，与 `memoryV2Readiness` 同源** |
| 新增暴露面 | **零**（不加方法，A2 成立） | 需新增 IPC / bridge 面 → **触发 `expert-security` 触发条件，本案 quorum 须扩** |
| 迁移成本 | 4 份拷贝，跨 3 owner | 同样 4 份，且还要跨进程边界 |
| 谁为新码负责 | 我 | electron + runtime |

**我不主张哪一个更好——落位是 `expert-architecture` 的判断，我两个都实现得了。** 我主张的只有一条：

> **我不接受「五份拷贝」这个空选项。** 若方案庭审开庭时该构件仍无 owner，我与 `code-owner-settings` 的立场一致：**届时构成阻塞。** 现在写下来是为了它届时不算意外。

### 5.5 G1 是否构成进入方案庭审的前置阻塞 —— **不构成**

我这一节全部结论是当前 revision 上的代码形状与一次本地正则实测，**在 16 项强制回应的任何组合下都不变**。**唯一的例外是 P2**：它 **正是** 前案 D6 ② 那条未决分歧的延续，前案对它的裁定会直接决定我接不接。**但那影响的是 owner 归属，不是可行性。**

---

## 六 · 丙（框定第三条）· 可证伪形式 —— 我的「可行」在什么条件下翻成「不可行」

**任一条成立即翻，请本庭逐条登记为方案庭审的检查点：**

| # | 推翻条件 | 翻转成 | 谁能证伪 |
|---|---|---|---|
| **D-F1** | 裁定要求「未启用」必须由 **一次调用的载荷字段** 读出（不许用拒绝码、不许跨调用 join） | **不可行**。我这层传输的是码，不是字段；载荷判别位要 sidecar 新增，而 runtime 已把它标为 Q0 子问题并预先不主张现在做 | `chief-judge` 裁定 + `code-owner-runtime` |
| **D-F2** | 要求在 `context_v2_bridge.js` 里加校验 / 载荷归一 / 缓存 / 重试 / 去重 | **我判结构上不可接受**，以 `OBJECTION` 反对。违反 `:6-9` 契约与 `:39-56`、`:74-90` 两条测试；造第二份漂移规则 | 方案庭审 |
| **D-F3** | `code-owner-electron` 或 `code-owner-runtime` 表示 `` `[${code}] ` `` 线格式会变，或码字符集会突破 `[a-z0-9_]`（引入连字符 / 大写 / 点） | **乙 的保真结论翻转**。全部消费者经 `\|\| 默认码` **静默错归因**（A4）。Q4 收端在解析修好之前不可判别 | electron / runtime（请求 2(b)、3） |
| **D-F4** | 裁定把 `context_v2_unavailable` 的双重语义（我的「bridge 缺席」× sidecar 的「storage 未配置」）定为 **必须可区分**，且要求在我这层解决 | **不是不可行，但从「零改动」升级为跨 owner 破坏性改动**：给我的自造码改名会破坏 `memory_v2_journal_reload.js:274` 与 `memory_v2_pending_reviews.js:176-190` 的码处理，**`code-owner-chat-bubble` 须同案到场** | 本庭 + chat-bubble |
| **D-F5** | P2 被裁定为 fail-open（未知态可以呈现为「空」或「就绪」） | **可行性不变，owner 变**：我不承接该映射模块，指名 `code-owner-electron`。**这是我与 `expert-security` 在 `0000-0003-2026-0807#S-0024` D6 ② 上未决分歧的延续，我不回避也不撤回** | `chief-judge` 对前案 D6 ② 的回应 |
| **D-F6** | tree view 被挂进 Inspector 现有 5s 静默轮询，且无 in-flight guard、静默轮次失败仍被吞 | **我判结构上不可接受**（A5）。facade 无去重（`:24-25` 明写不缓存），2 次 IPC/tick × 每个打开的 modal；叠加 settings E-B7 的静默吞错，**我这层的失败对用户与日志同时不可见** | 方案庭审 |
| **D-F7** | 方案要求我对 **正常态**（有数据时）的载荷体积 / 序列化开销 / IPC 单帧上限给出承诺 | **我给不出**（G2）。需要一条造数据的路径（fixture 或真机灌数），否则验收标准里不得出现我这层的正常态性能条款 | 全体（G2 共有缺口） |

**同时登记「不会被推翻的」**（可作方案庭审的地基）：facade 三个方法今天全在且全被测试覆盖；不吞码（`:162-177`）；同步抛转拒绝（`:179-189`）；payload 逐字节透传；`api.*` 面零 V2 触点；`getTree` resolve ⟺ 读真的发生了（主进程无合成负值分支）。

---

## 七 · 附带 —— `src/locales/**` 边界的事实登记（不设计文案）

按要求 **只登记事实**：

1. **`memory_inspect` 是 `en.json` 的 *顶层* 命名空间，含 13 个键**（不是 12——`code-owner-settings` 第五节记为 12，**差一个**）。键集：`chunk_detail` · `empty_profile` · `jitter` · `load_failed` · `loading` · `no_conversation_text` · `no_vectors` · `no_vectors_chat` · `profile` · `profiles` · `title` · `title_long_term` · `vs`（E-D9）。
2. **11 个 locale 全部 13 键，键集完全对等**——零缺失、零孤儿（E-D9 逐 locale 比对）。
3. **没有任何自动化测试守护这个命名空间的对等性。** 我边界内的 `src/SERVICEs/boot_locale_parity.test.js` **只覆盖 `boot.*`**（其五个 test 全部围绕 boot 键，E-D9）。**`memory_inspect` 的漂移今天只能靠 `i18n-coverage` skill 人工发现。**
4. **文案增量的量级、措辞、四态 × 两 view 的键结构——全部属方案庭审，我此处不主张。**

**一条边界自愈信号（附带，与 E-0002 相关）**：`summon.py` 把 `pupu:src/COMPONENTs/` 报为「未命中任何路径 owner」。**我的残余条款（`pupu:src/**` 中未被任何 owner 划走的部分）*不* 吸收它，也不应该吸收它**——`src/COMPONENTs/` 是一个跨 5+ owner 的目录 **前缀**，不是一个文件。残余条款的对象是文件，把一个多 owner 前缀塞进残余会把我变成事实上的全仓 owner，正是我 charter 明令要防的「默默收编」。**我支持 speaker 在 S-0003 第二节末提出的处置方向（收窄成可判定命题后再匹配），并确认它不该由残余条款兜底。** 交 `codex` 与 `chief-judge`。

---

## 八 · 留待方案庭审（自行标注，本阶段不作为结论）

- **`context_v2_unavailable` 改名的具体方案**（我的自造码换成例如 `context_v2_bridge_absent`）——技术上是我这层一行改动，但破坏面在 chat-bubble，属跨 owner 取舍，见 D-F4。
- **四态映射模块的 API 形状**（返回枚举 / 返回 `{state, code, retryable}` / 是否携带 `retryable` 位——注意 sidecar 的 `context_v2_unavailable` 带 `retryable: true` 而我的自造码不带，这个位今天在穿过 IPC 时 **是丢失的**，因为只有码进了消息 token）。
- **`getStatus` 是否作为 Inspector 的第三次调用**（E-D7 已证明它非必需，但它能进一步细分第三态）——这是「用户面要不要区分『sidecar 没起来』与『store 关着』」的产品取舍。

---

## 九 · 本 ASSESSMENT 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）**，与 E-0001 一致。全部只读，未改任何文件、未 commit、未起 sidecar、未跑应用。

### E-D1 | repository | 自证类
- **来源定位**: PuPu 工作树，`/Users/red/Desktop/GITRepo/PuPu`
- **取得方式**: `git rev-parse --short HEAD` · `git branch --show-current` · `git status --porcelain` · `git status --porcelain -- src electron unchain_runtime`，2026-08-08
- **支持/反驳**: **支持** E-0001 的承重部分（产品代码锚点与 HEAD 一致）；**部分修正** 其 dirty 计数
- **净内容**: `b2385d5d` / `dev`。dirty/untracked **12 条**（E-0001 记 8 条），新增 4 条为 `.claude/agent-memory/code-owner-shared-arteries/`（3）与 `0000-0005` 案卷（余）。**`git status --porcelain -- src electron unchain_runtime` 输出为空**——三个产品目录零 dirty
- **完整性限制**: 单次快照。庭审期间是否有并发会话改动产品目录，我未持续监视
- **证据类型判据**: 可由任何人在同一工作树直接复跑的 git 状态 → 自证类

### E-D2 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js`（全文 125 行）· 同目录 `context_v2_bridge.test.js`（全文 197 行）
- **取得方式**: 两文件整读；`grep -ln "context_v2\|contextV2\|memory_v2\|memoryV2" src/SERVICEs/api*.js`（**零命中**）；`ls src/CONTAINERs/`（**仅 `config`**）；`grep -c "cache\|inflight\|dedup" src/SERVICEs/bridges/context_v2_bridge.js`（**1，且是 `:24-25` 的注释 "never cache module-level state"**）
- **支持/反驳**: **支持** 丁全节与 A1/A2；**复核通过** E-0006 的 renderer facade 段行号（`:39,108`）；**关闭** `code-owner-settings` E-B3 的完整性限制（其未穷举 provider —— `src/CONTAINERs/` 下只有 `config`，不携带 chat id）
- **净内容**: `:32-51` 18 方法白名单（`getStatus` `:33` · `listSpaces` `:38` · `getTree` `:39`）· `:57` `/\[([a-z0-9_]+)\]\s/` · `:59-67` `resolveApi` 逐方法 typeof、缺一即 `null` · `:69-75` 自造 `context_v2_unavailable` · `:77-82` `parseContextV2ErrorCode` · `:86-94` `invokeBridge` 三失败模式 · `:102/107/108` 三个方法均纯透传。测试锁定：`:39-56`（键集 = `isAvailable` + 18，`toHaveLength(18)`）· `:74-90`（payload 逐字节）· `:93-99`/`:155-160`（缺任一方法 fail-closed）· `:127-131`（bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝）· `:151-152`（`getStatus` 无参转发）· `:162-177`（不吞码）· `:179-189`（同步抛转拒绝，以 `listSpaces` 举例）· `:191-196`（码解析，含 `"no code here" → null`）
- **完整性限制**: 静态阅读。**未运行 `react-scripts test`**，故「这些测试今天是绿的」我 **未验证**，只主张「测试文件里写着这些断言」
- **证据类型判据**: 仓内文件字面内容与行号，可在同 revision 直接复核 → 自证类

### E-D3 | repository | 自证类
- **来源定位**: `src/` 全目录
- **取得方式**（可复跑）: `grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"`；`grep -rn "contextV2Bridge\." src --include="*.js" | grep -v "\.test\.js"`
- **支持/反驳**: **独立复核并确认** `code-owner-settings` E-B6 第 3 点（`contextV2Bridge.getStatus()` 在 renderer 零消费者）；**补充** 它已是承重方法这一相反方向的事实
- **净内容**: `getStatus` 在 `src/` 非测试代码的全部足迹中，**属于 `contextV2Bridge` 的只有两处：定义 `context_v2_bridge.js:102` 与白名单 `:33`**。其余全部属于另外三个不相干的桥（`api.unchain` / `api.ollama` / `memory_vault_bridge`）或同名局部函数（`toast_host.js:89`）。**零调用点。** 同时：`contextV2Bridge` 的既有调用点共 12 处，分布于 3 个 chat-bubble 文件 + `use_chat_stream.js`，**无一处调用 `getStatus`**
- **完整性限制**: 只覆盖字面标识符 `getStatus`。未追经变量间接调用（如 `bridge[name]()`）
- **证据类型判据**: 可复跑 grep + 仓内文件 → 自证类

### E-D4 | tool-output | 须查类
- **来源定位**: 实跑于 2026-08-08，纯 `node -e`，无文件读写、无网络
- **取得方式**（**完整可复跑命令**）:
  ```bash
  node -e '
  const P = /\[([a-z0-9_]+)\]\s/;
  const parse = (m) => { const x = P.exec(m); return x ? x[1] : null; };
  const wrap = (code) => `[${code}] context v2 request failed`;
  const ipc  = (m) => `Error invoking remote method \x27context-v2:get-tree\x27: Error: ${m}`;
  const codes = ["context_v2_store_disabled","context_v2_invalid_request","context_v2_not_found",
  "context_v2_store_owner_invalid","context_v2_unchain_read_unavailable","context_v2_unavailable",
  "context_v2_readiness_failed","context_v2_unreachable","context_v2_failed","context_v2_missing_auth_token"];
  for (const c of codes) console.log(parse(wrap(c))===c, parse(ipc(wrap(c)))===c, c);
  for (const c of ["context-v2-store-disabled","CONTEXT_V2_OFF","context.v2.off","v2Disabled","store_disabled_2"])
    console.log(JSON.stringify(c), "->", JSON.stringify(parse(wrap(c))));
  console.log("no trailing char:", JSON.stringify(parse("[context_v2_store_disabled]")));
  '
  ```
  **实际输出**（节选）：10 个码 **直接 wrap 与穿过 ipcMain.handle 装饰各 10/10 全部 `true true`**；漂移样本 `context-v2-store-disabled`→`null` · `CONTEXT_V2_OFF`→`null` · `context.v2.off`→`null` · `v2Disabled`→`null` · `store_disabled_2`→`"store_disabled_2"`；`"[code]"` 无尾随字符 → `null`
- **支持/反驳**: **回答乙**（码从 sidecar 到 renderer 原样到达，含 IPC 装饰）；**支持** A4（漂移码落 `null`）
- **完整性限制**: **(1)** 这是对 **正则本身** 的实测，**不是对真实 IPC 链路的实测**——`wrap()` 与 `ipc()` 的字符串形状取自 `service.js:186-190` 与 Electron 的 `ipcMain.handle` 既有行为，**我未起 Electron 观察真实消息**。**(2)** `createContextV2Error(code, "")` 仍产出 `` `[code] ` ``（模板自带空格）故仍可解析；**唯一失配是 `]` 为消息最后一字符，而该形状 `createContextV2Error` 构造不出来**。**(3)** 未核实 Electron 版本间 `ipcMain.handle` 装饰前缀是否变化——但正则未锚定，前缀变化不影响
- **证据类型判据**: 由我编写的探针产出的运行时观察 → **须查类**

### E-D5 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/` 下 `route_memory_v2.py` · `memory_v2_runtime.py` · `memory_v2_store_boundary.py` · `memory_v2_unchain_read_adapter.py`；碰撞点 `route_memory_v2.py:259,333,388,504,591,719,804,856` · `memory_v2_runtime.py:702` · `memory_v2_store.py:1527`；我方 `src/SERVICEs/bridges/context_v2_bridge.js:69-74`
- **取得方式**（可复跑，须在 `unchain_runtime/server` 下执行）:
  ```bash
  grep -rhoE '"(context_v2|memory_v2)[a-zA-Z0-9_]*"' route_memory_v2.py memory_v2_runtime.py \
    memory_v2_store_boundary.py memory_v2_unchain_read_adapter.py | sort -u | tr -d '"' > /tmp/codes.txt
  wc -l < /tmp/codes.txt ; grep -vE '^[a-z0-9_]+$' /tmp/codes.txt
  grep -rn '"context_v2_unavailable"' --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  ```
  **实际输出**: **42** 个互不相同的码；**不符 `^[a-z0-9_]+$` 的：0 个**；`context_v2_unavailable` 在 **9 个非测试点** 发出，含 `route_memory_v2.py:333`（`_read_runtime_for_store_owner` 内，`store_owner=unchain` 且 `UNCHAIN_DATA_DIR` 未配置 → 503 + `retryable: True`）
- **支持/反驳**: **支持** 乙 §2.3（解析面按字符集开放，未知码原样到达）与 §2.4（码碰撞，且 sidecar 那一侧在读路径上）；**支持** A4；为请求 3 提供锚点
- **完整性限制**: **(1)** 只覆盖四个文件里 **以字面量出现** 的 `"context_v2*"` / `"memory_v2*"` 字符串，**未覆盖** 拼接构造或其他文件；**42 是下界不是全集**。**(2)** 这四个文件落 `code-owner-runtime` 边界，我 **只读引用**，「字符集恒定」是否为其有意约定 **须由其确认**（请求 3）。**(3)** `route_memory_v2.py:333` 在读路径上 —— 我据其行号与上下文（`if store_owner != STORE_OWNER_UNCHAIN: return _runtime()` 紧邻其上）判断，**与 `code-owner-runtime` Q1 门清单第 5/7 项一致，但运行时是否真被触发我未实跑**
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容 → 自证类。**但结论跨入他人边界，本条只作为「请 runtime 确认」的锚点**

### E-D6 | repository | 自证类（**结论为推断，见完整性限制**）
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:186-190`（`createContextV2Error`）· `:1733-1782`（`readJsonResponse`，尤其 `:1740-1771` 取 `parsed.error.code`）· `:1892-1940`（`contextV2Request`，尤其 `:1897-1906` 就绪门对 `/status` 显式豁免、`:1931-1939` 码保留 + 消息替换）· `:1945-1986`（`getContextV2Status`，尤其 `:1946-1957` 合成负值短路、`:1958` 真发请求）· `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:210-247, 249-288`
- **取得方式**: 定点读取上述行段；`grep -n "getStatus\|getTree\|listSpaces\|code\b" electron/preload/bridges/context_v2_bridge.js`（确认 preload 为纯 `ipcRenderer.invoke` 透传，`:42` `getStatus` · `:81` `listSpaces` · `:86` `getTree`，无重包无归一）；`grep -n "getContextV2Status\|store_disabled" electron/tests/main/context_v2_service.test.cjs`
- **支持/反驳**: **支持** 甲 §1.2（`getStatus()` 三出口，「未启用」态多半走 reject 而非 resolve）；**部分反驳** `code-owner-settings` E-B6 §2.2(b) 的读法；**支持** 乙 §2.1 的传输链
- **净内容**: `createContextV2Error(code, message)` = `` new Error(`[${code}] ${message}`) `` + `error.code = code`。`contextV2Request` 的 `catch`：`const code = error?.code || "context_v2_failed"; throw createContextV2Error(code, "context v2 request failed")` —— **码保留、消息替换**。就绪门 `:1897` 第一个条件 `endpoint !== …/status` 使 `/status` **必定真的发出**。`getContextV2Status` 只在 `unchainStatus !== "ready" || !unchainPort` 时短路成合成负值。**`context_v2_service.test.cjs` 有测试锁定短路分支（`:277-287`）与 200 分支的字段投影（`:210-247`），无任何测试覆盖 `/status` 非 2xx 分支**
- **完整性限制**: **(1)** 本条的 **结论**（shipped 配置下 `getStatus()` reject）是「我对 `service.js` 控制流的静态阅读」× 「`code-owner-runtime` E-A4 b3 的须查类观察」，**两者都不是产品运行观察，乘积只能是推断**。**(2)** `service.js` 与 `electron/tests/**` 落 `code-owner-electron` 边界，我 **只读引用**，权威结论归其所有（请求 2(a)）。**(3)** 未起 Electron、未观察真实 IPC 消息
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但明确标注为「推断」的结论部分不具此地位，不得作为事实引用**

### E-D7 | repository | 自证类（**与 `code-owner-runtime` E-A4 联合，其为须查类**）
- **来源定位**: `electron/main/services/unchain/service.js:2098-2116`（`listContextV2Spaces` / `getContextV2Tree`，**均无合成负值短路**）· `:1892-1940`（数据调用的唯一出口是 200 载荷或抛）· `:1946`（合成负值短路 **为 `getContextV2Status` 独有**）· `src/SERVICEs/bridges/context_v2_bridge.js:86-94, 107, 108`；**联合** `0000-0008-2026-0808` 本案 `code-owner-runtime` 的 E-A4（`store_owner=off` → 503 `context_v2_store_disabled`；空 store → 200）与 E-A6 S4（`store_owner=off` 时 `listSpaces` 亦 503）
- **取得方式**: 定点读取 + 与 runtime 已提交观察的联合推理
- **支持/反驳**: **部分反驳 F2**（`code-owner-settings` 称其为「唯一无绕行方案」的推翻条件）；**支持** A3 与丙 §3.3
- **净内容**: **`getTree` resolve ⟺ 读真的发生了**（主进程对数据调用无「不发请求就返回负值」的分支，该分支是 `getContextV2Status` 独有）；**`getTree` reject ⟹ 读没发生，且拒绝码说明原因**；后端不存在「store 关着却回 200」的出口。**故空态（resolve + `entries:[]`）与未启用态（reject + `context_v2_store_disabled`）落在两个不相交分支上，单次调用即可区分，不需要 `getStatus`。** 同一结构在第一跳 `listSpaces` 上同样成立（E-A6 S4）
- **完整性限制**: **(1)** 依赖 `code-owner-runtime` 的 E-A4 / E-A6，**该两条为须查类**（Flask `test_client`、鉴权替身、未起真实 sidecar），**其被推翻则本条随之被推翻**。**(2)** `store_owner=unchain` 分支 runtime 未能实跑，**该配置下 `getTree` 的实际码我完全未核实**。**(3)** 「主进程无合成负值分支」是我对 `:2098-2116` 与 `:1946` 的对读，归 `code-owner-electron` 确认
- **证据类型判据**: 仓内文件字面内容 + 对他人已提交证据的联合推理 → 自证类（就其代码事实部分）；**其结论强度受所联合的须查类证据约束**

### E-D8 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:734-736, 750-783, 800-802, 817-834`
- **取得方式**: `grep -rn "listSpaces\|listEntries\b" src --include="*.js" | grep -v "\.test\.js"`；定点读取 `MemoryV2PendingReviews`；`grep -n "setInterval\|poll"` 对四个既有 V2 消费者各跑一次
- **支持/反驳**: **修正** 记录（`listSpaces` 并非新消费者，第一跳今天已在跑）；**支持** 丙 §3.2 / §3.4 与 A5
- **净内容**: `:782` `contextV2Bridge.listSpaces({ ownerChatId: owner })` 在 `Promise.all` 四路之一，**是生产代码非测试**；`:800-802` 以 `Array.isArray(spacePayload?.spaces) ? … : []` **把「没有 space」与「载荷畸形」折叠成同一个空数组**；`:736` 以 `Boolean(owner) && contextV2Bridge.isAvailable()` 为门。**四个既有 V2 消费者中 `setInterval` 命中 0 处**（`use_chat_stream.js:10721` 的唯一 interval 与 V2 读平面无关）——**V2 读平面今天零轮询**
- **完整性限制**: 只覆盖字面标识符。`use_chat_stream.js:10721` 的 interval 我只看了行号与上下文关键字，**未逐行确认它确实与 V2 无关**——但它不在 `contextV2Bridge` 的 12 个调用点附近
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容 → 自证类。**该文件落 `code-owner-chat-bubble` 边界，我只读引用，处置权归其所有**

### E-D9 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/locales/` 全部 11 个 `.json`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/boot_locale_parity.test.js:59-106`
- **取得方式**（可复跑）:
  ```bash
  ls src/locales/
  python3 -c "
  import json,glob,os
  base=None
  for f in sorted(glob.glob('src/locales/*.json')):
      ks=set(json.load(open(f)).get('memory_inspect',{}).keys())
      if base is None: base=ks
      print(os.path.basename(f), len(ks), 'missing:',sorted(base-ks) or '-', 'extra:',sorted(ks-base) or '-')"
  grep -n "describe\|test(" src/SERVICEs/boot_locale_parity.test.js
  ```
  **实际输出**: 11 个 locale（`de` `en` `es` `fr` `it` `ja` `ko` `pt-BR` `ru` `zh-CN` `zh-TW`），**每个 13 键，missing/extra 全为空**。键集见正文第七节。`boot_locale_parity.test.js` 的 5 个 test 全部围绕 `boot.*`（`:60` 覆盖 11 locale · `:64` 失败键来自 main · `:73` 每 locale 定义全部 `boot.*` · `:89` 无多余 boot 键 · `:106` 非英文确实被翻译）
- **支持/反驳**: **修正** `code-owner-settings` 第五节的「12 个键」（实为 **13**）；**支持** 正文第七节全部三条
- **完整性限制**: 只统计 **顶层** `memory_inspect` 对象的直接子键，**未递归**（该对象无嵌套子对象）。**未核实** 这 13 个键是否全部被 `t()` 实际引用，也未核实是否存在未定义于 `en.json` 的 `t("memory_inspect.*")` 引用——那是 `i18n-coverage` skill 的作业面，我未跑
- **证据类型判据**: 可复跑命令 + 仓内文件字面内容 → 自证类
