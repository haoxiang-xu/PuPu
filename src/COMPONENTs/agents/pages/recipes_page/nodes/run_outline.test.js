import React from "react";
import { render } from "@testing-library/react";
import RunOutline from "./run_outline";

const shape = { tabs: ["right"], cutouts: ["left"], anchor: 31.5 };
const draw = (line, extra = {}) => render(<RunOutline run={{ line, color: "var(--pupu-accent)" }} width={168} height={63} {...shape} isDark={false} {...extra} />);

test("running: a faint full outline and two halves that pass from the in-port to the out-port", () => {
  const { container } = draw("pass");
  const svg = container.querySelector("[data-run-outline=pass]");
  expect(svg).toBeTruthy();
  expect(svg.querySelectorAll("path").length).toBe(3);
  const halves = svg.querySelectorAll("[data-run-pass]");
  expect(halves.length).toBe(2);
  halves.forEach((half) => {
    expect(half.getAttribute("pathLength")).toBe("100");
    expect(half.style.animation).toMatch(/pupu-run-pass/);
    expect(half.style.stroke).toBe("var(--pupu-accent)");
    expect(half.style.filter).toBe("none");
  });
});

test("dark mode gives the passing light a small glow; light mode none", () => {
  const { container } = draw("pass", { isDark: true });
  expect(container.querySelector("[data-run-pass]").style.filter).toMatch(/drop-shadow/);
});

test("each line kind draws one path on the outline; no line, no drawing", () => {
  expect(draw("march").container.querySelector("path").style.animation).toMatch(/pupu-run-march/);
  expect(draw("solid").container.querySelector("path").style.strokeDasharray).toBe("");
  expect(draw("dotted").container.querySelector("path").style.strokeDasharray).toBe("1 4");
  expect(draw("dashed").container.querySelector("path").style.strokeDasharray).toBe("4 4");
  expect(draw(null).container.querySelector("svg")).toBeNull();
  expect(render(<RunOutline run={{ line: "solid", color: "red" }} width={0} height={0} {...shape} />).container.querySelector("svg")).toBeNull();
});
