---
name: memory-v2-builder-guard
description: Agent Builder 里唯一的 Memory V2 守卫测试 workflow_list.test.js 的三处脆弱点，以及卡片被删那次搬迁的未偿账
metadata:
  type: project
---

**本边界的产品代码对 Memory V2 零引用。** 全边界（`src/COMPONENTs/agents/**` + `src/SERVICEs/agent_folder_storage.js`）里 `memory_v2|memory_agent|Memory Agent|pupu_legacy|curator|Isolated|worker_status` 的全部命中只有 3 行，**全在 `pages/recipes_page/workflow_list.test.js` 内**（`:121` 测试名 · `:124` flag · `:144` 断言）。动这块之前先跑一遍这条 grep 再判断。

**Why:** 2026-08-04 `0dc333dc` 在本边界建了 Memory Agent 系统卡片（左树节点 + 右侧 `memory_agent_system_panel.js` 配置面板 + `enable_memory_v2` 门，约 608 行），当天 `eaf5a296` 又整体删除，**并在同一个 commit 里新建了那条守卫测试**。该 commit 的 message 写的是 i18n（与内容不符，疑 squash），照 message 找永远找不到。删除者把配置职责记账给「a future settings surface」，**该界面至今未建** —— 于是 `memory_agent_v2` namespace 至今 **只有读者没有写者**，四个 user-tunable 字段每回合上行恒为编译期常量。这是 case `0000-0002-2026-0807` 的 U-S1。

**How to apply:** 三条，都在被问到「Memory V2 会不会回到 Agent Builder」时用得上。

1. **守卫比看起来弱得多，别拿它的绿当证据。** 六条断言里：`:144` 匹配的 `"Memory Agent"` 不是本边界的字面量，是 `memoryAgentSettings.displayName` 的默认值，**定义在 `SERVICEs/memory_agent_settings.js:24`（settings 的边界）** —— 那边改个常量，这条断言当天静默失效且无红灯。`:147-148` 的穷举 `toEqual` 取 `mockExplorerProps.at(-1)`，而历史卡片 **自带第二个 `Explorer` 实例且渲染在主实例之前**（`recipe_list.js@0dc333dc:778` vs `:804`），**原样放回去这两条照常通过**。真正只剩 `:145` 的 `"System Agents"` 那一条是本边界自己的串。
2. **约束的「recipe 节点」半边零强制。** 该测试 `:80-84` 把 `recipe_canvas` mock 成桩、`:86-90` 把 `detail_panel` mock 成 `null`，且本边界 **不存在对节点类型集合的穷举断言**。往 `nodes/` 加一类节点、接进 `recipe_graph.js` / `recipe_connection_rules.js`，六条断言一条都不会红。
3. **正确的表达介质是源码级负向断言，不是渲染断言。** 本仓已有同形先例：`use_chat_stream.runtime_event_batching.test.js:24` 的 `expect(source).not.toMatch(/runtime_events_v4/)`。把约束表达在 **标识符族** 上（改名不会动它），别表达在显示文案上（改名一定会动它）。备选锚点 `"system:memory-agent"`（历史身份常量，今日全仓零命中）。

**那张卡片本来就不该在这里 —— 这条判断不需要援引架构共识。** 它为进本面留下至少 7 处显式例外：自带第二个 Explorer、`data-explorer-drag-disabled`、吞掉 `onContextMenu`、"deliberately no on_context_menu"、SYS 徽章加分隔线、两个文件里特判选中态。**一个需要逐条关掉宿主面全部交互模型的节点，就不属于那个面。** 后续任何把 Memory Agent 配置面落回 Agent Builder 的提议，本 owner 的立场是反对，理由用这一条。

相关：[[adjacent_dev_boundaries]]
