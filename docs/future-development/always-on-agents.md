# 伪常驻 Agent 与 Listener Node —— 未来方向与增量路线

> **状态:愿景 / 讨论稿(2026-06-20)。** 本文是一次 CEO 愿景会议的完整落档,记录方向、研究证据与一条 step-by-step 路线。**这不是已承诺的实现计划,也不含代码。** 任何里程碑动工前需各自走正式 spec/plan。
>
> **参会:** CEO、pupu-cto、pupu-architect、pupu-llm-expert。研究:三轮 workflow、13 个 research agent 一手取证(外部 repo + 论文 + 本地源码)。
>
> **数字约定:** 凡可能随时间漂移的定价/阈值/benchmark 分数均标"需复核"。

---

## 0. TL;DR

- **北极星(已细化):** PuPu 未来的 agent **不做真后台常驻 daemon、大概率不做真 heartbeat(定时轮询)**;它仍是 **action/event-triggered**,靠"恰到好处的时机"给用户**伪常驻(在场感)**的体验。
- **价值定义(关键):** 不是"陪伴感/身边有个人",而是**"在正确的时间提供正确的帮助"**。打扰用户的门槛极高,无意义的主动 = 噪音。一件真正值得打扰用户的事,往往需要一个**长流程(多步、跨时间)**才能产出。
- **核心洞察:** "daemon"不是一个东西,是**七件可以分开关的事**。把"忙"从"进程一直在跑"重定义为**"状态一直活着、被事件唤醒续上"**,就能做到"长流程连续 + 我不在时也推进 + 该动时动",却**没有任何常驻轮询线程**。整代后台 agent(Devin/Copilot/Cursor/Codex)无一是 daemon。
- **三个目标场景是同一台引擎的三种配置**(换 发起源/寿命/唤醒/交付 四个旋钮):甲 隔夜调研、乙 盯梢代办、丙 跨周追踪。
- **产品本体接入:** 把研究里的"trigger source 旋钮"做成 agent builder(recipe graph)里一个**类型化 `listener_node`**,用户选 listener 类型即可搭出甲/乙/丙。
- **三块大石头(按成熟度):** A 可恢复长流程引擎(最成熟,可抄)→ B 事件唤醒层(OS 机制现成,有"关窗口丢本地事件"的缺口)→ **C 打扰判定器(最不成熟、可能净有害,是真正的护城河也是最深的坑)**。
- **路线一句话:** 先做 **M0 可恢复长流程引擎 → M1 场景甲"隔夜调研"** 最便宜地验证"高门槛主动帮助有人买单",再谈唤醒(M2)和 builder(M3);打扰判定器全程 eval-first、影子模式达标前不接真打扰。

---

## 1. 愿景是怎么演化到这里的

### 1.1 从"本地常驻 daemon"到"伪常驻"
会议初始把北极星定为"本地常驻 daemon(L3)"。深入后 CEO 主动收窄:**不做真 daemon、不做真 heartbeat**,改做 **action-triggered 的"伪常驻"**——agent 只在被触发的瞬间存在,但只要那一瞬"记得对、挑得准、时机刚好",用户会脑补出"它一直在"。

### 1.2 价值的再定义(本次会议最重要的转向)
敌人从"被遗忘"换成了**"成为噪音"**。陪伴感不重要;**"正确时间正确帮助"**才是价值。这把产品从"情感陪伴"挪到"高门槛的主动价值"——更难,但更值钱、更不易沦为玩具。推论:**值得打扰的事常需长流程**,而长流程 + "我不在时它也在忙" + "不做真常驻"三者天然张力 —— 这正是研究要解的题。

### 1.3 "daemon"分解成七件可分开关的事
研究结论:业界从没有把"daemon"当一个整体。它可拆成 **durable store / event wake / cheap gate / bounded job / state-persistence-over-heartbeat / interrupt-as-escalation / pre-authorized scheduling** 七件,各自独立、各自可关。"长流程连续 + 我不在时也推进 + 该动时动"可以**零常驻轮询线程**地实现。

---

## 2. 三个目标场景 = 同一台引擎的三种配置

骨架统一:**一个长寿"作业":存目标+状态 → 被某种信号推进一步 → 产出先过一道高门槛"值不值得打扰"的闸 → 才到用户面前。**

| | 谁发起 | 活多久 | 被什么唤醒 | 怎么交付 | 对"不常驻"的压力 |
|---|---|---|---|---|---|
| **甲** 隔夜调研 | 用户踢一脚 | 一次性(几小时) | 跑到完 | 完成时一次性给 | 无(=Devin/Codex 形态,不需要 daemon) |
| **乙** 盯梢代办 | 事件 | 常驻(无限) | 真实事件 + 小模型闸 | 攒到值得才出手 | 高(逼问"关窗口能否接事") |
| **丙** 跨周追踪 | 目标/时间 | 常驻(数周) | deadline 临近 + 进展变化 | 关键节点提醒 | 高(同上 + 长寿状态=记忆) |

CEO 说"都要"。翻译:既要"免费的甲",也要"两个会逼你正面回答 daemon 问题的乙丙"。**甲可先发、不碰雷;乙丙早晚要拍那个单向门。**

---

## 3. 研究结论:三块大石头

### 石头 A —— 可恢复长流程引擎(最成熟)
- 共同骨架:**状态外置 + checkpoint replay**(进程可死,流程不死)。空闲零成本(Restate `ctx.sleep()`、LangGraph "睡一周 zero compute")。范式叫 **advance-in-bursts**:信号到了推进一步再静止。
- 离 PuPu 心智最近:**OpenHands SDK V1 的 event-sourcing**(agent = "event history → next event" 的纯函数,pause/resume/fork/replay 免费)。
- **坑:resume 要求每步幂等**,否则重复副作用。
- 出处:Temporal / DBOS / Restate / LangGraph durable execution / OpenHands SDK。

### 石头 B —— 事件唤醒层(OS 机制现成,有缺口)
- 事件驱动 vs 定时轮询是数量级差距(某算例 2880→10 次/天,真 heartbeat ≈ 99% 空转)。
- 桌面内核级 push 源齐全:macOS FSEvents / Windows ReadDirectoryChangesW / Linux inotify;Gmail `users.watch` + Pub/Sub(返回 `historyId`、watch 7 天);macOS EventKit、Windows SystemTrigger。
- **关键缺口(决定"关窗口能否接事"):** 纯本地事件(FSEvents 类)**app 一关就丢**;服务端 push(Gmail Pub/Sub 类)会**缓冲**、下次在场按 `historyId` **补齐**。
- 灰色地带:app 开着时挂个 watcher,算不算"常驻"?—— 需 CEO 给定义。

### 石头 C —— 打扰判定器(最不成熟、可能净有害)
- **过度打扰是 proactive agent 的头号失败模式**(不是"主动得不够")。数据:PROBE 端到端最强 **40%**;CHI'25 真人实测主动里只有 **53.3% 有效 / 34.7% 忽略 / 12.1% 实际打扰**。
- **最扎心:离线 AUROC 0.94 的判定器上线可让系统崩 -26pp** —— 判定器本身可能净有害。π-Bench 证明"会把事做完"与"知道何时主动"是两种能力。
- **红线:绝不能拿"用户安静/空闲"当可打扰信号**(久不动通常是深度思考)。门槛建在 **期望效用差(Horvitz:E[效用]>E[中断])+ 真实行为信号 + 被拒后抬高该类阈值**。
- **没有可直接抄的工程实现,只有评测与原则。** 这既是 PuPu 潜在的护城河,也是最深的坑。
- 化解"我不在时它在忙 vs 不常驻":ProAct 的"**空闲静默预备 + 稀有被闸住的打扰**"解耦(顺带降幻觉 28%,需复核)。

---

## 4. 架构:Listener Node 与三块石头的落位

### 4.1 Listener Node 作为一等架构原语
不做五个特化 start 节点,而是把现有 `start_node` 泛化成**单一类型化 `listener_node`**(带 `listenerType`)。五种 listener 只在 adapter config / trigger / cursor / payload.kind 上有别,骨架共用。

**节点统一契约(草案):**
- `subscription`:`{ source, config, filters, cursor }`(`config` 由 provider adapter 私有:chat/clock/gmail/http/filesystem;`cursor` 承载 historyId / 上次扫描点 / schedule tick)。
- `wakeup`:`{ trigger: ipc|timer|provider-push|http-post|fs-event|startup-scan, backfillable: bool }` —— 把"app 关了会不会丢"**显式化**(石头 B 的核心区分)。
- `emits: "pupu.flow_event.v1"`。

**统一 envelope —— 下游 flow 唯一消费的东西(草案 `pupu.flow_event.v1`):**
```
schema:"pupu.flow_event.v1", event_id,
dedupe_key (= recipeId:listenerNodeId:sourceSpecificId),
occurred_at + received_at,
recipe_id + listener_node_id + listener_type,
source { kind, cursor{kind,value}, can_backfill },
actor { user_id, workspace_id },
payload { kind, refs[], data },
delivery { attempt, replay, backfill },
causality { correlation_id }
```
> **铁律:flow 节点只消费归一化 envelope,绝不直接吃 raw Gmail/webhook/file payload。** on-user-message / on-schedule / on-email / on-webhook / on-file-change 全部塞进这一个壳。

### 4.2 三块石头在 PuPu 的落位
- **durable job store + 唤醒入口寄生 Flask sidecar = 正确**,但要打成 **runtime 边界(不是 route 胶水)**。sidecar 内部链:`listener adapter → event ledger/dedupe → gate → job engine → checkpoints → notify`。分表:events / listener_subscriptions / listener_cursors / job_runs / job_checkpoints / job_outputs。**resume 由持久化的 event+checkpoint 驱动,不靠 React state、不靠 route 调用栈**(否则关窗即死)。
- **记忆服务边界:memory ≠ job store。** job store 存"执行真相";memory 存"用户/项目语义知识"。两者不共用一张表(checkpoint 可引用 memory 记录)。**这条边界 M0 就要划清**,否则 resume 幂等性会被记忆写入污染。
- **打扰判定器其实是两道门(架构师对 Codex 的修正):**
  - **Gate-1 准入(admission):** 此事件该不该触发/恢复 flow —— 在 dedupe 之后、job 创建/恢复之前。
  - **Gate-2 打扰(interruption)= 石头 C 本体:** 要不要打断用户/推送 —— 在 flow 产出结果、推送给用户之前。
  - C 可能净有害,故 **M0/M1 两门都 pass-through,但接口先定死**:`decide(event, context) → {action: allow|defer|suppress, reason, modified_event}`。**门逻辑绝不许住进 adapter 或 flow node 内部**,否则 M3 抽不出独立可替换组件。

### 4.3 结构性单向门(改不起,点名)
1. **event-ledger-first runtime:** 事件是持久输入,run 由事件派生/恢复。若 run 成主、event 成附属 → Gmail backfill / replay / dedupe / listener 抽取全线变痛苦。这是石头 B"服务端可补齐"价值的根,**M0 必须按事件优先建**。
2. **归一化 envelope 作为唯一下游契约:** recipe 一旦直接吃 raw provider payload,M3 listener 泛化会绕着 provider 怪癖固化;且 M3 把 listener node 发布给用户后,**用户 recipe 即依赖该契约**(契约本身二次成单向门)。
3. **(产品级)本地 vs 云 / 谁付 token:** 北极星定本地、用户 token;若乙丙要"关窗口也接事"且是纯本地事件,只能上 OS 级唤醒 = 滑回半 daemon。此项见 §6 待定。

> **可逆(不必早拍):** DB 选型、Flask route 命名、首个 listener UI、schedule 语法、file-change 用 watcher 还是 startup-scan、provider/向量库选择。

---

## 5. 增量路线 M0 → M3

> 原则:**先吃成熟的 A、把价值证出来;B 只引入"服务端能补齐"的那一种;C 尽量后推到有真实数据为止。** 每一步可独立发布、独立验证。

### M0 —— 长流程能跑、能续(押石头 A)
- **目标:** 把"忙"重定义为"状态活着、能 resume"。sidecar 内引入 durable job store + 幂等 resume(event-sourcing,对齐 OpenHands)。发起=用户手动,寿命=有界,交付=跑完一次性给。**不碰唤醒、不碰判定。**
- **引擎必须在此设计对(架构师不可谈判项):** `flow_event.v1` envelope + 版本化;幂等模型(event_id / dedupe_key / run_id / checkpoint version);wakeup 入口 = "接受归一化事件并 resume-or-create job" 的单一稳定 API;listener adapter 边界;**job store ⟂ memory 分离**;两道 gate 接口(即便全 pass-through)。*M0 若写成"只认 on-schedule、事件结构内联在 job 里",M2 接 Gmail 时就是重写而非扩展。*
- **AI 语义(LLM expert):** 副作用工具(发邮件/写文件)必须记 journal、**replay 跳过执行回放结果**;tool schema 标 `side_effect`。反思/consolidation **挂 trigger 边界、不挂定时**(对照 Claude Code autoDream)。
- **验证:** 崩溃重启后副作用工具真实执行次数 **exactly 1**;反思次数随 advance 次数走、空闲期为 0。
- **角色:** backend(主)+ dev-agents(recipe graph 接成可中断/可恢复执行)+ llm-expert(长流程记忆写挂点)。
- **最大风险/单向门:** resume 不幂等导致重复副作用;job store schema 一旦带数据上线就难改 —— **必须先定死**。
- **先别做:** 调度、push、builder UI、打扰判定逻辑。

### M1 —— 场景甲:隔夜调研(**第一个该交付的最小里程碑**)
- **目标:** 在 M0 上加"用户发起的有界后台作业 + 完成事件推送(本地通知/角标)"。独立可卖:"睡前丢给它,早上给你结果。"这正是 Devin/Cursor/Codex 形态——全都不是 daemon。
- **逼出的真单向门:** 作业生命周期能否脱离 GUI 窗口存活?这决定 M2/M3 是否可能,M1 阶段必须把这个架构问题逼出来。
- **AI 语义:** 长流程产出质量的 eval(隔夜调研 = 可评的产物)。
- **角色:** backend + dev-agents + ux(交付形态/完成通知)+ electron(本地通知/角标/窗口外推送)。
- **先别做:** 邮件/外部 webhook、打扰判定。

### M2 —— 事件唤醒,只做"服务端能缓冲补齐"的一种(挑食地押石头 B)
- **目标:** 第一个 listener 必须选**服务端 push 且能按游标补齐**的 —— **Gmail Pub/Sub + historyId 是教科书答案**:窗口关了事件不丢。让乙/丙第一次有"被叫醒"的能力。
- **绝不先做纯本地事件**(on-file-change):app 一关就丢,会让"在场感"变成"在场骗局"。
- **角色:** backend + electron(后台存活)+ **security**(第三方账号 token,套既有后端 secret 隔离,**别碰 localStorage**)+ llm-expert。
- **最大风险:** 常驻压力、token 安全、后台存活。
- **先别做:** heartbeat 轮询、打扰判定器学习逻辑。

### M3 —— agent builder 里的 Listener Node(把旋钮交给用户)
- **目标:** 引擎里"trigger source 旋钮"已被验证过两种(手动/schedule + email)后,才值得抽象成可视化 builder 的类型化 listener start node。它和现有 flow_editor 的 start node 同构,扩展性自然。
- **顺序铁律:** 先有跑通的引擎语义,再做编辑器。第一个开放给用户的 listener:**on-schedule**(最安全、无外部凭证、无丢事件),其次 on-email。
- **角色:** dev-agents(主)+ ux。
- **先别做:** 一次开放全部 listener 类型。

### 横向轨道 —— 记忆治理(贯穿 M0-M3)
- **先读侧、后写侧(风险/成本不对称):**
  - **第一步只动读侧检索路径**(Flask 可控、不碰私有 wheel):加确定性重排 `score = α·cos_sim + β·recency_decay + γ·importance`。零模型开销、可回滚。⚠️ **`memory_factory.py` ~:923 的 `_patched_similarity_search` 是 Qdrant 兼容补丁,不是重排注入点;重排逻辑要新加在检索结果返回之后,别改那段补丁。** 半衰期初拍:episodes ~14 天、facts 不衰减(需复核)。
  - **第二步才碰写侧** `commit_messages` 的 `long_term_extractor`(`unchain_adapter.py` ~:5158,当前未传)做 dedup/decay/冲突消解。因 wheel **未知 kwarg 被静默丢弃**,第一个验证是**契约验证**(从 `last_commit_info` 观测到行为变化),再量去重收敛/冲突消解正确率。reflection 放最后(最易引入幻觉式自我总结)。
- **Eval:** 30-50 条金标准检索集量 recall@5 / nDCG@5;注入后答案 LLM-judge 成对盲评(胜率>50%, p<0.05);token/turn 与 $/turn 不增。任一不过不进。

### 横向轨道 —— 打扰判定器(石头 C,eval-first)
- **引入顺序:离线回放 → ~50 任务影子模式(只记录不打扰)→ 才接真打扰。**
- **cheap-gate 三层级联**(贵的永在便宜的后面;FrugalGPT/RouteLLM 可降本 90%+,需复核):L1 零成本规则闸 → L2 小模型粗筛(高召回低精度)→ L3 大模型期望效用判定(Horvitz)。
- **验证用 CHI'25 三态,`disrupted` 率设硬上限(提议 ≤5%,需 CEO 拍)。** 死规定:**永不拿"用户空闲"当打扰信号。**

---

## 6. 开放问题(全部留待后续讨论,非阻塞)

> CEO 明确:本节所有"需要决定"的事项一律保持开放,留作后续会议讨论 —— 我们不在此 plan 死任何东西。

### 6.1 三方"分歧"摆到一起其实是收敛的(无需硬拍)
- **CTO vs 架构师(先验证 vs 先抽象):** 收敛 —— **builder/listener UI 排 M3**(CTO 的"先验证"),但 **envelope 契约 + 幂等模型 + 两道 gate 接口必须 M0 抽象进引擎**(架构师不可谈判项)。延后的是用户可见面,提前的是运行时骨架,两者不冲突。
- **CTO vs LLM expert(记忆横向 vs 前置):** 收敛 —— 记忆治理是横向轨道,但**便宜的读侧重排可早做**;有风险的写侧 wheel 改动后置且 eval-gated。**检查点:若 M0/M1 长流程攒的状态被证脏到不可用,把记忆提为前置主菜。**
- **LLM expert vs 架构师(判定器早做 vs 晚做):** 收敛 —— **接口 M0 定死、逻辑全程 pass-through 直到影子模式 50 任务 + disrupted 率达标才接真打扰。**

### 6.2 仍待讨论的开放问题(非阻塞,后续会议再议)
1. **"关窗口接事"的边界:** 乙/丙 需要在你不在时**动手**(纯本地事件 → 必须 OS 级唤醒 = 半 daemon),还是只需"别漏掉、回来再挑时机动手"(服务端缓冲 + 游标 = 干净不常驻)?**这一个答案锁死能否守住"零常驻"。**
2. **"app 开着挂 watcher 算不算常驻"** 的定义 —— 灰色地带需明确。
3. **打扰判断权:** 交给模型裁量,还是只走用户预授权 cadence/触发条件?(业界目前几乎全靠预授权。)
4. **`disrupted` 率硬上限** 定多少(提议 ≤5%)。
5. **memory 提前与否的检查点阈值**:长流程状态"脏到什么程度"就把记忆提为前置。

---

## 7. 约束与坑(动工前必看)
- **unchain 记忆引擎在私有 wheel**:抽取/召回/注入核心算法 PuPu 仓内无源码;PuPu 只有**两个挂点**(读侧检索结果后重排、写侧 `long_term_extractor`),**未知 kwarg 被静默丢弃**。动记忆区前先拉 backend dev 确认 wheel 话语权。
- **sidecar 现绑前台 GUI**(Electron 关即死,spawn 在 `unchain/service.js`);零调度。M1 必须逼出"作业能否脱离 GUI 存活"。
- **幂等是 resume 的硬前提**;副作用工具必须 journal 化保证 exactly-once。
- **文档过期提醒**:`CLAUDE.md` / `.claude/CLAUDE.md` 多处已过时(`routes.py` 已拆 `route_*.py`、adapter 约 5578 行、chat_storage 已迁出 localStorage 到主进程原子写)—— 建议另行订正,勿被误导。

---

## 8. 附录:关键出处与延伸
- **后台/异步 agent:** Devin (cognition.com/blog/devin-can-now-schedule-devins)、GitHub Copilot coding agent、Cursor cloud agents。
- **durable execution:** Temporal / DBOS / Restate / LangGraph durable execution / OpenHands SDK(event-sourcing)。
- **记忆与反思:** MemGPT/Letta(sleep-time agents)、mem0、Zep/Graphiti(bi-temporal 失效)、Generative Agents(recency×importance×relevance、reflection tree)、RecMem(recurrence-gated)、"Useful Memories Become Faulty"(整合致回归)。
- **proactivity / 打扰:** PROBE (arXiv:2510.19771)、KnowU-Bench (arXiv:2604.08455)、π-Bench、CHI'25 *Assistance or Disruption?* (arXiv:2502.18658)、Horvitz 注意力模型 (arXiv:1301.6707)、ProAct。
- **缓存经济学(若回到真常驻才相关):** Anthropic prompt caching(5min 1.25× / 1h 2× 写、读 0.1×,最小前缀 Opus 4.8=1024,需复核)。
- **参照实现内部机制:** OpenClaw heartbeat(isolatedSession + HEARTBEAT_OK)、Claude Code auto-compact(9 段结构化摘要 + 熔断器 + 压后重置缓存基线)、Codex CLI(`prompt_cache_key=thread_id`、外部 cron 调度)。
- **更深的一手取证**散落在各 agent 的 agent-memory(`pupu-llm-expert/ref-*.md`、`pupu-architect/listener-node-and-boulders.md`)。

---

*本文为愿景落档,非承诺路线。下一步(若要推进)= 选定首个里程碑 → 走正式 spec/plan。*
