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
npm run build:electron:mac
npm run build:electron:mac:intel
```

Unsigned local-only builds:

```bash
npm run build:electron:mac:unsigned
npm run build:electron:mac:intel:unsigned
```

Use the unsigned variants only for local packaging tests. Do not publish those
artifacts as normal macOS releases.
