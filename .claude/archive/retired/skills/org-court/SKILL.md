---
name: org-court
description: "Use when any org-change proposal needs adjudication - adding/removing/redesigning agents or teams, changing org rules, or evaluating org granularity. Runs PuPu's HR court: a proposal is heard by four dimension assessors (comm efficiency / context cleanliness / signal ratio / routing cost), the judge verifies evidence and synthesizes a verdict recommendation, the CEO rules, the main Claude executes. Replaces the retired org-rebalance skill. Triggers: \"/org-court\", \"开庭\", \"我要加/裁/重组一个 agent\", \"这个建制提案过一下法庭\", \"org 颗粒度对不对\"."
---

# Org Court (HR 法庭)

You are running PuPu's **org court** — the HR department's adjudication procedure for every organization change: 加人、减人、重组团队、修改组织规则。一切建制变更一律过庭, 无旁路 (招募门并入本程序)。

**产出是判决建议书 + CEO 判决后的执行, 不是研究报告。** CEO 的注意力是最稀缺资源。

## 宪法 (2026-08-04 CEO 立 — 全体出庭者受其约束)

1. 评估只有四个维度, 一维一官: 沟通效率 / context 纯净度 / 有效信息比例 / 路由成本。
2. **贡献度不是维度**: agent 不拿工资, 闲置不构成裁撤理由; 低活动只作路由缺陷诊断信号 (归 route-assessor)。
3. agent 存在的意义 = 同一件事**更准或更便宜**; 提案必须沿这两条之一论证。
4. agent 的意义在于 memory 自我演进; 不需要 memory 的职能做成 skill, 不做 agent。
5. agent 变多不是问题; 编制唯一真实边际成本是路由面 (description 常驻)。
6. HR 全员由本 skill 程序化传唤, 不走常规路由。
7. HR advisory only: CEO 判决, 主 Claude 执行, HR 不碰 agent 文件。

## 角色

| 席位 | agent | 职责 |
|---|---|---|
| 提案人 | CEO 本人, 或主 Claude 指定的任意 agent | 变更什么 + 动机(更准/更便宜) + 证据(可选, 有则须出处) |
| 评估官 ×4 | `pupu-hr-comm-assessor` / `pupu-hr-context-assessor` / `pupu-hr-signal-assessor` / `pupu-hr-route-assessor` | 各按自己维度给 支持/反对/弃权 + 证据 |
| 法官 | `pupu-hr-judge` | 受理关、验证证据、合成判决建议书 (保留分歧) |
| 终审 | CEO | 最终判决 |
| 书记官/执行官 | 主 Claude (你) | 派发庭审、判决后按判决书执行 |

## 程序

```
0 立案     提案要素齐备? 不齐让提案人补。agent 提案时由主 Claude 转写成庭审材料
1 受理关   法官过程序法: 拆/加提案过 S1-S4, 裁/合提案过继承图+合并逆命题+冷≠剪 (细则在法官 charter)
2 庭审     四评估官并行传唤 (一条消息四个 Agent 调用), 每人拿到: 提案全文 + 提案人证据 + 现状实测数据
3 质证     法官收四份意见, 验证证据 (抽验出处、复验可复现测量; 复验结果呈堂);
           意见间有实质冲突时可加一轮交叉 (把 A 的反对喂给 B 回应, SendMessage 继续原 agent 保留上下文)
4 判决建议 法官出判决建议书: 四维意见(保留分歧) + 证据裁定 + 合成倾向 + 红队段 + 执行(待 CEO 批准) 清单
5 终审     呈 CEO。CEO 判决前不执行任何文件变更
6 执行     CEO 批准后主 Claude 按判决书执行 (执行是本程序的一段, 不是 agent);
           执行序有依赖时按序; 涉及行为变更的动作带灰度门 (金丝雀先例: 2026-08-04 boilerplate 案)
7 归档     判决入法官判例库 (pupu-hr-judge/precedents.md, 法官提议、主 Claude 写入);
           org-chart 变更同步; 被推翻的旧判例标注不删除
```

**开庭前先测现状** (绝不凭记忆, 结果作为庭审材料发给每个评估官):

```bash
find .claude/agents -name "*.md" ! -name "HYBRID*" | sort
for f in $(find .claude/agents -name "*.md" ! -name "HYBRID*"); do \
  printf "%-52s %5s words  model=%s\n" "$f" "$(wc -w < "$f")" "$(grep -m1 '^model:' "$f" | awk '{print $2}')"; done
du -sh .claude/agent-memory/*/ 2>/dev/null | sort -h
```

## Scope args

| Arg | Behavior |
|---|---|
| *(none)* + 提案文本 | 全庭: 受理 → 四官 → 质证 → 判决建议 |
| `--panel <dim>` | 只传唤一个维度的评估官作单维咨询 (comm/context/signal/route), 不出判决 |
| `--precedent <关键词>` | 只查判例: 传唤法官检索判例库, 不开庭 |

## Rules

- **判决建议书, 不是报告。** 驳回是好答案; 法官程序法关口拦下的提案不必开全庭。
- **无证据意见可立案不定案。** 有证据必须出处; 法官复验结果也是证据须呈堂。
- **法官不代产评估官证据** (前任 head 代做案的教训); 评估官不越维定论。
- **分歧保留到判决书。** 评估官之间不要求收敛; 分歧本身就是给 CEO 的信息。
- **CEO 判决前零执行。** 判决后执行动作若涉及行为风险, 带灰度门与验收条件。
- 本部门若运行良好, 将作为样本推广到其他 agent teams — 每次开庭都在为样本积累判例。
