# PuPu 第三方插件验证 — 2026-09-13

本轮覆盖 **23 个第三方 MCP、5 个精选 skill 包（9 条技能），以及内置分发的第三方 Agent Reach**。此前 Core、Plan、Computer 的自有插件审查是另一批，不能替代本次工作。

已完成下载身份核对、选定源码/指令审查、依赖扫描，以及当前环境可执行的隔离协议和边界测试。**没有为任何条目授予完整 Verified：29 个条目的完整审查状态均为 INCOMPLETE；另外确认了当前 Unchain 接入层的确认机制失败。** 各项已完成检查与缺口分开记录，没有把无法执行的检查判成通过。

## 你最早提到的四个 MCP

| 条目 | 本次实际结果 | 尚未完成 |
| --- | --- | --- |
| Microsoft Learn | HTTPS 握手与 3 个工具发现通过；公开文档搜索成功；`file:` 输入被拒绝 | 真实 PuPu 模型下的恶意返回内容测试；远程后端实现不可审查 |
| Brave Search 2.1.0 | 固定包摘要核对；隔离启动通过，恰好发现指定的 4 个工具；检查了密钥来源和 Brave 请求路径 | 有效测试账号、依赖告警适用性、完整模型/安装包验证 |
| Tavily 0.2.21 | 固定包核对；隔离启动与 5 个工具发现通过；检查了接口目的地、凭据传递和研究轮询逻辑 | 有效测试账号、依赖告警适用性；所审 Unchain 没有保留目录声明的 5 项确认要求 |
| Firecrawl 3.22.4 | 固定包核对；隔离启动，实际发现 26 个工具，目录只预览 3 个 | 更广工具集、有效测试账号和依赖告警；所审 Unchain 没有保留 3 项预览工具的确认要求 |

Brave、Tavily、Firecrawl 本轮使用合成无效凭据、禁止网络的候选进程。请求失败证明的是此隔离配置下的失败行为，**不等于有效账号认证或提供商端到端调用已经通过**。没有花费真实账号额度。

Firecrawl 包确实带有本地文档解析工具，但所审代码仅在设置自托管 `FIRECRAWL_API_URL` 后读取并上传本地文件；本目录默认配置不启用该路径。没有把存在这一合法功能直接判为窃取资料。

## 其余覆盖结果

- **15 个本地 MCP** 全部完成隔离握手和实际工具发现：Playwright、Browser Use、Chrome DevTools、Bug Bounty Intelligence、Grafana、Filesystem、MarkItDown、Memory、Fetch、Discord、Telegram、SQLite，以及上表的三个本地 MCP。
- **8 个远程 MCP** 中，Microsoft Learn 完成公开读取；GitHub、Figma、Sentry、Vercel、Netdata、Notion、Slack 在没有授权凭据时拒绝连接，未取得账号权限范围内的工具定义。`coming_soon` 条目也保留在本批清单中。
- **5 个 skill 包 / 9 条技能**：所选文件的目录摘要全部匹配；Cisco Skill Scanner 2.1.0 的本地静态、字节码、管道、关联和 Python 数据流分析未产生 HIGH/CRITICAL 告警。8 条 INFO 告警均为技能 frontmatter 缺少 license 字段；已记录仓库/Store 的许可证元数据，未将其视为恶意行为。没有启用扫描器的云端、VirusTotal 或 LLM 上传。
- **Agent Reach**：核对了固定 Unchain 源码中的三个工具包装器，实际检查了缺少依赖和空 URL 的响应。侧边服务环境没有 `agent-reach` 或 `yt-dlp`，包装器也未固定版本，因此没有任意选择一个最新版冒充实际安装对象。

额外的合成调用中，Filesystem 可以读取授权工作区文件并拒绝直接越界读取；SQLite 的只读接口拒绝建表输入；MarkItDown 成功转换合成 `data:` 文本。没有对真实浏览器、用户桌面、消息渠道、生产数据库或私人文件进行操作。

## 已确认的接入问题：复用 #164

在 Unchain `8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1` 中，MCP 工具转换默认不要求确认，仅依赖服务器自报的 `destructiveHint`。目录里的确认要求没有进入这一路径。

使用真实 SQLite MCP 和真实确认执行器复核：目录声明 `create_table` 需要确认，实际转换后却不需要；拒绝确认的回调被调用 **0 次**，合成测试表仍创建成功。Filesystem 创建合成目录也没有触发确认。另有 10 个条目的部分预览工具存在声明与转换结果不一致。

这一源码接入范围的结论是 **FAIL**，见 [integration-report.json](integration-report.json)、[SQLite 效果证据](sqlite-confirmation-check.json) 和 [工具转换结果](runtime-confirmation-check.json)。它与已有 [#164](https://github.com/haoxiang-xu/PuPu/issues/164) 重合，没有重复建票，也没有修改该票。**这是宿主接入问题，不是第三方插件恶意代码的证明。** 当前发布安装包与该源码的对应关系仍未验证。

## 依赖与指令范围

15 个本地包都取得了本次解析的 npm 锁文件或带摘要的 Python 依赖清单，安装生命周期脚本未执行。OSV 原始输出和逐告警初步适用性分析在 [dependency-assessment.json](dependency-assessment.json)。告警包含 CVE/GHSA/PYSEC 别名和重复记录，不应直接相加为独立漏洞数；当前也没有将“命中”写成“已经可利用”。

Grafana 的 Python 包内是 Go 可执行文件，外层仅一个 Python 包的扫描不够。本次另从实际 arm64 二进制提取 **157 个 Go 依赖模块**并扫描，保留原始构建信息及派生清单。Chrome DevTools 同样包含打包后的第三方 JavaScript，外层 npm 清单零告警不能覆盖这些内嵌组件。

Vercel Web Review 会在运行时获取 `main` 上的规则；本次额外记录了所观察规则的固定 commit、摘要和内容，但这不会固定未来执行。其余技能的正常角色、输出格式、规划、审计准备指令没有被自动当成 prompt 投毒。可执行辅助资源、未打包的配套 skill、可选分析器和真实模型调用仍须按实际宿主环境验证。

## 证据与复现

- [results.json](results.json)：29 项结果与逐项报告路径；[reports/](reports/) 中每份报告列出适用规则、证据摘要、范围和复审条件。
- [subjects/](subjects/)：固定版本、实际下载摘要、逐文件清单和注册表元数据对应关系；[runtime-artifact-correspondence.json](runtime-artifact-correspondence.json) 核对了实际运行文件。
- [sandbox-profile.sb](sandbox-profile.sb)、[sandbox-controls.json](sandbox-controls.json)：真实 macOS Seatbelt 隔离及正负对照。写入仅限合成目录；个人目录读取被拒绝，显式受信任 Python/Node 运行时路径除外；TCP/Unix socket 控制均被拒绝。它不是 VM，也不提供完整系统服务或系统调用审计。
- [skill-scan-runs.json](skill-scan-runs.json)、[skill-content-review.json](skill-content-review.json)：扫描范围、原始告警与判断；扫描器版本和规则文件摘要另有记录。
- [operators/](operators/)：本机运行脚本；需要按 `/tmp/pupu-third-party-state.json` 中的 `work`、`out` 重新配置一次性目录、可信运行时和隔离路径，不是可直接跨机器使用的安装器。原始下载字节保留在该工作目录的 `subjects/`，报告中的固定 URL 和摘要可用于重新取得。每次复现使用新目录，避免覆盖历史证据。
- [evidence-manifest.json](evidence-manifest.json)：本次本地证据摘要清单。摘要证明字节身份，不等于签名、发布者认证或 SLSA 构建证明。

操作性问题也保留了记录：初次归档遇到链接后停止，随后只提取普通文件并核对所选技能摘要；第一次 npm OSV 提取器名称不正确，诊断后修正重跑；MarkItDown 初次冷启动超时，导入诊断完成后加长握手时间，重新握手和转换成功。Grafana 初次取得 x86_64 wheel，随后另取实际安装的 arm64 wheel，并逐文件匹配。Bug Bounty Intelligence 的 npm 安装仅将入口 shebang 的 CRLF 改为 LF，原始与执行字节摘要均保留。完成新隔离控制及身份核对后，15 个本地 MCP 已重新执行最终协议检查。

本轮使用 PuPu proposed v0.1 验证规则。完整 Verified 仍需补齐适用的依赖判断、真实 PuPu 模型恶意输入测试、提供商测试账号、浏览器隔离环境和实际发布安装包对应关系。目录可用性与安全证据是不同状态；本轮没有修改 Store 可用性或 Verified 标记。
