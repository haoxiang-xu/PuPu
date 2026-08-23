---
name: release-qa-immutable-wheel-chain
description: release-qa 的「一次构建、全程复用同一 unchain wheel」链路的执行点在哪、哪一段是断的；查发布 artifact 同一性问题时先看这里
metadata:
  type: project
---

2026-08-16 逐文件核对（案 P-0000-0007-2026-0815 的 SLOT-006 交付）。

## 已经成立的执行点（别重造）

- **只构建一次**：`artifact-continuity-workflow.test.mjs` 静态断言 `build-unchain-artifact.mjs` 与 `repository: haoxiang-xu/unchain` 在 workflow 里各出现**恰 1 次**。
- **构建器拒绝增量**：输出目录已含 `.whl`、源 checkout dirty、产出不等于 1 个 wheel，三种都抛错。
- **evidence 自证**：`build` 块必须逐字 `{"wheel_count":1,"built_once":true}`，每次读取都强校验。
- **反「可变 sibling checkout 顶替」的唯一执行点 = `direct_url.json`**：`verify-unchain-artifact.mjs --installed true` → 拒 `dir_info.editable`、要求 `archive_info`、basename 与 `archive_info.hashes.sha256` 都要逐字对上 evidence。调用点三处：release-qa.yml 的 deterministic job、`unchain_runtime/scripts/build_unchain_server.{sh,ps1}`（后两者在 runtime owner 边界）。

## 断的那一段

**契约矩阵与 package smoke 都做了完整自校验，但观测值只 `console.log`，`GITHUB_OUTPUT` 里只有 `executed_tests`。** 报告上唯一的一致性断言（`reporting.mjs` 的 `mergeReports`）比的是同一份 evidence 文件被 upload/download 后的两个副本，不是任何 runner 的观测值。

后果：把契约矩阵那两步的 artifact env 改指到**另一对自洽的** wheel+evidence，全绿无一处变红。而这条路已铺好 —— `run-with-unchain-artifact.mjs` 在 env 未设时会**就地从可变的相邻 checkout `../unchain` 重新构建一个 wheel**。

另有一处：`Python backend tests` 步只给 `PYTHONPATH`，**不给 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`**（CI 与 `local-gate-checks.mjs` 两处都缺），所以 sidecar pytest 想比对 evidence digest 时根本读不到那个文件。

**Why:** 这条链是 `cross-boundary-contract-gate` 里「所有契约矩阵、package smoke 与 release report 必须核对同一 wheel SHA-256」的落地，规则原文要求的是三处互核，实现给的是三处各自自洽。

**How to apply:** 任何人说「发布用的是同一个 wheel」时，问的不是「每一步有没有校验」（有），而是「三步的观测值有没有在报告上碰过面」（没有）。修的方向是让 runner 把观测到的 sha/digest 写进 `GITHUB_OUTPUT` 再由 `reporting.mjs` 判等；接线本身则靠把 `artifact-continuity-workflow.test.mjs` 从「模式出现过」升级为**枚举式排他断言**来钉死。

顺带三条容易踩的：
- **`computeWorktreeFingerprint`（`worktree-fingerprint.mjs`）是内容型，不是 mtime 型。** 只哈希 `git status --porcelain -z --untracked-files=all` 输出、`git diff --binary HEAD` 完整内容差、以及每个未跟踪文件的 mode/size/**内容** —— 全程不读 mtime。所以「测试无条件覆写一个跟踪文件会把指纹门搞噪」这个直觉是**错的**（字节相同 → diff 为空 → 指纹不变）。2026-08-16 已有人据这个错误直觉主张给某个 fixture 开忽略名单，那会让整道门归零。被问到时先看这三行再答。
- `deterministic-checks` 里 `Frontend tests` / `Electron tests` 排在 `Python backend tests` **之前**，所以 pytest 产出并入库的 fixture 一旦漂移，红的是 python 步而不是前端步。
- 报告 schema **没有 `INCOMPLETE` 这个状态值**，只有 `passed` / `failed`；`INCOMPLETE` / `GO` / `NO-GO` 是 release certification 的结论词汇。别去报告里找那个字段。

相关：[[electron-test-twins-are-three-layer-shims]]
