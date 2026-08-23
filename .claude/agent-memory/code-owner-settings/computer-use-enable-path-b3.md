---
name: computer-use-enable-path-b3
description: 门B B3 交付的 computer-use 用户可写启用路径 — 独立 localStorage key、单一 facade 调用点不变量、boot resync 挂 App.js 的跨 lane 决策
metadata:
  type: project
---

# Computer Use 门B「用户可写启用路径」B3 切片(2026-07-18 交付)

分支 `feat/cu-gate-b-settings`,commit `89ead0f`(worktree,未 push)。设计权威在
[[settings-schema-cto-gated]] 之外的独立门,全文见 pupu-architect memory
`computer-use-gate-b-enable-path.md`。

**为什么这些决策非显而易见(future-me 判边界用):**

- **独立 localStorage key `computer_use_enabled`,CTO 明确批准不并入 `settings` 对象。**
  Why: settings 对象是 CTO-gated 共享动脉,启用态改它会触发全 surface 同步会;独立 key
  仿 `computer_use_consent_store` 同款防腐(shape 校验+版本门,损坏/缺 version/类型错/
  version mismatch → fail-closed OFF)。How to apply: 未来加 computer-use 相关持久态,继续
  用独立 key,别塞 settings。store = `src/SERVICEs/computer_use_enabled_store.js`。

- **`enable_controller.js` 是 renderer 层 `runtimeBridge.setComputerUseEnabled` 的唯一调用点,
  有 grep 型测试断言唯一性。** Why: 安全不变量 = enable=true 只有两个合法产生源(consent 后的
  toggle、重验 consent 后的 boot resync),两源都过 `pushEnabledToSidecar` 内部再验
  `hasValidComputerUseConsent()`(fail-closed,无 consent 绝不推 true)。How to apply: 任何新的
  computer-use 启用/停用入口都必须走 controller,别直接 import facade——否则 grep 测试红。

- **boot resync 挂在 `App.js`(组合根),不是 settings/。** Why: resync 必须每次 renderer 启动都跑
  (localStorage 存期望态、main 内存缓存冷启丢失),而 ComputerUseSettings 只在设置面板打开时挂载。
  headless `<ComputerUseBootSync/>` 与 ToastHost/BootOverlay 同列为全局 host。这是本切片唯一跨 lane
  触点,已向 CTO 报备(additive,低风险)。How to apply: 类似"必须 boot 时跑一次"的 settings 逻辑,
  headless host + App.js 挂载是既定 pattern。

- **facade 对 B2 打桩、graceful degrade:** `isComputerUseEnableAvailable()` 经 `hasBridgeMethod`
  探测 preload;B2 未落地时 toggle 隐藏、回退只读态。preload contract 测试用 required-subset(非
  精确相等)且未列 setComputerUseEnabled,所以本切片不依赖也不破坏 B2。

- **UI 显示态 = status 回读(server truth),localStorage 只是期望态;期望≠生效 → pending 提示,
  不假装成功。** switch 位置绑 `effectiveEnabled=Boolean(status.enabled)`。
