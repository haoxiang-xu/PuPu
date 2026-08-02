---
name: adr-v2-migration-baseline-blocker
description: 2026-08-02 拦截项——Memory V2 P0 实现 0 文件入库（全 untracked），plan 依赖的 immutable baseline 不存在；unchain 侧同样全未提交
metadata:
  type: project
---

context/memory v2 迁移的 plan 前置条件是「owner 先建 immutable P0 baseline checkpoint」。**该前置条件不满足，且比 plan 设想的更差。**

**事实（2026-08-02 实测）：** PuPu `dev` 上 `git ls-files | grep -c 'memory_v2\|context_v2'` = **0**。整个 Memory V2 P0 实现（含 `memory_v2_store.py` 13461 行、`memory_v2_context.py` 4719 行、17 个 gate 测试里的 13 个、`unchain-core.lock.json`、Electron 侧 context_v2 桥与测试）全部是 untracked，不是 modified。unchain 侧 codex 工作树 30 个改动同样 0 提交。两个仓库的全部工作都只活在工作区。

**Why:** plan 说「branch name does not isolate uncommitted work」——但实际情况是**连 stash/checkout 回滚都救不了**，untracked 文件不在任何 git 对象里。一次 `git clean` 或一次要写同路径的 merge 就能抹掉数月工作。同时 golden fixture 要记录「immutable PuPu baseline SHA」，而该 SHA 根本不存在，Task 1 无法真正开工。

**How to apply:** 任何后续 v2 迁移调度前，第一件事是确认 baseline 已 commit。别接受「已经建了分支」当作已隔离。另外两个连带事实会误导估算：
- `unchain-core.lock.json` 已存在但 `revision: null` 且**无任何代码读它**；`context_memory_v2_capability.py` 校验器也已写好但被 import 0 次。Task 11 应表述为「接线并填 revision」，不是「新建 lock」。
- PuPu 消费 unchain 靠 `sys.path` 注入兄弟目录（`unchain_adapter.py` 的 `_ensure_unchain_on_path`），requirements.txt 不含 unchain，build 脚本也无任何 SHA。所以「exact-SHA lock」目前是纯设想，CI 里 3 处硬编码 SHA + 1 处故意浮动的 `ref: dev`（漂移雷达，**不能**被一起收编）。
- plan 的 gate 命令用 `../../.venv/bin/python`，但该 venv **装不了/没装 unchain**，命令照抄会在 import 处直接失败。

相关：[[adr-context-memory-v2-migration-review]]
