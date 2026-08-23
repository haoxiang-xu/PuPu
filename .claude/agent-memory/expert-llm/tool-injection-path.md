---
name: tool-injection-path
description: How MCP + builtin tools enter the model request — provider tools-API is the primary channel; a secondary <tools> system-prompt block also exists
metadata:
  type: project
---

How a tool (MCP or builtin) enters the model request in PuPu. Verified 2026-06-14 reading both PuPu (`unchain_runtime/server`) and unchain core (`/Users/red/Desktop/GITRepo/unchain/src` — installed editable via `__editable__.unchain-0.2.0.pth`).

**Two channels, both populated from the SAME Tool objects:**

1. PRIMARY — provider-native tools/function-calling API param. Each `Tool.to_provider_json(provider)` (unchain `tools/tool.py:208-234`) emits OpenAI Responses `{type:function,name,description,parameters}`, Anthropic `{name,description,input_schema}`, Ollama `{type:function,function:{...}}`. `model_io.py` sets `request_kwargs["tools"] = toolkit.to_provider_json(provider)` for all three providers (gated by `supports_tools` capability). This is where the model actually sees callable name + JSON-schema args.

2. SECONDARY — a `<tools>` system message. `ToolPromptHarness` (unchain `tools/prompting.py`) is auto-registered in `kernel/loop.py:317` on every run. It injects ONE system message: header `# unchain generated tools guidance`, then toolkit-level `prompt_sections` (mandatory policy text), then per-tool entries `- name: purpose` (+ when/avoid/examples from `prompt_spec`). It explicitly tells the model "Use provider-native tool schemas as the source of truth for callable arguments" — i.e. the block is guidance, not the call contract.

**MCP vs builtin — NOT differentiated downstream.** `MCPToolkit._convert_mcp_tool` (unchain `toolkits/mcp.py:301-342`) turns each MCP tool into a plain unchain `Tool` (delegating execution back to the MCP session). AgentBuilder flattens all toolkits into one merged Toolkit. So MCP and builtin tools are the same type by the time `to_provider_json` runs.

**Key asymmetry for MCP tools:** the MCP→Tool conversion sets NO `prompt_spec` and the MCPToolkit carries NO `prompt_sections`. So in the `<tools>` block an MCP tool renders only as a one-liner `- toolname: <its description>` (falls back to description since no prompt_spec). Its real schema (params/required/types) lives ONLY in the tools-API channel. Builtin toolkits (e.g. plan) DO ship rich prompt_sections + prompt_spec, so they get fuller `<tools>` text.

PuPu wiring: adapter `_build_selected_toolkits` (`unchain_adapter.py:3117-3128`) → for `mcp.*` ids calls `build_mcp_runtime_toolkit` (`mcp_toolkits.py:898`) which resolves secrets/transport, builds `MCPToolkit`, `.connect()` (discovers tools), returns live toolkit → into `ToolsModule`.

**One-line answer:** MCP tools enter the model PRIMARILY via the provider tools/function-calling API param (full schema). The system-prompt `<tools>` block is a thin secondary guidance layer where an MCP tool shows only as a name+description line.

See [[ai-layer-toolchain]].
