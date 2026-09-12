# Platform Presentation (development only)

> Present the running dev build's UI as macOS, Windows or Linux without
> rebuilding or booting another OS. Issue #256.

PuPu draws part of its own window chrome and spaces things around the host's
controls: on macOS the native traffic lights stay and the sidebar / title-bar
controls step right of them; on Windows and Linux PuPu draws a
minimize / maximize / close cluster at the top right. A few other surfaces
branch the same way (⌘ vs Ctrl hints, full-screen padding under the traffic
lights, the boot overlay's close affordance).

## Using it

Settings → Developer → **Platform presentation**: System (this machine),
macOS, Windows, Linux. The choice applies at once, without a reload, and is
kept across restarts. Pick System to follow the host again.

- On a macOS host presenting Windows or Linux, the native traffic lights are
  hidden and the drawn cluster appears; the cluster's maximize button
  maximizes the window (the way it does there) instead of entering
  full-screen. Back on macOS the lights return at PuPu's position at once —
  showing them again puts them at Electron's default spot, so main
  re-applies the position in the same call and once more a beat later.
- Windows draws its flat 40×30 tiles (red close on hover); Linux draws
  GNOME's headerbar buttons — three 24px circles on a faint wash, 8px
  apart, minimize · maximize · close, with Adwaita's symbolic glyphs
  (`linux_*_button` icons) and no special close colour.
- On a Windows or Linux host presenting macOS, the drawn cluster goes and
  the traffic-light gap is left empty — nothing native can be drawn there.

The row exists only in the development Electron runtime, like the rest of
the Developer section. A production bundle compiles the override away
(`process.env.NODE_ENV === "production"`), and the main process ignores the
message when the app is packaged, so a persisted record can never change a
shipped build.

## How it works

`src/SERVICEs/platform_presentation.js` is the one reader of "which platform
is this": `getHostPlatform()` (what preload reports in `window.osInfo`),
`readPlatformOverride()` / `writePlatformOverride()` (settings namespace
`dev`, key `platform_override`, one of `darwin | win32 | linux`), and
`getPresentationPlatform()` — the override when allowed, else the host.
Components read it through `usePresentationPlatform()`
(`BUILTIN_COMPONENTs/mini_react/`), a `useSyncExternalStore` over the settings
subscription, so every platform-conditional surface re-renders when the
override changes. Nothing in `src/` reads `window.osInfo` directly any more.

The native side follows through one IPC message (BC-256 in the plan):
`windowStateBridge.setPlatformPresentation(platform | null)` →
`window-state-set-presentation` → main `handlePlatformPresentation`. Main
keeps the value in memory only; `EnvironmentProvider` sends the current
override on mount and on every change, so a restart with an override kept
re-establishes it. Anything but the three names or `null` is ignored.

## Key files

| File | Role |
|------|------|
| `src/SERVICEs/platform_presentation.js` | Host, override record, presentation, subscription |
| `src/BUILTIN_COMPONENTs/mini_react/use_presentation_platform.js` | The hook every surface uses |
| `src/COMPONENTs/settings/dev/index.js` | The Developer row |
| `src/CONTAINERs/config/container.js` | Sends the presentation to main (mount + change) |
| `src/SERVICEs/bridges/window_state_bridge.js`, `electron/preload/bridges/window_state_bridge.js` | The bridge method |
| `electron/main/window/main_window.js` | Hides/shows traffic lights, maximize semantics |
| `docs/plans/issue-256-platform-presentation.md` | BC-256 / SEQ-256 / acceptance |
