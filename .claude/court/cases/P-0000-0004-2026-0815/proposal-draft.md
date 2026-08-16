---
case_id: P-0000-0004-2026-0815
boundary_revision_set: sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f+sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40
updated_at: 2026-08-15T15:10:30-07:00
status: INTAKE_DRAFT_NOT_A_PS
---

# Context Composition V1 intake draft

> 本文件保存 Chief/Speaker 输入，供真实 lead 与 handoff owners 集成。它不是 canonical `proposal.md`、不是 owner stance，也不授权 production。

## P-0000-0004-2026-0815
- **拟议主 owner**: code-owner-unchain
- **目标结果**: 对每次真实 provider send 建立 content-free context contribution manifest，经 physical delivery plan 与 ProviderCallReceipt 原子绑定，再由 RunBundle、PuPu durable projection 与 Cursor-like UI 呈现。
- **non_goals**: 不建立第二 token ledger；不持久化 raw content、secret、hidden reasoning、provider request、artifact bytes 或普通跨用户 content hash；不把 Context Control、cache、MCP、provider-retained、retry/fallback 作为 category；不以 Git SHA/dirty/path 准入 runtime；不把 remote continuation 的未知内容伪装为已观测。
- **实施范围**: Unchain contribution tagging/context build/provider send/receipt/RunBundle/runtime manifest；PuPu sidecar strict projection/SSE；chat runtime event admission/selectors；Electron keyed store/IPC；chat-bubble Context Usage modal。
- **owner slots**:
  - SLOT-001 | code-owner-unchain | contribution manifest、physical delivery plan、receipt reconciliation、RunBundle、runtime manifest producer | PENDING_LEAD_INTEGRATION
  - SLOT-002 | code-owner-runtime | sidecar request/projection/SSE、runtime feature admission、rollout matrix | PENDING_HANDOFF
  - SLOT-003 | code-owner-chat-core | runtime event admission、model-call/run/tree selector inputs、modal mount | PENDING_HANDOFF
  - SLOT-004 | code-owner-electron | durable keyed storage、IPC/bridge、restart/replay | PENDING_HANDOFF
  - SLOT-005 | code-owner-shared-arteries | canonical selector/group mapping与shared event/storage facade | PENDING_HANDOFF
  - SLOT-006 | code-owner-chat-bubble | Context Usage modal presentation与交互 | PENDING_HANDOFF
- **关键约束**: Backend taxonomy 固定 10 类；UI 固定映射 8 组；Model Call 绑定 exact provider_call_id；Run/Run Tree 只取 all_call_ids 集合并集；provider total / composition / coverage 三元质量必须显式；remote unknown 进入 residual/partial；zero category 隐藏；unknown 灰色斜纹。
- **可逆性**: 新 runtime features 默认关闭；receipt/RunBundle extensions additive 且 namespaced；UI selector 遇缺 feature/old bundle 不显示 composition，不改变旧 usage；active rollout 前可整体撤回。
- **回滚/补救方式**: 关闭 feature projection/UI，保留已有 ProviderCallReceipt/RunBundle 事实；不得删除或重算历史 receipt，不恢复 SHA admission，不用 legacy aggregate 补写伪 composition。
- **验收标准**:
  - AC-001 | Backend 只接受 10 类 `instruction, skill, tool_definition, conversation, tool_activity, memory, task_state, file_media, agent_coordination, output_contract`；UI 只映射为 Instructions、Skills、Tools、Conversation、Memory & Task State、Files & Media、Agent Coordination、Output Contract 八组；无 Other，zero category 默认隐藏。
  - AC-002 | 每个 contribution 只有 run/call-scoped opaque identity、category、stage/dimensions与有界 counts；receipt/RunBundle/SSE/SQLite/UI 不含 raw content、secret、reasoning、provider request、tool/artifact bytes、普通跨用户 stable hash；禁止字段与超限数组在最终 consumer fail closed。
  - AC-003 | 每个真实 provider network send 有唯一 provider_call_id，exact physical delivery plan 与同一 immutable ProviderCallReceipt 原子绑定；未发送的 pre-build guess、reattach 和 duplicate callback 不产生新 send/receipt。
  - AC-004 | provider 报告的 input total 是 provider-total 权威；composition 以 known category estimates 对账，residual=`max(provider_total-known,0)`，coverage 只在分母可知时给出；provider total 不可用时为 null/unavailable，不伪装 0 或精确百分比；known 超过 total 必须 conflict/fail closed。
  - AC-005 | Context Control、cache、MCP、provider-retained、compaction、summary、truncation、dedupe 只记录为正交 dimension/transformation；同一 contribution 不因维度重复计入 category，summarized conversation 仍归 conversation。
  - AC-006 | retry/fallback 的每次 physical send 各有 call_id/receipt；live reattach 无新 send；uncertain result、remote continuation 与 provider-retained invisible context 显式 partial/residual；冷 replay 不重复计量或生成第二 receipt。
  - AC-007 | Model Call 精确选择一个 provider_call_id；Run 与 Run Tree 只对各自 all_call_ids 集合并集聚合；父/子 total 永不相加，serial/parallel subagent、graph、auxiliary purpose 不 double-count；Run/Tree 不显示伪造 shared context-window 百分比。
  - AC-008 | contribution manifest、receipt extension、RunBundle ref、SSE、IPC/SQLite projection 均为 closed/versioned bounded schema；unknown core key、错型/负数/unsafe integer、重复 category/call_id、same revision different digest、stale revision 在对应最终 consumer fail closed。
  - AC-009 | 实际 import 的 Unchain runtime manifest 必须同时宣告 `context_memory.context_contribution_manifest_v1` 与 `run_bundle.context_composition_ref_v1`；缺 feature 在 side effect 前 fail closed；Git SHA/dirty/source path/artifact digest 只作 telemetry，测试与打包复用同一 immutable wheel。
  - AC-010 | Modal 提供 Model Call / Run / Run Tree scope、稳定顺序/颜色与 8 组明细；Model Call 仅在 denominator 可知时显示约数/百分比；estimated、reconciled、partial、residual/unknown 视觉可区分；灰色斜纹 unknown，dark/light/keyboard/screen-reader 可用。
  - AC-011 | RunBundle composition 与 call refs 在 Electron 单事务 keyed UPSERT；duplicate/reconnect/restart/replay 幂等，same revision conflict/stale/半事务拒绝；reload 后 selector 结果一致，clear/reset 不误删其他 run/legacy evidence。
  - AC-012 | OpenAI、Anthropic、Hyperspace、Ollama 与 root/graph/recipe-ref/serial+parallel subagent/auxiliary call 使用真实 producer→strict consumer；覆盖 first/repeat/retry/fallback/reattach/compaction/remote continuation/reconnect/restart/replay/rollback；最终 PuPu candidate 与一次构建全程复用的 Unchain wheel 跑完整矩阵，mock-only/0 test/NOT_RUN/PENDING 不可 active rollout。
- **boundary obligations**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | PuPu call inputs 到 Unchain contribution seed
- **producer**: PuPu sidecar 对当前 model call 可见的 instructions/skills/tools/conversation/memory/task/files/agent/output source hints
- **producer owner**: code-owner-runtime
- **consumer**: Unchain context assembly contribution manifest builder
- **consumer owner**: code-owner-unchain
- **canonical representation**: `unchain.context_composition.producer.v1` 的 content-free bounded contribution seed；10类枚举与正交 dimensions
- **consumer projection**: 只接受 call-scoped opaque identity、category、source stage、transformation/cache/retention/purpose/relation/quality/privacy dimensions 与有界 byte/token estimates
- **admission policy**: VERSIONED
- **admission details**: core exact-key closed；category 仅 10 个；MCP/Context Control/cache/retry 不得占用 category；不接收 raw content/hash
- **unknown input behavior**: stable context_contribution_manifest_invalid；不进入 provider build
- **failure semantics**: fail closed 且 0 provider send；不降级为 Other 或静默丢失后声称 complete
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；这对 digest 只绑定 court contract artifacts，runtime admission 仅看 imported manifest
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-001, AC-002, AC-005
- **negative acceptance**: AC-002, AC-008

### BC-002 | Contribution manifest 到 provider physical delivery plan
- **producer**: Unchain context compiler 的 normalized contribution manifest 与 provider-specific context build
- **producer owner**: code-owner-unchain
- **consumer**: Unchain 最终 provider request/send boundary
- **consumer owner**: code-owner-unchain
- **canonical representation**: provider_call_id 绑定的 sorted delivered contribution summaries、transformation dimensions与known estimates；content-free
- **consumer projection**: 只记录真正进入 physical wire 的贡献；被truncate/dedupe/drop项只作未交付dimension，不计 delivered total
- **admission policy**: VERSIONED
- **admission details**: delivery state exact；同 contribution/category 单次计量；provider adapter 附加隐藏上下文只能进入 unknown/residual
- **unknown input behavior**: stable context_delivery_plan_invalid；不发送 provider request
- **failure semantics**: physical plan 与 send 原子；任一失败 0 send/0 receipt
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；SHA 不参与 runtime compatibility
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-003, AC-005
- **negative acceptance**: AC-002, AC-008

### BC-003 | Provider physical send/usage 到 immutable receipt extension
- **producer**: exact provider request send outcome 与 OpenAI/Anthropic/Hyperspace/Ollama final usage
- **producer owner**: code-owner-unchain
- **consumer**: atomic ProviderCallReceipt ledger
- **consumer owner**: code-owner-unchain
- **canonical representation**: ProviderCallReceipt namespaced bounded extension，含10类counts、known total、provider total/null、residual、coverage/null、quality与dimension summary
- **consumer projection**: 每个 physical send 一个 provider_call_id；provider total 权威，category 本地 estimate 不冒充 provider exact
- **admission policy**: VERSIONED
- **admission details**: retry/fallback 每个 send 独立；reattach无send无receipt；same call immutable；bounded ten-category vector
- **unknown input behavior**: stable provider_call_context_composition_invalid；保留基础 receipt 并把 composition 标为 unavailable，不写第二账本
- **failure semantics**: usage/composition 不确定显式 partial/null；不得猜0、回填其他 call 或 double-count
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；candidate/wheel digest另作验收证据
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-003, AC-004, AC-006
- **negative acceptance**: AC-002, AC-008

### BC-004 | ProviderCallReceipt集合 到 RunBundle composition ref
- **producer**: immutable ProviderCallReceipts 与 ExecutionIdentity/topology/all_call_ids
- **producer owner**: code-owner-unchain
- **consumer**: deterministic RunBundle reducer/materializer
- **consumer owner**: code-owner-unchain
- **canonical representation**: `run_bundle.context_composition_ref.v1`，仅引用 provider_call_ids/receipt extensions 并给出集合并集派生 summary
- **consumer projection**: Model Call=exact call；Run/Tree=all_call_ids union；父/子 total 不相加
- **admission policy**: VERSIONED
- **admission details**: call_id唯一、revision单调、same revision digest唯一；summary完全可由 receipt set重建，不是第二 ledger
- **unknown input behavior**: stable run_bundle_context_composition_invalid；bundle composition unavailable/partial
- **failure semantics**: 保留 atomic receipts；不产出猜测 summary，不影响基础 RunBundle finality
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；SHA telemetry only
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-004, AC-006, AC-007
- **negative acceptance**: AC-008

### BC-005 | Unchain RunBundle composition 到 PuPu sidecar projection
- **producer**: canonical RunBundle + referenced immutable provider-call composition
- **producer owner**: code-owner-unchain
- **consumer**: PuPu sidecar strict RunBundle/context composition adapter
- **consumer owner**: code-owner-runtime
- **canonical representation**: bounded closed `run_bundle.context_composition_ref.v1` safe projection
- **consumer projection**: 校验schema/identity/revision/call set/quality后，只投影UI所需content-free数据
- **admission policy**: VERSIONED
- **admission details**: unknown namespaced extension可忽略；unknown core、digest conflict、负数/unsafe integer拒绝；old bundle显式feature absent
- **unknown input behavior**: stable context_composition_projection_invalid；不发部分 composition
- **failure semantics**: 基础 run completion 可保留，但 UI composition unavailable；sticky enabled candidate不得伪降级complete
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；runtime feature而非SHA准入
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-004, AC-007, AC-008
- **negative acceptance**: AC-002, AC-008

### BC-006 | Sidecar SSE composition 到 renderer canonical admission
- **producer**: PuPu sidecar runtime_events_v4 completion/context composition frame
- **producer owner**: code-owner-runtime
- **consumer**: chat-core stream admission与canonical streaming_message_store
- **consumer owner**: code-owner-chat-core
- **canonical representation**: versioned bounded content-free context composition payload，绑定run_id/bundle_id/revision/all_call_ids
- **consumer projection**: runtime event先strict validate，再进入Model Call/Run/Tree selector输入
- **admission policy**: CLOSED
- **admission details**: exact core keys；unknown/duplicate/stale/conflict frame拒绝；reattach/duplicate done幂等
- **unknown input behavior**: stable renderer_context_composition_invalid；不污染message store
- **failure semantics**: 流保持可见但modal显示unavailable；不从legacy token total合成composition
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；deployed pair只作evidence
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-007, AC-010
- **negative acceptance**: AC-008, AC-011

### BC-007 | Renderer canonical projection 到 Electron durable store
- **producer**: chat-core validated context composition projection
- **producer owner**: code-owner-chat-core
- **consumer**: Electron keyed SQLite/IPC service
- **consumer owner**: code-owner-electron
- **canonical representation**: bundle_id + revision + digest + content-free calls/category/quality projection
- **consumer projection**: 单事务replace/upsert，preload bridge只暴露typed read/write/clear
- **admission policy**: CLOSED
- **admission details**: renderer不触碰ipcRenderer；channel constants/js+cjs twins同步；same revision same digest幂等、different digest conflict
- **unknown input behavior**: stable context_composition_store_invalid；事务回滚
- **failure semantics**: 无半状态；reload返回last good；clear/reset按scope不误删其他evidence
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；artifact digest telemetry only
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-010, AC-011
- **negative acceptance**: AC-008, AC-011

### BC-008 | Shared selector 到 Context Usage modal
- **producer**: shared-arteries canonical selector/group mapping与quality projection
- **producer owner**: code-owner-shared-arteries
- **consumer**: chat-bubble Context Usage modal
- **consumer owner**: code-owner-chat-bubble
- **canonical representation**: stable eight-group ordered presentation model，含scope/quality/provider total/known/residual/coverage与颜色token key
- **consumer projection**: zero隐藏；unknown residual灰色斜纹；Model Call百分比仅在denominator已知；Run/Tree无伪context-window百分比
- **admission policy**: CLOSED
- **admission details**: selector纯读、bubble不反向驱动stream；未知group/category拒绝；theme语义token而非裸hex
- **unknown input behavior**: modal unavailable/error state；不显示Other或错误精确度
- **failure semantics**: 关闭modal presentation不影响run；a11y标签仍说明estimated/partial
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；contract artifact pair非runtime allowlist
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-001, AC-010
- **negative acceptance**: AC-004, AC-010

### BC-009 | Imported runtime manifest 到 Context Composition readiness
- **producer**: actual imported Unchain module code-backed runtime protocol manifest
- **producer owner**: code-owner-unchain
- **consumer**: PuPu sidecar context composition feature admission/status
- **consumer owner**: code-owner-runtime
- **canonical representation**: strict runtime manifest features `context_memory.context_contribution_manifest_v1`与`run_bundle.context_composition_ref_v1`
- **consumer projection**: major/minor/feature subset/digest strict validation；Git revision/path/dirty/artifact digest仅telemetry
- **admission policy**: VERSIONED
- **admission details**: missing/malformed/unsupported feature在composition side effect前fail closed；higher compatible minor/extra optional feature允许
- **unknown input behavior**: stable context_composition_runtime_protocol_incompatible
- **failure semantics**: composition/UI feature unavailable；legacy chat仍可用；不得用SHA/dev bypass放行
- **identity/version binding**: producer sha256:8d47caf7150242e0d342a4edf1f5c4da0215f540778acd1a947525453be9666f + consumer sha256:c3ad12e0ca9af38f8891b12531b323d5194a653f028636d3ad0ee7d1e86c4f40；compatibility仅由manifest决定，pair用于contract evidence
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-009, AC-012
- **negative acceptance**: AC-008, AC-009

### SEQ-001 | Physical model call first/repeat lifecycle
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: provider_call_id + run_id + iteration + purpose + attempt
- **initial state**: context contributions已归类但没有physical send/receipt
- **ordered events**: assemble → normalize manifest → final provider delivery plan → physical send → final usage/null → atomic receipt → repeat next call
- **expected observations**: 每个send一个call_id/receipt；未发送不计；repeat拥有新call_id且旧receipt不可变
- **persistence boundary**: ProviderCallReceipt ledger + RunBundle materializer
- **boundary contracts**: BC-001, BC-002, BC-003, BC-004
- **positive acceptance**: AC-003, AC-004
- **negative acceptance**: AC-002, AC-008
- **first use**: REQUIRED | AC-003
- **repeat**: REQUIRED | AC-003, AC-007
- **retry**: REQUIRED | AC-006
- **resume**: REQUIRED | AC-006
- **restart**: REQUIRED | AC-011
- **reset**: NOT_APPLICABLE | immutable provider receipts不得reset；只允许按run清除PuPu projection
- **rollback**: REQUIRED | AC-012

### SEQ-002 | Retry/fallback/reattach/uncertain send
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: logical call intent + provider_call_id per physical send + recovery key
- **initial state**: logical call准备发送或已有uncertain send/receipt
- **ordered events**: send失败/uncertain → provider retry或fallback新send → live reattach/duplicate callback → cold recovery → bundle reprojection
- **expected observations**: 每次physical send独立receipt；reattach无新receipt；uncertain/remote unknown partial；replay不double-count
- **persistence boundary**: provider exact-once recovery + ProviderCallReceipt ledger
- **boundary contracts**: BC-002, BC-003, BC-004
- **positive acceptance**: AC-003, AC-006, AC-007
- **negative acceptance**: AC-004, AC-008
- **first use**: REQUIRED | AC-003
- **repeat**: REQUIRED | AC-006
- **retry**: REQUIRED | AC-006
- **resume**: REQUIRED | AC-006
- **restart**: REQUIRED | AC-006, AC-011
- **reset**: NOT_APPLICABLE | recovery ledger不可清空后伪装fresh send
- **rollback**: REQUIRED | AC-012

### SEQ-003 | Compaction/truncation/remote continuation transformation
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: provider_call_id + contribution_id + transformation stage
- **initial state**: source contributions可见但尚未完成final provider build
- **ordered events**: source classify → summarize/compact/truncate/dedupe/cache transform → remote continuation merge/unknown → final delivery plan → receipt reconciliation
- **expected observations**: category不因dimension重复；summarized conversation仍为conversation；未知远程内容只进residual/partial
- **persistence boundary**: content-free receipt extension；不保存raw source
- **boundary contracts**: BC-001, BC-002, BC-003
- **positive acceptance**: AC-001, AC-004, AC-005
- **negative acceptance**: AC-002, AC-008
- **first use**: REQUIRED | AC-001, AC-005
- **repeat**: REQUIRED | AC-005
- **retry**: REQUIRED | AC-006
- **resume**: REQUIRED | AC-006
- **restart**: REQUIRED | AC-011
- **reset**: NOT_APPLICABLE | transformation是per-call immutable evidence
- **rollback**: REQUIRED | AC-012

### SEQ-004 | SSE duplicate/reconnect 到 Electron reload
- **owner**: code-owner-runtime
- **owner confirmation**: PENDING_HANDOFF
- **identity key**: run_id + bundle_id + revision + digest + provider_call_id set
- **initial state**: RunBundle完成但PuPu尚未持久化composition projection
- **ordered events**: sidecar strict projection → SSE → renderer admission → Electron transaction → duplicate done → reconnect → app restart/reload → clear/reset
- **expected observations**: same revision same digest幂等；conflict/stale拒绝；半事务0；reload selector一致；scope clear不误删
- **persistence boundary**: sidecar stream state + renderer store + Electron SQLite/IPC
- **boundary contracts**: BC-005, BC-006, BC-007
- **positive acceptance**: AC-007, AC-010, AC-011
- **negative acceptance**: AC-008, AC-011
- **first use**: REQUIRED | AC-011
- **repeat**: REQUIRED | AC-011
- **retry**: REQUIRED | AC-011
- **resume**: REQUIRED | AC-011
- **restart**: REQUIRED | AC-011
- **reset**: REQUIRED | AC-011
- **rollback**: REQUIRED | AC-012

### SEQ-005 | Root/graph/subagent Run Tree aggregation
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: root_run_id + run_id + provider_call_id + parent/child edge
- **initial state**: root只有direct calls，child/graph/auxiliary可随后完成
- **ordered events**: root calls → graph/recipe child → serial/parallel subagent → auxiliary purpose → child finality → root/tree materialize/reproject
- **expected observations**: Run/Tree使用all_call_ids集合并集；父子total不相加；同call只出现一次；purpose可筛选但不改事实
- **persistence boundary**: immutable call receipts + RunBundle topology/revisions
- **boundary contracts**: BC-003, BC-004, BC-005
- **positive acceptance**: AC-006, AC-007
- **negative acceptance**: AC-004, AC-008
- **first use**: REQUIRED | AC-007
- **repeat**: REQUIRED | AC-007
- **retry**: REQUIRED | AC-006
- **resume**: REQUIRED | AC-006, AC-007
- **restart**: REQUIRED | AC-011
- **reset**: NOT_APPLICABLE | topology事实不可reset；UI selection可切换但不改账
- **rollback**: REQUIRED | AC-012

### SEQ-006 | Runtime capability rollout与rollback
- **owner**: code-owner-runtime
- **owner confirmation**: PENDING_HANDOFF
- **identity key**: PuPu candidate digest + reused Unchain wheel digest + runtime manifest digest + rollout mode
- **initial state**: feature off，legacy chat可用，composition producer/consumer未active
- **ordered events**: import wheel → validate actual manifest → shadow producer/consumer matrix → packaged smoke → active UI → restart soak → rollback → re-enable
- **expected observations**: 两slug缺一即fail closed；SHA/dirty/path不参与compatibility；同一wheel贯穿test/package；rollback只关projection/UI不改receipt历史
- **persistence boundary**: runtime readiness + build artifacts + Electron feature state
- **boundary contracts**: BC-005, BC-006, BC-007, BC-008, BC-009
- **positive acceptance**: AC-009, AC-010, AC-012
- **negative acceptance**: AC-008, AC-009
- **first use**: REQUIRED | AC-009
- **repeat**: REQUIRED | AC-009
- **retry**: REQUIRED | AC-012
- **resume**: REQUIRED | AC-011
- **restart**: REQUIRED | AC-009, AC-011, AC-012
- **reset**: REQUIRED | AC-011
- **rollback**: REQUIRED | AC-012

## 拟议 Review 前置
- lead 必须先把 intake draft 集成为真实 `proposal.md#PS-001`；不得把本文件的 PENDING confirmations 当 owner return。
- handoff 顺序：runtime → chat-core → electron → shared-arteries → chat-bubble；同一时刻仅一个 OPEN HS。
- 所有 handoff scope 必须覆盖对应 BC/SEQ 与其全部 AC；RETURN contribution 必须逐项覆盖对象。
- 最终 PS/RS hash 必须由 canonical tooling计算，不手填；owner stances 必须在 RS 后由真实 owner分别提交。
- `PLAN_RULING: APPROVED + ACTION` 与精确匹配的 `NOTICE:CLOSURE_COMMIT` 生效前，production authorization 为 NONE。
