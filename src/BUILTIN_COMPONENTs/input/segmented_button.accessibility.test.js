import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigContext } from "../../CONTAINERs/config/context";
import SegmentedButton from "./segmented_button";

test("controlled empty selection offers native keyboard buttons without choosing for the author", async () => {
  const change = jest.fn();
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SegmentedButton options={[{ value: "a", label: "Value" }, { value: "b", label: "Variable" }]}
      value={null} on_change={change} />
  </ConfigContext.Provider>);
  const first = screen.getByRole("button", { name: "Value", pressed: false });
  expect(first).toHaveAttribute("type", "button");
  expect(change).not.toHaveBeenCalled();
  await userEvent.tab();
  expect(first).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith("a");
});

test("selection and disabled state are exposed by the builtin control", async () => {
  const change = jest.fn();
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
    <SegmentedButton options={[{ value: "a", label: "Value" }, { value: "b", label: "Variable" }]}
      value="b" disabled on_change={change} />
  </ConfigContext.Provider>);
  expect(screen.getByRole("button", { name: "Variable", pressed: true })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(change).not.toHaveBeenCalled();
});
