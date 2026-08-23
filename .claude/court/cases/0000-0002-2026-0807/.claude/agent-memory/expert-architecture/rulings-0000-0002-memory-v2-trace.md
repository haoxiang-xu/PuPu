---
name: rulings-0000-0002-memory-v2-trace
description: 本领域在 case 0000-0002-2026-0807 出的鉴定先例 —— 结论、当时的理由、以及后续是否被验证或推翻（待回填）
metadata:
  type: project
---

# 鉴定先例 · `0000-0002-2026-0807`（2026-08-07，S-0020）

**结论**：有条件成立（8 条必要条件）+ 两项「不成立」。以 `opus` 出具（Fable 5 配额耗尽，S-0021 补记一），本领域声明模型替代不实质影响结论。

**事后验证状态：待回填。** 下一次进入 Memory V2 / trace / runtime_events 区域时，先回来核对这一节。

## 出的两项「不成立」（进 chief-judge 强制回应清单）

| # | 内容 | 翻转条件 | 事后 |
|---|---|---|---|
| i | **(b) 先删再定词汇结构上不成立** —— 删除会留下 `memory_v2_store_boundary.py:96` 这个仍指向被删实现的活默认值 | 删除切片同批改掉该默认值 → 本项消除，且 (a)/(b) 在结构判据上不再有差别 | 待回填 |
| ii | **「存量 `pupu_legacy` 处置是删除的必要前置」这个 *推论* 不成立**（其 *事实* 成立）。`pupu_legacy` 是模块默认值不是产品配置，Electron 恒发 `off\|unchain` | **任一已发布版本被证明未设 `PUPU_CONTEXT_V2_STORE_OWNER` → 立即翻转**，翻转后严重度按 S-0016 成立。本领域未核实历史版本，这是最脆弱的一处 | 待回填 |

## 核心鉴定：三选一是错的形状

使本案成为一案的 Q1↔Q10 耦合论证，被提出者本人在 S-0018 撤回。四张 (c) 票的「共用前置」归类：**两个同源**（收端白名单 + Memory Agent 配置面 —— 同一失败类的两端：一条有产出源无声明形状，一条有声明形状无产出源）· **一个是分案缺陷的产物**（agents 的「容器」，其本人自陈「争的是容器不是顺序」）· **一个真正独立**（electron 九道门 —— 一切改动的前置，与同不同案无关）。

> **教训（可复用）**：当 N 方各自用 **不同理由** 支持同一个捆绑决定时，先假设他们找到的不是耦合，而是 **一个没有归属的东西**。把 case 分解缺陷记成技术耦合，代价是下一次同类议题会再被迫捆绑。

## 本轮取到、庭上无人提出的根因

**`memory_v2` 帧载荷在产端没有被声明过形状。** 不是「两侧各写一份键表」（U-R2 / U-C5 的表述）——

- 收端：`memory_v2_trace_presenter.js:9-69` 一张 **59 项**冻结表（庭上记 60，差 1），全仓唯一
- 产端：**没有表。** `_memory_v2_merge_diagnostics(**values)` 收任意 kwarg；`update_diagnostics` 直接 `self._latest = copy.deepcopy(values)`（**整字典替换**）；`memory_v2_bundle_payload` 原样透出
- 写入点 **~24 个**（`memory_v2_context.py` 21 + `memory_v2_context_adapter.py` 1 + adapter 助手），字面量顶层键 **≥45，白名单收 4**（庭上一直按「7 丢 6」核算）
- 替换语义已被代码库自陈并绕行 **两次**，互不知情：`_StickyMemoryV2Admission` docstring 逐字写「Keep admission identity visible when compiler diagnostics are replaced」，重注 15 个 identity 键；adapter 的 merge 助手是第二处。**`memory_agent_runs` 不在 sticky 集合里**

**下游症状全部由此而来**：四个产出即丢弃字段 · 六道静默门 · 两侧词汇漂移。

## 判据（可复用，不限本案）

1. **一个安全过滤器不能同时当 schema 用。** 二者失败方向相反：安全过滤器必须 fail-closed 且沉默，schema 必须 fail-loud。合用一个制品 → 新字段被完全按设计丢掉且无人被告知。判断方法：看这个制品里有没有同时住着脱敏正则/封顶常量 **和** 字段表（presenter 就是）
2. **「每道门加 default 分支 + 计数」是无效处方**，本仓已有反例：`event_store.js:186-191` 早就有计数，`unknownEvents` 全仓零读取。**加 N 个计数器 = 造 N 个新的 `unknownEvents`**
3. **弃用一个 store owner 的正确形状：先取消可选性 → 发一个版本 → 再删实现。** 倒过来做，删除动作本身会引入新故障
4. **「双向对账测试」的前提是两侧都有可读的集合。** 一侧是开放集合时，该测试只能实现为源码字面量抓取，而字面量抓取在键名由变量拼出时静默漏报 —— 它本身就是同一个失败类
5. **facade 只有在没人绕过它时才是边界。** `PupuUnchainActiveBridge` 声明三个方法，外部已有 ~13 处 `bridge.preparation.*` 直读（含与 `persist_host_event` 内部逐字相同的五层链）。**推论**：往这类 facade「加一个 accessor」收敛效果为零

## 单向门（本案走过 / 待走）

- **`TOP_LEVEL_KEYS` 扩表 = 持久化 schema 变更**（唯一非渲染消费者 `chat_storage_sanitize.js:739`），历史行不可回收
- **`service.js:935` 加 capability 项**：相等门，旧 sidecar + 新 Electron = 整个启动失败，不是降级
- **删除那四个文件**：代码可从 git 恢复，**观察机会不可恢复**（这是 runtime 改票后那条排序论据的真正力量）
- **「过程信号 + 新 runtime event 类型」**：进共享协议不可单方面撤，且触发 quorum 不完整（`code-owner-unchain` 不在必到名单）

## 同词异义台账（本案累计四处）

`Isolated`（curator 状态 ∥ `PupuRawIsolatedMemoryAgent`）· `bundle`（PuPu `_build_bundle_from_result` ∥ unchain kernel usage）· `memory`（`src/locales` 的 V1 chat memory ∥ Memory V2）· **`pupu_legacy`（store owner ∥ chat history 来源格式）** —— 前三处庭上被抓到，第四处是本领域补的，**且是唯一落在 Q10 决策面上的**：`bootstrap_pupu_legacy_history_into_unchain` 看起来像迁移路径，实际 `history` 由调用方传入，不读任何 store。

相关：[[architecture-judgment-criteria]]
