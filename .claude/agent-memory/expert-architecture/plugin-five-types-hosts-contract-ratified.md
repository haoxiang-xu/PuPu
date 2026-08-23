---
name: plugin-five-types-hosts-contract-ratified
description: 2026-08-04 CEO 拍板定调会决议——plugin 类型学/hosts.* 信封/artifact 二分/mount 维度全部生效;我的裁决被采纳,默认存储改擎案 JSON
metadata:
  type: project
---

2026-08-04 CEO 拍板定调会决议("之后我们都按照这个走"),我会上立场基本全部采纳。canonical 全文在 CEO 会话 memory;spec 正式化在 `docs/superpowers/specs/2026-08-04-plugin-five-types-hosts-contract.md`(本地不入库)。我 charter 视角的生效约束:

**我的裁决生效:**
- **类型学**:plugin=分发单元非类型单元;manifest 拆 **payloads**(skill/toolkit/mcp)与 **capabilities**(artifact/mini app 表面声明)两个字段族,禁单一 type 枚举。协议层五类,用户面=能力徽章。
- **artifact 二分**:存在性=核心 `unchain.artifact.v1`(封闭枚举);呈现=`hosts.pupu`。PuPu 新 kind 走 hosts.pupu,**不扩核心枚举**。
- **信封契约**:manifest `[hosts.<id>]` + 事件侧 `RuntimeEvent.metadata.hosts.<id>`(擎的通道主张);三+一铁律(核心不读只透传/不认识即忽略/namespace 按 host 分/hint=advisory 忽略后仍可用);版本进 namespace 内部(v=1);透传配"丢弃即失败"golden fixture;**同 PR 删 PuPu 侧 toolkit.toml 第二解析器**。
- lightweight 定位正式作废;重能力走 optional extras。

**我被否/改的点:** 默认存储=JSON dev-scale 起步(擎案,port 后可逆);我的 SQLite 参考实现留待真实第三方需求触发,勿再主动推。

**他方红线成契约条款(我验收时要查):**
- 智:v1 artifact/mini app **模型不可见**;message array 无 hint(golden fixture 锁);混包 v1 自带按需暴露。
- 守:mini app=独立 sandboxed WebContentsView+per-plugin partition/手势开启/终端永不内容触发/按能力类逐项授权/Electron main SSE 中继单点收口/fail-closed。mini app UI 形态=右侧可折叠分栏。

**CEO 追加(hosts.* 首发试点):** tool 可在 attach panel 创建组件(plan tool 的 todo list/progress bar)。落法:契约加 **mount 维度**(`hosts.pupu={v,kind,mount:"attach-panel"|...}`,mount 枚举 PuPu 侧自由生长);**widget=live artifact**(稳定 artifact ID+revision 原地更新=持续 in-progress 态吃更新);纯声明式渲染走 artifact_kind_registry 模式无沙箱。attach panel 具体落位留 UX。

**单向门(不复议):** hosts 信封形状(键名/两面位置/铁律/namespace 内版本);payloads/capabilities 拆分+plugin 稳定 ID;artifact 二分+核心封闭枚举+artifact_id/revision 语义;生态层(registry/store/team)从第一天脱离 Apache 仓;公共 API=0.x 显式列表+一个 minor 弃用窗口。政策性(可 CEO 改):0.2.0 前不对外宣称第三方 backend。

**边界:** memory v2 迁移分支冻结,不吸收本定调;迁移加守则=不得消费/剥离 manifest 未知键(kwarg 静默丢弃教训 4a9fd9c)。hosts.*/默认存储均为迁移验收后独立增量。

**Why:** 这是跨仓契约的签约时刻,第三方写第一个 toolkit 起信封即不可改;记录被否点防止我复推 SQLite。
**How to apply:** 一切 hosts.*/plugin manifest/artifact 事件/mini app 设计评审与交付验收,以本决议为基线;试点验收先查 mount/live-artifact/模型不可见/透传 fixture 四件。关联 [[skill-expansion-fork2-decision]](content=模型真相不变量,与智的 message-array 红线同源)、[[generative-ui-contract]](ui_surface.v1 是相邻契约面)。
