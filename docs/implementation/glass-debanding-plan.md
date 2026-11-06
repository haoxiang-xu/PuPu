# Glass and shadow debanding — PuPu / Mini UI

## Final scope

Reduce visible colour steps in context menus, translucent sidebars, floating
inputs, startup artwork, Agent Builder panels and shared control shadows while
preserving theme colours, transparency, layout, focus and pointer behaviour.
No dependency, IPC, persistence, runtime, installed package or production build
changes are included.

The PuPu patch targets `dev` at `333643e8`. The latest layout uses RecipesPage
for the left Agent Builder panel and FloatingDetailShell for the shared right
panel; both use the glass compositor. Mini UI targets `main`, and includes the
ContextMenu component needed by this sync without importing unrelated local
UI backports. The original working copies contain other work and are not the
PR branches.

## Rendering

- `surface_dither.js`: static device-scale monochrome texture for native
  surface fallback and full-strength artwork.
- `surface_composite.js`: Chromium SVG sRGB blur, saturation and tint followed
  by a sub-LSB threshold in the final composite. Existing colours, alpha,
  blur radius and saturation are retained. Mini UI's two identical input
  tints combine as `1 - (1 - alpha)^2` on this path.
- `composited_background.js`: native source blur plus final artwork strength
  over the page colour. Boot remains at blur 44px and strength 0.32. Source
  readiness/fade does not remount the canvas or apply opacity twice.
- `shadow_surface.js`: keeps the native element/ref/events and adds an inert
  SVG sibling anchored to its box. SVG alpha dithering is confined to the
  outer shadow, with the owner shape cut out. Original offsets, blur, spread,
  colour and inset borders are retained. Tooltip passes its arrow path and
  native drop-shadow fallback. No filter wraps foreground text or glass.

Shadow contrast is estimated from ancestor colours/gradient stops and the
current theme. This permits cached shadow drawing without per-frame backdrop
capture. It is an estimate on arbitrary image backdrops, not exact pixel
sampling. Uniform pixel/percentage/elliptical radii are supported. Unresolved
colours/shapes, nonuniform corners, custom filters, scaled/rotated/fading hosts,
large filter bounds and unsupported engines retain native shadows. Insets and
nonblurred borders stay native. Native SVG and CSS antialiasing can differ at
border/arrow pixels; unchanged interior content is checked separately.

A per-shadow backdrop-sampling prototype was rejected: 19 shadows increased
median frame time from 8.3ms to 108ms. The shipped independent SVG restores
8.3ms median and has no per-frame backdrop reads or animated noise.

## BC-001 — checked-in shared source copies

Producer: the shared material JavaScript sources. Consumers: the matching
PuPu and Mini UI source bundles, React, Chromium SVG/CSS/PNG decoders.
Boundary: source copied across repositories, not a runtime wire protocol.

Canonical representation: byte-identical `surface_dither`, `surface_composite`,
`composited_background`, `shadow_surface` modules and their three test files.
Admission is CLOSED: unsupported CSS colour/filter/shadow grammar keeps native
rendering; source bytes must match across repositories. The public components'
props, native refs and events are preserved. Source identity is SHA-256; no
schema negotiation or persisted identity exists. No global stylesheet or
storage write is added.

Exact deployed artifact pair: NOT_APPLICABLE. These PRs validate source bundles
from both candidate worktrees; they do not replace an installed PuPu or Unchain
wheel and do not authorize release rollout. Runtime manifests, provider/wheel
identity and sidecar restart/replay are unaffected.

- AC-001: exact shared-source byte/hash equality and actual-component fixture
  bundles from each candidate checkout. Negative cases cover unsupported
  engines, colour/filter/shadow syntax and native fallback.
- AC-002: frozen before/after glass ramps and genuine components in both
  themes at 1x/2x; reduce low-frequency ramp error without increased grain.
  Preserve colours, blur edges, startup source fade and canvas identity.
- AC-003: shadow profiles on backgrounds 18/60/240; record mean drift and grain
  separately. Genuine menu/input interiors must be pixel-identical when only
  shadow composition is toggled. Isolate the antialiased border from exterior
  shadow measurements. Keyboard selection, text input and button refs/focus
  must work with composition active.
- AC-004: scroll/clip, resize, hide/reopen, circle/tooltip shape, observer
  cleanup, both Electron engines and a 19-shadow moving-background smoke test.
  Existing affected component suites must pass.

## Lifecycle sequences

SEQ-001 / AC-001–004: source identity is component instance/useId. Mount → theme
preview/commit → resize/display-scale change → hide → reopen → unmount.
Observers/listeners are released on disable/unmount; restored native rendering
keeps the same DOM element and ref. Repeat open/close does not add handlers.

SEQ-002 / AC-002: startup unready → ready/fade → hidden → visible → unmount.
The canvas stays mounted through compositor changes; final tint is constant
through source fade. Agent Builder panels retain collapse/reopen behaviour.

SEQ-003 / AC-003–004: scroll inside a clipped ancestor → resize the owner →
hide/reopen. Anchor geometry follows the original element; expanded shadow
bounds do not increase scroll extents and pixels outside the clip stay unchanged.

Chat attempt/interaction counts, retry/durable resume, cold sidecar restart,
normal/graph/subagent paths and provider changes: NOT_APPLICABLE. They cannot
change these source-only rendering contracts or introduce durable state.

## Validation evidence

- PuPu: 69 CRA suites / 1,049 tests. Mini UI: 25 suites / 266 tests. All pass.
  Includes shared fallback/active lifecycle tests, menus/selects, inputs,
  sidebar/Builder, memory panels, tooltips, composer, dialogs and focus.
- Earlier glass source validation in Electron 40.8.5 and 43.8.3: sidebar/input
  ramp error reduced 59.9–69.9%, menu 44.6–80.0%, artwork 44.0–62.1%, Agent
  panels 63.2–68.8%. Grain RMS decreased in those ramp comparisons. Actual
  component colour/fade comparisons and keyboard tests also passed.
- Final independent shadow on a uniform dark background: row-averaged shades
  increased 7 → 76, grain RMS 0.281/255, mean change -0.009/255. Backgrounds
  60/240: grain RMS 0.302/0.378, mean changes -0.051/-0.512 per 255. This
  establishes reduced banding, not universally band-free output.
- Chromium geometry sequence: identical native/composited owner rectangles and
  scroll extents across all five steps; zero changed pixels outside the clip.
  Real Tooltip arrows, circular shadows and native Button refs/focus/click pass
  in both repositories and themes.
- 19-shadow moving-background smoke test: median 8.3ms before/after, p95 below
  10ms, no intervals over 25ms in either 170-frame sample. Local machine only.
- Evidence, measurements, screenshots and executable renderer harnesses are
  retained locally under `.codex/artifacts/pupu-blur-20261106/` (outside Git).
  Fixture builds import candidate source; they are not production packages.

## Impact review

GitNexus upstream impact was run before editing both repositories. Shared Input
and Select were CRITICAL; Modal/Switch and Mini UI Slider/Button were HIGH;
other component symbols were mostly UNKNOWN because JSX caller edges were not
resolved. These warnings were reported before editing. Text references confirm
menu/composer/Builder/dialog consumers and the demo/docs consumers in Mini UI.
UNKNOWN is not interpreted as low risk. The broad host substitutions preserve
native tags, attributes and handlers; source and renderer regressions above
cover the relevant interactions.


Final candidate checks (2026-11-06):
- Electron 40.8.5 and 43.8.3, both themes/repositories: actual menu/input
  interiors remain pixel-identical; exterior shadow mean drift <0.66/255,
  peak <=4/255. High-density border fringe was fixed with a vector mask
  applied after the shadow filter; border peak <=3/255.
- GitNexus structured `detect_changes(scope=all)` on each staged PR worktree:
  PuPu 69 files / 121 changed symbols / 389–400 reported processes across repeated runs; Mini UI 62
  files / 145 symbols / 76 processes. Both aggregate risks are CRITICAL.
  Neither result has partial/truncated/error flags; full results were saved.
  PuPu's FTS search-index repair failed separately; diff/graph traversal
  completed without using FTS, so this is not a clean FTS-health claim.

Shared candidate source identities (SHA-256):

- `surface_dither.js`: `a8e3c16aaa6de21811ffe2a85cab4f3b1215477cf38115160b901b83066873e2`
- `surface_composite.js`: `15d7923e4303d56c64e1259d86ed59fa13ab9de460a6cefa3657770c8382ebc7`
- `composited_background.js`: `3a16c542d1307b835e8360bf1439a78b3c18006934014f031720edbf7b42cd2a`
- `shadow_surface.js`: `9e87af0a5d157642c9d5dd848f1ba6011acc296afd96f2dd648f231948dc8d67`
