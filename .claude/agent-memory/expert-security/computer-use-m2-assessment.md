---
name: computer-use-m2-assessment
description: Computer Use M2 发布门安审裁决（2026-07-13）——两门分离：flag-off 合 dev 放行；flag 对用户开放前 1 Critical(无动作确认) 必办
metadata:
  type: project
---

Computer Use M2 代码级安审（2026-07-13，守为 M2 发布门裁决位）。审查对象 `feat/computer-control` HEAD e236966（基线 dev@1d43c44）；unchain 侧 S0/S1 已双签合 dev@52854bd。

**两门分离裁决：**
- **门A（flag 默认关合入 PuPu dev）= 放行 GO。** 现状零暴露已验证：`PUPU_COMPUTER_USE` 全仓无 setter（只 read at unchain_adapter.py:2961 + route_computer_use.py），C3 面板无启用开关（只读状态+权限深链），构造对显示零副作用（无 grab），模型 gating 只对 Anthropic computer_20251124-capable 模型挂载，flag 关时 `_build_builtin_toolkit` 返回 None → 不入任何 catalog。用户路径够不到。
- **门B（flag 对用户开放）= 阻断 BLOCK，直到 F1 落地。** 这才是真正的发布门。

**F1 [CRITICAL, 门B必办]：computer 工具无动作确认。** `ComputerToolkit` 用 `Tool.from_callable(...)`（toolkit.py:176）未设 `requires_confirmation`，unchain 默认 False（tool.py:33）。运行时 `confirmation.py:112` `requires_confirmation = bool(tool_obj.requires_confirmation)`，且 policy 是 AND（:114）只能收窄不能强开。→ 每个 click/type/key 组合零用户门执行。这正是 SEC-001 系统性根因#3（确认自声明默认关，见 [[flask-sidecar-posture]] F-FLASK-01）在最高价值 sink（真实键鼠注入）上的实例。修复契约：注入类动作服务端强制 requires_confirmation=True（screenshot 只读可豁免），朝会话级授权+撤销面演进。

**F2 [HIGH, 门B]：截图 prompt injection 无缓解。** 屏幕内容（网页/文件/他人消息）里的指令→模型执行，是新注入面。缓解=F1 确认门（主）+ system prompt 强化 + 用户知情。与 F1 绑定。

**F3 [MEDIUM, 门B]：base64 截图落盘 JsonFileSessionStore。** fail-closed 红线对 SSE 帧/客户端 SQLite 历史/memory 提取（`_content_to_text` → `[image]` 占位，manager.py:563）三处均验证有效。但 redaction 只作用于 emit 事件（deepcopy），**不碰模型 transcript**；PuPu 用 `JsonFileSessionStore`（memory_factory.py:144）把含 content_blocks image(data_b64) 的 transcript 明文 JSON 落盘（会话/checkpoint 持久化），超出 tool_media_store 的 30min TTL。第四持久面，非红线覆盖。整机截图（密码/私信可见）明文长存本地盘。

**放行/清白项：**
- C4 媒体端点鉴权（loopback+全局token+uuid4 122bit capability+hex正则防穿越）v1 够用。resolve_media 无 session_id 时跨全 session glob，但 auth+不可猜 id 兜住。**INFO**。
- C3 IPC 桥干净：两通道均 invoke 且入 allowlist；deep-link 主进程侧 frozen 白名单（service.js `COMPUTER_USE_PRIVACY_DEEP_LINKS`），renderer 只能传 key（screen_recording/accessibility 硬编码于面板:364/381），传不了 URL。SEC-001 正面样板同款。**PASS**。
- redaction 覆盖两条 emit 路径（on_event:5424 + step_emit:5041）且在 early-return 前跑，session_id 已透传。SSE 面完整。

**F6 [LOW, 合规]：pynput LGPL-3.0 + PyInstaller --onefile。** requirements.txt 动态依赖未 vendor；sidecar onefile 冻结（build_unchain_server.sh:245）。notices:check 跑 pip-licenses 覆盖 python 包会枚举 pynput。纯 Python LGPL 动态导入风险低；建议确认 notices 产物含 pynput LGPL 文本+源码指引/书面 offer（onefile 不透明，LGPL§4/§6 替换权）。非安全漏洞，许可卫生。

**SEC-001 重评触发（本次动 IPC+Flask 路由+工具执行面）：** F-FLASK-01（确认自声明）风险等级因 computer use 升级——sink 从"MCP 工具"变成"真实键鼠控制整机"，同一个默认关的确认门现在能被注入劫持去点授权弹窗/操密码管理器。这是接受旧 finding 的升级理由，写入门B必办。macOS TCC 挡合成输入点 consent UI 本身（模型无法自授权 Accessibility），但一旦授予范围极广——TCC 是一次性栅栏非持续控制，确认门才是主缓解（待 M2 in-app 实测证实）。

**门B 必办清单（优先级）：** ①F1 注入类动作强制确认（P0，硬门）②F9 subagent 路径 computer 不挂载（P0，硬门）③F2 system prompt 注入告警+用户知情同意 ④F3 transcript 落盘 image 剥离或加密+短 TTL ⑤confirm notices 含 pynput（合规）。会话级授权+撤销面是终态方向，门B 最小门=逐动作确认。

**F1 修复已验收（d664c7a，2026-07-14 抽查通过）：** base requires_confirmation=True + confirmation_resolver 只读白名单（screenshot/wait/cursor_position 豁免）。fail-closed 三边缘全部对 unchain runtime 亲验：resolver raise→error outcome 不 dispatch（confirmation.py:99-108）；返回 None→from_raw(None)→cls() 默认 requires_confirmation=True（models.py:207/244）；未知动作→不在白名单→confirm。AND 收窄语义（:112-114）保证 resolver 只能豁免不能强开。动作分类无安全侧异议（move 保留 CONFIRM 同意、type 80字符预览不得持久化，智已裁）。红用例走真实 execute_confirmable_tool_call。

**F9 [HIGH, 并入门B P0]：recipe-subagent 运行 confirmable 工具结构性无门（F1 完整性缺口）。** adapter.py:5099 `_recipe_subagent_run` 分支置 confirm_cb=None；unchain confirmation.py:116 `callable(on_tool_confirm)` 为 False→整个确认块跳过、工具直执行。pre-existing 架构，影响**所有** confirmable 工具（SEC-001 根因#3 家族："有确认位但无确认通道=静默放行"）。裁决=组合：**②PuPu 侧 subagent 工具表不挂 computer**（门B P0 硬门，智支持；正确姿势="不出现在工具表"而非"挂了再拒"）**+ ①unchain 核心 fail-closed**（requires_confirmation=True 且 on_tool_confirm 不可调用→DENY 而非跳过），①升智+CTO 双签切片、非门B blocker 但根治整类（含 workspace/terminal/MCP destructive 工具），建议随 SEC-001 根因#3 整改一并落。
