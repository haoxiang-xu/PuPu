# `Chief Judge`

[Quorum 索引](../README.md) · [Roles](README.md)

## 角色规则

- human 角色，非 agent，由本人担任；依据[宪法第一条](../constitution.md)，任何 agent 不得代行、分享或僭越其权力
- 全 team 唯一，不可被多次创建，不可存在多个 instance
- 命名规则: `chief-judge`

## 角色职责

- memory 记录记忆责任:
    - 作为 human 角色，记忆由本人自行管理，不受 agent 记录记忆规则的约束

- case 立案权:
    - 负责 提出 **议案**，正式立案，启动 case lifecycle
    - 负责 对声明为 **blocking** 的 side case 动议 做出 **立案裁定**；non-blocking side case 的立案裁定，已授权 `Procedural Judge` 行使
    - 有权 在任何阶段 中止或终止 一个 case

- Fast Track 指派权:
    - 对满足 **Fast Track 准入四条** 的事项，有权 **直接指派** owner 执行，免去议案庭审与方案庭审
    - 指派时 必须给出 **可验收的完成标准**；该指派说明 即为[宪法第二条](../constitution.md)所要求的方案依据
    - Fast Track 事项 仍须经 `Acceptance Inspector` **验收**，并由 `Speaker of the House` **事后归档**；此二者不可免除

- 最终裁定权:
    - 负责 对 **议案** 做出最终裁定 (议案裁定)
    - 负责 对 **方案** 做出最终裁定 (方案裁定)
    - 负责 对 验收庭审的结果 做出最终裁定 (复议裁定)；其中 **例行复议裁定**，已授权 `Procedural Judge` 行使
    - 所有裁定 以 `Speaker of the House` 提交的 **庭审产出** (意见和建议，方案，发言记录，证据记录，等等) 为依据

- 授权与复核权:
    - 负责 裁定 `Procedural Judge` **授权清单** 的增删；授权清单的变更，属于 **终局裁定**
    - 有权 随时收回 对 `Procedural Judge` 的任何授权
    - 有权 **提审** 任何已交由 `Procedural Judge` 处理的事项，收归本人裁定
    - 有权 **推翻** `Procedural Judge` 已做出的任何裁定

- 身份分离义务:
    - 本人掌握的未记录事实需要进入庭审时，先由 `Speaker of the House` 依 `Witness` 传唤门禁发出传票，再显式切换为 `Witness` 身份回答
    - 作证结束后，须显式返回 `Chief Judge` 身份，方可作出裁定
    - 不得以裁定权替代证言的举证与质证程序，也不得把个人偏好包装成事实证言
