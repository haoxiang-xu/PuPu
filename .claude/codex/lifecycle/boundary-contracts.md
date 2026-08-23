# 边界契约与状态序列

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

本页规定方案在跨边界传递或依赖历史状态时必须形成的可裁定对象。它不新增常驻的“接缝 owner”，也不要求 Speaker 在 intake 预测完整参与名单；边界由主 owner 在形成方案时发现，并依既有串行 `HS-###` 交棒交由真实 owner 确认。

## 一、适用性声明

每份声明 `boundary_protocol: v1` 的 proposal 必须分别声明：

- `boundary obligations`：列出适用的 `BC-###`，或者写 `NOT_APPLICABLE`；
- `boundary N/A reason`：前项为 `NOT_APPLICABLE` 时给出具体理由，否则写 `NOT_APPLICABLE`；
- `state sequence obligations`：列出适用的 `SEQ-###`，或者写 `STATELESS / NOT_APPLICABLE`；
- `state sequence N/A reason`：前项为 `STATELESS / NOT_APPLICABLE` 时给出具体理由，否则写 `NOT_APPLICABLE`。

下列任一情况使 boundary obligations 适用：数据、控制或授权跨越不同 owner、代码库、进程、provider、外部 API、持久化介质、序列化格式、信任域或独立部署版本。仅在同一不可区分边界内修改纯内部实现，且没有外部可观察契约变化时，才可写 `NOT_APPLICABLE`。

下列任一情况使 state sequence obligations 适用：结果依赖先前事件、可变或持久状态、重试语义、恢复语义、幂等键、租约/收据、缓存、会话、工作流位置或部署重启。纯函数且每次调用只由当前输入决定时可写 `STATELESS`；其他确实无序列义务的情况可写 `NOT_APPLICABLE`，但必须解释原因。

Speaker 只检查声明是否完整、理由是否具体及其与当前方案是否自洽，不替 owner 作技术判断。任何 agent 发现声明与已知事实不符时，须通过当前 review 提出指向具体方案块的 material objection。

## 二、Boundary Contract（`BC-###`）

每个 BC 描述一次具体的 producer → consumer 传递，并至少记录：

- producer、consumer 以及双方 owner；
- producer 产物、canonical representation 与 consumer projection；
- admission policy：`CLOSED / OPEN / VERSIONED`；
- 允许的字段、扩展或版本变化；
- 未知输入、无效输入与 consumer 失败语义；
- identity/version binding，包括实际部署或依赖 revision 如何绑定；
- producer 与 consumer owner 的确认来源；
- 至少一个正向 `AC-###` 与一个负向 `AC-###`。

三种 admission policy 的含义是：

- `CLOSED`：consumer 接受的字段/变体集合封闭；测试必须按最终 consumer 看到的精确集合断言，未知输入按 BC 的失败语义拒绝；
- `OPEN`：consumer 明确允许扩展；BC 必须写清扩展命名空间、忽略/保留规则与冲突语义，不能用“实现是 map/dict”代替开放策略；
- `VERSIONED`：多版本共存或迁移；BC 必须写出版本判别、兼容窗口、升级/降级语义与未知版本行为。

内部通用容器、宽松 mock 或只验证部分字段，均不能单独证明 wire contract。正向 AC 必须使用真实 producer 形状经过实际 projection 到 consumer；负向 AC 必须在最终 admission 边界证明未知、错型、错版本或错 identity 会按声明失败。

若某一侧不由方案主 owner 拥有，该侧确认必须来自一个已 `RETURNED` 的 material `HS-###`。主 owner 自有侧可写 `LEAD`。HANDOFF 的 `scope` 必须逐项覆盖该确认涉及的每个 BC/SEQ 对象及该责任引用的全部 AC；HANDOFF_RETURN 的 `contribution` 必须逐项覆盖同一责任对象。空 contribution、泛化的“完成”或只含状态而无对象的 return 不构成确认；一个 HS 覆盖多个对象时按对象与 AC 的并集核验。同一个 HS 可以确认同一目标 owner 的多个明确直接责任，但不得同时作为两个不同 owner 的确认来源；不同 owner 的交棒仍须遵守一次只有一个 `OPEN` HS 的串行规则。普通文字点名或预测性 roster 不构成确认。

## 三、State Sequence（`SEQ-###`）

每个 SEQ 描述一个有序行为义务，并至少记录：

- owner 及其 `LEAD` 或已返回 HS 确认；
- identity key、初始状态、有序事件、逐步预期观察；
- persistence boundary；
- 关联的 BC；若确实没有边界，写 `NOT_APPLICABLE | <reason>`；
- 至少一个正向 `AC-###` 与一个负向 `AC-###`；
- 以下固定矩阵每一格的 `REQUIRED | <AC refs>` 或 `NOT_APPLICABLE | <reason>`：`first use`、`repeat`、`retry`、`resume`、`restart`、`reset`、`rollback`。

适用的 SEQ 中 `first use` 必须为 `REQUIRED`。其他单元格是否适用取决于方案语义，不要求制造不存在的操作；但 `NOT_APPLICABLE` 必须给出可审查理由，不能留空、写 `TODO` 或只写“未测试”。同一 AC 可以覆盖多个紧密耦合的单元格，但必须能从验收证据逐格追踪到观察结果。

SEQ 的 identity key 必须区分业务实体、attempt、interaction、iteration 或其他会改变语义的维度。把 fresh、retry、resume、repeat 或 restart 合并为一个未声明的布尔状态，不构成完整序列契约。

## 四、送裁与验收门禁

方案成为 ruling-ready 之前，Speaker 必须确认：

1. 两类适用性声明及 N/A 理由完整；
2. 声明引用的 BC/SEQ 全部存在、编号各自唯一，且没有未被声明的孤立 BC/SEQ；PS、AC、BC、SEQ、S、R、AT 的标识符均不得重复，YAML frontmatter key 和同一结构对象内的字段名也不得重复。解析不得采用 first-wins 或 last-wins；任一重复都使记录无效；
3. 所有非主 owner 确认均引用已返回的 material HS，且交棒串行；
4. BC 的正向/负向 AC 与 SEQ 的所有 `REQUIRED` 单元格均以同案裸 `AC-###` 精确列表引用现有 AC；`boundary obligations / state sequence obligations / contract_set / boundary contracts` 及 ruling、AT 的结构化 refs 同样只接受其字段规定的同案编号。列表中的未知 token、跨案 qualifier、垃圾后缀或重复 ref 均使记录无效；自由文字中的 HANDOFF scope/RETURN contribution 可以包含说明，但其中的 BC/SEQ/AC/HS 也必须使用同案裸编号且不得重复；
5. BC/SEQ 已被纳入 ruling-ready `PS-###`，相关块及直接依赖已由对应 owner review；
6. 只要存在 BC，`proposal.md` frontmatter 就声明 expected `boundary_revision_set`，格式为 `sha256:<64 hex producer>+sha256:<64 hex consumer>` 的不可变精确 pair，并由每个 BC 的 identity/version binding 逐字引用。移动分支、未冻结 sibling 状态、“最新版”或以 40 hex 冒充 SHA-256 均无效。proposal author 不得写 `boundary_verified_revision_set`；获准 ACTION `PLAN_RULING` 冻结 expected pair，实际验证值与稳定 `E-####` 证据只写入当前最新 AT，且必须与 ruling 逐字一致；
7. PS lineage 从唯一 `PS-001 / supersedes: null` 开始，编号连续，每个 successor 直连前一个 PS；所有 PS 的结构字段唯一且 content hash 为精确 64-hex SHA-256。当前 PS 以 `boundary object hash` 固定其全部 BC/SEQ。`case.md` 的 `review_snapshot_ref` 指向 latest、唯一 canonical RS `NOTICE`；RS 同样从 RS-001 连续编号且 successor 直连前一个 RS。NOTICE 必须把当前 PS、其 content hash、predecessor RS（初始 review 写 `null`）、review kind、与当前集合精确相等的 BC/SEQ、相同 boundary object hash、eligible owners、N、`inherited stances / re-review owners / invalidated scopes` 和四个时区明确的 deadline 绑定起来；其自身 `content hash` 按下述 RS 算法重算。eligible owners 精确等于 lead 与 RS opening 前所有已返回 material HS 的 owner（同一 owner 去重），N 等于 owner 数；review deadline 与 objection intake deadline 相等，且早于 lead disposition deadline，后者又早于 lead reminder final deadline。任一包含 BC/SEQ 的 successor PS 都适用，无论 `changed blocks` 如何声明；空 NOTICE 或只写 RS 编号不构成审查。review ref 属于 current-state index 和追加记录，不写入已经冻结 hash 的 PS；
8. RS opening NOTICE 不保存最终 `owner stances` 摘要。初始 RS 的 `inherited stances` 为 `NOT_APPLICABLE`，全部 eligible owner 列入 `re-review owners`。successor RS 中 lead 始终列入 re-review 并在当前窗口发布 baseline `AGREE`；受影响 owner 也在 opening 后、review deadline 前各发布一个 speaker=owner 且引用当前 RS 的 `AGREE / OBJECTION / ABSTAIN`。未受影响 owner 的既有 `AGREE/ABSTAIN` 可用 `owner=S-####@RS-###` 明确继承，且必须能解析到同 owner、同 predecessor RS 的真实 S；继承 owner 与 re-review owner 不重叠、并集精确等于 electorate。`OBJECT` 不得通过该字段继承，仍按 objection retarget 规则逐项处理。超时 ABSTAIN 写 `reason: TIMEOUT`。OBJECTION 必须绑定当前 RS 与 artifact、写具体 scope，并在 lead disposition deadline 前取得唯一 lead-authored `LEAD_DISPOSITION`；有限 non-electorate objection 使用同一窗口但不进入 N。`ACCEPT/PARTIAL_ACCEPT` 必须先产生 successor artifact/RS，`REJECT` 必须进入 debate 的庭前分组路径，旧 RS 不能直接送裁。所有相关 S event 时间必须时区明确且按追加顺序严格递增。NOTICE 内的 stance summary 不能替代这些事件。

`boundary object hash` 只覆盖当前 proposal 中全部 BC/SEQ 的规范对象内容，不覆盖 PS 的 review 指针。计算时按 ID 升序生成对象数组；每项为 `{"fields": <规范化字段对象>, "id": <BC/SEQ ID>}`。字段名使用本协议的小写规范名，字段名和值均为 Unicode NFC；对象键排序、数组保持 ID 顺序，JSON 使用 UTF-8、`ensure_ascii=false`、无 BOM/空白/尾随换行。最终值为 `SHA-256("quorum.boundary.objects.v1\0" || canonical_json_bytes)`，其中 `\0` 是一个 NUL byte。RS NOTICE 必须逐字引用该 hash；linter 重新计算并比对，不接受任意占位 hash。

RS `content hash` 覆盖该 NOTICE 除 `content hash` 自身外的全部规范字段：字段名和值 Unicode NFC、字段名按序排序，并以 UTF-8、`ensure_ascii=false`、无空白的 JSON object 编码。最终值为 `SHA-256("quorum.review.snapshot.v1\0" || canonical_json_bytes)`。它证明冻结内容未被静默改写，不证明其中判断真实。

缺少上述任一项时，Speaker 把 proposal 留在 `drafting / awaiting-handoff / awaiting-lead-integration / reviewing` 的适当状态，不得用风险接受、Expert 意见或 Chief 的一般批准请求绕过结构性空白。

验收时，Inspector 必须从 latest、已经由 hash 完全匹配的 `NOTICE:CLOSURE_COMMIT` 生效的 `PLAN_RULING` 读取获准 PS、AC 与 expected revision pair；只有该 latest ruling 为 `APPROVED + ACTION`，完整冻结 `PENDING_CLOSURE` bundle/expected commit hash/deadline/effective-when，且 commit 时间在 R 之后，才可开始 implementation 或 AT。AT lineage 从唯一 `AT-001 / supersedes AT: null` 开始、连续编号且直连 predecessor；当前 AT 的时间必须晚于 effective commit，并绑定同一 R、AS 和 PS，case current status 必须与 acceptance 阶段一致。在当前最新 AT 内逐个记录所有获准 AC 的 `PASS / FAIL / NOT_RUN / PENDING`、具体方法与 canonical `E-####` 精确列表；`NOT_APPLICABLE`、自由文字或无法解析的 evidence 均不是证据。每个 E 必须明确支持对应 AC，且 decision link 精确绑定 `<case-id>#AC-###`。存在 BC 时，当前 AT 还必须写 `verified boundary revision set` 与 `verified boundary revision evidence`；前者逐字等于 ruling 冻结值，后者引用 canonical `evidence.md` 中明确支持 boundary revision set、decision link 绑定 effective PS、stable slice 同时包含获准 revision pair 与 64-hex SHA-256 digest 的 `E-####`。任一获准 AC 为 `FAIL / NOT_RUN / PENDING`，或当前 AT 缺少对应记录，该 AT 都不得为 `PASSED`；predecessor AT 的 PASS 行只能保留历史，不能填补当前 AT。BC/SEQ 中已标记 `NOT_APPLICABLE` 的单元格不产生 AC，也不在验收时重新解释。

证据程序的 `FIRST_RANDOM_16` 只抽查已提交证据单元的真实性和可追溯性，不能减少必须执行的 AC、BC 正负路径或 SEQ `REQUIRED` 单元格。16% 不是测试矩阵覆盖率。

## 五、Canonical source 与兼容性

BC、SEQ、expected revision pair 与两类适用性声明的唯一正文来源是 `proposal.md`；`case.md` 是当前 `boundary_protocol`、current PS、current contract set、BC/SEQ refs 和 review ref 的 canonical current-state index，并与 proposal 精确交叉验证：`current_artifact_ref` 等于 latest PS，BC/SEQ refs 分别等于 current proposal 对象集合，current contract_set 等于 BC 集合，review ref 对应唯一 RS NOTICE。owner 确认、RS opening 与 stance S 事件以 `record.md` 为准；`ruling.md` 冻结 effective PS、获准 AC 与 expected revision pair；实际 verified pair、证据及逐项结果以 `acceptance.md` 当前最新 AT 为准。不得另建持久 manifest 复制这些正文。

本协议版本标识为 `boundary_protocol: v1`，其 canonical 声明必须位于 `case.md` YAML frontmatter；正文或 `proposal.md` 中出现同名文本不能替代该索引。采用方必须为新 proposal 确定一个 effective-from 时间或 revision；在该边界之后创建的 proposal 必须使用 v1。此前已经存在且未声明该字段的 case 视为 `legacy`，不会仅因本协议发布而失效；但若 successor `PS-###` 改变实施范围、AC、跨边界契约、状态语义或授权边界，必须先迁移到 v1 才能送裁。

reference linter 是本文和固定模板的可执行投影，只检查结构、引用与 ruling/acceptance 完整性，不是第二规范来源，也不能替代真实 producer、consumer、部署 revision 或测试证据。它不推断 legacy：调用方须先按自身冻结的 effective-from/legacy 清单路由；传给 v1 linter 的非 v1 case 会直接失败。
