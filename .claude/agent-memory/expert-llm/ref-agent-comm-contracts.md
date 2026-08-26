---
name: ref-agent-comm-contracts
description: 愿景研究/agent-teams 通信契约层一手证据;6个前沿框架"agent间如何通信"的载体/隔离/ownership/汇汇/开销,含 O(n²) 反模式
metadata:
  type: reference
---

2026-06-20 为 CEO 的 agent-teams 战略讨论做的"前沿工程现状"调研。我亲自在 opus 上用 WebSearch/WebFetch 取证(Fable 链停摆,禁 spawn researcher;Bash git clone 与部分 WebFetch 被 deny,故落到官方文档+论文)。挖的是**通信契约层**,不是框架功能对比。

## 一手证据锚点(URL + 机制)
- **Anthropic multi-agent research** — anthropic.com/engineering/multi-agent-research-system。orchestrator-worker 单向;lead 给 subagent 的委派必须含 objective/output-format/tools/boundaries(模糊委派会失败);subagent 把产物写**外部 filesystem/artifact store**,只回传 lightweight reference(避免"传话游戏");lead 把 plan 存 Memory 防 200k 上下文溢出;**multi-agent ≈ 15× chat token**;token 用量解释 80% 性能方差。subagent 互相不可见(单向)。
- **OpenAI Agents SDK handoff** — openai.github.io/openai-agents-python/handoffs/ + ref/extensions/handoff_filters/。handoff 暴露为 tool call `transfer_to_X`;**默认接手方看到全部历史**;`input_filter`/`HandoffInputData`(input_history/pre_handoff_items/new_items)是**唯一的 context 隔离杠杆**,`remove_all_tools()` 可剥工具消息;可带 typed input(on_handoff callback);handoff 后**控制权转移不自动回弹**。
- **LangGraph** — channels+reducer。并行 worker 经 Send API fan-out;回汇靠 state key 上的 reducer(`Annotated[list, operator.add]`)合并并发写,**无 reducer 并发写会冲突**;handoff = node 返回 `Command`(state 更新+控制流二合一)。这是"共享黑板"范式。
- **MetaGPT** — arxiv 2308.00352v6。**shared message pool + publish-subscribe**;agent 发结构化消息到中心池,按 role profile 订阅拉取;论文原话:one-to-one 通信"complicate the communication topology, resulting in inefficiencies";全广播导致"information overload";通信载体是**标准化文档/SOP 不是对话**。
- **CrewAI** — sequential(task.output 自动成下游 context,pipeline)/ hierarchical(manager_llm 动态分派+审核)。`memory=True` 给共享记忆空间。
- **AutoGen GroupChat** — microsoft.github.io/.../design-patterns/group-chat。GroupChatManager 选发言人→**广播给所有人**→共享全量 history。这是 O(n²) token 反模式的活标本(官方 selector/优化都在回避它)。

## 我提炼的 6 个通信模式(给 PuPu 合成用)
1. Orchestrator-Worker(单向委派+引用回传)— Anthropic
2. Handoff(控制权转移,默认全历史+filter 隔离)— OpenAI/Swarm
3. Shared Blackboard(共享 state + reducer 仲裁并发)— LangGraph/CrewAI
4. Pub-Sub Message Pool(中心池+订阅过滤,避免 n×n)— MetaGPT
5. Artifact/Document-as-protocol(产物即契约,非对话)— MetaGPT/Anthropic
6. 反模式: Conversational Group Chat(全广播,O(n²) token)— AutoGen GroupChat

## 给 PuPu 的判断
"teams 对用户不可见 + 沟通是核心"约束下,最值得采纳 = **Orchestrator-Worker 单一面孔 + Artifact/引用回传 + 默认隔离上下文**;明确**避开** group-chat 全广播。ownership 用"谁拥有 artifact / 谁是 lead"编码,不靠对话协商。详见对话内交付报告。关联 [[pupu-agent-northstar]] [[a2a-channel-direction]] [[listener-node-ai-semantics]]。
