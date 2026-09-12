# Issue #256 — Dev option: present the UI as another platform

> Direct implementation plan. Release parent: #203. Status: implementing (2026-09-12).

## What the project owner asked for

A development-only switch that makes the running app present its UI as macOS,
Windows or Linux, so platform-conditional surfaces can be inspected from the
machine at hand. Production builds always follow the real platform.

## Where the platform is read today

Renderer, all reading `window.osInfo.platform` (preload, `process.platform`):

| Site | What it decides |
|------|-----------------|
| `BUILTIN_COMPONENTs/electron/title_bar.js` | darwin: no drawn controls, left offsets for the traffic lights; else: Windows-style min/max/close cluster |
| `COMPONENTs/side-menu/side_menu.js` | left offsets of the sidebar's top controls under the traffic lights |
| `COMPONENTs/boot-overlay/boot_overlay.js` | darwin hides the overlay's own close affordance |
| `COMPONENTs/agents/pages/recipes_page.js`, `recipe_canvas.js` | traffic-light padding in fullscreen; ⌘ vs Ctrl hints |
| `COMPONENTs/ui-testing/ui_testing_modal.js` | traffic-light padding in fullscreen |

Main process (`electron/main/window/main_window.js`): darwin shows and
positions the native traffic lights on every show/focus/resize; "maximize"
means full-screen on darwin and maximize elsewhere.

## Design

- **One reader.** `src/SERVICEs/platform_presentation.js`: `getHostPlatform()`
  (what preload reports), `readPlatformOverride()` / `writePlatformOverride()`
  (settings namespace `dev`, key `platform_override`, one of
  `darwin | win32 | linux` or absent), `getPresentationPlatform()` = the
  override when it is allowed, else the host. The override is allowed only
  when `process.env.NODE_ENV !== "production"` **and** the renderer runs in
  Electron — a production bundle compiles the check away, so no persisted
  record can ever change a shipped build. `subscribePresentationPlatform`
  follows the settings subscription; the hook
  `usePresentationPlatform` (`BUILTIN_COMPONENTs/mini_react/`) is
  `useSyncExternalStore` over it. Every site above switches to it, so the
  presentation flips live without a reload.
- **Native chrome follows.** The renderer tells main the presentation
  (new IPC send channel `WINDOW_STATE.SET_PRESENTATION`, preload
  `windowStateAPI.setPlatformPresentation`). On a darwin host main hides the
  native traffic lights while the presentation is not darwin (and keeps them
  hidden through its own re-sync), and lets "maximize" maximize instead of
  going full-screen. Main ignores the message when `app.isPackaged`. On
  win32/linux hosts presenting darwin nothing native changes (the controls
  are drawn by the renderer); the traffic-light gap is just empty.
- **Dev settings row.** Settings → Developer → "Platform presentation":
  a BUILTIN `Select` with System / macOS / Windows / Linux. The row lives in
  the section that already exists only in development.
- **Re-apply on boot.** `EnvironmentProvider` sends the current presentation
  to main on mount and on every change, so a restart with an override kept
  still presents that platform (and main's traffic lights follow).

## Cross-boundary gate

**BC-256 — renderer → main, platform presentation.**
Producer: renderer (`windowStateBridge.setPlatformPresentation`). Consumer:
main `handlePlatformPresentation`. Transport: IPC send
`window-state-set-presentation`. Wire shape: one string, `"darwin" | "win32"
| "linux"`, or `null` (= follow the host). Admission `CLOSED`: any other
value is ignored (no-op, nothing thrown). Packaged app: ignored regardless of
value (production follows the real platform). No persistence on the main side;
the renderer's settings record is the only durable state. Version: none —
the channel name is the identity; the preload allowlist and the main
registration are checked for parity by `ipc_channels.test.cjs`.

**SEQ-256 — restart with an override kept.**
1. dev, darwin host, override `win32` written → renderer presents Windows,
   main hides traffic lights, "maximize" maximizes.
2. Restart: renderer reads the override, presents Windows on first paint,
   `EnvironmentProvider` re-sends `win32` → traffic lights hidden again.
3. Override cleared → renderer presents darwin, main shows traffic lights,
   "maximize" goes full-screen.
4. Packaged build with the same record: presentation = host; main ignores
   any message.

## Acceptance

| id | check |
|----|-------|
| AC-256-1 | `getPresentationPlatform()` returns the override in dev/Electron and the host otherwise; unknown override values read as "none" |
| AC-256-2 | with `NODE_ENV=production` the override is never applied, whatever the record says |
| AC-256-3 | title bar draws the Windows control cluster and Windows offsets when presenting win32 on a darwin host, and the darwin layout when presenting darwin on a win32 host |
| AC-256-4 | main on darwin: presentation win32 → `setWindowButtonVisibility(false)`, re-sync keeps them hidden, "maximize" maximizes; presentation darwin/null → visible again, "maximize" full-screens; unknown value → no-op; packaged → no-op |
| AC-256-5 | channel parity: preload send allowlist ⊆ main registered channels |
| AC-256-6 | Settings → Developer shows the row only in development; picking a platform writes the record and the UI follows without reload (in-app) |
| AC-256-7 | i18n: new keys in all 11 locales |

## Status matrix (cross-boundary baseline)

1–8 of the PuPu sequence baseline: N/A — the change never touches chat,
interaction, retry, resume, sidecar or provider paths. Applicable cells are
SEQ-256 steps 1–4 (1–3 driven in-app, 4 by unit test).

## Addendum — the lights must come back where they belong

Project owner (2026-09-12): without a reload the macOS traffic lights came
back at the wrong place. `setWindowButtonVisibility(true)` shows them at
Electron's default position; the position was only re-applied by the next
focus/resize re-sync. `handlePlatformPresentation` now runs the darwin sync
itself (hide, or show + place) and schedules the delayed one as well; covered
by the main_window test (position asserted right after the switch, before
any focus).

## Addendum — Linux gets its own controls

Project owner (2026-09-12): the Linux presentation must look like Linux, not
Windows. The title bar now picks an icon set and a button style per
presented platform: Windows keeps the flat tiles; Linux draws GNOME /
libadwaita headerbar buttons (24px circles, alpha .10 / .16 hover / .26
active, 8px gap, right inset 12) with four new symbolic glyphs in the icon
manifest (`linux_close|maximize|minimize|restore_button`). Buttons carry
aria-labels now. Test: `title_bar.test.js` "draws Linux controls the GNOME
way".
