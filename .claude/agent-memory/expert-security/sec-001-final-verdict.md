---
name: sec-001-final-verdict
description: SEC-INVESTIGATION-001 汇总复核最终定级——1 Critical(秘密链路) + 6 High 根因合并 + 3 大系统性根因，CTO 仲裁清单
metadata:
  type: project
---

SEC-INVESTIGATION-001 七区穿透审查的统一复核定级（2026-06-10，守为技术主导）。全文见 `.claude/security/sec-001/REPORT.md`。各 dev findings 见同目录 findings-*.md。

**最终分布（根因合并去重后）：Critical 1 / High 6 / Medium 14 / Low 11。** 无外部直达 Critical（Flask 随机 token 逐路由认证 + 127.0.0.1 bind 守住底线，见 [[flask-sidecar-posture]]）。

**三大系统性根因（本次最重要结论，决定修复路线）：**
1. **渲染层默认不清洗 HTML** — markdown.js:174 `sanitize_html` 默认 false，3 落点（chat-bubble 5 处 + toolkit README 2 处）。修正：走 react-showdown createElement 非 dangerouslySetInnerHTML，**不是 RCE-XSS，是 javascript: 链接执行 + iframe/img 外联**，仍 High。坑：sanitizeHtml prop 要函数 `(html)=>string` 不是布尔，传 true 抛错。
2. **renderer 持无约束本机能力 + 明文密钥** — IPC writeFile/readFile 零 root 约束（RC-5，修复范本就在同文件 deleteRuntimeEntry）+ provider key 明文存 localStorage（RC-6）。
3. **确认门控由被审查对象自声明** — Flask（mcp.py:324 默认 False + adapter 无 MCP override）+ 前端（帧自声明 + auto-approve 帧自报键可冒名）两侧均无默认拒绝。主修服务端默认拒绝+白名单。

**两条跨层接缝：**
- 接缝 A（路径双侧校验，Medium-High）：electron 与 Flask 两端都把路径安全外包（electron→main 没校验；Flask→unchain 库）。RC-5 是可达入口，被注入 renderer 绕过 Flask 直接 readFile。
- **接缝 B（秘密链路，组合 Critical=本次唯一 Critical）**：明文 key（RC-6）→ api.unchain 注入 payload → main↔Flask token 经 character avatar.url query-string 泄漏 renderer DOM（service.js:473-479,511-515）+ 经流式 URL 落日志（F-FLASK-04）→ F-FLASK-05 错误回灌。一次注入偷 provider key + 偷 Flask token 驱动全端点。修复需 settings+electron+flask 三区 + CTO 同步会。

**报 CTO 仲裁清单（建议处置）：** RC-SEAM-B(Critical,必修跨区) / RC-4(修,llm-expert+CTO 同步会) / RC-5(quick win) / RC-6(架构修或缓解后 accepted,CTO 裁) / RC-1+RC-2(CTO 守门 markdown 共享 primitive,建议翻默认值根治) / RC-3(quick win ×3 并行)。
accepted risk 候选：M-5/M-6 dev-only gate（建议改 app.isPackaged，不建议默认 accepted）；M-10 character 导入**当前休眠**（importCharacter 全链路就绪但无 UI 入口），接线前置硬门：文件选择 + prompt 预览 + 记忆导入确认，写进 ADR。

**正面样板（值得保护的红线）：** ① chat-bubble ConfirmInteract label/payload 全硬编码不吃 frame；② settings chrome_terminal 三层 gate（NODE_ENV+挂载+isPackaged）；③ electron deleteRuntimeEntry basename+逃逸检查（RC-5 修复范本）。

**贯穿教训：** 纵深防御要求每个 sink 自己兜底，不信上游——接缝 A/B 本质都是"双方都不校验=洞"。全部 exploit 已具备红用例待移交 QA（见 [[qa-red-case-pipeline]]）。
