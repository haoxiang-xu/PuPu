import {
  SIDE_MENU_WIDTH,
  clampSideMenuWidth,
  readSideMenuWidth,
  sideMenuWidthCss,
  writeSideMenuWidthVar,
} from "./side_menu_width";

test("an absent or unusable record falls back to the old fixed width", () => {
  expect(readSideMenuWidth(null)).toBe(320);
  expect(readSideMenuWidth({ ui: {} })).toBe(320);
  expect(readSideMenuWidth({ ui: { side_menu_width: "wide" } })).toBe(320);
  expect(clampSideMenuWidth(NaN)).toBe(SIDE_MENU_WIDTH.DEFAULT);
});

test("a stored width is kept inside the limits", () => {
  expect(readSideMenuWidth({ ui: { side_menu_width: 360.4 } })).toBe(360);
  expect(clampSideMenuWidth(10)).toBe(SIDE_MENU_WIDTH.MIN);
  expect(clampSideMenuWidth(5000)).toBe(SIDE_MENU_WIDTH.MAX);
});

test("the live width is a CSS variable with the committed width as fallback", () => {
  expect(sideMenuWidthCss(360)).toBe("var(--pupu-side-menu-width, 360px)");
  expect(sideMenuWidthCss(9999)).toBe("var(--pupu-side-menu-width, 480px)");
  writeSideMenuWidthVar(100);
  expect(document.documentElement.style.getPropertyValue("--pupu-side-menu-width")).toBe("240px");
  document.documentElement.style.removeProperty("--pupu-side-menu-width");
});
