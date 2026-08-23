# 承重证据复核 · 批次 A（12 条）

`evidence-examiner` · 依[证据规则第六节](../../../codex/lifecycle/evidence-rules.md) · 2026-08-08

> 编号 `S-0033`~`S-0044` 为顺位建议（案内最高已归档为 `S-0032`）。**编号权归 `speaker-of-the-house`**，如与并发批次冲突请径行重排，内容不受影响。

---

## 全批时效前提（一次性核验，覆盖 12 条）

| 项 | E-0001 登记 | 复核实测（2026-08-08，本次） | 判定 |
|---|---|---|---|
| PuPu HEAD | `b2385d5d` / `dev` | `b2385d5dc7951887b6aeebd4001d17b4cd78af83` / `dev` | **一致** |
| unchain HEAD | `a4e69f4` / `dev` | `a4e69f413c449c5768433ba4dddc5b60b8146991` / `dev`，`git status --porcelain` **0 条** | **一致，且工作树全净** |
| `git status --porcelain -- src electron unchain_runtime` | 空 | **空** | **一致** |
| PuPu 工作树 dirty/untracked 总数 | **8**（E-0001）→ **12**（E-0028 重测） | **49**（21 modified + 28 untracked） | **已漂移** |
| dirty 条目分布 | 「**全部**位于 `.claude/court/cases/**`」 | **不再成立** —— 分布于 `.claude/agent-memory/`（32）、`.claude/agents/`（1）、`.claude/codex/`（2）、四个案卷目录（14） | **已失效** |

**结论**：**三个产品目录 `src/` `electron/` `unchain_runtime/` 在本次复核时点仍为零 dirty，两仓 HEAD 与 E-0001 所载完全一致。故本批 12 条的全部 `file:line` 锚点，其 revision 前提在闭庭时点依然成立。** E-0001 完整性限制所要求的重测（「未检查是否有并发会话在庭审期间改动产品目录」），本次为**第四次**满足，且是**最晚时点**的一次。

**同时须记入闭庭产出的一条**：庭审七小时内工作树由 8 涨至 49 条，增量**全部落在 `.claude/` 下**（多为本次庭审各角色新写的 agent memory 与案卷）。这使 E-0001 的 dirty 计数与「全部位于 `.claude/court/cases/**`」两句话**在今天为假**，但**不触及其承重部分**（产品目录零 dirty + 两仓 revision）。

**一条贯穿全批的元发现**：本批 12 条**无一条发生行号漂移、内容改动或文件消失**。我查出的全部缺陷，无例外地是**登记时即已存在的保真缺陷**（grep 转录不全、范围端点差一行、出处误植），**不是时效衰减**。就时效性而言，**本批 12 条全部仍然成立**。

---

#### S-0033 | ASSESSMENT | evidence-examiner → E-0001
- **阶段**: 议案庭审
- **结论**: 两仓 revision 锚点与三个产品目录的零 dirty 状态在闭庭时点全部仍然成立，承重部分完好；但其完整性限制中的 dirty 计数（8 条）与分布断言（「全部位于 `.claude/court/cases/**`」）今天均为假。
- **依据**: E-0001
- **不确定性**: 我只在本次复核时点测了一次。与 E-0001 一样，**不能证明整场庭审期间无并发改动**，只能证明四个时点（S-0002 / E-0028 / 前两次重测 / 本次）各测一次都是零。
- **请求/下一步**: 引用 E-0001 时只引 revision 与「产品目录零 dirty」两项；**dirty 计数与分布两句须以本复核的实测值（49 条，跨 `.claude/` 四个子树）替换**，或删去不引。
- **评估结论**: 已验证
- **证据编号**: E-0001
- **来源类型**: general
- **真实性**: `git rev-parse HEAD` 双仓实跑，与登记值逐字符一致；`git status --porcelain -- src electron unchain_runtime` 输出为空，与登记一致。与 `0000-0005-2026-0807#E-0001` 交叉核对，PuPu HEAD 相同一节亦属实。**dirty 计数已由 8 漂至 49，且不再全部位于 `.claude/court/cases/**`。**
- **可靠性**: 可复跑的 git 原语，无解释余地。
- **相关性**: 支持「本庭全部 `file:line` 锚点的固定 revision」这一用途，成立且是本批其余 11 条的时效前提。漂移的两句不服务于该用途。
- **来源归类**: 内部来源

---

#### S-0034 | ASSESSMENT | evidence-examiner → E-0002
- **阶段**: 议案庭审
- **结论**: 5 人路径边界机械命中、概念名候选与裸文件名歧义三块原样复现；但「未命中（**2 个**）」一块**不复现**，今天为 **10 个**。同时查出分类判据缺陷：该证据的输入 `case.md` 不入库且可变，**不满足自证类判据**。
- **依据**: E-0002
- **不确定性**: 未命中项由 2 增至 10，新增 8 条全部是 `case.md` 自身在庭审中新增的跨案援引（`0000-000{1,2,3}` 的 `evidence.md` / `record.md` / `ruling.md`）。我**未能取得** E-0002 观察时点的 `case.md` 副本（整个案卷目录为 untracked，无 revision 可比），故无法逐字证明这就是唯一成因 —— 但成因指向明确。
- **请求/下一步**: 引用 E-0002 时**只引 5 人命中块与概念名/歧义块**。**「未命中（2 个）」一句不得承重**，需要该结论者须重跑取当前值。另请 `speaker-of-the-house` 注意：**该证据登记为自证类系分类错误，正确分类为须查类**（一次性观察 + 观察对象观察后可变）；该缺陷**因本次承重复核已被实际治愈**，无需另行补程序。
- **评估结论**: 已验证
- **证据编号**: E-0002
- **来源类型**: general
- **真实性**: 原样复跑 `python3 .claude/skills/case/summon.py …`。5 人命中块（`code-owner-electron` 12 / `code-owner-runtime` 3 / `codex` 1 / `code-owner-settings` 1 / `code-owner-shared-arteries` 1）**逐字命中**；概念名候选 `expert-llm ← memory_factory` 逐字命中；`context_v2_bridge.js` 与 `service.js` 两条歧义逐字命中。**「未命中…（2 个）」今天输出「（10 个）」**，原 2 条（`pupu:/memory/projection`、`pupu:src/COMPONENTs/`）仍在列。
- **可靠性**: 工具本身可复跑、确定性；但其**输入不是 revision 固定的制品**，这是本条的结构性弱点，而非工具缺陷。
- **相关性**: 所声称支持的是「S-0003 传唤第一层的机械命中部分」—— 该部分完好，相关性成立。漂移块不在其声称支持的范围内。
- **来源归类**: 内部来源

---

#### S-0035 | ASSESSMENT | evidence-examiner → E-0003
- **阶段**: 议案庭审
- **结论**: 两个挂载点、两组 props、四处行号全部逐字复现，零漂移。本批质量最高的三条之一。
- **依据**: E-0003
- **不确定性**: 无。E-0003 自陈的限制（只覆盖字面标识符 `MemoryInspectModal`，未追动态挂载）我未扩大核查，该限制原样保留。
- **请求/下一步**: 可径行承重，无需附条件。
- **评估结论**: 已验证
- **证据编号**: E-0003
- **来源类型**: general
- **真实性**: `side_menu.js:48-50` = `lazy(() => import("../memory-inspect/memory_inspect_modal").then(m => ({default: m.MemoryInspectModal})))` 逐字命中；`:772-779` = `<MemoryInspectModal open/sessionId/chatTitle/onClose … />` **范围端点精确**（772 为开标签，779 为 `/>`）。`settings/memory/index.js:14` 静态 import 逐字命中；`:474-478` = `{open, onClose, mode="long_term"}` **范围端点精确**。独立重跑 grep：`src/` 下排除 `memory-inspect/` 自身后，`MemoryInspectModal` **有且仅有** `settings/memory/index.js:14,474` 与 `side_menu.js:48,50,772` 五处，即**恰好两个挂载点**。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 支持「两个挂载点 props 集合不同、是两条不同调用契约」以及「side-menu 那一处落在 `code-owner-chat-core` 边界」，两者均由所引原文直接导出。
- **来源归类**: 内部来源

---

#### S-0036 | ASSESSMENT | evidence-examiner → E-0004
- **阶段**: 议案庭审
- **结论**: 承重的负向主张「`src/COMPONENTs/**` 下零 `getTree` 消费者」**独立实跑确认为真**；但其「全部足迹」清单**不是所述命令的输出** —— 其中一行的出处误植，另有两处遗漏。
- **依据**: E-0004
- **不确定性**: 我同样只覆盖字面标识符，E-0004 自陈的「未核实字符串拼接旁路」限制原样保留、未消除。
- **请求/下一步**: 「`src/COMPONENTs/` 零命中」与「`use_chat_stream.turn_mutation_v2.test.js:249` 已 stub」两条可承重。**`electron/main/services/unchain/service.js:2108` 一行须改由 E-0006 引用**（E-0006 以正确出处登记了同一行），不得作为 `getTree` grep 的产物引用。
- **评估结论**: 已验证
- **证据编号**: E-0004
- **来源类型**: general
- **真实性**: 原样重跑 `grep -rn "getTree\|GET_TREE" src electron --include="*.js" --include="*.cjs"`。**核心负向结果确认**：`grep -rn "getTree\|GET_TREE" src/COMPONENTs` → **零命中**。登记的其余各行（facade `:39,108` · preload bridge `:86,219` · preload channels `:115` · shared channels `:152` · register_handlers `:30,642` · 五个测试文件）**全部命中且行号精确**。**三处缺陷**：**(1) 出处误植** —— 登记行 `electron/main/services/unchain/service.js:2108 const getContextV2Tree` **不是该命令的输出**；字面 `getTree` 在 `service.js` 中**出现 0 次**（`getContextV2Tree` 不含该子串），我另行确认 `:2108` 该行确实存在且内容无误，但它进不了这张表。**(2) 遗漏** —— `electron/preload/bridges/context_v2_bridge.js:12`（注释行）命中而未列入「全部足迹」。**(3) 范围虚指** —— `api_contract.test.cjs` 登记为 `:89,260-262`，实际命中为 `:89,260,262`，`:261` 无命中。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep。缺陷属登记保真，非来源问题。
- **相关性**: 所声称支持的是 `case.md` Q1「`src/COMPONENTs/` 下零消费者」并将其收窄 —— 该用途完全成立，三处缺陷均不触及它。
- **来源归类**: 内部来源

---

#### S-0037 | ASSESSMENT | evidence-examiner → E-0005
- **阶段**: 议案庭审
- **结论**: 四个 import 点、三个 chat-bubble 消费者、两串 `ownerChatId` 行号表、两组错误码处理点，**全部逐字复现，零缺陷**。本批最干净的一条。
- **依据**: E-0005
- **不确定性**: 无新增。E-0005 自陈「未追传递依赖」的限制原样保留。
- **请求/下一步**: 可径行承重，无需附条件。
- **评估结论**: 已验证
- **证据编号**: E-0005
- **来源类型**: general
- **真实性**: 重跑 `grep -rn "context_v2_bridge" src --include="*.js"` 排除测试 → **恰好四个非测试文件**，其中三个在 `src/COMPONENTs/chat-bubble/`，与登记完全一致（`memory_v2_journal_reload.js:4` · `memory_v2_trace_audit.js:2` · `memory_v2_pending_reviews.js:4` · `use_chat_stream.js:89`）。登记的 `:2-4` 范围经定点读取确认为完整 import 语句（`import contextV2Bridge, { parseContextV2ErrorCode } from …`）。`ownerChatId` 行号表 **`journal_reload.js:239,248,262,271,282,286,291…` 与 `trace_audit.js:66,77-78,90,248,259,269,353,355,358,378` 逐个命中，无一错位**。错误码处理点全部证实：`journal_reload.js:274`（`parseContextV2ErrorCode(error) || "context_v2_journal_unavailable"`）· `:294` · `:391`（`context_v2_invalid_cursor`）· `:516-521`（`isAvailable()` 失败分支 → `context_v2_unavailable`）；`pending_reviews.js:31-38`（八个 `context_v2_*` 错误码常量表）· `:183`（`code || "context_v2_request_failed"`）· `:299`（`isAvailable()`）。登记原文用「**等**错误码」措辞，与实际的开放码集相符。
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 支持「`src/COMPONENTs/` 下并非零 V2 读消费者，只是零 `getTree` 消费者」与「这三个消费者今天就拿得到 `ownerChatId`」—— 两者均由所引原文直接导出。
- **来源归类**: 内部来源

---

#### S-0038 | ASSESSMENT | evidence-examiner → E-0006
- **阶段**: 议案庭审
- **结论**: 六段链路 + 测试锚点共七处，**全部存在且行号命中**；仅 Flask 路由一处范围起点差一行。「`ownerChatId` 在 Electron main 层是必需参数」这一硬事实经原文确认。
- **依据**: E-0006
- **不确定性**: E-0006 自陈「未运行 sidecar、未观察任何返回体」的限制原样保留、未消除；其运行时半边由 E-0010 / E-0012 承担，不在本条。
- **请求/下一步**: 可承重。引用 Flask 路由段时**行号写 `:1111-1120`**（E-0013 已按 `:1111` 正确登记，两条互为佐证）。另注：E-0006 只记了 `getContextV2Tree` 必需 `ownerChatId`，**未记它同时必需 `spaceId`**（`service.js:2110`），该补充在 E-0018。
- **评估结论**: 已验证
- **证据编号**: E-0006
- **来源类型**: general
- **真实性**: 逐段定点读取。**store 段 `memory_v2_store.py:7408-7434` 范围两端精确**（`def get_tree(` … `return {**listing, "tree": roots}`），签名 `(*, owner_chat_id, space_id, allow_long_term=False, namespace="")` 与组树逻辑逐字符合。**主进程段 `service.js:2108-2116` 范围两端精确**，且 `:2109` 确为 `requireContextV2OwnerChatId(payload?.ownerChatId)` —— 「第一行就是」属实。`channels.js:152` = `GET_TREE: "context-v2:get-tree"` 逐字命中；`register_handlers.js:30,642`、`preload/bridges/context_v2_bridge.js:86-87,219`、`preload/channels.js:115`、`src/SERVICEs/bridges/context_v2_bridge.js:39,108` 全部逐字命中。测试锚点 `context_v2_service.test.cjs:500`（测试名逐字一致）与 `:513`（断言 `…/spaces/space-1/tree?owner_chat_id=chat-1` 逐字一致）精确。**唯一缺陷**：Flask 路由登记为 `:1112-1120`，但其引用的 `@api_blueprint.get("/context/v2/memory/spaces/<space_id>/tree")` 装饰器实际在 **`:1111`**，落在所记范围之外；`:1112` 是 `@_endpoint`。差一行，内容无误。
- **可靠性**: 仓内 tracked 文件，跨 `unchain_runtime` / `electron` / `src` 三个产品目录，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 所声称的是「在当前 revision 上确认链路各段存在，不确认运行时行为」—— 边界划得准确，相关性成立。
- **来源归类**: 内部来源

---

#### S-0039 | ASSESSMENT | evidence-examiner → E-0007
- **阶段**: 议案庭审
- **结论**: 四个函数/路由锚点命中，**「零 store-owner 感知」的负向 grep 独立复跑为 0 匹配**，承重部分成立；两处措辞过强需收窄。
- **依据**: E-0007
- **不确定性**: E-0007 自陈「静态读取、未实跑该端点（本机无 Qdrant 数据）」的限制原样保留 —— 我同样无法实跑，**该限制未消除**。
- **请求/下一步**: 可承重。引用时须改两处措辞：路由范围写 `:406-453`；**删去或改写「该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`」**，改为「该文件的全部数据源访问均经 `memory_factory`」——后者为真且足以支撑同一结论。
- **评估结论**: 已验证
- **证据编号**: E-0007
- **来源类型**: general
- **真实性**: `_project_vectors` **`:344-370` 范围两端精确**（`def _project_vectors(` … `return coords, variance`），内部 `np.linalg.svd` 于 `:353` 逐字命中。`_kmeans_2d_numpy` **`:219` 精确**。`/memory/long-term/projection` **`:456` 精确**。`grep -n "store_owner\|memory_v2\|context_v2" route_projection.py` → **0 匹配，独立复跑确认**。**两处缺陷**：**(1)** `memory_projection` 路由登记为 `:406-452`，装饰器 `:406` 正确，但函数体实际延伸至 `:453`（`return jsonify({"error": str(exc)}), 500`），范围端点少一行。**(2)** 完整性限制称「该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`」**不准确** —— 实际另有 `memory_factory._load_session_state`（`:423`）与两处 `getattr(memory_factory, …)`（`:430,:435`）。四者**全部经 `memory_factory`（V1）**，故不改变结论方向，但「唯一」为假。
- **可靠性**: 仓内 tracked 文件 + 可复跑负向 grep。
- **相关性**: 所声称支持的是「`/memory/projection` 走 V1 旧向量集合逻辑，与 V2 store 无关」—— 零匹配 grep 直接支持该结论，且上述 (2) 的四个访问点全落 V1 侧，反而强化它。
- **来源归类**: 内部来源

---

#### S-0040 | ASSESSMENT | evidence-examiner → E-0008
- **阶段**: 议案庭审
- **结论**: 两条决定性负向结果（关键词表 0 文件命中、V2 侧 14 个 GET 路由）**逐字复现**；但第一条命令的登记转录**不是该命令的输出** —— 实际 8 行，登记 5 行，且遗漏了一个测试文件命中。
- **依据**: E-0008
- **不确定性**: E-0008 自陈「这是一个负向证明，强度受限于关键词表」的限制**完全成立，我未能消除也未尝试扩表**。若存在以完全不同命名实现的投影逻辑，本条与我的复核均看不到。
- **请求/下一步**: 承重时**只引第二、三条命令的结果**（0 文件 / 14 路由），它们是该负向结论的实际承重面。**第一条的「命中仅…5 处」一句为假，须删去或替换为实测 8 行。**
- **评估结论**: 已验证
- **证据编号**: E-0008
- **来源类型**: general
- **真实性**: 三条命令原样重跑。**第二条 `grep -rln "def .*projection_points\|\"x\":\|coords\|pca\|PCA\|umap\|t_sne\|tsne" memory_v2_*.py route_memory_v2.py` → 命中文件数 0，逐字复现。** **第三条 `grep -n "@api_blueprint.get" route_memory_v2.py` → 恰好 14 条，逐字复现**（并顺带交叉证实 E-0006/E-0013 的 `:1082/:1111/:1123` 三个路由行号）。**第一条不复现**：登记称「命中仅 `route_projection.py:219,345,353` 与 `routes.py:5,87`」，实际输出 **8 行**，多出 `route_projection.py:220`（`import numpy as np`）、`route_projection.py:296`（`root._kmeans_2d_numpy(...)`）与 **`tests/test_models_catalog_route.py:644`** —— 最后一条本应被 `grep -v "/tests/"` 滤掉，但该路径渲染为 `tests/…` 而非 `./tests/…`，**过滤器实际未生效**。三处遗漏**全部仍落在 `route_projection.py` / V1 侧**，故负向结论不受影响。
- **可靠性**: 仓内 tracked 文件 + 可复跑命令。缺陷属登记保真，非来源问题。
- **相关性**: 所声称支持的是「V2 侧无等价于 `/memory/projection` 的二维散点坐标生成逻辑」—— 由第二、三条命令直接支持，成立。
- **来源归类**: 内部来源

---

#### S-0041 | ASSESSMENT | evidence-examiner → E-0009
- **阶段**: 议案庭审
- **结论**: 「V2 连原始 embedding 都不出库」的三个结构性依据 —— `VectorHit` 字段集、`NullVectorBackend` 为默认、`status()` 硬编码 `"disabled"` —— **全部逐字复现**。两处范围端点差一行，非实质。
- **依据**: E-0009
- **不确定性**: E-0009 自陈「未逐一追查 `OllamaQdrantBackend` 内部是否在别处泄出向量」的限制**我同样未消除**；其「类型层面已封闭」的论据（`query() -> list[VectorHit]`）我确认属实，但类型标注不是运行时保证。
- **请求/下一步**: 可承重。若需要「向量不出库」作为**运行时**结论而非类型结论，须另行取证 `OllamaQdrantBackend` 实现体。
- **评估结论**: 已验证
- **证据编号**: E-0009
- **来源类型**: general
- **真实性**: `VectorHit` **`:152-155` 字段恰为 `(chunk_id, text_hash, score)`，逐字确认**（登记范围 `:151-156` 含装饰器与尾空行，端点宽一行）。`NullVectorBackend` **`:198` 起，`status()` 返回字面量 `"disabled"`（`:204`）、`query(self, text, *, limit) -> list[VectorHit]` 返回 `[]`（`:209-210`），逐字确认**；类文档串自述「The default backend」。`VectorConfig` `:57` 起、`enabled` 属性 `:118-119`（`bool(self.provider and not self.configuration_error)`）命中。`search_entries` **`:8425` 精确**，函数体确为 SQL/`casefold()` 词法检索。**两处非实质缺陷**：env 名登记为「三个」于 `:30-32`，该范围确含三个，但文件在 `:33` 另有第四个（`VECTOR_TIMEOUT_MS_ENV`）落在范围外；`NullVectorBackend` 登记 `:198-215`，实际 `close()` 的 `return None` 在 `:216`，端点少一行。
- **可靠性**: 仓内 tracked 文件，第三方可在 `b2385d5d` 完全复核。
- **相关性**: 所声称的是「支持并强化 Q3 结论」—— 三个依据均由所引原文直接导出，相关性成立。
- **来源归类**: 内部来源

---

#### S-0042 | ASSESSMENT | evidence-examiner → E-0011
- **阶段**: 议案庭审
- **结论**: 九个仓内代码锚点**全部逐字复现，零漂移**；`build/build_feature_flags.json` 内容亦逐字相符，**但该文件被 `.gitignore:51` 忽略、不入库**，故那一半是**本机观察而非仓库事实**，E-0011 的自证类判据对它不成立。**该缺陷不动摇本条的承重资格** —— 其结论由 tracked 的 `memory_v2_rollout.js:150` 独立支撑。
- **依据**: E-0011
- **不确定性**: **(1)** 我与提交方同机，`build/build_feature_flags.json`（789 字节，mtime 2026-08-03 22:23）与最近一次真实 release 的一致性**仍未核实**，该限制至今未消除。**(2)** 我未启动 Electron，落到 sidecar 进程的真实 env 仍是推断（其最后一段注入由 E-0022 补齐，不在本批）。
- **请求/下一步**: 三条须随 E-0011 一同引用，见下。另请注意：**本条自身不含任何「本机观察」标注** —— 提示中所指的那段标注属于 **E-0023**（`code-owner-settings`，S-0010），不属 E-0011。
- **评估结论**: 已验证
- **证据编号**: E-0011
- **来源类型**: general
- **真实性**: 逐点定点读取。**`memory_v2_rollout.js:150` = `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";` 逐字符命中**；`:14-20` env 键表**范围两端精确**（`Object.freeze({` … `});`，五键齐全）；`:135-141`（ceiling / mode / `effectiveMode` 取小）**范围两端精确**；`:216-218` 快照路径二选一**逐字命中**；`:261-266`（`allowProcessOverrides: !app.isPackaged`）**范围两端精确**。`memory_v2_store_boundary.py:96` = `raw = source.get(CONTEXT_V2_STORE_OWNER_ENV, STORE_OWNER_PUPU_LEGACY)` **逐字命中**。`memory_v2_runtime.py:694-735` 命中。`package.json:40` `start:electron` 一行**逐字符命中**。`grep -rn "PUPU_CONTEXT_V2_STORE_OWNER"` 排除测试 → **产品代码恰好 2 处**（`memory_v2_rollout.js:19` · `memory_v2_store_boundary.py:24`），**逐字复现**。`build/build_feature_flags.json` 内容与登记的「关键原文」**逐字相符**（`"enable_memory_v2": false`；`sidecar_environment` 五键含 `PUPU_CONTEXT_V2_STORE_OWNER: "off"`）。**唯一缺陷**：该文件 `git ls-files` 无记录、`git check-ignore` 命中 `.gitignore:51 build/` —— **不入库，第三方无法在 `b2385d5d` 复核**。
- **可靠性**: 九个代码锚点为仓内 tracked 文件，可靠性高；`build/build_feature_flags.json` 为**本机构建产物**，可靠性等同于 E-0023 就 `.local` 一份所声明的等级，**但 E-0011 未作同等声明**。
- **相关性**: **成立，且强于其自身论证。** 承重主张是「`memory_v2_store.py:7408 get_tree` 在两种真实配置下均不执行」。该主张的真正支撑是 `:150` 一行 —— `storeOwner` 是**严格二元 `off | unchain`**，`pupu_legacy` 从该函数**任何输入下都不可达**，这是一条**完全 tracked、逐字符已验**的仓库事实。两个不入库制品只决定二元中取哪一个值，**不决定结论方向**。我另行读取 `.local/build_feature_flags.snapshot.json`（273 字节，mtime 2026-08-04，`"enable_memory_v2": true`，无 `_pupu_memory_v2_release` 块，与 E-0023 所载逐字相符）确认：本机 dev 下 `featureEnabled` 为真 → 读 env → `all` → `unchain`；即使该文件缺失或为 false，`:135-140` 短路 → `off`。**两条路径都不是 `pupu_legacy`。**
- **来源归类**: 内部来源（含一份不入库的本机构建产物）

**须随 E-0011 一同引用的三条收窄**

1. **不入库半边须按本机观察采纳。** `build/build_feature_flags.json` 与 `.local/build_feature_flags.snapshot.json` **均被 gitignore**（`.gitignore:51 build/` · `.gitignore:20 /.local/`）。E-0011 的证据类型判据「仓内文件字面内容与行号 → 自证类」**对前者不成立**，其完整性限制 (2) 只披露了「未核实与 release 的一致性」，**未披露不入库这一更根本的缺陷**。
2. **E-0011 的结论可承重，其两行配置表不可。** 结论（Electron 启动的 sidecar 永不选中 `pupu_legacy` store）由 tracked 的 `:150` 独立支撑；**表中「packaged → off」「dev → unchain」两个具体取值各自依赖一份不入库制品**，只能按本机观察采纳。此点与 E-0023「部分反驳 E-0011 表格的 dev 行 ——「`npm start` → `unchain`」不是仓库属性」的判断**一致，本复核予以证实**。
3. **适用边界须写明：该二元性是 `memory_v2_rollout.js` 的属性，即 Electron 启动路径的属性。** `memory_v2_store_boundary.py:96` 在 env 缺失时默认 `pupu_legacy` —— **绕过 Electron 启动的 sidecar（独立 `python main.py`，或 E-0010 / E-0012 所用的 harness）确实可达 `pupu_legacy`**。E-0011「两种真实配置」隐含以 Electron 为限，引用时须显式带上该限定，否则会与 E-0010 / E-0012 的观察产生表面冲突。

**就提示所问的 E-0023 标注是否恰当（不构成对 E-0023 的 `ASSESSMENT`，E-0023 不在本批）**：**就 `.local/build_feature_flags.snapshot.json` 而言恰当且准确** —— 我独立读取该文件，内容、字节数、mtime 与 E-0023 所载逐字相符；其「不入库 / 不可由他人在同 revision 复核 / 须按本机观察而非仓库事实采纳」三句**判断正确，措辞精准**。**但该标注涵盖不足**：E-0023 的证据类型判据把 `build/build_feature_flags.json` 归入「仓内文件（js / package.json / build json）→ 自证类」，而 `build/` **同样被 gitignore**，具备**完全相同**的缺陷却未获同等标注。建议 `speaker-of-the-house` 将该「本机观察」限定**同时适用于两份制品**。

---

#### S-0043 | ASSESSMENT | evidence-examiner → E-0013
- **阶段**: 议案庭审
- **结论**: 门清单侧的全部锚点**逐字复现，零漂移**，capability 检查不在 `get_tree` 读路径上一节独立证实；但 `ensure_space` 的「全部产品调用点」清单**不是所述命令的输出**，漏了两个文件，其中一处触及该证据所支持的第二个结论。
- **依据**: E-0013
- **不确定性**: 我未判断遗漏的调用点是否改变「空态最常见成因」这一实体结论 —— **该判断不属证据审查范围**，留给方案庭审。
- **请求/下一步**: **门清单部分（`_endpoint` / `_read_runtime_for_store_owner` / `_status_for_store_owner` / capability 唯一使用点 / 三个路由 / `list_spaces` / `ensure_space` 定义）可径行承重。** 第二个结论「space 由 memory toolkit 惰性创建」须收窄，见真实性栏。
- **评估结论**: 已验证
- **证据编号**: E-0013
- **来源类型**: general
- **真实性**: 逐点定点读取。**`route_memory_v2.py:68-106` `_endpoint` 范围两端精确**（`def _endpoint(function)` … `return wrapped`）；**`:315-361` `_read_runtime_for_store_owner` 范围两端精确**；**`:786-831` `_status_for_store_owner` 范围两端精确**。**capability grep 逐字复现**：`context_memory_v2_capability_status` / `resolve_context_memory_v2_capability` 在该文件**恰好 4 处** —— `:16,:17` 导入 + `:987,:1004` 使用，**与登记完全一致，故「capability 检查不在 `get_tree` 读路径上」由该 grep 直接证成**。三个路由 `:1082`（spaces）`:1111`（tree）`:1123`（entries）**逐一精确**。`memory_v2_store.py:6467` = `def ensure_space(`、`:6619` = `def list_spaces(`、`:6639` = `return {"owner_chat_id": owner, "spaces": […]}` **逐字命中**。`memory_v2_runtime.py:694-735` 命中。**缺陷**：登记称 `memory_v2_toolkit.py:642,659,663,688,946,982,1002,1087,1392,1528,1672` 为「`ensure_space` 的**全部产品调用点**」，但所述命令（`grep -rn "ensure_space" … | grep -v /tests/`）的实际输出**另含三个文件**：`unchain_adapter.py:365,366,384`（其 `:384 space = ensure_space(...)` 是一次真实的空间创建调用）、`context_memory_v2_repository.py:2934`（`self._store.ensure_space(`）、`route_memory_v2.py:418,1100`。**其中 `route_memory_v2` 一对已由 E-0013 完整性限制中的 `getattr` 动态派发一节披露；`unchain_adapter.py` 与 `context_memory_v2_repository.py` 两处未获披露。**
- **可靠性**: 仓内 tracked 文件 + 可复跑 grep。缺陷属登记保真，非来源问题。
- **相关性**: **对第一个结论（完整门清单）成立且强**。**对第二个结论（「space 由 memory toolkit 惰性创建，是空态的最常见成因」）须收窄** —— `unchain_adapter.py:384` 表明 chat adapter 侧亦存在创建路径，故「由 memory toolkit 创建」不是穷举的创建者集合。该收窄只针对**证据的覆盖面**，不针对结论本身的真伪。
- **来源归类**: 内部来源

---

#### S-0044 | ASSESSMENT | evidence-examiner → E-0014
- **阶段**: 议案庭审
- **结论**: 两侧五个锚点**全部逐字复现**；其核心主张（两个 `get_tree` 返回不同字段集与不相交的叶子 `kind` 词汇表）我**独立追至两侧的权威定义处闭合确认**，包括登记未引的 pupu_legacy 侧 kind 约束。本批证明力最强的一条。
- **依据**: E-0014
- **不确定性**: E-0014 自陈「纯静态比对、未在 `store_owner=unchain` 下实跑」的限制**完全成立，我同样无法实跑**（同机同缺陷）。故「运行时字段确实如此」在本复核后**仍是推断，不是观察**。
- **请求/下一步**: 主结论与限制 (1)(2) 可承重。**限制 (3) 依传唤指令不在本次复核范围**，我未触碰亦不重开 —— 其归属仍在 E-0061 / S-0028。
- **评估结论**: 已验证
- **证据编号**: E-0014
- **来源类型**: general
- **真实性**: 两仓逐点定点读取（unchain `a4e69f4` 工作树 **0 dirty**，锚点前提最强）。**`memory_v2_store.py:6641` 起 `_entry_response` 逐字确认**：`created_at_ms` / `updated_at_ms` / `created_by` 在基础字段集内，`content_bytes` 在 `if row["kind"] == "file"` 分支内 —— **四项 pupu_legacy 独有字段全部证实**（登记范围端点 `:6669` 少一行，`return response` 在 `:6670`，非实质）。**`memory_v2_unchain_read_adapter.py:532-567` `_route_entry` 范围两端精确**，`tags` 与 `source_refs` 在其响应体内、上述四项**一个都不在** —— **两侧字段集不同，证实**。`:411`（`def list_entries(`）与 `:452`（`return {**listing, "tree": roots}`）精确，**且与 `memory_v2_store.py:7434` 逐字相同 —— 限制 (2) 的「树装配算法字面等价」独立证实**。`:357` `_workspace_entries` 与 `:382` 分页逻辑命中。unchain `models.py:251-255` = `MemoryEntryKind(StrEnum)` {FOLDER, MARKDOWN, IMAGE, LINK} **逐字精确**。**我另行闭合了登记未引的一环**：pupu_legacy 侧的 kind 约束在 `memory_v2_store.py:845` 的 SQL CHECK —— `kind IN ('folder', 'file', 'link')`，恰好三种。**故两侧词汇表的交集恰为 `{folder, link}`，pupu_legacy 独有 `file`，unchain 独有 `markdown` / `image` —— E-0014 的「`folder` 与 `link` 是两侧共有的仅有两个 kind」一句，逐字为真。**
- **可靠性**: 两仓 tracked 文件（PuPu `b2385d5d` + unchain `a4e69f4`，后者工作树全净），第三方可完全复核。
- **相关性**: 所声称的是「证实可证伪条件 4 的前半」—— 由所引原文直接导出，且经我追加的 `:845` 一环后闭合度高于登记时。
- **来源归类**: 内部来源（跨两个内部仓库）

---

## 批次小结（供 `speaker-of-the-house` 编入闭庭产出）

| 证据 | 评估结论 | 时效性 | 须随附条件 |
|---|---|---|---|
| E-0001 | 已验证 | 承重部分成立 | dirty 计数 8→49、分布断言失效，两句不得引 |
| E-0002 | 已验证 | 命中块成立，未命中块失效 | 「未命中（2 个）」不得承重；分类应为须查类（已由本关治愈） |
| E-0003 | 已验证 | 完全成立 | 无 |
| E-0004 | 已验证 | 完全成立 | `service.js:2108` 一行须改引 E-0006 |
| E-0005 | 已验证 | 完全成立 | 无 |
| E-0006 | 已验证 | 完全成立 | 路由行号改 `:1111-1120` |
| E-0007 | 已验证 | 完全成立 | 「唯一的数据源调用」须改写；范围改 `:406-453` |
| E-0008 | 已验证 | 完全成立 | 「命中仅…5 处」为假，只引第二、三条命令 |
| E-0009 | 已验证 | 完全成立 | 「不出库」为类型结论，非运行时结论 |
| E-0011 | 已验证 | 完全成立 | 三条收窄（见 S-0042），不入库半边按本机观察采纳 |
| E-0013 | 已验证 | 完全成立 | 门清单可承重；「toolkit 惰性创建」须收窄 |
| E-0014 | 已验证 | 完全成立 | 运行时仍为推断；限制 (3) 不在本次范围 |

**12 条全部为「已验证」，10 条附带须随引条件。**

**三条批次级观察**

1. **零时效衰减。** 本批**无一条**发生行号漂移、内容改动或文件消失。查出的全部缺陷都是**登记时即存在的保真缺陷**，而非七小时内的变化。产品目录在四个时点（含本次最晚时点）测得零 dirty。
2. **一个反复出现的缺陷模式：登记的命令转录 ≠ 该命令的实际输出。** E-0004、E-0008、E-0013 三条各自把一份**经人工筛选的子集**呈现为「全部足迹 / 命中仅 / 全部产品调用点」。三次的遗漏项都不改变结论方向，**但三次都出现在同一位置：负向或穷举性断言**，而这恰是最容易被下游当作封闭集使用的断言形态。建议 `speaker-of-the-house` 在闭庭产出中记一条通用告诫：**引用穷举性 grep 结论时须核对命令输出本身，不得依赖登记摘要。**
3. **不入库制品的标注纪律不统一。** E-0023 对 `.local/build_feature_flags.snapshot.json` 作了准确且措辞精准的就地标注，E-0011 对具备**完全相同缺陷**的 `build/build_feature_flags.json` **未作任何标注**，且 E-0023 自身也把后者误归为「仓内文件」。两份制品应适用同一条采纳规则。
