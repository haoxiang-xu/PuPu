---
name: release-unchain-editable-source-coupling
description: 发版构建把 unchain 核心库以 editable 方式从本地 ../unchain 源码树打包，构建前必须 pin 干净的 intended commit
metadata:
  type: project
---

`build:unchain` (unchain_runtime/scripts/build_unchain_server.sh) 用 `pip install -e "$UNCHAIN_SOURCE_PATH"` 打包 unchain 核心库，`UNCHAIN_SOURCE_PATH` 默认 `../unchain`，PYTHONPATH 指向 `../unchain/src`。requirements.txt 只 pin sidecar 自己的运行时依赖（Flask/Werkzeug/httpx/mcp/openai/anthropic/qdrant-client），**不 pin unchain 版本**——unchain 直接来自本地工作树。

**Why:** 这意味着 electron 构建 bundle 的 AI 引擎 = 构建那一刻 `../unchain` 工作树里的东西。若 unchain 处于脏的 feature 分支（2026-07-13 QA 时观察到它在会话中从 dirty `codex/execution-lease-fencing` 切到干净 `dev`，即用户在实时切分支），构建会打进未提交/未评审/不可复现的代码。

**How to apply:** 任何 release build 前，QA 必须确认 `../unchain` 在干净、已提交、intended 的 release commit（dev 或 tag）上（`git -C ../unchain status --porcelain` 为空 + 记录 HEAD short hash 写进就绪报告）。跨仓改动要成对（如 steer→queue rename：PuPu b25ff42 对应 unchain d30f503，已在 dev 祖先链）。构建 venv 要 Python 3.12；ambient py3.11 缺 qdrant_client，跑不了 memory/qdrant 后端测试。相关 [[unchain-repo-access]] [[unchain-memory-engine-constraint]]。
