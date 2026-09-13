# PuPu Official 插件安全审查 — 2026-09-13

本轮结论：**Core 未通过，Plan 未通过，Computer 证据不足；没有项目获得完整 PASS。** 已确认 3 个安全边界问题。结论绑定以下源码快照，不代表实际发布安装包已经完成验证。采用 PuPu proposed v0.1 规则，不是第三方认证。

| 对象 | 结论 | 依据 |
| --- | --- | --- |
| Core（9 个工具） | FAIL | 可绕过命令确认；搜索可读取工作区外文件 |
| Plan（5 个工具及 Plan First 指令） | FAIL | 计划发现可通过符号链接读取工作区外计划信息 |
| Computer（当前未启用） | INCOMPLETE | 协议与模拟确认测试通过；没有真实隔离桌面、真实模型及输入输出验证 |

范围按 PuPu Store 的 `origin=official` 判断，覆盖运行时可见的 Core、Plan，并额外检查代码中受开关控制的 Computer。内置分发的 Agent Reach 仍属第三方；微软等厂商官方 MCP 不属于 PuPu 自有 Official，本轮未包含。运行时目录保存在 [runtime-catalog.json](runtime-catalog.json)。

## 已确认的问题

### PV-F01 · 高风险 · Core 命令确认绕过

命令分类器只检查可执行文件的文件名是否属于低风险名单。工作区中由攻击者控制、名为 `cat` 的程序因此可获得免确认执行，即使它实际写入文件。

经真实 `execute_confirmable_tool_call` 确认执行器复核：普通重定向写入触发 1 次确认并被拒绝；伪装程序触发 0 次确认，成功写入合成标记文件。前提是模型/调用方选择了攻击者提供的程序路径；没有证明模型必然会被诱导选择该路径。

位置：Unchain `shell_runtime.py:173–205`、`coding_backend.py:700–718`。建议先修复可执行文件身份验证，对任意路径程序要求确认，同时审查可触发执行的参数和外部辅助程序。

### PV-F02 · 高风险 · Core 搜索越过工作区边界

普通 `read` 会拒绝指向工作区外的符号链接，但 `grep` 遍历后直接读取目标，能返回同一外部文件的内容。测试通过真实确认执行器返回了合成敏感标记。攻击者需能控制工作区内链接，且目标文件对宿主账户可读。

另有 `glob('../outside/*')` 返回工作区外路径；这一分支单独只证明低风险的路径泄露，没有证明内容读取。

位置：Unchain `coding_backend.py:273–283,477–505,555–568`。应对每个枚举结果重新验证解析后的目标是否在允许根目录内，拒绝父目录穿越，并处理检查后替换链接的竞争条件。

### PV-F03 · 中风险 · Plan 发现读取外部计划

`plan_list` 在读取文件前没有验证目录和文件链接的最终位置。单个 JSON 文件链接、整个 `plans` 目录链接均能返回工作区外计划的标题等元数据。目标必须是可读、符合计划结构的 JSON；没有证明任意文件原文泄露。

位置：Unchain `plan.py:369–389,653–669`。已有写入边界检查在测试中仍然有效，外部 JSON 未被修改。应为计划发现和读取补上同等边界验证。

全部问题尚未修复，证据与建议见 [findings.json](findings.json)；同一审查者的复核见 [confirmation-recheck.json](confirmation-recheck.json)，不称为独立审计。

## 检查与限制

使用 macOS Seatbelt，先验证合成目录读写成功、个人目录合成文件读取被拒绝、越界写入被拒绝、TCP 与 Unix socket 连接被拒绝，再执行目标工具。测试只使用合成资料、拒绝确认回调和清理后的环境变量。没有传入真实凭据，也没有操作真实桌面。隔离规则允许系统路径读取及部分系统服务，不能等同于 VM 或完整系统调用跟踪。

已有相关测试 **106 项通过**；恶意边界探针 25 项中有 6 项失败，归并为上述 3 个问题。通过的普通功能与模拟测试不能抵消实际安全边界失败。当前测试没有通过真实 PuPu 模型循环注入恶意文档或截图，不能声称已经完成模型级 prompt 注入验证。

OSV-Scanner 2.5.1 完成两组扫描：Unchain 锁文件 67 个包，14 个版本命中、70 条告警记录；PuPu 直接依赖 13 个包，4 个版本命中、46 条记录。记录包含重复别名，**不能相加称为 116 个独立漏洞**。已保存初步适用性分析，但部署依赖闭包、实际可达路径仍有未决项，不授予依赖检查 PASS。详见 [dependency-assessment.json](dependency-assessment.json)。扫描器退出码 1 表示命中，不是扫描器失败。

所审声明指令中没有确认恶意指令；正常规划和确认要求不被归类为 prompt 投毒。这只是选定指令范围内的结论，不是完整安全保证。

## 固定对象与证据

- Unchain：`8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1`，包版本 `0.2.0`，Core/Plan 工具包版本 `1.0.0`。
- PuPu 侧边服务源码：`362fd69dc7edfada03121b6cb8a7682742e2b67a`。
- [unchain-subject.json](unchain-subject.json) 与 [pupu-subject.json](pupu-subject.json) 保存仓库、源码归档 SHA-256、取得路径及逐文件摘要；取得文件不等于每个文件都完成深入审查。
- [core-report.json](core-report.json)、[plan-report.json](plan-report.json)、[computer-report.json](computer-report.json) 保存逐项规则状态、工具定义摘要、环境、发现与复审触发条件。
- [results.json](results.json) 为汇总；[evidence-manifest.json](evidence-manifest.json) 为证据摘要清单。摘要只校验内容身份，不提供签名或发布者真实性保证。

实际安装 wheel、发布包与所审源码的对应关系未建立。Computer 的真实屏幕读取、操作权限、外部提供商交互和模型行为仍需在隔离桌面中验证。代码、依赖、工具描述、权限或配置变化后应针对新对象重新审查。

## 复现说明

目录中的 Python 脚本保留本机原始运行方式，**不是可直接跨机器运行的安装器**。它们依赖合成状态目录和可信 Python 环境；不要直接重复运行到原证据目录，否则会覆盖历史输出或与已有测试链接冲突。

1. 新建一次性目录，将两个仓库按各自 subject 文件中的固定 commit 和 `paths` 使用 `git archive` 导出并解压到 `unchain/`、`pupu/`。核对归档与逐文件摘要。
2. 建立新的 `sandbox/home` 和 `sandbox/tmp`。以本目录 [environment.json](environment.json) 为模板替换工作目录；不要继承个人凭据环境。Python 版本及已用依赖版本见报告和 `confirmation-recheck.json` 的 `runtimePackages`。
3. 复制 [sandbox-profile.sb](sandbox-profile.sb)，将其中合成目录和受信任 Python 路径换为当前运行环境。原配置只在 macOS 验证；其他系统应使用同等实际隔离并重新验证控制项。
4. `run-security-probes.py` 使用 `/tmp/pupu-official-verify-state.json` 的 `work`、`out` 字段，读取工作目录的 `environment.json`、`sandbox.sb`，并从 `/tmp/pupu-security-probes.py` 复制探针。复现时将这些路径改到新的本次状态文件、输出目录以及本报告的 `security-probes.py`；同时调整 Python 和合成拒绝读取文件的创建目录。其父进程创建 TCP/Unix 测试监听器，子进程必须全部得到 EPERM，否则探针会中止。
5. 通过同一隔离配置运行 `confirmation-recheck.py`，保留独立输出；运行 `run-isolated-tests.py` 中列出的固定测试集。每次使用新的合成目录。原命令清单见 `isolated-test-run.json`。
6. 依赖扫描采用 `osv-scanner scan source --lockfile <文件> --no-resolve --format json --all-packages --output-file <新结果>`，分别扫描 Unchain `uv.lock` 与 PuPu 侧边服务 `requirements.txt`。在线数据库后续会变化，应保留新时间与原始记录，不修改本次历史结果。

本轮仅生成本地审查材料，没有修复代码、发布证据或修改 Verified 标记。范围发现时，前端把 Official 自动显示为 Verified；那是展示策略，不能替代本轮安全证据。
