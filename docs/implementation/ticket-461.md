# #461 — macOS traffic-light spacing

Ticket: https://github.com/haoxiang-xu/PuPu/issues/461
Parent: #208 (0.2.0), OPEN, verified direct child.
Workspace: /Users/red/Desktop/GITRepo/pupu-461
Branch: codex/ticket-461-macos-traffic-light-insets
Base: dev @ 50ddb4b866c56dedaa446edf863e6a9b12c9e7ce

## Decision / existing UI inventory

The existing native three-button group is the only adjusted component. The owner
already chose the first visual experiment: use Settings as a reference, move the
traffic lights slightly right and leave every other icon fixed. No new UI,
component alternatives or layout redesign is needed. Native window chrome is
positioned by Electron main; it is not a renderer icon.

`electron/main/window/main_window.js` has X=14 and Y=18, reused at window creation
and focus/show/resize/full-screen re-sync. Change only X to18; preserve Y=18 and
all visibility/full-screen/platform handlers. This gives equal configured top
and left insets and a four-point right shift. Actual concentric visual appearance
must be reviewed in the running macOS app; coordinate equality alone is not
claimed as visual acceptance.

## Graph / risk

Clone index refreshed from complete dev checkout before query. Named context and
upstream impact for syncDarwinTrafficLightPosition report HIGH: direct callers
scheduleDarwinTrafficLightSync and handlePlatformPresentation; upstream window
creation, service and IPC registration, eight indexed dependants. HIGH was warned
before edits. Constant impact is UNKNOWN, not LOW: literal inspection confirms
its actual use by createWindowOptions and syncDarwinTrafficLightPosition.

## Bounded implementation and checkpoint

Weaker-model assessment: suitable for the settled two-line slice. Dispatch
available gpt-6-luna to change the X constant and the existing .cjs expectation
only; it must perform upstream impact before edits and stop afterward. No new
behavior, refactor, schema, tests mirroring the constant, commit or push. The .js
test is a direct require of the .cjs suite, so both harness entrypoints inherit
the same expectation. Parent reviews the complete diff and runs existing window
lifecycle/platform tests before continuing to the instance.

## Verification / acceptance

AC-461-1: Native creation/re-sync use {x:18,y:18}; platform presentation and
window-control behavior continue passing the existing main-window tests.
AC-461-2: An actual isolated macOS instance from this clone shows the four-point
right shift. Capture the native chrome and Settings reference for owner review;
no claim of owner visual acceptance until the owner confirms.
AC-461-3: No renderer or other icon-position source changes. Verify diff scope.

Cross-boundary code gate: NOT_APPLICABLE. This changes a main-process numeric
native-chrome position only; no IPC/provider/persistence/runtime contracts or
state transitions change. Existing Electron-to-native API shape remains intact.
An instance still needs explicit runtime provenance and successful compatibility
admission; record its exact PuPu source, runtime source/artifact and manifest.
Do not modify Unchain, launch inference, stop unrelated instances, or access a
shared user profile. Keep issue OPEN/In Progress and work uncommitted for review.

## Implementation-ready checkpoint

Bounded gpt-6-luna slice reviewed by parent: exactly two changed lines (native X
14→18 and the existing .cjs expectation). The .js wrapper still directly requires
.cjs. Full main-window suite: 9 passed; diff whitespace check clean. No other
icon, renderer, runtime or control-handler source changed.

Actual instance: Electron PID7601, React PID7600, web port50423, isolated profile
/Users/red/.codex/artifacts/pupu-461/user-data. CUA confirmed the native PuPu
window at localhost:50423 and the updated chrome; initial onboarding was skipped
through its existing UI without configuring a provider. An initial Playwright
firstWindow observer timed out; its process exited, so the durable replacement
uses direct detached Electron/React processes. The replacement PID/profile and
Test API readiness were verified; no unrelated instance was stopped.

Runtime is the existing CI452 immutable wheel from e01b4fc6f27646751c4f6afd16b6241d4ea686e2,
exactly matching this dev's QA default. Wheel SHA256:
711385a1fb54f57b02aa4f11a81479763bb6ed5bef735e9e8a6b0e82d0a2f1ca.
All338 Python members were extracted unchanged into a source layout for the
existing dev resolver, with official pyproject metadata from the same revision.
The existing clone448 Python interpreter supplies dependencies read-only; its
installed runtime is superseded by the explicit verified extracted source.
Actual running getStatus reports status=ready, ready=true, memoryV2.ready=true,
runtimeProtocolVerification=runtime_protocol, imported runtime protocol digest
sha256:f96b620fca6dc3e26f84cac47c4bbd8ce5e5d43505bf63759b88a15ec5234077.
Source and wheel provenance are not used as compatibility admission. No Python
source was modified; this launch starts a fresh sidecar. No model invocation.

Owner visual acceptance remains PENDING. Leave this instance running and stop
UI manipulation for the owner's review. No commit, push, PR, audit, merge or
closure is performed by this start request. External evidence is preserved at
/Users/red/.codex/artifacts/pupu-461/.

## Owner follow-up — native fullscreen

Owner real-machine review accepted the original traffic-light placement. The
owner now explicitly authorizes only the sidebar toggle and new-chat icons to
move to the far-left existing non-traffic-light inset during native macOS
fullscreen, then restore on exit. This is the exception to the initial
other-icons-stay-fixed scope; the normal-window X18/Y18 placement stays accepted.

The current renderer always reserves90/120px for traffic lights. SideMenu owns
both buttons when open; TitleBar owns the visible sidebar toggle when closed.
Both must use the native fullscreen state, not the existing isMaximized union
(which is true for ordinary zoom as well). The wordmark and other controls do
not move. Chosen fullscreen offsets reuse existing14/44px, not edge-zero boxes.

### BC-461-1: native window → preload → renderer geometry

Producer: Electron main emitWindowState using BrowserWindow.isFullScreen().
Canonical state: the current native window lifetime; consumer is a shared
useWindowFullscreen hook through the existing windowStateBridge. State envelope
is OPEN: preserve isMaximized exactly and add boolean isFullScreen; older
consumers ignore the addition. Consumer reads only isFullScreen===true; missing
or malformed/legacy values default false and retain clearance. No new channel,
provider call, storage or context provider. Action channel extends its existing
CLOSED handled action set (close/minimize/maximize) with non-mutating get-state;
unknown actions keep no-op behavior. Subscribe before requesting a snapshot so
mount/reload inside fullscreen does not depend on a later focus event. Each
consumer unsubscribes on unmount; request routing remains the existing main
window. The exact PuPu source changes with the same reused Unchain wheel and
manifest from the ready checkpoint; no Python change or runtime rebuild.

AC-461-4: real native producer strict envelopes distinguish ordinary zoom from
fullscreen and restore false on exit; unsupported actions remain no-ops.
AC-461-5: renderer event sequences move only the named controls on darwin;
Windows/Linux/presentation overrides and ordinary zoom retain their geometry.
AC-461-6: native fullscreen → exit → repeat, with sidebar open and closed, plus
renderer reload while fullscreen, keeps correct geometry and cleanup.

### SEQ-461-1

Identity is the live native window and each mounted renderer subscriber, not a
persisted chat/run. Windowed→native fullscreen→windowed→repeat broadcasts the
current boolean; mounting/reloading requests a fresh get-state snapshot. Sidebar
open/close switches consumer without losing geometry; unknown/missing payload
fails closed to normal clearance. No persistence, retry/resume, provider,
interaction or sidecar restart transitions change, so those cells are N/A.
Actual fullscreen validation uses the isolated #461 instance with the same
verified runtime, with DOM coordinates and owner visual review separate.

### Bounded implementation / strong checkpoint

Partially suitable: parent settles and implements main-process producer/action
and strict native-envelope regression. gpt-6-luna implements only the shared
renderer hook, two existing consumers, and meaningful enter/exit/zoom/platform/
cleanup regression tests. Worker performs impacts before existing-symbol edits,
records UNKNOWN confirmation, and stops for parent diff/test review. No commits,
pushes or source outside that slice. User already selected this behavior; no new
UI options or product decision is pending.

### Fullscreen implementation-ready checkpoint

Parent reviewed the complete producer/hook/consumer diff. A renderer test-fixture
issue was corrected during review: the TitleBar and WindowControls subscribers
must be independent, so the mock now broadcasts through a Set and removes only
the unsubscribed callback. The native test invokes every matching lifecycle
listener, including both leave-full-screen listeners. Final root-run results:
main-window suite10passed; four renderer suites26passed, including hook snapshot/
cleanup, native-fullscreen versus zoom, platform presentation, and existing
sidebar-handler stability. Whitespace check clean. No additional icon moved.

The old preview Electron PID7601 was gracefully quit and replaced by PID44306
from this clone, retaining React PID7600/port50423 and the isolated profile.
The main-process change is therefore actually loaded. The exact unchanged wheel
and runtime manifest above were admitted again: ready=true, memoryReady=true,
digest sha256:f96b620fca6dc3e26f84cac47c4bbd8ce5e5d43505bf63759b88a15ec5234077.

Actual macOS validation used the app's native View → Toggle Full Screen menu,
not a CSS viewport simulation. Read-only get-state snapshots through the real
preload bridge confirmed windowed false with90/120px; fullscreen true with
14/44px; fullscreen sidebar closed with visible TitleBar toggle14px; exit with
toggle90px; repeat entry with14/44px; renderer reload while still fullscreen
with14/44px. Wordmark remained125px throughout. CUA screenshots confirmed the
visible leading controls, closed-sidebar path, and final open-sidebar fullscreen
preview. The per-mount snapshot fixes reload initialization without waiting for
an unrelated focus event. The optional fresh-profile setup overlay was dismissed
through its existing UI. No chat/provider/model request was sent.

Evidence: /Users/red/.codex/artifacts/pupu-461/fullscreen-native-green-final.log,
fullscreen-frontend-final.log, windowed-open.json, fullscreen-open.json,
fullscreen-closed.json, windowed-closed.json, fullscreen-repeat.json, and
fullscreen-reloaded.json. Original numeric placement is owner-accepted; this
fullscreen follow-up is implementation-verified and awaits owner visual review.
Keep the updated preview running. Issue remains OPEN/In Progress; no commit,
push, PR, merge or closure yet.
