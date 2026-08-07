---
name: unchain-externalization-charter
description: 2026-08-04 CEO 拍板的 unchain 对外化定调（默认存储/API 承诺/排期/hosts.* 通道），我(擎)受约束的条款与并行项实施前置
metadata:
  type: project
---

2026-08-04 CEO 拍板定调会决议（"之后我们都按照这个走"），canonical 全录在 CEO 会话 memory。unchain 从 lightweight 库转"开箱即用 agent builder"，第三方可拿它做 backend；PuPu plugin 分五类（skill/toolkit/mcp/artifact/mini app），定义在 PuPu 侧。我的三个拍板项全按我的主张通过。

**对我有约束力的条款：**
1. **默认存储 = JSON 文件 repository**，显式标注 single-process / dev-scale / 不承诺并发与迁移。SQLite 参考实现留待真实第三方需求触发（port 后可逆）。我只背一套生产级存储（PuPu schema-v4）。
2. **公共 API 承诺 = 0.x 显式列表**：Agent、events v4 dict schema、toolkit manifest schema、repository ports，四项之外一律 internal 可改；变更给一个 minor 弃用窗口。**manifest 立即加 `schema_version` 字段**（events 已有，manifest 缺）。
3. **排期 = 先迁移后扩展**。memory v2 core migration 分支只做行为保真，任何"开箱即用"新增量不得进该分支。
4. **host 扩展通道**：事件侧走 `RuntimeEvent.metadata.hosts.<id>`，**不碰 surface / event type 封闭枚举**；PuPu 概念（artifact 新 kind、mini app）不扩 unchain 核心枚举，走 `hosts.pupu`。所有透传配"丢弃即失败"端到端测试（见 [[unchain-drop-silently-whitelists]]）。
5. **hosts.* 契约首发试点 = attach panel widget**（plan tool 的 todo list / progress bar）：mount 维度进 `hosts.pupu`，形状 `{v, kind, mount}`；widget = live artifact（稳定 ID + revision 原地更新）。
6. 跨部门红线成契约条款：智（v1 模型不可见 / 无 hint fixture / 按需暴露）、守（sandbox / 手势 / 逐项授权 / Electron main 收口）。
7. lightweight 定位作废；生态层脱 Apache 仓；**0.2.0 前不对外宣称生效**。

**Why:** CEO 要 PuPu 内部实现变薄、领域逻辑下沉 unchain，同时让 unchain 独立可用以打开第三方接入（分发动机）。我坚持 JSON 默认存储与窄 API 承诺，是为了不让"开箱即用"变成我长期维护两套生产级存储 + 无边界对外承诺。

**我的唯二并行项（已授权，未开工）：**
- manifest `hosts.*` 真透传 + **同 PR 删掉 PuPu 侧第二个 toolkit.toml 解析器**（见 [[pupu-duplicate-toolkit-toml-parser]]）；
- manifest `schema_version` 字段。

**实施前置（收到开工通知前不动代码）：** ① 等 CEO 的 P0 baseline commit 落地；② 与 codex 正在进行的 memory v2 迁移切片错开——两仓并发进程冲突风险，dispatch 前必查 `git branch --show-current`。

**How to apply:** 任何 unchain / server 改动先对照本条款；越过 4 项 API 列表或扩核心枚举 = 需智 + CTO 双签。相关：[[feedback-commit-policy]]。
