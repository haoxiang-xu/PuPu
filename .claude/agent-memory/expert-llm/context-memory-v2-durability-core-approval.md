---
name: context-memory-v2-durability-core-approval
description: 2026-08-02 我 APPROVED unchain context-memory-v2-core 分支的 durability 核心(仅 core,PuPu 侧 classifier 可用性/错误面仍单独 VETO 中)
metadata:
  type: project
---

在 unchain 仓库(独立于 PuPu,worktree 路径 `/Users/red/.config/superpowers/worktrees/unchain/context-memory-v2-core`,分支 `codex/context-memory-v2-core`,审查时未提交/未合并)的 context-memory-v2 durability 传播核心,我作为 LLM/runtime owner 给出 **APPROVED**,范围严格限定于"这个 Unchain core 对后续 PuPu cutover 是否足够安全",不涵盖仍单独 VETO 中的 PuPu 侧 classifier 可用性/错误面。

**验证方法**:未凭报告数字轻信,亲自读了全部指定文件(durability.py/context/runtime.py/coordinator.py/retry 三件/providers/openai.py/subagents/executor.py+plugin.py)+四个测试文件,并亲自跑测试复现:
- `.venv/bin/python -m pytest tests/test_durability.py tests/test_durable_runtime_boundaries.py tests/test_retry_types.py tests/context_v2/test_context_compile_coordinator.py -q` → 40 passed
- 扩大到 retry/subagent/durable/context/coordinator/openai 相关全部 → 331 passed
- 全量 `tests` → **1560 passed, 2 skipped, 4 xfailed**,与对方报告的数字逐字精确匹配

**10 项前置强制修正逐一代码+测试双重核实**(均通过,细节见对话记录,不重复展开):last_error 真遍历(durability.py find_durable_persistence_failure 含 last_error candidate)、RetriesExhaustedError 不再嵌 repr(args=(code,)/str=code/repr 不含 secret,测试用不可 str() 的异常反向验证)、DurablePersistenceBoundaryError 安全诊断+无 cause 插值+suppress_context、遍历 cycle-safe 且有 1024 节点/32 深度上限(有专门对抗性测试)、SubagentToolPlugin 全部 8 处 except 位点(execute 外层 + 7 处 _run_child 调用点)一致 durable-first bare-raise、batch-local threading.Event 是取消唯一真源+_BatchExecutionGuard 仅在既有 model/tool 效应门注入检查(有跨线程同步屏障测试证明 running child 在下一个门被停,且模型/回调确实未被调用)、first durable wins 由锁保护的 first_durable_failure list 决定(不是 future 完成顺序决定)、OpenAI previous_response fallback 在调用任何字符串启发式之前先查 is_durable_persistence_failure(用 __str__ 会 assert 失败的异常类反向验证确实没被 stringify)、Kernel 侧无任何 Partial 包装路径(grep kernel/loop.py 无 Partial/except 兜底,durable 失败就是原样传播出 Agent.run())。

**Why**: 这是给"后续 PuPu cutover"开绿灯的下界证据——core 库这一层的正确性已经过独立复现验证,不是我方一厢情愿采信施工方报告。

**How to apply**: 若未来要推进 PuPu 侧对 unchain context-memory-v2 durability 语义的接入(classifier 可用性暴露给用户、错误面文案等),那部分仍是未完成/单独 VETO 状态,需要重新评审,不能引用这条 core 批准当作已经覆盖。若 unchain 仓库该分支后续有新 commit,视为新变更,需重新核实而非信任本记忆里的行号/实现细节(worktree 审查时未提交,commit hash 不作为可靠锚点)。
