---
name: adr-sec-001-arbitration
description: SEC-INVESTIGATION-001 仲裁裁决 ADR — Critical×1 + High×6 逐条处置、排期 P0/P1/P2、accepted-risk tradeoff、ADR 化清单
metadata:
  type: project
---

# ADR — SEC-INVESTIGATION-001 仲裁裁决（2026-06-10）

**Context**：守主导的全 7 区只读安全调查（见 [[sec-investigation-001]]）完成复核定级：Critical×1、High×6、Medium×14、Low×11。两道既有硬防护（Flask 每会话随机 token 逐路由认证 + bind 127.0.0.1）守住"远程未授权直达"底线，无外部直达 Critical。唯一 Critical 来自跨层组合链（秘密链路）。报告：`.claude/security/sec-001/REPORT.md`。CTO 已亲核 RC-1 默认值（`src/BUILTIN_COMPONENTs/markdown/markdown.js:174` sanitize_html=false）、RC-5 零约束（runtime/service.js:517-547）、RC-5 范本（deleteRuntimeEntry:427-446 basename+startsWith 逃逸检查）三项关键事实属实。

**三个系统性根因**（裁决围绕它们组织，不是逐条打地鼠）：
1. 渲染层默认不清洗 HTML（RC-1/RC-2）
2. renderer 持无约束本机能力 + 明文密钥近在咫尺（RC-5/RC-6/RC-SEAM-B）
3. 确认门控由被审查对象自声明（RC-4）

## Decision — 逐条裁决

| ID | Sev | 裁决 | 排期 | 主修 | 验收 |
|---|---|---|---|---|---|
| RC-5 IPC 文件读写零 root | High | **立即修 quick win** | P0 | dev-electron | qa 红用例(读 ~/.ssh/id_rsa 应拒) |
| RC-3 三 avatar `<img src>` 无 scheme 白名单 | High | **立即修 quick win ×3 并行** | P0 | chat-core+chat-bubble+agents | qa(远程/file: 头像渲染前不外联) |
| RC-SEAM-B 秘密链路组合 | **Critical** | **必修，跨区同步会** | P1(立刻开会，分阶段落地) | settings+electron+llm/flask | qa(任何 bridge 返回/DOM 不可提取 token/key) |
| RC-1 markdown 默认不清洗 | High | **修，CTO 守门翻默认值根治** | P1 | CTO 设计+dev-chat-bubble 落地 | qa(javascript:/iframe/img 红用例) |
| RC-2 href/src scheme 白名单 | High | **修，随 RC-1 同一清洗函数** | P1 | 同 RC-1 | 同 RC-1 |
| RC-4 确认门控 Flask 默认拒绝 | High | **修，同步会(llm-expert+CTO)** | P1 | flask 主修+chat-core 兜底 | qa(无 destructiveHint 工具必弹确认) |
| RC-6 明文 key 存 localStorage | High | **架构修(随 SEAM-B 一体)** | P2(SEAM-B 收口后) | settings+electron+CTO | qa(同 SEAM-B) |

**派单粒度修正（CTO 亲核后）**：RC-1 不是单纯 `false→true`。react-showdown 的 sanitize 接口要的是清洗函数 `(html)=>string` 而非布尔；当前 `sanitize_html` 是自定义布尔 prop。翻默认值须在 markdown.js 内部把"清洗意图"接成真正的清洗函数（scheme 白名单 http/https/mailto + 危险标签/属性剥离），RC-1/RC-2 在此一并收口。因此 RC-1/RC-2 是同一处共享 primitive 改动，CTO 设计清洗函数契约、dev-chat-bubble 落地、toolkit 两处 README 落点随后跟进。这是 BUILTIN 共享原语 + 行为默认值翻转 = **单向门**（一旦全仓默认清洗，依赖"不清洗"渲染的地方会变），须 CTO 签 + 全量回归。

## Consequences / accepted-risk tradeoff

- **M-10 character 导入持久化注入** — accepted current state（休眠，无 UI 入口）。**Tradeoff**：当前零可达性，修它=修一个没接线的洞，ROI 为负。**硬门**：接线那天（agents 面加导入 UI）必须同步交付"文件选择 + prompt 预览 + 记忆导入二次确认"，否则视为安全回归。接线前置硬门写死，由 qa 在接线 PR 上 gate。
- **M-5/M-6 test-api/__pupuTestBridge gate** — **不接受 accepted risk**。成本低（NODE_ENV→app.isPackaged + 构建期单测断言），P1 顺手修。理由：一次构建配置回归就把后门带进 prod，不值得为省小工接受。
- **RC-6 短期** — 在 SEAM-B 完整收口（OS keychain safeStorage + main 注入）落地前，**接受明文 key 现状作为过渡 accepted risk**，但前提是 P0/P1 先把注入面收窄（RC-1 默认清洗 + RC-5 文件约束 + RC-3 scheme），即"密钥还在，但够到它的路被堵窄"。Tradeoff：完全 keychain 化涉及 settings schema（CTO-gated）+ M-11 facade 收口，是中期工程，不能阻塞 P0。

## ADR 化清单（按纪律 accepted risk + 单向门必落 ADR）
1. 本文件即 SEAM-B + RC-6 的根 ADR（秘密链路重构方向）。
2. RC-1/RC-2 markdown 默认清洗 = 单向门，须独立 ADR 记清洗函数契约 + 回归范围。
3. M-10 接线前置硬门 = ADR 条目（接线即触发安全复核）。
4. RC-4 Flask 默认拒绝 + 白名单 = 确认门控契约 ADR（与 llm-expert 共定白名单语义）。

## 排期总览
- **P0(本周)**：RC-5、RC-3 ×3（纯 quick win，缩可达能力与注入外联面）。
- **P1**：RC-SEAM-B 同步会即刻开 + 分阶段落地、RC-1/RC-2 默认清洗、RC-4 默认拒绝、M-5/M-6 gate、M-7/M-8 SSRF 统一校验器、L-8 fail-closed。
- **P2**：RC-6 完整 keychain 化 + M-11 settings facade 收口（SEAM-B 收口后）、M-13 registry 签名(转 curator+守)。
