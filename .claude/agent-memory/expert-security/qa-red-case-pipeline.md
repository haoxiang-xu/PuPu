---
name: qa-red-case-pipeline
description: 与 pupu-qa-tester 的流水线约定——每个 exploit 场景必须固化为会失败的红用例回归测试
metadata:
  type: feedback
---

规则：我出的每个 exploit 场景，交给 pupu-qa-tester（验）固化成"防御缺位时会失败"的红用例回归测试；**没有红用例的防御等于没防御**。

**Why:** QA 在见面会（2026-06-10）明确此流水线——防御若不可回归验证，会在后续迭代中静默失效。
**How to apply:** 每个 finding 的修复方案必须附带可测的 exploit 复现步骤，作为移交 QA 的测试用例输入。首批两类：① IPC 边界完整性（bridge 白名单、伪造 channel、`.js`/`.cjs` 双变体同步）；② 注入→工具确认门控拦截断言。关联 [[team-roster]]。
