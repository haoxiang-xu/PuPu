---
name: canonical-journal-projection-approval
description: 2026-08-02 我 APPROVED unchain context-memory-v2-core 分支的 canonical journal chat-history projection 缺陷修复(message.user/assistant 曾被静默忽略),仍不涵盖 PuPu cutover
metadata:
  type: project
---

在同一个 worktree(`/Users/red/.config/superpowers/worktrees/unchain/context-memory-v2-core`,分支 `codex/context-memory-v2-core`,审查时 `src/unchain/context/` 整体未提交/未合并)上,继续 [[context-memory-v2-durability-core-approval]] 之后的第二轮审查,范围是一个具体缺陷:语义 `message.user`/`message.assistant` journal 事件曾被静默忽略,导致只有 CURRENT_TURN 到达模型(canonical 历史整体丢失)。核心逻辑在 `src/unchain/context/compiler.py` 的 `_canonical_journal_message_candidates` + `project_canonical_journal_messages`,以及 `src/unchain/context/coordinator.py` 的两遍编译协调。

**结论:APPROVED**,范围严格限定于这个 Unchain core 缺陷修复本身,不包括仍未接线的 PuPu 生产侧 cutover(未接线,不在本次审查范围内)。

**验证方法**(未凭报告数字轻信,亲自复现):
- 精读 compiler.py 全文(2009 行)+ coordinator.py 全文 + test_journal_message_projection.py 全文 + test_context_compile_coordinator.py 相关段落。
- 聚焦测试:pytest tests/context_v2/test_journal_message_projection.py tests/context_v2/test_context_compile_coordinator.py -q → 29 passed。
- 扩大到 tests/context_v2/ tests/test_context_memory_contract.py tests/memory_v2/ → 522 passed, 4 xfailed。
- 全量 tests → 1579 passed, 2 skipped, 4 xfailed,与对方报告的数字逐字精确匹配。
- 额外亲测(超出既有测试套件覆盖):用 python -c 内联脚本独立验证三件既有测试没有直接覆盖但审查清单明确要求的性质:
  1. 幂等性/确定性:对同一个 request 连续三次调用 project_canonical_journal_messages → once == twice == thrice(真正的不动点),而不仅是靠 coordinator 两遍编译测试间接推断。
  2. event_cursor_conflict 类型化失败路径:构造同一 event_id 在两个不同 store_seq 下重复出现 → 正确抛出 JournalMessageProjectionError(reason=event_cursor_conflict)(这条防腐化分支在测试套件里零覆盖,是我自己写探针补上的证据,而非施工方证明)。
  3. source_cursor_order_invalid 类型化失败路径:构造一个带 cursor 的前导 system 消息、其 store_seq 高于后续历史候选 → 正确 fail-closed(拒绝而不是把消息静默错序喂给模型)。

**逐项核对审查清单**(均通过,证据见测试文件/亲测,不重复展开每一行):system/developer 前缀恒在最前;canonical 历史在压力线以下被投影且非 Last-N(50 轮测试证明是预算驱动的完整轮次保留,非截断最近 N 条);精确 cursor 去重但同文本不同 cursor 存活;无 cursor 的当前尾巴在 write-lag 场景下原样存活且顺序正确;cursor 不匹配/角色错误/工具线伪造全部类型化失败(四种参数化 + 我自己的两条探针);derived final_message 只认 root、需要更晚的成功 run_completed/graph 最终步、排除 failed/cancelled/partial、canonical assistant 存在时不重复派生(四条专门测试全覆盖);generation 隔离在投影前拒绝;工具事件保持中立、不泄漏进原生聊天历史;完整投影后的 request + SourceMessageCursor 被 coordinator 两遍编译与 checkpoint 持久化共用同一份(checkpoint payload 里的 source_messages 就是投影后的 canonical 历史,不是原始 raw request)。

**一个非阻断的次要观察**(记录但不否决):当 run_completed 事件仅用于门控某个 final_message 的资格判定、且该次 run_completed 本身没有触发任何 pending-interaction 清理/artifact/handoff 消费时,它的 (event_id, store_seq) 不会进入 _build_envelope 的 source_range/included_ranges/transformed_ranges——envelope 会少报而非多报实际读取过的 journal 窗口。这只是审计口径的保守低估(不会导致内容错序、重复计数或数据丢失,模型看到的聊天历史是对的),与审查清单里明确禁止的 double counting 是相反方向,故不构成阻断项,但值得未来做 envelope 精度收紧时留意。

**Why**: 这是给这个具体 canonical journal 投影缺陷是否真的被修复、而不是换了个方式继续静默丢历史开绿灯的下界证据——不是采信施工方报告的通过数,是自己读代码+自己写探针把测试套件没盖到的类型化失败分支和幂等性亲自逼出来验证过。

**How to apply**: 这条批准不覆盖 PuPu 侧生产 cutover——message.user/assistant 投影逻辑要真正接到 PuPu 的 unchain_adapter.py/memory_factory.py 之前,仍需要单独评审接线点(request 如何构造 semantic_events、source_message_cursors 从哪来、以及 PuPu 侧 classifier 可用性/错误面——那部分沿用 [[context-memory-v2-durability-core-approval]] 里已经声明的单独 VETO 状态)。若该分支后续有新 commit,视为新变更需要重新核实,不能引用这条记忆里的行号/实现细节当作已验证的现状锚点(worktree 审查时未提交,commit hash 不可靠)。
