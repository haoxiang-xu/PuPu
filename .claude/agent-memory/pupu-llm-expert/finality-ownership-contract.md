---
name: finality-ownership-contract
description: 2026-06-20 我签字的 final-message ownership 语义契约 v0(segment 级 finality 枚举),与未来 v4 payload finality 前向兼容
metadata:
  type: project
---

2026-06-20 architect(三路 Codex 5.5)+ CTO 派发的 trace #155/#66 修复链中,要我(持模型可见语义/帧语义命名规范权)签字 final-message ownership 语义。根因:渲染层用全局启发式 `frames.some(type==="tool_call")` 猜终答归属,cancel settlement 只读 streaming chunks。NOW 修、LATER(per-turn terminal snapshot / trace_view.v1)重构,LATER 的硬前提就是这份签字契约。

**我签字的核心字段(segment 粒度,非 message 粒度):**

`finality: "pending" | "draft" | "intermediate" | "terminal" | "legacy"`
- `pending` — 直播中未 settle,渲染走 streaming/draft 视觉,绝不当终答(防闪烁/reflow)。所有新生 segment 初值。
- `draft` — settle 后判为中途稿/被中断稿。**cancel 半途 settle → draft,永不升 terminal**(这是修 cancel-settlement bug 的语义点)。
- `intermediate` — settle 后的阶段性有效产出(多 tool turn 之间)。Day1 声明但不写入(渲染暂按 draft),留给 v4 trace_view.v1 启用,避免 v4 做破坏性 schema 变更。
- `terminal` — **本 turn 规范最终答案。这是 v4 payload finality 的前向兼容锚点:v4 契约必须 1:1 映射此 segment 级语义,只可加字段不可改义。** 每 message 至多一个连续 terminal 区块,位于末部。
- `legacy` — 显式哨兵(非 absent)。读取时 undefined/null/missing → normalize 层补成 legacy;渲染按只读历史正文、不做 ownership 推断、不套 draft/pending 视觉。

**关键裁定:**
- 粒度=segment 权威;message 仅可带派生只读 `has_terminal`(非权威,仅列表/侧栏用)。渲染终答必须读 segment 级——读 message flag 正是当前 bug。
- 命中判据="内容 trim 非空且非纯空白",非"字段存在"。空段不得判 terminal(防空终答覆盖)。terminal = 最后一个非空且 settle 为终答的 segment 区块。这直接替代 `frames.some(...)` 启发式。
- 用单一有序枚举而非正交布尔:ownership 任一时刻只有一个真值,枚举从类型上杜绝 pending+terminal 非法组合。
- 为何用 `terminal` 不用 `final`:final 在 SSE 语境(final chunk/frame/is_final)已被滥用,terminal 明确指规范终答归属、与传输层无关。

**v4 前向兼容锁(我可正式交接给 architect 作 v4 前置):** ① terminal=本 turn 规范最终答案 ② segment 粒度 ③ 每 turn 至多一连续 terminal 区块。

**待确认(不阻塞 Day1):** Day1 修复只需 pending/draft/terminal 三态;intermediate 建议枚举占位不实现。chat-core 若要 Day1 砍到四态我也接受。

See [[a2a-channel-direction]](envelope/role 映射,相邻的我持否决权的模型可见契约)、[[tool-injection-path]]。
