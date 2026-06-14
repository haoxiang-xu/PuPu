---
name: security-expert-onboarding
description: pupu-security-expert（守）加入背景、组织位置、与 CTO 的协作契约（安全 ADR review + HIGH/CRITICAL 上报仲裁）
metadata:
  type: project
---

**pupu-security-expert（守）于 2026-06-10 加入团队。** reorg 后挂在 **CTO 线 / 平台与安全组**（lead=pupu-dev-electron，因守的两条信任边界=electron 地盘）。**但守的安全裁量权不下放给组长**：severity 定级 / 发版安全 sign-off / HIGH-CRITICAL 上报均越级直达 CTO/COO，组长只协调日常 plumbing。组织结构见 [[team-roster]]。

**Why:** PuPu 有真实的、attacker-reachable 的信任边界，此前没有专人盯：
1. renderer ↔ main（IPC）— 被攻陷的 renderer 能否经 bridge 提权。
2. main ↔ Flask sidecar（本地 HTTP）— 未认证本地进程能调什么、路径遍历、provider URL 的 SSRF。
3. app ↔ 第三方内容/代码（MCP server 执行第三方代码、LLM 输出、workspace 文件）— 这些默认是 attacker-controlled。
随 MCP 商店与 workspace 能力扩张，供应链与 prompt-injection 面在长大，必须有人专职防御。

**How to apply（我与守的协作契约）：**
- **架构仲裁权仍归我。** 守提风险 + 缓解方案（带 severity 与 tradeoff），跨层改动由我拍板。守不单方改架构。
- **安全相关 ADR 必须经守 review** 后我才定稿（尤其触及三大信任边界、秘密存储、MCP 安装流、自动更新的决策）。
- **守发现 HIGH/CRITICAL 风险 → 上报我仲裁**，我决定是修、是缓解、还是记为 accepted risk（accepted risk 须连同 tradeoff 写进 ADR，避免每次 review 重新打架）。
- **发版门禁：** COO（pupu-coo「发」，reorg 后由 product-ops 升格收编 growth-ops）跑发布，但触及信任边界的 release 需要守的安全 sign-off，**sign-off 对象=COO**（不经组长，参与上线前同步会，见 [[meeting-mcp-launch-2026-06-09]] 模式）。
- **缓解 → 回归：** 守设计的缓解措施交 QA 落成回归测试（exploit 场景即 test case）。

**跨界分工边界（避免与既有专才重叠）：**
- vs curator（策）：curator 管商店条目数据与连通性；**安全 vetting 标准（command/args 卫生、来源信誉、权限广度）归守**。见 [[adr-toolkitid-stability]]、[[contract-toolkit-catalog-shared-id-space]]。
- vs llm-expert（智）：llm-expert 管模型行为与 tool-use 语义；**对抗鲁棒性（injection 抵抗、exfiltration、confirmation 绕过）归守**。
- vs dev-electron（建）：守定 fix 契约（校验什么/在哪/对什么），owning dev 实现（除非小且在守已 trace 的安全关键路径上）。

完整名册见 [[team-roster]]；工作准则见 [[architecture-operating-principles]]。
