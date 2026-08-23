---
name: coo-business-operator-mandate
description: 2026-07-21 CEO 把 COO「发」从 release/QA 队长重定义为激进业务操盘手；我的扩编研判结论（拆函数不拆角色 + 新建 market-analyst 单角色）
metadata:
  type: project
---

# 2026-07-21 COO 线重定义（CEO 常设授权）

**事实：** CEO Haoxiang Xu 于 2026-07-21 给 pupu-coo「发」下常设授权升级：从"发布/QA 质检长"升为**激进业务操盘手**——终极目标盈利、极高话语权、可据用户需求+市场调研持续微调项目方向并给 dev/CTO 输出可走方向、主动创造机会、有营销操盘风范。CEO 明确认可为此扩编（原话"你看看是不是需要一个市场调研团队"）。

**Why:** CEO 是单人开发者，速度是核心痛点；需要一个能把市场/用户信号转成产品方向的业务大脑，而非被动汇报。

**How to apply:** 以后研判 COO 线，基线已不是"运营闭环"而是"业务操盘 + 发布问责"。COO 的注意力主战场是市场/盈利/方向（连续），发布 go/no-go 是附带的问责帽子（episodic）。

# 我给 head 的研判结论（pending CEO 批准，未落地）

- **Q1 发布/QA：拆函数不拆角色。** 不新建 release-manager（会与「验」重叠+给 solo founder 加编排税）。COO 保留 release GO/NO-GO 决策权（episodic、只做决策），release-QA **执行**下沉给已有的「验」(端到端)+「擎」(后端测)+「守」(安全 sign-off)；COO 从"跑测试的人"变"看证据拍板的人"。风险：分心的 COO 可能把 go/no-go 变橡皮图章——若发布事故上升，未来再评估把 release 决策升格给「验」。
- **Q2 扩编：新建 1 个单角色 pupu-market-analyst 直挂 COO，不成团、不设 lead。** 理由：lead 三判据全不成立（无共享代码/COO 本就是合成出口/COO 对 CEO 代表业务线）。marketing/content 角色**押后**（YAGNI，需求未 2+ 次复现；初期营销执行由 COO 自操 + 走「巡」的渠道洞察），触发条件=content/campaign 工作 2+ 次复现且实测压垮 COO。
- **market-analyst 边界（不重复造轮子）：**
  - vs「巡」growth-ops = 巡向内（自家 repo 遥测：gh traffic/downloads/community，"我们健不健康"）；analyst 向外（竞品/市场/定价/变现/定位，"市场在干嘛、怎么赢/怎么赚"）。清晰的内/外分野，互相喂料给 COO。
  - vs pupu-ai-researcher = ai-researcher 是技术/AI 域、Codex 驱动代码 teardown、无持久记忆、一次性；analyst 是业务/市场情报、有持久记忆（市场情报是纵向的、要跨周追竞品）、不碰代码。
  - vs「智」llm-expert = 智管 AI 能力战略；analyst 管业务/市场战略。无重叠。
  - 汇报线=COO（业务情报喂业务操盘手；不是技术调研故不挂 llm-expert）。

# 复用判据（组织设计原则，本次首次成文，待第 2 次复用后升格为独立 judgment）

1. **拆函数不拆角色**：一个问责 owner 被新使命拉扯时，先看能否把"执行"下沉给已有角色、只把"决策/问责"留在 owner，而非新建一个平行角色。新建角色要过 warrant（有没有已存在的 owner/会不会重叠）。
2. **无代码角色不设 lead**：产出情报/内容而非代码的角色之间，lead 三判据（代码强耦合需单一出口/意见需合成/需对外代表）几乎必然全不成立——合成出口用上级（COO）即可，拍平直挂。
3. **内向遥测 vs 外向情报 是两种角色**：自家指标（向内、gh 引擎）和市场竞品（向外、web 引擎）方法与记忆姿态不同，不该塞进同一 charter。
