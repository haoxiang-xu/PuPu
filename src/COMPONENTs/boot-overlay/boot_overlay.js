import { useEffect, useRef, useState, useContext } from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import ShaderBlobBackground from "../../BUILTIN_COMPONENTs/background/shader_blob_background/shader_blob_background";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { deriveBlobScene } from "./derive_blob_palette";
import bootProgress from "../../SERVICEs/boot_progress";
import * as bootReadiness from "../../SERVICEs/boot_readiness";

/* Semantic default accent — only hit if ConfigContext hasn't resolved yet. */
const FALLBACK_ACCENT = "#65c466";
const FALLBACK_BG = { light_mode: "#ffffff", dark_mode: "#121212" };

const EXIT_MS = 240;

/* Shared muted level for every secondary line on this screen (status + failure
   copy). 0.75, not lower: at 0.55 this failed WCAG AA on 8 of the 9 light
   presets, worst case 3.08:1. */
const MUTED_OPACITY = 0.75;

/* i18n keys for the closed-gate phases. Deliberately vague about mechanism —
   "unchain sidecar" and "MCP" mean nothing to a user; "plugins" is the shipped
   product name for what MCP toolkits are. */
const PHASE_TEXT_KEY = {
  starting_runtime: "boot.starting_runtime",
  starting_mcp: "boot.starting_mcp",
};

/* Failure codes main can emit. Anything outside this set resolves to the
   generic copy rather than rendering a raw identifier at the user. MUST stay in
   sync with FAILURE_CODES in electron/main/services/boot_readiness/service.js
   and with the boot.failure.* keys in every locale. */
const FAILURE_TEXT_KEY = {
  unchain_runtime_not_found: "boot.failure.unchain_runtime_not_found",
  unchain_runtime_failed: "boot.failure.unchain_runtime_failed",
  mcp_environment_unavailable: "boot.failure.mcp_environment_unavailable",
};

/**
 * BootOverlay
 *
 * Full-screen boot gate. Takes over the static #boot-overlay shell on mount,
 * then owns rendering from bootProgress.subscribe(). Solid theme-colored
 * ground with a faint blurred 3D torus field as the loading indicator.
 *
 * READY means every gate is satisfied: the chat page reached its first screen
 * AND the local backend (sidecar + MCP environment) is up. It is no longer a
 * timer — nothing here dismisses on a clock, because a timeout is not evidence
 * that the backend came up. Once ready, a centered "Click anywhere to start"
 * prompt fades in, the whole overlay becomes clickable, and clicking (or
 * Enter/Space) fades it out and unmounts. The user always drives the final step.
 *
 * While the gate is closed the overlay explains itself rather than sitting
 * mute: a real progress bar the whole time, what it is waiting for after 4s,
 * an admission of slowness at ~22s, and a failure plus retry control if main
 * escalates. Retry never opens the gate — it only asks main to restart.
 *
 * IT IS A MODAL BARRIER, NOT A PICTURE. Covering the app visually is not enough:
 * the tree underneath is live, focusable and listening. So this component also
 * traps focus (otherwise Tab walks into the invisible chat composer and typing
 * lands silently in a persisted draft) and swallows Escape (BUILTIN Modal binds
 * it at WINDOW level, so a first-run user could dismiss a setup wizard they have
 * never seen). Both are load-bearing, not defensive noise.
 */
const BootOverlay = () => {
  const { theme, onThemeMode } = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const [state, setState] = useState(() => bootProgress.getState());
  const [readiness, setReadiness] = useState(() => bootReadiness.getState());
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const rootRef = useRef(null);
  const retryWrapRef = useRef(null);

  useEffect(() => {
    bootProgress.takeOver();
    return bootProgress.subscribe(setState);
  }, []);

  useEffect(() => {
    const unsubscribe = bootReadiness.subscribe(setReadiness);
    // Idempotent — safe under StrictMode's double-invoked effects.
    bootReadiness.start();
    return unsubscribe;
  }, []);

  const ready = state.ready;
  const failure = readiness.failure;
  const showFailure = Boolean(failure) && !ready;
  const phaseKey = PHASE_TEXT_KEY[readiness.phase];
  /* Three-stage wait: the phase line first, then an admission of slowness. */
  const statusKey = readiness.slow ? "boot.taking_longer" : phaseKey;
  const statusText = !showFailure && statusKey ? t(statusKey) : "";
  // Stay quiet for the first few seconds: on a warm start the gate opens fast
  // enough that a status line would only flash.
  const showStatus = !ready && readiness.showStatus && Boolean(statusText);
  const retrying = readiness.retrying === true;

  const accent = theme?.semantic?.accent || FALLBACK_ACCENT;
  const background =
    theme?.semantic?.background ||
    (isDark ? FALLBACK_BG.dark_mode : FALLBACK_BG.light_mode);
  const blobScene = deriveBlobScene(accent, background, isDark);

  const handleEnter = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => setDismissed(true), EXIT_MS);
  };

  const handleRetry = (e) => {
    // The root is the click-to-start target once ready; while a failure is up
    // it is not, but stop propagation anyway so the retry can never double as
    // an "enter the app" click.
    e?.stopPropagation?.();
    // Re-entrancy guard. The button stays ENABLED while retrying (a disabled
    // button drops keyboard focus to <body> and is never announced), so the
    // guard has to live here rather than in a `disabled` prop.
    if (retrying) return;
    bootReadiness.retry();
  };

  /* FOCUS TRAP. The overlay stops the mouse but not the Tab key: without this,
     focus walks into the chat composer hidden underneath and every keystroke is
     persisted into a draft the user cannot see. Implemented as a focusin guard
     rather than `inert` on siblings because BUILTIN Modal renders through a
     PORTAL to document.body — outside this component's subtree entirely, where
     a sibling-scoped `inert` would never reach it. */
  useEffect(() => {
    // Released the moment the user commits to entering: during the exit fade
    // the app underneath is the rightful owner of focus.
    if (dismissed || exiting) return undefined;
    const onFocusIn = (event) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target)) return;
      root.focus();
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [dismissed, exiting]);

  /* ESCAPE SWALLOW. BUILTIN Modal binds Escape on WINDOW (modal.js), so neither
     a focus trap nor `inert` can stop it — on first run InitSetupModal mounts
     underneath this overlay and one Escape silently dismisses a setup wizard the
     user has never seen. Capture phase on window is the only place that runs
     before it. Scoped to Escape on purpose: swallowing every key would also kill
     the Retry button's own keyboard activation. */
  useEffect(() => {
    if (dismissed || exiting) return undefined;
    const onKeyDownCapture = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [dismissed, exiting]);

  /* Move focus to whatever is actionable. Without this the user must Tab once
     before Enter/Space can start the app, and the failure card's retry is
     reachable only by hunting for it. */
  useEffect(() => {
    if (dismissed) return;
    if (showFailure) {
      // Button is a shared primitive with no ref forwarding and no focus state
      // of its own; reach its DOM node through the wrapper rather than editing it.
      retryWrapRef.current?.querySelector("button")?.focus();
      return;
    }
    if (ready) rootRef.current?.focus();
  }, [ready, showFailure, dismissed]);

  if (dismissed) return null;

  /* Muted foreground for the status/failure copy. Derived from the resolved
     theme so it reads on whatever ground the boot palette picked. */
  const mutedText = theme?.semantic?.text || (isDark ? "#e8e8e8" : "#1c1c1c");
  const trackColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const isMac =
    typeof window !== "undefined" && window.osInfo?.platform === "darwin";

  const startLabel = t("boot.click_to_start");

  const rootStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    background,
    opacity: exiting ? 0 : 1,
    transition: `opacity ${EXIT_MS}ms ease`,
    /* Stays "auto" through the exit fade. Dropping to "none" here let the
       second click of a double-click punch through to whatever was underneath
       — on first run, the middle of InitSetupModal. The node is unmounted at
       the end of the fade, which is when it should stop taking input. */
    pointerEvents: "auto",
    cursor: ready ? "pointer" : "default",
  };

  const onRootKeyDown = (e) => {
    if (ready && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleEnter();
    }
  };

  return (
    <div
      ref={rootRef}
      role={ready ? "button" : "presentation"}
      aria-label={ready ? startLabel : undefined}
      /* Always programmatically focusable so the focus trap has somewhere to
         park focus; only in the tab order once it is a real control. */
      tabIndex={ready ? 0 : -1}
      onClick={ready ? handleEnter : undefined}
      onKeyDown={ready ? onRootKeyDown : undefined}
      style={rootStyle}
    >
      {/* faint blurred 3D torus field, theme-derived, ambient only */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          filter: "blur(44px)",
          opacity: 0.32,
          pointerEvents: "none",
        }}
      >
        <ShaderBlobBackground
          colors={blobScene.colors}
          shape="torus"
          count={3}
          edge="smooth"
          smooth={0.6}
          speed={0.22}
          rotation={0.4}
          space={1}
          glossy={isDark ? 0.7 : 0.55}
          ao={0}
          sss={isDark ? 0.2 : 0.45}
          blur={0}
          lightAzimuth={30}
          lightElevation={55}
          skyTint={blobScene.skyTint}
          groundTint={blobScene.groundTint}
          bgTop={blobScene.bg}
          bgBottom={blobScene.bg}
          bgDepth={4}
          bgFuse={false}
          /* rendered tiny then blurred to a faint smudge — the CSS blur(44)
             hides the low resolution, so this cuts fragment work ~14x with
             zero visible change. AO off (invisible under the blur). */
          pixelRatio={0.4}
        />
      </div>

      {/* centered "click anywhere to start" prompt, fades in when ready.
          While loading, the faint torus field is the only indicator. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: ready ? 1 : 0,
          transition: `opacity ${EXIT_MS}ms ease`,
          pointerEvents: "none",
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: accent,
        }}
      >
        {startLabel}
      </div>

      {/* Progress + status column. The bar is the point of the whole gate: it
          is the only thing that tells the user the wait is bounded and moving.
          Mirrors the static shell's #boot-progress-bar (public/index.html) so
          the handoff at takeOver() is invisible. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          pointerEvents: "none",
          opacity: ready || showFailure ? 0 : 1,
          transition: `opacity ${EXIT_MS}ms ease`,
        }}
      >
        <div
          role="progressbar"
          /* A STABLE name, not the status copy: the accessible name of a
             progressbar should not churn every time the phase text changes. */
          aria-label={t("boot.progress_label")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.pct)}
          style={{
            width: 160,
            height: 3,
            borderRadius: 2,
            overflow: "hidden",
            backgroundColor: trackColor,
          }}
        >
          <div
            data-boot-bar
            style={{
              display: "block",
              height: "100%",
              width: `${state.pct}%`,
              borderRadius: 2,
              backgroundColor: accent,
              transition: "width 300ms ease",
            }}
          />
        </div>

        {/* Same typographic treatment as the start prompt so the screen reads
            as one thing, just muted. 0.75 rather than a fainter value: at 0.55
            this failed AA on 8 of 9 light presets (worst 3.08:1). */}
        <div
          aria-live="polite"
          style={{
            opacity: showStatus ? MUTED_OPACITY : 0,
            transition: `opacity ${EXIT_MS}ms ease`,
            fontSize: 12,
            fontWeight: 400,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: mutedText,
          }}
        >
          {/* Content is conditional, not just its opacity: a live region that
              already has text at mount is not announced by most screen readers,
              and announcing before the visual reveal would desync the two. */}
          {showStatus ? statusText : ""}
        </div>
      </div>

      {/* Failure state. Not terminal: main keeps observing, so a backend that
          recovers on its own clears this and opens the gate without a click.
          The retry is here for the case where it does not.
          Always mounted and cross-faded — the same 240ms language as its two
          sibling layers, so a self-heal dissolves instead of snapping away. */}
      <div
        role="alert"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: 32,
          textAlign: "center",
          opacity: showFailure ? 1 : 0,
          pointerEvents: showFailure ? "auto" : "none",
          transition: `opacity ${EXIT_MS}ms ease`,
        }}
      >
        {failure ? (
          <>
            <div
              style={{
                maxWidth: 420,
                fontSize: 13,
                lineHeight: 1.6,
                color: mutedText,
                opacity: MUTED_OPACITY,
              }}
            >
              {t(FAILURE_TEXT_KEY[failure.code] || "boot.failure.unknown")}
            </div>
            {/* Wrapper exists purely to reach the button's DOM node for focus:
                Button is a shared primitive that forwards neither arbitrary
                props nor refs, and this is not the change to start editing it.
                Deliberately NO aria-busy here — inside a role="alert" subtree it
                means "I am mutating, do not announce yet", which would suppress
                the very "Retrying" announcement it was meant to produce. The
                label change is announced by the live region on its own. */}
            <div ref={retryWrapRef}>
              <Button
                label={retrying ? t("boot.retrying") : t("boot.retry")}
                prefix={
                  retrying ? (
                    <ArcSpinner size={13} stroke_width={2} color={mutedText} />
                  ) : null
                }
                onClick={handleRetry}
                style={{
                  fontSize: 13,
                  paddingVertical: 7,
                  paddingHorizontal: 16,
                  borderRadius: 7,
                  root: {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.05)",
                  },
                  color: mutedText,
                  hoverBackgroundColor: isDark
                    ? "rgba(255,255,255,0.14)"
                    : "rgba(0,0,0,0.10)",
                  activeBackgroundColor: isDark
                    ? "rgba(255,255,255,0.20)"
                    : "rgba(0,0,0,0.14)",
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Non-mac has no native window controls, and the custom title bar is
          buried under this overlay — so if the backend never comes up the user
          cannot move or close the window. Only while gated: once ready the
          whole surface is the click-to-start target and must not be eaten. */}
      {!isMac && !ready ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 32,
            WebkitAppRegion: "drag",
          }}
        />
      ) : null}
    </div>
  );
};

export default BootOverlay;
