# Plan · Context Composition 归因补全(P1 tool_schema / P2 类别覆盖 / P3 诊断日志)

> 2026-08-21 由验收方(书记员会话)起草。CEO 直令:另一模型执行,原会话验收。
> 本文件**不入库**(spec/plan 本地惯例),执行完成后由 CEO 决定去留。
> 执行前先完整读完本文件;所有 file:line 均已在起草时核实过,但以现场代码为准。

---

## 0. 背景:已钉死的事实(不要重查,直接建立在这上面)

产出端自 2026-08-18 03:21 起 100% 产出 `unchain.context/context_composition_v1`(全库扫描 36/36,分水岭精确)。剩余问题**不是断流**,是归因不完整:

- 最新真实样本:`manifest_items 62 / matched_items 36`,`wire_surfaces 2 / matched_surfaces 1`,quality 恒 `partial`,`residual_tokens` 恒 `null`,categories 只有 instructions + conversation。
- 根因已定位到代码级(unchain repo,dev 分支,以下 file:line 基于 2026-08-21 HEAD `8b49d0a`):
  - `src/unchain/context/composition.py:484` `build_internal_context_composition(state, assembly, *, tool_schema_count=0, response_schema_surface=None)`——`tool_schema_count` 只**声明**(计入 `known_uninstrumented_items` ~:547、`surfaces.add("tool_schema")` :558),**从不生成 surface="tool_schema" 的 contribution 条目**。"known uninstrumented" 这个命名就是刻意留下的缺口自白。
  - `src/unchain/providers/model_turn_runtime.py:279-282` 调用点:`tool_schema_count=len(resolved_toolkit.tools)`。
  - `composition.py:611` `_surface_present`:`tool_schema` ⇔ `route_request.get("tools")` 非空;`:630` `_derive_context_composition_extension`:`matched` = 有 contribution 且 surface 在 wire 上出现;`:688` `coverage_complete` 要求 `matched_items == manifest_items` **且** `matched_surfaces == wire_surfaces`;`:743-753` coverage 不完整 → `quality="partial"` → 不计算 residual。
  - 所以链条是:**tools 被声明进 manifest 但没有任何 tool_schema contribution 可匹配 → coverage 永远 partial → residual 永远 null → UI 的 "Unattributed" 行和 reconciled 徽标永远锁死**。
  - `composition.py:400` `_measured_message_contributions` 只测 messages surface;`_classify_message` 返回 None 的消息(待查:tool-role 消息)按 `len(messages) - attributed_messages` 也计入 known_uninstrumented。
  - `composition.py:841` 广域 `except Exception: return sanitized_receipt`(availability-only,有注释,**无日志**)。
- **消费端已就绪,不要动 PuPu 的 schema**:`PuPu/src/SERVICEs/context_composition_v1.js` 持有同一份 9 类 taxonomy(`tool_definitions` 在 :24,subtypes `provider_schema/prompt_guidance/dynamic_tool`),校验是 CLOSED(`exact()` 精确键集、subtype 数量受 taxonomy 上限约束、`attributed_tokens` 必须精确等于类别 token 总和,违反直接 throw)。`tool_definitions`+`tool_activity` 已映射到面板 "Tools" 组(:98)。
- 运行环境:sidecar 经 `PuPu/unchain_runtime/server/unchain_adapter.py::_ensure_unchain_on_path()` 直接 import sibling checkout `/Users/red/Desktop/GITRepo/unchain/src`(非 wheel)。**`.py` 改动必须重启 sidecar 才生效**(重启 Electron app 即可;报告里必须注明重启动作,这是仓库铁律)。

---

## P1 · tool_schema 测量(核心交付,解锁 reconciled + Unattributed)

**目标**:tool 定义从"声明未测量"变为"测量并可匹配",使带 toolkit 的正常调用 `coverage.status="complete"`、`quality="reconciled_estimate"`、`residual_tokens` 为非负整数。

**实现要点**:

1. 在 `model_turn_runtime.py` 调用点附近(此处同时拿得到 `resolved_toolkit.tools` 和送 wire 的 tools payload),对**实际上 wire 的 tools 形状**逐条测量 canonical JSON 字节(复用 `composition.py` 的 `_canonical_bytes` 同款语义——messages 的测量注释明说"the same shape that goes on the wire",tools 必须同标准;不要测内部 schema 形状)。
2. 生成 contribution 条目:`{category: "tool_definitions", subtype: "provider_schema", surface: "tool_schema", utf8_bytes: <合计>, source_count: <工具数>}`(同 identity 合并,与 `_measured_message_contributions` 的合并语义一致)。
3. 传递方式二选一,倾向前者:
   - a) 给 `build_internal_context_composition` 增加显式参数(如 `tool_schema_contributions`),测量值存在时**不再**把 `tool_schema_count` 计入 `known_uninstrumented_items`(防止 manifest_items 双算——这是本项最容易错的地方);
   - b) 走 `_SOURCE_STATE_KEY` 官方 hint 通道(`agent/modules/context_composition.py`)。
4. 多 route(primary + openai_previous_response_fallback)时 tools 对两条 route 的声明保持与现状一致的语义;`provider_state` retained 投影分支(`route_contributions` 里 `projected["surface"]="provider_state"`)不要破坏。
5. `response_schema_surface` 同构缺口:**仅当**实现与 tools 完全同形且顺手时一并做,否则留下明确 TODO 注释,不强求。

**负向路径(必须保留/新增测试)**:
- 无 toolkit 的调用:不声明 tool_schema surface,messages-only 也能 `coverage complete`;
- tools 已声明但 wire request 无 `tools` 键(异常路径):保持 partial,**不得**误报 complete;
- 测量值与 `len(resolved_toolkit.tools)` 不一致时的行为要显式定义(以实际测量为准,声明计数仅做交叉校验)。

## P2 · 类别覆盖(分级,P2a 必做,P2b 设计门槛后再做)

**P2a(必做)· 审计 + 消息分类器补洞**:
1. 先拿真实数据:对一个带 toolkit、有工具调用历史的真实请求,打印 route 内 `len(messages)` / attributed / skipped 的逐条分类结果(`_classify_message` 返回 None 的都是谁)。
2. 大概率 tool-role 消息(工具调用参数/结果)被 skip——把它们分类进 `tool_activity`(subtypes: `arguments`/`results`/`errors_observations`),让它们成为 measured messages contribution(surface 仍是 messages,因为它们确实在 messages 里)。
3. 审计结论写进交付报告:9 大类中哪些在当前 runtime **确实有源**、哪些暂时无源(无源的不发明工作)。

**P2b(设计门槛,默认不做)· 注入源 hints(memory/skills/task_state 等)**:
- 风险:注入内容**已经**躺在 messages 里被 `_measured_message_contributions` 测过一遍;再发 hint 就是双算,`attributed > provider_input` 会把 quality 打成 `estimated`(`composition.py:752`)。
- 只有先书面回答"双算不变量如何保证"(hint 只覆盖不在 messages 里的内容,或分类器对 hinted 范围让位)并配证明测试,才允许动手;本轮做不到就明确写 `NOT_DONE + 原因`,不算失败。

## P3 · 诊断日志(小,但备注点名要兑现)

1. `composition.py:841` 广域 except:记一条 content-free 日志(异常类型+message,logger 建议 `unchain.context.composition`),保持 availability-only 语义(照常返回 sanitized_receipt)。
2. `model_turn_runtime.py` manifest 构建处若有同类静默降级(执行时现场确认),同样补一条。
3. capability 判定处若仍存在"缺依赖"与"真不可用"同值不可分的情况,让日志可区分。
4. 约束:**日志绝不携带内容文本**(content-free 是该模块宪法);正常路径零日志,只在异常/降级时发;sidecar stdout 会被 PuPu 日志捕获,格式前缀参考现有 `[unchain]` 行。

---

## 边界契约(cross-boundary-contract-gate,轻量声明)

- **BC-001**:producer=unchain `composition.py`,consumer=PuPu `context_composition_v1.js`,传输=provider_call receipt extension(经 SSE/持久化)。admission=**CLOSED**(消费端 `exact()` 键集校验 + taxonomy 白名单 + `attributed_tokens ≡ Σcategories.tokens` 硬等式)。本计划**只在既有 CLOSED schema 内新增已在两侧白名单中的类别**,不改 schema、不改 PuPu 校验。负向已由消费端现有 throw 行为覆盖。
- **SEQ 适用单元格**(验收按此打勾):① 第一条正常消息 ② 同 chat 第二条消息 ③ sidecar 冷重启后新消息 ④ 无 toolkit 会话(负向)。retry/resume 与 graph/subagent 路径本轮 `NOT_RUN`(随 0.1.10 发布门再补,不阻断本计划验收)。

## 验收标准(AC,验收方将逐条实测;执行报告需附自证)

- **AC-1** unchain 全量 pytest 绿;新增测试有 red-before-green 记录(至少:tool 测量数学、无 toolkit 负向、declared-but-absent 负向)。
- **AC-2** sidecar 重启后,在带 toolkit 的会话发 2 条消息(SEQ ①②):两条新 provider_call 的 extension 均含 `tool_definitions` 类别、`coverage.status=="complete"`、`quality=="reconciled_estimate"`、`residual_tokens` 为 int ≥ 0。
- **AC-3** 硬等式:`Σ categories[].tokens == attributed_tokens`,且 reconciled 时 `attributed + residual == usage.input.total_tokens`。
- **AC-4** 无 toolkit 会话(SEQ ④):quality 同样到 `reconciled_estimate`,无 tool_definitions 类别。
- **AC-5** UI 真机:popover 出现 Tools 组与 "Unattributed" 行,质量行显示 reconciled/complete(验收方用 test-api `/v1/debug/eval` + screenshot 验)。
- **AC-6** P3:测试中注入构造失败 → 恰好一条日志;正常路径零新增日志。
- **AC-7** PuPu 全量 jest 绿(消费端零改动预期,跑套确认无涟漪)。
- **AC-8** P2a 审计数字随报告交付(total/attributed/skipped 及 skip 名单),tool-role 消息进入 `tool_activity`,并有 `attributed <= provider_input` 不变量测试。
- P2b 若做:附双算不变量的书面论证 + 证明测试;若不做:报告写明 `NOT_DONE + 原因`。

## 执行约束(仓库规矩,违者验收直接打回)

1. unchain 主树当前有**他人 dirty 文件**(P-0007 相关):禁 `git add -A`、禁 stash、只碰自己名单内文件;改动**留工作树不 commit**(主树铁律,commit 归 project owner)。PuPu 侧预期零代码改动。
2. `.py` 改动后**必须重启 sidecar** 并在报告注明;真机探针发消息用 `openai:gpt-4.1`(别用本地 ollama),探针会话用完即删。
3. 测试命令:unchain 用其自带 pytest;PuPu 用 `CI=true npx react-scripts test --watchAll=false`(禁裸 `npx jest`)。
4. 全库证据扫描配方(验收方也会用):copy `~/Library/Application Support/PuPu/chats.db{,-wal}` 到临时目录,messages.payload JSON 递归找 `provider_calls[].extensions`。
5. test-api:端口在 `~/Library/Application Support/PuPu/test-api-port`,`POST /v1/debug/eval {code}` 在渲染进程执行,`GET /v1/debug/screenshot` 截图。
