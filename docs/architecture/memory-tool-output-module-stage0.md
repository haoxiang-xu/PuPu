# Tool Output Module（Unchain）— P0 Stage0 方案与边界冻结

本阶段目标：在不改动运行行为的前提下，冻结 `Tool Output` 的上下文裁剪模型、边界契约与验收路径，供 5.3 实施（P1）和 5.6 验收（AT）直接接力。

Stage 1 已完成，实施与验收边界见
[`memory-tool-output-module-stage1.md`](memory-tool-output-module-stage1.md)。本文件保留为
Stage 0 的历史冻结记录。

此版本不包含：
- 模型输入投影规则改动
- compiler 压缩策略改动
- toolkit/schema 改动
- curator/memory 迁移
- canary/all rollout

本文件只用于下一步实现拆分，不代表生产行为已切换到新管道。

## 一、P0 约束与假设（已锁定）

1. `Tool Output` 的治理只发生在 Unchain runtime，PuPu 只按接口消费。
2. 不引入新 Agent role，不新增 Agent Builder 卡片，不把 module 命名为独立 role。
3. `Tool Output` 管理能力以 attempt/执行流为单位注入，不形成全局单例状态。
4. 任何策略都只针对模型可见 projection；raw 内容全部落 durable artifact 可回读。
5. 兼容 `legacy` 流程：legacy 路径在未启用 Memory V2 active 时保持原有裁剪链路，禁止影响 V1 行为。
6. 不更改 `Tool` 现有公开签名（除非后续 Stage1 评审批准）。
7. 任何边界变更需同时具备正/负 AC 与 `BC/SEQ -> AC` 映射。

## 二、边界契约（BC）

### BC-TOOL-001：tool raw result → durable artifact
- **Producer（Unchain）**：工具执行入口（raw output、tool error、stderr/stdout/exit_code）
- **Consumer（Unchain）**：ArtifactService 与 journal/event 归档层
- **Policy**：`CLOSED` + `CLEAN`（只保留经过 sanitizer 的字节）
- **要求**：
  - 完整 canonical 输出先持久化；模型端只读 projection/preview/ref。
  - Journal 记录 event-level preview、digest、bytes、encoding。
  - 输出对象不得注入 Memory Workspace；只允许由 curator/assistant 显式整理。
- **失败语义**：持久化失败 = 该 tool call attempt 直接 fail-closed，不自动重试有副作用工具。

### BC-TOOL-002：tool policy -> route manifest snapshot
- **Producer（Unchain）**：tool/注册/路由装配逻辑
- **Consumer（Unchain runtime）**：attempt/context bundle/Context compiler
- **Policy**：`VERSIONED`
- **要求**：
  - tool 的 `output_policy` 在 route manifest 绑定为稳定版本（含签名/id）。
  - 缓冲层只接受在当前 route manifest 中声明版本，不得按运行时参数推断。
  - `None/unknown` 统一映射为 `generic_preview` 的默认版本，仅在 active runtime 内生效。

### BC-TOOL-003：tool execution receipt → canonical context projection
- **Producer（Unchain）**：durable tool execution receipt + artifact/source ref + policy snapshot + coverage
- **Consumer（Unchain）**：ContextCompiler（context build）
- **Policy**：`CLOSED`
- **要求**：
  - current batch 中仅使用 fresh view，不做二次压缩。
  - 压力线下只允许从交付事实中的 projection 选择历史 view。
  - 不得使用 “按轮次历史累计 + 局部优化器” 的二套重叠压缩。
- **失败语义**：projection 缺失/签名不一致 = 该 tool result 在当前编译中降级为可定位 ref 失败提示，不影响 attempt 重放。

### BC-TOOL-004：projection receipt → context read adapter
- **Producer（Unchain）**：context/runtime read 接口
- **Consumer（Unchain）**：compiler/tool caller
- **Policy**：`OPEN` in internal scope / `CLOSED` 对 external consumer
- **要求**：
  - 同一 `source artifact`/`full output ref` 可被分页读取（`offset/limit`）；
  - page 型 continuation 必须回指源 artifact，不可形成可持续衍生对象链条。
- **失败语义**：
  - read 权限/范围不匹配 = `context_v2_scope_mismatch`；分页边界错误返回空 chunk + 标记无更多数据，不伪造成功结果。

## 三、状态序列（SEQ）

### SEQ-TOOL-001：单次 tool call 生命周期
1. parent iteration 发起 tool call
2. attempt 记录 request
3. raw result 持久化到 artifact
4. projection 生成（fresh or checkpointed）
5. compiler 读取（fresh 优先）
6. next iteration 构建上下文
7. completion / rollback

适配项：
- first use：`REQUIRED`
- repeat：`REQUIRED`
- retry：`REQUIRED`
- resume：`REQUIRED`
- restart：`REQUIRED`
- reset：`REQUIRED`
- rollback：`REQUIRED`

### SEQ-TOOL-002：provider/model/protocol 重放序列
1. active provider run 接受 canonical projection
2. tool request/response 恢复（若重试）
3. context build 再入历史范围
4. 重启恢复时不重复执行 side effect

适配项：
- first use：`REQUIRED`
- repeat：`REQUIRED`
- retry：`REQUIRED`
- resume：`REQUIRED`
- restart：`REQUIRED`
- reset：`REQUIRED`
- rollback：`NOT_APPLICABLE`

## 四、待执行 AC（P0→P1）

- AC-TOOL-001（正向）：给定已知 raw output（含大 payload），验证 raw artifact 可复现；模型只见统一 projection（`completeness` + `source_ref` + `coverage`）。
- AC-TOOL-002（正向）：同一 attempt 中 tool result 同一时刻只有一次 projection 生成，不允许重复 budget controller 或 compiler-local 重构。
- AC-TOOL-003（负向）：当 policy 版本不匹配时，投影请求 fail-closed；不得 fallback 到未声明 default。
- AC-TOOL-004（负向）：tool output 被二次分页读取时，continuation 必须只允许回到原 source artifact，不能形成链式 A→B→C。
- AC-TOOL-005（正向）：`retry/resume/restart` 的 tool-result 回读路径基于 durable id 不变；不出现重复副作用。

## 五、Stage0 交付物（5.3当前）

1. `docs/architecture/memory-tool-output-module-stage0.md`（本文）
2. `context_v2_boundaries` 文档新增 TOOLS 一节的引用（交给后续合并）  
3. 任何后续实现前的 `impact` 前置清单（5.3 阶段在 Stage1 触发）

## 六、Stage1（下一步）

- 在 Unchain runtime 新增 `tools/output_management` 包：`ToolOutputPolicy/Projection/Budget/Manager`。
- 以 `ContextExecutionBundle` 附件方式注入 attempt-scoped manager（不新增 AgentModule）。
- 关闭 legacy `tool after batch` 二次预算在 V2 Active 分支。
- compiler 仅消费 manager 产出的 projection receipt，不再自行做本地 byte 变换。

所有项从 Stage1 开始才允许触发代码改动；当前阶段禁止更改模型输入行为和现有裁剪通路。
