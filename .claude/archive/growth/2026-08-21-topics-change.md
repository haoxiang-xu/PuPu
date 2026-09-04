# Topics change 2026-08-21

## Old (rollback set)
agent-orchestration agent-teams ai-chatbot bot-development build-your-agent claude-code llm-gui llm-webui loop-engineering multi-agent multios ollama-app ollama-chat ollama-client ollama-gui ollama-ui ollama-webui openclaw-ui own-your-data self-hosted

## New
llm ai-agents mcp claude-code claude openai self-hosted ai-agent electron anthropic ollama chatgpt desktop-app multi-agent deepseek ai-assistant local-llm agent-orchestration ai-chatbot mcp-client

## Rationale
Dropped 15 near-zero-volume topics (build-your-agent=1 repo, llm-gui=6, multios=7, openclaw-ui=7, llm-webui=23, ollama-chat=66, ollama-ui=89, ollama-webui=54, own-your-data=115, agent-teams=157, ollama-app=174, bot-development=229, loop-engineering=421, ollama-client=330, ollama-gui=178).
Added head terms (llm=118k, ai-agents=76k, mcp=64k, claude=46k, openai=42k), mid terms (electron, ollama, chatgpt, desktop-app, anthropic), and high-intent niche terms (deepseek=8.7k, ai-assistant=6.6k, local-llm=5.5k, mcp-client=1.6k).
Benchmarked against Cherry Studio / Chatbox / Jan / LobeChat / Open WebUI topic sets.
Rollback: gh api -X PUT repos/haoxiang-xu/PuPu/topics -f "names[]=..." with the old set above.
