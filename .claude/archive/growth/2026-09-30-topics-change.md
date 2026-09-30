# PuPu topics — 2026-09-30 B 组复审与回滚记录

状态：COMPLETED；写入及独立回读均已成功。下文保留变更前理由和时间点，最终执行结果见同日 topics-review.json 及文末。

- 计划到期：2026-09-30 00:00 UTC；实际准备：2026-09-30T01:31:41.451Z。
- 仅 B 组 1 个替换：`agent-orchestration` → `desktop-assistant`。
- A1 的 10 个成员完全不变；B1 拟变 B2；总计 20 个唯一 topics。
- 移出标签已在 9 月 8 日记录中，满足至少 14 天曝光。新标签从实际写入时间起保护满 14 天；不能仅因名义复审日到期提前移除。

## 理由与逐项判断

当前公开版是桌面本地/云模型客户端，支持工作区和 MCP。公开 README/0.1.11 release notes 仍把完整 Agent Builder 列为路线图。不是认定现有编排能力为零，而是把一个宽泛框架/编排入口让给更直接的桌面助手入口。保留 multi-agent 与现有 A 组 Agent 关联。

desktop-assistant 有 337 个仓库，在 36 stars 下插入后的星标排序区间约 13–14；agent-orchestration 的前 100 个仓库均高于 PuPu（第 100 个 251 stars）。前者含 AgentPilot 等相邻产品，也有语音助手；本次不承诺 PuPu 有常驻语音或全系统控制。仓库量不是搜索量，排名不是访问或转化保证。

| B1 topic | 仓库量 | 星标排序 | 决定 | 依据 |
| --- | ---: | --- | --- | --- |
| agent-orchestration | 3770 | >100（仅检查前 100） | 替换为 desktop-assistant | Broad orchestration/framework intent is less direct than the shipped desktop assistant use case. PuPu is below the first 100 star-sorted results; use one slot for a 337-repository niche projecting rank 13–14. Keep multi-agent association elsewhere. This is product-fit/visibility strategy, not measured conversion failure. |
| anthropic | 24717 | >100（仅检查前 100） | 保留 | Explicit native cloud-provider support in current README. Preserve provider association despite >100 star-sort visibility; no isolated conversion evidence warrants another swap. |
| deepseek | 11530 | >100（仅检查前 100） | 保留 | v0.1.11 publicly ships a first-class DeepSeek provider; two sampled leading clients also use this association. Competition is high, but direct shipped fit remains. |
| llm-client | 86 | 9–11 | 保留 | Exact client-category fit and star-sort rank 9–11 in 86 repositories. Retention is based on fit/visibility, not proven conversions. |
| mcp-client | 1792 | >100（仅检查前 100） | 保留 | Current README documents built-in MCP tools/store. Accurate client capability remains useful despite broad competition. |
| multi-agent | 17490 | >100（仅检查前 100） | 保留 | Existing handoff behavior is evidenced by the v0.1.11 handoff-context fix. Retain the broad agent association for this cycle without implying that the roadmap Agent Builder/Teams product is fully launched. |
| ollama | 25256 | >100（仅检查前 100） | 保留 | Native local-model integration is a central shipped use case; preserve the main ecosystem association. |
| ollama-client | 363 | 31–33 | 保留 | Direct local-client intent; rank 31–33 in the sampled star sort, with all higher/tied repositories covered. |
| openai | 46535 | >100（仅检查前 100） | 保留 | Explicit supported cloud-provider integration, also used by Chatbox/Open WebUI/LobeHub. Retain one widely recognized provider association, not a claim of proven traffic. |
| self-hosted | 38566 | >100（仅检查前 100） | 保留 | Local/user-controlled model operation fits the association; Jan also uses this tag for a desktop product. This does not promise that PuPu ships an independently deployable server. |

## 其他候选与 leading projects

已检查 Cherry Studio、Chatbox、Jan（解析到 janhq/jan）、Lobe Chat（解析到 lobehub/lobehub）和 Open WebUI 的当前 topics。LobeHub 使用 agent-harness / agent-collaboration；Jan 和 Open WebUI 使用 self-hosted。不能照搬不同产品的身份。

- ai-workspace：189 仓库，插入排名约 24；与现有 agent-workspace 重叠，作为后续候选。
- ollama-ui：91，约 16–17；ollama-gui：188，约 23–24。均符合已有 Ollama UI，但本轮已有 ollama/ollama-client，先不额外占一格。
- agent-harness：1347，低于前 100；更偏可嵌入执行框架，与当前未交付的 headless 方向不能混为一谈。
- agent-collaboration：139，约 25；完整 Teams/Builder 尚在路线图，本轮不新增此承诺。

## 增长证据和限制

- 复审窗口 9 月 16–29 日有 1 个仍保留的新 star（9 月 25 日）；前窗 9 月 2–15 日无仍保留的新 star。当前 36；相比 9 月 22 日基线 35，净 +1，不冒充精确两周净增。
- API 最新覆盖 9 月 15–28 日，870 views / 109 rolling uniques。最新可用完整周 9 月 22–28 日 303 views，前一周 9 月 15–21 日 567。精确复审窗缺 9 月 29 日，前窗缺 9 月 2–7 日，不能把不完整 14 天总数拿来算涨跌；不求和每日 uniques 或差分 rolling uniques。
- 当前 Overview 221 views / 77 uniques；releases 索引 52 / 3；v0.1.11 release 页 21 / 8。搜索来源 Bing 17、Yandex 14、Google 11、DuckDuckGo 1 views。这些是共同曝光的滚动汇总，不是 B 或单个 topic 的转化。
- clones 3003 / 374 uniques，含 9 月 18 日 1030 次异常量；不等于用户。
- v0.1.11：raw 55 − verified pipeline 5 = adjusted package estimate 50；相比 9 月 22 日 31 − 5 = 26，调整后 +24 包。
- v0.1.10：42 − 5 = 37，不变。
- v0.1.12：API 标记 draft；5 − 5 = 0。成功 staging run 36637050905 于 22:05:50Z 回读全部 5 个安装包；不算新用户。新 qualification run 36629950626 对 v0.1.11 的 gh release download 只选 release-assets.v1.json，不扣安装包。Actions artifact 下载不扣。
- v0.1.11 发布、README 下载链接、CI/维护访问、索引延迟与小样本均是干扰因素。A1 从 9 月 22 日晚加入，B 成员更早已存在；不是随机因果实验，也没有每标签归因。

## 旧完整 20-topic set

agent-orchestration, agent-workspace, ai-client, ai-harness, anthropic, deepseek, desktop-agent, desktop-app, electron, llm, llm-client, llm-ui, local-llm, mcp, mcp-client, multi-agent, ollama, ollama-client, openai, self-hosted

## 新完整 20-topic set

agent-workspace, ai-client, ai-harness, anthropic, deepseek, desktop-agent, desktop-app, desktop-assistant, electron, llm, llm-client, llm-ui, local-llm, mcp, mcp-client, multi-agent, ollama, ollama-client, openai, self-hosted

## 回滚（仅在需要回滚此次写入时使用）

```sh
gh api --method PUT repos/haoxiang-xu/PuPu/topics --input - <<'TOPICS_JSON'
{"names":["agent-orchestration","agent-workspace","ai-client","ai-harness","anthropic","deepseek","desktop-agent","desktop-app","electron","llm","llm-client","llm-ui","local-llm","mcp","mcp-client","multi-agent","ollama","ollama-client","openai","self-hosted"]}
TOPICS_JSON
```

回滚前先核对 live set，不能覆盖后续手工修改。写入后必须独立 GET 核验全部成员，才更新 cohort 状态及完成计数。保留既定每周错峰：下次 A 10 月 7 日 UTC，B 10 月 14 日 UTC；新成员实际 14 天保护结束时间优先于名义复审时间。


## 写入前补充核对

原始采集与最终写入前核对之间出现执行间隔；原始时间戳和有效证据全部保留。2026-09-30T01:32:46.739Z 再次 GET：live 仍为 A1+B1 的完整 20 个成员，36 stars，views 870。v0.1.11 的 .deb 计数增加 9，最新 raw64 − verified5 = adjusted59（比 9 月 22 日 +33 包）；v0.1.10 仍 42−5=37；v0.1.12 仍 draft，5−5=0。重新检查 9 月 29 日起成功 workflow，新完成的 Release QA 36648123090 无 gh release download；没有新增可扣的安装包回读。增量仍只是包计数，可能含未识别的自动化，不宣称 33 个用户。明细见同日 topics-preflight.json。


## 已执行并独立核验

2026-09-30T01:34:19.753Z 写入成功；2026-09-30T01:34:48.682Z 独立 GET 核验 20 个唯一成员，精确匹配 A1+B2。仅替换 agent-orchestration → desktop-assistant；其余 19 个不变。B 完成首次复审、revision 1→2；A 的成员、revision、曝光记录及到期时间未改。新标签保护到 2026-10-14T01:34:19.753Z，不能因 10 月 14 日 00:00 的名义复审时间而提前移除。下一组为 A，10 月 7 日 UTC。完整执行与回滚证据保存在同日 JSON 记录。
