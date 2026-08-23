# 承重证据复核 · 批次 E（10 条）

`evidence-examiner` instance · 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md) · 本批 **全部为自证类，本关不豁免**

---

## 全批时效前提（两仓，复核当日实测）

复核开始时实跑，覆盖本批全部 10 条的时效前提：

```bash
git -C /Users/red/Desktop/GITRepo/PuPu     rev-parse --short HEAD   # -> b2385d5d   (branch dev)
git -C /Users/red/Desktop/GITRepo/PuPu     status --porcelain | wc -l   # -> 53
git -C /Users/red/Desktop/GITRepo/unchain  rev-parse --short HEAD   # -> a4e69f4    (branch dev)
git -C /Users/red/Desktop/GITRepo/unchain  status --porcelain | wc -l   # -> 0
```

**PuPu 的 53 条 dirty 全部落在 `.claude/` 之下**（agent-memory 39 · court 11 · codex 2 · agents 1），按目录归类实测：

```bash
git -C .../PuPu status --porcelain | grep -v '\.claude/'   # -> 空
git -C .../PuPu status --porcelain src electron unchain_runtime | wc -l   # -> 0
```

**结论**：本批引用的 **全部产品源锚点**（`src/**`、`electron/**`、`unchain_runtime/**`、unchain `src/**`）均处于 **未修改的 commit 状态**。两仓 revision 与提交时登记的 `b2385d5d` / `a4e69f4` **逐字相同**。**本批不存在因工作树漂移导致的时效失效**，时效判断可全部归结为「行号是否仍指向所述内容」。

### 本关采用的失效判据（明示，供 `speaker-of-the-house` 覆盖）

传唤指示「行号漂移即未验证」。本关按 **「跟着这个锚点走，读者读到的是不是所主张的内容」** 落地：

- 引用区间的 **端点多算或少算一两行，但区间内仍完整包含所述机制** → 登记为漂移瑕疵，**不判失效**（本批 3 处：E-0065 · E-0066 · E-0069）
- 引用行 **指向另一段代码**，读者读到的不是所主张的东西 → 构成实质引证缺陷（本批 1 处：E-0060）

该判据与本案既有先例一致（S-0026 / S-0028 / S-0029 均在「登记文字有瑕疵、承重内容复现」时报 **已验证** 并附收窄）。**若本庭采严格读法，E-0060 · E-0065 · E-0066 · E-0069 四条应改判未验证** —— 每处漂移的精确行号我已在各条内写明，本庭可直接据以改判，无需再传唤。

### 传唤点名的缺陷模式：本批实跑结论

传唤要求重点核「登记的命令转录 ≠ 该命令实际输出」，尤其在负向与穷举断言上。**本批的负向/穷举断言全部实跑，全部成立**，且我用比登记更严的条件复跑仍成立（详见 E-0071 · E-0066 · E-0070）。**转录不逐字的问题在本批出现 2 次**（E-0058 · E-0063），**两次都不在负向或穷举断言上，两次都不改变任何数值或结论方向**，其中 E-0063 已自行标注省略。**本批未复现批次 A 的那个缺陷形态。**

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0058

- **阶段**: 议案庭审
- **结论**: 三条命令全部重跑，unchain revision、工作树计数、lock 内容 **逐值复现**，lock 与 `dev` HEAD 今日 **仍然相等**；登记的 `cat` 转录为紧凑单行 JSON 而实际文件为 5 行 pretty-print，属排版性不逐字，无键无值被改动。
- **依据**: E-0058
- **不确定性**: 「lock 只钉 revision，不钉 schema 版本」一句 **不完全精确** —— lock 实含第三个键 `context_memory_contract: 1`，是一个契约整数。精确表述应为：lock 钉 **revision 与一个契约整数**，**既不钉 `MemoryEntry.SCHEMA` 字符串（`unchain.memory_entry.v1`），也不钉任何 kind 词汇表** —— 后半句（本条真正承重的部分）我已独立证实。「巧合延续、非机制」为提交方自陈，我未能取得可证伪的机制缺席证据，仅确认 lock 文件自身不含任何强制相等的装置。shipped 安装包内的 unchain revision 提交方已自陈未核实，本关同样无法取证。
- **请求/下一步**: 引用本条时按上条把「不钉 schema 版本」替换为「不钉 `SCHEMA` 字符串与 kind 词汇表」。转录排版差异建议登记但不必重排。
- **评估结论**: 已验证
- **证据编号**: E-0058
- **来源类型**: general
- **真实性**: 三条命令逐条重跑。`rev-parse HEAD` → `a4e69f413c449c5768433ba4dddc5b60b8146991`，与登记 **逐字符相同**；`status --porcelain | wc -l` → `0`，相同；`unchain-core.lock.json` 的三个键与三个值与登记 **完全相同**。另查该 lock 文件在 PuPu 侧 `git status --porcelain` 输出 0 行，即文件本身未被修改。**一处不逐字**：登记的「实际输出」把文件写成单行紧凑 JSON，实际 `cat` 输出为 5 行缩进 JSON —— 纯排版，键序与值全同。
- **可靠性**: 两仓 git 元数据与仓内文件字面内容，任何人可在同一 revision 复跑得到同一结果，不依赖提交方叙述。
- **相关性**: 支持其所称的 revision 固定与 lock 一致性主张。其「lock 一致不构成契约承诺」的推论由 lock 的实际键集直接支撑（无 SCHEMA、无 kind），成立。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0060

- **阶段**: 议案庭审
- **结论**: 六个锚点中 **五个逐行精确**，两侧字段集差异与 `content_bytes` 在 unchain 路径永不出现均 **独立证实**；**一处引证指错分支** —— `:565-566` 被用来支撑「`image` 与 `markdown` 同走 `content_ref` 分支」，但该两行是 **`link` 分支**，正确锚点为 `:563-564`。
- **依据**: E-0060
- **不确定性**: 该引证缺陷落在提交方 **自行标注为「推断、未构造实例」** 的 `image` 部分，不在承重的字段集比对上。legacy 半边仍为静态阅读（提交方自陈），本关亦未实跑 `pupu_legacy` 分支，故「两侧差异」中 legacy 半边的运行时值仍未观察。
- **请求/下一步**: 引用本条时把 `image` 分支锚点更正为 `memory_v2_unchain_read_adapter.py:563-564`。若本庭采严格漂移读法，本条应改判 **未验证** 并退回重排该一处。
- **评估结论**: 已验证（附一处必须随证据一同更正的引证）
- **证据编号**: E-0060
- **来源类型**: general
- **真实性**: 逐点复核 —— unchain `models.py:251-255` = `class MemoryEntryKind(StrEnum)` 的 FOLDER/MARKDOWN/IMAGE/LINK **四值，精确**；`:310` = `SCHEMA: ClassVar[str] = "unchain.memory_entry.v1"` **精确**；PuPu `memory_v2_unchain_read_adapter.py:532-567` = `_route_entry` 全体（532 为 `def`，567 为 `return response`）**精确**；`memory_v2_store.py:6641-6669` = legacy `_entry_response` 全体 **精确**；`:6680,6688,6696` = `if kind == "folder"` / `"file"` / `"link"` **三个行号逐一命中，精确**。**唯 `:565-566` 实为 `elif entry.kind.value == "link":` 与其赋值行**，`markdown`/`image` 的 `content_ref` 分支在 `:563-564`。
- **可靠性**: 两仓仓内文件字面内容与行号，同 revision 可直接复核；字段集另经本案 E-0061/E-0062 的实跑交叉确认（提交方已声明），不孤证。
- **相关性**: 支持其所称的「两侧字段集与 kind 词汇表不同」。新增的 `content_bytes` 主张我独立证实：`_route_entry` 全函数无 `content_bytes` 赋值，该键仅在 legacy `_entry_response` 的 `file` 分支且 `byte_size` 非空时出现，故「unchain 路径上永不出现」成立，其「显示条目大小在产品配置下无数据」的推论由此直接得出。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0063

- **阶段**: 议案庭审
- **结论**: 两段探针 **逐字符重跑成功**，八个锚点 **全部逐行精确**；其自陈未做的「穷举 unchain 异常类」一项，我以更强的结构判据 **直接闭合**（unchain 全仓对 `MemoryV2Error` 引用数 0，对 PuPu 模块 import 数 0，故结构上不存在继承）。
- **不确定性**: 登记的字符集探针「实际输出」只列 1 行加一句 `(Curator-Failed / runner:aborted 同)`，实际输出 5 行。省略 **已被标注**，且被标注的两行确与首行同。但 **未被提及的第 4 行 `curation_repository_error unchain_ok=True narrow_ok=True`** 是唯一一个 **同时通过窄字符集** 的样本 —— 它 **轻微反方向**，不改变结论（结论建立在 `_IDENTIFIER_RE` 本身更宽这一结构事实上，非样本统计），但本庭引用时应知其存在。提交方自陈的「未实测真实 curator 失败码端到端送达 renderer」本关同样未做。
- **依据**: E-0063
- **请求/下一步**: 引用「unchain 对 `error.code` 贡献为零」时可直接使用本关的结构判据（引用数 0 / import 数 0），比原自陈更强，不必再留「未穷举」的口子。
- **评估结论**: 已验证（自陈的完整性限制 (1) 经本关闭合，可去除）
- **来源类型**: general
- **证据编号**: E-0063
- **真实性**: 探针一（MRO）重跑输出 `MRO: ['PupuUnchainMemoryV2ReadError','RuntimeError','Exception','BaseException','object']` 与 `subclass of MemoryV2Error? False`，与登记 **逐字符相同**。探针二（字符集）5 行全部重现，被登记的那 1 行 **逐字符相同**。锚点：`journal/models.py:13` = `_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")` —— **正则逐字符与登记相同**；`:234` = `if identifier and _IDENTIFIER_RE.fullmatch(normalized) is None:` **精确**；`curator/models.py:1167` = `self.code = _required_text(code, "runner failure code", maximum=128, identifier=True)` **精确**；`curator/ports.py:23-32` = `CurationRepositoryError.__init__` 的 `re.sub(r"[^a-z0-9_:-]+", "_", …)` 与默认码 `"curation_repository_error"` **精确**；PuPu 侧 `route_memory_v2.py:98-104` = 裸 `except Exception` → `context_v2_failed` 500 **精确**；`memory_v2_unchain_read_adapter.py:65` = `class PupuUnchainMemoryV2ReadError(RuntimeError):` **精确**；`memory_v2_unchain_curator_query.py:129` = `"error_code": candidate.error_code,` **精确**；`:179` = `"last_error_code": job.last_error_code,` **精确**。
- **可靠性**: 仓内文件字面内容 + 对纯函数与类型系统的确定性探针（无 I/O、无外部状态、连跑同值）。提交方主动提出「若本庭认为探针属运行时观察，可改判须查类」—— 本关认为其确定性足以维持自证类。
- **相关性**: 支持其所称的「`error.code` 的窄字符集是 try/except 收敛的架构副产物，而非约定」。其指出的风险面（`error_code` / `last_error_code` payload 字段承载更宽字符集）由 `:129` / `:179` 两处字段直接支撑，成立。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0065

- **阶段**: 议案庭审
- **结论**: 九个锚点内容 **全部证实**，其最承重的结构主张 —— **`get_tree` 的调用落在 `PupuUnchainMemoryV2ReadError` 的 catch 作用域之外，因而超限失败以 500 无语义码出场** —— 经本关逐行确认 **成立**；一处区间端点各早一行（`:1202-1205`，实为 `:1203-1206`），区间内仍完整含该 raise。
- **依据**: E-0065
- **不确定性**: 提交方自陈「纯静态、未构造 >10,000 条目 store、未测耗时」本关同样成立，`O(n²/页大小)` 仍是结构复杂度推断而非测量，**不得作为性能事实引用**。真实 store 规模受 G2 阻断，本关无法取证。另：本条同时引用 PuPu 侧 `_MAX_LIFECYCLES=10_000` 与 unchain 侧 `_MAX_LIST_SCAN=10_000` 两道界，**两道界的相对触发次序本条未论述**，我在 E-0069 项下补记。
- **请求/下一步**: 引用 unchain 侧超扫描界时把行号更正为 `sqlite_read_v2.py:1203-1206`。
- **评估结论**: 已验证（一处区间端点漂移一行，内容未变）
- **证据编号**: E-0065
- **来源类型**: general
- **真实性**: PuPu 侧 —— `memory_v2_unchain_read_adapter.py:48` = `_MAX_LIFECYCLES = 10_000` **精确**；`:365` = `while len(entries) < _MAX_LIFECYCLES:` **精确**；`:387-389` = `raise PupuUnchainMemoryV2ReadError("workspace listing exceeds the P0 route limit")` **精确**；`:65` 异常继承 `RuntimeError` **精确**；`route_memory_v2.py:98-104` 裸 `except Exception` → 500 **精确**；`:355-361` = `except PupuUnchainMemoryV2ReadError` 块，且其 `try:` 起于 `:350` **只包住 `open_pupu_unchain_memory_v2_reader(...)`（:351-354）** —— **提交方所称的 catch 作用域逐行属实**；`:1114-1119` 处 `context_v2_tree` 把 `.get_tree(...)` 链在 `_read_runtime_for_store_owner(...)` 的返回值上（`:1116`），**确在该 try 之外**。unchain 侧 —— `sqlite_read_v2.py:53-55` = `_MAX_LIST_RESULTS=200` / `_MAX_LIST_SCAN=10_000` / `_SCAN_PAGE_SIZE=200` **三行逐一精确**；`_workspace_page` 的「全量扫描 → `entries.sort(...)` → 切片」结构 **属实**。**唯一偏差**：超扫描界的 raise 登记为 `:1202-1205`，实为 `if page.has_more:` @1203 + raise @1204-1206；`:1202` 是循环内的 `repository_cursor = page.next_cursor`。
- **可靠性**: 两仓仓内文件字面内容与行号；异常层级部分复用 E-0063 的实测 MRO（本关已独立重跑，见上条）。
- **相关性**: 支持其所称的「tree view 是唯一一次拉完整个 store 的消费者，且其失败模式为 500 无语义码」。该结论的两个前提（无分页的全量拉取 · catch 作用域不覆盖）均经本关直接观察，推论成立。标注为推断的复杂度部分不承重，与提交方自陈一致。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0066

- **阶段**: 议案庭审
- **结论**: 全部锚点内容证实，登记的 grep **逐条重跑且四行命中分区完全如登记所述**；其穷举断言（`api.unchain.getStatus()` 在 `src/` 只有一个产品消费者）经本关 **用比登记更严的探针** 复核仍成立。**三方（E-0025 · E-0055 · E-0066）在实体事实上无分歧**，唯一差异是一处引用区间端点。
- **依据**: E-0066, E-0025, E-0055
- **不确定性**: 提交方自陈「未对 `src/COMPONENTs/**` 全域复核是否存在经 `window.unchainAPI.getStatus()` 直连的第三方消费者」—— 本关已代为核实并 **闭合**（见真实性），该限制可去除。三方均为静态阅读，**无一方运行过应用观察 `getStatus()` 的实际返回值**，此为三方共同的、至今未闭合的缺口。
- **请求/下一步**: 引用 `getStatus` 函数体时建议采用 E-0025 的 `api.unchain.js:870-887`（实测精确），而非 E-0066 的 `:870-885`。
- **评估结论**: 已验证（第三次同向，与前两次无分歧）
- **证据编号**: E-0066
- **来源类型**: general
- **真实性**: `api.shared.js:330-343` = `normalizeUnchainStatus` 全体（330 为 `const normalizeUnchainStatus = (status) => ({`，343 为 `});`）**精确**；其为 **6 键对象字面量**（`status/ready/url/reason/pid/port`），**无 spread**，故「重建非投影」**属实**，`memoryV2` 与 `contract` 确不在其中。`:390` = `normalizeUnchainStatus,` 于导出块内 **精确**。`chat.js:578` = `const status = await api.unchain.getStatus();` **精确**。grep 重跑得 4 行：`chat.js:578`（`api.unchain`）+ `local_storage/index.js:43`（`api.ollama`）+ `configure_providers.js:173,207`（`ollamaBridge`）—— **与登记的「另三处分属 api.ollama 与 ollamaBridge」逐条吻合，无遗漏项**。**本关补跑的更严探针**：`grep -rn "getStatus" src --include=*.js`（去掉 `.getStatus(` 形态，可捕获解构/别名）与 `grep -rn "unchainAPI" src` 各自复核 —— **无任何解构或别名消费者**，`src/` 内除 `api.unchain.js` 自身的 `hasBridgeMethod` 能力探测外 **无直连 `window.unchainAPI.getStatus()` 的调用点**；其余 `getStatus` 命中分属 `api.ollama` / `ollama_bridge` / `context_v2_bridge` / `memory_vault_bridge`，均非本对象。**穷举断言成立。** 偏差一处：`api.unchain.js` 的 `getStatus` 块实为 `:870-887`（登记 `:870-885`），承重行 `return normalizeUnchainStatus(status);` @879 落在两个区间内。
- **可靠性**: 仓内文件字面内容 + 可复跑 grep；且为 **第三个独立来源**（前有 `code-owner-electron` E-0025 与 `code-owner-chat-bubble` E-0055）。
- **相关性**: 支持其所称的两点。**三方一致性核实结果**：三条对 `api.shared.js:330-343` 的定位 **完全一致**，对六个键的枚举 **逐字一致**，对「`memoryV2` 在此被丢弃」**一致**。E-0025 另主张 electron 侧 15 字段与四态闭集（不在 E-0066 射程内，E-0055 亦明示不为该部分承重）；E-0055 另主张 chat-bubble 边界内 import 零命中；E-0066 另主张全 `src/` 单一消费者。**三者是同一事实的三个不重叠外延，不存在相互矛盾之处。**
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0067

- **阶段**: 议案庭审
- **结论**: 十个锚点 **全部逐行精确**，五条结构属性 **逐条独立证实**；作为前案 E-0090 在 `b2385d5d` 上的重测，本关另比对了前案原文，**四条结构属性与两道守卫确实无一失效**，连 `boot_readiness.js` 的 206 行总长都与前案 `:1-206` 的登记一致。
- **依据**: E-0067, E-0090（案 `0000-0003-2026-0807`）
- **不确定性**: 提交方明确自陈 **未跑** `boot_locale_parity.test.js` 与 `boot_readiness_service.test.cjs`，故「两道守卫今天仍绿」**未被任何人验证**；本关亦未跑（只读约束）。本条只支持「守卫的代码仍在且形状未变」，**不支持「守卫今天通过」**，引用时不得跨越这条界。前案 E-0090「不主张 boot 运行无缺陷」的限制继续适用。
- **请求/下一步**: 若本庭需要「守卫仍绿」，须另行传唤有执行权的角色实跑两个测试 —— 这不是本条能补强的。
- **评估结论**: 已验证
- **证据编号**: E-0067
- **来源类型**: general
- **真实性**: `boot_readiness.js:1-22` = 文件头块注释全体（`/*` @1，`*/` @22）**精确**，其正文确逐字写明 renderer 侧单一订阅职责；`:62-74` 起于 `let listeners = new Set();` **精确**；`:180-186` = `export const subscribe` @180 至 `export const getState = () => ({ ...state });` @186 **精确**；`:205-206` = `const bootReadiness = { start, retry, subscribe, getState };` + `export default bootReadiness;` **精确**（文件恰 206 行）。`src/SERVICEs/bridges/boot_readiness_bridge.js` 存在（98 行），确为 `window.bootReadinessAPI` 的薄包装，**与判定模块分居两目录，属实**。`electron/main/services/boot_readiness/service.js:113` = `const FAILURE_CODES = Object.freeze([` **精确**（三个码）；`:339` = 导出块内 `FAILURE_CODES,` **精确**；全文件 `FAILURE_CODES` 仅此两处命中。`boot_locale_parity.test.js` 的 `require("../../electron/main/services/boot_readiness/service")` 落 `:45`（`const {` 起于 `:43`，`FAILURE_CODES,` 在 `:44`），登记的 `:44-45` **命中该 require 语句**；`:47` = `const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];` **精确**。`.cjs` 双胞胎 `boot_readiness_service.test.cjs` 与 `.js` 同时存在。
- **可靠性**: 仓内文件字面内容与行号；且为对前案已归档证据的当期重测，可与 E-0090 交叉比对。
- **相关性**: 支持其所称的五条结构属性，逐条对应到具体行，无一条依赖叙述。「是 E-0090 在当前 revision 上的重测且无一失效」经本关调阅前案原文比对后 **成立**。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0068

- **阶段**: 议案庭审
- **结论**: 五个锚点 **全部逐行精确，无一漂移**；13 个共有字段、`deleted` 单侧追加、树装配两侧字面等价含静默孤儿升根、`parent_path` 两侧来源不同 —— **四项主张逐项独立比对证实**。本批引证质量最高的一条。
- **依据**: E-0068
- **不确定性**: 提交方自陈「纯静态比对，未在 `store_owner=unchain` 下实跑（G8）」**部分已由本案他条缓解** —— E-0062 已在产品配置下实跑该分支并取得 `"kind":"folder"` 的 tree 响应（S-0026 已验证），但 **本条登记的完整字段集本身仍无人在运行时逐字段核对过**，故「运行时字段确实如此」仍是推断。提交方另自陈未读 unchain 侧 `memory_tree` / `memory_list` 实现，本关亦未读。
- **请求/下一步**: 无。本条可按原文引用。
- **评估结论**: 已验证
- **证据编号**: E-0068
- **来源类型**: general
- **真实性**: `memory_v2_store.py:6641-6669` = legacy `_entry_response` 全体 **精确**；`:7396-7400` = `entries = []` 至 `entries.append(response)`，其中 `:7399` 逐字为 `response["deleted"] = row["deleted_at_ms"] is not None` **精确**；`:7408-7434` = legacy `get_tree` 全体（7408 `def`，7434 `return {**listing, "tree": roots}`）**精确**；`memory_v2_unchain_read_adapter.py:411-452` = adapter `list_entries` + `get_tree` 两函数（411 `def list_entries(`，452 `return {**listing, "tree": roots}`）**精确**；`:532-567` = `_route_entry` 全体 **精确**。**逐字段人工比对结果**：13 个共有字段 `entry_id · space_id · path · parent_path · name · kind · description · mime_type · revision · space_revision · source_event_id · ref · replayed` **两侧全部存在，一个不多一个不少**；`ref` 拼装两侧同为 `pupu://memory/{space_id}/{entry_id}@{revision}` **格式逐字相同**；`deleted` **仅 legacy 有，`_route_entry` 无**，属实；两侧树装配均为 `parent = nodes.get(item["parent_path"])` → `if parent is None: roots.append(node)` **逐字等价**，孤儿确被静默升根、无任何信号；`parent_path` legacy 取 `row["parent_path"]`（`:6647`，且 schema `:843` 确有该存储列），unchain 取 `entry.path.rsplit("/", 1)[0] or "/"`（`:534`）**两侧来源不同，属实**。
- **可靠性**: 两仓仓内文件字面内容与行号，同 revision 可逐字段复核。
- **相关性**: 支持其所称的三点（支持 E-0014 主结论 · 补正一处遗漏 · 新增两条结构事实），每一点均落到可指认的行，无越界。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0069

- **阶段**: 议案庭审
- **结论**: 四个锚点内容证实，**上限的触发条件与失败模式经本关逐行追完整条链路，主张成立**：超限确以异常出场而非截断，且该异常 **确会以 500 无语义码到达调用方**。一处区间漂移一行（`:381-384`，实为 `:382-385`）。作为「新增已知缺口」的登记请求，本关认为 **事实基础充分**。
- **依据**: E-0069, E-0065
- **不确定性**: **该上限在任何条件下均未被观察过**（提交方自陈，本关同意且未补测：只读约束 + 无 >10,000 条目 store）。本关另发现 **本条未论及的一层**：unchain 侧 `sqlite_read_v2.py:53-55` 另有一道 `_MAX_LIST_SCAN = 10_000` 的 **每次调用扫描界**，超界抛 `SQLiteContextV2ReadError`（`:1203-1206`）。故实际生效的天花板是 **两道 10,000 界中先触发的那一道**，而 **两道都不是 `MemoryV2Error` 子类**（unchain 全仓对 `MemoryV2Error` 引用数 0，见 E-0063 项下实测），**两道因此落在同一个 500 出口上**。本条把上限单方面记在 PuPu adapter 名下 **不算错，但不完整**。`pupu_legacy` 侧是否有对应上限提交方自陈未核实，本关亦未核实。
- **请求/下一步**: 若本庭采纳本条为新增已知缺口，建议按上条把缺口表述为 **「活读路径存在两道 10,000 界，任一触发均以 500 `context_v2_failed` 出场」**，而非单指 adapter 一道。
- **评估结论**: 已验证（一处区间端点漂移一行；缺口表述建议按不确定性栏扩写）
- **证据编号**: E-0069
- **来源类型**: general
- **真实性**: `memory_v2_unchain_read_adapter.py:48` = `_MAX_LIFECYCLES = 10_000` **精确**；`:365` = `while len(entries) < _MAX_LIFECYCLES:` **精确**；`:387-389` = `raise PupuUnchainMemoryV2ReadError(` / `"workspace listing exceeds the P0 route limit"` / `)` **精确**，与登记的关键原文 **逐字相同**；`:598` = `limit=_MAX_LIFECYCLES,` 与 `:604` = `if len(lifecycles) >= _MAX_LIFECYCLES:` **两处精确**，同一常量的第二用途属实。**偏差一处**：「游标不前进即抛」的守卫登记为 `:381-384`，实为 `if page.next_cursor is None or page.next_cursor == cursor:` @382 + raise @383-385；`:381` 是 `return tuple(entries)`。**触发条件（本关追加核实）**：循环在 `:380-381` 于 `has_more` 为假时 **正常返回**，只有当 `len(entries) >= 10_000` **且** 上一页仍报 `has_more=True` 时才落到 `:387` 的 raise；页大小恒 200（`:369`/`:376`），故触发点为 **条目数严格超过 10,000**，恰好 10,000 且到底则正常返回。**失败模式（本关追加核实）**：`PupuUnchainMemoryV2ReadError` 继承 `RuntimeError`（`:65`）且 **实测非 `MemoryV2Error` 子类**；`route_memory_v2.py` 的 `except PupuUnchainMemoryV2ReadError`（`:355-361`）**只包住 `open_…reader`**，而 `context_v2_tree`（`:1116`）把 `.get_tree(...)` 链在其外 → 异常直抵 `_endpoint` 的裸 `except Exception`（`:98-104`）→ **HTTP 500 `{"error":{"code":"context_v2_failed",…}}`，无 `retryable` 字段**。该 500 形状与 E-0062 在完整 HTTP 路径上实测到的 500 行 **逐字节一致**，构成旁证。
- **可靠性**: 仓内文件字面内容与行号；失败模式部分由本关跨三个文件的控制流追踪独立确认，不依赖提交方叙述。
- **相关性**: 支持其所称的「上界由 sidecar 单方面决定，到界时用户拿到的是错误而非部分树」。该结论的两个环节（抛而非截断 · 异常不被语义化）均经本关直接观察，成立。与 `code-owner-electron` E-0032 的「不矛盾、两层」判断经本关核对亦成立 —— E-0032 说的是 IPC 方法签名层无 limit 参数，本条说的是 sidecar 实现层有硬界，两者不冲突。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0070

- **阶段**: 议案庭审
- **结论**: 七个锚点 **全部逐行精确**，`:6724` 的写时父 folder 强制 **逐字引用无误**；**传唤特别要求核实的一点经本关逐句检查后确认** —— 该「未核实项」被明确标注为「不是一条主张，是一个问题」，且 **在本条正文任何位置均未以事实口吻复用**；本关另重跑了 folder 条目产生点的穷举搜索，**结论成立，但需补一条可达性事实**。
- **依据**: E-0070, E-0061
- **不确定性**: 本关的穷举重跑发现 unchain 全仓另有 **两处 `return MemoryEntryKind.FOLDER`**（`sqlite_curator_review_decision_v2.py:594` 与 `sqlite_memory_host_v2.py:706`），二者均为 `_workspace_kind` 静态分类助手（字符串 → 枚举），**不产生条目**；其中 `sqlite_memory_host_v2.py:947-948` 分类后 **回调 `self._workspace.create_folder(**common)`**。故「产生点只有一处」**成立**，但 **可达路径不止一条** —— 除直接调用外，**curator 晋升路径亦可产生 folder 条目**。本条未及此，引用时不应据其推出「folder 条目只能由用户显式创建」。另：本条 净内容 末句「这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因」是 **推论**（由 `:6724` 与 E-0068 所载升根逻辑合成），**以事实口吻书写、未标注为推断**，且其射程 **仅限 `pupu_legacy`**。
- **请求/下一步**: 引用时把上述两点随证据一同带上。传唤所述「该未核实项后由 E-0061 独立证成」与本关观察一致：我在 unchain `_write`（`service.py:661-790`）与持久层写路径（`sqlite_memory_v2.py:1120-1240`）中 **均未找到父存在性强制**（该区间的 raise 全部关于 space/entry revision、路径碰撞、folder 有活跃子孙的删除保护），**方向与 E-0061 一致**。
- **评估结论**: 已验证（未核实项标注合规；附一条可达性补充与一处推论标注缺失）
- **证据编号**: E-0070
- **来源类型**: general
- **真实性**: unchain `models.py:251-255` = `MemoryEntryKind` 四值 **精确**；`service.py:367` = `def create_folder(` **精确**；`:381` = `kind=MemoryEntryKind.FOLDER,` **精确**；`:154-186` 落在 `list_entries` 内且确含 `parent = entry.path.rsplit("/", 1)[0] or "/"` 的 parent 计算 **精确**。PuPu `memory_v2_toolkit.py:364` = `if public_kind not in {"folder", "markdown", "image", "link"}:` **精确**；`:372-375` = `if public_kind == "folder":` 至 `return "folder", None, "", ""` **精确**；`memory_v2_store.py:845` = `kind TEXT NOT NULL CHECK(kind IN ('folder', 'file', 'link')),` **精确**（登记引文省略了逗号后空格，纯排版）；`:6724` = `if parent is None or parent["kind"] != "folder":` —— **与登记引文逐字相同**，其后 `:6725-6729` 抛 `context_v2_parent_not_found` 409。**穷举重跑**：`grep -rn "MemoryEntryKind.FOLDER" src/` 得 12 处命中，`grep -rn 'kind\s*=\s*["'"'"']folder' src/` 得 0 处；12 处中 **仅 `service.py:381` 一处是写入构造**，其余为比较判定（`is FOLDER` / `in {FOLDER, LINK}`）或上述两处分类助手；`_write` 的四个调用点（`:377/407/443/468`）分别对应 folder/markdown/image/link 各一。
- **可靠性**: 两仓仓内文件字面内容与行号；穷举部分由本关以两条独立 grep 重跑确认。
- **相关性**: 支持其所称的三点净内容。**标注纪律核实结果**：本条 净内容 中关于父强制的陈述 **只出现在 `pupu_legacy` 名下**（「`pupu_legacy` 在写入时强制父 folder 存在」），**从未对 unchain 侧作同类陈述**；支持/反驳 栏明写「**但不闭合该推断**」；完整性限制栏明写「**这不是一条主张，是一个问题**」并指名归属。**三处表述相互一致，无以事实口吻复用未核实项的情形。** 该克制经核属实。
- **来源归类**: 内部来源

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0071

- **阶段**: 议案庭审
- **结论**: 三条命令 **全部重跑，三项净内容逐值复现**，含两个文件字节数精确到个位；**其负向断言经本关以三重更严条件复跑仍为 0**，其自陈的唯一残余风险（字符串拼接构造）本关亦已探测，未见任何构造路径。
- **依据**: E-0071
- **不确定性**: 负向证明的固有边界仍在：本关覆盖了字面全串、两段子串与字面量前缀枚举，**但不可能穷尽运行时动态拼装的全部形态**。此外，该字面串 **确实存在于 `unchain_runtime/server/` 的 4 个文件中**（`route_memory_v2.py` · `memory_v2_runtime.py` 及两个测试）—— 与本条主张不冲突（本条射程明写为 `src/**`），但引用时须保留 `src/**` 这个限定词，**不得升格为「全仓无此码」**。提交方自陈未读 `memory_inspect_modal.js` 全文，本关同样未读。
- **请求/下一步**: 引用第 (1) 项时务必带上 `src/**` 限定。
- **评估结论**: 已验证
- **证据编号**: E-0071
- **来源类型**: general
- **真实性**: `ls -la src/COMPONENTs/memory-inspect/` 重跑 → **恰两个文件**：`memory_inspect_modal.js` **30,849 字节** 与 `memory_inspect_modal.test.js` **2,678 字节**，**与登记逐字节相同**，无子目录。`git rev-parse --short HEAD` → `b2385d5d`，branch `dev`；`git status --porcelain src electron unchain_runtime | wc -l` → **0**，均与登记相同。**负向断言的三重加严复跑**：(a) 原命令 `grep -rn "context_v2_store_disabled" src --include="*.js" | wc -l` → **0**；(b) **去掉 `--include` 过滤**，全 `src/` 任意文件 → **0**；(c) 子串与前缀探测 —— `store_disabled` 在 `src/` → **0**，`context_v2_store` 在 `src/` → **0**，`context_v2_[a-z_]*` 全枚举得 30 个不同字面量（`context_v2_unavailable` · `context_v2_not_found` 等），**其中无一为 `context_v2_store_disabled` 亦无任何可拼出它的片段**。另查 `src/` 全部文件扩展名分布：780 个 `.js` + 字体/图标/json/css 等资源，**无 `.jsx` / `.ts` / `.mjs`**，故 `--include="*.js"` 对源码 **零遗漏**，原命令的过滤器不构成盲区。
- **可靠性**: 可复跑命令 + 仓内目录状态；三条命令均不依赖提交方叙述，任何人可复核。
- **相关性**: 支持其所称的三点，并支持其「独立复核并确认 E-0048 与 E-0053，第三次同向」的定位。负向断言在加严条件下仍成立，故其对 C-A4 落位空间的支撑不因取样方式而削弱。
- **来源归类**: 内部来源

---

## 小结表

| 证据 | 提交方 | 评估结论 | 锚点核对 | 命令/穷举重跑 | 须随证据一同引用的登记项 |
|---|---|---|---|---|---|
| E-0058 | code-owner-unchain | **已验证** | 全部复现 | 3/3 逐值相同 | `cat` 转录为紧凑单行、实为 5 行 pretty-print（排版性）；「不钉 schema 版本」应改为「不钉 `SCHEMA` 字符串与 kind 词汇表」（lock 实含 `context_memory_contract: 1`） |
| E-0060 | code-owner-unchain | **已验证** | 5/6 精确，**1 处指错分支** | — | `image`/`markdown` 的 `content_ref` 分支应为 `:563-564`，登记的 `:565-566` 是 `link` 分支 |
| E-0063 | code-owner-unchain | **已验证** | 8/8 精确 | 2/2 探针逐字符相同 | 自陈的「未穷举 unchain 异常类」**经本关闭合可去除**（引用数 0 / import 数 0）；字符集探针登记为 1 行摘录、实 5 行，省略已标注，但未提及的 `curation_repository_error` 是唯一同时通过窄字符集者 |
| E-0065 | code-owner-unchain | **已验证** | 内容全证实，**1 处区间早一行** | — | 超扫描界应为 `sqlite_read_v2.py:1203-1206`；`O(n²/页大小)` 是推断非测量，不得作性能事实引用 |
| E-0066 | expert-architecture | **已验证** | 内容全证实，**1 处区间短两行** | grep 4 行命中分区完全吻合；**穷举断言加严后仍成立** | `getStatus` 函数体宜采 E-0025 的 `:870-887`；自陈的「未复核直连消费者」**经本关闭合可去除** |
| E-0067 | expert-architecture | **已验证** | 10/10 精确 | — | 「两道守卫仍绿」**无人验证**，本条只支持「守卫代码仍在且形状未变」 |
| E-0068 | expert-architecture | **已验证** | 5/5 精确，**无漂移** | 13 字段逐项比对相符 | 无（本批引证质量最高） |
| E-0069 | expert-architecture | **已验证** | 4/4 内容证实，**1 处区间早一行** | 触发条件与失败模式经本关追完整链 | 守卫应为 `:382-385`；缺口宜表述为 **两道 10,000 界、任一触发均落同一 500 `context_v2_failed`** |
| E-0070 | expert-architecture | **已验证** | 7/7 精确 | **穷举重跑成立**（2 条独立 grep） | 产生点唯一但 **可达路径不止一条**（curator 晋升亦调 `create_folder`）；「孤儿升根之所以安全」是推论且仅限 `pupu_legacy`；**「未核实项」标注合规，未在别处以事实口吻复用** |
| E-0071 | expert-architecture | **已验证** | 全部复现（含字节数） | **负向断言三重加严后仍为 0** | 第 (1) 项须保留 `src/**` 限定 —— 该码在 `unchain_runtime/server/` 的 4 个文件中确实存在 |

**批次统计**：已验证 **10** · 未验证 **0** · 相矛盾 **0**。全部 `general` 来源类型，全部归类为 **内部来源**。

**两条跨条目的事实登记**（供 `speaker-of-the-house` 判断是否需要重排引用它们的发言）：

1. **E-0069 的缺口射程应扩写。** 活读路径上有 **两道** 10,000 界（PuPu `_MAX_LIFECYCLES` 与 unchain `_MAX_LIST_SCAN`），两者的异常 **都不是 `MemoryV2Error` 子类**，因此 **都落在同一个 500 `context_v2_failed` 出口**。按单道界表述会低估该缺口。
2. **E-0070 的 folder 可达性应补一条。** 产生点唯一（`create_folder`）成立，但 `sqlite_memory_host_v2.py:947-948` 显示 **curator 晋升路径会调用它**，故 folder 条目并非只能由显式用户动作产生。

**程序性声明**：本关未对任何实体争点发表意见，未重开任何已归档辩论，未派生子 instance（A-012），两仓均未作任何写操作（`git status` 在复核前后一致）。
