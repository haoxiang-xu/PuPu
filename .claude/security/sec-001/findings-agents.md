# SEC-INVESTIGATION-001 — findings-agents (dev-agents 自查)

**区域**：`src/COMPONENTs/agents/`（characters / customize / recipes / flow_editor 使用 / recipe_graph / nodes / detail_panel / subagent_picker）
**主责边界**：③ 上下文装配 —— character 卡 / recipe 是"可保存、可分发的信任配置"，其内容进入模型上下文或决定可用工具集。
**调查性质**：只读，未改任何代码。初判定级，守统一复核。

---

## 清单 6 逐项

### 检查项 1 — character 卡内容作为 prompt 注入面

```
[M] [suspected] [boundary ③]
unchain_runtime/server/character_import_export.py:132-133 —— 导入 spec.json 经 CharacterSpec.coerce 落库，无语义校验；其 system prompt/描述字段后续装配进模型上下文
exploit 场景：攻击者制作一张 .character zip，spec.json 里的 prompt/persona 字段写入越权指令。受害者导入后每次与该 character 对话都重新注入这段 prompt —— 持久化间接 prompt 注入。
mitigation：导入确认弹窗展示 prompt 全文让用户审阅；spec 字段长度/结构上限在 Flask（守清单7）。我这面负责导入确认 UX 与 prompt 预览。红用例：导入含越权 persona 的卡 → 确认前可见 prompt 原文。
```

补充（清单外暗角，关键）：
```
[L] [verified] [boundary ③]
src/COMPONENTs/agents/pages/characters_page.js（全文）+ src/SERVICEs/bridges/unchain_bridge.js:444 —— importCharacter 能力端到端存在（api→bridge→IPC→Flask），但当前 agents 面无任何 UI 调用 api.unchain.importCharacter（grep 无命中），导入入口尚未接线
说明：休眠攻击面。反序列化/avatar/self_profile 三条注入链此刻不可经 UI 触达，本身降到 Low。一旦加上"导入 character"按钮，检查项 1/2/5 立即激活为 High。
mitigation：把"导入需走用户主动文件选择 + prompt 预览确认"列为加该按钮的前置硬要求，记进 agent memory。
```

### 检查项 2 — character 导入/导出反序列化

```
[L] [verified] [boundary ③]
unchain_runtime/server/character_import_export.py:89-98 (_validate_archive_entries) —— zip 解包有 zip-slip 防护（拒 ../、绝对路径、反斜杠、白名单 entry/prefix），已查到位
已查：此项无新增 finding。zip 路径遍历已被挡。
```

```
[M] [suspected] [boundary ③]
unchain_runtime/server/character_import_export.py:163-172 —— 导入的 self_profile.json 未经清洗 verbatim 存进长期记忆 profile store
exploit 场景：恶意卡的 self_profile 预置投毒"记忆"（伪造偏好/越权授权记录），导入后被当可信长期记忆召回，跨会话生效 —— 存储型记忆投毒。
mitigation：导入 self_profile 默认关闭或标 untrusted；与 llm-expert 协调召回时信任分层。落点在 Flask（守/llm-expert），我这面在导入 UX 暴露"是否一并导入其记忆"选项。
```

### 检查项 3 — recipe 图节点语义

```
[L] [verified] [boundary ③]
src/COMPONENTs/agents/pages/recipes_page/（nodes/*, detail_panel/*, inspectors/*, subagent_picker.js, agent_panel.js）—— 节点 name/prompt/description/subagent label/tool name 全部纯文本渲染；无 dangerouslySetInnerHTML / innerHTML / eval / new Function / 数据驱动 <a href> 或 window.open（grep + Explore 全量复核）
已查：recipe 节点渲染面无 HTML/链接/代码注入 sink。无 finding。
```

```
[L] [verified] [boundary ③]
src/COMPONENTs/agents/pages/recipes_page/chip_editor_parse.js / variable_scope.js —— {{#node.field#}} 模板变量经正则 tokenize，scope 由上游节点 + edges 约束，未做字符串求值
已查：模板变量无注入/越界取值通道。无 finding。
```

```
[L] [suspected] [boundary ③]
src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js:181 + detail_panel/toolpool_panel.js:92,103 —— ToolkitPool 节点默认 merge_with_user_selected:false（pool only），recipe 可预设固定工具池替换用户 chat-time 选择
exploit 场景：recipe 预装高权限 toolkit 池 + merge=false，运行时替换使用者默认选择。但这只决定"哪些工具可用"，不决定"是否需确认"——确认门控是服务端真相源（unchain_adapter，守清单7-6 / llm-expert）。故非确认绕过，仅工具可见性预设；且 recipe 当前仅本地保存/seeded、无外部导入入口 → 降 Low。
mitigation：未来 recipe 支持导入/分发时，运行前展示"此 workflow 预置了哪些工具池、是否替换你的选择"。当前作 note，确认 merge 不触碰确认门控。
```

### 检查项 4 — subagent_picker 工具池授权

```
[L] [verified] [boundary ③]
src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js:28-45 + detail_panel/subagent_pool_panel.js —— subagent 选取产出 {kind, recipe_name|name, disabled_tools:[]}；无 auto_approve / requires_confirmation / preauth 字段，仅引用 recipe 或 inline prompt
已查：subagent 选取不在编排层预批确认、不预设 auto-approve。确认门控未被此面静默放大。无 finding。
（真正 auto-approve 风险在 toolkit_auto_approve_store + 服务端门控，不在本面。）
```

### 检查项 5 — character 渲染 sink

```
[H] [verified] [boundary ③]
src/COMPONENTs/agents/pages/characters_page.js:17-22 (resolveAvatarSrc) —— character.avatar.url 直接 trim 返回、无 scheme 白名单，进入 <img src>（行 201 / 448 / 717）
exploit 场景：character（导入或后端下发）的 avatar.url 设为 ① 远程 http(s) → 渲染头像即对外发请求，泄漏"用户在线 + IP/时间"信标（exfil/SSRF-on-render）；② data: → 嵌任意图像/SVG（部分路径 SVG 带脚本语义）；③ file:// → 探测本地文件存在性。avatar.url 与 absolute_path 不同：absolute_path 在行 30 有 scheme 分支，url 分支（行 19-21）完全无过滤。
mitigation：resolveAvatarSrc 对 url 分支也做 scheme 白名单 —— 仅允许 app 本地后端 origin（http://127.0.0.1:<port>/characters/.../avatar，见 characters_page.test.js:225）+ 受控 file://；拒 data:/远程任意域/javascript:。验：注入远程 url 的 character → 头像不发外联请求。红用例：avatar.url="http://attacker.example/beacon.png" → 应被拒/回退 fallback initial。
注：当前 character 多来自本地 Flask（url 形如 127.0.0.1:port），真实可达性取决于"谁能写 avatar.url"。起步 High，守复核可结合"当前无导入 UI"酌情下调，但代码层缺过滤是事实。
```

```
[L] [verified] [boundary ③]
src/COMPONENTs/agents/pages/customize_page.js:14-26,59 —— 自建头像经 FileReader.readAsDataURL 本地生成 data: URL 渲染
已查：data URL 源是用户本机主动选择的文件，非跨边界 attacker 内容。无 finding（注意：此 data: 若被存进 spec 导出分发，会变成检查项5的 data: 输入 —— 与上条同一白名单收口）。
```

---

## 我学到的隐患

1. **character 卡 = 别人替你写好的 system prompt + 预置工具集**，威胁模型等同一条 MCP 商店条目。注入的持久化形态不在对话里、在"配置"里，每次使用重新生效，比单条消息更难察觉清除。

2. **avatar.url 是本面唯一真实渲染 sink，且两条来源分支防护不对称**：absolute_path 记得过滤 scheme，url 分支裸奔。`<img src>` 不是惰性数据，远程 URL = 渲染即外联信标，data:/SVG = 潜在脚本。

3. **"休眠攻击面"比"开着的洞"更易被忽略**：importCharacter 全链路就绪、只差一个按钮。今天 Low，接线那天瞬间 High，而那次提交易被当纯 UI 改动、不触发安全复核。能力存在 ≠ 风险为零，接线时机才是定级时机。

4. **边界划分要诚实**：merge_with_user_selected 看着像"权限预设"，实则只管工具可见性，确认门控真相源在服务端。把"工具可用"误当"工具已授权"会虚报严重度——跨边界安全控制必须 trace 到它真正的执行点。

---

## findings 数量统计（初判，守复核）

| severity | 数量 |
|----------|------|
| Critical | 0 |
| High     | 1 |
| Medium   | 2 |
| Low      | 5（4 条确认性"已查无 finding" + 1 条休眠面）|

**最重要的 1-2 条**：
1. **[H] characters_page.js:17-22 resolveAvatarSrc 的 url 分支无 scheme 白名单** → 内容可控的 avatar.url 经 <img src> 实现渲染即外联信标 / data:/file: 滥用。本面唯一"内容可达即触发"的代码层缺陷，应优先收口（与 absolute_path 分支共用一个白名单）。
2. **[M] character 导入是持久化 prompt 注入 + 记忆投毒载体**（import_export.py spec/self_profile 无信任分层）。本体在 Flask（守/llm-expert），但本面一旦接导入 UI 必须配套 prompt 预览 + "是否导入其记忆"确认 UX。
