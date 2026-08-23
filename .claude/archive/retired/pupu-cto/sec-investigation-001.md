---
name: sec-investigation-001
description: PuPu 首次全面安全调查（2026-06-10 启动）— 守主导、全 dev 参与，三条信任边界基线 threat model 落地 + 教育目标
metadata:
  type: project
---

**SEC-INVESTIGATION-001：PuPu 首次全面安全调查，2026-06-10 由 CEO 指令启动。**

**Why:** CEO 要把守（pupu-security-expert）onboarding 时定的三条信任边界基线 threat model 从纸面落到代码 file:line；同时是教育动作——让每个 dev 在配合审查中"看见"自己地盘的攻击面（CEO 衡量成败的核心是这个，不是 bug 数量）。守的三优先事项①基线 threat model ②MCP 供应链 vetting bar ③工具确认门控可信度，本次①直接落地、②由 dev-toolkit 面对接、③贯穿边界③。

**How to apply（这次调查的结构，未来复用）：**
- **组织位置（2026-06-10 reorg 后）：** 守挂 CTO 线 / 平台与安全组（lead=dev-electron），但 severity 定级 / HIGH-CRITICAL 上报 / 发版 sign-off 越级——定级与上报直达 CTO 仲裁、发版 sign-off 对 COO，均不经组长。本次调查的定级与仲裁链不受 sub-team 影响。见 [[team-roster]]。
- **三条信任边界**（守 onboarding 定的，见 [[security-expert-onboarding]]）：① renderer↔main IPC ② main↔Flask 本地 HTTP（未认证本地攻击面）③ app↔第三方 MCP/LLM 内容（默认 attacker-controlled）。
- **分工：** 每个 dev 查自己功能面对应一条主边界。CTO 从架构视角给每区点名了"最担心的 1-2 个必查点"（不穷举，是高风险接缝）。**Flask sidecar（unchain_runtime/server）无专属 dev，守直查**——这是边界②的核心。
- **两条跨层接缝需三方合看，不能各查各的：**（1）main 进程同承边界①②是信任链中点；（2）秘密链路 dev-settings 存→payload 带→dev-electron 转发→守的 Flask 用，横跨三人。守在汇总阶段负责拼接。
- **交付物：** findings 必须 file:line + severity(C/H/M/L) + verified/suspected + boundary + exploit 场景 + mitigation；定级由守统一裁量避免各 dev 标准不一。**每个 dev 另交一份"我学到的隐患"反思**（教育目标的可见产物）。
- **流程：** 守出 7 份审查清单(6区+Flask)→交我对齐→dev 按清单自查+补暗角→守汇总复核定级→HIGH/CRITICAL 报我仲裁（修/缓解/accepted risk 写 ADR）→缓解交 QA 变回归测试（exploit 即 test case）。
- **纪律：** 改结构前仍强制 GitNexus impact，不得借安全之名跳过；HIGH/CRITICAL 不得在仲裁前 silent fix；本次调查只产 findings+缓解，不改产品行为，修复另行排期。

完整契约见 [[security-expert-onboarding]]；准则见 [[architecture-operating-principles]]；team 见 [[team-roster]]。
