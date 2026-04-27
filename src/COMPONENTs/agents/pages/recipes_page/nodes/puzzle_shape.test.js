import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import PuzzleShape from "./puzzle_shape";

const config = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={config}>{ui}</ConfigContext.Provider>
);

describe("PuzzleShape", () => {
  test("renders body + right tab when tabs=[right]", () => {
    const { container } = render(
      wrap(
        <PuzzleShape tabs={["right"]} cutouts={[]} isDark={false}>
          <div>content</div>
        </PuzzleShape>,
      ),
    );
    expect(container.querySelector("[data-puzzle-body]")).toBeTruthy();
    expect(container.querySelectorAll("[data-puzzle-tab]").length).toBe(1);
  });

  test("applies goo filter on the shape layer", () => {
    const { container } = render(
      wrap(
        <PuzzleShape tabs={[]} cutouts={[]} isDark={false}>
          <div>content</div>
        </PuzzleShape>,
      ),
    );
    const shape = container.querySelector("[data-puzzle-shape]");
    expect(shape.style.filter).toContain("url(#flow-editor-goo)");
  });
});
