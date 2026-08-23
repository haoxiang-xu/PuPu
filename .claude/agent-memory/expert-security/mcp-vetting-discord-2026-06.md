---
name: mcp-vetting-discord-2026-06
description: Discord MCP 供应链裁决（2026-06-13）——选 IQAI 拒 SaseQ，trustLevel=needs_review，写工具全确认，token 进后端
metadata:
  type: project
---

CTO 委托的第三方供应链裁决（MCP onboarding round Step 3，2026-06-13）。没有官方 Discord MCP server，只有第三方碎片实现。

**裁决：onboard `@iqai/mcp-discord`（IQAI 组织背书 npm），拒 SaseQ/discord-mcp。**

**Why 选 IQAI：**
- 安装向量已亲核干净——npm registry API 查 v0.0.6 的 `scripts` 无 `postinstall/preinstall/install` 钩子（只有 build/start/lint）。`npx @iqai/mcp-discord` 跑预编译 dist，安装期不执行任意代码。这是供应链最关键一项，过。
- IQAI（github.com/IQAIcom，iqai.com，40 repos，2025-01 建组）是真公司，非空壳。TS + npx stdio 契合 PuPu 安装模型。
- 无原生 moderation 工具（无 ban/kick/timeout/role）→ 删掉了整行毁灭性 moderation 威胁，是安全正面。

**Why 拒 SaseQ：** Docker/JAR only，无 npm/pip。PuPu 全是 npx/uvx stdio，没有 Docker 安装路径；硬上等于新增安装向量 + HTTP 绑定（-p 8085）新本地攻击面。是架构变更不是目录条目。星多（354 vs 5）不构成理由。

**裁决参数（交 curator 执行）：**
- trustLevel = `needs_review`（第三方 npm + token = Slack 同类，[[mcp-store-security-baseline]] 词表）。NOT verified。
- **版本锁定**：args 钉 `@iqai/mcp-discord@0.0.6`，禁 `@latest`——个人发布 + 不成熟（5 星、297 下载/月、2025-12 后未发版）。bump 须重审。
- 写/webhook/DM 工具全 `requiresConfirmation:true`；读工具（list/read/get_info）=false。read_messages 是注入入口但不能确认门控，写侧确认才是断链控制。
- token = `DISCORD_TOKEN` 进后端 mcp_secrets.py（~/.pupu/mcp_secrets.json, 0600），declare `secrets:[{key:DISCORD_TOKEN}]`，不进 localStorage。

**残留风险（接受但记录）：**
- 不成熟（Medium）：低采用 = 少眼睛，未来恶意版本是 npx-pin 第三方的常驻风险 → 钉版本缓解。
- 发布信任（Low/Med）：npm maintainer 是个人（kesar/royal_lobster）非 org CI 锁定 → 钉版本缓解。
- **Discord 侧 token 权限是真实爆炸半径，PuPu 管不了**（High if 用户照 README 给 Administrator）→ 必须在 entry readmeMarkdown/setup 文案硬写：最小权限邀请 bot，禁 Administrator。最高杠杆控制点，在用户指引不在代码。

**How to apply:** 动 Discord 条目或任何带 bot-token 的写型 MCP 时复用本裁决。QA 红用例：read_messages 收注入指令要求 send_message 到他频道 → 断言 send 前确认弹窗触发。关联 [[team-roster]]、[[qa-red-case-pipeline]]。
