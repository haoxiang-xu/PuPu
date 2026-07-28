---
name: handoff-protocol
description: When to hand off to / cite pupu-qa-tester and mcp-store-curator vs. own the work myself
metadata:
  type: feedback
---

Division of labor between me (release captain) and the specialists whose evidence feeds a release decision. See [[team-roster]] for who they are.

**With pupu-release-full-test（检）— complete release execution:**
- 完整发版 qualification 的固定执行、candidate fingerprint、报告目录与 6-cell 证据保全 → **检的工作**。
- release go/no-go、跨仓兼容裁断、业务取舍 → **我的工作**。我不能把检的 `INCOMPLETE` 改写成 PASS。
- 检必须先跑零付费门禁；真实模型 6-cell 必须另有 CEO 明确付费授权。凭据存在不等于授权，付费失败不自动重跑。
- **Why:** deterministic 20m soak + paid 6-cell matrix 已形成重复、长时、强审计的独立操作面；把执行下沉能让我保留独立裁决，而不让执行人改门槛。
- **How to apply:** 用户说“release full test”时我先定义 candidate/required sign-offs，再 dispatch 检；检交报告后我综合验/擎/守/智证据出最终 GO/NO-GO。

**With pupu-qa-tester (testing split):**
- Per-feature end-to-end assertions (does this feature actually work across the full chain?) → **his job**, not mine.
- Release gating go/no-go → **my job**.
- I may **cite his regression results as release evidence** rather than re-running everything myself. If he has fresh green results for the changed surface, reference them in my go/no-go.
- **Why:** avoids redundant test runs and keeps a clean evidence chain; his deep per-feature verification is stronger than my broad gate.
- **How to apply:** When a release touches a feature he's already verified end-to-end, pull his result as evidence. When no fresh verification exists for the changed surface, ask him to run it (or run the gate myself) before issuing go/no-go.

**With mcp-store-curator (MCP store split):**
- Curation itself — entry intake, categorization, dedup, field/transport/env validation, connectivity — is **his job**, not mine.
- Before a release that ships MCP store entries, I **confirm the affected entries have been validated by him**; I don't curate them myself.
- **Why:** he owns "未经校验，绝不上架"; I'm the gate, not the curator.
- **How to apply:** In a release QA pass touching MCP store data, check curator validation status as a checklist item; flag unvalidated entries as a no-go blocker rather than validating them myself.

**With pupu-security-expert（守）— release security sign-off line (2026-06-10):**
- Security assessment of trust-boundary changes — Electron 加固、IPC 边界、Flask sidecar 攻击面、秘密处理、MCP 工具供应链、LLM 层威胁、依赖审计、签名/公证完整性 — is **his job**, not mine. I don't make the security call myself.
- A **security sign-off is now a release gate**: he provides a security blocker list + signs off, then I run release. An unresolved security blocker = **no-go**, same weight as a failing test.
- **Trigger his review (checklist item)** whenever a release touches a trust boundary: IPC channel add/change, MCP install flow, auto-update path. Also pull his dependency-audit + signing/notarization integrity result into my go/no-go.
- **Why:** trust-boundary correctness is a distinct discipline from functional QA; functional-green does not mean secure-to-ship. Separating the sign-off keeps a clean evidence chain and a real veto.
- **How to apply:** In a release QA pass, add "security sign-off obtained for trust-boundary changes? deps audited? signing/notarization verified?" as explicit gate items. If 守 has a fresh sign-off for the changed surface, cite it as evidence (parallel to how I cite [[team-roster]] qa-tester results); if not, request it before issuing go/no-go. Reminder pairs with the unchain sidecar-restart ops note: 信任边界变更既要 守 签字，也要确认 sidecar 重启生效。
