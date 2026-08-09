---
name: v2-vector-view-ruling
description: 鉴定先例 0000-0008 — 不为 V2 造投影（忠实度/tree是ground truth/重拟合SVD不稳定三条）；附 V1 向量供给在 V2 admission 下被切断这一写端事实
metadata:
  type: project
---

**2026-08-08 `0000-0008-2026-0808`《Memory Inspector 新增 V2 Tree View》，我交 `有条件成立`，五条必要条件 C1–C5。**

**Why**: 庭上 `code-owner-runtime` 把 Q3 从「V2 有没有投影代码」转成「该不该为 V2 造一套投影」，触发条件命中我，第三层补传。

## 一 · 我的核心判断：不该造投影（三条独立理由，任一条即够）

1. **忠实度** —— 散点图的唯一正当性是「展示的几何 = 系统实际使用的几何」。V1 满足（画图向量就是召回向量）；V2 检索是纯词法 FTS5，为画图现算的 embedding 与召回 **零因果关系**。用户的自然推断（靠得近的会被一起想起来）是假的。**在一个价值就是「可信记忆」的子系统上展示可信度为零的自画像 = 花钱制造误导。**
2. **V2 已有更好的自我视图，就是 tree** —— path 层级 + typed kind + tags 是 **作者写下的 ground truth**；投影是有损派生结构。**用后者取代前者是降级。** 故「V2 的 vector view 是什么」的正确答案是「就是 tree view」。
3. **结构上不可移植** —— `route_projection.py:344-370` 每次请求对全集 **重拟合 SVD**。V1 会话作用域有界能忍；V2 store 长期无界增长，同一做法产生一张每加一条记忆就重排（含主轴翻转）的地图。**地图的价值在稳定。**

**顺序铁律：可视化永远不得成为制造 embedding 的理由。** 检索架构决定在前，投影至多是下游可选后果。可另立的正当议案是「V2 是否升级为混合检索」（RRF 常量 `memory_v2_vector.py:43-45` 已预留），收益是召回质量不是一张图。

**「三样缺一不可」我拆了**：对 FTS5 语料做 TF-IDF→SVD（LSA）就能出坐标，零新 provider。**主动拆自己台，是因为「做不到」这个假理由会让庭免于在真问题上表态。**

## 二 · 写端事实（本案我最重的一条新发现）

**V1 vector view 的读端确实 store-owner 无感知（`route_projection.py` 三标识符 grep=0），但供给来自写端，而写端是 V2 感知的：**
- V2 admission 生效 → `_resolve_memory_runtime` 走 `kind="v2_durability"`（`unchain_adapter.py:5579-5615`）
- 该运行时是 `KernelMemoryRuntime`，**实测无 `commit_messages` / `prepare_messages`**
- 装 `DurabilityModule` 而非 `MemoryModule`（`:7183-7191`）；graph 路另有 `memory_commit_allowed` 双保险（`:8731/8753/9488`）
- 工厂 docstring 自陈「deliberately bypasses Qdrant and embedding resolution」（`memory_factory.py:1677-1682`）

**净效果：V2 越真上线，V1 散点越空，且静默（200 + 空 payload，与「尚无记忆」逐字节相同）。** shipped 包 rollout 冻结 off，故 **这条风险从 0.1.10 记忆 agent 发版当天开始咬**。

## 三 · `degraded` vs `disabled` 的判定（丙）

`disabled` = `NullVectorBackend.status()` 计算得出且为真；`degraded` = `memory_v2_unchain_read_adapter.py:489` 字面量，**构造上不可达其他值**，且它断言的「能力存在且受损」是假的 —— 真实是 **缺席(absent) 非受损(impaired)**。相邻 `:488` 的 `backend` 也取 `"degraded"` 而 **那处是真算的** → 同一 token 一真一假。

**判据（可复用）：一个构造上不可变的状态 token 不能承载契约。** 与 [[memory-v2-trace-vocabulary-anchor]] 的「终态不得由自由文本子串决定」是同一原理的两面。**处方是禁令不是构件**：renderer 不读它，`grep -rn "vector_status" src/` 应恒为 0。

## 四 · 若将来有人再提投影，三项前置 eval（我已写进案卷）

E1 忠实度（2-D 近邻 vs 生产检索器 top-k 的 Jaccard@10，<0.6 即不得以暗示检索的方式呈现）· E2 保留方差（端点已在算，要下限且如实显示）· E3 布局稳定性（加 k 条后重投影测点位位移）。

**How to apply**: 任何「给 X 加一个向量/语义可视化」的提案，先问忠实度与是否已有 ground truth 视图。见 [[memory-toolkit-model-visible-surface]]（同案 C5 的成因）。
