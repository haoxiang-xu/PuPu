# Canonical source

[Quorum 索引](../README.md) · [Court Records](README.md)

每类信息只有一个正文来源：

- `case.md`：当前元数据、`discussion_type`、`procedure_mode`、canonical boundary protocol 版本、current contract set、当前 BC/SEQ 派生引用、状态/SI/AS 指针、核心目标、主 owner、当前 owner、owner chain、开放 handoff、合作 owner、当前 artifact/review/OG/FV/FS 指针、参与权限、BOS/DES 指针、parent/derived/side-case 关系与文件索引。boundary v1 下 current artifact 必须是 proposal latest PS，current contract set/BC/SEQ refs 与 proposal 当前对象精确相等，review ref 指向唯一 canonical RS NOTICE
- `record.md`：默认协作与庭审的追加式事件，包括 framing、owner 指派、HS 交棒、立场、异议与主 owner 处置、acceptance response、OG 分组、FV 票与计票、FS scope overlay、BOS/BO、线程状态、传票、summary 与 notice；每条 stance 或 response 的正文以这里的 S 事件为准
- `motion.md`：议案问题、主回答、owner contributions、修正、`MS-###` 快照及只引用 S 事件的派生 review index；只在 motion case 存在
- `proposal.md`：方案正文、SLOT、owner contributions、AM、AC、boundary/state 适用性声明、expected revision pair、BC、SEQ、`PS-###` 快照及 boundary object hash；只在 proposal case 存在。proposal author 不保存 verified revision。current protocol/review 指针不写入 PS，BC/SEQ 正文不得复制到 `case.md`、单独 manifest 或验收文件
- `evidence.md`：E/ES、质疑与验证历史、DU/DES、sampling scope、seed、批次与 CR；默认协作可在首个稳定 E/ES 出现时按需创建，但 DU/DES、抽样与 CR 只在正式证据控制启动后出现
- `ruling.md`：Chief 与获授权 Procedural Judge 的裁定、获准方案快照、获准 AC 及 expected boundary revision pair、权限批准、范围/重框/side-case/终止记录、证据方向、验收最终处置，以及最终实体 R 冻结的 closure bundle/expected hashes/deadline/effective-when；不保存普通 owner handoff、stance、acceptance response、OG 或 FV。获准 ACTION 只有在 `record.md` 出现与该冻结 payload/hash 完全匹配的首条 `NOTICE:CLOSURE_COMMIT` 后才是 effective ruling
- `acceptance.md`：AT 实施快照、获准方案/AC 引用、当前实际 verified boundary revision pair 与稳定证据、逐 AC 的 PASS/FAIL/NOT_RUN/PENDING、检查方法、观察、lineage，以及只引用 S/R 的 response/ruling 派生索引；不复制 BC/SEQ、response 或最终裁定正文
- `parking-lot.md`：背景、重复、范围外、过早与无链接内容的最小索引；不具证明力

状态与派生索引可以更新，历史正文不得覆写。`record.md` 只能追加；回答或方案变化创建 successor MS/PS；证据变化追加历史或 successor DES；裁定被推翻时保留旧 R 并追加后继记录。关闭 hearing/case 或授权实体 action 的最终 R，在其 manifest 所列 `THREAD_STATUS` 完成且首条 hash 完全匹配的 `NOTICE: CLOSURE_COMMIT` 归档前只处于 `PENDING_CLOSURE`，不得产生状态或 action 效力。R 归档时原子保留 manifest S ID；重复、部分或不匹配 marker 无效。有效 marker 必须晚于 R 且不晚于冻结 deadline，并同时冻结旧/新 logical case state，是唯一生效点；实施、AT 和 acceptance 状态都必须晚于该 marker。`case.md` 的状态字段为其当前派生索引，滞后时以 marker 为准并修复；存在当前 AT 时索引不得仍停在 implementing 或越级 closed。任何其他索引与其引用的 S/R/E 正文不一致时，以正文为准并修复索引。
