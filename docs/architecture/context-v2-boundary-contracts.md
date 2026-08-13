# Context V2 Boundary Contracts

> 状态：当前生产契约与发布证据索引  
> 生效日期：2026-08-12  
> 适用仓库：PuPu + `https://github.com/haoxiang-xu/unchain.git`  
> 治理规则：[`cross-boundary-contract-gate`](../../.claude/rules/cross-boundary-contract-gate.md)

本文不是另一份实现 schema。字段级真相仍在类型、validator 和测试中；本文固定 **谁生产、谁消费、在哪里投影、哪些序列必须被证明**。`CTX-B* / CTX-S*` 是项目 profile key。Quorum proposal 引用本 profile 时，必须在该案 `proposal.md` 内实例化为 case-local `BC-### / SEQ-###` 并映射到 `AC-###`。

## 一、不可混用的四种表示

| 表示 | 所有者 | 允许内容 | 禁止直接进入 |
|---|---|---|---|
| PuPu chat/storage message | PuPu renderer | UI 文本、附件 metadata、trace/meta | provider wire |
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

### CTX-B06 · PuPu deployment → locked Unchain revision

- **Producer**：PuPu `unchain_runtime/unchain-core.lock.json` 与 release candidate identity。
- **Consumer**：CI checkout、packaged admission 与 release certification。
- **Policy**：`CLOSED` exact revision。
- **义务**：所有 blocking contract tests 使用 lock revision；sibling Unchain 只作显式 dev compatibility 证据，不得替代 locked-pair 证据。revision mismatch 必须 fail closed。
- **证据锚点**：lock 文件、release QA resolver、CI checkout log 与候选指纹。

## 三、State-sequence profile

| Profile | 必须观察的顺序 | 关键不变量 | 主要证据 |
|---|---|---|---|
| `CTX-S01` repeated chat | first user turn → terminal → second user turn → terminal | 第二次编译只使用 canonical history；无内部字段泄入 wire；attempt identity 不串线 | cold composition matrix + strict provider fake |
| `CTX-S02` sequential approval | tool call A → approve A → tool call B → approve B → terminal | B 获得新 interaction ID；A 已 application；B 不继承 A receipt；工具 exactly once | provider-turn approval resume + tool authority tests |
| `CTX-S03` cold resume | pending approval → persist → 新 runtime/sidecar → resume → terminal | request/receipt 来自 durable authority；provider/model/schema/attempt 保持绑定 | cold approval resume tests |
| `CTX-S04` terminal identity | root/graph final → terminal over iteration(s) | plain root iteration 合法；graph scope 不得与 root 规则混用；错配拒绝 | journal projection + cold matrix |
| `CTX-S05` provider media | durable image/PDF → projection → provider request → replay/next turn | wire 无 `attachments`；replay 使用实际 projected wire；不支持组合本地拒绝 | model projection + provider contract tests |
| `CTX-S06` deployed pair | freeze PuPu SHA + lock SHA → blocking tests → packaged admission | 证据与候选完全同一 revision pair；dirty/不同 pair 不合并 | release certification artifact |

所有改动至少评估 repeat、retry、resume、restart、reset 和 rollback。只有结构上不可达的单元格可在 PS 记 `NOT_APPLICABLE + reason`；适用但没有执行的 AC 就是 `NOT_RUN`。

## 四、当前 P0 判定

- 2026-08-12 的 PuPu `4a050d75` 与 Unchain `d0572979` 已落地 CTX-B01 至 CTX-B05 的代码与聚焦测试。
- CTX-B06 的唯一发布真相始终是当前 lock 和 release evidence；commit 文本中的 SHA 只是历史锚点，不能替代候选冻结。
- active rollout 前，CTX-S01 至 CTX-S06 中全部适用单元格必须在同一冻结候选上 `PASS`。`NOT_RUN/PENDING` 只能维持 shadow/off 并给出 `INCOMPLETE`；已运行失败是 `NO-GO`。

## 五、维护规则

1. 变更任何 boundary 时，同时更新对应 validator、正负测试和本页 evidence anchor。
2. 不在本页复制 provider 的完整字段表；字段表只在代码 validator 中维护。
3. 新 representation 必须增加一行和一个 projection boundary，不得把它塞进现有 generic dict 后宣称兼容。
4. 项目记忆只链接本页与事故复盘；不要在多个 agent memory 复制契约正文。
