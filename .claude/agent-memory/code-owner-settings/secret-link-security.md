---
name: secret-link-security
description: 秘密链路起点的安全认知——API key 存 renderer localStorage 的根本风险与正确修复方向
metadata:
  type: project
---

settings 区域是秘密链路起点：provider api_key 明文存 `localStorage.settings.model_providers`（model_providers/storage.js），由 api.unchain.js:129-173 注入 payload → IPC → main → Flask。

**Why（根本风险）**：key 存 renderer 可读的 localStorage = 它的机密性绑定到 renderer 里所有能跑的代码，而 renderer 本职是渲染边界③不可信内容（markdown sanitize_html 默认 false，清单3 owns）。一次间接 prompt 注入即可 `JSON.parse(localStorage.getItem("settings")).model_providers.openai_api_key` 读全部明文。存储格式是次要的，"谁能读"才是主轴。

**How to apply**：
- 任何动 api_key 存储/读取的活，正确方向是移出 renderer（OS keychain via safeStorage + main 侧注入 payload），不是在 localStorage 里加混淆。这是跨边界+跨区域改动 → 必报 CTO 同步会（settings schema 是 CTO-gated 动脉，见 [[settings-schema-cto-gated]]）。
- settings 单对象被 6 模块各自 read-modify-write、无 SERVICEs 统一 facade，是 key 加密/校验/脱敏无处收口的结构性根因，也是 lost-update 隐患。init-setup/steps/workspace.js:20-26 组件内联直写违反 CLAUDE.md 硬规则。
- workspace root（runtime.js:34-47）接受任意路径无 breadth 警告；settings 编辑器 validateWorkspaceRoot bridge 缺失时 fail-open，而 init 向导同逻辑 fail-closed——同能力两入口安全姿态分叉，审查按入口枚举而非按功能。

**正面样本（可复用模板）**：chrome_terminal dev 后门用三层 gate（NODE_ENV UI gate + isDevSettingsAvailable 挂载 gate + app.isPackaged main 执行 gate），内容污染 localStorage 标志也无法在生产触发能力。"内容能写标志 ≠ 内容能触发能力"是其它 dev 开关的标准做法。
