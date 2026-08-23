# 承重证据复核 · 批次 C（12 条）

`evidence-examiner` · 证据规则第六节 · 全批为自证类，**入卷免检在本关失效**

---

## 全批时效前提

复核开始时与结束时各测一次，覆盖本批全部 12 条：

```
git -C /Users/red/Desktop/GITRepo/PuPu rev-parse --short HEAD   →  b2385d5d   （首末两次一致）
git branch --show-current                                       →  dev
git status --porcelain -- src electron unchain_runtime          →  空（0 条）  （首末两次一致）
git status --porcelain | wc -l                                  →  49 → 51    （复核期间自增 2）
```

**三条结论，全批共用**：

1. **锚点 revision 未漂移。** 本批全部 12 条声明的 `b2385d5d` 今天仍是 HEAD，本次复核读到的每一个字节都与提交方当时读到的是同一棵树。
2. **产品目录持续零 dirty。** `src` / `electron` / `unchain_runtime` 在本次复核的首末两次测量中均为空。**故本批的行号与原文引用不存在「提交后被改动」这一失效通道** —— 凡我报为漂移的，都是提交当时即已存在的偏差，不是时效问题。
3. **工作树整体 dirty 计数仍在自增，且在我复核期间又涨了 2 条（49→51）。** 结合 E-0001 的 8 与 E-0033 的 12，本案七小时内该计数走了 `8 → 12 → 49 → 51`。**该计数不适合承载任何裁定**；产品目录零 dirty 才是稳定量，而它稳定成立。

**逐条结果**：已验证 10 条（E-0030 · E-0031 · E-0033 · E-0034 · E-0035 · E-0038 · E-0039 · E-0040 · E-0041 · E-0042）· 未验证 2 条（**E-0032** · **E-0037**），两条的失效点均为 **计数/构成不符**，且两条的核心引文本身逐字为真 —— 更正后可再议。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0030

- **阶段**: 议案庭审
- **结论**: **六个行段全部命中，四个文件尺寸逐字节吻合，三项计数全部独立复现。** 本条是本批质量最高的几条之一。其自陈的两条完整性限制（未实跑、只搜字面串）经核 **属实且已充分**，我未发现未登记的缺口。
- **依据**: E-0030
- **不确定性**: 「这些断言今天为绿」仍无人实跑 —— 与 E-0029 审查（S-0015）所记「`memory_v2_startup_readiness` / `memory_v2_rollout` 至今无人实跑」是同一个缺口，本次复核 **未填补**（我只读不跑）。
- **请求/下一步**: 若裁定要压在「注入被测试锁住」上，须补一次这两个 suite 的实跑；引用时须写「测试源码里写着这些断言」，不得写「这些断言今天为绿」。
- **评估结论**: 已验证
- **证据编号**: E-0030
- **来源类型**: general
- **真实性**: **成立，逐项。** ① 六个行段全部指向所述内容：`:188-194` 打包+canary 的 spawn env（`PUPU_CONTEXT_V2_STORE_OWNER: "unchain"` 在 `:193`）· `:200-214` `getMisoStatusPayload` 的 `memoryV2` 投影（`configured:true, ready:true, status:"ready", reason:"", rolloutMode:"canary"` + 两个 fingerprint）· `:237-244` dev 脏活跃分支 · `:268-275` 无 dirty env + `ready` · `:379-392` off 态（`STORE_OWNER:"off"` 在 `:384`；`configured:false/ready:false/status:"off"` 在 `:390-392`）· `:426-440` win32+all（`shadow`/`all`/`unchain` 在 `:427-429`；`degraded` + `vault_worker_containment_unavailable` + `releaseRolloutMode:"all"` + `rolloutMode:"shadow"` 在 `:436-440`）。**全部逐字命中。** ② **三项计数全部复现**：`memoryV2:` 断言恰 **7 处**（`:203, 245, 273, 299, 360, 389, 435`）；`memoryV2.status` 被断言的取值恰为 `ready`/`degraded`/`off` **三值**；全仓 `PUPU_CONTEXT_V2_STORE_OWNER` 断言仅 **3 处**（`:193 unchain`/`:384 off`/`:429 unchain`），**`pupu_legacy` 断言确为零**。③ **四个文件尺寸逐字节吻合**：`context_v2_service.test.cjs` 49245B + `.js` 42B · `ipc_channels.test.cjs` 28313B + 36B · `api_contract.test.cjs` 37515B + 36B · `context_v2_bridge.test.cjs` 9241B + 41B。④ **六对双胞胎全部存在，六个 `.js` 全文各为一行 `require("./<name>.test.cjs");`**，我逐个 `cat` 确认，无一例外。⑤ 另三个锚点亦命中：`context_v2_service.test.cjs:498-527` 为 space/tree/entry 的 owner-scoped 读测试（`getContextV2Tree` 的 URL 断言在 `:511-513`）· `ipc_channels.test.cjs:360-375` 为 channel↔方法名绑定表（`:360` 即 `const expectedBindings = [`）· `api_contract.test.cjs:252-265` 为 `listSpaces`/`getTree` 的入参转发断言。**唯一非精确项**：`:498-527` 的起点比该 `test(` 块早 2 行（块实际为 `:500-528`），属区间引用的常见容差，**不构成漂移**，所述内容全在区间内。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界（`electron/**`）内的定点读取。提交方对自己不确定的部分（未实跑、以变量构造的断言未覆盖）作了主动登记，未见夸大。
- **相关性**: **相关且充分**，就其所支持的三条主张而言。支持「甲：注入被测试锁住」—— 三处 spawn env 断言确实钉住了 `PUPU_CONTEXT_V2_STORE_OWNER` 的注入值。支持「乙 (2)：`memoryV2` 只被部分锁定」—— **这一条尤其被本次复核加强**：7 处断言全为 `toMatchObject` 部分匹配，`status` 四值只锁三值，且我确认全仓 **无任何** 「不得有额外字段」的断言，故「部分锁定」不是保守说法而是精确说法。支持「丁 (1)：bridge 面被契约测试锁住」—— `api_contract.test.cjs:252-265` 与 `ipc_channels.test.cjs:360-375` 确为此提供锁力。**一处须随证据引用的限定**（承自 S-0015，本次复核确认其仍适用）：这六个 `.js` 双胞胎 **零执行**（`test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`），故「被双胞胎锁住」不含双重执行保险，锁力全部来自单一 `.cjs`。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，在 `b2385d5d` 上由第二方（本审查人）以 `sed` / `ls -la` / `cat` / `grep` 独立复核，非外部权威背书。同机同工作树。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0031

- **阶段**: 议案庭审
- **结论**: **四个行号全部精确命中，三条 SQL 逐字一致。** 内容简短，无夸大，其两条自陈限制（未核 id 空间同一性、未核是否暴露可调用查询方法）经核 **属实且是本条最关键的边界** —— 本条只证明 SQL 存在于 main，不证明它可被 Context V2 侧调用。
- **依据**: E-0031
- **不确定性**: `chats.id` 与 `ownerChatId` 是否严格同一 id 空间，本条未答，我亦未核（归 `code-owner-chat-core`，其 E-0043 自称已确认并升级 —— 不在本批射程）。
- **请求/下一步**: 引用时须限定为「材料在 main 进程里」，**不得读作「main 今天可以建这道门」** —— 后者需要一次 service 间可调用性的核实，本条不含。
- **评估结论**: 已验证
- **证据编号**: E-0031
- **来源类型**: general
- **真实性**: **成立。** `chat_storage/service.js:357` = `.prepare("SELECT id FROM chats")` ✓ · `:459` = `const chatRows = requireDb().prepare("SELECT id, meta FROM chats").all();` ✓ · `:489` = `const chatCount = db.prepare("SELECT COUNT(*) AS n FROM chats").get().n;` ✓ —— 三条 **逐字一致，行号零漂移**。`unchain/service.js:118-120` 亦命中：`:118-119` 为注释 `// Mirrors memory_v2_store._OWNER_ID_RE / _ID_RE. Main re-validates rather than / // trusting the sidecar to reject: a malformed id must never reach the wire.`，`:120` 为 `CONTEXT_V2_OWNER_ID_PATTERN`。**E-0031 称该段是「语法门的成文声明」，与原文语义吻合** —— 注释明说 main 重做的是 id 形状校验（mirror 正则），而非身份/归属校验。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界内的 grep + 定点读取。所有断言均可在同 revision 一命令复现。
- **相关性**: **相关，但证明力窄于字面读法。** 支持「丙 (3)：main 今天没有身份门，但材料在 main 里」—— 前半（没有身份门）由 `:118-120` 的注释所述「语法门」间接支持；后半（材料在 main 里）由三条 SQL 直接支持。支持「FE3：建门是新耦合、新行为」同样成立。**但本条第二条自陈限制是承重的关键**：只确认了 SQL 存在于 `chat_storage` service 内部，**未确认该 service 对同进程其他 service 暴露任何可调用的查询方法**。故「材料在 main 里」为真，「main 可以拿到这些材料去建门」**本条不证**。我未擅自补测（跨越到可调用性核实已超出本条射程）。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0032

- **阶段**: 议案庭审
- **结论**: **未验证 —— 承重的那一句被它自己引用的文件反驳。** `getTree` 入参只有 `{ownerChatId, spaceId}` 这一句 **逐字为真**；但同一份 preload bridge 里 **`listEntries` 同样没有 `limit`**，且主进程对它 **同样不施加 `CONTEXT_V2_PAGE_LIMIT_MAX`**。故本条列举的七方法「均带 `limit`」**有一个成员是错的**（应为 `readContent`，不是 `listEntries`），其登记的推论「**`getTree` 是唯一无上界的读方法**」**不成立**。
- **依据**: E-0032
- **不确定性**: `listEntries` 是否另有服务端隐式上界，我 **未核**（与 E-0032 自陈的 `get_tree` 同一限制，归 `code-owner-runtime`）。故我主张的是「在 E-0032 自己划定的比对面（preload 入参 + main 常量）上，`getTree` 不唯一」，**不主张两者的真实载荷同样无界**。
- **请求/下一步**: **三项。** ① 请提出方 `code-owner-electron` 更正列举集，并把推论改写为「`getTree` 与 `listEntries` 是十八个方法里 **两个** 无分页参数的读方法」。② 该更正 **对本案是加强不是削弱**：无上界读方法从一个变两个，封顶议题的射程随之变大 —— 请本庭不要因本条判未验证而把封顶关切一并下调。③ 已有发言若以「唯一」措辞引用本条（其「留待方案庭审」第三条、`code-owner-chat-bubble` E-0056 的「为 E-0032『`getTree` 是唯一无上界读方法』提供先例」），须随更正一并调整。
- **评估结论**: 未验证
- **证据编号**: E-0032
- **来源类型**: general
- **真实性**: **核心引文为真，列举集为假。** ✓ 命中：`unchain/service.js:131` = `const CONTEXT_V2_PAGE_LIMIT_MAX = 500;` 逐字一致 · `:132` = `CONTEXT_V2_CONTENT_LIMIT_MAX = 128 * 1024` ✓ · `:2108-2116` 精确框住 `getContextV2Tree` 全函数，其 query 只含 `owner_chat_id` ✓ · preload `context_v2_bridge.js:35-231` 精确框住 `createContextV2Bridge` 至 return 对象闭合，返回对象恰 **18 个方法** ✓ · `getTree`（`:86-90`）入参确为 `{ownerChatId, spaceId}` 二者，无分页无大小参数 ✓。✗ **不成立**：`listEntries`（preload `:92-98`）入参为 `{ownerChatId, spaceId, parentPath, includeDescendants}` —— **无 `limit`**；主进程 `listContextV2Entries`（`service.js:2118-2137`）的 query 只拼 `owner_chat_id` / `parent_path` / `include_descendants`，**全函数不出现 `CONTEXT_V2_PAGE_LIMIT_MAX`**。且 `include_descendants` 经 `contextV2Boolean(payload?.includeDescendants, "includeDescendants", true)`（`:2126-2130`），而 `contextV2Boolean`（`:572-580`）在值为 `undefined`/`null` 时 **返回 fallback**，故默认 `true`；`parent_path` 经 `optionalContextV2Path` 可整个省略。**省略 `parentPath` 的 `listEntries` 调用返回整个 space 的全部条目，无任何上界** —— 与 `getTree` 同形。真正带 `limit` 的七个是 `listEvents`(:50) · `readContent`(:58-59, 含 offset) · `search`(:105) · `listCandidates`(:112) · `listJobs`(:121) · `listPromotions`(:128) · `listCandidateReviews`(:179)。**另一处非实质偏差**：取得方式称 bridge 为「235 行」，实为 **234 行**（文件以换行结尾）；不触及任何被引行号，记为笔误级。
- **可靠性**: **内部来源**，`code-owner-electron` 在其自有边界内的整读。**可靠性本身不低** —— 十八个方法的入参表逐项复核无误，且其括注「`listEntries`（经 `includeDescendants`）」显示提交方 **察觉到 `listEntries` 的封顶机制不同**，却仍把它写进了「均带 `limit`」的集合，属表述崩塌而非编造。但依本关标准，**察觉到差异却未把差异贯彻到结论，正是承重复核要拦的形态**。
- **相关性**: **不充分 —— 证据为真，证的不是它声称的那件事。** 它声称支持的是排他性命题（「`getTree` 是 **唯一** 无上界的读方法」），而它引用的同一份文件里存在第二个反例。排他性命题需要遍历十八个方法后无反例，本条做了遍历却漏判了一项。**本条剩余可用的部分**：「`getTree` 无任何分页或大小参数，返回体大小由 store 内容单方面决定」—— 这一句 **完全成立，可独立采信**，只是不能带「唯一」二字。
- **来源归类**: **内部来源。** 仓内文件字面内容，`b2385d5d`，第二方以 Read 整读 preload bridge（234 行全文）+ `sed` 读 main 对应函数独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0033

- **阶段**: 议案庭审
- **结论**: **已验证，且其承重部分在本次复核的首末两次测量中 *仍然* 成立。** `b2385d5d` / `dev` / 三产品目录零 dirty —— 三项全部现场复现。其登记的 dirty 计数 12 属 **验证窗口已关闭** 的历史快照，我无法回溯核实；但今天该数已是 **51**（我复核期间自 49 增至 51），这 **印证而非推翻** 本条的核心判断：dirty 计数是易变量，产品目录零 dirty 才是稳定量。
- **依据**: E-0033
- **不确定性**: 「新增 4 条为 shared-arteries（3）与 `0000-0005` 案卷（余）」这一构成分解 **不可回溯核实**（今天 shared-arteries 下已有 4 个 untracked）。该分解 **不承重**，我不因其不可核而对本条减分。
- **请求/下一步**: **两项。** ① 请本庭把本条的可采范围明确限定为 **「revision + branch + 三产品目录零 dirty」**，dirty 总数（无论 8 / 12 / 51）**不得进入任何裁定文本** —— 它在本案七小时内走了四个值。② 本条经复核可作为 **全批 12 条的时效锚点**：因产品目录在提交时与复核时均为零 dirty，本批全部行号引用不存在「提交后被改动」这一失效通道。
- **评估结论**: 已验证
- **证据编号**: E-0033
- **来源类型**: general
- **真实性**: **承重三项全部成立且今天仍成立。** 我在复核开始与结束各跑一次：`git rev-parse --short HEAD` → `b2385d5d`（两次一致，与 E-0001 及本批全部 11 条声明的 revision 相同）· `git branch --show-current` → `dev` ✓ · `git status --porcelain -- src electron unchain_runtime` → **两次均为空** ✓。**不可核项**：`git status --porcelain` 当时的 12 条。今天为 51 条（复核开始 49，结束 51）。本条 **已自陈「单次快照」**，故该差异是快照性质使然，**不是篡改，也不是本条的过失**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 主动对本庭 E-0001 所作的重测。**这一主动性提高而非降低其可靠性** —— 提交方在自己不被要求的情况下修正了本庭自己的登记数字，且明确标注「部分修正」而非「推翻」。其完整性限制「庭审期间是否有并发会话改动产品目录，我未持续监视」**是本条最有价值的一句**：本次复核相当于对该限制作了一次补测，答案是 **未被改动**。
- **相关性**: **相关且对全批承重。** 它声称支持「E-0001 的承重部分（产品代码锚点与 HEAD 一致）」并「部分修正其 dirty 计数」—— 两者均已坐实。**其真正的相关性甚至高于自陈**：它是本案唯一一条把「产品目录零 dirty」与「工作树整体 dirty」明确切开的证据，而这一切分正是本批其余 11 条得以被逐行复核的前提。
- **来源归类**: **内部来源。** 提交方自陈的 git 状态观察，本次由第二方在同一工作树上以同样四条命令 **原样复跑**，承重三项逐项吻合。同机同工作树，无独立第二环境。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0034

- **阶段**: 议案庭审
- **结论**: **已验证，本批引用精度最高的一条。** 十四个行号锚点 **全部零漂移**，三条可复跑命令 **输出逐项吻合**，九个测试断言行段 **逐段命中所述内容**。其自陈限制（未跑 `react-scripts test`，只主张「测试文件里写着这些断言」）**是精确的自我限缩，不是免责套话**。
- **依据**: E-0034
- **不确定性**: 「这些测试今天是绿的」我 **同样未跑**（本关只读）。承 S-0022 的实测，`react-scripts test` 把 jest `roots` 钉死在 `<rootDir>/src`，故该 suite 若跑，双 worktree 根隐患对它 **结构性免疫** —— 但仍未跑。
- **请求/下一步**: 引用时保留提交方自设的措辞（「测试文件里写着这些断言」）。**该措辞不必因本次复核而放宽** —— 我核的是文本，不是执行。
- **评估结论**: 已验证
- **证据编号**: E-0034
- **来源类型**: general
- **真实性**: **成立，逐项零漂移。** 产品源：`:32-51` = `REQUIRED_METHODS` 冻结数组，恰 18 项 ✓（`getStatus` 在 `:33` · `listSpaces` 在 `:38` · `getTree` 在 `:39`，**三个行号逐一命中**）· `:57` = `const ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/;` **逐字节一致** ✓ · `:59-67` = `resolveApi` 的逐方法 `typeof !== "function" → return null` ✓ · `:69-75` = `unavailableError` 自造 `context_v2_unavailable`（消息 `:71`、`error.code` `:73`）✓ · `:77-82` = `parseContextV2ErrorCode` ✓ · `:86-94` = `invokeBridge`（无 api → reject / 同步抛 → reject / 否则 resolve）✓ · `:102/107/108` = `getStatus`/`listSpaces`/`getTree` 三个纯透传行 ✓。测试源：`:39-56` 含 `expect(METHODS).toHaveLength(18)` 与键集 = `["isAvailable", ...METHODS]` ✓ · `:74-90` 含注释「the payload must arrive byte-identical」+ `toHaveBeenCalledWith(decidePayload)` ✓ · `:93-99` 与 `:155-160` 为两个不同的 fail-closed 变体（删 review triad / 删 `getSessionHead`）✓ · `:127-131` 为 bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝 ✓ · `:151-152` = `expect(api.getStatus).toHaveBeenCalledWith();` 无参转发 ✓ · `:162-177` 不吞码（`expect(rejection).toBe(conflict)`）✓ · `:179-189` 同步抛转拒绝，确以 `listSpaces` 举例 ✓ · `:191-196` 码解析含 `"no code here"` → `toBeNull()` ✓。**三条可复跑命令原样复跑，输出逐项吻合**：`grep -ln … src/SERVICEs/api*.js` **零命中**（exit 1）✓ · `ls src/CONTAINERs/` **仅 `config`** ✓ · `grep -c "cache\|inflight\|dedup" …` = **1**，且该行确为 `:24` 的注释 `never cache module-level state` ✓。**唯一非实质偏差**：称产品源「全文 125 行」，实为 **124 行**（文件以换行结尾）；测试文件称「197 行」**完全准确**。该 +1 与 E-0032 的 +1 同形，属计行口径，**不触及任何被引行号**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 在其自有边界（`src/SERVICEs/bridges/`）内的两文件整读 + 三条可复跑命令。提交方主动限定「未运行测试」并把主张压到「文件里写着」，**未把静态阅读伪装成执行观察**。
- **相关性**: **相关且充分。** 支持「丁全节与 A1/A2」成立。**「复核通过 E-0006 的 renderer facade 段行号（`:39,108`）」经我独立复验为真** —— `:39` 是白名单中的 `getTree`，`:108` 是 facade 中的 `getTree` 透传行，两者确为该方法在本文件的仅有两处。**「关闭 `code-owner-settings` E-0017 的完整性限制」亦成立** —— `ls src/CONTAINERs/` 确只有 `config` 一个目录，故「未穷举 provider」这一疑虑在结构上被关闭，不是被论证关闭。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 逐段读 + 三条命令原样复跑独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0035

- **阶段**: 议案庭审
- **结论**: **已验证。** 承重结论「`contextV2Bridge.getStatus` 在 renderer 生产代码中 **零调用点**」经原样复跑 **精确成立**。两条 grep 我逐条重跑，24 行与 19 行输出全部复现。**两处表述不精确，均不触及承重结论**：文件分布少算一个文件，「另外三个不相干的桥」实为更多。
- **依据**: E-0035
- **不确定性**: 与提交方同 —— 只覆盖字面标识符 `getStatus`，**未追经变量间接调用**（如 `bridge[name]()`）。我亦未追。
- **请求/下一步**: 承重句可原样采信。**若有发言要引用「12 处调用点」这个数字，须同时说明计数规则**（见下），否则读者会把一行 JSDoc 注释当成调用点。
- **评估结论**: 已验证
- **证据编号**: E-0035
- **来源类型**: general
- **真实性**: **承重项精确成立；两处枚举不精确。** ✓ **承重项**：`grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"` 复跑得 **24 行**，其中属 `contextV2Bridge` 的 **恰两处**：`src/SERVICEs/bridges/context_v2_bridge.js:33`（白名单）与 `:102`（定义）。**零调用点，逐字复现。** ✓ 第二条 grep 复跑得 **19 行**，其中 **无一行** 是 `contextV2Bridge.getStatus`。⚠ **不精确一**：「其余全部属于另外 **三个** 不相干的桥（`api.unchain` / `api.ollama` / `memory_vault_bridge`）或同名局部函数（`toast_host.js:89`）」—— 实测其余还落在 `src/SERVICEs/bridges/ollama_bridge.js`（4 行）与 `src/SERVICEs/test_bridge/index.js`（2 行）两个未列模块，且 `toast_host.js` 是 **两行**（`:89` 定义 `getStatusStyle`、`:150` 调用它）而非一行。⚠ **不精确二**：「既有调用点共 **12 处**，分布于 3 个 chat-bubble 文件 + `use_chat_stream.js`」—— **12 这个数字确实复现**，但只在一条特定规则下：`grep "contextV2Bridge\."` 的 19 个命中减去 7 个含 `isAvailable` 的命中 = 12。该 12 内含 **一行 JSDoc 注释**（`src/PAGEs/chat/hooks/context_v2_turn_mutation.js:9`，`* contextV2Bridge.getSessionHead() → contextV2Bridge.rebaseSession()`），而该文件是 **第五个** 文件，不在所述四个之内。真正的产品调用表达式为 **11 处**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 的可复跑 grep。两条命令原样给出且我原样复跑，**无手抄环节，无 E-0024 式偏差风险**。
- **相关性**: **相关且充分，就其承重方向而言。** 它声称「独立复核并确认 `code-owner-settings` E-0020 第 3 点（`getStatus()` 在 renderer 零消费者）」—— **该确认成立，且是本条的全部价值所在**。它同时声称「补充它已是承重方法这一相反方向的事实」（即 `getStatus` 虽零调用，却已是 `REQUIRED_METHODS` 成员、是可用性门的成立条件）—— 这一点由 E-0034 的 `:32-51` 与 `:59-67` 独立支撑，本次一并复验为真。**两处不精确不影响任一方向**：无论其余 `getStatus` 属三个桥还是五个模块，都不改变「属 `contextV2Bridge` 的只有定义与白名单两处」。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件，`b2385d5d`，第二方原样复跑两条命令 + 一次按文件的分布统计独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0037

- **阶段**: 议案庭审
- **结论**: **未验证 —— 一项计数不符，且与本条自己的 `来源定位` 相互矛盾。** 「42 个互不相同的码」与「不符 `^[a-z0-9_]+$` 的 0 个」**逐字节复现**；但「`context_v2_unavailable` 在 **9 个** 非测试点发出」**实为 10 个** —— 而本条 `来源定位` 自己列出的碰撞点恰好就是 **10 个行号**。计数与自陈列举不自洽。
- **依据**: E-0037
- **不确定性**: 42 是否穷尽，我 **不主张**（与提交方同 —— 只覆盖四文件的字面量，拼接构造未覆盖）。「字符集恒定是否为有意约定」仍归 `code-owner-runtime`（本案 E-0063 已作答，不在本批射程）。
- **请求/下一步**: **三项。** ① 请提出方把 9 更正为 **10**，或说明其排除了哪一个及为何。② **本次复核顺带了结了 E-0054 完整性限制 (2) 登记的「差异未追」**：E-0054 计得 11，因其所用的 `grep -v "/tests/"` 过滤器 **未能滤掉 `tests/test_memory_v2_runtime.py:24`**（输出路径无前导 `./`，`/tests/` 不成为子串）—— 该滤失在 E-0037 提交的命令里 **同样存在**，我复跑时原样复现。**正确数字是 10**，E-0037 少 1，E-0054 多 1（多的那个是测试文件）。③ 更正后本条的承重部分可再议 —— **失效点在计数，不在结论方向**。
- **评估结论**: 未验证
- **证据编号**: E-0037
- **来源类型**: general
- **真实性**: **两项精确，一项不符。** ✓ 原样复跑其命令（`cd unchain_runtime/server`）：`wc -l < codes.txt` → **42**，逐字节吻合 ✓ · `grep -vE '^[a-z0-9_]+$' codes.txt` → **零输出**，逐字节吻合 ✓。✗ 第三条命令 `grep -rn '"context_v2_unavailable"' --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"` → **11 行**，其中 1 行为 `tests/test_memory_v2_runtime.py:24`（过滤器失效所致），**真实非测试点为 10**：`memory_v2_runtime.py:702` · `memory_v2_store.py:1527` · `route_memory_v2.py:259, 333, 388, 504, 591, 719, 804, 856`。**这 10 个恰是本条 `来源定位` 逐一列出的 10 个行号** —— 故本条的 9 与它自己的列举冲突。我另核实这 10 处 **全部是真实发出点**（逐一确认为 `raise MemoryV2Error("context_v2_unavailable", …)`，含 `memory_v2_store.py:1527` 的 `_connect` 闭连接分支与 `memory_v2_runtime.py:702` 的 `UNCHAIN_DATA_DIR` 未配置分支），**不存在「10 个出现点但只有 9 个发出点」这一可能的辩解**。✓ 另两项命中：`route_memory_v2.py:333` 的上下文经我读取 **完全如其所述** —— `_read_runtime_for_store_owner` 定义于 `:315`，`if store_owner != STORE_OWNER_UNCHAIN: return _runtime()` 在 `:327`（确在其紧邻上方），`:332-337` 为 `raise MemoryV2Error("context_v2_unavailable", "Context V2 storage is not configured", status_code=503, retryable=True)`，**503 与 `retryable: True` 逐字为真**。我方 `src/SERVICEs/bridges/context_v2_bridge.js:69-74` 的自造点亦命中（已在 E-0034 复核中确认）。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 的可复跑 grep，**但结论跨入 `code-owner-runtime` 边界**（本条自陈只作「请 runtime 确认」的锚点，这一自我限缩是恰当的）。命令原样给出，无手抄，前两项复现完美 —— **可靠性本身不低，失效点是一次计数疏漏**。
- **相关性**: **方向相关，承重不足（因计数）。** 它声称支持「乙 §2.3 解析面按字符集开放」—— 由 42/0 两项 **充分支持**，该部分不受计数错误影响。它声称支持「§2.4 码碰撞，且 sidecar 那一侧在读路径上」—— **碰撞事实成立**（同一字面串 `context_v2_unavailable` 既由 renderer facade `:69-74` 自造，又由 sidecar 至少 10 处发出），**读路径上的那一处（`:333`）亦经我独立核实为真**。故「碰撞」这一实质发现 **不依赖 9 还是 10**。**但依本关标准，承重复核不放行计数不符的登记** —— 请更正后再议，届时其承重范围应为「碰撞成立 + 42 码下界 + 字符集今天恒定」。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件字面内容，`b2385d5d`（`unchain_runtime` 零 dirty），第二方原样复跑三条命令 + 逐点读取上下文独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0038

- **阶段**: 议案庭审
- **结论**: **已验证，且本庭点名的推断标注问题 —— 经查，标注是干净的。** 十一个行段锚点全部命中；其最尖锐的一句「**无任何测试覆盖 `/status` 非 2xx 分支**」经我独立穷举 **确认为真**。推断部分在本条内 **三处标注**（标题、完整性限制 (1)、证据类型判据），且我逐一追查了案卷内全部四处再引用点，**未发现任何一处以事实口吻裸用**。
- **依据**: E-0038
- **不确定性**: 本条的 **结论**（shipped 配置下 `getStatus()` reject）依旧是推断，**本次复核未改变其地位** —— 我只核了 `service.js` 一侧的代码事实，另一乘数（`code-owner-runtime` E-0010 b3）是须查类，其审查（S-0007）已把关键臂收窄。**推断 × 收窄后的须查类 = 仍是推断。**
- **请求/下一步**: **两项。** ① 本条的 **代码事实部分可作为事实引用**；**结论部分不可**，须保留其「推断」标签 —— 本庭 S-0012 已在分歧表的「自陈的弱点」列做到了这一点，**请在后续裁定文本中维持该形态**。② 一处未标注的转述（见真实性末段），请提出方在采纳时改为逐字原文或标明为转述。
- **评估结论**: 已验证
- **证据编号**: E-0038
- **来源类型**: general
- **真实性**: **成立，逐项。** `service.js:186-190` = `createContextV2Error`，函数体确为 `new Error(\`[${code}] ${message}\`)` + `error.code = code` ✓ **逐字一致** · `:1733-1782` 框住 `readJsonResponse` 全函数 ✓，其中 `:1740-1771` 确为 `!response.ok` 分支，`parsed?.error?.code` 的提取在 `:1746-1750`、`error.code = errorCode` 在 `:1770` ✓ · `:1892-1940` 精确框住 `contextV2Request` 全函数 ✓（`:1893` 首行即 `ensureMisoReady()`，与 S-0014 的独立发现吻合）· `:1897-1906` 为就绪门，**`:1898` 第一个条件确为 `endpoint !== \`${CONTEXT_V2_ENDPOINT}/status\` &&`** ✓，故「`/status` 必定真的发出」为真 · `:1931-1939` 为 catch 块，码保留 + 消息替换 ✓ · `:1945-1986` 精确框住 `getContextV2Status` 全函数 ✓，`:1946` 确为 `if (unchainStatus !== "ready" || !unchainPort) {`、短路块止于 `:1957`、`:1958` 确为 `const payload = await contextV2Request("GET", …/status)` ✓。测试锚点：`:210-247` 为 200 分支的八字段投影（`toEqual` 全等，含 `counts` 不得穿透的断言）✓ · `:249-288` 为短路分支，`:277-287` 确为 `resolves.toEqual({…})` + `expect(fetchImpl).not.toHaveBeenCalled()` ✓。**「无任何测试覆盖 `/status` 非 2xx 分支」经我独立穷举确认为真**：`getContextV2Status` 在该 49KB 测试文件中仅 3 次出现（`:16` 方法名清单 · `:225` 200 测试 · `:277` 短路测试），全文唯一的 `ok: false` 在 `:1332`（status 409，不在 `/status` 路径上）。preload grep 三行号（`:42 getStatus` / `:81 listSpaces` / `:86 getTree`）亦全部命中，且我整读全文确认 preload 确为纯 `ipcRenderer.invoke` 透传，无重包无归一 ✓。**一处未标注的转述**：净内容把 catch 写作 `const code = error?.code || "context_v2_failed"`，原文为 `const code = error && typeof error.code === "string" && error.code ? error.code : "context_v2_failed";`。二者在承重方向（码保留/缺码兜底）上等价，**但原文更严**（非字符串的真值 `.code` 会被原文丢弃、被转述保留）。该字段名为「净内容」非「关键原文」，故不构成引文失真，但读者可能误当逐字。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-electron` 的 `service.js` 与 `electron/tests/**`，并已在完整性限制 (2) 主动声明「权威结论归其所有」。这一自我限缩恰当。
- **相关性**: **相关；代码事实充分，结论部分依设计即不充分且已被标注。** **关于本庭点名核实的推断标注 —— 我的结论是标注干净，四处再引用全部带标签**：① 本条内 **三处** 标注（标题括注、完整性限制 (1) 明写「乘积只能是推断」、证据类型判据明写「不得作为事实引用」）。② `record.md:1108`（提交方自己的 S-0011 结论）以肯定语气写「在最需要它作答的那一态里它不 resolve，它 reject（E-0038）」—— **但同一篇发言 6 行后（`:1114`）设专节「二 · 甲 的核心论断里有一段是 *推断*，不是观察」逐字撤回该语气并请 `code-owner-electron` 确认或推翻**。依 S-0022 已确立的判据（「宽引用且有自限」≠「宽引用且无自限」），读完整篇发言者不会被误导。③ `record.md:1148`（A3 拟裁定条文）以肯定语气复用 —— **这是四处中最需注意的一处**，但其命题形态是 **禁止性的**（「判态不得只读 `getStatus` 的字段」），即便推断为假，该禁令的代价也只是保守，不会致错。④ `record.md:1487`（本庭 S-0012 的分歧表）**在同一行的「自陈的弱点」列原样写入了「两个都不是产品运行观察」**，且 S-0012 的不确定性栏明记「三方各自都明确标注了自己那一半是推断而非观察」。⑤ `record.md:1178` 以「读主进程控制流」开头，已自带静态阅读的框定。**未发现任何一处把该推断作为既定事实写入且无任何标签。**
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`，第二方以 `sed` 逐段读 + 一次穷举 grep（`/status` 非 2xx 覆盖）+ 一次 preload 全文整读独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0039

- **阶段**: 议案庭审
- **结论**: **已验证（就其自证类的代码事实部分），并按本庭指示 *以自证类* 复核，未因标题措辞改分类。** 四个 `service.js` 行段与三个 renderer 行号 **全部精确命中**，其核心代码事实 ——「主进程对数据调用无合成负值短路，该分支为 `getContextV2Status` 独有」—— **经我逐函数对读确认为真**。其结论部分依其自陈受所联合的须查类约束，**该约束在本次复核中不减反增**（见相关性）。
- **依据**: E-0039
- **不确定性**: `store_owner=unchain` 分支下 `getTree` 的实际码 **至今无人实跑**（本条完整性限制 (2) 自陈，E-0010 审查 S-0007 亦记录 runtime 未能实跑，`import unchain` 失败）。**我同样无法填补**（本关只读，不起 sidecar）。
- **请求/下一步**: **两项。** ① 请把本条的可采范围切成两段：**代码事实段**（主进程数据调用无合成负值出口）**可作为事实引用**；**判别器结论段**（空态与未启用态落在两个不相交分支上，单次调用即可区分）**须绑定 E-0010 经 S-0007 收窄后的作用域**。② **该收窄对本条尤其咬**：S-0007 已认定「200 空态臂 **只在 `store_owner=pupu_legacy` 下取得，而 Electron 从不发出该值**」—— 而 `getTree` 判别器恰恰需要那条 200 空态臂。故在 Electron 实际会发出的两个 owner（`unchain` / `off`）之下，**判别器的「resolve 臂」今天尚无任何产品配置下的观察支撑**。
- **评估结论**: 已验证
- **证据编号**: E-0039
- **来源类型**: general
- **真实性**: **代码事实成立，逐项。** `service.js:2098-2116` **精确框住** `listContextV2Spaces`(`:2098-2106`) 与 `getContextV2Tree`(`:2108-2116`) 两个完整函数，**两者均直接进入 `contextV2Request`，无任何前置短路分支** ✓ · `:1892-1940` 为 `contextV2Request` 全函数，其出口 **恰为两类**：`readJsonResponse` 的成功返回，或三处 `throw`（就绪门 `:1902` / fetch 失败 `:1918` / catch 重包 `:1938`）——「唯一出口是 200 载荷或抛」**成立** ✓ · `:1946` 确为合成负值短路的判定行，且该分支 **确为 `getContextV2Status` 独有**（我复核 `:2098-2116` 与 `contextV2Request` 全文，无第二处 `return { available: false, … }` 形态的短路）✓ · renderer 侧 `context_v2_bridge.js:86-94`（`invokeBridge`）· `:107`（`listSpaces` 透传）· `:108`（`getTree` 透传）**三处全部命中**（已于 E-0034 复核中逐行确认）✓。**分类经本庭 S-0016 更正后为自证类，本次即按自证类复核** —— 标题括注「与 `code-owner-runtime` E-0010 联合，其为须查类」指的是被联合的那一条，我未据该子串改判。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-electron` 的 `service.js`，并已在完整性限制 (3) 声明「归 `code-owner-electron` 确认」。其对所联合证据的依赖关系 **主动且完整地登记在完整性限制 (1)**（「该两条为须查类……其被推翻则本条随之被推翻」），**这是本条最值得肯定的一点** —— 它把自己的可证伪条件写在了脸上。
- **相关性**: **代码事实相关且充分；判别器结论相关但今天不充分。** 支持「A3」与「丙 §3.3」的代码事实半 —— **充分**。「部分反驳 F2（`code-owner-settings` 的『唯一无绕行方案』定性）」—— 结构论证成立，**但其充分性取决于两个前提**：(a) 后端不存在「store 关着却回 200」的出口 —— 由 E-0010 支撑，S-0007 未推翻；(b) 存在「空 store → 200」的出口 —— **由 E-0010 支撑，但 S-0007 已认定该臂只在 Electron 从不发出的 `pupu_legacy` 下取得**。前提 (b) 缺了产品配置下的观察，判别器的两臂就只证得一臂。**故本条不足以单独承载「单次 `getTree` 调用即可区分空态与未启用态」这一裁定级结论**；它足以承载的是「**在主进程这一层，`getTree` 的 resolve/reject 二分未被任何合成负值污染**」—— 这一句完全成立，且是本条对本案的真实贡献。
- **来源归类**: **内部来源。** 仓内文件字面内容（自证类）+ 对他人已提交须查类证据的联合推理。`b2385d5d`，第二方以 `sed` 逐函数对读 + 交叉查阅 E-0010/E-0012 及其审查结论（S-0007/S-0008）独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0040

- **阶段**: 议案庭审
- **结论**: **已验证。** 四个行段锚点全部命中，三条 grep 输出全部复现，其中「**四个既有 V2 消费者中 `setInterval` 命中 0 处**」经我逐文件重跑 **精确成立**。提交方自陈未逐行确认的那个 interval（`use_chat_stream.js:10721`），**我读了上下文并可确认其与 V2 读平面无关** —— 该限制可解除。
- **依据**: E-0040
- **不确定性**: 与提交方同 —— 只覆盖字面标识符，未追经变量间接的定时器构造（如 `const f = setInterval` 别名）。我亦未追。
- **请求/下一步**: **两项。** ① 「V2 读平面今天零轮询」可作为事实引用。② 本条自陈的完整性限制（`:10721` 未逐行确认）**经本次复核可以解除** —— 请在采纳时一并记录，避免下游发言重复携带一个已被填补的缺口。
- **评估结论**: 已验证
- **证据编号**: E-0040
- **来源类型**: general
- **真实性**: **成立，逐项。** `:734-736` 命中（`:734` = `export const MemoryV2PendingReviews = ({ ownerChatId, isDark }) => {`，`:736` = `const available = Boolean(owner) && contextV2Bridge.isAvailable();` **逐字一致**）✓ · `:750-783` 精确框住 `loadPending` 的 `Promise.all` 四路，**`:782` 确为 `contextV2Bridge.listSpaces({ ownerChatId: owner }),`，且确在生产代码路径而非测试** ✓ · `:800-802` **逐字一致**：`spaces: Array.isArray(spacePayload?.spaces) ? spacePayload.spaces.slice(0, MAX_PENDING_ITEMS * 2) : []` —— 「把『没有 space』与『载荷畸形』折叠成同一个空数组」**为精确描述** ✓ · `:817-834` 覆盖挂载 `useEffect`（`:819-826`，`if (available) loadPending();`）✓。**计数复现**：对四个既有 V2 消费者（`memory_v2_pending_reviews.js` / `memory_v2_journal_reload.js` / `memory_v2_trace_audit.js` / `context_v2_turn_mutation.js`）各跑一次 `grep -n "setInterval\|poll"`，**四个文件全部零命中** ✓。`grep -rn "listSpaces\|listEntries\b" src` 复跑：产品命中确为 `memory_v2_pending_reviews.js:782` 一处 + bridge 自身的定义/白名单四行，**`listEntries` 在产品代码中零消费者**（本条未主张，我顺带登记）。**提交方自陈未核的那一项，我核了**：`use_chat_stream.js` 全文 `setInterval` **恰一处**（`:10721`），其上下文（`:10715-10730`）调用 `getRunForTest({ id, attempt_id })` 并捕获 `error?.code === "run_not_found"` —— **属测试桥轮询，与 Context V2 读平面无任何关系，确认无关**。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` **跨界只读引用** `code-owner-chat-bubble` 的文件，并已在证据类型判据中声明「处置权归其所有」。grep 可复跑，无手抄。
- **相关性**: **相关且充分。** 「修正记录：`listSpaces` 并非新消费者，第一跳今天已在跑」—— **成立且重要**，`:782` 是活的生产调用点。「支持 丙 §3.2 / §3.4 与 A5」成立。**「V2 读平面今天零轮询」这一句的证明力值得单独标定**：它由四个文件的零命中直接导出，**是一个全称否定命题在有限枚举上的完全验证**（枚举面即「既有 V2 消费者」四个文件），故在该枚举面上 **充分**；但它 **不蕴含**「未来新增消费者也不会轮询」，引用时不得外推。本条自己给出的成因（`:800-802` 之后的折叠即卸载）由 `code-owner-chat-bubble` E-0056 独立确认，不在本批射程。
- **来源归类**: **内部来源。** 可复跑 grep + 仓内文件字面内容，`b2385d5d`（`src` 零 dirty），第二方以 `sed` 逐段读 + 三组 grep 重跑 + 一次上下文补测独立复核。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0041

- **阶段**: 议案庭审
- **结论**: **已验证 —— 本批唯一一条输出逐字节全等的条目。** 11 个 locale 名称、13 键计数、missing/extra 全空、5 个 `boot.*` test 的 5 个行号，**全部逐字复现，零偏差**。其对 `code-owner-settings` 「12 个键」的修正 **成立**（实为 13）。
- **依据**: E-0041
- **不确定性**: 与提交方同 —— 未核实这 13 键是否全被 `t()` 引用，也未核是否存在未定义于 `en.json` 的 `t("memory_inspect.*")` 引用。**那是 `i18n-coverage` skill 的作业面，我亦未跑。**
- **请求/下一步**: 可直接采信。若裁定要压在「新增 UI 无需补翻译」上，**须另跑 `i18n-coverage`** —— 本条证的是「已定义的 13 键在 11 语言齐平」，不是「新增文案不需要补键」。
- **评估结论**: 已验证
- **证据编号**: E-0041
- **来源类型**: general
- **真实性**: **成立，逐字节。** 原样复跑其 python3 脚本：11 个 locale 文件名 **逐一吻合**（`de` `en` `es` `fr` `it` `ja` `ko` `pt-BR` `ru` `zh-CN` `zh-TW`），**每个 13 键，missing 与 extra 全部为 `-`** —— 与登记完全一致，无一字差。`grep -n "describe\|test(" src/SERVICEs/boot_locale_parity.test.js` 复跑：`:59` describe · `:60` `test("all 11 locales are covered")` · `:64` 失败键来自 main · `:73` 每 locale 定义全部 `boot.*` · `:89` 无多余 boot 键 · `:106` 非英文确实被翻译 —— **5 个 test 的 5 个行号逐一命中，且确实全部围绕 `boot.*` 而非 `memory_inspect.*`** ✓。
- **可靠性**: **内部来源**，`code-owner-shared-arteries` 在其自有边界（`src/locales/`）内的可复跑脚本 + grep。**脚本原样给出且我原样复跑**，无手抄、无环境依赖（纯 stdlib）、对固定 revision 确定性。
- **相关性**: **相关且充分。** 「修正 `code-owner-settings` 第五节的『12 个键』（实为 13）」—— **成立**。「支持正文第七节全部三条」—— 就 locale 齐平这一事实而言充分。**一处须随证据引用的射程界定（本条已自陈，我确认其必要）**：`boot_locale_parity.test.js` 的 5 个 test **全部只覆盖 `boot.*`**，**没有任何测试守护 `memory_inspect.*` 的齐平**。故「今天 13 键在 11 语言齐平」是 **一次快照观察，不是被测试锁住的不变量** —— 引用时不得读作「新增 `memory_inspect` 键会被 CI 拦住漏翻」。
- **来源归类**: **内部来源。** 可复跑命令 + 仓内文件字面内容，`b2385d5d`（`src` 零 dirty），第二方原样复跑脚本与 grep 独立复核，输出逐字节比对。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0042

- **阶段**: 议案庭审
- **结论**: **已验证。** `关键原文` 块的 **每一行原文与每一个行号逐字节命中**，跨两个文件共十一个锚点零漂移。其完整性限制中那句自我论证 ——「`onInspectMemory` 在该测试文件仅出现 1 次，故『无测试断言其参数』不受未穷举的限制影响」—— 经我 grep **精确成立**，该自限逻辑正确。
- **依据**: E-0042
- **不确定性**: 与提交方同 —— **未运行应用，未观察实际右键行为**。本条是纯静态的代码形状证据。
- **请求/下一步**: 可直接采信为代码事实。**其决定性主张（`node.chatId` 在 character 分支内已被求值两次，故在 `:207` 处被丢弃不是「拿不到」而是「没传」）** 经复核逐字成立，可作为事实引用。
- **评估结论**: 已验证
- **证据编号**: E-0042
- **来源类型**: general
- **真实性**: **成立，逐字节。** `side_menu_context_menu_items.js`：`:24-25` = `const isCharacterChatNode = (chatId) => chatStore?.chatsById?.[chatId]?.kind === "character";` ✓ · `:194` = `if (node.entity === "chat") {` ✓ · `:195` = `const chat = chatStore?.chatsById?.[node.chatId];` ✓ · `:196` = chatTitle 行 ✓ · `:197` = `if (isCharacterChatNode(node.chatId)) {` ✓ · `:198-201` = `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")` ✓ · `:207` = `onInspectMemory && onInspectMemory(memorySessionId, chatTitle),` ✓ · `:223` = `onInspectMemory && onInspectMemory(node.chatId, chatTitle),` ✓ —— **八行逐字节一致，无一处漂移**。`side_menu.js`：`:237-241` = `useState({ open:false, sessionId:null, chatTitle:"" })` ✓ · `:296-298` = `handleInspectMemory` ✓ · `:425-436` = `buildSideMenuContextMenuItems({…})` 调用，`onInspectMemory: handleInspectMemory` 确在 `:433` ✓ · `:772-779` = `<MemoryInspectModal …/>` JSX ✓。测试文件：`:277-293` 确为一次 `buildSideMenuContextMenuItems` 调用（`onInspectMemory: jest.fn()` 在 `:285`）+ **恰四条** `items.some((item) => item?.label === …)` 断言（`:289-292`），**无任何对 `onInspectMemory` 调用参数的断言** ✓。**其自限的关键前提经我独立 grep 确认**：`grep -n "onInspectMemory" side_menu_context_menu_items.test.js` → **恰一行（`:285`）**，故「未穷举全部 7 个调用点」这一限制 **确实不影响** 结论。
- **可靠性**: **内部来源**，`code-owner-chat-core` 在其自有边界（`src/COMPONENTs/side-menu/`）内的定点读取 + grep。提交方的 `关键原文` 采用逐行标注行号的形式，**便于逐字节比对，这一呈现形式本身提高了可核性**。grep 复跑结果与其登记的调用点分布一致。
- **相关性**: **相关且充分。** 支持「甲（C4 仍然有效）」与「乙（两分支应传 `node.chatId`）」—— 由 `:207` 与 `:223` 的对照直接支持。**「加强 E-0016」这一主张经复核为真且是本条的核心贡献**：E-0016 只登记了两个调用点的存在，本条补上的是 **`node.chatId` 在 character 分支内已被求值两次**（`:195` 索引 `chatsById`、`:197` 传给 `isCharacterChatNode`）—— 这把「`:207` 没传 `node.chatId`」从「可能拿不到」精确化为「已在手里但没传」，**是一个实质不同的命题，且完全由原文支撑**。**一处射程界定**：本条证的是代码形状，**不证运行时右键行为**（其已自陈）；且 `:277-293` 那一处测试的存在 **不构成对参数契约的守护** —— 四条断言只查菜单项 label，故新增/改动 `onInspectMemory` 的实参 **不会被现有测试拦住**。
- **来源归类**: **内部来源。** 仓内文件字面内容与行号，`b2385d5d`（`src` 零 dirty），第二方以 `sed` 逐段读三个文件 + 一次 grep 穷举独立复核。

---

## 批次收尾

**已验证 10 条**：E-0030 · E-0031 · E-0033 · E-0034 · E-0035 · E-0038 · E-0039 · E-0040 · E-0041 · E-0042
**未验证 2 条**：E-0032（列举集含一个错误成员，推论「唯一无上界读方法」被 `listEntries` 反驳）· E-0037（「9 个非测试点」实为 10，且与本条自己的 `来源定位` 列举冲突）

**两条须提请本庭注意的溢出发现**（超出单条，故在此单列）：

1. **`listEntries` 是第二个无上界读方法。** 由 E-0032 复核带出。preload 无 `limit`，main 无 `CONTEXT_V2_PAGE_LIMIT_MAX`，且 `include_descendants` 默认 `true`、`parent_path` 可省。**这是对封顶议题的加强，不是削弱** —— 请勿因 E-0032 判未验证而连带下调该关切。
2. **E-0054 完整性限制 (2) 登记的「差异未追」已由本次复核了结。** 正确数字是 **10**：E-0037 记 9（少 1），E-0054 记 11（多 1，多的是 `tests/test_memory_v2_runtime.py:24`，因两者共用的 `grep -v "/tests/"` 过滤器对无前导 `./` 的路径失效）。

**三条时效性结论**（重申，全批共用）：锚点 `b2385d5d` 未漂移 · 三产品目录在复核首末两次测量中均零 dirty · 工作树整体 dirty 计数本案内已走过 `8 → 12 → 49 → 51`，**不适合承载任何裁定**。
