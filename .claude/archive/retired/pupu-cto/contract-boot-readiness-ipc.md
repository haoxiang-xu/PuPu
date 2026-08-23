---
name: contract-boot-readiness-ipc
description: BOOT IPC namespace 最终契约(2026-08-04 终审 SIGN-OFF)+ restartMiso 原语教训 + 遗留触发器
metadata:
  type: project
---

2026-08-04 boot readiness gate 两轮评审完毕,终裁 SIGN-OFF。最终契约形状:

**IPC 契约(冻结)**:`CHANNELS.BOOT` 独立 namespace(不挂 unchainAPI —— unchain bridge 是超大高爆面,boot 聚合多子系统,单独小面可审计);`boot:get-readiness`(invoke)/`boot:readiness-changed`(push-only)/`boot:retry`(invoke, arity-0,handler 丢弃 renderer 入参,parity 测试锁死)。**载荷只送 `failure.code` 不送 message** —— main 不知道用户语言,任何 main 侧文案=硬编码英语绕过 11 locale;渲染层 code → `t("boot.failure.<code>")`,未知 code 落 `boot.failure.unknown` 兜底。`FAILURE_CODES` 从 boot service 导出;`reason`/port/pid/url 永不过线。

**restartMiso 教训(承重)**:跨 service 组合 `stopMiso(); startMiso()` 是**确定性**坏序列 —— stopMiso 同步返回(SIGTERM 在飞、unchainProcess 未清),startMiso 守卫在同一 microtask 链内必然早退,exit handler 见 unchainIsStopping 跳过 restart 网 → 活后端被杀且永不回来。**谁拥有进程谁拥有 restart**:`restartMiso()` 在 unchain service 闭包内(stop → 50ms 轮询 unchainProcess 清空,5000ms 有界,盖过 1200ms SIGTERM→SIGKILL → start)。unchain_service.test.cjs 有一条"naive 序列是坏的"文档测试钉住此语义:若它翻了,说明 startMiso 守卫或 exit handler 变了,restartMiso 的等待要复查。boot 侧 `retry()` 双守卫:`stopped`(will-quit 后不产孤儿 sidecar)+ 全 ready 早退(不 bounce 健康后端);MCP-only failure 仍放行 retry(bounce 的是 sidecar,收敛安全)。

**渲染 gate 最终语义**:`ready` = chatFirstScreen AND backend 两 gate 之 AND;**任何时钟不开 backend gate**(boot_progress.test.js "no clock can open the backend gate" / "slow theme resolve" 回归钉死)。8s failsafe 锚点 = `reactHasRendered()`(#root childElementCount>0),只有 bundle 完全没执行才 legacy release —— 因为 BootOverlay 在 ConfigContainer isThemeBooting 分支下,theme async 化(settings→SQLite)后 takenOver 判定会误伤。`release()` 不 claim backend gate(released 标志短路 reconcileGates,getGates 保持诚实)。`/mini` backendless 放行:hash 在 start() 读一次(overlay 关闸期间无导航面)。overlay 是 modal barrier 非图片:window capture 吞 Escape(BUILTIN Modal 绑 window bubble,capture 是唯一先手位)+ focusin 收焦(Modal portal 到 body,sibling inert 够不着);两监听器 `dismissed||exiting` 即卸。

**遗留触发器(非阻塞)**:
1. boot_locale_parity.test.js 的 FAILURE_KEYS 是手抄清单,未机械 require main 端 FAILURE_CODES —— main 新增 code 时只会静默落 unknown 兜底;下次动 FAILURE_CODES 时顺手接线。
2. theme async 化落地时,ConfigContainer 必须给 theme 解析自己的呈现/预算 —— failsafe 已不再兜底">8s theme 挂起"(那会是静态 overlay 无解释的黑屏等待)。
3. 400ms 轮询 getMisoStatusPayload 是过渡债:出现第二个轮询消费者时必须给 unchain service 加 change event,禁止复制轮询。
4. unchain/service.js 未提交 diff 中混有 Memory V2 hunks(MEMORY_V2_DIRTY_ACTIVE_DEV_ENV)—— boot 批 commit 时必须切片,禁 git add -A。
