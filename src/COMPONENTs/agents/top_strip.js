/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  top_strip                                                                     */
/*                                                                                */
/*  One horizontal centerline for every control along the top of the Agents       */
/*  modal — the list expand button on the left, the section switch in the middle, */
/*  the fullscreen / close / window controls on the right. Each of those lives in */
/*  a different component, and each used to hard-code its own `top`, so their      */
/*  centers drifted apart (2px normally, 28px once the macOS traffic lights moved */
/*  one of them down and not the others).                                          */
/*                                                                                */
/*  Controls position themselves as `top: center` plus translateY(-50%) rather    */
/*  than a measured offset, so alignment does not depend on any control's own      */
/*  height and survives later padding or icon-size changes.                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { useEffect, useState } from "react";
import usePresentationPlatform from "../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
import { TOP_BAR_HEIGHT } from "../../BUILTIN_COMPONENTs/electron/title_bar";

/**
 * Distance from the modal's top edge to the strip's centerline.
 *
 * Derived from the app's own title bar rather than picked: a fullscreen modal
 * covers the title bar and redraws the window controls itself, so any other
 * value makes those buttons jump as the modal enters or leaves fullscreen.
 */
export const TOP_STRIP_CENTER = TOP_BAR_HEIGHT / 2;

/**
 * Local stacking inside the Agents modal. The floating panels sit ABOVE the
 * section switch: a panel dragged wide should cover the switch, rather than the
 * switch floating over the panel it overlaps.
 */
export const AGENTS_MODAL_Z = Object.freeze({
  SECTION_SWITCH: 2,
  PANEL: 3,
  PANEL_CONTROL: 4,
  PANEL_MESSAGE: 5,
});

/** Left inset for the strip's leading control. */
export const TOP_STRIP_LEFT = 14;

/**
 * Where that leading control goes when it has to clear macOS's traffic
 * lights: a fullscreen modal covers the whole window and the lights float
 * over its top-left corner. Only this control collides with them, so the
 * strip keeps one centerline and steps sideways here — the same move the app
 * title bar makes with its own leading button.
 */
export const TOP_STRIP_LEFT_TRAFFIC_LIGHTS = 90;

/**
 * Geometry for the Agents modal's top strip: one centerline for every control,
 * and the left inset for the leading one. `fullscreen` is the modal's own
 * state, not the window's: only a fullscreen modal reaches under the traffic
 * lights, and only while the window itself is not maximized (a maximized
 * window draws them in its own title bar).
 */
export function useTopStripCenter(fullscreen) {
  /* The PRESENTED platform (#256), so the dev override previews the real
     spacing instead of the host's. */
  const isDarwin = usePresentationPlatform() === "darwin";
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);

  useEffect(() => {
    if (!windowStateBridge.isListenerAvailable()) return undefined;
    const cleanup = windowStateBridge.onWindowStateChange(({ isMaximized }) => {
      setWindowIsMaximized(Boolean(isMaximized));
    });
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const clearsTrafficLights =
    Boolean(fullscreen) && isDarwin && !windowIsMaximized;

  return {
    /* One centerline everywhere: the traffic lights sit in the corner, so
       dropping the whole strip to clear them moved controls that never
       collided with anything. */
    center: TOP_STRIP_CENTER,
    left: clearsTrafficLights
      ? TOP_STRIP_LEFT_TRAFFIC_LIGHTS
      : TOP_STRIP_LEFT,
    clearsTrafficLights,
    windowIsMaximized,
  };
}
