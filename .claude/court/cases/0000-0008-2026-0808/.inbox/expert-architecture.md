#### S-XXXX | ASSESSMENT | expert-architecture → case
- **阶段**: 议案庭审
- **结论**: **有条件成立。** 本案的可行性问题在管线形状这一层 **可以判定且答案是「能」**，但议案的措辞把两个不同的问题合并了：**「新增一个 tree view 在技术上能不能做」成立；「这个 tree view 显示出来的是不是一棵树」本案取证结构上不足以回答**（G8），二者必须在 `SUMMARY` 里分开。逐条：**甲 —— 本案 **确实** 踩中前案 D7，但四条主张 **不是同一个问题的四种答案**（两条竞争、一条正交、一条是测量而非主张）；**D7 被具体化，未被解开** —— 其定义性属性（无 owner）分毫未变，变的是它从「不可定位」变成「可指派」。`code-owner-electron` 的重述 **成立于它主张的范围，不成立于它隐含的范围**：`memoryV2` 确已跨过 IPC 线（我第三次独立复核 `normalizeUnchainStatus` 丢弃它，E-I1），「放行一个字段」确是约 6 行；但「认领契约」不是小事，且 **`memoryV2` 是进程全局的，答不了本案每一个消费者都在问的 per-`ownerChatId` 问题** —— 故它可以是两轴中的第一轴，**不能是那个单一状态源**。**不构成前置阻塞。** **乙 —— 落 `code-owner-settings`，`memory-inspect/` 下新组件，成立**；但满足 C8 的条件不是「新开一个文件」，是 **新组件不得自持判定**（boot 先例的「判定与呈现分离」）。**「几乎所有人零改动」的分布可信 —— 但由它推出的「本案便宜」不成立**：五份「零改动」全部附条件，其总和不是零，缺的那一块恰好就是无主构件。**丙 —— 处方确实被提在了错误的抽象层级，但不是 `code-owner-chat-core` 说的那个错法**：真正的三层是 L1 提取 / L2 分类 / L3 呈现语义；**该收敛的是 L1+L2，不该收敛的是 L3**。这个三分 **同时满足** `code-owner-chat-bubble` 的 B2 口径与 `code-owner-chat-core` 的语境分层反对，并解释了它们为何看起来对立而实际正交。`code-owner-chat-bubble` 对第三份拷贝的更正 **成立，且推论比它自己说的更强 —— 「N 份四态机拷贝」这个计数本身是错的，而错误的度量直接产出了错误的处方**。**丁 —— `context_v2_store_disabled` 在 `src/` 零命中（我独立复核）不是一条缺口，是本案唯一一个可证伪的结构度量**；它同时把「默认态显示未启用」从设计题变成 **本案唯一一处「零改动」明确不成立的地方**。**戊 —— 归一层不放任何一层，因为今天没有两套活形状**：`pupu_legacy` 的 entry 形状在 Electron 下结构性不可达，为死形状建归一层会破坏三个活消费面。**若将来必须归一，落 sidecar，不落 renderer/main**（`kind` 词汇权威是跨仓 enum，归一必须发生在能 import 它的最近一层）。11 条单向门见正文五。**己 —— 在此证据条件下，「可行」只能硬到「形状可行」**；我给出按「结论是否依赖 store owner 取值」的三分，并指出 **五份审查同时收窄不是五次疏忽，是取证可达性的必然后果**
- **依据**: E-I1, E-I2, E-I3, E-I4, E-I5, E-I6（本发言新提）；E-0002, E-0003, E-0004, E-0005, E-0006, E-0010, E-0011, E-0014, E-0018, E-0019, E-0020, E-0025, E-0026, E-0029, E-0030, E-0032, E-0034, E-0035, E-0036, E-0038, E-0039, E-0040, E-0042, E-0045, E-0046, E-0047, E-0048, E-0050, E-0053, E-0054, E-0055, E-0056；S-0002, S-0004, S-0005, S-0006, S-0007, S-0008, S-0009, S-0010, S-0011, S-0012, S-0013, S-0014, S-0015, S-0016, S-0017, S-0018；`0000-0003-2026-0807#S-0014`, `0000-0003-2026-0807#S-0024`, `0000-0003-2026-0807#R-0001`

- **不确定性**（总括为「有条件成立」，以下 **C-A1…C-A10 为全部必要条件**，另附三条未核实项）:

  **C-A1 · 议案必须显式接受「出厂默认态下 tree view 只能显示未启用」，并同时显式接受这一态不是零改动。** 依据 E-0048 / E-0053（我独立复核，E-I6）：`context_v2_store_disabled` 在整个 `src/` 零命中。该码是链路上「未启用」的唯一权威信号（`code-owner-runtime` E-0010(b) · `code-owner-electron` S-0010 丁(2) · `code-owner-shared-arteries` E-0039 三方同向）。**故必须二选一且必须选**：(i) 消费该码（= 做 L1/L2 的活）；(ii) 消费 `memoryV2`（= 放行 + 投影的活）。**不选的后果已被实证**：`code-owner-chat-bubble` 端渲染成红色 `role="alert"`，`code-owner-chat-core` 端落 FAILED「请重试」而重试永不改变条件。

  **C-A2 · 本案若产出任何共享判定构件，其口径必须止于 L2，不得包含 L3。** L2 = `(error) → {code, kind, parsed}`；L3 = 用户可见状态词。这是 `code-owner-chat-bubble` B2 与 `code-owner-chat-core` 6.3 的 **合取**，我判两者都成立且不冲突（正文三）。

  **C-A3 · L2 的类别集合必须由产端权威枚举定义，并配两道方向相反的守卫。** (a) 唯一权威枚举在产端；(b) 产端有一个测试断言「每一个可发出的码都在枚举里」；(c) 消费端的测试 **`import`/`require` 该枚举而非转写**。**三条缺一，映射会在下一个新码上静默失配。** 这是前案 C-ARCH-2 原文，本案 **无任何证据削弱它**，我重申。`code-owner-shared-arteries` 的 P1（判据权威留产端）是其 **必要半，不充分** —— 它没有覆盖 (b)(c)。我实测 boot 先例三条今天仍全部成立（E-I2）。

  **C-A4 · tree view 落 `code-owner-settings`，形态为 `src/COMPONENTs/memory-inspect/` 下的新组件；且 `memory-inspect/**` 不得成为任何共享判定的导出点。** 后半是前案不成立项 ①（`0000-0003-2026-0807#S-0024` 强制回应 ①）在本案的重申，成因相同：产品面组件目录一旦成为公共依赖，会从外部压破 `code-owner-settings` 自己的 C8。

  **C-A5 · 若共享判定模块落 `code-owner-shared-arteries`，落点为 `src/SERVICEs/context_v2_state.js`（与 `boot_readiness.js` 同级），不落 `src/SERVICEs/bridges/`。** 其 S-0011 5.2(1) 提的是后者。同一 owner、同一工作量，但目录承载语义：`bridges/` 的定义性属性是「不校验、不持状态、不加任何自己的东西」（其 A1，且被其自己的测试守护）。把一个持规则的模块放进那个目录，会削弱使 A1 可执行的那条契约本身。boot 先例已经给了正确切法：哑 bridge 在 `bridges/boot_readiness_bridge.js`，判定模块在 `SERVICEs/boot_readiness.js`（E-I2）。

  **C-A6 · 契约基准选定 `unchain`，且以「承认唯一活形状」而非「建一个归一层」的形式落地。** 验收对象为 `memory_v2_unchain_read_adapter.py`；**不得对 `memory_v2_store.py::get_tree` 作任何验收断言**（与 `code-owner-runtime` 约束 2、`code-owner-electron` 约束 4 同向）。若将来 owner 并存使归一成为必要，**归一落 sidecar，不落 renderer、不落 main**（理由见正文五 5.2）。

  **C-A7 · 方案庭审的验收标准中不得出现任何关于 tree 形状、深度、量级或空态语义的断言，除非 G8 已闭合。** 闭合的定义是：在一个 `import unchain` 成功的环境里跑过一次真实 `get_tree`，并记录三项 ——（a）返回的条目里 **有没有 `kind == "folder"`**；（b）一次 reject 的 `error.message` **原文**；（c）`entries` 非空时的 **字段集实测**。**这是我唯一一条要求在方案庭审前闭合的取证条件**，理由见正文六。

  **C-A8 · 若本案声明「不新增状态源、只消费已存在的信号」（`code-owner-electron` S-0010 Q2(3) 的出路，`code-owner-chat-core` 6.6 首推），该声明必须同时指明消费哪一个信号。** 不指明它是空的：今天有三条候选路径，而 renderer **一条都没在用**（`code-owner-chat-bubble` §4.1 逐条实证）。一个不指明消费对象的「不新增状态源」声明，在实施时会以「就近取一个」的形式落地，那就是第 6 份。

  **C-A9 · 挂载接口的扩展必须位置参数换对象，不得追加第三个位置参数。** 前案 C-ARCH-3 原文，`code-owner-chat-core` K3 同向。**我加一条本案独有的时效理由**：今天破坏面为零（E-0042：无任何测试断言 `onInspectMemory` 的参数；E-0049：全部引用点 7 处且全在一个目录）**是一个会过期的窗口** —— 一旦出现第二个调用点，改签名的破坏面从零变非零，而两个待送的值都是合法 chat id 形状的字符串，位置错位在 JS 里静默。

  **C-A10 · `ownerChatId` 必须由挂载点显式传入、打开时快照、不跟随活动会话，且不得在 modal 内部从任何全局取。** = `code-owner-settings` N1 + `code-owner-chat-core` K1/K4/请求 3 的合取。**我把它列为必要条件而非实施注意事项，理由是 E-0045 那条错主在整条链路上结构性不可检测**：三道防线（main 语法门 / 服务端 owner-scoping / facade 不校验）全部放行且全部没做错，因为没有任何一层知道用户想看的是哪个 chat。**一个没有任何层能事后发现的错误，其防线必须写成契约，不能写成注意事项。**

  ---

  **未核实项（我实跑到哪里为止）**

  1. **我未启动应用、未启动 Electron、未启动 sidecar、未发过一次真实 HTTP 请求、未跑任何测试套件。** 我的取证全部是 PuPu `b2385d5d` / unchain `a4e69f4` 上的静态阅读与只读 shell 命令。**依 A-012 未派生任何子 instance。** 凡涉及运行时行为的一律标推断。
  2. **G8 我同样跨不过去。** `store_owner=unchain` 分支我未实跑，本案至今 **四人（提交方 + 两名审查人 + 我）无一能跑**。我在 E-I3/E-I4/E-I5 里对该分支的全部陈述是 **静态比对**。
  3. **一条我只核到一半、明确交出的**：`pupu_legacy` 在写入时 **强制父 folder 存在**（`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"`），而这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因。**我在 `unchain:src/unchain/memory/workspace/service.py` 未找到等价强制，但我只读了那一个文件** —— 该强制可能在 repository port 或别处。**这不是主张，是一个问题，归 `code-owner-unchain`（第 5 批）。** 它的答案决定 `get_tree` 在活路径上返回的是树还是扁平列表。
  4. **G2 继承。** 本机 `entries=0`，「有数据时」一律不作断言（与前案同）。

- **请求/下一步**:

  1. **请 `speaker-of-the-house` 在 `SUMMARY` 中把议案的问题拆成两句**，不要合并：**(i)「新增一个 tree view 的管线形状可行」—— 本案证据充分；(ii)「该 tree view 呈现出来的是不是一棵树」—— 本案证据结构上不足**。本案迄今所有「可行」表态覆盖的都是 (i)。把二者合并会让裁定看起来比证据更硬（正文六）。

  2. **请 `speaker-of-the-house` 在保留 S-0012 D-A 四条并列的同时，为每一条标注它回答的是哪一层的问题。** 我 **不反对原样保留**，保留是正确的程序处置。我请求的是补一列 —— 因为四条被排成同一行这个记录形式本身，正在复制正文三所说的处方错层：两条竞争同一问题、一条正交、一条是测量而非主张（正文一 1.2 的表）。不标层，`chief-judge` 会被要求在四个不同层的答案里选一个。

  3. **请 `chief-judge` 把「共享判定构件的落点与 owner 指派」从本案剥离出来单独裁，并且不管 tree view 是否推进都裁。** 理由是本案产出了一份 **前案没有的东西**：一份完整的指派材料包（候选 owner 已自荐并开价 P1/P2/P3、替代 owner 已被指名、口径已被两个消费方分别约束、迁移成本已被逐站点计价）。**前案我说「传唤机制解不了它，只有指派能解」；本案的经验校准是 —— 传唤机制能做的最后一件事，是把指派从一个开放式判断降为一个二选一。它做到了，然后停在那里。** 材料齐了之后继续拖，成本从「不指派」变成「浪费一次已经付过的取证」。

  4. **请 `chief-judge` 把 `code-owner-chat-core` 提出的 0/5 度量写进裁定文本**（`context_v2_store_disabled` 在几份拷贝里被正确处理，今天 0）。理由见正文四：D7 此前一直是定性论证，谁都无法证伪；**给一个结构缺口配一个可测量的指标，是把它从辩论移进工程的唯一办法。**

  5. **请本庭把 E-I4 记为一条新增已知缺口**：活读路径有 10,000 条条目硬上限，**超限抛错而非截断**，本案至今无人提及。它与 `code-owner-electron` E-0032（「本层不封顶」）**不矛盾** —— 两句话在两个不同的层，合起来的净效果是：**tree view 的载荷上界由 sidecar 单方面决定，且到达上界时用户看到的是错误不是部分树。** 归 `code-owner-runtime` 与 `code-owner-unchain`。

  6. **请本庭把 E-I3 记为对 E-0014 的一处补正**：`pupu_legacy` 侧 `list_entries` 另加一个 `deleted` 字段（`memory_v2_store.py:7396-7400`），`unchain` 侧 `_route_entry` 无此字段。E-0014 的字段差异表漏记了它。**它对 tree view 是语义承重的**（要不要显示墓碑条目）。补正责任依证据规则第一节归提出方 `code-owner-runtime`；我只登记事实。

  7. **就 `expert-llm` 的边界，我写明依赖关系，不代其表态**（依本庭指示）：我的乙（落位）结论 **在其判「不为 V2 造投影」或「押后」时无条件成立**；**在其判「造」时，落位结论不翻转，但需追加一条前置** —— 那时 `memory-inspect/` 会从「一个 modal + 两个内容组件」变成「一个需要内容路由的容器」，`code-owner-settings` 的 C8 就不是「加一个新组件」能满足的了，**重开的是容器形态，不是 tree view 的位置**。故我的 C-A4 在两种裁法下都成立，只是后者需要并列一条容器形态的待裁问题。

  8. **不请求补传任何角色。** 我边界内本次作业不增删改任何 channel、bridge 面、facade 方法或 locale 键；`expert-security` / `expert-ux` 的不传唤判定在我这一侧继续成立。触发线我采纳 `code-owner-electron` 丁(4) 与 `code-owner-shared-arteries` A2 已画的那两条，不另立。

  9. **本阶段不提交 `PROPOSAL`。**

- **评估结论**: **有条件成立**（总括，条件为 C-A1…C-A10）。逐条三值：

  | 问 | 判定 |
  |---|---|
  | **甲 · 是否踩中 D7** | **成立**（踩中，且是最直接的一次） |
  | **甲 · D7 是否被解开** | **不成立** —— **只被具体化**。定义性属性（无 owner）未变 |
  | **甲 · 四条主张是否同一问题的四种答案** | **不成立** —— 两条竞争、一条正交、一条是测量 |
  | **甲 · `code-owner-electron` 的重述是否成立** | **有条件成立** —— 成立于其主张的范围；**不成立于其隐含的量级结论**（正文一 1.3） |
  | **甲 · 是否构成前置阻塞** | **不构成**（与六名 owner 同向） |
  | **乙 · 落 `code-owner-settings` / `memory-inspect/` 新组件** | **成立**，但 C8 的满足条件须加强（正文二 2.1） |
  | **乙 · 「零改动」分布是否可信** | **可信**；但由它推出的「本案便宜」**不成立**（正文二 2.2） |
  | **丙 · 「统一四态判定」是否提在错误抽象层级** | **成立**（但错法与 `code-owner-chat-core` 所述不同，见正文三） |
  | **丙 · 该收敛的是哪一层** | **L1 提取 + L2 分类 该收敛；L3 呈现语义 不该收敛** |
  | **丙 · `code-owner-chat-bubble` 对第三份拷贝的更正** | **成立**，且推论比其自述更强 —— **计数本身是错的** |
  | **丁 · 零命中对可行性的意义** | **本案唯一一处「零改动」明确不成立的地方** |
  | **戊 · 归一层落哪一层** | **今天不落任何一层**（无两套活形状）；将来若必要 **落 sidecar** |
  | **戊 · 选定 `unchain` 为契约基准** | **成立**，但措辞须由「归一」改为「承认唯一活形状」 |
  | **己 · 「可行」判断能有多硬** | **硬到「形状可行」，硬不到「可用」** —— 二者必须在 `SUMMARY` 分开 |

  **另附五项「不成立」，每一项的限定半句请本庭照录**（正文七）。

- **专业适用范围**: 全系统架构、功能落位（哪一层 / 哪个 owner）、跨层接缝、跨仓契约、共享原语与公共动脉的结构变更、可逆性与单向门判定。**明确不在范围、我不表态的**：(a) 任何具体视觉 / 交互设计，含 tree view 的呈现形态、两个 view 的切换方式、空态文案（归 `expert-ux`，本阶段依 S-0001 范围纪律不议）；(b) 「该不该为 V2 造一套投影」（`expert-llm` 的边界，我只写依赖关系，见请求 7）；(c) `store_owner=unchain` 分支的运行时行为（G8，无人可跑，我不假设）；(d) 「有数据时长什么样」（G2）；(e) 错误码的用户可见文案措辞；(f) 测试覆盖率取舍（`expert-qa`，本案未传唤）。**我只判专业成立性，不判议案要不要做 —— 取舍权属 `chief-judge`。**

- **专业理由**: 四条主线。**(1) 本案的「零改动」分布是一个真实的结构性质，不是运气** —— 它由 facade 的全有或全无探针（18/18，fail-closed）直接产生：该设计使得任何方法要么全组就位要么全组不可用，不存在「这个方法还没接好」的中间态。但同一个性质也解释了为什么「零改动的总和不是零」：**管线是加法的，判定不是**，而本案要新增的恰好是一个判定消费者。**(2) 前案我把病灶定位为「一个缺失构件在八个地方分别显形」；本案的六份取证把它精修了一格 —— 缺失的不是一个构件，是一个抽象层级的划分。** L1（提取）今天已经单点（facade `:57,:77-82`）却没人被强制走它，L2（分类）今天无人拥有，L3（呈现语义）今天分散且**分散是对的**。把三层打成一个包叫「四态判定」，是本案（和前案）一直在用的错误度量；错误的度量直接产出错误的处方，而 `code-owner-chat-core` 的原则性反对与 `code-owner-chat-bubble` 的「真正重复的在底下一层」是同一个发现从两端各到达一次。**(3) 落位与归一都不需要发明，本仓的两个既有形状各自给了答案**：判定的落位由 `boot_readiness`（renderer 单一读在 `SERVICEs/` + 产端 `Object.freeze` 枚举 + 消费端 `require` 而非转写）给出，我实测三条今天全部成立（E-I2）；归一的落位由「谁能 import 权威 enum」给出 —— `kind` 词汇表的权威是 `unchain:MemoryEntryKind`，能 import 它的最近一层是 sidecar，renderer 归一等于手抄一个跨仓 enum，而 boot 先例的注释逐字反对手抄。**(4) 本案的证据条件产生了一个可预测的系统性偏差，它不是纪律问题** —— 当唯一可跑的路径与产品路径不相交时，每个人都会在可跑的路径上取一个真结果，再把结论说到待裁问题所需要的宽度；**需要的宽度由问题定义，可跑的宽度由环境定义**，两者不相交时没有任何个人纪律能弥合。五份 examiner 审查全部命中同一条，是这个结构的直接后果，不是五次疏忽。唯一的处方是把那条路径跑起来（C-A7）。

- **支撑证据**: E-I1（`normalizeUnchainStatus` 逐字复核 + `api.unchain.getStatus` 的唯一产品消费者 —— 第三次独立同向）· E-I2（`boot_readiness` 先例在 `b2385d5d` 上的完整性复核，前案 E-0090 的当前 revision 重测）· E-I3（两侧 entry / `get_tree` 逐字复核；**E-0014 漏记一个字段**；共有 13 字段含全部树结构字段；树装配算法两侧字面等价且含静默孤儿升根）· E-I4（活读路径 10,000 条硬上限，**超限抛错而非截断**，本案无人提及）· E-I5（folder 条目的两端产能与一条写时不变量的不对称，附未核实标记）· E-I6（`context_v2_store_disabled` 与 `memory-inspect/` 目录的独立复核）。跨面引用见「依据」。

---

## 正文

### 一 · 甲 —— D7 在本案是被解开了，还是被具体化了

#### 1.1 先答本庭的第一问：这四条不是同一个问题的四种答案

我把 S-0012 D-A 的四条按 **它们各自回答的问题** 重排，得到的形状与本庭并列的那张表不同：

| 主张方 | 它实际回答的问题 | 层 | 与其他三条的关系 |
|---|---|---|---|
| `code-owner-settings` | 「V2 **配置为开** 吗」（store 侧自述） | sidecar 状态面 | **与 electron 竞争同一问题** |
| `code-owner-electron` | 「本机这次启动 **把 V2 配开了** 吗」（main 侧 rollout 决策 ∧ 一次探测） | main 配置面 | **与 settings 竞争同一问题** |
| `code-owner-shared-arteries` | 「**这一次读** 成功了吗」 | 单次调用面 | **正交，不竞争** |
| `code-owner-chat-bubble` | （无主张）「三种今天一个都没在用」 | 消费面 | **是测量，不是答案** |

**第三条与前两条不构成对立**：一次调用的成败在原理上答不了「是否配置为开」（`getTree` 在 `off` 态 reject，reject 的原因可以是 store 关着、也可以是 sidecar 没起来、也可以是 bridge 缺席），而一个配置状态在原理上答不了「有没有数据」。这正是 `code-owner-settings` 自己在 N3 里写下的那条：**启用/未启用问 status，空/非空问数据调用，这是两次调用的 join，不是一次返回里的判别位。** `code-owner-shared-arteries` 的 E-0039 是这个 join 的 **数据半边**，`code-owner-electron` 与 `code-owner-settings` 争的是 **配置半边的权威归谁**。

**所以真实的分歧只有一条，而不是四条。** 把四条排成同一行这个记录形式，本身正在复制正文三要说的那个处方错层 —— 它把不同层的答案摆成互斥选项。**我不反对原样保留（那是正确的程序处置），我请求补一列标注层**（请求 2）。

#### 1.2 配置半边的那一条分歧，在证据上是可判定的，不是偏好

- **`contextV2Bridge.getStatus()` 在最需要它作答的那一态里根本不返回字段。** `code-owner-electron` 静态追出、`code-owner-shared-arteries` 独立静态追出、`code-owner-runtime` 实跑观察到服务端半边 —— **三条独立路径同向**（S-0010 丁(2) · S-0011 1.2 · E-0010 b3）。**一个在你最需要读它的状态里抛异常的状态源，不是状态源。** 这一条我判成立，`code-owner-settings` 的 F2 前提被证伪的部分成立。
- **`memoryV2` 是一个真实的四态机。** 我复核：`status` 闭集四值（`off` | `pending` | `degraded` | `ready`，产地 `service.js:1039-1055` 三分支 + `:1874-1878` / `:1969-1973`），`configured` 与 `ready` 两个布尔把「配置为关」与「配置为开但没就绪」分开 —— 这正是 `contextV2Bridge.getStatus()` 的 8 字段切不下来的那一刀。

**所以，若必须在两者中选一个作配置半边的权威，答案是 `memoryV2`。** 这一格我与 `code-owner-electron` 同向。

#### 1.3 但它的重述有一半不成立，而那一半正是 D7

`code-owner-electron` 的原话：**「不是没人造，是造好了、跨过 IPC 了、被上一层 normalizer 丢掉了、没人消费」**，并称问题量级从「建构件」降为「认领契约 + 放行一个字段」。

**成立的部分，我第三次独立复核并确认（E-I1）：**

```js
// src/SERVICEs/api.shared.js:330-343  —— 我逐字读过全文
const normalizeUnchainStatus = (status) => ({
  status, ready, url, reason, pid, port          // 6 个键，重建，不是投影
});
```
`memoryV2` 与 `contract` 确实被丢弃。而 `api.unchain.getStatus()`（`api.unchain.js:870-885`）在拿到主进程载荷后 **无条件调 `normalizeUnchainStatus`**，其在 `src/` 的 **产品消费者只有一个**：`src/PAGEs/chat/chat.js:578`。**所以「放行一个字段」这句在破坏面上是准确的 —— 只有一个既有消费者，约 6 行。** 这与 `code-owner-chat-bubble` E-0055 的独立实读一致（第三次同向）。

**不成立的部分，三条，按分量排序：**

**(a) `memoryV2` 是进程全局的，答不了本案每一个消费者都在问的问题。** 本案全部 V2 消费者 —— `chat-bubble` 三个、`chat-core` 两个调用点、以及本案要新增的 tree view —— **全部是 per-`ownerChatId`** 的。`memoryV2` 里没有任何字段随 owner 变化。`code-owner-chat-bubble` §4.2(2) 已经说了这一半（「它答不了这个会话有没有数据」）。**我把它推到结论**：`memoryV2` 可以是两轴中的第一轴，**不能是「那个单一状态源」**。故 D7 索要的那个构件 **不等于 `memoryV2`** —— 它等于「`memoryV2`（配置轴）× 数据调用的成败与码（数据轴）」的那个 join，**而 join 今天仍然没有 owner，也仍然没有一行代码**。

**(b) 「认领契约」不是小事，而它被「放行一个字段」的量级掩盖了。** `memoryV2` 今天是一个 **诊断载荷**：15 个字段，其中 4 个是 sha256 指纹，另有 `platformActiveBlocked` 这种平台内部决策。把它升为产品状态契约是一次 **类型变更**，不是一次转发。`code-owner-electron` 自己认领了契约测试 —— 那是对的，也是必要的 —— **但契约测试是这件事里最便宜的一部分**。真正要作的决定是 **投影**：哪几个字段成为对外承诺。放行而不投影 = renderer 组件开始依赖诊断字段 = 收窄时要同时改 main、改 normalizer、改全部消费者。**这是单向门（正文五第 1 条），而它在「6 行」这个数字里看不见。**

**(c) 「被上一层丢掉了」这句在归因上是准的，在评价上会误导。** `normalizeUnchainStatus` 丢弃 `memoryV2` **不是疏忽，是 allowlist 投影** —— 它与 `code-owner-shared-arteries` 的 A1（facade 不加任何自己的东西）是同一条纪律在两个文件上的两次体现。**「被 normalizer 丢掉」与「normalizer 正在履行它的契约」是同一件事。** 所以放行不是修 bug，是 **改变一条既有纪律的适用范围** —— 这需要 owner 的同意，而 `code-owner-shared-arteries` 在其 P3 里恰好把这件事标成了 **它认不认领共享模块的前置**（「若它日后被暴露，我的模块一夜之间变成第二个权威」）。**两个 owner 各自把对方的动作列为自己的前置，这是 D8「三方主张全部正确、合起来无人负责」在本案的第二次出现。**

#### 1.4 直接回答本庭：解开了还是具体化了

**具体化了，且具体化到了可指派的粒度。D7 的定义性属性 —— 无 owner —— 分毫未变。**

前案 D7 的形式是：**四名角色在互不知情的独立首轮里，各自索要了同一个不存在的构件。**
本案的形式是：**六名 owner 在互不知情的独立首轮里，对这个构件「已经部分存在于哪里」给出了四种不同的答案。**

**从「不可定位」到「可指派」是真实进展。** 但要看清它是什么进展：前案缺的是「它在哪」，本案已经知道它在哪（L1 在 facade、配置轴在 main、数据轴在每次调用），缺的是 **谁拥有把它们合起来的那一步**。而 `code-owner-chat-bubble` 提供了这件事最干净的实证：**它在完全没有 tree view 的情况下，已经独立长出六个站点四种纪律。** 无主构件不会因为无人使用而消失，它会因为无人拥有而复制。

**我对自己前案那句话的经验校准（请本庭记入，这是本发言里唯一一条自我更正）：**

> 前案我说「传唤机制解不了它，只有指派能解」。**本案证明这句话对了一半。传唤机制确实不产生 owner —— 但它能做的最后一件事，是把「指派」从一个开放式判断降为一个二选一，并把两边的价都开出来。** 本案已经做到了：候选 owner 自荐并开价（`code-owner-shared-arteries` P1/P2/P3 + 4 份迁移跨 3 owner）、替代 owner 被指名（`code-owner-electron`，附四行代价对比表）、口径被两个消费方分别约束（B2、6.3）、迁移成本被逐站点计价（6 站点 × ≤5 行）。**这是一份完整的指派材料包，前案没有。**
>
> **推论：现在不指派的成本，已经从「不指派」变成「浪费一次已经付过的取证」。**

#### 1.5 是否构成前置阻塞 —— 不构成

六名 owner 各自独立给出同一理由，我复核后同意，并补一条只有从架构位置能给的：**本案全部可行性结论按「是否依赖 store owner 取值」可以整齐地三分**（正文六 6.2），而 **落在「不依赖」那一类里的结论，恰好覆盖了议案的全部四个待裁问题的可行性半边**。前案 16 项强制回应的任何回应组合都不改变值传递、作用域、channel 存在性与 facade 形状。**故 G1 对本案的可行性论证零杀伤。**

**但我要精确说出什么是被阻塞的**：不是可行性，是 **实施的形状**。三名 owner 各自以不同措辞给出了同一个届时阻塞（`code-owner-settings` F5「拒绝造第 5 份」· `code-owner-shared-arteries` 5.4 末「不接受五份拷贝这个空选项」· `code-owner-chat-core` 6.6「不接受一份折平的映射」）。**三条立场不是三份反对，是同一条约束的三次独立发现**，而第三条比前两条多一个维度（不只反对没有模块，也反对模块太宽）—— 与 `code-owner-chat-bubble` FB2 同向。**这四方在同一件事上收敛，是本案最强的一条结构信号，比任何一份单独的 ASSESSMENT 都重。**

---

### 二 · 乙 —— 落位

#### 2.1 落 `code-owner-settings` / `memory-inspect/` 下新组件：成立，但理由与满足条件都要加强

**我实测（E-I6）**：`src/COMPONENTs/memory-inspect/` 今天只有两个文件（`memory_inspect_modal.js` 30,849 字节 + `memory_inspect_modal.test.js` 2,678 字节）。**它今天不是一个目录，是一个文件加一个测试。** 新增一个组件把它转成多组件特性目录 —— 这是可逆的，且不产生任何新的跨 owner 面。

**落位理由**：`code-owner-settings` 给的是 C8 合规（别再往那 959 行里塞）。那是内部卫生理由。**结构理由是另一条，且它与我前案 §2.3 给接缝 owner 的原则是同一条**：

> **落位应当跟随「谁的形状不对就交付不了」。**

tree view 的消费者是 Inspector；**Inspector 是唯一一方，其交付会因为形状错误而失败**。所以它是唯一有持续动力维护该形状的一方。`code-owner-chat-core` 的义务是按 consumer 声明的形状供给（它已承诺，且实测破坏面为零）。这与前案 C3/C4 的分工完全一致，本案不改判。

**但 C8 的满足条件必须加强，这是我对 `code-owner-settings` 的一条补充：**

`code-owner-settings` 认为「tree view 作为 `memory-inspect/` 下的新组件，C8 即满足」。**新开一个文件不足以满足 C8。** 理由在它自己的 E-0021 里：今天 `memory_inspect_modal.js` 之所以是一个 959 行的塌点，不是因为它长，是因为它 **同时持有请求、判定与渲染** —— `:374-377` 自己发请求、`:398-408` 自己判 `points.length === 0`、`:584-603` 自己渲染，且 `:434-436` 的 5s 静默轮询直接改状态。**一个新组件若原样重复这个三合一，只是把塌点搬了个位置，C8 的立法目的落空。**

boot 先例给的正确形状是 **判定与呈现分离**（我实测 E-I2，`src/SERVICEs/boot_readiness.js` 文件头逐字：模块产出状态，`BootOverlay` 只渲染，且 `boot_progress` 保持哑原语）。**故 C8 的满足条件应写成两条**：(i) tree view 是 `memory-inspect/` 下的新组件；**(ii) 该组件不自持四态判定，只渲染由 L2 给出的类别。** 只有 (i) 没有 (ii)，就是 `code-owner-settings` 自己在 3.2 表格第二行说的那件事 —— **「我可以在自己边界内写出第 5 份四态映射并且它能跑，正因为能跑，才更需要点名」。**

#### 2.2 「几乎所有人零改动」的分布是否可信

**分布可信，且它有一个可检验的结构解释；但由它推出的「本案便宜」不成立。**

**可信的机械原因，我判它不是运气**：链路的每一段今天都已被 **另一个消费者** 走过 —— 第一跳 `listSpaces` 有活的生产消费者（`memory_v2_pending_reviews.js:782`，E-0040），`getTree` 的 channel/handler/preload/main 全段被 `.cjs` 测试逐字断言（E-0029/E-0030），facade 是 18 方法白名单纯透传。而这三者能同时成立，根源在 **`resolveApi()` 的全有或全无探针（18/18，缺一即整个 facade 失明）**：**该设计使得任何方法要么全组就位、要么全组不可用，不存在「这个方法还没接好」的中间态。** 这是一次我要点名的既有设计决策 —— 本案「零改动」是它的直接推论，不是巧合。

**「便宜」这个推论不成立，因为五份「零改动」全部附条件，且条件不相交：**

| owner | 报告 | 条件 |
|---|---|---|
| `code-owner-runtime` | 0 处 | 条件性影响 2：服务端双 owner 归一会 **改动 chat-bubble 三个既有消费者依赖的响应形状**，「破坏面非零，不是只加不减」 |
| `code-owner-electron` | 0 处 | 认领一个契约测试；且 FE5/FE7 把「零改动」的适用域限死在 macOS + 本机不入库的 `.local` 快照 |
| `code-owner-shared-arteries` | 0 处 | Q2 若落它 = 新模块 + **迁移 4 份跨 3 owner**；且明言「只落定义不做迁移，结果是 5 份变 6 份，比不做还坏」 |
| `code-owner-chat-bubble` | 0 处 | FB5 成立即 **6 个站点**；且已认领两个自造码的清除 |
| `code-owner-chat-core` | **6 处** | 唯一报非零者，而它恰好是唯一被要求 **送值** 的那一端 |

**净效果：零改动的总和不是零。** 它是「**管线零改动 + 一个未指派构件的全部代价**」。而这两项之所以能被分开报告，正是因为第二项没有 owner —— **没有 owner 的工作在每个人的边界统计里都是零。** 这是「零改动」分布最该被读出的一层含义，而它与 D7 是同一件事的记账形式。

**故我判**：分布可信；**「因此本案便宜」不成立**，把它读成便宜会直接产出第 5/第 6 份拷贝 —— 这正是 `code-owner-chat-bubble` 从相反方向证明的（**它在没有 tree view 的情况下已经独立长出六份**）。

---

### 三 · 丙 —— 该收敛的到底是哪一层

本庭认为这是本案最该由我判的，我同意。这一节是本发言的主轴。

#### 3.1 「统一四态判定」确实被提在了错误的抽象层级，但不是 `code-owner-chat-core` 说的那个错法

真实的层级有三个，而本案至今的全部讨论把它们打成了一个包：

| 层 | 内容 | 今天在哪 | 是不是重复 | 该不该单点 |
|---|---|---|---|---|
| **L1 · 提取** | `error → code token`，含「无码」这一情形 | **已经单点了** —— `parseContextV2ErrorCode`（`context_v2_bridge.js:57,77-82`） | **是** —— 6 个站点 4 种纪律，**其中 2 个根本不调解析器**（E-0053/E-0054） | **该，且已经是** —— 缺的不是模块，是 **强制** |
| **L2 · 分类** | `code → 传输/启用类别`（bridge 缺席 / sidecar 未起 / 未启用 / 降级 / 未找到 / 参数非法 / **未知**） | **无人** | **是**，且这一层是 **纯函数、与调用语境无关** | **该单点** |
| **L3 · 呈现语义** | `(类别 × 调用语境) → 用户可见状态词` | 各消费者各自持有 | **不是重复** —— 三个面答三个不同问题，词汇各自合法 | **不该单点** |

**这个三分同时满足两位 owner 的主张，并解释了它们为何看起来对立而实际正交：**

- **`code-owner-chat-bubble` 的 B2 口径 `(error) → {code, kind, parsed}` 正是 L1 + L2，且明确止于 L2。** 它同时说明白了「不接的是什么」：任何 **同时** 决定用户可见状态词的模块（= L3）。
- **`code-owner-chat-core` 的原则性反对正是反对把 L3 单点化。** 它引用的那次事故（`context_v2_turn_mutation.js:437-444` 注释）**是一次 L3 折平事故**：把 V1 mirror 腿的码喂进 turn-mutation 的 L3 表，会让用户被告知「对话变了」而对话根本没变。**它蓄意维持两张表，维持的是 L3 的分层，不是 L1/L2 的分裂。**
- **`code-owner-settings` 的「四态判定」措辞横跨 L1~L3 未作区分。** 这就是处方错层的确切形式：它把 **一个该单点的东西（L1/L2）** 与 **一个不该单点的东西（L3）** 打成了一个包，于是任何人接这个包都要么接过头、要么不敢接。

**故我的判定**：**该收敛的是 L1 与 L2；L3 不该收敛。「统一四态判定」若按字面落地会连 L3 一起收 —— 那一部分不成立**（正文七 ①）。

**两条正交的约束都必须进落点的验收标准，缺一不可**：`code-owner-shared-arteries` 的 A4（未知落第三态，永不落「空」或「就绪」）管的是 **L2 的兜底纪律**；`code-owner-chat-core` 的 6.3（同一个码在不同调用语境里是不同的事）管的是 **L2/L3 的边界**。**两者不冲突，`code-owner-chat-core` 自己也是这么说的，我确认这个判断成立。**

#### 3.2 `code-owner-chat-bubble` 对第三份拷贝的更正成立，且推论比它自己说的更强

它报 `code-owner-settings` 对第三份的描述是错的：`memory_v2_trace_audit.js` 根本没有读平面的四态实现，它的 `status` 是流式 trace presenter 的 **另一套词汇**（`Complete/Partial/Legacy/Unavailable`，产自 `SERVICEs/runtime_events/memory_v2_trace_presenter.js:350`）的直通显示，回答的是「这一回合的 bundle 完不完整」，与 store 通不通无关；其唯一真正的 bridge 调用（`:89 readContent`）**一个码都不解析**。

**我判该更正成立。并把它的推论说完：这意味着「四份拷贝」这个计数本身是错的。**

真实分布是两件不同的事，被合并计了一个数：

- **L1/L2**：`chat-bubble` 6 个站点 4 种纪律（2 个不解析）+ `chat-core` 2 个取码点 + `memory-inspect` 的六态机（V1 口味，无「未启用」枝）—— **这一层确实是重复，且比「四份」多**
- **L3**：`journal_reload` 轴 / `pending_reviews` 5 支渲染机 / presenter 轴 / curator 轴 / turn-mutation 两张表 —— **这一层不是重复，是不同问题的不同答案**

**错误的度量直接产出了错误的处方**：数出「四份四态机」→ 处方是「统一成一份四态机」→ 落地会同时收 L1/L2（对）和 L3（错）。**数对了则处方自动正确**：L1/L2 六个站点四种纪律 → 收敛；L3 若干套合法词汇 → 保留。

**这一条我认为是本案最该被 `chief-judge` 看到的一句，因为它是唯一一处「所有人都同意有问题、但对问题是什么的描述是错的」。**

#### 3.3 L2 的类别集合不能由 renderer 定义 —— 一条只有从架构位置看得见的约束

L2 的输入是 **产端的码词汇表**：sidecar 侧 42 个（`code-owner-shared-arteries` E-0037 实测）+ 主进程自造 5 个，**而且还在长**。

**boot 先例给了本仓唯一一条已被验证的解法，我实测它今天仍然完整（E-I2）：**

```
产端：electron/main/services/boot_readiness/service.js:113   const FAILURE_CODES = Object.freeze([...])
                                                      :339   导出
消费端：src/SERVICEs/boot_locale_parity.test.js:44-45
        const { FAILURE_CODES } = require("../../electron/main/services/boot_readiness/service");
        :47   const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];       ← 显式的第四类
```

其注释逐字给了为什么必须 `require` 而不是转写：*「Read the emittable codes STRAIGHT FROM MAIN rather than transcribing them: a hand-copied list silently stops covering a code the day someone adds one.」*

**据此我对 `code-owner-shared-arteries` 的 P1 作判定**：**成立，且是必要条件 —— 但不充分。** P1 说「判据（码词汇表）的权威留在产端」，这是三条里的第一条；它没有覆盖另外两条：**产端须有一个测试断言「每一个可发出的码都在枚举里」**，**消费端须 import 而非转写**。**缺这两条，枚举会在下一个新码上静默失配** —— 而这恰恰是 `code-owner-shared-arteries` 自己的 D-F3 与 `code-owner-chat-bubble` 的 FB6 **各自独立担心的同一件事**：两人都在问「码字符集会不会变」「线格式会不会变」，而两人都只能 **请对方承诺**，没有机制。**boot 先例把「承诺」换成了「测试」，这是它与本案全部现状的唯一实质差别。**

前案 C-ARCH-2 的三条 (a)(b)(c) 在本案 **未被任何证据削弱**，我原样重申为 C-A3。

---

### 四 · 丁 —— `context_v2_store_disabled` 零命中对可行性的意义

**我独立复核（E-I6）**：`grep -rn "context_v2_store_disabled" src --include="*.js"` → **0**。与 E-0048（`code-owner-chat-core`）、E-0053（`code-owner-chat-bubble`）三方同向。

三条意义，按分量排序：

**(1) 它不是一条缺口，它是一个测量结果 —— 而且是本案唯一一个可证伪的结构度量。**

`code-owner-chat-core` 给的形式是：**「同一个权威码在几份拷贝里被正确处理」，今天 0/5。** 我判 **该度量成立且应当被写进裁定文本**（请求 4）。理由是方法论的：D7 从前案至今一直是 **定性论证**（「它没有 owner」「四个人各自索要它」），而定性论证 **无法被证伪，也无法被验收**。0/5 是一个数，下一次测量可以推翻它。**给一个结构性缺口配一个可测量的指标，是把它从辩论移进工程的唯一办法** —— 这也是我在前案给 C-ARCH-2 配三条 import 强制的同一个动机。

**(2) 它把「默认态显示未启用」从一句设计描述变成本案唯一一处「零改动」明确不成立的地方。**

`code-owner-runtime` 的可证伪条件 1 与 `code-owner-electron` 的 FE1 都要求议案显式接受「默认态只能显示未启用」。**但要显示「未启用」，链路上唯一的权威信号就是这个码，而 renderer 里没有一行看它。** 所以「默认态显示未启用」今天不是「少写一个 else 分支」，是 **这条信息从未被 renderer 消费过一次**。

**二选一，且必须选**（C-A1）：消费该码（做 L1/L2 的活），或消费 `memoryV2`（放行 + 投影的活）。**两条都不是零。** 议案若不选，实施时会以「就近取一个」的形式落地，而实证已经给出了「就近取一个」的两个结果 —— 而它们方向相反。

**(3) 它给 D7「没有 owner」提供了本案最干净的实证，比任何计数都干净。**

同一个码、同一条链路、两个 owner：
- `code-owner-chat-bubble` 端：渲染成红色 `role="alert"` 报错块 —— **未启用被归一成失败**
- `code-owner-chat-core` 端：落 `:434` 兜底 FAILED「请重试」 —— **对一个重试永远不会改变的条件说请重试**

而 `code-owner-settings` 的 C1 警告的是 **相反方向**（失败被归一成空）。**三个 owner、三个方向、同一个成因。** 有 owner 的东西不会长成这样。

**一条限定，我如实标注**：`code-owner-chat-core` 自陈该码在其调用路径上「今天大概率不可达」（store off 时 `memory_v2_requested` 也不会打开），并标为推断。**我不采信该推断，也不否定它 —— 它不影响本节结论**：本节的结论建立在「renderer 无一处消费该码」这个 **已复核三次的负向事实** 上，与该码在某一条特定路径上是否可达无关。

---

### 五 · 戊 —— 跨仓归一的落位，与本案的单向门清单

#### 5.1 我自己的取证：两侧的分歧比 E-0014 描述的窄，也比它描述的多一个字段

我逐字读了两侧的 entry 构造与 `get_tree`（E-I3），得到三条 E-0014 没有说的：

**(a) 共有字段有 13 个，且包含全部树结构字段。** `entry_id` · `space_id` · `path` · `parent_path` · `name` · `kind` · `description` · `mime_type` · `revision` · `space_revision` · `source_event_id` · `ref` · `replayed` —— 两侧逐字相同，`ref` 连拼装格式都相同（`pupu://memory/{space_id}/{entry_id}@{revision}`）。**建一棵树需要的 `path` / `parent_path` / `name` 完全同形。**

**(b) E-0014 漏记了一个字段。** `pupu_legacy` 的 `list_entries`（`memory_v2_store.py:7396-7400`）在 `_entry_response` 之外 **另加** `response["deleted"] = row["deleted_at_ms"] is not None`；`unchain` 侧 `_route_entry` **无此字段**。**它对 tree view 是语义承重的**（要不要显示墓碑条目、条目消失时是删除还是不可见）。请提出方补正（请求 6）。

**(c) 树装配算法两侧字面等价，且两侧都含一个静默的孤儿升根。**
```python
parent = nodes.get(item["parent_path"])
if parent is None: roots.append(node)      # 两侧完全相同
```
**净效果**：若某条目的 `parent_path` 在本次返回的条目集里找不到对应条目，它 **静默升为根**，没有任何信号。**条目数不丢（每个条目都进树），但树的形状可以退化成扁平列表，且退化不可观测。**

**而两侧对 `parent_path` 的来源不同**：`pupu_legacy` 是一个 **存储列**；`unchain` 侧是 **计算出来的**（`entry.path.rsplit("/", 1)[0] or "/"`）。**这使得「树是不是树」在两侧依赖于不同的不变量** —— 而这正是 E-0014 完整性限制 (3) 那条被提交方自标「纯推断、勿采信」的外推所指的事。

**我对该推断补了一步取证，并明确它只到一半（E-I5）**：`unchain:src/unchain/memory/workspace/service.py:367,381` 有 `create_folder` 且产 `MemoryEntryKind.FOLDER`；PuPu 侧 `memory_v2_toolkit.py:364,372` 认 `folder` 这个 public_kind。**故「两端都支持 folder」成立。** 但 **「实际会不会产生 folder 条目」我没核到** —— 我另发现 `pupu_legacy` 在写入时 **强制父 folder 存在**（`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"`），**而我在 `unchain:.../workspace/service.py` 未找到等价强制（我只读了那一个文件）**。**这是一个问题不是主张，归 `code-owner-unchain`（第 5 批）。**

**这条为什么进可行性而不是进设计**：若活路径不产生 folder 条目，`nodes.get(parent_path)` 恒为 `None`，`get_tree` 退化为扁平列表，**「tree view」就没有树可显示**。这不是「树长得不好看」，是 **议案的核心对象不存在**。它是 C-A7 里 (a) 那一项，也是本案唯一一条能把议案本身证伪的观察。

#### 5.2 归一层放哪一层 —— 我的表态

**今天不放任何一层，因为今天没有两套活形状需要归一。**

理由是机械的，且 `code-owner-electron` 已经证成：`PUPU_CONTEXT_V2_STORE_OWNER` 在任何由 Electron 启动的 sidecar 里只可能是 `off` 或 `unchain`（无条件覆写在 `process.env` 展开之后、单一 spawn 点、无 attach 分支、`Object.freeze` 的配置、且被 `.cjs` 测试逐字断言 —— S-0010 甲 (1)~(5)）。**`pupu_legacy` 的 `_entry_response` 在产品里结构性不可达。**

**为一个不可达的形状建归一层是 speculative generality，而且它在本案有具体代价**：`code-owner-runtime` 自己已经指出，服务端做双 owner 归一 **会改动 `chat-bubble` 三个既有消费者已在依赖的响应形状**（其条件性影响 2，「破坏面非零，不是只加不减」）。**为统一一个死形状去破坏一个活消费面，是净负。**

**故我判 `code-owner-runtime` 的建议 2（选定 `unchain` 为契约基准）成立，但要求把措辞改一格**：

> 不是「选一个基准然后归一」，是 **「承认只有一个活的形状，并把另一个显式标记为不可达」**。

差别落在验收上，不落在措辞上：前者会产出一个归一层（新构件、新 owner、新单向门）；后者产出的只有 **一条约束**（不得对 `memory_v2_store.py::get_tree` 断言）与 **一次词汇表 owner 指认**（`kind` 的权威是 `unchain:MemoryEntryKind`）。

**若将来 owner 并存或切回（前案 R1 与我前案单向门清单第 4 项的情形），归一的正确落点是 sidecar，即 `memory_v2_unchain_read_adapter.py` 与 `memory_v2_store.py` 对齐字段集与 `kind` 词汇。三条理由：**

1. **`kind` 词汇表的权威是一个跨仓 enum**（`unchain:src/unchain/memory/workspace/models.py:251-255`，我复核为 `FOLDER/MARKDOWN/IMAGE/LINK`）。**归一必须发生在能 `import` 该 enum 的最近一层 —— 那是 sidecar。** 在 renderer 归一等于把一个跨仓 enum 手抄进 JS，而 boot 先例的注释逐字反对这种手抄（「a hand-copied list silently stops covering a code the day someone adds one」）。**同一条理由，同一份注释，第二次适用。**
2. **electron main 与 renderer facade 都以「不碰载荷」为成文契约**：`getContextV2Tree` 原样透传、本层不解析不投影不封顶（S-0010 戊 (5) 第 7 行）；facade 的 A1 明令不做载荷归一，且被其自己的测试守护。**在任一层加归一，是破坏一条已被测试守护的不变量，去换一个在更下游可以免费得到的东西。**
3. **归一在 sidecar 侧对既有消费者是向后兼容的加法**（补字段、映射值）；**在 renderer 侧是每个消费者各做一遍** —— 那正是 D7 本身。

#### 5.3 本案单向门清单

每条标 **单向门 / 半单向门 / 可逆**。依 charter，本领域对不可逆与高风险项负主动指出义务，无人问也要说。

| # | 项 | 判定 | 理由 |
|---|---|---|---|
| 1 | **把 `getMisoStatusPayload().memoryV2` 升为产品状态契约** | **单向门** | 15 字段含 4 个 sha256 与 `platformActiveBlocked`，今天是诊断面。renderer 组件一旦读它，字段集即成对外承诺；收窄需同时改 main + normalizer + 全部消费者。**放行前必须先定投影**，`code-owner-electron` 认领的契约测试是必要不充分（正文一 1.3(b)） |
| 2 | **`normalizeUnchainStatus` 放行 `memoryV2`（不加投影）** | **半单向门** | 约 6 行可回退、且今天只有一个既有消费者（`chat.js:578`，E-I1）；但「renderer 见过诊断字段」不可撤，且它改变了 `api.shared` 一条既有的 allowlist 纪律的适用范围 |
| 3 | **选定 `unchain` 为唯一活形状 / 把 `pupu_legacy` 标记为不可达** | **可逆** | 是一条约束与一次验收对象指认，不产生代码，不改任何契约面 |
| 4 | **在 sidecar 侧做双 owner 字段归一** | **单向门（跨仓）** | 触碰 `MemoryEntryKind` 即跨仓契约变更（前案 R4：`SQLiteContextV2StoreReadStatus` 是 `frozen=True, slots=True` 单一构造点，`unchain-core.lock.json` revision 须同步推进）；且会改动三个活消费者依赖的形状 |
| 5 | **在 renderer 做 `kind` 词汇归一（手抄跨仓 enum）** | **单向门（应避免）** | 手抄的 enum 在下一个新 kind 上静默失配，无失败信号。boot 先例的注释即为其明文反例 |
| 6 | **共享判定模块的口径含 L3（用户可见状态词）** | **单向门** | 三个面的词汇一旦被压成一套，`code-owner-chat-bubble` 已在册的三轴碰撞（`Complete/Partial/Unavailable` 三条轴共用同三个词指三件事）**从缺陷变成强制**；回退需重新分裂词汇 + 改全部文案 + 改 11 个 locale 的键结构 |
| 7 | **`memory-inspect/**` 成为共享判定的导出点** | **单向门** | 前案不成立项 ① 同理：产品面组件目录变成事实公共依赖，且会 **从外部** 压破 C8（`code-owner-settings` 自己拦不住它） |
| 8 | **在 side-menu 挂载接口上追加第三个位置参数（而非改对象参数）** | **单向门** | 两个待送的值都是合法 chat id 形状的字符串，JS 位置错位静默。**今天破坏面为零（E-0042/E-0049）是一个会过期的窗口** —— 第二个调用点出现即失效 |
| 9 | **给 `contextV2Bridge.getStatus()` 加任何字段或参数** | **单向门** | `code-owner-electron` 预先反对 + `code-owner-settings` N3 + `code-owner-shared-arteries` A2 三方同向；且推翻 S-0003 对 `expert-security` 的不传唤判定 |
| 10 | **`ownerChatId` 改成跟随活动会话（而非打开时快照）** | **单向门** | E-0045 已证右键 ≠ 活动会话，错主在链路上 **结构性不可检测**（三道防线全部放行且全部没做错）。一旦成为默认行为，**没有任何一层能事后发现它** |
| 11 | **store owner 切换本身** | **单向门，继承前案不改判** | 前案 R1 / 我前案单向门清单第 4 项。本案凡以「今天的 store owner 行为」为据的结论，切换当天全部需重核 |

**主动指出（charter 义务，无人问）**：第 8 条与第 10 条是本清单里 **唯二「实施时最省事的做法恰好是错的，且错了没有任何信号」** 的两条。第 1 条与第 6 条是 **唯二「做错了要付双向成本（改行为 + 改用户面）」** 的两条。四条我建议都写进裁定文本而不是留给方案庭审自行解释 —— 与 `code-owner-chat-core` 建议 2 同向。

---

### 六 · 己 —— 在这个证据条件下，「可行」能有多硬

#### 6.1 五份审查同时收窄不是五次疏忽，是一个可预测的结构后果

`speaker-of-the-house` 在 S-0016 第二节已经指出这个模式并给了正确的归因方向（G8 = 取证条件）。**我把它的成因说完整，因为它决定了处方：**

> 当 **唯一可跑的路径** 与 **产品实际走的路径** 不相交时，每个人的取证都会自动变成「在可跑的路径上取一个真结果，再把结论说到待裁问题所需要的宽度」。**需要的宽度由问题定义，可跑的宽度由环境定义。** 两者不相交时，**没有任何个人的取证纪律能弥合这个差**。

**这不是取证纪律问题，是取证可达性问题。** 五份审查全部确认真实性、全部判定「引用范围宽于证明范围」，是同一个结构在五个人身上各显形一次。**唯一的处方是把那条路径跑起来** —— 这就是 C-A7，也是 `code-owner-chat-bubble` 建议 4 的方向，我判其成立并加强。

#### 6.2 但空洞的杀伤力是不均匀的，而不均匀是可判定的

我按 **「结论是否依赖 store owner 取值」** 把本案全部可行性结论三分。这个划分是机械的，任何人可复核：

**第一类 · 不依赖（G8 零杀伤，最硬）**
- `code-owner-chat-core` 的 **全部** 结论（值传递与作用域；其不确定性二明确声明在三种 owner 下完全相同）
- `code-owner-chat-bubble` 的 `ownerChatId` 链路（单一 provider、单一挂载、空值 fail-closed，被测试锁住）
- `code-owner-shared-arteries` 的 facade 形状、18 方法锁、不吞码、同步抛转拒绝
- `code-owner-electron` 的 channel/handler/preload 全段存在性与注入顺序
- `memory-inspect/` 的落位空间（我实测，E-I6）

**第二类 · 依赖但已被独立交叉验证（较硬）**
- `store_owner` 取值域二元：`code-owner-electron` 逐行 + `.cjs` 测试断言 + `code-owner-runtime` 静态，**三方同向**
- `off` 态 503 `context_v2_store_disabled`：`code-owner-runtime` 实跑 + `evidence-examiner` 复跑 + `code-owner-electron` 独立静态追出，**三次独立同向**
- `normalizeUnchainStatus` 丢弃 `memoryV2`：`code-owner-electron` + `code-owner-chat-bubble` + **我**（E-I1），**三次独立同向**

**第三类 · 完全落在空洞里（软 —— 而它恰好是议案的核心对象）**
- `unchain` owner 下 `get_tree` 实际返回什么：字段集（E-0014，静态）· `kind` 词汇（静态）· **有没有 folder 条目**（提交方自标纯推断，我补到「两端都支持」为止，E-I5）· 错误是否带 `[code] ` 前缀（`code-owner-chat-bubble` FB6 / `code-owner-shared-arteries` D-F3，两人都只能请对方承诺）· **10,000 条上限的失败模式**（我今天新取，E-I4，静态）

#### 6.3 直接回答本庭：一个「可行」判断能有多硬

> **议案问的「新增一个 tree view 在技术上能不能做」，其答案落在第一类与第二类里 —— 这个问题可以被硬地回答，答案是能。**
>
> **议案默认的「这个 tree view 显示出来的是一棵树」，其答案完全落在第三类里 —— 这个问题本案的证据结构上无法回答。**
>
> **二者被议案的措辞合并了。本案能给出的最强结论是「管线形状可行」，不是「tree view 可行」。**

请本庭把这条区分写进 `SUMMARY`（请求 1）。**不写，裁定会看起来比证据更硬**；而本案已经有过一次同类错误的三重发作（本庭的 E-0006 锚在不执行的代码上 · `code-owner-runtime` 的 Q4 跑在不执行的代码上 · `code-owner-chat-bubble` 的三个消费者测试建在生产不产出的载荷形状上）。**第四次不必再发生。**

#### 6.4 关闭它的实验很便宜，而且它是本案剩下的唯一一次决定性实验

`code-owner-chat-bubble` 建议 4 已提出方向。**我把它收窄成三个具体问题，因为「跑一次 `getTree`」这个说法太宽，跑完可能还是不知道**：

| # | 观察什么 | 它决定什么 | 谁能做 |
|---|---|---|---|
| **(a)** | 返回的条目里 **有没有 `kind == "folder"`** | **议案的核心对象是否存在** —— 无 folder 则 `get_tree` 退化为扁平列表，「tree view」无树可显 | `code-owner-unchain`（第 5 批） |
| **(b)** | 一次 reject 的 **`error.message` 原文** | `[code] ` 线格式与 `[a-z0-9_]` 字符集是否成立 —— 关掉 `code-owner-shared-arteries` D-F3 与 `code-owner-chat-bubble` FB6 两条 | 任何能 `import unchain` 的环境 |
| **(c)** | `entries` 非空时的 **字段集实测** | 关掉 E-0014 的「推断」标记，含我新报的 `deleted` 字段 | 同上 |

**三项都不需要改任何产品代码，都是只读观察。** (a) 是唯一一条能把议案本身证伪的。**这是本案剩下的、最便宜也最决定性的一次实验**，我与 `code-owner-chat-bubble` 同向，并把它列为 C-A7 —— **我唯一一条要求在方案庭审前闭合的取证条件**。

**为什么它只阻塞方案庭审而不阻塞本阶段闭庭**：验收标准必然要对树的形状作断言，而树的形状恰好是未观察的那一项。**议案庭审判「能不能做」不需要它；方案庭审定「怎么验收」离不开它。**

---

### 七 · 「不成立」汇总（请录入 `chief-judge` 强制回应清单，每项的限定半句请照录）

| # | 不成立的对象 | 内容 | 依据 | 若被推翻会怎样 |
|---|---|---|---|---|
| **①** | **「统一四态判定」作为单一处方** | 「把四份四态机收敛成一份」**不成立** —— 它同时收 L1/L2（该收）与 L3（不该收）。**我不否定需要一个共享判定，那是对的；我只否定这个口径。** 正确口径止于 L2（`code-owner-chat-bubble` B2），L3 保留分层（`code-owner-chat-core` 6.3）。**两条正交，都必须进落点的验收标准** | 正文三；E-0047, E-0053, E-0054, S-0017 6.3, S-0018 §3.2 | 产出一个折平的映射：`code-owner-chat-core` 那次「告诉用户对话变了而对话没变」的事故会被从缺陷变成强制，且 `code-owner-chat-bubble` 与 `code-owner-chat-core` 两方均已声明届时 `OBJECTION` 并拒绝消费 —— 落点定了而没人接 |
| **②** | **「四份/五份拷贝」这个计数** | 该计数 **不成立**，因为它把 L1/L2 的真重复与 L3 的假重复合并了。**我不否定重复存在 —— 它比四份多；我否定的是这个数所支持的处方。** `code-owner-chat-bubble` 已实证第三份根本不是同类物 | S-0018 §3.1/§3.2；正文三 3.2 | 错误的度量继续产出错误的处方；且 D7 的进展无法被验收（因为验收会去数「还剩几份」，而那个数从一开始就是错的） |
| **③** | **`code-owner-electron` 重述的隐含量级结论** | 「问题量级从『建构件』降为『认领契约 + 放行一个字段』」**部分不成立**。**我确认其事实半边全部成立**（`memoryV2` 已过 IPC 线、`normalizeUnchainStatus` 丢弃它、放行约 6 行且只有一个既有消费者 —— 我第三次独立复核）。**我只否定量级结论**：(i) `memoryV2` 是进程全局，答不了本案每一个消费者都在问的 per-owner 问题，**故它不能是那个单一状态源**；(ii) 「认领契约」是把一个 15 字段诊断面升为产品面，是类型变更与一次投影决策，**是单向门**；(iii) 「被 normalizer 丢掉」与「normalizer 正在履行契约」是同一件事，放行需要另一个 owner 同意，而那个 owner 已把此事列为自己的前置（P3） | E-I1；S-0010 乙；S-0011 P3；S-0018 §4.2(2) | 「放行一个字段」被当作 D7 的解，实施后得到的是第 6 个信号源而不是第 1 个；且 `code-owner-shared-arteries` 的 P3 未闭合 → 其不认领 → 落点重新悬空 |
| **④** | **`code-owner-shared-arteries` 提的模块落点** | 「共享判定模块落 `src/SERVICEs/bridges/context_v2_state.js`」**不成立**（落错一格）。**我不否定它认领，也不否定它是最合适的 owner 之一；我只否定这个目录。** `bridges/` 的定义性属性是「不校验、不持状态、不加任何自己的东西」，且该属性由其自己的测试守护。**落 `src/SERVICEs/context_v2_state.js`，与 `boot_readiness.js` 同级** | E-I2；S-0011 A1/5.2(1) | 一个持规则的模块进了「不持规则」的目录，A1 从一条可执行契约退化成一句口号；下一个人会以同样理由把校验也写进 `bridges/` |
| **⑤** | **「零改动分布 ⇒ 本案便宜」这个推论** | 分布 **可信**（我给出其机械成因：facade 的 18/18 全有或全无探针）。**我不否定任何一份「0 处必须改动」的报告 —— 它们各自都对。** 我否定的是由它们的合取推出的便宜结论：五份「零改动」全部附条件且条件不相交，其总和不是零，**缺的那一块恰好就是无主构件 —— 没有 owner 的工作在每个人的边界统计里都是零** | 正文二 2.2；S-0004 条件性影响 2 · S-0010 FE5/FE7 · S-0011 5.2(2) · S-0018 FB5 · S-0017 受影响对象 | 本案被当作便宜项推进，实施时在 `memory-inspect/` 里长出第 5 份 L1/L2 拷贝，且它会跑、会通过验收、不会被任何人拦下 —— `code-owner-settings` 自己已经预告了这一点 |

**另重申一项前案的「不成立」，因为它在本案有新的触发面**：`memory-inspect/**` 不得成为共享判定的导出点（前案不成立项 ①，`0000-0003-2026-0807#S-0024` 强制回应 ①）。前案的触发面是 `code-owner-devtools` 的 D-2；**本案的新触发面是：tree view 落进 `memory-inspect/` 之后，那个目录就成了 `src/COMPONENTs/**` 下第一个 V2 浏览面，「判定就近放这里」的引力会显著增大。** 落点不变、理由不变，只是需要被再说一次。

---

### 八 · 与工程铁律的相容性声明

本发言全部意见与 `/Users/red/Desktop/GITRepo/PuPu/.claude/CLAUDE.md` 的工程铁律 **无冲突**，三处需显式说明：

1. **「不新建 context provider」** —— C-A5 建议的模块是 **模块级 store + `subscribe()` / `getState()`**，与 `src/SERVICEs/boot_readiness.js:180-206` 同形（我复核：`export const subscribe` / `export const getState` / `export default { start, retry, subscribe, getState }`），**不是 provider**。`ConfigContext` 无需扩展。**这一条同时回答了 `code-owner-chat-core` K1（不得扩大 `use_chat_stream.js`）与 K5（不得在 side-menu 侧新增 V2 调用）—— 一个模块级 store 两条都不触碰。**
2. **「渲染进程绝不碰 `ipcRenderer`」** —— 本发言全部方案经既有 `src/SERVICEs/bridges/context_v2_bridge.js` 与 `window.unchainAPI` 读，**不新增任何直连**。特别地，我 **不支持** 任何「在组件里直接摸 `window.unchainAPI` 绕过 facade」的做法（`code-owner-chat-bubble` §4.2(2) 已就此拒绝，我同意其判断）。
3. **「Electron 测试有 `.js`/`.cjs` 双胞胎，必须同步」** —— 我注意到 `evidence-examiner`（S-0015 经 S-0016 三(1) 归档）实测这四个 `.js` 是 **一行委托 shim 且不被任何已配置的 runner 收集**。**这不改变本案任何结论**（锁力真实存在，只是全部来自单一 `.cjs`），但它意味着 **「被双胞胎锁住」这句话在本案里表达的保险强度低于铁律的字面预设**。我只登记，处置不在本案范围。

---

## 九 · 本 `ASSESSMENT` 新提交的证据（本地临时编号，请本庭重编）

统一 revision：**PuPu `b2385d5d`（branch `dev`）· unchain `a4e69f4`（branch `dev`）**，与 E-0001 一致。作业开始时我复测：`git status --porcelain src electron unchain_runtime` **输出 0 行**，故 E-0001 的承重部分（产品代码锚点与 HEAD 一致）**在我作业时点仍然成立**（与 E-0033、S-0017 九的复测结论一致）。**全部只读，未改任何文件、未 commit、未起 sidecar、未起 Electron、未跑应用、未跑任何测试套件。依 A-012 未派生任何子 instance。**

---

### E-I1 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`）· `:390`（导出）· `pupu:src/SERVICEs/api.unchain.js:870-885`（`getStatus` 无条件调用它）· `pupu:src/PAGEs/chat/chat.js:578`
- **取得方式**: `grep -n "normalizeUnchainStatus" -A 20 src/SERVICEs/api.shared.js`；`sed -n '868,886p' src/SERVICEs/api.unchain.js`；`grep -rn "\.getStatus(" src --include="*.js" | grep -v test`
- **支持/反驳**: **支持** `code-owner-electron` 乙 (1) 与 `code-owner-chat-bubble` E-0055 的同一事实（**第三次独立同向**）；**同时收窄** 其量级结论 —— 见正文一 1.3
- **净内容**: `normalizeUnchainStatus` **重建**（非投影）6 个键 `{status, ready, url, reason, pid, port}`，`memoryV2` 与 `contract` 二者均不在其中。`api.unchain.getStatus()` 在 4s 超时后 **无条件** 对返回值调用它。**`api.unchain.getStatus()` 在 `src/` 的产品消费者只有一个**：`chat.js:578`（另三处 `.getStatus(` 命中分属 `api.ollama` 与 `ollamaBridge`，与本案无关）
- **完整性限制**: 静态阅读，未运行。**未核实** 是否存在经 `window.unchainAPI.getStatus()` 直连的第三方消费者 —— `code-owner-chat-bubble` 已就其边界作过该核实（E-0055，`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` import 数为 0），**我未对 `src/COMPONENTs/**` 全域复核**
- **证据类型判据**: 仓内文件字面内容与行号，同 revision 可直接复核 → 自证类
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查

### E-I2 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/boot_readiness.js:1-22`（文件头）· `:62-74`（模块级 listeners）· `:180-186`（`subscribe` / `getState`）· `:205-206`（默认导出）· `pupu:src/SERVICEs/bridges/boot_readiness_bridge.js`（哑 bridge，与判定模块分居两目录）· `pupu:electron/main/services/boot_readiness/service.js:113`（`const FAILURE_CODES = Object.freeze([`）· `:339`（导出）· `pupu:src/SERVICEs/boot_locale_parity.test.js:44-45`（`require("../../electron/main/services/boot_readiness/service")`）· `:47`（`[...FAILURE_CODES, "unknown"]`）
- **取得方式**: `ls -la` 三处；`sed -n '1,30p' src/SERVICEs/boot_readiness.js`；`grep -n "subscribe|getState|listeners|export"`；`grep -rn "FAILURE_CODES" electron/main/services/boot_readiness/service.js`；`grep -n "FAILURE_CODES|require(" src/SERVICEs/boot_locale_parity.test.js`
- **支持/反驳**: **支持** C-A3 与 C-A5；**是前案 E-0090 在当前 revision（`b2385d5d`）上的重测**，四条结构属性与两道守卫 **全部仍然成立**，无一失效
- **净内容**: (1) 判定模块在 `src/SERVICEs/`，哑 bridge 在 `src/SERVICEs/bridges/` —— **两目录分居是既有事实，不是我的提议**；(2) 模块是 **模块级 store + `subscribe()` / `getState()`**，非 context provider；(3) 产端枚举 `Object.freeze`；(4) 消费端测试 **`require` 产端模块取枚举，不转写**；(5) 消费端显式补一个 `"unknown"` 第四类
- **完整性限制**: 我 **未跑** `boot_locale_parity.test.js`，也未跑 `boot_readiness_service.test.cjs`。**「两道守卫今天仍绿」我未验证** —— 我只验证了「两道守卫的代码仍在且形状未变」。前案 E-0090 的同一限制（不主张 boot 运行无缺陷）继续适用
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查

### E-I3 | repository | 自证类
- **来源定位**: `pupu:unchain_runtime/server/memory_v2_store.py:6641-6669`（`_entry_response`）· `:7396-7400`（`list_entries` 追加 `deleted`）· `:7408-7434`（`get_tree`）· `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:411-452`（`list_entries` / `get_tree`）· `:532-567`（`_route_entry`）
- **取得方式**: 两侧五段全文定点读取并逐字段人工比对
- **支持/反驳**: **支持** E-0014 的主结论（两侧字段集与 `kind` 词汇表不同）；**补正** E-0014 一处遗漏；**新增** 两条 E-0014 未记的结构事实
- **净内容**:
  - **共有 13 字段，含全部树结构字段**：`entry_id` · `space_id` · `path` · `parent_path` · `name` · `kind` · `description` · `mime_type` · `revision` · `space_revision` · `source_event_id` · `ref` · `replayed`。`ref` 两侧拼装格式亦逐字相同
  - **E-0014 漏记的字段**：`pupu_legacy` 的 `list_entries` 在 `_entry_response` 之外追加 `response["deleted"] = row["deleted_at_ms"] is not None`（`:7396-7400`）；`unchain` 侧 `_route_entry` **无此字段**
  - **树装配两侧字面等价，且含静默孤儿升根**：`parent = nodes.get(item["parent_path"])` → `if parent is None: roots.append(node)`。**条目数不丢，树的形状可退化为扁平，退化无信号**
  - **`parent_path` 两侧来源不同**：`pupu_legacy` 是存储列（`row["parent_path"]`）；`unchain` 是计算值（`entry.path.rsplit("/", 1)[0] or "/"`）
- **完整性限制**: **纯静态比对，未在 `store_owner=unchain` 下实跑**（G8，与 E-0014 同一限制）。「运行时字段确实如此」是推断不是观察。**我未读 `unchain` 侧 `memory_tree` / `memory_list` 的实现**，只读到 PuPu 侧适配器对它们的调用
- **证据类型判据**: 两仓内文件的字面内容与行号 → 自证类
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查

### E-I4 | repository | 自证类
- **来源定位**: `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:48`（`_MAX_LIFECYCLES = 10_000`）· `:365`（`while len(entries) < _MAX_LIFECYCLES`）· `:387-389`（超限出口）· `:598,604`（同一常量的第二个用途）
- **取得方式**: `grep -n "_MAX_LIFECYCLES"`；`sed -n '355,400p'` 定点读取
- **支持/反驳**: **新增一条本案至今无人提及的事实**；与 `code-owner-electron` E-0032（「`getTree` 是十八个读方法里唯一无 limit/page 参数的一个，本层不设上界」）**不矛盾** —— 两句话在两个不同的层
- **关键原文**:
  ```python
  while len(entries) < _MAX_LIFECYCLES:
      ...
  raise PupuUnchainMemoryV2ReadError("workspace listing exceeds the P0 route limit")
  ```
- **净内容**: **活读路径（`store_owner=unchain`）对 workspace 条目有 10,000 条硬上限，且超限时抛错而非截断。** 净效果：**tree view 的载荷上界由 sidecar 单方面决定，且到达上界时用户看到的是一个错误，不是一棵部分树。** 分页本身是 200/页的游标循环，另有一道「游标不前进即抛」的守卫（`:381-384`）
- **完整性限制**: **静态阅读，未实跑**（G8）。本机 `entries=0`（G2），**该上限的行为在任何条件下都未被观察过**。我 **未核实** `pupu_legacy` 侧是否有对应上限
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查

### E-I5 | repository | 自证类（**含一处明确标注为「未核实、非主张」的内容**）
- **来源定位**: `unchain:src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `unchain:src/unchain/memory/workspace/service.py:367`（`def create_folder`）· `:381`（`kind=MemoryEntryKind.FOLDER`）· `:154-186`（listing 的 parent 计算）· `pupu:unchain_runtime/server/memory_v2_toolkit.py:364,372-375`（public_kind 白名单含 `folder`）· `pupu:unchain_runtime/server/memory_v2_store.py:845`（`CHECK(kind IN ('folder','file','link'))`）· `:6724`（写时父 folder 强制）
- **取得方式**: `grep -rn "MemoryEntryKind.FOLDER|\"folder\"" unchain/src/unchain/memory/workspace/*.py`；`grep -n "def .*folder|folder" unchain/src/unchain/memory/workspace/service.py`；`grep -n "parent" 同文件`；PuPu 侧对应 grep
- **支持/反驳**: **部分支持** E-0014 完整性限制 (3) 的乐观方向（`MemoryEntryKind` 有 `FOLDER` 且有 `create_folder`，故「两端都支持 folder」成立）；**但不闭合该推断**
- **净内容**:
  - `unchain` 侧 **存在** `create_folder`，产 `MemoryEntryKind.FOLDER`；PuPu 侧 toolkit **认** `folder` 这个 public_kind
  - **`pupu_legacy` 在写入时强制父 folder 存在**：`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"` —— **这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因**
  - **`kind` 词汇表两侧的权威载体不同**：`unchain` 是一个 `StrEnum`（跨仓）；`pupu_legacy` 是一个 sqlite `CHECK` 约束
- **完整性限制（本条最重要的一段）**: **我在 `unchain:src/unchain/memory/workspace/service.py` 未找到与 `memory_v2_store.py:6724` 等价的写时父存在强制 —— 但我只读了那一个文件**，该强制可能在 repository port 或别处。**这不是一条主张，是一个问题，归 `code-owner-unchain`（第 5 批）。** 另：「两端都支持 folder」**不等于**「PuPu 的写路径实际会产生 folder 条目」，后者我完全未核实
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类。**但标注为「未核实/问题」的部分不具此地位，不得作为事实引用**
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查

### E-I6 | repository | 自证类
- **来源定位**: `pupu:src/COMPONENTs/memory-inspect/`（目录清单）· `pupu:src/` 全域负向搜索
- **取得方式**: `ls -la src/COMPONENTs/memory-inspect/`；`grep -rn "context_v2_store_disabled" src --include="*.js" | wc -l`；`git rev-parse --short HEAD`；`git status --porcelain src electron unchain_runtime | wc -l`
- **支持/反驳**: **独立复核并确认** E-0048（`code-owner-chat-core`）与 E-0053（`code-owner-chat-bubble`）—— **第三次同向**；**支持** C-A4 的落位空间判断
- **净内容**: (1) `context_v2_store_disabled` 在 `src/**` 的 `.js` 中命中数为 **0**；(2) `src/COMPONENTs/memory-inspect/` 今天只有 **两个文件**（`memory_inspect_modal.js` 30,849 字节 + `memory_inspect_modal.test.js` 2,678 字节），**无子目录、无其他组件**；(3) HEAD = `b2385d5d`，branch `dev`，三个产品目录 `git status --porcelain` 输出 **0 行**
- **完整性限制**: (1) 是一个 **负向证明**，只覆盖该字面串与 `--include="*.js"`；**未覆盖** 以字符串拼接构造该码的可能路径（我认为可能性极低，但不能排除）。(2) 只是目录清单，**我未读 `memory_inspect_modal.js` 全文**，其内部结构以 `code-owner-settings` 的 E-0015 为准
- **证据类型判据**: 可复跑命令 + 仓内目录状态 → 自证类
- **验证历史**: S-XXXX | 未验证（首次提交）| 自证类，提交方自陈的只读检查
