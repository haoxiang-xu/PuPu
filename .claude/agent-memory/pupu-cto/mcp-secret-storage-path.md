---
name: mcp-secret-storage-path
description: 关键架构事实——MCP 工具 secret/OAuth token 走后端 ~/.pupu/mcp_secrets.json（chmod 0o600 明文落盘），不在 RC-6 的 localStorage 热点；二者风险面不同
metadata:
  type: project
---

**MCP 工具的 secret（bot token / env secret / OAuth token）存储路径 ≠ LLM provider API key 的存储路径。** 这是评估"加某个 MCP 候选要不要存敏感 token"时最容易搞错的一点。

- **MCP secret 真相源 = 后端 `unchain_runtime/server/mcp_secrets.py`** → 落盘 `~/.pupu/mcp_secrets.json`（`UNCHAIN_DATA_DIR` 可覆盖）。
  - 明文 JSON，但 **`chmod 0o600`**，且在 **Flask sidecar 进程侧**，不进 renderer、不进 localStorage。
  - OAuth token 同样后端管（`delete_mcp_oauth_token` 等在 `mcp_toolkits.py`/`mcp_secrets.py`）。
  - 注入方式：stdio 型 secret 作为子进程 env 注入（`_resolve_secret_values`）。
- **LLM provider API key（SEC-001 RC-6）** = 明文存 **renderer 的 localStorage**，够得到它的注入面是 SEC-001 的痛点（accepted-risk 等 OS keychain 收口）。

**Why 这区分承重**：curator/直觉容易把"MCP 要存 bot token"一律标成"触达未收口的密钥面 RC-6"。实情是 **MCP secret 已经在一条独立、文件权限收紧、后端隔离的路径上**——比 localStorage 里的 LLM key 风险低一档。所以一个 Slack/Discord bot token 的存储风险 **不等于** provider API key 的风险。

**How to apply**：评估聊天类 MCP 候选（Discord/Telegram bot token）的密钥风险时，按"后端 mcp_secrets.json 0o600 明文"这条真实路径定级，而非套 RC-6。真正的红线是别的：(1) 明文落盘仍非加密（未来 keychain 化要把 mcp_secrets.json 一并纳入，别只收口 localStorage）；(2) **OAuth-only 远程条目（http+OAuth，secrets 为空）反而最干净**——PuPu 不托管长期 secret，token 由 OAuth 流换、后端持有。优先 OAuth 远程版而非 bot-token 本地版。相关：[[adr-sec-001-arbitration]]、[[mcp-store-current-inventory]]。
