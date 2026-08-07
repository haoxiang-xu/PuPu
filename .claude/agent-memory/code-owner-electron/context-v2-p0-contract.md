---
name: context-v2-p0-contract
description: Memory/Context V2 受控 bridge 的 IPC 契约与不可回退约束（P0 2026-08-01，schema-v4 review 三件套同日追加）——动 CONTEXT_V2 通道或 contextV2* 方法前必读
metadata:
  type: project
---

Memory V2 的 Context 控制面：`CHANNELS.CONTEXT_V2`（**18 条**）+ `electron/main/services/unchain/service.js` 里的 `contextV2*` 方法（19 个，含 renderer 够不到的 `deleteContextV2Chat`）+ `window.contextV2API` + `src/SERVICEs/bridges/context_v2_bridge.js`。

**Why:** 这些是设计时刻意做的取舍，代码注释里有但极容易在后续 phase 被"顺手"破坏：

- **独立 namespace 是刻意的，不是洁癖。** unchain bridge 已经是超大高爆炸半径面（`createUnchainService` GitNexus upstream 深度3 = 850 符号 / CRITICAL），Context V2 不能再往上堆方法。新增 Context 能力 → 加 CONTEXT_V2 通道，**不要**加到 unchainAPI。api_contract 测试反向锁死（断言 unchainAPI 上不存在 context 方法）。
- **能力集是冻结的 18 条**（原 15：status/events/content/session-head/rebase/spaces/tree/entries/search/candidates/jobs/promotions/candidate-decision/promotion-create/promotion-decision；schema-v4 追加 3：listCandidateReviews/getCandidateReview/decideCandidateReview）。**故意缺席**且不得补：event append + session bootstrap（属于 stream 路径）、job create/claim/heartbeat/complete/fail（worker lease，renderer 永不能持租约）、space/entry 的 create/update/delete（写只走 candidate→decision 漏斗）、candidate create（agent 产出，非 renderer）、**candidate-review propose**（curator job 产物——能 propose 又能 decide 就是自己批自己的写）、review 专用 content 通道（走既有 READ_CONTENT ref 文法）、任意 long-term namespace。三层测试锁死（ipc_channels 正则 / api_contract 列表 / service 方法列表），三处数字契约 15→18 同步。
- **review 决策只决定"要不要落"，永不决定"落到哪"。** decision allowlist 9 字段（ownerChatId/reviewId/decision/expectedReviewRevision/expectedCandidateRevision/expectedTargetRevision/expectedSpaceRevision/decisionReason/operationId）——targetPath/spaceId/jobId/namespace 都不在里面，落点从库里存的 review 读。`expectedReviewRevision` 是**必填** CAS（无它就可能提交用户没看过的 diff），另三个 fence 可选但缺省时**整个 key 省略**而非发 null。
- **review 响应是 Context V2 里唯一做出站投影的读**：body 大半是自由格式 curator 输出，所以 `contextV2CandidateReviewResponse` 逐字段重建 + diffPreview 截断 8192 + ownerChatId 用**调用方**校验过的值回填（响应不能把自己改归到别的 chat）。
- **`MEMORY_V2_REQUIRED_SCHEMA_VERSION` 是等值门不是下限**，必须与 `memory_v2_store.SCHEMA_VERSION` 逐版对齐（v4 起带 candidate_reviews 表）。低一版和高一版都判 `context_v2_schema_incompatible` 走 degraded；改这个数就要同步 memory_v2_rollout.test 与 memory_v2_startup_readiness.test 两处 fixture。
- **renderer facade 的 `resolveApi()` 要求全部 18 个方法齐**，缺一即 `isAvailable()=false`（fail closed）。后果：preload 与 renderer 必须同版发布；dev 下只热更 React 不重启 Electron 会让整个 Context V2 静默不可用——排查"功能突然全没了"先看这里。
- **没有 generic proxy。** 通道不带 method/path/url/endpoint 选择器；`contextV2Request` 是闭包内私有的，**不导出**（service 表面测试断言 `contextV2Request` 等 undefined）。
- **promotion target namespace 是 server-bound**（Flask 路由硬编码 `user:local`），preload 与 main 的 allowlist 里都没有这个字段——加进去 = 让被攻陷的 renderer 选择记忆落点。测试同时喂 `targetNamespace` 和 `target_namespace` 两种拼法验证被丢弃。
- **status 必须 count-free**：main 用显式 allowlist 重建 {available, schemaVersion, journalMode, lexicalBackend, vectorStatus}。store 层 `status()` 其实**返回 counts**（Flask 路由目前丢掉了）——所以这层重建不是冗余，是唯一保证。无 scope 计数 = 免费枚举 oracle。
- **content ref 走封闭文法 + 逐段 encodeURIComponent。** 8 条 ref 正则镜像 `memory_v2_store` 的 `_*_REF_RE`。逐段编码（不是整串 encodeURIComponent）是有理由的：`pupu://memory/s/e@1` 解码后的 PATH_INFO 必须和后端 `tests/test_route_memory_v2.py` 用的字符串完全一致（那条 `<path:ref>` 路由确实吃得下 `//`，已跑 pytest 验证 2 passed）。测试锁死 `decodeURIComponent(pathname)` 的等价性。
- **错误只回 `[code] 静态文案`**：`contextV2Request` 保留 sidecar 的 stable code，但**丢弃上游 message**（后端 message 会带 sqlite 绝对路径和 Traceback）。传输失败统一成 `context_v2_unreachable`（原始 fetch error 带 host:port）。handler 日志只打方法名 + code。
- **preload 侧逐字段重建，永不转发调用方对象**（含无参调用时也发全 undefined 的 allowlist 形状，让 main 拒绝而不是默认）。

**How to apply:** 改 CONTEXT_V2 任何一环前先读 service.js 里 "Context / Memory V2 (P0)" 两段块注释；加通道必须同时过 CTO（共有动脉）+ 安全 owner。`.js`/`.cjs` twin 见 [[electron-test-twin-mechanics]]（真正会跑的壳在 `src/electron/tests/**`）。相关：[[memory-vault-p0-contract]]（同一个 Memory V2 P0 里的另一半，vault 管密钥、context 管上下文）、[[security-attack-surface]]（token 不进 URL 这条在这里是靠 header-only + 测试断言 url 不含 token 守的）。
