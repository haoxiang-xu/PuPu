---
name: always-on-agent-vision
description: 2026-06-20 CEO 愿景会(心跳/长期记忆/感知/缓存)的架构现状取证 + 我对四个种子的架构立场 + 逼 CEO 拍板的那个 one-way-door
metadata:
  type: project
---

2026-06-20 CEO 召集 CTO + LLM expert + 我开"PuPu 未来 agent 形态"愿景会(讨论非 build,无 spec/plan)。CEO 四个种子:长期记忆 / 心跳 heartbeat(OpenClaw 式自驱常驻)/ 感知输入(刷 news/YouTube/TikTok)/ 缓存(常驻成本爆炸)。

**Why:** CEO 想把 PuPu 从"被动 Q&A chat app"推向"常驻自驱 agent",这会重定义产品形态和成本结构。
**How to apply:** 任何触及 sidecar 生命周期 / 记忆归属 / context 组装的设计,都要回到这次定的立场,别重新论证。

== 取证到的硬事实(2026-06-20 读码)==
- chat 全请求驱动: use_chat_stream.js -> api.unchain -> IPC -> route_chat.py chat_stream_v2 -> SSE -> unchain_adapter stream_chat_events -> Agent.run(worker thread)。
- Flask sidecar = 单个 ThreadedFlaskServer(werkzeug make_server threaded=True)跑在 child process 的 daemon thread;**追 parent PID(UNCHAIN_PARENT_PID),随 Electron 退出而死**;Electron main 用 scheduleMisoRestart(在 unchain/service.js)做重启监督。sidecar 是请求形态、非常驻、绑前台 GUI。
- 记忆现状 memory_factory.py(1633 行):per-namespace long_term_profiles(JSON)+ per-session session_state(JSON)+ Qdrant 本地向量集合(long_term_<digest>_<namespace>)做召回;embedding 自动选(openai/ollama;anthropic 无)。**记忆只在 turn-end 提交**:run_workflow 里 agent 流式结束后 commit_messages(full_conversation, long_term_extractor)。无自治 consolidation、无 decay/salience、无 scheduler。召回在请求时注入 context。
- 全仓**没有任何 background loop / scheduler / daemon**。只有:重启监督、debounced localStorage 写、worker-queue 消费者(adapter 里的 while True)。
- CLAUDE.md 标注已部分过期:routes.py 实际只剩 106 行(已拆成 route_*.py blueprints);unchain_adapter.py 现 5578 行;runtime spawn 实际在 unchain/service.js("Miso" 是 runtime 品牌名)。

== 我的架构立场(我在 Codex 之上的判断)==
- 心跳循环归属:**不放 Electron main**(前台生命周期)、**不放当前请求形态的 Flask**。但我修正了 Codex 的"必造 pupu-agentd 新进程":最省力可逆的 MVP 是**把现有 Flask sidecar 的进程模型从"请求形态+绑父PID"演进成"含调度器的常驻 worker"**(同进程加 scheduler/job queue/event log),而非一上来开第三个进程。第三进程是后续可选的硬化,不是起点。
- 长期记忆:必须**从 run_workflow / route_chat / turn-end 解耦成独立服务边界**(进程不必独立,架构必须独立)。缺:append-only event log、episodic vs semantic 分层、idle consolidation、salience/decay/遗忘、versioned memory capsule(给缓存当稳定前缀)、turn-end 之外的写 API。
- 感知输入:**daemon 拥有的子系统,绝不进 chat 请求路径**。chat 只消费已 curated 的 perception 摘要。connectors->normalize->dedupe->summarize->event log->consolidation。砍:**先 RSS/news + YouTube transcript,TikTok 抓取直接 YAGNI 掉**(脆、法务险、对验证心跳无必要)。
- 缓存=架构问题不是 provider 开关:必须把 context 拆成**稳定前缀(system+persona+long-term capsule,确定性排序、无时间戳/随机ID)** vs **动态尾巴(本轮+近窗+fresh perception delta)**。引入 PromptFrame{blocks:[{id,role,stability,ttl,versionHash}]},稳定块永远在前,provider adapter 各自映射 OpenAI/Anthropic/Gemini/Ollama。long-term 记忆要变成 versioned capsule 才能当可缓存前缀。

== 四个结构性阻力点 + 破法 ==
1. sidecar 绑前台 GUI 而死 -> 演进 sidecar 进程模型成常驻(或后续抽 daemon)。
2. localStorage 是 renderer 存储 -> agent state 下沉到 daemon 拥有的 SQLite/WAL + 向量库,renderer 经 window.*API 拿只读视图。
3. turn-end-only 提交 -> event log + 后台 consolidation,感知可不经 chat turn 写记忆。
4. 单请求服务器心智 -> 加 job queue/scheduler/worker pool/budget,即使 Flask threaded 也只是请求服务器不是 agent runtime。

== 逼 CEO 拍板的那个 one-way-door ==
**PuPu 到底是"带 sidecar 的前台 chat app",还是"GUI 只是众多客户端之一的常驻本地 agent daemon"?**
这是唯一不可逆的根决定;其余全可逆(provider、Qdrant vs 别的向量库、RSS-先 vs YouTube-先、job queue 选型、Flask vs 别的本地 API)。若答案是"不要 daemon",心跳必须诚实降级为"app 开着时活跃",不能宣称 always-on。

相关: [[onboarding-contract]] [[hybrid-codex-policy]]
