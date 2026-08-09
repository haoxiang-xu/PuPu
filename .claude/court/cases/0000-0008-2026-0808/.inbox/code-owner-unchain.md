#### S-XXXX | ASSESSMENT | code-owner-unchain → case

- **阶段**: 议案庭审

- **结论**: **G8 已填，且它填出来的东西推翻了本案 Q4 在产品路径上的答案。** 逐条：**丙 —— `import unchain` 失败是 *harness 构造缺陷*，既非环境问题也非结构问题**；产品自带 `unchain_adapter._ensure_unchain_on_path()` 在 **零 env 配置** 下即把本机 `/Users/red/Desktop/GITRepo/unchain/src` 挂上 `sys.path`（sibling 回退，`unchain_adapter.py:67-70`），三人未实跑是因为他们直接 `import route_memory_v2` 而 **从未 import 那个 bootstrap**（E-G2）。**我已实跑 `store_owner=unchain` 的完整 HTTP 面**（E-G5），并复跑仓内既有 13 项 `test_memory_v2_unchain_read_adapter.py` 全绿。**净效果：`store_owner=unchain` 下，「新建会话（无 lifecycle）」「owner 从不存在」「owner_chat_id 为空」「被冒充的 owner id」「读作用域损坏」五种条件坍缩为 *同一条* `503 context_v2_unchain_read_unavailable`，message 逐字节相同**；legacy 那边的 `400 context_v2_invalid_request` 与 `404 context_v2_not_found` **在产品路径上根本不存在**，坏 `space_id` 落 **500 `context_v2_failed`**。**Q4「三态可判别」在产品配置下不成立**；`code-owner-shared-arteries` 的 A2（`getTree` 单次调用够用）**在产品路径上被证伪**，`code-owner-settings` 的 F2 相应 **加强**。**唯一的好消息**：真·空态（lifecycle 存在、零条目）**确实** 返回 `200 {"entries":[],"tree":[]}`（E-G5-A），这是本案第一次在产品配置下观察到 200 空态臂 —— S-0007/S-0009 指出的那个「幻影」缺口就此闭合，**但闭合结果是坏消息不是好消息**。**甲 —— E-0014 三项主张全部复核为真**，且我把它从静态比对升级为 **两侧实跑观察**（E-G3）。**乙 —— 提交方自标「纯推断、请勿采信」的那条外推 *成立*，且比其自陈更严重**：`memory_tree` 返回 folder 条目 **当且仅当 folder 被显式创建**；祖先目录 **从不自动物化**，写 `/notes/x.md` 不会产生 `/notes`。我已双臂实跑：不建 folder → **tree 退化为扁平列表**（2 条目 / 2 roots / 零嵌套），建 folder → 正常嵌套（E-G4）。**且仓内既有产品测试 `test_memory_v2_unchain_read_adapter.py` 正是按退化那一路写的**。**丁 —— `[a-z0-9_]+` 既非有意约定亦非巧合，是 try/except 收敛的架构副产物**；unchain 对 `error.code` 贡献 **零个**码，故该路径安全 —— 但 unchain **自有两套码词汇表，字符集严格更宽**（允许大写 / `.` / `:` / `-`），且它们 **今天已经在线上**（`error_code` / `last_error_code`，`/context/v2/memory/reviews` 系列，chat-bubble 已消费）（E-G6）。**戊 —— 「degraded」是占位串，不是准确描述**：PuPu 读路径上的 `WorkspaceSearchService._vector_index` **实测为 `None`**，`vector_error` 为空、`lexical_fallback` 为 `False` —— **没有任何东西处于降级；根本没接向量后端**（E-G7）。**Q2 —— 落在本边界内的只有一件，且我明确承接；那个「无主构件」不落本边界。**

- **依据**: E-G1, E-G2, E-G3, E-G4, E-G5, E-G6, E-G7, E-G8, E-0014, E-0010, E-0012, E-0037, E-0036, E-0005, E-0011, E-0018, E-0019, S-0007, S-0008, S-0014, S-0006, S-0009, S-0012, S-0016, 0000-0003-2026-0807#S-0024

- **不确定性**:

  1. **我的 harness 与真实 sidecar 之间仍有一段未覆盖**：我走 Flask `test_client`，未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发。**但与 E-0010/E-0012 有一处关键差别**：我的 `unchain` 是由 **产品自己的 bootstrap** 解析的，不是我用 `PYTHONPATH` 硬塞的（E-G2），故「`store_owner=unchain` 分支被执行」这一点是真的产品代码路径。renderer 最终观察到什么，我不主张。
  2. **我的 store 是我按仓内既有测试 fixture 建的临时 store，不是本机真实 store。** G2（`entries=0`）在本案仍未被真实数据填上 —— 我填的是「代码在真实配置下会返回什么形状」，**不是**「用户机器上真实积累的数据长什么样」。条目规模、folder 使用率、真实 `tags` / `source_refs` 分布，**一律未核实**。
  3. **lifecycle 的创建时机我只做了静态阅读**（`memory_v2_unchain_runtime_factory.py:993` 绑定在 attempt/generation 上），**未实跑一次真实 agent turn 去观察 lifecycle 何时落库**。故「新建会话必然无 lifecycle → 必然 503」这一步是 **强推断，不是观察**。该推断若错，E-G5 的严重性显著下降 —— 见「可证伪条件」F2。**该确认归 `code-owner-runtime`。**
  4. **丁 的另一半不在我边界内**：E-0037 那 42 个码全部定义在 `pupu:unchain_runtime/server/**`，是 `code-owner-runtime` 的边界。我只能确证 **unchain 对那个字段贡献为零**，以及 **unchain 自有码的字符集更宽**。「那 42 个是不是穷尽」我不主张。
  5. **戊 中「degraded 是占位串」是对当前 revision 的判断。** 我未追查该串是否为某个未落地的向量后端预留的前向兼容占位 —— 若是，则它是「尚未接上」而非「写错了」，处方不同。写下该串的是 `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:489`，**归 `code-owner-runtime`**；我只出 unchain 侧的真实状态。
  6. **本条全部结论钉在 unchain `a4e69f41` / PuPu `b2385d5d`。** `MemoryEntryKind` 自 `f3e9590`（Context Memory V2 P0）引入后 **从未被改过** —— 「稳定」在此处只等于「没有历史」，不等于「有兼容承诺」。

- **请求/下一步**:

  1. **请本庭把 E-G5 作为 Q4 的承重证据，并把 S-0004 的 Q4 结论标为「在产品配置下被推翻」。** 这不是收窄，是方向相反的结果。依证据规则，E-G2/E-G4/E-G5/E-G7 为 **须查类**（自搭 harness 的运行时观察），**请强制路由 `evidence-examiner`**。我已把完整可复跑脚本写在证据条目里，且 **审查人现在有能力实跑 `unchain` 分支了**（E-G2 给出了方法）—— 建议在任务书中明写这一点，否则审查人会重蹈前三人的覆辙。
  2. **请把「D-A 三方分歧」连同 E-G5 一并呈 `chief-judge`。** E-G5 对三方 **不是中立的**：它 **证伪** `code-owner-shared-arteries` 的 A2 在产品路径上的可判别性主张，**加强** `code-owner-settings` 的 F2，对 `code-owner-electron` 的 `memoryV2` 路线 **既不支持也不反驳**（那条不经 `getTree`）。**我不主张谁该赢** —— 落点是 CEO 的事 —— 但本庭不应在三方仍并列的前提下闭庭，因为 **其中一条的事实基础今天变了**。
  3. **请就「G10」记一笔已闭合**：S-0006 四(G10) 问「`get_tree` 对从未存在过的 owner 的行为」。**产品路径上的答案是 `503 context_v2_unchain_read_unavailable`，与停用态、与新建会话态、与冒充态同码同 message**（E-G5 案例 4/6/9）。**G10 由此闭合，但闭合方式是「不可判别」。**
  4. **请把 E-G6 转 `code-owner-runtime` 与 `code-owner-shared-arteries` 各一半**：前者答「42 个码是否穷尽、是否有成文约定」，后者答「`error_code` / `last_error_code` 这两个 **payload 字段**（非 `error.code`）今天是否被任何 renderer 解析器碰到过」。**若被碰到，E-0036 的 `[a-z0-9_]+` 假设在那条路径上今天就是错的。**
  5. **不请求本案为 unchain 侧落任何代码改动。** 本阶段只论「能不能做」，且 E-G4/E-G7 指出的两件事（folder 不自动物化、`vector_status` 占位）**都不是 unchain 库的 bug** —— 前者是刻意设计（folder 是一等条目，不是路径推导物），后者写在 PuPu 侧。**若 CEO 要 tree view 不退化成扁平列表，那是产品行为问题，不是库缺陷，处方在写侧（谁来建 folder），不在读侧。**

- **评估结论**: **有条件可行。**

  **可行的部分（我边界内，零改动）**：`store_owner=unchain` 下 `get_tree` 的读链路 **今天就是通的** —— 实跑 200，返回结构完整的嵌套树，字段集稳定，owner 隔离生效（E-G5 案例 2）。**unchain 库侧不需要为本议案改任何一行代码。** 分页、作用域校验、kind 词汇表、schema 版本全部就位。

  **条件一（硬）· tree 可能不是树。** folder 条目 **不自动创建**。tree view 在真实配置下拿到什么形状，**取决于写侧有没有人建 folder** —— 而写侧是 memory toolkit（LLM 自主调用 `upsert(kind="folder")`）。**这不是可以在读侧修的东西。** 议案若假定「tree view 会显示一棵树」，该假定 **今天没有任何机制保证**（E-G4）。

  **条件二（硬）· 空态与不可用态不可判别。** 见 E-G5。**Inspector 无法仅凭 `getTree` 区分「这个会话还没有记忆」与「V2 挂了」**，而前者是新建会话的常态。**这直接决定 tree view 的空态该显示什么 —— 而那正是本阶段被划出范围的呈现问题。** 我提请本庭注意这个交叉：**这不是一个设计取舍，是一个「可判别性不足使得任何设计都会在某一态撒谎」的技术约束。**

  **条件三（软）· 规模上限未验证。** 条目数 ≥ 10,000 时 `_workspace_entries` 抛 `PupuUnchainMemoryV2ReadError`，**该异常不是 `MemoryV2Error` 子类**，落 `_endpoint` 的裸 `except Exception` → **500 `context_v2_failed`**（E-G8）。且 unchain 侧 `_workspace_page` 每翻一页都 **全量重扫** 后再切片（`sqlite_read_v2.py:1178-1224`），`get_tree` 又是 200/页地把全部条目拉完 —— **在大 store 上是 O(n²/页大小) 的行为**。本机无真实数据，**未实测任何规模下的耗时**。

- **边界命中依据**: 传唤第三层补入（S-0006 第二节），触发条件为 `code-owner-runtime` 答复「跨仓依赖存在且在 tree 的关键路径上」。本条全部实体主张锚在 `unchain:src/unchain/memory/workspace/**`、`unchain:src/unchain/persistence/sqlite_read_v2.py`、`unchain:src/unchain/memory/curator/**`、`unchain:src/unchain/journal/models.py`，均在 `unchain:**` 内。**凡跨到 `pupu:unchain_runtime/server/**` 的（`memory_v2_unchain_read_adapter.py` 的 `_route_entry` / `vector_status` / `_MAX_LIFECYCLES`、`route_memory_v2.py` 的 `_endpoint` 与 `_read_runtime_for_store_owner`），我只作为「跨仓半边的锚点」引用，终局结论归 `code-owner-runtime`。**

- **受影响对象**:
  - `unchain:src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `:310`（`SCHEMA = "unchain.memory_entry.v1"`）
  - `unchain:src/unchain/persistence/sqlite_read_v2.py:1242-1255`（`workspace_tree`）· `:1153-1224`（`_workspace_page`，全量重扫）· `:418`（`WorkspaceSearchService(repository=workspace)` —— **不传 `vector_index`**）
  - `unchain:src/unchain/persistence/sqlite_memory_v2.py:843-902`（`list_entries`，**无 kind 过滤**）· `:1120-1240`（写路径，**无父目录存在性要求**）
  - `unchain:src/unchain/memory/workspace/service.py:367-385`（`create_folder`，folder 的 **唯一** 产生方式）
  - `unchain:src/unchain/memory/workspace/search.py:98-120, 313-322`（`VectorIndex | None`，`vector_error`）
  - `unchain:src/unchain/journal/models.py:13`（`_IDENTIFIER_RE`）· `unchain:src/unchain/memory/curator/models.py:1167` · `unchain:src/unchain/memory/curator/ports.py:23-32`（两套更宽的码字符集）
  - **跨仓半边（非本边界终局）**：`pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:357-452, 489, 532-567` · `pupu:unchain_runtime/server/route_memory_v2.py:68-106, 315-361, 1111-1120` · `pupu:unchain_runtime/server/unchain_adapter.py:56-72`

- **约束**:
  1. **只读执行，两仓零改动。** 结束时 `git -C unchain status --porcelain` = 0 行，`git -C PuPu status --porcelain -- src electron unchain_runtime` = 0 行，unchain HEAD 仍为 `a4e69f41`（E-G1）。全部临时产物在 scratchpad 与系统临时目录。
  2. **A-012 遵守：未派生任何子 instance。** 全部 grep / 读取 / 实跑由本 instance 亲自执行。
  3. **未跑 `npx jest`**；unchain 侧与 sidecar 侧一律用各自 pytest（工程铁律）。
  4. **本条不含任何视觉 / 交互设计主张。** 条件二触及「空态该显示什么」，我 **只陈述可判别性这一技术事实，不主张呈现形态** —— 呈现归方案庭审。

- **建议处置**:

  **一 · 甲 —— E-0014 跨仓半边逐条复核结果：三项全部为真，且已由推断升级为观察**

  | E-0014 的主张 | 我的复核 | 手段 |
  |---|---|---|
  | `kind` 取值来自 `unchain:models.py:251-255` 的 `MemoryEntryKind`（`folder\|markdown\|image\|link`） | **成立。** `_route_entry` 取 `entry.kind.value`，`entry.kind` 即 `MemoryEntryKind`。实跑观察到的 kind 集合 = `{folder, markdown, link}`（image 未构造） | E-G3 / E-G4 |
  | 分页来自同仓 `memory_tree` / `memory_list` | **成立。** `memory_tree` → `_reader.workspace_tree` → `_workspace_page(recursive=True)` → `SQLiteMemoryV2Store.list_entries`。`get_tree` 恒走 `recursive=True` 一路 | E-G3 |
  | 两侧返回 **不同字段集**，叶子 `kind` **除 `link` 外完全不相交** | **成立，逐字段确证** | E-G3 |

  字段集差异（两侧均为 **实测**，非静态推断）：

  | | `pupu_legacy` | `unchain` |
  |---|---|---|
  | 独有 | `created_by` · `created_at_ms` · `updated_at_ms` · `content_bytes` | `tags` · `source_refs` |
  | kind 全集 | `folder \| file \| link` | `folder \| markdown \| image \| link` |
  | **叶子** kind | `{file, link}` | `{markdown, image, link}` |
  | 叶子交集 | **`{link}`** —— E-0014 的措辞精确 | |

  **我另加一条 E-0014 未记、但对 tree view 更要害的**：两侧 `content_ref` 的 **触发条件不同**。legacy 在 `kind == "file"` 时给（并可能附 `content_bytes`）；unchain 在 `kind ∈ {markdown, image}` 时给，**且永远不给 `content_bytes`**。**即：unchain 路径上，tree view 拿不到任何条目的字节大小。** 任何「显示文件大小」的呈现在产品配置下 **无数据可用**。

  **二 · 乙 —— 那条「纯推断」外推：成立，且前提比提交方以为的更脆**

  提交方写「`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立」。**这个推理是错的** —— 枚举里有 `FOLDER` 只说明 folder 是 **可表达的**，不说明它 **被产生**。实测：

  - `SQLiteMemoryV2Store.list_entries`（`sqlite_memory_v2.py:843-902`）的 SQL **无任何 kind 过滤** → folder 条目 **只要存在就一定被返回**。
  - 写路径（`sqlite_memory_v2.py:1120-1240`）**不要求父目录存在**，**不自动创建祖先 folder**。
  - folder 的 **唯一** 产生方式是显式 `create_folder`（`service.py:367`），对外经 toolkit `upsert(kind="folder")`（`toolkit/services.py:223`）。

  **双臂实跑（E-G4）**：

  ```
  B. 只写 /notes/Architecture.md + /notes/Upstream.link，不建 folder
     entries=2  roots=2  parent_paths={'/notes'}   ← 每个条目的 parent_path 都指向一个不存在的节点
     - /notes/Architecture.md  kind=markdown  children=0
     - /notes/Upstream.link    kind=link      children=0     ← 退化为扁平列表，零嵌套

  A. 先 create_folder("/notes")，再写同样两个条目
     entries=3  roots=1  parent_paths={'/', '/notes'}
     - /notes                  kind=folder    children=2
       - /notes/Architecture.md  kind=markdown  children=0
       - /notes/Upstream.link    kind=link      children=0   ← 正常嵌套
  ```

  **结论：退化是真实分支，且是默认分支。** 更值得本庭注意的是 —— **仓内既有的产品测试正是按退化那一路写的**：`pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py` 的 `_seed_owner` 写 `/notes/Architecture-{suffix}.md` 而 **从不建 `/notes`**，并断言 `reader.memory_tree().entries == (owner_a[1],)`（单条目）。**即：本仓对该路径的唯一既有覆盖，覆盖的是扁平那一支。**

  **对议案的直接影响**：这 **不阻断** 议案（树装配算法本身正确，folder 在时嵌套正常），但它意味着 **「tree view 会呈现层级」不是一个可依赖的前提**。是否要层级，取决于 memory toolkit 的实际使用方式 —— 那是 `expert-llm` 与写侧的问题，**不在读侧可修范围内**。

  **三 · 丙 —— G8：根因、方法、以及它填出来的结果**

  **(a) 该 import 失败是环境问题还是结构问题？—— 都不是，是 harness 构造缺陷。**

  产品的 sidecar 从不依赖 `pip install unchain`。`pupu:unchain_runtime/server/unchain_adapter.py:56-72` 有一个模块级 bootstrap：

  ```python
  def _ensure_unchain_on_path() -> None:
      _source = os.environ.get("UNCHAIN_SOURCE_PATH", "").strip()
      if _source:
          ... sys.path.insert(0, <_source>/src) ...
      _project_root = str(Path(__file__).resolve().parents[2])
      _sibling = os.path.join(os.path.dirname(_project_root), "unchain", "src")
      if os.path.isdir(_sibling) and _sibling not in sys.path:
          sys.path.insert(0, _sibling)
  _ensure_unchain_on_path()
  ```

  `parents[2]` = `/Users/red/Desktop/GITRepo/PuPu` → sibling = **`/Users/red/Desktop/GITRepo/unchain/src`** —— **这台机器上该目录存在**。故 **零 env 配置** 下 `import unchain` 就能成。

  三人失败的原因是一致且机械的：他们的 harness 直接 `import route_memory_v2`，**而 `route_memory_v2` 不 import `unchain_adapter`** —— bootstrap 从未执行。实测（E-G2）：

  ```
  BEFORE: 'unchain' importable? NO -> No module named 'unchain'
  AFTER importing unchain_adapter:
    unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
    UNCHAIN_SOURCE_PATH env = ''
  ```

  **这同时闭合了我自己记忆里挂了很久的一个洞**（`unchain-evidence-must-cite-lock-revision` 末段）：「checkout 与 lock 一致 ≠ 运行时 `import unchain` 解析到这个 checkout」。**现已坐实：解析到的就是这个 checkout，且它就是 lock 钉的 revision。**

  **(b) 能不能实跑？—— 能，已跑。**

  仓内既有 13 项 `tests/test_memory_v2_unchain_read_adapter.py` 全绿（`13 passed in 0.70s`）。在此之上我实跑了 `store_owner=unchain` 的完整 HTTP 面（E-G5）。**以下是本案第一次对该分支的产品行为观察**：

  | # | 条件（`store_owner=unchain`） | 实测响应 |
  |---|---|---|
  | 1 | `listSpaces`，owner 有 lifecycle | **200**，spaces 数组含 1 个 space |
  | 2 | **`getTree`，owner 有 lifecycle + 3 条目** | **200**，`{entries, owner_chat_id, space_id, space_revision, tree}`，嵌套正确 |
  | A | **`getTree`，owner 有 lifecycle + 0 条目（真·空态）** | **200 `{"entries":[],"tree":[],…}`** ← **本案首次在产品配置下取得 200 空态臂** |
  | 3 | `getTree`，`owner_chat_id` 为空 | **503 `context_v2_unchain_read_unavailable`** ← legacy 是 400 |
  | 4 | `getTree`，owner 从未存在过 | **503 `context_v2_unchain_read_unavailable`**（**G10 的答案**） |
  | 9 | `getTree`，store 在但该 owner 无 lifecycle（**新建会话**） | **503 `context_v2_unchain_read_unavailable`** |
  | 6 | `getTree`，`owner_chat_id=character_foo__dm__main` | **503 `context_v2_unchain_read_unavailable`**（**F3**） |
  | 5 | `getTree`，`space_id` 不存在 | **500 `context_v2_failed`** ← legacy 是 404 |
  | — | `store_owner=unchain` 但 `UNCHAIN_DATA_DIR` 未设 | **503 `context_v2_unavailable`** |
  | 7 | `/context/v2/status` | **200**，含 `"store_owner": "unchain"` |
  | 8 | `/context/v2/memory/search` | **200**，`backend: "fts5"`，`vector_status: "degraded"` |

  **(c) 这个结果对本案的意义 —— 三条，请勿只引第一条：**

  1. **Q4 的答案在产品路径上是「否」。** 案例 3/4/6/9 **同码同 message 同 `retryable`**，逐字节不可分。其中 **案例 9 是新建会话的常态**（lifecycle 绑定在 attempt 上，`memory_v2_unchain_runtime_factory.py:993`，即首次 agent turn 才落库）。**用户新建一个会话就打开 Inspector —— 拿到的是与「V2 挂了」完全相同的响应。**
  2. **legacy 的 400 / 404 两臂在产品路径上不存在。** 它们由 `pupu_legacy` 的 `get_tree` 内部校验产生，而那段代码在产品配置下 **不执行**（S-0006 第一节已归档的同一个「`pupu_legacy` 幻影」）。**E-0010 的三态实测，其中两臂的错误语义在产品路径上是别的东西。**
  3. **好消息只有一条**：真·空态确实 200 且 `tree: []`。**故「有 lifecycle 的会话」的空/非空是可判别的；不可判别的是「还没有 lifecycle」与「不可用」。**

  **四 · 丁 —— `[a-z0-9_]+`：既非约定亦非巧合**

  **审查人 S-0014 把该字符集判为「本探针零覆盖」并转给我，方向正确，但落点需要再挪一格。** 逐条：

  1. **unchain 对 `error.code` 贡献的码数量 = 0。** `route_memory_v2._endpoint`（`:68-106`）的 `except Exception` 把 **一切非 `MemoryV2Error`** 拍平成字面量 `context_v2_failed`。我实测确认 `PupuUnchainMemoryV2ReadError` 的 MRO 为 `[…, RuntimeError, Exception, …]`，**不是 `MemoryV2Error` 子类**。unchain 的 `RepositoryScopeError` / `ModelValidationError` / `SQLiteContextV2ReadError` 同理，**没有任何一个的名字或码能到达 `error.code`**（E-G6）。
  2. **所以字符集成立，但成立方式是「收敛」不是「约定」。** 没有任何跨仓协议、注释或测试表达过这条规则；它由一个 **谁都不会当成词汇表守卫的异常处理器** 结构性地强制着。**「有意的约定」与「巧合」这个二分法在这里不适用 —— 正确的说法是架构副产物。** 其脆弱性也因此不在「有人加了个新码」，而在 **有人改了那个 `except Exception` 的拍平行为**。
  3. **unchain 自有的码字符集严格更宽，且已在线上。** 实测：

     ```
     unchain _IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/   (journal/models.py:13)
       'curator.timeout'  → unchain 合法, [a-z0-9_]+ 不匹配
       'Curator-Failed'   → unchain 合法, [a-z0-9_]+ 不匹配
       'runner:aborted'   → unchain 合法, [a-z0-9_]+ 不匹配
     CurationRepositoryError.code 正规化 = re.sub(r"[^a-z0-9_:-]+","_", casefold())  (curator/ports.py:23-32)
       → 仍允许 ':' 与 '-'
     ```

     **且这些码今天已经在线上，只是走的是别的字段**：`memory_v2_unchain_curator_query.py:129` 的 `"error_code"` 与 `:179` 的 `"last_error_code"`，由 `/context/v2/memory/reviews` 与 candidates 系列路由送出 —— **而 `pupu:src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js` 今天就在消费该面（E-0005）。**

  **净答复**：对 `parseContextV2ErrorCode` 走的那条路（`error.code`），**下一个新码不会静默失效，因为不存在「来自我这侧的新码」**。真正的风险 **已经存在但被 E-0036/E-0037 的取样范围错过了**：`error_code` / `last_error_code` 是 payload 字段，携带 unchain 更宽字符集的码。**若哪天有人把它们喂进同一个 `[a-z0-9_]+` 解析器，那一刻就静默落 `null`。** 这正是审查人担心的失效模式，只是发生在另一个字段上。**请转 `code-owner-shared-arteries` 核实该面今天有无解析器。**

  **五 · 戊 —— V2 向量后端在 unchain 侧的真实状态**

  **答：不是「degraded」。是「根本没接」。** `"degraded"` 是硬编码占位串。

  实测（E-G7，同一 harness、同一 reader 实例）：

  ```
  WorkspaceSearchService._vector_index          = None
  raw WorkspaceSearchResult.vector_error        = ''        ← 空：没有任何失败
  raw WorkspaceSearchResult.lexical_fallback    = False     ← fts5 工作正常
  route search_entries → backend                = 'fts5'    ← 真实计算得出
  route search_entries → vector_status          = 'degraded' ← 常量
  ```

  结构性依据：`unchain:src/unchain/persistence/sqlite_read_v2.py:418` 构造 `WorkspaceSearchService(repository=workspace)` —— **不传 `vector_index`**，而该参数默认 `None`（`search.py:135`）。PuPu 的读适配器拿到的 reader 全部经这条路，**故 `_vector_index` 在该路径上恒为 `None`，不是配置问题，是接线问题**。unchain 侧 **确实支持** 向量（`VectorIndex` Protocol、`sqlite_long_term_memory_v2.py:104-106` 就传了），**只是 PuPu 的 Context V2 读路径没接**。

  **本庭请注意同一响应里的词汇不一致**：`backend` 字段用 `"degraded"` 表示「lexical 索引不可用、退化到全扫」（真实计算，`memory_v2_unchain_read_adapter.py:485`），`vector_status` 字段也用 `"degraded"` 但是常量。**同一个词在相邻两个字段里含义不同，其中一个还是假的。** 我另记一处同源的词汇碰撞：`matched_by` 里的 `'lexical_fallback'` 是 **评分通道名**（`search.py:264`，0.55 权重的 token 匹配），与 **结果级布尔** `WorkspaceSearchResult.lexical_fallback` 同名而不同义 —— 实测出现 `matched_by=['lexical_fallback','fts']` 而 `lexical_fallback=False` 的组合。**任何据这两个名字判断检索健康度的收端都会读错。**

  与 S-0009 二(3) 的关系：本庭登记的「产品路径上它的自述状态是 `degraded` 不是 `disabled`」**事实层面成立**，但 **含义层面须更正** —— 它不表示「有向量后端且已降级」，而表示「这个字段没有被实现」。**Q3「vector view 保持现状」的前提因此不仅成立，而且比 S-0004 说的更彻底：unchain 读路径上不存在任何向量数据，连 `VectorHit` 那种 `(chunk_id, text_hash, score)` 都没有 —— 没有索引对象。**

  **六 · Q2（G1）· 强制表态**

  **本案若推进，是否会要求我的边界承担一个今天不属于我的判定职责？**

  **一件会，且我明确承接；那个「多方需要、今天没有 owner」的构件不会落到我这里。** 分开说：

  **(1) 会落到我边界的一件 —— 跨仓读契约的稳定性判定。** tree view 一旦成为 `getTree` 的第一个真实消费者，`MemoryEntryKind` 与 `_route_entry` 的字段集就从「内部实现」变成 **有 UI 依赖的事实契约**。今天没有任何机制表达这件事：`MemoryEntryKind` 有 `SCHEMA = "unchain.memory_entry.v1"`，但 **`unchain-core.lock.json` 只钉 revision，不钉 schema**；PuPu 侧也没有任何测试断言过 kind 词汇表。**我承接这条**：本边界内新增 kind 或改字段集时，负责发起双边 impact。**代价我如实计价**：这是 charter 里「双边 impact 强制」已有的义务，**不需要新构件、不需要新 owner、不需要 CEO 拍板**。

  **(2) 不落在本边界的 —— 「单一状态源 / 谁是权威状态源」（前案 D7 / D8，本案 D-A）。** 明确写「**不落在本边界**」。理由不是我不想接，是 **结构上接不了**：该判定要在 renderer 里综合 `enable_memory_v2`（build flag）、`storeOwner`（Electron 决议）、sidecar 就绪态、以及 V2 读的返回 —— **四个输入里有三个在 unchain 库之外，而库这一侧对 PuPu 的 rollout / feature flag / IPC 一无所知，也不应该知道。** 让库承担这个判定就是让依赖倒挂。

  **谁能判断 —— 我指名，并给出本案新增的依据**：**这个落点判断本身归 `chief-judge`**（D7/D8 已两案未决，`expert-architecture` 明言「传唤机制解不了它，只有指派能解」）。但 **E-G5 收窄了可选项**：既然 `getTree` 在产品路径上 **无法** 区分「新会话」与「不可用」，**任何把状态判定放在 `getTree` 返回上的方案（含 `code-owner-shared-arteries` 的 A2）在产品配置下都会误报**。**故这个构件不能只读 `getTree`** —— 它必须至少多读一个源。**在 `code-owner-electron` 的 `unchainAPI.getStatus().memoryV2` 与 `code-owner-settings` 的 `contextV2Bridge.getStatus()` 之间怎么选，我不表态**（两者都在我边界外，且我未实跑 Electron 面）；**我只出一条硬约束：单靠 `getTree` 不够，这一点现在有实测证据了。**

  **(3) G1（前案裁定未到达）是否构成本案前置阻塞？** **对我这一侧不构成。** 前案 16 项强制回应无一落在 `unchain:**`；我上面全部结论不依赖前案任何一条 `ASSESSMENT`。**但我不主张对全案不构成阻塞** —— D-A 的落点悬而未决，而 E-G5 刚改变了它的事实基础，**是否阻塞归 `chief-judge`**。

  **七 · 可证伪形式（本条在什么条件下翻转）**

  | # | 结论 | 翻转条件 |
  |---|---|---|
  | **F1** | 甲：两侧字段集/kind 词汇表如上 | `MemoryEntryKind` 增删成员，或 `_route_entry` 改字段集。**检测**：`unchain:models.py:251-255` 与 `pupu:memory_v2_unchain_read_adapter.py:532-567` 任一变更即须重跑 E-G3 |
  | **F2** | 丙：新建会话必然 503（不可判别） | **若 lifecycle 实际在建会话时（而非首次 agent turn 时）即落库**，则新建会话直接落 200 空态臂，不可判别性大幅缩小。**我只做了静态阅读（`memory_v2_unchain_runtime_factory.py:993`），未实跑真实 turn** —— 这是本条最脆的一环，**归 `code-owner-runtime` 实测**。**若 F2 被推翻，条件二降级为软条件，D-A 的紧迫性下降。** |
  | **F3** | 丙：五种条件同码不可分 | `route_memory_v2._read_runtime_for_store_owner:355-361` 若把 `PupuUnchainMemoryV2ReadError` 按成因分码（该异常今天带不同 message，**信息在，只是被压成一个码**），则可判别性立即恢复。**这是一条低成本修复路径，我主动指出，但它在 `code-owner-runtime` 边界，不在我这里** |
  | **F4** | 乙：tree 可能退化为扁平 | 若写侧引入「自动创建祖先 folder」或 toolkit 强制先建目录，则退化消失。**检测**：`unchain:sqlite_memory_v2.py` 写路径出现父目录物化逻辑，或 `memory/toolkit/` 出现 mkdir 语义 |
  | **F5** | 戊：无向量后端 | `unchain:sqlite_read_v2.py:418` 若开始传 `vector_index=`，则 unchain 读路径有真向量，`"degraded"` 从占位串变成可能真实的状态。**检测**：该行签名变更 |
  | **F6** | 丁：unchain 对 `error.code` 贡献为零 | `route_memory_v2._endpoint:98-104` 的 `except Exception` 若改为透传底层异常的码，unchain 的宽字符集立刻进入 `error.code`，**E-0036 的解析在那一刻起会静默落 `null`** |
  | **F7** | 全部实测结论 | 我的 harness 与真实 sidecar 的差异（`test_client` vs 真进程 / 临时 store vs 真实 store）若在某处实质化。**推翻方式**：起真实 sidecar 重跑同样 11 个请求 |
  | **F8** | 「零改动」 | lock revision 与 unchain `dev` 分叉。**今天二者仍相等**（均 `a4e69f41`，工作树干净，E-G1），**但前案 R4 记的「此巧合不可依赖」依然有效** —— 任一侧推进即须重核 |

---

### E-G1 | repository | 自证类
- **来源定位**: unchain `a4e69f413c449c5768433ba4dddc5b60b8146991`（branch `dev`）· PuPu `b2385d5d`（branch `dev`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/unchain-core.lock.json`
- **取得方式**（完整可复跑）:
  ```bash
  git -C /Users/red/Desktop/GITRepo/unchain rev-parse HEAD
  git -C /Users/red/Desktop/GITRepo/unchain status --porcelain | wc -l
  cat /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/unchain-core.lock.json
  ```
  **实际输出**:
  ```
  a4e69f413c449c5768433ba4dddc5b60b8146991
         0
  {"repository":"unchain","revision":"a4e69f413c449c5768433ba4dddc5b60b8146991","context_memory_contract":1}
  ```
- **支持/反驳**: **支持** 本条全部 unchain 侧锚点的 revision 固定；**核实并确认** 前案 `0000-0003-2026-0807#S-0024` R4 所记风险在本案 revision 上 **仍然成立**（lock 与 `dev` HEAD 恰好相等，工作树干净 —— 巧合延续，非机制）；**支持** E-0001 所载 unchain `a4e69f4`
- **完整性限制**: lock 只钉 revision，**不钉 schema 版本，也不钉任何 kind 词汇表**。故「lock 一致」只保证字节一致，不构成任何契约承诺。**未核实** shipped 安装包内的 unchain 是否也是该 revision（本机只有 dev checkout）
- **证据类型判据**: 仓内文件字面内容与 git 元数据，任何人可在同一 revision 直接复核 → 自证类

### E-G2 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`，工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`，2026-08-08。关键产品源：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py:56-72`
- **取得方式**（**完整可复跑，注意 `env -u` 是本条的要害** —— 它证明不依赖任何 env）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 - <<'EOF'
  import sys, os
  print("BEFORE: 'unchain' importable?", end=" ")
  try:
      import unchain; print("YES")
  except ModuleNotFoundError as e: print("NO ->", e)
  sys.path.insert(0, ".")
  import unchain_adapter          # <- 产品自己的 bootstrap，唯一动作
  import unchain
  print("AFTER importing unchain_adapter:")
  print("  unchain.__file__ =", unchain.__file__)
  from unchain.journal import ArtifactRef, EventCursor, ResourceRef
  print("  unchain.journal OK")
  print("  UNCHAIN_SOURCE_PATH env =", repr(os.environ.get("UNCHAIN_SOURCE_PATH","")))
  EOF
  ```
  **实际输出**:
  ```
  BEFORE: 'unchain' importable? NO -> No module named 'unchain'
  AFTER importing unchain_adapter:
    unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
    unchain.journal OK
    UNCHAIN_SOURCE_PATH env = ''
  ```
  另实跑仓内既有产品测试（**非我编写**）：
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && \
    PYTHONPATH=.:/Users/red/Desktop/GITRepo/unchain/src python3 -m pytest \
    tests/test_memory_v2_unchain_read_adapter.py -q --no-header -p no:cacheprovider
  # -> 13 passed in 0.70s
  ```
- **支持/反驳**: **推翻 G8 的成因定性** —— S-0004 / S-0007 / S-0008 三方将 `ModuleNotFoundError` 归因为「我的环境缺陷」，**实为 harness 未 import 产品 bootstrap**；**支持** 本条丙(a)；**为本案后续一切 `store_owner=unchain` 取证提供方法**；**闭合** 我方记忆 `unchain-evidence-must-cite-lock-revision` 末段挂起的「运行时解析目标未核实」一项
- **完整性限制**: **(1)** sibling 回退成立 **依赖本机目录布局**（PuPu 与 unchain 为兄弟目录）。CEO 已预告路径会变；**在别的布局下 `UNCHAIN_SOURCE_PATH` 是必需的**，本条不主张普适性。**(2)** 未验证 shipped（`app.isPackaged`）路径下 unchain 如何解析 —— `service.js:4734` 显示打包态 `devUnchainSourcePath` 为 `null`，**打包态的解析方式我未核实，归 `code-owner-electron`**。**(3)** 本条只证明 import 可成，不证明由此得到的行为等同真实 sidecar 进程
- **证据类型判据**: 我编写并执行的运行时观察（含一条既有测试的运行）→ **须查类**，依证据规则第三节 **无需质疑即强制审查**

### E-G3 | repository | 自证类
- **来源定位**: unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `:310`（`SCHEMA`）‖ PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:532-567`（`_route_entry`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:6641-6669`（legacy `_entry_response`）· `:6680,6688,6696`（legacy kind 校验三分支 `folder`/`file`/`link`）
- **取得方式**: 两侧函数全文定点读取并逐字段比对；`grep -rn "class .*EntryKind" -A 12 --include="*.py" src/`（unchain 仓）；`grep -n "kind ==" memory_v2_store.py`。**字段集另经 E-G4/E-G5 实跑交叉确认**（非纯静态）
- **支持/反驳**: **复核并证实** E-0014 的三项主张全部为真；**新增** E-0014 未记的一条 —— `content_bytes` 在 unchain 路径上 **永不出现**，故「显示条目大小」在产品配置下无数据
- **完整性限制**: legacy 侧的字段集我 **只做静态阅读，未实跑 `pupu_legacy` 分支**（E-0010/E-0012 已实跑过该分支的其他端点，但未登记 `_entry_response` 的完整字段集）。故「两侧差异」中 **unchain 半边是观察，legacy 半边是静态读取**。`image` kind 我 **未构造实例**，其字段集按 `_route_entry:565-566` 的分支推断（与 `markdown` 同走 `content_ref` 分支）
- **证据类型判据**: 两仓内文件的字面内容与行号，可在给定 revision 直接复核 → 自证类

### E-G4 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`。脚本 `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/g8_tree.py`（自包含，仅写系统临时目录）。相关产品源：`unchain:sqlite_memory_v2.py:843-902`（`list_entries`，无 kind 过滤）· `unchain:sqlite_memory_v2.py:1120-1240`（写路径，无父目录要求）· `unchain:memory/workspace/service.py:367-385`（`create_folder`）· `unchain:sqlite_read_v2.py:1242-1255`（`workspace_tree`）
- **取得方式**: `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 g8_tree.py`。harness 复用仓内既有测试 fixture 的建库序列（取自 `pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py:54-215` 的 `_seed_owner` / `_seed`），两臂唯一差异是 `make_folders` 布尔。**实际输出**:
  ```
  ===== B. NO folder entry created =====
    entries: 2   roots: 2   kinds: ['link','markdown']   parent_paths: ['/notes']
      - /notes/Architecture.md  kind=markdown  children=0
      - /notes/Upstream.link    kind=link      children=0
  ===== A. folder entry created =====
    entries: 3   roots: 1   kinds: ['folder','link','markdown']  parent_paths: ['/','/notes']
      - /notes                    kind=folder    children=2
        - /notes/Architecture.md  kind=markdown  children=0
        - /notes/Upstream.link    kind=link      children=0
  ```
- **支持/反驳**: **证实** E-0014 完整性限制 (3) 那条提交方自标「纯推断、请勿采信」的外推 —— **前提确实可能不成立，退化确实发生**；**反驳** 其「`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立」的推理（枚举可表达 ≠ 实例被产生）；**支持** 本条评估结论的条件一
- **完整性限制**: **(1)** folder 的创建与否由我构造，**不是对真实用户数据中 folder 使用率的观察** —— 我证明的是「两种形状都可达」，**不是**「真实数据里是哪一种」。后者受 G2 阻断，本案无法取证。**(2)** 未构造 `image` kind。**(3)** 临时 store，非本机真实 store。**(4)** 仓内既有测试按扁平那一路写（`_seed_owner` 写 `/notes/X.md` 而不建 `/notes`，并断言单条目）这一观察为静态阅读 + 该测试实跑通过，**非我对其意图的主张**
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**

### E-G5 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`。脚本 `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/g8_http.py`（依赖同目录 `g8_tree.py`）+ 一段 inline heredoc（空态臂 A/B）。产品源：`route_memory_v2.py:68-106`（`_endpoint`）· `:315-361`（`_read_runtime_for_store_owner`）· `:1111-1120`（tree 路由）· `memory_v2_unchain_read_adapter.py:570-640`（`open_pupu_unchain_memory_v2_reader` 的六道前置门）
- **取得方式**: `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH -u PUPU_CONTEXT_V2_STORE_OWNER python3 g8_http.py`。harness 与 E-0010 同构（Flask `test_client` + `routes` 替身），**但两处关键不同**：**(a)** 先 `import g8_tree` → 触发产品 bootstrap，故 `import unchain` 成功，`store_owner=unchain` 分支 **真正执行**；**(b)** `UNCHAIN_DATA_DIR` 指向我按仓内 fixture 建好的 unchain-owned store。**实际输出见「建议处置」三(b) 的 11 行表**，其中承重三行逐字：
  ```
  2. TREE owner=chat-a, 3 条目   -> 200 {"entries":[{…"kind":"folder"…},…],"tree":[…],"space_revision":…}
  A. TREE owner=chat-e, 0 条目   -> 200 {"entries": [], "owner_chat_id": "chat-e", "space_id": "space-e", "space_revision": 1, "tree": []}
  3/4/6/9 四种不同条件         -> 503 {"error":{"code":"context_v2_unchain_read_unavailable","message":"Unchain-owned Context V2 read scope is unavailable","retryable":true}}   ← 四者逐字节相同
  5. TREE space_id 不存在        -> 500 {"error":{"code":"context_v2_failed","message":"Context V2 request failed"}}
  ```
  **确定性**：完整脚本连跑两次，全部 status code 与 error code 逐字节恒同（`space_id` / `entry_id` 等随机值除外）
- **支持/反驳**: **填补 G8**（本案第一次实跑 `store_owner=unchain`）；**闭合 G10**（答案为「与停用态同码不可分」）；**推翻** S-0004 Q4「三态在 API 层完全可判别」**在产品配置下** 的成立；**修正** S-0007/S-0009 所指「200 空态臂只在 `pupu_legacy` 取得」——该臂现已在产品配置下取得（案例 A），**但同时暴露一个更严重的坍缩**；**证伪** `code-owner-shared-arteries` A2「`getTree` 单独一次调用就够」在产品路径上的可判别性；**加强** `code-owner-settings` F2；**支持** F3 的关切但结果相反（冒充 owner 不返回错数据，而是 503）
- **完整性限制**: **(1)** Flask `test_client`，**未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发** —— 对 renderer 最终观察到什么不作主张。**(2)** `routes._is_authorized` / `_json_error` 为替身（形状取自 `tests/test_route_memory_v2.py:31-38`）；**但依 S-0007 已证的同一判据，本条全部响应带 `retryable` 或经 `_endpoint` 的 `_json_error` 500 路径** —— 500 那一行 **确由替身塑形**，其 `code` 字面量 `context_v2_failed` 取自 `route_memory_v2.py:100` 产品源，形状与真实 `route_auth._json_error` 等价（S-0007 已核）。**(3)** store 为我按仓内 fixture 新建的临时 store，**非本机真实 store**；条目为我构造。**(4)** 「新建会话必然无 lifecycle」是 **静态推断**（见不确定性 3 与 F2），本条 **只观察到「无 lifecycle → 503」**，未观察「新建会话 → 无 lifecycle」。**(5)** `rollout_mode` 在我的 env 下为 `off`，与真实 `npm start`（`PUPU_MEMORY_V2_MODE=all`）不同；该差异 **不影响** tree 路由（store owner 门与 rollout 门是两道，tree 不过 capability 门，E-0013 已证），但 **影响 status 端点的字段值**
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**。**本条是本发言最承重的一条，建议优先审查**

### E-G6 | repository | 自证类
- **来源定位**: unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/journal/models.py:13`（`_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")`）· `:234` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/curator/models.py:1167` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/curator/ports.py:23-32` ‖ PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:68-106`（`_endpoint`，`:98-104` 的 `except Exception` → `context_v2_failed`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:65`（`class PupuUnchainMemoryV2ReadError(RuntimeError)`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_curator_query.py:129, 179`
- **取得方式**: 定点读取；`grep -rhn "^class .*Error" --include="*.py" src/unchain/memory/ src/unchain/persistence/`；MRO 与字符集实跑：
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && PYTHONPATH=.:/Users/red/Desktop/GITRepo/unchain/src python3 -c "
  from memory_v2_unchain_read_adapter import PupuUnchainMemoryV2ReadError as E
  import route_memory_v2 as R
  print('MRO:', [c.__name__ for c in E.__mro__]); print('subclass of MemoryV2Error?', issubclass(E, R.MemoryV2Error))"
  # -> MRO: ['PupuUnchainMemoryV2ReadError','RuntimeError','Exception','BaseException','object']
  # -> subclass of MemoryV2Error? False
  cd /Users/red/Desktop/GITRepo/unchain && PYTHONPATH=src python3 -c "
  from unchain.journal.models import _IDENTIFIER_RE
  import re; narrow=re.compile(r'^[a-z0-9_]+\$')
  for s in ['curator.timeout','Curator-Failed','runner:aborted','curation_repository_error','MEMORY_V2']:
      print(f'{s:28s} unchain_ok={bool(_IDENTIFIER_RE.fullmatch(s))} narrow_ok={bool(narrow.fullmatch(s))}')"
  # -> curator.timeout  unchain_ok=True narrow_ok=False   (Curator-Failed / runner:aborted 同)
  ```
- **支持/反驳**: **回答** S-0014 转来的确认请求（E-0037 的 `[a-z0-9_]+` 是约定还是巧合）—— **两者皆非，是 try/except 收敛的架构副产物**；**部分支持** E-0036/E-0037 的结论（该字符集在 `error.code` 上今天确实成立）；**同时指出其取样错过的真实风险面**（`error_code` / `last_error_code` payload 字段已携带更宽字符集的 unchain 码，且 chat-bubble 今天就在消费该路由面，E-0005）
- **完整性限制**: **(1)** 「unchain 对 `error.code` 贡献为零」依据的是 `_endpoint` 的两个 except 分支的静态阅读 + `PupuUnchainMemoryV2ReadError` 的 MRO 实测，**未穷举 unchain 全部异常类逐一验证其非 `MemoryV2Error` 子类** —— 但 `MemoryV2Error` 定义在 PuPu 侧，unchain 不 import PuPu，**结构上不可能有 unchain 类继承它**。**(2)** E-0037 那 42 个码是否穷尽，**不在我边界，我不主张**。**(3)** 我 **未实测** 任何真实的 curator 失败码经 `/context/v2/memory/reviews` 送到 renderer —— 只证明字段在路由响应构造里、且其值域字符集更宽。**该端到端观察未做**
- **证据类型判据**: 两仓内文件字面内容 + 对纯函数/类型系统的确定性探针（无外部状态、无 I/O）→ 自证类。**但探针部分若本庭认为属运行时观察，我不反对改判须查类**

### E-G7 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`，harness 同 E-G4（`g8_tree.py` 的 `build()`）+ inline 探针。产品源：`unchain:src/unchain/persistence/sqlite_read_v2.py:418`（`WorkspaceSearchService(repository=workspace)` —— **无 `vector_index` 实参**）· `unchain:src/unchain/memory/workspace/search.py:128-149`（`vector_index: VectorIndex | None = None`）· `:264`（评分通道名 `lexical_fallback`）· `:313-322`（`vector_error` 仅在 `_vector_index is not None` 时可能非空）· `:114-120`（`WorkspaceSearchResult`）‖ PuPu 侧硬编码点 `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:485`（`backend`，真实计算）· `:489`（`vector_status`，常量）
- **取得方式**: 在 E-G4 的 reader 实例上直接探测内部状态并对比路由输出（**同一实例、同一次查询**，排除两者不同源的可能）。**实际输出**:
  ```
  WorkspaceSearchService._vector_index          = None
  raw WorkspaceSearchResult.vector_error        = ''
  raw WorkspaceSearchResult.lexical_fallback    = False
  raw hits matched_by                           = [['lexical_fallback','fts'], …]
  route search_entries keys                     = ['backend','owner_chat_id','query','results','vector_status']
  route backend                                 = 'fts5'
  route vector_status                           = 'degraded'
  ```
  另经 E-G5 案例 8 在 **完整 HTTP 路径** 上复现同样两个字段值
- **支持/反驳**: **回答** 戊 —— unchain 读路径上 **不存在向量索引对象**，`"degraded"` 是占位串不是状态描述；**支持并强化** S-0009 二(3) 的事实登记，**但更正其含义**；**支持** Q3「vector view 保持现状」的前提（比 S-0004 的结论更彻底：不是「向量后端关着」，是「读路径没接向量后端」）；**新增** 一条词汇碰撞（`matched_by` 的 `'lexical_fallback'` vs 结果级 `lexical_fallback`，实测同时出现 `['lexical_fallback','fts']` 与 `lexical_fallback=False`）
- **完整性限制**: **(1)** 只覆盖经 `SQLiteContextV2ReadService` 的 **读** 路径（即 PuPu Context V2 的路径）。unchain **另有** 一条确实传 `vector_index` 的路径（`sqlite_long_term_memory_v2.py:104-106, 176`），**本条不否认 unchain 支持向量**，只主张 PuPu 这条读路径没接。**(2)** 探测 `_vector_index` 用了私有属性，**属实现细节**；若该字段改名，探针失效但结论不必然变 —— 更稳的判据是 `sqlite_read_v2.py:418` 的构造实参。**(3)** 未核实 `"degraded"` 是否为某个未落地后端预留的前向占位（见不确定性 5）。**(4)** 临时 store
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**

### E-G8 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:48`（`_MAX_LIFECYCLES = 10_000`）· `:363-390`（`_workspace_entries`，`while len(entries) < _MAX_LIFECYCLES`，超限抛 `PupuUnchainMemoryV2ReadError("workspace listing exceeds the P0 route limit")`）· `:65`（该异常继承 `RuntimeError`）· `route_memory_v2.py:98-104`（裸 `except Exception` → 500）· `:355-361`（`PupuUnchainMemoryV2ReadError` 的 catch **只包住 `open_…reader`，不包住 `get_tree` 调用本身**，见 `:1114-1119`）‖ unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:53-55`（`_MAX_LIST_RESULTS=200` / `_MAX_LIST_SCAN=10_000` / `_SCAN_PAGE_SIZE=200`）· `:1178-1224`（`_workspace_page`：每次调用 **全量扫描后排序再切片**）· `:1202-1205`（超扫描界抛 `SQLiteContextV2ReadError`）
- **取得方式**: 定点读取五处；异常层级由 E-G6 的 MRO 实测确认；catch 作用域由 `route_memory_v2.py:1111-1120` 的缩进结构直接读出
- **支持/反驳**: **支持** 本条评估结论的条件三；**新增** 一条本案无人提出的规模风险 —— tree view 是唯一会「一次拉完整个 store」的消费者，而该路径的失败模式是 **500 无语义码**
- **完整性限制**: **纯静态阅读，未构造 >10,000 条目的 store，未实测任何规模下的耗时或实际失败。** 「O(n²/页大小)」是对 `_workspace_page` 每页全扫这一结构的复杂度推断，**不是性能测量**。真实 store 的条目规模未知（G2）。**该风险是否现实，取决于真实数据规模 —— 本案无法取证**
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类。**其中标注为「推断」的复杂度与「未实测」的规模失败，不具此地位，不得作为事实引用**
