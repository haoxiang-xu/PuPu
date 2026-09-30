import React from "react";
import { render } from "@testing-library/react";
import { UISVGs } from "./icon_manifest";

/**
 * The Linux window cluster draws three glyphs side by side on one row, so a
 * glyph that is not centred in its own 16-unit box reads as a misaligned
 * button however well the buttons themselves are positioned. Minimize used to
 * sit at y=11.25 and visibly hung below the square and the cross.
 */
describe("Linux window control glyphs", () => {
  const draw = (name) => {
    const Glyph = UISVGs[name];
    const { container } = render(<Glyph />);
    return container.querySelector("svg");
  };

  test("all three share the same viewBox", () => {
    ["linux_minimize_button", "linux_maximize_button", "linux_close_button"].forEach(
      (name) => expect(draw(name).getAttribute("viewBox")).toBe("0 0 16 16"),
    );
  });

  test("minimize's stroke sits on the centre line, like its siblings", () => {
    expect(draw("linux_minimize_button").querySelector("path").getAttribute("d")).toBe(
      "M4 8H12",
    );

    // maximize: a square spanning 4..12, centre 8
    const rect = draw("linux_maximize_button").querySelector("rect");
    expect(Number(rect.getAttribute("y")) + Number(rect.getAttribute("height")) / 2).toBe(8);

    // close: a cross spanning 4.25..11.75, centre 8
    expect(draw("linux_close_button").querySelector("path").getAttribute("d")).toBe(
      "M4.25 4.25L11.75 11.75M11.75 4.25L4.25 11.75",
    );
  });
});
