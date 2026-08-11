---
name: side-menu-modal-hub-id-contract
description: side-menu 挂载接口的 id 契约——node.chatId 与 activeChatIdRef 是同一个值（五段证明）、两条会静默错主的路径，以及 2026-08-10 已落地的 onInspectMemory 对象参数形状
metadata:
  type: project
---

side-menu 是 modal hub：我提供挂载接口，各 modal owner 往里挂内容。挂载接口送出去的 **id 是什么** 是这条接缝上唯一容易错、且错了没人报错的东西。

**Why:** 2026-08-07 `0000-0003-2026-0807` 与 2026-08-08 `0000-0008-2026-0808` 两次庭审都卡在同一个问题上（「modal 拿不到 `ownerChatId`」），两次都由我这一侧作答。第二次核证时又捞出一条谁都没提、且比原问题更危险的错主路径。三层校验（electron 语法门 / runtime owner-scoping / shared-arteries facade）**全部不拦、且全部没做错**——防线只有挂载点本身。

## 一 · `node.chatId` 与 `activeChatIdRef.current` 是同一个值，不是「两个碰巧相同的 id 空间」

五段确定性传递，两道 `chatsById` 守卫。2026-08-08 逐段核过（PuPu `b2385d5d`）：

```
① side_menu_context_menu_items.js:195,24-25   node.chatId 是 chatsById 的键（两处独立使用）
② use_side_menu_actions.js:19-25              handleSelectNode → selectTreeNode({nodeId})
③ chat_storage_store.js:1712-1737 → :1022-1029
     updateActiveAndSelectedFromChatId：if (!chatId || !store.chatsById[chatId]) return null
     store.activeChatId = chatId                                              ← 守卫①
④ use_chat_session_state.js:345-353,412
     nextActiveChat = nextStore?.chatsById?.[nextActiveId]
     if (!nextActiveId || !nextActiveChat) return                             ← 守卫②
     activeChatIdRef.current = nextActiveId
⑤ use_chat_stream.js:11874,11985 / 4116-4119,6496  currentChatId → ownerChatId / owner_chat_id
```

外加 `chat_storage_tree.js:335`：树重建时 `chatId` 不在 `chatsById` 里的 chat 节点直接被丢弃，所以右键菜单不可能拿到一个野 `node.chatId`。

**净效果：character chat 的 `ownerChatId` 就是 `node.chatId`，它在 `:195`/`:197` 已被求值两次然后丢掉。取得代价为零。** 写侧的成文契约在 `use_chat_stream.js:6453-6457`（*"owner_chat_id is ALWAYS the UI chat id (targetChatId) — never effectiveThreadId, which becomes the character session_id for character chats"*）+ `:6496`/`:6501` 两行实现。**读写同键是唯一正确答案。**

## 二 · 两条会静默错主的路径，性质不同

**(a) character session id 冒充**（前案 E-0016 / 本案 E-0016+E-0024 两人复跑）：右键构建器两条分支把语义不同的值塞进 **同一个位置参数 `sessionId`**——character 分支给 `character_<x>__dm__<y>`，普通分支给 `node.chatId`。而 main 的 `CONTEXT_V2_OWNER_ID_PATTERN` 对前者 **返回 true**。普通 chat 上二者恰好同值，**这是巧合不是契约**。

**(b) 右键 ≠ 活动会话（2026-08-08 新捞出，此前无人提及，且更危险）**：`side_menu.js:344-353` 的 `handleContextMenu` 全函数体四行，**只 `setContextMenu`，不调 `handleSelectNode`**。`Inspect Memory` 作用于 **被右键的 chat**，`activeChatId` 是 **上次左键点选的 chat**。用户在 A 里聊天、右键 B 查记忆是常规用法。

| | (a) 冒充 | (b) 右键错主 |
|---|---|---|
| 传出的值 | 语法合法、语义错误 | **一个真实存在的合法 chat id** |
| 服务端 | 可能 404 / 空树 | **必然返回该 owner 的真实数据** |
| 可检测性 | 取决于「从未存在过的 owner」的行为（未核实） | **结构性不可检测**：200 + 非空树，每一层都正确 |

**待核前提**：「右键不选中」我只读了 `handleContextMenu` 全文，**未核实 `BUILTIN_COMPONENTs/explorer`（ui-primitives 边界）是否在派发 `onContextMenu` 前另行触发 `onSelect`**。实施前核一次；若 explorer 内部先选中，(b) 翻转。

## 三 · 挂载接口的形状约束 —— 2026-08-10 已落地（`0000-0010-2026-0810` AC-4，worktree commit `8c8a8553`）

**已实现的形状**，`onInspectMemory({ sessionId, chatTitle, ownerChatId })`：

| 字段 | character 分支 | 普通分支 |
|---|---|---|
| `sessionId` | `buildCharacterMemorySessionId(characterId, threadId\|\|"main")` | `node.chatId` |
| `ownerChatId` | **`node.chatId`** | `node.chatId` |
| `chatTitle` | `chat?.title \|\| node.label \|\| "Chat"` | 同 |

`handleInspectMemory` 对非对象实参 `console.error` + return——**因为旧式位置调用解构成全 undefined 不会抛**，静默正是这个接口存在的理由。`ownerChatId` 已进 `memoryInspect` 快照 state 并传给 `MemoryInspectModal`（该组件当前不消费，归 `code-owner-settings`）。

以下形状约束仍然成立：

- **`ownerChatId` 与 `sessionId` 必须是两个独立 prop**，不合并、不互推、不复用名字。V1 vector view 吃 `sessionId`（多态），V2 读平面吃 `ownerChatId`（恒为 UI chat id）。
- **必须改对象参数，不追加第三个位置参数**。`onInspectMemory(sessionId, chatTitle)` 这条接缝已经跨 owner，而要送的两个值 **都是合法 chat id 形状的字符串**，位置错位在 JS 里静默且无人报错。
- **打开时快照，不跟随活动会话**。`memoryInspect` 是 side-menu 本地 state，语义即快照；改成跟随 `chatStore.activeChatId` 等于把 (b) 写成默认行为。
- **挂载点不做任何 V2 调用**（不 `listSpaces`、不判态、不预检）。侧栏在 500+ 会话时已有 O(n) 全树重建塌点，别把 modal 的数据依赖倒灌进导航树渲染路径。要预检落 modal 内部。
- **入口是纯同步菜单构建器**（`buildSideMenuContextMenuItems` 无 async/await/promise），**任何异步判态都不可能在菜单构建期完成**——要按启用态隐藏菜单项，只能靠已缓存的同步可读状态。这条从 `0000-0001-2026-0807` 起三次庭审都成立。

**破坏面**：`onInspectMemory` 这条回调缝 **1 个生产者 + 2 个调用点，全在 `src/COMPONENTs/side-menu/`**，electron 零命中。GitNexus `impact --direction upstream` 对它报 `impactedCount: 0 / LOW`，但 **GitNexus 追不动 React 回调 prop 经对象字面量的传递，这个 0 不可单独采信**，必须配 grep 复核。

**2026-08-10 更正一条此前写错的**：`MemoryInspectModal` **有两个挂载点，不是一个**——`side_menu.js`（`mode="session"`，送 sessionId/chatTitle/ownerChatId）与 `settings/memory/index.js`（`mode="long_term"`，**只送 open/onClose，无 sessionId 无 ownerChatId**）。改 `onInspectMemory` 签名不碰后者（它不经这条缝），但**任何加 modal prop 的改动都要记得 long_term 挂载点会拿到 undefined**。前两次庭审说的"单消费者"只对 `onInspectMemory` 成立，对 modal 本身不成立。

**How to apply:** 任何「让 modal 知道当前是哪个 chat」的需求，值一律从 **右键节点** 取并在打开时快照，绝不从 chat 页 / 活动会话 / 全局取。相关：[[memory-v2-p0-chat-seam]] 的 owner_chat_id 语义、[[context-v2-consumer-traps-chat-core]]。
