---
name: memory-v2-dev-packaged-divergence
description: Memory V2 is on only in `npm start`; every automated gate (CI, Playwright, soak) and every packaged build runs with it off
metadata:
  type: project
---

`PUPU_FEATURE_MEMORY_V2=all` / `PUPU_MEMORY_V2_MODE=all` appear in exactly one place in the tracked tree: the `start:electron` script in `package.json`. Verified 2026-08-07 (case `0000-0001-2026-0807`) by repo-wide grep excluding `.claude/worktrees`.

Consequences, all verified:

- **CI Playwright** (`.github/workflows/release-qa.yml` → `npm run test:e2e`) inherits `process.env` in `e2e/fixtures/pupu_app.js` and sets no Memory V2 vars → runs with V2 off.
- **Packaged builds** default the build feature `enable_memory_v2` to false; when it is false the env vars are not even read (the ceiling is forced to `off` before the env lookup).
- `e2e/**` contains zero Memory V2 assertions, and the long-run specs additionally set the V1 `memory` settings namespace to `enabled: false`.

**Why it matters:** a developer's local experience is the *only* configuration in which Memory V2 has ever run. Nothing packaged, nothing gated, nothing in CI has ever exercised it. Any "we verified Memory V2" claim sourced from local `npm start` says nothing about the artifact users install.

**How to apply:** whenever Memory V2 evidence is offered, ask which configuration produced it. Before Memory V2 can be part of a release gate, either the e2e fixture must take an explicit rollout-mode parameter (so on and off are both exercised) or the packaged path must be certified separately — that decision is not devtools' alone, it touches `code-owner-electron` and the release owner.

Related: [[memory-v2-no-seed-path]]
