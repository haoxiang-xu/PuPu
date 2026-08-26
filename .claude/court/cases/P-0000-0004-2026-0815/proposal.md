---
case_id: P-0000-0004-2026-0815
boundary_revision_set: sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c+sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
updated_at: 2026-08-15T16:52:57-07:00
---

# Context Composition V1

## P-0000-0004-2026-0815
- **主 owner**: code-owner-unchain
- **目标结果**: 以每次 physical provider call 的 immutable ProviderCallReceipt 与既有 RunBundle receipt set 为唯一计量权威，生成 content-free、可对账、可恢复的 Context Composition V1，并在 PuPu 提供 Model Call / Run Tree 两级 Context Usage UI。
- **non_goals**: 不建立第二 token ledger；不保存 raw prompt/message/tool arguments、hidden reasoning、secret、path/URL、file/tool/artifact bytes、source snippet、arbitrary label 或普通跨用户 content hash；不把 Context Control/cache/MCP/provider-retained/retry/fallback 当 category；不新增 top-level RunBundle aggregate、Agent Run scope、Electron IPC/table/keyed store；不以 Git SHA/dirty checkout/source path 决定 runtime compatibility；不把 remote continuation 或 provider-retained invisible context伪装为精确分类；不在本案启用 primary transient retry>0→fallback。
- **实施范围**: Unchain RunState contribution capture、ModelTurnRequest internal route manifest、authoritative provider wire/physical identity、ProviderCallReceipt namespaced extension、既有 RunBundle carriage；PuPu sidecar/SSE projection、renderer assistant meta.bundle/TraceChain admission、shared Model Call/Run Tree selectors、chat-bubble Context Usage modal；Electron仅验证既有持久化连续性。
- **contract_set**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **state character**: STATEFUL
- **owner slots**:
  - SLOT-001 | code-owner-unchain | carrier、wire/receipt identity、RunBundle integration | FILLED | S-0011, S-0013
  - SLOT-002 | code-owner-runtime | sidecar/SSE/runtime feature availability | FILLED | HS-002, S-0024; HS-004, S-0032
  - SLOT-003 | code-owner-chat-core | renderer admission、assistant meta.bundle/TraceChain、SEQ-004 | FILLED | HS-003, S-0029; HS-006, S-0039
  - SLOT-004 | code-owner-shared-arteries | strict Model Call/Run Tree selector producer | FILLED | HS-005, S-0036
  - SLOT-005 | code-owner-electron | 既有 bundle_json persistence continuity verification only | FILLED | HS-007, S-0042
  - SLOT-006 | code-owner-chat-bubble | Context Usage modal consumer | FILLED | HS-008, S-0045
- **关键步骤与依赖**: lead先实现 closed route manifest与physical identity seam；runtime投影既有receipt set；chat-core保持stream/store单向契约；shared selector只读existing receipts+all_call_ids；Electron不新建账本；bubble只消费closed presentation model；active rollout必须等待一次构建、全程复用的同一Unchain wheel与PuPu candidate完成全矩阵。
- **风险**: physical ordinal漂移可导致send后CAS前失败；heuristic overestimate可伪造比例；route mismatch、remote retained context与replay可double-count；自由文本或普通hash可形成隐私旁路；错误把capability加入global admission会阻断正常chat。
- **可逆性**: runtime feature与UI均为composition availability-only；缺失或关闭只隐藏breakdown，不改变provider send、tool、interaction、base receipt或RunBundle；namespaced receipt extension与既有carriage可保留历史事实。
- **回滚/补救方式**: 关闭composition producer/projection/modal并返回稳定unavailable reason；保留valid base receipt/RunBundle，不删除、不重算、不从legacy total回填；lease/ledger/CAS/base-receipt错误仍原样fail closed，绝不被composition降级吞掉。
- **验收标准**:
  - AC-001 | build_model_turn_request只从获准的instrumented contribution sources与stable durable private option冻结一个≤16KiB、content-free、closed route manifest，拒绝arbitrary component_state authority；generic与active两条send ingress携带同一ModelTurnRequest；10类、闭集subtype与surface精确。
  - AC-002 | extra key、错category/subtype/surface、bounds/order/duplicate/privacy违规、freeze后mutation或carrier泄漏进provider bytes/authority digest被拒绝或省略，且provider request bytes/digest/行为不变。
  - AC-003 | authoritative wire完成后只选择exact matching route，以internal manifest+wire生成closed `unchain.context/context_composition_v1` extension；receipt hash覆盖extension，category/subtype sums稳定，receipt input total是唯一denominator。
  - AC-004 | wrong schema/method/key set/type/order/digest/category/subtype/surface、quality=exact、复制provider denominator或content-bearing字段使composition metadata fail closed；valid base receipt/call仍保留。
  - AC-005 | 表驱动覆盖reconciled_estimate/estimated/partial/provider-total unavailable/heuristic overestimate；只允许reconciled等式，overestimate不clamp/按比例摊平，unreconciled selector percentage为null。
  - AC-006 | primary send/retry n→physical n，当前允许primary0→fallback physical1；两者provider_call_id唯一；receipt factory取得exact subject/route/ProviderPhysicalSendContext；cold lookup/replay得到同一identity。
  - AC-007 | subject/route digest/physical ordinal mismatch、after-send-before-CAS conflict、fallback collision、unmatched authoritative route与primary transient retry>0→fallback在冲突receipt前fail closed；composition异常不得吞base factory/ledger/lease/CAS错误。
  - AC-008 | root/graph/subagent ProviderCallReceipts及extensions byte-equivalent进入既有provider_calls；all_call_ids等于deterministic provider_call_set_union且bundle digest覆盖carriage。
  - AC-009 | missing/duplicate/mutated receipt、union mismatch或任何top-level composition aggregate被拒；retry/replay不double-count，父子total不相加。
  - AC-010 | exact deployed Unchain producer→PuPu sidecar→SSE→renderer在live/reattach/replay携带同一RunBundle；actual imported runtime manifest声明两个capability slug，但缺失只返回closed code `capability_unavailable`，绝不进入global `_REQUIRED_PROTOCOLS`或阻断normal V4 send/tools/interactions/base RunBundle；Git/SHA只作telemetry。
  - AC-011 | missing/invalid extension分别返回closed content-free `extension_missing`/`extension_invalid`且只降级Context Usage；不provider resend、不破坏chat、不伪造0/exact usage、不从legacy totals合成composition。
  - AC-012 | Model Call selector只解析一个exact physical provider_call_id/route receipt；provider total的reported/unavailable与composition quality独立；只在reconciled equality成立时返回percentage。
  - AC-013 | Run Tree selector只对root/graph/subagent existing all_call_ids做deterministic set union；primary/retry/fallback每个physical receipt计一次；不暴露Agent Run，不显示伪造shared context-window percentage。
  - AC-014 | 持久化与UI证明无raw/content-hash泄漏；existing ProviderCallReceipt→RunBundle→bundle_json→assistant meta.bundle→TraceChain冷重启连续且无新IPC/table/store；modal固定8组、category→subtype二级accordion、zero隐藏、unreconciled/partial/unknown显式、dark/light/keyboard/screen-reader可用。
  - AC-015 | strict `pupu.context_composition_rollout_evidence.v1` exact fields绑定PuPu candidate、approved contract pair、imported manifest、one immutable wheel及test/package/import wheel SHA equality；8个canonical matrix cells全部PASS才允许active rollout，FAIL/NOT_RUN/PENDING/missing/duplicate/unknown/mismatch全部BLOCKED。
  - AC-016 | fresh renderer仅在composer/edit的final `templateLength>0`时发≤1KiB exact `pupu.context_composition_hint.v2` one-contribution；`prefix_utf16_units=templateLength`、`utf8_bytes=TextEncoder(finalMessage.slice(0,templateLength)).length`、`source_count=1`；zero-template-only/no-composer/non-fresh/resume/interject省略，mixed只表示join后的非空template prefix，且无raw/name/id/hash。
  - AC-017 | sidecar对authoritative final message验证exact v2 shape、JS UTF-16 range/surrogate/scalar安全，并strict-UTF-8重算prefix bytes与claimed `utf8_bytes`相等后，才原子投影为private one-item skills/expanded_invocation/messages tuple；`source_count`必须literal 1；runtime不声称独立证明template-origin provenance；所有invalid/byte mismatch均只返回`fresh_hint_invalid`且不持久化，ordinary V4继续。
  - AC-018 | valid public v2经runtime投影到既有private `_context_composition_hint_v1` one-item aggregate；只有private v1 canonical bytes进入stable durable resume option allowlist并在graph-step/resume byte-identical rehydrate；public-v2 bytes不参与resume equality，arbitrary component_state永不成为authority。
  - AC-019 | resume public hint absent读取durable；exact equality为no-write/no-version-advance；malformed/unequal/no-baseline不可mint/overwrite，分别返回`resume_hint_invalid`/`resume_hint_mismatch`/`resume_hint_no_baseline`，只omit该physical call extension且normal V4 resume继续。
  - AC-020 | semantic/local_replay投影hint到messages，retained remote_continuation投影到provider_state；tuple checked-safe-int merge/canonical sort；route totals/coverage/token公式与exact physical receipt selector在primary/fallback/remote矩阵通过。
- **boundary obligations**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | Approved contribution sources 到 ModelTurnRequest internal route manifest
- **producer**: build_model_turn_request从instrumented source facts与stable durable private option冻结的`internal_context_composition_v1`
- **producer owner**: code-owner-unchain
- **consumer**: generic/active两条provider send ingress共享的ModelTurnRequest与ProviderExecution
- **consumer owner**: code-owner-unchain
- **canonical representation**: producer r6 contract中的closed route manifest：top exact keys schema/method/context_window_tokens/routes；route exact keys route_name/context_mode/provider_retained/manifest_items/wire_surfaces/contributions；contribution exact keys category/subtype/surface/utf8_bytes/source_count；category exact frozen order `instructions, skills, tool_definitions, conversation, tool_activity, memory, task_state, files_media, agent_coordination, output_contract`；闭集subtype/surface、routes 1..2、每route contributions 0..128、总计≤16KiB并canonical sorted
- **consumer projection**: 仅content-free计数与闭集枚举；同一immutable request穿过`ProviderTurnOwnership.fetch_turn`及`FinalModelToolBoundary→ContextRuntime._fetch_provider_turn_boundary`；ProviderExecution只在authoritative wire完成后选择exact route
- **admission policy**: CLOSED
- **admission details**: exact key/type/enum/order/unique/safe-integer/bounds；route totals满足manifest_items≥source-count sum及wire_surfaces≥distinct surfaces；carrier optional-by-absence且null非法；excluded from provider bytes、ProviderWireEnvelope及authority/catalog/request digests；不得改变provider行为；arbitrary component_state不是authority
- **unknown input behavior**: composition unavailable或partial且stable reason；不猜route，不阻断或改变provider send
- **failure semantics**: invalid/privacy-invalid carrier被拒绝或省略；provider request bytes/digests保持原值；任何base send错误原样传播
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-001
- **negative acceptance**: AC-002

### BC-002 | Internal route manifest与authoritative wire 到 ProviderCallReceipt extension
- **producer**: exact matched route manifest + finalized ProviderWireEnvelope/ProviderWireRoute + provider usage
- **producer owner**: code-owner-unchain
- **consumer**: immutable ProviderCallReceipt `extensions[unchain.context/context_composition_v1]`
- **consumer owner**: code-owner-unchain
- **canonical representation**: outer receipt extension namespace OPEN-by-key；该key value为version1 CLOSED exact schema/method/quality/context_window_tokens/wire/categories/attributed_tokens/residual_tokens/coverage；10类与闭集subtype正计数、sorted/unique；content-free
- **consumer projection**: exact route_name/route_sha256/envelope_sha256/context_mode；category/subtype aggregation只来自matched route；provider input total只留在receipt usage；remote/provider-retained invisible context仅partial/unreconciled/residual语义
- **admission policy**: VERSIONED
- **admission details**: extension key/schema exact；unknown core key/type/order/enum/digest、unsafe/negative/bool integer、duplicate、content field拒绝；quality不可exact；composition slugs只影响availability
- **unknown input behavior**: omit/reject composition extension并产生stable unavailable reason；unknown other namespaced receipt extensions依现有RunBundle policy处理
- **failure semantics**: composition enrichment只可在valid base receipt构造后降级；不得吞base receipt factory、ledger、lease或CAS错误；不得触发provider resend
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-003
- **negative acceptance**: AC-004, AC-005

### BC-003 | ProviderRequestSubject/ProviderWireRoute 到 ProviderCallIdentity与result CAS
- **producer**: durable ProviderRequestSubject、fallback parent、exact ProviderWireRoute及immutable ProviderPhysicalSendContext
- **producer owner**: code-owner-unchain
- **consumer**: ProviderCallIdentity factory、provider-result persistence与cold recovery CAS
- **consumer owner**: code-owner-unchain
- **canonical representation**: deterministic physical ordinal：primary retry n→n；当前合法primary0→OpenAI fallback→1；generic ProviderCallIdentity.route不变；exact subject route/digest在wire evidence；process send_number仅telemetry
- **consumer projection**: callbacks共享同一physical context；receipt identity retry_ordinal使用physical ordinal；CAS验证subject/fallback parent/route digest/mapping；Kernel telemetry使用max(legacy count, physical ordinal)
- **admission policy**: CLOSED
- **admission details**: primary/fallback route closed enum；fallback只从primary0合法；cold/replay必须重建同一provider_call_id；route mismatch不猜测
- **unknown input behavior**: stable provider physical identity invalid；冲突receipt提交前fail closed
- **failure semantics**: after-send-before-CAS保持uncertain exact identity供recovery；primary transient retry>0→fallback明确拒绝且需独立P1；composition不能降级lease/ledger/CAS错误
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-006
- **negative acceptance**: AC-007

### BC-004 | ProviderCallReceipt set 到既有 RunBundle carriage
- **producer**: immutable ProviderCallReceipts、extensions、ExecutionIdentity/topology与provider_call_set_union
- **producer owner**: code-owner-unchain
- **consumer**: existing RunBundle provider_calls/all_call_ids materializer与digest
- **consumer owner**: code-owner-unchain
- **canonical representation**: existing `provider_calls[*].extensions` + `all_call_ids`/`provider_call_set_union`；receipt hash覆盖extension，bundle digest覆盖receipt-set carriage；无top-level composition ref/summary
- **consumer projection**: byte-equivalent receipt extension carriage；Model Call由exact call重建，Run Tree由set union重建；父/子total永不相加
- **admission policy**: CLOSED
- **admission details**: receipt/provider_call_id唯一；union exact；same revision/digest规则沿用existing RunBundle；capability slug只表示receipt extension完整传播/union保证
- **unknown input behavior**: composition unavailable；base RunBundle按existing strict policy保留或拒绝；不得从legacy total重建
- **failure semantics**: 不建第二ledger或parallel aggregate；retry/reattach/replay不能duplicate receipt或double-count
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-008
- **negative acceptance**: AC-009

### BC-005 | RunBundle经PuPu sidecar/SSE 到 renderer assistant meta.bundle/TraceChain
- **producer**: PuPu sidecar对existing RunBundle receipt-set的strict projection与runtime_events_v4 carriage
- **producer owner**: code-owner-runtime
- **consumer**: chat-core SSE admission、streaming_message_store、assistant meta.bundle与TraceChain continuity
- **consumer owner**: code-owner-chat-core
- **canonical representation**: existing versioned RunBundle/bundle_json/runtime event carriage；composition只存在于provider receipt namespaced extension；runtime features为availability-only；unavailable reason exact `{schema:'pupu.context_composition_availability.v2',code:<closed-7-enum>}`且无details
- **consumer projection**: strict validate后原样保留provider_calls[*].extensions/all_call_ids；live、reattach、duplicate done、reconnect、cold replay不创建新receipt或第二aggregate
- **admission policy**: VERSIONED
- **admission details**: malformed/missing composition只给stable unavailable reason；两个slug不得进入global `_REQUIRED_PROTOCOLS`；Git revision/path/dirty只作telemetry
- **unknown input behavior**: capability缺失=`capability_unavailable`，extension absent=`extension_missing`，malformed=`extension_invalid`；Context Usage unavailable/hidden；normal V4/provider send、tools、interactions、base RunBundle与chat继续
- **failure semantics**: composition frame不得trigger resend、破坏message store或伪造0/exact；sticky同revision conflict按existing bundle admission fail closed
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: HS-010
- **consumer owner confirmation**: HS-011
- **positive acceptance**: AC-010
- **negative acceptance**: AC-011

### BC-006 | Existing persisted bundle到strict selector与Context Usage modal
- **producer**: shared-arteries从assistant meta.bundle/TraceChain读取的closed Model Call/Run Tree presentation model
- **producer owner**: code-owner-shared-arteries
- **consumer**: chat-bubble Context Usage modal
- **consumer owner**: code-owner-chat-bubble
- **canonical representation**: scopes仅model_call/run_tree；8组稳定顺序与颜色token；category→closed subtype二级数据；provider total/composition quality/coverage三元状态；unavailable/partial/unreconciled显式
- **consumer projection**: Model Call exact call/route；Run Tree root/graph/subagent call-id set union；zero隐藏；percentage只在reconciled+reported total；unknown/residual灰色语义；bubble只读不反向驱动stream
- **admission policy**: CLOSED
- **admission details**: unknown category/subtype/group、duplicate call、unreconciled非null percentage、Agent Run scope、raw/hash field拒绝；Electron只验证既有bundle_json连续性，不新增IPC/table/store
- **unknown input behavior**: modal stable unavailable/error state；不显示Other、不猜分类、不normalized-to-100%
- **failure semantics**: modal/selector失败不影响run/chat；dark/light/keyboard/screen-reader仍说明estimated/partial/unavailable
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: HS-005
- **consumer owner confirmation**: HS-008
- **positive acceptance**: AC-012, AC-013
- **negative acceptance**: AC-014

### BC-007 | Fresh renderer hint 到 sidecar authoritative admission
- **producer**: chat-core fresh request top-level optional `context_composition_hint`
- **producer owner**: code-owner-chat-core
- **consumer**: PuPu sidecar authoritative final-message/UTF-16 boundary validator
- **consumer owner**: code-owner-runtime
- **canonical representation**: absent或≤1KiB exact `{schema:'pupu.context_composition_hint.v2',contributions:[one exact {category:'skills',subtype:'expanded_invocation',surface:'messages',prefix_utf16_units:positive-safe-int,utf8_bytes:positive-safe-int,source_count:1}]}`；top/item keys exact，无extra/name/raw/id/hash；public v1不升级、不dual-parse
- **consumer projection**: renderer在fresh composer/edit且final `templateLength>0`时声明UTF-16 boundary与UTF-8 byte claim；sidecar按authoritative final message验证JS UTF-16 range、surrogate/scalar安全并strict-UTF-8重算exact equality，再投影成private v1 aggregate；runtime只验证bytes，不独立证明boundary的template provenance
- **admission policy**: CLOSED
- **admission details**: source_count必须literal 1且只表示one aggregate prefix record；zero-template-only/no-composer/non-fresh/resume/interject省略；mixed zero/nonzero只覆盖joined non-empty prefix；generic/active fresh ingress收敛同一builder/writer
- **unknown input behavior**: schema/key/enum/type/range/size/boundary/surrogate/scalar/byte-equality invalid统一=`fresh_hint_invalid`；discarded for composition only，不进入durable state，不改变provider request/send
- **failure semantics**: ordinary V4 fresh send继续；只产生stable content-free composition unavailable diagnostic；不猜bytes、template provenance或subtype；invalid不mint/write/overwrite
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: HS-011
- **consumer owner confirmation**: HS-010
- **positive acceptance**: AC-016, AC-017
- **negative acceptance**: AC-017

### BC-008 | Admitted private hint 到 stable durable option与resume equality
- **producer**: sidecar same-transaction canonical `_context_composition_hint_v1` mint与resume declaration admission
- **producer owner**: code-owner-runtime
- **consumer**: Unchain stable durable resume option allowlist、graph-step/rehydration与resume CAS
- **consumer owner**: code-owner-unchain
- **canonical representation**: valid public v2由runtime投影成existing private v1 one-item skills/expanded_invocation/messages aggregate（recomputed utf8_bytes、literal source_count=1）；public/private bytes与schema不同；只有private v1在fresh atomic mint及resume absence/equality/conflict三态中作为durable authority；无arbitrary component_state authority
- **consumer projection**: graph-step/resume原样rehydrate；absent declaration使用durable；exact canonical equality只声明、不write/不version advance
- **admission policy**: CLOSED
- **admission details**: malformed/unequal/present-with-no-baseline不得mint或overwrite；stable durable option exact allowlist；fresh mint与turn durable transition原子
- **unknown input behavior**: malformed=`resume_hint_invalid`，unequal=`resume_hint_mismatch`，present-with-no-baseline=`resume_hint_no_baseline`；该physical call composition unavailable并omit extension；closed content-free reason；normal V4 resume继续
- **failure semantics**: durable hint冲突不覆盖last good；不provider resend；base resume/lease/CAS错误不被composition降级吞掉
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: HS-010
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-018, AC-019
- **negative acceptance**: AC-019

### BC-009 | Durable private hint 到 route manifest与exact receipt selection
- **producer**: stable durable `_context_composition_hint_v1`或same-transaction freshly admitted value
- **producer owner**: code-owner-unchain
- **consumer**: internal route manifest builder、authoritative route selector与ProviderCallReceipt composition enrichment
- **consumer owner**: code-owner-unchain
- **canonical representation**: semantic/local_replay→messages；remote_continuation+provider_retained=true→provider_state；route exact totals manifest_items/wire_surfaces；tuple token=`max(1,ceil(utf8_bytes/4))`；checked merge/canonical order
- **consumer projection**: 只读durable authority；同category/subtype/surface tuple checked-safe-int merge；exact authoritative route match；coverage complete/partial与quality/residual严格按r6 contract
- **admission policy**: CLOSED
- **admission details**: no component_state fallback；route mismatch/overflow/invalid totals omit extension；manifest_items≥source-count sum、wire_surfaces≥distinct surface count；known loss强制partial
- **unknown input behavior**: composition unavailable/partial且no percentage；不猜route、不改send、不建第二ledger
- **failure semantics**: extension enrichment仅在valid base receipt后；remote/provider-retained invisible tokens不宣称exact；overestimate不scale
- **identity/version binding**: producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-020
- **negative acceptance**: AC-002, AC-004, AC-005, AC-020

### SEQ-001 | Capture到request carrier、final wire与receipt
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: logical occurrence + run_id + iteration + provider request subject + authoritative route
- **initial state**: RunState contribution state存在，尚无frozen carrier、physical send或receipt
- **ordered events**: capture → build_model_turn_request freeze → both ingress carriage → authoritative wire finalize → exact route select → physical send → base receipt → optional composition enrichment
- **expected observations**: carrier不改wire/digest；每个send至多一个base receipt；exact route extension被receipt hash覆盖；repeat创建新physical identity且旧receipt immutable
- **persistence boundary**: ModelTurnRequest internal state → ProviderCallReceipt ledger
- **boundary contracts**: BC-001, BC-002, BC-003
- **positive acceptance**: AC-001, AC-003
- **negative acceptance**: AC-002, AC-004, AC-005
- **first use**: REQUIRED | AC-001, AC-003
- **repeat**: REQUIRED | AC-001, AC-003
- **retry**: REQUIRED | AC-006
- **resume**: REQUIRED | AC-006
- **restart**: REQUIRED | AC-006
- **reset**: NOT_APPLICABLE | internal carrier与receipt是per-call immutable事实，没有mutable reset
- **rollback**: REQUIRED | AC-015

### SEQ-002 | Retry/fallback/uncertain result CAS
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: durable ProviderRequestSubject + fallback parent + ProviderWireRoute digest + deterministic physical ordinal
- **initial state**: primary send待执行，或已有after-send-before-CAS uncertain identity
- **ordered events**: primary n send → transient retry/cold recovery → optional primary0→fallback1 → result persist CAS → duplicate callback/replay
- **expected observations**: primary/fallback call IDs唯一稳定；cold recovery同一ID；duplicate callback不新建receipt；unsupported transition与mismatch在冲突commit前拒绝
- **persistence boundary**: provider started lease + result ledger + ProviderCallReceipt
- **boundary contracts**: BC-003
- **positive acceptance**: AC-006
- **negative acceptance**: AC-007
- **first use**: REQUIRED | AC-006
- **repeat**: REQUIRED | AC-006
- **retry**: REQUIRED | AC-006, AC-007
- **resume**: REQUIRED | AC-007
- **restart**: REQUIRED | AC-006, AC-007
- **reset**: NOT_APPLICABLE | durable provider identity不可清除后伪装fresh send
- **rollback**: REQUIRED | AC-007, AC-015

### SEQ-003 | Receipt set到RunBundle tree union
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: execution/root_run_id + provider_call_id set + RunBundle revision/digest
- **initial state**: immutableroot/graph/subagent receipts可用，RunBundle尚未materialize或需reproject
- **ordered events**: root receipt → graph/subagent/auxiliary receipts → provider_call_set_union → provider_calls/all_call_ids materialize → bundle digest → reattach/replay/reprojection
- **expected observations**: receipt extension byte-equivalent；union deterministic；同call一次；父子total不相加；不存在top-levelaggregate
- **persistence boundary**: ProviderCallReceipt ledger → existing RunBundle
- **boundary contracts**: BC-004
- **positive acceptance**: AC-008
- **negative acceptance**: AC-009
- **first use**: REQUIRED | AC-008
- **repeat**: REQUIRED | AC-008
- **retry**: REQUIRED | AC-008, AC-009
- **resume**: REQUIRED | AC-008, AC-009
- **restart**: REQUIRED | AC-008, AC-015
- **reset**: NOT_APPLICABLE | receipt/topology事实不可reset；UI选择不改账
- **rollback**: REQUIRED | AC-009, AC-015

### SEQ-004 | Sidecar/SSE/replay/persistence到selectors/UI
- **owner**: code-owner-chat-core
- **owner confirmation**: HS-011
- **identity key**: bundle_id + revision/digest + provider_call_id set + assistant message identity
- **initial state**: Unchain RunBundle已完成，PuPu尚未admit或render composition
- **ordered events**: sidecar strict projection → SSE → chat-core admission → existing bundle_json/assistant meta.bundle/TraceChain persistence → duplicate/reconnect/reattach → cold restart → Model Call/Run Tree select → modal
- **expected observations**: same receipt set贯穿live/replay；missing/malformed composition只unavailable；existing persistence重启一致；selector不double-count；UI不伪造percentage
- **persistence boundary**: runtime_events_v4 + existing Electron bundle_json + chat store/TraceChain
- **boundary contracts**: BC-005, BC-006
- **positive acceptance**: AC-010, AC-012, AC-013
- **negative acceptance**: AC-011, AC-014
- **first use**: REQUIRED | AC-010, AC-012
- **repeat**: REQUIRED | AC-010, AC-013
- **retry**: REQUIRED | AC-010, AC-011
- **resume**: REQUIRED | AC-010, AC-011, AC-014
- **restart**: REQUIRED | AC-010, AC-014, AC-015
- **reset**: NOT_APPLICABLE | V1不新建composition store；existing chat/run clear语义不由本案改变
- **rollback**: REQUIRED | AC-011, AC-015

### SEQ-005 | Fresh hint absence、admit与discard
- **owner**: code-owner-runtime
- **owner confirmation**: HS-010
- **identity key**: fresh turn request + authoritative final message + public-v2 canonical bytes + projected private-v1 canonical bytes
- **initial state**: fresh renderer request尚未sidecar admission，durable private hint不存在
- **ordered events**: renderer omit或wrapped-v2 hint → sidecar exact schema/size/literal validation → authoritative JS UTF-16 range/scalar validation → strict UTF-8 byte equality → atomic public-v2→private-v1 projection或composition-only discard → ordinary V4 send
- **expected observations**: absence/zero-template-only不mint且非error；valid positive prefix mint one private aggregate；mixed zero/nonzero仍source_count=1；public v1/wrong bytes/surrogate/range/extra/wrong literal不persist；两条fresh ingress相同；provider send不受composition availability影响
- **persistence boundary**: renderer request wire → sidecar admission → stable durable option transaction
- **boundary contracts**: BC-007, BC-008
- **positive acceptance**: AC-016, AC-017
- **negative acceptance**: AC-017
- **first use**: REQUIRED | AC-016, AC-017
- **repeat**: REQUIRED | AC-016, AC-017
- **retry**: REQUIRED | AC-017
- **resume**: NOT_APPLICABLE | resume declaration由SEQ-006覆盖，fresh hint不得写入resume路径
- **restart**: REQUIRED | AC-018
- **reset**: NOT_APPLICABLE | hint随获准durable execution生命周期，不新增独立store/reset
- **rollback**: REQUIRED | AC-015, AC-017

### SEQ-006 | Graph-step/resume hint rehydrate与declaration equality
- **owner**: code-owner-runtime
- **owner confirmation**: HS-010
- **identity key**: durable execution/turn + stable `_context_composition_hint_v1` canonical bytes + option revision
- **initial state**: durable baseline absent或已由fresh atomic mint建立
- **ordered events**: graph-step checkpoint → cold restart/rehydrate → resume declaration absent/equal/malformed/unequal/no-baseline → no-write equality或composition-only conflict → physical call
- **expected observations**: private bytes unchanged；absence使用baseline；equal不write/version advance；malformed/unequal/no-baseline不mint/overwrite且只omit该call extension；normal V4 resume继续
- **persistence boundary**: stable durable option allowlist + graph-step/resume rehydrate/CAS
- **boundary contracts**: BC-008
- **positive acceptance**: AC-018, AC-019
- **negative acceptance**: AC-019
- **first use**: REQUIRED | AC-018
- **repeat**: REQUIRED | AC-018, AC-019
- **retry**: REQUIRED | AC-019
- **resume**: REQUIRED | AC-018, AC-019
- **restart**: REQUIRED | AC-018, AC-019
- **reset**: NOT_APPLICABLE | no new hint store or independent reset semantics
- **rollback**: REQUIRED | AC-015, AC-019

### SEQ-007 | Durable hint route projection与exact physical receipt
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: durable hint canonical tuple + context_mode/provider_retained + authoritative route + provider_call_id
- **initial state**: admitted durable hint可用，ModelTurnRequest route manifest尚未投影
- **ordered events**: durable read → semantic/local/remote surface projection → checked tuple merge → route totals/canonical sort → authoritative exact route match → physical send → receipt extension/coverage/quality
- **expected observations**: no component_state authority；local/semantic在messages，retained remote在provider_state；token formula deterministic；known loss partial；unmatched route noextension；primary/fallback选择各自exact route
- **persistence boundary**: stable durable option → internal route manifest → immutable ProviderCallReceipt
- **boundary contracts**: BC-001, BC-002, BC-003, BC-009
- **positive acceptance**: AC-020, AC-003, AC-006
- **negative acceptance**: AC-002, AC-004, AC-005, AC-007, AC-020
- **first use**: REQUIRED | AC-020
- **repeat**: REQUIRED | AC-020
- **retry**: REQUIRED | AC-006, AC-020
- **resume**: REQUIRED | AC-018, AC-019, AC-020
- **restart**: REQUIRED | AC-018, AC-020
- **reset**: NOT_APPLICABLE | route manifest与receipt为per-call immutable evidence
- **rollback**: REQUIRED | AC-015, AC-020

### PS-001 | 2026-08-15T16:30:25-07:00
- **supersedes**: null
- **included contributions**: S-0011, S-0012, S-0013, S-0015, S-0016, S-0017, S-0020, S-0021, HS-002, HS-003, HS-004, HS-005, HS-006, HS-007, HS-008
- **candidate lineage**: r0-r4 superseded intake; r5 NEEDS_REVISION preserved; r6 producer retained sha256:5dae9c3d1c6faf5cc1cfea8f5adf4687f0ab90965ed899191a7ab1a9419b5bf2; r7 consumer sha256:278149476c4ce35ce7ec53ce67866c5ce117d927f2d42e787f208cdb719d7878 closes S-0020
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:bf3eb598eeb7fcbf8ccd7909e8d3ae1d85ddbb87c508837b2b4649b9486874e4
- **content hash method**: quorum.proposal.snapshot.v1 | SHA-256(domain || NFC UTF-8 LF proposal.md with exactly this PS content-hash line omitted)
- **content hash**: sha256:36c3e9f3690c161dc535db6eaffb941e9b9e310caa66a6c6c70715248da7ab93
- **formed_by**: code-owner-unchain

### PS-002 | 2026-08-15T17:00:38-07:00
- **supersedes**: PS-001
- **included contributions**: S-0052, S-0054, S-0057, S-0058, S-0063, S-0064, HS-010, HS-011
- **candidate lineage**: PS-001/RS-001 objection preserved; compact r8 NOT_FROZEN; r9 NEEDS_REVISION preserved; r10 producer sha256:1d37e836a3631fb7ff333a004f477ee979059fae3fc76626041ba753edbae93c + consumer sha256:9971243d2cacfe6ac4847dd032b0922e997f70d543366932e8cf3c792574abc9 + contract-set sha256:0a73cae3382b7388e8e1210f5aaacbba4a22e6bba284cd7869b520369dbf01be is the sole successor pair
- **changed blocks**: BC-005, BC-007, BC-008, SEQ-004, SEQ-005, SEQ-006, AC-010, AC-011, AC-015, AC-016, AC-017, AC-018, AC-019
- **dependent review blocks**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009, SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007, AC-001..AC-020
- **boundary object hash**: sha256:e561bf63a14a2411b47531528fa96b119138b18b224ff34fd93294d1206691ba
- **content hash method**: quorum.proposal.snapshot.v1 | SHA-256(domain || NFC UTF-8 LF proposal.md with exactly this PS content-hash line omitted)
- **content hash**: sha256:08f10f1fd30487900a9fcc56594ac072dcbb4da7303da4a81ddcc1a81e813e4f
- **formed_by**: code-owner-unchain
- **formation effect**: PS-001 is superseded for forward action but remains immutable audit history; no RS-001 stance is inherited; fresh RS-002 is required
- **rollout disposition**: BLOCKED/PENDING until AC-015 binds the exact approved r10 pair, PuPu candidate, one immutable test/import/package wheel and all eight canonical matrix cells PASS
- **authorization effect**: NONE | contract/proposal formation only; no implementation, test PASS, rollout or production authority
