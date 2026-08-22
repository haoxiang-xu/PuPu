# Context V2 Boundary Contracts

> 状态：当前生产契约与发布证据索引  
> 生效日期：2026-08-12  
> 适用仓库：PuPu + `https://github.com/haoxiang-xu/unchain.git`  
> 治理规则：[`cross-boundary-contract-gate`](../../.claude/rules/cross-boundary-contract-gate.md)

本文不是另一份实现 schema。字段级真相仍在类型、validator 和测试中；本文固定 **谁生产、谁消费、在哪里投影、哪些序列必须被证明**。`CTX-B* / CTX-S*` 是项目 profile key。Release issue 或普通实施 Plan 引用本 profile 时，直接实例化为任务内的 `BC-### / SEQ-###` 并映射到 `AC-###`；这些只是工程追踪标识，不触发 owner、case 或庭审流程。

## 一、不可混用的五种表示

| 表示 | 所有者 | 允许内容 | 禁止直接进入 |
|---|---|---|---|
| PuPu chat/storage message | PuPu renderer | UI 文本、附件 metadata、trace/meta | provider wire |
| PuPu bound host event | PuPu sidecar | `presentation/semantic` lane、exact execution/attempt/interaction authority 与对应事件 | 未绑定的 durable sink 或跨 attempt UI queue |
| canonical journal message | Unchain Context V2 | durable semantic content、来源与 `HostResolvedAttachment` provenance | provider SDK |
| canonical model message | Unchain `ModelContextProjection` | provider-neutral text/image/PDF blocks | 持久层反写 |
| exact provider message | provider adapter/wire preparer | 对应 provider 的封闭字段与原生 content blocks | journal/domain object |

普通 `dict` 或 `Mapping` 只是一种容器，不代表上述四者可互换。每次跨行都必须经过显式 projection 和独立 validator。

## 二、Boundary profile

### CTX-B01 · PuPu input → canonical journal

- **Producer**：PuPu renderer/sidecar attachment bootstrap 与当前 user input。
- **Consumer**：Unchain journal/context repository。
- **Policy**：`VERSIONED`；chat message 与 `HostResolvedAttachment` 分别遵守各自 schema。
- **义务**：附件 bytes/descriptor 先进入 execution-bound artifact；journal 保存可核验引用、长度与 digest，不保存 provider-native message。
- **失败语义**：缺 scope、digest、长度、descriptor canonicality 或 media/type 一致性时 fail closed。
- **证据锚点**：`unchain_runtime/server/tests/test_memory_v2_unchain_attachment_projection.py`、Unchain `tests/context_v2/test_model_context_projection.py`。

### CTX-B02 · canonical journal → canonical model context

- **Producer**：Context Compiler 输出的 journal-derived messages。
- **Consumer**：`ModelContextProjection`。
- **Policy**：`CLOSED` at projection input；internal compiler metadata 与 provenance-only handoff envelope 不得进入 model message。
- **义务**：绑定同一 `ArtifactService`；读取时复核 execution scope、byte length、SHA-256 和总预算；附件只投影成 provider-neutral text/image/PDF blocks。
- **稳定错误**：`context_v2_model_projection_invalid`，boundary=`model_context_projection`，reason 只能来自实现中的闭集。
- **证据锚点**：Unchain `tests/context_v2/test_model_context_projection.py`、`tests/context_v2/test_context_p0_cold_composition_matrix.py`。

### CTX-B03 · canonical model context → provider wire

- **Producer**：Context projection / prepared provider turn。
- **Consumer**：OpenAI Responses、Anthropic/Hyperspace Messages、Ollama Chat adapters。
- **Policy**：`CLOSED`；最终 message 和 content block 必须精确允许字段。
- **义务**：OpenAI 生成 `input_text/input_image/input_file`；Anthropic/Hyperspace 生成 native text/image/document；Ollama 只接受可表达的 base64 image。顶层 `attachments` 在所有 provider wire 中均非法。
- **未知字段**：本地抛 `provider_message_schema_invalid`，不得依赖远端 400 才发现。
- **证据锚点**：Unchain `tests/test_provider_message_contract.py`；PuPu `scripts/test-api/fake_openai_responses_server.test.mjs`。

### CTX-B04 · durable interaction journal → fresh/resume approval

- **Producer**：Durable Interaction Runtime 与 persisted request/receipt/application journal。
- **Consumer**：Context Runtime tool approval authority。
- **Policy**：`VERSIONED`；request/response 必须成对出现并绑定 interaction ID、request digest、attempt/run、provider/model 和工具 schema。
- **义务**：显式存在 request+response 表示 resume；二者都不存在表示 fresh interaction；只存在一边必须 fail closed。fresh interaction 不得复用前一个已应用 receipt。
- **证据锚点**：Unchain `tests/context_v2/test_context_runtime_tool_approval_authority.py`、`tests/context_v2/test_context_provider_turn_approval_resume.py`。

### CTX-B05 · journal final/terminal identity

- **Producer**：kernel/graph runtime emitted final and terminal semantic events。
- **Consumer**：canonical journal message projector。
- **Policy**：`CLOSED` identity tuple。
- **义务**：plain root 允许 iteration-only identity；graph identity 使用 node + step + iteration；final 与 terminal 必须在适用轴上完全匹配。缺失/错型/错配均以 `context_v2_journal_message_projection_invalid` fail closed。
- **证据锚点**：Unchain `tests/context_v2/test_journal_message_projection.py`、`tests/context_v2/test_context_p0_cold_composition_matrix.py`。

### CTX-B06 · Loaded Unchain protocol → immutable tested/shipped artifact

- **Producer**：实际 import 的 Unchain code-backed runtime protocol manifest，以及 release pipeline 单次构建的 immutable wheel。
- **Consumer**：PuPu sidecar/Electron runtime admission、blocking contract matrix、packaged smoke 与 release certification。
- **Policy**：runtime compatibility 使用 `VERSIONED` closed manifest；release continuity 使用 `CLOSED` artifact identity。
- **义务**：sidecar与Electron独立校验 manifest closed shape、digest、major/minimum minor与required feature；contract tests、各平台package与report必须消费同一个 wheel bytes SHA-256和同一个manifest digest。Git revision、source path与checkout cleanliness只作telemetry/provenance，不得成为compatibility allowlist或第二套runtime authority。不兼容必须在Context/RunBundle/provider side effect前fail closed。
- **证据锚点**：Unchain `tests/test_runtime_protocol_manifest.py`；PuPu sidecar/Electron protocol admission tests；release artifact continuity、package smoke 与report matrices。

### CTX-B07 · PuPu synthesized host event → presentation 或 canonical journal

- **Producer**：PuPu 的 Ask User、tool approval、max-budget callback 与 fallback-final/resolution writer。
- **Consumer**：PuPu SSE presentation queue 或 active Unchain Context Runtime durable sink。
- **Policy**：`CLOSED` typed envelope；lane 仅 `presentation/semantic`，authority 精确绑定 execution、current attempt、interaction、source attempt、origin 与 interaction kind。
- **义务**：presentation 事件只 enqueue，绝不写 journal；semantic 事件必须先在 exact attempt 持久化成功再 enqueue。Ask User/tool approval/max-budget 的 subtype、confirmation/call identity 必须与 origin 一致；`interaction_resolved` 必须带 exact interaction、kind、outcome、receipt、event 与 source refs。runtime-origin event 禁止再次进入 semantic host lane。
- **未知字段/错 identity**：在 `PupuUnchainHostEventBoundary` fail closed；不得从 ambient latest attempt、workflow root 或 UI payload猜测 owner。
- **失败语义**：persist 失败不展示成功；enqueue 失败保留 durable semantic 供重投；重复 semantic delivery journal exactly-once。active cold resume 的 resolution 只由 typed Context input ingress 写入，host 不做 pre-bootstrap duplicate。
- **证据锚点**：`unchain_runtime/server/tests/test_memory_v2_unchain_active_host_event_boundary.py`，以及 active root/graph/resume adapter suites。

### CTX-B08 · legacy interaction resolution → canonical repair winner

- **Producer**：历史 PuPu generic semantic lane 写下的 descriptor-incomplete `interaction_resolved`，以及随后由 official `ContextInputIngress.persist(HostResolvedInteractionInput)` 写下的 descriptor-bound `interaction.resolved`。
- **Consumer**：Unchain `ContextCompiler`、graph checkpoint recovery 与 SQLite generation rebase。
- **Policy**：`CLOSED` exact compatibility pair；这不是放宽 interaction descriptor validator。
- **义务**：只有同一 execution、generation、attempt、interaction 的两个事件可形成 repair pair；legacy underscore 必须更早且 descriptor-incomplete，canonical dotted 必须唯一、更晚、descriptor-complete，并且 `content_ref` 必须出现在该 canonical event 自己的 authorized `resource_refs` 中。compiler 与 rebase 忽略被修复的 legacy event；graph recovery 在没有既存 legacy resume admission 时采用 canonical cursor，已有 admission 则保持原 cursor 幂等。
- **拒绝语义**：0 个或多个 canonical candidate、reverse order、cross-scope、cross-interaction、foreign resource ref、partial/conflicting descriptor、complete legacy 或多个 pair 均维持原 fail-closed 错误；不得 raw 改写历史 journal。
- **兼容准入**：运行时必须声明 interaction-resolution compatibility feature；Git revision 只作诊断 telemetry，不得作为 allowlist。feature manifest 迁移及 exact deployed-pair 证据完成前，active rollout 判定为 `INCOMPLETE`。
- **证据锚点**：Unchain `tests/context_v2/test_interaction_resolution_compat.py`、compiler/graph/rebase exact-pair tests，以及 PuPu `test_cold_cancel_supersedes_historical_malformed_generic_resolution` 与 fresh-preflight poison regression。

## 三、State-sequence profile

| Profile | 必须观察的顺序 | 关键不变量 | 主要证据 |
|---|---|---|---|
| `CTX-S01` repeated chat | first user turn → terminal → second user turn → terminal | 第二次编译只使用 canonical history；无内部字段泄入 wire；attempt identity 不串线 | cold composition matrix + strict provider fake |
| `CTX-S02` sequential approval | tool call A → approve A → tool call B → approve B → terminal | B 获得新 interaction ID；A 已 application；B 不继承 A receipt；工具 exactly once | provider-turn approval resume + tool authority tests |
| `CTX-S03` cold resume | pending approval → persist → 新 runtime/sidecar → resume → terminal | request/receipt 来自 durable authority；provider/model/schema/attempt 保持绑定 | cold approval resume tests |
| `CTX-S04` terminal identity | root/graph final → terminal over iteration(s) | plain root iteration 合法；graph scope 不得与 root 规则混用；错配拒绝 | journal projection + cold matrix |
| `CTX-S05` provider media | durable image/PDF → projection → provider request → replay/next turn | wire 无 `attachments`；replay 使用实际 projected wire；不支持组合本地拒绝 | model projection + provider contract tests |
| `CTX-S06` runtime/artifact continuity | import actual runtime → validate protocol manifest → build wheel once → blocking tests → all platform packages/smoke → final report | compatibility只由manifest决定；所有release consumer核对同一wheel SHA-256与manifest digest；revision/source/dirty只作provenance；不得重建后冒充同一artifact | runtime protocol tests + artifact continuity/package smoke/report evidence |
| `CTX-S07` active host interaction | canonical request → presentation-only card → durable receipt → one semantic resolution → UI projection | root/graph-step/resume 使用 current attempt；presentation 0 journal writes；runtime echo 与 host resolution二选一；submitted human input显示 Selected而非 Denied | active host-event boundary + full chat tests |
| `CTX-S08` historical poison repair | legacy malformed resolution → persisted receipt/cancel application → official canonical resolution → compile/graph recovery/rebase → fresh message | 不改历史 raw event；唯一 later canonical winner；answer进入 transcript；旧 ask closed；0 auto-resume/duplicate provider send；retry/restart exactly once | interaction-resolution compatibility + cold/fresh poison matrices |

所有改动至少评估 repeat、retry、resume、restart、reset 和 rollback。只有结构上不可达的单元格可在 PS 记 `NOT_APPLICABLE + reason`；适用但没有执行的 AC 就是 `NOT_RUN`。

## 四、当前 P0 判定

- 2026-08-12 的 PuPu `4a050d75` 与 Unchain `d0572979` 已落地 CTX-B01 至 CTX-B05 的代码与聚焦测试。
- CTX-B06 的runtime兼容真相只来自实际import code导出的strict protocol manifest；release连续性只来自同一immutable wheel的SHA-256、manifest digest与完整消费证据。Git revision/source/dirty只作诊断或构建provenance。
- active rollout 前，CTX-S01 至 CTX-S08 中全部适用单元格必须在同一冻结artifact上 `PASS`。`NOT_RUN/PENDING` 只能维持 shadow/off并给出 `INCOMPLETE`；已运行失败是 `NO-GO`。`context_memory.interaction_resolution_compat`与`durable_interaction.expected_interaction_id_cas`均为required runtime feature；缺失时必须拒绝，不得以SHA、checkout状态或任何lock替代该门禁。
- 统一 Tool Output projection 的新边界尚在 Stage0 前置阶段，文档见 [`memory-tool-output-module-stage0.md`](memory-tool-output-module-stage0.md)；未补齐 BC/SEQ/AC 映射前不进入 P0 判定。

## 五、维护规则

1. 变更任何 boundary 时，同时更新对应 validator、正负测试和本页 evidence anchor。
2. 不在本页复制 provider 的完整字段表；字段表只在代码 validator 中维护。
3. 新 representation 必须增加一行和一个 projection boundary，不得把它塞进现有 generic dict 后宣称兼容。
4. 项目记忆只链接本页与事故复盘；不要在多个 agent memory 复制契约正文。
