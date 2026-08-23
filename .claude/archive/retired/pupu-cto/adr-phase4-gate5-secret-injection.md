---
name: adr-phase4-gate5-secret-injection
description: Phase 4 门 5 裁决——provider secret 注入移主进程(a)，描述符契约+main 注入点+三态回退+字节等价，6 切片
metadata:
  type: project
---

# ADR: Phase 4 门 5 — provider secret 注入 renderer→main

2026-07-25，CTO 出具，回应安全专家 Phase 4 GO（有条件）唯一 ⚠️ 门（门 5）。ADR 全文本地：`scratchpad/phase4-cto-adr.md`（会话级，非入库）。

**决策**：门 5 = **(a) secret 注入移主进程**（与安全专家一致）。
**Why**：(b)（renderer 经 IPC 取原始 secret）把 SEC-001 接缝 B 从 localStorage 搬到 IPC、门没关，作废 Phase 4 的 R1（运行时 XSS 外泄）收益；且 (b) 的"renderer 少改"是幻觉——同步 `readProviderSecret` 消失后 4 个注入点无论如何要改，(b) 还把同步热路径 `normalizeUnchainV2Payload`/`startStreamV2` 异步化，风险更高收益更差。(a) 保持同步热路径、数据归属=使用点重合、是唯一兑现收益的方案。
**How to apply**：动 Phase 4 secret 或 `api.unchain.js` 注入链/`startMisoStream` 时按此设计；改 (b) 需守签字 + UI 禁称"已防护"。

## 承重设计事实（grounded 于真实调用图）
- main 注入点 = `startMisoStream`（unchain/service.js L3464）——V1/V2/V4 唯一 POST choke，L3595 落 body。**先例**：L3489-3521 main 已在 POST 前校验+注入 `options.workspaceRoot`，secret 注入是同一模式延伸。
- renderer 注入 4 入口：`injectProviderApiKeyIntoPayload`(L139)/`injectCustomProviderIntoPayload`(L572) 经 `normalizeUnchainV2Payload`(L698) 被 startStream/V2/V4/replaceSessionMemory 调用。
- **三条 secret 出站路，S4 都要覆盖**：`startMisoStream` + `replaceMisoSessionMemory`(L2202) + `testMisoCustomProvider`(L1400 已 renderer→main 传 api_key)。漏则 keyless 回归。
- 装配：`settingsStorageService`(index.js L81) 先于 `unchainService`(L99) 创建，可注入；`init()`(L185) 在 whenReady 内满足 safeStorage ready 前提。

## 契约（S4/S5 上线即冻结 = 单向门）
- `options.__pupu_secret_injection = {kind:"provider"|"custom_provider", id}` —— renderer 发非敏感描述符，main 解密注入既定字段后**必剥除**（Flask 永不见）。选描述符而非 main re-detect：单一注入决策源、无跨层启发式漂移、main 侧无 custom 定义。
- main secret-reader（`settingsStorageService.readDecryptedProviderSecret`）**绝不上 IPC allowlist**（红线 #8，永久铁律）。**不新增任何 renderer 取值 channel**（这正是 a 优于 b 的关键）。
- 注入字段值/集与今日**逐字节相同**；custom 只走专用命名通道（A8/§9.1），绝不通用 api_key。
- fail-closed 全走 `emitMisoStreamDirectEvent(error)`（`secret_storage_unavailable`/`provider_missing_api_key`），绝不 throw 到 send、绝不 keyless POST。

## 三态回退（zero-regression 承重）
`secretInjectionAuthoritative(id)` = `secretStorageStatus==="available"` AND `configuredCredentials.includes(id)`。稳态→只发描述符(R1 兑现)；首启过渡/degraded→renderer 读 legacy 注入(今日行为)。`configured` = SQL 存在 OR legacy 存在（过渡窗 SQL 未落但 legacy 有 key，只看 SQL 会漏注入回归）。诚实 R1：过渡窗 key 本就在 localStorage，renderer 读它不增暴露；N+1 删 legacy 后回退分支变死代码。

## 6 切片 + 归属 + 顺序
S1 密文表+safeStorage+门3(settings+守) → S2 迁移+dual-keep+往返验证(settings+守) ‖ S3 configuredCredentials 信号(settings+electron) → S4 main 注入接缝(electron·热路径) ‖ S5 renderer 去secret(settings·热路径) → **S6 字节等价 characterization + pupu-llm-expert 会签 = 放行闸**。S1 后 S2/S3 并行；S4/S5 共享描述符契约先冻结再并行；S6 收口。每片 .js/.cjs parity + detect_changes compare main + 触 IPC 自动触守复审 + 禁 git commit。

## 真正的单向门（本 Phase 明确不做）
删 legacy localStorage secret = N+1 独立变更（删了丢跨版本回滚 key 兜底）。Phase 4 只 dual-keep，不删。

相关：[[adr-v3-storage]]（SQLite 迁移母计划）、[[architecture-operating-principles]]、SEC-001 接缝 B（RC-6 明文 localStorage key，本 Phase 收口的那条线）。
