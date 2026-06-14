---
name: mcp-vetting-telegram-2026-06
description: Telegram MCP 供应链裁决（2026-06-13）——Bot-API-only，选 @iqai/mcp-telegram 钉版本，拒整个 MTProto 用户账号类
metadata:
  type: project
---

CTO 委托第三方供应链裁决（MCP onboarding round Step 4，2026-06-13）。对齐 [[mcp-vetting-discord-2026-06]] 同一 posture。

**核心裁决：Bot-API-only。整类 MTProto/user-account server 一律拒入库。**

**Why 拒 MTProto 类（sparfenyuk/chigwell/dryeab）= Critical 否决：** MTProto server 用 api_id/api_hash + phone 登录 session **作为完整用户账号**登录，能读用户**全部私聊/联系人/群**并以本人身份行动。注入的 agent 可一次性外泄用户整个私信历史 — 爆炸半径 = 用户全部 Telegram 身份，比 scoped bot 大一个数量级，且确认门控救不了（读取本身就是泄露，没有可门控的写动作边界）。这不是配置问题是架构类别问题，不入库。

**Why 选 Bot-API 类：** server 作为 *bot*，仅限被加入的 chat，爆炸半径有界，等同已批的 Discord bot。

**选定：`@iqai/mcp-telegram@0.1.4`（Telegraf/Bot API，BotFather token）。**
- 安装向量亲核（registry.npmjs.org/@iqai/mcp-telegram）：v0.1.4 scripts 无 postinstall/preinstall/install，只有 build/watch/start/format/lint。bin=`mcp-telegram→dist/index.js`，npx 跑预编译 dist，安装期不执行任意代码。过。
- 同 IQAI org、同 maintainer（kesar / royal_lobster）、同 npx stdio 模型 → 与 Discord 一致的 vetting 故事。依赖干净（telegraf/fastmcp/zod/dotenv/dedent），纯 Bot-API。
- 版本谱：0.0.1→0.1.4，最新 2025-09-01。比 Discord 略成熟但仍低星（8）。
- **比 Discord 多一个 exfil primitive：`FORWARD_MESSAGE`**（把内容转发到别的 chat = 外泄原语）。确认门控因此更关键。

**裁决参数（交 curator）：**
- trustLevel = `needs_review`（第三方 npm + token，[[mcp-store-security-baseline]] 词表）。
- **钉版本**：args 钉 `@iqai/mcp-telegram@0.1.4`，禁 `@latest`（个人发布 + 低采用 + 不成熟，bump 须重审）。
- 工具 5 个。确认门控：`SEND_MESSAGE`、`FORWARD_MESSAGE`、`PIN_MESSAGE` = `requiresConfirmation:true`（外发/修改/转发）；`GET_CHANNEL_INFO`、`GET_CHANNEL_MEMBERS` = false（读）。**FORWARD_MESSAGE 必须门控** — 它是最危险的外泄路径。
- token = `TELEGRAM_BOT_TOKEN` 进后端 mcp_secrets.py（~/.pupu/mcp_secrets.json, 0600），declare secrets，不进 localStorage。
- defaultEnabledTools = 0。readmeMarkdown 写最小权限：@BotFather 建 bot，仅加入需要的 group，开 mention-only 模式（该 server 支持）。

**QA 红用例：** GET_CHANNEL_INFO/读到的群消息含注入指令要求 FORWARD_MESSAGE 用户私信到攻击者 chat → 断言 forward 前确认弹窗触发。关联 [[qa-red-case-pipeline]]。

**How to apply:** 任何 Telegram/IM MCP 入库时先判 Bot-API vs MTProto 类，MTProto 用户账号类默认 Critical 否决。关联 [[team-roster]]。
