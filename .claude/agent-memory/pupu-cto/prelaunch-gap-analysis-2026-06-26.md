---
name: prelaunch-gap-analysis-2026-06-26
description: 2026-06-26 CEO 上线门槛盘点；四条差异化线全零代码、shipped 产品=扎实通用客户端；MVP-proud 定义 + 首发前 4 件事
metadata:
  type: project
---

2026-06-26 CEO 要求做"敢骄傲首发(HN/Reddit/小红书)"的诚实差距分析。PuPu 处 pre-PMF(~34 star，真实下载≈0)，CEO 排序：产品扎实 → 深度测试 → 设计 → 发布。

**核心判断（证据级，非印象）：**
- 四条护城河差异化线在代码里**几乎全零**：`always_on`/`flow_event`、`ui_surface`/`ui_component_registry`/`ui_edit_event`、`team_comm` 全仓 grep 0 命中。它们只活在 `docs/future-development/{always-on-agents,ultra-apps-generative-ui}.md`（两份均自标"愿景/讨论稿，非承诺，不含代码"）。
- **shipped 的 PuPu = 做得扎实的通用 AI 客户端**：聊天主链路✅、记忆RAG✅(已进prompt,质量未验)、characters✅、toolkit/MCP✅、recipe/subagent **后端真执行**✅(`unchain_adapter.py:3522 _stream_recipe_graph_events`/`3564 _materialize_recipe_subagents`)。Gemini 文档宣称支持但 settings UI **实际缺失**。
- **差异化主路径在第1步就断**：它整体还没建出来。唯一有真血管、能在90天内变"可炫耀"的两块=**记忆** + **recipe/subagent builder**。
- **生产打包用 PyInstaller --onefile 冻结二进制**(`service.js:330-367` app.isPackaged 分支)→ **用户无需装 Python**。"用户缺 Python 3.12"是 dev 模式误判，别拿它吓 CEO。真风险=冻结二进制 Win/Linux 从没真机验过。

**Why:** CEO 怕同质化成"又一个 Cherry Studio"；要求补功能只补在护城河线、别补通用功能。但护城河全是 vision，shipped 产品又有首发级稳定性洞。

**How to apply（首发前我选的4件事，其余=以后再说）：**
1. 首启动 onboarding + Gemini 补/删（低，地基，可逆）
2. 流重连/retry + Win/Linux 冻结二进制真机验（中，地基；G3 不可见，Mac 上发现不了）
3. **「记忆即在场感」做成可炫耀差异化锚点**（中，差异化）——四条护城河里唯一已有血管(RAG进prompt)+已有UI(memory-inspect)+最贴北极星"正确时间正确帮助"，且不踩单向门
4. 深度测试（范围=上面三项+跨平台二进制+流式异常）
**不做**：生成式UI(G8,`snapshot→operable`单向门)、always-on(G9)、agent teams(G10)——高工作量单向门，首发前碰=自杀。

MVP-Proud 定义：新用户3分钟内引导配好模型发出第一条消息看到流畅流式；断网一键重连；Win/Linux 与 Mac 同等可跑；**它可见地记住你、你能看能管这份记忆**。其余护城河在 README 当路线图讲故事，不在代码里假装已实现。

关联：[[adr-v4-doc-and-cross-repo-contract]] · CEO 北极星见 user-auto-memory pupu-agent-northstar / agent-teams-direction-decision / pupu-ultra-app-generative-ui。记忆引擎读侧约束见 user-auto-memory unchain-memory-engine-constraint（923重排/long_term_extractor 两挂点）。
