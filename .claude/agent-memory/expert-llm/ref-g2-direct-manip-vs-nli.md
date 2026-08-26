---
name: ref-g2-direct-manip-vs-nli
description: 愿景研究 G2;直接操作 vs 语言界面的 HCI 理论+2024-2026 实证一手出处与具体数字(需复核)
metadata:
  type: reference
---

愿景研究集群 G2(直接操作 vs 自然语言界面;检验 CEO "文字=CLI" 类比)的一手出处。数字均"需复核"——论文会更新/我从 PDF 抽取可能有误。

**理论根基**
- Hutchins, Hollan, Norman (1985) "Direct Manipulation Interfaces" — gulf of execution / gulf of evaluation;semantic vs articulatory directness。PDF: https://www.lri.fr/~mbl/ENS/FONDIHM/2013/papers/Hutchins-HCI-85.pdf
- Shneiderman direct manipulation 三原则:对象持续可见 / 物理动作代替语法 / 快速增量可逆且即时可见。
- Shneiderman & Maes (1997) "Direct manipulation vs. interface agents" Interactions 4:42-61 — 直接操作 vs agent 的经典之争。

**核心实证(2024-2026)**
- "Generative Interfaces for Language Models" (Stanford, Diyi Yang 组) arXiv 2508.19227 — GenUI vs ConvUI;headline 最高 +72% 偏好;总 84% win rate(vs Claude 3.7 artifact baseline 是 IUI,GenUI 仍胜 58%);**域分化**:数据分析/可视化 93.8%、商业策略 87.5%、Advanced AI/ML 仅 50%(数学密集场景纯文本仍可);交互式任务 80%;真实用户 380 query 仅 50.8% win / 41.1% loss(去掉策划任务后优势大幅缩水)。失败模式:familiarity 惯性、easy "how-to" 场景 GenUI 增加不必要认知负荷反被 ConvUI 胜。PDF 本地抽取于 /tmp(已失效,重抽 arxiv)。
- "DynaVis" arXiv 2401.10880 (Glassman/MS) — NLI + 动态合成持久 widget 混合;n=24 偏好混合界面;论点:NLI 放弃了 GUI 的探索/重复编辑/即时反馈。
- "Bridging Gulfs in UI Generation through Semantic Guidance" arXiv 2601.19171 — 把 Norman gulfs 套到 LLM 生成 UI;naive 生成三大病:inconsistency / wrong affordance / control deficiency;迭代会放大 gulf("semantic drift");n=14 UI/UX practitioner,语义中间层显著优于纯 chat 生成(Wilcoxon,gulf-of-execution M=5.93 vs baseline;多项 p<.05)。

**与 PuPu 关联**:artifact-summary 渲染 = 初级 GenUI;recipe graph/flow_editor = 直接操作侧已有载体。CEO "最后一公里精确编辑交给直接操作"与 DynaVis "持久 widget" 论点一致。
