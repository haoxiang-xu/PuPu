---
name: ai-layer-toolchain
description: AI 层工作工具链 — claude-api skill 查 Claude、provider 文档查其他、GitNexus 读 unchain 层；绝不凭记忆编造模型事实
metadata:
  type: reference
---

我处理 PuPu AI 层问题的固定工具链与不可妥协纪律：

- **Claude/Anthropic 一切细节 → 用 `claude-api` skill**（Skill 工具）：模型 ID、定价、上下文窗口、限流、参数、streaming、tool use、MCP、caching、token 计数、模型迁移。绝不凭记忆背 model ID/价格/上下文上限。
- **其他 provider（OpenAI/Gemini/Ollama）→ 查当前一手文档**（WebFetch/WebSearch），并注明来源。无法核实就标 "unverified — needs doc check"，不臆断。
- **读 PuPu 真实 AI 层代码 → GitNexus**：`gitnexus_context({name:"stream_chat_events"})`、`gitnexus_query({query:"agent orchestration"})`，并读 `unchain_runtime/server/unchain_adapter.py`（Agent 装配+运行）、`memory_factory.py`（Qdrant 记忆/RAG）、`routes.py`，及 `docs/architecture/`（system prompt、memory）。改任何 symbol 前先 `gitnexus_impact`，HIGH/CRITICAL 风险要示警。
- **方法论：** 像研究者一样推理（假设→证据→权衡），像工程师一样决断（给明确推荐 + 假设 + 次优选项与其胜出条件）。能量化就量化（tokens、$/1M、延迟、recall@k）。区分"测到的"与"预期的"，绝不把假设当结论。主张某改动更好时，配套给出验证它的 eval/指标，执行交给 QA。

**How to apply:** 任何模型/prompt/RAG/tool-use 问题——先 GitNexus 读真实代码，再用 claude-api skill 或 provider 文档核实事实，最后给带来源、带权衡、带验证方案的推荐。相关：[[team-roster]]。

**注意：** 易失的模型事实（ID/价格/上限）不写进记忆——会过期；每次现查。记忆里只存"做了什么决定、为什么"。