---
name: ref-proactivity-calibration
description: 愿景研究 C3;"agent 该不该打扰/何时打扰"的一手论文+HCI证据与可落地设计原则(默认沉默/行为触发/期望效用闸门)
metadata:
  type: reference
---

愿景研究集群 C3:proactivity 校准 —— 对应 CEO 原话"无意义的主动只会让用户烦,必须正确时间正确帮助"。关联 [[a2a-channel-direction]] 的多 agent / 伪常驻方向。

核心研究结论(2025-2026 学界一致):**过度打扰(over-triggering / unwarranted intervention)是 proactive agent 头号失败模式,不是"主动不够";应默认偏向沉默。**

取证位置(漂移项:benchmark 分数随模型迭代,需复核;模型 ID 用 claude-api skill 现查):
- PROBE *Beyond Reactivity* arXiv:2510.19771 — proactivity 三段流水线:搜索未明示问题→定位瓶颈→执行**恰当**解决;最强端到端仅 40%(GPT-5 与 Claude Opus-4.1 并列)。
- KnowU-Bench arXiv:2604.08455 — proactive 四类失败:false passivity / unwarranted intervention / post-rejection violation / GUI失败;intervention calibration 任务前沿模型掉<50%。线上指标可直接借这四分类。
- π-Bench arXiv:2605.14678(点名 OpenClaw)— task completion 与 proactivity **解耦**;长流程能力 ≠ 知道何时主动。回应"长流程"矛盾:两者分开建模/评估。
- ProAct/idle-time compute arXiv:2605.25971 — 空闲时无声**预备**(非定时轮询):turns -14.8% / effort -11.7% / 幻觉 -28.1%。范式:预备与打扰解耦。
- ProAgentBench arXiv:2602.04482 — 真实会话 500h+/28k 事件;proactive = timing prediction + assist content 两段。
- "Accurate Failure Prediction ≠ Effective Prevention" arXiv:2602.03338 — 离线 AUROC 0.94 的 critic 上线可让模型崩 -26pp;介入有 disruption-recovery 权衡;价值在于识别**何时不要介入**;上线前用 ~50 任务小试点估净帮/净害。
- Horvitz Attention-Sensitive Alerting arXiv:1301.6707 + erichorvitz.com/cacm-attention.htm — 注意力是 "rare commodity/critical currency";决策规则:仅当 E[告警效用] > E[中断成本] 才告警(效用=信息收益−中断代价,含时效性 EVI)。BusyBody/bounded deferral:延迟到自然断点但设最大延迟上限。
- CHI'25 *Assistance or Disruption?* arXiv:2502.18658 — 398 次主动:53.3% 有效/34.7% 忽略/12.1% 实际打扰;高接受触发=多行改动73.1%/写注释69.2%/跑程序66.7%(全是用户行为信号);**"空闲检测"完全失败**——长时间不动常是深度思考,不是过载。

**对 PuPu 的工程要点(给设计/CEO 用,非我拍板):**
1. 决策用 Horvitz 期望效用闸门,τ 默认高、先验偏沉默(误报代价不对称地高)。
2. action-triggered 不是 time-triggered;**空闲≠机会**(直接对齐"不做真 heartbeat")。
3. 预备(静默)与打扰(稀有)解耦 → 化解"我不在时它在忙 vs 不做真常驻"矛盾:忙是静默预备。
4. 度量:KnowU 四分类率 + post-rejection 复发率 + CHI'25 effective/ignored/disrupted 三态;disrupted 率设硬上限。
5. 拒绝即学习:被拒后抬高该类 τ(贝叶斯更新)。
