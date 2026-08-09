---
name: memory-v2-readiness-gate-stack
description: Memory V2 在产出第一条载荷之前要穿过本层九道 fail-closed 相等门加一道平台门；degraded 之后不是降级是硬失败 —— 这是「为什么没人见过一条真实 trace 行」的答案
metadata:
  type: project
---

**「Memory V2 没数据」几乎从来不是后端不产，是本层的门没开。** 排查顺序永远是先看门，再看产端。

**门 0 · 构建快照**（`memory_v2_rollout.js` 的 `resolveMemoryV2ReleaseConfig`）：打包态下 `build/build_feature_flags.json` 必须在、schema 必须是 `pupu.memory-v2-release.v1`、`snapshot_fingerprint` 与 `rollout_fingerprint` **两个 sha256 都要重算相等**，任一不符整体降为 `featureEnabled:false`。非打包态读 `.local/build_feature_flags.snapshot.json` 并允许 `process.env` 覆盖。

**平台门**（`constrainMemoryV2ConfigForPlatform`）：**win32 上 `canary`/`all` 被强制压回 `shadow`**，理由是 vault worker containment 不可用。即 **active 面在 Windows 上结构性不可达**。

**门 1 · `validateMemoryV2Status` 九项短路判定**，任一不符即 `degraded`：

```
1 available                                  2 storeOwner === "unchain"
3 schemaVersion === 2   ← 相等门不是下限      4 journalMode === "wal"
5 lexicalBackend ∈ {fts5, degraded}          6 contextMemoryCapabilityReady
7 reason === "unchain_context_memory_ready" && contextMemoryContract === 1
  && /^[0-9a-f]{40}$/.test(unchainRevision)
  && verification ∈ {exact_sha, dev_bypass, dirty_dev_checkout}
  && 三条 verification × effectiveMode × immutable 交叉约束
8 rolloutConfigValid                         9 六项 rollout 字段逐项相等 + rolloutFingerprint 相等
```

**门 2 / 门 3 —— degraded 之后不是降级，是硬失败**（这一条最反直觉）：

- `contextV2Request`：`effectiveMode !== "off"` 且 readiness ≠ ready → **每一次 Context V2 调用抛 `context_v2_readiness_failed`**（只豁免 `/status`）。**journal reload / trace 展开那条通路就是被这里掐死的**
- `startMisoStream`：payload 带 `memory_v2_requested === true` 且 readiness ≠ ready → **直接发 `error` 帧并 return，SSE 请求根本不发出**

**`PUPU_CONTEXT_V2_STORE_OWNER` 的真相（2026-08-07 于案 `0000-0003-2026-0807` 认定，曾是两名 owner 互斥主张的争点，E-0056/E-0057）：**

- 取值集合**二元**：`memory_v2_rollout.js:150` 就一行 `resolvedRolloutMode === "off" ? "off" : "unchain"`。**Electron 永远不产 `pupu_legacy`。**
- **无条件写入，且写在 `{...process.env}` 展开之后**（`unchain/service.js:4745` vs `:4763` vs `:4805-4808`）→ 开发者 shell 里的同名变量会被覆写 → Python 侧「env 缺失回退 `pupu_legacy`」**只要由 Electron spawn 就结构性不可达**。任何用 pytest / `test_client()` 打出来的 `pupu_legacy` 行为都是**独立启动环境**，不是现网。
- **打包默认是 `"off"`**（`enable_memory_v2:false` → featureCeiling/configuredMode 双 `off` → storeOwner `off`）。**dev 不一定** —— 2026-08-08 于案 `0000-0008-2026-0808` 更正：`package.json` 的 `start:electron` **确实设了** `PUPU_FEATURE_MEMORY_V2=all PUPU_MEMORY_V2_MODE=all`，而 `buildRolloutConfig:135-140` 只在 `featureEnabled` 为真时才读它们，`featureEnabled` 来自 **不入库的** `.local/build_feature_flags.snapshot.json`。本机该文件是 `enable_memory_v2:true` → `npm start` 落 **`unchain`**；**新克隆 / CI 上没有该文件 → 落 `off`**。**「dev 是什么」是本机属性不是仓库属性，写验收步骤必须声明这个文件的内容。**
- **win32 上 storeOwner 仍是 `unchain`**（ceiling 压回 shadow 只改 mode 不改 owner），但 readiness 恒 `degraded`（`vault_worker_containment_unavailable`）→ `contextV2Request` 的 readiness 门拦下每一次调用。**Windows 与 macOS 在同一配置下走两条不同的失败路径。**
- **`off` 态的错误码是 503 `context_v2_store_disabled`，不是 404**（2026-08-08 更正，原记 404 `context_v2_not_found` 在 `b2385d5d` 上不成立）。链路：`route_memory_v2.py` 的 `_read_runtime_for_store_owner` / `_status_for_store_owner` 在 owner≠unchain 时直调 `_runtime()` → `memory_v2_runtime.py:718-734` 对 `off` 必抛 503。**`/context/v2/status` 自己也走这条 —— 即 off 态下 `contextV2API.getStatus()` 是 reject 不是 resolve，8 字段 allowlist 根本构造不出来。** 判态别指望它，见 [[memory-v2-four-state-already-on-the-wire]]。
- 顺带纠一个常见误推：默认构建下 `effectiveMode === "off"`，**readiness 门根本不生效**（`contextV2Request:1897-1901` 只在 `!== "off"` 时拦），请求照发到 sidecar 再 404 回来 —— 不是本地立即抛错，观感完全不同。

**存量 `pupu_legacy` store 的真相**（2026-08-07 于 `0000-0002-2026-0807` 实测，两侧闭合）：

- `electron/` 生产代码里 `pupu_legacy|pupu-legacy|legacy-v4` **零命中**；`context_v2.sqlite3`/`context_v2.owner` **零命中**；`electron/main/services/unchain/*.js` 的 `renameSync|rmSync|unlinkSync|rmdirSync` **零命中**。`unchain_runtime/server/*.py` 一侧同形（该案 E-0024）。**两个进程都没有任何机制处理它**
- 唯一"认得"它的是 `MEMORY_V2_REQUIRED_SCHEMA_VERSION = 2` 那条相等门，注释逐字写着 `PuPu's retired prototype ... ended at schema v4`
- **本机确实存在一个 473 MB、schema 4、无 owner json 的 legacy store，其隔离改名是人手做的、无任何代码路径**（该案 E-0007 / E-0024）
- **净效果：那个目录不是无主的 —— 它的"主"是这条相等门，而门对它的唯一处置是把整个 Memory V2 面判 degraded，且没有任何界面告诉用户为什么**

**Why:** 2026-08-07 案 `0000-0002-2026-0807` 上四名 owner 独立收敛到同一条验收标准 ——「单元测试在这条路径上不具备证明力，必须在运行中的应用里人眼看过一次」—— **四个人都没说那一次要穿过什么。** 答案是这十道门，三道是相等门不是下限门，一道在 Windows 上结构性不可通过，而 `enable_memory_v2` 的 build 默认值是 `false`（门 0 第一道就是关的）。

**How to apply:** 任何要求「跑一次真实 Memory V2 回合」的方案，先把这十道门的当前取值抓下来（`getMisoStatusPayload().memoryV2.reason` 直接给出是哪一道拦的），**不要先去改代码**。九项里有六项的实际取值属 `code-owner-runtime`，三项是本层自己的配置。改 `MEMORY_V2_REQUIRED_SCHEMA_VERSION` 要同步 `memory_v2_rollout.test.cjs` 与 `memory_v2_startup_readiness.test.cjs` 两处 fixture。相关：[[context-v2-p0-contract]]（同一条相等门的契约面）、[[stream-relay-filtering-granularity]]（门开了之后载荷怎么走）、[[electron-test-twin-mechanics]]（这两条测试是 `.cjs`，收窄的 `--testPathPattern` 跑不到）。

**一条已知漂移点**：`memory_v2_rollout.js` 硬编码 `contextMemoryContract !== 1`，而 `unchain_runtime/unchain-core.lock.json` 里也写着 `context_memory_contract: 1` —— **同一个数字的两份手写副本，无共享来源、无比对测试，且 Electron 全域不读那个 lock 文件**。升到 2 那天，Electron 会静默把 Memory V2 判 degraded 而 lock 是绿的。
