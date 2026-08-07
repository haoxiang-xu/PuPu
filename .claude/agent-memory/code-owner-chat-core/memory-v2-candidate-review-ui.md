---
name: memory-v2-candidate-review-ui
description: Memory V2 候选评审 UI 的裁决不变量（Curator 单写者、四道 CAS 栅栏、operationId 必须绑全部栅栏）与 CRA resetMocks 静默失效陷阱
metadata:
  type: project
---

`src/COMPONENTs/chat-bubble/memory_v2_pending_reviews.js` 是 Trace 里唯一的记忆裁决面。2026-08-01 改造后的几条不该被"顺手还原"的决定：

- **raw candidate 在 UI 里恒只读（"Awaiting Memory Agent"）。`decideCandidate` 不再被这个面调用。** Why: 能同时提议又批准的渲染进程等于自己批准自己的写入；Curator 是唯一被允许把提案冻结成 review 的写者。How to apply: 任何"给候选加个一键采纳"的需求都要先过 CTO/security，不要在这个组件里私开。
- **accept/reject 只走 `decideCandidateReview`，四道栅栏缺一不可**：expectedReviewRevision / expectedCandidateRevision(=`candidate_revision`) / expectedTargetRevision(=`target.expected_revision`) / expectedSpaceRevision(从当前 `listSpaces` 解析 `target.space_id`)。后端对四个值一律 `_positive_int`，**reject 也校验**，所以空间修订解析不出来时两个按钮都要禁用，不能只禁 accept。
- **operationId 必须把四道栅栏全部哈希进去**。Why: 服务端 `_receipt_replay` 把 operation_id 绑定到 intent hash，同 id 不同 intent 直接 409 `context_v2_operation_conflict`。只按 review revision 生成 id（旧 candidate/promotion 的做法）在栅栏移动后会把用户永久卡死。栅栏没变时 id 稳定＝幂等重放，这正是要的。
- **review 只对已存在的 entry 生成**（propose 时 target 必须存在，否则 404），所以它天然是"冲突评审"，`expected_revision` ≥ 1。
- **未知 `proposed.mode` 判为不可裁决**（当前后端只产 `overwrite`）。Why: 审批门不能让用户批准一个 UI 说不清语义的变更。且 mode 是不可信文本，查表必须走 `hasOwnProperty`——否则 `toString` 会落到 Object.prototype 把函数塞进 JSX。
- **不渲染任何原始 id / object id / host path**：sha256、review_id、candidate_id、entry_id、各种 `pupu://` ref 都不进 DOM；diff 预览按行+字符双重封顶、剥控制符、host-path 形状替换成 `[redacted path]`。`diff_ref` 只用于身份/截断提示，不显示。readContent 分页展开是刻意押后的（宁可少信息也不多一条读路径）。

**CRA 测试陷阱（这次踩的）**：react-scripts 的 jest 配置默认 `resetMocks: true`，**会清掉 `jest.fn(impl)` 的工厂实现**。`trace_chain.memory_v2.test.js` 里 `mockParseContextV2ErrorCode` 原本只 `mockClear()`，于是解析出的 error code 一直是 `undefined` → 组件恒走 `context_v2_request_failed` 兜底，**"冲突后自动 reload"整条分支从来没被测到过**，而断言用 `findByText(/context_v2_revision_conflict/)` 又因为 message 里含该字符串而误绿。How to apply: 这个仓库里凡是 `jest.fn(impl)` 的 mock，beforeEach 必须 `mockImplementation` 重新装；断言错误码要断 `getByRole("alert")` 的 textContent，别用会同时匹配 `<code>` 和外层 div 的正则 getByText。

相关：[[memory-v2-p0-chat-seam]]、[[memory-v2-turn-mutation-rebase]]、[[security-attack-surface]]。
