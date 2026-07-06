import { clampDockPos, DOCK_MARGIN } from "./dock_position";

describe("clampDockPos", () => {
  const bounds = { width: 900, height: 600 };
  const dockSize = { width: 200, height: 40 };

  test("returns null when pos is null", () => {
    expect(clampDockPos(null, bounds, dockSize)).toBeNull();
  });

  test("keeps an in-bounds position unchanged", () => {
    expect(clampDockPos({ x: 100, y: 100 }, bounds, dockSize)).toEqual({
      x: 100,
      y: 100,
    });
  });

  test("clamps to the top-left margin", () => {
    expect(clampDockPos({ x: -50, y: -50 }, bounds, dockSize)).toEqual({
      x: DOCK_MARGIN,
      y: DOCK_MARGIN,
    });
  });

  test("clamps to the bottom-right so the dock stays fully visible", () => {
    expect(clampDockPos({ x: 9999, y: 9999 }, bounds, dockSize)).toEqual({
      x: 900 - 200 - DOCK_MARGIN,
      y: 600 - 40 - DOCK_MARGIN,
    });
  });

  test("never returns a max below the margin when the dock is huge", () => {
    const huge = { width: 2000, height: 2000 };
    expect(clampDockPos({ x: 500, y: 500 }, bounds, huge)).toEqual({
      x: DOCK_MARGIN,
      y: DOCK_MARGIN,
    });
  });
});
