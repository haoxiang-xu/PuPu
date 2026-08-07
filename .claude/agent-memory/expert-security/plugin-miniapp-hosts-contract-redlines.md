---
name: plugin-miniapp-hosts-contract-redlines
description: 2026-08-04 定调会决议：mini app/host hint/混包授权的生效安全红线已成契约条款；mini app 施工前安全 spec 由我出
metadata:
  type: project
---

# 2026-08-04 定调会：我的红线全部入约（canonical 全录在 CEO 会话 memory）

CEO 拍板"之后都按这个走"。以下是**生效契约条款**，后续审查按此执行，不再重新论证：

## Mini app（in-app browser / editor / terminal）
- 独立 sandboxed **WebContentsView**：`sandbox: true`、per-plugin session partition（绝不共享 default session——API key 在主渲染器 localStorage）、无/最小只读 preload、`setWindowOpenHandler` 全拒、`will-navigate` 白名单、永不开 `webviewTag`。**不继承主窗口配置**（主窗口现为 sandbox:false）。
- **终端类永不由内容触发**，一律用户手势；PTY 在 main 进程、按 plugin 逐个授权。
- 编辑器 fs 走 main 进程 IPC broker，按 workspace scope 限界，渲染器无裸 fs。
- 窗口模型=UX 的右侧可折叠分栏，与 sandbox 规格不冲突，WebContentsView 规格照用。

## Host hint 通道（[hosts.pupu] 透传）
- hint 只许**声明式引用**（artifact id / 已装 mini-app id）；路径/URL/命令行/cwd 永不进 hint。
- **Fail-closed**：未知 id / 未装 plugin / schema 不识别 → 丢弃并记日志，绝不 best-effort。
- 校验卡口=**Electron main SSE 中继单点收口**（`electron/main/services/unchain/service.js`），不放 React、不放 Flask；unchain 保持字节透明不预校验。
- 模型输出**不可**触发打开 mini app——手势保底线，chip 高亮保体验。

## 混包 plugin 授权
- **按能力类逐项授权，禁止整包一次点头**（我与 COO 独立得出一致结论）。现有 MCP 安装流只覆盖"跑进程"，窗口/fs/shell 能力走 manifest 扩展，不重建。

## hosts.* 首发试点：attach panel widget
- plan tool 的 todo list/progress bar；**纯声明式数据**（文本/状态/百分比），PuPu 自有组件渲染、无第三方代码——属"惰性 artifact 可自动渲染"档，**允许自动出现**。widget=live artifact（稳定 ID+revision 更新）。审查试点时按此基线：一旦有人想往 widget 塞可执行/可导航内容，即越档，退回手势门。

## 我的后续职责
- **mini app 施工前安全 spec 由我出**（届时另行安排）。spec 要落 API 级：WebContentsView 参数、partition 命名、PTY 授权流、fs broker scope 检查、hint schema 版本化与 drop 日志。

**Why:** mini app 把 webContents/fs/shell 三大能力带进 plugin 可声明范围，是本次定调最大新攻击面；hint 通道是 prompt injection→UI 操纵的新路径。
**How to apply:** 任何 mini app / hosts.* / 混包安装流的 PR 审查，直接引用本条款作为验收基线；违反即 blocker，无需重新说服。相关：[[mcp-store-security-baseline]]、[[release-security-gates]]。
