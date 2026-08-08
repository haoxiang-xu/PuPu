---
name: ipc-error-code-transport
description: 跨 ipcMain.handle 时 Electron 会剥掉 error.code —— stable code 唯一的载体是 message 里的 `[code] ` 前缀，而只有三个 renderer bridge 装了解析器
metadata:
  type: project
---

**`ipcMain.handle` 抛出的 Error，`.code` 属性到不了 renderer。**Electron 只把 message 序列化过去（还会包一层 `Error invoking remote method '<channel>': ...`）。所以本仓的约定是：**stable code 塞进 message 开头的 `[code] ` 前缀，同时保留 `.code` 给 main 进程内的调用方**（`unchain/service.js` 的 `createContextV2Error` 注释逐字写明了这个理由）。

**这个约定是半覆盖的，别假设它全仓成立**（2026-08-07 于案 `0000-0003-2026-0807` 穷举，E-0058/E-0059）：

| 面 | main 侧加 `[code] ` 前缀 | renderer 侧有解析器 | 结果 |
|---|---|---|---|
| CONTEXT_V2 | 是（`contextV2Request` 统一重包，**丢弃上游 message**） | `src/SERVICEs/bridges/context_v2_bridge.js:57` | code 端到端不丢 |
| MEMORY_VAULT | 是 | `memory_vault_bridge.js:75` | 同上 |
| SETTINGS_STORAGE | 是 | `settings_storage_bridge.js:110` | 同上 |
| **`unchain:get-memory-projection` / `…-long-term-…`** | **否** | **无**（`unchain_bridge.js` 不在名单里） | **裸字符串直穿** |

正则三处都是 `/\[([a-z0-9_]+)\]\s/`。

**projection 那两条的具体病灶**：它们不走 `contextV2Request`，直接 `fetch` + `readJsonResponse`，`register_handlers.js` 那两个 handler 是**裸 async 无 try/catch**。后果两条：(1) 后端不给 `error.code` 时 `.code` 根本不设置，renderer 拿到一个无法分支的自由格式串；(2) `contextV2Request` 丢弃上游 message 的成文理由是「后端 message 会带 sqlite 绝对路径和 Traceback」—— **这条路没有那道处理，上游 Traceback 会直达 renderer**。

**How to apply:** 有人问「renderer 能不能区分后端的 N 种失败」时，**先查那条 channel 在不在上表前三行**。在，答能；不在，答「今天拿到的是字符串，要分支就得先给它加归一化，那是行为变更要走 case」。加新 channel 时这个前缀 + 对应 bridge 的解析器要**同一次**做完，否则就复制了 projection 的坑。相关：[[context-v2-p0-contract]]、[[memory-vault-p0-contract]]。
