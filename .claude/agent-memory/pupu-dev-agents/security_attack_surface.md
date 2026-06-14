---
name: security-attack-surface
description: agents 面（character/recipe）的安全攻击面与边界③定级原则，来自 SEC-001 调查
metadata:
  type: project
---

agents 面是信任边界③（上下文装配）的持久化 prompt 注入面：character 卡和 recipe 是"可保存、可分发的信任配置"，威胁模型等同一条 MCP 商店条目。

**Why**：character 卡携带 system prompt + 预置工具集；导入一张卡 = 请进一段每次对话重新生效的指令 + 一组预选工具。注入藏在"配置"里而非对话里，比单条聊天消息更难察觉清除。

**How to apply**（改本面代码时的安全 checklist）：
1. **avatar.url 渲染 sink** — `characters_page.js` resolveAvatarSrc 的 `url` 分支历史上无 scheme 白名单（`absolute_path` 分支有，行30）。任何把 character/recipe 字段送进 `<img src>`/`url(...)`/`<a href>` 的改动，必须做 scheme 白名单：只放 app 本地后端 origin（http://127.0.0.1:<port>/...）+ 受控 file://，拒 data:/远程任意域/javascript:。远程 URL = 渲染即外联信标。
2. **importCharacter 是休眠攻击面** — 能力端到端就绪（api→bridge→IPC→Flask `character_import_export.py`），但当前无 UI 接线。加"导入 character"按钮时，是定级时机不是纯 UI 改动：必须配 (a) 用户主动文件选择，(b) 导入前 prompt 全文预览确认，(c) "是否一并导入其记忆(self_profile)"的显式选项。否则把信任决策从用户手里偷走。
3. **merge_with_user_selected 只管工具可见性，不管确认门控** — recipe ToolkitPool 节点默认 merge=false（pool-only）可替换用户选择，但确认门控真相源在服务端 unchain_adapter（守/llm-expert）。别把"工具可用"误当"工具已授权"而虚报/漏报。
4. **render 面已确认干净**：recipe 节点/panel/inspector 全纯文本渲染，无 dangerouslySetInnerHTML/eval/new Function/数据驱动 href；模板变量 `{{#node.field#}}` 经正则 tokenize、scope 受 edges 约束，无求值通道。改这些区域时别引入新 sink。

**边界归属**：spec/self_profile 反序列化校验、确认门控在 Flask（守/llm-expert）；我这面负责导入/运行的确认 UX 与渲染 sink 收口。相关见 [[adjacent-dev-boundaries]]。findings 全文：`.claude/security/sec-001/findings-agents.md`。
