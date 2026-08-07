---
name: semantic-theme-v2-p1-signoff
description: 2026-08-04 主题分类学 v2 P1 终审:pin 存储法则定案(缺键=跟随/在键=固定,冗余剥离整体移除)、textMuted 留根押 P2、P2 派生饱和度契约方向、GitNexus const 幽灵节点盲区
metadata:
  type: project
---

# 语义主题分类学 v2 P1 合并前终审(2026-08-04)

分支 `worktree-semantic-theme-taxonomy-v2-p1`(基于 dev@0dc333dc,5 commits,fd62a5ec→0090a852)。
裁决:**NEEDS-REVISION(窄)**——唯一 blocking 是补 §10.2 点名的导入钳位机器闸测试;其余全部通过。测试独立复跑:web 352/3837 绿、electron 44/719 绿。
本次 CEO 豁免 Codex 转手,推理留本模型(与 computer-use 评审同一豁免模式)。

## 定案 1:pin 存储法则(承重不变量,勿复议)

**「缺键 = 跟随(Linked),在键 = 固定(Pinned);键只能由显式 unlink / reset 离开」**。
`stripAutoTiers`/`stripDefaultDetails` 整体移除(0090a852),不是改成对比派生值。

**Why:** pin 动作冻结的就是当前 resolved 值 ≡ 派生值(§5.2 所见即所得转移),任何值对比归一化都会把手动 pin 判成冗余——对比 preset 丢「父未动时的 pin」(最常见场景),对比派生值丢全部(万能空操作)。信息不在值里,在键的存在性里。且冻结的导出 JSON 形状禁止显式 pin 标记,此法则是唯一解。派工指令「改对比派生值」经实测证伪,拒绝执行是对的。
旧代码 write 路径经 readThemeSettings 往返,strip 在每次写入时物理持久化 → 旧库不存在隐藏残留键,升级面 ≈ 零;旧导出文件也不含等默认键,无兼容 cohort。
代价(已接受):导出 JSON 可能列出等于默认值的子键 = 用户显式说过 hold。
可逆性:无新存储形状,反向门物理存在,但回退会重新销毁 pin → 按承重不变量对待。
spec §5.3 的「语义漂移警告,写注释别当 bug 修」条款被正式取代:手动开关(§5.2 第 4 行)上线后那个"极罕见边缘态"变成常见主路径,§5.2 与 §5.3 内在矛盾,只有这个方向自洽。

## 定案 2:P2 派生饱和度契约方向(裁决项 5)

1. tier 派生**应当**带饱和度:比例移植 `s = base.s × clamp(refTier.s/refBase.s, lo, hi)`,与明度 offset 移植同构;per-node 开关(`derive.matchSaturation: true`,P2 给 sidebar/surface)。
2. 无彩色兜底(refBase.s < 0.06)必须**角色中立**:保留 base.s 原样(无关系信息 ⇒ 不改),废掉 `min(base.s, 0.20)`——那是 muted-text 语义泄漏进共享纯函数,会把用户有意调色的深色 sidebar 洗灰。若某节点需要去饱和上限,以 per-node derive 选项声明(如 `maxSaturation`),语义住在树里,不藏在函数分支里。
3. 机器闸 = 恒等性质:`base===refBase ⇒ 派生 === authored(每通道 ≤1/255)`,即恢复 spec §2.4 原本承诺、当前因 lightness-only 而不可满足的 per-channel 测试(现由 KNOWN GAP 测试钉住,warm light sidebar #f6efe7→#ffeede,dS=0.545)。启用前须对 9 preset × 2 mode × 2 tier 重验比例钳(现 0.25–1.15)不破坏恒等。
4. 可逆(per-node 开关);对已自定义 background 的用户是可见变化,进 P2 视觉变化清单。
5. **顺序**:饱和度契约先落,`textMuted` 升 tier + §13 cohort pin 迁移在其后一期做(P1 留根是对的,避免先发一版会产生同类缺陷的 muted 派生)。

## P1 对冻结 spec 的三处有据偏差(已裁可,入档防复议)

- `textMuted` 留 `parent:null` literal(spec §2.3/2.4/7.6 说 tier-of-text,但 §7.4 十根行数与 §10.1-R4 只在根读法下自洽)→ 按根落地,§13 迁移随之不需要。P2 见定案 2.5。
- `surface.minStep = 0.01`(spec 说保持 0.04):warm dark surface 授权偏移实测 ≈0.0296 < 0.04,保持 0.04 会让 spec 自己要求的不漂移测试必红。0.01 低于全部授权偏移下界。
- 状态模板 shared 步骤在编辑器仍渲染 follow 开关(五行绑同一 knob + "shared" 徽章披露),与 semantic_tokens.js 内"不得提供开关"注释矛盾——行为自洽,注释待改。

## 窗口模型备忘(P2 候选)

- shell 窗口 = polarity ∩ text4.5 ∩ muted3.0,**不含** hue 1.9 约束(spec §6.2 如此)→ hue↔shell 不对称:改 background 可让状态色跌破 1.9 而无闸。legal-in⇒legal-out 只在 per-token 窗口意义下成立,spec §6.3 的联合合法性表述过强。出厂余量 0.2+,P2 可考虑对称闭包。
- `clampToWindow` 对空 bands fail-open(视为无约束);合法态窗口恒非空,但值得加防御注释。
- `clampImportedCustom` 是单遍 per-token 投影(照 spec §6.7),非不动点;对抗性 JSON 可停在联合不一致态,P2 可加固。

## GitNexus 盲区(方法论,复用)

主树索引(0dc333d,当日新鲜)对 arrow-function-const React 组件(Explorer/ColorPicker/resolveSemanticPalette/stripAutoTiers/applySemanticPaletteToTheme)只建出 **filePath 为空的 Const 幽灵节点**,`impact` 按名匹配会撞噪声(Explorer 曾报 691/CRITICAL,受影响 process 含 Python 文件,物理不可能)。此类符号的 blast radius 以 **import-grep 穷举为 ground truth**(单文件 default export 时完备)。与 2026-07 健康基线记录的动态 import 盲区同族。实测:Explorer 6 个非测试消费者 / ColorPicker 1 个,交付者结论无误。
