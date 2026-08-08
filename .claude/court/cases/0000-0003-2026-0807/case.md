---
case_id: 0000-0003-2026-0807
title: Memory 的用户可见面
track: full
status: hearing
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-07T17:10:00-07:00
updated_at: 2026-08-07T19:56:00-07:00
---

# Memory 的用户可见面

承接 `0000-0001-2026-0807`（已中止，R-0001）的 Q2 / Q3 / Q5 / Q7 / Q8，并新增该案庭审中由 `code-owner-chat-core` 补出的三条未决项。

共同的题目是：**记忆系统在正常、为空、未就绪与失败四种状态下，用户分别看到什么。**

## 待裁问题

- **Q2 / Q5** `Inspect Memory` 按 chat admission 分流放在哪一层。已归档的明确主张（`0000-0001-2026-0807#S-0006`，`code-owner-chat-core`）：**放 modal 内部（settings），不放 side-menu**，三条理由中前两条是硬约束（入口是纯同步菜单构建器；点击后开 modal 前分流会让 503 未就绪态表现为"点了没反应"）。**该发言同时声明这是本端越界，主动交出**
  - **前置条件（属 `code-owner-chat-core` 的独立小切片）**：挂载接口须由 `{open, sessionId, chatTitle, onClose}` 扩为含 `ownerChatId` —— character chat 今天传的是派生 memory session id，modal **反推不出 `ownerChatId`**，`getSessionHead` 就调不出来
- **Q7** artifact 是否需要独立的 scope-bound `listArtifacts` 契约，还是仅从已披露 refs 打开。`0000-0001-2026-0807#S-0005` 判本端 **基本不需要新契约**
- **Q8** empty state 如何区分「V2 正常但尚无 entry」与「V2 unavailable/partial」。**服务端病灶已定位**：`/memory/projection` 在 **所有失败路径上都返回 HTTP 200 + 空点集**，renderer 今天 **结构上无法** 区分「V2 chat 开错了 Inspector」「V1 chat 确实还没记忆」「Qdrant 挂了」三者。约束：**新 Inspector 不得继承这个 200-空成功的形状**
- **Q3** UI Testing modal 是否为 Memory V2 增加内容
- **Q4-A + Q4-D（合并，`0000-0001-2026-0807#S-0006` 建议）** V2 turn-mutation 的失败与阻塞反馈。今天的实际行为：13 个 blocked 分支折叠成 5 条文案，以 **`Unchain error:` 前缀** 渲染在输入框下方的 disclaimer 槽位；且 `setStreamErrorForChat` 有 active-chat guard —— **用户在 A 会话点删除后立刻切到 B，fail-closed 结果一个字都不显示，回到 A 只看到一个不能发消息、按钮全灰、零解释的会话**。另 `CONFLICT_MANUAL` 文案承诺了一个 `src` 内不存在的 manual review 入口。**这些是已实现但没设计过的行为，不是缺功能**
- **Q4-B** captured secret 的生命周期管理界面在哪个 surface、归谁。`memory_vault_bridge` 的 `listDescriptors` / `revoke` / `grant` **零 UI 消费者** —— 存进去之后再也见不到，想撤销没有入口。附带：用户选「按普通消息发送」后该决定是否对同一凭据记住（启发式误报时是高频骚扰路径）

## 必到角色与交付

- `code-owner-settings`: `ASSESSMENT` — `src/COMPONENTs/memory-inspect/**`，Inspector 主体与分流承接
- `code-owner-chat-core`: `ASSESSMENT` — 入口、挂载接口、turn-mutation 反馈链路
- `code-owner-devtools`: `ASSESSMENT` — `src/COMPONENTs/ui-testing/**`（Q3）
- `code-owner-runtime`: `ASSESSMENT` — `/memory/projection` 服务端半边、200-空成功
- `expert-ux`: `ASSESSMENT` — 四态的呈现、落点、empty state、失败反馈的归属与文案
- `expert-security`: `ASSESSMENT` — vault 生命周期界面暴露什么（Q4-B）

- `code-owner-shared-arteries`: `ASSESSMENT` — `src/SERVICEs/bridges/**`（`memory_vault_bridge.js`、`context_v2_bridge.js`）、`buildCharacterMemorySessionId`、`src/locales/**`
- `expert-architecture`: `ASSESSMENT` — 落位与归属（「哪一层」「哪个 surface、归谁」）、跨面契约可逆性
- `code-owner-chat-bubble`: `ASSESSMENT` — Q7 的「已披露 refs」路线在用户可见面上是否闭合
- `code-owner-electron`: `ASSESSMENT` — vault 能力面在 IPC/preload 侧是否已完整支撑一个管理界面

- `code-owner-ui-primitives`: `ASSESSMENT` — **传唤第三层补入**。`default_mini_theme.json`（`expert-ux` 全部对比度论证的取值来源）、`use_translation.js`、`input/button.js`
- `code-owner-unchain`: `ASSESSMENT` — **传唤第三层补入**。`unchain:src/unchain/persistence/sqlite_read_v2.py`，复核 `code-owner-runtime` 自陈须由其确认的跨仓结论

**12 人，已交付 11 人。** 立案时记载 6 人；`speaker-of-the-house` 于开庭时重跑传唤第一层（逐份读取全部 31 份 charter 的边界声明）补正为 10 人（依据与 4 条边界自愈信号见 `record.md` S-0002）；闭庭前执行传唤第三层集合差检查，再补 2 人为 **事后认定的法定必到者**（依据、无 owner 实体与工具缺陷见 S-0017）。依 [quorum 第四节](../../../codex/lifecycle/quorum.md)「名单只增不减」，后补 6 人均为法定必到者。

**`expert-architecture` 三次派遣均未能出庭（零产出）**：前两次为 `rate_limit`（E-0115），第三次取得完整通知 `You've reached your Fable 5 limit`（E-0116），且第三次在 **并发度 1、等待 40 分钟后** 仍触发 —— 「扇出过宽」与「瞬时限速」两解释均被排除，**配额已耗尽，等待无效**。依 [quorum 第二节](../../../codex/lifecycle/quorum.md)，**quorum 停在 11/12，本案不得闭庭，无 `SUMMARY`**。三条待 `chief-judge` 明示的路径见 `record.md` S-0021。

> **主持人失范留痕**：S-0018 曾在 **零观测** 下断言成因并逐字捏造错误串，已由 S-0019 撤回、S-0020 替代。第三次派遣证明其内容碰巧正确，**但不予追认**，理由见 S-0021 第二节。有效证据链为 E-0115 + E-0116。

传唤须遵 [A-012](../../../codex/adaptations.md)：分小批串行（本案分 4 批，每批 2–3 人），必到角色不得派生勘察子 instance。

## 已知缺口

- **本机 official store `entries=0` / `candidates=0`** —— 关于"用户在 Inspector 里会看到什么"的任何判断都没有真实数据支撑，只能就 **空态与失败态** 取证
- `streamError` 的清除点未穷举，故「提示会被下一次发送冲掉」在 `0000-0001-2026-0807#S-0006` 中标为 **未核实**
- `get_session_head` 在 `session_id` 为空时的行为未实测；Q5 判据若要用它必须先确认（`0000-0001-2026-0807#S-0005`）
- **新增**：传唤第二层（认领期）以缩减形式执行（`record.md` 的 S-0003），覆盖「抽取漏掉」与「议案写窄」，**不覆盖**「边界写窄、须 agent 本人辨认」

## 文件索引

- [发言记录](record.md)
- [证据台账](evidence.md)
- [裁定与授权](ruling.md) — R-0001 程序裁定（2026-08-07）：授权 `expert-architecture` 在非 Fable 模型出庭，并撤销 2026-07-13「必须 Fable 5」常设指令；**quorum 名单不减员**
