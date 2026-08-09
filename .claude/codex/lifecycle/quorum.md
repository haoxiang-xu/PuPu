# Quorum · 获批 roster 的到场与交付

> PuPu 本仓条文。[法典索引](../README.md) · [参与名单与传唤机制](summons.md) · [共通收敛规则](decision-controls.md)
>
> 本页只补充 PuPu 的调度与缺席记录；它不建立独立的自动增员权，也不得覆盖 `Chief Judge` 的名单审批权。

## 一、唯一名单

case 的参与义务只来自 `case.md` 的 **current roster**：

- 初始 agent 名单、角色、交付与访问范围，由 `Chief Judge` 在 intake 中逐项批准；
- 立案后的 `ADD / REMOVE / CHANGE_SCOPE / CHANGE_DELIVERY / WAIVE_DELIVERY`，只可由 `PARTICIPATION_RULING` 生效；
- 所有权边界命中、自请、他人推荐、证据中新出现实体或同角色额外 instance，只产生候选 `RP-###`，不自动进入 roster；
- `Witness` 是 human 事实来源，依传票规则处理，不属于 agent roster 增员。

本页沿用 “quorum” 名称仅为兼容既有链接。它不再表示“机械命中的 owner 全体必到”，也没有“名单只增不减”规则。

## 二、开庭与调度

初始批准块落盘并创建当前 stage/SI 后，方可调度获批参与者。参与者可以分批、串行或并行提交；不要求所有 instance 同时在线。

PuPu 的运行时曾在大扇出下出现同签名故障，因此默认采用小批调度。调度方式只影响执行顺序，不改变发言平等、交付内容或审批范围。任何参与者都不得自行派生会进入案卷、扩大取证范围或承担交付的新 agent。

## 三、送裁定与闭庭

送裁定只检查 current roster 中 **承担当前阶段交付** 的角色。每项交付须满足以下之一：

1. 已提交并通过相关性门；
2. Debate 中对当前方案快照完成 `ACK`；
3. 已由 `Chief Judge` 豁免、移出或改变交付；
4. 已追加缺席或运行时故障记录，并把影响呈入 `SUMMARY`。

未获批准的候选、背景中顺带出现实体的 owner、已被拒的 RP，不构成缺席，也不阻止闭庭。最终方案确实命中未覆盖的 `write_set / contract_set` 或直接验收、回滚责任时，只能提交增员请求或覆盖缺口；不得自动传唤。

## 四、缺席与故障

获批参与者未完成交付时，`Speaker of the House` 追加一条事实记录，至少包含 agent、当前交付、起止时点、原因、已完成部分及对当前抉择的影响：

- **调度冲突**：该角色正在承担不可中断的写入参与；
- **运行时故障**：instance 启动失败、异常退出或超时；
- **无回应**：没有可证实的技术故障或调度冲突。

记录本身不自动批准替代者，也不自动终止或续开庭审。`Chief Judge` 决定等待、豁免、移出、改变交付、批准替代候选、按缺口裁定或终止。

## 五、与 Track 的关系

| Track | 本条适用方式 |
|---|---|
| **Fast Track** | 无庭审，但 intake 初始批准、后续增员审批和实施/验收交付仍适用 |
| **Express** | current roster 只承担 combined visit 的获批交付 |
| **Debate** | 主 owner、owner slots 的承担者及审查者须逐项获批；沉默不得视为 ACK |
| **Full** | 每个 stage/SI 使用当时的 current roster；完整九步不因本条缩短 |

重分类、返修或进入新 stage/SI 时，沿用当时 current roster，除非新的 `PARTICIPATION_RULING` 明示改变。任何 Track 都不得借“quorum”自动加人。

## 六、历史过渡

2026-08-09 同步前已归档的参与名单与记录保持 append-only，不追溯改写。仍为 `filed` 且尚无实体发言的案直接按现行 intake 创建第一条 SI。已经进入 `hearing / awaiting-ruling` 的当前 legacy stage，可沿用已归档 roster 和当时字段集合完成当前交付，并用 **恰好下一条** 标记 `legacy bridge · pre-2026-08-09` 的 R 关闭或转换；该 R 不要求倒填 SI/BOS/DES/AS，但记录类型名必须使用现行枚举，历史 `TERMINATION` 在新 bridge R 中须写为 `TERMINATION_RULING`。bridge 不得再开第二个 legacy stage或新的自动传唤/全量核验批次。它若进入后继 stage，须原子创建现行 SI 与证据/阻塞状态，后续全部使用现行规则。同步后任何新增 agent 或 role instance 均须 `RP-### / PARTICIPATION_RULING`；无法在旧 stage 合法表达的流程先 bridge、终止或重立。
