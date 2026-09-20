# Topics change 2026-09-08

> Recorded on 2026-09-13 from the applied GitHub topic set and the contemporaneous growth decision. The change itself occurred on 2026-09-08; this file restores the missing attribution and rollback anchor.

## Old (rollback set)

agent-orchestration ai-agent ai-agents ai-assistant ai-chatbot anthropic chatgpt claude claude-code deepseek desktop-app electron llm local-llm mcp mcp-client multi-agent ollama openai self-hosted

## New

agent-orchestration ai-desktop-app anthropic chatgpt claude claude-code deepseek desktop-ai desktop-app electron llm llm-client local-llm mcp mcp-client multi-agent ollama ollama-client openai self-hosted

## Rationale

Replaced four generic, highly competitive agent/chat terms (`ai-agent`, `ai-agents`, `ai-assistant`, `ai-chatbot`) with terms describing PuPu's shipped desktop-client and local-model use cases: `ai-desktop-app`, `desktop-ai`, `llm-client`, and `ollama-client`. The purpose is to test whether niche desktop/local-client discovery brings more qualified search visitors than broad agent taxonomy.

No other topics changed. The observation window opens from this change; do not make another topic change before the 14-day measurement checkpoint on 2026-09-22 unless the project owner explicitly overrides it.

## Rollback command

```sh
gh api -X PUT repos/haoxiang-xu/PuPu/topics --input - <<'JSON'
{"names":["agent-orchestration","ai-agent","ai-agents","ai-assistant","ai-chatbot","anthropic","chatgpt","claude","claude-code","deepseek","desktop-app","electron","llm","local-llm","mcp","mcp-client","multi-agent","ollama","openai","self-hosted"]}
JSON
```
