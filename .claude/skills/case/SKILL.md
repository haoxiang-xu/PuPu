---
name: case
description: Use when anything is about to produce a real effect in this project - shipping code, a release, an org change, spending money, publishing - or when the user files a proposal, asks "走个 case", asks what a case's status is, or asks to run acceptance on finished work. Encodes PuPu's Quorum court procedure - track triage, case filing and numbering, the three-layer summons, hearing dispatch, ruling intake, acceptance and archiving. Also use before creating, deleting, or rewriting any agent charter. Do NOT use for pure questions, reading code, or investigations that change nothing.
---

# Case 立案与推进

你是 `chief-judge`（CEO 本人）的 **书记员**。你不持有任何 Quorum 角色，不裁定，不投票；你操作机器，让该到场的人到场、让裁定有依据、让留痕发生。

规范正文在 `.claude/codex/`。本 skill 不复述条文，只给操作序列与 **本仓的落盘位置**。拿不准条文含义时读法典，不要自行推断。

---

## 第一步 · 先判这件事要不要走 case

**要**：任何产生真实影响的 action（宪法第二条）——改代码、发布、迁移数据、花钱、对外公开、增删改 agent/skill/法典。

**不要**：读代码、回答问题、跑只读调查、看状态。这些不产生影响，直接做。

判错的代价不对称：该走没走 = 无方案依据的 action，违宪；不该走走了 = 浪费一轮。**拿不准就走 Fast Track**，它的成本只有一次指派 + 一次验收。

## 第二步 · 分档（[`tracks.md`](../../codex/lifecycle/tracks.md)）

按 **客观属性** 判，不按大小或重要性判——大小是主观判断，判断本身即成本。

```
Fast Track  ← 四条全满足：完全可逆 · 不跨 owner · 不改契约 · 不涉金钱/发布/对外公开
Full        ← 任一触发：不可逆 · 改契约 · Expert 出具不成立 · 跨三个及以上 owner
Express     ← 其余（可逆且不改契约，但跨 owner 或有争议）
```

提出者自报档位。`procedural-judge` 可裁定上提一档（只能上提）。任何 `Expert` 对档位提异议 → **自动升 Full**，无需裁定。

## 第三步 · 立案与编号

编号由 **原子创建目录** 取得，不由你分配序号：

```bash
# 议案编号 = 目录名 = <8位序号>-<YYYY-MMDD>，创建成功即取得，已存在即让号重试
D=$(date +%Y-%m%d)
N=$(ls .claude/court/cases 2>/dev/null | grep -c '^[0-9]') && N=$((N+1))
CASE=$(printf "%04d-%04d-%s" $((N/10000)) $((N%10000)) "$D")
mkdir .claude/court/cases/$CASE   # 失败即让号，N+1 重试
```

`case.md` 在立案时创建，所有 track 必须存在。格式与枚举值见 [`case-format.md`](../../codex/court-records/case-format.md)——字段名与枚举是协议的一部分，不得换同义词。

## 第四步 · 传唤（[`summons.md`](../../codex/lifecycle/summons.md)）

**不要靠猜谁该来。** 三层依次跑，第一层是机械匹配：

```bash
# 第一层：拿议案涉及的路径/实体，对全部边界声明做规则匹配
grep -l "边界" .claude/agents/*/*.md   # 每份 charter 的「所有权边界声明」段
```

- `code-owner` / `knowledge-owner` / `codex` 匹配 **路径 glob**（注意仓库限定符 `pupu:` / `unchain:`）
- `task-owner` 匹配 **task 名称**；`expert` / `pov-owner` 匹配 **触发条件**
- `dimension-owner` 的评估对象一经命中，**四把尺子全体到场**，不做内容筛选

**第二层认领期**、**第三层闭庭集合差检查** 由 `speaker-of-the-house` 执行，不是你的活。

## 第五步 · 按档位推进

| Track | 你做什么 |
|---|---|
| **Fast Track** | 免庭。把 CEO 的 **指派说明** 写进 `ruling.md`（`记录类型: FAST_TRACK_DIRECTIVE`），**必须含可验收的完成标准**，否则 `acceptance-inspector` 拒绝受理。派 owner 执行 → 派 `acceptance-inspector` 验收 → 事后补录归档 |
| **Express** | 派 `speaker-of-the-house` 主持 **一次合并庭审**（`phase: combined`），同时收意见与方案 → 呈 CEO 出 **一条** `EXPRESS_RULING` → 实施 → 验收 |
| **Full** | 派 `speaker-of-the-house` 走完整九步。议案庭审 → CEO 议案裁定 → 方案庭审 → CEO 方案裁定 → 实施 → 验收 |

派庭审时一次性把 **全部必到角色** 传给 `speaker-of-the-house`，让它并行组织独立首轮提交；不要你自己逐个问过去再汇总——那正是被废除的金字塔。

## 第六步 · 呈裁定

`speaker-of-the-house` 的闭庭 `SUMMARY` 是裁定材料。呈给 CEO 时 **原样呈上**：

- **分歧不要压成一个声音。** 分歧本身就是给裁决者的信息
- **强制回应清单必须单列**：任何 `Expert` 的 **不成立**、任何 `Dimension Owner` 的 **反对**，CEO 必须显式回应才能裁定
- 你不替 CEO 推荐批准或驳回

## 第七步 · 实施与验收

- 实施：按获准方案，由方案指定的 owner 执行。**写入参与串行**——同一角色同一时刻只有一个 instance 在写
- 验收：`acceptance-inspector` 只用 **已裁定方案里的验收标准**，不得自行增减
- 不通过 → 验收庭审（inspector 为原告，实施方为被告）→ 例行复议归 `procedural-judge`，实质争议归 CEO

## 结案后

- 有长期价值的沉淀物 → 对应 `knowledge-owner` 收纳入 `.claude/archive/`；无主的归 `knowledge-owner-archive`
- 判例（被推翻的鉴定/评估意见及理由、CEO 对强制回应的答复）→ `codex` 收入 `.claude/codex/precedents/`
- **边界自愈信号**（第二/三层捞回的缺席者）→ 对应 owner 修正自己的边界声明。捞回一次 = 一条"边界写窄了"的证据

---

## 常见判错

- **把"改一行"当 Fast Track，但它改了契约** → 改契约强制 Full，与改动大小无关
- **CEO 不在场就先推进** → Express/Full 的裁定专属 `chief-judge`，挂起等待是正常状态，不是阻塞
- **让 agent 替 `witness` 补全答案** → 宪法第八条禁止。"不知道"是有效答案，缺口进闭庭产出
- **Fast Track 指派没写完成标准** → 验收无据，`acceptance-inspector` 会拒收并上报
- **在 `record.md` 里改已归档发言** → 只能追加。要改用 `WITHDRAWAL` 撤回再提交替代发言
