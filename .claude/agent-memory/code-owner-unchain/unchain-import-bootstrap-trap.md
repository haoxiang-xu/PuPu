---
name: unchain-import-bootstrap-trap
description: ModuleNotFoundError No module named unchain in a sidecar harness is a harness defect not an environment defect - import unchain_adapter first to trigger the product's own sys.path bootstrap, which is the only way to actually exercise store_owner=unchain
metadata:
  type: project
---

在 `pupu:unchain_runtime/server` 下写 harness 时遇到 `ModuleNotFoundError: No module named 'unchain'`，**不要归因为环境缺陷，也不要用 `PYTHONPATH` 硬塞**。正确做法是 **先 `import unchain_adapter`** —— 它在模块级调用 `_ensure_unchain_on_path()`（`unchain_adapter.py:56-72`），零 env 配置下即把 unchain 挂上 `sys.path`：优先 `UNCHAIN_SOURCE_PATH`，回退到 **兄弟目录** `<PuPu 的父目录>/unchain/src`。

**Why:** 2026-08-08 case `0000-0008-2026-0808`，**三个人**（`code-owner-runtime` + 两名 `evidence-examiner`）先后卡在这个 `ModuleNotFoundError` 上，全部把它记为「我的环境装不了 unchain」，于是 **`store_owner=unchain` 这条今天 `npm start` 实际走的路径，全案一次也没被跑过**（登记为 G8，本庭称其为「本案第二大证据空洞」「Q1 与 Q4 共同的证据地板」）。根因机械且一致：他们的 harness 直接 `import route_memory_v2`，而 **`route_memory_v2` 不 import `unchain_adapter`**，bootstrap 从未执行。我按上法一行改动即跑通，并实跑出该分支的完整 HTTP 面。

**How to apply:**
- 出 `store_owner=unchain` 的证据前，harness 第一句就 import `unchain_adapter`（或它的下游），再 import `route_memory_v2`。验证：`import unchain; print(unchain.__file__)` 应指向本机 checkout。
- 建 unchain-owned store 别自己摸索：**复用仓内既有 fixture** `pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py` 的 `_seed` / `_seed_owner`（建库 + lifecycle + curator binding 一整套，缺一样 reader 就开不起来）。
- **sibling 回退依赖本机目录布局**（PuPu 与 unchain 同级）。CEO 已预告路径会变 —— 布局一变就必须显式给 `UNCHAIN_SOURCE_PATH`，别把回退当机制。打包态（`app.isPackaged`）怎么解析 **至今未核实**，归 `code-owner-electron`。
- 顺带闭合的一层：运行时 `import unchain` **确实** 解析到本机 dev checkout，而非别处的 site-packages —— 故「checkout 与 lock 一致」时静态比对的适用范围可以覆盖到运行时。但这只在两者相等时成立，别省掉 [[unchain-evidence-must-cite-lock-revision]] 的三方对照。

相关：[[unchain-evidence-must-cite-lock-revision]]
