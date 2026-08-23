---
name: side-menu-is-already-a-tree
description: side-menu 已是完整层级树(folder+character row+depth+node)——thread 上线有双层级碰撞风险
metadata:
  type: project
---

事实：`side-menu/side_menu.js` 已经是一棵**层级树**——`useChatTreeStore`、folder 实体、CharacterChatRow 带 `depth`、node 右键菜单、export folder/chat。不是平铺会话列表。

**Why 重要**：0.1.10 的 thread 功能若再叠一层"分支/线程"层级，用户面前会有两套并行层级(folder 组织 vs thread 分叉)，与"日常体验=更简单"定位打架。**How to apply**：评审 thread 时坚持——thread 不是 side-menu 里的新第三层级；它要么是"一条会话内的分叉视图"(进到某会话才出现)，要么复用现有 node/depth 语义，别在侧栏顶层再造一棵树。先要 pupu-dev-chat-core 给出 thread 的数据模型再定交互。

相关：[[team-roster]]。
