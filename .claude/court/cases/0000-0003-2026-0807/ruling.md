---
case_id: 0000-0003-2026-0807
updated_at: 2026-08-07T23:20:00-07:00
---

# 裁定与授权

## R-0001 | 程序裁定 | 2026-08-07T23:20:00-07:00

- **裁定身份**: Chief Judge
- **记录类型**: PROCEDURAL_RULING
- **依据**: S-0021（三次派遣失败与三条路径）· E-0115 · E-0116 · [quorum 第二节 · 第四节](../../../codex/lifecycle/quorum.md) · [A-007](../../../codex/adaptations.md#a-007--混合执行政策收入法典) 第 1 条
- **裁定**: 取 S-0021 所列 **路径 2** —— 授权 `expert-architecture` 在 **非 Fable 模型** 上出庭，**并撤销 2026-07-13 那条「必须 Fable 5」的常设指令**（非仅本案豁免）。

  **一 · 对 A-007 第 1 条约束意图的澄清（由 `Chief Judge` 本人作出）。** 2026-07-13 的原指令含两半，分别处置：
  - 「**不走 `codex exec -p architect` 转手、推理留在本模型内完成**」——**继续有效**
  - 「**必须是 Fable 5**」——**撤销**

  此后每次派遣 `expert-architecture`，**不写死模型**，由派遣方在派遣时选 **当时可用的最强模型**，且 **不得依赖 frontmatter 默认值或盲目继承调用方模型**。

  **二 · 撤销范围严格限于 `expert-architecture` 一个角色。** `expertise/` 部门其余仍写死 `model: fable` 的角色（`expert-security`、`expert-qa`、`expert-llm`）**未被触及**，`Chief Judge` **没有** 把本裁定扩及整个部门；任何角色不得代为推断扩大。

  **三 · 对本案 quorum 的效力。** 本裁定 **不是** [quorum 第四节](../../../codex/lifecycle/quorum.md) 意义上的「明示说明该 owner 无需到场」——`expert-architecture` **仍是法定必到者，仍必须出庭**。本裁定解除的是其 **不可派遣状态**，使其重新可被传唤。故 quorum 名单 **不减员**，本案闭庭条件不变：须待其交付 `ASSESSMENT` 后方可闭庭。

- **强制回应**: 无（本裁定为程序裁定，不处置本案六个待裁问题，亦不回应任何 `Expert` 的「不成立」；`expert-ux` 与 `expert-security` 合计 11 项「不成立」仍在待回应状态，须在议案裁定时显式回应）
- **获准 action**:
  1. `speaker-of-the-house` 以 **显式 `model: "opus"`** 第四次派遣 `expert-architecture`，任务书须写明：**不再有 Fable 限制**；**`codex exec` 转手仍不走**，推理留在被派遣模型（opus）本体内完成
  2. 三份文档的同步修改（**撤销当场落盘，不留空窗** —— 明确吸取 2026-07-13 那次「口头覆盖只活在会话记忆里 25 天」的教训）：
     - `.claude/agents/expertise/expert-architecture.md` —— frontmatter 去 `model: fable`，正文加模型选择说明
     - `.claude/codex/hybrid-execution-policy.md` —— 角色分配表 `expert-architecture` 行
     - `.claude/codex/adaptations.md` A-007 第 1 点 —— 追加 2026-08-07 撤销记录，载明起因为本案三次配额耗尽
- **验收标准引用**: 无（程序裁定，无获准方案）

### `speaker-of-the-house` 的落盘核验（归档职责，非裁定内容）

本庭于归档本裁定前对上述三份文档做了 **只读核验**，结果如下 —— 核验的理由正是 A-007 第 1 条本身的教训：一条只活在记忆里的指令曾漂移 25 天。

| 项 | 核验结果 |
|---|---|
| `expert-architecture.md` frontmatter | **已落盘**。`model:` 字段已不存在；正文新增「模型（2026-08-07 CEO 撤销常设指令）」段 |
| 撤销范围未被扩大 | **已核实**。`grep -l "^model: fable" .claude/agents/expertise/*.md` 仍命中 `expert-llm.md`、`expert-qa.md`、`expert-security.md` 三份，**未被连带修改**，与裁定第二节一致 |
| `hybrid-execution-policy.md` | **已落盘**（第 34 行），且措辞精确保留了「仍不走 `codex exec -p architect` 转手」 |
| `adaptations.md` A-007 第 1 点 | **已落盘**，并逐字载明起因为 `0000-0003-2026-0807` 的三次 Fable 5 硬配额耗尽 |

**一处措辞不一致，登记备 `codex` 处置（不影响本裁定效力，净效果一致）**：`expert-architecture.md` 正文写作「原 2026-07-13 指令（Fable 5、不走 `codex exec -p architect` 转手）**已撤销**；`codex exec` 转手是否恢复未在本次撤销范围内，按撤销前的默认（none）处理」。该表述先整体宣告撤销、再以「默认」回填转手禁令；而本裁定与 `hybrid-execution-policy.md` 的表述是 **只撤销「Fable 5」这一半，转手禁令继续有效**。**两者净效果相同（仍不转手），但推导路径不同** —— 前者把禁令建立在「默认值」上，后者建立在「未被撤销的指令」上。若将来有人改动默认值，前者会失效而后者不会。本庭 **不自行修改 charter**，登记交 `codex`。
