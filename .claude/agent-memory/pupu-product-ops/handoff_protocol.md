---
name: handoff-protocol
description: When to hand off to / cite pupu-qa-tester and mcp-store-curator vs. own the work myself
metadata:
  type: feedback
---

Division of labor between me (release captain) and my two teammates. See [[team-roster]] for who they are.

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
