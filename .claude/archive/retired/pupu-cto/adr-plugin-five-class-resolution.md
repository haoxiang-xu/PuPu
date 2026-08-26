---
name: adr-plugin-five-class-resolution
description: 2026-08-04 CEO 拍板五类 plugin/unchain 重定位决议 — CTO 排期裁决与 IPC 红线生效条款、单向门清单
metadata:
  type: project
---

# 决议：五类 plugin + unchain 重定位（CEO 拍板 2026-08-04，"之后都按这个走"）

Canonical 全录在 CEO 会话 memory；此处只记对 CTO 有约束力的条款。

## 我的裁决已生效（交付排期）
- **now（0.1.10 窗口）**：纯 spec 零 dev 占用（manifest v2 五类枚举 + `[hosts.*]` 透传 + artifact ID 契约），architect 起草中。
- **next（0.1.11）**：plugins UI 五类改造，**必须先于 builder 开工**（builder 产出物=plugin，契约先行）。
- **later（0.2.0 后）**：artifact 运行时、mini app 窗口；mini app 单独立项过守。

## 我的 IPC 红线已生效
五类 ≠ 五套 channel。收敛为**单一 plugins catalog 通道面**，分类做数据字段不做通道维度。现状 `electron/shared/channels.js` 仍是 `unchain:get-toolkit-catalog` 一族——将来收敛时按此执行，防 channels.js 膨胀。见 [[contract-toolkit-catalog-shared-id-space]]。

## artifact 稳定 ID 契约（单向门，已冻结进 spec）
我标的单向门成立；CEO 追加新用例：attach panel widget（plan tool 的 todo list/progress bar）——**ID 不只用于 trace chain 引用，还用于 revision 原地更新（live artifact）**。契约设计必须支持同 ID 多 revision。finality 契约（[[adr-trace-chain-155-66-dispatch]]）的延伸。

## 三分歧落定
- 默认存储 = JSON dev-scale 起步（unchain "开箱即用"默认 repository）。
- 协议层五类 / 用户面能力徽章（7-17 store-final 不推翻）。
- mini app = 右侧可折叠分栏（非独立窗口）。

## 他方红线已成契约条款（delivery 时须守）
- 智：v1 模型不可见 / 无 hint golden fixture / 按需暴露 v1 必备。
- 守：sandbox 规格 / 手势 / 逐项授权 / Electron main 收口。

## 单向门（生效）
1. 作废 lightweight 定位（unchain=开箱即用 agent builder，核心仍零 SQL 零 host 依赖）。
2. 生态层脱 Apache 仓。
3. 0.2.0 前不对外宣称。
4. 公共 API 0.x 显式列表 + 一个 minor 弃用窗口。

## 悬置项（盯）
- **memory v2 P0 baseline commit 仍是 CEO 待办**——迁移与一切新方向的前置（[[adr-phase4-gate5-secret-injection]] 无关，风险见 CEO memory 单点风险条）。任何相关合并/清理前先确认已 commit。
- dev 人力第一优先 = 自动更新管道修复（COO R1），五类实现不得与之抢人。

**How to apply:** 派活/排期以此为准；plugins 相关 spec review 时核对 host block 带 schema version、能力声明不含 UI 指令；0.1.11 开工顺序 UI 改造→builder 不可倒置。
