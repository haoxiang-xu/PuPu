import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Select } from "./select";

jest.mock("../icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src }) {
    return React.createElement("span", { "data-icon": src });
  };
});
jest.mock("../tooltip/tooltip", () => {
  const React = require("react");
  return function MockTooltip({ children, tooltip_component, open }) {
    return React.createElement(
      "div",
      null,
      children,
      open ? tooltip_component : null,
    );
  };
});

const GROUPS = (collapsed) => [
  { group: "OLLAMA", collapsed: collapsed.OLLAMA, options: [
    { value: "qwen", label: "qwen" }, { value: "gemma", label: "gemma" } ] },
  { group: "OPENAI", collapsed: collapsed.OPENAI, options: [
    { value: "gpt-5", label: "gpt-5" } ] },
  { group: "ANTHROPIC", collapsed: collapsed.ANTHROPIC, options: [
    { value: "fable", label: "fable" } ] },
];

const Host = () => {
  const [collapsed, setCollapsed] = useState({ OLLAMA: false, OPENAI: true, ANTHROPIC: true });
  return (
    <Select
      options={GROUPS(collapsed)}
      value="qwen"
      set_value={() => {}}
      filterable
      filter_mode="panel"
      open
      on_open_change={() => {}}
      on_group_toggle={(name) =>
        setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }))
      }
      variant="palette"
      palette_chip="model"
      palette_rail
    />
  );
};

test("rail keyboard: ArrowLeft then ArrowDown switches provider", () => {
  render(<Host />);
  const input = screen.getByPlaceholderText("Search...");
  const listbox = () => within(screen.getByRole("listbox"));
  expect(listbox().getByText("qwen")).toBeInTheDocument();

  fireEvent.keyDown(input, { key: "ArrowLeft" });
  fireEvent.keyDown(input, { key: "ArrowDown" });

  // expect OPENAI expanded now
  expect(listbox().queryByText("qwen")).not.toBeInTheDocument();
  expect(listbox().getByText("gpt-5")).toBeInTheDocument();
});
