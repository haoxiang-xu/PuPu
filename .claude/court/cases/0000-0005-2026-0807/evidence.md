---
case_id: 0000-0005-2026-0807
updated_at: 2026-08-08T16:20:00-07:00
---

# 证据记录

追加式。本 case 的 `E-####` 为 **本地序列**，与 `0000-0002-2026-0807` 独立。援引前案一律写作 `0000-0002-2026-0807#E-####`。

每条证据须标注 **证据类型**（依 [`evidence-rules.md` 第三节](../../../codex/lifecycle/evidence-rules.md) 四类：`自证类 / 须查类 / 传闻类 / 证言类`）。分类决定其默认处置，**不由提交人自选，由判据决定**：

- **自证类** 免检，但被质疑时强制审查，且 **进入承重集合时免检失效**
- **须查类** 与 **证言类** 无需质疑即强制审查
- **传闻类** 不得用于证明其所述事实为真，只能证明「该陈述曾被作出」

---

### E-0001 | repository | 自证类
- **来源定位**: PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（branch `dev`）· unchain `a4e69f413c449c5768433ba4dddc5b60b8146991`（branch `dev`，工作树干净）
- **取得方式**: `git rev-parse HEAD` · `git status --porcelain`，两仓各一次，2026-08-08T16:18-07:00
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 已知事实一（本庭全部 `file:line` 锚点的固定 revision）
- **完整性限制**: PuPu 工作树有 5 个 dirty 文件，**全部位于 `.claude/court/cases/**`**（0000-0003 的四个案卷文件与本案 `case.md`）；`src/` `electron/` `unchain_runtime/` 三个产品目录 **零 dirty**。故本庭引用的产品代码锚点与 HEAD 一致。**未检查是否有并发会话在庭审期间改动产品目录** —— 承重复核时须重测
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 两仓 HEAD 如上；unchain HEAD 与前案 `0000-0002-2026-0807` 所载 `a4e69f41` **相同**，PuPu HEAD 已由 `8d7fbd1d` 前进至 `b2385d5d`

### E-0002 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:9-69`（`TOP_LEVEL_KEYS = Object.freeze([...])`）
- **取得方式**: 机械集合运算，`python3` 解析该字面量数组并列出全部成员；同文件全域 `grep` 四个键名。命令与输出如下
- **提交发言**: S-0002
- **支持/反驳**: **在当前 revision 上重新确认** `0000-0002-2026-0807#E-0034` 的收端锚点；支持 S-0002 已知事实二
- **完整性限制**: 只覆盖 `TOP_LEVEL_KEYS` 这一个字面量与四个键名的字面出现。**未核实** 是否存在以变量拼出的键名旁路，亦 **未复跑前案 E-0034 的探针**（该探针的 bundle 系构造，非真实 SSE 抓取，见 S-0002 已知缺口）
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 结果如下

  ```
  TOP_LEVEL_KEYS at lines 9-69, count=59
  unchain_* members: NONE
  status-ish members: ['status','trace_status','journal_status','persistence_error_code','error_code']

  grep unchain_context_status|unchain_context_error_code|unchain_shadow_status|unchain_shadow_error_code
    -> ZERO HITS in memory_v2_trace_presenter.js（全文，非仅白名单块）
  ```

  **净效果**：`0000-0002-2026-0807#E-0034` 所述的收端事实在 revision `b2385d5d` 上 **仍然成立**：59 项冻结表、无任何 `unchain_` 前缀成员、四个键在 presenter 全文零出现。**这是一次时效性复核，不是重新取证。**

### E-0003 | repository | 自证类
- **来源定位**: `pupu:unchain_runtime/server/unchain_adapter.py:7451`（`def mark_host_partial`）· `:7458-7459`（`unchain_context_status="partial"` / `unchain_context_error_code=`）· `:7467-7468`（`unchain_shadow_status` / `unchain_shadow_error_code`）· `:8403`（`def mark_graph_active_partial`）· `:8411-8412` · `:8554`（`def mark_graph_shadow_partial`）· `:8560-8561`
- **取得方式**: 单次 `grep -n` 于该文件，命中行如上
- **提交发言**: S-0002
- **支持/反驳**: **在当前 revision 上重新确认** `0000-0002-2026-0807#E-0034` 的产端锚点；支持 S-0002 已知事实二
- **完整性限制**: 只确认 **产出点存在及其键名**。**三处 `mark_*_partial` 的触发条件（何种异常会调用它们）未追** —— 与前案 E-0034 的限制一致，本庭 **不消除该缺口**，将其列入 S-0002 已知缺口并指名 `code-owner-runtime`。**产端属 `code-owner-runtime` 边界，本条为越界只读，speaker 对其取舍不表态**
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 三处产出点均在，四个键名逐字与 E-0002 所查的收端缺失项对应

### E-0004 | repository | 自证类
- **来源定位**: `memory_v2_trace_presenter` 在 `src/` 中的全部 import 点 —— `pupu:src/COMPONENTs/chat-bubble/trace_chain.js:28`（`presentMemoryV2Audit`）· `pupu:src/COMPONENTs/chat-bubble/chat_bubble.js:10`（`isMemoryV2TraceBundle`）· `pupu:src/COMPONENTs/chat-bubble/character_chat_bubble.js:10`（同）· `pupu:src/SERVICEs/chat_storage/chat_storage_sanitize.js:21`（`sanitizeMemoryV2TraceBundle`）
- **取得方式**: `grep -rn "memory_v2_trace_presenter" src/ electron/` 后剔除自身文件
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0003 对必到名单的第一处补正（`code-owner-chat-bubble` 补行传唤）
- **完整性限制**: 只覆盖 **静态 import**。未核实是否存在动态 `import()` 的第二类消费者（与 `0000-0002-2026-0807#E-0035` 的同一项限制一致）。**本条不主张这四个消费点各自读到了什么**，只主张 import 关系存在
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 四个 import 点如上。`0000-0002-2026-0807#S-0020` 所述「唯一 **非渲染** 消费者是 `chat_storage_sanitize.js:739`」与本条不矛盾 —— 另外三个是 **渲染** 消费者，全部落在 `src/COMPONENTs/chat-bubble/**`

### E-0005 | repository | 自证类
- **来源定位**: `unknownEvents` 在 `src/` `electron/` `unchain_runtime/` 三目录的全部出现 —— `pupu:src/SERVICEs/runtime_events/event_store.js:35`（初始化空数组）· `:190`（`appendDiagnostic(next.diagnostics.unknownEvents, clone(normalized))` 写入）· `pupu:src/SERVICEs/runtime_events/activity_tree.js:96`（初始化）· `:104-105`（结构透传复制）· `:1092`（初始化）· `pupu:src/SERVICEs/runtime_events/event_store.test.js:62`（测试断言 `toHaveLength(1)`）
- **取得方式**: `grep -rn "unknownEvents" src/ electron/ unchain_runtime/`，全域，无过滤
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 待裁问题 Q3 所载的 **前例**（「加计数器」处方已在本代码库实践过一次）
- **完整性限制**: **本条只是一次字面 grep 的完整结果，不是「零告警」的证明。** 严格地说它证明的是：该标识符在三个目录中共 6 处出现，其中 5 处为初始化 / 写入 / 结构透传，**唯一的读取方是一个测试断言**。要证明「产品运行时无任何读取、展示或告警路径」，须另行排除经 `diagnostics` 整对象透传后在下游被读的可能 —— **本条未做该排除**，`code-owner-shared-arteries` 与 `code-owner-chat-bubble` 在各自边界内可以证成或证否
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 6 处命中如上；`src/` 之外（`electron/` `unchain_runtime/`）零命中

### E-0006 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:162-172`（`resolveTraceStatus` 的显式分支段）
- **取得方式**: 直接读取该行段，原文如下
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 **外部依赖登记**（Q1 的答案可能被一项在跑的只读调查推翻）
- **完整性限制**: 只覆盖显式分支段（`:162-172`）。`:173` 起的 `runStatus` 回退分支与 `:354` 的调用点 **未在本条展开**。**本条不主张 PuPu 四态与 unchain `RunCaptureStatus` 属同簇 —— 那是在跑调查的待答问题，本条只登记「双拼写接受」这一可观察事实**
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 原文如下

  ```js
  const resolveTraceStatus = (raw, mode, runStatus) => {
    const explicit = normalizedText(
      raw.trace_status || raw.journal_status || raw.status,
      48,
    ).toLowerCase();
    if (explicit === "complete" || explicit === "completed") return "Complete";
    if (explicit === "partial" || explicit === "failed" || explicit === "error") {
      return "Partial";
    }
    if (explicit === "legacy") return "Legacy";
    if (explicit === "unavailable") return "Unavailable";
  ```

  两处可观察事实：(1) `explicit` 同时接受 `"complete"` 与 `"completed"` 两种拼写；(2) 取值来源为 `raw.trace_status || raw.journal_status || raw.status` 三选一的短路链，**四个 `unchain_*` 键不在其中**

### E-0007 | repository | 自证类
- **来源定位**: `pupu:.claude/skills/case/summon.py` 对本案 `case.md` 的一次完整运行输出
- **取得方式**: `python3 .claude/skills/case/summon.py .claude/court/cases/0000-0005-2026-0807/case.md`，2026-08-08T16:16-07:00
- **提交发言**: S-0003
- **支持/反驳**: 支持 S-0003 对必到名单的补正与其分类归因
- **完整性限制**: 该工具 **不对触发条件类角色作任何判定** —— 它把 11 个触发条件类角色连同各自边界原文一并打印，标注「须人工对照议案性质」。**该桶的正确性完全依赖一次无机械复核的人工过程**（见 S-0003 的工具失效评述）
- **验证历史**:
  - S-0003 | 已验证（speaker 实跑）| 关键输出如下

  ```
  === 必到名单草案 · 路径边界机械命中（3 人）===
    code-owner-shared-arteries    5 处   e.g. pupu:src/SERVICEs/chat_storage/**, .../chat_storage_sanitize.js
    code-owner-runtime            2 处   e.g. pupu:unchain_runtime/**, .../unchain_adapter.py
    codex                         1 处   e.g. pupu:.claude/codex/adaptations.md

  === 触发条件类角色（11 个，须人工对照议案性质）===
    ... expert-architecture / expert-llm / expert-qa / expert-security / expert-ux / expert-business
        / task-owner-release-certification / 四个 dimension-owner ...
  ```

### E-0010 | repository | 自证类
- **来源定位**: PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（branch `dev`）；`src/` `electron/` `unchain_runtime/` 三个产品目录 dirty 数为 **0**
- **取得方式**:
  ```
  git rev-parse HEAD
  git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l    # -> 0
  shasum -a 256 src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
    # -> 9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0
  ```
  2026-08-08，观察者 `code-owner-shared-arteries`
- **提交发言**: S-0004
- **支持/反驳**: 支持本案 E-0001 的完整性限制所要求的重测（「未检查是否有并发会话在庭审期间改动产品目录」）—— **在本 owner 的观察时点，三个产品目录仍为 0 dirty**，E-0001 的锚点未失效
- **完整性限制**: 只覆盖三个产品目录与一个文件的摘要。**不覆盖** `.claude/` 下的案卷文件。与 E-0001 一样，**不能证明整场庭审期间无并发改动**，只证明两个时点各测一次都是 0
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑）| HEAD 与 E-0001 所载一致；presenter 文件 sha256 如上，本轮全部探针以该摘要的逐字节复制件为基线

### E-0011 | repository | 自证类
- **来源定位**: **白名单同时是渲染门与持久化门，且它对缺失键是无声跳过。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`
  - `:124-133 sanitizeMemoryV2TraceBundle` —— `for (const key of TOP_LEVEL_KEYS) { if (!Object.prototype.hasOwnProperty.call(raw, key)) continue; ... }`，**遍历白名单、对 raw 中不存在的键 `continue`**
  - `:350-352 presentMemoryV2Audit` —— `const safe = sanitizeMemoryV2TraceBundle(raw); if (!safe) return null;` **之后全文只读 `safe`，一次都不读 `raw`**
  - `:414-415 isMemoryV2TraceBundle` —— `sanitizeMemoryV2TraceBundle(raw) !== null`，而 `:132` 的返回条件是 `Object.keys(output).length > 0`。**即挂载门 = 「至少命中一个白名单键」**
  - `:162-196 resolveTraceStatus` 的取值链为 `raw.trace_status || raw.journal_status || raw.status`（`:163-166`）；`:382-385` 的 `errorCode` 取值链为 `safe.persistence_error_code || safe.error_code`
- **取得方式**: 直接读取该文件（sha256 见 E-0010），行号如上
- **提交发言**: S-0004
- **支持/反驳**:
  - **支持约束 2**（扩表对历史行严格 no-op）：`hasOwnProperty` 跳过是逐键的，加名字只增加未命中次数
  - **为 `0000-0002-2026-0807#S-0020` 必要条件 6 补一层机制**：使扩表成为持久化变更的不是「白名单碰巧也被持久化调用」，而是 **同一个导出函数被渲染路径（`:351`）与写入路径（`chat_storage_sanitize.js:739`）各调一次**。**因此「只改渲染不动持久化」在这个制品上不成立**
  - **解释本案 E-0012 的 B 行**：四个键活过白名单后仍不改变 `status`，因为 `:164` 与 `:383` 两条取值链都不含它们
- **完整性限制**: 只覆盖该文件内的四段代码。**不覆盖** `sanitizeNode` 的子对象递归语义（已由 `0000-0002-2026-0807#E-0035` 出证，本条不重复）。**未核实** 是否存在经动态 `import()` 的第二类消费者（与本案 E-0004 同一条限制）
- **验证历史**:
  - S-0004 | 已验证（由提交人读取，行号可复核）| 四段代码原文如上

### E-0012 | probe | 自证类
- **来源定位**: 可复现探针，基线为 `memory_v2_trace_presenter.js` 的逐字节复制件（sha256 `9778e5be…`，见 E-0010）
  - `<scratchpad>/probe/presenter_baseline.mjs`（sha256 `9778e5be…`，与产品文件相同）
  - `<scratchpad>/probe/presenter_whitelist_only.mjs`（sha256 `09393436…`）—— **唯一改动是在 `TOP_LEVEL_KEYS` 的 `"consolidation_jobs"` 之后追加四个字符串**，全文其余部分逐字节不变，行数 +4
  - `<scratchpad>/probe/run.mjs`（sha256 `1ef34303…`）
- **取得方式**: `node <scratchpad>/probe/run.mjs`（`node v24.18.0`）。**输入 bundle 的基础形状取自本机 `chats.db` 中唯一一条真实持久化的 `memory_v2` 行**（键集见 E-0014，值按同类型重填），降级叠加层按本案 E-0003 的产端 kwarg 构造
- **提交发言**: S-0004
- **支持/反驳**:
  - **本条是本轮对 Q1 的核心证据，且它反驳的是本庭对 Q1 的表述而不是任何一位角色的立场**：`0000-0002-2026-0807#E-0034` 证明了「白名单丢掉它 → 报 Complete」；**本条证明「把它加进白名单 → 仍然报 Complete」**
  - **在真实持久化行的基础形状上重新确认 `#E-0034` 的 A 行**，从而把该证据的「bundle 系构造」限制收窄一格（G2 未消除，见 S-0004 不确定性 1）
  - **支持受影响对象表中「Q1 的溢出」一行**：挂载门在扩表前后翻转
- **完整性限制**:
  1. **降级叠加层仍是构造的**，非真实 SSE 抓取。本条不证明产端在任何一次真实回合中发出过这两个键
  2. 只覆盖 `mark_host_partial` 的 active / shadow 两种产出与一个对照组。**未穷举** `mark_graph_active_partial` / `mark_graph_shadow_partial` 的产出差异
  3. 探针以 ESM 直接 import 产品文件的复制件，**未经 webpack / jest 管线**，故不覆盖构建期变换
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑，输出可复现）| 结果如下

  ```
  === A · BASELINE presenter (HEAD b2385d5d, sha256 9778e5be…) ===
  observed base, no degradation      status=Complete  errorCode=""    survivedWhitelist=[]
  ACTIVE degraded (mark_host_partial) status=Complete  errorCode=""    survivedWhitelist=[]
  SHADOW degraded                     status=Complete  errorCode=""    survivedWhitelist=[]
  CONTROL: same failure via persistence_*  status=Partial  errorCode="context_v2_persistence_failed"

  === B · WHITELIST-ONLY patch (4 names appended, nothing else) ===
  observed base, no degradation      status=Complete  errorCode=""    survivedWhitelist=[]
  ACTIVE degraded (mark_host_partial) status=Complete  errorCode=""
      survivedWhitelist=["unchain_context_status","unchain_context_error_code"]
  SHADOW degraded                     status=Complete  errorCode=""
      survivedWhitelist=["unchain_shadow_status","unchain_shadow_error_code"]
  CONTROL: same failure via persistence_*  status=Partial  errorCode="context_v2_persistence_failed"

  === C · mount gate: bundle containing ONLY the four keys ===
  baseline  isMemoryV2TraceBundle: false
  whitelist isMemoryV2TraceBundle: true

  === D · idempotence ===
  sanitize(sanitize(x)) === sanitize(x): true
  four keys after first sanitize: []
  ```

  **B 行是关键**：四个键 **确实** 通过了白名单（`survivedWhitelist` 非空），而 `status` 与 `errorCode` **与基线逐字符相同**。**「加进白名单」这一处置单独执行的用户可见效果为零。**
  **C 行**：只含这四个键的 bundle，扩表前不挂载（整个 Memory V2 trace 节点不出现），扩表后挂载。
  **D 行**：sanitize 幂等，且第一次施加后四个键即不复存在 —— **持久化副本里没有可供二次抢救的残留。**

### E-0013 | probe | 自证类
- **来源定位**: 同 E-0012 的基线与运行环境。第三个变体 `<scratchpad>/probe/presenter_derive_only.mjs`（sha256 `b4e7e86d…`）—— **`TOP_LEVEL_KEYS` 一项不动（仍 59 项）**，在 `sanitizeMemoryV2TraceBundle` 末尾加一次归一：把 raw 的 `unchain_context_status` / `unchain_shadow_status` 及其错误码，映射到 **已经在白名单内的** `trace_status` / `persistence_error_code`。运行脚本 `<scratchpad>/probe/run2.mjs`（sha256 `db64f2cb…`）
- **取得方式**: `node <scratchpad>/probe/run2.mjs`
- **提交发言**: S-0004
- **支持/反驳**: **支持「形状 C 存在且技术上可行」这一事实主张，不支持「应当选 C」这一取舍主张。** 取舍理由见 S-0004 建议处置一，那是判断不是观察
- **完整性限制**:
  1. **本条不评价 C 的安全后果。** 它把一次语义派生放进了与 `BLOCKED_KEY_PATTERN` 同处的制品里，**该判断属 `expert-security`，本条不代答**
  2. **本条不评价同键异义的代价。** `trace_status` 在 C 之下会在一部分行里承载收端判词，这是一处新的同词异义，其严重度是判断不是观察
  3. 映射把 active / shadow 两面的错误码都归一到单一 `persistence_error_code`，**是有损的**；本条未测多面同时降级时的取舍
  4. 与 E-0012 同一条限制：降级叠加层构造，未经构建管线
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑，输出可复现）| 结果如下

  ```
  === C · derive-only (TOP_LEVEL_KEYS UNCHANGED, 59 items) ===
  healthy active turn   status=Complete  errorCode=""   persistedKeyCount=14  synthesizedKeys=[]
  ACTIVE degraded       status=Partial   errorCode="context_v2_persistence_failed"
                        persistedKeyCount=16  synthesizedKeys=["trace_status","persistence_error_code"]
  SHADOW degraded       status=Partial   errorCode="context_v2_persistence_failed"
                        persistedKeyCount=16  synthesizedKeys=["trace_status","persistence_error_code"]

  === reload stability ===
  live status                                          : Partial
  after-reload (C presenter reading a C-written row)   : Partial "context_v2_persistence_failed"
  after-reload (BASELINE presenter reading a C-written row): Partial "context_v2_persistence_failed"

  === forward/backward compat ===
  C-written persisted key set is subset of the frozen 59: true
  ```

  **三项可观察事实**：(1) 不动 `TOP_LEVEL_KEYS` 也能把降级回合从 `Complete` 纠正为 `Partial` + 正确错误码；(2) 健康回合不受影响，不合成任何键；(3) **一个由 C 写出的行，被未打补丁的基线 presenter 读，照样显示 `Partial`** —— 前后向都兼容，持久化键集仍是那 59 项的子集

### E-0014 | runtime-artifact | 须查类
- **来源定位**: 本机 `~/Library/Application Support/pupu/chats.db`（Chat storage V3 的 SQLite 权威库，路径由 `electron/main/services/chat_storage/service.js:12` 与 `:528-531` 决定）。**观察方式为先复制只读副本再查询，未触碰原库**
- **取得方式**:
  ```
  cp "~/Library/Application Support/pupu/chats.db" <scratchpad>/chats_readonly_copy.db
  sqlite3 chats_readonly_copy.db "SELECT COUNT(*) FROM chats;"     # -> 86
  sqlite3 chats_readonly_copy.db "SELECT COUNT(*) FROM messages;"  # -> 532
  sqlite3 chats_readonly_copy.db \
    "SELECT COUNT(*) FROM messages WHERE payload LIKE '%unchain_context_status%';"   # -> 0
    (同法查 unchain_shadow_status / persistence_degraded / trace_status)             # -> 0 / 0 / 0
  python3  # json.loads 每行 payload，取 meta.bundle 与 meta.bundle.memory_v2，只输出键名与计数
  ```
  观察时点 **2026-08-08T16:40-07:00 前后**（副本文件 mtime 为准）
- **提交发言**: S-0004
- **支持/反驳**:
  - **支持 S-0004 对 G3 的直接回答**（历史行规模与形状）
  - **支持 U-S5**：那条唯一的真实行 **没有任何 status 字段**，即 active 面的 `Complete` 是收端推断
  - **为 E-0012 / E-0013 的探针提供真实基础形状**，收窄 `0000-0002-2026-0807#E-0034` 的「bundle 系构造」限制
- **完整性限制**:
  1. **须查类，无保管链。** `chats.db` 是活文件，随用户使用改变；本条只证明 **该时点** 的状态，**不得据此单次观察推断稳定状态**
  2. **n=1，且是开发者本机。** **不得外推到装机面。** 本机的分布同时受「开发中手工开关 flag」影响
  3. `LIKE '%memory_v2%'` 初筛命中 2 行，逐行 JSON 解析后 **只有 1 行真的有 `meta.bundle.memory_v2`**，另一行是正文文本里的字面命中。**报数以 JSON 解析结果为准**
  4. **只取聚合计数与顶层键名，未导出任何消息内容**
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑）| 结果如下

  ```
  chats = 86 | messages = 532
  rows with meta.bundle                = 90
  bundle key histogram = {consumed_tokens:90, input_tokens:90, output_tokens:90,
                          model:90, cache_read_input_tokens:31,
                          cache_creation_input_tokens:31, memory_v2:1}
  rows with a parsed meta.bundle.memory_v2 = 1
    its top-level keys (14) = [available_input_tokens, canary_hash_strategy,
      canary_percent, canary_selected, compression_threshold_tokens,
      effective_rollout_mode, mode, output_reserve_tokens,
      real_context_window_tokens, reason, requested_mode,
      requested_rollout_mode, schema_version, transport_margin_tokens]
    mode = 'active' | status = None | trace_status = None | journal_status = None

  rows containing any of the four keys                 = 0
  rows containing persistence_degraded / trace_status  = 0 / 0
  ```

  **两条净结论**：(1) **本机 532 条消息行里，含任一四键的为 0** —— 与 E-0015 的结构证明一致；(2) 唯一那条真实 `memory_v2` 行 **一个 status 字段都没有**，`mode:"active"`，故渲染为 `Complete`，而这个 `Complete` 无任何产端陈述支撑

  - S-0028 | 已验证（`evidence-examiner` 独立复核）| **本体经三方 sha256 逐字节比对无漂移**（提出方只读副本 / 活库 / 复核者 69 分钟后自取的副本）。**两项补记，依复核者请求追加**：(1) **权威观察时点校正为 `2026-08-08T16:26:40-07:00`** —— 本条自陈「16:40 前后」偏早约 14 分钟，而本条自己指定「副本 mtime 为准」；(2) **取得方式未复制 WAL 且未披露该遗漏**，复核者实测其对全部报数影响为零（`wal_checkpoint` 返回 `0|0|0`）。
    **保管链**：第四节所设「观察与呈堂之间系统已改变」在本条上实测为零，证明力未因无保管链折损；**但该同一性只是这一次未发生 checkpoint 的结果、其本身又是一次须查类观察，不得据以改判为自证类**，第四节「不得据单次观察推断稳定状态」原样成立。
    **射程分离（复核者主动指出，不请求修改或撤回 S-0004）**：本语料中持久化的 `memory_v2` 对象仅一条、`mode='active'`、`reason=''`，**不存在任何降级回合**，而这四个键只在降级时产出 —— 故「sanitize 剥离」与「产端从未产出」**两个假说预测同一个观察值 0，该观察对二者不作区分**。
### E-0015 | repository | 自证类
- **来源定位**: **sanitize 在写入路径上，不只在读取路径上；而渲染副本不经 sanitize。**
  - **写入**：`pupu:src/SERVICEs/chat_storage/chat_storage_store.js:2136-2140`（`setChatMessages` → `const nextMessages = sanitizeMessages(messages)`，其结果即写进 `chat.messages`）· `:1466`（新建会话）· `:1626`（复制会话）
  - **读取**：同文件 `:247`（`store.chatsById[chatId] = { ...chat, messages: sanitizeMessages(loaded) }`）· `:1191`（`return sanitizeMessages(loaded)`）
  - **链路**：`sanitizeMessages` → `sanitizeMessage` → `chat_storage_sanitize.js:739 sanitizeMemoryV2TraceBundle(b.memory_v2)`
  - **渲染副本不 sanitize**：`pupu:src/PAGEs/chat/hooks/use_chat_stream.js:860-870 commitForegroundMessages` 全文为 `messagesRef.current = nextMessages; setMessages(nextMessages);` —— **无任何过滤**；而 `:9487-9494` 处 `meta.bundle = { ...projectedBundle }` 构造完成后，`:9493` 把该数组交给 `commitForegroundMessages`，`:9494` 才把 **同一个数组** 交给 `storageApi.setChatMessages`
- **取得方式**:
  ```
  grep -rn "sanitizeMessages\|sanitizeMessage(" src electron | grep -v chat_storage_sanitize.js:
  sed -n '240,262p;1180,1202p;1455,1477p;1615,1637p;2130,2152p' \
      src/SERVICEs/chat_storage/chat_storage_store.js
  sed -n '855,872p;9405,9500p' src/PAGEs/chat/hooks/use_chat_stream.js
  ```
- **提交发言**: S-0004
- **支持/反驳**:
  - **支持 S-0004 对 Q2 的第一条证明**：四个键在写进 SQLite 之前已被剥掉，**历史行里从来没有过**，故无可迁之物
  - **支持约束 3**：渲染副本与持久化副本是两个不同的对象，今天被 `presentMemoryV2Audit:351` 的内部 sanitize 遮住；任何「presenter 直接读 raw」的处方会掀开它
- **完整性限制**:
  1. `use_chat_stream.js` 属 `code-owner-chat-core`，`chat_storage_store.js` 属本 owner。**前者为越界只读，其取舍以该 owner 为准**
  2. **本条只覆盖 `sanitizeMessages` 的 5 个调用点与 `commitForegroundMessages` 一个提交点。** `chat_storage_store.js:187` 与 `:816` 两处 `messages:` 字面量已逐一核对为空数组初始化与 dirty 声明结构，**与消息内容无关**；但 **未穷举** 全仓是否另有绕过 `sanitizeMessages` 的写入路径
  3. **未跑运行时**，未观察一次真实的 live/reload 分叉
- **验证历史**:
  - S-0004 | 已验证（由提交人读取，行号可复核）| 五个 sanitize 调用点、一个未 sanitize 的渲染提交点如上

### E-0016 | repository | 自证类
- **来源定位**: **`unknownEvents` 所在的整个 `diagnostics` 对象，在 `runtime_events/` 之外零消费者。** 这是对本案 E-0005 的 **范围扩大复核**，回答 G5
  - **产生与透传（全在 `runtime_events/` 内）**：`event_store.js:51`（`diagnostics: createDiagnostics()`）· `:57`（快照克隆）· `:182` `:190` `:195`（三类 `appendDiagnostic` 写入）· `:252` · `:272`（`diagnostics: state.diagnostics` 进快照）；`activity_tree.js:95` · `:103-111 cloneDiagnostics` · `:854` · `:1090-1091`（`diagnostics: clone(eventStoreSnapshot.diagnostics)`）· `:1662`
  - **`runtime_events/` 的两个外部消费者**：`src/PAGEs/chat/hooks/use_chat_stream.js:15,19` · `src/COMPONENTs/ui-testing/runners/trace_chain_runner.js:15-16`。**两者对 `diagnostics` 的命中数均为 0**
  - **全域负向结果**：`grep -rn "diagnostics" src` 在 `runtime_events/` 之外的全部命中，**无一例外落在 `src/COMPONENTs/settings/model_providers/custom-providers/**`**（custom provider 导入校验的同名无关字段）；`grep -rn "unknownEvents\|\.diagnostics" electron` **零命中**
- **取得方式**:
  ```
  grep -n "diagnostics" src/SERVICEs/runtime_events/event_store.js \
                        src/SERVICEs/runtime_events/activity_tree.js
  grep -rn "runtime_events/event_store\|runtime_events/activity_tree" src electron | grep -v "\.test\.js"
  grep -rn "diagnostics" src | grep -v "^src/SERVICEs/runtime_events/"
  grep -rn "unknownEvents\|\.diagnostics" electron          # -> 0 hits
  ```
- **提交发言**: S-0004
- **支持/反驳**:
  - **回答 G5，方向为「证成」E-0005 的结论并扩大其范围。** E-0005 的完整性限制自陈「未排除经 `diagnostics` 整对象透传后在下游被读的可能」—— **本条做了该排除**：整对象确实被逐层透传到 activity tree 状态里，但 **两个消费者都不读它**
  - **支持 S-0004 约束 5 与建议处置三**：「加计数器」处方的失败在 **对象层面** 成立，不只在标识符层面
- **完整性限制**:
  1. **字面 grep，非语义分析。** 若有代码以变量键或解构别名读取该对象（如 `const { diagnostics: d } = snapshot`），本条会漏报 —— **`grep "diagnostics"` 能命中该写法的左半**，故漏报面限于完全不出现该标识符的读取，我认为极小但 **不主张为零**
  2. **未覆盖 `.test.js` 之外的动态访问**（如 `snapshot["diag"+"nostics"]`），未穷举
  3. 只覆盖 `src/` 与 `electron/`；`unchain_runtime/` 无此对象
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑）| `runtime_events/` 内 19 处命中全部为初始化 / 写入 / 克隆透传；`runtime_events/` 外在 `src/` 的全部命中属 custom-provider 导入管线（无关同名）；`electron/` 零命中

### E-0017 | repository | 自证类
- **来源定位**: **`enable_memory_v2` 这个 feature flag 从未存在于任何已发布版本。**
  - `pupu:src/SERVICEs/feature_flags.js` 在 **全部 18 个 tag** 上，`enable_memory_v2` 的出现次数合计为 **0**
  - 引入该 flag 的最早 commit 为 `0dc333dcd79b7325593157c0598f123c182aaccd`（`feat(memory): integrate Context Memory V2 P0`），`git tag --contains` 返回 **0 个 tag**
  - dev HEAD 上该 flag 的定义为 `enable_memory_v2: { description: "Enable Memory V2 admission and its optional Unchain module...", defaultValue: false }`（`feature_flags.js:53-57`）
- **取得方式**:
  ```
  for t in $(git tag); do n=$(git show "$t:src/SERVICEs/feature_flags.js" 2>/dev/null \
      | grep -c 'enable_memory_v2'); echo "$t $n"; done \
    | awk '{s+=$2; c++} END {print "tags checked:", c, "| total occurrences:", s}'
    # -> tags checked: 18 | total occurrences: 0

  C=$(git log --format=%H -S "enable_memory_v2" --reverse -- src/SERVICEs/feature_flags.js | head -1)
  git tag --contains "$C" | wc -l        # -> 0
  ```
  PuPu HEAD `b2385d5d`，2026-08-08
- **提交发言**: S-0004
- **支持/反驳**:
  - **更正 `case.md` 正文「这是本批三案中唯一一个『发布配置下今天就在发生』的缺陷」这句定性**，以及 `0000-0002-2026-0807#E-0034` 净效果段中「发布配置」一词被本庭读成「出厂产品」的读法。**该证据由我提出，该更正也由我提出**（宪法第五条：补强被质疑证据的责任在提出方）
  - **不反驳 `#E-0034` 的任何技术内容。** 缺陷的机制、对照组、四个键的落差，一条都不改
  - **支持 S-0004 请求 3**：单向门后今天为空，其成本随发布时点单调上升
- **完整性限制**:
  1. **本条证明的是「`feature_flags.js` 在每个 tag 上都没有这个 key」，不是「Memory V2 的任何代码从未发布」。** 未逐 tag 核对 sidecar 侧的 `PUPU_FEATURE_MEMORY_V2`
  2. **未排除未打 tag 的分发**（beta 包、手工签名包、直接发给个别用户的构建）。**若任一已分发包被证明带此 flag 为 true，本条的曝光判断立即翻转**
  3. `feature_flags.js` 属 `code-owner-settings` 边界，**本条为越界只读**，只出「该标识符在各 tag 上出现几次」这一机械事实，不对该文件的任何取舍表态
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑）| 18 个 tag，合计 0 次出现；引入 commit 不被任何 tag 包含

### E-0018 | runtime-artifact | 须查类
- **来源定位**: **发布包的 flag 取值不由仓库决定，且本机现有的三份制品互不一致。**
  - **已安装包**：`/Applications/PuPu.app/Contents/Resources/app.asar`（mtime 2026-07-31 16:51，434 MB）—— `enable_memory_v2` **零命中**；同一条 grep 命中 `enable_theme_color_customization` **5 次**、`enable_user_access_to_agents` **7 次**（对照组，证明 grep 在该二进制上有效）
  - **上一次本机构建产物**：`<pupu>/build/build_feature_flags.json`（mtime 2026-08-03 22:23）—— `"enable_memory_v2": false`，且内含 `_pupu_memory_v2_release.sidecar_environment` 为 `PUPU_FEATURE_MEMORY_V2: "off"` / `PUPU_MEMORY_V2_MODE: "off"` / `PUPU_CONTEXT_V2_STORE_OWNER: "off"`
  - **当前构建期快照**：`<pupu>/.local/build_feature_flags.snapshot.json`（mtime 2026-08-04 17:20）—— 今天从本机构建会烤进 `"enable_memory_v2": true`
  - **两份制品都不入库**：`git check-ignore -v .local/build_feature_flags.snapshot.json` → `.gitignore:20:/.local/`；`build/` 同理
- **取得方式**:
  ```
  cd /Applications/PuPu.app/Contents/Resources
  LC_ALL=C grep -a -c 'enable_memory_v2' app.asar                    # -> 0
  LC_ALL=C grep -a -c 'enable_theme_color_customization' app.asar    # -> 5   (对照组)
  LC_ALL=C grep -a -c 'enable_user_access_to_agents' app.asar        # -> 7   (对照组)

  cd <pupu>
  cat build/build_feature_flags.json
  node ./scripts/build-web.cjs --print-flags     # 只读，--print-flags 在 spawn 构建前 exit
  git check-ignore -v .local/build_feature_flags.snapshot.json
  ```
  观察时点 2026-08-08T16:50-07:00 前后
- **提交发言**: S-0004
- **支持/反驳**: **与 E-0017 合起来支持「本缺陷在任何已发布版本上不可达」。** E-0017 是自证类且与本机无关，**该结论仅凭 E-0017 即成立**；本条是独立的第二条线，并额外说明「发布包 flag 取值在仓库里不可复现」这一 ownership 缺口
- **完整性限制**:
  1. **须查类，无保管链。** 三份制品都是本机文件，其中两份不入库、无历史；`.local/` 快照会被「在 dev 打开 Settings→Dev 页」这一副作用覆盖。**不得据其推断任何已分发包的状态**
  2. **`grep -a` 于 asar 是字面扫描**，不解包不解析。对照组命中证明方法有效，但 **不能排除该字符串以压缩 / 分块形式存在而未被命中**。**本条的主结论不依赖它** —— E-0017 才是主证
  3. `scripts/build-web.cjs`、`build/`、`.local/` 均属 `code-owner-devtools` 边界，**本条为越界只读**
  4. 本轮另读了 `.claude/agent-memory/code-owner-devtools/build-feature-flag-snapshot-untracked.md` 一份。**依证据规则第三节属传闻类，不用于证明其所述事实为真**；其所述的关键部分（快照路径、不入库、`--print-flags` 可只读打印）我已自行复跑，**上列命令与输出即是自证来源**
- **验证历史**:
  - S-0004 | 已验证（由提交人实跑）| 三份制品的取值与不一致关系如上；对照组证明 grep 方法在该二进制上有效

  - S-0029 | 已验证（`evidence-examiner` 独立复核）| 全部操作前后两份构建制品的 md5 与 mtime 完全一致，**未触发任何构建**。
    **分级理由须加一层**：提出方给的理由（「三份都是本机文件，两份不入库、无历史」）**对 `app.asar` 一份不够** —— 装机包不入库是同义反复。真正使它成为须查类的是它 **没有可验证的 provenance**：adhoc 签名（`Signature=adhoc`、`TeamIdentifier=not set`）、**无 `com.apple.quarantine` 属性**、仓库 `.github/workflows/` 无任何发布 workflow。**分级正确，理由需加这一层。**
    **完整性限制 2（压缩／分块可能藏字符串）在承重部位实测退掉**：从 asar 目录表抽出该 flag 唯一落点的 bundle 与 source map（asar 内均为未压缩明文），`enable_memory_v2` 与 `memory_v2` 均为 **0**，对照组 **7/7 与 5/5**，且 map 内 `FEATURE_FLAG_DEFINITIONS` 出现 5 次证明原始源码确在其中。
    **一处主持人须单独注意**：该 asar **根本不含 Python sidecar**（`unchain_adapter` / `memory_factory` / `PUPU_MEMORY_V2_MODE` 全 0），**故 E-0017「未逐 tag 核 sidecar」的缺口 E-0018 补不上** —— **两条合写成一句会让它看起来被补上了**。
    **保管链**：把本条锁在「本机这一份的一次观察」上，**不能承重「任何已发布版本」那一层**（该层承重本就在 E-0017，提出方的自我定位经逐字核对属实）；**不影响** 它对「发布包 flag 取值在仓库里不可复现」这一结构性负向事实的独立且充分证明。
    **传闻类自我披露评价**：**符合[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)全部要求，构成可援引的正确范例** —— 披露了文件存在与路径、正确认定类型、明确声明不用于证明所述事实为真，且 **关键处确实出了原件**（复核者逐条对上，**没有一条 E-0018 的事实主张只靠它站着**）。**立例时建议补一条形式要求**：把「关键部分我已复跑」改为 **正反两栏**（已复跑并出原件的／未复跑且不予采信的），使隔离不再依赖提出方对「关键」的自行界定。
### E-0019 | repository | 自证类
- **来源定位**: **合用制品的问题已经传染到测试：一条测试名同时覆盖脱敏与字段表两个角色。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js`（全文 111 行）
  - `:91-102` 单个 `test()`，名为 **`"uses only the explicit audit allowlist and strips hidden reasoning and credentials"`**，同块内断言：`expect(sanitized.unknown_payload).toBeUndefined()`（**字段表职责**）· `expect(serialized).not.toContain("chain_of_thought")` 与 `not.toContain("credentials")`（**安全职责**）· `expect(isMemoryV2TraceBundle({ unknown: true })).toBe(false)`（**挂载门**）
  - `:104-110` 状态表 `test.each` 只有 **三条** 用例：`{mode:"active", persistence_degraded:true}→Partial` · `{mode:"legacy", legacy_v1:true}→Legacy` · `{mode:"off", reason:"…unavailable"}→Unavailable`。**四个键、`unchain_*` 前缀、active 面降级 —— 一条都没有**
  - **挂载门断言用 `{ unknown: true }` 作输入**，故本案扩表后该断言 **仍然为绿**，测不到本案会造成的挂载门变宽（对照 E-0012 C 段）
- **取得方式**:
  ```
  wc -l src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js      # -> 111
  grep -n "test(\|it(\|expect(" src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  sed -n '89,111p'  src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  ```
- **提交发言**: S-0004
- **支持/反驳**:
  - **支持 S-0004 建议处置三（Q3 应在本案处置最小一份）**，且把理由从抽象债务落到本案自身：**本案的改动落在这条测试名之下，改完之后红灯不可归因**
  - **支持约束 6**（本 owner 的单元测试不具备验收效力），并为 `0000-0002-2026-0807#S-0013` 约束 3 补一个新实例
  - **不反驳 `0000-0002-2026-0807#E-0072`**，是它在测试层面的对应物：合用制品的性质会沿着制品传播到覆盖它的测试上
- **完整性限制**:
  1. 只覆盖 presenter 自己的 co-located 测试。**`chat_storage_memory_v2_trace.test.js`（43 行）本条未展开**，其内容已由 `0000-0002-2026-0807#E-0035` 出证
  2. **未跑测试**，只做静态读取与断言计数。「扩表后该断言仍绿」是由输入 `{unknown: true}` 与 E-0012 的机制推出的，**属推论不属观察**
  3. 本条不主张应当如何拆分测试 —— 那是方案庭审的事
- **验证历史**:
  - S-0004 | 已验证（由提交人读取，行号与断言原文可复核）| 一个 `test()` 块内三类断言并存；状态表三条用例，无一涉及本案的四个键

### E-0030 | repository | 自证类
- **来源定位**: 四个键在 PuPu 全部产品目录中的 **完整出现集合** —— `pupu:unchain_runtime/server/unchain_adapter.py:7458` `:7459` `:7467` `:7468` `:8411` `:8412` `:8560` `:8561`，共 **8 处，全部为写入**。sink 注册点 4 处：`:7545`（host preflight）· `:7600`（shadow bridge）· `:8442`（graph active preflight）· `:8618`（graph shadow bridge）
- **取得方式**: revision PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "unchain_context_status\|unchain_context_error_code\|unchain_shadow_status\|unchain_shadow_error_code" \
    unchain_runtime/ src/ electron/ docs/ | wc -l          # -> 8
  grep -rn "unchain_context_status\|unchain_context_error_code\|unchain_shadow_status\|unchain_shadow_error_code" \
    unchain_runtime/ src/ electron/ docs/ | grep -v "unchain_adapter.py" | wc -l   # -> 0
  grep -n "partial_attempt_sink=mark_" unchain_runtime/server/unchain_adapter.py   # -> 4 行
  ```
  `unchain_runtime/` 覆盖 `unchain_runtime/server/tests/`，**未作任何测试目录排除**
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 评估结论与建议处置二（四个键零消费者 / 零测试 / 零文档）；**扩大** 本案 E-0003 的作用域 —— E-0003 只确认产出点存在，本条确认 **产出点即全集，且不存在读取方**
- **完整性限制**: **字面量抓取，非语义分析。** 与 `0000-0002-2026-0807#E-0069` 同一失败类：以变量、f-string 或 `**dict` 展开构造的同名键会被漏掉，故「8 处」是 **下界**。搜索范围限于 `unchain_runtime/ src/ electron/ docs/` 四个目录，**未覆盖** `.claude/worktrees/**`（隔离工作树，非产品树）与 `node_modules/`
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 计数如上

### E-0031 | repository | 自证类
- **来源定位**: **unchain 的 `partial_attempt_sink` 是 durable-persistence 失败边界，其每一个调用点在调用后立即 re-raise，且该类异常被库显式豁免于一切吞异常层。** revision unchain `a4e69f413c449c5768433ba4dddc5b60b8146991`
  - **调用点（6 个，下界）**：`src/unchain/context/coordinator.py:1053`（`_partial_attempt_sink(request, error)`，经 `_mark_partial` `:1047-1054` 被 11 处调用：`:782` `:788` `:794` `:808` `:816` `:834` `:840` `:848` `:856` `:869` `:877`，其中 `:816` `:840` `:848` `:869` `:877` 经 `_mark_durable_partial` `:1036-1045`）· `src/unchain/context/runtime.py:883`（`subagent.input.partial`）· `:1079`（`subagent.handoff.partial`）· `:1595`（`tool.execution.partial`）· `:1660`（`tool.transition.partial`）· `:1817`（`persist_event`，**每一条 durable 事件**）
  - **每个站点其后必 raise，无一例外**：`runtime.py:895-896` / `:1091-1092` / `:1607` / `:1673` / `:1826-1827`；`coordinator.py` 的 11 处 `_mark_*` 各自紧跟 `raise` / `raise error` / `raise boundary_error from None`：`:782→:783` · `:788→:789` · `:794→:795` · `:808→:809` · `:816→:818-819` · `:834→:835` · `:840→:842-843` · `:848→:849` · `:856→:857` · `:869→:871-872` · `:877→:878`
  - **库对该类异常的显式豁免（11 处）**：`src/unchain/subagents/plugin.py:406` `:853` `:1054` `:1293` `:1871` `:2043` `:2183` `:2454` 与 `src/unchain/subagents/executor.py:37` `:64` 均写 `if is_durable_persistence_failure(exc/error): raise`，即在「把工具异常吞成 `{"error": ...}` 结果」的分支之前放行
  - **重试分类**：`src/unchain/retry/classifier.py:15-19` `def is_retryable(...): if is_durable_persistence_failure(error): return False`；**网络抖动为独立分支**（`:21-40`：`httpx.ConnectError` / `ConnectTimeout` / `ReadTimeout` / `WriteTimeout` / `PoolTimeout` / `RemoteProtocolError` 与状态码 `{408,409,429,529} ∪ 500-599`），**不经过 sink**
  - **工具 handler 抛异常的归宿**：`src/unchain/context/tool_executor.py:1039-1046`（`invocation_failed = False` `:1039` → `raw_draft = bound_invocation.terminal_handler(...)` `:1041` → `except Exception: invocation_failed = True` `:1044-1045` → `raise DurableToolInvocationFailedError()` `:1046`）；该异常由 `runtime.py:1586`（`return binding.executor.execute(...)`）的 `except Exception as error:` `:1590` 捕获，触发 sink `:1595` 后 `raise` `:1607`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain && git rev-parse HEAD   # a4e69f41...
  grep -rn "partial_attempt_sink" src/ | grep -v tests
  grep -n "_partial_attempt_sink(request, error)" src/unchain/context/coordinator.py
  grep -n "_mark_durable_partial\|_mark_partial" src/unchain/context/coordinator.py
  sed -n '760,890p;1036,1055p' src/unchain/context/coordinator.py
  for L in 883 1079 1595 1660 1817; do echo "-- $L --"; \
    awk -v s=$L 'NR>=s && NR<=s+20 && /raise/ {print NR": "$0}' src/unchain/context/runtime.py; done
  grep -rn "is_durable_persistence_failure(exc)\|is_durable_persistence_failure(error)" \
    src/unchain/subagents/plugin.py src/unchain/subagents/executor.py src/unchain/retry/classifier.py | wc -l  # -> 11
  sed -n '1,40p' src/unchain/retry/classifier.py
  sed -n '1036,1050p' src/unchain/context/tool_executor.py
  ```
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 结论与建议处置一（G1 的答案）；**限定** 本案 E-0003 完整性限制所留的缺口（「三处 `mark_*_partial` 的触发条件未追」）—— 本条把它追到了
- **完整性限制**: 1. **字面量 `grep` 枚举**，以 `getattr` / 别名 / `**kwargs` 转手的调用会被漏掉，故 6 个调用点是 **下界**。2. **未通读 `src/unchain/kernel/`**：若 kernel loop 内部另有一处把 durable 异常降级为可继续状态，「必 raise」在链路层面的净效果失效。3. **静态读取，未跑 unchain 自带 pytest，未做故障注入。** 4. 全部落点在 unchain 仓，属 `code-owner-unchain` 边界，**本条为越界只读取证，不请求任何 unchain 侧改动**
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 命中行与豁免计数如上

### E-0032 | repository | 自证类
- **来源定位**: **PuPu 三个会发 `stream_summary` 的生成器，其错误路径的 `raise` 一律排在 bundle 的 `yield` 之前。** `pupu:unchain_runtime/server/unchain_adapter.py`
  - `_stream_recipe_graph_events`（`:8156` 起）：worker 捕获 `:9548-9557`（`output_holder["error"] = run_error`）→ 排空循环 `:9602-9607`（`item = event_queue.get()` 在 `:9603`）→ `:9609-9614` `error = output_holder.get("error")` / `raise RuntimeError(str(error))` → `:9652-9662` `_finalize_memory_v2_curator` / `_refresh_memory_v2_bundle` / `yield {"type": "stream_summary"}`
  - `stream_chat_events`（`:9819` 起）：`:10318-10329` → 排空循环 `:10390-10395`（`item = event_queue.get()` 在 `:10391`）→ `:10397-10405`（`raise error`）→ `:10433-10453`
  - `resume_chat_interaction_events`（`:10455` 起）：`:11046-11055` → 排空循环 `:11133-11138`（`item = event_queue.get()` 在 `:11134`）→ `:11140-11149`（`raise error`）→ `:11177-11191`
  - 第四个生成器 `stream_chat`（`:9664`）**只 yield 字符串、不发 bundle**（`:9786-9798`），不在本条范围
  - **worker 线程的 `finally` 恒 `event_queue.put(done_marker)`**（`:10357` 等），主生成器的排空循环见 `done_marker` 才 break —— 故到达 curator / bundle 段时 worker 已结束
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "^def stream_chat_events\|^def _stream_recipe_graph_events\|^def resume_chat_interaction_events\|^def stream_chat\b" \
    unchain_runtime/server/unchain_adapter.py
  grep -n 'raise error$\|raise RuntimeError(str(error))\|error = output_holder.get("error")\|output_holder\["error"\] = run_error\|"type": "stream_summary"' \
    unchain_runtime/server/unchain_adapter.py
  sed -n '9600,9662p;10390,10453p;11136,11191p' unchain_runtime/server/unchain_adapter.py
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: 与 E-0031 合并支持 S-0005 结论（触发条件与可观测条件互斥）；**不反驳** `0000-0002-2026-0807#E-0034` 对 presenter 行为的证明，**只反驳其净效果段「今天就在发生」这一句所需的可达性前提**
- **完整性限制**: 只覆盖这三个生成器的 **控制流顺序**。**未核实** Flask 路由层（`routes.py`）在生成器抛出后是否会以其他形式补发一条含 bundle 的帧（属本边界，但本轮未追）。**未跑运行时。** 取消路径（`output_holder["cancelled"]` → `return`）同样不发 bundle，本条一并覆盖但未单列行号
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 三处结构逐字相同，行号如上

### E-0033 | repository | 自证类
- **来源定位**: **`_finalize_memory_v2_curator` 写 `memory_agent_runs` 之后到 `stream_summary` 之间，没有任何 `update_diagnostics` 调用。** `pupu:unchain_runtime/server/unchain_adapter.py`
  - `_finalize_memory_v2_curator` 定义 `:902-1151`；写 `memory_agent_runs` 的 `_memory_v2_merge_diagnostics` 在 `:1146-1150`，**其后仅 `return summary`（`:1151`）**；早退分支的同类写入在 `:953-957`，其后 `return summary`（`:958`）
  - 三个调用点 `:9646` · `:10434` · `:11178`，其后到 `yield` 之间 **只有** `_refresh_memory_v2_bundle`（`:9654` · `:10442` · `:11186`）
  - `_refresh_memory_v2_bundle` 定义 `:1154-1166`：`if ... not getattr(admission, "is_active", False): return` → `fresh = _memory_v2_bundle_payload(admission)` → `bundle["memory_v2"] = merged`。**只读 admission，不写 admission**
  - `_memory_v2_merge_diagnostics` 定义 `:271-281`：read-modify-write（`current = admission.diagnostics()` → `merged.update(...)` → `update_diagnostics(merged)`），**不是整字典替换**
  - 同函数内 `_memory_v2_persist_audit_event`（定义 `:343-360`）**不调用 `update_diagnostics`**，且其调用点（`:1140-1145`）在 merge **之前**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "_finalize_memory_v2_curator\|_memory_v2_merge_diagnostics(\|def _refresh_memory_v2_bundle\|_refresh_memory_v2_bundle(\|return summary" \
    unchain_runtime/server/unchain_adapter.py
  sed -n '902,960p;1140,1170p;271,282p;343,361p' unchain_runtime/server/unchain_adapter.py
  sed -n '9644,9662p;10432,10453p;11176,11191p' unchain_runtime/server/unchain_adapter.py
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: **直接回答** `0000-0002-2026-0807#S-0020` 请求 4；**反驳** `0000-0002-2026-0807#E-0070` 竞争解释的 **时序半边**（该证据自陈「机制已证、时序未证」）；因而 **削弱** `#S-0020` 必要条件 8 的力度。**不反驳 `#E-0070` 对 `update_diagnostics` 整字典替换语义的事实描述** —— 那一条本领域复核成立
- **完整性限制**: 1. 只覆盖 **同线程、同回合、三个生成器内** 这一段。**未核实** durable-jobs 后台 worker 是否持有同一 admission 对象并异步写入 —— **这是本条最脆弱的一处**。2. 静态控制流读取，**未跑运行时、未做时序观测**。3. 本条不主张 `agentRuns` 空态的正解是什么，只主张 `#E-0070` 提出的那一条在这三段里不发生
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 行号与调用序如上

### E-0034 | repository | 自证类
- **来源定位**: **同一目录里已存在同一事件的白名单兼容写法，且该写法在生产代码零调用点。** `pupu:unchain_runtime/server/memory_v2_context_adapter.py:665-680`
  ```python
  def mark_partial(boundary: str, source: object, error: Exception) -> None:
      updater = getattr(admission, "update_diagnostics", None)
      if callable(updater):
          try:
              updater(
                  {
                      "journal_status": "partial",
                      "context_build_status": "partial",
                      "persistence_degraded": True,
                      "persistence_boundary": boundary,
                      "persistence_error_code": str(
                          getattr(error, "code", type(error).__name__)
                      )[:128],
                  }
              )
          except Exception:
              pass
      partial_attempt_sink(boundary, source, error)
  ```
  - 该 `mark_partial`（定义于 `:665`）被同文件三处接线：`:687`（`PupuContextReferencePolicy`，构造于 `:684`）· `:700`（`ContextCompileCoordinator`，构造于 `:696`）· `:718`（`ContextRuntime`，构造于 `:714`）。**即它绑的是与 `mark_host_partial` 完全相同的那几类 unchain sink**
  - **宿主函数 `bind_pupu_context_module`（`:609-737`，返回构造于 `:726`）在生产代码零调用点**：`grep -rn "bind_pupu_context_module" unchain_runtime/server/ | grep -v "/tests/"` → 仅 `:609`（定义）与 `:794`（`__all__` 导出）
  - 其 docstring `:621-625` 自陈：`"The returned module is not registered anywhere by this function. PuPu's production assembly remains unchanged until the explicit cutover task."`
  - **写入语义为整字典替换**：`updater` 即 `admission.update_diagnostics`，语义见 `memory_v2_context.py:517-519`（`0000-0002-2026-0807#E-0070` 已取证，本条不重取）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '609,737p' unchain_runtime/server/memory_v2_context_adapter.py
  grep -rn "bind_pupu_context_module" unchain_runtime/server/ | grep -v "/tests/"
  grep -rn "PupuContextReferencePolicy(" unchain_runtime/server/ | grep -v "/tests/"
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 评估结论与建议处置二（四个 `unchain_*` 键是同一事件的第二次命名，且第一次命名是白名单兼容的）；支持约束 3 与 UR-4（接线陷阱）；**为 `0000-0002-2026-0807#E-0034` 的对照组 Q3 提供一个代码内实例** —— 该对照组不是假想构造，代码库里有一个真实的兄弟实现
- **完整性限制**: 1. **未核实** 该绑定器为何未接线、是否有计划接线（属项目历史，非代码事实）。2. **未核实** `context_build_status` / `persistence_boundary` 两键在收端有无其他消费路径（收端属 `code-owner-shared-arteries`；本条只作白名单成员判定，见 E-0035）。3. 本条 **不主张** 应当直接接线该绑定器 —— 恰相反，见 S-0005 约束 3
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 原文与零调用点如上

### E-0035 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:9-69`（`TOP_LEVEL_KEYS`）的成员判定 —— 对 E-0034 所列 5 键与相关键逐一求交
- **取得方式**: 机械集合运算，PuPu `b2385d5d`
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && python3 -c "
  import re
  s=open('src/SERVICEs/runtime_events/memory_v2_trace_presenter.js').read()
  m=re.search(r'TOP_LEVEL_KEYS = Object.freeze\(\[(.*?)\]\)', s, re.S)
  keys=re.findall(r'\"([^\"]+)\"', m.group(1))
  print('count', len(keys))
  for k in ['journal_status','context_build_status','persistence_degraded','persistence_boundary',
            'persistence_error_code','trace_status','status','memory_agent_runs','memory_curator']:
      print(k, k in keys)
  "
  ```
  输出：
  ```
  count 59
  journal_status True          context_build_status False
  persistence_degraded True    persistence_boundary False
  persistence_error_code True  trace_status True
  status True                  memory_agent_runs True
  memory_curator False
  ```
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 建议处置二（改发既有键即可透过，无需扩表）与建议处置四（`memory_agent_runs` 在白名单内，其空态与收端白名单无关）；**复核确认** 本案 E-0002 的 59 项计数
- **完整性限制**: **只覆盖 `TOP_LEVEL_KEYS` 这一个字面量的成员判定。** 不主张这些键在 presenter 内部被如何使用，也不主张收端会因此产出何种 `status` —— 收端行为属 `code-owner-shared-arteries`。**未核实** 是否存在以变量拼出的键名旁路（与本案 E-0002 同一限制）。**越界只读**：该文件属 `code-owner-shared-arteries`
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 输出如上

### E-0036 | repository | 自证类
- **来源定位**: **admission 每次调用新建，诊断不跨回合携带。** `pupu:unchain_runtime/server/memory_v2_context.py:1182`（`def resolve_memory_v2_admission`）· `:1304-1346`（函数体内 **唯一** 的 `_StickyMemoryV2Admission(...)` 构造，类定义在 `:595`）· `:1463`（**唯一** 的 `return admission`）。函数体内无任何缓存查表或复用分支；`unchain_adapter.py` 三个调用点 `:7557` `:8454` `:9056` 每回合各调一次
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '1182,1200p;1300,1350p;1455,1465p' unchain_runtime/server/memory_v2_context.py
  grep -n "_StickyMemoryV2Admission(" unchain_runtime/server/memory_v2_context.py   # -> 1304 (唯一构造)
  grep -n "^    return admission$" unchain_runtime/server/memory_v2_context.py      # -> 1463 (唯一)
  grep -n "_resolve_memory_v2_admission" unchain_runtime/server/unchain_adapter.py
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 结论的一条支腿 —— **排除**「上一回合写下的 `unchain_context_status="partial"` 被带进下一回合成功回合的 bundle」这条替代通路
- **完整性限制**: 只覆盖 **进程内内存对象** 的生命周期。**未核实** 持久化侧（SQLite `attempts` / `task_state` 表）是否会把等价信息带回后续回合再注入 diagnostics；`_apply_chat_admission_record`（`:1421`）确实会把持久化的 admission 记录写回 admission，但 **本条未核实其字段集合是否含这四个键**（按 E-0030，这四个键在全仓只有 8 处写入且全在 adapter，故本领域倾向于否，但 **未核实即不主张**）
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 单一构造点、单一 return

### E-0037 | repository | 自证类
- **来源定位**: **`RunCaptureStatus` 属 unchain 的 curator 域，且其取值已经以 `capture_quality` 的形式跨过接缝进入 PuPu。**
  - unchain `a4e69f41`：`src/unchain/memory/curator/models.py:80-83`
    ```python
    class RunCaptureStatus(StrEnum):
        COMPLETE = "complete"
        PARTIAL = "partial"
        UNAVAILABLE = "unavailable"
    ```
    引用它的文件共 4 个，**全部在 `src/unchain/memory/curator/` 与 `src/unchain/persistence/sqlite_curator_v2.py`**
  - PuPu `b2385d5d`：`unchain_runtime/server/memory_v2_store.py:628` `:649` 以 `capture_quality TEXT NOT NULL DEFAULT 'unknown'` 建列；`:3688` 读作 `"capture_outcome": row["capture_quality"]`；`memory_v2_context_adapter.py:563` `:582` 以 `task_state_read.capture_quality.value` 落值；`unchain_adapter.py:931-935` `capture_outcome = str(capture.get("capture_quality") ...)` 并在 `:936` 判 `capture_outcome != "complete"`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn "class RunCaptureStatus" -A 5 src/ ; grep -rln "RunCaptureStatus" src/
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "capture_quality" unchain_runtime/server/*.py | grep -v "/tests/" | head -20
  sed -n '929,938p' unchain_runtime/server/unchain_adapter.py
  ```
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 建议处置三对 **外部依赖登记甲** 的表态 —— 本条 **缩小** 那项调查的范围（同簇关系落在 `capture_quality` 这条线上，不落在四个 `unchain_*` 键上），**不替该调查作结论**
- **完整性限制**: **不主张** PuPu trace 四态与 `RunCaptureStatus` 属同簇或不属同簇 —— 那是在跑调查的待答问题，且其判断权不在本边界（`expert-llm` / `code-owner-unchain`）。**不主张** `capture_quality` 与本案四个键语义相同。**未核实** `capture_quality` 的取值域是否与 `RunCaptureStatus` 完全一致（PuPu 侧另有 `'unknown'` / `'legacy'` 两个值，见 `memory_v2_store.py:628` `:4079`，**这本身可能是第五处同词异义，本条只登记不展开**）
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 定义与消费点如上

### E-0038 | repository | 自证类
- **来源定位**: **四个键的产出前提是 memory_v2 rollout ≠ off，而其默认值为 off。**
  - `pupu:unchain_runtime/server/unchain_adapter.py:7474`（`if memory_v2_shadow_run is not None and options.get("_memory_v2_requested") is True:`）—— sink 注册（`:7545`）在该分支内
  - `pupu:electron/main/services/unchain/memory_v2_rollout.js:135-142`：`configuredMode = featureEnabled ? normalizeMode(readValue(rolloutMode), "off") : "off"`；`:150` `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`
  - `pupu:src/SERVICEs/feature_flags.js:53-57`：`enable_memory_v2: { ..., defaultValue: false }`；`:7-20` `readBuildFeatureFlagDefaults()` 允许构建期 env（JSON）覆盖该默认值
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '7472,7478p;7540,7548p' unchain_runtime/server/unchain_adapter.py
  sed -n '120,175p' electron/main/services/unchain/memory_v2_rollout.js
  sed -n '1,60p' src/SERVICEs/feature_flags.js
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 不确定性二之 3（适用边界）；**限定** `case.md`「发布配置下今天就在发生」中「发布配置」一词的可核实性 —— 本条只证明 **默认值为 off 且可被构建期覆盖**，**不证明发布构建里它是 on 还是 off**
- **完整性限制**: **本条不主张发布构建的实际取值。** 构建期 env 的注入点、CI 配置与已发布制品均 **不在本边界**（`code-owner-devtools` / `code-owner-electron` / 发布链）。**本条明确交「未核实」**，并指出能核实的人。`memory_v2_rollout.js` 与 `feature_flags.js` 均为 **越界只读**
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 默认值与门条件如上

### E-0039 | repository | 自证类
- **来源定位**: **shadow（观察）面的持久化失败会中止用户当前回合。**
  - `pupu:unchain_runtime/server/unchain_adapter.py:10188-10192`：`runtime_event_callback = shadow_bridge.compose_event_callback(on_event) if shadow_bridge is not None else on_event`（`shadow_bridge` 取自 `:10183-10187`）；该值直接作为 `agent.run(callback=...)` 传入（`:10280`）。resume 生成器同形：`:10893` / `:11002`
  - `pupu:unchain_runtime/server/memory_v2_unchain_shadow_bridge.py:328-353` `compose_event_callback`：docstring 自陈 `"Use Unchain's re-entrant durable-before-host callback composer."`；`persist_or_forward` 内 **无吞异常**
  - unchain `a4e69f41` `src/unchain/context/runtime.py:1903-1923` `persist_before_host`：`self.persist_event(event)` **先于** `host_callback(event)`，`try/finally` 只 reset contextvar，**不吞异常**
  - unchain `src/unchain/kernel/loop.py:678-695` `emit_event`：`callback(event)` **无 try/except**
  - PuPu 侧终点：`unchain_adapter.py:10318-10329` `except Exception as run_error: ... output_holder["error"] = run_error` → `:10397-10405` `raise error`
  - **active 面同形**：`emit_if_active`（`:10172-10181`）内 `active_context_bridge.persist_host_event(event)` **无 try/except**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '10170,10195p;10276,10282p' unchain_runtime/server/unchain_adapter.py
  grep -n "runtime_event_callback" unchain_runtime/server/unchain_adapter.py
  grep -n "def compose_event_callback" -A 26 unchain_runtime/server/memory_v2_unchain_shadow_bridge.py
  cd /Users/red/Desktop/GITRepo/unchain
  grep -n "def compose_event_callback" -A 20 src/unchain/context/runtime.py
  sed -n '678,696p' src/unchain/kernel/loop.py
  ```
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 建议处置五 UR-1（本领域边界内的未决项）；与 E-0031 / E-0032 合并支持 S-0005 结论
- **完整性限制**: 1. **静态读取，未做故障注入，未观察过一次真实的 shadow 写失败。** 2. **未核实** shadow 面在发布构建下是否可达（依赖 rollout 取值，见 E-0038）。3. 本条 **不主张** 应当把 shadow 失败改成静默 —— 那是一次会改变持久化保证的取舍，属方案层，且可能触及 `expert-llm` 与 `expert-architecture`
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 无吞异常层，链路如上

### E-0040 | repository | 自证类
- **来源定位**: **三处 `mark_*_partial` 的分支条件不一致。** `pupu:unchain_runtime/server/unchain_adapter.py`
  - `:7451-7472` `mark_host_partial`：`if admission.is_active:` 写 `unchain_context_status` / `unchain_context_error_code`（默认错误码 `context_v2_persistence_failed`）；`else:` 写 `unchain_shadow_status` / `unchain_shadow_error_code`（默认 `context_v2_shadow_persistence_failed`）
  - `:8403-8414` `mark_graph_active_partial`：**无任何 `is_active` 判断**，仅 `if admission is not None:`，无条件写 `unchain_context_status` / `unchain_context_error_code`（默认 `context_v2_graph_persistence_failed`）
  - `:8554-8562` `mark_graph_shadow_partial`：**无任何 `is_shadow` 判断**，无条件写 `unchain_shadow_status` / `unchain_shadow_error_code`
  - 注册面：`mark_graph_active_partial` 绑 `:8442` graph active preflight；`mark_graph_shadow_partial` 绑 `:8618` graph shadow bridge（该分支位于 `elif graph_memory_v2_admission.is_shadow:` 之内）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '7451,7473p;8403,8416p;8554,8563p' unchain_runtime/server/unchain_adapter.py
  sed -n '8436,8446p;8606,8622p' unchain_runtime/server/unchain_adapter.py
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 约束 5 与 UR-2；**补足** 本案 E-0003 —— E-0003 记「`mark_host_partial` **显式按 `admission.is_active` 分支**」，本条指出 **另外两处没有对应的分支**
- **完整性限制**: 本条只作 **控制流对比**，**不主张** 哪种分支写法是对的 —— 那取决于这四个键（或其替代）最终的语义规格，属 `expert-llm`。`mark_graph_shadow_partial` 的注册点确实在 `is_shadow` 分支内，故其无条件写在当前接线下不产生错误取值；**本条主张的是函数自身不携带该前提**，一旦注册点变化即失去保护
- **验证历史**:
  - S-0005 | 已验证（由 `code-owner-runtime` 实跑）| 三处分支形态如上

### E-0050 | repository | 自证类
- **来源定位**: PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（branch `dev`）；`src/` `electron/` `unchain_runtime/` 三个产品目录 dirty 数为 **0**；`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js` sha256 = `9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  git rev-parse HEAD
  git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l      # -> 0
  shasum -a 256 src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  node --version                                                          # -> v24.18.0
  ```
  观察者 `expert-security`，2026-08-08（本轮出庭时点）
- **提交发言**: S-0009
- **支持/反驳**: **第三次独立满足 E-0001 完整性限制所要求的重测**（「未检查是否有并发会话在庭审期间改动产品目录」）。HEAD 与 E-0001 / E-0010 所载一致，presenter 文件摘要与 E-0010 所载 **逐字符相同** —— 即 `code-owner-shared-arteries` 观察时点与本领域观察时点之间，该制品未被改动
- **完整性限制**: 与 E-0001 / E-0010 同一条：**只证明三个时点各测一次都是 0，不能证明整场庭审期间无并发改动**。不覆盖 `.claude/` 下的案卷文件
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 实跑）| HEAD 与 sha256 如上

### E-0051 | repository | 自证类
- **来源定位**: **`BLOCKED_KEY_PATTERN` 从不作用于顶层键；封闭白名单是通往持久化的整条路径上唯一的顶层键过滤器。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`（sha256 见 E-0050）
  - `:6-7` `BLOCKED_KEY_PATTERN` 定义
  - `:117` —— **该正则在全文的唯一施加点**：`if (!key || BLOCKED_KEY_PATTERN.test(key)) continue;`，位于 `sanitizeNode` 的 `Object.entries(value)` 循环内（`:112-120`），即 **只作用于 plain object 的嵌套键**
  - `:124-133` `sanitizeMemoryV2TraceBundle` —— 循环体为 `for (const key of TOP_LEVEL_KEYS) { if (!hasOwnProperty(raw,key)) continue; const sanitized = sanitizeNode(raw[key]); ... }`。**传给 `sanitizeNode` 的是 `raw[key]`（值），`key` 本身从不作为参数传入，因而顶层键名一次都未被测试**
  - **59 项白名单与 `BLOCKED_KEY_PATTERN` 的交集为空**（机械求交，命令见下）
  - **持久化侧无第二道顶层防线**：`pupu:src/SERVICEs/chat_storage/chat_storage_sanitize.js:739-740` 为 `const memoryV2 = sanitizeMemoryV2TraceBundle(b.memory_v2); if (memoryV2) bundle.memory_v2 = memoryV2;` —— **原样接收，无追加过滤**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "BLOCKED_KEY_PATTERN" src/SERVICEs/runtime_events/memory_v2_trace_presenter.js   # -> :6 定义, :117 唯一施加点
  sed -n '94,133p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  sed -n '735,742p' src/SERVICEs/chat_storage/chat_storage_sanitize.js
  python3 -c "
  import re
  s=open('src/SERVICEs/runtime_events/memory_v2_trace_presenter.js').read()
  m=re.search(r'TOP_LEVEL_KEYS = Object\.freeze\(\[(.*?)\]\)', s, re.S)
  keys=re.findall(r'\"([^\"]+)\"', m.group(1))
  pat=re.compile(r'(?:reasoning|chain[_-]?of[_-]?thought|hidden[_-]?thought|password|passwd|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)', re.I)
  print('count', len(keys), '| matching BLOCKED_KEY_PATTERN:', [k for k in keys if pat.search(k)] or 'NONE')
  print('members ending in _status:', [k for k in keys if k.endswith('_status')])
  "
  ```
  输出：`count 59 | matching BLOCKED_KEY_PATTERN: NONE` · `members ending in _status: ['trace_status', 'journal_status']`
- **提交发言**: S-0009
- **支持/反驳**:
  - **支持 S-0009 的 `不成立`（顶层准入开放化）与 SEC-1**
  - **修正 `0000-0002-2026-0807#E-0072` 的一处刻画**（不反驳其任何事实）：该证据把二者描述为「一个安全过滤器被同时当成 schema 用」。**本条证明二者的关系是分层而非重叠** —— `TOP_LEVEL_KEYS` 守顶层、`BLOCKED_KEY_PATTERN` 守嵌套层，**互不冗余，缺一即该层无防护**。故那张表 **本身就是安全过滤器的一部分**
  - **不反驳** 本案 E-0011 对 `:124-133` 与 `:350-352` 的任何描述，是对同一段代码在安全维上的补充读法
- **完整性限制**: 1. 只覆盖该文件内 `BLOCKED_KEY_PATTERN` 的字面出现与 `sanitizeMemoryV2TraceBundle` / `sanitizeNode` 两个函数体。**未核实** 是否存在以变量或动态构造施加同一正则的第二处（与本案 E-0002 同一条限制）。2. `chat_storage_sanitize.js` 属 `code-owner-shared-arteries` 边界，**本条为越界只读**，只作「有无追加过滤」的结构判定，不对其改法表态。3. **未覆盖渲染侧**：`presentMemoryV2Audit` 之后到像素之间是否另有过滤，属 `code-owner-chat-bubble`，**未核实**（本条结论不依赖该半边）
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 读取与机械求交，行号与输出可复核）

### E-0052 | probe | 自证类
- **来源定位**: 可复现探针。基线 `<scratchpad>/secprobe/baseline.mjs`（sha256 `9778e5be…`，**与产品文件逐字节相同**，见 E-0050）；变体 `<scratchpad>/secprobe/variant_pattern.mjs`（sha256 `56796463…`）—— **唯一改动是把 `sanitizeMemoryV2TraceBundle` 的准入循环由「遍历 `TOP_LEVEL_KEYS`」改为「遍历 `Object.keys(raw)`，命中白名单 *或* 匹配 `/(?:_status|_error_code)$/` 即准入」**，全文其余部分逐字节不变。运行脚本 `<scratchpad>/secprobe/run.mjs`
- **取得方式**: `node <scratchpad>/secprobe/run.mjs`（`node v24.18.0`）。输入为本领域现场编造的 bundle，**其中 token 形状字符串为假值，未取用任何真实凭据**
- **提交发言**: S-0009
- **支持/反驳**: **支持 S-0009 的 `不成立`**；**回答 `code-owner-shared-arteries` 约束 4 的把关请求**（其原文要求该方向「须先过 `expert-security`」）
- **完整性限制**:
  1. **本条测的是「模式准入」这一 *方向*，用的是一个代表性模式（`*_status` / `*_error_code`）。** 换一个更窄的模式会改变哪些键被放行，**但不改变本条的结论** —— 结论是「顶层准入放开后，被放行的键 **不再经过任何键级过滤**」，这一点与模式的宽窄无关
  2. **本条不主张有人提出了该方向。** 今天没有人提出；本条是应约束 4 的预先把关
  3. **ESM 直接 import 产品文件的复制件，未经 webpack / jest 管线**，故不覆盖构建期变换（与本案 E-0012 同一条限制）
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 实跑，输出可复现）| 结果如下

  ```
  === T1 · top-level blocked-looking keys, closed whitelist vs open pattern ===
  baseline(closed)   keys= ["mode"]
  pattern(open)      keys= ["mode","reasoning_status","credential_status",
                            "api_key_error_code","access_token_status","unchain_context_status"]
    LEAK credential_status = sk-ant-api03-QQQQQQQQ-REDACTED-LOOKING-TOKEN
    LEAK reasoning_status  = verbatim hidden chain of thought text

  === T2 · nested blocked key under an admitted top-level key (control) ===
  baseline   {"ok":1}
  pattern    {"ok":1}
  ```

  **T1 是关键**：顶层的 `credential_status` / `api_key_error_code` / `access_token_status` / `reasoning_status` **连值一起被放行**。**T2 是对照组**：同一家族的键名在 **嵌套** 层，两个变体都正常拦掉（`api_key` 与 `reasoning` 均不在输出中）。**同一个正则，两层，两个结果 —— 因为它只装在下面那一层。**

### E-0053 | probe | 自证类
- **来源定位**: 同 E-0052 的基线与运行环境。`<scratchpad>/secprobe/run.mjs` 的 T3 段
- **取得方式**: `node <scratchpad>/secprobe/run.mjs`
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009 专业理由六之 US-2（**既存性质，本领域明确不要求本案处置**）；**限定** 对该制品的一处常见描述 —— 它是 **键名级** 脱敏器，不是值级脱敏器
- **完整性限制**: 1. **本条是既存行为的登记，不是本案引入的缺陷。** 2. 只测了字符串值一种情形。3. 与 E-0052 同一条构建管线限制
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 实跑）| 结果如下

  ```
  === T3 · secret in the VALUE of a whitelisted key ===
  baseline reason = auth failed for sk-ant-api03-QQQQQQQQ-REDACTED-LOOKING-TOKEN
  ```

  即：白名单内的 `reason` 键，其值原样通过（仅受 `sanitizeNode:100` 的 8192 字符截断约束），`BLOCKED_KEY_PATTERN` 不参与值的判定。presenter 随后把它投为 `reason`（`:381`，1000 字符）。

### E-0054 | repository | 自证类
- **来源定位**: **本仓有三份同职的「安全错误码」构造，两份严格、一份宽松；而严格那份今天已经在给一个 *已在白名单内* 的键供值。**
  - **严格 ①**：`pupu:unchain_runtime/server/unchain_adapter.py:259-268 _memory_v2_safe_error_code` —— `str(getattr(error,"code","") or "").strip().lower()`，仅当 `re.fullmatch(r"[a-z0-9_.:-]{1,96}")` 时采用；否则回落为异常类名（`re.sub(r"[^a-z0-9]+","_",...)` 后 `[:96]`）。**这是本案四个 `unchain_*_error_code` 的唯一取值来源**（调用点 `:7459` `:7468` `:8412` `:8561`）
  - **严格 ②**：`pupu:unchain_runtime/server/memory_v2_context.py:3529-3536 _safe_error_code` —— **与 ① 逐字同构**（同一正则 `[a-z0-9_.:-]{1,96}`、同一回落）
  - **② 今天已经在供白名单内的键**：同文件 `:4291-4302 _mark_memory_v2_partial` 写 `{"journal_status":"partial","persistence_degraded":True,"persistence_error_code":error_code}` —— **三个键全部在 59 项白名单内**（本案 E-0035 已作成员判定）
  - **宽松 ③**：`pupu:unchain_runtime/server/memory_v2_context_adapter.py:675-677` —— `"persistence_error_code": str(getattr(error,"code",type(error).__name__))[:128]`。**无任何字符类过滤，上限 128**。该函数即本案 E-0034 所述的「已存在的正确表达」，`code-owner-runtime` 建议处置二据其提出形状 P
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "_memory_v2_safe_error_code" unchain_runtime/server/unchain_adapter.py
  sed -n '259,269p;7451,7472p' unchain_runtime/server/unchain_adapter.py
  grep -n "def _safe_error_code\|def _mark_memory_v2_partial" unchain_runtime/server/memory_v2_context.py
  sed -n '3529,3537p;4291,4303p' unchain_runtime/server/memory_v2_context.py
  sed -n '665,682p' unchain_runtime/server/memory_v2_context_adapter.py
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0009
- **支持/反驳**:
  - **直接回答本庭对本领域的指名要求**（「`_memory_v2_safe_error_code` 的实际取值域请自行核实」）
  - **支持 S-0009 对 Q2 的答案（形状 A 增量暴露为零）**：A 要接纳的值域与 ② 今天已经在写进白名单的值域 **是同一个**
  - **支持 SEC-5**：形状 P 若复用 ③ 的代码，错误码过滤由「字符类 fullmatch + 96」退化为「无过滤 + 128」
  - **不反驳** 本案 E-0034 的任何事实 —— E-0034 证明 ③ 的键名是白名单兼容的，**本条只指出其值构造弱于 ①/②**，二者不冲突
- **完整性限制**:
  1. **只覆盖这三处构造本身**，**未穷举** `_mark_memory_v2_partial` 全部调用点传入的 `error_code` 是否一律来自 ②（`memory_v2_context.py` 内另有 `:1518` `:4300` `:4745` 等多处 `error_code` 赋值点，**本条未逐一追**）。故「② 今天在供值」成立，「② 是唯一供值者」**未核实**
  2. **`getattr(error, "code")` 的实际取值来源未穷举** —— 需要枚举 unchain durable 边界上可能抛出的全部异常类型及其 `.code` 属性。**本条只界定字符类与长度的上界，不主张实际出现过哪些值**
  3. **不主张任何值曾经泄漏过。** 本条是值域界定，不是泄漏观察
  4. 三个文件均属 `code-owner-runtime` 边界，**本条为越界只读**，只作值域安全判定，不对产端改法表态
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 读取，行号与原文可复核）

### E-0055 | probe | 自证类
- **来源定位**: 同 E-0052 的基线与运行环境。两个 C 变体，**均由本领域按本案 E-0013 的文字描述自行重建**（「`TOP_LEVEL_KEYS` 一项不动，在 `sanitizeMemoryV2TraceBundle` 末尾加一次归一」）：
  - `<scratchpad>/secprobe/variant_c_naive.mjs`（sha256 `e6a46223…`）—— 循环之后 `output.trace_status = raw.unchain_context_status || raw.unchain_shadow_status` / `output.persistence_error_code = raw.unchain_context_error_code || raw.unchain_shadow_error_code`，**直接写 raw 值**
  - `<scratchpad>/secprobe/variant_c_careful.mjs`（sha256 `b85f9503…`）—— 同一归一，但先经 `typeof v === "string" ? v.trim().toLowerCase().slice(0,48) : ""`，且 **不覆盖已存在的同名键**
- **取得方式**: `node <scratchpad>/secprobe/run.mjs`（T4 段）
- **提交发言**: S-0009
- **支持/反驳**:
  - **直接回答本庭四个必答问之一**（「合成值会不会绕过 `BLOCKED_KEY_PATTERN`」）与 **E-0013 完整性限制第 1 条移交给本领域的问题**
  - **支持 SEC-2**；**不反驳 E-0013 的任何一项实测结论** —— E-0013 测的是「C 能不能把 `Complete` 纠正为 `Partial`」，成立；本条测的是「C 的合成值走不走脱敏」，是 E-0013 自陈未答的那一问
- **完整性限制**:
  1. **本条的两个变体是本领域按 E-0013 的文字描述重建的，不是 E-0013 那个文件。** 故本条严格证明的是 **「按该描述最自然地实现会怎样」**，不是「提交人写的那份会怎样」。**若提交人那份已走 `sanitizeNode`，SEC-2 对它即为已满足** —— 本条不主张它没走，只主张 **E-0013 正文未声明它走没走，而安全后果完全取决于此**
  2. 输入的 hostile 值为本领域现场编造，**未取用任何真实凭据**；且 **本条不主张产端曾发出过对象值或超长值**（按本案 E-0054，`_memory_v2_safe_error_code` 恒返回 ≤96 字符串），**本条测的是防线是否存在，不是防线是否已被击穿**
  3. 与 E-0052 同一条构建管线限制
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 实跑，输出可复现）| 结果如下

  ```
  === T4 · shape C, hostile/degenerate producer value in unchain_context_error_code ===
  C-naive     object-valued  -> persistence_error_code =
      {"api_key":"sk-ant-api03-QQQQQQQQ-REDACTED-LOOKING-TOKEN",
       "nested":{"deep":{"deeper":{"deepest":{"x":1}}}}}
  C-naive     20000-char str -> typeof/len = string 20000
  C-careful   object-valued  -> persistence_error_code = undefined
  C-careful   20000-char str -> typeof/len = string 48
  ```

  **C-naive 行是关键**：合成值 **从未进入 `sanitizeNode`**，因而同时越过 `BLOCKED_KEY_PATTERN`（嵌套 `api_key` 完整保留）、`MAX_STRING_LENGTH=8192`（20000 原长）、`MAX_DEPTH=6`、`MAX_ARRAY_LENGTH`、`MAX_OBJECT_KEYS` **五道**。**C-careful 行证明这不是 C 的固有性质** —— 归一之后五道全部恢复。

### E-0056 | probe | 自证类
- **来源定位**: 同 E-0055 的三个变体与运行环境。`<scratchpad>/secprobe/run.mjs` 的 T5 / T6 段
- **取得方式**: `node <scratchpad>/secprobe/run.mjs`
- **提交发言**: S-0009
- **支持/反驳**: 支持 **SEC-3**（合成不得覆盖产端断言）；**独立到达** `code-owner-shared-arteries` 建议处置一所述「同键异义」的同一结论，路径不同（本条从取证完整性到达，非从词汇歧义到达）；**排除** 一项本领域自己怀疑过的风险（C 是否会因反复 sanitize 而累积或漂移 —— **不会**）
- **完整性限制**: 1. 与 E-0055 同一条重建限制（变体系本领域按 E-0013 描述重建）。2. T5 的 `presentMemoryV2Audit` 一列因本领域传入的 bundle 外壳形状不合其入参约定而返回 `undefined`，**本条不主张渲染侧的任何结果**，只主张 **持久化侧的取值**（第一列）。3. 与 E-0052 同一条构建管线限制
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 实跑）| 结果如下

  ```
  === T5 · shape C, producer already asserted trace_status ===
  输入 { mode:"active", trace_status:"complete", unchain_context_status:"partial" }
  baseline    persisted trace_status = "complete"
  C-naive     persisted trace_status = "partial"     <- 产端断言被收端派生值覆写并落盘
  C-careful   persisted trace_status = "complete"

  === T6 · idempotence (sanitize(sanitize(x)) === sanitize(x)) ===
  baseline    idempotent | {"mode":"active"}
  C-naive     idempotent | {"mode":"active","trace_status":"partial",
                            "persistence_error_code":"context_v2_persistence_failed"}
  C-careful   idempotent | 同上
  ```

  **T5**：C-naive 使一条已落盘的记录不再能区分「产端这么说的」与「收端这么判的」。**T6**：三个变体全部幂等，**C 不引入累积或漂移**。

### E-0057 | repository + probe | 自证类
- **来源定位**: **现有唯一那条安全测试在本案两个会造成安全回退的变体下 *保持绿灯*；且它四条安全断言里有两条实际由字段表满足，而非由脱敏器满足。**
  - **fixture 的分层事实**：`pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js:47-48` —— `reasoning: "must never be exposed"` 与 `credentials: { api_key: "must-never-persist" }` **嵌套在 `memory_agent_runs` 的元素对象内**（走 `BLOCKED_KEY_PATTERN`）；`:50-51` —— `unknown_payload` 与 `chain_of_thought` **在顶层**（走 `TOP_LEVEL_KEYS`，**不经 `BLOCKED_KEY_PATTERN`**，见 E-0051）
  - **测试名**：`:91` `"uses only the explicit audit allowlist and strips hidden reasoning and credentials"`，四条安全断言在 `:95-99`
  - **实测绿灯**：把 `:95-101` 的六条断言原样施加于 `variant_pattern.mjs`（E-0052）与 `variant_c_naive.mjs`（E-0055），**全部通过**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '37,52p;91,111p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  grep -n "chain_of_thought\|credentials\|unknown_payload\|must never be exposed\|must-never-persist" \
    src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  node <scratchpad>/secprobe/run2.mjs
  ```
  PuPu `b2385d5d`；`node v24.18.0`
- **提交发言**: S-0009
- **支持/反驳**:
  - **支持 S-0009 对 Q4 的判断**（本案应处置测试拆分）与 **SEC-6**
  - **支持本案 E-0019 的结论，理由不同**：E-0019 从「红灯不可归因」到达；**本条从「这条测试对本案的两个回退变体全绿」到达**。二者相互独立
  - **限定** 该测试的证明力：它 **不是** 本案的安全网
- **完整性限制**:
  1. **未在 jest 下跑该测试文件本身。** 本条是把 `:95-101` 的断言逻辑 **原样重述** 后施加于三个变体，属 **等价重述而非原测试运行**；fixture 亦为按 `:37-52` 安全相关部分的重述（token 形状串为本领域编造的假值）。**若原 fixture 另含本条未复制的键而恰好能触发红灯，本条结论会被削弱** —— 本领域已逐行比对 `:37-52` 的安全相关项，认为不存在，但 **不主张为零**
  2. 该测试文件依 A-008 归 `code-owner-shared-arteries`，**本条为越界只读**，只作「现有断言能否检出两个回退变体」的判定，**不主张应当如何拆分**（那属方案庭审）
  3. 本条 **不评价** 该测试对其非安全职责（字段表、挂载门）的覆盖是否充分 —— 那已由本案 E-0019 出证
- **验证历史**:
  - S-0009 | 已验证（由 `expert-security` 读取与实跑）| 结果如下

  ```
  === existing safety test (test.js:91-102) run against each variant ===
  baseline         TEST GREEN
  pattern(open)    TEST GREEN     <- 顶层准入已开放，仍然全绿
  C-naive          TEST GREEN     <- 合成值已绕过 sanitizeNode，仍然全绿

  === which gate actually removes each fixture entry (baseline) ===
  chain_of_thought at TOP level -> 由白名单移除（顶层键从不经 BLOCKED_KEY_PATTERN）
  reasoning NESTED              -> 由 BLOCKED_KEY_PATTERN 移除，输出 {"ok":1}
  ```

### E-0070 | repository | 自证类
- **来源定位**: **PuPu trace 四态与 unchain `ContextBuildStatus` 四值逐字全等。**
  - 收端四态：`pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:167`（`"Complete"`）· `:169`（`"Partial"`）· `:171`（`"Legacy"`）· `:172`（`"Unavailable"`），`:174-195` 的全部后续分支复用同四值，**`resolveTraceStatus` 的返回值域即此四项，无第五项**
  - 上游枚举：`unchain:src/unchain/journal/models.py:98-102`
    ```python
    class ContextBuildStatus(StrEnum):
        COMPLETE = "complete"
        PARTIAL = "partial"
        LEGACY = "legacy"
        UNAVAILABLE = "unavailable"
    ```
  - 对照：`unchain:src/unchain/memory/curator/models.py:80-83` `RunCaptureStatus` 只有三值（`complete`/`partial`/`unavailable`），**无 `legacy`**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '162,196p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  cd /Users/red/Desktop/GITRepo/unchain && sed -n '90,108p' src/unchain/journal/models.py
                                           sed -n '79,84p'  src/unchain/memory/curator/models.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 专业理由一之(1) 与评估结论（形状 A 不成立）；**更正** 本案 E-0037 与 S-0005 建议处置三所指的同簇落点 —— 该处指 `RunCaptureStatus`，实测四态的逐字对应物是 `ContextBuildStatus`
- **完整性限制**: **只主张两个值域逐字全等这一集合事实。** 不主张二者语义相同（语义判断在专业理由里，属判断不属观察），不主张 PuPu 当初是照它写的（**项目历史未核实，我不从 git 历史推**）。`journal/models.py` 属 `code-owner-unchain` 边界，**本条为越界只读，不请求任何 unchain 侧改动**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 四值逐字对应如上

### E-0071 | repository | 自证类
- **来源定位**: **unchain 自己的 harness 已经在 trace 里发一个字面叫 `context_build_status` 的字段，active 与 shadow 两个面各一次，取值即 `ContextBuildStatus`。**
  - `unchain:src/unchain/context/harness.py:66-70`（`ContextCompilerHarness.build_delta`，active 面）：
    ```python
    trace={
        "semantic_context_owner": self.semantic_context_owner,
        "context_build_id": envelope["build_id"],
        "context_build_status": envelope["status"],
    },
    ```
  - 同文件 `:103-108`（`ContextShadowCompilerHarness.build_delta`，shadow 面）同形，另带 `"context_shadow": True` 与 `"would_replace_messages"`
  - **平面由容器承载而非键名**：active 写 `state_updates={"context_v2": {...}}`（`:60-64`），shadow 写 `state_updates={"context_v2_shadow": diagnostics}`（`:101`）；**两面发的字段名相同**
  - `envelope["status"]` 的类型：`unchain:src/unchain/context/models.py:178` `status: ContextBuildStatus = ContextBuildStatus.COMPLETE`，`:213` `object.__setattr__(self, "status", ContextBuildStatus(self.status))`（构造时强制转换）
  - PuPu 侧同名写入：`pupu:unchain_runtime/server/memory_v2_context_adapter.py:672` `"context_build_status": "partial"`（`bind_pupu_context_module` 内，生产零调用点，见本案 E-0034）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  sed -n '55,115p' src/unchain/context/harness.py
  grep -rn "context_build_status\|build_status" src/ | grep -v tests
  grep -n "status: ContextBuildStatus" src/unchain/context/models.py
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '665,682p' unchain_runtime/server/memory_v2_context_adapter.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 专业理由一之(2)（**架构师 `0000-0002-2026-0807#S-0020` 专业理由一之(3) 的「词随哪个制品到达」这条缺口，在四态这一条轴上今天可以关闭**）与专业理由五之(2)（`context_build_status` 不属诊断）；支持形状 A 理由 A-2（平面应由容器/取值承载而非键名前缀）
- **完整性限制**: 1. **只证明 unchain 在 `HarnessDelta.trace` 里发这个字段，未核实该 trace 是否经任何路径到达 PuPu 的 `memory_v2` bundle。** PuPu 侧的 bundle 由 `admission.diagnostics()` 组装（`0000-0002-2026-0807#E-0068`），与 harness trace 是两条不同的通路 —— **本条不主张它今天已经到达，只主张这个字段名与取值域在上游是既存的、typed 的**。2. `harness.py` / `context/models.py` 属 `code-owner-unchain` 边界，**越界只读**。3. `memory_v2_context_adapter.py` 属 `code-owner-runtime`，其取舍以该 owner 为准
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 原文与两面对称结构如上

### E-0072 | repository | 自证类
- **来源定位**: **上游在 `"complete"` / `"completed"` 这个词上是分裂的，分裂线不沿域、层或轴；且 unchain 自己已有一处与 PuPu 结构同形的双拼写归一。** unchain `a4e69f41`
  - 取 `"complete"` 的 typed 成员（3）：`journal/models.py:99` `ContextBuildStatus.COMPLETE` · `context/models.py:96` `HandoffStatus.COMPLETE` · `memory/curator/models.py:81` `RunCaptureStatus.COMPLETE`
  - 取 `"completed"` 的 typed 成员（6）：`memory/curator/models.py:69` `ConsolidationJobStatus` · `:75` `SourceRunStatus` · `:95` `ProcessDisposition`（三者与 `RunCaptureStatus` **同文件**）· `context/graph_checkpoint.py:82` `GraphTerminalStatus` · `providers/request_lease.py:57` · `providers/durable_turn_runtime.py:59`
  - 另加非枚举直接赋值：`kernel/run_outcomes.py:32` `state.run_status = "completed"`（**run 轴**）
  - **unchain 自己的同形归一器**：`context/host_adapter.py:57-66`
    ```python
    def _handoff_status(status: object) -> HandoffStatus:
        normalized = str(status or "").strip().casefold()
        if normalized in {"complete", "completed"}:
            return HandoffStatus.COMPLETE
        if normalized in {"failed", "error"}:
            return HandoffStatus.FAILED
        if normalized in {"cancelled", "canceled"}:
            return HandoffStatus.CANCELLED
        return HandoffStatus.PARTIAL
    ```
    对照 PuPu `memory_v2_trace_presenter.js:167-170`：`{complete, completed}` 同一对、`{failed, error}` 同一对，**顺序相同**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn '= "complete"$\|= "completed"$' src/ | grep -v tests
  grep -rn '"complete", "completed"' src/ | grep -v tests
  grep -rn "class HandoffStatus" -A 6 src/
  sed -n '45,80p' src/unchain/context/host_adapter.py
  sed -n '20,45p'  src/unchain/kernel/run_outcomes.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 专业理由二（双拼写的成因）；**确认** `code-owner-shared-arteries` S-0004 建议处置四「一个制品两个方向、同一个根因」这一判断成立，并把根因定位到两个不同深度（值 / 键）；**部分证成、部分不证成** 其「双拼写是当年为对付 unchain 词汇留下的痕迹」这一猜测 —— 证成「它在应付上游词汇」，**不证成** 具体的历史归因（未核实，且本条不打算从 git 历史推）
- **完整性限制**: **字面量 `grep` 枚举，与 `0000-0002-2026-0807#E-0069` 的 45 键同属一个失败类** —— 以变量、别名或动态构造定义的枚举成员会被漏掉，故 **「3 个」与「6 个」都是下界**。本条结论（上游在该词上分裂）不依赖精确计数。**未核实** PuPu 的 `raw.status` 在 `memory_v2` bundle 中的实际来源（`0000-0002-2026-0807#E-0068` 已证产端无声明形状）。全部落点在 unchain 仓，**越界只读，不请求任何 unchain 侧改动**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 分裂计数与同形归一器原文如上

### E-0073 | repository | 自证类
- **来源定位**: **`capture_quality` typed 为 `ContextBuildStatus`；typed 为 `RunCaptureStatus` 的字段名是 `capture_status`，是另一个字段。二者在 PuPu 的表上是相邻两列。**
  - unchain `a4e69f41`：`src/unchain/context/task_state.py:59` `capture_quality: ContextBuildStatus`（`:65-68` 构造时 `ContextBuildStatus(...)` 强制转换，`:129` `"capture_quality": self.capture_quality.value`）；`src/unchain/context/models.py:797-800` 对 `capture_quality` 同样以 `ContextBuildStatus(...)` 校验；`src/unchain/context/compiler.py:3332` `:3359` 写 `"capture_quality": ContextBuildStatus.UNAVAILABLE.value`
  - 对照：`src/unchain/memory/curator/models.py:193` `capture_status: RunCaptureStatus`（`:217` `_enum(...)` 构造时校验）；`RunCaptureStatus` 的非测试消费点全部在 `memory/curator/{coordinator,models}.py` 与 `persistence/sqlite_curator_v2.py`
  - PuPu `b2385d5d`：`unchain_runtime/server/memory_v2_context_adapter.py:563` `"capture_quality": task_state_read.capture_quality.value` · `:582` `capture_quality=task_state_read.capture_quality.value`；`memory_v2_store.py:627-628`（`attempts` 表）与 `:648-649`（`task_state` 表）**两列并排**：
    ```sql
    capture_status  TEXT NOT NULL DEFAULT 'open',
    capture_quality TEXT NOT NULL DEFAULT 'unknown',
    ```
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn "capture_quality" src/ | grep -v tests
  grep -rn "RunCaptureStatus" src/ | grep -v tests
  grep -rn "RunCaptureStatus" -B3 -A3 src/unchain/memory/curator/models.py
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '550,590p' unchain_runtime/server/memory_v2_context_adapter.py
  sed -n '624,652p' unchain_runtime/server/memory_v2_store.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: **反驳** 本案 E-0037 **来源定位** 首句「`RunCaptureStatus` … 其取值已经以 `capture_quality` 的形式跨过接缝进入 PuPu」，并据此 **限定** S-0005 建议处置三的调查范围收窄依据（方向对、落点错）；支持 S-0010 请求 3 的质疑
- **完整性限制**: 1. **只覆盖 `capture_quality` 的 typed 声明与 PuPu 侧的取值来源链**，**不主张** PuPu 的 `capture_status` 列一定由 `RunCaptureStatus` 填 —— 我 **未追** 该列的写入方（该列的 DEFAULT 是 `'open'`，不在任一枚举域内，**这本身是另一处待查**）。2. 字面量与类型注解读取，**未跑运行时**。3. PuPu 侧两个文件属 `code-owner-runtime` 边界，unchain 侧属 `code-owner-unchain`，**均为越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 类型注解、DDL 两列、PuPu 取值链如上

### E-0074 | repository | 自证类
- **来源定位**: **E-0037 登记的「可能的第五处同词异义」：`'legacy'` 在域内不是异义，`'unknown'` 才是自造哨兵，且有一条把它就地升格的 SQL。**
  - `'legacy'` 是 `ContextBuildStatus` 的第四个成员（`unchain:src/unchain/journal/models.py:101`），**在域内**
  - `'unknown'` 在 unchain 全部枚举中不存在；其唯一来源是 PuPu 的 SQL DEFAULT：`pupu:unchain_runtime/server/memory_v2_store.py:628` · `:649` `capture_quality TEXT NOT NULL DEFAULT 'unknown'`
  - `pupu:unchain_runtime/server/memory_v2_store.py:4079-4080`：
    ```sql
    capture_quality = CASE WHEN capture_quality='unknown' THEN 'legacy' ELSE capture_quality END
    ```
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '4074,4084p' unchain_runtime/server/memory_v2_store.py
  cd /Users/red/Desktop/GITRepo/unchain && grep -rn '"unknown"' src/unchain/journal/models.py src/unchain/memory/curator/models.py src/unchain/context/models.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: **一半消解、一半坐实** 本案 E-0037 完整性限制所登记的第五处同词异义；支持 S-0010 请求 3 影响项 (ii)
- **完整性限制**: **未穷举** unchain 全部枚举以证明 `'unknown'` 在任何域内都不存在 —— 只查了本案相关的三个 models 文件。**故「任何上游枚举里都没有」是就这三个文件而言**，更广的负向主张我不作。**未核实** `:4079` 那条 SQL 的执行频率与触发条件（属 `code-owner-runtime`）
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| SQL 原文与 DEFAULT 如上

### E-0075 | repository | 自证类
- **来源定位**: **59 项白名单的时效性复核（我自己的观察时点），并对本条相关的 16 个键逐一求交。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:9-69`
- **取得方式**: 机械集合运算，PuPu `b2385d5d`
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && python3 -c "
  import re
  s=open('src/SERVICEs/runtime_events/memory_v2_trace_presenter.js').read()
  m=re.search(r'TOP_LEVEL_KEYS = Object.freeze\(\[(.*?)\]\)', s, re.S)
  keys=re.findall(r'\"([^\"]+)\"', m.group(1))
  print('count', len(keys))
  for k in ['journal_status','context_build_status','persistence_degraded','persistence_boundary',
            'persistence_error_code','trace_status','status','error_code','capture_quality',
            'capture_status','run_outcome','legacy','legacy_v1','mode','reason','schema_version']:
      print(' ', k, k in keys)"
  ```
  输出：
  ```
  count 59
    journal_status True            context_build_status False
    persistence_degraded True      persistence_boundary False
    persistence_error_code True    trace_status True
    status True                    error_code True
    capture_quality False          capture_status False
    run_outcome False              legacy True
    legacy_v1 True                 mode True
    reason True                    schema_version True
  ```
- **提交发言**: S-0010
- **支持/反驳**: **复核确认** 本案 E-0002（59 项）与 E-0035（该证据所列 5 键的成员判定），**在我自己的观察时点仍然成立**；支持形状 P 的 P-3（三个键全在表内）与专业理由五（`context_build_status` / `persistence_boundary` 不在表内）
- **完整性限制**: **只覆盖 `TOP_LEVEL_KEYS` 这一个字面量的成员判定**，与本案 E-0002 / E-0035 同一条限制（未核实是否存在以变量拼出的键名旁路）。**并且，本条 *不* 主张白名单是唯一的准入门 —— 见 E-0078**。该文件属 `code-owner-shared-arteries` 边界，**越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 输出如上

### E-0076 | repository | 自证类
- **来源定位**: **`resolveTraceStatus` 对同一次持久化降级有两条互相独立的判定通路，而四个 `unchain_*` 键不在任一条上。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:162-196`
  - **通路一（explicit 链）**：`:163-166` `explicit = normalizedText(raw.trace_status || raw.journal_status || raw.status, 48).toLowerCase()` → `:168-170` `explicit === "partial" || "failed" || "error"` → `return "Partial"`
  - **通路二（persistence 链）**：`:181-187`
    ```js
    if (
      raw.persistence_degraded === true ||
      normalizedText(raw.persistence_error_code) ||
      normalizedText(raw.error_code)
    ) {
      return "Partial";
    }
    ```
  - **errorCode 推导**：`:382-385` `errorCode: normalizedText(safe.persistence_error_code || safe.error_code, 160)`
  - 其余分支：`:167` complete/completed → `Complete` · `:171` legacy · `:172` unavailable · `:174-177` 外层 `runStatus` 闭表 · `:178-180` legacy 标志 · `:188-194` `mode`/`reason` 子串 → `Unavailable` · `:195` 兜底 `mode === "active" || "shadow" ? "Complete" : "Unavailable"`
  - **四个 `unchain_*` 键在 `:162-196` 全段零出现**（本案 E-0002 已证其在该文件全文零出现，本条复核确认）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '155,200p;345,400p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 专业理由四之(3) P-2（**形状 P 的信号有冗余，形状 A 一条通路都没有**）；**解释** 本案 E-0012 B 行的机制并与之一致；支持 U-E4
- **完整性限制**: **静态控制流读取，本轮未跑任何探针**（依传唤书写入限制）。**故「两条独立通路」是对这 35 行的读取推论，不是一次执行观察** —— 可由任何人读同一段代码机械复核，但其证明力低于本案 E-0012 / E-0013 的实跑。**未核实** 产端在一次真实降级中是否会同时发出这两组键（属 `code-owner-runtime`）。该文件属 `code-owner-shared-arteries`，**越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 读取，行号与原文可复核）| 两条通路的行号与条件如上

### E-0077 | repository | 自证类
- **来源定位**: **四个 `unchain_*` 键的值域是单值 `"partial"`；三个产点的默认错误码域不自洽。** `pupu:unchain_runtime/server/unchain_adapter.py`
  - `:7451-7472` `mark_host_partial`：`if admission.is_active:` → `unchain_context_status="partial"` + `unchain_context_error_code=_memory_v2_safe_error_code(error, "context_v2_persistence_failed")`；`else:` → `unchain_shadow_status="partial"` + 默认 `"context_v2_shadow_persistence_failed"`
  - `:8403-8415` `mark_graph_active_partial`：`unchain_context_status="partial"` + 默认 `"context_v2_graph_persistence_failed"`
  - `:8554-8563` `mark_graph_shadow_partial`：`unchain_shadow_status="partial"` + 默认 **`"context_v2_shadow_persistence_failed"`（与 host shadow 同码，无 graph 变体）**
  - **三处的 `*_status` 取值全部是字面量 `"partial"`，无第二个取值**；结合本案 E-0030（四个键在全仓 8 处出现全为写入、无读取），**不存在任何 `unchain_*_status="complete"` 的产出者**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '7451,7473p;8403,8415p;8554,8563p' unchain_runtime/server/unchain_adapter.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 评估结论（形状 A 不成立，理由 A-1）与 U-E3、U-E2；**补足** 本案 E-0040 —— 该证据比对的是 **分支条件**，本条比对的是 **取值域与默认错误码域**，两者是同一段代码的两个不同断面
- **完整性限制**: 1. **「不存在 complete 产出者」这一负向主张依赖本案 E-0030 的字面量抓取**，而该证据自陈 8 处为下界；**故本条的单值结论继承同一条限制**。2. **未核实** `_memory_v2_safe_error_code` 在异常带 `code` 属性时的实际产出（默认码只在无 `code` 时生效），**故「默认码域不自洽」严格说是「默认值不自洽」**，实际错误码可能由异常自带。3. 该文件属 `code-owner-runtime`，**越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 三处取值与默认码如上

### E-0078 | repository | 自证类
- **来源定位**: **白名单的 fail-closed 只在深度 0 成立；嵌套层是开放准入。** `pupu:src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`
  - `:124-133 sanitizeMemoryV2TraceBundle`：`for (const key of TOP_LEVEL_KEYS) { if (!hasOwnProperty(raw, key)) continue; const sanitized = sanitizeNode(raw[key]); ... }` —— **顶层按 59 项表准入**
  - `:110-121 sanitizeNode`（对象分支）：
    ```js
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      const key = String(rawKey).slice(0, 128);
      if (!key || BLOCKED_KEY_PATTERN.test(key)) continue;
      const sanitized = sanitizeNode(rawValue, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    ```
    —— **嵌套层无白名单，只被 `BLOCKED_KEY_PATTERN`（`:6-7`）与四个封顶常量（`:1-4`：`MAX_STRING_LENGTH=8192` / `MAX_ARRAY_LENGTH=64` / `MAX_OBJECT_KEYS=96` / `MAX_DEPTH=6`）约束**
  - 白名单内已有的容器型键：`"context_build"`（`:59`）· `"latest_context_build"`（`:60`）· `"memory_agent_runs"` · `"curator_runs"` · `"consolidation_jobs"` 等
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '1,10p;88,135p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 专业理由四之(4) 与 U-E1；**限定** 本案全程（`case.md` Q3、S-0004 边界命中依据、S-0005 Q3 表态、`0000-0002-2026-0807#E-0072`）把 `TOP_LEVEL_KEYS` 当作「唯一 schema 门」的表述 —— **该表述只对顶层为真**
- **完整性限制**: 1. **只主张制品的性质，不主张任何产端今天真的把降级信息放进嵌套容器** —— 我 **未核实** 这一点。2. **不评价其安全后果**：嵌套层开放准入意味着 `BLOCKED_KEY_PATTERN` 是那一层唯一的键名防线，**该判断属 `expert-security`，本条不代答**。3. **未跑探针**（本轮写入限制），属静态读取。4. 该文件属 `code-owner-shared-arteries`，**越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 读取，行号与原文可复核）| 两段代码原文如上

### E-0079 | repository | 自证类
- **来源定位**: **`trace_status` 零产出者、`persistence_error_code` 三个产出者；同一降级路径上另有两个键同样被白名单丢掉。** PuPu `b2385d5d`
  - **`trace_status` 在 `unchain_runtime/` 与 `electron/`（排除测试目录）零命中** —— 即这个排在 `resolveTraceStatus` 取值链 **首位** 的字段，**在 PuPu 全部产端与主进程代码里没有任何写入方**
  - **`persistence_error_code` 的产端写入方 3 处**：`memory_v2_context.py:4300`（`_mark_memory_v2_partial`）· `:4745` · `memory_v2_context_adapter.py:675`（未接线的兄弟实现）
  - **`journal_status` 的产端写入方 2 处**：`memory_v2_context.py:4298` · `memory_v2_context_adapter.py:671`
  - **同路径上被白名单丢掉的另外两个键**（本案 `FRAMING` 未列）：`memory_v2_context.py:4644` `"persistence_reason": "runtime_unavailable"`（shadow 分支）· `:4747` `"persistence_event_type": event_type`；**两者在 `memory_v2_trace_presenter.js` 全文零出现**（即不在 59 项表内）
  - **`persistence_boundary` 的取值是 PuPu 自造自由字符串**：`memory_v2_context_adapter.py:701` 传 `"context_build"` · `:718` 传 `"journal"`，另一处经 `PupuContextReferencePolicy` 转手 unchain 的 boundary 名（`:684-687`）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "trace_status" unchain_runtime/ electron/ | grep -v "/tests/" | wc -l     # -> 0
  grep -rn "journal_status\|persistence_degraded\|persistence_error_code" unchain_runtime/ \
    | grep -v "/tests/"
  grep -c "persistence_reason\|persistence_event_type" src/SERVICEs/runtime_events/memory_v2_trace_presenter.js  # -> 0
  sed -n '4288,4308p;4636,4650p;4735,4750p' unchain_runtime/server/memory_v2_context.py
  sed -n '682,720p' unchain_runtime/server/memory_v2_context_adapter.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 评估结论「不成立 (i)」（C 对 `persistence_error_code` 的合成会与 3 个真实产端写入者争夺同一字段）；**反驳** `code-owner-shared-arteries` S-0004 建议处置一对形状 C 的「同键异义」反对 **就 `trace_status` 那一半而言**（该键零产出者，无竞争语音）；支持专业理由八的附记（「四个键」是下界，同路径至少六个）
- **完整性限制**: 1. **字面量 `grep`**，与本案 E-0030 / `0000-0002-2026-0807#E-0069` 同一失败类，**故所有计数都是下界**；`trace_status` 的「零产出者」尤其是一条 **负向** 主张，以变量或 f-string 拼出的同名键会被漏掉。2. 搜索范围限于 `unchain_runtime/`（含其 `tests/`，我另行排除）与 `electron/`，**未覆盖** `node_modules/` 与隔离工作树。3. **未核实** `memory_v2_context.py:4644` / `:4747` 两处在发布配置下的可达性（属 `code-owner-runtime`）。4. 两个文件属 `code-owner-runtime`，presenter 属 `code-owner-shared-arteries`，**均为越界只读**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 计数与产点如上

### E-0080 | repository | 自证类
- **来源定位**: **`capture_outcome != "complete"` 比较的是 `ContextBuildStatus` 的值；且三个 *活着的* 产点用整字典替换语义写降级键。** `pupu:unchain_runtime/server/`
  - `unchain_adapter.py:931-936`：
    ```python
    capture_outcome = (str(capture.get("capture_quality") or "").strip().lower()
                       if isinstance(capture, dict) else "")
    if capture_outcome != "complete":
        summary = {"status": "Isolated",
                   "reason": capture_error or f"capture_{capture_outcome or 'unavailable'}", ...}
    ```
    读的是 `capture_quality`，按 E-0073 其类型为 `ContextBuildStatus` —— **故 `capture_legacy` 是一个可达的 reason 取值**
  - **整字典替换语义的三个活着的产点**：`memory_v2_context.py:4295`（`_mark_memory_v2_partial`，写 `journal_status`/`persistence_degraded`/`persistence_error_code` 三键）· `:4643`（shadow 分支，写 `persistence_degraded`/`persistence_reason`）· `:4742`（写 `persistence_degraded`/`persistence_error_code`/`persistence_event_type`）—— **三处均直接调 `admission.update_diagnostics(...)`**
  - `update_diagnostics` 的语义：`memory_v2_context.py:517-519` `with self._lock: self._latest = copy.deepcopy(values)` —— **整字典替换**（`0000-0002-2026-0807#E-0070` 已取证，本条复核确认并新增三个 *活着的* 调用方）
  - `_StickyMemoryV2Admission.update_diagnostics` 覆写：`:598-612`，重注入 `sticky_admission` / `admission_reused` / `admission_id` / `admission_cohort` / `admission_revision` / `admitted_at_ms` / `target_mode` / `persisted_effective_mode` / `bootstrap_status` / `bootstrap_error_code` / `v2_bootstrapped` / `bootstrap_provenance` / `admission_provenance` —— **我读到的这 13 个里没有 `memory_agent_runs`**
  - 对照：`unchain_adapter.py:271-281` `_memory_v2_merge_diagnostics` 是 read-modify-write（本案 E-0033 已取证）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '925,940p' unchain_runtime/server/unchain_adapter.py
  sed -n '4288,4308p;4636,4650p;4735,4750p' unchain_runtime/server/memory_v2_context.py
  grep -n "def update_diagnostics" -A 14 unchain_runtime/server/memory_v2_context.py
  ```
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010 不确定性二之 1（形状 P 的必要条件：必须走 merge 不走 replace）与 U-E5；**更正** 我自己 `0000-0002-2026-0807#S-0014` 专业理由一之(1) 把 `capture_*` reason 一律映射到 `RunCaptureStatus` 的那处（**至少 active 面这一条读的是 `ContextBuildStatus`**）；**扩大** `0000-0002-2026-0807#E-0070` 的作用域 —— 该证据指出整字典替换的机制，**本条指出有三个活着的降级产点正在用它**
- **完整性限制**: 1. **我只读了 `_StickyMemoryV2Admission.update_diagnostics` 的前 13 个 sticky 键（`:598-612`），未读全该集合** —— 故「`memory_agent_runs` 不在 sticky 集合内」这一主张 **以 `0000-0002-2026-0807#E-0070` 为准，不是我的独立结论**。2. **未跑运行时、未做故障注入**，故「一次真实降级会替换掉 diagnostics 其余内容」是控制流推论不是观察。3. **未核实** `memory_v2_curator.py:484` 那条 legacy 面的 `capture_*` reason 读的是哪个枚举 —— **我上一案的映射在 legacy 面是否也需更正，本条不作结论**。4. 全部文件属 `code-owner-runtime` 边界，**越界只读，本条不裁其改法**
- **验证历史**: S-0010 | 已验证（由 `expert-llm` 实跑）| 原文、语义与三个调用方如上



















### E-0110 | repository | 自证类
- **来源定位**: **unchain revision 时效性复核。** `git rev-parse HEAD` = `a4e69f413c449c5768433ba4dddc5b60b8146991`；`git branch --show-current` = `dev`；`git status --porcelain` **空**（整仓，非仅 `src/`）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  git rev-parse HEAD; git branch --show-current; git status --porcelain
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 E-0111 ~ E-0124、E-0126、E-0127 的时效性；**确认** E-0031 / E-0037 / E-0039 / E-0070 ~ E-0074 所锚定的 revision 在本轮观察时点仍然成立
- **完整性限制**: 只证明观察时点的 HEAD 与工作树状态。**闭庭时点若晚于此且本仓有提交，须重取。** 未核实 GitHub main 与本地 dev 的差异（charter 载明本地领先，本条一律以本地工作树为准）
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0111 | repository | 自证类
- **来源定位**: **`ContextBuildStatus` 与 `RunCaptureStatus` 的定义、域、成员与消费面。**
  - `src/unchain/journal/models.py:98-102`：`class ContextBuildStatus(StrEnum)` = `COMPLETE="complete"` / `PARTIAL="partial"` / `LEGACY="legacy"` / `UNAVAILABLE="unavailable"`（**4 值**）。非测试引用 **9 个文件**：`journal/{models,__init__}.py` · `context/{models,health,compiler,runtime,__init__,task_state,task_state_request_factory}.py`
  - `src/unchain/memory/curator/models.py:80-83`：`class RunCaptureStatus(StrEnum)` = `COMPLETE` / `PARTIAL` / `UNAVAILABLE`（**3 值，无 `legacy`**）。非测试引用 **4 个文件**：`memory/curator/{coordinator,models,__init__}.py` · `persistence/sqlite_curator_v2.py`
  - **`RunCaptureStatus` 的唯一被 typed 字段**：`curator/models.py:193` `capture_status: RunCaptureStatus`，位于 `RootRunCompletion`（`:185`），与 `:192` `run_status: SourceRunStatus` **并列**；判定点 `coordinator.py:266-268`（PARTIAL / UNAVAILABLE 分支）与 `models.py:635`（`if self.trigger.capture_status is not RunCaptureStatus.COMPLETE`）
  - **`ContextBuildStatus` 被三个不同字段复用**：`context/models.py:178` `ContextBuildEnvelope.status` · `context/task_state.py:59` `ContextTaskStateReadOutcome.capture_quality` · `context/health.py:52` `ContextV2HealthInputs.capture_status` / `:78` `ContextV2HealthReport.capture_status`
- **取得方式**:
  ```
  sed -n '90,110p' src/unchain/journal/models.py
  sed -n '60,100p;185,225p' src/unchain/memory/curator/models.py
  grep -rn "ContextBuildStatus" src/ | grep -v "/tests/"
  grep -rn "RunCaptureStatus"  src/ | grep -v "/tests/"
  grep -rl "ContextBuildStatus" src/ | grep -v "/tests/" | wc -l   # -> 9
  ```
- **提交发言**: S-0015
- **支持/反驳**: **确认** E-0070 的集合事实与 S-0013 对 E-0037 的 相矛盾 判定；支持 S-0015 评估结论 甲-1
- **完整性限制**: 字面量与类型注解读取，**未跑运行时**。引用面统计排除了 `/tests/`，**未统计测试内引用**。**不主张** 两个枚举的语义相同或不同 —— 语义判断写在 S-0015 专业理由内，属判断不属观察
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0112 | repository | 自证类
- **来源定位**: **unchain 生产代码从不产出 `ContextBuildStatus.PARTIAL` 与 `.LEGACY`；二者只作为宿主入参出现。** 全仓（含 `tests/`）对这两个成员的全部命中：
  - **生产代码 2 处，均非产出**：`src/unchain/context/health.py:52` `capture_status: ContextBuildStatus = ContextBuildStatus.LEGACY`（**dataclass 字段默认值，即入参默认**）· `:126` `if inputs.capture_status is ContextBuildStatus.PARTIAL:`（**比较目标**）
  - **测试 8 处**：`tests/context_v2/test_models.py:223-224` · `test_task_state_request_factory.py:123-124` `:147-148` · `test_context_health_preflight.py:42` `:133` `:169` `:172`
  - **这两个成员进入系统的唯一通路**：`context/task_state_request_factory.py:70-79` `_capture_quality` —— outcome 非 UNAVAILABLE 且 `request.capture_quality is not None` 时 **原样透传 `ContextBuildStatus(request.capture_quality).value`**，而 `request` 是宿主构造的 `ContextCompileRequest`
- **取得方式**:
  ```
  grep -rn "ContextBuildStatus.PARTIAL\|ContextBuildStatus.LEGACY" src/ tests/
  sed -n '70,80p' src/unchain/context/task_state_request_factory.py
  sed -n '17,24p;48,72p;114,150p' src/unchain/context/health.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 结论、评估结论 甲-1 / 甲-4 与 UC-1；**限定** E-0070 —— 该证据只主张两个值域逐字全等（此点成立），本条指出 **产出方在四个成员上不同**；**与 E-0113 合并反驳** E-0071 的值域用途
- **完整性限制**: 1. **字面量 `grep` 的负向主张**，与 `0000-0002-2026-0807#E-0069` 同一失败类：以变量、别名或动态构造赋值的路径会被漏掉，故「无产出者」是 **未发现，不是证明不存在**。2. 我 **另跑了一条正交检验**（`ContextBuildEnvelope` 唯一构造点，E-0113）以收窄该风险，但只覆盖 envelope 一个字段。3. **未核实** 任何存量 store 中 `capture_quality` 列的实际取值分布
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0113 | repository | 自证类
- **来源定位**: **`harness.py:69`/`:106` 所发 `context_build_status` 的可达值域是二值 `{complete, unavailable}`，永不含 `partial`。**
  - `ContextBuildEnvelope` 全仓非测试 **唯一构造点**：`src/unchain/context/compiler.py:3227` `return ContextBuildEnvelope(`（`grep -rn "ContextBuildEnvelope(" src/ | grep -v /tests/` 只此一条）
  - 其 `status` 由 `compiler.py:3199-3204` 给出：
    ```python
    status = (
        ContextBuildStatus.UNAVAILABLE
        if diagnostics.get("status")
        in {"checkpoint_required", "task_state_unavailable"}
        else ContextBuildStatus.COMPLETE
    )
    ```
  - 序列化：`context/models.py:233` `"status": self.status.value,`（`to_dict()` 内）
  - **旁证**：`context/models.py:178` 的默认值为 `COMPLETE`，`:213` 构造时强制转换 —— 二者只保证类型，不缩小或扩大产出域
- **取得方式**:
  ```
  grep -rn "ContextBuildEnvelope(" src/ | grep -v "/tests/"
  sed -n '3196,3245p' src/unchain/context/compiler.py
  sed -n '168,236p' src/unchain/context/models.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **反驳** E-0071 **支持/反驳** 字段所声明的两项用途（「架构师那条缺口在四态这一条轴上今天可以关闭」与「`context_build_status` 不属诊断」）；**不反驳** E-0071 的任何一处行号、引文或类型注解 —— 那些全部属实
- **完整性限制**: 1. **只覆盖当前 revision 的构造路径。** `ContextBuildEnvelope.from_dict`（`context/models.py:237+`）会照常接受一份写有 `"partial"` 的历史记录 —— **我未核实任何存量 store 中是否存在这样的行**，那需要一次运行时观察。2. 唯一构造点由字面量 `grep "ContextBuildEnvelope("` 得出，**以别名或 `**kwargs` 转手的构造会被漏掉**，故「唯一」是下界式主张。3. `compiler.py` / `models.py` 属 `unchain:**`，本条为边界内取证
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0114 | repository | 自证类
- **来源定位**: **`context/task_state.py:59` 的 `capture_quality` typed 为 `ContextBuildStatus`；且该对象把可达域进一步收到二值。`RunCaptureStatus` 所 typed 的字段名是 `capture_status`，位于另一个记录。**
  - `src/unchain/context/task_state.py:53-92` `ContextTaskStateReadOutcome`：`SCHEMA = "unchain.context_task_state_read_outcome.v1"`（`:57`）· `capture_quality: ContextBuildStatus`（`:59`）· `__post_init__` `:65` `ContextBuildStatus(self.capture_quality)` 强制转换
  - **可达域收窄（两条不变量，两方均未测）**：`:84-88` `if self.unavailable is not None: if quality is not ContextBuildStatus.UNAVAILABLE: raise ModelValidationError(...)` · `:89-92` `elif quality is not ContextBuildStatus.COMPLETE: raise ModelValidationError("available or absent task state requires complete capture quality")`。**故 `PARTIAL` / `LEGACY` 在该对象上直接抛校验错**
  - 工厂只产这两值：`:100` `cls(capture_quality=ContextBuildStatus.COMPLETE)` · `:109` `UNAVAILABLE` · `:122` `COMPLETE`
  - 对照：`src/unchain/memory/curator/models.py:193` `capture_status: RunCaptureStatus`，位于 `RootRunCompletion`（`:185`），与 `:192` `run_status: SourceRunStatus` 并列
- **取得方式**:
  ```
  sed -n '40,132p' src/unchain/context/task_state.py
  grep -n "quality is not ContextBuildStatus" src/unchain/context/task_state.py
  sed -n '183,220p' src/unchain/memory/curator/models.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **独立确认** E-0073 与 S-0013 的 相矛盾 判定；支持 S-0015 评估结论 甲-2；**新增** 两条 E-0073 / S-0013 均未测的可达域不变量
- **完整性限制**: 1. **只覆盖 `ContextTaskStateReadOutcome` 这一个对象**；`ContextCompileRequest.capture_quality`（`context/models.py:794-805`）是另一处 typed 校验，**其可达域我未收窄**（见 E-0112 的透传通路）。2. 静态类型注解与校验分支读取，**未跑运行时**。3. **不主张** PuPu 侧 `capture_status` 列由谁写入 —— 与 E-0073 完整性限制 1 相同，该列 DEFAULT `'open'` 不在任一枚举域内，**未追**
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0115 | repository | 自证类
- **来源定位**: **`harness.py:69`/`:106` 逐字确认；`HarnessDelta.trace` 的类型与去向 —— 进 message version metadata，不进事件流。**
  - `src/unchain/context/harness.py:66-70`（`ContextCompilerHarness.build_delta`）与 `:103-108`（`ContextShadowCompilerHarness.build_delta`）各含一行 `"context_build_status": envelope["status"],` —— **与 E-0071 引文逐字相符**
  - **平面由容器承载**：`:59-65` active 写 `state_updates={"context_v2": {...}}`，`:102` shadow 写 `state_updates={"context_v2_shadow": diagnostics}` —— **确认 E-0071 该项**
  - **`trace` 的类型**：`src/unchain/kernel/delta.py:65` `trace: dict[str, Any] = field(default_factory=dict)`（`:64` `state_updates` 同型）—— **两者本身即未声明的开放袋**
  - **`trace` 在 kernel 内的全部去向（4 处）**：`kernel/state.py:216` `metadata={..., "trace": copy.deepcopy(delta.trace)}`（进 version metadata）· `kernel/application.py:188` 同形 · `kernel/application.py:387-409` 从中只取 `tool_name` / `call_id` / `capability_created_by` / `applied_by` 四键投进 artifact 事件（**`context_build_status` 不在其中**）· `kernel/microcompact.py:835` 透传。**无任何一处把 `trace` 整体发成事件**
- **取得方式**:
  ```
  cat -n src/unchain/context/harness.py
  sed -n '57,68p' src/unchain/kernel/delta.py
  grep -rn "\.trace\b\|\btrace=" src/unchain/kernel/*.py
  sed -n '175,200p;375,410p' src/unchain/kernel/application.py
  sed -n '205,230p' src/unchain/kernel/state.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **确认** E-0071 的全部字面事实与其完整性限制 1 所自陈的缺口（「未核实该 trace 是否经任何路径到达 PuPu」）—— 本条把 **unchain 侧那一半** 填上：它进 version metadata，不进事件流；**与 E-0113 合并反驳** E-0071 的用途主张
- **完整性限制**: 1. **只覆盖 `kernel/` 内对 `delta.trace` 的处置。** PuPu 侧是否另有读取 version metadata 的通路 —— **不在本边界，未核实**。2. 未核实 `state_updates["context_v2"]` 是否经任何路径到达 PuPu 的 `memory_v2` bundle（同上，属 `code-owner-runtime`）。3. 静态读取，**未跑运行时**
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0116 | repository | 自证类
- **来源定位**: **`"complete"` / `"completed"` 的分裂线沿一条语义轴，10 个 typed 成员无一例外。**

  | 取值 | 成员 | 所修饰的对象 | 轴 |
  |---|---|---|---|
  | `"complete"` | `ContextBuildStatus.COMPLETE`（`journal/models.py:99`） | 一次 context **build** 的产物 | 制品完整度 |
  | `"complete"` | `HandoffStatus.COMPLETE`（`context/models.py:96`） | 一次 **handoff** 的产物 | 制品完整度 |
  | `"complete"` | `RunCaptureStatus.COMPLETE`（`curator/models.py:81`） | 一次 run 的 **capture** | 制品完整度 |
  | `"completed"` | `ConsolidationJobStatus.COMPLETED`（`curator/models.py:69`） | 一个 **job** | 执行单元终态 |
  | `"completed"` | `SourceRunStatus.COMPLETED`（`curator/models.py:75`） | 一次 **run** | 执行单元终态 |
  | `"completed"` | `ProcessDisposition.COMPLETED`（`curator/models.py:95`） | 一次 **process** | 执行单元终态 |
  | `"completed"` | `GraphTerminalStatus.COMPLETED`（`context/graph_checkpoint.py:82`） | 一次 **graph run** | 执行单元终态 |
  | `"completed"` | `ProviderRequestStatus.COMPLETED`（`providers/request_lease.py:57`） | 一次 **request** | 执行单元终态 |
  | `"completed"` | `DurableProviderTurnStatus.COMPLETED`（`providers/durable_turn_runtime.py:59`） | 一次 **turn** | 执行单元终态 |
  | `"completed"` | `state.run_status = "completed"`（`kernel/run_outcomes.py:32`，**非枚举**） | 一次 kernel **run** | 执行单元终态 |

  - **决定性一处**：`RootRunCompletion`（`curator/models.py:185`）**同时持有** `:192` `run_status: SourceRunStatus`（= `"completed"`）与 `:193` `capture_status: RunCaptureStatus`（= `"complete"`）。**E-0072 用来证明「同文件相邻六行」的那一对，正是同一个记录里 *被有意拆成两问* 的两个字段**
  - **另有 3 处非枚举的 `"completed"` 字面量**，全部落在执行单元终态一侧：`character/state.py:50` `:126`（bookmark）· `toolkits/builtin/core/shell_runtime.py:314`（shell 进程）· `jobs/_worker.py:468`（日志泵）
- **取得方式**:
  ```
  for f in $(grep -rl '= "complete"$\|= "completed"$' src/ | grep -v "/tests/"); do
    awk -v F="$f" '/^class /{c=$2} /= "complete"$|= "completed"$/{printf "%-52s %-30s %s\n", F":"NR, c, $0}' "$f"; done
  sed -n '183,200p' src/unchain/memory/curator/models.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **反驳** E-0072 **来源定位** 标题句中「**分裂线不沿域、层或轴**」这一断言（支持 S-0015 请求 4 的质疑）；**不反驳** E-0072 的成员计数、文件位置、`host_adapter.py:57-66` 引文 —— 三者全部属实且本条复现
- **完整性限制**: 1. **「所修饰的对象」与「轴」两列是我读各枚举的使用点后作出的 *归类*，属判断不属观察。** 判据是：该枚举被赋给的字段所描述的是「一个产物有多完整」还是「一个执行单元结束于何种状态」。**任何评审者可按同一批 `file:line` 独立复核并给出不同归类。** 2. 与 E-0072 同一失败类：字面量 `grep`，以变量或别名定义的成员会被漏掉，**故 10 这个数字是下界**；本条结论（分裂沿一条轴）不依赖精确计数，但 **一个反例即可推翻它** —— 我未找到反例，这不等于不存在。3. **不主张任何历史归因**（谁在何时写成这样），见 E-0117 完整性限制 2
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0117 | repository | 自证类
- **来源定位**: **`host_adapter.py:58-66` 的双拼写归一器坐在一处真实轴交叉上，其输入是一个未 typed 的 `str`。**
  - `src/unchain/context/host_adapter.py:58-66` `_handoff_status(status: object) -> HandoffStatus`：`{"complete","completed"}→COMPLETE` · `{"failed","error"}→FAILED` · `{"cancelled","canceled"}→CANCELLED` · **兜底 `return HandoffStatus.PARTIAL`**（fail-safe 默认）
  - **唯一调用点**：`:194` `status=_handoff_status(result.status)`，其中 `result` 经 `:186-189` 校验为 **exact `SubagentResult`**
  - **输入类型**：`src/unchain/subagents/types.py:241-245` `class SubagentResult:` … `status: str` —— **未 typed，本仓终态轴上唯一一个**
  - **输入的实际取值**：`src/unchain/subagents/plugin.py:872-877` `completed = SubagentResult(..., status=result.status, ...)`，其中 `result` 是子 run 的 `KernelRunResult`；`kernel/run_outcomes.py:32` `state.run_status = "completed"` / `:52` `build_kernel_run_result(state, status="completed")`；`kernel/results.py:29` `build_kernel_run_result(state, *, status: str)`。**即：`"completed"` 是真实可达的输入，`"complete"` 是防御性宽度**
  - **该函数所在文件的性质**：`host_adapter.py` 全文是 host payload adapter（`:37` `class HostPayloadAdapterError(RuntimeError): """A production payload did not satisfy the Context V2 host contract."""`），另含 `_durable_write`（`:45-55`）把仓储异常统一 `mark_durable_persistence_failure` 后 `raise`
- **取得方式**:
  ```
  sed -n '1,80p;176,200p' src/unchain/context/host_adapter.py
  grep -rn "_handoff_status" src/ | grep -v "/tests/"
  sed -n '238,252p' src/unchain/subagents/types.py
  sed -n '852,880p' src/unchain/subagents/plugin.py
  cat -n src/unchain/kernel/run_outcomes.py | sed -n '20,55p'
  ```
- **提交发言**: S-0015
- **支持/反驳**: 与 E-0116 合并 **反驳** E-0072 的「分裂线不沿轴」断言与 S-0010 由其得出的「同一个压力在两处各产生一次同样的应对」这一推论；支持 S-0015 评估结论 甲-5 与 UC-3
- **完整性限制**: 1. **只覆盖 `_handoff_status` 的唯一调用点与该调用点上游一条取值链。** `SubagentResult.status` 另有 8 处 `status=result.status` 的转手（`plugin.py:1110` `:1159` `:1349` `:1399` `:2109` `:2251` `:2289` `:2477`），**我未逐条追它们各自的上游**，故「实际取值来自 `KernelRunResult.status`」覆盖的是 `:877` 这一条。2. **历史归因未核实**：该归一器当年为何被写成那样，我没有证据，**也不打算从 git 历史推**。本条只主张它今天坐在哪里、输入是什么类型。3. **不主张** PuPu 的 `resolveTraceStatus:167` 与之有或没有历史渊源
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0118 | repository | 自证类
- **来源定位**: **`src/unchain/kernel/` 内不存在把 durable 持久化异常降级为可继续状态的通路 —— 三条正交检验。**
  - **检验 1 · `kernel/loop.py` 的 `except` 全枚举**：`grep -n "except " src/unchain/kernel/loop.py` → **仅 1 行：`:282` `except (TypeError, ValueError):`**，位于 `emit_structured_event` 内对 `int(raw_iteration)` 的兜底（`:279-283`），**不包裹任何持久化、harness 或 callback 调用**。该文件 74,432 字节
  - **检验 2 · `kernel/` 全部 9 个 `.py` 的 `except` 全枚举 = 13 处**：`harness.py:72`（`copy.deepcopy` 的 `TypeError`）· `loop.py:282` · `microcompact.py:54` `:62`（`(TypeError, ValueError)`）· `:133`（`json.dumps` 兜底 → `repr`）· `:155`（`json.loads` 兜底 → 原串）· `model_tool_boundary.py:496` `:666`（`AttributeError`，弱引用/属性探测）· `:618`（`TypeError`，`weakref.ref` 不支持）· **`:645` `except BaseException:` —— 其后第 648 行为 `raise`，只做注册表回滚** · `provider_replay.py:21`（`(TypeError, ValueError)`）· `run_preparation.py:75`（读 provider payload 的 `store`）· `versioning.py:48`（`KeyError` 转 `KeyError`）。**4 个宽 except 全在非持久化路径，其中一个 re-raise**
  - **检验 3 · `kernel/` 对 `durability` 模块的引用 = 零**：`grep -rn "durable\|Durable" src/unchain/kernel/` 的 60+ 条命中中，**无一条是 `is_durable_persistence_failure` / `find_durable_persistence_failure` / `mark_durable_persistence_failure` / `DurablePersistenceBoundaryError`**；全部是 `DurableInteractionRuntime` / `DurableMaxBudgetCallbackAdapter` / `durable_snapshot` / `durable_request` 等交互与租约相关标识符
- **取得方式**:
  ```
  grep -n "except " src/unchain/kernel/loop.py
  grep -rn "except " src/unchain/kernel/*.py            # -> 13
  grep -rn "except " src/unchain/kernel/*.py | wc -l
  grep -rn "durable\|Durable" src/unchain/kernel/ | grep -v __pycache__
  grep -rn "is_durable_persistence_failure\|find_durable_persistence_failure\|mark_durable_persistence_failure" src/unchain/kernel/   # -> 空
  sed -n '275,292p' src/unchain/kernel/loop.py
  sed -n '120,165p' src/unchain/kernel/microcompact.py
  sed -n '60,90p' src/unchain/kernel/run_preparation.py
  sed -n '630,670p' src/unchain/kernel/model_tool_boundary.py
  sed -n '55,80p' src/unchain/kernel/harness.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **直接回答** 本庭指名交本 owner 的那一问；**补强** E-0031 完整性限制 2 所自陈的最脆弱一处（「未通读 `src/unchain/kernel/`」）—— 补的方向使 E-0031 的结论 **成立而非翻转**；与 E-0032 合并支持 S-0005 的「触发与可观测互斥」；**回答** S-0018 不确定性 2 的翻转条件（不发生）
- **完整性限制**: 1. **这是一项负向主张，由字面量 `grep` 得出**，与 `0000-0002-2026-0807#E-0069` 同一失败类：以 `contextlib.suppress`、装饰器、`sys.excepthook`、C 扩展或动态构造实现的吞异常会被漏掉。**我另跑了 `grep -rn "suppress(\|contextlib" src/unchain/kernel/*.py`，仅命中 `loop.py:5 from contextlib import nullcontext`** —— 这收窄但不消除该风险。**「未发现」不是「证明不存在」。** 2. **只覆盖 `src/unchain/kernel/`**。降级若发生在 `interaction/` · `jobs/` · `providers/` 等其它包，本条不覆盖 —— 但那些不是本庭所问的对象。3. **静态读取，未跑本仓 pytest（`run_tests.sh`），未做故障注入。** 4. 「4 个宽 except 全在非持久化路径」是我读各自上下文后的 **归类**，属判断；每处的 `file:line` 已给出可独立复核
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0119 | repository | 自证类
- **来源定位**: **`ContextRuntime` 有一个 per-attempt 失败闩，一经写入永不清除，并在 10 个入口被检查 —— 含 `persist_event` 的第一条语句。**
  - **字段**：`src/unchain/context/runtime.py:288` `_attempt_failures: dict[tuple[str, str], Exception] = field(...)`
  - **全仓引用 4 处，无任何清除路径**：`:288`（定义）· `:1887`（`if attempt_key in self._attempt_failures:` 存在性检查）· `:1889`（`self._attempt_failures[attempt_key] = error` **唯一写入**）· `:1899`（`failure = self._attempt_failures.get(attempt_key)` 读取）。**无 `pop` / `del` / `clear` / 重新赋值**
  - **`_latch_failure`（`:1879-1890`）**：`attempt_key is None → return True`；已存在则 `return False`（不覆盖）；否则写入并 `return True`
  - **`_raise_latched_failure`（`:1892-1901`）**：`if failure is not None: raise failure`
  - **检查入口 10 处**：`:610` `:654`（compile 路径）· `:771` `:772` `:853` `:968`（subagent 绑定/输入/handoff）· `:1128`（tool prepare）· `:1584`（`execute_prepared_tool` 首条）· `:1631`（`materialize_tool_transition` 首条）· **`:1793`（`persist_event` 的第一条语句）**
  - **与 `persist_before_host` 的合成效果**：`compose_event_callback`（`:1903-1923`）对 **每一条事件** 先 `self.persist_event(event)` 再 `host_callback(event)`。**故一旦某 attempt latch 了失败，其后每一条事件都会在 host 看到它之前再抛一次同一个异常**
- **取得方式**:
  ```
  grep -n "_attempt_failures" src/unchain/context/runtime.py            # -> 4 行
  grep -rn "_attempt_failures" src/                                     # -> 同 4 行，无其它文件
  grep -n "_raise_latched_failure\|_latch_failure" src/unchain/context/runtime.py
  sed -n '1875,1925p;1780,1800p' src/unchain/context/runtime.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **强化** E-0031 的结论至其自身未主张的程度（从「每个调用点必 re-raise」到「失败对整个 attempt 粘滞」）；支持 S-0015 第二节结论与 S-0005 的「触发与可观测互斥」；**与 E-0122 合并支持** UR-1 链路终点不变
- **完整性限制**: 1. **闩是 `ContextRuntime` 实例级的。** 若一次回合中存在 **多个** `ContextRuntime` 实例（例如 active 与 shadow 各一），一个实例的闩不影响另一个 —— **我未核实 PuPu 侧是否如此接线**（属 `code-owner-runtime`）。**这是本条最可能被限定的一处。** 2. `attempt_key is None` 时 `_latch_failure` 与 `_raise_latched_failure` **都是 no-op**（`:1885-1886` / `:1897-1898`）；`_attempt_key`（`:1836+`）在事件缺 `attempt_id` 与 `run_id` 时返回 `None`。**故本条不覆盖无 attempt 标识的事件。** 3. 静态读取，**未跑运行时、未做并发观测**
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0120 | repository | 自证类
- **来源定位**: **E-0031 的逐条复核结果：核心事实全部属实；其「11 处显式豁免」是下界，实为 16 处 / 6 个文件。**
  - **sink 调用点 = 6，复核属实**：`context/coordinator.py:1053` · `context/runtime.py:883` `:1079` `:1595` `:1660` `:1817`（`grep -rn "partial_attempt_sink(" src/ | grep -v /tests/`，剔除定义、类型注解、赋值与 `callable()` 判定后）。另有 1 处纯管线转手 `context/task_state_runtime.py:171`（不是调用）
  - **11 处 `_mark_*` 后紧跟 `raise`，复核属实**：`coordinator.py` `:782→:783 raise` · `:788→:789 raise error` · `:794→:795 raise error` · `:808→:809 raise` · `:816→:818-819` · `:834→:835 raise` · `:840→:842-843` · `:848→:849 raise boundary_error from None` · `:856→:857 raise error` · `:869→:871-872` · `:877→:878`
  - **`runtime.py` 五处复核属实**：`:883`→**`:894-896`**（`if boundary_error is error: raise` / `raise boundary_error from None`）· `:1079`→**`:1090-1092`**（同形）· `:1595`→**`:1607 raise`** · `:1660`→**`:1673 raise`** · `:1817`→**`:1826-1827`**
  - **`retry/classifier.py:15-19` 复核属实**：`if is_durable_persistence_failure(error): return False`
  - **偏差（方向对 E-0031 有利）**：其「11 处显式豁免」由把 `grep` 限在 `subagents/{plugin,executor}.py` + `retry/classifier.py` 得出。全仓非测试的 `is_durable_persistence_failure` **守卫** 实为 **16 处 / 6 个文件**：`subagents/plugin.py:406` `:853` `:1054` `:1293` `:1871` `:2043` `:2183` `:2454`（8）· `subagents/executor.py:37` `:64`（2）· `retry/classifier.py:18`（1）· **`providers/openai.py:104`** · **`providers/durable_turn_runtime.py:626` `:670`** · **`providers/exact_route_transport.py:229` `:330`**（5，E-0031 未计）
  - **`tool_executor.py:1039-1046` 复核属实**，并补一条 E-0031 未写的：`DurableToolInvocationFailedError`（`:184-191`）**不经 `mark_durable_persistence_failure`**，故 `runtime.py:1595` 处 latch 的是未标记的原异常 —— **但这不改变净效果**，见 E-0121
- **取得方式**:
  ```
  grep -rn "partial_attempt_sink" src/
  for L in 782 788 794 808 816 834 840 848 856 869 877; do sed -n "${L},$((L+3))p" src/unchain/context/coordinator.py; done
  for L in 883 1079 1595 1660; do sed -n "$((L-8)),$((L+18))p" src/unchain/context/runtime.py; done
  sed -n '1030,1056p' src/unchain/context/coordinator.py
  sed -n '1,40p' src/unchain/retry/classifier.py
  grep -rn "is_durable_persistence_failure" src/ | grep -v "/tests/"
  sed -n '1025,1055p;182,192p' src/unchain/context/tool_executor.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **确认** E-0031 全部核心事实；**限定** 其「11 处」为下界（实测 16，方向一致、偏小）；本条明确 **不构成对 E-0031 的质疑**
- **完整性限制**: 1. 与 E-0031 同一失败类的字面量 `grep`，**16 处同样是下界**。2. **未跑本仓 pytest，未做故障注入。** 3. 我 **未逐条重跑** E-0031 记录的每一个 `sed` 输出，只对其结论性行号作抽样与全枚举复核
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0121 | repository | 自证类
- **来源定位**: **工具执行失败不经任何吞异常层到达 kernel —— 补 E-0031 未覆盖的一段。**
  - `src/unchain/context/tool_harness.py` **全文零 `except`**（`grep -n "except" ` 无输出）；`:91` `receipt = self.runtime.execute_prepared_tool(context, permit)` · `:124` `replacement = self.runtime.materialize_tool_transition(...)` 两处调用均裸露
  - `execute_prepared_tool`（`runtime.py:1545-1607`）：`:1584` 先 `_raise_latched_failure` → `:1585-1589` `try: return binding.executor.execute(...)` → `:1590` `except Exception as error:` → latch → `:1592-1606` 调 sink（内层 `try/except: pass`，注释「原始持久化错误定义了失败边界」）→ **`:1607` `raise`**
  - `materialize_tool_transition`（`:1609+`）结构逐字同形，`:1673 raise`
  - **合成**：`tool_harness` 无 except + `kernel/` 无相关 except（E-0118）⇒ 异常直达 `agent.run()` 的调用方
- **取得方式**:
  ```
  grep -n "except" src/unchain/context/tool_harness.py     # -> 无输出
  sed -n '60,135p' src/unchain/context/tool_harness.py
  sed -n '1545,1610p;1609,1675p' src/unchain/context/runtime.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: 补强 E-0031 / E-0032 的链路（该段两条证据均未覆盖）；支持 S-0015 第二节结论
- **完整性限制**: 1. **只覆盖 `ContextToolHarness` 这一条工具执行路径。** subagent / delegate 工具的异常在 handler *内部* 即被 `subagents/plugin.py` 的吞异常层处理（有 `is_durable_persistence_failure` 豁免，E-0120）—— **那条路径若吞成 `{"error": ...}` 结果，sink 根本不触发**，故不产生本案的键，本条不覆盖也不需要覆盖。2. 静态读取，**未跑运行时**
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0122 | repository | 自证类
- **来源定位**: **E-0039 的 unchain 侧链路逐段复核属实；并补一条 E-0039 未写的：装这个 composer 的是 unchain 自己。**
  - `src/unchain/context/runtime.py:1903-1923` `compose_event_callback` → 内层 `persist_before_host(event)`（`:1907`）：重入保护后 `token = _ACTIVE_DURABLE_EVENTS.set(...)`（`:1914`）→ `try: self.persist_event(event)`（`:1916`）→ `return host_callback(event)`（`:1919`）→ **`finally:` 只 `_ACTIVE_DURABLE_EVENTS.reset(token)`（`:1920-1921`），不吞异常**
  - `src/unchain/kernel/loop.py:678-695` `emit_event`：`if callback is None: return`（`:686-687`）→ 组装 event（`:688-694`）→ **`callback(event)`（`:695`），无 `try` / 无 `except`**
  - **E-0039 未写的一条**：`src/unchain/agent/builder.py:968-975` —— `if self.context_runtime is not None: prepared_call_context = replace(self.call_context, callback=self.context_runtime.compose_event_callback(self.call_context.callback))`。**`compose_event_callback` 在 unchain 内的唯一调用点即此处**，即 **每一个配了 `context_runtime` 的 agent 都被本库自动装上该 composer**
- **取得方式**:
  ```
  sed -n '1900,1925p' src/unchain/context/runtime.py
  sed -n '670,700p' src/unchain/kernel/loop.py
  grep -rn "compose_event_callback" src/ | grep -v "/tests/"
  sed -n '955,980p' src/unchain/agent/builder.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: **确认** E-0039 的 unchain 侧全部事实；**新增** 一条 E-0039 未含的（本库自己装 composer），据以 **限定** 任何把 UR-1 读作「PuPu 选了一条更严格的接线」的表述；与 E-0118 / E-0119 合并 **回答** S-0018 不确定性 2
- **完整性限制**: 1. **只覆盖 unchain 侧三段。** PuPu 侧 `memory_v2_unchain_shadow_bridge.py:328-353` 属 `code-owner-runtime`，本条不复核（E-0039 已取证）。2. 静态读取，**未做故障注入、未观察过一次真实的 shadow 写失败**。3. **未核实** PuPu 是否在 `agent/builder.py` 之外另有绕过该 composer 的构造路径
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0123 | repository | 自证类
- **来源定位**: **本库声明了 shadow 模式下 fallback 不被禁止，而承载持久化的那一层对模式一无所知。**
  - **三档模式**：`src/unchain/providers/durable_turn_runtime.py:50-53` `class DurableProviderTurnMode(StrEnum): OFF = "off" / SHADOW = "shadow" / ENFORCE_TEST = "enforce_test"`
  - **`admitted` 与模式绑定**：`src/unchain/context/health.py:41-45` `enforce_test = mode is DurableProviderTurnMode.ENFORCE_TEST` / `if self.admitted is not enforce_test: raise ValueError("Context V2 admission must match the explicit enforce_test mode")`
  - **`fallback_forbidden` 的定义**：`health.py:148` `fallback_forbidden=self._admission.admitted` ⇒ **`mode is SHADOW` 时为 `False`**
  - **同一报告对 shadow 另有专门字段**：`health.py:144` `ready_for_shadow_write=shadow and not resolved_blockers`（`:138` `shadow = mode is DurableProviderTurnMode.SHADOW`）
  - **而持久化层无模式感知**：`grep -c "shadow" src/unchain/context/runtime.py` = **0**；`compose_event_callback`（`:1903`）无 mode 参数、无 best-effort 变体、无 `ContextV2Admission` 引用
  - **平面区分只存在于 harness 类的选择上**：`context/harness.py:28` `ContextCompilerHarness` vs `:75` `ContextShadowCompilerHarness` —— 两者都调同一个 `self.runtime.compile_context(context)`，共用同一个 `ContextRuntime`
- **取得方式**:
  ```
  grep -rn "class DurableProviderTurnMode" -A 6 src/unchain/providers/durable_turn_runtime.py
  cat -n src/unchain/context/health.py
  grep -c "shadow" src/unchain/context/runtime.py      # -> 0
  sed -n '1900,1925p' src/unchain/context/runtime.py
  cat -n src/unchain/context/harness.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 第三节（UR-1 鉴定）与对 S-0018 的两处范围修正；**限定** 任何把 UR-1 读作「durable-before-host 的必然代价」的表述 —— 本库自己对 shadow 声明了不同的 fallback 语义
- **完整性限制**: 1. **本条最脆弱的一处，我主动交出**：`context/health.py` **未被接线**（E-0124），故「本库自己声明」这句话的力度取决于「一份未接线的契约算不算声明」。**这是判断不是观察。** 若认为不算，UR-1 退回「纯有意设计」。2. **未核实** 是否存在文档、设计记录或 issue 声明过相反的意图 —— 且依[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)，那类来源属 **传闻类**，即便存在也不得用于证明其所述事实为真。3. 静态读取，**未跑运行时**
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0124 | repository | 自证类
- **来源定位**: **`context/health.py` 是全仓唯一把「这一 attempt 是 partial」写成闭合枚举成员的地方；它已声明、typed、host-facing，但未接线。**
  - **闭合枚举**：`src/unchain/context/health.py:17-23` `class ContextV2PreflightBlocker(StrEnum)` 六值：`JOURNAL_UNAVAILABLE` · `OBJECT_STORE_UNAVAILABLE` · `EXACT_PROVIDER_TRANSPORT_UNAVAILABLE` · **`PARTIAL_ATTEMPT = "partial_attempt"`** · `CONTEXT_UNAVAILABLE` · `READ_ONLY_DEGRADED`
  - **typed 报告**：`:74-83` `@dataclass(frozen=True, slots=True) class ContextV2HealthReport` 八字段：`mode` · `admitted` · `capture_status: ContextBuildStatus` · `read_only_degraded` · `ready_for_shadow_write` · `ready_for_model_tool_work` · `fallback_forbidden` · `blockers: tuple[ContextV2PreflightBlocker, ...]`
  - **判定**：`:126-129` `if inputs.capture_status is ContextBuildStatus.PARTIAL: blockers.append(PARTIAL_ATTEMPT)` / `elif ... UNAVAILABLE: blockers.append(CONTEXT_UNAVAILABLE)`
  - **可暴露性自陈**：`:86-94` `class ContextV2PreflightError(RuntimeError): """Required Context V2 work cannot begin; the report is safe to expose."""`，消息形如 `context_v2_preflight_failed:{blockers}`
  - **未接线的三条证据**：(i) `grep -n "Health\|Preflight\|Admission" src/unchain/context/__init__.py` **无输出** —— 未从 `unchain.context` 导出；(ii) `grep -rn "ContextV2Health\|ContextV2Preflight\|ContextV2Admission" src/ | grep -v /tests/` 的全部命中 **均在 `health.py` 自身** —— 库内零消费者；(iii) `grep -rl "ContextV2Health" src/ tests/` = `src/unchain/context/health.py` + `tests/context_v2/test_context_health_preflight.py`，**仅一个测试文件**
- **取得方式**:
  ```
  cat -n src/unchain/context/health.py
  grep -rn "ContextV2Health\|ContextV2Preflight\|ContextV2Admission" src/ | grep -v "/tests/"
  grep -n "Health\|Preflight\|Admission" src/unchain/context/__init__.py     # -> 无输出
  grep -rl "ContextV2Health" src/ tests/
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 第五节与 UC-2 / UC-4；与 E-0125 合并回答本庭第五节之问；**限定** E-0123 —— 本条即 E-0123 完整性限制 1 所指的那个脆弱处
- **完整性限制**: 1. **「库内零消费者」是字面量 `grep` 的负向主张**，以别名或 `importlib` 动态导入的使用会被漏掉。2. **本条不主张 PuPu 应当接入它** —— 它是 preflight 门（回答「这一回合能不能开始」），不是 per-turn trace 载荷（回答「这一回合中途坏了没」）。**用途不同，不是本案 Q1 的替代品。** 3. **未核实** 该模块是否有过接线计划或被有意搁置（那类来源属传闻类）
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0125 | repository | 自证类（**越界只读：PuPu 仓，属 `code-owner-runtime` 等各自 owner**）
- **来源定位**: **PuPu 对 unchain 该契约零消费；`context_build_status` 在 PuPu 生产代码仅 1 处且是硬编码字符串。** PuPu `b2385d5d`
  - `grep -rn "ContextV2HealthReport\|ContextV2HealthInputs\|ContextV2HealthService\|ContextV2PreflightBlocker\|ContextV2PreflightError\|ContextV2Admission\|partial_attempt\b" unchain_runtime/ src/ electron/` → **零命中**（三个产品目录全域）
  - `grep -rn "ContextBuildStatus\|context_build_status" unchain_runtime/ src/ electron/` → **8 处命中**：生产代码 **1 处** `unchain_runtime/server/memory_v2_context_adapter.py:672` `"context_build_status": "partial"`（**字符串字面量，非枚举成员**）；其余 7 处全在 `unchain_runtime/server/tests/`（2 处断言该字面量；5 处 `import ContextBuildStatus` 并只用 `.COMPLETE`）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "ContextV2HealthReport\|ContextV2HealthInputs\|ContextV2HealthService\|ContextV2PreflightBlocker\|ContextV2PreflightError\|ContextV2Admission\|partial_attempt\b" unchain_runtime/ src/ electron/ | grep -v node_modules
  grep -rn "ContextBuildStatus\|context_build_status" unchain_runtime/ src/ electron/ | grep -v node_modules
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 第五节与 UC-1；**限定** E-0071 的 PuPu 侧同名写入项（`memory_v2_context_adapter.py:672`）—— 那不是「PuPu 采纳了上游枚举」，是 **一个手写的字符串恰好与某个成员同形**
- **完整性限制**: 1. **越界只读，属 `code-owner-runtime` 边界（`unchain_runtime/`）与其余 PuPu owner；本条不裁其取舍，只作命中计数。** 2. **字面量 `grep` 的负向主张**，以别名或动态导入的消费会被漏掉。3. `node_modules` 已排除；**未搜 PuPu 的 `.claude/` 与 docs**。4. 我 **未读** `memory_v2_context_adapter.py` 的其余部分，只取该行
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0126 | repository | 自证类
- **来源定位**: **本案讨论的八个键名，在 unchain 仓全部零出现 —— 形状 A 与形状 P 的词汇同为 PuPu 自造。**
  - `grep -rn "unchain_context_status\|unchain_shadow_status\|unchain_context_error_code\|unchain_shadow_error_code" . --include="*.py" --include="*.md"`（整仓，含 docs 与 tests）→ **零命中**
  - `grep -rn "journal_status\|persistence_degraded\|persistence_error_code\|persistence_boundary" src/ | grep -v "/tests/"` → **唯一命中 `src/unchain/durability.py:22` `code = "durable_persistence_boundary_failure"`**，是一个异常类的 `code` 属性，**不是这四个键名中的任何一个**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn "unchain_context_status\|unchain_shadow_status\|unchain_context_error_code\|unchain_shadow_error_code" . --include="*.py" --include="*.md"
  grep -rn "journal_status\|persistence_degraded\|persistence_error_code\|persistence_boundary" src/ | grep -v "/tests/"
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 约束 1 与 约束 4；**限定** S-0010 形状 P 的 P-1（「值域来自上游 typed 枚举」）—— 就 **键名** 而言 A 与 P 同为 PuPu 自造，本条不评价 P 的其余论据（取值链冗余、不开单向门）
- **完整性限制**: 1. **负向主张，字面量 `grep`。** 以变量、f-string 或拼接构造的同名键会被漏掉。2. **本条只覆盖键名，不覆盖取值。** `journal_status` 的 **取值** 是否落在 `ContextBuildStatus` 的域内，是 PuPu 侧的事实，**属 `code-owner-runtime`，本条不核实也不主张**。3. 搜索范围含本仓的 `unchain_runtime/`（空壳）与 `docs/`
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0127 | repository | 自证类
- **来源定位**: **unchain 有一套成熟的形状声明机制并已在 58 处使用；而本案链路上流过的三个载体恰好全都不在其中。**
  - **已声明**：`grep -rn "SCHEMA: ClassVar\[str\]" src/ | grep -v "/tests/" | wc -l` = **58**。含 `context/models.py:163` `"unchain.context_build_envelope.v1"` · `:283` `"unchain.handoff_envelope.v2"` · `:709` `"unchain.context_v2.request.v1"` · `context/task_state.py:57` `"unchain.context_task_state_read_outcome.v1"` · `context/compiler.py:289` `"unchain.context_compile_result.v1"` · `journal/models.py` 9 个。**该机制的形态是 `SCHEMA: ClassVar[str]` + `to_dict()` + `__post_init__` 校验（违规抛 `ModelValidationError`，构造时即抛）**
  - **未声明（本案链路上的三个载体）**：`context/compiler.py:292` `diagnostics: Mapping[str, Any]`（`ContextCompileResult` 的字段，**同一个类的其余字段全部 typed**）· `kernel/delta.py:65` `trace: dict[str, Any]` · `kernel/delta.py:64` `state_updates: dict[str, Any]`
- **取得方式**:
  ```
  grep -rn "SCHEMA: ClassVar\[str\]" src/ | grep -v "/tests/" | wc -l    # -> 58
  grep -rn "SCHEMA: ClassVar\[str\] = " src/unchain/context/models.py src/unchain/journal/models.py src/unchain/context/task_state.py src/unchain/context/compiler.py
  sed -n '286,300p' src/unchain/context/compiler.py
  sed -n '56,68p' src/unchain/kernel/delta.py
  ```
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 建议处置二（丙 的机制性理由）；**限定** `0000-0002-2026-0807#E-0068` 所述「产端无声明形状」这一表述在 **unchain 侧** 的适用范围 —— **本库有声明机制且大量使用，被留成开放的恰好是 diagnostics 与 trace 这三个宿主自由通道**
- **完整性限制**: 1. **本条不主张 PuPu 应当采用该机制** —— 落位属 `expert-architecture` 与 `0000-0007-2026-0807`。2. **不主张** 这三个载体被留成开放是有意为之 —— 我只观察到「同一个类的其余字段全部 typed，唯独 `diagnostics` 不是」，**意图未核实**。3. 58 这个计数只含 `SCHEMA: ClassVar[str]` 这一种形态，**以其它形态声明的 schema 会被漏掉**，故为下界
- **验证历史**: S-0015 | 已验证（由 `code-owner-unchain` 实跑）

### E-0150 | repository | 自证类
- **来源定位**: PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（branch `dev`）；`src/` `electron/` `unchain_runtime/` 三个产品目录 dirty 数为 **0**；`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js` sha256 = `9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  git rev-parse HEAD
  git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l    # -> 0
  shasum -a 256 src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  ```
  观察者 `expert-qa`，**执行测试套件之前与之后各测一次，两次结果相同**
- **提交发言**: S-0023
- **支持/反驳**: **第四次独立满足 E-0001 完整性限制所要求的重测。** HEAD 与 E-0001 / E-0010 / E-0050 所载一致，presenter 摘要与 E-0010 / E-0050 **逐字符相同**。**并额外证明一件本轮独有的事：本领域执行 `react-scripts test` 与 `pytest` 之后，三个产品目录仍为 0 dirty** —— 即本轮的执行未改动任何产品代码
- **完整性限制**: 与 E-0001 / E-0010 / E-0050 同一条：**只证明各观察时点测得为 0，不能证明整场庭审期间无并发改动**。不覆盖 `.claude/` 下的案卷文件
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 实跑）| HEAD 与 sha256 如上

### E-0151 | repository | 自证类
- **来源定位**: **受影响路径上的全部 JS 测试文件，以及一条负向事实：`TOP_LEVEL_KEYS` 在 `src/` 中只出现于 presenter 自身，零测试引用。**
  - `src/SERVICEs/runtime_events/`：`activity_tree` · `event_store` · **`memory_v2_trace_presenter`** · `request_message_log_summary` · `runtime_event_stream_gate` · `stream_replay_projector` · `trace_chain_adapter`（7 个 `.test.js`）
  - `src/SERVICEs/chat_storage/`：`backend` · `coalesce` · **`memory_v2_trace`** · `migrate.idempotence` · `noop_guards` · `plan_docs` · **`sanitize`** · `store.dirty_events` · `store.identity` · `store.lazy_messages` · `tree.rows_cache` · `tree`（12 个）
  - `src/COMPONENTs/chat-bubble/`：`card_border_theme_bindings` · `character_chat_bubble` · **`chat_bubble.memory_v2_mount`** · `chat_bubble` · `chat_bubble.token_summary` · `lazy_trace_chain` · `memory_v2_journal_reload.performance` · `memory_v2_journal_reload` · `pending_confirmation_trace_frames` · `trace_chain.live_subscription` · **`trace_chain.memory_v2`**(959 行) · `trace_chain`（12 个）
  - **负向**：`grep -rn "TOP_LEVEL_KEYS" src/` 命中 **2 行，全部在 `memory_v2_trace_presenter.js` 自身**（`:9` 定义、`:127` 使用）。**没有任何测试引用该常量，故没有任何测试锁定其成员或计数**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  ls src/SERVICEs/runtime_events/*.test.js src/SERVICEs/chat_storage/*.test.js \
     src/COMPONENTs/chat-bubble/*.test.js
  grep -rn "unchain_context_status\|unchain_shadow_status\|TOP_LEVEL_KEYS" src/
  grep -rln "TOP_LEVEL_KEYS" src/
  ```
- **提交发言**: S-0023
- **支持/反驳**: **扩大 E-0019 的作用域** —— 该证据自陈「只覆盖 presenter 自己的 co-located 测试」；本条给出同一回归面上的全部 31 个 JS 测试文件，并证明白名单常量零测试引用。支持 S-0023 专业理由三之(4) 与 QA-1
- **完整性限制**: 1. **只覆盖三个目录下的 `*.test.js`**，未覆盖 `src/electron/tests/**` 与 e2e 套件（后者由 E-0152 的实跑结果间接覆盖到两个文件）。2. **字面 `grep`**，与本案 E-0002 同一限制：以变量拼出的常量名会被漏掉。3. **本条不主张这 31 个文件各自测了什么** —— 只主张它们存在，且无一引用 `TOP_LEVEL_KEYS`
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 实跑）| 清单与负向计数如上

### E-0152 | runtime-artifact | 须查类
- **来源定位**: **本案（含前案 `0000-0002-2026-0807`）第一次被执行的测试。** PuPu `b2385d5d`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  CI=true npx react-scripts test --watchAll=false --testPathPattern="memory_v2|runtime_events"
  ```
  观察者 `expert-qa`，2026-08-08。**依本 charter 测试事实使用 `react-scripts test`，未直接调用 `npx jest`**
- **提交发言**: S-0023
- **支持/反驳**:
  - **确认** 本庭「本案的改动，本仓现有测试一条都不会变红」这一结论，**并把其样本从 1/15 扩到 15/15** —— 此前该结论建立在 E-0019（自陈只覆盖 presenter co-located 测试）与 E-0057（自陈为断言等价重述而非原测试运行）之上
  - **支持 QA-1 / QA-6 与专业理由三之(4)**：改动前后的全绿逐字节相同，故那次执行携带零信息
  - **支持专业理由七**：代价被测量为 1.733 秒
- **完整性限制**:
  1. **须查类，无保管链。** 一次运行时观察；虽然被测对象是同一 revision 上的确定性代码，但运行环境（node / jest 缓存 / 并发）不随证据保存。**不得据此单次运行推断任何其它 revision 或环境上的结果**
  2. **只覆盖 `--testPathPattern="memory_v2|runtime_events"` 匹配到的 15 个套件**，**未跑全仓套件**。故「0 条会变红」是 **就这 15 个套件而言**；全仓的负向结论由 E-0151（`TOP_LEVEL_KEYS` 零测试引用）承担，二者合起来仍是 **下界式的负向主张**
  3. **本条是改动前的基线，不是改动后的观察。** 「改动后仍全绿」是由 E-0151 / E-0153 / E-0154 的 fixture 与 matcher 形态推出的 **推论**，本领域未实施任何形状，**未执行改动后的对照运行**
- **验证历史**:
  - S-0023 | 已验证（由 `expert-qa` 实跑）| 结果如下

  ```
  PASS src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js
  PASS src/PAGEs/chat/hooks/use_chat_stream.memory_v2_payload.test.js
  PASS src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.performance.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.test.js
  PASS src/SERVICEs/runtime_events/activity_tree.test.js
  PASS src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  PASS src/SERVICEs/runtime_events/stream_replay_projector.test.js
  PASS src/SERVICEs/runtime_events/trace_chain_adapter.test.js
  PASS src/SERVICEs/runtime_events/event_store.test.js
  PASS src/SERVICEs/runtime_events/request_message_log_summary.test.js
  PASS src/electron/tests/main/memory_v2_startup_readiness.test.js
  PASS src/SERVICEs/runtime_events/runtime_event_stream_gate.test.js
  PASS src/electron/tests/main/memory_v2_rollout.test.js
  PASS src/SERVICEs/chat_storage/chat_storage_memory_v2_trace.test.js

  Test Suites: 15 passed, 15 total
  Tests:       88 passed, 88 total
  Time:        1.733 s
  ```

### E-0153 | repository | 自证类
- **来源定位**: **一条守封闭准入集合的断言用了 partial matcher，因而在输出多出键时恒过。** `pupu:src/SERVICEs/chat_storage/chat_storage_memory_v2_trace.test.js`（全文 43 行，唯一一个 `test()`）
  - `:29` 断言形态为 **`expect(cleaned.meta.bundle.memory_v2).toMatchObject({...})`** —— `toMatchObject` 在 **接收值是期望值的超集** 时通过
  - 其 unknown 键 fixture 为 `:24` `arbitrary_provider_payload: { unsafe: true }`，负向断言在 `:41` `expect(serialized).not.toContain("arbitrary_provider_payload")`
  - **`arbitrary_provider_payload` 不在 59 项白名单内，且不是本案任一形状会接纳的键名**，故该负向断言在四个形状下均保持绿
- **取得方式**: `cat src/SERVICEs/chat_storage/chat_storage_memory_v2_trace.test.js`（43 行，全文已读）
- **提交发言**: S-0023
- **支持/反驳**: 支持 **QA-2** 与专业理由四之(2) 第 5 条、U-Q1；**扩大 E-0019 的结论到第二个文件** —— E-0019 指出 presenter 自己的挂载门断言用 `{unknown:true}` 故扩表后仍绿，**本条指出持久化侧那条测试用 partial matcher 故在任何准入放宽下恒绿**，二者是同一失效的两个实例
- **完整性限制**: 1. **只覆盖这一个文件的这一个 `test()`。** 2. **本条不主张 `toMatchObject` 在一般情况下是错的写法** —— 它对「至少包含」这类断言是正确工具；本条主张的是 **用它去守一个封闭准入集合在语义上不成立**。3. 该文件依 A-008 归 `code-owner-shared-arteries`，**越界只读**，本条不主张应当如何改写
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取全文，行号与原文可复核）

### E-0154 | repository | 自证类
- **来源定位**: **挂载门的那条渲染测试同样测不到挂载门变宽。** `pupu:src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js`（全文 61 行，2 个 `test()`）
  - `:9-19` **把 `./lazy_trace_chain` 与 `./trace_chain` 整个 `jest.mock` 掉**，替身只渲染 `props.bundle?.memory_v2?.mode || "missing"`
  - `:33-39` fixture 为 `meta: { bundle: { memory_v2: { mode: "active" } } }` —— **单键，`mode`，在 59 项白名单内**
  - `:42-58` 两条断言均为 `expect(screen.getByTestId(...)).toHaveTextContent("active")`
  - **净效果**：该测试断言的是「`mode` 这个字符串被传下去并渲染出来」。**它既不经过 `isMemoryV2TraceBundle` 的真实实现，也不含任何本案形状会新接纳的键**，故在四个形状下均保持绿；**E-0012 C 段所述的挂载门变宽（只含新键的 bundle 由 `false` 翻为 `true`）不在它的射程内**
- **取得方式**: `sed -n '1,61p' src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js`（全文）
- **提交发言**: S-0023
- **支持/反驳**: 支持 **QA-1 / QA-2** 与 U-Q1；**直接回答 `code-owner-shared-arteries` U-S2 所留的知情请求**（「挂载门会因本案变宽，归 `code-owner-chat-bubble` 知情」）—— **本条证明该 owner 一侧现有的挂载测试无法察觉该变化**
- **完整性限制**: 1. **只覆盖这一个文件。** `trace_chain.memory_v2.test.js`（959 行，16 个 `test()`）**本条未展开** —— 其测试名以 refs / curator / review / journal reload 为主，**本领域未逐条核实其中是否有一条会因本案变红**，只由 E-0152 观察到它今天全绿。**这是本条最脆弱的一处，本领域明确承认**。2. 两个文件均属 `code-owner-chat-bubble` 边界，**越界只读**，不主张改法
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取全文，mock 与 fixture 原文可复核）

### E-0155 | repository | 自证类
- **来源定位**: **形状 P 所需的验收 idiom 已经在仓内存在并被使用：一次 sink 捕获 + 对四个降级键的断言。** `pupu:unchain_runtime/server/tests/test_memory_v2_context_reference_policy.py`
  - `:132-141` **sink 捕获**：
    ```python
    return bind_pupu_context_module(
        ...,
        partial_attempt_sink=lambda boundary, source, error: partials.append(
            (boundary, source, error)
        ),
    )
    ```
  - `:790-798` **断言**：
    ```python
    assert len(partials) == 1
    boundary, source, error = partials[0]
    assert boundary == "context_reference"
    assert source.event_id == "event-direct-poisoned"
    assert error.args
    diagnostics = binding.admission.diagnostics()
    assert diagnostics["journal_status"] == "partial"
    assert diagnostics["context_build_status"] == "partial"
    assert diagnostics["persistence_boundary"] == "context_reference"
    assert diagnostics["persistence_error_code"] == "unauthorized"
    ```
  - 同文件 `:873` `:876` 为第二个实例（错误码 `contract_invalid`）
  - **该测试测的正是 `bind_pupu_context_module`** —— 即本案 E-0034 所述那个「词汇正确但生产零调用点」的兄弟实现。**净事实：未接线的那条路径有测试覆盖；活着的那条（四个 `unchain_*` 键）零覆盖（E-0030 / UR-3）**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rln "journal_status\|persistence_degraded\|persistence_error_code\|partial_attempt_sink" \
    unchain_runtime/server/tests/
  sed -n '125,160p;770,800p' unchain_runtime/server/tests/test_memory_v2_context_reference_policy.py
  ```
- **提交发言**: S-0023
- **支持/反驳**: 支持 S-0023 评估结论与专业理由五（形状 P 是唯一有既存在仓验收 idiom 的形状）；**限定 `code-owner-runtime` UR-3 的读法** —— 该条「不存在一条会因该改动变红的测试」就 **四个 `unchain_*` 键** 而言属实，**但不得被读作「本仓没有测这类事的能力」**：能力在，且对同一事件的正确词汇已在用
- **完整性限制**: 1. **本条不主张该测试今天会因形状 P 变红** —— 它测的是 `bind_pupu_context_module`，而 P 落在 `unchain_adapter.py` 的三个产点上。**本条主张的是 idiom 存在且可复用**。2. **未核实** 该 idiom 是否能原样施加于 `mark_host_partial` 的注册面（那属 `code-owner-runtime`）。3. 全部文件属 `code-owner-runtime` 边界，**越界只读**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取，行号与原文可复核；执行结果见 E-0157）

### E-0156 | repository | 自证类
- **来源定位**: **durable 持久化失败的故障注入 idiom 已经在仓内存在。** `pupu:unchain_runtime/server/tests/test_memory_v2_context.py:899-908`
  ```python
  def test_active_persistence_failure_marks_partial_without_raw_error(self):
      runtime = _FakeRuntime()
      runtime.fail_append = RuntimeError("raw-secret-value")
      admission = _admission(runtime)
      with self.assertRaises(MemoryV2PersistenceError):
          persist_memory_v2_semantic_event(
              admission,
              {"type": "final_message", "run_id": "run_a", "content": "done"},
          )
      self.assertEqual(admission.diagnostics()["journal_status"], "partial")
      self.assertNotIn("raw-secret-value", str(admission.diagnostics()))
      self.assertTrue(any(call[0] == "seal_task" for call in runtime.calls))
  ```
  **三件事同时被断言**：失败被注入并如期 raise · 降级键被写为 `journal_status="partial"` · **原始错误串不出现在 diagnostics 里**
- **取得方式**: `sed -n '880,915p' unchain_runtime/server/tests/test_memory_v2_context.py`
- **提交发言**: S-0023
- **支持/反驳**: 支持 S-0023 专业理由二（G1 的缺失一步今天做得出来）与专业理由五（P 的可验收性）；**为 `expert-security` 的 SEC-5 与 US-2 提供一条既存实例** —— 「错误码不得挟带原始异常内容」这条要求在本仓已有一条绿着的断言在守
- **完整性限制**: 1. **该测试走的是 `persist_memory_v2_semantic_event` 这条路径，不是 unchain 的 `partial_attempt_sink`。** 二者是同一类事件的两条不同通路，**本条不主张它们等价**。2. **本条不主张该 idiom 已覆盖生成器层** —— 生成器层的可驱动性由 E-0159 单独出证。3. 属 `code-owner-runtime` 边界，**越界只读**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取；执行结果见 E-0157）

### E-0157 | runtime-artifact | 须查类
- **来源定位**: **上述两条 idiom 今天实跑为绿 —— 但只在另一个仓库的 virtualenv 下。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server

  # (1) 系统 python3（anaconda 3.11）
  python3 -m pytest tests/test_memory_v2_context_reference_policy.py -q
  # -> ERROR ... ModuleNotFoundError: No module named 'unchain'
  #    Interrupted: 1 error during collection

  # (2) PuPu 自己的 venv
  /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python -m pytest \
      tests/test_memory_v2_context_reference_policy.py -q
  # -> 同一 ModuleNotFoundError，收集失败

  # (3) unchain 仓的 venv（python3.12，unchain-0.2.0.dist-info）
  /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest \
      tests/test_memory_v2_context_reference_policy.py -q
  # -> .................... [100%]   20 passed in 1.23s

  /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest \
      tests/test_memory_v2_context.py -q -k "partial"
  # -> .  [100%]   1 passed, 39 deselected in 0.06s

  ls -d /Users/red/Desktop/GITRepo/PuPu/.venv/lib/python*/site-packages/unchain*   # -> 无匹配
  ls -d /Users/red/Desktop/GITRepo/unchain/.venv/lib/python*/site-packages/unchain*
  # -> .../python3.12/site-packages/unchain-0.2.0.dist-info
  ```
  观察者 `expert-qa`，2026-08-08
- **提交发言**: S-0023
- **支持/反驳**: **支持 QA-4**（P 的验收在提交前必须先把跑法写进 PuPu 仓）与 U-Q2；**执行确认 E-0155 / E-0156 两条 idiom 今天为绿**；支持专业理由五之(2) 的「坏消息」半边
- **完整性限制**:
  1. **须查类，无保管链。** 三份 virtualenv 都是本机文件，随安装状态改变。**不得据此推断任何 CI 或他人机器上的结果**
  2. **只试了三个解释器。** **未穷举** 是否存在第四种能 collect 的配置（例如设置 `PYTHONPATH` 指向 unchain 源码树、或某条本领域不知道的 env）。**故「PuPu 自己的 venv 跑不了」成立，「除该 venv 外无路可走」未核实**
  3. **只跑了两个测试文件**，未跑 `unchain_runtime/server/tests/` 全量
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 实跑）| 三个解释器的结果如上

### E-0158 | repository | 自证类
- **来源定位**: **PuPu 仓内不存在任何对 sidecar 测试调用方式的声明。**
  - **无 `conftest.py`**：`unchain_runtime/server/conftest.py` 与 `unchain_runtime/server/tests/conftest.py` **均不存在**
  - **无 pytest 配置**：`find . -maxdepth 3 \( -name pytest.ini -o -name setup.cfg -o -name pyproject.toml \)`（排除 `node_modules`）→ **零命中**
  - **无 npm 脚本**：`package.json` 中 `pytest` 零命中；`unchain_runtime` 相关脚本全部是 **构建**（`build:unchain*` → `build_unchain_server.sh/.ps1`）与 **打包路径**，无测试入口
  - **`unchain_runtime/scripts/` 只有两个文件**：`build_unchain_server.ps1` · `build_unchain_server.sh`。**无测试脚本**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  ls unchain_runtime/server/conftest.py unchain_runtime/server/tests/conftest.py   # -> 均不存在
  find . -maxdepth 3 \( -name "pytest.ini" -o -name "setup.cfg" -o -name "pyproject.toml" \) \
    | grep -v node_modules                                                          # -> 零命中
  grep -n "pytest\|unchain_runtime" package.json
  ls unchain_runtime/scripts/
  ```
- **提交发言**: S-0023
- **支持/反驳**: 与 E-0157 合并 **支持 QA-4** 与 U-Q2；**为 `code-owner-runtime` 约束 2（`.py` 改完必须重启 sidecar）补一条更前置的**：在「验的是不是新码」之前，还有一个「第二个人跑不跑得起来」的问题
- **完整性限制**: 1. **深度限制为 3**，未搜更深层的配置文件。2. **本条只主张「PuPu 仓内无声明」，不主张「无人知道怎么跑」** —— `code-owner-runtime` 与 `code-owner-devtools` 显然知道；本条主张的是 **该知识不在仓内，因而不构成可复现定位**。3. `package.json` 与 `unchain_runtime/scripts/` 属 `code-owner-devtools` 边界，**越界只读**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 实跑）| 四项负向结果如上

### E-0159 | repository + runtime-artifact | 自证类
- **来源定位**: **发 bundle 的生成器今天可以在进程内被直接驱动，且其帧列表与 `bundle` 内容已被既有测试断言。**
  - `pupu:unchain_runtime/server/tests/test_unchain_adapter_capabilities.py:1821-1845`：
    ```python
    events = list(
        unchain_adapter.stream_chat_events(
            message="hello", history=[], attachments=[], options={...}
        )
    )
    ...
    self.assertTrue(any(event.get("type") == "final_message" for event in events))
    self.assertTrue(any(event.get("type") == "stream_summary" for event in events))
    self.assertEqual(
        next(event.get("bundle", {}) for event in events
             if event.get("type") == "stream_summary").get("consumed_tokens"), 21)
    ```
  - `pupu:unchain_runtime/server/tests/test_chat_stream_v4.py:554-598`：构造含 `"memory_v2": {...}` 的 `stream_summary`，并断言 `done_payload["bundle"]["memory_v2"]["mode"] == "active"`
  - `pupu:unchain_runtime/server/tests/test_models_catalog_route.py:374`：`self.assertNotIn("stream_summary", event_types)` —— **一条既存的「不应发出 `stream_summary`」负向断言**，即本领域所述那条测试的负向半边在仓内已有先例
  - **可运行性**：`test_unchain_adapter_capabilities.py --collect-only -q` → **111 tests collected in 0.41s**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "stream_summary" unchain_runtime/server/tests/
  sed -n '1820,1850p' unchain_runtime/server/tests/test_unchain_adapter_capabilities.py
  cd unchain_runtime/server && /Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest \
      tests/test_unchain_adapter_capabilities.py --collect-only -q | tail -5
  ```
- **提交发言**: S-0023
- **支持/反驳**: **支持 S-0023 专业理由二** —— G1 缺的那一步（一条把「触发与可观测互斥」放到可执行边界上的测试）今天做得出来；**限定 E-0031 / E-0032 的证据位阶**（下界枚举 + 未通读 kernel 的静态推论，**其提出方已自陈**），**不反驳其任何事实内容**
- **完整性限制**:
  1. **本条只做到 `--collect-only`，未运行该套件。** 故「111 tests collect」是收集观察，**不是 111 条全绿的执行观察**
  2. **未核实** 该套件驱动 `stream_chat_events` 的那条路径是否覆盖 memory_v2 admission 为 active 的分支。**故本条支持的是「可写」，不是「已在」** —— 本领域明确不主张今天已有一条测试覆盖本案路径
  3. **本条不主张那条待写的测试会得出哪个结果。** 它对互斥主张是中立的：绿则确认一次，红则彻底证伪
  4. 全部文件属 `code-owner-runtime` 边界，**越界只读，本条不请求任何产端改动**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取 + 实跑 collect）| 原文与 collect 计数如上

### E-0160 | repository | 自证类
- **来源定位**: **一条写入 `messages` 表的耐久路径完全不经 `sanitizeMessages`。** `pupu:electron/main/services/chat_storage/service.js`
  - `:494-522 migrateLegacyFileIfNeeded()`：`if (!isDbEmpty()) return;` → `if (!fs.existsSync(legacyFilePath)) return;` → `store = JSON.parse(fs.readFileSync(legacyFilePath, "utf8"))` → `assertRecognizableLegacyChatStore(store)` → **`applyOps([{ type: "import_store", store }])`** → `fs.renameSync(legacyFilePath, legacyFilePath + MIGRATED_SUFFIX)`
  - `:334-340 applyImportStore(op)`：`const store = assertRecognizableLegacyChatStore(op.store); const chatsById = store.chatsById || {};` —— **校验只覆盖 id 契约与可识别性，注释自陈「rejects the entire store if ANY incoming chat id violates the frozen id contract」**
  - `:280-289 replaceMessages(chatId, messages)`：
    ```js
    requireDb().prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
    const insert = requireDb().prepare(
      "INSERT INTO messages(chat_id, ord, payload) VALUES (?, ?, ?)",
    );
    const list = Array.isArray(messages) ? messages : [];
    for (let ord = 0; ord < list.length; ord += 1) {
      insert.run(chatId, ord, toJson(list[ord]));
    }
    ```
    —— **消息对象原样 `toJson` 写入，无任何字段过滤**
  - `:283` 是 `electron/main/services/chat_storage/*.js` 中 **唯一** 的 `INSERT INTO messages`
  - **`sanitizeMessages` / `sanitizeMessage` 在 `electron/` 全域零出现**（本案 E-0015 的 `grep -rn "sanitizeMessages\|sanitizeMessage(" src electron` 已隐含此结果）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "INSERT INTO messages\|REPLACE INTO messages" electron/main/services/chat_storage/*.js
  sed -n '260,300p;325,345p;490,525p' electron/main/services/chat_storage/service.js
  ```
  PuPu `b2385d5d`
- **提交发言**: S-0023
- **支持/反驳**:
  - **反驳** 本案 `E-0015` **支持/反驳** 首项所声称的全称主张（「四个键在写进 SQLite 之前已被剥掉，**历史行里从来没有过**」）—— 见 S-0023 请求 1 的 `UNSUPPORTED` 质疑。**该证据的取得方式是「搜索脱敏器」，一条不调用脱敏器的写入路径在结构上不可能被它发现；本条即是那条路径**，且 E-0015 完整性限制 2 自陈「未穷举全仓是否另有绕过 `sanitizeMessages` 的写入路径」
  - **不反驳** E-0015 的其余任何内容 —— 其五个 `sanitizeMessages` 调用点、`commitForegroundMessages` 未 sanitize、以及 **读路径 `:247` / `:1191` 的 sanitize** 三项，本领域读代码确认成立。**读路径的存在正是本条不主张 Q2 结论为假的原因**
  - **支持 U-Q3**
- **完整性限制**:
  1. **本条只证明路径存在，不证明任何一行历史数据里真的含这四个键。** 本领域 **未** 打开任何 `chats.json`、**未** 检查任何 `.migrated-bak` 文件、**未** 查询任何数据库。**按 E-0017（该 flag 从未出现在任何 tag 上），本领域倾向于认为该集合为空，但未核实即不主张**
  2. **未核实** 读路径的 sanitize 是否另有旁路。**本条的质疑不依赖这一点**
  3. **未核实** `applyOps` / `import_store` 是否另有第二个调用方（除 `migrateLegacyFileIfNeeded` 与 WRITE channel `:539-541` 外）
  4. `electron/main/services/chat_storage/service.js` 属 `code-owner-electron` 边界，`chat_storage_store.js` 属 `code-owner-shared-arteries`，**均为越界只读；本条不主张任何改法**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取，行号与原文可复核）

### E-0161 | repository | 自证类
- **来源定位**: **test-api 的端点全集里没有任何故障注入能力。** `pupu:docs/api-reference/test-api.md` · `pupu:docs/api-reference/test-api-debug.md`
  - **`test-api.md`**：chat 生命周期（`POST/GET/PATCH/DELETE /chats`、`/chats/:id/activate`）· 消息与异步 run（`POST /chats/:id/messages` 阻塞式、`/runs`、`/runs/:attempt_id`、`cancel`）· catalog 与选择（`/catalog/{models,toolkits,characters}`、`/chats/:id/{model,toolkits,character}`）· 错误码表
  - **`test-api-debug.md`**：`GET /debug/state` · `GET /debug/logs` · `GET /debug/screenshot` · `POST /debug/eval` · `GET /debug/dom`
  - **负向结论**：**没有任何端点可以注入持久化失败、磁盘错误、DB 锁或任何 durable 边界异常**；`GET /chats/:id` 返回 `{id, title, model, character_id, toolkits, messages}`，**不直接暴露 trace 终态**；读取渲染状态的唯一路径是 `POST /debug/eval`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '1,140p' docs/api-reference/test-api.md
  grep -n "^## \|^### \|^| " docs/api-reference/test-api-debug.md
  ```
- **提交发言**: S-0023
- **支持/反驳**: **支持 S-0023 评估结论 `不成立 (ii)` 的理由 (b)**（真实降级无法经受支持的表面制造出来）与 U-Q4；**并同时支持其建设性替代**（健康回合的无回归观察今天可产出：`/debug/eval` + `/debug/screenshot` + 一次 `POST /chats/:id/messages`）
- **完整性限制**:
  1. **本条来源是文档，而非端点实现。** 依[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)，**文档属传闻类，不得用于证明其所述事实为真** —— 故本条 **严格证明的是「该文档列出的端点集合中没有故障注入」**，不是「实现里没有」。**本领域未读 `scripts/test-api/` 或其主进程实现，未起过该服务。** 要把它抬为事实主张，须由 `code-owner-devtools` 出实现侧原件。**本领域据实标注这一层，不放大**
  2. **本条不主张 `/debug/eval` 一定能读到 presenter 的输出** —— 未实测
  3. 两份文档属 `code-owner-devtools` 边界，**越界只读**
- **验证历史**: S-0023 | 已验证（由 `expert-qa` 读取端点清单；**其证明力依第 1 条限制**）

### E-0081 | repository | 自证类
- **来源定位**: **独立复现 `E-0112` 与 `E-0113`，并抽查 `E-0116` 的轴对齐读法。** unchain `a4e69f41`
  - **`ContextBuildStatus.PARTIAL` / `.LEGACY` 在非测试代码的全部出现 = 2**，均在 `src/unchain/context/health.py` —— `:52` `capture_status: ContextBuildStatus = ContextBuildStatus.LEGACY`（**入参默认值**）· `:126` `if inputs.capture_status is ContextBuildStatus.PARTIAL:`（**比较目标**）。**无任何产出点。**
  - **`ContextBuildEnvelope(` 在非测试代码的全部出现 = 1**：`src/unchain/context/compiler.py:3227`。其 `status` 由 `:3199-3204` 给出：
    ```python
    status = (
        ContextBuildStatus.UNAVAILABLE
        if diagnostics.get("status") in {"checkpoint_required", "task_state_unavailable"}
        else ContextBuildStatus.COMPLETE
    )
    ```
    **二值。永不 `partial`、永不 `legacy`。**
  - **轴对齐抽查**：`HandoffStatus`（`context/models.py:95-99`）修饰 `HandoffEnvelope` 的产物完整度 —— **制品轴**；`GraphTerminalStatus`（`context/graph_checkpoint.py:81-84`）修饰 graph 执行单元终态（`:369` `terminal_status` · `:631` `if status is GraphTerminalStatus.COMPLETED`）—— **执行单元轴**。**两处均与 `E-0116` 的读法相符。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain && git rev-parse HEAD && git status --porcelain | wc -l
  grep -rn "ContextBuildStatus.PARTIAL\|ContextBuildStatus.LEGACY" src/ | grep -v tests
  grep -rn "ContextBuildEnvelope(" src/ | grep -v tests
  sed -n '3195,3232p' src/unchain/context/compiler.py
  grep -rn "class HandoffStatus" -A 5 src/unchain/context/models.py
  grep -rn "GraphTerminalStatus" src/ | grep -v tests
  ```
- **提交发言**: S-0032
- **支持/反驳**: **独立复现并确认** `E-0112` / `E-0113`；**据此支持 S-0032 撤回 S-0010 请求 4**（`context_build_status` 入表的收益论证）与 **接受 `E-0071` 质疑的值域那一半**；**支持** S-0032 接受 `E-0116` 的轴对齐读法
- **完整性限制**: 1. **字面量 `grep` 的负向主张**，与 `0000-0002-2026-0807#E-0069` 同一失败类 —— 以变量、别名或动态构造赋值的产出点会被漏掉，**故「零产出者」是下界形式的负向主张**。2. **未核实** `ContextBuildEnvelope.from_dict` 读回历史存量时能否携带 `"partial"`（`E-0113` 完整性限制 2 已自陈同一缺口，我确认它是缺口）。3. **轴对齐只抽查 2 个成员，未逐一复核全部 10 个** —— `E-0116` 的完整枚举以其提出方为准，本条只作方向性佐证。4. 全部落点在 unchain 仓，**越界只读，不请求任何 unchain 侧改动**
- **验证历史**: S-0032 | 已验证（由 `expert-llm` 实跑）| 命中与三元式原文如上

### E-0082 | repository | 自证类
- **来源定位**: **八个键名在 unchain 仓的实测计数（对 `E-0126` 的复核，含一处精度更正）。** unchain `a4e69f41`，`src/` 全域含测试
  ```
  unchain_context_status     0        journal_status          0
  unchain_shadow_status      0        persistence_degraded    0
  trace_status               0        persistence_error_code  0
  context_build_status       2        persistence_boundary    1
  ```
  - **`persistence_boundary` 的那 1 处不是键名**：`src/unchain/durability.py:22` `code = "durable_persistence_boundary_failure"` —— **子串命中**
  - `context_build_status` 的 2 处即 `context/harness.py:69` / `:106`（本案 E-0071）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  for k in unchain_context_status unchain_shadow_status journal_status persistence_degraded \
           persistence_error_code persistence_boundary trace_status context_build_status; do
    printf "%-26s %s\n" "$k" "$(grep -rn "$k" src/ | wc -l | tr -d ' ')"; done
  grep -rn "persistence_boundary" src/
  ```
- **提交发言**: S-0032
- **支持/反驳**: **确认 `E-0126` 的结论**（这些键名不是 unchain 的名字），**并更正其「全部零出现」这句话的字面精度**（`persistence_boundary` 为 1，系子串）；**支持** S-0032 撤回判据一
- **完整性限制**: **字面量 `grep`，负向主张，为下界。** 只覆盖 `src/`，未覆盖 unchain 仓的 `tests/` 之外的其他顶层目录。**本条不主张这八个名字在 PuPu 侧的任何性质**
- **验证历史**: S-0032 | 已验证（由 `expert-llm` 实跑）| 计数如上

### E-0083 | repository | 自证类
- **来源定位**: **上游对 *宿主传入* 的 `capture_quality` 执行构造时枚举校验，两处，均抛 `ModelValidationError`。** unchain `a4e69f41`
  - `src/unchain/context/models.py:794-800`（`ContextCompileRequest.__post_init__`，**该请求由宿主构造**）：
    ```python
    if self.capture_quality is not None:
        try:
            quality = ContextBuildStatus(self.capture_quality)
        except ValueError as exc:
            raise ModelValidationError("invalid capture_quality") from exc
        object.__setattr__(self, "capture_quality", quality.value)
    ```
  - `src/unchain/context/task_state.py:63-65`（`ContextTaskStateReadOutcome.__post_init__`）同形；且 `:84-91` 把该对象上的可达域进一步收到二值（有 unavailable 标记 ⇒ 必须 `UNAVAILABLE`，否则必须 `COMPLETE`，二者皆抛）
  - 同类 `SCHEMA: ClassVar[str]` 声明：`task_state.py:57` `"unchain.context_task_state_read_outcome.v1"`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  sed -n '55,100p' src/unchain/context/task_state.py
  sed -n '793,805p' src/unchain/context/models.py
  ```
- **提交发言**: S-0032
- **支持/反驳**: 支持 S-0032 专业理由三的 **第四句**（同簇不等于有上游供给，**也不等于无上游约束**）；**确认并扩展** `E-0114` 的 (甲-2) 与其「宿主放进去，unchain 只做枚举校验」这一表述；**为 `0000-0007-2026-0807` 指出一个已存在的校验器而非一个待发明的 schema**
- **完整性限制**: 1. **本条只证明这两处校验器存在并会抛**，**不主张** PuPu 今天的任何一条路径经过它们 —— **恰相反，S-0032 明确主张 diagnostics 路径不经过任何一处**，而该负向主张由本案 `0000-0002-2026-0807#E-0068`（产端无声明形状）承担，**本条不重复举证**。2. **未核实** 把 diagnostics 写入点接到该校验器上的工程代价（属 `code-owner-runtime` 与 `0000-0007-2026-0807`）。3. **越界只读**
- **验证历史**: S-0032 | 已验证（由 `expert-llm` 实跑）| 两处校验器原文如上

### E-0084 | repository | 自证类
- **来源定位**: **形状 A 与形状 P 写入的值逐字相同 —— 判据一区分度为零的直接证明。** PuPu `b2385d5d`
  - **形状 A（今天的产端实况）**：`unchain_runtime/server/unchain_adapter.py:7458` `unchain_context_status="partial"` · `:7466` `unchain_shadow_status="partial"` · `:8411` · `:8560` 同值
  - **形状 P（同目录已有的兄弟写法）**：`unchain_runtime/server/memory_v2_context_adapter.py:671` `"journal_status": "partial"`；另一活着的产点 `memory_v2_context.py:4298` `"journal_status": "partial"`
  - **两者的值同为字面量 `"partial"`。** 差异只在键名，不在值
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '7451,7473p' unchain_runtime/server/unchain_adapter.py
  sed -n '665,682p' unchain_runtime/server/memory_v2_context_adapter.py
  sed -n '4290,4302p' unchain_runtime/server/memory_v2_context.py
  ```
- **提交发言**: S-0032
- **支持/反驳**: **本条是 S-0032 撤回判据一的直接依据，且它比 `E-0126` 给出的理由更强** —— `E-0126` 证明「两者都不来自上游」，本条证明「两者是同一个字符串」，故区分度不是小而是 **零**；**支持** S-0032 评估结论中形状 A 两条 `不成立` 理由的维持（二者均不含词汇出处前件）
- **完整性限制**: **只覆盖这五个产点的字面取值。** 未穷举是否另有以变量拼出的取值（与本案 E-0077 同一限制）。**本条不主张任何一个形状的优劣** —— 它只证明一条判据不区分它们。全部文件属 `code-owner-runtime`，**越界只读**
- **验证历史**: S-0032 | 已验证（由 `expert-llm` 实跑）| 五处取值逐字如上

### E-0085 | repository | 自证类
- **来源定位**: **`persistence_error_code` 的取值有一部分源自上游，但对形状 A 与 P 相同。**
  - 上游：`unchain:src/unchain/durability.py:22` `code = "durable_persistence_boundary_failure"`
  - PuPu 取值方式：`memory_v2_context_adapter.py:675-677` `str(getattr(error, "code", type(error).__name__))[:128]`；`unchain_adapter.py` 三个产点均经 `_memory_v2_safe_error_code(error, <default>)`
  - **两条形状用的是同一套错误码推导** —— A 写进 `unchain_*_error_code`，P 写进 `persistence_error_code`，**取值来源不变**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain && grep -rn "persistence_boundary" src/
  cd /Users/red/Desktop/GITRepo/PuPu && sed -n '665,682p' unchain_runtime/server/memory_v2_context_adapter.py
  ```
- **提交发言**: S-0032
- **支持/反驳**: **加固** S-0032 对判据一的撤回（一条本可用来部分挽救该判据的事实，实测同样不区分 A 与 P）；**为必要条件 5 提供背景**（`errorCode` 的取值域部分可追溯到上游，故它比 `status` 更适合做验收判别式）
- **完整性限制**: 1. **未读 `_memory_v2_safe_error_code` 的实现**，故「三个产点均经它」只依 `E-0077` 的引用，**未独立复核其内部取值逻辑**。2. **未核实** 触发这三处的异常在实际运行中是否携带 `.code` 属性 —— **若不携带，取到的是 `type(error).__name__`，与上游无关**。**故本条的「部分源自上游」是一个条件式主张，不是无条件的。** 3. **越界只读**
- **验证历史**: S-0032 | 已验证（由 `expert-llm` 实跑）| 上游错误码字面量与 PuPu 取值表达式如上

---

<!-- 归档说明（speaker-of-the-house）：以下条目由 S-0014 提交，原文使用 `**E-#### · 标题**` 粗体行而非 `### E-####` 标题行。本席仅将该行的强调标记改为标题标记以使其可枚举，**标题文字与条目正文逐字未改**。 -->

> **取证 revision**：PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`。`git status --porcelain -- src/ electron/ unchain_runtime/` 实测 **0 行**。**观察时点 2026-08-08T18:3x–18:5x-07:00。**
>
> **本轮未跑任何探针。** 全部条目为对上述 revision 上文件内容的静态读取或可复跑 `grep`，**故全部标 `自证类`**：任何角色可按所给路径与行号独立复核，复现结果不依赖复现者，观察对象不会在观察后自行改变。**唯一的例外是 E-0093 的一半，其依赖本案 E-0014（`须查类`），已在该条内标明。**

---

### E-0090 · 时效性复核：revision 锚点与产品树洁净度
**证据类型**：`自证类`
**定位**：`git rev-parse HEAD` → `b2385d5dc7951887b6aeebd4001d17b4cd78af83`；`git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l` → `0`。
**内容**：本案 E-0001 的两项锚点在本 owner 的观察时点仍然成立。另复核本案 E-0004：`grep -rn "memory_v2_trace_presenter" src/COMPONENTs/chat-bubble/` 返回恰好三行 —— `trace_chain.js:28`（`presentMemoryV2Audit`）· `chat_bubble.js:10`（`isMemoryV2TraceBundle`）· `character_chat_bubble.js:10`（同）。**E-0004 所述三个渲染消费者逐字属实。**
**支持/反驳**：支持 E-0001、E-0004 的时效性。

---

### E-0091 · `isMemoryV2TraceBundle` 不是行级门，是 `<TraceChain>` 整组件的三个析取门之一；且在报错回合上是唯一的门
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/chat_bubble.js:102-110` · `:123`；`src/COMPONENTs/chat-bubble/character_chat_bubble.js:133-141` · `:167`。
**内容**：
```js
// chat_bubble.js:102-110
const hasTokenSummary =
  isAssistant &&
  message.status === "done" &&                       // ← 报错/取消回合上恒 false
  typeof message.meta?.bundle?.consumed_tokens === "number" &&
  message.meta.bundle.consumed_tokens > 0;
const hasMemoryV2Audit =
  isAssistant && isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2);
const shouldRenderTraceChain =
  hasVisibleTraceActivity || hasTokenSummary || hasMemoryV2Audit;
// :123
{isAssistant && shouldRenderTraceChain && (<TraceChain ... />)}
```
`character_chat_bubble.js:133-141` 逐字同形（`:167` 挂 `<TraceChain>`）。
**据此成立三件事**：(1) 该门翻转时出现/消失的是 **整个 `<TraceChain>` 组件**，不是链内一行；(2) 两个气泡面 **同时** 受影响；(3) 因 `hasTokenSummary` 要求 `message.status === "done"`，**在 `error` / `cancelled` / `failed` 的回合上另外两个门皆 false，memory_v2 门是唯一的门**。
**支持/反驳**：支持 U-S2；**更正** S-0004 受影响对象表把该门描述为「行」的概括。

---

### E-0092 · `Complete` / `Partial` / `Legacy` 在渲染上完全等价；四个状态词在本边界内的全部语义面只有一次相等判断
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/trace_chain.js:1937-1958`；`src/BUILTIN_COMPONENTs/timeline/timeline.js:34-51` · `:64-95` · `:142-153`；`src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:313-350` · `:35-64`；`grep -rn 'Complete\|Partial\|Legacy\|Unavailable' src/COMPONENTs/chat-bubble/ --include='*.js' | grep -v '\.test\.js'`。
**内容**：memory_v2 那一项被 push 的全部字段为 `key` / `title` / `span` / `status` / `unmountDetailsWhenClosed` / `details`，**未提供 `point`**（故落 `DotDefault`）。其中与状态相关的只有两处：
```js
title: <span data-testid="memory-v2-trace-title">Memory V2 · {memoryV2Audit.status}</span>,   // :1941
status: memoryV2Audit.status === "Unavailable" ? "pending" : "done",                          // :1949
```
`timeline.js` 中 `status` 的全部作用是 `resolveLineColor`（`:34-40`）与 `resolvePointColor`（`:42-49`），三值 `done` / `active` / `pending`。**故 `Complete`、`Partial`、`Legacy` 三者映射到同一个 `"done"`，取得同一条线色与同一个圆点色。** `span` 与状态无关（`pressure.percent` 或 `modeLabel`）。详情面板中 `Trace state`（`:313`）与 `Error code`（`:344-349`）均为普通 `AuditRow`（`:35-64`），无状态分支、无颜色、无图标。
上述 `grep` 在本边界非测试源码中对四个词的全部命中为：`memory_v2_journal_reload.js` 的 9 处（另一条轴，见 E-0097）· `trace_chain.js:781/784/786/787`（`FINALITY.LEGACY`，与本案无关）· `:1949`（本条）· `artifact-summary/*` 的 `hasCompletedArtifacts`（无关）。**即：trace 四态在本边界内的语义面只有 `:1949` 那一次 `=== "Unavailable"`，其余为字符串透传。**
**支持/反驳**：支持 二 / 五 的全部结论；**反驳** 「已有的行改颜色」这一概括。

---

### E-0093 · `Memory V2 · Partial` 今天可达，其触发者是外层 run 状态而非任何产端降级声明
**证据类型**：`自证类`（其「今天真实行上由此决定」的一半依赖本案 E-0014，`须查类`）
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:162-196`；`src/COMPONENTs/chat-bubble/trace_chain.js:1929-1930`；`grep -hon 'status: "\(done\|error\|streaming\|cancelled\|failed\|partial\)"' src/PAGEs/chat/hooks/use_chat_stream.js | sort | uniq -c`。
**内容**：`resolveTraceStatus:174-177`：
```js
const outer = normalizedText(runStatus, 48).toLowerCase();
if (["error", "failed", "cancelled", "partial"].includes(outer)) return "Partial";
```
`trace_chain.js:1929-1930` 传入 `runStatus: status`，即 `message.status`。上述 `grep` 在 `use_chat_stream.js` 中的计数：`"error"` 5 · `"done"` 5 · `"cancelled"` 4 · `"streaming"` 1 · `"failed"` 1。
**据此**：每一个以 `error` / `failed` / `cancelled` 结束、且其 bundle 能过 sanitize 的回合，今天就显示 `Memory V2 · Partial`。**结合本案 E-0014（真实持久化行 14 个顶层键无任何 status 字段 → `:164` explicit 链恒空）**，对一条真实 active 行，状态词完全由 `message.status` 与 `:195` 的默认决定：
```
Complete ⟺ message.status ∉ {error,failed,cancelled,partial} ∧ mode ∈ {active,shadow} ∧ 无 legacy/degraded/error_code
```
**支持/反驳**：支持 U-S5（并将其加强为「收端把『消息没报错』印成了 `Complete`」）；支持 二 中「`Partial` 的现有含义会与 P 的新含义在屏幕上不可区分」这一主张。
**完整性限制**：`Partial` 的可达性一半依赖 E-0014（`须查类`、n=1、开发者本机）。若某行含任一 status 字段，explicit 链先短路，本条结论收窄为「在无 status 字段的行上成立」。

---

### E-0094 · 一条绿着的测试断言：journal reload 整体失败时，标题仍为 `Memory V2 · Complete`
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js:861-881`。
**内容**：测试名 `"keeps bundle refs and marks an empty journal reload unavailable"`。其 setup 为 `mockListEvents.mockRejectedValue(new Error("[context_v2_unavailable] sidecar unavailable"))`，随后：
```js
expect(await within(reload).findByText("Unavailable")).toBeInTheDocument();
...
expect(screen.getByTestId("memory-v2-trace-title")).toHaveTextContent("Memory V2 · Complete");
```
**即：本代码库存在一条已归档、已通过的断言，声明在一个 *已被显示出来的失败* 之旁，Memory V2 的标题仍应写 `Complete`。**
**支持/反驳**：支持 U-S5。**本条不主张该测试是错的** —— 两者是不同的轴；本条只主张它是该现象的一份书面记录。

---

### E-0095 · 本边界内无任何测试断言过 `Memory V2 · Partial` / `· Legacy` / `· Unavailable`
**证据类型**：`自证类`
**定位**：`grep -n "Partial\|Legacy\|Unavailable\|Complete" src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js`。
**内容**：全部命中为 `:136`（`"Memory V2 · Complete"`）· `:140` `:787` `:844`（`Memory Agent · Completed`，run 轴）· `:824` `:871` `:910`（`within(reload)`，journal reload 面板自己的轴）· `:879`（`"Memory V2 · Complete"`）。**`memory-v2-trace-title` 的断言恰好两条，全部是 `Complete`。**
**支持/反驳**：支持 二 中「`Partial` 的呈现路径在本边界零测试覆盖」这一主张；支持约束 5。

---

### E-0096 · `audit.journalReload` 零消费者 —— 「加数据结构」处方在本边界内的第三次失败实例
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:483-495`；`grep -rn "journalReload" src/ | grep -v "\.test\.js"`。
**内容**：`mergeMemoryV2AuditWithJournal:490` 写入
```js
journalReload: { status, reason, errorCode, pagesRead, eventsScanned }
```
上述 `grep` 在全 `src/` 非测试代码中的命中 **只有这一处写入点**，**零读取**。`MemoryV2ContextAudit`（`memory_v2_trace_audit.js:267-355`）**不读 `audit.journalReload`**；面板内的同名数字由其子组件 `MemoryV2CanonicalJournalReload` 自行 fetch 并持有本地 state。
**与前两次的机制差别**：`unknownEvents`（本案 E-0005）与 `diagnostics`（本案 E-0016）的失败是「没有读者位置」；**本条的失败是「读者位置存在、就在同一个组件里，但一个更近的就地实现先把活干了」。** 三次三种机制，同一结果。
**支持/反驳**：支持丙（我不提任何计数器类处方）；补强本案 E-0005 / E-0016 的处方失败结论，并提供一条来自不同机制的独立实例。

---

### E-0097 · trace 四态与 journal reload 四态是两条轴共用同一套词，且落进同一个 `audit` 对象
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:272` `:292` `:309` `:365` `:376` `:389` `:403` `:519` · `:490` · `:566-579`。
**内容**：journal reload 的投影自行赋值 `"Complete"` / `"Partial"` / `"Unavailable"`（外加 `"Loading"`），表达的是 **journal 分页读取是否读完**，与 `ContextBuildStatus` 无任何关系。它经 `:490` 落进 `audit.journalReload.status`，并由 `:571-573` 渲染在同一块面板内：
```jsx
<span style={{ opacity: 0.58 }}>Canonical journal reload</span>
<span style={{ fontFamily: "Menlo,...", opacity: 0.68 }}>{projection.status}</span>
```
**故用户可以在同一面板中同时看到标题 `Memory V2 · Complete` 与其内部 `Canonical journal reload  Partial`。** 另：`:574` 是本边界内唯一一处为「非 Complete」写过的呈现分支（多渲一行 `role="status"` 的 reason + errorCode，`opacity: 0.62`）。
**支持/反驳**：支持 五 中「请勿在裁定里写『四态已锚定』而不加限定」；登记为第五处同词异义（本案不处置）。

---

### E-0098 · 详情面板默认折叠且默认未挂载；`Error code` 在用户点击前不在 DOM 中
**证据类型**：`自证类`
**定位**：`src/BUILTIN_COMPONENTs/timeline/timeline.js:456`（`isExpanded = false`）· `:307`（`{isExpanded ? "hide" : "detail"}`）· `:366`（`unmountWhenClosed={unmountDetailsWhenClosed}`）；`src/COMPONENTs/chat-bubble/trace_chain.js:1950`（`unmountDetailsWhenClosed: true`）；`src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:344-349`（`Error code` 行）。
**内容**：memory_v2 那一项是全 `src/` 唯一传 `unmountDetailsWhenClosed: true` 的调用点（`grep -rn "unmountDetailsWhenClosed" src/` 返回 3 行：timeline 的形参与转发、trace_chain 的唯一实参）。**故默认状态下 `Trace state` 与 `Error code` 两行均未挂载**，用户在折叠态可见的全部信息是标题里的状态词与 span。
**支持/反驳**：支持约束 1（不得把「用户会看见降级」写进验收）；支持建议处置四之 2。

---

### E-0099 · lazy 占位高度模型没有 bundle 驱动行的项；文件自身注释写明了后果
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/lazy_trace_chain.js:3-12`（头注释）· `:14-16`（常量）· `:34-49`（`countDisplayFrames`）· `:52-70`（`estimatePlaceholderHeight`）。
**内容**：
```
:4-8  「Opening an old conversation mounts every bubble's trace inside a 200ms idle
       window. A fixed 24px placeholder that expands to the real (often hundreds of
       px) TraceChain makes the scroll anchor drift and the minimap re-calibrate on
       every mount.」
```
`countDisplayFrames` 只统计通过 `DISPLAY_FRAME_TYPES` 且非 `tool_result` 的 **帧**；`estimatePlaceholderHeight:60` 在帧数 ≤ 0 时返回 `BASE_PLACEHOLDER_HEIGHT = 24`。**memory_v2 行与 token summary 行都由 bundle 驱动、不是帧，故对该估算不可见。** 一条 memory-v2-only 的 trace 因此拿到 24px 底板再撑成实高。
**支持/反驳**：支持 U-S2 中「真实代价在布局与 minimap 重校准，不在那个词」这一主张；支持 UB-4。

---

### E-0100 · `#S-0020` 必要条件 5 的机械复核：策略确实在渲染层，但其治权只及 `agentRuns`，从不触碰 `audit.status`
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:424-432`（`runStatusRank`）· `:434-479`（`mergeRuns`）· `:483-495`（`mergeMemoryV2AuditWithJournal`）；`src/COMPONENTs/chat-bubble/trace_chain.js:1928-1935`（唯一调用点）。
**内容**：`runStatusRank` 把 run 状态映射到 0–3 的秩（`{completed,complete,failed,isolated,noop}`→3，`{running,leased}`→2，`pending`→1，其余 0）；`mergeRuns:443` 以 `recoveredIsNewer = runStatusRank(run.status) >= runStatusRank(current.status)` 逐字段裁决 `status` / `consumedTokens` / `inputTokens` / `outputTokens` / `cost` / `reason` / `errorCode` 采哪一侧。**这是一条跨数据源（bundle vs journal 重放）的仲裁策略，且它在渲染层 —— `#S-0020` 必要条件 5 的主张成立，本 owner 复核确认。**
**该条未写、本 owner 复核出的适用范围**：
```js
export const mergeMemoryV2AuditWithJournal = (audit, projection) => {
  if (!isObject(audit)) return audit;
  if (!isObject(projection)) return audit;
  return { ...audit, refs: ..., agentRuns: mergeRuns(...), journalReload: {...} };
};
```
**`audit.status` 不在返回对象的任何一个被覆写的键里。** 故 journal 投影无论说什么，`Memory V2 · X` 那个词都不变。**与本案 Q1 在状态轴上无交集。**
**支持/反驳**：支持 `0000-0002-2026-0807#S-0020` 必要条件 5；**限定** 其适用范围；支持 UB-1。

---

### E-0101 · 直达渲染路径的 `errorCode` 无 identifier 级过滤，而经过滤的那一份零消费者
**证据类型**：`自证类`
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:382-385`；`src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:344-349` · `:35-64`；对照 `src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:493`。
**内容**：presenter 侧 `errorCode: normalizedText(safe.persistence_error_code || safe.error_code, 160)` —— **只截断，无模式过滤**。渲染侧 `<AuditRow label="Error code" value={audit.errorCode} isDark={isDark} code />`；`AuditRow:49-61` 把 `{value}` 放进一个 `<span>`，样式含 `whiteSpace: "pre-wrap"` / `overflowWrap: "anywhere"` / `userSelect: "text"`。**React 自带转义，故无注入面；但无模式过滤，且值可选中、可截图。**
**对照**：`memory_v2_journal_reload.js:493` 对 **另一条路径** 的 errorCode 用 `identifierText(projection.errorCode, 160)`，**而那一份正是 E-0096 所证的零消费者字段。**
**支持/反驳**：直接回答 `expert-security` S-0009 不确定性二之 2（该条指名归本 owner）；支持约束 4 与请求 4。**不改变 `expert-security` 的任何结论**（其已声明不依赖这一半）。

---

### E-0102 · issue #168 分阶段 B（折叠时卸载）已实现 —— 更正本 owner charter 中的一条过期知识
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/trace_chain.js:2056-2068`；`git log --oneline -S "bodyUnmountWhenClosed" -- src/COMPONENTs/chat-bubble/trace_chain.js`。
**内容**：
```js
// :2057-2062 注释原文：「Issue #168: once a trace is settled and the user collapses it,
// unmount the whole timeline subtree so a large run stops holding thousands of hidden
// DOM nodes after the collapse animation.」
const bodyUnmountWhenClosed = status === "done" || status === "error";
```
落于 `e77e900e  perf(trace): coalesce tool.delta observations and unmount collapsed subtrees (#168)`。**本 owner charter 载「B（折叠时卸载）与 C（延迟序列化）未做」—— B 的那一半已过期。C 仍未做，该半仍成立。**
**对本案的后果**：结合 `:1950` 的 `unmountDetailsWhenClosed: true`，**一次降级的 `Error code` 不是被隐藏而是未挂载**，在用户主动点开之前从未在任何屏幕上出现过。
**支持/反驳**：支持 E-0098 与 UB-5。

---

### E-0103 · 既有挂载测试在任何扩表前后恒绿，测不到挂载门变宽
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js:33-38` · `:41-63`。
**内容**：fixture 为
```js
meta: { bundle: { memory_v2: { mode: "active" } } }
```
**`mode` 是 59 项白名单的既有成员**，故 `isMemoryV2TraceBundle` 今天已返回 `true`，两条测试今天绿、扩表后仍绿。**该测试断言的是「memory-v2-only 的 bundle 能挂起 TraceChain」，恰好是挂载门的 *宽* 那一侧，而本案要保护的是它的 *窄* 那一侧。**
**支持/反驳**：支持约束 5(i) 与建议处置四末段（若要保护挂载门，断言须写在本边界）。

---

### E-0104 · 「只扩白名单、取值链下一批」这种分批实施在渲染面上是负效果，不是零效果
**证据类型**：`自证类`（对 `:155-196` 与 `:1949` 的静态求值；**本 owner 未执行任何探针**）
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:155-159`（`resolveMode`）· `:162-196`（`resolveTraceStatus`）· `:355-357`（`modeLabel`）；`src/COMPONENTs/chat-bubble/trace_chain.js:1944-1949`。
**内容**：设 bundle 的白名单内成员只有四个 `unchain_*` 键（S-0004 B 行的变体：**只扩白名单，不动取值链**），逐步求值：
```
resolveMode:156  safe.mode || safe.effective_rollout_mode || safe.requested_mode → 均 undefined → "" → 返回 "off"
resolveTraceStatus:164  trace_status || journal_status || status → 均 undefined → ""  → 无匹配
              :174  outer = runStatus（如 "done"）                                → 无匹配
              :178  legacy / legacy_v1 / mode==="legacy"                          → 否
              :181  persistence_degraded / persistence_error_code / error_code    → 否（四个键不在此链上）
              :189  mode === "off"                                               → 返回 "Unavailable"
trace_chain.js:1949  "Unavailable" → status: "pending"   ← 全选项空间中唯一一个视觉上不同的圆点
              :1946  span = modeLabel = titleCase("off") = "Off"
```
**净结果**：该 bundle 挂出一行 `Memory V2 · Unavailable   Off`，配 `pending` 圆点 —— **本案全部选项里唯一一处真正产生视觉差异的组合，而它产生的是错误的那一个。**
**适用边界（本 owner 主动收窄）**：**只适用于「只扩白名单、不改取值链」这一变体。** 对完整形状 A（三处同改）、对形状 C、对形状 P **均不适用**。**本条不主张 E-0012 有误** —— E-0012 的 C 段若是在完整 A 上取得，则二者不冲突，本条只补上 B 行下的那一格。
**支持/反驳**：支持约束（勿如此切片）；补充 E-0012 C 段未覆盖的一个变体。

---

<!-- 归档说明（speaker-of-the-house）：以下条目由 S-0027 提交，原文使用 `**E-#### · 标题**` 粗体行而非 `### E-####` 标题行。本席仅将该行的强调标记改为标题标记以使其可枚举，**标题文字与条目正文逐字未改**。 -->

> **取证 revision**：PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`。`git status --porcelain -- src/ electron/ unchain_runtime/` 实测 **0 行**。**观察时点 2026-08-08T21:0x–21:4x-07:00。**
>
> **本轮未跑任何探针、未起应用、未截图、未在浏览器中目视比对。** 全部条目为对上述 revision 上文件内容的静态读取、可复跑 `grep`，或对读到的 token 取值按 **WCAG 2.x 相对亮度公式** 所作的算术。**故全部标 `自证类`**：任何角色可按所给路径、行号与公式独立复核，复现结果不依赖复现者。
>
> **对比度的复算方法（一次写明，下文各条不重复）**：`L = 0.2126·R + 0.7152·G + 0.0722·B`，其中每个通道 `c = c₈/255`，`c_lin = ((c+0.055)/1.055)^2.4`（`c ≤ 0.04045` 时 `c/12.92`）；`ratio = (L_亮+0.05)/(L_暗+0.05)`。半透明前景先按 `眼见值 = α·前景 + (1−α)·底色` 合成再算。**底色取 `--pupu-background`（light `#ffffff` / dark `#121212`），依据 E-0172 第 3 段。**

---

### E-0170 · 时效性复核：revision 锚点与产品树洁净度
**证据类型**：`自证类`
**定位**：`git rev-parse HEAD` → `b2385d5dc7951887b6aeebd4001d17b4cd78af83`；`git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l` → `0`。
**内容**：本案 E-0001 / E-0090 的两项锚点在本领域的观察时点仍然成立。本条以下全部定位均在该 revision 上取得。
**支持/反驳**：支持 E-0001、E-0090 的时效性。

---

### E-0171 · `theme.timeline` 的明暗两套取值（本案圆点色的实际来源）
**证据类型**：`自证类`
**定位**：`src/BUILTIN_COMPONENTs/theme/default_mini_theme.json:2`（`"light_mode"`）· `:284-294`（light 的 `timeline` 块）· `:318`（`"dark_mode"`）· `:600-610`（dark 的 `timeline` 块）。
**内容**：

| key | light_mode | dark_mode |
|---|---|---|
| `lineColor` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.12)` |
| `lineDoneColor` | `rgba(0,0,0,0.18)` | `rgba(255,255,255,0.15)` |
| **`pointDoneColor`** | **`rgba(0,0,0,0.22)`** | **`rgba(255,255,255,0.22)`** |
| **`pointPendingColor`** | **`rgba(0,0,0,0.18)`** | **`rgba(255,255,255,0.18)`** |
| `titleColor` | `#222222` | `#CCCCCC` |
| `spanColor` | `rgba(0,0,0,0.45)` | `rgba(255,255,255,0.45)` |
| `seeDetailsColor` | `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.35)` |
| `detailsBackground` | `rgba(0,0,0,0.025)` | `rgba(255,255,255,0.03)` |
| `titleFontSize` / `fontSize` | `14px` / `13px` | 同 |

**该 JSON 无 `pointColor`，也无任何 error / danger 键** —— `timeline` 的状态词汇表只有 `done` / `active` / `pending` 三值（`timeline.js:742` 的 props 文档逐字如此），**没有 error 态**。
**支持/反驳**：支持 E-0172 的全部数字；支持 UX-V1；为 UX-1 提供取值来源。

---

### E-0172 · 圆点色的完整解析链与实测对比度：`done` 与 `pending` 在两套主题下均低于 3:1，且彼此差异低于可辨阈
**证据类型**：`自证类`（静态读取 + 按 WCAG 公式的算术；**未在浏览器中目视比对**）
**定位**：`src/BUILTIN_COMPONENTs/timeline/timeline.js:42-48`（`resolvePointColor`）· `:64-77`（`DotDefault`）· `:24`（`DEFAULT_DOT_R = 5`）· `:34-40`（`resolveLineColor`）· `:756-762`（`tl` 的构造）；`src/COMPONENTs/chat-bubble/trace_chain.js:1937-1959`（memory_v2 那一次 `grouped.push`）；`src/COMPONENTs/chat-bubble/chat_bubble.js:164-176`；`src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:239-266`。
**内容**：

1. **解析链**。`Timeline` 以 `tl = { ...(theme?.timeline ?? {}), highlightColor }` 构造调色（`:756-762`）；`resolvePointColor(status, tl)` 在 `status==="done"` 时取 `tl.pointDoneColor`，否则（`pending`）取 `tl.pointPendingColor`（`:45-47`）。`DotDefault` 把该色用作 **`border: 1px solid`**，`background:"transparent"`，尺寸 `10×10`（`:64-77`，`DEFAULT_DOT_R*2`）。**memory_v2 那一次 push 的键为 `key` / `title` / `span` / `status` / `unmountDetailsWhenClosed` / `details` —— 未传 `point`**，故落 `DotDefault`。
2. **底色**。`chat_bubble.js:170-176` 只在 `isUser && !isEditing` 时给气泡上底色；**assistant 气泡不上底色**，直接坐在应用底色上。`SEMANTIC_DEFAULTS.background` = `#ffffff`（light）/ `#121212`（dark）（`semantic_tokens.js:242` / `:255`）。
3. **实测**（公式见本节抬头）：

| | 前景 | 合成后 | 对比度 | SC 1.4.11（3:1） |
|---|---|---|---|---|
| **light · `done`**（Complete / Partial / Legacy） | `rgba(0,0,0,0.22)` on `#ffffff` | `#C7C7C7` | **1.69:1** | **不满足** |
| **light · `pending`**（Unavailable） | `rgba(0,0,0,0.18)` on `#ffffff` | `#D1D1D1` | **1.53:1** | **不满足** |
| **dark · `done`** | `rgba(255,255,255,0.22)` on `#121212` | `#464646` | **1.99:1** | **不满足** |
| **dark · `pending`** | `rgba(255,255,255,0.18)` on `#121212` | `#3D3D3D` | **1.72:1** | **不满足** |

4. **两态之差**：light `1.69 → 1.53`，dark `1.99 → 1.72`；对应 8 位色差 **light 10/255 · dark 9/255**，作用在一个 10×10px 透明圆的 **1px 描边** 上。
5. **顺带实测的两项**（同一公式，供 UX-C4 参照）：标题 `#222222`/`#CCCCCC` → **15.9:1 / 11.7:1**（合格）；span `rgba(*,0.45)` @11px → **3.35:1 / 4.53:1**（**light 不满足 SC 1.4.3 的 4.5:1**；`Off` / `85% context` / modeLabel 都在这个槽里）。

**据此成立**：`Complete` / `Partial` / `Legacy` / `Unavailable` **四者** 在两套主题下均无可察觉的视觉区分；**`Unavailable` 的「不同圆点」不是一次有效的状态编码。**
**支持/反驳**：支持 UX-V1；**扩展** 本案 E-0092（其结论为三态全等，本条把它扩到四态）；**反驳** 本案 E-0104 中「视觉上不同的圆点」这一表述（见文末 OBJECTION）。
**完整性限制**：为计算值非仪器测量；数字锚定在默认调色板上，用户自定义 `background` 后须重算。

---

### E-0173 · `theme.timeline` 不在语义 token 的覆盖表内 —— 整条 trace chain 不跟随用户自定义主题
**证据类型**：`自证类`
**定位**：`src/CONTAINERs/config/theme_semantic.js:211-303`（`applySemanticPaletteToTheme` 全文）；`src/CONTAINERs/config/container.js:157-171`（调用点）；`grep -rn "timeline:" src/` → **零命中**（`default_mini_theme.json` 用的是 JSON 的 `"timeline":`）。
**内容**：`applySemanticPaletteToTheme` 的返回对象显式覆写 `highlightColor` / `color` / `backgroundColor` / `foregroundColor` / `icon` / `font` / `input` / `select` / `modal` / `switch`，以及 `deepTier` 分支下的 `code` / `textfield` / `markdown`。**`timeline` 不在其中**，故经 `...base` 原样透传 `default_mini_theme.json` 的固定 alpha 灰。
**据此**：trace chain 的点、线、标题、span、`detail` 按钮 **不随用户自定义调色板变化**；而 `--pupu-danger` 会（E-0176）。
**支持/反驳**：支持 UX-1；限定 UX-C3 的适用后果（本案会在一条不跟随主题的 timeline 上放一个跟随主题的元素）。

---

### E-0174 · 错误标记的形态已存在于本案同一文件内，且 memory_v2 那一项没有传 `point`
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/trace_chain.js:543-567`（`ErrorPoint`）· `:1747`（其使用点）· `:1937-1959`（memory_v2 的 push，**无 `point` 键**）；`grep -n "point:" src/COMPONENTs/chat-bubble/trace_chain.js` → `:1059` `AccentPoint` · `:1139` `HammerPoint` · `:1459` `:1529` `SubagentPoint` · `:1726` `toolPointEl` · **`:1747` `<ErrorPoint />`** · `:1802` `:1824` `"loading"` · `:1919` `HammerPoint` · `:2012` `"end"`。
**内容**：

```js
// trace_chain.js:545-567
const ErrorPoint = () => (
  <div style={{ width: 16, height: 16, flexShrink: 0, color: "#ef4444", ... }}>
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 ... 11 7V13H13V7H11Z" />
    </svg>
  </div>
);
```

**三件事据此成立**：

1. **timeline 的 `point` 槽是本仓既定的「这一项与众不同」的表达方式**，`trace_chain.js` 里已有 **六个** 自定义 point 元素在用它。
2. **本仓已有一个专门的错误标记形态，就在本案标题产生地上方约 1400 行**，且已被 `:1747` 实际使用。
3. **memory_v2 那一项没有传 `point`** —— 它落 `DotDefault`，与其余所有普通行同形。

**该形态的实测对比度**：`#ef4444` on `#ffffff` = **3.76:1**；on `#121212` = **4.98:1** —— **两套主题均满足 SC 1.4.11 的 3:1。**
**同时登记一处既有债（UX-3）**：`#ef4444` 是 **裸 hex、单值双主题、绕过 `theme.semantic.danger`**，故不跟随用户自定义主题。
**支持/反驳**：**反驳** `code-owner-chat-bubble` 接受条件 (ii) 中「今天没有任何形态可以挂载」这一 **事实前提**（不反驳其拒绝落点的权利）；支持 UX-C2；支持 UX-3。

---

### E-0175 · `var(--pupu-danger)` 与 `role="alert"` 已在渲染 `Error code` 的同一文件内被使用
**证据类型**：`自证类`
**定位**：`src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:196-202`（`RefReader` 的错误分支）· `:344-352`（`Error code` 行）· `:35-64`（`AuditRow`）；对照 `src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:574`（`role="status"`）。
**内容**：

```jsx
// memory_v2_trace_audit.js:196-202
{reader.error ? (
  <div role="alert" style={{ fontSize: 11, color: "var(--pupu-danger, #c44)" }}>
    {reader.error}
  </div>
) : ( ... )}
```

**即：渲染 `Trace state` 与 `Error code` 的那个组件，在同一文件、上方约 145 行处，已经在用语义 danger token 配 `role="alert"` 表达一次错误。** 另一处 `role="status"` 的先例在 `memory_v2_journal_reload.js:574`。
**支持/反驳**：与 E-0174 共同 **反驳** 「今天没有任何形态可以挂载」的事实前提；支持 UX-C2 / UX-C3。

---

### E-0176 · 仓内已有一套 shipped 的、明暗成对的、跟随用户主题的语义色，含 `danger` 与 `warning`
**证据类型**：`自证类`
**定位**：`src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:239-266`（`SEMANTIC_DEFAULTS`）· `:102-109`（token 树，`danger` 标 `phase:"shipped"`，`warning` 标 `phase:"P1"`）；`src/CONTAINERs/config/theme_semantic.js:159-172`（`semanticCssVars` 发出 `--pupu-{varName}` 与 `-rgb`）· `:232`（`semantic` 挂进 theme 对象）；`src/CONTAINERs/config/container.js:274` · `:368`（生产调用点）；`grep -rn "pupu-danger\|semantic?.danger" src/` 的既有消费者：`toast_host.js:100` · `modal.js:338` `:369` · `theme_editor.js:404-417` · `diff_body.js:134-135` · `code_diff_interact.js:55` `:107` `:133` `:160-161` · `memory_v2_pending_reviews.js:1035` · `memory_v2_trace_audit.js:199`。
**内容**：

| token | light_mode | dark_mode | 形式 |
|---|---|---|---|
| `danger` | `#dc3545` | `#f87171` | `theme.semantic.danger` · `var(--pupu-danger)` · `var(--pupu-danger-rgb)` |
| `warning` | `#d97706` | `#fbbf24` | 同形 |
| `success` | `#22c55e` | `#4ade80` | 同形 |
| `info` | `#2563eb` | `#60a5fa` | 同形 |
| `background` | `#ffffff` | `#121212` | — |
| `surface` | `#ffffff` | `#1e1e1e` | — |

**`applySemanticPaletteToTheme` 与 `applySemanticCssVars` 在 `container.js` 中无条件执行**（`themeColorCustomizationEnabled` 只影响 preset/custom 的读取，不影响默认调色板的下发），**故 `--pupu-danger` 在任何配置下都可用。**
**支持/反驳**：支持 UX-C3；与 E-0173 共同支持 UX-1（**语义色跟随主题，timeline 的灰不跟随**）。

---

### E-0177 · `danger` 对 `background` 的对比度：全 9 套出厂预设 × 2 模式全量实测，下界 3.05:1
**证据类型**：`自证类`（按 WCAG 公式的算术，全量扫描）
**定位**：`src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:239-266`（`SEMANTIC_DEFAULTS`）· `:268-` 起（`SEMANTIC_PRESETS`，另 8 套：`ocean` / `warm` / `high_contrast` / `graphite` / `violet` / `rose` / `nord` / `midnight`）。**复算方法**：对每套预设的每个模式，取 `danger` 与 `background` / `sidebar` / `surface` 三个外壳色，按本节抬头的公式两两求比。
**内容**：

**(a) `default` 预设**（本案的出厂默认）：

| 模式 | 前景 | 底色 | 对比度 |
|---|---|---|---|
| light | `#dc3545` | `#ffffff`（`background`） | **4.53:1** |
| dark | `#f87171` | `#121212`（`background`） | **6.77:1** |
| dark | `#f87171` | `#1e1e1e`（`surface`，防御性核算） | **6.03:1** |

**(b) 全 9 预设 × 2 模式的下界**（这一段是本条的要点）：

| 核算面 | 出厂下界 | 出处 | SC 1.4.11（3:1） |
|---|---|---|---|
| **`danger ↔ background`** | **3.05:1** | `nord` 暗色，`#bf616a` on `#2e3440` | **满足，余量 0.05** |
| `danger ↔ sidebar` | 2.46:1 | `nord` 暗色，`#bf616a` on `#3b4252` | **不满足** |
| `danger ↔ surface` | **2.11:1** | `nord` 暗色，`#bf616a` on `#434c5e` | **不满足** |

次低的几档（`warm` / `violet` / `ocean` / `graphite` 亮色对 `sidebar`）在 3.97–4.12:1，**即 `nord` 暗色是唯一的绑定约束。**

**三件事据此成立**：

1. **UX-C4 在全部出厂预设上可满足，但只在 `background` 这一个核算面上可满足**，且最坏预设余量仅 0.05。
2. **本案不受 `sidebar` / `surface` 那两档约束的唯一理由是 assistant 气泡不上底色**（E-0172 第 2 段）。**这是一条依赖，不是一条豁免** —— 依赖失效则 UX-C4 失效。
3. **只量 `default` 会得到偏乐观的数**（4.53 / 6.77，而真实下界是 3.05）。**任何据本条作出的阈值主张必须写明核算面与预设范围。**

**支持/反驳**：支持 UX-C4 与 UX-C2（**形状优先于颜色，因为颜色在最坏预设上余量只有 0.05**）；使 UX-V4 的必要条件成为可验收的数字。
**完整性限制**：为计算值非仪器测量。**用户自定义 `danger` 或 `background` 后须重算** —— 属主题编辑器的对比度职责，不属本案。**本条不主张本组织既有主题护栏（状态色阈值 1.9:1）有误** —— 那条护栏的核算面含 `sidebar`，与本条的 `background` 核算面不是同一个量，二者不冲突，理由见 UX-C4 之 (iii)。

---

### E-0178 · 通往 `Error code` 的唯一控件在四项交互状态判据上不满足，且 hover 使其对比度下降
**证据类型**：`自证类`（静态读取 + 算术）
**定位**：`src/BUILTIN_COMPONENTs/timeline/timeline.js:281-320`（`detail` 按钮全文）· `:256`（`lineHeight: 18px`）· `:307`（`{isExpanded ? "hide" : "detail"}`）· `:308-318`（14×14 图标）；取值见 E-0171 的 `seeDetailsColor`。
**内容**：

```js
// timeline.js:282-306（节选，逐字）
<button
  onClick={onToggle}
  style={{ ..., padding: "0", background: "transparent", border: "none",
           fontSize: tl.spanFontSize ?? "11px",
           color: tl.seeDetailsColor ?? "rgba(0,0,0,0.35)",
           outline: "none", userSelect: "none", ... }}
  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
>
```

| 判据 | 实测 | 结论 |
|---|---|---|
| **焦点可见** | `outline:"none"`，**全 style 内无任何 `:focus` / `focus-visible` 替代**（内联样式，无伪类可用） | **SC 2.4.7 不满足** |
| **名称·角色·值** | 无 `aria-expanded`、无 `aria-controls`；可访问名仅 `detail` / `hide` | **SC 4.1.2 不满足**（disclosure 状态未程序化暴露） |
| **目标尺寸** | `padding:"0"`；内容为 11px 文字 ＋ 14×14 图标，行高 18px → 有效目标约 **45×18px** | **SC 2.5.8（24×24）不满足** |
| **静息对比度** | `rgba(0,0,0,0.35)` on `#ffffff` → **2.44:1**；`rgba(255,255,255,0.35)` on `#121212` → **3.21:1**；11px 非大字号 | **SC 1.4.3（4.5:1）不满足** |
| **hover 对比度** | `opacity:0.6` → 有效 α≈0.21 → **1.65:1（light）· 1.92:1（dark）** | **hover 使其下降 32% / 40%** |

**据此**：`Error code` 在折叠态不在 DOM 内（本案 E-0098），而唯一入口不可聚焦、状态不可读、目标过小、且越靠近越暗。
**支持/反驳**：支持 UX-C5（呈现必须在默认折叠态成立）；支持 UX-2；支持本案 E-0098 的用户面后果。

---

### E-0179 · 展开之后的信息本身合格 —— 失效在可达性不在可读性
**证据类型**：`自证类`（静态读取 + 算术）
**定位**：`src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:35-64`（`AuditRow`）· `:344-352`（`Error code` 行）；`detailsBackground` 取值见 E-0171。
**内容**：`AuditRow` 的值 span 显式取 `isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.72)"`，11px 等宽（`code` 时），`whiteSpace:"pre-wrap"` / `overflowWrap:"anywhere"` / `userSelect:"text"`。合成底色为 `detailsBackground` 叠在 `--pupu-background` 上：

| 主题 | 值前景 | 合成底 | 对比度 | SC 1.4.3 |
|---|---|---|---|---|
| light | `rgba(0,0,0,0.72)` | `rgba(0,0,0,0.025)` on `#ffffff` | **8.74:1** | 满足 |
| dark | `rgba(255,255,255,0.76)` | `rgba(255,255,255,0.03)` on `#121212` | **10.48:1** | 满足 |

**且值可选中（`userSelect:"text"`），长值可换行。**
**支持/反驳**：支持 UX-C5 的分工（默认态承载「有问题」，展开态承载「什么问题」—— 后者已合格）；**反驳** 任何把本案失效归因于「详情面板做得不好」的读法。

---

### E-0180 · `resolveTraceStatus` 的返回域是封闭的四个字面量；标题槽是纯插值，其安全性来自收端映射
**证据类型**：`自证类`
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:162-196`（全文）；`src/COMPONENTs/chat-bubble/trace_chain.js:1939-1943`。
**内容**：`resolveTraceStatus` 的每一条 `return` 都是四个 **字面量** 之一（`"Complete"` / `"Partial"` / `"Legacy"` / `"Unavailable"`），**无任何一条把入参字符串回吐**；末行 `return mode === "active" || mode === "shadow" ? "Complete" : "Unavailable"`。而消费侧：

```jsx
// trace_chain.js:1939-1943
title: (<span data-testid="memory-v2-trace-title">Memory V2 · {memoryV2Audit.status}</span>)
```

**是一次无界的字符串插值，位于 14px / weight 500 的标题槽 —— 本行视觉权重最高的位置。**
**据此**：今天标题槽不会显示任意上游字符串，**其原因完全在于 `resolveTraceStatus` 的封闭返回域，与标题槽本身无关。**
**支持/反驳**：支持理由六之 1（甲 的绑定必须保留收端封闭映射）；**限定** 本案 E-0092「纯字符串透传」这一描述的安全含义。

---

### E-0181 · 四个状态词零 i18n
**证据类型**：`自证类`
**定位**：`grep -rln "Unavailable" src/locales/` → **零命中**；`grep -rn '"Memory V2\|memory_v2' src/locales/en.json` → **零命中**；对照 `memory_v2_trace_presenter.js:167-196` 的四个硬编码英文字面量与 `trace_chain.js:1941` 的硬编码 `"Memory V2 · "` 前缀。
**内容**：PuPu 发 11 个 locale（`src/locales/`），**本案全部用户可见文本一个都不经过 `t()`**。
**支持/反驳**：支持理由六之 3（甲 的绑定会固化「显示标签 = 枚举成员名」）；支持 UX-4。

---

### E-0182 · `Off` 的产生机制：内部枚举缺省经通用美化函数取得产品文案的外观
**证据类型**：`自证类`
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:148-151`（`titleCase`）· `:154-160`（`resolveMode`）· `:355-357`（`modeLabel`）；`src/COMPONENTs/chat-bubble/trace_chain.js:1944-1947`（span 取 `modeLabel`）。
**内容**：

```js
// :150-151  const text = normalizedText(value, 80).replace(/[_-]+/g, " ");
//           return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
// :156-159  const mode = normalizedText(raw.mode || raw.effective_rollout_mode || raw.requested_mode, 48).toLowerCase();
//           return mode || "off";
```

**即 `resolveMode` 的缺省字符串 `"off"` 经通用 titleCase 变成 `"Off"`，落进 span 槽，与真实 mode 标签（`Active` / `Shadow`）在版式上完全不可区分。**
**据此**：`Off` 不是一个被设计过的产品文案，是一个内部缺省值的美化投影；**它对用户断言的是「这个功能是关着的」（一个用户设置），而非「系统出了问题」。**
**支持/反驳**：支持理由四（分批实施的真实负效果在文本不在圆点）；支持理由六之 2（绑定上游枚举时禁止通用美化）；**限定** 本案 E-0104 对负效果机制的归因。

---

### E-0183 · 标题与 span 均不可选中
**证据类型**：`自证类`
**定位**：`src/BUILTIN_COMPONENTs/timeline/timeline.js:270-271`（title span 的 `userSelect:"none"` / `WebkitUserSelect:"none"`）· `:328-329`（span 同）· `:296-297`（`detail` 按钮同）。
**内容**：memory_v2 那一行在折叠态下的三段可见文本 —— 状态词、span、`detail` —— **全部不可选中**。用户要把「我看到 `Memory V2 · Partial`」交给我们，只能截图。
**支持/反驳**：支持 UX-6。**本条不列入 S-0027 的 `依据`** —— 它只支撑一项登记项，不支撑任何裁定，依 S-0001 第 3 点的复核负担纪律主动排除。

---

## OBJECTION（请 `speaker-of-the-house` 另行分配发言编号）

#### S-#### | OBJECTION | expert-ux → E-0104

- **阶段**: 议案庭审
- **结论**: **E-0104 的定位不包含任何颜色信息，因而不能支撑其正文中「全选项空间中唯一一个视觉上不同的圆点」这一表述。** 该条其余部分（求值链、`Unavailable` 的可达性、span 落 `Off`、以及「分批实施是负效果不是零效果」这一 **结论**）**本领域不质疑，且以 E-0182 独立佐证其成立**。质疑只针对 **视觉差异的归因**
- **依据**: E-0171, E-0172, E-0182；本案 E-0104, E-0092
- **不确定性**: 本领域的对比度为 **按 WCAG 2.x 公式的计算值**，非仪器测量、非浏览器目视比对。若复核者以实测手段得出两态可辨，本异议应被驳回
- **请求/下一步**: 依[证据规则第二节](../../../codex/lifecycle/evidence-rules.md)强制触发 `evidence-examiner` 审查。**补强责任在提出方**（`code-owner-chat-bubble`）；**本领域不主张该证据为假，只主张其定位不足以支撑该一句表述**
- **异议编号目标**: **E-0104**
- **异议类型**: **UNSUPPORTED**
- **受影响事项**:

  1. **S-0026 第四节的表述须重排。** 该节援引 E-0104 写「**这是全选项空间里唯一一处真正产生视觉差异的组合**」，并据以把分批实施列入风险。**风险本身成立**（E-0182 从另一条路径支持它），**但其机制记错了位置** —— 真实差异在标题词与 span（`Off`），不在圆点。
  2. **本案的成本估计会改变，这是更要紧的一项。** 若案卷保留「`Unavailable` 已经有一个不同的圆点」这一读法，判决可能推断「照 `Unavailable` 的做法给 `Partial` 也做一个」是一次低成本、已有先例的处置。**那是在照抄一个不工作的东西**（E-0172：两态均 < 3:1，差值低于可辨阈）。**这直接改变待裁问题「本案是否处置呈现」的答案形状，也直接决定我的 UX-C2 / UX-C3 是否必要。**

- **理由**：E-0104 的 **定位** 字段列出的全部位置为 `memory_v2_trace_presenter.js:155-159` · `:162-196` · `:355-357` 与 `trace_chain.js:1944-1949`。**这四处没有一处含任何颜色值。** `pending` 与 `done` 两个圆点的颜色解析发生在 `timeline.js:42-48`（`resolvePointColor`）与 `default_mini_theme.json` 的 `timeline.pointDoneColor` / `pointPendingColor`（E-0171），**该条一处都没有引。** 故它可以支撑「`status` 落到 `"pending"`」（代码路径，成立），**不能支撑「视觉上不同」（呈现事实）。**

  **本领域指出这不是一次疏漏，提出方自己已经声明了这个缺口**：`S-0014` 不确定性二之 4 逐字写道「**未** 逐一核对 `Icon`、`AnimatedChildren` 与主题 token 在暗色下的取值；**未** 在浏览器里目视比对两个状态的实际渲染」。**本异议是对该自陈缺口的补齐，不是对该 owner 取证质量的指摘** —— 主题 token 的取值本就落在本领域，而本领域立案时不在名单上。

  **本领域同时声明不质疑 E-0092**：其「Complete / Partial / Legacy 映射到同一个 `done`」经复核逐字属实，且它 **从未主张** `Unavailable` 的例外是可察觉的。**两条证据在本领域的处置不同，请勿合并处理。**

### E-0020 | repository | 自证类
- **来源定位**: **`messages` 表有第二个写入者，它不经过本 owner 的脱敏器，且位于本 owner 边界之外。**
  - `pupu:electron/main/services/chat_storage/service.js:494-522 migrateLegacyFileIfNeeded` —— 读 `legacyFilePath`（`chats.json`）并 `JSON.parse`，经 `assertRecognizableLegacyChatStore(store)` 后调用 `applyOps([{ type: "import_store", store }])`；**成功后 `fs.renameSync` 加迁移后缀**
  - 同文件 `:313` —— `import_store` 分支调 `replaceMessages(op.chatId, op.messages)`
  - 同文件 `:280` —— `const replaceMessages = (chatId, messages) => {` 定义处
  - **前置条件**：`:494-495` `if (!isDbEmpty()) return; if (!fs.existsSync(legacyFilePath)) return;` —— **仅在 `chats` 与 `meta` 两表皆空时执行，且执行后源文件被改名**，故 **至多一次**
  - **关键否定事实**：`grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle" electron` → **0 命中**。**主进程全域不 import 本 owner 的脱敏器，物理上无法在该路径施加它**
- **取得方式**:
  ```
  sed -n '488,528p' electron/main/services/chat_storage/service.js
  grep -rn "replaceMessages" electron src        # -> 3 处，全在 service.js（:280 定义 · :313 · :386）
  grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle" electron | wc -l
    # -> 0
  ```
  PuPu HEAD `b2385d5d`，2026-08-08。**未派生子 instance；只读，未 commit**
- **提交发言**: S-0019
- **支持/反驳**:
  - **更正 `E-0051` 的射程，不反驳其机制。** `expert-security` 所述「`BLOCKED_KEY_PATTERN` 从不作用于顶层键」「`TOP_LEVEL_KEYS` 是唯一顶层过滤器」—— **前半在本 owner 的制品上成立并经本 owner 复核确认；后半须加路径限定**：那是 **渲染进程写入路径** 上的唯一顶层过滤器，主进程 legacy 导入路径上顶层过滤器数为 **0**
  - **证成 `expert-qa` 对 `E-0015` 的 `UNSUPPORTED` 质疑所指的机制。** 该绕行路径真实存在，**由该证据的提出人（本 owner）确认，不由质疑方举证**（宪法第五条）
  - **不支持「历史行可能含这四个键」这一推论。** 通道存在不等于有货源：依 `E-0017`，用户机器上的 `chats.json` 只可能由无 Memory V2 flag 的已发布版本写出
- **完整性限制**:
  1. **只核了 `replaceMessages` 三个调用点中的一个（`:313`，import_store）。** `:386` 的调用上下文 **未追**，故本条 **不主张** legacy 导入是唯一绕行入口 —— 只主张它是其中一个
  2. **未跑运行时**，未构造一次 legacy 导入，未观察一条真实被导入的行
  3. **`import_store` 之前的 `assertRecognizableLegacyChatStore` 做了什么校验，本条未展开** —— 它可能包含本条未知的形状约束。**本条只主张「不施加 `sanitizeMemoryV2TraceBundle`」，不主张「不施加任何校验」**
  4. **`electron/main/**` 属 `code-owner-electron`，本条为越界只读**，只出机械事实与 import 计数，对该路径的取舍不表态
- **验证历史**:
  - S-0019 | 已验证（由提交人实跑，行号与 import 计数可复核）| `migrateLegacyFileIfNeeded` → `applyOps(import_store)` → `replaceMessages` 链路如上；`electron/` 对本 owner 三个相关标识符的 import 计数为 0

---

<!-- 归档说明：以下条目由 S-0039 提交，原文为粗体行而非标题行；本席仅改强调标记为标题标记，正文逐字未改。 -->

> 依传唤书「唯一允许的写入是你的交付文件」，本领域未另建 `E-####.md` 文件，全部证据条目随本文件提交。**取证 revision：PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83` · unchain `a4e69f413c449c5768433ba4dddc5b60b8146991`。观察时点 2026-08-08 深夜（本地）。**
>
> **本轮未跑任何应用、未起 sidecar、未跑任何测试套件、未落任何 scratchpad 制品。** 全部条目为对上述 revision 上文件内容的静态读取、可复跑 `grep` / `sed`，或对文件原文的一次解析型集合运算（脚本随条目给出），**故全部标 `自证类`**：任何角色可按所给路径与命令独立复核，复现结果不依赖复现者，观察对象不会在观察后自行改变。

---

### E-0190 · 时效性复核：两仓 revision 与产品树洁净度
**证据类型**：`自证类`
**定位 / 取得方式**：
```
cd /Users/red/Desktop/GITRepo/PuPu   && git rev-parse --short HEAD          → b2385d5d
                                      && git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l → 0
cd /Users/red/Desktop/GITRepo/unchain && git rev-parse --short HEAD          → a4e69f4
```
**内容**：本案 E-0001 / E-0010 / E-0050 / E-0090 / E-0150 所载两项锚点在本领域观察时点仍然成立 —— **第五次独立时效性复核**。本条全部证据的锚点与本案已归档证据一致。
**支持/反驳**：支持 E-0001 及其后各次时效性复核的时效性。
**完整性限制**：未比对 presenter 的 sha256（本领域未复用任何前序探针制品，故无需保管链对照）。

---

### E-0191 · `TOP_LEVEL_KEYS` 的机械成员判定，与「白名单只管深度 0」的源码机制复核
**证据类型**：`自证类`
**定位**：`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:1-10`（四个封顶常量 + `BLOCKED_KEY_PATTERN`）· `:9-69`（`TOP_LEVEL_KEYS`）· `:88-122`（`sanitizeNode`）· `:124-133`（`sanitizeMemoryV2TraceBundle`）。
**取得方式**（可原样粘贴）：
```bash
cd /Users/red/Desktop/GITRepo/PuPu && node -e '
const fs=require("fs");
const s=fs.readFileSync("src/SERVICEs/runtime_events/memory_v2_trace_presenter.js","utf8");
const m=s.match(/const TOP_LEVEL_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
const keys=[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
console.log("count:",keys.length);
for(const k of ["unchain_context_status","unchain_context_error_code","unchain_shadow_status",
"unchain_shadow_error_code","persistence_reason","persistence_event_type","context_build_status",
"persistence_boundary","journal_status","persistence_degraded","persistence_error_code",
"trace_status","status","error_code","schema_version","context_build","latest_context_build"])
  console.log(String(keys.includes(k)).padEnd(5),k);'
```
**内容（输出原文）**：`count: 59`。**不在表内**：四个 `unchain_*` 键 · `persistence_reason` · `persistence_event_type` · `context_build_status` · `persistence_boundary`。**在表内**：`journal_status` · `persistence_degraded` · `persistence_error_code` · `trace_status` · `status` · `error_code` · `schema_version` · **`context_build`** · **`latest_context_build`**（后两者即形状 D 可用的容器键）。

**机制复核（源码原文）**：
```js
// :124-133  —— 顶层：遍历 TOP_LEVEL_KEYS，不施加 BLOCKED_KEY_PATTERN
for (const key of TOP_LEVEL_KEYS) {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;   // ← 缺键 no-op
  const sanitized = sanitizeNode(raw[key]);                        // ← depth 默认 0
  ...
}
// :111-120  —— 嵌套：遍历该对象全部键，施加 BLOCKED_KEY_PATTERN，无白名单
for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
  const key = String(rawKey).slice(0, 128);
  if (!key || BLOCKED_KEY_PATTERN.test(key)) continue;
  ...
}
```
**据此成立三件事**：(1) **顶层有表无正则、嵌套层有正则无表**（独立复现 `expert-security` E-0051 与 `expert-llm` E-0078，二者互相印证，本领域不质疑任一条）；(2) 白名单精确管辖 **深度 0**；(3) **扩表对缺键行是严格 no-op**（`hasOwnProperty` 跳过 —— 独立复现 E-0011）。
**支持/反驳**：支持 E-0011 / E-0051 / E-0078 / E-0002 的时效性与机制；为 ARCH-6 (i) 与 `不成立 (ii)` 提供依据。
**完整性限制**：字面量解析，与 `0000-0002-2026-0807#E-0069` 同一失败类；**若表内存在以变量或拼接构造的成员，`59` 为下界。**（目视该常量块为纯字面量数组，未见变量成员。）

---

### E-0192 ·（本条的核心）产端 `diagnostics()` 的 21 键基字面量与收端 59 项表的第一次对照 —— 7 个被丢；并：产端已存在一处零校验的单一漏斗
**证据类型**：`自证类`
**定位**：`unchain_runtime/server/memory_v2_context.py:536-579`（`diagnostics()`）· `unchain_runtime/server/unchain_adapter.py:271-281`（`_memory_v2_merge_diagnostics`）· `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:9-69`。
**取得方式**：
```bash
cd /Users/red/Desktop/GITRepo/PuPu && sed -n '536,579p' unchain_runtime/server/memory_v2_context.py
cd /Users/red/Desktop/GITRepo/PuPu && node -e '
const fs=require("fs");
const s=fs.readFileSync("src/SERVICEs/runtime_events/memory_v2_trace_presenter.js","utf8");
const m=s.match(/const TOP_LEVEL_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
const wl=new Set([...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]));
const base=["schema_version","requested_mode","requested_rollout_mode","effective_rollout_mode","mode",
"reason","real_context_window_tokens","declared_context_window_tokens","resolved_context_window_tokens",
"context_window_source","output_reserve_tokens","transport_margin_tokens","available_input_tokens",
"compression_threshold_tokens","output_reserve_override_tokens","output_reserve_override_source",
"transport_margin_override_tokens","transport_margin_override_source","canary_selected","canary_percent",
"canary_hash_strategy"];
const missing=base.filter(k=>!wl.has(k));
console.log("declared base literal keys:",base.length);
console.log("of those NOT in whitelist:",missing.length, missing);'
cd /Users/red/Desktop/GITRepo/PuPu && grep -n "_memory_v2_merge_diagnostics" unchain_runtime/server/unchain_adapter.py
```
**内容 · 第一项（对照结果，输出原文）**：
```
declared base literal keys: 21
of those NOT in whitelist: 7 [
  'declared_context_window_tokens', 'resolved_context_window_tokens', 'context_window_source',
  'output_reserve_override_tokens', 'output_reserve_override_source',
  'transport_margin_override_tokens', 'transport_margin_override_source' ]
```
`diagnostics()` 的结构为：**21 个写死的键，随后 `**latest`（`update_diagnostics` 写入的开放袋）与 `**trace_refs`**。**即产端存在一份事实上的顶层键声明（21 键字面量），而其中 7 个在收端被丢弃。**

**内容 · 第二项（单一漏斗）**：`_memory_v2_merge_diagnostics`（`:271-281`）是 read-modify-write（`merged = dict(current); merged.update(copy.deepcopy(values)); admission.update_diagnostics(merged)`），**在 `unchain_adapter.py` 内有 8 个调用点**：`:449` `:572` `:953` `:1146` `:7456` `:7465` `:8409` `:8558`（含本案三处 `mark_*_partial` 中的全部）。**该函数不对键名作任何校验。**

**支持/反驳**：**支持** 本条 `不成立 (i)` 与 ARCH-1 / ARCH-2 / ARCH-3 / ARCH-7；**收窄** `0000-0002-2026-0807#S-0020` 必要条件 2（「产端没有被声明过形状」→ 产端有一份 21 键的事实声明，缺的是与收端的对账）；**支持** `0000-0002-2026-0807#E-0068` 所述的开放写入语义（`**latest` 即那个袋）。
**完整性限制**：
1. **字面量抓取，与 `#E-0069` 同一失败类** —— 以变量或动态构造出现的键会被漏掉，**故 21 与 7 均为下界；8 个调用点亦为下界。**
2. **本条 *不* 主张那 7 个键有任何用户可见后果，也不主张它们应当被加进表。** 本条主张的是 **两侧键集从未被对照过**，该主张不依赖这 7 个键的重要性。
3. **本条未核实这 7 个键是否在别处以别名到达收端**，亦未核实 `**latest` / `**trace_refs` 实际携带的键的全集（后者即 `#E-0069` 的 45 键下界所指）。
4. **越界读**：`unchain_runtime/**` 属 `code-owner-runtime`，标参考；**本条对其取舍不表态。**

---

### E-0193 · `schema_version` 被产出、被收下、被投到 UI，而无任何消费者据它校验或分支；同一仓对 runtime events v4 载荷 *有* 这道校验
**证据类型**：`自证类`
**定位**：`unchain_runtime/server/memory_v2_context.py:86`（`_CONTEXT_SCHEMA = "memory_v2.context.v1"`）· `:548`（写入 `diagnostics()` 基字面量首项）· `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:10`（白名单第 1 项）· `:377`（`schemaVersion: normalizedText(safe.schema_version, 120)`）· `src/SERVICEs/runtime_events/event_store.js:69`。
**取得方式**：
```bash
cd /Users/red/Desktop/GITRepo/PuPu && grep -rn "schema_version" src electron --include="*.js" | grep -v test
```
**内容**：`memory_v2` 载荷的 `schema_version` 在收端的全部足迹为 **两处**：白名单第 1 项（准入）与 `presenter:377`（投成 `schemaVersion` 字符串给 UI）。**无任何一处据它作校验、分支、拒绝或迁移。**
**对照（同一次 grep 的另一命中）**：
```js
// src/SERVICEs/runtime_events/event_store.js:69
if (event.schema_version !== "v4") {   // ← 同一代码库对 runtime events 载荷 *有* 版本门
```
**据此成立**：本仓 **具备** 按 `schema_version` 设门的成文做法，而 `memory_v2` 载荷 **没有使用它** —— 其版本号是一个不承载任何判定的标签。
**支持/反驳**：支持 ARCH-5 与专业理由四之(4)（版本号是缺失制品的占位符，不是制品）。
**完整性限制**：`grep` 为字面量抓取；**未穷举是否存在以变量名读取该键的消费者**（目视全部命中，未见此类）。产端侧未核实该常量是否有第二个写入者。

---

### E-0194 · 消费者拓扑复核：一个导出函数同时是渲染门与写入门
**证据类型**：`自证类`
**取得方式**：
```bash
cd /Users/red/Desktop/GITRepo/PuPu && grep -rn "sanitizeMemoryV2TraceBundle\|presentMemoryV2Audit\|isMemoryV2TraceBundle" src electron --include="*.js" | grep -v test
```
**内容**：非测试命中 **恰好 4 个 import 点** —— `chat_bubble.js:10` · `character_chat_bubble.js:10` · `trace_chain.js:28`（**三个渲染消费者**，全在 `code-owner-chat-bubble`）· `chat_storage_sanitize.js:21` / 调用于 `:739`（**唯一非渲染消费者**）。另：`memory_v2_trace_presenter.js:351` 内 `presentMemoryV2Audit` **自己先调 `sanitizeMemoryV2TraceBundle`**；`:414-415` `isMemoryV2TraceBundle` 亦以其返回值定义。
**据此成立**：`0000-0002-2026-0807#S-0020` 必要条件 6 所述「唯一非渲染消费者是 `chat_storage_sanitize.js:739`」**复核成立**；且其真实机制是 **同一个导出函数被渲染路径与写入路径各调一次**（`code-owner-shared-arteries` S-0004 已补出这一层，本领域独立确认其补充准确）。**故必要条件 6 的不可逆性不建立在「顶层是唯一入口」上，不受 E-0078 影响。**
**支持/反驳**：支持 `0000-0002-2026-0807#S-0020` 必要条件 6 的时效性与其经 S-0004 修正后的理由；支持本条专业理由二之(2)。独立复现本案 E-0004。
**完整性限制**：字面量 `grep`；**未排除以动态 import 或再导出方式使用该模块的路径**。

---

### E-0195 · 跨仓词汇出处计数：形状 P 的三个键在 unchain 侧同样零出现
**证据类型**：`自证类`
**取得方式**：
```bash
cd /Users/red/Desktop/GITRepo/unchain && git rev-parse --short HEAD    # → a4e69f4
for k in unchain_context_status unchain_shadow_status journal_status persistence_degraded \
         persistence_error_code persistence_boundary context_build_status; do
  printf "%-28s %s\n" "$k" "$(grep -rn "$k" src --include='*.py' | grep -v test | wc -l | tr -d ' ')"
done
```
**内容（输出原文）**：
```
unchain_context_status       0      journal_status           0
unchain_shadow_status        0      persistence_degraded     0
                                    persistence_error_code   0
persistence_boundary         1      context_build_status     2
```
**据此成立**：**形状 A 与形状 P 在「词汇出处」这一维完全相同 —— 两者都是 PuPu 自造。** `persistence_boundary` 的唯一命中为子串（`durability.py` 内的错误码字面量），非键名 —— 与 `expert-llm` S-0032 不确定性四所作的精度更正一致。
**支持/反驳**：**独立确认** `code-owner-unchain` E-0126（经 S-0032 精度更正后的结论）与 `code-owner-unchain` 约束 1；**支持** `expert-llm` 在 S-0032 对其「值域来自上游 typed 枚举」判据的撤回；**支持** ARCH-4。
**完整性限制**：字面量 `grep`，负向主张，与 `#E-0069` 同一失败类 —— **以变量、别名或动态构造出现的名字会被漏掉，故「0」为「未发现」而非「证明不存在」。** 仅覆盖 `src/` 非测试路径。

---

### E-0196 · `sanitizeMemoryV2TraceBundle` 不在持久化边界上：持久化边界零过滤，sanitize 的全部调用点在 store mutator
**证据类型**：`自证类`
**定位与取得方式**（逐段可复跑）：
```bash
cd /Users/red/Desktop/GITRepo/PuPu
sed -n '265,271p' src/SERVICEs/chat_storage/chat_storage_backend.js
grep -rn "CHAT_STORAGE.WRITE" electron/preload/bridges/chat_storage_bridge.js electron/preload/channels.js
sed -n '73,81p'  electron/main/services/chat_storage/register_handlers.js
sed -n '537,542p' electron/main/services/chat_storage/service.js
grep -rn "sanitizeMessages\|sanitizeMessage(" src electron --include="*.js" | grep -v "\.test\."
```
**内容 · 第一项（持久化边界的完整链路，逐段原文）**：
```js
// src/SERVICEs/chat_storage/chat_storage_backend.js:265-270
const persist = (store) => {
  if (ipcApi) { ipcApi.write(store); return; }        // ← 常规持久化路径
  writeLegacyToLocalStorage(store);
};
// electron/preload/bridges/chat_storage_bridge.js:29
const response = ipcRenderer.sendSync(CHANNELS.CHAT_STORAGE.WRITE, payload);
// electron/main/services/chat_storage/register_handlers.js:73-75
ipcMain.on(CHANNELS.CHAT_STORAGE.WRITE, (event, payload) => { chatStorageService.write(payload); ... });
// electron/main/services/chat_storage/service.js:537-541
// Legacy-compat entry point for the renderer localStorage→IPC migration
// path (WRITE channel): whole-store import.
const write = (store) => { applyOps([{ type: "import_store", store }]); };
```
**即：常规持久化调用最终执行的是 `import_store` 整库导入操作，该边界不施加任何脱敏或键面过滤。** `service.js:521` 是 `import_store` 的第二个调用点（legacy `chats.json` 迁移，即 `expert-qa` E-0160 所指的那一条）。

**内容 · 第二项（sanitize 的全部非测试调用点）**：
```
src/SERVICEs/chat_storage/chat_storage_sanitize.js:752  export const sanitizeMessages = ...   (定义)
src/SERVICEs/chat_storage/chat_storage_sanitize.js:759  内部调 sanitizeMessage
src/SERVICEs/chat_storage/chat_storage_sanitize.js:808  sanitizeChat 内部调用
src/SERVICEs/chat_storage/chat_storage_store.js:247 · :1191 · :1466 · :1626 · :2140   ← 全部 5 个外部调用点
```
**5 个外部调用点全部在 `chat_storage_store.js` 的 store mutator 内，没有一处在 `persist` / IPC / 主进程写入路径上。**

**据此成立**：**`sanitizeMemoryV2TraceBundle` 不是一道持久化门，而是 5 个 store mutator 调用点上的一次过滤，这 5 处恰好位于 `persist` 的上游。** 故 `TOP_LEVEL_KEYS` 描述的是「那 5 个调用点放行了什么」，**不是「`chats.db` 里有什么」**。
**支持/反驳**：**收窄**（不推翻）本案与 `case.md` / `FRAMING` / `expert-security` E-0051 反复援用的表述「59 项表是通往 `chats.db` 整条路径上唯一的顶层键过滤器」；**支持** ARCH-6 (ii) 与专业理由二之(3)、三之(3)、九之(1)；**与 `expert-qa` E-0160（在审）同向且为其提供第二条、且是常规路径的实例。**
**完整性限制**（本条最重要的部分，请勿略去）：
1. **本条 *不* 主张存在一条把未脱敏 memory_v2 bundle 写进 `chats.db` 的活通路。** 到达 `persist` 的 store 对象通常已由上游 mutator 脱敏过。**「是否存在任何一个 store 对象不经那 5 个 mutator 而到达 `persist`」本领域未核实**，见不确定性二之 1。**未核实即不主张。**
2. **`applyImportStore` → 裸 `INSERT` 那一段本领域未独立复核**，援引 `expert-qa` E-0160（**在审**）。**若 E-0160 被判不利，本条收窄为「持久化边界的最后一段未核实」，第二项（5 个调用点全在 mutator）不受影响。**
3. **本条 *不* 削弱 `expert-security` 的 `不成立`。** 放开那 5 个 mutator 的顶层准入仍然是结构性回退，其后确无第二道防线。**「表的管辖面比以为的小」与「表不重要」是两句相反的话。**
4. **字面量 `grep`**，与 `#E-0069` 同一失败类；**5 个调用点为下界。**
5. **越界读**：`electron/main/services/chat_storage/**` 与 `electron/preload/bridges/**` 属 `code-owner-electron`（**本案未传唤**），`src/SERVICEs/chat_storage/**` 属 `code-owner-shared-arteries`。**标参考，本条对二者的改法不表态，且不请求本案处置。**

### E-0210 | repository | 自证类
- **来源定位**: **时效性复核 —— 本条全部证据的锚点与本案已归档证据一致（第六次独立复核）。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  git rev-parse --short HEAD                                        → b2385d5d
  git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l  → 0
  ```
- **内容**: PuPu HEAD `b2385d5d`，三个产品目录 **零 dirty**。E-0001 / E-0190 等历次复核所载的 PuPu 侧锚点在本领域观察时点仍然成立。
- **支持/反驳**: 支持本条全部证据的时效性。
- **完整性限制**: **未复核 unchain 侧 revision**（本条全部证据均不涉及 unchain 仓）。

### E-0211 | repository | 自证类
- **来源定位**: **`replaceMessages` 三个调用点的分支归属，与 `E-0020` 所述相反。** `pupu:electron/main/services/chat_storage/service.js`
  - `:280` —— `const replaceMessages = (chatId, messages) => {`（定义）
  - `:311-314` —— `const applyPutMessages = (op) => { if (!op.chatId) throw new Error("put_messages: missing chatId"); replaceMessages(op.chatId, op.messages); };`
  - `:334-388` —— `const applyImportStore = (op) => { ... for (const [chatId, chat] of Object.entries(chatsById)) { const { messages, ...metaOnly } = chat || {}; ...; upsertChatMeta(chatId, metaOnly); replaceMessages(chatId, messages); } };` —— **调用点在 `:386`**
  - `:390-396` —— op type 到 applier 的注册表：
    ```js
    const OP_APPLIERS = {
      put_tree_meta: applyPutTreeMeta,      // :391
      put_chat_meta: applyPutChatMeta,      // :392
      put_messages: applyPutMessages,       // :393
      delete_chats: applyDeleteChats,       // :394
      import_store: applyImportStore,       // :395
    };
    ```
  - **即：`:313` 属 `put_messages`，`:386` 属 `import_store`。**
- **取得方式**:
  ```
  grep -rn "replaceMessages" electron/ src/          # -> 3 处，全在 service.js（:280 :313 :386）
  sed -n '280,289p;311,314p;334,340p;379,396p' electron/main/services/chat_storage/service.js
  ```
- **支持/反驳**: **反驳** `E-0020` **来源定位** 第二项「同文件 `:313` —— `import_store` 分支调 `replaceMessages`」（见 OBJECTION-A）；**不反驳** `E-0020` 的任何其他内容。**支持** 本条 建议处置 一·问 2。
- **完整性限制**: 只覆盖 `replaceMessages` 这一个标识符。**未穷举** 是否另有直接执行 `INSERT INTO messages` 而不经该函数的代码 —— 见 E-0213 对该点的独立检索。

### E-0212 | repository | 自证类
- **来源定位**: **`messages` 表的四个写入入口，完整枚举。**
  - **入口 1 · `CHAT_STORAGE.APPLY_OPS`**（`ipcMain.handle`，异步 invoke）—— `register_handlers.js:65-67` → `applyOpsWithAck` `:55-63` → `chatStorageService.applyOps(ops)` → `service.js:398-438 applyOps` → `OP_APPLIERS[op.type]`
  - **入口 2 · `CHAT_STORAGE.APPLY_OPS_SYNC`**（`ipcMain.on`，`sendSync`）—— `register_handlers.js:69-71` → 同上
  - **入口 3 · `CHAT_STORAGE.WRITE`**（`ipcMain.on`，`sendSync`）—— `register_handlers.js:73-82` → `chatStorageService.write(payload)` → `service.js:540-542 const write = (store) => { applyOps([{ type: "import_store", store }]); };`
  - **入口 4 · 主进程内部**，无 IPC —— `service.js:525-536 init()` → `:535 migrateLegacyFileIfNeeded()` → `:521 applyOps([{ type: "import_store", store }])`
  - **preload 侧对应**：`electron/preload/bridges/chat_storage_bridge.js` 暴露 `{ bootstrap, write, readMessages, applyOps, applyOpsSync }`；`applyOps` 用 `ipcRenderer.invoke`，`write` / `applyOpsSync` / `bootstrap` / `readMessages` 用 `ipcRenderer.sendSync`
  - **channel 常量**：`electron/shared/channels.js:29-35` `CHAT_STORAGE = { BOOTSTRAP_READ, READ_MESSAGES, APPLY_OPS, APPLY_OPS_SYNC, WRITE }`
  - **四者全部汇入 `service.js:280 replaceMessages`。**
- **取得方式**:
  ```
  cat electron/main/services/chat_storage/register_handlers.js
  cat electron/preload/bridges/chat_storage_bridge.js
  sed -n '29,35p' electron/shared/channels.js
  sed -n '398,438p;488,542p' electron/main/services/chat_storage/service.js
  ```
- **支持/反驳**: **扩大** `E-0020` / `E-0160` / `E-0196` 所述拓扑的射程（三者各指认一个入口，实际为四个）；**支持** OBJECTION-A 与 OBJECTION-B 的 受影响事项。
- **完整性限制**: 1. **只枚举 `electron/main/services/chat_storage/` 内的写入者。** 未排除其他主进程 service 直接持有 db 句柄写 `messages` 表的可能（`db.js` 的 `createChatDb` 导出面本条未审）。2. **未跑运行时**，四个入口的实际调用频率为按代码结构的推断，非观测。

### E-0213 | repository | 自证类
- **来源定位**: **`INSERT INTO messages` 全域唯一，且写入无任何字段过滤；主进程不 import 脱敏器。**
  - `service.js:280-289`：
    ```js
    const replaceMessages = (chatId, messages) => {
      requireDb().prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
      const insert = requireDb().prepare(
        "INSERT INTO messages(chat_id, ord, payload) VALUES (?, ?, ?)",
      );
      const list = Array.isArray(messages) ? messages : [];
      for (let ord = 0; ord < list.length; ord += 1) {
        insert.run(chatId, ord, toJson(list[ord]));
      }
    };
    ```
  - `service.js:65` —— `const toJson = (value) => JSON.stringify(value === undefined ? null : value);`
  - `service.js:283` 是 `electron/main/services/chat_storage/*.js` 中 **唯一** 的 `INSERT INTO messages`
  - `service.js:442-449 readMessages` —— `SELECT payload ... ORDER BY ord ASC` → `rows.map((row) => JSON.parse(row.payload))`，**读回原样，无过滤**
  - **关键否定事实**：`grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle\|sanitizeMessages\|sanitizeMessage(" electron/` → **0 命中**
- **取得方式**:
  ```
  grep -rn "INSERT INTO messages\|REPLACE INTO messages" electron/
  grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle" electron/ | wc -l   # -> 0
  grep -rn "sanitizeMessages\|sanitizeMessage(" electron/ | wc -l                                              # -> 0
  sed -n '65p;280,289p;442,449p' electron/main/services/chat_storage/service.js
  ```
- **支持/反驳**: **独立复核并支持** `E-0020` 的核心结论与 `E-0160` 的全部引文（后者的 `:280-289` 引文与 `:283` 唯一性主张逐字属实）；**代为补上** `E-0196` 完整性限制 2 所声明的未复核段。
- **完整性限制**: 1. **字面量检索**，以变量或动态构造的 SQL 语句会被漏掉。2. **未审 `db.js`** 是否对外暴露可绕过 `replaceMessages` 的写入面。

### E-0214 | repository | 自证类
- **来源定位**: **四个入口的校验不对称：导入路径校验最多，活的增量路径校验最少；两者均不打开消息对象。**
  - **`assertRecognizableLegacyChatStore`（`:112-160`）** —— 校验 store 信封（`isPlainObject(store)`、`schemaVersion ∈ {1,2}`、`Number.isFinite(store.updatedAt)`、`isPlainObject(store.chatsById)`、`chatEntries.length > 0`）· 逐个 chat（`isValidChatId(chatId)`、`isPlainObject(chat)`、`chat.id === chatId`、`Array.isArray(chat.messages)`）· `activeChatId` 为 string 且落在 `chatsById` 内 · `schemaVersion === 1` 时 `Array.isArray(store.chatOrder)`。**全程不访问 `chat.messages` 的任何元素。**
  - **`applyPutMessages`（`:311-314`）** —— 全文仅 `if (!op.chatId) throw new Error("put_messages: missing chatId"); replaceMessages(op.chatId, op.messages);`。**无 id 契约校验、无数组校验（退化到 `replaceMessages:285` 的 `Array.isArray(messages) ? messages : []`）、无任何形状约束。**
  - **`normalizeWriteBatch`（`:68-94`）** —— 只校验批次信封与 write guard（`Array.isArray(payload.ops)`、`ops.length > 0`、`epoch` 为 ≤128 字符且无首尾空白的非空 string、`Number.isSafeInteger(sequence) && sequence > 0`）。**不看任何 op 的内容。**
  - **无消息载荷级迁移机械**：`SCHEMA_VERSION = 3`（`:15`）仅在 `:300` `:372` 写入 meta、`:474-477` 作 bootstrap 默认值；唯一的版本分支是 `:377` `store.schemaVersion === 1 ? buildLegacyV1Tree(store) : store.tree`（**tree 构造，非消息载荷**）。`grep -rn "migrat" electron/main/services/chat_storage/*.js` 的全部命中均指 legacy **文件** 迁移（`MIGRATED_SUFFIX` `:14` · `migrateLegacyFileIfNeeded` `:494` `:535` · 三处注释）。
- **取得方式**:
  ```
  sed -n '14,15p;65,94p;104,160p;311,314p;296,302p;370,378p;472,478p' electron/main/services/chat_storage/service.js
  grep -n "SCHEMA_VERSION\|schemaVersion" electron/main/services/chat_storage/service.js
  grep -rn "migrat" electron/main/services/chat_storage/*.js | grep -v "\.test\."
  ```
- **支持/反驳**: **关闭 `E-0020` 完整性限制 3**（「`assertRecognizableLegacyChatStore` 做了什么校验，本条未展开 —— 它可能包含本条未知的形状约束」）：**不存在任何消息级形状约束**。**支持** 本条 乙 的表态与建议处置 一·问 3。
- **完整性限制**: 1. **未审 `isValidChatId` 与 `buildLegacyV1Tree` 的实现**（二者与消息载荷无关）。2. 「校验最少」是对这四条路径之间的比较，**不是对全仓的全称主张**。

### E-0215 | repository | 自证类
- **来源定位**: **Electron 构建下的常规消息写入路径是 `put_messages`，不是 `persist()` / `import_store`。**（越界只读：`src/SERVICEs/chat_storage/**` 属 `code-owner-shared-arteries`）
  - `chat_storage_store.js:862-895 writeStore` —— `:867 if (hasIpcBackend()) { ... :871 queueOpsForWrite(prevStore, store, declared); :872 schedulePersistAndEmit(...); :877 return store; }`。**IPC 分支在 `:877` 返回，`:884 storageBackend.persist(store)` 位于该 `if` 之后，只在 `!hasIpcBackend()` 时到达**（`:880-881` 原注释：「jsdom / 纯 web fallback」）
  - `chat_storage_store.js:839-847 queueOpsForWrite` —— `pending.messagesByChatId.set(chatId, Array.isArray(chat.messages) ? chat.messages : [])`，取自 `nextStore.chatsById?.[chatId]`
  - `chat_storage_store.js:604-632 enqueuePendingOpsBatch` —— `:617-618 for (const [chatId, messages] of messagesByChatId) { ops.push({ type: "put_messages", chatId, messages }); }`
  - **`persist` 的全部三个调用点**：`:265`（在 `:260 if (!hasIpcBackend()) {` 块内）· `:283`（IPC 分支内，但位于 `:280 if (!bootstrap) {` 内 —— **空库 seeding**）· `:884`（非 IPC 分支）
  - `chat_storage_backend.js:266-271 persist` —— `if (ipcApi) { ipcApi.write(store); return; } writeLegacyToLocalStorage(store);`；`:288-289` 原注释：「v3 ops protocol: commit-acknowledged incremental writes. **No-op in the fallback build — persist() keeps writing the whole store there.**」
- **取得方式**:
  ```
  sed -n '252,286p;604,632p;820,858p;862,896p' src/SERVICEs/chat_storage/chat_storage_store.js
  sed -n '264,272p;286,312p' src/SERVICEs/chat_storage/chat_storage_backend.js
  grep -n "storageBackend.persist" src/SERVICEs/chat_storage/chat_storage_store.js   # -> :265 :283 :884
  grep -rn "put_messages\|import_store" src/ --include="*.js" | grep -v "\.test\."
  ```
- **支持/反驳**: **反驳** `E-0196` **内容 · 第一项** 中「常规持久化路径」这一定性与由其得出的「常规持久化调用最终执行的是 `import_store`」（见 OBJECTION-B）；**不反驳** `E-0196` 的第二项与核心结论。**反驳** `S-0053` 第一节「后者是常规路径不是导入路径」。**支持** 本条 建议处置 二 的第三条实例。
- **完整性限制**: 1. **越界只读**，`src/SERVICEs/chat_storage/**` 属 `code-owner-shared-arteries`；**本条只出分支归属这一机械事实，对其改法一律不表态。** 2. **依据静态分支结构，未在运行时观测 `hasIpcBackend()` 在打包应用中的返回值。** 若存在某种使其为假的 Electron 运行形态，`persist` 在该形态下即为常规路径 —— **该情形只增加未过滤入口，不减少**。3. **未追 `schedulePersistAndEmit` 内部是否另有 `persist` 调用**（`grep` 的三个 `storageBackend.persist` 命中已穷举该标识符）。

### E-0216 | repository | 自证类
- **来源定位**: **本案四个键在 `electron/**` 出现 0 次。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  grep -rn "unchain_context_status\|unchain_context_error_code\|unchain_shadow_status\|unchain_shadow_error_code" electron/ | wc -l
    # -> 0   （含 electron/tests/**）
  ```
- **内容**: 四个键在整个 `electron/` 目录（生产代码与测试）**零出现**。IPC channel 常量、preload bridge、SSE relay、信封结构均不引用。
- **支持/反驳**: **支持** 本条对 甲 的表态第 1 项（本边界对四个键零依赖、零假设，改名在 `electron/` 产生零 diff）；**支持** 结论段「本次丢弃不经过我这里」。
- **完整性限制**: **字面量检索**，以变量、模板串或动态拼接构造的键名一律漏掉。准确措辞为 **「在字面量检索范围内为零」**。

### E-0217 | repository | 自证类
- **来源定位**: **本边界的状态词汇现状：`"partial"` / `"legacy"` 零出现，`"unavailable"` 在三个互不相关的子系统中各有一种含义。**
  - `grep '"partial"\|'"'"'partial'"'"'\|"legacy"\|'"'"'legacy'"'"'' electron/ --include="*.js" | grep -v "/tests/"` → **0 命中**
  - `"unavailable"` 落在三个文件：`electron/main/services/settings_storage/service.js:161`（`UNAVAILABLE: "unavailable"`，密钥存储子系统可用性；`:683` `:706` `:725` 注释说明其语义为"探测失败前的默认态"）· `electron/main/services/memory_vault/service.js:145`（`UNAVAILABLE: "unavailable"`）· `electron/main/services/unchain/service.js:3313` `:3339` `:3358` `:3377` `:3423`（catalog / registry 查询的降级返回值）
  - 另：`electron/main/services/unchain/memory_v2_rollout.js` 自有一套 mode 词汇（`:51-55 normalizeMode`，`"active" → "all"`，fallback `"off"`），**与上述三者、与本案四个键均不共享词表**
- **取得方式**:
  ```
  grep -rn '"partial"\|'"'"'partial'"'"'\|"legacy"\|'"'"'legacy'"'"'' electron/ --include="*.js" | grep -v "/tests/"
  grep -rln '"unavailable"' electron/ --include="*.js" | grep -v "/tests/"
  sed -n '159,163p' electron/main/services/settings_storage/service.js
  sed -n '143,147p' electron/main/services/memory_vault/service.js
  sed -n '51,56p' electron/main/services/unchain/memory_v2_rollout.js
  ```
- **支持/反驳**: **支持** 本条对 甲 的观察第 4 项（裸状态串在本仓已是被重载的词汇空间）。**不支持也不反驳** 甲 的任何一边 —— 本条只证明"同一个裸词在本边界已承载三种互不相关的含义"，不主张任何词表选择。
- **完整性限制**: 1. **字面量检索**，同 E-0216 的失败类。2. **三处 `"unavailable"` 的语义差异是我读其定义上下文后的归类，属判断不属观察**；任何角色可按同一批 `file:line` 独立复核并给出不同归类。**本条的支持项不依赖该归类成立** —— 仅"同一裸词出现在三个互不引用的子系统中"这一点即足够。

### E-0218 | repository | 自证类
- **来源定位**: **主进程 SSE relay 全透明：不过滤事件名，不过滤键。** `pupu:electron/main/services/unchain/service.js`
  - `:5007-5029 parseSseBlock` —— 只识别 `event:` 与 `data:` 两个前缀，`event:` 缺失时 `eventName = "message"`；其余行（含 `:` 开头的注释行）跳过
  - `:5031-5045 parseSsePayload` —— `JSON.parse(dataText)` **整体解析**，无键投影、无键过滤
  - `:5086-5095` —— `if (block.trim().length > 0) { const parsedBlock = parseSseBlock(block); const parsedPayload = parseSsePayload(parsedBlock.dataText); const payload = parsedPayload.payload; emitMisoStreamEvent(webContentsId, requestId, parsedBlock.eventName, payload); }` —— **对每一个解析出的 block 无条件调用，不看 `eventName`**
  - `:5097-5105` —— 事件名只用于 **判断是否终止读取循环**（`done` / `error` / `frame` 且 `payload.type ∈ {done,error}`），**不用于是否转发**
  - `:5118-5138` —— 上游未以 `\n\n` 收尾时的尾块恢复，同样无条件 `emitMisoStreamEvent`
  - `:4310-4330 emitMisoStreamEvent` → `:4320 const envelope = { requestId, event, data, streamSeq }` → `:4355-4366 sendMisoStreamEnvelope` → `:4361 target.send(CHANNELS.UNCHAIN.STREAM_EVENT, envelope)` —— **`data` 即 `payload` 原对象**
- **取得方式**:
  ```
  sed -n '4271,4275p;4310,4330p;4355,4366p;5007,5045p;5080,5139p' electron/main/services/unchain/service.js
  grep -n "isTerminalMisoStreamEvent\|eventName" electron/main/services/unchain/service.js
  ```
- **支持/反驳**: **支持** 本条 受影响对象 一（四个键在主进程 relay 段未被碰过）与 四·2（未知事件名一定到达 preload）。
- **完整性限制**: 1. **未跑运行时**，未抓一条真实 SSE。2. **只覆盖 `service.js` 内的 SSE 读取循环**；未审 replay buffer（`:4321-4324 trimMisoStreamReplay`）在超限裁剪时是否会丢帧 —— **该路径本条未追，与本案四个键无关但与"静默丢弃"同类，登记备查**。

### E-0219 | repository | 自证类
- **来源定位**: **preload 信封门有三道，不是一道；三道全部是闭集事件名 + 无 `else` / 无 `default` / 无计数。** `pupu:electron/preload/stream/unchain_stream_client.js`
  - **门一 · `registerMisoStreamListener`（`:20-57`）** —— 闭集 `{meta, token, done, error}`（`:29` `:34` `:40` `:48`）。`:48-56` 的 `if (eventName === "error")` 块结束后 **直接是 `:57` 的 `};`**
  - **门二 · `registerMisoStreamV2Listener`（`:68-150`）** —— 外层闭集 `{frame, error, done}`（`:77` `:126` `:137`）；`frame` 内层再按 `data.type` 分派 `{stream_started, token_delta, done, error}`（`:85` `:96` `:104` `:112`），**内层未命中在 `:123` `return`**（内层之前 `:81-83` 已把整个 `data` 交给 `handlers.onFrame`，故内层未命中不等于丢失）。`:137-149` 的 `done` 块结束后 **直接是 `:150` 的 `};`**
  - **门三 · `registerRuntimeEventStreamListener`（`:161-236`）** —— 闭集 `{runtime_event, error, done}`（`:195` `:207` `:218`）。`:218-230` 的 `done` 块结束后 **直接是 `:231` 的 `};`**。**这一道即 `0000-0002-2026-0807#E-0072` 所记的 `:195-230`。** `:238-242 registerMisoStreamV4Listener` 是它的别名
  - **三道门中无一处存在 `else` 分支、`default` 分支、日志、计数或诊断写入。**
- **取得方式**:
  ```
  sed -n '20,57p;68,150p;161,242p' electron/preload/stream/unchain_stream_client.js
  grep -n "eventName ===\|else\|default:" electron/preload/stream/unchain_stream_client.js
  ```
- **支持/反驳**: **支持并扩大** `0000-0002-2026-0807#E-0072` 第六项与 `#S-0020` 必要条件 4（前案记一道，实为三道）；**支持** 本条 约束 3 与 四。
- **完整性限制**: 1. **「三道」是下界** —— 字面量检索，以变量或常量引用比较事件名的分派会被漏掉。2. **未跑运行时**，未构造一次未知事件名并观测其消失。3. **未追** 三个监听器各自的注册者与今天的实际使用比例 —— 本条只主张三者同时存在于该 revision，不主张三者都活跃。

### E-0220 | repository | 自证类
- **来源定位**: **preload V4 路径对 `runtime_event` 的载荷零键投影。** `pupu:electron/preload/stream/unchain_stream_client.js:192-205`
  ```js
  const eventName = envelope.event;          // :192
  const data = envelope.data || {};          // :193
  if (eventName === "runtime_event") {       // :195
    if (typeof handlers.onRuntimeEvent === "function") {
      const streamSeq = Number(envelope.streamSeq || 0);
      if (streamSeq > 0) {
        handlers.onRuntimeEvent(data, { streamSeq });   // :199
      } else {
        handlers.onRuntimeEvent(data);                  // :201
      }
    }
    return;
  }
  ```
  —— **整个 `data` 对象原样交出，无任何字段挑选、改写或裁剪。**
- **取得方式**: `sed -n '183,236p' electron/preload/stream/unchain_stream_client.js`
- **支持/反驳**: **支持** 本条 结论段与 四·3（本次四键丢弃与 preload 信封门无交集 —— 信封门丢的是整帧，不是帧内的键）。
- **完整性限制**: 只覆盖 V4 监听器的 `runtime_event` 分支。**门二的 `frame` 分支同样有 `:81-83 handlers.onFrame(data)` 的整体透传**，但其 `stream_started` 分支（`:85-94`）确实做了字段重组（`{ thread_id, model, ...payload }`）—— **该处不是本案路径，本条不展开**。

### E-0221 | repository | 自证类
- **来源定位**: **两个测试运行器覆盖面不同，且只有一个在 CI 上跑 electron 测试。**
  - `package.json` scripts：
    - `"test": "react-scripts test"` —— `package.json` 的 `jest` 键为 **空对象 `{}`**，即使用 CRA 默认 `testMatch`（限于 `<rootDir>/src/**`）
    - `"test:frontend": "react-scripts test --watchAll=false"`
    - `"test:electron": "node node_modules/.bin/jest --env=node --runInBand --silent --moduleFileExtensions js --moduleFileExtensions cjs --moduleFileExtensions json --testMatch=\"**/electron/tests/**/*.test.cjs\""`
  - **计数**：`electron/tests/**/*.test.cjs` = **45** · `electron/tests/**/*.test.js` = **44** · `src/electron/tests/**/*.test.js` = **36**
  - **`.js` stub 的形态**（例）：`electron/tests/preload/chat_storage_bridge.test.js`（43 字节）全文为 `require("./chat_storage_bridge.test.cjs");`；`src/electron/tests/main/boot_readiness_service.test.js` 全文为 `require("../../../../electron/tests/main/boot_readiness_service.test.cjs");`
  - **CI**：`.github/workflows/release-qa.yml:99 run: npm run test:electron`（步骤 id `electron`）；`:148-155` 把每一步合成具名结果行（含 `{"name":"electron tests","command":"npm run test:electron",...}`）；**触发条件 `:3-10`：`pull_request` → `dev` / `main`，`push` → tag `v*`，加 `workflow_dispatch`**
- **取得方式**:
  ```
  python3 -c "import json;p=json.load(open('package.json'));print(p['scripts']['test'],'|',p['scripts']['test:electron']);print('jest key =',p.get('jest'))"
  find electron/tests -name "*.test.cjs" | wc -l ; find electron/tests -name "*.test.js" | wc -l ; find src/electron -name "*.test.js" | wc -l
  cat electron/tests/preload/chat_storage_bridge.test.js
  sed -n '1,12p;90,102p;145,158p' .github/workflows/release-qa.yml
  ```
- **支持/反驳**: **支持** 本条 丙 的四问答案（谁读它 / 在哪展示 / 何时告警 / 哪条变红）与 约束 4。
- **完整性限制**: 1. **未实际运行任何一个 runner** —— 覆盖面结论由 `testMatch` 与文件位置推导，非观测。2. **未核实 CRA 默认 `testMatch` 的具体取值**（依据是 `jest` 键为空即用默认值这一事实 + `src/electron/tests/**` 这批 stub 存在的目的）。**若 CRA 默认值实际覆盖 `<rootDir>` 而非 `<rootDir>/src`，则 `electron/tests/**/*.test.js` 也会被 `npm test` 拾取，本条第一项须收窄** —— **但 CI 那一项（`test:electron` 覆盖全部 45 个 `.cjs`、每 PR 触发）不受影响，丙 的四问答案不依赖第一项。**

### E-0222 | repository | 自证类
- **来源定位**: **`.js` / `.cjs` 双胞胎的当前漂移状态。**
  - **`.cjs` 本体无同名 `.js` stub（3 个）**：`electron/tests/main/unchain_service.test.cjs` · `electron/tests/main/boot_readiness_service.test.cjs` · `electron/tests/preload/unchain_stream_client.test.cjs`
  - **其中两个由 *异名* stub 覆盖**：`electron/tests/main/unchain_service_loader.test.js` → `require("./unchain_service.test.cjs")` · `electron/tests/preload/miso_stream_client.test.js` → `require("./unchain_stream_client.test.cjs")`
  - **`.cjs` 本体无 `src/electron` stub（8 个，完整枚举）**：`main/chat_storage_lifecycle.test.cjs` · `main/ollama_service.test.cjs` · `main/settings_quit_coordinator.test.cjs` · `test-api/builtin_commands.test.cjs` · `test-api/commands.test.cjs` · `test-api/integration.test.cjs` · `test-api/logs.test.cjs` · `test-api/server.test.cjs`
- **取得方式**:
  ```
  for f in $(find electron/tests -name "*.test.cjs"); do s="${f%.cjs}.js"; [ -f "$s" ] || echo "ORPHAN-CJS: $f"; done
  for f in $(find electron/tests -name "*.test.js");  do c="${f%.js}.cjs"; [ -f "$c" ] || echo "NO-CJS: $f"; done
  cat electron/tests/main/unchain_service_loader.test.js electron/tests/preload/miso_stream_client.test.js
  for f in $(find electron/tests -name "*.test.cjs"); do b=$(basename $f); grep -rl "$b" src/electron >/dev/null 2>&1 || echo "NO-SRC-STUB: $f"; done
  ```
- **支持/反驳**: **支持** 本条 五·2 与 约束 4；**限定** 丙 的处方（其失败模式是双胞胎漂移而非沉默）。
- **完整性限制**: 1. **「异名 stub」的存在使按文件名比对双胞胎这一最自然的检查方法产生假阳性** —— 本条的两批检索都受此影响，故第一批的 3 个中有 2 个实为已覆盖。**该不变量今天没有机械守卫，这正是本条要登记的东西。** 2. **未运行任何测试**，未验证这 8 个无 `src/` stub 的本体在 `npm test` 下确实不执行（依赖 E-0221 完整性限制 2 中的同一未核实项）。

### E-0223 | repository | 自证类
- **来源定位**: **持久化边界零形状断言。** `pupu:electron/tests/main/chat_storage_service.test.cjs`（908 行）
  - 标识符出现次数：`applyOps` **44** · `import_store` **28** · `put_messages` **6** · `replaceMessages` **0** · `memory_v2` **0** · `sanitiz` **0** · `INSERT INTO messages` **0**
  - `electron/tests/main/chat_storage_handlers.test.cjs`（228 行）：`put_messages` 0 · `import_store` 0
  - `electron/tests/main/chat_storage_lifecycle.test.cjs`（16 行）：全文为一条对 `main/index.js` 源码的正则断言（退出顺序），与消息载荷无关
  - `grep "memory_v2\|TOP_LEVEL\|sanitiz" electron/tests/main/chat_storage_*.cjs` → **0 命中**
- **取得方式**:
  ```
  python3 -c "
  s=open('electron/tests/main/chat_storage_service.test.cjs',encoding='utf-8').read()
  for k in ['put_messages','import_store','replaceMessages','memory_v2','sanitiz','INSERT INTO messages','applyOps']: print(k, s.count(k))"
  grep -rn "memory_v2\|TOP_LEVEL\|sanitiz" electron/tests/main/chat_storage_*.cjs
  cat electron/tests/main/chat_storage_lifecycle.test.cjs
  ```
- **支持/反驳**: **支持** 本条 五·1 与 丙 的第 2 项（能独立成立的那半条断言今天就该有）。
- **完整性限制**: 1. **只覆盖 `chat_storage_*` 三个测试文件。** 未穷举其余 42 个 `.cjs` 是否有别处的载荷断言（`grep "memory_v2" electron/` 的结果见 E-0216，命中文件中无 chat_storage 测试）。2. **计数为标识符出现次数，不等于断言条数** —— `applyOps` 的 44 次出现包含调用与断言两类，本条不据其推断覆盖质量，只据 `memory_v2` / `sanitiz` 的 **0** 推断"无载荷内容断言"。

### E-0224 | repository | 自证类
- **来源定位**: **本边界已有一处"带命名空间与版本号的 memory_v2 契约常量"的先例。** `pupu:electron/main/services/unchain/memory_v2_rollout.js`
  ```js
  const MEMORY_V2_RELEASE_SCHEMA = "pupu.memory-v2-release.v1";   // :3
  const MEMORY_V2_ROLLOUT_SCHEMA = "memory_v2.rollout.v1";        // :4
  ```
  另：`:10 MEMORY_V2_BUILD_FEATURE_KEY = "enable_memory_v2"` · `:11 MEMORY_V2_RELEASE_FIELD = "_pupu_memory_v2_release"` · `:16 rolloutMode: "PUPU_MEMORY_V2_MODE"` · `:51-55 normalizeMode`（`"active" → "all"`，fallback `"off"`）· `:245-246` 对 `release.rollout_fingerprint` / `release.snapshot_fingerprint` 的类型校验
- **取得方式**: `sed -n '1,20p;51,56p;240,250p' electron/main/services/unchain/memory_v2_rollout.js`
- **支持/反驳**: **支持** 本条对 甲 的观察第 4 项（本仓已有该形状的先例，且就在 memory_v2 上）。**不主张** 该形状适用于本案四个键 —— 那是 甲 的实体问题，不落在本边界。
- **完整性限制**: 1. **本条只证明该形状存在，不证明它有效、被消费或被校验。** `MEMORY_V2_ROLLOUT_SCHEMA` 的下游消费者本条未追。2. `memory_v2_rollout.js` 的 mode 词汇（`off` / `all` / `active`）与本案四个键、与 unchain 的 `ContextBuildStatus` **均不共享词表**，本条不主张任何三者之间的关系。

---

> **取证 revision**：PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（branch `dev`）。`git status --porcelain -- src/ electron/ unchain_runtime/` 实测 **0 行**。**观察时点 2026-08-09T04:0x–04:4x-07:00。**
>
> **本轮未起应用、未渲染 DOM、未截图、未在浏览器中目视比对、未派生任何子 instance、未改任何产品代码、未 commit。** 全部条目为对上述 revision 上文件内容的静态读取、可复跑 `git` / `grep`，或按 WCAG 2.x 相对亮度公式所作的算术。**故全部标 `自证类`。**
>
> **对比度复算方法（一次写明，下文不重复）**：`c = c₈/255`；`c_lin = c/12.92`（`c ≤ 0.04045`）否则 `((c+0.055)/1.055)^2.4`；`L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin`；`ratio = (L_亮+0.05)/(L_暗+0.05)`。半透明前景先按 `眼见值 = α·前景 + (1−α)·底色` 合成再算。底色取 `--pupu-background`（light `#ffffff` / dark `#121212`）。**与 E-0104 的抬头所载方法逐字相同，故两侧数字可直接比对。**

---

### E-0230 | repository | 自证类
- **来源定位**: 时效性锚点。本案 E-0001 / E-0090 / E-0170 的 revision 锚点在本 owner 的观察时点仍然成立，本条以下全部定位均在该 revision 上取得。
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  git rev-parse HEAD                                           # -> b2385d5dc7951887b6aeebd4001d17b4cd78af83
  git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l   # -> 0
  git branch --show-current                                    # -> dev
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持 E-0001 / E-0090 / E-0170 的时效性。
- **完整性限制**: 只核了 `src/` `electron/` `unchain_runtime/` 三个路径的洁净度，未核仓内其余路径。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0231 | repository | 自证类
- **来源定位**: **E-0171 所载 `theme.timeline` 两套取值，本 owner 作为该文件的所有者逐字复核，全部属实。**
  - `src/BUILTIN_COMPONENTs/theme/default_mini_theme.json:284-294`（`light_mode.timeline`）：`lineColor` `rgba(0,0,0,0.12)` · `lineDoneColor` `rgba(0,0,0,0.18)` · **`pointDoneColor` `rgba(0,0,0,0.22)`（`:287`）** · **`pointPendingColor` `rgba(0,0,0,0.18)`（`:288`）** · `titleColor` `#222222` · `spanColor` `rgba(0,0,0,0.45)` · `detailsBackground` `rgba(0,0,0,0.025)` · `seeDetailsColor` `rgba(0,0,0,0.35)` · `fontSize` `13px` · `titleFontSize` `14px`
  - 同文件 `:600-610`（`dark_mode.timeline`）：同键，取值为 `rgba(255,255,255,·)` 对应形式，**`pointDoneColor` `rgba(255,255,255,0.22)`（`:603`）** · **`pointPendingColor` `rgba(255,255,255,0.18)`（`:604`）** · `lineDoneColor` `rgba(255,255,255,0.15)` · `titleColor` `#CCCCCC`
  - **两块均无 `pointColor`，无任何 `danger` / `error` / `warning` 键。** E-0171 的这一句属实。
  - **唯一与 E-0171 的差异（不影响任何数字）**：E-0171 的表把 `seeDetailsColor` 列在 `detailsBackground` 之前，文件中实为 `detailsBackground` 在前（`:291` / `:607`）、`seeDetailsColor` 在后（`:292` / `:608`）。**属排版顺序，非取值差异。**
- **取得方式**:
  ```
  sed -n '280,300p' src/BUILTIN_COMPONENTs/theme/default_mini_theme.json
  sed -n '596,616p' src/BUILTIN_COMPONENTs/theme/default_mini_theme.json
  grep -rn "pointDoneColor\|pointPendingColor\|pointColor" src/
  ```
- **提交发言**: S-0052
- **支持/反驳**: **确认 E-0171 全部取值**（由该文件的所有者复核）；支持 E-0172 的输入；支持 UX-V1。
- **完整性限制**: 只核 `timeline` 两块，未核该 JSON 其余 600 余行。
- **验证历史**: S-0052 | 已验证（提交人实跑；与 E-0171、S-0046 三方独立吻合）

---

### E-0232 | repository | 自证类
- **来源定位**: **对比度独立复算 —— 与 E-0172 及 `evidence-examiner`（S-0046）逐位吻合，本 owner 为第三个独立取得同一组数字的角色。**

  | | 前景 | 合成后（8 位） | 对比度 | SC 1.4.11（3:1） |
  |---|---|---|---|---|
  | light · `done` | `rgba(0,0,0,0.22)` on `#ffffff` | `(199,199,199)` = `#C7C7C7` | **1.6922** | 不满足 |
  | light · `pending` | `rgba(0,0,0,0.18)` on `#ffffff` | `(209,209,209)` = `#D1D1D1` | **1.5255** | 不满足 |
  | dark · `done` | `rgba(255,255,255,0.22)` on `#121212` | `(70,70,70)` = `#464646` | **1.9892** | 不满足 |
  | dark · `pending` | `rgba(255,255,255,0.18)` on `#121212` | `(61,61,61)` = `#3D3D3D` | **1.7156** | 不满足 |

  **两态 8 位色差**：light `209−199 = 10/255` · dark `70−61 = 9/255`。**与 S-0046 的复核值逐位相同。**
  **顺带复算的两项**（同一公式）：`spanColor` `rgba(*,0.45)` → **3.3517**（light）/ **4.5289**（dark）；`ErrorPoint` `#ef4444` → **3.7631**（light）/ **4.9782**（dark）。**均与 E-0172 第 5 段、E-0174 末段吻合。**
- **取得方式**: 依本节抬头的公式对 E-0231 所载取值作算术。可复跑脚本（Python 3，无依赖）：
  ```python
  def lin(c8):
      c = c8/255.0
      return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
  def L(rgb): return sum(k*lin(v) for k,v in zip((0.2126,0.7152,0.0722), rgb))
  def ratio(a,b):
      la,lb = L(a),L(b); hi,lo = max(la,lb),min(la,lb)
      return (hi+0.05)/(lo+0.05)
  def over(fg,a,bg): return tuple(a*f+(1-a)*b for f,b in zip(fg,bg))
  W=(255,255,255); D=(18,18,18)
  print(ratio(over((0,0,0),0.22,W),W), ratio(over((0,0,0),0.18,W),W))
  print(ratio(over((255,255,255),0.22,D),D), ratio(over((255,255,255),0.18,D),D))
  ```
- **提交发言**: S-0052
- **支持/反驳**: **确认 E-0172 的全部数字**；**确认 S-0046 的复核值**；支持 UX-V1；支持 E-0246。
- **完整性限制**: **为计算值，非仪器测量，非浏览器目视比对。** 本 owner 与 `expert-ux`、`evidence-examiner` 三方使用的是同一个公式与同一组输入，**三方吻合证明算术无误，不证明该公式对本场景的适用性** —— 若有人以实测手段得出两态可辨，本条应让位。数字锚定在出厂默认调色板上，用户自定义 `background` 后须重算。
- **验证历史**: S-0052 | 已验证（提交人实跑上述脚本）

---

### E-0233 | repository | 自证类
- **来源定位**: **`mini_ui` 原版 `theme.timeline` 没有 `pointDoneColor` 这个键 —— 上游设计里 `done` 落的是不透明强调色，不是灰。**
  - `/Users/red/Desktop/GITRepo/mini_ui/src/BUILTIN_COMPONENTs/theme/default_mini_theme.json:328-339`（light）与 `:731-742`（dark），两块逐字为：
    ```
    "lineColor":        "rgba(0,0,0,0.12)"    /  "rgba(255,255,255,0.12)"
    "lineDoneColor":    "rgba(10,186,181,0.85)"                （两模式相同）
    "pointColor":       "rgba(10,186,181,1)"                   （两模式相同）
    "pointPendingColor":"rgba(0,0,0,0.18)"    /  "rgba(255,255,255,0.18)"
    "seeDetailsColor":  "rgba(10,186,181,1)"                   （两模式相同）
    ```
  - **无 `pointDoneColor`。** 故 `mini_ui` 的 `resolvePointColor`（`mini_ui/src/BUILTIN_COMPONENTs/timeline/timeline.js:39`，`return tl.pointDoneColor ?? tl.pointColor ?? "rgba(10,186,181,1)";`）在 `done` 时落 **`tl.pointColor` = `rgba(10,186,181,1)`**，即 **不透明青 `#0ABAB5`**。
  - **上游两态实测对比度**：`done` = `#0ABAB5` → **2.4128**（on `#ffffff`）/ **7.7644**（on `#121212`）；`pending` = 0.18 灰 → **1.5255** / **1.7156**。**两态在暗色下相差 4.5 倍，在亮色下相差 1.6 倍，且色相完全不同（青 vs 中性灰）—— 上游的 `done`/`pending` 是一次真实的两态编码。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/mini_ui
  grep -n -A 12 '"timeline"' src/BUILTIN_COMPONENTs/theme/default_mini_theme.json
  grep -n "pointDoneColor\|pointPendingColor\|pointColor" src/BUILTIN_COMPONENTs/timeline/timeline.js
  diff src/BUILTIN_COMPONENTs/timeline/timeline.js \
       /Users/red/Desktop/GITRepo/pupu/src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 与 E-0234 共同 **回答本庭对本 owner 的第一问之 2**（有意设计还是历史沉淀）；**限定** E-0172 的结论射程 —— 其"四态视觉全等"在 PuPu 成立，**不是这套 primitive 的固有属性**，上游同一份代码在同一位置是两态可分的。
- **完整性限制**:
  1. **`mini_ui` 是本 owner charter 指定的设计源头仓，不是 PuPu 的构建依赖。** 本条只证"上游长什么样"，**不主张 PuPu 应当照抄上游** —— 上游的青色在亮色下也只有 2.41:1，同样不达 3:1（见 E-0246）。
  2. **未追 `mini_ui` 该文件自身的历史**，只读了其工作树当前内容。**故本条不主张上游的取值是被设计过的**，只主张 PuPu 与上游在此处不同。
  3. `mini_ui` 工作树的洁净度 **未核**。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0234 | repository | 自证类
- **来源定位**: **`pointDoneColor` 是 PuPu 在移植时新增的键，不是从上游带过来的 —— 它在移植的第一个提交里就把 `done` 从强调色改成了中性灰。**
  - `git show 49b140c6 -- src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` 的新增行（该提交为 `timeline` 块的引入点）：
    ```
    +      "lineDoneColor":    "rgba(0,0,0,0.18)"          ← 上游为 rgba(10,186,181,0.85)
    +      "pointColor":       "rgba(10,186,181,1)"        ← 与上游同
    +      "pointDoneColor":   "rgba(0,0,0,0.22)"          ← 上游无此键
    +      "pointPendingColor":"rgba(0,0,0,0.18)"          ← 与上游同
    +      "seeDetailsColor":  "rgba(0,0,0,0.35)"          ← 上游为 rgba(10,186,181,1)
    ```
    （dark 块同形，`rgba(255,255,255,·)`；`lineDoneColor` 为 `0.15`）
  - `49b140c6` = `feat: add timeline component and integrate into chat bubble trace chain`，**2026-02-27**，同时是 `src/BUILTIN_COMPONENTs/timeline/timeline.js` 的 **首个** 提交（`git log --diff-filter=A` 唯一命中）。
  - **净效果**：移植当天，`done` 从"不透明青"变成"0.22 中性灰"，而 `pending` 保持 0.18 中性灰。**两态之差从"色相不同 + 4.5 倍对比度"塌成"同色相 + 0.04 alpha"。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  git log --oneline --diff-filter=A -- src/BUILTIN_COMPONENTs/timeline/timeline.js
  git show 49b140c6 -- src/BUILTIN_COMPONENTs/theme/default_mini_theme.json \
    | grep -E "^[-+].*(pointDone|pointPending|pointColor|lineDone|seeDetails)"
  git log --format="%h %ad %s" --date=short -1 49b140c6
  ```
- **提交发言**: S-0052
- **支持/反驳**: **回答本庭对本 owner 的第一问之 2：历史沉淀，非有意设计。** 支持「建议处置」第二项。**不反驳 E-0171 / E-0172 的任何取值或数字。**
- **完整性限制**:
  1. **本条不读作者意图。** 它证明的是"上游无此键、PuPu 移植时新增了它"这一机械事实，**不证明"作者没有量过"** —— 那是本 owner 的推论，其依据是同一提交把 `seeDetailsColor` 也从强调色改成 2.44:1 的灰（E-0247），**即同一次改动在三个键上同向降低了对比度**，本 owner 认为这更像一次统一的"去色/中性化"排版取向而非逐键核算的结果。**该推论的举证责任在本 owner，本条只出机械事实。**
  2. **未追该提交的评审记录、issue 或设计稿**（若存在）。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0235 | repository | 自证类
- **来源定位**: **`pointColor` 已于 2026-06-01 被删除，`active` 因此跟随用户主题，而 `done` 被留在硬编码灰上 —— 这是一次未完成的迁移。**
  - `git show f7d26a42 -- src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` 在 `timeline` 块上的 **全部** 改动为两行删除：
    ```
    -      "pointColor": "rgba(10,186,181,1)",     （light 块）
    -      "pointColor": "rgba(10,186,181,1)",     （dark 块）
    ```
  - `f7d26a42` = `feat: implement theme highlight color across components`，**2026-06-01**。同一提交把 `timeline/timeline.js` 的三处硬编码青改成 `themeHighlightColor(theme)` / `colorWithAlpha(highlight, ·)`（见 E-0233 的 `diff` 输出）。
  - **据此**：该提交的方向是 **把 timeline 接上用户主题的 highlight 通道**。它对 `active`（`:44` `tl.pointColor ?? highlight` → 无 `pointColor` → `highlight`）与 `DotStart`（`:80`）成功；**对 `done` 不成功，因为 `pointDoneColor` 挡在 `:46` 的 `??` 链首位。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  git log --oneline -L 284,294:src/BUILTIN_COMPONENTs/theme/default_mini_theme.json
  git show f7d26a42 -- src/BUILTIN_COMPONENTs/theme/default_mini_theme.json \
    | grep -E "^[-+].*(timeline|point|lineDone|seeDetails)"
  git log --format="%h %ad %s" --date=short -1 f7d26a42
  sed -n '42,48p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「建议处置」第二项（删键即回到上游行为且接上主题通道）；**与 E-0245 共同限定 E-0173 的射程**（highlight 通道确实到达 timeline，且有人刻意接过）。
- **完整性限制**: 本条只核了该提交在 `timeline` 块与 `timeline/timeline.js` 上的改动，**未核该提交在其余组件上的改动**（提交名为 "across components"）。故 **不主张** 删除 `pointDoneColor` 对其他组件无影响 —— 影响面见 E-0241 / E-0242。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0236 | repository | 自证类
- **来源定位**: **`timeline.js` 有一道可见性门，会把中间行的圆点整个不渲染，且自定义 ReactNode 的 `point` 不豁免。本庭迄今无人引用这两行。**
  ```js
  // src/BUILTIN_COMPONENTs/timeline/timeline.js:806-810   （Timeline 的 items.map 内）
  const isFirst = i === 0;
  const isLast = i === items.length - 1;
  const isActive = (item.status ?? "pending") === "active";
  const isPreset = item.point === "start" || item.point === "end";
  const isPassThrough = !isFirst && !isLast && !isActive && !isPreset;
  ```
  ```js
  // 同文件 :204-219   （TimelineNode 的 Track 列内）
  {/* point — hidden for pass-through nodes */}
  {!isPassThrough && (
    <div style={{ position:"absolute", top: topLineH, left:"50%", ... }}>
      {pointEl}
    </div>
  )}
  ```
  - **`isPreset` 只匹配两个字符串字面量。** `pointEl` 的解析（`:140-153`）另有一条 `if (point != null && typeof point !== "string") return point;`（`:151`）—— **自定义元素在这里被正确解析出来，随后在 `:205` 被整个丢弃。**
  - **成立的机械命题**：一个 item 的圆点 **渲染，当且仅当** 它是首项、或末项、或 `status === "active"`、或 `point` 为字符串 `"start"` / `"end"`。**`point` 为自定义 ReactNode 不在豁免之列。**
  - 另：`hideTrack` 为 `true` 时整个 Track 列不渲染（`:181`），此为另一条独立的抑制路径，由调用方显式控制。
- **取得方式**:
  ```
  grep -n "isPassThrough\|isPreset\|typeof point" src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '204,220p'  src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '805,812p'  src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '140,153p'  src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: **限定 E-0172 第 1 段** —— 其"未传 `point`，故落 `DotDefault`"在 `:152` 成立，但 `DotDefault` 是否被挂载由 `:205` 另行决定，该条未引；**其结论（四态视觉无区分）不受影响，反而被加强**。**支撑本 owner 对 E-0174 的 `UNSUPPORTED` 质疑。** 支持 E-0239 / E-0240 / 「建议处置」第一项。
- **完整性限制**:
  1. **本条为源码静态导出，未渲染任何 DOM，未观察任何真实圆点。**
  2. **本条不主张该门是错的**，只主张它存在、它吃掉自定义元素、且 props 文档未记载它（E-0238）。**判定为缺陷是本 owner 在 S-0052 中的推论，其依据是 E-0237 的内部不一致，不是本条。**
  3. `BranchGroup` / `BranchNode`（`:440-520` 一带）是另一套渲染路径，**本条未核其是否有同类门**。故本条只覆盖顶层 `items`，不覆盖 `children` 分支。
- **验证历史**: S-0052 | 已验证（提交人实跑；由该文件的所有者出具）

---

### E-0237 | repository | 自证类
- **来源定位**: **同一文件内两处对"什么算一个非默认 point"的判定互相矛盾 —— 布局承认自定义元素，可见性门不承认。**
  ```js
  // :55-60   getPointRadius —— 认得自定义元素
  const getPointRadius = (point) => {
    if (point === "start" || point === "end") return PRESET_DOT_R;   // 6
    if (point === "loading") return LOADING_R;                        // 8
    if (point != null && typeof point !== "string") return PRESET_DOT_R; // ← 自定义元素，按 12×12 布局
    return DEFAULT_DOT_R;                                             // 5
  };
  ```
  ```js
  // :809    isPreset —— 不认得自定义元素
  const isPreset = item.point === "start" || item.point === "end";
  ```
  - `getPointRadius` 的返回值被用于 **三处几何**：`:158` `topLineH = Math.max(0, TITLE_CY - getPointRadius(point))`、`:198` 顶线段高度、`:227` 底线段起点。**即本 primitive 会为一个它随后不渲染的元素计算并预留 12×12 的对齐几何。**
- **取得方式**:
  ```
  sed -n '55,60p'   src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '809,810p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "getPointRadius" src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「E-0236 的门是遗漏而非取舍」这一判定；支持「建议处置」第一项所提的最小改法（对齐 `isPreset` 与 `getPointRadius`，而非删除 `isPassThrough`）。
- **完整性限制**: **内部不一致是缺陷的强指征，不是证明。** 一个设计者可以有意让布局宽松、可见性严格。**本 owner 作为该 API 的所有者判定它是遗漏，该判定的举证责任在本 owner；本条只出两处代码的并置。**
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0238 | repository | 自证类
- **来源定位**: **`Timeline` 的 props 文档完全未记载位置相关的抑制规则 —— 调用方无从知晓传了 `point` 也可能不显示。**
  - `src/BUILTIN_COMPONENTs/timeline/timeline.js:727-745` 是本 primitive 的全部对外契约声明，其 Item shape 段逐字为：
    ```
     point    : "start"|"end"|"loading"|ReactNode  — custom point marker; omit for default dot
     status   : "done"|"active"|"pending"   — drives line + dot color; defaults to "pending"
    ```
  - **该段无一字提及 `isPassThrough`、中间行、首末项或"点可能不渲染"。** `:155` 的行内注释 `/* ── pass-through: hide the circle dot, keep content ── */` 是文件内部注释，不在对外契约段内。
  - `src/BUILTIN_COMPONENTs/timeline/` 目录下 **只有 `timeline.js` 一个文件**，无 README、无 `.md`、无 story、无 demo。
- **取得方式**:
  ```
  sed -n '724,746p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  ls src/BUILTIN_COMPONENTs/timeline src/BUILTIN_COMPONENTs/timeline_v2
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持 E-0236 的用户面（调用方面）后果；**证成 `code-owner-chat-bubble` 与 `expert-ux` 二者在此处的取证都不可能发现该门** —— 它不在契约里。**本 owner 据此明确不把这一项记为任何一方的取证瑕疵，成因在本 owner 的文档。**
- **完整性限制**: 只核了本仓；**未核 `mini_ui` 的 docs 页**（`mini_ui/src/PAGEs/docs/components/feedback/timeline_page.js` 存在但本轮未读），故不主张上游也未记载。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0239 | repository | 自证类
- **来源定位**: **`expert-ux` 用作"形态已在使用"证明的那个 `ErrorPoint`，其所在 item 恰好落在 E-0236 的抑制条件内。**
  - `src/COMPONENTs/chat-bubble/trace_chain.js:1742-1755`（`frame.type === "error"` 分支的 `items.push`）逐字含：
    ```js
    status: "done",          // :1746
    point: <ErrorPoint />,   // :1747
    ```
  - 对照 E-0236 的判定：`status: "done"` → `isActive` 为 **假**；`point` 为 ReactNode 而非字符串 `"start"` / `"end"` → `isPreset` 为 **假**。**故该行的 `ErrorPoint` 渲染，当且仅当它是 `grouped` 的首项或末项。**
  - **`trace_chain.js` 中六个自定义 point 元素所在 item 的 status（本 owner 逐一核对）**：`:1059` `AccentPoint` → `status: "done"`（`:1058`）· `:1139` `HammerPoint` → `"done"`（`:1138`）· `:1459` `SubagentPoint` → `status:` 为条件表达式（`:1453`，未展开）· `:1529` `SubagentPoint` → `resultFrame ? "done" : "active"`（`:1528`）· `:1726` `toolPointEl` → `toolStatus`（`:1725`，变量）· `:1747` `ErrorPoint` → `"done"`（`:1746`）· `:1919` `HammerPoint` → `"done"`（`:1918`）。**即：至少四处硬编码为 `"done"`，全部落在抑制条件内。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/pupu
  grep -n "point:" src/COMPONENTs/chat-bubble/trace_chain.js
  sed -n '1742,1756p' src/COMPONENTs/chat-bubble/trace_chain.js
  for n in 1059 1139 1459 1529 1726 1747 1919; do
    awk -v n=$n 'NR>=n-14 && NR<=n+3 {printf "%d: %s\n", NR, $0}' \
      src/COMPONENTs/chat-bubble/trace_chain.js | grep "status:"
  done
  ```
- **提交发言**: S-0052
- **支持/反驳**: **支撑本 owner 对 E-0174 的 `UNSUPPORTED` 质疑** —— E-0174 主张该形态"已被 `:1747` 实际使用"，本条不反驳"已被传入"，只指出"被传入"与"被渲染"之间隔着 E-0236 的门。**不反驳 E-0174 的任何行号、引文或 `#ef4444` 的对比度数字**（后者本 owner 已独立复算吻合，见 E-0232）。
- **完整性限制**:
  1. **`src/COMPONENTs/chat-bubble/**` 在 `code-owner-chat-bubble` 边界内，本条为越界只读**，只出机械事实（`status` 字面量与 `point` 传值），**对该文件的取舍不表态**。
  2. **本条不主张这六个元素今天在用户面上不可见** —— 是否可见取决于每次渲染时该 item 在 `grouped` 中的位置，**本 owner 未渲染、未观察**。本条只主张"它们不豁免于该门"。
  3. `:1453` 与 `:1725` 两处 `status` 为变量，**其可能取值本条未追**。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0240 | repository | 自证类
- **来源定位**: **memory_v2 那一行在本案关心的回合上是中间行，故其圆点整个不渲染。**
  - `src/COMPONENTs/chat-bubble/trace_chain.js` 中 `grouped` 的 push 顺序（`:1885` 起）：
    - `:1890` / `:1904` / `:1909` —— 帧派生项与合并项，**在 memory_v2 之前**
    - `:1937-1959` —— **memory_v2 行**（无 `point` 键，`status: "pending" | "done"`）
    - `:1965-1988` —— Memory Agent 行，条件 `memoryV2Audit.agentRuns.length > 0`（`:1961`）
    - `:1999-2013` —— Token summary 行，条件 `status === "done" && typeof bundle.consumed_tokens === "number" && bundle.consumed_tokens > 0`（`:1992-1998`），且 `point: "end"`（`:2012`）
  - **代入 E-0236 的判定**（memory_v2 行 `isActive` 恒假、`isPreset` 恒假，因其 status 只取 `"pending"` / `"done"`、且不传 `point`）：

    | 情形 | memory_v2 是首项? | 是末项? | 圆点 |
    |---|---|---|---|
    | 有帧派生项在前 **且** token summary 被 push | 否 | 否 | **不渲染** |
    | 有帧派生项在前 **且** Memory Agent 行被 push | 否 | 否 | **不渲染** |
    | 有帧派生项在前，其后两行皆无 | 否 | 是 | 渲染 |
    | `grouped` 在其之前为空 | 是 | — | 渲染 |

  - **据此**：一个 **正常完成（`message.status === "done"`）且有 token 计数** 的回合 —— 即本案关心的"降级了却报 `Complete`"那种回合 —— **必然 push token summary 行**，故 memory_v2 行必为中间行，**其圆点不渲染**。
  - **对 E-0104 情形的附带后果**：`Unavailable` → `status: "pending"`（`:1949`）同样既非 active 亦非 preset，**故在同一类回合上，那个"不同的 pending 圆点"同样不渲染。**
- **取得方式**:
  ```
  sed -n '1884,1926p' src/COMPONENTs/chat-bubble/trace_chain.js
  sed -n '1936,1960p' src/COMPONENTs/chat-bubble/trace_chain.js
  sed -n '1961,2014p' src/COMPONENTs/chat-bubble/trace_chain.js
  sed -n '805,812p'   src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: **加强 UX-V1 与 E-0172 的结论**（有效状态编码数在本案关心的回合上是 0 而非 1）；**独立于 E-0104 的感知层结论、也独立于对它的复核** —— 本条走的是渲染挂载而非颜色；**支撑本 owner 对 E-0174 的质疑**。
- **完整性限制**:
  1. **机械导出，未渲染 DOM、未观察。** 本条最可能出错的地方是本 owner 对 `grouped` 顺序的推导 —— 该文件不在本边界。**若 `code-owner-chat-bubble` 指出本条对其文件的读法有误，以其为准。**
  2. **本条不主张任一情形的发生频率。** "哪一类回合最常见"未测，且本案 `case.md` 已把触发频率列为已知缺口。
  3. `hideTrack` 为真时整列不渲染（E-0236），该路径本条未纳入 —— `trace_chain.js:2082` 把它从自身 props 透传（`:644` 默认 `false`），**其真实调用方本条未追**。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0241 | repository | 自证类
- **来源定位**: **`Timeline`(v1) 全仓生产消费者仅一处，故对 `timeline.js` 的作用域受限改动其爆炸半径极小。**
  - `grep` 全仓对 `BUILTIN_COMPONENTs/timeline/timeline` 的 import 命中 **恰好 2 处**：
    - `src/COMPONENTs/chat-bubble/trace_chain.js`（**唯一生产消费者**）
    - `src/COMPONENTs/chat-bubble/trace_chain.live_subscription.test.js`（测试）
  - 调用形状（`trace_chain.js:2079-2084`）：`<Timeline items={timelineItems} compact={compact} hideTrack={hideTrack} style={{fontSize: compact ? 12 : 13}} />` —— **未传 `expanded_indices`，即展开态为非受控。**
- **取得方式**:
  ```
  grep -rn 'from "[^"]*timeline/timeline"' src/
  grep -n -A 8 "<Timeline" src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「受影响对象 一」的半径判定（**低**）；**限定** 任何"改共享原语代价高"的一般性推定 —— 在本案这一件上不成立。
- **完整性限制**: 只核了 `src/`；**未核 `electron/` 或任何构建期产物**（React 组件不会被主进程 import，本 owner 认为该风险为零但未实证）。`hideTrack` 的真实取值链未追。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0242 | repository | 自证类
- **来源定位**: **`theme.timeline` 有第二个读者，它在本边界内，本庭迄今无人提及。**
  - `grep -rn "theme?.timeline\|theme\.timeline" src/` 全仓命中 **恰好 2 处**：
    - `src/BUILTIN_COMPONENTs/timeline/timeline.js:758` —— `...(theme?.timeline ?? {}),`
    - `src/BUILTIN_COMPONENTs/timeline_v2/timeline.js:994` —— `...(theme?.timeline ?? {}),`
  - **即：任何对 `default_mini_theme.json` 的 `timeline` 块的键增删，同时改变两个组件的行为。**
- **取得方式**:
  ```
  grep -rn "theme?.timeline\|theme\.timeline" src/
  grep -rn "pointDoneColor\|pointPendingColor\|pointColor" src/
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「受影响对象 二」的携带项；**限定 E-0171** —— 其把该 JSON 块描述为"本案圆点色的实际来源"成立，但该块 **不只** 服务本案那条 timeline。
- **完整性限制**: 只核了 `theme.timeline` 一个路径。`tl` 展开后的各个键 **是否还有别的读者未核**（例如某处直接读 `theme.timeline.titleColor`）—— 上述 `grep` 覆盖了对象访问形式，未覆盖解构后的间接访问。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0243 | repository | 自证类
- **来源定位**: **`timeline_v2` 已经实现了本案想要的形态，且零生产消费者。**
  - `src/BUILTIN_COMPONENTs/timeline_v2/timeline.js`：
    - **无 `isPassThrough`，无 `isPreset`。** `grep -n "isPassThrough\|isPreset"` → **零命中**。点在 `:322` 与 `:525` 两处无条件渲染（`{pointEl}`，外层无 `!isPassThrough &&` 包裹）。
    - **`resolvePointColor`（`:48-53`）无 `pointDoneColor` 分支**：
      ```js
      const resolvePointColor = (status, tl) => {
        const highlight = tl.highlightColor;
        if (status === "done" || status === "active")
          return tl.pointColor ?? highlight;
        return tl.pointPendingColor ?? "rgba(0,0,0,0.18)";
      };
      ```
      **PuPu 的 JSON 无 `pointColor`（E-0235），故在 v2 里 `done` 落 `highlight` —— 跟随用户 accent。**
    - **`DotDefault`（`:96-111`）是实心圆**（`background: resolvePointColor(...)`），非 v1 的 1px 描边；`active` 另加 `transform: scale(1.25)`。
    - 同样支持自定义 ReactNode（`:251` / `:477` `if (point != null && typeof point !== "string") return point;`）。
  - **生产消费者**：`grep -rn "timeline_v2" src/ --include="*.js"` 除该文件自身外 **零命中**。
  - **提交史**：`565b3d00`（2026-03-20，新增 1048 行）→ `6bd052a2`（删除 1048 行）→ `4cbf07ac`（2026-03-20，`feat: integrate new timeline component and update related components`，新增 1098 行）→ `246c8ee5` → `f7d26a42`（2026-06-01，最后一次触碰）。**v1 的首个提交为 `49b140c6`，2026-02-27 —— 即 v2 晚于 v1，命名与时序一致。**
- **取得方式**:
  ```
  grep -n "isPassThrough\|isPreset\|typeof point" src/BUILTIN_COMPONENTs/timeline_v2/timeline.js
  grep -n "pointEl}" src/BUILTIN_COMPONENTs/timeline_v2/timeline.js
  sed -n '40,60p'  src/BUILTIN_COMPONENTs/timeline_v2/timeline.js
  sed -n '96,112p' src/BUILTIN_COMPONENTs/timeline_v2/timeline.js
  grep -rn "timeline_v2" src/ --include="*.js" | grep -v "^src/BUILTIN_COMPONENTs/timeline_v2/"
  git log --oneline -- src/BUILTIN_COMPONENTs/timeline_v2/
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「建议处置」第五项（登记，不处置）；**限定** 任何"本仓没有可用形态"或"要新建形态"的推定。
- **完整性限制**:
  1. **本 owner 未追它为何被建后弃用**（提交信息写 "integrate"，今天却零消费者）。**故本条不主张它可用、不主张应切到它**，只主张它存在且形状如上。
  2. **未跑它的任何渲染**；上述全部为源码静态读取。
  3. `:156` 另有一处 `if (point != null && typeof point !== "string")` 分支（度量相关），本条未展开其语义。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0244 | repository | 自证类
- **来源定位**: **E-0173 的前半属实：`applySemanticPaletteToTheme` 的覆写清单不含 `timeline`。但同一函数显式覆写 `highlightColor`，而 `highlightColor` 正是 timeline 的调色入口之一。**
  - `src/CONTAINERs/config/theme_semantic.js:211-303` `applySemanticPaletteToTheme(base, semantic, mode)` 的返回对象顶层键（本 owner 逐条枚举）：`...base` · `semantic` · **`highlightColor: accent`（`:233`）** · `color` · `backgroundColor` · `foregroundColor` · `icon` · `font` · `input` · `select` · `modal` · `switch`，以及 `deepTier` 分支下的 `code` / `textfield` / `markdown`。
  - **`timeline` 不在其中** —— 经 `...base` 原样透传 `default_mini_theme.json`。**E-0173 这一句属实。**
  - **但 `highlightColor: accent` 在其中。** 其入参 `semantic` 为一份 **扁平语义 palette**（解构清单：`accent` / `background` / `sidebar` / `surface` / `text` / `textMuted` / `border` / `success` / `warning` / `danger`，`:213-224`），**即用户自定义主题持久化的是这十个 token，不是一棵 theme 树。**
- **取得方式**:
  ```
  sed -n '205,240p' src/CONTAINERs/config/theme_semantic.js
  sed -n '211,303p' src/CONTAINERs/config/theme_semantic.js | grep -nE "^\s+[a-zA-Z_]+:"
  grep -n "highlightColor" src/CONTAINERs/config/theme_semantic.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: **确认 E-0173 的前半（覆写清单不含 `timeline`）**；**与 E-0245 共同支撑本 owner 对 E-0173 后半（"整条 trace chain 不跟随用户自定义主题"）的 `UNSUPPORTED` 质疑**；支撑「约束 · 乙」（本边界内零历史行、零单向门）。
- **完整性限制**:
  1. `src/CONTAINERs/**` 在 `code-owner-shared-arteries` 边界内，**本条为越界只读**，只出机械事实（返回对象的顶层键与入参解构清单），对该文件的取舍不表态。
  2. **本条未追持久化的落盘路径本身**（`BOOT_PALETTE_STORAGE_KEY = "pupu_boot_palette"` 存在于 `:323`，但其写入者与完整落盘形状本轮未核）。**故「约束 · 乙」第 2 点的强度上限是"该函数的入参是扁平 palette"，不是"落盘的一定只有这十个 token"。** 若有人证明落盘含完整 theme 树，乙 的结论应重估。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0245 | repository | 自证类
- **来源定位**: **highlight 通道确实到达 timeline —— `theme.highlightColor` 被注入 `tl`，且被三条解析路径消费。**
  - `src/BUILTIN_COMPONENTs/timeline/timeline.js:756-762`：
    ```js
    const tl = useMemo(() => ({
      ...(theme?.timeline ?? {}),
      highlightColor: themeHighlightColor(theme),
    }), [theme]);
    ```
  - `src/CONTAINERs/config/theme_highlight.js`：`export const themeHighlightColor = (theme) => theme?.highlightColor || THEME_HIGHLIGHT_COLOR;`，`THEME_HIGHLIGHT_COLOR = "#65c466"`。
  - **接上 E-0244 的 `highlightColor: accent`**：用户自定义 accent → `theme.highlightColor` → `themeHighlightColor(theme)` → `tl.highlightColor`。
  - **在 timeline 内实际跟随主题的路径（本 owner 逐条枚举）**：`resolvePointColor:44` `active` → `tl.pointColor ?? highlight` → 因 JSON 无 `pointColor`（E-0235）→ **`highlight`** · `resolveLineColor:38` `active` → `colorWithAlpha(highlight, 0.38)` · `DotStart:80` → `tl.pointColor ?? tl.highlightColor` → **`highlight`** · `ArcSpinner`（`point: "loading"`）`:148` / `:467` → 同。
  - **不跟随的路径**：`done` 点（被 `pointDoneColor` 截住，`:46`）· `done` 线（被 `lineDoneColor` 截住，`:37`）· `pending` 点（`pointPendingColor`）· `pending` 线（`lineColor`）· `titleColor` · `spanColor` · `seeDetailsColor` · `detailsBackground` —— **全部因 JSON 里存在硬编码值而截断，不是因为通道不存在。**
- **取得方式**:
  ```
  sed -n '754,763p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '34,48p'   src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '1,42p'    src/CONTAINERs/config/theme_highlight.js
  grep -n "tl.highlightColor\|highlightColor" src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: **支撑本 owner 对 E-0173 的 `UNSUPPORTED` 质疑**（"整条 trace chain 不跟随用户自定义主题"射程过宽 —— `active` 点、`active` 线、`start` 点、`loading` 点均跟随）；支持「建议处置」第二项（删一个键即可让 `done` 接上该通道，**无需改 `applySemanticPaletteToTheme`**）。**不反驳 E-0173 关于覆写清单的事实（见 E-0244，已确认属实）。**
- **完整性限制**: **本条不主张"跟随的那几条路径在本案 memory_v2 那一行上被走到"** —— 该行 status 恒为 `done` / `pending`，**恰好全落在不跟随的一侧**。即 E-0173 的结论 **在本案那一行上是对的**，本条质疑的是它作为一般命题的射程。**该区分对方案成本有直接影响，对本案那一行的现状描述无影响。**
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0246 | repository | 自证类
- **来源定位**: **本仓出厂默认强调色在亮色下不足 3:1 —— 颜色通道在默认配置下就已经不能承载一次非文本状态编码。**

  | 前景 | 底色 | 对比度 | SC 1.4.11（3:1） |
  |---|---|---|---|
  | `#65c466`（`THEME_HIGHLIGHT_COLOR`，`theme_highlight.js:1`） | `#ffffff` | **2.1782** | **不满足** |
  | `#65c466` | `#121212` | 8.6007 | 满足 |
  | `#0ABAB5`（`mini_ui` 原版 `pointColor`，E-0233） | `#ffffff` | **2.4128** | **不满足** |
  | `#0ABAB5` | `#121212` | 7.7644 | 满足 |

  - **据此**：即便执行「建议处置」第二项（删 `pointDoneColor`，让 `done` 落 `highlight`），**亮色模式下的 `done` 点仍不达 3:1**；即便照抄 `mini_ui` 原版取值亦然。**两条最自然的"恢复颜色编码"路径都不能单独达标。**
  - **与 `expert-ux` 的 E-0177 的关系**：其下界 3.05:1 出自最坏出厂预设（`nord` 暗色的 `danger`）。**本条给出的是一条更早、更普遍的失效** —— 不需要用户切到任何预设，出厂即如此，且失效的是 accent 而非 danger。
- **取得方式**: 依本节抬头公式，对 `grep -n "THEME_HIGHLIGHT_COLOR" src/CONTAINERs/config/theme_highlight.js` 与 E-0233 所载取值作算术（脚本见 E-0232）。
- **提交发言**: S-0052
- **支持/反驳**: **独立支持 UX-C2**（信号由形状承载、颜色只作强化），走的是与 E-0177 不同的一条路；**限定「建议处置」第二项** —— 该项是改善不是达标。
- **完整性限制**:
  1. 计算值非仪器测量。
  2. **`#65c466` 是默认值；用户自定义 accent 后须重算。** 本 owner **未** 对全 9 套 `SEMANTIC_PRESETS` 的 `accent ↔ background` 作全量扫描（E-0177 对 `danger` 做了，本 owner 对 `accent` 没做）。**故本条只主张出厂默认这一格，不主张全预设下界。** 若需要该下界，应扩 `contrast_window.test.js`（E-0249）而不是手算。
  3. **SC 1.4.11 是否为本场景的正确判据不在本 owner 的专业范围** —— 那是 `expert-ux` 的领域。本条只出取值与算术。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0247 | repository | 自证类
- **来源定位**: **E-0178 的代码引文与五个数字，本 owner 作为该文件所有者逐项复核，全部属实。**
  - `timeline.js:281-320` 的 `detail` 按钮：`padding: "0"`（`:288`）· `background: "transparent"`（`:289`）· `border: "none"`（`:290`）· `fontSize: tl.spanFontSize ?? (compact ? "10px" : "11px")`（`:292`）· `color: tl.seeDetailsColor ?? "rgba(0,0,0,0.35)"`（`:293`）· **`outline: "none"`（`:295`）** · `userSelect: "none"`（`:296-297`）· `onMouseEnter` 设 `opacity = "0.6"`（`:300-302`）· `onMouseLeave` 设 `"1"`（`:303-305`）· 文本 `{isExpanded ? "hide" : "detail"}`（`:307`）· 14×14 `Icon`（`:308-318`）。
  - **`aria-expanded` / `aria-controls` / `aria-label` / `title`：该 `<button>` 上一个都没有。** `grep -n "aria-" src/BUILTIN_COMPONENTs/timeline/timeline.js` 在 `:281-320` 区间内零命中。
  - **`outline:"none"` 无替代**：全部样式为内联对象，**内联样式无法表达 `:focus` / `:focus-visible` 伪类**，且该按钮无 `onFocus` / `onBlur` 处理器。**故确无任何替代焦点指示。**
  - **行高**：`TITLE_LINE_H = 18`（`:20`），标题行容器 `lineHeight: "${TITLE_LINE_H}px"`（`:256`）。按钮 `padding:"0"`，**故其有效目标高度为 18px < 24px。**
  - **对比度（本 owner 独立复算）**：静息 `rgba(0,0,0,0.35)` on `#ffffff` → 合成 `(166,166,166)` → **2.4415**；`rgba(255,255,255,0.35)` on `#121212` → 合成 `(101,101,101)` → **3.2115**。hover `opacity:0.6` → 有效 α = 0.35×0.6 = 0.21 → 合成 `(201,201,201)` / `(68,68,68)` → **1.6483** / **1.9165**。**hover 使其分别下降 32.5% / 40.3%。** 与 E-0178 逐项吻合。
- **取得方式**:
  ```
  sed -n '281,320p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '18,22p'   src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '250,262p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "aria-" src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
  对比度依 E-0232 的脚本。
- **提交发言**: S-0052
- **支持/反驳**: **确认 E-0178 全部五个数字与四项判据**（由该控件的所有者复核）；支持 UX-C5；支持「建议处置」第四项的两半切分。
- **完整性限制**:
  1. **有效目标宽度 45px 本 owner 未复算** —— 它依赖 11px 等宽字体下 `"detail"` 六字的实际排版宽度加 3px gap 加 14px 图标，**需要渲染才能测准**。本 owner 只复核了 **高度 18px**，而 SC 2.5.8 要求 24×24，**高度一项已足以判定不满足**，故宽度未复算不影响结论。
  2. **未跑键盘导航，未观察真实焦点行为。**
  3. **"是否满足 SC" 的判定不在本 owner 的专业范围**，归 `expert-ux`。本条只出取值、代码事实与算术。
- **验证历史**: S-0052 | 已验证（提交人实跑；由该控件的所有者出具）

---

### E-0248 | repository | 自证类
- **来源定位**: **本 primitive 的 status 词汇表封闭于三值、无 error 态，且对未知值静默降级为 `pending`。**
  ```js
  // :34-40
  const resolveLineColor = (status, tl) => {
    const highlight = tl.highlightColor;
    if (status === "done")   return tl.lineDoneColor ?? colorWithAlpha(highlight, 0.85);
    if (status === "active") return colorWithAlpha(highlight, 0.38);
    return tl.lineColor ?? "rgba(0,0,0,0.12)";          // ← 无保护兜底
  };
  // :42-48
  const resolvePointColor = (status, tl) => {
    const highlight = tl.highlightColor;
    if (status === "active") return tl.pointColor ?? highlight;
    if (status === "done")   return tl.pointDoneColor ?? tl.pointColor ?? highlight;
    return tl.pointPendingColor ?? "rgba(0,0,0,0.18)";  // ← 无保护兜底
  };
  ```
  - **两个 resolver 是 `status` 在本 primitive 内的全部消费点。** 任何不等于 `"done"` / `"active"` 的字符串（包括拼错的、包括未来新增的枚举成员）**被静默渲染为 `pending`，无 `console.warn`、无抛错、无任何标记。**
  - `:136` `status = "pending"` 为解构缺省；`:808` `(item.status ?? "pending")`。**缺省方向同样是 `pending`。**
  - **`default_mini_theme.json` 的 `timeline` 块无任何 `danger` / `error` / `warning` 键**（E-0231）—— 即便调用方想传一个 error status，本 primitive 也没有对应取值。
- **取得方式**:
  ```
  sed -n '34,48p'   src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "status" src/BUILTIN_COMPONENTs/timeline/timeline.js | head -30
  sed -n '736,744p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「约束 · 甲」的两条（本 primitive 无 error 态；本 primitive 对枚举漂移的失效方向与本案缺陷同型）；**不对甲本身表态**。
- **完整性限制**: **本条不主张这是一个今天在发生的缺陷** —— 今天 `trace_chain.js` 只传三值中的值（本 owner 未穷举其全部 `status` 传值，`:1453` / `:1725` 两处为变量，未追）。**本条主张的是一条对未来绑定的约束，不是一条现状缺陷。**
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

### E-0249 | repository | 自证类
- **来源定位**: **`timeline/` 零测试覆盖；但本边界内已有两个在跑的、形态可复用的守卫测试前例。**
  - **零覆盖**：`find src/BUILTIN_COMPONENTs -name "*.test.js"` → **40 个**，**其中 `timeline/` 与 `timeline_v2/` 各 0 个**。`grep -rln "isPassThrough\|DotDefault\|pointDoneColor" src/ --include="*.test.js"` → **零命中**。**即本 primitive 今天没有任何测试，本案讨论的每一条行为都无回归网。**
  - **前例一 · `src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js`** —— 对一张显式文件清单作源码扫描，配 `shell_background_allowlist.js`。**其规则被写进 `.claude/CLAUDE.md` 的工程铁律段**（「外壳/背景颜色禁裸 hex …… 受 `shell_background_guard` 测试约束」）。**即它有一个强制读者，且该读者对每个 code owner 常驻可见。** 清单内含 P1(2026-06-20) / P3(2026-07-13) / P4(2026-07-14) 三批带日期的扩充注释 —— **该测试被持续维护过，不是写完即死。**
  - **前例二 · `src/BUILTIN_COMPONENTs/theme/contrast_window.test.js`** —— import `relativeLuminance` / `contrastRatio` / `minContrastBands` / `TEXT_MIN_RATIO` / `MUTED_MIN_RATIO` / `HUE_MIN_RATIO` 等，对 `SEMANTIC_PRESETS` 全量 × `["light_mode","dark_mode"]` 迭代。**即本仓已有一套跑得起来的对比度带代数与全预设扫描器 —— 正是 E-0177 手算出来的那一类工作，只是它今天不覆盖 `theme.timeline`。**
- **取得方式**:
  ```
  find src/BUILTIN_COMPONENTs -name "*.test.js" | wc -l          # -> 40
  find src/BUILTIN_COMPONENTs -name "*.test.js" | grep timeline  # -> （空）
  grep -rln "isPassThrough\|DotDefault\|pointDoneColor" src/ --include="*.test.js"   # -> （空）
  sed -n '1,45p'  src/BUILTIN_COMPONENTs/theme/contrast_window.test.js
  sed -n '1,32p'  src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js
  ```
- **提交发言**: S-0052
- **支持/反驳**: 支持「约束 · 丙」的全部四问作答；**限定** 任何把守卫测试当作零成本附加项的推定（**今天不存在这条测试，它是新增成本**）。
- **完整性限制**:
  1. **本 owner 未跑这两个测试**（未执行 `react-scripts test`）。**故本条不主张它们今天是绿的**，只主张它们存在、其形态如上、且 `shell_background_guard` 的规则被写进了 `.claude/CLAUDE.md`。
  2. **`contrast_window.test.js` 能否被扩到 `theme.timeline` 未验证** —— 其 `roleWindow` / `SHELL_ROLES` / `HUE_ROLES` 的角色模型是否容纳一个"状态点色对"，本 owner 未读到那一层。**故「约束 · 丙」的建议形态是一条待验证的建议，不是一条已验证的方案。**
  3. **本条不主张守卫测试应当被建。** 见「约束 · 丙」的有条件立场。
- **验证历史**: S-0052 | 已验证（提交人实跑）

---

## OBJECTION（请 `speaker-of-the-house` 另行分配发言编号）

> **本 owner 提两条，且只提两条。** 对 **E-0171**（取值）、**E-0172**（数字与结论）、**E-0178**（判据与数字）**明确不质疑** —— 三条经本 owner 作为其所属文件的所有者逐项复核，事实与算术全部属实（E-0231 / E-0232 / E-0247）。**四条证据在本 owner 处的处置不同，请勿合并处理。**

---

#### S-#### | OBJECTION | code-owner-ui-primitives → E-0174

- **阶段**: 议案庭审
- **结论**: **E-0174 的定位不包含 `timeline.js` 的可见性门（`:205` 与 `:809-810`），因而不能支撑「带宽不是不足，是没有被使用」这一推论。** 该条其余部分 —— `ErrorPoint` 的源码与行号、`#ef4444` 的 3.76:1 / 4.98:1（本 owner 独立复算为 3.7631 / 4.9782，吻合）、六个自定义 point 元素的 `grep` 清单、memory_v2 那一次 push 确实未传 `point`、以及 UX-3 那条裸 hex 的债 —— **本 owner 全部不质疑，且以 E-0239 独立佐证其行号与 `status` 取值属实**。质疑 **只针对「传入 `point` 即可获得一个被渲染的差异化标记」这一未经证立的推论**。
- **依据**: E-0236, E-0237, E-0238, E-0239, E-0240, E-0241；本案 E-0174
- **不确定性**: 本 owner 的"点不渲染"为源码机械导出，**未渲染 DOM、未观察**。若有人实跑并观察到 `trace_chain.js:1747` 的 `ErrorPoint` 在中间行上可见，本异议应被驳回，且本 owner 会先怀疑自己对 `:809-810` 的读法。**此外 E-0240 依赖 `trace_chain.js` 的 push 顺序，该文件不在本边界。**
- **请求/下一步**: 依[证据规则第二节](../../../codex/lifecycle/evidence-rules.md)强制触发 `evidence-examiner` 审查。**补强责任在提出方（`expert-ux`）。本 owner 不主张该证据为假，只主张其定位不足以支撑该一句推论。** 本 owner 另请复核者注意：**该门位于本 owner 的文件内，而 E-0238 证明它未被写进对外契约 —— 故提出方无从发现它。本 owner 明确不把这一项记为其取证瑕疵。**
- **异议编号目标**: **E-0174**
- **异议类型**: **UNSUPPORTED**
- **受影响事项**:
  1. **UX-C2 的实施落点与归属会改变，这是最要紧的一项。** 若案卷保留「形态已可挂载、只需调用方传 `point`」这一读法，判决会推断 UX-C2 是一次 **落在 `code-owner-chat-bubble` 边界内的调用方改动**。**实际上它必须先改 `BUILTIN_COMPONENTs/timeline/timeline.js`，即本 owner 的文件**（E-0236 / E-0237）。**这直接改变本案方案的边界归属、成本估计与验收面**（放开该门会让 `trace_chain.js` 中今天被抑制的自定义 point 元素一并出现，是一次需要验收的视觉变更，E-0239）。
  2. **`code-owner-chat-bubble` 接受条件 (ii) 的事实基础须重排。** 该条件为「今天没有任何形态可以挂载」。E-0174 判其不成立。**本 owner 的实测使双方都只对了一半**：形态确实存在（E-0174 对），但今天挂上去在本案关心的行上不会显示（E-0240），**故该条件在"可挂载"的字面上不成立、在"可用"的实质上成立**。**本 owner 请求 `SUMMARY` 按这个形状呈上，而不是按任一方的原表述。**
  3. **UX-V1 的机制表述会改变（但其结论不变）。** 若 E-0240 成立，本案关心的回合上有效状态编码数是 **0** 而非 1。
- **理由**: E-0174 的 **定位** 字段列出的全部位置为 `trace_chain.js:543-567` · `:1747` · `:1937-1959`，加一次 `grep -n "point:" src/COMPONENTs/chat-bubble/trace_chain.js`。**这四处全部在 `src/COMPONENTs/chat-bubble/` 内，没有一处触及 `timeline.js`。** 而"一个传入的 `point` 元素是否被渲染"完全由 `timeline.js:809-810` 的 `isPassThrough` 与 `:205` 的条件渲染决定，**该条一处都没有引。** 故它可以支撑「`point` 槽接受自定义元素」「`trace_chain.js` 已在六处传入」「memory_v2 未传」（三项均为代码事实，成立），**不能支撑「带宽不是不足」（渲染事实）。**

  **本 owner 记明这与本案已成立的第六条质疑同型**：`expert-ux` 对 E-0104 的质疑是「定位不含任何颜色信息，故不能支撑视觉差异」。**本条是同一条标准的对称适用：定位不含任何可见性信息，故不能支撑可渲染性。** 本 owner 使用与提出方相同的判据，非选择性适用。

---

#### S-#### | OBJECTION | code-owner-ui-primitives → E-0173

- **阶段**: 议案庭审
- **结论**: **E-0173 的定位全部在 `src/CONTAINERs/config/`，未触及 `timeline.js:756-762` 的 `tl` 构造，因而不能支撑其「据此」段的「trace chain 的点、线、标题、span、`detail` 按钮不随用户自定义调色板变化」这一 *一般命题*。** 该条的 **事实部分本 owner 完全确认且已独立复核**：`applySemanticPaletteToTheme` 的覆写清单确不含 `timeline`（E-0244 逐条枚举其返回对象顶层键）。**质疑只针对由该事实推出的射程。**
- **依据**: E-0244, E-0245, E-0235；本案 E-0173
- **不确定性**: **本 owner 明确记明：E-0173 的结论在本案 memory_v2 那一行上是对的。** 该行 status 恒为 `done` / `pending`，恰好全落在不跟随 highlight 的一侧（E-0245 完整性限制）。**故本异议若成立，不改变本案对现状的任何描述，只改变补救成本与补救的边界归属。** 若 `speaker-of-the-house` 或 `procedural-judge` 认为这不足以构成形式要件第 3 项（说明影响），本 owner 接受退回重排。
- **请求/下一步**: 依[证据规则第二节](../../../codex/lifecycle/evidence-rules.md)强制触发 `evidence-examiner` 审查。**补强责任在提出方（`expert-ux`）。本 owner 不主张该证据为假**，只主张其「据此」段的射程超出其定位所能支撑的范围。
- **异议编号目标**: **E-0173**
- **异议类型**: **UNSUPPORTED**
- **受影响事项**:
  1. **补救成本与边界归属会改变。** 若案卷保留「整条 trace chain 与用户主题系统之间没有通道」这一读法，任何"让状态色跟随主题"的处方都会被估成 **需要修改 `applySemanticPaletteToTheme`**（`src/CONTAINERs/config/`，`code-owner-shared-arteries` 边界，跨 owner，且该函数被全仓消费）。**实际上通道已经存在并已被接过**：`theme.highlightColor`（由 `applySemanticPaletteToTheme:233` 从用户 accent 设置）经 `themeHighlightColor(theme)` 注入 `tl.highlightColor`（`timeline.js:759`），今天已驱动 `active` 点、`active` 线、`start` 点与 `loading` 点（E-0245）。**`done` 之所以不跟随，只因 `pointDoneColor` 挡在 `:46` 的 `??` 链首位** —— **即一个 JSON 单键的删除，落在本 owner 边界内，可逆，零跨 owner 依赖**（E-0235 / 「建议处置」第二项）。
  2. **`f7d26a42` 的存在改变对"有意排除还是遗漏"的判断。** 本庭对本 owner 的第一问之 3 直接问了这一点。**若通道不存在，答案倾向"有意排除"；既然通道存在、且 2026-06-01 有人刻意把 timeline 往上接（删掉两处硬编码 `pointColor`）却漏了 `pointDoneColor`，答案是"一次未完成的迁移"。** 这一区分决定本案是"新增一项主题集成工作"还是"补完一次已开工的迁移"。
- **理由**: E-0173 的 **定位** 字段列出的全部位置为 `theme_semantic.js:211-303` · `container.js:157-171` · 一次 `grep -rn "timeline:" src/`。**三处全部在 `src/CONTAINERs/config/` 或为一次否定性 `grep`，没有一处读过 `timeline.js` 如何构造它的调色对象。** 而 `timeline.js:756-762` 在展开 `theme?.timeline` 之后 **显式追加了一个不来自该 JSON 的键**：`highlightColor: themeHighlightColor(theme)`。**该键正是用户自定义 accent 的落点**（`applySemanticPaletteToTheme:233` `highlightColor: accent`，E-0244）。故该条可以支撑「`theme.timeline` 的十个 JSON 键不被语义 palette 覆写」（成立，本 owner 确认），**不能支撑「trace chain 不跟随用户自定义调色板」（一般命题，射程过宽）。**

  **本 owner 同时声明不质疑 E-0176 与 E-0177** —— 二者所依据的 `semantic_tokens.js` 同在本边界内，本 owner 本轮未作全量复核，**故不表态；不表态不构成认可，也不构成质疑。** 若本庭需要对 E-0177 的全 9 预设扫描作独立复核，本 owner 认为正确的做法是扩 `contrast_window.test.js`（E-0249）跑一遍，而不是再手算一次。

### E-0250 | repository | 自证类
- **来源定位**: **`E-0020` 核心否定事实的独立复跑，与一项加测。** `pupu:electron/**`，PuPu HEAD `b2385d5dc7951887b6aeebd4001d17b4cd78af83`
- **取得方式**（可原样粘贴）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  git rev-parse HEAD                                    # -> b2385d5dc7951887b6aeebd4001d17b4cd78af83
  git status --porcelain -- electron/ src/ | wc -l      # -> 0
  # E-0020 原条目的三标识符检索
  grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle" electron | wc -l
                                                        # -> 0
  # 传唤书的扩展检索（加 sanitizeMessages）
  grep -rn "sanitizeMemoryV2TraceBundle\|memory_v2_trace_presenter\|sanitizeMessages" electron | wc -l
                                                        # -> 0
  # 本席加测：electron/ 全域任意 sanitiz*，及其落点
  grep -rni "sanitiz" electron | wc -l                  # -> 27
  grep -rli "sanitiz" electron
    # -> electron/tests/main/unchain_provider_secret_byte_equivalence.test.cjs
    #    electron/tests/main/settings_storage_computer_use.test.cjs
    #    electron/tests/main/settings_storage_toolkit_prefs.test.cjs
    #    electron/tests/main/settings_storage_handlers.test.cjs
    #    electron/main/services/settings_storage/service.js
    #    electron/main/services/runtime/skill_repo_download.js
    #    electron/main/services/memory_vault/service.js
  grep -rni "sanitiz" electron/main/services/chat_storage/   # -> 无输出（0）
  ```
- **内容**: `E-0020` 的 **关键否定事实** 逐字复现：脱敏器与 presenter 在 `electron/` 全域 import 计数为 **0**，扩展检索亦为 **0**。**加测结果**：`electron/` 内 27 处 `sanitiz` 命中 **全部落在 `settings_storage` / `runtime/skill_repo_download` / `memory_vault` 及其测试**，`electron/main/services/chat_storage/` 内为 **0** —— **消息写入路径上不存在任何形态的脱敏器**，不止是不存在这一个。取证 revision 与 `E-0020` 自称一致，产品树洁净，**时效性成立**。
- **支持/反驳**: **支持** `E-0020` 的关键否定事实与其命题（1）；支持 S-0055 真实性与相关性两节。
- **完整性限制**: 字面量检索，**以变量或动态拼接构造的标识符一律漏掉**，故「0」的准确措辞是「在字面量检索范围内为 0」。未跑运行时。

### E-0251 | repository | 自证类
- **来源定位**: **`replaceMessages` 三个调用点的分支归属，逐行实测。** `pupu:electron/main/services/chat_storage/service.js`
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '300,320p' electron/main/services/chat_storage/service.js
  sed -n '334,342p;375,400p' electron/main/services/chat_storage/service.js
  sed -n '486,545p'  electron/main/services/chat_storage/service.js
  ```
- **内容**（源码原文，行号实测）:
  ```js
  // :311-314
  const applyPutMessages = (op) => {
    if (!op.chatId) throw new Error("put_messages: missing chatId");
    replaceMessages(op.chatId, op.messages);   // :313
  };

  // :334-388  applyImportStore
  const applyImportStore = (op) => {
    const store = assertRecognizableLegacyChatStore(op.store);   // :339
    ...
      replaceMessages(chatId, messages);       // :386
    }
  };

  // :390-396
  const OP_APPLIERS = {
    put_tree_meta: applyPutTreeMeta,
    put_chat_meta: applyPutChatMeta,
    put_messages: applyPutMessages,            // :393
    delete_chats: applyDeleteChats,
    import_store: applyImportStore,            // :395
  };
  ```
  `migrateLegacyFileIfNeeded` 实测：声明 `:494` · `if (!isDbEmpty()) return;` `:495` · `if (!fs.existsSync(legacyFilePath)) return;` `:496` · `assertRecognizableLegacyChatStore(store)` `:512` · `applyOps([{ type: "import_store", store }])` `:521` · `fs.renameSync(legacyFilePath, legacyFilePath + MIGRATED_SUFFIX)` `:522` · 闭合 `:523`。派发在 `:419 const apply = op && OP_APPLIERS[op.type];`。
- **支持/反驳**: **反驳** `E-0020` **来源定位** 第二项「同文件 `:313` —— `import_store` 分支调 `replaceMessages`」—— `:313` 属 `put_messages`，`import_store` 的调用点是 `:386`，**映射与之相反**。**独立佐证** `E-0211` 与 `S-0051` OBJECTION-A 的同一测定（本席未参考其取证过程，先测后读）。**不反驳** `E-0020` 的其他任何内容；`:280` 与 `:494-522` 两项经复核属实。
- **完整性限制**: 静态读取，**未跑运行时**，未构造一次真实的 `applyOps` 调用。未复核 `assertRecognizableLegacyChatStore` 的校验内容，只测定其调用点位置。

### E-0252 | repository | 自证类
- **来源定位**: **`E-0020` 取得方式栏两条检索的逐字复跑。** `pupu:electron/` · `pupu:src/`
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "replaceMessages" electron src
    # -> electron/main/services/chat_storage/service.js:280:  const replaceMessages = (chatId, messages) => {
    #    electron/main/services/chat_storage/service.js:313:    replaceMessages(op.chatId, op.messages);
    #    electron/main/services/chat_storage/service.js:386:      replaceMessages(chatId, messages);
  grep -rn "replaceMessages" electron src | wc -l        # -> 3
  # 本席加测：INSERT 是否真的唯一（不止于 chat_storage 目录，取 electron/ 全域）
  grep -rn "INSERT INTO messages" electron/
    # -> electron/main/services/chat_storage/service.js:283:      "INSERT INTO messages(chat_id, ord, payload) VALUES (?, ?, ?)",
  ```
  `replaceMessages` 本体（`:280-289`）：`DELETE FROM messages WHERE chat_id = ?` 后逐条 `INSERT INTO messages(chat_id, ord, payload)`，`payload = toJson(list[ord])`。
- **内容**: **3 处，行号与 `E-0020` 所列 `:280` / `:313` / `:386` 逐一吻合。** 该栏 **本身准确** —— `E-0020` 知道 `:386` 存在，误的只是哪一个对应哪个 op type。**加测确认**：`:283` 是 **`electron/` 全域唯一** 的 `INSERT INTO messages`（射程比 `E-0160` / `E-0213` 所述的「`chat_storage/*.js` 内唯一」更宽），故两条分支 **必然汇入同一条裸 INSERT**，无第三条旁路。
- **支持/反驳**: **支持** `E-0020` 取得方式栏第二条检索的准确性；**支持** S-0055 关于「误标交换的是两个在命题（1）下无差别的名字」的相关性判定。
- **完整性限制**: `replaceMessages` 一项只覆盖该标识符本身。`INSERT INTO messages` 为字面量检索，**以模板串或动态拼接构造的 SQL 一律漏掉**。**未跑运行时**，未观察一条真实落盘的行。

### E-0253 | repository | 自证类
- **来源定位**: **哪一条才是常规写入路径 —— 本席依传唤书纪律一自行测定，未采信任何一方陈述。** `pupu:src/SERVICEs/chat_storage/chat_storage_store.js`
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "hasIpcBackend\|queueOpsForWrite\|put_messages\|persist(" src/SERVICEs/chat_storage/chat_storage_store.js
  sed -n '55,62p;255,290p;860,890p' src/SERVICEs/chat_storage/chat_storage_store.js
  ```
- **内容**: `:57 const hasIpcBackend = () => typeof window !== "undefined" && !!window.chatStorageAPI;`。`writeStore` 在 `:867 if (hasIpcBackend()) {` 分支内调 `:871 queueOpsForWrite(prevStore, store, declared)` 后 `return store`，**不调 `storageBackend.persist`**；`queueOpsForWrite` 在 `:618` 产出 `ops.push({ type: "put_messages", chatId, messages })`。三个 `persist` 调用点：`:265` 与 `:884` 均落在 `!hasIpcBackend()` 分支（jsdom / 纯 web fallback），`:283` 为 `if (!bootstrap)` 空库 seeding。**即：Electron 构建下每一次消息持久化走 `put_messages` → `service.js:313` → `replaceMessages` → 裸 INSERT，该路径每回合执行。** 另测：`sanitizeMessages` 在 `src` 非测试代码中的外部调用点为 `chat_storage_store.js:247` · `:1191` · `:1466` · `:1626` · `:2140`，**全部在 store mutator / loader 内，无一在 `persist` 或 IPC 写出路径上**。
- **支持/反驳**: **支持** S-0055 相关性节「命题（2）为假反而加强命题（1）」的方向性判定。**不评估** `E-0196` —— 该条由另一 instance 并行审查，本席不涉。
- **完整性限制**: **静态分支结构判定，未在运行时观测 `hasIpcBackend()` 在打包应用中的返回值。** 若存在使其为假的 Electron 运行形态，`persist` 在该形态下即为常规路径 —— **该情形只增加未过滤入口，不减少**，不改变本条结论方向。

### E-0254 | repository | 自证类
- **来源定位**: **`import_store` 的第二个派发点，与两条分支的校验非对称。** `pupu:electron/main/services/chat_storage/service.js` · `pupu:electron/main/services/chat_storage/register_handlers.js` · `pupu:electron/preload/bridges/chat_storage_bridge.js`
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "replaceMessages\|OP_APPLIERS\|put_messages\|import_store" electron/main/services/chat_storage/*.js
  grep -rn "CHAT_STORAGE\.\(WRITE\|APPLY_OPS\|APPLY_OPS_SYNC\)" electron/main electron/preload
  ```
- **内容**: `applyOps([{ type: "import_store", store }])` 有 **两个** 调用点，非一个：
  - `:521` —— `migrateLegacyFileIfNeeded` 内，受 `:495 isDbEmpty()` + `:496 fs.existsSync` 约束，成功后源文件改名，**该函数至多一次**（`E-0020` 此项属实）
  - `:541` —— `write(store)`，注释自陈 `// Legacy-compat entry point for the renderer localStorage→IPC migration path (WRITE channel): whole-store import.`，**无 `isDbEmpty()` 约束**

  `WRITE` 为活的 IPC channel：`register_handlers.js:73 ipcMain.on(CHANNELS.CHAT_STORAGE.WRITE, ...)`，preload 侧 `chat_storage_bridge.js:29 ipcRenderer.sendSync(CHANNELS.CHAT_STORAGE.WRITE, payload)`；`APPLY_OPS`（`:65` / `:48`）与 `APPLY_OPS_SYNC`（`:69` / `:56`）同为已注册 channel。**校验非对称**：`applyPutMessages` 仅 `if (!op.chatId) throw`；`applyImportStore` 在首次 DELETE 前调 `assertRecognizableLegacyChatStore(op.store)`（`:339`），`migrateLegacyFileIfNeeded` 另在 `:512` 再调一次。
- **支持/反驳**: **反驳** `E-0020` 命题（2）中「一次性」这一限定对 `import_store` 这一 op type 的普适性 —— 该限定只对 `migrateLegacyFileIfNeeded` 成立。**支持** S-0055 相关性节命题（2）的第二条独立理由。
- **完整性限制**: 只测定 channel 的 **注册与桥接存在性**，**未追** 渲染进程侧今日是否仍有代码实际调用 `WRITE`，亦未跑运行时。**本席不就该通路该不该处置表态**（[证据规则 五](../../../codex/lifecycle/evidence-rules.md)）。

### E-0261 | general | 自证类
**标题**：`persist` 在两种构建下的可达性实测 —— `ipcApi.write(store)` 全代码库唯一可达来源是空库 seeding
**提出方**：`evidence-examiner`（随 S-0056 提交）
**观察时点与 revision**：2026-08-08；PuPu `b2385d5dc7951887b6aeebd4001d17b4cd78af83`，`git status --porcelain src/ electron/` 输出为空
**定位与取得方式**（逐段可复跑）：
```bash
cd /Users/red/Desktop/GITRepo/PuPu
git rev-parse HEAD && git status --porcelain src/ electron/
sed -n '57,58p'   src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '173,176p' src/SERVICEs/chat_storage/chat_storage_backend.js
sed -n '266,272p' src/SERVICEs/chat_storage/chat_storage_backend.js
grep -rn "storageBackend.persist(" src/ --include="*.js" | grep -v "\.test\."
sed -n '260,265p'  src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '280,284p'  src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '862,888p'  src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '250,258p'  src/SERVICEs/chat_storage/chat_storage_backend.js
```
**内容**：
1. **两个条件同源**：`chat_storage_store.js:57-58` `hasIpcBackend = () => typeof window !== "undefined" && !!window.chatStorageAPI`；`chat_storage_backend.js:173-176` `ipcApi = ... window.chatStorageAPI ? window.chatStorageAPI : null`。**同一个 `window.chatStorageAPI`**，不存在二者取值相反的构建。
2. **`writeStore`(`:862`) 的 IPC 分支不经 `persist`**：`:867 if (hasIpcBackend())` → `:871 queueOpsForWrite(...)` → `:872 schedulePersistAndEmit(...)` → **`:877 return store;`**。`storageBackend.persist` 出现在 `:884`，位于该 `return` 之后的 fallback 分支。
3. **`storageBackend.persist(` 非测试调用点恰三处，分支归属**：`store.js:265`（在 `:260 if (!hasIpcBackend())` 内）· `store.js:283`（IPC 分支，`:280 if (!bootstrap)` **空库 seeding**）· `store.js:884`（`writeStore` 非 IPC fallback 分支）。**IPC 构建下恰一处可达：`:283`。**
4. **被 `E-0196` 标注为「常规持久化路径」的那一行是 `persist` 内的 `ipcApi.write(store)`（`chat_storage_backend.js:268`）。fallback 构建下 `ipcApi === null`，`persist` 取另一分支 `:271 writeLegacyToLocalStorage(store)`。故该行在全代码库只有一个可达来源：`store.js:283`。两种构建下它都不是逐次写入路径。**
5. **`CHAT_STORAGE.WRITE` 在 IPC 构建下有第二个 renderer 来源，且不经 `persist`**：`chat_storage_backend.js:256` 在 legacy localStorage→IPC 一次性迁移中直接 `ipcApi.write(legacy)`（受 `MIGRATION_MARKER_KEY` 与 `readLegacyFromLocalStorage()` 双重守卫）。**同为一次性，非逐次写入。**
**据此成立**：`persist() → ipcApi.write() → CHAT_STORAGE.WRITE → service.write() → import_store` 这条链路 **在任何构建下都不是常规（逐次）持久化路径**；在 IPC 构建下它只从空库 seeding 一处可达。
**支持/反驳**：**反驳** `E-0196` 内容 · 第一项 的「常规持久化路径」定性及其加粗导出句；**射程宽于** S-0051 `OBJECTION-B`（后者限定于 Electron 构建，本条测得两种构建均不成立）；**不触及** `E-0196` 的第二项与核心否定式结论。
**完整性限制**：
1. **静态可达性判定，非运行时观察。** 未起应用、未跑真实回合、未做故障注入。
2. **字面量 `grep`。** 排除的是 **词法上** 的其余调用点；任何以间接引用（`storageBackend["persist"]`、解构转手、动态属性）调用 `persist` 的写法会被漏掉。**「一处可达」是字面量判定，与 `E-0196` 完整性限制 4 同一失败类。**
3. **越界只读**：`electron/**` 属 `code-owner-electron`，`src/SERVICEs/chat_storage/**` 属 `code-owner-shared-arteries`。**本条对二者的改法不表态，不请求任何处置。**
4. **时效性**：观察时点如上；闭庭若晚于此且产品树有变动，须重取。

### E-0262 | general | 自证类
**标题**：常规写入路径实测 —— `put_messages` 的校验面与 `assertRecognizableLegacyChatStore` 的实际射程
**提出方**：`evidence-examiner`（随 S-0056 提交）
**观察时点与 revision**：同 E-0250
**定位与取得方式**（逐段可复跑）：
```bash
cd /Users/red/Desktop/GITRepo/PuPu
sed -n '822,848p' src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '609,625p' src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '311,314p' electron/main/services/chat_storage/service.js
sed -n '280,289p' electron/main/services/chat_storage/service.js
sed -n '334,340p' electron/main/services/chat_storage/service.js
sed -n '390,396p' electron/main/services/chat_storage/service.js
sed -n '112,160p' electron/main/services/chat_storage/service.js
```
**内容**：
1. **renderer 侧产出的 op 类型全集**：`delete_chats`(`store.js:612`) · `put_chat_meta`(`:615`) · `put_messages`(`:618`) · `put_tree_meta`(`:621`)。**`import_store` 不在其中 —— renderer 从不产出它。**
2. **`queueOpsForWrite`(`:822`) 于 `:843-847` 把 `nextStore.chatsById[chatId].messages` 原样放入 `pending.messagesByChatId`，不加过滤。**
3. **`applyPutMessages`(`service.js:311-314`) 全文只有一条校验**：`if (!op.chatId) throw new Error("put_messages: missing chatId")`，随即 `replaceMessages(op.chatId, op.messages)`。
4. **`replaceMessages`(`:280-289`)**：`DELETE FROM messages WHERE chat_id = ?` 后逐条 `INSERT INTO messages(chat_id, ord, payload) VALUES (?,?,?)`，payload 为 `toJson(list[ord])`。**对消息对象无任何校验或过滤。**
5. **`applyImportStore`(`:334`) 于 `:339` 先跑 `assertRecognizableLegacyChatStore(op.store)`；`applyPutMessages` 不跑。** 故 `put_messages` 路径的校验 **确实少于** `import_store` 路径。
6. **`assertRecognizableLegacyChatStore`(`:112-160`) 的实际射程**：校验 `schemaVersion ∈ {1,2}` · `updatedAt` 有限 · `chatsById` 为 plain object 且非空 · 每个 `chatId` 合法且 `chat.id === chatId` 且 `Array.isArray(chat.messages)` · `activeChatId` 为字符串且存在于 `chatsById` · v1 另需 `chatOrder` 为数组。**它不检查任何消息对象内部的键。**
**据此成立**：(i) 常规、每回合执行的持久化链路是 `writeStore → queueOpsForWrite → put_messages → applyPutMessages → replaceMessages` 裸 `INSERT`；(ii) 该链路的校验面严格小于 `import_store` 链路；(iii) **即便在 `import_store` 链路上，其唯一的 guard 也不作消息级键面过滤** —— 故 `E-0196` 「该边界不施加任何脱敏或键面过滤」一句 **在字面上仍然成立**。
**支持/反驳**：**支持** `E-0196` 的核心否定式结论（持久化边界零脱敏），**并将其射程扩至 `put_messages`**；**反驳** `E-0196` 内容 · 第一项 的「常规」定性（与 E-0250 同向）。
**完整性限制**：
1. **静态读取，非运行时观察。** 未起应用，未验证任一 op 在真实回合中实际被发出。
2. **未核实上游不变量。** 「一个消息对象能否不经脱敏调用点进入 `store.chatsById[*].messages`」**本条不主张任何一侧**，该问属 `code-owner-shared-arteries` 边界。**未核实即不主张。**
3. **越界只读**：同 E-0250 第 3 项。
4. **时效性**：同 E-0250 第 4 项。

### E-0263 | general | 自证类
**标题**：脱敏面实测 —— 5 个直接调用点的性质分布，与经 `sanitizeChatSession` 的 9 处间接触达
**提出方**：`evidence-examiner`（随 S-0056 提交）
**观察时点与 revision**：同 E-0250
**定位与取得方式**（逐段可复跑）：
```bash
cd /Users/red/Desktop/GITRepo/PuPu
grep -rn "sanitizeMessages" src/ | grep -v "\.test\."
grep -rn "sanitizeMessages\|sanitizeMessage(" electron/ --include="*.js" --include="*.cjs" | grep -v "\.test\." ; echo "exit=$?"
grep -rn "sanitize" src/SERVICEs/chat_storage/chat_storage_backend.js ; echo "exit=$?"
grep -rn "sanitizeChatSession" src/ --include="*.js" | grep -v "\.test\."
sed -n '242,249p'   src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '1176,1192p' src/SERVICEs/chat_storage/chat_storage_store.js
sed -n '804,812p'   src/SERVICEs/chat_storage/chat_storage_sanitize.js
```
**内容**：
1. **`sanitizeMessages` 非测试命中全集**：`chat_storage_sanitize.js:752`(定义) · `:808`(内部，位于 **`sanitizeChatSession`** 体内) · `chat_storage_store.js:24`(import) · **`:247` `:1191` `:1466` `:1626` `:2140`（5 个直接调用点）**。
2. **`electron/**` 命中 0**（`grep` 退出码 1）；**`chat_storage_backend.js` 中 `sanitize` 命中 0**（退出码 1）。
3. **5 个直接调用点的性质分布**：`:1466`(`chat_create_with_messages`) · `:1626`(`tree_duplicate_subtree`) · `:2140`(`setChatMessages`) 在 **写路径 mutator** 内；**`:1191` 在一个 *读访问器* 内**（`readStore` 后未命中则 `storageBackend.readMessages(chatId)` 并 `return sanitizeMessages(loaded)`，**不写 store**）；**`:247` 在 `ensureChatMessagesLoadedInStore` 内**，其源码注释明示「hydration REPLACES the chat object … but is memory-only — it is deliberately NOT named in dirty chatIds / ops, since nothing persisted changed」。
4. **间接触达（`sanitizeChatSession` → `:808 sanitizeMessages`）另有 9 处**：`chat_storage_store.js:1357` `:1471` `:1631` `:1992` `:1997` `:2489`；`chat_storage_migrate.js:153` `:255`（落在 `normalizeStore` 上，**每次 bootstrap 读都执行**）；`chat_storage_sanitize.js:919`。
5. **代码库中不存在名为 `sanitizeChat` 的函数**；`E-0196` 所称「`:808 sanitizeChat` 内部调用」的实际函数名是 `sanitizeChatSession`（行号对，函数名错）。
**据此成立**：(i) **脱敏在 `electron/**` 与 renderer backend 上完全缺席** —— `E-0196` 的核心否定式结论 **成立**；(ii) **5 是下界**，有效脱敏面至少 14 处触达，且含读/规范化路径 —— `E-0196` 完整性限制 4 的自陈 **诚实且必要**；(iii) 「5 个全部在 store mutator 内」**不准**，其中 2 处不是 mutator。**(ii)(iii) 两处不精确的方向均对该证据自身不利，不构成夸大。**
**支持/反驳**：**支持** `E-0196` 内容 · 第二项与核心否定式结论；**收窄** 其「全部在 store mutator 内」与「5 个」两处措辞。
**完整性限制**：
1. **字面量 `grep`，与 `E-0196` 完整性限制 4 同一失败类。** 任何以别名 / 解构 / 动态属性转手的调用会被漏掉；**14 处触达为下界，不是全集。**
2. **本条不主张该脱敏面是否充分，亦不主张是否存在绕过它的通路。** 那需要枚举全部 mutator 的入参来源，属 `code-owner-shared-arteries` 边界，**本条未核实即不主张。**
3. **越界只读**：同 E-0250 第 3 项。
4. **时效性**：同 E-0250 第 4 项。

### E-0255 | repository | 自证类
- **来源定位**: **`timeline.js` 的可见性门，本席作为第三方独立复测；并由此导出圆点渲染的充要条件。**
  ```js
  // src/BUILTIN_COMPONENTs/timeline/timeline.js:806-810
  const isFirst = i === 0;
  const isLast = i === items.length - 1;
  const isActive = (item.status ?? "pending") === "active";
  const isPreset = item.point === "start" || item.point === "end";
  const isPassThrough = !isFirst && !isLast && !isActive && !isPreset;
  ```
  ```js
  // 同文件 :204-205
  {/* point — hidden for pass-through nodes */}
  {!isPassThrough && (
  ```
  - **`isPassThrough` 的全部出现（本席检索）**：`:124`（`TimelineNode` prop 声明）· `:198`（顶线段高度）· `:205`（点的条件渲染）· `:225`（底线段起点）· `:838`（`Timeline` 传入 prop）。**无第二个赋值点。**
  - **`pointEl` 的解析（`:140-152`）**：`:151` `if (point != null && typeof point !== "string") return point;` —— **自定义元素在此被正确解析出来**；`:152` `return <DotDefault status={status} tl={tl} />;`。**「落 `DotDefault`」在 `:152` 严格成立，与是否被挂载无关。**
  - **本席导出的机械命题**：**一个 item 的圆点渲染，当且仅当 `isFirst || isLast || status === "active" || point ∈ {"start","end"}`。自定义 ReactNode 不在豁免之列。**
  - **代入本案那一行**：`trace_chain.js:1948-1949` `status: memoryV2Audit.status === "Unavailable" ? "pending" : "done"` —— **恒非 `"active"`**；若补传自定义 ReactNode，`isPreset` 恒假。**故补传 `point` 对该行可见性零影响。**
  - **另两处与该行位置有关的 push**：`:1961` Memory Agent 行（条件 `memoryV2Audit.agentRuns.length > 0`）；`:1990-2013` token summary 行（条件 `status === "done" && typeof bundle.consumed_tokens === "number" && bundle.consumed_tokens > 0`），且 `:2012` `point: "end"`。
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '200,212p;800,820p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "isPreset\|isPassThrough\|typeof point\|getPointRadius" src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '140,160p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '1937,1960p;1961,1968p;1990,2015p' src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **提交发言**: S-0060
- **支持/反驳**: **支撑本席对 `E-0174` 第 (ii) 项命题的 未验证 判定。** 与本案 E-0236 / E-0240 独立同向 —— **本条由本席自行跑出，未采信该两条的任何陈述**。**不反驳 `E-0174` 的任何行号、引文或数字。**
- **完整性限制**:
  1. **静态导出，未渲染任何 DOM、未观察任何真实圆点。** 「不可见」是推论不是观察。
  2. **`BranchSection` / `BranchNode`（`:440` 一带）为另一套渲染路径，本条未核其是否有同类门。** 本条只覆盖 `hasBranch` 为假时的 `TimelineNode` 路径；memory_v2 那一行的 push 无 `children` 键，故本席认为它走该路径，**但未穷举所有可能的调用形状**。
  3. **`hideTrack` 为真时整个 Track 列不渲染（`:181`），本条未追其真实调用方。**
  4. **`isPassThrough` 的「无第二个赋值点」为字面量检索结论**，以变量或对象展开传入的覆盖会被漏掉，故为 **下界**。
  5. **本条不主张该门是缺陷还是取舍** —— 那是 `code-owner-ui-primitives` 边界内的判断，[证据规则 第五节](../../../codex/lifecycle/evidence-rules.md)禁止本席表态。
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

---

### E-0256 | repository | 自证类
- **来源定位**: **`E-0174` 的七项真实性复核，全部属实；`#ef4444` 的对比度本席独立复算吻合。**
  - `trace_chain.js:543`（分节注释）· `:545-567`（`ErrorPoint` 定义本体）：引文中 `width:16` / `height:16` / `flexShrink:0` / `color:"#ef4444"` / `viewBox="0 0 24 24"` / `fill="currentColor"` / `width="16"` / `height="16"` **逐字相同**；`path` 的 `d` 实际全值为 `M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z`，**E-0174 的引文首尾逐字一致，中段 `...` 为显式省略。**
  - `grep -n "ErrorPoint"` 全文 **仅 3 处**：`:543` · `:545` · `:1747`。**即 `:1747` 为全仓唯一使用点**（E-0174 只称「已被实际使用」，实测更强）。
  - `:1742-1755` 该 push 的字面：`status: "done"`（`:1746`）· `point: <ErrorPoint />`（`:1747`）。
  - `:1937-1959` memory_v2 push 的键 **恰为** `key` / `title` / `span` / `status` / `unmountDetailsWhenClosed` / `details` —— **无 `point`**；区间端点精确（`:1937` `grouped.push({` → `:1959` `});`）。
  - `grep -n "point:"` 本席重跑，输出 **恰为** `:1059`(`AccentPoint`) `:1139`(`HammerPoint`) `:1459`(`SubagentPoint`) `:1529`(`SubagentPoint`) `:1726`(`toolPointEl`) `:1747`(`ErrorPoint`) `:1802`(`"loading"`) `:1824`(`"loading"`) `:1919`(`HammerPoint`) `:2012`(`"end"`) —— **与 E-0174 所抄逐行吻合。**
  - **计数**：内联 JSX 字面量 6 处；`toolPointEl` 为变量，其两处赋值 `:1632` `:1669` **均为 `<HammerPoint isDark={isDark} />`，恒为元素**，故 **非字符串 `point` 传值共 7 处**。
  - **对比度独立复算**：`#ef4444` on `#ffffff` = **3.7631**；on `#121212` = **4.9782**。**与 E-0174 所记 3.76 / 4.98 吻合。**
  - `1937 − 545 = 1392`，与「上方约 1400 行」相符。
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '543,570p;1740,1756p;1937,1960p' src/COMPONENTs/chat-bubble/trace_chain.js
  grep -n "ErrorPoint\|point:\|toolPointEl" src/COMPONENTs/chat-bubble/trace_chain.js
  python3 -c "…"   # WCAG 相对亮度公式，见本节抬头
  ```
- **提交发言**: S-0060
- **支持/反驳**: **支持 `E-0174` 的 真实性**（七项全部属实）；**支持其第 (i) 项命题**。**不支持亦不反驳其第 (ii) 项** —— 该项由 E-0255 测定。
- **完整性限制**:
  1. **`src/COMPONENTs/chat-bubble/**` 属 `code-owner-chat-bubble` 边界，本条为越界只读**，只出机械事实（行号、字面量、算术），**对该文件的任何取舍不表态**。
  2. **对比度为按公式计算的值，非仪器测量，未在任何显示器上目视。** **本条不评价该值是否「达标」或任何无障碍准则是否适用** —— 超出[证据规则 第五节](../../../codex/lifecycle/evidence-rules.md)所限的三问。
  3. 「唯一使用点」为 **字面量检索** 结论，以变量或动态构造引用的调用会被漏掉，故为 **下界**。
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

---

### E-0257 | repository | 自证类
- **来源定位**: **`E-0173` 的五项真实性复核，全部属实；并实测该条正文从未作出「有意排除 / 遗漏」的定性。**
  - `theme_semantic.js:211` = `export const applySemanticPaletteToTheme = (base, semantic, mode) => {`；`:303` = `};`（`:305` 为下一个 export `applySemanticCssVars`）。**区间端点精确到函数首尾。**
  - **返回对象顶层键（本席逐条枚举）**：`...base`(`:231`) · `semantic`(`:232`) · **`highlightColor: accent`(`:233`)** · `color` · `backgroundColor` · `foregroundColor` · `icon` · `font` · `input` · `select` · `modal` · `switch` · `...(deepTier ? { code, textfield, markdown } : {})`。**`timeline` 不在其中。** E-0173 所列十项 **全部命中，无一虚列**。
  - 入参 `semantic` 的解构清单（`:214-224`）：`accent` / `background` / `sidebar` / `surface` / `text` / `textMuted` / `border` / `success` / `warning` / `danger`。
  - `container.js:165` = `const themedBase = applySemanticPaletteToTheme(base, semantic, themeMode);`，落在 E-0173 所记 `:157-171` 区间内。
  - `grep -rn "timeline:" src/` → **0 行**（`wc -l` = 0）。
  - **对「有意排除 / 遗漏」定性的检索**：在 `evidence.md:2219-2224`（归档件）与 `.inbox/S-0027.md:266-272`（提交件）中检索「排除」「遗漏」「有意」「设计」—— **零命中**。**该条正文为中性的存在性陈述 + 一个一般命题，不含任何成因定性。**
  - **归档件与提交件比对**：两者 **逐字相同**，仅标题行强调标记由 `**E-0173 · …**` 改为 `### E-0173 · …`，该改动已由 `speaker-of-the-house` 在 `evidence.md:2154` 显式声明。**无篡改。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '211,245p;284,306p' src/CONTAINERs/config/theme_semantic.js
  sed -n '157,171p' src/CONTAINERs/config/container.js
  grep -rn "timeline:" src/ | wc -l
  # 案卷比对
  sed -n '2219,2224p' .claude/court/cases/0000-0005-2026-0807/evidence.md
  sed -n '266,272p' .claude/court/cases/0000-0005-2026-0807/.inbox/S-0027.md
  ```
- **提交发言**: S-0060
- **支持/反驳**: **支持 `E-0173` 的 真实性**（五项全部属实）；**支持其第 (i) 项命题**；**证成其第 (ii)-甲 项（「有意排除 / 单纯遗漏」）从未被该条主张** —— 故对该定性既非支持亦非反驳，而是 **未主张**。
- **完整性限制**:
  1. **`src/CONTAINERs/**` 属 `code-owner-shared-arteries` 边界，本条为越界只读**，只出机械事实（返回对象顶层键与入参解构清单），**对该文件的任何取舍不表态**。
  2. **「零命中」为字面量检索结论**，以变量或模板串构造的键名会被漏掉，故 `grep -rn "timeline:"` 的零是 **在字面量检索范围内为零**。
  3. **本条未追 `pupu_boot_palette` 的落盘形状**，只测该函数的入参与返回。
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

---

### E-0258 | repository | 自证类
- **来源定位**: **highlight 通道确实到达 timeline，且 trace chain 内确实存在跟随该通道的形态 —— 「整条 trace chain 不跟随用户自定义主题」有实测反例。**
  - **通道三段**：`theme_semantic.js:233` `highlightColor: accent` → `timeline.js:756-762` `const tl = useMemo(() => ({ ...(theme?.timeline ?? {}), highlightColor: themeHighlightColor(theme) }), [theme])` → `theme_highlight.js` `themeHighlightColor = (theme) => theme?.highlightColor || THEME_HIGHLIGHT_COLOR`（`THEME_HIGHLIGHT_COLOR = "#65c466"`）。
  - **PuPu 的 `theme.timeline` 已无 `pointColor`**：`grep -rn "pointDoneColor\|pointPendingColor\|pointColor" src/BUILTIN_COMPONENTs/theme/` → **仅 4 行**，`default_mini_theme.json:287` `:288`（light）与 `:603` `:604`（dark），**全为 `pointDoneColor` / `pointPendingColor`，无 `pointColor`**。
  - **跟随的路径**：`:44` `active` 点 `tl.pointColor ?? highlight` → **`highlight`** · `:38` `active` 线 `colorWithAlpha(highlight, 0.38)` · `:81` `DotStart` `tl.pointColor ?? tl.highlightColor` → **`highlight`** · `:148` `ArcSpinner`（`point:"loading"`）同。
  - **不跟随的路径**：`:46` `done` 点（`pointDoneColor` 截住）· `:47` `pending` 点 · `:36`/`:39` `done`/`pending` 线 · `:268` `titleColor` · `:327` `spanColor` · `:293` `seeDetailsColor`（即 `detail` 按钮）—— **全部因 JSON 内存在硬编码值而截在 `??` 链首位，不是因为通道不存在。**
  - **trace chain 确实产出跟随侧的形态**：`trace_chain.js` `status: "active"` 在 `:1528`（`resultFrame ? "done" : "active"`）· `:1801` · `:1823` · `:1980`（`memoryAgentActive ? "active" : "done"`）；`point: "loading"` 在 `:1802` · `:1824`；`point: "end"` 在 `:2012`。
  - **但本案那一行落在不跟随的一侧**：`:1948-1949` `status: memoryV2Audit.status === "Unavailable" ? "pending" : "done"` —— **恒为 `done` / `pending`**。
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '34,50p;76,86p;140,152p;754,765p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "seeDetailsColor\|titleColor\|spanColor" src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -rn "pointDoneColor\|pointPendingColor\|pointColor" src/BUILTIN_COMPONENTs/theme/
  sed -n '1,20p' src/CONTAINERs/config/theme_highlight.js
  grep -n 'status: "active"\|point: "loading"\|point: "end"' src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **提交发言**: S-0060
- **支持/反驳**: **支撑本席对 `E-0173` 第 (ii)-乙 项的 未验证 判定**（一般命题射程过宽）。**同时限定该判定**：E-0173 逐项列举中 **标题 / span / `detail` 按钮 三项无条件成立**，且 **在本案 memory_v2 那一行上五项全部成立**。**不反驳 E-0173 关于覆写清单的任何事实**（见 E-0257，已确认属实）。与本案 E-0244 / E-0245 独立同向 —— **本条由本席自行跑出，未采信该两条的任何陈述**。
- **完整性限制**:
  1. **静态读取，未渲染 DOM，未在任何真实主题下观察过任何一个圆点的实际颜色。**
  2. **本条不主张跟随侧的那几条路径在本案那一行上被走到** —— 实测恰好相反，该行全落在不跟随的一侧。
  3. **`:1528` 与 `:1980` 的 `status` 为条件表达式**，本条只记其字面可能取值含 `"active"`，**未追其运行时实际取值分布**。
  4. **本条不评价 `#65c466` 或任何取值的对比度是否达标**，亦不主张任何配色应当如何 —— 超出三问范围。
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

---

### E-0259 | repository | 自证类
- **来源定位**: **`E-0173` 与 `E-0174` 均无 `完整性限制` 字段，而同一发言内的 `E-0171` / `E-0172` 有 —— 故越界的第一层在证据本体内，不只在援用处。**
  - `evidence.md:2219-2224`（`E-0173`）字段序列：`证据类型` / `定位` / `内容` / `据此` / `支持/反驳`。**无 `完整性限制`。**
  - `evidence.md:2228-2252`（`E-0174`）字段序列：`证据类型` / `定位` / `内容` / `三件事据此成立` / `该形态的实测对比度` / `同时登记一处既有债` / `支持/反驳`。**无 `完整性限制`。**
  - **对照同一发言（S-0027）提交的 `E-0172`（`:2215`）确有该字段**，逐字为「为计算值非仪器测量；数字锚定在默认调色板上，用户自定义 `background` 后须重算」。
  - **据此成立的机械事实**：该字段既在提出方的工具箱内、也被其在同一轮内主动使用过；**故 `E-0173` / `E-0174` 缺该字段不是格式疏忽，是这两条确实未自陈任何边界。**
  - **具体到本次两条失效**：`E-0174` 的「三件事据此成立」第 1 项（`point` 槽是本仓既定的「这一项与众不同」的 **表达方式**）与 `E-0173` 的标题句（「**整条** trace chain 不跟随用户自定义主题」）**均为未加限定的一般命题，且均无 `完整性限制` 将其约束回定位所能支撑的范围。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu/.claude/court/cases/0000-0005-2026-0807
  sed -n '2194,2216p;2219,2224p;2228,2252p' evidence.md
  ```
- **提交发言**: S-0060
- **支持/反驳**: **支撑本席「越界第一层在证据本体内、补强责任落在证据本体而不只在援用处」的判定**（`请求/下一步` 6）。**不改变两条的 评估结论**（均为 未验证）。
- **完整性限制**:
  1. **本条只测字段的有无，不测「该字段若存在应当写什么」** —— 后者是提出方的判断。
  2. **本条不主张缺该字段构成程序瑕疵。** [发言协议](../../../codex/lifecycle/speech-protocol.md) 的公共信封五字段中 **不含 `完整性限制`**；该字段是 `evidence.md` 的证据元数据惯例。**本条只指出它在本案两条上的缺席改变了越界所在的层，不作程序定性 —— 那归 `speaker-of-the-house` 与 `codex`。**
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

---

### E-0260 | repository | 自证类
- **来源定位**: **`E-0173` 的援用处 UX-1 在转述覆写清单时漏掉了 `highlightColor` —— 而证据本体正确列出了它，且列在第一位。**
  - **证据本体**（`evidence.md:2222`）逐字：「`applySemanticPaletteToTheme` 的返回对象显式覆写 **`highlightColor`** / `color` / `backgroundColor` / `foregroundColor` / `icon` / `font` / `input` / `select` / `modal` / `switch`，以及 `deepTier` 分支下的 `code` / `textfield` / `markdown`。」—— **`highlightColor` 在首位。**
  - **援用处 UX-1**（`.inbox/S-0027.md:190`，第八节表格）逐字：「`applySemanticPaletteToTheme` 覆盖 icon / font / input / select / modal / switch / code / textfield / markdown，**不含 `timeline`**」—— **`highlightColor` / `color` / `backgroundColor` / `foregroundColor` 四项全部不在该转述内。**
  - **据此成立的机械事实**：**使 E-0173 一般命题失效的那个键，在证据本体内存在、在援用处消失。** 即本次的信息丢失发生在 **「证据 → 援用」这一跳**，不在取证。
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu/.claude/court/cases/0000-0005-2026-0807
  sed -n '2222p' evidence.md
  sed -n '190p' .inbox/S-0027.md
  ```
- **提交发言**: S-0060
- **支持/反驳**: **登记项，与 `请求/下一步` 4 配套。** 不改变两条的 评估结论；**与 E-0258 共同指出补强的最短路径**（读 `timeline.js:756-762` 一处即可判定）。
- **完整性限制**:
  1. **本条不读作者意图，不主张该省略是有意或疏忽。** 只出两段文字的并置。
  2. **本条不评价 UX-1 这一登记项本身是否应当保留或如何改写** —— 那是 `expert-ux` 与庭上的事，超出三问范围。
  3. 本条比对的是 `.inbox/S-0027.md` 的提交件；**若该发言在并入 `record.md` 时文字有变动，须以并入后的版本重取。**
- **验证历史**: S-0060 | 已验证（`evidence-examiner` 第三方独立复现）

### E-0270 | repository | 自证类
- **来源定位**: **承载 `unknownEvents` 的整个 `diagnostics` 对象确实越出 `runtime_events/` 边界，通路是 `E-0016` 的方法在结构上看不见的那一条。**
  - `pupu:src/SERVICEs/runtime_events/trace_chain_adapter.js:124` —— `diagnostics: activityTreeState.diagnostics || {},`，位于 `adaptActivityTreeToTraceChain`（定义 `:24`）返回体（`:106` 起）之内
  - 该函数的外部 import：`pupu:src/PAGEs/chat/hooks/use_chat_stream.js:20`，接线于 `:5868`（`adaptTree: adaptActivityTreeToTraceChain`）；另有 `pupu:src/COMPONENTs/ui-testing/runners/trace_chain_runner.js:17` 与 `pupu:src/COMPONENTs/ui-testing/scenarios/trace_chain_scenarios.test.js:4`
  - **为何 `E-0016` 必然漏掉它**：`trace_chain_adapter.js` 位于 `runtime_events/` 之内，被其过滤器 `grep -v "^src/SERVICEs/runtime_events/"` 排除；而下游 `use_chat_stream.js` 全文 `diagnostics` 命中数为 **0**，故其第二条腿亦判为「不读」
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rc "diagnostics" src/SERVICEs/runtime_events/ | grep -v ':0$'
    # trace_chain_adapter.js:1  activity_tree.js:12  event_store.js:7  event_store.test.js:6
  grep -n -B4 -A6 "diagnostics" src/SERVICEs/runtime_events/trace_chain_adapter.js
  grep -n "adaptActivityTreeToTraceChain" src/PAGEs/chat/hooks/use_chat_stream.js   # -> :20  :5868
  grep -n "export const adaptActivityTreeToTraceChain\|^  return {" \
    src/SERVICEs/runtime_events/trace_chain_adapter.js                              # -> :24  :15 :106
  ```
- **提交发言**: S-0066
- **支持/反驳**: **反驳** `E-0016` **支持/反驳 首项**「本条做了该排除」；**不反驳** 其 19 处内部命中枚举、两个外部消费者的 0 计数、`electron/` 的 0 计数（三项本席复核全真）。**支持** 本条对 `E-0016` 的 `相矛盾` 判定
- **完整性限制**: 1. **本条只证明该对象越过了边界，不证明有人读它。** 读取面由 `E-0271` 单独出证，两条不得合写。2. 字面 `grep`，未做语义分析；以变量键或解构别名读取该对象的写法本条会漏报。3. `trace_chain_adapter.js` 与 `use_chat_stream.js` 分属 `code-owner-shared-arteries` 与 `code-owner-chat-core`，**本条为越界只读，对二者的任何取舍不表态**
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 行号与命中数如上

### E-0271 | repository | 自证类
- **来源定位**: **`E-0016` 所载「全域负向结果」的真实读数。** 原样重跑其 取得方式 第三条命令
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "diagnostics" src | grep -v "^src/SERVICEs/runtime_events/" | wc -l     # -> 157
  grep -rn "diagnostics" src | grep -v "^src/SERVICEs/runtime_events/" \
    | sed 's/:.*//' | sort -u | wc -l                                              # -> 22 个文件
  grep -rn "\.diagnostics" src | grep -v "^src/SERVICEs/runtime_events/"           # 更窄读法，见下
  ```
  输出要点：22 个文件横跨 **8 个以上互不相关的子系统** —— `COMPONENTs/agents/pages/recipes_page/chip_editor.js`（chip 校验）· `COMPONENTs/settings/dev/components/mcp_registries_modal.js`（registry 校验）· `COMPONENTs/chat-bubble/memory_v2_journal_reload.js:179-180`（**读的是 journal 事件的 `event.payload.diagnostics`，后端载荷**）· `COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js:717`（同形 fixture）· `SERVICEs/api.unchain.js:1480,1499`（MCP store registry 校验）· `SERVICEs/custom_provider_store.js`（导入管线）· `SERVICEs/computer_use_preferences_sql.js:519` 与 `SERVICEs/toolkit_auto_approve_store.js:864`（**注释**）· `COMPONENTs/settings/model_providers/custom-providers/**`（`E-0016` 所述的那一族）。
  **更窄读法同样不成立**：`grep -rn "\.diagnostics" src` 的 `runtime_events/` 外命中仍含 `mcp_registries_modal.js:398` 与 `memory_v2_journal_reload.js:179-180`
- **提交发言**: S-0066
- **支持/反驳**: **反驳** `E-0016` 来源定位 第三项「无一例外落在 `custom-providers/**`」；**同时支持** `E-0016` 的 **结论** —— 本席逐处判定 157 行命中的归属，**无一处读取 trace-chain 对象上的 `diagnostics`**，故「`unknownEvents` 在产品运行时零读取 / 零展示 / 零告警」本席认为成立，**并把该结论改挂本条与 `E-0270`，不再挂 `E-0016`**
- **完整性限制**: 1. **字面 `grep`，非语义分析。** 以变量键或完全不出现该标识符的读取本条漏报，故「零读取」是 **强倾向而非零可能**，本席不主张为零。2. 只覆盖 `src/`；`electron/` 的 0 命中由 `E-0016` 第四项承载（本席复核为真）。3. **归属判定由本席逐处人工作出**，未经第二人复核
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 计数与归属如上

### E-0272 | repository | 自证类
- **来源定位**: **`replaceMessages` 三个引用点的 op 归属。** `pupu:electron/main/services/chat_storage/service.js`
  - `:280-289` `const replaceMessages = (chatId, messages) => { ... }` —— `DELETE FROM messages WHERE chat_id = ?` 后逐条 `INSERT INTO messages(chat_id, ord, payload) VALUES (?,?,?)`，写入值为 `toJson(list[ord])`，**无任何校验**
  - `:311` `const applyPutMessages = (op) => {` · `:312` `if (!op.chatId) throw new Error("put_messages: missing chatId");` · **`:313` `replaceMessages(op.chatId, op.messages);`**
  - `:386` `replaceMessages(chatId, messages);` —— 位于 `applyImportStore` 的 `for` 体内（`:380-388`）
  - `OP_APPLIERS`（`:390-396`）：`put_tree_meta` `:391` · `put_chat_meta` `:392` · **`put_messages: applyPutMessages` `:393`** · `delete_chats` `:394` · **`import_store: applyImportStore` `:395`**
  - `:494-496` `migrateLegacyFileIfNeeded` 及其双守卫 `if (!isDbEmpty()) return;` / `if (!fs.existsSync(legacyFilePath)) return;`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "replaceMessages" electron src        # -> 3 处，全在 service.js（:280 :313 :386）
  sed -n '280,289p;305,318p;380,396p;494,497p' electron/main/services/chat_storage/service.js
  grep -rn "memory_v2_trace_presenter\|chat_storage_sanitize\|sanitizeMemoryV2TraceBundle" electron | wc -l   # -> 0
  ```
- **提交发言**: S-0066
- **支持/反驳**: **反驳** `E-0020` 来源定位 第二项（`:313` = `import_store`）；**支持** `E-0020` 的其余全部内容与其核心结论；**独立佐证** `E-0015` 的 `未验证` 判定（绕过脱敏器的 op 不止一个）。**与 `code-owner-electron` S-0055 / `E-0211` 指向同一事实 —— 本条系本席独立取得，不构成对其陈述的采信**
- **完整性限制**: 1. `electron/main/**` 属 `code-owner-electron`，**本条为越界只读**，只出 op 归属这一机械事实，对该路径的任何取舍不表态。2. **未跑运行时**，未构造一次 `put_messages` 或 legacy 导入。3. **本条不主张这两条路径上实际写入过四个键中的任何一个** —— 通道存在不等于有货源，`E-0014` 与 `E-0017` 各自出证。4. 未穷举 `OP_APPLIERS` 之外是否另有写 `messages` 表的路径
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 行号与 `OP_APPLIERS` 映射如上

### E-0273 | probe | 自证类
- **来源定位**: **`E-0012` 的独立重建与重跑。** 本席未使用提出方的任何制品，全部从产品文件重建
  - `<scratchpad>/probe/baseline.mjs` —— `cp` 自 `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js`，sha256 `9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0`，**与产品文件相同**
  - `<scratchpad>/probe/whitelist_only.mjs` —— 在 `TOP_LEVEL_KEYS` 的 `"consolidation_jobs"`（`:68`）之后插入四个字符串；`diff` 输出恰为 `68a69,72`，**全文其余部分零差异，行数 416 → 420**
  - 运行环境 `node v24.18.0`（与 `E-0012` 所载相同）。输入基础形状取 `chats.db` 唯一真实 `memory_v2` 行的 14 个键（键集见 `E-0014` / `E-0275`），降级叠加层按 `E-0003` 的产端 kwarg 与默认错误码构造
- **取得方式**: `node <scratchpad>/probe/run.mjs`。输出：
  ```
  === A · BASELINE ===
    observed base, no degradation      status=Complete   errorCode=""  survivedWhitelist=[]
    ACTIVE degraded (mark_host_partial) status=Complete   errorCode=""  survivedWhitelist=[]
    SHADOW degraded                    status=Complete   errorCode=""  survivedWhitelist=[]
    CONTROL via persistence_*          status=Partial    errorCode="context_v2_persistence_failed"

  === B · WHITELIST-ONLY (+4 names) ===
    observed base, no degradation      status=Complete   errorCode=""  survivedWhitelist=[]
    ACTIVE degraded (mark_host_partial) status=Complete   errorCode=""
        survivedWhitelist=["unchain_context_status","unchain_context_error_code"]
    SHADOW degraded                    status=Complete   errorCode=""
        survivedWhitelist=["unchain_shadow_status","unchain_shadow_error_code"]
    CONTROL via persistence_*          status=Partial    errorCode="context_v2_persistence_failed"

  === C · mount gate: bundle containing ONLY the four keys ===
    baseline  isMemoryV2TraceBundle: false
    whitelist isMemoryV2TraceBundle: true

  === D · idempotence ===
    sanitize(sanitize(x)) === sanitize(x): true
    four keys after first sanitize: []
  ```
- **提交发言**: S-0066
- **支持/反驳**: **支持 `E-0012` 的 `已验证`** —— 四段输出与其呈堂记录 **逐行相同**，含其自标为「关键」的 B 行与 C 行。**本条不对共识 C1 的实体含义表态**，只报告复现结果
- **完整性限制**: 1. **与 `E-0012` 继承同一组限制**：降级叠加层仍是构造的，非真实 SSE 抓取；只覆盖 `mark_host_partial` 的两面与一个对照组，未穷举 `mark_graph_*_partial`；ESM 直接 import，未经 webpack / jest 管线。2. **本条是第二次独立复现，不是第二个独立样本** —— 它与 `E-0012` 读的是同一个产品文件。3. 我的输入值取自真实行的实际取值（`E-0014` 的 14 键），`E-0012` 声明为「按同类型重填」，**两者不逐字节相同；四段输出仍逐行一致，说明该结论对这一维不敏感**
- **验证历史**:
  - S-0066 | 已验证（由本席实跑，制品与命令均在 scratchpad，可复现）| 输出如上

### E-0274 | probe | 自证类
- **来源定位**: **`E-0013` 的独立重建与重跑。** `<scratchpad>/probe/derive_only.mjs` —— **`TOP_LEVEL_KEYS` 一项未动（仍 59 项）**，仅在 `sanitizeMemoryV2TraceBundle` 的 `return` 之前插入 9 行归一（`diff` 输出为 `131a132,140`），把 raw 的 `unchain_context_status` / `unchain_shadow_status` 及其错误码映射到已在白名单内的 `trace_status` / `persistence_error_code`
- **取得方式**: `node` 直接 import 两个变体对比。输出：
  ```
  === C · derive-only (TOP_LEVEL_KEYS UNCHANGED) ===
    healthy active turn   status=Complete  errorCode=""   persistedKeyCount=14  synthesizedKeys=[]
    ACTIVE degraded       status=Partial   errorCode="context_v2_persistence_failed"
                          persistedKeyCount=16  synthesizedKeys=["trace_status","persistence_error_code"]
    SHADOW degraded       status=Partial   errorCode="context_v2_shadow_persistence_failed"
                          persistedKeyCount=16  synthesizedKeys=["trace_status","persistence_error_code"]
  === reload stability ===
    live status (C)                          : Partial
    after-reload BASELINE reads C-written row: Partial "context_v2_persistence_failed"
  === forward/backward compat ===
    C-written key set subset of frozen 59    : true
  ```
- **提交发言**: S-0066
- **支持/反驳**: **支持 `E-0013` 的 `已验证`** —— 其三项可观察事实全部复现。**本条不主张应当选形状 C**，与 `E-0013` 同界
- **完整性限制**: 1. **一处值级差异**：我的映射保留产端取值，故 SHADOW 面得 `context_v2_shadow_persistence_failed`；`E-0013` 所载为 `context_v2_persistence_failed`（值亦被归一）。**两者都落在「形状 C」之内**，该证据 完整性限制 3 已自陈映射有损。**故本条复现的是形状 C 的存在性与前后向兼容性，不是任何具体映射规格。** 2. 与 `E-0013` 继承同一组限制（构造的叠加层、未经构建管线）。3. **本条不评价 C 的安全后果与同键异义代价** —— 前者属 `expert-security`，后者是判断不是观察
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 输出如上

### E-0275 | runtime-artifact | 须查类
- **来源定位**: **`E-0014` 的时效性复取。** 本机 `~/Library/Application Support/pupu/chats.db`，**先复制只读副本再查询，原库未触碰**
- **取得方式**:
  ```
  shasum -a 256 "$HOME/Library/Application Support/pupu/chats.db"
    # -> dffe8045b3f65676729a85045b12e1169aa793f7c4bdec4e49c4c11b0d7a812d
    #    与 S-0028 所载三方同一的摘要逐字节相同；活库 mtime 2026-08-08 10:19
  cp <db> <scratchpad>/chats_ro.db  &&  shasum -a 256 <copy>   # 同一摘要
  sqlite3 <copy> "SELECT COUNT(*) FROM chats;"     # -> 86
  sqlite3 <copy> "SELECT COUNT(*) FROM messages;"  # -> 532
  python3  # json.loads 每行 payload，只输出计数与顶层键名
  ```
  结果：`rows with meta.bundle = 90`；`bundle key histogram = {consumed_tokens:90, input_tokens:90, output_tokens:90, model:90, cache_read_input_tokens:31, cache_creation_input_tokens:31, memory_v2:1}`；`rows with parsed meta.bundle.memory_v2 = 1`，其 14 个顶层键与 `E-0014` 所列 **逐项相同**，`mode='active'` / `status=None` / `trace_status=None` / `journal_status=None`；四键各 **0** 行；`persistence_degraded` / `trace_status` 各 **0**；`LIKE '%memory_v2%'` 初筛 **2** 行；**532 条 payload 全部可解析，0 条跳过**
- **提交发言**: S-0066
- **支持/反驳**: **支持 `E-0014` 在承重复核中的 `已验证`**，并回答其时效性一问：**该库自 S-0028 观察至今字节未动**
- **完整性限制**: 1. **须查类，无保管链。** 我测得的是「至今未变」，**不是「不会变」**；`E-0014` 的 完整性限制 1「不得据单次观察推断稳定状态」**一字不改地继续适用**。2. **n=1 且是开发者本机，不得外推到装机面** —— 我与提出方查的是同一台机器的同一份库，**这不构成第二个独立样本**。3. **S-0028 所作的「空转」限定本席维持**：该样本里不存在一个可能产出这四个键的回合，故此次观察对「sanitize 剥离」假说的分辨力接近零。4. **未导出任何消息内容**，只取聚合计数、键名与那一条 `memory_v2` 对象的标量配置/遥测枚举
- **验证历史**:
  - S-0066 | 已验证（由本席实跑，只读副本）| 数字如上

### E-0276 | runtime-artifact | 须查类
- **来源定位**: **`E-0018` 三份制品的时效性复取，三项 mtime 与取值全部未变**
  - `/Applications/PuPu.app/Contents/Resources/app.asar` —— mtime `2026-07-31 16:51`，**434,961,454 B**；`enable_memory_v2` **0** 命中；对照组 `enable_theme_color_customization` **5**、`enable_user_access_to_agents` **7**
  - `<pupu>/build/build_feature_flags.json` —— mtime `2026-08-03 22:23`；`enable_memory_v2 = false`；`_pupu_memory_v2_release.sidecar_environment` = `{PUPU_FEATURE_MEMORY_V2:'off', PUPU_MEMORY_V2_MODE:'off', PUPU_MEMORY_V2_CANARY_PERCENT:'5', PUPU_MEMORY_V2_READ_ONLY_DEGRADED:'0', PUPU_CONTEXT_V2_STORE_OWNER:'off'}`
  - `<pupu>/.local/build_feature_flags.snapshot.json` —— mtime `2026-08-04 17:20`；`enable_memory_v2 = true`
  - `git check-ignore -v` → `.gitignore:20:/.local/` 与 `.gitignore:51:build/`，**两份均不入库**
- **取得方式**: `ls -la` · `LC_ALL=C grep -a -c` · `python3 -c "json.load(...)"` · `git check-ignore -v`，全部只读
- **提交发言**: S-0066
- **支持/反驳**: **支持 `E-0018` 在承重复核中的 `已验证`**，并回答其时效性一问：三份制品自 S-0029 复核至今未变；**支持** `E-0018` 独立承重的那一层（**发布包 flag 取值在仓库里不可复现** —— 三份制品互不一致、两份不入库无历史）
- **完整性限制**: 1. **须查类，无保管链**，三份均为本机文件；`.local/` 快照会被「在 dev 打开 Settings→Dev 页」这一副作用覆盖。**不得据其推断任何已分发包的状态。** 2. **本席未跑 `node ./scripts/build-web.cjs --print-flags`** —— 传唤书禁止触发构建，故 `E-0018` 的这一项 **本席不作复现声明**。3. **S-0029 所测的两条射程限制本席维持且未重测**：该 asar 为 adhoc 签名、可能不是分发包；且它不覆盖 Python sidecar。4. `grep -a` 于 asar 是字面扫描，对照组命中证明方法有效但不排除压缩 / 分块形式
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 取值与 mtime 如上

### E-0277 | repository | 自证类
- **来源定位**: **对 S-0065 第二节全局时效性测量的独立抽验 —— 三项全中，且其中一项本席测得比所述更强**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  git log -1 --format='%H'                       # -> b2385d5dc7951887b6aeebd4001d17b4cd78af83
  git status --porcelain -- src electron unchain_runtime public package.json package-lock.json | wc -l   # -> 0
  git status --porcelain | grep -v '\.claude/'   # -> 零输出（全部脏改动无一在 .claude/ 之外）
  shasum -a 256 src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
    # -> 9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0
  cd /Users/red/Desktop/GITRepo/unchain
  git log -1 --format='%H'                       # -> a4e69f413c449c5768433ba4dddc5b60b8146991
  git status --porcelain                         # -> 空
  ```
- **提交发言**: S-0066
- **支持/反驳**: **支持** S-0065 第二节的测量与 `E-0001` / `E-0010` / `E-0190` 各次时效性复核；**限定其效力**：该测量只回答「现在还是不是这样」，**不回答「当时是不是这样」**，而本轮四条未通过条目 **全部栽在后一半上，与时效性无关**
- **完整性限制**: 1. 只覆盖 `git` 元数据与一个文件的摘要；**不能证明整场庭审期间无并发改动**，只证明多个时点各测一次都是 0。2. 未逐文件比对两仓全部产品文件的摘要 —— 依据是 `git status` 的洁净度，**若存在 `.gitignore` 覆盖下的产品文件改动，本条看不见**。3. `presenter` 之外的产品文件本席未取摘要
- **验证历史**:
  - S-0066 | 已验证（由本席实跑）| 输出如上

---

- **评估结论**: **`已验证` 24 · `未验证` 1（`E-0015`）· `相矛盾` 3（`E-0016` · `E-0020` · `E-0037`）。** 来源类型全部为 `general`，枚举依[发言协议角色输出契约](../../../codex/lifecycle/speech-protocol.md#角色输出契约)。

  **本席对四条未通过判定的自我检验，一并呈上**：其中 **两条（`E-0016` / `E-0020`）的结论我独立测下为真**。放行它们会让流程更顺、让案卷更好看、且不会改变任何实体结果 —— **正因如此，它们是本关唯一真正的试题。** 我判其未通过的理由不是它们错了，是 **它们没有证明自己写下的东西**：一条记录了不可复现的输出，一条指认了相反的 `file:line`。**若这两条以 `已验证` 归档，案卷里就会留下两条任何人复跑都对不上的证据，而它们的正确结论会被记在错误的方法名下。** 该判定的后果（依赖发言丧失该项证明力、受影响项重排、闭庭延后）是实质的，本席认为它 **应当** 是实质的。

  **本席不主张的**：不主张四条所指向的实体结论为假；不主张任何一方的立场；不主张分块复核等价于逐条复核（见 不确定性 1）；不主张 24 条 `已验证` 中不存在一条因本轮深度分配不均而被漏掉的（见 不确定性 1(b)）。

- **证据编号**: 本案 `E-0002`~`E-0007` · `E-0010`~`E-0020` · `E-0030`~`E-0040`（28 条，[第六节](../../../codex/lifecycle/evidence-rules.md)承重集合第一分块，**按编号机械导出，本席未挑选任何一条**）；新增 `E-0270`~`E-0277`（8 条，本席实测）。

- **来源类型**: `general`（28 条被复核证据自陈 `repository` / `probe` / `runtime-artifact`；**四类定级本席逐条复核，无一处需要改判** —— 26 条 `自证类` 均给出了 revision + 路径 + 行号或完整命令，符合[第三节](../../../codex/lifecycle/evidence-rules.md)「任何角色可独立复现，且复现结果不依赖复现者」；`E-0014` / `E-0018` 的 `须查类` 自我分级正确，**且不得因本席复现成功而重新分级为 `自证类`** —— 被观察对象仍是可变的活文件）。**本轮无 `human-testimony`，`已佐证 / 未佐证` 枚举一次未使用。**

### E-0280 | repository | 自证类
- **来源定位**: **全局时效性三项独立复跑，与 S-0065 第二节一致；「脏改动无一在 `.claude/` 之外」本席实测为 *产品目录零行*。**
  - PuPu `HEAD = b2385d5dc7951887b6aeebd4001d17b4cd78af83`（分支 `dev`）；`git rev-list --count b2385d5d..HEAD` = **0**
  - PuPu `git status --porcelain -- src electron unchain_runtime public scripts package.json` = **零行输出**
  - unchain `HEAD = a4e69f413c449c5768433ba4dddc5b60b8146991`；`git status --porcelain | wc -l` = **0**
  - `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js` sha256 = `9778e5befffdf85634f8c808eed41099a9d5a83842ee6a95306af00efce4c5b0`（与 `E-0050` / `E-0010` / S-0065 所载 **逐字符相同**）
  - `node --version` = `v24.18.0`（与 `E-0052` 所载相同）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu   && git rev-parse HEAD && git rev-list --count b2385d5d…..HEAD
  git status --porcelain -- src electron unchain_runtime public scripts package.json
  shasum -a 256 src/SERVICEs/runtime_events/memory_v2_trace_presenter.js && node --version
  cd /Users/red/Desktop/GITRepo/unchain && git rev-parse HEAD && git status --porcelain | wc -l
  ```
  观察者 `evidence-examiner`（block 2/6 复核者），2026-08-08
- **提交发言**: S-0073
- **支持/反驳**: **第四次独立满足 `E-0001` 完整性限制所要求的重测**，并独立复跑 S-0065 第二节的三项测量，**结果一致**
- **完整性限制**: 与 `E-0001` / `E-0010` / `E-0050` 同一条：**只证明各时点各测一次都是 0，不能证明整场庭审期间无并发改动。** 不覆盖 `.claude/` 下的案卷文件（该目录确有脏改动，包含本案卷宗本身）
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0281 | probe | 须查类
- **来源定位**: **四个探针制品在本席观察时点仍存在；sha256 四项全部匹配证据所载；`baseline.mjs` 与产品文件逐字节相同；三个变体对基线的 `diff` 恰好等于且仅等于其各自自陈的那一处改动。**
  - `baseline.mjs` = `9778e5be…`（`E-0052` 所载）；`diff baseline.mjs <产品文件>` **零输出**
  - `variant_pattern.mjs` = `56796463…`（`E-0052` 所载 `56796463…`）；对基线的 `diff` **仅 2 处**：新增 `const ADMIT_PATTERN = /(?:_status|_error_code)$/;`，并把准入循环由 `for (const key of TOP_LEVEL_KEYS)` 改为 `for (const key of Object.keys(raw))` + `if (!admitted.has(key) && !ADMIT_PATTERN.test(key)) continue;`。**全文其余部分逐字节不变，与 `E-0052` 自陈完全一致**
  - `variant_c_naive.mjs` = `e6a46223…`（`E-0055` 所载）；对基线的 `diff` **仅 1 处**：循环之后追加 4 行，`output.trace_status = raw.unchain_context_status || raw.unchain_shadow_status` 与 `output.persistence_error_code = raw.unchain_context_error_code || raw.unchain_shadow_error_code`，**直接写 raw 值，`TOP_LEVEL_KEYS` 一字未动**
  - `variant_c_careful.mjs` = `b85f9503…`（`E-0055` 所载）；对基线的 `diff` **仅 1 处**：同一归一，但先经 `typeof v === "string" ? v.trim().toLowerCase().slice(0,48) : ""`，且以 `hasOwnProperty(output, …)` 守卫 **不覆盖已存在的同名键**
- **取得方式**:
  ```
  SP=<session-scratchpad>/secprobe
  shasum -a 256 $SP/*.mjs
  diff $SP/baseline.mjs /Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  diff $SP/baseline.mjs $SP/variant_pattern.mjs
  diff $SP/baseline.mjs $SP/variant_c_naive.mjs
  diff $SP/baseline.mjs $SP/variant_c_careful.mjs
  ```
  观察时点 2026-08-08，制品 mtime 均为 16:54–16:56
- **提交发言**: S-0073
- **支持/反驳**: **支持 `E-0052` / `E-0053` / `E-0055` / `E-0056` / `E-0057` 的真实性** —— 本席 **不重建、直接复跑提出方的原始制品**，故本席对这四条的核实 **强于** `E-0055` 完整性限制 1 所设想的重建式复核
- **完整性限制**:
  1. **须查类，无保管链。** 制品位于 session 域临时目录（见 `E-0285`），**本次 session 结束后本条不可复现**
  2. **本席核实的是变体与基线的差分**，**不是** 变体设计的充分性；`E-0055` / `E-0056` 的两个 C 变体系提出方按 `E-0013` 文字描述重建，**`E-0013` 那个文件本席未见，无法核实二者一致**
  3. `diff` 为文本比较，**不覆盖** 文件系统属性与不可见字符之外的任何语义等价性判断
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0282 | probe | 须查类
- **来源定位**: **`run.mjs`（T1–T6）与 `run2.mjs` 的输出逐行复现，与 `E-0052` / `E-0053` / `E-0055` / `E-0056` / `E-0057` 所载 *逐字符一致*。** 含：T1 开放准入下 `credential_status` / `reasoning_status` / `api_key_error_code` / `access_token_status` 连值放行、T2 嵌套层两变体均拦掉、T3 白名单内 `reason` 的值原样通过、T4 C-naive 的 20000 字符与对象值绕过全部五道封顶而 C-careful 全部恢复、T5 C-naive 把产端 `trace_status:"complete"` 覆写为 `"partial"` 并落盘、T6 三变体全部幂等、`run2.mjs` 三变体 **全绿**（含 `pattern(open)` 与 `C-naive`）
- **取得方式**: `cd <session-scratchpad>/secprobe && node run.mjs && node run2.mjs`（`node v24.18.0`）
- **提交发言**: S-0073
- **支持/反驳**: **支持上述五条证据的真实性**；**另证一处 `E-0056` 未展开而本席实测确认的细节** —— T5 的 `presentMemoryV2Audit` 一列在三个变体上 **全部返回 `undefined`**，与 `E-0056` 完整性限制 2 自陈一致，**故该证据只主张持久化侧取值这一点属实**
- **完整性限制**:
  1. **本席跑的是提出方写的脚本，未自行设计第二套测例。** 故本条证明「同制品同输出」，**不证明「该脚本测的就是它声称在测的全部」**
  2. 与 `E-0281` 同一条须查类限制
  3. **ESM 直接 import 产品文件的复制件，未经 webpack / jest 管线**，与 `E-0052` 同一条构建管线限制
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0283 | repository | 自证类
- **来源定位**: **本块三处行号偏差，均为引用精度问题，*无一* 改变任何主张。** PuPu `b2385d5d` / unchain `a4e69f41`
  - **`E-0079`**：记 `memory_v2_context.py:4747` `"persistence_event_type": event_type` —— **实为 `:4746`**（`:4747` 是闭合的 `}`）。同证据的 `:4644` `persistence_reason`、`:4298` `journal_status`、`:4300` / `:4745` `persistence_error_code` **全部逐字精确**
  - **`E-0080`**：记「整字典替换语义的三个活着的产点」之一为 `memory_v2_context.py:4295` —— **实为 `:4296`**（`:4295` 是 `) -> None:`）。另两处 `:4643` / `:4742` **逐字精确**；`update_diagnostics` 的 `:517-519` 整字典替换语义、`_memory_v2_merge_diagnostics` 的 `:271-281` read-modify-write **逐字精确**
  - **`E-0071`**：记 shadow 面 `state_updates` 为 `:101` —— **实为 `:102`**（`:101` 是 `ops=()`）。**本条为本席独立复核确认 S-0034 已记之同一偏差**，非新发现
  - **另两处范围端点松一格，本席不列为偏差**：`E-0051` 记 `sanitizeNode` 循环为 `:112-120`（实为 `:112-119`）、记 `sanitizeMemoryV2TraceBundle` 为 `:124-133`（实为 `:124-134`）；`E-0083` 记 `context/models.py:794-800`（实际语句块起于 `:795`）。**三处所引 *代码本身* 全部逐字属实**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && grep -n '"persistence_event_type"\|"persistence_error_code"\|"journal_status"\|"persistence_reason"\|admission.update_diagnostics(\|def update_diagnostics' unchain_runtime/server/memory_v2_context.py
  cd /Users/red/Desktop/GITRepo/unchain && grep -n "context_build_status\|state_updates\|trace=" src/unchain/context/harness.py
  ```
- **提交发言**: S-0073
- **支持/反驳**: **不反驳 `E-0079` / `E-0080` / `E-0071` 的任何一项实质主张。** 三个被误标的键 **确实存在于所指的那个产点**，只是行号差一行。**本条只为使案卷可被后续读者按行号直接定位而登记**
- **完整性限制**: **只覆盖本块 24 条中被本席逐行比对的那些引用。** 未对本案其余证据作同类核对。行号偏差不影响本席对这三条的评估结论
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0284 | repository | 自证类
- **来源定位**: **`E-0085` 的「同一套错误码推导」只在 *取值来源* 这一读法上成立；在 *过滤强度* 这一读法上被本案 `E-0054` 实测否证。** PuPu `b2385d5d`
  - **形状 A 侧（严格）**：`unchain_adapter.py:259-268 _memory_v2_safe_error_code` —— `re.fullmatch(r"[a-z0-9_.:-]{1,96}", explicit)` 通过才采用，否则回落异常类名并 `[:96]`。四个 `unchain_*_error_code` 的调用点 `:7459` `:7468` `:8412` `:8561` **全部经它**（该函数在本文件另有 `:435` `:925` `:1067` 三个调用点，**均非四键的赋值点**，故 `E-0054`「四个 `unchain_*_error_code` 的唯一取值来源」措辞成立）
  - **形状 P 侧（分裂）**：`memory_v2_context.py:4300` 的 `error_code` 来自 `:3529-3535 _safe_error_code`（**严格，同正则同上限**）；而 `E-0085` 自己援引的 `memory_v2_context_adapter.py:675-677` 为 `str(getattr(error, "code", type(error).__name__))[:128]` —— **无任何字符类过滤，上限 128**
  - **故**：`E-0085`「两条形状用的是同一套错误码推导 …… 取值来源不变」中，**「取值来源」（同一批异常对象的 `.code` 属性）成立且确实不区分 A 与 P**；**「同一套推导」若含过滤步骤则不成立** —— 二者差一个字符类 fullmatch 与 32 字符的上限差
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '259,269p' unchain_runtime/server/unchain_adapter.py
  grep -n "_memory_v2_safe_error_code" unchain_runtime/server/unchain_adapter.py
  sed -n '3529,3537p' unchain_runtime/server/memory_v2_context.py
  sed -n '665,682p' unchain_runtime/server/memory_v2_context_adapter.py
  ```
- **提交发言**: S-0073
- **支持/反驳**: **不反驳 `E-0085` 的评估结论，只作射程分离** —— 其承重用途（加固 S-0032 对判据一的撤回、为必要条件 5 提供背景）**只需要「取值来源」这一读法，本条完整支持它**。**本条同时指出该证据不得被用于支持「A 与 P 的错误码过滤相同」**，因为 `SEC-5`（「复用键名，别复用代码」）恰恰压在这个差别上。**`E-0085` 完整性限制 1 已自陈「未读 `_memory_v2_safe_error_code` 的实现」**，本席据此判为射程问题而非失真
- **完整性限制**:
  1. **只覆盖这三处构造本身的字符类与上限**，**未穷举** `getattr(error, "code")` 的实际取值来源（与 `E-0054` 完整性限制 2 同一条）
  2. **不主张任何值曾经泄漏过，不评价其安全后果**，亦 **不对 `SEC-5` 本身表态** —— 那属实体判断，不在本席射程
  3. 三个文件均属 `code-owner-runtime` 边界，**本条为越界只读**
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0285 | probe | 须查类
- **来源定位**: **本块四条 probe 证据被归为 `自证类`，但其制品位于 session 域临时目录，`取得方式` 只写占位符 `<scratchpad>/secprobe/…`、未载绝对路径。**
  - 实测路径形如 `/private/tmp/claude-501/<project-slug>/<session-uuid>/scratchpad/secprobe/`，**其中 `<session-uuid>` 为本次 session 专属**
  - 本席之所以能复跑，**唯一原因是本席与提出方 `expert-security` 在同一 session 内**；`evidence.md` 中记载的定位信息 **不足以让任何其他角色找到该目录**
  - 对照：同块 19 条 `repository` 证据全部以 `<repo>:<path>:<line>` + 自钉 revision 定位，**任何角色在任何时点可独立复现**
- **取得方式**: `find /private/tmp/claude-501 -type d -name secprobe`；与 `evidence.md:718` · `:745` · `:791` · `:819` · `:854` 的 `取得方式` 字段逐字比对
- **提交发言**: S-0073
- **支持/反驳**: **不反驳这四条的任何观察结果**（本席已全部复现，见 `E-0281` / `E-0282`）。**本条只指出其分类判据的一个未满足前件**：[证据规则第三节](../../../codex/lifecycle/evidence-rules.md)的 `自证类` 判据为「**任何角色可独立复现，且复现结果不依赖复现者**」，而制品存放于 session 域临时目录时，**「任何角色」这一前件在本次 session 结束后不再成立**；同节另设「**给不出定位的，不属自证类**」，而占位符不构成定位。**本席不裁定其类别** —— 分类与路由属 `speaker-of-the-house`
- **完整性限制**:
  1. **本条不主张这四条证据有任何失真**，恰相反：本席已逐项复现其输出与制品同一性
  2. **未核实** 该临时目录的实际保留策略与回收时点，故「session 结束后不可复现」是 **依 session 域语义所作的推论，不是一次观察**
  3. **本条不提修法建议**，亦不主张这四条应改判或撤回
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

### E-0286 | repository | 须查类
- **来源定位**: **`evidence.md` 一处归档错位：两份 `evidence-examiner` 复核结论物理落在 `E-0085` 的 `验证历史` 块内。**
  - `evidence.md:1925-1927` 为 `S-0028` 的复核结论（**其对象是 `E-0014`**，内容为「本体经三方 sha256 逐字节比对无漂移」「权威观察时点校正为 `16:26:40`」「未复制 WAL」「射程分离」）
  - `evidence.md:1928-1933` 为 `S-0029` 的复核结论（**其对象是 `E-0018`**，内容为「未触发任何构建」「adhoc 签名 / 无 quarantine / 无发布 workflow」「该 asar 根本不含 Python sidecar」「传闻类自我披露构成可援引的正确范例」）
  - 二者 **紧接在 `E-0085` 的 `验证历史` 首行（`S-0032 | 已验证`）之后，同一缩进层级**，格式上属于 `E-0085`
  - `E-0014`（`evidence.md:229`）与 `E-0018`（`:351`）自己的 `验证历史` **各自止于提交人一行**（`S-0004 | 已验证（由提交人实跑）`）
  - **两份复核本身真实存在**：`record.md:2989` `#### S-0028 | ASSESSMENT | evidence-examiner → E-0014`；`record.md:3150` `#### S-0029 | ASSESSMENT | evidence-examiner → E-0018`
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu/.claude/court/cases/0000-0005-2026-0807
  grep -n "本体经三方 sha256 逐字节比对无漂移\|未触发任何构建" evidence.md      # -> :1925, :1928
  grep -n "^### E-0014\|^### E-0018\|^### E-0085" evidence.md
  awk '/^### E-0014/,/^### E-0015/' evidence.md | tail -12
  grep -nE "^#### S-002[89]" record.md
  ```
- **提交发言**: S-0073
- **支持/反驳**: **不反驳 `E-0085` 的任何实质内容** —— 该错位不触及其 `来源定位` / `取得方式` / `支持-反驳` / `完整性限制` 任何一项，`E-0085` 本席另判 **已验证**。**本条同时明确不主张闭庭门禁第 10 项未满足** —— `E-0014` / `E-0018` 的审查结论 **实际存在于 `record.md`**，失真的只是 `evidence.md` 的挂载位置。**本条登记的是：只读 `evidence.md` 的下游读者会在 `E-0085` 上读到两段与它无关的复核，并在 `E-0014` / `E-0018` 上读不到任何复核**
- **完整性限制**:
  1. **须查类。** `evidence.md` 是本案活文件，**主持人随时可改**，本条锁在 2026-08-08 的一次观察上
  2. **本席未核对 `evidence.md` 其余部分是否另有同类错位**，只查了本块 24 条所在的三个区段
  3. **本席不代改案卷文件** —— `evidence.md` 归 `speaker-of-the-house`
- **验证历史**: S-0073 | 已验证（由 `evidence-examiner` 实跑）

---

## 逐条结论表（24 条，按编号顺序，未挑选）

| 证据 | 结论 | 一句话理由 |
|---|---|---|
| **E-0050** | **已验证** | HEAD / 产品目录 dirty=0 / presenter sha256 `9778e5be…` / `node v24.18.0` 本席逐项复跑，**四项全部逐字符一致** |
| **E-0051** | **已验证**（射程按 S-0050 加路径限定） | `:6` 定义与 `:117` 唯一施加点、`raw[key]` 只传值不传键、59 项与正则交集为空、`chat_storage_sanitize.js:739-740` 原样接收 —— **全部实测属实**；标题句第二连言支须带 S-0050 的路径限定读（见不确定性 6） |
| **E-0052** | **已验证** | 变体 sha256 `56796463…` 匹配，对基线 `diff` **恰为其自陈的准入循环那一处**，T1/T2 输出 **逐行复现** |
| **E-0053** | **已验证** | T3 复现；`reason` 在 presenter `:381` 以 1000 字符投出经本席读出确认，**`BLOCKED_KEY_PATTERN` 确不参与值判定** |
| **E-0054** | **已验证** | ①`:259-268` ②`:3529-3535` ③`:675-677` 三处构造与 `_mark_memory_v2_partial:4296` 的三键 **全部逐字属实**；「②与①逐字同构」严格说是 **行为等价**（① `.strip().lower()` 后匹配，② `.strip()` 后匹配 `.lower()`），其自限的「同一正则、同一回落」二者皆真 |
| **E-0055** | **已验证** | 两个 C 变体 sha256 `e6a46223…` / `b85f9503…` 匹配，`diff` **恰为其自陈的归一那一处**，T4 四行输出 **逐字复现** |
| **E-0056** | **已验证** | T5「C-naive 把产端 `complete` 覆写为 `partial` 并落盘」、T6「三变体全部幂等」**逐行复现**；其自陈的 `presentMemoryV2Audit` 返回 `undefined` 本席实测确认 |
| **E-0057** | **已验证** | fixture `:47-48` 嵌套 / `:50-51` 顶层、测试名 `:91`、两变体 **全绿** —— 全部复现；**两处计数措辞偏松**（`:95-99` 实为五条断言、`:95-101` 实为七条），**不影响结论**（见不确定性 4） |
| **E-0070** | **已验证** | `ContextBuildStatus` 四值（`journal/models.py:98-102`）与 presenter `:167`/`:169`/`:171`/`:172` **逐字全等**；`:174-195` 后续分支复用同四值 **无第五项**，本席逐行确认；`RunCaptureStatus` 三值缺 `legacy` ✓ |
| **E-0071** | **未验证**（维持 S-0034） | 观察部分逐条属实（含本席独立复核确认 `:101`→`:102` 偏差）；**其声明的两项值域用途压在一个下界上，而它测的是类型注解这一上界**；时效性经复跑维持，且提出方已于 S-0032 据 `E-0081` 撤回相关请求。**四项详见下** |
| **E-0072** | **相矛盾**（维持 S-0035） | 3/6 计数与 9 处 `file:line`、`host_adapter.py` 引文本席重跑 **全部属实**；「分裂线不沿任何语义边界」一句 **背后零观测**且被 S-0035 实测推翻；**提出方已于 S-0032 明示不补强该标题主张**。**四项详见下** |
| **E-0073** | **已验证** | `task_state.py:59` / `models.py:797-800` / `compiler.py:3332`·`:3359` / `curator/models.py:193`·`:217` / PuPu `:563`·`:582` 与 DDL `:627-628`·`:648-649` 两列并排 —— **全部逐字属实** |
| **E-0074** | **已验证** | `'legacy'` 在 `ContextBuildStatus` 域内 ✓；`'unknown'` 在三个 models 文件 **零命中** ✓（本席另跑更广的 `= "unknown"` 检索，仅 `cli/repl.py:212` 一处比较，**方向上加强而非削弱**）；升格 SQL `:4079-4080` 逐字属实 |
| **E-0075** | **已验证** | 机械集合运算复跑：`count 59` ✓，16 个键的成员判定 **16/16 与所载完全一致** |
| **E-0076** | **已验证** | 两条通路的行号与条件（`:163-166` explicit 链 · `:181-187` persistence 链 · `:382-385` errorCode）**逐字精确**；四个 `unchain_*` 键在该文件全文命中 **0** ✓ |
| **E-0077** | **已验证** | `:7451-7472` / `:8403-8415` / `:8554-8563` 三处的分支、取值与三个默认错误码 **逐字属实**；三处 `*_status` **全部是字面量 `"partial"`，无第二取值** ✓ |
| **E-0078** | **已验证** | 顶层按表准入 / 嵌套层只受正则与四常量（`8192`/`64`/`96`/`6`）约束、白名单内五个容器型键存在 —— **全部实测属实**；所引 `for` 行系产品文件四行折行的合并重排，**语义逐字相同** |
| **E-0079** | **已验证**（一处行号更正） | `trace_status` 命中 **0**（含测试目录亦为 0）· `persistence_error_code` **3** 处 · `journal_status` **2** 处 · boundary 三处 —— **计数与产点全部精确**；**`persistence_event_type` 记 `:4747`、实为 `:4746`**（E-0283） |
| **E-0080** | **已验证**（一处行号更正） | `capture_outcome != "complete"` 三元式、`update_diagnostics:517-519` 整字典替换、`:598+` sticky 覆写、`:271-281` merge 对照 —— **全部逐字属实**；三个降级产点即 `persistence_degraded` 的全部三处写入点，本席独立求证 ✓；**`:4295` 实为 `:4296`**（E-0283） |
| **E-0081** | **已验证** | `PARTIAL`/`LEGACY` 非测试命中 **=2**（`health.py:52` 默认值 · `:126` 比较目标，**均非产出**）· `ContextBuildEnvelope(` **=1** · `:3199-3204` 三元式 **二值** · `HandoffStatus:95-99` / `GraphTerminalStatus:81-84`·`:369`·`:631` —— **全部逐字复现** |
| **E-0082** | **已验证** | 八个键名计数 **8/8 与所载完全一致**；`persistence_boundary`=1 确为 `durability.py:22` 的 **子串命中** ✓ |
| **E-0083** | **已验证** | `models.py:795-800` 与 `task_state.py:63-65` 两处 `ContextBuildStatus(...)`→`ModelValidationError` **引文逐字属实**；`:84-91` 二值收窄、`:57` SCHEMA 声明 ✓（`:794` 端点松一格，见 E-0283） |
| **E-0084** | **已验证** | `:7458`·`:7466`·`:8411`·`:8560`（A）与 `:671`·`:4298`（P）**六处取值逐字全为 `"partial"`** —— 区分度为零这一事实实测成立 |
| **E-0085** | **已验证**（须带 E-0284 的射程分离） | `durability.py:22` 上游错误码、`:675-677` 取值表达式 **逐字属实**，其条件式措辞（「部分源自上游」）栅栏正确；**「同一套错误码推导」只能读作「同一取值来源」** —— 过滤强度读法被 `E-0054` 否证（E-0284） |

**分布：已验证 22 · 未验证 1 · 相矛盾 1。**

---

## 未通过条目的完整四项

### `E-0071` —— **未验证**（维持 S-0034，本席作时效性与承重充分性复核）

- **真实性**：**本体无一处失真。** 本席在 unchain `a4e69f41` 上逐条复现：`harness.py:66-70` active 面 `trace={...,"context_build_status": envelope["status"]}` **逐字属实**（`grep` 确认该字段字面出现于 `:69` 与 `:106`，全仓仅此二处）；`:103-108` shadow 面同形并带 `"context_shadow": True` 与 `"would_replace_messages"` **逐字属实**；`models.py:178` `status: ContextBuildStatus = ContextBuildStatus.COMPLETE` 与 `:213` 构造时强转 **逐字属实**；PuPu `b2385d5d` `memory_v2_context_adapter.py:672` `"context_build_status": "partial"` **逐字属实**。**唯一偏差**：shadow 面 `state_updates` 记 `:101`、实为 `:102`（`:101` 是 `ops=()`），**本席独立测得，与 S-0034 所记同一处，不改变任何主张**。**时效性**：unchain `commits since = 0`、工作树零脏，故 S-0034 的观察在本席时点 **原样成立**。
- **可靠性**：**内部来源** —— PuPu 组织自有的 unchain 仓库源码与 PuPu 仓库源码，由 `expert-llm` 在两个自钉 revision 上实跑取得，命令随附、可机械复核。**来源本身无可靠性瑕疵**；本条的问题不在来源。
- **相关性**：**这是它未通过的唯一原因，且本席复核后维持。** 该证据实际测得的是 **类型注解**（字段声明 + 构造时强转），确立的是 **上界**「取值必是 `ContextBuildStatus` 的某个成员」；而它 `支持/反驳` 字段声明支撑的两项用途 —— 「架构师 `0000-0002-2026-0807#S-0020` 的词汇缺口在四态这一轴上今天可以关闭」与「`context_build_status` 不属诊断」—— **共同压在一个下界上**：「该字段能发出 `partial` 与 `legacy`」。**上界推不出下界。** 本席另作两项独立时效性检验，**方向与 S-0034 一致**：(i) 本块 `E-0081`（**同一提出方的后一轮证据**）实测 `ContextBuildEnvelope` 全仓非测试唯一构造点 `compiler.py:3227`，其 `status` 由 `:3199-3204` 三元式给出，**只可能 `UNAVAILABLE` 或 `COMPLETE`**；(ii) `ContextBuildStatus.PARTIAL`/`.LEGACY` 非测试命中 **=2，皆非产出点**（`health.py:52` 入参默认值 · `:126` 比较目标）。**故该下界在本席观察时点仍未被任何证据建立。** 另记：提出方 `expert-llm` 已于 `S-0032` **主动撤回** `S-0010` 请求 4 并接受该质疑的值域那一半，**故本条的未验证在闭庭时点不产生新的重排需求**。
- **来源归类**：**内部来源。** 依[证据规则第五节](../../../codex/lifecycle/evidence-rules.md)，内部可信来源的争议证据由 `Procedural Judge` 依授权裁定，**不由本席裁**。
- **射程（原样承接 S-0034，本席一字未改）**：**未验证 只剪掉那两项值域用途，不及于 `E-0071` 的任何一处行号、引文、类型注解或 PuPu 侧同名写入 —— 那些全部属实且仍可援用。**

### `E-0072` —— **相矛盾**（维持 S-0035，本席作时效性与承重充分性复核）

- **真实性**：**可数的部分本席重跑，全部属实。** 在 unchain `a4e69f41` 上复跑其 `取得方式` 首条命令，输出 15 行：取 `"complete"` 的 typed 枚举成员 **恰 3**（`journal/models.py:99` · `context/models.py:96` · `curator/models.py:81`），取 `"completed"` 的 typed 枚举成员 **恰 6**（`curator/models.py:69`·`:75`·`:95` · `graph_checkpoint.py:82` · `request_lease.py:57` · `durable_turn_runtime.py:59`），`kernel/run_outcomes.py:32` `state.run_status = "completed"` **逐字属实**；`host_adapter.py` `_handoff_status` 引文 **逐字属实**（函数实起于 `:58`，其记 `:57-66` 端点松一格）；PuPu `:167-170` 的 `{complete,completed}` / `{failed,error}` 两对与顺序 **逐字属实**。**本席另测得一项该证据未披露的取舍**：同一条命令的 15 行输出中，另有 5 行未被登记（`compiler.py:1310` · `character/state.py:50`·`:126` · `shell_runtime.py:314` · `_worker.py:468`）。其中比较式与非枚举局部赋值被「typed 成员」这一声明过滤掉是 **正当的**；但该证据 **另行加入** 了 `run_outcomes.py:32` 这一条非枚举赋值而 **未声明加入规则**。**本席记为选择性登记，它加强而非改变 S-0035 的结论。时效性**：unchain 零变更，S-0035 的实测在本席时点原样成立。
- **可靠性**：**内部来源** —— unchain 与 PuPu 自有仓库源码，字面量 `grep` 与 `sed` 取得，可机械复核。**来源无瑕疵。**
- **相关性**：**相矛盾只及于「轴」这一个连言支。** 其 `来源定位` 标题句主张「分裂线不沿域、层或轴」，而其五条 `取得方式` **没有任何一步读过任何一个枚举被赋给了什么字段、修饰了什么对象** —— 该句 **不是被下界削弱，是背后一步观测都没有**；S-0035 另跑的同级成员共变（`"complete"` 三个 **全部** 带 `PARTIAL` 兄弟、`"completed"` 六个 **一个都没有**，3/3 对 0/6）**一跑即返回相反结果**。本席在本块复跑了 3/6 计数与 `HandoffStatus:95-99`（含 `PARTIAL`）、`GraphTerminalStatus:81-84`（无 `PARTIAL`）两个端点，**与该共变一致，未发现反例**。**关键的时效性事实**：提出方 `expert-llm` 已于 `S-0032` 明示「**我接受反驳，不补强 `E-0072` 的标题主张**」，**故该条依据的失效已由提出方本人让与，本席不请求任何新的重排。**
- **来源归类**：**内部来源。**
- **射程（原样承接 S-0035，本席一字未改）**：**相矛盾 只及于「轴」这一个连言支，不及于任何一处行号、任何一个计数、任何一段引文。**

### E-0300 | repository | 自证类
- **来源定位**: **`E-0091` 子主张 (3) 的射程实测：`hasVisibleTraceActivity` 由帧决定，与 `message.status` 无关。**
  - `src/COMPONENTs/chat-bubble/chat_bubble.js:91-100` `const hasToolActivity = traceChainFrames.some((f) => f.type === "tool_call" || f.type === "tool_result" || f.type === "reasoning" || f.type === "observation" || f.type === "fyi_injected" || f.type === "side_answer" || f.type === "clarify_request");` · `:101` `const hasVisibleTraceActivity = hasToolActivity;`
  - **该表达式不含 `message.status`**。`character_chat_bubble.js:122-132` 逐字同形
  - **故**：`E-0091` 的「在 `error`/`cancelled`/`failed` 的回合上 **另外两个门皆 false**」只在 **该回合无任何上列七种帧** 时成立。含工具活动的报错回合上 `hasVisibleTraceActivity` 为真，memory_v2 门 **非唯一门**
  - **该无限定表述逐字进入 `S-0014` 结论段**（`record.md:1722`：「故对报错 / 取消的回合，memory_v2 挂载门就是唯一的门」）
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '88,110p' src/COMPONENTs/chat-bubble/chat_bubble.js
  grep -n "hasToolActivity\|hasVisibleTraceActivity" src/COMPONENTs/chat-bubble/chat_bubble.js
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0091` 子主张 (3) 与 `S-0014` `record.md:1722` 的对应句；**不反驳** `E-0091` 的任何一处行号、引文或其子主张 (1)(2) —— 那些全部属实
- **完整性限制**: 1. 静态读取，**未跑运行时**，未观测任何真实报错回合的 `traceChainFrames` 实际内容 —— **本条不主张含帧的报错回合有多常见**，只主张该情形在结构上可达。2. 只覆盖两个气泡组件内的门表达式，**未追 `traceChainFrames` 的上游构造**

### E-0301 | repository | 自证类
- **来源定位**: **`E-0093` 的 `Complete ⟺ …` 等价式漏一个合取项，故 ⟸ 方向为假。**
  - `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:188-194`：
    ```js
    if (
      mode === "off" ||
      mode === "unavailable" ||
      normalizedText(raw.reason).toLowerCase().includes("unavailable")
    ) {
      return "Unavailable";
    }
    ```
  - **`E-0093` 的式子只列 `message.status` / `mode` / `legacy` / `degraded` / `error_code` 五类，未列 `reason`**
  - **`reason` 是活路径**：它是 `TOP_LEVEL_KEYS` 的第 9 个成员（`:9-68` 内），并由 presenter `:381` `reason: normalizedText(safe.reason, 1000)` 实取
  - **正确形式**：`Complete ⟺ status ∉ {error,failed,cancelled,partial} ∧ mode ∈ {active,shadow} ∧ 无 legacy/degraded/error_code ∧ **reason 不含 "unavailable"**`
- **取得方式**:
  ```
  sed -n '186,196p;379,386p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  grep -n '"reason",' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0093` 的等价式与 `S-0014` 请求 2 请求写入闭庭已知事实的那句刻画；**不反驳** `E-0093` 的任何行号、引文或计数 —— 全部属实且本席复跑相符；**方向说明**：该遗漏使 `Complete` 显得 **比实际更易达**，故 U-S5 的论旨不因此翻转
- **完整性限制**: 1. `reason` 的 **实际取值分布** 本席未观测（需运行时或一条真实持久化行），**故本条不主张该分支今天被触发过**。2. 静态读取，**未跑运行时**

### E-0302 | repository | 自证类
- **来源定位**: **`E-0098` 的结论成立，但其所引 `timeline.js:456` 不是该结论的机制来源；真实来源在第三处文件。**
  - **所引处属另一组件**：`src/BUILTIN_COMPONENTs/timeline/timeline.js:452` `status = "pending",` · `:456` `isExpanded = false,` —— 该组件另有自己的 `:461` `DotEnd` / `:471` `DotDefault` / `:483 resolveBranchLineColor`，是 **branch 组件**
  - **渲染 memory_v2 那一项的组件**在 `:120`：`isExpanded,` —— **必填 prop，无默认值**
  - **真实机制（本席走通的链）**：`src/COMPONENTs/chat-bubble/trace_chain.js:2079-2084` 的 `<Timeline items={timelineItems} compact={compact} hideTrack={hideTrack} style={…} />` **既不传 `expanded_indices` 也不传 `default_expanded_indices`** → `timeline.js:765` `isControlled = expanded_indices !== undefined` 为 `false` → `:767-768` `useState(() => new Set(default_expanded_indices))` = **空集** → `:771-773 expandedSet` = 空集 → `:834 isExpanded={expandedSet.has(i)}` **恒 false** → `:366-367 <AnimatedChildren open={false} unmountWhenClosed={true}>`
  - **另**：`E-0098` 所引 `:366`（`unmountWhenClosed={unmountDetailsWhenClosed}`）实为 `:367`；`:366` 是 `open={isExpanded}`
- **取得方式**:
  ```
  grep -n "isExpanded\|expandedSet\|internalExpanded\|isControlled" src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '118,140p;362,370p;450,458p;760,775p;830,838p' src/BUILTIN_COMPONENTs/timeline/timeline.js
  sed -n '2079,2085p' src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **提交发言**: S-0075
- **支持/反驳**: **确认** `E-0098` 的结论（详情默认折叠且 `Error code` 默认未挂载）与其 `:307` 引文、`unmountDetailsWhenClosed` 全仓 3 行的枚举；**更正** 其机制归属与两处行号。**本条使 `E-0098` 的结论更稳而非更弱** —— 真实机制（调用点不传 expanded prop）比一个组件默认值更难被无意改掉
- **完整性限制**: 1. **`timeline.js` 属 `code-owner-ui-primitives` 边界，本条为越界只读，不裁其取舍，只作机制复核。** 2. 静态读取，**未起应用、未在运行中的 DOM 里确认任何一项未挂载**。3. 未核实是否存在其它挂载 `<Timeline>` 且传 `default_expanded_indices` 的路径 —— **本条只覆盖 `trace_chain.js:2079` 这一个调用点**

### E-0303 | repository | 自证类
- **来源定位**: **两名提出方的行号精度实测对比（机械计数，不含任何质量评价）。**
  - **`code-owner-unchain`（18 条）**：本席逐条复跑其全部被引 `file:line`，**未实测出任何一处偏差**。含 `E-0116` 的 10 个成员（file:line + 类名双重复核）· `E-0120` 的 11 对 `_mark_*`→`raise` 与 5 处 runtime 偏移 · `E-0119` 的 10 个检查入口 · `E-0114` 的全部 9 处 · `E-0118` 的 13 处 except（行号 + 异常类型）
  - **`code-owner-chat-bubble`（15 条）**：实测 **5 处行号指错**，逐条列出（**无一处改变任何主张**）：

    | 条目 | 所引 | 实测 | 该处内容 |
    |---|---|---|---|
    | `E-0091` | `character_chat_bubble.js:167` | `:159-160` | `:167` 落在同一 `<TraceChain>` 元素的 props 内 |
    | `E-0092` | `memory_v2_trace_audit.js:313`（`Trace state`） | `:317` | `:313` 是 `compressionText` 三元式的收尾 `: "";` |
    | `E-0092` / `E-0098` / `E-0101` | `memory_v2_trace_audit.js:344-349`（`Error code`） | `:347-352` | `:344` 是 `Compression` 行 |
    | `E-0098` | `timeline.js:366` | `:367` | `:366` 是 `open={isExpanded}` |
    | `E-0099` | `lazy_trace_chain.js:60` | `:63` | `:60` 在 `TRACE_HEIGHT_CACHE` 命中分支内 |
    | `E-0104` | `memory_v2_trace_presenter.js:355-357`（`modeLabel`） | `:379` | `:355-357` 是 `predictedTokens` |
- **取得方式**: 本条为本席对 `E-0090`~`E-0104` 与 `E-0110`~`E-0127` 全部被引行号的逐条 `sed` / `grep` 复跑结果之汇总；每一处的复跑命令见对应条目的复核记录
- **提交发言**: S-0075
- **支持/反驳**: **不支持也不反驳任何实体主张。** 本条只登记一项与承重复核成本直接相关的观察：**两名提出方的行号精度差异约一个数量级，而分块把它们放进了同一个复核者的同一段上下文**（见「不确定性」四）
- **完整性限制**: 1. **「未实测出偏差」是本席复跑范围内的负向主张**，非「证明无偏差」—— 本席复跑的是被引行号，**未通读任一被引文件的全文**。2. **本条不评价任何一方的取证质量**，只作计数；6 处偏差 **无一改变任何主张**，这一点同样是实测结果

### E-0304 | repository | 自证类
- **来源定位**: **本席对全局时效性的独立测量（未采信任何转述）。**
  ```
  PuPu    git rev-parse HEAD            -> b2385d5dc7951887b6aeebd4001d17b4cd78af83
          git rev-list --count b2385d5d..HEAD                                  -> 0
          git status --porcelain -- src electron unchain_runtime package.json  -> 零行
  unchain git rev-parse HEAD            -> a4e69f413c449c5768433ba4dddc5b60b8146991
          git branch --show-current     -> dev
          git status --porcelain        -> 零行（整仓）
  ```
  - **加测一项**：PuPu 全仓 `git status --porcelain` 的全部脏条目 **无一在 `.claude/` 之外** —— 逐条为 `.claude/agent-memory/**`、`.claude/agents/expertise/expert-llm.md`、`.claude/codex/{adaptations,hybrid-execution-policy}.md`、`.claude/court/cases/**`。**三个产品目录零脏改动。**
  - 本测量在本席读取任何案卷文件 **之前** 执行
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu && git rev-parse HEAD && git rev-list --count b2385d5dc7951887b6aeebd4001d17b4cd78af83..HEAD && git status --porcelain
  cd /Users/red/Desktop/GITRepo/unchain && git rev-parse HEAD && git branch --show-current && git status --porcelain
  ```
- **提交发言**: S-0075
- **支持/反驳**: **独立确认** `S-0065` 第二节、`E-0090`、`E-0110`、`E-0150`、`E-0170`、`E-0190`、`E-0280` 所载的两仓锚点；本块 33 条的「现在还是不是这样」由本条统一回答：**是**
- **完整性限制**: 1. 只证明本席观察时点的 HEAD 与工作树状态。**闭庭时点若晚于此且任一仓产品树有变动，本块须重取。** 2. 未核实两仓的远端与本地差异（本席一律以本地工作树为准，与 `E-0110` 同）

### E-0305 | repository | 自证类
- **来源定位**: **`E-0104` 的 `modeLabel` 取值点行号指错；正确位置与求值结论均已复核。**
  - `E-0104` `来源定位` 载 `src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:355-357（modeLabel）`
  - **实测 `:355-358`** 为 `const predictedTokens = firstFiniteNumber(safe.predicted_total_tokens, safe.before_estimated_tokens,);` —— 与 `modeLabel` 无关
  - **`modeLabel` 实在 `:379`**：`modeLabel: titleCase(mode) || "Off",`
  - **求值结论仍成立**：`titleCase:149-152` 对 `"off"` 返回 `"Off"`；`trace_chain.js:1944-1947` 的 span 三元式在 `pressure.percent === null` 时取 `memoryV2Audit.modeLabel`（在 `:1947`，`E-0104` 引 `:1946`）
- **取得方式**:
  ```
  sed -n '149,160p;353,360p;376,386p' src/SERVICEs/runtime_events/memory_v2_trace_presenter.js
  sed -n '1944,1950p' src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0104` 的行号；**不改变** `S-0046` 对 `E-0104` 的既有判定 —— 本条修正的是其控制流一半（该半 `S-0046` 已判为全真），**与其感知层一半无关**
- **完整性限制**: 静态求值，**未执行任何探针**（与 `E-0104` 同）

### E-0306 | repository | 自证类
- **来源定位**: **`code-owner-unchain` 的三处同型子计数错，均紧邻正确的枚举或正确的头号数字，均不改结论。**

  | 条目 | 所述 | 实测 | 与之相邻的正确项 |
  |---|---|---|---|
  | `E-0112` | 「测试 **8** 处」 | **10**（`grep -rn "ContextBuildStatus.PARTIAL\|ContextBuildStatus.LEGACY" tests/ \| wc -l` = 10） | **其自己列出的 10 个行号全部正确**：`test_models.py:223` `:224` · `test_task_state_request_factory.py:123` `:124` `:147` `:148` · `test_context_health_preflight.py:42` `:133` `:169` `:172` |
  | `E-0118` | 「`kernel/` 全部 **9** 个 `.py`」 | `ls src/unchain/kernel/*.py \| wc -l` = **18**；`grep -rl "except " src/unchain/kernel/*.py \| wc -l` = **7**（两种读法均不为 9） | **13 处 except 的行号与异常类型逐条正确**；且其执行的 `grep …/kernel/*.py` 为无限制通配，**已覆盖全部 18 个文件，负向主张射程未被缩窄** |
  | `E-0127` | 「`journal/models.py` **9** 个」 | `grep -c "SCHEMA: ClassVar\[str\]" src/unchain/journal/models.py` = **12**（`:335` `:386` `:434` `:460` `:488` `:524` `:555` `:587` `:650` `:718` `:810` `:853`） | **头号数字 58 精确**；所点名的 5 个 schema 常量行号逐个精确 |

- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn "ContextBuildStatus.PARTIAL\|ContextBuildStatus.LEGACY" tests/ | wc -l
  ls src/unchain/kernel/*.py | wc -l ; grep -rl "except " src/unchain/kernel/*.py | wc -l
  grep -c "SCHEMA: ClassVar\[str\]" src/unchain/journal/models.py
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0112` / `E-0118` / `E-0127` 各自的一个子计数；**不反驳** 三条的任何行号、引文、头号数字或结论 —— 三条的实质主张本席全部复跑成立。**特别记明 `E-0118`**：其负向主张（`kernel/` 内无持久化降级通路）**射程完好**，因为写错的是散文里的文件数，不是它跑的那条通配 `grep`
- **完整性限制**: 1. 本条只覆盖本块 18 条内的子计数，**未回头复核该 owner 在本案其它块的证据**。2. **本条不主张三处为同一成因** —— 「方法性偏差而非三次独立笔误」是本席的判断，写在「不确定性」四，属判断不属观察；三处的 `file:line` 与计数命令已给出，**任何评审者可独立复核并给出不同归类**

### E-0307 | repository | 自证类
- **来源定位**: **`E-0121` 所引注释的实际位置。**
  - `E-0121` 述 `execute_prepared_tool` 的 `:1592-1606` 段为「调 sink（内层 `try/except: pass`，注释「原始持久化错误定义了失败边界」）」
  - **实测 `:1594-1606` 无任何注释**：`:1594 try:` · `:1595-1604` sink 调用 · `:1605 except Exception:` · `:1606 pass`
  - **该注释实在 `src/unchain/context/runtime.py:1822`**：`# The original persistence error defines the failed boundary.` —— 位于 `persist_event` 的 sink 块内（即 `E-0120` 所列的第 5 个 sink，`:1817`）
- **取得方式**:
  ```
  sed -n '1584,1608p;1818,1828p' src/unchain/context/runtime.py
  grep -rn "original persistence error" src/unchain/context/runtime.py
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0121` 的一处引注位置；**不反驳** 其任何结构主张 —— `tool_harness.py` 零 `except`、`:1584`/`:1585-1589`/`:1590`/`:1607` 的结构、`:1609+` 同形与 `:1673 raise`，本席全部复跑成立。**该注释确实存在于本仓，只是在另一个 sink 上**
- **完整性限制**: 静态读取，**未跑运行时**

### E-0308 | repository | 自证类
- **来源定位**: **`E-0127` 的 typed 对比：同一个类里的开放袋是两个不是一个。**
  - `src/unchain/context/compiler.py:287-297` `ContextCompileResult` 的全部字段：`:291 messages: tuple[dict[str, Any], ...]` · `:292 diagnostics: Mapping[str, Any]` · `:293 checkpoint_requests: tuple[CheckpointRequest, ...]` · `:294 envelope: ContextBuildEnvelope | None` · **`:295 projections: Mapping[str, Mapping[str, Any]]`**
  - **`projections` 在叶层与 `diagnostics` 同样开放**（`Mapping[str, Any]` 之于 `Mapping[str, Mapping[str, Any]]`：后者多一层结构约束，叶值同为 `Any`）
  - 故 `E-0127` 的「同一个类的其余字段全部 typed，唯独 `diagnostics` 不是」**过强**；成立的表述是「该类有两个开放映射字段，其余三个为闭合形状」
- **取得方式**:
  ```
  sed -n '286,302p' src/unchain/context/compiler.py
  ```
- **提交发言**: S-0075
- **支持/反驳**: **限定** `E-0127` 的一处对比强度；**不反驳** 其 58 计数、5 个 schema 常量行号、三个开放载体的认定或其结论（本库有声明机制且大量使用，而本案链路上的载体不在其中）—— 全部复跑成立
- **完整性限制**: 1. 「叶层同样开放」是本席对两个类型注解的 **比较判断**，判据是叶值类型；**任何评审者可按同一 `file:line` 独立复核并给出不同归类**。2. 本条 **不主张** 这两个字段被留成开放是有意为之（与 `E-0127` 完整性限制 2 同）

---

- **不确定性**:

  **一 · 分块对本席独立性的影响：三格逐格作答（本席独立判断，未照抄前两块复核者的结论）**

  **第一格 —— 判词的相互参照会压低边缘条目被单独怀疑的概率：本席同意，并能指名本块的两个实例，一正一反。**

  **代价侧**：一次 `memory_v2_journal_reload.js:483-497` 的通读同时结清了 `E-0096`（`journalReload` 零消费者）、`E-0100`（`audit.status` 不在被覆写键内）、`E-0101`（`:493` 的 `identifierText` 对照）三条。效率是真的，**代价是 `E-0101` 因此没有得到一个独立 instance 会给它的那一问** —— 「`AuditRow` 的 `value` 除了这条渲染路径，是否另有把 `errorCode` 送进 DOM 的第二处」（`memory_v2_trace_audit.js:410` 另有一个 `label="Error code"`，本席读到了但 **没有追它**，因为 `E-0101` 的主张已由 `:347-352` 那一处满足）。同类情形：`E-0092` 与 `E-0098` 共用同一次 `timeline.js` 通读，`E-0092` 关于「`status` 的全部作用只有两个色解析器」的枚举 **本席在发现该枚举不完整后并未据以改判**，因为其结论由「三个词映射到同一个字面量」独立成立 —— **但一个只审 `E-0092` 的 instance 会被迫回答「枚举不完整是否影响结论」，而本席是靠另一条推理绕过了这一问。**

  **收益侧**：`E-0112`（「测试 8 处」）· `E-0118`（「9 个 `.py`」）· `E-0127`（「9 个」）**若非同块并置，本席极可能只会抓到其中零到一处** —— 因为前 6 条（`E-0111` `E-0113`~`E-0117`）的行号精度使本席形成了「这名提出方的数字可以照读」的预期。**本席是在 `E-0112` 意外对不上之后，才改为对该 owner 的每一个计数逐条重跑，第二处与第三处是这一策略改变的产物。**

  **故本席的表述是：相互参照在本块 *既* 制造了一处本可不发生的发现，*也* 制造了至少两处本应发生而未发生的独立追问；两者不相抵，本席无法自证没有第三类。**（与 block 2 复核者的表述结构相同，但实例是本席自己的。）

  **第二格 —— 深度按条目不均等分配，且分配是本席自己做的：本席同意，并把分配交出，供任何人复核本席是否分错。** 三档：
  - **深（独立走通了证据未给出的机制链 / 独立设计了正反向检索 / 逐个成员做了双重复核）**：`E-0091` · `E-0092` · `E-0093` · `E-0098` · `E-0103` · `E-0104` · `E-0112` · `E-0116` · `E-0118` · `E-0120` · `E-0127`
  - **中（每一处被引行号逐行读出并与引文逐字比对，正负向 `grep` 全部复跑）**：`E-0090` · `E-0094` · `E-0095` · `E-0096` · `E-0097` · `E-0099` · `E-0100` · `E-0101` · `E-0102` · `E-0111` · `E-0113` · `E-0114` · `E-0115` · `E-0117` · `E-0119` · `E-0121` · `E-0122` · `E-0123` · `E-0124` · `E-0125` · `E-0126`
  - **浅（复跑其枚举与锚点，未重走全部推理）**：`E-0110`
  - **本席记明一处分配偏差**：`E-0110` 是唯一的「浅」，因为它就是锚点本身且已由 `E-0304` 独立测得。**但本席未核实其「未核实 GitHub main 与本地 dev 的差异」这一自陈限制是否仍准确** —— 本席同样未核实，故本席与它同处一个盲区，**这不是复核。**

  **第三格 —— 编号顺序在本案与提出方几乎共变，故「按编号分块」事实上产生了「按作者聚类」的效果：本席同意，且本块的实例比 block 2 更极端 —— 本块 33 条恰好整齐地分成两名提出方的 15 条与 18 条，中间没有任何交错。**

  **本席交出这一格在本块的具体形态，它与 block 2 复核者所述不同**：block 2 的复核者报告的是 **先验替提出方背书**（读到第 6 条已形成「自陈限制写得极细」的预期）。**本席经历了同一件事，但它在本块被一次实测打断了**：本席对 `code-owner-unchain` 形成的先验（前 6 条行号零偏差）在 `E-0112` 处被证伪，**先验因此转为一条检索策略而非一层背书**。**本席不认为这说明本块比 block 2 更安全 —— 恰恰相反**：先验之所以被打断，是因为本块碰巧有一个 **可机械证伪** 的维度（计数）。**`code-owner-chat-bubble` 那 15 条的先验没有被任何东西打断**，因为它们的失效形态是行号偏移（本席逐条重读，故被抓到）与 **射程过宽**（`E-0091` / `E-0104`），而后者 **没有一个机械判据**。**本席对该 owner 的 15 条中「射程是否还有第三处过宽」这一问，无法自证已穷尽。**

  **二 · 本席新增的第四格：同一提出方批次内部的相互印证，其误差是相关的而非独立的。**

  **本块的证据不是 33 条互不相干的条目，而是两组彼此声明支持关系的簇**：`E-0116` + `E-0117` 合并反驳 `E-0072`；`E-0118` + `E-0119` + `E-0120` + `E-0121` + `E-0122` 合并补强 `E-0031`；`E-0123` 与 `E-0124` 显式互指（`E-0124` **就是** `E-0123` 自陈的那个脆弱点）；`E-0096` + `E-0100` + `E-0101` 落在同一个文件的同一段。**当本席在一段上下文里连续核实它们时，每一条的正确都在为相邻条目提供一种「看起来像交叉验证」的观感 —— 但它们出自同一个 agent、同一轮取证、同一套方法，故其误差是 *相关* 的。**

  **这一格与第三格不同**：第三格说的是 **先验会替提出方背书**；第四格说的是 **即使没有先验，簇内的一致性本身也不构成独立佐证，而分块把簇整个放进了一个复核者手里**。**本块有一个直接证据**：`E-0112` / `E-0118` / `E-0127` 的三处子计数错 **是同一种错**（正确的枚举旁边配一个错的总数）。**33 个独立 instance 会看到三次孤立的小笔误；一个 instance 看到的是一个模式** —— 后者是本席能报出「这是方法性偏差」的唯一原因，**但同样地，如果这套方法产生的是一个 *全部条目共有* 的系统性缺陷（例如全部负向 `grep` 都漏了同一种构造形态），簇内的一致性会让它 *完全不可见*，而 33 个独立 instance 中至少有一个可能碰巧用了不同的检索式。** 本席无法排除这一情形。

  **三 · 本席的取证限制（与被复核证据同类，不因本席是复核者而豁免）**

  1. **全程静态读取。未起 sidecar、未起应用、未跑一次真实回合、未执行任何 Python、未跑两仓测试套件（PuPu 的 `react-scripts test` 与 unchain 的 pytest 均未跑）、未做故障注入、未在运行中的 DOM 里确认任何一项挂载或未挂载、未做任何对比度测量。** 本块全部结论属对代码文本的观察，**不属运行时观察**。
  2. **本席的负向检索与被复核证据同属一个失败类。** `journalReload` 零读取 · 八个键名在 unchain 零命中 · 四个持久化标识符在 `kernel/` 零命中 · 健康契约七标识符在 PuPu 零命中 —— **全部是字面量 `grep` 的负向主张，是「未发现」不是「证明不存在」**，以变量、f-string、别名、`importlib` 或动态构造拼出的同名标识符一律漏掉。**本席复现了这些数字，没有消除这一类风险**（见第四格末段）。
  3. **本席未自行设计任何第二套检验。** 本席跑的绝大多数是提出方给出的命令；本席自行构造的只有：`E-0095` 的全仓扩大检索、`E-0302` 的 expanded-prop 链、`E-0306` 的三条计数命令、`E-0308` 的字段枚举、以及对 `E-0104` 的七跳静态复算。**其余为复跑。**
  4. **`E-0092` 的 `status` 消费面枚举不完整，本席未据以改判，理由已写在第一格。** 本席记明：`timeline.js:98`（`DotEnd` 的 `glowing`）与 `:808`（`isActive`）是该枚举漏掉的两处；**因 memory_v2 那一项不传 `point` 故不走 `DotEnd`，且三个词映射到同一字面量故任何函数的输出都相同**，本席判该遗漏不影响结论。**若有人认为该判断错，判据在本席这一句里，可直接反驳。**
  5. **本席未审查本块之外的任何证据，未复核 `S-0014` / `S-0015` 的任何专业结论。** 本席读它们只为确定每条证据「在撑什么」，**未评价其撑得对不对**。对 `E-0172` 的援引（见 `E-0104` 相关性）**只取其存在与方向，不采信其数值、不复核、不据以改判任何条目**。
  6. **本席未派生任何子 instance**（[A-012](../../../codex/adaptations.md)）。全程只读，未改任何产品代码，未 commit，未起应用，未触发构建。**唯一写入为本文件。**
  7. **时效性**：观察时点 **2026-08-08**。两仓锚点经本席在读取任何案卷之前独立测量，与 `S-0065` 第二节、`S-0072` 第五节、`S-0073` 第八项完全一致（`E-0304`）。**闭庭时点若晚于此且任一仓产品树有变动，本块须重取。**

  **四 · 关于全局时效性：本席抽验了，且是先验后读。**

  本席在读取 charter 与证据规则的同一轮里、**在打开 `evidence.md` 与 `record.md` 之前**，独立跑了两仓的 `rev-parse` / `rev-list --count` / `status --porcelain`。结果与主持人所述一致，并与 block 1 / block 2 复核者的复跑一致。**本席加测一项并确认与 block 1 复核者所测相同**：PuPu 全仓的脏条目 **无一在 `.claude/` 之外**，三个产品目录零脏改动。**本席未仅凭转述。**

- **请求/下一步**:

  1. **请 `speaker-of-the-house` 记明：本块 32 条 `已验证` 可继续承重；`E-0104` 维持 `S-0046` 的 `未验证`，其重排已由主持人在 `SUMMARY` R2 处标注完毕，本席不请求任何新的重排。**
  2. **请把 `E-0301`（`E-0093` 等价式缺 `reason` 合取项）显式呈 `chief-judge`。** `S-0014` 请求 2 请求把「`Memory V2 · Complete` 今天的证据基础 = 消息没报错 ∧ rollout 开着」**列入闭庭产出的已知事实** —— **若照原文写入，写入的将是一个缺一项的充要条件。** 正确形式须补第四个合取项（`reason` 不含 `"unavailable"`）。**本席不主张该补充改变 U-S5 的论旨**（新增的仍是收端条件），只主张 **写进闭庭已知事实的句子必须是真的**。
  3. **请把 `E-0300`（`E-0091` 子主张 3 射程过宽）显式呈 `chief-judge`，并请主持人注意它已逐字进入 `record.md:1722`。** 「对报错 / 取消的回合，memory_v2 挂载门就是唯一的门」须加限定「**且该回合无任何 display 帧**」。**依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)，本席不得删除或改写任何发言** —— 是否标注、如何标注，是主持人的处置。
  4. **请主持人注意 `E-0302` 的一处程序含义**：`E-0098` 的结论正确而机制引错，**其正确机制落在 `code-owner-ui-primitives` 与 `code-owner-chat-bubble` 的接缝上**（`timeline.js` 的 prop 默认 vs `trace_chain.js` 的调用点）。这与 `S-0046` 对 `E-0104` 所指出的「决定外观的两文件在第三个 owner 边界内」是 **同一条边界上的第二次同类情形**。本席只登记，**不主张任何处置**。
  5. **就 `E-0306` 与第四格，请主持人原样转 `codex`，与 block 1 的两格、block 2 的第三格并列，不要合并成一条。** 本席的第四格（**簇内误差相关性**）与 block 2 的第三格（**作者先验背书**）是两件事：前者即使在没有先验的复核者身上也成立。
  6. **本席不请求就任何条目补强。** 本块无 `相矛盾`，唯一的 `未验证` 已有既存处置。

### E-0340 | repository | 自证类
- **来源定位**: **时效性复核（第七次独立复核），本席在打开案卷 *之前* 取得；并核清一处路径大小写疑点。**
- **取得方式**:
  ```
  cd /Users/red/Desktop/GITRepo/PuPu   && git rev-parse --short HEAD   → b2385d5d
                                       && git status --porcelain -- src/ electron/ unchain_runtime/ | wc -l → 0
                                       && git branch --show-current    → dev
  cd /Users/red/Desktop/GITRepo/unchain && git rev-parse --short HEAD  → a4e69f4
                                       && git status --porcelain | wc -l → 0
  ls -di /Users/red/Desktop/GITRepo/pupu /Users/red/Desktop/GITRepo/PuPu → 45877629 · 45877629
  ```
- **内容**: 两仓锚点与 S-0065 第二节、E-0001 / E-0190 / E-0210 / E-0280 / E-0300 所载 **逐字一致**；unchain 侧 **全仓** dirty 为 0。**`/pupu` 与 `/PuPu` inode 相同**，故 `E-0210` / `E-0216` / `E-0230` 命令中的小写路径与其余条目指向同一工作树，**不构成取证瑕疵**。
- **支持/反驳**: 支持本块全部 22 条的时效性；支持 `E-0190` / `E-0210` 的锚点。
- **完整性限制**: 未比对任何文件的 sha256（本席未复用任何前序探针制品）。

### E-0341 | repository | 自证类
- **来源定位**: **`TOP_LEVEL_KEYS` 零非字面量成员 —— `E-0191` 的「59 为下界」实测为精确值。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && node -e '
  const s=require("fs").readFileSync("src/SERVICEs/runtime_events/memory_v2_trace_presenter.js","utf8");
  const m=s.match(/const TOP_LEVEL_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  console.log("count:",[...m[1].matchAll(/"([^"]+)"/g)].length);
  console.log("residue:",JSON.stringify(m[1].replace(/"[^"]*"/g,"").replace(/[\s,]/g,"")));'
  ```
- **内容（输出原文）**: `count: 59` · `residue: ""`。剔除全部字符串字面量、空白与逗号后 **残余为空串**，即该数组内 **不存在以变量、拼接或展开构造的成员**。
- **支持/反驳**: **支持并强化** `E-0191`：其完整性限制所述的 `#E-0069` 失败类 **在本条上不存在**，59 是精确值而非下界。
- **完整性限制**: 只覆盖 `TOP_LEVEL_KEYS` 这一个常量块，不推广到本案任何其他计数。

### E-0342 | repository | 自证类
- **来源定位**: **`E-0192` 的 21 键基字面量，由本席从 Python 源码重新解析（不采信其脚本中手打的清单）。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && python3 -c "
  import re
  src=open('unchain_runtime/server/memory_v2_context.py',encoding='utf-8').read().split(chr(10))
  keys=[m.group(1) for line in src[547:577] for m in [re.match(r'\s+\"([a-z_0-9]+)\":',line)] if m]
  print(len(keys),keys)"
  ```
- **内容**: 得 **21** 个键，**顺序与拼写与 `E-0192` 脚本内写死的 `base` 清单逐一相同**（`schema_version` … `canary_hash_strategy`）。以本席这份重解析结果再对 59 项表求差，得 **同样的 7 个缺项**。
- **支持/反驳**: **支持** `E-0192`，并 **补上其方法上的一个空洞**：其 `node -e` 把 21 键写死在脚本内，故「产端声明了这 21 个键」这一半事实上未被该脚本证明，只由提交者转录。**本条把它变成机械导出。**
- **完整性限制**: 正则只匹配缩进 + 双引号 + 冒号的行，**以变量或 f-string 构造的键会被漏掉**，故 21 仍为下界 —— 但 **两份清单相同** 这一结论不受该限制影响。

### E-0343 | repository | 自证类
- **来源定位**: **`expert-architecture` `不成立 (i)` 翻转条件 (ii) 的独立执行：两侧键集之间不存在任何对账制品。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "TOP_LEVEL_KEYS" src electron unchain_runtime scripts
  grep -rln "memory_v2_trace_presenter" src electron unchain_runtime scripts
  grep -rn "TOP_LEVEL\|whitelist\|allowed_keys\|ALLOWED_KEYS" unchain_runtime/ --include="*.py"
  grep -n "declared_context_window\|context_window_source\|output_reserve_override\|transport_margin_override\|diagnostics" src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js
  ```
- **内容**: `TOP_LEVEL_KEYS` 全域 **恰好 2 行命中，两行都在其定义文件内**（`:9` 定义 · `:127` 使用）。引用 `memory_v2_trace_presenter` 的非测试文件为 5 个（3 个渲染消费者 + `chat_storage_sanitize.js` + 其自身测试）；**其测试文件对产端 7 个缺项与 `diagnostics` 零命中**。`unchain_runtime/` 内 `whitelist` / `allowed_keys` 的命中全部落在 `pip` 第三方目录、`durable_interaction_host.py` 的 env 兜底、`memory_factory.py:1258` 的 **函数参数** 过滤与工具白名单测试，**无一处对照该 59 项表**。
- **支持/反驳**: **支持** `E-0192` 的负向主张，**并以一条与其不同的检索独立证成之** —— `E-0192` 做的是集合差（分叉的 *结果*），本条做的是对账制品的存在性检索（分叉的 *成因*）。**据此，`expert-architecture` 自设的「一个反例即可推翻」的翻转条件 (ii)，在本席的检索范围内 *无反例*。**
- **完整性限制**: 1. **字面量检索，负向主张** —— 以别名 import、动态构造或在本席未检索目录（如 `.github/` 之外的 CI 脚本、`docs/`）中的对账会被漏掉，故「不存在」的准确措辞是 **「在上述四条检索范围内未发现」**。2. **本席不评价该 `不成立` 的实体正确性**，只报告其翻转条件今天不成立。

### E-0344 | repository | 自证类
- **来源定位**: **`E-0193` 未覆盖的驼峰段：`schemaVersion` 零下游消费者。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "schemaVersion" src --include="*.js" | grep -v "\.test\."
  grep -n "schemaVersion\|schema_version" src/COMPONENTs/chat-bubble/trace_chain.js
  ```
- **内容**: `src` 非测试代码内 `schemaVersion` 共 **8 处**：`memory_v2_trace_presenter.js:377`（**产生处**）· `chat_storage_tree.js:49` · `chat_storage_migrate.js:45/:77/:241/:363` · `chat_storage_constants.js:49` · `chat_storage_store.js:205` —— **后 7 处全部是 `chat_storage` 自己的 `CHATS_SCHEMA_VERSION`，与 memory_v2 载荷无关**。`trace_chain.js` 对 `schemaVersion` 与 `schema_version` **两种拼法均零命中**。
- **支持/反驳**: **支持并强化** `E-0193`：其 `grep` 只覆盖蛇形拼法，而 `presenter:377` 之后下游只会用驼峰。**补上这一段后，「无任何消费者据它校验、分支、拒绝或迁移」在改名前后两段上都成立。**
- **完整性限制**: 字面量检索；以解构别名（如 `const { schemaVersion: v } = audit`）出现的消费者会被漏掉。

### E-0345 | repository | 自证类
- **来源定位**: **`context_build_status` 在 unchain 侧的 2 处命中是真键名，不是子串。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/unchain
  grep -rn "context_build_status" src --include='*.py' | grep -v test
  grep -rn "persistence_boundary" src --include='*.py' | grep -v test
  ```
- **内容（输出原文）**:
  ```
  src/unchain/context/harness.py:69:                "context_build_status": envelope["status"],
  src/unchain/context/harness.py:106:               "context_build_status": envelope["status"],
  src/unchain/durability.py:22:    code = "durable_persistence_boundary_failure"
  ```
- **支持/反驳**: **限定（不推翻）** `E-0195` 的通读印象。其标题「形状 P 的三个键在 unchain 侧同样零出现」**成立**（`journal_status` / `persistence_degraded` / `persistence_error_code` 确为三条零），其「形状 A 与形状 P 在词汇出处这一维完全相同」**在其所指的 4 + 3 个键上成立**。**但该条只对 `persistence_boundary` 的 1 处命中作了「子串非键名」的解释，未对 `context_build_status` 的 2 处作任何说明** —— 而后者 **是真键名，有上游出处**。本条把这两处的性质写明，以免「本案全部候选词汇都是 PuPu 自造」被当作一条全称结论带出庭。
- **完整性限制**: 只覆盖 `src/` 非测试路径；本条 **不主张** `context_build_status` 与本案任何形状的关系，也 **不主张** 它应当或不应当被采用。

### E-0346 | repository | 自证类
- **来源定位**: **`E-0196` 的两处定位偏移（各差一行），此前无人指出。**
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '264,273p' src/SERVICEs/chat_storage/chat_storage_backend.js
  sed -n '537,543p' electron/main/services/chat_storage/service.js
  ```
- **内容**: `const persist = (store) => {` 在 **`:266`**，函数体 `:266-272`（`E-0196` 引 `:265-270`）。`// Legacy-compat entry point…` 注释在 **`:538-539`**，`const write = (store) => {` 在 **`:540`**，函数体 `:540-542`（`E-0196` 引 `:537-541`）。**两处引文的代码内容与实际逐字相符，只有行号各偏一行。**
- **支持/反驳**: **补充** `S-0056`（不改变其结论）。同一批事实，**`E-0212` 给出的 `:540-542` 逐行精确** —— 本席把该对照记明，供第四格分块代价的读者参考。
- **完整性限制**: 只核了这两处；未逐一复核 `E-0196` 其余引文的行号（其余引文本席在复跑中未见偏移）。

### E-0347 | repository | 自证类
- **来源定位**: **`emitMisoStreamEvent` 定义在 `:4450`，不在 `E-0218` 所引的 `:4310-4330`；`:4313` 是 `recordMisoStreamEvent`。** `pupu:electron/main/services/unchain/service.js`
- **取得方式**:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -n "const emitMisoStreamEvent\|const recordMisoStreamEvent\|const sendMisoStreamEnvelope\|const bindVaultUseInteractionFromStreamPayload\|const emitMisoRuntimeLog" electron/main/services/unchain/service.js
  sed -n '4310,4332p;4450,4487p' electron/main/services/unchain/service.js
  grep -n "emitMisoStreamEvent(" electron/main/services/unchain/service.js
  ```
- **内容**:
  ```
  4313:  const recordMisoStreamEvent = (requestId, event, data) => {
  4355:  const sendMisoStreamEnvelope = (targetOrId, envelope) => {
  4375:  const bindVaultUseInteractionFromStreamPayload = (data) => {
  4450:  const emitMisoStreamEvent = (targetWebContentsId, requestId, event, data) => {
  4488:  const emitMisoRuntimeLog = (level, text) => {
  ```
  `E-0218` 所引的 `:4320 const envelope = { requestId, event, data, streamSeq };` 位于 **`recordMisoStreamEvent`（`:4313-4330`）** 内 —— 那是 **replay 缓冲的记录器**，其返回值在 `:4464` 被真正的 `emitMisoStreamEvent` 消费。`emitMisoStreamEvent` 的函数体为 **`:4450-4486`**，**完全不在 `E-0218` 所引的任何区间内，也不在 `S-0051` 边界命中依据表所列的任何区间内**（该表所列为 `:4271-4274` `:4310-4330` `:4355-4366` `:5007-5029` `:5031-5045` `:5086-5139`）。全域 `emitMisoStreamEvent` 调用点 7 处：`:4648` `:5090` `:5124` `:5142` `:5467` `:5482` `:5489`。
- **支持/反驳**: **反驳** `E-0218` 的链路首环与由其得出的「`data` 即 `payload` 原对象」；**限定** `S-0051` 边界命中依据表对 `electron/main/services/unchain/service.js` 的申报范围。**不反驳** `E-0218` 关于 `parseSseBlock` / `parseSsePayload` / 主循环无条件调用 / 终止判定的任何一项（本席复核四项全部属实）。
- **完整性限制**: 字面量 `grep` 抓函数声明；以别名或再导出方式定义的同名函数会被漏掉（本席目视该文件内无此类）。

### E-0348 | repository | 自证类
- **来源定位**: **真正的 `emitMisoStreamEvent` 会改写事件名与整个载荷，且其入口逐个读取载荷的 24 条嵌套键路径。**
- **取得方式**: `sed -n '4450,4462p;4375,4402p' electron/main/services/unchain/service.js`
- **内容（源码原文）**:
  ```js
  // :4450-4461
  const emitMisoStreamEvent = (targetWebContentsId, requestId, event, data) => {
    try {
      bindVaultUseInteractionFromStreamPayload(data);        // :4452
    } catch (_error) {
      // Do not expose an unbound Vault confirmation to the renderer. This
      // static terminal error contains no request identity, handle or secret.
      event = "error";                                        // :4456  ← 事件名被改写
      data = {                                                // :4457-4460  ← 载荷被整体替换
        code: "vault_intent_binding_failed",
        message: "Vault confirmation could not be bound safely.",
      };
    }
  ```
  `bindVaultUseInteractionFromStreamPayload`（`:4375-4448`）的 `candidates` 数组（`:4377-4402`）**恰好 24 项**，逐条读取载荷的键：`data.vault_use` · `data.arguments?.vault_use` · `data.interact_config?.vault_use` · `data.tool_call?.{vault_use, arguments?.vault_use, interact_config?.vault_use}`，及以 `data.payload?.` / `data.data?.` / `data.presentation?.` 为前缀的同构四枝。未命中任何候选时 **`:4407 if (!binding) return false;`**（不抛，透传）；命中且绑定不可用或绑定失败时，于 **`:4412-4416`** 与 **`:4442-4446`** 两处抛出 `error.code = "vault_intent_binding_failed"`。
- **支持/反驳**: **反驳** `E-0218` 的标题「不过滤事件名，不过滤键」与其结论「`data` 即 `payload` 原对象」，二者作为 **无限定命题** 均不成立。**不反驳** 「本案四个键在 relay 段未被碰过」—— memory_v2 trace 载荷在这 24 条路径上无 `vault_use`，不进入改写分支（**该点为静态推断，见完整性限制 2**）。
- **完整性限制**: 1. **本条 *不* 主张该改写分支在本案任何路径上被触发过**，也不主张它是缺陷 —— 其注释自陈是一项刻意的 fail-closed 处置，**本席对其取舍不表态**。2. **本席未跑运行时**，未构造一次 `vault_use` 载荷观测该分支。3. **越界读**：`electron/**` 属 `code-owner-electron`，标参考，本条对其改法不表态、不请求本案处置。

### E-0349 | repository | 自证类
- **来源定位**: **尾块恢复路径的发射是有条件的。** `pupu:electron/main/services/unchain/service.js:5118-5124`
- **取得方式**: `sed -n '5116,5126p' electron/main/services/unchain/service.js`
- **内容**: `:5118 const trailingBlock = buffer.trim();` · `:5119 if (!sawTerminalEvent && trailingBlock.length > 0) {` · `:5120-5121` 解析 · **`:5122 if (parsedPayload.isValidJson) {`** · `:5124 emitMisoStreamEvent(`。**非法 JSON 的尾块不发射。**
- **支持/反驳**: **反驳** `E-0218` 「`:5118-5138` … 同样无条件 `emitMisoStreamEvent`」一句；**限定** `S-0051` 四·2 的「未知事件名 **一定** 到达 preload」为全称命题时不成立（主循环路径 `:5086-5095` 上成立）。
- **完整性限制**: 只覆盖该一段；主循环路径的无条件性本席已复核属实，不受影响。

### E-0350 | repository | 自证类
- **来源定位**: **preload 三道信封门内存在三处 `else` 分支。** `pupu:electron/preload/stream/unchain_stream_client.js`
- **取得方式**: `grep -n "eventName ===\|else\|default:" electron/preload/stream/unchain_stream_client.js`
- **内容**: `else` 命中三处 —— **`:145`**（门二 `done` 块内，`} else if (typeof handlers.onDone === "function")`）· **`:200`**（门三 `runtime_event` 块内，`} else {`）· **`:226`**（门三 `done` 块内，`} else if (…)`）。**三处均不在事件名分派链上**：它们分别区分 `data.cancelled` 与否、`streamSeq > 0` 与否。`default:` 全文零命中。
- **支持/反驳**: **反驳** `E-0219` 「三道门中无一处存在 `else` 分支」这一 **全称否定**，及其在 `SUMMARY` **R5** 与 `S-0051` **约束 3** 中的逐字复述。**不反驳** `E-0219` 的任何 `file:line`（全部精确）与其真正承重的那半（事件名分派链上无 `else`/`default`，未命中即静默落地）。**记明**：反证 `E-0219` 的 `:200 } else {` **逐字印在同一提出方、相邻编号的 `E-0220` 正文里**。
- **完整性限制**: 字面量 `grep`；本条不主张这三处 `else` 有任何缺陷含义 —— **它们只是使那句全称否定为假。**

### E-0351 | repository | 自证类
- **来源定位**: **preload stream client 全模块零日志、零计数、零诊断写入。**
- **取得方式**:
  ```bash
  grep -n "console\.\|log(\|count\|metric\|diagnos" electron/preload/stream/unchain_stream_client.js
  wc -l electron/preload/stream/unchain_stream_client.js
  ```
- **内容**: **510 行，上述五个模式合计 0 命中。**
- **支持/反驳**: **支持并强化** `E-0219` 的「无日志、计数或诊断写入」—— 该主张实测的成立范围 **比其自陈的「三道门内」更宽：是整个模块**。据此，`SUMMARY` R5 所述「静默丢弃」的机制在本席检索范围内成立。
- **完整性限制**: 字面量检索；以别名（如 `const c = console`）或经 IPC 上报的遥测会被漏掉。

### E-0352 | repository | 自证类
- **来源定位**: **`package.json` 没有 `jest` 键。**
- **取得方式**: `python3 -c "import json;p=json.load(open('package.json'));print('jest key =',repr(p.get('jest')))"` → `jest key = None`
- **内容**: `E-0221` 称该键为「**空对象 `{}`**」，而 **该键不存在**；其自身给出的 `p.get('jest')` 在 Python 中输出 `None`，**不可能输出 `{}`**。
- **支持/反驳**: **补正** `E-0221` 的一处内容与其复现命令输出的不一致。**不改变其推断**：键缺失与 `{}` 对 CRA 而言同样落到默认 `testMatch`。**本条的意义在于记录一条 `自证类` 条目的「复现结果」与其所载不符** —— 承重复核的免检失效正是为这一类而设。
- **完整性限制**: 只核该一个键。

### E-0353 | repository | 自证类
- **来源定位**: **Electron 测试步骤是 `continue-on-error`，红灯由两跳之外的聚合门交付。** `pupu:.github/workflows/release-qa.yml`
- **取得方式**:
  ```bash
  grep -n "continue-on-error" .github/workflows/release-qa.yml
  sed -n '95,100p;159,172p' .github/workflows/release-qa.yml
  ```
- **内容**: `:95 - name: Electron tests` · `:96 id: electron` · **`:97 continue-on-error: true`** · `:99 run: npm run test:electron`。该 job 的 **八个** 检查步骤（`frontend` `:89` · `electron` `:97` · `python` `:103` · `web_build` `:111` · `mcp_registry` `:119` · `mcp_runtime` `:125` · `release_qa_scripts` `:131` · `notice_scripts` `:137`）**全部** `continue-on-error: true`。真正的红灯在：
  ```yaml
  # :166-171
  - name: Deterministic release gate
    if: always()
    working-directory: pupu
    run: |
      node -e "const r=require('./release-qa-job-report.json'); if (r.deterministic_result.status === 'failed') { console.error('Deterministic Release QA failed'); process.exit(1); }"
  ```
- **支持/反驳**: **补正** `E-0221`：其引 `:99` 而漏 `:97`，并未引 `:166-171`。**其结论（Electron 测试失败会让 CI 变红）成立，但其出示的链路不产生该结论** —— 缺 `continue-on-error` 与聚合门两环。**支持** `S-0051` 约束 4 的可执行性（红灯存在），**但把它的交付方式改正为两跳**。
- **完整性限制**: 1. **未跑任何 workflow**，未观测一次真实的红灯。2. 未核 `write-job-report.mjs` 如何由八个 `outcome` 计算 `deterministic_result.status` —— **该脚本本条未审**，故「失败一定被聚合成 `failed`」为按结构的推断而非观测。

### E-0354 | repository | 自证类
- **来源定位**: **`normalizeWriteBatch` 对裸数组载荷早退，绕过全部信封与 write guard 校验。** `pupu:electron/main/services/chat_storage/service.js:68-71`
- **取得方式**: `sed -n '66,72p' electron/main/services/chat_storage/service.js`
- **内容**:
  ```js
  const MAX_WRITE_GUARD_EPOCH_CHARS = 128;                      // :66
  const normalizeWriteBatch = (payload) => {                    // :68
    if (Array.isArray(payload)) {
      return { guard: null, ops: payload };                     // :70 ← 早退，零校验
    }
  ```
- **支持/反驳**: **补充** `E-0214`（不反驳）：其称该函数「只校验批次信封与 write guard」，**未提这条早退**。方向上 **与 `E-0214` 同向且更强** —— 裸数组路径上连信封校验都不发生。**支持** `SUMMARY` **R4** 所述「每回合都执行的写入没有任何下限」。**一并确认** `MAX_WRITE_GUARD_EPOCH_CHARS = 128`，`E-0214` 的「≤128 字符」属实。
- **完整性限制**: **本条不主张该早退可由渲染进程触发** —— preload bridge 的 `applyOps(ops)` / `applyOpsSync(ops)` 确以数组调用，但 **是否所有调用点都带 guard，本席未追**。**未核实即不主张。**

### E-0355 | repository | 自证类
- **来源定位**: **`applyOps` 内另有两处 per-op 检查，均不打开消息对象。** `pupu:electron/main/services/chat_storage/service.js:398-438`
- **取得方式**: `sed -n '398,438p' electron/main/services/chat_storage/service.js`
- **内容**: `:417 deletionOutbox.assertOpWritable(op);` · `:418 const apply = op && OP_APPLIERS[op.type];` · `:419-423 if (!apply) { throw new Error(\`applyOps: unknown op type: ${op && op.type}\`); }`；另有 `:404-412` 的 `renderer_write_guards` 幂等检查与 `:427-435` 的 guard 落库。**上述五处全部作用于 op 信封与 chat 级契约，无一处访问 `op.messages` 的任何元素。**
- **支持/反驳**: **补充** `E-0212` / `E-0214`（不反驳）：二者未列这两处检查。**其结论（四入口全部汇入 `replaceMessages`、对消息载荷零校验）不受影响** —— 本条把「零校验」的准确边界写明为 **「零 *消息载荷* 校验」**，而非「零任何校验」。
- **完整性限制**: 未审 `deletionOutbox.assertOpWritable` 的实现（本条只据其在 `applyOps` 内的位置与入参判定其作用面）。

### E-0356 | repository | 自证类
- **来源定位**: **三处 `"unavailable"` 中的两处是逐字节相同的常量。**
- **取得方式**: `sed -n '159,163p' electron/main/services/settings_storage/service.js; sed -n '143,147p' electron/main/services/memory_vault/service.js`
- **内容**: 两处均为
  ```js
  const SECRET_STORAGE_STATUS = Object.freeze({
    AVAILABLE: "available",
    UNAVAILABLE: "unavailable",
  });
  ```
  —— **同名常量、同值、同结构，分别复制在两个 service 中**；第三处（`unchain/service.js:3313` `:3339` `:3358` `:3377` `:3423`）是 catalog / registry 查询的降级返回值，与前二者不同形。
- **支持/反驳**: **限定** `E-0217` 的「三个互不相关的子系统中各有一种含义」—— 实为 **两处重复 + 一处不同**。**不反驳** `E-0217`：其完整性限制 2 已自陈该归类「属判断不属观察」，并声明支持项只依赖「同一裸词出现在三个互不引用的子系统中」，**该退守项经本席实测成立**。
- **完整性限制**: 未追这两份重复常量是否有共同来源或应否合并 —— **那是所有权方的事，本条不表态。**

### E-0357 | repository | 自证类
- **来源定位**: **`migrat` 检索实为 7 处命中，`E-0214` 枚举了 6 处。**
- **取得方式**: `grep -rn "migrat" electron/main/services/chat_storage/*.js | grep -v "\.test\."`
- **内容**: `service.js:14`（`MIGRATED_SUFFIX`）· `:325`（注释）· `:486`（注释）· `:494`（`migrateLegacyFileIfNeeded` 定义）· `:535`（调用）· `:538`（注释）· **`register_handlers.js:76`（注释：`// Legacy migration markers may only be written after this commit ack.`）**。`E-0214` 记「`MIGRATED_SUFFIX` `:14` · `migrateLegacyFileIfNeeded` `:494` `:535` · **三处注释**」，合计 6，少计 `register_handlers.js:76`。
- **支持/反驳**: **补正** `E-0214` 的一处计数（不反驳其结论）：第 7 处 **同样指 legacy 文件迁移**，故「全部命中均指 legacy 文件迁移」与「无消息载荷级迁移机械」**均成立**。
- **完整性限制**: 只覆盖 `electron/main/services/chat_storage/*.js` 一层（不含子目录），与 `E-0214` 的检索范围相同。
