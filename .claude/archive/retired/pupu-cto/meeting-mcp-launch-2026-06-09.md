---
name: meeting-mcp-launch-2026-06-09
description: MCP 上线前影响面同步会纪要（2026-06-09，11 人）——8 个同步点责任矩阵、未决项 owner、催出 ADR adr-toolkitid-stability；U1 安装态归属已裁定（归 toolkit 主面），IPC 契约解冻可冻结
metadata:
  type: project
---

# 会议纪要：MCP 上线 · 上线前影响面同步会（2026-06-09）

CTO 主持。产出 ADR [[adr-toolkitid-stability]]。相关：[[contract-toolkit-catalog-shared-id-space]]、[[dev-team-roster-plan]]、[[dev-team-and-prelaunch-review]]。

**参会确认（11）**：dev-toolkit、dev-electron、curator、llm-expert、dev-chat-core、dev-chat-bubble、dev-settings、qa-tester、ux-designer、dev-agents（列席）、product-ops（按需）。全员发言完毕。

## 同步点责任矩阵（结论 / 谁改·谁验 / 可逆 vs 单向门）

1. **Catalog 写 owner 唯一性**：dev-toolkit 是 catalog 唯一写 owner；settings 两处、registry 导入均为消费者，不双写元数据。改=dev-toolkit；验=qa-tester+dev-settings。可逆。
2. **toolkitId 稳定性与签发**：见 ADR——全局稳定·发布即冻结·永不复用·`mcp.<server>.<slug>`·curator 统一签发。改=curator(+CTO 双签)；验=qa-tester(迁移回归)。**单向门**。
3. **tool_name 限定名**：`{server}__{tool}`，server 段绑 toolkitId；curator 保证全局唯一自解释；重命名走别名映射。改=curator；验=llm-expert+qa-tester。**单向门**（命名规则）。
4. **IPC 通道契约**：~25 条 UNCHAIN.*MCP*（OAuth×7/registry×8/approve×2）先落 channels.js 常量再走 bridge、禁裸字符串；channels 常量 + .js/.cjs 双测同提交对齐（dev-electron 守）。改=dev-electron；验=qa-tester+product-ops(一致性用例)。可逆但须冻结后下游消费。
5. **OAuth 时序与安全**：回调校验 state、绑定发起窗口、token 只走主进程不过 renderer；approve 带请求 id 防重放、超时即拒；模型须优雅处理 denial 不死循环、失败回结构化错误；UI 走 auth_required 独立态/Modal 变体不复用确认卡。改=dev-electron+llm-expert+ux-designer；验=qa-tester(契约 mock，真授权人工)。可逆。
6. **选中工具持久化与悬空降级**：chat_storage 以 toolkitId 数组会话级持久化，卸载按 catalog 交集过滤、悬空静默剔除不删存储、重装恢复；recipe toolkit_pool 持久化 toolkitId+enabled_tools[] 无快照、悬空保留引用+节点标红；UI inline 标「工具已卸载」/custom_mcp 待迁移态。改=dev-chat-core+dev-agents+ux-designer；验=qa-tester。可逆（运行期降级）。
7. **确认/trace 帧主键**：稳定带 tool_call_id（trace 唯一键）/tool_name/toolkitId/args 摘要/risk·needsOAuth；渲染主键必须 tool_call_id，tool_name 仅展示。改=dev-chat-bubble+dev-electron(帧形状);验=qa-tester。可逆。
8. **放行门（product-ops）**：PuPu react-scripts test + unchain pytest 全绿、两仓 build 干净、IPC .js/.cjs 一致性用例过、toolkitId 迁移有正反向用例。可标 needs manual verification 不阻塞=单个外部 OAuth 实连/真实第三方可达/真授权弹窗。迁移项无幂等+回滚+staging 演练则 No-Go，其余可分批放行。

## 未决项（owner + 截止节奏）

- **U1 安装态渲染归属（settings ↔ toolkit）**：**已裁定（2026-06-09 CEO 批：归 toolkit 主面）。** CTO 据此固化为契约 [[contract-install-state-owner]]——`pupu-dev-toolkit` 是 MCP 安装态（安装/卸载/启停的 catalog + 本地落盘）的唯一 owner 与唯一写方；settings 两处 MCP UI（mcp_toolkits_section 已装管理 / mcp_registries_modal registry 导入）一律只读消费者，只存 toolkitId 引用 + 用户开关，绝不写安装态、绝不双写同一 localStorage 数据；registry 导入产物经 curator schema 校验后由 toolkit 主面入 catalog。**此裁定解除 IPC 冻结的*安装态写权归属*前置阻塞——同步点 1（catalog 写 owner 唯一性）与 4（IPC 通道契约）的安装态写权归属已无歧义。**（注：2026-06-09 U3 recon 后新增了另一条独立的冻结前置阻塞——parity 测试清单缺口，见 U3 与 [[freeze-gate-ipc-parity-manifests]]；IPC 契约须待该 freeze gate 关闭且 parity 测试真覆盖 24 条后方可冻结。）
- **U2 单次工具注入上限数值**：**已决（2026-06-09 CEO 批：暂不设上限，deferred 待后续重评）。** 本 release 不对单次注入工具数设限。
  - **已知接受风险（accepted risk）**：llm-expert 的风险提示保留——MCP 工具过多会占用上下文、稀释 tool-selection 准确率。本 release 明确接受此风险、不设限；不靠拍脑袋定阈值，待上线后由 llm-expert 用真实 eval/数据判断是否需要上限及具体阈值，届时重评。
  - **触发重评的条件（任一即触发）**：(a) tool-selection 准确率出现可观测下降（llm-expert eval）；(b) 出现上下文超限/截断报错；(c) growth-ops 回灌到相关用户抱怨（工具太多选错/响应变差）。
  - **重评 owner**：llm-expert（CTO 协同）；届时若决定设限，阈值由 llm-expert 提案、curator 落 catalog 约束。
- **U3 channels.js 准确通道清单 + parity 测试缺口**：**recon 完成（2026-06-09，dev-electron 落盘 [[mcp-ipc-channel-inventory]]）**——MCP 专属 IPC 通道**准确 24 条**（非 ~25；差值是通用通道 GET_TOOLKIT_DETAIL 不计入）。两端常量对齐 ✅、无裸字符串 ✅、.js/.cjs 测试孪生同步 ✅、全 24 条运行时 `ipcMain.handle` 已注册 ✅。**但发现缺口并升格为冻结前置阻塞任务（见 [[freeze-gate-ipc-parity-manifests]]）**：`register_handlers.js` 的 `IPC_HANDLE_CHANNELS` 与 `preload/channels.js` 的 `PRELOAD_INVOKE_CHANNELS` 两个**测试用静态清单数组**漏列 9 条 MCP 通道（LIST_MCP_STORE_ENTRIES + LIST/IMPORT/VALIDATE/REFRESH/DELETE_MCP_STORE_REGISTRY + APPROVE/REVOKE_MCP_STORE_ENTRY_APPROVAL）——这两数组唯一消费者是 `ipc_channels.test.cjs`，非运行时白名单，故运行时正常但 parity 测试对这 9 条零覆盖＝假绿灯。CTO 裁定：补齐这 9 条＋（顺带）发送侧 STREAM_START_V4 进 `PRELOAD_SEND_CHANNELS`、令 parity 测试真覆盖全 24 条，列为 **IPC 契约冻结前置阻塞（freeze gate）**；未完成且测试转真绿前 IPC 契约不予冻结。**改=pupu-dev-electron（CTO impact 复核下改公共动脉）；验=pupu-qa-tester（断言 parity 现覆盖 24 条 + .js/.cjs 同步 + STREAM_START_V4 在发送侧被断言）。可逆（纯测试面，唯一消费者是该 parity 测试，无生产路由读取这三数组）。**
- **U4 QA 桩供给**：各 dev 提供可注入 mock provider / 稳定 fixture（registry schema fixture 归 curator）/ 可短路 OAuth 回调桩。owner=各 dev，qa-tester 汇总。截止：端到端主链路测试前。

## 主链路（qa-tester 必测）

安装→catalog→chat 选工具→调用→approve→trace（Test API 端到端）+ toolkitId 跨面一致性断言 + **24 条 MCP 通道两端常量对齐 + parity 测试真覆盖全 24 条（freeze gate，见 [[freeze-gate-ipc-parity-manifests]]）** + 全部 .js/.cjs 对同步 + 迁移正反向回归。
