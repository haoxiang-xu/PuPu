---
name: inert-subteam-layer
description: 2026-08-04 效率审计发现 — CTO 三个子组的 lead 层是单向幻层(上级自认/下级不知/charter 静默/路由直达)，非死重问题而是真相源失真
metadata:
  type: project
---

**CTO 线的三个子组（chat-experience / config-extension / platform-security）的 lead 层在运行时不存在。**

**Why:** 2026-08-04 全量效率审计四面取证（见 [[methods]] 信号 6）：
- 3 个 lead（chat-core / settings / electron）**都**在自己 memory 里自认组长并写了具体 lead 职责（统筹契约、代表出席同步会、组内协调）。
- 4 个下属（chat-bubble / toolkit / dev-agents / security-expert）的 roster **无一提及自己有组长**；守的 roster 反而明写"我向 pupu-cto 汇报"。
- 23 份 charter 里组名出现 **0 次** —— charter 是 dispatch 时唯一被加载的面，memory 不加载，所以运行时这层不存在。
- `.claude/CLAUDE.md` 路由表 CEO→dev 直达，无组长跳；全 memory 搜不到任何一次实际发生过的 lead-hop。
- `pupu-cto.md:28` 自述"you lead 6 specialists"，实际 CTO 线 11 个直属 —— 无论按 3 组+4 直挂(7) 还是按人头(11) 都对不上，说明这层没人维护。

**How to apply:** 这**不是**绩效问题，三个 lead 本身都是活跃贡献者，不涉及裁撤。危害在**真相源失真**：`pupu-hr-head/org-chart.md` 与 HR 各成员 roster 都断言"3 sub-team 各设 lead"，HR 自己的 span-of-control 判例（[[org-review-precedents]] 判例 3）就是基于这个不成立的前提推理的。做任何 span/层级研判前，先按信号 6 复验这层是否还是幻层，别直接引用 org-chart 的 lead 标记。

**能推翻它的证据:** 三个子组名被写进 charter 正文并出现在路由表里（组长跳成为真实 dispatch 路径），或 memory 里出现下属经组长协调的实际记录。届时这条作废。
