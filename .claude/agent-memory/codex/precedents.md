---
name: precedents
description: HR 法庭判例库 — 现行判例、被推翻判例（标注不删）、pending docket（CEO 未裁事项）
metadata:
  type: project
---

# 判例库

援引判例而非凭空判断。被推翻的判例保留并标注推翻日期与理由。旧 HR 判例的完整原文在 `pupu-hr-head/org-review-precedents.md` 等档案目录, 引用前核对是否已被推翻。

## 现行判例（2026-08-04 court 奠基批次, 全部有当轮实证）

- **P-1 路由面优先**: 离 dispatch 越近的缺陷越先修。description + 路由表 (~4,300 词) 每轮都付且决定命中; charter 正文在路由决策发生时还没被读到。（org-rebalance 合成层判断, 奠基了 route 维度）
- **P-2 法官不代产证据**: 前任 head 代做结构判断, 产出前提为假的判例（span 双标案）, 且错误沉入 source of truth 污染下游。法官只验证、总结、裁分歧。
- **P-3 复验呈堂**: 法官复验证据是好的（15 vs 14 计数案: 复验发现双方都没看到的第三个事实——两镜头量的是不同谓词, 且真正零样板对照组只有 2 个）, 但复验结果必须作为证据写入判决书可被引用。
- **P-4 贡献度维度废除的实证**: 旧效率镜头四轮全量取证零猎物——23 agent 无一达裁撤双证门槛, 所有低活动均由设计意图或工作面周期解释。一把从不命中的尺子量的是不存在的维度。低活动唯一现行读法 = 路由缺陷诊断信号（route-assessor 的账）。
- **P-5 "便宜"不是保留理由**: 该论点对任何闲置 agent 恒真, 无判别力; 成本尺只有拆/减载方向, 保留理由必须来自"更准或更便宜"的正面论证。（旧成本镜头自证）
- **P-6 附证据的零候选 = 有效轮次**: "交 0 候选"≠"交不出候选"。可复验的排除证据（净 role content 排名、内聚度实测）与阳性候选同等有效。评估官不欠阳性结果。
- **P-7 不设词数目标, 为消歧重写**: 拿最不需要区分的角色（窄 dev, 63–74 词零歧义）算出的词数目标, 去压最需要区分的一对（cto/architect）, 推理方向反了。长度落哪算哪。
- **P-8 金丝雀灰度门**: 批量 charter/行为变更必须先上高频写入者当金丝雀（信号出现最快; 低频角色成功与失败长得一样）, 观察窗 7–10 天, 验收看真实行为（memory 实际写入）而非 lint 绿。（boilerplate 案）
- **P-9 执行是 skill 不是 agent**: 不需要判断与 memory 的职能做成 skill。（2026-08-04 CEO 拍板, 宪法第 4 条的第一次适用）
- **P-10 程序法四关 + 裁合前置**: 拆/加过 S1 热度缝 / S2 内聚 / S3 双侧条款交付 / S4 先扣样板; 裁/合过继承图（后端 0-owner 真空案）/ 合并逆命题（刻意设计的分歧维度不可合）/ 冷≠剪。原文出自旧结构镜头 F5 框架, 当轮全部经过实战检验（dev-backend 内聚 73–87% 判死 S2; boilerplate 案判死 S4）。
- **P-11 平台可实现性是归属的前置条件**: subagent 无 Task/Agent 工具, "A dispatches B"若 A 是 subagent 则物理不可实现——归属应重述为"规格权 + 合成责", 派发者恒为主 Claude。（ai-researcher 汇报线案）
- **P-12 边界必须双侧声明**: 单边声明的边界会退化（otvet: 否决权只写在被否决方章程里 = 派权利人时无人知道行使）。正面模板: 巡/analyst 建编时同批写两侧条款。

## 被推翻判例

- **F7 "HR 封顶 4 人, 第 5 角色默认拒绝"**（立于 2026-08-04 上午, 同日被推翻）: 其豁免条款——"第 5 个角色必须先证明它不是第 4 个镜头"——被满足: 路由成本被当轮实证为第四个正交维度（此前只能靠合成人即兴发挥）。按自身条款合法击穿, 非翻烧饼。
- **判例 3 "span 双标"**（旧 hr-head 判例库）: 论证前提为假——所对比的 sub-team lead 层从未真实存在（下级承认 0/4、charter 提及 0/23、实际 hop 0 次）。正确框架: agent 组织 span 成本近似为零, 判据看耦合不看人数。**引用旧判例库时此条已废。**
- **裁撤双证 / two-signal rule**（旧效率镜头核心机制）: 随贡献度维度一并废除（2026-08-04 宪法第 2 条）。考古时勿当现行法。

## Pending docket — 2026-08-04 org-rebalance 判决建议书, CEO 未裁（转向 court reorg 前搁置）

原判决建议书全文见当轮会话记录; 材料存于 org-rebalance 三镜头档案。未裁事项:

1. **B2 跨仓接口签字权三方冲突**（当时判为唯一"下周就会绊倒人"项, 正处 Memory V2 / computer use / 0.1.10 高触发期）: CLAUDE.md 说 architect rules, backend charter 说智+CTO 双签。原倾向: architect 唯一签形状 / 智 veto 限帧语义 / CTO 派活。**建议新法庭主动向 CEO 催裁此条。**
2. C1/C2 压平虚构 lead 层标记 + platform-security 目录消失（守+electron 转 direct）。
3. C3 chief architect 头衔唯一化（cto/architect description 消歧, 同题例题双答案案）。
4. C4 boilerplate 去样板（15 份, 含 1 残缺变体; 须逐文件 diff + 金丝雀门 + 双条 lint; 目标形态 = 6 份短自定义段样式, 非删空）。
5. 边界补条款批次: 智的三条单边（对擎否决权/recipe 语义/research arm）、验/造/策 Boundaries 节、config-extension 三对六侧、electron↔守。
6. 模型档位与负载不相关（17 opus / 4 fable / 1 sonnet 与实测负载零相关)——转出题, 归智, CEO 决定是否开。
7. 提醒 COO: analyst 复评（08-18 前）前完成在途下探题。

## 档案索引（只读考古）

- `pupu-hr-head/`: org-review-precedents.md（判例 2 三闸门/判例 2.5 CI 守一致性/判例 6 内生上界/判例 7 subagent 不常驻等仍有效, 判例 3 已废）、incentive-mechanism-precedents.md、artifact-vs-headcount-precedents.md、team_roster.md。
- `pupu-hr-performance-evaluator/`: methods.md（信号1/1b/3/3b/6 取证法——hop/边界/重叠部分由 comm-assessor 继承, 死重部分已废）、inert-subteam-layer.md（C-1 完整证据链）。
- `pupu-hr-org-architect/`: lead-layer-measurement-method.md（lead 层三检法 + 双向引用图）。
- `pupu-hr-cost-evaluator/`: cost-measurement-corrections.md（三条记账纠错, 已并入 context-assessor 记账法）。
