---
name: build-feature-flag-snapshot-untracked
description: 正式安装包的 feature flag 值来自不入库的 .local/build_feature_flags.snapshot.json，而该文件由「在 dev 打开 Settings-Dev 页」这个副作用写入 —— 发布前必须人工核对
metadata:
  type: project
---

发布构建的 feature flag 取值 **不由仓库决定**。链路（2026-08-07 实测确认）：

- `build:electron:*` → `build:web` → `scripts/build-web.cjs` 读 `<root>/.local/build_feature_flags.snapshot.json`，注入 `REACT_APP_BUILD_FEATURE_FLAGS`，构建后另写 `<root>/build/build_feature_flags.json`
- **两个文件都在 `.gitignore` 里**（`/.local/`、`build/`），`git ls-files` 对二者返回空
- 快照缺失 → `normalizeFeatureFlags({})` → 全 false。CI runner 上永远没有 `.local/`，所以 `release-qa.yml` 的四个 `*:unsigned` 产物一律全 false
- **正式签名包是在构建者本机产的**，`.github/` 里没有发布 workflow
- 写侧：`src/COMPONENTs/settings/dev/index.js` 的一个 `useEffect(..., [featureFlags])` → `syncBuildFeatureFlagsSnapshot` → `electron/main/services/runtime/service.js` 写盘。**不是保存按钮 —— 在 dev 里打开 Settings → Dev 那一页就会覆盖它**

**Why:** 2026-08-07 case `0000-0003-2026-0807` 追加问题 A 查到：本机 `.local` 快照（08-04 17:20）`enable_memory_v2: true`，而上一次构建产物 `build/build_feature_flags.json`（08-03 22:23）是 `false`。二者之间没有任何校验。当时从本机构建会得到「渲染层 flag = true、sidecar store owner = off」的分叉包 —— 界面出现、每次读 404。

**How to apply:** 任何发布前，用只读的 `node ./scripts/build-web.cjs --print-flags` 打出会被烤进包的那组值并人工核对；不要用 `build/build_feature_flags.json` 代替，它是 **上一次** 构建的产物，可能已经过期。回答「已发布的包里 flag 是什么」时，别去查快照 —— 快照无历史；查 `git show <tag>:src/SERVICEs/feature_flags.js` 里 `FEATURE_FLAG_DEFINITIONS` 有没有那个 key。

相关：[[electron-test-twins-are-three-layer-shims]]
