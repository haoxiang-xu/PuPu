---
name: side-menu-modal-hub-id-contract
description: side-menu 挂载接口的 id 契约——node.chatId 与 activeChatIdRef 是同一个值（五段证明），以及两条会静默错主的路径（右键≠活动会话 / character session id 冒充）
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

## 三 · 挂载接口的形状约束（前案 C4 我承诺过，两次核证都成立）

- **`ownerChatId` 与 `sessionId` 必须是两个独立 prop**，不合并、不互推、不复用名字。V1 vector view 吃 `sessionId`（多态），V2 读平面吃 `ownerChatId`（恒为 UI chat id）。
- **必须改对象参数，不追加第三个位置参数**。`onInspectMemory(sessionId, chatTitle)` 这条接缝已经跨 owner，而要送的两个值 **都是合法 chat id 形状的字符串**，位置错位在 JS 里静默且无人报错。
- **打开时快照，不跟随活动会话**。`memoryInspect` 是 side-menu 本地 state，语义即快照；改成跟随 `chatStore.activeChatId` 等于把 (b) 写成默认行为。
- **挂载点不做任何 V2 调用**（不 `listSpaces`、不判态、不预检）。侧栏在 500+ 会话时已有 O(n) 全树重建塌点，别把 modal 的数据依赖倒灌进导航树渲染路径。要预检落 modal 内部。
- **入口是纯同步菜单构建器**（`buildSideMenuContextMenuItems` 无 async/await/promise），**任何异步判态都不可能在菜单构建期完成**——要按启用态隐藏菜单项，只能靠已缓存的同步可读状态。这条从 `0000-0001-2026-0807` 起三次庭审都成立。

**破坏面**：`buildSideMenuContextMenuItems` + `onInspectMemory` 全仓产品引用 7 处，**全部在 `src/COMPONENTs/side-menu/`**，electron 零命中；**无任何测试断言 `onInspectMemory` 的参数**（`side_menu_context_menu_items.test.js:285` 只有 `jest.fn()`）。改签名零测试改动。

**How to apply:** 任何「让 modal 知道当前是哪个 chat」的需求，值一律从 **右键节点** 取并在打开时快照，绝不从 chat 页 / 活动会话 / 全局取。相关：[[memory-v2-p0-chat-seam]] 的 owner_chat_id 语义、[[context-v2-consumer-traps-chat-core]]。
