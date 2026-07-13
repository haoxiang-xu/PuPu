import {
  computeEffectiveViewportHeight,
  computeLandingTop,
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

  it("clamps effective viewport height at zero", () => {
    expect(computeEffectiveViewportHeight(24, 32)).toBe(0);
  });
});
