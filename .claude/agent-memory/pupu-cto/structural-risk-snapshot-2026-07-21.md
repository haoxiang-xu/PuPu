---
name: structural-risk-snapshot-2026-07-21
description: 战略盘点中核出的结构风险漂移：两大 god-file 一月内涨 3-5 倍、CLAUDE.md/docs 关键数字已失真、main 无 branch protection、remote provider 仍只 2 家
metadata:
  type: project
---

2026-07-21 CEO 战略评估取证时核出的漂移（均为当日实测，非印象）：

- **god-file 增速失控**：`unchain_adapter.py` 7264 行/274KB（6 月文档记 99KB，≈2.8x）；`use_chat_stream.js` 9126 行/331KB（文档记 ~1900 行，≈4.8x）。卫星 hook 已拆出十余个但主体仍在吸收所有 feature 质量。**每个新 feature 都在向这两个文件借债。**
- **文档真相源在衰减**：`.claude/CLAUDE.md` Key Files 表仍写 routes.py 55KB（实际已拆成 ~40 个 server 模块、routes.py 仅 3.7KB）、hook 1900 行。agent 团队以 docs+memory 为地面真相，失真会直接毒化 agent 决策——本次盘点我自己就先被误导。
- **main 分支无 branch protection**（gh api 404），release-qa.yml 四 job（deterministic/unchain-dev-compatibility/playwright-electron matrix/package-matrix）存在但纯 advisory；merge 纪律是社会性的不是机械性的。
- **remote provider 仍只 openai/anthropic**（api.unchain.js:28），Gemini 未落地——相对 Cherry Studio 类竞品低于行业标配线。
- 速度基线：近两周 209+112 commits/周 vs 6 月基线 20-40/周——当前是冲刺态非常态。

**Why:** 这些是 CEO 战略判断的输入；也是下次派活/评审的风险底图。
**How to apply:** ①任何再往 adapter/hook 加逻辑的派活先问"能否落在卫星模块"；②建议尽快派人刷新 CLAUDE.md/docs 关键数字（低成本高杠杆）；③branch protection 是一条 30 分钟的机械化收益。关联 [[backend-sizing-2026-07-05]] [[ci-posture-2026-06-26]] [[prelaunch-gap-analysis-2026-06-26]]。
