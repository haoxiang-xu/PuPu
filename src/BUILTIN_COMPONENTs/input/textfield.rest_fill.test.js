import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TextField from "./textfield";
import { ConfigContext } from "../../CONTAINERs/config/context";

const wrap = (node) => <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>{node}</ConfigContext.Provider>;
const parts = (container) => {
  const main = container.querySelector("textarea").closest("div[style*='overflow: hidden']");
  return { main, fill: main.querySelector("span[aria-hidden='true']") };
};

test("without restFill the ghost field still fills and drops its outline on hover", () => {
  const { container } = render(wrap(<TextField value="" set_value={() => {}} />));
  const { main, fill } = parts(container);
  fireEvent.mouseEnter(main);
  expect(fill.style.opacity).toBe("1");
  expect(main.style.border).toBe("1px solid transparent");
});

test("restFill paints the field and keeps it still under the pointer and in focus", () => {
  const { container } = render(wrap(
    <TextField value="" set_value={() => {}} style={{ restFill: "rgb(255, 255, 255)", restBorder: "1px solid rgb(1, 2, 3)" }} />,
  ));
  const { main, fill } = parts(container);
  expect(main.style.backgroundColor).toBe("rgb(255, 255, 255)");
  fireEvent.mouseEnter(main);
  expect(fill.style.opacity).toBe("0");
  expect(main.style.border).toBe("1px solid rgb(1, 2, 3)");
  fireEvent.focus(container.querySelector("textarea"));
  expect(fill.style.opacity).toBe("0");
  expect(main.style.border).toBe("1px solid rgb(1, 2, 3)");
  expect(main.style.backgroundColor).toBe("rgb(255, 255, 255)");
});

test("a padding in style insets the text only, never the field inside its own wrapper", () => {
  const { container } = render(wrap(
    <TextField value="x" set_value={() => {}} style={{ width: "100%", padding: 4, restFill: "rgb(255, 255, 255)" }} />,
  ));
  const wrapper = container.firstChild;
  const { main } = parts(container);
  /* On the wrapper too, a 100%-wide field ran past its cell by twice this. */
  expect(wrapper.style.padding).toBe("");
  expect(main.parentElement).toBe(wrapper);
  expect(container.querySelector("textarea").style.paddingLeft).toBe("4px");
});
