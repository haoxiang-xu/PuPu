---
name: roadmap-predesigns-019-020
description: 2026-07-05 三份前置设计定案(0.1.9 Gemini / 0.1.10 skills / 0.1.11-0.2.0 external runner)——推荐、契约切面、单向门
metadata:
  type: project
---

2026-07-05 应 CTO 委托产出三份前置设计（路线：0.1.9 palette+theme+Gemini；0.1.10 skills+delta-persist+eval；0.1.11 thread+CC/Codex 薄集成；0.2.0 agent builder/subagent-pool）。三份均走 GitNexus 取证 + codex exec -p architect 推理，已交 CTO 切片派活。

**Why:** 路线会议拍板后 CTO 需设计到手才能派活；设计① 阻塞 0.1.9。

**How to apply:** 后续 0.1.9-0.2.0 任何相关派活/验收以下列定案为基准；违背单向门需重新过我。

## ① Gemini（0.1.9）定案
- **OpenAI-compat 捷径判死**：Gemini compat 端点（`/v1beta/openai/`）只支持 chat.completions/embeddings/images，**不支持 Responses API**（官方文档 + 第三方公开踩坑 issue 双证）；unchain `OpenAIModelIO` 是 Responses-only（`providers/openai.py`），且 unchain 里**不存在** chat.completions 形态 ModelIO（ollama.py 走 Ollama 原生 /api/chat）。
- **定案：native `GeminiModelIO`（google-genai SDK）进 unchain** `src/unchain/providers/gemini.py`，量级对标 openai.py/anthropic.py (~280 行)。泛用 chat-completions adapter 押后（等第二个真实 provider 需求）。`ResponseFormat.to_gemini()` 已存在（schemas/response.py:46）；capability JSON 已有 gemini-2.5-pro/flash 条目（此前被 adapter seed dict 过滤）。
- **白名单收敛同批做**：unchain_adapter.py 约 12 处 + 前端约 8 处硬编码 → 双侧 provider descriptor 单一数据源。impact 实测 LOW（_get_runtime_config/_parse_model_overrides 各 1 直接 caller）。机械改造先行（S0），gemini 之后是纯数据新增。
- **单向门**：provider 名 `gemini`（非 google）；modelId `gemini:<model>` 持久化；key 字段 `settings.model_providers.gemini_api_key` + payload `geminiApiKey`/`gemini_api_key`；catalog key `providers.gemini`；capability 前缀 `gemini:`。
- 打包：google-genai 需进 sidecar PyInstaller（build_unchain_server.sh + .ps1 双脚本 hidden-import）。默认模型选择 = llm-expert 签字。

## ② skills（0.1.10）定案
- **语义 = hybrid 渐进披露**（Claude Code 式）：skill 是 prompt 资产 + 运行时取回；system prompt 只注入选中技能的 index（id/name/description），body 经保留只读工具 `load_skill` 按需加载（复用 ToolRuntimePlugin seam，同 subagent 保留工具先例）。不是 toolkit 能力，不逐个进 provider JSON tools。
- **落位全在 Flask 侧**：`skill_loader.py`（第四个同构 loader）+ `route_skills.py`；注入点 `_create_agent`/`_build_developer_agent`；前端只发 `options.skill_ids`，永不发 body。
- **单向门**：磁盘布局 `~/.pupu/skills/<skill_id>/SKILL.md`（frontmatter: format=pupu.skill/format_version=1/id/name/description/tags）；id 语法 `^[a-z][a-z0-9_-]{0,63}$`；pack 格式 zip{manifest.json(format=pupu.skill_pack), skills/<id>/...}；payload 字段 `options.skill_ids`；**v1 禁一切可执行内容**（scripts 开闸需沙箱设计，这才是难回头的门）。
- 注入措辞/加载时机/冲突规则 = llm-expert 签字。

## ③ external agent-runner（0.1.11 薄 → 0.2.0 pool）定案
- **裁决：进程边界实现现有 subagent 抽象，不开平行 seam**。unchain core 加 runner protocol（`SubagentRunRequest(mode, task, child_id, child_run_id, parent_run_id, lineage, timeout_seconds, cancellation_token, emit_event, on_tool_confirm, ...) -> SubagentResult`）+ `SubagentTemplate.runner` 判别字段；具体 `ExternalProcessRunner` 落 PuPu sidecar。假 `agent`（ExternalProcessAgent 塞进 Any）只可当 spike，禁止 ship。
- **事件映射**：外部 CLI JSONL → v4 事件（run.*/step.*/interaction.*），child `run_id=child_run_id`、`links.parent_run_id`；不占用 channel_id/team_id。
- **安全内建**：env 白名单继承 + deny 前缀（OPENAI_/ANTHROPIC_/GEMINI_/GOOGLE_/PUPU_/UNCHAIN_——0.1.9 加了 Gemini 后 GEMINI_/GOOGLE_ 必须在列，Codex 原稿漏了这两个是我补的）；外部 CLI 自带鉴权；shell=False + 可执行 allowlist（内置 profile 优先）；取消 = sidecar 进程注册表 + POSIX 进程组 SIGTERM→SIGKILL / Windows job 或 taskkill /T /F（现状 Electron 只 abort fetch、Flask 只 cancel confirmation，不够）。
- **timeout 冻结在 template/runner 级**（PuPu 现设 60s worker timeout @unchain_adapter.py:4334，对外部 CLI 远不够；不动全局值）。
- **0.1.11 薄片**：单一 opt-in external template（delegate-only、summary、ephemeral、非交互权限模式、无 pool UI）。
- **0.2.0 冻结面**（单向门）：三个保留工具名；SubagentResult 形状；SubagentTemplate.runner/timeout_seconds/parallel_safe/allowed_modes/output_mode；child 事件契约（v4 + parent_run_id links）；spawn 时权限声明；env 洗净不变式；取消语义（stop 杀全部子进程）；policy 限额适用于混合成员。

相关：[[trace-finality-decision]]、[[agent-teams-decision]]、[[listener-node-and-boulders]]
