---
name: market-topology-2026-07
description: Baseline snapshot of AI client/assistant market — head players, GitHub stars, funding per quadrant, dated 2026-07-21
metadata:
  type: project
---

First market baseline. Diff future cycles against this. All stars = GitHub REST API primary, pulled 2026-07-21/22.

## Q1 — Open-source desktop AI clients (stars 2026-07-21/22)
- Open WebUI (open-webui/open-webui): **146,255★** — scale leader, ~2x next tier. License BSD-3. Docker-first (onboarding barrier). Funding not verified.
- LobeChat (lobehub/lobe-chat): **80,639★**. Repositioned 2026 toward agent orchestration ("Chief Agent Operator"). Founder left Ant Group 2025 → LobeHub. Cloud SaaS candid disclosure: ~¥30k/mo (~$4k), ~60 paying, ~7000 registered = **<1% conversion**. Sync CRDT "experimental" & buggy (#2842).
- AnythingLLM (Mintplex-Labs): **63,655★**. YC S22, $500K pre-seed 2022 (only confirmed institutional round in the OSS-client set). Hardcoded 5-min timeout bug class (#4854).
- Cherry Studio (CherryHQ): **48,847★**. UNFUNDED, China, founded 2024. AGPL-3.0 → commercial-license dual model + Enterprise Edition (enterprise.cherryai.com.cn). No account system; sync via WebDAV/S3, users demanding built-in sync (#14898/#10982/#5359). Header-injection bugs break 3rd-party proxies (#13467/#10209).
- Jan (menloresearch/jan): **43,666★**. Menlo Research UNFUNDED, Singapore, 2023 (NOT Menlo Ventures VC). Hardcoded ~120-200s timeout (#6371), stability bugs (#8235/#7716).
- Chatbox (chatboxai): **41,088★**. Funding could not verify.
- LibreChat (danny-avila): **41,085★**.
- 5ire (nanbingxyz): **5,284★**.
- Witsy (nbonamy): star count UNVERIFIED (API anomaly showed 6, web suggests ~1.8-1.9k). "Universal MCP client."
- Msty (CloudStack LLC): closed-source, ~5 employees (Apr 2026), unfunded, went fully free Jul 2025, local/no-telemetry.
- Enconvo: closed macOS launcher, BYOK/commercial (~$10 Starter / ~$96/yr / lifetime).

## Q2 — Labs official apps (all cloud-first, single-vendor-by-design, MCP-driven, racing on computer-use)
- ChatGPT desktop: 2026 merged Codex+Chat+Work into ONE app (GPT-5.6, ~2026-07-09). Built-in browser + background Computer Use. Codex side CAN point at any Chat Completions/Responses provider. Retired standalone Atlas browser & Sora app — converging INWARD.
- Claude desktop: "programmable AI OS," MCP + local MCP servers via .mcpb. Hardcoded to Anthropic API — cannot swap core model (local model only usable as a tool, not the brain). Computer use / "Cowork."
- Gemini: Computer Use via Project Mariner, browser/DOM-optimized, AI Ultra tier.
- Copilot: scope could not verify.

## Q3 — Agent platforms (where the money/heat is)
- Manus: ~$450M annualized rev est (Jun 2026, Sacra). $75M Series B Benchmark Apr 2025 @~$500M → ~$2B. Meta $2B+ acquisition BLOCKED by China (Apr 2026). Figures press/est.
- Computer-use race: OpenAI (Operator→ChatGPT Agent, folded 2025-07-17), Anthropic (most portable/general), Google (browser-native). Consensus: NOT production-reliable yet in 2025-26.

## Q4 — IDE assistants — NOT expanding into general chat
- Cline ~64k★, Apache-2.0, >1.5M VS Code installs. Cursor now owns Continue. All stay dev-specialized; no encroachment on general desktop AI client space (med conf, absence-of-evidence).

## Cross-quadrant read
- OSS clients mostly unfunded/lightly-funded; moat = community + multi-provider + local-model support (what labs won't do).
- Value that SCALED went to INFRA not client: OpenRouter $1.3B / $113M Series B (2026-05-26), ~$50M ARR. Aggregator thesis validated at infra layer, not client layer.
- PuPu context at snapshot: 36★, bus factor 1, 0.1.9 (computer-use + plugins store + new first-screen) shipping ~week of 2026-07-20. (own-repo numbers per growth-ops.)
