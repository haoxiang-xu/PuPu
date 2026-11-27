import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LocaleContext } from "../../../../../CONTAINERs/config/context";
import PathEditor from "./path_editor";

test("a refused index keeps its partial text, focus and original stored value while its explanation changes language", () => {
  const onChange = jest.fn();
  const path = Object.freeze([0, "agents.path.field"]);
  const tree = (locale) => <LocaleContext.Provider value={{ locale }}>
    <PathEditor path={path} testid="raw-path" onChange={onChange} />
  </LocaleContext.Provider>;
  const view = render(tree("en"));
  const input = within(screen.getByTestId("raw-path-step-0")).getByRole("textbox");
  fireEvent.change(input, { target: { value: "1.5" } });
  input.focus();
  input.setSelectionRange(1, 2);
  view.rerender(tree("zh-CN"));
  expect(within(screen.getByTestId("raw-path-step-0")).getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("1.5");
  expect(input).toHaveFocus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
  expect(screen.getByTestId("raw-path-step-0-refused")).toHaveTextContent("列表位置必须是大于或等于 0 的整数");
  expect(screen.getByTestId("raw-path-step-0-refused")).toHaveTextContent("第 1 步仍为 0");
  expect(within(screen.getByTestId("raw-path-step-1")).getByRole("textbox")).toHaveValue("agents.path.field");
  expect(onChange).not.toHaveBeenCalled();
  expect(path).toEqual([0, "agents.path.field"]);
});

test("translated path actions emit the same typed path only after an explicit click", () => {
  const onChange = jest.fn();
  const path = Object.freeze(["0", 2]);
  render(<LocaleContext.Provider value={{ locale: "zh-CN" }}><PathEditor path={path} testid="p" onChange={onChange} /></LocaleContext.Provider>);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "+ 添加步骤" }));
  expect(onChange).toHaveBeenCalledWith(["0", 2, ""]);
  expect(path).toEqual(["0", 2]);
});

test("a caller-supplied action caption is opaque and the empty-path explanation still translates", () => {
  const raw = "agents.path.add_step {step}";
  render(<LocaleContext.Provider value={{ locale: "zh-CN" }}><PathEditor path={[]} testid="p" addLabel={raw} onChange={jest.fn()} /></LocaleContext.Provider>);
  expect(screen.getByRole("button", { name: raw })).toBeInTheDocument();
  expect(screen.getByTestId("p-whole")).toHaveTextContent("原样导出整个值。");
});
