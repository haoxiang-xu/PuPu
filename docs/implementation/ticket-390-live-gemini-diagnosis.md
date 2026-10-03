# #390 实机 Gemini 失败诊断 — 2026-10-02

后续修复与验收记录见 [ticket-390.md](ticket-390.md#gemini-http-503-remediation-evidence--2026-10-02)。下文保留修复前事故现场和当时的判断，不代表当前候选包的状态。

本次触发原因已从实机原始 traceback 确认：Gemini 在建立响应流时返回 HTTP 503 UNAVAILABLE，提示模型需求过高。Unchain 将这个明确的 HTTP 拒绝按既有的保守策略转成 durable_provider_turn_uncertain。本次不是工具结果读取失败，也没有发现 #390 原生上下文续传修复发生回归。

本报告是诊断证据，未修改生产代码。隔离探针及重试原型均不代表生产修复已经完成；整条真实任务失败，不能作为完整验收通过。

## 1. 真实故障证据

- 运行实例：PuPu ticket-390，沿用用户已有的 Application Support/pupu profile；sidecar 端口 5879。未新建空白 profile，未修改 provider 凭据。
- Chat：chat-1790964948947-b25ce313dd1768c1830606d4eb1721c2。
- 当前用户输入：gemini他们家呢。
- Root attempt：unchain-1790966034035-d1637db22fbf28。
- 模型：gemini:gemini-3.6-flash。
- 精确部署 wheel SHA-256：ace78828c08152b48d34ad3110b76310534ff64880edcb5f4df9e6606e54862b。
- 实机依赖：google-genai 1.68.0，httpx 0.28.1。

已有 DevTools 的 preload error console 保存了以下原始错误：

```text
google.genai.errors.ServerError: 503 UNAVAILABLE
error.code = 503
error.status = UNAVAILABLE
error.message = This model is currently experiencing high demand.
```

错误消息后续说明需求峰值通常是临时的，建议稍后重试。真实 traceback 依次经过 Google SDK 的 request_streamed、_request、_request_once、APIError.raise_for_response、raise_error，再被 DurableProviderTurnRuntime._execute_route 第 764 行包装为 uncertain。HTTP 响应状态检查失败，尚未进入正常响应 chunk 解析；不是已经输出后遭遇 SSE 流中错误。

身份校验：SHA256(root attempt UTF-8)[:12] = 821b00de57d9，与 traceback 紧邻的 chat-latency 日志完全一致，排除了借用其他请求异常的可能。该日志 elapsed_ms=59497。

| Iteration | Receipt 结束时间 UTC | 结果 |
| --- | --- | --- |
| 0 | 18:34:03.638686 | completed |
| 1 | 18:34:11.189506 | completed |
| 2 | 18:34:16.521537 | completed |
| 3 | 18:34:22.745118 | completed |
| 4 | 18:34:30.692578 | completed |
| 5 | 18:34:53.302831 | uncertain |

失败请求从 18:34:33.352699 开始，等待 19.950 秒。SDK 本地配置为 120 秒超时、总发送次数 1；本次不是该固定超时触发。

## 2. 故障链及本地问题

Gemini 503 拒绝 → exact transport 提取到 status=503 → 分类函数只允许 429/529 安全重试，503 未分类 → durable runtime 的通用异常分支 → uncertain receipt、STARTED lease → 任务失败，界面显示模糊错误及 Conversation preparation incomplete。

- src/unchain/providers/exact_route_transport.py:50：既有分类不能区分请求建立时的真实 HTTP 503 拒绝与成功 HTTP 200 之后的 SSE 503。
- src/unchain/providers/durable_turn_runtime.py:754：未分类错误保留 STARTED，禁止再次发送，但未持久化原始失败的脱敏诊断。
- src/unchain/providers/gemini.py:160：SDK 仅发送一次，避免与中央 durable 重试叠加。该设置应保留；修复应位于中央分类及相应的阶段证据。
- src/unchain/retry/classifier.py:15：legacy 分类虽列出 5xx，但不识别 Google APIError。它是额外的兼容缺口；单独修改它不能修复本次 durable 路径。

完整 traceback 并未被显式因果链隐藏：raise ... from exc 仍保留原始异常。此前将 __suppress_context__ 解释成“原始 traceback 已被隐藏”不准确。真正缺失的是持久化诊断和可检索的 sidecar 日志：stderr 只经 IPC 写入 preload isolated-world console，Test API 捕获的是 renderer main-world console，没有捕获这些行。

只读扫描 journal、provider leases、receipts、RunBundle 及其 projections/details/compact，失败请求的原始错误、HTTP 状态和 finish reason 均未留下。重启或关闭控制台后，用户很难再定位原因。

## 3. 为什么之前没有修好

这是已有的保守策略缺口，不是 #390 新引入的回归，也不能简单说“测试漏了 503”。

- Unchain f3e9590（2026-08-04）引入仅 429/529 可安全重试的 durable 策略。
- b98e532（2026-09-11）增加 Google APIError.code 识别，但保留 503 未分类。
- tests/test_exact_provider_route_transport.py:729 明确断言 Google 503 分类为 None。
- PuPu docs/implementation/issue-163-gemini.md:77 明确约定 uncertain 5xx/network 不自动重发；第 99 行记录过真实 uncertain，第 60 行记录独立 native smoke 遇到 503 后手动延迟重跑通过。这些历史 uncertain 未被证实全部是 503，不能倒推同一根因。
- #390 Phase 2 验证了 429 重试、原生片段完整续传及生命周期，没有覆盖 HTTP 503 拒绝与流中 503 的区别。
- 当前 deployed wheel 的 exact transport、durable runtime、legacy retry classifier 与 #390 基线 da5d55b 逐字节相同。

此前测试证明了保守策略被正确执行，但没有证明这个策略能妥善处理普通用户实际遇到的 Gemini 临时过载。

## 4. 请求及原生续传核查

成功 iteration 4 和失败 iteration 5 的完整 wire 均已抓取，仅保留在本机临时证据中，不纳入提交。

- Google SDK 接受两份完整 contents/config；81 个工具 schema 和模型配置相同。
- iteration 4 的持久化原生 assistant 消息与 iteration 5 发出的消息完全相同，包含 reasoning、工具参数、签名与顺序。
- 工具调用与结果 ID、名称配对正确；签名正常解码。
- DeepSeek 历史作为参考文字传入，没有泄漏其原生工具协议字段。
- 上次成功输入为 27,291 tokens；失败请求只增加约 10.8 KB，没有上下文溢出的证据。
- context_content_read 已成功返回 8,192 bytes，之后的模型请求才失败。

SDK 结构验证不等于远端签名验证。不过本次真实响应和堆栈明确指向 503 高需求拒绝，不是原生片段被改写的本地 guard 错误。

## 5. 已验证的修复方向

原始输入的完整离线反馈环已经跑通：/tmp/pupu390_exact_gemini503_probe.py。使用实机捕获的失败 wire（SHA-256 f3eb87aec4461fa306547410ba64b476d441c7abd433d822609d6670e7a53850）、完整 81-schema catalog、原部署 wheel、PuPu SDK 及真实 SQLite service；仅冻结 host authority 准备结果，并用隔离 MockTransport 返回实机原始 503 JSON，无外部网络请求。消息、系统提示和完整工具定义经 SDK 序列化后均与原请求一致。重试预算设为 3，仍只发送 1 次，报 uncertain，lease 保留 STARTED 且 diagnostic=null。再次进入同一请求不发送，直接报 uncertain，连原始 cause 也无法恢复。该反馈环复现了本次故障机制，而非只复现一个相似的错误码。

Google 官方建议对 503 使用有上限的指数退避及随机抖动：https://ai.google.dev/gemini-api/docs/troubleshooting 。

应先区分失败阶段，再复用已有 durable 重试合约：

1. 对真实 Google APIError、HTTP response 确认 503、尚未进入正常内容响应的拒绝，封存失败 lease，按预算退避，以新 retry ordinal 重发同一冻结模型请求。
2. HTTP 200 后的流中错误、网络断连或无法确认完成状态的失败继续 uncertain，禁止自动重发。
3. 不重跑前面的 web_fetch 或 context_content_read；重试的是当前 iteration 5 模型请求。
4. 保存受限且脱敏的 provider/status/失败阶段/响应观察信息；界面显示“Gemini 暂时繁忙”及重试进度，预算用尽后明确提示。不能仅保存 opaque uncertainty code。
5. 为上述序列建立回归用例，测试停止、重启、重试预算、请求正文一致和已完成工具不重复执行；以实际部署 artifact pair 再做实机验证。

隔离解释器中的窄分类原型已跑真实 SDK 和 SQLite durable service，未改 installed source：

| 响应序列 | 原型行为 |
| --- | --- |
| HTTP 503 → 成功 | 发送 2 次，请求正文完全相同；遵循 Retry-After；重开服务复用结果，不再次发送 |
| 已输出后 SSE 503 | uncertain，仅发送 1 次 |
| 连续 HTTP 503，重试预算 1 | 发送 2 次后 RetriesExhaustedError，无无限循环 |

上表是修复前的隔离原型。随后已在 #390 工作树实现有上限的真实
HTTP 503 重试、脱敏诊断与界面进度，并用最终 Unchain wheel + PuPu sidecar
验收；具体产物和测试见 `ticket-390.md` 的“Gemini retry-progress final artifact”。
最新实机任务中的 Gemini 工具续传成功，但没有再次遇到远端 HTTP 503；
503 分支的实证仍来自原始请求字节、真实 Google SDK、隔离 HTTP 响应和 SQLite。

## 6. 同时查出的其他协议缺口

以下均在实际 wheel、真实 SDK 与隔离 HTTP/SSE 响应中验证，但不是本次真实 503 的原因：

- Gemini 的 MALFORMED_FUNCTION_CALL、SAFETY、空 STOP 等明确失败也被转为 uncertain，现有 HTTP-only diagnostic 类型不能充分表达这些失败。
- 收到正文后干净 EOF、完全没有 finish reason，仍被持久化为 completed 且 replay.complete=true。需要验证流的明确终态。
- stream.close()/client.close() 异常可能覆盖原始失败或完整结果；stream.close() 抛错还会跳过 client.close()。关闭错误应作为次要诊断，不能替换主错误。

临时证据：/tmp/pupu-390-gemini-uncertain-journal.json、/tmp/pupu-390-gemini-wire-audit.json、/tmp/pupu390_exact_gemini503_probe.json、/tmp/gemini-real-sdk-stream-probe.json、/tmp/gemini-prebody-retry-contract-probe.json。合成响应和原型结果均与真实事故证据分开标注。
