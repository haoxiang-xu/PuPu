---
case_id: P-0000-0003-2026-0814
boundary_revision_set: sha256:9de45df3769b73011ee9fd6001786db5ea8a12e11714f0484c1cad12051c5da9+sha256:446c1f4478c78b97d3f00404fbe3c6a8605920dc80826384e4adc529e647f2b4
updated_at: 2026-08-14T17:52:24-07:00
---

# 方案

## P-0000-0003-2026-0814
- **主 owner**: code-owner-runtime
- **目标结果**: 以运行时协议兼容矩阵取代 Unchain Git SHA lock，并以自动生成的 immutable artifact digest 保证测试/发布同物，而不把 digest 用作运行时 allowlist。
- **non_goals**: 不允许 malformed/missing/unsupported protocol 进入 V2；不保留 exact_sha、dirty checkout 或 dev bypass 作为第二权威；不从公开 Git ref 推断已加载 runtime capability。
- **实施范围**: Unchain code-backed manifest；sidecar与Electron双重 strict validation；旧 lock/probe/bypass 删除；单次 wheel artifact 的测试/打包/report连续性；真实 packaged health smoke。
- **contract_set**: BC-001, BC-002, BC-003
- **owner slots**:
  - SLOT-001 | code-owner-runtime | sidecar integration、release artifact continuity、build/report/docs | FILLED | S-0001
  - SLOT-002 | code-owner-unchain | code-backed manifest producer、strict parser/digest/tests | FILLED | S-0003
  - SLOT-003 | code-owner-electron | independent manifest validation、readiness/service projection/tests | FILLED | S-0005
- **关键步骤与依赖**:
  1. Unchain 实际加载模块导出 closed manifest 与可重算 digest，不读取 Git 或外部 capability JSON；major/minor限定为跨Python/JavaScript一致的非负safe integer，并显式宣告本次durable interaction事故所依赖的resolution compatibility与exact interaction CAS。
  2. sidecar 从已 import 的 Unchain 读取 manifest，按 major/minimum minor/required feature subset校验；off 保持 legacy 可用，不兼容时 V2 fail closed。
  3. Electron 对 sidecar 投影独立重算 digest和兼容矩阵；删除 SHA/bypass分支及通用 unavailable 误映射。
  4. 删除 `unchain-core.lock.json` 与 pinned checkout双权威；release只选择一次 source ref，构建一个 wheel，测试和各平台打包消费同一 artifact bytes。
  5. package binary真实启动并验证 `/health` 与 `/context/v2/status`；report缺 artifact digest、protocol digest或非零执行证据时失败。
- **风险**: 兼容矩阵过宽可能放行破坏性 minor；过窄会重复旧锁问题；package若仍从source重装会破坏artifact连续性；半迁移会造成旧/new双门。
- **可逆性**: active rollout 前可整体撤回候选；不允许只恢复 SHA gate 或只删除 consumer gate。已发布不兼容 runtime 通过明确协议错误停在V2 side-effect前。
- **回滚/补救方式**: 回退整组 producer+sidecar+Electron+release artifact candidate；保留旧历史记录只读；不得恢复 mutable ref/commit allowlist作为runtime admission。
- **验收标准**:
  - AC-001 | 实际加载的 Unchain manifest在Python严格round-trip，digest mutation、重复/乱序、未知core字段、bool/负数/大于2^53-1的version均拒绝。
  - AC-002 | sidecar与Electron对同一真实producer manifest独立通过；缺协议、错误major、过低minor、缺feature（含`context_memory.interaction_resolution_compat`与`durable_interaction.expected_interaction_id_cas`）、坏digest/shape均在side-effect前拒绝。
  - AC-003 | 两个不同Git revision但同兼容协议均ready；相同revision但不兼容协议失败；全仓不存在revision equality/dirty/bypass compatibility decision。
  - AC-004 | compatible higher minor、extra optional feature/protocol通过；required feature集合不被extra掩盖。
  - AC-005 | Memory V2 off/legacy chat仍可用；sticky V2/RunBundle遇不兼容不得静默降级；旧 `/chat/stream` 保持426。
  - AC-006 | deterministic tests只构建一次Unchain wheel，Context V2/RunBundle矩阵与所有package job记录并验证同一artifact SHA-256及manifest digest。
  - AC-007 | macOS arm64/x64、Windows、Linux packaged sidecar都真实启动并通过authenticated health/status protocol smoke；未启动、0 test或mock-only均失败。
  - AC-008 | release report缺protocol/artifact evidence、artifact digest不一致、dirty/unknown source provenance或required check skipped均INCOMPLETE/FAIL。
  - AC-009 | 删除旧lock、Git runtime probe、exact_sha/dev_bypass/dirty_dev_checkout和相关环境变量、required check、文档双权威；不存在可写legacy新send回退。
- **boundary obligations**: BC-001, BC-002, BC-003
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003, SEQ-004
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | Unchain loaded code 到 sidecar runtime protocol admission
- **producer**: code-backed `unchain.runtime_protocol_manifest.v1` builder/strict parser
- **producer owner**: code-owner-unchain
- **consumer**: PuPu sidecar Context/Memory V2 capability resolver
- **consumer owner**: code-owner-runtime
- **canonical representation**: `contracts/unchain-runtime-protocol-producer-v1.json`冻结的closed manifest、排序、0..2^53-1 safe integer version domain和domain-separated digest
- **consumer projection**: major exact、runtime minor >= required minor、required feature subset；revision/checkout state只作release provenance
- **admission policy**: VERSIONED
- **admission details**: 顶层与item key精确；protocol/features唯一规范排序；major/minor必须为0..2^53-1且bool非法；digest独立重算；未知额外protocol/feature允许但不满足required项；`context_memory.interaction_resolution_compat`与`durable_interaction.expected_interaction_id_cas`是required feature
- **unknown input behavior**: `unchain_runtime_protocol_manifest_invalid`或对应missing/major/minor/feature稳定错误
- **failure semantics**: Memory V2/RunBundle新写在任何side effect前fail closed；off/legacy chat不要求manifest
- **identity/version binding**: producer sha256:9de45df3769b73011ee9fd6001786db5ea8a12e11714f0484c1cad12051c5da9 + consumer sha256:446c1f4478c78b97d3f00404fbe3c6a8605920dc80826384e4adc529e647f2b4
- **producer owner confirmation**: HS-001
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-001, AC-003, AC-004
- **negative acceptance**: AC-002, AC-005, AC-009

### BC-002 | Sidecar protocol status 到 Electron readiness
- **producer**: sidecar `/health`与`/context/v2/status` capability projection
- **producer owner**: code-owner-runtime
- **consumer**: Electron Memory V2 rollout/readiness validator
- **consumer owner**: code-owner-electron
- **canonical representation**: 完整`unchain.runtime_protocol_manifest.v1`与sidecar verdict reason/verification/immutable字段
- **consumer projection**: Electron独立strict parse、digest重算、required matrix和rollout/store checks
- **admission policy**: CLOSED
- **admission details**: runtime manifest shape/digest与success verdict必须一致；revision为空或变化不影响compatibility
- **unknown input behavior**: `context_v2_unchain_protocol_invalid/incompatible`；不得压成可重试sidecar transport错误
- **failure semantics**: 不发起V2 mutation/provider send，不把sticky V2转legacy
- **identity/version binding**: producer sha256:9de45df3769b73011ee9fd6001786db5ea8a12e11714f0484c1cad12051c5da9 + consumer sha256:446c1f4478c78b97d3f00404fbe3c6a8605920dc80826384e4adc529e647f2b4
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: HS-002
- **positive acceptance**: AC-002, AC-003, AC-004
- **negative acceptance**: AC-005, AC-009

### BC-003 | Selected Unchain source 到 tested and shipped artifact
- **producer**: deterministic job单次构建的immutable Unchain wheel与source revision telemetry
- **producer owner**: code-owner-runtime
- **consumer**: Context/RunBundle contract matrices、各平台PyInstaller build、package smoke和release report
- **consumer owner**: code-owner-runtime
- **canonical representation**: wheel bytes SHA-256 + runtime manifest digest + source revision telemetry
- **consumer projection**: 每个consumer核对artifact digest与manifest digest；runtime compatibility仍只看manifest requirements
- **admission policy**: CLOSED
- **admission details**: package不得独立checkout/rebuild Unchain；build scripts显式消费`UNCHAIN_ARTIFACT_PATH`
- **unknown input behavior**: artifact/digest/matrix evidence缺失或不一致时release INCOMPLETE
- **failure semantics**: 不发布部分平台、不把source SHA相同冒充artifact相同
- **identity/version binding**: producer sha256:9de45df3769b73011ee9fd6001786db5ea8a12e11714f0484c1cad12051c5da9 + consumer sha256:446c1f4478c78b97d3f00404fbe3c6a8605920dc80826384e4adc529e647f2b4
- **producer owner confirmation**: LEAD
- **consumer owner confirmation**: LEAD
- **positive acceptance**: AC-006, AC-007, AC-008
- **negative acceptance**: AC-003, AC-009

### SEQ-001 | Startup handshake before V2 effects
- **owner**: code-owner-runtime
- **owner confirmation**: LEAD
- **identity key**: sidecar process identity + manifest digest + rollout fingerprint
- **initial state**: sidecar已spawn但V2 capability未确认
- **ordered events**: import actual Unchain → build/validate manifest → authenticated health/status → Electron independent validation → allow V2 traffic
- **expected observations**: 不兼容时0个V2 mutation/provider send；兼容时ready且revision不参与决定
- **persistence boundary**: sidecar health/readiness cache与Electron runtime state
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-001, AC-002, AC-003
- **negative acceptance**: AC-005, AC-009
- **first use**: REQUIRED | AC-001, AC-002
- **repeat**: REQUIRED | AC-003, AC-004
- **retry**: REQUIRED | AC-002
- **resume**: REQUIRED | AC-005
- **restart**: REQUIRED | AC-002, AC-003
- **reset**: REQUIRED | AC-005
- **rollback**: REQUIRED | AC-009

### SEQ-002 | Compatible and incompatible runtime upgrades
- **owner**: code-owner-unchain
- **owner confirmation**: HS-001
- **identity key**: protocol id + major + minor + required feature set
- **initial state**: PuPu requirements与当前manifest兼容
- **ordered events**: compatible higher minor/extra feature → restart → ready；breaking major/missing feature → restart → fail closed；PuPu requirements升级 → ready
- **expected observations**: 兼容升级无需编辑lock；breaking变更必须由PuPu显式增加支持
- **persistence boundary**: code-backed producer与PuPu requirements source
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-003, AC-004
- **negative acceptance**: AC-002, AC-005, AC-009
- **first use**: REQUIRED | AC-003
- **repeat**: REQUIRED | AC-004
- **retry**: NOT_APPLICABLE | compatibility是纯函数，不产生可重试外部effect
- **resume**: REQUIRED | AC-005
- **restart**: REQUIRED | AC-003, AC-004
- **reset**: NOT_APPLICABLE | manifest没有mutable reset状态
- **rollback**: REQUIRED | AC-009

### SEQ-003 | Single artifact through test and package
- **owner**: code-owner-runtime
- **owner confirmation**: LEAD
- **identity key**: artifact SHA-256 + manifest digest + release run id
- **initial state**: selected source ref已checkout但未构建artifact
- **ordered events**: build wheel once → hash/import manifest → contract matrices → upload → each package downloads/verifies → builds → starts binary → health smoke → report merge
- **expected observations**: 所有平台artifact hash相同；任一缺失/不一致/未启动使release失败
- **persistence boundary**: GitHub artifact store、package outputs与release reports
- **boundary contracts**: BC-003
- **positive acceptance**: AC-006, AC-007, AC-008
- **negative acceptance**: AC-003, AC-009
- **first use**: REQUIRED | AC-006
- **repeat**: REQUIRED | AC-007
- **retry**: REQUIRED | AC-006, AC-007
- **resume**: NOT_APPLICABLE | workflow job不复用运行中sidecar状态
- **restart**: REQUIRED | AC-007
- **reset**: REQUIRED | AC-008
- **rollback**: REQUIRED | AC-009

### SEQ-004 | Missing protocol with legacy and sticky state
- **owner**: code-owner-runtime
- **owner confirmation**: LEAD
- **identity key**: chat/session execution mode + sticky V2 marker + runtime manifest verdict
- **initial state**: runtime protocol missing/malformed/incompatible
- **ordered events**: legacy/off new chat → legacy path allowed；sticky V2或v2/v4 new write → explicit protocol error；old `/chat/stream` write → 426
- **expected observations**: 无silent downgrade、无partial RunBundle/Context journal，错误原因稳定可见
- **persistence boundary**: chat mode/sticky metadata、Context V2 journal与RunBundle ledger
- **boundary contracts**: BC-001, BC-002
- **positive acceptance**: AC-005
- **negative acceptance**: AC-002, AC-009
- **first use**: REQUIRED | AC-005
- **repeat**: REQUIRED | AC-005
- **retry**: REQUIRED | AC-005
- **resume**: REQUIRED | AC-005
- **restart**: REQUIRED | AC-005
- **reset**: REQUIRED | AC-005
- **rollback**: REQUIRED | AC-009

### PS-001 | 2026-08-14T09:50:00-07:00
- **supersedes**: null
- **included contributions/amendments**: S-0003, S-0005; Chief runtime-protocol/no-SHA direction; read-only lock/runtime/package audit
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:efc07ce0a053522757f6c7d4c380c28e96f5bcb057031d2a3339e9f8b2277c0b
- **content hash**: sha256:48a27b002028f0792d312c28d59d0d9cb63424f8476853d25cf6084eb91e10cc
- **formed_by**: code-owner-runtime

### AM-001
- **提出发言**: 2026-08-14 Chief Judge incident-protocol correction
- **target**: BC-001, BC-002, AC-001, AC-002
- **影响字段**: producer/consumer required feature matrix、version integer domain、status projection
- **修正内容**: 新增`context_memory.interaction_resolution_compat`与`durable_interaction.expected_interaction_id_cas`为required feature；major/minor收紧为0..2^53-1且bool非法；sidecar唯一投影改为`runtime_protocol_*`字段及diagnostic-only revision/source
- **修正理由**: PS-001形成于durable interaction事故修复前；若不把这两项协议能力写入manifest，旧core可能在通过旧矩阵后于interaction resolution/cancel路径失败

### AM-002
- **提出发言**: 2026-08-14 runtime protocol parity review
- **target**: contracts/unchain-runtime-protocol-producer-v1.json、contracts/pupu-runtime-protocol-consumer-v1.json、AC-001、AC-002
- **影响字段**: manifest string domain
- **修正内容**: 所有manifest string必须是可由strict UTF-8编码的非空Unicode scalar sequence并保持NFC；lone surrogate归一为typed manifest-invalid；合法NFC空白不trim也不拒绝
- **修正理由**: Python `str`可包含lone surrogate；若只检查NFC，producer/sidecar会在canonical ordering阶段泄漏raw `UnicodeEncodeError`，与Electron/release strict consumer不一致

### PS-002 | 2026-08-14T15:55:00-07:00
- **supersedes**: PS-001
- **included contributions/amendments**: AM-001、AM-002、2026-08-14 durable interaction incident修复与跨语言consumer审查
- **changed blocks**: contracts/unchain-runtime-protocol-producer-v1.json、contracts/pupu-runtime-protocol-consumer-v1.json、关键步骤、AC-001、AC-002、AC-005、BC-001、SEQ-004、sidecar sticky admission与`/chat/stream/v2|v4` pre-effect gate
- **dependent review blocks**: code-owner-runtime、code-owner-unchain、code-owner-electron、BC-001、BC-002、SEQ-001、SEQ-002、SEQ-004、AC-001、AC-002、AC-003、AC-004、AC-005、AC-009
- **boundary object hash**: sha256:a4c59962b01d13426e06f1964731fab1e762888f0cc85a9035c1ec1aeb38dad7
- **content hash**: PENDING_CANONICALIZATION_SPEC
- **governance status**: BLOCKED | 当前boundary规范与canonical tooling未定义可重算的PS content-hash domain/bytes；不得用占位值或自创算法冒充已冻结快照，PS-002未获active rollout authority
- **formed_by**: code-owner-runtime

### AM-003
- **提出发言**: 2026-08-14 chat deletion outbox SQLite scope closure incident investigation
- **target**: 新增BC-004、SEQ-005、AC-010至AC-018；扩充BC-001/BC-002 required feature matrix
- **影响字段**: loaded runtime feature、PuPu deletion outbox到Unchain SQLite durable boundary、owner scope authority、extension table deletion/retention、重放与防复活语义
- **修正内容**: required feature新增`context_memory.chat_deletion_sqlite_scope_closure`；PuPu adapter必须声明精确的owner-scoped deletion与retained provenance表，Unchain Core必须在单一SQLite事务中完成schema/owner/scope/FK验证、tombstone、host admission与SQLite scope删除；无lifecycle只在全部known owner evidence为零时生成空scope；外部vector point存在时保留`external_receipt_id`并fail closed
- **范围限定**: 本feature只证明共享SQLite中的scope closure、durable tombstone、host admission清理与provenance防篡改；object bytes GC与外部vector physical GC仍为pending non-goal，不得以删除本地point或丢失external receipt冒充完成
- **修正理由**: 真实13条pending deletion中9条在`DELETE executions`被未纳入计划的host-generation FK回滚，且RunBundle、vector local metadata、PuPu admission与retained ownership未被一个声明式闭包统一建模；继续逐表补丁会重复产生静默残留、错误成功或冷重放漂移
- **governance status**: AMENDMENT_DRAFT | 继承PS-002的BLOCKED状态；未生成新PS、boundary hash、content hash或ruling，不授予active rollout

### BC-004 | PuPu chat deletion outbox到Unchain SQLite scope deletion
- **producer**: PuPu deletion outbox entry、ownership lifecycle resolver与`memory_v2_unchain_deletion_adapter`精确extension declarations
- **producer owner**: code-owner-runtime
- **consumer**: 实际加载Unchain的`SQLiteChatDeletionV2Service`
- **consumer owner**: code-owner-unchain
- **canonical representation**: closed `ChatDeletionScope(owner_chat_id, execution_ids, space_ids, binding_ids)`、稳定`operation_id`、ordered `owner_scoped_deletion_tables`、exact `retained_scope_tables`及`retained_owner_child_tables(parent, join_column)`；owner与scope identifiers均按Core canonical identifier domain处理
- **consumer projection**: Core在`BEGIN IMMEDIATE`内重验exact table-name closure、scoped-column declarations、known optional table-group完整性、所有deletion-table FK顺序、retained owner双向scope authority、空scope owner evidence与external vector point；验证通过后同事务写tombstone/scope evidence、按child-first顺序删除owner extension与SQLite scope rows并冻结receipt
- **admission policy**: VERSIONED
- **admission details**: loaded runtime manifest必须包含`context_memory.chat_deletion_sqlite_scope_closure`；请求shape与extension declaration为CLOSED；revision/source path仅作telemetry，不参与admission；unknown table/schema/FK/declaration一律fail closed，不做动态猜测或通配DELETE
- **unknown input behavior**: 缺feature在outbox mutation前报告runtime protocol incompatible；unknown/incomplete SQLite closure映射为稳定的non-success deletion result并保留outbox pending，不写部分tombstone、不确认`context_done`
- **failure semantics**: preflight或事务内任一步失败时完整rollback；commit后响应丢失由同scope/operation冷重放验证immutable tombstone evidence并重清owner extension；scope或digest漂移为conflict；retained ownership provenance在tombstone后禁止INSERT/UPDATE/DELETE
- **identity/version binding**: `context_memory.chat_deletion_sqlite_scope_closure` + exact PuPu candidate artifact + 单次构建并复用的Unchain wheel digest与runtime manifest digest；Git revision只作provenance
- **producer owner confirmation**: PENDING_RECONFIRMATION | AM-003尚未形成新PS/ruling
- **consumer owner confirmation**: PENDING_RECONFIRMATION | AM-003尚未形成新PS/ruling
- **positive acceptance**: AC-010、AC-012、AC-013、AC-014、AC-016、AC-017、AC-018
- **negative acceptance**: AC-011、AC-014、AC-015、AC-016

### SEQ-005 | Durable chat deletion first attempt, crash retry and cold replay
- **owner**: code-owner-runtime + code-owner-unchain
- **owner confirmation**: PENDING_RECONFIRMATION | AM-003尚未形成新PS/ruling
- **identity key**: owner_chat_id + canonical scope SHA-256 + stable outbox operation_id + tombstone revision
- **initial state**: PuPu deletion outbox为pending；目标chat可能有ownership lifecycle与SQLite owner state，或完全无known owner evidence；尚未确认`context_done`
- **ordered events**: resolve lifecycle exact scope，或证明全部known owner evidence为零后提出空scope → 用loaded feature与exact extension declarations构造Core → `BEGIN IMMEDIATE`后二次验证schema/owner/evidence/vector authority → 原子写tombstone及scope evidence → child-first删除PuPu admissions、host-generation、RunBundle、local vector receipt/watermark与Core scope rows → commit immutable receipt → endpoint success → outbox确认`context_done`；若commit后响应丢失，同scope/operation重放先验tombstone与scope evidence、重清owner extension，再返回首次receipt
- **expected observations**: 事务前/内失败为0 tombstone、0 partial deletion且outbox保留；成功后active admissions/host-generation/RunBundle/Core scope为0、ownership provenance保留且不可变、FK check为0；replay标记为true但首次`deleted_rows`计数与digest不漂移
- **persistence boundary**: PuPu deletion outbox、ownership/admission tables、Unchain chat deletion tombstone/scope/operation tables与共享Context/Memory SQLite tables
- **boundary contracts**: BC-004、BC-001、BC-002、BC-003
- **positive acceptance**: AC-012、AC-013、AC-014、AC-016、AC-017、AC-018
- **negative acceptance**: AC-010、AC-011、AC-014、AC-015、AC-016
- **first use**: REQUIRED | AC-012、AC-014、AC-017
- **repeat**: REQUIRED | AC-013、AC-017
- **retry**: REQUIRED | AC-013、AC-017
- **resume**: REQUIRED | AC-013、AC-017
- **restart**: REQUIRED | AC-013、AC-016、AC-017
- **reset**: NOT_APPLICABLE | durable deletion没有可恢复active chat的reset；不得删除tombstone或provenance作为重试手段
- **rollback**: REQUIRED | AC-010、AC-016、AC-018；rollback artifact仍必须识别既有tombstone并保持防复活，不得恢复无feature的旧Core进入active rollout

### AC-010 | Loaded runtime feature parity
- Unchain真实producer、PuPu required matrix、sidecar projection、Electron validator与release artifact matrix对`context_memory.chat_deletion_sqlite_scope_closure`逐端一致；缺feature、坏digest或旧Core在任何deletion side effect前fail closed；revision变化不影响兼容判断。

### AC-011 | Exact schema closure and deletion order
- 完整初始化schema逐表扫描通过；任意unknown table name、unknown no-FK scoped table、known optional group缺表、undeclared extension、retained child缺exact FK、或known deletion table新增与固定child-first顺序冲突的FK均在tombstone前拒绝并完整rollback。

### AC-012 | Atomic SQLite scope closure
- 同一事务删除目标owner的host-generation五张active表、RunBundle三表、local vector receipts/watermarks、legacy/workspace/curation/execution scope与声明的PuPu admission operations/admissions；foreign owner数据不变，`PRAGMA foreign_key_check`为0，receipt逐表计数可核验。

### AC-013 | Admission reconciliation and immutable ownership provenance
- 首次成功后目标owner admissions/operations为0，ownership bindings/operations原样保留；retained parent/child在tombstone后INSERT/UPDATE/DELETE均拒绝；模拟commit后response loss或旧guard缺口时，同operation冷重放原子重清admissions、返回`replayed=true`且首次receipt/digest/计数不变化、不复活chat。

### AC-014 | Empty-scope authority
- 无lifecycle且所有known owner evidence均为0时允许写empty-scope tombstone并可冷重放；adapter扫描后、Core事务前新出现admission的TOCTOU必须由Core事务内二次检查拒绝；admission、host-generation、legacy、workspace、curation或retained ownership任一owner evidence存在时不得从partial evidence猜scope，必须0 tombstone、0 delete并保留outbox pending。

### AC-015 | External vector cleanup authority
- 目标space存在任一`vector_projection_points`时Core在tombstone前fail closed，保留point与`external_receipt_id`以及全部目标数据；只有points为0时才能删除本地receipts/watermarks。外部vector physical GC contributor/receipt尚未形成前不得扩大此feature语义。

### AC-016 | Durable non-resurrection guards
- 成功删除并冷重启后，目标owner/space的新admission、host-generation binding与vector point/receipt/watermark INSERT/UPDATE均因tombstone拒绝；retained ownership parent/child INSERT/UPDATE/DELETE拒绝；dynamic child guard identity绑定parent+join declaration，并在同一初始化事务重建，旧predicate不得被`CREATE IF NOT EXISTS`复用。

### AC-017 | Real pending-outbox recovery
- 对真实库隔离副本的13条pending逐条执行first attempt与冷重放：9条lifecycle scope和4条零evidence empty scope全部成功；active admissions、host-generation、RunBundle与Core scope残留为0，ownership provenance保留，`PRAGMA foreign_key_check`为0；PuPu outbox在endpoint success后最终确认13/13 `context_done`。任何有partial owner evidence的no-lifecycle样本必须保持pending并明确fail closed。

### AC-018 | Exact deployed pair evidence
- 使用一次构建后复用的同一Unchain wheel运行Unchain deletion tests、PuPu adapter/outbox matrix、Electron protocol parity、真实隔离快照与package smoke；所有报告核对同一artifact SHA-256及runtime manifest digest。sibling mutable source green只算开发证据，不授予active rollout。
