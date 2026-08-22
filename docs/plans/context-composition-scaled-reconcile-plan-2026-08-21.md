# Plan · Scaled Reconcile(`utf8_heuristic_v2`):按账单缩放归因,复活 reconciled 与份额百分比

> 2026-08-21 由验收方起草,CEO 直令跳过立案直接出 plan。执行完成后仍由原会话验收。
> 本文件不入库。前置计划:`context-composition-attribution-plan-2026-08-21.md`(P1/P3/标定已完成并验收)。
> 所有 file:line 起草时已核实;以现场代码为准。

---

## 0. 背景与一处事实修正

三方向真机实测(英文短/英文长/中文长)证明:bytes/4.5 heuristic 对真实内容系统性高估 20~40%,`attributed > provider_input` 几乎恒成立 → quality 永远停在 `estimated`,面板的 Unattributed 行、reconciled 徽标、**每行的份额百分比**(PuPu 侧 `percentageAvailable` 只在 reconciled 才 true,`context_composition_v1.js:494`)全部永久死锁。且面板当前**可见自相矛盾**:标题行 ~3.8K(真实账单)而类别行加和 5.3K。

**修正验收方此前的一个错误说法**:"method 升 v2 且 PuPu 零改动"不成立。已核实 `PuPu/src/SERVICEs/context_composition_v1.js:7` `const METHOD = "utf8_heuristic_v1"`、`:224` `if (value.method !== METHOD) fail(...)` —— method 被精确 pin 死。留痕(升 v2)与零改动二选一。本计划选**留痕**:PuPu 侧改一处 allowlist(v1、v2 双接受),因为历史 receipts 永远带 v1,数据考古必须能区分新旧算法的数字。这构成一次真实的跨边界 CLOSED 枚举扩容,BC 义务见 §4。

## 1. 核心设计:缩放算法

位置:unchain `src/unchain/context/composition.py::_derive_context_composition_extension`,category 循环产出 subtypes/attributed 之后、quality 判定之前。

**触发条件**:`coverage_complete and provider_input_total is not None and attributed_tokens > provider_input_total`。

**守卫**:令 N = 全部 matched subtype 条目数。若 `provider_input_total < N`(无法保证每 subtype ≥1,PuPu 侧 `integer(..., {positive: true})` 要求 ≥1,`context_composition_v1.js:178-189`)→ **不缩放**,保持现行 `estimated` 分支。真实世界几乎不可达,但必须有测试。

**算法(min-1 + largest remainder,确定性)**:
1. 每个 subtype 先分 1(共 N);剩余池 `pool = target - N`;
2. 每个 subtype 追加 `floor(tokens_i / attributed * pool)`;
3. 余数 `pool - Σ追加` 逐个 +1,按小数部分降序分配,**并列时按既有 canonical 顺序**(category 循环顺序)——确定性是硬要求:`enrich_provider_call_receipt` 会双推导比较相等(`build_context_composition_extension` 是同一 derive 的纯包装,`composition.py:835-849`,天然共享,但算法内部不得引入任何非确定序);
4. category.tokens = Σ 其 subtypes;attributed = Σ categories = target;`residual_tokens = 0`;quality 走**现有** `reconciled_estimate` 分支。

比例基数用未缩放的 tokens_i(与 utf8_bytes 等价,除数相同)。utf8 测量事实不动,只缩放 token 投影。

**method 常量整体升 `utf8_heuristic_v2`**(`CONTEXT_COMPOSITION_METHOD`,composition.py:27):v2 定义为"bytes/4.5 + overrun 时按账单缩放"这一整个方法族;不做"缩放才 v2"的分裂——同一运行版本产出两种 method 会毁掉考古。internal manifest 校验用同一常量,进程内自洽;manifest 只活在单请求内存、receipts 持久化的是成品 extension、恢复不重推导(前一计划已验证),无跨版本 skew。

**quality 终态语义**(执行后成立,写给验收):
- `partial` ⇔ coverage 不完整(**永不缩放**——覆盖不全时缩放是假精度);
- `reconciled_estimate` ⇔ coverage 完整 且(attributed ≤ input 自然达成 **或** 经缩放达成);
- `estimated` ⇔ coverage 完整 但 usage 不可用,或守卫触发。从常态变成罕见异常态。

## 2. 改动清单

**unchain(主体)**:
- `src/unchain/context/composition.py`:缩放逻辑 + method 常量升 v2 + 注释(说明 v2 语义与守卫理由);
- 既有测试更新:`tests/context_v2/test_provider_turn_execution_service.py` quality 参数表——`("heuristic_overestimate", "estimated", 3, 2)` 行改为 `("heuristic_overestimate", "reconciled_estimate", 2, 2)` 且 residual 断言 0;residual 断言行 `(1 if case == "reconciled" else None)` 需按新语义重写;新增守卫 case(`input_tokens=0` → estimated 保持)。凡 fixture 里出现 `"method": "utf8_heuristic_v1"` 的(含 `_composition_manifest()`)同步升 v2;
- 新测试(red-before-green 至少覆盖第 1 条):
  1. 缩放数学:多 category 多 subtype,Σ == target 精确、每 subtype ≥1、大子项占比误差 ≤1 token;
  2. 自然 reconciled 路径不受影响(attributed ≤ input 时数值与现状完全一致——e2e tool-schema 测试 input=1000 已天然覆盖,确认不改);
  3. 守卫:input < N → estimated 不缩放;
  4. partial 不缩放;
  5. method 字段锁 v2(防回退)。

**PuPu(一处 + 测试)**:
- `src/SERVICEs/context_composition_v1.js`:`METHOD` 单值 pin → 双值集合 `{"utf8_heuristic_v1","utf8_heuristic_v2"}`,`:224` 改集合成员判断。**v1 必须继续被接受**——历史数据硬约束;
- 测试(该文件既有 `context_composition_v1.test.js`):v2 正向接受;未知 method(如 v3)负向仍拒(CLOSED 不放松);全部既有 v1 fixture 不动、必须继续全绿。

## 3. 不改的东西(执行者别越界)

- PuPu 面板/ring/popover 一行不动:reconciled 分支的交叉校验(`attributed <= input && residual == input - attributed`,`context_composition_v1.js:485-489`)缩放后自然满足(attributed==input、residual==0);Unattributed 行 residual=0 时不渲染是**正确语义**(没有未归因的 token),不要为了"让它出现"做任何事;
- bytes/4.5 除数与 P1 的 tool_schema 测量不动;
- toolkit 选择 bug(74/20 与选择无关)是独立立项,不碰;
- unchain 主树他人 dirty 文件(P-0007 相关)不碰。

## 4. 直接工程契约与状态序列

`BC/SEQ/AC` 是技术追踪标识，不产生 owner、case、proposal、ruling、交接或批准流程。Git revision 只可记录为构建遥测；验收与发布只认下面的候选产物 digest、wheel SHA-256 和 runtime manifest digest。

- **BC-001 — Unchain receipt → PuPu sidecar**：producer 为 unchain
  `composition.py` 生成的 `unchain.context/context_composition_v1` receipt
  extension；consumer 为 PuPu sidecar 的严格 bundle projection。admission 为
  `VERSIONED + CLOSED`：仅 `utf8_heuristic_v1` 与
  `utf8_heuristic_v2` 合法，未知 method、未知 key、非法 identity、错误的
  category/attributed/reconciliation 等式都在 sidecar 拒绝。缺 extension 是
  optional-by-absence，不得损坏 base receipt；错误 extension 不得降级成可信数据。
- **BC-002 — sidecar projection → renderer normalization**：sidecar 只投影
  已验证的 content-free shape，renderer normalizer 独立重复严格 admission。
  历史 v1 只按 v1 原义显示，绝不静默重解释成 v2；v2 完整覆盖且缩放成立时，
  `Σcategories == attributed_tokens == provider input total`、
  `residual_tokens == 0`；不满足缩放前提时保留未缩放 estimate、percentage 为
  null、residual 为 null。
- **BC-003 — deployed artifact identity**：冻结 PuPu candidate 后计算
  candidate digest；从当前 clean Unchain source 只构建一次 wheel，记录 wheel
  SHA-256 与从该 wheel 实际 import 的 runtime manifest digest。contract matrix、
  package smoke、sidecar import 与最终 audit 必须复用同一 wheel 并核对这三个
  digest。源码 revision 可以记录为 provenance，但不参与 runtime admission，
  也不能用来替代 artifact evidence。

适用的状态序列全部必须有命名 AC 与 PASS；`NOT_RUN` 不能作为 release
disposition：

- **SEQ-001 — live normal path**：带 toolkit 的第一条正常消息、同 chat
  第二条正常消息、无 toolkit 负向路径、历史 v1 receipt 重读。
- **SEQ-002 — interaction and recovery**：同一执行内第一及第二次 interaction，
  retry、durable resume、cold sidecar restart 后的 resume/replay。
- **SEQ-003 — route and identity**：normal、graph、subagent 路径，以及 provider、
  runtime manifest、wheel 或 PuPu candidate identity 改变后不得复用旧 evidence。

## 5. 验收标准（AC，验收方逐条实测）

- **AC-001（BC-001/BC-002）**：Unchain producer、sidecar projection、renderer
  normalizer 各自接受合法 v1/v2，且分别拒绝未知 method/key、坏 identity、坏
  reconciliation state 与泄漏内容；测试输入必须来自真实 producer，不共享宽松
  helper。
- **AC-002（v2 reconciliation）**：完整覆盖且满足 guard 时，largest-remainder
  分配可重复，`Σcategories == attributed_tokens == usage.input.total_tokens`，
  `residual_tokens == 0`，百分比可用。
- **AC-003（honest fallback）**：usage 缺失、覆盖不全、malformed、总量为零、或
  provider tokens 少于 attribution leaves 时不缩放；保留 unscaled estimate，
  percentage 与 residual 都为 null。
- **AC-004（SEQ-001）**：真机 sidecar 重启后带 toolkit 会话两连发均满足三值
  等式；无 toolkit 路径不虚构 Tools；历史 v1 会话可正常打开且仍显示 v1 原义。
- **AC-005（SEQ-002）**：第一/第二 interaction、retry、durable resume 与冷重启
  replay 都保持同一 receipt identity，不重复 physical send，也不丢失已验证的
  composition projection。
- **AC-006（SEQ-003 route）**：normal、graph、subagent 的 producer→strict
  consumer 路径均通过；graph/subagent 的 child receipt 不污染 parent 或被重复
  聚合。
- **AC-007（BC-003）**：同一 PuPu candidate、同一 wheel 与同一 imported manifest
  贯穿 matrix、package smoke 和最终 audit；任一 identity 改变会导致旧 evidence
  被拒绝。
- **AC-008（real app/UI）**：真实 `openai:gpt-4.1` 探针显示
  `Reconciled estimate · Complete coverage`、每行百分比和与标题总量一致；探针
  会话删除并恢复原会话。

## 6. 执行约束(违者验收打回)

1. 两仓改动都**留工作树不 commit**;禁 `git add -A`;red-before-green 用 `git stash push -- <具体文件>`,严禁全局 stash(unchain 主树有他人 dirty 文件)。
2. unchain `.py` 改动后重启 sidecar:`kill -TERM $(pgrep -f unchain_runtime/server/main.py)`,Electron 侧 1.5s 自动拉起,报告注明。
3. PuPu 测试用 `CI=true npx react-scripts test --watchAll=false --testPathPattern <pattern>` 定向跑;unchain 用 `.venv/bin/python -m pytest`。
4. 真机探针:模型 `openai:gpt-4.1`,探针会话用完即删;test-api 端口在 `~/Library/Application Support/PuPu/test-api-port`。
5. DB 证据配方:copy `chats.db{,-wal}` 到临时目录,messages.payload 递归找 `provider_calls[].extensions`。
