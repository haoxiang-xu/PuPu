# #390 Claude 实机故障诊断 — 2026-10-02

## 结论

截图中的 `provider_message_schema_invalid: anthropic messages[6].content[0]: unknown fields: parsed_output`
已用事故原始持久化结果和正在运行的 Unchain wheel 逐字复现。根因是
Anthropic SDK 的响应解析辅助字段被我们的通用序列化复制进下一次请求。
这是 Unchain Anthropic 适配边界的问题；Memory V2 保存并重建了被污染的消息，
并非分页、工具执行失败或远端临时过载。它与上一项 Gemini HTTP 503 不同。

本次只做诊断，没有修改生产代码、用户数据库或实例配置。

## 实机证据

- Chat: `chat-1790964948947-b25ce313dd1768c1830606d4eb1721c2`。
- 用户消息：`claude呢`；模型：`anthropic:claude-opus-4-6`。
- 根 attempt: `unchain-1790968880252-8d43c9617e3938`。
- 图 step: `graph-step-c52536dcb0c8977938068f272d3403ce5863b7e6bab2b1eac789e578bba8830a`。
- Iteration 0 的 provider lease 为 `started → completed`。模型返回
  一个文本块和两个 `web_fetch`；两个工具结果均成功保存。
- Iteration 1 只有工具目录快照，没有新的 provider wire snapshot 或 lease。
  因此失败发生在下一次模型请求准备阶段，尚未发送给 Anthropic。
- 原始 `assistant_messages[0].content[0]` 字段为
  `citations, parsed_output, text, type`；其中 `parsed_output` 为 `null`。
  同一字段也存在于 `provider_replay_frame` 的对应文本块。
- 原始结果 artifact SHA-256：
  `0802c7efabd988e2f15f9019cbaddbfc1e23fb337ab3a13adaa54aa1adff4bc0`；
  内部 result SHA-256：
  `993dffdff82d1d0c3dbf837607a41ac51ee10c930f7390559eb9831655589277`。

原始请求/结果仅保存在权限为 0600 的本机 `/tmp/pupu390-claude-wire.json`
和 `/tmp/pupu390-claude-result.json`；不把会话正文纳入提交。

## 两条独立复现

### 原始事故 artifact

对 iteration 0 冻结请求的六条消息追加保存的完整 assistant message，
运行真实 `validate_anthropic_messages`：

```text
REAL_ARTIFACT_REPRODUCED provider_message_schema_invalid: anthropic messages[6].content[0]: unknown fields: parsed_output
NO_HISTORY_NO_TOOLS_REPRODUCED provider_message_schema_invalid: anthropic messages[0].content[0]: unknown fields: parsed_output
REMOVE_ONLY_PARSED_OUTPUT PASS
```

仅保留该文本块、移除所有旧历史和工具仍能复现。仅从深拷贝的文本块移除
`parsed_output` 后校验通过。工具内容及历史不是这一失败的必要条件。

### 真正的 SDK 流与运行器

使用实机解释器 `/Users/red/Desktop/GITRepo/PuPu/.venv/bin/python`、
Anthropic 0.83.0、Pydantic 2.12.5、最终安装 wheel 和 HTTPX MockTransport，
输入普通文本＋两个工具的合成 SSE。没有远程请求，也没有开启 output_format。

```text
PYTHONPATH=/Users/red/Desktop/GITRepo/unchain-390/.release-qa/ticket-390/gemini-503-progress-final2/installed-runtime /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python /tmp/ticket390-claude-sdk-wrapper-audit.py
```

实际输出：

```text
sdk 0.83.0
final classes ParsedMessage ['ParsedTextBlock', 'ToolUseBlock', 'ToolUseBlock']
model_dump text {'citations': None, 'text': 'Checking two sources.', 'type': 'text', 'parsed_output': None}
runtime error provider_message_schema_invalid: anthropic messages[1].content[0]: unknown fields: parsed_output
physical mock HTTP sends 1
tool effects [1, 2]
```

另一个真实适配器探针 `/tmp/ticket390-anthropic-stream-repro.py` 证实：
输入 SSE 没有 `parsed_output`，但提取后的语义消息和 replay frame 都有该字段；
第二轮在本地被拒绝，模拟 HTTP 发送次数仍为 1。

## 确定的代码链

1. SDK `messages.stream().get_final_message()` 返回 `ParsedMessage`，其普通
   文本也是 `ParsedTextBlock`。该类型定义 `parsed_output=None` 和
   `__api_exclude__={"parsed_output"}`。
2. `providers/native.py::_as_dict` 优先使用无参数 `model_dump()`，把 SDK
   辅助字段转成普通字典；字典不再带有 SDK 的 API 排除规则。
3. `AnthropicModelIO._fetch_turn_streaming` 优先取 SDK 最终消息，复制内容到
   `raw_blocks`，再分别构造完整语义 assistant message 和 replay frame。
4. Memory V2 将完整结果保存到 artifact。#390 当前 projection 保留完整消息，
   compiler 可以完成并保留该字段；它在这里并未拒绝。
5. replay 的语义匹配也能完成。随后 `wire_preparer::_anthropic_route` 调用
   `_translate_content_blocks_for_anthropic → validate_anthropic_messages`，
   CLOSED 文本请求契约拒绝 `parsed_output`，尚未写入第二轮 wire/lease。

官方 SDK 定义：
[ParsedTextBlock](https://github.com/anthropics/anthropic-sdk-python/blob/v0.83.0/src/anthropic/types/parsed_message.py)、
[TextBlockParam](https://github.com/anthropics/anthropic-sdk-python/blob/v0.83.0/src/anthropic/types/text_block_param.py)、
[流式累积器](https://github.com/anthropics/anthropic-sdk-python/blob/v0.83.0/src/anthropic/lib/streaming/_messages.py)。

当前安装 wheel、工作树和未修改基线 `da5d55b` 的 `anthropic.py`、
`native.py`、`message_contract.py` 逐字节一致。因此该缺口早于本次 Gemini 修复。
Unchain GitNexus 在诊断中刷新，2026-10-02 13:25 的索引覆盖当前工作树；
caller 查询也确认校验来自翻译层和 wire envelope 校验层。

## 为什么之前验收漏掉

- #369 的文本 replay 测试虽然构造 SDK 基础 `TextBlock`，其假流返回空事件
  和最终字典，绕过真正的 SDK 流式累积器，无法产生 `ParsedTextBlock`。
- #380 的真实事故和主要回归为 thinking＋tool，覆盖的是 `caller: None`。
- #390 的 durable coordinator/compiler 测试使用字典或 SimpleNamespace
  模拟最终响应，覆盖了持久化路径但没覆盖 SDK 的最终对象包装层。
- PuPu 真正使用 Anthropic SDK＋MockTransport 的 Kimi 测试是 thinking＋tool，
  没有文本；11 项 #369 测试和 9 项 Kimi 测试在本问题仍存在时全部通过。
- 当前没有 `parsed_output` 回归。不能用既有全量测试通过来宣称 Claude
  真实文本＋工具续传已验收。

依赖声明另有漂移风险：requirements 固定 0.83.0，uv.lock 为 0.86.0，
wheel/pyproject 使用开放下限。但事故与早期验收都使用 0.83.0，
版本漂移不是本次根因。

## 修复范围与必须验证的边界

1. **新响应**：在 Anthropic 响应块转换为 canonical request/replay 内容的边界，
   明确排除文本块的已知 SDK 辅助字段 `parsed_output`，同时处理空值及非空值。
   必须在语义/replay 两路分叉之前统一转换。
2. **已落盘结果**：先完成原始 artifact 摘要验证和严格 replay 匹配，再在
   待发送的深拷贝上移除该已知辅助字段。现有探针证实这一顺序可保留
   thinking signature 和语义一致性。不得修改旧日志、摘要或原始 replay frame；
   不得在语义匹配前只清理一侧。
3. **保留严格契约**：未知字段仍拒绝；文本、citations、thinking signature、
   工具 ID/名称/input/顺序保持一致；既有 caller 空值规范化继续保留。
4. **真实 SDK 回归**：固定 deployed SDK，用真实 SSE＋MockTransport
   完成文本＋单/并行工具后的第二次请求，再进入 SQLite durable
   coordinator → compiler → assembler，覆盖冷恢复和下一条用户消息。
5. **原事故反馈环**：原始 artifact 必须能构造合法下一轮请求；用新的同一
   wheel＋sidecar 验收并重启原资料实例，才判定交付。

只改 `exclude_none=True` 或 `to_dict()` 都不足以完整修复：显式设置非空
`parsed_output` 时二者仍可能带出辅助字段。也不能把 `parsed_output`
加入 Anthropic 输入 allowlist，或把所有未知字段无条件丢掉。
