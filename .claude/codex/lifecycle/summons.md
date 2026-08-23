# 交棒、参与与传唤

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

Quorum 不建立预测性完整 roster。参与者由一个主 owner 开始，随后通过真实空白、实质异议或有限事实缺口按需进入。owner 交棒、争点参与和 Witness 传唤是三种不同权限。

## 主 owner 选择

Speaker 只根据核心问题或目标选择一个最接近的 owner：

- 议案选择能对判断承担主要回答责任的 owner；
- 方案选择对主要实施结果承担集成责任的 owner；
- 边界不清时选择最接近者并记录不确定性，不做全库匹配或候选名单；
- 主 owner 的选择不意味着其拥有其他 owner 边界的写入或解释权。

## owner 串行交棒

主 owner 或当前接棒 owner 只有在当前回答/方案存在必要且明确的边界外空白时才能请求交棒。请求须包含：

1. 当前快照和空白 target；
2. 所需 ownership boundary；
3. 期待的单一回答或方案块；
4. 缺席将改变什么；
5. 可访问的最小材料；
6. 完成后返回的 owner。

Speaker 校验后创建 `HS-###` 并直接路由，不需要 `PARTICIPATION_RULING`。每个 HS 必须写 `expires at` 与逾期影响；同一 case 同时只允许一个开放 HS。接收 owner 只能读取点名材料、提交一次约定交付和必要异议；它不能借交棒召集其他 agent、改写其他 owner 块或取得全案权限。交棒中的异议先作为待审异议保存，只有在完整集成快照和 RS 冻结后才可由主 owner 作触发开庭的拒绝处置。

HS 状态只允许 `OPEN / RETURNED / DECLINED / EXPIRED / CANCELLED`，后四项为终态。到 `expires at` 仍无合格 return 时，Speaker 追加一次 `NOTICE: HANDOFF_EXPIRED`，不得无限等待。RETURNED 的 material 交付可以补全回答/方案块，也可以明确确认当前快照中的一项具体直接回答、实施、回滚或验收责任；完成后该 owner 进入合作 owner 集合。DECLINED、EXPIRED、无 HS 的责任声明、只提供文件指针或未完成交付者不计；若该内容仍必要，当前 owner 必须请求下一位边界匹配 owner，或由 Speaker 记录主 owner 转移/送 Chief 终止，不能把空白伪装成已补全。

## objection intake 与原告

“具有实体提交资格”是指：当前 active role charter 允许对议案、方案或其异议作实体主张，且未因宪法同案身份不兼容而失格的 team agent。owner、POV Owner、Dimension Owner、Expert 与 Codex 可依各自边界使用；纯 Witness 只能作证。担任 Speaker、Procedural Judge、Evidence Examiner 或 Acceptance Inspector 的底层 agent 不得靠切换上述角色取得资格；Inspector 只有职责内验收原告例外。一次有限 intake 无需预先成为当前参与者或取得 RP。

任何具有实体提交资格的 agent 即使不在合作 owner 集合，也可在当前 RS review 截止前提交一个有限 objection envelope：具体快照/块、异议理由、决策影响、请求修改与最小依据。Speaker 通过相关性门后，该 agent 获得此争点的原告资格；否则退回或移入 parking lot。中立底层 agent 不得换用其他身份提交或起诉；Acceptance Inspector 仅在职责内验收争议中例外。

原告资格只覆盖该异议及直接回应，不授予全案访问权，也不计入 Full 多数。原告的异议只有被主 owner 明示拒绝后才开启辩论庭。

## 需要参与裁定的新增权限

以下情况仍使用 `RP-###` 并仅由 `Chief Judge` 逐项批准：

- 需要超出 owner handoff 或原告争点范围的全案访问；
- 增加 Expert 的持续专业参与、额外 Examiner instance 或其他非 owner 专业角色；Expert 或其他实体 agent 仅提交一次有限 objection intake 不使用 RP；
- 扩大既有参与者的访问范围、交付或持续期限；
- 涉及敏感材料而角色的 standing scope 不足。

仅在证据、背景或方案文字中提到文件、模块、知识库、系统或 agent，不构成交棒、原告资格或参与批准。

## 合作 owner 与投票资格

在集成快照审查前，Speaker 冻结 `RS-###`：主 owner，加上已 RETURNED material HS 的 owner；责任确认也必须通过该 HS 返回。仅被点名、无 HS 声明或未完成者不计；同一底层 agent 即使持多个 owner 身份也只出现一次。默认 review 权限仍限于每人的 owned block 与直接依赖。

Full 投票通过后，宪法直接授予 electorate 阅读冻结产出及直接依赖所需的全案只读范围，以便全面审查；Speaker 用引用原 RS 的 `FS-###` overlay 逐人冻结该范围、deadline 与 hash，且不改变 N。它不授予写入、相邻调查或敏感材料访问。敏感材料仍须由 Chief 逐项批准。无法合法读取或超出专业责任时，owner 应登记 `ABSTAIN` 并把覆盖缺口列入 SUMMARY。

下列角色不计入合作 owner 分母，除非它同时以独立 owner instance 完成了上述交付：

- Witness、Expert；
- 仅提交证据、观点或 objection intake 的 agent。

Speaker、Procedural Judge、Evidence Examiner 与 Acceptance Inspector 适用宪法同案身份不兼容规则，不能靠另建 owner instance 进入同一 RS；Acceptance Inspector 只在验收争议中取得有限原告资格。

`RS-###` 冻结后不能为改变 Full 门槛或票数而临时增减。确有必要的新 owner 空白须先关闭当前 review，完成正常 HS，再生成新的 successor RS，并保留旧快照与原因。

## Witness 传唤

Witness 只回答事实，不补全 owner 方案块，也不参与 owner 投票。传唤请求必须同时满足：

1. 存在单一、具体、可回答的事实问题；
2. 答案会改变当前议案结论、方案选择或验收结果；
3. 现有记录无法回答；
4. 点名最小可访问材料和停止条件。

Speaker 审核形式与相关性后签发单问题传票。`不知道 / 不确定` 是合法回答：关闭等待义务并把影响记为已知缺口，不得推定不利事实或继续追问相邻问题。

正式庭审中，只有缺少答案会使所有当前可裁候选都无法区分时，传票才能作为 blocking BO；默认协作中的 Witness 等待不创建 BOS。blocking 性质有争议时交获授权 `Procedural Judge`，不能由 Speaker判断事实答案。

## 覆盖复核

方案送裁定前，Speaker 只复核最终方案实际命中的写入、契约、实施、回滚与验收责任是否已有 owner 交付。发现必要空白时恢复串行 handoff；不能用“潜在相关”扩大到邻接 owner。议案只复核形成当前判断所依赖的直接知识责任。
