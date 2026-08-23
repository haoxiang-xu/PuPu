---
name: electron-test-glob-and-build-lint-gates
description: Two release-QA gate gotchas — test:electron glob sweeps nested worktrees (inflated/false-fail counts), and web build (CI=true) fails on ESLint no-unused-vars that Jest never catches
metadata:
  type: project
---

Two baseline-QA gotchas found during 0.1.9 convergence audit (2026-07-20), both stable properties of the toolchain:

**1. `npm run test:electron` glob sweeps nested worktrees.**
Its testMatch is `**/electron/tests/**/*.test.cjs` from rootDir with no worktree ignore. When in-flight worktrees live under `.claude/worktrees/`, `.worktrees/`, `.codex/worktrees/` (the team keeps many), the local run picks up their copies too — I saw 138 suites/1121 tests instead of the real **16 suites / 165 tests**. All passed so it wasn't a false-fail that time, but a failing test in ANY nested worktree would false-red the local baseline.
**Why:** the team habitually keeps nested git worktrees inside the repo tree ([[concurrent-worktree-hazard]]). CI is a clean checkout so it's unaffected — this only bites LOCAL baselines.
**How to apply:** for a clean local electron count, add `--testPathIgnorePatterns "/node_modules/" "/.claude/worktrees/" "/.worktrees/" "/.codex/" "codex/worktrees"`. The frontend react-scripts suite is NOT affected (its roots are scoped to src + electron/tests). Backend pytest is safe if you pass an explicit path (`unchain_runtime/server/tests/`).

**2. Green Jest ≠ green build. Web build (CI=true) fails on lint-as-error.**
`react-scripts test` does NOT run ESLint; `react-scripts build` with `CI=true` treats warnings as errors (`Treating warnings as errors because process.env.CI = true`). A dead import (`no-unused-vars`) passes all 2071 Jest tests but hard-fails `npm run build`. This is exactly the release-qa.yml "Web build and version check" step → trips the Deterministic release gate.
**Why:** release-qa steps are `continue-on-error: true` per-step, so a broken build lands on dev as a soft-fail on the PR; only the final-report deterministic gate goes red. That's how dead code slips onto dev tip.
**How to apply:** always run `PUPU_BUILD_VERSION=<current> CI=true npm run build` as its own release gate, separate from tests. Don't infer build health from a green test suite. The aggregate local gate is `npm run qa:release:deterministic` (scripts/release-qa/run-local-gate.mjs).
