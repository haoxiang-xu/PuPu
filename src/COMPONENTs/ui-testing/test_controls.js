import { useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { TestDockContext } from "./test_dock_context";

/**
 * A runner wraps its quick controls in <TestControls>. Instead of drawing a
 * control bar inline, the controls are portaled into the shared draggable
 * ControlDock. Registration toggles dock visibility.
 */
export default function TestControls({ children }) {
  const ctx = useContext(TestDockContext);
  const register = ctx && ctx.registerControls;

  useEffect(() => {
    if (!register) return undefined;
    register(true);
    return () => register(false);
  }, [register]);

  if (!ctx || !ctx.dockEl) return null;
  return createPortal(children, ctx.dockEl);
}
