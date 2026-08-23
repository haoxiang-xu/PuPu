---
name: freeze-gate-ipc-parity-manifests
description: CTO ruling (2026-06-09) —补齐 9 条 MCP 通道进两个 parity 测试静态清单数组，作为 MCP IPC 契约冻结的前置阻塞任务；owner dev-electron / 验 qa-tester
metadata:
  type: project
---

# Freeze gate：parity 测试静态清单补齐（U3 缺口）

CTO 正式裁定（2026-06-09，CEO 已决定纳入 IPC 冻结前置）。源自 U3 recon [[mcp-ipc-channel-inventory]]。属会议 [[meeting-mcp-launch-2026-06-09]] 同步点 4（IPC 通道契约）。

## 裁定（freeze gate）
补齐 9 条 MCP 通道进 `register_handlers.js` 的 `IPC_HANDLE_CHANNELS` 与 `preload/channels.js` 的 `PRELOAD_INVOKE_CHANNELS`，令 `ipc_channels.test.cjs` 的 parity 测试真实覆盖全部 24 条 MCP 通道——列为 **IPC 契约冻结的前置阻塞任务**。**该任务完成且 parity 测试转真绿之前，IPC 契约不予冻结。**漏列的 9 条：LIST_MCP_STORE_ENTRIES、LIST/IMPORT/VALIDATE/REFRESH/DELETE_MCP_STORE_REGISTRY、APPROVE_MCP_STORE_ENTRY、REVOKE_MCP_STORE_ENTRY_APPROVAL。

**Why:** 这两个数组不是运行时白名单，唯一消费者是 parity 测试 `ipc_channels.test.cjs`；运行时全 24 条 `ipcMain.handle` 均已注册、跑得正常。但若以这个 parity 测试当冻结门禁，它对这 9 条**零断言**＝假绿灯：冻结一个其实没被测试守护的契约，等于把"已验证"的章盖在了空白上。冻结的意义就是"之后下游可放心消费"，门禁必须真覆盖才配冻结。
**How to apply:** 任何"IPC 契约可以冻结了吗"的判断，先确认此 gate 已关闭（parity 测试真断言 24 条）。这是与 U1 安装态归属**相互独立的第二道**前置阻塞——U1 解的是写权归属歧义，本 gate 解的是测试覆盖假绿灯，两者都关才冻结。

## 影响分析 / blast radius（CTO 复核，call-graph 实证）
- **触及文件**：`electron/main/ipc/register_handlers.js`（`IPC_HANDLE_CHANNELS` 数组）、`electron/preload/channels.js`（`PRELOAD_INVOKE_CHANNELS` 数组，及顺带 `PRELOAD_SEND_CHANNELS`）、`electron/tests/main/ipc_channels.test.cjs`（断言会自动变多，无需改测试逻辑）。属**公共动脉**（channels/register_handlers），故须在 CTO impact 复核下改。
- **消费者实证**：grep 确认这三个数组在 `electron/` 内**仅** `ipc_channels.test.cjs` 一个消费者导入，**无任何生产模块**读它们做路由/守门。改动是**纯测试面**——加常量令既有断言覆盖更多通道，不改运行时行为、不改 bridge、不改 SSE/streaming 链路。
- **风险等级：LOW**。改的是"既存常量"进数组（9 条常量均已在 `electron/shared/channels.js` 定义，无新增通道、无新 wiring）；失败模式只会是 parity 测试**更严**（红→促修），不会放松任何东西。
- **可逆性：可逆**（reversible）。回退即从数组删行，无下游消费、无数据/存储迁移、无跨平台打包影响。**非单向门**。
- **为何低风险但必须做**：低风险因纯测试面+无生产消费者；必须做因这是冻结门禁本身的可信度——不补齐就是拿假绿灯当冻结依据。

## STREAM_START_V4 顺带项（CTO 判断：纳入）
发送侧 `PRELOAD_SEND_CHANNELS` 只列了 STREAM_START / V2 / V3，漏 **STREAM_START_V4**——而 V4 运行时已全链路 wired（`ipcMain.on` register_handlers.js、`ipcRenderer.send` unchain_stream_client.js、且已在 main 的 `IPC_ON_CHANNELS`）。即发送侧 parity 对 V4 有**同款盲点**。**判断：一并补**。理由：同一类缺口（静态清单漂移于运行时之后）、同一文件、同一次复核、同样纯测试面零风险；分两次反而留一个已知盲点过冻结线、徒增 churn。虽非 MCP 范围，但与本 gate 同因同治更干净。

## 指派与交接
- **执行 = pupu-dev-electron**：在 CTO impact 复核下，向 `IPC_HANDLE_CHANNELS` 与 `PRELOAD_INVOKE_CHANNELS` 各加 9 条 MCP 常量（均取自 `CHANNELS.UNCHAIN.*`，照现有分组顺序插在 RELOAD_MCP_STORE_METADATA 之后、TOOL_CONFIRMATION 之前），向 `PRELOAD_SEND_CHANNELS` 加 STREAM_START_V4。不新增通道、不动 bridge/handler 运行时。
- **验证 = pupu-qa-tester**：确认 `ipc_channels.test.cjs` parity 现真断言全部 24 条 MCP 通道（含这 9 条）且转真绿；确认 STREAM_START_V4 在发送侧被断言；确认 `.js/.cjs` 孪生仍同步（无漂移）；`react-scripts test` 该用例全绿。
- **交接契约**：dev-electron 完成后通知 qa；qa 绿灯后此 gate 关闭→CTO 据此宣布 IPC 契约可冻结。
