---
case_id: 0000-0008-2026-0808
updated_at: 2026-08-08T16:40:00-07:00
---

# 证据记录

追加式。本 case 的 `E-####` 为 **本地序列**，与 `0000-0003-2026-0807` 独立。援引前案一律写作 `0000-0003-2026-0807#S-####` / `#E-####`。

每条证据须标注 **证据类型**（依 [`evidence-rules.md` 第三节](../../../codex/lifecycle/evidence-rules.md) 四类：`自证类 / 须查类 / 传闻类 / 证言类`）。分类 **不由提交人自选，由判据决定**：

- **自证类** 免检，但被质疑时强制审查，且 **进入承重集合时免检失效**
- **须查类** 与 **证言类** 无需质疑即强制审查
- **传闻类** 不得用于证明其所述事实为真，只能证明「该陈述曾被作出」

---

### E-0001 | repository | 自证类
- **来源定位**: PuPu `b2385d5d`（branch `dev`）· unchain `a4e69f4`（branch `dev`）
- **取得方式**: `git rev-parse --short HEAD` · `git branch --show-current` · `git status --porcelain`，两仓各一次，2026-08-08T16:30-07:00
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 已知事实（本庭全部 `file:line` 锚点的固定 revision）
- **完整性限制**: PuPu 工作树 8 个 dirty/untracked 条目 **全部位于 `.claude/court/cases/**`**；`src/` `electron/` `unchain_runtime/` 三个产品目录 **零 dirty**。故本庭引用的产品代码锚点与 HEAD 一致。**未检查是否有并发会话在庭审期间改动产品目录** —— 承重复核时须重测。PuPu HEAD 与 `0000-0005-2026-0807#E-0001` 所载 **相同**（`b2385d5d`）
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑）| 两仓 HEAD 如上
  - S-0033 | **已验证（承重部分）· 承重复核** | 两仓 revision 与 **三个产品目录零 dirty 在闭庭时点仍然成立**（**第四次、最晚时点**的重测）。**但 dirty 计数与分布两句今日为假**：由 8 涨至 **49**（21 modified + 28 untracked），且 **不再全部位于 `.claude/court/cases/**`** —— 增量全落 `.claude/agent-memory/`(32) `.claude/agents/`(1) `.claude/codex/`(2) 与四个案卷目录(14)。**引用时只引 revision 与「产品目录零 dirty」两项，dirty 计数与分布两句须替换或删去。** 承重部分不受影响

### E-0002 | tool-output | 自证类
- **来源定位**: `python3 .claude/skills/case/summon.py .claude/court/cases/0000-0008-2026-0808/case.md`
- **取得方式**: 可复跑命令，2026-08-08T16:32-07:00
- **提交发言**: S-0003
- **支持/反驳**: 支持 S-0003 传唤第一层的机械命中部分；**同时暴露其覆盖不到的两类**（概念名、`src/COMPONENTs/` 这种跨 owner 前缀）
- **完整性限制**: 工具 **不对触发条件类角色作任何判定**，只打印 11 个角色与边界原文并标注「须人工对照」（同 `0000-0005-2026-0807#E-0007`）。仓外实体一律不可见
- **验证历史**:
  - S-0003 | 已验证（speaker 实跑）| 输出如下

  ```
  === 必到名单草案 · 路径边界机械命中（5 人）===
    code-owner-electron               12 处
    code-owner-runtime                 3 处
    codex                              1 处   e.g. pupu:.claude/codex/adaptations.md
    code-owner-settings                1 处   e.g. pupu:src/COMPONENTs/memory-inspect/**
    code-owner-shared-arteries         1 处   e.g. pupu:src/SERVICEs/bridges/context_v2_bridge.js

  === 概念名候选（不自动入名单）===
    expert-llm                       <- memory_factory

  === 裸文件名歧义（同名多解，全部计入）===
    context_v2_bridge.js -> electron/preload/bridges/context_v2_bridge.js,
                            src/SERVICEs/bridges/context_v2_bridge.js
    service.js           -> electron/main/services/{boot_readiness,chat_storage,memory_vault,
                            ollama,runtime,screenshot,settings_storage,unchain,update}/service.js

  === 未命中任何路径 owner 且不在 A-009 豁免内（2 个）===
      pupu:/memory/projection
      pupu:src/COMPONENTs/
  ```
  - S-0034 | **已验证（部分块失效）· 承重复核** | 5 人路径命中块、概念名候选、裸文件名歧义 **逐字复现**；**但「未命中（2 个）」今日输出「（10 个）」**，新增 8 条系 `case.md` 自身在庭审中新增的跨案援引。**该块不得承重。** **另查出一处分类错误**：本条输入 `case.md` **不入库且可变**，**不满足自证类判据，正确分类为须查类** —— 该缺陷 **因本次承重复核已被实际治愈**，无需另补程序

### E-0003 | repository | 自证类
- **来源定位**: `pupu:src/COMPONENTs/side-menu/side_menu.js:48-50, 772-779` · `pupu:src/COMPONENTs/settings/memory/index.js:14, 474-478`
- **取得方式**: `grep -rn "MemoryInspectModal" src --include="*.js"`，排除 `src/COMPONENTs/memory-inspect/` 自身；对两处命中各读取其 JSX 调用块
- **提交发言**: S-0003
- **支持/反驳**: 支持 S-0003 的名单补正（`code-owner-chat-core` 入列）；支持 S-0002 已知事实 3
- **完整性限制**: 只覆盖字面标识符 `MemoryInspectModal`。**未核实** 是否存在经变量/动态 import 的第三处挂载。未运行应用，未观察实际挂载行为
- **验证历史**:
  - S-0003 | 已验证（speaker 实跑）| `MemoryInspectModal` 在 `src/` 下 **有且仅有两个挂载点**，且传入的 props 不同：

  ```
  src/COMPONENTs/side-menu/side_menu.js:772   （lazy import，:48-50）
      <MemoryInspectModal
        open={memoryInspect.open}
        sessionId={memoryInspect.sessionId}
        chatTitle={memoryInspect.chatTitle}
        onClose={...} />

  src/COMPONENTs/settings/memory/index.js:474 （静态 import，:14）
      <MemoryInspectModal
        open={inspectOpen}
        onClose={...}
        mode="long_term" />
  ```

  **净效果**：`case.md` Q1 所述的挂载接口 `{open, sessionId, chatTitle, onClose}` 是 **side-menu 那一处** 的实际形状，该文件落在 `pupu:src/COMPONENTs/side-menu/**` —— `code-owner-chat-core` 的边界。settings 那一处 **连 `sessionId` 都不传**，走 `mode="long_term"`。**两个挂载点的 props 集合不同，是两条不同的调用契约。**
  - S-0035 | **已验证** · 承重复核 | 两个挂载点、两组 props、四处行号 **全部逐字复现，零漂移**，范围端点精确。审查人另独立重跑 grep 确认 `src/` 下排除自身后 **有且仅有两个挂载点**。**本批质量最高的三条之一，可径行承重，无需附条件**

### E-0004 | repository | 自证类
- **来源定位**: `grep -rn "getTree\|GET_TREE" src electron --include="*.js" --include="*.cjs"`
- **取得方式**: 全仓字面 grep，2026-08-08T16:33-07:00
- **提交发言**: S-0002, S-0003
- **支持/反驳**: **支持** `case.md` Q1「`src/COMPONENTs/` 下零消费者」这一条 —— 但把它收窄为可判定的形式
- **完整性限制**: 只覆盖字面标识符 `getTree` 与 `GET_TREE`。**未核实** 是否存在以字符串拼接或 `invokeBridge("get" + "Tree")` 形式的旁路调用
- **验证历史**:
  - S-0003 | 已验证（speaker 实跑）| `getTree` / `GET_TREE` 在 `src/` 与 `electron/` 下的 **全部** 足迹：

  ```
  产品代码（非测试）:
    src/SERVICEs/bridges/context_v2_bridge.js:39,108   （方法名白名单 + 转发实现）
    electron/preload/bridges/context_v2_bridge.js:86,219
    electron/preload/channels.js:115
    electron/shared/channels.js:152                     GET_TREE: "context-v2:get-tree"
    electron/main/ipc/register_handlers.js:30,642       -> "getContextV2Tree"
    electron/main/services/unchain/service.js:2108      const getContextV2Tree

  测试:
    src/SERVICEs/bridges/context_v2_bridge.test.js:14
    src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:249   getTree: noop  （mock）
    electron/tests/main/ipc_channels.test.cjs:367
    electron/tests/preload/context_v2_bridge.test.cjs:33,101,218
    electron/tests/preload/api_contract.test.cjs:89,260-262

  src/COMPONENTs/ 下: 零命中（产品代码与测试均无）
  ```

  **净效果**：`src/COMPONENTs/**` 下 **确无 `getTree` 消费者**。但 `src/` 下并非零足迹 —— `src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:249` 已在 mock 里 stub 了 `getTree`，该文件落在 `code-owner-chat-core` 的边界。
  - S-0036 | **已验证** · 承重复核 | 承重的负向主张「`src/COMPONENTs/**` 下零 `getTree` 消费者」**独立实跑确认为真**。**但「全部足迹」清单不是所述命令的输出**：`service.js:2108` 一行 **出处误植**（字面 `getTree` 在该文件出现 0 次，`getContextV2Tree` 不含该子串），另遗漏 preload bridge `:12` 注释行、`api_contract.test.cjs` 范围虚指（实为 `:89,260,262`，`:261` 无命中）。**`service.js:2108` 须改由 E-0006 引用**

### E-0005 | repository | 自证类
- **来源定位**: `grep -rn "context_v2_bridge" src --include="*.js"`，排除 `*.test.js`
- **取得方式**: 全仓字面 grep，2026-08-08T16:33-07:00
- **提交发言**: S-0003
- **支持/反驳**: 支持 S-0003 的名单补正（`code-owner-chat-bubble` 入列）
- **完整性限制**: 只覆盖对 `src/SERVICEs/bridges/context_v2_bridge` 的 **字面 import**。未追传递依赖（经其他模块间接消费者未计）
- **验证历史**:
  - S-0003 | 已验证（speaker 实跑）| `src/` 下 **仅四个非测试文件** import `context_v2_bridge`，其中 **三个在 `src/COMPONENTs/chat-bubble/`**：

  ```
  src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:2-4    contextV2Bridge + 具名导出
  src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:2-4   contextV2Bridge + 具名导出
  src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:2         contextV2Bridge
  src/PAGEs/chat/hooks/use_chat_stream.js:89                    （具名导出）
  ```

  且这三个 chat-bubble 文件 **都以 `ownerChatId` 为入参**（`memory_v2_journal_reload.js:239,248,262,271,282,286,291…` · `memory_v2_trace_audit.js:66,77-78,90,248,259,269,353,355,358,378`），并已就地处理 `context_v2_unavailable` / `context_v2_journal_unavailable` 等错误码（`memory_v2_journal_reload.js:274,294,391,516-521` · `memory_v2_pending_reviews.js:31-38,183,299`）。

  **净效果**：**`src/COMPONENTs/` 下并非「零 V2 读消费者」，只是零 `getTree` 消费者。** 已存在的三个消费者全在 `chat-bubble`，且它们 **今天就拿得到 `ownerChatId`** —— 这一事实与 `case.md` Q1 的疑点（「modal 今天拿不到这个值」）指向同一个变量的两种不同处境。
  - S-0037 | **已验证** · 承重复核 | 四个 import 点、三个 chat-bubble 消费者、两串 `ownerChatId` 行号表、两组错误码处理点 **全部逐字复现，零缺陷**。**本批最干净的一条，可径行承重**

### E-0006 | repository | 自证类
- **来源定位**: 见下表逐行
- **取得方式**: 对 `case.md` Q1 自述的六段链路逐段 `grep -n` + 定点读取，2026-08-08T16:34-07:00
- **提交发言**: S-0002
- **支持/反驳**: **在当前 revision 上确认** `case.md` Q1 所述链路各段的存在与行号；**不确认** 其运行时行为
- **完整性限制**: **只确认代码存在与调用形状，未运行 sidecar、未发过一次真实请求、未观察任何返回体。** 端点在 `store_owner=off` / store 为空 / 缺 `owner_chat_id` 三种情况下的实际返回，**本庭一律未观察**（Q4 正是问这个，归 `code-owner-runtime`）
- **验证历史**:
  - S-0002 | 已验证（speaker 实跑，仅限「代码存在」）| 六段锚点：

  | 段 | 锚点 | owner |
  |---|---|---|
  | Flask 路由 | `unchain_runtime/server/route_memory_v2.py:1112-1120`（`@api_blueprint.get("/context/v2/memory/spaces/<space_id>/tree")` → `context_v2_tree`，取 `request.args.get("owner_chat_id", "")`） | `code-owner-runtime` |
  | store | `unchain_runtime/server/memory_v2_store.py:7408-7434`（`get_tree(*, owner_chat_id, space_id, allow_long_term=False, namespace="")`，内部先调 `list_entries`，再按 `path` / `parent_path` 组树，返回 `{**listing, "tree": roots}`） | `code-owner-runtime` |
  | 主进程 | `electron/main/services/unchain/service.js:2108-2116`（`getContextV2Tree`，**先过 `requireContextV2OwnerChatId(payload?.ownerChatId)`**，再拼 `owner_chat_id` query） | `code-owner-electron` |
  | IPC channel | `electron/shared/channels.js:152`（`GET_TREE: "context-v2:get-tree"`）· `electron/main/ipc/register_handlers.js:30,642` | `code-owner-electron` |
  | preload bridge | `electron/preload/bridges/context_v2_bridge.js:86-87,219` · `electron/preload/channels.js:115` | `code-owner-electron` |
  | renderer facade | `src/SERVICEs/bridges/context_v2_bridge.js:39,108`（`getTree: (payload) => invokeBridge("getTree", [payload])`） | `code-owner-shared-arteries` |
  | 主进程测试 | `electron/tests/main/context_v2_service.test.cjs:500,513`（断言 `…/spaces/space-1/tree?owner_chat_id=chat-1`，测试名 `"space, tree and entry reads are owner-scoped and path-validated"`） | `code-owner-electron` |

  **净效果**：`case.md` Q1 自述的链路 **六段全部存在**，行号如上。**同时新增一条 Q1 相关的硬事实**：主进程侧 `getContextV2Tree` 的第一行就是 `requireContextV2OwnerChatId(...)` —— `ownerChatId` 在 Electron main 层是 **必需参数而非可选**。其缺失时的具体行为（抛错 / 返回错误码 / 返回何种形状）**本庭未核实**，归 `code-owner-electron`。
  - S-0038 | **已验证** · 承重复核 | 六段链路 + 测试锚点共七处 **全部存在且行号命中**，store 段与主进程段 **范围两端精确**，`:2109` 确为 `requireContextV2OwnerChatId(...)`（「第一行就是」属实）。**唯一缺陷**：Flask 路由登记 `:1112-1120`，装饰器实际在 **`:1111`**，落在所记范围外 —— **引用时行号写 `:1111-1120`**。另注：本条只记 `getContextV2Tree` 必需 `ownerChatId`，**未记它同时必需 `spaceId`**（该补充在 E-0018）

### E-0007 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:344-370`（`_project_vectors`）· `:219`（`_kmeans_2d_numpy`）· `:406-452`（`memory_projection` 路由）· `:456`（`/memory/long-term/projection`）
- **提交发言**: S-0004
- **取得方式**: `grep -n "def _project_vectors" -A 35 route_projection.py`；`sed -n '390,470p' route_projection.py`；`grep -n "store_owner\|memory_v2\|context_v2" route_projection.py`（**匹配数 0**）
- **支持/反驳**: **支持** 案 Q3 中书记员自查的 V1 半边（`/memory/projection` 走 `memory_factory` 旧向量集合逻辑，与 V2 store 无关）
- **完整性限制**: 静态读取，未实跑该端点（本机无 Qdrant 数据）。「零 store-owner 感知」是对三个字面标识符（`store_owner` / `memory_v2` / `context_v2`）的全文匹配，**未覆盖** 经间接调用抵达 V2 的可能路径 —— 但该文件唯一的数据源调用是 `memory_factory._get_or_create_qdrant_client`，故间接路径的可能性极低
- **证据类型判据**: 仓内文件的字面内容与行号，可由任何人在同一 revision 直接复核 → 自证类
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0039 | **已验证** · 承重复核 | 四个锚点命中，**「零 store-owner 感知」负向 grep 独立复跑为 0 匹配**，承重部分成立。**两处措辞须收窄**：路由范围应为 `:406-453`（函数体延伸一行）；**「该文件唯一的数据源调用是 `_get_or_create_qdrant_client`」为假** —— 另有 `_load_session_state`(:423) 与两处 `getattr`(:430,:435)，**四者全经 `memory_factory`（V1），故不改变结论方向反而强化它**，但「唯一」须改写为「全部数据源访问均经 `memory_factory`」

### E-0008 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/` 全目录负向搜索
- **提交发言**: S-0004
- **取得方式**（可复跑，须在该目录下执行）:
  ```
  grep -rn "numpy\|np.linalg\|linalg.svd" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  grep -rln "def .*projection_points\|\"x\":\|coords\|pca\|PCA\|umap\|t_sne\|tsne" memory_v2_*.py route_memory_v2.py
  grep -n "@api_blueprint.get" route_memory_v2.py
  ```
- **支持/反驳**: **支持** 书记员自查的 V2 半边（V2 侧无等价于 `/memory/projection` 的二维散点坐标生成逻辑）
- **完整性限制**: 第一条命中仅 `route_projection.py:219,345,353` 与 `routes.py:5,87`（再导出）；第二条 **命中文件数 0**；第三条列出 V2 全部 14 个 GET 路由。**这是一个负向证明**，其强度受限于关键词表 —— 若存在以完全不同命名实现的投影逻辑（如自研线性代数、非 numpy 实现），本搜索看不到。我认为可能性低但 **不能排除**
- **证据类型判据**: 可复跑命令 + 仓内文件 → 自证类
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0040 | **已验证** · 承重复核 | 两条决定性负向结果（关键词表 **0 文件命中**、V2 侧 **14 个 GET 路由**）**逐字复现**，并顺带交叉证实 E-0006/E-0013 三个路由行号。**但第一条命令的登记转录不是该命令的输出**：实际 **8 行**，登记 5 行，遗漏 `route_projection.py:220,296` 与一个测试文件命中（其 `grep -v "/tests/"` 因路径渲染为 `tests/…` 而 **实际未生效**）。三处遗漏 **全部仍落 V1 侧**，负向结论不受影响。**承重时只引第二、三条命令的结果**

### E-0009 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `memory_v2_vector.py:30-32`（三个 env 名）· `:57-120`（`VectorConfig.from_environ` / `enabled`）· `:151-156`（`VectorHit`）· `:198-215`（`NullVectorBackend`）· `memory_v2_store.py:8425-8470`（`search_entries`）
- **提交发言**: S-0004
- **取得方式**: 定点读取上述行段；`grep -n "^class \|^    def \|^def " memory_v2_vector.py`
- **支持/反驳**: **支持并强化** Q3 结论 —— V2 不仅没有投影，**连原始 embedding 都不出库**：`VectorHit` 字段仅 `(chunk_id, text_hash, score)`；`search_entries` 是 FTS5/子串词法检索；V2 向量后端在 `PUPU_MEMORY_V2_VECTOR_PROVIDER` 未设时为 `NullVectorBackend`
- **完整性限制**: 我读的是 `MemoryV2VectorCoordinator` 的对外接口与 `VectorHit` 定义，**未逐一追查** `OllamaQdrantBackend` 内部是否在别处泄出向量；但其 `query()` 的返回类型标注即 `list[VectorHit]`，类型层面已封闭
- **证据类型判据**: 仓内文件字面内容 → 自证类
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0041 | **已验证** · 承重复核 | 三个结构性依据（`VectorHit` 字段集 · `NullVectorBackend` 为默认 · `status()` 硬编码 `"disabled"`）**全部逐字复现**，类文档串自述「The default backend」。两处范围端点差一行，非实质。**一条收窄**：「向量不出库」是 **类型层面结论**（`query() -> list[VectorHit]`），**不是运行时保证** —— 提交方自陈「未逐一追查 `OllamaQdrantBackend` 内部」的限制 **审查人同样未消除**

### E-0010 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`，2026-08-08
- **提交发言**: S-0004
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
- **验证历史**:
  - S-0004 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0007 | **已验证** | `evidence-examiner` **原样复跑成功，三行输出逐字一致**（`space_id` 随机值除外，条目本已省略）；同批 5 项补充观察亦逐项复跑一致，无篡改迹象。**但相关性经收窄，三处须随证据一同引用**：**(1)** 200 空态臂 **只在 `store_owner=pupu_legacy` 下取得，而 Electron 从不发出该值**（`memory_v2_rollout.js:150`）—— 两个产品实际会发出的 owner 之下，实测均为 503（`unchain`→`context_v2_unchain_read_unavailable` · `off`→`context_v2_store_disabled`）。**Q4 最依赖的那一臂不是在产品配置下取得的。** **(2)** 三态是 **优先级有序** 而非彼此正交：store owner 门严格先于参数校验（`route_memory_v2.py:1114-1119`），实测 `off` + 空 `owner_chat_id` → **503 而非 400**，停用态会 **掩盖** 非法请求态；「两两不重叠」不宜被解读为「可各自独立检出」。**(3)** 503 是 **多路复用** 的（至少 5 个码），**任何据 HTTP status 单独判定停用态的下游设计不被本条支持**，必须分支于 `error.code`。**对提交方自陈限制的两处更正**：限制 (2)「错误包装未参与」**高估了自身风险** —— 三条响应带 `retryable` 字段，由 `_error_response`（`route_memory_v2.py:55-65`）产出，`routes._json_error` 替身 **完全不在路径上**，真实错误包装实际参与了；限制 (3) **隔离了被污染的输出，未隔离被塌缩的作用域**（见 (1)），**故该不充分结论依审查人声明同样传导至 E-0012**。另发现一处未自陈的保真缺口（`route_auth` 未进 `sys.modules`，`reject_non_loopback_requests` 未注册），**判为非实质**（`test_client` remote_addr 为 `127.0.0.1`，注册亦放行）。出处 `tests/test_route_memory_v2.py` 属实，**行号应为 `:31-38` 而非 `:29-38`**，笔误级。**保管链声明**：复核与原观察 **同机同环境同缺陷**（`import unchain` 失败），故本次复跑证成可复现性，**不构成独立第二环境的佐证**

### E-0011 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:150`（`const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`）· 同文件 `:14-20`（env 键表）· `:135-141`（ceiling ∧ mode 取小）· `:216-218`（snapshot 路径）· `:261-266`（`allowProcessOverrides: !app.isPackaged`）· `unchain_runtime/server/memory_v2_store_boundary.py:96`（env 缺失默认 `pupu_legacy`）· `unchain_runtime/server/memory_v2_runtime.py:694-735` · `/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json` · `/Users/red/Desktop/GITRepo/PuPu/package.json` `scripts.start:electron`
- **提交发言**: S-0004
- **取得方式**: 定点读取 + `grep -rn "PUPU_CONTEXT_V2_STORE_OWNER" electron/ src/ unchain_runtime/ | grep -v /tests/`（产品代码中 **仅 2 处**：上述 js:19 与 py:24）+ `cat build/build_feature_flags.json`
- **支持/反驳**: **反驳** 本庭「已知事实 2」的隐含前提 —— E-0006 锚定的 `memory_v2_store.py:7408 get_tree` 在两种真实配置下 **均不执行**。**支持** Q1 结论「默认配置下管线走不到 `get_tree`」
- **关键原文**:
  - `build/build_feature_flags.json`：`"enable_memory_v2": false`，且 `_pupu_memory_v2_release.sidecar_environment` 冻结为 `{"PUPU_FEATURE_MEMORY_V2":"off","PUPU_MEMORY_V2_MODE":"off","PUPU_CONTEXT_V2_STORE_OWNER":"off", …}`
  - `package.json`：`"start:electron": "cross-env PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1 node ./scripts/start-dev.cjs"`
- **完整性限制**: **(1)** `memory_v2_rollout.js` 与 `service.js` 落在 `code-owner-electron` 边界，我 **只读引用**，未验证 `sidecarEnvironment` 到 spawn 的最后一段注入（`service.js:4745-4810` 我只读了 grep 上下文，未逐行确认覆盖顺序）—— **该段的权威结论归 `code-owner-electron`**。**(2)** `build/build_feature_flags.json` 是本机构建产物，**未核实** 它与最近一次实际 release 的一致性。**(3)** 未实际启动 Electron 观察落到 sidecar 进程的 env
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但其结论跨入他人边界，本条只作为「请 `code-owner-electron` 确认」的锚点，不作为本边界的终局主张**
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0042 | **已验证** · 承重复核 | 九个仓内代码锚点 **全部逐字复现，零漂移**，其中 `memory_v2_rollout.js:150` **逐字符命中**、产品代码 `PUPU_CONTEXT_V2_STORE_OWNER` **恰好 2 处**。**三条须随附的收窄**：**(1)** `build/build_feature_flags.json` 被 **`.gitignore:51` 忽略、不入库**，`git ls-files` 无记录 —— **本条的自证类判据对它不成立，须按本机观察采纳**；提交方限制 (2) 只披露了「未核实与 release 的一致性」，**未披露不入库这一更根本的缺陷**。**(2)** 结论可承重，**其两行配置表不可** —— 结论由 tracked 的 `:150`（`storeOwner` 严格二元、`pupu_legacy` 任何输入下不可达）**独立支撑**，而表中两个具体取值各依赖一份不入库制品。**(3) 适用边界须写明**：该二元性是 **Electron 启动路径** 的属性；`memory_v2_store_boundary.py:96` 在 env 缺失时默认 `pupu_legacy`，**绕过 Electron 的 sidecar（独立 `python main.py` 或 E-0010/E-0012 的 harness）确实可达**，不带该限定会与 E-0010/E-0012 的观察产生表面冲突

### E-0012 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，同 E-0010 的 harness 与工作目录，2026-08-08
- **提交发言**: S-0004
- **取得方式**: 同 E-0010 harness，改请求为 `/context/v2/memory/spaces`、`/context/v2/status`、`/context/v2/memory/search`。**实际输出**:
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
- **完整性限制**: 同 E-0010 的四条限制全部适用。此外 S1 的「空 spaces」是在 **我新建的临时 store** 上取得，**非本机真实 store 的观察**
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**
- **验证历史**:
  - S-0004 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0008 | **已验证** | `evidence-examiner` 独立重建 harness 实跑，**五行逐条复现，S3 的六个字段逐字命中，无篡改迹象**；另作正对照排除「桩恒返回空」（建 space 后即返回非空数组；另一未触碰 owner 仍返回 `spaces: []`）。**可靠性高于提交方自陈** —— 其「同 E-0010 四条限制全部适用」的概括经逐条核对，**对 S1~S5 五行均不成立**：`_json_error` 替身不在路径上（五行响应体无一由替身塑形，判据是 `retryable` 字段），`import unchain` 缺陷亦不适用（五行全落 `pupu_legacy` 或 `off`，`off` 在触及任何 unchain import 前即返回）。审查人另判其 **须查类分类偏保守**：该 harness 对固定 revision + 全新临时 store 是 **确定性** 的，三轮重复执行逐字节恒同。**三处须随证据一同引用的收窄与更正**：**(1) 引证错配 —— 第三条主张（`store_owner=off` 时 `/context/v2/status` 自身 503）不在 E-0012 的五行之内**（S4 记录的是 `list spaces` 不是 `status`；S3 是 `status` 但取自 `pupu_legacy` 返回 200）。**该命题经审查人独立实跑为真，但其原始登记在 E-0010，故 E-0012 不得为该主张承重，须改引 E-0010。** 补正 E-0012「支持/反驳」字段的责任依[证据规则第一节](../../../codex/lifecycle/evidence-rules.md)归提出方 `code-owner-runtime`。**(2)** 主张一 **只支持后半**（「无 space 时第一跳返回空 200」）；**前半「真实读管线是两跳」与「因为没调过 memory 工具所以空」均不由这五行导出**，其依据在 E-0013 的路由清单与 `ensure_space` 调用点清单。**(3)** 主张二 **比提交方声称的更强，但须限定读路径**：`vector_status` 不是 store 状态的函数而是 env 的确定性函数（`provider` 空 → `NullVectorBackend` → `status()` 硬编码 `"disabled"`；全仓产品代码 **零处设置** `PUPU_MEMORY_V2_VECTOR_PROVIDER`），故「默认关闭」成立为一般性结论；**但只覆盖 `pupu_legacy` 读路径 —— `unchain` 读适配器在 search 响应中硬编码 `"vector_status": "degraded"`（`memory_v2_unchain_read_adapter.py:489`），该路径下永不出现 `"disabled"`，且审查人同样无法实跑**。另记两项呈现缺陷（不影响任何单行真实性）：未记录查询参数（`search` 读的是 `q` 不是 `query`）；**未记录 env 复位纪律 —— 严格按 S1→S5 字面顺序连跑，S5 将返回 503 而非登记的 200**，故该五行不是一次自上而下的连续运行。**保管链**：本次为 **第二方独立复核**，但与原观察 **同机同环境同缺陷**（`import unchain` 失败），`unchain` 分支两人均未能实跑

### E-0013 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `route_memory_v2.py:68-106`（`_endpoint`：401 / 413 / GET 豁免 `read_only_degraded`）· `:315-361`（`_read_runtime_for_store_owner`）· `:786-831`（`_status_for_store_owner`）· `:982-1008`（capability 的唯一使用点 :987/:1004）· `:1082,1111,1123`（spaces / tree / entries 三个路由）· `memory_v2_runtime.py:694-735` · `memory_v2_toolkit.py:642,659,663,688,946,982,1002,1087,1392,1528,1672`（`ensure_space` 的全部产品调用点）· `memory_v2_store.py:6467`（`ensure_space` 定义）· `memory_v2_store.py:6619-6639`（`list_spaces`）
- **提交发言**: S-0004
- **取得方式**: 定点读取；`grep -n "context_memory_v2_capability_status\|resolve_context_memory_v2_capability" route_memory_v2.py`（**仅 :16,:17 导入 + :987,:1004 使用**）；`grep -rn "ensure_space" --include="*.py" . | grep -v __pycache__ | grep -v /tests/`
- **支持/反驳**: **支持** Q1 的完整门清单（尤其：capability 检查 **不在** `get_tree` 读路径上；`read_only_degraded` **不阻塞** GET）；**支持** Q1(4)（space 由 memory toolkit 惰性创建，是「空态」的最常见成因）
- **完整性限制**: `ensure_space` 的调用点搜索只覆盖 `unchain_runtime/server` 下的 **字面标识符**，**未追** 经 `getattr(runtime, name)` 之类的动态派发（而 `_workspace_mutation_for_store_owner` 正是用 `getattr(…, method_name)` 派发的，故经 HTTP `POST /context/v2/memory/spaces` 也可创建 space —— 该路径 **确实存在**，只是今天 renderer 侧无消费者）
- **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0043 | **已验证** · 承重复核 | 门清单侧全部锚点 **逐字复现，零漂移**，三处范围两端精确；**capability grep 逐字复现（恰好 4 处：2 导入 + `:987,:1004` 使用），「capability 检查不在 `get_tree` 读路径上」由该 grep 直接证成**。**但 `ensure_space` 的「全部产品调用点」清单不是所述命令的输出** —— 另含 `unchain_adapter.py:365,366,384`（其 `:384` 是一次真实的空间创建调用）、`context_memory_v2_repository.py:2934` 与 `route_memory_v2.py:418,1100`（后者已由其完整性限制的 `getattr` 一节披露，前两者 **未获披露**）。**门清单部分可径行承重；第二个结论「space 由 memory toolkit 惰性创建」须收窄** —— 该收窄只针对证据覆盖面，不针对结论真伪

### E-0014 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `unchain_runtime/server/memory_v2_store.py:6641-6669`（`_entry_response`）· `unchain_runtime/server/memory_v2_unchain_read_adapter.py:532-567`（`_route_entry`）· `:411-452`（该侧 `list_entries` / `get_tree`）· `:357-382`（`_workspace_entries` → `memory_tree` / `memory_list` 分页）‖ **unchain `a4e69f4`** · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind` = `folder | markdown | image | link`）
- **提交发言**: S-0004
- **取得方式**: 两侧函数全文定点读取并逐字段人工比对；`grep -rn "class .*EntryKind" -A 12 --include="*.py" .`（unchain 仓）
- **支持/反驳**: **证实** 可证伪条件 4 的前半 —— 两个 `get_tree` 实现返回 **不同的条目字段集与不相交的叶子 `kind` 词汇表**。`pupu_legacy` 侧独有 `created_at_ms` / `updated_at_ms` / `created_by` / `content_bytes` 与 `kind == "file"`；`unchain` 侧独有 `tags` / `source_refs` 与 `kind ∈ {markdown, image}`。`folder` 与 `link` 是两侧共有的仅有两个 kind
- **完整性限制**: **(1)** 纯静态比对，**未在 `store_owner=unchain` 下实跑**（环境限制，见 E-0010 限制 3），因此「运行时字段确实如此」是 **推断**，不是观察。**(2)** 两侧 `get_tree` 的 **树装配算法本身**（`{**listing, "tree": roots}`，parent 缺失即升为 root）我确认为字面等价。**(3)** 由此外推的一条 **纯推断、未取证**：若 unchain 侧的条目集合中不含 `folder` 类型条目，则 `nodes.get(parent_path)` 恒为 `None`，tree 会退化为扁平列表 —— **`MemoryEntryKind` 有 `FOLDER`，所以前提大概率不成立，但我无法验证 `memory_tree` 是否返回 folder 条目**。请方案庭审就此取证，勿采信我的推断
- **证据类型判据**: 两仓内文件的字面内容与行号，可在给定 revision 直接复核 → 自证类。**但其中标注为「推断」的第 (3) 点不具此地位，不得作为事实引用**
- **验证历史**:
  - S-0004 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0044 | **已验证** · 承重复核 | 两侧五个锚点 **全部逐字复现**（unchain `a4e69f4` 工作树 **0 dirty**，锚点前提最强）；四项 pupu_legacy 独有字段、两项 unchain 独有字段 **全部证实**；`:452` 与 `memory_v2_store.py:7434` **逐字相同**，限制 (2) 的「树装配算法字面等价」**独立证实**。**审查人另闭合了登记未引的一环**：pupu_legacy 侧 kind 约束在 `memory_v2_store.py:845` 的 SQL CHECK（`kind IN ('folder','file','link')`），**故两侧词汇表交集恰为 `{folder, link}`，「仅有两个共有 kind」一句逐字为真** —— **闭合度高于登记时**。**一条限制未消除**：审查人同机同缺陷，无法实跑 `store_owner=unchain`，**「运行时字段确实如此」仍是推断不是观察**。限制 (3) 依指令不在本次范围，未触碰亦不重开

### E-0015 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:326-332, 340, 358-377`
- **提交发言**: S-0005
- **取得方式**: `grep -rn "ownerChatId\|context_v2\|contextV2" src/COMPONENTs/memory-inspect/ | wc -l` → **`0`**；并整读该文件（959 行）与 `memory_inspect_modal.test.js`（94 行）
- **支持/反驳**: **支持** 本发言 Q1 结论「modal 今天完全不在 V2 读平面上」；**收窄** `case.md` Q1 的表述 —— 不是「少一个参数」，是数据源整条要换
- **完整性限制**: 只覆盖字面标识符与该目录。未运行组件，未观察实际挂载行为
- **净内容**: 组件签名 `({open, onClose, sessionId, chatTitle, mode="session"})`；状态机六态 `idle|loading|ready|profiles|empty|error`（`:340`）；唯一数据源 `:374-377` 为 V1 projection 两方法
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0046 | **已验证** · 承重复核 | 逐项复核全部命中，无一处偏差。`memory-inspect/` 对 `ownerChatId`/`context_v2`/`contextV2` 的 grep **实测 0**；959 行 / 94 行、`:326-332` 签名、`:340` 六态、`:374-377` 唯一数据源逐字一致。**可直接承重，无须补强**

### E-0016 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:194-225` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:301-302` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11978-11986` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:120, 198-204`
- **提交发言**: S-0005
- **取得方式**: `grep -n "setMemoryInspect" -A 8 src/COMPONENTs/side-menu/side_menu.js` → 定位 `handleInspectMemory`；再 `grep -n "onInspectMemory"` 到构建器两分支并定点读取；正则实跑 `node -e` 对两个 id 各测一次
- **支持/反驳**: **支持** N1 与本发言 §1.2；**部分反驳** 「side-menu 挂载点拿得到 `ownerChatId`」这种简化读法 —— 它拿到的是一个 **多态** 值
- **完整性限制**: 未证明 `node.chatId` 与 `activeChatIdRef.current` 严格同一 id 空间（强旁证，见不确定性 3，归 chat-core 确认）。未实测 character chat 的实际请求
- **净内容**:
  ```
  side_menu_context_menu_items.js:198-207  character chat → buildCharacterMemorySessionId(...)  →  "character_<x>__dm__<y>"
  side_menu_context_menu_items.js:217-223  普通 chat      → node.chatId                          →  "chat-…"
  chat_storage_sanitize.js:301             `character_${…}__dm__${…}`
  use_chat_stream.js:11978                 const targetSessionId = characterConfig?.session_id || currentChatId;
  use_chat_stream.js:11985                 { ownerChatId: currentChatId, sessionId: targetSessionId }
  service.js:120                           CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
  node 实跑：  "chat-1772850432671-abc" → true      "character_foo__dm__main" → true
  ```
  **净效果**：语义错误的 id **能通过 main 的校验**，不会被挡下。
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0047 | **已验证** · 承重复核 | 四文件锚点全部命中，`node` 正则探针原样复跑两行输出一致。**两处行内标号早一行**（`chat_storage_sanitize.js` 模板串实在 `:302`；`use_chat_stream.js` 的 `sessionId:` 实在 `:11986`），**均落在其自陈区间内，属排版压缩非内容失真**。**一处收窄**：登记称此为「语义错误的 id」——「语义错误」是对该 id 应当是什么的判断，**不由本条锚点导出，属实体争点**；本条只支持「校验器不区分二者」

### E-0017 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/memory/index.js:46, 474-478`
- **提交发言**: S-0005
- **取得方式**: `grep -rn "chatId\|sessionId" src/COMPONENTs/settings --include="*.js"`（排除 `*.test.js`）→ 命中仅 `settings/token_usage/storage.js:82,154,332`（用量记录字段，与 Inspector 无关）；定点读取 `MemorySettings` 签名与挂载块
- **支持/反驳**: **支持** N4 与本发言 §1.3；**支持** G6 归我的那一半的答案
- **完整性限制**: 只覆盖字面标识符 `chatId` / `sessionId`。未核实是否有经 context 传入的隐式 chat 上下文（我未发现 `ConfigContext` 携带 chat id，但未穷举全部 provider）
- **净内容**: `export const MemorySettings = ({ onNavigate }) => {` —— 唯一入参是导航回调；挂载块 `:474-478` 只传 `{open, onClose, mode="long_term"}`（与 E-0003 一致）
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0048 | **已验证** · 承重复核 | 两锚点与一条 grep 全部精确复现。`MemorySettings` 唯一入参确为 `onNavigate`；`settings/` 下非测试代码 `chatId|sessionId` **恰三处、全在 `token_usage/storage.js`**。**可直接承重**

### E-0018 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-50, 102-108` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:2098-2116`
- **提交发言**: S-0005
- **取得方式**: 整读 renderer facade（140 行内）；定点读取主进程 `listContextV2Spaces` / `getContextV2Tree`
- **支持/反驳**: **支持** 本发言 §1.3「V2 读平面全部 owner-scoped」；**新增** 一条 `case.md` 与 `FRAMING` 都未记的事实 —— **`getTree` 除 `ownerChatId` 外还必需 `spaceId`**
- **完整性限制**: 代码形状，非运行时行为。`spaceId` 的来源（`listSpaces` 返回什么、有没有默认 space）**我未核实**，归 runtime / electron
- **净内容**:
  ```
  service.js:2098-2101  listContextV2Spaces  → 必需 requireContextV2OwnerChatId
  service.js:2108-2116  getContextV2Tree     → 必需 ownerChatId + requireContextV2Identifier(spaceId)
                                              query 只有 owner_chat_id（无 allow_long_term / namespace）
  ```
  **净效果**：tree view 的最小读序列是 **两跳**（`listSpaces` → `getTree`），且两跳都以 `ownerChatId` 为根键。
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0049 | **已验证** · 承重复核 | 四段锚点全部命中，`:2108-2116` **逐行精确**（`:2109` 必需 ownerChatId、`:2110` 必需 spaceId、`:2111` query 仅 `owner_chat_id`，**确无 `allow_long_term`/`namespace`**）。**两处偏松非内容错误**：facade 实为 **124 行** 非「140 行内」；`listContextV2Spaces` 实闭合于 `:2106`。**一处收窄**：「最小读序列两跳」是 **形状层必然**，成立；「两跳在运行时确实如此走」超出本条

### E-0019 | repository | 自证类（**仅就代码形状**；运行时行为归 `code-owner-runtime`）
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:7396-7434` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:1111-1120, 315-335` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store_boundary.py:26-32`
- **提交发言**: S-0005
- **取得方式**: 定点读取三处
- **支持/反驳**: **支持** 本发言 §2.2(a)「`get_tree` 的 200 无判别位」；**支持** §1.3 末「long_term 参数存在但不可达」
- **完整性限制**: **未起 sidecar、未发过请求、未观察任何返回体。** 空 store / space 不存在 / owner 不存在 / `store_owner=off` 四种出口的 **实际** HTTP 状态与 body **一律未核实**（G3，归 runtime）。我只主张「代码里的返回构造长这样」
- **净内容**:
  ```
  memory_v2_store.py:7434   return {**listing, "tree": roots}
  listing 形状 :7397-7405   {owner_chat_id, space_id, space_revision, entries}
  → 200 载荷 = {owner_chat_id, space_id, space_revision, entries, tree}   无 enabled / store_owner / 任何判别位
  route_memory_v2.py:1114-1119  只取 owner_chat_id；不传 allow_long_term / namespace
  memory_v2_store_boundary.py:26-28  STORE_OWNER_OFF="off" / PUPU_LEGACY / UNCHAIN
  ```
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0050 | **已验证** · 承重复核 | 三文件锚点内容全部属实，**200 载荷恰为五键、无任何判别位** 经逐键复核成立；`:1111-1120` 逐行精确。**跨界自我限制（只主张代码形状）经核实在正文中被完整遵守** —— 净内容四行全是构造与常量，**无一句断言端点实际返回什么**。行内标号 `:7397-7405` 起点早四行（listing 四键实在 `:7402-7405`），落在自陈区间内。**须按窄命题采纳**：只支持「成功载荷无判别位」这一结构命题，**不支持任何关于 200 何时出现、空态与停用态如何区分的命题**

### E-0020 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1941-1985, 1890-1905` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:102` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/feature_flags.js:53-56, 90-100`
- **提交发言**: S-0005
- **取得方式**: `grep -rn "getStatus\b" src --include="*.js"`（排除 `*.test.js`）逐条归类；定点读取主进程 `getContextV2Status` 与其上方注释
- **支持/反驳**: **支持** 本发言 §2.2(b)(c) 与 §2.3；**支持** N2 / N3
- **完整性限制**: 只覆盖字面 `getStatus`。未实测调用返回。`projectMemoryV2Status` / `validateMemoryV2Status` 的内部判据我未追（归 electron）
- **净内容**:
  1. `getContextV2Status` 返回 8 字段 allowlist：`{available, schemaVersion, journalMode, lexicalBackend, vectorStatus, featureCeiling, rolloutMode, readOnlyDegraded}`
  2. `service.js:1941-1943` 注释把 count-free 写成不变量：*"Status is deliberately COUNT-FREE … any row counts the sidecar might add later can never leak out as a free enumeration oracle."*
  3. **`src/` 下对 `contextV2Bridge.getStatus()` 的消费者数量 = 0。** 三个 chat-bubble 消费者用的是 `isAvailable()` + 错误码，未调过 status
  4. `feature_flags.js:53-56` `enable_memory_v2` 默认 `false`；`:90-100` `readFeatureFlags()` 在 `NODE_ENV==="production"` 时 **短路到 build 快照，完全不读持久化值** —— 故该 flag 不能替代 `getStatus` 作为启用态判据
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0051 | **已验证（行号须更正）** · 承重复核 | 四项净内容全部属实并逐项复现：8 字段 allowlist **恰 8 项集合相同**、count-free 注释 **逐字属实**、**`contextV2Bridge.getStatus()` 在 `src/` 实测零调用点**（24 处 `getStatus` 命中中属该 bridge 的只有定义 `:102` 与白名单 `:33`）、production 短路成立。**但主锚点整体早一行，须在案卷中更正**：注释实为 `:1942-1944`、函数实为 `:1945-1986`。**该偏移不是庭审期间的漂移而是提交时的誊录偏移**（`electron/**` 零 dirty、HEAD 同 revision），二者性质不同，不作证据失效处理。补正责任在 `code-owner-settings`。另：`NODE_ENV === "production"` 的字面判断实在 `:5`，不在其所引 `:90-100` 内，语义成立出处不完整。**一处收窄**：注释是 **意图声明不是对实现的证明**，本条未验证该不变量在实现上被守住

### E-0021 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:398-408, 424-430, 434-441` · 同目录 `memory_inspect_modal.test.js:59-93`
- **提交发言**: S-0005
- **取得方式**: 定点读取
- **支持/反驳**: **支持** Q4 收端半边前半问（Inspector 今天怎么处理 200-空）；**支持** C1 / C4 在本案继续成立
- **完整性限制**: 静态阅读，未运行组件、未跑测试（`react-scripts test` 未执行）
- **净内容**: empty 判据 = `pts.length === 0` 单条；`long_term` 且有 profiles 时改判 `profiles`；静默轮次（`silent:true`）的 `.catch` 整个被 `if (!silent)` 吞掉；5s `setInterval` 会在零操作下驱动 `ready → empty`。现有唯一测试锁的是 long-term profiles 自动切换这一条路径
- **验证历史**:
  - S-0005 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0052 | **已验证** · 承重复核 | 三段锚点 **逐行精确**。`pts.length === 0` 单条判据、`if (!silent)` 吞掉整个 `.catch`、5s `setInterval` 驱动静默轮次四项均成立。**审查人另独立核实最关键的一句**：`:398-408` 的空态分支 **不在 `if (!silent)` 保护之内**，故静默轮次确能改写 status —— **该推论成立**。测试文件逐块清点，**全文只有一个 `test(` 块**，「唯一测试」属实

### E-0022 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:4745`（`const sidecarEnvironment = { ...process.env }`）· `:4749-4755`（三个 vault 键与 dirty-dev 键的删除）· `:4758-4763`（`spawn(...)`，`env: { ...sidecarEnvironment, …`）· `:4789-4808`（五个 MEMORY_V2 env 键无条件写入）· `:4809-4811`（dirty-dev 条件重加）· `:1035`（`const memoryV2RuntimeConfig = constrainMemoryV2ConfigForPlatform(...)`）· `:4695-4696`（`startMiso` 的唯一守卫，无 attach 分支）
- **提交发言**: S-0010
- **取得方式**: 定点读取上述行段；`grep -rn "spawn(" electron/main --include="*.js"` → **全 `electron/main/` 只有 3 个 spawn 点**：`memory_vault/vault_sink_executor.js:327`（vault worker）· `unchain/service.js:4758`（sidecar）· `ollama/service.js:67`（`ollama serve`）；`grep -rn "EXTERNAL|externalSidecar|skipSpawn|attach" unchain/service.js` → 无任何附着外部进程的路径（命中全部是 stream 的 `attachedWebContentsId`，与 spawn 无关）
- **支持/反驳**: **支持并补全** `code-owner-runtime` 的 E-0011 —— 其自陈未验证的 `sidecarEnvironment` → spawn 最后一段注入，此处逐行确认：**五个键的写入位置在 `{...process.env}` 展开之后，无条件，无分支**。**反驳** 任何「开发者 shell 的环境变量可能生效」的设想
- **完整性限制**: **(1)** 静态读取，**未启动 Electron，未观察真实 spawn 的 env**。运行时行为是推断（但见 E-0030，该注入被测试锁住）。**(2)** 我核的是 `electron/main/` 下的 spawn；**未核** `scripts/start-dev.cjs` 是否另起 sidecar（该文件属 `code-owner-devtools`，我只读到 `package.json` 层）
- **证据类型判据**: 仓内文件字面内容与行号，任何人可在同一 revision 复核 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0053 | **已验证（射程须收窄）** · 承重复核 | 七个行号锚点 **逐行精确**，三个 spawn 点清单与 attach 负向搜索原样复现；审查人另作负向核查：`:4758-4830` 区间内 `MEMORY_V2` 全部命中 **就是这五个键加一个条件项，无第六处、无任何分支包裹**。核心事实成立。**但「反驳」一句射程明显宽于所证，这是本批唯一实质性相关性问题**：所证实的只是 **直接继承通道** 被封死（`{...process.env}` 里这五个键会被 `:4789-4808` 无条件覆盖）；**而同一提交方的 E-0023 恰好记录了间接通道** —— `memory_v2_rollout.js:124-133` 的 `readValue` 在 `allowProcessOverrides` 为真时 **优先返回 `processEnvironment[key]`**，`:265` 设 `allowProcessOverrides: !app.isPackaged`。**故非打包运行下，开发者 shell 的 env 正是经 rollout 解析器流进 `sidecarEnvironment` 再被写入 spawn。** 两条证据不冲突（一条封直接通道、一条开间接通道），**但 E-0022 的措辞会被读成整层否定，那不成立** —— **请按「直接继承通道已封死」采纳，勿按字面采纳**

### E-0023 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:14-20`（env 键表）· `:118-173`（`buildRolloutConfig`，**`:135-140` 的 featureEnabled 短路**、`:150` 的二元 storeOwner）· `:210-266`（`resolveMemoryV2ReleaseConfig`，**`:216-218` 快照路径二选一**、`:241-279` 双指纹门、`:265` `allowProcessOverrides: !app.isPackaged`）· `:311-342`（`constrainMemoryV2ConfigForPlatform`）· `:405-449`（`validateMemoryV2Status`）· `/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json` · `/Users/red/Desktop/GITRepo/PuPu/.local/build_feature_flags.snapshot.json` · `/Users/red/Desktop/GITRepo/PuPu/package.json:40`
- **提交发言**: S-0010
- **取得方式**: 定点读取；`cat build/build_feature_flags.json`；`ls -la .local/ && cat .local/build_feature_flags.snapshot.json`；`grep -n "start:electron" package.json`；`grep -o 'reason = "[a-z0-9_]*"' memory_v2_rollout.js`（**10 条，含 `""`**）
- **支持/反驳**: **支持** 甲的取值域二元结论；**部分反驳** `code-owner-runtime` E-0011 表格的 dev 行 —— 「`npm start` → `unchain`」不是仓库属性
- **关键原文**:
  - `memory_v2_rollout.js:135-140`：`const featureCeiling = featureEnabled ? normalizeMode(readValue(...), "off") : "off";`（`configuredMode` 同形）—— **featureEnabled 为假时，env 完全不被读取**
  - `memory_v2_rollout.js:216-218`：`app.isPackaged ? build/build_feature_flags.json : .local/build_feature_flags.snapshot.json`
  - `build/build_feature_flags.json`：`"enable_memory_v2": false`，`_pupu_memory_v2_release.sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER = "off"`，两个 sha256 指纹在案
  - **`.local/build_feature_flags.snapshot.json`（本机，273 字节，mtime 2026-08-04）：`{"enable_memory_v2": true, …}`，且 无 `_pupu_memory_v2_release` 块**
  - `package.json:40`：`"start:electron": "cross-env PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1 node ./scripts/start-dev.cjs"`
  - `validateMemoryV2Status` 的 reason 闭集（10）：`""` / `context_v2_unavailable` / `context_v2_store_owner_incompatible` / `context_v2_schema_incompatible` / `context_v2_wal_required` / `context_v2_lexical_backend_incompatible` / `context_v2_unchain_capability_unavailable` / `context_v2_unchain_capability_invalid` / `context_v2_rollout_config_invalid` / `context_v2_rollout_mismatch`
- **完整性限制**: **(1)** `.local/build_feature_flags.snapshot.json` 是 **本机文件、不入库**，其内容 **不可由他人在同 revision 复核** —— 这一条本身就是我 FE5 的依据，但也意味着 **该条证据的这一半不具备可复核性**，本庭须按「本机观察」而非「仓库事实」采纳。**(2)** 未实际打包、未验证 `build/build_feature_flags.json` 与最近一次真实 release 的一致性（与 `code-owner-runtime` E-0011 限制 2、`code-owner-settings` 不确定性 5 同源，**至今未消除**）
- **证据类型判据**: 仓内文件（js / package.json / build json）→ 自证类；`.local` 那一份是本机不入库文件的读取，**其可复核性弱于自证类**，本条已就地标注
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0054 | **已验证** · 承重复核 | 全部关键原文逐字属实；10 条 reason 闭集以同一命令复跑得 **恰好 10 条、集合完全相同**。`.local` 一半经审查人本机独立读取确认（273 字节、mtime 2026-08-04 17:20、`enable_memory_v2: true`、无 `_pupu_memory_v2_release` 块）。**就本庭点名的两问**：**(1) 该标注恰当** —— 其「本机文件、不入库、不可由他人在同 revision 复核」自陈准确；**审查人补一条更要紧的**：`.local` 不受版本控制，**可以在不留任何仓库痕迹的情况下改变**，全批时效前提的 `git status` 对它 **零保护力**，故连「在 `b2385d5d` 上成立」这种表述都不适用，**只能说「在我读它的那一刻成立」**。**(2) 不影响承重资格** —— 本条承重命题是否定命题「『`npm start` → `unchain`』**不是仓库属性**」，支撑它只需 `:216-218`（受控）+ `.local` 不在仓库里（受控事实），**`.local` 里写 true 还是 false 都不改变它**；其具体内容只承担例证角色。**反之，任何用本条主张「dev 运行时实际取值就是 X」的引用，才真正压在 `.local` 上，不被本条支持**。**两处行号更正**：`resolveMemoryV2ReleaseConfig` 实为 `:210-309`（**这也消解了该条内部 `:241-279` 越出外沿的自相矛盾**）；`validateMemoryV2Status` 实至 `:450`

### E-0024 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，2026-08-08。被测常量逐字取自 `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:120`（`CONTEXT_V2_OWNER_ID_PATTERN`）· `:195-204`（`readContextV2String` / `requireContextV2OwnerChatId`）· `:186-193`（`createContextV2Error` / `contextV2InvalidRequest`）
- **提交发言**: S-0010
- **取得方式**（**完整可复跑命令**，纯本地、零副作用）:
  ```bash
  node -e '
  const OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
  const read = (v) => (typeof v === "string" ? v.trim() : "");
  const req = (v) => { const o = read(v); if (!OWNER.test(o)) { const e = new Error("[context_v2_invalid_request] ownerChatId is invalid"); e.code="context_v2_invalid_request"; throw e; } return o; };
  for (const v of [undefined, null, "", "   ", 123, {}, "chat-1772850432671-abc", "character_foo__dm__main", "character_foo__dm__main "]) {
    try { console.log(JSON.stringify(v), "-> OK", JSON.stringify(req(v))); }
    catch (e) { console.log(JSON.stringify(v), "-> THROW code=" + e.code + " msg=" + JSON.stringify(e.message)); }
  }'
  ```
  **实际输出**:
  ```
  undefined                   -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  null                        -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  ""                          -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  "   "                       -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  123                         -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  {}                          -> THROW code=context_v2_invalid_request msg="[context_v2_invalid_request] ownerChatId is invalid"
  "chat-1772850432671-abc"    -> OK "chat-1772850432671-abc"
  "character_foo__dm__main"   -> OK "character_foo__dm__main"
  "character_foo__dm__main "  -> OK "character_foo__dm__main"
  ```
- **支持/反驳**: **回答 G5**（缺参 = 同步抛 `context_v2_invalid_request`，请求不发出）；**证实** `code-owner-settings` 的 E-0016（语义错误、语法合法的 id 穿过本层），并补一条：**尾随空白被 trim 后同样通过**
- **完整性限制**: **(1)** 我复制的是常量与两个纯函数的字面等价物，**不是 import 真实模块**（`service.js` 是一个需要 `electron` 的工厂，无法在 node 裸环境实例化）。等价性由逐字比对保证，**但仍是复制品，不是被测代码本身**。**(2)** 只覆盖 `requireContextV2OwnerChatId`；`requireContextV2Identifier(spaceId)` 我 **未实跑**（其正则更宽：`{0,511}`）。**(3)** 未观察抛出后经 `ipcMain.handle` 到 renderer 的真实序列化形态
- **证据类型判据**: 由我编写的脚本产出的运行时观察 → **须查类**（无需质疑即强制审查）
- **验证历史**:
  - S-0010 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0013 | **已验证** | 逐字复跑，九行输出逐条一致；**手抄件经机械比对与产品源零偏差**（正则 shasum byte-exact；审查人另以 `fs.readFileSync` 抽产品源 `:118-204` 原始字节 `new Function` 求值复跑，输出与探针逐行相同），手抄失真风险 **已排除**。**采纳须按窄命题计算，五处**：**(1) 引用宽于证明** —— 本条只证明该 **纯函数** 对六种缺参输入抛码；**G5 的「请求不发出」那一半本条未观察**（探针未触及 `contextV2Request`、未触及 fetch），该半命题依据是 call site 静态阅读（审查人核对全部 17 处调用），**属 E-0025/E-0026 的形态，不是本条产出**。**(2)「同步抛出」在 API 边界上表述不精确** —— 17 处调用均在 `async` 方法内，**外部观察到的是 rejected promise**；函数内部确为同步抛出，二者不是同一命题。**(3) 不足以支撑「main 层没有任何机制能挡住冒充」** —— 那是对整层的 **否定存在命题**，单函数探针最多证明「**这一个** 校验器不拦它」；审查人补充 grep 未发现额外归属校验，**但明确声明那是它的调查、不计为本条证明力**。**(4) 完整性限制 (1) 的理由与事实不符** —— 原文称「`service.js` 需要 `electron`，裸 node 无法实例化」，实测 **该模块裸 node `require` 完全成功**；真实障碍是该函数 **模块私有、不在 `:5922` 的 `module.exports` 内**。结论成立，理由不成立。**(5) 非实质瑕疵** —— 登记标称「实际输出」，但列对齐空格系提交方后加排版，内容零差异，属美化非篡改。**审查人另指出仓内已有更忠实且成本极低的补强路径**：`electron/tests/main/context_v2_service.test.cjs:3` 直接 `require` 真实 `createUnchainService`，其 `:287`/`:1430` 的 `expect(fetchImpl).not.toHaveBeenCalled()` 使「抛出」与「请求不发出」**均为直接观察**

### E-0025 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1039-1056`（`initialMemoryV2Readiness`）· `:1068`（声明）· `:1637-1664`（`getMisoStatusPayload`，**`:1645-1663` 是 `memoryV2` 的 15 个字段**）· `:1852-1887`（`verifyContextV2Readiness`，写入点 1）· `:1960-1975`（`getContextV2Status` 内的写入点 2）· `:4706`（`startMiso` 重置）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/ipc/register_handlers.js:236-238` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/channels.js:17` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/unchain_bridge.js:4` ‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.unchain.js:870-887` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:578`
- **提交发言**: S-0010
- **取得方式**: `grep -rn "memoryV2Readiness" electron/ src/ --include="*.js" --include="*.cjs"`（**产品代码全部命中都在 `unchain/service.js` 一个文件内，共 16 处**）；`grep -rn "getMisoStatusPayload" electron/main`（**3 个消费者**：`register_handlers.js:237` · `boot_readiness/service.js:224-225` · 自身定义）；`grep -rn "memoryV2" src --include="*.js" | grep -v ".test.js"`（**零处读 `status.memoryV2`**，全部命中是同名局部变量或 `enable_memory_v2` flag）；定点读取 `normalizeUnchainStatus`
- **支持/反驳**: **反驳** `code-owner-runtime` 的「`memoryV2Readiness` 三处 grep 零命中 ⇒ 未暴露给 renderer」—— 该推论是名字层面的假阴性；**支持** 乙的全部结论；**部分反驳** `code-owner-settings` 的 F2「唯一没有绕行方案」
- **净内容**:
  ```
  service.js:1645-1663  memoryV2: { configured, ready, status, reason, featureCeiling, configuredMode,
                                    releaseRolloutMode, rolloutMode, canaryPercent, readOnlyDegraded,
                                    platformActiveBlocked, releaseRolloutFingerprint, rolloutFingerprint,
                                    sidecarFingerprint, snapshotFingerprint }        ← 15 字段，4 个是 sha256
  register_handlers.js:236  ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () => unchainService.getMisoStatusPayload())
  preload/bridges/unchain_bridge.js:4  getStatus: () => ipcRenderer.invoke(CHANNELS.UNCHAIN.GET_STATUS)   ← 裸透传
  ─────────────────────────────  以上全在 code-owner-electron 边界内，零投影 ─────────────────────────────
  api.shared.js:330-343  normalizeUnchainStatus → 重建为 { status, ready, url, reason, pid, port }
                                                 ← memoryV2 与 contract 在此被丢弃（shared-arteries 边界）
  boot_readiness/service.js:224-232  只取 status.status 与 status.ready，memoryV2 对 boot 门不可见
  ```
  **status 的取值域**：`off`（`:1053`）/ `pending`（`:1055`）/ `degraded`（`:1045,1875,1881,1970`）/ `ready`（`:1875,1970`）—— **闭集四值**
- **完整性限制**: **(1)** 静态读取，未运行应用。「renderer 今天就能拿到」是对代码路径的推断，**未在运行中的应用里 `await window.unchainAPI.getStatus()` 观察过一次**。**(2)** grep 只覆盖字面标识符 `memoryV2Readiness` 与 `memoryV2`；未追经解构/重命名的间接消费。**(3)** `normalizeUnchainStatus` 与 `api.unchain.js` 落 `code-owner-shared-arteries` 边界，**我只读引用，其权威解释不归我**
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但其结论跨入 shared-arteries 边界，本条对 `normalizeUnchainStatus` 的部分只作为「请其确认」的锚点**
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0055 | **已验证** · 承重复核 | **本批精度最高的一条**。15 个字段、四个 status 取值的每一个行号、七个跨文件锚点 **全部逐行精确**，三条 grep 全部原样复现：`memoryV2` 块 **恰 15 字段名称与顺序完全相同**（4 个 fingerprint）、status 四值行号 **无一偏差**、`memoryV2Readiness` 产品代码 **16 处且全在一个文件内**、`src/` 非测试代码 **零处读 `status.memoryV2`**。**审查人另作一项方向为加强的独立观察**：`src/SERVICEs/test_bridge/index.js:82-84` **直接调用裸 `unchainAPI.getStatus()`**（不经 `api.unchain` facade），即 renderer 进程里 **确实存在一条能拿到未归一化 15 字段载荷的现役路径** —— 本条未引此处，但它正是其「renderer 今天就能拿到」的实证支点，**该推断因此比提交方自陈的更硬**。**一处计数偏松**：`getMisoStatusPayload` 登记「3 个消费者」，实为 4 处命中（两个真实调用点无误，结论不受影响）。**一处收窄**：「部分反驳 F2『唯一没有绕行方案』」中，本条锚点只证明「存在另一条已经在线的状态通道」，**是否构成可用的绕行方案属实体争点，不由本条导出**

### E-0026 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:182-193`（`createContextV2Error` 与其成文理由注释）· `:1733-1786`（`readJsonResponse`，**`:1740-1771` 的错误分支提取 `parsed.error.code` 挂到 `error.code`**）· `:1892-1940`（`contextV2Request`：`:1893` `ensureMisoReady()` · `:1897-1906` readiness 门 · `:1914-1922` fetch 失败 → `context_v2_unreachable` · `:1931-1938` 保码重包）· `:2108-2116`（`getContextV2Tree`）· `:2098-2105`（`listContextV2Spaces`）‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:53-57`（`ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/`）· `:69-82`（`unavailableError` / `parseContextV2ErrorCode`）
- **提交发言**: S-0010
- **取得方式**: 定点读取全部行段并逐段追踪一个错误对象的生命周期
- **支持/反驳**: **支持** 戊「服务端七码经本层 code 保真、message 丢弃」；**证实** `0000-0003-2026-0807#S-0010` 归档结论在本案链路上仍然成立
- **关键原文**:
  - `service.js:182-185`（注释）：*"the stable code rides in the message behind a `[<code>] ` prefix (Electron strips error.code across ipcMain.handle) AND stays on .code for main-process callers."*
  - `service.js:1932-1933`（注释）：*"readJsonResponse surfaces the sidecar's stable error code; keep it and re-wrap so the renderer only ever sees `[code] static message`."*
  - `service.js:1938`：`throw createContextV2Error(code, "context v2 request failed");` —— **上游 message 在此被丢弃**
  - 七个服务端码全部匹配 `[a-z0-9_]+` → renderer 正则可解析，**无一漏解**
- **完整性限制**: **(1)** 静态追踪，**未观察一次真实的 IPC 往返**，未验证 Electron 实际包裹的 `Error invoking remote method '<channel>': ...` 前缀不会干扰正则（该正则无锚点，理论上不受影响，**但这是推断**）。**(2)** `src/SERVICEs/bridges/context_v2_bridge.js` 属 `code-owner-shared-arteries`，我只读引用
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0056 | **已验证（须与 E-0027 捆绑引用）** · 承重复核 | 两段引用注释 **逐字属实**，错误对象完整生命周期经逐段追踪成立；审查人另独立追踪其未展开的中段（`:1745-1757` 提取 `parsed?.error?.code`、`:1767-1770` 挂到 `error.code` 后抛出），**该子区间描述完全属实**。四个子锚点逐行精确。**两处范围偏松**：`readJsonResponse` 实闭合于 `:1783`；`listContextV2Spaces` 实闭合于 `:2106`。**两处必须收窄**：**(1)** 「七个服务端码全部匹配、**无一漏解**」——本条锚点证明的是 **机制**（码被保留并重排为 `[code] message`），**「恰好是这七个码」的普查不在本条来源定位之内，须另据**；机制成立，普查未证。**(2) 「code 端到端不丢」只在就绪门之后成立** —— 前置例外在 E-0027（`ensureMisoReady` 抛无码裸 `Error`），而 `contextV2Request` 的 **第一行** 正是它。**E-0026 自身不携带这条限定，E-0027 携带；两条必须一同引用，单引 E-0026 会得到一个过强的结论**

### E-0027 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1666-1676`（`ensureMisoReady`）· `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:1414-1430`
- **提交发言**: S-0010
- **取得方式**: 定点读取；`grep -n "not ready" electron/tests/main/context_v2_service.test.cjs`
- **支持/反驳**: **限定** E-0026 与 `0000-0003-2026-0807#S-0010` 的「code 端到端不丢」—— **有一个前置例外，且它被测试锁住**
- **关键原文**:
  ```js
  // service.js:1672-1674
  throw new Error(
    `Miso service is not ready (status=${unchainStatus}${reasonSuffix})`,
  );                                  // ← 无 [code] 前缀，无 .code
  ```
  ```js
  // context_v2_service.test.cjs:1416-1430
  // "Every capability (not just status) fails closed while the sidecar is
  //  not ready — no request is attempted at all."
  await expect(service.listContextV2Spaces({ ownerChatId: "chat-1" })).rejects.toThrow(/not ready/i);
  await expect(service.decideContextV2Candidate({...})).rejects.toThrow(/not ready/i);
  expect(fetchImpl).not.toHaveBeenCalled();
  ```
- **完整性限制**: **(1)** 该测试断言的是 `listContextV2Spaces` 与 `decideContextV2Candidate`，**未逐一断言 `getContextV2Tree`** —— 但三者共用 `contextV2Request` 的同一条第一行，故推断其行为相同（**是推断，不是观察**）。**(2)** 未验证该无码 message 到达 renderer 后的确切形态
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0057 | **已验证** · 承重复核 | 两处锚点 **逐行精确**，两段引用代码 **逐字属实**（`:1672-1674` 确无 `[code]` 前缀、确未给 `.code` 赋值）；测试三处断言与注释原文全部命中，登记对第二个断言的 `{...}` 省略 **有显式标记，非隐藏**。**该条最有价值之处在于它是对自家 E-0026 的自我限定，且限定得准确**。审查人为其自陈的推断补一节旁证（`getContextV2Tree` 与被断言的 `listContextV2Spaces` 同以 `contextV2Request` 为唯一出口，其第一行即 `ensureMisoReady()`，三者共用同一条第一行属实），**故该推断在结构上很硬；但测试确实没有断言 `getContextV2Tree`，「被测试锁住」只对被点名的两个方法成立** —— 提交方已如实标注，该标注准确

### E-0028 | repository | 自证类（**跨界只读，权威解释归 `code-owner-runtime`**）
- **来源定位**: PuPu `b2385d5d` · **本边界内**：`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1942-1986`（`getContextV2Status`：`:1946-1957` 合成负值分支 · `:1958` 真发请求 · `:1974` `available &&= validation.ok`） ‖ **跨界只读**：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:982-1006`（`context_v2_status`，**无 try/catch**）· `:786-799`（`_status_for_store_owner`，owner≠unchain → 直调 `_runtime()`）· `:315-328`（`_read_runtime_for_store_owner`，同形）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_runtime.py:694-735`（**`:718-734`：owner ∈ {off, unchain} 且 required → 抛 503，code 为 `context_v2_store_disabled`（off）/ `context_v2_owned_by_unchain`（unchain）**）
- **提交发言**: S-0010
- **取得方式**: 定点读取五处
- **支持/反驳**: **支持** 丁的核心结论（出厂默认态下 `getStatus()` reject 而非 resolve，8 字段 allowlist 不可达）；**独立交叉验证** `code-owner-runtime` 的 E-0010（其实跑得 503 `context_v2_store_disabled`，与我静态读结论一致）；**推翻我自己的一条持久记忆**（原记「默认构建下每次读返 404 `context_v2_not_found`」，在本 revision 上不成立）
- **完整性限制**: **(1)** `unchain_runtime/**` 不在我边界内。我只主张「代码里的分支长这样」，**运行时行为的权威结论归 `code-owner-runtime`**（其已实跑，结论一致）。**(2)** 我 **未实跑** 任何 Python 代码，未起 sidecar。**(3)** 主进程侧的 `:1946-1957` 合成分支我未实跑，但其存在被 `context_v2_service.test.cjs:249` 的 `"status short-circuits without a request when the runtime is not ready"` 锁住
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0058 | **已验证** · 承重复核 | 五处锚点 **全部逐行精确**，**全批精度最高**（Python 侧边界精度罕见：`:315-328` 恰收在 `return _runtime()`、`:718-734` 恰闭合那个 `raise`、`:694-735` 恰收在 `return None`）；`route_memory_v2.py:982-1006` 的「**无 try/catch**」经逐行确认成立。**就本庭点名的一问：跨界自我限制在正文中基本被遵守** —— 完整性限制与证据类型判据两处均明写权威归 `code-owner-runtime`，净内容各行 **全部是分支结构与常量**。**一处越界须标记**：「支持/反驳」栏的「出厂默认态下 `getStatus()` **reject 而非 resolve**」是 **运行时效果不是分支形状**；因其以「支持他人结论」形式出现、紧跟权威让渡、且所述效果确已由 E-0010 实跑取得（本庭 S-0007 已验），**性质属佐证而非自立权威**。**两处收窄**：**(1)** 本条对「出厂默认态」结论的贡献是 **分支层的**，运行时那一半的出处是 E-0010 **不是本条**。**(2)** 其自称「独立交叉验证 E-0010」**就 `off` 支成立，就 `unchain` 支不成立** —— 该支（`:728` 的 `context_v2_owned_by_unchain`）**全案至今无任何运行时观察**，本条静态读是它 **唯一** 的证据来源。另：其「推翻我自己一条持久记忆（原记 404）」经核实方向正确，本 revision 上确为 503

### E-0029 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08
- **提交发言**: S-0010
- **取得方式**（**完整可复跑命令**，只读、不改文件）:
  ```bash
  npm run test:electron -- --testPathPattern="context_v2_service|context_v2_bridge|ipc_channels|api_contract" \
    --testPathIgnorePatterns="/node_modules/" "/worktrees/"
  ```
  **实际输出（主树部分）**:
  ```
  PASS electron/tests/preload/api_contract.test.cjs
  PASS electron/tests/main/context_v2_service.test.cjs
  PASS electron/tests/main/ipc_channels.test.cjs
  PASS electron/tests/preload/context_v2_bridge.test.cjs
  Test Suites: 6 passed, 6 total
  Tests:       81 passed, 81 total
  ```
- **支持/反驳**: **支持** 戊「两跳在单元契约层完整且绿」
- **完整性限制**: **(1)** 这些是 **全 mock 的 node 环境单元测试**（`--env=node`，`fetch` 被 jest.fn 替身），**证明的是「主进程按契约拼 URL、preload 按 allowlist 转发、channel↔方法名绑定不漂移」，不证明任何真实 HTTP 往返**。**(2)** 第一次不带 ignore 参数的运行 **把仓内 9 个陈旧 worktree 的同名测试一并跑了**（30 suites / 317 tests 全绿）—— 那些结果 **与本案无关，不得引用**；第二次已收窄到主树。**(3)** 未跑 `memory_v2_startup_readiness` 与 `memory_v2_rollout` 两个 suite（E-0030 的断言我是静态读取的，**未实跑验证其今天为绿**）
- **证据类型判据**: 由我发起的测试运行产出的运行时观察 → **须查类**
- **验证历史**:
  - S-0010 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0015 | **已验证（承重部分）** | 承重内容「主树 4 个相关 suite 全绿」经第二方独立复跑 **成立**，四个 PASS 行逐条为真且无遗漏；复跑后 `git status --porcelain -- electron src package.json` 为空，只读性确认。**命令合法性经本庭点名核查：`npm run test:electron` 是本仓正确跑法，不违反工程铁律**（铁律禁的是对前端套件直接 `npx jest`；CI 调用的正是该 script）。**但登记须更正两处**：**(1) 聚合数字构成不符自陈** —— 登记的 `6 passed / 81 total` 中，**2 个 suite（12 个 test）来自陈旧 worktree `.worktrees/pr-182-review`**，而提交方在完整性限制 (2) 中称「第二次已收窄到主树」，**该陈述不成立**，且其自设的「worktree 结果不得引用」规则被自身聚合数字违反。**真实主树数字为 `4 suites / 69 tests`。** 根因：忽略正则 `/worktrees/` 命中 `.claude/worktrees/`（9 棵，已正确排除）但 **不命中 `.worktrees/`**（前导点使其不成为子串）—— **本仓有两个 worktree 根，只排除了一个**。**(2)** 补强由提出方执行，审查人已给出可复跑的收窄命令。**关于本庭点名的 `.js`/`.cjs` 双胞胎，实测形态与铁律预设的失效模式不同，两条都须记**：**(a)** 四个双胞胎 **全部存在**，但其内容 **不是复制品而是一行委托 shim**（全文即 `require("./<name>.test.cjs");`），故铁律警告的「双胞胎内容静默漂移」**在这四个文件上结构上不可能发生** —— 比「内容同步」更强，该项关切可解除；**(b) 反向发现** —— 这四个 `.js` **不被任何已配置的 runner 收集**（`test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`；`react-scripts test` 的 roots 被 CRA 硬编码为 `<rootDir>/src`；仓内无 `jest.config*`/`craco.config*`，`package.json` 无 `jest` 键；CI 亦只调 `npm run test:electron`），故 **`.js` 双胞胎为惰性文件，零执行**。**净效果**：E-0029 效力不因此削弱（CI 与复跑执行的都是 `.cjs`，锁力真实存在），**但「被双胞胎锁住」这一措辞所暗示的双重执行保险并不存在**，实际锁力全部来自单一 `.cjs`。**相关性经收窄**：支撑「两跳在单元契约层完整且绿」为 **相关且充分**；支撑「新增一个 renderer 消费者时 electron 边界内 0 处必须改动」为 **相关但不充分** —— 测试绿证明的是 **既有行为未被破坏**，逻辑上不蕴含新增消费者无需改动；后者需要一次「新消费者需求 ⊆ 现有参数面」的比对，**E-0029 不含该比对**。审查人另点出 `api_contract.test.cjs:254-258` 断言 preload **主动丢弃 allowlist 之外的入参**，「它证明约束存在，不证明约束足够」。**未跑项原样保留**：`memory_v2_startup_readiness` / `memory_v2_rollout` 两 suite 至今 **无人实跑**，E-0030 的断言未经实跑佐证

### E-0030 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_v2_startup_readiness.test.cjs:188-194, 200-214, 237-244, 268-275, 379-392, 426-440` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:498-527` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/ipc_channels.test.cjs:360-375` · `/Users/red/Desktop/GITRepo/PuPu/electron/tests/preload/api_contract.test.cjs:252-265`
- **提交发言**: S-0010
- **取得方式**: 定点读取；`ls -la electron/tests/main/context_v2_service.test.* electron/tests/preload/context_v2_bridge.test.* electron/tests/main/ipc_channels.test.* electron/tests/preload/api_contract.test.* electron/tests/main/memory_v2_*`；`cat electron/tests/main/context_v2_service.test.js`
- **支持/反驳**: **支持** 甲（注入被测试锁住）、乙 (2)（`memoryV2` 只被部分锁定）、丁 (1)（bridge 面被契约测试锁住）
- **净内容**:
  ```
  spawn env 断言（memory_v2_startup_readiness.test.cjs）:
    :188-193  packaged + canary  → PUPU_CONTEXT_V2_STORE_OWNER: "unchain"
    :379-386  off                → PUPU_CONTEXT_V2_STORE_OWNER: "off"
    :426-433  win32 + all        → PUPU_FEATURE_MEMORY_V2:"shadow", PUPU_MEMORY_V2_MODE:"all",
                                   PUPU_CONTEXT_V2_STORE_OWNER: "unchain"
    全仓测试中 PUPU_CONTEXT_V2_STORE_OWNER 取 "pupu_legacy" 的断言：零

  memoryV2 载荷断言（同文件，7 处，全部 toMatchObject 部分匹配）:
    :200-214  {configured:true, ready:true, status:"ready", reason:"", rolloutMode:"canary", 三个 fingerprint}
    :386-392  {configured:false, ready:false, status:"off", …}
    :435-440  {ready:false, status:"degraded", reason:"vault_worker_containment_unavailable",
               releaseRolloutMode:"all", rolloutMode:"shadow"}
    → status 四值中三值有断言；15 字段的完整集合与「不得有额外字段」均无断言

  双胞胎清单（全部 .js 为一行 require 壳）:
    electron/tests/main/context_v2_service.test.cjs (49245B)      + .test.js (42B)
    electron/tests/main/ipc_channels.test.cjs (28313B)            + .test.js (36B)
    electron/tests/main/memory_v2_rollout.test.cjs                + .test.js
    electron/tests/main/memory_v2_startup_readiness.test.cjs      + .test.js
    electron/tests/preload/api_contract.test.cjs (37515B)         + .test.js (36B)
    electron/tests/preload/context_v2_bridge.test.cjs (9241B)     + .test.js (41B)
    e.g. context_v2_service.test.js 全文 = `require("./context_v2_service.test.cjs");`
  ```
- **完整性限制**: **(1)** 静态读取测试源码；这批 `memory_v2_*` suite 我 **本次未实跑**（E-0029 未覆盖），故「这些断言今天为绿」是推断。**(2)** 「全仓测试中 `pupu_legacy` 零断言」是对字面串的搜索，未覆盖以变量构造的断言
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0059 | **已验证** · 承重复核 | 六个行段全部命中，四个文件尺寸 **逐字节吻合**，三项计数全部独立复现（`memoryV2:` 断言恰 7 处、status 被断言取值恰三值、全仓 `PUPU_CONTEXT_V2_STORE_OWNER` 断言仅 3 处且 **`pupu_legacy` 确为零**）。**六对双胞胎全部存在，六个 `.js` 全文各为一行 `require`，逐个 `cat` 确认。** **两条须随引的限定**：「乙(2) `memoryV2` 只被部分锁定」**经复核加强** —— 7 处断言全为 `toMatchObject` 部分匹配，全仓 **无任何「不得有额外字段」断言**，故「部分锁定」是精确说法不是保守说法；**这六个 `.js` 双胞胎零执行**（承 S-0015），锁力全部来自单一 `.cjs`。**引用时须写「测试源码里写着这些断言」，不得写「这些断言今天为绿」** —— `memory_v2_startup_readiness` / `memory_v2_rollout` 两 suite **至今仍无人实跑**

### E-0031 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/chat_storage/service.js:357`（`SELECT id FROM chats`）· `:459`（`SELECT id, meta FROM chats`）· `:489`（`SELECT COUNT(*) AS n FROM chats`）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:118-120`（该门是语法门的成文声明）
- **提交发言**: S-0010
- **取得方式**: `grep -n "SELECT id\|FROM chats" electron/main/services/chat_storage/service.js`；定点读取 `service.js:118-120` 注释
- **支持/反驳**: **支持** 丙 (3)「main 今天没有身份门，但材料在 main 里」；**支持** FE3（建门是新耦合、新行为）
- **完整性限制**: **(1)** 我 **未核实** `chats.id` 与 `ownerChatId` 是否严格同一 id 空间（与 `code-owner-settings` 的不确定性 3 同源，**该确认归 `code-owner-chat-core`**）。**(2)** 未核实 chat_storage service 是否对同进程内其他 service 暴露可调用的查询方法 —— 我只确认了 SQL 存在
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0060 | **已验证** · 承重复核 | 四个行号精确命中，三条 SQL **逐字一致**；`:118-120` 注释确为「语法门的成文声明」，与原文语义吻合。**一条必须收窄**：本条只证明 **SQL 存在于 `chat_storage` service 内部**，**未确认该 service 对同进程其他 service 暴露任何可调用的查询方法** —— 故「材料在 main 里」为真，**「main 可以拿到这些材料去建门」本条不证**。引用时须限定为「材料在 main 进程里」，**不得读作「main 今天可以建这道门」**

### E-0032 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/context_v2_bridge.js:35-231`（十八个方法的完整入参表）· `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:131`（`CONTEXT_V2_PAGE_LIMIT_MAX = 500`）· `:2108-2116`（`getContextV2Tree` 无 limit）
- **提交发言**: S-0010
- **取得方式**: 整读 preload bridge（235 行），逐方法比对入参
- **支持/反驳**: **支持** 我在「留待方案庭审」里登记的第三条（`getTree` 是唯一无上界的读方法）
- **净内容**: 十八个方法中，`listEvents` / `listEntries`(经 `includeDescendants`) / `search` / `listCandidates` / `listJobs` / `listPromotions` / `listCandidateReviews` 均带 `limit`（主进程以 `CONTEXT_V2_PAGE_LIMIT_MAX = 500` 封顶）；`readContent` 带 `offset`/`limit`（`CONTEXT_V2_CONTENT_LIMIT_MAX = 128KB`）；**`getTree` 的入参只有 `{ownerChatId, spaceId}`，无任何分页或大小参数**，返回体大小由 store 内容单方面决定
- **完整性限制**: 只比对了 preload 入参与 main 的常量；**未核实** 服务端 `get_tree` 内部是否另有隐式上界（归 `code-owner-runtime`）。**未观察任何真实载荷大小**（G2）
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0010 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0061 | **未验证** · 承重复核 | **承重的那一句被它自己引用的文件反驳。** 核心引文逐字为真（`CONTEXT_V2_PAGE_LIMIT_MAX = 500` · `getTree` 入参恰 `{ownerChatId, spaceId}` 无分页 · preload 返回对象恰 18 方法）；**但列举的七方法「均带 `limit`」有一个成员是错的** —— `listEntries`（preload `:92-98`）入参为 `{ownerChatId, spaceId, parentPath, includeDescendants}`，**无 `limit`**，且主进程 `listContextV2Entries`（`:2118-2137`）**全函数不出现 `CONTEXT_V2_PAGE_LIMIT_MAX`**；`include_descendants` 默认 `true`、`parent_path` 可省，**省略 `parentPath` 的调用返回整个 space 全部条目，与 `getTree` 同形**。真正带 `limit` 的七个是 `listEvents`/`readContent`/`search`/`listCandidates`/`listJobs`/`listPromotions`/`listCandidateReviews`。**故推论「`getTree` 是唯一无上界的读方法」不成立。** **审查人特别指出：该更正对本案是加强不是削弱** —— 无上界读方法由一个变两个，封顶议题射程随之变大，**请勿因本条判未验证而把封顶关切一并下调**。**剩余可用部分**：「`getTree` 无任何分页或大小参数，返回体大小由 store 内容单方面决定」**完全成立，可独立采信，只是不能带「唯一」二字**。补正责任归 `code-owner-electron`；`code-owner-chat-bubble` E-0056 中以「唯一」措辞的引用须一并调整
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`①）| **射程之内**：`service.js:131/:132` 两常量 · `:2108-2116` 全函数且 query 只含 `owner_chat_id` · preload `:35-231` 返回对象恰 18 方法 · `getTree`(`:86-90`) 入参恰 `{ownerChatId, spaceId}`；**残留命题**「`getTree` 无任何分页或大小参数，返回体大小由 store 内容单方面决定」。**剔除**：列举项「`listEntries` 带 `limit`」· 十八方法「均带 `limit`」的 **封闭集形式** · 排他性推论「**唯一** 无上界的读方法」。**不并入** S-0061 关于 `listEntries` 亦无上界的认定

### E-0033 | repository | 自证类
- **来源定位**: PuPu 工作树，`/Users/red/Desktop/GITRepo/PuPu`
- **提交发言**: S-0011
- **取得方式**: `git rev-parse --short HEAD` · `git branch --show-current` · `git status --porcelain` · `git status --porcelain -- src electron unchain_runtime`，2026-08-08
- **支持/反驳**: **支持** E-0001 的承重部分（产品代码锚点与 HEAD 一致）；**部分修正** 其 dirty 计数
- **净内容**: `b2385d5d` / `dev`。dirty/untracked **12 条**（E-0001 记 8 条），新增 4 条为 `.claude/agent-memory/code-owner-shared-arteries/`（3）与 `0000-0005` 案卷（余）。**`git status --porcelain -- src electron unchain_runtime` 输出为空**——三个产品目录零 dirty
- **完整性限制**: 单次快照。庭审期间是否有并发会话改动产品目录，我未持续监视
- **证据类型判据**: 可由任何人在同一工作树直接复跑的 git 状态 → 自证类
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0062 | **已验证** · 承重复核 | 承重三项（`b2385d5d` / `dev` / 三产品目录零 dirty）**在本次复核的首末两次测量中全部现场复现**。其登记的 dirty 计数 12 属 **验证窗口已关闭** 的历史快照，不可回溯核实；今天为 **51**（复核期间自 49 增至 51），**这印证而非推翻本条的核心判断**。**审查人认定其主动性提高而非降低可靠性** —— 提交方在不被要求的情况下修正了本庭自己的登记数字，且明确标注「部分修正」而非「推翻」。**两项处置**：本条可采范围 **明确限定为「revision + branch + 三产品目录零 dirty」**，**dirty 总数（无论 8/12/49/51）不得进入任何裁定文本**；本条经复核 **可作为全批 12 条的时效锚点**

### E-0034 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js`（全文 125 行）· 同目录 `context_v2_bridge.test.js`（全文 197 行）
- **提交发言**: S-0011
- **取得方式**: 两文件整读；`grep -ln "context_v2\|contextV2\|memory_v2\|memoryV2" src/SERVICEs/api*.js`（**零命中**）；`ls src/CONTAINERs/`（**仅 `config`**）；`grep -c "cache\|inflight\|dedup" src/SERVICEs/bridges/context_v2_bridge.js`（**1，且是 `:24-25` 的注释 "never cache module-level state"**）
- **支持/反驳**: **支持** 丁全节与 A1/A2；**复核通过** E-0006 的 renderer facade 段行号（`:39,108`）；**关闭** `code-owner-settings` E-0017 的完整性限制（其未穷举 provider —— `src/CONTAINERs/` 下只有 `config`，不携带 chat id）
- **净内容**: `:32-51` 18 方法白名单（`getStatus` `:33` · `listSpaces` `:38` · `getTree` `:39`）· `:57` `/\[([a-z0-9_]+)\]\s/` · `:59-67` `resolveApi` 逐方法 typeof、缺一即 `null` · `:69-75` 自造 `context_v2_unavailable` · `:77-82` `parseContextV2ErrorCode` · `:86-94` `invokeBridge` 三失败模式 · `:102/107/108` 三个方法均纯透传。测试锁定：`:39-56`（键集 = `isAvailable` + 18，`toHaveLength(18)`）· `:74-90`（payload 逐字节）· `:93-99`/`:155-160`（缺任一方法 fail-closed）· `:127-131`（bridge 缺席时 `getStatus()` 以 `context_v2_unavailable` 拒绝）· `:151-152`（`getStatus` 无参转发）· `:162-177`（不吞码）· `:179-189`（同步抛转拒绝，以 `listSpaces` 举例）· `:191-196`（码解析，含 `"no code here" → null`）
- **完整性限制**: 静态阅读。**未运行 `react-scripts test`**，故「这些测试今天是绿的」我 **未验证**，只主张「测试文件里写着这些断言」
- **证据类型判据**: 仓内文件字面内容与行号，可在同 revision 直接复核 → 自证类
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0063 | **已验证** · 承重复核 | **本批引用精度最高的一条。** 十四个行号锚点 **全部零漂移**，三条可复跑命令 **输出逐项吻合**，九个测试断言行段逐段命中。`REQUIRED_METHODS` 恰 18 项、`ERROR_CODE_TOKEN_PATTERN` **逐字节一致**、`src/CONTAINERs/` **仅 `config`**。**两项顺带了结**：独立复验 E-0006 的 renderer facade 段行号（`:39,108`）为真；**`code-owner-settings` E-0017 的「未穷举 provider」疑虑在结构上被关闭**（不是被论证关闭）。**一处非实质偏差**：称产品源「125 行」实为 124 行（文件以换行结尾），与 E-0032 的 +1 同形，属计行口径，不触及任何被引行号

### E-0035 | repository | 自证类
- **来源定位**: `src/` 全目录
- **提交发言**: S-0011
- **取得方式**（可复跑）: `grep -rn "getStatus" src --include="*.js" | grep -v "\.test\.js"`；`grep -rn "contextV2Bridge\." src --include="*.js" | grep -v "\.test\.js"`
- **支持/反驳**: **独立复核并确认** `code-owner-settings` E-0020 第 3 点（`contextV2Bridge.getStatus()` 在 renderer 零消费者）；**补充** 它已是承重方法这一相反方向的事实
- **净内容**: `getStatus` 在 `src/` 非测试代码的全部足迹中，**属于 `contextV2Bridge` 的只有两处：定义 `context_v2_bridge.js:102` 与白名单 `:33`**。其余全部属于另外三个不相干的桥（`api.unchain` / `api.ollama` / `memory_vault_bridge`）或同名局部函数（`toast_host.js:89`）。**零调用点。** 同时：`contextV2Bridge` 的既有调用点共 12 处，分布于 3 个 chat-bubble 文件 + `use_chat_stream.js`，**无一处调用 `getStatus`**
- **完整性限制**: 只覆盖字面标识符 `getStatus`。未追经变量间接调用（如 `bridge[name]()`）
- **证据类型判据**: 可复跑 grep + 仓内文件 → 自证类
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0064 | **已验证** · 承重复核 | 承重结论「`contextV2Bridge.getStatus` 在 renderer 生产代码中 **零调用点**」**原样复跑精确成立**（24 行命中中属该 bridge 的恰两处：白名单 `:33` 与定义 `:102`）。**两处枚举不精确，均不触及承重结论**：「其余属另外 **三个** 桥」实际还落在 `ollama_bridge.js`(4 行) 与 `test_bridge/index.js`(2 行) 两个未列模块，`toast_host.js` 是两行非一行；「既有调用点共 **12 处**」中含 **一行 JSDoc 注释**（`context_v2_turn_mutation.js:9`，且该文件是 **第五个** 文件，不在所述四个之内），**真正的产品调用表达式为 11 处**。**若有发言引用「12 处」须同时说明计数规则**，否则读者会把一行注释当调用点

### E-0036 | tool-output | 须查类
- **来源定位**: 实跑于 2026-08-08，纯 `node -e`，无文件读写、无网络
- **提交发言**: S-0011
- **取得方式**（**完整可复跑命令**）:
  ```bash
  node -e '
  const P = /\[([a-z0-9_]+)\]\s/;
  const parse = (m) => { const x = P.exec(m); return x ? x[1] : null; };
  const wrap = (code) => `[${code}] context v2 request failed`;
  const ipc  = (m) => `Error invoking remote method \x27context-v2:get-tree\x27: Error: ${m}`;
  const codes = ["context_v2_store_disabled","context_v2_invalid_request","context_v2_not_found",
  "context_v2_store_owner_invalid","context_v2_unchain_read_unavailable","context_v2_unavailable",
  "context_v2_readiness_failed","context_v2_unreachable","context_v2_failed","context_v2_missing_auth_token"];
  for (const c of codes) console.log(parse(wrap(c))===c, parse(ipc(wrap(c)))===c, c);
  for (const c of ["context-v2-store-disabled","CONTEXT_V2_OFF","context.v2.off","v2Disabled","store_disabled_2"])
    console.log(JSON.stringify(c), "->", JSON.stringify(parse(wrap(c))));
  console.log("no trailing char:", JSON.stringify(parse("[context_v2_store_disabled]")));
  '
  ```
  **实际输出**（节选）：10 个码 **直接 wrap 与穿过 ipcMain.handle 装饰各 10/10 全部 `true true`**；漂移样本 `context-v2-store-disabled`→`null` · `CONTEXT_V2_OFF`→`null` · `context.v2.off`→`null` · `v2Disabled`→`null` · `store_disabled_2`→`"store_disabled_2"`；`"[code]"` 无尾随字符 → `null`
- **支持/反驳**: **回答乙**（码从 sidecar 到 renderer 原样到达，含 IPC 装饰）；**支持** A4（漂移码落 `null`）
- **完整性限制**: **(1)** 这是对 **正则本身** 的实测，**不是对真实 IPC 链路的实测**——`wrap()` 与 `ipc()` 的字符串形状取自 `service.js:186-190` 与 Electron 的 `ipcMain.handle` 既有行为，**我未起 Electron 观察真实消息**。**(2)** `createContextV2Error(code, "")` 仍产出 `` `[code] ` ``（模板自带空格）故仍可解析；**唯一失配是 `]` 为消息最后一字符，而该形状 `createContextV2Error` 构造不出来**。**(3)** 未核实 Electron 版本间 `ipcMain.handle` 装饰前缀是否变化——但正则未锚定，前缀变化不影响
- **证据类型判据**: 由我编写的探针产出的运行时观察 → **须查类**
- **验证历史**:
  - S-0011 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0014 | **已验证** | 原样复跑 exit 0，输出逐项吻合；**手抄正则与产品源 `context_v2_bridge.js:57` 逐字节全等**（且为该文件唯一正则字面量），E-0024 式偏差 **未出现**。**但证明力严格窄于「错误码端到端不丢」，作用域须为「条件保真 + 漂移拒斥」**：**(1)** 实测的是 **条件保真**（*若* 消息带良构 `[code] ` 令牌，*则* 码能取回），**前件（getTree 路径上每次 reject 是否都带该令牌）未触及也不可能触及**。**(2) 探针在设计上无法证伪自己** —— 15 个样本 **全部由 `wrap()` 构造，每个输入都已自带方括号令牌**，「整体缺失令牌」这一形状 **在取样上被结构性排除**。**(3) `S-0010` 戊(4)(a) 的无码出口经独立核实为真且完全落在射程之外**：`contextV2Request` 第一行（`service.js:1893`）即 `ensureMisoReady()`，位于就绪门之前，`getContextV2Tree` 全程经它；该函数抛无前缀无 `.code` 的自由格式串，审查人实测四种 status 变体 **产品解析语义下全部得 `null`，穿过 IPC 装饰后仍为 `null`**。**(4) 假设「码字符集恒为 `[a-z0-9_]`」本探针零覆盖** —— 它把该字符集写进正则当前提再用满足前提的样本喂它，**对字符集本身不构成检验**；该命题证据在 E-0037（自陈为下界），归 `code-owner-runtime` 确认。**(5) 一条未登记的前提** —— 该正则 **无锚定且取首个匹配**，实测 `"…[foo] bar: Error: [context_v2_store_disabled] x"` → `"foo"`（**真码被遮蔽**）；真实 Electron 装饰串不含方括号故不发生，但「前缀不引入方括号」**未被登记**。**(6) 非实质替代** —— 探针 `parse` 收裸字符串，产品收 Error 对象并先做 `typeof error.message === "string"` 守卫；审查人补测三输入无分歧。**(7) 脆弱性** —— 手抄与产品间 **无编译期链接**，`:57` 一旦改动 **本探针不会失败**。**审查人三点明示请求已照录**：采纳须绑定「条件保真」措辞；提交方已发出的两项确认 **均不足以把本条升格为端到端结论**（缺口在覆盖面而非契约稳定性），**不得以其到位为由撤销本作用域限制**；若后续有发言以本条主张 `getTree` 单次调用的收端可判别性，其 **无码出口分支须另行举证**

### E-0037 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/` 下 `route_memory_v2.py` · `memory_v2_runtime.py` · `memory_v2_store_boundary.py` · `memory_v2_unchain_read_adapter.py`；碰撞点 `route_memory_v2.py:259,333,388,504,591,719,804,856` · `memory_v2_runtime.py:702` · `memory_v2_store.py:1527`；我方 `src/SERVICEs/bridges/context_v2_bridge.js:69-74`
- **提交发言**: S-0011
- **取得方式**（可复跑，须在 `unchain_runtime/server` 下执行）:
  ```bash
  grep -rhoE '"(context_v2|memory_v2)[a-zA-Z0-9_]*"' route_memory_v2.py memory_v2_runtime.py \
    memory_v2_store_boundary.py memory_v2_unchain_read_adapter.py | sort -u | tr -d '"' > /tmp/codes.txt
  wc -l < /tmp/codes.txt ; grep -vE '^[a-z0-9_]+$' /tmp/codes.txt
  grep -rn '"context_v2_unavailable"' --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  ```
  **实际输出**: **42** 个互不相同的码；**不符 `^[a-z0-9_]+$` 的：0 个**；`context_v2_unavailable` 在 **9 个非测试点** 发出，含 `route_memory_v2.py:333`（`_read_runtime_for_store_owner` 内，`store_owner=unchain` 且 `UNCHAIN_DATA_DIR` 未配置 → 503 + `retryable: True`）
- **支持/反驳**: **支持** 乙 §2.3（解析面按字符集开放，未知码原样到达）与 §2.4（码碰撞，且 sidecar 那一侧在读路径上）；**支持** A4；为请求 3 提供锚点
- **完整性限制**: **(1)** 只覆盖四个文件里 **以字面量出现** 的 `"context_v2*"` / `"memory_v2*"` 字符串，**未覆盖** 拼接构造或其他文件；**42 是下界不是全集**。**(2)** 这四个文件落 `code-owner-runtime` 边界，我 **只读引用**，「字符集恒定」是否为其有意约定 **须由其确认**（请求 3）。**(3)** `route_memory_v2.py:333` 在读路径上 —— 我据其行号与上下文（`if store_owner != STORE_OWNER_UNCHAIN: return _runtime()` 紧邻其上）判断，**与 `code-owner-runtime` Q1 门清单第 5/7 项一致，但运行时是否真被触发我未实跑**
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容 → 自证类。**但结论跨入他人边界，本条只作为「请 runtime 确认」的锚点**
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0065 | **未验证** · 承重复核 | **一项计数不符，且与本条自己的 `来源定位` 相互矛盾。** 「42 个互不相同的码」与「不符 `^[a-z0-9_]+$` 的 0 个」**逐字节复现**；**但「`context_v2_unavailable` 在 9 个非测试点发出」实为 10 个** —— 而本条 `来源定位` 自己列出的碰撞点 **恰好就是 10 个行号**。审查人逐一确认这 10 处 **全部是真实发出点**（均为 `raise MemoryV2Error(...)`），**不存在「10 个出现点但只有 9 个发出点」这一辩解**。**本次复核顺带了结 E-0054 完整性限制 (2) 登记的「差异未追」**：正确数字是 **10**，E-0037 少 1、E-0054 多 1（多的是 `tests/test_memory_v2_runtime.py:24`，因两者共用的 `grep -v "/tests/"` 过滤器对 **无前导 `./`** 的路径失效）。**失效点在计数不在结论方向** —— 碰撞事实成立（同一字面串既由 renderer facade `:69-74` 自造，又由 sidecar 至少 10 处发出），读路径上那一处（`:333`）经独立核实为真。更正后承重范围应为「碰撞成立 + 42 码下界 + 字符集今天恒定」。补正责任归 `code-owner-shared-arteries`
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`②）| **裁定记明「登记正文为真，概括句为假」** —— 其 `来源定位` 自列的 **十个行号** 经 S-0065 逐一独立核实为真实发出点。**射程之内**：该十个行号所载事实 · 42 个互不相同的码（**自陈为下界**）· 不符 `^[a-z0-9_]+$` 者 0 个 · `route_memory_v2.py:333` 在读路径上且 503 + `retryable:true` · 碰撞事实本身。**剔除**：计数表述「在 **9** 个非测试点发出」。**不并入** 正确值 10 这一表述形式（**其所指十行本已在登记正文内，故该十行不受剔除影响 —— 裁定明示这是本条与③④的关键差别**）

### E-0038 | repository | 自证类（**结论为推断，见完整性限制**）
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:186-190`（`createContextV2Error`）· `:1733-1782`（`readJsonResponse`，尤其 `:1740-1771` 取 `parsed.error.code`）· `:1892-1940`（`contextV2Request`，尤其 `:1897-1906` 就绪门对 `/status` 显式豁免、`:1931-1939` 码保留 + 消息替换）· `:1945-1986`（`getContextV2Status`，尤其 `:1946-1957` 合成负值短路、`:1958` 真发请求）· `/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:210-247, 249-288`
- **提交发言**: S-0011
- **取得方式**: 定点读取上述行段；`grep -n "getStatus\|getTree\|listSpaces\|code\b" electron/preload/bridges/context_v2_bridge.js`（确认 preload 为纯 `ipcRenderer.invoke` 透传，`:42` `getStatus` · `:81` `listSpaces` · `:86` `getTree`，无重包无归一）；`grep -n "getContextV2Status\|store_disabled" electron/tests/main/context_v2_service.test.cjs`
- **支持/反驳**: **支持** 甲 §1.2（`getStatus()` 三出口，「未启用」态多半走 reject 而非 resolve）；**部分反驳** `code-owner-settings` E-0020 §2.2(b) 的读法；**支持** 乙 §2.1 的传输链
- **净内容**: `createContextV2Error(code, message)` = `` new Error(`[${code}] ${message}`) `` + `error.code = code`。`contextV2Request` 的 `catch`：`const code = error?.code || "context_v2_failed"; throw createContextV2Error(code, "context v2 request failed")` —— **码保留、消息替换**。就绪门 `:1897` 第一个条件 `endpoint !== …/status` 使 `/status` **必定真的发出**。`getContextV2Status` 只在 `unchainStatus !== "ready" || !unchainPort` 时短路成合成负值。**`context_v2_service.test.cjs` 有测试锁定短路分支（`:277-287`）与 200 分支的字段投影（`:210-247`），无任何测试覆盖 `/status` 非 2xx 分支**
- **完整性限制**: **(1)** 本条的 **结论**（shipped 配置下 `getStatus()` reject）是「我对 `service.js` 控制流的静态阅读」× 「`code-owner-runtime` E-0010 b3 的须查类观察」，**两者都不是产品运行观察，乘积只能是推断**。**(2)** `service.js` 与 `electron/tests/**` 落 `code-owner-electron` 边界，我 **只读引用**，权威结论归其所有（请求 2(a)）。**(3)** 未起 Electron、未观察真实 IPC 消息
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类。**但明确标注为「推断」的结论部分不具此地位，不得作为事实引用**
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0066 | **已验证** · 承重复核 | 十一个行段锚点全部命中；**其最尖锐的一句「无任何测试覆盖 `/status` 非 2xx 分支」经独立穷举确认为真**（`getContextV2Status` 在 49KB 测试文件中仅 3 次出现，全文唯一 `ok:false` 在 `:1332` 且不在 `/status` 路径上）。**本庭点名核实的推断标注问题：标注是干净的** —— 本条内 **三处** 标注，且审查人逐一追查案卷内 **全部四处再引用点，未发现任何一处以事实口吻裸用**；其中 A3 拟裁定条文那一处虽语气肯定，但 **命题形态是禁止性的**，即便推断为假其代价也只是保守。**结论部分仍是推断，本次复核未改变其地位**（推断 × 收窄后的须查类 = 仍是推断）。**一处未标注的转述**：净内容把 catch 写作 `error?.code || "context_v2_failed"`，**原文更严**（非字符串的真值 `.code` 会被原文丢弃、被转述保留）

### E-0039 | repository | 自证类（**与 `code-owner-runtime` E-0010 联合，其为须查类**）
- **来源定位**: `electron/main/services/unchain/service.js:2098-2116`（`listContextV2Spaces` / `getContextV2Tree`，**均无合成负值短路**）· `:1892-1940`（数据调用的唯一出口是 200 载荷或抛）· `:1946`（合成负值短路 **为 `getContextV2Status` 独有**）· `src/SERVICEs/bridges/context_v2_bridge.js:86-94, 107, 108`；**联合** `0000-0008-2026-0808` 本案 `code-owner-runtime` 的 E-0010（`store_owner=off` → 503 `context_v2_store_disabled`；空 store → 200）与 E-0012 S4（`store_owner=off` 时 `listSpaces` 亦 503）
- **提交发言**: S-0011
- **取得方式**: 定点读取 + 与 runtime 已提交观察的联合推理
- **支持/反驳**: **部分反驳 F2**（`code-owner-settings` 称其为「唯一无绕行方案」的推翻条件）；**支持** A3 与丙 §3.3
- **净内容**: **`getTree` resolve ⟺ 读真的发生了**（主进程对数据调用无「不发请求就返回负值」的分支，该分支是 `getContextV2Status` 独有）；**`getTree` reject ⟹ 读没发生，且拒绝码说明原因**；后端不存在「store 关着却回 200」的出口。**故空态（resolve + `entries:[]`）与未启用态（reject + `context_v2_store_disabled`）落在两个不相交分支上，单次调用即可区分，不需要 `getStatus`。** 同一结构在第一跳 `listSpaces` 上同样成立（E-0012 S4）
- **完整性限制**: **(1)** 依赖 `code-owner-runtime` 的 E-0010 / E-0012，**该两条为须查类**（Flask `test_client`、鉴权替身、未起真实 sidecar），**其被推翻则本条随之被推翻**。**(2)** `store_owner=unchain` 分支 runtime 未能实跑，**该配置下 `getTree` 的实际码我完全未核实**。**(3)** 「主进程无合成负值分支」是我对 `:2098-2116` 与 `:1946` 的对读，归 `code-owner-electron` 确认
- **证据类型判据**: 仓内文件字面内容 + 对他人已提交证据的联合推理 → 自证类（就其代码事实部分）；**其结论强度受所联合的须查类证据约束**
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0016 | **分类更正** | 本庭原将本条误标为须查类并写入路由记录，**系归档脚本以标题串是否含「须查类」判类所致** —— 本条标题的括注「与 `code-owner-runtime` E-0010 联合，其为须查类」指的是 **它所联合的那一条**，不是本条。本条为 **自证类**，未被路由，亦无需路由。详见 S-0016
  - S-0067 | **已验证** · 承重复核 | **按本庭指示以自证类复核，未因标题措辞改分类。** 四个 `service.js` 行段与三个 renderer 行号全部精确命中；核心代码事实「主进程对数据调用无合成负值短路，该分支为 `getContextV2Status` 独有」**经逐函数对读确认为真**。**审查人特别肯定其把可证伪条件写在脸上**（完整性限制 (1) 主动登记「所联合的须查类被推翻则本条随之被推翻」）。**须切成两段采纳**：**代码事实段**（主进程数据调用无合成负值出口）**可作为事实引用**；**判别器结论段** 须绑定 E-0010 经 S-0007 收窄后的作用域 —— **该收窄对本条尤其咬**：判别器恰恰需要那条 200 空态臂，而 S-0007 已认定它 **只在 Electron 从不发出的 `pupu_legacy` 下取得**，**故在 Electron 实际会发出的两个 owner 之下，判别器的「resolve 臂」今天尚无任何产品配置下的观察支撑**。本条足以承载的是「在主进程这一层，`getTree` 的 resolve/reject 二分未被任何合成负值污染」

### E-0040 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:734-736, 750-783, 800-802, 817-834`
- **提交发言**: S-0011
- **取得方式**: `grep -rn "listSpaces\|listEntries\b" src --include="*.js" | grep -v "\.test\.js"`；定点读取 `MemoryV2PendingReviews`；`grep -n "setInterval\|poll"` 对四个既有 V2 消费者各跑一次
- **支持/反驳**: **修正** 记录（`listSpaces` 并非新消费者，第一跳今天已在跑）；**支持** 丙 §3.2 / §3.4 与 A5
- **净内容**: `:782` `contextV2Bridge.listSpaces({ ownerChatId: owner })` 在 `Promise.all` 四路之一，**是生产代码非测试**；`:800-802` 以 `Array.isArray(spacePayload?.spaces) ? … : []` **把「没有 space」与「载荷畸形」折叠成同一个空数组**；`:736` 以 `Boolean(owner) && contextV2Bridge.isAvailable()` 为门。**四个既有 V2 消费者中 `setInterval` 命中 0 处**（`use_chat_stream.js:10721` 的唯一 interval 与 V2 读平面无关）——**V2 读平面今天零轮询**
- **完整性限制**: 只覆盖字面标识符。`use_chat_stream.js:10721` 的 interval 我只看了行号与上下文关键字，**未逐行确认它确实与 V2 无关**——但它不在 `contextV2Bridge` 的 12 个调用点附近
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容 → 自证类。**该文件落 `code-owner-chat-bubble` 边界，我只读引用，处置权归其所有**
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0068 | **已验证** · 承重复核 | 四个行段锚点全部命中，三条 grep 输出全部复现，**「四个既有 V2 消费者中 `setInterval` 命中 0 处」经逐文件重跑精确成立**。**提交方自陈未逐行确认的那个 interval（`use_chat_stream.js:10721`），审查人读了上下文并确认与 V2 读平面无关 —— 该限制可解除**，请在采纳时一并记录，避免下游重复携带一个已被填补的缺口。**一处射程界定**：「V2 读平面今天零轮询」是 **全称否定命题在有限枚举上的完全验证**（枚举面即四个既有消费者文件），在该枚举面上充分，**但不蕴含「未来新增消费者也不会轮询」，引用时不得外推**

### E-0041 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/locales/` 全部 11 个 `.json`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/boot_locale_parity.test.js:59-106`
- **提交发言**: S-0011
- **取得方式**（可复跑）:
  ```bash
  ls src/locales/
  python3 -c "
  import json,glob,os
  base=None
  for f in sorted(glob.glob('src/locales/*.json')):
      ks=set(json.load(open(f)).get('memory_inspect',{}).keys())
      if base is None: base=ks
      print(os.path.basename(f), len(ks), 'missing:',sorted(base-ks) or '-', 'extra:',sorted(ks-base) or '-')"
  grep -n "describe\|test(" src/SERVICEs/boot_locale_parity.test.js
  ```
  **实际输出**: 11 个 locale（`de` `en` `es` `fr` `it` `ja` `ko` `pt-BR` `ru` `zh-CN` `zh-TW`），**每个 13 键，missing/extra 全为空**。键集见正文第七节。`boot_locale_parity.test.js` 的 5 个 test 全部围绕 `boot.*`（`:60` 覆盖 11 locale · `:64` 失败键来自 main · `:73` 每 locale 定义全部 `boot.*` · `:89` 无多余 boot 键 · `:106` 非英文确实被翻译）
- **支持/反驳**: **修正** `code-owner-settings` 第五节的「12 个键」（实为 **13**）；**支持** 正文第七节全部三条
- **完整性限制**: 只统计 **顶层** `memory_inspect` 对象的直接子键，**未递归**（该对象无嵌套子对象）。**未核实** 这 13 个键是否全部被 `t()` 实际引用，也未核实是否存在未定义于 `en.json` 的 `t("memory_inspect.*")` 引用——那是 `i18n-coverage` skill 的作业面，我未跑
- **证据类型判据**: 可复跑命令 + 仓内文件字面内容 → 自证类
- **验证历史**:
  - S-0011 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0069 | **已验证** · 承重复核 | **本批唯一一条输出逐字节全等的条目。** 11 个 locale、13 键计数、missing/extra 全空、5 个 `boot.*` test 的 5 个行号 **全部逐字复现，零偏差**。其对 `code-owner-settings`「12 个键」的修正 **成立**（实为 13）。**一条须随引的射程界定**：`boot_locale_parity.test.js` 的 5 个 test **全部只覆盖 `boot.*`**，**没有任何测试守护 `memory_inspect.*` 的齐平** —— 故「今天 13 键在 11 语言齐平」是 **一次快照观察，不是被测试锁住的不变量**，**不得读作「新增 `memory_inspect` 键会被 CI 拦住漏翻」**。若裁定要压在「新增 UI 无需补翻译」上，须另跑 `i18n-coverage`

### E-0042 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:24-25, 194-208, 217-224` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:237-241, 296-298, 425-436, 772-779` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js:277-293`
- **提交发言**: S-0017
- **取得方式**: 定点读取上述行段；`grep -n "onInspectMemory\|handleInspectMemory\|memoryInspect\|setMemoryInspect\|MemoryInspectModal" src/COMPONENTs/side-menu/*.js`
- **支持/反驳**: **支持** 甲（C4 仍然有效）与 乙（两分支应传 `node.chatId`）；**加强** E-0016 —— 其只登记了两个调用点，本条补上 **`node.chatId` 在 character 分支内已被求值两次**（`:195` 索引 `chatsById`、`:197` 传给 `isCharacterChatNode`）这一决定性事实
- **关键原文**:
  ```
  :24-25   const isCharacterChatNode = (chatId) =>
             chatStore?.chatsById?.[chatId]?.kind === "character";
  :194     if (node.entity === "chat") {
  :195       const chat = chatStore?.chatsById?.[node.chatId];      ← node.chatId 用法 1
  :196       const chatTitle = chat?.title || node.label || "Chat";
  :197       if (isCharacterChatNode(node.chatId)) {                ← node.chatId 用法 2
  :198-201     const memorySessionId = buildCharacterMemorySessionId(
                 chat?.characterId, chat?.threadId || "main");
  :207         onInspectMemory && onInspectMemory(memorySessionId, chatTitle)   ← node.chatId 在此被丢弃
  :223       onInspectMemory && onInspectMemory(node.chatId, chatTitle)
  ```
- **完整性限制**: 只覆盖字面标识符与该目录。**未运行应用，未观察实际右键行为。** `side_menu_context_menu_items.test.js:277-293` 我读了全段并确认其断言只有四条 `items.some(item => item?.label === …)`，**未穷举该文件全部 7 个 `buildSideMenuContextMenuItems` 调用点的每一条断言** —— 但 `onInspectMemory` 在该文件仅出现 1 次（`:285`），故「无测试断言其参数」这一结论不受该限制影响
- **证据类型判据**: 仓内文件字面内容与行号，可在同一 revision 直接复核 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0070 | **已验证** · 承重复核 | **`关键原文` 块的每一行原文与每一个行号逐字节命中**，跨两个文件共十一个锚点零漂移。其完整性限制中的自我论证（`onInspectMemory` 在该测试文件仅出现 1 次，故「无测试断言其参数」不受未穷举影响）经 grep **精确成立**，自限逻辑正确。**其核心贡献经复核为真且是实质性的**：E-0016 只登记了两个调用点的存在，本条补上的是 **`node.chatId` 在 character 分支内已被求值两次**（`:195` 索引 `chatsById`、`:197` 传给 `isCharacterChatNode`）—— 这把「`:207` 没传 `node.chatId`」从「可能拿不到」精确化为 **「已在手里但没传」**，是一个实质不同的命题且完全由原文支撑。**一处射程界定**：`:277-293` 那处测试 **不构成对参数契约的守护**（四条断言只查菜单项 label），**新增/改动 `onInspectMemory` 的实参不会被现有测试拦住**

### E-0043 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js:19-25` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:390` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_store.js:1022-1029, 1704-1744` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_tree.js:335-341` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_session_state.js:237, 345-353, 412` · `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11874, 11985`
- **提交发言**: S-0017
- **取得方式**: 逐段定点读取；`grep -rn "activeChatId = " src/SERVICEs/chat_storage/*.js`（产品写点共 **8 处**：`chat_storage_store.js:391,1029,1135,1869,1888,1898,2019` + `chat_storage_migrate.js:313`）
- **支持/反驳**: **确认并升级** `code-owner-settings` 不确定性 3 —— 从「强旁证」升级为证明；**支持** 丙 的全部内容
- **关键原文**:
  ```
  chat_storage_store.js:1712-1737   target = store.tree.nodesById[nodeId]
                                    → updateActiveAndSelectedFromChatId(store, target.chatId)
  chat_storage_store.js:1023        if (!chatId || !store.chatsById[chatId]) { return null; }
  chat_storage_store.js:1029        store.activeChatId = chatId;
  use_chat_session_state.js:345-353 nextActiveId = nextStore?.activeChatId
                                    nextActiveChat = nextStore?.chatsById?.[nextActiveId]
                                    if (!nextActiveId || !nextActiveChat) { return; }
  use_chat_session_state.js:412     activeChatIdRef.current = nextActiveId;
  chat_storage_tree.js:335          if (node.entity === "chat" && node.chatId && store.chatsById[node.chatId])
  ```
- **完整性限制**: **(1)** `chat_storage_migrate.js:285-313` 的五条 fallback 我 **只读了赋值行未逐条追其来源**，该文件归 `code-owner-shared-arteries`；本条结论不依赖它，因为 `use_chat_session_state.js:351` 的守卫会挡下任何不在 `chatsById` 里的值。**(2)** 纯静态，**未运行应用**，「用户点选后 ref 确实更新」是对代码的阅读不是观察。**(3)** 未穷举 `store.tree.nodesById` 的全部写入点，只核了树重建时的 `chatsById` 守卫（`chat_storage_tree.js:335`）与节点工厂（`:35-46`）
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0073 | **未验证** · 承重复核 | 全部 `file:line` 锚点与 `关键原文` **逐字复现**；**但穷举计数「产品写点共 8 处」为假 —— 实为 9 处**，遗漏 `chat_storage_migrate.js:174`（`migrated.activeChatId = active;`），且该文件的 V1→V2 迁移函数 **完全未出现在证据中**，完整性限制只提 `:285-313`、**未披露 `:174`**。**结论方向不翻转** —— 遗漏项同样受 `chatsById` 成员性守卫约束（`:169-172`）。更正为 9 处后可承重
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`③）| **射程之内**：全部 `file:line` 锚点与 `关键原文`（S-0073 逐字复现）。**剔除**：「产品写点共 **8** 处」及任何以该八处为 **封闭集** 的形式。**不并入** S-0073 补出的第 9 个写点（`chat_storage_migrate.js:174`）

### E-0044 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:4116-4119`（`runTurnRequest = useCallback(async ({ mode, chatId: targetChatId, … }))`）· `:4713`（`let effectiveThreadId = targetChatId`）· `:4912`（`effectiveThreadId = resolvedCharacterConfig.session_id`）· `:6453-6458`（成文契约注释）· `:6496`、`:6501`（两条 payload 分支各一次 `owner_chat_id: targetChatId`）· `:11978`、`:11985`
- **提交发言**: S-0017
- **取得方式**: 定点读取；`grep -n "ownerChatId\|owner_chat_id" src/PAGEs/chat/hooks/*.js src/PAGEs/chat/*.js`（排除 `*.test.js`，**产品命中 22 处，全部一致**）
- **支持/反驳**: **支持** 乙 —— 提供本案至今唯一一条 **产端（写侧）** 的权威依据，把「character 分支该传什么」从推断变为「与写侧同键」
- **关键原文**:
  ```
  :6454-6456   owner_chat_id is ALWAYS the UI chat id (targetChatId) — never
               effectiveThreadId, which becomes the character session_id for
               character chats
  :6496        owner_chat_id: targetChatId,        （durable-resume 分支）
  :6501        owner_chat_id: targetChatId,        （普通 send 分支）
  :11985       resolveTurnMutationMemoryPlan({ ownerChatId: currentChatId, sessionId: targetSessionId })
  ```
- **完整性限制**: **(1) 注释本身是传闻类，不得用于证明其所述事实为真** —— 我据以主张的是 **`:6496` / `:6501` 两行代码**，注释只作为「该契约是被有意识写下的」的旁证。**(2)** 未实跑，未观察任何真实 payload。**(3)** 我未核实 sidecar 侧是否真的按 `owner_chat_id` 建 space —— **那归 `code-owner-runtime`**；我只主张 renderer 送出去的键是什么
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类（**其中注释部分按传闻类对待，已在完整性限制中隔离**）
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0074 | **已验证** · 承重复核 | 七处锚点与计数 **全部逐字复现**，`grep` 重跑得 **恰好 22 行**，与登记一致；逐行核对，**六处 `ownerChatId: currentChatId` 全部取 UI chat id 而非 session id**，「全部一致」成立。**本批唯一一条产端写侧的直接代码依据**，相关性强且未越界。可直接承重

### E-0045 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:344-353`（`handleContextMenu`）· `:390`（`onSelect = handleSelectNode`）· `:391`（`onContextMenu = handleContextMenu`）· `:237-241`（`memoryInspect` 本地 state）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/hooks/use_side_menu_actions.js:19-25`
- **提交发言**: S-0017
- **取得方式**: 定点读取 `handleContextMenu` 全体并与 `handleSelectNode` 逐行对照
- **支持/反驳**: **新增** 一条本案至今无人提出的错主路径；**加强** `code-owner-settings` 的 N1 与 F3 的动机；**与 E-0016 的错主路径正交**（二者成因不同、可检测性不同）
- **关键原文**:
  ```js
  const handleContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node: storeNode });
  }, []);
  ```
  **全函数体四行，无 `handleSelectNode`、无 `selectTreeNode`、无 `setChatStore`。**
- **完整性限制**: **(1)** 未运行应用 —— 「右键不选中」是对该回调全文的阅读，**但我未核实 `BUILTIN_COMPONENTs/explorer` 是否在派发 `onContextMenu` 之前另行触发了 `onSelect`**（该组件归 `code-owner-ui-primitives`）。**若 explorer 内部先选中再派右键，本条结论翻转** —— 我明确标注该前提未核实，并请方案庭审在实施前核一次。**(2)** 未观察任何用户行为，「用户常在 A 里右键 B」是使用推断不是数据
- **证据类型判据**: 仓内文件字面内容 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0075 | **已验证（仅限单层事实）** · 承重复核 | 锚点全部属实，单层事实（右键不改动激活选择）成立。**提交方自陈未核的前提由审查人独立核实并解除**：`explorer.js:607-611` 的 `handleContextMenu` 全体只有 `if (node.on_context_menu) node.on_context_menu(node, e);`，**不触发 `onSelect`/`on_click`**，contextmenu 事件不派发 `handleClick`。**但本条的承重范围必须限缩** —— 四个锚点 **全部位于 side-menu 组件层**，共同只证明「右键不会同步激活选择」这一 **发生侧** 事实；本条 **未登记任何** 关于 explorer 派发层、右键菜单项后续取值、bridge/IPC 层、main 校验层、sidecar 层的证据。**「不可检测」是一条跨层否定命题，本条的证据基础一层都没覆盖到。** **故 `expert-architecture` 的必要条件 C-A10 若以「错主在整条链路上结构性不可检测」为据，不能只靠本条承重** —— 跨层可检测性须另行取证或改由 E-0016/E-0024 一线承担。**一处形式偏差**：`关键原文` 是把多行对象字面量压成一行的重排转录，真实函数体跨 10 行而非登记所称「四行」，语句集合与 token 完全一致

### E-0046 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js:208-262`（18 方法 mock）· `:249`（`getTree: noop`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-50`（`REQUIRED_METHODS`）· `:59-67`（`resolveApi`）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:87-89, 3907, 3916, 3920, 4004, 4010, 4013`
- **提交发言**: S-0017
- **取得方式**: 逐项比对 mock 的方法名与 `REQUIRED_METHODS`；机械计数 `awk 'NR>=205 && NR<=262' … | grep -cE "^\s{6}(getStatus|listEvents|…|decideCandidateReview):"` → **18**；`grep -rln "contextV2API" src --include="*.js"` → **3 个文件**（本测试 + facade + facade 测试），即 **`src/COMPONENTs/**` 与 `src/PAGEs/**` 下只有我这一个文件构造该替身**
- **支持/反驳**: **收窄** 本庭 `FRAMING` 已知事实 4 —— `getTree: noop` 不表示 chat-core 消费 `getTree`；**独立支持** `code-owner-shared-arteries` 的 A2，并给出该约束在我边界内的具体、**静默** 的代价
- **完整性限制**: **(1)** 「facade 加第 19 个方法会让我的测试静默改走降级分支」是 **对 `resolveApi()` 全有或全无语义的推论，我未实跑验证**（要验证须临时改 facade，而本轮只读）。**(2)** 我未核实 `chat-bubble` 三个消费者的 mock 形态是否有同样问题 —— 那是其边界
- **证据类型判据**: 仓内文件字面内容 + 可复跑计数命令 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0076 | **已验证** · 承重复核 | 全部锚点、两项计数、`resolveApi` 的全有或全无语义 **均逐字复现**：mock 方法数 **恰 18**，与 `REQUIRED_METHODS` **同名同序**；`grep -rln "contextV2API" src` → **恰好 3 个文件**。`use_chat_stream.js` 七个锚点全部命中。可直接承重

### E-0047 | repository | 自证类
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:93-109`（7 条固定文案）· `:389-394`（`RUNTIME_UNAVAILABLE_CODES`，4 码）· `:396-412`（`NOT_READY_CODES`，15 码）· `:420-435`（`contextV2TurnMutationMessage`，5 出口 + 兜底）· `:437-444`（**不合并的成文理由**）· `:445-451`（`V1_MIRROR_UNAVAILABLE_CODES`，5 码）· `:456-459`（`contextV2V1MirrorMessage`）
- **提交发言**: S-0017
- **取得方式**: 定点读取全部七段
- **支持/反驳**: **补正** `code-owner-shared-arteries` 5.1 的拷贝计数（其把 chat-core 记作「一处 `use_chat_stream.js:3920,4013`」，**那两行只取码不映射，真正的映射是另一文件的两张表**）；**支持** 其 P2（fail-closed 兜底）为一条已在生产中生效的实践；**提出** 6.3 的语境分层约束
- **关键原文**:
  ```
  :434       return CONTEXT_V2_TURN_MUTATION_MESSAGES.FAILED;      ← fail-closed 兜底
  :93-96     A turn-mutation failure must never surface a server message, an error
             path, a payload excerpt or any conversation content …
  :440-444   They get their own mapping rather than being funnelled through
             contextV2TurnMutationMessage: that map would classify an unrelated V1
             code as a rebase CONFLICT and tell the user the conversation moved
             when it did not.
  ```
- **完整性限制**: **(1)** 注释按传闻类对待 —— 它证明「该判断曾被作出并写下」，**不证明「合并一定会撒谎」**；我据以主张的是 **两张表在代码中确实分立** 这一结构事实。**(2)** 我未逐一验证 19 个码在 sidecar 侧确实存在且语义如我表所设（**产端归 `code-owner-runtime`，其 E-0037 报 42 个码**）。**(3)** 未跑 `context_v2_turn_mutation` 的测试
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0077 | **已验证** · 承重复核 | 七段锚点与全部码表计数 **逐字复现**（固定文案 7 条 / `RUNTIME_UNAVAILABLE_CODES` 4 码 / `NOT_READY_CODES` 15 码 / `V1_MIRROR_UNAVAILABLE_CODES` 5 码），`fail-closed` 兜底行号 **精确到 `:434`**。**一处附带发现且极重要**：本条 `RUNTIME_UNAVAILABLE_CODES` 含 `"context_v2_unreachable"`（`:392`），**该行直接证伪同案 E-0053 的负向断言**。两处轻微偏差：「5 出口 + 兜底」实为 5 个 return（第 5 个即兜底，字面读作 6 会多计）；引文标注 `:440-444` 而所引句首实起于 `:439`

### E-0048 | repository | 自证类
- **来源定位**: 全仓负向搜索
- **提交发言**: S-0017
- **取得方式**（**可复跑，须在 `/Users/red/Desktop/GITRepo/PuPu` 下执行**）:
  ```bash
  grep -rn "context_v2_store_disabled\|store_disabled" src --include="*.js"        #  → 零命中
  grep -rn "context_v2_store_disabled" electron unchain_runtime \
    --include="*.js" --include="*.py" --include="*.cjs" | grep -v test
  #  → unchain_runtime/server/memory_v2_runtime.py:726
  #  → unchain_runtime/server/route_memory_v2.py:239
  ```
- **支持/反驳**: **支持** 6.4；**为 D7/D8 的「无主构件」提供一个此前没有的可证伪度量**（权威码在既有拷贝里的覆盖率 = 0/5）；**加强** `code-owner-settings` §2.1 末「未启用在 V1 词汇表里根本不存在」—— 本条把它从「Inspector 缺一枝」扩大为「整个 renderer 都不知道这个码」
- **完整性限制**: **(1) 这是负向证明**，只覆盖两个字面标识符。若该码以拼接、常量转发或别名形式出现于 `src/`，本搜索看不到 —— 我认为可能性低但 **不能排除**。**(2)** 我未核实该码在我的调用路径上今天是否可达（`store_owner=off` 时 `memory_v2_requested` 是否也为假），**该可达性判断是推断，不得作为事实引用**。**(3)** 未核实 `electron/` 侧的中转是否改写过该码 —— 归 `code-owner-electron`（其 S-0010 戊(3) 已报「code 保真」）
- **证据类型判据**: 可复跑 grep + 仓内文件 → 自证类
- **验证历史**:
  - S-0017 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0078 | **已验证（「0/5」一句除外）** · 承重复核 | 两条登记命令 **逐字复现**：`context_v2_store_disabled` 在 `src/` 出现 **0 次**（exit 1），服务端两处命中行号精确（`memory_v2_runtime.py:726` · `route_memory_v2.py:239`）。**核心负向命题成立。** **但「覆盖率 = 0/5」在本条内无任何命令支撑，且分母未定义** —— 若分母取 E-0053 所列五码集，**该比率为假**：`context_v2_unreachable` 已被 `src/PAGEs/chat/hooks/context_v2_turn_mutation.js:392` 消费并映射为用户可见的 UNAVAILABLE 文案，**覆盖率至少 1/5**。**该比率不得作为计数引用** —— 注意 `expert-architecture` 的请求 4 曾请求把 0/5 写进裁定文本，该请求的证据基础于此失效

### E-0049 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`，工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08。**工作树未修改，`src/` `electron/` `unchain_runtime/` 三目录 `git status --porcelain` 行数为 0**
- **提交发言**: S-0017
- **取得方式**（**完整可复跑命令，只读、不改文件**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && CI=true npx react-scripts test \
    --testPathPattern="side_menu_context_menu_items|use_chat_stream.turn_mutation_v2" \
    --watchAll=false
  ```
  **实际输出（尾部）**:
  ```
  PASS src/COMPONENTs/side-menu/side_menu_context_menu_items.test.js
  PASS src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js

  Test Suites: 2 passed, 2 total
  Tests:       54 passed, 54 total
  Snapshots:   0 total
  Time:        2.344 s
  ```
  **同批（纯 grep，自证类，一并登记以免另编号）—— 挂载接口的机械爆炸半径**:
  ```bash
  grep -rn "buildSideMenuContextMenuItems" src electron --include="*.js" --include="*.cjs"
  #  产品 2 处：side_menu_context_menu_items.js:11（定义）· side_menu.js:25,425（import + 调用）
  #  测试 7 处：全部在 side_menu_context_menu_items.test.js
  grep -rn "onInspectMemory\|handleInspectMemory" src electron --include="*.js" --include="*.cjs"
  #  产品 5 处：side_menu_context_menu_items.js:19,207,223 · side_menu.js:296,433(+444 依赖数组)
  #  测试 1 处：side_menu_context_menu_items.test.js:285（仅 jest.fn()，不断言参数）
  #  electron/ 下：零命中
  ```
- **支持/反驳**: **支持** 甲（C4 破坏面为零，且基线为绿）；**支持** 「受影响对象」的 6 处清单与「零测试改动」结论
- **完整性限制**: **(1)** 只跑了 2 个 suite，**不是全量回归** —— 「我改这 6 处不会破坏别处」这一命题 **未被本次运行证明**，只证明了「今天这 2 个 suite 是绿的」。**(2)** 未跑 `npm run test:electron`（我边界内无 `.cjs` 双胞胎，但该断言未经验证）。**(3)** grep 只覆盖字面标识符，**未核实是否存在经动态属性访问的旁路调用**。**(4)** 依 [A-012](../../../codex/adaptations.md)，本条不作为「实施后一定安全」的依据，只作为「实施前基线状态」的登记
- **证据类型判据**: 运行时观察（本仓自带 test runner，未搭替身、未改代码）→ **须查类**（与 `code-owner-electron` 的 E-0029 同判据同分类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查）
- **验证历史**:
  - S-0017 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0022 | **已验证** | 复跑逐项命中：revision `b2385d5d` 与「三产品目录零 dirty」属实；**跑法合规**（`react-scripts test`，非 `npx jest`，未触工程铁律）；输出逐字复现 `2 suites / 54 tests / 0 snapshots`、退出码 0。同批 grep 的 **承重结论确认为真**（`buildSideMenuContextMenuItems` 与 `onInspectMemory|handleInspectMemory` 的产品命中全部落在 `src/COMPONENTs/side-menu/` 内，`electron/` 零命中）。**S-0015 的双 worktree 根隐患对本条不成立且属结构性免疫** —— `react-scripts test` 把 jest `roots` 钉死在 `<rootDir>/src`，两个 worktree 根均不在其下；实证：`.claude/worktrees/` 下 **实存 12 份同名陈旧副本**，本次仍只收集到主树 2 个 suite。**四点保留，均不改变可采性，但限定引用范围**：**(1) 基线是对照测量不是安全证明** —— 该运行的全部逻辑内容是「在未修改工作树上这 2 个 suite 通过」，而「破坏面为零」是关于 **尚未发生的改动之后** 的命题；差分的一端缺席时，基线对前瞻性命题的独立贡献是 **零**，不是弱而是无。**(2) 仪器分辨率不足，即便改动后重跑也近乎测不到该改动** —— 审查人拆跑得：`side_menu_context_menu_items.test.js` **7 条**、`use_chat_stream.turn_mutation_v2.test.js` **47 条**；**54 中 87% 属后者，而 S-0017 自己的「受影响对象」把该 suite 归为「无影响」**；落在挂载接口一侧的只有 7 条，其中向构建器传 `onInspectMemory` 的 **仅 1 条**（`:285`，传 `jest.fn()`、只断言菜单项存在，**不断言调用参数**）。**故凡以「54」表达对挂载接口一侧把握程度者，按构造高估；正确数字是 7。该构成事实此前不在案卷内，由复跑补入。** **(3) 一处引用宽于所证，但被同条目自我限缩中和** —— `支持/反驳` 写「支持甲（C4 破坏面为零，且基线为绿）」，运行只证得后半句；同一形状在 S-0017 结论句复现（「grep 爆炸半径 **+ 54 绿测试基线** 重新证成」）。**但完整性限制 (1)(4) 已逐字撤回该过宽**（「未被本次运行证明」「只作为实施前基线状态的登记」），**读完整条条目的人不会被误导**；审查人明确 **不把「宽引用且有自限」与「宽引用且无自限」等同**。**(4) 范围认定：E-0049 不承重于 F1** —— F1 两个析取支（chat-core 表示 C4 失效 / 挂载点无法新增 prop）**本条均不含指向任一支的内容**；前者由 **表态** 了结（表态不是证据），后者由读 `side_menu.js:772-779` 的 JSX 了结（定位登记在 E-0042/E-0050）。**故整条勾销 E-0049，F1 的证据态势不变** —— 本庭据以裁量时不必把二者绑定。**两处非实质瑕疵**：grep 计数标签口径（「产品 2 处」旁列了 3 个行号，把 import 行排除未说明；「测试 7 处」实为 8），**被列举的行号本身准确，不触及承重结论**；完整性限制 (4) 援引 A-012 **不实**（A-012 管的是运行时故障记录不得与阻塞记录混计、必到角色不得派生子 instance，**并无任何关于基线证据可作何用的规则**），但其自设限制本身正确且严于任何规则要求，审查人记为 **「标错法条依据的正确自我限缩」，不作减分**。**审查人另回报一条超出本条、经本庭点名故据实登记的事实**：双 worktree 根隐患 **对 `npm run test:electron` 仍然成立**（该 script 的 `--testMatch="**/electron/tests/**/*.test.cjs"` **不带 roots 限制**），本案后续若出现依赖该 script 的聚合数字须单独核

### E-0050 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/components/streaming_message_store_context.js:18-25`（`createContext({chatId:"", store:null, …})` + `useStreamingMessageStoreContext`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-messages/chat_messages.js:60`（`chat_id: chatId`）· `:73-81`（`streamingStoreContextValue = useMemo(() => ({chatId, store, notifyStreamingContentCommitted}), […])`）· `:212`（唯一 `Provider`）· `:243, :275`（`CharacterChatBubble` / `ChatBubble` 均在 Provider 内）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:1129-1130`（`<ChatMessages chatId={session.activeChatId}`，全仓唯一挂载点）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_session_state.js:202`（`useState(initialChat.id)`）· `:237`（`activeChatIdRef = useRef(initialChat.id)`）· `:346-412`（`reconcileStoreSnapshot` → `:412 activeChatIdRef.current = nextActiveId`）· `:228, :383-384, :464-465`（`characterId` 为 **另一个字段**）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js:647`（`const { chatId, store } = useStreamingMessageStoreContext()`）· `:1932, :1954, :1984`（`ownerChatId={chatId}`，全文件仅此三处出现 `ownerChatId`）· `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:11874`（`const currentChatId = activeChatIdRef.current`）· `:11985`（`ownerChatId: currentChatId`）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "useStreamingMessageStoreContext\|StreamingMessageStoreContext" src --include="*.js" | grep -v "\.test\.js"
  grep -rn "ChatMessages" src --include="*.js" | grep -v "\.test\.js" | grep -v "src/COMPONENTs/chat-messages"
  grep -n "chatId" src/COMPONENTs/chat-bubble/trace_chain.js
  grep -n "activeChatId" src/PAGEs/chat/hooks/use_chat_session_state.js
  ```
  逐段定点读取上列行号。
- **提交发言**: 本 ASSESSMENT（甲 §1.1/§1.2(a)、§1.3、Q2 §4.3、FB3/FB4、B3）
- **支持/反驳**: **支持** 本庭 `FRAMING` 甲「chat-bubble 今天就拿得到 `ownerChatId`」的 **事实部分**；**收窄其推论部分** —— 该值只在覆盖 **活跃会话** 的单一 provider 内可得，Inspector 的两个挂载点（E-0003）都不在其内，故 **不构成 Inspector 可复用的路径**。**支持** `code-owner-settings` N1 与 `0000-0003-2026-0807#S-0024` C4。**关闭** `code-owner-settings` 不确定性 3 **就我端而言的那一半**（我不经过 `node.chatId`；其 side-menu 半边仍归 `code-owner-chat-core`）
- **完整性限制**: **(1)** 静态阅读，**未运行应用**，未观察真实挂载时 provider 的实际取值。**(2)** `grep` 只覆盖字面标识符；未追经变量/动态 import 的第三处 provider（与 E-0003 同类限制）。**(3)** `activeChatId`（state）与 `activeChatIdRef.current`（ref）在同一 tick 内可能短暂不同步 —— 我读了对账逻辑（`:346-412`）**但未构造并发场景验证**；该确认归 `code-owner-chat-core`。**(4)** `src/COMPONENTs/ui-testing/runners/{trace_chain_runner,interject_runner}.js` 挂载真实 `TraceChain` 且 **不包 Provider**，故那里 `chatId` 取 context 默认值 `""` → 我的 V2 消费者 fail-closed；我 **未运行** 该测试台确认
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑 grep，任何人可在同一 revision 直接复核 → **自证类**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0079 | **已验证** · 承重复核 | 全部锚点与 **三项唯一性断言全部实测成立**：`StreamingMessageStoreContext.Provider` 全 `src/` **唯一**；`<ChatMessages` 严格重跑 **单条命中**（全仓唯一挂载点）；`ownerChatId` 在 `trace_chain.js` **恰好 1932/1954/1984 三行**。审查人另确认其第四项限制的前半（两个 ui-testing runner 确实 import 并挂载真实 `TraceChain`）。**正确地把 `FRAMING` 甲的事实部分与推论部分分开。** 可直接承重

### E-0051 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d`（`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`），工作目录 `/Users/red/Desktop/GITRepo/PuPu`，2026-08-08
- **取得方式**（**完整可复跑命令**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu && CI=true npx react-scripts test --watchAll=false \
    --testPathPattern="chat-bubble/(memory_v2_journal_reload|chat_bubble.memory_v2_mount|trace_chain.memory_v2)"
  ```
  **实际输出（尾部逐字）**:
  ```
  PASS src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js
  PASS src/COMPONENTs/chat-bubble/chat_bubble.memory_v2_mount.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.performance.test.js
  PASS src/COMPONENTs/chat-bubble/memory_v2_journal_reload.test.js

  Test Suites: 4 passed, 4 total
  Tests:       23 passed, 23 total
  Snapshots:   0 total
  Time:        2.221 s
  ```
  被锁住的具体断言（定点读取 `trace_chain.memory_v2.test.js`）：`:28-44` 整个 `context_v2_bridge` 被 `jest.mock` 替换为 11 个 mock 方法 · `:50-71` 测试自搭 `StreamingMessageStoreContext.Provider value={{chatId, …}}` · `:196,:205` `mockReadContent` 收到 `ownerChatId: "owner-chat"` · `:297,:302,:377,:456,:470,:483,:614,:681,:690` 其余 bridge 方法同 · **`:229-240` `chatId: ""` 时 `mockListCandidates` / `mockListCandidateReviews` / `mockListPromotions` / `mockListSpaces` / `mockListEvents` 五者 `not.toHaveBeenCalled()` 且面板不渲染**
- **提交发言**: 本 ASSESSMENT（甲 §1.2(c)、不确定性一/二、B6）
- **支持/反驳**: **支持** 甲 §1.2(c)（`chatId → ownerChatId` 全链与 fail-closed 被测试锁住）；**同时反驳** 任何以「chat-bubble 的 V2 测试全绿」论证 V2 读平面可用的说法（B6）—— **bridge 被整体 mock，该套测试对真实链路不作任何主张**
- **完整性限制**: **(1)** jest + jsdom，**未起 Electron、未起 sidecar、未经 IPC、未发过任何真实请求**。**(2)** `context_v2_bridge` 被整体替身，**故本条对「bridge 背后通不通」零证明力**。**(3)** 其 fixture 使用 **旧 PuPu fallback store 的嵌套 `event.payload` 形状** 与已规范化的 `pupu://` ref 串；生产 active 适配器（`memory_v2_unchain_read_adapter.py:176`）把 payload 摊平 —— **故 journal ref 恢复的绿测试不证明生产路径工作**（本条限制引自我的持久记忆 `memory-v2-trace-contract`，其自身为 **传闻类**，此处 **不用于证明该失配为真**，只用于声明本证据的作用域边界；该失配的权威确认归 `code-owner-runtime` / `code-owner-unchain`）。**(4)** 单次运行，未重复三轮
- **证据类型判据**: 由我发起的一次性测试运行产出的运行时观察，依赖本机 node/jest 环境 → **须查类**（依证据规则第三节，无需质疑即强制审查）
- **验证历史**:
  - S-0018 | 未验证（首次提交）| **须查类，请本庭路由 `evidence-examiner`**
  - S-0020 | **未验证** | **本案第一条未通过复核的证据。** **产物真实性无瑕疵** —— 按登记命令逐字复跑，`4 passed / 23 passed` 与登记完全一致（仅 `Time` 与 PASS 打印顺序差异，属 jest 并行调度产物）；**12 处引用行号逐条核对全部属实，无一处虚构或错位**；审查人并确认命令形态合规（`npx react-scripts test` 是本仓 `package.json:72` 的 `test` 脚本本体，**未踩「禁止 `npx jest`」的工程铁律**）。**未验证的是它与所声称命题之间的关系** —— 登记称「三条性质 **全部** 被测试锁住」，逐条核实为 **1/3 属真断言、2/3 属推断**：**(a)「单一 provider」无任何断言** —— 测试 **自建** provider（`:50-71`），provider 是 **测试输入（脚手架）不是被断言的输出**；该结构事实为真但由 **grep** 证明（非测试 provider 仅 `chat_messages.js:212` 一处），**那是自证类证据，不是本次运行的产出**。**(b)「单一挂载点」无任何断言，且字面读法与仓库现状不符** —— `chat_bubble.memory_v2_mount.test.js` 仅 2 个 test，**正向** 断言两处挂载各自收到 bundle，**对穷尽性零断言**；而 grep 得非测试 `<TraceChain` 挂载点 **不少于 5 处**，**另有两处 dev-only 挂载（`ui-testing/runners/trace_chain_runner.js:222`、`interject_runner.js:301`）位于 `chat_messages` provider 之外**。**(c)「空值 fail-closed」是真断言，但射程窄于该整体表述** —— 全 suite 仅 **一个** `chatId: ""` 用例，且 **未** 断言 `mockReadContent` 被拦下（该守卫在 `memory_v2_trace_audit.js:77-78`，仍是 grep 事实）。**两个方向的支撑强度须分别记**：对 **正向** 主张（Q1「A 处拿得到」）为 **中等偏弱** —— 它锁住「context→门面的管道形状完整」（12 处调用点参数一致），但 **结构上无法证明「值的真实取得」**，因为 **该值是测试自己喂进去的**，生产 provider 的填充正确性完全在观察面之外；对 **反向** 主张（「Inspector 不可复用此路径」）**零支撑**，审查人给出三条独立理由 —— 命题形态（该 suite **从未建模 side-menu、从未渲染 side-menu 代码、全文不含 side-menu**，在配置 X 跑绿无法建立配置 Y 会失败）· 承重前提恰是上述未被断言的 (b) 且被两处 provider 外挂载点反证 · 即便让渡该前提，其余推理的事实基础落在 `chat-messages`/`chat-core` 边界内。**审查人明确声明：不主张该反向命题为假（它很可能为真），只判定建立它的不是这条证据。** **一处对提交方有利的记录**：其登记正文对自身局限的四条声明 **异常诚实，经逐条核实全部属实**；**问题不在登记正文，而在引用它的那句概括**。**来源归类**：内部来源，提案方在自身边界内编写并自行运行、被测依赖由其自行 mock，**无外部独立性**（不构成造假嫌疑）
  - S-0023 | **可采，射程受限**（`ruling.md#R-0001`，`procedural-judge` 程序裁定，本庭逐字归档）| **允许作为本案有效证据**，理由三条：审查人判「未验证」的对象 **不是这份证据本身** 而是它与所声称命题的关系，而可采性回答的是「这份证据是不是它自称的那个东西」——该问已获 **无保留的肯定**；只影响「能证明多少」的缺陷 **影响证明力不影响可采性**（证据规则第四节的分野同理适用），且缺陷位置在 **引用它的那句概括**，不在登记正文（其四条自陈局限经逐条核实全部属实）；排除它会 **一并移出一条限制本案主张范围的记录**（其「支持/反驳」字段载有对「以 chat-bubble 测试全绿论证 V2 读平面可用」的自我设限反驳）。**射程逐字限于**：*在 `b2385d5d`、`context_v2_bridge` 被整体 mock 的 jsdom 环境下，`TraceChain` 将 `StreamingMessageStoreContext` 的 `chatId` 以 `ownerChatId` 之名、以既定参数形状转发给该门面；当该 `chatId` 为空串时，五个 list 类门面调用不被发出且待审面板不渲染。* **射程之外一律不由本条承载**：「单一 provider」·「单一挂载点」·「Inspector 不可复用此路径」·以及「三条性质**全部**被测试锁住」这一概括本身 —— 引用不因此无效，只是该项失去这一条依据。**裁定明确记明「射程之外 ≠ 命题为假」**，任何角色不得把它读作对反向命题的否定或支持。**不改变**：S-0021 的四项处置、本条的须查类分类与四条完整性限制、以及本案两项闭庭阻塞

### E-0052 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:301-302`（`buildCharacterMemorySessionId` 定义）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage.js:38`（再导出）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:2, 198`（**全 `src/` 唯一消费者**）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "buildCharacterMemorySessionId" src --include="*.js" | grep -v "\.test\.js"
  grep -rn "character_\${\|__dm__" src --include="*.js" | grep -v "\.test\.js"
  ```
  **实际结果**：四条命中 —— 定义 1 · 再导出 1 · `side_menu_context_menu_items.js` 2（import + 调用）。**`src/COMPONENTs/chat-bubble/**` 与 `src/COMPONENTs/chat-messages/**` 零命中。**
- **提交发言**: 本 ASSESSMENT（甲 §1.2(b)、B3、FB4）
- **支持/反驳**: **支持** 甲 §1.2(b)（E-0016 的多态值在我链上结构性不可达）；**收窄 E-0016 的作用域** —— 其所述「静默错主」风险 **只存在于 side-menu → Inspector 那一条路径**，不存在于 chat-bubble 的三个既有消费者上；**不反驳 E-0016 本身**（该 id 确能穿过 main 校验，`code-owner-electron` E-0024 已复跑确认）
- **完整性限制**: **(1)** 只覆盖字面标识符 `buildCharacterMemorySessionId` 与两个字面片段；未覆盖以其它方式拼出同形字符串的可能。**(2)** 未证明 chat store 里 character chat 的 `id` **一定** 是 `chat-…` 形态 —— 我读到的是「`characterId` 是 chat 记录上的独立字段」（E-0050 所列 `use_chat_session_state.js:228,383,464`），**这是强旁证不是证明**；chat id 的铸造归 `code-owner-shared-arteries`（`chat_storage`），该确认归其与 `code-owner-chat-core`
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容与行号 → **自证类**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0080 | **已验证** · 承重复核 | 两条 grep 与四条命中 **逐字复现**，「全 `src/` 唯一消费者」这一穷举断言 **实测成立**（含测试亦为 4 条，即无测试命中）；`src/COMPONENTs/chat-bubble/**` 与 `chat-messages/**` **确为零命中**。**正确地把 E-0016 的作用域收窄为 side-menu→Inspector 单条路径，而非反驳 E-0016 本身，相关性精确**。可直接承重

### E-0053 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · 六个错误决策站点：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:261-279`（`failedProjection`，`:274` 兜底自造码）· `:289-300`（bridge 缺席，`:294` 硬编码码）· `:386-397`（游标停滞，`:391` 硬编码码）· `:513-530`（组件级 bridge 缺席，`:521` 硬编码码）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:179-186`（`errorPresentation`，`:183` 兜底自造码；被 `:805-811` 与 `:844-859` 两个 catch 使用）· `:397-407`（`ReviewContentReader` 的 catch，**无码解析**）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:120-129`（`RefReader` 的 catch，**无码解析**）；四个 `isAvailable()` 使用点：`memory_v2_journal_reload.js:516` · `memory_v2_trace_audit.js:79` · `memory_v2_pending_reviews.js:299, :736`；渲染出口：`memory_v2_pending_reviews.js:1015-1050`（五支）· `memory_v2_journal_reload.js:574-578`
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  grep -rn "context_v2_store_disabled\|context_v2_unchain_read_unavailable\|context_v2_store_owner_invalid\|context_v2_readiness_failed\|context_v2_unreachable" src --include="*.js"
  # → 全 src/（含测试）零命中
  grep -rn "getStatus\|unchainAPI\|isAvailable" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 仅 4 行 isAvailable，零 getStatus，零 unchainAPI
  grep -c "catch (error)" src/COMPONENTs/chat-bubble/memory_v2_{journal_reload,pending_reviews,trace_audit}.js
  grep -n "contextV2Bridge\." src/COMPONENTs/chat-bubble/*.js | grep -v "\.test\.js" | grep -v isAvailable
  ```
- **提交发言**: 本 ASSESSMENT（乙 §2.1/§2.2、丙 §3.2/§3.3、Q2 §4.1、B4）
- **支持/反驳**: **回答 Q4 收端半边** —— 我端 **不能** 区分「V2 未启用」与「有 store 但没数据」；**支持** `code-owner-shared-arteries` A4 并加强之（两个站点连解析器都不调）；**独立复核并确认** E-0035 第 3 点（`contextV2Bridge.getStatus()` 在 renderer 零消费者）就我端的那一半；**支持** `code-owner-settings` C1 的关切但指出其方向在我端是相反的（未启用被归一成失败，而非失败被归一成空）
- **完整性限制**: **(1)** 只覆盖字面标识符；未追经变量间接引用（如 `bridge[name]()`）。**(2)** **静态阅读，未运行组件，未观察任何真实错误到达时的实际渲染**；「出厂默认态在我端渲染成红色报错块」是 **推断**，其成立依赖 `code-owner-runtime` E-0010(b) 与 `code-owner-electron` E-0026 的码保真链 —— **前者为须查类且 S-0009 已登记其臂落在产品不选用的分支上**，故本推断继承其全部收窄。**(3)** 未穷举 `src/` 其它区域是否有以别的写法消费该码的地方 —— 但 grep 覆盖全 `src/`（含测试）且为零，该风险极低
- **证据类型判据**: 可复跑 grep + 仓内文件字面内容与行号 → **自证类**。**但其中标注为「推断」的渲染结论不具此地位，不得作为事实引用**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0081 | **未验证** · 承重复核 | **登记的第一条 grep 输出「全 `src/`（含测试）零命中」经同 revision 复跑直接证伪 —— 实为 4 条命中，其中 1 条在产品代码**：`context_v2_turn_mutation.test.js:173` · `:494` · `use_chat_stream.turn_mutation_v2.test.js:867` · **`context_v2_turn_mutation.js:392`（产品代码）**。其余四条 grep 与全部锚点逐字复现。**该证伪不推翻本条在 chat-bubble 边界内的结论**（`src/COMPONENTs/chat-bubble/**` 内五码确实零命中，故「我端不能区分未启用与空数据」成立），**但登记形态是全 `src/` 的封闭集断言**，下游若据此认为「整个 renderer 都不认识这五个码」会被误导。**且本条与同案 E-0047 内部抵触** —— E-0047 的 `关键原文` 恰好引用了含该码的 `RUNTIME_UNAVAILABLE_CODES` 表。**引用前必须改写为**：五码中四码在 `src/` 零命中；`context_v2_unreachable` 在 `context_v2_turn_mutation.js:392` **被 chat-core 消费并映射为用户可见 UNAVAILABLE 文案**，另有 3 处测试命中
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`④）| **裁定记明本条是本批最接近被排除的一条** —— 失实项在 **登记正文内**（`取得方式` 下的一条「实际输出」标注），已越过 R-0001 的形态；其仍可采靠三件具体的事：**(a)** 本条给出 **完整可复跑命令**，正是复跑当场揭穿了标注（可复核性）· **(b)** 审查人 **逐条复跑其余四条命令并逐一命中全部锚点**，留存项经独立验证而非默认放行（无器械污染）· **(c)** 失实项可在条目级干净切下。**三者缺一即判不可分而排除。** **射程之内**：命令 2/3/4 的输出 · 全部锚点 · 边界内命题「`src/COMPONENTs/chat-bubble/**` 内五码零命中」。**剔除**：「→ 全 `src/`（含测试）零命中」这一实际输出标注，**及任何以本条承载全 `src/` 范围负向断言的引用形式（含单码形式）**。**与 E-0047 的内部抵触** 已由同一复核环节机械解决，**裁定不裁孰真孰假**，登记其不构成射程界定的未决事项。**本条「渲染结论为推断」的自我限制不解除、不削弱**

### E-0054 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · 渲染层自造点：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:274`（`context_v2_journal_unavailable`）· `:294, :521`（`context_v2_unavailable`）· `:391`（`context_v2_invalid_cursor`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:183`（`context_v2_request_failed`）· `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:69-75`（facade 自造 `context_v2_unavailable`，`code-owner-shared-arteries` 边界，只读引用）‖ 服务端同名点：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:3604`（`context_v2_invalid_cursor`）· `context_v2_unavailable` 于 `unchain_runtime/server` 下 **11 个非测试点**（`code-owner-runtime` 边界，只读引用；其 E-0037 记为 9 个，我的计数为 11，**差异未追**，见完整性限制）
- **取得方式**（**完整可复跑命令**）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  for c in context_v2_request_failed context_v2_journal_unavailable context_v2_invalid_cursor context_v2_store_disabled; do
    printf "%-36s server:%s  renderer:%s\n" "$c" \
      "$(grep -rl "\"$c\"" unchain_runtime/server --include='*.py' 2>/dev/null | grep -v tests | grep -v __pycache__ | wc -l | tr -d ' ')" \
      "$(grep -rl "$c" src --include='*.js' 2>/dev/null | grep -v '\.test\.js' | wc -l | tr -d ' ')"
  done
  cd unchain_runtime/server && grep -rn "context_v2_invalid_cursor" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/"
  grep -rn "context_v2_unavailable" --include="*.py" . | grep -v __pycache__ | grep -v "/tests/" | wc -l
  ```
  **实际输出**:
  ```
  context_v2_request_failed            server:0  renderer:1
  context_v2_journal_unavailable       server:0  renderer:1
  context_v2_invalid_cursor            server:1  renderer:1
  context_v2_store_disabled            server:2  renderer:0
  memory_v2_store.py:3604:                "context_v2_invalid_cursor",
  11
  ```
- **提交发言**: 本 ASSESSMENT（乙 §2.2、请求 3、B5、FB5）
- **支持/反驳**: **支持** `code-owner-shared-arteries` 请求 4 与 E-0037（`context_v2_unavailable` 码碰撞），**并新增两条其未查到的**：(i) 我端 **两个** 服务端零出处的自造码；(ii) `context_v2_invalid_cursor` 是 **第二处** 渲染层/服务端字面碰撞且条件不同。**支持** B5、请求 3
- **完整性限制**: **(1)** `grep -rl` 统计的是 **文件数** 不是出现次数；`context_v2_store_disabled` 的 `server:2` 指两个文件。**(2)** `context_v2_unavailable` 我计得 11 个非测试点，`code-owner-shared-arteries` E-0037 记 9 个 —— **差异我未追**（可能是搜索文件集不同：其只搜四个指定文件，我搜全目录）。**以其为该边界的权威计数**，我这条只主张「≥9，且含读路径上的那一个」。**(3)** `unchain_runtime/server/**` 落 `code-owner-runtime` 边界，我 **只读引用**，**服务端该码在什么条件下发出、字符集是否为有意约定，权威解释归其**（其请求 3 正在问）。**(4)** 未核实这些自造码是否曾被写进任何契约文档
- **证据类型判据**: 可复跑命令 + 两仓内文件字面内容与行号 → **自证类**。**但其跨入 `code-owner-runtime` 边界的部分只作为「请其确认」的锚点，不作为本边界的终局主张**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0082 | **未验证** · 承重复核 | 四行对照表与 `memory_v2_store.py:3604` **逐字复现**；**但「`context_v2_unavailable` 于 11 个非测试点」为假 —— 真实为 10**。**缺陷为标签失实而非转录失实**：命令确实打印 11，但其 `grep -v "/tests/"` **无法过滤 `tests/test_memory_v2_runtime.py:24`**（命令先 `cd` 进 `unchain_runtime/server` 再以 `.` 为根，**相对路径无前导 `/`**），故一个测试点混入了「非测试点」计数。**该缺陷同时部分解释了提交方自陈「未追」的 11 vs E-0037 之 9 的差异** —— 三方数字现已闭合：**正确为 10**。本条的对冲主张（「≥9，且含读路径上的那一个」）**不受影响**，四行对照表可原样承重
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`⑤）| **射程之内**：四行对照表（S-0082 逐字复现）· `memory_v2_store.py:3604` · 渲染层五个自造点锚点与 facade `:69-75` · **以及本条自设的对冲主张「≥9，且含读路径上的那一个」**（该主张为其 `完整性限制 (2)` 的登记内容，**不依赖被剔除的计数**）。**剔除**：标签「于 **11** 个非测试点」。**不并入** 正确值 10

### E-0055 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`，重建 `{status, ready, url, reason, pid, port}` 六字段）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/**`（对 `SERVICEs/api.*` 的 import **零命中**）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '330,343p' src/SERVICEs/api.shared.js
  grep -rn "from \"../../SERVICEs/api" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 零输出
  grep -rn "unchainAPI" src/COMPONENTs/chat-bubble --include="*.js" | grep -v "\.test\.js"
  # → 零输出
  ```
- **提交发言**: 本 ASSESSMENT（Q2 §4.1/§4.2(2)）
- **支持/反驳**: **独立复核并确认** `code-owner-electron` S-0010 乙(1)（`normalizeUnchainStatus` 丢弃 `memoryV2`）；**同时对其「暴露代价在我边界内等于零」补一条其未覆盖的事实** —— 从 `src/COMPONENTs/**` 看，该构件 **经任何合法路径不可达**：facade 丢弃它，而组件不许直连 `window.unchainAPI`（本仓工程铁律）。**不反驳** 其构件存在与形状的主张（我未复核 `service.js:1645-1663` 的 15 字段，归其）
- **完整性限制**: **(1)** 只覆盖字面 import 路径 `"../../SERVICEs/api`；未覆盖经其它相对深度或经中间模块的传递 import。**(2)** `electron/**` 与 `service.js` 落 `code-owner-electron` 边界，我 **未读**，`memoryV2` 的 15 字段与四态闭集我 **完全依赖其 S-0010 乙 的陈述**，本条 **不为该部分承重**。**(3)** 未运行应用观察 `api.unchain.getStatus()` 的实际返回
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑 grep → **自证类**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0083 | **未验证** · 承重复核 | 两条登记 grep 各自零输出属实，`normalizeUnchainStatus` 六字段重建 **逐字复现**；**但「`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` 的 import 零命中」这一负向断言为假** —— 放宽为 `grep -rn "SERVICEs/api" src/COMPONENTs/chat-bubble` 后命中 `artifact-summary/artifact_kind_registry.js:2`（`import api from "../../../SERVICEs/api";`，三层深度，`:208` 调用 `api.unchain.listToolModalCatalog()`）—— **正落在提交方 `完整性限制 (1)` 自己预告的搜索盲区里**。**该反例不翻转承重结论**：反例调用的不是 `getStatus`，而 `api.unchain.getStatus` 无论是否可达其返回都经 `normalizeUnchainStatus` 重建为六字段、`memoryV2` 被丢弃，**故「chat-bubble 拿不到 `memoryV2`」仍成立**；**不成立的是「经任何合法路径不可达」这一更强的形式**。**引用时须改写为**「facade 侧 `normalizeUnchainStatus` 结构性丢弃 `memoryV2`，故即便 chat-bubble 经 facade 取状态也拿不到该构件」，**删去「零 import / 不可达」的表述**
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`⑥）| **裁定记明**：两条登记 grep **其字面命令的零输出为真**；失假的是把该字面结果概括为 **边界级封闭集**，**而该盲区正是本条 `完整性限制 (1)` 自己预告的那一个**（此形态与 E-0051 同类）。**射程之内**：`api.shared.js:330-343` 六字段重建 · 两条 grep 就其字面命令的零输出 · **改写命题**「facade 侧 `normalizeUnchainStatus` 结构性丢弃 `memoryV2`，故即便 chat-bubble 经 facade 取状态也拿不到该构件」。**剔除**：「对 `SERVICEs/api.*` import **零命中**」这一边界级封闭集断言 **及其派生的更强形式「经任何合法路径不可达」**。**不并入** `artifact_kind_registry.js:2` 这一反例

### E-0056 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/chat_bubble.js:107-110`（`hasMemoryV2Audit = isAssistant && isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)`；`shouldRenderTraceChain` 三选一）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js:1928-1936`（`mergeMemoryV2AuditWithJournal(presentMemoryV2Audit(bundle?.memory_v2, …), …)` → `if (memoryV2Audit)`）· `:1950`（`unmountDetailsWhenClosed: true`）· `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/timeline/timeline.js:133, 367`（该 flag 的实现，`code-owner-ui-primitives` 边界，只读引用）· 封顶常量 `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:6-8`（`PAGE_SIZE=500` / `MAX_PAGES=20` / `MAX_EVENTS=10000`）· `:353-372`（限额分支）· `:257`（`agentRuns.slice(-128)`）· `:480`（`mergeRefs .slice(0,512)`）· `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js:6`（`MAX_PENDING_ITEMS = 25`）
- **取得方式**（可复跑）:
  ```bash
  cd /Users/red/Desktop/GITRepo/PuPu
  sed -n '100,112p' src/COMPONENTs/chat-bubble/chat_bubble.js
  sed -n '1927,1960p' src/COMPONENTs/chat-bubble/trace_chain.js
  grep -n "unmountDetailsWhenClosed" src/COMPONENTs/chat-bubble/trace_chain.js src/BUILTIN_COMPONENTs/timeline/timeline.js
  grep -n "JOURNAL_RELOAD_MAX_PAGES\|JOURNAL_RELOAD_MAX_EVENTS\|JOURNAL_RELOAD_PAGE_SIZE\|MAX_PENDING_ITEMS =" src/COMPONENTs/chat-bubble/memory_v2_{journal_reload,pending_reviews}.js
  ```
- **提交发言**: 本 ASSESSMENT（甲 §1.3 末、Q2 §4.3、FB1、B1、§六第二/三条）
- **支持/反驳**: **支持** FB1/B1（我的文件被三重门锁在「回合审计块」语义里，不能当通用 V2 浏览器）；**独立确认** `code-owner-shared-arteries` E-0040 的「V2 读平面今天零轮询」并给出 **成因**（折叠即卸载，不是纪律）；**为 `code-owner-electron` E-0032「`getTree` 是唯一无上界读方法」提供一条本仓已有的封顶先例**
- **完整性限制**: **(1)** 静态阅读，**未运行应用**，未观察折叠/展开时的实际挂载与卸载行为。**(2)** `isMemoryV2TraceBundle` 的判据我未逐行读（其在 `SERVICEs/runtime_events/memory_v2_trace_presenter.js`，`code-owner-shared-arteries` 边界）—— 我只主张「有这道门」，不主张「这道门在什么载荷下开」。**(3)** 封顶常量 **从未在真实非空载荷上跑过**（G2），其是否够用是推断。**(4)** `unmountDetailsWhenClosed` 的实现在 `code-owner-ui-primitives` 边界，我只读引用其存在
- **证据类型判据**: 仓内文件字面内容与行号 + 可复跑命令 → **自证类**
- **验证历史**:
  - S-0018 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0084 | **未验证** · 承重复核 | 三重门与多数封顶常量 **逐字复现**（`chat_bubble.js:107-110` · `trace_chain.js:1928-1936` · `:1950` · `journal_reload.js:6-8` 的 500/20/10000 · `:257 .slice(-128)` · `pending_reviews.js:6 MAX_PENDING_ITEMS = 25`）。**但 `:480` 登记为 `mergeRefs .slice(0,512)`，实际该行为 `.slice(0, 128)`** —— **真实行号配错常量**；`.slice(0, 512)` 确存在于同文件 `:254` 与 `:421`，故非凭空捏造而是行号与常量错配，**下游若按「mergeRefs 封顶 512」使用会低估该路径的收紧程度（实为 128）**。**另一处：跨界自我限制在锚点层被遵守，在其派生因果主张中被越过** —— `支持/反驳` 的「独立确认『V2 读平面今天零轮询』并给出 **成因**（折叠即卸载，不是纪律）」是一条关于 `code-owner-ui-primitives` 实现行为的 **因果主张**，而 `timeline.js:367` 只显示该 flag **被再向下转发**，本条 **未登记任何证明「确实发生卸载」的证据**，也未运行应用观察。**「折叠即卸载」应作为待核推断处理，不得承重**
  - R-0003 | **可采，射程受限**（`ruling.md#R-0003`⑦，两类缺陷分别处置）| **射程之内**：`chat_bubble.js:107-110` · `trace_chain.js:1928-1936` · `:1950` 的 flag **声明** · `timeline.js:133/:367` 的 flag **存在与再向下转发** · `journal_reload.js:6-8`（500/20/10000）· `:353-372` · `:257 .slice(-128)` · `pending_reviews.js:6 = 25`。**剔除（第一类）**：`:480` ↔ `.slice(0,512)` 这一 **行号—常量配对** —— 裁定理由是可复核性的反面：**跟着该锚点走的读者读到的不是所主张的东西**（实为 `.slice(0,128)`），下游据此会 **低估** 收紧程度，**故整项剔除而非附注**。**不得承重（第二类）**：「**折叠即卸载**」这一因果命题 —— 本条 **未登记任何证明卸载实际发生的证据**，按 **待核推断** 处理；**裁定不裁其真伪，射程之外 ≠ 命题为假**。**不并入** `:254`/`:421` 的 `.slice(0,512)`

### E-0057 | runtime-failure | 须查类
- **来源定位**: `speaker-of-the-house` 于 2026-08-08 派遣 `expert-llm` 的任务终止通知，原文逐字如下
- **提交发言**: S-0019
- **取得方式**: 本庭直接收到的结构化任务通知（`status: failed`），**非重构、非推断、非回忆**
- **支持/反驳**: 支持 S-0019（`expert-llm` 不可派遣，quorum 停在 8/9）
- **完整性限制**: **单次观察，未重试。** 本庭 **未** 就「等待后是否恢复」取证；前案 `0000-0003-2026-0807#E-0116` 已确立同签名在 **并发度 1、等待 40 分钟后仍触发**，故本庭依 [A-012](../../../codex/adaptations.md)「取证不足按未核实交，强于再挂一次」**不重试**，并把「未重试」如实登记为本条的限制。**本条不主张该配额永不恢复**，只主张本次派遣确实以此原因失败
- **证据类型判据**: 一次性运行时观察，观察对象（配额状态）在观察后可变、不可复跑 → **须查类**
- **验证历史**:
  - S-0019 | 未验证（首次提交）| **须查类。但本条的复核方式与其余须查类不同** —— 它不可由第三方复跑（复跑即再消耗一次派遣），其真实性由通知原文的结构化字段承载。本庭 **不路由 `evidence-examiner`**，理由见 S-0019 第四节，**并将该不路由判定交 `codex` 审查**

  ```
  status: failed
  summary: Agent "expert-llm ASSESSMENT" failed: Agent terminated early due to an API error:
           You've reached your Fable 5 limit. Run /usage-credits to continue or switch models with /model.
  ```

  **与前案的签名比对**（本庭机械对照，不作推断）：`0000-0003-2026-0807#E-0116` 记载的 `expert-architecture` 第三次派遣通知为 `You've reached your Fable 5 limit`。**两串在「配额主体」与「配额类型」上逐字相同。**

### E-0058 | repository | 自证类
- **来源定位**: unchain `a4e69f413c449c5768433ba4dddc5b60b8146991`（branch `dev`）· PuPu `b2385d5d`（branch `dev`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/unchain-core.lock.json`
- **提交发言**: S-0024
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
- **验证历史**:
  - S-0024 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0085 | **已验证** · 承重复核 | 三条命令全部重跑，unchain revision、工作树计数、lock 内容 **逐值复现**，lock 与 `dev` HEAD 今日 **仍然相等**；登记的 `cat` 转录为紧凑单行 JSON 而实际文件为 5 行 pretty-print，属排版性不逐字，无键无值被改动。

### E-0059 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`，工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`，2026-08-08。关键产品源：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py:56-72`
- **提交发言**: S-0024
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
- **验证历史**:
  - S-0024 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0027 | **已验证** | 两段实跑 **逐字符复现成功**（heredoc 四行输出全同；既有测试 `13 passed in 0.70s` 全同），源锚点 `unchain_adapter.py:56-72` 引用精确。两条主张 **均成立**：(a)「零 env 配置下产品自带 bootstrap 把 sibling repo 挂上 `sys.path`」为 **直接观察**；(b)「三名同僚的 `ModuleNotFoundError` 系 harness 未 import 产品 bootstrap，而非环境缺陷」是 **归因**，但经审查人 **三项独立验证后机制被完整闭合**，属 **被证据支撑的归因，不是未经检验的推测**。**一处措辞须收窄**：「非环境问题」**只在「产品不要求安装 unchain」这一意义上成立** —— sibling 回退 **确实依赖目录布局**（提交方限制 (1) 已自陈，不构成夸大）

### E-0060 | repository | 自证类
- **来源定位**: unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `:310`（`SCHEMA`）‖ PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:532-567`（`_route_entry`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:6641-6669`（legacy `_entry_response`）· `:6680,6688,6696`（legacy kind 校验三分支 `folder`/`file`/`link`）
- **提交发言**: S-0024
- **取得方式**: 两侧函数全文定点读取并逐字段比对；`grep -rn "class .*EntryKind" -A 12 --include="*.py" src/`（unchain 仓）；`grep -n "kind ==" memory_v2_store.py`。**字段集另经 E-0061/E-0062 实跑交叉确认**（非纯静态）
- **支持/反驳**: **复核并证实** E-0014 的三项主张全部为真；**新增** E-0014 未记的一条 —— `content_bytes` 在 unchain 路径上 **永不出现**，故「显示条目大小」在产品配置下无数据
- **完整性限制**: legacy 侧的字段集我 **只做静态阅读，未实跑 `pupu_legacy` 分支**（E-0010/E-0012 已实跑过该分支的其他端点，但未登记 `_entry_response` 的完整字段集）。故「两侧差异」中 **unchain 半边是观察，legacy 半边是静态读取**。`image` kind 我 **未构造实例**，其字段集按 `_route_entry:565-566` 的分支推断（与 `markdown` 同走 `content_ref` 分支）
- **证据类型判据**: 两仓内文件的字面内容与行号，可在给定 revision 直接复核 → 自证类
- **验证历史**:
  - S-0024 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0086 | **已验证（附一处必须随证据一同更正的引证）** · 承重复核 | 六个锚点中 **五个逐行精确**，两侧字段集差异与 `content_bytes` 在 unchain 路径永不出现均 **独立证实**；**一处引证指错分支** —— `:565-566` 被用来支撑「`image` 与 `markdown` 同走 `content_ref` 分支」，但该两行是 **`link` 分支**，正确锚点为 `:563-564`。

### E-0061 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`。脚本 `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/g8_tree.py`（自包含，仅写系统临时目录）。相关产品源：`unchain:sqlite_memory_v2.py:843-902`（`list_entries`，无 kind 过滤）· `unchain:sqlite_memory_v2.py:1120-1240`（写路径，无父目录要求）· `unchain:memory/workspace/service.py:367-385`（`create_folder`）· `unchain:sqlite_read_v2.py:1242-1255`（`workspace_tree`）
- **提交发言**: S-0024
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
- **验证历史**:
  - S-0024 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0028 | **已验证** | 双臂实跑 **复现成功且确定**（连跑两次，全部计数、kind 集合、parent_paths、树层级逐项相同）。**「当且仅当」的两个方向各自都有观察支撑** —— 方向一（显式建 folder → 返回、正常嵌套）由 A 臂直接观察，方向二（不建 → 不返回、祖先不物化）由 B 臂直接观察，**不是只跑到一个方向**。审查人另作 **静态闭合**：全 unchain 仓 folder 条目的产生点 **只有一处**（`create_folder`），`_write` 每次只落一条 entry 且 **无任何父目录创建**，故该双向命题在本 revision 上 **机制性成立，非仅两点观察**。「仓内既有测试正是按退化那一路写的」**属实且可逐行指认**。**一处须登记的瑕疵**：登记的「实际输出」是 **经删节与手工重排版的转录，不是逐字**（三处差异 **全为排版性，无一处数字 / kind / 路径 / 层级被改动**）

### E-0062 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`。脚本 `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/g8_http.py`（依赖同目录 `g8_tree.py`）+ 一段 inline heredoc（空态臂 A/B）。产品源：`route_memory_v2.py:68-106`（`_endpoint`）· `:315-361`（`_read_runtime_for_store_owner`）· `:1111-1120`（tree 路由）· `memory_v2_unchain_read_adapter.py:570-640`（`open_pupu_unchain_memory_v2_reader` 的六道前置门）
- **提交发言**: S-0024
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
- **验证历史**:
  - S-0024 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0026 | **已验证（射程窄于引用它的散文）** | 核心诊断与全部登记观察 **独立复跑全部复现，承重三行逐字节相同**。**但须按三处收窄使用**：**(1) 是四个臂不是五个** —— E-0062 登记的是 **四** 个臂逐字节相同，且 **四臂只落在两道内部门上**。**(2) 四个 503 臂里没有一个是真正的「V2 不可用」态** —— 其唯一那个真·不可用臂（`UNCHAIN_DATA_DIR` 未设）返回的是 **另一个码 `context_v2_unavailable`**。**(3) 越界不在证据条目里，在 S-0024 的结论散文里** —— 审查人明确认定 **E-0062 自身的登记文字是诚实的**（它写「四者」、自标「新建会话→无 lifecycle」为静态推断、如实记了第五臂的不同码）；是 S-0024 的散文写成「**五种**条件坍缩」「400/404 在产品路径上根本不存在」。**本庭据此更正自己在 S-0024 归档后所作的转述**（见 S-0030）

### E-0063 | repository | 自证类
- **来源定位**: unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/journal/models.py:13`（`_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")`）· `:234` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/curator/models.py:1167` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/curator/ports.py:23-32` ‖ PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:68-106`（`_endpoint`，`:98-104` 的 `except Exception` → `context_v2_failed`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:65`（`class PupuUnchainMemoryV2ReadError(RuntimeError)`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_curator_query.py:129, 179`
- **提交发言**: S-0024
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
- **验证历史**:
  - S-0024 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0087 | **已验证（自陈的完整性限制 (1) 经本关闭合，可去除）** · 承重复核 | 两段探针 **逐字符重跑成功**，八个锚点 **全部逐行精确**；其自陈未做的「穷举 unchain 异常类」一项，我以更强的结构判据 **直接闭合**（unchain 全仓对 `MemoryV2Error` 引用数 0，对 PuPu 模块 import 数 0，故结构上不存在继承）。

### E-0064 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f41`，harness 同 E-0061（`g8_tree.py` 的 `build()`）+ inline 探针。产品源：`unchain:src/unchain/persistence/sqlite_read_v2.py:418`（`WorkspaceSearchService(repository=workspace)` —— **无 `vector_index` 实参**）· `unchain:src/unchain/memory/workspace/search.py:128-149`（`vector_index: VectorIndex | None = None`）· `:264`（评分通道名 `lexical_fallback`）· `:313-322`（`vector_error` 仅在 `_vector_index is not None` 时可能非空）· `:114-120`（`WorkspaceSearchResult`）‖ PuPu 侧硬编码点 `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:485`（`backend`，真实计算）· `:489`（`vector_status`，常量）
- **提交发言**: S-0024
- **取得方式**: 在 E-0061 的 reader 实例上直接探测内部状态并对比路由输出（**同一实例、同一次查询**，排除两者不同源的可能）。**实际输出**:
  ```
  WorkspaceSearchService._vector_index          = None
  raw WorkspaceSearchResult.vector_error        = ''
  raw WorkspaceSearchResult.lexical_fallback    = False
  raw hits matched_by                           = [['lexical_fallback','fts'], …]
  route search_entries keys                     = ['backend','owner_chat_id','query','results','vector_status']
  route backend                                 = 'fts5'
  route vector_status                           = 'degraded'
  ```
  另经 E-0062 案例 8 在 **完整 HTTP 路径** 上复现同样两个字段值
- **支持/反驳**: **回答** 戊 —— unchain 读路径上 **不存在向量索引对象**，`"degraded"` 是占位串不是状态描述；**支持并强化** S-0009 二(3) 的事实登记，**但更正其含义**；**支持** Q3「vector view 保持现状」的前提（比 S-0004 的结论更彻底：不是「向量后端关着」，是「读路径没接向量后端」）；**新增** 一条词汇碰撞（`matched_by` 的 `'lexical_fallback'` vs 结果级 `lexical_fallback`，实测同时出现 `['lexical_fallback','fts']` 与 `lexical_fallback=False`）
- **完整性限制**: **(1)** 只覆盖经 `SQLiteContextV2ReadService` 的 **读** 路径（即 PuPu Context V2 的路径）。unchain **另有** 一条确实传 `vector_index` 的路径（`sqlite_long_term_memory_v2.py:104-106, 176`），**本条不否认 unchain 支持向量**，只主张 PuPu 这条读路径没接。**(2)** 探测 `_vector_index` 用了私有属性，**属实现细节**；若该字段改名，探针失效但结论不必然变 —— 更稳的判据是 `sqlite_read_v2.py:418` 的构造实参。**(3)** 未核实 `"degraded"` 是否为某个未落地后端预留的前向占位（见不确定性 5）。**(4)** 临时 store
- **证据类型判据**: 我搭建的 harness 的运行时观察 → **须查类**
- **验证历史**:
  - S-0024 | 未验证（首次提交）| **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner` 审查**，本庭已路由
  - S-0029 | **已验证（结构判据强于提交方自陈）** | 七行观察 **全部独立复现，无篡改迹象**。**本庭在传唤中提出的「只支持这一个实例」之忧不成立** —— 审查人以 **三臂对照** 证明该字段在 **四种互不相同的真实状态下恒为 `'degraded'`**，而 **相邻的 `backend` 字段确实会变**，故「`degraded` 是占位串不是准确描述」**成立，且不是 `:489` 代码层认定的重复**（它证明的是「该字段的值不反映真实状态」，非仅「该字段是硬编码的」）。附 **三处引证/表述缺陷** 与 **一处必须随证据一同引用的收窄**，详见 S-0029 正文

### E-0065 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:48`（`_MAX_LIFECYCLES = 10_000`）· `:363-390`（`_workspace_entries`，`while len(entries) < _MAX_LIFECYCLES`，超限抛 `PupuUnchainMemoryV2ReadError("workspace listing exceeds the P0 route limit")`）· `:65`（该异常继承 `RuntimeError`）· `route_memory_v2.py:98-104`（裸 `except Exception` → 500）· `:355-361`（`PupuUnchainMemoryV2ReadError` 的 catch **只包住 `open_…reader`，不包住 `get_tree` 调用本身**，见 `:1114-1119`）‖ unchain `a4e69f41` · `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:53-55`（`_MAX_LIST_RESULTS=200` / `_MAX_LIST_SCAN=10_000` / `_SCAN_PAGE_SIZE=200`）· `:1178-1224`（`_workspace_page`：每次调用 **全量扫描后排序再切片**）· `:1202-1205`（超扫描界抛 `SQLiteContextV2ReadError`）
- **提交发言**: S-0024
- **取得方式**: 定点读取五处；异常层级由 E-0063 的 MRO 实测确认；catch 作用域由 `route_memory_v2.py:1111-1120` 的缩进结构直接读出
- **支持/反驳**: **支持** 本条评估结论的条件三；**新增** 一条本案无人提出的规模风险 —— tree view 是唯一会「一次拉完整个 store」的消费者，而该路径的失败模式是 **500 无语义码**
- **完整性限制**: **纯静态阅读，未构造 >10,000 条目的 store，未实测任何规模下的耗时或实际失败。** 「O(n²/页大小)」是对 `_workspace_page` 每页全扫这一结构的复杂度推断，**不是性能测量**。真实 store 的条目规模未知（G2）。**该风险是否现实，取决于真实数据规模 —— 本案无法取证**
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类。**其中标注为「推断」的复杂度与「未实测」的规模失败，不具此地位，不得作为事实引用**
- **验证历史**:
  - S-0024 | 未验证（首次提交）| 自证类，提交方自陈的只读检查，未经第二方独立复核
  - S-0088 | **已验证（一处区间端点漂移一行，内容未变）** · 承重复核 | 九个锚点内容 **全部证实**，其最承重的结构主张 —— **`get_tree` 的调用落在 `PupuUnchainMemoryV2ReadError` 的 catch 作用域之外，因而超限失败以 500 无语义码出场** —— 经本关逐行确认 **成立**；一处区间端点各早一行（`:1202-1205`，实为 `:1203-1206`），区间内仍完整含该 raise。

### E-0066 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/api.shared.js:330-343`（`normalizeUnchainStatus`）· `:390`（导出）· `pupu:src/SERVICEs/api.unchain.js:870-885`（`getStatus` 无条件调用它）· `pupu:src/PAGEs/chat/chat.js:578`
- **提交发言**: S-0025
- **取得方式**: `grep -n "normalizeUnchainStatus" -A 20 src/SERVICEs/api.shared.js`；`sed -n '868,886p' src/SERVICEs/api.unchain.js`；`grep -rn "\.getStatus(" src --include="*.js" | grep -v test`
- **支持/反驳**: **支持** `code-owner-electron` 乙 (1) 与 `code-owner-chat-bubble` E-0055 的同一事实（**第三次独立同向**）；**同时收窄** 其量级结论 —— 见正文一 1.3
- **净内容**: `normalizeUnchainStatus` **重建**（非投影）6 个键 `{status, ready, url, reason, pid, port}`，`memoryV2` 与 `contract` 二者均不在其中。`api.unchain.getStatus()` 在 4s 超时后 **无条件** 对返回值调用它。**`api.unchain.getStatus()` 在 `src/` 的产品消费者只有一个**：`chat.js:578`（另三处 `.getStatus(` 命中分属 `api.ollama` 与 `ollamaBridge`，与本案无关）
- **完整性限制**: 静态阅读，未运行。**未核实** 是否存在经 `window.unchainAPI.getStatus()` 直连的第三方消费者 —— `code-owner-chat-bubble` 已就其边界作过该核实（E-0055，`src/COMPONENTs/chat-bubble/**` 对 `SERVICEs/api.*` import 数为 0），**我未对 `src/COMPONENTs/**` 全域复核**
- **证据类型判据**: 仓内文件字面内容与行号，同 revision 可直接复核 → 自证类
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0089 | **已验证（第三次同向，与前两次无分歧）** · 承重复核 | 全部锚点内容证实，登记的 grep **逐条重跑且四行命中分区完全如登记所述**；其穷举断言（`api.unchain.getStatus()` 在 `src/` 只有一个产品消费者）经本关 **用比登记更严的探针** 复核仍成立。**三方（E-0025 · E-0055 · E-0066）在实体事实上无分歧**，唯一差异是一处引用区间端点。

### E-0067 | repository | 自证类
- **来源定位**: `pupu:src/SERVICEs/boot_readiness.js:1-22`（文件头）· `:62-74`（模块级 listeners）· `:180-186`（`subscribe` / `getState`）· `:205-206`（默认导出）· `pupu:src/SERVICEs/bridges/boot_readiness_bridge.js`（哑 bridge，与判定模块分居两目录）· `pupu:electron/main/services/boot_readiness/service.js:113`（`const FAILURE_CODES = Object.freeze([`）· `:339`（导出）· `pupu:src/SERVICEs/boot_locale_parity.test.js:44-45`（`require("../../electron/main/services/boot_readiness/service")`）· `:47`（`[...FAILURE_CODES, "unknown"]`）
- **提交发言**: S-0025
- **取得方式**: `ls -la` 三处；`sed -n '1,30p' src/SERVICEs/boot_readiness.js`；`grep -n "subscribe|getState|listeners|export"`；`grep -rn "FAILURE_CODES" electron/main/services/boot_readiness/service.js`；`grep -n "FAILURE_CODES|require(" src/SERVICEs/boot_locale_parity.test.js`
- **支持/反驳**: **支持** C-A3 与 C-A5；**是前案 E-0090 在当前 revision（`b2385d5d`）上的重测**，四条结构属性与两道守卫 **全部仍然成立**，无一失效
- **净内容**: (1) 判定模块在 `src/SERVICEs/`，哑 bridge 在 `src/SERVICEs/bridges/` —— **两目录分居是既有事实，不是我的提议**；(2) 模块是 **模块级 store + `subscribe()` / `getState()`**，非 context provider；(3) 产端枚举 `Object.freeze`；(4) 消费端测试 **`require` 产端模块取枚举，不转写**；(5) 消费端显式补一个 `"unknown"` 第四类
- **完整性限制**: 我 **未跑** `boot_locale_parity.test.js`，也未跑 `boot_readiness_service.test.cjs`。**「两道守卫今天仍绿」我未验证** —— 我只验证了「两道守卫的代码仍在且形状未变」。前案 E-0090 的同一限制（不主张 boot 运行无缺陷）继续适用
- **证据类型判据**: 仓内文件字面内容与行号 → 自证类
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0090 | **已验证** · 承重复核 | 十个锚点 **全部逐行精确**，五条结构属性 **逐条独立证实**；作为前案 E-0090 在 `b2385d5d` 上的重测，本关另比对了前案原文，**四条结构属性与两道守卫确实无一失效**，连 `boot_readiness.js` 的 206 行总长都与前案 `:1-206` 的登记一致。

### E-0068 | repository | 自证类
- **来源定位**: `pupu:unchain_runtime/server/memory_v2_store.py:6641-6669`（`_entry_response`）· `:7396-7400`（`list_entries` 追加 `deleted`）· `:7408-7434`（`get_tree`）· `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:411-452`（`list_entries` / `get_tree`）· `:532-567`（`_route_entry`）
- **提交发言**: S-0025
- **取得方式**: 两侧五段全文定点读取并逐字段人工比对
- **支持/反驳**: **支持** E-0014 的主结论（两侧字段集与 `kind` 词汇表不同）；**补正** E-0014 一处遗漏；**新增** 两条 E-0014 未记的结构事实
- **净内容**:
  - **共有 13 字段，含全部树结构字段**：`entry_id` · `space_id` · `path` · `parent_path` · `name` · `kind` · `description` · `mime_type` · `revision` · `space_revision` · `source_event_id` · `ref` · `replayed`。`ref` 两侧拼装格式亦逐字相同
  - **E-0014 漏记的字段**：`pupu_legacy` 的 `list_entries` 在 `_entry_response` 之外追加 `response["deleted"] = row["deleted_at_ms"] is not None`（`:7396-7400`）；`unchain` 侧 `_route_entry` **无此字段**
  - **树装配两侧字面等价，且含静默孤儿升根**：`parent = nodes.get(item["parent_path"])` → `if parent is None: roots.append(node)`。**条目数不丢，树的形状可退化为扁平，退化无信号**
  - **`parent_path` 两侧来源不同**：`pupu_legacy` 是存储列（`row["parent_path"]`）；`unchain` 是计算值（`entry.path.rsplit("/", 1)[0] or "/"`）
- **完整性限制**: **纯静态比对，未在 `store_owner=unchain` 下实跑**（G8，与 E-0014 同一限制）。「运行时字段确实如此」是推断不是观察。**我未读 `unchain` 侧 `memory_tree` / `memory_list` 的实现**，只读到 PuPu 侧适配器对它们的调用
- **证据类型判据**: 两仓内文件的字面内容与行号 → 自证类
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0091 | **已验证** · 承重复核 | 五个锚点 **全部逐行精确，无一漂移**；13 个共有字段、`deleted` 单侧追加、树装配两侧字面等价含静默孤儿升根、`parent_path` 两侧来源不同 —— **四项主张逐项独立比对证实**。本批引证质量最高的一条。

### E-0069 | repository | 自证类
- **来源定位**: `pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:48`（`_MAX_LIFECYCLES = 10_000`）· `:365`（`while len(entries) < _MAX_LIFECYCLES`）· `:387-389`（超限出口）· `:598,604`（同一常量的第二个用途）
- **提交发言**: S-0025
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
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0092 | **已验证（一处区间端点漂移一行；缺口表述建议按不确定性栏扩写）** · 承重复核 | 四个锚点内容证实，**上限的触发条件与失败模式经本关逐行追完整条链路，主张成立**：超限确以异常出场而非截断，且该异常 **确会以 500 无语义码到达调用方**。一处区间漂移一行（`:381-384`，实为 `:382-385`）。作为「新增已知缺口」的登记请求，本关认为 **事实基础充分**。

### E-0070 | repository | 自证类（**含一处明确标注为「未核实、非主张」的内容**）
- **来源定位**: `unchain:src/unchain/memory/workspace/models.py:251-255`（`MemoryEntryKind`）· `unchain:src/unchain/memory/workspace/service.py:367`（`def create_folder`）· `:381`（`kind=MemoryEntryKind.FOLDER`）· `:154-186`（listing 的 parent 计算）· `pupu:unchain_runtime/server/memory_v2_toolkit.py:364,372-375`（public_kind 白名单含 `folder`）· `pupu:unchain_runtime/server/memory_v2_store.py:845`（`CHECK(kind IN ('folder','file','link'))`）· `:6724`（写时父 folder 强制）
- **提交发言**: S-0025
- **取得方式**: `grep -rn "MemoryEntryKind.FOLDER|\"folder\"" unchain/src/unchain/memory/workspace/*.py`；`grep -n "def .*folder|folder" unchain/src/unchain/memory/workspace/service.py`；`grep -n "parent" 同文件`；PuPu 侧对应 grep
- **支持/反驳**: **部分支持** E-0014 完整性限制 (3) 的乐观方向（`MemoryEntryKind` 有 `FOLDER` 且有 `create_folder`，故「两端都支持 folder」成立）；**但不闭合该推断**
- **净内容**:
  - `unchain` 侧 **存在** `create_folder`，产 `MemoryEntryKind.FOLDER`；PuPu 侧 toolkit **认** `folder` 这个 public_kind
  - **`pupu_legacy` 在写入时强制父 folder 存在**：`memory_v2_store.py:6724` 逐字 `if parent is None or parent["kind"] != "folder"` —— **这正是 `get_tree` 里那个静默孤儿升根之所以安全的原因**
  - **`kind` 词汇表两侧的权威载体不同**：`unchain` 是一个 `StrEnum`（跨仓）；`pupu_legacy` 是一个 sqlite `CHECK` 约束
- **完整性限制（本条最重要的一段）**: **我在 `unchain:src/unchain/memory/workspace/service.py` 未找到与 `memory_v2_store.py:6724` 等价的写时父存在强制 —— 但我只读了那一个文件**，该强制可能在 repository port 或别处。**这不是一条主张，是一个问题，归 `code-owner-unchain`（第 5 批）。** 另：「两端都支持 folder」**不等于**「PuPu 的写路径实际会产生 folder 条目」，后者我完全未核实
- **证据类型判据**: 两仓内文件字面内容与行号 → 自证类。**但标注为「未核实/问题」的部分不具此地位，不得作为事实引用**
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0093 | **已验证（未核实项标注合规；附一条可达性补充与一处推论标注缺失）** · 承重复核 | 七个锚点 **全部逐行精确**，`:6724` 的写时父 folder 强制 **逐字引用无误**；**传唤特别要求核实的一点经本关逐句检查后确认** —— 该「未核实项」被明确标注为「不是一条主张，是一个问题」，且 **在本条正文任何位置均未以事实口吻复用**；本关另重跑了 folder 条目产生点的穷举搜索，**结论成立，但需补一条可达性事实**。

### E-0071 | repository | 自证类
- **来源定位**: `pupu:src/COMPONENTs/memory-inspect/`（目录清单）· `pupu:src/` 全域负向搜索
- **提交发言**: S-0025
- **取得方式**: `ls -la src/COMPONENTs/memory-inspect/`；`grep -rn "context_v2_store_disabled" src --include="*.js" | wc -l`；`git rev-parse --short HEAD`；`git status --porcelain src electron unchain_runtime | wc -l`
- **支持/反驳**: **独立复核并确认** E-0048（`code-owner-chat-core`）与 E-0053（`code-owner-chat-bubble`）—— **第三次同向**；**支持** C-A4 的落位空间判断
- **净内容**: (1) `context_v2_store_disabled` 在 `src/**` 的 `.js` 中命中数为 **0**；(2) `src/COMPONENTs/memory-inspect/` 今天只有 **两个文件**（`memory_inspect_modal.js` 30,849 字节 + `memory_inspect_modal.test.js` 2,678 字节），**无子目录、无其他组件**；(3) HEAD = `b2385d5d`，branch `dev`，三个产品目录 `git status --porcelain` 输出 **0 行**
- **完整性限制**: (1) 是一个 **负向证明**，只覆盖该字面串与 `--include="*.js"`；**未覆盖** 以字符串拼接构造该码的可能路径（我认为可能性极低，但不能排除）。(2) 只是目录清单，**我未读 `memory_inspect_modal.js` 全文**，其内部结构以 `code-owner-settings` 的 E-0015 为准
- **证据类型判据**: 可复跑命令 + 仓内目录状态 → 自证类
- **验证历史**: S-0025 | 未验证（首次提交）| 自证类，提交方自陈的只读检查
  - S-0094 | **已验证** · 承重复核 | 三条命令 **全部重跑，三项净内容逐值复现**，含两个文件字节数精确到个位；**其负向断言经本关以三重更严条件复跑仍为 0**，其自陈的唯一残余风险（字符串拼接构造）本关亦已探测，未见任何构造路径。

### E-0072 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_factory.py:1672-1704`（`create_durable_kernel_runtime_with_diagnostics`，docstring `:1677-1682`）· `:1707-1764`（`create_memory_manager_with_diagnostics` → `QdrantVectorAdapter` + `_prepare_vector_collection_tag`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/unchain_adapter.py:5579-5615`（`_resolve_memory_runtime` 的 `v2_durability` 分支）· `:5688-5697`（`_memory_runtime_uses_durability_only`）· `:7183-7191`（`DurabilityModule` vs `MemoryModule`）· `:7684`（classic 路径传入 `memory_durability_only`）· `:8731,8733,8753`（`memory_commit_allowed` 仅在非 admission 分支置真）· `:9485-9490`（commit 以其为条件）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:406-449`（读端的集合名来自 `memory_factory` 的 tag）
- **取得方式**: 定点读取上述行段；`grep -n "memory_commit_allowed" unchain_adapter.py`（**全文仅 3 处：8731 / 8753 / 9488**）
- **支持/反驳**: **收窄** S-0004 Q3(1) 与本庭甲 —— 支持其读端结论，**反驳** 由此推出的「保持现状 = 用户所见不变」
- **完整性限制**: 静态控制流阅读。**未观察 Qdrant 集合本身**；「不再有新点写入」是由控制流 + 对象能力推出的。**负向搜索限制**：我未穷举全仓是否存在第三个向 `_session_collection_name(...)` 派生集合写入的调用者。**跨界**：全部落 `pupu:unchain_runtime/**`，归 `code-owner-runtime` 终局确认
- **证据类型判据**: 仓内文件字面内容与行号，同 revision 可直接复核 → 自证类
- **验证历史**: S-0045 | 未验证（首次提交）
  - S-0096 | **已验证** · 承重复核 | 十处行号引用 **全部精确命中**，唯一计数断言（`memory_commit_allowed` 全文 3 处：8731/8753/9488）**逐个行号复现**，缩进实测确认 `:8753` 位于 `:8733` 真分支内故「仅在非 admission 分支置真」成立。**审查人代其穷举了自陈未穷举项，结果为该风险确实存在** —— 产品代码 `add_texts` **唯一写入点 `memory_factory.py:1948`**（与 S-0071 就 E-0073 所查同一处）。**这不否定本条任何正向断言**（全部是控制流阅读，逐条为真），**但划定射程：由 E-0072 单独推不出「V2 生效后 V1 向量集合再无新点」这一宽命题**。**一处形式瑕疵**：本条 **缺 `净内容` 字段**，事实主张全内嵌在 `来源定位` 括注里 —— 下游须逐条摘引括注，**不得整体引用「E-0072 证明了 X」**

### E-0073 | tool-output | 须查类
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
- **支持/反驳**: **支持** E-0072 与本发言甲 —— admitted run 装配的运行时对象 **在能力层面就不可能** 写 V1 向量；**收窄** S-0004 Q3(1)
- **完整性限制**: **(1)** 我以 `class Adm: is_active = True` 作 admission 替身，**未经真实 `resolve_memory_v2_admission`**；该替身只被 `_resolve_memory_runtime` 以 `getattr(…, "is_active", False)` 读取（`:5579`），故对本函数保真，**但不证明真实 admission 何时 `is_active`**。**(2)** 未起 sidecar、未跑真实 agent turn、未观察 Qdrant。**(3)** `UNCHAIN_DATA_DIR` 指向临时目录，非本机真实 store（G2 未消除）。**(4)** 同机同环境，非独立第二环境
- **证据类型判据**: 自搭 harness 的运行时观察 → **须查类，依证据规则第三节无需质疑即强制送 `evidence-examiner`**，本庭已路由
- **验证历史**: S-0045 | 未验证（首次提交）
  - S-0071 | **已验证（射程须窄化）** | 八行输出 **全部逐字复现，无篡改迹象**；两仓复跑前后零改动。**admission 替身自陈经核实为充分且必要** —— `memory_v2_admission` 在 `_resolve_memory_runtime` 内 **仅出现一次**（`:5579` 的 `getattr(..., "is_active", False)`），进入分支后再不触碰。**审查人另获一条独立佐证，强于 harness**：能力缺失 **甚至不需要被触发** —— `unchain_adapter.py:8733` 的 `if memory_manager is not None and not graph_memory_v2_admission.is_active:` 把整个 prepare 段挡在 active V2 之外，`memory_commit_allowed` 停留在 `:8731` 的 `False`，而 `:9488` 的 V1 commit 以该标志为条件。**即 active V2 下 V1 commit 是被显式标志跳过，而非撞 AttributeError；两条互不依赖的机制指向同一结果。** **但负向搜索自陈不充分 —— 第三个写入者确实存在**：`memory_factory.py:1948` 的 `vector_adapter.add_texts(session_id=…)`（位于 `_commit_short_term_session_memory_replacement`），公开入口 `replace_short_term_session_memory` 由 `route_memory.py:54` 的 **`POST /memory/session/replace`** 直接调用，**该路由服务端只校验 auth、无任何 V2 admission 判断**；渲染端两个调用者中 `use_chat_stream.js:4066` 的 V1 mirror 腿被 `:4040` 的 `admissionMode !== SHADOW` 挡住（保住 active 场景），**但 `chat_export.js:169` 的 `restoreSessionMemory`（导入会话时）不带任何 admission 判断**。**净效果：宽命题「V2 生效后 V1 向量视图不再有新数据」并非由本条证据成立**，它还需要渲染端门禁事实（不在本条内，系审查人自查），**且该门禁只在渲染端、服务端敞开**。**窄命题「admitted run 装配的运行时对象在能力层面就不可能写 V1 向量」完全成立**，不受这些额外写入者影响 —— 它们不是 run 装配的那个对象。**一处必须剥离**：「退化静默（200 + 空 payload）」**不由本条承载** —— 该 harness 不发任何 HTTP 请求、不观察任何响应体，该半句若要承重须另引它证

### E-0074 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_vector.py:30`（`VECTOR_PROVIDER_ENV`）· `:43-45`（`RRF_K=60` / `LEXICAL_RRF_WEIGHT=2.0` / `VECTOR_RRF_WEIGHT=1.0`）· `:41`（`MAX_INDEX_ENTRIES_PER_CALL=2`）· `:81-87`（`provider != "ollama"` → `unsupported_provider`）· `:88-95`（`model` 缺失 → `model_required`）· `:152-156`（`VectorHit` 三字段）· `:158-164`（`deterministic_chunks(chunk_chars=2000, overlap_chars=200)`）· `:198-205`（`NullVectorBackend.status()` → `"disabled"`）· `:231`（`OllamaQdrantBackend` 亦要求 `provider == "ollama"`）· `:455-480`（RRF 融合）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:488-489`（`backend` 计算 / `vector_status` 字面量）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:344-370`（`_project_vectors`：每次请求对全集重拟合 SVD，取前 5 主成分，返回 `variance`）· `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_embeddings.py:60-63, 108-141`（V1 的 `provider:model:size` 签名与换签名即换集合）
- **取得方式**: 定点读取；`grep -c "store_owner\|memory_v2\|context_v2" route_projection.py` → **0**（独立复跑 E-0007 的负向命题）；`grep -rn "PUPU_MEMORY_V2_VECTOR_PROVIDER" --include="*.py" --include="*.js" --include="*.cjs" --include="*.json" .`（排除 `node_modules` / `__pycache__` / 测试）→ **产品代码仅 `memory_v2_vector.py:30` 其自身常量定义一处**（另一处命中在 `.claude/worktrees/` 下的工作树副本，非产品树）
- **支持/反驳**: **独立复核并支持** E-0007 / E-0009 / S-0008 相关性第 2 点；**新增** 乙(b) 全部连带项与乙(c) 第 3 条（重拟合 SVD → 布局不稳定）的判据
- **完整性限制**: 静态读取。**未实跑任何向量路径**（后端恒为 `NullVectorBackend`，无可跑）。「Ollama 是唯一支持的 provider」是对 `from_environ` 与 `_build_backend` 两处分支的读取，**未穷举是否有绕过 `VectorConfig` 的第二条构造路径**。**跨界**：全部落 `pupu:unchain_runtime/**`，归 `code-owner-runtime`
- **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类
- **验证历史**: S-0045 | 未验证（首次提交）
  - S-0097 | **已验证（自陈限制 (1) 经本关闭合，可去除）** · 承重复核 | 十三处行号引用 **全部精确**，**每一个常量值逐一实测复现，无 E-0056 式的行号/常量错配**（`MAX_INDEX_ENTRIES_PER_CALL=2` · `RRF_K=60` · 两权重 2.0/1.0 · `chunk_chars=2000`/`overlap_chars=200` · `VectorHit` 恰三字段）。`route_projection.py` 的三点（每请求对全集重拟合 SVD / 取前 5 主成分 / 返回 variance）**逐点复现**。**两条负向断言实跑复现且过滤器未失效**：`route_projection.py` 对三关键词 **零命中（exit 1，真零非假象）**；`PUPU_MEMORY_V2_VECTOR_PROVIDER` 施加同一排除后 **产品代码恰 1 处（常量定义自身）**，且 **`.js`/`.cjs`/`.json` 零命中**（渲染端与 Electron 侧无任何代码设置它）。**审查人代其闭合了自陈未穷举项**：`_build_backend` 是 **唯一构造 seam**（`:772` `NullVectorBackend()` / `:776` `OllamaQdrantBackend(...)`），**无第二条路径**；并作一次运行时时效验证 —— 本机两个 env **均未设置**，`VectorConfig.from_environ()` 返回 `enabled=False`，**「后端恒为 `NullVectorBackend`」今日实测成立**

### E-0075 | tool-output | 须查类
- **来源定位**: 实跑于 PuPu `b2385d5d` / unchain `a4e69f4`，同 E-0073 工作目录，2026-08-08
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
- **验证历史**: S-0045 | 未验证（首次提交）
  - S-0072 | **已验证（两处宽表述被推翻）** | 手抄签名与 description **逐字核对通过**（十个 `ToolParameter` 名称/顺序/类型/默认值逐一吻合，含 `kind: str = "markdown"`；docstring 逐字一致；唯一差异是返回标注 `-> dict` vs `-> dict[str, Any]`，**非实质**）。**审查人把本条从「重建」升格为「原件」** —— 其发现 `build_memory_v2_toolkit` 的 `runtime` 参数 **只在 `:503` 作 `is None` 判断**，故可传哨兵 `object()` 构造出 **真实 toolkit**，并 dump 出 **真实 provider JSON**（`openai`/`anthropic`/`gemini`/默认 四条路径）：`memory_upsert` 的 `kind` 均为 `{"type":"string","description":"Argument kind"}`，**无 enum、无 pattern、无默认值**，`required` 仅三项，**字符串 `"enum"` 在三种 toolkit 变体的完整 provider JSON 中零出现** —— **限制 (3) 就此关闭，结论在模型实际收到的 schema 层面确证，不再隔着 provider adapter**。**但两处宽表述被推翻**：**(1) 本条自己的限制 (2) 被证伪** —— `Tool.from_callable` **会解析 `:param name:` 指令**（`unchain:tool.py:266` 取 `parameter_descriptions`，`:282` 仅在缺失时回退 `f"Argument {name}"`），实测三种变体下 **均有 3 个参数带真实描述**，全部来自 `memory_list`；**占位串是 `memory_upsert` 散文 docstring 触发的回退，不是无条件行为**。**(2)「模型压根不知道 `folder` 存在」被直接推翻** —— 在 **全部三种 toolkit 变体** 的模型可见 JSON 中均含 `memory_list.path` → **`"Virtual folder path; never use a host filesystem path."`**，**`folder` 一词确实到达模型，且普通 agent 也看得到**。**仍然成立且仍具材料性的窄事实**：唯一的写入工具 `memory_upsert` 的模型可见面 **不提 `folder`**，`kind` **无 enum、无默认、描述为占位串**。**但「扁平是稳态」的升格因此失去其中一条支柱，是否仍成立须由提出方 `expert-llm` 重排，审查人明确不代判**。**一条本条未提及的新事实**：`memory_upsert` **只对 `curator=True` 暴露**（默认 `curator=False` 时 `:1327` 提前 return，工具只有 6 个且不含它）。**一处措辞瑕疵**：卷内标注「实际输出（节选，逐字）」的代码块内含为对齐而加的多余空格，**内容无出入但并非字面逐字**

### E-0076 | repository | 自证类
- **来源定位**: PuPu `b2385d5d` · `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_toolkit.py:1758-1762`（`memory_upsert` 的模型可见 description 全文）· `:1355-1366`（签名，`kind: str = "markdown"` 在 `:1361`）· `:1367-1372`（被丢弃的 docstring）· `:364-365`（四个合法 kind 的 **唯一** 出现处，在错误分支）· `:459-466`（`Tool.from_callable` 注册，description 由元组显式提供）· `:924-933`（`memory_list` 的 `:param path: Virtual folder path;…` —— 同样不可达模型）· `:1751-1790`（工具名/描述全表，**无 `memory_create_folder`**）
- **取得方式**: `grep -n "    def memory_" memory_v2_toolkit.py`（17 个工具）；`grep -n 'kind: str = "markdown"\|kind must be folder' memory_v2_toolkit.py`；`grep -n "folder" memory_v2_toolkit.py`（**全文 6 处，无一处在模型可见 description 内**）；定点读取上述行段
- **支持/反驳**: **支持** C5 与「额外」节；**与 E-0061 / S-0024 乙 合取** 得出「扁平是稳态」
- **完整性限制**: 只覆盖字面 `folder` 与该文件。**未核实** 是否有别处（system prompt、character 指令、skill）向模型描述过记忆的组织方式 —— 若有，我的预测强度下降。**跨界**：`pupu:unchain_runtime/**`，归 `code-owner-runtime`
- **证据类型判据**: 仓内文件字面内容与可复跑 grep → 自证类
- **验证历史**: S-0045 | 未验证（首次提交）

### 执行约束自陈
- **A-012 遵守：未派生任何子 instance。** 全部 grep / 读取 / 实跑由本 instance 亲自执行。
- **只读。** 两仓零改动；结束时产品目录 `git status --porcelain -- src electron unchain_runtime` 为空（开工时实测已为空，见上）。全部临时产物在系统临时目录，随进程销毁。
- **本条不含任何视觉 / 交互设计主张。** 乙(c) 与 C5 触及「该不该有这个视图 / 树会不会有层级」，**我只陈述信息忠实度与模型写入行为这两个技术事实，不主张任何呈现形态** —— 呈现归方案庭审与 `expert-ux`。
- **模型事实纪律**：本条 **零处** 从记忆陈述模型 / 维度 / 定价 / provider 能力事实。所有 provider 与模型相关主张均引自本仓当前 revision 的代码常量并给出行号。**依 `claude-api` skill 自身的 SKIP 判据**，本任务的 provider grep 命中 `openai` / `ollama`（`unchain_runtime/server/` 下 20+ 文件），故未加载该 skill；**代价是：本条不对任何 Claude 侧模型事实作断言，也不需要。**
  - S-0098 | **未验证** · 承重复核 | 五处行号引用精确（`:1355-1366` 十参数首尾精确 · `:1367-1372` 被丢弃 docstring · `:1758-1762` 元组 description 逐字 · `:459-466` · `:364-365`），`memory_v2_toolkit.py` 工具数 **恰 17** 复现，`create_folder` **零命中** 故「无 `memory_create_folder` 工具」成立。**但两项不实**：**(1) 计数不符** —— 登记 `folder` 全文 6 处，**实测 9 行**（`82/364/365/372/374/375/931/1578/1579`），少登记 3 行且 revision 未变，**属登记时即已存在的计数失实**。**(2) 负向断言被审查人第一手取证直接证伪** —— 其 **不依赖前批 S-0072 的结论**，独立以产品自带 bootstrap 构造 **真实 `Toolkit`** 并 dump 六种组合（curator True/False × openai/anthropic/gemini）的模型可见 JSON，**六种组合全部命中** `memory_v2_toolkit.py:931` 的 `"Virtual folder path; never use a host filesystem path."`；机制在 `unchain:tool.py:266/282` —— **`:param name:` 指令会被解析成模型可见的参数描述，占位串只是缺失时的回退**。其 `来源定位` 把 `:924-933` 标注为「同样不可达模型」**与此直接冲突**：该行是 **9 处 `folder` 中唯一一处、也是全部模型可见 JSON 中唯一一处** 到达模型的 `folder`。**经实跑仍然成立的窄事实**（引自审查人 dump 的原文）：`memory_upsert` 模型可见 description **不含 `folder`**；其 `kind` 为 `{"type":"string","description":"Argument kind"}`，**无 enum、无 pattern、无默认值，`"markdown"` 不出现在模型侧**；`required` 仅三项；四个合法 kind 仅在错误分支枚举。**被证伪、不得再引用的表述**：「`folder` 一词不到达模型」「`memory_list` 的 `:param path:` 不可达模型」「全文 6 处」。**补强只需两步**：计数改 9、把「无一处在模型可见 description 内」改为「**除 `:931` 外** 无一处」。**其「扁平是稳态」的合取推论是否仍成立须由提出方 `expert-llm` 重排，审查人明确不代判**
  - R-0004 | **可采，射程受限**（`ruling.md#R-0004`）| **三问全部通过，但裁定明写本条是本案最接近被排除的一条** —— 同时具备 E-0053 与 E-0056 两种失实形态，且负向断言被 **一具登记方从未使用过的外部器械** 第一手推翻。**放行的决定性一环是问 3：留存项无一出自失实的 `grep -n "folder"`**，全部经审查人独立复跑或复读。**射程之内**：五处行号锚点 · 恰 17 个工具 · `kind` grep 三行 · 「不存在 `memory_create_folder`」· 审查人逐字列出的 **五条窄事实**。**剔除**：(a)「全文 6 处」· (b)「无一处在模型可见 description 内」**及其一切派生形式**（含「模型压根不知道 `folder` 存在」）· (c) `:924-933` 的「同样不可达模型」标注，**该锚点字面内容本身亦不在射程内** · (d) `:1751-1790` 的「全表」区间描述，**但其负向结论不随之剔除** · (e)「四个合法 kind 唯一出现处」的强读法。**不并入**：审查人六项新事实 —— **裁定明示 E-0076 不因此成为该 dump 器械的载体，任何角色不得以「本条已获采纳」为由引用它们**。**自陈限制（未核实 system prompt / character 指令 / skill 是否另向模型描述记忆组织方式）不解除、不削弱**；**分类仍为自证类**
