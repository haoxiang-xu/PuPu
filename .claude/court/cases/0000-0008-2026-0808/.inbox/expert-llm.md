#### S-XXXX | ASSESSMENT | expert-llm → case

- **阶段**: 议案庭审

- **结论**: **有条件成立。** 逐条：**甲 —— `code-owner-runtime` 的窄命题成立，由它推出的宽命题不成立。** `route_projection.py` 对三个标识符零匹配，我独立复跑确认（`grep -c` = 0），故 V1 投影的 **读端** 确实 store-owner 无感知。**但「保持现状」是关于用户所见的陈述，而用户所见由 *写端* 决定，写端 S-0004 未看。我看了：写端是 V2 感知的，且是决定性的。** V2 admission 生效时 `_resolve_memory_runtime` 返回 `kind="v2_durability"`，其运行时对象 **根本没有 `commit_messages` / `prepare_messages` 方法**（我实跑确认，E-H2），装的是 `DurabilityModule` 不是 `MemoryModule`；产生 V1 向量的那条工厂路径自己的 docstring 写着「**deliberately bypasses Qdrant and embedding resolution**」（E-H1）。**净效果：V2 生效后 V1 向量视图不再有新数据进来，且退化是静默的 —— 同样 200、空 payload，与「这个会话还没有记忆」逐字节相同。** 故准确表述是：**「保持现状」在代码行为上自动成立（不需要任何人做任何事），在内容供给上不成立（不需要任何人做任何事就会失效）。** 这不阻断议案 —— 它反而是支持议案的最强论据。**乙 —— 「该不该为 V2 造一套投影」，我的答复是：不该造。** 三点：**(a)** 那三样 **不是** 缺一不可 —— 存在严格更便宜的等价物（对已有 FTS5 语料做 TF-IDF→SVD，零新 provider、零新 env、复用 `route_projection.py` 现成的 `np.linalg.svd`）。**我主动指出这一点，因为「做不到」是个假借口，它让本庭不必在真正的问题上表态。** **(b)** 若真要造，V2 向量子系统今天 **只支持 `ollama` 一个 provider**（其余一律 `unsupported_provider`，`memory_v2_vector.py:81-87`）且 **`model` 必填无默认** —— 「开个开关」实为「给每个想看这张图的用户强加一个本地 Ollama 安装 + 一次 embedding 模型拉取」；再加 chunk 单位错配（2000/200 字符切块 vs tree 的条目单位）、RRF 权重（`:43-45`，一旦开启即 **改变召回排序**，那是行为变更不是可视化）、以及若引入云 provider 则连带出密钥、成本与隐私 —— **全部是本案范围外的检索架构决定，没有一条是「加个 view」。** **(c) 这是本庭要的那句直话：一个建立在纯词法检索之上的 V2，其「向量视图」在信息论意义上不但无意义，而且是负价值。** 一张散点图唯一的正当性是 **它展示的几何就是系统实际使用的几何**。V1 满足这条（画图用的向量就是驱动召回的向量）。V2 不满足：为画图而现算的 embedding 与 V2 的实际召回 **零因果关系**，用户会做出的自然推断（「靠得近的会被一起想起来」）是假的。**在一个价值主张就是「可信的记忆」的子系统上，展示一张关于它自己的、可信度为零的图，是在花钱制造误导。** 且 V2 **已经有一个更好的自我视图，而那正是本议案要建的东西** —— path 层级是 **作者写下的显式结构**（ground truth），投影是 **有损、随数据漂移的派生结构**。**用后者取代前者是降级。** **丙 —— 不是同一件事的两种说法。** `disabled` 是 **配置的确定性函数且为真**（`NullVectorBackend.status()` 计算得出，`memory_v2_vector.py:203`）；`degraded` 是 **字面量且在它所指称的那一点上为假**（`:489`）—— `degraded` 断言「存在一个能力且它受损」，而实测是 **根本不存在（absent）而非受损（impaired）**（E-0064 / S-0029 三臂对照 + `__init__` 无 `vector_index` 形参 → 构造上不可达其他值）。**产品路径上报 `degraded` 不准确。** 对 renderer 的含义是一条 **禁令而非构件**：该字段熵为零，任何分支都在编译期已决；且同一响应体里相邻的 `backend` 也取 `"degraded"` 而 **那一处是真算的**（`:488`）—— **同一个词在相邻两键里一真一假，读端无法凭观察分辨。** **丁 —— 不属本案范围，且不该另立 case 去做。** 可以另立的是「V2 检索是否升级为混合检索」这个 **检索架构议案**；**可视化永远不得成为制造 embedding 的理由，顺序不可颠倒。** **戊 —— 知悉：我判「不造投影」，故 `expert-architecture` 的落位结论 **无条件成立**，本案 **不因我增加待裁问题**。** **另加一条本庭未问、但 `code-owner-unchain`（S-0024 请求/乙）明确路由给我且无人能代答的**：**tree 退化为扁平列表不是「可达分支」，是我这一轴上的 *预测默认值*，且成因在我边界内** —— `memory_upsert` 的 **模型可见** 描述从未提及 `folder`，`kind` 参数 **无 enum、无 pattern、描述是自动生成的占位串 `"Argument kind"`、默认 `"markdown"`**，四个合法值 **只在报错文案里出现**（E-H4 / E-H5）。**模型压根不知道 `folder` 存在。**

- **依据**: E-0007, E-0008, E-0009, E-0011, E-0012, E-0061, E-0062, E-0064, S-0002, S-0004, S-0008, S-0024, S-0025, S-0028, S-0029, S-0030；本发言新提 E-H1, E-H2, E-H3, E-H4, E-H5；`0000-0003-2026-0807#S-0024`

- **不确定性**:

  **一 · 「有条件成立」的全部必要条件（角色输出契约硬要求，缺任一条即翻为不成立）**

  | # | 必要条件 | 若不满足会怎样 |
  |---|---|---|
  | **C1** | 议案 **显式接受**「V2 数据被选中时 vector view 无可呈现之物」，且 **不得** 在本案内以任何形式新造投影、embedding 供给或向量后端开关 | 本案性质从「加一个 view」变为「决定 V2 检索架构」，可行性须整体重判 —— 在我这一轴 **不成立** |
  | **C2** | 议案 **显式接受**「V1 vector view 的内容供给在 V2 admission 生效的会话上停止」，即「保持现状」**仅指代码行为不变，不指用户所见不变**；并接受该退化 **静默**（200 + 空 payload，与「尚无记忆」不可分辨） | 若议案要求 V1 view 在 V2 生效后仍显示新数据，则需要重新接通一条已被刻意断开的写路径 —— 那是记忆架构改动，**在我这一轴不成立** |
  | **C3** | tree view（及本案产出的任何 renderer 代码）**不得读取 `vector_status`**，不得让它进入任何状态判定，不得据它向用户陈述向量检索的健康度 | 产品路径上该字段恒为 `'degraded'` 且与真实状态无关；任何消费它的 UI 都在向用户陈述一件假事。**这是我在本案的硬红线** |
  | **C4** | 本案 **不得** 顺手改动 embedding provider、chunking 参数、召回参数或 RRF 权重；V2 向量后端 **保持关闭**（`PUPU_MEMORY_V2_VECTOR_PROVIDER` 维持零处设置） | 任一改动都会 **改变模型可见行为与召回结果**，那需要独立议案 + eval，不能作为可视化议案的副产品 |
  | **C5** | 议案 **不把「tree view 会呈现层级」当作前提**；扁平列表须被接受为 **今天的默认形状** | 若议案以「有层级」为验收前提，则本案隐含了一次 **写侧 prompt / tool schema 改动**（我的边界），那是另一个议案。**在我这一轴不成立** |

  **C1–C5 是合取，全部必须成立。** 我不接受「先做、以后再补」——C3 与 C4 一旦破，破的是模型可见行为，不是渲染细节。

  **二 · 我这一份的取证限制**

  1. **E-H2 / E-H4 是我自搭 harness 的运行时观察 → 须查类，须强制送 `evidence-examiner`。** 我已给完整可复跑命令（含 E-0059 的 bootstrap 方法，未重蹈前三人的 harness 构造缺陷）。
  2. **E-H4 我复制了 `memory_upsert` 的签名而非导入闭包**（闭包定义在需要 runtime 的工厂内）。签名逐字抄自 `memory_v2_toolkit.py:1355-1366`，但「抄得对」这一步 **未经第二方核对**。若审查人能构造出真实 toolkit 并 dump schema，其结论强于我这一条。
  3. **我未实跑一次真实 agent turn。** 「V2 生效后 V1 集合不再收到新点」是由 **控制流 + 对象能力**（`KernelMemoryRuntime` 无 `commit_messages`）推出的，**不是对 Qdrant 集合的直接观察**。要证伪只需找到 **第三个写入者**：若存在其他代码在 admitted run 下仍向 `_session_collection_name(...)` 写点，我这条翻。**我 grep 了 `memory_factory` 的集合命名函数的调用点，未发现，但这是负向搜索。**
  4. **`store_owner=unchain` 与「admission 生效」不是同一件事。** 二者共用 Electron 侧同一个上游开关（`memory_v2_rollout.js:150`，E-0011，**跨界只读，终局归 `code-owner-electron`**），但 admission 另需 capability gate 与 canary 选中（`memory_v2_context.py:1194-1201, 1258-1261`）。**准确表述**：供给切断发生在 **被 admit 的 run** 上，而被 admit 的 run 只存在于 store_owner 已是 `unchain` 的配置里。**今天出厂包 rollout 冻结为 off（E-0011），故 shipped 用户不受影响 —— 这条风险在 0.1.10 记忆 agent 发版当天开始咬。**
  5. **G2 未消除。** 我没有真实 store，「真实使用下 folder 使用率是多少」我给不出数。C5 是按 **模型可见面** 作出的预测，不是对真实数据的统计。
  6. **模型事实纪律**：本发言 **未陈述任何未经现查的模型 / 维度 / 定价事实**。凡涉及 provider 与模型的，全部引自本仓当前 revision 的代码常量。**「2-D 线性投影通常保留多少方差」我不给数字 —— 那依赖具体 embedding 与语料，且端点自己就会算（`_project_vectors` 返回 `variance`），任何人想要这个数就去测，别引我的记忆，也别引任何人的记忆。**

- **请求/下一步**:

  1. **请本庭把甲记为一条更正而非确认**：S-0004 Q3(1) 的负向 grep **只覆盖读端**；「不需要任何人做任何事来维持」这句 **须补一个限定语「在代码行为上」**。**补正责任依证据规则第一节归 `code-owner-runtime`**，我只出锚点（E-H1 / E-H2 落在 `pupu:unchain_runtime/**`，是其边界，我 **跨界只读**，终局结论归其确认）。
  2. **请把 C3 写进本案 `SUMMARY` 的约束栏，而不是留给方案庭审。** 它零成本、可机械验收（`grep -rn "vector_status" src/` 应恒为 0），且是本案唯一一条 **现在不写下来就会在方案期被当成设计题重开** 的技术禁令。
  3. **请将「`vector_status` 恒为 `'degraded'` 且与真实状态无关」按 S-0029 请求 4 记为纯事实登记，并同时登记我这一条**：**`:489` 的正确取值应为 `"disabled"` 或 `"absent"`，一行改动，归 `code-owner-runtime`。** 我 **不请求在本案内改** —— 它不阻塞本案，且改它属另一议案。**但若不改，C3 必须永久有效。**
  4. **不请求为本案做任何 eval。** 但请把下列三项 **记入本案产出**，作为「将来若有人再提为 V2 造投影」的 **前置门**，免得同一个问题在没有判据的情况下被重开：
     - **E1 · 忠实度**：取 N≥50 条真实查询，比较「按 2-D 欧氏距离取 top-k」与「按生产检索器取 top-k」的重合度（Jaccard@10）。**低于 0.6 即证明该图不是检索的图像，不得以任何暗示检索行为的方式呈现。**
     - **E2 · 保留方差**：端点已经在算（`route_projection.py:359-369` 返回 `variance`）。**要求前两主成分的累计解释方差有明确下限，并在 UI 上如实显示，而不是藏起来。**
     - **E3 · 布局稳定性**：`_project_vectors` 每次请求都对当前全集 **重新拟合 SVD**（`:350-358`）。加入 k 条新条目后重投影，测点位平均位移。**V1 的会话作用域是有界的所以能忍；V2 的 store 是长期且无界增长的，同一做法会产生一张每加一条记忆就重排一次的地图 —— 那不是地图。** 这一条是我反对「把 V1 方案移植到 V2」的结构性理由，不是偏好。
  5. **另立议案的建议（我提出，不代本庭决定）**：**「V2 检索是否从纯词法升级为混合检索」** 值得单独立案 —— RRF 融合的常量已经写在代码里（`memory_v2_vector.py:43-45`），说明这条路是设计好的、只是没开。**它的收益是召回质量（用户真实痛点），不是一张图。** 若它有朝一日落地并使 embedding 成为承重件，投影才 **可能** 变得有意义 —— **即便那时，它仍然要和 tree 竞争，而 tree 有 ground truth 它没有。**
  6. **关于 C5 / 扁平树的成因（我的边界，本案不做）**：修法是 **prompt 面的**，两处任选其一即可 —— 在 `memory_upsert` 的模型可见描述里点名 `folder` 并给一句组织建议；或让 `kind` 参数带上 enum。**可证伪方式我一并给出**：A/B 跑 N 组种子会话，测 **folder 创建率** 与 **平均树深**，基线是今天（我预测 folder 创建率≈0）。**请勿在本案内做** —— 它改的是模型行为，须走自己的 case。

- **评估结论**: **有条件成立**

- **专业适用范围**:

  **落在我边界内（本条为终局主张）**：
  - 「向量视图 / 投影是否是 V2 的合理呈现物」这一 **检索与记忆表征** 判断（乙 a/b/c、丁）
  - embedding provider 选择与 chunking / 召回参数所连带的决定（乙 b）
  - `vector_status` / `degraded` 作为 **模型与产品可见的状态词汇** 是否可承载契约（丙）
  - `memory_upsert` 等 memory toolkit 的 **tool schema 形状与措辞**，及其对模型写出何种记忆结构的因果（C5、E-H4/E-H5）
  - 任何「更好 / 更准 / 更有意义」主张所需的 **eval 形式**（请求 4、6）

  **跨界只读，不构成本边界终局主张（须由该 owner 确认）**：
  - `pupu:unchain_runtime/server/unchain_adapter.py` · `memory_factory.py` · `memory_v2_vector.py` · `memory_v2_toolkit.py` · `memory_v2_unchain_read_adapter.py` · `memory_v2_context.py` → **`code-owner-runtime`**。E-H1 / E-H2 / E-H3 / E-H5 全部锚在这里，**我出的是「这些代码事实在检索与记忆语义上意味着什么」，不是「这些代码归谁改」**
  - `pupu:electron/main/services/unchain/memory_v2_rollout.js:150` → **`code-owner-electron`**
  - `unchain:src/unchain/tools/tool.py`（`Tool.from_callable` 的 schema 生成）→ **`code-owner-unchain`**

  **明确不在我边界内**：散点图 / tree view 长什么样、空态文案、层级如何呈现（`expert-ux` + 方案庭审）；四态判定的落位与权威归属（`chief-judge` / `expert-architecture`）；`:489` 那一行由谁改（`code-owner-runtime`）。

  **Q2 强制表态（FRAMING 乙，不说「与我无关」）**：**本案若推进，会要求我的边界承担一个今天不属于我的判定职责吗？—— 会一件，我明确承接；那个「无主构件」不落我这里。**
  - **会落我的一件**：`vector_status` 这类 **状态词汇是否可被 UI 消费** 的判定。今天没人拥有它，而它是「模型与检索子系统对外自述状态」的一部分 —— **我承接，并已在 C3 里把它办成了一条禁令**（成本：零行代码，一条 grep 可验收）。这是我边界内既有义务的延伸，**不需要新构件、不需要 CEO 拍板**。
  - **不落我的**：「四态由谁判、哪一层是权威状态源」。它要综合 build flag、Electron 决议、sidecar 就绪与 V2 读返回 —— **四个输入没有一个是检索或模型语义**。让我判它就是让鉴定人去当架构裁决人。**谁能判：`chief-judge` 指派（`expert-architecture` 已明言传唤机制解不了它）。**
  - **G1 是否前置阻塞我这一轴？—— 不构成。** 我上面五条必要条件无一依赖前案任何裁定，全部是当前 revision 上的代码事实与实测事实。

- **专业理由**:

  **甲 · 为什么窄命题成立而宽命题不成立**

  S-0004 用一次负向 grep 证明 `route_projection.py` 不认识 store owner，然后推出「保持现状自动成立」。**第一步无懈可击，第二步偷换了主语。** 「现状」不是一个关于源文件的属性，是一个关于 **用户打开这个视图会看到什么** 的属性。而那由两件事共同决定：读端怎么读（S-0004 看了），**以及有没有东西被写进去（S-0004 没看）**。

  写端我看了，链条是闭合的：

  1. V2 admission 生效 → `_resolve_memory_runtime` 走 `kind="v2_durability"` 分支（`unchain_adapter.py:5579-5615`），调 `create_durable_kernel_runtime_with_diagnostics`。
  2. 该工厂自己的 docstring 就是判据：**「Build the durability-only kernel runtime *without vector dependencies*. This path *deliberately bypasses Qdrant and embedding resolution*.」**（`memory_factory.py:1677-1682`）。对照同文件 `:1747-1764` —— **只有** `create_memory_manager_with_diagnostics` 那条路会建 `QdrantVectorAdapter` 并算 `collection_tag`，而 `/memory/projection` 读的正是这个 tag 派生的集合名（`route_projection.py:440-446`）。
  3. 返回对象因此 **不是 memory manager**。我实跑确认它是 `KernelMemoryRuntime`，**`hasattr(commit_messages)` = False，`hasattr(prepare_messages)` = False**（E-H2）。
  4. 装配层随之改道：`_memory_runtime_uses_durability_only({"kind":"v2_durability"})` = True（我实跑），于是 `:7183-7191` 装 `DurabilityModule(runtime=…)` 而 **不装 `MemoryModule(memory=…)`**。
  5. graph 路径还有第二道独立的门：`memory_commit_allowed` 初始 `False`（`:8731`），**只在 `not graph_memory_v2_admission.is_active` 的分支里** 才被置 `True`（`:8733, :8753`），而 `commit_messages` 的调用以它为条件（`:9485-9490`）。

  **两条路径、两种机制，结论同一：admitted run 不产生 V1 向量。**

  **为什么这对本庭重要，而不是一条趣闻**：因为它 **反转了本案的风险叙事**。本庭一直在问「新增 tree view 会不会踩到什么」。真实情况是 —— **V2 越是真正上线，V1 那个视图就越空**，而它空下去的方式是 **静默的**（`_empty_projection_payload`，200，与「这个会话还没有记忆」逐字节相同）。**用户会看到一个从来不报错、只是越来越空的向量视图。** tree view 不是在给一个健康的功能加同伴，**它是在给一个即将失去数据源的视图做接班人。** 这是支持议案的论据，我把它写在支持侧。

  **乙(a) · 「三样缺一不可」为什么不成立，以及我为什么主动拆自己的台**

  S-0004 说要造投影必须开向量后端 + 造新端点 + 写投影计算。**只有当产物被定义为「语义 embedding 的投影」时才缺一不可。** 若产物只是「一张二维散点」，**存在严格更便宜的等价物**：V2 的条目文本已经在 SQLite 的 FTS5 里，对它做 TF-IDF → SVD（即经典 LSA）即可得坐标，**零新 provider、零新 env、零 Qdrant**，而且 `route_projection.py:344-370` 那段 SVD 代码 **原样可用**。

  **我主动指出这条，是因为「技术上做不到」是一个会让本庭免于表态的假理由。** 拆掉它之后，问题回到它本来的样子：**不是「能不能」，是「该不该」。** 我的答案在 (c)。

  **乙(b) · 若真要造，会连带出哪些本案范围外的决定**

  | 连带决定 | 依据 | 为什么出本案范围 |
  |---|---|---|
  | **provider 事实上只有 Ollama** | `memory_v2_vector.py:81-87`：`provider != "ollama"` → `configuration_error="unsupported_provider"`；`:88-95`：`model` 必填无默认 | 「开个开关」实为「要求用户装 Ollama 并拉一个 embedding 模型」。**这是产品前置依赖，不是配置项。** 要支持云端 provider 就是新写一个后端 + 密钥 + 成本 + 隐私（本地记忆内容出机），全部属独立议案 |
  | **模型与维度成为存储身份的一部分** | V1 侧已有先例：`memory_embeddings.py:60-63` 的 `_vector_embedding_signature`（`provider:model:size`）与 `:108-141` 的换签名即换集合 | 换 embedding 模型 = 旧索引作废 + 重建。**这是迁移议案** |
  | **chunking 与 tree 的单位不一致** | `deterministic_chunks(chunk_chars=2000, overlap_chars=200)`（`:158-164`） | 向量的最小单位是 **重叠切块**，tree 的单位是 **条目**。散点画的是 chunk，同一条目切出的相邻块因 200 字符重叠而 **构造性地** 挨在一起 —— **图上最显眼的簇是切块产物，不是语义信号。** 要对齐就得再定一个聚合规则，那是新设计 |
  | **开了向量就改召回排序** | `RRF_K=60` / `LEXICAL_RRF_WEIGHT=2.0` / `VECTOR_RRF_WEIGHT=1.0`（`:43-45`），融合实现在 `:455-480` | **一旦启用，V2 的检索结果就变了。** 这是模型可见行为变更，必须有 eval 与 A/B，**绝不能作为「为了画一张图」的副产品发生。这一条是我最不肯让步的地方** |
  | **回填成本** | `MAX_INDEX_ENTRIES_PER_CALL = 2`（`:41`） | 存量 store 的索引是节流的增量过程，不是一次性任务 |

  **乙(c) · 直话：不该造**

  三条独立成立的理由，任一条都够：

  **1 · 忠实度。** 一张投影图唯一的正当性是「它展示的几何 = 系统实际使用的几何」。V1 成立：画图的向量就是驱动召回的向量。V2 **不成立** —— 今天检索是 FTS5 + 子串，**根本没有 embedding 参与**。为画图而现算的向量与召回 **零因果关系**。而用户看到散点会做的推断（「靠得近的会被一起想起来」）**是假的**。**一个不忠实的可视化不是中性装饰，它是一个关于用户自己记忆如何工作的错误断言 —— 而记忆子系统的全部价值就是可信。** 退一步，即便改用 (a) 那条便宜路（LSA），它忠实的也只是词法空间，**而 V2 的排序也不是那个空间上的余弦**，仍然不忠实，只是不忠实得便宜一点。

  **2 · V2 已经有更好的自我视图，而那正是本议案要建的东西。** V2 的组织结构是 **作者写下的**：path 层级、四种 typed kind、`tags`、`source_refs`。**那是 ground truth。** 投影是 **有损、随数据漂移、无语义标签** 的派生结构。**在一个已经携带权威结构的 store 上花钱去造一个更差的派生结构，是把 ground truth 换成估计值。** 本案的 tree view 正是那个权威视图 —— **所以正确的答复不是「V2 的 vector view 该显示什么」，而是「V2 的 vector view 就是 tree view」。**

  **3 · 结构上不可移植。** `_project_vectors` **每次请求都对当前全集重新拟合 SVD**（`:350-358`）。主成分基随数据变，**加一条记忆整张图就重排一次**（含主轴符号翻转）。V1 的作用域是单会话、有界，能忍；**V2 的 store 是长期、无界增长的** —— 同一做法在 V2 上产生的是一张每次打开都不一样的地图。**地图的价值在于稳定；不稳定的地图比没有地图更糟，因为用户会试图记住它。** 这条与向量后端开不开无关，**是把 V1 方案移植到 V2 这件事本身的结构性缺陷。**

  **丙 · 两个词不是一回事，且其中一个在产品路径上是假的**

  它们是 **两类不同的陈述**：

  | | `disabled`（`pupu_legacy` 读路径） | `degraded`（`unchain` 读路径 = 产品路径） |
  |---|---|---|
  | 产生方式 | **计算得出** —— `NullVectorBackend.status()`（`memory_v2_vector.py:203`），因 provider 未配置而选中该后端 | **字面量** —— `memory_v2_unchain_read_adapter.py:489` 硬编码 |
  | 可变性 | 随 env 变（配了 provider 就不是它） | **构造上不可达其他值**（S-0029：两个读服务 `__init__` 均无 `vector_index` 形参，全源单一赋值点无 setter） |
  | 是否为真 | **真** —— 抽象存在、开关关闭 | **假** —— 它断言「能力存在且受损」，实测是 **缺席（absent）非受损（impaired）** |

  **所以：不是同一件事的两种说法。`disabled` 是一个诚实的开关状态；`degraded` 是一个占位串，它掩盖的恰恰是「根本没开」，而且掩盖的方式比沉默更坏 —— 沉默不做断言，`degraded` 做了一个假断言。**

  **对一个要消费该字段判态的 renderer，意味着三件事：**

  1. **该字段熵为零，不携带任何信息。** 分支于它 = 写一个在编译期就已决定的 `if`。**任何据它显示「向量检索已降级」的 UI，都在告诉用户一件关于其记忆系统的假事。**
  2. **同一响应体里存在活的词汇碰撞。** 相邻的 `backend` 也取 `"degraded"`，**而那一处是真算的**（`:488`，`result.lexical_fallback` 为真时才是）。**同一个 token 在相邻两键里，一个是真状态一个是恒假占位，读端无法凭观察分辨。** 这与我在本组织已记录的同类形态是同一个病（`0000-0005-2026-0807` 系列：`complete`/`completed` 在上游自己分裂、终态被自由文本子串决定）。
  3. **由此推出一条我此前已立、此处再次适用的判据：一个构造上不可变的状态 token 不能承载契约。** 我在 finality / trace 终态两案的立场是「终态不得由自由文本子串决定」；此处是同一原理的另一面 —— **不得由一个不会变的字面量决定**。故 **C3 是禁令，不是构件**：本案的 tree view 本来就不需要向量状态，**只要写下「不读它」，这个坑今天就被永久封住，成本为零。**

  **丁 · 范围表态（直接回答，不推给本庭）**

  - **「为 V2 造一套投影」不属于本案范围。** 本案 `phase: motion` 问的是「能不能加一个 tree view」；投影是 **另一件产物、另一条数据依赖、另一组模型决定**。
  - **不该作为本案的 side case。** side case 的前提是「可分割的小块」。投影不是小块 —— **它预设了一个尚未作出的决定：V2 的检索要不要变成语义/混合检索。** 在那个决定之前谈投影，就是让可视化去替检索架构作答。
  - **也不该作为「为 V2 造投影」这个题目独立立案 —— 这个议案本身就不该存在。** 理由见乙(c)三条。
  - **可以独立立案的是另一个题目**：**「V2 检索是否从纯词法升级为混合检索」**（RRF 常量已在代码里预留，说明这条路是设计过的）。**它的收益是召回质量 —— 用户的真实痛点、也是本组织已认定的压注点 —— 不是一张图。** 若它落地并使 embedding 成为承重件，投影才 **可能** 有意义；**即便到那时，它仍要和 tree 竞争，而 tree 有 ground truth。**
  - **顺序不可颠倒，这是我这条表态的实质**：**检索决定在前，可视化至多是下游的、可选的后果。可视化永远不得成为制造 embedding 的理由。**

  **戊 · 对 `expert-architecture`（S-0025 请求 7）的知悉**

  我判 **不造投影**。依其自陈的依赖关系，其落位结论 **无条件成立**，`memory-inspect/` 保持「一个 modal + 两个内容组件」，**不需要变成需要内容路由的容器**。**本案不因我增加待裁问题。** 我不代其表态。

  **额外 · C5 的成因在我边界内（`code-owner-unchain` S-0024 请求/乙 明确路由给我）**

  `code-owner-unchain` 实证 folder 不自动物化、tree 会退化为扁平（E-0061），并说「是否要层级取决于 memory toolkit 的实际使用方式 —— 那是 `expert-llm` 与写侧的问题」。**我作答，答案是：在我这一轴，扁平是预测默认值，不是偶发分支。**

  判据是 **模型实际看到什么**（E-H4 / E-H5）：

  - `memory_upsert` 的模型可见 description 全文是：**「Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory.」**（`memory_v2_toolkit.py:1758-1762`）—— **一个字都没提 folder，没提层级，没提四个合法 kind。**
  - 参数 schema 由 `Tool.from_callable` 生成（`:459-466`）。我实跑 dump：**十个参数的 description 全部是自动生成的占位串 `"Argument <name>"`**，`kind` 是 `type_='string'`、**`pattern=None`、无 enum**、默认 `"markdown"`。
  - **函数 docstring 被丢弃** —— 描述取自显式传入的字符串。故 `memory_list` 里那句 `:param path: Virtual folder path;…` 等 **全部是死文档，模型永远看不到**。（这是一条比本案更宽的 prompt 装配缺陷，我登记，不在本案处置。）
  - 四个合法 kind **只出现在报错文案**（`:364-365`）—— 即模型 **只能先猜错才可能发现 `folder` 存在**，而它没有理由去猜：默认值已经给了它一个能用的值。
  - toolkit 里 **没有** `memory_create_folder` 这类工具（`:1751-1790` 全表）。

  **结论：模型不知道 `folder` 存在，因而不会建，因而不会有层级。** 这不是「可能退化」，是 **在没有人改 prompt 面之前，退化就是稳态**。故 **C5 必须写进议案前提**；而修法（点名 `folder` / 给 `kind` 加 enum）**是我的边界、是 prompt 面改动、不在本案范围**，须另走 case，且须带 A/B（folder 创建率、平均树深，基线为今天）。

- **支撑证据**:

  ### E-H1 | repository | 自证类
  - **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_factory.py:1672-1704`（`create_durable_kernel_runtime_with_diagnostics`，docstring `:1677-1682`）· `:1707-1764`（`create_memory_manager_with_diagnostics` → `QdrantVectorAdapter` + `_prepare_vector_collection_tag`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py:5579-5615`（`_resolve_memory_runtime` 的 `v2_durability` 分支）· `:5688-5697`（`_memory_runtime_uses_durability_only`）· `:7183-7191`（`DurabilityModule` vs `MemoryModule`）· `:7684`（classic 路径传入 `memory_durability_only`）· `:8731,8733,8753`（`memory_commit_allowed` 仅在非 admission 分支置真）· `:9485-9490`（commit 以其为条件）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:406-449`（读端的集合名来自 `memory_factory` 的 tag）
  - **取得方式**: 定点读取上述行段；`grep -n "memory_commit_allowed" unchain_adapter.py`（**全文仅 3 处：8731 / 8753 / 9488**）
  - **支持/反驳**: **收窄** S-0004 Q3(1) 与本庭甲 —— 支持其读端结论，**反驳** 由此推出的「保持现状 = 用户所见不变」
  - **完整性限制**: 静态控制流阅读。**未观察 Qdrant 集合本身**；「不再有新点写入」是由控制流 + 对象能力推出的。**负向搜索限制**：我未穷举全仓是否存在第三个向 `_session_collection_name(...)` 派生集合写入的调用者。**跨界**：全部落 `pupu:unchain_runtime/**`，归 `code-owner-runtime` 终局确认
  - **证据类型判据**: 仓内文件字面内容与行号，同 revision 可直接复核 → 自证类
  - **验证历史**: 本发言 | 未验证（首次提交）

  ### E-H2 | tool-output | 须查类
  - **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f4`，工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`，2026-08-08
  - **取得方式**（完整可复跑，只写临时目录，零改动；采用 E-0059 的产品 bootstrap 方法）:
    ```bash
    cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && \
    env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH -u PUPU_CONTEXT_V2_STORE_OWNER PYTHONPATH=. python3 - <<'EOF'
    import os, tempfile, inspect
    tmp = tempfile.TemporaryDirectory(); os.environ["UNCHAIN_DATA_DIR"] = tmp.name
    import unchain_adapter as UA          # 产品自带 bootstrap
    import unchain, memory_factory
    print("unchain resolved ->", unchain.__file__)
    f = UA._memory_runtime_uses_durability_only
    print("uses_durability_only({'kind':'v2_durability'}) =", f({"kind": "v2_durability"}))
    print("uses_durability_only(legacy available)        =",
          f({"kind": "legacy_context", "durability_available": True, "legacy_context_available": True}))
    class Adm:  is_active = True
    rt, mgr = UA._resolve_memory_runtime({"memory_enabled": True}, session_id="s1", memory_v2_admission=Adm())
    print("active-admission runtime kind =", rt.get("kind"), "| legacy_context_available =", rt.get("legacy_context_available"))
    print("manager type =", type(mgr).__name__)
    print("manager has commit_messages? ", hasattr(mgr, "commit_messages"))
    print("manager has prepare_messages? ", hasattr(mgr, "prepare_messages"))
    print("\n".join(inspect.getdoc(memory_factory.create_durable_kernel_runtime_with_diagnostics).splitlines()[:3]))
    EOF
    ```
    **实际输出**:
    ```
    unchain resolved -> /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
    uses_durability_only({'kind':'v2_durability'}) = True
    uses_durability_only(legacy available)        = False
    active-admission runtime kind = v2_durability | legacy_context_available = False
    manager type = KernelMemoryRuntime
    manager has commit_messages?  False
    manager has prepare_messages?  False
    Build the durability-only kernel runtime without vector dependencies.

    This path deliberately bypasses Qdrant and embedding resolution.  It exists
    ```
  - **支持/反驳**: **支持** E-H1 与本发言甲 —— admitted run 装配的运行时对象 **在能力层面就不可能** 写 V1 向量；**收窄** S-0004 Q3(1)
  - **完整性限制**: **(1)** 我以 `class Adm: is_active = True` 作 admission 替身，**未经真实 `resolve_memory_v2_admission`**；该替身只被 `_resolve_memory_runtime` 以 `getattr(…, "is_active", False)` 读取（`:5579`），故对本函数保真，**但不证明真实 admission 何时 `is_active`**。**(2)** 未起 sidecar、未跑真实 agent turn、未观察 Qdrant。**(3)** `UNCHAIN_DATA_DIR` 指向临时目录，非本机真实 store（G2 未消除）。**(4)** 同机同环境，非独立第二环境
  - **证据类型判据**: 自搭 harness 的运行时观察 → **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner`**
  - **验证历史**: 本发言 | 未验证（首次提交）

  ### E-H3 | repository | 自证类
  - **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_vector.py:30`（`VECTOR_PROVIDER_ENV`）· `:43-45`（`RRF_K=60` / `LEXICAL_RRF_WEIGHT=2.0` / `VECTOR_RRF_WEIGHT=1.0`）· `:41`（`MAX_INDEX_ENTRIES_PER_CALL=2`）· `:81-87`（`provider != "ollama"` → `unsupported_provider`）· `:88-95`（`model` 缺失 → `model_required`）· `:152-156`（`VectorHit` 三字段）· `:158-164`（`deterministic_chunks(chunk_chars=2000, overlap_chars=200)`）· `:198-205`（`NullVectorBackend.status()` → `"disabled"`）· `:231`（`OllamaQdrantBackend` 亦要求 `provider == "ollama"`）· `:455-480`（RRF 融合）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:488-489`（`backend` 计算 / `vector_status` 字面量）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:344-370`（`_project_vectors`：每次请求对全集重拟合 SVD，取前 5 主成分，返回 `variance`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_embeddings.py:60-63, 108-141`（V1 的 `provider:model:size` 签名与换签名即换集合）
  - **取得方式**: 定点读取；`grep -c "store_owner\|memory_v2\|context_v2" route_projection.py` → **0**（独立复跑 E-0007 的负向命题）；`grep -rn "PUPU_MEMORY_V2_VECTOR_PROVIDER" --include="*.py" --include="*.js" --include="*.cjs" --include="*.json" .`（排除 `node_modules` / `__pycache__` / 测试）→ **产品代码仅 `memory_v2_vector.py:30` 其自身常量定义一处**（另一处命中在 `.claude/worktrees/` 下的工作树副本，非产品树）
  - **支持/反驳**: **独立复核并支持** E-0007 / E-0009 / S-0008 相关性第 2 点；**新增** 乙(b) 全部连带项与乙(c) 第 3 条（重拟合 SVD → 布局不稳定）的判据
  - **完整性限制**: 静态读取。**未实跑任何向量路径**（后端恒为 `NullVectorBackend`，无可跑）。「Ollama 是唯一支持的 provider」是对 `from_environ` 与 `_build_backend` 两处分支的读取，**未穷举是否有绕过 `VectorConfig` 的第二条构造路径**。**跨界**：全部落 `pupu:unchain_runtime/**`，归 `code-owner-runtime`
  - **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类
  - **验证历史**: 本发言 | 未验证（首次提交）

  ### E-H4 | tool-output | 须查类
  - **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f4`，同 E-H2 工作目录，2026-08-08
  - **取得方式**（完整可复跑；签名逐字抄自 `memory_v2_toolkit.py:1355-1366`，description 逐字抄自 `:1758-1762`，注册形式对照 `:459-466`）:
    ```bash
    cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && env -u PYTHONPATH PYTHONPATH=. python3 - <<'EOF'
    import unchain_adapter, json
    from unchain.tools.tool import Tool
    def memory_upsert(path: str, description: str, expected_space_revision: int,
                      entry_ref: str = "", content: str = "", kind: str = "markdown",
                      content_base64: str = "", mime_type: str = "", url: str = "",
                      source_ref: str = "") -> dict:
        """Create or revise formal chat memory with CAS protection.

        ``description`` is indexed. Use a stable, specific virtual path and a
        description that explains retrieval intent. This tool never writes
        long-term memory.
        """
        return {}
    t = Tool.from_callable(memory_upsert, name="memory_upsert",
        description="Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory.",
        always_load=True)
    print(json.dumps(t.description)); print(json.dumps([str(p) for p in t.parameters], indent=1))
    EOF
    ```
    **实际输出（节选，逐字）**:
    ```
    "Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory."
    "ToolParameter(name='path',   description='Argument path',   type_='string',  required=True,  pattern=None, items=None)"
    "ToolParameter(name='kind',   description='Argument kind',   type_='string',  required=False, pattern=None, items=None)"
    …（十个参数的 description 全部形如 'Argument <name>'；无一处 enum；无一处 pattern）
    ```
  - **支持/反驳**: **支持** C5 与本发言「额外」节 —— 模型可见面 **既未列举 `folder`，也未以 enum 约束 `kind`，且函数 docstring 被丢弃**；**把 E-0061 / S-0028 的「退化形状可达」升格为「在 prompt 面不变的前提下是稳态」**
  - **完整性限制**: **(1)** 我 **复制签名而非导入真实闭包**（闭包定义在需要 runtime 的工厂内）；签名与 description 均逐字抄自上述行号，**但「抄得对」未经第二方核对**。**(2)** 只覆盖 `memory_upsert` 一个工具；其余工具的参数描述我 **按同一 `from_callable` 路径推断亦为占位串，未逐一实跑**。**(3)** 未观察一次真实 provider 请求体，**故「模型最终收到的 JSON schema 长什么样」严格说仍隔着 provider adapter 一层** —— 依我边界内既有认定（工具主经 provider tools-API 参数下发全 schema），我判该层不改变 enum 的有无，**但此判断在本案未取证**。**(4)** `Tool.from_callable` 落 `unchain:src/unchain/tools/tool.py`，归 `code-owner-unchain`；`memory_v2_toolkit.py` 归 `code-owner-runtime`
  - **证据类型判据**: 自搭 harness 的运行时观察 → **须查类，强制送 `evidence-examiner`**
  - **验证历史**: 本发言 | 未验证（首次提交）

  ### E-H5 | repository | 自证类
  - **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_toolkit.py:1758-1762`（`memory_upsert` 的模型可见 description 全文）· `:1355-1366`（签名，`kind: str = "markdown"` 在 `:1361`）· `:1367-1372`（被丢弃的 docstring）· `:364-365`（四个合法 kind 的 **唯一** 出现处，在错误分支）· `:459-466`（`Tool.from_callable` 注册，description 由元组显式提供）· `:924-933`（`memory_list` 的 `:param path: Virtual folder path;…` —— 同样不可达模型）· `:1751-1790`（工具名/描述全表，**无 `memory_create_folder`**）
  - **取得方式**: `grep -n "    def memory_" memory_v2_toolkit.py`（17 个工具）；`grep -n 'kind: str = "markdown"\|kind must be folder' memory_v2_toolkit.py`；`grep -n "folder" memory_v2_toolkit.py`（**全文 6 处，无一处在模型可见 description 内**）；定点读取上述行段
  - **支持/反驳**: **支持** C5 与「额外」节；**与 E-0061 / S-0024 乙 合取** 得出「扁平是稳态」
  - **完整性限制**: 只覆盖字面 `folder` 与该文件。**未核实** 是否有别处（system prompt、character 指令、skill）向模型描述过记忆的组织方式 —— 若有，我的预测强度下降。**跨界**：`pupu:unchain_runtime/**`，归 `code-owner-runtime`
  - **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类
  - **验证历史**: 本发言 | 未验证（首次提交）

  ### 执行约束自陈
  - **A-012 遵守：未派生任何子 instance。** 全部 grep / 读取 / 实跑由本 instance 亲自执行。
  - **只读。** 两仓零改动；结束时产品目录 `git status --porcelain -- src electron unchain_runtime` 为空（开工时实测已为空，见上）。全部临时产物在系统临时目录，随进程销毁。
  - **本条不含任何视觉 / 交互设计主张。** 乙(c) 与 C5 触及「该不该有这个视图 / 树会不会有层级」，**我只陈述信息忠实度与模型写入行为这两个技术事实，不主张任何呈现形态** —— 呈现归方案庭审与 `expert-ux`。
  - **模型事实纪律**：本条 **零处** 从记忆陈述模型 / 维度 / 定价 / provider 能力事实。所有 provider 与模型相关主张均引自本仓当前 revision 的代码常量并给出行号。**依 `claude-api` skill 自身的 SKIP 判据**，本任务的 provider grep 命中 `openai` / `ollama`（`unchain_runtime/server/` 下 20+ 文件），故未加载该 skill；**代价是：本条不对任何 Claude 侧模型事实作断言，也不需要。**
