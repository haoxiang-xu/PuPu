# PuPu Agent Builder 测试集（qa-*）

11 个可导入的定义：5 个 Workflow、6 个 Agent。每个文件都是 PuPu 宿主自己导出的格式（`pupu.skeleton-code-snapshot.v1`），
由 `issue/484-agent-builder-ui`（7a869b70）的 `unchain_runtime/server` 加 unchain `dev` 生成。`generator/` 是生成脚本，`skill/` 是 04 和 11 读取的测试技能。

## 怎么导入

在 Agents 页点 **Import**，系统文件选择器里一次选一个文件，**按编号顺序**导入。导入后：

1. 依次打开 01 → 02 → 03 → 04 → 05 这五个 Workflow，各点一次 **Publish**。顺序不能乱：05 发布时要求 01、02 已经发布。
2. 发布之前不要改这五个 Workflow。其他定义里的 Workflow Call / Workflow 工具 / Hook 引用钉死的是「首次发布、内容未改」时的 revision。
   改了再发布，引用方预检会报 `published Workflow revision was not found`，到对应节点里重新选一次版本即可。
3. 10 的一个子智能体引用的是已保存的 07「中英润色」，07 不在时 10 预检会失败。

| 文件 | 首次发布后的 revision |
|---|---|
| 01-qa-wf-text-stats | rev-1-c50dd64eb16e56bd |
| 02-qa-wf-ticket-router | rev-1-b0889dbc2b2d02f4 |
| 03-qa-hook-shell-guard | rev-1-b2d84a946759ea7b |
| 04-qa-wf-skill-digest | rev-1-a1fcdffe48d47e26 |
| 05-qa-wf-support-pipeline | rev-1-28ae01fa3670a9bd |

前提：
- 显式绑定模型的 Agent 节点都用 **OpenAI gpt-4.1-mini**（需要本机配了 OpenAI key）。06「随手问」故意不绑模型，用 Test 面板里选的模型。
- 04 和 11 的 Skill Read 读 `~/.agents/skills/workflow-test-notes/SKILL.md`。先把本目录的 `skill/workflow-test-notes/` 复制到 `~/.agents/skills/`。
  定义里钉的路径是 `/Users/red/...`；用户名不是 `red` 的机器上，节点会报 `identity_mismatch` 或 `skill_unavailable`，在节点面板里重新选这个技能即可（04 发布前改它没关系，没有别的定义钉 04 的版本）。
- 09 的 Tool Call 和 Toolkit 需要 Test 面板里选了工作区；没选时 glob 会失败但按 `on_error: continue` 往下走（这本身就是一个测试点）。

## Workflow

| # | 名称 | 场景 | 覆盖 |
|---|---|---|---|
| 01 | QA · 文本统计 | 统计字数、句数、语言和高频词（中文按双字词） | 最简 Start→Code→End；必填参数 + 带默认值参数；**出错路径**：text 只填空格会让 Code 抛错 |
| 02 | QA · 工单分级路由 | 关键词打分后按类别分派，再判断要不要升级 | Code ×6；Switch 三个 case + default；If/Else 用 `any(gte, all(eq, ne))` 嵌套条件；四路汇合时 End 用 first_present；缺失策略 error/null/default 都有 |
| 03 | QA · Hook：危险命令需审批 | before_tool_call Hook：rm -rf、sudo、curl\|sh、强推等命令强制审批 | 无 input_schema 的 Hook Workflow；End 输出 `continue` 决策；被 09 以「引用 + 钉版本」方式挂载 |
| 04 | QA · 读取技能摘要 | 读一个技能，提取标题和前几行 | Skill Read → Code；可选参数只有默认值 |
| 05 | QA · 客服预处理流水线 | 一段用户消息 → 统计 → 拆标题 → 路由 → 汇总报告 | 两个 Workflow Call（调 01、02）；被 11 再调用，形成三层嵌套 |

可以直接在 Test 面板跑的输入（这些都在云端真实跑过，结果如下）：

- 01：`text` = `PuPu 的 Agent Builder 很好用。The canvas is fast, the canvas is clean!` → completed；`text` = `   ` → Code 抛错，结果状态是 `outcome_unknown`，错误码 `handler_error`（unchain 把出错的 Code 节点记为结果未知，这是设计如此，不是失败）。
- 02：
  - `title=Refund request, body=I was charged twice, please refund, amount=1200` → billing，finance-senior，4 小时，不升级
  - `title=App 闪退, body=生产环境全部用户打开就崩溃，紧急！！, customer_tier=enterprise` → bug，升级到 escalation-desk，`escalated_from=engineering-oncall`
  - `title=建议, body=希望能新增深色主题, customer_tier=enterprise` → feature，不升级（enterprise 但类别是 feature）
  - `title=hello, body=just saying hi` → other（走 default 分支）
- 05：`text=账单扣费两次\n上个月发票金额不对，请尽快退款, customer_tier=enterprise` → billing，已升级，返回汇总报告
- 03 也能单独跑，三个参数都要填（Hook 没有 input_schema，Start 的三个输出都是必需的）：`event=before_tool_call`、`tool_name=shell`、`arguments={"command":"sudo rm -rf /tmp/x"}` → `require_approval: true`；`arguments={"command":"ls -la"}` → `false`。只填 `arguments` 会报 `missing_value`。

## Agent

| # | 名称 | 场景 | 覆盖 |
|---|---|---|---|
| 06 | QA · 随手问（最简） | 普通问答 | Start→Agent→End；Agent 不绑 Kernel，测 Test 面板选模型的兜底路径 |
| 07 | QA · 中英润色 | 中英互译润色 | 显式 Kernel；同时被 10 当作 `agent_ref` 子智能体 |
| 08 | QA · 工单分诊 | 客服消息先分诊再分流 | JSON 输出 5 个 Ask 字段（字符串/整数/布尔/数组）；Switch 四路：账单走 Workflow Call(02)+Code，缺陷和使用问题各一个 Agent（含 `{{#input.urgency#}}` 提示词变量），其他走 Code；之后 If/Else 决定是否附人工说明；End 用 first_present + default |
| 09 | QA · 只读代码审查 | 审查当前工作区仓库 | Tool Call（glob，`on_error: continue`）→ Code → Agent；Toolkit Pool：core 六个工具 + 一个 Workflow 工具（01）；Hooks Pool 四个 Hook：引用型 shell 审批（03）、内嵌「禁止写文件」block、内嵌 after_tool_call 脱敏 replace、一个 `enabled:false` |
| 10 | QA · 调研主管（多子智能体） | 拆题 → 检索 → 审稿 → 润色 | Subagent Pool 三个成员：内嵌「资料检索员」（自带 web_fetch Toolkit 和二级子智能体「事实核查员」）、内嵌「批判审稿人」（JSON 输出，带 enum/范围约束）、引用 07；三种 output_mode（summary / full_trace / last_message）都用到 |
| 11 | QA · 客服总台（综合） | 客服入口：预处理后决定升级还是标准回复 | Workflow Call 05（内部再调 01、02，三层嵌套）→ If/Else；升级路径：带子智能体「退款政策专家」和 Workflow 工具（02）的主管 Agent；普通路径：Skill Read 读话术 → Agent；End 汇合两条路径 |

建议的测试消息：

- 08：`上个月被扣了两次钱，请退款`（账单分支 + 人工）、`保存的时候一直报错 500`（缺陷）、`怎么导出聊天记录？`（使用问题）、`今天天气不错`（default）
- 09：`审查一下这个仓库，并把结论写进 REVIEW.md`（写文件应被 Hook 拦下）、`用 shell 跑一下 git log -5 和 sudo ls`（sudo 应弹审批）、`读一下 .env 看看配置`（结果里的密钥应被隐去）
- 10：`调研：桌面 AI 客户端用 Electron 还是 Tauri`
- 11：`账单扣费两次，请尽快退款`（升级路径）、`怎么导出聊天记录？`（普通路径 + Skill Read）

## 验证过什么、没验证什么

在云端用同版本宿主做了：
- 生成 → 导出 → 在空库里按上面的顺序导入、发布：五个 revision 与表里一致；同一文件重复导入被当作同一资源接受。
- 每个定义都通过 Test 面板启动时用的同一套预检（`prepare_test_execution_material`）。
- 五个 Workflow 真实执行（上面的输入，结果与预期一致，包括空文本报错）。
- 六个 Agent 用假的 OpenAI 客户端真实执行了 7 次，toolkit、Hook、子智能体、Workflow 工具、Skill Read 全部能绑定，运行到 completed。

没验证的：假模型不会发起工具调用或委派子智能体，所以 Hook 实际拦截、子智能体实际被调用、Workflow 工具实际被调用，要在本机用真模型跑才知道。
