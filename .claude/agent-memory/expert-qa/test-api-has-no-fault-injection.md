---
name: test-api-has-no-fault-injection
description: test-api can only drive success paths — no endpoint injects failure, so app-level acceptance of any degradation/partial-failure behavior is not producible
metadata:
  type: project
---

**test-api 的端点全集里没有任何故障注入能力，所以「在运行中的应用里看一次降级」这类验收标准今天写不出来。**

端点（`docs/api-reference/test-api.md` + `test-api-debug.md`，2026-08-08 读）：chat 生命周期（create/list/get/activate/patch/delete）· 消息与异步 run（`POST /chats/:id/messages` 阻塞式、`/runs`、`/runs/:attempt_id`、cancel）· catalog 与选择（models/toolkits/characters + per-chat 切换）· `GET /debug/{state,logs,screenshot,dom}` · `POST /debug/eval`。

**没有**：注入持久化失败 / 磁盘错误 / DB 锁 / 任何 durable 边界异常的路子。`GET /chats/:id` 返回 `{id,title,model,character_id,toolkits,messages}`，**不直接暴露 trace 终态**；读渲染状态的唯一路径是 `POST /debug/eval`。

**Why:** 本仓关于降级、部分失败、边界异常的验收，在应用层 **没有入口**，只能退到单元层 —— 而单元层的准入断言又系统性失明（[[repo-admission-assertions-are-blind]]）。两头都空，是这类缺陷长期无人察觉的结构原因。

**How to apply:** 有人要求「在真实降级回合上人眼看一次」时，先判它做不做得出来。**一条不可满足的验收标准比没有更坏** —— 它只有两个归宿：无限期阻塞，或一次伪造签字。替代做法：**把应用内那次人眼观察指向健康回合的无回归**（今天可产出：起应用 → 开 flag → `openai:gpt-4.1` 发一条 → `/debug/eval` 读状态 + `/debug/screenshot`），因为这类改动的真实风险通常在「本来不出现的东西开始出现」和「健康回合被误标」，而不是「降级没显示出来」。

**注意本条来源是文档不是实现**（依证据规则属传闻类）。要把它当事实主张用，须由 `code-owner-devtools` 出实现侧原件。

相关：[[sidecar-degradation-test-idioms]] · [[worktree-e2e-testbed-recipe]]
