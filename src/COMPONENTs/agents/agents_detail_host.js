import { useContext } from "react";
import { NavigationContext } from "../../CONTAINERs/config/context";
import { Z } from "../../BUILTIN_COMPONENTs/layer/z_layers";

/**
 * The anchor for the Agents workspace's right-hand side menu (the node
 * detail panel). It covers the window on the left side menu's layer; the
 * panel inside starts below the title bar band on every platform and puts
 * its close button in that band, clear of any window buttons.
 *
 * Click-through itself: the panel rendered into it decides its own width and
 * takes the pointer. It spans the window and clips, so the panel slid out to
 * the right when closed cannot widen the page into a horizontal scroll.
 */
export default function AgentsDetailHost() {
  const nav = useContext(NavigationContext) || {};
  const { appMode, setAgentsDetailSlot } = nav;
  const active = appMode === "agents";
  return (
    <div
      ref={setAgentsDetailSlot}
      data-testid="agents-detail-host"
      aria-hidden={active ? undefined : true}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        zIndex: Z.APP_CHROME_TOP,
        pointerEvents: "none",
        visibility: active ? "visible" : "hidden",
      }}
    />
  );
}
