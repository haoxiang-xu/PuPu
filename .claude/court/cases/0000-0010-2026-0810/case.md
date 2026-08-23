---
case_id: 0000-0010-2026-0810
title: Memory Inspector 新增 V2 Tree View（Fast Track 直派）
track: fast
status: implementing
phase: implementation
parent_case_id: 0000-0008-2026-0808
relation: non-blocking
created_at: 2026-08-10T17:12:50-07:00
updated_at: 2026-08-10T21:40:00-07:00
---

## REVISION 5（2026-08-10，side menu 左上角 corner inset 对称）

CEO：side menu 左边和上边到 edge 的距离要一样。这正是 `code-owner-settings` 交付 REVISION 4 时主动标出、但没动的那处不对称——header `padding: "8px 6px 6px 12px"` 是为文本标签调的，现在最左边坐的是折叠按钮，导致折叠图标离面板左边缘（12px padding + 按钮自身 4px inset）比离上边缘（8px padding + 按钮 4px inset）更远。`recipe_list.js` 真实用的是 `margin: "${2+headerTopPad}px 2px 8px 2px"`——上下左的 margin 在无 traffic-light 场景下是对称的（上=左=2px）。这次照这个基准改，让折叠按钮到面板左边缘与到上边缘的距离相等。

## REVISION 4（2026-08-10，side menu header 按钮顺序，对齐 agent builder）

CEO：side menu 的折叠按钮应该在**左上角**，refresh 按钮应该在**右上角**，参照 agent builder modal。现状（REVISION 2 交付）是 `[space 标签 flex] [refresh] [collapse]`，顺序反了——`recipe_list.js` 真实顺序是 `[collapse 按钮][label flex][action 按钮们]`，折叠按钮在最左、动作按钮在最右。这次改成同样的顺序：`[collapse] [space 标签 flex] [refresh]`。落点仍是 `code-owner-settings`。

## REVISION 3：CEO 撤回，不修（2026-08-10）

`code-owner-ui-primitives` 尚在复现阶段（未产出任何 diff、未 commit）即被 CEO 叫停。工作树已核实干净，`3ff2a1aa` 不受影响。`explorer.js` 的 phantom hover 暴露面维持原状，不在本 case 范围内处理；`code-owner-settings` 在 REVISION 2 交付时的原始记录（该组件有结构相同的暴露面，未修）予以保留，供将来需要时参考。

## REVISION 3（原指派，已撤回，下方保留存档）

CEO 实测：打开 Memory modal 时，**主 side-menu（聊天列表）自己的 explorer** 也会有一个 item 出现未操作的 hover 高亮——跟 REVISION 2 里 `code-owner-settings` 在 tree view 自己的行上修过的那个"phantom hover"是**同一个根因**（modal 打开触发某种全局布局变化，Chromium 重新计算整页 hover chain，向光标当前停留位置下方的任意元素派发真实的 boundary event，与该元素的 hover 是 CSS 还是 JS state 无关），只是这次在 `src/BUILTIN_COMPONENTs/explorer/explorer.js` 本体上真实触发了——`code-owner-settings` 在 REVISION 2 交付时已经点名这是该组件的潜在暴露面，"从未在静止光标下挂载过所以没暴露"，现在暴露了。

**落点归 `code-owner-ui-primitives`**（`explorer.js` 在其边界内），不是 `code-owner-settings` 的范围。修法沿用 REVISION 2 已验证过的思路：不改 hover 追踪逻辑本身，把"画出 hover 高亮"这个动作单独 gate 在"收到过一次真实 `mousemove`/`pointermove`"上；`explorer.js` 是多处共用组件（聊天列表 side-menu、agent builder 的 recipe list 等），修在组件本体上让所有消费者一起受益，但要求先独立复现确认、且改动要顾及全部消费者，不能只照顾 memory modal 这一个复现场景。

## REVISION 2 之后：已合并入 dev（2026-08-10）

`worktree-memory-v2-tree-view`（`8c8a8553`…`3ff2a1aa`，5 commit）已由 CEO 直接指示 `git merge --ff-only` 进 `dev`。`dev` 在此期间未分叉，快进无冲突，无新增 merge commit。**未 push。** 主树原有的、与本次改动无关的既存 dirty 文件（`.claude/agent-memory/**`、`.claude/archive/growth/**` 等）未受影响、未被顺带提交。

`FIRST_RANDOM_REQUIRED`（`evidence-examiner` 首批抽检）仍待 CEO 授权，覆盖 REVISION 1+2 的完整改动；本次合并不改变这个待办。

# Memory Inspector 新增 V2 Tree View（Fast Track 直派）

## REVISION 2（2026-08-10，in-app 冒烟后的 UI 细节修正，CEO 直派，四项）

1. **左侧 side menu 改为 full height**：`top:6 / bottom:96` 改成 `top:6 / bottom:6`，与 `recipes_page.js` 的 `overlayPanel` 完全一致（此前 `top:72/bottom:96` 是为了给 vector view 自己的 header 与底部控制条让位，第 2 项把 header 拿掉后，让位理由部分消失；与底部控制条的重叠区域怎么处理由实施方判断——可以是 z-index 让 tree 面板盖住控制条左端一小块，也可以是别的方案，CEO 没有指定解法，只指定了"full height"这个结果）
2. **modal 不再显示"Memory"标题与 chat 名称副标题**：这段 header 属于 vector view 早先就有的既有代码（`memory_inspect_modal.js` 里 `top:20` 那段），**本条修订明确授权改动它**——AC-2"vector view 既有代码路径零改动"这条约束，本次范围内缩小为"scatter 渲染与其数据获取逻辑不动"，不再覆盖这段 header 文本渲染。关闭按钮位置与行为不受影响
3. **side menu 的折叠/展开按钮，行为要跟 agent builder（`recipes_page.js`/`recipe_list.js`）完全一致**：折叠按钮在面板 header 内（`prefix_icon="side_menu_close"`），展开按钮只在折叠时渲染、悬浮在面板外（`prefix_icon="side_menu_left"`）。上一版展开按钮定位在 `top:80` 是为了避开已经要删除的 header，这次连带按 agent builder 的真实坐标重新定位（`recipes_page.js` 里展开按钮是 `top: expandTop, left: 14`，`expandTop` 无 traffic-light padding 场景下是 `14`）
4. **Bug**：打开 modal 后，某个 explorer 行会呈现出未经用户操作的 hover 高亮。**怀疑成因**：行的 hover 态如果是靠 CSS `:hover` 伪类做的，modal 一打开、如果鼠标光标本来就悬停在某一行即将渲染出来的坐标上，浏览器会立即判定该行"正被悬停"，即使用户没有真的移动鼠标。`BUILTIN_COMPONENTs/explorer/explorer.js` 用的是 JS 追踪的 `hovered`/`onMouseEnter`/`onMouseLeave` state 而不是纯 CSS `:hover`，这类问题结构性不会发生——建议按同样方式改，而不是在 CSS `:hover` 上打补丁

**AC-1 的落点描述随本条修订更新**（full height + 无 header），其余 AC 不变。这四项完成后再验收，仍然是同一轮验收，不新开验收轮次。

## REVISION 1（2026-08-10，UI 层重做，AC-4 与实施边界不受影响）

`code-owner-settings` 交付的第一版（tab 切换：vector/tree 互斥全屏覆盖）已通过 `acceptance-inspector` 逐条独立核验（AC-1…AC-7 全通过），但 CEO 审阅可视化预览后要求改版：**vector view 永久做背景，tree 改成左侧悬浮 side menu，条目详情走右侧悬浮 detail panel**，视觉语言对齐 `src/COMPONENTs/agents/pages/recipes_page.js` 的 `overlayPanel`（6px 内缩、10px 圆角、`blur(16px) saturate(1.4)`、深浅两套 `rgba` 背景/边框/阴影）与 `BUILTIN_COMPONENTs/explorer/explorer.js` 的行样式（30px 行高、16px 缩进、5px 行圆角、13px Jost、真实 hover/active 背景）。可视化预览：https://claude.ai/code/artifact/1b10f7be-75c3-4bc0-b265-9a22da212d95（v3）。

**AC-1 与 AC-5 的文字随本次修订下方直接更新**（不新开 AC 编号，旧版 tab 切换实现将被替换，不保留）；AC-2/3/4/6/7 不变。**AC-4（`code-owner-chat-core` 的挂载接口对象参数化）不受影响，不需要重做**——`ownerChatId` 的产出与传值方式与 UI 层布局无关。

`FIRST_RANDOM_REQUIRED`（`evidence-examiner` 首批 16% 抽检）留待本次修订版实施并再次验收后一并处理，不对旧版单独跑。

## FAST_TRACK_DIRECTIVE

CEO 明示：不再走庭审，直接指派 owner 出方案并实施，完成后给出可视化预览。承接 `0000-0008-2026-0808`（议案庭审已闭庭，`awaiting-ruling`，未走方案庭审）已查明的可行性结论与约束——**本次跳过方案庭审本身，直接把该案的结论当作指派约束**，不重新论证。

**指派范围**：character chat 的 side-menu 入口（现有 `Inspect Memory` 挂载点）打开的 Inspector modal 内，vector view 保持现状不动（V1，不为 V2 造投影——`0000-0003-2026-0807` 与 `0000-0008-2026-0808` 均已判 V2 不该有等价散点视图），新增一个 tree view 呈现 V2 记忆结构。**settings 全局挂载点（G9 提出的第二个入口）不在本次范围内**，留待将来单独处置。

**必须遵守的约束（继承自 0008 案已闭庭证据，直接采纳不重新取证）**：

1. **`ownerChatId` 必须由挂载点显式传入**，不得从 sessionId 反推。`code-owner-chat-core` 侧 `node.chatId` 在 character 分支已经在同一作用域求值过，只是被丢弃——直接接上即可
2. **挂载接口改成对象参数，不追加位置参数**——位置参数的静默类型错位是本案标出的最高风险单向门之一
3. **新组件不得自持判定逻辑**——判定（V2 是否启用/空/失败）与呈现分离，参照 `boot_readiness.js` 先例
4. **不新造投影/散点坐标生成逻辑**——V2 语义检索是纯词法，专门为画图算的 embedding 与实际召回无因果关系，会误导
5. **空态与未启用态需可视觉区分**——已知 `get_tree` 对"从未存在过的 owner"与"未启用"目前返回不可判别，若无法在本次范围内根治，至少不能让两者呈现成同一个空白
6. **`getTree` / `listEntries` 均无分页，本次不新增无界渲染**——超过后端 10,000 上限时后端返回的是错误不是部分树，UI 要能吃住这个错误而不是崩

## 验收标准（`acceptance-inspector` 只按以下条目验收；AC-1/AC-5 为 REVISION 1 文字，其余不变）

- AC-1（REVISION 2）：`src/COMPONENTs/memory-inspect/**` 内新增 tree 组件，以左侧悬浮 side menu 呈现，**full height**（`top:6 / bottom:6`，与 `overlayPanel` 完全一致：6px 内缩、10px 圆角、blur+saturate、明暗两套 `rgba` token），可折叠/展开，折叠/展开按钮的位置与行为与 `recipes_page.js`/`recipe_list.js` 一致；vector view 保持全屏可见，永远是背景层，不被 tree 遮盖；modal 不再显示"Memory"标题与 chat 名称副标题
- AC-2（REVISION 2 缩小范围）：vector view 的 **scatter 渲染与其数据获取逻辑**未被改动；原有的标题/副标题 header 文本渲染**已被本次修订明确授权移除**，不再受本条约束
- AC-3：tree view 消费的是已存在的 `contextV2Bridge.getTree`（`src/SERVICEs/bridges/context_v2_bridge.js`），未新增后端投影/散点端点
- AC-4：`onInspectMemory` 挂载接口从位置参数改为对象参数，`ownerChatId` 由 `code-owner-chat-core` 侧显式传入且值为 `node.chatId`（character 分支）——**已实现，本次修订不改动**
- AC-5（REVISION 1）：点击 tree 中的文件/link 条目，在右侧悬浮 detail panel 内显示该条目详情（同样对齐 `overlayPanel` 视觉，常驻挂载、以 opacity+位移过渡显隐，不整体滑出画布）；点击 folder 条目仍是原地展开/收起；V2 未启用、已启用但空、请求失败三态在 side menu 内以紧凑形式呈现且可区分（不要求视觉打磨，要求语义可区分）
- AC-6：`node ./gitnexus/run.cjs analyze` 后 `detect_changes({scope: "compare", base_ref: "dev"})` 显示改动范围与本指令描述的范围一致，无意外扩散
- AC-7：相关 `.test.js` 通过（`react-scripts test`，非裸 `jest`）；若涉及 `electron/**`，`.js`/`.cjs` 测试双胞胎同步

## 实施方

- `code-owner-chat-core`：AC-4（挂载接口改造 + `ownerChatId` 传值）
- `code-owner-settings`：AC-1/2/3/5（Tree view 组件本体，落 `src/COMPONENTs/memory-inspect/**`）

工作树：`.claude/worktrees/memory-v2-tree-view`（分支 `worktree-memory-v2-tree-view`）。按常设例外允许在该隔离工作树内自行 commit，不 push；主树不动。

## 已知缺口（继承自 0008 案，本次不解决，不阻塞本次范围）

- G9（settings 全局挂载点是否为同一议案）——本次不涉及，范围已明确排除
- 出厂默认态与 Windows 下的可用性（R2/R3）——本次在本机开发环境验证，不承诺覆盖这两种环境
- 载荷无上界的根治（R5）——本次只做到"命中上限时不崩"，不做分页

## 文件索引

- 尚未验收
