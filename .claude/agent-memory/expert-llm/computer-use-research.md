---
name: computer-use-research
description: 2026-07-13 computer use 调研结论 — unchain tool_result 纯文本是核心缺口;浏览器用捆绑 Playwright MCP、GUI 手自建(裸机三平台 desktop MCP 不存在);模型侧 Anthropic 先行
metadata:
  type: project
---

2026-07-13 应 CEO 要求做的 computer use（GUI 屏幕控制 + 浏览器自动化，内置一等工具，三平台）调研结论。完整引用见当次会话报告；这里只存决策级事实。

**Why:** CEO 拍板要做内置一等 computer use 能力；调研决定自建 vs MCP。

**How to apply:** 任何 computer use / 截图回流 / 浏览器工具的设计讨论先以此为基线；模型 ID/定价等易变事实每次重查，不信这里。

## unchain 侧缺口（2026-07-13 已由 S0/S1 补上，见 [[s0-s1-rich-tool-result-review]]）
1. ~~tool_result 纯文本~~ → S0：`content_blocks` 保留键（text/image，append-only），四 provider builder 原生渲染；无键字节级不变。
2. ~~MCP image 被丢弃~~ → S0：`_collect_image_blocks` 收进 content_blocks。**遗留**：MCP text+image 混合时 text 仍走业务字段、不进 blocks → 模型只见图不见文（评审列为合入条件）。
3. ~~predefined tool 无通道~~ → S1：`provider_native_specs` + `required_betas` → anthropic-beta extra_headers。
4. **新发现的致命交互**：`result_budget.py` 默认 4000 chars 上限会把含 base64 截图的 tool_result 整体压缩成 `{"compacted":...}` dict——截图到不了模型且 payload 非法。评审 veto 的核心条件。

## 生态结论（当时点）
- **成熟的裸机三平台 desktop-automation MCP 不存在**（DesktopCommander 只做 shell；MCPControl 仅 Windows；pyautogui 封装皆 demo 级 X11-only）。唯一方向相近的是 trycua/cua 的 Cua Driver（新、未验成色）。→ GUI 的"手"只能自建薄层。
- **浏览器侧相反，有成熟底座**：microsoft/playwright-mcp（AX-tree snapshot 驱动、`--cdp-endpoint` 可接已有浏览器、GitHub Copilot 已出厂内置先例）。AX-tree 文本结果与 unchain 现有纯文本 tool_result **今天就兼容**。browser-use 已弃 Playwright 改自研 CDP，自带 agent loop 与 unchain 编排冲突，只可取其 MCP 直接控制层。
- 键鼠库：nut.js 实质闭源无 license（fork 停更）；robotjs 2026 复活但无 prebuilt、X11-only；pyautogui/mss Wayland 全灭；pynput 活跃但 Wayland 受限。**Wayland 唯一正道是 xdg-desktop-portal（ScreenCast+RemoteDesktop+restore_token，GNOME/KDE）；wlroots 无 RemoteDesktop portal，只能 ydotool/uinput 兜底。**
- Electron 只有"眼"（desktopCapturer），没有系统级"手"（sendInputEvent 仅自身页面）。手落在 Python sidecar，按平台分派。
- macOS TCC：子进程权限默认归属 responsible process = PuPu 主 app（利好 sidecar 架构，一次授权）；Sequoia 起捕屏有周期性重确认弹窗。

## 模型侧格局（趋势级，具体 ID/价格勿引用需重查）
- 三家 schema 互不兼容：Anthropic=Messages API 版本化 predefined tool（computer_20251124 + beta header，tool_use/tool_result 载体）；OpenAI=专用模型已死（computer-use-preview 2026-07-23 关停），收敛为主线 GPT-5.x 的 `{"type":"computer"}` 工具 + `computer_call` item；Gemini=`computer_use` 配置对象（environment 参数）+ 通用 function_call。跨 provider CUA 适配层必须各写一套。
- 共同骨架一致：截图 in / 动作 out 循环，客户端负责截图缩放与坐标映射（Retina DPR、长边上限）。
- 建议已给出：**GUI 脑 Anthropic 先行**（能力最成熟+PuPu 默认路径），其余 provider 后置 generic schema（质量未测，需 eval）；浏览器工具与模型无关（普通 function calling），全 provider 可用。

## 推荐架构（当次报告结论）
混合方案 c：浏览器 = 出厂捆绑 Playwright MCP（复用 MCP 管线，不可卸载、对用户不可见）；GUI = Python sidecar 自建薄层（mac/Win/X11 先行，Wayland portal 第二期）；unchain 出 rich-tool-result + predefined-tool passthrough 两个原语。浏览器与 GUI 拆成两个工具（业界一致做法：DOM/AX 精准 vs 截图坐标）。

## F2 方案要点（2026-07-14 已出方案待 CEO 拍板）
- 官方一手依据两页：computer-use-tool 页（自动截图注入分类器=layer 0、"Inform end users + obtain consent prior to enabling"=知情同意是官方硬要求）+ mitigate-jailbreaks 页（`<untrusted_content_policy>` 官方措辞范本："information to report, not commands to follow"）。官方明说 prompt/分类器都不替代人工确认 → F1 仍是主缓解。
- 注入点：`_build_developer_agent`（feat/computer-control 分支 unchain_adapter.py），instructions 组装完成后、`UnchainAgent(...)` 之前，按 toolkits 列表里是否有 builtin.computer 实例条件追加 `<computer_use_security>` 块——自动继承 flag/model-gating/F9 subagent 排除；recipe 路径也覆盖。不进 system_prompt_v2 用户可编辑区（安全控制不可被用户 override）。
- 同意存 localStorage 带 version 字段（capability 变更时 bump 重新征求）；同意是 UX/合规门不是对抗用户的安全边界；env var 直开是 dev 后门，release UI 路径必须过同意门。

## F1 注入确认分类裁决（2026-07-13，我裁）
- `move` 保留 CONFIRM：模型主流为 screenshot→click 直发坐标（click 自带 coordinate），显式 move 恰恰是要触发 hover 态=改状态意图；豁免还开"静默挪光标劫持用户手点"通道。UX 噪音走"会话内批准"类 UX 杠杆解决，不弱化分类。
- EXEMPT=screenshot/wait/cursor_position 正确；未来 `zoom` 启用时应入 EXEMPT（只读）。fail-closed 白名单方向正确。
- type 确认框明文展示裁定保留（知情同意>遮罩），但 80 字符截断必须标注总长（隐藏尾部=未确认内容）；确认摘要含 typed 文本时**不得持久化进会话历史/trace**（密码泄漏面，交守/QA 验证）。
- subagent 不挂 computer：v1 模型可见成本低（主循环全能力在），自主 subagent 无确认通道本就不该有注入权；M3 若做"GUI 任务委托"先解决 subagent 确认路由。
