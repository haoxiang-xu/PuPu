# macOS Release Signing

PuPu uses `electron-updater` for in-app updates on macOS and Windows.

For macOS release builds, code signing is required. Unsigned or ad-hoc builds
may run locally, but they are not suitable for normal distribution and
in-app auto update will not work reliably.

## What you need

1. An Apple Developer Program membership.
2. Xcode installed on a Mac.
3. A `Developer ID Application` certificate installed in your login keychain.
4. Notarization credentials for Apple.

Check whether your Mac already has a usable signing identity:

```bash
security find-identity -v -p codesigning
```

For local release signing, `electron-builder` can use a valid identity already
installed in Keychain.

For CI signing, export your certificate as a `.p12` file and provide:

```bash
CSC_LINK
CSC_KEY_PASSWORD
```

For notarization, provide one of these credential sets:

```bash
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

or

```bash
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

## Build commands

Signed release builds:

```bash
npm run build:electron:mac:release
npm run build:electron:mac:intel:release
```

These commands force code signing and always include `--publish never`. They
create a candidate only; GitHub's stage/publish workflows are the only path that
may upload it to a Release.

Unsigned local-only builds:

```bash
npm run build:electron:mac:unsigned
npm run build:electron:mac:intel:unsigned
```

Use the unsigned variants only for local packaging tests. Do not publish those
artifacts as normal macOS releases.

## GitHub release candidate

For the protected `release-signing` Environment, configure `CSC_LINK` and
`CSC_KEY_PASSWORD`, plus one of the notarization credential sets above. A manual
`Release QA` run in `release-candidate` mode must target an existing version tag
and use a full immutable Unchain revision. It produces both canonical Mac
artifacts:

```text
PuPu-<version>-macos-arm64.dmg / .zip / .zip.blockmap
PuPu-<version>-macos-x64.dmg   / .zip / .zip.blockmap
```

The final release has one `latest-mac.yml` containing both ZIP payloads. Do not
hand-edit or rename it: the sealed release manifest validates the architecture,
hashes, and updater references before staging and publishing. In CI these macOS
credentials are exposed only to the macOS candidate credential/build steps;
they are not inherited by Linux, Windows, sidecar, or plugin smoke steps.
