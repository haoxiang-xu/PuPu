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

  test("left notch and right bump centre on the side, or on the port anchor", () => {
    const plain = render(
      wrap(
        <PuzzleShape tabs={["right"]} cutouts={["left"]} isDark={false}>
          <div />
        </PuzzleShape>,
      ),
    );
    expect(plain.container.querySelector("[data-tab-side=right]").style.top).toBe("50%");
    expect(plain.container.querySelector("[data-puzzle-body]").getAttribute("data-side-y")).toBe("50%");

    const anchored = render(
      wrap(
        <PuzzleShape tabs={["right"]} cutouts={["left"]} anchor={27} isDark={false}>
          <div />
        </PuzzleShape>,
      ),
    );
    expect(anchored.container.querySelector("[data-tab-side=right]").style.top).toBe("27px");
    expect(anchored.container.querySelector("[data-puzzle-body]").getAttribute("data-side-y")).toBe("27px");
  });
});
