---
name: bridge-error-code-parser-anchoring-invariant
description: bridges/ 里的 [code] 解析正则绝不能加起始锚定或任何位置依赖——Electron 会包裹 message 并剥掉 error.code；同目录有一个加锚定的错误范本，别照抄
metadata:
  type: project
---

`src/SERVICEs/bridges/**` 有四个 bracket error-code 解析器。**三个正确、一个是坑**，而坑的那个就摆在同一个目录里等人复制。

| 文件 | 正则 | 判定 |
|---|---|---|
| `context_v2_bridge.js:57` | `/\[([a-z0-9_]+)\]\s/` | 正确（未锚定） |
| `memory_vault_bridge.js:75` | 同上，逐字相同 | 正确 |
| `settings_storage_bridge.js:110` | 同上，逐字相同 | 正确，且 `:101-109` 注释写明了理由 |
| `run_bundle_storage_bridge.js:16` | `/^\[([a-z0-9_]+)\]/` | **加锚定 = 坏的** |

**Why（机制，这才是关键）：** 错误穿过 `ipcMain.handle` 时 Electron 做两件事——**剥掉 `error.code` 属性**，并把 message 包成 `Error invoking remote method '<channel>': [<code>] <message>`（另有含 `Error: ` 的变体）。所以：

- 加了 `^` 的正则在生产中 **恒返回 null**，因为 code token 不在字符串开头；
- `error.code` 快路径在生产中 **恒失效**，因为属性已被剥掉。

`run_bundle_storage_bridge.js` 两样都占（`:14` 有 code 快路径、`:16` 有锚定正则），其 handler 确实 `throw error` 穿 `ipcMain.handle`（`electron/main/services/run_bundle_storage/register_handlers.js:11-54`）。**它目前不是活 bug，只因 `parseRunBundleStorageErrorCode` 零消费者**（导出后从未被 import）。第一个消费它的人会踩。

**禁令的正确形状是行为式的，不是语法式的。** 「不要加 `^`」欠定——下面每一种都满足其字面而破坏效果完全相同：`startsWith("[")` 前置守卫 · `indexOf("[") !== 0` 守卫 · `split(": ")[0]` 先剥包裹（channel 名自带 `:`，切分点不唯一）· 正则加 `y` sticky 标志 · 加尾锚 `$`。**真正的义务：必须能从 message 任意位置还原第一个 `[<code>] ` token；任何让结果依赖 token 位置的改动都禁止。**

**坏掉时会怎样（`context_v2_bridge` 侧实测，2026-08-15 `28b1e0ef`）：** 解析返回 null → 5 个 call site 各自 `|| "<默认码>"` → 分类全面错归因。但**不会丢数据**：rebase 路径落 `context_v2_failed`，它不在 `context_v2_turn_mutation.js:367-377` 那九个 terminal code 里，所以 frozen payload 保留，代价是每条至多 12 次无谓重试（60s 退避上限）+ quarantine/discard 语义丢失。**别把它当 P0 数据丢失误判优先级。**

**最阴的一点：改坏了不但没测试变红，还有一个测试看起来在覆盖它、且会保持绿。** `src/COMPONENTs/chat-bubble/trace_chain.memory_v2.test.js:23-26, :101-104` 用 `jest.mock` 换掉整个 bridge，并在 mock 工厂里**就地重实现**了一份**正确的未锚定**正则（CRA `resetMocks: true` 所以 `beforeEach` 又重建一次）。那个 mock 本身没错，但**按函数名 grep「解析器有没有被测」会得到假阳性**。

**How to apply:** 任何人要动 `bridges/` 里的错误码解析——改正则、加校验、加快路径、"规范化"成 `^...$` 形式——先回到这一条。要验证是否踩坑，最快的实证是造一个包裹形式的 message 喂进去看是不是 null，而不是读正则。写守卫测试时**必须调用真实导出的解析器**：这个文件本身就是被测对象，改用就地字面量等于测试自己测自己，防护归零（跨边界契约测试里「禁 import 实现」那条规则只适用于**载体侧**，别套过来）。

相关：[[context-v2-error-code-wire-contract]]（同一条链的上游与消费者清单）· [[case-p0007-hs004-stance]]（这条不变量是在哪个案子里被写成契约义务的）
