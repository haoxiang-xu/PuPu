# Release Confidence Pipeline

PuPu uses a hybrid release pipeline: deterministic gates run locally and on
GitHub, while AI reviewers add change-aware risk analysis without replacing
tests. The same app-control contract used by Playwright is intended to become
the foundation for future in-app agent control.

## Decision: hybrid local + GitHub

### Local before tagging

The complete release qualification is defined by the
[Pre-release Full-Test Runbook](../conventions/release-full-test.md). Its base
local gate is:

```bash
npm run qa:release
```

The local gate runs the full frontend, Electron, Python, MCP-registry, production
web build, release-script, third-party notice, and Playwright Electron suites. It
writes evidence to `.release-qa/local/`. Release-mode Playwright starts a dedicated
non-reused web server so a stale development process cannot satisfy the smoke test.

After deterministic checks pass, two independent read-only reviewers receive the
release summary since the latest tag and inspect the relevant repository files:

- Codex CLI, authenticated with the developer's ChatGPT plan.
- Claude Code CLI, authenticated with the developer's Claude plan.

Both return the same structured `GO`, `NO-GO`, or `NEEDS-HUMAN-TEST` schema. The
strict local gate passes only when both return `GO`. AI findings are evidence and
risk discovery; deterministic failures always remain authoritative.

The base command is non-paid and intentionally excludes both the deterministic
20-minute single-root run and the paid six-cell live-model matrix. The full-test
runbook runs those as separate phases, and the paid phase requires an explicit
cost authorization.

### GitHub on every PR

The `Release QA` workflow builds the selected clean Unchain source exactly once
as an immutable wheel, then runs:

1. Full frontend Jest suite.
2. Electron main/preload/Test API Jest suite.
3. Full Python sidecar pytest suite with the immutable Unchain wheel.
4. Blocking Context V2 and RunBundle contract matrices using the same wheel
   and tests from its recorded clean source revision.
5. Independent wheel SHA-256 and complete runtime protocol manifest/digest
   validation.
6. Production web build and version checks.
7. MCP registry, release-QA script, and third-party notice tests.
8. Playwright Electron smoke on Ubuntu under Xvfb.

The deterministic, Playwright, and packaging jobs emit the same machine-readable
report shape. The final job merges those reports, publishes Markdown/JSON evidence,
and fails when required checks have no executed tests or artifact/manifest evidence
is missing, malformed, or inconsistent. Runtime compatibility is decided only by
the loaded code-backed protocol manifest; Git revision and source are provenance
telemetry, not an admission lock.

### GitHub package QA and release candidates

A `v*` tag or manual `qa_mode=release` run adds:

- Playwright Electron on Ubuntu, macOS, and Windows.
- Unsigned package builds for macOS arm64, macOS Intel, Windows, and Linux.
- All four package jobs download the exact deterministic wheel/evidence bytes,
  force-install that wheel into the PyInstaller environment, and start the real
  packaged sidecar for authenticated `/health` and `/context/v2/status` protocol
  smoke checks.
- Version-to-tag validation.
- Optional API-backed Unchain release analysis only from a protected manual
  `qa_mode=release` run on `main`, when CI secrets are configured.

macOS and Windows UI runners are release-only because they consume the GitHub
Free minute allowance faster than Linux. Playwright evidence is retained for 14
days; package artifacts are retained for 7 days to stay within the smaller Free
artifact-storage allowance.

`qa_mode=release` is still diagnostic and uses unsigned package commands. It
never creates a GitHub Release: every package command passes `--publish never`.

The only stageable path is the manual `qa_mode=release-candidate` mode, dispatched
against an existing `vX.Y.Z` tag with a full immutable Unchain revision. It uses
the protected `release-signing` Environment, requires macOS signing/notarization
credentials and Windows signing credentials, emits canonical architecture-bearing
names, and builds without publishing. A versioned artifact contract requires the
four v0.1.10 target slots (`macos-arm64`, `macos-x64`, `windows-x64`, and
`linux-x64`) while declaring Windows/Linux ARM64 as reserved v0.2.0 slots. The
candidate artifact carries every exact filename, byte size, SHA-256, updater
metadata reference, tag/commit, candidate Actions run ID, and immutable Unchain
identity. Updater YAML SHA-512 values are recomputed from the packaged payload
bytes before they can enter the sealed manifest.

Promotion is deliberately separate from building:

1. `Stage Verified Release Candidate` downloads the retained candidate bytes and
   the packaged-install qualification receipt from #218, verifies both Actions
   runs against the exact tag commit and expected workflow path, re-hashes them,
   and creates or verifies a Draft Release in the protected `release-stage`
   Environment.
2. It re-downloads the Draft Release and checks the same manifest before
   stopping. A missing, renamed, extra, or modified asset fails closed.
3. `Publish Verified Draft Release` requires the protected `release-publish`
   Environment plus an explicit `PUBLISH` confirmation. It re-downloads and
   re-verifies the Draft Release, then changes only its draft state. It contains
   no build or upload step.
4. After publication, the same publish run calls the README workflow, which
   re-downloads the public assets, verifies the manifest again, and opens a
   deterministic documentation PR. This avoids relying on a `GITHUB_TOKEN`
   release event to trigger a second workflow.

The optional Unchain/Codex/Claude analysis remains advisory. Missing model
capacity must never block the deterministic candidate, stage, or publish chain.

## Coverage model

| Layer | Primary gate | What it catches |
| --- | --- | --- |
| Pure UI/state logic | Frontend Jest | Rendering, hooks, reducers, storage helpers, interaction states |
| Electron boundaries | Electron Jest | Main/preload contracts, IPC, Test API, service lifecycle |
| Runtime/backend | Python pytest | Routes, orchestration, memory, MCP, computer control |
| Real app behavior | Playwright Electron | Startup, onboarding, real Chromium DOM, accessibility, modal control, Test API/UI consistency |
| Build integrity | Production build | Bundling, generated version, warnings promoted by CI |
| Distribution | Package matrix | Platform packaging, embedded sidecar, license gate |
| Release-delta risks | Codex + Claude | Missing tests, cross-layer assumptions, unreviewed high-risk changes |
| Native/real services | Manual checklist | Signing, OS permission prompts, installers, real providers, Ollama, real folders |

No automated system can cover every failure. The goal is that every release has
evidence from each relevant layer, and every uncovered native/service dependency
is named explicitly instead of silently assumed to work.

## App-control contract

Playwright and future app agents share this control hierarchy:

1. Test API for semantic actions and authoritative state.
2. Accessibility-labelled React controls for visible UI interaction.
3. Playwright over an E2E-only Electron CDP port for real renderer automation.
4. Electron preload/main bridges for privileged internal operations.
5. Computer Use for native OS dialogs and other applications.

The Playwright smoke deliberately combines Test API operations with real UI
actions. It verifies that a semantic action such as creating a chat is reflected
in the renderer, and that critical UI controls remain discoverable through the
accessibility tree. This prevents the QA harness and future in-app agent control
from becoming two unrelated automation stacks.

The CDP port and isolated profile exist only for the spawned E2E process. Normal
development and production launches do not expose a remote-debugging port; the
loopback Test API remains the semantic control plane and production safety
boundary.

## Adding coverage

When adding a feature:

- Put deterministic business logic in Jest/pytest first.
- Add or extend Electron boundary tests for IPC or privileged behavior.
- Add a Playwright step when the risk is only visible in the real renderer,
  navigation, focus, accessibility tree, or composed UI.
- Keep selectors semantic (`role`, accessible name) rather than tied to layout.
- Add native/service scenarios to the manual checklist until they can be made
  deterministic without weakening the security boundary.
