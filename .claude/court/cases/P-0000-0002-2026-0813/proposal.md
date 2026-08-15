---
case_id: P-0000-0002-2026-0813
boundary_revision_set: sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968+sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
updated_at: 2026-08-14T15:25:00-07:00
---

# 方案

## P-0000-0002-2026-0813
- **主 owner**: code-owner-unchain
- **目标结果**: 以不可变 provider-call ledger 为唯一计量事实源，生成可幂等重建的整棵 Run Bundle，并完成 PuPu 严格消费、持久化、显示、暂停终结与价格快照成本闭环。
- **non_goals**: 不内联 raw prompt、隐藏推理、secret 或无界 tool output；不从 legacy 顶层累计猜测 child/graph usage；不在请求热路径抓价格网页；不删除 provider 网络 retry、exact-once recovery 或 live stream reattach；不恢复已由用户交互暂停的旧 Run。
- **contract_set**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **state character**: STATEFUL
- **实施范围**: Unchain provider usage normalization、provider-call receipt、ExecutionIdentity 归因、Run Bundle reducer、child/aux topology、interaction abandon 与窄化的历史 resolution repair；PuPu graph/root materialization、strict SSE projection、Electron keyed storage、renderer selector、no-auto-resume orchestration、official Context interaction ingress 与 cold/fresh repair；offline signed price catalog 与list-price estimate/reconciliation provenance。
- **owner slots**:
  - SLOT-001 | code-owner-unchain | ProviderCallReceipt、Run topology、RunBundle reducer、interaction cancel | FILLED | LEAD
  - SLOT-002 | code-owner-runtime | Graph/SSE/locked-core/pricing catalog integration | FILLED | HS-001
  - SLOT-003 | code-owner-electron | Bundle persistence、IPC 与 migration | FILLED | HS-002
  - SLOT-004 | code-owner-chat-core | done projection、keyed upsert 与 no-auto-resume | FILLED | HS-003
  - SLOT-005 | code-owner-chat-bubble | canonical usage selector/display | FILLED | HS-004
- **关键实施约束**: 新 v1 core 字段 CLOSED，唯一开放点为 namespaced extensions；unknown 数值为 null 而非 0；root/graph 用 unique provider_call_id 集合并集求和；bundle 与 SQLite 投影使用 deterministic identity + revision/digest UPSERT；历史 legacy 只能标记 partial。
- **可逆性**: 先以版本化 schema、shadow dual-write 与 keyed projection 接入；旧 token usage 保留只读 fallback；active cutover 前可关闭新 producer/consumer；不删除旧 resume API，只取消产品自动触发。
- **回滚/补救**: 保留 ledger、bundle 与 journal evidence，关闭 v1 active consumer 并回退 legacy presentation；暂停策略切换前对旧 pending interaction 执行 exact source_run_id 终结；价格目录无匹配时回退 cost unavailable 而非估算。
- **验收标准**:
  - AC-001 | OpenAI、Anthropic、Hyperspace、Ollama 真实 usage fixture 经 strict producer 生成 canonical disjoint usage，OpenAI cache write/reasoning 正确采集，缺失为 null
  - AC-002 | wrong schema/version/identity/revision、unknown core key 与非法 token 不变式在正确边界 fail closed
  - AC-003 | normal root 多 iteration 及 observation/selector/web extract/repair 每个真实 send 都有唯一 purpose/call receipt，root 用 call-set union 求和
  - AC-004 | 三节点 graph、recipe-ref child、serial/parallel subagent 的 root 合计等于全部唯一 call_id 并集，不 last-only、不 double-sum
  - AC-005 | duplicate receipt、provider retry/recovery、cold replay 与 uncertain result 不重复计量，缺失 usage 使 coverage incomplete 而不伪装 0
  - AC-006 | suspend 立即 sealed/cancelled，冷启不自动 resume，用户新 message 建立新 run/bundle 并保持 strict provider tool transcript 合法
  - AC-007 | duplicate/reconnect done 以 bundle_id+revision 幂等 UPSERT；同 revision 异 digest、stale revision 与半写入事务均被拒绝
  - AC-008 | Chat Bubble/Settings 只消费 canonical usage；OpenAI cached input 不重加，reasoning 作 output 子集，null 不显示为 0
  - AC-009 | 签名离线价格目录使用官方来源、effective time 和 immutable snapshot；未知 model/tier cost unavailable；新目录不重算历史；官方 bucket 只做对账而不伪称 per-run actual
  - AC-010 | legacy 只读记录明确标记 partial；shadow/rollback 不破坏旧 UI；最终候选用 exact PuPu revision + unchain lock 跑完 REQUIRED 矩阵
  - AC-011 | Bundle 与 usage slices 在 Electron 单事务中替换，故障注入后不留半状态，clear/reset 不误删 legacy evidence
  - AC-012 | Bundle/SSE/SQLite 不包含 raw prompt、secret、reasoning_items、provider request 或 artifact bytes，超限与禁止字段严格拒绝
  - AC-013 | 历史 descriptor-incomplete `interaction_resolved` 仅能被同 scope、同 interaction、唯一且更晚的 descriptor-bound canonical `interaction.resolved` 修复；compiler、graph recovery、generation rebase 与 PuPu cold/fresh poison 路径一致，reverse/foreign/multiple/conflict 均 fail closed，答案进入 transcript 且 0 auto-resume/duplicate provider send；runtime feature capability 缺失时 active rollout 保持 INCOMPLETE，不以 Git SHA allowlist 放行
- **boundary obligations**: BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003, SEQ-004, SEQ-005, SEQ-006, SEQ-007
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | Provider response 到 atomic ProviderCallReceipt
- **producer**: OpenAI/Anthropic/Hyperspace/Ollama 真实 SDK/HTTP final usage response
- **producer owner**: code-owner-unchain
- **consumer**: Unchain provider-call ledger strict admission
- **consumer owner**: code-owner-unchain
- **canonical representation**: unchain.provider_call_usage.v1 canonical JSON，含 exact identity、purpose、status、disjoint usage、raw usage digest/ref 与 price snapshot ref
- **consumer projection**: 一个真实 network send 对应一个 deterministic provider_call_id 及 immutable receipt
- **admission policy**: VERSIONED
- **admission details**: v1 core exact-key CLOSED，namespaced extensions 是唯一开放点，所有 count 非负且 unknown 保持 null
- **unknown input behavior**: stable provider_call_usage_schema_invalid，不写 ledger
- **failure semantics**: fail closed；uncertain send 单独记录且不猜测 usage
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-001, AC-003
- **negative acceptance**: AC-002, AC-005, AC-012

### BC-002 | Immutable receipts/topology 到 RunBundle
- **producer**: 按 ExecutionIdentity 归因的 provider-call receipts 和 parent/child/graph topology
- **producer owner**: code-owner-unchain
- **consumer**: Unchain deterministic RunBundle reducer/materializer
- **consumer owner**: code-owner-unchain
- **canonical representation**: unchain.run_bundle.v1，identity/lifecycle/provider_calls/children/aggregation/metrics/evidence 及 namespaced extensions
- **consumer projection**: provider_call_set_union.v1 对 direct/descendant/all 唯一 call_id 集合求和并产生 coverage
- **admission policy**: VERSIONED
- **admission details**: deterministic bundle_id，revision 单调，same revision digest 唯一，unknown 总量不得写成 0
- **unknown input behavior**: stable run_bundle_schema_invalid，不产生 partial v1
- **failure semantics**: fail closed；保留 atomic receipts 供后续重投影
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-003, AC-004
- **negative acceptance**: AC-002, AC-005

### BC-003 | Unchain RunBundle 到 PuPu sidecar
- **producer**: KernelRunResult/run materializer 返回的 canonical unchain.run_bundle.v1
- **producer owner**: code-owner-unchain
- **consumer**: PuPu run_bundle_adapter strict host projection
- **consumer owner**: code-owner-runtime
- **canonical representation**: exact locked-core RunBundle v1 与 renderer-safe projection
- **consumer projection**: 校验 execution/root/attempt identity 与 schema，仅投影允许的 bundle/usage/cost/evidence refs
- **admission policy**: CLOSED
- **admission details**: v1 存在即必须严格通过；非法 v1 不可回退 legacy
- **unknown input behavior**: context-independent typed run_bundle_projection_invalid
- **failure semantics**: fail closed，不发送伪造 done bundle，不改 graph checkpoint output schema
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-001
- **positive acceptance**: AC-003, AC-004, AC-010
- **negative acceptance**: AC-002, AC-012

### BC-004 | PuPu sidecar completion 到 renderer
- **producer**: v4 stream_summary/done renderer-safe RunBundle projection
- **producer owner**: code-owner-runtime
- **consumer**: chat-core stream reducer 与 Bundle admission
- **consumer owner**: code-owner-chat-core
- **canonical representation**: versioned SSE done.bundle 与 bundle_id/revision/digest
- **consumer projection**: 一个 done 只触发一次 keyed Bundle upsert，不再 append legacy token total
- **admission policy**: CLOSED
- **admission details**: exact safe fields、字节上限和 identity 一致；duplicate 容许同 digest
- **unknown input behavior**: stable run_bundle_stream_invalid 并保留原 run error
- **failure semantics**: fail closed，不持久半 bundle，不泄漏 raw provider payload
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: HS-001
- **consumer owner confirmation**: HS-003
- **positive acceptance**: AC-007, AC-010
- **negative acceptance**: AC-002, AC-012

### BC-005 | Renderer 到 Electron Bundle store
- **producer**: chat-core 已验证 RunBundle 及 normalized usage slices
- **producer owner**: code-owner-chat-core
- **consumer**: Electron settings-storage run bundle transaction boundary
- **consumer owner**: code-owner-electron
- **canonical representation**: run_bundle_records + run_bundle_usage_slices v1，bundle_json/digest 与 composite slice identity
- **consumer projection**: bundle_id 主键、revision 单调、同 revision 同 digest already_current，新 revision 事务替换 slices
- **admission policy**: CLOSED
- **admission details**: IPC/preload/main 三端共用 exact schema 与字节上限
- **unknown input behavior**: bundle_revision_conflict/stale_revision/run_bundle_storage_invalid
- **failure semantics**: transaction rollback，无 bundle/slice 半状态，legacy rows 不变
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: HS-003
- **consumer owner confirmation**: HS-002
- **positive acceptance**: AC-007, AC-011
- **negative acceptance**: AC-002, AC-012

### BC-006 | Canonical Bundle usage 到 Chat Bubble/Settings
- **producer**: chat-core canonical run usage selector
- **producer owner**: code-owner-chat-core
- **consumer**: chat-bubble TokenSummary 与 Settings aggregation/filter UI
- **consumer owner**: code-owner-chat-bubble
- **canonical representation**: normalized synchronous_tree/direct/descendant usage 与 provider/model/tier slices
- **consumer projection**: input total 显示一次，cache read/write 仅注释，reasoning 不加到 output/total，null 显示–
- **admission policy**: CLOSED
- **admission details**: provider-specific 语义仅存在 selector compatibility 层，JSX 不自行求和
- **unknown input behavior**: 显示 unavailable/partial 而不猜测或崩溃
- **failure semantics**: fail closed to partial presentation，不改写持久记录
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: HS-003
- **consumer owner confirmation**: HS-004
- **positive acceptance**: AC-008
- **negative acceptance**: AC-002, AC-012

### BC-007 | Official pricing source 到 immutable price snapshot/cost
- **producer**: offline reviewed catalog ingestor 对 OpenAI/Anthropic 官方 pricing source 的版本化输出
- **producer owner**: code-owner-runtime
- **consumer**: Unchain provider-call cost estimator/reconciliation provenance schema
- **consumer owner**: code-owner-unchain
- **canonical representation**: signed pricing_catalog.v1 + pricing_snapshot.v1，currency/effective interval/rates/modifiers/source digest/catalog revision
- **consumer projection**: call completion 绑定 immutable snapshot 并用 integer nano-USD/decimal 计算 list_price_estimate
- **admission policy**: VERSIONED
- **admission details**: 官方网页采集只生成 review proposal，运行时仅信任签名 last-known-good，model/tier 必须 exact match
- **unknown input behavior**: cost status unavailable，不套用相似 model 价格
- **failure semantics**: 不影响 usage 账本；cost 为 null 并带 reason；官方 admin cost 仅作 bucket reconciliation
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: HS-001
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-009
- **negative acceptance**: AC-002

### BC-008 | Pending interaction 到 sealed old run 与 fresh user run
- **producer**: Unchain exact source_run_id pending interaction cancel/application/checkpoint removal
- **producer owner**: code-owner-unchain
- **consumer**: PuPu chat-core authoritative lookup 与 normal send orchestration
- **consumer owner**: code-owner-chat-core
- **canonical representation**: durable interaction cancellation receipt + suspended RunBundle + new run continued_from_run_id
- **consumer projection**: receipt 终结旧 run 并解锁 composer；lookup 不发 resume_interaction；新 message 用 normal send 建新 identity
- **admission policy**: CLOSED
- **admission details**: source_run_id、fence/revision、interaction_id 精确绑定；provider recovery 与 live_continues 不变
- **unknown input behavior**: typed interaction cancel conflict/not-found，新 run 不得与旧 pending 并发
- **failure semantics**: fail closed，保留旧 pending 可观测，不由前端先清状态
- **identity/version binding**: producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-003
- **positive acceptance**: AC-006
- **negative acceptance**: AC-002, AC-005

### BC-009 | Historical malformed resolution 到 canonical repair consumers
- **producer**: PuPu 历史 generic lane 的 descriptor-incomplete `interaction_resolved`，随后由 official `ContextInputIngress.persist(HostResolvedInteractionInput)` 产生 descriptor-bound `interaction.resolved`
- **producer owner**: code-owner-unchain
- **consumer**: Unchain ContextCompiler、GraphRecoveryService 与 SQLiteGenerationRebaseService
- **consumer owner**: code-owner-unchain
- **canonical representation**: exact 两事件 repair pair；legacy underscore 更早且 incomplete，canonical dotted 唯一、更晚、同 execution/generation/attempt/interaction，完整 response descriptor 的 content_ref 同时存在于本事件 authorized resource_refs
- **consumer projection**: compiler/rebase抑制被修复 legacy；graph未存在legacy resume admission时选择canonical cursor，已admitted legacy cursor保持幂等；三者共享同一closed pair policy
- **admission policy**: CLOSED
- **admission details**: 仅 exact 2-event、canonical ordinal大于legacy、full scope一致、descriptor/resource authority完整时兼容；不得 raw 修改历史 event 或放宽单个 malformed resolution
- **unknown input behavior**: 0或多个canonical candidate、reverse order、cross-scope/interaction、foreign ref、partial/conflict、complete legacy均保留原typed fail-closed错误
- **failure semantics**: 不编译provider transcript、不推进graph/rebase、不清除pending authority；保留journal供official repair/retry
- **identity/version binding**: runtime feature `unchain.context.interaction_resolution_compat.v1` 是兼容准入；Git revision仅作telemetry，不作allowlist；诊断 expected pair为producer sha256:69aa52362724fdb9d8f993561906b33f2063e54a82782300856aabf2239dc968 + consumer sha256:2e144cee5fb1498b59cd6a6ee5b534f2668e4fe439aa2a0bc8752d9f354abac5；feature manifest与exact deployed-pair证据完成前active rollout为INCOMPLETE
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-013
- **negative acceptance**: AC-013

### SEQ-001 | Provider send/retry/recovery 账本序列
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: execution_id + attempt_id + owner_run_id + provider_call_id + retry_ordinal
- **initial state**: 没有 send lease/result receipt 且 usage unknown
- **ordered events**: acquire send identity → actual send → final/failed/uncertain receipt → duplicate recovery/reprojection
- **expected observations**: 每个 actual send 唯一，result replay 不重复，unknown 保持 null/coverage incomplete
- **persistence boundary**: Unchain durable provider-call ledger 与 artifact store
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-001, AC-003, AC-005
- **negative acceptance**: AC-002, AC-012
- **first use**: REQUIRED | AC-001, AC-003
- **repeat**: REQUIRED | AC-005
- **retry**: REQUIRED | AC-005
- **resume**: REQUIRED | AC-005
- **restart**: REQUIRED | AC-005
- **reset**: NOT_APPLICABLE | provider call receipt 为 immutable fact，不支持 reset
- **rollback**: REQUIRED | AC-010

### SEQ-002 | Root/Graph/Subagent/Auxiliary topology 序列
- **owner**: code-owner-runtime
- **owner confirmation**: HS-001
- **identity key**: execution_id + root_run_id + parent_run_id + owner_run_id + relation/node/call identity
- **initial state**: root bundle 无 child/call，coverage 仅能由 receipt 集合推导
- **ordered events**: root first turn → auxiliary call → serial/parallel child → graph step → child completion/restart → root materialize
- **expected observations**: direct/descendant/all call sets 不重叠，Graph 包含全部 step，child 独立可查且 root 只纳入一次
- **persistence boundary**: Unchain ledger + PuPu graph identity projection，Graph checkpoint output v1 不改
- **boundary contracts**: BC-002, BC-003
- **positive acceptance**: AC-003, AC-004
- **negative acceptance**: AC-002, AC-005
- **first use**: REQUIRED | AC-003
- **repeat**: REQUIRED | AC-004, AC-005
- **retry**: REQUIRED | AC-005
- **resume**: REQUIRED | AC-004, AC-005
- **restart**: REQUIRED | AC-004, AC-005
- **reset**: NOT_APPLICABLE | immutable call topology 不支持 reset，只允许新 projection revision
- **rollback**: REQUIRED | AC-010

### SEQ-003 | SSE duplicate/reconnect 到 Electron keyed projection
- **owner**: code-owner-electron
- **owner confirmation**: HS-002
- **identity key**: bundle_id + revision + bundle_digest + usage slice composite key
- **initial state**: Bundle 不存在，legacy token rows 保留只读
- **ordered events**: first done → same done replay → reconnect replay → newer revision → stale/conflict/failure injection
- **expected observations**: 逻辑 run 数不增，same digest already_current，新 revision 原子替换，stale/conflict 无写入
- **persistence boundary**: preload/IPC/main/settings SQLite transaction
- **boundary contracts**: BC-004, BC-005
- **positive acceptance**: AC-007, AC-011
- **negative acceptance**: AC-002, AC-012
- **first use**: REQUIRED | AC-007
- **repeat**: REQUIRED | AC-007
- **retry**: REQUIRED | AC-007, AC-011
- **resume**: REQUIRED | AC-007
- **restart**: REQUIRED | AC-007, AC-011
- **reset**: REQUIRED | AC-011
- **rollback**: REQUIRED | AC-010, AC-011

### SEQ-004 | User interaction pause 到 fresh message run
- **owner**: code-owner-chat-core
- **owner confirmation**: HS-003
- **identity key**: interaction_id + source_run_id + suspended_bundle_id + fresh execution/attempt/run ids
- **initial state**: 旧 run 在 awaiting_interaction 且持有 durable checkpoint/lease
- **ordered events**: pause → user decision/receipt → atomic cancel/seal → reload/lookup → composer unlock → user normal message → fresh run
- **expected observations**: 0 个 resume_interaction 请求，旧 run 不再增长，新 run 仅新增一条 user message 且 provider transcript 合法
- **persistence boundary**: durable interaction journal/execution checkpoint + Context V2 canonical message projection
- **boundary contracts**: BC-008, BC-003, BC-004
- **positive acceptance**: AC-006
- **negative acceptance**: AC-002, AC-005
- **first use**: REQUIRED | AC-006
- **repeat**: REQUIRED | AC-006
- **retry**: REQUIRED | AC-005, AC-006
- **resume**: REQUIRED | AC-006
- **restart**: REQUIRED | AC-006
- **reset**: REQUIRED | AC-006
- **rollback**: REQUIRED | AC-010

### SEQ-005 | Pricing catalog update/reconciliation 序列
- **owner**: code-owner-runtime
- **owner confirmation**: HS-001
- **identity key**: catalog_version + source_digest + effective interval + exact provider/model/tier/modifier key
- **initial state**: 无可信 snapshot，cost unavailable 但 usage 仍可记录
- **ordered events**: official source fetch → parse/change proposal → review/sign/publish → call binds snapshot → catalog update → admin bucket reconcile
- **expected observations**: 运行时不抓网页，历史 estimate 不变，unknown 不套价，bucket adjustment 不冒充 per-run actual
- **persistence boundary**: signed catalog last-known-good store + per-call immutable pricing ref + reconciliation ledger
- **boundary contracts**: BC-007, BC-001, BC-002
- **positive acceptance**: AC-009
- **negative acceptance**: AC-002
- **first use**: REQUIRED | AC-009
- **repeat**: REQUIRED | AC-009
- **retry**: REQUIRED | AC-009
- **resume**: NOT_APPLICABLE | catalog ingestion 是离线 immutable publish job，失败后新起 job 而不 resume
- **restart**: REQUIRED | AC-009
- **reset**: NOT_APPLICABLE | 已绑定历史 snapshot 不得 reset
- **rollback**: REQUIRED | AC-009, AC-010

### SEQ-006 | Shadow rollout/rollback/legacy coexistence
- **owner**: code-owner-runtime
- **owner confirmation**: HS-001
- **identity key**: PuPu revision + unchain-core.lock revision + protocol schema pair + rollout mode
- **initial state**: legacy usage 可读、v1 producer/consumer 仅 shadow dual-write
- **ordered events**: shadow write → exact-pair contract matrix → active read → duplicate/restart soak → rollback → re-enable
- **expected observations**: active 只在 exact pair 全矩阵通过后开启，legacy 显式 partial，rollback 不删 ledger/evidence
- **persistence boundary**: PuPu release lock/build flags + Unchain schema fingerprints + dual-read storage migration
- **boundary contracts**: BC-003, BC-004, BC-005, BC-006, BC-007, BC-008
- **positive acceptance**: AC-010
- **negative acceptance**: AC-002, AC-012
- **first use**: REQUIRED | AC-010
- **repeat**: REQUIRED | AC-010
- **retry**: REQUIRED | AC-010
- **resume**: REQUIRED | AC-010
- **restart**: REQUIRED | AC-010
- **reset**: NOT_APPLICABLE | rollout 使用显式 rollback 而非清空 durable evidence
- **rollback**: REQUIRED | AC-010

### SEQ-007 | Historical interaction poison repair and fresh continuation
- **owner**: code-owner-unchain
- **owner confirmation**: LEAD
- **identity key**: session_id + execution_id + generation_id + attempt_id + interaction_id + legacy/canonical cursor + response content_ref digest
- **initial state**: durable interaction已有权威receipt或cancel application，Context journal含matching request与更早descriptor-incomplete legacy resolution，可能已failed且无active pending/binding
- **ordered events**: official durable receipt admission → exact canonical dotted resolution persist → retry/restart dedupe → compiler/graph recovery/rebase shared winner selection → fresh user message compile/send
- **expected observations**: canonical resolution恰好一次，legacy raw历史不改；旧ask closed、answer descriptor和内容进入transcript；graph cursor/rebase一致；0 auto-resume与0 duplicate provider send；非法pair在任何consumer side effect前失败
- **persistence boundary**: PuPu durable interaction journal与Context V2 SQLite/artifact store，经Unchain compiler、graph checkpoint和generation rebase读取
- **boundary contracts**: BC-008, BC-009
- **positive acceptance**: AC-013
- **negative acceptance**: AC-013
- **first use**: REQUIRED | AC-013
- **repeat**: REQUIRED | AC-013
- **retry**: REQUIRED | AC-013
- **resume**: REQUIRED | AC-013
- **restart**: REQUIRED | AC-013
- **reset**: REQUIRED | AC-013
- **rollback**: REQUIRED | AC-013

### PS-001 | 2026-08-13T22:30:00-07:00
- **supersedes**: null
- **included contributions**: HS-001, HS-002, HS-003, HS-004
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:9bfe4d8c537cd0777aa107bc236b7c3905208f4c43f08d0be53f454c4a046408
- **content hash**: sha256:c613577536c25a2858425fb76f519494112c9e8a192de187b5a19972acebe822
- **formed_by**: code-owner-unchain

### PS-002 | 2026-08-14T15:25:00-07:00
- **supersedes**: PS-001
- **included contributions/amendments**: 2026-08-14 durable interaction incident diagnosis、systemic host/runtime/compiler repair authorization、adversarial cold/retry/race evidence
- **changed blocks**: 实施范围、AC-013、BC-008、BC-009、SEQ-004、SEQ-006、SEQ-007、active rollout disposition
- **dependent review blocks**: code-owner-unchain、code-owner-runtime、code-owner-chat-core、BC-008、BC-009、SEQ-004、SEQ-006、SEQ-007、AC-013
- **boundary object hash**: sha256:9ac70a9190701393a49fd808eb7970074c2c45aa520804c4482e8f898e9f2a14
- **content hash**: sha256:a96153d7b426e1df4c81e568d7af52388cf3ccae0b43ce71162660f7eedf255a
- **formed_by**: code-owner-unchain
