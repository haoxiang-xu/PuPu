---
name: ai-investigation
description: Use when a question needs first-hand evidence rather than an opinion - investigating an unfamiliar OSS AI/agent/LLM project, or tracing exactly how a local workflow behaves with zero assumptions. Runs a zero-belief, falsification-driven investigation on Codex (gpt-5.5, xhigh) and returns a FACT/HYPOTHESIS/UNKNOWN report with provenance on every claim. Fans out to a fleet when the question splits into independent slices. Read-only, lands no code. Do NOT use for design decisions, opinions, or work whose answer is already in the repo docs.
---

# 证据驱动调查

调查的产出不是"我认为"，是 **经得起证伪的事实**。方法先于题目：**零信念起步 → 先取一手证据 → 主动证伪每个假设 → 只有活下来的才叫结论。**

Codex 是调查者，不是你。你的活是 **划范围、发charter、验纪律、转达**。你自己不去调查目标，也不用自己的先验覆盖 Codex 的发现。

## 流程

**1. 划定 charter** —— 一个可回答的问题 + 范围边界 + 目标（本地路径，或 OSS repo URL）。范围模糊就先收窄，不要让 Codex 自己决定范围。

**2. 备 scratch 目录**（Codex 的工作目录 **永远** 是 scratch，绝不是任何 repo of record）：

```bash
SCRATCH="${TMPDIR:-/tmp}/pupu-investigation/$(date +%s)-<slug>"; mkdir -p "$SCRATCH"
```

**3. 发 Codex**（把下面的证伪协议与报告模板整段写进 charter）：

```bash
# 本地代码目标：只读指向真实 repo，什么都不碰
codex exec -p researcher -s read-only -C <target-repo-path> "<完整 charter>"

# 外部 OSS 目标：让 Codex 自己 clone 进 scratch
codex exec -p researcher -C "$SCRATCH" "Clone <repo-url> into this directory, then investigate. <完整 charter>"
```

**4. 验纪律再转达。** 一行自检：有没有一手证据出处？有没有真的去证伪（不是只断言）？三个桶是不是都填了？缺了就 **带着这个缺口重跑一次**，再转达。

**Codex 输出"断言无证据"，那是你必须打回的失败，不是可以转达的结果。**

## 写进 charter 的证伪协议（顺序不能变）

1. **零信念起步。** 不带先验，不假设"常见做法"。**不把目标自己的 docs/README/注释当真相**——它们是待验证的主张。**不依赖对某个知名 OSS 的训练印象**，当作第一次见。
2. **证据先行。** 读真实代码、跑只读命令、追执行流。形成任何假设之前先积累一手观察。每条观察带出处：`file:line`，或"命令 + 输出"。
3. **假设只能从证据里长出来。** 逐条显式登记。
4. **主动证伪。** 对每个假设去找 **反证**——那个会推翻它的情形——而不是去找确认。确认偏误是敌人。
5. **活下来才算事实。** 经受住诚实证伪 = **FACT**；被反证击破 = **REFUTED**；决定性证据取不到 = **UNDETERMINED**，**绝不因为"看起来合理"就升级为事实**。
6. **三个桶，永不混淆**：FACT（已证伪存活）/ HYPOTHESIS（已形成未验）/ UNKNOWN（证据不可得）。

## 报告模板（Codex 输出，你转达）

1. **Charter** —— 原问题与范围边界，逐字
2. **证据日志** —— 一手观察，每条带出处（`file:line` / 命令 + 输出）
3. **假设登记表** —— 每条：假设、做过的证伪尝试、判定（FACT / REFUTED / UNDETERMINED）
4. **结论** —— 只列存活者，各带置信度与回指的证据
5. **未决问题** —— 定不下来的部分，以及 **缺的到底是哪条证据**
6. **刻意没做的假设** —— 那些诱人但被拒绝的先验，让读者看见纪律是否守住了

## 舰队并行

大问题拆成 N 个 **互不依赖** 的子 charter（按模块 / 文件 / 子问题 / 项目），一个 slice 一次调查，一条消息里并发发出。每份报告 **自足**，不依赖兄弟的发现；**跨报告对账与矛盾标记发生在合成步骤**，由派发者做，不由调查者做。

## 质量线

- 无一手证据与出处的主张不成立。"文档说 X" 不是 "X 为真" 的证据
- 绝不把 HYPOTHESIS 或 UNKNOWN 当结论呈上。合理 ≠ 已证
- 守住 charter 范围；发现范围划错了，**明说**，不要悄悄扩大
- 工具不可用（如无网络无法 clone）→ 报为 UNKNOWN 的限制，不猜
- 调查不决定任何事。它供给证据，取舍归 `chief-judge`

## 透明度（[`hybrid-execution-policy.md`](../../codex/hybrid-execution-policy.md) Mode R）

报告须附：规划/审阅模型 · Codex profile · 工作目录 · 命令形状（凭据 redacted）· 结果。命令要可审计，密钥绝不能出现。
