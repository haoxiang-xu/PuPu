import { lazy, Suspense, useContext, useRef } from "react";
import { NavigationContext } from "../../CONTAINERs/config/context";

const AgentsWorkspace = lazy(() => import("./agents_workspace"));

/**
 * Mounts the Agents workspace the first time the side menu drills into it,
 * then keeps it mounted: going back to the chat and in again returns to the
 * same agent, selection and viewport, the way a sidebar section would.
 */
export default function AgentsWorkspaceHost() {
  const { appMode } = useContext(NavigationContext) || {};
  const active = appMode === "agents";
  const visitedRef = useRef(false);
  if (active) visitedRef.current = true;
  if (!visitedRef.current) return null;
  return (
    <Suspense fallback={null}>
      <AgentsWorkspace active={active} />
    </Suspense>
  );
}
