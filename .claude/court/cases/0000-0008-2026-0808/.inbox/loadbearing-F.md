# 承重证据复核 · 批次 F（收尾）· E-0072 / E-0074 / E-0076

提交方 `expert-llm`（S-0045）。三条全为 **自证类**，依证据规则第六节在本关不豁免；本关同时为时效性复核。

## 全批时效前提

复核开工与收工时实测：

| 项目 | 实测值 |
|---|---|
| PuPu `git rev-parse --short HEAD` | `b2385d5d`（branch `dev`） |
| PuPu `git status --porcelain -- src electron unchain_runtime` | **0 行** |
| unchain `git rev-parse --short HEAD` | `a4e69f4` |
| unchain `git status --porcelain` | **0 行** |

三条证据登记的 revision 均为 PuPu `b2385d5d`，**与本关实测 revision 同一**，且三个产品目录零改动。故本批 **不存在 revision 漂移**：凡本关查出的偏差，均为登记时即已存在的偏差，**不是时效性失效**。反之，凡本关复现的断言，**至今日仍然成立**。

复核方式：所有行号定点读取、所有计数类与穷举类断言 **实际重跑命令**，负向断言 **另行独立取证**，不依赖登记摘要，亦不依赖前批（S-0071 / S-0072）的结论 —— 与前批重合处均由本关重新独立观察。**未派生任何子 instance（A-012）。两仓只读、零改动、未 commit。** 全部临时对象在 `tempfile.TemporaryDirectory()` 内，随进程销毁。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0072

- **阶段**: 议案庭审
- **结论**: 十处行号引用 **全部精确命中** 所述内容，唯一的计数类断言（`memory_commit_allowed` 全文 3 处）**逐个行号复现**，无篡改、无漂移。本条在当前工作树上 **仍然完全成立**。
- **依据**: E-0072
- **不确定性**: 本条 **缺 `净内容` 字段**，其事实主张全部内嵌在 `来源定位` 的括注中 —— 这是形式瑕疵，不影响可验证性（每条括注均可独立核对且均已核对），但下游引用时须逐条摘引括注，不能整体引用「E-0072 证明了 X」。
- **请求/下一步**: 无补强请求。建议 `speaker-of-the-house` 在采信时连带记录下方「相关性」段的射程边界。
- **评估结论**: **已验证**
- **证据编号**: E-0072
- **来源类型**: general
- **真实性**: **通过。** 逐项实测：
  - `memory_factory.py:1672-1704` = `create_durable_kernel_runtime_with_diagnostics` 完整函数体（`def` 在 1672，`return runtime, ""` 在 1704），**首尾精确**；docstring 首行 1677 起，正文末行 1682，逐字为 `Build the durability-only kernel runtime without vector dependencies.` / `This path deliberately bypasses Qdrant and embedding resolution.`（闭合 `"""` 在 1683，登记范围取正文，非实质差异）
  - `memory_factory.py:1707-1764` = `create_memory_manager_with_diagnostics`，`_prepare_vector_collection_tag(` 在 **1752**、`QdrantVectorAdapter(` 在 **1759**，两者均落在登记区间内，**精确**
  - `unchain_adapter.py:5579-5615` = `_resolve_memory_runtime` 的 `v2_durability` 分支；实测分支自 5578 的 `if bool(getattr(memory_v2_admission, "is_active", False)):` 起、至 5614 的 `return memory_runtime, None` 止，登记区间两端各差 1 行，**指向内容无误**
  - `unchain_adapter.py:5688-5697` = `_memory_runtime_uses_durability_only`（`def` 在 5688，函数体止于 5696），**精确**
  - `unchain_adapter.py:7183-7191` = `if memory_manager is not None:` → `if memory_durability_only:` → `DurabilityModule(runtime=…)` / `else: MemoryModule(memory=…)`，**九行首尾精确**
  - `unchain_adapter.py:7684` = `memory_durability_only=_memory_runtime_uses_durability_only(`，**逐字精确**
  - `unchain_adapter.py:8731 / 8733 / 8753` = `memory_commit_allowed = False` / `if memory_manager is not None and not graph_memory_v2_admission.is_active:` / `memory_commit_allowed = True`，**三行逐字精确**；缩进实测确认 8753（20 空格）位于 8733（12 空格）的真分支内，故「**仅在非 admission 分支置真**」成立
  - `unchain_adapter.py:9485-9490` = `if (` / `memory_manager is not None` / `and final_text` / `and memory_commit_allowed` / `and not _execution_is_cancelled(execution_token)` / `):`，**六行逐字精确**
  - `route_projection.py:406-449` = `@api_blueprint.get("/memory/projection")` 起至 `return jsonify(_build_vector_payload(scroll_result))` 止，**首尾精确**；`tag = str(state.get("vector_collection_tag") …)` 与 `session_collection_name(session_id=…, collection_prefix=vector_collection_prefix(tag))` 实见于 440-444，故「读端集合名来自 `memory_factory` 的 tag」**逐行成立**
  - **计数类断言实跑**：`grep -n "memory_commit_allowed" unchain_adapter.py` → **恰 3 行：8731 / 8753 / 9488**，`grep -c` = **3**。与登记 **完全一致**（登记写 9488，正文引用写 `:9485-9490`，指同一条件式，无冲突）
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**` 同 revision 仓内文件）。属最高可复核形态 —— 断言与载体同处一个 commit，任何第三方可零成本重跑。本关全部实测为审查人亲自执行。
- **相关性**: **成立，但射程须按其自陈边界读。** 所引控制流确实共同支持「active V2 admission 下装配的是 `DurabilityModule` + `KernelMemoryRuntime`，且 V1 commit 被 `memory_commit_allowed` 显式跳过」，也确实支持「读端 `/memory/projection` 的集合名取自 `memory_factory` 的 tag」。**其自陈的未穷举项，本关代为穷举，结果为：该风险确实存在。** 实跑 `grep -rn "add_texts" --include="*.py"`（排除 `__pycache__` 与 `tests/`）→ 产品代码 **唯一写入点 `memory_factory.py:1948`**；实跑 `grep -rn "_session_collection_name"` → 产品调用者为 `memory_embeddings.py:142`、`memory_factory.py:747/1899/1906/2372/2376/2505` 与 `route_projection.py:436` 的 `getattr` 兜底。**即：确有一条不经 run 装配对象的向量写入路径存在（与 S-0071 就 E-0073 所查同一处）。** 这 **不否定 E-0072 的任何正向断言** —— 后者全部是控制流阅读，逐条为真；但它划定了射程：**由 E-0072 单独推不出「V2 生效后 V1 向量集合再无新点」这一宽命题**，该宽命题需另引证据。本条自身表述为「支持读端结论、反驳『保持现状 = 用户所见不变』」，此表述 **在射程内**。审查人不就该实体争点表态。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0074

- **阶段**: 议案庭审
- **结论**: 十三处行号引用 **全部精确**，**每一个常量值逐一实测复现**（无 `E-0056` 式的行号/常量错配），两条 grep 断言 **实际重跑并复现**；审查人另代其穷举了一条自陈未穷举的负向搜索，结果 **反向加强** 本条。当前工作树上 **仍然成立**。
- **依据**: E-0074
- **不确定性**: 两处非实质的区间取舍（见真实性段末），均不改变所指内容。本条 `完整性限制` 中「未实跑任何向量路径」为真且本关未改变 —— 审查人只验证了「后端为何恒为 `NullVectorBackend`」的前提，未跑任何嵌入或 Qdrant 路径。
- **请求/下一步**: 无补强请求。审查人代查的穷举结果（唯一后端构造 seam）可并入卷宗，供 `code-owner-runtime` 终局确认时省一步。
- **评估结论**: **已验证**
- **证据编号**: E-0074
- **来源类型**: general
- **真实性**: **通过，含全部常量逐值核对。**
  - `memory_v2_vector.py:30` = `VECTOR_PROVIDER_ENV = "PUPU_MEMORY_V2_VECTOR_PROVIDER"` ✔逐字
  - `:41` = `MAX_INDEX_ENTRIES_PER_CALL = 2` ✔**值为 2**
  - `:43-45` = `RRF_K = 60` / `LEXICAL_RRF_WEIGHT = 2.0` / `VECTOR_RRF_WEIGHT = 1.0` ✔**三值逐一吻合，行号逐行吻合**
  - `:81-87` = `if provider != "ollama":` … `configuration_error="unsupported_provider",` ✔首尾精确
  - `:88-95` = `if not model:` … `configuration_error="model_required",` ✔首尾精确
  - `:152-156` = `class VectorHit:` + `chunk_id: str` / `text_hash: str` / `score: float` ✔**恰三字段**
  - `:158-164` = `def deterministic_chunks(` … `chunk_chars: int = 2000,` (163) / `overlap_chars: int = 200,` (164) ✔**两默认值精确**
  - `:198-205` = `class NullVectorBackend:` … `def status(self) -> str: return "disabled"` ✔
  - `:231` = `if not config.enabled or config.provider != "ollama":` ✔逐字
  - `:455-480` = RRF 融合段；两处权重累加实见于 460-462（`LEXICAL_RRF_WEIGHT / (RRF_K + rank)`）与 475-477（`VECTOR_RRF_WEIGHT / (RRF_K + rank)`），**均在区间内**（区间起点 455 落在 lexical 循环体内，循环头在 453；非实质）
  - `memory_v2_unchain_read_adapter.py:488-489` = `"backend": "degraded" if result.lexical_fallback else "fts5",` / `"vector_status": "degraded",` ✔**逐字精确**
  - `route_projection.py:344-370` = `_project_vectors` 完整函数（`def` 在 344，`return coords, variance` 在 370）✔首尾精确；`np.linalg.svd(centered, full_matrices=False)` 在 353、`num_components = min(5, len(singular_values))` 在 357、`variance` 列表推导 `for i in range(5)` 在 365 —— **「每次请求对全集重拟合 SVD、取前 5 主成分、返回 variance」三点逐点复现**，且 `/memory/projection` 路由每次请求 scroll 全集后调用它，「每次请求重拟合」成立
  - `memory_embeddings.py:60-63` = `_vector_embedding_signature` 完整函数，`return f"{provider}:{model}:{int(vector_size)}"` ✔**签名格式逐字**；`:108-141` 覆盖 `previous_signature` 比对(108-111) → `new_tag = uuid4().hex[:12]`(113) → 写回(114-115)，「**换签名即换集合**」的赋值全部在区间内（旧集合删除自 142 起，紧邻区间外一行；非实质）
  - **计数/负向断言实跑**：`grep -c "store_owner\|memory_v2\|context_v2" route_projection.py` → **0**；`grep -n` 同模式 → **零行输出，exit 1**（真零命中，非过滤器假象）。`grep -rn "PUPU_MEMORY_V2_VECTOR_PROVIDER" --include="*.py" --include="*.js" --include="*.cjs" --include="*.json" .` 于仓根实跑 → **原始 16 行**：产品树 `unchain_runtime/server/memory_v2_vector.py:30` **1 行** + `unchain_runtime/server/tests/test_memory_v2_vector.py` **7 行**；`.claude/worktrees/semantic-theme-taxonomy-v2-p1/` 下镜像 **8 行**（1 产品副本 + 7 测试）。**施加登记声明的同一排除（测试、`__pycache__`、`node_modules`）后：产品代码恰 1 处（`:30` 自身常量定义），工作树副本恰 1 处** —— 与登记「另一处命中在 `.claude/worktrees/` 下」**逐字吻合，过滤器在本条上未失效**。附带确证：`.js` / `.cjs` / `.json` **零命中**，即渲染端与 Electron 侧无任何代码设置该环境变量
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**`，同 revision）。同 E-0072，属可零成本重跑的最高可核形态。
- **相关性**: **成立，且经本关补强后强于登记。** 所引常量与分支确实支持其所声称的「V2 向量层的形状事实」（provider 白名单、RRF 权重、分块参数、默认禁用、读端每请求重拟合 SVD、V1 换签名即换集合）。**其自陈「未穷举是否有绕过 `VectorConfig` 的第二条构造路径」，本关代为穷举并已闭合**：`grep -rn "OllamaQdrantBackend\|NullVectorBackend\|VectorConfig("`（排除 `tests/`、`__pycache__`）→ 产品代码 **仅 `memory_v2_vector.py:772`（`return NullVectorBackend()`）与 `:776`（`return OllamaQdrantBackend(...)`）两处构造，同处一个 `_build_backend` seam**，无第二条路径。**另作一次运行时时效验证**（读操作，只读环境变量 + 构造 dataclass）：本机 `PUPU_MEMORY_V2_VECTOR_PROVIDER` / `..._MODEL` 均 **未设置**，`VectorConfig.from_environ()` 返回 `provider=''`、`enabled=False`、`configuration_error=''` —— 即本条 `完整性限制` 所依赖的「后端恒为 `NullVectorBackend`，无可跑」这一前提 **今日实测成立**。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0076

- **阶段**: 议案庭审
- **结论**: 五处行号引用精确，但 **一项计数不符（登记 `folder` 全文 6 处，实测 9 行）**，且 **其括号内的负向断言与一处 `来源定位` 标注被审查人第一手取证直接证伪** —— `memory_v2_toolkit.py:931` 的 `Virtual folder path; never use a host filesystem path.` **确实逐字到达模型可见 schema**。依本关规则「计数不符即未验证」，本条报 **未验证**；其中仍然成立的窄事实已在下方逐条剥离保留。
- **依据**: E-0076
- **不确定性**: 被证伪的是「`folder` 一词是否到达模型」，**不是** 「`memory_upsert` 的模型可见面是否提 `folder`」—— 后者经本关实跑仍然成立。两者在本条内被合并表述，须由提出方 `expert-llm` 拆分后重排其上层推论；**审查人明确不代判该推论是否仍然成立**。
- **请求/下一步**: 请 `speaker-of-the-house` 依证据处理规则处置；若提出方补强，需要的只是把计数改正为 9 行、并把「无一处在模型可见 description 内」改为「**除 `:931` 外**无一处在模型可见 description 内」。补强责任在提出方。
- **评估结论**: **未验证**
- **证据编号**: E-0076
- **来源类型**: general
- **真实性**: **部分通过。行号引用精确，计数与负向断言不实。**

  **精确复现的部分：**
  - `:1355-1366` = `def memory_upsert(` 起至 `) -> dict[str, Any]:` 止，**十参数首尾精确**；`kind: str = "markdown",` 实测在 **1361** ✔与登记逐字吻合
  - `:1367-1372` = 被丢弃的 docstring，起于 `"""Create or revise formal chat memory with CAS protection.`、止于闭合 `"""` ✔精确
  - `:1758-1762` = `memory_upsert` 元组，description 全文 `"Create or revise formal chat memory with CAS. Use a meaningful virtual path and an indexed description; this cannot write long-term memory."` ✔**逐字**，且本关实跑确认这正是模型收到的 `description`
  - `:459-466` = `toolkit.register(_UnchainTool.from_callable(function, name=name, description=description, always_load=True))` ✔精确，「description 由元组显式提供」成立
  - `:364-365` = `if public_kind not in {"folder", "markdown", "image", "link"}:` / `raise MemoryV2ToolkitError("kind must be folder, markdown, image, or link")` ✔逐字，「在错误分支」成立
  - `grep -n "    def memory_" memory_v2_toolkit.py` → **恰 17 行** ✔与登记「17 个工具」吻合（924/974/1027/1044/1158/1187/1208/1242/1338/1355/1451/1489/1507/1553/1621/1659/1692）
  - `grep -n 'kind: str = "markdown"\|kind must be folder'` → 365 / 1048 / 1361 ✔复现
  - 负向项 `grep -n "create_folder" memory_v2_toolkit.py` → **零命中（exit 1）**，17 个工具名中亦无此名 → **「无 `memory_create_folder`」成立**

  **不实的部分：**
  1. **计数不符。** 登记 `grep -n "folder" memory_v2_toolkit.py`（**全文 6 处**）。实测 **9 行**：`82`（`_PLACEHOLDER_NAMES` 内的 `"folder"`）· `364` · `365` · `372` · `374` · `375` · **`931`** · `1578` · `1579`；`grep -c` = **9**。少登记 3 行，且 revision 未变，**属登记时即已存在的计数失实**。
  2. **负向断言被证伪。** 登记「**无一处在模型可见 description 内**」。审查人 **不依赖前批结论，独立取证**：以产品自带 bootstrap（`import unchain_adapter` 解析出 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`）构造 **真实 `Toolkit`**（`build_memory_v2_toolkit` 的 `runtime` 仅在 `:503` 作 `is None` 判断，故哨兵 `object()` 得到真件而非重建件），再调 `Toolkit.to_provider_json(provider)` dump **模型实际收到的 JSON**：

     | curator | provider | `"Virtual folder path; never use a host filesystem path."` 在模型 JSON 内 | JSON 内 `folder` 出现次数 | `enum` |
     |---|---|---|---|---|
     | False (6 工具) | openai / anthropic / gemini | **True** | 1 | 无 |
     | True (14 工具) | openai / anthropic / gemini | **True** | 1 | 无 |

     即 **六种组合全部命中**。机制经审查人在 unchain 仓亲自定位：`unchain:src/unchain/tools/tool.py:266` `_, parameter_descriptions = _parse_docstring(func)`，`:282` `description=parameter_descriptions.get(name, f"Argument {name}")` —— **`:param name:` 指令会被解析成模型可见的参数描述，占位串只是缺失时的回退**。
  3. **`来源定位` 标注被证伪。** `:924-933`（`memory_list` 的 `:param path: Virtual folder path;…`）标注为「**同样不可达模型**」，与上表直接冲突：该行是 **9 处 `folder` 中唯一一处、也是全部模型可见 JSON 中唯一一处** 到达模型的 `folder`。
  4. **区间标注不准（非实质）。** `:1751-1790` 标注为「工具名/描述全表」。实测工具表起于 `:1122` 的 `tools: list[...] = [`，中经 `:1326` / `:1336` / `:1749` 三处早退与 `:1751` 的 `tools.extend(`，终于 `:1800` 的 `return _toolkit_registry(tools)`；`1751-1790` 只覆盖 curator 扩展段且在 `memory_history` 处截断。**其负向结论（无 `memory_create_folder`）不受影响** —— 已由全文 grep 独立证实。
  5. **措辞不准（非实质）。** `:364-365` 称四个合法 kind 的「**唯一**出现处」；`"markdown"` 另见于 `:1048` 与 `:1361` 的参数默认值。作「四者并列枚举的唯一出现处」解则成立。
- **可靠性**: **内部来源**（`pupu:unchain_runtime/**` 同 revision，机制部分旁及 `unchain:src/unchain/tools/tool.py`，unchain HEAD `a4e69f4`）。**来源本身权威且可零成本重跑 —— 失效不在来源，在登记与来源的偏离**：本条正是本案已发九次的「登记的命令转录 ≠ 该命令的实际输出」模式的第十次，且再次落在负向/穷举断言上。
- **相关性**: **主张部分成立、部分被证伪，须拆分后方可引用。**

  **经本关实跑仍然成立、且仍具材料性的窄事实**（引自审查人 dump 的 `memory_upsert` 模型可见 schema 原文）：
  - `memory_upsert` 的模型可见 `description` **不含 `folder` 一词** ✔
  - 其 `kind` 参数模型可见形态为 `{"type": "string", "description": "Argument kind"}` —— **无 `enum`、无 `pattern`、无默认值**，`"markdown"` 这一默认值 **不出现在模型侧** ✔
  - `required` 仅 `path` / `description` / `expected_space_revision` 三项 ✔
  - 四个合法 kind 仅在错误分支枚举，模型只能撞错才见到 ✔
  - 不存在 `memory_create_folder` 工具 ✔

  **被证伪、不得再引用的表述**：「`folder` 一词不到达模型」「`memory_list` 的 `:param path:` 不可达模型」「全文 6 处」。

  本条声称「**与 E-0061 / S-0024 乙 合取** 得出『扁平是稳态』」—— 该合取的一条支柱（模型完全不知 `folder` 概念）已被本关第一手证伪，**该上层推论是否仍成立须由提出方 `expert-llm` 重排。审查人依中立原则不代判，也不就「该不该为 V2 造投影」「vector view 该不该保持现状」表任何态。**

---

### 执行约束自陈

- **A-012 遵守：未派生任何子 instance。** 全部 `git` / `grep` / `sed` / python harness 由本 instance 亲自执行。
- **只读。** 收工复测：PuPu `HEAD = b2385d5d`、`git status --porcelain -- src electron unchain_runtime` 为 **0 行**；unchain `HEAD = a4e69f4`、`git status --porcelain` 为 **0 行**。两仓零改动，未 commit。三次 python harness 均只读构造对象、未发任何 HTTP 请求、未触碰真实 `UNCHAIN_DATA_DIR`（指向 `tempfile.TemporaryDirectory()`，随进程销毁）。
- **审查范围。** 仅就真实性 / 可靠性 / 相关性 / 时效性作答，未对本案任何实体争点表态。
