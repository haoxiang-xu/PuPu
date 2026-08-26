---
name: feature-flags-production-readonly
description: In a production build readFeatureFlags ignores the persisted namespace entirely — shipped flag values come from an untracked .local build snapshot, so no flag state is verifiable from the repo
metadata:
  type: project
---

`src/SERVICEs/feature_flags.js` has two properties that are easy to get wrong and that other agents have already gotten wrong in a court record.

1. **In a production build the persisted flags are not read at all.** `readFeatureFlags()` short-circuits to the build defaults when `NODE_ENV === "production"`. `writeFeatureFlags()` still persists and still notifies subscribers, so the Settings → Dev toggles in a packaged app **write fine and read back the build value** — a session-local illusion that vanishes on the next read.
2. **The shipped flag values are not in the repository.** `scripts/build-web.cjs` reads `.local/build_feature_flags.snapshot.json` at build time and injects it as `REACT_APP_BUILD_FEATURE_FLAGS`; `.gitignore` excludes `/.local/`. The file has no history and may differ per build machine. The last build's resolved values are written to `build/build_feature_flags.json` (which also carries the Memory V2 sidecar env under `_pupu_memory_v2_release`).

**Why:** during case `0000-0002-2026-0807` two code owners built key conclusions on "what the release configuration is" — one said Memory V2 was active, the other said it was off — and **neither claim was checkable from the repo**. The `defaultValue` in `FEATURE_FLAG_DEFINITIONS` is the fallback when the snapshot is absent, not the shipped value.

**How to apply:** never answer "is flag X on in the shipped app?" from `FEATURE_FLAG_DEFINITIONS`. Read `.local/build_feature_flags.snapshot.json` (what the *next* build will ship) and `build/build_feature_flags.json` (what the *last* build shipped), and say which of the two you read — they routinely disagree. When someone argues "there is no urgency because the flag is off", ask which snapshot they mean. `scripts/**` and `.gitignore` are `code-owner-devtools`' boundary; the read semantics in `feature_flags.js` are mine.

See [[settings-schema-cto-gated]], [[memory-agent-settings-orphaned]].
