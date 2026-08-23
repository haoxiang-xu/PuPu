---
name: memory-v2-four-state-already-on-the-wire
description: 那个「多方需要、今天没有 owner」的 Memory V2 四态状态源不需要造 —— 它是 getMisoStatusPayload().memoryV2，早就跨过 IPC 了，被 renderer facade 的 normalizeUnchainStatus 丢掉
metadata:
  type: project
---

**有人说「Memory V2 缺一个单一状态源」时，先别同意。它已经存在、已经跨过 IPC 线、只是没人消费。**

链路（2026-08-08 于案 `0000-0008-2026-0808` 逐段核实，本层零投影）：

```
unchain/service.js:1068        memoryV2Readiness = { status, reason, sidecarFingerprint }
unchain/service.js:1645-1663   getMisoStatusPayload() → memoryV2: { …15 字段… }
ipc/register_handlers.js:236   ipcMain.handle(CHANNELS.UNCHAIN.GET_STATUS, () => getMisoStatusPayload())
preload/channels.js:17         白名单里
preload/bridges/unchain_bridge.js:4   裸 invoke 透传，无投影
window.unchainAPI.getStatus()  ← renderer 今天就拿得到
────────────────────────── 以上全在本边界内 ──────────────────────────
src/SERVICEs/api.shared.js:330-343  normalizeUnchainStatus 重建为 6 字段，丢掉 memoryV2 和 contract
```

**卡点在 `normalizeUnchainStatus`（shared-arteries 边界），不在本层。** 所以 `grep memoryV2Readiness` 在 ipc/preload/SERVICEs 三处零命中 —— **那是名字层面的假阴性，值在跨层时改名叫 `memoryV2`**。有人拿这个 grep 论证「未暴露」时，直接指这条。

**它比"半成品"完整**：`status` 是闭集四值 `off | pending | degraded | ready`；`reason` 闭集 16 值（`validateMemoryV2Status` 产 9 + `""`，service 侧另加 `rollout_off` / `not_verified` / `context_v2_readiness_unavailable` / `vault_worker_containment_unavailable` / 3 个 snapshot 码）；写入点只有三处，全在同一闭包（`:1852` / `:1960` / `:4706` 重置）。**`configured` 与 `ready` 两个布尔把「配置为关」和「配置为开但没就绪」分开了 —— 这一刀 `contextV2API.getStatus()` 切不出来**（它在 off 态 reject，在 sidecar 未就绪时返回与 off 同形的合成负值）。

**代价不是零，但不在暴露上，在契约上**：该载荷今天只被 `memory_v2_startup_readiness.test.cjs` 的 7 处 `toMatchObject` **部分**锁定，**没有任何测试锁完整字段集或禁额外字段**。15 字段里 4 个是 sha256 指纹 + 一个 `platformActiveBlocked`。**它今天是诊断面，不是产品面。** 谁要把它当产品状态源，先加一条 allowlist 形状的双胞胎契约测试（落 `memory_v2_startup_readiness.test.cjs` + `.js` 孪生）—— 那是本边界的活。

**How to apply:** 任何「四态/未启用态判定归谁」的讨论，先把这条摆出来，问题就从「建构件」降级为「认领一个已存在契约 + 让 shared-arteries 放行一个字段」。**别去给 `contextV2API.getStatus()` 加字段** —— 那是零参数、count-free、已锁契约的安全面，加字段既触发 `expert-security` 也制造第二个权威。相关：[[memory-v2-readiness-gate-stack]]（这四态是怎么算出来的）、[[context-v2-p0-contract]]、[[ipc-error-code-transport]]（off 态只能靠错误码反推的那条路）。
