---
name: case-001-cto-line-baseline
description: 2026-08-04 org-court 001 案实测的 CTO 线通信基线 — 单边边清单、零认领活跃面、已裁未落盘契约、架构师↔CTO 唯一双向边
metadata:
  type: project
---

org-court 001 案 (dev scope 细化 + 议会模式) 出庭取证的实测结果。**这是一份基线快照**,
charter 改动后须复测 (配方见 [[measurement-recipes]])。

## 单边边 (声明方 → 未承认方), 全部取自 `## 边界` 章节正文

- **智 (pupu-llm-expert) 被 5 份 dev charter 认作权威, 自己承认 0 条**: chat-bubble(内容呈现权)
  / settings(embedding 检索参数值) / toolkit(tool-schema 调用语义) / agents(recipe 节点语义)
  / backend(模型可见行为否决权)。智的 Boundaries 章节只点名 验/策/造/发/巡, 一个 dev 都没有。
  (案卷写「三条单边」是低估, 实测 5 条。)
- **config-extension 三对全零互认**: settings→toolkit 有 / toolkit→settings 无;
  agents→toolkit 有 / toolkit→agents 无; settings↔agents 双向皆无。三对六侧只有 2 侧写了。
- **验/造/策 (qa/ux/curator) charter 无边界章节, 正文点名 0 个同事**, 但三者都在别人的
  目录里写码 (qa 写 co-located `*.test.js`; ux 改组件 inline style; curator 改
  `src/SERVICEs/mcp_toolkit_registry.json`)。写入方与被写入方两侧都无条款。
- **唯一 charter 级双向边 = 架构师↔CTO**: architect「The split」章节 + CTO
  「Boundaries」第一条, 双方一致声明「技术方向 architect 终裁、CTO 负责交付」,
  且 architect charter 的 `## Sign-off` 明写交付后由它验收。动这条边前先看这里。

## 零认领但高活跃的面 (charter 全组织 grep 零命中, 90 天 commit 数)

`src/COMPONENTs/boot-overlay` 21 · `electron/main/ipc` 30 (含 register_handlers) ·
`src/locales` 48 · `src/COMPONENTs/ui-testing` 8 · `electron/main/window` 6。
`src/SERVICEs` 约百个文件里 charter 只点名 3 个 (toolkit 的三件)。
**但 de-facto owner 在 memory 里存在**: boot/ipc 知识在 pupu-dev-electron,
i18n workflow 在 pupu-dev-toolkit。所以这些缺口是「没写」不是「没人」。

## 已裁定但当事人无副本的契约 (第三方 memory 独家持有)

- **U1 安装态单写方** (2026-06-09 CEO 拍板): toolkit 是唯一写方, settings 两处 MCP UI
  纯只读。落在 `pupu-cto/` 7 个文件; toolkit 与 settings 的 charter 与 memory **各 0 份**。
- **registry.json 是前后端共享文件**: `src/SERVICEs/mcp_toolkit_registry.json` 被
  `unchain_runtime/server/mcp_registry.py` 读; 2026-06-14 curator 删条目打挂 9 个后端
  pytest。记录只在 `pupu-coo/registry-frontend-backend-shared-file.md`;
  curator 的 `catalog_source_of_truth.md` 列了后端文件但没写「你改这个文件会打挂后端测试」,
  backend 侧 0 份。**最可能触发它的人手里没有这条记录。**
- **toolkitId 共享 ID 空间**跨 6 个面; CTO 的契约里特意标注「agents/recipes 关键、易被忽略」
  —— 而 pupu-dev-agents 的 memory 里 `toolkitId` 零命中, 那句「易被忽略」自我实现了。
