# 自有插件缺陷票草稿

状态：尚未提交 GitHub。已获授权创建，归属 Release 待用户指定；候选为 v0.1.11、v0.1.12、v0.2.0。以下是新票草稿，不是已创建 issue 或 Project 状态的镜像。

## 1. Fix Core shell confirmation bypass through executable-name trust

Labels: bug, Unchain · Size: M · Status on creation: Planning

> [DRAFT — intent only. The agent responsible for implementation may refine this ticket directly.]

**What & Why** — Ensure Core's read-only command exemption cannot allow an untrusted executable to perform unapproved actions. The 2026-09-13 scoped audit confirmed a confirmation-boundary violation on Unchain commit 8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1 (PV-F01); users must retain control over commands with side effects.

**Acceptance (outline)**
- Untrusted executable identities cannot inherit a read-only exemption solely from their filename.
- Denying confirmation prevents observable side effects, while genuinely permitted read-only commands still work.
- Preserve a regression reproducer and verify the fix in the PuPu and Unchain artifact pair that users run.

## 2. Enforce Core workspace boundaries for search and file enumeration

Labels: bug, Unchain · Size: M · Status on creation: Planning

> [DRAFT — intent only. The agent responsible for implementation may refine this ticket directly.]

**What & Why** — Apply the selected workspace boundary consistently to Core search and file enumeration. The 2026-09-13 scoped audit found that search can reveal outside content and enumeration can reveal outside paths on Unchain commit 8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1 (PV-F02), despite direct reads being rejected.

**Acceptance (outline)**
- Search and enumeration do not expose content or paths outside authorized workspace roots through links or traversal.
- Valid in-workspace searches continue to return expected results.
- Preserve adversarial regression evidence and verify the deployed PuPu and Unchain artifact pair.

## 3. Keep Plan discovery and reads inside the selected workspace

Labels: bug, Unchain · Size: S · Status on creation: Planning

> [DRAFT — intent only. The agent responsible for implementation may refine this ticket directly.]

**What & Why** — Ensure plan discovery and reading honor the same workspace boundary as plan writes. The 2026-09-13 scoped audit confirmed outside plan metadata disclosure on Unchain commit 8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1 (PV-F03); listing plans should not expose another workspace's information.

**Acceptance (outline)**
- Plan discovery rejects outside targets reached through directory or file links.
- Normal plan listing, persistence and updates remain functional, with existing write protections preserved.
- Preserve regression evidence for both link cases and verify the fix in the deployed artifact pair.

