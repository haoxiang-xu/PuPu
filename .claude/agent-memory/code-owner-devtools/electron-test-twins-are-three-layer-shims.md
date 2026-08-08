---
name: electron-test-twins-are-three-layer-shims
description: 铁律说的 Electron 测试 .js/.cjs 双胞胎实际是三层 shim，本体只有 .cjs 一份；electron/tests 下的 .test.js 两个 runner 都不收集，是零信号路径
metadata:
  type: project
---

`.claude/CLAUDE.md` 的铁律「Electron 测试有 `.js` / `.cjs` 双胞胎，必须同步」字面读会误导。2026-08-07 实测的真实形态：

| 层 | 位置 | 数量 | 谁执行 |
|---|---|---|---|
| 本体 | `electron/tests/**/*.test.cjs` | 45 | `npm run test:electron`（testMatch 只认 `.cjs`） |
| shim | `src/electron/tests/**/*.test.js` | 36 | `react-scripts test`（`package.json` 无 `jest` 段、根无 `jest.config*` → CRA 默认 `roots: ['<rootDir>/src']`） |
| 死层 | `electron/tests/**/*.test.js` | 44 | **无人执行** |

- shim 是单行 `require("../../../../electron/tests/.../X.test.cjs")`，个别带 jsdom polyfill 前言（`setImmediate` / `TextEncoder`）
- **`electron/tests/test-api/{server,integration,bridge,logs,commands,builtin_commands}.test.js` 是 6 个与 `.cjs` byte-identical 的真本体，此刻跑零测试**
- 有 9 个 `.cjs` 本体没有 shim（`main/chat_storage_lifecycle`、`main/ollama_service`、`main/settings_quit_coordinator` + 上述 6 个 test-api），本地只跑 `npm test` 时静默漏掉；CI 两条都跑（`release-qa.yml` 的 `test:frontend` + `test:electron`）所以 CI 覆盖到
- 有两个 shim 的文件名停在 miso 时代（`unchain_service_loader.test.js` → `unchain_service.test.cjs`、`miso_stream_client.test.js` → `unchain_stream_client.test.cjs`）—— **文件名匹配不是判据**

**Why:** 静默失效的真实形态不是「两份逻辑漂移」，而是 (α) 新本体缺 `src/electron/tests/` shim；(β) 新本体被写成 `electron/tests/**/*.test.js`，两个 runner 都不看，CI 照绿。β 已经在仓库里发生了 6 次。

**How to apply:** 验收 Electron 改动必须两条都跑并 **比对 test-file 计数**（只 `test:electron` +1 而 CRA 侧没动 = 漂移信号）。核对 shim 用 `npx react-scripts test --listTests` 看收集结果，不看目录。别信 `test:frontend -- --passWithNoTests` 的绿色 —— 整层 shim 没了它会以「没有测试」通过。

相关：[[build-feature-flag-snapshot-untracked]]
