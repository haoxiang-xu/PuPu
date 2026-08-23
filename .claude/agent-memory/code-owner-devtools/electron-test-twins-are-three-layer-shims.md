---
name: electron-test-twins-are-three-layer-shims
description: 铁律说的 Electron 测试 .js/.cjs 双胞胎实际是三层 shim，本体只有 .cjs 一份；electron/tests 下的 .test.js 两个 runner 都不收集，是零信号路径
metadata:
  type: project
---

`.claude/CLAUDE.md` 的铁律「Electron 测试有 `.js` / `.cjs` 双胞胎，必须同步」字面读会误导。真实形态是三层（2026-08-07 首测，2026-08-16 复测确认结构不变、数量已变）：

| 层 | 位置 | 2026-08-07 | 2026-08-16 | 谁执行 |
|---|---|---|---|---|
| 本体 | `electron/tests/**/*.test.cjs` | 45 | **49** | `npm run test:electron`（testMatch 只认 `.cjs`） |
| shim | `src/electron/tests/**/*.test.js` | 36 | **40** | `react-scripts test`（`package.json` 无 `jest` 段、根无 `jest.config*` → CRA 默认 `roots: ['<rootDir>/src']`） |
| 死层 | `electron/tests/**/*.test.js` | 44 | **48** | **无人执行** |

数量每次都要重测，别引用上表的数。可复现的测法在文末。

- shim 是单行 `require("../../../../electron/tests/.../X.test.cjs")`，个别带 jsdom polyfill 前言（`setImmediate` / `TextEncoder`）
- **`electron/tests/test-api/{server,integration,bridge,logs,commands,builtin_commands}.test.js` 是 6 个与 `.cjs` byte-identical 的真本体，此刻跑零测试**
- 有 9 个 `.cjs` 本体没有 shim（`main/chat_storage_lifecycle`、`main/ollama_service`、`main/settings_quit_coordinator` + 上述 6 个 test-api），本地只跑 `npm test` 时静默漏掉；CI 两条都跑（`release-qa.yml` 的 `test:frontend` + `test:electron`）所以 CI 覆盖到
- 有两个 shim 的文件名停在 miso 时代（`unchain_service_loader.test.js` → `unchain_service.test.cjs`、`miso_stream_client.test.js` → `unchain_stream_client.test.cjs`）—— **文件名匹配不是判据**

**Why:** 静默失效的真实形态不是「两份逻辑漂移」，而是 (α) 新本体缺 `src/electron/tests/` shim；(β) 新本体被写成 `electron/tests/**/*.test.js`，两个 runner 都不看，CI 照绿。β 已经在仓库里发生了 6 次。

**How to apply:** 验收 Electron 改动必须两条都跑并 **比对 test-file 计数**（只 `test:electron` +1 而 CRA 侧没动 = 漂移信号）。核对 shim 用 `npx react-scripts test --listTests` 看收集结果，不看目录。别信 `test:frontend -- --passWithNoTests` 的绿色 —— 整层 shim 没了它会以「没有测试」通过。

**唯一正确的审计方法（按文件名词干配对必出假阳性）**：解析每个 shim 的 `require()` 目标并归一化路径，再与 `.cjs` 本体集合求差。两条快查：

```
find src/electron/tests -name '*.test.js' | wc -l     # CRA 收集面，等于 --listTests 的条数
find electron/tests -name '*.test.cjs' | wc -l        # 本体数；两者之差即缺 shim 数
```

`find` 的第一条与 `react-scripts test --listTests | grep -c "/src/electron/tests/"` 互为独立交叉验证（一个数文件系统，一个数 CRA 实际收集），2026-08-16 两法都得 40。前者秒回，后者要几十秒 —— 平时用前者。

**别把 R9 那种「3 处缺 shim」的数字当全量**：2026-08-16 实测缺 shim 是 **9 处**（3 个 `main/` + 6 个 `test-api/`）。差的 6 个在 `electron/tests/test-api/`，那是 devtools territory，electron owner 的审计会（合理地）把它排除在外，于是同一个仓库会得出两个都"对"但口径不同的数。引用别人的槽位审计前先确认口径。

相关：[[build-feature-flag-snapshot-untracked]]
