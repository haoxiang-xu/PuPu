# Deterministic Release Promotion

This is the v0.1.10 promotion path. It separates building, testing, staging,
and publishing so a public release can never be rebuilt or renamed after it has
been qualified.

## One-time GitHub setup

Create these GitHub Environments before attempting a release:

| Environment | Purpose | Required configuration |
| --- | --- | --- |
| `release-signing` | Signed candidate packages | Required reviewers; environment-scoped `CSC_LINK`, `CSC_KEY_PASSWORD`, Windows certificate/password when separate, and one supported Apple notarization credential set. |
| `release-stage` | Draft Release creation | Required reviewers. |
| `release-publish` | Public release state transition | Required reviewers; use a stricter approval policy than stage. |
| `release-qualification` | One-time bootstrap operator gate | Reviewer `haoxiang-xu`; no secrets; exact `v0.1.10` tag only. |

Keep signing credentials in `release-signing`, not in source files, workflow
inputs, logs, or an LLM prompt. The deterministic path does not require an
OpenAI, Anthropic, Copilot, Codex, or Claude key. Any optional analysis step is
advisory and cannot gate stage or publish.

## RC validation lane (not promotion)

Use `vX.Y.Z-rc.N` only to validate a release candidate before the final stable
tag, where `N` is a positive decimal integer without leading zeroes. The
checked-in `package.json` at the tag remains the stable base `X.Y.Z`; build
preparation stamps the isolated runner copy of `package.json` and its lockfile
to `X.Y.Z-rc.N` without committing that temporary change. The tag, effective
package version, generated package metadata, sealed manifest version, and
public-style artifact filenames must all carry the same full `X.Y.Z-rc.N`
identity. The manifest tag remains `vX.Y.Z-rc.N`.

macOS is the only explicit native projection: both
`CFBundleShortVersionString` and electron-builder `buildVersion` (emitted as
`CFBundleVersion`) use the numeric base `X.Y.Z`, while the package, manifest,
filenames, tag, commit, Actions run ID, and manifest digest retain and bind the
full RC identity. This projection must not make an RC artifact admissible as
the stable `X.Y.Z` release.

An RC run may build and sign the four release targets and run fresh-installed
qualification on macOS arm64, macOS x64, Windows x64, and Linux x64. That
qualification produces the generic `pupu.release-qualification.v1` receipt.
It deliberately omits restart-update evidence and is never promotion-eligible:
Stage, Publish, and README rendering must reject the RC tag and its receipt
before any Draft Release, public Release, asset, or documentation PR is
created or changed.

Treat every pushed RC tag as immutable. If validation finds a defect, create a
new commit and increment the suffix (`rc.1` → `rc.2`); never force-move or reuse
an existing RC tag. The final `vX.Y.Z` stable tag must use package version
`X.Y.Z`, build a new sealed candidate, and complete the stable qualification
path. RC candidate bytes, run IDs, reports, and receipts cannot be reused to
stage or publish the stable release.

## Candidate to public release

1. Create and push the final `vX.Y.Z` tag only after its `package.json` version
   is `X.Y.Z`.
2. From that tag, manually dispatch **Release QA** with
   `qa_mode=release-candidate` and a full 40-character lowercase Unchain source
   revision. It waits for `release-signing` approval, builds the four v0.1.10
   targets, and uses `--publish never` for every electron-builder invocation.
3. Record the successful Actions run ID. Its `pupu-release-candidate` artifact
   contains the exact packages, updater YAML, machine-readable manifest, and
   release QA report. The manifest and report both carry that same decimal
   Actions run ID; the stage workflow also verifies that its source was a
   successful manual `Release QA` run for the exact tag commit.
4. Run the qualification path selected by the release identity:
   - for the one-time `v0.1.10` modern baseline, dispatch
     `.github/workflows/release-bootstrap-qualification.yml` from the exact tag,
     enter `BOOTSTRAP_V0_1_10`, and require all four fresh-installed targets;
     its closed receipt records restart update as `NOT_RUN` and cannot be reused
     for another tag;
   - for every later normal release, dispatch
     `.github/workflows/release-qualification.yml` with an explicit lower modern
     `from_tag` and require the complete fresh-install plus restart-update receipt.
   The candidate and qualification run IDs must be distinct, and the receipt
   schema selects exactly one admissible workflow path.
5. Dispatch **Stage Verified Release Candidate** with the candidate run ID, tag,
   and the distinct qualification run ID. It re-downloads and hashes every
   asset, recomputes every updater SHA-512, and verifies Actions-run provenance
   before it creates or updates a Draft Release. If any asset is missing,
   renamed, extra, stale, or has different bytes, it stops.
6. Review the Draft Release assets and notes. Dispatch **Publish Verified Draft
   Release**, enter `PUBLISH`, and approve the `release-publish` Environment.
   This job re-verifies the Draft assets and changes only the Draft flag; it does
   not build or upload anything.
7. After publication, the same publish run calls the README workflow. It
   re-downloads the Release, verifies its manifest again, and opens a
   documentation PR with download URLs rendered from the manifest. The README
   workflow is also manually dispatchable only as a recovery path; provide the
   published release tag explicitly.

## Asset contract

v0.1.10 requires macOS `arm64` and `x64`, Windows `x64`, and Linux `x64`.
Windows/Linux `arm64` are explicit reserved entries for #222/v0.2.0, not missing
v0.1.10 assets. Public filenames use only `arm64` and `x64`; never infer or
substitute `intel` or `amd64`.

macOS publishes both DMG and ZIP update payloads, Windows publishes its NSIS
installer, and Linux publishes AppImage and Debian packages. The manifest also
requires a combined `latest-mac.yml` and Windows `latest.yml`. Linux build
configuration sets `publish: null`, so it does not generate or publish updater
metadata. Linux downloads are supported, but in-app Linux updating is
intentionally not claimed until #200 ships its updater work.

The package gate rejects every unexpected top-level output. Its small allowlist
contains only known non-public builder support files (for example a macOS DMG
blockmap and builder configuration evidence); those files never enter the sealed
manifest or a Draft Release.

## Windows note

The workflow builds on a GitHub-hosted Windows runner and verifies the final NSIS
installer with `Get-AuthenticodeSignature`; it does not rely on an operator
opening an Administrator Command Prompt. If a self-hosted runner is introduced,
its certificate-store and installer privileges must be validated separately
before it is allowed in the `release-signing` Environment.
