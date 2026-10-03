# #390 Claude parsed_output 修复验收 — 2026-10-02

## 结论与范围

**PASS：Claude `parsed_output` 污染下一轮请求的修复。** 这份结论仅覆盖
BC-390-07 / SEQ-390-12 / AC-390-13，不代表 #390 全部 provider/生命周期矩阵已验收。
本次复核未修改生产代码，未提交、推送或关闭 ticket。

新响应在 Anthropic adapter 的语义/replay 分叉前移除 SDK 辅助字段；旧结果先
完成原始 replay 关联，再在 outbound 深拷贝中移除。封闭输入契约没有放宽。
thinking signature、text、citations、tool ID/名称/参数/顺序继续保留。

## 验收证据

1. 本次在同一安装 wheel 上重跑真实 SDK、文本 replay、消息契约、wire preparer
   和 phase2 lifecycle 五组测试：**72 passed in 16.67s**。覆盖默认空值、非空
   SDK 解析状态、并行工具、历史记录、冷恢复和任意未知字段拒绝。
2. 原事故保存结果仍会原样触发
   `anthropic messages[6].content[0]: unknown fields: parsed_output`；对其 frame
   深拷贝使用候选 outbound projection 后严格校验通过。原文件 SHA-256 保持
   `0802c7efabd988e2f15f9019cbaddbfc1e23fb337ab3a13adaa54aa1adff4bc0`。
3. 真正 Anthropic SDK 0.83.0 + HTTPX MockTransport 探针完成两个 HTTP 请求，
   输入 SSE 不含 helper，输出 semantic/replay 同样不含 helper。
4. 在已重启的现有 profile 上，用真实 `anthropic:claude-opus-4-6` 新建临时
   验收 chat。第一条用户消息产生 `[text, tool_use, tool_use]`，两个 `web_fetch`
   各执行一次，工具结果返回后模型完成最终回答。第二条用户消息再次产生
   `[text, tool_use]`，工具执行后再次完成回答；两轮错误均为 null。
5. 只读核对该临时 chat 的 SQLite journal 和内容寻址对象：三个工具结果均为
   `ok=true, status_code=200, error=""`；四份 provider result 和四份 request
   wire 全部摘要匹配，递归 `parsed_output` 字段计数均为 0。最终回答到达
   renderer DOM。工具确认等待属于人工交互时间，不用它计算模型延迟。
6. 当前 sidecar PID 32558，host 的 `ready=true`、Memory V2 `ready=true`。
   host 验证得到的 protocol digest 与候选 wheel 导出的 manifest 相同。
   安装目录的 **344 个 wheel 包文件**与原 wheel 逐字节一致，两个生产修复
   文件也与当前源码一致。

上一实施轮已用这同一个 wheel 跑完 PuPu sidecar 全量：**2653 passed,
17 skipped, 3597 subtests passed**，一个既有畸形签名 serializer warning。
Unchain 全量的四个既有 OpenAI SDK Literal 失败仍在验收范围之外，不能把
该全量结果描述成全部绿灯。

## 候选身份

- PuPu source tree SHA-256：
  `d5c70fa66311f58947c93e9029e1c9b7d8cc01536d05a0f35493898d183b4974`。
  计算方法：对 git 列出的 `src/`、`electron/`、`unchain_runtime/server/`、
  `public/`、`scripts/`、`package.json` 和 `package-lock.json` 共 1848 个文件，
  将排序的 `[相对路径, 文件 SHA-256]` 数组编码为紧凑 JSON，再计算 SHA-256。
- Unchain wheel SHA-256：
  `1982a6f95ec55b62a339ec89952243601ec15c0579fc76cf365b59e6f5c1cda7`。
- Runtime manifest digest：
  `sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`。
- Candidate pair digest：
  `sha256:22289379e4c096ffb85782de5f0e071e91ec79c49c3817b739bdff4a589c89c0`。
  计算方法：将上述三个摘要以 `pupu_source_tree_sha256`、
  `unchain_wheel_sha256`、`runtime_manifest_digest` 为键，排序紧凑 JSON 后计算
  SHA-256。本地开发候选的身份记录用于溯源，不参与 runtime capability 准入。
- 安装目录：`unchain-390/.release-qa/ticket-390/claude-parsed-output/installed-runtime`。
- 临时 live chat：`chat-1790977500199-0a575eca4b0e798efb146ea03ea3cc74`；
  两次根 attempt：`unchain-1790977500419-a660d328a2e958`、
  `unchain-1790977700087-6379b1a166068`。核对证据后删除临时 chat，并恢复原活跃 chat。

## 独立发现：P2 测试 API 错判成功工具状态

`src/SERVICEs/test_bridge/tool_call_evidence.js:21` 使用
`result?.error != null` 判断失败；`web_fetch` 的成功结果包含 `error: ""`，
因此测试 API 把三个实际成功的工具结果全部返回为 `status: "failed"`。
原始 SQLite 工具结果和真实 provider 续传正常。

最小输入：`tool_result` 的 `result={ok:true,status_code:200,error:"",result:"Example Domain"}`。
现分支及未修改的 HEAD 都输出 failed，该文件逐字相同。这是既有测试证据
投影问题，非本次 Anthropic 修复回归。它会误导使用 Test API 的验收/统计；
建议调整为空错误不判失败，并保留 `ok:false`、`is_error:true`、真实非空
错误以及 denied/cancelled 的判定。本次验收仅记录该项。
