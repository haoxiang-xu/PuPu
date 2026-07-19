---
name: computer-use-gate-b-enable-path
description: 2026-07-18 门B 用户可写启用路径定案 — 渲染层 localStorage 为期望态权威, 交付走 IPC→main→POST /computer-use/config 运行时覆盖, 不重启 sidecar; 否决 per-request payload flag(方案c)是安全模型红线
metadata:
  type: project
---

# 门B「用户可写启用路径」定案(2026-07-18)

选定:**混合 b+a 兜底**。renderer localStorage(独立 key `computer_use_enabled`,仿 consent store 模式,不进 CTO-gated settings 对象)持久化期望态;交付 = bridge IPC → electron main → 授权 POST `/computer-use/config`(loopback+token) → sidecar 进程内 runtime override;`_computer_use_enabled()` 语义改为 **override 已设则 override 优先,否则 env**(env 降级为 dev 默认值,用户 OFF 压过 env ON)。main 缓存最后期望态,在 `waitForMisoReady` 成功后重推(覆盖 crash-restart),并在 respawn env 里补 `PUPU_COMPUTER_USE`(belt-and-braces)。**全链 fail-closed**:sidecar 重启后 override 清零=off,直到重推。

- 否决 (a)纯重启:toggle 杀在途流,UX 重;否决 (c)per-request payload:把 server 侧权威 flag 降为 client 断言,与三条件 funnel 的防御分层(防 prompt-injection/渲染层以下)冲突——**红线:funnel 门1 永不读 request options 里的任何 flag 字段**。
- 关键取证:`memory_factory.py:114` 有 `_computer_use_enabled` **私有副本**(躲 import cycle),且 `sanitize_enabled` 在 session store 每次构造时捕获(构造是 per-request 的)。运行时化必须建共享叶模块 `computer_use_flag.py`,adapter/memory_factory/route 三处收敛到它,否则截图脱敏会与 flag 脱钩。
- 残余风险(已声明接受,与 SEC-001 姿态一致):渲染进程完全沦陷可绕 consent 直推 enable——但该威胁级别本就能自动批 F1 确认,无新增升级面。
- 可逆性:全部 reversible(端点/新 key/override 语义均可加可撤)。
- 交付切片:B1 backend(computer_use_flag.py+POST 端点)→ B2 electron(IPC channel+重推钩子)→ B3 settings(store+toggle+consent 门+boot 重同步,boot 推 true 前必须重验 hasValidComputerUseConsent)。CTO 过目点:新 IPC channel、新 localStorage key。
- 本次按 CEO 豁免未走 codex 管线,推理在 Fable 5 完成(见 [[computer-use-hybrid-design]])。
