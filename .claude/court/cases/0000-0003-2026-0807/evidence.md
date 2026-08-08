---
case_id: 0000-0003-2026-0807
updated_at: 2026-08-07T20:15:00-07:00
---

# 证据台账

> **验证状态说明**：本案证据均由提交方以只读检查取得，提交时状态为 **未验证**。本案 **未传唤 `evidence-examiner`**（议案庭审阶段，证据未被用于不可逆 action 的准入判断）。任何具证明力的引用须自行核对；跨案引用 `0000-0001-2026-0807#E-####` 沿用该案的验证状态。

### E-0001 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/memory/index.js:62-72`、`:158-186`、`:350-363`、`:474-478`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/feature_flags.js:53-57`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005（Q2/Q5 落点歧义、优先级倒序）

**内容**

1. `settings > memory` 页 **已经挂载了一个 Inspector 实例**，位于 `:474-478`：

```
<MemoryInspectModal
  open={inspectOpen}
  onClose={() => setInspectOpen(false)}
  mode="long_term"
/>
```

该挂载 **不传 `sessionId`，不传 `chatTitle`**。入口按钮在 `:158-186`（`memory.inspect_long_term` 行），**无任何 flag / admission 门禁**。

2. 同一文件 `:63-72` 读 `readFeatureFlags()` 并订阅变更，`memoryV2Enabled = featureFlags.enable_memory_v2 === true`；`:350-363` 是全仓 settings 侧唯一一处按该值分叉的 Memory V2 文案（把 Context strategy 段替换为 "Legacy Context Memory" 说明）。

3. `feature_flags.js:53-57`：

```
enable_memory_v2: {
  description: "Enable Memory V2 admission and its optional Unchain module. ...",
  defaultValue: false,
},
```

即 **默认关闭**。

**完整性限制**: 未检查 build-time flag 快照（`readBuildFeatureFlagDefaults()` 的来源文件）是否在发布构建里把该值改为 true；未在运行中的应用里实测该 flag 的实际取值。未检查 `settings` SQLite 迁移中间态是否影响 flag 读取。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0002 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:340`、`:381`、`:398-408`、`:542-561`、`:563-582`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005（Q8 的 renderer 侧病灶）

**内容**

`:340` 声明六态：

```
const [status, setStatus] = useState("idle"); // "idle" | "loading" | "ready" | "profiles" | "empty" | "error"
```

`:381` 把响应窄化为点集，`:398-408` 是 **empty 的唯一判据**：

```
const pts = Array.isArray(data?.points) ? data.points : [];
...
if (pts.length === 0) {
  setPoints([]);
  setVariance([0, 0, 0, 0, 0]);
  if (mode === "long_term" && nextProfiles.length > 0) {
    setStatus("profiles");
    setShowProfile(true);
  } else {
    setStatus("empty");
  }
  return;
}
```

即：**只要 `points` 不是一个非空数组，就是 `empty`**。`data` 缺字段、`points` 非数组、后端返回 200-空、后端返回 200 但结构不对 —— 四种情况在 renderer 侧完全同形。

`:542-561` 渲染 empty，文案只有两条（`memory_inspect.no_vectors` / `no_vectors_chat`），二者只按 `mode` 分，**不按原因分**。`:563-582` 的 `profiles` 态复用了 `no_vectors` 同一条文案。

**完整性限制**: 未实测（本机 official store `entries=0`，无法产出"正常态"对照）。未检查 `Scatter` 对畸形点的容错。未检查 12 个 locale 中其余 11 个的 `memory_inspect` 键是否与 `en.json` 同构。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0003 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:358-442`（重点 `:363-372`、`:398-408`、`:424-430`、`:433-441`）
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005（四态设计的硬约束 C4）

**内容**

modal 打开后启动一个 **5 秒静默轮询**：

```
loadProjection({ silent: false });
const refreshTimer = window.setInterval(() => {
  loadProjection({ silent: true });
}, 5000);
```

`silent` 只守住 **两处**：

- `:363-372` 的重置块（`setStatus("loading")` 与清空）
- `:424-430` 的 `catch`（`if (!silent)` 才写 `errorMsg` 与 `status="error"`）

**成功路径不受 `silent` 保护** —— `:398-408` 的 `setStatus("empty")` 与 `:413` 的 `setStatus("ready")` 在静默刷新里照常执行。

由此产生两个可见后果：

1. **无操作降级**：一个已经画出散点的 Inspector，若某次静默刷新拿到 200-空（collection 被丢弃、后端换了 collection tag、或 E-0004 描述的 collection-missing 归一化），会在用户没有任何操作的情况下 **从 `ready` 翻成 `empty`**，散点消失、控制面板消失，且不给任何解释。
2. **失败被吞**：静默刷新失败时 `catch` 整个跳过，屏幕保留上一轮的陈旧点集，无任何降级指示。若首帧成功、之后后端全挂，用户会一直看着一份过期数据。

轮询无退避、无上限，只在 `open` 变化或组件卸载时清除（`:438-441`）。

**完整性限制**: 静态阅读，未在运行中的应用里复现降级。未测量 5 秒轮询在大点集下的开销。未检查 `Modal` 卸载时机（`side_menu.js` 侧 `lazyMountedRef` 保持挂载做退场动画）是否让轮询在关闭后短暂续跑。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0004 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:69-70`、`:171-180`、`:405-452`、`:454-496`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: **部分反驳** `0000-0001-2026-0807#S-0006` 与本庭 `S-0001` 转述的「`/memory/projection` 在**所有**失败路径上都返回 HTTP 200 + 空点集」；支持 S-0005 对 Q8 的修正版病灶描述

**内容**

`GET /memory/projection`（`:405-452`）的真实出口分类：

| 条件 | 出口 | 位置 |
|---|---|---|
| `session_id` 为空 | **400** `{"error": "session_id is required"}` | `:410-411` |
| 未授权 | **401** coded error | `:413-414` | 
| `UNCHAIN_DATA_DIR` 未配置 | **503** `{"error": "UNCHAIN_DATA_DIR not configured"}` | `:420-421` |
| scroll 结果为空 | **200** `{"points": [], "variance": [0.0, 0.0]}` | `:447-448` |
| 异常且被判为 collection-missing | **200** 同上 | `:451-452` |
| 其余任何异常 | **500** `{"error": str(exc)}` | `:453` |

`_empty_projection_payload()`（`:69-70`）对上表最后两栏返回 **同一个字面量**。

所以准确的病灶是 **一条** 失败路径被洗成 200-空成功，而不是全部：**「collection 不存在」与「collection 存在但零点」在线上完全同形**。判据本身是对异常字符串的子串匹配（`:171-180`）：

```
normalized = str(error or "").strip().lower()
if "collection" not in normalized:
    return False
return ("not found" in normalized or "does not exist" in normalized or "doesn't exist" in normalized)
```

这是**字符串启发式**，不是错误码：任何消息里同时含 "collection" 与 "not found" 的无关异常（含部分 Qdrant 配置/连接错误文案）都会被吞成 200-空。反过来，Qdrant 真的挂掉、消息不含这两个词时，会走 **500**，不是 200。

`GET /memory/long-term/projection`（`:454-496`）形状相同，另加：无 `long_term*` collection 时 **200** + 空点集 + profiles（`:479-482`）。这条路径同样把「从未产生过长期记忆」和「collection 被删」合并。

**前案编号引用**: 本条与 `0000-0001-2026-0807#S-0006`、本庭 `S-0001` 「已知事实 1」所载行号（`:69-70`，返回点 393/397/401/448/452）**不一致** —— 本 checkout 的实际返回点为 411/414/421/448/452/453（session）与 460/467/482/490/495/496（long-term）。原陈述可能取自另一修订版；本条以当前 checkout 为准。

**完整性限制**: 未运行 sidecar 实测各分支。未检查 `route_projection.py` 之外是否有中间件改写状态码。未检查 401 的 `root._json_error` 具体载荷形状。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0005 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:453`、`:496`；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1733-1772`、`:3564-3585`；`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:424-430`、`:584-603`；`/Users/red/Desktop/GITRepo/PuPu/src/locales/en.json:187-202`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005（约束 C3：失败文案不得由后端异常串构成）

**内容**

失败文案的完整生成链，四跳：

1. **sidecar**：`route_projection.py:453` / `:496` → `jsonify({"error": str(exc)}), 500`。载荷是 **Python 异常的 `str()`**，未经裁剪、未映射错误码。
2. **main**：`service.js:1733-1772` 的 `readJsonResponse` 在 `!response.ok` 时解析 body，取 `parsed.error`（字符串形态命中 `typeof parsed?.error === "string" && parsed.error.trim()`），**用它整体替换 `message`**，随后 `throw new Error(message)`。由于 `{"error": "<str(exc)>"}` 没有 `error.code` 字段，`errorCode` 为空串，`error.code` 不被设置 —— **错误码在这条链上根本不存在**。JSON 解析失败时退化为 `bodyText.slice(0, 200)`，即把原始响应体前 200 字节当文案。
3. **renderer facade**：`api.unchain.js:1811-1819` 只加 10s 超时包装，不改写消息。
4. **modal**：`:424-430` `setErrorMsg(err?.message || "")`，`:584-603` 直接把 `errorMsg` 渲染成用户可见文本，仅在为空时才回落到 `t("memory_inspect.load_failed")`。

后果：

- 用户在失败态看到的是 **未本地化的后端异常串**（可能含文件系统路径、collection 名、Qdrant 内部消息）。`en.json:187-202` 的 `memory_inspect` 命名空间总共只有 **1 条失败文案键**（`load_failed`），且它只在异常串为空时才会出现。
- `errorMsg` 没有任何按码分支的可能 —— 链上没有码。这直接决定了：**在不改后端错误契约的前提下，renderer 侧做不出"未就绪 vs 失败"的区分**。

**完整性限制**: 未实测异常串的实际内容与是否含敏感路径（未运行 sidecar）。未检查 `_json_error`（401 路径）是否带 code —— 该路径形状与 500 不同。未审计其余 11 个 locale。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0006 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:11`、`:194-225`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:301-302`；`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:237-242`、`:297`、`:771-780`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005；同时以本端自有证据 **确认** `0000-0001-2026-0807#S-0006` 关于「入口是纯同步构建器」与「character chat 反推不出 `ownerChatId`」的两条前提

**内容**

1. **入口无门禁**。`side_menu_context_menu_items.js:194-225`：`node.entity === "chat"` 的两个分支都 **无条件** push 一条 `context_menu.inspect_memory`。不看 admission、不看 feature flag、不看该 chat 是否有记忆。今天每一个会话右键都有这一项，点了一律打开 V1 Qdrant projection。

2. **构建器是纯同步函数**，返回一个 items 数组，每项的 `onClick` 是同步闭包（`onClick: () => onInspectMemory && onInspectMemory(...)`）。要在这一层判 admission，只能把 IPC 往返塞进右键关键路径或预取全树 —— 与 `0000-0001-2026-0807#S-0006` 的判断一致。

3. **character chat 分支丢 `ownerChatId`**（`:198-206`）：

```
const memorySessionId = buildCharacterMemorySessionId(
  chat?.characterId,
  chat?.threadId || "main",
);
... onInspectMemory(memorySessionId, chatTitle)
```

而普通 chat 分支（`:218-223`）传的是 `node.chatId` 本身。

`chat_storage_sanitize.js:301-302`：

```
export const buildCharacterMemorySessionId = (characterId, threadId = "main") =>
  `character_${sanitizeCharacterSessionKeyComponent(characterId, "character")}__dm__${sanitizeCharacterSessionKeyComponent(threadId, "main")}`;
```

派生自 `characterId` + `threadId`，且经 `sanitize` **有损**。`chatId` 不在其中，因此 **不可反推**。

4. **挂载接口确实只有四个字段**：`side_menu.js:771-780` 传 `open / sessionId / chatTitle / onClose`；`:237-242` 的 state 形状为 `{open, sessionId, chatTitle}`；`:297` 的 setter 同形。modal 侧签名 `memory_inspect_modal.js:326-332` 为 `{open, onClose, sessionId, chatTitle, mode}`。**没有 `ownerChatId`。**

**完整性限制**: 未检查 `isCharacterChatNode` 的判定是否与 chat store 中的实际 character chat 集合一致。未穷举 `onInspectMemory` 的其他调用方（grep 显示仅 side-menu 一处）。未实测右键菜单在大树下的构建耗时。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0007 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:1728-1745`、`:238-258`；`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:1057-1067`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005（约束 C5）；**闭合** 本庭 `S-0001` 「已知缺口 3」中「`get_session_head` 在 `session_id` 为空时的行为未实测」的 **静态半边**

**内容**

`memory_v2_store.py:1728-1737`：

```
def get_session_head(self, *, owner_chat_id: str, session_id: str) -> dict[str, Any]:
    owner = _required_identifier(owner_chat_id, "owner_chat_id", owner=True)
    session = _required_identifier(session_id, "session_id")
```

`_required_identifier`（`:238-258`）对非字符串抛 `context_v2_invalid_request` / 400；对不匹配 `_ID_RE` 的（含空串）同样抛 `context_v2_invalid_request` / 400。

因此：**`session_id` 为空时 `get_session_head` 抛 400，不返回任何可用于分流的答案。** 路由层 `route_memory_v2.py:1057-1067` 直接把 query 参数原样透传（`request.args.get("session_id", "")`），不补默认值。

结论：**Q5 的分流不能用「只传 `ownerChatId`、留空 `sessionId`」的方式向 `getSessionHead` 问 chat 级 admission。**

同一文件另存在一个 **只需 `owner_chat_id`** 的读方法 `get_chat_admission`（`:1714-1726`），返回 live admission 或 `None`，不创建状态。`route_memory_v2.py` 中 **没有** 对应的 HTTP 路由（该文件的路由清单里无 `admission` 端点），因此 renderer 今天够不到它。`route_memory_v2.py:113` 另有只读探针 `_context_v2_chat_state_exists_read_only(owner_chat_id=...)`，同样只在模块内部被调用（`:237`、`:292`），未暴露为端点。

**完整性限制**: 未运行 sidecar 实测（框定所要求的"实测"半边仍缺）。未检查 `_ID_RE` / `_OWNER_ID_RE` 的具体字符集是否会拒绝某些合法 chatId。未检查 unchain 侧 `memory_v2_unchain_generation_api` 的 `get_session_head` 是否有不同的空值行为 —— 见 E-0008，该实现按 store owner 分流。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0008 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:214-307`、`:982-1007`、`:1057-1067`；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:150`、`:170`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-51`、`:59-75`
- **取得方式**: 当前 checkout 只读检查（分支 `dev`）
- **提交发言**: S-0005
- **支持/反驳**: **修正** 本庭 `S-0001` 「已知事实 2」把 `GET /context/v2/session/head` 描述为「三路判别」；支持 S-0005 的约束 C2

**内容**

**一、判据出口远多于三条，且随 `store_owner` 变形。** `_generation_operation_for_store_owner`（`:214-307`）是 `session/head` 的唯一入口：

| `store_owner` | `get_session_head` 的可能出口 |
|---|---|
| `pupu_legacy`（模块默认） | 直接调 `_runtime()`，只有 **200** 或 **404 `context_v2_not_found`**（见 E-0007 的 store 实现）；**没有 503 `context_v2_mutation_not_ready` 分支** |
| `off` | **503 `context_v2_store_disabled`**（durable state 仍存在）或 **404 `context_v2_not_found`**；**永远拿不到 200** |
| `unchain` | 200 / **404** / **503 `context_v2_mutation_not_ready`**（`:284-297`），另有 `context_v2_unavailable`(503)、`context_v2_unchain_generation_unavailable`(503)、以及 API 原生码透传 |
| 其他 | **503 `context_v2_store_owner_invalid`** |
| 边界不可判定 | **503**，码来自 `ContextV2StoreBoundaryError`（含 `context_v2_store_schema_incompatible`） |

叠加 E-0007 的 **400 `context_v2_invalid_request`**，renderer 需要面对的码至少 **8 个**，其中只有一个（404）能安全解读为「这个 chat 不是 V2」。

**二、`store_owner` 由 rollout 模式派生，而不是独立配置。** `memory_v2_rollout.js:150`：

```
const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";
```

`:170` 把它写进 sidecar 环境。结合 E-0001（`enable_memory_v2` 默认 false → feature ceiling `off` → `resolvedRolloutMode === "off"`），**默认构建下 `store_owner === "off"`**，即 `session/head` **永远返回 404 或 503，从不返回 200**，且框定所说的「第三态 503 未就绪」在默认构建里 **是 `context_v2_store_disabled` 而不是 `context_v2_mutation_not_ready`**。

**三、`/context/v2/status`（`:982-1007`）不返回任何 counts**，但确实返回一个四值健康量：

```
"vector_status": vector_status,   # "disabled" | "warming" | "ready" | "degraded"
```

以及 `available` / `schema_version` / `journal_mode` / `lexical_backend` / rollout 与 capability 字段。也就是说：**`getStatus()` 能回答「后端处于什么健康态」，但不能回答「这个 chat 有没有东西可看」**。Inspector 今天对该端点 **零消费**。

**四、renderer bridge 是全有全无。** `context_v2_bridge.js:32-51` 列 18 个 `REQUIRED_METHODS`，`:59-67` 的 `resolveApi()` 只要缺任意一个就返回 `null`，`:69-75` 随即以 `context_v2_unavailable` 拒绝。因此还存在一个 **与后端无关的第 9 类失败**：preload 面不完整。

**完整性限制**: 未运行 sidecar 实测任何一条分支。未核实发布构建的 build-time flag 快照是否把 `enable_memory_v2` 置真（若置真，第二点的结论翻转）。未检查 `memory_v2_unchain_generation_api` 内部还会抛哪些码。未检查 `vector_status` 各值的产生条件。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0009 | command
- **来源定位**: 仓库根 `/Users/red/Desktop/GITRepo/PuPu`，两条只读 grep；佐证文件 `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/memory_vault_bridge.js:1-26`、`:33-61`、`:114-126`，`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/local_storage/components/mcp_toolkits_section.js:124-181`、`:301-306`，`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/settings_modal_content.js:19-38`
- **取得方式**: 当前 checkout 只读命令

命令一：
```
grep -rn "memoryVaultBridge\." src/ --include="*.js" | grep -v "SERVICEs/bridges/" | grep -v "\.test\.js"
```
输出（全部，2 行）：
```
src/PAGEs/chat/hooks/use_secret_capture_gate.js:369:          await memoryVaultBridge.deleteSecret({
src/PAGEs/chat/hooks/use_secret_capture_gate.js:386:        result = await memoryVaultBridge.deposit({
```

命令二：
```
grep -rln "memory_vault_bridge" src/COMPONENTs/
```
输出：空（无匹配）。

- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 对 Q4-B 的承接表态与落点建议

**内容**

1. **vault 控制面在 UI 上是零消费**。bridge 暴露 6 个方法（`memory_vault_bridge.js:114-126`：`deposit / listDescriptors / deleteSecret / grant / revoke / getStatus`），全仓 **只有 2 个调用点**，都在 `src/PAGEs/chat/hooks/use_secret_capture_gate.js`（chat 输入路径），且只用了 `deposit` 与 `deleteSecret`。**`listDescriptors` / `grant` / `revoke` / `getStatus` 一个消费者都没有。** `src/COMPONENTs/**` 整体对该 bridge 零引用 —— 即 **任何 settings / 任何用户可见面today 都不显示已捕获的凭据**。

2. **枚举面被契约性地限死**。`memory_vault_bridge.js:12-14` 写明：

> `listDescriptors({ scopeKind, scopeId })` — BOTH required; there is no unscoped listing, so the renderer can never enumerate the whole vault.

`:50-51` 把 UI 可选 scope 限死为 `["chat", "user"]`，user scope 的 id 是固定量 `"pupu.user"`。因此一个"看全部已存凭据"的界面在当前契约下 **做不出来** —— renderer 只能逐个 chat 问，或只列 user scope 那一格。

3. **settings 侧已有同形态的凭据管理先例**。`mcp_toolkits_section.js`（挂在 `settings > local_storage` 页下，见 `settings_modal_content.js:19-38` 的页面注册表）已经实现：`secretStatus` 逐项的 `configured` 布尔（`:142-155`）、`local_storage.mcp_secrets_missing` / `mcp_secrets_configured` 徽章（`:175-181`）、`local_storage.mcp_update_secrets` 动作按钮（`:301-306`）。形态是 **只显示"配没配"，从不显示值**，与 vault 的 no-read 安全签署条件（`memory_vault_bridge.js:6-9`）同构。

4. settings 的页面注册表里 **没有 privacy / security 页**；现存 8 页为 appearance / model_providers / runtime / memory / token_usage / app_update / local_storage / dev。

**完整性限制**: 未检查 electron preload 与 main 侧 `memoryVaultAPI` 是否已完整实现这 6 个方法（属 `code-owner-electron` 边界）。未检查是否存在通过 `window.memoryVaultAPI` 直接调用而绕过 bridge 的代码（铁律禁止，但未穷举）。未检查 `use_secret_capture_gate.js` 里"按普通消息发送"的决定是否已有任何持久化。未评估密钥存储方式与撤销语义 —— 那归 `expert-security`。

- **验证历史**:
  - S-0005 | 未验证 | 提交时状态

### E-0010 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:241`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:816-823`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:872-878`
- **取得方式**: 当前 checkout 只读检查（`dev` 分支工作树）
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-A / Q4-D）
- **完整性限制**: 只检查了 `src/`；未运行应用实测；未检查 `streamError` 是否有 `chat.js` 之外的第二个 provider。

**主张**：`streamError` 是**整个应用唯一的一个全局槽位**，不按 chat 分键；且写入被"当前活跃 chat"闸门拦截。

三处原文：

`chat.js:241` —— 唯一的状态源，一个字符串，无 chatId 维度：
```js
const [streamError, setStreamError] = useState("");
```

`use_chat_stream.js:816-823` —— hook 侧只是受控/非受控二选一，仍是单值：
```js
const [internalStreamError, setInternalStreamError] = useState("");
const streamError =
  controlledStreamError !== undefined
    ? controlledStreamError
    : internalStreamError;
const setStreamError =
  typeof controlledSetStreamError === "function"
    ? controlledSetStreamError
    : setInternalStreamError;
```

`use_chat_stream.js:872-878` —— 写入闸门：
```js
const setStreamErrorForChat = useCallback(
  (targetChatId, nextError) => {
    if (targetChatId && activeChatIdRef.current === targetChatId) {
      setStreamError(nextError);
    }
  },
  [activeChatIdRef, setStreamError],
);
```

**推论（本证据直接支持）**：当 fail-closed 结果在会话 A 产生、而用户此刻已切到会话 B 时，`activeChatIdRef.current !== targetChatId`，`setStreamError` **根本不被调用** —— 该文案不是"被覆盖"，是从未进入过任何状态。没有任何旁路把它存起来待返回 A 时重放（见 E-0011）。

### E-0011 | command
- **来源定位**: 仓库根 `/Users/red/Desktop/GITRepo/PuPu`，对 `src/` 的穷举检索；命中点 `src/PAGEs/chat/hooks/use_chat_session_state.js:440`、`src/PAGEs/chat/hooks/use_chat_stream.js:4807`、`src/PAGEs/chat/hooks/use_chat_stream.js:4991`、`src/PAGEs/chat/hooks/use_chat_attachments.js:448`
- **取得方式**: 当前 checkout 只读命令
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（了结议题框定「已知缺口 2」）
- **完整性限制**: 只穷举了 `setStreamError` / `setStreamErrorForChat` 两个标识符的直接调用；未追踪把 setter 作为值传出后在别处调用的间接路径（`setStreamErrorForChat` 出现在多个 `useCallback` 依赖数组中，但均为依赖声明而非调用）。未做运行时实测。

**命令与输出摘要**

1) 全部写入点：
```
grep -rn "setStreamErrorForChat" src/     → 92 处（含依赖数组）
grep -rn "setStreamError(" src/ | grep -v "setStreamErrorForChat"  → 24 处
```

2) 清除点（第二参数为 `""` / `null` / `undefined`），多行感知匹配，结果**穷举**：

经 `setStreamErrorForChat`，全仓仅 **2** 处：
- `use_chat_stream.js:4807` —— `setStreamErrorForChat(targetChatId, "");`（run 启动路径，紧邻 `streamingChatIdsRef.current.add(targetChatId)`）
- `use_chat_stream.js:4991` —— `setStreamErrorForChat(targetChatId, "");`（即时消息落库路径，紧邻 `removeTurnMutation(turnMutationOperationId)`）

经 `setStreamError` 直呼：
- **`use_chat_session_state.js:440` —— `setStreamError("");`，位于切换会话的提交序列中，紧跟 `setActiveChatId(nextActiveId);`，无条件执行**：
```js
setActiveChatId(nextActiveId);
setStreamError("");
```
- `use_chat_attachments.js:448` —— `setStreamError("")`（附件校验通过路径）

**结论（了结「streamError 清除点未穷举」）**：清除点共 4 个。其中 `use_chat_session_state.js:440` 是决定性的 —— **每一次会话切换都无条件清空 `streamError`，且没有任何回写/回放机制**（`streamError` 无 per-chat 存储，见 E-0010）。因此"提示会被下一次发送冲掉"这一先前未核实的说法**成立但过弱**：真实行为是**切走即消失**，比"下一次发送"早得多，且回到原会话不会恢复。

### E-0012 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:97-110`（文案表）、`:170-249`（`decideTurnMutationMemoryMode`）、`:390-434`（码表与 `contextV2TurnMutationMessage`）；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:3902-3931`（`resolveTurnMutationMemoryPlan`）
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-A 的信息坍缩；Q8 的"开 Inspector 之前已有区分信息"）
- **完整性限制**: 未实测 sidecar 实际返回的 head 形状；`head.readOnlyDegraded` 按源码注释属"今天不在 head 形状里"的防御性检查，其可达性未核实。

**一、chat-core 手里的结构化就绪信号（Q8）**

`use_chat_stream.js:3902-3931` 在每次 turn mutation 前读一次 head：
```js
head = await contextV2Bridge.getSessionHead({ ownerChatId, sessionId });
```
`decideTurnMutationMemoryMode`（`:170-249`）消费的 head 字段共 10 个：`ownerChatId`、`sessionId`、`readOnlyDegraded`、`sticky`、`v2Bootstrapped`、`sessionExists`、`bootstrapStatus`、`admissionMode`、`targetMode`、`currentGenerationId`、`sessionRevision`（另读 `bootstrapErrorCode`、`mutationReady`）。这足以机械区分「V2 健康且已建 session」（`bootstrapStatus === "complete" && v2Bootstrapped && sessionExists`）与「unavailable / partial」（bridge 不可用、head 报错、`bootstrapStatus` 非 complete）。

**二、16 个 blocked 分支（**更正议案框定的「13」**）**

`decideTurnMutationMemoryMode` 的 `blocked(...)` 返回点逐条计数：
`bridge_unavailable`、`head_failed`、`head_missing`、`head_identity_mismatch`、`read_only_degraded`、`ambiguous_admission`、`bootstrap_pending`、`bootstrap_failed`、`bootstrap_unknown`、`not_bootstrapped`、`session_missing`、`admission_unknown`、`target_mode_unknown`、`mutation_not_ready`、`generation_missing`、`revision_invalid` —— **共 16 个，不是 13 个**。（框定中的「13」疑似来自码表某个子集。）

**三、坍缩比（**更正议案框定的「折成 5 条」**）**

`:390-411` 两个码表：
- `RUNTIME_UNAVAILABLE_CODES` = 4 项，其中与上述 16 个 blocked 原因相交的**只有 `bridge_unavailable` 1 个**
- `NOT_READY_CODES` = 15 项，恰好覆盖其余 **全部 15 个** blocked 原因

`contextV2TurnMutationMessage`（`:419-434`）据此映射。因此：
**16 个 admission blocked 原因 → 用户只可能看到 2 条字符串**（1 → `UNAVAILABLE`，15 → `NOT_READY`）。
"5 条文案"是该函数在 **admission 原因 + rebase 错误码** 全域上的值域，不是 blocked 态的值域。blocked 态的实际分辨率是 **16:2**。

**四、文案表本身（`:97-110`）** —— 7 条固定字面量，且 `:93-96` 的注释把"固定字面量"定性为**安全约束**而非风格：
> Every user-visible string here is a fixed literal. A turn-mutation failure must never surface a server message, an error path, a payload excerpt or any conversation content — the sidecar's errors can carry request detail and the renderer is the last place that can stop it.

### E-0013 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:1446-1454`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/turn_mutation_outbox.js:1`、`:175`、`:346-373`
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-D 跨会话静默丢失的**根因定性**）
- **完整性限制**: 未实测 localStorage 在打包应用中的持久化行为（Electron 渲染进程 localStorage 默认落盘，但未在本次取证中实测）；未核实 outbox row 的自动清理时机。

**一、blocked 判定的数据源是磁盘，不是内存**

`use_chat_stream.js:1446-1454`：
```js
const turnMutationOutboxSnapshot = readTurnMutationOutboxState();
const isTurnMutationBlocked = Boolean(
  chatId &&
    (!turnMutationOutboxSnapshot.available ||
      turnMutationByChatIdRef.current.has(chatId) ||
      runPreflightGenerationByChatIdRef.current.has(chatId) ||
      turnMutationOutboxSnapshot.entries.some(
        (entry) => entry.chatId === chatId,
      )),
);
```

`turn_mutation_outbox.js:1`：
```js
const STORAGE_KEY = "pupu.turn_mutation_outbox.v1";
```
`:175` 解析出的 storage 为 `window.localStorage`；`:346-373` 的 `readTurnMutationOutboxState` 从该 key 读 JSON 数组。

**二、由此得到的不对称（本证据的要点）**

| | 载体 | 会话切换后 | 应用重启后 |
|---|---|---|---|
| **禁用态** `isTurnMutationBlocked` | `localStorage["pupu.turn_mutation_outbox.v1"]` | **存活** | **存活** |
| **解释文案** `streamError` | `useState("")` 单槽（E-0010） | **被清空**（E-0011，`use_chat_session_state.js:440`） | 不存在 |

**结论**：「跨会话静默丢失」不是一个渲染时序 bug，而是**两种生命周期的结构性不匹配** —— 锁是持久的，解释是易失的。任何把解释重新塞回 `streamError` 槽位的修法都会重现同一结果。同时注意 `!turnMutationOutboxSnapshot.available` 这一支：localStorage 一旦不可用（读失败/解析失败均返回 `available:false`，见 `:351/:361/:365/:373`），**所有 chat 一律 blocked**，且同样无任何文案。

### E-0014 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:721-726`、`:728-744`、`:747-794`、`:798-803`、`:1128-1136`、`:888`
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-A 落点错位 / Q4-D 零解释）
- **完整性限制**: 只检查了 `chat.js` 内的消费点；未穷举 `ChatMessages` 内部对 `disableActionButtons` 的进一步分发。

**`isTurnMutationBlocked` 的三个消费点，全部是"禁用"，没有一个是"说明"**

1. `chat.js:721-726` —— 禁换模型：
```js
const isModelSelectionDisabled =
  stream.isStreaming ||
  session.isCharacterChat ||
  stream.isSecretCapturePending ||
  stream.isDurableInteractionBlocked ||
  stream.isTurnMutationBlocked;
```
（`:728-744` 的 `onSelectModel` 再做一次早退。）

2. `chat.js:798-803` —— 禁发送：
```js
const isSendDisabled =
  stream.isDurableInteractionBlocked ||
  stream.isTurnMutationBlocked ||
  stream.isSecretCapturePending ||
  (!unchainStatus.ready && !stream.isStreaming) ||
  !hasSelectedModel;
```

3. `chat.js:1128-1136` —— 禁全部消息操作按钮：
```js
disableActionButtons={
  stream.isDurableInteractionBlocked ||
  stream.isTurnMutationBlocked
}
```

**`effectiveDisclaimer`（`:747-794`）的分支穷举**，按顺序：
`durableInteractionStatus === "awaiting" | "awaiting_response"` → `durableInteractionStatus === "checking"` → `"resuming" | "receipt_recorded"` → `"retry_wait"` → `"resume_failed"` → `stream.streamError` → `stream.isStreaming` → `!unchainStatus.ready` → `!hasSelectedModel` → `attachmentsDisabledReason` → `DEFAULT_DISCLAIMER`。

**其 deps 数组（`:787-794`）**为 `[hasSelectedModel, attachmentsDisabledReason, unchainStatus, stream.durableInteractionStatus, stream.isStreaming, stream.streamError]` —— **`stream.isTurnMutationBlocked` 既不在分支里，也不在依赖里**。

**落点**：`chat.js:888` 把它作为 `disclaimer` 传给输入框：
```js
disclaimer: effectiveDisclaimer,
```
即"记忆 fail-closed"、"正在流式"、"没选模型"、"附件不可用"、"Unchain 连接中" **共用同一个单行槽位**；而 blocked 态在该槽位**没有任何分支**，落到 `DEFAULT_DISCLAIMER`。

**结论**：处于 blocked 态的会话，用户看到的是「发送禁用 + 全部消息按钮灰掉 + 模型不可换 + 一句与此无关的默认免责声明」。这与 E-0011 合并后即为议案框定所述的"零解释会话"，且**不需要跨会话**就已成立 —— 只要 `streamError` 被任何一次清除点清掉（含切走再回来），当场就是零解释。

### E-0015 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:107-108`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:12856-12878`
- **取得方式**: 当前 checkout 只读检查 + 全仓标识符检索
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-A 中 `CONFLICT_MANUAL` 一项）
- **完整性限制**: 未追踪 outbox row 是否被其它路径（如 TTL、`MAX_ENTRIES=32` 挤出）最终清理；因此"永久锁死"应读作"该分支自身不提供出路"，而非已证实永不解锁。

**一、`CONFLICT_MANUAL` 常量是死代码**

定义（`context_v2_turn_mutation.js:107-108`）：
```js
CONFLICT_MANUAL:
  "This message change conflicted with newer conversation state and needs manual review before it can be discarded.",
```

全仓引用计数（含测试）：
```
MESSAGES.UNAVAILABLE      4        MESSAGES.CONFLICT       2
MESSAGES.NOT_READY        3        MESSAGES.CONFLICT_MANUAL 0   ← 零
MESSAGES.IN_PROGRESS      2        MESSAGES.PERSIST        6
MESSAGES.FAILED           6
```
`CONFLICT_MANUAL` **零引用**，含测试。它既不被 `contextV2TurnMutationMessage` 返回，也不被任何调用方读取。

**二、用户真正看到的是一条内联重复字面量**

`use_chat_stream.js:12856-12878`，terminal 结果的两分支：
```js
if (isTerminalTurnMutationResult(memoryResult)) {
  const latestMessages = storageApi.getChatMessages?.(targetChatId) || [];
  if (
    fingerprintTurnMutationMessages(latestMessages) ===
    entry.originalFingerprint
  ) {
    removeTurnMutation(entry.operationId);
    turnMutationRecoveryAttemptsRef.current.delete(entry.operationId);
    releaseTurnMutation(owner);
    setStreamErrorForChat(
      targetChatId,
      "The conversation changed before this message operation could be applied. Please try it again.",
    );
  } else {
    setStreamErrorForChat(
      targetChatId,
      "This message operation conflicted with newer conversation state and needs manual review before it can be discarded.",
    );
  }
  return;
}
```

**三、两处不对称（本证据的要点）**

1. **文案来源不对称**：安全约束（E-0012 第四节）要求文案是集中管理的固定字面量，但这两条是**手写内联串**，与 `CONFLICT_MANUAL` 只是文字近似（`message change` vs `message operation`），常量与实际渲染值已经漂移。
2. **出路不对称**：指纹**相同**的分支调用 `removeTurnMutation` + `releaseTurnMutation` —— **解锁**；指纹**不同**（即"需要 manual review"）的分支**既不 remove 也不 release，只写一句文案**。而该文案本身是易失的（E-0011），锁却是持久的（E-0013）。因此这一支的实际用户体验是：一次瞬时的、承诺了某个 manual review 入口的提示，然后是一个永久禁用、零解释的会话。

**四、被承诺的入口不存在**

全仓检索 `manual review` / `manual_review` / `MANUAL_REVIEW`（`src/` 与 `unchain_runtime/`）：仅命中上述两处字符串本身，**无任何 UI、路由、bridge 方法或后端端点**与之对应。

### E-0016 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:48-51`、`:237-242`、`:296-299`、`:433`、`:769-782`
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q2/Q5 挂载接口现状与下游破坏面）
- **完整性限制**: 未检查 `MemoryInspectModal` 内部（属 `code-owner-settings`）对这四个 prop 的使用方式。

**挂载接口现状 —— 确认为 `{open, sessionId, chatTitle, onClose}` 四项，无 `ownerChatId`**

`side_menu.js:769-782`：
```jsx
{lazyMountedRef.current.memory && (
  <MemoryInspectModal
    open={memoryInspect.open}
    sessionId={memoryInspect.sessionId}
    chatTitle={memoryInspect.chatTitle}
    onClose={() =>
      setMemoryInspect({ open: false, sessionId: null, chatTitle: "" })
    }
  />
)}
```

支撑该挂载的三处：
- `:48-51` —— `const MemoryInspectModal = lazy(() => ... m.MemoryInspectModal)`，懒加载
- `:237-242` —— `const [memoryInspect, setMemoryInspect] = useState({...})`；`if (memoryInspect.open) lazyMountedRef.current.memory = true;`
- `:296-299` —— 唯一的 setter：
```js
const handleInspectMemory = useCallback((sessionId, chatTitle) => {
  setMemoryInspect({ open: true, sessionId, chatTitle: chatTitle || "" });
  setContextMenu((c) => ({ ...c, visible: false }));
}, []);
```
- `:433` —— 唯一的传递点：`onInspectMemory: handleInspectMemory,`（传入 `buildSideMenuContextMenuItems` 的参数对象）

**下游破坏面评估**

- `MemoryInspectModal` 只有 **1 个挂载点**（`:772`）。
- `handleInspectMemory` 只有 **1 个消费者**（`:433` → context menu items）。
- `memoryInspect` state 只有 **2 个写点**（`:297` 打开，`:777-779` 关闭）。

因此为挂载接口新增 `ownerChatId` 是**纯加法**，破坏面为零：新增 prop 不影响现有四项，未传时为 `undefined`。
**但** `onInspectMemory(sessionId, chatTitle)` 是**位置参数**签名 —— 追加第三个位置参数会让这条本已跨 owner 的接缝继续按位置生长。此为接口形态问题，不是破坏面问题。

### E-0017 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:24-25`、`:194-229`
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q2/Q5 —— `ownerChatId` 在两个分支各自的取值来源）
- **完整性限制**: 未核实 `chat.characterId` / `chat.threadId` 的写入点与非空保证（属 `code-owner-shared-arteries` 的 chat store）。

**两个分支，两种 `sessionId` 语义**

判定函数（`:24-25`）：
```js
const isCharacterChatNode = (chatId) =>
  chatStore?.chatsById?.[chatId]?.kind === "character";
```

**分支 A —— character chat（`:197-215`）**：
```js
if (isCharacterChatNode(node.chatId)) {
  const memorySessionId = buildCharacterMemorySessionId(
    chat?.characterId,
    chat?.threadId || "main",
  );
  return [
    {
      icon: "brain",
      label: t("context_menu.inspect_memory"),
      onClick: () =>
        onInspectMemory && onInspectMemory(memorySessionId, chatTitle),
    },
    ...
```
→ 传出的是**派生 session id**。`node.chatId` 在此处**存在于作用域内但被丢弃**，不进入回调。

**分支 B —— 普通 chat（`:217-229`）**：
```js
return [
  {
    icon: "brain",
    label: t("context_menu.inspect_memory"),
    onClick: () =>
      onInspectMemory && onInspectMemory(node.chatId, chatTitle),
  },
  ...
```
→ 传出的**就是 UI chat id 本身**。

**因此 `ownerChatId` 的取值来源（回答本庭的定向提问）**

| 分支 | 今天传出的 `sessionId` | 需要的 `ownerChatId` | 取值来源 |
|---|---|---|---|
| 普通 chat | `node.chatId` | `node.chatId` | **与 `sessionId` 同值**，恒等，无需新数据 |
| character chat | `buildCharacterMemorySessionId(chat.characterId, chat.threadId \|\| "main")` | `node.chatId` | **已在同一作用域内**（`:197` 的 `node.chatId`），今天被丢弃 |

关键事实：**两个分支所需的 `ownerChatId` 在调用点上都是现成的**，扩展挂载接口不需要任何新的数据获取、新的存储读或新的 bridge 调用 —— 只是把一个已在手的值停止丢弃。

### E-0018 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:289-302`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage.js:38`
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（举证责任在本端的「modal 反推不出 ownerChatId」）
- **完整性限制**: 未穷举 `characterId` / `threadId` 的实际取值域，因此"碰撞可能"是对函数值域的结构性论断，不是对当前用户数据的实测。

**唯一定义（`chat_storage_sanitize.js:289-302`）**，`chat_storage.js:38` 只是 re-export（`export { buildCharacterMemorySessionId } from "./chat_storage/chat_storage_sanitize";`）：

```js
export const sanitizeCharacterSessionKeyComponent = (
  value,
  fallback = "default",
) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

export const buildCharacterMemorySessionId = (characterId, threadId = "main") =>
  `character_${sanitizeCharacterSessionKeyComponent(characterId, "character")}__dm__${sanitizeCharacterSessionKeyComponent(threadId, "main")}`;
```

**核实结论 —— 「不可逆」成立，但正确的理由比"难以反解"强得多**

1. **`chatId` 根本不是这个函数的输入。** 形参只有 `characterId` 与 `threadId`。产物字符串里**不含 chat id 的任何编码**。因此这不是"逆函数难求"，而是**信息从未被写入**：任何纯字符串处理都不可能恢复 `ownerChatId`。这是决定性的一条。

2. **即便退一步只谈 `characterId`，该函数也不是单射的**，四步归一化各自丢信息：
   - `.toLowerCase()` —— `Char-A` 与 `char-a` 同像
   - `.replace(/[^a-z0-9]+/g, "_")` —— `a-1`、`a_1`、`a 1`、`a...1` 全部 → `a_1`
   - `.replace(/^_+|_+$/g, "")` —— `_a_` 与 `a` 同像
   - `|| fallback` —— 任何归一化后为空的输入（如 `"---"`、`""`、`null`、`undefined`）一律 → `"character"` / `"main"`
   另有分隔符歧义：分隔串是 `__dm__`，而归一化产物本身可以包含 `_`，故 `characterId="x__dm__y"` 与 `characterId="x", threadId=...` 可产生同形串。

3. **唯一的替代反推路径是全表扫描，且不可靠**：modal 需要 (a) 越界拿到 `chatStore.chatsById`（属 `code-owner-shared-arteries`），(b) 复制同一个 sanitizer 重算每个 character chat 的 session id 做匹配，(c) 在第 2 点的碰撞下仍可能得到多于一个候选，无法判定。

**据此**：`0000-0001-2026-0807#S-0006` 中「modal 反推不出 `ownerChatId`」的论断**成立**，且应以「该值从未进入派生结果」为理由入卷，而非以「派生函数难以反解」为理由。

### E-0019 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_secret_capture_gate.js:118-125`、`:449-489`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/secret_capture_modal.js:286`、`:302`、`:315`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:1044-1094`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:724`、`:801`、`:895`、`:901`
- **取得方式**: 当前 checkout 只读检查 + 全仓标识符检索
- **提交发言**: S-0006
- **支持/反驳**: 支持 S-0006（Q4-B：唯一消费链路 + 「按普通消息发送」是否被记住）
- **完整性限制**: 未追踪凭据 store 之后在 runtime / MCP secrets 侧的生命周期（属 `code-owner-runtime`）；未实测扫描器误报率。

**一、唯一消费链路（全仓穷举 `useSecretCaptureGate` / `evaluateSecretGate` / `isSecretCapturePending`）**

```
use_chat_stream.js:1052   const {...} = useSecretCaptureGate({ activeChatId: chatId });
use_chat_stream.js:1064   const decision = await evaluateSecretGate({ ... });
use_chat_stream.js:1088   setStreamErrorForChat(targetChatId, decision.message);   ← 失败路径复用同一个易失槽位（见 E-0010/E-0011）
secret_capture_modal.js   三个终结按钮，全部在 src/PAGEs/chat/ 内：
    :286  "Send as plain text"        → confirmPlain
    :302  "Cancel"                    → cancelGate
    :315  "Store securely and send"   → confirmStore
```
`isSecretCapturePending` 的全部消费点在 `chat.js`：`:724`（禁换模型）、`:801`（禁发送）、`:895`（禁附件）、`:901`（禁工具选择）。
**即：gate 在 chat 面上只有"采集时刻的一次性闸门"这一种存在形式，没有任何列表、撤销、重命名或查看已存凭据的路径。**

**二、「按普通消息发送」今天不被记住 —— 零持久化**

`use_secret_capture_gate.js:459-476`（`confirmPlain` 全文）：
```js
const confirmPlain = useCallback(() => {
  const pending = pendingRef.current;
  if (!pending || pending.settled || pending.inFlight) return;
  const plain = applySecretPlainRanges(pending.text, pending.candidates);
  if (typeof plain !== "string" || !plain) {
    failGate("secret_capture_ambiguous");
    return;
  }
  const token = mintToken(
    SECRET_GATE_TOKEN_KINDS.PLAIN,
    pending.chatId,
    plain,
  );
  settle({
    status: SECRET_GATE_DECISIONS.PLAIN,
    text: plain,
    token,
    disposition: PLAIN_USER_APPROVED_DISPOSITION,
  });
}, [failGate, mintToken, settle]);
```
无写入、无记录、无豁免登记。

全文件持久化检索：`localStorage` **0 命中**、`sessionStorage` **0 命中**。全部状态在三个 ref 上（`:123-125`）：
```js
const pendingRef = useRef(null);
const tokensRef = useRef(new Map());
const mountedRef = useRef(true);
```
`tokensRef` 是**进程内 Map**，且 `:187` 注释指明 token 只在「chat 与 EXACT 文本仍与批准时一致」时可消费 —— 是一次性凭条，不是豁免名单。

**结论**：同一凭据在同一会话内第二次出现，**会再次弹窗**。启发式误报确实构成可重复的骚扰路径，且今天没有任何缓解机制。

### E-0020 | command
- **来源定位**: `GET /context/v2/session/head` 在 `session_id` 为空时的实测响应，按 store owner 分组；以及 200 响应的第二判别轴。只读探针脚本 `probe_head.py` 输出（真实 `api_blueprint` 挂载在临时 Flask app + 临时 `UNCHAIN_DATA_DIR`）：

```
== A. 空 session_id，变更 store owner ==
[default(=pupu_legacy)] /context/v2/session/head?owner_chat_id=chat_a
    -> 400 {"error":{"code":"context_v2_invalid_request","message":"session_id is invalid","retryable":false}}
[pupu_legacy]           同上
    -> 400 {"error":{"code":"context_v2_invalid_request","message":"session_id is invalid","retryable":false}}
[off]                   同上
    -> 404 {"error":{"code":"context_v2_not_found","message":"Context V2 session head was not found","retryable":false}}
[unchain]               同上
    -> 503 {"error":{"code":"context_v2_generation_store_unavailable","message":"Unchain-owned generation request failed","retryable":false}}

== B. 两个 id 都给、chat 未知（基线）==
[pupu_legacy] -> 404 context_v2_not_found
[off]         -> 404 context_v2_not_found
[unchain]     -> 503 context_v2_generation_store_unavailable

== C. owner_chat_id 也为空 ==
[pupu_legacy] -> 400 {"code":"context_v2_invalid_request","message":"owner_chat_id is invalid"}
[off]         -> 404 {"code":"context_v2_not_found"}      ← OFF 分支根本不校验入参

== D. 已 seed legacy 状态（append_semantic_event chat_a/session_a）==
[pupu_legacy] 空 session_id -> 400 context_v2_invalid_request
[pupu_legacy] 两个 id 齐全 -> 200 {"sticky":false,"session_exists":true,"mutation_ready":false,
                                   "admission_mode":"","target_mode":"","bootstrap_status":"",
                                   "v2_bootstrapped":false,"session_revision":1,
                                   "current_generation_no":1, ...}
```

  代码对应：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:1057-1067`（route 把缺省 `session_id` 填 `""` 后直接下传）；`memory_v2_store.py:238-258`（`_required_identifier` 对空串抛 400 `context_v2_invalid_request`）；`route_memory_v2.py:236-247`（`STORE_OWNER_OFF` 分支在校验入参**之前**短路返回 404/503）；`memory_v2_store.py:1728-1792`（`get_session_head` 的 200 payload 含 `sticky` / `session_exists` / `mutation_ready` 三个布尔判别位）；`memory_v2_unchain_generation_api.py:275-289`（`_require_scope` 在 `open_...` 成功之后才校验 session）。

- **取得方式**: 只读探针脚本，写在 scratchpad（`/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/probe_head.py`），仓库文件未被修改。运行命令：`cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && PYTHONPATH=<unchain repo>/src python3 <scratchpad>/probe_head.py`。未启动 sidecar；用 Flask `test_client()` 直接打 blueprint。数据目录为 `tempfile.TemporaryDirectory()`，退出即销毁。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q2/Q5 半边）
- **完整性限制**:
  1. `unchain` owner 那一行是在 **未 provision 的空 store** 上测的，所以恒为 `context_v2_generation_store_unavailable` 503 —— 它证明「空 session_id 在该 owner 下连校验都到不了」，**不**证明 provision 完成后的行为。provision 一个真实 unchain store 需要写盘，超出本次只读边界。
  2. `unchain` 侧走的是本地 unchain 工作树 `src/`（`PYTHONPATH`），不是 `unchain_runtime/unchain-core.lock.json` 记的 revision `a4e69f41`。lock 与工作树若已分叉，该行需重测。
  3. 本探针未覆盖 `session_id` 为纯空白（`"   "`）与超长值；`_required_identifier` 先 `.strip()`，推断结果同 400，未实测。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0021 | command
- **来源定位**: `memory_vault` 在服务端 Python 层的出现次数为 **0**；全部实现位于 Electron / renderer 侧。

```
$ grep -ric "memory_vault\|memoryVault" --include="*.py" unchain_runtime | awk -F: '{s+=$2} END {print s+0}'
0
$ grep -rli "memory_vault\|memoryVault" unchain_runtime | grep -v __pycache__
<无输出>
$ grep -rli "memory_vault\|memoryVault" electron src | wc -l
50
```

  命中面举例（不在本 code owner 边界内，仅作定位）：`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/memory_vault_bridge.js`，`/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/memory_vault_service.test.js` 等。

- **取得方式**: 当前 checkout 只读检查（仓库根 `/Users/red/Desktop/GITRepo/PuPu`，分支 `dev`）。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q4-B 的边界判定：不落在 `code-owner-runtime` 端）
- **完整性限制**: 只匹配了 `memory_vault` / `memoryVault` 两种拼写。若 vault 在服务端以别名存在（例如并入 `mcp_secrets` 一类通用密钥面），此 grep 不会命中；本人未对服务端全部密钥相关模块做语义级排查。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0022 | command
- **来源定位**: `GET /memory/projection` 全状态实测矩阵。只读探针 `probe_projection.py` 输出：

```
== P1. 请求层拒绝 ==
[P1a 缺 session_id]  -> 400 {"error":"session_id is required"}
[P1b 未授权]         -> 401 {"error":{"code":"unauthorized","message":"Unauthorized"}}

== P2. 数据目录未配置 ==
[P2]                 -> 503 {"error":"UNCHAIN_DATA_DIR not configured"}

== P3. 真实内嵌 Qdrant，该 session 无 collection ==
[P3]                 -> 200 {"points":[], "variance":[0.0,0.0]}

== P4. 后端硬故障 ==
[P4a storage 被另一进程占用] -> 500 {"error":"Storage folder /var/folders/.../memory/qdrant is already
                                    accessed by another instance of Qdrant client. ..."}
[P4b meta.json 损坏]         -> 500 {"error":"Invalid Qdrant meta.json at /Users/x/.pupu/qdrant/meta.json"}

== P5. collection 存在但向量全不可用（NaN）==
[P5]                 -> 200 {"points":[], "variance":[0.0,0.0]}

== P6. 成功路径（独立进程复跑）==
status 200 / points 6 / variance 长度 5 = [0.5024, 0.4976, 0.0, 0.0, 0.0]
point keys = ['content','group','id','label','pc1','pc2','pc3','pc4','pc5','text',
              'turn_end_index','turn_start_index','x','y']
200 body 中不存在 'status' 或 'reason' 键：True

== P7. 空载荷常量 ==
_empty_projection_payload() = {"points": [], "variance": [0.0, 0.0]}
```

  代码对应（`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py`）：`:69-70` 空载荷常量；`:411` 400；`:414` 401；`:421` 503；`:448` collection 无点 → 200 空；`:451-452` collection-missing → 200 空；`:393 / :397 / :401` 向量不可用 / SVD 失败 / 点集为空 → 200 空；`:453` 其余异常 → 500 raw。另 `:423-427`：`_load_session_state` 由 `memory_factory.py:478-484` 吞掉全部异常返回 `{}`，导致 `vector_collection_tag` 落回空串、`_projection_collection_prefix` 从 `chat_<tag>` 退化为 `chat`（`memory_factory.py:658-673`），**查到另一个 collection 名 → 同样 200 空**。

- **取得方式**: 只读探针脚本 `/private/tmp/claude-501/-Users-red-Desktop-GITRepo-PuPu/76138b07-ccf2-4ba6-a1c0-1a0b47cc201b/scratchpad/probe_projection.py`，仓库文件未修改。运行：`cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server && PYTHONPATH=<unchain repo>/src /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python <scratchpad>/probe_projection.py`（用 `.venv` 因其含 `qdrant_client` 与 `numpy`）。P3 用真实内嵌 QdrantClient 打在临时目录上；P4/P5/P6 用假 client 注入 `sys.modules["memory_factory"]` 以复现具体故障字符串。P6 在同一进程内因 `sys.modules` 反复替换触发 `cannot load module more than once per process`，已在独立进程复跑取真值。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q8 主体）
- **完整性限制**:
  1. P4a/P4b 的异常是**构造**的，字符串照抄 qdrant-client / `memory_factory._repair_qdrant_local_meta` 的真实措辞（`memory_factory.py:547-553`），但未真的并发开两个客户端或损坏一份 meta.json —— 那需要写盘。
  2. 未覆盖 `/memory/long-term/projection`；该端点结构同型（`route_projection.py:480-496` 同样在 collection 缺失时返回 200 空 + profiles），推断结论相同，未实测。
  3. 本机 official store `entries=0`，无法取得"有真实记忆时 Inspector 看到什么"的正样本；P6 的成功样本是合成向量。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0023 | command
- **来源定位**: `/memory/projection` 在同一端点上使用**两种互不兼容的 error 信封**，且失败路径把原始异常字符串（含本机绝对路径）回传给渲染进程。

  `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_projection.py:450-453`：
  ```python
  except Exception as exc:
      if _is_projection_collection_missing_error(exc):
          return jsonify(_empty_projection_payload())
      return jsonify({"error": str(exc)}), 500
  ```
  同文件 `:411` `return jsonify({"error": "session_id is required"}), 400`，`:421` `return jsonify({"error": "UNCHAIN_DATA_DIR not configured"}), 503` —— 三处 `error` 都是**裸字符串**。
  同文件 `:414` `return root._json_error("unauthorized", "Unauthorized", 401)` —— 这一处 `error` 是**对象** `{"code","message"}`。

  实测载荷（E-0022 同一次运行）：
  ```
  500 {"error":"Storage folder /var/folders/9w/tdd8py050sv_tdw7syymb1fw0000gn/T/tmpkolmoanl/memory/qdrant
                is already accessed by another instance of Qdrant client. ..."}
  500 {"error":"Invalid Qdrant meta.json at /Users/x/.pupu/qdrant/meta.json"}
  400 {"error":"session_id is required"}
  503 {"error":"UNCHAIN_DATA_DIR not configured"}
  401 {"error":{"code":"unauthorized","message":"Unauthorized"}}
  ```

  消费侧（跨边界只读观察，归 `code-owner-electron`）：`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1733-1772` 的 `readJsonResponse` 在 `!response.ok` 时抛错，`error.code` 只从 `parsed?.error?.code` 取。因此 projection 的 400/500/503 到达 renderer 时 **`error.code` 恒为 undefined**，message 为原始异常串；只有 401 带得出 code。

- **取得方式**: 当前 checkout 只读检查 + E-0022 的只读探针输出。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q8：失败态既无词汇表又泄露路径）
- **完整性限制**: `readJsonResponse` 属 `code-owner-electron` 边界，本人只读引用其源码，未实测 IPC 全链路；「renderer 侧 `error.code` 为 undefined」是从该函数源码推得，未在运行中的 Electron 里断点验证。路径泄露的 severity 由 `expert-security` 定，本条只陈述事实。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0024 | command
- **来源定位**: 「200 + 空集合」不是 `/memory/projection` 的孤例 —— **整个 Context V2 只读面**对一个不存在 / 未准入的 chat 都返回 200 + 空集合，与「已准入但确实还没内容」逐字节同形。

  对一个从未出现过的 `owner_chat_id=chat_zzz`（默认 store owner `pupu_legacy`，空临时数据目录）实测：
  ```
  [/context/v2/events]              -> 200 {"after":0,"events":[],"has_more":false,"next_after":0,"owner_chat_id":"chat_zzz"}
  [/context/v2/memory/spaces]       -> 200 {"owner_chat_id":"chat_zzz","spaces":[]}
  [/context/v2/memory/candidates]   -> 200 {"candidates":[],"owner_chat_id":"chat_zzz"}
  [/context/v2/memory/reviews]      -> 200 {"owner_chat_id":"chat_zzz","reviews":[]}
  [/context/v2/memory/promotions]   -> 200 {"owner_chat_id":"chat_zzz","promotions":[]}
  [/context/v2/memory/jobs]         -> 200 {"jobs":[],"owner_chat_id":"chat_zzz"}
  [/context/v2/memory/search]       -> 400 {"error":{"code":"context_v2_invalid_request","message":"query is required","retryable":false}}
  ```
  路由定义见 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:1009 / 1082 / 1237 / 1299 / 1453 / 1347`。以上响应体中都**没有**任何表示「这个 chat 是否在 V2 里」的字段。

- **取得方式**: 只读探针，真实 `api_blueprint` 挂在临时 Flask app + `tempfile.TemporaryDirectory()` 数据目录，heredoc 脚本经 `/Users/red/Desktop/GITRepo/PuPu/.venv/bin/python` 执行；仓库文件未修改，未启动 sidecar。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007；同时对议案自带约束「新 Inspector 不得继承 `/memory/projection` 的 200-空成功形状」构成 **范围不足** 的证据 —— 新 Inspector 真正会读的这些 V2 端点，今天已经是同一形状。
- **完整性限制**:
  1. 只在 `pupu_legacy`（当前默认）下实测；`unchain` owner 下这些端点走 `memory_v2_unchain_read_adapter`，响应形状未实测。
  2. 未覆盖全部 30 个 `/context/v2/**` 路由，只取了 Inspector 最可能消费的读端点。
  3. 「未准入」在此以「chat 从未写入过任何状态」近似，并非通过 admission 表显式置为未准入。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0025 | command
- **来源定位**: 读路径的错误词汇表在两个 store owner 之间**不对称**：`pupu_legacy`（今天的默认）有完整分类，`unchain`（预定的未来 owner）会把同类失败全部塌成 500 `context_v2_failed`。

  1. 异常基类：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:65-66`
     ```python
     class PupuUnchainMemoryV2ReadError(RuntimeError):
         """PuPu could not prove an active, Unchain-owned exact read scope."""
     ```
     —— 继承 `RuntimeError`，**不是** `MemoryV2Error`（`memory_v2_store.py` 定义、`route_memory_v2.py:21` 导入）。
  2. 端点包装器：`route_memory_v2.py:94-104`
     ```python
     try:
         return function(*args, **kwargs)
     except MemoryV2Error as exc:
         return _error_response(exc)
     except Exception:
         current_app.logger.exception("Context V2 request failed")
         return root._json_error("context_v2_failed", "Context V2 request failed", 500)
     ```
  3. 只有**打开阶段**的 `PupuUnchainMemoryV2ReadError` 被翻译过：`route_memory_v2.py:355-361` → 503 `context_v2_unchain_read_unavailable`。**方法内部**抛出的没有任何翻译点，例如 `memory_v2_unchain_read_adapter.py:85-89`（`_require_owner` 越 scope）、`:91-95`（`_require_space`）、`:237`（ref 非法）、`:285-287`（ref 不受支持）、`:289-296`（review 内容完整性失败 / 不可用）。
  4. 对照组：`pupu_legacy` 路径的同类请求实测有分类（详见 E-0028），返回 400 `context_v2_invalid_ref` / 404 `context_v2_content_not_found` / 400 `context_v2_invalid_request`。

  后果：在 `unchain` owner 下，「ref 写错了」「你要的东西不存在」「你越了 scope」「review 内容校验不过」「后端真崩了」五者一律为 `500 {"error":{"code":"context_v2_failed"}}`。

- **取得方式**: 当前 checkout 只读检查；对照组为 E-0028 的只读探针实测。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q8 错误侧 + Q7 的条件）
- **完整性限制**: 第 3 点的运行时后果是从「异常类型 + 包装器 catch 顺序」推得的 **INFERENCE**，未在一个已 provision 的 `unchain` store 上实测 —— provision 需要写盘，超出只读边界。第 4 点是实测。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0026 | command
- **来源定位**: `counts` **已经在每一次 `/context/v2/status` 调用里被算出来然后丢掉** —— 它不是「要不要新增一个查询」的问题，是「要不要披露一个已算好的全库聚合」的问题。

  1. `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_store.py:1627-1670` —— `MemoryV2Store.status()` 无条件对 **20 张表** 逐张跑 `SELECT COUNT(*)`：
     ```python
     counts = {}
     for table in ("sessions","generations","attempts","events","bootstrap_messages",
                   "pinned_task_state","operations","objects","artifacts","context_builds",
                   "checkpoints","checkpoint_event_ranges","task_state","spaces","entries",
                   "entry_revisions","links","candidates","consolidation_jobs",
                   "consolidation_job_candidates","candidate_reviews","promotions",
                   "index_state","deletion_outbox"):
         counts[table] = int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
     return {"available": True, "schema_version": ..., "journal_mode": ...,
             "lexical_backend": ..., "counts": counts}
     ```
  2. `route_memory_v2.py:982-1006` —— 路由只从中取 4 个键重建响应，`counts` **被丢弃**，且路由不带条件、无 opt-in 参数。
  3. `route_memory_v2.py:786-787` —— `_status_for_store_owner` 的 docstring 明写：`"Return store-level health without fabricating a chat read scope."`
  4. 该丢弃被测试锁死：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/tests/test_route_memory_v2.py:56`
     ```python
     self.assertNotIn("counts", status.get_json())
     ```
  5. 实测 `/context/v2/status` 200 响应的完整键集（20 键，无 counts）：
     ```
     available, canary_percent, configured_mode, context_memory_capability_immutable,
     context_memory_capability_ready, context_memory_capability_reason,
     context_memory_capability_verification, context_memory_contract, feature_ceiling,
     journal_mode, lexical_backend, read_only_degraded, rollout_config_error_code,
     rollout_config_valid, rollout_fingerprint, rollout_mode, schema_version,
     store_owner, unchain_revision, vector_status
     ```

- **取得方式**: 当前 checkout 只读检查 + 只读探针实测（临时 Flask app + 临时数据目录，`.venv` python）。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q3）
- **完整性限制**: 未测量 20 次 `COUNT(*)` 在一个真实规模数据库上的耗时 —— 本机 store 为空，测不出有意义的数字。「已经在算」是代码事实；「代价多大」在有真实数据前不可量化。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0027 | command
- **来源定位**: 在 `unchain` store owner 下，`/context/v2/status` **结构上不可能**携带 counts —— 上游只读状态契约只有 5 个字段，且明确声明不带 scope。跨仓：`unchain` 仓库（`code-owner-unchain` 边界）。

  `<unchain repo>/src/unchain/persistence/sqlite_read_v2.py:70-89`
  ```python
  class SQLiteContextV2StoreReadStatus:
      """Database-level health only; it carries no chat or execution scope."""
      available: bool
      schema_version: int
      journal_mode: str
      lexical_backend: str
      vector_status: str = "disabled"
      SCHEMA = "unchain.sqlite_context_v2_store_read_status.v1"
      def to_dict(self) -> dict[str, object]: ...   # 6 键：schema + 上述 5 个
  ```
  PuPu 侧消费点：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:669-706`，`read_pupu_unchain_memory_v2_store_status(...)` 返回 `{**status, "storeOwner": "unchain"}`，`status` 即上述 6 键去掉 `schema`。

  推论：若裁定「开 counts」并按今天最省的做法实现（把 `MemoryV2Store.status()` 已算好的 counts 转发出去，见 E-0026），该实现在 store owner 从 `pupu_legacy` 切到 `unchain` 的那一天会**静默变成空/缺失** —— 正是本案要根治的那一类「空即失败」。要在两个 owner 上都成立，必须改上游 `SQLiteContextV2StoreReadStatus` 契约，属跨仓改动。

- **取得方式**: 当前 checkout 只读检查（unchain 本地工作树 `<unchain repo>/src`）。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q3 的决定性理由之一）
- **完整性限制**:
  1. 读的是 unchain **本地工作树**，不是 `unchain_runtime/unchain-core.lock.json` 记录的 revision `a4e69f413c449c5768433ba4dddc5b60b8146991`。两者若已分叉，需 `code-owner-unchain` 复核。
  2. 未穷举 unchain 侧是否另有一个带 counts 的只读状态 API；只核了 PuPu 现在实际调用的这一个。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0028 | command
- **来源定位**: 已披露 ref 的语义与回读端点的错误词汇表（Q7 服务端半边）。

  **1. ref 是 revision-pinned、不漂移。** `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:49-62`：
  ```python
  _ARTIFACT_URI        = ^pupu://artifact/(<id>)@([1-9][0-9]*)$
  _MEMORY_URI          = ^pupu://memory/(<space>)/(<entry>)@([1-9][0-9]*)$
  _CHECKPOINT_URI      = ^pupu://context/checkpoint/(<id>)$          ← 唯一无 @rev 的
  _REVIEW_CONTENT_URI  = ^pupu://memory/review/(<id>)@([1-9][0-9]*)/(diff|proposed)$
  ```
  `@rev` 是必填正整数（`@0` 不匹配）。同一个 ref 永远指向同一份 bytes；entry 后续被改写不会让旧 ref 变内容，只会产生新 rev。

  **2. 回读端点带分页与完整性元数据。** 同文件 `:302-313` 的返回体：`ref / owner_chat_id / mime_type / sha256 / offset / limit / total_bytes / next_offset / truncated / encoding:"base64" / data`。

  **3. 越 scope 的服务端反应。** 同文件 `:85-95`：`_require_owner` / `_require_space` 不匹配即抛 `PupuUnchainMemoryV2ReadError` —— 在 `unchain` owner 下无翻译点，落 500（见 E-0025）。

  **4. `pupu_legacy`（今天的默认）下 `/context/v2/content/<ref>` 的实测词汇表**（临时空数据目录）：
  ```
  [ref = "not-a-ref"]                    -> 400 {"code":"context_v2_invalid_ref","message":"content reference is invalid"}
  [ref = "pupu://artifact/art_x@1"]      -> 404 {"code":"context_v2_content_not_found","message":"content was not found"}
  [同上但不带 owner_chat_id]             -> 400 {"code":"context_v2_invalid_request","message":"owner_chat_id is invalid"}
  [ref = "pupu://artifact/art_x@0"]      -> 400 {"code":"context_v2_invalid_ref"}
  ```
  路由 `route_memory_v2.py:1025-1036`；legacy 实现 `memory_v2_store.py:8869-8900`（经 `MemoryV2Runtime.__getattr__`，`memory_v2_runtime.py:686` 代理到 store）。

- **取得方式**: 当前 checkout 只读检查 + 只读探针（临时 Flask app + `tempfile.TemporaryDirectory()`，`.venv` python，heredoc 脚本，未落盘到仓库）。
- **提交发言**: S-0007
- **支持/反驳**: 支持 S-0007（Q7 服务端补充）；对 `0000-0001-2026-0807#S-0005`「不新增 `listArtifacts`」的结论构成**有条件**支持
- **完整性限制**:
  1. 第 4 组实测只在 `pupu_legacy` 下取得。`unchain` owner 下的实际状态码未实测（见 E-0025 的同一限制）。
  2. ref 失效的三条路径（chat durable 删除的 tombstone、store owner 切换、数据目录更换）为代码阅读推断，未实测。tombstone 相关代码见 `memory_v2_unchain_generation_api.py:563-571`（`context_v2_chat_deleted` 410）。
  3. 未验证 renderer 今天是否真的展示了这些 ref —— 那属 `code-owner-chat-bubble` 的交付。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0029 | command
- **来源定位**: 对本人前案发言 `0000-0001-2026-0807#S-0005` 的一处**自我更正**，以及更正后仍然成立的部分。

  前案主张（本案 `record.md` S-0001 框定时被转述）：「`tests/test_route_memory_v2.py` 全文没有任何一条断言检查 500 或错误码」。实测：

  ```
  $ cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server
  $ grep -c "assert" tests/test_route_memory_v2.py
  145
  $ grep -oE "status_code, [0-9]{3}" tests/test_route_memory_v2.py | sort | uniq -c
    25 status_code, 200
     2 status_code, 400
     1 status_code, 401
     7 status_code, 404
     3 status_code, 409
     6 status_code, 503
  $ grep -n '\["error"\]\["code"\]' tests/test_route_memory_v2.py | wc -l
    15
  ```

  - **错的部分**：该文件有 **15 条** `error.code` 断言（行 275, 370, 417, 438, 769, 773, 812, 816, 870, 874, 902, 920, 1498, 1652, 1714），并断言过 400 / 401 / 404 / 409 / 503。「没有任何一条断言检查错误码」不成立。
  - **仍然成立、且更精确的部分**：`status_code, 500` 出现 **0 次**；`context_v2_failed` 在该文件出现 0 次。即 `route_memory_v2.py:98-104` 的 catch-all 500 分支 **零测试覆盖**。

  附带核实：该文件行 777-816 的 `empty_legacy_head` 测的是「空的 legacy store」，不是「空的 `session_id`」—— 本案已知缺口第 3 条（`get_session_head` 空 `session_id` 未实测）在测试套件里确实没有被覆盖，由 E-0020 补齐。

- **取得方式**: 当前 checkout 只读检查（`grep` + `sed`），未运行测试。
- **提交发言**: S-0007
- **支持/反驳**: 部分**反驳** `0000-0001-2026-0807#S-0005` 中本人的一处表述；支持 S-0007 关于「catch-all 500 无覆盖」的收窄结论
- **完整性限制**: 只统计了 `assertEqual(response.status_code, NNN)` 这一种写法。若存在 `assertIn(resp.status_code, {...})` 或经辅助函数间接断言 500 的写法，本统计会漏。另：只查了 `tests/test_route_memory_v2.py` 一个文件，未查其他测试文件是否覆盖 500。
- **验证历史**:
  - S-0007 | 未验证 | 提交时状态

### E-0030 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:32-51, 59-67, 84-94, 96-124`；`/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/context_v2_bridge.js:62-66`
- **取得方式**: 当前 checkout 只读检查（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008
- **完整性限制**: 静态读取。未在运行中的 Electron 里实测一次 `getSessionHead` 往返。

**renderer 侧 `getSessionHead` 的确切形状**

```
contextV2Bridge.getSessionHead(payload) -> Promise<any>
```

- **入参**：renderer bridge 不解构、不校验、不改写，整个 `payload` 原样交给 `window.contextV2API.getSessionHead`。真正被裁剪的地方在 preload（`electron/preload/bridges/context_v2_bridge.js:62-66`），它按 **白名单重建** 出 `{ ownerChatId, sessionId }` 两个字段，其余 key 一律丢弃。所以有效入参形状 = `{ ownerChatId: string, sessionId: string }`，**两者都是必填**（main 侧 `requireContextV2OwnerChatId` / `requireContextV2Identifier`）。
- **返回**：`Promise.resolve(api.getSessionHead(...))`，**不做任何 shape 断言**。返回值是 main 侧 `contextV2SessionHeadResponse()` 归一化后的对象，renderer bridge 对它一无所知。
- **错误传播**：`invokeBridge` 只做两件事 —— (1) `resolveApi()` 返回 null 时 reject 一个自造的 `context_v2_unavailable` Error；(2) 同步 throw 转成 rejection。**它不 catch、不吞、不降级、不转 null。** 上游 rejection 原样透出。
- **code 的取回方式**：Electron 跨 `ipcMain.handle` 会剥掉 `error.code`，所以 main 把 code 编码进 message 的 `[code] ` 前缀，renderer 用 `parseContextV2ErrorCode()`（`:77-82`，正则 `/\[([a-z0-9_]+)\]\s/`）取回。字符集锁死 `[a-z0-9_]`，用户内容无法误命中。

**结论**：**renderer 这一层没有压平任何东西。** 它是一个不持状态、不做校验的透传壳，18 个方法逐个 1:1 转发，错误连同 code 一起原样上抛。

**一个附带的空白**：`getStatus`（`:102`）是本 bridge 上唯一携带多字段状态（`available / schemaVersion / journalMode / lexicalBackend / vectorStatus / featureCeiling / rolloutMode / readOnlyDegraded`）的方法，而它在 `src/**` 里 **零非测试消费者**（见 E-0031 的检索）。今天所有消费方判"能不能用"靠的是 `isAvailable()`，而 `isAvailable()` 只探测 `window.contextV2API` 上 18 个方法是否都是 function（`:59-67`）—— 它 **完全不反映运行时就绪**，preload 挂上了就恒为 true。

### E-0031 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1892-1940`（`contextV2Request`）、`:1852-1887`（`verifyContextV2Readiness`）、`:1039-1056`（`initialMemoryV2Readiness`）、`:4953`（唯一刷新点）、`:1733-1783`（`readJsonResponse`）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:405-450`（`validateMemoryV2Status`）
- **取得方式**: 当前 checkout 只读检查（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008；补充 `0000-0003-2026-0807#E-0020`（HTTP 层三路判别），说明该三路在 Electron 路径上部分不可达
- **完整性限制**: 静态读取。未在运行中的 Electron 里注入一个 degraded 的 sidecar 实测。`memory_v2_rollout.js` 与 `unchain/service.js` 属 `code-owner-electron` 边界，本条只作事实登记，不作处置主张。

**压平发生在 Electron main，不在 renderer bridge。有两处，方向相反。**

**（一）请求前的就绪闸 —— 11 个原因塌成 1 个 code**

`contextV2Request`（`:1897-1906`）在发出任何 HTTP 之前先判：

```js
if (endpoint !== `${CONTEXT_V2_ENDPOINT}/status` &&
    memoryV2RuntimeConfig.effectiveMode !== "off" &&
    memoryV2Readiness.status !== "ready") {
  throw createContextV2Error("context_v2_readiness_failed", "context v2 capability is unavailable");
}
```

而 `memoryV2Readiness.reason` 的取值域，逐条数出来是 **11 个互不相同的原因**：

- `validateMemoryV2Status`（`memory_v2_rollout.js:405-450`）产出 9 个：`context_v2_unavailable` / `context_v2_store_owner_incompatible` / `context_v2_schema_incompatible` / `context_v2_wal_required` / `context_v2_lexical_backend_incompatible` / `context_v2_unchain_capability_unavailable` / `context_v2_unchain_capability_invalid` / `context_v2_rollout_config_invalid` / `context_v2_rollout_mismatch`
- `service.js:1870-1873` 追加 1 个：`vault_worker_containment_unavailable`
- `service.js:1879-1885` 的 catch 追加 1 个：`context_v2_readiness_unavailable`
- （另有 `initialMemoryV2Readiness` 的 `memory_v2_release_snapshot_invalid` / `rollout_off` / `not_verified`）

**这 11 个 reason 全部被丢弃**，renderer 只拿到统一的 `context_v2_readiness_failed`。这就是四态里「未就绪」不可细分的物理原因 —— 不是前端没设计，是这一层把区分度删掉了。

**（二）就绪快照是 boot 时算一次的，不是每次调用现算**

`memoryV2Readiness` 是闭包内的可变量（`:1068`）。全仓 **只有一处** 调用 `verifyContextV2Readiness()`：`:4953`，在 sidecar 启动成功后。除此之外只有 `getContextV2Status()`（`:1960-1975`）会顺带刷新它 —— 而 `getStatus` 在 `src/**` 零消费者（下面的检索）。

后果：**若 sidecar 启动时判定为 degraded，则本次进程生命周期内每一次 Context V2 调用都恒定 reject `context_v2_readiness_failed`，renderer 既拿不到原因、也没有任何重新探测的路径**（除非 sidecar 重启）。任何「稍后重试」文案在这一态下都是无效指引。

**（三）走到 HTTP 的那条路上，sidecar 的 code 是保住的**

`readJsonResponse`（`:1740-1772`）从 `parsed.error.code` 取 sidecar 的稳定 code 挂到 `error.code`；`contextV2Request` 的 catch（`:1931-1939`）保留它，缺失时兜底为 `context_v2_failed`，再重新包成 `[code] 静态消息`。所以 `E-0020` 测到的 `context_v2_invalid_request` / `context_v2_not_found` 这类带 code 的响应能穿到 renderer；**HTTP status 本身被丢弃**（400/404/503 的数字不过桥），只有 code 过桥。无 code 的 503 会塌成 `context_v2_failed`。

**（四）与 E-0020 的交叉**：`E-0020` 在 HTTP 层测到 `pupu_legacy → 400 context_v2_invalid_request`。但在 Electron 路径上，`pupu_legacy` 会先让 `validateMemoryV2Status` 落到 `context_v2_store_owner_incompatible` → readiness degraded → **请求根本发不出去**，renderer 看到的是 `context_v2_readiness_failed` 而不是 `context_v2_invalid_request`（仅当 `effectiveMode !== "off"`；`off` 时闸门跳过，请求真的发出，命中 `E-0020` 的 404）。这意味着 **E-0020 的三路判别是 sidecar 层的真相，不等于 renderer 层的真相**。

**检索命令与结果（`getStatus` 零消费者）**

```
grep -rn "contextV2Bridge.getStatus\|memoryVaultBridge.getStatus" --include="*.js" src/
→ 仅 4 条，全部在 src/SERVICEs/bridges/*.test.js
```

### E-0032 | repository
- **来源定位**: 检索全仓 `src/` 与 `electron/`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:389-394（RUNTIME_UNAVAILABLE_CODES）、:396-412（NOT_READY_CODES）、:420-435（contextV2TurnMutationMessage）`；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:1903、:5318`
- **取得方式**: 当前 checkout 只读检索（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008
- **完整性限制**: 静态检索。未构造一次真实的 readiness-degraded 运行来观察最终渲染出的那句话。

**`context_v2_readiness_failed` 是 main 会发、renderer 不认识的 code。**

检索命令与结果：

```
grep -rn "context_v2_readiness_failed" --include="*.js" src/
→ 0 条

grep -rn "context_v2_readiness_failed" --include="*.js" electron/ | grep -v test
→ electron/main/services/unchain/service.js:1903   （每一个 Context V2 请求的就绪闸）
→ electron/main/services/unchain/service.js:5318   （V4 流启动时 memory_v2_requested 但未就绪）
```

**后果一（turn mutation 文案桶错位）**：`contextV2TurnMutationMessage()` 的分桶是 `RUNTIME_UNAVAILABLE_CODES`（4 个）→ `NOT_READY_CODES`（13 个）→ `CONTEXT_V2_REBASE_IN_PROGRESS_CODE` → `TERMINAL_REBASE_ERROR_CODES` → 兜底 `FAILED`。`context_v2_readiness_failed` **不在前四个集合的任何一个里**，因此落到兜底 `FAILED` = *"This message change could not be applied. Please try again."*

这句话在这一态下是错的两次：它既没有说明是记忆能力未就绪（而不是这次操作失败），又给了一个按 E-0031(二) 的机制 **永远不会成功** 的重试建议 —— 就绪快照只在 sidecar 启动时算，重试一万次都是同一个结果。

**后果二（admission 路径侥幸命中）**：`getSessionHead` 若因就绪闸被拒，`decideTurnMutationMemoryMode`（`:187-196`）看到的 code 不是 `context_v2_not_found`，于是返回 `blocked("head_failed")`，而 `head_failed` **恰好** 在 `NOT_READY_CODES` 里（`:403`），所以 admission 这一路会说"记忆还在准备中"。**同一个底层原因，两条路径给两句不同的话，其中一条对一条错**，且这个"对"是间接映射侥幸得来的，不是有意设计的。

**后果三（流启动路径）**：`service.js:5318` 在 `memory_v2_requested === true` 且未就绪时直接对流发 `error` 事件，code 同样是 `context_v2_readiness_failed`。renderer 无对应识别 → 走通用流错误文案。

### E-0033 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage/chat_storage_sanitize.js:289-302`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/chat_storage.js:38`；`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu_context_menu_items.js:194-224`；`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/side-menu/side_menu.js:296-299, 772-778`
- **取得方式**: 当前 checkout 只读检查 + 全仓检索（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008；**证实** `code-owner-chat-core` 关于 `chatId` 不是形参、信息从未写入的举证
- **完整性限制**: 静态读取。未运行时验证一次真实 character chat 的 sessionId 取值。

**本 owner 作为该函数的 owner，复核结论：chat-core 的举证成立，且比其陈述更强。**

定义（`chat_storage_sanitize.js:301-302`，经 `chat_storage.js:38` 再导出）：

```js
export const buildCharacterMemorySessionId = (characterId, threadId = "main") =>
  `character_${sanitizeCharacterSessionKeyComponent(characterId, "character")}__dm__${sanitizeCharacterSessionKeyComponent(threadId, "main")}`;
```

**（一）`chatId` 确实不是形参。** 形参只有 `characterId` 与 `threadId`。产出串里没有任何 chatId 派生位。`ownerChatId` 从这个串 **无法解析回来**。

**（二）比"没写入"更强的一点：这个变换本身是有损的、多对一的。** `sanitizeCharacterSessionKeyComponent`（`:289-299`）执行 `String() → trim → toLowerCase → 非 [a-z0-9] 连续段替换为 "_" → 去首尾下划线 → 空则回退默认值`。因此 `My-Char`、`my_char`、`my.char`、`MY CHAR` **四个不同的 characterId 产出同一个 session id**。即便有人日后把 `characterId` 反解出来，也不能保证唯一。

**（三）唯一的补救路径是正向重算而不是反解。** 理论上调用方可以遍历 chat store 里全部 character chat，对每个 `(characterId, threadId)` 正向调用本函数，与手上的 sessionId 比对来倒推 `ownerChatId`。这是 O(会话数)，且在 (二) 的碰撞下 **可能匹配到多于一个 chat**，无法判定。因此它不是一个可依赖的方案。

**（四）现有调用面：`src/` 内只有一个非测试调用点。** 检索：

```
grep -rn "buildCharacterMemorySessionId" --include="*.js" src/ electron/
→ src/COMPONENTs/side-menu/side_menu_context_menu_items.js:2   （import）
→ src/COMPONENTs/side-menu/side_menu_context_menu_items.js:198 （唯一调用）
→ src/SERVICEs/chat_storage/chat_storage_sanitize.js:301       （定义）
→ src/SERVICEs/chat_storage.js:38                              （再导出）
```

改这个函数的 **JS 侧下游破坏面因此极小**（1 个调用点）。但 **格式本身是跨仓契约，破坏面在别处**：同一 `character_<x>__dm__<y>` 形状同时出现在
- `src/PAGEs/chat/chat.test.js`（7 处）与 `use_chat_stream.memory_v2_payload.test.js`（2 处，断言 `payload.threadId === "character_nico__dm__main"`）—— 即这个串 **作为 wire 字段 `threadId` 发给后端**；
- `unchain_runtime/server/tests/test_character_routes.py:442` 后端独立按同一格式拼装。

所以：**加参数（追加第三个可选形参）是安全的；改产出串的格式是跨仓单向门**，会同时打断 PuPu 的 wire payload 与 unchain 的服务端拼装。

**（五）`ownerChatId` 在入口处就被丢弃，不只是"函数里没有"。** 侧栏两条分支（`side_menu_context_menu_items.js:198-224`）：

- character chat → `onInspectMemory(memorySessionId, chatTitle)` —— 第一参是派生串，**`node.chatId` 在这里被丢掉**
- 普通 chat → `onInspectMemory(node.chatId, chatTitle)` —— 第一参 **就是 chatId**

两条分支把 **语义不同的两种值塞进同一个位置参数**。`side_menu.js:296-299` 把它存成 `{open, sessionId, chatTitle}`，`:772-778` 把这三个原样传给 `MemoryInspectModal`。**modal 收到的 props 里没有 chatId、没有 chatKind、没有 characterId。**

因此 modal 内部若要按 chat admission 分流，今天 **只能靠嗅探字符串前缀** 来猜自己拿到的是哪一种 —— 而普通 chat 的 chatId 理论上也可能长成 `character_..__dm__..`，这个嗅探没有契约保证。补传 `ownerChatId` 是唯一干净的前置条件，且改动点在 **`side_menu_context_menu_items.js` + `side_menu.js` + modal props**，不在 `buildCharacterMemorySessionId` 内部。

### E-0034 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/memory_vault_bridge.js:11-17, 40-61, 114-126`；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/service.js:13-16, 109, 501-521, 2081-2118`；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/chat_storage/deletion_outbox.js:341-344`
- **取得方式**: 当前 checkout 只读检查 + 全仓检索（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: **支持并核实** `code-owner-settings` 报告的实现约束（`listDescriptors` 契约性禁止无 scope 枚举）；对其"做不出来"的结论作有条件限缩
- **完整性限制**: 静态读取。本机 vault 未取样（无 descriptor 数据），未实测一次 `listDescriptors` 往返。

**约束成立。逐层核实如下。**

**（一）renderer bridge 侧**：`memoryVaultBridge.listDescriptors(filter)`（`:121`）只是 `invokeBridge("listDescriptors", [filter])` 的透传，**不校验**。约束不在这一层，注释（`:11-17`）明确写着"BOTH required；there is no unscoped listing"，是对 main 契约的镜像声明。

**（二）main 侧是硬闸，不是注释**（`memory_vault/service.js:2087-2105`）：

```js
const { scopeKind, scopeId } = filter;
validateScopeKind(scopeKind);   // 必须 ∈ ["chat","user"]，否则 invalid_scope_kind
validateScopeId(scopeId);       // 必须匹配 [A-Za-z0-9_.:-]{1,128}，否则 invalid_scope_id
... "WHERE s.scope_kind = ? AND s.scope_id = ?"   // 精确等值，不是 LIKE/前缀
```

缺省或部分 filter 是 **coded rejection**，不是空结果。SQL 里没有任何可退化成全表扫描的分支。头注释（`:13-16`）把它列为 P0 安全签核条件之一：*"a caller can only ever see the descriptors of the one scope it names"*。

**（三）所以「列出用户捕获过的全部凭据」在当前契约下：一次调用做不到；分段重建则部分可行。**

- **`user` 域：完全可枚举。** `MEMORY_VAULT_USER_SCOPE_ID = "pupu.user"` 是 renderer 侧的 **固定常量**（`memory_vault_bridge.js:51`），不是每用户/每会话变量。一次 `listDescriptors({scopeKind:"user", scopeId:"pupu.user"})` 即返回全部 user 域凭据。**这一半没有障碍。**
- **`chat` 域：只能扇出重建。** `scopeId` = chatId（`resolveMemoryVaultScope`，`:53-61`）。renderer 手上有完整 chat 列表（chat store），所以可以对每个 chat 各发一次 `listDescriptors`。这 **不违反契约**（每次都在命名一个自己合法拥有的 scope），但代价是 **O(会话数) 次 IPC 往返**。本仓已知会话库无界增长，这个扇出会随库线性劣化。
- **一个契约做不到、也无法绕过的缺口**：若某个 chat-scoped secret 的 chat 行已经不存在（deletion outbox 的 vault 清理曾失败并最终放弃），它的 `scopeId` **再也无法被发现** —— 没有任何 renderer 可达的 API 能列出"存在哪些 scopeId"。这类孤儿凭据对管理界面 **永久不可见、不可删**。（`deletion_outbox.js:341-344` 确实用 `listDescriptors({scopeKind:"chat", scopeId: owner_chat_id})` 做删除清理，所以正常路径下不会留孤儿；此处指的是清理最终失败的残留。**未核实**：本机无孤儿样本可测。）

**（四）缺的是什么（若裁定要做完整清单）**：缺一个 **scope 枚举能力** —— 要么 main 侧新增一个"列出存在凭据的 scopeId 列表"的方法（这会直接推翻 P0 安全签核里"渲染进程不可全局枚举 vault"这条不变量，是安全评审事件），要么在 renderer 侧接受扇出方案并明确「以 chat store 为权威、孤儿不可见」这条已知局限。**这是一个需要 `expert-security` 出具意见的取舍，不是实现细节。**

**（五）零消费者事实**（检索，排除 `*.test.js`）：

```
grep -rn "\.listDescriptors(\|\.grant(\|\.revoke(" --include="*.js" src/
→ 只有 src/SERVICEs/bridges/memory_vault_bridge.js 自身的定义行（:121 :123 :124）
```

`listDescriptors` / `grant` / `revoke` / `getStatus` 四个方法在 `src/**` **零非测试消费者**。今天 renderer 只用到 `deposit` 与 `deleteSecret`（`src/PAGEs/chat/hooks/use_secret_capture_gate.js:369, 386`）。即：**用户可以存进去、gate 内可以撤销一次，但没有任何界面能回看自己存过什么。**

### E-0035 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/locales/en.json` → `memory_inspect.*`（13 键）、`context_menu.inspect_memory`
- **取得方式**: 当前 checkout 只读解析（`python3` 展平 JSON 后按正则筛选，dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008
- **完整性限制**: 只统计了 key 的存在与英文原文，未逐条核对 10 个非英语译文的语义质量。

**`memory_inspect` 今天的全部文案（en.json，13 键）**

```
memory_inspect.title                  = "Memory"
memory_inspect.title_long_term        = "Long-Term Memory"
memory_inspect.loading                = "Loading…"
memory_inspect.no_vectors_chat        = "No memory vectors found for this chat."
memory_inspect.no_vectors             = "No memory vectors found."
memory_inspect.profiles               = "Profiles"
memory_inspect.profile                = "Profile"
memory_inspect.chunk_detail           = "Chunk Detail"
memory_inspect.vs                     = "vs"
memory_inspect.jitter                 = "Jitter"
memory_inspect.empty_profile          = "Empty profile document."
memory_inspect.no_conversation_text   = "No conversation text stored for this memory chunk."
memory_inspect.load_failed            = "Failed to load memory projection"
```

**对四态（正常 / 为空 / 未就绪 / 失败）的覆盖情况**

| 态 | 有无文案键 | 键 |
|---|---|---|
| 正常 | 有（数据本身即呈现） | — |
| 加载中 | 有 | `memory_inspect.loading` |
| 为空 | 有 | `memory_inspect.no_vectors_chat` / `no_vectors` |
| **未就绪** | **无。一个键都没有。** | — |
| 失败 | 有，**且是不可诊断的一句** | `memory_inspect.load_failed` = "Failed to load memory projection" |

**两条推论**

1. **「未就绪」在文案层是零覆盖。** 结合 `S-0007` 出具的服务端形状（为空与四种成因不同的未就绪被压成同一个 200 空载荷），今天 `memory_inspect.no_vectors_chat` 这一句 **同时在承担至少 5 种情形**：真的没有条目、以及四种不同成因的未就绪。用户看到的是同一句"这个会话没有记忆向量"，无论记忆系统是空的还是坏的。
2. **失败态的文案里没有 code 位。** `load_failed` 是一句无参数的静态串，没有 `{code}` 占位符。这与 `S-0007` 所述"失败态回传裸异常串且无 error code"是同一件事的两端：后端没给 code，前端也没有摆放 code 的位置。**即便后端明天补上 error code，前端也需要同时改文案结构才能显示它。**

**locale 覆盖**：13 个 `memory_inspect.*` 键在 **全部 11 个 locale 中均存在**（见 E-0036 的逐文件统计）。`context_menu.inspect_memory` 同样 11/11。所以本案讨论的入口与现有 modal 文案 **不存在缺翻**；代价全部落在"新增键"上。

### E-0036 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/locales/*.json`（11 文件）；`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/mini_react/use_translation.js:1-96`
- **取得方式**: 当前 checkout 只读解析，`python3` 展平全部 key 后做差集（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008
- **完整性限制**: 只比对 key 存在性，不评估译文质量；未跑 `i18n-coverage` skill（只读庭审，不触发自动补写）。

**11 个 locale 的实测对等性（en.json 为源）**

| 文件 | 总键数 | 相对 en 缺失 | 多余 | `memory_inspect.*` |
|---|---|---|---|---|
| en | 638 | 0 | 0 | 13 |
| zh-CN | 635 | **3** | 0 | 13 |
| de / es / fr / it / ja / ko / pt-BR / ru / zh-TW | 589 each | **49** each | 0 | 13 |

**缺失的 49 个键，逐类**：`chat.attach.computer*`（3）、`dev.mcp_registry*`（20）、`local_storage.mcp_*` + `local_storage.section_mcp`（26）。zh-CN 缺的 3 个即 `chat.attach.computer*`。

**三条对本案直接相关的结论**

1. **本案涉及的记忆文案没有缺翻。** `memory_inspect.*`（13）与 `context_menu.inspect_memory` 在 11/11 齐全。既有翻译不是障碍。
2. **`settings > local_storage` 是全仓翻译最差的一段。** 49 个缺口里有 26 个落在 `local_storage.*`，即 10 个非英语 locale 在这一段本来就有 26 个键在跑英文兜底。`code-owner-settings` 提议把 captured secret 管理界面放进 `settings > local_storage` —— **这个落点在 i18n 上是负债最重的地方，新增键会叠在既有 26 个缺口之上**。这不构成反对该落点，但是选它必须一并偿还的代价。
3. **缺键是静默的，这就是 49 个缺口长期没人发现的机制。** `use_translation.js:73-91`：`t(key)` 找不到当前 locale 的键时 → 回退 `en.json` → 再找不到 **返回 key 字符串本身**。既不抛错也不告警。全仓只有 `boot.*` 一段有对等性守卫（见 E-0038），其余 600+ 键无任何测试约束。

**新增四态文案的 i18n 代价（按现有结构估算）**：一态一键的话，四态 = 4 键 × 11 locale = 44 条译文；若按 `boot.failure.*` 那种"每个失败 code 一句"的粒度，未就绪态若要覆盖 E-0031 列出的 11 个 reason，则是 (3 + 11) × 11 = 154 条。**粒度选择直接决定代价差 3.5 倍**，这是需要裁定的取舍，不是实现细节。

补充：11 个 locale JSON 在 `use_translation.js:4-14` 被 **静态 import 全量打进 bundle**，不是按需加载。新增键的体积代价按 11 倍计。

### E-0037 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/context_v2_turn_mutation.js:93-110`；`/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:12866-12874`；`/Users/red/Desktop/GITRepo/PuPu/src/locales/*.json`
- **取得方式**: 当前 checkout 只读检查 + 全仓检索（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008；**证实并加强** `code-owner-chat-core` 关于 `CONFLICT_MANUAL` 零引用、实际渲染内联重复串的举证
- **完整性限制**: 静态读取。未在运行中触发一次真实的 turn-mutation 冲突。

**（一）V2 turn-mutation 的 7 条用户可见串全部是 `.js` 里的英文硬编码，`src/locales/**` 里一条都没有。**

`context_v2_turn_mutation.js:97-110` 定义 `CONTEXT_V2_TURN_MUTATION_MESSAGES`，7 个成员：`UNAVAILABLE` / `NOT_READY` / `IN_PROGRESS` / `FAILED` / `CONFLICT` / `CONFLICT_MANUAL` / `PERSIST`，值全是英文字面量。检索 `src/locales/` 无任何对应键。

**这意味着：11 个 locale 里的 10 个，用户在记忆写失败时看到的是英文。** 这不是"缺翻"（缺翻至少有键位），是 **根本没有进入 i18n 体系**。

**（二）`CONFLICT_MANUAL` 零引用，实际渲染的是内联重复串 —— 且两串措辞不一致。**

检索：

```
grep -rn "CONFLICT_MANUAL" --include="*.js" src/
→ 仅 src/PAGEs/chat/hooks/context_v2_turn_mutation.js:107（定义处）
```

实际渲染点 `use_chat_stream.js:12866-12874`，两句都是 **内联字面量**，与常量文件里的版本 **逐字不同**：

| | 常量文件（未被引用） | `use_chat_stream.js` 内联（实际渲染） |
|---|---|---|
| CONFLICT | "The conversation changed before this **message change** could be applied. Please try it again." | `:12868` "The conversation changed before this **message operation** could be applied. Please try it again." |
| CONFLICT_MANUAL | "This **message change** conflicted with newer conversation state and needs manual review before it can be discarded." | `:12873` "This **message operation** conflicted with newer conversation state and needs manual review before it can be discarded." |

即 **同一语义存在两份英文，措辞不同，其中一份是死代码**。任何未来的 i18n 抽取如果照着常量文件做，抽出来的将是 **用户永远看不到的那一份**。

**（三）文案 owner 视角下"裸串内联"对 i18n 的确切代价**

1. **不可翻译，且不会被发现。** 全仓唯一的翻译覆盖工具（`i18n-coverage` skill）以 `t()` 引用与 `en.json` 为两端做比对。一个从未出现在 `t()` 里的裸串 **不进入任何统计口径** —— 它既不算"缺翻"，也不算"孤儿键"，它在 i18n 视野里不存在。这就是这 7 条串至今没被任何检查捞到的机制。
2. **抽取成本随渲染点扩散。** `PERSIST` 一条已经在 `use_chat_stream.js` 里被引用 6 次（`:4031 :4102 :12013 :12305 :12552 :12663`）。常量化的那部分抽取成本低；已经内联复制的那部分（`:12868 :12873`）需要先做去重决策（选哪一份措辞）才谈得上翻译。
3. **安全约束不与 i18n 冲突。** `context_v2_turn_mutation.js:93-96` 的头注释要求"每一条用户可见串都是固定字面量，绝不携带服务端消息 / 路径 / 载荷片段"。**locale 键完全满足这个要求** —— `t("...")` 返回的同样是固定串，只是查表来源变了。所以"必须是静态串"不构成不进 locale 的理由；今天不进 locale 是历史缺省，不是设计约束。

### E-0038 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/locales/en.json` → `boot.*`；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/boot_locale_parity.test.js:1-120`
- **取得方式**: 当前 checkout 只读检查（dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008（作为可复用先例，非争点事实）
- **完整性限制**: 未在本次庭审中运行该测试。

**本 owner 边界内已经存在一份跑通的四态文案 + 守卫，它就是 Q8 要的形状。**

`boot.*`（en.json）：

```
boot.starting_runtime  = "Starting local services"        ← 进行中
boot.starting_mcp      = "Preparing your plugins"         ← 进行中
boot.taking_longer     = "This is taking longer than usual" ← 慢，但没坏
boot.retry             = "Try again"                       ← 动作
boot.retrying          = "Retrying…"
boot.failure.unchain_runtime_not_found     = "PuPu is missing part of its installation and can't start. Reinstalling usually fixes this."
boot.failure.unchain_runtime_failed        = "PuPu's local services still haven't started. It's still trying — you can wait, or try again."
boot.failure.mcp_environment_unavailable   = "PuPu started, but your plugins aren't ready yet. It's still trying — you can wait, or try again."
boot.failure.unknown                       = "PuPu's local services aren't ready yet. It's still trying."
```

**四条可直接搬到记忆四态的设计属性**

1. **失败按 code 分句，不按"一句兜底"。** 每个 main 侧可发出的 failure code 有自己的一句话，而且句子里 **区分了"你能做什么"** —— `not_found` 说"重装"，`runtime_failed` / `mcp_environment_unavailable` 说"可以等，也可以重试"。对照 E-0032：记忆侧今天的问题正是把一个"重试无效"的态说成了"请重试"。
2. **`unknown` 是显式的第四句，不是空字符串。** 渲染侧对无法识别的 code 有一句可读的话，而不是掉进"什么都不显示"。
3. **code 列表从权威模块 import，不是手抄。** `boot_locale_parity.test.js:39-46`：

```js
const { FAILURE_CODES } = require("../../electron/main/services/boot_readiness/service");
const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];
```

   —— 于是 **main 新增一个 failure code 的那一刻，测试立刻红，直到 11 个 locale 都补上文案为止**。这是全仓唯一一处让"新增状态"不能静默漏翻的机制。
4. **还额外守住了"没真翻译"。** `:106-119` 断言非英语 locale 的 failure 句子 **不得逐字等于英文**，专门抓复制粘贴英文充数。

**与 E-0036 的对照**：全仓 638 个键里，只有 `boot.*` 这 11 个键被这样守着；其余 600+ 键无守卫，实测已经漂出 49 个缺口。**任何新增的记忆四态文案，如果不配一份同形状的对等性测试，会以同样的速度腐坏** —— E-0039 是这条论断的直接实证。

### E-0039 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/hooks/use_chat_stream.js:405-446`（`CUSTOM_PROVIDER_SEND_ERROR_KEYS` 与 `emitCustomProviderSendErrorToast`）；`/Users/red/Desktop/GITRepo/PuPu/src/locales/*.json`；`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/mini_react/use_translation.js:73-91`
- **取得方式**: 当前 checkout 只读检索（`grep -rn "custom_provider_error" src/locales/` 返回 0 行；`python3` 展平 en.json 后筛 `custom_provider` 返回空列表；dev @ `8d7fbd1d`）
- **提交发言**: S-0008
- **支持/反驳**: 支持 S-0008 的「必须配对等性守卫」这一约束；**本身超出本案范围**，作跨案标注
- **完整性限制**: 静态检索。未构造一次真实的 `custom_provider_missing_api_key` 送信失败来目视 toast。**因此"用户会看到 key 字符串"是 INFERENCE，不是实测 FACT。**

**「code → locale 键」这个模式在本仓已经有一处实现，而且它现在是坏的。**

`use_chat_stream.js:414-427` 定义了 3 个送信期错误 code 到 `{title, description}` locale 键的映射，`:434-446` 用 `t()` 渲染成 actionable toast：

```js
custom_provider_missing_api_key -> chat.custom_provider_error.missing_api_key.{title,description}
custom_provider_not_found       -> chat.custom_provider_error.not_found.{title,description}
custom_provider_disabled        -> chat.custom_provider_error.disabled.{title,description}
```

**这 6 个键在 11 个 locale 中的存在数是 0 —— 包括 `en.json`。**

```
grep -rn "custom_provider_error" src/locales/   → 0 行
en.json 展平后含 "custom_provider" 的 key       → []
```

按 `use_translation.js:73-91` 的三级回退（当前 locale → en → **返回 key 本身**），这三种送信失败今天的 toast 标题是字面量 `chat.custom_provider_error.missing_api_key.title` 这样的点分路径字符串。

**它对本案的意义（两条，都是约束不是控诉）**

1. **模式本身是对的，可以直接复用。** 记忆四态若要做成"稳定 code → locale 键 → 可执行文案"，**不需要新架构** —— 同一个文件里已经有这张表和这个 toast 发射器，扩表即可。这降低了 Q4-A/Q4-D 处置的实现门槛。
2. **但它同时证明：没有守卫的 code→键映射会烂，而且烂得毫无声响。** 这张表引用的键从来没存在过，`t()` 静默返回 key，没有测试拦住，`i18n-coverage` 的口径（`t()` 引用 vs `en.json`）本应能捞到它 —— 说明这条检查从未在这批键上跑过或跑过没被处置。E-0038 的 `boot_locale_parity.test.js` 是全仓唯一会红的那种守卫。**任何新增四态文案必须配同形状的守卫，否则默认按本条的下场推定。**

**范围标注**：本条与 Memory 无关，属 custom provider 送信路径，**不在本案范围内**。落点 `src/locales/**` 归本 owner，渲染点 `use_chat_stream.js` 归 `code-owner-chat-core`。建议由 `chief-judge` 决定是另立 case 还是并入某个既有修复批次；本庭无需就它裁定。

### E-0040 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/**/*.js` 全仓字符串检索 `pupu://`
- **取得方式**: 当前 checkout 只读检查。`grep -rn "pupu://" src/ --include="*.js"` 命中 7 个文件，逐一过滤 `.test.js` 后 **非测试文件命中数为 0**。

  命中文件（全部是测试）：
  - `src/COMPONENTs/chat-bubble/memory_v2_journal_reload.performance.test.js`
  - `src/COMPONENTs/chat-bubble/memory_v2_journal_reload.test.js`
  - `src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js`
  - `src/PAGEs/chat/hooks/context_v2_turn_mutation.test.js`
  - `src/PAGEs/chat/hooks/use_chat_stream.turn_mutation_v2.test.js`
  - `src/SERVICEs/chat_storage/chat_storage_memory_v2_trace.test.js`
  - `src/SERVICEs/runtime_events/memory_v2_trace_presenter.test.js`

  注：生产代码中确有 `pupu:\/\/...` 形态的 **正则字面量**（`memory_v2_journal_reload.js:10-21`、`memory_v2_trace_presenter.js:71-78`），因转义斜杠不匹配裸串检索。这一点不改变结论：这些正则是 **校验器**，不是 URI 的产生者或消费者。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 只覆盖 `src/`，不覆盖 `electron/` 与 `unchain_runtime/`。只证明「渲染层没有把 `pupu://` 当作可识别文本词汇来处理」，不证明结构化 `refs` 数组不流动 —— 后者由 E-0042 / E-0044 分别取证。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0041 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js:50-107`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/artifact-summary/generic_artifact_card.js:211-239`（`GenericBody`）、`:241-327`（卡片外壳）、`:178-192`（`RenderLink`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary_sections.js:123-193`
- **取得方式**: 当前 checkout 只读通读全部 8 个非测试文件。
- **内容**:
  1. `ArtifactSummary` 的唯一输入是 `bucket`，其 `bucket.artifacts[]` 元素形状为 `{artifact_id, kind, revision, title, summary, snapshot}`。**没有任何字段是 ref**，代码中不出现 `ref` / `content_ref` / `artifact_ref` 标识符。
  2. `GenericBody`（`generic_artifact_card.js:212`）只读 `artifact.snapshot`，并按 `inferRenderer` 在 markdown / text / table / kv / link / json 之间分派。**全部是同步内联渲染，无 fetch、无 async、无 loading 态、无 error 态。**
  3. 展开动作（`:269` `setExpanded`）只切换本地 `useState`，不发起任何读取。
  4. `RenderLink`（`:178-192`）把 `snapshot.url || snapshot.path` 渲染成 **纯文本 `<div>`**，不是 `<a>`，无 `onClick` —— 即便 artifact 自称是链接也不可点。
  5. 若 `snapshot` 缺失，`GenericBody` 落到 `FallbackText(safeJson({}))`，即在卡片里显示字面量 `{}`。
  6. `PlanCard` / `FilesChangedCard` 同样只消费内联字段（`plan_card.js`、`files_changed_card.js` 通读确认无 ref 词汇）。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 静态代码阅读。未在运行中的应用里观察真实 artifact 卡片（本机 official store `entries=0`，无数据可触发）。不证明 `bucket` 永远不会携带 ref，只证明 **今天的渲染代码不读也不会读**。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0042 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:66-246`（`RefReader`）、`:248-265`（`RefList`）
- **取得方式**: 当前 checkout 只读通读。
- **内容**: **从已披露 ref 打开内容的 UI 机制是存在且完整的**，与 E-0041 的 artifact-summary 面完全无关，位于 Memory V2 审计块内。

  `RefReader` 的实际能力：
  - `:89-94` 调 `contextV2Bridge.readContent({ownerChatId, ref: item.ref, offset, limit: 32 * 1024})` —— 即 `GET /context/v2/content/<ref>`，与 `0000-0001-2026-0807#S-0005` 所述回读端一致。
  - `:157-179` 渲染一个 `read` / `close` 切换按钮（`canRead` 为真时）。
  - `:105-107` 按 `mime_type` 分文本 / 二进制；文本走 `decodeUtf8Base64`，二进制显示 `[Binary content · <mime>]`。
  - `:221-240` 提供 `read next page` 分页续读，显示 `formatBytes(totalBytes)`。
  - `:133-135` 在 ref 下方显示 `kind · mediaType · bytes` 元数据。
  - `:186-219` 内容渲染进 `maxHeight: 260` 的可滚动 `<pre>`。

  `RefList`（`:248-265`）以标题 **"Durable references"** 包裹一组 `RefReader`。
- **提交发言**: S-0009
- **支持/反驳**: **支持** `0000-0001-2026-0807#S-0005` 中「回读端已建成」的部分；同时为 S-0009 提供「差额不是从零建读取通道」的依据。
- **完整性限制**: 只证明代码路径存在。未在运行应用中点击过 `read` 按钮（本机 official store 无数据，且 `enable_memory_v2` 默认 false）。**未证明线上真的发生过一次成功读取。**
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0043 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/chat_bubble.js:107-110`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/trace_chain.js:1928-1945`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:353`、`:417`
- **取得方式**: 当前 checkout 只读检查 + `grep -rn "RefList\|refs" src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js`。
- **内容**: `RefList` 在全仓 **只有两个挂载点**，两个都在 Memory V2 审计块内部：
  - `memory_v2_trace_audit.js:353` — `<RefList refs={audit.refs} …/>`，位于 `MemoryV2ContextAudit`
  - `memory_v2_trace_audit.js:417` — `<RefList refs={run.refs} …/>`，位于单条 agent run 行内

  到达它必须依次通过的门（自外向内）：
  1. `chat_bubble.js:107-108`：`hasMemoryV2Audit = isAssistant && isMemoryV2TraceBundle(message.meta?.bundle?.memory_v2)` —— 助手消息且 bundle 带 `memory_v2` 才可能渲染 trace chain。
  2. `trace_chain.js:1929-1937`：`mergeMemoryV2AuditWithJournal(presentMemoryV2Audit(bundle?.memory_v2, …), …)`，非空才 `grouped.push` 一个标题为 `Memory V2 · <status>` 的节点。
  3. 用户须展开 trace chain。
  4. 用户须再展开该 `Memory V2` 节点。
  5. `refs` 数组须非空（否则见 E-0045）。
  6. `RefReader` 的 `canRead`（`memory_v2_trace_audit.js:76-79`）须为真才出现 `read` 按钮。

  另据 `trace_chain.js` 全文检索，`refs` 标识符在 `trace_chain.js` 中 **零出现** —— trace chain 本身不认识 ref，只是转发 audit 对象。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 静态检索。第 1 道门之外还有 `enable_memory_v2` 默认 false（`code-owner-settings` `0000-0003-2026-0807#S-0005`），该事实由他人出具，本证据未独立复核。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0044 | repository
- **来源定位**:
  - 渲染侧：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:178`（`context.build` 分支）、`:210`（`artifact.recorded` / `handoff.recorded` 分支）
  - 运行时侧：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/memory_v2_unchain_read_adapter.py:152`、`:176`
- **取得方式**: 当前 checkout 只读检查，两侧对读。
- **内容**: **journal reload 的 artifact ref 恢复在生产 active 读适配器上是死代码。**

  渲染侧读法（`memory_v2_journal_reload.js:210`）：
  ```js
  const payload = isObject(event.payload) ? event.payload : {};
  ```
  随后从 `payload.artifact_ref` / `payload.artifact_refs` / `payload.handoff_ref` / `payload.handoff_refs` / `payload.content_ref` 采集（`:212-220`）。

  运行时侧产出（`memory_v2_unchain_read_adapter.py:176`）：
  ```python
  item["event"] = {"type": event.event_type, **payload}
  ```
  payload 被 **摊平进 `event` 顶层**，因此 `event.payload` 恒为 `undefined`，渲染侧取到 `{}`，**采集到零条 artifact ref**。`context.build` 的 checkpoint ref 分支（`:178`）同一失配。

  **对本人既有记忆的更正（2026-08-07）**：本人 memory `memory-v2-trace-contract.md` 曾记载第二重失配「真实 payload 里 ref 是 `unchain.resource_ref.v1` 对象，渲染层只认 `pupu://` 字符串」。**该条已过期**：`memory_v2_unchain_read_adapter.py:152` 现为
  ```python
  payload = _route_json_value(event.payload)
  ```
  而 `_route_json_value`（`:517-530`）配合 `_route_resource_uri`（`:505-515`）确实把 `ResourceRef` 就地翻译成 `pupu://artifact/<id>@<rev>` 等字符串。即 `0000-0001-2026-0807#S-0005` 关于 ref 规范化的陈述 **成立**。两重失配现只剩摊平这一重，但一重即足以令该路径产出为空。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009；**部分反驳** `0000-0001-2026-0807#S-0005` 中「refs 路线已是完整闭环」的整体结论；**支持** 其中关于 ref 规范化的具体陈述。
- **完整性限制**: 静态两侧对读，未在运行的 sidecar 上抓取一次真实 `listEvents` 响应体（本机 official store 无事件可读）。`memory_v2_journal_reload.test.js` 等测试全绿，但其 fixture 使用嵌套 `event.payload` 形状 —— **测试证明的是渲染层代码路径存在，不证明生产适配器会送出该形状**。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0045 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:248-249`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js:55-59`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary_sections.js:145-151`
- **取得方式**: 当前 checkout 只读检查。
- **内容**: **本面对「为空」不存在任何专门呈现 —— 四态中的三态在气泡上塌成同一个「什么都没有」。**

  - `RefList`：`if (!Array.isArray(refs) || refs.length === 0) return null;` —— refs 为空时连 "Durable references" 标题都不出现。
  - `ArtifactSummary`：`if (!isObject(bucket) || bucket.status !== "completed") return null;` 以及 `if (artifacts.length === 0) return null;` —— **bucket 不存在 / bucket 未就绪（status ≠ completed）/ bucket 就绪但为空**，三种情况返回同一个 `null`。
  - `ArtifactSummarySections`：三个来源都空时 `return null`。

  后果：用户无法区分「这轮本来就没产出 artifact」「artifact 还在生成」「artifact 产出了但没送到」。**没有 empty state，没有 pending state，只有缺席。**
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 静态阅读。`bucket.status` 的取值域由 `SERVICEs/runtime_events/activity_tree.js` 产生，不在本人边界内，本证据只主张消费端行为。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0046 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_trace_audit.js:76-79`（`canRead`）、`:120-130`（catch）、`:196-202`（错误渲染）
- **取得方式**: 当前 checkout 只读检查。
- **内容**: **ref 打开失败与「不可打开」两态在气泡上的真实形态。**

  1. **读失败**（`:120-130`）：
     ```js
     error: error && typeof error.message === "string"
       ? error.message.slice(0, 1000)
       : "Content could not be read.",
     ```
     渲染于 `:196-202` 的 `role="alert"` `<div>`，`fontSize: 11`，`color: var(--pupu-danger, #c44)`。即 **把裸异常串直接贴给用户，最长 1000 字符**，无 error code 分类、无重试、无「这是什么失败」的解释。这与 `code-owner-runtime` 在本案 `S-0007` 出具的「读路径失败态回传裸异常串且无 error code」在渲染端形成闭合：后端不分类，前端也不分类，原样转呈。
     兜底串 `"Content could not be read."` 只在 `error.message` 非字符串时出现。

  2. **不可打开**（`:76-79`）：
     ```js
     const canRead = typeof ownerChatId === "string" && ownerChatId.trim().length > 0
       && contextV2Bridge.isAvailable();
     ```
     `canRead` 为假时（`:157` 的条件渲染），`read` 按钮 **整个不渲染**。用户看到的是一条 `fontSize: 10.5`、`opacity ≈ 0.72/0.68` 的等宽 `<code>` ref 字符串，**没有任何提示说明为什么不能打开**。「未就绪」在此处呈现为「一个不可交互的字符串」。

  3. **指向的东西不存在**：`readContent` 抛错后走第 1 条路径 —— 即「不存在」与「读失败」共用同一个裸异常串通道，气泡不作区分。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009；与本案 `S-0007`（`code-owner-runtime`）互相印证。
- **完整性限制**: 静态阅读。未实际触发过一次失败读取，`error.message` 的真实文本内容未观测（本机无数据）。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0047 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/memory_v2_journal_reload.js:254`（refs 计算）、`:500-581`（组件渲染体）、`:483-498`（`mergeMemoryV2AuditWithJournal`）
- **取得方式**: 当前 checkout 只读检查。
- **内容**: `MemoryV2CanonicalJournalReload` **计算 refs 但一条都不渲染**。

  - `finalizeProjection`（`:254`）产出 `refs: Array.from(refs.values()).slice(0, 512)`。
  - 组件本身（`:556-580`）只渲染四样东西：字面标题 `Canonical journal reload`、`projection.status`、`"N pages · M events"`、以及非 Complete/Loading 时的 `reason · errorCode` 串。**渲染体内不出现 `refs`。**
  - refs 唯一的出路是 `onProjection` 回调 → `trace_chain.js:1928` 的 `mergeMemoryV2AuditWithJournal` → 并入 `audit.refs` → 由 `RefList` 渲染（E-0043）。

  即：journal 通道对用户可见面的贡献，在 refs 为空时（E-0044 证明生产上恒为空）**只剩一行状态数字**。该行的四态词汇为 `Loading / Complete / Partial / Unavailable`（`:272`、`:309`、`:365`、`:376`、`:389`、`:505`），是本面唯一显式区分四态的地方 —— 但它描述的是 **journal 扫描本身的状态**，不是记忆或 artifact 的状态。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 静态阅读。`Partial` / `Unavailable` 在真实运行下的出现频率未观测。此处涉及的状态词汇与 `0000-0002-2026-0807` 的 Q1（trace 四态词汇）相邻，本证据 **不主张** 词汇学结论，只登记渲染事实。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0048 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/electron/**` 检索 `pupu://`、`registerSchemesAsPrivileged`、`registerFileProtocol`、`protocol.handle`、`setAsDefaultProtocolClient`
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/markdown/markdown.js`
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/components/seamless_markdown.js`
- **取得方式**: 当前 checkout 只读检索。
- **内容**: **`pupu://` 不是一个可点开的 scheme，任何出现在正文 markdown 里的 ref 都是死链。**

  1. `grep -rn "pupu://" electron/` 只命中 `electron/tests/main/context_v2_service.test.cjs`（测试内的 ref 字面量）。生产 Electron 代码 **零命中**。
  2. `grep -rn "registerFileProtocol|registerSchemesAsPrivileged|setAsDefaultProtocolClient|protocol\.handle" electron/` **零命中** —— 全仓没有注册任何自定义协议 scheme。
  3. `seamless_markdown.js` 与 `BUILTIN_COMPONENTs/markdown/markdown.js` 中未出现 `openExternal`、自定义 `a` 渲染器或 `href` 拦截；`markdown.js` 内 `a` 只出现在一处 CSS hover 规则（`:305`）。

  后果：若模型在正文里写出 `pupu://artifact/x@1`，气泡把它交给默认 markdown 渲染，得到一个 **点击无效果的锚点或纯文本**。ref 的唯一有效打开路径是 E-0042 的 `RefReader` 按钮，那是结构化数据驱动的，与正文文本无关。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 静态检索；未在运行的 Electron 中实际点击一个 `pupu://` 锚点观察行为。不排除 Electron 默认行为把未知 scheme 交给系统处理（macOS 上通常静默失败），该分支未实测。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0049 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/components/message_action_bar.js:20-74`
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/input/button.js:16-33`（`deepMerge`）、`:131`、`:161-168`、`:222`、`:269`、`:334`
  - `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:1133-1136`
- **取得方式**: 当前 checkout 只读检查，逐层追样式合并优先级。
- **内容**: **Q4-D 落在气泡上的切片：blocked 时用户看到的是「四个略微更淡的图标」，无任何解释。**

  1. `chat.js:1133-1136` 把 `stream.isDurableInteractionBlocked || stream.isTurnMutationBlocked` 作为 `disableActionButtons` 传下，经 `chat_messages.js:259-260` 与 `isStreaming` 或运算后进入气泡。
  2. `message_action_bar.js:38-73`：四个按钮（markdown/raw 切换、edit、resend、delete）各自 `disabled={disableActionButtons}`。**四个都是 `prefix_icon` 图标按钮，没有文字标签**，且 **没有 `title`、没有 `aria-label`、没有 tooltip、没有任何解释性文案**。
  3. 视觉差量实测（静态推演）：
     - 调用方传入 `style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}`。
     - `button.js:222` `rootStyle = deepMerge(resolvedStyle.root, stateStyle.root)`；`deepMerge(base, override)` 第二参数胜出（`:16-33`）。
     - disabled 时 `stateStyle.disabled.root = { opacity: 0.4, cursor: "not-allowed" }`（`:131`，经 `:161-168` 合入）。
     - `button.js:334` `style={deepMerge(computedRootStyle, rootStyle)}` —— `rootStyle` 再次胜出，覆盖 `:269` 的 `opacity: disabled ? 0.4 : 1`。
     - **净结果：启用态 opacity 0.5，禁用态 opacity 0.4。**
  4. 整条 action bar 本身 `opacity: hovered ? 1 : 0`（`message_action_bar.js:31`），即 **只有把鼠标悬到那条消息上才看得见这四个图标**。

  合并后：一个被 blocked 的用户，必须先 hover 到某条消息，才能看到四个 14px 单色图标从 0.5 变成 0.4，并在点击时无反应（`button.js:326` `onClick={disabled ? undefined : onClick}`）。`cursor: not-allowed` 是唯一另一处线索。
- **提交发言**: S-0009
- **支持/反驳**: 支持 S-0009
- **完整性限制**: 样式差量为静态推演（沿 `deepMerge` 优先级链逐层计算），**未用运行时截图或计算样式实测**。`isDurableInteractionBlocked` / `isTurnMutationBlocked` 的触发条件属 `code-owner-chat-core` 边界，本证据不主张其语义。
- **验证历史**:
  - S-0009 | 未验证 | 提交时状态

### E-0050 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/memory_vault_bridge.js:1-79`（全文），特别是 `:24-31` deposit、`:36-40` listDescriptors、`:42-46` deleteSecret、`:51-58` grant、`:60-64` revoke、`:66-67` getStatus、`:69-76` 导出对象
- **取得方式**: 当前 checkout（`dev`，工作树）只读全文阅读
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B）

`window.memoryVaultAPI` 的完整能力面，恰好六个方法，每个 payload 逐字段重建：

| 方法 | 入参（allowlist 逐字段重建） | 备注 |
|---|---|---|
| `deposit` | `operationId, scopeKind, scopeId, label, plaintext` | 唯一带明文，仅 renderer→main |
| `listDescriptors` | `scopeKind, scopeId` | 两个字段**无条件转发**（`:38-39` 三元式即使 filter 为 falsy 也发 `undefined`），构造不出「列全库」形态 |
| `delete` | `operationId, handle` | 导出名 `delete`，内部 `deleteSecret` |
| `grant` | `operationId, scopeKind, scopeId, handle, sinkKind` | 无 `grantee` 自由字符串字段 |
| `revoke` | `operationId, grantId` | **只吃 grantId** |
| `getStatus` | 无参 | — |

`:5-7` 的注释逐字写明「There is deliberately NO read/resolve/decrypt method」。**面上不存在任何 grant 枚举方法**（`listGrants` / `getGrants` / `listSinks` 均不存在于导出对象）。

- **完整性限制**: 只覆盖 preload 这一跳的调用形状；main 侧的校验与返回形状另见 E-0051 / E-0052。renderer 侧 `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/memory_vault_bridge.js` 属 `code-owner-shared-arteries` 边界，本条不作认定。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0051 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/service.js:109`（`SCOPE_KINDS`）、`:501-521`（`validateScopeKind` / `validateScopeId`）、`:2081-2118`（`listDescriptors` 全文）、`:2149-2207`（`grant` 全文）、`:2282-2302`（`getStatus`）
- **取得方式**: 当前 checkout 只读阅读
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B 问题 1）

**确切签名与返回形状：**

```
SCOPE_KINDS = ["chat", "user"]                                  // :109
scopeId 校验: /[A-Za-z0-9_.:-]/ 长度 1-128，且 !== "__proto__"   // :509-518

listDescriptors({ scopeKind, scopeId })  // 两者皆必填，`=` 精确匹配，绝无 LIKE/前缀
  -> { ok: true, descriptors: [
        { handle, scopeKind, scopeId, label, createdAt, updatedAt, grantCount } ] }
     ORDER BY created_at, handle                                 // :2095-2117

grant({ operationId, scopeKind, scopeId, handle, sinkKind })
  -> { ok: true, grantId, handle, scopeKind, scopeId, sinkKind, createdAt }  // :2196-2204
     handle 不属于该 exact scope -> secret_not_found（与不存在同码）        // :2183-2189

getStatus()  -> { ok, available, secretStorageStatus } (+ 不可用时 reason)  // :2288-2302
     注释 :2282-2287 明写「deliberately reports NO database row counts」
```

**关键形状事实**：`descriptors[].grantCount` 是一个 `COUNT(*)`（SQL 见 `:2099-2100`）—— 界面能显示「这条凭据有 3 个授权」，但**拿不到这 3 个授权的 `grantId`，也拿不到它们的 `sinkKind`**。

- **完整性限制**: `revoke` / `deleteSecret` 另见 E-0052。未在运行中的 app 上实际调用这些方法（本机 vault 状态未取证）。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0052 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/service.js:2209-2226`（`revoke` 全文）、`:2120-2147`（`deleteSecret` 全文）、`:2326-2348`（service 导出对象）；以及对该文件 `FROM vault_grants` 的穷举
- **取得方式**: 当前 checkout 只读阅读 + 穷举 grep
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B 问题 2 —— **本条是「不能支撑」的直接证据**）

`grep -n "FROM vault_grants" service.js` 在整个 vault service 里只有 **6 处命中**，逐一分类：

| 行 | 语句 | 可达性 |
|---|---|---|
| 961 | `SELECT grant_id ... ` | `prepareUseIntent` 闭包内，**main 内部 sink 路径**，不导出 |
| 1077 | `SELECT grant_id ... ` | `executeUseIntent` 闭包内，同上 |
| 1953 | `SELECT g.grant_id ... ` | `ensureGrantsSchema()` 整表重建，**init 期** |
| 2099 | `SELECT COUNT(*) ...` | `listDescriptors` 的 `grantCount` 子查询 —— **只出数字** |
| 2135 | `DELETE ... WHERE handle = ?` | `deleteSecret` 级联 |
| 2222 | `DELETE ... WHERE grant_id = ?` | `revoke` |

**结论：整个 main 侧不存在任何按 handle / scope 枚举 grant 行的读方法，且 service 导出对象（`:2326-2348`）里也没有。**

因此：

```
revoke({ operationId, grantId })   // :2212-2226，grantId 必填，validateGrantId 强制 /^pvg1_[0-9a-f]{32}$/
```

`grantId` 在系统里**只被返回过一次** —— `grant()` 成功那一刻（E-0051）。之后没有任何 IPC 形态能把它再取回来。**一个管理界面若未在授权当刻自行持久化 grantId，`revoke` 对它就是不可调用的。**

`deleteSecret({ operationId, handle })` → `{ ok, handle, deleted: bool, revokedGrants: number }`（`:2140-2145`）是**唯一**能间接清掉 grant 的路径，粒度是整条凭据（FK `ON DELETE CASCADE` 是权威保证）。

- **完整性限制**: 未覆盖 `vault_use_intents` / `vault_use_receipts` 两表的可读性（那是 sink 执行审计，同样无 IPC 读方法）。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0053 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/shared/channels.js:105-119`（`MEMORY_VAULT`）、`:120-177`（`CONTEXT_V2`，成文硬边界在 `:127-145` 与 `:161-173`）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/register_handlers.js:8-15`
- **取得方式**: 当前 checkout 只读阅读；`artifact` 在 `electron/shared/channels.js` 与 `electron/preload/bridges/*.js` 全域 grep **零命中**
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B 问题 3、Q7）

**vault channel 现状清单 —— 恰好 6 条，全部 invoke/handle，无 event 通道、无 sync 通道**：

```
memory-vault:deposit            memory-vault:list-descriptors
memory-vault:delete             memory-vault:grant
memory-vault:revoke             memory-vault:get-status
```

`register_handlers.js:8-15` 的 `MEMORY_VAULT_INVOKE_CHANNELS` 是同一份冻结清单（parity 测试锁死）。

**成文硬边界（`:127-145`）逐条抄录要点**：`NO generic method/path/url/fetch channel — every capability the renderer has is one named channel with a fixed Flask route`；`the unchain auth token, the sidecar port and any filesystem path never cross these channels`；`Internal-only Flask surface ... deliberately NOT represented here`。该段虽写在 `CONTEXT_V2` 头上，但 `MEMORY_VAULT` 头 `:106-112` 是同构表述（`NO read/resolve/decrypt channel`）。

**Q7 相关**：`artifact` 一词在 `electron/shared/channels.js` 与全部 preload bridge 文件中 **零命中** —— `listArtifacts` 今天在本层**完全不存在**，不是「有通道没 UI」，是「连通道都没有」。

- **完整性限制**: 未核 `.cjs` 孪生测试文件里的清单是否与本清单逐字一致（本轮只读，未跑测试）。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0054 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/service.js:29-35`（存储位置注释）、`:47-58`（handle/grantId 格式）、`:163-175`（`vault_secrets` 建表 SQL + 索引）、`:2052-2054`（deposit 前 fail-closed 加密）、`:2120-2147`（`deleteSecret` 硬删）
- **取得方式**: 当前 checkout 只读阅读；对该文件 `expires|expiry|ttl|TTL` 穷举 grep
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B 问题 4 —— 「界面能诚实告诉用户什么」）

**落盘位置**：`userData/settings.db`（WAL），与 settings **共文件、独立连接**（经 `createSettingsDb`），vault 只拥有 `vault_*` 五张表；`settings_storage.resetSettings` 不清 vault（`:29-35`）。**不是 keychain、不是独立文件、不是内存。**

**明文形态**：`vault_secrets.ciphertext` 是 `BLOB NOT NULL`，由 Electron `safeStorage` 加密（`:2054` `encryptPlaintext` 在任何写入之前调用，safeStorage 不可用即 fail closed，不落行、不落 receipt）。macOS 下 safeStorage 密钥由系统 keychain 托管 —— **凭据本体在 sqlite，密钥在 keychain**。

**建表 SQL 全字段（`:163-171`）**：

```sql
CREATE TABLE IF NOT EXISTS vault_secrets (
  handle TEXT PRIMARY KEY, scope_kind TEXT NOT NULL, scope_id TEXT NOT NULL,
  label TEXT NOT NULL, ciphertext BLOB NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
```

**没有 `expires_at`，没有 `revoked_at`，没有 `status` 列。**`expires|ttl` 在本文件的全部命中（`:66, :204, :1009, :1239, :1251, :1270, :1334, :1464, :1591`）**无一属于 `vault_secrets`** —— 它们全是 `vault_use_intents` 的 10 分钟 use-intent TTL。

**结论三条，界面可以诚实陈述**：
1. **凭据无 TTL，永不自动过期。**
2. **删除是真删**（`DELETE FROM vault_secrets WHERE handle = ?`，`:2138`），不是标记；grant 由 FK `ON DELETE CASCADE` 同事务消失，只留非密 receipt。
3. `label` 是唯一明文列，且 deposit 时被 `containsAnyVariant` 拒绝内嵌明文（`:2046-2051`）—— 界面显示 label 是安全的。

- **完整性限制**: 未在本机实际打开 `settings.db` 核对表结构（只读代码取证）；Linux/Windows 的 safeStorage 后端差异未在本条覆盖。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0055 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/memory_vault/service.js:1813-1819`（注释）、`:1820-1860`（`deleteUseStateForOwnerChat` 全文）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/chat_storage/deletion_outbox.js:310-325`（唯一调用点）；`DELETE FROM vault_secrets` 在整个 vault service 的**唯一**命中 `service.js:2138`
- **取得方式**: 当前 checkout 只读阅读 + 穷举 grep
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q4-B —— **孤儿凭据类**）

删除一个 chat 时，durable deletion outbox 对 vault 做的**唯一**动作是 `deleteUseStateForOwnerChat(ownerChatId)`。该函数的成文注释（`:1813-1817`）逐字写着：

> Vault-use state is audit metadata, not the secret itself: deleting it must **never cascade into vault_secrets or vault_grants**.

函数体（`:1844-1852`）只 DELETE 两张表：`vault_use_receipts`、`vault_use_intents`。

同时 `DELETE FROM vault_secrets` 在全服务只有 **一处**（`:2138`），位于 `deleteSecret(payload)` 内，**必须提供 `handle`**。

**推导出的孤儿类（本条只陈述机制，不作价值判断）**：一条 `scopeKind:"chat"` 的凭据，其 `scope_id` 是被删 chat 的 id。chat 删除后：
- 该 scopeId 不再出现在任何会话列表里 → 任何界面都构造不出 `listDescriptors({scopeKind:"chat", scopeId})` 的入参；
- 拿不到 descriptors 就拿不到 `handle` → `deleteSecret` 也不可调用。

净效果：**该密文行在 `settings.db` 里永久驻留，且今天的 IPC 面上没有任何调用序列能列出它或删除它。**这一条与「有没有 UI」无关 —— 任何 UI 设计都到不了。

- **完整性限制**: 未实测（本机 vault 行数未取证，见本庭已知缺口 1）。未核查 `chat` 之外 `user` scope 是否也有孤儿路径（`user` scope 的 scopeId 取值集合未在本轮确定，见 S-0010 不确定性）。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0056 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:14-20`（`MEMORY_V2_ENV_KEYS`）、`:150`（`storeOwner` 赋值）、`:165-171`（`sidecarEnvironment` 冻结对象）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:4745`（`sidecarEnvironment = {...process.env}`）、`:4758-4763`（spawn 的 env 展开顺序）、`:4805-4808`（`storeOwner` 显式覆写）
- **取得方式**: 当前 checkout 只读阅读
- **提交发言**: S-0010
- **支持/反驳**: **反驳** `0000-0003-2026-0807#S-0007` 的「`pupu_legacy` 是现网行为」判断；支持 `0000-0003-2026-0807#S-0005`（E-0008）的取值集合判断

**机制（追加问题 A 的直接答案）：**

1. 环境变量名 `PUPU_CONTEXT_V2_STORE_OWNER`（`memory_v2_rollout.js:19`）。
2. 取值集合是**二元的**：`memory_v2_rollout.js:150` 逐字为
   ```js
   const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";
   ```
   —— **代码路径上不存在产出 `pupu_legacy` 的分支**（该字符串在 `electron/` 生产代码全域零命中，与本 owner 记忆里 `0000-0002-2026-0807#E-0024` 的结论一致）。
3. **它是无条件写入的，不是「有则传」**：`service.js:4805-4808` 把该键写在 spawn 的 `env` 字面量里，而 `...sidecarEnvironment`（即 `{...process.env}`，`:4745`）展开在 **前面**（`:4763`）。因此**开发者 shell 里预置的同名环境变量会被覆写**，不可能透传。
4. `resolvedRolloutMode` 由 `effectiveMode(featureCeiling, configuredMode)` 取二者较小秩得出（`:78-86`, `:141`），两者又都受 `featureEnabled` 门控（`:135-140`）：`featureEnabled` 为 false 时**两者强制为 `"off"`**，故 `resolvedRolloutMode === "off"`，故 `storeOwner === "off"`。

**结论**：只要 sidecar 是由 Electron 主进程 spawn 的（打包产品的唯一形态），`memory_v2_store_boundary.py` 的「环境变量缺失 → `pupu_legacy`」回退分支 **结构性不可达**。`pupu_legacy` 只在 sidecar 被独立启动时可达（`cd unchain_runtime/server && python main.py`，或 pytest / `test_client()` 探针 —— 即 `0000-0003-2026-0807#E-0020` 的取证环境）。

- **完整性限制**: 本条只认定 **Electron 传什么**。Python 侧收到 `"off"` 后如何解释，属 `code-owner-runtime` 边界，本条不作认定。未覆盖用户手工设置系统级环境变量后再启动 PuPu 的情形 —— 由第 3 点，仍会被覆写，但未实测。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0057 | repository
- **来源定位**: 构建产物 `/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json`（全文，2026-08-03 22:23 生成，789 字节）与 `/Users/red/Desktop/GITRepo/PuPu/.local/build_feature_flags.snapshot.json`（全文，2026-08-04 17:20，273 字节）；读取逻辑 `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:210-309`（`resolveMemoryV2ReleaseConfig`）
- **取得方式**: 当前 checkout 只读读取两个文件 + `git ls-files --error-unmatch`
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（追加问题 B）；支持 `0000-0003-2026-0807#S-0005` 的不确定性第 3 条**取「假」那一侧**

**打包读取路径产物 `build/build_feature_flags.json` 的实际内容（关键三行）：**

```json
"enable_memory_v2": false,
"_pupu_memory_v2_release": {
  "sidecar_environment": { "PUPU_FEATURE_MEMORY_V2": "off", "PUPU_MEMORY_V2_MODE": "off",
                           "PUPU_CONTEXT_V2_STORE_OWNER": "off" },
  "rollout_fingerprint": "0a528682…", "snapshot_fingerprint": "1c3298ac…" }
```

**该文件不受 git 跟踪**（`git ls-files --error-unmatch build/build_feature_flags.json` → `did not match any file(s) known to git`），是构建输出；生产者是 `/Users/red/Desktop/GITRepo/PuPu/scripts/build-web.cjs:15,20` —— **属 `code-owner-devtools` 边界，本条不认定其取值来源**。本条只认定：**本机这份已生成的产物里 `enable_memory_v2` 为 `false`，且其内嵌 release 块已把 store owner 固化为 `"off"`。**

**开发读取路径 `.local/build_feature_flags.snapshot.json` 里 `enable_memory_v2` 为 `true`，但整个文件没有 `_pupu_memory_v2_release` 字段。**代入 `:261-266`：非打包态 `sidecarEnvironment` 为 `{}`、`allowProcessOverrides = !app.isPackaged = true` → `featureCeiling` / `configuredMode` 全部落到 `process.env` 的 `PUPU_FEATURE_MEMORY_V2` / `PUPU_MEMORY_V2_MODE`；这两个变量在一次普通 `npm start` 里未设置 → 双双 `normalizeMode(undefined, "off") = "off"` → `effectiveMode = "off"` → **`storeOwner = "off"`**。

即：**打包态与开发态的默认 store owner 都是 `"off"`，二者殊途同归。**

- **完整性限制**: 本机这份 `build/` 产物是 2026-08-03 的一次本地构建，**不等于任何已发布 release 的产物**；要断言「已发布的 0.1.x 安装包里也是 false」，需要 `code-owner-devtools` 从发布流水线或安装包内取证。本条不作此断言。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0058 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:182-190`（`createContextV2Error`）、`:1733-1783`（`readJsonResponse`）、`:1889-1940`（`contextV2Request`）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/ipc/register_handlers.js:632-677`（CONTEXT_V2 1:1 绑定表 + 转抛）；`/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/bridges/context_v2_bridge.js:57`（renderer 侧解析器）
- **取得方式**: 当前 checkout 只读阅读
- **提交发言**: S-0010
- **支持/反驳**: **反驳** 「IPC 层把服务端多态压平了」这一假设（Q8/Q2/Q5）

**四跳逐跳形状（以 `get_session_head` 的 400/404/503 为例）：**

1. **HTTP → main**：`readJsonResponse:1740-1771` 解析 `parsed.error.code`，非空则 `error.code = errorCode`。三种 HTTP 状态的三个不同 code（`context_v2_invalid_request` / `context_v2_not_found` / `context_v2_generation_store_unavailable`，见 `0000-0003-2026-0807#E-0020`）**全部被取出**。
2. **main 归一化**：`contextV2Request:1931-1938` 保留该 code，丢弃上游 message（上游 message 会带 sqlite 绝对路径 / Traceback），重新包成 `createContextV2Error(code, "context v2 request failed")`。
3. **跨 `ipcMain.handle`**：`service.js:182-184` 的注释逐字说明了机制 —— 「the stable code rides in the message behind a `"[<code>] "` prefix (**Electron strips error.code across ipcMain.handle**) AND stays on `.code` for main-process callers」。`register_handlers.js:665-676` 只 `console.warn(method, code)` 后**原样 `throw error`**，不吞、不改形、不转成 null/false。
4. **renderer 复原**：`src/SERVICEs/bridges/context_v2_bridge.js:57` 存在 `ERROR_CODE_TOKEN_PATTERN = /\[([a-z0-9_]+)\]\s/`，把 code 从 message 里取回。

**结论：CONTEXT_V2 这条路上 stable code 端到端不丢，三种服务端状态在 renderer 侧可区分。**

**200 载荷同样不被压平**：`service.js:357-395` 的 `contextV2SessionHeadResponse` 逐字段重建后返回 `{ ownerChatId, sessionId, admissionMode, targetMode, bootstrapStatus, bootstrapErrorCode, v2Bootstrapped, sticky, sessionExists, mutationReady, currentGenerationId, currentGenerationNo, sessionRevision }` —— `0000-0003-2026-0807#E-0020` 点名的第二判别轴 `mutation_ready` / `session_exists` / `sticky` **三个都在**。

**唯一一处主动收窄**（不是丢弃，是保守 AND，`:386-389`）：
```js
mutationReady: payload?.mutation_ready === true && sessionExists && Boolean(currentGenerationId)
```
后果：后端「`mutation_ready:true` 但无 `current_generation_id`」这一自相矛盾态，到 renderer 变成 `mutationReady:false`，与后端本就为 false 不可区分。

- **完整性限制**: `src/SERVICEs/bridges/context_v2_bridge.js` 属 `code-owner-shared-arteries` 边界，本条引用它只为证明「main 侧那个 `[code]` 前缀在下游确有消费者」，不对该文件其余行为作认定。未在运行中的 app 上实测这四跳。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0059 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/service.js:3572-3585`（`getMisoMemoryProjection` 的 fetch + `readJsonResponse` 调用）、`:3587-3604`（`getMisoLongTermMemoryProjection`）、`:1740-1771`（`readJsonResponse` 的错误分支）；`/Users/red/Desktop/GITRepo/PuPu/electron/main/ipc/register_handlers.js:516-522`（两个 handler，**裸 async 无 try/catch**）；`/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/unchain_bridge.js:133-136`
- **取得方式**: 当前 checkout 只读阅读；对 `src/SERVICEs/bridges/` 全域 grep `\[` 正则转义，命中 3 个文件（`context_v2_bridge.js:57` / `memory_vault_bridge.js:75` / `settings_storage_bridge.js:110`），**`unchain_bridge.js` 不在其中**。无运行时取证
- **提交发言**: S-0010
- **支持/反驳**: 支持 S-0010（Q8 —— `/memory/projection` 失败态那一半）

`/memory/projection` 与 `/memory/long-term/projection` **不走 `contextV2Request`**，直接 `fetch` + `readJsonResponse`，因此**完全绕过 CONTEXT_V2 的错误归一化**（E-0058 第 2 步）。逐跳后果：

| 后端返回 | main 抛出的 Error | renderer 收到 |
|---|---|---|
| 有 `error.code` 的 JSON | `message = "<code>: <message>"`，`error.code = <code>` | code 被 Electron 剥掉；message 里是 `code: msg` 形态，**无 `[code]` 方括号**，`unchain_bridge` 无解析器 → **拿不到 code** |
| 裸异常串 / 无 code 的 JSON（`code-owner-runtime` 出具的现状） | `message = <上游原文>`，**`error.code` 根本不设置**（`:1768` 条件不成立） | **上游原始异常文本原样落到 renderer**，无 code、无前缀 |
| 空 body | `message = "Miso memory projection request failed (503)"` | HTTP 状态码只以自然语言字符串形式存在 |
| JSON 解析失败 | `message = bodyText.slice(0, 200)` | 上游正文前 200 字节原样落到 renderer |

`register_handlers.js:516-522` 两个 handler 是裸 `async (_event, payload) => unchainService.getMisoMemoryProjection(payload.sessionId)`，**无 try/catch、无日志、无归一化**。preload `unchain_bridge.js:133-136` 也是裸 `ipcRenderer.invoke`。

**两条结论**：
1. **压平方向反了** —— 这条路不是把多态压成一个值，而是**一个自由格式字符串**，renderer 无法据以分支，四态里的「失败」与「未就绪」在此不可区分。
2. **同时是一处泄漏面**：`contextV2Request` 之所以丢弃上游 message，成文理由是「后端 message 会带 sqlite 绝对路径和 Traceback」（本 owner 记忆中的 P0 契约）。**projection 路径没有这道处理**，上游 Traceback 与绝对路径会直达 renderer。建议 `expert-security` 评估。

- **完整性限制**: 未实测触发一次真实 projection 失败（本机 official store `entries=0`，见本庭已知缺口 1）。表中第 2 行「裸异常串」这一前提引自 `code-owner-runtime` 的出具，本 owner 未独立验证 Flask 侧返回体。
- **验证历史**:
  - S-0010 | 未验证 | 提交时状态

### E-0060 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/ui-testing/ui_testing_modal.js:24-38`（组件注册表）、同文件 `:121`（唯一的 `memory` 命中）
- **取得方式**: 当前 checkout 只读检查 + `grep -rn -i "memory" src/COMPONENTs/ui-testing/ src/SERVICEs/test_bridge/ src/PAGEs/demo/`
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（Q3 第 1 问）
- **完整性限制**: 仅覆盖 `pupu:src/COMPONENTs/ui-testing/**`、`pupu:src/SERVICEs/test_bridge/**`、`pupu:src/PAGEs/demo/**` 三处边界内目录；未扫描 `e2e/`、`scripts/`。

**内容**

UI Testing modal 的组件注册表今天共 5 项，全部与 Memory 无关：

```
{ key: "interject",           label: "Interject",          runner: InterjectRunner }
{ key: "trace_chain",         label: "TraceChain",         runner: TraceChainRunner }
{ key: "code_diff_interact",  label: "CodeDiffInteract",   runner: CodeDiffInteractRunner }
{ key: "artifact_summary",    label: "ArtifactSummary",    runner: ArtifactSummaryRunner }
{ key: "toast",               label: "Toast",              runner: ToastRunner }
```

议案提到的 `grep` 命中，全文只有一处，是一行注释：

```
121:  /* ── glass tokens (memory-inspect / recipes_page parity) ── */
```

即：它指的是 **视觉 token 与 `memory-inspect` 保持一致**，不是 Memory 功能。

`src/SERVICEs/test_bridge/` 内唯一命中同样是注释（`chat_storage_adapter.js:154`，描述 character chat 的耦合身份）。`src/PAGEs/demo/` 零命中。

**结论**: UI Testing modal 与整个 devtools 边界内的可交互面，**今天没有任何 Memory / Memory V2 内容**，一行都没有。

### E-0061 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/ui-testing/runners/`（5 个 runner）、`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/ui-testing/scenarios/`（`trace_chain_scenarios.js` 27,488 B、`toast_error_scenarios.js` 7,422 B）
- **取得方式**: 当前 checkout 只读检查 + `grep -rn "import .*from" src/COMPONENTs/ui-testing/runners/*.js | grep -iE "bridge|api\.|SERVICEs"`
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（Q3 第 2 问的形态判断）
- **完整性限制**: 只核对了 5 个 runner 的顶层 import；未逐行确认 runner 内部是否存在动态 `import()`。以静态 import 为准。

**内容**

5 个 runner 的全部外部依赖（去掉 React / BUILTIN_COMPONENTs / 本目录内引用后）：

```
toast_runner.js:5        import { toast } from "../../../SERVICEs/toast";
interject_runner.js:3    import { toast } from "../../../SERVICEs/toast";
trace_chain_runner.js:15 import { createRuntimeEventStore }        from ".../runtime_events/event_store";
trace_chain_runner.js:16 import { reduceActivityTree }             from ".../runtime_events/activity_tree";
trace_chain_runner.js:17 import { adaptActivityTreeToTraceChain }  from ".../runtime_events/trace_chain_adapter";
```

**没有任何 runner 引用 `SERVICEs/bridges/*`、`api.*`、`window.*API`，或发起网络请求。**

最复杂的 `TraceChain` runner 也不是活取数据：它把 `scenarios/trace_chain_scenarios.js`（27 KB 手写场景）里的合成帧灌进 **纯 reducer**（`event_store` → `activity_tree` → `trace_chain_adapter`），渲染其输出。`Toast` runner 同理消费 `scenarios/toast_error_scenarios.js`。两个 scenarios 文件各自带 `.test.js`。

**结论**: 这个面的既定形态是 **fixture 驱动的纯渲染样机**，不是活体诊断台。它的价值在于「不用复现后端状态就能把难态并排看一遍」。加一个联网诊断面板对它是一个 **新的能力类别**，不是增量。

### E-0062 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/dev/storage.js:16-26`、`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/dev/index.js:15,234`、`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/settings_modal_content.js:68-70`
- **取得方式**: 当前 checkout 只读检查 + `grep -rn "UITestingModal\|ui_testing_modal" src --include="*.js"`
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（Q3 第 2、4 问）
- **完整性限制**: `src/COMPONENTs/settings/**` 属 `code-owner-settings` 边界，此处仅作只读引用以确定本端组件的挂载条件，不主张对该文件的处置。

**内容**

`UITestingModal` 在 `src` 内 **只有一个挂载点**：`src/COMPONENTs/settings/dev/index.js:234`（`DevSettings` 页内）。其余命中均在测试文件。

`DevSettings` 这一页是否出现在 Settings 侧栏，由 `settings_modal_content.js:68-70` 决定：

```
if (isDevSettingsAvailable()) {
  pages.push(DEV_SETTINGS_PAGE);
}
```

而 `isDevSettingsAvailable`（`dev/storage.js:16-26`）逐字为：

```js
export const isDevSettingsAvailable = () => {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.runtime?.isElectron === true;
};
```

`ui-testing/` 目录内自身 **零** `NODE_ENV` / `isDev` 判断 —— 门禁完全在上游这一处。

**结论**: UI Testing modal 只在 `NODE_ENV === "development"` 且跑在 Electron 里时才可达。**它在任何打包产物里都不存在**（CRA 生产构建下 `NODE_ENV === "production"`）。

### E-0063 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/package.json:40`、`/Users/red/Desktop/GITRepo/PuPu/scripts/start-dev.cjs:119-125`、`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/unchain/memory_v2_rollout.js:135-141,150,261-266`
- **取得方式**: 当前 checkout 只读检查（未启动应用，未跑构建）
- **提交发言**: S-0011
- **支持/反驳**: **限缩** E-0056（`code-owner-electron` S-0010）在本端语境下的适用范围；支持 S-0011（Q3 第 4 问）
- **完整性限制**: 这是从代码路径推出的静态结论，**未实测**一次 dev 启动后的 `/context/v2/status` 实际返回。`electron/**` 属 `code-owner-electron` 边界，此处只读引用其解析函数，不主张处置。

**内容**

E-0056 认定：打包产品里 `PUPU_CONTEXT_V2_STORE_OWNER` 恒为 `"off"`，Context V2 读一律 404。本端核对后确认该结论 **成立于 packaged 分支，且只成立于 packaged 分支**。

三条链路：

1. `package.json:40` — dev 入口自带 env：
   `"start:electron": "cross-env PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all PUPU_MEMORY_V2_ALLOW_DIRTY_UNCHAIN_ACTIVE_DEV=1 node ./scripts/start-dev.cjs"`
2. `scripts/start-dev.cjs:119-125` — 该 env 原样透传给 Electron：
   `spawn(electronBinary, ["."], { env: { ...process.env, ELECTRON_START_URL: devServerUrl } })`（**没有** 在展开之后覆写任何 `PUPU_*MEMORY_V2*` 键）
3. `memory_v2_rollout.js:261-266` — 解析时：
   `allowProcessOverrides: !app.isPackaged`
   即 **非打包时 process env 压过 snapshot**；`:135-141` 据此得 `featureCeiling="all"`、`configuredMode="all"`，`:150` 得
   `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";` → **`"unchain"`**

**结论**: 在 UI Testing modal **唯一存在的环境**（dev + Electron，见 E-0062）里，store owner 是 `"unchain"` 而非 `"off"`，E-0056 的「对所有输入返回同一个 404」**不成立**。

这不是替 live 面板辩护，而是把否定它的理由换成更强的一条：一个 live 诊断面只存在于 store owner 已经开着的 dev 机器上，**它照见的永远是健康态**，对打包产品里那个 404 一无所知。

### E-0064 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/scripts/build-web.cjs:11-21,30-49,52-57,70-90`、`/Users/red/Desktop/GITRepo/PuPu/package.json:48,55`、`/Users/red/Desktop/GITRepo/PuPu/.gitignore:20,51`
- **取得方式**: 当前 checkout 只读检查 + `git check-ignore -v .local/build_feature_flags.snapshot.json build/build_feature_flags.json` + `git ls-files | grep -E "build_feature|\.local/"`（返回空）
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（追加问题 A）
- **完整性限制**: 描述的是 **构建期** 链路。运行期 Electron 侧如何再读该文件属 `code-owner-electron`，见 E-0065 的引用。

**内容**

**构建路径（唯一一条）**。所有 `build:electron:*` 目标最终都经 `build:web`：

```
package.json:55  build:electron:mac → ... "npm run build:unchain:mac && npm run build:web && npm run notices:check && electron-builder --mac --arm64"
package.json:48  build:web          → npm run version:prepare-build && node ./scripts/build-web.cjs
```

`build-web.cjs` 的行为：

```
:12-16  SNAPSHOT_PATH         = <root>/.local/build_feature_flags.snapshot.json
:17-21  RUNTIME_SNAPSHOT_PATH = <root>/build/build_feature_flags.json
:30-49  读 SNAPSHOT_PATH；不存在 → normalizeFeatureFlags({}) （全部 false）
:52-53  buildFeatureFlags = 上述结果；serializedFlags = JSON.stringify(...)
:70-77  spawnSync(react-scripts/scripts/build.js, { env: { ...process.env,
            REACT_APP_BUILD_FEATURE_FLAGS: serializedFlags } })
:84-90  构建成功后写 RUNTIME_SNAPSHOT_PATH
```

**两个文件都不入库。** `git check-ignore -v` 逐字返回：

```
.gitignore:20:/.local/	.local/build_feature_flags.snapshot.json
.gitignore:51:build/	build/build_feature_flags.json
```

`git ls-files | grep -E "build_feature|\.local/"` 返回 **空**。

**CI 不产出正式安装包。** `.github/workflows/` 只有 4 个 workflow；唯一构建包的是 `release-qa.yml:312-321`，且四个目标全是 `*:unsigned`（`build:electron:mac:unsigned` / `:mac:intel:unsigned` / `:win:unsigned` / `build:electron:linux`）。CI runner 上 `.local/` 不存在（未入库），故 CI 产物一律走 `normalizeFeatureFlags({})` 全 false 分支。

**结论**: 每一个正式安装包的 feature flag 值，来自 **一个不入库、不入 CI、只存在于构建者本机的文件**。仓库里没有任何东西能证明某个已发布包用的是哪组 flag —— 这条链路上没有可审计的锚点。

### E-0065 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/.local/build_feature_flags.snapshot.json`（mtime 2026-08-04 17:20）、`/Users/red/Desktop/GITRepo/PuPu/build/build_feature_flags.json`（mtime 2026-08-03 22:23）、`/Users/red/Desktop/GITRepo/PuPu/scripts/build-web.cjs:51-62`
- **取得方式**: `ls -la` 取 mtime；`node ./scripts/build-web.cjs --print-flags` —— **该分支在 `spawnSync` 与任何写盘之前 `process.exit(0)`（`build-web.cjs:59-62`），只打印不构建、不落盘**，故满足只读约束
- **提交发言**: S-0011
- **支持/反驳**: **部分反驳** E-0057（`code-owner-electron` S-0010）在时效上的读法；支持 S-0011（追加问题 A）
- **完整性限制**: 「下一次构建会烤进 true」是对 `build-web.cjs` 代码路径的推断，**未实际跑构建**（跑构建会写盘，违反本庭只读约束）。渲染层与 sidecar 取值分叉一节同属推断。

**内容**

**本机当前两份快照不一致，且不同代。**

`build/build_feature_flags.json`（2026-08-03 22:23，E-0057 引的就是它）：
```json
{ ..., "enable_memory_v2": false, "_pupu_memory_v2_release": {
    "sidecar_environment": { "PUPU_CONTEXT_V2_STORE_OWNER": "off", ... } } }
```

`.local/build_feature_flags.snapshot.json`（2026-08-04 17:20，**比上者晚 19 小时**）：
```json
{ "enable_user_access_to_agents": true, "enable_user_access_to_characters": false,
  "enable_app_update_settings": false, "enable_theme_color_customization": true,
  "enable_custom_model_providers": false, "enable_computer_use": false,
  "enable_memory_v2": true }
```

**只读实测**，`node ./scripts/build-web.cjs --print-flags` 当前返回：
```json
{"enable_app_update_settings":false,"enable_computer_use":false,"enable_custom_model_providers":false,"enable_memory_v2":true,"enable_theme_color_customization":true,"enable_user_access_to_agents":true,"enable_user_access_to_characters":false}
```

这正是会被注入 `REACT_APP_BUILD_FEATURE_FLAGS` 的字节串。

**推断（未执行构建）**: 现在从本机跑 `npm run build:electron:mac`，渲染层会拿到 `enable_memory_v2: true`。而 `build-web.cjs:54-57` 另算的 `runtimeSnapshot = createBuildFeatureSnapshot(buildFeatureFlags, process.env)`，其 sidecar env 取自 `source._pupu_memory_v2_release.sidecar_environment` —— `.local` 这份 **没有该字段**，且 `build:electron:mac` 链路上 **没有** 设置 `PUPU_FEATURE_MEMORY_V2` / `PUPU_MEMORY_V2_MODE`（对照 `package.json:40` 的 dev 入口，那里才有），故 `effectiveMode` 落到 `"off"`、`storeOwner` 落到 `"off"`（`memory_v2_rollout.js:135-141,150`）。

即：**渲染层 `enable_memory_v2 = true`，sidecar store owner = `"off"`。** UI 会分流到 V2 Inspector，而每一次 Context V2 读都撞 E-0056 那个 404。这是把 E-0056 从「默认构建下 V2 面根本不出现」升级成「V2 面出现且全线 404」的那一档。

**结论**: E-0057 报的 false **对 2026-08-03 那次构建成立**，但那不是当前状态。当前 `.local` 是 true，且这个值与 `build/` 那份 **本来就可以不一致** —— 二者之间没有任何校验。

### E-0066 | repository
- **来源定位**: git 历史 —— commit `0dc333dc`（2026-08-04 10:31:36 -0700，`feat(memory): integrate Context Memory V2 P0`）、tag `v0.1.9`（tag commit `51cbbc59`，2026-07-27 22:19:33 -0700）
- **取得方式**: 只读 git 查询 —
  - `git merge-base --is-ancestor 0dc333dc v0.1.9` → **NO**
  - `git tag --contains 0dc333dc` → **空**
  - `git show v0.1.9:src/SERVICEs/feature_flags.js | grep enable_memory_v2` → **无命中**
  - `git log --oneline --all -S "enable_memory_v2" --until="2026-08-02"` → **空**
  - `gh release list --limit 8` → 最新为 `v0.1.9  Latest  2026-08-01T05:41:38Z`
- **提交发言**: S-0011
- **支持/反驳**: **支持并加强** E-0001 / S-0005（`code-owner-settings`）的第二点，同时修正其理由；解除 S-0005 自列的不确定性第 3 条
- **完整性限制**: 覆盖到 **已发布** 安装包。对未来构建无效（见 E-0065）。另：不排除某个已发布包是从当时的 `dev` HEAD 而非 tag 构建的 —— 但 `0dc333dc` 落在 2026-08-04，晚于 v0.1.9 的 tag 日（07-27）与发布日（08-01），两种情况下结论都不变。

**内容**

`enable_memory_v2` 这个 key 在仓库里 **第一次出现** 于 `0dc333dc`（2026-08-04）。`git log --all -S "enable_memory_v2" --until="2026-08-02"` 返回空 —— 2026-08-02 之前，仓库任何分支上都不存在这个字符串。

`v0.1.9` 是 GitHub 上的最新 release（发布于 2026-08-01），其 tag commit 为 `51cbbc59`（2026-07-27）。`git show v0.1.9:src/SERVICEs/feature_flags.js` 里 **没有** `enable_memory_v2`，`FEATURE_FLAG_DEFINITIONS` 里也没有对应条目。

**结论（回答追加问题 A）**: 已发布的安装包里 `enable_memory_v2` **不是 false —— 它根本不存在**。所有已发布版本（≤ v0.1.9）不含 Memory V2 admission 代码，也不含该 flag 的定义。

对 S-0005 的影响：其「今天每个用户实际点开的是 V1 projection Inspector」**成立，且比它自己主张的更强** —— 不是「flag 默认关」，是「V2 那条路在已发布产品里压根没编译进去」。因此其「优先级倒序」建议 **不失效**。但理由须换成本条，且必须带 E-0065 的警告：下一个版本的取值由一个不入库的本机文件决定，不由仓库决定。

补：`src/SERVICEs/feature_flags.js` 的 `readFeatureFlags()` 在 `process.env.NODE_ENV === "production"` 时 **直接返回 build defaults，完全忽略用户持久化的 namespace** —— 即使该 key 存在，打包产品里的用户也无法自行开启。

### E-0067 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/settings/dev/index.js:43-70`、`/Users/red/Desktop/GITRepo/PuPu/electron/main/services/runtime/service.js:26,192-229,668`、`/Users/red/Desktop/GITRepo/PuPu/electron/preload/bridges/unchain_bridge.js:107`、`/Users/red/Desktop/GITRepo/PuPu/electron/main/ipc/register_handlers.js:458`、`/Users/red/Desktop/GITRepo/PuPu/docs/conventions/build-and-testing.md:235-241`
- **取得方式**: 当前 checkout 只读检查 + `grep -rn "syncBuildFeatureFlagsSnapshot\|build_feature_flags.snapshot"`
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（追加问题 A 的「快照怎么产生」）
- **完整性限制**: `electron/**` 与 `src/COMPONENTs/settings/**` 分属 `code-owner-electron` / `code-owner-settings`，此处只读引用以完成本端对构建输入来源的回答，不主张对这两处的处置。未实测「打开 Dev 页 → 文件被改写」的时序，为代码路径推断。

**内容**

E-0064 说明「构建读 `.local/build_feature_flags.snapshot.json`」。**这个文件是应用自己写的。**

链路：

```
src/COMPONENTs/settings/dev/index.js:43-70
  useEffect(() => { ... runtimeBridge.syncBuildFeatureFlagsSnapshot(featureFlags) ... }, [featureFlags])
    → src/SERVICEs/bridges/unchain_bridge.js:40  (能力探测)
    → electron/preload/bridges/unchain_bridge.js:107
    → electron/main/ipc/register_handlers.js:458 → runtimeService.syncBuildFeatureFlagsSnapshot(payload)
    → electron/main/services/runtime/service.js:192-229
         if (app.isPackaged) return { ok:false, error:"dev_only" };
         → 写 <appPath>/.local/build_feature_flags.snapshot.json   (:26 为路径常量)
```

关键在触发条件：那是一个 **依赖 `featureFlags` 的 `useEffect`，不是保存按钮**。也就是说 —— **只要在 dev 里打开 Settings → Dev 这一页，当前内存中的 flag 组合就会覆盖掉下一次生产构建要读的那个文件。**

`docs/conventions/build-and-testing.md:235-241` 记载了读侧（"Production builds read `.local/build_feature_flags.snapshot.json`"），**没有记载写侧是 Dev 页的副作用**，也没有任何发布前校对该文件的步骤。

**结论**: `.local/build_feature_flags.snapshot.json` 现在的 `enable_memory_v2: true`（E-0065），与 2026-08-04 那天在 dev 里做 Memory V2 工作、开着 Dev 页这件事完全自洽。发布 flag 的真实决定点是「构建那一刻这台机器上这个文件长什么样」，而它由一次开发调试的副作用决定，且不入库、不可复现、不被任何门禁检查。

### E-0068 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/electron/tests/**`（45 个 `*.test.cjs` + 44 个 `*.test.js`）、`/Users/red/Desktop/GITRepo/PuPu/src/electron/tests/**`（36 个 `*.test.js`）、`/Users/red/Desktop/GITRepo/PuPu/package.json`（无 `jest` 段；根目录无 `jest.config*`）
- **取得方式**: `find` 枚举 + 逐文件 `cat` + `CI=true npx react-scripts test --watchAll=false --listTests`（`--listTests` 只枚举不执行，不写盘）+ `git ls-files -s src/electron`（模式 100644，非 symlink；`src/electron` 与 `electron` inode 不同，是两个真实目录）
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（追加问题 B）
- **完整性限制**: `electron/tests/**` 属 `code-owner-electron`；`src/electron/**` 属本端。本条只主张 **编排事实**，不主张任一测试文件的内容。

**内容**

铁律说的「`.js` / `.cjs` 双胞胎」在本仓的实际形态是 **三层**，且这三层里只有一层真的跑：

| 层 | 位置 | 数量 | 形态 | 谁执行 |
|---|---|---|---|---|
| 本体 | `electron/tests/**/*.test.cjs` | 45 | 真测试 | `npm run test:electron`（testMatch `**/electron/tests/**/*.test.cjs`） |
| shim A | `src/electron/tests/**/*.test.js` | 36 | 单行 `require("../../../../electron/tests/.../X.test.cjs")`（个别带 jsdom polyfill 前言） | `react-scripts test`（CRA `roots: ['<rootDir>/src']`） |
| shim B | `electron/tests/**/*.test.js` | 44（38 个 shim + 6 个真本体） | `require("./X.test.cjs")` | **无人执行** |

实证：`package.json` 里 **没有** `jest` 段，根目录 **没有** `jest.config*`（唯一的 `*.config.js` 是 `playwright.config.js`），故 CRA 用默认 `roots: ['<rootDir>/src']`。`npx react-scripts test --listTests` 收集到的 electron 相关文件 **36 个，全部前缀 `src/electron/tests/`**；`electron/tests/` 下的 44 个 `.test.js` **一个都没被收集**。

样本（`src/electron/tests/main/memory_v2_rollout.test.js` 全文）：
```js
require("../../../../electron/tests/main/memory_v2_rollout.test.cjs");
```
带 polyfill 的样本（`src/electron/tests/main/memory_v2_startup_readiness.test.js`）：
```js
// jsdom lacks setImmediate; the shared Electron suite uses it to drain the
// startup readiness microtask chain.
if (typeof global.setImmediate !== "function") { global.setImmediate = (cb, ...a) => setTimeout(cb, 0, ...a); }
require("../../../../electron/tests/main/memory_v2_startup_readiness.test.cjs");
```

**已经存在的真双胞胎**：`electron/tests/test-api/` 下 6 个文件（`server` / `integration` / `bridge` / `logs` / `commands` / `builtin_commands`）的 `.test.js` 与 `.test.cjs` 是 **byte-identical 的重复本体**（`diff -q` 六个全部 IDENTICAL，`diff | wc -l` 全 0），各 3–5 KB。它们的 `.js` 版本 **两个 runner 都不收集**。

**结论**: 「改一个要改另一个」这条铁律，在本仓的正确读法是 **本体只有 `.cjs` 一份，`.js` 是转发入口**。真正会静默失效的不是「两份逻辑漂移」，而是 **一个本体缺了 `src/electron/tests/` 那层 shim，或者一个新本体被写成 `electron/tests/**/*.test.js`（那条路径两个 runner 都不看，写多少都是零信号）**。

### E-0069 | repository
- **来源定位**: `electron/tests/**` 与 `src/electron/tests/**` 的集合差；`/Users/red/Desktop/GITRepo/PuPu/.github/workflows/release-qa.yml:93,99`；`/Users/red/Desktop/GITRepo/PuPu/package.json`（`test` / `test:frontend` / `test:electron`）
- **取得方式**: 只读脚本比对两目录的 basename 集合；`grep -n` 读 workflow
- **提交发言**: S-0011
- **支持/反驳**: 支持 S-0011（追加问题 B 的约束）
- **完整性限制**: 仅按路径匹配，不含对测试内容等价性的判断。

**内容**

**当前漂移台账。** 45 个 `.cjs` 本体中，**9 个没有 `src/electron/tests/` shim**，因而 **不被 `npm test` / `npm run test:frontend` 收集**：

```
electron/tests/main/chat_storage_lifecycle.test.cjs
electron/tests/main/ollama_service.test.cjs
electron/tests/main/settings_quit_coordinator.test.cjs
electron/tests/test-api/bridge.test.cjs
electron/tests/test-api/builtin_commands.test.cjs
electron/tests/test-api/commands.test.cjs
electron/tests/test-api/integration.test.cjs
electron/tests/test-api/logs.test.cjs
electron/tests/test-api/server.test.cjs
```

（`unchain_service.test.cjs` 与 `preload/unchain_stream_client.test.cjs` **有** 覆盖，走的是两个改名后未同步文件名的 shim：`src/electron/tests/main/unchain_service_loader.test.js` 与 `src/electron/tests/preload/miso_stream_client.test.js` —— 文件名还停在 miso 时代，`require` 目标已更新。故 36 个 shim 恰好覆盖 36 个不同本体。）

**与 Memory V2 直接相关的本体全部有 shim**，两个 runner 都跑得到：
`context_v2_service` · `memory_v2_rollout` · `memory_v2_startup_readiness` · `memory_vault_{handlers,service,sink_broker,sink_executor,startup_assembly,unchain_bridge,use_state,worker_entrypoint}` · `preload/{context_v2_bridge,memory_vault_bridge}`。

**CI 覆盖情况。** `release-qa.yml` 两条都跑：
```
:93  run: npm run test:frontend -- --passWithNoTests
:99  run: npm run test:electron
```
所以 45 个本体在 CI 上 **都会执行**；上述 9 个缺口只在 **本地只跑 `npm test`** 时表现为静默漏测。

**注意 `--passWithNoTests`**：如果哪天 `src/electron/tests/` 整层被误删或路径写错，`test:frontend` **不会报错**，会以「没有测试」通过 —— 这正是「静默失效」的字面实现。

### E-0070 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:445`（`meta_color = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"`）
  - 同文件 `:523-540`（loading/idle）、`:542-561`（empty）、`:563-582`（profiles）—— 三者共用 `meta_color`，`fontSize: 13`
  - 同文件 `:584-603`（error）—— `color: isDark ? "rgba(255,100,100,0.7)" : "rgba(180,40,40,0.7)"`，`fontSize: 13`
  - 底色来源：`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/modal/modal.js:79-81`（panel `backgroundColor: theme?.semantic?.background || mt.backgroundColor || "#fff"`）；`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` → `dark_mode.modal.backgroundColor = "#1E1E1E"`、`light_mode.modal.backgroundColor = "#FFFFFF"`（默认主题无 `semantic` 段，故 fallback 生效）
- **取得方式**: 当前 `dev` checkout 只读检查 + 在本地以 WCAG 2.x relative-luminance 公式（sRGB 反伽马 → 0.2126/0.7152/0.0722 加权 → `(L1+0.05)/(L2+0.05)`）对 alpha 合成后的实际像素值计算对比度。未起应用，未截图。
- **提交发言**: S-0012
- **支持/反驳**: 支持 S-0012（Q8 呈现规格、失败态归属）
- **完整性限制**:
  1. 计算基于 **默认主题**。自定义主题下 `theme.semantic.background` 会取代 fallback；按已归档的主题护栏窗口（dark `L ≤ 0.10` / light `L ≥ 0.30`），**light 侧最差可比此处更低**（背景越暗，`rgba(0,0,0,α)` 文字越糊）。故下表是 **默认主题的值，不是全主题下界**。
  2. 未在运行中的应用里目视或用 devtools 取计算样式，全部为静态推算。
  3. 未取得含真实数据的 `ready` 态样本（本庭已知缺口 1），故只覆盖 loading / empty / profiles / error 四个无数据态。

**实测数值**

| 渲染态 | 声明色 | 合成后像素 | 对比度 | WCAG 1.4.3 AA（13px 属小字，需 4.5:1） |
|---|---|---|---|---|
| loading / empty / profiles（dark，底 `#1E1E1E`） | `rgba(255,255,255,0.28)` | `#5D5D5D` | **2.53:1** | 不通过 |
| loading / empty / profiles（light，底 `#FFFFFF`） | `rgba(0,0,0,0.28)` | `#B8B8B8` | **1.99:1** | 不通过 |
| error（dark） | `rgba(255,100,100,0.7)` | `#BC4F4F` | **3.46:1** | 不通过 |
| error（light） | `rgba(180,40,40,0.7)` | `#CA6969` | **3.67:1** | 不通过 |

四个态 **无一通过 AA**；`empty` 的 light 值 1.99:1 甚至低于 WCAG 对 **非文本图形** 的 3:1 底线。

**达标所需的最小 alpha**（同底色、同前景色相）：
- dark 白 → `0.46`（`#868686`，4.55:1）
- light 黑 → `0.54`（`#757575`，4.59:1）

**附带事实**：error 态是 **全案唯一以颜色（红）承载语义** 的呈现，且不伴随任何图标或文字标识。在两种主题下均不满足 AA，且色相是唯一区分位（WCAG 1.4.1 Use of Color）。
- **验证历史**:
  - S-0012 | 未验证 | 提交时状态

### E-0071 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-input/chat_input.js:545-560` —— disclaimer 唯一渲染点
  - `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:747-796`（`effectiveDisclaimer` 11 分支）、`:888`（唯一落点 `disclaimer: effectiveDisclaimer`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:771-773` —— `if (stream.streamError) return \`Unchain error: ${stream.streamError}\`;`
  - 底色：`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` → `dark_mode.backgroundColor = "#121212"` / `light_mode.backgroundColor = "#FFFFFF"`；`dark_mode.color = "#CCCCCC"` / `light_mode.color = "#222222"`
- **取得方式**: 当前 `dev` checkout 只读检查 + 本地 WCAG relative-luminance 计算。未起应用。
- **提交发言**: S-0012
- **支持/反驳**: 支持 S-0012（Q4-A：失败反馈不得继续放 disclaimer 槽位）；与 `S-0006`（`code-owner-chat-core`）同向但依据独立
- **完整性限制**:
  1. disclaimer 位于 composer 下方，其身后是页面背景；本计算取默认主题的 `backgroundColor`。若该处实际落在某个 surface 上（composer 容器 `:538-539` 用 `color-mix(... var(--pupu-surface) ...)`），底色会略变，但 disclaimer 的 `<div>` 在该容器之外（`:545` 与 `:515` 同级），故取页面背景是正确的选择 —— **未在运行时验证该判断**。
  2. `opacity` 作用于整个 `<div>`，与直接给 `color` 加 alpha 在此处等效（无子元素、无背景）。
  3. 自定义主题下 `theme.color` 可变，下表是默认主题值。

**实测数值**

声明：`fontSize: 11`，`color: theme?.color || "#222"`，`opacity: onThemeMode === "dark_mode" ? 0.3 : 0.4`。

| 主题 | 前景/底色 | 合成后像素 | 对比度 | AA 4.5:1 | AA-large 3:1 |
|---|---|---|---|---|---|
| dark | `#CCCCCC` @0.30 / `#121212` | `#4A4A4A` | **2.11:1** | 不通过 | 不通过 |
| light | `#222222` @0.40 / `#FFFFFF` | `#A7A7A7` | **2.42:1** | 不通过 | 不通过 |

**11px 不构成 WCAG「大字」豁免**（大字门槛为 18pt/24px，或 14pt/18.66px 粗体）。故适用 4.5:1，两侧均不通过，且 **连 3:1 都不到**。

**达标所需最小 opacity**（同色同底）：dark `0.58`（`#7E7E7E`，4.61:1）；light `0.62`（`#767676`，4.54:1）。即当前值需要 **接近翻倍**。

**结构事实**：该槽位是 **单行、单槽、常驻**。`effectiveDisclaimer` 的 11 个分支覆盖至少 5 类互不相关的信息（durable interaction 5 态 / streamError / streaming / unchain 未就绪 / 未选模型 / 附件禁用 / 默认免责声明），且 **没有任何一个分支对应 `isTurnMutationBlocked`**，其依赖数组（`:789-796`）里也没有该值。
- **验证历史**:
  - S-0012 | 未验证 | 提交时状态

### E-0072 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/chat-bubble/components/message_action_bar.js:24-75` —— 容器与四个按钮的全部声明
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/input/button.js:131`（`disabled: { root: { opacity: 0.4, cursor: "not-allowed" } }`）、`:222`（`rootStyle = deepMerge(resolvedStyle.root, stateStyle.root)`，state 覆盖用户值）、`:265`（`outline: "none"`）、`:268-269`、`:321-326`（`aria-label={ariaLabel}` / `title={title}`，二者在本调用点均未传）、`:135-170`（`resolveStateStyle` 只有 hover / pressed / disabled 三态，**无 focus 态**）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/icon/icon.js:24-41`（`src in UISVGs` → 渲染内联 React SVG 组件，`props` 不透传）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/icon/icon_manifest.js:400-407`（`EditPen`：`<svg>` 无 `<title>`、无 `role`、无 `aria-label`）、`:1487-1621` 的 `UISVGs` 注册表内含 `delete`(1517) / `edit_pen`(1527) / `markdown`(1556) / `text`(1605) / `update`(1611)
  - `/Users/red/Desktop/GITRepo/PuPu/src/PAGEs/chat/chat.js:1128-1136` —— `disableActionButtons` 由 `stream.isTurnMutationBlocked` 参与
- **取得方式**: 当前 `dev` checkout 只读检查 + 本地 WCAG 对比度计算 + 按 HTML-AAM 可访问名计算规则做的静态推导。未起应用，未跑读屏。
- **提交发言**: S-0012
- **支持/反驳**: 支持 S-0012（Q4-D）；**部分反驳 `S-0009` 建议处置 5**（「最小可接受形态是给四个按钮加 `title`」）；独立确认 `S-0009` 的 opacity 0.5→0.4 事实
- **完整性限制**:
  1. 可访问名为空、以及 tab order 行为，均为 **静态推导**，未用读屏或 devtools accessibility tree 实测。
  2. 对比度按默认主题 `theme.color`（`#CCCCCC` / `#222222`）与页面底色（`#121212` / `#FFFFFF`）算；气泡本身可能有自己的底，未核实。
  3. `showActionBar` 为真的条件未穷举，本条只描述其为真时的形态。

**（一）opacity 链路 —— 独立确认 `S-0009`，并给出机制**

`message_action_bar.js` 对四个 Button 传 `style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}`。`button.js:222` 的 `deepMerge(resolvedStyle.root, stateStyle.root)` 使 **disabled 的 `opacity: 0.4` 覆盖用户的 `0.5`**；`:334` 的 `deepMerge(computedRootStyle, rootStyle)` 使 `rootStyle` 再覆盖 `computedRootStyle` 的 `opacity: disabled ? 0.4 : 1`。**净效果：enabled 0.5，disabled 0.4。**

| 态 | 主题 | 合成像素 | 对比度 | WCAG 1.4.11（非文本，3:1） |
|---|---|---|---|---|
| enabled 0.5 | dark | `#6F6F6F` | 3.73:1 | 通过 |
| enabled 0.5 | light | `#909090` | **3.17:1** | 通过（余量 0.17） |
| disabled 0.4 | dark | `#5C5C5C` | 2.82:1 | 1.4.11 明文豁免 inactive 组件，**不构成违规** |
| disabled 0.4 | light | `#A7A7A7` | 2.42:1 | 同上 |

**要点**：enabled→disabled 的对比度差为 dark 0.91、light 0.75 个比率点，图标尺寸 14px。WCAG 之所以豁免 inactive 组件的对比度，正因为 **它不把降低对比度当作可感知的状态信号**。故「opacity 0.5→0.4」在规范与感知两个层面都不构成一个状态指示。

**（二）可访问名为空 —— 一条 Level A 失败，且不限于 blocked 态**

链路逐段：`message_action_bar.js` **不传 `ariaLabel`、不传 `title`、无 `children`、无 `label`** → `button.js:321-326` 得 `aria-label={undefined} title={undefined}` → 按钮内容只有 `<Icon>` → `icon.js:24-32` 对 `UISVGs` 成员渲染内联 `<svg>` → `icon_manifest.js` 的 SVG 组件 **无 `<title>` 子元素、无 `aria-label`、且不 spread `props`**。

按 HTML-AAM，`<button>` 无 `aria-label`/`aria-labelledby`/`title`、内容为无可访问名的 `<svg>` 时，**可访问名为空字符串**。四个按钮（切换渲染模式 / 编辑 / 重发 / 删除）在 **任何状态下** 均无可访问名 —— 这不是 blocked 才出现的问题。

（对照：`icon.js:48/62/100` 的 `<img alt={src.replace(/_/g," ")}` 分支 **会** 产生名字，但这四个图标全部命中 `UISVGs` 内联分支，不走该路径。）

**（三）为什么 `title` 不是充分修法**

`title` 属性只在 **鼠标悬停** 时呈现原生 tooltip：键盘聚焦不触发，触控不触发，AT 对其暴露不一致。而这条 action bar 自身 `opacity: hovered ? 1 : 0` + `pointerEvents: hovered ? "auto" : "none"`（`:31-35`）—— **只有已经悬停的用户才能看见按钮**。即：`title` 把 blocked 的解释放在「已经悬停」这个前提之后，恰好排除了所有没在悬停的用户，而那正是遇到「发送被禁用、按钮全灰」时会去别处找解释的那批人。

**（四）焦点可见性 —— 与 blocked 方案相邻的既存缺陷**

`opacity: 0` 与 `pointer-events: none` **均不把元素移出 tab order**。enabled 时四个按钮可被 Tab 聚焦，而 `button.js:265` 是 `outline: "none"` 且 `resolveStateStyle` 无 focus 分支 —— **聚焦零视觉反馈**。即键盘用户在一条会话里会依次 Tab 到每条消息的 4 个不可见、无名字、无焦点环的按钮（WCAG 2.4.7 AA / 4.1.2 A）。blocked 时 `disabled` 又把它们整体移出 tab order，**无任何播报**。
- **验证历史**:
  - S-0012 | 未验证 | 提交时状态

### E-0073 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/boot-overlay/boot_overlay.js:21`（`const MUTED_OPACITY = 0.75;`）
  - 同文件 `:331-350` —— 成文理由逐字：*"0.75 rather than a fainter value: at 0.55 this failed AA on 8 of 9 light presets (worst 3.08:1)."*；同段的 `aria-live="polite"` 与「内容条件渲染而非只改 opacity」的成文理由
  - 同文件 `:302-329` —— progressbar 的 `aria-label` 用 **稳定名** 而非随阶段变化的状态文案，理由成文于 `:304-305`
  - 同文件 `:353-424` —— failure 块：`role="alert"`、13px / lineHeight 1.6 / `MUTED_OPACITY`、`FAILURE_TEXT_KEY[failure.code] || "boot.failure.unknown"`、以及 retry Button 的完整 chip 样式（`fontSize:13 / paddingVertical:7 / paddingHorizontal:16 / borderRadius:7 / root.backgroundColor / hoverBackgroundColor / activeBackgroundColor` 四值明暗成对）
  - 同文件 `:386-393` —— 成文的两条反模式记录：Button 不透传 ref 需 wrapper；`role="alert"` 子树内 **不得** 加 `aria-busy`（会抑制播报）
  - `/Users/red/Desktop/GITRepo/PuPu/src/locales/en.json` → `boot.*`（含 `boot.failure.{unchain_runtime_not_found, unchain_runtime_failed, mcp_environment_unavailable, unknown}`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/boot_locale_parity.test.js`（`code-owner-shared-arteries` 在 E-0038 已登记）
- **取得方式**: 当前 `dev` checkout 只读检查。
- **提交发言**: S-0012
- **支持/反驳**: 支持 S-0012（四态呈现规格可直接沿用既有先例，无须新发明设计语言）；与 `S-0008` 建议处置 3 同向
- **完整性限制**:
  1. 本条只登记 **可复用属性**，不主张 boot overlay 的每个取值都适用于 Inspector / composer（两者底色不同：boot 用自派生 blob 底，Inspector 用 modal 底，composer 用页面底）。**复用的是比率与句式结构，不是像素坐标。**
  2. 未起应用目视。

**可直接复用的四条**

1. **muted 文字的既定比率** = `MUTED_OPACITY 0.75`，且该值是 **因 AA 实测而上调过的**（0.55 在 9 个亮色预设里 8 个不过，最差 3.08:1）。在 modal 底色下 0.75 给出 dark 6.41:1 / light 6.98:1（见 E-0074）。
2. **失败文案按 code 分句，且 `unknown` 是一句显式兜底**，不是空。四句英文的共同句式是三要素：**影响了什么（用户词汇）/ 还在不在自己重试 / 你能做什么**。例：*"PuPu's local services still haven't started. It's still trying — you can wait, or try again."*
3. **主操作 chip 模板**（本仓已验收的按钮形态，`fontSize` 必须显式传 13，默认 16 会与 13px 正文层级倒挂）。
4. **可访问性三条成文教训**：progressbar 的可访问名必须稳定、live region 的内容要条件渲染、`role="alert"` 子树内禁用 `aria-busy`。

**为什么这条是先例而不只是参考**：`boot.*` 是全仓 638 个 locale 键里 **唯一** 配了对等性守卫的一段，而无守卫的其余部分已漂出 49 个缺口（`S-0008` E-0036/E-0038/E-0039）。即这套形状是本仓 **已经在四态问题上跑通并守住** 的那一份。
- **验证历史**:
  - S-0012 | 未验证 | 提交时状态

### E-0074 | repository
- **来源定位**（本条是 **计算结果**，其输入全部来自 checkout 内的取值）:
  - 底色：`/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/default_mini_theme.json` → `dark_mode.modal.backgroundColor = "#1E1E1E"`、`light_mode.modal.backgroundColor = "#FFFFFF"`、`dark_mode.backgroundColor = "#121212"`、`light_mode.backgroundColor = "#FFFFFF"`
  - 前景：同文件 `dark_mode.color = "#CCCCCC"`、`light_mode.color = "#222222"`
  - 复用比率：`/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/boot-overlay/boot_overlay.js:21`（`MUTED_OPACITY = 0.75`）
- **取得方式**: 在本地对上述取值做 WCAG 2.x relative-luminance 计算（sRGB 反伽马 → 0.2126/0.7152/0.0722 → `(L1+0.05)/(L2+0.05)`），对 alpha 逐档扫描求达标临界点。
- **提交发言**: S-0012
- **支持/反驳**: 支持 S-0012（四态呈现规格的明暗成对取值）
- **完整性限制**:
  1. **只覆盖默认主题。** 自定义主题下 `semantic.background` / `semantic.text` 取代这些 fallback。按已归档的护栏窗口（dark `L ≤ 0.10` / light `L ≥ 0.30`，`textMuted ↔ 外壳` 出厂实测下界 3.084），下表在自定义主题下 **会变差但不会低于该下界**；采用 `theme.color` + opacity 的写法而非裸 hex，正是为了让它随主题一起走。
  2. 未起应用验证渲染结果。
  3. 状态色（红/黄/绿）**不在本表内**，因为已归档实测显示出厂 accent/success/warning/danger 对外壳最低只有 **1.998:1** —— 故本案规格不以颜色承载任何语义。

**（一）两档 muted 文字，明暗成对**

| 档 | 用途 | dark（`theme.color` on `#1E1E1E` modal / `#121212` page） | light（on `#FFFFFF`） |
|---|---|---|---|
| **主句档** | 状态条正文、失败句 | `opacity 0.75` → modal `#A0A0A0` **6.41:1** / page `#9E9E9E` **6.95:1** | `opacity 0.75` → `#595959` **6.98:1** |
| **次级档** | 空态一句话、reason code token | `opacity 0.60` → modal `#868686` **4.60:1** / page `#7E7E7E`（0.58 即 4.61:1） | `opacity 0.62` → `#767676` **4.54:1** |

两档均 ≥ AA 4.5:1。主句档直接等于 boot overlay 的既定 `MUTED_OPACITY`，不新增设计常量。

**（二）与今天取值的差额**

| 位置 | 今天 | 今天的对比度 | 本规格 | 变化 |
|---|---|---|---|---|
| Inspector empty/loading（E-0070） | `rgba(*,0.28)` | 2.53 / 1.99 | 次级档 0.60 / 0.62 | dark ×1.8，light ×2.3 |
| Inspector error（E-0070） | 红 @0.7 | 3.46 / 3.67 | 主句档 0.75，**去掉红色** | dark ×1.9，light ×1.9 |
| composer disclaimer（E-0071） | 11px @0.3/0.4 | 2.11 / 2.42 | 不再承载失败；若保留则 13px 次级档 | — |

**（三）非文字承载位（不带语义，仅分组）**

- 状态条底：`isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"`
- 状态条左规 2px：`isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"`
- 若状态条需铺满一整块外壳表面，底色用 `var(--pupu-surface)`，**不写裸 hex**（受 `shell_background_guard` 约束）

**（四）3:1 临界点（备查，本规格不使用）**

modal dark `0.43`（3.03:1）；modal light `0.49`（3.08:1）；page dark `0.43`（3.07:1）；page light `0.49`（3.08:1）。登记它是为了让任何「再淡一点」的后续提案有一个可引用的地板。
- **验证历史**:
  - S-0012 | 未验证 | 提交时状态

### E-0100 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/CONTAINERs/config/container.js:148-176`（`applyContainerThemeConfig`：`themeColorCustomizationEnabled` 为 **false 时走 `defaultThemeColorSettings()`（preset `"default"`）而不是跳过**，随后无条件调用 `applySemanticPaletteToTheme`）
  - 同文件 `:334-341`（初始 `useState` 即调用 `applyContainerThemeConfig`）、`:351-394`（mode / locale / flag 变化时重算并 `setTheme`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/CONTAINERs/config/theme_semantic.js:211-303`（`applySemanticPaletteToTheme`：`semantic` 段写入；`color: text`；`backgroundColor: background`；`modal: merge(base.modal, { backgroundColor: background, ... })`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:239-266`（`SEMANTIC_DEFAULTS`：dark `background #121212` / `surface #1e1e1e` / `text #ffffff`；light `background #ffffff` / `text #222222`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/modal/modal.js:79-81`（panel `backgroundColor: theme?.semantic?.background || mt.backgroundColor || "#fff"`）、`:97`（`color: theme?.color || "#222"`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/memory-inspect/memory_inspect_modal.js:501-513`（`<Modal>` 调用点 **不传 `style.backgroundColor`**，故 panel 底色即 `theme.semantic.background`）
- **取得方式**: 当前 `dev` checkout 只读追链 + 在本地以 WCAG 2.x relative-luminance 公式重算 alpha 合成后的实际像素。未起应用，未截图。
- **提交发言**: S-0015
- **支持/反驳**: **部分反驳 E-0070 / E-0071 / E-0074 的输入取值**；**支持 S-0012 的结论方向**（四个态不通过 AA 这一判定在修正后仍然成立）

**（一）事实：`theme.semantic` 在生产里恒定存在，`default_mini_theme.json` 的对应键恒被覆盖**

E-0070 的完整性限制写「默认主题无 `semantic` 段，故 fallback 生效」。这一前提不成立。`applyContainerThemeConfig` 在 flag 关闭时不是 **跳过** 语义解析，而是用 `defaultThemeColorSettings()`（`preset: "default"`，空 custom）去解析。因此 `theme.semantic` 从首帧起就被填满，`modal.js:80` 的第一个分支恒命中，`default_mini_theme.json` 里 `modal.backgroundColor` 与顶层 `color` 这两个键 **在运行时永远读不到**。

| 取值 | E-0070/E-0071 采用 | 实际运行时（默认 preset） | 来源 |
|---|---|---|---|
| modal panel 底（dark） | `#1E1E1E` | **`#121212`** | `semantic.background`，非 `surface` |
| modal panel 底（light） | `#FFFFFF` | `#ffffff` | 一致 |
| `theme.color`（dark） | `#CCCCCC` | **`#ffffff`** | `semantic.text` |
| `theme.color`（light） | `#222222` | `#222222` | 一致 |

**（二）修正后的实测对比度**

| 渲染态 | 声明 | E-0070/71 值 | **修正值** | AA 4.5:1 |
|---|---|---|---|---|
| Inspector loading/empty/profiles dark | `rgba(255,255,255,0.28)` on `#121212` | 2.53:1 | **2.47:1** | 不通过 |
| 同 light | `rgba(0,0,0,0.28)` on `#ffffff` | 1.99:1 | **1.98:1** | 不通过 |
| Inspector error dark | `rgba(255,100,100,0.7)` on `#121212` | 3.46:1 | **3.70:1** | 不通过 |
| 同 light | `rgba(180,40,40,0.7)` on `#ffffff` | 3.67:1 | **3.66:1** | 不通过 |
| composer disclaimer dark | `#ffffff` @0.30 on `#121212` | 2.11:1 | **2.67:1** | 不通过，且 < 3:1 |
| 同 light | `#222222` @0.40 on `#ffffff` | 2.42:1 | **2.41:1** | 不通过，且 < 3:1 |

**结论方向不变**：六个数全部低于 AA 4.5:1，disclaimer 两侧仍然连 3:1 都不到，`empty` light 1.98:1 仍低于非文本图形的 3:1 底线。**S-0012 的判定成立，其输入取值需要按本条替换。**

**（三）为何这条对处置有影响，而不只是订正小数点**

修正把 dark 侧的 modal 底从 `surface` 挪到了 `background`。任何按「Inspector 坐在 surface 上」写出来的四态取值，在 dark 下会算错一档；而 `surface`（`#1e1e1e`）与 `background`（`#121212`）在 9 个预设里的差最大到 nord 的 `#2e3440` vs `#434c5e` —— 不是可以忽略的量。**四态规格必须声明它坐在哪个 shell 上；本案里那个 shell 是 `background`。**
- **完整性限制**:
  1. 全部为静态追链与计算，未在运行的应用里用 devtools 取计算样式核对。
  2. 只覆盖 `preset: "default"` 且 `custom` 为空的情形，即 `enable_theme_color_customization` 关闭时的唯一形态。其他 preset 见 E-0101。
  3. `resolveThemeDefinition` 返回 null 的降级分支（`container.js:392` `setTheme(base)`）未追；该分支下 `theme` 为 null，`modal.js` 会退到 `mt.backgroundColor`，与本表不同。未核实该分支能否在生产中发生。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0101 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:268-506`（`SEMANTIC_PRESETS` 8 个 + `SEMANTIC_DEFAULTS` 1 个 = 9 套调色板 × 2 mode）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/contrast_window.js:143-177`（`roleWindow`：shell / text / textMuted / hue 四类各有窗口，**末行 `return []` 注释写明 "unconstrained (alpha steps carry no window of their own)"**）
  - 同文件 `:123-135`（`TEXT_MIN_RATIO 4.5` / `MUTED_MIN_RATIO 3.0` / `HUE_MIN_RATIO 1.9`，及「工厂实测最低 3.084」的成文出处）
  - `/Users/red/Desktop/GITRepo/PuPu/src/SERVICEs/feature_flags.js:38-42`（`enable_theme_color_customization` `defaultValue: false`）
- **取得方式**: 从 `semantic_tokens.js` 正则抽出 9 套调色板，在本地对 `text` 逐 alpha 与各 shell 做 WCAG 合成与对比度计算，取全集最小值。未起应用。
- **提交发言**: S-0015
- **支持/反驳**: **限缩 E-0074**（其「次级档」在默认预设外不达 AA；其「主句档」比它自己证明的更稳）；**新增** 一条 E-0074 未覆盖的结构事实（alpha 步无可读性窗口）

**（一）9 预设 × 2 mode × shell 全扫描**（前景恒为该预设的 `text`，按 alpha 合成后对同一 shell 取对比度）

| 档位 | shell 取 `background`+`surface` 的最差 | 加上 `sidebar` 的最差 | AA 4.5:1 |
|---|---|---|---|
| **E-0074 主句档 0.75 / 0.75** | **5.04:1**（nord / dark / surface） | 5.04:1 | **全部通过** |
| **E-0074 次级档 0.60 / 0.62** | **3.69:1**（nord / light / background） | 3.59:1（nord / light / sidebar） | **不通过** |
| 出厂 `--pupu-text-secondary` 0.72 / 0.68 | 4.31:1（nord / light / background） | 4.20:1 | 不通过（差 0.2–0.3） |
| 出厂 `--pupu-text-faint` 0.38 / 0.35 | 1.93:1（nord / light / background） | 1.92:1 | 严重不通过 |

**能在 9 预设上恒过 AA 的最小固定 alpha**：dark `0.69`、light `0.70`（含 sidebar 时 light 需 `0.71`）。

**（二）由此得到的两条**

1. **E-0074 的两档阶梯在离开默认预设后塌成一档。** 只有 `0.75` 这一档在全预设下安全；`0.60/0.62` 只在默认预设上成立。E-0074 完整性限制 1 援引的「下界 3.084」是 `contrast_window.js:124-135` 里 **`textMuted`（一个受 `MUTED_MIN_RATIO=3.0` 窗口约束的 root）对 shell** 的工厂实测最低值，把它套到 **`text` 乘 alpha 之后对 shell** 上是不同的量 —— 后者不受任何窗口约束（见下）。这是限缩，不是推翻：主句档 0.75 反而被本条证得比 E-0074 主张的更稳（它只证了默认预设 6.41:1，实测全预设最差 5.04:1）。
2. **alpha 步在主题编辑器里没有可读性护栏。** `roleWindow` 对 `background/sidebar/surface`、`text`、`textMuted`、5 个 hue 各返回一组窗口，对其余一律 `return []`（`:176`）。而 `ALPHA_STEPS` 的 alpha 值本身可由用户经 `details` 通道覆写（`theme_semantic.js:72-83` `resolveThemeDetails`：user details > preset details > default）。即：root 被夹在窗口里，**由 root 派生的每一个 alpha 步都不被夹**。任何把四态文案挂在某个 alpha 步上的规格，其达标性依赖用户不去动那个 detail 键。

**（三）今天与未来的适用性**

`enable_theme_color_customization` 的 `defaultValue` 是 **`false`**（`feature_flags.js:41`）。所以 **今天** 生产里只有 `default` 一套调色板，本条的 9 预设扫描是前瞻性风险而非当前缺陷。它在该 flag 翻开的那个版本变成当前缺陷 —— **本条不主张该 flag 何时翻开**，只主张：四态取值若按默认预设调参，flag 翻开当天在 nord / ocean 上失效，且失效是静默的（无任何测试覆盖前景对比度，见 E-0106）。
- **完整性限制**:
  1. 调色板由正则从源文件抽取，未经 `resolveSemanticPalette` 实跑；对 preset 而言二者等价（preset 直接提供全部 11 个 root），但对 **用户自定义 custom** 不等价 —— 自定义 root 会走 `deriveTier` + `clampDerivedTiers`，本扫描不覆盖，其下界只会更差。
  2. 未起应用目视任何一个预设。
  3. 未核实 `enable_theme_color_customization` 在任何已发布版本或计划版本中的实际取值，只读到源码默认值。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0102 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/semantic_tokens.js:1-13`（`SEMANTIC_TOKEN_KEYS` 11 个 root）、`:15-37`（`ALPHA_LADDER` 8 档，成文写明「1748 处手写中性叠加收敛成 73 个 alpha 值、8 个语义桶」）、`:100-204`（`SEMANTIC_TOKEN_TREE`）、`:139-162`（text 家族：`textMuted` 是 root，`textStrong/textSecondary/textFaint/textDisabled` 是 alpha 步）、`:222-224`（`ALPHA_STEPS` 发射清单）
  - `/Users/red/Desktop/GITRepo/PuPu/src/CONTAINERs/config/theme_semantic.js:159-199`（`semanticCssVars`：root/tier 发 `--pupu-{varName}` 与 `--pupu-{varName}-rgb`；每个 alpha 步发 `--pupu-{varName}` = `rgba(parent-rgb, alpha)`）、`:305-312`（`applySemanticCssVars` 写到 `document.documentElement`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/CONTAINERs/config/container.js:368-375`（生产路径上无条件调用 `applySemanticCssVars`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/default_mini_theme.json`（634 行，legacy mini_theme；其 `modal.backgroundColor` / 顶层 `color` 等键已被 E-0100 证明在运行时被覆盖）
- **取得方式**: 当前 `dev` checkout 只读检查 + `grep -rn "pupu-text-muted\|pupu-text-faint\|pupu-text-secondary\|pupu-text-disabled" src/ --include="*.js"` 统计消费者。
- **提交发言**: S-0015
- **支持/反驳**: 支持 S-0015 关于「四态取值的落点」的建议处置；补充 E-0074（其规格用「`theme.color` + opacity」的写法，与本条的 token 通道等价但不共用护栏）

**（一）本仓已经有一套发货中的语义文字阶梯，四态不需要新增 token**

`--pupu-text`、`--pupu-text-muted`、`--pupu-text-strong`、`--pupu-text-secondary`、`--pupu-text-faint`、`--pupu-text-disabled` **今天就挂在 `document.documentElement` 上**，无论主题自定义 flag 开关（`container.js:368` 在 flag 关闭时用 default preset 走同一条路）。发射逻辑是 `ALPHA_STEPS` 驱动的，加一个新档 = 在 `SEMANTIC_TOKEN_TREE` 里加一个节点，无需改发射端。

**（二）但这套阶梯几乎没有消费者**

`grep` 全仓 `.js`（排除测试）：`--pupu-text-faint` 2 处、`--pupu-text-secondary` 1 处，**全部在 `src/COMPONENTs/settings/appearance/theme_editor.js`（`:534` `:574` `:656`）—— 即主题编辑器自己**。`--pupu-text-muted` / `--pupu-text-strong` / `--pupu-text-disabled` 在 `src/**/*.js` 里 **零消费者**。

即：这套阶梯是 **建好了没人用** 的状态。四态文案是它的第一个真实业务消费者，这既是机会（不必新发明），也是风险（第一个消费者会把它的缺陷全部暴露 —— 见 E-0101 的无窗口问题）。

**（三）`default_mini_theme.json` 不是四态的落点**

该文件是 mini_ui 移植过来的 legacy 主题表。E-0100 已证明它的 `modal.backgroundColor` 与顶层 `color` 在运行时被 `applySemanticPaletteToTheme` 覆盖。**往它里面加一个四态专用键，结果是一个 `applySemanticPaletteToTheme` 不认识、因而永远不跟用户主题走的死值** —— 恰好是 `switch` 轨道色与 `markdown.pre` 背景在 v2 之前的那个 bug 形态（`theme_semantic.js:275-284` 与 `:295-299` 的成文记录：「the base JSON grays didn't follow the theme」）。

**（四）「无中央主题文件」这条铁律与 `var(--pupu-*)` 的张力，实际边界在哪**

两条铁律的字面表述是冲突的，实际已经收敛，收敛点是：

- **禁止的是中央样式表** —— CSS modules / styled-components / 一份定义了「.button 长什么样」的全局 CSS。这条今天严格成立。
- **允许并且已经强制的是中央 token 表** —— `BUILTIN_COMPONENTs/theme/` 下的 506 行 `semantic_tokens.js` 就是它，`shell_background_guard` 强制外壳背景引用它。

即真正的规则是 **值集中、组合内联**：颜色的取值来自 token，颜色往哪个 DOM 属性上放由组件自己内联决定。四态文案的颜色属于「值」，因此归 token；四态文案的排版、间距、条件渲染属于「组合」，因此归消费者内联。
- **完整性限制**:
  1. 消费者统计只覆盖 `src/**/*.js`，未覆盖 `public/index.html` 的静态 boot shell（它读的是 `pupu_boot_palette` localStorage 缓存，见 `theme_semantic.js:314-339`）。
  2. 「无中央主题文件」的边界解释是本 owner 对两条已归档铁律与现存代码的调和判断，**不是任何一次已归档裁定的引用**。若 `chief-judge` 认为该边界与其原意不符，以裁定为准。
  3. 未跑测试，未起应用。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0103 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/input/button.js:175-189`（成文 props 文档，**含 `ariaLabel – accessible name for icon-only buttons`**）、`:190-202`（签名含 `ariaLabel` / `title`）、`:229-234`（`iconOnly` 已在原语内部被计算出来）、`:262`（`color` 回退链）、`:265`（`outline: "none"`）、`:268-269`、`:321-326`（`aria-label={ariaLabel}` / `title={title}` / `disabled={disabled}`）
  - 同文件 `:128-133`（`state` 只声明 `hover` / `active` / `disabled`）、`:135-173`（`resolveStateStyle` 只处理这三态，**无 focus 分支**）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/input/`（目录清单：`button.js` **无同名 `button.test.js`**）
- **取得方式**: 当前 `dev` checkout 只读检查 + 一段本地 python 扫描：遍历 `src/**/*.js`（排除 `*.test.js`），对每个 `<Button` 开标签做花括号配平取出属性区，判定「有 `prefix_icon` 或 `postfix_icon`，且无 `label=` / `prefix=` / `postfix=`，且无非空 children」为 icon-only，再检查该标签内是否出现 `ariaLabel`。
- **提交发言**: S-0015
- **支持/反驳**: **限缩 E-0072 与 E-0049 的归属判定**（可访问名为空是调用方缺陷，原语已提供槽位）；**支持 E-0072 第（四）段**（焦点不可见确属原语缺陷）；支持 S-0012 不成立 #2（`title` 不是充分修法）

**（一）`ariaLabel` 不是缺失的能力，是没人传的参数**

`button.js` 自 props 文档起就把 `ariaLabel` 标注为「accessible name for icon-only buttons」，并在 `:323` 原样落到 `aria-label`。E-0072 链路推导中的每一段都对，但结论「可访问名恒为空」的成因不是原语没有出口，而是 **调用点没传**。

**（二）缺失率实测：81 / 100**

| | 数量 |
|---|---|
| 全仓 icon-only `<Button>` 调用点 | **100** |
| 其中未传 `ariaLabel` | **81**（81%） |

缺失最多的前几个文件：

```
11  src/PAGEs/demo/show_room_demo/chat_showroom.js
 6  src/PAGEs/demo/individual_component_demo/textfield_demo.js
 5  src/COMPONENTs/chat-input/components/attach_panel.js
 4  src/BUILTIN_COMPONENTs/electron/title_bar.js
 4  src/COMPONENTs/chat-bubble/components/message_action_bar.js
 3  src/COMPONENTs/chat-input/components/input_action_buttons.js
 3  src/COMPONENTs/toolkit/plugins_shell.js
 3  src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js
```

E-0072 / E-0049 指认的 4 个按钮是这 81 个里的 4 个。**这不是气泡的局部问题，是一条「靠调用方自觉」的机制在 81 个点上失效。** 其中 `title_bar.js` 的 4 个在本 owner 边界内（窗口最小化 / 最大化 / 关闭 / 恢复），即本 owner 自己也没传。

**（三）焦点不可见是原语级缺陷，不是调用方能修的**

`:265` 写死 `outline: "none"`，而 `DEFAULT_BUTTON_STYLE.state`（`:128-132`）只有 `hover` / `active` / `disabled` 三个槽，`resolveStateStyle`（`:135-173`）也只读这三个。**原语没有 focus 通道** —— 调用方即使想给焦点态一个可见样式，也没有传入口（只能整体覆盖 `root.outline`，那会同时改掉鼠标态）。这与 E-0072 第（四）段一致，且本条补充：这是**结构性无出口**，故必须修在原语层。

**（四）`disabled` 的语义选择也在原语层**

`:325` 用的是原生 `disabled` 属性。原生 `disabled` 把元素移出 tab order 且不向 AT 播报状态；可访问的替代形态是 `aria-disabled="true"` + 保留可聚焦 + 拦截激活。原语今天不提供后者。**这一条决定了任何「blocked 时用户能不能得到解释」的方案在气泡侧的可达上界**，因此 Q4-D 的处置不可能完全落在 `code-owner-chat-bubble` 一侧。

**（五）无测试**

`src/BUILTIN_COMPONENTs/input/` 下 `slider` / `spinner_button` / `tag_input` / `segmented_button` 各有测试文件，**`button.js` 没有**。它是本仓被消费最广的原语之一（100 个 icon-only 调用点，未统计带文字的），当前零测试覆盖。
- **完整性限制**:
  1. icon-only 判定是文本级启发式：花括号配平后按属性字符串匹配。带展开属性（`{...props}`）或把 `ariaLabel` 放在变量里再展开的调用点会被误判为「未传」。**100 / 81 是量级，不是精确计数。**
  2. 未用读屏或 devtools accessibility tree 实测任何一个按钮的可访问名，该部分沿用 E-0072 的静态推导。
  3. 未实测 tab order 与焦点渲染，只读声明。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0104 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/icon/icon.js:14-19`（`const Icon = ({ src, color, ...props }) => { ... useState(<div className="mini-ui-img-icon" {...props} />) }`）、`:21-70`（`fetch_icon` 的四个 `setComponent` 分支：`UISVGs` `:26-32`、`LogoSVGs` `:35-41`、`fileTypeSVGs` `:44-55`、动态 import `:58-68`）
- **取得方式**: 当前 `dev` checkout 只读检查。
- **提交发言**: S-0015
- **支持/反驳**: 补充 E-0072（其判定 `icon.js` 「`props` 不透传」；本条给出更精确的形态并指出它是一个不对称，不是一个恒定行为）

**`Icon` 接受任意透传 props，但只把它们挂在「图标还没加载出来」的那一帧上。**

- `:18` 初始 state 是 `<div className="mini-ui-img-icon" {...props} />` —— **props 在这里被展开**。
- `:26 / :35 / :44 / :58` 四个解析后的分支，全部 **不展开 `props`**：`UISVGs` / `LogoSVGs` 分支只传 `className` / `fill` / `style`；两个 `<img>` 分支只传 `className` / `src` / `alt` / `draggable` / `style`。

后果：`<Icon src="edit_pen" aria-hidden="true" />` 这样的写法在异步解析完成前生效、完成后静默失效。任何试图从调用方给内联 SVG 图标补可访问性属性的做法，**在这个组件上会表现为「本地测试里像是生效了、真跑起来又没了」**，这是最难被发现的一类失效。

E-0072 附带指出的另一条在本条复核后成立：`fileTypeSVGs` 与动态 import 两个 `<img>` 分支 **会** 产生 `alt`（`src.replace(/_/g," ")`），而 `UISVGs` / `LogoSVGs` 两个内联 SVG 分支 **不会** 产生任何可访问名。即同一个 `Icon` 组件，可访问名的有无取决于图标名落在哪个注册表里 —— 调用方无从预知，也无从覆盖。

**对本案的意义**：这是「四个图标按钮可访问名恒为空」在 `Button` 之外的第二道闸。即使 `message_action_bar.js` 明天补上 `ariaLabel`，`Icon` 这条不对称仍然存在，并会在下一个想给图标补语义的调用点上重现。**修 `Button` 的可访问名不需要先修 `Icon`；但只修调用方而不动这两处，同类缺陷会继续产生。**
- **完整性限制**:
  1. 静态检查。未构造一次真实渲染来观察 props 在解析前后的实际存续。
  2. 未穷举 `UISVGs` / `LogoSVGs` 中是否有个别 SVG 组件自带 `<title>`；E-0072 只核实了 `EditPen`（`icon_manifest.js:400-407`）无 `<title>` / `role` / `aria-label`。其余条目 **未核实**。
  3. 未评估补 `aria-hidden` 与补 `aria-label` 哪一种是正确处置 —— 那取决于按钮是否已有自己的可访问名，属方案层。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0105 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/markdown/markdown.js:361`（`simplifiedAutoLink: true`）、`:362`（`...options` 允许调用方覆盖）、`:184`（`sanitize_html = false` **默认关闭**）、`:378-385`（`mergedComponents` 只覆写 `pre` 与 `think`，**无 `a` 覆写**）、`:401-408`（`<ReactShowdown ... sanitizeHtml={sanitize_html} />`）
  - `/Users/red/Desktop/GITRepo/PuPu/node_modules/showdown/dist/showdown.js:2885-2887`（三条 autolink 正则，scheme 白名单硬编码为 `(https?|ftp|dict)://|www\.`）、`:2929-2956`（`autoLinks` / `simplifiedAutoLinks` subparser）
  - `/Users/red/Desktop/GITRepo/PuPu/electron/main/window/main_window.js:341`（`setWindowOpenHandler`）、`:348`（`will-navigate`）
- **取得方式**: 只读检查 + **实跑 showdown**：`node -e` 直接调 `new showdown.Converter({simplifiedAutoLink:true}).makeHtml(...)` 对四种输入取实际 HTML 输出。
- **提交发言**: S-0015
- **支持/反驳**: **部分反驳 E-0048 / S-0009 约束 4** —— 「`pupu://` 出现在正文里就是死链」只对 **裸串** 成立；显式链接语法今天就产出真 `href`

**实跑输出（showdown，`simplifiedAutoLink: true`）**

| 输入 | 输出 HTML |
|---|---|
| `bare: pupu://artifact/mem@1 here` | `<p>bare: pupu://artifact/mem@1 here</p>` —— **未 linkify** |
| `[open](pupu://artifact/mem@1)` | `<p><a href="pupu://artifact/mem@1">open</a></p>` —— **产出真 href** |
| `<pupu://artifact/mem@1>` | `<p><pupu://artifact/mem@1></p>` —— 未 linkify |
| `see https://x.com/a ok` | `<p>see <a href="https://x.com/a">…</a></p>` —— 对照组，正常 linkify |

**（一）今天这条约束靠什么保证：靠 `node_modules` 里的一个常量**

裸串不被 linkify，唯一原因是 `showdown.js:2885-2887` 的三条正则把 scheme 白名单写死成 `https?|ftp|dict`。这 **不是本仓的任何一个决定**，本仓没有 `urlTransform`、没有 `a` 组件覆写、没有 href 过滤器、`sanitize_html` 默认还是 `false`。即：**约束成立，但没有承载它的代码。** 一次 showdown 升级、一次改用 `react-markdown`、或任一调用方经 `options` 传入不同配置，都会无声改变它，而没有任何测试会红。

**（二）更要紧的：约束今天就是破的，而且不需要「将来某次改动」**

`[label](pupu://…)` 产出 `<a href="pupu://artifact/mem@1">`。触发它不需要改代码 —— **模型在正文里写一句 markdown 链接就够了**。S-0009 约束 4 的表述（「`pupu://` 不得被 linkify 成 `href`」）在裸串形态下成立，在显式链接形态下今天已不成立。

**（三）点击后会发生什么：未核实**

`electron/main/window/main_window.js` 有 `setWindowOpenHandler`（`:341`）与 `will-navigate`（`:348`）两个拦截点，但 **本 owner 未读其实现，未构造点击，未观察未注册 scheme 在渲染进程内被点击时的实际行为**（可能被 will-navigate 拦下、可能交给系统 handler、macOS 上通常静默失败）。该分支按 **未核实** 交，其判定属 `code-owner-electron` 边界。

**本条不主张「这是个安全问题」** —— 是否构成风险取决于上一段那个未核实的分支。本条只主张：**这条约束当前没有任何机械保证，且其中一半形态已经不成立。**
- **完整性限制**:
  1. showdown 实跑用的是仓内 `node_modules` 的版本，未记录版本号，未核实生产 bundle 与之一致。
  2. 未核实 `code-owner-chat-bubble` 的 `seamless_markdown.js` 是否在 BUILTIN `Markdown` 之上另加了 `a` 覆写或 sanitize —— 该文件属其边界，E-0048 已判「未出现 `openExternal`、自定义 `a` 渲染器或 `href` 拦截」，本条采信不复验。
  3. 未核实点击行为（见第三段）。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0106 | repository
- **来源定位**:
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/`（33 个子目录全清单：`background` `bar_chart` `branch_graph` `card` `carousel` `class` `code` `color_picker` `consts` `context_menu` `dnd` `electron` `explorer` `flow_editor` `fonts` `icon` `input` `markdown` `mini_react` `modal` `pca` `scatter` `select` `spinner` `stack` `suspense` `theme` `timeline` `timeline_v2` `toast` `tooltip` `top_progress_bar`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/toast/toast_host.js:165-166`（`role={assertive ? "alert" : "status"}` / `aria-live={assertive ? "assertive" : "polite"}`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/COMPONENTs/boot-overlay/boot_overlay.js:335`（`aria-live="polite"`）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js:6-44`（`SHELL_FILES` 白名单，**`:32` 已含 `src/COMPONENTs/memory-inspect/memory_inspect_modal.js`**）、`:46-53`（判据：`BG_HINT` = `background|[A-Za-z]Bg\b|\bbg\b`，`OPAQUE_LITERAL` = 不透明色字面量）、`:73`（`line.includes("var(--pupu-")` 即放行）
  - `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/theme/shell_background_allowlist.js`（内容锚定豁免表，5 条）
- **取得方式**: 当前 `dev` checkout 目录遍历 + `grep -rln "banner|Banner|notice|Notice|callout|Callout|StatusBar|status_bar" src/BUILTIN_COMPONENTs/`（仅命中 `toast_host.js` 与两个字体 OFL 许可证文本，无组件）+ `grep -rn "aria-live" src/ --include="*.js"`。
- **提交发言**: S-0015
- **支持/反驳**: 回答 S-0012 提出的「状态注记条有没有现成形态可复用」；限缩「`shell_background_guard` 能约束四态呈现」这一可能的误读

**（一）BUILTIN 里没有「状态注记条」这个形态**

33 个子目录逐个核对，最接近的三个都不是：

| 候选 | 为什么不是 |
|---|---|
| `toast/toast_host.js` | **瞬时**。它是通知总线的渲染端，会自行消失。状态注记条的定义特征是**与状态同生命周期**（状态在，条就在），二者的存续语义相反 |
| `card/card.js` | 纯容器（`children` + `Card.Layer`），无状态语义、无 live region、无左规/图标槽 |
| `top_progress_bar` | 进度，不是状态说明 |

即：`expert-ux` 主张的「两种呈现形态（内容区 / 状态注记条）」中的第二种，**在本 owner 的库里没有可复用件**。E-0073 指出的 `boot_overlay.js` 是一份跑通的先例，但它在 `src/COMPONENTs/boot-overlay/`，**不在 BUILTIN，不归本 owner**，且它是一块全屏遮罩而不是一条嵌入式注记。

**（二）全仓只有两个 live region**

`grep -rn "aria-live" src/ --include="*.js"`（排除测试）**只有两行**：`toast_host.js:166` 与 `boot_overlay.js:335`。

后果：今天任何「状态变了但画面没换」的情形，对读屏用户都是零播报 —— 这正是 Q4-A / Q4-D 的核心症状。四态呈现若要向 AT 传达状态变化，**必须自带 live region**，因为除 toast 之外没有任何既有通道；而 toast 的瞬时语义与「持续处于未就绪」不匹配。

**（三）`shell_background_guard` 覆盖不到四态呈现的任何一个取值**

该测试的判据（`:46-53`）是「行内既提到背景 sink，又带不透明色字面量」。它：

- **已经把 `memory_inspect_modal.js` 收进白名单**（`:32`），所以 Inspector 不是"未被守护的文件"；
- 但它 **只管背景，不管前景**。E-0070 指认的 `meta_color`（一个 `color:` 声明，且是 `rgba(...,0.28)` 半透明）**两个判据都不命中**：不是 background sink，也不是不透明字面量。同理 E-0071 的 disclaimer `color`。

**因此本仓今天没有任何测试对文字对比度做过约束。** `contrast_window.js` 里的 4.5 / 3.0 / 1.9 三个阈值只作用于 **主题编辑器的取色范围**，不作用于 **组件写出来的前景色**。这条真空是 E-0070 / E-0071 那六个不达标取值能长期存在的机制。
- **完整性限制**:
  1. 「没有可复用形态」是按 **组件目录 + 名称检索** 得出的。若某个既有组件内部有一段未抽出的注记条 JSX（例如 `select` 或 `explorer` 内），本检索不会命中。**未做逐文件通读**（33 目录 / 85 生产文件）。
  2. `aria-live` 统计只覆盖该属性字面量，未统计 `role="alert"` / `role="status"` 的独立用法（`toast_host.js:165` 是同一处）。
  3. 未跑 `shell_background_guard.test.js`，其当前是否全绿未核实；本条只解析其判据。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0107 | repository
- **来源定位**: `/Users/red/Desktop/GITRepo/PuPu/src/BUILTIN_COMPONENTs/mini_react/use_translation.js:73-93`（`t` 的三级回退全文）、`:62-71`（`messages = LOCALE_MAP[currentLocale] || en`）、`:4-28`（11 个 locale 静态 import + `LOCALE_MAP`）、`:34-46`（`resolveKey`）
- **取得方式**: 当前 `dev` checkout 只读检查 + 本地 `python3` 对 `en.json` / `de.json` 展平后做差集，并回代到 `t()` 的三级分支上逐级判定实际返回值。
- **提交发言**: S-0015
- **支持/反驳**: **限缩 E-0036 / S-0008 与 S-0012 对该回退的根因判定**；不反驳其「必须配守卫」的结论

**（一）三级回退的第三级，触发条件比两位必到者主张的窄得多**

`use_translation.js:73-91` 的判定顺序：

1. `resolveKey(messages, key)` —— 当前 locale 命中 → 返回译文
2. `currentLocale !== "en"` 且 `resolveKey(en, key)` 命中 → **返回英文原文**
3. 都不命中 → `return key`

**第三级只在 `en.json` 里也没有这个键时才会触发。** 而 `en.json` 是源语言、与代码同批作者、同批 review。因此：

| 缺口类型 | 走第几级 | 用户实际看到 |
|---|---|---|
| **翻译滞后**（键在 en.json，某 locale 没跟上） | 第 2 级 | **正确的英文句子** |
| **作者笔误**（键从来没写进 en.json） | 第 3 级 | 字面量点分路径 |

**实测**：`en.json` 有而 `de.json` 没有的键 **49 个，49 个全部存在于 `en.json`**（按定义如此）。即 S-0008 / E-0036 指认的那 49 个缺口，**没有一个会退化成 key 串** —— 它们全部渲染为可读英文。真正退化成 key 串的是 E-0039 里那 6 个 `chat.custom_provider_error.*`，实测 `en.json` 展平后含 `custom_provider` 的键为 **`[]`**，即从未被写入源语言。

**（二）由此对本案的两条修正**

1. **S-0012 的表述需要限缩。** 其判定「取代式空屏与真空屏只差一个字符串，而字符串在 i18n 回退下会退化成 key，两态当场同形」有两处不准：(a) 退化的前提是键在 **en.json** 缺失，而不是在某个 locale 缺失；(b) 退化的结果不是 **同形**，而是两态都变得不可读 —— 一个显示点分路径、一个空白，仍然可区分，只是都不可解。方向性判断（i18n 会削弱四态的可辨识性）成立，机制描述需要按本条替换。
2. **保证「四态文案不得静默退化成 key」所需的机制，比 11-locale 对等性窄一个量级。** 充分条件只有一条：**四态渲染路径引用的每个 `t()` 键都存在于 `en.json`**。这是单文件、单语言的检查，不涉及 11 倍体积代价（E-0036 末段），也不涉及 154 条译文的粒度取舍。11-locale 对等性仍然值得做，但它保证的是 **翻译质量**，不是 **可读性安全** —— 两件事在本案里被合并成了一件。

**（三）为什么第三级不该改成抛错或返回空**

`use_translation.js` 是全仓 638 个键、每一个 `t()` 调用点的唯一出口。把最后一级改成抛错，会把一次作者笔误从「屏幕上出现一行点分路径」升级成「整棵子树白屏」；改成返回空串，会把它从 **可自我指认的失效** 降级成 **不可见的失效**（用户与开发者都看不出少了什么）。当前返回 key 是三种里 **唯一自带诊断信息** 的那一种：屏幕上出现 `chat.custom_provider_error.missing_api_key.title` 时，任何人都能直接 grep 到它。

**该改的不是回退，是回退之外没有任何东西在看。** E-0039 已证明这一点：6 个键从来没存在过，`i18n-coverage` 的 `t()`-引用-对-`en.json` 口径本应能捞到它们，但没有拦住 —— 缺的是 **在 CI 里跑**，不是 **在用户面前抛错**。
- **完整性限制**:
  1. 差集只对 `en` vs `de` 一对做了实跑（49 个，与 E-0036 的表一致）；其余 9 个 locale 采信 E-0036，未复验。
  2. 第 2 级返回英文这一点是 **读代码 + 差集推得的 INFERENCE**，未构造一次真实的 de locale 渲染来目视英文兜底。
  3. 「dev-only 告警」是本 owner 的建议方向，**未实现、未评估其在测试环境下的噪音量**。
  4. 未评估 11 个 locale 静态 import（`:4-14`）的 bundle 体积，采信 E-0036 的「按 11 倍计」。
- **验证历史**:
  - S-0015 | 未验证 | 提交时状态

### E-0110 | repository
- **来源定位**: `SQLiteContextV2StoreReadStatus` 的实际字段集与 docstring 原文，逐字复核。

  `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:69-89`
  ```python
  @dataclass(frozen=True, slots=True)
  class SQLiteContextV2StoreReadStatus:
      """Database-level health only; it carries no chat or execution scope."""

      available: bool
      schema_version: int
      journal_mode: str
      lexical_backend: str
      vector_status: str = "disabled"

      SCHEMA = "unchain.sqlite_context_v2_store_read_status.v1"

      def to_dict(self) -> dict[str, object]:
          return {
              "schema": self.SCHEMA,
              "available": self.available,
              "schema_version": self.schema_version,
              "journal_mode": self.journal_mode,
              "lexical_backend": self.lexical_backend,
              "vector_status": self.vector_status,
          }
  ```

  逐项核对 E-0027 的三项主张：

  1. **「只有 5 个字段」—— 属实。** dataclass 字段恰为 5 个：`available` / `schema_version` / `journal_mode` / `lexical_backend` / `vector_status`。`SCHEMA` 是无类型标注的类属性，不是 dataclass field（`slots=True` 下也不占 slot），因此 E-0027 把它排除在字段计数外是正确的。
  2. **docstring 原话 —— 属实且逐字一致。** `sqlite_read_v2.py:71` 的 docstring 全文为 `"""Database-level health only; it carries no chat or execution scope."""`，其中包含 E-0027 引用的 `"carries no chat or execution scope"`，无改写。
  3. **`to_dict()` 6 键 —— 属实。** `schema` + 上述 5 个，无第七键。

  **补充一处 E-0027 未提但方向一致的事实**：该类型在全仓只有 **一个构造点**（`sqlite_read_v2.py:166-171`），且是 `read_sqlite_context_v2_store_status()` 的唯一返回路径。全仓引用点穷举（`grep -rn "SQLiteContextV2StoreReadStatus" src/`）共 6 处，全部落在 `persistence/sqlite_read_v2.py`（定义 70 / 返回标注 94 / 构造 166 / `__all__` 1302）与 `persistence/__init__.py`（import 10 / `__all__` 26），无其他子类、无其他工厂、无 `**kwargs` 扩展点。因此「结构上不存在 counts」不是「当前实现没填」，而是类型层面确实没有该字段，且没有第二条产出路径可以绕过。

- **取得方式**: 只读检查。`Read` 工具读 `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py`（工作树）；`git show a4e69f41:src/unchain/persistence/sqlite_read_v2.py`（lock 记录的 revision，见 E-0111）。引用点穷举用 `grep -rn "SQLiteContextV2StoreReadStatus" src/`。未修改任何文件、未切换分支。
- **提交发言**: S-0016
- **支持/反驳**: 支持 E-0027 与 S-0007（复核确认其事实主张的三项全部成立）
- **完整性限制**:
  1. 只核了 Python 类型定义本身。未运行时构造该对象验证 `to_dict()` 的实际输出键（静态读取已足以确定键集，因为 `to_dict()` 是字面量 dict）。
  2. 本条只回答「该类型有没有 counts」。「unchain 平面上别处有没有 counts」是另一个问题，见 E-0112 / E-0113。
- **验证历史**:
  - S-0016 | 已验证 | `code-owner-unchain` 在边界内逐字复核工作树与 revision `a4e69f41` 两份副本，两者一致（E-0111）

### E-0111 | command
- **来源定位**: 补上 E-0027 自陈的取证缺口 —— unchain 本地工作树与 `unchain-core.lock.json` 记录的 revision `a4e69f41` **是否已分叉**。结论：**未分叉，两者对本文件逐字节一致**。

  **(a) lock 记录的 revision**

  `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/unchain-core.lock.json`（全文 5 行）
  ```json
  {
    "repository": "unchain",
    "revision": "a4e69f413c449c5768433ba4dddc5b60b8146991",
    "context_memory_contract": 1
  }
  ```

  **(b) unchain 工作树当前状态**
  ```
  $ git -C /Users/red/Desktop/GITRepo/unchain rev-parse --abbrev-ref HEAD
  dev
  $ git -C /Users/red/Desktop/GITRepo/unchain rev-parse HEAD
  a4e69f413c449c5768433ba4dddc5b60b8146991
  $ git -C /Users/red/Desktop/GITRepo/unchain status --porcelain
  (无输出 —— 工作树干净，无未提交改动、无未跟踪文件)
  ```

  HEAD 与 lock 记录的 revision **完全相同**，且工作树干净。

  **(c) 对目标文件的直接比对**
  ```
  $ git -C /Users/red/Desktop/GITRepo/unchain diff a4e69f41 -- src/unchain/persistence/sqlite_read_v2.py
  (无输出 —— 工作树副本与 revision a4e69f41 的 blob 无差异)
  ```

  **(d) 直接从 revision 取 blob 复核（不触工作树）**
  ```
  $ git -C /Users/red/Desktop/GITRepo/unchain show a4e69f41:src/unchain/persistence/sqlite_read_v2.py | sed -n '69,90p'
  @dataclass(frozen=True, slots=True)
  class SQLiteContextV2StoreReadStatus:
      """Database-level health only; it carries no chat or execution scope."""

      available: bool
      schema_version: int
      journal_mode: str
      lexical_backend: str
      vector_status: str = "disabled"

      SCHEMA = "unchain.sqlite_context_v2_store_read_status.v1"

      def to_dict(self) -> dict[str, object]:
          return {
              "schema": self.SCHEMA,
              ...
          }
  ```
  与 E-0110 引用的工作树内容逐字一致，行号也一致（69-89）。

  **结论**：E-0027 的完整性限制第 1 条（「读的是本地工作树而非 lock 记录的 revision，两者若已分叉需复核」）**已解除** —— 本案时点两者未分叉，E-0027 引用的代码同时成立于工作树与 revision `a4e69f41`，不存在需要指出的差异。

  注：这一条只对 `sqlite_read_v2.py` 与 HEAD 本身作出断言。它不断言 PuPu 运行时实际加载的 `unchain` 包一定来自这个 checkout（见完整性限制 2）。

- **取得方式**: 只读 git 查询（`rev-parse` / `status --porcelain` / `diff <rev> -- <path>` / `show <rev>:<path>`），全部不改工作树、不切分支、不 checkout。lock 文件用 `Read` 工具读取。取证时间 2026-08-07。
- **提交发言**: S-0016
- **支持/反驳**: 支持 E-0027（消除其自陈的第 1 项完整性限制）；支持 S-0007 不确定性第 3 条的关闭
- **完整性限制**:
  1. 这是 **本案时点** 的快照。unchain `dev` 分支后续推进后，工作树可能领先 lock；本条不对未来时点作断言。
  2. 未验证 PuPu sidecar 运行时 `import unchain` 实际解析到哪个路径（可能是本 checkout 的 editable install，也可能是别处的 site-packages）。若两者不同，E-0110/E-0112/E-0113 的结论适用于 **本 checkout 与 revision `a4e69f41`**，而非必然适用于运行中的进程。该验证需要跑起 sidecar，超出本次只读传唤范围。
- **验证历史**:
  - S-0016 | 已验证 | 命令输出直接呈堂，可原样复跑

### E-0112 | repository
- **来源定位**: 同一文件里还存在 **第二个、名字极近的状态类型** `SQLiteContextV2ReadStatus`（少一个 `Store`），它 **带 scope 也带计数**，但 **不带 entries / candidates 计数**。E-0027 未提及它；此处补全，以免庭上把「上游没有任何带 scope 的状态」误读成事实。

  `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:231-257`
  ```python
  @dataclass(frozen=True, slots=True)
  class SQLiteContextV2ReadStatus:
      available: bool
      owner_chat_id: str
      execution_count: int
      space_id: str
      space_revision: int
      journal: str = "available"
      artifacts: str = "available"
      workspace: str = "available"
      search: str = "ready"

      SCHEMA = "unchain.sqlite_context_v2_read_status.v1"
  ```

  产出点：`BoundSQLiteContextV2ReadService.status()`，`sqlite_read_v2.py:444-473`。必须先 `bind(scope)` 才能拿到，`ContextV2ReadScope`（`:186-228`）强制要求 `owner_chat_id` + 非空 `execution_ids` + `space_id`，即 **一次只能看一个 chat**。

  两个类型的分工，对本案的意义：

  | | `SQLiteContextV2StoreReadStatus` | `SQLiteContextV2ReadStatus` |
  |---|---|---|
  | 层级 | 库级（无 scope） | chat 级（bind 后） |
  | 字段数 | 5 | 9 |
  | 带计数？ | 无 | 有 `execution_count`、`space_revision` |
  | entries / candidates 计数？ | **无** | **无** |
  | PuPu `/context/v2/status` 用的是 | **这个** | 不是这个 |
  | `available=False` 可产出？ | 否（失败走异常，见 E-0114） | 否（同上，`:467` 硬编码 `True`） |

  **要点**：`execution_count` 证明 unchain 平面 **并不排斥在只读状态里带计数** —— 带 scope 的那一面已经带了。缺的不是「计数这个概念」，而是 **entries / candidates 这两个具体计数**，且缺在 **两个** 状态类型上。因此 E-0027 的「结构上不存在」在 counts 这一点上成立，但其成立的理由不是「上游拒绝计数」，而是「上游只在 bind 到单个 chat 之后才谈计数，且没算 entries/candidates」。

  这一点反过来支撑 Q3 的 **另一条独立支撑**（counts 是全库跨 chat 聚合、属 scope 泄漏）：unchain 平面上 **所有** 只读面都强制 bind 到单个 chat/binding（`ContextV2ReadScope` 见上；curator 侧的 `SQLiteCuratorQueryV2Store.bind()` 要求 `binding_id` + `owner_chat_id` + `target_space_id`，`sqlite_curator_query_v2.py:225-260`）。unchain 平面 **没有任何跨 chat 聚合的只读入口**。

- **取得方式**: 只读检查，`/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py` 与 `sqlite_curator_query_v2.py`（工作树；per E-0111 与 revision `a4e69f41` 一致）。符号清单用 `grep -n "^class \|^    def \|^def "` 穷举。
- **提交发言**: S-0016
- **支持/反驳**: 部分支持 E-0027（其 counts 结论成立），同时 **修正** 其隐含表述（上游并非「只有一个 5 字段状态」，而是两个状态且另一个带 scope 与计数）；补齐 E-0027 完整性限制第 2 条
- **完整性限制**:
  1. 只穷举了 `persistence/` 下的只读状态类型与 `sqlite_read_v2.py` / `sqlite_curator_query_v2.py` 的公开方法。未穷举 `memory/toolkit/` 下面向 agent（而非面向 host UI）的工具面。
  2. 本条不主张 PuPu 应当或不应当改用 `SQLiteContextV2ReadStatus`；那是跨仓契约取舍，本案不裁。
- **验证历史**:
  - S-0016 | 已验证 | 定义与产出点均在 `code-owner-unchain` 边界内直读

### E-0113 | repository
- **来源定位**: 对「unchain 平面上今天有没有任何能给出 entries / candidates 计数的只读面」作 **穷举式** 回答。结论：**没有计数面。计数只能靠枚举，而枚举是有上限且截断不可分辨的。**

  **(a) 全仓不存在计数方法**
  ```
  $ grep -rn "def .*count" /Users/red/Desktop/GITRepo/unchain/src/unchain/
  (无输出)
  ```
  整个 `src/unchain/` 下没有任何名字含 `count` 的方法。

  **(b) 两个只读模块里 `SELECT COUNT(` 仅一处，且不是对外面**
  ```
  $ grep -rn "SELECT COUNT(" src/unchain/persistence/sqlite_read_v2.py \
                             src/unchain/persistence/sqlite_curator_query_v2.py
  src/unchain/persistence/sqlite_read_v2.py:1034
  ```
  该处（`sqlite_read_v2.py:1032-1042`）是 `read_checkpoint_events()` 内部对单个 `execution_id` 在一段 `store_seq` 区间内的事件数做 **分页完整性校验**，结果只用于本次分页，不进入任何返回类型。不是可供 UI 消费的计数面。

  **(c) entries 侧：分页对象不带 total**

  `/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py:445-450`
  ```python
  class MemoryEntryPage:
      SCHEMA: ClassVar[str] = "unchain.memory_entry_page.v1"

      entries: tuple[MemoryEntry, ...] = ()
      next_cursor: str | None = None
      has_more: bool = False
  ```
  三个字段，**无 total / 无 count**。`sqlite_read_v2.py` 上返回它的三个入口 —— `list_workspace()`（`:1226`）、`workspace_tree()`（`:1241`）、`get_workspace_entry()`（`:1258`）—— 都受 `_MAX_LIST_RESULTS = 200`（`:53`）与 `_MAX_LIST_SCAN = 10_000`（`:54`）约束。

  同一形状在 memory host 面重复：`sqlite_memory_host_v2.py:163-179` 的 `list_entries()` 返回 `{"entries", "truncated", "next_cursor"}`，同样无 total。

  → **entries 计数只能靠翻页累加**，代价 O(N)，且没有任何单次调用能给出总数。

  **(d) candidates 侧：连分页对象都没有，是裸 tuple + 硬上限**

  `/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_curator_query_v2.py:562-567`
  ```python
  def list_candidates(
      self,
      *,
      status: CandidateStatus | None = None,
      limit: int = 100,
  ) -> tuple[FrozenCandidateSnapshot, ...]:
  ```
  返回值是 **裸 tuple**，没有 `has_more`、没有 `next_cursor`、没有 total。`limit` 经 `_limit()`（`:98-104`）强制落在 `1..500`（`_MAX_LIST_RESULTS = 500`，`:35`），SQL 是 `... ORDER BY updated_at_ms DESC, candidate_id LIMIT ?`（`:581-584`）。

  → 由此产生一个 **截断不可分辨** 的性质：拿到 500 条时，无法区分「恰好 500 个」与「还有更多」。把 `len(list_candidates(limit=500))` 当计数用，在 candidates ≥ 500 时会 **无声地报出 500**。这不是「变空」，是「封顶后谎报」—— 与本案「空即失败」同族但表现相反，同样对用户不可见。

  **(e) 一切只读面都强制 bind 到单个 chat**

  `ContextV2ReadScope`（`sqlite_read_v2.py:186-228`）与 `SQLiteCuratorQueryV2Store.bind()`（`sqlite_curator_query_v2.py:225-259`）都要求 `owner_chat_id`。unchain 平面 **没有任何跨 chat 的聚合入口**（详见 E-0112）。

  **对 E-0027 推论的裁断**：「切 store owner 那天 counts 会静默变空」—— **成立**。理由链完整：`/context/v2/status` 在 unchain owner 下的唯一数据源是 `read_sqlite_context_v2_store_status()`（PuPu 侧 `memory_v2_unchain_read_adapter.py:704-706` 直接 `.to_dict()` 后加 `storeOwner`），该函数只能产出 E-0110 的 5 个字段；unchain 平面上不存在任何可替代的计数面来把 counts 补回去。

  **一处措辞修正**：「静默」取决于 PuPu 侧的读法，不取决于 unchain。PuPu 现有代码在同一处对上游字段用的是软读（`route_memory_v2.py:990` 的 `status.get("vector_status")`），若 counts 照此实现则确为静默空；若改用 `status["counts"]` 则是 `KeyError` → 500 硬失败。**两种都不可接受，但只有前者叫「静默」。** 该实现选择落在 `code-owner-runtime` 边界内，本条只作只读引用、不主张处置权。

- **取得方式**: 只读检查 + 只读 grep。文件：`/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py`、`.../sqlite_curator_query_v2.py`、`.../sqlite_memory_host_v2.py`、`/Users/red/Desktop/GITRepo/unchain/src/unchain/memory/workspace/models.py`（工作树；per E-0111 与 revision `a4e69f41` 一致）。跨仓只读引用：`/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py`、`.../memory_v2_unchain_read_adapter.py`。
- **提交发言**: S-0016
- **支持/反驳**: 支持 E-0027 与 S-0007 的 Q3 结论；对其「静默」措辞作一处限定修正；补齐 E-0027 完整性限制第 2 条（「未穷举 unchain 侧是否另有带 counts 的只读状态 API」—— 已穷举，无）
- **完整性限制**:
  1. 穷举依据是 `grep -rn "def .*count"` 全仓零命中 + 两个只读模块的公开方法清单逐条过目。若某处以别名（如 `total`、`size`、`cardinality`）暴露计数而方法名不含 `count`，本次静态扫描可能漏掉；已抽查 `MemoryEntryPage` / `list_entries` / `list_candidates` 三个最可能的载体，均无。
  2. (d) 的「≥500 时谎报」是从 SQL 与返回类型推出的结构性质，**未跑运行时验证**（需要造 500+ candidates 的 fixture，超出本次只读传唤范围）。
  3. 本条不进入 Q6（只读 task-state 契约）—— 该问题属 case `0000-0004-2026-0807`。
- **验证历史**:
  - S-0016 | 已验证 | unchain 侧全部在边界内直读；PuPu 侧两处为只读引用，未主张处置权

### E-0114 | repository
- **来源定位**: 主动补充，直指本案题目（「记忆系统在正常 / 为空 / 未就绪 / 失败四态下用户分别看到什么」）。在 `unchain` store owner 下，`/context/v2/status` 的 5 个字段里有 **两个是结构性恒定的**，无法表达四态中的两态。

  唯一构造点，`/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:166-171`
  ```python
      return SQLiteContextV2StoreReadStatus(
          available=True,
          schema_version=max(context_versions),
          journal_mode=journal_mode,
          lexical_backend="fts5" if fts_available else "degraded",
      )
  ```

  **(1) `available` 恒为 `True`，`available=False` 永不产出。**

  该行硬编码 `available=True`，且这是全仓唯一构造点（E-0110 已穷举）。`read_sqlite_context_v2_store_status()` 的所有失败路径都 `raise SQLiteContextV2ReadError`，不返回 `available=False`：库文件不存在（`:99-100`）、`quick_check` 失败（`:109-110`）、schema 版本不匹配或必需表缺失（`:137-144`）、journal mode 非 WAL（`:148-149`）、以及 `OSError / sqlite3.Error / TypeError / ValueError` 的兜底（`:162-165`）。

  → 「未就绪」与「失败」在 unchain 平面上 **只有异常这一种表达**，不是一个可读的布尔态。PuPu 侧把它接成 HTTP 503（`route_memory_v2.py:815-831` 两处 `MemoryV2Error(..., status_code=503, retryable=True)`）。因此 `/context/v2/status` 的语义实际是「**要么 200 且 `available:true`，要么 503**」—— `available` 字段本身不携带信息。任何把「未就绪」与「失败」区分开来的用户可见文案，都不能从这个字段读出。

  **(2) `vector_status` 恒为 `"disabled"`。**

  构造时 **不传** `vector_status`，因此永远取 dataclass 默认值 `"disabled"`（`:77`）。全仓对该字段的写入点穷举：
  ```
  $ grep -rn "vector_status" /Users/red/Desktop/GITRepo/unchain/src/unchain/
  src/unchain/memory/toolkit/toolkit.py:534      "vector_status": chat_visible.get("vector_status", "degraded")
  src/unchain/memory/toolkit/services.py:126     "vector_status": "degraded" if result.vector_error else "ready"
  src/unchain/persistence/sqlite_read_v2.py:77   vector_status: str = "disabled"        ← 默认值
  src/unchain/persistence/sqlite_read_v2.py:88   "vector_status": self.vector_status    ← to_dict 透传
  src/unchain/persistence/sqlite_memory_host_v2.py:191  "degraded" if result.vector_error else "ready"
  ```
  真实的 vector 健康度 **确实存在**，但只活在 memory-host / toolkit 面（`sqlite_memory_host_v2.py:191`、`memory/toolkit/services.py:126`，取值 `ready` / `degraded`），且是 **搜索调用的副产品** —— 要有 `result` 才有该值，即必须先跑一次 search。store-status 这条路径不跑 search，因此拿不到。

  → 在 unchain owner 下，`/context/v2/status` 的 `vector_status` **恒为 `"disabled"`，与向量索引实际状态无关**。PuPu 侧 `route_memory_v2.py:990-994` 会把它归一化后原样吐出，`"disabled"` 在其白名单内、不会被改写成 `degraded`。

  **对本案的意义**：本案要根治「空即失败」。上面两条是同一病灶的另外两个面 ——
  - `available` 把「未就绪」与「失败」压成同一个 503，用户无从分辨；
  - `vector_status` 把「向量已就绪 / 已降级 / 未启用」三态压成恒定的 `"disabled"`，即 **恒定说自己关着**。

  这两条 **不是 counts 问题**，即使 Q3 判「不开 counts」也依然存在，且会直接决定「未就绪」与「失败」两态下用户看到什么。建议纳入本案的四态盘点，而不是留给 counts 议题陪葬。

  处置归属：字段与构造点在 `unchain` 边界内（我）；四态的用户可见呈现在 PuPu 边界内（`code-owner-runtime` / 相关 UI owner）。本条只呈事实，不主张改动 —— 任何改 `SQLiteContextV2StoreReadStatus` 的动作都是跨仓契约变更，须走双边 impact（见 S-0016 的 C-U1）。

- **取得方式**: 只读检查 + 只读 grep。`/Users/red/Desktop/GITRepo/unchain/src/unchain/persistence/sqlite_read_v2.py:92-171`（构造点与全部失败路径）、`grep -rn "vector_status" src/unchain/`（写入点穷举）。跨仓只读引用 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server/route_memory_v2.py:786-831, 982-1006`。工作树；per E-0111 与 revision `a4e69f41` 一致。
- **提交发言**: S-0016
- **支持/反驳**: 中立于 Q3 的结论；**扩展** 本案「四态」题面 —— 指出 counts 之外另有两个字段无法表达其中两态
- **完整性限制**:
  1. 静态推断，未跑运行时验证。验证 `vector_status` 恒为 `"disabled"` 只需在 unchain owner 下 `curl /context/v2/status` 并对比向量索引真实状态；本次只读传唤未起 sidecar，故按静态结论交。
  2. 未评估「把真实 vector 状态接进 store-status」的成本 —— 现有取值路径依赖一次 search 的 `result`，无 search 则无值，可能需要新的探测查询。该设计属跨仓议题，本案不议。
  3. PuPu 侧 503 的映射为只读引用；`code-owner-runtime` 对该行为有处置权，我没有。
- **验证历史**:
  - S-0016 | 已验证 | unchain 侧构造点与写入点均已穷举直读

### E-0115 | command
- **来源定位**: `grep -oiE '(rate.?limit|quota|limit reached|API error…)' <transcript>` 与 `tail -c 1200 <transcript>`，作用于两个 `expert-architecture` instance 的 transcript 文件（`a12dab2dc385b5a8e.output` 38824 字节、`ad0c3d0977de0f336.output` 37813 字节）
- **取得方式**: 只读 grep / tail，未整体读入（transcript 为 JSONL，整读会溢出主持人上下文）
- **提交发言**: S-0020
- **支持/反驳**: 支持 S-0020；**反驳 S-0018**（已由 S-0019 撤回）
- **完整性限制**: 只取到错误类型字符串 `rate_limit`，**未取到完整错误消息、未取到速率限制的作用域或恢复窗口**。本证据只证明「错误类型是 rate_limit」，不证明其成因、范围或可恢复性
- **验证历史**:
  - S-0020 | 已验证 | 两个 transcript 尾部均含 `"error":"rate_limit"`；两文件 mtime 分别为 21:51:44 与 22:13:13，至 22:54 均已停止增长
### E-0116 | command
- **来源定位**: `expert-architecture` 第三次派遣（agent 任务 `aa886a8ca1c5ddad4`）的完成通知，逐字：`Agent terminated early due to an API error: You've reached your Fable 5 limit. Run /usage-credits to continue or switch models with /model.`
- **取得方式**: 后台任务完成通知，主持人直接收到（非事后推断、非 transcript 检索）
- **提交发言**: S-0021
- **支持/反驳**: 支持 S-0021
- **完整性限制**: 只证明第三次派遣的失败原因。**不证明前两次 `rate_limit` 与本次为同一机制**；亦不证明该配额的重置周期或作用域
- **验证历史**:
  - S-0021 | 已验证 | 通知逐字记录；该次派遣并发度为 1，且距上次失败约 40 分钟，故「扇出过宽」与「瞬时限速」两解释均被排除
