---
name: command-chip-green-palette
description: PuPu 的 slash-command 视觉语言=绿色药丸,输入框 overlay 与气泡 chip 必须同色;含精确 rgba 对
metadata:
  type: project
---

PuPu 里 `/command`(plugin skill 命令)的视觉身份是**一枚绿色药丸**,横跨"输入时"和"发送后气泡"两个面,必须同色以形成 compose→sent 的识别连续性。

**权威色值**(源:`src/COMPONENTs/chat-input/chat_input.js` renderCommandOverlay 的 pill,content-state 裸 rgba 是既有先例,不受 shell 禁裸 hex 红线约束):
- pill 底:`isDark ? "rgba(120,200,150,0.16)" : "rgba(40,150,80,0.13)"`
- pill 字:`isDark ? "rgba(160,230,180,0.98)" : "rgba(25,125,65,0.98)"`
- 输入框内 radius 4(inline dye);气泡内独立 chip 建议 radius 7(对齐 command_menu 行 radius)

**归属尾标**(source label)语言源:`command_menu.js` 用 `item.sourceLabel`,中性色 `rgba(var(--pupu-text-rgb),0.30/0.32)`,fontSize 10。气泡 chip 里改用绿色系降 alpha(留在命令色相)且提到 ≥3:1。

**活取显示名**:`command_registry.js` 有 `getCommand(name)`;plugin_skill_sync 持续把 catalog 同步进 registry(带 live `sourceLabel`+`sourceToolkitId`)。渲染时按名活取,plugin 卸载=取不到=降级纯 `/name` chip。

**Why**: 命令是 PuPu 命令系统([[pupu-plugins-skills-command-system]] 记忆)的一等视觉公民,绿色是它唯一的品牌色,散落各处必须收敛成一个色。
**How to apply**: 任何要渲染 `/command` 的新面(气泡 chip、side-menu 预览、历史、导出预览)一律抄这组绿,别另调色。
