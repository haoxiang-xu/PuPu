---
name: case
description: "Retired compatibility stub. PuPu no longer permits case, court, Quorum, owner-routing, proposal, ruling, handoff, or acceptance-trial workflows. If explicitly invoked, do not create or advance records; route release work to the matching release skill or use a direct implementation plan."
---

# Retired — Do Not Use

This workflow is permanently disabled for new PuPu work.

- Do not create or modify anything under `.claude/court/cases/`.
- Do not assign code-owner or court roles, request owner confirmations, open handoffs or hearings, or create proposal/ruling/acceptance records.
- Historical court, codex, agent, and supporting script files are read-only history. They do not authorize or block current work.
- For release work, use the smallest matching skill: `release-open-sprint`, `release-draft-ticket`, `release-refine-ticket`, `release-feature-audit`, or `release-close-sprint`.
- For implementation, use the Release issue, a direct Plan when needed, impact analysis, tests, and evidence. Cross-boundary work follows `.claude/rules/cross-boundary-contract-gate.md` without any role or court mechanism.

If a user explicitly asks to restore this retired workflow, stop and request an explicit update to the repository's active `CLAUDE.md` and `AGENTS.md` instructions. Do not infer restoration from legacy terminology or historical references.
