/* Width of the app's left side menu, in px. The side menu used to be a fixed
   320; it is now dragged at its inner edge and remembered in the `ui`
   settings namespace next to `side_menu_open`. Anything outside the limits
   (a hand-edited or stale record) is clamped on read. */

export const SIDE_MENU_WIDTH = Object.freeze({
  DEFAULT: 320,
  MIN: 240,
  MAX: 480,
});

export const clampSideMenuWidth = (width) => {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return SIDE_MENU_WIDTH.DEFAULT;
  }
  return Math.min(
    SIDE_MENU_WIDTH.MAX,
    Math.max(SIDE_MENU_WIDTH.MIN, Math.round(width)),
  );
};

export const readSideMenuWidth = (persistedSettings) =>
  clampSideMenuWidth(persistedSettings?.ui?.side_menu_width);

/* While the edge is dragged, the width moves through this CSS variable on
   the document root instead of React state: a state change re-rendered every
   ConfigContext consumer (the whole app) on each pointer move. State, and the
   saved setting, catch up once on release. */
export const SIDE_MENU_WIDTH_VAR = "--pupu-side-menu-width";

export const writeSideMenuWidthVar = (width) => {
  if (typeof document === "undefined" || !document.documentElement) return;
  document.documentElement.style.setProperty(
    SIDE_MENU_WIDTH_VAR,
    `${clampSideMenuWidth(width)}px`,
  );
};

/* The live width as a CSS length, falling back to the committed one. */
export const sideMenuWidthCss = (width) =>
  `var(${SIDE_MENU_WIDTH_VAR}, ${clampSideMenuWidth(width)}px)`;
