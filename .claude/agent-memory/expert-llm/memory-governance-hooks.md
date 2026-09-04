---
name: memory-governance-hooks
description: 记忆治理两个挂点的真实语义(读侧/写侧)与最小起步顺序;含 :923 行号语义纠偏
metadata:
  type: project
---

记忆治理沿 unchain 私有 wheel 之外的两个 Flask 侧挂点增量起步。关联 [[a2a-channel-direction]] 的伪常驻方向、[[finality-ownership-contract]]。

**挂点真实语义(2026-06-20 读代码核对,行号会漂,语义为准):**
- 读侧 memory_factory.py(~:923 附近)= **Qdrant search/query_points 兼容补丁** `_patched_similarity_search`,即检索执行本身,**不是**重排注入点。早期记忆误记为"重排挂点",已纠偏。重排逻辑要新加在检索结果之后,不是改这段补丁。
- 写侧 unchain_adapter.py(~:5158 附近)= `memory_manager.commit_messages(...)` 调用,当前**未传** long_term_extractor 之类治理参数。wheel 边界:**未知 kwarg 被静默丢弃** → 写侧任何接参改动第一步必须做"契约验证"(从 last_commit_info 观测到行为变化),否则等于没接。

**Why:** 读侧改动零模型开销、不碰 wheel、可回滚;写侧在 wheel 边界且不可观测风险高。风险/成本不对称决定先读后写。

**How to apply:** 
1. 第一步只做读侧确定性重排 `score=α·cos_sim+β·recency_decay+γ·importance`(episodes 半衰期暂拍~14天 facts 不衰减,需复核)。eval:30-50 条金标准检索集量 recall@5/nDCG@5 + 注入后答案 LLM-judge 成对盲评(胜率>50% p<0.05)+ token/turn 与 $/turn 不增。
2. 第二步才碰写侧:先契约验证,再量去重收敛率/冲突消解正确率;reflection/consolidation 最后做(最易引入幻觉式自我总结)。
