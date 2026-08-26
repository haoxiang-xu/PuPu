---
name: ci-posture-2026-06-26
description: 2026-06-26 CI 现状诊断；CI 已存在且 PR 上跑三层229测试，真缺口=无branch protection+无push触发(装锁不是新建)
metadata:
  type: project
---

2026-06-26 CEO 觉得 repo "不太正规"、问要不要加 CI 跑测试。CTO 诊断后纠正前提：

**事实（读 4 个 workflow + gh api 核实）：**
- `release-qa.yml` 已是完整 PR CI：触发 `pull_request→dev/main` + tag `v*` + 手动。`deterministic-checks` job 在**每个 PR 上无 gate 地跑三层全部测试**：`test:frontend`(L98)+`test:electron`(L104)+`pytest tests/`(L112)+`npm run build`(L120)+`test:release-qa`(L126)。229 个测试(205 JS/CJS+24 py)全覆盖。
- `package-matrix`(Win/Linux/Mac×Intel 四平台 unsigned build)**只在 tag/release 跑**，且**只 build 不 run**（构建 PyInstaller 二进制，从不启动它）。
- **真缺口非"建 CI"**：① `gh api branches/{main,dev}/protection` 全 404 → 无 branch protection → CI 跑着但不挡合并；② 无 `push` 触发 → 直接提交 dev（团队实际工作流，git status 为证）完全绕过 CI，直到 dev→main PR 才首次检验。

**Why:** CEO "不正规"直觉对、诊断错（以为没 CI）。重建 CI = 浪费；现有 infra 很扎实，缺的是"装锁"。

**How to apply（推荐方案，待 CEO 批）：**
- **Tier 0(LOW,1-2h,地基,现在做)**：给 `release-qa.yml` 加 `push: branches:[dev,main]`；给 main 开 branch protection 把 "Deterministic QA" 设 required check。这是 [[prelaunch-gap-analysis-2026-06-26]] 第4件"深度测试"的护栏——CI 挡不住坏改动进 main，深测就白做。
- **Tier 1(MEDIUM,深测阶段,不进 PR 门禁)**：给 package-matrix 加 smoke-launch 步（启动打包二进制+健康检查 Flask，Linux 需 xvfb），对应"Win/Linux 冻结二进制从没真机验过"红旗。**不要**把四平台构建塞进每个 PR（慢且贵，PR 门禁应分钟级）。
- **派发**：Tier 0→pupu-coo 主理（治理+发布运维线），dev-electron 顾问测试调用；Tier 1 harness→dev-electron 建，coo 接进 release 门。
