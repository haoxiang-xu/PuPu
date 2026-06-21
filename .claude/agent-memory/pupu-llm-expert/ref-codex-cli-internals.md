---
name: ref-codex-cli-internals
description: 参照系统调研——OpenAI Codex CLI (openai/codex, codex-rs Rust) 的 agent 循环/记忆/缓存/sandbox/exec 取证位置
metadata:
  type: reference
---

愿景研究目标 B1：OpenAI Codex CLI 内部机制，作为 PuPu "本地常驻 daemon" 北极星的参照系。活跃代码在 `codex-rs/`（>95% Rust），旧 TS 在 `codex-cli/` 仅做 wrapper。

一手取证位置（结构会漂移，引用前复核 commit）：
- Agent 循环/turn：`codex-rs/core/src/codex.rs`（submission/event 队列 Op→submission_loop→EventMsg；Session/Mutex<SessionState>；TurnContext；SUBMISSION_CHANNEL_CAPACITY=64）
- 模型调用/缓存：`codex-rs/core/src/client.rs`——`prompt_cache_key = thread_id`（不是 hash prompt）；走 Responses API（ResponsesApiRequest/build_responses_request）；可 WebSocket，HTTP fallback
- compaction：`codex-rs/core/src/compact.rs` + `tasks/compact.rs`；阈值 `model_auto_compact_token_limit`（来自 openai_model_info.rs，约 180k–244k 因模型而异，"95% 有效窗口"）；保留约 20k recent + summary；COMPACT_USER_MESSAGE_MAX_TOKENS=20_000（需复核）；OpenAI 模型走 remote POST /responses/compact，其它走 local LLM（provider.is_openai() 判定）
- 记忆：AGENTS.md（project_doc_max_bytes 控制读入量，默认 unset）；生成式记忆 `~/.codex/memories/`（后台、线程 idle 后总结）；CODEX_HOME 默认 `~/.codex`；history.jsonl（history.max_bytes 默认无上限）；config.toml
- sandbox/approval：macOS seatbelt/sandbox-exec、Linux bwrap+seccomp；modes=read-only|workspace-write|danger-full-access；approval=untrusted|on-request|on-failure|never；.git/.codex 在 workspace-write 下仍只读
- 非交互/自主形态（PuPu 心跳最相关）：`codex exec`（headless，跑完即退）、`--json`(JSONL: thread.started/turn.*/item.*)、`--output-schema`、`codex exec resume`、`--ephemeral`、默认 read-only sandbox

官方文档：developers.openai.com/codex/{memories,config-reference,noninteractive,sandbox}

关联：[[a2a-channel-direction]]（多 agent 方向）、[[tool-injection-path]]
