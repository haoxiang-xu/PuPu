---
name: ref-openclaw-heartbeat
description: OpenClaw (clawdbot/moltbot) real repo — heartbeat/cron/daemon implementation as reference for PuPu's daemon-agent vision
metadata:
  type: reference
---

PuPu 北极星(agent=本地常驻 daemon)的主要对照系统是 **OpenClaw**(前身 Warelay→Clawdbot→Moltbot→OpenClaw)。

- Repo: `github.com/openclaw/openclaw`(TypeScript/pnpm monorepo,活跃,~380k stars)。代码读法:用 `gh api repos/openclaw/openclaw/contents/<path> --jq '.content' | base64 -d`;code search `gh api "search/code?q=...+repo:openclaw/openclaw"`。
- Docs: `docs.openclaw.ai`(`/gateway/heartbeat`),repo 内 `docs/gateway/heartbeat.md`、`docs/automation/cron-jobs.md`、`docs/refactor/database-first.md`。

关键实现文件(供深挖时直接定位):
- 心跳调度: `src/infra/heartbeat-schedule.ts`(sha256(seed:agentId) 算 phase,确定性相位对齐)、`src/infra/heartbeat-runner.ts`(主 runner)、`src/infra/heartbeat-wake.ts`(wake/enable)、`heartbeat-cooldown.ts`(shouldDeferWake)、`heartbeat-active-hours.ts`。
- OK 静默丢弃: `src/auto-reply/heartbeat.ts`(stripHeartbeatToken / ackMaxChars=300 / isHeartbeatContentEffectivelyEmpty / parseHeartbeatTasks)、`src/auto-reply/heartbeat-filter.ts`(transcript 清洗)、`src/cron/heartbeat-policy.ts`(shouldSkipHeartbeatOnlyDelivery)。
- cron(分离 isolated 会话): `src/cron/store.ts`(SQLite-backed,legacy `~/.openclaw/cron/jobs.json`)、`src/cron/persisted-shape.ts`(schedule kind=at/every/cron;payload kind=systemEvent/agentTurn/command)、`src/cron/isolated-agent/*`(`cron:<jobId>` 每次新 transcript)。
- 状态持久化: 已迁 **SQLite-first**(`docs/refactor/database-first.md`):global `~/.openclaw/state/openclaw.sqlite` + per-agent db;`openclaw.json` 仍文件态。
- daemon: `src/daemon/launchd.ts`(macOS LaunchAgent)/ systemd;Gateway 是常驻控制面进程。
- 网络安全边界: `packages/net-policy/`(IP/SSRF 过滤、redact-sensitive-url)。

与 PuPu 对照的核心机制(已查证,见对应文件):
- **省 token**: heartbeat `isolatedSession:true` + `lightContext:true` → 每 tick 全新无状态会话,只回灌 HEARTBEAT.md,~100K→2-5K tokens。状态靠文件/SQLite 回灌,不靠会话上下文。
- **OK 协议**: 默认 prompt "若无事回 HEARTBEAT_OK";token 在首/尾出现且剩余正文 ≤ackMaxChars(300)则整条 drop(`stripHeartbeatToken` mode=heartbeat → shouldSkip)。
- **空文件跳过**: HEARTBEAT.md 只有注释/标题/空 checklist → `isHeartbeatContentEffectivelyEmpty` 直接 skip,连 API 都不发。
- **due-task gating**: HEARTBEAT.md 内 `tasks:` 块各带 interval,只把到点的 task 注入该 tick;last-run 存 `heartbeatTaskState`(session state)。
- **自改写**: prompt 里加一句即可让 agent 自己更新 HEARTBEAT.md(无专用机制,就是 FS 写工具)。

相关: [[a2a-channel-direction]](多 agent 路线)、[[tool-injection-path]]。
