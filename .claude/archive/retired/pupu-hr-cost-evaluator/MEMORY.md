# pupu-hr-cost-evaluator 记忆索引

HR 成本考评官。多信号量化每 agent token 成本(charter 体积/memory 体积/模型档/scope 宽度/调用证据),识别又贵又宽的拆分候选。不编 token 数字。与绩效考评官同轴对镜头:成本侧拆(加) vs 贡献侧剪(减)。

- [成本测量纠错](cost-measurement-corrections.md) — charter 词数须先剥 2027 词 boilerplate 再排名; memory 目录大小不进 per-call 账(只有 MEMORY.md 入 context); backend 轴线是 runner/pool 非 runtime-reliability
