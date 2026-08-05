---
name: plugin-5class-model-visibility-contract
description: 2026-08-04 定调会决议中我持有的模型可见面契约:artifact/mini app 模型不可见、message array 无 host hint(golden fixture)、按需暴露 v1 必备
metadata:
  type: project
---

2026-08-04 CEO 拍板五类 plugin(skill/toolkit/mcp/artifact/mini app)定调,我的三条拍板项全部通过成为契约条款。canonical 全录在 CEO 会话 memory;此处只记我的生效红线与 veto 范围。

**我的三条生效红线(均为契约条款,非建议):**

1. **artifact / mini app v1 对模型不可见**——纯 host 呈现,模型无对应工具。未来若引入模型主动开 surface,上限=**一个泛型工具**(enum 目标,如 open_surface),永不 per-app 工具;该泛型工具的 schema 进入我的 veto 范围。
2. **模型可见 message array 必须可证明无 host hint**——host hint 通道定为事件侧 `RuntimeEvent.metadata.hosts.<id>`(擎案),明确不进 prompt/tool result 文本。golden fixture 强制:有/无 hint 字节等价,我持 fixture(机制同 [[context-memory-v2-durability-core-approval]] 的等价性审查)。
3. **按需暴露 = 混包 plugin v1 必备**——安装 ≠ 进 tool schema;会话级启用 + skill.tools 做激活门(复用 skill_rows 已有的 tools 字段,禁止第二套 scoping)。

**Veto 范围扩展:** 泛型 open_surface 类工具(如落地) + plan tool 等带 widget 的 toolkit 的 tool schema。CEO 追加的 attach panel widget 条款:模型侧只是普通 toolkit 调用(schema 归我审),widget 渲染纯 host 侧声明式,widget=live artifact(稳定 ID+revision 原地更新)——与不可见原则兼容,模型看不到 widget 存在。

**已确认不重开:** skill schema 对齐 MCP prompts 单向门。host 声明绝不进 skill body/核心字段——往 prompt 文本塞 host 语义 = 改模型可见面 = 破门。

**Why:** tool result 文本被模型当高权威内容,hint 混入 = 烧 token + 注入近亲 + 跨 provider 序列化不可控;per-app 工具会引爆 tool 空间。
**How to apply:** 审任何 plugin/toolkit/事件契约改动时,先查这三条;发现 host 语义流向 message array 或 per-app 工具提案,直接 veto 并引用本条款(2026-08-04 CEO 拍板)。
