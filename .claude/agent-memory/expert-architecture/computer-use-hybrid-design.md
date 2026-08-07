---
name: computer-use-hybrid-design
description: 2026-07-13 computer use 混合方案正式设计定案 — browser=捆绑 playwright-mcp 走 sidecar MCP 血管先发, computer=sidecar 自建手+Anthropic predefined 先行; 七个单向门裁决; 本次经 CEO 显式覆盖在 Fable 5 本模型推理(未走 Codex)
metadata:
  type: project
---

2026-07-13 computer use 正式架构设计(CEO 已拍板需求: GUI 屏幕控制 + 浏览器自动化, 内置一等工具, 三平台, Shell 不在范围)。**本次 CEO 显式覆盖 Codex 管线, 推理在 Fable 5 完成** — 一次性豁免, 不改变 hybrid 政策常态。

**Why:** llm-expert 调研(已核实)给出混合架构: browser=microsoft/playwright-mcp AX-tree 文本模式(今天就兼容全 provider, 可先发), computer=sidecar 薄层 pynput+mss + Anthropic computer_20251124 predefined 先行。

**关键取证(file:line):**
- MCP 血管: `_build_selected_toolkits` (unchain_adapter.py:2872, impact=CRITICAL, 4 直接调用方) → `build_mcp_runtime_toolkit` (mcp_toolkits.py:927, stdio 经 managed_env); toolkit 生命周期=per-run(4427/4677 建, 5009/5146/5341 拆) → 浏览器跨轮状态天然丢失, seam=`build_builtin_browser_toolkit(session_id)` 从 day1 带 session_id。
- 确认血管: unchain confirmation.py(ToolConfirmationPolicy) → adapter:436/513 → SSE → IPC `unchain:tool-confirmation`(channels.js:55) → POST /chat/tool/confirmation(route_chat.py:257)。
- unchain 两硬前置确认: messages.py 各 builder JSON-dump 纯文本(:42 anthropic); mcp.py:348-366 丢 image block; tool.py to_provider_json 无 predefined 直通; providers/anthropic.py 无 beta header 通道。
- mcp_managed_runtime.py 已有 node/uv 下载+sha256 校验(_verify_checksum:133) → 供应链 pin 的现成载体。

**七个单向门裁决:**
1. rich tool result 契约(unchain 公共 API)=单向门 → `content_blocks` typed list, 词汇 append-only, 无键=旧行为(全兼容)。
2. 模型可见工具形态=单向门 → computer 动作词汇以 computer_20251124 action set 为规范, generic schema 镜像; browser 用 playwright-mcp 原生工具名不改写。
3. browser/computer 两个独立工具=半单向 → 拆(权限粒度/平台矩阵/发布节奏都不同)。
4. 捆绑 MCP 生命周期归属=可逆有成本 → sidecar(不给 Electron main, 避免第二个 MCP client 栈)。
5. 供应链=禁 npx 浮动版本, exact version+sha256 走 mcp_managed_runtime manifest。
6. 截图默认不落历史/不进 memory=fail-closed 单向门, image_ref+TTL, SSE 帧只走引用(#168 教训)。
7. 会话级浏览器 keep-alive=可逆增量, M1 不做, seam 已留。

**切片:** M1 browser 先发(B1 捆绑 toolkit/B2 工具 UI/B3 确认粒度/B4 eval, 4-6 人周, 不依赖 unchain 改造); M2 computer(S0 rich result 2-3pw + S1 predefined 1-1.5pw 可并行, C1 GUI 手 4-5pw, C2 接线依赖 S0+S1+C1, C3 权限引导并行, C4 媒体通道, C5 eval+安审); M3 generic schema 放开需 M2 eval 数据。Wayland 二期。

**开放问题:** generic 点击精度未测; sidecar TCC 归因需打包实测; pynput LGPL 打包复核; 多显示器 v1 只主屏。安审移交 pupu-security-expert(四点已预留位)。
