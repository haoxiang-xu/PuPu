#### S-XXXX | ASSESSMENT | code-owner-runtime → case
- **阶段**: 议案庭审
- **结论**: **有条件可行。** 服务端半边的四个待答问题全部实跑取得结论：Q4 三态在 API 层 **完全可判别**（200 / 503 / 400，错误码互不重叠，实测见 E-A4）；Q3 书记员自查 **成立**（V1 投影与 V2 store 是两个零共享子系统，V2 侧确无任何坐标生成逻辑，E-A1/E-A2/E-A3）；Q1 **不成立于默认配置** —— 本庭未看到的门确实存在，且不止一道：`electron/main/services/unchain/memory_v2_rollout.js:150` 使 `PUPU_CONTEXT_V2_STORE_OWNER` **只可能是 `off` 或 `unchain`，永不为 `pupu_legacy`**，而 shipped build 把它冻结为 `off`（E-A5）。**净效果：E-0006 所锚定的 `memory_v2_store.py:7408` 这一段 `get_tree`，在两种真实配置下都不是被执行的实现** —— 这是对本庭「已知事实 2」的一条实质更正。Q2 我 **部分承担**：判据归我，判定不归我
- **依据**: E-0006, E-0002, E-A1, E-A2, E-A3, E-A4, E-A5, E-A6, E-A7, E-A8, 0000-0003-2026-0807#S-0024
- **不确定性**:

  **一 · 我实跑不到的那一半（诚实标注，不掩盖）**

  我的执行环境 **无法 import `unchain` 包**（`ModuleNotFoundError: No module named 'unchain'`，仓根 `.venv` 同样不可导入，E-A4 尾注）。因此 `store_owner=unchain`（即今天 `npm start` 的实际取值）下的 `get_tree` **我未能实跑**，我的探针在该分支上返回的 `context_v2_unchain_read_unavailable` 是 **我环境的 ImportError**，不是产品行为，**不得当作产品结论引用**。该分支的行为我只做了 **静态代码比对**，结论按推断标注。

  **二 · G2 继承的空洞**

  本机 V2 store `entries=0`。我的取证靠 **临时目录内新建 store + 手工 `ensure_space`** 绕过，因此我能给出「空 store / 空 space」的真实返回，但 **「有数据时 tree 的嵌套形状」仍未取证**，凡涉及正常态一律标推断。

  **三 · R1 纪律标注（`0000-0003-2026-0807#S-0024` R1）**

  下列结论 **全部以「今天的 store owner 行为」为据，owner 切换当天需全部重核**：Q1 的默认配置结论、Q4 的 (b) 分支、可证伪条件 3 与 4、以及下方「两套实现返回形状不同」的全部内容。

- **请求/下一步**:
  1. 请本庭把「E-0006 的 store 段锚点在真实配置下不执行」记入更正，并要求 **方案庭审的验收对象改以 `memory_v2_unchain_read_adapter.py:432` 为准**，否则验收会验到死代码（E-A5、E-A8）
  2. **请求补行传唤 `code-owner-unchain`**：S-0003 第三节明写该判定「挂在 `code-owner-runtime` 的答复上」。我的答复是 —— **跨仓依赖存在且在 tree 的关键路径上**。`store_owner=unchain` 时 `get_tree` 的条目 `kind` 取值来自 `unchain:src/unchain/memory/workspace/models.py:251-255` 的 `MemoryEntryKind`，分页来自同仓 `memory_tree`/`memory_list`（E-A8）。tree view 的节点类型判定 **直接消费该枚举**
  3. 请本庭就「`store_owner=off` 是否必须能被一个 200 响应读出」列为显式选项（见 Q2 表态），这是唯一可能落到我边界的新构件
  4. **不请求** 在本阶段解决 `ownerChatId` 疑点 —— 服务端只认 query 参数 `owner_chat_id`，非空即可（E-A4 c 行），这一疑点整段在 renderer/preload/main 侧

- **评估结论**:

  ### Q1 · 管线完整性的服务端半边 —— **代码完整，默认配置下不可用**

  **(1) 服务端读路径的完整门清单**（我端全部的门，本庭可据此判定无遗漏）：

  | # | 门 | 位置 | 对 `get_tree` 是否生效 |
  |---|---|---|---|
  | 1 | 鉴权 token | `route_memory_v2.py:72-73` → 401 | **生效** |
  | 2 | 请求体 48MB 上限 | `route_memory_v2.py:74-80` → 413 | GET 无体，不触发 |
  | 3 | `read_only_degraded` | `route_memory_v2.py:84-88` | **GET 显式豁免** —— `PUPU_MEMORY_V2_READ_ONLY_DEGRADED` **不阻塞** tree 读 |
  | 4 | store owner 分派 | `route_memory_v2.py:315-361` | **生效，且是决定性的一道** |
  | 5 | `UNCHAIN_DATA_DIR` 未配置 | `memory_v2_runtime.py:698-707` → 503 `context_v2_unavailable` | 生效 |
  | 6 | owner ≠ `pupu_legacy` 时拒开 legacy runtime | `memory_v2_runtime.py:718-735` → 503 | 生效 |
  | 7 | unchain reader import / open | `route_memory_v2.py:338-361` → 503 | 仅 owner=unchain 时 |
  | 8 | **capability 检查** | `resolve_context_memory_v2_capability` 在 `route_memory_v2.py` 中 **只出现在 :987/:1004**，即 `/context/v2/status` 内部 | **不在读路径上** —— `get_tree` 不过 capability 门 |

  **(2) 决定性的门是第 4 道，而它由 Electron 决定，不由我决定。**

  ```js
  // electron/main/services/unchain/memory_v2_rollout.js:150
  const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";
  ```

  Electron **总是** 注入 `PUPU_CONTEXT_V2_STORE_OWNER`，且取值域只有 `{off, unchain}`。而 `configured_context_v2_store_owner()` 在 env 缺失时默认 `pupu_legacy`（`memory_v2_store_boundary.py:96`）—— 那条默认路径 **只在脱离 Electron 直跑 `python main.py` 时可达**。

  由此，三种真实配置：

  | 配置 | `store_owner` | `get_tree` 实际实现 | 结果 |
  |---|---|---|---|
  | **shipped 安装包** | `off`（`build/build_feature_flags.json` 冻结，`enable_memory_v2: false`） | **不执行** | 503 `context_v2_store_disabled` |
  | **`npm start`** | `unchain`（package.json `start:electron` 设 `PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all`） | `memory_v2_unchain_read_adapter.py:432` | 走 unchain 库 |
  | 裸跑 `python main.py` | `pupu_legacy`（env 缺失默认） | `memory_v2_store.py:7408` | E-0006 锚定的那一段 |

  **`get_tree` 在今天出厂的 PuPu 里一次也不会被执行。** 这不使议案不可行 —— 它把议案的性质从「接一个已通的管线」改成「接一个只在开启态通的管线，默认态必须显示未启用」。

  **(3) 还有一段本庭未列的前置调用。** `get_tree` 需要 `space_id`，而 `space_id` 只能来自 `GET /context/v2/memory/spaces`（`route_memory_v2.py:1082`）。该端点 **已全链路打通**（renderer facade `src/SERVICEs/bridges/context_v2_bridge.js:38,107` · preload `:81-82,218` · channel `electron/shared/channels.js:151` · handler `register_handlers.js:29,641`）。**所以真实管线是两跳，不是一跳**：`listSpaces → getTree`。

  **(4) 且 space 是惰性创建的。** 产品代码里 `ensure_space` 的 **唯一** 调用点是 `memory_v2_toolkit.py`（:642,659,663,688,946,982,1002,1087,1392,1528,1672）—— 即 **只有模型真正调用过 memory 工具的会话才有 space**。没调用过的会话 `listSpaces` 返回 `{"owner_chat_id": X, "spaces": []}`（HTTP 200，实测 E-A6 S1）。**这是「空态」里最常见的一种，而它发生在 `get_tree` 之前，不在 `get_tree` 里。**

  ### Q3（G4）· 「vector view 保持现状」的技术前提 —— **书记员自查成立，且比他说的更强**

  **(1) V1 侧：`/memory/projection` 与 V2 零关联，已核实。**

  `unchain_runtime/server/route_projection.py:406-452`。入参是 `session_id`（不是 `owner_chat_id`），数据源是 `memory_factory._get_or_create_qdrant_client(data_dir)` + `memory_factory` 的集合命名（`_vector_collection_prefix` / `_session_collection_name`），坐标由 `_project_vectors`（:344-370）以 `numpy.linalg.svd` 中心化后取前 5 主成分产出 `coords + variance`，聚类由 `_kmeans_2d_numpy`（:219）。

  **决定性负向事实**：`route_projection.py` 全文对 `store_owner` / `context_v2` / `memory_v2` 的匹配数为 **0**。它 **不是 store-owner 感知的**，因此 store owner 无论切到 `off` / `unchain` / `pupu_legacy`，V1 vector view 的行为完全不变。**「vector view 保持现状」在技术上是自动成立的，不需要任何人做任何事来维持它。**

  **(2) V2 侧：确无等价逻辑，且负向搜索是穷尽的。**

  - `unchain_runtime/server` 全部非测试 `.py` 中，`numpy` / `np.linalg` 只出现在 `route_projection.py`（+ `routes.py:5,87` 的再导出）。**V2 侧一行投影数学都没有。**
  - `memory_v2_*.py` 与 `route_memory_v2.py` 中，`coords` / `PCA` / `pca` / `umap` / `tsne` / `t_sne` / `"x":` 的匹配文件数为 **0**。
  - V2 的 14 个 GET 路由（`route_memory_v2.py:982,1009,1025,1057,1082,1111,1123,1160,1223,1237,1299,1313,1347,1453`）**无一返回坐标或向量**。

  **(3) 比自查更强的一条：V2 连原始向量都不出库。**

  V2 确有向量子系统 `memory_v2_vector.py`，但它对外的最小单位是 `VectorHit`：

  ```python
  # memory_v2_vector.py:151-156
  @dataclass(frozen=True)
  class VectorHit:
      chunk_id: str
      text_hash: str
      score: float
  ```

  **没有 embedding 字段。** 向量只存在于 Qdrant 里，任何调用方都拿不到。且 `context_v2_search` 走的 `search_entries`（`memory_v2_store.py:8425+`）是 **纯词法**（FTS5 + 子串），实测返回 `{"backend":"fts5","results":[],"vector_status":"disabled"}`（E-A6 S5）。V2 向量后端默认 **关闭** —— 除非设 `PUPU_MEMORY_V2_VECTOR_PROVIDER`（`memory_v2_vector.py:30-32,118-120`），否则是 `NullVectorBackend`。

  **(4) 对「V2 数据被选中时 vector view 技术上有什么可呈现」的直接回答：今天，什么都没有。**

  不是「有数据但没排版」，是 **没有数据**。要让它有，必须新造三样东西，缺一不可：
  1. 打开 V2 向量后端（新配置 + 一个 embedding provider，今天默认关）
  2. 一个新的服务端路由，返回逐条目的 embedding 或服务端算好的坐标（今天 14 个 GET 路由都不给）
  3. 投影计算本身（今天只在 `route_projection.py` 里，且与 V1 集合命名强耦合）

  这三样是 **新建**，不是「保持现状」。**且做与不做的取舍已经不是「代码存不存在」而是「该不该为 V2 造一套投影」** —— 依 S-0003 第三节对 `expert-llm` 的不传唤判定原文，**该转化条件已被我的答复满足**，请本庭在第三层重判是否补传 `expert-llm`。我不代其表态。

  ### Q4（G3）· 空态 / 未启用态的可判别性 —— **可判别，三态两两不重叠，已实跑**

  实测于 PuPu `b2385d5d`，命令与完整输出见 E-A4：

  | 情形 | HTTP | 载荷 | 可判别性 |
  |---|---|---|---|
  | **(a)** store 存在、space 存在、`entries=0` | **200** | `{"entries":[], "tree":[], "owner_chat_id":…, "space_id":…, "space_revision":1}` | ✅ 唯一的 200 |
  | **(b)** `store_owner=off` | **503** | `{"error":{"code":"context_v2_store_disabled","retryable":false}}` | ✅ 唯一码 |
  | **(c)** `owner_chat_id` 空串 **或** 完全省略 | **400** | `{"error":{"code":"context_v2_invalid_request","message":"owner_chat_id is invalid","retryable":false}}` | ✅ 唯一码，两种写法同码 |

  **本庭没问、但收端必然会撞上的另外四态**（同批实跑）：

  | 情形 | HTTP | code |
  |---|---|---|
  | `space_id` 不存在 | 404 | `context_v2_not_found` |
  | `space_id` 存在但属于别的 chat | 404 | `context_v2_not_found` |
  | `store_owner` 值非法 | 503 | `context_v2_store_owner_invalid` |
  | owner=unchain 但 reader 打不开 | 503 | `context_v2_unchain_read_unavailable` |

  **两条必须写进记录的限制**：

  - **404 是坍缩的**：「没有这个 space」与「这个 space 不属于你」返回 **完全相同** 的 404 + 同一 code + 同一 message。这在安全上是正确的（owner-scoping 不泄露他人 space 的存在性），但意味着收端 **无法区分「查错了」与「越权了」**。若方案庭审要求区分，那是一个 **需要放宽安全边界** 的改动，我预先反对。
  - **「空」有两个不同形状**：`{"spaces": []}`（会话还没有 workspace，200，`listSpaces` 阶段）与 `{"entries": [], "tree": []}`（有 workspace 但里面是空的，200，`getTree` 阶段）。这是两个语义不同的空，发生在两跳的不同跳上。

  ### Q2（G1）· 强制表态 —— **判据归我，判定不归我；有一个新构件可能落到我头上**

  **不接受「与我无关」，我不说这句话。逐条表态：**

  **(1) 本案确实会触到前案 D7/D8 的那个无主构件，而它在我这一层有具体形态：服务端今天没有任何端点能回答「V2 现在处于哪一态」。**

  看起来最该承担这个职责的是 `/context/v2/status`（`route_memory_v2.py:982`）。**但它在最需要它作答的那一态里自己就 503 了** —— 实测：`store_owner=off` 时 `GET /context/v2/status` 返回 **503 `context_v2_store_disabled`**（E-A4 b3 行 / E-A6 S4 同因）。原因在 `_status_for_store_owner`（:786-799）：owner 非 `unchain` 时它直接调 `_runtime()`，而 `_runtime()` 对 `off` 一定抛。

  **净效果：「未启用」这一态只能从错误码反推，读不出来。** 前端要判态，只能 catch 503 再匹配 `error.code` 字符串。**那是把状态契约建在错误消息上。** 这就是 D7/D8 说的那个「多方需要、今天没有 owner」的构件在服务端的确切样子。

  **(2) 本案是否要求我的边界承担一个今天不属于我的判定职责？——「给判据」已经是我的，且已做到；「做判定」不是我的。**

  - **落在本边界（且今天已满足）**：产出机器可读、互不重叠的状态信号。Q4 的七种情形已经做到这一点，**不需要新工作**。我提供的是判据，不是判定。
  - **不落在本边界**：把这些信号收敛成一个「四态」并决定谁是权威。这跨 renderer / preload / main / sidecar 四层。**且 main 里已经存在一个半成品单一状态源**：`memoryV2Readiness`（`electron/main/services/unchain/service.js:1068`，形状 `{status: "ready"|"degraded"|…, reason, sidecarFingerprint}`，由 `validateMemoryV2Status` 在 :1866 与 :1961 两处写入）。**但我 grep `electron/main/ipc/` `electron/preload/` `src/SERVICEs/` 三处，`memoryV2Readiness` 零命中 —— 它没有以该名字暴露给 renderer。** 一个已经存在、只差一段暴露的状态源，比新造一个便宜得多。
  - **谁能判断**：**`code-owner-electron`**（它持有 `memoryV2Readiness` 这个既有状态，也持有 `requireContextV2OwnerChatId` 这道门）与 **`expert-architecture`**（落位与权威归属）。**不是我。**

  **(3) 唯一可能真正落到我头上的新构件（我主动登记，请本庭记为显式选项）**：

  > 若庭审判定「`off` 态必须能被一个 200 响应读出」，则我边界内需二选一：(i) 改 `_status_for_store_owner`，使 `off` 返回 200 + `available:false` 而非 503；(ii) 新开一个不依赖 store owner 的探针端点。

  **我不主张现在做**，因为它直接就是前案 Q0 的子问题，在 Q0 裁定前单独定它会制造第二个权威。但 **不做的代价必须被显式接受**：前端判态将依赖错误码字符串匹配。

  **(4) G1 是否构成前置阻塞？—— 对可行性论证不阻塞；对方案定稿阻塞。**

  我的 Q1/Q3/Q4 三项结论 **不依赖前案任何裁定**，它们是当前 revision 上的代码事实与实测事实。所以 **本案可以在 `0000-0003-2026-0807` 裁定之前完成议案庭审**。但上面 (3) 那个选择是 Q0 的子集，**方案庭审若在 Q0 裁定前定它，就是在前案的答案到达前先替它作答**。我建议本案进入方案庭审的门槛条件里加一条：Q0 裁定到达，或本案显式声明不碰状态源、只做错误码消费。

  ### 丙 · 可证伪形式 —— 我的「有条件可行」在什么条件下变成不可行

  **任一条成立即翻**：

  1. **若本案要求 tree view 在 shipped 默认配置下就能显示真实 V2 数据。** 不可行。今天出厂的 `build/build_feature_flags.json` 是 `enable_memory_v2: false` + 冻结的 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`（E-A5）。要做到，本案就得同时变成一个 rollout 议案（改 build feature flag + 重出 release snapshot 指纹），那远超「加一个 view」。**议案必须显式接受：默认态下 tree view 只能显示「未启用」。**
  2. **若「vector view 保持现状」被解释成「V2 数据被选中时 vector view 里也要有东西」。** 不可行。需新造三样（开向量后端 / 新端点 / 投影计算，见 Q3(4)），且落 `expert-llm` 边界。
  3. **若验收对象被写成 `memory_v2_store.py::get_tree`。** 该实现在两种真实配置下都不执行（E-A5），验收会验到死代码。必须改以 `memory_v2_unchain_read_adapter.py:432` 为准。
  4. **若方案假设两个 owner 的 `get_tree` 返回同一形状。** —— **这一条我已部分证伪，它不是假设风险，是已确认的分歧**（E-A8）：

     | | `pupu_legacy`（`_entry_response`, `memory_v2_store.py:6642-6669`） | `unchain`（`_route_entry`, `…read_adapter.py:532-567`） |
     |---|---|---|
     | `kind` 取值域 | `folder` / **`file`** / `link` | `folder` / **`markdown`** / **`image`** / `link`（`unchain:src/unchain/memory/workspace/models.py:251-255`） |
     | 时间戳 | `created_at_ms` · `updated_at_ms` · `created_by` | **全无** |
     | `tags` | **无** | 有 |
     | `source_refs` | **无**（只有单个 `source_event_id`） | 有（列表）+ `source_event_id` |
     | `content_ref` 触发 | `kind == "file"` | `kind in {markdown, image}` |
     | `content_bytes` | 有 | **无** |
     | `space_revision` 来源 | `row["space_revision"]` | `entry.updated_seq` |

     **叶子节点的 kind 词汇表除 `link` 外完全不相交。** 一个按 `file` 分支渲染图标的 tree view，在 `unchain` owner 下每个叶子都会掉进 unknown 分支；反之亦然。**且这正是我记忆里 `unchain-drop-silently-whitelists` 那一类形态：白名单构造，未列字段无声消失。** 方案庭审必须选定一个 owner 作为契约基准，或显式做双形状归一 —— **归一层放哪一层，是 `expert-architecture` 的落位问题，不是我的。**
  5. **若前案 Q0 裁定把「单一状态源」定为本案的前置交付。** 那本案 scope 从「加一个 view」变成「先建状态源」，可行性需整体重判。

  **不会被推翻的（已实测钉死，可作为方案庭审的地基）**：Q4 三态 API 层可判别；GET 不受 `read_only_degraded` 影响；capability 检查不在读路径上；`listSpaces` 全链路已通；`route_projection.py` 零 store-owner 感知因而 V1 view 自动保持现状。

- **边界命中依据**: `pupu:unchain_runtime/**`，第一层路径机械命中 3 处（E-0002）。本次实际作业触及本边界内 `unchain_runtime/server/` 下 12 个文件：`route_memory_v2.py` · `memory_v2_store.py` · `memory_v2_store_boundary.py` · `memory_v2_runtime.py` · `memory_v2_rollout.py` · `memory_v2_vector.py` · `memory_v2_unchain_read_adapter.py` · `memory_v2_toolkit.py` · `route_projection.py` · `routes.py`。跨界只读引用（**不构成本边界主张**）：`pupu:electron/main/services/unchain/memory_v2_rollout.js` 与 `service.js`（归 `code-owner-electron`）、`pupu:src/SERVICEs/bridges/context_v2_bridge.js`（归 `code-owner-shared-arteries`）、`unchain:src/unchain/memory/workspace/models.py`（归 `code-owner-unchain`）—— 三处都只用于确认我这一段的上下游取值，结论归属仍在各自 owner。

- **受影响对象**:
  - **若本案推进，我边界内 0 处必须改动。** 服务端 `get_tree` / `list_spaces` 两个端点已完整，无需为 tree view 新增或修改任何路由。这是我这一半的主要结论。
  - **条件性影响 1**：若庭审选定「`off` 态须 200 可读」，则 `route_memory_v2.py:786-799 _status_for_store_owner` 需改，或新增一个 store-owner 无关的探针端点。**改完 sidecar 必须重启才生效**，报告与验收都须标注。
  - **条件性影响 2**：若庭审选定服务端做双 owner 形状归一，则 `memory_v2_unchain_read_adapter.py:532 _route_entry` 与 `memory_v2_store.py:6642 _entry_response` 需对齐字段集与 `kind` 词汇表。**我预先提示：这会改动 `chat-bubble` 三个既有 V2 消费者已在依赖的响应形状（E-0005），破坏面非零，不是「只加不减」。**
  - **无影响**：`route_projection.py` 及全部 V1 投影路径。V1 vector view 不因本案发生任何改动，也不需要任何改动来「保持现状」。

- **约束**:
  1. **不得在本案内顺手改检索参数、chunking 或 embedding 配置。** V2 向量后端的开关与 provider 选择落 `expert-llm` 的 spec，不落我。我只报告它今天是关的。
  2. **不得把 `memory_v2_store.py::get_tree` 写进任何验收断言。** 它在两种真实配置下都不执行。
  3. **`.py` 改完 sidecar 必须重启**（本仓工程铁律），任何涉及服务端的验收步骤须显式包含重启，否则验的是旧代码。
  4. **跨仓改动强制双边取证**：一旦方案触及 `MemoryEntryKind` 或 workspace 条目形状，PuPu 与 unchain 两侧的 impact 都要有，单边看不全爆炸半径。
  5. **本机 V2 store `entries=0` 这一条不因我的取证而消除。** 我用临时目录新建 store 取到了空态返回，**这不等于取到了正常态**。凡涉及「有数据时」的主张仍是推断。

- **建议处置**: **本案可进入方案庭审，但须先由 `chief-judge` 或本庭确认三项前置声明**，否则方案会建在错误的地基上：
  1. **确认议案接受「默认配置下 tree view 显示未启用」**。不接受则本案性质变更（见可证伪条件 1）。
  2. **确认契约基准 owner 为 `unchain`**，并把 `memory_v2_unchain_read_adapter.py:432` 定为验收对象。**这是我最强的一条建议** —— 它同时消掉可证伪条件 3，并把条件 4 从「未知」降为「已知且有界」。
  3. **确认本案是否碰状态源**。碰 → 建议等 `0000-0003-2026-0807` Q0 裁定；不碰 → 显式声明 tree view 以错误码消费方式判态，并把「契约建在错误码上」记为已接受的技术债。

  另请本庭在第三层门禁 **重判两项传唤**：补传 `code-owner-unchain`（跨仓依赖已确认存在，见「请求/下一步」2）；重判 `expert-llm`（Q3 的转化条件已被我的答复满足，见 Q3(4)）。两项都是 S-0003 明写「挂在 `code-owner-runtime` 答复上」的判定，我已作答，处置权归本庭。

---

## 本 ASSESSMENT 新提交的证据

### E-A1 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:344-370`（`_project_vectors`）· `:219`（`_kmeans_2d_numpy`）· `:406-452`（`memory_projection` 路由）· `:456`（`/memory/long-term/projection`）
- **取得方式**: `grep -n "def _project_vectors" -A 35 route_projection.py`；`sed -n '390,470p' route_projection.py`；`grep -n "store_owner\|memory_v2\|context_v2" route_projection.py`（**匹配数 0**）
- **支持/反驳**: **支持** 案 Q3 中书记员自查的 V1 半边（`/memory/projection` 走 `memory_factory` 旧向量集合逻辑，与 V2 store 无关）
- **完整性限制**: 静态读取，未实跑该端点（本机无 Qdrant 数据）。「零 store-owner 感知」是对三个字面标识符（`store_owner` / `memory_v2` / `context_v2`）的全文匹配，**未覆盖** 经间接调用抵达 V2 的可能路径 —— 但该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`，故间接路径的可能性极低
- **证据类型判据**: 仓内文件的字面内容与行号，可由任何人在同一 revision 直接复核 → 自证类

### E-A2 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/` 全目录负向搜索
- **取得方式**（可复跑，须在该目录下执行）:
  ```
  grep -rn "numpy\|np.linalg\|linalg.svd" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  grep -rln "def .*projection_points\|\"x\":\|coords\|pca\|PCA\|umap\|t_sne\|tsne" memory_v2_*.py route_memory_v2.py
  grep -n "@api_blueprint.get" route_memory_v2.py
  ```
- **支持/反驳**: **支持** 书记员自查的 V2 半边（V2 侧无等价于 `/memory/projection` 的二维散点坐标生成逻辑）
- **完整性限制**: 第一条命中仅 `route_projection.py:219,345,353` 与 `routes.py:5,87`（再导出）；第二条 **命中文件数 0**；第三条列出 V2 全部 14 个 GET 路由。**这是一个负向证明**，其强度受限于关键词表 —— 若存在以完全不同命名实现的投影逻辑（如自研线性代数、非 numpy 实现），本搜索看不到。我认为可能性低但 **不能排除**
- **证据类型判据**: 可复跑命令 + 仓内文件 → 自证类

### E-A3 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `memory_v2_vector.py:30-32`（三个 env 名）· `:57-120`（`VectorConfig.from_environ` / `enabled`）· `:151-156`（`VectorHit`）· `:198-215`（`NullVectorBackend`）· `memory_v2_store.py:8425-8470`（`search_entries`）
- **取得方式**: 定点读取上述行段；`grep -n "^class \|^    def \|^def " memory_v2_vector.py`
- **支持/反驳**: **支持并强化** Q3 结论 —— V2 不仅没有投影，**连原始 embedding 都不出库**：`VectorHit` 字段仅 `(chunk_id, text_hash, score)`；`search_entries` 是 FTS5/子串词法检索；V2 向量后端在 `PUPU_MEMORY_V2_VECTOR_PROVIDER` 未设时为 `NullVectorBackend`
- **完整性限制**: 我读的是 `MemoryV2VectorCoordinator` 的对外接口与 `VectorHit` 定义，**未逐一追查** `OllamaQdrantBackend` 内部是否在别处泄出向量；但其 `query()` 的返回类型标注即 `list[VectorHit]`，类型层面已封闭
- **证据类型判据**: 仓内文件字面内容 → 自证类

### E-A4 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`，2026-08-08
- **取得方式**（**完整可复跑命令**，自带 Flask test harness，只写临时目录，不触碰任何真实数据）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && PYTHONPATH=. python3 - <<'EOF'
  import os,sys,types,tempfile,json
  from unittest import mock
  from flask import Flask,jsonify,request
  tmp=tempfile.TemporaryDirectory(); os.environ["UNCHAIN_DATA_DIR"]=tmp.name
  os.environ.pop("PUPU_CONTEXT_V2_STORE_OWNER",None)
  fr=types.ModuleType("routes")
  fr._is_authorized=lambda: request.headers.get("x-unchain-auth")=="t"
  fr._json_error=lambda c,m,s:(jsonify({"error":{"code":c,"message":m}}),s)
  mock.patch.dict(sys.modules,{"routes":fr}).start()
  import route_memory_v2
  from memory_v2_runtime import get_memory_v2_runtime,_reset_memory_v2_runtime_for_tests
  from route_blueprint import api_blueprint
  app=Flask(__name__); app.register_blueprint(api_blueprint); c=app.test_client(); H={"x-unchain-auth":"t"}
  sp=get_memory_v2_runtime(required=True).store.ensure_space(owner_chat_id="a",scope_kind="chat",scope_key="a",name="p",description="",operation_id="o1")["space_id"]
  for lbl,url,ov in [("a entries=0",f"/context/v2/memory/spaces/{sp}/tree?owner_chat_id=a",None),
                     ("c owner empty",f"/context/v2/memory/spaces/{sp}/tree?owner_chat_id=",None),
                     ("b owner=off",f"/context/v2/memory/spaces/{sp}/tree?owner_chat_id=a","off")]:
      if ov:
          _reset_memory_v2_runtime_for_tests(); os.environ["PUPU_CONTEXT_V2_STORE_OWNER"]=ov
      r=c.get(url,headers=H); print(lbl,"->",r.status_code,json.dumps(r.get_json(),sort_keys=True))
  EOF
  ```
  **实际输出**:
  ```
  a entries=0   -> 200 {"entries": [], "owner_chat_id": "a", "space_id": "mem_space_…", "space_revision": 1, "tree": []}
  c owner empty -> 400 {"error": {"code": "context_v2_invalid_request", "message": "owner_chat_id is invalid", "retryable": false}}
  b owner=off   -> 503 {"error": {"code": "context_v2_store_disabled", "message": "PuPu legacy Context V2 storage is not the selected data owner", "retryable": false}}
  ```
  同批（较长脚本，同一 harness）另取得：`owner_chat_id` 完全省略 → 400 同码；`space_id` 不存在 → 404 `context_v2_not_found`；owner 不匹配 → 404 **同码同 message**；`store_owner=bogus` → 503 `context_v2_store_owner_invalid`；`store_owner=off` 下 `GET /context/v2/status` → **503 `context_v2_store_disabled`**
- **支持/反驳**: **回答 Q4 / G3 服务端半边**（三态可判别）；**支撑 Q2** 中「`/context/v2/status` 在 off 态自己 503，故不是可用的单一状态源」
- **完整性限制**: **(1)** 走 Flask `test_client`，**未起真实 sidecar 进程**，未经 HTTP socket、未经 Electron 转发。**(2)** `routes._is_authorized` / `_json_error` 被 harness 替身，**真实 `routes.py` 的鉴权与错误包装未参与**（该替身形状取自本仓既有测试 `tests/test_route_memory_v2.py:29-38`）。**(3)** `store_owner=unchain` 分支 **未能有效实跑** —— 我的环境 `import unchain` 失败（`ModuleNotFoundError: No module named 'unchain'`，仓根 `.venv` 亦然），该分支返回的 `context_v2_unchain_read_unavailable` 是 `route_memory_v2.py:343-349` 的 ImportError 分支，**是我环境的产物，不是产品行为，不得引用为产品结论**。**(4)** store 是临时目录新建的，非本机真实 store
- **证据类型判据**: 由我编写的 harness 产出的运行时观察，依赖我搭建的替身与环境 → **须查类**（无需质疑即强制审查）

### E-A5 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:150`（`const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`）· 同文件 `:14-20`（env 键表）· `:135-141`（ceiling ∧ mode 取小）· `:216-218`（snapshot 路径）· `:261-266`（`allowProcessOverrides: !app.isPackaged`）· `unchain_runtime/server/memory_v2_store_boundary.py:96`（env 缺失默认 `pupu_legacy`）· `unchain_runtime/server/memory_v2_runtime.py:694-735` · `/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json` · `/Users/red/Desktop/GITRepo/PuPu/package.json` `scripts.start:electron`
- **取得方式**: 定点读取 + `grep -rn "PUPU_CONTEXT_V2_STORE_OWNER" electron/ src/ unchain_runtime/ | grep -v /tests/`（产品代码中 **仅 2 处**：上述 js:19 与 py:24）+ `cat build/build_feature_flags.json`
- **支持/反驳**: **反驳** 本庭「已知事实 2」的隐含前提 —— E-0006 锚定的 `memory_v2_store.py:7408 get_tree` 在两种真实配置下 **均不执行**。**支持** Q1 结论「默认配置下管线走不到 `get_tree`」
- **关键原文**:
  - `build/build_feature_flags.json`：`"enable_memory_v2": false`，且 `_pupu_memory_v2_release.sidecar_environment` 冻结为 `{"PUPU_FEATURE_MEMORY_V2":"off","PUPU_MEMORY_V2_MODE":"off","PUPU_CONTEXT_V2_STORE_OWNER":"off", …}`
  - `package.json`：`"start:electron": "cross-env PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1 node ./scripts/start-dev.cjs"`
- **完整性限制**: **(1)** `memory_v2_rollout.js` 与 `service.js` 落在 `code-owner-electron` 边界，我 **只读引用**，未验证 `sidecarEnvironment` 到 spawn 的最后一段注入（`service.js:4745-4810` 我只读了 grep 上下文，未逐行确认覆盖顺序）—— **该段的权威结论归 `code-owner-electron`**。**(2)** `build/build_feature_flags.json` 是本机构建产物，**未核实** 它与最近一次实际 release 的一致性。**(3)** 未实际启动 Electron 观察落到 sidecar 进程的 env
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但其结论跨入他人边界，本条只作为「请 `code-owner-electron` 确认」的锚点，不作为本边界的终局主张**

### E-A6 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，同 E-A4 的 harness 与工作目录，2026-08-08
- **取得方式**: 同 E-A4 harness，改请求为 `/context/v2/memory/spaces`、`/context/v2/status`、`/context/v2/memory/search`。**实际输出**:
  ```
  S1. pupu_legacy / 全新会话，从未创建过 space
      -> 200 {"owner_chat_id": "chat_fresh", "spaces": []}
  S2. pupu_legacy / owner_chat_id 空
      -> 400 {"error": {"code": "context_v2_invalid_request", "message": "owner_chat_id is invalid"}}
  S3. pupu_legacy / status
      -> 200 {"available": true, "rollout_mode": "off", "lexical_backend": "fts5",
              "journal_mode": "wal", "vector_status": "disabled",
              "context_memory_capability_reason": "memory_v2_disabled", …}
  S4. store_owner=off / list spaces
      -> 503 {"error": {"code": "context_v2_store_disabled"}}
  S5. pupu_legacy / search 空 store
      -> 200 {"backend": "fts5", "owner_chat_id": "chat_fresh", "query": "anything",
              "results": [], "vector_status": "disabled"}
  ```
- **支持/反驳**: **支持** Q1(3)(4)（真实管线是 `listSpaces → getTree` 两跳；新会话无 space 时第一跳即返回空数组）；**支持** Q3(3)（`vector_status: "disabled"` 为默认，检索 backend 是 `fts5` 词法）；**支持** Q2(1)（`store_owner=off` 时 status 端点自身 503）
- **完整性限制**: 同 E-A4 的四条限制全部适用。此外 S1 的「空 spaces」是在 **我新建的临时 store** 上取得，**非本机真实 store 的观察**
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**

### E-A7 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `route_memory_v2.py:68-106`（`_endpoint`：401 / 413 / GET 豁免 `read_only_degraded`）· `:315-361`（`_read_runtime_for_store_owner`）· `:786-831`（`_status_for_store_owner`）· `:982-1008`（capability 的唯一使用点 :987/:1004）· `:1082,1111,1123`（spaces / tree / entries 三个路由）· `memory_v2_runtime.py:694-735` · `memory_v2_toolkit.py:642,659,663,688,946,982,1002,1087,1392,1528,1672`（`ensure_space` 的全部产品调用点）· `memory_v2_store.py:6467`（`ensure_space` 定义）· `memory_v2_store.py:6619-6639`（`list_spaces`）
- **取得方式**: 定点读取；`grep -n "context_memory_v2_capability_status\|resolve_context_memory_v2_capability" route_memory_v2.py`（**仅 :16,:17 导入 + :987,:1004 使用**）；`grep -rn "ensure_space" --include="*.py" . | grep -v __pycache__ | grep -v /tests/`
- **支持/反驳**: **支持** Q1 的完整门清单（尤其：capability 检查 **不在** `get_tree` 读路径上；`read_only_degraded` **不阻塞** GET）；**支持** Q1(4)（space 由 memory toolkit 惰性创建，是「空态」的最常见成因）
- **完整性限制**: `ensure_space` 的调用点搜索只覆盖 `unchain_runtime/server` 下的 **字面标识符**，**未追** 经 `getattr(runtime, name)` 之类的动态派发（而 `_workspace_mutation_for_store_owner` 正是用 `getattr(…, method_name)` 派发的，故经 HTTP `POST /context/v2/memory/spaces` 也可创建 space —— 该路径 **确实存在**，只是今天 renderer 侧无消费者）
- **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类

### E-A8 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `unchain_runtime/server/memory_v2_store.py:6641-6669`（`_entry_response`）· `unchain_runtime/server/memory_v2_unchain_read_adapter.py:532-567`（`_route_entry`）· `:411-452`（该侧 `list_entries` / `get_tree`）· `:357-382`（`_workspace_entries` → `memory_tree` / `memory_list` 分页）‖ **unchain `a4e69f4`** · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind` = `folder | markdown | image | link`）
- **取得方式**: 两侧函数全文定点读取并逐字段人工比对；`grep -rn "class .*EntryKind" -A 12 --include="*.py" .`（unchain 仓）
- **支持/反驳**: **证实** 可证伪条件 4 的前半 —— 两个 `get_tree` 实现返回 **不同的条目字段集与不相交的叶子 `kind` 词汇表**。`pupu_legacy` 侧独有 `created_at_ms` / `updated_at_ms` / `created_by` / `content_bytes` 与 `kind == "file"`；`unchain` 侧独有 `tags` / `source_refs` 与 `kind ∈ {markdown, image}`。`folder` 与 `link` 是两侧共有的仅有两个 kind
- **完整性限制**: **(1)** 纯静态比对，**未在 `store_owner=unchain` 下实跑**（环境限制，见 E-A4 限制 3），因此「运行时字段确实如此」是 **推断**，不是观察。**(2)** 两侧 `get_tree` 的 **树装配算法本身**（`{**listing, "tree": roots}`，parent 缺失即升为 root）我确认为字面等价。**(3)** 由此外推的一条 **纯推断、未取证**：若 unchain 侧的条目集合中不含 `folder` 类型条目，则 `nodes.get(parent_path)` 恒为 `None`，tree 会退化为扁平列表 —— **`MemoryEntryKind` 有 `FOLDER`，所以前提大概率不成立，但我无法验证 `memory_tree` 是否返回 folder 条目**。请方案庭审就此取证，勿采信我的推断
- **证据类型判据**: 两仓内文件的字面内容与行号，可在给定 revision 直接复核 → 自证类。**但其中标注为「推断」的第 (3) 点不具此地位，不得作为事实引用**
