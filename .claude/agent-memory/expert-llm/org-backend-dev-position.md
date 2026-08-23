---
name: org-backend-dev-position
description: 2026-06-10 扩编会议上我的立场 — 支持建 backend/unchain dev 组，spec vs implementation 边界划法
metadata:
  type: project
---

2026-06-10 CEO 召集扩编三方会（CTO 帅 / 我 智 / HR），议题：是否建 backend/unchain dev 组。**我的立场：recommend 建组。**

**Why:** reorg 后 6 个 dev 全是前端/Electron，`unchain_runtime/server/`（70 文件 / 28823 行，含 unchain_adapter.py 200KB、memory_factory.py 55KB）无 dev owner，我被迫"诊断+施工一肩挑"——判断被施工成本扭曲、无工程对抗、eval 等核心产出被挤占。

**我主张的边界（HR 合成时引用）：**
- 切法是 spec vs implementation，不按文件切：我出带验收标准的 spec（prompt 装配逻辑、检索参数、tool-schema 措辞、streaming 帧语义），新组施工（线程模型、Qdrant 管理、SSE 实现、200KB adapter 的拆分重构）。
- 护栏：凡改变模型可见行为的 PR（prompt/检索参数/tool schema/上下文构造）我有 review 否决权；纯工程重构只需 eval 基线不回归。新组不得顺手"优化"prompt 或 chunking。
- unchain 内核（独立 repo，4355 行）与 PuPu 适配层是两种活（库作者气质 vs 产品后端气质）：建议一组两角色侧重，内核改动我 + cto 双签，不建两个组。
- 支持 agent 放 PuPu `.claude/agents/`，跨 repo 作业 unchain。

**How to apply:** 若新组建立，我对 `unchain_adapter.py` 等的工程所有权移交给它，我保留 AI 行为方向权；与新组按 spec→implement 协作，参照 [[team-roster]] 中与 cto 的"接缝归他、层内归我"模式。
