---
name: release-version-bump-mechanics
description: version:prepare-build 不 commit、需版本入参、PUPU_VERSION_PREPARED=1 跳过；发版正确的版本命令序列
metadata:
  type: project
---

`npm run version:prepare-build` (scripts/prepare-build-version.cjs) 只做两件事：`npm version --no-git-tag-version <ver>` 改写 package.json 的 version + 跑 update-readme-links。**它不 git commit、不打 tag**（安全，符合"never commit"红线）。

版本来源优先级：`--version <ver>` 参数 > `PUPU_BUILD_VERSION` env > 交互 prompt。非交互/CI 下若都没给会报错退出。当 `PUPU_VERSION_PREPARED=1` 时整步跳过（build:electron 顶层先跑一次 prepare-build，再用 PUPU_VERSION_PREPARED=1 让内层 build:web/build:unchain 跳过重复跑）。version 相同则 no-op。

**Why:** 每个 build:electron:* 链头都是 `version:prepare-build && ... notices:check && electron-builder`；notices:check gate 2026-07-13 验证 PASS（1473 包）。

**How to apply:** 发版推荐序列（不改 package.json 由人工/CEO 定夺后）——
1. `npm run version:prepare-build -- --version 0.1.8`（改写 package.json，工作树留脏给人工 commit）
2. 人工 commit 版本号
3. `npm run build:electron:mac`（内部会再 prepare 一次，幂等）
或一步：`PUPU_BUILD_VERSION=0.1.8 npm run build:electron:mac`。相关 [[release-unchain-editable-source-coupling]]。
