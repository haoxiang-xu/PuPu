---
name: plugin-surfaces-verdict-2026-08-04
description: 2026-08-04 CEO 定调会我方全部三项主张通过 — 五类不进用户面/mini app 右侧分栏/第三方永不自动开栏，含四条生效红线与两项待我出方案
metadata:
  type: project
---

2026-08-04 CEO 定调会（七方）就 plugin 五类分类学 + artifact 两态 + mini app 表面拍板，我提的三个拍板项**全部按我方主张通过**，"之后都按这个走"。canonical 全文在 CEO 会话 memory；这里只记我 charter 内的生效裁决。

**Why:** unchain 重定位为开箱即用 agent builder、PuPu 侧薄实现后，PuPu 需要自己定义 plugin 五类（skill/toolkit/mcp/artifact/mini app）与其可见表面；这次是定调而非提案，后续所有相关设计直接以此为前提。

**How to apply:** 任何触及 plugins 商店导航、artifact 呈现、mini app/第三方内容区、attach panel 的设计，先按下列裁决走，不要重开辩论。

## 生效裁决

1. **五类分类学留协议层，不进用户面。** 用户面维持 2026-07-17 store-final 收敛（3 项侧栏 + 店内 segmented control）；artifact/mini app 以 capability chip 呈现（卡片一行最多 4 个 + "+N"，完整内容物清单进详情页）。商店叙事归 Discover 编辑位，不改导航。
2. **mini app = 右侧可折叠分栏**（否决 modal / 会话内 tab / 独立 BrowserWindow）：默认 0 宽；开启 `clamp(360px, 38vw, 640px)`；拖拽分隔条 8px 命中 / 1px 视觉；<900px 降级 overlay drawer；栏内 32px tab 条多 app 共栏；**左侧 chat 列只变窄不重排**（不打断阅读的物理保证）。守的 sandbox 规格（独立 WebContentsView + partition）与分栏并行成立，不冲突。
3. **第三方永不自动打开面板。** toolkit 声明的"自动打开"一律降级为 chip 未读脉冲，只有用户点击才开栏。

## 生效红线（照录）

- **R1** mini app 一切实现**等 #193 z_layers 合入 dev 之后**再动（合入前 `src/BUILTIN_COMPONENTs/layer/z_layers.js` 只活在 worktree 分支）。新 tier `MINI_APP = 2500`（> APP_CHROME_TOP 2000，< MODAL 3000）为建议值，**待我定稿**。
- **R2** artifact in-progress 态要改 `src/COMPONENTs/chat-bubble/artifact-summary/artifact_summary.js` 里 `bucket.status !== "completed"` 的硬编码**之前必须先定过渡**；已录方案：trace chain 内 28px 行内 chip（永不自动展开、永不推开正文）→ 完成后升格为 ArtifactSummary 卡，chip 淡出 120ms + 卡片 opacity/translateY(4px) 淡入 160ms，**不做飞行动画**。
- **R3** 第三方内容区不许自己配色：声明式渲染 + 注入 `var(--pupu-*)`，沿用 `artifact_kind_registry` 的 fallbackRenderer 白名单作降级阀。见 [[theme-launch-readiness-verdict]]。
- **R4** 焦点/键盘：Esc 可收、Tab 不逃逸容器、hit target ≥32px、terminal/editor 需明确焦点归还手势。

## 待我出方案

- **attach panel widget（CEO 新加，我的活）**：tool 可在 attach panel 创建组件（例：plan tool 的 todo list / progress bar）。契约已定——`hosts.pupu = {v, kind, mount:"attach-panel"}`、widget = live artifact（稳定 ID + revision 原地更新）、纯声明式走 artifact_kind_registry 模式、定为 `hosts.*` 首发试点。**落位留给我裁**：attach panel 今天语义是"下一条消息带什么"（32px pill 条），而 plan 进度是 ambient 会话状态——嵌进 pill 条 vs 紧挨着另做一条状态带，spec 阶段出方案（另行安排）。
- `MINI_APP` z tier 数值定稿（R1）。

相关：[[plugin-store-icon-registers]]（商店卡片图标三 register）、[[feedback-design-principles]]（复用基元/风格统一）。
