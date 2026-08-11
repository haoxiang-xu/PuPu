# 证据规则

[Quorum 索引](../README.md) · [Case Lifecycle](README.md) · [收敛与裁定控制](decision-controls.md)

本页规定正式证据控制启动后，证据如何进入当前抉择、`Evidence Examiner` 如何进行 16% 随机抽查，以及 `Chief Judge` 如何决定是否续查。规则适用于议案或方案的辩论庭、众议庭、Chief 明示要求的裁定前核验，以及验收与复议。默认协作只保存普通依据引用，不为满足形式自动创建 DES 或抽样。

## 一、两种举证责任

| | 对象 | 责任归属 | 依据 |
|---|---|---|---|
| **证据认证** | 这份证据是不是它自称的那个东西 | 提出该证据的一方 | 宪法第六条 |
| **实体反驳** | 这个观点或主张是不是错的 | 提出反驳的一方 | 宪法第八条 |

质疑方无需先证明证据为假，但必须点名证据、指明理由及决策影响。证据补强责任仍由提出者承担。

## 二、证据质疑

有效的证据质疑须同时满足：

1. **点名对象**：指明单一 `E-####` 或 `DES-###/DU-###`；
2. **指明理由**：`SOURCE`、`UNSUPPORTED`、`RELEVANCE` 或 `CONTRADICTION`；
3. **说明决策影响**：点名会改变的议案结论、回答/方案块、owner 分工、验收标准、回滚条件或裁定结论。

三条缺一，`Speaker of the House` 以 `RETURN_NO_LINK` 退回重排。三条齐备时，Speaker 只判断其决策链接是否成立，不得判断质疑理由是否正确。

默认协作尚未启动正式证据控制时，有效质疑使用普通 `OBJECTION`，指向当前 MS/PS 及会受影响的结论或方案块；它不创建独立 evidence thread、BOS、DES 或 Examiner。若在交棒中提出，依统一规则等待完整集成 RS 后再处置。

正式证据控制已经启动时，对 E/DU 的有效质疑使用 `EVIDENCE_FLAG`。DES 冻结前，Speaker 把 flag 附到候选单元并重新评估成员关系和质疑元数据；若提出者同时主张回答或方案应改变，仍须在适用的 RS/首次陈述窗口提交普通 `OBJECTION`。DES 冻结后，flag 不得更换 manifest 成员、重置抽样、触发核验或创建讨论线程、RC、新 BO。若存在 BOS，它必须映射既有开放 BO；任何合法的无 BOS evidence visit（包括 collaboration 裁定前核验、无争议 acceptance 或 reconsideration）则映射当前 MS/PS/AT/主张，或当前 Chief 方向/裁定中的 RC。每个 `(证据 target, 理由, 决策链接)` 只创建一个 flag，重复项以 `MERGE_DUPLICATE` 指向原 flag。Speaker 在 `evidence.md` 对相应 E/DU 追加 `OPEN` 事件并随 SUMMARY 呈给 Chief；只有明确引用该 flag 的 Chief 证据方向/实体裁定，或原提交者的 `WITHDRAWAL`，可授权追加 `CLOSED` 事件。CR 本身和无关裁定不能关闭。

## 三、四类来源与证明力

| 类型 | 判据 | 例 | 默认处置 |
|---|---|---|---|
| **自证类** | 任何角色可独立复现，且结果不依赖复现者 | 固定 revision 的文件内容；可复跑命令 | 提出者先行核实；成为决策单元后参与抽样 |
| **易失类** | 一次性观察，或对象随后可变、可消失 | 运行时状态、外部系统响应、现场数据 | 记录观察时点与限制；成为决策单元后参与抽样 |
| **传闻类** | 庭外陈述，用于证明其所述内容为真 | 设计文档、README、注释、他人转述 | 只能证明“该陈述曾被作出”，不能单独证明所述事实 |
| **证言类** | `Witness` 依传票作出的回答 | 本人经历、意图、未记录约定 | 记录来源与可佐证线索；成为决策单元后参与抽样 |

自证类须给出 revision、路径、行号或完整命令。易失类的时点限制降低置信度，但不自动扩大核验。证言由本人作出不等于事实已经佐证。

## 四、决策事实单元与最小集合

抽样单位不是消息或整份 `E-####`，而是一个只承载一个可判定事实的 `DU-###`。每个单元必须记录：

- 单一事实主张及其具体决策链接；
- 支撑它的一个或多个稳定 `E-####/ES-###` 精确切片；
- 规范化内容哈希；
- 来源类型、已知限制与观察时点；
- 完整 `verification_key`。

每个 ES 的 `source_type` 与 `limitations` 从其所属 `E-####` 的 **source type** 与 **limitations** 字段继承；同一 E 的全部切片必须共享这两项。若某个切片需要不同来源类型或限制，必须拆成新的 E，不得在 DU 展示行临时覆盖。`verification_key` 是下列字节级 canonical JSON 的 SHA-256。序列化固定为 UTF-8、无 BOM、无尾随换行、字符串先做 Unicode NFC、换行统一为 LF、按 JSON 标准转义、对象键严格使用下示顺序且键间无空白；`revision` 或 `observed_at` 的 `NOT_APPLICABLE` 编码为 JSON `null`，未知值编码为字符串 `"UNKNOWN"`。`evidence_slices` 按完全限定 `ref` 的 UTF-8 字节序排列，`limitations` 去重后按相同规则排序。不得省略空数组或以展示文本参与哈希。

```json
{"claim":"...","decision_link":"...","evidence_slices":[{"ref":"E-0001/ES-001","locator":"...","revision":"...","observed_at":null,"boundary":"...","content_sha256":"...","source_type":"自证类","limitations":["..."]}]}
```

任一 canonical 字段或数组成员变化，当前核验状态回到 `UNCHECKED`；旧 CR 只作为历史引用，不得继承为当前已验证。实现必须能从 DES 的 claim/decision link 与每个 E/ES 的 canonical 字段逐字节重建该 JSON 与 key，不能信任提交者手填的哈希。DU 行的扁平“来源类型/限制”只是派生展示；多 E 类型不同时须按 ES ref 逐项展示，不参与 key 计算。

一个 `E-####` 打包多个事实时必须拆成多个 `DU-###`；同一事实分散在多条消息时仍只能形成一个单元。拆消息不得放大总体，把不同事实塞进一个证据也不得缩小总体。

`Speaker of the House` 仅从 `ADMIT_MATERIAL` 材料建立最小决策证据集。一项单元在满足下列任一条件时可纳入：

1. 它属于至少一个能够区分仍可行裁定结果的 **最小充分理由**；
2. 它会改变风险、议案回答、方案内容、owner 分工、回滚方式或某个 `AC-###` 的独立结果；
3. 即使最终通过/失败不变，它会改变失败原因或补救范围。

验收时每个失败的 `AC-###` 至少形成一个独立单元，不得因为另一个标准也失败而排除。

冻结 `DES-###` 时必须满足：

- `候选单元 = 最终抽样总体 ⊎ 合并来源 ⊎ 排除单元`，三者互斥且每个候选恰好出现一次；
- `N = 最终抽样总体中的 DU 数量`；
- 合并项指向保留的 DU，排除项写明反事实或范围理由；
- manifest 记录当前 `SI-###`、`sampling_scope_id`、规范排序、每个 DU 的内容哈希、关联决定及自身摘要哈希。

Speaker 只作 materiality 与去重判断，不判断真伪或方案优劣。任何当前获准参与者可在冻结前对成员关系提出 `RELEVANCE` 异议。

## 五、16% 可复现随机抽查

首批抽查数为：

```text
N = 0  → k = 0
N > 0  → k = ceil(N × 0.16)
```

`N = 0` 时只冻结空 `DES-###`，`CR = NOT_APPLICABLE`，不创建 Examiner，也不进入等待证据方向状态。`SUMMARY` 后直接进入 `awaiting-ruling`；`Chief Judge` 可引用空集合作实体裁定，也可针对庭审中的开放 BO，或无 BOS evidence visit 中当前产出及本方向冻结的 RC，签发 `RETURN_FOR_REVISION`。但若这是一个 rank 尚未下降的 `PENDING_VERIFICATION` 返修周期，则不得再次 RETURN，只能实体裁定、回滚、终止、拆案或作合规重框。空集合不允许随机/定向核验。

`N > 0` 时，runtime 在 manifest 冻结后生成一条 256-bit hex seed 记录；每个 `DES-###` 只接受第一条 seed，之后的 seed 无效。具体抽样算法固定为：

```text
score(DU) = SHA-256(UTF8(seed) || 0x00 || UTF8(manifest_hash) || 0x00 || UTF8(DU_ID))
```

先把最终总体过滤为 `RANDOM_ELIGIBLE` 且尚未核验的 DU，再按 `score` 字节序升序排列，分数相同时按 `DU_ID` 升序，取前 `min(k, 合格数量)` 个。`CHECKED_INHERITED` 与 `REPLACEMENT_REQUIRES_TARGETED_CHECK` 不参加随机排序。候选清单按 `DU_ID` 规范排序，seed、manifest hash、资格状态、算法和结果全部归档，因此不同 runtime 必须得到相同样本。不得把合格数量为零的结果伪装成一次抽样批次。

自动首批资格绑定 `sampling_scope_id`：action 获准前，第一个正式证据 visit 的不可变 `SI-###` 建立该 case 的 pre-action sampling scope；之后由同一材料进入 debate/full hearing 的 successor SI 继承这个 scope，不获得新首批。若此前没有证据 visit，则首个 hearing SI 建立 scope。实体裁定批准 action 并分配 `AS-###` 后，从 implementation 起的全部 `AT-###`、acceptance SI 与复议均取该 AS。每个 sampling scope 只有一次自动 `FIRST_RANDOM_16`；资格只在实际生成该批次的 `CR-###` 时消耗。`N = 0` 的空 DES 不消耗资格；`N > 0` 且最终总体的每个 DU 均以自身未变化的 `verification_key` 标记为 `CHECKED_INHERITED` 时，写 `INHERITED_ONLY` 与 `CR = NOT_APPLICABLE`，引用原逐项 CR 历史，不重查也不消耗尚未使用的资格。同一 scope 的 successor 首次出现 `RANDOM_ELIGIBLE` 未查 DU 时仍可标记 `ELIGIBLE` 并执行首批；一旦消耗，全部 successor DES 与 successor AT 均为 `INELIGIBLE_INHERITED`。被质疑、易失、证言或自证等来源标签均不产生额外自动名额。

`stage_instance_id` 由 `SI-###` 标识，在 Chief 于 collaboration 明示启动裁定前证据控制、开启首个 debate/full hearing、进入实施/验收/复议或裁定明示的新 visit 时创建。同一 evidence visit 内的 `RETURN_FOR_REVISION` 与 successor DES 沿用当前 SI。普通无证据路径中，Full 投票发生在任何 hearing SI 前：通过后创建本 case 第一个 full hearing SI，未发起或失败才创建第一个 debate hearing SI。若 collaboration 已有 evidence SI/DES，后继 hearing 创建 successor SI，继承 effective DES、pre-action sampling scope 与核验历史，但没有 BOS 可继承；Full 投票本身不创建中间 debate SI。任何 agent 都不得自行新建 SI。每个新的 `AT-###` 使用新的 acceptance SI，但同一 action 始终沿用 `PLAN_RULING` 创建的 `AS-###`；每个新 AT 的 DES 是该 AS 下前一 effective DES 的 successor，不新增或重置自动首批额度。若该 AS 从未产生 `FIRST_RANDOM_16`，后继 DES 首次出现 `RANDOM_ELIGIBLE` 未查 DU 时仍可消费原有唯一额度。跨 SI/AT 只有 `verification_key` 完全相同时才能继承当前核验状态；否则只保留旧历史引用，当前状态为 `UNCHECKED`，是否核验新单元仍由 `Chief Judge` 续批或定向授权。

`Evidence Examiner` 对抽中 DU 只回答：真实性、来源可靠性、是否支持其点名主张。它不得评价方案取舍，不得核验未抽中单元，不得创建 side case、增加 agent、补充候选证据或展开邻接调查。

## 六、置信度报告

实际执行核验的每个批次产生一份 `CR-###`，至少包含：

- `DES-###`、manifest hash、当前 SI、`sampling_scope_id`、批次类型及授权来源；
- `N`、本批数量、累计已查数量、实际比例、seed 与抽中 `DU-###`；
- 每个 DU 及其 E 切片的 `已验证 / 未验证 / 相矛盾`，证言对应 `已佐证 / 未佐证 / 相矛盾`；
- 已覆盖与未覆盖的待裁问题、方案块与 `AC-###`；
- 未抽中的单一来源关键主张；
- `HIGH / MEDIUM / LOW` 置信等级、依据与限制。

置信等级不得冒充统计概率，也不得仅凭本批无错误声称整个集合正确。

## 七、证据方向状态机

每个 effective DES 必须冻结一个 `evidence continuation`：证据控制开始前的 stage、当前讨论/验收对象、当前有效 AT 与 response（不适用时写 `NOT_APPLICABLE`），以及证据门结束后的确定 `resume_state`。pre-action 的普通送裁定 continuation 为 `awaiting-ruling`；acceptance 的 continuation 必须按本节末尾的 AT/response 矩阵计算。首份 `CR-###` 归档后，自动核验停止，case 暂存为 `awaiting-evidence-direction`。任何非空 DES 的初始抽样处置为 `AWAITING_CHIEF_DIRECTION` 时也进入该状态：返修 successor 的依据通常为 `successor DES + RETURN R + predecessor CR`；没有 predecessor CR 时写 `CR = NOT_APPLICABLE`，不得制造空报告。`INHERITED_ONLY` 或 `N = 0` 的 successor 不一律进入 `awaiting-ruling`，而是恢复其冻结 continuation。`Speaker of the House` 可完成当前 case 或庭审的 `SUMMARY`，但任何后续核验只可由 `Chief Judge` 选择：

- `RULE_NOW`：不再核验；可以独立写入 `EVIDENCE_DIRECTION`，也可由引用最新 `CR-###` 的实体裁定隐式表达。任何 procedure mode 下都必须显式列出并接受会影响裁定的未覆盖风险。
- `NEXT_RANDOM_16`：仅在当前 effective DES 仍有合格未核验 DU 时，从其冻结 manifest 无放回抽取不超过该 DES 所记 `k` 的下一批；可包含 successor 新增 DU，但不得包含标记为 `REPLACEMENT_REQUIRES_TARGETED_CHECK` 的替代单元。空集合或已全查时不得签发。
- `TARGETED_CHECK`：点名有限 `DU-###`、理由与决策影响。已核验 DU 只有在证据切片、内容哈希或观察时点发生变化时才可再次点名。
- `RETURN_FOR_REVISION`：点名要返修的回答、方案块、证据材料或主张以及允许补充的材料范围。存在 BOS 时必须引用开放 `BOS-###/BO-###` 及其冻结退出条件或所链接 RC；任何合法无 BOS evidence visit 则必须在本方向内以 `R-####/RC-###` 冻结有限、可判定的返修条件并指向当前 MS/PS/AT/主张。两条路径都不得新增无关阻塞义务，也不授权核验。验收或复议中的证据方向只能返修材料与主张，不能授权真实实现变化；实现返修专由 `RECONSIDERATION_RULING: REAUTHORIZE_REVISION` 授权。revision 与 successor DES 可作为一次 `PENDING_VERIFICATION` 等-rank 中间态，但在当前 atom lineage 再次授权 RETURN 前，本周期必须经核验或裁定使全部开放 condition/RC rank 严格减少；否则只能裁定、回滚、终止、拆案或合规重框。procedure mode 升级或重框必须继承 active cycle，不能用 successor SI/BOS 清除本门禁。

RETURN 的 target 路由是封闭矩阵：pre-action MS/PS 变化先走 drafting/integration 与相应 successor RS；pre-action 仅证据/主张补强留在当前 evidence SI 且不创建 artifact/RS；acceptance/reconsideration 的 AT/证据/主张补强同样留在当前 SI，且不能改变实现。三条分支完成后都必须先冻结 successor DES，并重新冻结 continuation；再依 `EMPTY / INHERITED_ONLY` 恢复 continuation，或依 `AWAITING_CHIEF_DIRECTION` 暂存为 `awaiting-evidence-direction`。任何普通 review/SUMMARY 规则都不能绕过这一步。

只有 `NEXT_RANDOM_16` 与 `TARGETED_CHECK` 完成后产生新 `CR-###` 并再次等待 Chief。`RULE_NOW` 结束证据门并恢复 effective DES 冻结的 continuation；只有 continuation 本身是 `awaiting-ruling / closed` 时才转入裁定或结案，失败验收仍可恢复为 `awaiting-acceptance-response / reconsideration`。`RETURN_FOR_REVISION` 转入返修，并在 successor DES 冻结后按上一段重新等待方向。procedure mode 只能由异议与 Full 程序票升级，不能作为证据方向。任何指令都须写明停止条件，不得以空批次、同一未变化 DU 的重复定向核验或开放式“查完相关内容”维持循环。同一返修周期处于 `PENDING_VERIFICATION` 时不得再次签发 RETURN。

## 八、冻结后的返修与 successor DES

manifest 冻结后，不得自行补证、换证或重开首批抽样。只有 `Chief Judge` 的 `RETURN_FOR_REVISION` 可以允许新增 material 证据或实质方案变化。

`current effective DES` 是 `case.md` 当前证据控制指向的、已冻结 successor 链末端；旧 DES 保留历史，不再接收新随机批。

返修后建立 successor `DES-###`，必须：

- 写明 `supersedes`；
- 继承所有未变化 DU 的编号、内容哈希、既有抽中状态与 `CR-###` 结果；
- 保留被排除或替换 DU 的历史及理由，不得删除未验证或相矛盾结果；
- 为每个单元记录 lineage：`UNCHANGED`、`NEW_INDEPENDENT` 或 `REPLACEMENT_OF <DES/DU>`；
- `UNCHANGED` 只有 `verification_key` 完全相同才成立；
- `NEW_INDEPENDENT` 必须写明反事实：即使被比较的失败 DU 为假，该单元仍独立成立、仍然 material，且不承担恢复旧主张证明力的作用；
- 凡支持同一决定/依赖主张，或用于恢复未验证、未佐证、相矛盾 DU 已失去的证明力，默认属于 `REPLACEMENT_OF`，即使改写措辞、来源或 decision link；
- `REPLACEMENT_OF` 单元的随机资格必须标记为 `REPLACEMENT_REQUIRES_TARGETED_CHECK`；其他尚未核验的独立新单元才可标记 `RANDOM_ELIGIBLE`。

若当前 `sampling_scope_id` 已经生成首份 `FIRST_RANDOM_16` CR，successor DES 不获得新的自动首批；验收中即使进入新的 AT/SI，同一 AS 也视为同一 scope。若此前只有 `EMPTY / INHERITED_ONLY`，或其他未实际产生首批 CR 的 DES，则后继 DES 首次出现 `RANDOM_ELIGIBLE` 未查 DU 时仍可使用原 scope 尚未消耗的唯一资格。额度已经消费后的新增单元是否继续核验，由 `Chief Judge` 选择 `NEXT_RANDOM_16` 或 `TARGETED_CHECK`；替换未验证/相矛盾 DU 的单元只能经 `TARGETED_CHECK` 核验，不得进入随机续批。

`REPLACEMENT_REQUIRES_TARGETED_CHECK` 表示“若要把替代单元作为已核验依据，必须定向核验”，不强迫 `Chief Judge` 继续查。闭庭前它必须三选一：定向核验完成；依赖该单元的主张被撤回；或在 `SUMMARY` 中明确列为未核验风险。后一种情况下，后续 `RULE_NOW`/实体裁定必须显式接受该风险，且不得把替代单元表述为已验证事实。

## 九、抽查失败与验收

抽中 DU 为未验证、未佐证或相矛盾时：

- 依赖它的主张标记置信受损，历史不得静默删除或改写；
- Speaker 指明可能受影响的议案回答、方案块、owner 分工、验收标准、回滚条件或裁定；
- 提出者只有在 `RETURN_FOR_REVISION` 授权范围内才能补强；
- Examiner 不自动扩大样本或要求补强；
- Chief 决定 `RULE_NOW`、下一随机批、定向核验或返修。

若当前存在 BOS，依赖该 DU 的 BO 在核验完成前保持 `status: OPEN`，并另记 `reason: AWAITING_EVIDENCE`；`AWAITING_EVIDENCE` 不是 BO 状态。结果支持其冻结退出条件时才可转为 `SATISFIED`；未验证、相矛盾或仍未覆盖时继续 OPEN，使 Chief 可以针对同一 BO 返修或在最终裁定中明示接受风险并 `WAIVED_BY_RULING`。合法的无 BOS evidence visit 只把相同风险写入 SUMMARY 与相应实体裁定。

验收阶段适用完全相同的规则：每个会改变验收结论或补救范围的 `AC-###` 结果形成 DU。`FIRST_RANDOM_REQUIRED` 时按 16% 抽查；`EMPTY / INHERITED_ONLY` 时 `CR = NOT_APPLICABLE` 并恢复 continuation；实际 CR 或 `AWAITING_CHIEF_DIRECTION` 则暂存为 `awaiting-evidence-direction`，等待 Chief 结束证据方向后再恢复。continuation 的封闭矩阵为：当前 effective AT 为 `PASSED → awaiting-ruling`；`FAILED + 无当前有效 response → awaiting-acceptance-response`；`FAILED + ACCEPT_FAILURE` 或 response timeout `→ reconsideration`；`FAILED + DISPUTE_FAILURE → awaiting-ruling`。初始 evidence gate 完成前 response window 不得开启；window 已开启但尚无 response/timeout 时不得插入新的 evidence direction。`awaiting-evidence-direction` 期间新 response/timeout 无效；恢复 `awaiting-acceptance-response` 后才由 `NOTICE: ACCEPTANCE_RESPONSE_WINDOW_OPEN` 依据 AT 冻结的 window/grace durations 生成绝对 deadline。response 必须同时引用该 notice 与当前 effective AT；RETURN 形成的 successor AT 若改变结果、观察或证据 target，旧 response/window 不自动继承，successor DES 必须据当前记录重算 continuation。该矩阵保证 evidence gate 存续期间 continuation 不会漂移，也不能跳过方案主 owner 的失败回应。
