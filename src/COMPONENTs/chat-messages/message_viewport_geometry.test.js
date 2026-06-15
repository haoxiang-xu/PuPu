import {
  computeEffectiveViewportHeight,
  computeLandingTop,
  computeMinimapFrame,
  findCurrentMessageIndex,
} from "./message_viewport_geometry";

describe("message_viewport_geometry", () => {
  it("subtracts the bottom inset from center landing only", () => {
    expect(
      computeLandingTop({
        offsetTop: 1000,
        within: 150,
        align: "center",
        viewportHeight: 400,
        bottomInset: 32,
      }),
    ).toBe(966);

    expect(
      computeLandingTop({
        offsetTop: 1000,
        align: "top",
        viewportHeight: 400,
        bottomInset: 32,
      }),
    ).toBe(988);
  });

  it("never lets the minimap frame render outside the visible track", () => {
    const frame = computeMinimapFrame({
      absTop: 0,
      viewportHeight: 500,
      bottomInset: 0,
      scale: 1,
      mapHeight: 800,
      usable: 120,
      offset: 0,
      pad: 8,
      gap: 7,
    });

    expect(frame.viewportHeight).toBe(500);
    expect(frame.boxHeight).toBe(500);
    expect(frame.visualTop).toBe(0);
    expect(frame.visualHeight).toBe(136);
    expect(frame.styleTop).toBe(0);
  });

  it("finds the current message from absolute content coordinates", () => {
    expect(
      findCurrentMessageIndex({
        offsets: [0, 100, 260],
        total: 400,
        contentY: 88,
        epsilon: 16,
      }),
    ).toBe(1);

    expect(
      findCurrentMessageIndex({
        offsets: [0, 100, 260],
        total: 400,
        contentY: 999,
        epsilon: 16,
      }),
    ).toBe(2);
  });

  it("clamps effective viewport height at zero", () => {
    expect(computeEffectiveViewportHeight(24, 32)).toBe(0);
  });
});
