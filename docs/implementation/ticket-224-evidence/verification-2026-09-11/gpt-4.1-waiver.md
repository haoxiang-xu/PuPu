<!-- release-audit-waiver:v2 -->
# #224 / Release #203 — GPT-4.1 live-model omission

Omitted check: only the `openai:gpt-4.1` probe in feature audit Check 5.
Candidate: sha256:2bc66daae1e1f8cf69b02ca69f7f3546a01562f080c02d21cc27de676389ce1e
Risk: no separate live OpenAI-provider coverage in this verification.
Reason: the local isolated profile has no OpenAI key; maintainer explicitly said
“4.1 就不需要跑了”. Real qwen3:32b and the full applicable renderer/runtime
round trip remain required, including restart/resume.
Approver: project maintainer through the current user instruction.
Date: 2026-09-11 (America/Vancouver).

This candidate-bound waiver is recorded on child #224 and Release #203 during delivery.
