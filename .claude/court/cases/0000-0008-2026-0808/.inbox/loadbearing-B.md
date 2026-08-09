# 承重证据复核 · 批次 B（13 条）

`evidence-examiner` 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md)复核。本批全部为 **自证类**，依第六节 **免检失效**，逐条重验并附时效判断。

> **S 编号待 `speaker-of-the-house` 分配。** 下列 13 份 `ASSESSMENT` 按批内顺序排列，各以 `→ E-00NN` 相互区分。

---

## 全批时效前提（一次实测，覆盖本批全部 13 条）

本批 13 条的锚点全部为 `revision + 绝对路径 + 行号 + 内容` 形态，锚定 revision 均为 PuPu `b2385d5d`。复核时实测（2026-08-08，复核开始时刻）：

```
git rev-parse --short HEAD          → b2385d5d      （与全批锚点 revision 一致）
git branch --show-current           → dev
git status --porcelain -- src electron unchain_runtime
                                    → 空            （三个产品目录零 dirty）
git status --porcelain -- build package.json .local
                                    → 空            （E-0023 引用的两个受控文件亦零 dirty）
git status --porcelain | wc -l      → 49
```

**dirty 条目已由 E-0001 的 8 条、E-0033 的 12 条增至 49 条，但增量全部落在 `.claude/` 之下**（38 条 `.claude/agent-memory/**` + `.claude/agents/expertise/expert-llm.md` + `.claude/codex/**`，11 条 `.claude/court/**`）。**`src/` `electron/` `unchain_runtime/` `build/` `package.json` 五个被本批引用的受控位置，至本次复核时刻仍与 `b2385d5d` 逐字节一致。**

**净效果：本批全部 13 条的时效前提成立** —— 不存在因产品代码变动导致的行号漂移。本批出现的全部行号偏差，**均为提交时的誊录偏移，不是庭审期间的漂移**；二者性质不同，我逐条区分登记。

**一项本前提覆盖不到的例外**：E-0023 的一半依赖 `.local/build_feature_flags.snapshot.json`，**该文件不入库**，`git status` 对其无任何约束力，上述五行实测 **不为其提供任何保护**。见该条单独处理。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0015
- **阶段**: 议案庭审
- **结论**: 逐项复核全部命中，无一处偏差。`memory-inspect/` 目录对 `ownerChatId` / `context_v2` / `contextV2` 的 grep 实测为 `0`；文件 959 行、测试 94 行；`:326-332` 的组件签名、`:340` 的六态注释、`:374-377` 的唯一数据源逐字一致。
- **依据**: E-0015
- **不确定性**: 提交方自陈「只覆盖字面标识符与该目录，未运行组件」属实且我未越过 —— 经变量/动态构造抵达 V2 的路径不在本次覆盖内。
- **请求/下一步**: 可直接承重，无须补强。
- **评估结论**: 已验证
- **证据编号**: E-0015
- **来源类型**: general
- **真实性**: 已确认。`:326-332` 实为 `({open, onClose, sessionId, chatTitle, mode = "session"})`，与登记的字段与顺序完全一致；`:340` 实为 `useState("idle")` 附 `"idle" | "loading" | "ready" | "profiles" | "empty" | "error"` 六态注释；`:374-377` 实为 `mode === "long_term" ? unchainApi.getLongTermMemoryProjection() : unchainApi.getMemoryProjection(sessionId)`。grep 计数 `0` 与两个行数 959 / 94 均实跑复现。无篡改迹象。
- **可靠性**: 提交方 `code-owner-settings` 在自己边界内的一级读取（`src/COMPONENTs/memory-inspect/**`），本次经第二方独立复核。
- **相关性**: 相关且充分。它支持的命题是「该 modal 今天完全不在 V2 读平面上」，而 grep 零命中 + 唯一数据源为 V1 projection 两方法，正是该命题的直接构成，未见外延。
- **来源归类**: 内部来源（本仓一级原始物，同 revision 任何人可复核）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0016
- **阶段**: 议案庭审
- **结论**: 四个文件的锚点全部命中，`node` 正则探针原样复跑、两行输出一致。两处 **行内标号比所引内容早一行**，均落在该条自己已声明的行号区间之内，属排版压缩，非内容失真。
- **依据**: E-0016
- **不确定性**: 提交方自陈「未证明 `node.chatId` 与 `activeChatIdRef.current` 严格同一 id 空间」属实 —— 我核到的是 `use_chat_stream.js:11985` 传的是 `currentChatId`，而 side-menu 传的是 `node.chatId` / `memorySessionId`，**二者是不同变量，本条未跨越这道缝**。该确认归 `code-owner-chat-core`。
- **请求/下一步**: 可承重。建议 speaker 随证据带上两处行内标号更正（见真实性）。
- **评估结论**: 已验证
- **证据编号**: E-0016
- **来源类型**: general
- **真实性**: 已确认。`side_menu_context_menu_items.js:198-207` 实为 character 分支 `buildCharacterMemorySessionId(chat?.characterId, chat?.threadId || "main")` 直至 `onInspectMemory(memorySessionId, chatTitle)`；`:217-223` 实为普通分支直至 `onInspectMemory(node.chatId, chatTitle)`，两段逐字命中。`service.js:120` 的 `CONTEXT_V2_OWNER_ID_PATTERN` 与 `:198-204` 的 `requireContextV2OwnerChatId` 均为精确边界。`node` 探针我以同一正则原样复跑：`"chat-1772850432671-abc" → true`、`"character_foo__dm__main" → true`，与登记一致。**两处行内标号更正**：(1) 登记写 `chat_storage_sanitize.js:301` 携带 `` `character_${…}__dm__${…}` ``，实际 `:301` 是 `export const buildCharacterMemorySessionId = (...)`，模板串在 `:302`（仍在其声明的 `:301-302` 内）；(2) 登记写 `use_chat_stream.js:11985` 为 `{ ownerChatId: currentChatId, sessionId: targetSessionId }` 一行，实际 `:11985` 是 `ownerChatId:`、`:11986` 是 `sessionId:`（仍在其声明的 `:11978-11986` 内）。两处均为把多行压成一行展示，内容零差异。
- **可靠性**: 跨三个 owner 边界的只读引用（side-menu 属 chat-core，`chat_storage/**` 属 shared-arteries，`service.js` 属 electron），提交方未就他人边界作权威主张，仅取代码形状。
- **相关性**: 相关。它证明的窄命题是 **`onInspectMemory` 的第一个实参在两条分支上是两种不同的 id，且两者都能通过 main 的 `CONTEXT_V2_OWNER_ID_PATTERN`** —— 该命题由上述锚点直接导出。**须随证据一同引用的收窄**：登记称此为「语义错误的 id」，「语义错误」是对该 id 应当是什么的判断，**不由本条锚点导出**，属实体争点，我不裁；本条只支持「校验器不区分二者」。
- **来源归类**: 内部来源（本仓一级原始物 + 本机可复跑的纯函数探针）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0017
- **阶段**: 议案庭审
- **结论**: 两个锚点与一条 grep 全部精确复现。`MemorySettings` 签名唯一入参确为 `onNavigate`，挂载块确只传 `{open, onClose, mode}`。
- **依据**: E-0017
- **不确定性**: 提交方自陈「未穷举全部 provider」属实，本条未跨越。（该缺口已由本批外的 E-0034 以 `ls src/CONTAINERs/` 补上，不由我在此裁量其效力。）
- **请求/下一步**: 可直接承重。
- **评估结论**: 已验证
- **证据编号**: E-0017
- **来源类型**: general
- **真实性**: 已确认。`settings/memory/index.js:46` 实为 `export const MemorySettings = ({ onNavigate }) => {`，逐字一致；`:474-478` 实为 `<MemoryInspectModal open={inspectOpen} onClose={() => setInspectOpen(false)} mode="long_term" />`，五行精确闭合，与 E-0003 所载同一挂载点互证。grep 我原样复跑，`src/COMPONENTs/settings` 下非测试代码中 `chatId|sessionId` **恰好三处命中，全部在 `token_usage/storage.js:82,154,332`**，与登记逐行一致。
- **可靠性**: 提交方在自己边界内（`src/COMPONENTs/settings/**`）的一级读取。
- **相关性**: 相关且充分。命题是「settings 侧挂载点手里没有任何 chat 标识」，负向 grep + 正向签名读取二者合起来正是该命题，无外延。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0018
- **阶段**: 议案庭审
- **结论**: 四段锚点全部命中，`getTree` 必需 `ownerChatId` + `spaceId` 且 query 仅含 `owner_chat_id` 三项事实逐字属实。两处描述偏松，均非内容问题。
- **依据**: E-0018
- **不确定性**: 提交方自陈「`spaceId` 的来源我未核实」属实且重要 —— 两跳读序列的第一跳返回什么、有无默认 space，本条一律未触及。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0018
- **来源类型**: general
- **真实性**: 已确认。`src/SERVICEs/bridges/context_v2_bridge.js:32-50` 确为 `REQUIRED_METHODS` 的 18 个方法名（`getStatus` 起、`decideCandidateReview` 止，`]);` 在 `:51`）；`:102-108` 确含 `getStatus`(:102) / `listSpaces`(:107) / `getTree`(:108) 三个纯透传定义。`service.js:2098-2101` 确为 `listContextV2Spaces` 头部含 `requireContextV2OwnerChatId(payload?.ownerChatId)`；`:2108-2116` **逐行精确** 为 `getContextV2Tree`，第 2109 行 `requireContextV2OwnerChatId`、2110 行 `requireContextV2Identifier(payload?.spaceId, "spaceId")`、2111 行 `buildContextV2Query([["owner_chat_id", ownerChatId]])`，**确无 `allow_long_term` / `namespace`**。**两处偏松（非内容错误）**：(1) 取得方式称 renderer facade「140 行内」，该文件实为 **124 行** —— 陈述为真但失准；(2) 本条另处以 `:2098-2105` 指 `listContextV2Spaces`，该函数实际闭合于 `:2106`。
- **可靠性**: 跨边界只读（`src/SERVICEs/bridges/**` 属 shared-arteries，`electron/**` 属 electron），提交方已就此自陈并把 `spaceId` 来源明确让归 runtime / electron。
- **相关性**: 相关且充分。它主张的是「V2 读平面全部 owner-scoped」与「`getTree` 除 `ownerChatId` 外还必需 `spaceId`」，两者都是被引行的直接内容。其推出的「最小读序列是两跳」是 **形状层的必然**（`getTree` 需 `spaceId`，而 `spaceId` 只能来自 `listSpaces`），成立；但「两跳在运行时确实如此走」超出本条，须另据。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0019
- **阶段**: 议案庭审
- **结论**: 三个 Python 文件的锚点内容全部属实，**200 载荷恰为五键 `{owner_chat_id, space_id, space_revision, entries, tree}`、无任何判别位** 经我逐键复核成立。**跨界自我限制（只主张代码形状）在正文中被完整遵守。**
- **依据**: E-0019
- **不确定性**: 空 store / space 不存在 / owner 不匹配 / `store_owner=off` 四种出口的实际 HTTP 状态与 body，本条一律未观察 —— 提交方已明写并让归 `code-owner-runtime`。该缺口由本批外的 E-0010 部分填补，不在我此次复核范围。
- **请求/下一步**: 可承重（仅就代码形状）。任何把本条读成运行时结论的引用，请 speaker 拦下。
- **评估结论**: 已验证
- **证据编号**: E-0019
- **来源类型**: general
- **真实性**: 已确认。`memory_v2_store.py:7434` 逐字为 `return {**listing, "tree": roots}`；`listing` 的四个键 `owner_chat_id` / `space_id` / `space_revision` / `entries` 实位于 `:7402-7405`（登记的行内标号写 `:7397-7405`，起点早了四行，落在其自陈的 `:7396-7434` 区间内，非实质）。`route_memory_v2.py:1111-1120` **逐行精确**：`:1111` 路由装饰器、`:1114` `request.args.get("owner_chat_id", "")`、`:1116-1118` 调 `get_tree(owner_chat_id=…, space_id=…)`，**确未传 `allow_long_term` / `namespace`**。`memory_v2_store_boundary.py:26-28` 逐字为三个 `STORE_OWNER_*` 常量。
- **可靠性**: **跨界只读** —— `unchain_runtime/**` 不在提交方 `code-owner-settings` 边界内。该条标题即写明「仅就代码形状；运行时行为归 `code-owner-runtime`」，**我核实其正文严格守住了这条界**：净内容四行全是构造与常量，无一句断言端点实际返回什么。
- **相关性**: 相关且充分，**但须按窄命题采纳**：本条支持的是「`get_tree` 的成功载荷里没有判别位」这一 **结构** 命题，以及「`allow_long_term` 参数存在但该路由不传」。它 **不** 支持任何关于 200 何时出现、空态与停用态如何区分的命题 —— 那正是它自己划出去的部分。
- **来源归类**: 内部来源（本仓一级原始物，跨 owner 边界只读）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0020
- **阶段**: 议案庭审
- **结论**: 四项净内容全部属实 —— 8 字段 allowlist、count-free 注释原文、`getStatus` 零消费者、production 短路，逐项复现。**但主锚点整体偏移一行，须在案卷中更正**：`getContextV2Status` 实为 `:1945-1986`、其注释实为 `:1942-1944`，登记的 `:1941-1985` 与 `:1941-1943` 均早一行。
- **依据**: E-0020
- **不确定性**: 该偏移 **不是庭审期间的漂移**（工作树对 `electron/**` 零 dirty，HEAD 与锚点 revision 同为 `b2385d5d`），而是提交时的誊录偏移。二者对时效性的含义不同，我不把它当作证据失效处理。
- **请求/下一步**: **补正责任在提出方 `code-owner-settings`。** 建议 speaker 在引用本条时改用 `:1942-1944`（注释）与 `:1945-1986`（函数），否则后来的读者会落在空行上。
- **评估结论**: 已验证
- **证据编号**: E-0020
- **来源类型**: general
- **真实性**: 已确认（内容），**行号须更正**。(1) 8 字段 allowlist 实位于 `:1976-1985`，逐字为 `{available, schemaVersion, journalMode, lexicalBackend, vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded}`，**恰 8 项，与登记集合完全相同**。(2) count-free 注释原文 *"Status is deliberately COUNT-FREE … can never leak out as a free enumeration oracle."* **逐字属实**，但位于 `:1942-1944`，`:1941` 是空行。(3) `src/` 下 `contextV2Bridge.getStatus()` 的消费者 **实测为 0** —— 我原样复跑 `grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"`，24 处命中中属 `contextV2Bridge` 的 **只有定义 `:102` 与白名单 `:33` 两处，零调用点**，其余分属 `api.unchain` / `api.ollama` / `ollama_bridge` / `memory_vault_bridge` 或 `toast_host.js:89` 的同名局部函数。(4) `feature_flags.js:53-56` 的 `enable_memory_v2.defaultValue: false` 精确命中；`:96-98` 的 `if (isProductionBuildRuntime) return buildDefaults;` 确在 `readNamespace(...)` 之前 —— **须补一处**：登记称条件为 `NODE_ENV === "production"`，该字面判断实际在 **`:5`**（`const isProductionBuildRuntime = process.env.NODE_ENV === "production";`），不在其所引的 `:90-100` 内；语义成立，出处不完整。另：本条另引的 `:1890-1905` 在净内容中未被使用，指向 `contextV2Request` 的注释与就绪门，无害。
- **可靠性**: 跨边界只读（`electron/**` 属 electron）。提交方已自陈 `projectMemoryV2Status` / `validateMemoryV2Status` 的内部判据未追、归 electron —— 该让渡属实。
- **相关性**: 相关。第 3、4 两点尤其有力且互补：它们合起来支持的窄命题是「今天 renderer 侧既没有在用 `getStatus`，也不能拿 `enable_memory_v2` flag 顶替它作启用态判据」。**须收窄一处**：第 2 点把注释读成「不变量」，注释确实以不变量口吻写成，但 **注释是意图声明，不是对实现的证明**；本条未验证该不变量在实现上被守住（8 字段 allowlist 的存在是强旁证，但 `projectMemoryV2Status` 内部未追）。
- **来源归类**: 内部来源（本仓一级原始物，跨 owner 边界只读）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0021
- **阶段**: 议案庭审
- **结论**: 三段锚点全部精确命中。`pts.length === 0` 单条判据、`if (!silent)` 吞掉整个 `.catch`、5s `setInterval` 驱动静默轮次、以及「现有唯一测试只锁 long-term profiles 一条路径」四项均已复核成立。
- **依据**: E-0021
- **不确定性**: 提交方自陈「未运行组件、未跑测试」属实；「该测试今天是绿的」本条未主张，我亦未跑（`react-scripts test` 未执行）。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0021
- **来源类型**: general
- **真实性**: 已确认，四段行号 **逐行精确**。`:398-408` 实为 `if (pts.length === 0) { … if (mode === "long_term" && nextProfiles.length > 0) setStatus("profiles") else setStatus("empty"); return; }`；`:424-430` 实为 `.catch((err) => { if (cancelled) return; if (!silent) { setErrorMsg(...); setStatus("error"); } })` —— **静默轮次的错误确被整段吞掉**；`:434-441` 实为 `window.setInterval(() => loadProjection({ silent: true }), 5000)` 及其清理。我另独立核实了登记中最关键的一句「5s `setInterval` 会在零操作下驱动 `ready → empty`」：`:398-408` 的空态分支 **不在 `if (!silent)` 保护之内**，故静默轮次确能改写 status —— 该推论成立。测试文件我逐块清点，**全文只有一个 `test(` 块**（`:59` "shows stored long-term profiles when there are no vectors"，位于 `:54` 的单一 `describe` 内），与「唯一测试」一致。
- **可靠性**: 提交方在自己边界内（`src/COMPONENTs/memory-inspect/**`）的一级读取。
- **相关性**: 相关且充分。命题是「Inspector 今天如何处理 200-空」，四项发现全部是该处理路径的直接构成。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0022
- **阶段**: 议案庭审
- **结论**: 全部七个行号锚点 **逐行精确**，三个 spawn 点的清单与 attach 负向搜索均原样复现。核心事实（五个 MEMORY_V2 键写在 `{...process.env}` 展开之后、无条件、无分支）成立。**但其「反驳」一句的射程明显宽于所证** —— 须随证据带上收窄。
- **依据**: E-0022
- **不确定性**: 提交方自陈未启动 Electron、未观察真实 spawn env 属实；未核 `scripts/start-dev.cjs` 是否另起 sidecar（属 devtools）亦属实，该缺口仍开着。
- **请求/下一步**: 可承重，**但必须与下述相关性收窄捆绑引用**。补正「反驳」措辞的责任在提出方 `code-owner-electron`。
- **评估结论**: 已验证
- **证据编号**: E-0022
- **来源类型**: general
- **真实性**: 已确认，**本批精度最高的一条之一**。`:4745` 逐字为 `const sidecarEnvironment = { ...process.env };`；`:4749-4751` 为三个 vault 键删除、`:4755` 为 dirty-dev 键删除（其自陈的 `:4749-4755` 恰好闭合这四行）；`:4758` 为 `spawn(entrypoint.command, entrypoint.args, {`、`:4762-4763` 为 `env: { ...sidecarEnvironment,`；`:4789-4808` **恰为五个键**（featureCeiling / rolloutMode / canaryPercent / readOnlyDegraded / storeOwner），`:4809-4811` 为 dirty-dev 条件重加。我另作一次负向核查：`:4758-4830` 区间内 `MEMORY_V2` 的全部命中 **就是这五个键加那一个条件项，无第六处、无任何分支包裹**。`:1035` 为 `constrainMemoryV2ConfigForPlatform(` 起始行、`:4695-4696` 为 `startMiso` 及其唯一守卫，均精确。`grep spawn(` 在 `electron/main` 下 **恰 3 个命中**，文件与行号（`vault_sink_executor.js:327` / `unchain/service.js:4758` / `ollama/service.js:67`）与登记逐条一致；attach 系列搜索的命中确实全部是流的 `attachedWebContentsId` / `attachmentId`，无外部进程附着路径。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取，并明确标注其为对 `code-owner-runtime` E-0011 未验证段的补全 —— 该补全关系属实。
- **相关性**: 事实相关，**「反驳」射程须收窄，这是本条唯一实质问题**。登记称本条「**反驳** 任何『开发者 shell 的环境变量可能生效』的设想」。所证实的只是 **直接继承通道** 被封死：`{...process.env}` 里的这五个键，会被 `:4789-4808` 无条件覆盖。**但同一提交方的 E-0023 恰好记录了间接通道**：`memory_v2_rollout.js:124-133` 的 `readValue` 在 `allowProcessOverrides` 为真时 **优先返回 `processEnvironment[key]`**，而 `:265` 设 `allowProcessOverrides: !app.isPackaged` —— 我已逐行核实这两处。故在非打包运行下，**开发者 shell 的 env 正是经由 rollout 解析器流进 `memoryV2RuntimeConfig.sidecarEnvironment`，再由 `:4789-4808` 写入 spawn**。两条证据本身不冲突（一条封直接通道、一条开间接通道），**但 E-0022 的措辞会被读成整层否定，那是不成立的**。请按「直接继承通道已封死」采纳，勿按字面采纳。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0023
- **阶段**: 议案庭审
- **结论**: 全部关键原文逐字属实，10 条 reason 闭集我以同一命令复跑得 **恰好 10 条、集合完全相同**。`.local` 那一半我在本机独立读取并确认（273 字节、mtime 2026-08-04 17:20、`enable_memory_v2: true`、无 `_pupu_memory_v2_release` 块）。**就点名的两问：该标注恰当，且不影响本条的承重资格 —— 理由见相关性。**
- **依据**: E-0023
- **不确定性**: `build/build_feature_flags.json` 与最近一次真实 release 的一致性 **至今无人验证**（与 E-0011 限制 2 同源，本次复核亦未消除）。另：`.local` 文件不受任何 revision 约束，我今日之读只覆盖今日。
- **请求/下一步**: 可承重。建议 speaker 在裁定引用 `.local` 内容时，标注观察时刻而非 revision。
- **评估结论**: 已验证
- **证据编号**: E-0023
- **来源类型**: general
- **真实性**: 已确认。`:14-20` 五个 env 键表逐字命中。`:135-140` 逐字为 `const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";` 与同形的 `configuredMode` —— **`featureEnabled` 为假时 env 确实完全不被读取**，登记的关键原文属实。`:150` 逐字为 `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`。`:216-218` 逐字为 `app.isPackaged ? …/build/build_feature_flags.json : …/.local/build_feature_flags.snapshot.json`。`:265` 逐字为 `allowProcessOverrides: !app.isPackaged`。`build/build_feature_flags.json` 我 `cat` 全文：`"enable_memory_v2": false` ✓、`sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER: "off"` ✓、两个 sha256 在案 ✓。`package.json:40` 逐字一致。reason 闭集我复跑 `grep -o 'reason = "[a-z0-9_]*"' | sort -u` 得 **10 条，与登记的 10 条逐条相同（含 `""`）**。**须更正两处行号**：`resolveMemoryV2ReleaseConfig` 登记为 `:210-266`，实际闭合于 **`:309`** ——这也解释了该条内部的自相矛盾（其子锚点 `:241-279` 越出了自己声明的外沿），按 `:210-309` 读则两者自洽；`validateMemoryV2Status` 登记 `:405-449`，实际闭合于 `:450`。`:118-173`（`buildRolloutConfig`）与 `:311-342` 精确。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取，唯 `.local` 一项为本机非受控文件。**就点名的第一问：标注恰当。** 该条把 `.local` 明写为「本机文件、不入库、不可由他人在同 revision 复核」，并要求本庭按「本机观察」而非「仓库事实」采纳 —— 这个自陈准确。**我只补一条它没说、而对承重更要紧的**：`.local` 不受版本控制，意味着它 **可以在不留任何仓库痕迹的情况下改变**，全批时效前提里那五行 `git status` 对它 **零保护力**；因此它连「在 `b2385d5d` 上成立」这种表述都不适用，只能说「在我读它的那一刻成立」。
- **相关性**: 相关且充分。**就点名的第二问：不影响承重资格，理由是本条的承重命题并不真正依赖 `.local` 的内容。** 该命题是一个否定命题 ——「『`npm start` → `unchain`』**不是仓库属性**」。支撑它只需两件事：`:216-218` 证明非打包路径读的是 `.local`（受控、可复核），而 `.local` 不在仓库里（受控事实）。**至此该否定命题已经成立，`.local` 里写的是 `true` 还是 `false` 都不改变它。** `.local` 的具体内容只在一处额外起作用：说明本机此刻恰好会走到 `featureEnabled = true` 那一支。故 —— **承重的那一半落在受控文件上，不可复核的那一半只承担例证角色。** 反过来说：任何试图用本条去主张「dev 运行时实际取值就是 X」的引用，**才** 会真正压在 `.local` 上，那种引用不被本条支持。
- **来源归类**: 内部来源。**须分两级登记**：`memory_v2_rollout.js` / `build/build_feature_flags.json` / `package.json` 为受控的本仓一级原始物；`.local/build_feature_flags.snapshot.json` 为 **本机非受控观察**，无保管链、无 revision 锚，可复核性弱于自证类

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0025
- **阶段**: 议案庭审
- **结论**: 本批精度最高的一条。15 个字段、四个 status 取值的每一个行号、七个跨文件锚点 **全部逐行精确**，三条 grep 全部原样复现。核心链路（main 15 字段 → IPC → preload 裸透传 → `normalizeUnchainStatus` 丢弃）经我逐段走通。
- **依据**: E-0025
- **不确定性**: 提交方自陈「未在运行中的应用里 `await window.unchainAPI.getStatus()` 观察过一次」属实 —— 本条全部是代码路径推断。该推断的强度经我复核后 **高于其自谦**（见相关性）。
- **请求/下一步**: 可承重。
- **评估结论**: 已验证
- **证据编号**: E-0025
- **来源类型**: general
- **真实性**: 已确认。`:1645-1663` **恰为 `memoryV2` 块的起止**，其中字段 **恰 15 个**，名称与顺序与登记完全相同（`configured, ready, status, reason, featureCeiling, configuredMode, releaseRolloutMode, rolloutMode, canaryPercent, readOnlyDegraded, platformActiveBlocked, releaseRolloutFingerprint, rolloutFingerprint, sidecarFingerprint, snapshotFingerprint`），其中 4 个为 fingerprint ✓。status 四值的每一个行号我逐一验证，**无一偏差**：`off` 在 `:1053`、`pending` 在 `:1055`、`degraded` 在 `:1045`/`:1875`/`:1881`/`:1970`、`ready` 在 `:1875`/`:1970`。`:1039-1056`（`initialMemoryV2Readiness`）、`:1068`（声明）、`:1637-1664`（`getMisoStatusPayload`）、`:1852`（`verifyContextV2Readiness` 起）、`:4706`（`startMiso` 重置）全部精确。`register_handlers.js:236-238`、`preload/channels.js:17`、`unchain_bridge.js:4`（`getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)`，确为裸透传）、`api.shared.js:330-343`（`normalizeUnchainStatus` 确重建为 6 字段，`memoryV2` 与 `contract` 确被丢弃）、`api.unchain.js:870-887`（`:879` 确为 `return normalizeUnchainStatus(status)`）全部精确。三条 grep 复现：`memoryV2Readiness` 在产品代码 **16 处且全在 `unchain/service.js` 一个文件内** ✓；`src/` 非测试代码中 **零处读 `status.memoryV2`** ✓（命中全是 `enable_memory_v2` flag 或同名局部变量）。**一处计数偏松**：`getMisoStatusPayload` 登记「3 个消费者」，实际 grep 另有 `service.js:5834`（导出对象）与 `boot_readiness/service.js:83`（注释）两处未计；两个真实调用点（`register_handlers.js:237` / `boot_readiness/service.js:224-225`）与登记一致，故结论不受影响。
- **可靠性**: 提交方在自己边界内（`electron/**`）的一级读取，跨入 shared-arteries 的部分已自陈只作「请其确认」的锚点，正文守住了。
- **相关性**: 相关且充分。**我另作一项独立观察，方向是加强而非削弱**：`src/SERVICEs/test_bridge/index.js:82-84` **直接调用 `unchainAPI.getStatus()`**（走裸 preload 桥，不经 `api.unchain` facade），即今天 renderer 进程里 **确实存在一条能拿到未归一化 15 字段载荷的现役路径**。E-0025 未引此处，但它正是其「renderer 今天就能拿到」的实证支点 —— 该推断因此比提交方自陈的更硬（该文件属 dev 面，其性质由相应 owner 判断，我不裁）。**须收窄一处**：本条「部分反驳 `code-owner-settings` 的 F2『唯一没有绕行方案』」是对他人命题的反驳，本条锚点只证明「存在另一条已经在线的状态通道」，**是否构成可用的『绕行方案』属实体争点，不由本条导出，我不裁**。
- **来源归类**: 内部来源（本仓一级原始物，含跨 owner 边界只读）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0026
- **阶段**: 议案庭审
- **结论**: 两段引用注释 **逐字属实**，错误对象的完整生命周期（`parsed.error.code` → `error.code` → 保码重包为 `[code] static message`）经我逐段追踪成立。两处行号范围偏松。「七码无一漏解」一句的射程须收窄。
- **依据**: E-0026
- **不确定性**: 提交方自陈「未观察一次真实 IPC 往返」「未验证 Electron 包裹前缀不干扰正则」属实。该正则 `/\[([a-z0-9_]+)\]\s/` 确无锚点，故前缀理论上不干扰 —— 但这仍是推断，与提交方判断一致。
- **请求/下一步**: 可承重，**须与 E-0027 捆绑引用**（见相关性）。
- **评估结论**: 已验证
- **证据编号**: E-0026
- **来源类型**: general
- **真实性**: 已确认。`:182-185` 的注释原文 *"…the stable code rides in the message behind a `[<code>] ` prefix (Electron strips error.code across ipcMain.handle) AND stays on .code for main-process callers."* **逐字命中**；`:1932-1933` 的注释 *"readJsonResponse surfaces the sidecar's stable error code; keep it and re-wrap so the renderer only ever sees `[code] static message`."* **逐字命中**；`:1938` 逐字为 `throw createContextV2Error(code, "context v2 request failed");`。我另独立追踪了其未展开的中段：`:1745-1757` 确从 `parsed?.error?.code` 提取到局部 `errorCode`，`:1767-1770` 确将其挂到 `error.code` 后抛出 —— 即 `:1740-1771` 这个子区间的描述 **完全属实**。`:1892-1940`（`contextV2Request`）及其四个子锚点 `:1893` / `:1897-1906` / `:1914-1922` / `:1931-1938` **逐行精确**。`context_v2_bridge.js:53-57`（`ERROR_CODE_TOKEN_PATTERN`）与 `:69-82`（`unavailableError` / `parseContextV2ErrorCode`）**逐行精确**。**两处范围偏松**：`readJsonResponse` 登记 `:1733-1786`，实际闭合于 `:1783`，多包了三行的段落注释；`listContextV2Spaces` 登记 `:2098-2105`，实际闭合于 `:2106`。
- **可靠性**: 提交方在自己边界内（`electron/main/**`）的一级读取；跨入 shared-arteries 的 renderer 正则部分已自陈只读引用。
- **相关性**: 相关，**须两处收窄**。**(1)** 「七个服务端码全部匹配 `[a-z0-9_]+` → renderer 正则可解析，**无一漏解**」—— 本条锚点证明的是 **机制**（码被保留在 `.code` 上并重排为 `[code] message`，renderer 侧正则形如 `/\[([a-z0-9_]+)\]\s/`）；**「恰好是这七个码」的普查不在本条来源定位之内**，须另据。机制成立，普查未证。**(2)** 「code 端到端不丢」只在 **就绪门之后** 成立 —— 同一提交方的 E-0027 记录了一个前置例外（`ensureMisoReady` 抛出的是无 `[code]` 前缀、无 `.code` 的裸 `Error`），而 `contextV2Request` 的 **第一行** 正是 `ensureMisoReady()`（`:1893`，我已核）。**E-0026 自身不携带这条限定，E-0027 携带；两条必须一同引用，单引 E-0026 会得到一个过强的结论。**
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0027
- **阶段**: 议案庭审
- **结论**: 两处锚点 **逐行精确**，两段引用代码 **逐字属实**。该条最有价值之处在于它是对自家 E-0026 的 **自我限定**，且限定得准确。
- **依据**: E-0027
- **不确定性**: 提交方自陈「未逐一断言 `getContextV2Tree`，故其行为相同是推断」属实且诚实。我可补强该推断的力度（见相关性），但 **它仍是推断，不是观察**，这一点我不改写。
- **请求/下一步**: 可承重。请 speaker 在任何引用 E-0026 之处一并带上本条。
- **评估结论**: 已验证
- **证据编号**: E-0027
- **来源类型**: general
- **真实性**: 已确认。`service.js:1666-1676` **恰为 `ensureMisoReady` 的起止**；`:1672-1674` 逐字为 `throw new Error(\`Miso service is not ready (status=${unchainStatus}${reasonSuffix})\`);` —— **确无 `[code]` 前缀、确未给 `.code` 赋值**，与登记完全一致。`context_v2_service.test.cjs:1414-1430` 精确：`:1416-1417` 的注释 *"Every capability (not just status) fails closed while the sidecar is not ready — no request is attempted at all."* 逐字属实，`:1418-1420` 与 `:1421-1429` 两个 `rejects.toThrow(/not ready/i)`、`:1430` 的 `expect(fetchImpl).not.toHaveBeenCalled()` 全部命中。登记对第二个断言以 `{...}` 省略了 payload，**省略有显式标记**，非隐藏。我另复跑 `grep -n "not ready"` 得 `:249` / `:1417` / `:1420` / `:1429` 四处，与登记一致。
- **可靠性**: 提交方在自己边界内（`electron/**`，含测试）的一级读取。
- **相关性**: 相关且充分。**我可为其自陈的推断补一节旁证，但不改其性质**：`getContextV2Tree`（`:2108-2116`）确实与被断言的 `listContextV2Spaces` 一样以 `contextV2Request` 为唯一出口，而 `contextV2Request` 的第一行即 `ensureMisoReady()`（`:1893`）—— 三者共用同一条第一行属实。故该推断在结构上很硬；**但测试确实没有断言 `getContextV2Tree`，「被测试锁住」这句只对被点名的两个方法成立**，提交方已如实标注，我确认该标注准确。
- **来源归类**: 内部来源（本仓一级原始物）

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0028
- **阶段**: 议案庭审
- **结论**: 五处锚点 **全部逐行精确**（Python 侧三处的边界精度尤为罕见：`:315-328` 恰好收在 `return _runtime()`、`:718-734` 恰好闭合那个 `raise`、`:694-735` 恰好收在 `return None`）。**就点名的一问：跨界自我限制在正文中基本被遵守，但有一句越过了「只主张分支形状」的界，须按佐证而非权威采纳。**
- **依据**: E-0028
- **不确定性**: 提交方自陈未实跑任何 Python 属实。**一项它未标、我须补的**：其「独立交叉验证 E-0010」只对 `off` 一支成立；`unchain` 一支（`:728` 的 `context_v2_owned_by_unchain`）在本案中 **从未有任何运行时观察**（E-0010/E-0012 的复核记录均载明该分支因 `import unchain` 失败而无法实跑，且审查人与提交方同机同缺陷）。故该支 **只有静态读这一个来源，无交叉**。
- **请求/下一步**: 可承重（就分支形状）。请 speaker 在引用「出厂默认态 `getStatus()` reject」时并列引 E-0010 作为运行时依据，勿以本条为该结论的出处。
- **评估结论**: 已验证
- **证据编号**: E-0028
- **来源类型**: general
- **真实性**: 已确认，**全批精度最高**。本边界内：`:1946-1957` 恰为合成负值分支（**8 字段，与 E-0020 所载 allowlist 同集**）、`:1958` 恰为 `contextV2Request("GET", …/status)`、`:1974` 恰为 `projected.available = projected.available && validation.ok;`。跨界只读三处：`route_memory_v2.py:982-1006` 恰为 `context_v2_status` 全体，**「无 try/catch」经我逐行确认成立**（异常一律上抛至 `@_endpoint`）；`:786-799` 恰收在 `if store_owner != STORE_OWNER_UNCHAIN: return _runtime().status()`；`:315-328` 恰收在同形的 `return _runtime()`；`memory_v2_runtime.py:718-734` 逐字为 `if configured_owner in {STORE_OWNER_OFF, STORE_OWNER_UNCHAIN}: … code = "context_v2_store_disabled" if configured_owner == STORE_OWNER_OFF else "context_v2_owned_by_unchain" … raise MemoryV2Error(code, …, status_code=503)`，**与登记逐字一致**。其自陈的旁证亦属实：`context_v2_service.test.cjs:249` 的测试名 *"status short-circuits without a request when the runtime is not ready"* 逐字命中。
- **可靠性**: **跨界只读**（`unchain_runtime/**` 不在 `code-owner-electron` 边界内）。**就点名的一问，我的核实结论**：自我限制 **在正文中被遵守** —— 完整性限制 (1) 与证据类型判据两处均明写「只主张代码里的分支长这样，运行时行为的权威结论归 `code-owner-runtime`」，而净内容/关键原文各行 **全部是分支结构与常量，无一句断言端点实际返回什么**。**一处越界须标记**：「支持/反驳」栏写「支持 丁的核心结论（出厂默认态下 `getStatus()` **reject 而非 resolve**，8 字段 allowlist 不可达）」—— 「reject 而非 resolve」是 **运行时效果**，不是分支形状。该句以「支持他人结论」的形式出现、紧跟其后即为权威让渡、且所述效果确已由 `code-owner-runtime` 实跑取得（E-0010 之 503 `context_v2_store_disabled`，本庭 S-0007 已验），故 **性质属佐证而非自立权威**。按此采纳则自我限制成立；按字面读作本条自证运行时行为则不成立。
- **相关性**: 相关。**须两处收窄**：**(1)** 本条对「出厂默认态」结论的贡献是 **分支层的**（代码里确有这条 503 通路），运行时那一半的出处是 E-0010，**不是本条**。**(2)** 其自称「独立交叉验证 E-0010」—— 就 `off` 支成立（静态分支与实测 503 同码）；就 `unchain` 支 **不成立**，因该支从无任何运行时观察可供交叉，本条的静态读是它 **唯一** 的证据来源。另：本条「推翻我自己的一条持久记忆（原记默认构建下返 404 `context_v2_not_found`）」经我核实方向正确 —— 本 revision 上该路径确为 503 而非 404。
- **来源归类**: 内部来源（两仓一级原始物，跨 owner 边界只读）

---

## 批次小结（供 `speaker-of-the-house` 处置，非裁定）

**13 条全部 `已验证`，无 `未验证`，无 `相矛盾`。** 全批时效前提成立：产品目录在庭审期间零变动，无一条因行号漂移失效。

**须随证据一同流转的事项，按轻重排列：**

1. **E-0022 的「反驳」射程过宽**（唯一实质性相关性问题）。它封死的是直接继承通道；间接通道由同一提交方的 E-0023（`readValue` + `allowProcessOverrides: !app.isPackaged`）证明是开着的。两条不冲突，但 E-0022 单独引用会得到一个错误结论。
2. **E-0026 必须与 E-0027 捆绑引用**。「code 端到端不丢」只在就绪门之后成立，前置例外在 E-0027 里。
3. **E-0020 主锚点整体早一行**（正确值：注释 `:1942-1944`、函数 `:1945-1986`），内容逐字属实。补正责任在 `code-owner-settings`。
4. **E-0028 的 `unchain` 支无交叉验证** —— 全案至今无人实跑过该分支，本条的静态读是其唯一来源。
5. **E-0023 的 `.local` 半边**：标注恰当；且其承重命题（「不是仓库属性」）由受控文件独立支撑，`.local` 只承担例证角色，**故不影响承重资格**。但该文件不受版本控制，任何引用须标观察时刻而非 revision。
6. **其余为誊录级偏差**，不影响任何结论：E-0023 `resolveMemoryV2ReleaseConfig` 实为 `:210-309`（这也消解了该条内部 `:241-279` 越出外沿的自相矛盾）、`validateMemoryV2Status` 实至 `:450`；E-0026 `readJsonResponse` 实至 `:1783`；E-0019 listing 键实为 `:7402-7405`；E-0016 两处行内标号各早一行；E-0018 facade 实为 124 行；E-0025 `getMisoStatusPayload` 命中实为 4 处（两个真实调用点无误）。

**两项加强性独立发现**（方向为支持提交方，非反驳）：`src/SERVICEs/test_bridge/index.js:82-84` 直接调用裸 `unchainAPI.getStatus()`，是 E-0025「renderer 今天就能拿到 15 字段」的现役实证支点；`memory_inspect_modal.test.js` 全文确只有一个 `test(` 块，E-0021「唯一测试」属实。

**声明**：本次复核与原观察 **同机同工作树**，证成的是同一 revision 上的可复现性，**不构成独立第二环境的佐证**。本报告不含任何对议案实体争点的意见。
