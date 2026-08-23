#### S-XXXX | ASSESSMENT | evidence-examiner → E-0073

- **阶段**: 议案庭审
- **结论**: 八行输出 **全部逐字复现，无篡改迹象**。admission 替身自陈 **充分且必要** —— 已核实该对象在 `_resolve_memory_runtime` 内 **只被读取一次**。此外本庭发现该结论 **另有一条独立机制支撑**，比 harness 所示更强。**但负向搜索自陈 不充分**：我找到了提交方所说的「第三个写入者」，且它 **服务端零 admission 门禁**。故本条 **只能支持其 `支持/反驳` 字段所写的窄命题**，不支持传唤书中「V2 生效后 V1 向量视图不再有新数据」的宽命题。
- **依据**: E-0073
- **不确定性**: 见下「不确定性」三项
- **请求/下一步**: 见下「请求」三项
- **评估结论**: 已验证
- **证据编号**: E-0073
- **来源类型**: general

- **真实性**: **确认。** 两仓 revision 与自陈一致且工作树洁净（PuPu `b2385d5d`、unchain `a4e69f4`，`git status --porcelain -- src electron unchain_runtime` 为空，unchain 全仓为空），故复跑与提交时同底。**原样复跑其命令，八行输出与卷内逐字一致**，含 `unchain resolved -> /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`（E-0059 产品 bootstrap 方法有效）、`kind = v2_durability`、`KernelMemoryRuntime`、两个 `False`，及 docstring 前三行。无篡改迹象。复跑后再次确认两仓零改动。

- **可靠性**: **内部来源，但可靠性高于「须查类」的一般水准。** 该 harness 完全确定性：不依赖网络、不依赖本机 store（`UNCHAIN_DATA_DIR` 指向临时目录）、不依赖时点。任何角色在同 revision 可原样复现，**实测复现结果与复现者无关** —— 就判据而言它的行为接近自证类。提交方对四项限制（替身、未起 sidecar、临时目录、同机同环境）的自陈准确，无夸大。

- **相关性**: **对其自身所写的窄命题成立；对传唤书转述的宽命题不成立。** 分三层：

  1. **替身自陈（传唤第 2 问）—— 核实为充分。** `memory_v2_admission` 在 `_resolve_memory_runtime`（`unchain_adapter.py:5573-5613`）内 **仅出现一次**，即 `:5579` 的 `bool(getattr(memory_v2_admission, "is_active", False))`；进入该分支后再不触碰该对象。真实 admission 亦以属性形式持有 `is_active`（`:7151`、`:7360`）。故 `class Adm: is_active = True` **对本函数完全保真**，而「不证明真实 admission 何时 is_active」的自陈 **准确且必须保留**。

  2. **本庭另获一条独立佐证（强于 harness）。** 缺少 `commit_messages` / `prepare_messages` **甚至不需要被触发**：`unchain_adapter.py:8733` 的 `if memory_manager is not None and not graph_memory_v2_admission.is_active:` 把整个 prepare 段落挡在 active V2 之外，`memory_commit_allowed` 遂停留在 `:8731` 的 `False`，而 `:9488` 的 V1 commit 正以该标志为条件。**即 active V2 下 V1 commit 是被显式标志跳过，而非撞 AttributeError。** 能力缺失与控制流门禁 **两条互不依赖的机制指向同一结果**。

  3. **负向搜索自陈（传唤第 3 问）—— 覆盖面不足，第三个写入者确实存在。** 我沿 `add_texts` 全量枚举，得三个写入 `_session_collection_name` 派生集合的调用点，其中 **一个在 PuPu 侧且完全在 `commit_messages` 之外**：
     - `memory_factory.py:1948` `vector_adapter.add_texts(session_id=…)`，位于 `_commit_short_term_session_memory_replacement`（`:1861`），写入 `:1899-1906` 处算出的 session 集合；
     - 公开入口 `replace_short_term_session_memory`（`:2030`）与 `delete_short_term_session_memory`（`:2357`）；
     - 前者由 `route_memory.py:54` 的 **`POST /memory/session/replace`** 直接调用，**该路由服务端只校验 auth，无任何 V2 admission 判断**；后者由 `character_service.py:289` 调用。

     该路径把 **请求体里的 `messages`** 重新嵌入向量集合，故它 **有能力** 在 V2 生效期间向 V1 向量视图注入新内容。渲染端两个调用者中：`use_chat_stream.js:4066` 的 V1 mirror 腿 **被 `:4040` 的 `admissionMode !== SHADOW` 提前 return 挡住**（active 不镜像，shadow 才双写），此点保住了 active 场景；但 `chat_export.js:169` 的 `restoreSessionMemory`（导入会话时）**不带任何 admission 判断**。

     **净效果**：宽命题「V2 生效后 V1 向量视图不再有新数据」**并非由本条证据成立**，它还需要上述渲染端门禁事实，而那些事实 **不在 E-0073 内，是本庭自行查得**；且该门禁 **只在渲染端，服务端敞开**。反之，E-0073 `支持/反驳` 字段自己写的 **「admitted run 装配的运行时对象在能力层面就不可能写 V1 向量」完全成立**，且不受这些额外写入者影响 —— 它们不是 run 装配的那个对象。

  4. **一处必须随本条一同引用的剥离**：传唤书所述「退化静默（200 + 空 payload）」**不由 E-0073 承载**。该 harness 不发任何 HTTP 请求、不观察任何响应体。该半句若要承重，须另引它证。

- **来源归类**: **内部来源。** 自搭 harness 覆盖 `pupu:unchain_runtime/server/unchain_adapter.py` 与 `memory_factory.py`，被测代码全部在库内、同 revision 可定位。终局确认权按边界归 `code-owner-runtime`；`use_chat_stream.js` / `chat_export.js` 侧事实归 `code-owner-chat-core` 与 `code-owner-shared-arteries`。

- **不确定性**:
  1. 真实 `resolve_memory_v2_admission` 何时返回 `is_active=True` **仍未取证**（提交方已自陈，本庭确认该缺口真实存在）。
  2. 我沿 `add_texts` 做的枚举是 **又一次负向搜索**；我覆盖了两仓 `*.py` 的 `add_texts` 与 `.upsert(` 全量命中并排除测试与 `__pycache__`，但 **未穷举反射式/动态构造的调用**。
  3. `chat_export.js` 导入路径在 V2 已 admit 的会话上究竟能否触发，**未实跑**；我只确认该调用点无 admission 判断。

- **请求/下一步**:
  1. 采纳本条时 **须一并载明第 3 点的窄化**：可用于「运行时对象无能力写 V1 向量」，**不可** 单独用于「V1 向量视图不再有新数据」。
  2. `POST /memory/session/replace` 服务端无 admission 门禁一事，建议由 `code-owner-runtime` 确认是否属预期设计 —— 本庭 **不就此发表实体意见**。
  3. 「退化静默」半句请勿挂在 E-0073 名下。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0075

- **阶段**: 议案庭审
- **结论**: 手抄签名与 description **逐字核对通过**（仅返回标注一处非实质差异）。更进一步：**本庭构造出了真实 toolkit 并 dump 出真实 provider JSON schema** —— 提交方预言「若审查人能做到则强于我这一条」，本庭做到了，其 **核心观察被真实闭包与四条 provider 路径全部证实**，限制 (3) 就此关闭。**但同时证伪了本条自己的限制 (2)，并推翻传唤书「模型压根不知道 folder 存在」的表述**：`from_callable` 会解析 `:param:`，`memory_list` 的 `folder` 字样 **确实到达模型**。
- **依据**: E-0075
- **不确定性**: 见下「不确定性」三项
- **请求/下一步**: 见下「请求」三项
- **评估结论**: 已验证
- **证据编号**: E-0075
- **来源类型**: general

- **真实性**: **确认，附一处措辞瑕疵。** 原样复跑其命令，description 与十个 `ToolParameter` 全部复现，`Argument <name>` 占位、`pattern=None`、无 enum 均一致。
  - **逐字比对（传唤指定项）**：签名 `memory_v2_toolkit.py:1355-1366` 与手抄 **完全一致** —— 十个参数的名称、顺序、类型、默认值逐一吻合，含 `kind: str = "markdown"`（实际在 `:1361`）与三个必填项。docstring `:1367-1372` **逐字一致**。description 实际位于 `:1760`，落在其所引 `:1758-1762`（该元组区间）之内，**字符串逐字一致**。
  - **唯一差异**：真实签名返回标注为 `-> dict[str, Any]`，手抄写作 `-> dict`。**非实质** —— 已由下述真实闭包 dump 证明返回标注不参与 schema 生成，两者产出相同。
  - **措辞瑕疵**：卷内标注「**实际输出（节选，逐字）**」的代码块内含为对齐而加的多余空格（`name='path',   description=…`），真实输出为单空格。**内容无出入，但该块并非字面逐字**，建议改标「节选（已对齐）」。

- **可靠性**: **内部来源；本庭已把它从「重建」升格为「原件」。** 提交方最大的自陈风险（复制签名而非导入真实闭包）**已被消除**：`build_memory_v2_toolkit`（`memory_v2_toolkit.py:481`）的 `runtime` 参数 **只在 `:503` 作 `is None` 判断**，运行时对象仅在工具被调用时才使用，故可传哨兵 `object()` 构造出 **真实 toolkit**。实测：
  - `build_memory_v2_toolkit(runtime=object(), …, curator=True)` → `unchain.tools.toolkit.Toolkit`，注册 14 个工具，含 `memory_upsert`；
  - 其真实 `Tool` 对象的 description 与十个参数 **与提交方的重建逐字符相同**。
  - **重要限定**：默认 `curator=False` 时 `:1327` 的 `if not is_curator:` 提前 return，工具只有 6 个且 **不含 `memory_upsert`** —— 该工具 **只对 curator 运行暴露**。此点 E-0075 未提及。

- **相关性**: **对 `memory_upsert` 的窄命题成立且已被强化；对「模型可见面」的宽表述不成立。** 分四层：

  1. **限制 (3) 已被本庭关闭，结论在 provider 边界成立。** `Toolkit.to_provider_json(provider)` 即模型可见 JSON。对 `openai` / `anthropic` / `gemini` / 默认 四条路径实跑，`memory_upsert` 均为：`"kind": {"type": "string", "description": "Argument kind"}` —— **无 `enum`、无 `pattern`、无默认值**；`required` 仅 `[path, description, expected_space_revision]`；`additionalProperties: false`。**字符串 `"enum"` 在三种 toolkit 变体的完整 provider JSON 中零出现。** 故「未以 enum 约束 `kind`」**在模型实际收到的 schema 层面确证**，不再隔着 provider adapter。

  2. **「函数 docstring 被丢弃」成立。** `memory_upsert` 的散文式 docstring 未进入任何模型可见字段；元组显式提供 description，故连 docstring summary 回退（`unchain:src/unchain/tools/tool.py:179`）也未启用。

  3. **限制 (2) 的推断被证伪。** 提交方推断「其余工具的参数描述按同一 `from_callable` 路径亦为占位串」。**错。** `Tool.from_callable` **会解析 `:param name:` 指令**（`unchain:src/unchain/tools/tool.py:266` 取 `parameter_descriptions`，`:282` 仅在缺失时回退 `f"Argument {name}"`）。实测三种变体下 **均有 3 个参数带真实描述**，全部来自 `memory_list`（`memory_v2_toolkit.py:924-935` 使用 `:param:` 语法）。**占位串是 `memory_upsert` 散文 docstring 触发的回退，不是 `from_callable` 的无条件行为。**

  4. **传唤书「模型压根不知道 `folder` 存在」被直接推翻。** 在 **全部三种 toolkit 变体**（普通 agent / curator / task_state_curator）的模型可见 JSON 中，均含 `memory_list.path` → **`"Virtual folder path; never use a host filesystem path."`**。**`folder` 一词确实到达模型**，且普通 agent 也看得到。
     **仍然成立的、且仍具材料性的窄事实是**：唯一的写入工具 `memory_upsert` 的模型可见面 **不提 `folder`**，`kind` **无 enum、无默认、描述为占位串**。**但「模型不知道 folder 存在」不能再说** —— 「扁平是稳态」的升格因此失去其中一条支柱，是否仍成立须由提出方重排，**不由本庭判断**。

- **来源归类**: **内部来源。** 被测面跨两仓：`pupu:unchain_runtime/server/memory_v2_toolkit.py` 归 `code-owner-runtime`；`unchain:src/unchain/tools/tool.py` 与 `toolkit.py` 归 `code-owner-unchain`。提交方对该跨界的自陈准确。

- **不确定性**:
  1. 我以 `object()` 作 runtime 哨兵构造 toolkit。**该替身只被 `:503` 的 `is None` 读取**，故对 schema 生成保真；但同 E-0073，**不证明真实运行时下工具集合完全相同**（`curator` 等入参由服务端决定）。
  2. 我 dump 的是 unchain 的 `to_provider_json`。**未实跑一次真实 provider 网络请求**，故「SDK 不再改写 schema」这一层 **仍未取证** —— 相对提交方的自陈已推进一层，但未推到底。
  3. `memory_upsert` 仅对 `curator=True` 暴露一事，其对宽命题的影响 **未评估**，本庭不评估。

- **请求/下一步**:
  1. 采纳本条时 **必须同时载明第 3、4 点**：其限制 (2) 的推断已证伪，且 **「模型压根不知道 folder 存在」不可再使用**；可用的是「`memory_upsert` 不提 folder、`kind` 无 enum 无默认」。
  2. 建议以本庭 dump 出的 **真实 provider JSON** 取代或补强 E-0075 的重建输出 —— 提交方已预先声明该形态强于其原件。
  3. 「实际输出（逐字）」标注建议按真实性节的意见修正。

---

#### 执行约束自陈
- **A-012 遵守：未派生任何子 instance。** 全部复跑、grep、读取与真实 toolkit 构造由本 instance 亲自执行。
- **只读。** 两仓零改动 —— 复跑前后均实测 PuPu `git status --porcelain -- src electron unchain_runtime` 为空、unchain 全仓 `git status --porcelain` 为空，HEAD 仍为 `b2385d5d` / `a4e69f4`。全部 harness 的 `UNCHAIN_DATA_DIR` 指向 `tempfile.TemporaryDirectory()`，**未触碰本机真实 store**，未起 sidecar，未发网络请求。
- **未就实体争点发表意见。** 本庭对「vector view 该不该保持现状」「tree 会不会退化」**不持立场**；上文对宽命题的窄化只陈述「该证据支持到哪里为止」，不主张任何方案取舍。
- **两条结论独立作出，未合并判定。**
