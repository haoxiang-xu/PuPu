---
name: computer-use-gate-b-enable-review
description: 2026-07-18 门B 启用路径合 dev 安审 GO（feat/computer-use-gate-b@1ebc99e）；八条不变量全过；.venv 符号链接需剔除；release 最终签仍待注入 eval
metadata:
  type: project
---

门B「用户可写启用路径」合 dev 安审（2026-07-18，对象 feat/computer-use-gate-b @ 1ebc99e = dev c4708fc + B1/B2/B3 + 1 LOW fix）。**裁决 = 合 dev GO（条件：剔除 .venv 符号链接）**。本次只签合 dev，不签面向用户的 release——最终签待注入 A/B eval（等 CEO API key）后复核。

八条不变量全部代码级验证通过：
1. enable=true 唯一产生源：`enable_controller.js` 是 renderer 侧唯一 call site，grep 型测试在 `enable_controller.test.js:127`（src/ 全量走查、排除 facade+tests、assert 唯一命中）。
2. funnel 门1 红线：`unchain_adapter.py:3405` `_computer_use_enabled()` 零参数、只读共享 flag 模块；options 里唯一相关键 `_recipe_subagent_run` 只做限制方向（F9 不挂载，:3407-3419）。
3. POST /computer-use/config 授权持平：blueprint 级 loopback before_request + `_is_authorized`（hmac.compare_digest）；token 只在 main 进程，IPC 返回体仅 {ok,enabled}，日志无 token。
4. 处处 fail-closed：override=None→env→unset=off；localStorage 损坏/缺版本/版本不匹配→OFF（严格 shape 校验+严格相等，双向覆盖）；consent 无效→零推送。
5. override 双向压过 env（用户 OFF 压 env ON，有测试）。
6. flag 收敛完整：只有 `computer_use_flag.py` 读 env；adapter/memory_factory 均薄委托；无第三副本（grep 证实）；sanitize-follows-flag 三测试证明截图脱敏与 tool 门同步。
7. 逐层严格校验：Flask 严格 bool 400；IPC handler 严格 boolean throw；service 严格 boolean；preload Boolean() 收紧（见 NOTE）。
8. consent 门：拒绝→零写零推（consent 先于 writeComputerUseEnabled）；boot 重同步推 true 前重验 `hasValidComputerUseConsent`；CONSENT_VERSION 严格相等升降级都 fail-closed；consent 只在显式 Agree 时 record（consent_modal settle）。

发现：SHOULD-FIX = commit 1ebc99e 误提交 `.venv` 符号链接（指向本机绝对路径），合 dev 前剔除。NOTE：preload 与 main 校验不对称（coerce vs strict，均可接受）；main crash-restart 重推不重验 consent（cache 仅同一 app run 内经 consent 门写入，app 重启即清零，可接受）；POST 瞬时失败后 desired 仍持久、下次 ready 静默收敛（panel pendingMismatch 有提示）。

残余接受风险不变：沦陷 renderer 可直呼 bridge 绕 consent UI——与 SEC-001 姿态一致，无新升级面。

release 最终签剩余前置：①注入 A/B eval + 守复核结果 ②确认 notices 产物含 pynput LGPL（合规项，见 [[computer-use-m2-assessment]]）。
