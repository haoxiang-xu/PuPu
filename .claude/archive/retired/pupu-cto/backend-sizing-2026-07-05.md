---
name: backend-sizing-2026-07-05
description: 六件后端活量级评估结论：排序可吸收不招人；delta-persist 不在擎路径上（纯前端+Electron）；复评触发器=0.1.10 结束
metadata:
  type: project
---

2026-07-05 路线会后人力评估（回 CEO，经 COO）。结论：**当前编制排序可吸收，暂不招第二个 backend dev**。

**Why:** 六件"后端活"里最大的一件（delta-persist）经代码核实根本不在擎的地盘——persist 链路是 renderer `chat_storage_store.js` → `window.chatStorageAPI` → `electron/main/services/chat_storage`，零 Python，归 dev-electron+dev-chat-core。剔除后擎每个 release 只剩单件主活：0.1.9 Gemini(S-M)、0.1.10 skills(M)、0.1.11 runner(M-L)、0.2.0 pool(L)。thread 后端部分只有 S（chats 已有 threadId、消息已有 parentId，后端只需 memory 作用域跟随分支）。

**How to apply:** 复评触发器 = 0.1.10 结束时用实际 velocity 重新评估；若 external agent-runner 设计出炉后量级上修为 L、或 CEO 要给 0.2.0 提速，届时再招且新人边界清晰（runner/pool 域），符合 [[hiring-policy]]。真正的挤压点是 0.1.11→0.2.0 擎连续两件 M-L/L 同域活。Gemini 量级的关键不确定性：Gemini OpenAI-compat 端点是否支持 Responses API（unchain OpenAIModelIO 走 Responses API 且不收 base_url、只收 client_factory）；若只有 chat.completions，捷径退化为写 ~150-280 行 ModelIO（hyperspace.py 是 compat adapter 先例）。unchain_adapter.py provider 白名单硬编码 6 处（L99/717/724/734/747/750）应顺势收敛为 registry 驱动。三个前置设计（Gemini 路径/skills 位置/agent-runner 接口）已委托 pupu-architect，①先交付以解锁 0.1.9 派活；runner 接口按 0.2.0 pool 复用约束设计=单向门。参见 [[roadmap-019-020-review]]、[[chat-storage-whole-store-persist-bottleneck]]。
