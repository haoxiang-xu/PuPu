import React from "react";
import { render as rtlRender } from "@testing-library/react";
import SideMenuBreadcrumb from "../../side-menu/side_menu_breadcrumb";
import { drillTrailCrumbs, resetAgentsDrillTrail, useAgentsDrillTrail } from "../../../SERVICEs/agents_drill_trail";

/* Tests only. The drill path is drawn by the side menu's breadcrumb, which is
   not inside the Agents page; this mounts the real breadcrumb beside the page
   under test, fed by the same trail the side menu reads, so a test can see
   the path and click its way back up. */
/* A trail that goes away is held a moment (agents_drill_trail); one test's
   held trail must not reach the next. */
afterEach(() => resetAgentsDrillTrail());

export function DrillTrailView() {
  const trail = useAgentsDrillTrail();
  if (!trail) return null;
  return <SideMenuBreadcrumb crumbs={drillTrailCrumbs(trail)} isDark={false} />;
}

export const withDrillTrail = (ui) => (
  <>
    {ui}
    <DrillTrailView />
  </>
);

/* `render`, with the trail beside whatever is rendered — rerenders too. */
export function render(ui, options) {
  const result = rtlRender(withDrillTrail(ui), options);
  return { ...result, rerender: (next) => result.rerender(withDrillTrail(next)) };
}

/* The graphs on the trail a click goes back to: none means nothing is
   drilled. A crumb on its way out is no longer on it. */
export const drillTrailLinks = () =>
  Array.from(
    document.querySelectorAll(
      '[data-testid="side-menu-breadcrumb"] [data-phase]:not([data-phase="exit"]) button[data-testid^="side-menu-crumb-drill-"]:not([aria-disabled="true"])',
    ),
  );
